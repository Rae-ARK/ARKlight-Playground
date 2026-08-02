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
import { timeout } from "../../../../../../../base/common/async.js";
import { localize } from "../../../../../../../nls.js";
import { ITelemetryService } from "../../../../../../../platform/telemetry/common/telemetry.js";
import { ToolDataSource } from "../../../../../chat/common/tools/languageModelToolsService.js";
import { ITaskService } from "../../../../../tasks/common/taskService.js";
import { TaskRunSource } from "../../../../../tasks/common/tasks.js";
import { ITerminalService } from "../../../../../terminal/browser/terminal.js";
import { collectTerminalResults, getTaskDefinition, getTaskForTool, resolveDependencyTasks, tasksMatch } from "../../taskHelpers.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { toolResultDetailsFromResponse, toolResultMessageFromResponse } from "./taskHelpers.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { TerminalToolId } from "../toolIds.js";
let RunTaskTool = class {
  constructor(_tasksService, _telemetryService, _terminalService, _configurationService, _instantiationService) {
    this._tasksService = _tasksService;
    this._telemetryService = _telemetryService;
    this._terminalService = _terminalService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const args = invocation.parameters;
    if (!invocation.context) {
      return { content: [{ kind: "text", value: `No invocation context` }], toolResultMessage: `No invocation context` };
    }
    const taskDefinition = getTaskDefinition(args.id);
    const task = await getTaskForTool(args.id, taskDefinition, args.workspaceFolder, this._configurationService, this._tasksService, true);
    if (!task) {
      return { content: [{ kind: "text", value: `Task not found: ${args.id}` }], toolResultMessage: new MarkdownString(localize("chat.taskNotFound", "Task not found: `{0}`", args.id)) };
    }
    const taskLabel = task._label;
    const activeTasks = await this._tasksService.getActiveTasks();
    if (activeTasks.includes(task)) {
      return { content: [{ kind: "text", value: `The task ${taskLabel} is already running.` }], toolResultMessage: new MarkdownString(localize("chat.taskAlreadyRunning", "The task `{0}` is already running.", taskLabel)) };
    }
    const dependencyTasks = await resolveDependencyTasks(task, args.workspaceFolder, this._configurationService, this._tasksService);
    const startMarkersByTerminalInstanceId = /* @__PURE__ */ new Map();
    const startMarkersDisposableStore = new DisposableStore();
    for (const terminal of this._terminalService.instances) {
      const marker = terminal.registerMarker();
      startMarkersByTerminalInstanceId.set(terminal.instanceId, marker);
      if (marker) {
        startMarkersDisposableStore.add(marker);
      }
    }
    try {
      const raceResult = await Promise.race([this._tasksService.run(task, void 0, TaskRunSource.ChatAgent), timeout(3e3)]);
      const result = raceResult && typeof raceResult === "object" ? raceResult : void 0;
      const resources = this._tasksService.getTerminalsForTasks(dependencyTasks ?? task);
      if (!resources || resources.length === 0) {
        return { content: [{ kind: "text", value: `Task started but no terminal was found for: ${taskLabel}` }], toolResultMessage: new MarkdownString(localize("chat.noTerminal", "Task started but no terminal was found for: `{0}`", taskLabel)) };
      }
      const terminals = this._terminalService.instances.filter((t) => resources.some((r) => r.path === t.resource.path && r.scheme === t.resource.scheme));
      if (terminals.length === 0) {
        return { content: [{ kind: "text", value: `Task started but no terminal was found for: ${taskLabel}` }], toolResultMessage: new MarkdownString(localize("chat.noTerminal", "Task started but no terminal was found for: `{0}`", taskLabel)) };
      }
      const store = new DisposableStore();
      let terminalResults = [];
      try {
        terminalResults = await collectTerminalResults(
          terminals,
          task,
          this._instantiationService,
          invocation.context,
          _progress,
          token,
          store,
          (terminalTask) => this._isTaskActive(terminalTask),
          dependencyTasks,
          this._tasksService,
          startMarkersByTerminalInstanceId
        );
      } finally {
        store.dispose();
      }
      for (const r of terminalResults) {
        this._telemetryService.publicLog2?.("copilotChat.runTaskTool.run", {
          taskId: args.id,
          bufferLength: r.output.length ?? 0,
          pollDurationMs: r.pollDurationMs ?? 0,
          inputToolManualAcceptCount: r.inputToolManualAcceptCount ?? 0,
          inputToolManualRejectCount: r.inputToolManualRejectCount ?? 0,
          inputToolManualChars: r.inputToolManualChars ?? 0,
          inputToolManualShownCount: r.inputToolManualShownCount ?? 0,
          inputToolFreeFormInputShownCount: r.inputToolFreeFormInputShownCount ?? 0,
          inputToolFreeFormInputCount: r.inputToolFreeFormInputCount ?? 0
        });
      }
      const details = terminalResults.map((r) => `Terminal: ${r.name}
Output:
${r.output}`);
      const uniqueDetails = Array.from(new Set(details)).join("\n\n");
      const toolResultDetails = toolResultDetailsFromResponse(terminalResults);
      const toolResultMessage = toolResultMessageFromResponse(result, taskLabel, toolResultDetails, terminalResults, void 0, task.configurationProperties.isBackground);
      return {
        content: [{ kind: "text", value: uniqueDetails }],
        toolResultMessage,
        toolResultDetails
      };
    } finally {
      startMarkersDisposableStore.dispose();
    }
  }
  async _isTaskActive(task) {
    const busyTasks = await this._tasksService.getBusyTasks();
    return busyTasks?.some((t) => tasksMatch(t, task)) ?? false;
  }
  async prepareToolInvocation(context, token) {
    const args = context.parameters;
    const taskDefinition = getTaskDefinition(args.id);
    const task = await getTaskForTool(args.id, taskDefinition, args.workspaceFolder, this._configurationService, this._tasksService, true);
    if (!task) {
      return { invocationMessage: new MarkdownString(localize("chat.taskNotFound", "Task not found: `{0}`", args.id)) };
    }
    const taskLabel = task._label;
    const activeTasks = await this._tasksService.getActiveTasks();
    if (task && activeTasks.includes(task)) {
      return { invocationMessage: new MarkdownString(localize("chat.taskAlreadyActive", "The task is already running.")) };
    }
    if (await this._isTaskActive(task)) {
      return {
        invocationMessage: new MarkdownString(localize("chat.taskIsAlreadyRunning", "`{0}` is already running.", taskLabel)),
        pastTenseMessage: new MarkdownString(localize("chat.taskWasAlreadyRunning", "`{0}` was already running.", taskLabel)),
        confirmationMessages: void 0
      };
    }
    return {
      invocationMessage: new MarkdownString(localize("chat.runningTask", "Running `{0}`", taskLabel)),
      pastTenseMessage: new MarkdownString(task?.configurationProperties.isBackground ? localize("chat.startedTask", "Started `{0}`", taskLabel) : localize("chat.ranTask", "Ran `{0}`", taskLabel)),
      confirmationMessages: task ? { title: localize("chat.allowTaskRunTitle", "Allow task run?"), message: localize("chat.allowTaskRunMsg", "Allow to run the task `{0}`?", taskLabel) } : void 0
    };
  }
};
RunTaskTool = __decorateClass([
  __decorateParam(0, ITaskService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, ITerminalService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService)
], RunTaskTool);
const RunTaskToolData = {
  id: TerminalToolId.RunTask,
  toolReferenceName: "runTask",
  legacyToolReferenceFullNames: ["runTasks/runTask"],
  displayName: localize("runInTerminalTool.displayName", "Run Task"),
  modelDescription: `Runs a VS Code task.

- If you see that an appropriate task exists for building or running code, prefer to use this tool to run the task instead of using the ${TerminalToolId.RunInTerminal} tool.
- Make sure that any appropriate build or watch task is running before trying to run tests or execute code.
- If the user asks to run a task, use this tool to do so.`,
  userDescription: localize("runInTerminalTool.userDescription", "Run tasks in the workspace"),
  icon: Codicon.tools,
  source: ToolDataSource.Internal,
  inputSchema: {
    "type": "object",
    "properties": {
      "workspaceFolder": {
        "type": "string",
        "description": "The workspace folder path containing the task"
      },
      "id": {
        "type": "string",
        "description": "The task ID to run."
      }
    },
    "required": [
      "workspaceFolder",
      "id"
    ]
  }
};
export {
  RunTaskTool,
  RunTaskToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL3Rhc2svcnVuVGFza1Rvb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBDb3VudFRva2Vuc0NhbGxiYWNrLCBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgSVRvb2xEYXRhLCBJVG9vbEltcGwsIElUb29sSW52b2NhdGlvbiwgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBJVG9vbFJlc3VsdCwgVG9vbERhdGFTb3VyY2UsIFRvb2xQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRhc2tTZXJ2aWNlLCBJVGFza1N1bW1hcnksIFRhc2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90YXNrcy9jb21tb24vdGFza1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGFza1J1blNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rhc2tzL2NvbW1vbi90YXNrcy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgY29sbGVjdFRlcm1pbmFsUmVzdWx0cywgZ2V0VGFza0RlZmluaXRpb24sIGdldFRhc2tGb3JUb29sLCByZXNvbHZlRGVwZW5kZW5jeVRhc2tzLCB0YXNrc01hdGNoIH0gZnJvbSAnLi4vLi4vdGFza0hlbHBlcnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyB0b29sUmVzdWx0RGV0YWlsc0Zyb21SZXNwb25zZSwgdG9vbFJlc3VsdE1lc3NhZ2VGcm9tUmVzcG9uc2UgfSBmcm9tICcuL3Rhc2tIZWxwZXJzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRhc2tUb29sQ2xhc3NpZmljYXRpb24sIFRhc2tUb29sRXZlbnQgfSBmcm9tICcuL3Rhc2tUb29sc1RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFRvb2xJZCB9IGZyb20gJy4uL3Rvb2xJZHMuanMnO1xuXG5pbnRlcmZhY2UgSVJ1blRhc2tUb29sSW5wdXQgZXh0ZW5kcyBJVG9vbEludm9jYXRpb24ge1xuXHRpZDogc3RyaW5nO1xuXHR3b3Jrc3BhY2VGb2xkZXI6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFJ1blRhc2tUb29sIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRhc2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rhc2tzU2VydmljZTogSVRhc2tTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHsgfVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgX3Byb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCBhcmdzID0gaW52b2NhdGlvbi5wYXJhbWV0ZXJzIGFzIElSdW5UYXNrVG9vbElucHV0O1xuXG5cdFx0aWYgKCFpbnZvY2F0aW9uLmNvbnRleHQpIHtcblx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IGBObyBpbnZvY2F0aW9uIGNvbnRleHRgIH1dLCB0b29sUmVzdWx0TWVzc2FnZTogYE5vIGludm9jYXRpb24gY29udGV4dGAgfTtcblx0XHR9XG5cblx0XHRjb25zdCB0YXNrRGVmaW5pdGlvbiA9IGdldFRhc2tEZWZpbml0aW9uKGFyZ3MuaWQpO1xuXHRcdGNvbnN0IHRhc2sgPSBhd2FpdCBnZXRUYXNrRm9yVG9vbChhcmdzLmlkLCB0YXNrRGVmaW5pdGlvbiwgYXJncy53b3Jrc3BhY2VGb2xkZXIsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl90YXNrc1NlcnZpY2UsIHRydWUpO1xuXHRcdGlmICghdGFzaykge1xuXHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogYFRhc2sgbm90IGZvdW5kOiAke2FyZ3MuaWR9YCB9XSwgdG9vbFJlc3VsdE1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnY2hhdC50YXNrTm90Rm91bmQnLCAnVGFzayBub3QgZm91bmQ6IFxcYHswfVxcYCcsIGFyZ3MuaWQpKSB9O1xuXHRcdH1cblx0XHRjb25zdCB0YXNrTGFiZWwgPSB0YXNrLl9sYWJlbDtcblx0XHRjb25zdCBhY3RpdmVUYXNrcyA9IGF3YWl0IHRoaXMuX3Rhc2tzU2VydmljZS5nZXRBY3RpdmVUYXNrcygpO1xuXHRcdGlmIChhY3RpdmVUYXNrcy5pbmNsdWRlcyh0YXNrKSkge1xuXHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogYFRoZSB0YXNrICR7dGFza0xhYmVsfSBpcyBhbHJlYWR5IHJ1bm5pbmcuYCB9XSwgdG9vbFJlc3VsdE1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnY2hhdC50YXNrQWxyZWFkeVJ1bm5pbmcnLCAnVGhlIHRhc2sgXFxgezB9XFxgIGlzIGFscmVhZHkgcnVubmluZy4nLCB0YXNrTGFiZWwpKSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlcGVuZGVuY3lUYXNrcyA9IGF3YWl0IHJlc29sdmVEZXBlbmRlbmN5VGFza3ModGFzaywgYXJncy53b3Jrc3BhY2VGb2xkZXIsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl90YXNrc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHN0YXJ0TWFya2Vyc0J5VGVybWluYWxJbnN0YW5jZUlkID0gbmV3IE1hcDxudW1iZXIsIFJldHVyblR5cGU8SVRlcm1pbmFsSW5zdGFuY2VbJ3JlZ2lzdGVyTWFya2VyJ10+PigpO1xuXHRcdGNvbnN0IHN0YXJ0TWFya2Vyc0Rpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRmb3IgKGNvbnN0IHRlcm1pbmFsIG9mIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMpIHtcblx0XHRcdGNvbnN0IG1hcmtlciA9IHRlcm1pbmFsLnJlZ2lzdGVyTWFya2VyKCk7XG5cdFx0XHRzdGFydE1hcmtlcnNCeVRlcm1pbmFsSW5zdGFuY2VJZC5zZXQodGVybWluYWwuaW5zdGFuY2VJZCwgbWFya2VyKTtcblx0XHRcdGlmIChtYXJrZXIpIHtcblx0XHRcdFx0c3RhcnRNYXJrZXJzRGlzcG9zYWJsZVN0b3JlLmFkZChtYXJrZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmFjZVJlc3VsdCA9IGF3YWl0IFByb21pc2UucmFjZShbdGhpcy5fdGFza3NTZXJ2aWNlLnJ1bih0YXNrLCB1bmRlZmluZWQsIFRhc2tSdW5Tb3VyY2UuQ2hhdEFnZW50KSwgdGltZW91dCgzMDAwKV0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBJVGFza1N1bW1hcnkgfCB1bmRlZmluZWQgPSByYWNlUmVzdWx0ICYmIHR5cGVvZiByYWNlUmVzdWx0ID09PSAnb2JqZWN0JyA/IHJhY2VSZXN1bHQgYXMgSVRhc2tTdW1tYXJ5IDogdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCByZXNvdXJjZXMgPSB0aGlzLl90YXNrc1NlcnZpY2UuZ2V0VGVybWluYWxzRm9yVGFza3MoZGVwZW5kZW5jeVRhc2tzID8/IHRhc2spO1xuXHRcdFx0aWYgKCFyZXNvdXJjZXMgfHwgcmVzb3VyY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBgVGFzayBzdGFydGVkIGJ1dCBubyB0ZXJtaW5hbCB3YXMgZm91bmQgZm9yOiAke3Rhc2tMYWJlbH1gIH1dLCB0b29sUmVzdWx0TWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdjaGF0Lm5vVGVybWluYWwnLCAnVGFzayBzdGFydGVkIGJ1dCBubyB0ZXJtaW5hbCB3YXMgZm91bmQgZm9yOiBcXGB7MH1cXGAnLCB0YXNrTGFiZWwpKSB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGVybWluYWxzID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcy5maWx0ZXIodCA9PiByZXNvdXJjZXMuc29tZShyID0+IHIucGF0aCA9PT0gdC5yZXNvdXJjZS5wYXRoICYmIHIuc2NoZW1lID09PSB0LnJlc291cmNlLnNjaGVtZSkpO1xuXHRcdFx0aWYgKHRlcm1pbmFscy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogYFRhc2sgc3RhcnRlZCBidXQgbm8gdGVybWluYWwgd2FzIGZvdW5kIGZvcjogJHt0YXNrTGFiZWx9YCB9XSwgdG9vbFJlc3VsdE1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnY2hhdC5ub1Rlcm1pbmFsJywgJ1Rhc2sgc3RhcnRlZCBidXQgbm8gdGVybWluYWwgd2FzIGZvdW5kIGZvcjogXFxgezB9XFxgJywgdGFza0xhYmVsKSkgfTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRsZXQgdGVybWluYWxSZXN1bHRzOiBBd2FpdGVkPFJldHVyblR5cGU8dHlwZW9mIGNvbGxlY3RUZXJtaW5hbFJlc3VsdHM+PiA9IFtdO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGVybWluYWxSZXN1bHRzID0gYXdhaXQgY29sbGVjdFRlcm1pbmFsUmVzdWx0cyhcblx0XHRcdFx0XHR0ZXJtaW5hbHMsXG5cdFx0XHRcdFx0dGFzayxcblx0XHRcdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdFx0XHRpbnZvY2F0aW9uLmNvbnRleHQhLFxuXHRcdFx0XHRcdF9wcm9ncmVzcyxcblx0XHRcdFx0XHR0b2tlbixcblx0XHRcdFx0XHRzdG9yZSxcblx0XHRcdFx0XHQodGVybWluYWxUYXNrKSA9PiB0aGlzLl9pc1Rhc2tBY3RpdmUodGVybWluYWxUYXNrKSxcblx0XHRcdFx0XHRkZXBlbmRlbmN5VGFza3MsXG5cdFx0XHRcdFx0dGhpcy5fdGFza3NTZXJ2aWNlLFxuXHRcdFx0XHRcdHN0YXJ0TWFya2Vyc0J5VGVybWluYWxJbnN0YW5jZUlkXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHIgb2YgdGVybWluYWxSZXN1bHRzKSB7XG5cdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMj8uPFRhc2tUb29sRXZlbnQsIFRhc2tUb29sQ2xhc3NpZmljYXRpb24+KCdjb3BpbG90Q2hhdC5ydW5UYXNrVG9vbC5ydW4nLCB7XG5cdFx0XHRcdFx0dGFza0lkOiBhcmdzLmlkLFxuXHRcdFx0XHRcdGJ1ZmZlckxlbmd0aDogci5vdXRwdXQubGVuZ3RoID8/IDAsXG5cdFx0XHRcdFx0cG9sbER1cmF0aW9uTXM6IHIucG9sbER1cmF0aW9uTXMgPz8gMCxcblx0XHRcdFx0XHRpbnB1dFRvb2xNYW51YWxBY2NlcHRDb3VudDogci5pbnB1dFRvb2xNYW51YWxBY2NlcHRDb3VudCA/PyAwLFxuXHRcdFx0XHRcdGlucHV0VG9vbE1hbnVhbFJlamVjdENvdW50OiByLmlucHV0VG9vbE1hbnVhbFJlamVjdENvdW50ID8/IDAsXG5cdFx0XHRcdFx0aW5wdXRUb29sTWFudWFsQ2hhcnM6IHIuaW5wdXRUb29sTWFudWFsQ2hhcnMgPz8gMCxcblx0XHRcdFx0XHRpbnB1dFRvb2xNYW51YWxTaG93bkNvdW50OiByLmlucHV0VG9vbE1hbnVhbFNob3duQ291bnQgPz8gMCxcblx0XHRcdFx0XHRpbnB1dFRvb2xGcmVlRm9ybUlucHV0U2hvd25Db3VudDogci5pbnB1dFRvb2xGcmVlRm9ybUlucHV0U2hvd25Db3VudCA/PyAwLFxuXHRcdFx0XHRcdGlucHV0VG9vbEZyZWVGb3JtSW5wdXRDb3VudDogci5pbnB1dFRvb2xGcmVlRm9ybUlucHV0Q291bnQgPz8gMFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGV0YWlscyA9IHRlcm1pbmFsUmVzdWx0cy5tYXAociA9PiBgVGVybWluYWw6ICR7ci5uYW1lfVxcbk91dHB1dDpcXG4ke3Iub3V0cHV0fWApO1xuXHRcdFx0Y29uc3QgdW5pcXVlRGV0YWlscyA9IEFycmF5LmZyb20obmV3IFNldChkZXRhaWxzKSkuam9pbignXFxuXFxuJyk7XG5cdFx0XHRjb25zdCB0b29sUmVzdWx0RGV0YWlscyA9IHRvb2xSZXN1bHREZXRhaWxzRnJvbVJlc3BvbnNlKHRlcm1pbmFsUmVzdWx0cyk7XG5cdFx0XHRjb25zdCB0b29sUmVzdWx0TWVzc2FnZSA9IHRvb2xSZXN1bHRNZXNzYWdlRnJvbVJlc3BvbnNlKHJlc3VsdCwgdGFza0xhYmVsLCB0b29sUmVzdWx0RGV0YWlscywgdGVybWluYWxSZXN1bHRzLCB1bmRlZmluZWQsIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogdW5pcXVlRGV0YWlscyB9XSxcblx0XHRcdFx0dG9vbFJlc3VsdE1lc3NhZ2UsXG5cdFx0XHRcdHRvb2xSZXN1bHREZXRhaWxzXG5cdFx0XHR9O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzdGFydE1hcmtlcnNEaXNwb3NhYmxlU3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2lzVGFza0FjdGl2ZSh0YXNrOiBUYXNrKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgYnVzeVRhc2tzID0gYXdhaXQgdGhpcy5fdGFza3NTZXJ2aWNlLmdldEJ1c3lUYXNrcygpO1xuXHRcdHJldHVybiBidXN5VGFza3M/LnNvbWUodCA9PiB0YXNrc01hdGNoKHQsIHRhc2spKSA/PyBmYWxzZTtcblx0fVxuXG5cdGFzeW5jIHByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhcmdzID0gY29udGV4dC5wYXJhbWV0ZXJzIGFzIElSdW5UYXNrVG9vbElucHV0O1xuXHRcdGNvbnN0IHRhc2tEZWZpbml0aW9uID0gZ2V0VGFza0RlZmluaXRpb24oYXJncy5pZCk7XG5cblx0XHRjb25zdCB0YXNrID0gYXdhaXQgZ2V0VGFza0ZvclRvb2woYXJncy5pZCwgdGFza0RlZmluaXRpb24sIGFyZ3Mud29ya3NwYWNlRm9sZGVyLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5fdGFza3NTZXJ2aWNlLCB0cnVlKTtcblx0XHRpZiAoIXRhc2spIHtcblx0XHRcdHJldHVybiB7IGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2NoYXQudGFza05vdEZvdW5kJywgJ1Rhc2sgbm90IGZvdW5kOiBcXGB7MH1cXGAnLCBhcmdzLmlkKSkgfTtcblx0XHR9XG5cdFx0Y29uc3QgdGFza0xhYmVsID0gdGFzay5fbGFiZWw7XG5cdFx0Y29uc3QgYWN0aXZlVGFza3MgPSBhd2FpdCB0aGlzLl90YXNrc1NlcnZpY2UuZ2V0QWN0aXZlVGFza3MoKTtcblx0XHRpZiAodGFzayAmJiBhY3RpdmVUYXNrcy5pbmNsdWRlcyh0YXNrKSkge1xuXHRcdFx0cmV0dXJuIHsgaW52b2NhdGlvbk1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnY2hhdC50YXNrQWxyZWFkeUFjdGl2ZScsICdUaGUgdGFzayBpcyBhbHJlYWR5IHJ1bm5pbmcuJykpIH07XG5cdFx0fVxuXG5cdFx0aWYgKGF3YWl0IHRoaXMuX2lzVGFza0FjdGl2ZSh0YXNrKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnY2hhdC50YXNrSXNBbHJlYWR5UnVubmluZycsICdcXGB7MH1cXGAgaXMgYWxyZWFkeSBydW5uaW5nLicsIHRhc2tMYWJlbCkpLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2NoYXQudGFza1dhc0FscmVhZHlSdW5uaW5nJywgJ1xcYHswfVxcYCB3YXMgYWxyZWFkeSBydW5uaW5nLicsIHRhc2tMYWJlbCkpLFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdjaGF0LnJ1bm5pbmdUYXNrJywgJ1J1bm5pbmcgXFxgezB9XFxgJywgdGFza0xhYmVsKSksXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcodGFzaz8uY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQuc3RhcnRlZFRhc2snLCAnU3RhcnRlZCBcXGB7MH1cXGAnLCB0YXNrTGFiZWwpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQucmFuVGFzaycsICdSYW4gXFxgezB9XFxgJywgdGFza0xhYmVsKSksXG5cdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdGFza1xuXHRcdFx0XHQ/IHsgdGl0bGU6IGxvY2FsaXplKCdjaGF0LmFsbG93VGFza1J1blRpdGxlJywgJ0FsbG93IHRhc2sgcnVuPycpLCBtZXNzYWdlOiBsb2NhbGl6ZSgnY2hhdC5hbGxvd1Rhc2tSdW5Nc2cnLCAnQWxsb3cgdG8gcnVuIHRoZSB0YXNrIFxcYHswfVxcYD8nLCB0YXNrTGFiZWwpIH1cblx0XHRcdFx0OiB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBSdW5UYXNrVG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0aWQ6IFRlcm1pbmFsVG9vbElkLlJ1blRhc2ssXG5cdHRvb2xSZWZlcmVuY2VOYW1lOiAncnVuVGFzaycsXG5cdGxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM6IFsncnVuVGFza3MvcnVuVGFzayddLFxuXHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3J1bkluVGVybWluYWxUb29sLmRpc3BsYXlOYW1lJywgJ1J1biBUYXNrJyksXG5cdG1vZGVsRGVzY3JpcHRpb246IGBSdW5zIGEgVlMgQ29kZSB0YXNrLlxcblxcbi0gSWYgeW91IHNlZSB0aGF0IGFuIGFwcHJvcHJpYXRlIHRhc2sgZXhpc3RzIGZvciBidWlsZGluZyBvciBydW5uaW5nIGNvZGUsIHByZWZlciB0byB1c2UgdGhpcyB0b29sIHRvIHJ1biB0aGUgdGFzayBpbnN0ZWFkIG9mIHVzaW5nIHRoZSAke1Rlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWx9IHRvb2wuXFxuLSBNYWtlIHN1cmUgdGhhdCBhbnkgYXBwcm9wcmlhdGUgYnVpbGQgb3Igd2F0Y2ggdGFzayBpcyBydW5uaW5nIGJlZm9yZSB0cnlpbmcgdG8gcnVuIHRlc3RzIG9yIGV4ZWN1dGUgY29kZS5cXG4tIElmIHRoZSB1c2VyIGFza3MgdG8gcnVuIGEgdGFzaywgdXNlIHRoaXMgdG9vbCB0byBkbyBzby5gLFxuXHR1c2VyRGVzY3JpcHRpb246IGxvY2FsaXplKCdydW5JblRlcm1pbmFsVG9vbC51c2VyRGVzY3JpcHRpb24nLCAnUnVuIHRhc2tzIGluIHRoZSB3b3Jrc3BhY2UnKSxcblx0aWNvbjogQ29kaWNvbi50b29scyxcblx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0aW5wdXRTY2hlbWE6IHtcblx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0J3dvcmtzcGFjZUZvbGRlcic6IHtcblx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ1RoZSB3b3Jrc3BhY2UgZm9sZGVyIHBhdGggY29udGFpbmluZyB0aGUgdGFzaydcblx0XHRcdH0sXG5cdFx0XHQnaWQnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbic6ICdUaGUgdGFzayBJRCB0byBydW4uJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J3JlcXVpcmVkJzogW1xuXHRcdFx0J3dvcmtzcGFjZUZvbGRlcicsXG5cdFx0XHQnaWQnXG5cdFx0XVxuXHR9XG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFFeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBOEksc0JBQW9DO0FBQ2xMLFNBQVMsb0JBQXdDO0FBQ2pELFNBQVMscUJBQXFCO0FBQzlCLFNBQTRCLHdCQUF3QjtBQUNwRCxTQUFTLHdCQUF3QixtQkFBbUIsZ0JBQWdCLHdCQUF3QixrQkFBa0I7QUFDOUcsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0JBQStCLHFDQUFxQztBQUM3RSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLHNCQUFzQjtBQU94QixJQUFNLGNBQU4sTUFBdUM7QUFBQSxFQUU3QyxZQUNnQyxlQUNLLG1CQUNELGtCQUNLLHVCQUNBLHVCQUN2QztBQUw4QjtBQUNLO0FBQ0Q7QUFDSztBQUNBO0FBQUEsRUFDckM7QUFBQSxFQUVKLE1BQU0sT0FBTyxZQUE2QixjQUFtQyxXQUF5QixPQUFnRDtBQUNySixVQUFNLE9BQU8sV0FBVztBQUV4QixRQUFJLENBQUMsV0FBVyxTQUFTO0FBQ3hCLGFBQU8sRUFBRSxTQUFTLENBQUMsRUFBRSxNQUFNLFFBQVEsT0FBTyx3QkFBd0IsQ0FBQyxHQUFHLG1CQUFtQix3QkFBd0I7QUFBQSxJQUNsSDtBQUVBLFVBQU0saUJBQWlCLGtCQUFrQixLQUFLLEVBQUU7QUFDaEQsVUFBTSxPQUFPLE1BQU0sZUFBZSxLQUFLLElBQUksZ0JBQWdCLEtBQUssaUJBQWlCLEtBQUssdUJBQXVCLEtBQUssZUFBZSxJQUFJO0FBQ3JJLFFBQUksQ0FBQyxNQUFNO0FBQ1YsYUFBTyxFQUFFLFNBQVMsQ0FBQyxFQUFFLE1BQU0sUUFBUSxPQUFPLG1CQUFtQixLQUFLLEVBQUUsR0FB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
