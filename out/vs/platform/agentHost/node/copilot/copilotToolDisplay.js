import { hasKey } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { appendEscapedMarkdownInlineCode, escapeMarkdownLinkLabel, MarkdownString } from "../../../../base/common/htmlContent.js";
import { hash } from "../../../../base/common/hash.js";
import { localize } from "../../../../nls.js";
import { stripRedundantCdPrefix } from "../../common/commandLineHelpers.js";
import { parsePartialToolInput } from "../../common/partialToolInput.js";
import { basename } from "../../../../base/common/resources.js";
import { getStreamingCreateMessage, getStreamingInsertMessage, getStreamingPatchMessage, getStreamingReplaceMessage, streamingToolTextLineCount } from "../../common/streamingToolCallDisplay.js";
import { getServerToolDisplay } from "../shared/serverToolGroups.js";
var CopilotToolName = /* @__PURE__ */ ((CopilotToolName2) => {
  CopilotToolName2["StrReplaceEditor"] = "str_replace_editor";
  CopilotToolName2["StrReplace"] = "str_replace";
  CopilotToolName2["Insert"] = "insert";
  CopilotToolName2["Bash"] = "bash";
  CopilotToolName2["ReadBash"] = "read_bash";
  CopilotToolName2["WriteBash"] = "write_bash";
  CopilotToolName2["StopBash"] = "stop_bash";
  CopilotToolName2["BashShutdown"] = "bash_shutdown";
  CopilotToolName2["ListBash"] = "list_bash";
  CopilotToolName2["PowerShell"] = "powershell";
  CopilotToolName2["ReadPowerShell"] = "read_powershell";
  CopilotToolName2["WritePowerShell"] = "write_powershell";
  CopilotToolName2["StopPowerShell"] = "stop_powershell";
  CopilotToolName2["PowerShellShutdown"] = "powershell_shutdown";
  CopilotToolName2["ListPowerShell"] = "list_powershell";
  CopilotToolName2["View"] = "view";
  CopilotToolName2["Edit"] = "edit";
  CopilotToolName2["Create"] = "create";
  CopilotToolName2["Grep"] = "grep";
  CopilotToolName2["Rg"] = "rg";
  CopilotToolName2["Glob"] = "glob";
  CopilotToolName2["SearchCodeSubagent"] = "search_code_subagent";
  CopilotToolName2["ReplyToComment"] = "reply_to_comment";
  CopilotToolName2["CodeReview"] = "code_review";
  CopilotToolName2["ApplyPatch"] = "apply_patch";
  CopilotToolName2["GitApplyPatch"] = "git_apply_patch";
  CopilotToolName2["WebSearch"] = "web_search";
  CopilotToolName2["WebFetch"] = "web_fetch";
  CopilotToolName2["AskUser"] = "ask_user";
  CopilotToolName2["ReportIntent"] = "report_intent";
  CopilotToolName2["Think"] = "think";
  CopilotToolName2["ReportProgress"] = "report_progress";
  CopilotToolName2["UpdateTodo"] = "update_todo";
  CopilotToolName2["ShowFile"] = "show_file";
  CopilotToolName2["FetchCopilotCliDocumentation"] = "fetch_copilot_cli_documentation";
  CopilotToolName2["ProposeWork"] = "propose_work";
  CopilotToolName2["TaskComplete"] = "task_complete";
  CopilotToolName2["Skill"] = "skill";
  CopilotToolName2["Task"] = "task";
  CopilotToolName2["ListAgents"] = "list_agents";
  CopilotToolName2["ReadAgent"] = "read_agent";
  CopilotToolName2["ExitPlanMode"] = "exit_plan_mode";
  CopilotToolName2["Sql"] = "sql";
  CopilotToolName2["Lsp"] = "lsp";
  CopilotToolName2["CreatePullRequest"] = "create_pull_request";
  CopilotToolName2["GhAdvisoryDatabase"] = "gh-advisory-database";
  CopilotToolName2["StoreMemory"] = "store_memory";
  CopilotToolName2["ParallelValidation"] = "parallel_validation";
  CopilotToolName2["WriteAgent"] = "write_agent";
  CopilotToolName2["McpReload"] = "mcp_reload";
  CopilotToolName2["McpValidate"] = "mcp_validate";
  CopilotToolName2["ToolSearchToolRegex"] = "tool_search_tool_regex";
  CopilotToolName2["CodeqlChecker"] = "codeql_checker";
  return CopilotToolName2;
})(CopilotToolName || {});
function formatViewRange(view_range) {
  if (!Array.isArray(view_range) || view_range.length !== 2) {
    return void 0;
  }
  const [startLine, endLine] = view_range;
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
    return void 0;
  }
  if (startLine < 0) {
    return void 0;
  }
  if (endLine !== -1 && endLine < startLine) {
    return void 0;
  }
  return { startLine, endLine };
}
function getAgentId(parameters) {
  const agentId = parameters?.agent_id;
  return typeof agentId === "string" && agentId.length > 0 ? agentId : void 0;
}
const APPLY_PATCH_FILE_HEADERS = [
  /^\s*\*\*\*\s+Update File:\s*(.+?)\s*$/,
  /^\s*\*\*\*\s+Add File:\s*(.+?)\s*$/,
  /^\s*\*\*\*\s+Delete File:\s*(.+?)\s*$/,
  /^\s*\*\*\*\s+Move to:\s*(.+?)\s*$/
];
function getApplyPatchFiles(args) {
  const text = typeof args === "string" ? args : args?.input ?? args?.patch;
  if (typeof text !== "string" || text.length === 0) {
    return [];
  }
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const line of text.split("\n")) {
    for (const re of APPLY_PATCH_FILE_HEADERS) {
      const m = re.exec(line);
      if (m) {
        const path = m[1];
        if (path && !seen.has(path)) {
          seen.add(path);
          out.push(path);
        }
        break;
      }
    }
  }
  return out;
}
const EDIT_TOOL_NAMES = /* @__PURE__ */ new Set([
  "edit" /* Edit */,
  "str_replace" /* StrReplace */,
  "insert" /* Insert */,
  "create" /* Create */,
  "apply_patch" /* ApplyPatch */,
  "git_apply_patch" /* GitApplyPatch */
]);
const STR_REPLACE_EDITOR_EDIT_COMMANDS = /* @__PURE__ */ new Set([
  "edit" /* Edit */,
  "str_replace" /* StrReplace */,
  "insert" /* Insert */,
  "create" /* Create */
]);
function isEditTool(toolName, command) {
  if (EDIT_TOOL_NAMES.has(toolName)) {
    return true;
  }
  if (toolName === "str_replace_editor" /* StrReplaceEditor */) {
    return command !== void 0 && STR_REPLACE_EDITOR_EDIT_COMMANDS.has(command);
  }
  return false;
}
function getEditFilePath(parameters) {
  return getEditFilePaths(parameters)[0];
}
function getEditFilePaths(parameters) {
  if (typeof parameters === "string") {
    try {
      parameters = JSON.parse(parameters);
    } catch {
      return getApplyPatchFiles(parameters);
    }
    if (typeof parameters === "string") {
      return getApplyPatchFiles(parameters);
    }
  }
  if (!parameters || typeof parameters !== "object") {
    return [];
  }
  const patchArgs = parameters;
  if (typeof patchArgs.input === "string" || typeof patchArgs.patch === "string") {
    return getApplyPatchFiles(patchArgs);
  }
  const args = parameters;
  return typeof args.path === "string" ? [args.path] : [];
}
const SHELL_TOOL_NAMES = /* @__PURE__ */ new Set([
  "bash" /* Bash */,
  "powershell" /* PowerShell */
]);
const WRITE_SHELL_TOOL_NAMES = /* @__PURE__ */ new Set([
  "write_bash" /* WriteBash */,
  "write_powershell" /* WritePowerShell */
]);
const READ_SHELL_TOOL_NAMES = /* @__PURE__ */ new Set([
  "read_bash" /* ReadBash */,
  "read_powershell" /* ReadPowerShell */
]);
const SUBAGENT_TOOL_NAMES = /* @__PURE__ */ new Set([
  "task"
]);
const SEARCH_TOOL_NAMES = /* @__PURE__ */ new Set([
  "grep" /* Grep */,
  "rg" /* Rg */,
  "glob" /* Glob */
]);
const HIDDEN_TOOL_NAMES = /* @__PURE__ */ new Set([
  "report_intent" /* ReportIntent */,
  "skill" /* Skill */
]);
function isHiddenTool(toolName) {
  return HIDDEN_TOOL_NAMES.has(toolName);
}
function isAgentCoordinationTool(toolName) {
  return toolName === "list_agents" /* ListAgents */ || toolName === "read_agent" /* ReadAgent */ || toolName === "write_agent" /* WriteAgent */;
}
function isTaskCompleteTool(toolName) {
  return toolName === "task_complete" /* TaskComplete */;
}
function getTaskCompleteSummary(parameters, toolOutput) {
  if (toolOutput && toolOutput.trim().length > 0) {
    return toolOutput;
  }
  const summary = parameters?.summary;
  return typeof summary === "string" && summary.trim().length > 0 ? summary : void 0;
}
function getTaskCompleteMarkdown(parameters, toolOutput) {
  const summary = getTaskCompleteSummary(parameters, toolOutput);
  if (!summary) {
    return void 0;
  }
  return "\n\n" + localize("toolMarkdown.taskComplete", "**Task completed:** {0}", summary);
}
function isMarkdownRenderedTool(toolName) {
  return isTaskCompleteTool(toolName);
}
function getToolMarkdownContent(toolName, parameters) {
  if (!isMarkdownRenderedTool(toolName)) {
    return void 0;
  }
  const summary = getTaskCompleteSummary(parameters, void 0);
  if (!summary) {
    return void 0;
  }
  return getTaskCompleteMarkdown(parameters, void 0);
}
function isShellTool(toolName) {
  return SHELL_TOOL_NAMES.has(toolName);
}
function getShellIntention(toolName, parameters) {
  if (isShellTool(toolName) && typeof parameters?.description === "string" && parameters.description.length > 0) {
    return parameters.description;
  }
  return void 0;
}
function truncate(text, maxLength) {
  return text.length > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
}
function formatPathAsMarkdownLink(path) {
  const uri = URI.file(path);
  return `[${escapeMarkdownLinkLabel(basename(uri))}](${uri})`;
}
function formatUrlAsMarkdownLink(url) {
  return new MarkdownString().appendLink(url, truncate(url, 80)).value;
}
function md(value) {
  return { markdown: value };
}
const identityPathResolver = (path) => path;
function parseCopilotStreamingToolInput(raw) {
  return parsePartialToolInput(raw) ?? raw;
}
function getToolDisplayName(toolName) {
  const serverDisplay = getServerToolDisplay(toolName, void 0)?.displayName;
  if (serverDisplay !== void 0) {
    return serverDisplay;
  }
  switch (toolName) {
    case "str_replace_editor" /* StrReplaceEditor */:
    case "edit" /* Edit */:
    case "str_replace" /* StrReplace */:
    case "insert" /* Insert */:
      return localize("toolName.edit", "Edit File");
    case "create" /* Create */:
      return localize("toolName.create", "Create File");
    case "view" /* View */:
      return localize("toolName.read", "Read");
    case "bash" /* Bash */:
    case "powershell" /* PowerShell */:
      return localize("toolName.shell", "Run Shell Command");
    case "read_bash" /* ReadBash */:
    case "read_powershell" /* ReadPowerShell */:
      return localize("toolName.readTerminal", "Read Terminal");
    case "write_bash" /* WriteBash */:
      return localize("toolName.writeBash", "Write to Bash");
    case "write_powershell" /* WritePowerShell */:
      return localize("toolName.writePowerShell", "Write to PowerShell");
    case "stop_bash" /* StopBash */:
    case "stop_powershell" /* StopPowerShell */:
    case "bash_shutdown" /* BashShutdown */:
    case "powershell_shutdown" /* PowerShellShutdown */:
      return localize("toolName.stopShell", "Stop Terminal Session");
    case "list_bash" /* ListBash */:
    case "list_powershell" /* ListPowerShell */:
      return localize("toolName.listShellSessions", "List Shell Sessions");
    case "grep" /* Grep */:
    case "rg" /* Rg */:
    case "glob" /* Glob */:
      return localize("toolName.search", "Search");
    case "search_code_subagent" /* SearchCodeSubagent */:
      return localize("toolName.searchCode", "Search Code");
    case "apply_patch" /* ApplyPatch */:
      return localize("toolName.applyPatch", "Apply Patch");
    case "git_apply_patch" /* GitApplyPatch */:
      return localize("toolName.patch", "Patch");
    case "codeql_checker" /* CodeqlChecker */:
      return localize("toolName.codeqlChecker", "CodeQL Security Scan");
    case "code_review" /* CodeReview */:
      return localize("toolName.codeReview", "Code Review");
    case "reply_to_comment" /* ReplyToComment */:
      return localize("toolName.replyToComment", "Reply to Comment");
    case "think" /* Think */:
      return localize("toolName.think", "Thinking");
    case "report_intent" /* ReportIntent */:
      return localize("toolName.reportIntent", "Report Intent");
    case "report_progress" /* ReportProgress */:
      return localize("toolName.reportProgress", "Progress update");
    case "web_search" /* WebSearch */:
      return localize("toolName.webSearch", "Web Search");
    case "web_fetch" /* WebFetch */:
      return localize("toolName.fetchWebContent", "Fetch Web Content");
    case "update_todo" /* UpdateTodo */:
      return localize("toolName.updateTodo", "Update Todo");
    case "show_file" /* ShowFile */:
      return localize("toolName.showFile", "Show File");
    case "fetch_copilot_cli_documentation" /* FetchCopilotCliDocumentation */:
      return localize("toolName.fetchCopilotCliDocumentation", "Fetch Documentation");
    case "propose_work" /* ProposeWork */:
      return localize("toolName.proposeWork", "Propose Work");
    case "task_complete" /* TaskComplete */:
      return localize("toolName.taskComplete", "Task Complete");
    case "ask_user" /* AskUser */:
      return localize("toolName.askUser", "Ask User");
    case "skill" /* Skill */:
      return localize("toolName.invokeSkill", "Invoke Skill");
    case "task" /* Task */:
      return localize("toolName.task", "Delegate Task");
    case "list_agents" /* ListAgents */:
      return localize("toolName.listAgents", "List Agents");
    case "read_agent" /* ReadAgent */:
      return localize("toolName.readAgent", "Read Agent");
    case "exit_plan_mode" /* ExitPlanMode */:
      return localize("toolName.exitPlanModeFull", "Exit Plan Mode");
    case "sql" /* Sql */:
      return localize("toolName.sql", "Execute SQL");
    case "lsp" /* Lsp */:
      return localize("toolName.lsp", "Language Server");
    case "create_pull_request" /* CreatePullRequest */:
      return localize("toolName.createPullRequest", "Create Pull Request");
    case "gh-advisory-database" /* GhAdvisoryDatabase */:
      return localize("toolName.ghAdvisoryDatabase", "Check Dependencies");
    case "store_memory" /* StoreMemory */:
      return localize("toolName.storeMemory", "Store Memory");
    case "parallel_validation" /* ParallelValidation */:
      return localize("toolName.parallelValidation", "Validate Changes");
    case "write_agent" /* WriteAgent */:
      return localize("toolName.writeAgent", "Write to Agent");
    case "mcp_reload" /* McpReload */:
      return localize("toolName.mcpReload", "Reload MCP Config");
    case "mcp_validate" /* McpValidate */:
      return localize("toolName.mcpValidate", "Validate MCP Config");
    case "tool_search_tool_regex" /* ToolSearchToolRegex */:
      return localize("toolName.toolSearchToolRegex", "Search Tools");
    default:
      return toolName;
  }
}
function getInvocationMessage(toolName, displayName, parameters, resolvePath = identityPathResolver) {
  const serverDisplay = getServerToolDisplay(toolName, parameters)?.invocationMessage;
  if (serverDisplay !== void 0) {
    return serverDisplay;
  }
  if (SHELL_TOOL_NAMES.has(toolName)) {
    const args = parameters;
    if (args?.command) {
      const firstLine = args.command.split("\n")[0];
      return md(localize("toolInvoke.shellCmd", "Running {0}", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
    }
    return localize("toolInvoke.shell", "Running {0} command", displayName);
  }
  if (WRITE_SHELL_TOOL_NAMES.has(toolName)) {
    const args = parameters;
    if (args?.command) {
      const firstLine = args.command.split("\n")[0];
      return md(localize("toolInvoke.writeShellCmd", "Sending {0} to shell", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
    }
    return localize("toolInvoke.writeShell", "Sending input to shell");
  }
  if (READ_SHELL_TOOL_NAMES.has(toolName)) {
    return localize("toolInvoke.readTerminal", "Reading Terminal");
  }
  switch (toolName) {
    case "view" /* View */: {
      const args = parameters;
      if (typeof args?.path === "string" && args.path) {
        const link = formatPathAsMarkdownLink(resolvePath(args.path));
        const range = formatViewRange(args.view_range);
        if (range) {
          if (range.endLine === -1) {
            return md(localize("toolInvoke.viewFileFromLine", "Reading {0}, line {1} to the end", link, range.startLine));
          }
          if (range.endLine !== range.startLine) {
            return md(localize("toolInvoke.viewFileRange", "Reading {0}, lines {1} to {2}", link, range.startLine, range.endLine));
          }
          return md(localize("toolInvoke.viewFileLine", "Reading {0}, line {1}", link, range.startLine));
        }
        return md(localize("toolInvoke.viewFile", "Reading {0}", link));
      }
      return localize("toolInvoke.view", "Reading file");
    }
    case "edit" /* Edit */:
    case "str_replace" /* StrReplace */: {
      const args = parameters;
      if (typeof args?.path === "string" && args.path) {
        return md(localize("toolInvoke.editFile", "Editing {0}", formatPathAsMarkdownLink(resolvePath(args.path))));
      }
      return localize("toolInvoke.edit", "Editing file");
    }
    case "insert" /* Insert */: {
      const args = parameters;
      if (typeof args?.path === "string" && args.path) {
        return md(localize("toolInvoke.insertFile", "Inserting text in {0}", formatPathAsMarkdownLink(resolvePath(args.path))));
      }
      return localize("toolInvoke.insert", "Inserting text");
    }
    case "create" /* Create */: {
      const args = parameters;
      if (typeof args?.path === "string" && args.path) {
        return md(localize("toolInvoke.createFile", "Creating {0}", formatPathAsMarkdownLink(resolvePath(args.path))));
      }
      return localize("toolInvoke.create", "Creating file");
    }
    case "str_replace_editor" /* StrReplaceEditor */: {
      const command = parameters?.command;
      switch (command) {
        case "view":
          return getInvocationMessage("view" /* View */, displayName, parameters, resolvePath);
        case "create":
          return getInvocationMessage("create" /* Create */, displayName, parameters, resolvePath);
        case "insert":
          return getInvocationMessage("insert" /* Insert */, displayName, parameters, resolvePath);
        case "edit":
        case "str_replace":
        default:
          return getInvocationMessage("edit" /* Edit */, displayName, parameters, resolvePath);
      }
    }
    case "grep" /* Grep */: {
      const args = parameters;
      if (args?.pattern) {
        return md(localize("toolInvoke.grepPattern", "Searching for {0}", appendEscapedMarkdownInlineCode(truncate(args.pattern, 80))));
      }
      return localize("toolInvoke.grep", "Searching files");
    }
    case "rg" /* Rg */: {
      const args = parameters;
      if (args?.pattern) {
        return md(localize("toolInvoke.grepPattern", "Searching for {0}", appendEscapedMarkdownInlineCode(truncate(args.pattern, 80))));
      }
      return localize("toolInvoke.grep", "Searching files");
    }
    case "glob" /* Glob */: {
      const args = parameters;
      if (args?.pattern) {
        return md(localize("toolInvoke.globPattern", "Finding files matching {0}", appendEscapedMarkdownInlineCode(truncate(args.pattern, 80))));
      }
      return localize("toolInvoke.glob", "Finding files");
    }
    case "apply_patch" /* ApplyPatch */:
    case "git_apply_patch" /* GitApplyPatch */: {
      const files = getEditFilePaths(parameters).map(resolvePath);
      if (files.length === 1) {
        return md(localize("toolInvoke.patchFile", "Editing {0}", formatPathAsMarkdownLink(files[0])));
      }
      if (files.length > 1) {
        return md(localize("toolInvoke.patchFiles", "Editing {0}", files.map(formatPathAsMarkdownLink).join(", ")));
      }
      return localize("toolInvoke.patch", "Editing files");
    }
    case "sql" /* Sql */: {
      const args = parameters;
      return args?.description || localize("toolInvoke.sql", "Executing SQL query");
    }
    case "web_fetch" /* WebFetch */: {
      const args = parameters;
      if (args?.url) {
        return md(localize("toolInvoke.webFetch", "Fetching {0}", formatUrlAsMarkdownLink(args.url)));
      }
      return localize("toolInvoke.webFetchGeneric", "Fetching URL");
    }
    case "exit_plan_mode" /* ExitPlanMode */:
      return localize("toolInvoke.exitPlanMode", "Presenting plan");
    case "task" /* Task */:
      return localize("toolInvoke.task", "Delegating task");
    // The agent-coordination tools (list/read/write agents) are fast, so
    // they use a single message for both the running and completed states:
    // the past-tense phrasing. See getPastTenseMessage.
    case "list_agents" /* ListAgents */:
    case "read_agent" /* ReadAgent */:
    case "write_agent" /* WriteAgent */:
      return getPastTenseMessage(toolName, displayName, parameters, true);
    default:
      return displayName;
  }
}
function getStreamingInvocationMessage(toolName, displayName, parameters, resolvePath = identityPathResolver) {
  const objectParameters = parameters !== null && typeof parameters === "object" && !Array.isArray(parameters) ? parameters : void 0;
  switch (toolName) {
    case "edit" /* Edit */:
    case "str_replace" /* StrReplace */: {
      const args = objectParameters;
      return getStreamingReplaceMessage(args?.path, streamingToolTextLineCount(args?.old_str), streamingToolTextLineCount(args?.new_str), resolvePath);
    }
    case "create" /* Create */: {
      const args = objectParameters;
      return getStreamingCreateMessage(args?.path, streamingToolTextLineCount(args?.file_text), resolvePath);
    }
    case "insert" /* Insert */: {
      const args = objectParameters;
      return getStreamingInsertMessage(args?.path, streamingToolTextLineCount(args?.new_str), resolvePath);
    }
    case "str_replace_editor" /* StrReplaceEditor */: {
      const args = objectParameters;
      const command = args?.command;
      switch (command) {
        case "view":
          return getInvocationMessage("view" /* View */, displayName, objectParameters, resolvePath);
        case "create":
          return getStreamingCreateMessage(args?.path, streamingToolTextLineCount(args?.file_text), resolvePath);
        case "insert":
          return getStreamingInsertMessage(args?.path, streamingToolTextLineCount(args?.new_str), resolvePath);
        case "edit":
        case "str_replace":
        default:
          return getStreamingReplaceMessage(args?.path, streamingToolTextLineCount(args?.old_str), streamingToolTextLineCount(args?.new_str), resolvePath);
      }
    }
    case "apply_patch" /* ApplyPatch */:
    case "git_apply_patch" /* GitApplyPatch */: {
      const args = objectParameters;
      const patch = typeof parameters === "string" ? parameters : args?.input ?? args?.patch;
      return getStreamingPatchMessage(getEditFilePaths(parameters), streamingToolTextLineCount(patch), resolvePath);
    }
    default:
      return getInvocationMessage(toolName, displayName, objectParameters, resolvePath);
  }
}
function getPastTenseMessage(toolName, displayName, parameters, success, resultText, resolvePath = identityPathResolver) {
  if (!success) {
    return localize("toolComplete.failed", '"{0}" failed', displayName);
  }
  const serverDisplay = getServerToolDisplay(toolName, parameters, { text: resultText, success })?.pastTenseMessage;
  if (serverDisplay !== void 0) {
    return serverDisplay;
  }
  if (SHELL_TOOL_NAMES.has(toolName)) {
    const args = parameters;
    if (args?.command) {
      const firstLine = args.command.split("\n")[0];
      return md(localize("toolComplete.shellCmd", "Ran {0}", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
    }
    return localize("toolComplete.shell", "Ran {0} command", displayName);
  }
  if (WRITE_SHELL_TOOL_NAMES.has(toolName)) {
    const args = parameters;
    if (args?.command) {
      const firstLine = args.command.split("\n")[0];
      return md(localize("toolComplete.writeShellCmd", "Sent {0} to shell", appendEscapedMarkdownInlineCode(truncate(firstLine, 80))));
    }
    return localize("toolComplete.writeShell", "Sent input to shell");
  }
  if (READ_SHELL_TOOL_NAMES.has(toolName)) {
    return localize("toolComplete.readTerminal", "Read Terminal");
  }
  switch (toolName) {
    case "view" /* View */: {
      const args = parameters;
      if (typeof args?.path === "string" && args.path) {
        const link = formatPathAsMarkdownLink(resolvePath(args.path));
        const range = formatViewRange(args.view_range);
        if (range) {
          if (range.endLine === -1) {
            return md(localize("toolComplete.viewFileFromLine", "Read {0}, line {1} to the end", link, range.startLine));
          }
          if (range.endLine !== range.startLine) {
            return md(localize("toolComplete.viewFileRange", "Read {0}, lines {1} to {2}", link, range.startLine, range.endLine));
          }
          return md(localize("toolComplete.viewFileLine", "Read {0}, line {1}", link, range.startLine));
        }
        return md(localize("toolComplete.viewFile", "Read {0}", link));
      }
      return localize("toolComplete.view", "Read file");
    }
    case "edit" /* Edit */:
    case "str_replace" /* StrReplace */: {
      const args = parameters;
      if (typeof args?.path === "string" && args.path) {
        return md(localize("toolComplete.editFile", "Edited {0}", formatPathAsMarkdownLink(resolvePath(args.path))));
      }
      return localize("toolComplete.edit", "Edited file");
    }
    case "insert" /* Insert */: {
      const args = parameters;
      if (typeof args?.path === "string" && args.path) {
        return md(localize("toolComplete.insertFile", "Inserted text in {0}", formatPathAsMarkdownLink(resolvePath(args.path))));
      }
      return localize("toolComplete.insert", "Inserted text");
    }
    case "create" /* Create */: {
      const args = parameters;
      if (typeof args?.path === "string" && args.path) {
        return md(localize("toolComplete.createFile", "Created {0}", formatPathAsMarkdownLink(resolvePath(args.path))));
      }
      return localize("toolComplete.create", "Created file");
    }
    case "str_replace_editor" /* StrReplaceEditor */: {
      const command = parameters?.command;
      switch (command) {
        case "view":
          return getPastTenseMessage("view" /* View */, displayName, parameters, success, resultText, resolvePath);
        case "create":
          return getPastTenseMessage("create" /* Create */, displayName, parameters, success, resultText, resolvePath);
        case "insert":
          return getPastTenseMessage("insert" /* Insert */, displayName, parameters, success, resultText, resolvePath);
        case "edit":
        case "str_replace":
        default:
          return getPastTenseMessage("edit" /* Edit */, displayName, parameters, success, resultText, resolvePath);
      }
    }
    case "grep" /* Grep */: {
      const args = parameters;
      if (args?.pattern) {
        return md(localize("toolComplete.grepPattern", "Searched for {0}", appendEscapedMarkdownInlineCode(truncate(args.pattern, 80))));
      }
      return localize("toolComplete.grep", "Searched files");
    }
    case "rg" /* Rg */: {
      const args = parameters;
      if (args?.pattern) {
        return md(localize("toolComplete.grepPattern", "Searched for {0}", appendEscapedMarkdownInlineCode(truncate(args.pattern, 80))));
      }
      return localize("toolComplete.grep", "Searched files");
    }
    case "glob" /* Glob */: {
      const args = parameters;
      if (args?.pattern) {
        return md(localize("toolComplete.globPattern", "Found files matching {0}", appendEscapedMarkdownInlineCode(truncate(args.pattern, 80))));
      }
      return localize("toolComplete.glob", "Found files");
    }
    case "apply_patch" /* ApplyPatch */:
    case "git_apply_patch" /* GitApplyPatch */: {
      const files = getEditFilePaths(parameters).map(resolvePath);
      if (files.length === 1) {
        return md(localize("toolComplete.patchFile", "Edited {0}", formatPathAsMarkdownLink(files[0])));
      }
      if (files.length > 1) {
        return md(localize("toolComplete.patchFiles", "Edited {0}", files.map(formatPathAsMarkdownLink).join(", ")));
      }
      return localize("toolComplete.patch", "Edited files");
    }
    case "sql" /* Sql */: {
      const args = parameters;
      return args?.description || localize("toolComplete.sql", "Executed SQL query");
    }
    case "web_fetch" /* WebFetch */: {
      const args = parameters;
      if (args?.url) {
        return md(localize("toolComplete.webFetch", "Fetched {0}", formatUrlAsMarkdownLink(args.url)));
      }
      return localize("toolComplete.webFetchGeneric", "Fetched URL");
    }
    case "exit_plan_mode" /* ExitPlanMode */:
      return localize("toolComplete.exitPlanMode", "Exited plan mode");
    case "task" /* Task */:
      return localize("toolComplete.task", "Delegated task");
    case "list_agents" /* ListAgents */:
      return localize("toolComplete.listAgents", "Listed agents");
    case "read_agent" /* ReadAgent */: {
      const agentId = getAgentId(parameters);
      if (agentId) {
        return md(localize("toolComplete.readAgent", "Read agent {0}", appendEscapedMarkdownInlineCode(agentId)));
      }
      return localize("toolComplete.readAgentGeneric", "Read agent");
    }
    case "write_agent" /* WriteAgent */: {
      const agentId = getAgentId(parameters);
      if (agentId) {
        return md(localize("toolComplete.writeAgent", "Wrote to agent {0}", appendEscapedMarkdownInlineCode(agentId)));
      }
      return localize("toolComplete.writeAgentGeneric", "Wrote to agent");
    }
    default:
      return displayName;
  }
}
function getSkillSyntheticToolCallId(eventId, data) {
  if (eventId) {
    return `synth-skill-${eventId}`;
  }
  const seed = data.path ?? data.name;
  return `synth-skill-${hash(seed).toString(16)}`;
}
function synthesizeSkillToolCall(data, eventId) {
  const toolCallId = getSkillSyntheticToolCallId(eventId, data);
  const displayName = localize("toolName.skill", "Read Skill");
  const escapedName = escapeMarkdownLinkLabel(data.name);
  const skillLink = data.path ? `[${escapedName}](${URI.file(data.path)})` : void 0;
  const invocationMessage = skillLink ? md(localize("toolInvoke.skill", "Reading skill {0}", skillLink)) : localize("toolInvoke.skillName", "Reading skill {0}", data.name);
  const pastTenseMessage = skillLink ? md(localize("toolComplete.skill", "Read skill {0}", skillLink)) : localize("toolComplete.skillName", "Read skill {0}", data.name);
  return {
    toolCallId,
    toolName: "skill" /* Skill */,
    displayName,
    invocationMessage,
    pastTenseMessage
  };
}
function getToolInputString(toolName, parameters, rawArguments) {
  if (!parameters && !rawArguments) {
    return void 0;
  }
  if (SHELL_TOOL_NAMES.has(toolName) || WRITE_SHELL_TOOL_NAMES.has(toolName)) {
    const args = parameters;
    const command = args?.command ?? args?.args;
    if (typeof command === "string") {
      return command;
    }
    if (typeof command === "object" && command !== null && hasKey(command, { command: true })) {
      return command.command;
    }
    return rawArguments;
  }
  switch (toolName) {
    case "grep" /* Grep */: {
      const args = parameters;
      return args?.pattern ?? rawArguments;
    }
    case "rg" /* Rg */: {
      const args = parameters;
      return args?.pattern ?? rawArguments;
    }
    case "web_fetch" /* WebFetch */: {
      const args = parameters;
      return args?.url ?? rawArguments;
    }
    default:
      if (parameters) {
        try {
          return JSON.stringify(parameters, null, 2);
        } catch {
          return rawArguments;
        }
      }
      return rawArguments;
  }
}
function getToolKind(toolName) {
  if (SHELL_TOOL_NAMES.has(toolName)) {
    return "terminal";
  }
  if (SUBAGENT_TOOL_NAMES.has(toolName)) {
    return "subagent";
  }
  if (SEARCH_TOOL_NAMES.has(toolName)) {
    return "search";
  }
  return void 0;
}
function getSubagentMetadata(parameters) {
  if (!parameters) {
    return {};
  }
  const agentName = typeof parameters.agent_type === "string" && parameters.agent_type.length > 0 ? parameters.agent_type : void 0;
  const description = typeof parameters.description === "string" && parameters.description.length > 0 ? parameters.description : void 0;
  return { agentName, description };
}
function getShellLanguage(toolName) {
  switch (toolName) {
    case "powershell" /* PowerShell */:
    case "write_powershell" /* WritePowerShell */:
    case "read_powershell" /* ReadPowerShell */:
      return "powershell";
    default:
      return "shellscript";
  }
}
function tryStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return void 0;
  }
}
function str(value) {
  return typeof value === "string" ? value : void 0;
}
function getPermissionDisplay(request, workingDirectory, isNewFile) {
  const path = str(request.path) ?? str(request.fileName);
  const fullCommandText = str(request.fullCommandText);
  const intention = str(request.intention);
  const serverName = str(request.serverName);
  const toolName = str(request.toolName);
  const shellConfirmationTitle = request.requestSandboxBypass ? localize("copilot.permission.shell.bypass.title", "Run in terminal outside the sandbox?") : localize("copilot.permission.shell.title", "Run in terminal?");
  switch (request.kind) {
    case "shell": {
      const shellParams = fullCommandText ? { command: fullCommandText } : void 0;
      stripRedundantCdPrefix("bash" /* Bash */, shellParams, workingDirectory);
      const cleanedCommand = typeof shellParams?.command === "string" ? shellParams.command : fullCommandText;
      return {
        confirmationTitle: shellConfirmationTitle,
        invocationMessage: intention ?? getInvocationMessage("bash" /* Bash */, getToolDisplayName("bash" /* Bash */), cleanedCommand ? { command: cleanedCommand } : void 0),
        toolInput: cleanedCommand,
        permissionKind: "shell",
        permissionPath: path
      };
    }
    case "custom-tool": {
      const args = typeof request.args === "object" && request.args !== null ? request.args : void 0;
      const sdkToolName = str(request.toolName);
      if (args && sdkToolName && isShellTool(sdkToolName) && typeof args.command === "string") {
        stripRedundantCdPrefix(sdkToolName, args, workingDirectory);
        const command = args.command;
        return {
          confirmationTitle: shellConfirmationTitle,
          invocationMessage: getInvocationMessage(sdkToolName, getToolDisplayName(sdkToolName), { command }),
          toolInput: command,
          permissionKind: "shell",
          permissionPath: path
        };
      }
      return {
        confirmationTitle: localize("copilot.permission.default.title", "Allow tool call?"),
        invocationMessage: md(localize("copilot.permission.default.message", "Allow the model to call {0}?", appendEscapedMarkdownInlineCode(toolName ?? request.kind))),
        toolInput: args ? tryStringify(args) : tryStringify(request),
        permissionKind: request.kind,
        permissionPath: path
      };
    }
    case "write": {
      const toolName2 = isNewFile ? "create" /* Create */ : "edit" /* Edit */;
      return {
        confirmationTitle: isNewFile ? localize("copilot.permission.create.title", "Create file?") : localize("copilot.permission.write.title", "Write file?"),
        invocationMessage: getInvocationMessage(toolName2, getToolDisplayName(toolName2), path ? { path } : void 0),
        toolInput: tryStringify(path ? { path } : request) ?? void 0,
        permissionKind: "write",
        permissionPath: path
      };
    }
    case "mcp": {
      const title = toolName ?? localize("copilot.permission.mcp.defaultTool", "MCP Tool");
      return {
        confirmationTitle: serverName ? localize("copilot.permission.mcp.title", "Allow tool from {0}?", serverName) : localize("copilot.permission.default.title", "Allow tool call?"),
        invocationMessage: serverName ? `${serverName}: ${title}` : title,
        toolInput: tryStringify({ serverName, toolName }) ?? void 0,
        permissionKind: "mcp",
        permissionPath: path
      };
    }
    case "read":
      return {
        confirmationTitle: localize("copilot.permission.read.title", "Allow reading file outside of workspace?"),
        invocationMessage: getInvocationMessage("view" /* View */, getToolDisplayName("view" /* View */), path ? { path } : void 0),
        permissionKind: "read",
        permissionPath: path
      };
    case "url": {
      const url = str(request.url);
      const normalizedUrl = url ? URL.canParse(url) ? new URL(url).href : url : void 0;
      return {
        confirmationTitle: localize("copilot.permission.url.title", "Fetch URL?"),
        invocationMessage: md(localize("copilot.permission.url.message", "Allow fetching web content?")),
        toolInput: normalizedUrl ? JSON.stringify({ url: normalizedUrl }) : void 0,
        permissionKind: "url"
      };
    }
    default:
      return {
        confirmationTitle: localize("copilot.permission.default.title", "Allow tool call?"),
        invocationMessage: md(localize("copilot.permission.default.message", "Allow the model to call {0}?", appendEscapedMarkdownInlineCode(toolName ?? request.kind))),
        toolInput: tryStringify(request) ?? void 0,
        permissionKind: request.kind,
        permissionPath: path
      };
  }
}
export {
  getEditFilePath,
  getEditFilePaths,
  getInvocationMessage,
  getPastTenseMessage,
  getPermissionDisplay,
  getShellIntention,
  getShellLanguage,
  getSkillSyntheticToolCallId,
  getStreamingInvocationMessage,
  getSubagentMetadata,
  getTaskCompleteMarkdown,
  getTaskCompleteSummary,
  getToolDisplayName,
  getToolInputString,
  getToolKind,
  getToolMarkdownContent,
  isAgentCoordinationTool,
  isEditTool,
  isHiddenTool,
  isMarkdownRenderedTool,
  isShellTool,
  isTaskCompleteTool,
  parseCopilotStreamingToolInput,
  synthesizeSkillToolCall,
  tryStringify
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvcGlsb3QvY29waWxvdFRvb2xEaXNwbGF5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBQZXJtaXNzaW9uUmVxdWVzdCB9IGZyb20gJ0BnaXRodWIvY29waWxvdC1zZGsnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUsIGVzY2FwZU1hcmtkb3duTGlua0xhYmVsLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50VG9vbFBlbmRpbmdDb25maXJtYXRpb25TaWduYWwgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHN0cmlwUmVkdW5kYW50Q2RQcmVmaXggfSBmcm9tICcuLi8uLi9jb21tb24vY29tbWFuZExpbmVIZWxwZXJzLmpzJztcbmltcG9ydCB7IHBhcnNlUGFydGlhbFRvb2xJbnB1dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9wYXJ0aWFsVG9vbElucHV0LmpzJztcbmltcG9ydCB7IFN0cmluZ09yTWFya2Rvd24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZ2V0U3RyZWFtaW5nQ3JlYXRlTWVzc2FnZSwgZ2V0U3RyZWFtaW5nSW5zZXJ0TWVzc2FnZSwgZ2V0U3RyZWFtaW5nUGF0Y2hNZXNzYWdlLCBnZXRTdHJlYW1pbmdSZXBsYWNlTWVzc2FnZSwgc3RyZWFtaW5nVG9vbFRleHRMaW5lQ291bnQsIHR5cGUgVG9vbFBhdGhSZXNvbHZlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdHJlYW1pbmdUb29sQ2FsbERpc3BsYXkuanMnO1xuaW1wb3J0IHsgZ2V0U2VydmVyVG9vbERpc3BsYXkgfSBmcm9tICcuLi9zaGFyZWQvc2VydmVyVG9vbEdyb3Vwcy5qcyc7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBDb3BpbG90IENMSSBidWlsdC1pbiB0b29sIGludGVyZmFjZXNcbi8vXG4vLyBUaGUgQ29waWxvdCBDTEkgKHZpYSBAZ2l0aHViL2NvcGlsb3Qtc2RrKSBleHBvc2VzIHRoZXNlIGJ1aWx0LWluIHRvb2xzLiBUb29sIG5hbWVzXG4vLyBhbmQgcGFyYW1ldGVyIHNoYXBlcyBhcmUgbm90IHR5cGVkIGluIHRoZSBTREsgLS0gdGhleSBjb21lIGZyb20gdGhlIENMSSBzZXJ2ZXJcbi8vIGFzIHBsYWluIHN0cmluZ3MuIFRoZXNlIGludGVyZmFjZXMgYXJlIGRlcml2ZWQgZnJvbSBvYnNlcnZpbmcgdGhlIENMSSdzIGFjdHVhbFxuLy8gdG9vbCBldmVudHMgYW5kIHRoZSBDb3BpbG90IENoYXQgZXh0ZW5zaW9uJ3MgQ0xJIGRpc3BsYXkgdGFibGUuXG4vL1xuLy8gU2hlbGwgdG9vbCBuYW1lcyBmb2xsb3cgYSBwYXR0ZXJuIHBlciBTaGVsbENvbmZpZzpcbi8vICAgc2hlbGxUb29sTmFtZSwgcmVhZFNoZWxsVG9vbE5hbWUsIHdyaXRlU2hlbGxUb29sTmFtZSxcbi8vICAgc3RvcFNoZWxsVG9vbE5hbWUsIGxpc3RTaGVsbHNUb29sTmFtZVxuLy8gRm9yIGJhc2g6IGJhc2gsIHJlYWRfYmFzaCwgd3JpdGVfYmFzaCwgc3RvcF9iYXNoL2Jhc2hfc2h1dGRvd24sIGxpc3RfYmFzaFxuLy8gRm9yIHBvd2Vyc2hlbGw6IHBvd2Vyc2hlbGwsIHJlYWRfcG93ZXJzaGVsbCwgd3JpdGVfcG93ZXJzaGVsbCwgc3RvcF9wb3dlcnNoZWxsL3Bvd2Vyc2hlbGxfc2h1dGRvd24sIGxpc3RfcG93ZXJzaGVsbFxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBLbm93biBDb3BpbG90IENMSSB0b29sIG5hbWVzLiBUaGVzZSBhcmUgdGhlIGB0b29sTmFtZWAgdmFsdWVzIHRoYXQgYXBwZWFyXG4gKiBpbiBgdG9vbC5leGVjdXRpb25fc3RhcnRgIGV2ZW50cyBmcm9tIHRoZSBTREsuXG4gKi9cbmNvbnN0IGVudW0gQ29waWxvdFRvb2xOYW1lIHtcblx0U3RyUmVwbGFjZUVkaXRvciA9ICdzdHJfcmVwbGFjZV9lZGl0b3InLFxuXHRTdHJSZXBsYWNlID0gJ3N0cl9yZXBsYWNlJyxcblx0SW5zZXJ0ID0gJ2luc2VydCcsXG5cblx0QmFzaCA9ICdiYXNoJyxcblx0UmVhZEJhc2ggPSAncmVhZF9iYXNoJyxcblx0V3JpdGVCYXNoID0gJ3dyaXRlX2Jhc2gnLFxuXHRTdG9wQmFzaCA9ICdzdG9wX2Jhc2gnLFxuXHRCYXNoU2h1dGRvd24gPSAnYmFzaF9zaHV0ZG93bicsXG5cdExpc3RCYXNoID0gJ2xpc3RfYmFzaCcsXG5cblx0UG93ZXJTaGVsbCA9ICdwb3dlcnNoZWxsJyxcblx0UmVhZFBvd2VyU2hlbGwgPSAncmVhZF9wb3dlcnNoZWxsJyxcblx0V3JpdGVQb3dlclNoZWxsID0gJ3dyaXRlX3Bvd2Vyc2hlbGwnLFxuXHRTdG9wUG93ZXJTaGVsbCA9ICdzdG9wX3Bvd2Vyc2hlbGwnLFxuXHRQb3dlclNoZWxsU2h1dGRvd24gPSAncG93ZXJzaGVsbF9zaHV0ZG93bicsXG5cdExpc3RQb3dlclNoZWxsID0gJ2xpc3RfcG93ZXJzaGVsbCcsXG5cblx0VmlldyA9ICd2aWV3Jyxcblx0RWRpdCA9ICdlZGl0Jyxcblx0Q3JlYXRlID0gJ2NyZWF0ZScsXG5cdEdyZXAgPSAnZ3JlcCcsXG5cdFJnID0gJ3JnJyxcblx0R2xvYiA9ICdnbG9iJyxcblx0U2VhcmNoQ29kZVN1YmFnZW50ID0gJ3NlYXJjaF9jb2RlX3N1YmFnZW50Jyxcblx0UmVwbHlUb0NvbW1lbnQgPSAncmVwbHlfdG9fY29tbWVudCcsXG5cdENvZGVSZXZpZXcgPSAnY29kZV9yZXZpZXcnLFxuXHRBcHBseVBhdGNoID0gJ2FwcGx5X3BhdGNoJyxcblx0R2l0QXBwbHlQYXRjaCA9ICdnaXRfYXBwbHlfcGF0Y2gnLFxuXHRXZWJTZWFyY2ggPSAnd2ViX3NlYXJjaCcsXG5cdFdlYkZldGNoID0gJ3dlYl9mZXRjaCcsXG5cdEFza1VzZXIgPSAnYXNrX3VzZXInLFxuXHRSZXBvcnRJbnRlbnQgPSAncmVwb3J0X2ludGVudCcsXG5cdFRoaW5rID0gJ3RoaW5rJyxcblx0UmVwb3J0UHJvZ3Jlc3MgPSAncmVwb3J0X3Byb2dyZXNzJyxcblx0VXBkYXRlVG9kbyA9ICd1cGRhdGVfdG9kbycsXG5cdFNob3dGaWxlID0gJ3Nob3dfZmlsZScsXG5cdEZldGNoQ29waWxvdENsaURvY3VtZW50YXRpb24gPSAnZmV0Y2hfY29waWxvdF9jbGlfZG9jdW1lbnRhdGlvbicsXG5cdFByb3Bvc2VXb3JrID0gJ3Byb3Bvc2Vfd29yaycsXG5cdFRhc2tDb21wbGV0ZSA9ICd0YXNrX2NvbXBsZXRlJyxcblx0U2tpbGwgPSAnc2tpbGwnLFxuXHRUYXNrID0gJ3Rhc2snLFxuXHRMaXN0QWdlbnRzID0gJ2xpc3RfYWdlbnRzJyxcblx0UmVhZEFnZW50ID0gJ3JlYWRfYWdlbnQnLFxuXHRFeGl0UGxhbk1vZGUgPSAnZXhpdF9wbGFuX21vZGUnLFxuXHRTcWwgPSAnc3FsJyxcblx0THNwID0gJ2xzcCcsXG5cdENyZWF0ZVB1bGxSZXF1ZXN0ID0gJ2NyZWF0ZV9wdWxsX3JlcXVlc3QnLFxuXHRHaEFkdmlzb3J5RGF0YWJhc2UgPSAnZ2gtYWR2aXNvcnktZGF0YWJhc2UnLFxuXHRTdG9yZU1lbW9yeSA9ICdzdG9yZV9tZW1vcnknLFxuXHRQYXJhbGxlbFZhbGlkYXRpb24gPSAncGFyYWxsZWxfdmFsaWRhdGlvbicsXG5cdFdyaXRlQWdlbnQgPSAnd3JpdGVfYWdlbnQnLFxuXHRNY3BSZWxvYWQgPSAnbWNwX3JlbG9hZCcsXG5cdE1jcFZhbGlkYXRlID0gJ21jcF92YWxpZGF0ZScsXG5cdFRvb2xTZWFyY2hUb29sUmVnZXggPSAndG9vbF9zZWFyY2hfdG9vbF9yZWdleCcsXG5cdENvZGVxbENoZWNrZXIgPSAnY29kZXFsX2NoZWNrZXInLFxufVxuXG4vKiogUGFyYW1ldGVycyBmb3IgdGhlIGBiYXNoYCAvIGBwb3dlcnNoZWxsYCBzaGVsbCB0b29scy4gKi9cbmludGVyZmFjZSBJQ29waWxvdFNoZWxsVG9vbEFyZ3Mge1xuXHRjb21tYW5kOiBzdHJpbmc7XG5cdHRpbWVvdXQ/OiBudW1iZXI7XG59XG5cbi8qKiBQYXJhbWV0ZXJzIGZvciBmaWxlIHRvb2xzIChgdmlld2AsIGBlZGl0YCwgYGNyZWF0ZWApLiAqL1xuaW50ZXJmYWNlIElDb3BpbG90RmlsZVRvb2xBcmdzIHtcblx0cGF0aDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSUNvcGlsb3RFZGl0VG9vbEFyZ3MgZXh0ZW5kcyBJQ29waWxvdEZpbGVUb29sQXJncyB7XG5cdG9sZF9zdHI/OiBzdHJpbmc7XG5cdG5ld19zdHI/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJQ29waWxvdENyZWF0ZVRvb2xBcmdzIGV4dGVuZHMgSUNvcGlsb3RGaWxlVG9vbEFyZ3Mge1xuXHRmaWxlX3RleHQ/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJQ29waWxvdEluc2VydFRvb2xBcmdzIGV4dGVuZHMgSUNvcGlsb3RGaWxlVG9vbEFyZ3Mge1xuXHRpbnNlcnRfbGluZT86IG51bWJlcjtcblx0bmV3X3N0cj86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElDb3BpbG90U3RyUmVwbGFjZUVkaXRvclRvb2xBcmdzIGV4dGVuZHMgSUNvcGlsb3RFZGl0VG9vbEFyZ3MsIElDb3BpbG90Q3JlYXRlVG9vbEFyZ3MsIElDb3BpbG90SW5zZXJ0VG9vbEFyZ3Mge1xuXHRjb21tYW5kPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFBhcmFtZXRlcnMgZm9yIHRoZSBgdmlld2AgdG9vbC4gVGhlIENvcGlsb3QgQ0xJIGFjY2VwdHMgYW4gb3B0aW9uYWxcbiAqIGB2aWV3X3JhbmdlOiBbc3RhcnRMaW5lLCBlbmRMaW5lXWAgKDEtYmFzZWQsIGluY2x1c2l2ZSkuIGBlbmRMaW5lYCBtYXkgYmVcbiAqIGAtMWAgdG8gbWVhbiBcInRvIGVuZCBvZiBmaWxlXCIuXG4gKi9cbmludGVyZmFjZSBJQ29waWxvdFZpZXdUb29sQXJncyBleHRlbmRzIElDb3BpbG90RmlsZVRvb2xBcmdzIHtcblx0dmlld19yYW5nZT86IG51bWJlcltdO1xufVxuXG4vKipcbiAqIE5vcm1hbGl6ZXMgYSBgdmlld19yYW5nZWAgYXJyYXkuIFJldHVybnMgYHVuZGVmaW5lZGAgdW5sZXNzIHRoZSBhcnJheSBoYXNcbiAqIGV4YWN0bHkgdHdvIGludGVnZXIgZWxlbWVudHMgd2l0aCBgc3RhcnRMaW5lID49IDBgLiBgZW5kTGluZSA9PT0gLTFgIGlzXG4gKiBwcmVzZXJ2ZWQgYXMgdGhlIFwidG8gZW5kIG9mIGZpbGVcIiBzZW50aW5lbDsgb3RoZXJ3aXNlIGBlbmRMaW5lYCBtdXN0IGJlXG4gKiBgPj0gc3RhcnRMaW5lYC5cbiAqL1xuZnVuY3Rpb24gZm9ybWF0Vmlld1JhbmdlKHZpZXdfcmFuZ2U6IG51bWJlcltdIHwgdW5kZWZpbmVkKTogeyBzdGFydExpbmU6IG51bWJlcjsgZW5kTGluZTogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuXHRpZiAoIUFycmF5LmlzQXJyYXkodmlld19yYW5nZSkgfHwgdmlld19yYW5nZS5sZW5ndGggIT09IDIpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IFtzdGFydExpbmUsIGVuZExpbmVdID0gdmlld19yYW5nZTtcblx0aWYgKCFOdW1iZXIuaXNJbnRlZ2VyKHN0YXJ0TGluZSkgfHwgIU51bWJlci5pc0ludGVnZXIoZW5kTGluZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChzdGFydExpbmUgPCAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoZW5kTGluZSAhPT0gLTEgJiYgZW5kTGluZSA8IHN0YXJ0TGluZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHsgc3RhcnRMaW5lLCBlbmRMaW5lIH07XG59XG5cbi8qKlxuICogUGFyYW1ldGVycyBmb3IgdGhlIGBncmVwYCB0b29sLiBUaGUgQ29waWxvdCBDTEkncyBgZ3JlcGAgYWNjZXB0cyB0aGUgc2FtZVxuICogcmljaCByZy1mbGFnIHNjaGVtYSBhcyBgcmdgOyB0aGUgb2xkZXIgbmFycm93ZXIgc2hhcGUgKGUuZy4gYGluY2x1ZGVgKSBpc1xuICogbm8gbG9uZ2VyIHVzZWQuXG4gKi9cbmludGVyZmFjZSBJQ29waWxvdEdyZXBUb29sQXJncyB7XG5cdHBhdHRlcm46IHN0cmluZztcblx0cGF0aD86IHN0cmluZztcblx0b3V0cHV0X21vZGU/OiAnY29udGVudCcgfCAnZmlsZXNfd2l0aF9tYXRjaGVzJyB8ICdjb3VudCc7XG5cdGdsb2I/OiBzdHJpbmc7XG5cdHR5cGU/OiBzdHJpbmc7XG5cdCctaSc/OiBib29sZWFuO1xuXHQnLUEnPzogbnVtYmVyO1xuXHQnLUInPzogbnVtYmVyO1xuXHQnLUMnPzogbnVtYmVyO1xuXHQnLW4nPzogYm9vbGVhbjtcblx0aGVhZF9saW1pdD86IG51bWJlcjtcblx0bXVsdGlsaW5lPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBQYXJhbWV0ZXJzIGZvciB0aGUgYHJnYCB0b29sLiBNaXJyb3JzIHtAbGluayBJQ29waWxvdEdyZXBUb29sQXJnc30gdG9kYXkgYnV0XG4gKiBpcyBrZXB0IGFzIGEgZGlzdGluY3QgaW50ZXJmYWNlIHNvIHRoZSB0d28gdG9vbHMgY2FuIGRyaWZ0IGluZGVwZW5kZW50bHkgaWZcbiAqIHRoZSBTREsgZXZlciBkaWZmZXJlbnRpYXRlcyB0aGVtLlxuICovXG5pbnRlcmZhY2UgSUNvcGlsb3RSZ1Rvb2xBcmdzIHtcblx0cGF0dGVybjogc3RyaW5nO1xuXHRwYXRoPzogc3RyaW5nO1xuXHRvdXRwdXRfbW9kZT86ICdjb250ZW50JyB8ICdmaWxlc193aXRoX21hdGNoZXMnIHwgJ2NvdW50Jztcblx0Z2xvYj86IHN0cmluZztcblx0dHlwZT86IHN0cmluZztcblx0Jy1pJz86IGJvb2xlYW47XG5cdCctQSc/OiBudW1iZXI7XG5cdCctQic/OiBudW1iZXI7XG5cdCctQyc/OiBudW1iZXI7XG5cdCctbic/OiBib29sZWFuO1xuXHRoZWFkX2xpbWl0PzogbnVtYmVyO1xuXHRtdWx0aWxpbmU/OiBib29sZWFuO1xufVxuXG4vKiogUGFyYW1ldGVycyBmb3IgdGhlIGBnbG9iYCB0b29sLiAqL1xuaW50ZXJmYWNlIElDb3BpbG90R2xvYlRvb2xBcmdzIHtcblx0cGF0dGVybjogc3RyaW5nO1xuXHRwYXRoPzogc3RyaW5nO1xufVxuXG4vKiogUGFyYW1ldGVycyBmb3IgdGhlIGBzcWxgIHRvb2wuICovXG5pbnRlcmZhY2UgSUNvcGlsb3RTcWxUb29sQXJncyB7XG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRxdWVyeT86IHN0cmluZztcbn1cblxuLyoqIFBhcmFtZXRlcnMgZm9yIHRoZSBgd2ViX2ZldGNoYCB0b29sLiAqL1xuaW50ZXJmYWNlIElDb3BpbG90V2ViRmV0Y2hUb29sQXJncyB7XG5cdHVybDogc3RyaW5nO1xufVxuXG4vKipcbiAqIFBhcmFtZXRlcnMgc2hhcmVkIGJ5IHRoZSBhZ2VudC1jb29yZGluYXRpb24gdG9vbHMgKGByZWFkX2FnZW50YCxcbiAqIGB3cml0ZV9hZ2VudGApLiBUaGUgQ29waWxvdCBDTEkgaWRlbnRpZmllcyB0aGUgdGFyZ2V0IGFnZW50IGJ5IGl0c1xuICogaHVtYW4tcmVhZGFibGUgYGFnZW50X2lkYCAoZS5nLiBgbWF0aC1oZWxwZXJgKS5cbiAqL1xuaW50ZXJmYWNlIElDb3BpbG90QWdlbnRUb29sQXJncyB7XG5cdGFnZW50X2lkPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFJlYWRzIGEgd2VsbC1mb3JtZWQgYGFnZW50X2lkYCBmcm9tIHVudHJ1c3RlZCB0b29sIHBhcmFtZXRlcnMuIFNpbmNlIHRoZXNlIGFyZVxuICogcGFyc2VkIGZyb20gSlNPTiB0aGV5IG1heSBub3QgbWF0Y2ggdGhlIGV4cGVjdGVkIHNoYXBlLCBzbyB0aGUgaWQgaXMgcmV0dXJuZWRcbiAqIG9ubHkgd2hlbiBpdCBpcyBhIG5vbi1lbXB0eSBzdHJpbmcgYW5kIGlzIHRoZXJlZm9yZSBzYWZlIHRvIHJlbmRlciBhcyBpbmxpbmVcbiAqIG1hcmtkb3duIGNvZGUuXG4gKi9cbmZ1bmN0aW9uIGdldEFnZW50SWQocGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBhZ2VudElkID0gKHBhcmFtZXRlcnMgYXMgSUNvcGlsb3RBZ2VudFRvb2xBcmdzIHwgdW5kZWZpbmVkKT8uYWdlbnRfaWQ7XG5cdHJldHVybiB0eXBlb2YgYWdlbnRJZCA9PT0gJ3N0cmluZycgJiYgYWdlbnRJZC5sZW5ndGggPiAwID8gYWdlbnRJZCA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBQYXJhbWV0ZXJzIGZvciB0aGUgYGFwcGx5X3BhdGNoYCAvIGBnaXRfYXBwbHlfcGF0Y2hgIHRvb2xzLiBUaGUgcGF0Y2ggdGV4dFxuICogaXRzZWxmIGxpdmVzIGluIGBpbnB1dGAgdXNpbmcgdGhlIFY0QSBkaWZmIGZvcm1hdCAoZmlsZSBoZWFkZXJzIGxpa2VcbiAqIGAqKiogVXBkYXRlIEZpbGU6IDxwYXRoPmApLCBzbyBmaWxlIHBhdGhzIG11c3QgYmUgcGFyc2VkIG91dCBvZiB0aGUgYm9keVxuICogcmF0aGVyIHRoYW4gcmVhZCBmcm9tIGEgdG9wLWxldmVsIGZpZWxkLlxuICovXG5pbnRlcmZhY2UgSUNvcGlsb3RBcHBseVBhdGNoVG9vbEFyZ3Mge1xuXHRpbnB1dD86IHN0cmluZztcblx0LyoqIFNvbWUgU0RLIGNhbGxlcnMgc2VuZCB0aGUgcGF0Y2ggdW5kZXIgYHBhdGNoYCBpbnN0ZWFkIG9mIGBpbnB1dGAuICovXG5cdHBhdGNoPzogc3RyaW5nO1xuXHRleHBsYW5hdGlvbj86IHN0cmluZztcbn1cblxuLyoqXG4gKiBIZWFkZXJzIG9mIHRoZSBWNEEgcGF0Y2ggZm9ybWF0IHRoZSBgYXBwbHlfcGF0Y2hgIHRvb2wgYWNjZXB0cy4gVG9sZXJhdGVzXG4gKiBsZWFkaW5nIHdoaXRlc3BhY2U7IHRyaW1zIHRoZSBjYXB0dXJlZCBwYXRoLlxuICovXG5jb25zdCBBUFBMWV9QQVRDSF9GSUxFX0hFQURFUlMgPSBbXG5cdC9eXFxzKlxcKlxcKlxcKlxccytVcGRhdGUgRmlsZTpcXHMqKC4rPylcXHMqJC8sXG5cdC9eXFxzKlxcKlxcKlxcKlxccytBZGQgRmlsZTpcXHMqKC4rPylcXHMqJC8sXG5cdC9eXFxzKlxcKlxcKlxcKlxccytEZWxldGUgRmlsZTpcXHMqKC4rPylcXHMqJC8sXG5cdC9eXFxzKlxcKlxcKlxcKlxccytNb3ZlIHRvOlxccyooLis/KVxccyokLyxcbl07XG5cbi8qKlxuICogRXh0cmFjdHMgdGhlIHNldCBvZiBmaWxlIHBhdGhzIGFmZmVjdGVkIGJ5IGFuIGBhcHBseV9wYXRjaGAgcGF5bG9hZC4gUmVhZHNcbiAqIHRoZSBgKioqIFVwZGF0ZSBGaWxlOmAgLyBgKioqIEFkZCBGaWxlOmAgLyBgKioqIERlbGV0ZSBGaWxlOmAgLyBgKioqIE1vdmUgdG86YFxuICogaGVhZGVycyBmcm9tIHRoZSBWNEEgZGlmZiBib2R5LiBSZXR1cm5zIHBhdGhzIGluIGRvY3VtZW50IG9yZGVyIHdpdGhcbiAqIGR1cGxpY2F0ZXMgcmVtb3ZlZC5cbiAqXG4gKiBBY2NlcHRzIGVpdGhlciBhIHN0cnVjdHVyZWQgYXJncyBvYmplY3QgKHtAbGluayBJQ29waWxvdEFwcGx5UGF0Y2hUb29sQXJnc30pXG4gKiBvciBhIGJhcmUgcGF0Y2ggc3RyaW5nLiBUaGUgQ29waWxvdCBTREsgZGVsaXZlcnMgYGFwcGx5X3BhdGNoYCB3aXRoXG4gKiBgYXJndW1lbnRzYCBhcyBhIHJhdyBWNEEgcGF0Y2ggc3RyaW5nIChjdXN0b20gdG9vbCBmb3JtYXQpLCBub3QgYXMgYSBKU09OXG4gKiBvYmplY3QsIHNvIHRoZSBzdHJpbmcgZmFsbGJhY2sgaXMgdGhlIGNvbW1vbiBjYXNlIGZvciBhcHBseV9wYXRjaC5cbiAqL1xuZnVuY3Rpb24gZ2V0QXBwbHlQYXRjaEZpbGVzKGFyZ3M6IHN0cmluZyB8IElDb3BpbG90QXBwbHlQYXRjaFRvb2xBcmdzIHwgdW5kZWZpbmVkKTogc3RyaW5nW10ge1xuXHRjb25zdCB0ZXh0ID0gdHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnID8gYXJncyA6IChhcmdzPy5pbnB1dCA/PyBhcmdzPy5wYXRjaCk7XG5cdGlmICh0eXBlb2YgdGV4dCAhPT0gJ3N0cmluZycgfHwgdGV4dC5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBvdXQ6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgbGluZSBvZiB0ZXh0LnNwbGl0KCdcXG4nKSkge1xuXHRcdGZvciAoY29uc3QgcmUgb2YgQVBQTFlfUEFUQ0hfRklMRV9IRUFERVJTKSB7XG5cdFx0XHRjb25zdCBtID0gcmUuZXhlYyhsaW5lKTtcblx0XHRcdGlmIChtKSB7XG5cdFx0XHRcdGNvbnN0IHBhdGggPSBtWzFdO1xuXHRcdFx0XHRpZiAocGF0aCAmJiAhc2Vlbi5oYXMocGF0aCkpIHtcblx0XHRcdFx0XHRzZWVuLmFkZChwYXRoKTtcblx0XHRcdFx0XHRvdXQucHVzaChwYXRoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIG91dDtcbn1cblxuLyoqIFNldCBvZiB0b29sIG5hbWVzIHRoYXQgcGVyZm9ybSBmaWxlIGVkaXRzLiAqL1xuY29uc3QgRURJVF9UT09MX05BTUVTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbXG5cdENvcGlsb3RUb29sTmFtZS5FZGl0LFxuXHRDb3BpbG90VG9vbE5hbWUuU3RyUmVwbGFjZSxcblx0Q29waWxvdFRvb2xOYW1lLkluc2VydCxcblx0Q29waWxvdFRvb2xOYW1lLkNyZWF0ZSxcblx0Q29waWxvdFRvb2xOYW1lLkFwcGx5UGF0Y2gsXG5cdENvcGlsb3RUb29sTmFtZS5HaXRBcHBseVBhdGNoLFxuXSk7XG5cbmNvbnN0IFNUUl9SRVBMQUNFX0VESVRPUl9FRElUX0NPTU1BTkRTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbXG5cdENvcGlsb3RUb29sTmFtZS5FZGl0LFxuXHRDb3BpbG90VG9vbE5hbWUuU3RyUmVwbGFjZSxcblx0Q29waWxvdFRvb2xOYW1lLkluc2VydCxcblx0Q29waWxvdFRvb2xOYW1lLkNyZWF0ZSxcbl0pO1xuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgdG9vbCBtb2RpZmllcyBmaWxlcyBvbiBkaXNrLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNFZGl0VG9vbCh0b29sTmFtZTogc3RyaW5nLCBjb21tYW5kPzogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChFRElUX1RPT0xfTkFNRVMuaGFzKHRvb2xOYW1lKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlmICh0b29sTmFtZSA9PT0gQ29waWxvdFRvb2xOYW1lLlN0clJlcGxhY2VFZGl0b3IpIHtcblx0XHRyZXR1cm4gY29tbWFuZCAhPT0gdW5kZWZpbmVkICYmIFNUUl9SRVBMQUNFX0VESVRPUl9FRElUX0NPTU1BTkRTLmhhcyhjb21tYW5kKTtcblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbi8qKlxuICogRXh0cmFjdHMgdGhlIHRhcmdldCBmaWxlIHBhdGggZnJvbSBhbiBlZGl0IHRvb2wncyBwYXJhbWV0ZXJzLCBpZiBhdmFpbGFibGUuXG4gKiBGb3IgYGFwcGx5X3BhdGNoYCAvIGBnaXRfYXBwbHlfcGF0Y2hgIHRoZSBmaXJzdCBmaWxlIGluIHRoZSBWNEEgcGF0Y2ggYm9keVxuICogaXMgcmV0dXJuZWQuIENhbGxlcnMgdGhhdCBuZWVkIGV2ZXJ5IGFmZmVjdGVkIGZpbGUgKGZvciBzbmFwc2hvdHRpbmcgYWxsXG4gKiBlZGl0cyBpbiBhIG11bHRpLWZpbGUgcGF0Y2gpIHNob3VsZCB1c2Uge0BsaW5rIGdldEVkaXRGaWxlUGF0aHN9IGluc3RlYWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRFZGl0RmlsZVBhdGgocGFyYW1ldGVyczogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBnZXRFZGl0RmlsZVBhdGhzKHBhcmFtZXRlcnMpWzBdO1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIGV2ZXJ5IGZpbGUgcGF0aCBhbiBlZGl0IHRvb2wgd2lsbCB0b3VjaC4gRm9yIGBlZGl0YCAvIGBjcmVhdGVgIHRoaXNcbiAqIGlzIHRoZSBzaW5nbGUgYHBhdGhgIHBhcmFtZXRlcjsgZm9yIGBhcHBseV9wYXRjaGAgLyBgZ2l0X2FwcGx5X3BhdGNoYCB0aGlzXG4gKiBpcyB0aGUgdW5pcXVlIHNldCBvZiBmaWxlcyBkZWNsYXJlZCBpbiB0aGUgVjRBIHBhdGNoIGJvZHksIGluIGRvY3VtZW50XG4gKiBvcmRlci4gUmV0dXJucyBhbiBlbXB0eSBhcnJheSBpZiBubyBwYXRocyBjYW4gYmUgZGV0ZXJtaW5lZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEVkaXRGaWxlUGF0aHMocGFyYW1ldGVyczogdW5rbm93bik6IHN0cmluZ1tdIHtcblx0aWYgKHR5cGVvZiBwYXJhbWV0ZXJzID09PSAnc3RyaW5nJykge1xuXHRcdC8vIENvdWxkIGJlIGVpdGhlciBhIEpTT04tZW5jb2RlZCBhcmdzIG9iamVjdCBvciBhIHJhdyBWNEEgcGF0Y2hcblx0XHQvLyBzdHJpbmcuIENvcGlsb3QgU0RLIGRlbGl2ZXJzIGBhcHBseV9wYXRjaGAgYXJndW1lbnRzIGFzIGEgYmFyZVxuXHRcdC8vIHBhdGNoIHN0cmluZyAoY3VzdG9tIHRvb2wgZm9ybWF0KSwgc28gd2hlbiBKU09OIHBhcnNpbmcgZmFpbHNcblx0XHQvLyBmYWxsIGJhY2sgdG8gdHJlYXRpbmcgaXQgYXMgdGhlIHBhdGNoIGJvZHkuXG5cdFx0dHJ5IHtcblx0XHRcdHBhcmFtZXRlcnMgPSBKU09OLnBhcnNlKHBhcmFtZXRlcnMpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGdldEFwcGx5UGF0Y2hGaWxlcyhwYXJhbWV0ZXJzIGFzIHN0cmluZyk7XG5cdFx0fVxuXHRcdC8vIEpTT04ucGFyc2UgbWF5IGhhdmUgcmV0dXJuZWQgYSBzdHJpbmcgKGUuZy4gYSBKU09OLWVuY29kZWQgcGF0Y2hcblx0XHQvLyBib2R5IHRoYXQgcm91bmQtdHJpcHMgdGhyb3VnaCB0cnlTdHJpbmdpZnkgb24gdGhlIGNhbGwgc2l0ZSkuXG5cdFx0aWYgKHR5cGVvZiBwYXJhbWV0ZXJzID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGdldEFwcGx5UGF0Y2hGaWxlcyhwYXJhbWV0ZXJzKTtcblx0XHR9XG5cdH1cblxuXHRpZiAoIXBhcmFtZXRlcnMgfHwgdHlwZW9mIHBhcmFtZXRlcnMgIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Y29uc3QgcGF0Y2hBcmdzID0gcGFyYW1ldGVycyBhcyBJQ29waWxvdEFwcGx5UGF0Y2hUb29sQXJncztcblx0aWYgKHR5cGVvZiBwYXRjaEFyZ3MuaW5wdXQgPT09ICdzdHJpbmcnIHx8IHR5cGVvZiBwYXRjaEFyZ3MucGF0Y2ggPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIGdldEFwcGx5UGF0Y2hGaWxlcyhwYXRjaEFyZ3MpO1xuXHR9XG5cblx0Y29uc3QgYXJncyA9IHBhcmFtZXRlcnMgYXMgSUNvcGlsb3RGaWxlVG9vbEFyZ3M7XG5cdHJldHVybiB0eXBlb2YgYXJncy5wYXRoID09PSAnc3RyaW5nJyA/IFthcmdzLnBhdGhdIDogW107XG59XG5cbi8qKiBTZXQgb2YgdG9vbCBuYW1lcyB0aGF0IGV4ZWN1dGUgc2hlbGwgY29tbWFuZHMgKGJhc2ggb3IgcG93ZXJzaGVsbCkuICovXG5jb25zdCBTSEVMTF9UT09MX05BTUVTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbXG5cdENvcGlsb3RUb29sTmFtZS5CYXNoLFxuXHRDb3BpbG90VG9vbE5hbWUuUG93ZXJTaGVsbCxcbl0pO1xuXG4vKiogU2V0IG9mIHRvb2wgbmFtZXMgdGhhdCB3cml0ZSBpbnB1dCB0byBhbiBpbnRlcmFjdGl2ZSBzaGVsbCBzZXNzaW9uLiAqL1xuY29uc3QgV1JJVEVfU0hFTExfVE9PTF9OQU1FUzogUmVhZG9ubHlTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoW1xuXHRDb3BpbG90VG9vbE5hbWUuV3JpdGVCYXNoLFxuXHRDb3BpbG90VG9vbE5hbWUuV3JpdGVQb3dlclNoZWxsLFxuXSk7XG5cbi8qKiBTZXQgb2YgdG9vbCBuYW1lcyB0aGF0IHJlYWQgb3V0cHV0IGZyb20gYW4gaW50ZXJhY3RpdmUgc2hlbGwgc2Vzc2lvbi4gKi9cbmNvbnN0IFJFQURfU0hFTExfVE9PTF9OQU1FUzogUmVhZG9ubHlTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoW1xuXHRDb3BpbG90VG9vbE5hbWUuUmVhZEJhc2gsXG5cdENvcGlsb3RUb29sTmFtZS5SZWFkUG93ZXJTaGVsbCxcbl0pO1xuXG4vKiogU2V0IG9mIHRvb2wgbmFtZXMgdGhhdCBzcGF3biBzdWJhZ2VudCBzZXNzaW9ucy4gKi9cbmNvbnN0IFNVQkFHRU5UX1RPT0xfTkFNRVM6IFJlYWRvbmx5U2V0PHN0cmluZz4gPSBuZXcgU2V0KFtcblx0J3Rhc2snLFxuXSk7XG5cbi8qKiBTZXQgb2YgdG9vbCBuYW1lcyB0aGF0IHBlcmZvcm0gZmlsZS90ZXh0IHNlYXJjaC4gKi9cbmNvbnN0IFNFQVJDSF9UT09MX05BTUVTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbXG5cdENvcGlsb3RUb29sTmFtZS5HcmVwLFxuXHRDb3BpbG90VG9vbE5hbWUuUmcsXG5cdENvcGlsb3RUb29sTmFtZS5HbG9iLFxuXSk7XG5cbi8qKlxuICogVG9vbHMgdGhhdCBzaG91bGQgbm90IGJlIHNob3duIHRvIHRoZSB1c2VyLiBUaGVzZSBhcmUgaW50ZXJuYWwgdG9vbHNcbiAqIHVzZWQgYnkgdGhlIENMSSBmb3IgaXRzIG93biBwdXJwb3NlcyAoZS5nLiwgcmVwb3J0aW5nIGludGVudCB0byB0aGUgbW9kZWwpLlxuICpcbiAqIGBza2lsbGAgaXMgaGlkZGVuIGJlY2F1c2UgdGhlIFNESyBhbHJlYWR5IGVtaXRzIGEgcmljaGVyIGBza2lsbC5pbnZva2VkYFxuICogbGlmZWN5Y2xlIGV2ZW50IHdpdGggdGhlIHJlc29sdmVkIHNraWxsIGZpbGUgcGF0aDsgdGhlIGFnZW50IHNlc3Npb25cbiAqIHN5bnRoZXNpemVzIGEgdG9vbC1zdGFydC9jb21wbGV0ZSBwYWlyIGZyb20gdGhhdCBldmVudCBzbyB0aGUgVUkgY2FuXG4gKiByZW5kZXIgYSBjbGlja2FibGUgZmlsZSBsaW5rIGluc3RlYWQgb2YganVzdCB0aGUgc2tpbGwgbmFtZS4gU2VlXG4gKiB7QGxpbmsgc3ludGhlc2l6ZVNraWxsVG9vbENhbGx9LlxuICovXG5jb25zdCBISURERU5fVE9PTF9OQU1FUzogUmVhZG9ubHlTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoW1xuXHRDb3BpbG90VG9vbE5hbWUuUmVwb3J0SW50ZW50LFxuXHRDb3BpbG90VG9vbE5hbWUuU2tpbGwsXG5dKTtcblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhlIHRvb2wgc2hvdWxkIGJlIGhpZGRlbiBmcm9tIHRoZSBVSS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzSGlkZGVuVG9vbCh0b29sTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBISURERU5fVE9PTF9OQU1FUy5oYXModG9vbE5hbWUpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBmb3IgdGhlIGF1dG8tYXBwcm92ZWQgYWdlbnQtY29vcmRpbmF0aW9uIHRvb2xzIChsaXN0L3JlYWQvd3JpdGVcbiAqIGFnZW50cykuIFRoZXNlIGFyZSBjbGllbnQtY29udHJpYnV0ZWQgdG9vbHMgdGhhdCBuZXZlciBnbyB0aHJvdWdoIHRoZVxuICogcGVybWlzc2lvbiBmbG93LCBzbyB0aGUgYWdlbnQgaG9zdCBhdXRvLXJlYWRpZXMgdGhlbSBhdCBzdGFydCB0byBzdXJmYWNlIGFcbiAqIHRhaWxvcmVkIGludm9jYXRpb24gbWVzc2FnZSBpbnN0ZWFkIG9mIHRoZSBnZW5lcmljIGZhbGxiYWNrLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNBZ2VudENvb3JkaW5hdGlvblRvb2wodG9vbE5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gdG9vbE5hbWUgPT09IENvcGlsb3RUb29sTmFtZS5MaXN0QWdlbnRzXG5cdFx0fHwgdG9vbE5hbWUgPT09IENvcGlsb3RUb29sTmFtZS5SZWFkQWdlbnRcblx0XHR8fCB0b29sTmFtZSA9PT0gQ29waWxvdFRvb2xOYW1lLldyaXRlQWdlbnQ7XG59XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIHdoZW4gdGhlIHRvb2wgaXMgQ29waWxvdCdzIGludGVybmFsIEF1dG9waWxvdCBjb21wbGV0aW9uIHNpZ25hbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzVGFza0NvbXBsZXRlVG9vbCh0b29sTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiB0b29sTmFtZSA9PT0gQ29waWxvdFRvb2xOYW1lLlRhc2tDb21wbGV0ZTtcbn1cblxuLyoqXG4gKiBFeHRyYWN0cyB0aGUgdXNlci1mYWNpbmcgQXV0b3BpbG90IGNvbXBsZXRpb24gc3VtbWFyeSBmcm9tIHRoZSB0b29sIG91dHB1dCxcbiAqIGZhbGxpbmcgYmFjayB0byB0aGUgb3JpZ2luYWwgYHN1bW1hcnlgIGFyZ3VtZW50IGZvciBvbGRlci9pbmNvbXBsZXRlIGV2ZW50cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFRhc2tDb21wbGV0ZVN1bW1hcnkocGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQsIHRvb2xPdXRwdXQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICh0b29sT3V0cHV0ICYmIHRvb2xPdXRwdXQudHJpbSgpLmxlbmd0aCA+IDApIHtcblx0XHRyZXR1cm4gdG9vbE91dHB1dDtcblx0fVxuXHRjb25zdCBzdW1tYXJ5ID0gcGFyYW1ldGVycz8uc3VtbWFyeTtcblx0cmV0dXJuIHR5cGVvZiBzdW1tYXJ5ID09PSAnc3RyaW5nJyAmJiBzdW1tYXJ5LnRyaW0oKS5sZW5ndGggPiAwID8gc3VtbWFyeSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBGb3JtYXRzIHRoZSBBdXRvcGlsb3QgY29tcGxldGlvbiBzdW1tYXJ5IGFzIHRoZSBtYXJrZG93biByZXNwb25zZSBwYXJ0XG4gKiBjb250ZW50LCBpbmNsdWRpbmcgdGhlIGxvY2FsaXplZCBwcmVmaXguXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRUYXNrQ29tcGxldGVNYXJrZG93bihwYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCwgdG9vbE91dHB1dDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgc3VtbWFyeSA9IGdldFRhc2tDb21wbGV0ZVN1bW1hcnkocGFyYW1ldGVycywgdG9vbE91dHB1dCk7XG5cdGlmICghc3VtbWFyeSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuICdcXG5cXG4nICsgbG9jYWxpemUoJ3Rvb2xNYXJrZG93bi50YXNrQ29tcGxldGUnLCBcIioqVGFzayBjb21wbGV0ZWQ6KiogezB9XCIsIHN1bW1hcnkpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgdG9vbCBzaG91bGQgcmVuZGVyIGFzIGEgbWFya2Rvd24gcmVzcG9uc2UgcGFydCBpbnN0ZWFkXG4gKiBvZiBhIHRvb2wtY2FsbCBlbnRyeS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzTWFya2Rvd25SZW5kZXJlZFRvb2wodG9vbE5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNUYXNrQ29tcGxldGVUb29sKHRvb2xOYW1lKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIG1hcmtkb3duIGNvbnRlbnQgZm9yIHRvb2xzIHJlbmRlcmVkIGFzIGlubGluZSBtYXJrZG93biByZXNwb25zZVxuICogcGFydHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRUb29sTWFya2Rvd25Db250ZW50KHRvb2xOYW1lOiBzdHJpbmcsIHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFpc01hcmtkb3duUmVuZGVyZWRUb29sKHRvb2xOYW1lKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgc3VtbWFyeSA9IGdldFRhc2tDb21wbGV0ZVN1bW1hcnkocGFyYW1ldGVycywgdW5kZWZpbmVkKTtcblx0aWYgKCFzdW1tYXJ5KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gZ2V0VGFza0NvbXBsZXRlTWFya2Rvd24ocGFyYW1ldGVycywgdW5kZWZpbmVkKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhlIHRvb2wgZXhlY3V0ZXMgc2hlbGwgY29tbWFuZHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1NoZWxsVG9vbCh0b29sTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBTSEVMTF9UT09MX05BTUVTLmhhcyh0b29sTmFtZSk7XG59XG5cbi8qKlxuICogRXh0cmFjdHMgdGhlIGludGVudGlvbiBmb3IgYSBzaGVsbCB0b29sIGNhbGwgZnJvbSBpdHMgYGRlc2NyaXB0aW9uYFxuICogYXJndW1lbnQuIFRoZSBDb3BpbG90IHNoZWxsIHRvb2xzIChgYmFzaGAvYHBvd2Vyc2hlbGxgKSBjYXJyeSBhIHNob3J0XG4gKiBodW1hbi1yZWFkYWJsZSBkZXNjcmlwdGlvbiBvZiB3aGF0IHRoZSBjb21tYW5kIGRvZXMsIHdoaWNoIG1hdGNoZXMgdGhlXG4gKiBtb2RlbCdzIGludGVudGlvbiBzdW1tYXJ5LiBOb24tc2hlbGwgdG9vbHMgaGF2ZSBubyBzdWNoIGFyZ3VtZW50LCBzbyB0aGlzXG4gKiByZXR1cm5zIGB1bmRlZmluZWRgIGZvciB0aGVtLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2hlbGxJbnRlbnRpb24odG9vbE5hbWU6IHN0cmluZywgcGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoaXNTaGVsbFRvb2wodG9vbE5hbWUpICYmIHR5cGVvZiBwYXJhbWV0ZXJzPy5kZXNjcmlwdGlvbiA9PT0gJ3N0cmluZycgJiYgcGFyYW1ldGVycy5kZXNjcmlwdGlvbi5sZW5ndGggPiAwKSB7XG5cdFx0cmV0dXJuIHBhcmFtZXRlcnMuZGVzY3JpcHRpb247XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIERpc3BsYXkgaGVscGVyc1xuLy9cbi8vIFRoZXNlIGZ1bmN0aW9ucyB0cmFuc2xhdGUgQ29waWxvdCBDTEkgdG9vbCBuYW1lcyBhbmQgYXJndW1lbnRzIGludG9cbi8vIGh1bWFuLXJlYWRhYmxlIGRpc3BsYXkgc3RyaW5ncy4gVGhpcyBsb2dpYyBsaXZlcyBoZXJlIC0tIGluIHRoZSBhZ2VudC1ob3N0XG4vLyBwcm9jZXNzIC0tIHNvIHRoZSBJUEMgcHJvdG9jb2wgc3RheXMgYWdlbnQtYWdub3N0aWM7IHRoZSByZW5kZXJlciBuZXZlciBuZWVkc1xuLy8gdG8ga25vdyBhYm91dCBzcGVjaWZpYyB0b29sIG5hbWVzLlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gdHJ1bmNhdGUodGV4dDogc3RyaW5nLCBtYXhMZW5ndGg6IG51bWJlcik6IHN0cmluZyB7XG5cdHJldHVybiB0ZXh0Lmxlbmd0aCA+IG1heExlbmd0aCA/IHRleHQuc3Vic3RyaW5nKDAsIG1heExlbmd0aCAtIDMpICsgJy4uLicgOiB0ZXh0O1xufVxuXG4vKipcbiAqIEZvcm1hdHMgYSBmaWxlIHBhdGggYXMgYSBtYXJrZG93biBsaW5rIGBbXShmaWxlLXVyaSlgIHNvIGl0IHJlbmRlcnNcbiAqIGFzIGEgY2xpY2thYmxlIGZpbGUgd2lkZ2V0IGluIHRoZSBjaGF0IFVJLlxuICovXG5mdW5jdGlvbiBmb3JtYXRQYXRoQXNNYXJrZG93bkxpbmsocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgdXJpID0gVVJJLmZpbGUocGF0aCk7XG5cdHJldHVybiBgWyR7ZXNjYXBlTWFya2Rvd25MaW5rTGFiZWwoYmFzZW5hbWUodXJpKSl9XSgke3VyaX0pYDtcbn1cblxuZnVuY3Rpb24gZm9ybWF0VXJsQXNNYXJrZG93bkxpbmsodXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kTGluayh1cmwsIHRydW5jYXRlKHVybCwgODApKS52YWx1ZTtcbn1cblxuLyoqXG4gKiBXcmFwcyBhIGxvY2FsaXplZCBtZXNzYWdlIGNvbnRhaW5pbmcgYSBtYXJrZG93biBmaWxlIGxpbmsgaW50byBhXG4gKiBgU3RyaW5nT3JNYXJrZG93bmAgb2JqZWN0IHNvIHRoZSByZW5kZXJlciB0cmVhdHMgaXQgYXMgbWFya2Rvd24uXG4gKi9cbmZ1bmN0aW9uIG1kKHZhbHVlOiBzdHJpbmcpOiBTdHJpbmdPck1hcmtkb3duIHtcblx0cmV0dXJuIHsgbWFya2Rvd246IHZhbHVlIH07XG59XG5cbmNvbnN0IGlkZW50aXR5UGF0aFJlc29sdmVyOiBUb29sUGF0aFJlc29sdmVyID0gcGF0aCA9PiBwYXRoO1xuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDb3BpbG90U3RyZWFtaW5nVG9vbElucHV0KHJhdzogc3RyaW5nKTogdW5rbm93biB7XG5cdHJldHVybiBwYXJzZVBhcnRpYWxUb29sSW5wdXQocmF3KSA/PyByYXc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUb29sRGlzcGxheU5hbWUodG9vbE5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHNlcnZlckRpc3BsYXkgPSBnZXRTZXJ2ZXJUb29sRGlzcGxheSh0b29sTmFtZSwgdW5kZWZpbmVkKT8uZGlzcGxheU5hbWU7XG5cdGlmIChzZXJ2ZXJEaXNwbGF5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gc2VydmVyRGlzcGxheTtcblx0fVxuXHRzd2l0Y2ggKHRvb2xOYW1lKSB7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuU3RyUmVwbGFjZUVkaXRvcjpcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5FZGl0OlxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLlN0clJlcGxhY2U6XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuSW5zZXJ0OiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLmVkaXQnLCBcIkVkaXQgRmlsZVwiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5DcmVhdGU6IHJldHVybiBsb2NhbGl6ZSgndG9vbE5hbWUuY3JlYXRlJywgXCJDcmVhdGUgRmlsZVwiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5WaWV3OiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLnJlYWQnLCBcIlJlYWRcIik7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuQmFzaDpcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5Qb3dlclNoZWxsOiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLnNoZWxsJywgXCJSdW4gU2hlbGwgQ29tbWFuZFwiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5SZWFkQmFzaDpcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5SZWFkUG93ZXJTaGVsbDogcmV0dXJuIGxvY2FsaXplKCd0b29sTmFtZS5yZWFkVGVybWluYWwnLCBcIlJlYWQgVGVybWluYWxcIik7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuV3JpdGVCYXNoOiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLndyaXRlQmFzaCcsIFwiV3JpdGUgdG8gQmFzaFwiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5Xcml0ZVBvd2VyU2hlbGw6IHJldHVybiBsb2NhbGl6ZSgndG9vbE5hbWUud3JpdGVQb3dlclNoZWxsJywgXCJXcml0ZSB0byBQb3dlclNoZWxsXCIpO1xuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLlN0b3BCYXNoOlxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLlN0b3BQb3dlclNoZWxsOlxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLkJhc2hTaHV0ZG93bjpcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5Qb3dlclNoZWxsU2h1dGRvd246IHJldHVybiBsb2NhbGl6ZSgndG9vbE5hbWUuc3RvcFNoZWxsJywgXCJTdG9wIFRlcm1pbmFsIFNlc3Npb25cIik7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuTGlzdEJhc2g6XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuTGlzdFBvd2VyU2hlbGw6IHJldHVybiBsb2NhbGl6ZSgndG9vbE5hbWUubGlzdFNoZWxsU2Vzc2lvbnMnLCBcIkxpc3QgU2hlbGwgU2Vzc2lvbnNcIik7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuR3JlcDpcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5SZzpcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5HbG9iOiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLnNlYXJjaCcsIFwiU2VhcmNoXCIpO1xuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLlNlYXJjaENvZGVTdWJhZ2VudDogcmV0dXJuIGxvY2FsaXplKCd0b29sTmFtZS5zZWFyY2hDb2RlJywgXCJTZWFyY2ggQ29kZVwiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5BcHBseVBhdGNoOiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLmFwcGx5UGF0Y2gnLCBcIkFwcGx5IFBhdGNoXCIpO1xuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLkdpdEFwcGx5UGF0Y2g6IHJldHVybiBsb2NhbGl6ZSgndG9vbE5hbWUucGF0Y2gnLCBcIlBhdGNoXCIpO1xuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLkNvZGVxbENoZWNrZXI6IHJldHVybiBsb2NhbGl6ZSgndG9vbE5hbWUuY29kZXFsQ2hlY2tlcicsIFwiQ29kZVFMIFNlY3VyaXR5IFNjYW5cIik7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuQ29kZVJldmlldzogcmV0dXJuIGxvY2FsaXplKCd0b29sTmFtZS5jb2RlUmV2aWV3JywgXCJDb2RlIFJldmlld1wiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5SZXBseVRvQ29tbWVudDogcmV0dXJuIGxvY2FsaXplKCd0b29sTmFtZS5yZXBseVRvQ29tbWVudCcsIFwiUmVwbHkgdG8gQ29tbWVudFwiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5UaGluazogcmV0dXJuIGxvY2FsaXplKCd0b29sTmFtZS50aGluaycsIFwiVGhpbmtpbmdcIik7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuUmVwb3J0SW50ZW50OiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLnJlcG9ydEludGVudCcsIFwiUmVwb3J0IEludGVudFwiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5SZXBvcnRQcm9ncmVzczogcmV0dXJuIGxvY2FsaXplKCd0b29sTmFtZS5yZXBvcnRQcm9ncmVzcycsIFwiUHJvZ3Jlc3MgdXBkYXRlXCIpO1xuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLldlYlNlYXJjaDogcmV0dXJuIGxvY2FsaXplKCd0b29sTmFtZS53ZWJTZWFyY2gnLCBcIldlYiBTZWFyY2hcIik7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuV2ViRmV0Y2g6IHJldHVybiBsb2NhbGl6ZSgndG9vbE5hbWUuZmV0Y2hXZWJDb250ZW50JywgXCJGZXRjaCBXZWIgQ29udGVudFwiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5VcGRhdGVUb2RvOiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLnVwZGF0ZVRvZG8nLCBcIlVwZGF0ZSBUb2RvXCIpO1xuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLlNob3dGaWxlOiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLnNob3dGaWxlJywgXCJTaG93IEZpbGVcIik7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuRmV0Y2hDb3BpbG90Q2xpRG9jdW1lbnRhdGlvbjogcmV0dXJuIGxvY2FsaXplKCd0b29sTmFtZS5mZXRjaENvcGlsb3RDbGlEb2N1bWVudGF0aW9uJywgXCJGZXRjaCBEb2N1bWVudGF0aW9uXCIpO1xuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLlByb3Bvc2VXb3JrOiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLnByb3Bvc2VXb3JrJywgXCJQcm9wb3NlIFdvcmtcIik7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuVGFza0NvbXBsZXRlOiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLnRhc2tDb21wbGV0ZScsIFwiVGFzayBDb21wbGV0ZVwiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5Bc2tVc2VyOiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLmFza1VzZXInLCBcIkFzayBVc2VyXCIpO1xuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLlNraWxsOiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLmludm9rZVNraWxsJywgXCJJbnZva2UgU2tpbGxcIik7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuVGFzazogcmV0dXJuIGxvY2FsaXplKCd0b29sTmFtZS50YXNrJywgXCJEZWxlZ2F0ZSBUYXNrXCIpO1xuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLkxpc3RBZ2VudHM6IHJldHVybiBsb2NhbGl6ZSgndG9vbE5hbWUubGlzdEFnZW50cycsIFwiTGlzdCBBZ2VudHNcIik7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuUmVhZEFnZW50OiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLnJlYWRBZ2VudCcsIFwiUmVhZCBBZ2VudFwiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5FeGl0UGxhbk1vZGU6IHJldHVybiBsb2NhbGl6ZSgndG9vbE5hbWUuZXhpdFBsYW5Nb2RlRnVsbCcsIFwiRXhpdCBQbGFuIE1vZGVcIik7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuU3FsOiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLnNxbCcsIFwiRXhlY3V0ZSBTUUxcIik7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuTHNwOiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLmxzcCcsIFwiTGFuZ3VhZ2UgU2VydmVyXCIpO1xuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLkNyZWF0ZVB1bGxSZXF1ZXN0OiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLmNyZWF0ZVB1bGxSZXF1ZXN0JywgXCJDcmVhdGUgUHVsbCBSZXF1ZXN0XCIpO1xuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLkdoQWR2aXNvcnlEYXRhYmFzZTogcmV0dXJuIGxvY2FsaXplKCd0b29sTmFtZS5naEFkdmlzb3J5RGF0YWJhc2UnLCBcIkNoZWNrIERlcGVuZGVuY2llc1wiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5TdG9yZU1lbW9yeTogcmV0dXJuIGxvY2FsaXplKCd0b29sTmFtZS5zdG9yZU1lbW9yeScsIFwiU3RvcmUgTWVtb3J5XCIpO1xuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLlBhcmFsbGVsVmFsaWRhdGlvbjogcmV0dXJuIGxvY2FsaXplKCd0b29sTmFtZS5wYXJhbGxlbFZhbGlkYXRpb24nLCBcIlZhbGlkYXRlIENoYW5nZXNcIik7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuV3JpdGVBZ2VudDogcmV0dXJuIGxvY2FsaXplKCd0b29sTmFtZS53cml0ZUFnZW50JywgXCJXcml0ZSB0byBBZ2VudFwiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5NY3BSZWxvYWQ6IHJldHVybiBsb2NhbGl6ZSgndG9vbE5hbWUubWNwUmVsb2FkJywgXCJSZWxvYWQgTUNQIENvbmZpZ1wiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5NY3BWYWxpZGF0ZTogcmV0dXJuIGxvY2FsaXplKCd0b29sTmFtZS5tY3BWYWxpZGF0ZScsIFwiVmFsaWRhdGUgTUNQIENvbmZpZ1wiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5Ub29sU2VhcmNoVG9vbFJlZ2V4OiByZXR1cm4gbG9jYWxpemUoJ3Rvb2xOYW1lLnRvb2xTZWFyY2hUb29sUmVnZXgnLCBcIlNlYXJjaCBUb29sc1wiKTtcblx0XHRkZWZhdWx0OiByZXR1cm4gdG9vbE5hbWU7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEludm9jYXRpb25NZXNzYWdlKHRvb2xOYW1lOiBzdHJpbmcsIGRpc3BsYXlOYW1lOiBzdHJpbmcsIHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkLCByZXNvbHZlUGF0aDogVG9vbFBhdGhSZXNvbHZlciA9IGlkZW50aXR5UGF0aFJlc29sdmVyKTogU3RyaW5nT3JNYXJrZG93biB7XG5cdGNvbnN0IHNlcnZlckRpc3BsYXkgPSBnZXRTZXJ2ZXJUb29sRGlzcGxheSh0b29sTmFtZSwgcGFyYW1ldGVycyk/Lmludm9jYXRpb25NZXNzYWdlO1xuXHRpZiAoc2VydmVyRGlzcGxheSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHNlcnZlckRpc3BsYXk7XG5cdH1cblxuXHRpZiAoU0hFTExfVE9PTF9OQU1FUy5oYXModG9vbE5hbWUpKSB7XG5cdFx0Y29uc3QgYXJncyA9IHBhcmFtZXRlcnMgYXMgSUNvcGlsb3RTaGVsbFRvb2xBcmdzIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChhcmdzPy5jb21tYW5kKSB7XG5cdFx0XHRjb25zdCBmaXJzdExpbmUgPSBhcmdzLmNvbW1hbmQuc3BsaXQoJ1xcbicpWzBdO1xuXHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCd0b29sSW52b2tlLnNoZWxsQ21kJywgXCJSdW5uaW5nIHswfVwiLCBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKHRydW5jYXRlKGZpcnN0TGluZSwgODApKSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rvb2xJbnZva2Uuc2hlbGwnLCBcIlJ1bm5pbmcgezB9IGNvbW1hbmRcIiwgZGlzcGxheU5hbWUpO1xuXHR9XG5cblx0aWYgKFdSSVRFX1NIRUxMX1RPT0xfTkFNRVMuaGFzKHRvb2xOYW1lKSkge1xuXHRcdGNvbnN0IGFyZ3MgPSBwYXJhbWV0ZXJzIGFzIElDb3BpbG90U2hlbGxUb29sQXJncyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoYXJncz8uY29tbWFuZCkge1xuXHRcdFx0Y29uc3QgZmlyc3RMaW5lID0gYXJncy5jb21tYW5kLnNwbGl0KCdcXG4nKVswXTtcblx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgndG9vbEludm9rZS53cml0ZVNoZWxsQ21kJywgXCJTZW5kaW5nIHswfSB0byBzaGVsbFwiLCBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKHRydW5jYXRlKGZpcnN0TGluZSwgODApKSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rvb2xJbnZva2Uud3JpdGVTaGVsbCcsIFwiU2VuZGluZyBpbnB1dCB0byBzaGVsbFwiKTtcblx0fVxuXG5cdGlmIChSRUFEX1NIRUxMX1RPT0xfTkFNRVMuaGFzKHRvb2xOYW1lKSkge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgndG9vbEludm9rZS5yZWFkVGVybWluYWwnLCBcIlJlYWRpbmcgVGVybWluYWxcIik7XG5cdH1cblxuXHRzd2l0Y2ggKHRvb2xOYW1lKSB7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuVmlldzoge1xuXHRcdFx0Y29uc3QgYXJncyA9IHBhcmFtZXRlcnMgYXMgSUNvcGlsb3RWaWV3VG9vbEFyZ3MgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodHlwZW9mIGFyZ3M/LnBhdGggPT09ICdzdHJpbmcnICYmIGFyZ3MucGF0aCkge1xuXHRcdFx0XHRjb25zdCBsaW5rID0gZm9ybWF0UGF0aEFzTWFya2Rvd25MaW5rKHJlc29sdmVQYXRoKGFyZ3MucGF0aCkpO1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IGZvcm1hdFZpZXdSYW5nZShhcmdzLnZpZXdfcmFuZ2UpO1xuXHRcdFx0XHRpZiAocmFuZ2UpIHtcblx0XHRcdFx0XHRpZiAocmFuZ2UuZW5kTGluZSA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgndG9vbEludm9rZS52aWV3RmlsZUZyb21MaW5lJywgXCJSZWFkaW5nIHswfSwgbGluZSB7MX0gdG8gdGhlIGVuZFwiLCBsaW5rLCByYW5nZS5zdGFydExpbmUpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHJhbmdlLmVuZExpbmUgIT09IHJhbmdlLnN0YXJ0TGluZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCd0b29sSW52b2tlLnZpZXdGaWxlUmFuZ2UnLCBcIlJlYWRpbmcgezB9LCBsaW5lcyB7MX0gdG8gezJ9XCIsIGxpbmssIHJhbmdlLnN0YXJ0TGluZSwgcmFuZ2UuZW5kTGluZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ3Rvb2xJbnZva2Uudmlld0ZpbGVMaW5lJywgXCJSZWFkaW5nIHswfSwgbGluZSB7MX1cIiwgbGluaywgcmFuZ2Uuc3RhcnRMaW5lKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCd0b29sSW52b2tlLnZpZXdGaWxlJywgXCJSZWFkaW5nIHswfVwiLCBsaW5rKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rvb2xJbnZva2UudmlldycsIFwiUmVhZGluZyBmaWxlXCIpO1xuXHRcdH1cblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5FZGl0OlxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLlN0clJlcGxhY2U6IHtcblx0XHRcdGNvbnN0IGFyZ3MgPSBwYXJhbWV0ZXJzIGFzIElDb3BpbG90RmlsZVRvb2xBcmdzIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHR5cGVvZiBhcmdzPy5wYXRoID09PSAnc3RyaW5nJyAmJiBhcmdzLnBhdGgpIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCd0b29sSW52b2tlLmVkaXRGaWxlJywgXCJFZGl0aW5nIHswfVwiLCBmb3JtYXRQYXRoQXNNYXJrZG93bkxpbmsocmVzb2x2ZVBhdGgoYXJncy5wYXRoKSkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgndG9vbEludm9rZS5lZGl0JywgXCJFZGl0aW5nIGZpbGVcIik7XG5cdFx0fVxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLkluc2VydDoge1xuXHRcdFx0Y29uc3QgYXJncyA9IHBhcmFtZXRlcnMgYXMgSUNvcGlsb3RGaWxlVG9vbEFyZ3MgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodHlwZW9mIGFyZ3M/LnBhdGggPT09ICdzdHJpbmcnICYmIGFyZ3MucGF0aCkge1xuXHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ3Rvb2xJbnZva2UuaW5zZXJ0RmlsZScsIFwiSW5zZXJ0aW5nIHRleHQgaW4gezB9XCIsIGZvcm1hdFBhdGhBc01hcmtkb3duTGluayhyZXNvbHZlUGF0aChhcmdzLnBhdGgpKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0b29sSW52b2tlLmluc2VydCcsIFwiSW5zZXJ0aW5nIHRleHRcIik7XG5cdFx0fVxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLkNyZWF0ZToge1xuXHRcdFx0Y29uc3QgYXJncyA9IHBhcmFtZXRlcnMgYXMgSUNvcGlsb3RGaWxlVG9vbEFyZ3MgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodHlwZW9mIGFyZ3M/LnBhdGggPT09ICdzdHJpbmcnICYmIGFyZ3MucGF0aCkge1xuXHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ3Rvb2xJbnZva2UuY3JlYXRlRmlsZScsIFwiQ3JlYXRpbmcgezB9XCIsIGZvcm1hdFBhdGhBc01hcmtkb3duTGluayhyZXNvbHZlUGF0aChhcmdzLnBhdGgpKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0b29sSW52b2tlLmNyZWF0ZScsIFwiQ3JlYXRpbmcgZmlsZVwiKTtcblx0XHR9XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuU3RyUmVwbGFjZUVkaXRvcjoge1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IChwYXJhbWV0ZXJzIGFzIElDb3BpbG90U3RyUmVwbGFjZUVkaXRvclRvb2xBcmdzIHwgdW5kZWZpbmVkKT8uY29tbWFuZDtcblx0XHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0XHRjYXNlICd2aWV3Jzpcblx0XHRcdFx0XHRyZXR1cm4gZ2V0SW52b2NhdGlvbk1lc3NhZ2UoQ29waWxvdFRvb2xOYW1lLlZpZXcsIGRpc3BsYXlOYW1lLCBwYXJhbWV0ZXJzLCByZXNvbHZlUGF0aCk7XG5cdFx0XHRcdGNhc2UgJ2NyZWF0ZSc6XG5cdFx0XHRcdFx0cmV0dXJuIGdldEludm9jYXRpb25NZXNzYWdlKENvcGlsb3RUb29sTmFtZS5DcmVhdGUsIGRpc3BsYXlOYW1lLCBwYXJhbWV0ZXJzLCByZXNvbHZlUGF0aCk7XG5cdFx0XHRcdGNhc2UgJ2luc2VydCc6XG5cdFx0XHRcdFx0cmV0dXJuIGdldEludm9jYXRpb25NZXNzYWdlKENvcGlsb3RUb29sTmFtZS5JbnNlcnQsIGRpc3BsYXlOYW1lLCBwYXJhbWV0ZXJzLCByZXNvbHZlUGF0aCk7XG5cdFx0XHRcdGNhc2UgJ2VkaXQnOlxuXHRcdFx0XHRjYXNlICdzdHJfcmVwbGFjZSc6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIGdldEludm9jYXRpb25NZXNzYWdlKENvcGlsb3RUb29sTmFtZS5FZGl0LCBkaXNwbGF5TmFtZSwgcGFyYW1ldGVycywgcmVzb2x2ZVBhdGgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5HcmVwOiB7XG5cdFx0XHRjb25zdCBhcmdzID0gcGFyYW1ldGVycyBhcyBJQ29waWxvdEdyZXBUb29sQXJncyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChhcmdzPy5wYXR0ZXJuKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgndG9vbEludm9rZS5ncmVwUGF0dGVybicsIFwiU2VhcmNoaW5nIGZvciB7MH1cIiwgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSh0cnVuY2F0ZShhcmdzLnBhdHRlcm4sIDgwKSkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgndG9vbEludm9rZS5ncmVwJywgXCJTZWFyY2hpbmcgZmlsZXNcIik7XG5cdFx0fVxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLlJnOiB7XG5cdFx0XHRjb25zdCBhcmdzID0gcGFyYW1ldGVycyBhcyBJQ29waWxvdFJnVG9vbEFyZ3MgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoYXJncz8ucGF0dGVybikge1xuXHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ3Rvb2xJbnZva2UuZ3JlcFBhdHRlcm4nLCBcIlNlYXJjaGluZyBmb3IgezB9XCIsIGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUodHJ1bmNhdGUoYXJncy5wYXR0ZXJuLCA4MCkpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rvb2xJbnZva2UuZ3JlcCcsIFwiU2VhcmNoaW5nIGZpbGVzXCIpO1xuXHRcdH1cblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5HbG9iOiB7XG5cdFx0XHRjb25zdCBhcmdzID0gcGFyYW1ldGVycyBhcyBJQ29waWxvdEdsb2JUb29sQXJncyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChhcmdzPy5wYXR0ZXJuKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgndG9vbEludm9rZS5nbG9iUGF0dGVybicsIFwiRmluZGluZyBmaWxlcyBtYXRjaGluZyB7MH1cIiwgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSh0cnVuY2F0ZShhcmdzLnBhdHRlcm4sIDgwKSkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgndG9vbEludm9rZS5nbG9iJywgXCJGaW5kaW5nIGZpbGVzXCIpO1xuXHRcdH1cblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5BcHBseVBhdGNoOlxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLkdpdEFwcGx5UGF0Y2g6IHtcblx0XHRcdGNvbnN0IGZpbGVzID0gZ2V0RWRpdEZpbGVQYXRocyhwYXJhbWV0ZXJzKS5tYXAocmVzb2x2ZVBhdGgpO1xuXHRcdFx0aWYgKGZpbGVzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ3Rvb2xJbnZva2UucGF0Y2hGaWxlJywgXCJFZGl0aW5nIHswfVwiLCBmb3JtYXRQYXRoQXNNYXJrZG93bkxpbmsoZmlsZXNbMF0pKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZmlsZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ3Rvb2xJbnZva2UucGF0Y2hGaWxlcycsIFwiRWRpdGluZyB7MH1cIiwgZmlsZXMubWFwKGZvcm1hdFBhdGhBc01hcmtkb3duTGluaykuam9pbignLCAnKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0b29sSW52b2tlLnBhdGNoJywgXCJFZGl0aW5nIGZpbGVzXCIpO1xuXHRcdH1cblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5TcWw6IHtcblx0XHRcdGNvbnN0IGFyZ3MgPSBwYXJhbWV0ZXJzIGFzIElDb3BpbG90U3FsVG9vbEFyZ3MgfCB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gYXJncz8uZGVzY3JpcHRpb24gfHwgbG9jYWxpemUoJ3Rvb2xJbnZva2Uuc3FsJywgXCJFeGVjdXRpbmcgU1FMIHF1ZXJ5XCIpO1xuXHRcdH1cblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5XZWJGZXRjaDoge1xuXHRcdFx0Y29uc3QgYXJncyA9IHBhcmFtZXRlcnMgYXMgSUNvcGlsb3RXZWJGZXRjaFRvb2xBcmdzIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGFyZ3M/LnVybCkge1xuXHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ3Rvb2xJbnZva2Uud2ViRmV0Y2gnLCBcIkZldGNoaW5nIHswfVwiLCBmb3JtYXRVcmxBc01hcmtkb3duTGluayhhcmdzLnVybCkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgndG9vbEludm9rZS53ZWJGZXRjaEdlbmVyaWMnLCBcIkZldGNoaW5nIFVSTFwiKTtcblx0XHR9XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuRXhpdFBsYW5Nb2RlOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0b29sSW52b2tlLmV4aXRQbGFuTW9kZScsIFwiUHJlc2VudGluZyBwbGFuXCIpO1xuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLlRhc2s6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rvb2xJbnZva2UudGFzaycsIFwiRGVsZWdhdGluZyB0YXNrXCIpO1xuXHRcdC8vIFRoZSBhZ2VudC1jb29yZGluYXRpb24gdG9vbHMgKGxpc3QvcmVhZC93cml0ZSBhZ2VudHMpIGFyZSBmYXN0LCBzb1xuXHRcdC8vIHRoZXkgdXNlIGEgc2luZ2xlIG1lc3NhZ2UgZm9yIGJvdGggdGhlIHJ1bm5pbmcgYW5kIGNvbXBsZXRlZCBzdGF0ZXM6XG5cdFx0Ly8gdGhlIHBhc3QtdGVuc2UgcGhyYXNpbmcuIFNlZSBnZXRQYXN0VGVuc2VNZXNzYWdlLlxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLkxpc3RBZ2VudHM6XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuUmVhZEFnZW50OlxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLldyaXRlQWdlbnQ6XG5cdFx0XHRyZXR1cm4gZ2V0UGFzdFRlbnNlTWVzc2FnZSh0b29sTmFtZSwgZGlzcGxheU5hbWUsIHBhcmFtZXRlcnMsIHRydWUpO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gZGlzcGxheU5hbWU7XG5cdH1cbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBwcm9ncmVzc2l2ZWx5IHJlZmluZWQgbWVzc2FnZSBzaG93biB3aGlsZSBDb3BpbG90IGdlbmVyYXRlcyB0b29sIGlucHV0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3RyZWFtaW5nSW52b2NhdGlvbk1lc3NhZ2UodG9vbE5hbWU6IHN0cmluZywgZGlzcGxheU5hbWU6IHN0cmluZywgcGFyYW1ldGVyczogdW5rbm93biwgcmVzb2x2ZVBhdGg6IFRvb2xQYXRoUmVzb2x2ZXIgPSBpZGVudGl0eVBhdGhSZXNvbHZlcik6IFN0cmluZ09yTWFya2Rvd24ge1xuXHRjb25zdCBvYmplY3RQYXJhbWV0ZXJzID0gcGFyYW1ldGVycyAhPT0gbnVsbCAmJiB0eXBlb2YgcGFyYW1ldGVycyA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkocGFyYW1ldGVycylcblx0XHQ/IHBhcmFtZXRlcnMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj5cblx0XHQ6IHVuZGVmaW5lZDtcblx0c3dpdGNoICh0b29sTmFtZSkge1xuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLkVkaXQ6XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuU3RyUmVwbGFjZToge1xuXHRcdFx0Y29uc3QgYXJncyA9IG9iamVjdFBhcmFtZXRlcnMgYXMgSUNvcGlsb3RFZGl0VG9vbEFyZ3MgfCB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gZ2V0U3RyZWFtaW5nUmVwbGFjZU1lc3NhZ2UoYXJncz8ucGF0aCwgc3RyZWFtaW5nVG9vbFRleHRMaW5lQ291bnQoYXJncz8ub2xkX3N0ciksIHN0cmVhbWluZ1Rvb2xUZXh0TGluZUNvdW50KGFyZ3M/Lm5ld19zdHIpLCByZXNvbHZlUGF0aCk7XG5cdFx0fVxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLkNyZWF0ZToge1xuXHRcdFx0Y29uc3QgYXJncyA9IG9iamVjdFBhcmFtZXRlcnMgYXMgSUNvcGlsb3RDcmVhdGVUb29sQXJncyB8IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiBnZXRTdHJlYW1pbmdDcmVhdGVNZXNzYWdlKGFyZ3M/LnBhdGgsIHN0cmVhbWluZ1Rvb2xUZXh0TGluZUNvdW50KGFyZ3M/LmZpbGVfdGV4dCksIHJlc29sdmVQYXRoKTtcblx0XHR9XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuSW5zZXJ0OiB7XG5cdFx0XHRjb25zdCBhcmdzID0gb2JqZWN0UGFyYW1ldGVycyBhcyBJQ29waWxvdEluc2VydFRvb2xBcmdzIHwgdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIGdldFN0cmVhbWluZ0luc2VydE1lc3NhZ2UoYXJncz8ucGF0aCwgc3RyZWFtaW5nVG9vbFRleHRMaW5lQ291bnQoYXJncz8ubmV3X3N0ciksIHJlc29sdmVQYXRoKTtcblx0XHR9XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuU3RyUmVwbGFjZUVkaXRvcjoge1xuXHRcdFx0Y29uc3QgYXJncyA9IG9iamVjdFBhcmFtZXRlcnMgYXMgSUNvcGlsb3RTdHJSZXBsYWNlRWRpdG9yVG9vbEFyZ3MgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBjb21tYW5kID0gYXJncz8uY29tbWFuZDtcblx0XHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0XHRjYXNlICd2aWV3Jzpcblx0XHRcdFx0XHRyZXR1cm4gZ2V0SW52b2NhdGlvbk1lc3NhZ2UoQ29waWxvdFRvb2xOYW1lLlZpZXcsIGRpc3BsYXlOYW1lLCBvYmplY3RQYXJhbWV0ZXJzLCByZXNvbHZlUGF0aCk7XG5cdFx0XHRcdGNhc2UgJ2NyZWF0ZSc6XG5cdFx0XHRcdFx0cmV0dXJuIGdldFN0cmVhbWluZ0NyZWF0ZU1lc3NhZ2UoYXJncz8ucGF0aCwgc3RyZWFtaW5nVG9vbFRleHRMaW5lQ291bnQoYXJncz8uZmlsZV90ZXh0KSwgcmVzb2x2ZVBhdGgpO1xuXHRcdFx0XHRjYXNlICdpbnNlcnQnOlxuXHRcdFx0XHRcdHJldHVybiBnZXRTdHJlYW1pbmdJbnNlcnRNZXNzYWdlKGFyZ3M/LnBhdGgsIHN0cmVhbWluZ1Rvb2xUZXh0TGluZUNvdW50KGFyZ3M/Lm5ld19zdHIpLCByZXNvbHZlUGF0aCk7XG5cdFx0XHRcdGNhc2UgJ2VkaXQnOlxuXHRcdFx0XHRjYXNlICdzdHJfcmVwbGFjZSc6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIGdldFN0cmVhbWluZ1JlcGxhY2VNZXNzYWdlKGFyZ3M/LnBhdGgsIHN0cmVhbWluZ1Rvb2xUZXh0TGluZUNvdW50KGFyZ3M/Lm9sZF9zdHIpLCBzdHJlYW1pbmdUb29sVGV4dExpbmVDb3VudChhcmdzPy5uZXdfc3RyKSwgcmVzb2x2ZVBhdGgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5BcHBseVBhdGNoOlxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLkdpdEFwcGx5UGF0Y2g6IHtcblx0XHRcdGNvbnN0IGFyZ3MgPSBvYmplY3RQYXJhbWV0ZXJzIGFzIElDb3BpbG90QXBwbHlQYXRjaFRvb2xBcmdzIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcGF0Y2ggPSB0eXBlb2YgcGFyYW1ldGVycyA9PT0gJ3N0cmluZycgPyBwYXJhbWV0ZXJzIDogYXJncz8uaW5wdXQgPz8gYXJncz8ucGF0Y2g7XG5cdFx0XHRyZXR1cm4gZ2V0U3RyZWFtaW5nUGF0Y2hNZXNzYWdlKGdldEVkaXRGaWxlUGF0aHMocGFyYW1ldGVycyksIHN0cmVhbWluZ1Rvb2xUZXh0TGluZUNvdW50KHBhdGNoKSwgcmVzb2x2ZVBhdGgpO1xuXHRcdH1cblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIGdldEludm9jYXRpb25NZXNzYWdlKHRvb2xOYW1lLCBkaXNwbGF5TmFtZSwgb2JqZWN0UGFyYW1ldGVycywgcmVzb2x2ZVBhdGgpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRQYXN0VGVuc2VNZXNzYWdlKHRvb2xOYW1lOiBzdHJpbmcsIGRpc3BsYXlOYW1lOiBzdHJpbmcsIHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkLCBzdWNjZXNzOiBib29sZWFuLCByZXN1bHRUZXh0Pzogc3RyaW5nLCByZXNvbHZlUGF0aDogVG9vbFBhdGhSZXNvbHZlciA9IGlkZW50aXR5UGF0aFJlc29sdmVyKTogU3RyaW5nT3JNYXJrZG93biB7XG5cdGlmICghc3VjY2Vzcykge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgndG9vbENvbXBsZXRlLmZhaWxlZCcsIFwiXFxcInswfVxcXCIgZmFpbGVkXCIsIGRpc3BsYXlOYW1lKTtcblx0fVxuXG5cdGNvbnN0IHNlcnZlckRpc3BsYXkgPSBnZXRTZXJ2ZXJUb29sRGlzcGxheSh0b29sTmFtZSwgcGFyYW1ldGVycywgeyB0ZXh0OiByZXN1bHRUZXh0LCBzdWNjZXNzIH0pPy5wYXN0VGVuc2VNZXNzYWdlO1xuXHRpZiAoc2VydmVyRGlzcGxheSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHNlcnZlckRpc3BsYXk7XG5cdH1cblxuXHRpZiAoU0hFTExfVE9PTF9OQU1FUy5oYXModG9vbE5hbWUpKSB7XG5cdFx0Y29uc3QgYXJncyA9IHBhcmFtZXRlcnMgYXMgSUNvcGlsb3RTaGVsbFRvb2xBcmdzIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChhcmdzPy5jb21tYW5kKSB7XG5cdFx0XHRjb25zdCBmaXJzdExpbmUgPSBhcmdzLmNvbW1hbmQuc3BsaXQoJ1xcbicpWzBdO1xuXHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCd0b29sQ29tcGxldGUuc2hlbGxDbWQnLCBcIlJhbiB7MH1cIiwgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSh0cnVuY2F0ZShmaXJzdExpbmUsIDgwKSkpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2FsaXplKCd0b29sQ29tcGxldGUuc2hlbGwnLCBcIlJhbiB7MH0gY29tbWFuZFwiLCBkaXNwbGF5TmFtZSk7XG5cdH1cblxuXHRpZiAoV1JJVEVfU0hFTExfVE9PTF9OQU1FUy5oYXModG9vbE5hbWUpKSB7XG5cdFx0Y29uc3QgYXJncyA9IHBhcmFtZXRlcnMgYXMgSUNvcGlsb3RTaGVsbFRvb2xBcmdzIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChhcmdzPy5jb21tYW5kKSB7XG5cdFx0XHRjb25zdCBmaXJzdExpbmUgPSBhcmdzLmNvbW1hbmQuc3BsaXQoJ1xcbicpWzBdO1xuXHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCd0b29sQ29tcGxldGUud3JpdGVTaGVsbENtZCcsIFwiU2VudCB7MH0gdG8gc2hlbGxcIiwgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSh0cnVuY2F0ZShmaXJzdExpbmUsIDgwKSkpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2FsaXplKCd0b29sQ29tcGxldGUud3JpdGVTaGVsbCcsIFwiU2VudCBpbnB1dCB0byBzaGVsbFwiKTtcblx0fVxuXG5cdGlmIChSRUFEX1NIRUxMX1RPT0xfTkFNRVMuaGFzKHRvb2xOYW1lKSkge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgndG9vbENvbXBsZXRlLnJlYWRUZXJtaW5hbCcsIFwiUmVhZCBUZXJtaW5hbFwiKTtcblx0fVxuXG5cdHN3aXRjaCAodG9vbE5hbWUpIHtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5WaWV3OiB7XG5cdFx0XHRjb25zdCBhcmdzID0gcGFyYW1ldGVycyBhcyBJQ29waWxvdFZpZXdUb29sQXJncyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0eXBlb2YgYXJncz8ucGF0aCA9PT0gJ3N0cmluZycgJiYgYXJncy5wYXRoKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmsgPSBmb3JtYXRQYXRoQXNNYXJrZG93bkxpbmsocmVzb2x2ZVBhdGgoYXJncy5wYXRoKSk7XG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gZm9ybWF0Vmlld1JhbmdlKGFyZ3Mudmlld19yYW5nZSk7XG5cdFx0XHRcdGlmIChyYW5nZSkge1xuXHRcdFx0XHRcdGlmIChyYW5nZS5lbmRMaW5lID09PSAtMSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCd0b29sQ29tcGxldGUudmlld0ZpbGVGcm9tTGluZScsIFwiUmVhZCB7MH0sIGxpbmUgezF9IHRvIHRoZSBlbmRcIiwgbGluaywgcmFuZ2Uuc3RhcnRMaW5lKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChyYW5nZS5lbmRMaW5lICE9PSByYW5nZS5zdGFydExpbmUpIHtcblx0XHRcdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgndG9vbENvbXBsZXRlLnZpZXdGaWxlUmFuZ2UnLCBcIlJlYWQgezB9LCBsaW5lcyB7MX0gdG8gezJ9XCIsIGxpbmssIHJhbmdlLnN0YXJ0TGluZSwgcmFuZ2UuZW5kTGluZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS52aWV3RmlsZUxpbmUnLCBcIlJlYWQgezB9LCBsaW5lIHsxfVwiLCBsaW5rLCByYW5nZS5zdGFydExpbmUpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS52aWV3RmlsZScsIFwiUmVhZCB7MH1cIiwgbGluaykpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0b29sQ29tcGxldGUudmlldycsIFwiUmVhZCBmaWxlXCIpO1xuXHRcdH1cblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5FZGl0OlxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLlN0clJlcGxhY2U6IHtcblx0XHRcdGNvbnN0IGFyZ3MgPSBwYXJhbWV0ZXJzIGFzIElDb3BpbG90RmlsZVRvb2xBcmdzIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHR5cGVvZiBhcmdzPy5wYXRoID09PSAnc3RyaW5nJyAmJiBhcmdzLnBhdGgpIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCd0b29sQ29tcGxldGUuZWRpdEZpbGUnLCBcIkVkaXRlZCB7MH1cIiwgZm9ybWF0UGF0aEFzTWFya2Rvd25MaW5rKHJlc29sdmVQYXRoKGFyZ3MucGF0aCkpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS5lZGl0JywgXCJFZGl0ZWQgZmlsZVwiKTtcblx0XHR9XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuSW5zZXJ0OiB7XG5cdFx0XHRjb25zdCBhcmdzID0gcGFyYW1ldGVycyBhcyBJQ29waWxvdEZpbGVUb29sQXJncyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0eXBlb2YgYXJncz8ucGF0aCA9PT0gJ3N0cmluZycgJiYgYXJncy5wYXRoKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgndG9vbENvbXBsZXRlLmluc2VydEZpbGUnLCBcIkluc2VydGVkIHRleHQgaW4gezB9XCIsIGZvcm1hdFBhdGhBc01hcmtkb3duTGluayhyZXNvbHZlUGF0aChhcmdzLnBhdGgpKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0b29sQ29tcGxldGUuaW5zZXJ0JywgXCJJbnNlcnRlZCB0ZXh0XCIpO1xuXHRcdH1cblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5DcmVhdGU6IHtcblx0XHRcdGNvbnN0IGFyZ3MgPSBwYXJhbWV0ZXJzIGFzIElDb3BpbG90RmlsZVRvb2xBcmdzIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHR5cGVvZiBhcmdzPy5wYXRoID09PSAnc3RyaW5nJyAmJiBhcmdzLnBhdGgpIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCd0b29sQ29tcGxldGUuY3JlYXRlRmlsZScsIFwiQ3JlYXRlZCB7MH1cIiwgZm9ybWF0UGF0aEFzTWFya2Rvd25MaW5rKHJlc29sdmVQYXRoKGFyZ3MucGF0aCkpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS5jcmVhdGUnLCBcIkNyZWF0ZWQgZmlsZVwiKTtcblx0XHR9XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuU3RyUmVwbGFjZUVkaXRvcjoge1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IChwYXJhbWV0ZXJzIGFzIElDb3BpbG90U3RyUmVwbGFjZUVkaXRvclRvb2xBcmdzIHwgdW5kZWZpbmVkKT8uY29tbWFuZDtcblx0XHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0XHRjYXNlICd2aWV3Jzpcblx0XHRcdFx0XHRyZXR1cm4gZ2V0UGFzdFRlbnNlTWVzc2FnZShDb3BpbG90VG9vbE5hbWUuVmlldywgZGlzcGxheU5hbWUsIHBhcmFtZXRlcnMsIHN1Y2Nlc3MsIHJlc3VsdFRleHQsIHJlc29sdmVQYXRoKTtcblx0XHRcdFx0Y2FzZSAnY3JlYXRlJzpcblx0XHRcdFx0XHRyZXR1cm4gZ2V0UGFzdFRlbnNlTWVzc2FnZShDb3BpbG90VG9vbE5hbWUuQ3JlYXRlLCBkaXNwbGF5TmFtZSwgcGFyYW1ldGVycywgc3VjY2VzcywgcmVzdWx0VGV4dCwgcmVzb2x2ZVBhdGgpO1xuXHRcdFx0XHRjYXNlICdpbnNlcnQnOlxuXHRcdFx0XHRcdHJldHVybiBnZXRQYXN0VGVuc2VNZXNzYWdlKENvcGlsb3RUb29sTmFtZS5JbnNlcnQsIGRpc3BsYXlOYW1lLCBwYXJhbWV0ZXJzLCBzdWNjZXNzLCByZXN1bHRUZXh0LCByZXNvbHZlUGF0aCk7XG5cdFx0XHRcdGNhc2UgJ2VkaXQnOlxuXHRcdFx0XHRjYXNlICdzdHJfcmVwbGFjZSc6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIGdldFBhc3RUZW5zZU1lc3NhZ2UoQ29waWxvdFRvb2xOYW1lLkVkaXQsIGRpc3BsYXlOYW1lLCBwYXJhbWV0ZXJzLCBzdWNjZXNzLCByZXN1bHRUZXh0LCByZXNvbHZlUGF0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLkdyZXA6IHtcblx0XHRcdGNvbnN0IGFyZ3MgPSBwYXJhbWV0ZXJzIGFzIElDb3BpbG90R3JlcFRvb2xBcmdzIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGFyZ3M/LnBhdHRlcm4pIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCd0b29sQ29tcGxldGUuZ3JlcFBhdHRlcm4nLCBcIlNlYXJjaGVkIGZvciB7MH1cIiwgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSh0cnVuY2F0ZShhcmdzLnBhdHRlcm4sIDgwKSkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgndG9vbENvbXBsZXRlLmdyZXAnLCBcIlNlYXJjaGVkIGZpbGVzXCIpO1xuXHRcdH1cblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5SZzoge1xuXHRcdFx0Y29uc3QgYXJncyA9IHBhcmFtZXRlcnMgYXMgSUNvcGlsb3RSZ1Rvb2xBcmdzIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGFyZ3M/LnBhdHRlcm4pIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCd0b29sQ29tcGxldGUuZ3JlcFBhdHRlcm4nLCBcIlNlYXJjaGVkIGZvciB7MH1cIiwgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSh0cnVuY2F0ZShhcmdzLnBhdHRlcm4sIDgwKSkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgndG9vbENvbXBsZXRlLmdyZXAnLCBcIlNlYXJjaGVkIGZpbGVzXCIpO1xuXHRcdH1cblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5HbG9iOiB7XG5cdFx0XHRjb25zdCBhcmdzID0gcGFyYW1ldGVycyBhcyBJQ29waWxvdEdsb2JUb29sQXJncyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChhcmdzPy5wYXR0ZXJuKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgndG9vbENvbXBsZXRlLmdsb2JQYXR0ZXJuJywgXCJGb3VuZCBmaWxlcyBtYXRjaGluZyB7MH1cIiwgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSh0cnVuY2F0ZShhcmdzLnBhdHRlcm4sIDgwKSkpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgndG9vbENvbXBsZXRlLmdsb2InLCBcIkZvdW5kIGZpbGVzXCIpO1xuXHRcdH1cblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5BcHBseVBhdGNoOlxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLkdpdEFwcGx5UGF0Y2g6IHtcblx0XHRcdGNvbnN0IGZpbGVzID0gZ2V0RWRpdEZpbGVQYXRocyhwYXJhbWV0ZXJzKS5tYXAocmVzb2x2ZVBhdGgpO1xuXHRcdFx0aWYgKGZpbGVzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gbWQobG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS5wYXRjaEZpbGUnLCBcIkVkaXRlZCB7MH1cIiwgZm9ybWF0UGF0aEFzTWFya2Rvd25MaW5rKGZpbGVzWzBdKSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZpbGVzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCd0b29sQ29tcGxldGUucGF0Y2hGaWxlcycsIFwiRWRpdGVkIHswfVwiLCBmaWxlcy5tYXAoZm9ybWF0UGF0aEFzTWFya2Rvd25MaW5rKS5qb2luKCcsICcpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS5wYXRjaCcsIFwiRWRpdGVkIGZpbGVzXCIpO1xuXHRcdH1cblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5TcWw6IHtcblx0XHRcdGNvbnN0IGFyZ3MgPSBwYXJhbWV0ZXJzIGFzIElDb3BpbG90U3FsVG9vbEFyZ3MgfCB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gYXJncz8uZGVzY3JpcHRpb24gfHwgbG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS5zcWwnLCBcIkV4ZWN1dGVkIFNRTCBxdWVyeVwiKTtcblx0XHR9XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuV2ViRmV0Y2g6IHtcblx0XHRcdGNvbnN0IGFyZ3MgPSBwYXJhbWV0ZXJzIGFzIElDb3BpbG90V2ViRmV0Y2hUb29sQXJncyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChhcmdzPy51cmwpIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCd0b29sQ29tcGxldGUud2ViRmV0Y2gnLCBcIkZldGNoZWQgezB9XCIsIGZvcm1hdFVybEFzTWFya2Rvd25MaW5rKGFyZ3MudXJsKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0b29sQ29tcGxldGUud2ViRmV0Y2hHZW5lcmljJywgXCJGZXRjaGVkIFVSTFwiKTtcblx0XHR9XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuRXhpdFBsYW5Nb2RlOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0b29sQ29tcGxldGUuZXhpdFBsYW5Nb2RlJywgXCJFeGl0ZWQgcGxhbiBtb2RlXCIpO1xuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLlRhc2s6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS50YXNrJywgXCJEZWxlZ2F0ZWQgdGFza1wiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5MaXN0QWdlbnRzOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0b29sQ29tcGxldGUubGlzdEFnZW50cycsIFwiTGlzdGVkIGFnZW50c1wiKTtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5SZWFkQWdlbnQ6IHtcblx0XHRcdGNvbnN0IGFnZW50SWQgPSBnZXRBZ2VudElkKHBhcmFtZXRlcnMpO1xuXHRcdFx0aWYgKGFnZW50SWQpIHtcblx0XHRcdFx0cmV0dXJuIG1kKGxvY2FsaXplKCd0b29sQ29tcGxldGUucmVhZEFnZW50JywgXCJSZWFkIGFnZW50IHswfVwiLCBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKGFnZW50SWQpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS5yZWFkQWdlbnRHZW5lcmljJywgXCJSZWFkIGFnZW50XCIpO1xuXHRcdH1cblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5Xcml0ZUFnZW50OiB7XG5cdFx0XHRjb25zdCBhZ2VudElkID0gZ2V0QWdlbnRJZChwYXJhbWV0ZXJzKTtcblx0XHRcdGlmIChhZ2VudElkKSB7XG5cdFx0XHRcdHJldHVybiBtZChsb2NhbGl6ZSgndG9vbENvbXBsZXRlLndyaXRlQWdlbnQnLCBcIldyb3RlIHRvIGFnZW50IHswfVwiLCBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKGFnZW50SWQpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS53cml0ZUFnZW50R2VuZXJpYycsIFwiV3JvdGUgdG8gYWdlbnRcIik7XG5cdFx0fVxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gZGlzcGxheU5hbWU7XG5cdH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFNraWxsIGV2ZW50IHN5bnRoZXNpc1xuLy9cbi8vIFRoZSBDb3BpbG90IFNESyBlbWl0cyBhIGBza2lsbGAgdG9vbCBjYWxsICh3aGljaCB3ZSBoaWRlKSBhbmQsIHNlcGFyYXRlbHksIGFcbi8vIGBza2lsbC5pbnZva2VkYCBsaWZlY3ljbGUgZXZlbnQgd2l0aCB0aGUgcmVzb2x2ZWQgc2tpbGwgZmlsZSBwYXRoLiBXZSB0dXJuXG4vLyB0aGUgbGF0dGVyIGludG8gYSBzeW50aGVzaXplZCB0b29sLXN0YXJ0L2NvbXBsZXRlIHBhaXIgc28gY2xpZW50cyBjYW4gcmVuZGVyXG4vLyBhIGNsaWNrYWJsZSBmaWxlIGxpbmsgdG8gdGhlIFNLSUxMLm1kIHRoZSBhZ2VudCBsb2FkZWQgLS0gbWF0Y2hpbmcgdGhlXG4vLyBleGlzdGluZyBgdmlld2AtdG9vbCBkaXNwbGF5IHN0eWxlLiBMaXZlIGFuZCByZXBsYXkgcGF0aHMgc2hhcmUgdGhpcyBoZWxwZXJcbi8vIHNvIHRoZXkgc3RheSBpbiBsb2NrLXN0ZXAgKHNlZSBhbHNvIHRoZSBtaXJyb3JlZC1wYWlyIGdvdGNoYSBmb3IgdG9vbC1jYWxsXG4vLyBkaXNwbGF5IGluIHRoaXMgZmlsZSkuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKiogU3Vic2V0IG9mIHRoZSBTREsncyBgc2tpbGwuaW52b2tlZGAgcGF5bG9hZCB0aGF0IHRoZSBzeW50aCBoZWxwZXIgbmVlZHMuICovXG5leHBvcnQgaW50ZXJmYWNlIElDb3BpbG90U2tpbGxJbnZva2VkRGF0YSB7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgcGF0aD86IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQnVpbGRzIGEgc3RhYmxlIHN5bnRoZXRpYyB0b29sIGNhbGwgaWQgZm9yIGEgYHNraWxsLmludm9rZWRgIGV2ZW50IHNvXG4gKiByZWNvbm5lY3QvcmVwbGF5IHByb2R1Y2VzIHRoZSBzYW1lIGlkIGFzIHRoZSBvcmlnaW5hbCBsaXZlIGVtaXQuIFRoZSBpZFxuICogaXMgdXNlZCB1bmVuY29kZWQgYXMgYSBwYXRoIHNlZ21lbnQgKGUuZy4gYnkgYENoYXRSZXNwb25zZVJlc291cmNlLmNyZWF0ZVVyaWApLFxuICogc28gaXQgbXVzdCBub3QgY29udGFpbiBjaGFyYWN0ZXJzIGxpa2UgYC9gIC0tIHdlIGhhc2ggYW55IGZhbGxiYWNrIHZhbHVlc1xuICogdGhhdCBjb3VsZCBjYXJyeSBmaWxlc3lzdGVtIHBhdGhzIG9yIGFyYml0cmFyeSB0ZXh0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2tpbGxTeW50aGV0aWNUb29sQ2FsbElkKGV2ZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGF0YTogSUNvcGlsb3RTa2lsbEludm9rZWREYXRhKTogc3RyaW5nIHtcblx0aWYgKGV2ZW50SWQpIHtcblx0XHRyZXR1cm4gYHN5bnRoLXNraWxsLSR7ZXZlbnRJZH1gO1xuXHR9XG5cdGNvbnN0IHNlZWQgPSBkYXRhLnBhdGggPz8gZGF0YS5uYW1lO1xuXHRyZXR1cm4gYHN5bnRoLXNraWxsLSR7aGFzaChzZWVkKS50b1N0cmluZygxNil9YDtcbn1cblxuLyoqXG4gKiBTeW50aGVzaXplZCBkYXRhIGZvciBhIGBza2lsbC5pbnZva2VkYCB0b29sIGNhbGwuIFVzZWQgYnkgYm90aCB0aGUgbGl2ZVxuICogc2Vzc2lvbiBoYW5kbGVyIGFuZCB0aGUgaGlzdG9yeS1yZXBsYXkgbWFwcGVyIHNvIHRoZSB0d28gcGF0aHMgcmVuZGVyXG4gKiBpZGVudGljYWxseS4gQ2FsbGVycyB3cmFwIHRoaXMgaW50byBwcm90b2NvbCBhY3Rpb25zIG9yIHtAbGluayBUdXJufVxuICogZGF0YTsgdGhpcyBoZWxwZXIgYXZvaWRzIGFueSBhZ2VudC1wcm90b2NvbCBjb3VwbGluZy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU3ludGhlc2l6ZWRTa2lsbFRvb2xDYWxsIHtcblx0cmVhZG9ubHkgdG9vbENhbGxJZDogc3RyaW5nO1xuXHRyZWFkb25seSB0b29sTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBpbnZvY2F0aW9uTWVzc2FnZTogU3RyaW5nT3JNYXJrZG93bjtcblx0cmVhZG9ubHkgcGFzdFRlbnNlTWVzc2FnZTogU3RyaW5nT3JNYXJrZG93bjtcbn1cblxuLyoqXG4gKiBTeW50aGVzaXplcyB0aGUgZGF0YSBmb3IgYSBgc2tpbGwuaW52b2tlZGAgdG9vbCBjYWxsIChhIHRvb2wtc3RhcnQgL1xuICogdG9vbC1jb21wbGV0ZSBwYWlyKS4gUmV0dXJucyB0aGUgY29uc3RpdHVlbnQgZmllbGRzIHdpdGhvdXQgY291cGxpbmcgdG9cbiAqIGFueSBzcGVjaWZpYyBldmVudCBvciBhY3Rpb24gc2hhcGUgXHUyMDE0IGNhbGxlcnMgY29tcG9zZSB0aGVtIGludG8gcHJvdG9jb2xcbiAqIGFjdGlvbnMgb3Ige0BsaW5rIFR1cm59IGVudHJpZXMgYXMgbmVlZGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3ludGhlc2l6ZVNraWxsVG9vbENhbGwoXG5cdGRhdGE6IElDb3BpbG90U2tpbGxJbnZva2VkRGF0YSxcblx0ZXZlbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuKTogSVN5bnRoZXNpemVkU2tpbGxUb29sQ2FsbCB7XG5cdGNvbnN0IHRvb2xDYWxsSWQgPSBnZXRTa2lsbFN5bnRoZXRpY1Rvb2xDYWxsSWQoZXZlbnRJZCwgZGF0YSk7XG5cdGNvbnN0IGRpc3BsYXlOYW1lID0gbG9jYWxpemUoJ3Rvb2xOYW1lLnNraWxsJywgXCJSZWFkIFNraWxsXCIpO1xuXHQvLyBVc2UgdGhlIHNraWxsIG5hbWUgYXMgdGhlIGxpbmsgdGV4dCByYXRoZXIgdGhhbiB0aGUgYmFzZW5hbWU6IGV2ZXJ5IHNraWxsXG5cdC8vIGZpbGUgaXMgbmFtZWQgU0tJTEwubWQsIHNvIGBSZWFkaW5nIHNraWxsIFtwbGFuXWAgcmVhZHMgYmV0dGVyIHRoYW4gdGhlXG5cdC8vIGFsd2F5cy1pZGVudGljYWwgYFJlYWRpbmcgc2tpbGwgW1NLSUxMLm1kXWAuIFRoZSBjbGllbnQgbWF5IGZ1cnRoZXIgdXBncmFkZVxuXHQvLyB0aGlzIGxpbmsgdG8gYSByaWNoIHBpbGwgYmFzZWQgb24gdGhlIGBTS0lMTC5tZGAgYmFzZW5hbWUuIFNraWxsIG5hbWVzIGFuZFxuXHQvLyBwYXRocyBjb21lIGZyb20gdGhlIFNESyAvIGFnZW50IGhvc3QgYW5kIGFyZSBlc2NhcGVkIHRvIHByZXZlbnQgbWFya2Rvd25cblx0Ly8gaW5qZWN0aW9uIGZyb20gYSBtYWxpY2lvdXMgc2tpbGwgYXV0aG9yLlxuXHQvLyBFc2NhcGUgb25seSB0aGUgY2hhcmFjdGVycyB0aGF0IHdvdWxkIGJyZWFrIG91dCBvZiBtYXJrZG93biBsaW5rIHRleHRcblx0Ly8gc3ludGF4IChgXFxgIGFuZCBgXWApOyBhIGZ1bGwgbWFya2Rvd24gZXNjYXBlIHdvdWxkIGxlYXZlIHZpc2libGVcblx0Ly8gYmFja3NsYXNoZXMgaW4gcmVuZGVyZXJzIChsaWtlIHRoZSBza2lsbCBwaWxsKSB0aGF0IGV4dHJhY3QgbGluayB0ZXh0XG5cdC8vIHdpdGhvdXQgcmUtcGFyc2luZyBtYXJrZG93bi5cblx0Y29uc3QgZXNjYXBlZE5hbWUgPSBlc2NhcGVNYXJrZG93bkxpbmtMYWJlbChkYXRhLm5hbWUpO1xuXHRjb25zdCBza2lsbExpbmsgPSBkYXRhLnBhdGggPyBgWyR7ZXNjYXBlZE5hbWV9XSgke1VSSS5maWxlKGRhdGEucGF0aCl9KWAgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGludm9jYXRpb25NZXNzYWdlOiBTdHJpbmdPck1hcmtkb3duID0gc2tpbGxMaW5rXG5cdFx0PyBtZChsb2NhbGl6ZSgndG9vbEludm9rZS5za2lsbCcsIFwiUmVhZGluZyBza2lsbCB7MH1cIiwgc2tpbGxMaW5rKSlcblx0XHQ6IGxvY2FsaXplKCd0b29sSW52b2tlLnNraWxsTmFtZScsIFwiUmVhZGluZyBza2lsbCB7MH1cIiwgZGF0YS5uYW1lKTtcblx0Y29uc3QgcGFzdFRlbnNlTWVzc2FnZTogU3RyaW5nT3JNYXJrZG93biA9IHNraWxsTGlua1xuXHRcdD8gbWQobG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS5za2lsbCcsIFwiUmVhZCBza2lsbCB7MH1cIiwgc2tpbGxMaW5rKSlcblx0XHQ6IGxvY2FsaXplKCd0b29sQ29tcGxldGUuc2tpbGxOYW1lJywgXCJSZWFkIHNraWxsIHswfVwiLCBkYXRhLm5hbWUpO1xuXHRyZXR1cm4ge1xuXHRcdHRvb2xDYWxsSWQsXG5cdFx0dG9vbE5hbWU6IENvcGlsb3RUb29sTmFtZS5Ta2lsbCxcblx0XHRkaXNwbGF5TmFtZSxcblx0XHRpbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRwYXN0VGVuc2VNZXNzYWdlLFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VG9vbElucHV0U3RyaW5nKHRvb2xOYW1lOiBzdHJpbmcsIHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkLCByYXdBcmd1bWVudHM6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghcGFyYW1ldGVycyAmJiAhcmF3QXJndW1lbnRzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlmIChTSEVMTF9UT09MX05BTUVTLmhhcyh0b29sTmFtZSkgfHwgV1JJVEVfU0hFTExfVE9PTF9OQU1FUy5oYXModG9vbE5hbWUpKSB7XG5cdFx0Y29uc3QgYXJncyA9IHBhcmFtZXRlcnMgYXMgSUNvcGlsb3RTaGVsbFRvb2xBcmdzIHwgdW5kZWZpbmVkO1xuXHRcdC8vIEN1c3RvbSB0b29sIG92ZXJyaWRlcyBtYXkgd3JhcCB0aGUgYXJnczogeyBraW5kOiAnY3VzdG9tLXRvb2wnLCBhcmdzOiB7IGNvbW1hbmQ6ICcuLi4nIH0gfVxuXHRcdGNvbnN0IGNvbW1hbmQgPSBhcmdzPy5jb21tYW5kID8/IChhcmdzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKT8uYXJncztcblx0XHRpZiAodHlwZW9mIGNvbW1hbmQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZDtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBjb21tYW5kID09PSAnb2JqZWN0JyAmJiBjb21tYW5kICE9PSBudWxsICYmIGhhc0tleShjb21tYW5kLCB7IGNvbW1hbmQ6IHRydWUgfSkpIHtcblx0XHRcdHJldHVybiAoY29tbWFuZCBhcyBJQ29waWxvdFNoZWxsVG9vbEFyZ3MpLmNvbW1hbmQ7XG5cdFx0fVxuXHRcdHJldHVybiByYXdBcmd1bWVudHM7XG5cdH1cblxuXHRzd2l0Y2ggKHRvb2xOYW1lKSB7XG5cdFx0Y2FzZSBDb3BpbG90VG9vbE5hbWUuR3JlcDoge1xuXHRcdFx0Y29uc3QgYXJncyA9IHBhcmFtZXRlcnMgYXMgSUNvcGlsb3RHcmVwVG9vbEFyZ3MgfCB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gYXJncz8ucGF0dGVybiA/PyByYXdBcmd1bWVudHM7XG5cdFx0fVxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLlJnOiB7XG5cdFx0XHRjb25zdCBhcmdzID0gcGFyYW1ldGVycyBhcyBJQ29waWxvdFJnVG9vbEFyZ3MgfCB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gYXJncz8ucGF0dGVybiA/PyByYXdBcmd1bWVudHM7XG5cdFx0fVxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLldlYkZldGNoOiB7XG5cdFx0XHRjb25zdCBhcmdzID0gcGFyYW1ldGVycyBhcyBJQ29waWxvdFdlYkZldGNoVG9vbEFyZ3MgfCB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gYXJncz8udXJsID8/IHJhd0FyZ3VtZW50cztcblx0XHR9XG5cdFx0ZGVmYXVsdDpcblx0XHRcdC8vIEZvciBvdGhlciB0b29scywgc2hvdyB0aGUgZm9ybWF0dGVkIEpTT04gYXJndW1lbnRzXG5cdFx0XHRpZiAocGFyYW1ldGVycykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShwYXJhbWV0ZXJzLCBudWxsLCAyKTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0cmV0dXJuIHJhd0FyZ3VtZW50cztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJhd0FyZ3VtZW50cztcblx0fVxufVxuXG4vKipcbiAqIFJldHVybnMgYSByZW5kZXJpbmcgaGludCBmb3IgdGhlIGdpdmVuIHRvb2wuIEN1cnJlbnRseSAndGVybWluYWwnLCAnc3ViYWdlbnQnLFxuICogYW5kICdzZWFyY2gnIGFyZSBzdXBwb3J0ZWQsIHdoaWNoIHRlbGwgdGhlIHJlbmRlcmVyIHRvIGRpc3BsYXkgdGhlIHRvb2wgd2l0aFxuICogYSB0ZXJtaW5hbCBjb21tYW5kIGJsb2NrLCBhIHN1YmFnZW50IHdpZGdldCwgb3IgYSBzZWFyY2ggaWNvbiByZXNwZWN0aXZlbHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRUb29sS2luZCh0b29sTmFtZTogc3RyaW5nKTogJ3Rlcm1pbmFsJyB8ICdzdWJhZ2VudCcgfCAnc2VhcmNoJyB8IHVuZGVmaW5lZCB7XG5cdGlmIChTSEVMTF9UT09MX05BTUVTLmhhcyh0b29sTmFtZSkpIHtcblx0XHRyZXR1cm4gJ3Rlcm1pbmFsJztcblx0fVxuXHRpZiAoU1VCQUdFTlRfVE9PTF9OQU1FUy5oYXModG9vbE5hbWUpKSB7XG5cdFx0cmV0dXJuICdzdWJhZ2VudCc7XG5cdH1cblx0aWYgKFNFQVJDSF9UT09MX05BTUVTLmhhcyh0b29sTmFtZSkpIHtcblx0XHRyZXR1cm4gJ3NlYXJjaCc7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBFeHRyYWN0cyBzdWJhZ2VudCBtZXRhZGF0YSAoYWdlbnQgbmFtZSwgZGVzY3JpcHRpb24pIGZyb20gdGhlIHBhcnNlZFxuICogYXJndW1lbnRzIG9mIGEgQ29waWxvdCBTREsgc3ViYWdlbnQgdG9vbCBjYWxsLiBUaGUgQ29waWxvdCBgdGFza2AgdG9vbFxuICogdXNlcyBgYWdlbnRfdHlwZWAgKHNuYWtlX2Nhc2UpLCB3aGljaCB0aGlzIG5vcm1hbGl6ZXMgaW50byB0aGUgZ2VuZXJpY1xuICogYHN1YmFnZW50QWdlbnROYW1lYCAvIGBzdWJhZ2VudERlc2NyaXB0aW9uYCBzaGFwZSB1c2VkIGJ5IHRoZSByZXN0IG9mIHRoZVxuICogYWdlbnQgaG9zdCBjb2RlLlxuICpcbiAqIE9ubHkgY2FsbCB0aGlzIGZvciB0b29scyB3aGVyZSB7QGxpbmsgZ2V0VG9vbEtpbmR9IHJldHVybmVkIGAnc3ViYWdlbnQnYC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFN1YmFnZW50TWV0YWRhdGEocGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiB7IGFnZW50TmFtZT86IHN0cmluZzsgZGVzY3JpcHRpb24/OiBzdHJpbmcgfSB7XG5cdGlmICghcGFyYW1ldGVycykge1xuXHRcdHJldHVybiB7fTtcblx0fVxuXHRjb25zdCBhZ2VudE5hbWUgPSB0eXBlb2YgcGFyYW1ldGVycy5hZ2VudF90eXBlID09PSAnc3RyaW5nJyAmJiBwYXJhbWV0ZXJzLmFnZW50X3R5cGUubGVuZ3RoID4gMFxuXHRcdD8gcGFyYW1ldGVycy5hZ2VudF90eXBlXG5cdFx0OiB1bmRlZmluZWQ7XG5cdGNvbnN0IGRlc2NyaXB0aW9uID0gdHlwZW9mIHBhcmFtZXRlcnMuZGVzY3JpcHRpb24gPT09ICdzdHJpbmcnICYmIHBhcmFtZXRlcnMuZGVzY3JpcHRpb24ubGVuZ3RoID4gMFxuXHRcdD8gcGFyYW1ldGVycy5kZXNjcmlwdGlvblxuXHRcdDogdW5kZWZpbmVkO1xuXHRyZXR1cm4geyBhZ2VudE5hbWUsIGRlc2NyaXB0aW9uIH07XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgc2hlbGwgbGFuZ3VhZ2UgaWRlbnRpZmllciBmb3Igc3ludGF4IGhpZ2hsaWdodGluZy5cbiAqIFVzZWQgd2hlbiBjcmVhdGluZyB0ZXJtaW5hbCB0b29sLXNwZWNpZmljIGRhdGEgZm9yIHRoZSByZW5kZXJlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFNoZWxsTGFuZ3VhZ2UodG9vbE5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHN3aXRjaCAodG9vbE5hbWUpIHtcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5Qb3dlclNoZWxsOlxuXHRcdGNhc2UgQ29waWxvdFRvb2xOYW1lLldyaXRlUG93ZXJTaGVsbDpcblx0XHRjYXNlIENvcGlsb3RUb29sTmFtZS5SZWFkUG93ZXJTaGVsbDogcmV0dXJuICdwb3dlcnNoZWxsJztcblx0XHRkZWZhdWx0OiByZXR1cm4gJ3NoZWxsc2NyaXB0Jztcblx0fVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUGVybWlzc2lvbiBkaXNwbGF5XG4vL1xuLy8gRGVyaXZlcyBkaXNwbGF5IGZpZWxkcyBmcm9tIFNESyBwZXJtaXNzaW9uIHJlcXVlc3RzIGZvciB0aGUgdG9vbFxuLy8gY29uZmlybWF0aW9uIFVJLiBDb2xvY2F0ZWQgd2l0aCB0aGUgdG9vbC1zdGFydCBkaXNwbGF5IGhlbHBlcnMgYWJvdmUgc29cbi8vIHRoYXQgZm9ybWF0dGluZyB1dGlsaXRpZXMgKGZvcm1hdFBhdGhBc01hcmtkb3duTGluaywgbWQsIGV0Yy4pIGFyZSBzaGFyZWQuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5leHBvcnQgZnVuY3Rpb24gdHJ5U3RyaW5naWZ5KHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogTG9vc2UsIG9wdGlvbmFsLWZpZWxkIHByb2plY3Rpb24gb2YgdGhlIFNESydzIHtAbGluayBQZXJtaXNzaW9uUmVxdWVzdH1cbiAqIGRpc2NyaW1pbmF0ZWQgdW5pb24uIExldHMgdGhlIHJlc3Qgb2YgdGhlIGFnZW50IGhvc3QgcmVhZCB0aGUgd2VsbC1rbm93blxuICogZmllbGRzIHdpdGhvdXQgYHN3aXRjaCAocmVxdWVzdC5raW5kKWAgbmFycm93aW5nIGF0IGV2ZXJ5IGFjY2VzcyBzaXRlLlxuICpcbiAqIFRoZSBTREsncyBgUGVybWlzc2lvblJlcXVlc3RgIChhIHVuaW9uIHdpdGggcmVxdWlyZWQgcGVyLXZhcmlhbnQgZmllbGRzKSBpc1xuICogc3RydWN0dXJhbGx5IGFzc2lnbmFibGUgdG8gdGhpcyBpbnRlcmZhY2UgXHUyMDE0IGV2ZXJ5IHZhcmlhbnQgY2FycmllcyBga2luZGBcbiAqIGFuZCBgdG9vbENhbGxJZD9gLCBhbmQgdGhlIHZhcmlhbnQtc3BlY2lmaWMgZmllbGRzIGFyZSBsaXN0ZWQgaGVyZSBhc1xuICogb3B0aW9uYWwuIFVzZSB0aGlzIHR5cGUgYXQgdGhlIGFnZW50LWhvc3QgYm91bmRhcnkgc28gY2FsbCBzaXRlcyBhbmQgdGVzdHNcbiAqIGNhbiByZWx5IG9uIGEgc2luZ2xlIHNoYXBlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElUeXBlZFBlcm1pc3Npb25SZXF1ZXN0IHtcblx0LyoqIFBlcm1pc3Npb24ga2luZCBkaXNjcmltaW5hdG9yIGZyb20gdGhlIFNESy4gKi9cblx0a2luZDogUGVybWlzc2lvblJlcXVlc3RbJ2tpbmQnXTtcblx0LyoqIFdoZXRoZXIgbWFuYWdlZCBwb2xpY3kgcmVxdWlyZXMgYSBodW1hbiByZXNwb25zZSBhbmQgZm9yYmlkcyBob3N0IGF1dG8tYXBwcm92YWwuICovXG5cdG1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkPzogYm9vbGVhbjtcblx0LyoqIFRvb2wgY2FsbCBJRCB0aGF0IHRyaWdnZXJlZCB0aGlzIHBlcm1pc3Npb24gcmVxdWVzdCwgd2hlbiBhdmFpbGFibGUuICovXG5cdHRvb2xDYWxsSWQ/OiBzdHJpbmc7XG5cdC8qKiBGaWxlIHBhdGggXHUyMDE0IHNldCBmb3IgYHJlYWRgIHBlcm1pc3Npb24gcmVxdWVzdHMuICovXG5cdHBhdGg/OiBzdHJpbmc7XG5cdC8qKiBGaWxlIHBhdGggXHUyMDE0IHNldCBmb3IgYHdyaXRlYCBwZXJtaXNzaW9uIHJlcXVlc3RzLiAqL1xuXHRmaWxlTmFtZT86IHN0cmluZztcblx0LyoqIEZ1bGwgc2hlbGwgY29tbWFuZCB0ZXh0IFx1MjAxNCBzZXQgZm9yIGBzaGVsbGAgcGVybWlzc2lvbiByZXF1ZXN0cy4gKi9cblx0ZnVsbENvbW1hbmRUZXh0Pzogc3RyaW5nO1xuXHQvKipcblx0ICogVHJ1ZSB3aGVuIHRoZSBtb2RlbCByZXF1ZXN0ZWQgdGhpcyBgc2hlbGxgIGNvbW1hbmQgcnVuIG91dHNpZGUgdGhlXG5cdCAqIHNhbmRib3ggKHZpYSBgcmVxdWVzdFNhbmRib3hCeXBhc3NgKSBhbmQgdGhlIGhvc3Qgb3B0ZWQgaW4gdmlhXG5cdCAqIGBzYW5kYm94LmFsbG93QnlwYXNzYC5cblx0ICovXG5cdHJlcXVlc3RTYW5kYm94QnlwYXNzPzogYm9vbGVhbjtcblx0LyoqIEh1bWFuLXJlYWRhYmxlIGludGVudGlvbiBkZXNjcmliaW5nIHRoZSBvcGVyYXRpb24uICovXG5cdGludGVudGlvbj86IHN0cmluZztcblx0LyoqIE1DUCBzZXJ2ZXIgbmFtZSBcdTIwMTQgc2V0IGZvciBgbWNwYCBwZXJtaXNzaW9uIHJlcXVlc3RzLiAqL1xuXHRzZXJ2ZXJOYW1lPzogc3RyaW5nO1xuXHQvKiogVG9vbCBuYW1lIFx1MjAxNCBzZXQgZm9yIGBtY3BgIGFuZCBgY3VzdG9tLXRvb2xgIHBlcm1pc3Npb24gcmVxdWVzdHMuICovXG5cdHRvb2xOYW1lPzogc3RyaW5nO1xuXHQvKiogVG9vbCBhcmd1bWVudHMgXHUyMDE0IHNldCBmb3IgYGN1c3RvbS10b29sYCBwZXJtaXNzaW9uIHJlcXVlc3RzLiAqL1xuXHRhcmdzPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdC8qKiBVUkwgXHUyMDE0IHNldCBmb3IgYHVybGAgcGVybWlzc2lvbiByZXF1ZXN0cy4gKi9cblx0dXJsPzogc3RyaW5nO1xuXHQvKiogVW5pZmllZCBkaWZmIG9mIHRoZSBwcm9wb3NlZCBjaGFuZ2UgXHUyMDE0IHNldCBmb3IgYHdyaXRlYCBwZXJtaXNzaW9uIHJlcXVlc3RzLiAqL1xuXHRkaWZmPzogc3RyaW5nO1xuXHQvKiogTmV3IGZpbGUgY29udGVudHMgdGhhdCB3aWxsIGJlIHdyaXR0ZW4gXHUyMDE0IHNldCBmb3IgYHdyaXRlYCBwZXJtaXNzaW9uIHJlcXVlc3RzLiAqL1xuXHRuZXdGaWxlQ29udGVudHM/OiBzdHJpbmc7XG59XG5cbi8qKiBTYWZlbHkgZXh0cmFjdCBhIHN0cmluZyB2YWx1ZSBmcm9tIGFuIFNESyBmaWVsZCB0aGF0IG1heSBiZSBgdW5rbm93bmAgYXQgcnVudGltZS4gKi9cbmZ1bmN0aW9uIHN0cih2YWx1ZTogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUgOiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogRGVyaXZlcyBkaXNwbGF5IGZpZWxkcyBmcm9tIGEgcGVybWlzc2lvbiByZXF1ZXN0IGZvciB0aGUgdG9vbCBjb25maXJtYXRpb24gVUkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRQZXJtaXNzaW9uRGlzcGxheShyZXF1ZXN0OiBJVHlwZWRQZXJtaXNzaW9uUmVxdWVzdCwgd29ya2luZ0RpcmVjdG9yeT86IFVSSSwgaXNOZXdGaWxlPzogYm9vbGVhbik6IHtcblx0Y29uZmlybWF0aW9uVGl0bGU6IHN0cmluZztcblx0aW52b2NhdGlvbk1lc3NhZ2U6IFN0cmluZ09yTWFya2Rvd247XG5cdHRvb2xJbnB1dD86IHN0cmluZztcblx0LyoqIE5vcm1hbGl6ZWQgcGVybWlzc2lvbiBraW5kIGZvciBhdXRvLWFwcHJvdmFsIHJvdXRpbmcuICovXG5cdHBlcm1pc3Npb25LaW5kOiBJQWdlbnRUb29sUGVuZGluZ0NvbmZpcm1hdGlvblNpZ25hbFsncGVybWlzc2lvbktpbmQnXTtcblx0LyoqIEZpbGUgcGF0aCBleHRyYWN0ZWQgZnJvbSB0aGUgcmVxdWVzdC4gKi9cblx0cGVybWlzc2lvblBhdGg/OiBzdHJpbmc7XG59IHtcblx0Y29uc3QgcGF0aCA9IHN0cihyZXF1ZXN0LnBhdGgpID8/IHN0cihyZXF1ZXN0LmZpbGVOYW1lKTtcblx0Y29uc3QgZnVsbENvbW1hbmRUZXh0ID0gc3RyKHJlcXVlc3QuZnVsbENvbW1hbmRUZXh0KTtcblx0Y29uc3QgaW50ZW50aW9uID0gc3RyKHJlcXVlc3QuaW50ZW50aW9uKTtcblx0Y29uc3Qgc2VydmVyTmFtZSA9IHN0cihyZXF1ZXN0LnNlcnZlck5hbWUpO1xuXHRjb25zdCB0b29sTmFtZSA9IHN0cihyZXF1ZXN0LnRvb2xOYW1lKTtcblxuXHRjb25zdCBzaGVsbENvbmZpcm1hdGlvblRpdGxlID0gcmVxdWVzdC5yZXF1ZXN0U2FuZGJveEJ5cGFzc1xuXHRcdD8gbG9jYWxpemUoJ2NvcGlsb3QucGVybWlzc2lvbi5zaGVsbC5ieXBhc3MudGl0bGUnLCBcIlJ1biBpbiB0ZXJtaW5hbCBvdXRzaWRlIHRoZSBzYW5kYm94P1wiKVxuXHRcdDogbG9jYWxpemUoJ2NvcGlsb3QucGVybWlzc2lvbi5zaGVsbC50aXRsZScsIFwiUnVuIGluIHRlcm1pbmFsP1wiKTtcblxuXHRzd2l0Y2ggKHJlcXVlc3Qua2luZCkge1xuXHRcdGNhc2UgJ3NoZWxsJzoge1xuXHRcdFx0Ly8gU3RyaXAgYSByZWR1bmRhbnQgYGNkIDx3b3JraW5nRGlyZWN0b3J5PiAmJiBcdTIwMjZgIHByZWZpeCBzbyB0aGVcblx0XHRcdC8vIGNvbmZpcm1hdGlvbiBkaWFsb2cgc2hvd3MgdGhlIHNpbXBsaWZpZWQgY29tbWFuZC5cblx0XHRcdGNvbnN0IHNoZWxsUGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCA9IGZ1bGxDb21tYW5kVGV4dCA/IHsgY29tbWFuZDogZnVsbENvbW1hbmRUZXh0IH0gOiB1bmRlZmluZWQ7XG5cdFx0XHRzdHJpcFJlZHVuZGFudENkUHJlZml4KENvcGlsb3RUb29sTmFtZS5CYXNoLCBzaGVsbFBhcmFtcywgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRjb25zdCBjbGVhbmVkQ29tbWFuZCA9IHR5cGVvZiBzaGVsbFBhcmFtcz8uY29tbWFuZCA9PT0gJ3N0cmluZycgPyBzaGVsbFBhcmFtcy5jb21tYW5kIDogZnVsbENvbW1hbmRUZXh0O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6IHNoZWxsQ29uZmlybWF0aW9uVGl0bGUsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBpbnRlbnRpb24gPz8gZ2V0SW52b2NhdGlvbk1lc3NhZ2UoQ29waWxvdFRvb2xOYW1lLkJhc2gsIGdldFRvb2xEaXNwbGF5TmFtZShDb3BpbG90VG9vbE5hbWUuQmFzaCksIGNsZWFuZWRDb21tYW5kID8geyBjb21tYW5kOiBjbGVhbmVkQ29tbWFuZCB9IDogdW5kZWZpbmVkKSxcblx0XHRcdFx0dG9vbElucHV0OiBjbGVhbmVkQ29tbWFuZCxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICdzaGVsbCcsXG5cdFx0XHRcdHBlcm1pc3Npb25QYXRoOiBwYXRoLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y2FzZSAnY3VzdG9tLXRvb2wnOiB7XG5cdFx0XHQvLyBDdXN0b20gdG9vbCBvdmVycmlkZXMgKGUuZy4gb3VyIHNoZWxsIHRvb2wpLiBFeHRyYWN0IHRoZSBhY3R1YWxcblx0XHRcdC8vIHRvb2wgYXJncyBmcm9tIHRoZSBTREsncyB3cmFwcGVyIGVudmVsb3BlLlxuXHRcdFx0Y29uc3QgYXJncyA9IHR5cGVvZiByZXF1ZXN0LmFyZ3MgPT09ICdvYmplY3QnICYmIHJlcXVlc3QuYXJncyAhPT0gbnVsbCA/IHJlcXVlc3QuYXJncyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHNka1Rvb2xOYW1lID0gc3RyKHJlcXVlc3QudG9vbE5hbWUpO1xuXHRcdFx0aWYgKGFyZ3MgJiYgc2RrVG9vbE5hbWUgJiYgaXNTaGVsbFRvb2woc2RrVG9vbE5hbWUpICYmIHR5cGVvZiBhcmdzLmNvbW1hbmQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHN0cmlwUmVkdW5kYW50Q2RQcmVmaXgoc2RrVG9vbE5hbWUsIGFyZ3MsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0XHRjb25zdCBjb21tYW5kID0gYXJncy5jb21tYW5kIGFzIHN0cmluZztcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogc2hlbGxDb25maXJtYXRpb25UaXRsZSxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogZ2V0SW52b2NhdGlvbk1lc3NhZ2Uoc2RrVG9vbE5hbWUsIGdldFRvb2xEaXNwbGF5TmFtZShzZGtUb29sTmFtZSksIHsgY29tbWFuZCB9KSxcblx0XHRcdFx0XHR0b29sSW5wdXQ6IGNvbW1hbmQsXG5cdFx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICdzaGVsbCcsXG5cdFx0XHRcdFx0cGVybWlzc2lvblBhdGg6IHBhdGgsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogbG9jYWxpemUoJ2NvcGlsb3QucGVybWlzc2lvbi5kZWZhdWx0LnRpdGxlJywgXCJBbGxvdyB0b29sIGNhbGw/XCIpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbWQobG9jYWxpemUoJ2NvcGlsb3QucGVybWlzc2lvbi5kZWZhdWx0Lm1lc3NhZ2UnLCBcIkFsbG93IHRoZSBtb2RlbCB0byBjYWxsIHswfT9cIiwgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSh0b29sTmFtZSA/PyByZXF1ZXN0LmtpbmQpKSksXG5cdFx0XHRcdHRvb2xJbnB1dDogYXJncyA/IHRyeVN0cmluZ2lmeShhcmdzKSA6IHRyeVN0cmluZ2lmeShyZXF1ZXN0KSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6IHJlcXVlc3Qua2luZCxcblx0XHRcdFx0cGVybWlzc2lvblBhdGg6IHBhdGgsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlICd3cml0ZSc6IHtcblx0XHRcdGNvbnN0IHRvb2xOYW1lID0gaXNOZXdGaWxlID8gQ29waWxvdFRvb2xOYW1lLkNyZWF0ZSA6IENvcGlsb3RUb29sTmFtZS5FZGl0O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6IGlzTmV3RmlsZVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NvcGlsb3QucGVybWlzc2lvbi5jcmVhdGUudGl0bGUnLCBcIkNyZWF0ZSBmaWxlP1wiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2NvcGlsb3QucGVybWlzc2lvbi53cml0ZS50aXRsZScsIFwiV3JpdGUgZmlsZT9cIiksXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBnZXRJbnZvY2F0aW9uTWVzc2FnZSh0b29sTmFtZSwgZ2V0VG9vbERpc3BsYXlOYW1lKHRvb2xOYW1lKSwgcGF0aCA/IHsgcGF0aCB9IDogdW5kZWZpbmVkKSxcblx0XHRcdFx0dG9vbElucHV0OiB0cnlTdHJpbmdpZnkocGF0aCA/IHsgcGF0aCB9IDogcmVxdWVzdCkgPz8gdW5kZWZpbmVkLFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3dyaXRlJyxcblx0XHRcdFx0cGVybWlzc2lvblBhdGg6IHBhdGgsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlICdtY3AnOiB7XG5cdFx0XHRjb25zdCB0aXRsZSA9IHRvb2xOYW1lID8/IGxvY2FsaXplKCdjb3BpbG90LnBlcm1pc3Npb24ubWNwLmRlZmF1bHRUb29sJywgXCJNQ1AgVG9vbFwiKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiBzZXJ2ZXJOYW1lXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY29waWxvdC5wZXJtaXNzaW9uLm1jcC50aXRsZScsIFwiQWxsb3cgdG9vbCBmcm9tIHswfT9cIiwgc2VydmVyTmFtZSlcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjb3BpbG90LnBlcm1pc3Npb24uZGVmYXVsdC50aXRsZScsIFwiQWxsb3cgdG9vbCBjYWxsP1wiKSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHNlcnZlck5hbWUgPyBgJHtzZXJ2ZXJOYW1lfTogJHt0aXRsZX1gIDogdGl0bGUsXG5cdFx0XHRcdHRvb2xJbnB1dDogdHJ5U3RyaW5naWZ5KHsgc2VydmVyTmFtZSwgdG9vbE5hbWUgfSkgPz8gdW5kZWZpbmVkLFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ21jcCcsXG5cdFx0XHRcdHBlcm1pc3Npb25QYXRoOiBwYXRoLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y2FzZSAncmVhZCc6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogbG9jYWxpemUoJ2NvcGlsb3QucGVybWlzc2lvbi5yZWFkLnRpdGxlJywgXCJBbGxvdyByZWFkaW5nIGZpbGUgb3V0c2lkZSBvZiB3b3Jrc3BhY2U/XCIpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogZ2V0SW52b2NhdGlvbk1lc3NhZ2UoQ29waWxvdFRvb2xOYW1lLlZpZXcsIGdldFRvb2xEaXNwbGF5TmFtZShDb3BpbG90VG9vbE5hbWUuVmlldyksIHBhdGggPyB7IHBhdGggfSA6IHVuZGVmaW5lZCksXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAncmVhZCcsXG5cdFx0XHRcdHBlcm1pc3Npb25QYXRoOiBwYXRoLFxuXHRcdFx0fTtcblx0XHRjYXNlICd1cmwnOiB7XG5cdFx0XHRjb25zdCB1cmwgPSBzdHIocmVxdWVzdC51cmwpO1xuXHRcdFx0Ly8gUGFyc2UgdGhyb3VnaCBVUkwgZm9yIHB1bnljb2RlIGVzY2FwaW5nLCBidXQgcHJlc2VydmUgdGhlIHJhdyB2YWx1ZSBpZiBwYXJzaW5nIGZhaWxzLlxuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZFVybCA9IHVybCA/IChVUkwuY2FuUGFyc2UodXJsKSA/IG5ldyBVUkwodXJsKS5ocmVmIDogdXJsKSA6IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiBsb2NhbGl6ZSgnY29waWxvdC5wZXJtaXNzaW9uLnVybC50aXRsZScsIFwiRmV0Y2ggVVJMP1wiKSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG1kKGxvY2FsaXplKCdjb3BpbG90LnBlcm1pc3Npb24udXJsLm1lc3NhZ2UnLCBcIkFsbG93IGZldGNoaW5nIHdlYiBjb250ZW50P1wiKSksXG5cdFx0XHRcdHRvb2xJbnB1dDogbm9ybWFsaXplZFVybCA/IEpTT04uc3RyaW5naWZ5KHsgdXJsOiBub3JtYWxpemVkVXJsIH0pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3VybCcsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6IGxvY2FsaXplKCdjb3BpbG90LnBlcm1pc3Npb24uZGVmYXVsdC50aXRsZScsIFwiQWxsb3cgdG9vbCBjYWxsP1wiKSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG1kKGxvY2FsaXplKCdjb3BpbG90LnBlcm1pc3Npb24uZGVmYXVsdC5tZXNzYWdlJywgXCJBbGxvdyB0aGUgbW9kZWwgdG8gY2FsbCB7MH0/XCIsIGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUodG9vbE5hbWUgPz8gcmVxdWVzdC5raW5kKSkpLFxuXHRcdFx0XHR0b29sSW5wdXQ6IHRyeVN0cmluZ2lmeShyZXF1ZXN0KSA/PyB1bmRlZmluZWQsXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiByZXF1ZXN0LmtpbmQsXG5cdFx0XHRcdHBlcm1pc3Npb25QYXRoOiBwYXRoLFxuXHRcdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsV0FBVztBQUNwQixTQUFTLGlDQUFpQyx5QkFBeUIsc0JBQXNCO0FBQ3pGLFNBQVMsWUFBWTtBQUNyQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUEyQiwyQkFBMkIsMEJBQTBCLDRCQUE0QixrQ0FBeUQ7QUFDOUssU0FBUyw0QkFBNEI7QUFxQnJDLElBQVcsa0JBQVgsa0JBQVdBLHFCQUFYO0FBQ0MsRUFBQUEsaUJBQUEsc0JBQW1CO0FBQ25CLEVBQUFBLGlCQUFBLGdCQUFhO0FBQ2IsRUFBQUEsaUJBQUEsWUFBUztBQUVULEVBQUFBLGlCQUFBLFVBQU87QUFDUCxFQUFBQSxpQkFBQSxjQUFXO0FBQ1gsRUFBQUEsaUJBQUEsZUFBWTtBQUNaLEVBQUFBLGlCQUFBLGNBQVc7QUFDWCxFQUFBQSxpQkFBQSxrQkFBZTtBQUNmLEVBQUFBLGlCQUFBLGNBQVc7QUFFWCxFQUFBQSxpQkFBQSxnQkFBYTtBQUNiLEVBQUFBLGlCQUFBLG9CQUFpQjtBQUNqQixFQUFBQSxpQkFBQSxxQkFBa0I7QUFDbEIsRUFBQUEsaUJBQUEsb0JBQWlCO0FBQ2pCLEVBQUFBLGlCQUFBLHdCQUFxQjtBQUNyQixFQUFBQSxpQkFBQSxvQkFBaUI7QUFFakIsRUFBQUEsaUJBQUEsVUFBTztBQUNQLEVBQUFBLGlCQUFBLFVBQU87QUFDUCxFQUFBQSxpQkFBQSxZQUFT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
