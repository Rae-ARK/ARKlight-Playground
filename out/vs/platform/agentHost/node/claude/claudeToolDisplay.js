import { localize } from "../../../../nls.js";
import { appendEscapedMarkdownInlineCode, escapeMarkdownLinkLabel } from "../../../../base/common/htmlContent.js";
import { basename } from "../../../../base/common/resources.js";
import { truncate } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { getStreamingCreateMessage, getStreamingEditMessage, getStreamingReplaceMessage, streamingToolTextLineCount } from "../../common/streamingToolCallDisplay.js";
import { toToolCallMeta } from "../../common/meta/agentToolCallMeta.js";
import { getServerToolDisplay } from "../shared/serverToolGroups.js";
const TOOL_ROWS = {
  // shell tools — no `language` is carried: the workbench picks
  // `'shellscript'` from the tool name (it only special-cases
  // `'powershell'`), and the SDK's `Bash` tool is the generic shell
  // entry point (bash on POSIX, Git Bash on Windows), so claiming a
  // specific dialect here would be misleading and unused.
  Bash: { permissionKind: "shell", toolKind: "terminal" },
  BashOutput: { permissionKind: "shell", toolKind: "terminal" },
  KillBash: { permissionKind: "shell", toolKind: "terminal" },
  // read tools
  Read: { permissionKind: "read", pathField: "file_path" },
  Glob: { permissionKind: "read", pathField: "path", toolKind: "search" },
  Grep: { permissionKind: "read", pathField: "path", toolKind: "search" },
  LS: { permissionKind: "read", pathField: "path" },
  NotebookRead: { permissionKind: "read", pathField: "notebook_path" },
  // write tools
  Write: { permissionKind: "write", pathField: "file_path", isFileEdit: true },
  Edit: { permissionKind: "write", pathField: "file_path", isFileEdit: true },
  MultiEdit: { permissionKind: "write", pathField: "file_path", isFileEdit: true },
  NotebookEdit: { permissionKind: "write", pathField: "notebook_path", isFileEdit: true },
  TodoWrite: { permissionKind: "write" },
  // network tools
  WebFetch: { permissionKind: "url", pathField: "url" },
  // host-routed / custom
  Task: { permissionKind: "custom-tool", toolKind: "subagent" },
  Agent: { permissionKind: "custom-tool", toolKind: "subagent" },
  ExitPlanMode: { permissionKind: "custom-tool", interactive: true },
  AskUserQuestion: { permissionKind: "custom-tool", interactive: true },
  // skill + task-list family — host-routed custom tools that render in the
  // generic tool renderer (no `toolKind`) but carry rich invocation /
  // past-tense messages so their collapsed row is self-explanatory.
  Skill: { permissionKind: "skill" },
  TaskCreate: { permissionKind: "custom-tool" },
  TaskUpdate: { permissionKind: "custom-tool" },
  TaskList: { permissionKind: "custom-tool" },
  TaskGet: { permissionKind: "custom-tool" }
};
const MCP_TOOL_PREFIX = "mcp__";
function getClaudePermissionKind(toolName) {
  const row = TOOL_ROWS[toolName];
  if (row) {
    return row.permissionKind;
  }
  if (toolName.startsWith(MCP_TOOL_PREFIX)) {
    return "mcp";
  }
  return "custom-tool";
}
function getClaudeToolDisplayName(toolName) {
  const serverDisplay = getServerToolDisplay(toolName, void 0)?.displayName;
  if (serverDisplay !== void 0) {
    return serverDisplay;
  }
  switch (toolName) {
    case "Bash":
      return localize("claude.tool.bash", "Run shell command");
    case "BashOutput":
      return localize("claude.tool.bashOutput", "Read shell output");
    case "KillBash":
      return localize("claude.tool.killBash", "Kill shell command");
    case "Read":
      return localize("claude.tool.read", "Read file");
    case "Glob":
      return localize("claude.tool.glob", "Find files");
    case "Grep":
      return localize("claude.tool.grep", "Search files");
    case "LS":
      return localize("claude.tool.ls", "List directory");
    case "NotebookRead":
      return localize("claude.tool.notebookRead", "Read notebook");
    case "Write":
      return localize("claude.tool.write", "Write file");
    case "Edit":
      return localize("claude.tool.edit", "Edit file");
    case "MultiEdit":
      return localize("claude.tool.multiEdit", "Edit file");
    case "NotebookEdit":
      return localize("claude.tool.notebookEdit", "Edit notebook");
    case "TodoWrite":
      return localize("claude.tool.todoWrite", "Update todo list");
    case "WebFetch":
      return localize("claude.tool.webFetch", "Fetch URL");
    case "Task":
    case "Agent":
      return localize("claude.tool.task", "Run subagent task");
    case "ExitPlanMode":
      return localize("claude.tool.exitPlanMode", "Ready to code?");
    case "AskUserQuestion":
      return localize("claude.tool.askUserQuestion", "Ask user a question");
    case "Skill":
      return localize("claude.tool.skill", "Run skill");
    case "TaskCreate":
      return localize("claude.tool.taskCreate", "Create task");
    case "TaskUpdate":
      return localize("claude.tool.taskUpdate", "Update task");
    case "TaskList":
      return localize("claude.tool.taskList", "List tasks");
    case "TaskGet":
      return localize("claude.tool.taskGet", "Read task");
  }
  if (toolName.startsWith(MCP_TOOL_PREFIX)) {
    return localize("claude.tool.mcp", "Run MCP tool {0}", toolName.slice(MCP_TOOL_PREFIX.length));
  }
  return toolName;
}
function getClaudeToolPath(toolName, input) {
  const row = TOOL_ROWS[toolName];
  if (!row?.pathField || typeof input !== "object" || input === null) {
    return void 0;
  }
  const value = input[row.pathField];
  return typeof value === "string" ? value : void 0;
}
function isClaudeFileEditTool(toolName) {
  return TOOL_ROWS[toolName]?.isFileEdit === true;
}
const INTERACTIVE_CLAUDE_TOOLS = new Set(
  Object.entries(TOOL_ROWS).filter(([, row]) => row.interactive).map(([name]) => name)
);
function getClaudeConfirmationTitle(toolName) {
  switch (getClaudePermissionKind(toolName)) {
    case "shell":
      return localize("claude.permission.shell.title", "Run in terminal?");
    case "write":
      return localize("claude.permission.write.title", "Edit file?");
    case "read":
      return localize("claude.permission.read.title", "Read file?");
    case "url":
      return localize("claude.permission.url.title", "Fetch URL?");
    case "skill":
      return localize("claude.permission.skill.title", "Run skill?");
    case "mcp": {
      const serverName = toolName.startsWith(MCP_TOOL_PREFIX) ? toolName.slice(MCP_TOOL_PREFIX.length).split("__")[0] : void 0;
      return serverName ? localize("claude.permission.mcp.title", "Allow tool from {0}?", serverName) : localize("claude.permission.default.title", "Allow tool call?");
    }
    case "custom-tool":
    default:
      return localize("claude.permission.default.title", "Allow tool call?");
  }
}
function getClaudeToolKind(toolName) {
  return TOOL_ROWS[toolName]?.toolKind;
}
function buildClaudeToolMeta(toolName) {
  const meta = buildClaudeToolCallMeta(toolName);
  return meta ? toToolCallMeta(meta) : void 0;
}
function buildClaudeToolCallMeta(toolName) {
  const row = TOOL_ROWS[toolName];
  if (!row?.toolKind) {
    return void 0;
  }
  return { toolKind: row.toolKind };
}
function md(value) {
  return { markdown: value };
}
function formatPathAsMarkdownLink(path) {
  const uri = URI.file(path);
  return `[${escapeMarkdownLinkLabel(basename(uri))}](${uri})`;
}
function readStringField(input, field) {
  if (input === null || typeof input !== "object") {
    return void 0;
  }
  const value = input[field];
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function firstShellLine(input) {
  const command = readStringField(input, "command");
  return command ? command.split("\n")[0] : void 0;
}
function readTaskUpdateStatus(input) {
  const status = readStringField(input, "status");
  return status === "in_progress" || status === "completed" || status === "deleted" ? status : void 0;
}
function getClaudeInvocationMessage(toolName, displayName, input) {
  const serverDisplay = getServerToolDisplay(toolName, input)?.invocationMessage;
  if (serverDisplay !== void 0) {
    return serverDisplay;
  }
  switch (toolName) {
    case "Bash": {
      const firstLine = firstShellLine(input);
      if (firstLine) {
        return md(localize("claude.toolInvoke.bashCmd", "Running {0}", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
      }
      return localize("claude.toolInvoke.bash", "Running shell command");
    }
    case "BashOutput":
      return localize("claude.toolInvoke.bashOutput", "Reading shell output");
    case "KillBash":
      return localize("claude.toolInvoke.killBash", "Killing shell command");
    case "Read":
    case "NotebookRead": {
      const path = getClaudeToolPath(toolName, input);
      if (path) {
        return md(localize("claude.toolInvoke.readFile", "Reading {0}", formatPathAsMarkdownLink(path)));
      }
      return localize("claude.toolInvoke.read", "Reading file");
    }
    case "LS": {
      const path = getClaudeToolPath(toolName, input);
      if (path) {
        return md(localize("claude.toolInvoke.lsPath", "Listing {0}", formatPathAsMarkdownLink(path)));
      }
      return localize("claude.toolInvoke.ls", "Listing directory");
    }
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit": {
      const path = getClaudeToolPath(toolName, input);
      if (path) {
        return md(localize("claude.toolInvoke.editFile", "Editing {0}", formatPathAsMarkdownLink(path)));
      }
      return localize("claude.toolInvoke.edit", "Editing file");
    }
    case "TodoWrite":
      return localize("claude.toolInvoke.todoWrite", "Updating todo list");
    case "Grep": {
      const pattern = readStringField(input, "pattern");
      if (pattern) {
        return md(localize("claude.toolInvoke.grepPattern", "Searching for {0}", appendEscapedMarkdownInlineCode(truncate(pattern, 80))));
      }
      return localize("claude.toolInvoke.grep", "Searching files");
    }
    case "Glob": {
      const pattern = readStringField(input, "pattern");
      if (pattern) {
        return md(localize("claude.toolInvoke.globPattern", "Finding files matching {0}", appendEscapedMarkdownInlineCode(truncate(pattern, 80))));
      }
      return localize("claude.toolInvoke.glob", "Finding files");
    }
    case "WebFetch": {
      const url = readStringField(input, "url");
      if (url) {
        return md(localize("claude.toolInvoke.webFetch", "Fetching {0}", `[${escapeMarkdownLinkLabel(truncate(url, 80))}](${url})`));
      }
      return localize("claude.toolInvoke.webFetchGeneric", "Fetching URL");
    }
    case "Task":
    case "Agent": {
      const description = readStringField(input, "description");
      if (description) {
        return description;
      }
      return displayName;
    }
    case "Skill": {
      const skill = readStringField(input, "skill");
      if (skill) {
        return md(localize("claude.toolInvoke.skillNamed", "Running skill {0}", appendEscapedMarkdownInlineCode(truncate(skill, 80))));
      }
      return localize("claude.toolInvoke.skill", "Running skill");
    }
    case "TaskCreate": {
      const subject = readStringField(input, "subject");
      if (subject) {
        return localize("claude.toolInvoke.taskCreateNamed", "Creating task: {0}", truncate(subject, 80));
      }
      return localize("claude.toolInvoke.taskCreate", "Creating task");
    }
    case "TaskUpdate":
      switch (readTaskUpdateStatus(input)) {
        case "in_progress":
          return localize("claude.toolInvoke.taskStart", "Starting task");
        case "completed":
          return localize("claude.toolInvoke.taskComplete", "Completing task");
        case "deleted":
          return localize("claude.toolInvoke.taskDelete", "Deleting task");
        default:
          return localize("claude.toolInvoke.taskUpdate", "Updating task");
      }
    case "TaskList":
      return localize("claude.toolInvoke.taskList", "Reading task list");
    case "TaskGet":
      return localize("claude.toolInvoke.taskGet", "Reading task");
    default:
      return displayName;
  }
}
function getClaudeStreamingInvocationMessage(toolName, input) {
  switch (toolName) {
    case "Write":
      return getStreamingCreateMessage(input?.["file_path"], streamingToolTextLineCount(input?.["content"]));
    case "Edit":
      return getStreamingReplaceMessage(
        input?.["file_path"],
        streamingToolTextLineCount(input?.["old_string"]),
        streamingToolTextLineCount(input?.["new_string"])
      );
    case "MultiEdit": {
      const edits = Array.isArray(input?.["edits"]) ? input["edits"] : [];
      let oldLineCount;
      let newLineCount;
      for (const edit of edits) {
        if (!edit || typeof edit !== "object" || Array.isArray(edit)) {
          continue;
        }
        const oldLines = streamingToolTextLineCount(edit["old_string"]);
        const newLines = streamingToolTextLineCount(edit["new_string"]);
        if (oldLines !== void 0) {
          oldLineCount = (oldLineCount ?? 0) + oldLines;
        }
        if (newLines !== void 0) {
          newLineCount = (newLineCount ?? 0) + newLines;
        }
      }
      return getStreamingReplaceMessage(input?.["file_path"], oldLineCount, newLineCount);
    }
    case "NotebookEdit":
      return getStreamingEditMessage(input?.["notebook_path"], streamingToolTextLineCount(input?.["new_source"]));
    default:
      return void 0;
  }
}
function getClaudePastTenseMessage(toolName, displayName, input, success, resultText) {
  if (!success) {
    return localize("claude.toolComplete.failed", '"{0}" failed', displayName);
  }
  const serverDisplay = getServerToolDisplay(toolName, input, { text: resultText, success })?.pastTenseMessage;
  if (serverDisplay !== void 0) {
    return serverDisplay;
  }
  switch (toolName) {
    case "Bash": {
      const firstLine = firstShellLine(input);
      if (firstLine) {
        return md(localize("claude.toolComplete.bashCmd", "Ran {0}", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
      }
      return localize("claude.toolComplete.bash", "Ran shell command");
    }
    case "BashOutput":
      return localize("claude.toolComplete.bashOutput", "Read shell output");
    case "KillBash":
      return localize("claude.toolComplete.killBash", "Killed shell command");
    case "Read":
    case "NotebookRead": {
      const path = getClaudeToolPath(toolName, input);
      if (path) {
        return md(localize("claude.toolComplete.readFile", "Read {0}", formatPathAsMarkdownLink(path)));
      }
      return localize("claude.toolComplete.read", "Read file");
    }
    case "LS": {
      const path = getClaudeToolPath(toolName, input);
      if (path) {
        return md(localize("claude.toolComplete.lsPath", "Listed {0}", formatPathAsMarkdownLink(path)));
      }
      return localize("claude.toolComplete.ls", "Listed directory");
    }
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit": {
      const path = getClaudeToolPath(toolName, input);
      if (path) {
        return md(localize("claude.toolComplete.editFile", "Edited {0}", formatPathAsMarkdownLink(path)));
      }
      return localize("claude.toolComplete.edit", "Edited file");
    }
    case "TodoWrite":
      return localize("claude.toolComplete.todoWrite", "Updated todo list");
    case "Grep": {
      const pattern = readStringField(input, "pattern");
      if (pattern) {
        return md(localize("claude.toolComplete.grepPattern", "Searched for {0}", appendEscapedMarkdownInlineCode(truncate(pattern, 80))));
      }
      return localize("claude.toolComplete.grep", "Searched files");
    }
    case "Glob": {
      const pattern = readStringField(input, "pattern");
      if (pattern) {
        return md(localize("claude.toolComplete.globPattern", "Found files matching {0}", appendEscapedMarkdownInlineCode(truncate(pattern, 80))));
      }
      return localize("claude.toolComplete.glob", "Found files");
    }
    case "WebFetch": {
      const url = readStringField(input, "url");
      if (url) {
        return md(localize("claude.toolComplete.webFetch", "Fetched {0}", `[${escapeMarkdownLinkLabel(truncate(url, 80))}](${url})`));
      }
      return localize("claude.toolComplete.webFetchGeneric", "Fetched URL");
    }
    case "Task":
    case "Agent":
      return localize("claude.toolComplete.task", "Ran subagent");
    case "Skill": {
      const skill = readStringField(input, "skill");
      if (skill) {
        return md(localize("claude.toolComplete.skillNamed", "Ran skill {0}", appendEscapedMarkdownInlineCode(truncate(skill, 80))));
      }
      return localize("claude.toolComplete.skill", "Ran skill");
    }
    case "TaskCreate": {
      const subject = readStringField(input, "subject");
      if (subject) {
        return localize("claude.toolComplete.taskCreateNamed", "Created task: {0}", truncate(subject, 80));
      }
      return localize("claude.toolComplete.taskCreate", "Created task");
    }
    case "TaskUpdate":
      switch (readTaskUpdateStatus(input)) {
        case "in_progress":
          return localize("claude.toolComplete.taskStart", "Started task");
        case "completed":
          return localize("claude.toolComplete.taskComplete", "Completed task");
        case "deleted":
          return localize("claude.toolComplete.taskDelete", "Deleted task");
        default:
          return localize("claude.toolComplete.taskUpdate", "Updated task");
      }
    case "TaskList":
      return localize("claude.toolComplete.taskList", "Read task list");
    case "TaskGet":
      return localize("claude.toolComplete.taskGet", "Read task");
    default:
      return displayName;
  }
}
function getClaudeToolInputString(toolName, input) {
  if (input === void 0) {
    return void 0;
  }
  if (toolName === "Bash" || toolName === "BashOutput" || toolName === "KillBash") {
    const command = readStringField(input, "command");
    if (command) {
      return command;
    }
  }
  if (toolName === "Grep" || toolName === "Glob") {
    const pattern = readStringField(input, "pattern");
    if (pattern) {
      return pattern;
    }
  }
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return void 0;
  }
}
export {
  INTERACTIVE_CLAUDE_TOOLS,
  buildClaudeToolCallMeta,
  buildClaudeToolMeta,
  getClaudeConfirmationTitle,
  getClaudeInvocationMessage,
  getClaudePastTenseMessage,
  getClaudePermissionKind,
  getClaudeStreamingInvocationMessage,
  getClaudeToolDisplayName,
  getClaudeToolInputString,
  getClaudeToolKind,
  getClaudeToolPath,
  isClaudeFileEditTool
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NsYXVkZS9jbGF1ZGVUb29sRGlzcGxheS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUsIGVzY2FwZU1hcmtkb3duTGlua0xhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgdHJ1bmNhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZXRTdHJlYW1pbmdDcmVhdGVNZXNzYWdlLCBnZXRTdHJlYW1pbmdFZGl0TWVzc2FnZSwgZ2V0U3RyZWFtaW5nUmVwbGFjZU1lc3NhZ2UsIHN0cmVhbWluZ1Rvb2xUZXh0TGluZUNvdW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0cmVhbWluZ1Rvb2xDYWxsRGlzcGxheS5qcyc7XG5pbXBvcnQgeyB0b1Rvb2xDYWxsTWV0YSwgdHlwZSBJVG9vbENhbGxNZXRhLCB0eXBlIFRvb2xLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL21ldGEvYWdlbnRUb29sQ2FsbE1ldGEuanMnO1xuaW1wb3J0IHR5cGUgeyBTdHJpbmdPck1hcmtkb3duIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IGdldFNlcnZlclRvb2xEaXNwbGF5IH0gZnJvbSAnLi4vc2hhcmVkL3NlcnZlclRvb2xHcm91cHMuanMnO1xuXG4vKipcbiAqIFBoYXNlIDcgUzQgXHUyMDE0IHB1cmUgdG9vbC1uYW1lIFx1MjE5MiBkaXNwbGF5L3Blcm1pc3Npb24gaGVscGVycyBmb3IgQ2xhdWRlLlxuICpcbiAqIE1pcnJvcnMgdGhlIHNoYXBlIG9mIFtjb3BpbG90VG9vbERpc3BsYXkudHNdKC4uL2NvcGlsb3QvY29waWxvdFRvb2xEaXNwbGF5LnRzKVxuICogYnV0IGlzIGtleWVkIG9mZiB0aGUgU0RLJ3MgYnVpbHQtaW4gdG9vbCBsaXN0LiBUaGUgbWFwcGluZyB0YWJsZSBsaXZlc1xuICogaGVyZSAoYW5kIGlzIHNuYXBzaG90LXRlc3RlZCBpblxuICogW2NsYXVkZVRvb2xEaXNwbGF5LnRlc3QudHNdKC4uLy4uL3Rlc3Qvbm9kZS9jbGF1ZGVUb29sRGlzcGxheS50ZXN0LnRzKSlcbiAqIHNvIHJlbmFtZXMgb2YgZWl0aGVyIHRoZSBTREsgdG9vbCBuYW1lcyBvciB0aGUgaG9zdCdzIGBwZXJtaXNzaW9uS2luZGBcbiAqIHVuaW9uIGZsb3cgdGhyb3VnaCBjb21waWxlLWNoZWNrcyBhbmQgdGhlIHNuYXBzaG90IGRpZmYuXG4gKlxuICogTm8gSS9PLCBubyBESTsgc2FmZSB0byBpbXBvcnQgZnJvbSBhbnkgbGF5ZXIgb2YgYGFnZW50SG9zdGAuXG4gKi9cblxuLyoqXG4gKiBBdXRvLWFwcHJvdmFsIGtpbmQgcmVwb3J0ZWQgYWxvbmdzaWRlIGBwZW5kaW5nX2NvbmZpcm1hdGlvbmAgc2lnbmFsc1xuICogKHNlZSBgSUFnZW50VG9vbFBlbmRpbmdDb25maXJtYXRpb25TaWduYWwucGVybWlzc2lvbktpbmRgIGluXG4gKiBbYWdlbnRTZXJ2aWNlLnRzOjMxN10oLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS50cyNMMzE3KSkuXG4gKlxuICogUGhhc2UgNyBvbmx5IGVtaXRzIHRoZSBzdWJzZXQgcmVsZXZhbnQgdG8gQ2xhdWRlJ3MgYnVpbHQtaW4gdG9vbHMgXHUyMDE0XG4gKiBgaG9va2AgYW5kIGBtZW1vcnlgIGFyZSByZXNlcnZlZCBmb3IgbGF0ZXIgcGhhc2VzLlxuICovXG5leHBvcnQgdHlwZSBDbGF1ZGVQZXJtaXNzaW9uS2luZCA9XG5cdHwgJ3NoZWxsJ1xuXHR8ICd3cml0ZSdcblx0fCAnbWNwJ1xuXHR8ICdyZWFkJ1xuXHR8ICd1cmwnXG5cdHwgJ3NraWxsJ1xuXHR8ICdjdXN0b20tdG9vbCc7XG5cbi8qKlxuICogUGhhc2UgOC41IFx1MjAxNCByZW5kZXJpbmcgaGludCBmb3IgdGhlIHdvcmtiZW5jaC4gRHJpdmVzIHRlcm1pbmFsIC9cbiAqIHNlYXJjaCAvIHN1YmFnZW50IHJlbmRlcmVycyAodGhlIHdvcmtiZW5jaCBwaWNrcyBhIHJlbmRlcmVyIG9mZlxuICogYF9tZXRhLnRvb2xLaW5kYDsgdW5rbm93biB2YWx1ZXMgZmFsbCB0aHJvdWdoIHRvIHRoZSBnZW5lcmljIHRvb2xcbiAqIHJlbmRlcmVyKS4gTWlycm9yIG9mXG4gKiBbYGNvcGlsb3RUb29sRGlzcGxheS5nZXRUb29sS2luZGBdKC4uL2NvcGlsb3QvY29waWxvdFRvb2xEaXNwbGF5LnRzKS5cbiAqL1xuZXhwb3J0IHR5cGUgQ2xhdWRlVG9vbEtpbmQgPSBUb29sS2luZDtcblxuLyoqXG4gKiBXaGljaCBmaWVsZCBvbiB0aGUgU0RLJ3MgYHRvb2xfaW5wdXRgIGNhcnJpZXMgdGhlIHBhdGgvdXJsIHN1cmZhY2VkXG4gKiB0byB0aGUgdXNlciAoYW5kIHRyYWNrZWQgYnkgUGhhc2UgOCBmb3IgZmlsZS1lZGl0IHRvb2xzKS4gT25lIGZpZWxkXG4gKiBwZXIgdG9vbCBcdTIwMTQgdG9vbHMgd2l0aG91dCBhIHBhdGgtYmVhcmluZyBmaWVsZCBvbWl0IHRoaXMuXG4gKi9cbnR5cGUgQ2xhdWRlVG9vbFBhdGhGaWVsZCA9ICdmaWxlX3BhdGgnIHwgJ25vdGVib29rX3BhdGgnIHwgJ3BhdGgnIHwgJ3VybCc7XG5cbi8qKlxuICogU2luZ2xlIHNvdXJjZS1vZi10cnV0aCByb3cgZm9yIG9uZSBvZiBDbGF1ZGUncyBidWlsdC1pbiB0b29scy4gRXZlcnlcbiAqIHN0cnVjdHVyYWwgZmFjdCB0aGUgaG9zdCBuZWVkcyBhYm91dCB0aGUgdG9vbCBzaXRzIGluIHRoaXMgcm93OyB0aGVcbiAqIGV4cG9ydGVkIGhlbHBlcnMgYmVsb3cgYXJlIG9uZS1saW5lcnMgb3ZlciB0aGUgdGFibGUuIEFkZGluZyBhIG5ld1xuICogU0RLIHRvb2wgbWVhbnMgYWRkaW5nIG9uZSByb3cgYW5kIG9uZSBgZGlzcGxheU5hbWVgIGFybS4gVGhlXG4gKiBzbmFwc2hvdCB0ZXN0IGluIFtjbGF1ZGVUb29sRGlzcGxheS50ZXN0LnRzXSguLi8uLi90ZXN0L25vZGUvY2xhdWRlVG9vbERpc3BsYXkudGVzdC50cylcbiAqIGZhaWxzIHVudGlsIGJvdGggdGhpcyBtYXAgYW5kIHRoZSBzbmFwc2hvdCBhcmUgdXBkYXRlZCB0b2dldGhlci5cbiAqXG4gKiBgZGlzcGxheU5hbWVgIGlzIGludGVudGlvbmFsbHkgTk9UIG9uIHRoZSByb3cgXHUyMDE0IGl0IGlzIHVzZXItZmFjaW5nXG4gKiBhbmQgbXVzdCBiZSBgbG9jYWxpemUoKWAtZCwgd2hpY2ggd2UgY2Fubm90IGRvIGF0IG1vZHVsZS1pbml0IHRpbWVcbiAqIHdpdGhvdXQgZnJlZXppbmcgdGhlIGJ1bmRsZSdzIGxvY2FsZS4gTG9va3VwIGxpdmVzIGluXG4gKiB7QGxpbmsgZ2V0Q2xhdWRlVG9vbERpc3BsYXlOYW1lfS5cbiAqL1xuaW50ZXJmYWNlIENsYXVkZVRvb2xSb3cge1xuXHRyZWFkb25seSBwZXJtaXNzaW9uS2luZDogQ2xhdWRlUGVybWlzc2lvbktpbmQ7XG5cdC8qKiBGaWVsZCBvbiBgdG9vbF9pbnB1dGAgY2FycnlpbmcgdGhlIHBhdGgvdXJsIGZvciB0aGlzIHRvb2wsIGlmIGFueS4gKi9cblx0cmVhZG9ubHkgcGF0aEZpZWxkPzogQ2xhdWRlVG9vbFBhdGhGaWVsZDtcblx0LyoqIFRydWUgZm9yIHRvb2xzIHdob3NlIGV4ZWN1dGlvbiB3cml0ZXMgdG8gZGlzayBhbmQgaXMgdHJhY2tlZCBieSBgRmlsZUVkaXRUcmFja2VyYCAoUGhhc2UgOCkuICovXG5cdHJlYWRvbmx5IGlzRmlsZUVkaXQ/OiB0cnVlO1xuXHQvKipcblx0ICogVHJ1ZSBmb3IgdG9vbHMgdGhlIFNESyBuZXZlciBhdXRvLWFwcHJvdmVzIHVuZGVyIGFueVxuXHQgKiBgcGVybWlzc2lvbk1vZGVgIChzbyB0aGV5IGFsd2F5cyByZWFjaCBgY2FuVXNlVG9vbGApLiBEcml2ZXNcblx0ICoge0BsaW5rIElOVEVSQUNUSVZFX0NMQVVERV9UT09MU30uXG5cdCAqL1xuXHRyZWFkb25seSBpbnRlcmFjdGl2ZT86IHRydWU7XG5cdC8qKlxuXHQgKiBQaGFzZSA4LjUgXHUyMDE0IHJlbmRlcmluZyBoaW50IGZvciB0aGUgd29ya2JlbmNoIChkcml2ZXMgdGhlXG5cdCAqIHRlcm1pbmFsIC8gc2VhcmNoIC8gc3ViYWdlbnQgcmVuZGVyZXJzKS4gT21pdCBmb3IgdG9vbHMgdGhhdFxuXHQgKiByZW5kZXIgaW4gdGhlIGdlbmVyaWMgdG9vbCByZW5kZXJlciAocmVhZCwgd3JpdGUsIE1DUCwgXHUyMDI2KS5cblx0ICovXG5cdHJlYWRvbmx5IHRvb2xLaW5kPzogQ2xhdWRlVG9vbEtpbmQ7XG59XG5cbmNvbnN0IFRPT0xfUk9XUzogeyByZWFkb25seSBbdG9vbE5hbWU6IHN0cmluZ106IENsYXVkZVRvb2xSb3cgfSA9IHtcblx0Ly8gc2hlbGwgdG9vbHMgXHUyMDE0IG5vIGBsYW5ndWFnZWAgaXMgY2FycmllZDogdGhlIHdvcmtiZW5jaCBwaWNrc1xuXHQvLyBgJ3NoZWxsc2NyaXB0J2AgZnJvbSB0aGUgdG9vbCBuYW1lIChpdCBvbmx5IHNwZWNpYWwtY2FzZXNcblx0Ly8gYCdwb3dlcnNoZWxsJ2ApLCBhbmQgdGhlIFNESydzIGBCYXNoYCB0b29sIGlzIHRoZSBnZW5lcmljIHNoZWxsXG5cdC8vIGVudHJ5IHBvaW50IChiYXNoIG9uIFBPU0lYLCBHaXQgQmFzaCBvbiBXaW5kb3dzKSwgc28gY2xhaW1pbmcgYVxuXHQvLyBzcGVjaWZpYyBkaWFsZWN0IGhlcmUgd291bGQgYmUgbWlzbGVhZGluZyBhbmQgdW51c2VkLlxuXHRCYXNoOiB7IHBlcm1pc3Npb25LaW5kOiAnc2hlbGwnLCB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LFxuXHRCYXNoT3V0cHV0OiB7IHBlcm1pc3Npb25LaW5kOiAnc2hlbGwnLCB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LFxuXHRLaWxsQmFzaDogeyBwZXJtaXNzaW9uS2luZDogJ3NoZWxsJywgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblxuXHQvLyByZWFkIHRvb2xzXG5cdFJlYWQ6IHsgcGVybWlzc2lvbktpbmQ6ICdyZWFkJywgcGF0aEZpZWxkOiAnZmlsZV9wYXRoJyB9LFxuXHRHbG9iOiB7IHBlcm1pc3Npb25LaW5kOiAncmVhZCcsIHBhdGhGaWVsZDogJ3BhdGgnLCB0b29sS2luZDogJ3NlYXJjaCcgfSxcblx0R3JlcDogeyBwZXJtaXNzaW9uS2luZDogJ3JlYWQnLCBwYXRoRmllbGQ6ICdwYXRoJywgdG9vbEtpbmQ6ICdzZWFyY2gnIH0sXG5cdExTOiB7IHBlcm1pc3Npb25LaW5kOiAncmVhZCcsIHBhdGhGaWVsZDogJ3BhdGgnIH0sXG5cdE5vdGVib29rUmVhZDogeyBwZXJtaXNzaW9uS2luZDogJ3JlYWQnLCBwYXRoRmllbGQ6ICdub3RlYm9va19wYXRoJyB9LFxuXG5cdC8vIHdyaXRlIHRvb2xzXG5cdFdyaXRlOiB7IHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLCBwYXRoRmllbGQ6ICdmaWxlX3BhdGgnLCBpc0ZpbGVFZGl0OiB0cnVlIH0sXG5cdEVkaXQ6IHsgcGVybWlzc2lvbktpbmQ6ICd3cml0ZScsIHBhdGhGaWVsZDogJ2ZpbGVfcGF0aCcsIGlzRmlsZUVkaXQ6IHRydWUgfSxcblx0TXVsdGlFZGl0OiB7IHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLCBwYXRoRmllbGQ6ICdmaWxlX3BhdGgnLCBpc0ZpbGVFZGl0OiB0cnVlIH0sXG5cdE5vdGVib29rRWRpdDogeyBwZXJtaXNzaW9uS2luZDogJ3dyaXRlJywgcGF0aEZpZWxkOiAnbm90ZWJvb2tfcGF0aCcsIGlzRmlsZUVkaXQ6IHRydWUgfSxcblx0VG9kb1dyaXRlOiB7IHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnIH0sXG5cblx0Ly8gbmV0d29yayB0b29sc1xuXHRXZWJGZXRjaDogeyBwZXJtaXNzaW9uS2luZDogJ3VybCcsIHBhdGhGaWVsZDogJ3VybCcgfSxcblxuXHQvLyBob3N0LXJvdXRlZCAvIGN1c3RvbVxuXHRUYXNrOiB7IHBlcm1pc3Npb25LaW5kOiAnY3VzdG9tLXRvb2wnLCB0b29sS2luZDogJ3N1YmFnZW50JyB9LFxuXHRBZ2VudDogeyBwZXJtaXNzaW9uS2luZDogJ2N1c3RvbS10b29sJywgdG9vbEtpbmQ6ICdzdWJhZ2VudCcgfSxcblx0RXhpdFBsYW5Nb2RlOiB7IHBlcm1pc3Npb25LaW5kOiAnY3VzdG9tLXRvb2wnLCBpbnRlcmFjdGl2ZTogdHJ1ZSB9LFxuXHRBc2tVc2VyUXVlc3Rpb246IHsgcGVybWlzc2lvbktpbmQ6ICdjdXN0b20tdG9vbCcsIGludGVyYWN0aXZlOiB0cnVlIH0sXG5cblx0Ly8gc2tpbGwgKyB0YXNrLWxpc3QgZmFtaWx5IFx1MjAxNCBob3N0LXJvdXRlZCBjdXN0b20gdG9vbHMgdGhhdCByZW5kZXIgaW4gdGhlXG5cdC8vIGdlbmVyaWMgdG9vbCByZW5kZXJlciAobm8gYHRvb2xLaW5kYCkgYnV0IGNhcnJ5IHJpY2ggaW52b2NhdGlvbiAvXG5cdC8vIHBhc3QtdGVuc2UgbWVzc2FnZXMgc28gdGhlaXIgY29sbGFwc2VkIHJvdyBpcyBzZWxmLWV4cGxhbmF0b3J5LlxuXHRTa2lsbDogeyBwZXJtaXNzaW9uS2luZDogJ3NraWxsJyB9LFxuXHRUYXNrQ3JlYXRlOiB7IHBlcm1pc3Npb25LaW5kOiAnY3VzdG9tLXRvb2wnIH0sXG5cdFRhc2tVcGRhdGU6IHsgcGVybWlzc2lvbktpbmQ6ICdjdXN0b20tdG9vbCcgfSxcblx0VGFza0xpc3Q6IHsgcGVybWlzc2lvbktpbmQ6ICdjdXN0b20tdG9vbCcgfSxcblx0VGFza0dldDogeyBwZXJtaXNzaW9uS2luZDogJ2N1c3RvbS10b29sJyB9LFxufTtcblxuY29uc3QgTUNQX1RPT0xfUFJFRklYID0gJ21jcF9fJztcblxuLyoqXG4gKiBTNCByb3cgbG9va3VwLiBGYWxscyBiYWNrIHRvIGAnY3VzdG9tLXRvb2wnYCBmb3IgdW5rbm93biB0b29scyBzb1xuICogQ2xhdWRlJ3MgZ3Jvd2luZyBidWlsdC1pbiBsaXN0IG5ldmVyIGJyZWFrcyB0aGUgaG9zdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENsYXVkZVBlcm1pc3Npb25LaW5kKHRvb2xOYW1lOiBzdHJpbmcpOiBDbGF1ZGVQZXJtaXNzaW9uS2luZCB7XG5cdGNvbnN0IHJvdyA9IFRPT0xfUk9XU1t0b29sTmFtZV07XG5cdGlmIChyb3cpIHtcblx0XHRyZXR1cm4gcm93LnBlcm1pc3Npb25LaW5kO1xuXHR9XG5cdGlmICh0b29sTmFtZS5zdGFydHNXaXRoKE1DUF9UT09MX1BSRUZJWCkpIHtcblx0XHRyZXR1cm4gJ21jcCc7XG5cdH1cblx0cmV0dXJuICdjdXN0b20tdG9vbCc7XG59XG5cbi8qKlxuICogTG9jYWxpemVkIGRpc3BsYXkgbmFtZSBmb3IgdGhlIFNESydzIGJ1aWx0LWluIHRvb2xzIChTNCkuIEZhbGxzIGJhY2tcbiAqIHRvIHRoZSByYXcgdG9vbCBuYW1lIHNvIHVua25vd24gdG9vbHMgc3RpbGwgcmVuZGVyIHNvbWV0aGluZ1xuICogc2Vuc2libGUuIEZvciBgbWNwX19zZXJ2ZXJfX3Rvb2xgIHRoZSBwcmVmaXggaXMgc3RyaXBwZWQgdG8gc3VyZmFjZVxuICogdGhlIHNlcnZlci90b29sIHBhaXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGF1ZGVUb29sRGlzcGxheU5hbWUodG9vbE5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHNlcnZlckRpc3BsYXkgPSBnZXRTZXJ2ZXJUb29sRGlzcGxheSh0b29sTmFtZSwgdW5kZWZpbmVkKT8uZGlzcGxheU5hbWU7XG5cdGlmIChzZXJ2ZXJEaXNwbGF5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gc2VydmVyRGlzcGxheTtcblx0fVxuXHRzd2l0Y2ggKHRvb2xOYW1lKSB7XG5cdFx0Y2FzZSAnQmFzaCc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wuYmFzaCcsIFwiUnVuIHNoZWxsIGNvbW1hbmRcIik7XG5cdFx0Y2FzZSAnQmFzaE91dHB1dCc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wuYmFzaE91dHB1dCcsIFwiUmVhZCBzaGVsbCBvdXRwdXRcIik7XG5cdFx0Y2FzZSAnS2lsbEJhc2gnOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sLmtpbGxCYXNoJywgXCJLaWxsIHNoZWxsIGNvbW1hbmRcIik7XG5cdFx0Y2FzZSAnUmVhZCc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wucmVhZCcsIFwiUmVhZCBmaWxlXCIpO1xuXHRcdGNhc2UgJ0dsb2InOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sLmdsb2InLCBcIkZpbmQgZmlsZXNcIik7XG5cdFx0Y2FzZSAnR3JlcCc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wuZ3JlcCcsIFwiU2VhcmNoIGZpbGVzXCIpO1xuXHRcdGNhc2UgJ0xTJzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbC5scycsIFwiTGlzdCBkaXJlY3RvcnlcIik7XG5cdFx0Y2FzZSAnTm90ZWJvb2tSZWFkJzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbC5ub3RlYm9va1JlYWQnLCBcIlJlYWQgbm90ZWJvb2tcIik7XG5cdFx0Y2FzZSAnV3JpdGUnOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sLndyaXRlJywgXCJXcml0ZSBmaWxlXCIpO1xuXHRcdGNhc2UgJ0VkaXQnOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sLmVkaXQnLCBcIkVkaXQgZmlsZVwiKTtcblx0XHRjYXNlICdNdWx0aUVkaXQnOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sLm11bHRpRWRpdCcsIFwiRWRpdCBmaWxlXCIpO1xuXHRcdGNhc2UgJ05vdGVib29rRWRpdCc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wubm90ZWJvb2tFZGl0JywgXCJFZGl0IG5vdGVib29rXCIpO1xuXHRcdGNhc2UgJ1RvZG9Xcml0ZSc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wudG9kb1dyaXRlJywgXCJVcGRhdGUgdG9kbyBsaXN0XCIpO1xuXHRcdGNhc2UgJ1dlYkZldGNoJzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbC53ZWJGZXRjaCcsIFwiRmV0Y2ggVVJMXCIpO1xuXHRcdGNhc2UgJ1Rhc2snOlxuXHRcdGNhc2UgJ0FnZW50JzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbC50YXNrJywgXCJSdW4gc3ViYWdlbnQgdGFza1wiKTtcblx0XHRjYXNlICdFeGl0UGxhbk1vZGUnOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sLmV4aXRQbGFuTW9kZScsIFwiUmVhZHkgdG8gY29kZT9cIik7XG5cdFx0Y2FzZSAnQXNrVXNlclF1ZXN0aW9uJzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbC5hc2tVc2VyUXVlc3Rpb24nLCBcIkFzayB1c2VyIGEgcXVlc3Rpb25cIik7XG5cdFx0Y2FzZSAnU2tpbGwnOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sLnNraWxsJywgXCJSdW4gc2tpbGxcIik7XG5cdFx0Y2FzZSAnVGFza0NyZWF0ZSc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wudGFza0NyZWF0ZScsIFwiQ3JlYXRlIHRhc2tcIik7XG5cdFx0Y2FzZSAnVGFza1VwZGF0ZSc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2wudGFza1VwZGF0ZScsIFwiVXBkYXRlIHRhc2tcIik7XG5cdFx0Y2FzZSAnVGFza0xpc3QnOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sLnRhc2tMaXN0JywgXCJMaXN0IHRhc2tzXCIpO1xuXHRcdGNhc2UgJ1Rhc2tHZXQnOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sLnRhc2tHZXQnLCBcIlJlYWQgdGFza1wiKTtcblx0fVxuXHRpZiAodG9vbE5hbWUuc3RhcnRzV2l0aChNQ1BfVE9PTF9QUkVGSVgpKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbC5tY3AnLCBcIlJ1biBNQ1AgdG9vbCB7MH1cIiwgdG9vbE5hbWUuc2xpY2UoTUNQX1RPT0xfUFJFRklYLmxlbmd0aCkpO1xuXHR9XG5cdHJldHVybiB0b29sTmFtZTtcbn1cblxuLyoqXG4gKiBSZWFkIHRoZSBgcGF0aEZpZWxkYCBuYW1lZCBvbiB0aGUgdG9vbCdzIHJvdyBmcm9tIGBpbnB1dGAuIFJldHVybnNcbiAqIGB1bmRlZmluZWRgIGZvciB0b29scyB3aXRob3V0IGEgcGF0aCBmaWVsZCwgZm9yIG1pc3NpbmcgZmllbGRzLCBvclxuICogZm9yIHdyb25nLXR5cGVkIGZpZWxkcyAoZGVmZW5zaXZlIGFnYWluc3QgbWFsZm9ybWVkIFNESyBpbnB1dCkuXG4gKlxuICogVXNlZCBib3RoIGZvciBgcGVuZGluZ19jb25maXJtYXRpb24ucGVybWlzc2lvblBhdGhgIChTNCkgYW5kIFBoYXNlIDhcbiAqIGZpbGUtZWRpdCB0cmFja2luZyBcdTIwMTQgY2FsbGVycyB0aGF0IG9ubHkgY2FyZSBhYm91dCBlZGl0cyBnYXRlIHdpdGhcbiAqIHtAbGluayBpc0NsYXVkZUZpbGVFZGl0VG9vbH0gZmlyc3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGF1ZGVUb29sUGF0aCh0b29sTmFtZTogc3RyaW5nLCBpbnB1dDogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHJvdyA9IFRPT0xfUk9XU1t0b29sTmFtZV07XG5cdGlmICghcm93Py5wYXRoRmllbGQgfHwgdHlwZW9mIGlucHV0ICE9PSAnb2JqZWN0JyB8fCBpbnB1dCA9PT0gbnVsbCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdmFsdWUgPSAoaW5wdXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW3Jvdy5wYXRoRmllbGRdO1xuXHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFBoYXNlIDggXHUyMDE0IHRydWUgZm9yIHRvb2xzIHRoYXQgcHJvZHVjZSBvbi1kaXNrIGZpbGUgZWRpdHMgdHJhY2tlZCBieVxuICogYEZpbGVFZGl0VHJhY2tlcmAuIEV4Y2x1ZGVzIGBUb2RvV3JpdGVgIChpbi1tZW1vcnkpIGFuZCBgQmFzaGAgKGVkaXRzXG4gKiBub3Qgc3VyZmFjZWQgYXMgY2Fub25pY2FsIFNESyBgdG9vbF91c2VgIGJsb2NrcyB0aGUgaG9zdCBjYW4gcGFpclxuICogd2l0aCBgdG9vbF9yZXN1bHRgKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzQ2xhdWRlRmlsZUVkaXRUb29sKHRvb2xOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIFRPT0xfUk9XU1t0b29sTmFtZV0/LmlzRmlsZUVkaXQgPT09IHRydWU7XG59XG5cbi8qKlxuICogUGhhc2UgNyBTMy41LiBUb29scyB3aG9zZSBgY2FuVXNlVG9vbGAgaW52b2NhdGlvbiBpcyBzYXRpc2ZpZWQgYnkgYVxuICogaG9zdC1kcml2ZW4gcm91bmQtdHJpcCByYXRoZXIgdGhhbiB0aGUgU0RLJ3MgYXV0by1hcHByb3ZhbDpcbiAqIC0gYEFza1VzZXJRdWVzdGlvbmAgXHUyMDE0IGNhcm91c2VsIChTMy41YSkuXG4gKiAtIGBFeGl0UGxhbk1vZGVgIFx1MjAxNCBgcGVuZGluZ19jb25maXJtYXRpb25gIHdpdGggY3VzdG9tIEFwcHJvdmUvRGVueVxuICogICBsYWJlbHMgYW5kIHRoZSBwbGFuIGJvZHkgYXMgYGludm9jYXRpb25NZXNzYWdlYCAoUzMuNWIpLlxuICpcbiAqIE1lbWJlcnNoaXAgb25seSBzaWduYWxzIHRoYXQgdGhlIFNESyBkb2VzIG5vdCBhdXRvLWFwcHJvdmUgdW5kZXIgYW55XG4gKiBgcGVybWlzc2lvbk1vZGVgLCBlbnN1cmluZyB0aGUgY2FsbCBhbHdheXMgcmVhY2hlcyB0aGUgaG9zdC5cbiAqIGBfaGFuZGxlQ2FuVXNlVG9vbGAgZGlzcGF0Y2hlcyB2aWEgYElOVEVSQUNUSVZFX0NMQVVERV9UT09MUy5oYXModG9vbE5hbWUpYC5cbiAqXG4gKiBEZXJpdmVkIGZyb20gdGhlIGBpbnRlcmFjdGl2ZTogdHJ1ZWAgcm93cyBhYm92ZSBzbyB0aGUgdGFibGUgc3RheXNcbiAqIHRoZSBzaW5nbGUgc291cmNlIG9mIHRydXRoLlxuICovXG5leHBvcnQgY29uc3QgSU5URVJBQ1RJVkVfQ0xBVURFX1RPT0xTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChcblx0T2JqZWN0LmVudHJpZXMoVE9PTF9ST1dTKVxuXHRcdC5maWx0ZXIoKFssIHJvd10pID0+IHJvdy5pbnRlcmFjdGl2ZSlcblx0XHQubWFwKChbbmFtZV0pID0+IG5hbWUpLFxuKTtcblxuLyoqXG4gKiBDb25maXJtYXRpb24tY2FyZCB0aXRsZSBzaG93biB3aGVuIGEgdG9vbCBuZWVkcyBleHBsaWNpdCB1c2VyXG4gKiBhcHByb3ZhbCAoUzMuNCBgcGVuZGluZ19jb25maXJtYXRpb25gIGZsb3cpLiBNaXJyb3JzIHRoZSBwZXIta2luZFxuICogdGl0bGVzIGluIHtAbGluayBnZXRQZXJtaXNzaW9uRGlzcGxheX0gZm9yIENvcGlsb3RBZ2VudCBzbyBib3RoXG4gKiBhZ2VudHMgcmVuZGVyIGlkZW50aWNhbCB3b3JkaW5nLiBUaGUgd29ya2JlbmNoIGtleXMgb2ZmXG4gKiBgY29uZmlybWF0aW9uVGl0bGVgIHRvIHJlbmRlciB0aGUgQXBwcm92ZS9EZW55IGJ1dHRvbnMgXHUyMDE0IHdoZW4gaXRcbiAqIGlzIGFic2VudCwgdGhlIHRvb2wgY2FyZCBzaWxlbnRseSBmbGlwcyB0byBcImF1dG8tYXBwcm92ZWRcIiBzdGF0ZVxuICogZXZlbiB0aG91Z2ggdGhlIGFnZW50IGlzIHBhcmtlZC4gU2VlIGBzZXNzaW9uUGVybWlzc2lvbnMudHNgJ3NcbiAqIGBjcmVhdGVUb29sUmVhZHlBY3Rpb25gLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2xhdWRlQ29uZmlybWF0aW9uVGl0bGUodG9vbE5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHN3aXRjaCAoZ2V0Q2xhdWRlUGVybWlzc2lvbktpbmQodG9vbE5hbWUpKSB7XG5cdFx0Y2FzZSAnc2hlbGwnOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUucGVybWlzc2lvbi5zaGVsbC50aXRsZScsIFwiUnVuIGluIHRlcm1pbmFsP1wiKTtcblx0XHRjYXNlICd3cml0ZSc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS5wZXJtaXNzaW9uLndyaXRlLnRpdGxlJywgXCJFZGl0IGZpbGU/XCIpO1xuXHRcdGNhc2UgJ3JlYWQnOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUucGVybWlzc2lvbi5yZWFkLnRpdGxlJywgXCJSZWFkIGZpbGU/XCIpO1xuXHRcdGNhc2UgJ3VybCc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS5wZXJtaXNzaW9uLnVybC50aXRsZScsIFwiRmV0Y2ggVVJMP1wiKTtcblx0XHRjYXNlICdza2lsbCc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS5wZXJtaXNzaW9uLnNraWxsLnRpdGxlJywgXCJSdW4gc2tpbGw/XCIpO1xuXHRcdGNhc2UgJ21jcCc6IHtcblx0XHRcdGNvbnN0IHNlcnZlck5hbWUgPSB0b29sTmFtZS5zdGFydHNXaXRoKE1DUF9UT09MX1BSRUZJWClcblx0XHRcdFx0PyB0b29sTmFtZS5zbGljZShNQ1BfVE9PTF9QUkVGSVgubGVuZ3RoKS5zcGxpdCgnX18nKVswXVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiBzZXJ2ZXJOYW1lXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NsYXVkZS5wZXJtaXNzaW9uLm1jcC50aXRsZScsIFwiQWxsb3cgdG9vbCBmcm9tIHswfT9cIiwgc2VydmVyTmFtZSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2xhdWRlLnBlcm1pc3Npb24uZGVmYXVsdC50aXRsZScsIFwiQWxsb3cgdG9vbCBjYWxsP1wiKTtcblx0XHR9XG5cdFx0Y2FzZSAnY3VzdG9tLXRvb2wnOlxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS5wZXJtaXNzaW9uLmRlZmF1bHQudGl0bGUnLCBcIkFsbG93IHRvb2wgY2FsbD9cIik7XG5cdH1cbn1cblxuLy8gI3JlZ2lvbiBQaGFzZSA4LjUgXHUyMDE0IHJpY2ggdG9vbC1jYWxsIHJlbmRlcmluZyBoZWxwZXJzXG5cbi8qKlxuICogUGhhc2UgOC41IFx1MjAxNCB3b3JrYmVuY2ggcmVuZGVyaW5nIGhpbnQuIE9uZS1saW5lciBvdmVyIGBUT09MX1JPV1NgLlxuICogUmV0dXJucyBgJ3Rlcm1pbmFsJ2AgZm9yIHNoZWxsIHRvb2xzIChkcml2ZXMgdGhlIHRlcm1pbmFsIHJlbmRlcmVyKSxcbiAqIGAnc2VhcmNoJ2AgZm9yIGBHcmVwYCAvIGBHbG9iYCAoZHJpdmVzIHRoZSBzZWFyY2ggcmVuZGVyZXIpLFxuICogYCdzdWJhZ2VudCdgIGZvciBgVGFza2AgLyBgQWdlbnRgIChkcml2ZXMgdGhlIHN1YmFnZW50IHJlbmRlcmVyKSxcbiAqIGB1bmRlZmluZWRgIGZvciBldmVyeXRoaW5nIGVsc2UgKGdlbmVyaWMgdG9vbCByZW5kZXJlcikuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGF1ZGVUb29sS2luZCh0b29sTmFtZTogc3RyaW5nKTogQ2xhdWRlVG9vbEtpbmQgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gVE9PTF9ST1dTW3Rvb2xOYW1lXT8udG9vbEtpbmQ7XG59XG5cbi8qKlxuICogUGhhc2UgOC41IFx1MjAxNCBidWlsZCB0aGUgYF9tZXRhYCBiYWcgc3RhbXBlZCBhdCB0aGUgdG9vbC1vcGVuIHNlYW0uXG4gKiBSZXR1cm5zIGB1bmRlZmluZWRgIGZvciB0b29scyB0aGF0IGhhdmUgbm8gYHRvb2xLaW5kYCBoaW50IHNvIHRoZVxuICogcmVzdWx0aW5nIGVudmVsb3BlIHN0YXlzIG1pbmltYWwgKGEgYFJlYWRgIHJvdyBnZXRzIG5vIGBfbWV0YWAgYXRcbiAqIGFsbCkuIE1pcnJvcnMgQ29waWxvdCdzXG4gKiBbYG1hcFNlc3Npb25FdmVudHMudHM6MTk3YF0oLi4vY29waWxvdC9tYXBTZXNzaW9uRXZlbnRzLnRzI0wxOTcpXG4gKiBzaW5nbGUtd3JpdGUgcGF0dGVybi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkQ2xhdWRlVG9vbE1ldGEodG9vbE5hbWU6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbWV0YSA9IGJ1aWxkQ2xhdWRlVG9vbENhbGxNZXRhKHRvb2xOYW1lKTtcblx0cmV0dXJuIG1ldGEgPyB0b1Rvb2xDYWxsTWV0YShtZXRhKSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBUeXBlZCB2YXJpYW50IG9mIHtAbGluayBidWlsZENsYXVkZVRvb2xNZXRhfSB0aGF0IHJldHVybnMgdGhlXG4gKiB7QGxpbmsgSVRvb2xDYWxsTWV0YX0gZGlyZWN0bHksIGZvciBjYWxsZXJzIHRoYXQgY29uc3VtZSB0aGUgdHlwZWQgdmlld1xuICogcmF0aGVyIHRoYW4gdGhlIHNlcmlhbGl6ZWQgYF9tZXRhYCBiYWcuIFJldHVybnMgYHVuZGVmaW5lZGAgZm9yIHRvb2xzIHRoYXRcbiAqIGhhdmUgbm8gYHRvb2xLaW5kYCBoaW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRDbGF1ZGVUb29sQ2FsbE1ldGEodG9vbE5hbWU6IHN0cmluZyk6IElUb29sQ2FsbE1ldGEgfCB1bmRlZmluZWQge1xuXHRjb25zdCByb3cgPSBUT09MX1JPV1NbdG9vbE5hbWVdO1xuXHRpZiAoIXJvdz8udG9vbEtpbmQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7IHRvb2xLaW5kOiByb3cudG9vbEtpbmQgfTtcbn1cblxuZnVuY3Rpb24gbWQodmFsdWU6IHN0cmluZyk6IFN0cmluZ09yTWFya2Rvd24ge1xuXHRyZXR1cm4geyBtYXJrZG93bjogdmFsdWUgfTtcbn1cblxuZnVuY3Rpb24gZm9ybWF0UGF0aEFzTWFya2Rvd25MaW5rKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHVyaSA9IFVSSS5maWxlKHBhdGgpO1xuXHRyZXR1cm4gYFske2VzY2FwZU1hcmtkb3duTGlua0xhYmVsKGJhc2VuYW1lKHVyaSkpfV0oJHt1cml9KWA7XG59XG5cbi8qKlxuICogRGVmZW5zaXZlIHN0cmluZy1maWVsZCBhY2Nlc3MuIFJldHVybnMgdGhlIGZpZWxkIHZhbHVlIHdoZW4gaXQgaXNcbiAqIGEgbm9uLWVtcHR5IHN0cmluZywgb3RoZXJ3aXNlIGB1bmRlZmluZWRgLlxuICovXG5mdW5jdGlvbiByZWFkU3RyaW5nRmllbGQoaW5wdXQ6IHVua25vd24sIGZpZWxkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoaW5wdXQgPT09IG51bGwgfHwgdHlwZW9mIGlucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdmFsdWUgPSAoaW5wdXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2ZpZWxkXTtcblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUubGVuZ3RoID4gMCA/IHZhbHVlIDogdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFBoYXNlIDguNSBcdTIwMTQgZmlyc3QtbGluZSBjb21tYW5kIGV4dHJhY3RvciBmb3Igc2hlbGwgdG9vbHMuIE1pcnJvcnNcbiAqIENvcGlsb3QncyBgY29tbWFuZC5zcGxpdCgnXFxuJylbMF1gIHBhdHRlcm4uXG4gKi9cbmZ1bmN0aW9uIGZpcnN0U2hlbGxMaW5lKGlucHV0OiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY29tbWFuZCA9IHJlYWRTdHJpbmdGaWVsZChpbnB1dCwgJ2NvbW1hbmQnKTtcblx0cmV0dXJuIGNvbW1hbmQgPyBjb21tYW5kLnNwbGl0KCdcXG4nKVswXSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBOYXJyb3dzIGEgYFRhc2tVcGRhdGVgIGNhbGwncyBgc3RhdHVzYCB0byB0aGUgdmFsdWVzIHRoYXQgY2hhbmdlIHRoZSByZW5kZXJlZFxuICogdmVyYjsgYW55IG90aGVyIG9yIGFic2VudCB2YWx1ZSB5aWVsZHMgYHVuZGVmaW5lZGAgKGdlbmVyaWMgXCJVcGRhdGluZ1wiIHZlcmIpLlxuICovXG5mdW5jdGlvbiByZWFkVGFza1VwZGF0ZVN0YXR1cyhpbnB1dDogdW5rbm93bik6ICdpbl9wcm9ncmVzcycgfCAnY29tcGxldGVkJyB8ICdkZWxldGVkJyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHN0YXR1cyA9IHJlYWRTdHJpbmdGaWVsZChpbnB1dCwgJ3N0YXR1cycpO1xuXHRyZXR1cm4gc3RhdHVzID09PSAnaW5fcHJvZ3Jlc3MnIHx8IHN0YXR1cyA9PT0gJ2NvbXBsZXRlZCcgfHwgc3RhdHVzID09PSAnZGVsZXRlZCcgPyBzdGF0dXMgOiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogUGhhc2UgOC41IFx1MjAxNCByaWNoIGludm9jYXRpb24gbWVzc2FnZSBmb3IgYSBgcGVuZGluZ19jb25maXJtYXRpb25gXG4gKiBjYXJkIG9yIGEgc3RyZWFtaW5nIGBDaGF0VG9vbENhbGxTdGFydGAgYWN0aW9uLiBSZWFkcyB0aGVcbiAqIFNESydzIGB0b29sX3VzZS5pbnB1dGAgZGVmZW5zaXZlbHkgYW5kIGZhbGxzIGJhY2sgdG8gdGhlIHN0YXRpY1xuICogYGRpc3BsYXlOYW1lYCBvbiBhbnkgc2hhcGUgbWlzbWF0Y2guIE1pcnJvciBvZlxuICogW2Bjb3BpbG90VG9vbERpc3BsYXkuZ2V0SW52b2NhdGlvbk1lc3NhZ2VgXSguLi9jb3BpbG90L2NvcGlsb3RUb29sRGlzcGxheS50cyNMNDczKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENsYXVkZUludm9jYXRpb25NZXNzYWdlKFxuXHR0b29sTmFtZTogc3RyaW5nLFxuXHRkaXNwbGF5TmFtZTogc3RyaW5nLFxuXHRpbnB1dDogdW5rbm93bixcbik6IFN0cmluZ09yTWFya2Rvd24ge1xuXHRjb25zdCBzZXJ2ZXJEaXNwbGF5ID0gZ2V0U2VydmVyVG9vbERpc3BsYXkodG9vbE5hbWUsIGlucHV0KT8uaW52b2NhdGlvbk1lc3NhZ2U7XG5cdGlmIChzZXJ2ZXJEaXNwbGF5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gc2VydmVyRGlzcGxheTtcblx0fVxuXHRzd2l0Y2ggKHRvb2xOYW1lKSB7XG5cdFx0Y2FzZSAnQmFzaCc6IHtcblx0XHRcdGNvbnN0IGZpcnN0TGluZSA9IGZpcnN0U2hlbGxMaW5lKGlucHV0KTtcblx0XHRcdGlmIChmaXJzdExpbmUpIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS5iYXNoQ21kJywgXCJSdW5uaW5nIHswfVwiLCBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKHRydW5jYXRlKGZpcnN0TGluZSwgODApKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS5iYXNoJywgXCJSdW5uaW5nIHNoZWxsIGNvbW1hbmRcIik7XG5cdFx0fVxuXHRcdGNhc2UgJ0Jhc2hPdXRwdXQnOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS5iYXNoT3V0cHV0JywgXCJSZWFkaW5nIHNoZWxsIG91dHB1dFwiKTtcblx0XHRjYXNlICdLaWxsQmFzaCc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sSW52b2tlLmtpbGxCYXNoJywgXCJLaWxsaW5nIHNoZWxsIGNvbW1hbmRcIik7XG5cdFx0Y2FzZSAnUmVhZCc6XG5cdFx0Y2FzZSAnTm90ZWJvb2tSZWFkJzoge1xuXHRcdFx0Y29uc3QgcGF0aCA9IGdldENsYXVkZVRvb2xQYXRoKHRvb2xOYW1lLCBpbnB1dCk7XG5cdFx0XHRpZiAocGF0aCkge1xuXHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ2NsYXVkZS50b29sSW52b2tlLnJlYWRGaWxlJywgXCJSZWFkaW5nIHswfVwiLCBmb3JtYXRQYXRoQXNNYXJrZG93bkxpbmsocGF0aCkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UucmVhZCcsIFwiUmVhZGluZyBmaWxlXCIpO1xuXHRcdH1cblx0XHRjYXNlICdMUyc6IHtcblx0XHRcdGNvbnN0IHBhdGggPSBnZXRDbGF1ZGVUb29sUGF0aCh0b29sTmFtZSwgaW5wdXQpO1xuXHRcdFx0aWYgKHBhdGgpIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS5sc1BhdGgnLCBcIkxpc3RpbmcgezB9XCIsIGZvcm1hdFBhdGhBc01hcmtkb3duTGluayhwYXRoKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS5scycsIFwiTGlzdGluZyBkaXJlY3RvcnlcIik7XG5cdFx0fVxuXHRcdGNhc2UgJ1dyaXRlJzpcblx0XHRjYXNlICdFZGl0Jzpcblx0XHRjYXNlICdNdWx0aUVkaXQnOlxuXHRcdGNhc2UgJ05vdGVib29rRWRpdCc6IHtcblx0XHRcdGNvbnN0IHBhdGggPSBnZXRDbGF1ZGVUb29sUGF0aCh0b29sTmFtZSwgaW5wdXQpO1xuXHRcdFx0aWYgKHBhdGgpIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS5lZGl0RmlsZScsIFwiRWRpdGluZyB7MH1cIiwgZm9ybWF0UGF0aEFzTWFya2Rvd25MaW5rKHBhdGgpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sSW52b2tlLmVkaXQnLCBcIkVkaXRpbmcgZmlsZVwiKTtcblx0XHR9XG5cdFx0Y2FzZSAnVG9kb1dyaXRlJzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UudG9kb1dyaXRlJywgXCJVcGRhdGluZyB0b2RvIGxpc3RcIik7XG5cdFx0Y2FzZSAnR3JlcCc6IHtcblx0XHRcdGNvbnN0IHBhdHRlcm4gPSByZWFkU3RyaW5nRmllbGQoaW5wdXQsICdwYXR0ZXJuJyk7XG5cdFx0XHRpZiAocGF0dGVybikge1xuXHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ2NsYXVkZS50b29sSW52b2tlLmdyZXBQYXR0ZXJuJywgXCJTZWFyY2hpbmcgZm9yIHswfVwiLCBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKHRydW5jYXRlKHBhdHRlcm4sIDgwKSkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UuZ3JlcCcsIFwiU2VhcmNoaW5nIGZpbGVzXCIpO1xuXHRcdH1cblx0XHRjYXNlICdHbG9iJzoge1xuXHRcdFx0Y29uc3QgcGF0dGVybiA9IHJlYWRTdHJpbmdGaWVsZChpbnB1dCwgJ3BhdHRlcm4nKTtcblx0XHRcdGlmIChwYXR0ZXJuKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UuZ2xvYlBhdHRlcm4nLCBcIkZpbmRpbmcgZmlsZXMgbWF0Y2hpbmcgezB9XCIsIGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUodHJ1bmNhdGUocGF0dGVybiwgODApKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS5nbG9iJywgXCJGaW5kaW5nIGZpbGVzXCIpO1xuXHRcdH1cblx0XHRjYXNlICdXZWJGZXRjaCc6IHtcblx0XHRcdGNvbnN0IHVybCA9IHJlYWRTdHJpbmdGaWVsZChpbnB1dCwgJ3VybCcpO1xuXHRcdFx0aWYgKHVybCkge1xuXHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ2NsYXVkZS50b29sSW52b2tlLndlYkZldGNoJywgXCJGZXRjaGluZyB7MH1cIiwgYFske2VzY2FwZU1hcmtkb3duTGlua0xhYmVsKHRydW5jYXRlKHVybCwgODApKX1dKCR7dXJsfSlgKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sSW52b2tlLndlYkZldGNoR2VuZXJpYycsIFwiRmV0Y2hpbmcgVVJMXCIpO1xuXHRcdH1cblx0XHRjYXNlICdUYXNrJzpcblx0XHRjYXNlICdBZ2VudCc6IHtcblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gcmVhZFN0cmluZ0ZpZWxkKGlucHV0LCAnZGVzY3JpcHRpb24nKTtcblx0XHRcdGlmIChkZXNjcmlwdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gZGVzY3JpcHRpb247XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZGlzcGxheU5hbWU7XG5cdFx0fVxuXHRcdGNhc2UgJ1NraWxsJzoge1xuXHRcdFx0Y29uc3Qgc2tpbGwgPSByZWFkU3RyaW5nRmllbGQoaW5wdXQsICdza2lsbCcpO1xuXHRcdFx0aWYgKHNraWxsKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2Uuc2tpbGxOYW1lZCcsIFwiUnVubmluZyBza2lsbCB7MH1cIiwgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSh0cnVuY2F0ZShza2lsbCwgODApKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS5za2lsbCcsIFwiUnVubmluZyBza2lsbFwiKTtcblx0XHR9XG5cdFx0Y2FzZSAnVGFza0NyZWF0ZSc6IHtcblx0XHRcdGNvbnN0IHN1YmplY3QgPSByZWFkU3RyaW5nRmllbGQoaW5wdXQsICdzdWJqZWN0Jyk7XG5cdFx0XHRpZiAoc3ViamVjdCkge1xuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sSW52b2tlLnRhc2tDcmVhdGVOYW1lZCcsIFwiQ3JlYXRpbmcgdGFzazogezB9XCIsIHRydW5jYXRlKHN1YmplY3QsIDgwKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sSW52b2tlLnRhc2tDcmVhdGUnLCBcIkNyZWF0aW5nIHRhc2tcIik7XG5cdFx0fVxuXHRcdGNhc2UgJ1Rhc2tVcGRhdGUnOlxuXHRcdFx0c3dpdGNoIChyZWFkVGFza1VwZGF0ZVN0YXR1cyhpbnB1dCkpIHtcblx0XHRcdFx0Y2FzZSAnaW5fcHJvZ3Jlc3MnOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sSW52b2tlLnRhc2tTdGFydCcsIFwiU3RhcnRpbmcgdGFza1wiKTtcblx0XHRcdFx0Y2FzZSAnY29tcGxldGVkJzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS50YXNrQ29tcGxldGUnLCBcIkNvbXBsZXRpbmcgdGFza1wiKTtcblx0XHRcdFx0Y2FzZSAnZGVsZXRlZCc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UudGFza0RlbGV0ZScsIFwiRGVsZXRpbmcgdGFza1wiKTtcblx0XHRcdFx0ZGVmYXVsdDogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS50YXNrVXBkYXRlJywgXCJVcGRhdGluZyB0YXNrXCIpO1xuXHRcdFx0fVxuXHRcdGNhc2UgJ1Rhc2tMaXN0Jzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xJbnZva2UudGFza0xpc3QnLCBcIlJlYWRpbmcgdGFzayBsaXN0XCIpO1xuXHRcdGNhc2UgJ1Rhc2tHZXQnOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbEludm9rZS50YXNrR2V0JywgXCJSZWFkaW5nIHRhc2tcIik7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBkaXNwbGF5TmFtZTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2xhdWRlU3RyZWFtaW5nSW52b2NhdGlvbk1lc3NhZ2UodG9vbE5hbWU6IHN0cmluZywgaW5wdXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogU3RyaW5nT3JNYXJrZG93biB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAodG9vbE5hbWUpIHtcblx0XHRjYXNlICdXcml0ZSc6XG5cdFx0XHRyZXR1cm4gZ2V0U3RyZWFtaW5nQ3JlYXRlTWVzc2FnZShpbnB1dD8uWydmaWxlX3BhdGgnXSwgc3RyZWFtaW5nVG9vbFRleHRMaW5lQ291bnQoaW5wdXQ/LlsnY29udGVudCddKSk7XG5cdFx0Y2FzZSAnRWRpdCc6XG5cdFx0XHRyZXR1cm4gZ2V0U3RyZWFtaW5nUmVwbGFjZU1lc3NhZ2UoXG5cdFx0XHRcdGlucHV0Py5bJ2ZpbGVfcGF0aCddLFxuXHRcdFx0XHRzdHJlYW1pbmdUb29sVGV4dExpbmVDb3VudChpbnB1dD8uWydvbGRfc3RyaW5nJ10pLFxuXHRcdFx0XHRzdHJlYW1pbmdUb29sVGV4dExpbmVDb3VudChpbnB1dD8uWyduZXdfc3RyaW5nJ10pLFxuXHRcdFx0KTtcblx0XHRjYXNlICdNdWx0aUVkaXQnOiB7XG5cdFx0XHRjb25zdCBlZGl0cyA9IEFycmF5LmlzQXJyYXkoaW5wdXQ/LlsnZWRpdHMnXSkgPyBpbnB1dFsnZWRpdHMnXSA6IFtdO1xuXHRcdFx0bGV0IG9sZExpbmVDb3VudDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IG5ld0xpbmVDb3VudDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChjb25zdCBlZGl0IG9mIGVkaXRzKSB7XG5cdFx0XHRcdGlmICghZWRpdCB8fCB0eXBlb2YgZWRpdCAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShlZGl0KSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG9sZExpbmVzID0gc3RyZWFtaW5nVG9vbFRleHRMaW5lQ291bnQoKGVkaXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pWydvbGRfc3RyaW5nJ10pO1xuXHRcdFx0XHRjb25zdCBuZXdMaW5lcyA9IHN0cmVhbWluZ1Rvb2xUZXh0TGluZUNvdW50KChlZGl0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVsnbmV3X3N0cmluZyddKTtcblx0XHRcdFx0aWYgKG9sZExpbmVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRvbGRMaW5lQ291bnQgPSAob2xkTGluZUNvdW50ID8/IDApICsgb2xkTGluZXM7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG5ld0xpbmVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRuZXdMaW5lQ291bnQgPSAobmV3TGluZUNvdW50ID8/IDApICsgbmV3TGluZXM7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBnZXRTdHJlYW1pbmdSZXBsYWNlTWVzc2FnZShpbnB1dD8uWydmaWxlX3BhdGgnXSwgb2xkTGluZUNvdW50LCBuZXdMaW5lQ291bnQpO1xuXHRcdH1cblx0XHRjYXNlICdOb3RlYm9va0VkaXQnOlxuXHRcdFx0cmV0dXJuIGdldFN0cmVhbWluZ0VkaXRNZXNzYWdlKGlucHV0Py5bJ25vdGVib29rX3BhdGgnXSwgc3RyZWFtaW5nVG9vbFRleHRMaW5lQ291bnQoaW5wdXQ/LlsnbmV3X3NvdXJjZSddKSk7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLyoqXG4gKiBQaGFzZSA4LjUgXHUyMDE0IHN1Y2Nlc3MtYXdhcmUgcmljaCBwYXN0LXRlbnNlIG1lc3NhZ2UuIE1pcnJvciBvZlxuICogW2Bjb3BpbG90VG9vbERpc3BsYXkuZ2V0UGFzdFRlbnNlTWVzc2FnZWBdKC4uL2NvcGlsb3QvY29waWxvdFRvb2xEaXNwbGF5LnRzI0w1NzIpLlxuICogRmFpbHVyZSBwYXRoIHJldHVybnMgYSBnZW5lcmljIFwiZmFpbGVkXCIgbWVzc2FnZTsgc3VjY2VzcyBwYXRoXG4gKiBtaXJyb3JzIHRoZSB7QGxpbmsgZ2V0Q2xhdWRlSW52b2NhdGlvbk1lc3NhZ2V9IHN0cnVjdHVyZSB3aXRoXG4gKiBwYXN0LXRlbnNlIHZlcmJzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2xhdWRlUGFzdFRlbnNlTWVzc2FnZShcblx0dG9vbE5hbWU6IHN0cmluZyxcblx0ZGlzcGxheU5hbWU6IHN0cmluZyxcblx0aW5wdXQ6IHVua25vd24sXG5cdHN1Y2Nlc3M6IGJvb2xlYW4sXG5cdHJlc3VsdFRleHQ/OiBzdHJpbmcsXG4pOiBTdHJpbmdPck1hcmtkb3duIHtcblx0aWYgKCFzdWNjZXNzKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbENvbXBsZXRlLmZhaWxlZCcsIFwiXFxcInswfVxcXCIgZmFpbGVkXCIsIGRpc3BsYXlOYW1lKTtcblx0fVxuXHRjb25zdCBzZXJ2ZXJEaXNwbGF5ID0gZ2V0U2VydmVyVG9vbERpc3BsYXkodG9vbE5hbWUsIGlucHV0LCB7IHRleHQ6IHJlc3VsdFRleHQsIHN1Y2Nlc3MgfSk/LnBhc3RUZW5zZU1lc3NhZ2U7XG5cdGlmIChzZXJ2ZXJEaXNwbGF5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gc2VydmVyRGlzcGxheTtcblx0fVxuXHRzd2l0Y2ggKHRvb2xOYW1lKSB7XG5cdFx0Y2FzZSAnQmFzaCc6IHtcblx0XHRcdGNvbnN0IGZpcnN0TGluZSA9IGZpcnN0U2hlbGxMaW5lKGlucHV0KTtcblx0XHRcdGlmIChmaXJzdExpbmUpIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCdjbGF1ZGUudG9vbENvbXBsZXRlLmJhc2hDbWQnLCBcIlJhbiB7MH1cIiwgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSh0cnVuY2F0ZShmaXJzdExpbmUsIDgwKSkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS5iYXNoJywgXCJSYW4gc2hlbGwgY29tbWFuZFwiKTtcblx0XHR9XG5cdFx0Y2FzZSAnQmFzaE91dHB1dCc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sQ29tcGxldGUuYmFzaE91dHB1dCcsIFwiUmVhZCBzaGVsbCBvdXRwdXRcIik7XG5cdFx0Y2FzZSAnS2lsbEJhc2gnOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbENvbXBsZXRlLmtpbGxCYXNoJywgXCJLaWxsZWQgc2hlbGwgY29tbWFuZFwiKTtcblx0XHRjYXNlICdSZWFkJzpcblx0XHRjYXNlICdOb3RlYm9va1JlYWQnOiB7XG5cdFx0XHRjb25zdCBwYXRoID0gZ2V0Q2xhdWRlVG9vbFBhdGgodG9vbE5hbWUsIGlucHV0KTtcblx0XHRcdGlmIChwYXRoKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS5yZWFkRmlsZScsIFwiUmVhZCB7MH1cIiwgZm9ybWF0UGF0aEFzTWFya2Rvd25MaW5rKHBhdGgpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sQ29tcGxldGUucmVhZCcsIFwiUmVhZCBmaWxlXCIpO1xuXHRcdH1cblx0XHRjYXNlICdMUyc6IHtcblx0XHRcdGNvbnN0IHBhdGggPSBnZXRDbGF1ZGVUb29sUGF0aCh0b29sTmFtZSwgaW5wdXQpO1xuXHRcdFx0aWYgKHBhdGgpIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCdjbGF1ZGUudG9vbENvbXBsZXRlLmxzUGF0aCcsIFwiTGlzdGVkIHswfVwiLCBmb3JtYXRQYXRoQXNNYXJrZG93bkxpbmsocGF0aCkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS5scycsIFwiTGlzdGVkIGRpcmVjdG9yeVwiKTtcblx0XHR9XG5cdFx0Y2FzZSAnV3JpdGUnOlxuXHRcdGNhc2UgJ0VkaXQnOlxuXHRcdGNhc2UgJ011bHRpRWRpdCc6XG5cdFx0Y2FzZSAnTm90ZWJvb2tFZGl0Jzoge1xuXHRcdFx0Y29uc3QgcGF0aCA9IGdldENsYXVkZVRvb2xQYXRoKHRvb2xOYW1lLCBpbnB1dCk7XG5cdFx0XHRpZiAocGF0aCkge1xuXHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ2NsYXVkZS50b29sQ29tcGxldGUuZWRpdEZpbGUnLCBcIkVkaXRlZCB7MH1cIiwgZm9ybWF0UGF0aEFzTWFya2Rvd25MaW5rKHBhdGgpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sQ29tcGxldGUuZWRpdCcsIFwiRWRpdGVkIGZpbGVcIik7XG5cdFx0fVxuXHRcdGNhc2UgJ1RvZG9Xcml0ZSc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sQ29tcGxldGUudG9kb1dyaXRlJywgXCJVcGRhdGVkIHRvZG8gbGlzdFwiKTtcblx0XHRjYXNlICdHcmVwJzoge1xuXHRcdFx0Y29uc3QgcGF0dGVybiA9IHJlYWRTdHJpbmdGaWVsZChpbnB1dCwgJ3BhdHRlcm4nKTtcblx0XHRcdGlmIChwYXR0ZXJuKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS5ncmVwUGF0dGVybicsIFwiU2VhcmNoZWQgZm9yIHswfVwiLCBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKHRydW5jYXRlKHBhdHRlcm4sIDgwKSkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS5ncmVwJywgXCJTZWFyY2hlZCBmaWxlc1wiKTtcblx0XHR9XG5cdFx0Y2FzZSAnR2xvYic6IHtcblx0XHRcdGNvbnN0IHBhdHRlcm4gPSByZWFkU3RyaW5nRmllbGQoaW5wdXQsICdwYXR0ZXJuJyk7XG5cdFx0XHRpZiAocGF0dGVybikge1xuXHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ2NsYXVkZS50b29sQ29tcGxldGUuZ2xvYlBhdHRlcm4nLCBcIkZvdW5kIGZpbGVzIG1hdGNoaW5nIHswfVwiLCBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKHRydW5jYXRlKHBhdHRlcm4sIDgwKSkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS5nbG9iJywgXCJGb3VuZCBmaWxlc1wiKTtcblx0XHR9XG5cdFx0Y2FzZSAnV2ViRmV0Y2gnOiB7XG5cdFx0XHRjb25zdCB1cmwgPSByZWFkU3RyaW5nRmllbGQoaW5wdXQsICd1cmwnKTtcblx0XHRcdGlmICh1cmwpIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCdjbGF1ZGUudG9vbENvbXBsZXRlLndlYkZldGNoJywgXCJGZXRjaGVkIHswfVwiLCBgWyR7ZXNjYXBlTWFya2Rvd25MaW5rTGFiZWwodHJ1bmNhdGUodXJsLCA4MCkpfV0oJHt1cmx9KWApKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS53ZWJGZXRjaEdlbmVyaWMnLCBcIkZldGNoZWQgVVJMXCIpO1xuXHRcdH1cblx0XHRjYXNlICdUYXNrJzpcblx0XHRjYXNlICdBZ2VudCc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sQ29tcGxldGUudGFzaycsIFwiUmFuIHN1YmFnZW50XCIpO1xuXHRcdGNhc2UgJ1NraWxsJzoge1xuXHRcdFx0Y29uc3Qgc2tpbGwgPSByZWFkU3RyaW5nRmllbGQoaW5wdXQsICdza2lsbCcpO1xuXHRcdFx0aWYgKHNraWxsKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS5za2lsbE5hbWVkJywgXCJSYW4gc2tpbGwgezB9XCIsIGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUodHJ1bmNhdGUoc2tpbGwsIDgwKSkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS5za2lsbCcsIFwiUmFuIHNraWxsXCIpO1xuXHRcdH1cblx0XHRjYXNlICdUYXNrQ3JlYXRlJzoge1xuXHRcdFx0Y29uc3Qgc3ViamVjdCA9IHJlYWRTdHJpbmdGaWVsZChpbnB1dCwgJ3N1YmplY3QnKTtcblx0XHRcdGlmIChzdWJqZWN0KSB7XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS50YXNrQ3JlYXRlTmFtZWQnLCBcIkNyZWF0ZWQgdGFzazogezB9XCIsIHRydW5jYXRlKHN1YmplY3QsIDgwKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sQ29tcGxldGUudGFza0NyZWF0ZScsIFwiQ3JlYXRlZCB0YXNrXCIpO1xuXHRcdH1cblx0XHRjYXNlICdUYXNrVXBkYXRlJzpcblx0XHRcdHN3aXRjaCAocmVhZFRhc2tVcGRhdGVTdGF0dXMoaW5wdXQpKSB7XG5cdFx0XHRcdGNhc2UgJ2luX3Byb2dyZXNzJzogcmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbENvbXBsZXRlLnRhc2tTdGFydCcsIFwiU3RhcnRlZCB0YXNrXCIpO1xuXHRcdFx0XHRjYXNlICdjb21wbGV0ZWQnOiByZXR1cm4gbG9jYWxpemUoJ2NsYXVkZS50b29sQ29tcGxldGUudGFza0NvbXBsZXRlJywgXCJDb21wbGV0ZWQgdGFza1wiKTtcblx0XHRcdFx0Y2FzZSAnZGVsZXRlZCc6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS50YXNrRGVsZXRlJywgXCJEZWxldGVkIHRhc2tcIik7XG5cdFx0XHRcdGRlZmF1bHQ6IHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS50YXNrVXBkYXRlJywgXCJVcGRhdGVkIHRhc2tcIik7XG5cdFx0XHR9XG5cdFx0Y2FzZSAnVGFza0xpc3QnOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUudG9vbENvbXBsZXRlLnRhc2tMaXN0JywgXCJSZWFkIHRhc2sgbGlzdFwiKTtcblx0XHRjYXNlICdUYXNrR2V0Jzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnRvb2xDb21wbGV0ZS50YXNrR2V0JywgXCJSZWFkIHRhc2tcIik7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBkaXNwbGF5TmFtZTtcblx0fVxufVxuXG4vKipcbiAqIFBoYXNlIDguNSBcdTIwMTQgY2Fub25pY2FsIFwiaW5wdXQgYXMgY29kZVwiIHN0cmluZyByZW5kZXJlZCB1bmRlciB0aGVcbiAqIHRvb2wtY2FsbCByb3cuIFNoZWxsIHRvb2xzIHN1cmZhY2UgdGhlIHJhdyBgY29tbWFuZGA7IHNlYXJjaCB0b29sc1xuICogc3VyZmFjZSB0aGUgYHBhdHRlcm5gOyBldmVyeXRoaW5nIGVsc2UgZmFsbHMgYmFjayB0byBwcmV0dHktcHJpbnRlZFxuICogSlNPTi4gUmV0dXJucyBgdW5kZWZpbmVkYCBvbmx5IHdoZW4gdGhlIGlucHV0IGlzIGl0c2VsZiBhYnNlbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGF1ZGVUb29sSW5wdXRTdHJpbmcodG9vbE5hbWU6IHN0cmluZywgaW5wdXQ6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoaW5wdXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHRvb2xOYW1lID09PSAnQmFzaCcgfHwgdG9vbE5hbWUgPT09ICdCYXNoT3V0cHV0JyB8fCB0b29sTmFtZSA9PT0gJ0tpbGxCYXNoJykge1xuXHRcdGNvbnN0IGNvbW1hbmQgPSByZWFkU3RyaW5nRmllbGQoaW5wdXQsICdjb21tYW5kJyk7XG5cdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdHJldHVybiBjb21tYW5kO1xuXHRcdH1cblx0fVxuXHRpZiAodG9vbE5hbWUgPT09ICdHcmVwJyB8fCB0b29sTmFtZSA9PT0gJ0dsb2InKSB7XG5cdFx0Y29uc3QgcGF0dGVybiA9IHJlYWRTdHJpbmdGaWVsZChpbnB1dCwgJ3BhdHRlcm4nKTtcblx0XHRpZiAocGF0dGVybikge1xuXHRcdFx0cmV0dXJuIHBhdHRlcm47XG5cdFx0fVxuXHR9XG5cdHRyeSB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGlucHV0LCBudWxsLCAyKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vLyAjZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlDQUFpQywrQkFBK0I7QUFDekUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMkJBQTJCLHlCQUF5Qiw0QkFBNEIsa0NBQWtDO0FBQzNILFNBQVMsc0JBQXlEO0FBRWxFLFNBQVMsNEJBQTRCO0FBaUZyQyxNQUFNLFlBQTREO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTWpFLE1BQU0sRUFBRSxnQkFBZ0IsU0FBUyxVQUFVLFdBQVc7QUFBQSxFQUN0RCxZQUFZLEVBQUUsZ0JBQWdCLFNBQVMsVUFBVSxXQUFXO0FBQUEsRUFDNUQsVUFBVSxFQUFFLGdCQUFnQixTQUFTLFVBQVUsV0FBVztBQUFBO0FBQUEsRUFHMUQsTUFBTSxFQUFFLGdCQUFnQixRQUFRLFdBQVcsWUFBWTtBQUFBLEVBQ3ZELE1BQU0sRUFBRSxnQkFBZ0IsUUFBUSxXQUFXLFFB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Q2IsWUFBTSxRQUFRLGdCQUFnQixPQUFPLE9BQU87QUFDNUMsVUFBSSxPQUFPO0FBQ1YsZUFBTyxHQUFHLFNBQVMsa0NBQWtDLGlCQUFpQixnQ0FBZ0MsU0FBUyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUM1SDtBQUNBLGFBQU8sU0FBUyw2QkFBNkIsV0FBVztBQUFBLElBQ3pEO0FBQUEsSUFDQSxLQUFLLGNBQWM7QUFDbEIsWUFBTSxVQUFVLGdCQUFnQixPQUFPLFNBQVM7QUFDaEQsVUFBSSxTQUFTO0FBQ1osZUFBTyxTQUFTLHVDQUF1QyxxQkFBcUIsU0FBUyxTQUFTLEVBQUUsQ0FBQztBQUFBLE1BQ2xHO0FBQ0EsYUFBTyxTQUFTLGtDQUFrQyxjQUFjO0FBQUEsSUFDakU7QUFBQSxJQUNBLEtBQUs7QUFDSixjQUFRLHFCQUFxQixLQUFLLEdBQUc7QUFBQSxRQUNwQyxLQUFLO0FBQWUsaUJBQU8sU0FBUyxpQ0FBaUMsY0FBYztBQUFBLFFBQ25GLEtBQUs7QUFBYSxpQkFBTyxTQUFTLG9DQUFvQyxnQkFBZ0I7QUFBQSxRQUN0RixLQUFLO0FBQVcsaUJBQU8sU0FBUyxrQ0FBa0MsY0FBYztBQUFBLFFBQ2hGO0FBQVMsaUJBQU8sU0FBUyxrQ0FBa0MsY0FBYztBQUFBLE1BQzFFO0FBQUEsSUFDRCxLQUFLO0FBQ0osYUFBTyxTQUFTLGdDQUFnQyxnQkFBZ0I7QUFBQSxJQUNqRSxLQUFLO0FBQ0osYUFBTyxTQUFTLCtCQUErQixXQUFXO0FBQUEsSUFDM0Q7QUFDQyxhQUFPO0FBQUEsRUFDVDtBQUNEO0FBUU8sU0FBUyx5QkFBeUIsVUFBa0IsT0FBb0M7QUFDOUYsTUFBSSxVQUFVLFFBQVc7QUFDeEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLGFBQWEsVUFBVSxhQUFhLGdCQUFnQixhQUFhLFlBQVk7QUFDaEYsVUFBTSxVQUFVLGdCQUFnQixPQUFPLFNBQVM7QUFDaEQsUUFBSSxTQUFTO0FBQ1osYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0EsTUFBSSxhQUFhLFVBQVUsYUFBYSxRQUFRO0FBQy9DLFVBQU0sVUFBVSxnQkFBZ0IsT0FBTyxTQUFTO0FBQ2hELFFBQUksU0FBUztBQUNaLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNBLE1BQUk7QUFDSCxXQUFPLEtBQUssVUFBVSxPQUFPLE1BQU0sQ0FBQztBQUFBLEVBQ3JDLFFBQVE7QUFDUCxXQUFPO0FBQUEsRUFDUjtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
