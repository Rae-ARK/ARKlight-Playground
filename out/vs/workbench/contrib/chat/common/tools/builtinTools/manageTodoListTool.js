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
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import {
  ToolDataSource,
  ToolInvocationPresentation
} from "../languageModelToolsService.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IChatTodoListService } from "../chatTodoListService.js";
import { localize } from "../../../../../../nls.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { URI } from "../../../../../../base/common/uri.js";
const ManageTodoListToolToolId = "manage_todo_list";
function createManageTodoListToolData() {
  const inputSchema = {
    type: "object",
    properties: {
      todoList: {
        type: "array",
        description: "Complete array of all todo items. Must include ALL items - both existing and new.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "Unique identifier for the todo. Use sequential numbers starting from 1."
            },
            title: {
              type: "string",
              description: "Concise action-oriented todo label (3-7 words). Displayed in UI."
            },
            status: {
              type: "string",
              enum: ["not-started", "in-progress", "completed"],
              description: "not-started: Not begun | in-progress: Currently working (max 1) | completed: Fully finished with no blockers"
            }
          },
          required: ["id", "title", "status"]
        }
      }
    },
    required: ["todoList"]
  };
  return {
    id: ManageTodoListToolToolId,
    toolReferenceName: "todo",
    legacyToolReferenceFullNames: ["todos"],
    canBeReferencedInPrompt: true,
    icon: ThemeIcon.fromId(Codicon.checklist.id),
    displayName: localize("tool.manageTodoList.displayName", "Manage and track todo items for task planning"),
    userDescription: localize("tool.manageTodoList.userDescription", "Manage and track todo items for task planning"),
    modelDescription: "Manage a structured todo list to track progress and plan tasks throughout your coding session. Use this tool VERY frequently to ensure task visibility and proper planning.\n\nWhen to use this tool:\n- Complex multi-step work requiring planning and tracking\n- When user provides multiple tasks or requests (numbered/comma-separated)\n- After receiving new instructions that require multiple steps\n- BEFORE starting work on any todo (mark as in-progress)\n- IMMEDIATELY after completing each todo (mark completed individually)\n- When breaking down larger tasks into smaller actionable steps\n- To give users visibility into your progress and planning\n\nWhen NOT to use:\n- Single, trivial tasks that can be completed in one step\n- Purely conversational/informational requests\n- When just reading files or performing simple searches\n\nCRITICAL workflow:\n1. Plan tasks by writing todo list with specific, actionable items\n2. Mark ONE todo as in-progress before starting work\n3. Complete the work for that specific todo\n4. Mark that todo as completed IMMEDIATELY\n5. Move to next todo and repeat\n\nTodo states:\n- not-started: Todo not yet begun\n- in-progress: Currently working (limit ONE at a time)\n- completed: Finished successfully\n\nIMPORTANT: Mark todos completed as soon as they are done. Do not batch completions.",
    source: ToolDataSource.Internal,
    inputSchema
  };
}
const ManageTodoListToolData = createManageTodoListToolData();
let ManageTodoListTool = class extends Disposable {
  constructor(chatTodoListService, logService, telemetryService) {
    super();
    this.chatTodoListService = chatTodoListService;
    this.logService = logService;
    this.telemetryService = telemetryService;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async invoke(invocation, _countTokens, _progress, _token) {
    const args = invocation.parameters;
    let chatSessionResource = invocation.context?.sessionResource;
    if (!chatSessionResource && args.operation === "read" && args.chatSessionResource) {
      try {
        chatSessionResource = URI.parse(args.chatSessionResource);
      } catch (error) {
        this.logService.error("ManageTodoListTool: Invalid chatSessionResource URI", error);
      }
    }
    if (!chatSessionResource) {
      return {
        content: [{
          kind: "text",
          value: "Error: No session resource available"
        }]
      };
    }
    this.logService.debug(`ManageTodoListTool: Invoking with options ${JSON.stringify(args)}`);
    try {
      if (args.operation === "read") {
        return this.handleReadOperation(chatSessionResource);
      } else {
        return this.handleWriteOperation(args, chatSessionResource);
      }
    } catch (error) {
      const errorMessage = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
      return {
        content: [{
          kind: "text",
          value: errorMessage
        }]
      };
    }
  }
  async prepareToolInvocation(context, _token) {
    const args = context.parameters;
    const chatSessionResource = context.chatSessionResource;
    if (!chatSessionResource) {
      return void 0;
    }
    const currentTodoItems = this.chatTodoListService.getTodos(chatSessionResource);
    let message;
    if (args.operation === "read") {
      message = localize("todo.readOperation", "Read todo list");
    } else if (args.todoList) {
      message = this.generatePastTenseMessage(currentTodoItems, args.todoList);
    }
    const items = args.todoList ?? currentTodoItems;
    const todoList = items.map((todo) => ({
      id: todo.id.toString(),
      title: todo.title,
      status: todo.status
    }));
    const invocationLabel = message?.replace(/^(Starting|Completed): /i, "") ?? localize("todo.updatingList", "Updating todo list");
    const invocationMessage = new MarkdownString(invocationLabel);
    return {
      invocationMessage,
      presentation: items.length ? void 0 : ToolInvocationPresentation.Hidden,
      pastTenseMessage: new MarkdownString(message ?? localize("todo.updatedList", "Updated todo list")),
      toolSpecificData: {
        kind: "todoList",
        todoList
      }
    };
  }
  generatePastTenseMessage(currentTodos, newTodos) {
    if (currentTodos.length === 0 && newTodos.length > 0) {
      return newTodos.length === 1 ? localize("todo.created.single", "Created 1 todo") : localize("todo.created.multiple", "Created {0} todos", newTodos.length);
    }
    const currentTodoMap = new Map(currentTodos.map((todo) => [todo.id, todo]));
    const startedTodos = newTodos.filter((newTodo) => {
      const currentTodo = currentTodoMap.get(newTodo.id);
      return currentTodo && currentTodo.status !== "in-progress" && newTodo.status === "in-progress";
    });
    if (startedTodos.length > 0) {
      const startedTodo = startedTodos[0];
      const totalTodos = newTodos.length;
      const currentPosition = newTodos.findIndex((todo) => todo.id === startedTodo.id) + 1;
      return localize("todo.starting", "Starting: *{0}* ({1}/{2})", startedTodo.title, currentPosition, totalTodos);
    }
    const completedTodos = newTodos.filter((newTodo) => {
      const currentTodo = currentTodoMap.get(newTodo.id);
      return currentTodo && currentTodo.status !== "completed" && newTodo.status === "completed";
    });
    if (completedTodos.length > 0) {
      const completedTodo = completedTodos[0];
      const totalTodos = newTodos.length;
      const currentPosition = newTodos.findIndex((todo) => todo.id === completedTodo.id) + 1;
      return localize("todo.completed", "Completed: *{0}* ({1}/{2})", completedTodo.title, currentPosition, totalTodos);
    }
    const addedTodos = newTodos.filter((newTodo) => !currentTodoMap.has(newTodo.id));
    if (addedTodos.length > 0) {
      return addedTodos.length === 1 ? localize("todo.added.single", "Added 1 todo") : localize("todo.added.multiple", "Added {0} todos", addedTodos.length);
    }
    return localize("todo.updated", "Updated todo list");
  }
  handleRead(todoItems, sessionResource) {
    if (todoItems.length === 0) {
      return "No todo list found.";
    }
    const markdownTaskList = this.formatTodoListAsMarkdownTaskList(todoItems);
    return `# Todo List

${markdownTaskList}`;
  }
  handleReadOperation(chatSessionResource) {
    const todoItems = this.chatTodoListService.getTodos(chatSessionResource);
    const readResult = this.handleRead(todoItems, chatSessionResource);
    const statusCounts = this.calculateStatusCounts(todoItems);
    this.telemetryService.publicLog2(
      "todoListToolInvoked",
      {
        operation: "read",
        notStartedCount: statusCounts.notStartedCount,
        inProgressCount: statusCounts.inProgressCount,
        completedCount: statusCounts.completedCount
      }
    );
    return {
      content: [{
        kind: "text",
        value: readResult
      }]
    };
  }
  handleWriteOperation(args, chatSessionResource) {
    if (!args.todoList) {
      return {
        content: [{
          kind: "text",
          value: "Error: todoList is required for write operation"
        }]
      };
    }
    const todoList = args.todoList.map((parsedTodo) => ({
      id: parsedTodo.id,
      title: parsedTodo.title,
      status: parsedTodo.status
    }));
    const existingTodos = this.chatTodoListService.getTodos(chatSessionResource);
    const changes = this.calculateTodoChanges(existingTodos, todoList);
    this.chatTodoListService.setTodos(chatSessionResource, todoList);
    const statusCounts = this.calculateStatusCounts(todoList);
    const warnings = [];
    if (todoList.length < 3) {
      warnings.push("Warning: Small todo list (<3 items). This task might not need a todo list.");
    } else if (todoList.length > 10) {
      warnings.push("Warning: Large todo list (>10 items). Consider keeping the list focused and actionable.");
    }
    if (changes > 3) {
      warnings.push("Warning: Did you mean to update so many todos at the same time? Consider working on them one by one.");
    }
    this.telemetryService.publicLog2(
      "todoListToolInvoked",
      {
        operation: "write",
        notStartedCount: statusCounts.notStartedCount,
        inProgressCount: statusCounts.inProgressCount,
        completedCount: statusCounts.completedCount
      }
    );
    return {
      content: [{
        kind: "text",
        value: `Successfully wrote todo list${warnings.length ? "\n\n" + warnings.join("\n") : ""}`
      }],
      toolMetadata: {
        warnings
      }
    };
  }
  calculateStatusCounts(todos) {
    const notStartedCount = todos.filter((todo) => todo.status === "not-started").length;
    const inProgressCount = todos.filter((todo) => todo.status === "in-progress").length;
    const completedCount = todos.filter((todo) => todo.status === "completed").length;
    return { notStartedCount, inProgressCount, completedCount };
  }
  formatTodoListAsMarkdownTaskList(todoList) {
    if (todoList.length === 0) {
      return "";
    }
    return todoList.map((todo) => {
      let checkbox;
      switch (todo.status) {
        case "completed":
          checkbox = "[x]";
          break;
        case "in-progress":
          checkbox = "[-]";
          break;
        case "not-started":
        default:
          checkbox = "[ ]";
          break;
      }
      const lines = [`- ${checkbox} ${todo.title}`];
      return lines.join("\n");
    }).join("\n");
  }
  calculateTodoChanges(oldList, newList) {
    let modified = 0;
    const minLen = Math.min(oldList.length, newList.length);
    for (let i = 0; i < minLen; i++) {
      const o = oldList[i];
      const n = newList[i];
      if (o.title !== n.title || o.status !== n.status) {
        modified++;
      }
    }
    const added = Math.max(0, newList.length - oldList.length);
    const removed = Math.max(0, oldList.length - newList.length);
    const totalChanges = added + removed + modified;
    return totalChanges;
  }
};
ManageTodoListTool = __decorateClass([
  __decorateParam(0, IChatTodoListService),
  __decorateParam(1, ILogService),
  __decorateParam(2, ITelemetryService)
], ManageTodoListTool);
export {
  ManageTodoListTool,
  ManageTodoListToolData,
  ManageTodoListToolToolId,
  createManageTodoListToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9tYW5hZ2VUb2RvTGlzdFRvb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSwgSUpTT05TY2hlbWFNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQge1xuXHRJVG9vbERhdGEsXG5cdElUb29sSW1wbCxcblx0SVRvb2xJbnZvY2F0aW9uLFxuXHRJVG9vbFJlc3VsdCxcblx0VG9vbERhdGFTb3VyY2UsXG5cdElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCxcblx0SVByZXBhcmVkVG9vbEludm9jYXRpb24sXG5cdFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uXG59IGZyb20gJy4uL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElDaGF0VG9kbywgSUNoYXRUb2RvTGlzdFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0VG9kb0xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuZXhwb3J0IGNvbnN0IE1hbmFnZVRvZG9MaXN0VG9vbFRvb2xJZCA9ICdtYW5hZ2VfdG9kb19saXN0JztcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1hbmFnZVRvZG9MaXN0VG9vbERhdGEoKTogSVRvb2xEYXRhIHtcblx0Y29uc3QgaW5wdXRTY2hlbWE6IElKU09OU2NoZW1hICYgeyBwcm9wZXJ0aWVzOiBJSlNPTlNjaGVtYU1hcCB9ID0ge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdHRvZG9MaXN0OiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnQ29tcGxldGUgYXJyYXkgb2YgYWxsIHRvZG8gaXRlbXMuIE11c3QgaW5jbHVkZSBBTEwgaXRlbXMgLSBib3RoIGV4aXN0aW5nIGFuZCBuZXcuJyxcblx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdVbmlxdWUgaWRlbnRpZmllciBmb3IgdGhlIHRvZG8uIFVzZSBzZXF1ZW50aWFsIG51bWJlcnMgc3RhcnRpbmcgZnJvbSAxLidcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR0aXRsZToge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdDb25jaXNlIGFjdGlvbi1vcmllbnRlZCB0b2RvIGxhYmVsICgzLTcgd29yZHMpLiBEaXNwbGF5ZWQgaW4gVUkuJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHN0YXR1czoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZW51bTogWydub3Qtc3RhcnRlZCcsICdpbi1wcm9ncmVzcycsICdjb21wbGV0ZWQnXSxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdub3Qtc3RhcnRlZDogTm90IGJlZ3VuIHwgaW4tcHJvZ3Jlc3M6IEN1cnJlbnRseSB3b3JraW5nIChtYXggMSkgfCBjb21wbGV0ZWQ6IEZ1bGx5IGZpbmlzaGVkIHdpdGggbm8gYmxvY2tlcnMnXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IFsnaWQnLCAndGl0bGUnLCAnc3RhdHVzJ11cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0cmVxdWlyZWQ6IFsndG9kb0xpc3QnXVxuXHR9O1xuXG5cdHJldHVybiB7XG5cdFx0aWQ6IE1hbmFnZVRvZG9MaXN0VG9vbFRvb2xJZCxcblx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3RvZG8nLFxuXHRcdGxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM6IFsndG9kb3MnXSxcblx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uY2hlY2tsaXN0LmlkKSxcblx0XHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3Rvb2wubWFuYWdlVG9kb0xpc3QuZGlzcGxheU5hbWUnLCAnTWFuYWdlIGFuZCB0cmFjayB0b2RvIGl0ZW1zIGZvciB0YXNrIHBsYW5uaW5nJyksXG5cdFx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndG9vbC5tYW5hZ2VUb2RvTGlzdC51c2VyRGVzY3JpcHRpb24nLCAnTWFuYWdlIGFuZCB0cmFjayB0b2RvIGl0ZW1zIGZvciB0YXNrIHBsYW5uaW5nJyksXG5cdFx0bW9kZWxEZXNjcmlwdGlvbjogJ01hbmFnZSBhIHN0cnVjdHVyZWQgdG9kbyBsaXN0IHRvIHRyYWNrIHByb2dyZXNzIGFuZCBwbGFuIHRhc2tzIHRocm91Z2hvdXQgeW91ciBjb2Rpbmcgc2Vzc2lvbi4gVXNlIHRoaXMgdG9vbCBWRVJZIGZyZXF1ZW50bHkgdG8gZW5zdXJlIHRhc2sgdmlzaWJpbGl0eSBhbmQgcHJvcGVyIHBsYW5uaW5nLlxcblxcbldoZW4gdG8gdXNlIHRoaXMgdG9vbDpcXG4tIENvbXBsZXggbXVsdGktc3RlcCB3b3JrIHJlcXVpcmluZyBwbGFubmluZyBhbmQgdHJhY2tpbmdcXG4tIFdoZW4gdXNlciBwcm92aWRlcyBtdWx0aXBsZSB0YXNrcyBvciByZXF1ZXN0cyAobnVtYmVyZWQvY29tbWEtc2VwYXJhdGVkKVxcbi0gQWZ0ZXIgcmVjZWl2aW5nIG5ldyBpbnN0cnVjdGlvbnMgdGhhdCByZXF1aXJlIG11bHRpcGxlIHN0ZXBzXFxuLSBCRUZPUkUgc3RhcnRpbmcgd29yayBvbiBhbnkgdG9kbyAobWFyayBhcyBpbi1wcm9ncmVzcylcXG4tIElNTUVESUFURUxZIGFmdGVyIGNvbXBsZXRpbmcgZWFjaCB0b2RvIChtYXJrIGNvbXBsZXRlZCBpbmRpdmlkdWFsbHkpXFxuLSBXaGVuIGJyZWFraW5nIGRvd24gbGFyZ2VyIHRhc2tzIGludG8gc21hbGxlciBhY3Rpb25hYmxlIHN0ZXBzXFxuLSBUbyBnaXZlIHVzZXJzIHZpc2liaWxpdHkgaW50byB5b3VyIHByb2dyZXNzIGFuZCBwbGFubmluZ1xcblxcbldoZW4gTk9UIHRvIHVzZTpcXG4tIFNpbmdsZSwgdHJpdmlhbCB0YXNrcyB0aGF0IGNhbiBiZSBjb21wbGV0ZWQgaW4gb25lIHN0ZXBcXG4tIFB1cmVseSBjb252ZXJzYXRpb25hbC9pbmZvcm1hdGlvbmFsIHJlcXVlc3RzXFxuLSBXaGVuIGp1c3QgcmVhZGluZyBmaWxlcyBvciBwZXJmb3JtaW5nIHNpbXBsZSBzZWFyY2hlc1xcblxcbkNSSVRJQ0FMIHdvcmtmbG93OlxcbjEuIFBsYW4gdGFza3MgYnkgd3JpdGluZyB0b2RvIGxpc3Qgd2l0aCBzcGVjaWZpYywgYWN0aW9uYWJsZSBpdGVtc1xcbjIuIE1hcmsgT05FIHRvZG8gYXMgaW4tcHJvZ3Jlc3MgYmVmb3JlIHN0YXJ0aW5nIHdvcmtcXG4zLiBDb21wbGV0ZSB0aGUgd29yayBmb3IgdGhhdCBzcGVjaWZpYyB0b2RvXFxuNC4gTWFyayB0aGF0IHRvZG8gYXMgY29tcGxldGVkIElNTUVESUFURUxZXFxuNS4gTW92ZSB0byBuZXh0IHRvZG8gYW5kIHJlcGVhdFxcblxcblRvZG8gc3RhdGVzOlxcbi0gbm90LXN0YXJ0ZWQ6IFRvZG8gbm90IHlldCBiZWd1blxcbi0gaW4tcHJvZ3Jlc3M6IEN1cnJlbnRseSB3b3JraW5nIChsaW1pdCBPTkUgYXQgYSB0aW1lKVxcbi0gY29tcGxldGVkOiBGaW5pc2hlZCBzdWNjZXNzZnVsbHlcXG5cXG5JTVBPUlRBTlQ6IE1hcmsgdG9kb3MgY29tcGxldGVkIGFzIHNvb24gYXMgdGhleSBhcmUgZG9uZS4gRG8gbm90IGJhdGNoIGNvbXBsZXRpb25zLicsXG5cdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRpbnB1dFNjaGVtYTogaW5wdXRTY2hlbWFcblx0fTtcbn1cblxuZXhwb3J0IGNvbnN0IE1hbmFnZVRvZG9MaXN0VG9vbERhdGE6IElUb29sRGF0YSA9IGNyZWF0ZU1hbmFnZVRvZG9MaXN0VG9vbERhdGEoKTtcblxuaW50ZXJmYWNlIElNYW5hZ2VUb2RvTGlzdFRvb2xJbnB1dFBhcmFtcyB7XG5cdG9wZXJhdGlvbj86ICd3cml0ZScgfCAncmVhZCc7IC8vIE9wdGlvbmFsLCBkZWZhdWx0cyB0byAnd3JpdGUnXG5cdHRvZG9MaXN0OiBBcnJheTx7XG5cdFx0aWQ6IG51bWJlcjtcblx0XHR0aXRsZTogc3RyaW5nO1xuXHRcdHN0YXR1czogJ25vdC1zdGFydGVkJyB8ICdpbi1wcm9ncmVzcycgfCAnY29tcGxldGVkJztcblx0fT47XG5cdC8vIHVzZWQgZm9yIHRvZG8gcmVhZCBvbmx5XG5cdGNoYXRTZXNzaW9uUmVzb3VyY2U/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBNYW5hZ2VUb2RvTGlzdFRvb2wgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRUb2RvTGlzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0VG9kb0xpc3RTZXJ2aWNlOiBJQ2hhdFRvZG9MaXN0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBhbnksIF9wcm9ncmVzczogYW55LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IGFyZ3MgPSBpbnZvY2F0aW9uLnBhcmFtZXRlcnMgYXMgSU1hbmFnZVRvZG9MaXN0VG9vbElucHV0UGFyYW1zO1xuXHRcdGxldCBjaGF0U2Vzc2lvblJlc291cmNlID0gaW52b2NhdGlvbi5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0aWYgKCFjaGF0U2Vzc2lvblJlc291cmNlICYmIGFyZ3Mub3BlcmF0aW9uID09PSAncmVhZCcgJiYgYXJncy5jaGF0U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKGFyZ3MuY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ01hbmFnZVRvZG9MaXN0VG9vbDogSW52YWxpZCBjaGF0U2Vzc2lvblJlc291cmNlIFVSSScsIGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCFjaGF0U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogJ0Vycm9yOiBObyBzZXNzaW9uIHJlc291cmNlIGF2YWlsYWJsZSdcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBNYW5hZ2VUb2RvTGlzdFRvb2w6IEludm9raW5nIHdpdGggb3B0aW9ucyAke0pTT04uc3RyaW5naWZ5KGFyZ3MpfWApO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChhcmdzLm9wZXJhdGlvbiA9PT0gJ3JlYWQnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmhhbmRsZVJlYWRPcGVyYXRpb24oY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5oYW5kbGVXcml0ZU9wZXJhdGlvbihhcmdzLCBjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdH1cblxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSBgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YDtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiBlcnJvck1lc3NhZ2Vcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhcmdzID0gY29udGV4dC5wYXJhbWV0ZXJzIGFzIElNYW5hZ2VUb2RvTGlzdFRvb2xJbnB1dFBhcmFtcztcblx0XHRjb25zdCBjaGF0U2Vzc2lvblJlc291cmNlID0gY29udGV4dC5jaGF0U2Vzc2lvblJlc291cmNlO1xuXHRcdGlmICghY2hhdFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50VG9kb0l0ZW1zID0gdGhpcy5jaGF0VG9kb0xpc3RTZXJ2aWNlLmdldFRvZG9zKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGxldCBtZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAoYXJncy5vcGVyYXRpb24gPT09ICdyZWFkJykge1xuXHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCd0b2RvLnJlYWRPcGVyYXRpb24nLCBcIlJlYWQgdG9kbyBsaXN0XCIpO1xuXHRcdH0gZWxzZSBpZiAoYXJncy50b2RvTGlzdCkge1xuXHRcdFx0bWVzc2FnZSA9IHRoaXMuZ2VuZXJhdGVQYXN0VGVuc2VNZXNzYWdlKGN1cnJlbnRUb2RvSXRlbXMsIGFyZ3MudG9kb0xpc3QpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1zID0gYXJncy50b2RvTGlzdCA/PyBjdXJyZW50VG9kb0l0ZW1zO1xuXHRcdGNvbnN0IHRvZG9MaXN0ID0gaXRlbXMubWFwKHRvZG8gPT4gKHtcblx0XHRcdGlkOiB0b2RvLmlkLnRvU3RyaW5nKCksXG5cdFx0XHR0aXRsZTogdG9kby50aXRsZSxcblx0XHRcdHN0YXR1czogdG9kby5zdGF0dXNcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbnZvY2F0aW9uTGFiZWwgPSBtZXNzYWdlPy5yZXBsYWNlKC9eKFN0YXJ0aW5nfENvbXBsZXRlZCk6IC9pLCAnJykgPz8gbG9jYWxpemUoJ3RvZG8udXBkYXRpbmdMaXN0JywgXCJVcGRhdGluZyB0b2RvIGxpc3RcIik7XG5cdFx0Y29uc3QgaW52b2NhdGlvbk1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcoaW52b2NhdGlvbkxhYmVsKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdHByZXNlbnRhdGlvbjogaXRlbXMubGVuZ3RoID8gdW5kZWZpbmVkIDogVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKG1lc3NhZ2UgPz8gbG9jYWxpemUoJ3RvZG8udXBkYXRlZExpc3QnLCBcIlVwZGF0ZWQgdG9kbyBsaXN0XCIpKSxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0a2luZDogJ3RvZG9MaXN0Jyxcblx0XHRcdFx0dG9kb0xpc3Q6IHRvZG9MaXN0XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2VuZXJhdGVQYXN0VGVuc2VNZXNzYWdlKGN1cnJlbnRUb2RvczogSUNoYXRUb2RvW10sIG5ld1RvZG9zOiBJTWFuYWdlVG9kb0xpc3RUb29sSW5wdXRQYXJhbXNbJ3RvZG9MaXN0J10pOiBzdHJpbmcge1xuXHRcdC8vIElmIG5vIGN1cnJlbnQgdG9kb3MgYW5kIHdlJ3JlIGFkZGluZyBuZXcgb25lcywgdGhpcyBpcyBjcmVhdGluZyBuZXcgb25lcy5cblx0XHQvLyBXaGVuIGJvdGggbGlzdHMgYXJlIGVtcHR5IChhIG5vLW9wIHdyaXRlKSwgZmFsbCB0aHJvdWdoIHRvIHRoZSBkZWZhdWx0XG5cdFx0Ly8gXCJVcGRhdGVkIHRvZG8gbGlzdFwiIG1lc3NhZ2UgcmF0aGVyIHRoYW4gc2hvd2luZyBcIkNyZWF0ZWQgMCB0b2Rvc1wiLlxuXHRcdGlmIChjdXJyZW50VG9kb3MubGVuZ3RoID09PSAwICYmIG5ld1RvZG9zLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBuZXdUb2Rvcy5sZW5ndGggPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgndG9kby5jcmVhdGVkLnNpbmdsZScsIFwiQ3JlYXRlZCAxIHRvZG9cIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgndG9kby5jcmVhdGVkLm11bHRpcGxlJywgXCJDcmVhdGVkIHswfSB0b2Rvc1wiLCBuZXdUb2Rvcy5sZW5ndGgpO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBtYXAgZm9yIGVhc2llciBjb21wYXJpc29uXG5cdFx0Y29uc3QgY3VycmVudFRvZG9NYXAgPSBuZXcgTWFwKGN1cnJlbnRUb2Rvcy5tYXAodG9kbyA9PiBbdG9kby5pZCwgdG9kb10pKTtcblxuXHRcdC8vIENoZWNrIGZvciBuZXdseSBzdGFydGVkIHRvZG9zIChtYXJrZWQgYXMgaW4tcHJvZ3Jlc3MpIC0gaGlnaGVzdCBwcmlvcml0eVxuXHRcdGNvbnN0IHN0YXJ0ZWRUb2RvcyA9IG5ld1RvZG9zLmZpbHRlcihuZXdUb2RvID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRUb2RvID0gY3VycmVudFRvZG9NYXAuZ2V0KG5ld1RvZG8uaWQpO1xuXHRcdFx0cmV0dXJuIGN1cnJlbnRUb2RvICYmIGN1cnJlbnRUb2RvLnN0YXR1cyAhPT0gJ2luLXByb2dyZXNzJyAmJiBuZXdUb2RvLnN0YXR1cyA9PT0gJ2luLXByb2dyZXNzJztcblx0XHR9KTtcblxuXHRcdGlmIChzdGFydGVkVG9kb3MubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgc3RhcnRlZFRvZG8gPSBzdGFydGVkVG9kb3NbMF07IC8vIFNob3VsZCBvbmx5IGJlIG9uZSBpbi1wcm9ncmVzcyBhdCBhIHRpbWVcblx0XHRcdGNvbnN0IHRvdGFsVG9kb3MgPSBuZXdUb2Rvcy5sZW5ndGg7XG5cdFx0XHRjb25zdCBjdXJyZW50UG9zaXRpb24gPSBuZXdUb2Rvcy5maW5kSW5kZXgodG9kbyA9PiB0b2RvLmlkID09PSBzdGFydGVkVG9kby5pZCkgKyAxO1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0b2RvLnN0YXJ0aW5nJywgXCJTdGFydGluZzogKnswfSogKHsxfS97Mn0pXCIsIHN0YXJ0ZWRUb2RvLnRpdGxlLCBjdXJyZW50UG9zaXRpb24sIHRvdGFsVG9kb3MpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBuZXdseSBjb21wbGV0ZWQgdG9kb3Ncblx0XHRjb25zdCBjb21wbGV0ZWRUb2RvcyA9IG5ld1RvZG9zLmZpbHRlcihuZXdUb2RvID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRUb2RvID0gY3VycmVudFRvZG9NYXAuZ2V0KG5ld1RvZG8uaWQpO1xuXHRcdFx0cmV0dXJuIGN1cnJlbnRUb2RvICYmIGN1cnJlbnRUb2RvLnN0YXR1cyAhPT0gJ2NvbXBsZXRlZCcgJiYgbmV3VG9kby5zdGF0dXMgPT09ICdjb21wbGV0ZWQnO1xuXHRcdH0pO1xuXG5cdFx0aWYgKGNvbXBsZXRlZFRvZG9zLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGNvbXBsZXRlZFRvZG8gPSBjb21wbGV0ZWRUb2Rvc1swXTsgLy8gR2V0IHRoZSBmaXJzdCBjb21wbGV0ZWQgdG9kbyBmb3IgdGhlIG1lc3NhZ2Vcblx0XHRcdGNvbnN0IHRvdGFsVG9kb3MgPSBuZXdUb2Rvcy5sZW5ndGg7XG5cdFx0XHRjb25zdCBjdXJyZW50UG9zaXRpb24gPSBuZXdUb2Rvcy5maW5kSW5kZXgodG9kbyA9PiB0b2RvLmlkID09PSBjb21wbGV0ZWRUb2RvLmlkKSArIDE7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3RvZG8uY29tcGxldGVkJywgXCJDb21wbGV0ZWQ6ICp7MH0qICh7MX0vezJ9KVwiLCBjb21wbGV0ZWRUb2RvLnRpdGxlLCBjdXJyZW50UG9zaXRpb24sIHRvdGFsVG9kb3MpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBuZXcgdG9kb3MgYWRkZWRcblx0XHRjb25zdCBhZGRlZFRvZG9zID0gbmV3VG9kb3MuZmlsdGVyKG5ld1RvZG8gPT4gIWN1cnJlbnRUb2RvTWFwLmhhcyhuZXdUb2RvLmlkKSk7XG5cdFx0aWYgKGFkZGVkVG9kb3MubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIGFkZGVkVG9kb3MubGVuZ3RoID09PSAxXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3RvZG8uYWRkZWQuc2luZ2xlJywgXCJBZGRlZCAxIHRvZG9cIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgndG9kby5hZGRlZC5tdWx0aXBsZScsIFwiQWRkZWQgezB9IHRvZG9zXCIsIGFkZGVkVG9kb3MubGVuZ3RoKTtcblx0XHR9XG5cblx0XHQvLyBEZWZhdWx0IG1lc3NhZ2UgZm9yIG90aGVyIHVwZGF0ZXNcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3RvZG8udXBkYXRlZCcsIFwiVXBkYXRlZCB0b2RvIGxpc3RcIik7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVJlYWQodG9kb0l0ZW1zOiBJQ2hhdFRvZG9bXSwgc2Vzc2lvblJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdGlmICh0b2RvSXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gJ05vIHRvZG8gbGlzdCBmb3VuZC4nO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hcmtkb3duVGFza0xpc3QgPSB0aGlzLmZvcm1hdFRvZG9MaXN0QXNNYXJrZG93blRhc2tMaXN0KHRvZG9JdGVtcyk7XG5cdFx0cmV0dXJuIGAjIFRvZG8gTGlzdFxcblxcbiR7bWFya2Rvd25UYXNrTGlzdH1gO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVSZWFkT3BlcmF0aW9uKGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSk6IElUb29sUmVzdWx0IHtcblx0XHRjb25zdCB0b2RvSXRlbXMgPSB0aGlzLmNoYXRUb2RvTGlzdFNlcnZpY2UuZ2V0VG9kb3MoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmVhZFJlc3VsdCA9IHRoaXMuaGFuZGxlUmVhZCh0b2RvSXRlbXMsIGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHN0YXR1c0NvdW50cyA9IHRoaXMuY2FsY3VsYXRlU3RhdHVzQ291bnRzKHRvZG9JdGVtcyk7XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxUb2RvTGlzdFRvb2xJbnZva2VkRXZlbnQsIFRvZG9MaXN0VG9vbEludm9rZWRDbGFzc2lmaWNhdGlvbj4oXG5cdFx0XHQndG9kb0xpc3RUb29sSW52b2tlZCcsXG5cdFx0XHR7XG5cdFx0XHRcdG9wZXJhdGlvbjogJ3JlYWQnLFxuXHRcdFx0XHRub3RTdGFydGVkQ291bnQ6IHN0YXR1c0NvdW50cy5ub3RTdGFydGVkQ291bnQsXG5cdFx0XHRcdGluUHJvZ3Jlc3NDb3VudDogc3RhdHVzQ291bnRzLmluUHJvZ3Jlc3NDb3VudCxcblx0XHRcdFx0Y29tcGxldGVkQ291bnQ6IHN0YXR1c0NvdW50cy5jb21wbGV0ZWRDb3VudFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHR2YWx1ZTogcmVhZFJlc3VsdFxuXHRcdFx0fV1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVXcml0ZU9wZXJhdGlvbihhcmdzOiBJTWFuYWdlVG9kb0xpc3RUb29sSW5wdXRQYXJhbXMsIGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSk6IElUb29sUmVzdWx0IHtcblx0XHRpZiAoIWFyZ3MudG9kb0xpc3QpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiAnRXJyb3I6IHRvZG9MaXN0IGlzIHJlcXVpcmVkIGZvciB3cml0ZSBvcGVyYXRpb24nXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvZG9MaXN0OiBJQ2hhdFRvZG9bXSA9IGFyZ3MudG9kb0xpc3QubWFwKChwYXJzZWRUb2RvKSA9PiAoe1xuXHRcdFx0aWQ6IHBhcnNlZFRvZG8uaWQsXG5cdFx0XHR0aXRsZTogcGFyc2VkVG9kby50aXRsZSxcblx0XHRcdHN0YXR1czogcGFyc2VkVG9kby5zdGF0dXNcblx0XHR9KSk7XG5cblx0XHRjb25zdCBleGlzdGluZ1RvZG9zID0gdGhpcy5jaGF0VG9kb0xpc3RTZXJ2aWNlLmdldFRvZG9zKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGNoYW5nZXMgPSB0aGlzLmNhbGN1bGF0ZVRvZG9DaGFuZ2VzKGV4aXN0aW5nVG9kb3MsIHRvZG9MaXN0KTtcblxuXHRcdHRoaXMuY2hhdFRvZG9MaXN0U2VydmljZS5zZXRUb2RvcyhjaGF0U2Vzc2lvblJlc291cmNlLCB0b2RvTGlzdCk7XG5cdFx0Y29uc3Qgc3RhdHVzQ291bnRzID0gdGhpcy5jYWxjdWxhdGVTdGF0dXNDb3VudHModG9kb0xpc3QpO1xuXG5cdFx0Ly8gQnVpbGQgd2FybmluZ3Ncblx0XHRjb25zdCB3YXJuaW5nczogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAodG9kb0xpc3QubGVuZ3RoIDwgMykge1xuXHRcdFx0d2FybmluZ3MucHVzaCgnV2FybmluZzogU21hbGwgdG9kbyBsaXN0ICg8MyBpdGVtcykuIFRoaXMgdGFzayBtaWdodCBub3QgbmVlZCBhIHRvZG8gbGlzdC4nKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAodG9kb0xpc3QubGVuZ3RoID4gMTApIHtcblx0XHRcdHdhcm5pbmdzLnB1c2goJ1dhcm5pbmc6IExhcmdlIHRvZG8gbGlzdCAoPjEwIGl0ZW1zKS4gQ29uc2lkZXIga2VlcGluZyB0aGUgbGlzdCBmb2N1c2VkIGFuZCBhY3Rpb25hYmxlLicpO1xuXHRcdH1cblxuXHRcdGlmIChjaGFuZ2VzID4gMykge1xuXHRcdFx0d2FybmluZ3MucHVzaCgnV2FybmluZzogRGlkIHlvdSBtZWFuIHRvIHVwZGF0ZSBzbyBtYW55IHRvZG9zIGF0IHRoZSBzYW1lIHRpbWU/IENvbnNpZGVyIHdvcmtpbmcgb24gdGhlbSBvbmUgYnkgb25lLicpO1xuXHRcdH1cblxuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFRvZG9MaXN0VG9vbEludm9rZWRFdmVudCwgVG9kb0xpc3RUb29sSW52b2tlZENsYXNzaWZpY2F0aW9uPihcblx0XHRcdCd0b2RvTGlzdFRvb2xJbnZva2VkJyxcblx0XHRcdHtcblx0XHRcdFx0b3BlcmF0aW9uOiAnd3JpdGUnLFxuXHRcdFx0XHRub3RTdGFydGVkQ291bnQ6IHN0YXR1c0NvdW50cy5ub3RTdGFydGVkQ291bnQsXG5cdFx0XHRcdGluUHJvZ3Jlc3NDb3VudDogc3RhdHVzQ291bnRzLmluUHJvZ3Jlc3NDb3VudCxcblx0XHRcdFx0Y29tcGxldGVkQ291bnQ6IHN0YXR1c0NvdW50cy5jb21wbGV0ZWRDb3VudFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHR2YWx1ZTogYFN1Y2Nlc3NmdWxseSB3cm90ZSB0b2RvIGxpc3Qke3dhcm5pbmdzLmxlbmd0aCA/ICdcXG5cXG4nICsgd2FybmluZ3Muam9pbignXFxuJykgOiAnJ31gXG5cdFx0XHR9XSxcblx0XHRcdHRvb2xNZXRhZGF0YToge1xuXHRcdFx0XHR3YXJuaW5nczogd2FybmluZ3Ncblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjYWxjdWxhdGVTdGF0dXNDb3VudHModG9kb3M6IElDaGF0VG9kb1tdKTogeyBub3RTdGFydGVkQ291bnQ6IG51bWJlcjsgaW5Qcm9ncmVzc0NvdW50OiBudW1iZXI7IGNvbXBsZXRlZENvdW50OiBudW1iZXIgfSB7XG5cdFx0Y29uc3Qgbm90U3RhcnRlZENvdW50ID0gdG9kb3MuZmlsdGVyKHRvZG8gPT4gdG9kby5zdGF0dXMgPT09ICdub3Qtc3RhcnRlZCcpLmxlbmd0aDtcblx0XHRjb25zdCBpblByb2dyZXNzQ291bnQgPSB0b2Rvcy5maWx0ZXIodG9kbyA9PiB0b2RvLnN0YXR1cyA9PT0gJ2luLXByb2dyZXNzJykubGVuZ3RoO1xuXHRcdGNvbnN0IGNvbXBsZXRlZENvdW50ID0gdG9kb3MuZmlsdGVyKHRvZG8gPT4gdG9kby5zdGF0dXMgPT09ICdjb21wbGV0ZWQnKS5sZW5ndGg7XG5cdFx0cmV0dXJuIHsgbm90U3RhcnRlZENvdW50LCBpblByb2dyZXNzQ291bnQsIGNvbXBsZXRlZENvdW50IH07XG5cdH1cblxuXHRwcml2YXRlIGZvcm1hdFRvZG9MaXN0QXNNYXJrZG93blRhc2tMaXN0KHRvZG9MaXN0OiBJQ2hhdFRvZG9bXSk6IHN0cmluZyB7XG5cdFx0aWYgKHRvZG9MaXN0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdHJldHVybiB0b2RvTGlzdC5tYXAodG9kbyA9PiB7XG5cdFx0XHRsZXQgY2hlY2tib3g6IHN0cmluZztcblx0XHRcdHN3aXRjaCAodG9kby5zdGF0dXMpIHtcblx0XHRcdFx0Y2FzZSAnY29tcGxldGVkJzpcblx0XHRcdFx0XHRjaGVja2JveCA9ICdbeF0nO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdpbi1wcm9ncmVzcyc6XG5cdFx0XHRcdFx0Y2hlY2tib3ggPSAnWy1dJztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnbm90LXN0YXJ0ZWQnOlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGNoZWNrYm94ID0gJ1sgXSc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxpbmVzID0gW2AtICR7Y2hlY2tib3h9ICR7dG9kby50aXRsZX1gXTtcblxuXHRcdFx0cmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xuXHRcdH0pLmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBjYWxjdWxhdGVUb2RvQ2hhbmdlcyhvbGRMaXN0OiBJQ2hhdFRvZG9bXSwgbmV3TGlzdDogSUNoYXRUb2RvW10pOiBudW1iZXIge1xuXHRcdC8vIEFzc3VtZSBhcnJheXMgYXJlIGVxdWl2YWxlbnQgaW4gb3JkZXI7IGNvbXBhcmUgaW5kZXgtYnktaW5kZXhcblx0XHRsZXQgbW9kaWZpZWQgPSAwO1xuXHRcdGNvbnN0IG1pbkxlbiA9IE1hdGgubWluKG9sZExpc3QubGVuZ3RoLCBuZXdMaXN0Lmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtaW5MZW47IGkrKykge1xuXHRcdFx0Y29uc3QgbyA9IG9sZExpc3RbaV07XG5cdFx0XHRjb25zdCBuID0gbmV3TGlzdFtpXTtcblx0XHRcdGlmIChvLnRpdGxlICE9PSBuLnRpdGxlIHx8IG8uc3RhdHVzICE9PSBuLnN0YXR1cykge1xuXHRcdFx0XHRtb2RpZmllZCsrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGFkZGVkID0gTWF0aC5tYXgoMCwgbmV3TGlzdC5sZW5ndGggLSBvbGRMaXN0Lmxlbmd0aCk7XG5cdFx0Y29uc3QgcmVtb3ZlZCA9IE1hdGgubWF4KDAsIG9sZExpc3QubGVuZ3RoIC0gbmV3TGlzdC5sZW5ndGgpO1xuXHRcdGNvbnN0IHRvdGFsQ2hhbmdlcyA9IGFkZGVkICsgcmVtb3ZlZCArIG1vZGlmaWVkO1xuXHRcdHJldHVybiB0b3RhbENoYW5nZXM7XG5cdH1cbn1cblxudHlwZSBUb2RvTGlzdFRvb2xJbnZva2VkRXZlbnQgPSB7XG5cdG9wZXJhdGlvbjogJ3JlYWQnIHwgJ3dyaXRlJztcblx0bm90U3RhcnRlZENvdW50OiBudW1iZXI7XG5cdGluUHJvZ3Jlc3NDb3VudDogbnVtYmVyO1xuXHRjb21wbGV0ZWRDb3VudDogbnVtYmVyO1xufTtcblxudHlwZSBUb2RvTGlzdFRvb2xJbnZva2VkQ2xhc3NpZmljYXRpb24gPSB7XG5cdG9wZXJhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBvcGVyYXRpb24gcGVyZm9ybWVkIG9uIHRoZSB0b2RvIGxpc3QgKHJlYWQgb3Igd3JpdGUpLicgfTtcblx0bm90U3RhcnRlZENvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnVGhlIG51bWJlciBvZiB0YXNrcyB3aXRoIG5vdC1zdGFydGVkIHN0YXR1cy4nIH07XG5cdGluUHJvZ3Jlc3NDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgdGFza3Mgd2l0aCBpbi1wcm9ncmVzcyBzdGF0dXMuJyB9O1xuXHRjb21wbGV0ZWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgdGFza3Mgd2l0aCBjb21wbGV0ZWQgc3RhdHVzLicgfTtcblx0b3duZXI6ICdiaGF2eWF1cyc7XG5cdGNvbW1lbnQ6ICdQcm92aWRlcyBpbnNpZ2h0IGludG8gdGhlIHVzYWdlIG9mIHRoZSB0b2RvIGxpc3QgdG9vbCBpbmNsdWRpbmcgZGV0YWlsZWQgdGFzayBzdGF0dXMgZGlzdHJpYnV0aW9uLic7XG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFFeEIsU0FBUyxpQkFBaUI7QUFDMUI7QUFBQSxFQUtDO0FBQUEsRUFHQTtBQUFBLE9BQ007QUFDUCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFvQiw0QkFBNEI7QUFDaEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxXQUFXO0FBRWIsTUFBTSwyQkFBMkI7QUFFakMsU0FBUywrQkFBMEM7QUFDekQsUUFBTSxjQUE0RDtBQUFBLElBQ2pFLE1BQU07QUFBQSxJQUNOLFlBQVk7QUFBQSxNQUNYLFVBQVU7QUFBQSxRQUNULE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLE9BQU87QUFBQSxVQUNOLE1BQU07QUFBQSxVQUNOLFlBQVk7QUFBQSxZQUNYLElBQUk7QUFBQSxjQUNILE1BQU07QUFBQSxjQUNOLGFBQWE7QUFBQSxZQUNkO0FBQUEsWUFDQSxPQUFPO0FBQUEsY0FDTixNQUFNO0FBQUEsY0FDTixhQUFhO0FBQUEsWUFDZDtBQUFBLFlBQ0EsUUFBUTtBQUFBLGNBQ1AsTUFBTTtBQUFBLGNBQ04sTUFBTSxDQUFDLGVBQWUsZUFBZSxXQUFXO0FBQUEsY0FDaEQsYUFBYTtB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O0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxzQkFBc0IsT0FBa0c7QUFDL0gsVUFBTSxrQkFBa0IsTUFBTSxPQUFPLFVBQVEsS0FBSyxXQUFXLGFBQWEsRUFBRTtBQUM1RSxVQUFNLGtCQUFrQixNQUFNLE9BQU8sVUFBUSxLQUFLLFdBQVcsYUFBYSxFQUFFO0FBQzVFLFVBQU0saUJBQWlCLE1BQU0sT0FBTyxVQUFRLEtBQUssV0FBVyxXQUFXLEVBQUU7QUFDekUsV0FBTyxFQUFFLGlCQUFpQixpQkFBaUIsZUFBZTtBQUFBLEVBQzNEO0FBQUEsRUFFUSxpQ0FBaUMsVUFBK0I7QUFDdkUsUUFBSSxTQUFTLFdBQVcsR0FBRztBQUMxQixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sU0FBUyxJQUFJLFVBQVE7QUFDM0IsVUFBSTtBQUNKLGNBQVEsS0FBSyxRQUFRO0FBQUEsUUFDcEIsS0FBSztBQUNKLHFCQUFXO0FBQ1g7QUFBQSxRQUNELEtBQUs7QUFDSixxQkFBVztBQUNYO0FBQUEsUUFDRCxLQUFLO0FBQUEsUUFDTDtBQUNDLHFCQUFXO0FBQ1g7QUFBQSxNQUNGO0FBRUEsWUFBTSxRQUFRLENBQUMsS0FBSyxRQUFRLElBQUksS0FBSyxLQUFLLEVBQUU7QUFFNUMsYUFBTyxNQUFNLEtBQUssSUFBSTtBQUFBLElBQ3ZCLENBQUMsRUFBRSxLQUFLLElBQUk7QUFBQSxFQUNiO0FBQUEsRUFFUSxxQkFBcUIsU0FBc0IsU0FBOEI7QUFFaEYsUUFBSSxXQUFXO0FBQ2YsVUFBTSxTQUFTLEtBQUssSUFBSSxRQUFRLFFBQVEsUUFBUSxNQUFNO0FBQ3RELGFBQVMsSUFBSSxHQUFHLElBQUksUUFBUSxLQUFLO0FBQ2hDLFlBQU0sSUFBSSxRQUFRLENBQUM7QUFDbkIsWUFBTSxJQUFJLFFBQVEsQ0FBQztBQUNuQixVQUFJLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsUUFBUTtBQUNqRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRLEtBQUssSUFBSSxHQUFHLFFBQVEsU0FBUyxRQUFRLE1BQU07QUFDekQsVUFBTSxVQUFVLEtBQUssSUFBSSxHQUFHLFFBQVEsU0FBUyxRQUFRLE1BQU07QUFDM0QsVUFBTSxlQUFlLFFBQVEsVUFBVTtBQUN2QyxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBcFJhLHFCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FMVTsiLAogICJuYW1lcyI6IFtdCn0K
