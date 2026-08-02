import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { getEditFilePath, getEditFilePaths, getInvocationMessage, getPastTenseMessage, getPermissionDisplay, getShellIntention, getShellLanguage, getStreamingInvocationMessage, getToolDisplayName, getToolInputString, getToolKind, getToolMarkdownContent, isEditTool, isHiddenTool, isMarkdownRenderedTool, synthesizeSkillToolCall } from "../../node/copilot/copilotToolDisplay.js";
suite("copilotToolDisplay \u2014 friendly tool names", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("mirrors internal Copilot CLI friendly labels for representative tools", () => {
    const cases = [
      ["bash", "Run Shell Command"],
      ["powershell", "Run Shell Command"],
      ["read_bash", "Read Terminal"],
      ["read_powershell", "Read Terminal"],
      ["write_bash", "Write to Bash"],
      ["write_powershell", "Write to PowerShell"],
      ["stop_bash", "Stop Terminal Session"],
      ["stop_powershell", "Stop Terminal Session"],
      ["bash_shutdown", "Stop Terminal Session"],
      ["powershell_shutdown", "Stop Terminal Session"],
      ["list_bash", "List Shell Sessions"],
      ["list_powershell", "List Shell Sessions"],
      ["view", "Read"],
      ["edit", "Edit File"],
      ["str_replace_editor", "Edit File"],
      ["str_replace", "Edit File"],
      ["insert", "Edit File"],
      ["create", "Create File"],
      ["grep", "Search"],
      ["rg", "Search"],
      ["glob", "Search"],
      ["search_code_subagent", "Search Code"],
      ["reply_to_comment", "Reply to Comment"],
      ["code_review", "Code Review"],
      ["think", "Thinking"],
      ["report_intent", "Report Intent"],
      ["report_progress", "Progress update"],
      ["web_fetch", "Fetch Web Content"],
      ["web_search", "Web Search"],
      ["update_todo", "Update Todo"],
      ["show_file", "Show File"],
      ["fetch_copilot_cli_documentation", "Fetch Documentation"],
      ["propose_work", "Propose Work"],
      ["task_complete", "Task Complete"],
      ["ask_user", "Ask User"],
      ["skill", "Invoke Skill"],
      ["task", "Delegate Task"],
      ["list_agents", "List Agents"],
      ["read_agent", "Read Agent"],
      ["exit_plan_mode", "Exit Plan Mode"],
      ["sql", "Execute SQL"],
      ["lsp", "Language Server"],
      ["create_pull_request", "Create Pull Request"],
      ["gh-advisory-database", "Check Dependencies"],
      ["store_memory", "Store Memory"],
      ["apply_patch", "Apply Patch"],
      ["write_agent", "Write to Agent"],
      ["mcp_reload", "Reload MCP Config"],
      ["mcp_validate", "Validate MCP Config"],
      ["tool_search_tool_regex", "Search Tools"],
      ["parallel_validation", "Validate Changes"],
      ["codeql_checker", "CodeQL Security Scan"],
      ["addComment", "Add Comment"],
      ["listComments", "List Comments"],
      ["deleteComments", "Delete Comments"],
      ["resolveComments", "Resolve Comments"],
      ["viewUnreviewedComments", "View Comments"]
    ];
    for (const [toolName, displayName] of cases) {
      assert.strictEqual(getToolDisplayName(toolName), displayName, toolName);
    }
  });
  test("falls back to the raw tool name for unknown tools", () => {
    assert.strictEqual(getToolDisplayName("some_new_tool"), "some_new_tool");
  });
});
suite("copilotToolDisplay \u2014 edit tool classification", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("classifies direct file edit tools", () => {
    for (const toolName of ["edit", "str_replace", "insert", "create", "apply_patch", "git_apply_patch"]) {
      assert.strictEqual(isEditTool(toolName), true, toolName);
    }
  });
  test("classifies str_replace_editor by command", () => {
    for (const command of ["edit", "str_replace", "insert", "create"]) {
      assert.strictEqual(isEditTool("str_replace_editor", command), true, command);
    }
    assert.strictEqual(isEditTool("str_replace_editor", "view"), false);
    assert.strictEqual(isEditTool("str_replace_editor", "unknown"), false);
    assert.strictEqual(isEditTool("str_replace_editor"), false);
  });
});
suite("copilotToolDisplay \u2014 markdown-rendered tools", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("task_complete renders as markdown, other tools do not", () => {
    assert.strictEqual(isMarkdownRenderedTool("task_complete"), true);
    assert.strictEqual(isMarkdownRenderedTool("bash"), false);
    assert.strictEqual(isMarkdownRenderedTool("report_intent"), false);
  });
  test("getToolMarkdownContent returns the task_complete summary when present", () => {
    assert.strictEqual(getToolMarkdownContent("task_complete", { summary: "All tests pass." }), "\n\n**Task completed:** All tests pass.");
  });
  test("getToolMarkdownContent returns undefined for empty, missing, or non-string summaries", () => {
    assert.strictEqual(getToolMarkdownContent("task_complete", { summary: "" }), void 0);
    assert.strictEqual(getToolMarkdownContent("task_complete", {}), void 0);
    assert.strictEqual(getToolMarkdownContent("task_complete", void 0), void 0);
    assert.strictEqual(getToolMarkdownContent("task_complete", { summary: 42 }), void 0);
  });
  test("getToolMarkdownContent returns undefined for non-markdown tools", () => {
    assert.strictEqual(getToolMarkdownContent("bash", { summary: "ignored" }), void 0);
  });
});
suite("getPermissionDisplay \u2014 cd-prefix stripping", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const wd = URI.file("/repo/project");
  test("strips redundant cd from shell permission request fullCommandText", () => {
    const request = {
      kind: "shell",
      fullCommandText: "cd /repo/project && npm test"
    };
    const display = getPermissionDisplay(request, wd);
    assert.strictEqual(display.toolInput, "npm test");
    assert.strictEqual(display.permissionKind, "shell");
  });
  test("leaves shell command alone when cd target differs from working directory", () => {
    const request = {
      kind: "shell",
      fullCommandText: "cd /tmp && ls"
    };
    const display = getPermissionDisplay(request, wd);
    assert.strictEqual(display.toolInput, "cd /tmp && ls");
  });
  test("leaves shell command alone when no working directory provided", () => {
    const request = {
      kind: "shell",
      fullCommandText: "cd /repo/project && npm test"
    };
    const display = getPermissionDisplay(request, void 0);
    assert.strictEqual(display.toolInput, "cd /repo/project && npm test");
  });
  test("strips redundant cd from custom-tool shell permission request", () => {
    const request = {
      kind: "custom-tool",
      toolName: "bash",
      args: { command: "cd /repo/project && echo hi" }
    };
    const display = getPermissionDisplay(request, wd);
    assert.strictEqual(display.toolInput, "echo hi");
    assert.strictEqual(display.permissionKind, "shell");
  });
  test("does not affect non-shell custom-tool requests", () => {
    const request = {
      kind: "custom-tool",
      toolName: "some_other_tool",
      args: { command: "cd /repo/project && echo hi" }
    };
    const display = getPermissionDisplay(request, wd);
    assert.ok(display.toolInput?.includes("cd /repo/project"), `expected unrewritten args, got: ${display.toolInput}`);
    assert.strictEqual(display.permissionKind, "custom-tool");
  });
  test("handles powershell custom-tool with semicolon separator", () => {
    const request = {
      kind: "custom-tool",
      toolName: "powershell",
      args: { command: "cd /repo/project; dir" }
    };
    const display = getPermissionDisplay(request, wd);
    assert.strictEqual(display.toolInput, "dir");
  });
  test("confirmation title reflects sandbox bypass for shell requests", () => {
    const sandboxed = getPermissionDisplay({
      kind: "shell",
      fullCommandText: "npm test"
    }, wd);
    const bypass = getPermissionDisplay({
      kind: "shell",
      fullCommandText: "npm test",
      requestSandboxBypass: true
    }, wd);
    assert.notStrictEqual(bypass.confirmationTitle, sandboxed.confirmationTitle);
    assert.ok(/sandbox/i.test(bypass.confirmationTitle), `expected title to mention the sandbox, got: ${bypass.confirmationTitle}`);
  });
  test("confirmation title reflects sandbox bypass for custom-tool shell requests", () => {
    const bypass = getPermissionDisplay({
      kind: "custom-tool",
      toolName: "bash",
      args: { command: "echo hi" },
      requestSandboxBypass: true
    }, wd);
    assert.strictEqual(bypass.permissionKind, "shell");
    assert.ok(/sandbox/i.test(bypass.confirmationTitle), `expected title to mention the sandbox, got: ${bypass.confirmationTitle}`);
  });
});
suite("getPermissionDisplay \u2014 read permission display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("uses the view-tool invocation message for read permissions", () => {
    const display = getPermissionDisplay({
      kind: "read",
      path: "/Users/connor/Downloads/context7-copilot-debug-main.json",
      intention: "Read file: /Users/connor/Downloads/context7-copilot-debug-main.json"
    }, URI.file("/repo/project"));
    assert.deepStrictEqual({
      invocationMessage: display.invocationMessage,
      toolInput: display.toolInput,
      permissionKind: display.permissionKind,
      permissionPath: display.permissionPath
    }, {
      invocationMessage: { markdown: "Reading [context7-copilot-debug-main.json](file:///Users/connor/Downloads/context7-copilot-debug-main.json)" },
      toolInput: void 0,
      permissionKind: "read",
      permissionPath: "/Users/connor/Downloads/context7-copilot-debug-main.json"
    });
  });
});
suite("getPermissionDisplay \u2014 write permission display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("distinguishes creating a file from editing one", () => {
    const request = {
      kind: "write",
      fileName: "/repo/project/package.json"
    };
    assert.deepStrictEqual({
      create: getPermissionDisplay(request, URI.file("/repo/project"), true),
      edit: getPermissionDisplay(request, URI.file("/repo/project"), false)
    }, {
      create: {
        confirmationTitle: "Create file?",
        invocationMessage: { markdown: "Creating [package.json](file:///repo/project/package.json)" },
        toolInput: '{"path":"/repo/project/package.json"}',
        permissionKind: "write",
        permissionPath: "/repo/project/package.json"
      },
      edit: {
        confirmationTitle: "Write file?",
        invocationMessage: { markdown: "Editing [package.json](file:///repo/project/package.json)" },
        toolInput: '{"path":"/repo/project/package.json"}',
        permissionKind: "write",
        permissionPath: "/repo/project/package.json"
      }
    });
  });
});
suite("view tool \u2014 view_range display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function invocation(parameters) {
    const result = getInvocationMessage("view", "View File", parameters);
    return typeof result === "string" ? result : result.markdown;
  }
  function pastTense(parameters) {
    const result = getPastTenseMessage("view", "View File", parameters, true);
    return typeof result === "string" ? result : result.markdown;
  }
  test("renders path-only when view_range is absent", () => {
    assert.ok(invocation({ path: "/repo/file.ts" }).startsWith("Reading ["));
    assert.ok(pastTense({ path: "/repo/file.ts" }).startsWith("Read ["));
  });
  test('renders "lines X to Y" for a valid two-element range', () => {
    assert.ok(invocation({ path: "/repo/file.ts", view_range: [10, 20] }).endsWith(", lines 10 to 20"));
    assert.ok(pastTense({ path: "/repo/file.ts", view_range: [10, 20] }).endsWith(", lines 10 to 20"));
  });
  test('renders "line X" when start === end', () => {
    assert.ok(invocation({ path: "/repo/file.ts", view_range: [10, 10] }).endsWith(", line 10"));
    assert.ok(pastTense({ path: "/repo/file.ts", view_range: [10, 10] }).endsWith(", line 10"));
  });
  test('renders "line X to the end" for the -1 EOF sentinel', () => {
    assert.ok(invocation({ path: "/repo/file.ts", view_range: [10, -1] }).endsWith(", line 10 to the end"));
    assert.ok(pastTense({ path: "/repo/file.ts", view_range: [10, -1] }).endsWith(", line 10 to the end"));
  });
  test("falls back to path-only for invalid ranges", () => {
    assert.ok(!invocation({ path: "/repo/file.ts", view_range: [20, 10] }).includes(","));
    assert.ok(!invocation({ path: "/repo/file.ts", view_range: [-5, 10] }).includes(","));
    assert.ok(!invocation({ path: "/repo/file.ts", view_range: [1.5, 10] }).includes(","));
    assert.ok(!invocation({ path: "/repo/file.ts", view_range: [10] }).includes(","));
    assert.ok(!invocation({ path: "/repo/file.ts", view_range: [10, 20, 30] }).includes(","));
    assert.ok(!invocation({ path: "/repo/file.ts", view_range: "whatever" }).includes(","));
  });
});
suite("copilotToolDisplay \u2014 built-in tool invocation/past-tense messages", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function invocation(toolName, parameters) {
    const result = getInvocationMessage(toolName, getToolDisplayName(toolName), parameters);
    return typeof result === "string" ? result : result.markdown;
  }
  function pastTense(toolName, parameters) {
    const result = getPastTenseMessage(toolName, getToolDisplayName(toolName), parameters, true);
    return typeof result === "string" ? result : result.markdown;
  }
  test("agent-coordination tools use a single message (past tense) for both invocation and completion", () => {
    assert.strictEqual(invocation("read_agent", { agent_id: "math-helper" }), "Read agent `math-helper`");
    assert.strictEqual(pastTense("read_agent", { agent_id: "math-helper" }), "Read agent `math-helper`");
    assert.strictEqual(invocation("write_agent", { agent_id: "math-helper", message: "hi" }), "Wrote to agent `math-helper`");
    assert.strictEqual(pastTense("write_agent", { agent_id: "math-helper", message: "hi" }), "Wrote to agent `math-helper`");
  });
  test("agent tools fall back to a generic phrase without an agent id", () => {
    assert.strictEqual(invocation("read_agent", {}), "Read agent");
    assert.strictEqual(pastTense("write_agent", void 0), "Wrote to agent");
  });
  test("agent tools ignore a malformed (non-string) agent id instead of throwing", () => {
    assert.strictEqual(invocation("read_agent", { agent_id: 123 }), "Read agent");
    assert.strictEqual(pastTense("write_agent", { agent_id: "" }), "Wrote to agent");
  });
  test("list_agents shares one message; task keeps distinct present/past phrases", () => {
    assert.strictEqual(invocation("list_agents", {}), "Listed agents");
    assert.strictEqual(pastTense("list_agents", {}), "Listed agents");
    assert.strictEqual(invocation("task", {}), "Delegating task");
    assert.strictEqual(pastTense("task", {}), "Delegated task");
  });
  test("unhandled tools fall back to just the display name", () => {
    assert.strictEqual(invocation("store_memory", {}), "Store Memory");
    assert.strictEqual(pastTense("store_memory", {}), "Store Memory");
    assert.strictEqual(invocation("some_new_tool", {}), "some_new_tool");
    assert.strictEqual(pastTense("some_new_tool", {}), "some_new_tool");
  });
});
suite("copilotToolDisplay \u2014 streaming edit messages", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function streaming(toolName, parameters, resolvePath) {
    const result = getStreamingInvocationMessage(toolName, getToolDisplayName(toolName), parameters, resolvePath);
    return typeof result === "string" ? result : result.markdown;
  }
  function invocation(toolName, parameters) {
    const result = getInvocationMessage(toolName, getToolDisplayName(toolName), parameters);
    return typeof result === "string" ? result : result.markdown;
  }
  function completed(toolName, parameters) {
    const result = getPastTenseMessage(toolName, getToolDisplayName(toolName), parameters, true);
    return typeof result === "string" ? result : result.markdown;
  }
  test("streams replacement line counts and the target file", () => {
    assert.deepStrictEqual([
      streaming("edit", { path: "/repo/file.ts" }),
      streaming("edit", { path: "/repo/file.ts", old_str: "one\ntwo" }),
      streaming("edit", { path: "/repo/file.ts", old_str: "one\ntwo", new_str: "one\nupdated\nthree" })
    ], [
      "Editing [file.ts](file:///repo/file.ts)",
      "Replacing 2 lines in [file.ts](file:///repo/file.ts)",
      "Replacing 2 lines with 3 lines in [file.ts](file:///repo/file.ts)"
    ]);
  });
  test("streams create and insert line counts", () => {
    assert.deepStrictEqual([
      streaming("create", { path: "/repo/new.ts", file_text: "one\r\ntwo\r\nthree" }),
      streaming("insert", { path: "/repo/file.ts", new_str: "one\rtwo" })
    ], [
      "Creating [new.ts](file:///repo/new.ts) (3 lines)",
      "Inserting 2 lines in [file.ts](file:///repo/file.ts)"
    ]);
  });
  test("uses the str_replace_editor command shape", () => {
    assert.deepStrictEqual([
      streaming("str_replace_editor", { command: "create", path: "/repo/new.ts", file_text: "one\ntwo" }),
      streaming("str_replace_editor", { command: "str_replace", path: "/repo/file.ts", old_str: "old", new_str: "new\nvalue" }),
      streaming("str_replace_editor", { command: "view", path: "/repo/file.ts" })
    ], [
      "Creating [new.ts](file:///repo/new.ts) (2 lines)",
      "Replacing 1 line with 2 lines in [file.ts](file:///repo/file.ts)",
      "Reading [file.ts](file:///repo/file.ts)"
    ]);
  });
  test("preserves file context after streaming aliases become ready and complete", () => {
    const cases = [
      ["str_replace", { path: "/repo/file.ts" }, "Editing [file.ts](file:///repo/file.ts)", "Edited [file.ts](file:///repo/file.ts)"],
      ["insert", { path: "/repo/file.ts" }, "Inserting text in [file.ts](file:///repo/file.ts)", "Inserted text in [file.ts](file:///repo/file.ts)"],
      ["str_replace_editor", { command: "create", path: "/repo/new.ts" }, "Creating [new.ts](file:///repo/new.ts)", "Created [new.ts](file:///repo/new.ts)"],
      ["str_replace_editor", { command: "str_replace", path: "/repo/file.ts" }, "Editing [file.ts](file:///repo/file.ts)", "Edited [file.ts](file:///repo/file.ts)"]
    ];
    assert.deepStrictEqual(cases.map(([toolName, parameters]) => ({
      ready: invocation(toolName, parameters),
      complete: completed(toolName, parameters)
    })), cases.map(([, , ready, complete]) => ({ ready, complete })));
  });
  test("streams raw patch line counts and resolves discovered file paths", () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: src/file.ts",
      "@@",
      "-old",
      "+new",
      "*** End Patch"
    ].join("\n");
    assert.strictEqual(
      streaming("apply_patch", patch, (path) => `/workspace/${path}`),
      "Generating patch (6 lines) in [file.ts](file:///workspace/src/file.ts)"
    );
  });
  test("ignores malformed partial paths", () => {
    assert.strictEqual(
      streaming("edit", { path: 42, old_str: "one" }),
      "Replacing 1 line"
    );
  });
  test("falls back to the normal invocation formatter for non-edit tools", () => {
    assert.strictEqual(
      streaming("bash", { command: "npm test" }),
      "Running `npm test`"
    );
  });
});
suite("copilotToolDisplay \u2014 write_/read_ shell tools", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getToolKind", () => {
    test("returns terminal for bash", () => {
      assert.strictEqual(getToolKind("bash"), "terminal");
    });
    test("returns terminal for powershell", () => {
      assert.strictEqual(getToolKind("powershell"), "terminal");
    });
    test("returns undefined for write_bash (sending input to a running program, not launching a terminal)", () => {
      assert.strictEqual(getToolKind("write_bash"), void 0);
    });
    test("returns undefined for write_powershell", () => {
      assert.strictEqual(getToolKind("write_powershell"), void 0);
    });
    test("returns undefined for read_bash (reading output, not launching a terminal)", () => {
      assert.strictEqual(getToolKind("read_bash"), void 0);
    });
    test("returns undefined for read_powershell", () => {
      assert.strictEqual(getToolKind("read_powershell"), void 0);
    });
    test("returns subagent for task", () => {
      assert.strictEqual(getToolKind("task"), "subagent");
    });
    test("returns undefined for view", () => {
      assert.strictEqual(getToolKind("view"), void 0);
    });
    test("returns search for glob", () => {
      assert.strictEqual(getToolKind("glob"), "search");
    });
  });
  suite("getShellLanguage", () => {
    test("bash returns shellscript", () => {
      assert.strictEqual(getShellLanguage("bash"), "shellscript");
    });
    test("powershell returns powershell", () => {
      assert.strictEqual(getShellLanguage("powershell"), "powershell");
    });
    test("write_bash returns shellscript", () => {
      assert.strictEqual(getShellLanguage("write_bash"), "shellscript");
    });
    test("write_powershell returns powershell", () => {
      assert.strictEqual(getShellLanguage("write_powershell"), "powershell");
    });
    test("read_bash returns shellscript", () => {
      assert.strictEqual(getShellLanguage("read_bash"), "shellscript");
    });
    test("read_powershell returns powershell", () => {
      assert.strictEqual(getShellLanguage("read_powershell"), "powershell");
    });
  });
  suite("getInvocationMessage", () => {
    function getText(msg) {
      return typeof msg === "string" ? msg : msg.markdown;
    }
    test("write_bash with command includes the command text", () => {
      const msg = getInvocationMessage("write_bash", "Write Shell Input", { command: "echo hello" });
      assert.ok(getText(msg).includes("echo hello"), `expected 'echo hello' in: ${getText(msg)}`);
    });
    test("write_bash without command returns a non-empty fallback message", () => {
      const msg = getInvocationMessage("write_bash", "Write Shell Input", void 0);
      assert.ok(getText(msg).length > 0);
      assert.ok(!getText(msg).includes("undefined"));
    });
    test("write_powershell with command includes the command text", () => {
      const msg = getInvocationMessage("write_powershell", "Write Shell Input", { command: "Get-Date" });
      assert.ok(getText(msg).includes("Get-Date"), `expected 'Get-Date' in: ${getText(msg)}`);
    });
    test("read_bash returns a non-empty message", () => {
      const msg = getInvocationMessage("read_bash", "Read Shell Output", void 0);
      assert.strictEqual(getText(msg), "Reading Terminal");
    });
    test("read_powershell returns a non-empty message", () => {
      const msg = getInvocationMessage("read_powershell", "Read Shell Output", void 0);
      assert.strictEqual(getText(msg), "Reading Terminal");
    });
    test("write_bash message differs from bash message (distinct wording)", () => {
      const writeBashMsg = getText(getInvocationMessage("write_bash", "Write Shell Input", { command: "echo hi" }));
      const bashMsg = getText(getInvocationMessage("bash", "Bash", { command: "echo hi" }));
      assert.notStrictEqual(writeBashMsg, bashMsg);
    });
  });
  suite("getPastTenseMessage", () => {
    function getText(msg) {
      return typeof msg === "string" ? msg : msg.markdown;
    }
    test("write_bash with command includes the command text", () => {
      const msg = getPastTenseMessage("write_bash", "Write Shell Input", { command: "echo hello" }, true);
      assert.ok(getText(msg).includes("echo hello"), `expected 'echo hello' in: ${getText(msg)}`);
    });
    test("write_bash without command returns a non-empty fallback message", () => {
      const msg = getPastTenseMessage("write_bash", "Write Shell Input", void 0, true);
      assert.ok(getText(msg).length > 0);
    });
    test("write_powershell with command includes the command text", () => {
      const msg = getPastTenseMessage("write_powershell", "Write Shell Input", { command: "Get-Date" }, true);
      assert.ok(getText(msg).includes("Get-Date"), `expected 'Get-Date' in: ${getText(msg)}`);
    });
    test("read_bash success returns a non-empty message", () => {
      const msg = getPastTenseMessage("read_bash", "Read Shell Output", void 0, true);
      assert.strictEqual(getText(msg), "Read Terminal");
    });
    test("write_bash failure returns a non-empty error message", () => {
      const msg = getPastTenseMessage("write_bash", "Write Shell Input", { command: "echo hello" }, false);
      assert.ok(getText(msg).length > 0);
    });
  });
  suite("feedback comment tools (delegated to the shared server-tool group)", () => {
    function text(msg) {
      return typeof msg === "string" ? msg : msg.markdown;
    }
    test("Copilot display delegates to the shared group", () => {
      const listResult = JSON.stringify({ comments: [{ id: "a" }, { id: "b" }] });
      assert.deepStrictEqual({
        displayName: getToolDisplayName("listComments"),
        invoke: text(getInvocationMessage("listComments", "List Comments", void 0)),
        past: text(getPastTenseMessage("listComments", "List Comments", void 0, true, listResult))
      }, {
        displayName: "List Comments",
        invoke: "Checking comments",
        past: "Checked 2 comments"
      });
    });
    test("failed feedback tool still uses the generic failure message", () => {
      assert.strictEqual(text(getPastTenseMessage("listComments", "List Comments", void 0, false)), '"List Comments" failed');
    });
  });
  suite("getToolInputString", () => {
    test("write_bash extracts command field", () => {
      assert.strictEqual(getToolInputString("write_bash", { command: "echo hello" }, void 0), "echo hello");
    });
    test("write_powershell extracts command field", () => {
      assert.strictEqual(getToolInputString("write_powershell", { command: "Get-Date" }, void 0), "Get-Date");
    });
    test("write_bash falls back to rawArguments when no command field", () => {
      assert.strictEqual(getToolInputString("write_bash", {}, '{"command":"echo hello"}'), '{"command":"echo hello"}');
    });
    test("write_bash returns undefined when both parameters and rawArguments are absent", () => {
      assert.strictEqual(getToolInputString("write_bash", void 0, void 0), void 0);
    });
    test("read_bash with no parameters returns undefined", () => {
      assert.strictEqual(getToolInputString("read_bash", void 0, void 0), void 0);
    });
  });
});
suite("skill events", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("hides the raw `skill` tool call and synthesizes a tool-start/complete pair from `skill.invoked`", () => {
    const withPath = synthesizeSkillToolCall(
      { name: "plan", path: "/abs/repo/skills/plan/SKILL.md" },
      "evt-123"
    );
    const noPath = synthesizeSkillToolCall(
      { name: "plan" },
      void 0
    );
    assert.deepStrictEqual({
      skillIsHidden: isHiddenTool("skill"),
      withPathToolCallId: withPath.toolCallId,
      withPathToolName: withPath.toolName,
      withPathDisplayName: withPath.displayName,
      withPathInvocation: withPath.invocationMessage,
      withPathPastTense: withPath.pastTenseMessage,
      noPathToolCallId: noPath.toolCallId,
      noPathInvocation: noPath.invocationMessage,
      noPathPastTense: noPath.pastTenseMessage
    }, {
      skillIsHidden: true,
      withPathToolCallId: "synth-skill-evt-123",
      withPathToolName: "skill",
      withPathDisplayName: "Read Skill",
      withPathInvocation: { markdown: "Reading skill [plan](file:///abs/repo/skills/plan/SKILL.md)" },
      withPathPastTense: { markdown: "Read skill [plan](file:///abs/repo/skills/plan/SKILL.md)" },
      noPathToolCallId: "synth-skill-2108d652",
      noPathInvocation: "Reading skill plan",
      noPathPastTense: "Read skill plan"
    });
  });
});
suite("rg / grep search tool display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function text(msg) {
    return typeof msg === "string" ? msg : msg.markdown;
  }
  test('rg invocation/past tense use "Searching for {pattern}" wording', () => {
    const inv = text(getInvocationMessage("rg", "Search", { pattern: "foo" }));
    const past = text(getPastTenseMessage("rg", "Search", { pattern: "foo" }, true));
    assert.deepStrictEqual({ inv, past }, {
      inv: "Searching for `foo`",
      past: "Searched for `foo`"
    });
  });
  test("rg without a pattern falls back to a generic search message (not the raw tool name)", () => {
    const inv = text(getInvocationMessage("rg", "Search", void 0));
    assert.strictEqual(inv, "Searching files");
  });
  test('grep keeps "Searching for {pattern}" wording', () => {
    const inv = text(getInvocationMessage("grep", "Search", { pattern: "bar" }));
    const past = text(getPastTenseMessage("grep", "Search", { pattern: "bar" }, true));
    assert.deepStrictEqual({ inv, past }, {
      inv: "Searching for `bar`",
      past: "Searched for `bar`"
    });
  });
  test("getToolInputString returns pattern for both grep and rg", () => {
    assert.strictEqual(getToolInputString("grep", { pattern: "abc" }, void 0), "abc");
    assert.strictEqual(getToolInputString("rg", { pattern: "abc" }, void 0), "abc");
  });
});
suite("web_fetch tool display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function text(msg) {
    return typeof msg === "string" ? msg : msg.markdown;
  }
  test("uses the fetched URL for invocation and completion messages", () => {
    const parameters = { url: "https://example.com/docs" };
    assert.deepStrictEqual({
      invocation: text(getInvocationMessage("web_fetch", "Fetch Web Content", parameters)),
      pastTense: text(getPastTenseMessage("web_fetch", "Fetch Web Content", parameters, true)),
      input: getToolInputString("web_fetch", parameters, void 0)
    }, {
      invocation: "Fetching [https://example.com/docs](https://example.com/docs)",
      pastTense: "Fetched [https://example.com/docs](https://example.com/docs)",
      input: "https://example.com/docs"
    });
  });
  test("falls back to generic URL wording when the URL is absent", () => {
    assert.deepStrictEqual({
      invocation: text(getInvocationMessage("web_fetch", "Fetch Web Content", void 0)),
      pastTense: text(getPastTenseMessage("web_fetch", "Fetch Web Content", void 0, true)),
      failure: text(getPastTenseMessage("web_fetch", "Fetch Web Content", { url: "https://example.com/docs" }, false))
    }, {
      invocation: "Fetching URL",
      pastTense: "Fetched URL",
      failure: '"Fetch Web Content" failed'
    });
  });
});
suite("sql tool display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function text(msg) {
    return typeof msg === "string" ? msg : msg.markdown;
  }
  test("uses the SQL description for invocation and completion messages", () => {
    const parameters = { description: "Insert agent host study todos", query: "INSERT INTO todos (title) VALUES ('Read terminal activation docs')" };
    assert.strictEqual(text(getInvocationMessage("sql", "Execute SQL", parameters)), "Insert agent host study todos");
    assert.strictEqual(text(getPastTenseMessage("sql", "Execute SQL", parameters, true)), "Insert agent host study todos");
  });
  test("falls back to generic SQL wording when description is absent", () => {
    assert.strictEqual(text(getInvocationMessage("sql", "Execute SQL", { query: "SELECT 1" })), "Executing SQL query");
    assert.strictEqual(text(getPastTenseMessage("sql", "Execute SQL", { query: "SELECT 1" }, true)), "Executed SQL query");
  });
});
suite("apply_patch tool display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function text(msg) {
    return typeof msg === "string" ? msg : msg.markdown;
  }
  const singleFilePatch = [
    "*** Begin Patch",
    "*** Update File: /repo/src/foo.ts",
    "@@",
    "-old",
    "+new",
    "*** End Patch"
  ].join("\n");
  const multiFilePatch = [
    "*** Begin Patch",
    "*** Update File: /repo/src/foo.ts",
    "@@",
    "-old",
    "+new",
    "*** Add File: /repo/src/bar.ts",
    "+hello",
    "*** Delete File: /repo/src/baz.ts",
    "*** End Patch"
  ].join("\n");
  test("renders a clickable file link for a single-file patch", () => {
    const inv = text(getInvocationMessage("apply_patch", "Patch", { input: singleFilePatch }));
    const past = text(getPastTenseMessage("apply_patch", "Patch", { input: singleFilePatch }, true));
    assert.deepStrictEqual({ inv, past }, {
      inv: "Editing [foo.ts](file:///repo/src/foo.ts)",
      past: "Edited [foo.ts](file:///repo/src/foo.ts)"
    });
  });
  test("lists every affected file for a multi-file patch", () => {
    const inv = text(getInvocationMessage("apply_patch", "Patch", { input: multiFilePatch }));
    const past = text(getPastTenseMessage("apply_patch", "Patch", { input: multiFilePatch }, true));
    assert.deepStrictEqual({ inv, past }, {
      inv: "Editing [foo.ts](file:///repo/src/foo.ts), [bar.ts](file:///repo/src/bar.ts), [baz.ts](file:///repo/src/baz.ts)",
      past: "Edited [foo.ts](file:///repo/src/foo.ts), [bar.ts](file:///repo/src/bar.ts), [baz.ts](file:///repo/src/baz.ts)"
    });
  });
  test("falls back to a generic message when the patch body is missing or unparseable", () => {
    assert.strictEqual(getInvocationMessage("apply_patch", "Patch", void 0), "Editing files");
    assert.strictEqual(getInvocationMessage("apply_patch", "Patch", { input: "not a patch" }), "Editing files");
    assert.strictEqual(getPastTenseMessage("apply_patch", "Patch", void 0, true), "Edited files");
  });
  test("also accepts the patch text under the `patch` parameter (CLI shape)", () => {
    const inv = text(getInvocationMessage("apply_patch", "Patch", { patch: singleFilePatch }));
    assert.strictEqual(inv, "Editing [foo.ts](file:///repo/src/foo.ts)");
  });
  test("git_apply_patch shares the same display path", () => {
    const inv = text(getInvocationMessage("git_apply_patch", "Patch", { input: singleFilePatch }));
    const past = text(getPastTenseMessage("git_apply_patch", "Patch", { input: singleFilePatch }, true));
    assert.deepStrictEqual({ inv, past }, {
      inv: "Editing [foo.ts](file:///repo/src/foo.ts)",
      past: "Edited [foo.ts](file:///repo/src/foo.ts)"
    });
  });
  test("failure still routes through the generic failed message", () => {
    assert.strictEqual(getPastTenseMessage("apply_patch", "Patch", { input: singleFilePatch }, false), '"Patch" failed');
  });
  test("getEditFilePath returns the first affected file from a patch body", () => {
    assert.strictEqual(getEditFilePath({ input: singleFilePatch }), "/repo/src/foo.ts");
    assert.strictEqual(getEditFilePath({ input: multiFilePatch }), "/repo/src/foo.ts");
    assert.strictEqual(getEditFilePath({ patch: singleFilePatch }), "/repo/src/foo.ts");
    assert.strictEqual(getEditFilePath(JSON.stringify({ input: singleFilePatch })), "/repo/src/foo.ts");
    assert.strictEqual(getEditFilePath({ input: "not a patch" }), void 0);
  });
  test("getEditFilePaths returns every affected file from a patch body", () => {
    assert.deepStrictEqual(getEditFilePaths({ input: singleFilePatch }), ["/repo/src/foo.ts"]);
    assert.deepStrictEqual(getEditFilePaths({ input: multiFilePatch }), ["/repo/src/foo.ts", "/repo/src/bar.ts", "/repo/src/baz.ts"]);
    assert.deepStrictEqual(getEditFilePaths({ patch: multiFilePatch }), ["/repo/src/foo.ts", "/repo/src/bar.ts", "/repo/src/baz.ts"]);
    assert.deepStrictEqual(getEditFilePaths(JSON.stringify({ input: multiFilePatch })), ["/repo/src/foo.ts", "/repo/src/bar.ts", "/repo/src/baz.ts"]);
    assert.deepStrictEqual(getEditFilePaths({ path: "/repo/src/edit.ts" }), ["/repo/src/edit.ts"]);
    assert.deepStrictEqual(getEditFilePaths({ input: "not a patch" }), []);
    assert.deepStrictEqual(getEditFilePaths(void 0), []);
    assert.deepStrictEqual(getEditFilePaths(multiFilePatch), ["/repo/src/foo.ts", "/repo/src/bar.ts", "/repo/src/baz.ts"]);
    assert.deepStrictEqual(getEditFilePaths(singleFilePatch), ["/repo/src/foo.ts"]);
  });
});
suite("getShellIntention", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("reads the description argument of shell tools, and ignores non-shell tools", () => {
    assert.deepStrictEqual({
      bash: getShellIntention("bash", { command: "ls", description: "List files" }),
      powershell: getShellIntention("powershell", { command: "Get-ChildItem", description: "List files" }),
      shellNoDescription: getShellIntention("bash", { command: "ls" }),
      shellEmptyDescription: getShellIntention("bash", { command: "ls", description: "" }),
      // The `task` (subagent) tool also has a `description` argument, but it is
      // the subagent task description, not a shell intention — must be ignored.
      taskTool: getShellIntention("task", { description: "Explore the codebase" }),
      viewTool: getShellIntention("view", { path: "/repo/file.ts", description: "why" }),
      noArgs: getShellIntention("bash", void 0)
    }, {
      bash: "List files",
      powershell: "List files",
      shellNoDescription: void 0,
      shellEmptyDescription: void 0,
      taskTool: void 0,
      viewTool: void 0,
      noArgs: void 0
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29waWxvdFRvb2xEaXNwbGF5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBnZXRFZGl0RmlsZVBhdGgsIGdldEVkaXRGaWxlUGF0aHMsIGdldEludm9jYXRpb25NZXNzYWdlLCBnZXRQYXN0VGVuc2VNZXNzYWdlLCBnZXRQZXJtaXNzaW9uRGlzcGxheSwgZ2V0U2hlbGxJbnRlbnRpb24sIGdldFNoZWxsTGFuZ3VhZ2UsIGdldFN0cmVhbWluZ0ludm9jYXRpb25NZXNzYWdlLCBnZXRUb29sRGlzcGxheU5hbWUsIGdldFRvb2xJbnB1dFN0cmluZywgZ2V0VG9vbEtpbmQsIGdldFRvb2xNYXJrZG93bkNvbnRlbnQsIGlzRWRpdFRvb2wsIGlzSGlkZGVuVG9vbCwgaXNNYXJrZG93blJlbmRlcmVkVG9vbCwgc3ludGhlc2l6ZVNraWxsVG9vbENhbGwsIHR5cGUgSVR5cGVkUGVybWlzc2lvblJlcXVlc3QgfSBmcm9tICcuLi8uLi9ub2RlL2NvcGlsb3QvY29waWxvdFRvb2xEaXNwbGF5LmpzJztcblxuc3VpdGUoJ2NvcGlsb3RUb29sRGlzcGxheSBcdTIwMTQgZnJpZW5kbHkgdG9vbCBuYW1lcycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtaXJyb3JzIGludGVybmFsIENvcGlsb3QgQ0xJIGZyaWVuZGx5IGxhYmVscyBmb3IgcmVwcmVzZW50YXRpdmUgdG9vbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2FzZXM6IEFycmF5PFt0b29sTmFtZTogc3RyaW5nLCBkaXNwbGF5TmFtZTogc3RyaW5nXT4gPSBbXG5cdFx0XHRbJ2Jhc2gnLCAnUnVuIFNoZWxsIENvbW1hbmQnXSxcblx0XHRcdFsncG93ZXJzaGVsbCcsICdSdW4gU2hlbGwgQ29tbWFuZCddLFxuXHRcdFx0WydyZWFkX2Jhc2gnLCAnUmVhZCBUZXJtaW5hbCddLFxuXHRcdFx0WydyZWFkX3Bvd2Vyc2hlbGwnLCAnUmVhZCBUZXJtaW5hbCddLFxuXHRcdFx0Wyd3cml0ZV9iYXNoJywgJ1dyaXRlIHRvIEJhc2gnXSxcblx0XHRcdFsnd3JpdGVfcG93ZXJzaGVsbCcsICdXcml0ZSB0byBQb3dlclNoZWxsJ10sXG5cdFx0XHRbJ3N0b3BfYmFzaCcsICdTdG9wIFRlcm1pbmFsIFNlc3Npb24nXSxcblx0XHRcdFsnc3RvcF9wb3dlcnNoZWxsJywgJ1N0b3AgVGVybWluYWwgU2Vzc2lvbiddLFxuXHRcdFx0WydiYXNoX3NodXRkb3duJywgJ1N0b3AgVGVybWluYWwgU2Vzc2lvbiddLFxuXHRcdFx0Wydwb3dlcnNoZWxsX3NodXRkb3duJywgJ1N0b3AgVGVybWluYWwgU2Vzc2lvbiddLFxuXHRcdFx0WydsaXN0X2Jhc2gnLCAnTGlzdCBTaGVsbCBTZXNzaW9ucyddLFxuXHRcdFx0WydsaXN0X3Bvd2Vyc2hlbGwnLCAnTGlzdCBTaGVsbCBTZXNzaW9ucyddLFxuXHRcdFx0Wyd2aWV3JywgJ1JlYWQnXSxcblx0XHRcdFsnZWRpdCcsICdFZGl0IEZpbGUnXSxcblx0XHRcdFsnc3RyX3JlcGxhY2VfZWRpdG9yJywgJ0VkaXQgRmlsZSddLFxuXHRcdFx0WydzdHJfcmVwbGFjZScsICdFZGl0IEZpbGUnXSxcblx0XHRcdFsnaW5zZXJ0JywgJ0VkaXQgRmlsZSddLFxuXHRcdFx0WydjcmVhdGUnLCAnQ3JlYXRlIEZpbGUnXSxcblx0XHRcdFsnZ3JlcCcsICdTZWFyY2gnXSxcblx0XHRcdFsncmcnLCAnU2VhcmNoJ10sXG5cdFx0XHRbJ2dsb2InLCAnU2VhcmNoJ10sXG5cdFx0XHRbJ3NlYXJjaF9jb2RlX3N1YmFnZW50JywgJ1NlYXJjaCBDb2RlJ10sXG5cdFx0XHRbJ3JlcGx5X3RvX2NvbW1lbnQnLCAnUmVwbHkgdG8gQ29tbWVudCddLFxuXHRcdFx0Wydjb2RlX3JldmlldycsICdDb2RlIFJldmlldyddLFxuXHRcdFx0Wyd0aGluaycsICdUaGlua2luZyddLFxuXHRcdFx0WydyZXBvcnRfaW50ZW50JywgJ1JlcG9ydCBJbnRlbnQnXSxcblx0XHRcdFsncmVwb3J0X3Byb2dyZXNzJywgJ1Byb2dyZXNzIHVwZGF0ZSddLFxuXHRcdFx0Wyd3ZWJfZmV0Y2gnLCAnRmV0Y2ggV2ViIENvbnRlbnQnXSxcblx0XHRcdFsnd2ViX3NlYXJjaCcsICdXZWIgU2VhcmNoJ10sXG5cdFx0XHRbJ3VwZGF0ZV90b2RvJywgJ1VwZGF0ZSBUb2RvJ10sXG5cdFx0XHRbJ3Nob3dfZmlsZScsICdTaG93IEZpbGUnXSxcblx0XHRcdFsnZmV0Y2hfY29waWxvdF9jbGlfZG9jdW1lbnRhdGlvbicsICdGZXRjaCBEb2N1bWVudGF0aW9uJ10sXG5cdFx0XHRbJ3Byb3Bvc2Vfd29yaycsICdQcm9wb3NlIFdvcmsnXSxcblx0XHRcdFsndGFza19jb21wbGV0ZScsICdUYXNrIENvbXBsZXRlJ10sXG5cdFx0XHRbJ2Fza191c2VyJywgJ0FzayBVc2VyJ10sXG5cdFx0XHRbJ3NraWxsJywgJ0ludm9rZSBTa2lsbCddLFxuXHRcdFx0Wyd0YXNrJywgJ0RlbGVnYXRlIFRhc2snXSxcblx0XHRcdFsnbGlzdF9hZ2VudHMnLCAnTGlzdCBBZ2VudHMnXSxcblx0XHRcdFsncmVhZF9hZ2VudCcsICdSZWFkIEFnZW50J10sXG5cdFx0XHRbJ2V4aXRfcGxhbl9tb2RlJywgJ0V4aXQgUGxhbiBNb2RlJ10sXG5cdFx0XHRbJ3NxbCcsICdFeGVjdXRlIFNRTCddLFxuXHRcdFx0Wydsc3AnLCAnTGFuZ3VhZ2UgU2VydmVyJ10sXG5cdFx0XHRbJ2NyZWF0ZV9wdWxsX3JlcXVlc3QnLCAnQ3JlYXRlIFB1bGwgUmVxdWVzdCddLFxuXHRcdFx0WydnaC1hZHZpc29yeS1kYXRhYmFzZScsICdDaGVjayBEZXBlbmRlbmNpZXMnXSxcblx0XHRcdFsnc3RvcmVfbWVtb3J5JywgJ1N0b3JlIE1lbW9yeSddLFxuXHRcdFx0WydhcHBseV9wYXRjaCcsICdBcHBseSBQYXRjaCddLFxuXHRcdFx0Wyd3cml0ZV9hZ2VudCcsICdXcml0ZSB0byBBZ2VudCddLFxuXHRcdFx0WydtY3BfcmVsb2FkJywgJ1JlbG9hZCBNQ1AgQ29uZmlnJ10sXG5cdFx0XHRbJ21jcF92YWxpZGF0ZScsICdWYWxpZGF0ZSBNQ1AgQ29uZmlnJ10sXG5cdFx0XHRbJ3Rvb2xfc2VhcmNoX3Rvb2xfcmVnZXgnLCAnU2VhcmNoIFRvb2xzJ10sXG5cdFx0XHRbJ3BhcmFsbGVsX3ZhbGlkYXRpb24nLCAnVmFsaWRhdGUgQ2hhbmdlcyddLFxuXHRcdFx0Wydjb2RlcWxfY2hlY2tlcicsICdDb2RlUUwgU2VjdXJpdHkgU2NhbiddLFxuXHRcdFx0WydhZGRDb21tZW50JywgJ0FkZCBDb21tZW50J10sXG5cdFx0XHRbJ2xpc3RDb21tZW50cycsICdMaXN0IENvbW1lbnRzJ10sXG5cdFx0XHRbJ2RlbGV0ZUNvbW1lbnRzJywgJ0RlbGV0ZSBDb21tZW50cyddLFxuXHRcdFx0WydyZXNvbHZlQ29tbWVudHMnLCAnUmVzb2x2ZSBDb21tZW50cyddLFxuXHRcdFx0Wyd2aWV3VW5yZXZpZXdlZENvbW1lbnRzJywgJ1ZpZXcgQ29tbWVudHMnXSxcblx0XHRdO1xuXG5cdFx0Zm9yIChjb25zdCBbdG9vbE5hbWUsIGRpc3BsYXlOYW1lXSBvZiBjYXNlcykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xEaXNwbGF5TmFtZSh0b29sTmFtZSksIGRpc3BsYXlOYW1lLCB0b29sTmFtZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIHRoZSByYXcgdG9vbCBuYW1lIGZvciB1bmtub3duIHRvb2xzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sRGlzcGxheU5hbWUoJ3NvbWVfbmV3X3Rvb2wnKSwgJ3NvbWVfbmV3X3Rvb2wnKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NvcGlsb3RUb29sRGlzcGxheSBcdTIwMTQgZWRpdCB0b29sIGNsYXNzaWZpY2F0aW9uJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NsYXNzaWZpZXMgZGlyZWN0IGZpbGUgZWRpdCB0b29scycsICgpID0+IHtcblx0XHRmb3IgKGNvbnN0IHRvb2xOYW1lIG9mIFsnZWRpdCcsICdzdHJfcmVwbGFjZScsICdpbnNlcnQnLCAnY3JlYXRlJywgJ2FwcGx5X3BhdGNoJywgJ2dpdF9hcHBseV9wYXRjaCddKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNFZGl0VG9vbCh0b29sTmFtZSksIHRydWUsIHRvb2xOYW1lKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NsYXNzaWZpZXMgc3RyX3JlcGxhY2VfZWRpdG9yIGJ5IGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIFsnZWRpdCcsICdzdHJfcmVwbGFjZScsICdpbnNlcnQnLCAnY3JlYXRlJ10pIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0VkaXRUb29sKCdzdHJfcmVwbGFjZV9lZGl0b3InLCBjb21tYW5kKSwgdHJ1ZSwgY29tbWFuZCk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0VkaXRUb29sKCdzdHJfcmVwbGFjZV9lZGl0b3InLCAndmlldycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRWRpdFRvb2woJ3N0cl9yZXBsYWNlX2VkaXRvcicsICd1bmtub3duJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNFZGl0VG9vbCgnc3RyX3JlcGxhY2VfZWRpdG9yJyksIGZhbHNlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NvcGlsb3RUb29sRGlzcGxheSBcdTIwMTQgbWFya2Rvd24tcmVuZGVyZWQgdG9vbHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndGFza19jb21wbGV0ZSByZW5kZXJzIGFzIG1hcmtkb3duLCBvdGhlciB0b29scyBkbyBub3QnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWFya2Rvd25SZW5kZXJlZFRvb2woJ3Rhc2tfY29tcGxldGUnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWFya2Rvd25SZW5kZXJlZFRvb2woJ2Jhc2gnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01hcmtkb3duUmVuZGVyZWRUb29sKCdyZXBvcnRfaW50ZW50JyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VG9vbE1hcmtkb3duQ29udGVudCByZXR1cm5zIHRoZSB0YXNrX2NvbXBsZXRlIHN1bW1hcnkgd2hlbiBwcmVzZW50JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sTWFya2Rvd25Db250ZW50KCd0YXNrX2NvbXBsZXRlJywgeyBzdW1tYXJ5OiAnQWxsIHRlc3RzIHBhc3MuJyB9KSwgJ1xcblxcbioqVGFzayBjb21wbGV0ZWQ6KiogQWxsIHRlc3RzIHBhc3MuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFRvb2xNYXJrZG93bkNvbnRlbnQgcmV0dXJucyB1bmRlZmluZWQgZm9yIGVtcHR5LCBtaXNzaW5nLCBvciBub24tc3RyaW5nIHN1bW1hcmllcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbE1hcmtkb3duQ29udGVudCgndGFza19jb21wbGV0ZScsIHsgc3VtbWFyeTogJycgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xNYXJrZG93bkNvbnRlbnQoJ3Rhc2tfY29tcGxldGUnLCB7fSksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xNYXJrZG93bkNvbnRlbnQoJ3Rhc2tfY29tcGxldGUnLCB1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sTWFya2Rvd25Db250ZW50KCd0YXNrX2NvbXBsZXRlJywgeyBzdW1tYXJ5OiA0MiB9KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VG9vbE1hcmtkb3duQ29udGVudCByZXR1cm5zIHVuZGVmaW5lZCBmb3Igbm9uLW1hcmtkb3duIHRvb2xzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sTWFya2Rvd25Db250ZW50KCdiYXNoJywgeyBzdW1tYXJ5OiAnaWdub3JlZCcgfSksIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdnZXRQZXJtaXNzaW9uRGlzcGxheSBcdTIwMTQgY2QtcHJlZml4IHN0cmlwcGluZycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCB3ZCA9IFVSSS5maWxlKCcvcmVwby9wcm9qZWN0Jyk7XG5cblx0dGVzdCgnc3RyaXBzIHJlZHVuZGFudCBjZCBmcm9tIHNoZWxsIHBlcm1pc3Npb24gcmVxdWVzdCBmdWxsQ29tbWFuZFRleHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVxdWVzdDogSVR5cGVkUGVybWlzc2lvblJlcXVlc3QgPSB7XG5cdFx0XHRraW5kOiAnc2hlbGwnLFxuXHRcdFx0ZnVsbENvbW1hbmRUZXh0OiAnY2QgL3JlcG8vcHJvamVjdCAmJiBucG0gdGVzdCcsXG5cdFx0fSBhcyBJVHlwZWRQZXJtaXNzaW9uUmVxdWVzdDtcblx0XHRjb25zdCBkaXNwbGF5ID0gZ2V0UGVybWlzc2lvbkRpc3BsYXkocmVxdWVzdCwgd2QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwbGF5LnRvb2xJbnB1dCwgJ25wbSB0ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3BsYXkucGVybWlzc2lvbktpbmQsICdzaGVsbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdsZWF2ZXMgc2hlbGwgY29tbWFuZCBhbG9uZSB3aGVuIGNkIHRhcmdldCBkaWZmZXJzIGZyb20gd29ya2luZyBkaXJlY3RvcnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVxdWVzdDogSVR5cGVkUGVybWlzc2lvblJlcXVlc3QgPSB7XG5cdFx0XHRraW5kOiAnc2hlbGwnLFxuXHRcdFx0ZnVsbENvbW1hbmRUZXh0OiAnY2QgL3RtcCAmJiBscycsXG5cdFx0fSBhcyBJVHlwZWRQZXJtaXNzaW9uUmVxdWVzdDtcblx0XHRjb25zdCBkaXNwbGF5ID0gZ2V0UGVybWlzc2lvbkRpc3BsYXkocmVxdWVzdCwgd2QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwbGF5LnRvb2xJbnB1dCwgJ2NkIC90bXAgJiYgbHMnKTtcblx0fSk7XG5cblx0dGVzdCgnbGVhdmVzIHNoZWxsIGNvbW1hbmQgYWxvbmUgd2hlbiBubyB3b3JraW5nIGRpcmVjdG9yeSBwcm92aWRlZCcsICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0OiBJVHlwZWRQZXJtaXNzaW9uUmVxdWVzdCA9IHtcblx0XHRcdGtpbmQ6ICdzaGVsbCcsXG5cdFx0XHRmdWxsQ29tbWFuZFRleHQ6ICdjZCAvcmVwby9wcm9qZWN0ICYmIG5wbSB0ZXN0Jyxcblx0XHR9IGFzIElUeXBlZFBlcm1pc3Npb25SZXF1ZXN0O1xuXHRcdGNvbnN0IGRpc3BsYXkgPSBnZXRQZXJtaXNzaW9uRGlzcGxheShyZXF1ZXN0LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwbGF5LnRvb2xJbnB1dCwgJ2NkIC9yZXBvL3Byb2plY3QgJiYgbnBtIHRlc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIHJlZHVuZGFudCBjZCBmcm9tIGN1c3RvbS10b29sIHNoZWxsIHBlcm1pc3Npb24gcmVxdWVzdCcsICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0OiBJVHlwZWRQZXJtaXNzaW9uUmVxdWVzdCA9IHtcblx0XHRcdGtpbmQ6ICdjdXN0b20tdG9vbCcsXG5cdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0YXJnczogeyBjb21tYW5kOiAnY2QgL3JlcG8vcHJvamVjdCAmJiBlY2hvIGhpJyB9LFxuXHRcdH0gYXMgSVR5cGVkUGVybWlzc2lvblJlcXVlc3Q7XG5cdFx0Y29uc3QgZGlzcGxheSA9IGdldFBlcm1pc3Npb25EaXNwbGF5KHJlcXVlc3QsIHdkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGxheS50b29sSW5wdXQsICdlY2hvIGhpJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3BsYXkucGVybWlzc2lvbktpbmQsICdzaGVsbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBhZmZlY3Qgbm9uLXNoZWxsIGN1c3RvbS10b29sIHJlcXVlc3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcXVlc3Q6IElUeXBlZFBlcm1pc3Npb25SZXF1ZXN0ID0ge1xuXHRcdFx0a2luZDogJ2N1c3RvbS10b29sJyxcblx0XHRcdHRvb2xOYW1lOiAnc29tZV9vdGhlcl90b29sJyxcblx0XHRcdGFyZ3M6IHsgY29tbWFuZDogJ2NkIC9yZXBvL3Byb2plY3QgJiYgZWNobyBoaScgfSxcblx0XHR9IGFzIElUeXBlZFBlcm1pc3Npb25SZXF1ZXN0O1xuXHRcdGNvbnN0IGRpc3BsYXkgPSBnZXRQZXJtaXNzaW9uRGlzcGxheShyZXF1ZXN0LCB3ZCk7XG5cdFx0Ly8gRmFsbHMgdGhyb3VnaCB0byB0aGUgZ2VuZXJpYyBicmFuY2ggXHUyMDE0IHRvb2xJbnB1dCBpcyB0aGUgSlNPTi1zdHJpbmdpZmllZCBhcmdzLlxuXHRcdGFzc2VydC5vayhkaXNwbGF5LnRvb2xJbnB1dD8uaW5jbHVkZXMoJ2NkIC9yZXBvL3Byb2plY3QnKSwgYGV4cGVjdGVkIHVucmV3cml0dGVuIGFyZ3MsIGdvdDogJHtkaXNwbGF5LnRvb2xJbnB1dH1gKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGxheS5wZXJtaXNzaW9uS2luZCwgJ2N1c3RvbS10b29sJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgcG93ZXJzaGVsbCBjdXN0b20tdG9vbCB3aXRoIHNlbWljb2xvbiBzZXBhcmF0b3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVxdWVzdDogSVR5cGVkUGVybWlzc2lvblJlcXVlc3QgPSB7XG5cdFx0XHRraW5kOiAnY3VzdG9tLXRvb2wnLFxuXHRcdFx0dG9vbE5hbWU6ICdwb3dlcnNoZWxsJyxcblx0XHRcdGFyZ3M6IHsgY29tbWFuZDogJ2NkIC9yZXBvL3Byb2plY3Q7IGRpcicgfSxcblx0XHR9IGFzIElUeXBlZFBlcm1pc3Npb25SZXF1ZXN0O1xuXHRcdGNvbnN0IGRpc3BsYXkgPSBnZXRQZXJtaXNzaW9uRGlzcGxheShyZXF1ZXN0LCB3ZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3BsYXkudG9vbElucHV0LCAnZGlyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpcm1hdGlvbiB0aXRsZSByZWZsZWN0cyBzYW5kYm94IGJ5cGFzcyBmb3Igc2hlbGwgcmVxdWVzdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2FuZGJveGVkID0gZ2V0UGVybWlzc2lvbkRpc3BsYXkoe1xuXHRcdFx0a2luZDogJ3NoZWxsJyxcblx0XHRcdGZ1bGxDb21tYW5kVGV4dDogJ25wbSB0ZXN0Jyxcblx0XHR9IGFzIElUeXBlZFBlcm1pc3Npb25SZXF1ZXN0LCB3ZCk7XG5cdFx0Y29uc3QgYnlwYXNzID0gZ2V0UGVybWlzc2lvbkRpc3BsYXkoe1xuXHRcdFx0a2luZDogJ3NoZWxsJyxcblx0XHRcdGZ1bGxDb21tYW5kVGV4dDogJ25wbSB0ZXN0Jyxcblx0XHRcdHJlcXVlc3RTYW5kYm94QnlwYXNzOiB0cnVlLFxuXHRcdH0gYXMgSVR5cGVkUGVybWlzc2lvblJlcXVlc3QsIHdkKTtcblxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChieXBhc3MuY29uZmlybWF0aW9uVGl0bGUsIHNhbmRib3hlZC5jb25maXJtYXRpb25UaXRsZSk7XG5cdFx0YXNzZXJ0Lm9rKC9zYW5kYm94L2kudGVzdChieXBhc3MuY29uZmlybWF0aW9uVGl0bGUpLCBgZXhwZWN0ZWQgdGl0bGUgdG8gbWVudGlvbiB0aGUgc2FuZGJveCwgZ290OiAke2J5cGFzcy5jb25maXJtYXRpb25UaXRsZX1gKTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlybWF0aW9uIHRpdGxlIHJlZmxlY3RzIHNhbmRib3ggYnlwYXNzIGZvciBjdXN0b20tdG9vbCBzaGVsbCByZXF1ZXN0cycsICgpID0+IHtcblx0XHRjb25zdCBieXBhc3MgPSBnZXRQZXJtaXNzaW9uRGlzcGxheSh7XG5cdFx0XHRraW5kOiAnY3VzdG9tLXRvb2wnLFxuXHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdGFyZ3M6IHsgY29tbWFuZDogJ2VjaG8gaGknIH0sXG5cdFx0XHRyZXF1ZXN0U2FuZGJveEJ5cGFzczogdHJ1ZSxcblx0XHR9IGFzIElUeXBlZFBlcm1pc3Npb25SZXF1ZXN0LCB3ZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnlwYXNzLnBlcm1pc3Npb25LaW5kLCAnc2hlbGwnKTtcblx0XHRhc3NlcnQub2soL3NhbmRib3gvaS50ZXN0KGJ5cGFzcy5jb25maXJtYXRpb25UaXRsZSksIGBleHBlY3RlZCB0aXRsZSB0byBtZW50aW9uIHRoZSBzYW5kYm94LCBnb3Q6ICR7YnlwYXNzLmNvbmZpcm1hdGlvblRpdGxlfWApO1xuXHR9KTtcblxufSk7XG5cbnN1aXRlKCdnZXRQZXJtaXNzaW9uRGlzcGxheSBcdTIwMTQgcmVhZCBwZXJtaXNzaW9uIGRpc3BsYXknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndXNlcyB0aGUgdmlldy10b29sIGludm9jYXRpb24gbWVzc2FnZSBmb3IgcmVhZCBwZXJtaXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBkaXNwbGF5ID0gZ2V0UGVybWlzc2lvbkRpc3BsYXkoe1xuXHRcdFx0a2luZDogJ3JlYWQnLFxuXHRcdFx0cGF0aDogJy9Vc2Vycy9jb25ub3IvRG93bmxvYWRzL2NvbnRleHQ3LWNvcGlsb3QtZGVidWctbWFpbi5qc29uJyxcblx0XHRcdGludGVudGlvbjogJ1JlYWQgZmlsZTogL1VzZXJzL2Nvbm5vci9Eb3dubG9hZHMvY29udGV4dDctY29waWxvdC1kZWJ1Zy1tYWluLmpzb24nLFxuXHRcdH0gYXMgSVR5cGVkUGVybWlzc2lvblJlcXVlc3QsIFVSSS5maWxlKCcvcmVwby9wcm9qZWN0JykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogZGlzcGxheS5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdHRvb2xJbnB1dDogZGlzcGxheS50b29sSW5wdXQsXG5cdFx0XHRwZXJtaXNzaW9uS2luZDogZGlzcGxheS5wZXJtaXNzaW9uS2luZCxcblx0XHRcdHBlcm1pc3Npb25QYXRoOiBkaXNwbGF5LnBlcm1pc3Npb25QYXRoLFxuXHRcdH0sIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB7IG1hcmtkb3duOiAnUmVhZGluZyBbY29udGV4dDctY29waWxvdC1kZWJ1Zy1tYWluLmpzb25dKGZpbGU6Ly8vVXNlcnMvY29ubm9yL0Rvd25sb2Fkcy9jb250ZXh0Ny1jb3BpbG90LWRlYnVnLW1haW4uanNvbiknIH0sXG5cdFx0XHR0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdHBlcm1pc3Npb25LaW5kOiAncmVhZCcsXG5cdFx0XHRwZXJtaXNzaW9uUGF0aDogJy9Vc2Vycy9jb25ub3IvRG93bmxvYWRzL2NvbnRleHQ3LWNvcGlsb3QtZGVidWctbWFpbi5qc29uJyxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2dldFBlcm1pc3Npb25EaXNwbGF5IFx1MjAxNCB3cml0ZSBwZXJtaXNzaW9uIGRpc3BsYXknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZGlzdGluZ3Vpc2hlcyBjcmVhdGluZyBhIGZpbGUgZnJvbSBlZGl0aW5nIG9uZScsICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0ID0ge1xuXHRcdFx0a2luZDogJ3dyaXRlJyxcblx0XHRcdGZpbGVOYW1lOiAnL3JlcG8vcHJvamVjdC9wYWNrYWdlLmpzb24nLFxuXHRcdH0gYXMgSVR5cGVkUGVybWlzc2lvblJlcXVlc3Q7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNyZWF0ZTogZ2V0UGVybWlzc2lvbkRpc3BsYXkocmVxdWVzdCwgVVJJLmZpbGUoJy9yZXBvL3Byb2plY3QnKSwgdHJ1ZSksXG5cdFx0XHRlZGl0OiBnZXRQZXJtaXNzaW9uRGlzcGxheShyZXF1ZXN0LCBVUkkuZmlsZSgnL3JlcG8vcHJvamVjdCcpLCBmYWxzZSksXG5cdFx0fSwge1xuXHRcdFx0Y3JlYXRlOiB7XG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnQ3JlYXRlIGZpbGU/Jyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHsgbWFya2Rvd246ICdDcmVhdGluZyBbcGFja2FnZS5qc29uXShmaWxlOi8vL3JlcG8vcHJvamVjdC9wYWNrYWdlLmpzb24pJyB9LFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJwYXRoXCI6XCIvcmVwby9wcm9qZWN0L3BhY2thZ2UuanNvblwifScsXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLFxuXHRcdFx0XHRwZXJtaXNzaW9uUGF0aDogJy9yZXBvL3Byb2plY3QvcGFja2FnZS5qc29uJyxcblx0XHRcdH0sXG5cdFx0XHRlZGl0OiB7XG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnV3JpdGUgZmlsZT8nLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogeyBtYXJrZG93bjogJ0VkaXRpbmcgW3BhY2thZ2UuanNvbl0oZmlsZTovLy9yZXBvL3Byb2plY3QvcGFja2FnZS5qc29uKScgfSxcblx0XHRcdFx0dG9vbElucHV0OiAne1wicGF0aFwiOlwiL3JlcG8vcHJvamVjdC9wYWNrYWdlLmpzb25cIn0nLFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3dyaXRlJyxcblx0XHRcdFx0cGVybWlzc2lvblBhdGg6ICcvcmVwby9wcm9qZWN0L3BhY2thZ2UuanNvbicsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgndmlldyB0b29sIFx1MjAxNCB2aWV3X3JhbmdlIGRpc3BsYXknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gaW52b2NhdGlvbihwYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0SW52b2NhdGlvbk1lc3NhZ2UoJ3ZpZXcnLCAnVmlldyBGaWxlJywgcGFyYW1ldGVycyk7XG5cdFx0cmV0dXJuIHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnID8gcmVzdWx0IDogcmVzdWx0Lm1hcmtkb3duO1xuXHR9XG5cblx0ZnVuY3Rpb24gcGFzdFRlbnNlKHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRjb25zdCByZXN1bHQgPSBnZXRQYXN0VGVuc2VNZXNzYWdlKCd2aWV3JywgJ1ZpZXcgRmlsZScsIHBhcmFtZXRlcnMsIHRydWUpO1xuXHRcdHJldHVybiB0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJyA/IHJlc3VsdCA6IHJlc3VsdC5tYXJrZG93bjtcblx0fVxuXG5cdHRlc3QoJ3JlbmRlcnMgcGF0aC1vbmx5IHdoZW4gdmlld19yYW5nZSBpcyBhYnNlbnQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Lm9rKGludm9jYXRpb24oeyBwYXRoOiAnL3JlcG8vZmlsZS50cycgfSkuc3RhcnRzV2l0aCgnUmVhZGluZyBbJykpO1xuXHRcdGFzc2VydC5vayhwYXN0VGVuc2UoeyBwYXRoOiAnL3JlcG8vZmlsZS50cycgfSkuc3RhcnRzV2l0aCgnUmVhZCBbJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIFwibGluZXMgWCB0byBZXCIgZm9yIGEgdmFsaWQgdHdvLWVsZW1lbnQgcmFuZ2UnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Lm9rKGludm9jYXRpb24oeyBwYXRoOiAnL3JlcG8vZmlsZS50cycsIHZpZXdfcmFuZ2U6IFsxMCwgMjBdIH0pLmVuZHNXaXRoKCcsIGxpbmVzIDEwIHRvIDIwJykpO1xuXHRcdGFzc2VydC5vayhwYXN0VGVuc2UoeyBwYXRoOiAnL3JlcG8vZmlsZS50cycsIHZpZXdfcmFuZ2U6IFsxMCwgMjBdIH0pLmVuZHNXaXRoKCcsIGxpbmVzIDEwIHRvIDIwJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIFwibGluZSBYXCIgd2hlbiBzdGFydCA9PT0gZW5kJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayhpbnZvY2F0aW9uKHsgcGF0aDogJy9yZXBvL2ZpbGUudHMnLCB2aWV3X3JhbmdlOiBbMTAsIDEwXSB9KS5lbmRzV2l0aCgnLCBsaW5lIDEwJykpO1xuXHRcdGFzc2VydC5vayhwYXN0VGVuc2UoeyBwYXRoOiAnL3JlcG8vZmlsZS50cycsIHZpZXdfcmFuZ2U6IFsxMCwgMTBdIH0pLmVuZHNXaXRoKCcsIGxpbmUgMTAnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmRlcnMgXCJsaW5lIFggdG8gdGhlIGVuZFwiIGZvciB0aGUgLTEgRU9GIHNlbnRpbmVsJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayhpbnZvY2F0aW9uKHsgcGF0aDogJy9yZXBvL2ZpbGUudHMnLCB2aWV3X3JhbmdlOiBbMTAsIC0xXSB9KS5lbmRzV2l0aCgnLCBsaW5lIDEwIHRvIHRoZSBlbmQnKSk7XG5cdFx0YXNzZXJ0Lm9rKHBhc3RUZW5zZSh7IHBhdGg6ICcvcmVwby9maWxlLnRzJywgdmlld19yYW5nZTogWzEwLCAtMV0gfSkuZW5kc1dpdGgoJywgbGluZSAxMCB0byB0aGUgZW5kJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIHBhdGgtb25seSBmb3IgaW52YWxpZCByYW5nZXMnLCAoKSA9PiB7XG5cdFx0Ly8gZW5kIDwgc3RhcnQgKGFuZCBub3QgLTEpXG5cdFx0YXNzZXJ0Lm9rKCFpbnZvY2F0aW9uKHsgcGF0aDogJy9yZXBvL2ZpbGUudHMnLCB2aWV3X3JhbmdlOiBbMjAsIDEwXSB9KS5pbmNsdWRlcygnLCcpKTtcblx0XHQvLyBuZWdhdGl2ZSBzdGFydFxuXHRcdGFzc2VydC5vayghaW52b2NhdGlvbih7IHBhdGg6ICcvcmVwby9maWxlLnRzJywgdmlld19yYW5nZTogWy01LCAxMF0gfSkuaW5jbHVkZXMoJywnKSk7XG5cdFx0Ly8gbm9uLWludGVnZXJcblx0XHRhc3NlcnQub2soIWludm9jYXRpb24oeyBwYXRoOiAnL3JlcG8vZmlsZS50cycsIHZpZXdfcmFuZ2U6IFsxLjUsIDEwXSB9KS5pbmNsdWRlcygnLCcpKTtcblx0XHQvLyB3cm9uZyBhcml0eVxuXHRcdGFzc2VydC5vayghaW52b2NhdGlvbih7IHBhdGg6ICcvcmVwby9maWxlLnRzJywgdmlld19yYW5nZTogWzEwXSB9KS5pbmNsdWRlcygnLCcpKTtcblx0XHRhc3NlcnQub2soIWludm9jYXRpb24oeyBwYXRoOiAnL3JlcG8vZmlsZS50cycsIHZpZXdfcmFuZ2U6IFsxMCwgMjAsIDMwXSB9KS5pbmNsdWRlcygnLCcpKTtcblx0XHQvLyBub24tYXJyYXlcblx0XHRhc3NlcnQub2soIWludm9jYXRpb24oeyBwYXRoOiAnL3JlcG8vZmlsZS50cycsIHZpZXdfcmFuZ2U6ICd3aGF0ZXZlcicgfSkuaW5jbHVkZXMoJywnKSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjb3BpbG90VG9vbERpc3BsYXkgXHUyMDE0IGJ1aWx0LWluIHRvb2wgaW52b2NhdGlvbi9wYXN0LXRlbnNlIG1lc3NhZ2VzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGludm9jYXRpb24odG9vbE5hbWU6IHN0cmluZywgcGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldEludm9jYXRpb25NZXNzYWdlKHRvb2xOYW1lLCBnZXRUb29sRGlzcGxheU5hbWUodG9vbE5hbWUpLCBwYXJhbWV0ZXJzKTtcblx0XHRyZXR1cm4gdHlwZW9mIHJlc3VsdCA9PT0gJ3N0cmluZycgPyByZXN1bHQgOiByZXN1bHQubWFya2Rvd247XG5cdH1cblxuXHRmdW5jdGlvbiBwYXN0VGVuc2UodG9vbE5hbWU6IHN0cmluZywgcGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldFBhc3RUZW5zZU1lc3NhZ2UodG9vbE5hbWUsIGdldFRvb2xEaXNwbGF5TmFtZSh0b29sTmFtZSksIHBhcmFtZXRlcnMsIHRydWUpO1xuXHRcdHJldHVybiB0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJyA/IHJlc3VsdCA6IHJlc3VsdC5tYXJrZG93bjtcblx0fVxuXG5cdHRlc3QoJ2FnZW50LWNvb3JkaW5hdGlvbiB0b29scyB1c2UgYSBzaW5nbGUgbWVzc2FnZSAocGFzdCB0ZW5zZSkgZm9yIGJvdGggaW52b2NhdGlvbiBhbmQgY29tcGxldGlvbicsICgpID0+IHtcblx0XHQvLyByZWFkL3dyaXRlIGFnZW50cyBzdXJmYWNlIHRoZSBhZ2VudCBpZCwgYW5kIHRoZSBpbnZvY2F0aW9uIG1lc3NhZ2Vcblx0XHQvLyBtYXRjaGVzIHRoZSBwYXN0LXRlbnNlIG1lc3NhZ2UgKHRoZXNlIHRvb2xzIGFyZSBmYXN0KS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbigncmVhZF9hZ2VudCcsIHsgYWdlbnRfaWQ6ICdtYXRoLWhlbHBlcicgfSksICdSZWFkIGFnZW50IGBtYXRoLWhlbHBlcmAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFzdFRlbnNlKCdyZWFkX2FnZW50JywgeyBhZ2VudF9pZDogJ21hdGgtaGVscGVyJyB9KSwgJ1JlYWQgYWdlbnQgYG1hdGgtaGVscGVyYCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uKCd3cml0ZV9hZ2VudCcsIHsgYWdlbnRfaWQ6ICdtYXRoLWhlbHBlcicsIG1lc3NhZ2U6ICdoaScgfSksICdXcm90ZSB0byBhZ2VudCBgbWF0aC1oZWxwZXJgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhc3RUZW5zZSgnd3JpdGVfYWdlbnQnLCB7IGFnZW50X2lkOiAnbWF0aC1oZWxwZXInLCBtZXNzYWdlOiAnaGknIH0pLCAnV3JvdGUgdG8gYWdlbnQgYG1hdGgtaGVscGVyYCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudCB0b29scyBmYWxsIGJhY2sgdG8gYSBnZW5lcmljIHBocmFzZSB3aXRob3V0IGFuIGFnZW50IGlkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uKCdyZWFkX2FnZW50Jywge30pLCAnUmVhZCBhZ2VudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXN0VGVuc2UoJ3dyaXRlX2FnZW50JywgdW5kZWZpbmVkKSwgJ1dyb3RlIHRvIGFnZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FnZW50IHRvb2xzIGlnbm9yZSBhIG1hbGZvcm1lZCAobm9uLXN0cmluZykgYWdlbnQgaWQgaW5zdGVhZCBvZiB0aHJvd2luZycsICgpID0+IHtcblx0XHQvLyBhZ2VudF9pZCBjb21lcyBmcm9tIHVudHJ1c3RlZCBKU09OLCBzbyBhIG5vbi1zdHJpbmcgbXVzdCBub3QgcmVhY2ggdGhlXG5cdFx0Ly8gbWFya2Rvd24gaW5saW5lLWNvZGUgZm9ybWF0dGVyICh3aGljaCB3b3VsZCB0aHJvdykuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24oJ3JlYWRfYWdlbnQnLCB7IGFnZW50X2lkOiAxMjMgfSksICdSZWFkIGFnZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhc3RUZW5zZSgnd3JpdGVfYWdlbnQnLCB7IGFnZW50X2lkOiAnJyB9KSwgJ1dyb3RlIHRvIGFnZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpc3RfYWdlbnRzIHNoYXJlcyBvbmUgbWVzc2FnZTsgdGFzayBrZWVwcyBkaXN0aW5jdCBwcmVzZW50L3Bhc3QgcGhyYXNlcycsICgpID0+IHtcblx0XHQvLyBsaXN0X2FnZW50cyBpcyBhIGZhc3QgYWdlbnQtY29vcmRpbmF0aW9uIHRvb2w6IG9uZSBtZXNzYWdlLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uKCdsaXN0X2FnZW50cycsIHt9KSwgJ0xpc3RlZCBhZ2VudHMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFzdFRlbnNlKCdsaXN0X2FnZW50cycsIHt9KSwgJ0xpc3RlZCBhZ2VudHMnKTtcblx0XHQvLyB0YXNrIGRlbGVnYXRlcyB0byBhIChwb3NzaWJseSBzbG93KSBzdWJhZ2VudCwgc28gaXQga2VlcHMgYSBwcmVzZW50LXRlbnNlIGludm9jYXRpb24uXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24oJ3Rhc2snLCB7fSksICdEZWxlZ2F0aW5nIHRhc2snKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFzdFRlbnNlKCd0YXNrJywge30pLCAnRGVsZWdhdGVkIHRhc2snKTtcblx0fSk7XG5cblx0dGVzdCgndW5oYW5kbGVkIHRvb2xzIGZhbGwgYmFjayB0byBqdXN0IHRoZSBkaXNwbGF5IG5hbWUnLCAoKSA9PiB7XG5cdFx0Ly8gS25vd24gdG9vbCB3aXRoIG5vIHRhaWxvcmVkIG1lc3NhZ2U6IHVzZXMgaXRzIGZyaWVuZGx5IGRpc3BsYXkgbmFtZS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbignc3RvcmVfbWVtb3J5Jywge30pLCAnU3RvcmUgTWVtb3J5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhc3RUZW5zZSgnc3RvcmVfbWVtb3J5Jywge30pLCAnU3RvcmUgTWVtb3J5Jyk7XG5cdFx0Ly8gVW5rbm93biB0b29sOiBkaXNwbGF5IG5hbWUgaXMgdGhlIHJhdyB0b29sIG5hbWUuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24oJ3NvbWVfbmV3X3Rvb2wnLCB7fSksICdzb21lX25ld190b29sJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhc3RUZW5zZSgnc29tZV9uZXdfdG9vbCcsIHt9KSwgJ3NvbWVfbmV3X3Rvb2wnKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NvcGlsb3RUb29sRGlzcGxheSBcdTIwMTQgc3RyZWFtaW5nIGVkaXQgbWVzc2FnZXMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gc3RyZWFtaW5nKHRvb2xOYW1lOiBzdHJpbmcsIHBhcmFtZXRlcnM6IHVua25vd24sIHJlc29sdmVQYXRoPzogKHBhdGg6IHN0cmluZykgPT4gc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCByZXN1bHQgPSBnZXRTdHJlYW1pbmdJbnZvY2F0aW9uTWVzc2FnZSh0b29sTmFtZSwgZ2V0VG9vbERpc3BsYXlOYW1lKHRvb2xOYW1lKSwgcGFyYW1ldGVycywgcmVzb2x2ZVBhdGgpO1xuXHRcdHJldHVybiB0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJyA/IHJlc3VsdCA6IHJlc3VsdC5tYXJrZG93bjtcblx0fVxuXG5cdGZ1bmN0aW9uIGludm9jYXRpb24odG9vbE5hbWU6IHN0cmluZywgcGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBzdHJpbmcge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldEludm9jYXRpb25NZXNzYWdlKHRvb2xOYW1lLCBnZXRUb29sRGlzcGxheU5hbWUodG9vbE5hbWUpLCBwYXJhbWV0ZXJzKTtcblx0XHRyZXR1cm4gdHlwZW9mIHJlc3VsdCA9PT0gJ3N0cmluZycgPyByZXN1bHQgOiByZXN1bHQubWFya2Rvd247XG5cdH1cblxuXHRmdW5jdGlvbiBjb21wbGV0ZWQodG9vbE5hbWU6IHN0cmluZywgcGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBzdHJpbmcge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldFBhc3RUZW5zZU1lc3NhZ2UodG9vbE5hbWUsIGdldFRvb2xEaXNwbGF5TmFtZSh0b29sTmFtZSksIHBhcmFtZXRlcnMsIHRydWUpO1xuXHRcdHJldHVybiB0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJyA/IHJlc3VsdCA6IHJlc3VsdC5tYXJrZG93bjtcblx0fVxuXG5cdHRlc3QoJ3N0cmVhbXMgcmVwbGFjZW1lbnQgbGluZSBjb3VudHMgYW5kIHRoZSB0YXJnZXQgZmlsZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHN0cmVhbWluZygnZWRpdCcsIHsgcGF0aDogJy9yZXBvL2ZpbGUudHMnIH0pLFxuXHRcdFx0c3RyZWFtaW5nKCdlZGl0JywgeyBwYXRoOiAnL3JlcG8vZmlsZS50cycsIG9sZF9zdHI6ICdvbmVcXG50d28nIH0pLFxuXHRcdFx0c3RyZWFtaW5nKCdlZGl0JywgeyBwYXRoOiAnL3JlcG8vZmlsZS50cycsIG9sZF9zdHI6ICdvbmVcXG50d28nLCBuZXdfc3RyOiAnb25lXFxudXBkYXRlZFxcbnRocmVlJyB9KSxcblx0XHRdLCBbXG5cdFx0XHQnRWRpdGluZyBbZmlsZS50c10oZmlsZTovLy9yZXBvL2ZpbGUudHMpJyxcblx0XHRcdCdSZXBsYWNpbmcgMiBsaW5lcyBpbiBbZmlsZS50c10oZmlsZTovLy9yZXBvL2ZpbGUudHMpJyxcblx0XHRcdCdSZXBsYWNpbmcgMiBsaW5lcyB3aXRoIDMgbGluZXMgaW4gW2ZpbGUudHNdKGZpbGU6Ly8vcmVwby9maWxlLnRzKScsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmVhbXMgY3JlYXRlIGFuZCBpbnNlcnQgbGluZSBjb3VudHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRzdHJlYW1pbmcoJ2NyZWF0ZScsIHsgcGF0aDogJy9yZXBvL25ldy50cycsIGZpbGVfdGV4dDogJ29uZVxcclxcbnR3b1xcclxcbnRocmVlJyB9KSxcblx0XHRcdHN0cmVhbWluZygnaW5zZXJ0JywgeyBwYXRoOiAnL3JlcG8vZmlsZS50cycsIG5ld19zdHI6ICdvbmVcXHJ0d28nIH0pLFxuXHRcdF0sIFtcblx0XHRcdCdDcmVhdGluZyBbbmV3LnRzXShmaWxlOi8vL3JlcG8vbmV3LnRzKSAoMyBsaW5lcyknLFxuXHRcdFx0J0luc2VydGluZyAyIGxpbmVzIGluIFtmaWxlLnRzXShmaWxlOi8vL3JlcG8vZmlsZS50cyknLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHRoZSBzdHJfcmVwbGFjZV9lZGl0b3IgY29tbWFuZCBzaGFwZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHN0cmVhbWluZygnc3RyX3JlcGxhY2VfZWRpdG9yJywgeyBjb21tYW5kOiAnY3JlYXRlJywgcGF0aDogJy9yZXBvL25ldy50cycsIGZpbGVfdGV4dDogJ29uZVxcbnR3bycgfSksXG5cdFx0XHRzdHJlYW1pbmcoJ3N0cl9yZXBsYWNlX2VkaXRvcicsIHsgY29tbWFuZDogJ3N0cl9yZXBsYWNlJywgcGF0aDogJy9yZXBvL2ZpbGUudHMnLCBvbGRfc3RyOiAnb2xkJywgbmV3X3N0cjogJ25ld1xcbnZhbHVlJyB9KSxcblx0XHRcdHN0cmVhbWluZygnc3RyX3JlcGxhY2VfZWRpdG9yJywgeyBjb21tYW5kOiAndmlldycsIHBhdGg6ICcvcmVwby9maWxlLnRzJyB9KSxcblx0XHRdLCBbXG5cdFx0XHQnQ3JlYXRpbmcgW25ldy50c10oZmlsZTovLy9yZXBvL25ldy50cykgKDIgbGluZXMpJyxcblx0XHRcdCdSZXBsYWNpbmcgMSBsaW5lIHdpdGggMiBsaW5lcyBpbiBbZmlsZS50c10oZmlsZTovLy9yZXBvL2ZpbGUudHMpJyxcblx0XHRcdCdSZWFkaW5nIFtmaWxlLnRzXShmaWxlOi8vL3JlcG8vZmlsZS50cyknLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgZmlsZSBjb250ZXh0IGFmdGVyIHN0cmVhbWluZyBhbGlhc2VzIGJlY29tZSByZWFkeSBhbmQgY29tcGxldGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2FzZXM6IEFycmF5PFt0b29sTmFtZTogc3RyaW5nLCBwYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgcmVhZHk6IHN0cmluZywgY29tcGxldGU6IHN0cmluZ10+ID0gW1xuXHRcdFx0WydzdHJfcmVwbGFjZScsIHsgcGF0aDogJy9yZXBvL2ZpbGUudHMnIH0sICdFZGl0aW5nIFtmaWxlLnRzXShmaWxlOi8vL3JlcG8vZmlsZS50cyknLCAnRWRpdGVkIFtmaWxlLnRzXShmaWxlOi8vL3JlcG8vZmlsZS50cyknXSxcblx0XHRcdFsnaW5zZXJ0JywgeyBwYXRoOiAnL3JlcG8vZmlsZS50cycgfSwgJ0luc2VydGluZyB0ZXh0IGluIFtmaWxlLnRzXShmaWxlOi8vL3JlcG8vZmlsZS50cyknLCAnSW5zZXJ0ZWQgdGV4dCBpbiBbZmlsZS50c10oZmlsZTovLy9yZXBvL2ZpbGUudHMpJ10sXG5cdFx0XHRbJ3N0cl9yZXBsYWNlX2VkaXRvcicsIHsgY29tbWFuZDogJ2NyZWF0ZScsIHBhdGg6ICcvcmVwby9uZXcudHMnIH0sICdDcmVhdGluZyBbbmV3LnRzXShmaWxlOi8vL3JlcG8vbmV3LnRzKScsICdDcmVhdGVkIFtuZXcudHNdKGZpbGU6Ly8vcmVwby9uZXcudHMpJ10sXG5cdFx0XHRbJ3N0cl9yZXBsYWNlX2VkaXRvcicsIHsgY29tbWFuZDogJ3N0cl9yZXBsYWNlJywgcGF0aDogJy9yZXBvL2ZpbGUudHMnIH0sICdFZGl0aW5nIFtmaWxlLnRzXShmaWxlOi8vL3JlcG8vZmlsZS50cyknLCAnRWRpdGVkIFtmaWxlLnRzXShmaWxlOi8vL3JlcG8vZmlsZS50cyknXSxcblx0XHRdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FzZXMubWFwKChbdG9vbE5hbWUsIHBhcmFtZXRlcnNdKSA9PiAoe1xuXHRcdFx0cmVhZHk6IGludm9jYXRpb24odG9vbE5hbWUsIHBhcmFtZXRlcnMpLFxuXHRcdFx0Y29tcGxldGU6IGNvbXBsZXRlZCh0b29sTmFtZSwgcGFyYW1ldGVycyksXG5cdFx0fSkpLCBjYXNlcy5tYXAoKFssICwgcmVhZHksIGNvbXBsZXRlXSkgPT4gKHsgcmVhZHksIGNvbXBsZXRlIH0pKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmVhbXMgcmF3IHBhdGNoIGxpbmUgY291bnRzIGFuZCByZXNvbHZlcyBkaXNjb3ZlcmVkIGZpbGUgcGF0aHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGF0Y2ggPSBbXG5cdFx0XHQnKioqIEJlZ2luIFBhdGNoJyxcblx0XHRcdCcqKiogVXBkYXRlIEZpbGU6IHNyYy9maWxlLnRzJyxcblx0XHRcdCdAQCcsXG5cdFx0XHQnLW9sZCcsXG5cdFx0XHQnK25ldycsXG5cdFx0XHQnKioqIEVuZCBQYXRjaCcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJlYW1pbmcoJ2FwcGx5X3BhdGNoJywgcGF0Y2gsIHBhdGggPT4gYC93b3Jrc3BhY2UvJHtwYXRofWApLFxuXHRcdFx0J0dlbmVyYXRpbmcgcGF0Y2ggKDYgbGluZXMpIGluIFtmaWxlLnRzXShmaWxlOi8vL3dvcmtzcGFjZS9zcmMvZmlsZS50cyknLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgbWFsZm9ybWVkIHBhcnRpYWwgcGF0aHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyZWFtaW5nKCdlZGl0JywgeyBwYXRoOiA0Miwgb2xkX3N0cjogJ29uZScgfSksXG5cdFx0XHQnUmVwbGFjaW5nIDEgbGluZScsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgbm9ybWFsIGludm9jYXRpb24gZm9ybWF0dGVyIGZvciBub24tZWRpdCB0b29scycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJlYW1pbmcoJ2Jhc2gnLCB7IGNvbW1hbmQ6ICducG0gdGVzdCcgfSksXG5cdFx0XHQnUnVubmluZyBgbnBtIHRlc3RgJyxcblx0XHQpO1xuXHR9KTtcbn0pO1xuXG4vLyAtLS0tIHdyaXRlXy9yZWFkXyBzaGVsbCB0b29sIGRpc3BsYXkgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vL1xuLy8gQ292ZXJhZ2UgZm9yIHRoZSBzZWNvbmRhcnkgc2hlbGwgaGVscGVycyAod3JpdGVfYmFzaCwgcmVhZF9iYXNoLCBhbmQgdGhlaXJcbi8vIHBvd2Vyc2hlbGwgc2libGluZ3MpLiBUaGVzZSBuZXZlciBhcHBlYXIgaW4gYSBwZXJtaXNzaW9uIGRpYWxvZyAodGhleSdyZVxuLy8gcmVnaXN0ZXJlZCB3aXRoIGBza2lwUGVybWlzc2lvbjogdHJ1ZWAgXHUyMDE0IHNlZSBjb3BpbG90U2hlbGxUb29scy50cyksIGJ1dCB0aGV5XG4vLyBzdGlsbCBmbG93IHRocm91Z2ggdGhlIHRvb2wtZXhlY3V0aW9uIGRpc3BsYXkgcGlwZWxpbmUuXG5cbnN1aXRlKCdjb3BpbG90VG9vbERpc3BsYXkgXHUyMDE0IHdyaXRlXy9yZWFkXyBzaGVsbCB0b29scycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnZ2V0VG9vbEtpbmQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRlcm1pbmFsIGZvciBiYXNoJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xLaW5kKCdiYXNoJyksICd0ZXJtaW5hbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB0ZXJtaW5hbCBmb3IgcG93ZXJzaGVsbCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sS2luZCgncG93ZXJzaGVsbCcpLCAndGVybWluYWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB3cml0ZV9iYXNoIChzZW5kaW5nIGlucHV0IHRvIGEgcnVubmluZyBwcm9ncmFtLCBub3QgbGF1bmNoaW5nIGEgdGVybWluYWwpJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xLaW5kKCd3cml0ZV9iYXNoJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3Igd3JpdGVfcG93ZXJzaGVsbCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sS2luZCgnd3JpdGVfcG93ZXJzaGVsbCcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHJlYWRfYmFzaCAocmVhZGluZyBvdXRwdXQsIG5vdCBsYXVuY2hpbmcgYSB0ZXJtaW5hbCknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbEtpbmQoJ3JlYWRfYmFzaCcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHJlYWRfcG93ZXJzaGVsbCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sS2luZCgncmVhZF9wb3dlcnNoZWxsJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHN1YmFnZW50IGZvciB0YXNrJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xLaW5kKCd0YXNrJyksICdzdWJhZ2VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHZpZXcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbEtpbmQoJ3ZpZXcnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgc2VhcmNoIGZvciBnbG9iJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xLaW5kKCdnbG9iJyksICdzZWFyY2gnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldFNoZWxsTGFuZ3VhZ2UnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdiYXNoIHJldHVybnMgc2hlbGxzY3JpcHQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2hlbGxMYW5ndWFnZSgnYmFzaCcpLCAnc2hlbGxzY3JpcHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Bvd2Vyc2hlbGwgcmV0dXJucyBwb3dlcnNoZWxsJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNoZWxsTGFuZ3VhZ2UoJ3Bvd2Vyc2hlbGwnKSwgJ3Bvd2Vyc2hlbGwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyaXRlX2Jhc2ggcmV0dXJucyBzaGVsbHNjcmlwdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTaGVsbExhbmd1YWdlKCd3cml0ZV9iYXNoJyksICdzaGVsbHNjcmlwdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGVfcG93ZXJzaGVsbCByZXR1cm5zIHBvd2Vyc2hlbGwnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2hlbGxMYW5ndWFnZSgnd3JpdGVfcG93ZXJzaGVsbCcpLCAncG93ZXJzaGVsbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZF9iYXNoIHJldHVybnMgc2hlbGxzY3JpcHQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2hlbGxMYW5ndWFnZSgncmVhZF9iYXNoJyksICdzaGVsbHNjcmlwdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZF9wb3dlcnNoZWxsIHJldHVybnMgcG93ZXJzaGVsbCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTaGVsbExhbmd1YWdlKCdyZWFkX3Bvd2Vyc2hlbGwnKSwgJ3Bvd2Vyc2hlbGwnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldEludm9jYXRpb25NZXNzYWdlJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gZ2V0VGV4dChtc2c6IFJldHVyblR5cGU8dHlwZW9mIGdldEludm9jYXRpb25NZXNzYWdlPik6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gdHlwZW9mIG1zZyA9PT0gJ3N0cmluZycgPyBtc2cgOiBtc2cubWFya2Rvd247XG5cdFx0fVxuXG5cdFx0dGVzdCgnd3JpdGVfYmFzaCB3aXRoIGNvbW1hbmQgaW5jbHVkZXMgdGhlIGNvbW1hbmQgdGV4dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1zZyA9IGdldEludm9jYXRpb25NZXNzYWdlKCd3cml0ZV9iYXNoJywgJ1dyaXRlIFNoZWxsIElucHV0JywgeyBjb21tYW5kOiAnZWNobyBoZWxsbycgfSk7XG5cdFx0XHRhc3NlcnQub2soZ2V0VGV4dChtc2cpLmluY2x1ZGVzKCdlY2hvIGhlbGxvJyksIGBleHBlY3RlZCAnZWNobyBoZWxsbycgaW46ICR7Z2V0VGV4dChtc2cpfWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGVfYmFzaCB3aXRob3V0IGNvbW1hbmQgcmV0dXJucyBhIG5vbi1lbXB0eSBmYWxsYmFjayBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbXNnID0gZ2V0SW52b2NhdGlvbk1lc3NhZ2UoJ3dyaXRlX2Jhc2gnLCAnV3JpdGUgU2hlbGwgSW5wdXQnLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHQobXNnKS5sZW5ndGggPiAwKTtcblx0XHRcdGFzc2VydC5vayghZ2V0VGV4dChtc2cpLmluY2x1ZGVzKCd1bmRlZmluZWQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3cml0ZV9wb3dlcnNoZWxsIHdpdGggY29tbWFuZCBpbmNsdWRlcyB0aGUgY29tbWFuZCB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbXNnID0gZ2V0SW52b2NhdGlvbk1lc3NhZ2UoJ3dyaXRlX3Bvd2Vyc2hlbGwnLCAnV3JpdGUgU2hlbGwgSW5wdXQnLCB7IGNvbW1hbmQ6ICdHZXQtRGF0ZScgfSk7XG5cdFx0XHRhc3NlcnQub2soZ2V0VGV4dChtc2cpLmluY2x1ZGVzKCdHZXQtRGF0ZScpLCBgZXhwZWN0ZWQgJ0dldC1EYXRlJyBpbjogJHtnZXRUZXh0KG1zZyl9YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkX2Jhc2ggcmV0dXJucyBhIG5vbi1lbXB0eSBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbXNnID0gZ2V0SW52b2NhdGlvbk1lc3NhZ2UoJ3JlYWRfYmFzaCcsICdSZWFkIFNoZWxsIE91dHB1dCcsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGV4dChtc2cpLCAnUmVhZGluZyBUZXJtaW5hbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZF9wb3dlcnNoZWxsIHJldHVybnMgYSBub24tZW1wdHkgbWVzc2FnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1zZyA9IGdldEludm9jYXRpb25NZXNzYWdlKCdyZWFkX3Bvd2Vyc2hlbGwnLCAnUmVhZCBTaGVsbCBPdXRwdXQnLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRleHQobXNnKSwgJ1JlYWRpbmcgVGVybWluYWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyaXRlX2Jhc2ggbWVzc2FnZSBkaWZmZXJzIGZyb20gYmFzaCBtZXNzYWdlIChkaXN0aW5jdCB3b3JkaW5nKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHdyaXRlQmFzaE1zZyA9IGdldFRleHQoZ2V0SW52b2NhdGlvbk1lc3NhZ2UoJ3dyaXRlX2Jhc2gnLCAnV3JpdGUgU2hlbGwgSW5wdXQnLCB7IGNvbW1hbmQ6ICdlY2hvIGhpJyB9KSk7XG5cdFx0XHRjb25zdCBiYXNoTXNnID0gZ2V0VGV4dChnZXRJbnZvY2F0aW9uTWVzc2FnZSgnYmFzaCcsICdCYXNoJywgeyBjb21tYW5kOiAnZWNobyBoaScgfSkpO1xuXHRcdFx0Ly8gQm90aCBpbmNsdWRlIHRoZSBjb21tYW5kLCBidXQgdGhlIHN1cnJvdW5kaW5nIHRleHQgc2hvdWxkIGRpZmZlclxuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHdyaXRlQmFzaE1zZywgYmFzaE1zZyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRQYXN0VGVuc2VNZXNzYWdlJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gZ2V0VGV4dChtc2c6IFJldHVyblR5cGU8dHlwZW9mIGdldFBhc3RUZW5zZU1lc3NhZ2U+KTogc3RyaW5nIHtcblx0XHRcdHJldHVybiB0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IG1zZy5tYXJrZG93bjtcblx0XHR9XG5cblx0XHR0ZXN0KCd3cml0ZV9iYXNoIHdpdGggY29tbWFuZCBpbmNsdWRlcyB0aGUgY29tbWFuZCB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbXNnID0gZ2V0UGFzdFRlbnNlTWVzc2FnZSgnd3JpdGVfYmFzaCcsICdXcml0ZSBTaGVsbCBJbnB1dCcsIHsgY29tbWFuZDogJ2VjaG8gaGVsbG8nIH0sIHRydWUpO1xuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHQobXNnKS5pbmNsdWRlcygnZWNobyBoZWxsbycpLCBgZXhwZWN0ZWQgJ2VjaG8gaGVsbG8nIGluOiAke2dldFRleHQobXNnKX1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyaXRlX2Jhc2ggd2l0aG91dCBjb21tYW5kIHJldHVybnMgYSBub24tZW1wdHkgZmFsbGJhY2sgbWVzc2FnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1zZyA9IGdldFBhc3RUZW5zZU1lc3NhZ2UoJ3dyaXRlX2Jhc2gnLCAnV3JpdGUgU2hlbGwgSW5wdXQnLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHQobXNnKS5sZW5ndGggPiAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyaXRlX3Bvd2Vyc2hlbGwgd2l0aCBjb21tYW5kIGluY2x1ZGVzIHRoZSBjb21tYW5kIHRleHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtc2cgPSBnZXRQYXN0VGVuc2VNZXNzYWdlKCd3cml0ZV9wb3dlcnNoZWxsJywgJ1dyaXRlIFNoZWxsIElucHV0JywgeyBjb21tYW5kOiAnR2V0LURhdGUnIH0sIHRydWUpO1xuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHQobXNnKS5pbmNsdWRlcygnR2V0LURhdGUnKSwgYGV4cGVjdGVkICdHZXQtRGF0ZScgaW46ICR7Z2V0VGV4dChtc2cpfWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZF9iYXNoIHN1Y2Nlc3MgcmV0dXJucyBhIG5vbi1lbXB0eSBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbXNnID0gZ2V0UGFzdFRlbnNlTWVzc2FnZSgncmVhZF9iYXNoJywgJ1JlYWQgU2hlbGwgT3V0cHV0JywgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUZXh0KG1zZyksICdSZWFkIFRlcm1pbmFsJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3cml0ZV9iYXNoIGZhaWx1cmUgcmV0dXJucyBhIG5vbi1lbXB0eSBlcnJvciBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbXNnID0gZ2V0UGFzdFRlbnNlTWVzc2FnZSgnd3JpdGVfYmFzaCcsICdXcml0ZSBTaGVsbCBJbnB1dCcsIHsgY29tbWFuZDogJ2VjaG8gaGVsbG8nIH0sIGZhbHNlKTtcblx0XHRcdGFzc2VydC5vayhnZXRUZXh0KG1zZykubGVuZ3RoID4gMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmZWVkYmFjayBjb21tZW50IHRvb2xzIChkZWxlZ2F0ZWQgdG8gdGhlIHNoYXJlZCBzZXJ2ZXItdG9vbCBncm91cCknLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiB0ZXh0KG1zZzogUmV0dXJuVHlwZTx0eXBlb2YgZ2V0SW52b2NhdGlvbk1lc3NhZ2U+IHwgUmV0dXJuVHlwZTx0eXBlb2YgZ2V0UGFzdFRlbnNlTWVzc2FnZT4pOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuIHR5cGVvZiBtc2cgPT09ICdzdHJpbmcnID8gbXNnIDogbXNnLm1hcmtkb3duO1xuXHRcdH1cblxuXHRcdC8vIEV4aGF1c3RpdmUgcGVyLXRvb2wvY291bnQgY292ZXJhZ2UgbGl2ZXMgaW4gc2VydmVyVG9vbEdyb3Vwcy50ZXN0LnRzLlxuXHRcdC8vIFRoZXNlIHNtb2tlIGNoZWNrcyBvbmx5IGFzc2VydCB0aGF0IHRoZSBDb3BpbG90IGRpc3BsYXkgZnVuY3Rpb25zXG5cdFx0Ly8gZGVsZWdhdGUgdG8gdGhlIHNoYXJlZCBncm91cCBpbnN0ZWFkIG9mIGZhbGxpbmcgdGhyb3VnaCB0byB0aGVcblx0XHQvLyBnZW5lcmljIGBVc2luZy9Vc2VkIFwiPHRvb2w+XCJgIGZhbGxiYWNrLlxuXHRcdHRlc3QoJ0NvcGlsb3QgZGlzcGxheSBkZWxlZ2F0ZXMgdG8gdGhlIHNoYXJlZCBncm91cCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGxpc3RSZXN1bHQgPSBKU09OLnN0cmluZ2lmeSh7IGNvbW1lbnRzOiBbeyBpZDogJ2EnIH0sIHsgaWQ6ICdiJyB9XSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRkaXNwbGF5TmFtZTogZ2V0VG9vbERpc3BsYXlOYW1lKCdsaXN0Q29tbWVudHMnKSxcblx0XHRcdFx0aW52b2tlOiB0ZXh0KGdldEludm9jYXRpb25NZXNzYWdlKCdsaXN0Q29tbWVudHMnLCAnTGlzdCBDb21tZW50cycsIHVuZGVmaW5lZCkpLFxuXHRcdFx0XHRwYXN0OiB0ZXh0KGdldFBhc3RUZW5zZU1lc3NhZ2UoJ2xpc3RDb21tZW50cycsICdMaXN0IENvbW1lbnRzJywgdW5kZWZpbmVkLCB0cnVlLCBsaXN0UmVzdWx0KSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnTGlzdCBDb21tZW50cycsXG5cdFx0XHRcdGludm9rZTogJ0NoZWNraW5nIGNvbW1lbnRzJyxcblx0XHRcdFx0cGFzdDogJ0NoZWNrZWQgMiBjb21tZW50cycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhaWxlZCBmZWVkYmFjayB0b29sIHN0aWxsIHVzZXMgdGhlIGdlbmVyaWMgZmFpbHVyZSBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHQoZ2V0UGFzdFRlbnNlTWVzc2FnZSgnbGlzdENvbW1lbnRzJywgJ0xpc3QgQ29tbWVudHMnLCB1bmRlZmluZWQsIGZhbHNlKSksICdcIkxpc3QgQ29tbWVudHNcIiBmYWlsZWQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldFRvb2xJbnB1dFN0cmluZycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3dyaXRlX2Jhc2ggZXh0cmFjdHMgY29tbWFuZCBmaWVsZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sSW5wdXRTdHJpbmcoJ3dyaXRlX2Jhc2gnLCB7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyB9LCB1bmRlZmluZWQpLCAnZWNobyBoZWxsbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGVfcG93ZXJzaGVsbCBleHRyYWN0cyBjb21tYW5kIGZpZWxkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xJbnB1dFN0cmluZygnd3JpdGVfcG93ZXJzaGVsbCcsIHsgY29tbWFuZDogJ0dldC1EYXRlJyB9LCB1bmRlZmluZWQpLCAnR2V0LURhdGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyaXRlX2Jhc2ggZmFsbHMgYmFjayB0byByYXdBcmd1bWVudHMgd2hlbiBubyBjb21tYW5kIGZpZWxkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xJbnB1dFN0cmluZygnd3JpdGVfYmFzaCcsIHt9LCAne1wiY29tbWFuZFwiOlwiZWNobyBoZWxsb1wifScpLCAne1wiY29tbWFuZFwiOlwiZWNobyBoZWxsb1wifScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGVfYmFzaCByZXR1cm5zIHVuZGVmaW5lZCB3aGVuIGJvdGggcGFyYW1ldGVycyBhbmQgcmF3QXJndW1lbnRzIGFyZSBhYnNlbnQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbElucHV0U3RyaW5nKCd3cml0ZV9iYXNoJywgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZF9iYXNoIHdpdGggbm8gcGFyYW1ldGVycyByZXR1cm5zIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sSW5wdXRTdHJpbmcoJ3JlYWRfYmFzaCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3NraWxsIGV2ZW50cycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdoaWRlcyB0aGUgcmF3IGBza2lsbGAgdG9vbCBjYWxsIGFuZCBzeW50aGVzaXplcyBhIHRvb2wtc3RhcnQvY29tcGxldGUgcGFpciBmcm9tIGBza2lsbC5pbnZva2VkYCcsICgpID0+IHtcblx0XHRjb25zdCB3aXRoUGF0aCA9IHN5bnRoZXNpemVTa2lsbFRvb2xDYWxsKFxuXHRcdFx0eyBuYW1lOiAncGxhbicsIHBhdGg6ICcvYWJzL3JlcG8vc2tpbGxzL3BsYW4vU0tJTEwubWQnIH0sXG5cdFx0XHQnZXZ0LTEyMycsXG5cdFx0KTtcblx0XHRjb25zdCBub1BhdGggPSBzeW50aGVzaXplU2tpbGxUb29sQ2FsbChcblx0XHRcdHsgbmFtZTogJ3BsYW4nIH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2tpbGxJc0hpZGRlbjogaXNIaWRkZW5Ub29sKCdza2lsbCcpLFxuXHRcdFx0d2l0aFBhdGhUb29sQ2FsbElkOiB3aXRoUGF0aC50b29sQ2FsbElkLFxuXHRcdFx0d2l0aFBhdGhUb29sTmFtZTogd2l0aFBhdGgudG9vbE5hbWUsXG5cdFx0XHR3aXRoUGF0aERpc3BsYXlOYW1lOiB3aXRoUGF0aC5kaXNwbGF5TmFtZSxcblx0XHRcdHdpdGhQYXRoSW52b2NhdGlvbjogd2l0aFBhdGguaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHR3aXRoUGF0aFBhc3RUZW5zZTogd2l0aFBhdGgucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdG5vUGF0aFRvb2xDYWxsSWQ6IG5vUGF0aC50b29sQ2FsbElkLFxuXHRcdFx0bm9QYXRoSW52b2NhdGlvbjogbm9QYXRoLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0bm9QYXRoUGFzdFRlbnNlOiBub1BhdGgucGFzdFRlbnNlTWVzc2FnZSxcblx0XHR9LCB7XG5cdFx0XHRza2lsbElzSGlkZGVuOiB0cnVlLFxuXHRcdFx0d2l0aFBhdGhUb29sQ2FsbElkOiAnc3ludGgtc2tpbGwtZXZ0LTEyMycsXG5cdFx0XHR3aXRoUGF0aFRvb2xOYW1lOiAnc2tpbGwnLFxuXHRcdFx0d2l0aFBhdGhEaXNwbGF5TmFtZTogJ1JlYWQgU2tpbGwnLFxuXHRcdFx0d2l0aFBhdGhJbnZvY2F0aW9uOiB7IG1hcmtkb3duOiAnUmVhZGluZyBza2lsbCBbcGxhbl0oZmlsZTovLy9hYnMvcmVwby9za2lsbHMvcGxhbi9TS0lMTC5tZCknIH0sXG5cdFx0XHR3aXRoUGF0aFBhc3RUZW5zZTogeyBtYXJrZG93bjogJ1JlYWQgc2tpbGwgW3BsYW5dKGZpbGU6Ly8vYWJzL3JlcG8vc2tpbGxzL3BsYW4vU0tJTEwubWQpJyB9LFxuXHRcdFx0bm9QYXRoVG9vbENhbGxJZDogJ3N5bnRoLXNraWxsLTIxMDhkNjUyJyxcblx0XHRcdG5vUGF0aEludm9jYXRpb246ICdSZWFkaW5nIHNraWxsIHBsYW4nLFxuXHRcdFx0bm9QYXRoUGFzdFRlbnNlOiAnUmVhZCBza2lsbCBwbGFuJyxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3JnIC8gZ3JlcCBzZWFyY2ggdG9vbCBkaXNwbGF5JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHRleHQobXNnOiBSZXR1cm5UeXBlPHR5cGVvZiBnZXRJbnZvY2F0aW9uTWVzc2FnZT4pOiBzdHJpbmcge1xuXHRcdHJldHVybiB0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IG1zZy5tYXJrZG93bjtcblx0fVxuXG5cdHRlc3QoJ3JnIGludm9jYXRpb24vcGFzdCB0ZW5zZSB1c2UgXCJTZWFyY2hpbmcgZm9yIHtwYXR0ZXJufVwiIHdvcmRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52ID0gdGV4dChnZXRJbnZvY2F0aW9uTWVzc2FnZSgncmcnLCAnU2VhcmNoJywgeyBwYXR0ZXJuOiAnZm9vJyB9KSk7XG5cdFx0Y29uc3QgcGFzdCA9IHRleHQoZ2V0UGFzdFRlbnNlTWVzc2FnZSgncmcnLCAnU2VhcmNoJywgeyBwYXR0ZXJuOiAnZm9vJyB9LCB0cnVlKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGludiwgcGFzdCB9LCB7XG5cdFx0XHRpbnY6ICdTZWFyY2hpbmcgZm9yIGBmb29gJyxcblx0XHRcdHBhc3Q6ICdTZWFyY2hlZCBmb3IgYGZvb2AnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZyB3aXRob3V0IGEgcGF0dGVybiBmYWxscyBiYWNrIHRvIGEgZ2VuZXJpYyBzZWFyY2ggbWVzc2FnZSAobm90IHRoZSByYXcgdG9vbCBuYW1lKScsICgpID0+IHtcblx0XHRjb25zdCBpbnYgPSB0ZXh0KGdldEludm9jYXRpb25NZXNzYWdlKCdyZycsICdTZWFyY2gnLCB1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52LCAnU2VhcmNoaW5nIGZpbGVzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dyZXAga2VlcHMgXCJTZWFyY2hpbmcgZm9yIHtwYXR0ZXJufVwiIHdvcmRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52ID0gdGV4dChnZXRJbnZvY2F0aW9uTWVzc2FnZSgnZ3JlcCcsICdTZWFyY2gnLCB7IHBhdHRlcm46ICdiYXInIH0pKTtcblx0XHRjb25zdCBwYXN0ID0gdGV4dChnZXRQYXN0VGVuc2VNZXNzYWdlKCdncmVwJywgJ1NlYXJjaCcsIHsgcGF0dGVybjogJ2JhcicgfSwgdHJ1ZSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBpbnYsIHBhc3QgfSwge1xuXHRcdFx0aW52OiAnU2VhcmNoaW5nIGZvciBgYmFyYCcsXG5cdFx0XHRwYXN0OiAnU2VhcmNoZWQgZm9yIGBiYXJgJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VG9vbElucHV0U3RyaW5nIHJldHVybnMgcGF0dGVybiBmb3IgYm90aCBncmVwIGFuZCByZycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbElucHV0U3RyaW5nKCdncmVwJywgeyBwYXR0ZXJuOiAnYWJjJyB9LCB1bmRlZmluZWQpLCAnYWJjJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xJbnB1dFN0cmluZygncmcnLCB7IHBhdHRlcm46ICdhYmMnIH0sIHVuZGVmaW5lZCksICdhYmMnKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3dlYl9mZXRjaCB0b29sIGRpc3BsYXknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gdGV4dChtc2c6IFJldHVyblR5cGU8dHlwZW9mIGdldEludm9jYXRpb25NZXNzYWdlPiB8IFJldHVyblR5cGU8dHlwZW9mIGdldFBhc3RUZW5zZU1lc3NhZ2U+KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdHlwZW9mIG1zZyA9PT0gJ3N0cmluZycgPyBtc2cgOiBtc2cubWFya2Rvd247XG5cdH1cblxuXHR0ZXN0KCd1c2VzIHRoZSBmZXRjaGVkIFVSTCBmb3IgaW52b2NhdGlvbiBhbmQgY29tcGxldGlvbiBtZXNzYWdlcycsICgpID0+IHtcblx0XHRjb25zdCBwYXJhbWV0ZXJzID0geyB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL2RvY3MnIH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbnZvY2F0aW9uOiB0ZXh0KGdldEludm9jYXRpb25NZXNzYWdlKCd3ZWJfZmV0Y2gnLCAnRmV0Y2ggV2ViIENvbnRlbnQnLCBwYXJhbWV0ZXJzKSksXG5cdFx0XHRwYXN0VGVuc2U6IHRleHQoZ2V0UGFzdFRlbnNlTWVzc2FnZSgnd2ViX2ZldGNoJywgJ0ZldGNoIFdlYiBDb250ZW50JywgcGFyYW1ldGVycywgdHJ1ZSkpLFxuXHRcdFx0aW5wdXQ6IGdldFRvb2xJbnB1dFN0cmluZygnd2ViX2ZldGNoJywgcGFyYW1ldGVycywgdW5kZWZpbmVkKSxcblx0XHR9LCB7XG5cdFx0XHRpbnZvY2F0aW9uOiAnRmV0Y2hpbmcgW2h0dHBzOi8vZXhhbXBsZS5jb20vZG9jc10oaHR0cHM6Ly9leGFtcGxlLmNvbS9kb2NzKScsXG5cdFx0XHRwYXN0VGVuc2U6ICdGZXRjaGVkIFtodHRwczovL2V4YW1wbGUuY29tL2RvY3NdKGh0dHBzOi8vZXhhbXBsZS5jb20vZG9jcyknLFxuXHRcdFx0aW5wdXQ6ICdodHRwczovL2V4YW1wbGUuY29tL2RvY3MnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIGdlbmVyaWMgVVJMIHdvcmRpbmcgd2hlbiB0aGUgVVJMIGlzIGFic2VudCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGludm9jYXRpb246IHRleHQoZ2V0SW52b2NhdGlvbk1lc3NhZ2UoJ3dlYl9mZXRjaCcsICdGZXRjaCBXZWIgQ29udGVudCcsIHVuZGVmaW5lZCkpLFxuXHRcdFx0cGFzdFRlbnNlOiB0ZXh0KGdldFBhc3RUZW5zZU1lc3NhZ2UoJ3dlYl9mZXRjaCcsICdGZXRjaCBXZWIgQ29udGVudCcsIHVuZGVmaW5lZCwgdHJ1ZSkpLFxuXHRcdFx0ZmFpbHVyZTogdGV4dChnZXRQYXN0VGVuc2VNZXNzYWdlKCd3ZWJfZmV0Y2gnLCAnRmV0Y2ggV2ViIENvbnRlbnQnLCB7IHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vZG9jcycgfSwgZmFsc2UpKSxcblx0XHR9LCB7XG5cdFx0XHRpbnZvY2F0aW9uOiAnRmV0Y2hpbmcgVVJMJyxcblx0XHRcdHBhc3RUZW5zZTogJ0ZldGNoZWQgVVJMJyxcblx0XHRcdGZhaWx1cmU6ICdcIkZldGNoIFdlYiBDb250ZW50XCIgZmFpbGVkJyxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3NxbCB0b29sIGRpc3BsYXknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gdGV4dChtc2c6IFJldHVyblR5cGU8dHlwZW9mIGdldEludm9jYXRpb25NZXNzYWdlPiB8IFJldHVyblR5cGU8dHlwZW9mIGdldFBhc3RUZW5zZU1lc3NhZ2U+KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdHlwZW9mIG1zZyA9PT0gJ3N0cmluZycgPyBtc2cgOiBtc2cubWFya2Rvd247XG5cdH1cblxuXHR0ZXN0KCd1c2VzIHRoZSBTUUwgZGVzY3JpcHRpb24gZm9yIGludm9jYXRpb24gYW5kIGNvbXBsZXRpb24gbWVzc2FnZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyYW1ldGVycyA9IHsgZGVzY3JpcHRpb246ICdJbnNlcnQgYWdlbnQgaG9zdCBzdHVkeSB0b2RvcycsIHF1ZXJ5OiAnSU5TRVJUIElOVE8gdG9kb3MgKHRpdGxlKSBWQUxVRVMgKFxcJ1JlYWQgdGVybWluYWwgYWN0aXZhdGlvbiBkb2NzXFwnKScgfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dChnZXRJbnZvY2F0aW9uTWVzc2FnZSgnc3FsJywgJ0V4ZWN1dGUgU1FMJywgcGFyYW1ldGVycykpLCAnSW5zZXJ0IGFnZW50IGhvc3Qgc3R1ZHkgdG9kb3MnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dChnZXRQYXN0VGVuc2VNZXNzYWdlKCdzcWwnLCAnRXhlY3V0ZSBTUUwnLCBwYXJhbWV0ZXJzLCB0cnVlKSksICdJbnNlcnQgYWdlbnQgaG9zdCBzdHVkeSB0b2RvcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIGdlbmVyaWMgU1FMIHdvcmRpbmcgd2hlbiBkZXNjcmlwdGlvbiBpcyBhYnNlbnQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHQoZ2V0SW52b2NhdGlvbk1lc3NhZ2UoJ3NxbCcsICdFeGVjdXRlIFNRTCcsIHsgcXVlcnk6ICdTRUxFQ1QgMScgfSkpLCAnRXhlY3V0aW5nIFNRTCBxdWVyeScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0KGdldFBhc3RUZW5zZU1lc3NhZ2UoJ3NxbCcsICdFeGVjdXRlIFNRTCcsIHsgcXVlcnk6ICdTRUxFQ1QgMScgfSwgdHJ1ZSkpLCAnRXhlY3V0ZWQgU1FMIHF1ZXJ5Jyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdhcHBseV9wYXRjaCB0b29sIGRpc3BsYXknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gdGV4dChtc2c6IFJldHVyblR5cGU8dHlwZW9mIGdldEludm9jYXRpb25NZXNzYWdlPik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHR5cGVvZiBtc2cgPT09ICdzdHJpbmcnID8gbXNnIDogbXNnLm1hcmtkb3duO1xuXHR9XG5cblx0Y29uc3Qgc2luZ2xlRmlsZVBhdGNoID0gW1xuXHRcdCcqKiogQmVnaW4gUGF0Y2gnLFxuXHRcdCcqKiogVXBkYXRlIEZpbGU6IC9yZXBvL3NyYy9mb28udHMnLFxuXHRcdCdAQCcsXG5cdFx0Jy1vbGQnLFxuXHRcdCcrbmV3Jyxcblx0XHQnKioqIEVuZCBQYXRjaCcsXG5cdF0uam9pbignXFxuJyk7XG5cblx0Y29uc3QgbXVsdGlGaWxlUGF0Y2ggPSBbXG5cdFx0JyoqKiBCZWdpbiBQYXRjaCcsXG5cdFx0JyoqKiBVcGRhdGUgRmlsZTogL3JlcG8vc3JjL2Zvby50cycsXG5cdFx0J0BAJyxcblx0XHQnLW9sZCcsXG5cdFx0JytuZXcnLFxuXHRcdCcqKiogQWRkIEZpbGU6IC9yZXBvL3NyYy9iYXIudHMnLFxuXHRcdCcraGVsbG8nLFxuXHRcdCcqKiogRGVsZXRlIEZpbGU6IC9yZXBvL3NyYy9iYXoudHMnLFxuXHRcdCcqKiogRW5kIFBhdGNoJyxcblx0XS5qb2luKCdcXG4nKTtcblxuXHR0ZXN0KCdyZW5kZXJzIGEgY2xpY2thYmxlIGZpbGUgbGluayBmb3IgYSBzaW5nbGUtZmlsZSBwYXRjaCcsICgpID0+IHtcblx0XHRjb25zdCBpbnYgPSB0ZXh0KGdldEludm9jYXRpb25NZXNzYWdlKCdhcHBseV9wYXRjaCcsICdQYXRjaCcsIHsgaW5wdXQ6IHNpbmdsZUZpbGVQYXRjaCB9KSk7XG5cdFx0Y29uc3QgcGFzdCA9IHRleHQoZ2V0UGFzdFRlbnNlTWVzc2FnZSgnYXBwbHlfcGF0Y2gnLCAnUGF0Y2gnLCB7IGlucHV0OiBzaW5nbGVGaWxlUGF0Y2ggfSwgdHJ1ZSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBpbnYsIHBhc3QgfSwge1xuXHRcdFx0aW52OiAnRWRpdGluZyBbZm9vLnRzXShmaWxlOi8vL3JlcG8vc3JjL2Zvby50cyknLFxuXHRcdFx0cGFzdDogJ0VkaXRlZCBbZm9vLnRzXShmaWxlOi8vL3JlcG8vc3JjL2Zvby50cyknLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0cyBldmVyeSBhZmZlY3RlZCBmaWxlIGZvciBhIG11bHRpLWZpbGUgcGF0Y2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52ID0gdGV4dChnZXRJbnZvY2F0aW9uTWVzc2FnZSgnYXBwbHlfcGF0Y2gnLCAnUGF0Y2gnLCB7IGlucHV0OiBtdWx0aUZpbGVQYXRjaCB9KSk7XG5cdFx0Y29uc3QgcGFzdCA9IHRleHQoZ2V0UGFzdFRlbnNlTWVzc2FnZSgnYXBwbHlfcGF0Y2gnLCAnUGF0Y2gnLCB7IGlucHV0OiBtdWx0aUZpbGVQYXRjaCB9LCB0cnVlKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGludiwgcGFzdCB9LCB7XG5cdFx0XHRpbnY6ICdFZGl0aW5nIFtmb28udHNdKGZpbGU6Ly8vcmVwby9zcmMvZm9vLnRzKSwgW2Jhci50c10oZmlsZTovLy9yZXBvL3NyYy9iYXIudHMpLCBbYmF6LnRzXShmaWxlOi8vL3JlcG8vc3JjL2Jhei50cyknLFxuXHRcdFx0cGFzdDogJ0VkaXRlZCBbZm9vLnRzXShmaWxlOi8vL3JlcG8vc3JjL2Zvby50cyksIFtiYXIudHNdKGZpbGU6Ly8vcmVwby9zcmMvYmFyLnRzKSwgW2Jhei50c10oZmlsZTovLy9yZXBvL3NyYy9iYXoudHMpJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBhIGdlbmVyaWMgbWVzc2FnZSB3aGVuIHRoZSBwYXRjaCBib2R5IGlzIG1pc3Npbmcgb3IgdW5wYXJzZWFibGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEludm9jYXRpb25NZXNzYWdlKCdhcHBseV9wYXRjaCcsICdQYXRjaCcsIHVuZGVmaW5lZCksICdFZGl0aW5nIGZpbGVzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEludm9jYXRpb25NZXNzYWdlKCdhcHBseV9wYXRjaCcsICdQYXRjaCcsIHsgaW5wdXQ6ICdub3QgYSBwYXRjaCcgfSksICdFZGl0aW5nIGZpbGVzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFBhc3RUZW5zZU1lc3NhZ2UoJ2FwcGx5X3BhdGNoJywgJ1BhdGNoJywgdW5kZWZpbmVkLCB0cnVlKSwgJ0VkaXRlZCBmaWxlcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbHNvIGFjY2VwdHMgdGhlIHBhdGNoIHRleHQgdW5kZXIgdGhlIGBwYXRjaGAgcGFyYW1ldGVyIChDTEkgc2hhcGUpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGludiA9IHRleHQoZ2V0SW52b2NhdGlvbk1lc3NhZ2UoJ2FwcGx5X3BhdGNoJywgJ1BhdGNoJywgeyBwYXRjaDogc2luZ2xlRmlsZVBhdGNoIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52LCAnRWRpdGluZyBbZm9vLnRzXShmaWxlOi8vL3JlcG8vc3JjL2Zvby50cyknKTtcblx0fSk7XG5cblx0dGVzdCgnZ2l0X2FwcGx5X3BhdGNoIHNoYXJlcyB0aGUgc2FtZSBkaXNwbGF5IHBhdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52ID0gdGV4dChnZXRJbnZvY2F0aW9uTWVzc2FnZSgnZ2l0X2FwcGx5X3BhdGNoJywgJ1BhdGNoJywgeyBpbnB1dDogc2luZ2xlRmlsZVBhdGNoIH0pKTtcblx0XHRjb25zdCBwYXN0ID0gdGV4dChnZXRQYXN0VGVuc2VNZXNzYWdlKCdnaXRfYXBwbHlfcGF0Y2gnLCAnUGF0Y2gnLCB7IGlucHV0OiBzaW5nbGVGaWxlUGF0Y2ggfSwgdHJ1ZSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBpbnYsIHBhc3QgfSwge1xuXHRcdFx0aW52OiAnRWRpdGluZyBbZm9vLnRzXShmaWxlOi8vL3JlcG8vc3JjL2Zvby50cyknLFxuXHRcdFx0cGFzdDogJ0VkaXRlZCBbZm9vLnRzXShmaWxlOi8vL3JlcG8vc3JjL2Zvby50cyknLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWlsdXJlIHN0aWxsIHJvdXRlcyB0aHJvdWdoIHRoZSBnZW5lcmljIGZhaWxlZCBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQYXN0VGVuc2VNZXNzYWdlKCdhcHBseV9wYXRjaCcsICdQYXRjaCcsIHsgaW5wdXQ6IHNpbmdsZUZpbGVQYXRjaCB9LCBmYWxzZSksICdcIlBhdGNoXCIgZmFpbGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEVkaXRGaWxlUGF0aCByZXR1cm5zIHRoZSBmaXJzdCBhZmZlY3RlZCBmaWxlIGZyb20gYSBwYXRjaCBib2R5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRFZGl0RmlsZVBhdGgoeyBpbnB1dDogc2luZ2xlRmlsZVBhdGNoIH0pLCAnL3JlcG8vc3JjL2Zvby50cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRFZGl0RmlsZVBhdGgoeyBpbnB1dDogbXVsdGlGaWxlUGF0Y2ggfSksICcvcmVwby9zcmMvZm9vLnRzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEVkaXRGaWxlUGF0aCh7IHBhdGNoOiBzaW5nbGVGaWxlUGF0Y2ggfSksICcvcmVwby9zcmMvZm9vLnRzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEVkaXRGaWxlUGF0aChKU09OLnN0cmluZ2lmeSh7IGlucHV0OiBzaW5nbGVGaWxlUGF0Y2ggfSkpLCAnL3JlcG8vc3JjL2Zvby50cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRFZGl0RmlsZVBhdGgoeyBpbnB1dDogJ25vdCBhIHBhdGNoJyB9KSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RWRpdEZpbGVQYXRocyByZXR1cm5zIGV2ZXJ5IGFmZmVjdGVkIGZpbGUgZnJvbSBhIHBhdGNoIGJvZHknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRFZGl0RmlsZVBhdGhzKHsgaW5wdXQ6IHNpbmdsZUZpbGVQYXRjaCB9KSwgWycvcmVwby9zcmMvZm9vLnRzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RWRpdEZpbGVQYXRocyh7IGlucHV0OiBtdWx0aUZpbGVQYXRjaCB9KSwgWycvcmVwby9zcmMvZm9vLnRzJywgJy9yZXBvL3NyYy9iYXIudHMnLCAnL3JlcG8vc3JjL2Jhei50cyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEVkaXRGaWxlUGF0aHMoeyBwYXRjaDogbXVsdGlGaWxlUGF0Y2ggfSksIFsnL3JlcG8vc3JjL2Zvby50cycsICcvcmVwby9zcmMvYmFyLnRzJywgJy9yZXBvL3NyYy9iYXoudHMnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRFZGl0RmlsZVBhdGhzKEpTT04uc3RyaW5naWZ5KHsgaW5wdXQ6IG11bHRpRmlsZVBhdGNoIH0pKSwgWycvcmVwby9zcmMvZm9vLnRzJywgJy9yZXBvL3NyYy9iYXIudHMnLCAnL3JlcG8vc3JjL2Jhei50cyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEVkaXRGaWxlUGF0aHMoeyBwYXRoOiAnL3JlcG8vc3JjL2VkaXQudHMnIH0pLCBbJy9yZXBvL3NyYy9lZGl0LnRzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RWRpdEZpbGVQYXRocyh7IGlucHV0OiAnbm90IGEgcGF0Y2gnIH0pLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRFZGl0RmlsZVBhdGhzKHVuZGVmaW5lZCksIFtdKTtcblx0XHQvLyBTREsgY3VzdG9tLXRvb2wgZm9ybWF0OiBhcmd1bWVudHMgYXJyaXZlIGFzIGEgcmF3IFY0QSBwYXRjaCBzdHJpbmcsXG5cdFx0Ly8gbm90IGFzIGEgSlNPTiBvYmplY3QgXHUyMDE0IGV4ZXJjaXNlIHRoZSBzdHJpbmcgZmFsbGJhY2sgcGF0aC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEVkaXRGaWxlUGF0aHMobXVsdGlGaWxlUGF0Y2gpLCBbJy9yZXBvL3NyYy9mb28udHMnLCAnL3JlcG8vc3JjL2Jhci50cycsICcvcmVwby9zcmMvYmF6LnRzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RWRpdEZpbGVQYXRocyhzaW5nbGVGaWxlUGF0Y2gpLCBbJy9yZXBvL3NyYy9mb28udHMnXSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdnZXRTaGVsbEludGVudGlvbicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVhZHMgdGhlIGRlc2NyaXB0aW9uIGFyZ3VtZW50IG9mIHNoZWxsIHRvb2xzLCBhbmQgaWdub3JlcyBub24tc2hlbGwgdG9vbHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiYXNoOiBnZXRTaGVsbEludGVudGlvbignYmFzaCcsIHsgY29tbWFuZDogJ2xzJywgZGVzY3JpcHRpb246ICdMaXN0IGZpbGVzJyB9KSxcblx0XHRcdHBvd2Vyc2hlbGw6IGdldFNoZWxsSW50ZW50aW9uKCdwb3dlcnNoZWxsJywgeyBjb21tYW5kOiAnR2V0LUNoaWxkSXRlbScsIGRlc2NyaXB0aW9uOiAnTGlzdCBmaWxlcycgfSksXG5cdFx0XHRzaGVsbE5vRGVzY3JpcHRpb246IGdldFNoZWxsSW50ZW50aW9uKCdiYXNoJywgeyBjb21tYW5kOiAnbHMnIH0pLFxuXHRcdFx0c2hlbGxFbXB0eURlc2NyaXB0aW9uOiBnZXRTaGVsbEludGVudGlvbignYmFzaCcsIHsgY29tbWFuZDogJ2xzJywgZGVzY3JpcHRpb246ICcnIH0pLFxuXHRcdFx0Ly8gVGhlIGB0YXNrYCAoc3ViYWdlbnQpIHRvb2wgYWxzbyBoYXMgYSBgZGVzY3JpcHRpb25gIGFyZ3VtZW50LCBidXQgaXQgaXNcblx0XHRcdC8vIHRoZSBzdWJhZ2VudCB0YXNrIGRlc2NyaXB0aW9uLCBub3QgYSBzaGVsbCBpbnRlbnRpb24gXHUyMDE0IG11c3QgYmUgaWdub3JlZC5cblx0XHRcdHRhc2tUb29sOiBnZXRTaGVsbEludGVudGlvbigndGFzaycsIHsgZGVzY3JpcHRpb246ICdFeHBsb3JlIHRoZSBjb2RlYmFzZScgfSksXG5cdFx0XHR2aWV3VG9vbDogZ2V0U2hlbGxJbnRlbnRpb24oJ3ZpZXcnLCB7IHBhdGg6ICcvcmVwby9maWxlLnRzJywgZGVzY3JpcHRpb246ICd3aHknIH0pLFxuXHRcdFx0bm9BcmdzOiBnZXRTaGVsbEludGVudGlvbignYmFzaCcsIHVuZGVmaW5lZCksXG5cdFx0fSwge1xuXHRcdFx0YmFzaDogJ0xpc3QgZmlsZXMnLFxuXHRcdFx0cG93ZXJzaGVsbDogJ0xpc3QgZmlsZXMnLFxuXHRcdFx0c2hlbGxOb0Rlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRzaGVsbEVtcHR5RGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdHRhc2tUb29sOiB1bmRlZmluZWQsXG5cdFx0XHR2aWV3VG9vbDogdW5kZWZpbmVkLFxuXHRcdFx0bm9BcmdzOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsaUJBQWlCLGtCQUFrQixzQkFBc0IscUJBQXFCLHNCQUFzQixtQkFBbUIsa0JBQWtCLCtCQUErQixvQkFBb0Isb0JBQW9CLGFBQWEsd0JBQXdCLFlBQVksY0FBYyx3QkFBd0IsK0JBQTZEO0FBRTdXLE1BQU0saURBQTRDLE1BQU07QUFFdkQsMENBQXdDO0FBRXhDLE9BQUsseUVBQXlFLE1BQU07QUFDbkYsVUFBTSxRQUF3RDtBQUFBLE1BQzdELENBQUMsUUFBUSxtQkFBbUI7QUFBQSxNQUM1QixDQUFDLGNBQWMsbUJBQW1CO0FBQUEsTUFDbEMsQ0FBQyxhQUFhLGVBQWU7QUFBQSxNQUM3QixDQUFDLG1CQUFtQixlQUFlO0FBQUEsTUFDbkMsQ0FBQyxjQUFjLGVBQWU7QUFBQSxNQUM5QixDQUFDLG9CQUFvQixxQkFBcUI7QUFBQSxNQUMxQyxDQUFDLGFBQWEsdUJBQXVCO0FBQUEsTUFDckMsQ0FBQyxtQkFBbUIsdUJBQXVCO0FBQUEsTUFDM0MsQ0FBQyxpQkFBaUIsdUJBQXVCO0FBQUEsTUFDekMsQ0FBQyx1QkFBdUIsdUJBQXVCO0FBQUEsTUFDL0MsQ0FBQyxhQUFhLHFCQUFxQjtBQUFBLE1BQ25DLENBQUMsbUJBQW1CLHFCQUFxQjtBQUFBLE1BQ3pDLENBQUMsUUFBUSxNQUFNO0FBQUEsTUFDZixDQUFDLFFBQVEsV0FBVztBQUFBLE1BQ3BCLENBQUMsc0JBQXNCLFdBQVc7QUFBQSxNQUNsQyxDQUFDLGVBQWUsV0FBVztBQUFBLE1BQzNCLENBQUMsVUFBVSxXQUFXO0FBQUEsTUFDdEIsQ0FBQyxVQUFVLGFBQWE7QUFBQSxNQUN4QixDQUFDLFFBQVEsUUFBUTtBQUFBLE1BQ2pCLENBQUMsTUFBTSxRQUFRO0FBQUEsTUFD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
