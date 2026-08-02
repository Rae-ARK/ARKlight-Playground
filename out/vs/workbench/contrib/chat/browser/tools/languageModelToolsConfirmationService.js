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
import { Codicon } from "../../../../../base/common/codicons.js";
import { Lazy } from "../../../../../base/common/lazy.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { LRUCache } from "../../../../../base/common/map.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IQuickInputService, QuickInputButtonLocation } from "../../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { ToolConfirmKind } from "../../common/chatService/chatService.js";
const RUN_WITHOUT_APPROVAL = localize("runWithoutApproval", "without approval");
const CONTINUE_WITHOUT_REVIEWING_RESULTS = localize("continueWithoutReviewingResults", "without reviewing result");
class GenericConfirmStore extends Disposable {
  constructor(_storageKey, _instantiationService) {
    super();
    this._storageKey = _storageKey;
    this._instantiationService = _instantiationService;
    this._memoryStore = /* @__PURE__ */ new Map();
    this._workspaceStore = new Lazy(() => this._register(this._instantiationService.createInstance(ToolConfirmStore, StorageScope.WORKSPACE, this._storageKey)));
    this._profileStore = new Lazy(() => this._register(this._instantiationService.createInstance(ToolConfirmStore, StorageScope.PROFILE, this._storageKey)));
  }
  setAutoConfirmation(id, scope, label, args) {
    this._workspaceStore.value.setAutoConfirm(id, void 0);
    this._profileStore.value.setAutoConfirm(id, void 0);
    this._memoryStore.delete(id);
    const entry = { confirmed: true, label, arguments: args };
    if (scope === "workspace") {
      this._workspaceStore.value.setAutoConfirm(id, entry);
    } else if (scope === "profile") {
      this._profileStore.value.setAutoConfirm(id, entry);
    } else if (scope === "session") {
      this._memoryStore.set(id, entry);
    }
  }
  getAutoConfirmation(id) {
    if (this._workspaceStore.value.getAutoConfirm(id)) {
      return "workspace";
    }
    if (this._profileStore.value.getAutoConfirm(id)) {
      return "profile";
    }
    if (this._memoryStore.has(id)) {
      return "session";
    }
    return "never";
  }
  getAutoConfirmationIn(id, scope) {
    if (scope === "workspace") {
      return !!this._workspaceStore.value.getAutoConfirm(id);
    } else if (scope === "profile") {
      return !!this._profileStore.value.getAutoConfirm(id);
    } else {
      return this._memoryStore.has(id);
    }
  }
  getLabel(id) {
    return this._workspaceStore.value.getAutoConfirm(id)?.label ?? this._profileStore.value.getAutoConfirm(id)?.label ?? this._memoryStore.get(id)?.label;
  }
  getArguments(id) {
    return this._workspaceStore.value.getAutoConfirm(id)?.arguments ?? this._profileStore.value.getAutoConfirm(id)?.arguments ?? this._memoryStore.get(id)?.arguments;
  }
  reset() {
    this._workspaceStore.value.reset();
    this._profileStore.value.reset();
    this._memoryStore.clear();
  }
  checkAutoConfirmation(id) {
    if (this._workspaceStore.value.getAutoConfirm(id)) {
      return { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" };
    }
    if (this._profileStore.value.getAutoConfirm(id)) {
      return { type: ToolConfirmKind.LmServicePerTool, scope: "profile" };
    }
    if (this._memoryStore.has(id)) {
      return { type: ToolConfirmKind.LmServicePerTool, scope: "session" };
    }
    return void 0;
  }
  getAllConfirmed() {
    const all = /* @__PURE__ */ new Set();
    for (const key of this._workspaceStore.value.getAll()) {
      all.add(key);
    }
    for (const key of this._profileStore.value.getAll()) {
      all.add(key);
    }
    for (const key of this._memoryStore.keys()) {
      all.add(key);
    }
    return all;
  }
}
let ToolConfirmStore = class extends Disposable {
  constructor(_scope, _storageKey, storageService) {
    super();
    this._scope = _scope;
    this._storageKey = _storageKey;
    this.storageService = storageService;
    this._autoConfirmTools = new LRUCache(100);
    this._didChange = false;
    const raw = storageService.get(this._storageKey, this._scope);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const key of parsed) {
            this._autoConfirmTools.set(key, { confirmed: true });
          }
        } else if (typeof parsed === "object" && parsed !== null) {
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "object" && value !== null) {
              const obj = value;
              this._autoConfirmTools.set(key, { confirmed: true, label: obj.label, arguments: obj.arguments });
            } else {
              this._autoConfirmTools.set(key, { confirmed: true, label: typeof value === "string" ? value : void 0 });
            }
          }
        }
      } catch {
      }
    }
    this._register(storageService.onWillSaveState(() => {
      if (this._didChange) {
        const data = {};
        for (const [key, entry] of this._autoConfirmTools) {
          if (entry.arguments) {
            data[key] = { label: entry.label, arguments: entry.arguments };
          } else {
            data[key] = entry.label ?? true;
          }
        }
        this.storageService.store(this._storageKey, JSON.stringify(data), this._scope, StorageTarget.MACHINE);
        this._didChange = false;
      }
    }));
  }
  reset() {
    this._autoConfirmTools.clear();
    this._didChange = true;
  }
  getAutoConfirm(id) {
    const entry = this._autoConfirmTools.get(id);
    if (entry) {
      this._didChange = true;
      return entry;
    }
    return void 0;
  }
  setAutoConfirm(id, entry) {
    if (!entry) {
      this._autoConfirmTools.delete(id);
    } else {
      this._autoConfirmTools.set(id, entry);
    }
    this._didChange = true;
  }
  getAll() {
    return [...this._autoConfirmTools.keys()];
  }
};
ToolConfirmStore = __decorateClass([
  __decorateParam(2, IStorageService)
], ToolConfirmStore);
let LanguageModelToolsConfirmationService = class extends Disposable {
  constructor(_instantiationService, _quickInputService, _dialogService) {
    super();
    this._instantiationService = _instantiationService;
    this._quickInputService = _quickInputService;
    this._dialogService = _dialogService;
    this._contributions = /* @__PURE__ */ new Map();
    this._preExecutionToolConfirmStore = this._register(new GenericConfirmStore("chat/autoconfirm", this._instantiationService));
    this._postExecutionToolConfirmStore = this._register(new GenericConfirmStore("chat/autoconfirm-post", this._instantiationService));
    this._preExecutionServerConfirmStore = this._register(new GenericConfirmStore("chat/servers/autoconfirm", this._instantiationService));
    this._postExecutionServerConfirmStore = this._register(new GenericConfirmStore("chat/servers/autoconfirm-post", this._instantiationService));
    this._combinationConfirmStore = this._register(new GenericConfirmStore("chat/autoconfirm-combination", this._instantiationService));
  }
  getPreConfirmAction(ref) {
    const contribution = this._contributions.get(ref.toolId);
    if (contribution?.getPreConfirmAction) {
      const result = contribution.getPreConfirmAction(ref);
      if (result) {
        return result;
      }
    }
    if (contribution && contribution.canUseDefaultApprovals === false) {
      return void 0;
    }
    if (ref.combination) {
      const combinationResult = this._combinationConfirmStore.checkAutoConfirmation(ref.combination.key);
      if (combinationResult) {
        return combinationResult;
      }
    }
    const toolResult = this._preExecutionToolConfirmStore.checkAutoConfirmation(ref.toolId);
    if (toolResult) {
      return toolResult;
    }
    if (ref.source.type === "mcp") {
      const serverResult = this._preExecutionServerConfirmStore.checkAutoConfirmation(ref.source.definitionId);
      if (serverResult) {
        return serverResult;
      }
    }
    return void 0;
  }
  getPostConfirmAction(ref) {
    const contribution = this._contributions.get(ref.toolId);
    if (contribution?.getPostConfirmAction) {
      const result = contribution.getPostConfirmAction(ref);
      if (result) {
        return result;
      }
    }
    if (contribution && contribution.canUseDefaultApprovals === false) {
      return void 0;
    }
    const toolResult = this._postExecutionToolConfirmStore.checkAutoConfirmation(ref.toolId);
    if (toolResult) {
      return toolResult;
    }
    if (ref.source.type === "mcp") {
      const serverResult = this._postExecutionServerConfirmStore.checkAutoConfirmation(ref.source.definitionId);
      if (serverResult) {
        return serverResult;
      }
    }
    return void 0;
  }
  getPreConfirmActions(ref) {
    const actions = [];
    const contribution = this._contributions.get(ref.toolId);
    if (contribution?.getPreConfirmActions) {
      actions.push(...contribution.getPreConfirmActions(ref));
    }
    if (contribution && contribution.canUseDefaultApprovals === false) {
      return actions;
    }
    if (ref.combination) {
      const { label: combinationLabel, key: combinationKey, arguments: combinationArgs } = ref.combination;
      actions.push(
        {
          label: localize("allowCombinationSession", "{0} in this Session", combinationLabel),
          detail: localize("allowCombinationSessionTooltip", "Allow this particular combination of tool and arguments in this session without confirmation."),
          divider: !!actions.length,
          scope: "session",
          select: async () => {
            this._combinationConfirmStore.setAutoConfirmation(combinationKey, "session", combinationLabel, combinationArgs);
            return true;
          }
        },
        {
          label: localize("allowCombinationWorkspace", "{0} in this Workspace", combinationLabel),
          detail: localize("allowCombinationWorkspaceTooltip", "Allow this particular combination of tool and arguments in this workspace without confirmation."),
          scope: "workspace",
          select: async () => {
            this._combinationConfirmStore.setAutoConfirmation(combinationKey, "workspace", combinationLabel, combinationArgs);
            return true;
          }
        },
        {
          label: localize("allowCombinationGlobally", "Always {0}", combinationLabel),
          detail: localize("allowCombinationGloballyTooltip", "Always allow this particular combination of tool and arguments without confirmation."),
          scope: "profile",
          select: async () => {
            this._combinationConfirmStore.setAutoConfirmation(combinationKey, "profile", combinationLabel, combinationArgs);
            return true;
          }
        }
      );
    }
    actions.push(
      {
        label: localize("allowSession", "Allow in this Session"),
        detail: localize("allowSessionTooltip", "Allow this tool to run in this session without confirmation."),
        divider: !!actions.length,
        scope: "session",
        select: async () => {
          this._preExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, "session");
          return true;
        }
      },
      {
        label: localize("allowWorkspace", "Allow in this Workspace"),
        detail: localize("allowWorkspaceTooltip", "Allow this tool to run in this workspace without confirmation."),
        scope: "workspace",
        select: async () => {
          this._preExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, "workspace");
          return true;
        }
      },
      {
        label: localize("allowGlobally", "Always Allow"),
        detail: localize("allowGloballyTooltip", "Always allow this tool to run without confirmation."),
        scope: "profile",
        select: async () => {
          this._preExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, "profile");
          return true;
        }
      }
    );
    if (ref.source.type === "mcp") {
      const { serverLabel, definitionId } = ref.source;
      actions.push(
        {
          label: localize("allowServerSession", "Allow Tools from {0} in this Session", serverLabel),
          detail: localize("allowServerSessionTooltip", "Allow all tools from this server to run in this session without confirmation."),
          divider: true,
          scope: "session",
          select: async () => {
            this._preExecutionServerConfirmStore.setAutoConfirmation(definitionId, "session");
            return true;
          }
        },
        {
          label: localize("allowServerWorkspace", "Allow Tools from {0} in this Workspace", serverLabel),
          detail: localize("allowServerWorkspaceTooltip", "Allow all tools from this server to run in this workspace without confirmation."),
          scope: "workspace",
          select: async () => {
            this._preExecutionServerConfirmStore.setAutoConfirmation(definitionId, "workspace");
            return true;
          }
        },
        {
          label: localize("allowServerGlobally", "Always Allow Tools from {0}", serverLabel),
          detail: localize("allowServerGloballyTooltip", "Always allow all tools from this server to run without confirmation."),
          scope: "profile",
          select: async () => {
            this._preExecutionServerConfirmStore.setAutoConfirmation(definitionId, "profile");
            return true;
          }
        }
      );
    }
    return actions;
  }
  getPostConfirmActions(ref) {
    const actions = [];
    const contribution = this._contributions.get(ref.toolId);
    if (contribution?.getPostConfirmActions) {
      actions.push(...contribution.getPostConfirmActions(ref));
    }
    if (contribution && contribution.canUseDefaultApprovals === false) {
      return actions;
    }
    actions.push(
      {
        label: localize("allowSessionPost", "Allow Without Review in this Session"),
        detail: localize("allowSessionPostTooltip", "Allow results from this tool to be sent without confirmation in this session."),
        divider: !!actions.length,
        scope: "session",
        select: async () => {
          this._postExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, "session");
          return true;
        }
      },
      {
        label: localize("allowWorkspacePost", "Allow Without Review in this Workspace"),
        detail: localize("allowWorkspacePostTooltip", "Allow results from this tool to be sent without confirmation in this workspace."),
        scope: "workspace",
        select: async () => {
          this._postExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, "workspace");
          return true;
        }
      },
      {
        label: localize("allowGloballyPost", "Always Allow Without Review"),
        detail: localize("allowGloballyPostTooltip", "Always allow results from this tool to be sent without confirmation."),
        scope: "profile",
        select: async () => {
          this._postExecutionToolConfirmStore.setAutoConfirmation(ref.toolId, "profile");
          return true;
        }
      }
    );
    if (ref.source.type === "mcp") {
      const { serverLabel, definitionId } = ref.source;
      actions.push(
        {
          label: localize("allowServerSessionPost", "Allow Tools from {0} Without Review in this Session", serverLabel),
          detail: localize("allowServerSessionPostTooltip", "Allow results from all tools from this server to be sent without confirmation in this session."),
          divider: true,
          scope: "session",
          select: async () => {
            this._postExecutionServerConfirmStore.setAutoConfirmation(definitionId, "session");
            return true;
          }
        },
        {
          label: localize("allowServerWorkspacePost", "Allow Tools from {0} Without Review in this Workspace", serverLabel),
          detail: localize("allowServerWorkspacePostTooltip", "Allow results from all tools from this server to be sent without confirmation in this workspace."),
          scope: "workspace",
          select: async () => {
            this._postExecutionServerConfirmStore.setAutoConfirmation(definitionId, "workspace");
            return true;
          }
        },
        {
          label: localize("allowServerGloballyPost", "Always Allow Tools from {0} Without Review", serverLabel),
          detail: localize("allowServerGloballyPostTooltip", "Always allow results from all tools from this server to be sent without confirmation."),
          scope: "profile",
          select: async () => {
            this._postExecutionServerConfirmStore.setAutoConfirmation(definitionId, "profile");
            return true;
          }
        }
      );
    }
    return actions;
  }
  registerConfirmationContribution(toolName, contribution) {
    this._contributions.set(toolName, contribution);
    return {
      dispose: () => {
        this._contributions.delete(toolName);
      }
    };
  }
  toolCanManageConfirmation(tool) {
    return !!tool.canRequestPreApproval || !!tool.canRequestPostApproval || this._contributions.has(tool.id) || !!this._preExecutionToolConfirmStore.checkAutoConfirmation(tool.id) || !!this._postExecutionToolConfirmStore.checkAutoConfirmation(tool.id) || this._hasCombinationApprovalsForTool(tool.id);
  }
  _hasCombinationApprovalsForTool(toolId) {
    const prefix = toolId + ":combination:";
    for (const key of this._combinationConfirmStore.getAllConfirmed()) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }
  _getCombinationApprovalsForTool(toolId, scope) {
    const prefix = toolId + ":combination:";
    const results = [];
    for (const key of this._combinationConfirmStore.getAllConfirmed()) {
      if (key.startsWith(prefix) && this._combinationConfirmStore.getAutoConfirmationIn(key, scope)) {
        const label = this._combinationConfirmStore.getLabel(key) ?? key;
        const args = this._combinationConfirmStore.getArguments(key);
        results.push({ key, label, arguments: args });
      }
    }
    return results;
  }
  manageConfirmationPreferences(tools, options) {
    const viewArgsButton = {
      iconClass: ThemeIcon.asClassName(Codicon.info),
      tooltip: localize("viewCombinationArguments", "View Arguments")
    };
    const trackServerTool = (serverId, label, toolId, serversWithTools2) => {
      if (!serversWithTools2.has(serverId)) {
        serversWithTools2.set(serverId, { label, tools: /* @__PURE__ */ new Set() });
      }
      serversWithTools2.get(serverId).tools.add(toolId);
    };
    const addServerToolFromSource = (source, toolId, serversWithTools2) => {
      if (source.type === "mcp") {
        trackServerTool(source.definitionId, source.serverLabel || source.label, toolId, serversWithTools2);
      } else if (source.type === "extension") {
        trackServerTool(source.extensionId.value, source.label, toolId, serversWithTools2);
      }
    };
    const relevantTools = /* @__PURE__ */ new Set();
    const serversWithTools = /* @__PURE__ */ new Map();
    for (const tool of tools) {
      if (tool.canRequestPreApproval || tool.canRequestPostApproval || this._contributions.has(tool.id)) {
        relevantTools.add(tool.id);
        addServerToolFromSource(tool.source, tool.id, serversWithTools);
      }
    }
    for (const id of this._preExecutionToolConfirmStore.getAllConfirmed()) {
      if (!relevantTools.has(id)) {
        const tool = tools.find((t) => t.id === id);
        if (tool) {
          relevantTools.add(id);
          addServerToolFromSource(tool.source, id, serversWithTools);
        }
      }
    }
    for (const id of this._postExecutionToolConfirmStore.getAllConfirmed()) {
      if (!relevantTools.has(id)) {
        const tool = tools.find((t) => t.id === id);
        if (tool) {
          relevantTools.add(id);
          addServerToolFromSource(tool.source, id, serversWithTools);
        }
      }
    }
    for (const tool of tools) {
      if (!relevantTools.has(tool.id) && this._hasCombinationApprovalsForTool(tool.id)) {
        relevantTools.add(tool.id);
        addServerToolFromSource(tool.source, tool.id, serversWithTools);
      }
    }
    if (relevantTools.size === 0) {
      return;
    }
    let currentScope = options?.defaultScope ?? "workspace";
    const buildTreeItems = () => {
      const treeItems = [];
      for (const [serverId, serverInfo] of serversWithTools) {
        const serverChildren = [];
        const hasAnyPre = Array.from(serverInfo.tools).some((toolId) => {
          const tool = tools.find((t) => t.id === toolId);
          return tool?.canRequestPreApproval;
        });
        const hasAnyPost = Array.from(serverInfo.tools).some((toolId) => {
          const tool = tools.find((t) => t.id === toolId);
          return tool?.canRequestPostApproval;
        });
        const serverPreConfirmed = this._preExecutionServerConfirmStore.getAutoConfirmationIn(serverId, currentScope);
        const serverPostConfirmed = this._postExecutionServerConfirmStore.getAutoConfirmationIn(serverId, currentScope);
        for (const toolId of serverInfo.tools) {
          const tool = tools.find((t) => t.id === toolId);
          if (!tool) {
            continue;
          }
          const toolChildren = [];
          const hasPre = !serverPreConfirmed && (tool.canRequestPreApproval || this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope));
          const hasPost = !serverPostConfirmed && (tool.canRequestPostApproval || this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope));
          if (hasPre && hasPost) {
            toolChildren.push({
              type: "tool-pre",
              toolId: tool.id,
              label: RUN_WITHOUT_APPROVAL,
              checked: this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope)
            });
            toolChildren.push({
              type: "tool-post",
              toolId: tool.id,
              label: CONTINUE_WITHOUT_REVIEWING_RESULTS,
              checked: this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope)
            });
          }
          const combinationApprovals = this._getCombinationApprovalsForTool(tool.id, currentScope);
          for (const { key, label, arguments: args } of combinationApprovals) {
            toolChildren.push({
              type: "combination",
              toolId: tool.id,
              combinationKey: key,
              combinationArgs: args,
              label,
              checked: true,
              buttons: args ? [viewArgsButton] : void 0
            });
          }
          const preApproval = this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
          const postApproval = this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
          let checked;
          let description;
          if (hasPre && hasPost) {
            checked = preApproval && postApproval ? true : !preApproval && !postApproval ? false : "mixed";
          } else if (hasPre) {
            checked = preApproval;
            description = RUN_WITHOUT_APPROVAL;
          } else if (hasPost) {
            checked = postApproval;
            description = CONTINUE_WITHOUT_REVIEWING_RESULTS;
          } else if (toolChildren.length > 0) {
            checked = false;
          } else {
            continue;
          }
          if (checked === false && toolChildren.length === 0 && !tool.canRequestPreApproval && !tool.canRequestPostApproval) {
            continue;
          }
          serverChildren.push({
            type: "tool",
            toolId: tool.id,
            label: tool.displayName || tool.id,
            description,
            checked,
            collapsed: true,
            children: toolChildren.length > 0 ? toolChildren : void 0
          });
        }
        serverChildren.sort((a, b) => a.label.localeCompare(b.label));
        if (hasAnyPost) {
          serverChildren.unshift({
            type: "server-post",
            serverId,
            iconClass: ThemeIcon.asClassName(Codicon.play),
            label: localize("continueWithoutReviewing", "Continue without reviewing any tool results"),
            checked: serverPostConfirmed
          });
        }
        if (hasAnyPre) {
          serverChildren.unshift({
            type: "server-pre",
            serverId,
            iconClass: ThemeIcon.asClassName(Codicon.play),
            label: localize("runToolsWithoutApproval", "Run any tool without approval"),
            checked: serverPreConfirmed
          });
        }
        const serverHasPre = this._preExecutionServerConfirmStore.getAutoConfirmationIn(serverId, currentScope);
        const serverHasPost = this._postExecutionServerConfirmStore.getAutoConfirmationIn(serverId, currentScope);
        let serverChecked;
        if (hasAnyPre && hasAnyPost) {
          serverChecked = serverHasPre && serverHasPost ? true : !serverHasPre && !serverHasPost ? false : "mixed";
        } else if (hasAnyPre) {
          serverChecked = serverHasPre;
        } else if (hasAnyPost) {
          serverChecked = serverHasPost;
        } else {
          serverChecked = false;
        }
        const existingItem = quickTree.itemTree.find((i) => i.serverId === serverId);
        treeItems.push({
          type: "server",
          serverId,
          label: serverInfo.label,
          checked: serverChecked,
          children: serverChildren,
          collapsed: existingItem ? quickTree.isCollapsed(existingItem) : true,
          pickable: false
        });
      }
      const sortedTools = tools.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
      for (const tool of sortedTools) {
        if (!relevantTools.has(tool.id)) {
          continue;
        }
        if (tool.source.type === "mcp" || tool.source.type === "extension") {
          continue;
        }
        const contributed = this._contributions.get(tool.id);
        const toolChildren = [];
        const manageActions = contributed?.getManageActions?.();
        if (manageActions) {
          toolChildren.push(...manageActions.map((action) => ({
            type: "manage",
            ...action
          })));
        }
        let checked = false;
        let description;
        let pickable = false;
        if (contributed?.canUseDefaultApprovals !== false) {
          pickable = true;
          const hasPre = tool.canRequestPreApproval || this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
          const hasPost = tool.canRequestPostApproval || this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
          if (hasPre && hasPost) {
            toolChildren.push({
              type: "tool-pre",
              toolId: tool.id,
              label: RUN_WITHOUT_APPROVAL,
              checked: this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope)
            });
            toolChildren.push({
              type: "tool-post",
              toolId: tool.id,
              label: CONTINUE_WITHOUT_REVIEWING_RESULTS,
              checked: this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope)
            });
          }
          const combinationApprovals = this._getCombinationApprovalsForTool(tool.id, currentScope);
          for (const { key, label, arguments: args } of combinationApprovals) {
            toolChildren.push({
              type: "combination",
              toolId: tool.id,
              combinationKey: key,
              combinationArgs: args,
              label,
              checked: true,
              buttons: args ? [viewArgsButton] : void 0
            });
          }
          const preApproval = this._preExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
          const postApproval = this._postExecutionToolConfirmStore.getAutoConfirmationIn(tool.id, currentScope);
          if (hasPre && hasPost) {
            checked = preApproval && postApproval ? true : !preApproval && !postApproval ? false : "mixed";
          } else if (hasPre) {
            checked = preApproval;
            description = RUN_WITHOUT_APPROVAL;
          } else if (hasPost) {
            checked = postApproval;
            description = CONTINUE_WITHOUT_REVIEWING_RESULTS;
          } else {
            checked = false;
          }
        }
        if (checked === false && toolChildren.length === 0 && !tool.canRequestPreApproval && !tool.canRequestPostApproval && !this._contributions.has(tool.id)) {
          continue;
        }
        treeItems.push({
          type: "tool",
          toolId: tool.id,
          label: tool.displayName || tool.id,
          description,
          checked,
          pickable,
          collapsed: tools.length > 1,
          children: toolChildren.length > 0 ? toolChildren : void 0
        });
      }
      return treeItems;
    };
    const disposables = new DisposableStore();
    const quickTree = disposables.add(this._quickInputService.createQuickTree());
    quickTree.ignoreFocusOut = true;
    quickTree.sortByLabel = false;
    if (currentScope !== "session") {
      const scopeButton = {
        iconClass: ThemeIcon.asClassName(Codicon.folder),
        tooltip: localize("workspaceScope", "Configure for this workspace only"),
        toggle: { checked: currentScope === "workspace" },
        location: QuickInputButtonLocation.Input
      };
      quickTree.buttons = [scopeButton];
      disposables.add(quickTree.onDidTriggerButton((button) => {
        if (button === scopeButton) {
          currentScope = currentScope === "workspace" ? "profile" : "workspace";
          updatePlaceholder();
          quickTree.setItemTree(buildTreeItems());
        }
      }));
    }
    const updatePlaceholder = () => {
      if (currentScope === "session") {
        quickTree.placeholder = localize("configureSessionToolApprovals", "Configure session tool approvals");
      } else {
        quickTree.placeholder = currentScope === "workspace" ? localize("configureWorkspaceToolApprovals", "Configure workspace tool approvals") : localize("configureGlobalToolApprovals", "Configure global tool approvals");
      }
    };
    updatePlaceholder();
    quickTree.setItemTree(buildTreeItems());
    disposables.add(quickTree.onDidChangeCheckboxState((item) => {
      const newState = item.checked ? currentScope : "never";
      if (item.type === "server" && item.serverId) {
        const serverInfo = serversWithTools.get(item.serverId);
        if (serverInfo) {
          this._preExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
          this._postExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
        }
      } else if (item.type === "tool" && item.toolId) {
        const tool = tools.find((t) => t.id === item.toolId);
        if (tool?.canRequestPostApproval || newState === "never") {
          this._postExecutionToolConfirmStore.setAutoConfirmation(item.toolId, newState);
        }
        if (tool?.canRequestPreApproval || newState === "never") {
          this._preExecutionToolConfirmStore.setAutoConfirmation(item.toolId, newState);
        }
        if (newState === "never") {
          for (const key of this._combinationConfirmStore.getAllConfirmed()) {
            if (key.startsWith(item.toolId + ":combination:")) {
              this._combinationConfirmStore.setAutoConfirmation(key, "never");
            }
          }
        }
        quickTree.setItemTree(buildTreeItems());
      } else if (item.type === "tool-pre" && item.toolId) {
        this._preExecutionToolConfirmStore.setAutoConfirmation(item.toolId, newState);
      } else if (item.type === "tool-post" && item.toolId) {
        this._postExecutionToolConfirmStore.setAutoConfirmation(item.toolId, newState);
      } else if (item.type === "server-pre" && item.serverId) {
        this._preExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
        quickTree.setItemTree(buildTreeItems());
      } else if (item.type === "server-post" && item.serverId) {
        this._postExecutionServerConfirmStore.setAutoConfirmation(item.serverId, newState);
        quickTree.setItemTree(buildTreeItems());
      } else if (item.type === "manage") {
        item.onDidChangeChecked?.(!!item.checked);
      } else if (item.type === "combination" && item.combinationKey) {
        this._combinationConfirmStore.setAutoConfirmation(item.combinationKey, newState, item.label, item.combinationArgs);
        quickTree.setItemTree(buildTreeItems());
      }
    }));
    disposables.add(quickTree.onDidTriggerItemButton((i) => {
      if (i.item.type === "manage") {
        i.item.onDidTriggerItemButton?.(i.button);
      } else if (i.item.type === "combination" && i.button === viewArgsButton && i.item.combinationArgs) {
        this._dialogService.prompt({
          message: localize("combinationArguments", "Arguments"),
          buttons: [],
          custom: {
            markdownDetails: [{
              markdown: new MarkdownString().appendCodeblock("json", i.item.combinationArgs)
            }]
          }
        });
      }
    }));
    disposables.add(quickTree.onDidAccept(async () => {
      const manageItem = quickTree.activeItems.find((i) => i.type === "manage");
      if (manageItem) {
        quickTree.hide();
        await manageItem.onDidOpen?.();
        this.manageConfirmationPreferences(tools, options);
      } else {
        quickTree.hide();
      }
    }));
    disposables.add(quickTree.onDidHide(() => {
      disposables.dispose();
    }));
    quickTree.show();
    if (options?.focusToolId) {
      const focusToolId = options.focusToolId;
      for (const serverItem of quickTree.itemTree) {
        const serverItemTyped = serverItem;
        if (serverItemTyped.children) {
          const toolItem = serverItemTyped.children.find((c) => c.type === "tool" && c.toolId === focusToolId);
          if (toolItem) {
            quickTree.expand(serverItem);
            quickTree.reveal(toolItem);
            break;
          }
        }
      }
    }
  }
  resetToolAutoConfirmation() {
    this._preExecutionToolConfirmStore.reset();
    this._postExecutionToolConfirmStore.reset();
    this._preExecutionServerConfirmStore.reset();
    this._postExecutionServerConfirmStore.reset();
    this._combinationConfirmStore.reset();
    for (const contribution of this._contributions.values()) {
      contribution.reset?.();
    }
  }
};
LanguageModelToolsConfirmationService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, IDialogService)
], LanguageModelToolsConfirmationService);
export {
  LanguageModelToolsConfirmationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTFJVQ2FjaGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dEJ1dHRvbiwgSVF1aWNrSW5wdXRCdXR0b25XaXRoVG9nZ2xlLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1RyZWVJdGVtLCBRdWlja0lucHV0QnV0dG9uTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgQ29uZmlybWVkUmVhc29uLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQWN0aW9ucywgSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uLCBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25Db250cmlidXRpb25RdWlja1RyZWVJdGVtLCBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25SZWYsIElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRvb2xEYXRhLCBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcblxuY29uc3QgUlVOX1dJVEhPVVRfQVBQUk9WQUwgPSBsb2NhbGl6ZSgncnVuV2l0aG91dEFwcHJvdmFsJywgXCJ3aXRob3V0IGFwcHJvdmFsXCIpO1xuY29uc3QgQ09OVElOVUVfV0lUSE9VVF9SRVZJRVdJTkdfUkVTVUxUUyA9IGxvY2FsaXplKCdjb250aW51ZVdpdGhvdXRSZXZpZXdpbmdSZXN1bHRzJywgXCJ3aXRob3V0IHJldmlld2luZyByZXN1bHRcIik7XG5cbi8qKlxuICogUmVwcmVzZW50cyBhbiBhdXRvLWNvbmZpcm1hdGlvbiBlbnRyeSBpbiB0aGUgY29uZmlybSBzdG9yZS5cbiAqIFdoZW4gYGNvbmZpcm1lZGAgaXMgdHJ1ZSwgdGhlIHRvb2wvY29tYmluYXRpb24gaXMgYXV0by1jb25maXJtZWQuXG4gKiBXaGVuIGBsYWJlbGAgaXMgc2V0LCBpdCBwcm92aWRlcyBhIGh1bWFuLXJlYWRhYmxlIGRlc2NyaXB0aW9uXG4gKiBmb3IgZGlzcGxheSBpbiB0aGUgbWFuYWdlbWVudCBVSS5cbiAqL1xuaW50ZXJmYWNlIElBdXRvQ29uZmlybUVudHJ5IHtcblx0cmVhZG9ubHkgY29uZmlybWVkOiB0cnVlO1xuXHRyZWFkb25seSBsYWJlbD86IHN0cmluZztcblx0cmVhZG9ubHkgYXJndW1lbnRzPzogc3RyaW5nO1xufVxuXG5cbmNsYXNzIEdlbmVyaWNDb25maXJtU3RvcmUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfd29ya3NwYWNlU3RvcmU6IExhenk8VG9vbENvbmZpcm1TdG9yZT47XG5cdHByaXZhdGUgX3Byb2ZpbGVTdG9yZTogTGF6eTxUb29sQ29uZmlybVN0b3JlPjtcblx0cHJpdmF0ZSBfbWVtb3J5U3RvcmUgPSBuZXcgTWFwPHN0cmluZywgSUF1dG9Db25maXJtRW50cnk+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZUtleTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fd29ya3NwYWNlU3RvcmUgPSBuZXcgTGF6eSgoKSA9PiB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUb29sQ29uZmlybVN0b3JlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCB0aGlzLl9zdG9yYWdlS2V5KSkpO1xuXHRcdHRoaXMuX3Byb2ZpbGVTdG9yZSA9IG5ldyBMYXp5KCgpID0+IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRvb2xDb25maXJtU3RvcmUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB0aGlzLl9zdG9yYWdlS2V5KSkpO1xuXHR9XG5cblx0cHVibGljIHNldEF1dG9Db25maXJtYXRpb24oaWQ6IHN0cmluZywgc2NvcGU6ICd3b3Jrc3BhY2UnIHwgJ3Byb2ZpbGUnIHwgJ3Nlc3Npb24nIHwgJ25ldmVyJywgbGFiZWw/OiBzdHJpbmcsIGFyZ3M/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyBDbGVhciBmcm9tIGFsbCBzY29wZXMgZmlyc3Rcblx0XHR0aGlzLl93b3Jrc3BhY2VTdG9yZS52YWx1ZS5zZXRBdXRvQ29uZmlybShpZCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9wcm9maWxlU3RvcmUudmFsdWUuc2V0QXV0b0NvbmZpcm0oaWQsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fbWVtb3J5U3RvcmUuZGVsZXRlKGlkKTtcblxuXHRcdGNvbnN0IGVudHJ5OiBJQXV0b0NvbmZpcm1FbnRyeSA9IHsgY29uZmlybWVkOiB0cnVlLCBsYWJlbCwgYXJndW1lbnRzOiBhcmdzIH07XG5cdFx0Ly8gU2V0IGluIHRoZSBhcHByb3ByaWF0ZSBzY29wZVxuXHRcdGlmIChzY29wZSA9PT0gJ3dvcmtzcGFjZScpIHtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZVN0b3JlLnZhbHVlLnNldEF1dG9Db25maXJtKGlkLCBlbnRyeSk7XG5cdFx0fSBlbHNlIGlmIChzY29wZSA9PT0gJ3Byb2ZpbGUnKSB7XG5cdFx0XHR0aGlzLl9wcm9maWxlU3RvcmUudmFsdWUuc2V0QXV0b0NvbmZpcm0oaWQsIGVudHJ5KTtcblx0XHR9IGVsc2UgaWYgKHNjb3BlID09PSAnc2Vzc2lvbicpIHtcblx0XHRcdHRoaXMuX21lbW9yeVN0b3JlLnNldChpZCwgZW50cnkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRBdXRvQ29uZmlybWF0aW9uKGlkOiBzdHJpbmcpOiAnd29ya3NwYWNlJyB8ICdwcm9maWxlJyB8ICdzZXNzaW9uJyB8ICduZXZlcicge1xuXHRcdGlmICh0aGlzLl93b3Jrc3BhY2VTdG9yZS52YWx1ZS5nZXRBdXRvQ29uZmlybShpZCkpIHtcblx0XHRcdHJldHVybiAnd29ya3NwYWNlJztcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3Byb2ZpbGVTdG9yZS52YWx1ZS5nZXRBdXRvQ29uZmlybShpZCkpIHtcblx0XHRcdHJldHVybiAncHJvZmlsZSc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9tZW1vcnlTdG9yZS5oYXMoaWQpKSB7XG5cdFx0XHRyZXR1cm4gJ3Nlc3Npb24nO1xuXHRcdH1cblx0XHRyZXR1cm4gJ25ldmVyJztcblx0fVxuXG5cdHB1YmxpYyBnZXRBdXRvQ29uZmlybWF0aW9uSW4oaWQ6IHN0cmluZywgc2NvcGU6ICd3b3Jrc3BhY2UnIHwgJ3Byb2ZpbGUnIHwgJ3Nlc3Npb24nKTogYm9vbGVhbiB7XG5cdFx0aWYgKHNjb3BlID09PSAnd29ya3NwYWNlJykge1xuXHRcdFx0cmV0dXJuICEhdGhpcy5fd29ya3NwYWNlU3RvcmUudmFsdWUuZ2V0QXV0b0NvbmZpcm0oaWQpO1xuXHRcdH0gZWxzZSBpZiAoc2NvcGUgPT09ICdwcm9maWxlJykge1xuXHRcdFx0cmV0dXJuICEhdGhpcy5fcHJvZmlsZVN0b3JlLnZhbHVlLmdldEF1dG9Db25maXJtKGlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21lbW9yeVN0b3JlLmhhcyhpZCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldExhYmVsKGlkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VTdG9yZS52YWx1ZS5nZXRBdXRvQ29uZmlybShpZCk/LmxhYmVsXG5cdFx0XHQ/PyB0aGlzLl9wcm9maWxlU3RvcmUudmFsdWUuZ2V0QXV0b0NvbmZpcm0oaWQpPy5sYWJlbFxuXHRcdFx0Pz8gdGhpcy5fbWVtb3J5U3RvcmUuZ2V0KGlkKT8ubGFiZWw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QXJndW1lbnRzKGlkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VTdG9yZS52YWx1ZS5nZXRBdXRvQ29uZmlybShpZCk/LmFyZ3VtZW50c1xuXHRcdFx0Pz8gdGhpcy5fcHJvZmlsZVN0b3JlLnZhbHVlLmdldEF1dG9Db25maXJtKGlkKT8uYXJndW1lbnRzXG5cdFx0XHQ/PyB0aGlzLl9tZW1vcnlTdG9yZS5nZXQoaWQpPy5hcmd1bWVudHM7XG5cdH1cblxuXHRwdWJsaWMgcmVzZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya3NwYWNlU3RvcmUudmFsdWUucmVzZXQoKTtcblx0XHR0aGlzLl9wcm9maWxlU3RvcmUudmFsdWUucmVzZXQoKTtcblx0XHR0aGlzLl9tZW1vcnlTdG9yZS5jbGVhcigpO1xuXHR9XG5cblx0cHVibGljIGNoZWNrQXV0b0NvbmZpcm1hdGlvbihpZDogc3RyaW5nKTogQ29uZmlybWVkUmVhc29uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fd29ya3NwYWNlU3RvcmUudmFsdWUuZ2V0QXV0b0NvbmZpcm0oaWQpKSB7XG5cdFx0XHRyZXR1cm4geyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICd3b3Jrc3BhY2UnIH07XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9wcm9maWxlU3RvcmUudmFsdWUuZ2V0QXV0b0NvbmZpcm0oaWQpKSB7XG5cdFx0XHRyZXR1cm4geyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdwcm9maWxlJyB9O1xuXHRcdH1cblx0XHRpZiAodGhpcy5fbWVtb3J5U3RvcmUuaGFzKGlkKSkge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnc2Vzc2lvbicgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBnZXRBbGxDb25maXJtZWQoKTogU2V0PHN0cmluZz4ge1xuXHRcdGNvbnN0IGFsbCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIHRoaXMuX3dvcmtzcGFjZVN0b3JlLnZhbHVlLmdldEFsbCgpKSB7XG5cdFx0XHRhbGwuYWRkKGtleSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qga2V5IG9mIHRoaXMuX3Byb2ZpbGVTdG9yZS52YWx1ZS5nZXRBbGwoKSkge1xuXHRcdFx0YWxsLmFkZChrZXkpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGtleSBvZiB0aGlzLl9tZW1vcnlTdG9yZS5rZXlzKCkpIHtcblx0XHRcdGFsbC5hZGQoa2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIGFsbDtcblx0fVxufVxuXG5jbGFzcyBUb29sQ29uZmlybVN0b3JlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX2F1dG9Db25maXJtVG9vbHM6IExSVUNhY2hlPHN0cmluZywgSUF1dG9Db25maXJtRW50cnk+ID0gbmV3IExSVUNhY2hlPHN0cmluZywgSUF1dG9Db25maXJtRW50cnk+KDEwMCk7XG5cdHByaXZhdGUgX2RpZENoYW5nZSA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Njb3BlOiBTdG9yYWdlU2NvcGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZUtleTogc3RyaW5nLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gUmVhZCBzdG9yZWQgZGF0YSBcdTIwMTQgc3VwcG9ydHMgYm90aCBsZWdhY3kgc3RyaW5nW10gYW5kIG5ldyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBib29sZWFuIHwgb2JqZWN0PiBmb3JtYXRzXG5cdFx0Y29uc3QgcmF3ID0gc3RvcmFnZVNlcnZpY2UuZ2V0KHRoaXMuX3N0b3JhZ2VLZXksIHRoaXMuX3Njb3BlKTtcblx0XHRpZiAocmF3KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcblx0XHRcdFx0XHQvLyBMZWdhY3kgZm9ybWF0OiBzdHJpbmdbXVxuXHRcdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIHBhcnNlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fYXV0b0NvbmZpcm1Ub29scy5zZXQoa2V5LCB7IGNvbmZpcm1lZDogdHJ1ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHBhcnNlZCA9PT0gJ29iamVjdCcgJiYgcGFyc2VkICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocGFyc2VkKSkge1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdFx0Ly8gTmV3IGZvcm1hdDogeyBsYWJlbD86IHN0cmluZzsgYXJndW1lbnRzPzogc3RyaW5nIH1cblx0XHRcdFx0XHRcdFx0Y29uc3Qgb2JqID0gdmFsdWUgYXMgeyBsYWJlbD86IHN0cmluZzsgYXJndW1lbnRzPzogc3RyaW5nIH07XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2F1dG9Db25maXJtVG9vbHMuc2V0KGtleSwgeyBjb25maXJtZWQ6IHRydWUsIGxhYmVsOiBvYmoubGFiZWwsIGFyZ3VtZW50czogb2JqLmFyZ3VtZW50cyB9KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdC8vIExlZ2FjeSBmb3JtYXQ6IHN0cmluZyB8IGJvb2xlYW5cblx0XHRcdFx0XHRcdFx0dGhpcy5fYXV0b0NvbmZpcm1Ub29scy5zZXQoa2V5LCB7IGNvbmZpcm1lZDogdHJ1ZSwgbGFiZWw6IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyB2YWx1ZSA6IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBJZ25vcmUgbWFsZm9ybWVkIGRhdGFcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihzdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2RpZENoYW5nZSkge1xuXHRcdFx0XHRjb25zdCBkYXRhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBib29sZWFuIHwgeyBsYWJlbD86IHN0cmluZzsgYXJndW1lbnRzPzogc3RyaW5nIH0+ID0ge307XG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgZW50cnldIG9mIHRoaXMuX2F1dG9Db25maXJtVG9vbHMpIHtcblx0XHRcdFx0XHRpZiAoZW50cnkuYXJndW1lbnRzKSB7XG5cdFx0XHRcdFx0XHRkYXRhW2tleV0gPSB7IGxhYmVsOiBlbnRyeS5sYWJlbCwgYXJndW1lbnRzOiBlbnRyeS5hcmd1bWVudHMgfTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZGF0YVtrZXldID0gZW50cnkubGFiZWwgPz8gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSh0aGlzLl9zdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShkYXRhKSwgdGhpcy5fc2NvcGUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRcdHRoaXMuX2RpZENoYW5nZSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyByZXNldCgpIHtcblx0XHR0aGlzLl9hdXRvQ29uZmlybVRvb2xzLmNsZWFyKCk7XG5cdFx0dGhpcy5fZGlkQ2hhbmdlID0gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBdXRvQ29uZmlybShpZDogc3RyaW5nKTogSUF1dG9Db25maXJtRW50cnkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fYXV0b0NvbmZpcm1Ub29scy5nZXQoaWQpO1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0dGhpcy5fZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdHJldHVybiBlbnRyeTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBzZXRBdXRvQ29uZmlybShpZDogc3RyaW5nLCBlbnRyeTogSUF1dG9Db25maXJtRW50cnkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aGlzLl9hdXRvQ29uZmlybVRvb2xzLmRlbGV0ZShpZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2F1dG9Db25maXJtVG9vbHMuc2V0KGlkLCBlbnRyeSk7XG5cdFx0fVxuXHRcdHRoaXMuX2RpZENoYW5nZSA9IHRydWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWxsKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX2F1dG9Db25maXJtVG9vbHMua2V5cygpXTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3ByZUV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmU6IEdlbmVyaWNDb25maXJtU3RvcmU7XG5cdHByaXZhdGUgX3Bvc3RFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlOiBHZW5lcmljQ29uZmlybVN0b3JlO1xuXHRwcml2YXRlIF9wcmVFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmU6IEdlbmVyaWNDb25maXJtU3RvcmU7XG5cdHByaXZhdGUgX3Bvc3RFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmU6IEdlbmVyaWNDb25maXJtU3RvcmU7XG5cdHByaXZhdGUgX2NvbWJpbmF0aW9uQ29uZmlybVN0b3JlOiBHZW5lcmljQ29uZmlybVN0b3JlO1xuXG5cdHByaXZhdGUgX2NvbnRyaWJ1dGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcHJlRXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBHZW5lcmljQ29uZmlybVN0b3JlKCdjaGF0L2F1dG9jb25maXJtJywgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UpKTtcblx0XHR0aGlzLl9wb3N0RXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBHZW5lcmljQ29uZmlybVN0b3JlKCdjaGF0L2F1dG9jb25maXJtLXBvc3QnLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdHRoaXMuX3ByZUV4ZWN1dGlvblNlcnZlckNvbmZpcm1TdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBHZW5lcmljQ29uZmlybVN0b3JlKCdjaGF0L3NlcnZlcnMvYXV0b2NvbmZpcm0nLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdHRoaXMuX3Bvc3RFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgR2VuZXJpY0NvbmZpcm1TdG9yZSgnY2hhdC9zZXJ2ZXJzL2F1dG9jb25maXJtLXBvc3QnLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdHRoaXMuX2NvbWJpbmF0aW9uQ29uZmlybVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEdlbmVyaWNDb25maXJtU3RvcmUoJ2NoYXQvYXV0b2NvbmZpcm0tY29tYmluYXRpb24nLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHR9XG5cblx0Z2V0UHJlQ29uZmlybUFjdGlvbihyZWY6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZik6IENvbmZpcm1lZFJlYXNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gQ2hlY2sgY29udHJpYnV0aW9uIGZpcnN0XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5fY29udHJpYnV0aW9ucy5nZXQocmVmLnRvb2xJZCk7XG5cdFx0aWYgKGNvbnRyaWJ1dGlvbj8uZ2V0UHJlQ29uZmlybUFjdGlvbikge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29udHJpYnV0aW9uLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBjb250cmlidXRpb24gZGlzYWJsZXMgZGVmYXVsdCBhcHByb3ZhbHMsIGRvbid0IGNoZWNrIGRlZmF1bHQgc3RvcmVzXG5cdFx0aWYgKGNvbnRyaWJ1dGlvbiAmJiBjb250cmlidXRpb24uY2FuVXNlRGVmYXVsdEFwcHJvdmFscyA9PT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgY29tYmluYXRpb24tbGV2ZWwgY29uZmlybWF0aW9uXG5cdFx0aWYgKHJlZi5jb21iaW5hdGlvbikge1xuXHRcdFx0Y29uc3QgY29tYmluYXRpb25SZXN1bHQgPSB0aGlzLl9jb21iaW5hdGlvbkNvbmZpcm1TdG9yZS5jaGVja0F1dG9Db25maXJtYXRpb24ocmVmLmNvbWJpbmF0aW9uLmtleSk7XG5cdFx0XHRpZiAoY29tYmluYXRpb25SZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIGNvbWJpbmF0aW9uUmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIHRvb2wtbGV2ZWwgY29uZmlybWF0aW9uXG5cdFx0Y29uc3QgdG9vbFJlc3VsdCA9IHRoaXMuX3ByZUV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuY2hlY2tBdXRvQ29uZmlybWF0aW9uKHJlZi50b29sSWQpO1xuXHRcdGlmICh0b29sUmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdG9vbFJlc3VsdDtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBzZXJ2ZXItbGV2ZWwgY29uZmlybWF0aW9uIGZvciBNQ1AgdG9vbHNcblx0XHRpZiAocmVmLnNvdXJjZS50eXBlID09PSAnbWNwJykge1xuXHRcdFx0Y29uc3Qgc2VydmVyUmVzdWx0ID0gdGhpcy5fcHJlRXhlY3V0aW9uU2VydmVyQ29uZmlybVN0b3JlLmNoZWNrQXV0b0NvbmZpcm1hdGlvbihyZWYuc291cmNlLmRlZmluaXRpb25JZCk7XG5cdFx0XHRpZiAoc2VydmVyUmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiBzZXJ2ZXJSZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldFBvc3RDb25maXJtQWN0aW9uKHJlZjogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmKTogQ29uZmlybWVkUmVhc29uIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBDaGVjayBjb250cmlidXRpb24gZmlyc3Rcblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLl9jb250cmlidXRpb25zLmdldChyZWYudG9vbElkKTtcblx0XHRpZiAoY29udHJpYnV0aW9uPy5nZXRQb3N0Q29uZmlybUFjdGlvbikge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29udHJpYnV0aW9uLmdldFBvc3RDb25maXJtQWN0aW9uKHJlZik7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgY29udHJpYnV0aW9uIGRpc2FibGVzIGRlZmF1bHQgYXBwcm92YWxzLCBkb24ndCBjaGVjayBkZWZhdWx0IHN0b3Jlc1xuXHRcdGlmIChjb250cmlidXRpb24gJiYgY29udHJpYnV0aW9uLmNhblVzZURlZmF1bHRBcHByb3ZhbHMgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIHRvb2wtbGV2ZWwgY29uZmlybWF0aW9uXG5cdFx0Y29uc3QgdG9vbFJlc3VsdCA9IHRoaXMuX3Bvc3RFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLmNoZWNrQXV0b0NvbmZpcm1hdGlvbihyZWYudG9vbElkKTtcblx0XHRpZiAodG9vbFJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHRvb2xSZXN1bHQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgc2VydmVyLWxldmVsIGNvbmZpcm1hdGlvbiBmb3IgTUNQIHRvb2xzXG5cdFx0aWYgKHJlZi5zb3VyY2UudHlwZSA9PT0gJ21jcCcpIHtcblx0XHRcdGNvbnN0IHNlcnZlclJlc3VsdCA9IHRoaXMuX3Bvc3RFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmUuY2hlY2tBdXRvQ29uZmlybWF0aW9uKHJlZi5zb3VyY2UuZGVmaW5pdGlvbklkKTtcblx0XHRcdGlmIChzZXJ2ZXJSZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHNlcnZlclJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0UHJlQ29uZmlybUFjdGlvbnMocmVmOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25SZWYpOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25BY3Rpb25zW10ge1xuXHRcdGNvbnN0IGFjdGlvbnM6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkFjdGlvbnNbXSA9IFtdO1xuXG5cdFx0Ly8gQWRkIGNvbnRyaWJ1dGlvbiBhY3Rpb25zIGZpcnN0XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5fY29udHJpYnV0aW9ucy5nZXQocmVmLnRvb2xJZCk7XG5cdFx0aWYgKGNvbnRyaWJ1dGlvbj8uZ2V0UHJlQ29uZmlybUFjdGlvbnMpIHtcblx0XHRcdGFjdGlvbnMucHVzaCguLi5jb250cmlidXRpb24uZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmKSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgY29udHJpYnV0aW9uIGRpc2FibGVzIGRlZmF1bHQgYXBwcm92YWxzLCBvbmx5IHJldHVybiBjb250cmlidXRpb24gYWN0aW9uc1xuXHRcdGlmIChjb250cmlidXRpb24gJiYgY29udHJpYnV0aW9uLmNhblVzZURlZmF1bHRBcHByb3ZhbHMgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gYWN0aW9ucztcblx0XHR9XG5cblx0XHQvLyBBZGQgY29tYmluYXRpb24tbGV2ZWwgYWN0aW9ucyB3aGVuIGFwcHJvdmVDb21iaW5hdGlvbiBpcyBwcm92aWRlZFxuXHRcdGlmIChyZWYuY29tYmluYXRpb24pIHtcblx0XHRcdGNvbnN0IHsgbGFiZWw6IGNvbWJpbmF0aW9uTGFiZWwsIGtleTogY29tYmluYXRpb25LZXksIGFyZ3VtZW50czogY29tYmluYXRpb25BcmdzIH0gPSByZWYuY29tYmluYXRpb247XG5cdFx0XHRhY3Rpb25zLnB1c2goXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93Q29tYmluYXRpb25TZXNzaW9uJywgJ3swfSBpbiB0aGlzIFNlc3Npb24nLCBjb21iaW5hdGlvbkxhYmVsKSxcblx0XHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhbGxvd0NvbWJpbmF0aW9uU2Vzc2lvblRvb2x0aXAnLCAnQWxsb3cgdGhpcyBwYXJ0aWN1bGFyIGNvbWJpbmF0aW9uIG9mIHRvb2wgYW5kIGFyZ3VtZW50cyBpbiB0aGlzIHNlc3Npb24gd2l0aG91dCBjb25maXJtYXRpb24uJyksXG5cdFx0XHRcdFx0ZGl2aWRlcjogISFhY3Rpb25zLmxlbmd0aCxcblx0XHRcdFx0XHRzY29wZTogJ3Nlc3Npb24nLFxuXHRcdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fY29tYmluYXRpb25Db25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihjb21iaW5hdGlvbktleSwgJ3Nlc3Npb24nLCBjb21iaW5hdGlvbkxhYmVsLCBjb21iaW5hdGlvbkFyZ3MpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhbGxvd0NvbWJpbmF0aW9uV29ya3NwYWNlJywgJ3swfSBpbiB0aGlzIFdvcmtzcGFjZScsIGNvbWJpbmF0aW9uTGFiZWwpLFxuXHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2FsbG93Q29tYmluYXRpb25Xb3Jrc3BhY2VUb29sdGlwJywgJ0FsbG93IHRoaXMgcGFydGljdWxhciBjb21iaW5hdGlvbiBvZiB0b29sIGFuZCBhcmd1bWVudHMgaW4gdGhpcyB3b3Jrc3BhY2Ugd2l0aG91dCBjb25maXJtYXRpb24uJyksXG5cdFx0XHRcdFx0c2NvcGU6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fY29tYmluYXRpb25Db25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihjb21iaW5hdGlvbktleSwgJ3dvcmtzcGFjZScsIGNvbWJpbmF0aW9uTGFiZWwsIGNvbWJpbmF0aW9uQXJncyk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93Q29tYmluYXRpb25HbG9iYWxseScsICdBbHdheXMgezB9JywgY29tYmluYXRpb25MYWJlbCksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYWxsb3dDb21iaW5hdGlvbkdsb2JhbGx5VG9vbHRpcCcsICdBbHdheXMgYWxsb3cgdGhpcyBwYXJ0aWN1bGFyIGNvbWJpbmF0aW9uIG9mIHRvb2wgYW5kIGFyZ3VtZW50cyB3aXRob3V0IGNvbmZpcm1hdGlvbi4nKSxcblx0XHRcdFx0XHRzY29wZTogJ3Byb2ZpbGUnLFxuXHRcdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fY29tYmluYXRpb25Db25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihjb21iaW5hdGlvbktleSwgJ3Byb2ZpbGUnLCBjb21iaW5hdGlvbkxhYmVsLCBjb21iaW5hdGlvbkFyZ3MpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHQvLyBBZGQgZGVmYXVsdCB0b29sLWxldmVsIGFjdGlvbnNcblx0XHRhY3Rpb25zLnB1c2goXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsb3dTZXNzaW9uJywgJ0FsbG93IGluIHRoaXMgU2Vzc2lvbicpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhbGxvd1Nlc3Npb25Ub29sdGlwJywgJ0FsbG93IHRoaXMgdG9vbCB0byBydW4gaW4gdGhpcyBzZXNzaW9uIHdpdGhvdXQgY29uZmlybWF0aW9uLicpLFxuXHRcdFx0XHRkaXZpZGVyOiAhIWFjdGlvbnMubGVuZ3RoLFxuXHRcdFx0XHRzY29wZTogJ3Nlc3Npb24nLFxuXHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9wcmVFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24ocmVmLnRvb2xJZCwgJ3Nlc3Npb24nKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhbGxvd1dvcmtzcGFjZScsICdBbGxvdyBpbiB0aGlzIFdvcmtzcGFjZScpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhbGxvd1dvcmtzcGFjZVRvb2x0aXAnLCAnQWxsb3cgdGhpcyB0b29sIHRvIHJ1biBpbiB0aGlzIHdvcmtzcGFjZSB3aXRob3V0IGNvbmZpcm1hdGlvbi4nKSxcblx0XHRcdFx0c2NvcGU6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9wcmVFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24ocmVmLnRvb2xJZCwgJ3dvcmtzcGFjZScpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93R2xvYmFsbHknLCAnQWx3YXlzIEFsbG93JyksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2FsbG93R2xvYmFsbHlUb29sdGlwJywgJ0Fsd2F5cyBhbGxvdyB0aGlzIHRvb2wgdG8gcnVuIHdpdGhvdXQgY29uZmlybWF0aW9uLicpLFxuXHRcdFx0XHRzY29wZTogJ3Byb2ZpbGUnLFxuXHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9wcmVFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24ocmVmLnRvb2xJZCwgJ3Byb2ZpbGUnKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHQvLyBBZGQgc2VydmVyLWxldmVsIGFjdGlvbnMgZm9yIE1DUCB0b29sc1xuXHRcdGlmIChyZWYuc291cmNlLnR5cGUgPT09ICdtY3AnKSB7XG5cdFx0XHRjb25zdCB7IHNlcnZlckxhYmVsLCBkZWZpbml0aW9uSWQgfSA9IHJlZi5zb3VyY2U7XG5cdFx0XHRhY3Rpb25zLnB1c2goXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93U2VydmVyU2Vzc2lvbicsICdBbGxvdyBUb29scyBmcm9tIHswfSBpbiB0aGlzIFNlc3Npb24nLCBzZXJ2ZXJMYWJlbCksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYWxsb3dTZXJ2ZXJTZXNzaW9uVG9vbHRpcCcsICdBbGxvdyBhbGwgdG9vbHMgZnJvbSB0aGlzIHNlcnZlciB0byBydW4gaW4gdGhpcyBzZXNzaW9uIHdpdGhvdXQgY29uZmlybWF0aW9uLicpLFxuXHRcdFx0XHRcdGRpdmlkZXI6IHRydWUsXG5cdFx0XHRcdFx0c2NvcGU6ICdzZXNzaW9uJyxcblx0XHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX3ByZUV4ZWN1dGlvblNlcnZlckNvbmZpcm1TdG9yZS5zZXRBdXRvQ29uZmlybWF0aW9uKGRlZmluaXRpb25JZCwgJ3Nlc3Npb24nKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsb3dTZXJ2ZXJXb3Jrc3BhY2UnLCAnQWxsb3cgVG9vbHMgZnJvbSB7MH0gaW4gdGhpcyBXb3Jrc3BhY2UnLCBzZXJ2ZXJMYWJlbCksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYWxsb3dTZXJ2ZXJXb3Jrc3BhY2VUb29sdGlwJywgJ0FsbG93IGFsbCB0b29scyBmcm9tIHRoaXMgc2VydmVyIHRvIHJ1biBpbiB0aGlzIHdvcmtzcGFjZSB3aXRob3V0IGNvbmZpcm1hdGlvbi4nKSxcblx0XHRcdFx0XHRzY29wZTogJ3dvcmtzcGFjZScsXG5cdFx0XHRcdFx0c2VsZWN0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9wcmVFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihkZWZpbml0aW9uSWQsICd3b3Jrc3BhY2UnKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsb3dTZXJ2ZXJHbG9iYWxseScsICdBbHdheXMgQWxsb3cgVG9vbHMgZnJvbSB7MH0nLCBzZXJ2ZXJMYWJlbCksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYWxsb3dTZXJ2ZXJHbG9iYWxseVRvb2x0aXAnLCAnQWx3YXlzIGFsbG93IGFsbCB0b29scyBmcm9tIHRoaXMgc2VydmVyIHRvIHJ1biB3aXRob3V0IGNvbmZpcm1hdGlvbi4nKSxcblx0XHRcdFx0XHRzY29wZTogJ3Byb2ZpbGUnLFxuXHRcdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fcHJlRXhlY3V0aW9uU2VydmVyQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24oZGVmaW5pdGlvbklkLCAncHJvZmlsZScpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0Z2V0UG9zdENvbmZpcm1BY3Rpb25zKHJlZjogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmKTogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQWN0aW9uc1tdIHtcblx0XHRjb25zdCBhY3Rpb25zOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25BY3Rpb25zW10gPSBbXTtcblxuXHRcdC8vIEFkZCBjb250cmlidXRpb24gYWN0aW9ucyBmaXJzdFxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHRoaXMuX2NvbnRyaWJ1dGlvbnMuZ2V0KHJlZi50b29sSWQpO1xuXHRcdGlmIChjb250cmlidXRpb24/LmdldFBvc3RDb25maXJtQWN0aW9ucykge1xuXHRcdFx0YWN0aW9ucy5wdXNoKC4uLmNvbnRyaWJ1dGlvbi5nZXRQb3N0Q29uZmlybUFjdGlvbnMocmVmKSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgY29udHJpYnV0aW9uIGRpc2FibGVzIGRlZmF1bHQgYXBwcm92YWxzLCBvbmx5IHJldHVybiBjb250cmlidXRpb24gYWN0aW9uc1xuXHRcdGlmIChjb250cmlidXRpb24gJiYgY29udHJpYnV0aW9uLmNhblVzZURlZmF1bHRBcHByb3ZhbHMgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gYWN0aW9ucztcblx0XHR9XG5cblx0XHQvLyBBZGQgZGVmYXVsdCB0b29sLWxldmVsIGFjdGlvbnNcblx0XHRhY3Rpb25zLnB1c2goXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsb3dTZXNzaW9uUG9zdCcsICdBbGxvdyBXaXRob3V0IFJldmlldyBpbiB0aGlzIFNlc3Npb24nKSxcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYWxsb3dTZXNzaW9uUG9zdFRvb2x0aXAnLCAnQWxsb3cgcmVzdWx0cyBmcm9tIHRoaXMgdG9vbCB0byBiZSBzZW50IHdpdGhvdXQgY29uZmlybWF0aW9uIGluIHRoaXMgc2Vzc2lvbi4nKSxcblx0XHRcdFx0ZGl2aWRlcjogISFhY3Rpb25zLmxlbmd0aCxcblx0XHRcdFx0c2NvcGU6ICdzZXNzaW9uJyxcblx0XHRcdFx0c2VsZWN0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fcG9zdEV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihyZWYudG9vbElkLCAnc2Vzc2lvbicpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93V29ya3NwYWNlUG9zdCcsICdBbGxvdyBXaXRob3V0IFJldmlldyBpbiB0aGlzIFdvcmtzcGFjZScpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhbGxvd1dvcmtzcGFjZVBvc3RUb29sdGlwJywgJ0FsbG93IHJlc3VsdHMgZnJvbSB0aGlzIHRvb2wgdG8gYmUgc2VudCB3aXRob3V0IGNvbmZpcm1hdGlvbiBpbiB0aGlzIHdvcmtzcGFjZS4nKSxcblx0XHRcdFx0c2NvcGU6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9wb3N0RXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5zZXRBdXRvQ29uZmlybWF0aW9uKHJlZi50b29sSWQsICd3b3Jrc3BhY2UnKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhbGxvd0dsb2JhbGx5UG9zdCcsICdBbHdheXMgQWxsb3cgV2l0aG91dCBSZXZpZXcnKSxcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYWxsb3dHbG9iYWxseVBvc3RUb29sdGlwJywgJ0Fsd2F5cyBhbGxvdyByZXN1bHRzIGZyb20gdGhpcyB0b29sIHRvIGJlIHNlbnQgd2l0aG91dCBjb25maXJtYXRpb24uJyksXG5cdFx0XHRcdHNjb3BlOiAncHJvZmlsZScsXG5cdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3Bvc3RFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24ocmVmLnRvb2xJZCwgJ3Byb2ZpbGUnKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHQvLyBBZGQgc2VydmVyLWxldmVsIGFjdGlvbnMgZm9yIE1DUCB0b29sc1xuXHRcdGlmIChyZWYuc291cmNlLnR5cGUgPT09ICdtY3AnKSB7XG5cdFx0XHRjb25zdCB7IHNlcnZlckxhYmVsLCBkZWZpbml0aW9uSWQgfSA9IHJlZi5zb3VyY2U7XG5cdFx0XHRhY3Rpb25zLnB1c2goXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93U2VydmVyU2Vzc2lvblBvc3QnLCAnQWxsb3cgVG9vbHMgZnJvbSB7MH0gV2l0aG91dCBSZXZpZXcgaW4gdGhpcyBTZXNzaW9uJywgc2VydmVyTGFiZWwpLFxuXHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2FsbG93U2VydmVyU2Vzc2lvblBvc3RUb29sdGlwJywgJ0FsbG93IHJlc3VsdHMgZnJvbSBhbGwgdG9vbHMgZnJvbSB0aGlzIHNlcnZlciB0byBiZSBzZW50IHdpdGhvdXQgY29uZmlybWF0aW9uIGluIHRoaXMgc2Vzc2lvbi4nKSxcblx0XHRcdFx0XHRkaXZpZGVyOiB0cnVlLFxuXHRcdFx0XHRcdHNjb3BlOiAnc2Vzc2lvbicsXG5cdFx0XHRcdFx0c2VsZWN0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9wb3N0RXhlY3V0aW9uU2VydmVyQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24oZGVmaW5pdGlvbklkLCAnc2Vzc2lvbicpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhbGxvd1NlcnZlcldvcmtzcGFjZVBvc3QnLCAnQWxsb3cgVG9vbHMgZnJvbSB7MH0gV2l0aG91dCBSZXZpZXcgaW4gdGhpcyBXb3Jrc3BhY2UnLCBzZXJ2ZXJMYWJlbCksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYWxsb3dTZXJ2ZXJXb3Jrc3BhY2VQb3N0VG9vbHRpcCcsICdBbGxvdyByZXN1bHRzIGZyb20gYWxsIHRvb2xzIGZyb20gdGhpcyBzZXJ2ZXIgdG8gYmUgc2VudCB3aXRob3V0IGNvbmZpcm1hdGlvbiBpbiB0aGlzIHdvcmtzcGFjZS4nKSxcblx0XHRcdFx0XHRzY29wZTogJ3dvcmtzcGFjZScsXG5cdFx0XHRcdFx0c2VsZWN0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9wb3N0RXhlY3V0aW9uU2VydmVyQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24oZGVmaW5pdGlvbklkLCAnd29ya3NwYWNlJyk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FsbG93U2VydmVyR2xvYmFsbHlQb3N0JywgJ0Fsd2F5cyBBbGxvdyBUb29scyBmcm9tIHswfSBXaXRob3V0IFJldmlldycsIHNlcnZlckxhYmVsKSxcblx0XHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhbGxvd1NlcnZlckdsb2JhbGx5UG9zdFRvb2x0aXAnLCAnQWx3YXlzIGFsbG93IHJlc3VsdHMgZnJvbSBhbGwgdG9vbHMgZnJvbSB0aGlzIHNlcnZlciB0byBiZSBzZW50IHdpdGhvdXQgY29uZmlybWF0aW9uLicpLFxuXHRcdFx0XHRcdHNjb3BlOiAncHJvZmlsZScsXG5cdFx0XHRcdFx0c2VsZWN0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9wb3N0RXhlY3V0aW9uU2VydmVyQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24oZGVmaW5pdGlvbklkLCAncHJvZmlsZScpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0cmVnaXN0ZXJDb25maXJtYXRpb25Db250cmlidXRpb24odG9vbE5hbWU6IHN0cmluZywgY29udHJpYnV0aW9uOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25Db250cmlidXRpb24pOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fY29udHJpYnV0aW9ucy5zZXQodG9vbE5hbWUsIGNvbnRyaWJ1dGlvbik7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fY29udHJpYnV0aW9ucy5kZWxldGUodG9vbE5hbWUpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHR0b29sQ2FuTWFuYWdlQ29uZmlybWF0aW9uKHRvb2w6IElUb29sRGF0YSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRvb2wuY2FuUmVxdWVzdFByZUFwcHJvdmFsXG5cdFx0XHR8fCAhIXRvb2wuY2FuUmVxdWVzdFBvc3RBcHByb3ZhbFxuXHRcdFx0fHwgdGhpcy5fY29udHJpYnV0aW9ucy5oYXModG9vbC5pZClcblx0XHRcdHx8ICEhdGhpcy5fcHJlRXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5jaGVja0F1dG9Db25maXJtYXRpb24odG9vbC5pZClcblx0XHRcdHx8ICEhdGhpcy5fcG9zdEV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuY2hlY2tBdXRvQ29uZmlybWF0aW9uKHRvb2wuaWQpXG5cdFx0XHR8fCB0aGlzLl9oYXNDb21iaW5hdGlvbkFwcHJvdmFsc0ZvclRvb2wodG9vbC5pZCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNDb21iaW5hdGlvbkFwcHJvdmFsc0ZvclRvb2wodG9vbElkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBwcmVmaXggPSB0b29sSWQgKyAnOmNvbWJpbmF0aW9uOic7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgdGhpcy5fY29tYmluYXRpb25Db25maXJtU3RvcmUuZ2V0QWxsQ29uZmlybWVkKCkpIHtcblx0XHRcdGlmIChrZXkuc3RhcnRzV2l0aChwcmVmaXgpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb21iaW5hdGlvbkFwcHJvdmFsc0ZvclRvb2wodG9vbElkOiBzdHJpbmcsIHNjb3BlOiAnd29ya3NwYWNlJyB8ICdwcm9maWxlJyB8ICdzZXNzaW9uJyk6IHsga2V5OiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGFyZ3VtZW50cz86IHN0cmluZyB9W10ge1xuXHRcdGNvbnN0IHByZWZpeCA9IHRvb2xJZCArICc6Y29tYmluYXRpb246Jztcblx0XHRjb25zdCByZXN1bHRzOiB7IGtleTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyBhcmd1bWVudHM/OiBzdHJpbmcgfVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgdGhpcy5fY29tYmluYXRpb25Db25maXJtU3RvcmUuZ2V0QWxsQ29uZmlybWVkKCkpIHtcblx0XHRcdGlmIChrZXkuc3RhcnRzV2l0aChwcmVmaXgpICYmIHRoaXMuX2NvbWJpbmF0aW9uQ29uZmlybVN0b3JlLmdldEF1dG9Db25maXJtYXRpb25JbihrZXksIHNjb3BlKSkge1xuXHRcdFx0XHRjb25zdCBsYWJlbCA9IHRoaXMuX2NvbWJpbmF0aW9uQ29uZmlybVN0b3JlLmdldExhYmVsKGtleSkgPz8ga2V5O1xuXHRcdFx0XHRjb25zdCBhcmdzID0gdGhpcy5fY29tYmluYXRpb25Db25maXJtU3RvcmUuZ2V0QXJndW1lbnRzKGtleSk7XG5cdFx0XHRcdHJlc3VsdHMucHVzaCh7IGtleSwgbGFiZWwsIGFyZ3VtZW50czogYXJncyB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH1cblxuXHRtYW5hZ2VDb25maXJtYXRpb25QcmVmZXJlbmNlcyh0b29sczogcmVhZG9ubHkgSVRvb2xEYXRhW10sIG9wdGlvbnM/OiB7IGRlZmF1bHRTY29wZT86ICd3b3Jrc3BhY2UnIHwgJ3Byb2ZpbGUnIHwgJ3Nlc3Npb24nOyBmb2N1c1Rvb2xJZD86IHN0cmluZyB9KTogdm9pZCB7XG5cdFx0aW50ZXJmYWNlIElUb29sVHJlZUl0ZW0gZXh0ZW5kcyBJUXVpY2tUcmVlSXRlbSB7XG5cdFx0XHR0eXBlOiAndG9vbCcgfCAnc2VydmVyJyB8ICd0b29sLXByZScgfCAndG9vbC1wb3N0JyB8ICdzZXJ2ZXItcHJlJyB8ICdzZXJ2ZXItcG9zdCcgfCAnbWFuYWdlJyB8ICdjb21iaW5hdGlvbic7XG5cdFx0XHR0b29sSWQ/OiBzdHJpbmc7XG5cdFx0XHRzZXJ2ZXJJZD86IHN0cmluZztcblx0XHRcdHNjb3BlPzogJ3dvcmtzcGFjZScgfCAncHJvZmlsZSc7XG5cdFx0XHRjb21iaW5hdGlvbktleT86IHN0cmluZztcblx0XHRcdGNvbWJpbmF0aW9uQXJncz86IHN0cmluZztcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3QXJnc0J1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmluZm8pLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3ZpZXdDb21iaW5hdGlvbkFyZ3VtZW50cycsIFwiVmlldyBBcmd1bWVudHNcIiksXG5cdFx0fTtcblxuXHRcdC8vIEhlbHBlciB0byB0cmFjayB0b29scyB1bmRlciBzZXJ2ZXJzXG5cdFx0Y29uc3QgdHJhY2tTZXJ2ZXJUb29sID0gKHNlcnZlcklkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIHRvb2xJZDogc3RyaW5nLCBzZXJ2ZXJzV2l0aFRvb2xzOiBNYXA8c3RyaW5nLCB7IGxhYmVsOiBzdHJpbmc7IHRvb2xzOiBTZXQ8c3RyaW5nPiB9PikgPT4ge1xuXHRcdFx0aWYgKCFzZXJ2ZXJzV2l0aFRvb2xzLmhhcyhzZXJ2ZXJJZCkpIHtcblx0XHRcdFx0c2VydmVyc1dpdGhUb29scy5zZXQoc2VydmVySWQsIHsgbGFiZWwsIHRvb2xzOiBuZXcgU2V0KCkgfSk7XG5cdFx0XHR9XG5cdFx0XHRzZXJ2ZXJzV2l0aFRvb2xzLmdldChzZXJ2ZXJJZCkhLnRvb2xzLmFkZCh0b29sSWQpO1xuXHRcdH07XG5cblx0XHQvLyBIZWxwZXIgdG8gYWRkIHNlcnZlciB0b29sIGZyb20gc291cmNlXG5cdFx0Y29uc3QgYWRkU2VydmVyVG9vbEZyb21Tb3VyY2UgPSAoc291cmNlOiBUb29sRGF0YVNvdXJjZSwgdG9vbElkOiBzdHJpbmcsIHNlcnZlcnNXaXRoVG9vbHM6IE1hcDxzdHJpbmcsIHsgbGFiZWw6IHN0cmluZzsgdG9vbHM6IFNldDxzdHJpbmc+IH0+KSA9PiB7XG5cdFx0XHRpZiAoc291cmNlLnR5cGUgPT09ICdtY3AnKSB7XG5cdFx0XHRcdHRyYWNrU2VydmVyVG9vbChzb3VyY2UuZGVmaW5pdGlvbklkLCBzb3VyY2Uuc2VydmVyTGFiZWwgfHwgc291cmNlLmxhYmVsLCB0b29sSWQsIHNlcnZlcnNXaXRoVG9vbHMpO1xuXHRcdFx0fSBlbHNlIGlmIChzb3VyY2UudHlwZSA9PT0gJ2V4dGVuc2lvbicpIHtcblx0XHRcdFx0dHJhY2tTZXJ2ZXJUb29sKHNvdXJjZS5leHRlbnNpb25JZC52YWx1ZSwgc291cmNlLmxhYmVsLCB0b29sSWQsIHNlcnZlcnNXaXRoVG9vbHMpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBEZXRlcm1pbmUgd2hpY2ggdG9vbHMgc2hvdWxkIGJlIHNob3duXG5cdFx0Y29uc3QgcmVsZXZhbnRUb29scyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IHNlcnZlcnNXaXRoVG9vbHMgPSBuZXcgTWFwPHN0cmluZywgeyBsYWJlbDogc3RyaW5nOyB0b29sczogU2V0PHN0cmluZz4gfT4oKTtcblxuXHRcdC8vIEFkZCB0b29scyB0aGF0IHJlcXVlc3QgYXBwcm92YWxcblx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgdG9vbHMpIHtcblx0XHRcdGlmICh0b29sLmNhblJlcXVlc3RQcmVBcHByb3ZhbCB8fCB0b29sLmNhblJlcXVlc3RQb3N0QXBwcm92YWwgfHwgdGhpcy5fY29udHJpYnV0aW9ucy5oYXModG9vbC5pZCkpIHtcblx0XHRcdFx0cmVsZXZhbnRUb29scy5hZGQodG9vbC5pZCk7XG5cdFx0XHRcdGFkZFNlcnZlclRvb2xGcm9tU291cmNlKHRvb2wuc291cmNlLCB0b29sLmlkLCBzZXJ2ZXJzV2l0aFRvb2xzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgdG9vbHMgdGhhdCBoYXZlIHN0b3JlZCBhcHByb3ZhbHMgKGJ1dCB3ZSBjYW4ndCBkaXNwbGF5IHRoZW0gd2l0aG91dCBtZXRhZGF0YSlcblx0XHRmb3IgKGNvbnN0IGlkIG9mIHRoaXMuX3ByZUV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuZ2V0QWxsQ29uZmlybWVkKCkpIHtcblx0XHRcdGlmICghcmVsZXZhbnRUb29scy5oYXMoaWQpKSB7XG5cdFx0XHRcdC8vIE9ubHkgYWRkIGlmIHdlIGhhdmUgdGhlIHRvb2wgZGF0YVxuXHRcdFx0XHRjb25zdCB0b29sID0gdG9vbHMuZmluZCh0ID0+IHQuaWQgPT09IGlkKTtcblx0XHRcdFx0aWYgKHRvb2wpIHtcblx0XHRcdFx0XHRyZWxldmFudFRvb2xzLmFkZChpZCk7XG5cdFx0XHRcdFx0YWRkU2VydmVyVG9vbEZyb21Tb3VyY2UodG9vbC5zb3VyY2UsIGlkLCBzZXJ2ZXJzV2l0aFRvb2xzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGlkIG9mIHRoaXMuX3Bvc3RFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLmdldEFsbENvbmZpcm1lZCgpKSB7XG5cdFx0XHRpZiAoIXJlbGV2YW50VG9vbHMuaGFzKGlkKSkge1xuXHRcdFx0XHQvLyBPbmx5IGFkZCBpZiB3ZSBoYXZlIHRoZSB0b29sIGRhdGFcblx0XHRcdFx0Y29uc3QgdG9vbCA9IHRvb2xzLmZpbmQodCA9PiB0LmlkID09PSBpZCk7XG5cdFx0XHRcdGlmICh0b29sKSB7XG5cdFx0XHRcdFx0cmVsZXZhbnRUb29scy5hZGQoaWQpO1xuXHRcdFx0XHRcdGFkZFNlcnZlclRvb2xGcm9tU291cmNlKHRvb2wuc291cmNlLCBpZCwgc2VydmVyc1dpdGhUb29scyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgdG9vbHMgdGhhdCBoYXZlIGNvbWJpbmF0aW9uIGFwcHJvdmFsc1xuXHRcdGZvciAoY29uc3QgdG9vbCBvZiB0b29scykge1xuXHRcdFx0aWYgKCFyZWxldmFudFRvb2xzLmhhcyh0b29sLmlkKSAmJiB0aGlzLl9oYXNDb21iaW5hdGlvbkFwcHJvdmFsc0ZvclRvb2wodG9vbC5pZCkpIHtcblx0XHRcdFx0cmVsZXZhbnRUb29scy5hZGQodG9vbC5pZCk7XG5cdFx0XHRcdGFkZFNlcnZlclRvb2xGcm9tU291cmNlKHRvb2wuc291cmNlLCB0b29sLmlkLCBzZXJ2ZXJzV2l0aFRvb2xzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocmVsZXZhbnRUb29scy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47IC8vIE5vdGhpbmcgdG8gc2hvd1xuXHRcdH1cblxuXHRcdC8vIERldGVybWluZSBpbml0aWFsIHNjb3BlIGZyb20gb3B0aW9uc1xuXHRcdGxldCBjdXJyZW50U2NvcGUgPSBvcHRpb25zPy5kZWZhdWx0U2NvcGUgPz8gJ3dvcmtzcGFjZSc7XG5cblx0XHQvLyBIZWxwZXIgZnVuY3Rpb24gdG8gYnVpbGQgdHJlZSBpdGVtcyBiYXNlZCBvbiBjdXJyZW50IHNjb3BlXG5cdFx0Y29uc3QgYnVpbGRUcmVlSXRlbXMgPSAoKTogSVRvb2xUcmVlSXRlbVtdID0+IHtcblx0XHRcdGNvbnN0IHRyZWVJdGVtczogSVRvb2xUcmVlSXRlbVtdID0gW107XG5cblx0XHRcdC8vIEFkZCBzZXJ2ZXIgbm9kZXNcblx0XHRcdGZvciAoY29uc3QgW3NlcnZlcklkLCBzZXJ2ZXJJbmZvXSBvZiBzZXJ2ZXJzV2l0aFRvb2xzKSB7XG5cdFx0XHRcdGNvbnN0IHNlcnZlckNoaWxkcmVuOiBJVG9vbFRyZWVJdGVtW10gPSBbXTtcblxuXHRcdFx0XHQvLyBBZGQgc2VydmVyLWxldmVsIGNvbnRyb2xzIGFzIGZpcnN0IGNoaWxkcmVuXG5cdFx0XHRcdGNvbnN0IGhhc0FueVByZSA9IEFycmF5LmZyb20oc2VydmVySW5mby50b29scykuc29tZSh0b29sSWQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRvb2wgPSB0b29scy5maW5kKHQgPT4gdC5pZCA9PT0gdG9vbElkKTtcblx0XHRcdFx0XHRyZXR1cm4gdG9vbD8uY2FuUmVxdWVzdFByZUFwcHJvdmFsO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgaGFzQW55UG9zdCA9IEFycmF5LmZyb20oc2VydmVySW5mby50b29scykuc29tZSh0b29sSWQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRvb2wgPSB0b29scy5maW5kKHQgPT4gdC5pZCA9PT0gdG9vbElkKTtcblx0XHRcdFx0XHRyZXR1cm4gdG9vbD8uY2FuUmVxdWVzdFBvc3RBcHByb3ZhbDtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3Qgc2VydmVyUHJlQ29uZmlybWVkID0gdGhpcy5fcHJlRXhlY3V0aW9uU2VydmVyQ29uZmlybVN0b3JlLmdldEF1dG9Db25maXJtYXRpb25JbihzZXJ2ZXJJZCwgY3VycmVudFNjb3BlKTtcblx0XHRcdFx0Y29uc3Qgc2VydmVyUG9zdENvbmZpcm1lZCA9IHRoaXMuX3Bvc3RFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmUuZ2V0QXV0b0NvbmZpcm1hdGlvbkluKHNlcnZlcklkLCBjdXJyZW50U2NvcGUpO1xuXG5cdFx0XHRcdC8vIEFkZCBpbmRpdmlkdWFsIHRvb2xzIGZyb20gdGhpcyBzZXJ2ZXIgYXMgY2hpbGRyZW5cblx0XHRcdFx0Zm9yIChjb25zdCB0b29sSWQgb2Ygc2VydmVySW5mby50b29scykge1xuXHRcdFx0XHRcdGNvbnN0IHRvb2wgPSB0b29scy5maW5kKHQgPT4gdC5pZCA9PT0gdG9vbElkKTtcblx0XHRcdFx0XHRpZiAoIXRvb2wpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHRvb2xDaGlsZHJlbjogSVRvb2xUcmVlSXRlbVtdID0gW107XG5cdFx0XHRcdFx0Y29uc3QgaGFzUHJlID0gIXNlcnZlclByZUNvbmZpcm1lZCAmJiAodG9vbC5jYW5SZXF1ZXN0UHJlQXBwcm92YWwgfHwgdGhpcy5fcHJlRXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5nZXRBdXRvQ29uZmlybWF0aW9uSW4odG9vbC5pZCwgY3VycmVudFNjb3BlKSk7XG5cdFx0XHRcdFx0Y29uc3QgaGFzUG9zdCA9ICFzZXJ2ZXJQb3N0Q29uZmlybWVkICYmICh0b29sLmNhblJlcXVlc3RQb3N0QXBwcm92YWwgfHwgdGhpcy5fcG9zdEV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuZ2V0QXV0b0NvbmZpcm1hdGlvbkluKHRvb2wuaWQsIGN1cnJlbnRTY29wZSkpO1xuXG5cdFx0XHRcdFx0Ly8gQWRkIGNoaWxkIGl0ZW1zIGZvciBncmFudWxhciBjb250cm9sIHdoZW4gYm90aCBhcHByb3ZhbCB0eXBlcyBleGlzdFxuXHRcdFx0XHRcdGlmIChoYXNQcmUgJiYgaGFzUG9zdCkge1xuXHRcdFx0XHRcdFx0dG9vbENoaWxkcmVuLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAndG9vbC1wcmUnLFxuXHRcdFx0XHRcdFx0XHR0b29sSWQ6IHRvb2wuaWQsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBSVU5fV0lUSE9VVF9BUFBST1ZBTCxcblx0XHRcdFx0XHRcdFx0Y2hlY2tlZDogdGhpcy5fcHJlRXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5nZXRBdXRvQ29uZmlybWF0aW9uSW4odG9vbC5pZCwgY3VycmVudFNjb3BlKVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR0b29sQ2hpbGRyZW4ucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICd0b29sLXBvc3QnLFxuXHRcdFx0XHRcdFx0XHR0b29sSWQ6IHRvb2wuaWQsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBDT05USU5VRV9XSVRIT1VUX1JFVklFV0lOR19SRVNVTFRTLFxuXHRcdFx0XHRcdFx0XHRjaGVja2VkOiB0aGlzLl9wb3N0RXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5nZXRBdXRvQ29uZmlybWF0aW9uSW4odG9vbC5pZCwgY3VycmVudFNjb3BlKVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gQWRkIGNvbWJpbmF0aW9uIGFwcHJvdmFsIGNoaWxkcmVuXG5cdFx0XHRcdFx0Y29uc3QgY29tYmluYXRpb25BcHByb3ZhbHMgPSB0aGlzLl9nZXRDb21iaW5hdGlvbkFwcHJvdmFsc0ZvclRvb2wodG9vbC5pZCwgY3VycmVudFNjb3BlKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHsga2V5LCBsYWJlbCwgYXJndW1lbnRzOiBhcmdzIH0gb2YgY29tYmluYXRpb25BcHByb3ZhbHMpIHtcblx0XHRcdFx0XHRcdHRvb2xDaGlsZHJlbi5wdXNoKHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2NvbWJpbmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0dG9vbElkOiB0b29sLmlkLFxuXHRcdFx0XHRcdFx0XHRjb21iaW5hdGlvbktleToga2V5LFxuXHRcdFx0XHRcdFx0XHRjb21iaW5hdGlvbkFyZ3M6IGFyZ3MsXG5cdFx0XHRcdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRcdFx0XHRjaGVja2VkOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRidXR0b25zOiBhcmdzID8gW3ZpZXdBcmdzQnV0dG9uXSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFRvb2wgaXRlbSBhbHdheXMgaGFzIGEgY2hlY2tib3hcblx0XHRcdFx0XHRjb25zdCBwcmVBcHByb3ZhbCA9IHRoaXMuX3ByZUV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuZ2V0QXV0b0NvbmZpcm1hdGlvbkluKHRvb2wuaWQsIGN1cnJlbnRTY29wZSk7XG5cdFx0XHRcdFx0Y29uc3QgcG9zdEFwcHJvdmFsID0gdGhpcy5fcG9zdEV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuZ2V0QXV0b0NvbmZpcm1hdGlvbkluKHRvb2wuaWQsIGN1cnJlbnRTY29wZSk7XG5cdFx0XHRcdFx0bGV0IGNoZWNrZWQ6IGJvb2xlYW4gfCAnbWl4ZWQnO1xuXHRcdFx0XHRcdGxldCBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRcdFx0aWYgKGhhc1ByZSAmJiBoYXNQb3N0KSB7XG5cdFx0XHRcdFx0XHQvLyBCb3RoOiBjaGVja2JveCBpcyBtaXhlZCBpZiBvbmx5IG9uZSBpcyBlbmFibGVkXG5cdFx0XHRcdFx0XHRjaGVja2VkID0gcHJlQXBwcm92YWwgJiYgcG9zdEFwcHJvdmFsID8gdHJ1ZSA6ICghcHJlQXBwcm92YWwgJiYgIXBvc3RBcHByb3ZhbCA/IGZhbHNlIDogJ21peGVkJyk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChoYXNQcmUpIHtcblx0XHRcdFx0XHRcdGNoZWNrZWQgPSBwcmVBcHByb3ZhbDtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uID0gUlVOX1dJVEhPVVRfQVBQUk9WQUw7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChoYXNQb3N0KSB7XG5cdFx0XHRcdFx0XHRjaGVja2VkID0gcG9zdEFwcHJvdmFsO1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb24gPSBDT05USU5VRV9XSVRIT1VUX1JFVklFV0lOR19SRVNVTFRTO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodG9vbENoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdC8vIFRvb2wgaGFzIGNvbWJpbmF0aW9uIGFwcHJvdmFscyBvbmx5XG5cdFx0XHRcdFx0XHRjaGVja2VkID0gZmFsc2U7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFNraXAgdG9vbHMgd2l0aCBubyBhY3RpdmUgYXBwcm92YWxzLCBubyBjaGlsZHJlbiwgYW5kIG5vIGFwcHJvdmFsIGNhcGFiaWxpdGllcy5cblx0XHRcdFx0XHQvLyBUb29scyB0aGF0IGNhbiByZXF1ZXN0IHByZS9wb3N0IGFwcHJvdmFsIHNob3VsZCBhbHdheXMgcmVtYWluIHZpc2libGUuXG5cdFx0XHRcdFx0aWYgKGNoZWNrZWQgPT09IGZhbHNlICYmIHRvb2xDaGlsZHJlbi5sZW5ndGggPT09IDAgJiYgIXRvb2wuY2FuUmVxdWVzdFByZUFwcHJvdmFsICYmICF0b29sLmNhblJlcXVlc3RQb3N0QXBwcm92YWwpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHNlcnZlckNoaWxkcmVuLnB1c2goe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3Rvb2wnLFxuXHRcdFx0XHRcdFx0dG9vbElkOiB0b29sLmlkLFxuXHRcdFx0XHRcdFx0bGFiZWw6IHRvb2wuZGlzcGxheU5hbWUgfHwgdG9vbC5pZCxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0Y2hlY2tlZCxcblx0XHRcdFx0XHRcdGNvbGxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdGNoaWxkcmVuOiB0b29sQ2hpbGRyZW4ubGVuZ3RoID4gMCA/IHRvb2xDaGlsZHJlbiA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2VydmVyQ2hpbGRyZW4uc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKTtcblxuXHRcdFx0XHRpZiAoaGFzQW55UG9zdCkge1xuXHRcdFx0XHRcdHNlcnZlckNoaWxkcmVuLnVuc2hpZnQoe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3NlcnZlci1wb3N0Jyxcblx0XHRcdFx0XHRcdHNlcnZlcklkLFxuXHRcdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5wbGF5KSxcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY29udGludWVXaXRob3V0UmV2aWV3aW5nJywgXCJDb250aW51ZSB3aXRob3V0IHJldmlld2luZyBhbnkgdG9vbCByZXN1bHRzXCIpLFxuXHRcdFx0XHRcdFx0Y2hlY2tlZDogc2VydmVyUG9zdENvbmZpcm1lZFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChoYXNBbnlQcmUpIHtcblx0XHRcdFx0XHRzZXJ2ZXJDaGlsZHJlbi51bnNoaWZ0KHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzZXJ2ZXItcHJlJyxcblx0XHRcdFx0XHRcdHNlcnZlcklkLFxuXHRcdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5wbGF5KSxcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncnVuVG9vbHNXaXRob3V0QXBwcm92YWwnLCBcIlJ1biBhbnkgdG9vbCB3aXRob3V0IGFwcHJvdmFsXCIpLFxuXHRcdFx0XHRcdFx0Y2hlY2tlZDogc2VydmVyUHJlQ29uZmlybWVkXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTZXJ2ZXIgbm9kZSBoYXMgY2hlY2tib3ggdG8gY29udHJvbCBib3RoIHByZSBhbmQgcG9zdFxuXHRcdFx0XHRjb25zdCBzZXJ2ZXJIYXNQcmUgPSB0aGlzLl9wcmVFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmUuZ2V0QXV0b0NvbmZpcm1hdGlvbkluKHNlcnZlcklkLCBjdXJyZW50U2NvcGUpO1xuXHRcdFx0XHRjb25zdCBzZXJ2ZXJIYXNQb3N0ID0gdGhpcy5fcG9zdEV4ZWN1dGlvblNlcnZlckNvbmZpcm1TdG9yZS5nZXRBdXRvQ29uZmlybWF0aW9uSW4oc2VydmVySWQsIGN1cnJlbnRTY29wZSk7XG5cdFx0XHRcdGxldCBzZXJ2ZXJDaGVja2VkOiBib29sZWFuIHwgJ21peGVkJztcblx0XHRcdFx0aWYgKGhhc0FueVByZSAmJiBoYXNBbnlQb3N0KSB7XG5cdFx0XHRcdFx0c2VydmVyQ2hlY2tlZCA9IHNlcnZlckhhc1ByZSAmJiBzZXJ2ZXJIYXNQb3N0ID8gdHJ1ZSA6ICghc2VydmVySGFzUHJlICYmICFzZXJ2ZXJIYXNQb3N0ID8gZmFsc2UgOiAnbWl4ZWQnKTtcblx0XHRcdFx0fSBlbHNlIGlmIChoYXNBbnlQcmUpIHtcblx0XHRcdFx0XHRzZXJ2ZXJDaGVja2VkID0gc2VydmVySGFzUHJlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGhhc0FueVBvc3QpIHtcblx0XHRcdFx0XHRzZXJ2ZXJDaGVja2VkID0gc2VydmVySGFzUG9zdDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZXJ2ZXJDaGVja2VkID0gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBleGlzdGluZ0l0ZW0gPSBxdWlja1RyZWUuaXRlbVRyZWUuZmluZChpID0+IGkuc2VydmVySWQgPT09IHNlcnZlcklkKTtcblx0XHRcdFx0dHJlZUl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6ICdzZXJ2ZXInLFxuXHRcdFx0XHRcdHNlcnZlcklkLFxuXHRcdFx0XHRcdGxhYmVsOiBzZXJ2ZXJJbmZvLmxhYmVsLFxuXHRcdFx0XHRcdGNoZWNrZWQ6IHNlcnZlckNoZWNrZWQsXG5cdFx0XHRcdFx0Y2hpbGRyZW46IHNlcnZlckNoaWxkcmVuLFxuXHRcdFx0XHRcdGNvbGxhcHNlZDogZXhpc3RpbmdJdGVtID8gcXVpY2tUcmVlLmlzQ29sbGFwc2VkKGV4aXN0aW5nSXRlbSkgOiB0cnVlLFxuXHRcdFx0XHRcdHBpY2thYmxlOiBmYWxzZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQWRkIGluZGl2aWR1YWwgdG9vbCBub2RlcyAob25seSBmb3Igbm9uLU1DUC9leHRlbnNpb24gdG9vbHMpXG5cdFx0XHRjb25zdCBzb3J0ZWRUb29scyA9IHRvb2xzLnNsaWNlKCkuc29ydCgoYSwgYikgPT4gYS5kaXNwbGF5TmFtZS5sb2NhbGVDb21wYXJlKGIuZGlzcGxheU5hbWUpKTtcblx0XHRcdGZvciAoY29uc3QgdG9vbCBvZiBzb3J0ZWRUb29scykge1xuXHRcdFx0XHRpZiAoIXJlbGV2YW50VG9vbHMuaGFzKHRvb2wuaWQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTa2lwIHRvb2xzIHRoYXQgYmVsb25nIHRvIE1DUC9leHRlbnNpb24gc2VydmVycyAodGhleSdyZSBzaG93biB1bmRlciBzZXJ2ZXIgbm9kZXMpXG5cdFx0XHRcdGlmICh0b29sLnNvdXJjZS50eXBlID09PSAnbWNwJyB8fCB0b29sLnNvdXJjZS50eXBlID09PSAnZXh0ZW5zaW9uJykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY29udHJpYnV0ZWQgPSB0aGlzLl9jb250cmlidXRpb25zLmdldCh0b29sLmlkKTtcblx0XHRcdFx0Y29uc3QgdG9vbENoaWxkcmVuOiBJVG9vbFRyZWVJdGVtW10gPSBbXTtcblxuXHRcdFx0XHRjb25zdCBtYW5hZ2VBY3Rpb25zID0gY29udHJpYnV0ZWQ/LmdldE1hbmFnZUFjdGlvbnM/LigpO1xuXHRcdFx0XHRpZiAobWFuYWdlQWN0aW9ucykge1xuXHRcdFx0XHRcdHRvb2xDaGlsZHJlbi5wdXNoKC4uLm1hbmFnZUFjdGlvbnMubWFwKGFjdGlvbiA9PiAoe1xuXHRcdFx0XHRcdFx0dHlwZTogJ21hbmFnZScgYXMgY29uc3QsXG5cdFx0XHRcdFx0XHQuLi5hY3Rpb24sXG5cdFx0XHRcdFx0fSkpKTtcblx0XHRcdFx0fVxuXG5cblx0XHRcdFx0bGV0IGNoZWNrZWQ6IGJvb2xlYW4gfCAnbWl4ZWQnID0gZmFsc2U7XG5cdFx0XHRcdGxldCBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRsZXQgcGlja2FibGUgPSBmYWxzZTtcblxuXHRcdFx0XHRpZiAoY29udHJpYnV0ZWQ/LmNhblVzZURlZmF1bHRBcHByb3ZhbHMgIT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0cGlja2FibGUgPSB0cnVlO1xuXHRcdFx0XHRcdGNvbnN0IGhhc1ByZSA9IHRvb2wuY2FuUmVxdWVzdFByZUFwcHJvdmFsIHx8IHRoaXMuX3ByZUV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuZ2V0QXV0b0NvbmZpcm1hdGlvbkluKHRvb2wuaWQsIGN1cnJlbnRTY29wZSk7XG5cdFx0XHRcdFx0Y29uc3QgaGFzUG9zdCA9IHRvb2wuY2FuUmVxdWVzdFBvc3RBcHByb3ZhbCB8fCB0aGlzLl9wb3N0RXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5nZXRBdXRvQ29uZmlybWF0aW9uSW4odG9vbC5pZCwgY3VycmVudFNjb3BlKTtcblxuXHRcdFx0XHRcdC8vIEFkZCBjaGlsZCBpdGVtcyBmb3IgZ3JhbnVsYXIgY29udHJvbCB3aGVuIGJvdGggYXBwcm92YWwgdHlwZXMgZXhpc3Rcblx0XHRcdFx0XHRpZiAoaGFzUHJlICYmIGhhc1Bvc3QpIHtcblx0XHRcdFx0XHRcdHRvb2xDaGlsZHJlbi5wdXNoKHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3Rvb2wtcHJlJyxcblx0XHRcdFx0XHRcdFx0dG9vbElkOiB0b29sLmlkLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogUlVOX1dJVEhPVVRfQVBQUk9WQUwsXG5cdFx0XHRcdFx0XHRcdGNoZWNrZWQ6IHRoaXMuX3ByZUV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuZ2V0QXV0b0NvbmZpcm1hdGlvbkluKHRvb2wuaWQsIGN1cnJlbnRTY29wZSlcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0dG9vbENoaWxkcmVuLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAndG9vbC1wb3N0Jyxcblx0XHRcdFx0XHRcdFx0dG9vbElkOiB0b29sLmlkLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogQ09OVElOVUVfV0lUSE9VVF9SRVZJRVdJTkdfUkVTVUxUUyxcblx0XHRcdFx0XHRcdFx0Y2hlY2tlZDogdGhpcy5fcG9zdEV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuZ2V0QXV0b0NvbmZpcm1hdGlvbkluKHRvb2wuaWQsIGN1cnJlbnRTY29wZSlcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEFkZCBjb21iaW5hdGlvbiBhcHByb3ZhbCBjaGlsZHJlblxuXHRcdFx0XHRcdGNvbnN0IGNvbWJpbmF0aW9uQXBwcm92YWxzID0gdGhpcy5fZ2V0Q29tYmluYXRpb25BcHByb3ZhbHNGb3JUb29sKHRvb2wuaWQsIGN1cnJlbnRTY29wZSk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB7IGtleSwgbGFiZWwsIGFyZ3VtZW50czogYXJncyB9IG9mIGNvbWJpbmF0aW9uQXBwcm92YWxzKSB7XG5cdFx0XHRcdFx0XHR0b29sQ2hpbGRyZW4ucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdjb21iaW5hdGlvbicsXG5cdFx0XHRcdFx0XHRcdHRvb2xJZDogdG9vbC5pZCxcblx0XHRcdFx0XHRcdFx0Y29tYmluYXRpb25LZXk6IGtleSxcblx0XHRcdFx0XHRcdFx0Y29tYmluYXRpb25BcmdzOiBhcmdzLFxuXHRcdFx0XHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0XHRcdFx0Y2hlY2tlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0YnV0dG9uczogYXJncyA/IFt2aWV3QXJnc0J1dHRvbl0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBUb29sIGl0ZW0gYWx3YXlzIGhhcyBhIGNoZWNrYm94XG5cdFx0XHRcdFx0Y29uc3QgcHJlQXBwcm92YWwgPSB0aGlzLl9wcmVFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLmdldEF1dG9Db25maXJtYXRpb25Jbih0b29sLmlkLCBjdXJyZW50U2NvcGUpO1xuXHRcdFx0XHRcdGNvbnN0IHBvc3RBcHByb3ZhbCA9IHRoaXMuX3Bvc3RFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLmdldEF1dG9Db25maXJtYXRpb25Jbih0b29sLmlkLCBjdXJyZW50U2NvcGUpO1xuXG5cdFx0XHRcdFx0aWYgKGhhc1ByZSAmJiBoYXNQb3N0KSB7XG5cdFx0XHRcdFx0XHQvLyBCb3RoOiBjaGVja2JveCBpcyBtaXhlZCBpZiBvbmx5IG9uZSBpcyBlbmFibGVkXG5cdFx0XHRcdFx0XHRjaGVja2VkID0gcHJlQXBwcm92YWwgJiYgcG9zdEFwcHJvdmFsID8gdHJ1ZSA6ICghcHJlQXBwcm92YWwgJiYgIXBvc3RBcHByb3ZhbCA/IGZhbHNlIDogJ21peGVkJyk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChoYXNQcmUpIHtcblx0XHRcdFx0XHRcdGNoZWNrZWQgPSBwcmVBcHByb3ZhbDtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uID0gUlVOX1dJVEhPVVRfQVBQUk9WQUw7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChoYXNQb3N0KSB7XG5cdFx0XHRcdFx0XHRjaGVja2VkID0gcG9zdEFwcHJvdmFsO1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb24gPSBDT05USU5VRV9XSVRIT1VUX1JFVklFV0lOR19SRVNVTFRTO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBObyBhcHByb3ZhbCBjYXBhYmlsaXRpZXMgLSBzaG91bGRuJ3QgaGFwcGVuIGJ1dCBoYW5kbGUgaXRcblx0XHRcdFx0XHRcdGNoZWNrZWQgPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTa2lwIHRvb2xzIHdpdGggbm8gYWN0aXZlIGFwcHJvdmFscywgbm8gY2hpbGRyZW4sIGFuZCBubyBhcHByb3ZhbCBjYXBhYmlsaXRpZXMuXG5cdFx0XHRcdC8vIFRvb2xzIHRoYXQgY2FuIHJlcXVlc3QgcHJlL3Bvc3QgYXBwcm92YWwgc2hvdWxkIGFsd2F5cyByZW1haW4gdmlzaWJsZS5cblx0XHRcdFx0aWYgKGNoZWNrZWQgPT09IGZhbHNlICYmIHRvb2xDaGlsZHJlbi5sZW5ndGggPT09IDAgJiYgIXRvb2wuY2FuUmVxdWVzdFByZUFwcHJvdmFsICYmICF0b29sLmNhblJlcXVlc3RQb3N0QXBwcm92YWwgJiYgIXRoaXMuX2NvbnRyaWJ1dGlvbnMuaGFzKHRvb2wuaWQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cmVlSXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0dHlwZTogJ3Rvb2wnLFxuXHRcdFx0XHRcdHRvb2xJZDogdG9vbC5pZCxcblx0XHRcdFx0XHRsYWJlbDogdG9vbC5kaXNwbGF5TmFtZSB8fCB0b29sLmlkLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGNoZWNrZWQsXG5cdFx0XHRcdFx0cGlja2FibGUsXG5cdFx0XHRcdFx0Y29sbGFwc2VkOiB0b29scy5sZW5ndGggPiAxLFxuXHRcdFx0XHRcdGNoaWxkcmVuOiB0b29sQ2hpbGRyZW4ubGVuZ3RoID4gMCA/IHRvb2xDaGlsZHJlbiA6IHVuZGVmaW5lZFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRyZWVJdGVtcztcblx0XHR9O1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcXVpY2tUcmVlID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrVHJlZTxJVG9vbFRyZWVJdGVtPigpKTtcblx0XHRxdWlja1RyZWUuaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdHF1aWNrVHJlZS5zb3J0QnlMYWJlbCA9IGZhbHNlO1xuXG5cdFx0Ly8gT25seSBzaG93IHRvZ2dsZSBpZiBub3QgaW4gc2Vzc2lvbiBzY29wZVxuXHRcdGlmIChjdXJyZW50U2NvcGUgIT09ICdzZXNzaW9uJykge1xuXHRcdFx0Y29uc3Qgc2NvcGVCdXR0b246IElRdWlja0lucHV0QnV0dG9uV2l0aFRvZ2dsZSA9IHtcblx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5mb2xkZXIpLFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnd29ya3NwYWNlU2NvcGUnLCBcIkNvbmZpZ3VyZSBmb3IgdGhpcyB3b3Jrc3BhY2Ugb25seVwiKSxcblx0XHRcdFx0dG9nZ2xlOiB7IGNoZWNrZWQ6IGN1cnJlbnRTY29wZSA9PT0gJ3dvcmtzcGFjZScgfSxcblx0XHRcdFx0bG9jYXRpb246IFF1aWNrSW5wdXRCdXR0b25Mb2NhdGlvbi5JbnB1dFxuXHRcdFx0fTtcblx0XHRcdHF1aWNrVHJlZS5idXR0b25zID0gW3Njb3BlQnV0dG9uXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1RyZWUub25EaWRUcmlnZ2VyQnV0dG9uKGJ1dHRvbiA9PiB7XG5cdFx0XHRcdGlmIChidXR0b24gPT09IHNjb3BlQnV0dG9uKSB7XG5cdFx0XHRcdFx0Y3VycmVudFNjb3BlID0gY3VycmVudFNjb3BlID09PSAnd29ya3NwYWNlJyA/ICdwcm9maWxlJyA6ICd3b3Jrc3BhY2UnO1xuXHRcdFx0XHRcdHVwZGF0ZVBsYWNlaG9sZGVyKCk7XG5cdFx0XHRcdFx0cXVpY2tUcmVlLnNldEl0ZW1UcmVlKGJ1aWxkVHJlZUl0ZW1zKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXBkYXRlUGxhY2Vob2xkZXIgPSAoKSA9PiB7XG5cdFx0XHRpZiAoY3VycmVudFNjb3BlID09PSAnc2Vzc2lvbicpIHtcblx0XHRcdFx0cXVpY2tUcmVlLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2NvbmZpZ3VyZVNlc3Npb25Ub29sQXBwcm92YWxzJywgXCJDb25maWd1cmUgc2Vzc2lvbiB0b29sIGFwcHJvdmFsc1wiKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHF1aWNrVHJlZS5wbGFjZWhvbGRlciA9IGN1cnJlbnRTY29wZSA9PT0gJ3dvcmtzcGFjZSdcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjb25maWd1cmVXb3Jrc3BhY2VUb29sQXBwcm92YWxzJywgXCJDb25maWd1cmUgd29ya3NwYWNlIHRvb2wgYXBwcm92YWxzXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY29uZmlndXJlR2xvYmFsVG9vbEFwcHJvdmFscycsIFwiQ29uZmlndXJlIGdsb2JhbCB0b29sIGFwcHJvdmFsc1wiKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHVwZGF0ZVBsYWNlaG9sZGVyKCk7XG5cblx0XHRxdWlja1RyZWUuc2V0SXRlbVRyZWUoYnVpbGRUcmVlSXRlbXMoKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tUcmVlLm9uRGlkQ2hhbmdlQ2hlY2tib3hTdGF0ZShpdGVtID0+IHtcblx0XHRcdGNvbnN0IG5ld1N0YXRlID0gaXRlbS5jaGVja2VkID8gY3VycmVudFNjb3BlIDogJ25ldmVyJztcblxuXHRcdFx0aWYgKGl0ZW0udHlwZSA9PT0gJ3NlcnZlcicgJiYgaXRlbS5zZXJ2ZXJJZCkge1xuXHRcdFx0XHQvLyBTZXJ2ZXItbGV2ZWwgY2hlY2tib3g6IHVwZGF0ZSBib3RoIHByZSBhbmQgcG9zdCBiYXNlZCBvbiBzZXJ2ZXIgY2FwYWJpbGl0aWVzXG5cdFx0XHRcdGNvbnN0IHNlcnZlckluZm8gPSBzZXJ2ZXJzV2l0aFRvb2xzLmdldChpdGVtLnNlcnZlcklkKTtcblx0XHRcdFx0aWYgKHNlcnZlckluZm8pIHtcblx0XHRcdFx0XHR0aGlzLl9wcmVFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihpdGVtLnNlcnZlcklkLCBuZXdTdGF0ZSk7XG5cdFx0XHRcdFx0dGhpcy5fcG9zdEV4ZWN1dGlvblNlcnZlckNvbmZpcm1TdG9yZS5zZXRBdXRvQ29uZmlybWF0aW9uKGl0ZW0uc2VydmVySWQsIG5ld1N0YXRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChpdGVtLnR5cGUgPT09ICd0b29sJyAmJiBpdGVtLnRvb2xJZCkge1xuXHRcdFx0XHRjb25zdCB0b29sID0gdG9vbHMuZmluZCh0ID0+IHQuaWQgPT09IGl0ZW0udG9vbElkKTtcblx0XHRcdFx0aWYgKHRvb2w/LmNhblJlcXVlc3RQb3N0QXBwcm92YWwgfHwgbmV3U3RhdGUgPT09ICduZXZlcicpIHtcblx0XHRcdFx0XHR0aGlzLl9wb3N0RXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5zZXRBdXRvQ29uZmlybWF0aW9uKGl0ZW0udG9vbElkLCBuZXdTdGF0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRvb2w/LmNhblJlcXVlc3RQcmVBcHByb3ZhbCB8fCBuZXdTdGF0ZSA9PT0gJ25ldmVyJykge1xuXHRcdFx0XHRcdHRoaXMuX3ByZUV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihpdGVtLnRvb2xJZCwgbmV3U3RhdGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEFsc28gY2xlYXIgY29tYmluYXRpb24gYXBwcm92YWxzIHdoZW4gdW5jaGVja2luZyB0aGUgdG9vbFxuXHRcdFx0XHRpZiAobmV3U3RhdGUgPT09ICduZXZlcicpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiB0aGlzLl9jb21iaW5hdGlvbkNvbmZpcm1TdG9yZS5nZXRBbGxDb25maXJtZWQoKSkge1xuXHRcdFx0XHRcdFx0aWYgKGtleS5zdGFydHNXaXRoKGl0ZW0udG9vbElkICsgJzpjb21iaW5hdGlvbjonKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9jb21iaW5hdGlvbkNvbmZpcm1TdG9yZS5zZXRBdXRvQ29uZmlybWF0aW9uKGtleSwgJ25ldmVyJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHF1aWNrVHJlZS5zZXRJdGVtVHJlZShidWlsZFRyZWVJdGVtcygpKTtcblx0XHRcdH0gZWxzZSBpZiAoaXRlbS50eXBlID09PSAndG9vbC1wcmUnICYmIGl0ZW0udG9vbElkKSB7XG5cdFx0XHRcdHRoaXMuX3ByZUV4ZWN1dGlvblRvb2xDb25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihpdGVtLnRvb2xJZCwgbmV3U3RhdGUpO1xuXHRcdFx0fSBlbHNlIGlmIChpdGVtLnR5cGUgPT09ICd0b29sLXBvc3QnICYmIGl0ZW0udG9vbElkKSB7XG5cdFx0XHRcdHRoaXMuX3Bvc3RFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLnNldEF1dG9Db25maXJtYXRpb24oaXRlbS50b29sSWQsIG5ld1N0YXRlKTtcblx0XHRcdH0gZWxzZSBpZiAoaXRlbS50eXBlID09PSAnc2VydmVyLXByZScgJiYgaXRlbS5zZXJ2ZXJJZCkge1xuXHRcdFx0XHR0aGlzLl9wcmVFeGVjdXRpb25TZXJ2ZXJDb25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihpdGVtLnNlcnZlcklkLCBuZXdTdGF0ZSk7XG5cdFx0XHRcdHF1aWNrVHJlZS5zZXRJdGVtVHJlZShidWlsZFRyZWVJdGVtcygpKTtcblx0XHRcdH0gZWxzZSBpZiAoaXRlbS50eXBlID09PSAnc2VydmVyLXBvc3QnICYmIGl0ZW0uc2VydmVySWQpIHtcblx0XHRcdFx0dGhpcy5fcG9zdEV4ZWN1dGlvblNlcnZlckNvbmZpcm1TdG9yZS5zZXRBdXRvQ29uZmlybWF0aW9uKGl0ZW0uc2VydmVySWQsIG5ld1N0YXRlKTtcblx0XHRcdFx0cXVpY2tUcmVlLnNldEl0ZW1UcmVlKGJ1aWxkVHJlZUl0ZW1zKCkpO1xuXHRcdFx0fSBlbHNlIGlmIChpdGVtLnR5cGUgPT09ICdtYW5hZ2UnKSB7XG5cdFx0XHRcdChpdGVtIGFzIElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvblF1aWNrVHJlZUl0ZW0pLm9uRGlkQ2hhbmdlQ2hlY2tlZD8uKCEhaXRlbS5jaGVja2VkKTtcblx0XHRcdH0gZWxzZSBpZiAoaXRlbS50eXBlID09PSAnY29tYmluYXRpb24nICYmIGl0ZW0uY29tYmluYXRpb25LZXkpIHtcblx0XHRcdFx0dGhpcy5fY29tYmluYXRpb25Db25maXJtU3RvcmUuc2V0QXV0b0NvbmZpcm1hdGlvbihpdGVtLmNvbWJpbmF0aW9uS2V5LCBuZXdTdGF0ZSwgaXRlbS5sYWJlbCwgaXRlbS5jb21iaW5hdGlvbkFyZ3MpO1xuXHRcdFx0XHRxdWlja1RyZWUuc2V0SXRlbVRyZWUoYnVpbGRUcmVlSXRlbXMoKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrVHJlZS5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uKGkgPT4ge1xuXHRcdFx0aWYgKGkuaXRlbS50eXBlID09PSAnbWFuYWdlJykge1xuXHRcdFx0XHQoaS5pdGVtIGFzIElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvblF1aWNrVHJlZUl0ZW0pLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24/LihpLmJ1dHRvbik7XG5cdFx0XHR9IGVsc2UgaWYgKGkuaXRlbS50eXBlID09PSAnY29tYmluYXRpb24nICYmIGkuYnV0dG9uID09PSB2aWV3QXJnc0J1dHRvbiAmJiBpLml0ZW0uY29tYmluYXRpb25BcmdzKSB7XG5cdFx0XHRcdHRoaXMuX2RpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29tYmluYXRpb25Bcmd1bWVudHMnLCBcIkFyZ3VtZW50c1wiKSxcblx0XHRcdFx0XHRidXR0b25zOiBbXSxcblx0XHRcdFx0XHRjdXN0b206IHtcblx0XHRcdFx0XHRcdG1hcmtkb3duRGV0YWlsczogW3tcblx0XHRcdFx0XHRcdFx0bWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZENvZGVibG9jaygnanNvbicsIGkuaXRlbS5jb21iaW5hdGlvbkFyZ3MpLFxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrVHJlZS5vbkRpZEFjY2VwdChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5hZ2VJdGVtID0gcXVpY2tUcmVlLmFjdGl2ZUl0ZW1zLmZpbmQoaSA9PiBpLnR5cGUgPT09ICdtYW5hZ2UnKTtcblx0XHRcdGlmIChtYW5hZ2VJdGVtKSB7XG5cdFx0XHRcdHF1aWNrVHJlZS5oaWRlKCk7XG5cdFx0XHRcdGF3YWl0IChtYW5hZ2VJdGVtIGFzIElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvblF1aWNrVHJlZUl0ZW0pLm9uRGlkT3Blbj8uKCk7XG5cdFx0XHRcdHRoaXMubWFuYWdlQ29uZmlybWF0aW9uUHJlZmVyZW5jZXModG9vbHMsIG9wdGlvbnMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cXVpY2tUcmVlLmhpZGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tUcmVlLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXG5cdFx0cXVpY2tUcmVlLnNob3coKTtcblxuXHRcdC8vIElmIGEgZm9jdXMgdG9vbCB3YXMgc3BlY2lmaWVkLCBleHBhbmQgaXRzIHBhcmVudCBhbmQgc2V0IGl0IGFzIGFjdGl2ZS5cblx0XHQvLyBNdXN0IGhhcHBlbiBhZnRlciBzaG93KCkgc2luY2UgdGhlIHRyZWUgZGF0YSBpcyBhcHBsaWVkIHZpYSBhdXRvcnVuIG9uIHZpc2liaWxpdHkuXG5cdFx0aWYgKG9wdGlvbnM/LmZvY3VzVG9vbElkKSB7XG5cdFx0XHRjb25zdCBmb2N1c1Rvb2xJZCA9IG9wdGlvbnMuZm9jdXNUb29sSWQ7XG5cdFx0XHRmb3IgKGNvbnN0IHNlcnZlckl0ZW0gb2YgcXVpY2tUcmVlLml0ZW1UcmVlKSB7XG5cdFx0XHRcdGNvbnN0IHNlcnZlckl0ZW1UeXBlZCA9IHNlcnZlckl0ZW0gYXMgSVRvb2xUcmVlSXRlbTtcblx0XHRcdFx0aWYgKHNlcnZlckl0ZW1UeXBlZC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGNvbnN0IHRvb2xJdGVtID0gKHNlcnZlckl0ZW1UeXBlZC5jaGlsZHJlbiBhcyBJVG9vbFRyZWVJdGVtW10pLmZpbmQoYyA9PiBjLnR5cGUgPT09ICd0b29sJyAmJiBjLnRvb2xJZCA9PT0gZm9jdXNUb29sSWQpO1xuXHRcdFx0XHRcdGlmICh0b29sSXRlbSkge1xuXHRcdFx0XHRcdFx0cXVpY2tUcmVlLmV4cGFuZChzZXJ2ZXJJdGVtKTtcblx0XHRcdFx0XHRcdHF1aWNrVHJlZS5yZXZlYWwodG9vbEl0ZW0pO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlc2V0VG9vbEF1dG9Db25maXJtYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJlRXhlY3V0aW9uVG9vbENvbmZpcm1TdG9yZS5yZXNldCgpO1xuXHRcdHRoaXMuX3Bvc3RFeGVjdXRpb25Ub29sQ29uZmlybVN0b3JlLnJlc2V0KCk7XG5cdFx0dGhpcy5fcHJlRXhlY3V0aW9uU2VydmVyQ29uZmlybVN0b3JlLnJlc2V0KCk7XG5cdFx0dGhpcy5fcG9zdEV4ZWN1dGlvblNlcnZlckNvbmZpcm1TdG9yZS5yZXNldCgpO1xuXHRcdHRoaXMuX2NvbWJpbmF0aW9uQ29uZmlybVN0b3JlLnJlc2V0KCk7XG5cblx0XHQvLyBSZXNldCBhbGwgY29udHJpYnV0aW9uc1xuXHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIHRoaXMuX2NvbnRyaWJ1dGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdGNvbnRyaWJ1dGlvbi5yZXNldD8uKCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVk7QUFDckIsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUF5RCxvQkFBb0MsZ0NBQWdDO0FBQzdILFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsc0JBQXNCO0FBQy9CLFNBQTBCLHVCQUF1QjtBQUlqRCxNQUFNLHVCQUF1QixTQUFTLHNCQUFzQixrQkFBa0I7QUFDOUUsTUFBTSxxQ0FBcUMsU0FBUyxtQ0FBbUMsMEJBQTBCO0FBZWpILE1BQU0sNEJBQTRCLFdBQVc7QUFBQSxFQUs1QyxZQUNrQixhQUNBLHVCQUNoQjtBQUNELFVBQU07QUFIVztBQUNBO0FBSmxCLFNBQVEsZUFBZSxvQkFBSSxJQUErQjtBQU96RCxTQUFLLGtCQUFrQixJQUFJLEtBQUssTUFBTSxLQUFLLFVBQVUsS0FBSyxzQkFBc0IsZUFBZSxrQkFBa0IsYUFBYSxXQUFXLEtBQUssV0FBVyxDQUFDLENBQUM7QUFDM0osU0FBSyxnQkFBZ0IsSUFBSSxLQUFLLE1BQU0sS0FBSyxVQUFVLEtBQUssc0JBQXNCLGVBQWUsa0JBQWtCLGFBQWEsU0FBUyxLQUFLLFdBQVcsQ0FBQyxDQUFDO0FBQUEsRUFDeEo7QUFBQSxFQUVPLG9CQUFvQixJQUFZLE9BQXNELE9BQWdCLE1BQXFCO0FBRWpJLFNBQUssZ0JBQWdCLE1BQU0sZUFBZSxJQUFJLE1BQVM7QUFDdkQsU0FBSyxjQUFjLE1BQU0sZUFBZSxJQUFJLE1BQVM7QUFDckQsU0FBSyxhQUFhLE9BQU8sRUFBRTtBQUUz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
