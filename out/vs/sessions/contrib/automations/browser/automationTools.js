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
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { ConfirmationOptionKind } from "../../../../platform/agentHost/common/state/protocol/channels-chat/state.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { IAutomationRunner } from "../../../../workbench/contrib/chat/common/automations/automationRunner.js";
import { ConfigureAutomationToolReferenceName, IAutomationService, serializeAutomationEditableState } from "../../../../workbench/contrib/chat/common/automations/automationService.js";
import { ChatAutomationsEnabledContext, CHAT_AUTOMATIONS_ENABLED_SETTING } from "../../../../workbench/contrib/chat/common/automations/automationsEnabled.js";
import { ChatModeKind, ChatPermissionLevel } from "../../../../workbench/contrib/chat/common/constants.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
const ListAutomationsToolId = "vscode_listAutomations";
const ConfigureAutomationToolId = "vscode_configureAutomation";
const RunAutomationToolId = "vscode_runAutomation";
const DeleteAutomationToolId = "vscode_deleteAutomation";
const automationToolWhen = ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext);
const deleteAutomationConfirmationId = "delete";
const manualRunLeaderWindowId = 0;
const automationIntervals = ["manual", "hourly", "daily", "weekly"];
const automationIsolationKinds = ["default", "folder", "worktree"];
const chatModes = [ChatModeKind.Agent, ChatModeKind.Ask, ChatModeKind.Edit];
const chatPermissionLevels = [ChatPermissionLevel.Default, ChatPermissionLevel.Assisted, ChatPermissionLevel.AutoApprove, ChatPermissionLevel.Autopilot];
class AutomationToolInputError extends Error {
}
class AutomationToolMutationBlockedError extends Error {
  constructor(result) {
    super("Automation mutation blocked");
    this.result = result;
  }
}
let ListAutomationsTool = class {
  constructor(automationService, configurationService) {
    this.automationService = automationService;
    this.configurationService = configurationService;
  }
  getToolData() {
    return {
      id: ListAutomationsToolId,
      toolReferenceName: "listAutomations",
      canBeReferencedInPrompt: false,
      icon: Codicon.watch,
      displayName: localize("automation.tool.list.displayName", "List Automations"),
      userDescription: localize("automation.tool.list.userDescription", "List scheduled agent automations"),
      modelDescription: "List all configured scheduled automations and their stable IDs, editable fields, targets, and timing metadata. Use this before configureAutomation, runAutomation, or deleteAutomation when acting on an existing automation. This tool never changes automation state.",
      source: ToolDataSource.Internal,
      when: automationToolWhen,
      runsInWorkspace: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    };
  }
  async prepareToolInvocation(_context, _token) {
    return {
      invocationMessage: localize("automation.tool.list.invocationMessage", "Reading automations"),
      pastTenseMessage: localize("automation.tool.list.pastTenseMessage", "Read automations")
    };
  }
  async invoke(_invocation, _countTokens, _progress, _token) {
    if (!isAutomationsEnabled(this.configurationService)) {
      return automationToolError("Automations are disabled.");
    }
    const automations = this.automationService.automations.get().map(toAutomationToolOutput);
    const result = automationToolResult(JSON.stringify({ automations }, void 0, 2));
    result.toolResultMessage = automations.length === 1 ? localize("automation.tool.list.result.singular", "Listed 1 automation") : localize("automation.tool.list.result.plural", "Listed {0} automations", automations.length);
    return result;
  }
};
ListAutomationsTool = __decorateClass([
  __decorateParam(0, IAutomationService),
  __decorateParam(1, IConfigurationService)
], ListAutomationsTool);
let RunAutomationTool = class {
  constructor(automationService, automationRunner, configurationService) {
    this.automationService = automationService;
    this.automationRunner = automationRunner;
    this.configurationService = configurationService;
  }
  getToolData() {
    return {
      id: RunAutomationToolId,
      toolReferenceName: "runAutomation",
      canBeReferencedInPrompt: false,
      icon: Codicon.play,
      displayName: localize("automation.tool.run.displayName", "Run Automation"),
      userDescription: localize("automation.tool.run.userDescription", "Run a configured agent automation now"),
      modelDescription: "Run a configured automation immediately by stable ID. Call listAutomations first to obtain the current ID. This starts a fresh agent session in the background using the saved prompt, target, model, mode, and permission level, even when scheduled runs are disabled. The tool returns after session dispatch commits; do not run it again unless the user asks.",
      source: ToolDataSource.Internal,
      when: automationToolWhen,
      runsInWorkspace: false,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          automationId: {
            type: "string",
            description: "Stable automation ID from listAutomations."
          }
        },
        required: ["automationId"]
      }
    };
  }
  async prepareToolInvocation(context, _token) {
    if (!isAutomationsEnabled(this.configurationService)) {
      throw new AutomationToolInputError("Automations are disabled.");
    }
    const automation = resolveAutomationInput(this.automationService, context.parameters, "runAutomation");
    const activeRun = this.automationService.getActiveRunFor(automation.id);
    if (activeRun) {
      return {
        invocationMessage: localize("automation.tool.run.alreadyRunning", "Automation {0} is already running", automation.name),
        pastTenseMessage: localize("automation.tool.run.wasAlreadyRunning", "Automation {0} was already running", automation.name)
      };
    }
    return {
      invocationMessage: localize("automation.tool.run.invocationMessage", "Running automation {0}", automation.name),
      pastTenseMessage: localize("automation.tool.run.pastTenseMessage", "Started automation {0}", automation.name),
      confirmationMessages: {
        title: localize("automation.tool.run.confirmationTitle", "Run Automation?"),
        message: new MarkdownString(localize(
          "automation.tool.run.confirmationMessage",
          "Run **{0}** (`{1}`) now? This starts a new agent session using the automation's configured prompt and permissions.",
          automation.name,
          automation.id
        ))
      }
    };
  }
  async invoke(invocation, _countTokens, _progress, token) {
    if (!isAutomationsEnabled(this.configurationService)) {
      return automationToolError("Automations are disabled.");
    }
    if (token.isCancellationRequested) {
      return automationRunCancelled();
    }
    let automation;
    try {
      automation = resolveAutomationInput(this.automationService, invocation.parameters, "runAutomation");
    } catch (error) {
      if (error instanceof AutomationToolInputError) {
        return automationToolError(error.message);
      }
      throw error;
    }
    const dispatchCancellation = new CancellationTokenSource(token);
    const operation = this.automationRunner.runOnce(automation, "manual", manualRunLeaderWindowId, dispatchCancellation.token);
    let dispatch;
    try {
      dispatch = await operation.whenDispatched;
    } finally {
      dispatchCancellation.dispose();
    }
    if (dispatch.kind === "alreadyRunning") {
      return automationAlreadyRunning(automation, dispatch.activeRun);
    }
    if (dispatch.kind === "notStarted") {
      return automationNotStarted(automation, dispatch);
    }
    const result = automationToolResult(JSON.stringify({
      status: "started",
      automation: { id: automation.id, name: automation.name },
      run: {
        id: dispatch.run.id,
        status: dispatch.run.status,
        sessionResource: dispatch.sessionResource
      }
    }, void 0, 2));
    result.toolResultMessage = localize("automation.tool.run.started", "Started automation {0}", automation.name);
    return result;
  }
};
RunAutomationTool = __decorateClass([
  __decorateParam(0, IAutomationService),
  __decorateParam(1, IAutomationRunner),
  __decorateParam(2, IConfigurationService)
], RunAutomationTool);
let DeleteAutomationTool = class {
  constructor(automationService, configurationService) {
    this.automationService = automationService;
    this.configurationService = configurationService;
  }
  getToolData() {
    return {
      id: DeleteAutomationToolId,
      toolReferenceName: "deleteAutomation",
      canBeReferencedInPrompt: false,
      icon: Codicon.trash,
      displayName: localize("automation.tool.delete.displayName", "Delete Automation"),
      userDescription: localize("automation.tool.delete.userDescription", "Delete a scheduled agent automation"),
      modelDescription: "Delete an automation by stable ID. Call listAutomations first to obtain the current ID. The current approval policy may approve the action automatically; otherwise the user is shown a Delete/Cancel confirmation.",
      source: ToolDataSource.Internal,
      when: automationToolWhen,
      runsInWorkspace: false,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          automationId: {
            type: "string",
            description: "Stable automation ID from listAutomations."
          }
        },
        required: ["automationId"]
      }
    };
  }
  async prepareToolInvocation(context, _token) {
    if (!isAutomationsEnabled(this.configurationService)) {
      throw new AutomationToolInputError("Automations are disabled.");
    }
    const automation = resolveAutomationInput(this.automationService, context.parameters, "deleteAutomation");
    return {
      invocationMessage: localize("automation.tool.delete.invocationMessage", "Deleting automation {0}", automation.name),
      pastTenseMessage: localize("automation.tool.delete.pastTenseMessage", "Deleted automation {0}", automation.name),
      confirmationMessages: {
        title: localize("automation.tool.delete.confirmationTitle", "Delete Automation?"),
        message: new MarkdownString(localize(
          "automation.tool.delete.confirmationMessage",
          "Delete **{0}** (`{1}`)? Its saved configuration and run history will be permanently removed. Runs already in flight will continue.",
          automation.name,
          automation.id
        )),
        customOptions: [
          { id: deleteAutomationConfirmationId, label: localize("automation.tool.delete.confirm", "Delete"), kind: ConfirmationOptionKind.Approve },
          { id: "cancel", label: localize("automation.tool.delete.cancel", "Cancel"), kind: ConfirmationOptionKind.Deny }
        ]
      }
    };
  }
  async invoke(invocation, _countTokens, _progress, token) {
    if (!isAutomationsEnabled(this.configurationService)) {
      return automationToolError("Automations are disabled.");
    }
    if (token.isCancellationRequested) {
      return automationDeleteCancelled();
    }
    let automation;
    try {
      automation = resolveAutomationInput(this.automationService, invocation.parameters, "deleteAutomation");
    } catch (error) {
      if (error instanceof AutomationToolInputError) {
        return automationToolError(error.message);
      }
      throw error;
    }
    if (invocation.selectedCustomButton !== void 0 && invocation.selectedCustomButton !== deleteAutomationConfirmationId) {
      return automationDeleteCancelled();
    }
    try {
      await this.automationService.deleteAutomation(automation.id, this.createMutationGuard(token));
    } catch (error) {
      if (error instanceof AutomationToolMutationBlockedError) {
        return error.result;
      }
      throw error;
    }
    const result = automationToolResult(JSON.stringify({
      status: "deleted",
      automation: { id: automation.id, name: automation.name }
    }));
    result.toolResultMessage = localize("automation.tool.delete.deleted", "Deleted automation {0}", automation.name);
    return result;
  }
  createMutationGuard(token) {
    return () => {
      if (!isAutomationsEnabled(this.configurationService)) {
        throw new AutomationToolMutationBlockedError(automationToolError("Automations are disabled."));
      }
      if (token.isCancellationRequested) {
        throw new AutomationToolMutationBlockedError(automationDeleteCancelled());
      }
    };
  }
};
DeleteAutomationTool = __decorateClass([
  __decorateParam(0, IAutomationService),
  __decorateParam(1, IConfigurationService)
], DeleteAutomationTool);
let ConfigureAutomationTool = class {
  constructor(automationService, sessionsManagementService, configurationService) {
    this.automationService = automationService;
    this.sessionsManagementService = sessionsManagementService;
    this.configurationService = configurationService;
  }
  getToolData() {
    return {
      id: ConfigureAutomationToolId,
      toolReferenceName: ConfigureAutomationToolReferenceName,
      canBeReferencedInPrompt: false,
      icon: Codicon.watch,
      displayName: localize("automation.tool.configure.displayName", "Configure Automation"),
      userDescription: localize("automation.tool.configure.userDescription", "Create or update an automation"),
      modelDescription: `Create or update a scheduled automation.

Omit "automationId" to create an automation; "name", "prompt", and "schedule.interval" are then required. If "target" is omitted, the automation targets the current Agents window session.
Include "automationId" to update an existing automation, and only provide fields that should change. Call listAutomations first to obtain the stable ID and current values.
The change uses the current tool-approval policy. When approval is required, the user sees a normal tool confirmation. If the user cancels or denies the request, do not retry unless they ask you to.`,
      source: ToolDataSource.Internal,
      when: automationToolWhen,
      runsInWorkspace: false,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          automationId: {
            type: "string",
            description: "Stable automation ID from listAutomations. Omit to create a new automation."
          },
          name: {
            type: "string",
            description: "Automation name. Required when creating."
          },
          prompt: {
            type: "string",
            description: "Prompt sent when the automation runs. Required when creating."
          },
          schedule: {
            type: "object",
            additionalProperties: false,
            description: "Schedule proposal. Required when creating. Omitted fields preserve existing values when updating; create defaults are 09:00 Monday.",
            properties: {
              interval: {
                type: "string",
                enum: [...automationIntervals],
                description: "manual, hourly, daily, or weekly."
              },
              scheduleHour: {
                type: "integer",
                minimum: 0,
                maximum: 23,
                description: "Local hour, used for daily and weekly schedules."
              },
              scheduleMinute: {
                type: "integer",
                minimum: 0,
                maximum: 59,
                description: "Local minute, used for daily and weekly schedules."
              },
              scheduleDay: {
                type: "integer",
                minimum: 0,
                maximum: 6,
                description: "Day of week for weekly schedules: 0 is Sunday and 6 is Saturday."
              }
            }
          },
          target: {
            type: "object",
            additionalProperties: false,
            description: "Run target. Omit when creating to use the current session, or omit when updating to preserve the existing target.",
            properties: {
              kind: {
                type: "string",
                enum: ["currentSession", "workspace", "quickChat"]
              },
              folderUri: {
                type: "string",
                description: "Full workspace URI for a workspace target."
              },
              providerId: {
                type: "string",
                description: "Sessions provider ID."
              },
              sessionTypeId: {
                type: "string",
                description: "Sessions provider session-type ID."
              },
              isolation: {
                type: "string",
                enum: [...automationIsolationKinds],
                description: "Workspace isolation: default, folder, or worktree."
              },
              branch: {
                type: "string",
                description: "Base branch, required for worktree isolation."
              }
            },
            required: ["kind"]
          },
          modelId: {
            type: ["string", "null"],
            description: "Language model ID, or null to use the provider default."
          },
          mode: {
            enum: [...chatModes, null],
            description: "Chat mode, or null to use the provider default."
          },
          permissionLevel: {
            enum: [...chatPermissionLevels, null],
            description: "Permission level, or null to use the provider default."
          },
          enabled: {
            type: "boolean",
            description: "Whether scheduled runs are enabled. Defaults to true when creating."
          }
        }
      }
    };
  }
  async prepareToolInvocation(context, _token) {
    if (!isAutomationsEnabled(this.configurationService)) {
      throw new AutomationToolInputError("Automations are disabled.");
    }
    const proposal = this.parseProposal(context.parameters, context.chatSessionResource);
    const isUpdate = proposal.kind === "update";
    return {
      invocationMessage: isUpdate ? localize("automation.tool.configure.update.invocationMessage", "Configuring automation") : localize("automation.tool.configure.create.invocationMessage", "Configuring a new automation"),
      pastTenseMessage: isUpdate ? localize("automation.tool.configure.update.pastTenseMessage", "Configured automation") : localize("automation.tool.configure.create.pastTenseMessage", "Configured a new automation"),
      confirmationMessages: {
        title: isUpdate ? localize("automation.tool.configure.update.confirmationTitle", "Update Automation?") : localize("automation.tool.configure.create.confirmationTitle", "Create Automation?"),
        message: isUpdate ? new MarkdownString(localize(
          "automation.tool.configure.update.confirmationMessage",
          "Apply the proposed changes to **{0}** (`{1}`)?",
          proposal.existing.name,
          proposal.existing.id
        )) : new MarkdownString(localize(
          "automation.tool.configure.create.confirmationMessage",
          "Create the automation **{0}**?",
          proposal.initialValues.name
        ))
      },
      toolSpecificData: proposal.kind === "update" ? {
        kind: "automationConfiguration",
        expectedAutomationId: proposal.existing.id,
        expectedEditableState: serializeAutomationEditableState(proposal.existing)
      } : void 0
    };
  }
  async invoke(invocation, _countTokens, _progress, token) {
    if (!isAutomationsEnabled(this.configurationService)) {
      return automationToolError("Automations are disabled.");
    }
    if (token.isCancellationRequested) {
      return automationToolCancelled();
    }
    let proposal;
    try {
      proposal = this.parseProposal(invocation.parameters, invocation.context?.sessionResource);
    } catch (error) {
      if (error instanceof AutomationToolInputError) {
        return automationToolError(error.message);
      }
      throw error;
    }
    try {
      if (proposal.kind === "create") {
        const target2 = proposal.validateTargetAvailability ? this.resolveAvailableTarget(proposal.initialValues.target) : proposal.initialValues.target;
        return await this.applyCreate({ ...proposal.initialValues, target: target2 }, token);
      }
      const target = proposal.initialValues.target ? proposal.validateTargetAvailability ? this.resolveAvailableTarget(proposal.initialValues.target) : proposal.initialValues.target : void 0;
      const patch = target ? { ...proposal.initialValues, target } : proposal.initialValues;
      const prepared = invocation.toolSpecificData?.kind === "automationConfiguration" ? invocation.toolSpecificData : void 0;
      if (prepared && (prepared.expectedAutomationId !== proposal.existing.id || prepared.expectedEditableState !== serializeAutomationEditableState(proposal.existing))) {
        return automationToolError(`Automation "${proposal.existing.id}" changed before the update was applied. Call listAutomations to refresh it before proposing new changes. No changes were made.`);
      }
      return await this.applyUpdate(proposal.existing, patch, token);
    } catch (error) {
      if (error instanceof AutomationToolMutationBlockedError) {
        return error.result;
      }
      if (error instanceof AutomationToolInputError) {
        return automationToolError(error.message);
      }
      throw error;
    }
  }
  async applyCreate(options, token) {
    const blocked = this.getMutationBlockedResult(token);
    if (blocked) {
      return blocked;
    }
    const created = await this.automationService.createAutomation(options, this.createMutationGuard(token));
    const result = automationToolResult(JSON.stringify({ status: "created", automation: toAutomationToolOutput(created) }, void 0, 2));
    result.toolSpecificData = toAutomationConfiguredData(created, "created");
    result.toolResultMessage = localize("automation.tool.configure.created", "Created automation {0}", created.name);
    return result;
  }
  async applyUpdate(existing, patch, token) {
    const blocked = this.getMutationBlockedResult(token);
    if (blocked) {
      return blocked;
    }
    const updateResult = await this.automationService.updateAutomationIfUnchanged(existing.id, patch, existing, this.createMutationGuard(token));
    if (updateResult.kind === "conflict" && !updateResult.current) {
      return automationToolError(`Automation "${existing.id}" was deleted before the update was applied. No changes were made.`);
    }
    if (updateResult.kind === "conflict") {
      return automationToolError(`Automation "${existing.id}" changed before the update was applied. Call listAutomations to refresh it before proposing new changes. No changes were made.`);
    }
    const updated = updateResult.automation;
    const result = automationToolResult(JSON.stringify({ status: "updated", automation: toAutomationToolOutput(updated) }, void 0, 2));
    result.toolSpecificData = toAutomationConfiguredData(updated, "updated");
    result.toolResultMessage = localize("automation.tool.configure.updated", "Updated automation {0}", updated.name);
    return result;
  }
  createMutationGuard(token) {
    return () => {
      const blocked = this.getMutationBlockedResult(token);
      if (blocked) {
        throw new AutomationToolMutationBlockedError(blocked);
      }
    };
  }
  getMutationBlockedResult(token) {
    if (!isAutomationsEnabled(this.configurationService)) {
      return automationToolError("Automations are disabled.");
    }
    if (token.isCancellationRequested) {
      return automationToolCancelled();
    }
    return void 0;
  }
  resolveAvailableTarget(target) {
    const candidates = target.kind === "quickChat" ? this.sessionsManagementService.getQuickChatSessionTypes() : this.sessionsManagementService.getSessionTypesForFolder(target.folderUri);
    const candidate = findSessionType(candidates, target.providerId, target.sessionTypeId);
    if (!candidate) {
      throw new AutomationToolInputError(target.kind === "quickChat" ? `The quick-chat target "${target.providerId}/${target.sessionTypeId}" is not available.` : "The proposed workspace target is not available for the selected provider and session type.");
    }
    if (target.kind === "workspace" && target.isolation.kind === "worktree" && !candidate.sessionType.supportsWorktreeConfiguration) {
      throw new AutomationToolInputError(`Session type "${candidate.sessionType.id}" does not support worktree isolation.`);
    }
    return {
      ...target,
      providerId: candidate.providerId,
      sessionTypeId: candidate.sessionType.id
    };
  }
  parseProposal(parameters, sessionResource) {
    const rawInput = parameters;
    if (!isRecord(rawInput)) {
      throw new AutomationToolInputError("configureAutomation input must be an object.");
    }
    const input = rawInput;
    assertKnownProperties(input, ["automationId", "name", "prompt", "schedule", "target", "modelId", "mode", "permissionLevel", "enabled"], "configureAutomation input");
    const automationId = readOptionalNonEmptyString(input, "automationId");
    const existing = automationId ? this.automationService.getAutomation(automationId) : void 0;
    if (automationId && !existing) {
      throw new AutomationToolInputError(`Automation "${automationId}" does not exist. Call listAutomations to refresh the available IDs.`);
    }
    const name = readOptionalRequiredText(input, "name");
    const prompt = readOptionalRequiredText(input, "prompt");
    if (!existing && name === void 0) {
      throw new AutomationToolInputError('"name" is required when creating an automation.');
    }
    if (!existing && prompt === void 0) {
      throw new AutomationToolInputError('"prompt" is required when creating an automation.');
    }
    const schedule = parseSchedule(input, existing?.schedule, !existing);
    const currentTarget = this.getCurrentSessionTarget(sessionResource);
    const target = parseTarget(input, existing, currentTarget);
    const modelId = readOptionalNullableNonEmptyString(input, "modelId");
    const mode = readOptionalNullableEnum(input, "mode", chatModes);
    const permissionLevel = readOptionalNullableEnum(input, "permissionLevel", chatPermissionLevels);
    const enabled = readOptionalBoolean(input, "enabled");
    const proposedValues = {
      ...name !== void 0 ? { name } : {},
      ...prompt !== void 0 ? { prompt } : {},
      ...schedule ? { schedule } : {},
      ...target ? { target } : {},
      ...modelId !== void 0 ? { modelId } : {},
      ...mode !== void 0 ? { mode } : {},
      ...permissionLevel !== void 0 ? { permissionLevel } : {},
      ...enabled !== void 0 ? { enabled } : {}
    };
    const validateTargetAvailability = input.target !== void 0 && !(isRecord(input.target) && input.target.kind === "currentSession");
    if (existing) {
      return { kind: "update", existing, initialValues: proposedValues, validateTargetAvailability };
    }
    if (!schedule) {
      throw new AutomationToolInputError('"schedule" is required when creating an automation.');
    }
    if (!target) {
      throw new AutomationToolInputError('A target could not be derived from the current session. Provide an explicit "target".');
    }
    if (name === void 0 || prompt === void 0) {
      throw new Error("Automation create proposal is missing required values.");
    }
    return {
      kind: "create",
      existing: void 0,
      initialValues: {
        name,
        prompt,
        schedule,
        target,
        ...modelId ? { modelId } : {},
        ...mode ? { mode } : {},
        ...permissionLevel ? { permissionLevel } : {},
        ...enabled !== void 0 ? { enabled } : {}
      },
      validateTargetAvailability
    };
  }
  getCurrentSessionTarget(resource) {
    if (!resource) {
      return void 0;
    }
    const session = this.sessionsManagementService.getSession(resource) ?? this.sessionsManagementService.getSessionForChatResource(resource)?.session;
    return session ? automationTargetFromSession(session) : void 0;
  }
};
ConfigureAutomationTool = __decorateClass([
  __decorateParam(0, IAutomationService),
  __decorateParam(1, ISessionsManagementService),
  __decorateParam(2, IConfigurationService)
], ConfigureAutomationTool);
let AutomationToolsContribution = class extends Disposable {
  constructor(toolsService, instantiationService) {
    super();
    const listTool = instantiationService.createInstance(ListAutomationsTool);
    const configureTool = instantiationService.createInstance(ConfigureAutomationTool);
    const runTool = instantiationService.createInstance(RunAutomationTool);
    const deleteTool = instantiationService.createInstance(DeleteAutomationTool);
    this._register(toolsService.registerTool(listTool.getToolData(), listTool));
    this._register(toolsService.registerTool(configureTool.getToolData(), configureTool));
    this._register(toolsService.registerTool(runTool.getToolData(), runTool));
    this._register(toolsService.registerTool(deleteTool.getToolData(), deleteTool));
  }
};
AutomationToolsContribution.ID = "sessions.contrib.automationTools";
AutomationToolsContribution = __decorateClass([
  __decorateParam(0, ILanguageModelToolsService),
  __decorateParam(1, IInstantiationService)
], AutomationToolsContribution);
function isAutomationsEnabled(configurationService) {
  return configurationService.getValue(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
}
function findSessionType(candidates, providerId, sessionTypeId) {
  return candidates.find((candidate) => (providerId === void 0 || candidate.providerId === providerId) && (sessionTypeId === void 0 || candidate.sessionType.id === sessionTypeId));
}
function automationTargetFromSession(session) {
  if (session.isQuickChat?.get() === true) {
    return {
      kind: "quickChat",
      providerId: session.providerId,
      sessionTypeId: session.sessionType
    };
  }
  const workspace = session.workspace.get();
  return workspace ? {
    kind: "workspace",
    folderUri: workspace.uri,
    providerId: session.providerId,
    sessionTypeId: session.sessionType,
    isolation: { kind: "default" }
  } : void 0;
}
function parseSchedule(input, existing, required) {
  const value = readOptionalObject(input, "schedule");
  if (!value) {
    if (required) {
      throw new AutomationToolInputError('"schedule" is required when creating an automation.');
    }
    return void 0;
  }
  assertKnownProperties(value, ["interval", "scheduleHour", "scheduleMinute", "scheduleDay"], '"schedule"');
  const interval = readOptionalEnum(value, "interval", automationIntervals) ?? existing?.interval;
  if (!interval) {
    throw new AutomationToolInputError('"schedule.interval" is required when creating an automation.');
  }
  const scheduleHour = readOptionalInteger(value, "scheduleHour", 0, 23) ?? existing?.scheduleHour ?? 9;
  const scheduleMinute = readOptionalInteger(value, "scheduleMinute", 0, 59) ?? existing?.scheduleMinute ?? 0;
  const scheduleDay = readOptionalInteger(value, "scheduleDay", 0, 6) ?? existing?.scheduleDay ?? 1;
  return { interval, scheduleHour, scheduleMinute, scheduleDay };
}
function parseTarget(input, existing, currentTarget) {
  const value = readOptionalObject(input, "target");
  if (!value) {
    return existing ? void 0 : currentTarget;
  }
  assertKnownProperties(value, ["kind", "folderUri", "providerId", "sessionTypeId", "isolation", "branch"], '"target"');
  const kind = readRequiredEnum(value, "kind", ["currentSession", "workspace", "quickChat"]);
  if (kind === "currentSession") {
    assertPropertiesAbsent(value, ["folderUri", "providerId", "sessionTypeId", "isolation", "branch"], "A currentSession target");
    if (!currentTarget) {
      throw new AutomationToolInputError("The current session does not have a resolved automation target.");
    }
    return currentTarget;
  }
  if (kind === "quickChat") {
    assertPropertiesAbsent(value, ["folderUri", "isolation", "branch"], "A quickChat target");
    const existingTarget2 = existing?.target.kind === "quickChat" ? existing.target : void 0;
    const providerId2 = readOptionalNonEmptyString(value, "providerId") ?? existingTarget2?.providerId ?? currentTarget?.providerId;
    const sessionTypeId2 = readOptionalNonEmptyString(value, "sessionTypeId") ?? existingTarget2?.sessionTypeId ?? currentTarget?.sessionTypeId;
    if (!providerId2 || !sessionTypeId2) {
      throw new AutomationToolInputError('A quickChat target requires "providerId" and "sessionTypeId".');
    }
    return { kind: "quickChat", providerId: providerId2, sessionTypeId: sessionTypeId2 };
  }
  const existingTarget = existing?.target.kind === "workspace" ? existing.target : void 0;
  const sessionTarget = currentTarget?.kind === "workspace" ? currentTarget : void 0;
  const baseTarget = existingTarget ?? sessionTarget;
  const folderUriValue = readOptionalNonEmptyString(value, "folderUri");
  const folderUri = folderUriValue ? parseUri(folderUriValue, "target.folderUri") : baseTarget?.folderUri;
  if (!folderUri) {
    throw new AutomationToolInputError('A workspace target requires "folderUri".');
  }
  const providerId = readOptionalNonEmptyString(value, "providerId") ?? baseTarget?.providerId;
  const sessionTypeId = readOptionalNonEmptyString(value, "sessionTypeId") ?? baseTarget?.sessionTypeId;
  const isolationKind = readOptionalEnum(value, "isolation", automationIsolationKinds) ?? baseTarget?.isolation.kind ?? "default";
  const branch = readOptionalNonEmptyString(value, "branch") ?? (baseTarget?.isolation.kind === "worktree" ? baseTarget.isolation.branch : void 0);
  if (isolationKind !== "worktree" && readOptionalNonEmptyString(value, "branch") !== void 0) {
    throw new AutomationToolInputError('"target.branch" is only valid with worktree isolation.');
  }
  let isolation;
  if (isolationKind === "worktree") {
    if (!branch) {
      throw new AutomationToolInputError('A workspace target with worktree isolation requires "branch".');
    }
    isolation = { kind: "worktree", branch };
  } else {
    isolation = { kind: isolationKind };
  }
  return { kind: "workspace", folderUri, providerId, sessionTypeId, isolation };
}
function parseUri(value, field) {
  try {
    const uri = URI.parse(value, true);
    if (!uri.scheme) {
      throw new Error("URI has no scheme.");
    }
    return uri;
  } catch {
    throw new AutomationToolInputError(`"${field}" must be a valid absolute URI.`);
  }
}
function toAutomationToolOutput(automation) {
  const target = automation.target.kind === "workspace" ? {
    kind: "workspace",
    folderUri: automation.target.folderUri.toString(),
    providerId: automation.target.providerId ?? null,
    sessionTypeId: automation.target.sessionTypeId ?? null,
    isolation: automation.target.isolation
  } : {
    kind: "quickChat",
    providerId: automation.target.providerId,
    sessionTypeId: automation.target.sessionTypeId
  };
  return {
    id: automation.id,
    name: automation.name,
    prompt: automation.prompt,
    schedule: automation.schedule,
    target,
    modelId: automation.modelId ?? null,
    mode: automation.mode ?? null,
    permissionLevel: automation.permissionLevel ?? null,
    enabled: automation.enabled,
    createdAt: automation.createdAt,
    updatedAt: automation.updatedAt,
    lastRunAt: automation.lastRunAt ?? null,
    nextRunAt: automation.nextRunAt ?? null
  };
}
function toAutomationConfiguredData(automation, operation) {
  return {
    kind: "automationConfigured",
    automationId: automation.id,
    automationName: automation.name,
    operation
  };
}
function automationToolResult(value) {
  return { content: [{ kind: "text", value }] };
}
function automationToolError(message) {
  return {
    content: [{ kind: "text", value: message }],
    toolResultError: message,
    toolResultMessage: localize("automation.tool.error", "Automation request failed")
  };
}
function automationToolCancelled() {
  const result = automationToolResult(JSON.stringify({
    status: "cancelled",
    message: "The automation change was cancelled. No changes were made."
  }));
  result.toolResultMessage = localize("automation.tool.cancelled", "Automation change cancelled");
  return result;
}
function automationDeleteCancelled() {
  const result = automationToolResult(JSON.stringify({
    status: "cancelled",
    message: "The automation was not deleted."
  }));
  result.toolResultMessage = localize("automation.tool.delete.cancelled", "Automation deletion cancelled");
  return result;
}
function automationRunCancelled() {
  const result = automationToolResult(JSON.stringify({
    status: "cancelled",
    message: "The automation was not started."
  }));
  result.toolResultMessage = localize("automation.tool.run.cancelled", "Automation run cancelled");
  return result;
}
function automationAlreadyRunning(automation, run) {
  const result = automationToolResult(JSON.stringify({
    status: "already_running",
    automation: { id: automation.id, name: automation.name },
    run: {
      id: run.id,
      status: run.status,
      sessionResource: run.sessionResource ?? null
    }
  }, void 0, 2));
  result.toolResultMessage = localize("automation.tool.run.alreadyRunningResult", "Automation {0} is already running", automation.name);
  return result;
}
function automationNotStarted(automation, dispatch) {
  if (dispatch.reason === "cancelled") {
    return automationRunCancelled();
  }
  if (dispatch.reason === "deleted") {
    return automationToolError(`Automation "${automation.id}" no longer exists.`);
  }
  if (dispatch.reason === "targetUnavailable") {
    return automationToolError(`Automation "${automation.id}" did not start. Its configured agent is unavailable.`);
  }
  return automationToolError(dispatch.run?.errorMessage ? `Automation "${automation.id}" failed to start: ${dispatch.run.errorMessage}` : `Automation "${automation.id}" failed to start.`);
}
function resolveAutomationInput(automationService, rawInput, toolName) {
  if (!isRecord(rawInput)) {
    throw new AutomationToolInputError(`${toolName} input must be an object.`);
  }
  assertKnownProperties(rawInput, ["automationId"], `${toolName} input`);
  const automationId = readOptionalNonEmptyString(rawInput, "automationId");
  if (!automationId) {
    throw new AutomationToolInputError('"automationId" is required.');
  }
  const automation = automationService.getAutomation(automationId);
  if (!automation) {
    throw new AutomationToolInputError(`Automation "${automationId}" does not exist. Call listAutomations to refresh the available IDs.`);
  }
  return automation;
}
function assertKnownProperties(value, properties, field) {
  const known = new Set(properties);
  const unexpected = Object.keys(value).find((key) => !known.has(key));
  if (unexpected) {
    throw new AutomationToolInputError(`${field} has an unsupported "${unexpected}" property.`);
  }
}
function assertPropertiesAbsent(value, properties, field) {
  const present = properties.find((property) => value[property] !== void 0);
  if (present) {
    throw new AutomationToolInputError(`${field} cannot include "${present}".`);
  }
}
function readOptionalObject(value, property) {
  const candidate = value[property];
  if (candidate === void 0) {
    return void 0;
  }
  if (!isRecord(candidate)) {
    throw new AutomationToolInputError(`"${property}" must be an object.`);
  }
  return candidate;
}
function readOptionalRequiredText(value, property) {
  const candidate = value[property];
  if (candidate === void 0) {
    return void 0;
  }
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new AutomationToolInputError(`"${property}" must be a non-empty string.`);
  }
  return candidate;
}
function readOptionalNonEmptyString(value, property) {
  const candidate = readOptionalRequiredText(value, property);
  return candidate?.trim();
}
function readOptionalNullableNonEmptyString(value, property) {
  const candidate = value[property];
  if (candidate === void 0 || candidate === null) {
    return candidate;
  }
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new AutomationToolInputError(`"${property}" must be a non-empty string or null.`);
  }
  return candidate.trim();
}
function readOptionalBoolean(value, property) {
  const candidate = value[property];
  if (candidate === void 0) {
    return void 0;
  }
  if (typeof candidate !== "boolean") {
    throw new AutomationToolInputError(`"${property}" must be a boolean.`);
  }
  return candidate;
}
function readOptionalInteger(value, property, minimum, maximum) {
  const candidate = value[property];
  if (candidate === void 0) {
    return void 0;
  }
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new AutomationToolInputError(`"${property}" must be an integer from ${minimum} through ${maximum}.`);
  }
  return candidate;
}
function readRequiredEnum(value, property, allowed) {
  const candidate = readOptionalEnum(value, property, allowed);
  if (candidate === void 0) {
    throw new AutomationToolInputError(`"${property}" is required.`);
  }
  return candidate;
}
function readOptionalEnum(value, property, allowed) {
  const candidate = value[property];
  if (candidate === void 0) {
    return void 0;
  }
  if (!isAllowedString(candidate, allowed)) {
    throw new AutomationToolInputError(`"${property}" must be one of: ${allowed.join(", ")}.`);
  }
  return candidate;
}
function readOptionalNullableEnum(value, property, allowed) {
  const candidate = value[property];
  if (candidate === void 0 || candidate === null) {
    return candidate;
  }
  if (!isAllowedString(candidate, allowed)) {
    throw new AutomationToolInputError(`"${property}" must be null or one of: ${allowed.join(", ")}.`);
  }
  return candidate;
}
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function isAllowedString(value, allowed) {
  return typeof value === "string" && allowed.some((candidate) => candidate === value);
}
export {
  AutomationToolsContribution,
  ConfigureAutomationTool,
  ConfigureAutomationToolId,
  DeleteAutomationTool,
  DeleteAutomationToolId,
  ListAutomationsTool,
  ListAutomationsToolId,
  RunAutomationTool,
  RunAutomationToolId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYXV0b21hdGlvbnMvYnJvd3Nlci9hdXRvbWF0aW9uVG9vbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlybWF0aW9uT3B0aW9uS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtY2hhdC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQXV0b21hdGlvbkludGVydmFsLCBBdXRvbWF0aW9uVGFyZ2V0LCBBdXRvbWF0aW9uV29ya3NwYWNlSXNvbGF0aW9uLCBJQXV0b21hdGlvbiwgSUF1dG9tYXRpb25SdW4sIElBdXRvbWF0aW9uU2NoZWR1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uLmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uUnVuRGlzcGF0Y2gsIElBdXRvbWF0aW9uUnVubmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblJ1bm5lci5qcyc7XG5pbXBvcnQgeyB0eXBlIEF1dG9tYXRpb25NdXRhdGlvbkd1YXJkLCBDb25maWd1cmVBdXRvbWF0aW9uVG9vbFJlZmVyZW5jZU5hbWUsIElBdXRvbWF0aW9uU2VydmljZSwgSUNyZWF0ZUF1dG9tYXRpb25PcHRpb25zLCBJVXBkYXRlQXV0b21hdGlvbk9wdGlvbnMsIHNlcmlhbGl6ZUF1dG9tYXRpb25FZGl0YWJsZVN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEF1dG9tYXRpb25zRW5hYmxlZENvbnRleHQsIENIQVRfQVVUT01BVElPTlNfRU5BQkxFRF9TRVRUSU5HIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbnNFbmFibGVkLmpzJztcbmltcG9ydCB7IElDaGF0QXV0b21hdGlvbkNvbmZpZ3VyZWREYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVLaW5kLCBDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENvdW50VG9rZW5zQ2FsbGJhY2ssIElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgSVRvb2xEYXRhLCBJVG9vbEltcGwsIElUb29sSW52b2NhdGlvbiwgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBJVG9vbFJlc3VsdCwgVG9vbERhdGFTb3VyY2UsIFRvb2xQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJUHJvdmlkZXJTZXNzaW9uVHlwZSwgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcblxuZXhwb3J0IGNvbnN0IExpc3RBdXRvbWF0aW9uc1Rvb2xJZCA9ICd2c2NvZGVfbGlzdEF1dG9tYXRpb25zJztcbmV4cG9ydCBjb25zdCBDb25maWd1cmVBdXRvbWF0aW9uVG9vbElkID0gJ3ZzY29kZV9jb25maWd1cmVBdXRvbWF0aW9uJztcbmV4cG9ydCBjb25zdCBSdW5BdXRvbWF0aW9uVG9vbElkID0gJ3ZzY29kZV9ydW5BdXRvbWF0aW9uJztcbmV4cG9ydCBjb25zdCBEZWxldGVBdXRvbWF0aW9uVG9vbElkID0gJ3ZzY29kZV9kZWxldGVBdXRvbWF0aW9uJztcblxuY29uc3QgYXV0b21hdGlvblRvb2xXaGVuID0gQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBDaGF0QXV0b21hdGlvbnNFbmFibGVkQ29udGV4dCk7XG5jb25zdCBkZWxldGVBdXRvbWF0aW9uQ29uZmlybWF0aW9uSWQgPSAnZGVsZXRlJztcbmNvbnN0IG1hbnVhbFJ1bkxlYWRlcldpbmRvd0lkID0gMDtcbmNvbnN0IGF1dG9tYXRpb25JbnRlcnZhbHM6IHJlYWRvbmx5IEF1dG9tYXRpb25JbnRlcnZhbFtdID0gWydtYW51YWwnLCAnaG91cmx5JywgJ2RhaWx5JywgJ3dlZWtseSddO1xuY29uc3QgYXV0b21hdGlvbklzb2xhdGlvbktpbmRzOiByZWFkb25seSBBdXRvbWF0aW9uV29ya3NwYWNlSXNvbGF0aW9uWydraW5kJ11bXSA9IFsnZGVmYXVsdCcsICdmb2xkZXInLCAnd29ya3RyZWUnXTtcbmNvbnN0IGNoYXRNb2RlczogcmVhZG9ubHkgQ2hhdE1vZGVLaW5kW10gPSBbQ2hhdE1vZGVLaW5kLkFnZW50LCBDaGF0TW9kZUtpbmQuQXNrLCBDaGF0TW9kZUtpbmQuRWRpdF07XG5jb25zdCBjaGF0UGVybWlzc2lvbkxldmVsczogcmVhZG9ubHkgQ2hhdFBlcm1pc3Npb25MZXZlbFtdID0gW0NoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCwgQ2hhdFBlcm1pc3Npb25MZXZlbC5Bc3Npc3RlZCwgQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSwgQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3RdO1xuXG5pbnRlcmZhY2UgSUF1dG9tYXRpb25Ub29sT3V0cHV0IHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBwcm9tcHQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2NoZWR1bGU6IElBdXRvbWF0aW9uU2NoZWR1bGU7XG5cdHJlYWRvbmx5IHRhcmdldDpcblx0fCB7XG5cdFx0cmVhZG9ubHkga2luZDogJ3dvcmtzcGFjZSc7XG5cdFx0cmVhZG9ubHkgZm9sZGVyVXJpOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nIHwgbnVsbDtcblx0XHRyZWFkb25seSBzZXNzaW9uVHlwZUlkOiBzdHJpbmcgfCBudWxsO1xuXHRcdHJlYWRvbmx5IGlzb2xhdGlvbjogQXV0b21hdGlvbldvcmtzcGFjZUlzb2xhdGlvbjtcblx0fVxuXHR8IHtcblx0XHRyZWFkb25seSBraW5kOiAncXVpY2tDaGF0Jztcblx0XHRyZWFkb25seSBwcm92aWRlcklkOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgc2Vzc2lvblR5cGVJZDogc3RyaW5nO1xuXHR9O1xuXHRyZWFkb25seSBtb2RlbElkOiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSBtb2RlOiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSBwZXJtaXNzaW9uTGV2ZWw6IHN0cmluZyB8IG51bGw7XG5cdHJlYWRvbmx5IGVuYWJsZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNyZWF0ZWRBdDogc3RyaW5nO1xuXHRyZWFkb25seSB1cGRhdGVkQXQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFzdFJ1bkF0OiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSBuZXh0UnVuQXQ6IHN0cmluZyB8IG51bGw7XG59XG5cbnR5cGUgSUF1dG9tYXRpb25Qcm9wb3NhbCA9XG5cdHwge1xuXHRcdHJlYWRvbmx5IGtpbmQ6ICdjcmVhdGUnO1xuXHRcdHJlYWRvbmx5IGV4aXN0aW5nOiB1bmRlZmluZWQ7XG5cdFx0cmVhZG9ubHkgaW5pdGlhbFZhbHVlczogSUNyZWF0ZUF1dG9tYXRpb25PcHRpb25zO1xuXHRcdHJlYWRvbmx5IHZhbGlkYXRlVGFyZ2V0QXZhaWxhYmlsaXR5OiBib29sZWFuO1xuXHR9XG5cdHwge1xuXHRcdHJlYWRvbmx5IGtpbmQ6ICd1cGRhdGUnO1xuXHRcdHJlYWRvbmx5IGV4aXN0aW5nOiBJQXV0b21hdGlvbjtcblx0XHRyZWFkb25seSBpbml0aWFsVmFsdWVzOiBJVXBkYXRlQXV0b21hdGlvbk9wdGlvbnM7XG5cdFx0cmVhZG9ubHkgdmFsaWRhdGVUYXJnZXRBdmFpbGFiaWxpdHk6IGJvb2xlYW47XG5cdH07XG5cbmNsYXNzIEF1dG9tYXRpb25Ub29sSW5wdXRFcnJvciBleHRlbmRzIEVycm9yIHsgfVxuXG5jbGFzcyBBdXRvbWF0aW9uVG9vbE11dGF0aW9uQmxvY2tlZEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSByZXN1bHQ6IElUb29sUmVzdWx0KSB7XG5cdFx0c3VwZXIoJ0F1dG9tYXRpb24gbXV0YXRpb24gYmxvY2tlZCcpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBMaXN0QXV0b21hdGlvbnNUb29sIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUF1dG9tYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0b21hdGlvblNlcnZpY2U6IElBdXRvbWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRnZXRUb29sRGF0YSgpOiBJVG9vbERhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogTGlzdEF1dG9tYXRpb25zVG9vbElkLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdsaXN0QXV0b21hdGlvbnMnLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IGZhbHNlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi53YXRjaCxcblx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi50b29sLmxpc3QuZGlzcGxheU5hbWUnLCBcIkxpc3QgQXV0b21hdGlvbnNcIiksXG5cdFx0XHR1c2VyRGVzY3JpcHRpb246IGxvY2FsaXplKCdhdXRvbWF0aW9uLnRvb2wubGlzdC51c2VyRGVzY3JpcHRpb24nLCBcIkxpc3Qgc2NoZWR1bGVkIGFnZW50IGF1dG9tYXRpb25zXCIpLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ0xpc3QgYWxsIGNvbmZpZ3VyZWQgc2NoZWR1bGVkIGF1dG9tYXRpb25zIGFuZCB0aGVpciBzdGFibGUgSURzLCBlZGl0YWJsZSBmaWVsZHMsIHRhcmdldHMsIGFuZCB0aW1pbmcgbWV0YWRhdGEuIFVzZSB0aGlzIGJlZm9yZSBjb25maWd1cmVBdXRvbWF0aW9uLCBydW5BdXRvbWF0aW9uLCBvciBkZWxldGVBdXRvbWF0aW9uIHdoZW4gYWN0aW5nIG9uIGFuIGV4aXN0aW5nIGF1dG9tYXRpb24uIFRoaXMgdG9vbCBuZXZlciBjaGFuZ2VzIGF1dG9tYXRpb24gc3RhdGUuJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHR3aGVuOiBhdXRvbWF0aW9uVG9vbFdoZW4sXG5cdFx0XHRydW5zSW5Xb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdFx0aW5wdXRTY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHt9LFxuXHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oX2NvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdhdXRvbWF0aW9uLnRvb2wubGlzdC5pbnZvY2F0aW9uTWVzc2FnZScsIFwiUmVhZGluZyBhdXRvbWF0aW9uc1wiKSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGxvY2FsaXplKCdhdXRvbWF0aW9uLnRvb2wubGlzdC5wYXN0VGVuc2VNZXNzYWdlJywgXCJSZWFkIGF1dG9tYXRpb25zXCIpLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBpbnZva2UoX2ludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBfcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRpZiAoIWlzQXV0b21hdGlvbnNFbmFibGVkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHRyZXR1cm4gYXV0b21hdGlvblRvb2xFcnJvcignQXV0b21hdGlvbnMgYXJlIGRpc2FibGVkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF1dG9tYXRpb25zID0gdGhpcy5hdXRvbWF0aW9uU2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKS5tYXAodG9BdXRvbWF0aW9uVG9vbE91dHB1dCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXV0b21hdGlvblRvb2xSZXN1bHQoSlNPTi5zdHJpbmdpZnkoeyBhdXRvbWF0aW9ucyB9LCB1bmRlZmluZWQsIDIpKTtcblx0XHRyZXN1bHQudG9vbFJlc3VsdE1lc3NhZ2UgPSBhdXRvbWF0aW9ucy5sZW5ndGggPT09IDFcblx0XHRcdD8gbG9jYWxpemUoJ2F1dG9tYXRpb24udG9vbC5saXN0LnJlc3VsdC5zaW5ndWxhcicsIFwiTGlzdGVkIDEgYXV0b21hdGlvblwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYXV0b21hdGlvbi50b29sLmxpc3QucmVzdWx0LnBsdXJhbCcsIFwiTGlzdGVkIHswfSBhdXRvbWF0aW9uc1wiLCBhdXRvbWF0aW9ucy5sZW5ndGgpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJ1bkF1dG9tYXRpb25Ub29sIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUF1dG9tYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0b21hdGlvblNlcnZpY2U6IElBdXRvbWF0aW9uU2VydmljZSxcblx0XHRASUF1dG9tYXRpb25SdW5uZXIgcHJpdmF0ZSByZWFkb25seSBhdXRvbWF0aW9uUnVubmVyOiBJQXV0b21hdGlvblJ1bm5lcixcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRnZXRUb29sRGF0YSgpOiBJVG9vbERhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogUnVuQXV0b21hdGlvblRvb2xJZCxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAncnVuQXV0b21hdGlvbicsXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogZmFsc2UsXG5cdFx0XHRpY29uOiBDb2RpY29uLnBsYXksXG5cdFx0XHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ2F1dG9tYXRpb24udG9vbC5ydW4uZGlzcGxheU5hbWUnLCBcIlJ1biBBdXRvbWF0aW9uXCIpLFxuXHRcdFx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi50b29sLnJ1bi51c2VyRGVzY3JpcHRpb24nLCBcIlJ1biBhIGNvbmZpZ3VyZWQgYWdlbnQgYXV0b21hdGlvbiBub3dcIiksXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnUnVuIGEgY29uZmlndXJlZCBhdXRvbWF0aW9uIGltbWVkaWF0ZWx5IGJ5IHN0YWJsZSBJRC4gQ2FsbCBsaXN0QXV0b21hdGlvbnMgZmlyc3QgdG8gb2J0YWluIHRoZSBjdXJyZW50IElELiBUaGlzIHN0YXJ0cyBhIGZyZXNoIGFnZW50IHNlc3Npb24gaW4gdGhlIGJhY2tncm91bmQgdXNpbmcgdGhlIHNhdmVkIHByb21wdCwgdGFyZ2V0LCBtb2RlbCwgbW9kZSwgYW5kIHBlcm1pc3Npb24gbGV2ZWwsIGV2ZW4gd2hlbiBzY2hlZHVsZWQgcnVucyBhcmUgZGlzYWJsZWQuIFRoZSB0b29sIHJldHVybnMgYWZ0ZXIgc2Vzc2lvbiBkaXNwYXRjaCBjb21taXRzOyBkbyBub3QgcnVuIGl0IGFnYWluIHVubGVzcyB0aGUgdXNlciBhc2tzLicsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0d2hlbjogYXV0b21hdGlvblRvb2xXaGVuLFxuXHRcdFx0cnVuc0luV29ya3NwYWNlOiBmYWxzZSxcblx0XHRcdGlucHV0U2NoZW1hOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRhdXRvbWF0aW9uSWQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTdGFibGUgYXV0b21hdGlvbiBJRCBmcm9tIGxpc3RBdXRvbWF0aW9ucy4nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ2F1dG9tYXRpb25JZCddLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24+IHtcblx0XHRpZiAoIWlzQXV0b21hdGlvbnNFbmFibGVkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHR0aHJvdyBuZXcgQXV0b21hdGlvblRvb2xJbnB1dEVycm9yKCdBdXRvbWF0aW9ucyBhcmUgZGlzYWJsZWQuJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSByZXNvbHZlQXV0b21hdGlvbklucHV0KHRoaXMuYXV0b21hdGlvblNlcnZpY2UsIGNvbnRleHQucGFyYW1ldGVycywgJ3J1bkF1dG9tYXRpb24nKTtcblx0XHRjb25zdCBhY3RpdmVSdW4gPSB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLmdldEFjdGl2ZVJ1bkZvcihhdXRvbWF0aW9uLmlkKTtcblx0XHRpZiAoYWN0aXZlUnVuKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ2F1dG9tYXRpb24udG9vbC5ydW4uYWxyZWFkeVJ1bm5pbmcnLCBcIkF1dG9tYXRpb24gezB9IGlzIGFscmVhZHkgcnVubmluZ1wiLCBhdXRvbWF0aW9uLm5hbWUpLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi50b29sLnJ1bi53YXNBbHJlYWR5UnVubmluZycsIFwiQXV0b21hdGlvbiB7MH0gd2FzIGFscmVhZHkgcnVubmluZ1wiLCBhdXRvbWF0aW9uLm5hbWUpLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi50b29sLnJ1bi5pbnZvY2F0aW9uTWVzc2FnZScsIFwiUnVubmluZyBhdXRvbWF0aW9uIHswfVwiLCBhdXRvbWF0aW9uLm5hbWUpLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbG9jYWxpemUoJ2F1dG9tYXRpb24udG9vbC5ydW4ucGFzdFRlbnNlTWVzc2FnZScsIFwiU3RhcnRlZCBhdXRvbWF0aW9uIHswfVwiLCBhdXRvbWF0aW9uLm5hbWUpLFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHtcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhdXRvbWF0aW9uLnRvb2wucnVuLmNvbmZpcm1hdGlvblRpdGxlJywgXCJSdW4gQXV0b21hdGlvbj9cIiksXG5cdFx0XHRcdG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZShcblx0XHRcdFx0XHQnYXV0b21hdGlvbi50b29sLnJ1bi5jb25maXJtYXRpb25NZXNzYWdlJyxcblx0XHRcdFx0XHRcIlJ1biAqKnswfSoqIChgezF9YCkgbm93PyBUaGlzIHN0YXJ0cyBhIG5ldyBhZ2VudCBzZXNzaW9uIHVzaW5nIHRoZSBhdXRvbWF0aW9uJ3MgY29uZmlndXJlZCBwcm9tcHQgYW5kIHBlcm1pc3Npb25zLlwiLFxuXHRcdFx0XHRcdGF1dG9tYXRpb24ubmFtZSxcblx0XHRcdFx0XHRhdXRvbWF0aW9uLmlkLFxuXHRcdFx0XHQpKSxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgX3Byb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRpZiAoIWlzQXV0b21hdGlvbnNFbmFibGVkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHRyZXR1cm4gYXV0b21hdGlvblRvb2xFcnJvcignQXV0b21hdGlvbnMgYXJlIGRpc2FibGVkLicpO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBhdXRvbWF0aW9uUnVuQ2FuY2VsbGVkKCk7XG5cdFx0fVxuXG5cdFx0bGV0IGF1dG9tYXRpb246IElBdXRvbWF0aW9uO1xuXHRcdHRyeSB7XG5cdFx0XHRhdXRvbWF0aW9uID0gcmVzb2x2ZUF1dG9tYXRpb25JbnB1dCh0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLCBpbnZvY2F0aW9uLnBhcmFtZXRlcnMsICdydW5BdXRvbWF0aW9uJyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIEF1dG9tYXRpb25Ub29sSW5wdXRFcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gYXV0b21hdGlvblRvb2xFcnJvcihlcnJvci5tZXNzYWdlKTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3BhdGNoQ2FuY2VsbGF0aW9uID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHRjb25zdCBvcGVyYXRpb24gPSB0aGlzLmF1dG9tYXRpb25SdW5uZXIucnVuT25jZShhdXRvbWF0aW9uLCAnbWFudWFsJywgbWFudWFsUnVuTGVhZGVyV2luZG93SWQsIGRpc3BhdGNoQ2FuY2VsbGF0aW9uLnRva2VuKTtcblx0XHRsZXQgZGlzcGF0Y2g6IElBdXRvbWF0aW9uUnVuRGlzcGF0Y2g7XG5cdFx0dHJ5IHtcblx0XHRcdGRpc3BhdGNoID0gYXdhaXQgb3BlcmF0aW9uLndoZW5EaXNwYXRjaGVkO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwYXRjaENhbmNlbGxhdGlvbi5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGRpc3BhdGNoLmtpbmQgPT09ICdhbHJlYWR5UnVubmluZycpIHtcblx0XHRcdHJldHVybiBhdXRvbWF0aW9uQWxyZWFkeVJ1bm5pbmcoYXV0b21hdGlvbiwgZGlzcGF0Y2guYWN0aXZlUnVuKTtcblx0XHR9XG5cdFx0aWYgKGRpc3BhdGNoLmtpbmQgPT09ICdub3RTdGFydGVkJykge1xuXHRcdFx0cmV0dXJuIGF1dG9tYXRpb25Ob3RTdGFydGVkKGF1dG9tYXRpb24sIGRpc3BhdGNoKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhdXRvbWF0aW9uVG9vbFJlc3VsdChKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRzdGF0dXM6ICdzdGFydGVkJyxcblx0XHRcdGF1dG9tYXRpb246IHsgaWQ6IGF1dG9tYXRpb24uaWQsIG5hbWU6IGF1dG9tYXRpb24ubmFtZSB9LFxuXHRcdFx0cnVuOiB7XG5cdFx0XHRcdGlkOiBkaXNwYXRjaC5ydW4uaWQsXG5cdFx0XHRcdHN0YXR1czogZGlzcGF0Y2gucnVuLnN0YXR1cyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBkaXNwYXRjaC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHR9LFxuXHRcdH0sIHVuZGVmaW5lZCwgMikpO1xuXHRcdHJlc3VsdC50b29sUmVzdWx0TWVzc2FnZSA9IGxvY2FsaXplKCdhdXRvbWF0aW9uLnRvb2wucnVuLnN0YXJ0ZWQnLCBcIlN0YXJ0ZWQgYXV0b21hdGlvbiB7MH1cIiwgYXV0b21hdGlvbi5uYW1lKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVBdXRvbWF0aW9uVG9vbCBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBdXRvbWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25TZXJ2aWNlOiBJQXV0b21hdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0Z2V0VG9vbERhdGEoKTogSVRvb2xEYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IERlbGV0ZUF1dG9tYXRpb25Ub29sSWQsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2RlbGV0ZUF1dG9tYXRpb24nLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IGZhbHNlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi50cmFzaCxcblx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi50b29sLmRlbGV0ZS5kaXNwbGF5TmFtZScsIFwiRGVsZXRlIEF1dG9tYXRpb25cIiksXG5cdFx0XHR1c2VyRGVzY3JpcHRpb246IGxvY2FsaXplKCdhdXRvbWF0aW9uLnRvb2wuZGVsZXRlLnVzZXJEZXNjcmlwdGlvbicsIFwiRGVsZXRlIGEgc2NoZWR1bGVkIGFnZW50IGF1dG9tYXRpb25cIiksXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnRGVsZXRlIGFuIGF1dG9tYXRpb24gYnkgc3RhYmxlIElELiBDYWxsIGxpc3RBdXRvbWF0aW9ucyBmaXJzdCB0byBvYnRhaW4gdGhlIGN1cnJlbnQgSUQuIFRoZSBjdXJyZW50IGFwcHJvdmFsIHBvbGljeSBtYXkgYXBwcm92ZSB0aGUgYWN0aW9uIGF1dG9tYXRpY2FsbHk7IG90aGVyd2lzZSB0aGUgdXNlciBpcyBzaG93biBhIERlbGV0ZS9DYW5jZWwgY29uZmlybWF0aW9uLicsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0d2hlbjogYXV0b21hdGlvblRvb2xXaGVuLFxuXHRcdFx0cnVuc0luV29ya3NwYWNlOiBmYWxzZSxcblx0XHRcdGlucHV0U2NoZW1hOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRhdXRvbWF0aW9uSWQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTdGFibGUgYXV0b21hdGlvbiBJRCBmcm9tIGxpc3RBdXRvbWF0aW9ucy4nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ2F1dG9tYXRpb25JZCddLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24+IHtcblx0XHRpZiAoIWlzQXV0b21hdGlvbnNFbmFibGVkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHR0aHJvdyBuZXcgQXV0b21hdGlvblRvb2xJbnB1dEVycm9yKCdBdXRvbWF0aW9ucyBhcmUgZGlzYWJsZWQuJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSByZXNvbHZlQXV0b21hdGlvbklucHV0KHRoaXMuYXV0b21hdGlvblNlcnZpY2UsIGNvbnRleHQucGFyYW1ldGVycywgJ2RlbGV0ZUF1dG9tYXRpb24nKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdhdXRvbWF0aW9uLnRvb2wuZGVsZXRlLmludm9jYXRpb25NZXNzYWdlJywgXCJEZWxldGluZyBhdXRvbWF0aW9uIHswfVwiLCBhdXRvbWF0aW9uLm5hbWUpLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbG9jYWxpemUoJ2F1dG9tYXRpb24udG9vbC5kZWxldGUucGFzdFRlbnNlTWVzc2FnZScsIFwiRGVsZXRlZCBhdXRvbWF0aW9uIHswfVwiLCBhdXRvbWF0aW9uLm5hbWUpLFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHtcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhdXRvbWF0aW9uLnRvb2wuZGVsZXRlLmNvbmZpcm1hdGlvblRpdGxlJywgXCJEZWxldGUgQXV0b21hdGlvbj9cIiksXG5cdFx0XHRcdG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZShcblx0XHRcdFx0XHQnYXV0b21hdGlvbi50b29sLmRlbGV0ZS5jb25maXJtYXRpb25NZXNzYWdlJyxcblx0XHRcdFx0XHRcIkRlbGV0ZSAqKnswfSoqIChgezF9YCk/IEl0cyBzYXZlZCBjb25maWd1cmF0aW9uIGFuZCBydW4gaGlzdG9yeSB3aWxsIGJlIHBlcm1hbmVudGx5IHJlbW92ZWQuIFJ1bnMgYWxyZWFkeSBpbiBmbGlnaHQgd2lsbCBjb250aW51ZS5cIixcblx0XHRcdFx0XHRhdXRvbWF0aW9uLm5hbWUsXG5cdFx0XHRcdFx0YXV0b21hdGlvbi5pZCxcblx0XHRcdFx0KSksXG5cdFx0XHRcdGN1c3RvbU9wdGlvbnM6IFtcblx0XHRcdFx0XHR7IGlkOiBkZWxldGVBdXRvbWF0aW9uQ29uZmlybWF0aW9uSWQsIGxhYmVsOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi50b29sLmRlbGV0ZS5jb25maXJtJywgXCJEZWxldGVcIiksIGtpbmQ6IENvbmZpcm1hdGlvbk9wdGlvbktpbmQuQXBwcm92ZSB9LFxuXHRcdFx0XHRcdHsgaWQ6ICdjYW5jZWwnLCBsYWJlbDogbG9jYWxpemUoJ2F1dG9tYXRpb24udG9vbC5kZWxldGUuY2FuY2VsJywgXCJDYW5jZWxcIiksIGtpbmQ6IENvbmZpcm1hdGlvbk9wdGlvbktpbmQuRGVueSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBfcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGlmICghaXNBdXRvbWF0aW9uc0VuYWJsZWQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkpIHtcblx0XHRcdHJldHVybiBhdXRvbWF0aW9uVG9vbEVycm9yKCdBdXRvbWF0aW9ucyBhcmUgZGlzYWJsZWQuJyk7XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIGF1dG9tYXRpb25EZWxldGVDYW5jZWxsZWQoKTtcblx0XHR9XG5cblx0XHRsZXQgYXV0b21hdGlvbjogSUF1dG9tYXRpb247XG5cdFx0dHJ5IHtcblx0XHRcdGF1dG9tYXRpb24gPSByZXNvbHZlQXV0b21hdGlvbklucHV0KHRoaXMuYXV0b21hdGlvblNlcnZpY2UsIGludm9jYXRpb24ucGFyYW1ldGVycywgJ2RlbGV0ZUF1dG9tYXRpb24nKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgQXV0b21hdGlvblRvb2xJbnB1dEVycm9yKSB7XG5cdFx0XHRcdHJldHVybiBhdXRvbWF0aW9uVG9vbEVycm9yKGVycm9yLm1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXG5cdFx0aWYgKGludm9jYXRpb24uc2VsZWN0ZWRDdXN0b21CdXR0b24gIT09IHVuZGVmaW5lZCAmJiBpbnZvY2F0aW9uLnNlbGVjdGVkQ3VzdG9tQnV0dG9uICE9PSBkZWxldGVBdXRvbWF0aW9uQ29uZmlybWF0aW9uSWQpIHtcblx0XHRcdHJldHVybiBhdXRvbWF0aW9uRGVsZXRlQ2FuY2VsbGVkKCk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuYXV0b21hdGlvblNlcnZpY2UuZGVsZXRlQXV0b21hdGlvbihhdXRvbWF0aW9uLmlkLCB0aGlzLmNyZWF0ZU11dGF0aW9uR3VhcmQodG9rZW4pKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgQXV0b21hdGlvblRvb2xNdXRhdGlvbkJsb2NrZWRFcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gZXJyb3IucmVzdWx0O1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF1dG9tYXRpb25Ub29sUmVzdWx0KEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHN0YXR1czogJ2RlbGV0ZWQnLFxuXHRcdFx0YXV0b21hdGlvbjogeyBpZDogYXV0b21hdGlvbi5pZCwgbmFtZTogYXV0b21hdGlvbi5uYW1lIH0sXG5cdFx0fSkpO1xuXHRcdHJlc3VsdC50b29sUmVzdWx0TWVzc2FnZSA9IGxvY2FsaXplKCdhdXRvbWF0aW9uLnRvb2wuZGVsZXRlLmRlbGV0ZWQnLCBcIkRlbGV0ZWQgYXV0b21hdGlvbiB7MH1cIiwgYXV0b21hdGlvbi5uYW1lKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVNdXRhdGlvbkd1YXJkKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IEF1dG9tYXRpb25NdXRhdGlvbkd1YXJkIHtcblx0XHRyZXR1cm4gKCkgPT4ge1xuXHRcdFx0aWYgKCFpc0F1dG9tYXRpb25zRW5hYmxlZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQXV0b21hdGlvblRvb2xNdXRhdGlvbkJsb2NrZWRFcnJvcihhdXRvbWF0aW9uVG9vbEVycm9yKCdBdXRvbWF0aW9ucyBhcmUgZGlzYWJsZWQuJykpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBBdXRvbWF0aW9uVG9vbE11dGF0aW9uQmxvY2tlZEVycm9yKGF1dG9tYXRpb25EZWxldGVDYW5jZWxsZWQoKSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBDb25maWd1cmVBdXRvbWF0aW9uVG9vbCBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBdXRvbWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25TZXJ2aWNlOiBJQXV0b21hdGlvblNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0Z2V0VG9vbERhdGEoKTogSVRvb2xEYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sSWQsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogQ29uZmlndXJlQXV0b21hdGlvblRvb2xSZWZlcmVuY2VOYW1lLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IGZhbHNlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi53YXRjaCxcblx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi50b29sLmNvbmZpZ3VyZS5kaXNwbGF5TmFtZScsIFwiQ29uZmlndXJlIEF1dG9tYXRpb25cIiksXG5cdFx0XHR1c2VyRGVzY3JpcHRpb246IGxvY2FsaXplKCdhdXRvbWF0aW9uLnRvb2wuY29uZmlndXJlLnVzZXJEZXNjcmlwdGlvbicsIFwiQ3JlYXRlIG9yIHVwZGF0ZSBhbiBhdXRvbWF0aW9uXCIpLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogYENyZWF0ZSBvciB1cGRhdGUgYSBzY2hlZHVsZWQgYXV0b21hdGlvbi5cblxuT21pdCBcImF1dG9tYXRpb25JZFwiIHRvIGNyZWF0ZSBhbiBhdXRvbWF0aW9uOyBcIm5hbWVcIiwgXCJwcm9tcHRcIiwgYW5kIFwic2NoZWR1bGUuaW50ZXJ2YWxcIiBhcmUgdGhlbiByZXF1aXJlZC4gSWYgXCJ0YXJnZXRcIiBpcyBvbWl0dGVkLCB0aGUgYXV0b21hdGlvbiB0YXJnZXRzIHRoZSBjdXJyZW50IEFnZW50cyB3aW5kb3cgc2Vzc2lvbi5cbkluY2x1ZGUgXCJhdXRvbWF0aW9uSWRcIiB0byB1cGRhdGUgYW4gZXhpc3RpbmcgYXV0b21hdGlvbiwgYW5kIG9ubHkgcHJvdmlkZSBmaWVsZHMgdGhhdCBzaG91bGQgY2hhbmdlLiBDYWxsIGxpc3RBdXRvbWF0aW9ucyBmaXJzdCB0byBvYnRhaW4gdGhlIHN0YWJsZSBJRCBhbmQgY3VycmVudCB2YWx1ZXMuXG5UaGUgY2hhbmdlIHVzZXMgdGhlIGN1cnJlbnQgdG9vbC1hcHByb3ZhbCBwb2xpY3kuIFdoZW4gYXBwcm92YWwgaXMgcmVxdWlyZWQsIHRoZSB1c2VyIHNlZXMgYSBub3JtYWwgdG9vbCBjb25maXJtYXRpb24uIElmIHRoZSB1c2VyIGNhbmNlbHMgb3IgZGVuaWVzIHRoZSByZXF1ZXN0LCBkbyBub3QgcmV0cnkgdW5sZXNzIHRoZXkgYXNrIHlvdSB0by5gLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdHdoZW46IGF1dG9tYXRpb25Ub29sV2hlbixcblx0XHRcdHJ1bnNJbldvcmtzcGFjZTogZmFsc2UsXG5cdFx0XHRpbnB1dFNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0YXV0b21hdGlvbklkOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU3RhYmxlIGF1dG9tYXRpb24gSUQgZnJvbSBsaXN0QXV0b21hdGlvbnMuIE9taXQgdG8gY3JlYXRlIGEgbmV3IGF1dG9tYXRpb24uJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG5hbWU6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdBdXRvbWF0aW9uIG5hbWUuIFJlcXVpcmVkIHdoZW4gY3JlYXRpbmcuJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHByb21wdDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Byb21wdCBzZW50IHdoZW4gdGhlIGF1dG9tYXRpb24gcnVucy4gUmVxdWlyZWQgd2hlbiBjcmVhdGluZy4nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0c2NoZWR1bGU6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTY2hlZHVsZSBwcm9wb3NhbC4gUmVxdWlyZWQgd2hlbiBjcmVhdGluZy4gT21pdHRlZCBmaWVsZHMgcHJlc2VydmUgZXhpc3RpbmcgdmFsdWVzIHdoZW4gdXBkYXRpbmc7IGNyZWF0ZSBkZWZhdWx0cyBhcmUgMDk6MDAgTW9uZGF5LicsXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdGludGVydmFsOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogWy4uLmF1dG9tYXRpb25JbnRlcnZhbHNdLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnbWFudWFsLCBob3VybHksIGRhaWx5LCBvciB3ZWVrbHkuJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0c2NoZWR1bGVIb3VyOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2ludGVnZXInLFxuXHRcdFx0XHRcdFx0XHRcdG1pbmltdW06IDAsXG5cdFx0XHRcdFx0XHRcdFx0bWF4aW11bTogMjMsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdMb2NhbCBob3VyLCB1c2VkIGZvciBkYWlseSBhbmQgd2Vla2x5IHNjaGVkdWxlcy4nLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRzY2hlZHVsZU1pbnV0ZToge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRcdFx0XHRcdFx0XHRtaW5pbXVtOiAwLFxuXHRcdFx0XHRcdFx0XHRcdG1heGltdW06IDU5LFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnTG9jYWwgbWludXRlLCB1c2VkIGZvciBkYWlseSBhbmQgd2Vla2x5IHNjaGVkdWxlcy4nLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRzY2hlZHVsZURheToge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRcdFx0XHRcdFx0XHRtaW5pbXVtOiAwLFxuXHRcdFx0XHRcdFx0XHRcdG1heGltdW06IDYsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdEYXkgb2Ygd2VlayBmb3Igd2Vla2x5IHNjaGVkdWxlczogMCBpcyBTdW5kYXkgYW5kIDYgaXMgU2F0dXJkYXkuJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR0YXJnZXQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdSdW4gdGFyZ2V0LiBPbWl0IHdoZW4gY3JlYXRpbmcgdG8gdXNlIHRoZSBjdXJyZW50IHNlc3Npb24sIG9yIG9taXQgd2hlbiB1cGRhdGluZyB0byBwcmVzZXJ2ZSB0aGUgZXhpc3RpbmcgdGFyZ2V0LicsXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbJ2N1cnJlbnRTZXNzaW9uJywgJ3dvcmtzcGFjZScsICdxdWlja0NoYXQnXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0Zm9sZGVyVXJpOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdGdWxsIHdvcmtzcGFjZSBVUkkgZm9yIGEgd29ya3NwYWNlIHRhcmdldC4nLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRwcm92aWRlcklkOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTZXNzaW9ucyBwcm92aWRlciBJRC4nLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRzZXNzaW9uVHlwZUlkOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTZXNzaW9ucyBwcm92aWRlciBzZXNzaW9uLXR5cGUgSUQuJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0aXNvbGF0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogWy4uLmF1dG9tYXRpb25Jc29sYXRpb25LaW5kc10sXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXb3Jrc3BhY2UgaXNvbGF0aW9uOiBkZWZhdWx0LCBmb2xkZXIsIG9yIHdvcmt0cmVlLicsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGJyYW5jaDoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQmFzZSBicmFuY2gsIHJlcXVpcmVkIGZvciB3b3JrdHJlZSBpc29sYXRpb24uJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRyZXF1aXJlZDogWydraW5kJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRtb2RlbElkOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBbJ3N0cmluZycsICdudWxsJ10sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0xhbmd1YWdlIG1vZGVsIElELCBvciBudWxsIHRvIHVzZSB0aGUgcHJvdmlkZXIgZGVmYXVsdC4nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bW9kZToge1xuXHRcdFx0XHRcdFx0ZW51bTogWy4uLmNoYXRNb2RlcywgbnVsbF0sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0NoYXQgbW9kZSwgb3IgbnVsbCB0byB1c2UgdGhlIHByb3ZpZGVyIGRlZmF1bHQuJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHBlcm1pc3Npb25MZXZlbDoge1xuXHRcdFx0XHRcdFx0ZW51bTogWy4uLmNoYXRQZXJtaXNzaW9uTGV2ZWxzLCBudWxsXSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnUGVybWlzc2lvbiBsZXZlbCwgb3IgbnVsbCB0byB1c2UgdGhlIHByb3ZpZGVyIGRlZmF1bHQuJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnV2hldGhlciBzY2hlZHVsZWQgcnVucyBhcmUgZW5hYmxlZC4gRGVmYXVsdHMgdG8gdHJ1ZSB3aGVuIGNyZWF0aW5nLicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uPiB7XG5cdFx0aWYgKCFpc0F1dG9tYXRpb25zRW5hYmxlZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEF1dG9tYXRpb25Ub29sSW5wdXRFcnJvcignQXV0b21hdGlvbnMgYXJlIGRpc2FibGVkLicpO1xuXHRcdH1cblx0XHRjb25zdCBwcm9wb3NhbCA9IHRoaXMucGFyc2VQcm9wb3NhbChjb250ZXh0LnBhcmFtZXRlcnMsIGNvbnRleHQuY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgaXNVcGRhdGUgPSBwcm9wb3NhbC5raW5kID09PSAndXBkYXRlJztcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGlzVXBkYXRlXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2F1dG9tYXRpb24udG9vbC5jb25maWd1cmUudXBkYXRlLmludm9jYXRpb25NZXNzYWdlJywgXCJDb25maWd1cmluZyBhdXRvbWF0aW9uXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2F1dG9tYXRpb24udG9vbC5jb25maWd1cmUuY3JlYXRlLmludm9jYXRpb25NZXNzYWdlJywgXCJDb25maWd1cmluZyBhIG5ldyBhdXRvbWF0aW9uXCIpLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogaXNVcGRhdGVcblx0XHRcdFx0PyBsb2NhbGl6ZSgnYXV0b21hdGlvbi50b29sLmNvbmZpZ3VyZS51cGRhdGUucGFzdFRlbnNlTWVzc2FnZScsIFwiQ29uZmlndXJlZCBhdXRvbWF0aW9uXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2F1dG9tYXRpb24udG9vbC5jb25maWd1cmUuY3JlYXRlLnBhc3RUZW5zZU1lc3NhZ2UnLCBcIkNvbmZpZ3VyZWQgYSBuZXcgYXV0b21hdGlvblwiKSxcblx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB7XG5cdFx0XHRcdHRpdGxlOiBpc1VwZGF0ZVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2F1dG9tYXRpb24udG9vbC5jb25maWd1cmUudXBkYXRlLmNvbmZpcm1hdGlvblRpdGxlJywgXCJVcGRhdGUgQXV0b21hdGlvbj9cIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhdXRvbWF0aW9uLnRvb2wuY29uZmlndXJlLmNyZWF0ZS5jb25maXJtYXRpb25UaXRsZScsIFwiQ3JlYXRlIEF1dG9tYXRpb24/XCIpLFxuXHRcdFx0XHRtZXNzYWdlOiBpc1VwZGF0ZVxuXHRcdFx0XHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0J2F1dG9tYXRpb24udG9vbC5jb25maWd1cmUudXBkYXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2UnLFxuXHRcdFx0XHRcdFx0XCJBcHBseSB0aGUgcHJvcG9zZWQgY2hhbmdlcyB0byAqKnswfSoqIChgezF9YCk/XCIsXG5cdFx0XHRcdFx0XHRwcm9wb3NhbC5leGlzdGluZy5uYW1lLFxuXHRcdFx0XHRcdFx0cHJvcG9zYWwuZXhpc3RpbmcuaWQsXG5cdFx0XHRcdFx0KSlcblx0XHRcdFx0XHQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZShcblx0XHRcdFx0XHRcdCdhdXRvbWF0aW9uLnRvb2wuY29uZmlndXJlLmNyZWF0ZS5jb25maXJtYXRpb25NZXNzYWdlJyxcblx0XHRcdFx0XHRcdFwiQ3JlYXRlIHRoZSBhdXRvbWF0aW9uICoqezB9Kio/XCIsXG5cdFx0XHRcdFx0XHRwcm9wb3NhbC5pbml0aWFsVmFsdWVzLm5hbWUsXG5cdFx0XHRcdFx0KSksXG5cdFx0XHR9LFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogcHJvcG9zYWwua2luZCA9PT0gJ3VwZGF0ZSdcblx0XHRcdFx0PyB7XG5cdFx0XHRcdFx0a2luZDogJ2F1dG9tYXRpb25Db25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRleHBlY3RlZEF1dG9tYXRpb25JZDogcHJvcG9zYWwuZXhpc3RpbmcuaWQsXG5cdFx0XHRcdFx0ZXhwZWN0ZWRFZGl0YWJsZVN0YXRlOiBzZXJpYWxpemVBdXRvbWF0aW9uRWRpdGFibGVTdGF0ZShwcm9wb3NhbC5leGlzdGluZyksXG5cdFx0XHRcdH1cblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgX3Byb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRpZiAoIWlzQXV0b21hdGlvbnNFbmFibGVkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHRyZXR1cm4gYXV0b21hdGlvblRvb2xFcnJvcignQXV0b21hdGlvbnMgYXJlIGRpc2FibGVkLicpO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBhdXRvbWF0aW9uVG9vbENhbmNlbGxlZCgpO1xuXHRcdH1cblxuXHRcdGxldCBwcm9wb3NhbDogSUF1dG9tYXRpb25Qcm9wb3NhbDtcblx0XHR0cnkge1xuXHRcdFx0cHJvcG9zYWwgPSB0aGlzLnBhcnNlUHJvcG9zYWwoaW52b2NhdGlvbi5wYXJhbWV0ZXJzLCBpbnZvY2F0aW9uLmNvbnRleHQ/LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIEF1dG9tYXRpb25Ub29sSW5wdXRFcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gYXV0b21hdGlvblRvb2xFcnJvcihlcnJvci5tZXNzYWdlKTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAocHJvcG9zYWwua2luZCA9PT0gJ2NyZWF0ZScpIHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gcHJvcG9zYWwudmFsaWRhdGVUYXJnZXRBdmFpbGFiaWxpdHlcblx0XHRcdFx0XHQ/IHRoaXMucmVzb2x2ZUF2YWlsYWJsZVRhcmdldChwcm9wb3NhbC5pbml0aWFsVmFsdWVzLnRhcmdldClcblx0XHRcdFx0XHQ6IHByb3Bvc2FsLmluaXRpYWxWYWx1ZXMudGFyZ2V0O1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5hcHBseUNyZWF0ZSh7IC4uLnByb3Bvc2FsLmluaXRpYWxWYWx1ZXMsIHRhcmdldCB9LCB0b2tlbik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRhcmdldCA9IHByb3Bvc2FsLmluaXRpYWxWYWx1ZXMudGFyZ2V0XG5cdFx0XHRcdD8gcHJvcG9zYWwudmFsaWRhdGVUYXJnZXRBdmFpbGFiaWxpdHlcblx0XHRcdFx0XHQ/IHRoaXMucmVzb2x2ZUF2YWlsYWJsZVRhcmdldChwcm9wb3NhbC5pbml0aWFsVmFsdWVzLnRhcmdldClcblx0XHRcdFx0XHQ6IHByb3Bvc2FsLmluaXRpYWxWYWx1ZXMudGFyZ2V0XG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcGF0Y2ggPSB0YXJnZXQgPyB7IC4uLnByb3Bvc2FsLmluaXRpYWxWYWx1ZXMsIHRhcmdldCB9IDogcHJvcG9zYWwuaW5pdGlhbFZhbHVlcztcblx0XHRcdGNvbnN0IHByZXBhcmVkID0gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnYXV0b21hdGlvbkNvbmZpZ3VyYXRpb24nXG5cdFx0XHRcdD8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHByZXBhcmVkICYmIChwcmVwYXJlZC5leHBlY3RlZEF1dG9tYXRpb25JZCAhPT0gcHJvcG9zYWwuZXhpc3RpbmcuaWQgfHwgcHJlcGFyZWQuZXhwZWN0ZWRFZGl0YWJsZVN0YXRlICE9PSBzZXJpYWxpemVBdXRvbWF0aW9uRWRpdGFibGVTdGF0ZShwcm9wb3NhbC5leGlzdGluZykpKSB7XG5cdFx0XHRcdHJldHVybiBhdXRvbWF0aW9uVG9vbEVycm9yKGBBdXRvbWF0aW9uIFwiJHtwcm9wb3NhbC5leGlzdGluZy5pZH1cIiBjaGFuZ2VkIGJlZm9yZSB0aGUgdXBkYXRlIHdhcyBhcHBsaWVkLiBDYWxsIGxpc3RBdXRvbWF0aW9ucyB0byByZWZyZXNoIGl0IGJlZm9yZSBwcm9wb3NpbmcgbmV3IGNoYW5nZXMuIE5vIGNoYW5nZXMgd2VyZSBtYWRlLmApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuYXBwbHlVcGRhdGUocHJvcG9zYWwuZXhpc3RpbmcsIHBhdGNoLCB0b2tlbik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIEF1dG9tYXRpb25Ub29sTXV0YXRpb25CbG9ja2VkRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIGVycm9yLnJlc3VsdDtcblx0XHRcdH1cblx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIEF1dG9tYXRpb25Ub29sSW5wdXRFcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gYXV0b21hdGlvblRvb2xFcnJvcihlcnJvci5tZXNzYWdlKTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYXBwbHlDcmVhdGUob3B0aW9uczogSUNyZWF0ZUF1dG9tYXRpb25PcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3QgYmxvY2tlZCA9IHRoaXMuZ2V0TXV0YXRpb25CbG9ja2VkUmVzdWx0KHRva2VuKTtcblx0XHRpZiAoYmxvY2tlZCkge1xuXHRcdFx0cmV0dXJuIGJsb2NrZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24ob3B0aW9ucywgdGhpcy5jcmVhdGVNdXRhdGlvbkd1YXJkKHRva2VuKSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXV0b21hdGlvblRvb2xSZXN1bHQoSlNPTi5zdHJpbmdpZnkoeyBzdGF0dXM6ICdjcmVhdGVkJywgYXV0b21hdGlvbjogdG9BdXRvbWF0aW9uVG9vbE91dHB1dChjcmVhdGVkKSB9LCB1bmRlZmluZWQsIDIpKTtcblx0XHRyZXN1bHQudG9vbFNwZWNpZmljRGF0YSA9IHRvQXV0b21hdGlvbkNvbmZpZ3VyZWREYXRhKGNyZWF0ZWQsICdjcmVhdGVkJyk7XG5cdFx0cmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlID0gbG9jYWxpemUoJ2F1dG9tYXRpb24udG9vbC5jb25maWd1cmUuY3JlYXRlZCcsIFwiQ3JlYXRlZCBhdXRvbWF0aW9uIHswfVwiLCBjcmVhdGVkLm5hbWUpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFwcGx5VXBkYXRlKGV4aXN0aW5nOiBJQXV0b21hdGlvbiwgcGF0Y2g6IElVcGRhdGVBdXRvbWF0aW9uT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IGJsb2NrZWQgPSB0aGlzLmdldE11dGF0aW9uQmxvY2tlZFJlc3VsdCh0b2tlbik7XG5cdFx0aWYgKGJsb2NrZWQpIHtcblx0XHRcdHJldHVybiBibG9ja2VkO1xuXHRcdH1cblx0XHRjb25zdCB1cGRhdGVSZXN1bHQgPSBhd2FpdCB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLnVwZGF0ZUF1dG9tYXRpb25JZlVuY2hhbmdlZChleGlzdGluZy5pZCwgcGF0Y2gsIGV4aXN0aW5nLCB0aGlzLmNyZWF0ZU11dGF0aW9uR3VhcmQodG9rZW4pKTtcblx0XHRpZiAodXBkYXRlUmVzdWx0LmtpbmQgPT09ICdjb25mbGljdCcgJiYgIXVwZGF0ZVJlc3VsdC5jdXJyZW50KSB7XG5cdFx0XHRyZXR1cm4gYXV0b21hdGlvblRvb2xFcnJvcihgQXV0b21hdGlvbiBcIiR7ZXhpc3RpbmcuaWR9XCIgd2FzIGRlbGV0ZWQgYmVmb3JlIHRoZSB1cGRhdGUgd2FzIGFwcGxpZWQuIE5vIGNoYW5nZXMgd2VyZSBtYWRlLmApO1xuXHRcdH1cblx0XHRpZiAodXBkYXRlUmVzdWx0LmtpbmQgPT09ICdjb25mbGljdCcpIHtcblx0XHRcdHJldHVybiBhdXRvbWF0aW9uVG9vbEVycm9yKGBBdXRvbWF0aW9uIFwiJHtleGlzdGluZy5pZH1cIiBjaGFuZ2VkIGJlZm9yZSB0aGUgdXBkYXRlIHdhcyBhcHBsaWVkLiBDYWxsIGxpc3RBdXRvbWF0aW9ucyB0byByZWZyZXNoIGl0IGJlZm9yZSBwcm9wb3NpbmcgbmV3IGNoYW5nZXMuIE5vIGNoYW5nZXMgd2VyZSBtYWRlLmApO1xuXHRcdH1cblx0XHRjb25zdCB1cGRhdGVkID0gdXBkYXRlUmVzdWx0LmF1dG9tYXRpb247XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXV0b21hdGlvblRvb2xSZXN1bHQoSlNPTi5zdHJpbmdpZnkoeyBzdGF0dXM6ICd1cGRhdGVkJywgYXV0b21hdGlvbjogdG9BdXRvbWF0aW9uVG9vbE91dHB1dCh1cGRhdGVkKSB9LCB1bmRlZmluZWQsIDIpKTtcblx0XHRyZXN1bHQudG9vbFNwZWNpZmljRGF0YSA9IHRvQXV0b21hdGlvbkNvbmZpZ3VyZWREYXRhKHVwZGF0ZWQsICd1cGRhdGVkJyk7XG5cdFx0cmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlID0gbG9jYWxpemUoJ2F1dG9tYXRpb24udG9vbC5jb25maWd1cmUudXBkYXRlZCcsIFwiVXBkYXRlZCBhdXRvbWF0aW9uIHswfVwiLCB1cGRhdGVkLm5hbWUpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU11dGF0aW9uR3VhcmQodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogQXV0b21hdGlvbk11dGF0aW9uR3VhcmQge1xuXHRcdHJldHVybiAoKSA9PiB7XG5cdFx0XHRjb25zdCBibG9ja2VkID0gdGhpcy5nZXRNdXRhdGlvbkJsb2NrZWRSZXN1bHQodG9rZW4pO1xuXHRcdFx0aWYgKGJsb2NrZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEF1dG9tYXRpb25Ub29sTXV0YXRpb25CbG9ja2VkRXJyb3IoYmxvY2tlZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TXV0YXRpb25CbG9ja2VkUmVzdWx0KHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IElUb29sUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWlzQXV0b21hdGlvbnNFbmFibGVkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHRyZXR1cm4gYXV0b21hdGlvblRvb2xFcnJvcignQXV0b21hdGlvbnMgYXJlIGRpc2FibGVkLicpO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBhdXRvbWF0aW9uVG9vbENhbmNlbGxlZCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlQXZhaWxhYmxlVGFyZ2V0KHRhcmdldDogQXV0b21hdGlvblRhcmdldCk6IEF1dG9tYXRpb25UYXJnZXQge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSB0YXJnZXQua2luZCA9PT0gJ3F1aWNrQ2hhdCdcblx0XHRcdD8gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFF1aWNrQ2hhdFNlc3Npb25UeXBlcygpXG5cdFx0XHQ6IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uVHlwZXNGb3JGb2xkZXIodGFyZ2V0LmZvbGRlclVyaSk7XG5cdFx0Y29uc3QgY2FuZGlkYXRlID0gZmluZFNlc3Npb25UeXBlKGNhbmRpZGF0ZXMsIHRhcmdldC5wcm92aWRlcklkLCB0YXJnZXQuc2Vzc2lvblR5cGVJZCk7XG5cdFx0aWYgKCFjYW5kaWRhdGUpIHtcblx0XHRcdHRocm93IG5ldyBBdXRvbWF0aW9uVG9vbElucHV0RXJyb3IodGFyZ2V0LmtpbmQgPT09ICdxdWlja0NoYXQnXG5cdFx0XHRcdD8gYFRoZSBxdWljay1jaGF0IHRhcmdldCBcIiR7dGFyZ2V0LnByb3ZpZGVySWR9LyR7dGFyZ2V0LnNlc3Npb25UeXBlSWR9XCIgaXMgbm90IGF2YWlsYWJsZS5gXG5cdFx0XHRcdDogJ1RoZSBwcm9wb3NlZCB3b3Jrc3BhY2UgdGFyZ2V0IGlzIG5vdCBhdmFpbGFibGUgZm9yIHRoZSBzZWxlY3RlZCBwcm92aWRlciBhbmQgc2Vzc2lvbiB0eXBlLicpO1xuXHRcdH1cblx0XHRpZiAodGFyZ2V0LmtpbmQgPT09ICd3b3Jrc3BhY2UnICYmIHRhcmdldC5pc29sYXRpb24ua2luZCA9PT0gJ3dvcmt0cmVlJyAmJiAhY2FuZGlkYXRlLnNlc3Npb25UeXBlLnN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgQXV0b21hdGlvblRvb2xJbnB1dEVycm9yKGBTZXNzaW9uIHR5cGUgXCIke2NhbmRpZGF0ZS5zZXNzaW9uVHlwZS5pZH1cIiBkb2VzIG5vdCBzdXBwb3J0IHdvcmt0cmVlIGlzb2xhdGlvbi5gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnRhcmdldCxcblx0XHRcdHByb3ZpZGVySWQ6IGNhbmRpZGF0ZS5wcm92aWRlcklkLFxuXHRcdFx0c2Vzc2lvblR5cGVJZDogY2FuZGlkYXRlLnNlc3Npb25UeXBlLmlkLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlUHJvcG9zYWwocGFyYW1ldGVyczogdW5rbm93biwgc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBJQXV0b21hdGlvblByb3Bvc2FsIHtcblx0XHRjb25zdCByYXdJbnB1dCA9IHBhcmFtZXRlcnM7XG5cdFx0aWYgKCFpc1JlY29yZChyYXdJbnB1dCkpIHtcblx0XHRcdHRocm93IG5ldyBBdXRvbWF0aW9uVG9vbElucHV0RXJyb3IoJ2NvbmZpZ3VyZUF1dG9tYXRpb24gaW5wdXQgbXVzdCBiZSBhbiBvYmplY3QuJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gcmF3SW5wdXQ7XG5cdFx0YXNzZXJ0S25vd25Qcm9wZXJ0aWVzKGlucHV0LCBbJ2F1dG9tYXRpb25JZCcsICduYW1lJywgJ3Byb21wdCcsICdzY2hlZHVsZScsICd0YXJnZXQnLCAnbW9kZWxJZCcsICdtb2RlJywgJ3Blcm1pc3Npb25MZXZlbCcsICdlbmFibGVkJ10sICdjb25maWd1cmVBdXRvbWF0aW9uIGlucHV0Jyk7XG5cblx0XHRjb25zdCBhdXRvbWF0aW9uSWQgPSByZWFkT3B0aW9uYWxOb25FbXB0eVN0cmluZyhpbnB1dCwgJ2F1dG9tYXRpb25JZCcpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gYXV0b21hdGlvbklkID8gdGhpcy5hdXRvbWF0aW9uU2VydmljZS5nZXRBdXRvbWF0aW9uKGF1dG9tYXRpb25JZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGF1dG9tYXRpb25JZCAmJiAhZXhpc3RpbmcpIHtcblx0XHRcdHRocm93IG5ldyBBdXRvbWF0aW9uVG9vbElucHV0RXJyb3IoYEF1dG9tYXRpb24gXCIke2F1dG9tYXRpb25JZH1cIiBkb2VzIG5vdCBleGlzdC4gQ2FsbCBsaXN0QXV0b21hdGlvbnMgdG8gcmVmcmVzaCB0aGUgYXZhaWxhYmxlIElEcy5gKTtcblx0XHR9XG5cblx0XHRjb25zdCBuYW1lID0gcmVhZE9wdGlvbmFsUmVxdWlyZWRUZXh0KGlucHV0LCAnbmFtZScpO1xuXHRcdGNvbnN0IHByb21wdCA9IHJlYWRPcHRpb25hbFJlcXVpcmVkVGV4dChpbnB1dCwgJ3Byb21wdCcpO1xuXHRcdGlmICghZXhpc3RpbmcgJiYgbmFtZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQXV0b21hdGlvblRvb2xJbnB1dEVycm9yKCdcIm5hbWVcIiBpcyByZXF1aXJlZCB3aGVuIGNyZWF0aW5nIGFuIGF1dG9tYXRpb24uJyk7XG5cdFx0fVxuXHRcdGlmICghZXhpc3RpbmcgJiYgcHJvbXB0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBBdXRvbWF0aW9uVG9vbElucHV0RXJyb3IoJ1wicHJvbXB0XCIgaXMgcmVxdWlyZWQgd2hlbiBjcmVhdGluZyBhbiBhdXRvbWF0aW9uLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNjaGVkdWxlID0gcGFyc2VTY2hlZHVsZShpbnB1dCwgZXhpc3Rpbmc/LnNjaGVkdWxlLCAhZXhpc3RpbmcpO1xuXHRcdGNvbnN0IGN1cnJlbnRUYXJnZXQgPSB0aGlzLmdldEN1cnJlbnRTZXNzaW9uVGFyZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gcGFyc2VUYXJnZXQoaW5wdXQsIGV4aXN0aW5nLCBjdXJyZW50VGFyZ2V0KTtcblx0XHRjb25zdCBtb2RlbElkID0gcmVhZE9wdGlvbmFsTnVsbGFibGVOb25FbXB0eVN0cmluZyhpbnB1dCwgJ21vZGVsSWQnKTtcblx0XHRjb25zdCBtb2RlID0gcmVhZE9wdGlvbmFsTnVsbGFibGVFbnVtKGlucHV0LCAnbW9kZScsIGNoYXRNb2Rlcyk7XG5cdFx0Y29uc3QgcGVybWlzc2lvbkxldmVsID0gcmVhZE9wdGlvbmFsTnVsbGFibGVFbnVtKGlucHV0LCAncGVybWlzc2lvbkxldmVsJywgY2hhdFBlcm1pc3Npb25MZXZlbHMpO1xuXHRcdGNvbnN0IGVuYWJsZWQgPSByZWFkT3B0aW9uYWxCb29sZWFuKGlucHV0LCAnZW5hYmxlZCcpO1xuXG5cdFx0Y29uc3QgcHJvcG9zZWRWYWx1ZXM6IElVcGRhdGVBdXRvbWF0aW9uT3B0aW9ucyA9IHtcblx0XHRcdC4uLihuYW1lICE9PSB1bmRlZmluZWQgPyB7IG5hbWUgfSA6IHt9KSxcblx0XHRcdC4uLihwcm9tcHQgIT09IHVuZGVmaW5lZCA/IHsgcHJvbXB0IH0gOiB7fSksXG5cdFx0XHQuLi4oc2NoZWR1bGUgPyB7IHNjaGVkdWxlIH0gOiB7fSksXG5cdFx0XHQuLi4odGFyZ2V0ID8geyB0YXJnZXQgfSA6IHt9KSxcblx0XHRcdC4uLihtb2RlbElkICE9PSB1bmRlZmluZWQgPyB7IG1vZGVsSWQgfSA6IHt9KSxcblx0XHRcdC4uLihtb2RlICE9PSB1bmRlZmluZWQgPyB7IG1vZGUgfSA6IHt9KSxcblx0XHRcdC4uLihwZXJtaXNzaW9uTGV2ZWwgIT09IHVuZGVmaW5lZCA/IHsgcGVybWlzc2lvbkxldmVsIH0gOiB7fSksXG5cdFx0XHQuLi4oZW5hYmxlZCAhPT0gdW5kZWZpbmVkID8geyBlbmFibGVkIH0gOiB7fSksXG5cdFx0fTtcblx0XHRjb25zdCB2YWxpZGF0ZVRhcmdldEF2YWlsYWJpbGl0eSA9IGlucHV0LnRhcmdldCAhPT0gdW5kZWZpbmVkXG5cdFx0XHQmJiAhKGlzUmVjb3JkKGlucHV0LnRhcmdldCkgJiYgaW5wdXQudGFyZ2V0LmtpbmQgPT09ICdjdXJyZW50U2Vzc2lvbicpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ3VwZGF0ZScsIGV4aXN0aW5nLCBpbml0aWFsVmFsdWVzOiBwcm9wb3NlZFZhbHVlcywgdmFsaWRhdGVUYXJnZXRBdmFpbGFiaWxpdHkgfTtcblx0XHR9XG5cdFx0aWYgKCFzY2hlZHVsZSkge1xuXHRcdFx0dGhyb3cgbmV3IEF1dG9tYXRpb25Ub29sSW5wdXRFcnJvcignXCJzY2hlZHVsZVwiIGlzIHJlcXVpcmVkIHdoZW4gY3JlYXRpbmcgYW4gYXV0b21hdGlvbi4nKTtcblx0XHR9XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHRocm93IG5ldyBBdXRvbWF0aW9uVG9vbElucHV0RXJyb3IoJ0EgdGFyZ2V0IGNvdWxkIG5vdCBiZSBkZXJpdmVkIGZyb20gdGhlIGN1cnJlbnQgc2Vzc2lvbi4gUHJvdmlkZSBhbiBleHBsaWNpdCBcInRhcmdldFwiLicpO1xuXHRcdH1cblx0XHRpZiAobmFtZSA9PT0gdW5kZWZpbmVkIHx8IHByb21wdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0F1dG9tYXRpb24gY3JlYXRlIHByb3Bvc2FsIGlzIG1pc3NpbmcgcmVxdWlyZWQgdmFsdWVzLicpO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2NyZWF0ZScsXG5cdFx0XHRleGlzdGluZzogdW5kZWZpbmVkLFxuXHRcdFx0aW5pdGlhbFZhbHVlczoge1xuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRwcm9tcHQsXG5cdFx0XHRcdHNjaGVkdWxlLFxuXHRcdFx0XHR0YXJnZXQsXG5cdFx0XHRcdC4uLihtb2RlbElkID8geyBtb2RlbElkIH0gOiB7fSksXG5cdFx0XHRcdC4uLihtb2RlID8geyBtb2RlIH0gOiB7fSksXG5cdFx0XHRcdC4uLihwZXJtaXNzaW9uTGV2ZWwgPyB7IHBlcm1pc3Npb25MZXZlbCB9IDoge30pLFxuXHRcdFx0XHQuLi4oZW5hYmxlZCAhPT0gdW5kZWZpbmVkID8geyBlbmFibGVkIH0gOiB7fSksXG5cdFx0XHR9LFxuXHRcdFx0dmFsaWRhdGVUYXJnZXRBdmFpbGFiaWxpdHksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q3VycmVudFNlc3Npb25UYXJnZXQocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCk6IEF1dG9tYXRpb25UYXJnZXQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbihyZXNvdXJjZSlcblx0XHRcdD8/IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uRm9yQ2hhdFJlc291cmNlKHJlc291cmNlKT8uc2Vzc2lvbjtcblx0XHRyZXR1cm4gc2Vzc2lvbiA/IGF1dG9tYXRpb25UYXJnZXRGcm9tU2Vzc2lvbihzZXNzaW9uKSA6IHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQXV0b21hdGlvblRvb2xzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzZXNzaW9ucy5jb250cmliLmF1dG9tYXRpb25Ub29scyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgbGlzdFRvb2wgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMaXN0QXV0b21hdGlvbnNUb29sKTtcblx0XHRjb25zdCBjb25maWd1cmVUb29sID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29uZmlndXJlQXV0b21hdGlvblRvb2wpO1xuXHRcdGNvbnN0IHJ1blRvb2wgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSdW5BdXRvbWF0aW9uVG9vbCk7XG5cdFx0Y29uc3QgZGVsZXRlVG9vbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlbGV0ZUF1dG9tYXRpb25Ub29sKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sKGxpc3RUb29sLmdldFRvb2xEYXRhKCksIGxpc3RUb29sKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbChjb25maWd1cmVUb29sLmdldFRvb2xEYXRhKCksIGNvbmZpZ3VyZVRvb2wpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sKHJ1blRvb2wuZ2V0VG9vbERhdGEoKSwgcnVuVG9vbCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvb2xzU2VydmljZS5yZWdpc3RlclRvb2woZGVsZXRlVG9vbC5nZXRUb29sRGF0YSgpLCBkZWxldGVUb29sKSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNBdXRvbWF0aW9uc0VuYWJsZWQoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ0hBVF9BVVRPTUFUSU9OU19FTkFCTEVEX1NFVFRJTkcpID09PSB0cnVlO1xufVxuXG5mdW5jdGlvbiBmaW5kU2Vzc2lvblR5cGUoY2FuZGlkYXRlczogcmVhZG9ubHkgSVByb3ZpZGVyU2Vzc2lvblR5cGVbXSwgcHJvdmlkZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBzZXNzaW9uVHlwZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJUHJvdmlkZXJTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBjYW5kaWRhdGVzLmZpbmQoY2FuZGlkYXRlID0+XG5cdFx0KHByb3ZpZGVySWQgPT09IHVuZGVmaW5lZCB8fCBjYW5kaWRhdGUucHJvdmlkZXJJZCA9PT0gcHJvdmlkZXJJZClcblx0XHQmJiAoc2Vzc2lvblR5cGVJZCA9PT0gdW5kZWZpbmVkIHx8IGNhbmRpZGF0ZS5zZXNzaW9uVHlwZS5pZCA9PT0gc2Vzc2lvblR5cGVJZCkpO1xufVxuXG5mdW5jdGlvbiBhdXRvbWF0aW9uVGFyZ2V0RnJvbVNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiBBdXRvbWF0aW9uVGFyZ2V0IHwgdW5kZWZpbmVkIHtcblx0aWYgKHNlc3Npb24uaXNRdWlja0NoYXQ/LmdldCgpID09PSB0cnVlKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdxdWlja0NoYXQnLFxuXHRcdFx0cHJvdmlkZXJJZDogc2Vzc2lvbi5wcm92aWRlcklkLFxuXHRcdFx0c2Vzc2lvblR5cGVJZDogc2Vzc2lvbi5zZXNzaW9uVHlwZSxcblx0XHR9O1xuXHR9XG5cdGNvbnN0IHdvcmtzcGFjZSA9IHNlc3Npb24ud29ya3NwYWNlLmdldCgpO1xuXHRyZXR1cm4gd29ya3NwYWNlID8ge1xuXHRcdGtpbmQ6ICd3b3Jrc3BhY2UnLFxuXHRcdGZvbGRlclVyaTogd29ya3NwYWNlLnVyaSxcblx0XHRwcm92aWRlcklkOiBzZXNzaW9uLnByb3ZpZGVySWQsXG5cdFx0c2Vzc2lvblR5cGVJZDogc2Vzc2lvbi5zZXNzaW9uVHlwZSxcblx0XHRpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0sXG5cdH0gOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHBhcnNlU2NoZWR1bGUoaW5wdXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBleGlzdGluZzogSUF1dG9tYXRpb25TY2hlZHVsZSB8IHVuZGVmaW5lZCwgcmVxdWlyZWQ6IGJvb2xlYW4pOiBJQXV0b21hdGlvblNjaGVkdWxlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdmFsdWUgPSByZWFkT3B0aW9uYWxPYmplY3QoaW5wdXQsICdzY2hlZHVsZScpO1xuXHRpZiAoIXZhbHVlKSB7XG5cdFx0aWYgKHJlcXVpcmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQXV0b21hdGlvblRvb2xJbnB1dEVycm9yKCdcInNjaGVkdWxlXCIgaXMgcmVxdWlyZWQgd2hlbiBjcmVhdGluZyBhbiBhdXRvbWF0aW9uLicpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXNzZXJ0S25vd25Qcm9wZXJ0aWVzKHZhbHVlLCBbJ2ludGVydmFsJywgJ3NjaGVkdWxlSG91cicsICdzY2hlZHVsZU1pbnV0ZScsICdzY2hlZHVsZURheSddLCAnXCJzY2hlZHVsZVwiJyk7XG5cdGNvbnN0IGludGVydmFsID0gcmVhZE9wdGlvbmFsRW51bSh2YWx1ZSwgJ2ludGVydmFsJywgYXV0b21hdGlvbkludGVydmFscykgPz8gZXhpc3Rpbmc/LmludGVydmFsO1xuXHRpZiAoIWludGVydmFsKSB7XG5cdFx0dGhyb3cgbmV3IEF1dG9tYXRpb25Ub29sSW5wdXRFcnJvcignXCJzY2hlZHVsZS5pbnRlcnZhbFwiIGlzIHJlcXVpcmVkIHdoZW4gY3JlYXRpbmcgYW4gYXV0b21hdGlvbi4nKTtcblx0fVxuXHRjb25zdCBzY2hlZHVsZUhvdXIgPSByZWFkT3B0aW9uYWxJbnRlZ2VyKHZhbHVlLCAnc2NoZWR1bGVIb3VyJywgMCwgMjMpID8/IGV4aXN0aW5nPy5zY2hlZHVsZUhvdXIgPz8gOTtcblx0Y29uc3Qgc2NoZWR1bGVNaW51dGUgPSByZWFkT3B0aW9uYWxJbnRlZ2VyKHZhbHVlLCAnc2NoZWR1bGVNaW51dGUnLCAwLCA1OSkgPz8gZXhpc3Rpbmc/LnNjaGVkdWxlTWludXRlID8/IDA7XG5cdGNvbnN0IHNjaGVkdWxlRGF5ID0gcmVhZE9wdGlvbmFsSW50ZWdlcih2YWx1ZSwgJ3NjaGVkdWxlRGF5JywgMCwgNikgPz8gZXhpc3Rpbmc/LnNjaGVkdWxlRGF5ID8/IDE7XG5cblx0cmV0dXJuIHsgaW50ZXJ2YWwsIHNjaGVkdWxlSG91ciwgc2NoZWR1bGVNaW51dGUsIHNjaGVkdWxlRGF5IH07XG59XG5cbmZ1bmN0aW9uIHBhcnNlVGFyZ2V0KGlucHV0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgZXhpc3Rpbmc6IElBdXRvbWF0aW9uIHwgdW5kZWZpbmVkLCBjdXJyZW50VGFyZ2V0OiBBdXRvbWF0aW9uVGFyZ2V0IHwgdW5kZWZpbmVkKTogQXV0b21hdGlvblRhcmdldCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHZhbHVlID0gcmVhZE9wdGlvbmFsT2JqZWN0KGlucHV0LCAndGFyZ2V0Jyk7XG5cdGlmICghdmFsdWUpIHtcblx0XHRyZXR1cm4gZXhpc3RpbmcgPyB1bmRlZmluZWQgOiBjdXJyZW50VGFyZ2V0O1xuXHR9XG5cblx0YXNzZXJ0S25vd25Qcm9wZXJ0aWVzKHZhbHVlLCBbJ2tpbmQnLCAnZm9sZGVyVXJpJywgJ3Byb3ZpZGVySWQnLCAnc2Vzc2lvblR5cGVJZCcsICdpc29sYXRpb24nLCAnYnJhbmNoJ10sICdcInRhcmdldFwiJyk7XG5cdGNvbnN0IGtpbmQgPSByZWFkUmVxdWlyZWRFbnVtKHZhbHVlLCAna2luZCcsIFsnY3VycmVudFNlc3Npb24nLCAnd29ya3NwYWNlJywgJ3F1aWNrQ2hhdCddIGFzIGNvbnN0KTtcblx0aWYgKGtpbmQgPT09ICdjdXJyZW50U2Vzc2lvbicpIHtcblx0XHRhc3NlcnRQcm9wZXJ0aWVzQWJzZW50KHZhbHVlLCBbJ2ZvbGRlclVyaScsICdwcm92aWRlcklkJywgJ3Nlc3Npb25UeXBlSWQnLCAnaXNvbGF0aW9uJywgJ2JyYW5jaCddLCAnQSBjdXJyZW50U2Vzc2lvbiB0YXJnZXQnKTtcblx0XHRpZiAoIWN1cnJlbnRUYXJnZXQpIHtcblx0XHRcdHRocm93IG5ldyBBdXRvbWF0aW9uVG9vbElucHV0RXJyb3IoJ1RoZSBjdXJyZW50IHNlc3Npb24gZG9lcyBub3QgaGF2ZSBhIHJlc29sdmVkIGF1dG9tYXRpb24gdGFyZ2V0LicpO1xuXHRcdH1cblx0XHRyZXR1cm4gY3VycmVudFRhcmdldDtcblx0fVxuXG5cdGlmIChraW5kID09PSAncXVpY2tDaGF0Jykge1xuXHRcdGFzc2VydFByb3BlcnRpZXNBYnNlbnQodmFsdWUsIFsnZm9sZGVyVXJpJywgJ2lzb2xhdGlvbicsICdicmFuY2gnXSwgJ0EgcXVpY2tDaGF0IHRhcmdldCcpO1xuXHRcdGNvbnN0IGV4aXN0aW5nVGFyZ2V0ID0gZXhpc3Rpbmc/LnRhcmdldC5raW5kID09PSAncXVpY2tDaGF0JyA/IGV4aXN0aW5nLnRhcmdldCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwcm92aWRlcklkID0gcmVhZE9wdGlvbmFsTm9uRW1wdHlTdHJpbmcodmFsdWUsICdwcm92aWRlcklkJykgPz8gZXhpc3RpbmdUYXJnZXQ/LnByb3ZpZGVySWQgPz8gY3VycmVudFRhcmdldD8ucHJvdmlkZXJJZDtcblx0XHRjb25zdCBzZXNzaW9uVHlwZUlkID0gcmVhZE9wdGlvbmFsTm9uRW1wdHlTdHJpbmcodmFsdWUsICdzZXNzaW9uVHlwZUlkJykgPz8gZXhpc3RpbmdUYXJnZXQ/LnNlc3Npb25UeXBlSWQgPz8gY3VycmVudFRhcmdldD8uc2Vzc2lvblR5cGVJZDtcblx0XHRpZiAoIXByb3ZpZGVySWQgfHwgIXNlc3Npb25UeXBlSWQpIHtcblx0XHRcdHRocm93IG5ldyBBdXRvbWF0aW9uVG9vbElucHV0RXJyb3IoJ0EgcXVpY2tDaGF0IHRhcmdldCByZXF1aXJlcyBcInByb3ZpZGVySWRcIiBhbmQgXCJzZXNzaW9uVHlwZUlkXCIuJyk7XG5cdFx0fVxuXHRcdHJldHVybiB7IGtpbmQ6ICdxdWlja0NoYXQnLCBwcm92aWRlcklkLCBzZXNzaW9uVHlwZUlkIH07XG5cdH1cblxuXHRjb25zdCBleGlzdGluZ1RhcmdldCA9IGV4aXN0aW5nPy50YXJnZXQua2luZCA9PT0gJ3dvcmtzcGFjZScgPyBleGlzdGluZy50YXJnZXQgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IHNlc3Npb25UYXJnZXQgPSBjdXJyZW50VGFyZ2V0Py5raW5kID09PSAnd29ya3NwYWNlJyA/IGN1cnJlbnRUYXJnZXQgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGJhc2VUYXJnZXQgPSBleGlzdGluZ1RhcmdldCA/PyBzZXNzaW9uVGFyZ2V0O1xuXHRjb25zdCBmb2xkZXJVcmlWYWx1ZSA9IHJlYWRPcHRpb25hbE5vbkVtcHR5U3RyaW5nKHZhbHVlLCAnZm9sZGVyVXJpJyk7XG5cdGNvbnN0IGZvbGRlclVyaSA9IGZvbGRlclVyaVZhbHVlID8gcGFyc2VVcmkoZm9sZGVyVXJpVmFsdWUsICd0YXJnZXQuZm9sZGVyVXJpJykgOiBiYXNlVGFyZ2V0Py5mb2xkZXJVcmk7XG5cdGlmICghZm9sZGVyVXJpKSB7XG5cdFx0dGhyb3cgbmV3IEF1dG9tYXRpb25Ub29sSW5wdXRFcnJvcignQSB3b3Jrc3BhY2UgdGFyZ2V0IHJlcXVpcmVzIFwiZm9sZGVyVXJpXCIuJyk7XG5cdH1cblx0Y29uc3QgcHJvdmlkZXJJZCA9IHJlYWRPcHRpb25hbE5vbkVtcHR5U3RyaW5nKHZhbHVlLCAncHJvdmlkZXJJZCcpID8/IGJhc2VUYXJnZXQ/LnByb3ZpZGVySWQ7XG5cdGNvbnN0IHNlc3Npb25UeXBlSWQgPSByZWFkT3B0aW9uYWxOb25FbXB0eVN0cmluZyh2YWx1ZSwgJ3Nlc3Npb25UeXBlSWQnKSA/PyBiYXNlVGFyZ2V0Py5zZXNzaW9uVHlwZUlkO1xuXHRjb25zdCBpc29sYXRpb25LaW5kID0gcmVhZE9wdGlvbmFsRW51bSh2YWx1ZSwgJ2lzb2xhdGlvbicsIGF1dG9tYXRpb25Jc29sYXRpb25LaW5kcykgPz8gYmFzZVRhcmdldD8uaXNvbGF0aW9uLmtpbmQgPz8gJ2RlZmF1bHQnO1xuXHRjb25zdCBicmFuY2ggPSByZWFkT3B0aW9uYWxOb25FbXB0eVN0cmluZyh2YWx1ZSwgJ2JyYW5jaCcpXG5cdFx0Pz8gKGJhc2VUYXJnZXQ/Lmlzb2xhdGlvbi5raW5kID09PSAnd29ya3RyZWUnID8gYmFzZVRhcmdldC5pc29sYXRpb24uYnJhbmNoIDogdW5kZWZpbmVkKTtcblx0aWYgKGlzb2xhdGlvbktpbmQgIT09ICd3b3JrdHJlZScgJiYgcmVhZE9wdGlvbmFsTm9uRW1wdHlTdHJpbmcodmFsdWUsICdicmFuY2gnKSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0dGhyb3cgbmV3IEF1dG9tYXRpb25Ub29sSW5wdXRFcnJvcignXCJ0YXJnZXQuYnJhbmNoXCIgaXMgb25seSB2YWxpZCB3aXRoIHdvcmt0cmVlIGlzb2xhdGlvbi4nKTtcblx0fVxuXHRsZXQgaXNvbGF0aW9uOiBBdXRvbWF0aW9uV29ya3NwYWNlSXNvbGF0aW9uO1xuXHRpZiAoaXNvbGF0aW9uS2luZCA9PT0gJ3dvcmt0cmVlJykge1xuXHRcdGlmICghYnJhbmNoKSB7XG5cdFx0XHR0aHJvdyBuZXcgQXV0b21hdGlvblRvb2xJbnB1dEVycm9yKCdBIHdvcmtzcGFjZSB0YXJnZXQgd2l0aCB3b3JrdHJlZSBpc29sYXRpb24gcmVxdWlyZXMgXCJicmFuY2hcIi4nKTtcblx0XHR9XG5cdFx0aXNvbGF0aW9uID0geyBraW5kOiAnd29ya3RyZWUnLCBicmFuY2ggfTtcblx0fSBlbHNlIHtcblx0XHRpc29sYXRpb24gPSB7IGtpbmQ6IGlzb2xhdGlvbktpbmQgfTtcblx0fVxuXHRyZXR1cm4geyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpLCBwcm92aWRlcklkLCBzZXNzaW9uVHlwZUlkLCBpc29sYXRpb24gfTtcbn1cblxuZnVuY3Rpb24gcGFyc2VVcmkodmFsdWU6IHN0cmluZywgZmllbGQ6IHN0cmluZyk6IFVSSSB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHZhbHVlLCB0cnVlKTtcblx0XHRpZiAoIXVyaS5zY2hlbWUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVVJJIGhhcyBubyBzY2hlbWUuJyk7XG5cdFx0fVxuXHRcdHJldHVybiB1cmk7XG5cdH0gY2F0Y2gge1xuXHRcdHRocm93IG5ldyBBdXRvbWF0aW9uVG9vbElucHV0RXJyb3IoYFwiJHtmaWVsZH1cIiBtdXN0IGJlIGEgdmFsaWQgYWJzb2x1dGUgVVJJLmApO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRvQXV0b21hdGlvblRvb2xPdXRwdXQoYXV0b21hdGlvbjogSUF1dG9tYXRpb24pOiBJQXV0b21hdGlvblRvb2xPdXRwdXQge1xuXHRjb25zdCB0YXJnZXQ6IElBdXRvbWF0aW9uVG9vbE91dHB1dFsndGFyZ2V0J10gPSBhdXRvbWF0aW9uLnRhcmdldC5raW5kID09PSAnd29ya3NwYWNlJ1xuXHRcdD8ge1xuXHRcdFx0a2luZDogJ3dvcmtzcGFjZScsXG5cdFx0XHRmb2xkZXJVcmk6IGF1dG9tYXRpb24udGFyZ2V0LmZvbGRlclVyaS50b1N0cmluZygpLFxuXHRcdFx0cHJvdmlkZXJJZDogYXV0b21hdGlvbi50YXJnZXQucHJvdmlkZXJJZCA/PyBudWxsLFxuXHRcdFx0c2Vzc2lvblR5cGVJZDogYXV0b21hdGlvbi50YXJnZXQuc2Vzc2lvblR5cGVJZCA/PyBudWxsLFxuXHRcdFx0aXNvbGF0aW9uOiBhdXRvbWF0aW9uLnRhcmdldC5pc29sYXRpb24sXG5cdFx0fVxuXHRcdDoge1xuXHRcdFx0a2luZDogJ3F1aWNrQ2hhdCcsXG5cdFx0XHRwcm92aWRlcklkOiBhdXRvbWF0aW9uLnRhcmdldC5wcm92aWRlcklkLFxuXHRcdFx0c2Vzc2lvblR5cGVJZDogYXV0b21hdGlvbi50YXJnZXQuc2Vzc2lvblR5cGVJZCxcblx0XHR9O1xuXHRyZXR1cm4ge1xuXHRcdGlkOiBhdXRvbWF0aW9uLmlkLFxuXHRcdG5hbWU6IGF1dG9tYXRpb24ubmFtZSxcblx0XHRwcm9tcHQ6IGF1dG9tYXRpb24ucHJvbXB0LFxuXHRcdHNjaGVkdWxlOiBhdXRvbWF0aW9uLnNjaGVkdWxlLFxuXHRcdHRhcmdldCxcblx0XHRtb2RlbElkOiBhdXRvbWF0aW9uLm1vZGVsSWQgPz8gbnVsbCxcblx0XHRtb2RlOiBhdXRvbWF0aW9uLm1vZGUgPz8gbnVsbCxcblx0XHRwZXJtaXNzaW9uTGV2ZWw6IGF1dG9tYXRpb24ucGVybWlzc2lvbkxldmVsID8/IG51bGwsXG5cdFx0ZW5hYmxlZDogYXV0b21hdGlvbi5lbmFibGVkLFxuXHRcdGNyZWF0ZWRBdDogYXV0b21hdGlvbi5jcmVhdGVkQXQsXG5cdFx0dXBkYXRlZEF0OiBhdXRvbWF0aW9uLnVwZGF0ZWRBdCxcblx0XHRsYXN0UnVuQXQ6IGF1dG9tYXRpb24ubGFzdFJ1bkF0ID8/IG51bGwsXG5cdFx0bmV4dFJ1bkF0OiBhdXRvbWF0aW9uLm5leHRSdW5BdCA/PyBudWxsLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0b0F1dG9tYXRpb25Db25maWd1cmVkRGF0YShhdXRvbWF0aW9uOiBJQXV0b21hdGlvbiwgb3BlcmF0aW9uOiBJQ2hhdEF1dG9tYXRpb25Db25maWd1cmVkRGF0YVsnb3BlcmF0aW9uJ10pOiBJQ2hhdEF1dG9tYXRpb25Db25maWd1cmVkRGF0YSB7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2F1dG9tYXRpb25Db25maWd1cmVkJyxcblx0XHRhdXRvbWF0aW9uSWQ6IGF1dG9tYXRpb24uaWQsXG5cdFx0YXV0b21hdGlvbk5hbWU6IGF1dG9tYXRpb24ubmFtZSxcblx0XHRvcGVyYXRpb24sXG5cdH07XG59XG5cbmZ1bmN0aW9uIGF1dG9tYXRpb25Ub29sUmVzdWx0KHZhbHVlOiBzdHJpbmcpOiBJVG9vbFJlc3VsdCB7XG5cdHJldHVybiB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWUgfV0gfTtcbn1cblxuZnVuY3Rpb24gYXV0b21hdGlvblRvb2xFcnJvcihtZXNzYWdlOiBzdHJpbmcpOiBJVG9vbFJlc3VsdCB7XG5cdHJldHVybiB7XG5cdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogbWVzc2FnZSB9XSxcblx0XHR0b29sUmVzdWx0RXJyb3I6IG1lc3NhZ2UsXG5cdFx0dG9vbFJlc3VsdE1lc3NhZ2U6IGxvY2FsaXplKCdhdXRvbWF0aW9uLnRvb2wuZXJyb3InLCBcIkF1dG9tYXRpb24gcmVxdWVzdCBmYWlsZWRcIiksXG5cdH07XG59XG5cbmZ1bmN0aW9uIGF1dG9tYXRpb25Ub29sQ2FuY2VsbGVkKCk6IElUb29sUmVzdWx0IHtcblx0Y29uc3QgcmVzdWx0ID0gYXV0b21hdGlvblRvb2xSZXN1bHQoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdHN0YXR1czogJ2NhbmNlbGxlZCcsXG5cdFx0bWVzc2FnZTogJ1RoZSBhdXRvbWF0aW9uIGNoYW5nZSB3YXMgY2FuY2VsbGVkLiBObyBjaGFuZ2VzIHdlcmUgbWFkZS4nLFxuXHR9KSk7XG5cdHJlc3VsdC50b29sUmVzdWx0TWVzc2FnZSA9IGxvY2FsaXplKCdhdXRvbWF0aW9uLnRvb2wuY2FuY2VsbGVkJywgXCJBdXRvbWF0aW9uIGNoYW5nZSBjYW5jZWxsZWRcIik7XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGF1dG9tYXRpb25EZWxldGVDYW5jZWxsZWQoKTogSVRvb2xSZXN1bHQge1xuXHRjb25zdCByZXN1bHQgPSBhdXRvbWF0aW9uVG9vbFJlc3VsdChKU09OLnN0cmluZ2lmeSh7XG5cdFx0c3RhdHVzOiAnY2FuY2VsbGVkJyxcblx0XHRtZXNzYWdlOiAnVGhlIGF1dG9tYXRpb24gd2FzIG5vdCBkZWxldGVkLicsXG5cdH0pKTtcblx0cmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlID0gbG9jYWxpemUoJ2F1dG9tYXRpb24udG9vbC5kZWxldGUuY2FuY2VsbGVkJywgXCJBdXRvbWF0aW9uIGRlbGV0aW9uIGNhbmNlbGxlZFwiKTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gYXV0b21hdGlvblJ1bkNhbmNlbGxlZCgpOiBJVG9vbFJlc3VsdCB7XG5cdGNvbnN0IHJlc3VsdCA9IGF1dG9tYXRpb25Ub29sUmVzdWx0KEpTT04uc3RyaW5naWZ5KHtcblx0XHRzdGF0dXM6ICdjYW5jZWxsZWQnLFxuXHRcdG1lc3NhZ2U6ICdUaGUgYXV0b21hdGlvbiB3YXMgbm90IHN0YXJ0ZWQuJyxcblx0fSkpO1xuXHRyZXN1bHQudG9vbFJlc3VsdE1lc3NhZ2UgPSBsb2NhbGl6ZSgnYXV0b21hdGlvbi50b29sLnJ1bi5jYW5jZWxsZWQnLCBcIkF1dG9tYXRpb24gcnVuIGNhbmNlbGxlZFwiKTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gYXV0b21hdGlvbkFscmVhZHlSdW5uaW5nKGF1dG9tYXRpb246IElBdXRvbWF0aW9uLCBydW46IElBdXRvbWF0aW9uUnVuKTogSVRvb2xSZXN1bHQge1xuXHRjb25zdCByZXN1bHQgPSBhdXRvbWF0aW9uVG9vbFJlc3VsdChKU09OLnN0cmluZ2lmeSh7XG5cdFx0c3RhdHVzOiAnYWxyZWFkeV9ydW5uaW5nJyxcblx0XHRhdXRvbWF0aW9uOiB7IGlkOiBhdXRvbWF0aW9uLmlkLCBuYW1lOiBhdXRvbWF0aW9uLm5hbWUgfSxcblx0XHRydW46IHtcblx0XHRcdGlkOiBydW4uaWQsXG5cdFx0XHRzdGF0dXM6IHJ1bi5zdGF0dXMsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHJ1bi5zZXNzaW9uUmVzb3VyY2UgPz8gbnVsbCxcblx0XHR9LFxuXHR9LCB1bmRlZmluZWQsIDIpKTtcblx0cmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlID0gbG9jYWxpemUoJ2F1dG9tYXRpb24udG9vbC5ydW4uYWxyZWFkeVJ1bm5pbmdSZXN1bHQnLCBcIkF1dG9tYXRpb24gezB9IGlzIGFscmVhZHkgcnVubmluZ1wiLCBhdXRvbWF0aW9uLm5hbWUpO1xuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKiogVHVybnMgYSBkaXNwYXRjaCB0aGF0IG5ldmVyIHByb2R1Y2VkIGEgc2Vzc2lvbiBpbnRvIGFuIGFjdGlvbmFibGUgYWdlbnQtZmFjaW5nIG1lc3NhZ2UuICovXG5mdW5jdGlvbiBhdXRvbWF0aW9uTm90U3RhcnRlZChhdXRvbWF0aW9uOiBJQXV0b21hdGlvbiwgZGlzcGF0Y2g6IElBdXRvbWF0aW9uUnVuRGlzcGF0Y2ggJiB7IGtpbmQ6ICdub3RTdGFydGVkJyB9KTogSVRvb2xSZXN1bHQge1xuXHRpZiAoZGlzcGF0Y2gucmVhc29uID09PSAnY2FuY2VsbGVkJykge1xuXHRcdHJldHVybiBhdXRvbWF0aW9uUnVuQ2FuY2VsbGVkKCk7XG5cdH1cblx0aWYgKGRpc3BhdGNoLnJlYXNvbiA9PT0gJ2RlbGV0ZWQnKSB7XG5cdFx0cmV0dXJuIGF1dG9tYXRpb25Ub29sRXJyb3IoYEF1dG9tYXRpb24gXCIke2F1dG9tYXRpb24uaWR9XCIgbm8gbG9uZ2VyIGV4aXN0cy5gKTtcblx0fVxuXHRpZiAoZGlzcGF0Y2gucmVhc29uID09PSAndGFyZ2V0VW5hdmFpbGFibGUnKSB7XG5cdFx0cmV0dXJuIGF1dG9tYXRpb25Ub29sRXJyb3IoYEF1dG9tYXRpb24gXCIke2F1dG9tYXRpb24uaWR9XCIgZGlkIG5vdCBzdGFydC4gSXRzIGNvbmZpZ3VyZWQgYWdlbnQgaXMgdW5hdmFpbGFibGUuYCk7XG5cdH1cblx0cmV0dXJuIGF1dG9tYXRpb25Ub29sRXJyb3IoZGlzcGF0Y2gucnVuPy5lcnJvck1lc3NhZ2Vcblx0XHQ/IGBBdXRvbWF0aW9uIFwiJHthdXRvbWF0aW9uLmlkfVwiIGZhaWxlZCB0byBzdGFydDogJHtkaXNwYXRjaC5ydW4uZXJyb3JNZXNzYWdlfWBcblx0XHQ6IGBBdXRvbWF0aW9uIFwiJHthdXRvbWF0aW9uLmlkfVwiIGZhaWxlZCB0byBzdGFydC5gKTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUF1dG9tYXRpb25JbnB1dChhdXRvbWF0aW9uU2VydmljZTogSUF1dG9tYXRpb25TZXJ2aWNlLCByYXdJbnB1dDogdW5rbm93biwgdG9vbE5hbWU6ICdydW5BdXRvbWF0aW9uJyB8ICdkZWxldGVBdXRvbWF0aW9uJyk6IElBdXRvbWF0aW9uIHtcblx0aWYgKCFpc1JlY29yZChyYXdJbnB1dCkpIHtcblx0XHR0aHJvdyBuZXcgQXV0b21hdGlvblRvb2xJbnB1dEVycm9yKGAke3Rvb2xOYW1lfSBpbnB1dCBtdXN0IGJlIGFuIG9iamVjdC5gKTtcblx0fVxuXHRhc3NlcnRLbm93blByb3BlcnRpZXMocmF3SW5wdXQsIFsnYXV0b21hdGlvbklkJ10sIGAke3Rvb2xOYW1lfSBpbnB1dGApO1xuXHRjb25zdCBhdXRvbWF0aW9uSWQgPSByZWFkT3B0aW9uYWxOb25FbXB0eVN0cmluZyhyYXdJbnB1dCwgJ2F1dG9tYXRpb25JZCcpO1xuXHRpZiAoIWF1dG9tYXRpb25JZCkge1xuXHRcdHRocm93IG5ldyBBdXRvbWF0aW9uVG9vbElucHV0RXJyb3IoJ1wiYXV0b21hdGlvbklkXCIgaXMgcmVxdWlyZWQuJyk7XG5cdH1cblx0Y29uc3QgYXV0b21hdGlvbiA9IGF1dG9tYXRpb25TZXJ2aWNlLmdldEF1dG9tYXRpb24oYXV0b21hdGlvbklkKTtcblx0aWYgKCFhdXRvbWF0aW9uKSB7XG5cdFx0dGhyb3cgbmV3IEF1dG9tYXRpb25Ub29sSW5wdXRFcnJvcihgQXV0b21hdGlvbiBcIiR7YXV0b21hdGlvbklkfVwiIGRvZXMgbm90IGV4aXN0LiBDYWxsIGxpc3RBdXRvbWF0aW9ucyB0byByZWZyZXNoIHRoZSBhdmFpbGFibGUgSURzLmApO1xuXHR9XG5cdHJldHVybiBhdXRvbWF0aW9uO1xufVxuXG5mdW5jdGlvbiBhc3NlcnRLbm93blByb3BlcnRpZXModmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBwcm9wZXJ0aWVzOiByZWFkb25seSBzdHJpbmdbXSwgZmllbGQ6IHN0cmluZyk6IHZvaWQge1xuXHRjb25zdCBrbm93biA9IG5ldyBTZXQocHJvcGVydGllcyk7XG5cdGNvbnN0IHVuZXhwZWN0ZWQgPSBPYmplY3Qua2V5cyh2YWx1ZSkuZmluZChrZXkgPT4gIWtub3duLmhhcyhrZXkpKTtcblx0aWYgKHVuZXhwZWN0ZWQpIHtcblx0XHR0aHJvdyBuZXcgQXV0b21hdGlvblRvb2xJbnB1dEVycm9yKGAke2ZpZWxkfSBoYXMgYW4gdW5zdXBwb3J0ZWQgXCIke3VuZXhwZWN0ZWR9XCIgcHJvcGVydHkuYCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gYXNzZXJ0UHJvcGVydGllc0Fic2VudCh2YWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHByb3BlcnRpZXM6IHJlYWRvbmx5IHN0cmluZ1tdLCBmaWVsZDogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IHByZXNlbnQgPSBwcm9wZXJ0aWVzLmZpbmQocHJvcGVydHkgPT4gdmFsdWVbcHJvcGVydHldICE9PSB1bmRlZmluZWQpO1xuXHRpZiAocHJlc2VudCkge1xuXHRcdHRocm93IG5ldyBBdXRvbWF0aW9uVG9vbElucHV0RXJyb3IoYCR7ZmllbGR9IGNhbm5vdCBpbmNsdWRlIFwiJHtwcmVzZW50fVwiLmApO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlYWRPcHRpb25hbE9iamVjdCh2YWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHByb3BlcnR5OiBzdHJpbmcpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IHZhbHVlW3Byb3BlcnR5XTtcblx0aWYgKGNhbmRpZGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoIWlzUmVjb3JkKGNhbmRpZGF0ZSkpIHtcblx0XHR0aHJvdyBuZXcgQXV0b21hdGlvblRvb2xJbnB1dEVycm9yKGBcIiR7cHJvcGVydHl9XCIgbXVzdCBiZSBhbiBvYmplY3QuYCk7XG5cdH1cblx0cmV0dXJuIGNhbmRpZGF0ZTtcbn1cblxuZnVuY3Rpb24gcmVhZE9wdGlvbmFsUmVxdWlyZWRUZXh0KHZhbHVlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgcHJvcGVydHk6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IHZhbHVlW3Byb3BlcnR5XTtcblx0aWYgKGNhbmRpZGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAodHlwZW9mIGNhbmRpZGF0ZSAhPT0gJ3N0cmluZycgfHwgY2FuZGlkYXRlLnRyaW0oKSA9PT0gJycpIHtcblx0XHR0aHJvdyBuZXcgQXV0b21hdGlvblRvb2xJbnB1dEVycm9yKGBcIiR7cHJvcGVydHl9XCIgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuYCk7XG5cdH1cblx0cmV0dXJuIGNhbmRpZGF0ZTtcbn1cblxuZnVuY3Rpb24gcmVhZE9wdGlvbmFsTm9uRW1wdHlTdHJpbmcodmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBwcm9wZXJ0eTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY2FuZGlkYXRlID0gcmVhZE9wdGlvbmFsUmVxdWlyZWRUZXh0KHZhbHVlLCBwcm9wZXJ0eSk7XG5cdHJldHVybiBjYW5kaWRhdGU/LnRyaW0oKTtcbn1cblxuZnVuY3Rpb24gcmVhZE9wdGlvbmFsTnVsbGFibGVOb25FbXB0eVN0cmluZyh2YWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHByb3BlcnR5OiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY2FuZGlkYXRlID0gdmFsdWVbcHJvcGVydHldO1xuXHRpZiAoY2FuZGlkYXRlID09PSB1bmRlZmluZWQgfHwgY2FuZGlkYXRlID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIGNhbmRpZGF0ZTtcblx0fVxuXHRpZiAodHlwZW9mIGNhbmRpZGF0ZSAhPT0gJ3N0cmluZycgfHwgY2FuZGlkYXRlLnRyaW0oKSA9PT0gJycpIHtcblx0XHR0aHJvdyBuZXcgQXV0b21hdGlvblRvb2xJbnB1dEVycm9yKGBcIiR7cHJvcGVydHl9XCIgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcgb3IgbnVsbC5gKTtcblx0fVxuXHRyZXR1cm4gY2FuZGlkYXRlLnRyaW0oKTtcbn1cblxuZnVuY3Rpb24gcmVhZE9wdGlvbmFsQm9vbGVhbih2YWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHByb3BlcnR5OiBzdHJpbmcpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY2FuZGlkYXRlID0gdmFsdWVbcHJvcGVydHldO1xuXHRpZiAoY2FuZGlkYXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmICh0eXBlb2YgY2FuZGlkYXRlICE9PSAnYm9vbGVhbicpIHtcblx0XHR0aHJvdyBuZXcgQXV0b21hdGlvblRvb2xJbnB1dEVycm9yKGBcIiR7cHJvcGVydHl9XCIgbXVzdCBiZSBhIGJvb2xlYW4uYCk7XG5cdH1cblx0cmV0dXJuIGNhbmRpZGF0ZTtcbn1cblxuZnVuY3Rpb24gcmVhZE9wdGlvbmFsSW50ZWdlcih2YWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHByb3BlcnR5OiBzdHJpbmcsIG1pbmltdW06IG51bWJlciwgbWF4aW11bTogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY2FuZGlkYXRlID0gdmFsdWVbcHJvcGVydHldO1xuXHRpZiAoY2FuZGlkYXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmICh0eXBlb2YgY2FuZGlkYXRlICE9PSAnbnVtYmVyJyB8fCAhTnVtYmVyLmlzSW50ZWdlcihjYW5kaWRhdGUpIHx8IGNhbmRpZGF0ZSA8IG1pbmltdW0gfHwgY2FuZGlkYXRlID4gbWF4aW11bSkge1xuXHRcdHRocm93IG5ldyBBdXRvbWF0aW9uVG9vbElucHV0RXJyb3IoYFwiJHtwcm9wZXJ0eX1cIiBtdXN0IGJlIGFuIGludGVnZXIgZnJvbSAke21pbmltdW19IHRocm91Z2ggJHttYXhpbXVtfS5gKTtcblx0fVxuXHRyZXR1cm4gY2FuZGlkYXRlO1xufVxuXG5mdW5jdGlvbiByZWFkUmVxdWlyZWRFbnVtPGNvbnN0IFQgZXh0ZW5kcyBzdHJpbmc+KHZhbHVlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgcHJvcGVydHk6IHN0cmluZywgYWxsb3dlZDogcmVhZG9ubHkgVFtdKTogVCB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IHJlYWRPcHRpb25hbEVudW0odmFsdWUsIHByb3BlcnR5LCBhbGxvd2VkKTtcblx0aWYgKGNhbmRpZGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0dGhyb3cgbmV3IEF1dG9tYXRpb25Ub29sSW5wdXRFcnJvcihgXCIke3Byb3BlcnR5fVwiIGlzIHJlcXVpcmVkLmApO1xuXHR9XG5cdHJldHVybiBjYW5kaWRhdGU7XG59XG5cbmZ1bmN0aW9uIHJlYWRPcHRpb25hbEVudW08Y29uc3QgVCBleHRlbmRzIHN0cmluZz4odmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBwcm9wZXJ0eTogc3RyaW5nLCBhbGxvd2VkOiByZWFkb25seSBUW10pOiBUIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY2FuZGlkYXRlID0gdmFsdWVbcHJvcGVydHldO1xuXHRpZiAoY2FuZGlkYXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmICghaXNBbGxvd2VkU3RyaW5nKGNhbmRpZGF0ZSwgYWxsb3dlZCkpIHtcblx0XHR0aHJvdyBuZXcgQXV0b21hdGlvblRvb2xJbnB1dEVycm9yKGBcIiR7cHJvcGVydHl9XCIgbXVzdCBiZSBvbmUgb2Y6ICR7YWxsb3dlZC5qb2luKCcsICcpfS5gKTtcblx0fVxuXHRyZXR1cm4gY2FuZGlkYXRlO1xufVxuXG5mdW5jdGlvbiByZWFkT3B0aW9uYWxOdWxsYWJsZUVudW08Y29uc3QgVCBleHRlbmRzIHN0cmluZz4odmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBwcm9wZXJ0eTogc3RyaW5nLCBhbGxvd2VkOiByZWFkb25seSBUW10pOiBUIHwgbnVsbCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IHZhbHVlW3Byb3BlcnR5XTtcblx0aWYgKGNhbmRpZGF0ZSA9PT0gdW5kZWZpbmVkIHx8IGNhbmRpZGF0ZSA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBjYW5kaWRhdGU7XG5cdH1cblx0aWYgKCFpc0FsbG93ZWRTdHJpbmcoY2FuZGlkYXRlLCBhbGxvd2VkKSkge1xuXHRcdHRocm93IG5ldyBBdXRvbWF0aW9uVG9vbElucHV0RXJyb3IoYFwiJHtwcm9wZXJ0eX1cIiBtdXN0IGJlIG51bGwgb3Igb25lIG9mOiAke2FsbG93ZWQuam9pbignLCAnKX0uYCk7XG5cdH1cblx0cmV0dXJuIGNhbmRpZGF0ZTtcbn1cblxuZnVuY3Rpb24gaXNSZWNvcmQodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG5cdHJldHVybiAhIXZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBpc0FsbG93ZWRTdHJpbmc8Y29uc3QgVCBleHRlbmRzIHN0cmluZz4odmFsdWU6IHVua25vd24sIGFsbG93ZWQ6IHJlYWRvbmx5IFRbXSk6IHZhbHVlIGlzIFQge1xuXHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiBhbGxvd2VkLnNvbWUoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZSA9PT0gdmFsdWUpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLHVCQUF1QjtBQUVoQyxTQUFpQyx5QkFBeUI7QUFDMUQsU0FBdUMsc0NBQXNDLG9CQUF3RSx3Q0FBd0M7QUFDN0wsU0FBUywrQkFBK0Isd0NBQXdDO0FBRWhGLFNBQVMsY0FBYywyQkFBMkI7QUFDbEQsU0FBOEIsNEJBQTRJLHNCQUFvQztBQUU5TSxTQUErQixrQ0FBa0M7QUFFMUQsTUFBTSx3QkFBd0I7QUFDOUIsTUFBTSw0QkFBNEI7QUFDbEMsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSx5QkFBeUI7QUFFdEMsTUFBTSxxQkFBcUIsZUFBZSxJQUFJLGdCQUFnQixTQUFTLDZCQUE2QjtBQUNwRyxNQUFNLGlDQUFpQztBQUN2QyxNQUFNLDBCQUEwQjtBQUNoQyxNQUFNLHNCQUFxRCxDQUFDLFVBQVUsVUFBVSxTQUFTLFFBQVE7QUFDakcsTUFBTSwyQkFBNEUsQ0FBQyxXQUFXLFVBQVUsVUFBVTtBQUNsSCxNQUFNLFlBQXFDLENBQUMsYUFBYSxPQUFPLGFBQWEsS0FBSyxhQUFhLElBQUk7QUFDbkcsTUFBTSx1QkFBdUQsQ0FBQyxvQkFBb0IsU0FBUyxvQkFBb0IsVUFBVSxvQkFBb0IsYUFBYSxvQkFBb0IsU0FBUztBQTRDdkwsTUFBTSxpQ0FBaUMsTUFBTTtBQUFFO0FBRS9DLE1BQU0sMkNBQTJDLE1BQU07QUFBQSxFQUN0RCxZQUFxQixRQUFxQjtBQUN6QyxVQUFNLDZCQUE2QjtBQURmO0FBQUEsRUFFckI7QUFDRDtBQUVPLElBQU0sc0JBQU4sTUFBK0M7QUFBQSxFQUVyRCxZQUNzQyxtQkFDRyxzQkFDdkM7QUFGb0M7QUFDRztBQUFBLEVBQ3JDO0FBQUEsRUFFSixjQUF5QjtBQUN4QixXQUFPO0FBQUEsTUFDTixJQUFJO0FBQUEsTUFDSixtQkFBbUI7QUFBQSxNQUNuQix5QkFBeUI7QUFBQSxNQUN6QixNQUFNLFFBQVE7QUFBQSxNQUNkLGFBQWEsU0FBUyxvQ0FBb0Msa0JBQWtCO0FBQUEsTUFDNUUsaUJBQWlCLFNBQVMsd0NBQXdDLGtDQUFrQztBQUFBLE1BQ3BHLGtCQUFrQjtBQUFBLE1BQ2xCLFFBQVEsZUFBZTtBQUFBLE1BQ3ZCLE1BQU07QUFBQSxNQUNOLGlCQUFpQjtBQUFBLE1BQ2pCLGFBQWE7QUFBQSxRQUNaLE1BQU07QUFBQSxRQUNOLFlBQVksQ0FBQztBQUFBLFFBQ2Isc0JBQXNCO0FBQUEsTUFDdkI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxzQkFBc0IsVUFBNkMsUUFBNkQ7QUFDckksV0FBTztBQUFBLE1BQ04sbUJBQW1CLFNBQVMsMENBQTBDLHFCQUFxQjtBQUFBLE1BQzNGLGtCQUFrQixTQUFTLHlDQUF5QyxrQkFBa0I7QUFBQSxJQUN2RjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sT0FBTyxhQUE4QixjQUFtQyxXQUF5QixRQUFpRDtBQUN2SixRQUFJLENBQUMscUJBQXFCLEtBQUssb0JBQW9CLEdBQUc7QUFDckQsYUFBTyxvQkFBb0IsMkJBQTJCO0FBQUEsSUFDdkQ7QUFFQSxVQUFNLGNBQWMsS0FBSyxrQkFBa0IsWUFBWSxJQUFJLEVBQUUsSUFBSSxzQkFBc0I7QUFDdkYsVUFBTSxTQUFTLHFCQUFxQixLQUFLLFVBQVUsRUFBRSxZQUFZLEdBQUcsUUFBVyxDQUFDLENBQUM7QUFDakYsV0FBTyxvQkFBb0IsWUFBWSxXQUFXLElBQy9DLFNBQVMsd0NBQXdDLHFCQUFxQixJQUN0RSxTQUFTLHNDQUFzQywwQkFBMEIsWUFBWSxNQUFNO0FBQzlGLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUE5Q2Esc0JBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEdBSlU7QUFnRE4sSUFBTSxvQkFBTixNQUE2QztBQUFBLEVBRW5ELFlBQ3NDLG1CQUNELGtCQUNJLHNCQUN2QztBQUhvQztBQUNEO0FBQ0k7QUFBQSxFQUNyQztBQUFBLEVBRUosY0FBeUI7QUFDeEIsV0FBTztBQUFBLE1BQ04sSUFBSTtBQUFBLE1BQ0osbUJBQW1CO0FBQUEsTUFDbkIseUJBQXlCO0FBQUEsTUFDekIsTUFBTSxRQUFRO0FBQUEsTUFDZCxhQUFhLFNBQVMsbUNBQW1DLGdCQUFnQjtBQUFBLE1BQ3pFLGlCQUFpQixTQUFTLHVDQUF1Qyx1Q0FBdUM7QUFBQSxNQUN4RyxrQkFBa0I7QUFBQSxNQUNsQixRQUFRLGVBQWU7QUFBQSxNQUN2QixNQUFNO0FBQUEsTUFDTixpQkFBaUI7QUFBQSxNQUNqQixhQUFhO0FBQUEsUUFDWixNQUFNO0FBQUEsUUFDTixzQkFBc0I7QUFBQSxRQUN0QixZQUFZO0FBQUEsVUFDWCxjQUFjO0FBQUEsWUFDYixNQUFNO0FBQUEsWUFDTixhQUFhO0FBQUEsVUFDZDtBQUFBLFFBQ0Q7QUFBQSxRQUNBLFVBQVUsQ0FBQyxjQUFjO0FBQUEsTUFDMUI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxzQkFBc0IsU0FBNEMsUUFBNkQ7QUFDcEksUUFBSSxDQUFDLHFCQUFxQixLQUFLLG9CQUFvQixHQUFHO0FBQ3JELFlBQU0sSUFBSSx5QkFBeUIsMkJBQTJCO0FBQUEsSUFDL0Q7QUFDQSxVQUFNLGFBQWEsdUJBQXVCLEtBQUssbUJBQW1CLFFBQVEsWUFBWSxlQUFlO0FBQ3JHLFVBQU0sWUFBWSxLQUFLLGtCQUFrQixnQkFBZ0IsV0FBVyxFQUFFO0FBQ3RFLFFBQUksV0FBVztBQUNkLGFBQU87QUFBQSxRQUNOLG1CQUFtQixTQUFTLHNDQUFzQyxxQ0FBcUMsV0FBVyxJQUFJO0FBQUEsUUFDdEgsa0JBQWtCLFNBQVMseUNBQXlDLHNDQUFzQyxXQUFXLElBQUk7QUFBQSxNQUMxSDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsTUFDTixtQkFBbUIsU0FBUyx5Q0FBeUMsMEJBQTBCLFdBQVcsSUFBSTtBQUFBLE1BQzlHLGtCQUFrQixTQUFTLHdDQUF3QywwQkFBMEIsV0FBVyxJQUFJO0FBQUEsTUFDNUcsc0JBQXNCO0FBQUEsUUFDckIsT0FBTyxTQUFTLHlDQUF5QyxpQkFBaUI7QUFBQSxRQUMxRSxTQUFTLElBQUksZUFBZTtBQUFBLFVBQzNCO0FBQUEsVUFDQTtBQUFBLFVBQ0EsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFFBQ1osQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxPQUFPLFlBQTZCLGNBQW1DLFdBQXlCLE9BQWdEO0FBQ3JKLFFBQUksQ0FBQyxxQkFBcUIsS0FBSyxvQkFBb0IsR0FBRztBQUNyRCxhQUFPLG9CQUFvQiwyQkFBMkI7QUFBQSxJQUN2RDtBQUNBLFFBQUksTUFBTSx5QkFBeUI7QUFDbEMsYUFBTyx1QkFBdUI7QUFBQSxJQUMvQjtBQUVBLFFBQUk7QUFDSixRQUFJO0FBQ0gsbUJBQWEsdUJBQXVCLEtBQUssbUJBQW1CLFdBQVcsWUFBWSxlQUFlO0FBQUEsSUFDbkcsU0FBUyxPQUFPO0FBQ2YsVUFBSSxpQkFBaUIsMEJBQTBCO0FBQzlDLGVBQU8sb0JBQW9CLE1BQU0sT0FBTztBQUFBLE1BQ3pDO0FBQ0EsWUFBTTtBQUFBLElBQ1A7QUFFQSxVQUFNLHVCQUF1QixJQUFJLHdCQUF3QixLQUFLO0FBQzlELFVBQU0sWUFBWSxLQUFLLGlCQUFpQixRQUFRLFlBQVksVUFBVSx5QkFBeUIscUJBQXFCLEtBQUs7QUFDekgsUUFBSTtBQUNKLFFBQUk7QUFDSCxpQkFBVyxNQUFNLFVBQVU7QUFBQSxJQUM1QixVQUFFO0FBQ0QsMkJBQXFCLFFBQVE7QUFBQSxJQUM5QjtBQUVBLFFBQUksU0FBUyxTQUFTLGtCQUFrQjtBQUN2QyxhQUFPLHlCQUF5QixZQUFZLFNBQVMsU0FBUztBQUFBLElBQy9EO0FBQ0EsUUFBSSxTQUFTLFNBQVMsY0FBYztBQUNuQyxhQUFPLHFCQUFxQixZQUFZLFFBQVE7QUFBQSxJQUNqRDtBQUVBLFVBQU0sU0FBUyxxQkFBcUIsS0FBSyxVQUFVO0FBQUEsTUFDbEQsUUFBUTtBQUFBLE1BQ1IsWUFBWSxFQUFFLElBQUksV0FBVyxJQUFJLE1BQU0sV0FBVyxLQUFLO0FBQUEsTUFDdkQsS0FBSztBQUFBLFFBQ0osSUFBSSxTQUFTLElBQUk7QUFBQSxRQUNqQixRQUFRLFNBQVMsSUFBSTtBQUFBLFFBQ3JCLGlCQUFpQixTQUFTO0FBQUEsTUFDM0I7QUFBQSxJQUNELEdBQUcsUUFBVyxDQUFDLENBQUM7QUFDaEIsV0FBTyxvQkFBb0IsU0FBUywrQkFBK0IsMEJBQTBCLFdBQVcsSUFBSTtBQUM1RyxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBM0dhLG9CQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FMVTtBQTZHTixJQUFNLHVCQUFOLE1BQWdEO0FBQUEsRUFFdEQsWUFDc0MsbUJBQ0csc0JBQ3ZDO0FBRm9DO0FBQ0c7QUFBQSxFQUNyQztBQUFBLEVBRUosY0FBeUI7QUFDeEIsV0FBTztBQUFBLE1BQ04sSUFBSTtBQUFBLE1BQ0osbUJBQW1CO0FBQUEsTUFDbkIseUJBQXlCO0FBQUEsTUFDekIsTUFBTSxRQUFRO0FBQUEsTUFDZCxhQUFhLFNBQVMsc0NBQXNDLG1CQUFtQjtBQUFBLE1BQy9FLGlCQUFpQixTQUFTLDBDQUEwQyxxQ0FBcUM7QUFBQSxNQUN6RyxrQkFBa0I7QUFBQSxNQUNsQixRQUFRLGVBQWU7QUFBQSxNQUN2QixNQUFNO0FBQUEsTUFDTixpQkFBaUI7QUFBQSxNQUNqQixhQUFhO0FBQUEsUUFDWixNQUFNO0FBQUEsUUFDTixzQkFBc0I7QUFBQSxRQUN0QixZQUFZO0FBQUEsVUFDWCxjQUFjO0FBQUEsWUFDYixNQUFNO0FBQUEsWUFDTixhQUFhO0FBQUEsVUFDZDtBQUFBLFFBQ0Q7QUFBQSxRQUNBLFVBQVUsQ0FBQyxjQUFjO0FBQUEsTUFDMUI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxzQkFBc0IsU0FBNEMsUUFBNkQ7QUFDcEksUUFBSSxDQUFDLHFCQUFxQixLQUFLLG9CQUFvQixHQUFHO0FBQ3JELFlBQU0sSUFBSSx5QkFBeUIsMkJBQTJCO0FBQUEsSUFDL0Q7QUFDQSxVQUFNLGFBQWEsdUJBQXVCLEtBQUssbUJBQW1CLFFBQVEsWUFBWSxrQkFBa0I7QUFDeEcsV0FBTztBQUFBLE1BQ04sbUJBQW1CLFNBQVMsNENBQTRDLDJCQUEyQixXQUFXLElBQUk7QUFBQSxNQUNsSCxrQkFBa0IsU0FBUywyQ0FBMkMsMEJBQTBCLFdBQVcsSUFBSTtBQUFBLE1BQy9HLHNCQUFzQjtBQUFBLFFBQ3JCLE9BQU8sU0FBUyw0Q0FBNEMsb0JBQW9CO0FBQUEsUUFDaEYsU0FBUyxJQUFJLGVBQWU7QUFBQSxVQUMzQjtBQUFBLFVBQ0E7QUFBQSxVQUNBLFdBQVc7QUFBQSxVQUNYLFdBQVc7QUFBQSxRQUNaLENBQUM7QUFBQSxRQUNELGVBQWU7QUFBQSxVQUNkLEVBQUUsSUFBSSxnQ0FBZ0MsT0FBTyxTQUFTLGtDQUFrQyxRQUFRLEdBQUcsTUFBTSx1QkFBdUIsUUFBUTtBQUFBLFVBQ3hJLEVBQUUsSUFBSSxVQUFVLE9BQU8sU0FBUyxpQ0FBaUMsUUFBUSxHQUFHLE1BQU0sdUJBQXVCLEtBQUs7QUFBQSxRQUMvRztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxPQUFPLFlBQTZCLGNBQW1DLFdBQXlCLE9BQWdEO0FBQ3JKLFFBQUksQ0FBQyxxQkFBcUIsS0FBSyxvQkFBb0IsR0FBRztBQUNyRCxhQUFPLG9CQUFvQiwyQkFBMkI7QUFBQSxJQUN2RDtBQUNBLFFBQUksTUFBTSx5QkFBeUI7QUFDbEMsYUFBTywwQkFBMEI7QUFBQSxJQUNsQztBQUVBLFFBQUk7QUFDSixRQUFJO0FBQ0gsbUJBQWEsdUJBQXVCLEtBQUssbUJBQW1CLFdBQVcsWUFBWSxrQkFBa0I7QUFBQSxJQUN0RyxTQUFTLE9BQU87QUFDZixVQUFJLGlCQUFpQiwwQkFBMEI7QUFDOUMsZUFBTyxvQkFBb0IsTUFBTSxPQUFPO0FBQUEsTUFDekM7QUFDQSxZQUFNO0FBQUEsSUFDUDtBQUVBLFFBQUksV0FBVyx5QkFBeUIsVUFBYSxXQUFXLHlCQUF5QixnQ0FBZ0M7QUFDeEgsYUFBTywwQkFBMEI7QUFBQSxJQUNsQztBQUVBLFFBQUk7QUFDSCxZQUFNLEtBQUssa0JBQWtCLGlCQUFpQixXQUFXLElBQUksS0FBSyxvQkFBb0IsS0FBSyxDQUFDO0FBQUEsSUFDN0YsU0FBUyxPQUFPO0FBQ2YsVUFBSSxpQkFBaUIsb0NBQW9DO0FBQ3hELGVBQU8sTUFBTTtBQUFBLE1BQ2Q7QUFDQSxZQUFNO0FBQUEsSUFDUDtBQUNBLFVBQU0sU0FBUyxxQkFBcUIsS0FBSyxVQUFVO0FBQUEsTUFDbEQsUUFBUTtBQUFBLE1BQ1IsWUFBWSxFQUFFLElBQUksV0FBVyxJQUFJLE1BQU0sV0FBVyxLQUFLO0FBQUEsSUFDeEQsQ0FBQyxDQUFDO0FBQ0YsV0FBTyxvQkFBb0IsU0FBUyxrQ0FBa0MsMEJBQTBCLFdBQVcsSUFBSTtBQUMvRyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsb0JBQW9CLE9BQW1EO0FBQzlFLFdBQU8sTUFBTTtBQUNaLFVBQUksQ0FBQyxxQkFBcUIsS0FBSyxvQkFBb0IsR0FBRztBQUNyRCxjQUFNLElBQUksbUNBQW1DLG9CQUFvQiwyQkFBMkIsQ0FBQztBQUFBLE1BQzlGO0FBQ0EsVUFBSSxNQUFNLHlCQUF5QjtBQUNsQyxjQUFNLElBQUksbUNBQW1DLDBCQUEwQixDQUFDO0FBQUEsTUFDekU7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVEO0FBMUdhLHVCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxHQUpVO0FBNEdOLElBQU0sMEJBQU4sTUFBbUQ7QUFBQSxFQUV6RCxZQUNzQyxtQkFDUSwyQkFDTCxzQkFDdkM7QUFIb0M7QUFDUTtBQUNMO0FBQUEsRUFDckM7QUFBQSxFQUVKLGNBQXlCO0FBQ3hCLFdBQU87QUFBQSxNQUNOLElBQUk7QUFBQSxNQUNKLG1CQUFtQjtBQUFBLE1BQ25CLHlCQUF5QjtBQUFBLE1BQ3pCLE1BQU0sUUFBUTtBQUFBLE1BQ2QsYUFBYSxTQUFTLHlDQUF5QyxzQkFBc0I7QUFBQSxNQUNyRixpQkFBaUIsU0FBUyw2Q0FBNkMsZ0NBQWdDO0FBQUEsTUFDdkcsa0JBQWtCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQUtsQixRQUFRLGVBQWU7QUFBQSxNQUN2QixNQUFNO0FBQUEsTUFDTixpQkFBaUI7QUFBQSxNQUNqQixhQUFhO0FBQUEsUUFDWixNQUFNO0FBQUEsUUFDTixzQkFBc0I7QUFBQSxRQUN0QixZQUFZO0FBQUEsVUFDWCxjQUFjO0FBQUEsWUFDYixNQUFNO0FBQUEsWUFDTixhQUFhO0FBQUEsVUFDZDtBQUFBLFVBQ0EsTUFBTTtBQUFBLFlBQ0wsTUFBTTtBQUFBLFlBQ04sYUFBYTtBQUFBLFVBQ2Q7QUFBQSxVQUNBLFFBQVE7QUFBQSxZQUNQLE1BQU07QUFBQSxZQUNOLGFBQWE7QUFBQSxVQUNkO0FBQUEsVUFDQSxVQUFVO0FBQUEsWUFDVCxNQUFNO0FBQUEsWUFDTixzQkFBc0I7QUFBQSxZQUN0QixhQUFhO0FBQUEsWUFDYixZQUFZO0FBQUEsY0FDWCxVQUFVO0FBQUEsZ0JBQ1QsTUFBTTtBQUFBLGdCQUNOLE1BQU0sQ0FBQyxHQUFHLG1CQUFtQjtBQUFBLGdCQUM3QixhQUFhO0FBQUEsY0FDZDtBQUFBLGNBQ0EsY0FBYztBQUFBLGdCQUNiLE1BQU07QUFBQSxnQkFDTixTQUFTO0FBQUEsZ0JBQ1QsU0FBUztBQUFBLGdCQUNULGFBQWE7QUFBQSxjQUNkO0FBQUEsY0FDQSxnQkFBZ0I7QUFBQSxnQkFDZixNQUFNO0FBQUEsZ0JBQ04sU0FBUztBQUFBLGdCQUNULFNBQVM7QUFBQSxnQkFDVCxhQUFhO0FBQUEsY0FDZDtBQUFBLGNBQ0EsYUFBYTtBQUFBLGdCQUNaLE1BQU07QUFBQSxnQkFDTixTQUFTO0FBQUEsZ0JBQ1QsU0FBUztBQUFBLGdCQUNULGFBQWE7QUFBQSxjQUNkO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxVQUNBLFFBQVE7QUFBQSxZQUNQLE1BQU07QUFBQSxZQUNOLHNCQUFzQjtBQUFBLFlBQ3RCLGFBQWE7QUFBQSxZQUNiLFlBQVk7QUFBQSxjQUNYLE1BQU07QUFBQSxnQkFDTCxNQUFNO0FBQUEsZ0JBQ04sTUFBTSxDQUFDLGtCQUFrQixhQUFhLFdBQVc7QUFBQSxjQUNsRDtBQUFBLGNBQ0EsV0FBVztBQUFBLGdCQUNWLE1BQU07QUFBQSxnQkFDTixhQUFhO0FBQUEsY0FDZDtBQUFBLGNBQ0EsWUFBWTtBQUFBLGdCQUNYLE1BQU07QUFBQSxnQkFDTixhQUFhO0FBQUEsY0FDZDtBQUFBLGNBQ0EsZUFBZTtBQUFBLGdCQUNkLE1BQU07QUFBQSxnQkFDTixhQUFhO0FBQUEsY0FDZDtBQUFBLGNBQ0EsV0FBVztBQUFBLGdCQUNWLE1BQU07QUFBQSxnQkFDTixNQUFNLENBQUMsR0FBRyx3QkFBd0I7QUFBQSxnQkFDbEMsYUFBYTtBQUFBLGNBQ2Q7QUFBQSxjQUNBLFFBQVE7QUFBQSxnQkFDUCxNQUFNO0FBQUEsZ0JBQ04sYUFBYTtBQUFBLGNBQ2Q7QUFBQSxZQUNEO0FBQUEsWUFDQSxVQUFVLENBQUMsTUFBTTtBQUFBLFVBQ2xCO0FBQUEsVUFDQSxTQUFTO0FBQUEsWUFDUixNQUFNLENBQUMsVUFBVSxNQUFNO0FBQUEsWUFDdkIsYUFBYTtBQUFBLFVBQ2Q7QUFBQSxVQUNBLE1BQU07QUFBQSxZQUNMLE1BQU0sQ0FBQyxHQUFHLFdBQVcsSUFBSTtBQUFBLFlBQ3pCLGFBQWE7QUFBQSxVQUNkO0FBQUEsVUFDQSxpQkFBaUI7QUFBQSxZQUNoQixNQUFNLENBQUMsR0FBRyxzQkFBc0IsSUFBSTtBQUFBLFlBQ3BDLGFBQWE7QUFBQSxVQUNkO0FBQUEsVUFDQSxTQUFTO0FBQUEsWUFDUixNQUFNO0FBQUEsWUFDTixhQUFhO0FBQUEsVUFDZDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sc0JBQXNCLFNBQTRDLFFBQTZEO0FBQ3BJLFFBQUksQ0FBQyxxQkFBcUIsS0FBSyxvQkFBb0IsR0FBRztBQUNyRCxZQUFNLElBQUkseUJBQXlCLDJCQUEyQjtBQUFBLElBQy9EO0FBQ0EsVUFBTSxXQUFXLEtBQUssY0FBYyxRQUFRLFlBQVksUUFBUSxtQkFBbUI7QUFDbkYsVUFBTSxXQUFXLFNBQVMsU0FBUztBQUNuQyxXQUFPO0FBQUEsTUFDTixtQkFBbUIsV0FDaEIsU0FBUyxzREFBc0Qsd0JBQXdCLElBQ3ZGLFNBQVMsc0RBQXNELDhCQUE4QjtBQUFBLE1BQ2hHLGtCQUFrQixXQUNmLFNBQVMscURBQXFELHVCQUF1QixJQUNyRixTQUFTLHFEQUFxRCw2QkFBNkI7QUFBQSxNQUM5RixzQkFBc0I7QUFBQSxRQUNyQixPQUFPLFdBQ0osU0FBUyxzREFBc0Qsb0JBQW9CLElBQ25GLFNBQVMsc0RBQXNELG9CQUFvQjtBQUFBLFFBQ3RGLFNBQVMsV0FDTixJQUFJLGVBQWU7QUFBQSxVQUNwQjtBQUFBLFVBQ0E7QUFBQSxVQUNBLFNBQVMsU0FBUztBQUFBLFVBQ2xCLFNBQVMsU0FBUztBQUFBLFFBQ25CLENBQUMsSUFDQyxJQUFJLGVBQWU7QUFBQSxVQUNwQjtBQUFBLFVBQ0E7QUFBQSxVQUNBLFNBQVMsY0FBYztBQUFBLFFBQ3hCLENBQUM7QUFBQSxNQUNIO0FBQUEsTUFDQSxrQkFBa0IsU0FBUyxTQUFTLFdBQ2pDO0FBQUEsUUFDRCxNQUFNO0FBQUEsUUFDTixzQkFBc0IsU0FBUyxTQUFTO0FBQUEsUUFDeEMsdUJBQXVCLGlDQUFpQyxTQUFTLFFBQVE7QUFBQSxNQUMxRSxJQUNFO0FBQUEsSUFDSjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sT0FBTyxZQUE2QixjQUFtQyxXQUF5QixPQUFnRDtBQUNySixRQUFJLENBQUMscUJBQXFCLEtBQUssb0JBQW9CLEdBQUc7QUFDckQsYUFBTyxvQkFBb0IsMkJBQTJCO0FBQUEsSUFDdkQ7QUFDQSxRQUFJLE1BQU0seUJBQXlCO0FBQ2xDLGFBQU8sd0JBQXdCO0FBQUEsSUFDaEM7QUFFQSxRQUFJO0FBQ0osUUFBSTtBQUNILGlCQUFXLEtBQUssY0FBYyxXQUFXLFlBQVksV0FBVyxTQUFTLGVBQWU7QUFBQSxJQUN6RixTQUFTLE9BQU87QUFDZixVQUFJLGlCQUFpQiwwQkFBMEI7QUFDOUMsZUFBTyxvQkFBb0IsTUFBTSxPQUFPO0FBQUEsTUFDekM7QUFDQSxZQUFNO0FBQUEsSUFDUDtBQUVBLFFBQUk7QUFDSCxVQUFJLFNBQVMsU0FBUyxVQUFVO0FBQy9CLGNBQU1BLFVBQVMsU0FBUyw2QkFDckIsS0FBSyx1QkFBdUIsU0FBUyxjQUFjLE1BQU0sSUFDekQsU0FBUyxjQUFjO0FBQzFCLGVBQU8sTUFBTSxLQUFLLFlBQVksRUFBRSxHQUFHLFNBQVMsZUFBZSxRQUFBQSxRQUFPLEdBQUcsS0FBSztBQUFBLE1BQzNFO0FBRUEsWUFBTSxTQUFTLFNBQVMsY0FBYyxTQUNuQyxTQUFTLDZCQUNSLEtBQUssdUJBQXVCLFNBQVMsY0FBYyxNQUFNLElBQ3pELFNBQVMsY0FBYyxTQUN4QjtBQUNILFlBQU0sUUFBUSxTQUFTLEVBQUUsR0FBRyxTQUFTLGVBQWUsT0FBTyxJQUFJLFNBQVM7QUFDeEUsWUFBTSxXQUFXLFdBQVcsa0JBQWtCLFNBQVMsNEJBQ3BELFdBQVcsbUJBQ1g7QUFDSCxVQUFJLGFBQWEsU0FBUyx5QkFBeUIsU0FBUyxTQUFTLE1BQU0sU0FBUywwQkFBMEIsaUNBQWlDLFNBQVMsUUFBUSxJQUFJO0FBQ25LLGVBQU8sb0JBQW9CLGVBQWUsU0FBUyxTQUFTLEVBQUUsaUlBQWlJO0FBQUEsTUFDaE07QUFDQSxhQUFPLE1BQU0sS0FBSyxZQUFZLFNBQVMsVUFBVSxPQUFPLEtBQUs7QUFBQSxJQUM5RCxTQUFTLE9BQU87QUFDZixVQUFJLGlCQUFpQixvQ0FBb0M7QUFDeEQsZUFBTyxNQUFNO0FBQUEsTUFDZDtBQUNBLFVBQUksaUJBQWlCLDBCQUEwQjtBQUM5QyxlQUFPLG9CQUFvQixNQUFNLE9BQU87QUFBQSxNQUN6QztBQUNBLFlBQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxZQUFZLFNBQW1DLE9BQWdEO0FBQzVHLFVBQU0sVUFBVSxLQUFLLHlCQUF5QixLQUFLO0FBQ25ELFFBQUksU0FBUztBQUNaLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxVQUFVLE1BQU0sS0FBSyxrQkFBa0IsaUJBQWlCLFNBQVMsS0FBSyxvQkFBb0IsS0FBSyxDQUFDO0FBQ3RHLFVBQU0sU0FBUyxxQkFBcUIsS0FBSyxVQUFVLEVBQUUsUUFBUSxXQUFXLFlBQVksdUJBQXVCLE9BQU8sRUFBRSxHQUFHLFFBQVcsQ0FBQyxDQUFDO0FBQ3BJLFdBQU8sbUJBQW1CLDJCQUEyQixTQUFTLFNBQVM7QUFDdkUsV0FBTyxvQkFBb0IsU0FBUyxxQ0FBcUMsMEJBQTBCLFFBQVEsSUFBSTtBQUMvRyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxZQUFZLFVBQXVCLE9BQWlDLE9BQWdEO0FBQ2pJLFVBQU0sVUFBVSxLQUFLLHlCQUF5QixLQUFLO0FBQ25ELFFBQUksU0FBUztBQUNaLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxlQUFlLE1BQU0sS0FBSyxrQkFBa0IsNEJBQTRCLFNBQVMsSUFBSSxPQUFPLFVBQVUsS0FBSyxvQkFBb0IsS0FBSyxDQUFDO0FBQzNJLFFBQUksYUFBYSxTQUFTLGNBQWMsQ0FBQyxhQUFhLFNBQVM7QUFDOUQsYUFBTyxvQkFBb0IsZUFBZSxTQUFTLEVBQUUsb0VBQW9FO0FBQUEsSUFDMUg7QUFDQSxRQUFJLGFBQWEsU0FBUyxZQUFZO0FBQ3JDLGFBQU8sb0JBQW9CLGVBQWUsU0FBUyxFQUFFLGlJQUFpSTtBQUFBLElBQ3ZMO0FBQ0EsVUFBTSxVQUFVLGFBQWE7QUFDN0IsVUFBTSxTQUFTLHFCQUFxQixLQUFLLFVBQVUsRUFBRSxRQUFRLFdBQVcsWUFBWSx1QkFBdUIsT0FBTyxFQUFFLEdBQUcsUUFBVyxDQUFDLENBQUM7QUFDcEksV0FBTyxtQkFBbUIsMkJBQTJCLFNBQVMsU0FBUztBQUN2RSxXQUFPLG9CQUFvQixTQUFTLHFDQUFxQywwQkFBMEIsUUFBUSxJQUFJO0FBQy9HLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxvQkFBb0IsT0FBbUQ7QUFDOUUsV0FBTyxNQUFNO0FBQ1osWUFBTSxVQUFVLEtBQUsseUJBQXlCLEtBQUs7QUFDbkQsVUFBSSxTQUFTO0FBQ1osY0FBTSxJQUFJLG1DQUFtQyxPQUFPO0FBQUEsTUFDckQ7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEseUJBQXlCLE9BQW1EO0FBQ25GLFFBQUksQ0FBQyxxQkFBcUIsS0FBSyxvQkFBb0IsR0FBRztBQUNyRCxhQUFPLG9CQUFvQiwyQkFBMkI7QUFBQSxJQUN2RDtBQUNBLFFBQUksTUFBTSx5QkFBeUI7QUFDbEMsYUFBTyx3QkFBd0I7QUFBQSxJQUNoQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSx1QkFBdUIsUUFBNEM7QUFDMUUsVUFBTSxhQUFhLE9BQU8sU0FBUyxjQUNoQyxLQUFLLDBCQUEwQix5QkFBeUIsSUFDeEQsS0FBSywwQkFBMEIseUJBQXlCLE9BQU8sU0FBUztBQUMzRSxVQUFNLFlBQVksZ0JBQWdCLFlBQVksT0FBTyxZQUFZLE9BQU8sYUFBYTtBQUNyRixRQUFJLENBQUMsV0FBVztBQUNmLFlBQU0sSUFBSSx5QkFBeUIsT0FBTyxTQUFTLGNBQ2hELDBCQUEwQixPQUFPLFVBQVUsSUFBSSxPQUFPLGFBQWEsd0JBQ25FLDRGQUE0RjtBQUFBLElBQ2hHO0FBQ0EsUUFBSSxPQUFPLFNBQVMsZUFBZSxPQUFPLFVBQVUsU0FBUyxjQUFjLENBQUMsVUFBVSxZQUFZLCtCQUErQjtBQUNoSSxZQUFNLElBQUkseUJBQXlCLGlCQUFpQixVQUFVLFlBQVksRUFBRSx3Q0FBd0M7QUFBQSxJQUNySDtBQUNBLFdBQU87QUFBQSxNQUNOLEdBQUc7QUFBQSxNQUNILFlBQVksVUFBVTtBQUFBLE1BQ3RCLGVBQWUsVUFBVSxZQUFZO0FBQUEsSUFDdEM7QUFBQSxFQUNEO0FBQUEsRUFFUSxjQUFjLFlBQXFCLGlCQUF1RDtBQUNqRyxVQUFNLFdBQVc7QUFDakIsUUFBSSxDQUFDLFNBQVMsUUFBUSxHQUFHO0FBQ3hCLFlBQU0sSUFBSSx5QkFBeUIsOENBQThDO0FBQUEsSUFDbEY7QUFDQSxVQUFNLFFBQVE7QUFDZCwwQkFBc0IsT0FBTyxDQUFDLGdCQUFnQixRQUFRLFVBQVUsWUFBWSxVQUFVLFdBQVcsUUFBUSxtQkFBbUIsU0FBUyxHQUFHLDJCQUEyQjtBQUVuSyxVQUFNLGVBQWUsMkJBQTJCLE9BQU8sY0FBYztBQUNyRSxVQUFNLFdBQVcsZUFBZSxLQUFLLGtCQUFrQixjQUFjLFlBQVksSUFBSTtBQUNyRixRQUFJLGdCQUFnQixDQUFDLFVBQVU7QUFDOUIsWUFBTSxJQUFJLHlCQUF5QixlQUFlLFlBQVksc0VBQXNFO0FBQUEsSUFDckk7QUFFQSxVQUFNLE9BQU8seUJBQXlCLE9BQU8sTUFBTTtBQUNuRCxVQUFNLFNBQVMseUJBQXlCLE9BQU8sUUFBUTtBQUN2RCxRQUFJLENBQUMsWUFBWSxTQUFTLFFBQVc7QUFDcEMsWUFBTSxJQUFJLHlCQUF5QixpREFBaUQ7QUFBQSxJQUNyRjtBQUNBLFFBQUksQ0FBQyxZQUFZLFdBQVcsUUFBVztBQUN0QyxZQUFNLElBQUkseUJBQXlCLG1EQUFtRDtBQUFBLElBQ3ZGO0FBRUEsVUFBTSxXQUFXLGNBQWMsT0FBTyxVQUFVLFVBQVUsQ0FBQyxRQUFRO0FBQ25FLFVBQU0sZ0JBQWdCLEtBQUssd0JBQXdCLGVBQWU7QUFDbEUsVUFBTSxTQUFTLFlBQVksT0FBTyxVQUFVLGFBQWE7QUFDekQsVUFBTSxVQUFVLG1DQUFtQyxPQUFPLFNBQVM7QUFDbkUsVUFBTSxPQUFPLHlCQUF5QixPQUFPLFFBQVEsU0FBUztBQUM5RCxVQUFNLGtCQUFrQix5QkFBeUIsT0FBTyxtQkFBbUIsb0JBQW9CO0FBQy9GLFVBQU0sVUFBVSxvQkFBb0IsT0FBTyxTQUFTO0FBRXBELFVBQU0saUJBQTJDO0FBQUEsTUFDaEQsR0FBSSxTQUFTLFNBQVksRUFBRSxLQUFLLElBQUksQ0FBQztBQUFBLE1BQ3JDLEdBQUksV0FBVyxTQUFZLEVBQUUsT0FBTyxJQUFJLENBQUM7QUFBQSxNQUN6QyxHQUFJLFdBQVcsRUFBRSxTQUFTLElBQUksQ0FBQztBQUFBLE1BQy9CLEdBQUksU0FBUyxFQUFFLE9BQU8sSUFBSSxDQUFDO0FBQUEsTUFDM0IsR0FBSSxZQUFZLFNBQVksRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQzNDLEdBQUksU0FBUyxTQUFZLEVBQUUsS0FBSyxJQUFJLENBQUM7QUFBQSxNQUNyQyxHQUFJLG9CQUFvQixTQUFZLEVBQUUsZ0JBQWdCLElBQUksQ0FBQztBQUFBLE1BQzNELEdBQUksWUFBWSxTQUFZLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFBQSxJQUM1QztBQUNBLFVBQU0sNkJBQTZCLE1BQU0sV0FBVyxVQUNoRCxFQUFFLFNBQVMsTUFBTSxNQUFNLEtBQUssTUFBTSxPQUFPLFNBQVM7QUFDdEQsUUFBSSxVQUFVO0FBQ2IsYUFBTyxFQUFFLE1BQU0sVUFBVSxVQUFVLGVBQWUsZ0JBQWdCLDJCQUEyQjtBQUFBLElBQzlGO0FBQ0EsUUFBSSxDQUFDLFVBQVU7QUFDZCxZQUFNLElBQUkseUJBQXlCLHFEQUFxRDtBQUFBLElBQ3pGO0FBQ0EsUUFBSSxDQUFDLFFBQVE7QUFDWixZQUFNLElBQUkseUJBQXlCLHVGQUF1RjtBQUFBLElBQzNIO0FBQ0EsUUFBSSxTQUFTLFVBQWEsV0FBVyxRQUFXO0FBQy9DLFlBQU0sSUFBSSxNQUFNLHdEQUF3RDtBQUFBLElBQ3pFO0FBQ0EsV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sVUFBVTtBQUFBLE1BQ1YsZUFBZTtBQUFBLFFBQ2Q7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBLEdBQUksVUFBVSxFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUEsUUFDN0IsR0FBSSxPQUFPLEVBQUUsS0FBSyxJQUFJLENBQUM7QUFBQSxRQUN2QixHQUFJLGtCQUFrQixFQUFFLGdCQUFnQixJQUFJLENBQUM7QUFBQSxRQUM3QyxHQUFJLFlBQVksU0FBWSxFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUEsTUFDNUM7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHdCQUF3QixVQUF5RDtBQUN4RixRQUFJLENBQUMsVUFBVTtBQUNkLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxVQUFVLEtBQUssMEJBQTBCLFdBQVcsUUFBUSxLQUM5RCxLQUFLLDBCQUEwQiwwQkFBMEIsUUFBUSxHQUFHO0FBQ3hFLFdBQU8sVUFBVSw0QkFBNEIsT0FBTyxJQUFJO0FBQUEsRUFDekQ7QUFDRDtBQTVXYSwwQkFBTjtBQUFBLEVBR0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBTFU7QUE4V04sSUFBTSw4QkFBTixjQUEwQyxXQUE2QztBQUFBLEVBSTdGLFlBQzZCLGNBQ0wsc0JBQ3RCO0FBQ0QsVUFBTTtBQUVOLFVBQU0sV0FBVyxxQkFBcUIsZUFBZSxtQkFBbUI7QUFDeEUsVUFBTSxnQkFBZ0IscUJBQXFCLGVBQWUsdUJBQXVCO0FBQ2pGLFVBQU0sVUFBVSxxQkFBcUIsZUFBZSxpQkFBaUI7QUFDckUsVUFBTSxhQUFhLHFCQUFxQixlQUFlLG9CQUFvQjtBQUMzRSxTQUFLLFVBQVUsYUFBYSxhQUFhLFNBQVMsWUFBWSxHQUFHLFFBQVEsQ0FBQztBQUMxRSxTQUFLLFVBQVUsYUFBYSxhQUFhLGNBQWMsWUFBWSxHQUFHLGFBQWEsQ0FBQztBQUNwRixTQUFLLFVBQVUsYUFBYSxhQUFhLFFBQVEsWUFBWSxHQUFHLE9BQU8sQ0FBQztBQUN4RSxTQUFLLFVBQVUsYUFBYSxhQUFhLFdBQVcsWUFBWSxHQUFHLFVBQVUsQ0FBQztBQUFBLEVBQy9FO0FBQ0Q7QUFuQmEsNEJBRUksS0FBSztBQUZULDhCQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxHQU5VO0FBcUJiLFNBQVMscUJBQXFCLHNCQUFzRDtBQUNuRixTQUFPLHFCQUFxQixTQUFrQixnQ0FBZ0MsTUFBTTtBQUNyRjtBQUVBLFNBQVMsZ0JBQWdCLFlBQTZDLFlBQWdDLGVBQXFFO0FBQzFLLFNBQU8sV0FBVyxLQUFLLGdCQUNyQixlQUFlLFVBQWEsVUFBVSxlQUFlLGdCQUNsRCxrQkFBa0IsVUFBYSxVQUFVLFlBQVksT0FBTyxjQUFjO0FBQ2hGO0FBRUEsU0FBUyw0QkFBNEIsU0FBaUQ7QUFDckYsTUFBSSxRQUFRLGFBQWEsSUFBSSxNQUFNLE1BQU07QUFDeEMsV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sWUFBWSxRQUFRO0FBQUEsTUFDcEIsZUFBZSxRQUFRO0FBQUEsSUFDeEI7QUFBQSxFQUNEO0FBQ0EsUUFBTSxZQUFZLFFBQVEsVUFBVSxJQUFJO0FBQ3hDLFNBQU8sWUFBWTtBQUFBLElBQ2xCLE1BQU07QUFBQSxJQUNOLFdBQVcsVUFBVTtBQUFBLElBQ3JCLFlBQVksUUFBUTtBQUFBLElBQ3BCLGVBQWUsUUFBUTtBQUFBLElBQ3ZCLFdBQVcsRUFBRSxNQUFNLFVBQVU7QUFBQSxFQUM5QixJQUFJO0FBQ0w7QUFFQSxTQUFTLGNBQWMsT0FBZ0MsVUFBMkMsVUFBb0Q7QUFDckosUUFBTSxRQUFRLG1CQUFtQixPQUFPLFVBQVU7QUFDbEQsTUFBSSxDQUFDLE9BQU87QUFDWCxRQUFJLFVBQVU7QUFDYixZQUFNLElBQUkseUJBQXlCLHFEQUFxRDtBQUFBLElBQ3pGO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFFQSx3QkFBc0IsT0FBTyxDQUFDLFlBQVksZ0JBQWdCLGtCQUFrQixhQUFhLEdBQUcsWUFBWTtBQUN4RyxRQUFNLFdBQVcsaUJBQWlCLE9BQU8sWUFBWSxtQkFBbUIsS0FBSyxVQUFVO0FBQ3ZGLE1BQUksQ0FBQyxVQUFVO0FBQ2QsVUFBTSxJQUFJLHlCQUF5Qiw4REFBOEQ7QUFBQSxFQUNsRztBQUNBLFFBQU0sZUFBZSxvQkFBb0IsT0FBTyxnQkFBZ0IsR0FBRyxFQUFFLEtBQUssVUFBVSxnQkFBZ0I7QUFDcEcsUUFBTSxpQkFBaUIsb0JBQW9CLE9BQU8sa0JBQWtCLEdBQUcsRUFBRSxLQUFLLFVBQVUsa0JBQWtCO0FBQzFHLFFBQU0sY0FBYyxvQkFBb0IsT0FBTyxlQUFlLEdBQUcsQ0FBQyxLQUFLLFVBQVUsZUFBZTtBQUVoRyxTQUFPLEVBQUUsVUFBVSxjQUFjLGdCQUFnQixZQUFZO0FBQzlEO0FBRUEsU0FBUyxZQUFZLE9BQWdDLFVBQW1DLGVBQTJFO0FBQ2xLLFFBQU0sUUFBUSxtQkFBbUIsT0FBTyxRQUFRO0FBQ2hELE1BQUksQ0FBQyxPQUFPO0FBQ1gsV0FBTyxXQUFXLFNBQVk7QUFBQSxFQUMvQjtBQUVBLHdCQUFzQixPQUFPLENBQUMsUUFBUSxhQUFhLGNBQWMsaUJBQWlCLGFBQWEsUUFBUSxHQUFHLFVBQVU7QUFDcEgsUUFBTSxPQUFPLGlCQUFpQixPQUFPLFFBQVEsQ0FBQyxrQkFBa0IsYUFBYSxXQUFXLENBQVU7QUFDbEcsTUFBSSxTQUFTLGtCQUFrQjtBQUM5QiwyQkFBdUIsT0FBTyxDQUFDLGFBQWEsY0FBYyxpQkFBaUIsYUFBYSxRQUFRLEdBQUcseUJBQXlCO0FBQzVILFFBQUksQ0FBQyxlQUFlO0FBQ25CLFlBQU0sSUFBSSx5QkFBeUIsaUVBQWlFO0FBQUEsSUFDckc7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUVBLE1BQUksU0FBUyxhQUFhO0FBQ3pCLDJCQUF1QixPQUFPLENBQUMsYUFBYSxhQUFhLFFBQVEsR0FBRyxvQkFBb0I7QUFDeEYsVUFBTUMsa0JBQWlCLFVBQVUsT0FBTyxTQUFTLGNBQWMsU0FBUyxTQUFTO0FBQ2pGLFVBQU1DLGNBQWEsMkJBQTJCLE9BQU8sWUFBWSxLQUFLRCxpQkFBZ0IsY0FBYyxlQUFlO0FBQ25ILFVBQU1FLGlCQUFnQiwyQkFBMkIsT0FBTyxlQUFlLEtBQUtGLGlCQUFnQixpQkFBaUIsZUFBZTtBQUM1SCxRQUFJLENBQUNDLGVBQWMsQ0FBQ0MsZ0JBQWU7QUFDbEMsWUFBTSxJQUFJLHlCQUF5QiwrREFBK0Q7QUFBQSxJQUNuRztBQUNBLFdBQU8sRUFBRSxNQUFNLGFBQWEsWUFBQUQsYUFBWSxlQUFBQyxlQUFjO0FBQUEsRUFDdkQ7QUFFQSxRQUFNLGlCQUFpQixVQUFVLE9BQU8sU0FBUyxjQUFjLFNBQVMsU0FBUztBQUNqRixRQUFNLGdCQUFnQixlQUFlLFNBQVMsY0FBYyxnQkFBZ0I7QUFDNUUsUUFBTSxhQUFhLGtCQUFrQjtBQUNyQyxRQUFNLGlCQUFpQiwyQkFBMkIsT0FBTyxXQUFXO0FBQ3BFLFFBQU0sWUFBWSxpQkFBaUIsU0FBUyxnQkFBZ0Isa0JBQWtCLElBQUksWUFBWTtBQUM5RixNQUFJLENBQUMsV0FBVztBQUNmLFVBQU0sSUFBSSx5QkFBeUIsMENBQTBDO0FBQUEsRUFDOUU7QUFDQSxRQUFNLGFBQWEsMkJBQTJCLE9BQU8sWUFBWSxLQUFLLFlBQVk7QUFDbEYsUUFBTSxnQkFBZ0IsMkJBQTJCLE9BQU8sZUFBZSxLQUFLLFlBQVk7QUFDeEYsUUFBTSxnQkFBZ0IsaUJBQWlCLE9BQU8sYUFBYSx3QkFBd0IsS0FBSyxZQUFZLFVBQVUsUUFBUTtBQUN0SCxRQUFNLFNBQVMsMkJBQTJCLE9BQU8sUUFBUSxNQUNwRCxZQUFZLFVBQVUsU0FBUyxhQUFhLFdBQVcsVUFBVSxTQUFTO0FBQy9FLE1BQUksa0JBQWtCLGNBQWMsMkJBQTJCLE9BQU8sUUFBUSxNQUFNLFFBQVc7QUFDOUYsVUFBTSxJQUFJLHlCQUF5Qix3REFBd0Q7QUFBQSxFQUM1RjtBQUNBLE1BQUk7QUFDSixNQUFJLGtCQUFrQixZQUFZO0FBQ2pDLFFBQUksQ0FBQyxRQUFRO0FBQ1osWUFBTSxJQUFJLHlCQUF5QiwrREFBK0Q7QUFBQSxJQUNuRztBQUNBLGdCQUFZLEVBQUUsTUFBTSxZQUFZLE9BQU87QUFBQSxFQUN4QyxPQUFPO0FBQ04sZ0JBQVksRUFBRSxNQUFNLGNBQWM7QUFBQSxFQUNuQztBQUNBLFNBQU8sRUFBRSxNQUFNLGFBQWEsV0FBVyxZQUFZLGVBQWUsVUFBVTtBQUM3RTtBQUVBLFNBQVMsU0FBUyxPQUFlLE9BQW9CO0FBQ3BELE1BQUk7QUFDSCxVQUFNLE1BQU0sSUFBSSxNQUFNLE9BQU8sSUFBSTtBQUNqQyxRQUFJLENBQUMsSUFBSSxRQUFRO0FBQ2hCLFlBQU0sSUFBSSxNQUFNLG9CQUFvQjtBQUFBLElBQ3JDO0FBQ0EsV0FBTztBQUFBLEVBQ1IsUUFBUTtBQUNQLFVBQU0sSUFBSSx5QkFBeUIsSUFBSSxLQUFLLGlDQUFpQztBQUFBLEVBQzlFO0FBQ0Q7QUFFQSxTQUFTLHVCQUF1QixZQUFnRDtBQUMvRSxRQUFNLFNBQTBDLFdBQVcsT0FBTyxTQUFTLGNBQ3hFO0FBQUEsSUFDRCxNQUFNO0FBQUEsSUFDTixXQUFXLFdBQVcsT0FBTyxVQUFVLFNBQVM7QUFBQSxJQUNoRCxZQUFZLFdBQVcsT0FBTyxjQUFjO0FBQUEsSUFDNUMsZUFBZSxXQUFXLE9BQU8saUJBQWlCO0FBQUEsSUFDbEQsV0FBVyxXQUFXLE9BQU87QUFBQSxFQUM5QixJQUNFO0FBQUEsSUFDRCxNQUFNO0FBQUEsSUFDTixZQUFZLFdBQVcsT0FBTztBQUFBLElBQzlCLGVBQWUsV0FBVyxPQUFPO0FBQUEsRUFDbEM7QUFDRCxTQUFPO0FBQUEsSUFDTixJQUFJLFdBQVc7QUFBQSxJQUNmLE1BQU0sV0FBVztBQUFBLElBQ2pCLFFBQVEsV0FBVztBQUFBLElBQ25CLFVBQVUsV0FBVztBQUFBLElBQ3JCO0FBQUEsSUFDQSxTQUFTLFdBQVcsV0FBVztBQUFBLElBQy9CLE1BQU0sV0FBVyxRQUFRO0FBQUEsSUFDekIsaUJBQWlCLFdBQVcsbUJBQW1CO0FBQUEsSUFDL0MsU0FBUyxXQUFXO0FBQUEsSUFDcEIsV0FBVyxXQUFXO0FBQUEsSUFDdEIsV0FBVyxXQUFXO0FBQUEsSUFDdEIsV0FBVyxXQUFXLGFBQWE7QUFBQSxJQUNuQyxXQUFXLFdBQVcsYUFBYTtBQUFBLEVBQ3BDO0FBQ0Q7QUFFQSxTQUFTLDJCQUEyQixZQUF5QixXQUFzRjtBQUNsSixTQUFPO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixjQUFjLFdBQVc7QUFBQSxJQUN6QixnQkFBZ0IsV0FBVztBQUFBLElBQzNCO0FBQUEsRUFDRDtBQUNEO0FBRUEsU0FBUyxxQkFBcUIsT0FBNEI7QUFDekQsU0FBTyxFQUFFLFNBQVMsQ0FBQyxFQUFFLE1BQU0sUUFBUSxNQUFNLENBQUMsRUFBRTtBQUM3QztBQUVBLFNBQVMsb0JBQW9CLFNBQThCO0FBQzFELFNBQU87QUFBQSxJQUNOLFNBQVMsQ0FBQyxFQUFFLE1BQU0sUUFBUSxPQUFPLFFBQVEsQ0FBQztBQUFBLElBQzFDLGlCQUFpQjtBQUFBLElBQ2pCLG1CQUFtQixTQUFTLHlCQUF5QiwyQkFBMkI7QUFBQSxFQUNqRjtBQUNEO0FBRUEsU0FBUywwQkFBdUM7QUFDL0MsUUFBTSxTQUFTLHFCQUFxQixLQUFLLFVBQVU7QUFBQSxJQUNsRCxRQUFRO0FBQUEsSUFDUixTQUFTO0FBQUEsRUFDVixDQUFDLENBQUM7QUFDRixTQUFPLG9CQUFvQixTQUFTLDZCQUE2Qiw2QkFBNkI7QUFDOUYsU0FBTztBQUNSO0FBRUEsU0FBUyw0QkFBeUM7QUFDakQsUUFBTSxTQUFTLHFCQUFxQixLQUFLLFVBQVU7QUFBQSxJQUNsRCxRQUFRO0FBQUEsSUFDUixTQUFTO0FBQUEsRUFDVixDQUFDLENBQUM7QUFDRixTQUFPLG9CQUFvQixTQUFTLG9DQUFvQywrQkFBK0I7QUFDdkcsU0FBTztBQUNSO0FBRUEsU0FBUyx5QkFBc0M7QUFDOUMsUUFBTSxTQUFTLHFCQUFxQixLQUFLLFVBQVU7QUFBQSxJQUNsRCxRQUFRO0FBQUEsSUFDUixTQUFTO0FBQUEsRUFDVixDQUFDLENBQUM7QUFDRixTQUFPLG9CQUFvQixTQUFTLGlDQUFpQywwQkFBMEI7QUFDL0YsU0FBTztBQUNSO0FBRUEsU0FBUyx5QkFBeUIsWUFBeUIsS0FBa0M7QUFDNUYsUUFBTSxTQUFTLHFCQUFxQixLQUFLLFVBQVU7QUFBQSxJQUNsRCxRQUFRO0FBQUEsSUFDUixZQUFZLEVBQUUsSUFBSSxXQUFXLElBQUksTUFBTSxXQUFXLEtBQUs7QUFBQSxJQUN2RCxLQUFLO0FBQUEsTUFDSixJQUFJLElBQUk7QUFBQSxNQUNSLFFBQVEsSUFBSTtBQUFBLE1BQ1osaUJBQWlCLElBQUksbUJBQW1CO0FBQUEsSUFDekM7QUFBQSxFQUNELEdBQUcsUUFBVyxDQUFDLENBQUM7QUFDaEIsU0FBTyxvQkFBb0IsU0FBUyw0Q0FBNEMscUNBQXFDLFdBQVcsSUFBSTtBQUNwSSxTQUFPO0FBQ1I7QUFHQSxTQUFTLHFCQUFxQixZQUF5QixVQUF3RTtBQUM5SCxNQUFJLFNBQVMsV0FBVyxhQUFhO0FBQ3BDLFdBQU8sdUJBQXVCO0FBQUEsRUFDL0I7QUFDQSxNQUFJLFNBQVMsV0FBVyxXQUFXO0FBQ2xDLFdBQU8sb0JBQW9CLGVBQWUsV0FBVyxFQUFFLHFCQUFxQjtBQUFBLEVBQzdFO0FBQ0EsTUFBSSxTQUFTLFdBQVcscUJBQXFCO0FBQzVDLFdBQU8sb0JBQW9CLGVBQWUsV0FBVyxFQUFFLHVEQUF1RDtBQUFBLEVBQy9HO0FBQ0EsU0FBTyxvQkFBb0IsU0FBUyxLQUFLLGVBQ3RDLGVBQWUsV0FBVyxFQUFFLHNCQUFzQixTQUFTLElBQUksWUFBWSxLQUMzRSxlQUFlLFdBQVcsRUFBRSxvQkFBb0I7QUFDcEQ7QUFFQSxTQUFTLHVCQUF1QixtQkFBdUMsVUFBbUIsVUFBNkQ7QUFDdEosTUFBSSxDQUFDLFNBQVMsUUFBUSxHQUFHO0FBQ3hCLFVBQU0sSUFBSSx5QkFBeUIsR0FBRyxRQUFRLDJCQUEyQjtBQUFBLEVBQzFFO0FBQ0Esd0JBQXNCLFVBQVUsQ0FBQyxjQUFjLEdBQUcsR0FBRyxRQUFRLFFBQVE7QUFDckUsUUFBTSxlQUFlLDJCQUEyQixVQUFVLGNBQWM7QUFDeEUsTUFBSSxDQUFDLGNBQWM7QUFDbEIsVUFBTSxJQUFJLHlCQUF5Qiw2QkFBNkI7QUFBQSxFQUNqRTtBQUNBLFFBQU0sYUFBYSxrQkFBa0IsY0FBYyxZQUFZO0FBQy9ELE1BQUksQ0FBQyxZQUFZO0FBQ2hCLFVBQU0sSUFBSSx5QkFBeUIsZUFBZSxZQUFZLHNFQUFzRTtBQUFBLEVBQ3JJO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxzQkFBc0IsT0FBZ0MsWUFBK0IsT0FBcUI7QUFDbEgsUUFBTSxRQUFRLElBQUksSUFBSSxVQUFVO0FBQ2hDLFFBQU0sYUFBYSxPQUFPLEtBQUssS0FBSyxFQUFFLEtBQUssU0FBTyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUM7QUFDakUsTUFBSSxZQUFZO0FBQ2YsVUFBTSxJQUFJLHlCQUF5QixHQUFHLEtBQUssd0JBQXdCLFVBQVUsYUFBYTtBQUFBLEVBQzNGO0FBQ0Q7QUFFQSxTQUFTLHVCQUF1QixPQUFnQyxZQUErQixPQUFxQjtBQUNuSCxRQUFNLFVBQVUsV0FBVyxLQUFLLGNBQVksTUFBTSxRQUFRLE1BQU0sTUFBUztBQUN6RSxNQUFJLFNBQVM7QUFDWixVQUFNLElBQUkseUJBQXlCLEdBQUcsS0FBSyxvQkFBb0IsT0FBTyxJQUFJO0FBQUEsRUFDM0U7QUFDRDtBQUVBLFNBQVMsbUJBQW1CLE9BQWdDLFVBQXVEO0FBQ2xILFFBQU0sWUFBWSxNQUFNLFFBQVE7QUFDaEMsTUFBSSxjQUFjLFFBQVc7QUFDNUIsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLENBQUMsU0FBUyxTQUFTLEdBQUc7QUFDekIsVUFBTSxJQUFJLHlCQUF5QixJQUFJLFFBQVEsc0JBQXNCO0FBQUEsRUFDdEU7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLHlCQUF5QixPQUFnQyxVQUFzQztBQUN2RyxRQUFNLFlBQVksTUFBTSxRQUFRO0FBQ2hDLE1BQUksY0FBYyxRQUFXO0FBQzVCLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxPQUFPLGNBQWMsWUFBWSxVQUFVLEtBQUssTUFBTSxJQUFJO0FBQzdELFVBQU0sSUFBSSx5QkFBeUIsSUFBSSxRQUFRLCtCQUErQjtBQUFBLEVBQy9FO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUywyQkFBMkIsT0FBZ0MsVUFBc0M7QUFDekcsUUFBTSxZQUFZLHlCQUF5QixPQUFPLFFBQVE7QUFDMUQsU0FBTyxXQUFXLEtBQUs7QUFDeEI7QUFFQSxTQUFTLG1DQUFtQyxPQUFnQyxVQUE2QztBQUN4SCxRQUFNLFlBQVksTUFBTSxRQUFRO0FBQ2hDLE1BQUksY0FBYyxVQUFhLGNBQWMsTUFBTTtBQUNsRCxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksT0FBTyxjQUFjLFlBQVksVUFBVSxLQUFLLE1BQU0sSUFBSTtBQUM3RCxVQUFNLElBQUkseUJBQXlCLElBQUksUUFBUSx1Q0FBdUM7QUFBQSxFQUN2RjtBQUNBLFNBQU8sVUFBVSxLQUFLO0FBQ3ZCO0FBRUEsU0FBUyxvQkFBb0IsT0FBZ0MsVUFBdUM7QUFDbkcsUUFBTSxZQUFZLE1BQU0sUUFBUTtBQUNoQyxNQUFJLGNBQWMsUUFBVztBQUM1QixXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksT0FBTyxjQUFjLFdBQVc7QUFDbkMsVUFBTSxJQUFJLHlCQUF5QixJQUFJLFFBQVEsc0JBQXNCO0FBQUEsRUFDdEU7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLG9CQUFvQixPQUFnQyxVQUFrQixTQUFpQixTQUFxQztBQUNwSSxRQUFNLFlBQVksTUFBTSxRQUFRO0FBQ2hDLE1BQUksY0FBYyxRQUFXO0FBQzVCLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxPQUFPLGNBQWMsWUFBWSxDQUFDLE9BQU8sVUFBVSxTQUFTLEtBQUssWUFBWSxXQUFXLFlBQVksU0FBUztBQUNoSCxVQUFNLElBQUkseUJBQXlCLElBQUksUUFBUSw2QkFBNkIsT0FBTyxZQUFZLE9BQU8sR0FBRztBQUFBLEVBQzFHO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxpQkFBeUMsT0FBZ0MsVUFBa0IsU0FBMEI7QUFDN0gsUUFBTSxZQUFZLGlCQUFpQixPQUFPLFVBQVUsT0FBTztBQUMzRCxNQUFJLGNBQWMsUUFBVztBQUM1QixVQUFNLElBQUkseUJBQXlCLElBQUksUUFBUSxnQkFBZ0I7QUFBQSxFQUNoRTtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsaUJBQXlDLE9BQWdDLFVBQWtCLFNBQXNDO0FBQ3pJLFFBQU0sWUFBWSxNQUFNLFFBQVE7QUFDaEMsTUFBSSxjQUFjLFFBQVc7QUFDNUIsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLENBQUMsZ0JBQWdCLFdBQVcsT0FBTyxHQUFHO0FBQ3pDLFVBQU0sSUFBSSx5QkFBeUIsSUFBSSxRQUFRLHFCQUFxQixRQUFRLEtBQUssSUFBSSxDQUFDLEdBQUc7QUFBQSxFQUMxRjtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMseUJBQWlELE9BQWdDLFVBQWtCLFNBQTZDO0FBQ3hKLFFBQU0sWUFBWSxNQUFNLFFBQVE7QUFDaEMsTUFBSSxjQUFjLFVBQWEsY0FBYyxNQUFNO0FBQ2xELFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxDQUFDLGdCQUFnQixXQUFXLE9BQU8sR0FBRztBQUN6QyxVQUFNLElBQUkseUJBQXlCLElBQUksUUFBUSw2QkFBNkIsUUFBUSxLQUFLLElBQUksQ0FBQyxHQUFHO0FBQUEsRUFDbEc7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLFNBQVMsT0FBa0Q7QUFDbkUsU0FBTyxDQUFDLENBQUMsU0FBUyxPQUFPLFVBQVUsWUFBWSxDQUFDLE1BQU0sUUFBUSxLQUFLO0FBQ3BFO0FBRUEsU0FBUyxnQkFBd0MsT0FBZ0IsU0FBbUM7QUFDbkcsU0FBTyxPQUFPLFVBQVUsWUFBWSxRQUFRLEtBQUssZUFBYSxjQUFjLEtBQUs7QUFDbEY7IiwKICAibmFtZXMiOiBbInRhcmdldCIsICJleGlzdGluZ1RhcmdldCIsICJwcm92aWRlcklkIiwgInNlc3Npb25UeXBlSWQiXQp9Cg==
