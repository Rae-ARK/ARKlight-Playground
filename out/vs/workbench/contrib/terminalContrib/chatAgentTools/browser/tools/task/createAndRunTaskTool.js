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
import { collectTerminalResults, resolveDependencyTasks, tasksMatch } from "../../taskHelpers.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { VSBuffer } from "../../../../../../../base/common/buffer.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { toolResultDetailsFromResponse, toolResultMessageFromResponse } from "./taskHelpers.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { TerminalToolId } from "../toolIds.js";
let CreateAndRunTaskTool = class {
  constructor(_tasksService, _telemetryService, _terminalService, _fileService, _configurationService, _instantiationService) {
    this._tasksService = _tasksService;
    this._telemetryService = _telemetryService;
    this._terminalService = _terminalService;
    this._fileService = _fileService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const args = invocation.parameters;
    if (!invocation.context) {
      return { content: [{ kind: "text", value: `No invocation context` }], toolResultMessage: `No invocation context` };
    }
    const tasksJsonUri = URI.file(args.workspaceFolder).with({ path: `${args.workspaceFolder}/.vscode/tasks.json` });
    const exists = await this._fileService.exists(tasksJsonUri);
    const newTask = {
      label: args.task.label,
      type: args.task.type,
      command: args.task.command,
      args: args.task.args,
      isBackground: args.task.isBackground,
      problemMatcher: args.task.problemMatcher,
      group: args.task.group
    };
    const tasksJsonContent = JSON.stringify({
      version: "2.0.0",
      tasks: [newTask]
    }, null, "	");
    if (!exists) {
      await this._fileService.createFile(tasksJsonUri, VSBuffer.fromString(tasksJsonContent), { overwrite: true });
      _progress.report({ message: "Created tasks.json file" });
    } else {
      const content = await this._fileService.readFile(tasksJsonUri);
      const tasksJson = JSON.parse(content.value.toString());
      tasksJson.tasks.push(newTask);
      await this._fileService.writeFile(tasksJsonUri, VSBuffer.fromString(JSON.stringify(tasksJson, null, "	")));
      _progress.report({ message: "Updated tasks.json file" });
    }
    _progress.report({ message: new MarkdownString(localize("copilotChat.fetchingTask", "Resolving the task")) });
    let task;
    const start = Date.now();
    while (Date.now() - start < 5e3 && !token.isCancellationRequested) {
      task = (await this._tasksService.tasks())?.find((t) => t._label === args.task.label);
      if (task) {
        break;
      }
      await timeout(100);
    }
    if (!task) {
      return { content: [{ kind: "text", value: `Task not found: ${args.task.label}` }], toolResultMessage: new MarkdownString(localize("copilotChat.taskNotFound", "Task not found: `{0}`", args.task.label)) };
    }
    const preRunMarkersStore = new DisposableStore();
    let result;
    let terminalResults = [];
    try {
      const dependencyTasks = await resolveDependencyTasks(task, args.workspaceFolder, this._configurationService, this._tasksService);
      const startMarkersByTerminalInstanceId = /* @__PURE__ */ new Map();
      for (const terminal of this._terminalService.instances) {
        const marker = terminal.registerMarker();
        startMarkersByTerminalInstanceId.set(terminal.instanceId, marker);
        if (marker) {
          preRunMarkersStore.add(marker);
        }
      }
      _progress.report({ message: new MarkdownString(localize("copilotChat.runningTask", "Running task `{0}`", args.task.label)) });
      const raceResult = await Promise.race([this._tasksService.run(task, void 0, TaskRunSource.ChatAgent), timeout(3e3)]);
      result = raceResult && typeof raceResult === "object" ? raceResult : void 0;
      const resources = this._tasksService.getTerminalsForTasks(dependencyTasks ?? task);
      const terminals = resources?.map((resource) => this._terminalService.instances.find((t) => t.resource.path === resource?.path && t.resource.scheme === resource.scheme)).filter(Boolean);
      if (!terminals || terminals.length === 0) {
        return { content: [{ kind: "text", value: `Task started but no terminal was found for: ${args.task.label}` }], toolResultMessage: new MarkdownString(localize("copilotChat.noTerminal", "Task started but no terminal was found for: `{0}`", args.task.label)) };
      }
      const store = new DisposableStore();
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
    } finally {
      preRunMarkersStore.dispose();
    }
    for (const r of terminalResults) {
      this._telemetryService.publicLog2?.("copilotChat.runTaskTool.createAndRunTask", {
        taskId: args.task.label,
        bufferLength: r.output.length ?? 0,
        pollDurationMs: r.pollDurationMs ?? 0,
        inputToolManualAcceptCount: r.inputToolManualAcceptCount ?? 0,
        inputToolManualRejectCount: r.inputToolManualRejectCount ?? 0,
        inputToolManualChars: r.inputToolManualChars ?? 0,
        inputToolManualShownCount: r.inputToolManualShownCount ?? 0,
        inputToolFreeFormInputCount: r.inputToolFreeFormInputCount ?? 0,
        inputToolFreeFormInputShownCount: r.inputToolFreeFormInputShownCount ?? 0
      });
    }
    const details = terminalResults.map((r) => `Terminal: ${r.name}
Output:
${r.output}`);
    const uniqueDetails = Array.from(new Set(details)).join("\n\n");
    const toolResultDetails = toolResultDetailsFromResponse(terminalResults);
    const toolResultMessage = toolResultMessageFromResponse(result, args.task.label, toolResultDetails, terminalResults, void 0, task.configurationProperties.isBackground);
    return {
      content: [{ kind: "text", value: uniqueDetails }],
      toolResultMessage,
      toolResultDetails
    };
  }
  async _isTaskActive(task) {
    const busyTasks = await this._tasksService.getBusyTasks();
    return busyTasks?.some((t) => tasksMatch(t, task)) ?? false;
  }
  async prepareToolInvocation(context, token) {
    const args = context.parameters;
    const task = args.task;
    const allTasks = await this._tasksService.tasks();
    if (allTasks?.find((t) => t._label === task.label)) {
      return {
        invocationMessage: new MarkdownString(localize("taskExists", "Task `{0}` already exists.", task.label)),
        pastTenseMessage: new MarkdownString(localize("taskExistsPast", "Task `{0}` already exists.", task.label)),
        confirmationMessages: void 0
      };
    }
    const activeTasks = await this._tasksService.getActiveTasks();
    if (activeTasks.find((t) => t._label === task.label)) {
      return {
        invocationMessage: new MarkdownString(localize("alreadyRunning", "Task `{0}` is already running.", task.label)),
        pastTenseMessage: new MarkdownString(localize("alreadyRunning", "Task `{0}` is already running.", task.label)),
        confirmationMessages: void 0
      };
    }
    return {
      invocationMessage: new MarkdownString(localize("createdTask", "Created task `{0}`", task.label)),
      pastTenseMessage: new MarkdownString(localize("createdTaskPast", "Created task `{0}`", task.label)),
      confirmationMessages: {
        title: localize("allowTaskCreationExecution", "Allow task creation and execution?"),
        message: new MarkdownString(
          localize(
            "createTask",
            "A task `{0}` with command `{1}`{2} will be created.",
            task.label,
            task.command,
            task.args?.length ? ` and args \`${task.args.join(" ")}\`` : ""
          )
        )
      }
    };
  }
};
CreateAndRunTaskTool = __decorateClass([
  __decorateParam(0, ITaskService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, ITerminalService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService)
], CreateAndRunTaskTool);
const CreateAndRunTaskToolData = {
  id: TerminalToolId.CreateAndRunTask,
  toolReferenceName: "createAndRunTask",
  legacyToolReferenceFullNames: ["runTasks/createAndRunTask"],
  displayName: localize("createAndRunTask.displayName", "Create and run Task"),
  modelDescription: "Creates and runs a build, run, or custom task for the workspace by generating or adding to a tasks.json file based on the project structure (such as package.json or README.md). If the user asks to build, run, launch and they have no tasks.json file, use this tool. If they ask to create or add a task, use this tool.",
  userDescription: localize("createAndRunTask.userDescription", "Create and run a task in the workspace"),
  source: ToolDataSource.Internal,
  inputSchema: {
    "type": "object",
    "properties": {
      "workspaceFolder": {
        "type": "string",
        "description": "The absolute path of the workspace folder where the tasks.json file will be created."
      },
      "task": {
        "type": "object",
        "description": "The task to add to the new tasks.json file.",
        "properties": {
          "label": {
            "type": "string",
            "description": "The label of the task."
          },
          "type": {
            "type": "string",
            "description": `The type of the task. The only supported value is 'shell'.`,
            "enum": [
              "shell"
            ]
          },
          "command": {
            "type": "string",
            "description": "The shell command to run for the task. Use this to specify commands for building or running the application."
          },
          "args": {
            "type": "array",
            "description": "The arguments to pass to the command.",
            "items": {
              "type": "string"
            }
          },
          "isBackground": {
            "type": "boolean",
            "description": "Whether the task runs in the background without blocking the UI or other tasks. Set to true for long-running processes like watch tasks or servers that should continue executing without requiring user attention. When false, the task will block the terminal until completion."
          },
          "problemMatcher": {
            "type": "array",
            "description": `The problem matcher to use to parse task output for errors and warnings. Can be a predefined matcher like '$tsc' (TypeScript), '$eslint - stylish', '$gcc', etc., or a custom pattern defined in tasks.json. This helps VS Code display errors in the Problems panel and enables quick navigation to error locations.`,
            "items": {
              "type": "string"
            }
          },
          "group": {
            "type": "string",
            "description": "The group to which the task belongs."
          }
        },
        "required": [
          "label",
          "type",
          "command"
        ]
      }
    },
    "required": [
      "task",
      "workspaceFolder"
    ]
  }
};
export {
  CreateAndRunTaskTool,
  CreateAndRunTaskToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL3Rhc2svY3JlYXRlQW5kUnVuVGFza1Rvb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBDb3VudFRva2Vuc0NhbGxiYWNrLCBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgSVRvb2xEYXRhLCBJVG9vbEltcGwsIElUb29sSW52b2NhdGlvbiwgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBJVG9vbFJlc3VsdCwgVG9vbERhdGFTb3VyY2UsIFRvb2xQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRhc2tTZXJ2aWNlLCBJVGFza1N1bW1hcnksIFRhc2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90YXNrcy9jb21tb24vdGFza1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGFza1J1blNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rhc2tzL2NvbW1vbi90YXNrcy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgY29sbGVjdFRlcm1pbmFsUmVzdWx0cywgSUNvbmZpZ3VyZWRUYXNrLCByZXNvbHZlRGVwZW5kZW5jeVRhc2tzLCB0YXNrc01hdGNoIH0gZnJvbSAnLi4vLi4vdGFza0hlbHBlcnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgdG9vbFJlc3VsdERldGFpbHNGcm9tUmVzcG9uc2UsIHRvb2xSZXN1bHRNZXNzYWdlRnJvbVJlc3BvbnNlIH0gZnJvbSAnLi90YXNrSGVscGVycy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUYXNrVG9vbEV2ZW50LCBUYXNrVG9vbENsYXNzaWZpY2F0aW9uIH0gZnJvbSAnLi90YXNrVG9vbHNUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgVGVybWluYWxUb29sSWQgfSBmcm9tICcuLi90b29sSWRzLmpzJztcblxuaW50ZXJmYWNlIElDcmVhdGVBbmRSdW5UYXNrVG9vbElucHV0IHtcblx0d29ya3NwYWNlRm9sZGVyOiBzdHJpbmc7XG5cdHRhc2s6IHtcblx0XHRsYWJlbDogc3RyaW5nO1xuXHRcdHR5cGU6IHN0cmluZztcblx0XHRjb21tYW5kOiBzdHJpbmc7XG5cdFx0YXJncz86IHN0cmluZ1tdO1xuXHRcdGlzQmFja2dyb3VuZD86IGJvb2xlYW47XG5cdFx0cHJvYmxlbU1hdGNoZXI/OiBzdHJpbmdbXTtcblx0XHRncm91cD86IHN0cmluZztcblx0fTtcbn1cblxuZXhwb3J0IGNsYXNzIENyZWF0ZUFuZFJ1blRhc2tUb29sIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRhc2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rhc2tzU2VydmljZTogSVRhc2tTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7IH1cblxuXHRhc3luYyBpbnZva2UoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBfY291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2ssIF9wcm9ncmVzczogVG9vbFByb2dyZXNzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3QgYXJncyA9IGludm9jYXRpb24ucGFyYW1ldGVycyBhcyBJQ3JlYXRlQW5kUnVuVGFza1Rvb2xJbnB1dDtcblxuXHRcdGlmICghaW52b2NhdGlvbi5jb250ZXh0KSB7XG5cdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBgTm8gaW52b2NhdGlvbiBjb250ZXh0YCB9XSwgdG9vbFJlc3VsdE1lc3NhZ2U6IGBObyBpbnZvY2F0aW9uIGNvbnRleHRgIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFza3NKc29uVXJpID0gVVJJLmZpbGUoYXJncy53b3Jrc3BhY2VGb2xkZXIpLndpdGgoeyBwYXRoOiBgJHthcmdzLndvcmtzcGFjZUZvbGRlcn0vLnZzY29kZS90YXNrcy5qc29uYCB9KTtcblx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHModGFza3NKc29uVXJpKTtcblxuXHRcdGNvbnN0IG5ld1Rhc2s6IElDb25maWd1cmVkVGFzayA9IHtcblx0XHRcdGxhYmVsOiBhcmdzLnRhc2subGFiZWwsXG5cdFx0XHR0eXBlOiBhcmdzLnRhc2sudHlwZSxcblx0XHRcdGNvbW1hbmQ6IGFyZ3MudGFzay5jb21tYW5kLFxuXHRcdFx0YXJnczogYXJncy50YXNrLmFyZ3MsXG5cdFx0XHRpc0JhY2tncm91bmQ6IGFyZ3MudGFzay5pc0JhY2tncm91bmQsXG5cdFx0XHRwcm9ibGVtTWF0Y2hlcjogYXJncy50YXNrLnByb2JsZW1NYXRjaGVyLFxuXHRcdFx0Z3JvdXA6IGFyZ3MudGFzay5ncm91cFxuXHRcdH07XG5cblx0XHRjb25zdCB0YXNrc0pzb25Db250ZW50ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0dmVyc2lvbjogJzIuMC4wJyxcblx0XHRcdHRhc2tzOiBbbmV3VGFza11cblx0XHR9LCBudWxsLCAnXFx0Jyk7XG5cdFx0aWYgKCFleGlzdHMpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmNyZWF0ZUZpbGUodGFza3NKc29uVXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKHRhc2tzSnNvbkNvbnRlbnQpLCB7IG92ZXJ3cml0ZTogdHJ1ZSB9KTtcblx0XHRcdF9wcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiAnQ3JlYXRlZCB0YXNrcy5qc29uIGZpbGUnIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBhZGQgdG8gdGhlIGV4aXN0aW5nIHRhc2tzLmpzb24gZmlsZVxuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRhc2tzSnNvblVyaSk7XG5cdFx0XHRjb25zdCB0YXNrc0pzb24gPSBKU09OLnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0XHR0YXNrc0pzb24udGFza3MucHVzaChuZXdUYXNrKTtcblx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0YXNrc0pzb25VcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkodGFza3NKc29uLCBudWxsLCAnXFx0JykpKTtcblx0XHRcdF9wcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiAnVXBkYXRlZCB0YXNrcy5qc29uIGZpbGUnIH0pO1xuXHRcdH1cblx0XHRfcHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdjb3BpbG90Q2hhdC5mZXRjaGluZ1Rhc2snLCAnUmVzb2x2aW5nIHRoZSB0YXNrJykpIH0pO1xuXG5cdFx0bGV0IHRhc2s6IFRhc2sgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnQgPCA1MDAwICYmICF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGFzayA9IChhd2FpdCB0aGlzLl90YXNrc1NlcnZpY2UudGFza3MoKSk/LmZpbmQodCA9PiB0Ll9sYWJlbCA9PT0gYXJncy50YXNrLmxhYmVsKTtcblx0XHRcdGlmICh0YXNrKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGltZW91dCgxMDApO1xuXHRcdH1cblx0XHRpZiAoIXRhc2spIHtcblx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IGBUYXNrIG5vdCBmb3VuZDogJHthcmdzLnRhc2subGFiZWx9YCB9XSwgdG9vbFJlc3VsdE1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnY29waWxvdENoYXQudGFza05vdEZvdW5kJywgJ1Rhc2sgbm90IGZvdW5kOiBgezB9YCcsIGFyZ3MudGFzay5sYWJlbCkpIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJlUnVuTWFya2Vyc1N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCByZXN1bHQ6IElUYXNrU3VtbWFyeSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgdGVybWluYWxSZXN1bHRzOiBBd2FpdGVkPFJldHVyblR5cGU8dHlwZW9mIGNvbGxlY3RUZXJtaW5hbFJlc3VsdHM+PiA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkZXBlbmRlbmN5VGFza3MgPSBhd2FpdCByZXNvbHZlRGVwZW5kZW5jeVRhc2tzKHRhc2ssIGFyZ3Mud29ya3NwYWNlRm9sZGVyLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5fdGFza3NTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHN0YXJ0TWFya2Vyc0J5VGVybWluYWxJbnN0YW5jZUlkID0gbmV3IE1hcDxudW1iZXIsIFJldHVyblR5cGU8SVRlcm1pbmFsSW5zdGFuY2VbJ3JlZ2lzdGVyTWFya2VyJ10+PigpO1xuXHRcdFx0Zm9yIChjb25zdCB0ZXJtaW5hbCBvZiB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuaW5zdGFuY2VzKSB7XG5cdFx0XHRcdGNvbnN0IG1hcmtlciA9IHRlcm1pbmFsLnJlZ2lzdGVyTWFya2VyKCk7XG5cdFx0XHRcdHN0YXJ0TWFya2Vyc0J5VGVybWluYWxJbnN0YW5jZUlkLnNldCh0ZXJtaW5hbC5pbnN0YW5jZUlkLCBtYXJrZXIpO1xuXHRcdFx0XHRpZiAobWFya2VyKSB7XG5cdFx0XHRcdFx0cHJlUnVuTWFya2Vyc1N0b3JlLmFkZChtYXJrZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdF9wcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2NvcGlsb3RDaGF0LnJ1bm5pbmdUYXNrJywgJ1J1bm5pbmcgdGFzayBgezB9YCcsIGFyZ3MudGFzay5sYWJlbCkpIH0pO1xuXHRcdFx0Y29uc3QgcmFjZVJlc3VsdCA9IGF3YWl0IFByb21pc2UucmFjZShbdGhpcy5fdGFza3NTZXJ2aWNlLnJ1bih0YXNrLCB1bmRlZmluZWQsIFRhc2tSdW5Tb3VyY2UuQ2hhdEFnZW50KSwgdGltZW91dCgzMDAwKV0pO1xuXHRcdFx0cmVzdWx0ID0gcmFjZVJlc3VsdCAmJiB0eXBlb2YgcmFjZVJlc3VsdCA9PT0gJ29iamVjdCcgPyByYWNlUmVzdWx0IGFzIElUYXNrU3VtbWFyeSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgcmVzb3VyY2VzID0gdGhpcy5fdGFza3NTZXJ2aWNlLmdldFRlcm1pbmFsc0ZvclRhc2tzKGRlcGVuZGVuY3lUYXNrcyA/PyB0YXNrKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFscyA9IHJlc291cmNlcz8ubWFwKHJlc291cmNlID0+IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMuZmluZCh0ID0+IHQucmVzb3VyY2UucGF0aCA9PT0gcmVzb3VyY2U/LnBhdGggJiYgdC5yZXNvdXJjZS5zY2hlbWUgPT09IHJlc291cmNlLnNjaGVtZSkpLmZpbHRlcihCb29sZWFuKSBhcyBJVGVybWluYWxJbnN0YW5jZVtdO1xuXHRcdFx0aWYgKCF0ZXJtaW5hbHMgfHwgdGVybWluYWxzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBgVGFzayBzdGFydGVkIGJ1dCBubyB0ZXJtaW5hbCB3YXMgZm91bmQgZm9yOiAke2FyZ3MudGFzay5sYWJlbH1gIH1dLCB0b29sUmVzdWx0TWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdjb3BpbG90Q2hhdC5ub1Rlcm1pbmFsJywgJ1Rhc2sgc3RhcnRlZCBidXQgbm8gdGVybWluYWwgd2FzIGZvdW5kIGZvcjogYHswfWAnLCBhcmdzLnRhc2subGFiZWwpKSB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0ZXJtaW5hbFJlc3VsdHMgPSBhd2FpdCBjb2xsZWN0VGVybWluYWxSZXN1bHRzKFxuXHRcdFx0XHRcdHRlcm1pbmFscyxcblx0XHRcdFx0XHR0YXNrLFxuXHRcdFx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRcdGludm9jYXRpb24uY29udGV4dCEsXG5cdFx0XHRcdFx0X3Byb2dyZXNzLFxuXHRcdFx0XHRcdHRva2VuLFxuXHRcdFx0XHRcdHN0b3JlLFxuXHRcdFx0XHRcdCh0ZXJtaW5hbFRhc2spID0+IHRoaXMuX2lzVGFza0FjdGl2ZSh0ZXJtaW5hbFRhc2spLFxuXHRcdFx0XHRcdGRlcGVuZGVuY3lUYXNrcyxcblx0XHRcdFx0XHR0aGlzLl90YXNrc1NlcnZpY2UsXG5cdFx0XHRcdFx0c3RhcnRNYXJrZXJzQnlUZXJtaW5hbEluc3RhbmNlSWRcblx0XHRcdFx0KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cHJlUnVuTWFya2Vyc1N0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCByIG9mIHRlcm1pbmFsUmVzdWx0cykge1xuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPy48VGFza1Rvb2xFdmVudCwgVGFza1Rvb2xDbGFzc2lmaWNhdGlvbj4oJ2NvcGlsb3RDaGF0LnJ1blRhc2tUb29sLmNyZWF0ZUFuZFJ1blRhc2snLCB7XG5cdFx0XHRcdHRhc2tJZDogYXJncy50YXNrLmxhYmVsLFxuXHRcdFx0XHRidWZmZXJMZW5ndGg6IHIub3V0cHV0Lmxlbmd0aCA/PyAwLFxuXHRcdFx0XHRwb2xsRHVyYXRpb25Nczogci5wb2xsRHVyYXRpb25NcyA/PyAwLFxuXHRcdFx0XHRpbnB1dFRvb2xNYW51YWxBY2NlcHRDb3VudDogci5pbnB1dFRvb2xNYW51YWxBY2NlcHRDb3VudCA/PyAwLFxuXHRcdFx0XHRpbnB1dFRvb2xNYW51YWxSZWplY3RDb3VudDogci5pbnB1dFRvb2xNYW51YWxSZWplY3RDb3VudCA/PyAwLFxuXHRcdFx0XHRpbnB1dFRvb2xNYW51YWxDaGFyczogci5pbnB1dFRvb2xNYW51YWxDaGFycyA/PyAwLFxuXHRcdFx0XHRpbnB1dFRvb2xNYW51YWxTaG93bkNvdW50OiByLmlucHV0VG9vbE1hbnVhbFNob3duQ291bnQgPz8gMCxcblx0XHRcdFx0aW5wdXRUb29sRnJlZUZvcm1JbnB1dENvdW50OiByLmlucHV0VG9vbEZyZWVGb3JtSW5wdXRDb3VudCA/PyAwLFxuXHRcdFx0XHRpbnB1dFRvb2xGcmVlRm9ybUlucHV0U2hvd25Db3VudDogci5pbnB1dFRvb2xGcmVlRm9ybUlucHV0U2hvd25Db3VudCA/PyAwXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBkZXRhaWxzID0gdGVybWluYWxSZXN1bHRzLm1hcChyID0+IGBUZXJtaW5hbDogJHtyLm5hbWV9XFxuT3V0cHV0OlxcbiR7ci5vdXRwdXR9YCk7XG5cdFx0Y29uc3QgdW5pcXVlRGV0YWlscyA9IEFycmF5LmZyb20obmV3IFNldChkZXRhaWxzKSkuam9pbignXFxuXFxuJyk7XG5cdFx0Y29uc3QgdG9vbFJlc3VsdERldGFpbHMgPSB0b29sUmVzdWx0RGV0YWlsc0Zyb21SZXNwb25zZSh0ZXJtaW5hbFJlc3VsdHMpO1xuXHRcdGNvbnN0IHRvb2xSZXN1bHRNZXNzYWdlID0gdG9vbFJlc3VsdE1lc3NhZ2VGcm9tUmVzcG9uc2UocmVzdWx0LCBhcmdzLnRhc2subGFiZWwsIHRvb2xSZXN1bHREZXRhaWxzLCB0ZXJtaW5hbFJlc3VsdHMsIHVuZGVmaW5lZCwgdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiB1bmlxdWVEZXRhaWxzIH1dLFxuXHRcdFx0dG9vbFJlc3VsdE1lc3NhZ2UsXG5cdFx0XHR0b29sUmVzdWx0RGV0YWlsc1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pc1Rhc2tBY3RpdmUodGFzazogVGFzayk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGJ1c3lUYXNrcyA9IGF3YWl0IHRoaXMuX3Rhc2tzU2VydmljZS5nZXRCdXN5VGFza3MoKTtcblx0XHRyZXR1cm4gYnVzeVRhc2tzPy5zb21lKHQgPT4gdGFza3NNYXRjaCh0LCB0YXNrKSkgPz8gZmFsc2U7XG5cdH1cblxuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYXJncyA9IGNvbnRleHQucGFyYW1ldGVycyBhcyBJQ3JlYXRlQW5kUnVuVGFza1Rvb2xJbnB1dDtcblx0XHRjb25zdCB0YXNrID0gYXJncy50YXNrO1xuXG5cdFx0Y29uc3QgYWxsVGFza3MgPSBhd2FpdCB0aGlzLl90YXNrc1NlcnZpY2UudGFza3MoKTtcblx0XHRpZiAoYWxsVGFza3M/LmZpbmQodCA9PiB0Ll9sYWJlbCA9PT0gdGFzay5sYWJlbCkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3Rhc2tFeGlzdHMnLCAnVGFzayBcXGB7MH1cXGAgYWxyZWFkeSBleGlzdHMuJywgdGFzay5sYWJlbCkpLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3Rhc2tFeGlzdHNQYXN0JywgJ1Rhc2sgXFxgezB9XFxgIGFscmVhZHkgZXhpc3RzLicsIHRhc2subGFiZWwpKSxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVUYXNrcyA9IGF3YWl0IHRoaXMuX3Rhc2tzU2VydmljZS5nZXRBY3RpdmVUYXNrcygpO1xuXHRcdGlmIChhY3RpdmVUYXNrcy5maW5kKHQgPT4gdC5fbGFiZWwgPT09IHRhc2subGFiZWwpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdhbHJlYWR5UnVubmluZycsICdUYXNrIFxcYHswfVxcYCBpcyBhbHJlYWR5IHJ1bm5pbmcuJywgdGFzay5sYWJlbCkpLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2FscmVhZHlSdW5uaW5nJywgJ1Rhc2sgXFxgezB9XFxgIGlzIGFscmVhZHkgcnVubmluZy4nLCB0YXNrLmxhYmVsKSksXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB1bmRlZmluZWRcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2NyZWF0ZWRUYXNrJywgJ0NyZWF0ZWQgdGFzayBcXGB7MH1cXGAnLCB0YXNrLmxhYmVsKSksXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2NyZWF0ZWRUYXNrUGFzdCcsICdDcmVhdGVkIHRhc2sgXFxgezB9XFxgJywgdGFzay5sYWJlbCkpLFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHtcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhbGxvd1Rhc2tDcmVhdGlvbkV4ZWN1dGlvbicsICdBbGxvdyB0YXNrIGNyZWF0aW9uIGFuZCBleGVjdXRpb24/JyksXG5cdFx0XHRcdG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0XHRcdCdjcmVhdGVUYXNrJyxcblx0XHRcdFx0XHRcdCdBIHRhc2sgXFxgezB9XFxgIHdpdGggY29tbWFuZCBcXGB7MX1cXGB7Mn0gd2lsbCBiZSBjcmVhdGVkLicsXG5cdFx0XHRcdFx0XHR0YXNrLmxhYmVsLFxuXHRcdFx0XHRcdFx0dGFzay5jb21tYW5kLFxuXHRcdFx0XHRcdFx0dGFzay5hcmdzPy5sZW5ndGggPyBgIGFuZCBhcmdzIFxcYCR7dGFzay5hcmdzLmpvaW4oJyAnKX1cXGBgIDogJydcblx0XHRcdFx0XHQpXG5cdFx0XHRcdClcblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBDcmVhdGVBbmRSdW5UYXNrVG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0aWQ6IFRlcm1pbmFsVG9vbElkLkNyZWF0ZUFuZFJ1blRhc2ssXG5cdHRvb2xSZWZlcmVuY2VOYW1lOiAnY3JlYXRlQW5kUnVuVGFzaycsXG5cdGxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM6IFsncnVuVGFza3MvY3JlYXRlQW5kUnVuVGFzayddLFxuXHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ2NyZWF0ZUFuZFJ1blRhc2suZGlzcGxheU5hbWUnLCAnQ3JlYXRlIGFuZCBydW4gVGFzaycpLFxuXHRtb2RlbERlc2NyaXB0aW9uOiAnQ3JlYXRlcyBhbmQgcnVucyBhIGJ1aWxkLCBydW4sIG9yIGN1c3RvbSB0YXNrIGZvciB0aGUgd29ya3NwYWNlIGJ5IGdlbmVyYXRpbmcgb3IgYWRkaW5nIHRvIGEgdGFza3MuanNvbiBmaWxlIGJhc2VkIG9uIHRoZSBwcm9qZWN0IHN0cnVjdHVyZSAoc3VjaCBhcyBwYWNrYWdlLmpzb24gb3IgUkVBRE1FLm1kKS4gSWYgdGhlIHVzZXIgYXNrcyB0byBidWlsZCwgcnVuLCBsYXVuY2ggYW5kIHRoZXkgaGF2ZSBubyB0YXNrcy5qc29uIGZpbGUsIHVzZSB0aGlzIHRvb2wuIElmIHRoZXkgYXNrIHRvIGNyZWF0ZSBvciBhZGQgYSB0YXNrLCB1c2UgdGhpcyB0b29sLicsXG5cdHVzZXJEZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NyZWF0ZUFuZFJ1blRhc2sudXNlckRlc2NyaXB0aW9uJywgXCJDcmVhdGUgYW5kIHJ1biBhIHRhc2sgaW4gdGhlIHdvcmtzcGFjZVwiKSxcblx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0aW5wdXRTY2hlbWE6IHtcblx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0J3dvcmtzcGFjZUZvbGRlcic6IHtcblx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ1RoZSBhYnNvbHV0ZSBwYXRoIG9mIHRoZSB3b3Jrc3BhY2UgZm9sZGVyIHdoZXJlIHRoZSB0YXNrcy5qc29uIGZpbGUgd2lsbCBiZSBjcmVhdGVkLidcblx0XHRcdH0sXG5cdFx0XHQndGFzayc6IHtcblx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ1RoZSB0YXNrIHRvIGFkZCB0byB0aGUgbmV3IHRhc2tzLmpzb24gZmlsZS4nLFxuXHRcdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0XHQnbGFiZWwnOiB7XG5cdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ1RoZSBsYWJlbCBvZiB0aGUgdGFzay4nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQndHlwZSc6IHtcblx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBgVGhlIHR5cGUgb2YgdGhlIHRhc2suIFRoZSBvbmx5IHN1cHBvcnRlZCB2YWx1ZSBpcyAnc2hlbGwnLmAsXG5cdFx0XHRcdFx0XHQnZW51bSc6IFtcblx0XHRcdFx0XHRcdFx0J3NoZWxsJ1xuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J2NvbW1hbmQnOiB7XG5cdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ1RoZSBzaGVsbCBjb21tYW5kIHRvIHJ1biBmb3IgdGhlIHRhc2suIFVzZSB0aGlzIHRvIHNwZWNpZnkgY29tbWFuZHMgZm9yIGJ1aWxkaW5nIG9yIHJ1bm5pbmcgdGhlIGFwcGxpY2F0aW9uLidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdhcmdzJzoge1xuXHRcdFx0XHRcdFx0J3R5cGUnOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ1RoZSBhcmd1bWVudHMgdG8gcGFzcyB0byB0aGUgY29tbWFuZC4nLFxuXHRcdFx0XHRcdFx0J2l0ZW1zJzoge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnaXNCYWNrZ3JvdW5kJzoge1xuXHRcdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnV2hldGhlciB0aGUgdGFzayBydW5zIGluIHRoZSBiYWNrZ3JvdW5kIHdpdGhvdXQgYmxvY2tpbmcgdGhlIFVJIG9yIG90aGVyIHRhc2tzLiBTZXQgdG8gdHJ1ZSBmb3IgbG9uZy1ydW5uaW5nIHByb2Nlc3NlcyBsaWtlIHdhdGNoIHRhc2tzIG9yIHNlcnZlcnMgdGhhdCBzaG91bGQgY29udGludWUgZXhlY3V0aW5nIHdpdGhvdXQgcmVxdWlyaW5nIHVzZXIgYXR0ZW50aW9uLiBXaGVuIGZhbHNlLCB0aGUgdGFzayB3aWxsIGJsb2NrIHRoZSB0ZXJtaW5hbCB1bnRpbCBjb21wbGV0aW9uLidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdwcm9ibGVtTWF0Y2hlcic6IHtcblx0XHRcdFx0XHRcdCd0eXBlJzogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGBUaGUgcHJvYmxlbSBtYXRjaGVyIHRvIHVzZSB0byBwYXJzZSB0YXNrIG91dHB1dCBmb3IgZXJyb3JzIGFuZCB3YXJuaW5ncy4gQ2FuIGJlIGEgcHJlZGVmaW5lZCBtYXRjaGVyIGxpa2UgJyR0c2MnIChUeXBlU2NyaXB0KSwgJyRlc2xpbnQgLSBzdHlsaXNoJywgJyRnY2MnLCBldGMuLCBvciBhIGN1c3RvbSBwYXR0ZXJuIGRlZmluZWQgaW4gdGFza3MuanNvbi4gVGhpcyBoZWxwcyBWUyBDb2RlIGRpc3BsYXkgZXJyb3JzIGluIHRoZSBQcm9ibGVtcyBwYW5lbCBhbmQgZW5hYmxlcyBxdWljayBuYXZpZ2F0aW9uIHRvIGVycm9yIGxvY2F0aW9ucy5gLFxuXHRcdFx0XHRcdFx0J2l0ZW1zJzoge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnZ3JvdXAnOiB7XG5cdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ1RoZSBncm91cCB0byB3aGljaCB0aGUgdGFzayBiZWxvbmdzLidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdyZXF1aXJlZCc6IFtcblx0XHRcdFx0XHQnbGFiZWwnLFxuXHRcdFx0XHRcdCd0eXBlJyxcblx0XHRcdFx0XHQnY29tbWFuZCdcblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J3JlcXVpcmVkJzogW1xuXHRcdFx0J3Rhc2snLFxuXHRcdFx0J3dvcmtzcGFjZUZvbGRlcidcblx0XHRdXG5cdH0sXG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFFeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBOEksc0JBQW9DO0FBQ2xMLFNBQVMsb0JBQXdDO0FBQ2pELFNBQVMscUJBQXFCO0FBQzlCLFNBQTRCLHdCQUF3QjtBQUNwRCxTQUFTLHdCQUF5Qyx3QkFBd0Isa0JBQWtCO0FBQzVGLFNBQVMsc0JBQXNC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
