import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import {
  getClaudeConfirmationTitle,
  getClaudeInvocationMessage,
  getClaudePastTenseMessage,
  getClaudePermissionKind,
  getClaudeStreamingInvocationMessage,
  getClaudeToolDisplayName,
  getClaudeToolInputString,
  getClaudeToolKind,
  getClaudeToolPath,
  INTERACTIVE_CLAUDE_TOOLS,
  buildClaudeToolMeta,
  isClaudeFileEditTool
} from "../../node/claude/claudeToolDisplay.js";
suite("claudeToolDisplay \u2014 \xA74 mapping table", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("mapping snapshot covers every Phase 7 \xA74 row", () => {
    const TOOLS = [
      "Bash",
      "BashOutput",
      "KillBash",
      "Read",
      "Glob",
      "Grep",
      "LS",
      "NotebookRead",
      "Write",
      "Edit",
      "MultiEdit",
      "NotebookEdit",
      "TodoWrite",
      "WebFetch",
      "Task",
      "ExitPlanMode",
      "AskUserQuestion",
      "Skill",
      "TaskCreate",
      "TaskUpdate",
      "TaskList",
      "TaskGet"
    ];
    const snapshot = TOOLS.map((t) => [t, getClaudePermissionKind(t), getClaudeToolDisplayName(t)]);
    assert.deepStrictEqual(snapshot, [
      ["Bash", "shell", "Run shell command"],
      ["BashOutput", "shell", "Read shell output"],
      ["KillBash", "shell", "Kill shell command"],
      ["Read", "read", "Read file"],
      ["Glob", "read", "Find files"],
      ["Grep", "read", "Search files"],
      ["LS", "read", "List directory"],
      ["NotebookRead", "read", "Read notebook"],
      ["Write", "write", "Write file"],
      ["Edit", "write", "Edit file"],
      ["MultiEdit", "write", "Edit file"],
      ["NotebookEdit", "write", "Edit notebook"],
      ["TodoWrite", "write", "Update todo list"],
      ["WebFetch", "url", "Fetch URL"],
      ["Task", "custom-tool", "Run subagent task"],
      ["ExitPlanMode", "custom-tool", "Ready to code?"],
      ["AskUserQuestion", "custom-tool", "Ask user a question"],
      ["Skill", "skill", "Run skill"],
      ["TaskCreate", "custom-tool", "Create task"],
      ["TaskUpdate", "custom-tool", "Update task"],
      ["TaskList", "custom-tool", "List tasks"],
      ["TaskGet", "custom-tool", "Read task"]
    ]);
  });
  test("mcp__-prefixed tool maps to mcp / strips prefix in displayName", () => {
    assert.deepStrictEqual(
      [
        getClaudePermissionKind("mcp__github__listIssues"),
        getClaudeToolDisplayName("mcp__github__listIssues")
      ],
      ["mcp", "Run MCP tool github__listIssues"]
    );
  });
  test("unknown tool defaults to custom-tool / toolName", () => {
    assert.deepStrictEqual(
      [
        getClaudePermissionKind("SomeNewTool"),
        getClaudeToolDisplayName("SomeNewTool")
      ],
      ["custom-tool", "SomeNewTool"]
    );
  });
  test("getClaudeToolPath snapshot for path-bearing tools", () => {
    assert.deepStrictEqual(
      {
        read: getClaudeToolPath("Read", { file_path: "/tmp/a" }),
        write: getClaudeToolPath("Write", { file_path: "/tmp/b" }),
        edit: getClaudeToolPath("Edit", { file_path: "/tmp/c" }),
        multiEdit: getClaudeToolPath("MultiEdit", { file_path: "/tmp/d" }),
        notebookRead: getClaudeToolPath("NotebookRead", { notebook_path: "/tmp/e.ipynb" }),
        notebookEdit: getClaudeToolPath("NotebookEdit", { notebook_path: "/tmp/f.ipynb" }),
        glob: getClaudeToolPath("Glob", { path: "/tmp/g", pattern: "*" }),
        grep: getClaudeToolPath("Grep", { path: "/tmp/h", pattern: "foo" }),
        ls: getClaudeToolPath("LS", { path: "/tmp/i" }),
        webFetch: getClaudeToolPath("WebFetch", { url: "https://example.com" }),
        bash: getClaudeToolPath("Bash", { command: "ls" }),
        todoWrite: getClaudeToolPath("TodoWrite", { todos: [] }),
        wrongTypeRead: getClaudeToolPath("Read", { file_path: 42 }),
        missingRead: getClaudeToolPath("Read", {}),
        nonObject: getClaudeToolPath("Write", null),
        unknownTool: getClaudeToolPath("SomeNewTool", { file_path: "/tmp/x" })
      },
      {
        read: "/tmp/a",
        write: "/tmp/b",
        edit: "/tmp/c",
        multiEdit: "/tmp/d",
        notebookRead: "/tmp/e.ipynb",
        notebookEdit: "/tmp/f.ipynb",
        glob: "/tmp/g",
        grep: "/tmp/h",
        ls: "/tmp/i",
        webFetch: "https://example.com",
        bash: void 0,
        todoWrite: void 0,
        wrongTypeRead: void 0,
        missingRead: void 0,
        nonObject: void 0,
        unknownTool: void 0
      }
    );
  });
  test("INTERACTIVE_CLAUDE_TOOLS contains exactly the user-input round-trip tools", () => {
    assert.deepStrictEqual(
      [...INTERACTIVE_CLAUDE_TOOLS].sort(),
      ["AskUserQuestion", "ExitPlanMode"]
    );
  });
  test("getClaudeConfirmationTitle returns per-permissionKind localized title", () => {
    assert.deepStrictEqual(
      {
        shell: getClaudeConfirmationTitle("Bash"),
        write: getClaudeConfirmationTitle("Write"),
        read: getClaudeConfirmationTitle("Read"),
        url: getClaudeConfirmationTitle("WebFetch"),
        mcpWithServer: getClaudeConfirmationTitle("mcp__github__listIssues"),
        custom: getClaudeConfirmationTitle("Task"),
        skill: getClaudeConfirmationTitle("Skill"),
        unknown: getClaudeConfirmationTitle("SomeNewTool")
      },
      {
        shell: "Run in terminal?",
        write: "Edit file?",
        read: "Read file?",
        url: "Fetch URL?",
        mcpWithServer: "Allow tool from github?",
        custom: "Allow tool call?",
        skill: "Run skill?",
        unknown: "Allow tool call?"
      }
    );
  });
  test("Phase 8 \u2014 isClaudeFileEditTool covers Write/Edit/MultiEdit/NotebookEdit, excludes TodoWrite/Bash/others", () => {
    assert.deepStrictEqual(
      {
        Write: isClaudeFileEditTool("Write"),
        Edit: isClaudeFileEditTool("Edit"),
        MultiEdit: isClaudeFileEditTool("MultiEdit"),
        NotebookEdit: isClaudeFileEditTool("NotebookEdit"),
        TodoWrite: isClaudeFileEditTool("TodoWrite"),
        Read: isClaudeFileEditTool("Read"),
        Bash: isClaudeFileEditTool("Bash"),
        unknown: isClaudeFileEditTool("SomeNewTool"),
        mcp: isClaudeFileEditTool("mcp__server__edit")
      },
      {
        Write: true,
        Edit: true,
        MultiEdit: true,
        NotebookEdit: true,
        TodoWrite: false,
        Read: false,
        Bash: false,
        unknown: false,
        mcp: false
      }
    );
  });
  test("streams rich file and line-count messages for Claude edit tools", () => {
    assert.deepStrictEqual({
      write: getClaudeStreamingInvocationMessage("Write", {
        file_path: "/src/new.ts",
        content: "one\r\ntwo\r\nthree"
      }),
      edit: getClaudeStreamingInvocationMessage("Edit", {
        file_path: "/src/foo.ts",
        old_string: "one",
        new_string: "one\ntwo"
      }),
      multiEdit: getClaudeStreamingInvocationMessage("MultiEdit", {
        file_path: "/src/foo.ts",
        edits: [
          { old_string: "one", new_string: "one\ntwo" },
          { old_string: "three\nfour", new_string: "updated" }
        ]
      }),
      notebookEdit: getClaudeStreamingInvocationMessage("NotebookEdit", {
        notebook_path: "/src/notebook.ipynb",
        new_source: "one\ntwo"
      }),
      read: getClaudeStreamingInvocationMessage("Read", { file_path: "/src/foo.ts" })
    }, {
      write: { markdown: "Creating [new.ts](file:///src/new.ts) (3 lines)" },
      edit: { markdown: "Replacing 1 line with 2 lines in [foo.ts](file:///src/foo.ts)" },
      multiEdit: { markdown: "Replacing 3 lines with 3 lines in [foo.ts](file:///src/foo.ts)" },
      notebookEdit: { markdown: "Editing 2 lines in [notebook.ipynb](file:///src/notebook.ipynb)" },
      read: void 0
    });
  });
  test("Phase 8.5 \u2014 rich rendering snapshot covers every tool row", () => {
    const SAMPLE_INPUT = {
      Bash: { command: "git status" },
      BashOutput: { bash_id: "b1" },
      KillBash: { bash_id: "b1" },
      Read: { file_path: "/src/foo.ts" },
      Glob: { pattern: "**/*.ts" },
      Grep: { pattern: "IClaudeAgentSession" },
      LS: { path: "/src" },
      NotebookRead: { notebook_path: "/nb.ipynb" },
      Write: { file_path: "/src/foo.ts", content: "..." },
      Edit: { file_path: "/src/foo.ts", old_string: "a", new_string: "b" },
      MultiEdit: { file_path: "/src/foo.ts", edits: [] },
      NotebookEdit: { notebook_path: "/nb.ipynb" },
      TodoWrite: { todos: [] },
      WebFetch: { url: "https://example.com" },
      Task: { description: "find the bug", subagent_type: "Explore" },
      ExitPlanMode: { plan: "..." },
      AskUserQuestion: { question: "why?" },
      Skill: { skill: "deep-research", args: "foo" },
      TaskCreate: { subject: "Fix auth bug", description: "..." },
      TaskUpdate: { taskId: "1", status: "completed" },
      TaskList: {},
      TaskGet: { taskId: "1" }
    };
    const TOOLS = Object.keys(SAMPLE_INPUT);
    const snapshot = TOOLS.map((t) => {
      const input = SAMPLE_INPUT[t];
      const displayName = getClaudeToolDisplayName(t);
      return [
        t,
        getClaudeToolKind(t),
        buildClaudeToolMeta(t),
        getClaudeInvocationMessage(t, displayName, input),
        getClaudePastTenseMessage(t, displayName, input, true),
        getClaudePastTenseMessage(t, displayName, input, false),
        getClaudeToolInputString(t, input)
      ];
    });
    assert.deepStrictEqual(snapshot, [
      ["Bash", "terminal", { toolKind: "terminal" }, { markdown: "Running `git status`" }, { markdown: "Ran `git status`" }, '"Run shell command" failed', "git status"],
      ["BashOutput", "terminal", { toolKind: "terminal" }, "Reading shell output", "Read shell output", '"Read shell output" failed', '{\n  "bash_id": "b1"\n}'],
      ["KillBash", "terminal", { toolKind: "terminal" }, "Killing shell command", "Killed shell command", '"Kill shell command" failed', '{\n  "bash_id": "b1"\n}'],
      ["Read", void 0, void 0, { markdown: "Reading [foo.ts](file:///src/foo.ts)" }, { markdown: "Read [foo.ts](file:///src/foo.ts)" }, '"Read file" failed', '{\n  "file_path": "/src/foo.ts"\n}'],
      ["Glob", "search", { toolKind: "search" }, { markdown: "Finding files matching `**/*.ts`" }, { markdown: "Found files matching `**/*.ts`" }, '"Find files" failed', "**/*.ts"],
      ["Grep", "search", { toolKind: "search" }, { markdown: "Searching for `IClaudeAgentSession`" }, { markdown: "Searched for `IClaudeAgentSession`" }, '"Search files" failed', "IClaudeAgentSession"],
      ["LS", void 0, void 0, { markdown: "Listing [src](file:///src)" }, { markdown: "Listed [src](file:///src)" }, '"List directory" failed', '{\n  "path": "/src"\n}'],
      ["NotebookRead", void 0, void 0, { markdown: "Reading [nb.ipynb](file:///nb.ipynb)" }, { markdown: "Read [nb.ipynb](file:///nb.ipynb)" }, '"Read notebook" failed', '{\n  "notebook_path": "/nb.ipynb"\n}'],
      ["Write", void 0, void 0, { markdown: "Editing [foo.ts](file:///src/foo.ts)" }, { markdown: "Edited [foo.ts](file:///src/foo.ts)" }, '"Write file" failed', '{\n  "file_path": "/src/foo.ts",\n  "content": "..."\n}'],
      ["Edit", void 0, void 0, { markdown: "Editing [foo.ts](file:///src/foo.ts)" }, { markdown: "Edited [foo.ts](file:///src/foo.ts)" }, '"Edit file" failed', '{\n  "file_path": "/src/foo.ts",\n  "old_string": "a",\n  "new_string": "b"\n}'],
      ["MultiEdit", void 0, void 0, { markdown: "Editing [foo.ts](file:///src/foo.ts)" }, { markdown: "Edited [foo.ts](file:///src/foo.ts)" }, '"Edit file" failed', '{\n  "file_path": "/src/foo.ts",\n  "edits": []\n}'],
      ["NotebookEdit", void 0, void 0, { markdown: "Editing [nb.ipynb](file:///nb.ipynb)" }, { markdown: "Edited [nb.ipynb](file:///nb.ipynb)" }, '"Edit notebook" failed', '{\n  "notebook_path": "/nb.ipynb"\n}'],
      ["TodoWrite", void 0, void 0, "Updating todo list", "Updated todo list", '"Update todo list" failed', '{\n  "todos": []\n}'],
      ["WebFetch", void 0, void 0, { markdown: "Fetching [https://example.com](https://example.com)" }, { markdown: "Fetched [https://example.com](https://example.com)" }, '"Fetch URL" failed', '{\n  "url": "https://example.com"\n}'],
      ["Task", "subagent", { toolKind: "subagent" }, "find the bug", "Ran subagent", '"Run subagent task" failed', '{\n  "description": "find the bug",\n  "subagent_type": "Explore"\n}'],
      ["ExitPlanMode", void 0, void 0, "Ready to code?", "Ready to code?", '"Ready to code?" failed', '{\n  "plan": "..."\n}'],
      ["AskUserQuestion", void 0, void 0, "Ask user a question", "Ask user a question", '"Ask user a question" failed', '{\n  "question": "why?"\n}'],
      ["Skill", void 0, void 0, { markdown: "Running skill `deep-research`" }, { markdown: "Ran skill `deep-research`" }, '"Run skill" failed', '{\n  "skill": "deep-research",\n  "args": "foo"\n}'],
      ["TaskCreate", void 0, void 0, "Creating task: Fix auth bug", "Created task: Fix auth bug", '"Create task" failed', '{\n  "subject": "Fix auth bug",\n  "description": "..."\n}'],
      ["TaskUpdate", void 0, void 0, "Completing task", "Completed task", '"Update task" failed', '{\n  "taskId": "1",\n  "status": "completed"\n}'],
      ["TaskList", void 0, void 0, "Reading task list", "Read task list", '"List tasks" failed', "{}"],
      ["TaskGet", void 0, void 0, "Reading task", "Read task", '"Read task" failed', '{\n  "taskId": "1"\n}']
    ]);
  });
  test("Phase 8.5 \u2014 TaskUpdate message varies by status", () => {
    const invoke = (status) => getClaudeInvocationMessage("TaskUpdate", "Update task", status ? { taskId: "1", status } : { taskId: "1" });
    const past = (status) => getClaudePastTenseMessage("TaskUpdate", "Update task", status ? { taskId: "1", status } : { taskId: "1" }, true);
    assert.deepStrictEqual(
      {
        startInvoke: invoke("in_progress"),
        startPast: past("in_progress"),
        completeInvoke: invoke("completed"),
        completePast: past("completed"),
        deleteInvoke: invoke("deleted"),
        deletePast: past("deleted"),
        noStatusInvoke: invoke(),
        noStatusPast: past(),
        unknownStatusInvoke: invoke("bogus")
      },
      {
        startInvoke: "Starting task",
        startPast: "Started task",
        completeInvoke: "Completing task",
        completePast: "Completed task",
        deleteInvoke: "Deleting task",
        deletePast: "Deleted task",
        noStatusInvoke: "Updating task",
        noStatusPast: "Updated task",
        unknownStatusInvoke: "Updating task"
      }
    );
  });
  test("Phase 8.5 \u2014 defensive input handling falls back to static display strings", () => {
    assert.deepStrictEqual(
      {
        bashNoCommand: getClaudeInvocationMessage("Bash", "Run shell command", {}),
        bashWrongType: getClaudeInvocationMessage("Bash", "Run shell command", { command: 42 }),
        readMissingPath: getClaudeInvocationMessage("Read", "Read file", {}),
        grepMissingPattern: getClaudeInvocationMessage("Grep", "Search files", {}),
        nonObjectInput: getClaudeInvocationMessage("Bash", "Run shell command", null),
        undefinedInput: getClaudeInvocationMessage("Bash", "Run shell command", void 0),
        taskNoDescription: getClaudeInvocationMessage("Task", "Run subagent task", {}),
        bashFailed: getClaudePastTenseMessage("Bash", "Run shell command", { command: "x" }, false),
        inputStringUndefined: getClaudeToolInputString("Bash", void 0),
        inputStringBashNoCommand: getClaudeToolInputString("Bash", {})
      },
      {
        bashNoCommand: "Running shell command",
        bashWrongType: "Running shell command",
        readMissingPath: "Reading file",
        grepMissingPattern: "Searching files",
        nonObjectInput: "Running shell command",
        undefinedInput: "Running shell command",
        taskNoDescription: "Run subagent task",
        bashFailed: '"Run shell command" failed',
        inputStringUndefined: void 0,
        inputStringBashNoCommand: "{}"
      }
    );
  });
  test("Phase 8.5 \u2014 Agent row mirrors Task (subagent kind, same display name)", () => {
    assert.deepStrictEqual(
      [
        getClaudeToolKind("Agent"),
        buildClaudeToolMeta("Agent"),
        getClaudeToolDisplayName("Agent"),
        getClaudePermissionKind("Agent"),
        getClaudeInvocationMessage("Agent", getClaudeToolDisplayName("Agent"), { description: "review this" })
      ],
      [
        "subagent",
        { toolKind: "subagent" },
        "Run subagent task",
        "custom-tool",
        "review this"
      ]
    );
  });
  test("Phase 8.5 \u2014 MCP tools have no toolKind, JSON input fallback", () => {
    assert.deepStrictEqual(
      {
        kind: getClaudeToolKind("mcp__github__listIssues"),
        meta: buildClaudeToolMeta("mcp__github__listIssues"),
        inputString: getClaudeToolInputString("mcp__github__listIssues", { owner: "microsoft", repo: "vscode" }),
        invocation: getClaudeInvocationMessage("mcp__github__listIssues", "Run MCP tool github__listIssues", { owner: "microsoft" })
      },
      {
        kind: void 0,
        meta: void 0,
        inputString: '{\n  "owner": "microsoft",\n  "repo": "vscode"\n}',
        invocation: "Run MCP tool github__listIssues"
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY2xhdWRlVG9vbERpc3BsYXkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHtcblx0Z2V0Q2xhdWRlQ29uZmlybWF0aW9uVGl0bGUsXG5cdGdldENsYXVkZUludm9jYXRpb25NZXNzYWdlLFxuXHRnZXRDbGF1ZGVQYXN0VGVuc2VNZXNzYWdlLFxuXHRnZXRDbGF1ZGVQZXJtaXNzaW9uS2luZCxcblx0Z2V0Q2xhdWRlU3RyZWFtaW5nSW52b2NhdGlvbk1lc3NhZ2UsXG5cdGdldENsYXVkZVRvb2xEaXNwbGF5TmFtZSxcblx0Z2V0Q2xhdWRlVG9vbElucHV0U3RyaW5nLFxuXHRnZXRDbGF1ZGVUb29sS2luZCxcblx0Z2V0Q2xhdWRlVG9vbFBhdGgsXG5cdElOVEVSQUNUSVZFX0NMQVVERV9UT09MUyxcblx0YnVpbGRDbGF1ZGVUb29sTWV0YSxcblx0aXNDbGF1ZGVGaWxlRWRpdFRvb2wsXG59IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZVRvb2xEaXNwbGF5LmpzJztcblxuLyoqXG4gKiBQdXJlLWRhdGEgc25hcHNob3QgdGVzdHMgZm9yIFtjbGF1ZGVUb29sRGlzcGxheS50c10oLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlVG9vbERpc3BsYXkudHMpLlxuICogUGhhc2UgNyBwbGFuIFx1MDBBNzQ6IGV2ZXJ5IGNlbGwgb2YgdGhlIG1hcHBpbmcgdGFibGUgbXVzdCBiZSByZWFjaGFibGVcbiAqIGZyb20gb25lIGFzc2VydGlvbi4gVGhlIHNuYXBzaG90IGxpdmVzIGhlcmUsIG5vdCBpbiBhIGZpeHR1cmUgZmlsZSxcbiAqIHNvIGZ1dHVyZSByZW5hbWVzIGZsb3cgdGhyb3VnaCBjb21waWxlLWNoZWNrcy5cbiAqL1xuc3VpdGUoJ2NsYXVkZVRvb2xEaXNwbGF5IFx1MjAxNCBcdTAwQTc0IG1hcHBpbmcgdGFibGUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbWFwcGluZyBzbmFwc2hvdCBjb3ZlcnMgZXZlcnkgUGhhc2UgNyBcdTAwQTc0IHJvdycsICgpID0+IHtcblx0XHRjb25zdCBUT09MUyA9IFtcblx0XHRcdCdCYXNoJywgJ0Jhc2hPdXRwdXQnLCAnS2lsbEJhc2gnLFxuXHRcdFx0J1JlYWQnLCAnR2xvYicsICdHcmVwJywgJ0xTJywgJ05vdGVib29rUmVhZCcsXG5cdFx0XHQnV3JpdGUnLCAnRWRpdCcsICdNdWx0aUVkaXQnLCAnTm90ZWJvb2tFZGl0JywgJ1RvZG9Xcml0ZScsXG5cdFx0XHQnV2ViRmV0Y2gnLCAnVGFzaycsXG5cdFx0XHQnRXhpdFBsYW5Nb2RlJywgJ0Fza1VzZXJRdWVzdGlvbicsXG5cdFx0XHQnU2tpbGwnLCAnVGFza0NyZWF0ZScsICdUYXNrVXBkYXRlJywgJ1Rhc2tMaXN0JywgJ1Rhc2tHZXQnLFxuXHRcdF0gYXMgY29uc3Q7XG5cblx0XHRjb25zdCBzbmFwc2hvdCA9IFRPT0xTLm1hcCh0ID0+IFt0LCBnZXRDbGF1ZGVQZXJtaXNzaW9uS2luZCh0KSwgZ2V0Q2xhdWRlVG9vbERpc3BsYXlOYW1lKHQpXSBhcyBjb25zdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90LCBbXG5cdFx0XHRbJ0Jhc2gnLCAnc2hlbGwnLCAnUnVuIHNoZWxsIGNvbW1hbmQnXSxcblx0XHRcdFsnQmFzaE91dHB1dCcsICdzaGVsbCcsICdSZWFkIHNoZWxsIG91dHB1dCddLFxuXHRcdFx0WydLaWxsQmFzaCcsICdzaGVsbCcsICdLaWxsIHNoZWxsIGNvbW1hbmQnXSxcblx0XHRcdFsnUmVhZCcsICdyZWFkJywgJ1JlYWQgZmlsZSddLFxuXHRcdFx0WydHbG9iJywgJ3JlYWQnLCAnRmluZCBmaWxlcyddLFxuXHRcdFx0WydHcmVwJywgJ3JlYWQnLCAnU2VhcmNoIGZpbGVzJ10sXG5cdFx0XHRbJ0xTJywgJ3JlYWQnLCAnTGlzdCBkaXJlY3RvcnknXSxcblx0XHRcdFsnTm90ZWJvb2tSZWFkJywgJ3JlYWQnLCAnUmVhZCBub3RlYm9vayddLFxuXHRcdFx0WydXcml0ZScsICd3cml0ZScsICdXcml0ZSBmaWxlJ10sXG5cdFx0XHRbJ0VkaXQnLCAnd3JpdGUnLCAnRWRpdCBmaWxlJ10sXG5cdFx0XHRbJ011bHRpRWRpdCcsICd3cml0ZScsICdFZGl0IGZpbGUnXSxcblx0XHRcdFsnTm90ZWJvb2tFZGl0JywgJ3dyaXRlJywgJ0VkaXQgbm90ZWJvb2snXSxcblx0XHRcdFsnVG9kb1dyaXRlJywgJ3dyaXRlJywgJ1VwZGF0ZSB0b2RvIGxpc3QnXSxcblx0XHRcdFsnV2ViRmV0Y2gnLCAndXJsJywgJ0ZldGNoIFVSTCddLFxuXHRcdFx0WydUYXNrJywgJ2N1c3RvbS10b29sJywgJ1J1biBzdWJhZ2VudCB0YXNrJ10sXG5cdFx0XHRbJ0V4aXRQbGFuTW9kZScsICdjdXN0b20tdG9vbCcsICdSZWFkeSB0byBjb2RlPyddLFxuXHRcdFx0WydBc2tVc2VyUXVlc3Rpb24nLCAnY3VzdG9tLXRvb2wnLCAnQXNrIHVzZXIgYSBxdWVzdGlvbiddLFxuXHRcdFx0WydTa2lsbCcsICdza2lsbCcsICdSdW4gc2tpbGwnXSxcblx0XHRcdFsnVGFza0NyZWF0ZScsICdjdXN0b20tdG9vbCcsICdDcmVhdGUgdGFzayddLFxuXHRcdFx0WydUYXNrVXBkYXRlJywgJ2N1c3RvbS10b29sJywgJ1VwZGF0ZSB0YXNrJ10sXG5cdFx0XHRbJ1Rhc2tMaXN0JywgJ2N1c3RvbS10b29sJywgJ0xpc3QgdGFza3MnXSxcblx0XHRcdFsnVGFza0dldCcsICdjdXN0b20tdG9vbCcsICdSZWFkIHRhc2snXSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbWNwX18tcHJlZml4ZWQgdG9vbCBtYXBzIHRvIG1jcCAvIHN0cmlwcyBwcmVmaXggaW4gZGlzcGxheU5hbWUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFtcblx0XHRcdFx0Z2V0Q2xhdWRlUGVybWlzc2lvbktpbmQoJ21jcF9fZ2l0aHViX19saXN0SXNzdWVzJyksXG5cdFx0XHRcdGdldENsYXVkZVRvb2xEaXNwbGF5TmFtZSgnbWNwX19naXRodWJfX2xpc3RJc3N1ZXMnKSxcblx0XHRcdF0sXG5cdFx0XHRbJ21jcCcsICdSdW4gTUNQIHRvb2wgZ2l0aHViX19saXN0SXNzdWVzJ10sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndW5rbm93biB0b29sIGRlZmF1bHRzIHRvIGN1c3RvbS10b29sIC8gdG9vbE5hbWUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFtcblx0XHRcdFx0Z2V0Q2xhdWRlUGVybWlzc2lvbktpbmQoJ1NvbWVOZXdUb29sJyksXG5cdFx0XHRcdGdldENsYXVkZVRvb2xEaXNwbGF5TmFtZSgnU29tZU5ld1Rvb2wnKSxcblx0XHRcdF0sXG5cdFx0XHRbJ2N1c3RvbS10b29sJywgJ1NvbWVOZXdUb29sJ10sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q2xhdWRlVG9vbFBhdGggc25hcHNob3QgZm9yIHBhdGgtYmVhcmluZyB0b29scycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRyZWFkOiBnZXRDbGF1ZGVUb29sUGF0aCgnUmVhZCcsIHsgZmlsZV9wYXRoOiAnL3RtcC9hJyB9KSxcblx0XHRcdFx0d3JpdGU6IGdldENsYXVkZVRvb2xQYXRoKCdXcml0ZScsIHsgZmlsZV9wYXRoOiAnL3RtcC9iJyB9KSxcblx0XHRcdFx0ZWRpdDogZ2V0Q2xhdWRlVG9vbFBhdGgoJ0VkaXQnLCB7IGZpbGVfcGF0aDogJy90bXAvYycgfSksXG5cdFx0XHRcdG11bHRpRWRpdDogZ2V0Q2xhdWRlVG9vbFBhdGgoJ011bHRpRWRpdCcsIHsgZmlsZV9wYXRoOiAnL3RtcC9kJyB9KSxcblx0XHRcdFx0bm90ZWJvb2tSZWFkOiBnZXRDbGF1ZGVUb29sUGF0aCgnTm90ZWJvb2tSZWFkJywgeyBub3RlYm9va19wYXRoOiAnL3RtcC9lLmlweW5iJyB9KSxcblx0XHRcdFx0bm90ZWJvb2tFZGl0OiBnZXRDbGF1ZGVUb29sUGF0aCgnTm90ZWJvb2tFZGl0JywgeyBub3RlYm9va19wYXRoOiAnL3RtcC9mLmlweW5iJyB9KSxcblx0XHRcdFx0Z2xvYjogZ2V0Q2xhdWRlVG9vbFBhdGgoJ0dsb2InLCB7IHBhdGg6ICcvdG1wL2cnLCBwYXR0ZXJuOiAnKicgfSksXG5cdFx0XHRcdGdyZXA6IGdldENsYXVkZVRvb2xQYXRoKCdHcmVwJywgeyBwYXRoOiAnL3RtcC9oJywgcGF0dGVybjogJ2ZvbycgfSksXG5cdFx0XHRcdGxzOiBnZXRDbGF1ZGVUb29sUGF0aCgnTFMnLCB7IHBhdGg6ICcvdG1wL2knIH0pLFxuXHRcdFx0XHR3ZWJGZXRjaDogZ2V0Q2xhdWRlVG9vbFBhdGgoJ1dlYkZldGNoJywgeyB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tJyB9KSxcblx0XHRcdFx0YmFzaDogZ2V0Q2xhdWRlVG9vbFBhdGgoJ0Jhc2gnLCB7IGNvbW1hbmQ6ICdscycgfSksXG5cdFx0XHRcdHRvZG9Xcml0ZTogZ2V0Q2xhdWRlVG9vbFBhdGgoJ1RvZG9Xcml0ZScsIHsgdG9kb3M6IFtdIH0pLFxuXHRcdFx0XHR3cm9uZ1R5cGVSZWFkOiBnZXRDbGF1ZGVUb29sUGF0aCgnUmVhZCcsIHsgZmlsZV9wYXRoOiA0MiB9KSxcblx0XHRcdFx0bWlzc2luZ1JlYWQ6IGdldENsYXVkZVRvb2xQYXRoKCdSZWFkJywge30pLFxuXHRcdFx0XHRub25PYmplY3Q6IGdldENsYXVkZVRvb2xQYXRoKCdXcml0ZScsIG51bGwpLFxuXHRcdFx0XHR1bmtub3duVG9vbDogZ2V0Q2xhdWRlVG9vbFBhdGgoJ1NvbWVOZXdUb29sJywgeyBmaWxlX3BhdGg6ICcvdG1wL3gnIH0pLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cmVhZDogJy90bXAvYScsXG5cdFx0XHRcdHdyaXRlOiAnL3RtcC9iJyxcblx0XHRcdFx0ZWRpdDogJy90bXAvYycsXG5cdFx0XHRcdG11bHRpRWRpdDogJy90bXAvZCcsXG5cdFx0XHRcdG5vdGVib29rUmVhZDogJy90bXAvZS5pcHluYicsXG5cdFx0XHRcdG5vdGVib29rRWRpdDogJy90bXAvZi5pcHluYicsXG5cdFx0XHRcdGdsb2I6ICcvdG1wL2cnLFxuXHRcdFx0XHRncmVwOiAnL3RtcC9oJyxcblx0XHRcdFx0bHM6ICcvdG1wL2knLFxuXHRcdFx0XHR3ZWJGZXRjaDogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRiYXNoOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRvZG9Xcml0ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHR3cm9uZ1R5cGVSZWFkOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1pc3NpbmdSZWFkOiB1bmRlZmluZWQsXG5cdFx0XHRcdG5vbk9iamVjdDogdW5kZWZpbmVkLFxuXHRcdFx0XHR1bmtub3duVG9vbDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJTlRFUkFDVElWRV9DTEFVREVfVE9PTFMgY29udGFpbnMgZXhhY3RseSB0aGUgdXNlci1pbnB1dCByb3VuZC10cmlwIHRvb2xzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbLi4uSU5URVJBQ1RJVkVfQ0xBVURFX1RPT0xTXS5zb3J0KCksXG5cdFx0XHRbJ0Fza1VzZXJRdWVzdGlvbicsICdFeGl0UGxhbk1vZGUnXSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDbGF1ZGVDb25maXJtYXRpb25UaXRsZSByZXR1cm5zIHBlci1wZXJtaXNzaW9uS2luZCBsb2NhbGl6ZWQgdGl0bGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0c2hlbGw6IGdldENsYXVkZUNvbmZpcm1hdGlvblRpdGxlKCdCYXNoJyksXG5cdFx0XHRcdHdyaXRlOiBnZXRDbGF1ZGVDb25maXJtYXRpb25UaXRsZSgnV3JpdGUnKSxcblx0XHRcdFx0cmVhZDogZ2V0Q2xhdWRlQ29uZmlybWF0aW9uVGl0bGUoJ1JlYWQnKSxcblx0XHRcdFx0dXJsOiBnZXRDbGF1ZGVDb25maXJtYXRpb25UaXRsZSgnV2ViRmV0Y2gnKSxcblx0XHRcdFx0bWNwV2l0aFNlcnZlcjogZ2V0Q2xhdWRlQ29uZmlybWF0aW9uVGl0bGUoJ21jcF9fZ2l0aHViX19saXN0SXNzdWVzJyksXG5cdFx0XHRcdGN1c3RvbTogZ2V0Q2xhdWRlQ29uZmlybWF0aW9uVGl0bGUoJ1Rhc2snKSxcblx0XHRcdFx0c2tpbGw6IGdldENsYXVkZUNvbmZpcm1hdGlvblRpdGxlKCdTa2lsbCcpLFxuXHRcdFx0XHR1bmtub3duOiBnZXRDbGF1ZGVDb25maXJtYXRpb25UaXRsZSgnU29tZU5ld1Rvb2wnKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHNoZWxsOiAnUnVuIGluIHRlcm1pbmFsPycsXG5cdFx0XHRcdHdyaXRlOiAnRWRpdCBmaWxlPycsXG5cdFx0XHRcdHJlYWQ6ICdSZWFkIGZpbGU/Jyxcblx0XHRcdFx0dXJsOiAnRmV0Y2ggVVJMPycsXG5cdFx0XHRcdG1jcFdpdGhTZXJ2ZXI6ICdBbGxvdyB0b29sIGZyb20gZ2l0aHViPycsXG5cdFx0XHRcdGN1c3RvbTogJ0FsbG93IHRvb2wgY2FsbD8nLFxuXHRcdFx0XHRza2lsbDogJ1J1biBza2lsbD8nLFxuXHRcdFx0XHR1bmtub3duOiAnQWxsb3cgdG9vbCBjYWxsPycsXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BoYXNlIDggXHUyMDE0IGlzQ2xhdWRlRmlsZUVkaXRUb29sIGNvdmVycyBXcml0ZS9FZGl0L011bHRpRWRpdC9Ob3RlYm9va0VkaXQsIGV4Y2x1ZGVzIFRvZG9Xcml0ZS9CYXNoL290aGVycycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRXcml0ZTogaXNDbGF1ZGVGaWxlRWRpdFRvb2woJ1dyaXRlJyksXG5cdFx0XHRcdEVkaXQ6IGlzQ2xhdWRlRmlsZUVkaXRUb29sKCdFZGl0JyksXG5cdFx0XHRcdE11bHRpRWRpdDogaXNDbGF1ZGVGaWxlRWRpdFRvb2woJ011bHRpRWRpdCcpLFxuXHRcdFx0XHROb3RlYm9va0VkaXQ6IGlzQ2xhdWRlRmlsZUVkaXRUb29sKCdOb3RlYm9va0VkaXQnKSxcblx0XHRcdFx0VG9kb1dyaXRlOiBpc0NsYXVkZUZpbGVFZGl0VG9vbCgnVG9kb1dyaXRlJyksXG5cdFx0XHRcdFJlYWQ6IGlzQ2xhdWRlRmlsZUVkaXRUb29sKCdSZWFkJyksXG5cdFx0XHRcdEJhc2g6IGlzQ2xhdWRlRmlsZUVkaXRUb29sKCdCYXNoJyksXG5cdFx0XHRcdHVua25vd246IGlzQ2xhdWRlRmlsZUVkaXRUb29sKCdTb21lTmV3VG9vbCcpLFxuXHRcdFx0XHRtY3A6IGlzQ2xhdWRlRmlsZUVkaXRUb29sKCdtY3BfX3NlcnZlcl9fZWRpdCcpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0V3JpdGU6IHRydWUsXG5cdFx0XHRcdEVkaXQ6IHRydWUsXG5cdFx0XHRcdE11bHRpRWRpdDogdHJ1ZSxcblx0XHRcdFx0Tm90ZWJvb2tFZGl0OiB0cnVlLFxuXHRcdFx0XHRUb2RvV3JpdGU6IGZhbHNlLFxuXHRcdFx0XHRSZWFkOiBmYWxzZSxcblx0XHRcdFx0QmFzaDogZmFsc2UsXG5cdFx0XHRcdHVua25vd246IGZhbHNlLFxuXHRcdFx0XHRtY3A6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJlYW1zIHJpY2ggZmlsZSBhbmQgbGluZS1jb3VudCBtZXNzYWdlcyBmb3IgQ2xhdWRlIGVkaXQgdG9vbHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3cml0ZTogZ2V0Q2xhdWRlU3RyZWFtaW5nSW52b2NhdGlvbk1lc3NhZ2UoJ1dyaXRlJywge1xuXHRcdFx0XHRmaWxlX3BhdGg6ICcvc3JjL25ldy50cycsXG5cdFx0XHRcdGNvbnRlbnQ6ICdvbmVcXHJcXG50d29cXHJcXG50aHJlZScsXG5cdFx0XHR9KSxcblx0XHRcdGVkaXQ6IGdldENsYXVkZVN0cmVhbWluZ0ludm9jYXRpb25NZXNzYWdlKCdFZGl0Jywge1xuXHRcdFx0XHRmaWxlX3BhdGg6ICcvc3JjL2Zvby50cycsXG5cdFx0XHRcdG9sZF9zdHJpbmc6ICdvbmUnLFxuXHRcdFx0XHRuZXdfc3RyaW5nOiAnb25lXFxudHdvJyxcblx0XHRcdH0pLFxuXHRcdFx0bXVsdGlFZGl0OiBnZXRDbGF1ZGVTdHJlYW1pbmdJbnZvY2F0aW9uTWVzc2FnZSgnTXVsdGlFZGl0Jywge1xuXHRcdFx0XHRmaWxlX3BhdGg6ICcvc3JjL2Zvby50cycsXG5cdFx0XHRcdGVkaXRzOiBbXG5cdFx0XHRcdFx0eyBvbGRfc3RyaW5nOiAnb25lJywgbmV3X3N0cmluZzogJ29uZVxcbnR3bycgfSxcblx0XHRcdFx0XHR7IG9sZF9zdHJpbmc6ICd0aHJlZVxcbmZvdXInLCBuZXdfc3RyaW5nOiAndXBkYXRlZCcgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pLFxuXHRcdFx0bm90ZWJvb2tFZGl0OiBnZXRDbGF1ZGVTdHJlYW1pbmdJbnZvY2F0aW9uTWVzc2FnZSgnTm90ZWJvb2tFZGl0Jywge1xuXHRcdFx0XHRub3RlYm9va19wYXRoOiAnL3NyYy9ub3RlYm9vay5pcHluYicsXG5cdFx0XHRcdG5ld19zb3VyY2U6ICdvbmVcXG50d28nLFxuXHRcdFx0fSksXG5cdFx0XHRyZWFkOiBnZXRDbGF1ZGVTdHJlYW1pbmdJbnZvY2F0aW9uTWVzc2FnZSgnUmVhZCcsIHsgZmlsZV9wYXRoOiAnL3NyYy9mb28udHMnIH0pLFxuXHRcdH0sIHtcblx0XHRcdHdyaXRlOiB7IG1hcmtkb3duOiAnQ3JlYXRpbmcgW25ldy50c10oZmlsZTovLy9zcmMvbmV3LnRzKSAoMyBsaW5lcyknIH0sXG5cdFx0XHRlZGl0OiB7IG1hcmtkb3duOiAnUmVwbGFjaW5nIDEgbGluZSB3aXRoIDIgbGluZXMgaW4gW2Zvby50c10oZmlsZTovLy9zcmMvZm9vLnRzKScgfSxcblx0XHRcdG11bHRpRWRpdDogeyBtYXJrZG93bjogJ1JlcGxhY2luZyAzIGxpbmVzIHdpdGggMyBsaW5lcyBpbiBbZm9vLnRzXShmaWxlOi8vL3NyYy9mb28udHMpJyB9LFxuXHRcdFx0bm90ZWJvb2tFZGl0OiB7IG1hcmtkb3duOiAnRWRpdGluZyAyIGxpbmVzIGluIFtub3RlYm9vay5pcHluYl0oZmlsZTovLy9zcmMvbm90ZWJvb2suaXB5bmIpJyB9LFxuXHRcdFx0cmVhZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdQaGFzZSA4LjUgXHUyMDE0IHJpY2ggcmVuZGVyaW5nIHNuYXBzaG90IGNvdmVycyBldmVyeSB0b29sIHJvdycsICgpID0+IHtcblx0XHRjb25zdCBTQU1QTEVfSU5QVVQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge1xuXHRcdFx0QmFzaDogeyBjb21tYW5kOiAnZ2l0IHN0YXR1cycgfSxcblx0XHRcdEJhc2hPdXRwdXQ6IHsgYmFzaF9pZDogJ2IxJyB9LFxuXHRcdFx0S2lsbEJhc2g6IHsgYmFzaF9pZDogJ2IxJyB9LFxuXHRcdFx0UmVhZDogeyBmaWxlX3BhdGg6ICcvc3JjL2Zvby50cycgfSxcblx0XHRcdEdsb2I6IHsgcGF0dGVybjogJyoqLyoudHMnIH0sXG5cdFx0XHRHcmVwOiB7IHBhdHRlcm46ICdJQ2xhdWRlQWdlbnRTZXNzaW9uJyB9LFxuXHRcdFx0TFM6IHsgcGF0aDogJy9zcmMnIH0sXG5cdFx0XHROb3RlYm9va1JlYWQ6IHsgbm90ZWJvb2tfcGF0aDogJy9uYi5pcHluYicgfSxcblx0XHRcdFdyaXRlOiB7IGZpbGVfcGF0aDogJy9zcmMvZm9vLnRzJywgY29udGVudDogJy4uLicgfSxcblx0XHRcdEVkaXQ6IHsgZmlsZV9wYXRoOiAnL3NyYy9mb28udHMnLCBvbGRfc3RyaW5nOiAnYScsIG5ld19zdHJpbmc6ICdiJyB9LFxuXHRcdFx0TXVsdGlFZGl0OiB7IGZpbGVfcGF0aDogJy9zcmMvZm9vLnRzJywgZWRpdHM6IFtdIH0sXG5cdFx0XHROb3RlYm9va0VkaXQ6IHsgbm90ZWJvb2tfcGF0aDogJy9uYi5pcHluYicgfSxcblx0XHRcdFRvZG9Xcml0ZTogeyB0b2RvczogW10gfSxcblx0XHRcdFdlYkZldGNoOiB7IHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20nIH0sXG5cdFx0XHRUYXNrOiB7IGRlc2NyaXB0aW9uOiAnZmluZCB0aGUgYnVnJywgc3ViYWdlbnRfdHlwZTogJ0V4cGxvcmUnIH0sXG5cdFx0XHRFeGl0UGxhbk1vZGU6IHsgcGxhbjogJy4uLicgfSxcblx0XHRcdEFza1VzZXJRdWVzdGlvbjogeyBxdWVzdGlvbjogJ3doeT8nIH0sXG5cdFx0XHRTa2lsbDogeyBza2lsbDogJ2RlZXAtcmVzZWFyY2gnLCBhcmdzOiAnZm9vJyB9LFxuXHRcdFx0VGFza0NyZWF0ZTogeyBzdWJqZWN0OiAnRml4IGF1dGggYnVnJywgZGVzY3JpcHRpb246ICcuLi4nIH0sXG5cdFx0XHRUYXNrVXBkYXRlOiB7IHRhc2tJZDogJzEnLCBzdGF0dXM6ICdjb21wbGV0ZWQnIH0sXG5cdFx0XHRUYXNrTGlzdDoge30sXG5cdFx0XHRUYXNrR2V0OiB7IHRhc2tJZDogJzEnIH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IFRPT0xTID0gT2JqZWN0LmtleXMoU0FNUExFX0lOUFVUKSBhcyByZWFkb25seSAoa2V5b2YgdHlwZW9mIFNBTVBMRV9JTlBVVClbXTtcblxuXHRcdGNvbnN0IHNuYXBzaG90ID0gVE9PTFMubWFwKHQgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBTQU1QTEVfSU5QVVRbdF07XG5cdFx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IGdldENsYXVkZVRvb2xEaXNwbGF5TmFtZSh0KTtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdHQsXG5cdFx0XHRcdGdldENsYXVkZVRvb2xLaW5kKHQpLFxuXHRcdFx0XHRidWlsZENsYXVkZVRvb2xNZXRhKHQpLFxuXHRcdFx0XHRnZXRDbGF1ZGVJbnZvY2F0aW9uTWVzc2FnZSh0LCBkaXNwbGF5TmFtZSwgaW5wdXQpLFxuXHRcdFx0XHRnZXRDbGF1ZGVQYXN0VGVuc2VNZXNzYWdlKHQsIGRpc3BsYXlOYW1lLCBpbnB1dCwgdHJ1ZSksXG5cdFx0XHRcdGdldENsYXVkZVBhc3RUZW5zZU1lc3NhZ2UodCwgZGlzcGxheU5hbWUsIGlucHV0LCBmYWxzZSksXG5cdFx0XHRcdGdldENsYXVkZVRvb2xJbnB1dFN0cmluZyh0LCBpbnB1dCksXG5cdFx0XHRdIGFzIGNvbnN0O1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdCwgW1xuXHRcdFx0WydCYXNoJywgJ3Rlcm1pbmFsJywgeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LCB7IG1hcmtkb3duOiAnUnVubmluZyBgZ2l0IHN0YXR1c2AnIH0sIHsgbWFya2Rvd246ICdSYW4gYGdpdCBzdGF0dXNgJyB9LCAnXCJSdW4gc2hlbGwgY29tbWFuZFwiIGZhaWxlZCcsICdnaXQgc3RhdHVzJ10sXG5cdFx0XHRbJ0Jhc2hPdXRwdXQnLCAndGVybWluYWwnLCB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sICdSZWFkaW5nIHNoZWxsIG91dHB1dCcsICdSZWFkIHNoZWxsIG91dHB1dCcsICdcIlJlYWQgc2hlbGwgb3V0cHV0XCIgZmFpbGVkJywgJ3tcXG4gIFwiYmFzaF9pZFwiOiBcImIxXCJcXG59J10sXG5cdFx0XHRbJ0tpbGxCYXNoJywgJ3Rlcm1pbmFsJywgeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LCAnS2lsbGluZyBzaGVsbCBjb21tYW5kJywgJ0tpbGxlZCBzaGVsbCBjb21tYW5kJywgJ1wiS2lsbCBzaGVsbCBjb21tYW5kXCIgZmFpbGVkJywgJ3tcXG4gIFwiYmFzaF9pZFwiOiBcImIxXCJcXG59J10sXG5cdFx0XHRbJ1JlYWQnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgeyBtYXJrZG93bjogJ1JlYWRpbmcgW2Zvby50c10oZmlsZTovLy9zcmMvZm9vLnRzKScgfSwgeyBtYXJrZG93bjogJ1JlYWQgW2Zvby50c10oZmlsZTovLy9zcmMvZm9vLnRzKScgfSwgJ1wiUmVhZCBmaWxlXCIgZmFpbGVkJywgJ3tcXG4gIFwiZmlsZV9wYXRoXCI6IFwiL3NyYy9mb28udHNcIlxcbn0nXSxcblx0XHRcdFsnR2xvYicsICdzZWFyY2gnLCB7IHRvb2xLaW5kOiAnc2VhcmNoJyB9LCB7IG1hcmtkb3duOiAnRmluZGluZyBmaWxlcyBtYXRjaGluZyBgKiovKi50c2AnIH0sIHsgbWFya2Rvd246ICdGb3VuZCBmaWxlcyBtYXRjaGluZyBgKiovKi50c2AnIH0sICdcIkZpbmQgZmlsZXNcIiBmYWlsZWQnLCAnKiovKi50cyddLFxuXHRcdFx0WydHcmVwJywgJ3NlYXJjaCcsIHsgdG9vbEtpbmQ6ICdzZWFyY2gnIH0sIHsgbWFya2Rvd246ICdTZWFyY2hpbmcgZm9yIGBJQ2xhdWRlQWdlbnRTZXNzaW9uYCcgfSwgeyBtYXJrZG93bjogJ1NlYXJjaGVkIGZvciBgSUNsYXVkZUFnZW50U2Vzc2lvbmAnIH0sICdcIlNlYXJjaCBmaWxlc1wiIGZhaWxlZCcsICdJQ2xhdWRlQWdlbnRTZXNzaW9uJ10sXG5cdFx0XHRbJ0xTJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHsgbWFya2Rvd246ICdMaXN0aW5nIFtzcmNdKGZpbGU6Ly8vc3JjKScgfSwgeyBtYXJrZG93bjogJ0xpc3RlZCBbc3JjXShmaWxlOi8vL3NyYyknIH0sICdcIkxpc3QgZGlyZWN0b3J5XCIgZmFpbGVkJywgJ3tcXG4gIFwicGF0aFwiOiBcIi9zcmNcIlxcbn0nXSxcblx0XHRcdFsnTm90ZWJvb2tSZWFkJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHsgbWFya2Rvd246ICdSZWFkaW5nIFtuYi5pcHluYl0oZmlsZTovLy9uYi5pcHluYiknIH0sIHsgbWFya2Rvd246ICdSZWFkIFtuYi5pcHluYl0oZmlsZTovLy9uYi5pcHluYiknIH0sICdcIlJlYWQgbm90ZWJvb2tcIiBmYWlsZWQnLCAne1xcbiAgXCJub3RlYm9va19wYXRoXCI6IFwiL25iLmlweW5iXCJcXG59J10sXG5cdFx0XHRbJ1dyaXRlJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHsgbWFya2Rvd246ICdFZGl0aW5nIFtmb28udHNdKGZpbGU6Ly8vc3JjL2Zvby50cyknIH0sIHsgbWFya2Rvd246ICdFZGl0ZWQgW2Zvby50c10oZmlsZTovLy9zcmMvZm9vLnRzKScgfSwgJ1wiV3JpdGUgZmlsZVwiIGZhaWxlZCcsICd7XFxuICBcImZpbGVfcGF0aFwiOiBcIi9zcmMvZm9vLnRzXCIsXFxuICBcImNvbnRlbnRcIjogXCIuLi5cIlxcbn0nXSxcblx0XHRcdFsnRWRpdCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7IG1hcmtkb3duOiAnRWRpdGluZyBbZm9vLnRzXShmaWxlOi8vL3NyYy9mb28udHMpJyB9LCB7IG1hcmtkb3duOiAnRWRpdGVkIFtmb28udHNdKGZpbGU6Ly8vc3JjL2Zvby50cyknIH0sICdcIkVkaXQgZmlsZVwiIGZhaWxlZCcsICd7XFxuICBcImZpbGVfcGF0aFwiOiBcIi9zcmMvZm9vLnRzXCIsXFxuICBcIm9sZF9zdHJpbmdcIjogXCJhXCIsXFxuICBcIm5ld19zdHJpbmdcIjogXCJiXCJcXG59J10sXG5cdFx0XHRbJ011bHRpRWRpdCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7IG1hcmtkb3duOiAnRWRpdGluZyBbZm9vLnRzXShmaWxlOi8vL3NyYy9mb28udHMpJyB9LCB7IG1hcmtkb3duOiAnRWRpdGVkIFtmb28udHNdKGZpbGU6Ly8vc3JjL2Zvby50cyknIH0sICdcIkVkaXQgZmlsZVwiIGZhaWxlZCcsICd7XFxuICBcImZpbGVfcGF0aFwiOiBcIi9zcmMvZm9vLnRzXCIsXFxuICBcImVkaXRzXCI6IFtdXFxufSddLFxuXHRcdFx0WydOb3RlYm9va0VkaXQnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgeyBtYXJrZG93bjogJ0VkaXRpbmcgW25iLmlweW5iXShmaWxlOi8vL25iLmlweW5iKScgfSwgeyBtYXJrZG93bjogJ0VkaXRlZCBbbmIuaXB5bmJdKGZpbGU6Ly8vbmIuaXB5bmIpJyB9LCAnXCJFZGl0IG5vdGVib29rXCIgZmFpbGVkJywgJ3tcXG4gIFwibm90ZWJvb2tfcGF0aFwiOiBcIi9uYi5pcHluYlwiXFxufSddLFxuXHRcdFx0WydUb2RvV3JpdGUnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ1VwZGF0aW5nIHRvZG8gbGlzdCcsICdVcGRhdGVkIHRvZG8gbGlzdCcsICdcIlVwZGF0ZSB0b2RvIGxpc3RcIiBmYWlsZWQnLCAne1xcbiAgXCJ0b2Rvc1wiOiBbXVxcbn0nXSxcblx0XHRcdFsnV2ViRmV0Y2gnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgeyBtYXJrZG93bjogJ0ZldGNoaW5nIFtodHRwczovL2V4YW1wbGUuY29tXShodHRwczovL2V4YW1wbGUuY29tKScgfSwgeyBtYXJrZG93bjogJ0ZldGNoZWQgW2h0dHBzOi8vZXhhbXBsZS5jb21dKGh0dHBzOi8vZXhhbXBsZS5jb20pJyB9LCAnXCJGZXRjaCBVUkxcIiBmYWlsZWQnLCAne1xcbiAgXCJ1cmxcIjogXCJodHRwczovL2V4YW1wbGUuY29tXCJcXG59J10sXG5cdFx0XHRbJ1Rhc2snLCAnc3ViYWdlbnQnLCB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnIH0sICdmaW5kIHRoZSBidWcnLCAnUmFuIHN1YmFnZW50JywgJ1wiUnVuIHN1YmFnZW50IHRhc2tcIiBmYWlsZWQnLCAne1xcbiAgXCJkZXNjcmlwdGlvblwiOiBcImZpbmQgdGhlIGJ1Z1wiLFxcbiAgXCJzdWJhZ2VudF90eXBlXCI6IFwiRXhwbG9yZVwiXFxufSddLFxuXHRcdFx0WydFeGl0UGxhbk1vZGUnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ1JlYWR5IHRvIGNvZGU/JywgJ1JlYWR5IHRvIGNvZGU/JywgJ1wiUmVhZHkgdG8gY29kZT9cIiBmYWlsZWQnLCAne1xcbiAgXCJwbGFuXCI6IFwiLi4uXCJcXG59J10sXG5cdFx0XHRbJ0Fza1VzZXJRdWVzdGlvbicsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnQXNrIHVzZXIgYSBxdWVzdGlvbicsICdBc2sgdXNlciBhIHF1ZXN0aW9uJywgJ1wiQXNrIHVzZXIgYSBxdWVzdGlvblwiIGZhaWxlZCcsICd7XFxuICBcInF1ZXN0aW9uXCI6IFwid2h5P1wiXFxufSddLFxuXHRcdFx0WydTa2lsbCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7IG1hcmtkb3duOiAnUnVubmluZyBza2lsbCBgZGVlcC1yZXNlYXJjaGAnIH0sIHsgbWFya2Rvd246ICdSYW4gc2tpbGwgYGRlZXAtcmVzZWFyY2hgJyB9LCAnXCJSdW4gc2tpbGxcIiBmYWlsZWQnLCAne1xcbiAgXCJza2lsbFwiOiBcImRlZXAtcmVzZWFyY2hcIixcXG4gIFwiYXJnc1wiOiBcImZvb1wiXFxufSddLFxuXHRcdFx0WydUYXNrQ3JlYXRlJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsICdDcmVhdGluZyB0YXNrOiBGaXggYXV0aCBidWcnLCAnQ3JlYXRlZCB0YXNrOiBGaXggYXV0aCBidWcnLCAnXCJDcmVhdGUgdGFza1wiIGZhaWxlZCcsICd7XFxuICBcInN1YmplY3RcIjogXCJGaXggYXV0aCBidWdcIixcXG4gIFwiZGVzY3JpcHRpb25cIjogXCIuLi5cIlxcbn0nXSxcblx0XHRcdFsnVGFza1VwZGF0ZScsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnQ29tcGxldGluZyB0YXNrJywgJ0NvbXBsZXRlZCB0YXNrJywgJ1wiVXBkYXRlIHRhc2tcIiBmYWlsZWQnLCAne1xcbiAgXCJ0YXNrSWRcIjogXCIxXCIsXFxuICBcInN0YXR1c1wiOiBcImNvbXBsZXRlZFwiXFxufSddLFxuXHRcdFx0WydUYXNrTGlzdCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnUmVhZGluZyB0YXNrIGxpc3QnLCAnUmVhZCB0YXNrIGxpc3QnLCAnXCJMaXN0IHRhc2tzXCIgZmFpbGVkJywgJ3t9J10sXG5cdFx0XHRbJ1Rhc2tHZXQnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ1JlYWRpbmcgdGFzaycsICdSZWFkIHRhc2snLCAnXCJSZWFkIHRhc2tcIiBmYWlsZWQnLCAne1xcbiAgXCJ0YXNrSWRcIjogXCIxXCJcXG59J10sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BoYXNlIDguNSBcdTIwMTQgVGFza1VwZGF0ZSBtZXNzYWdlIHZhcmllcyBieSBzdGF0dXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW52b2tlID0gKHN0YXR1cz86IHN0cmluZykgPT5cblx0XHRcdGdldENsYXVkZUludm9jYXRpb25NZXNzYWdlKCdUYXNrVXBkYXRlJywgJ1VwZGF0ZSB0YXNrJywgc3RhdHVzID8geyB0YXNrSWQ6ICcxJywgc3RhdHVzIH0gOiB7IHRhc2tJZDogJzEnIH0pO1xuXHRcdGNvbnN0IHBhc3QgPSAoc3RhdHVzPzogc3RyaW5nKSA9PlxuXHRcdFx0Z2V0Q2xhdWRlUGFzdFRlbnNlTWVzc2FnZSgnVGFza1VwZGF0ZScsICdVcGRhdGUgdGFzaycsIHN0YXR1cyA/IHsgdGFza0lkOiAnMScsIHN0YXR1cyB9IDogeyB0YXNrSWQ6ICcxJyB9LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRzdGFydEludm9rZTogaW52b2tlKCdpbl9wcm9ncmVzcycpLFxuXHRcdFx0XHRzdGFydFBhc3Q6IHBhc3QoJ2luX3Byb2dyZXNzJyksXG5cdFx0XHRcdGNvbXBsZXRlSW52b2tlOiBpbnZva2UoJ2NvbXBsZXRlZCcpLFxuXHRcdFx0XHRjb21wbGV0ZVBhc3Q6IHBhc3QoJ2NvbXBsZXRlZCcpLFxuXHRcdFx0XHRkZWxldGVJbnZva2U6IGludm9rZSgnZGVsZXRlZCcpLFxuXHRcdFx0XHRkZWxldGVQYXN0OiBwYXN0KCdkZWxldGVkJyksXG5cdFx0XHRcdG5vU3RhdHVzSW52b2tlOiBpbnZva2UoKSxcblx0XHRcdFx0bm9TdGF0dXNQYXN0OiBwYXN0KCksXG5cdFx0XHRcdHVua25vd25TdGF0dXNJbnZva2U6IGludm9rZSgnYm9ndXMnKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHN0YXJ0SW52b2tlOiAnU3RhcnRpbmcgdGFzaycsXG5cdFx0XHRcdHN0YXJ0UGFzdDogJ1N0YXJ0ZWQgdGFzaycsXG5cdFx0XHRcdGNvbXBsZXRlSW52b2tlOiAnQ29tcGxldGluZyB0YXNrJyxcblx0XHRcdFx0Y29tcGxldGVQYXN0OiAnQ29tcGxldGVkIHRhc2snLFxuXHRcdFx0XHRkZWxldGVJbnZva2U6ICdEZWxldGluZyB0YXNrJyxcblx0XHRcdFx0ZGVsZXRlUGFzdDogJ0RlbGV0ZWQgdGFzaycsXG5cdFx0XHRcdG5vU3RhdHVzSW52b2tlOiAnVXBkYXRpbmcgdGFzaycsXG5cdFx0XHRcdG5vU3RhdHVzUGFzdDogJ1VwZGF0ZWQgdGFzaycsXG5cdFx0XHRcdHVua25vd25TdGF0dXNJbnZva2U6ICdVcGRhdGluZyB0YXNrJyxcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnUGhhc2UgOC41IFx1MjAxNCBkZWZlbnNpdmUgaW5wdXQgaGFuZGxpbmcgZmFsbHMgYmFjayB0byBzdGF0aWMgZGlzcGxheSBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGJhc2hOb0NvbW1hbmQ6IGdldENsYXVkZUludm9jYXRpb25NZXNzYWdlKCdCYXNoJywgJ1J1biBzaGVsbCBjb21tYW5kJywge30pLFxuXHRcdFx0XHRiYXNoV3JvbmdUeXBlOiBnZXRDbGF1ZGVJbnZvY2F0aW9uTWVzc2FnZSgnQmFzaCcsICdSdW4gc2hlbGwgY29tbWFuZCcsIHsgY29tbWFuZDogNDIgfSksXG5cdFx0XHRcdHJlYWRNaXNzaW5nUGF0aDogZ2V0Q2xhdWRlSW52b2NhdGlvbk1lc3NhZ2UoJ1JlYWQnLCAnUmVhZCBmaWxlJywge30pLFxuXHRcdFx0XHRncmVwTWlzc2luZ1BhdHRlcm46IGdldENsYXVkZUludm9jYXRpb25NZXNzYWdlKCdHcmVwJywgJ1NlYXJjaCBmaWxlcycsIHt9KSxcblx0XHRcdFx0bm9uT2JqZWN0SW5wdXQ6IGdldENsYXVkZUludm9jYXRpb25NZXNzYWdlKCdCYXNoJywgJ1J1biBzaGVsbCBjb21tYW5kJywgbnVsbCksXG5cdFx0XHRcdHVuZGVmaW5lZElucHV0OiBnZXRDbGF1ZGVJbnZvY2F0aW9uTWVzc2FnZSgnQmFzaCcsICdSdW4gc2hlbGwgY29tbWFuZCcsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHRhc2tOb0Rlc2NyaXB0aW9uOiBnZXRDbGF1ZGVJbnZvY2F0aW9uTWVzc2FnZSgnVGFzaycsICdSdW4gc3ViYWdlbnQgdGFzaycsIHt9KSxcblx0XHRcdFx0YmFzaEZhaWxlZDogZ2V0Q2xhdWRlUGFzdFRlbnNlTWVzc2FnZSgnQmFzaCcsICdSdW4gc2hlbGwgY29tbWFuZCcsIHsgY29tbWFuZDogJ3gnIH0sIGZhbHNlKSxcblx0XHRcdFx0aW5wdXRTdHJpbmdVbmRlZmluZWQ6IGdldENsYXVkZVRvb2xJbnB1dFN0cmluZygnQmFzaCcsIHVuZGVmaW5lZCksXG5cdFx0XHRcdGlucHV0U3RyaW5nQmFzaE5vQ29tbWFuZDogZ2V0Q2xhdWRlVG9vbElucHV0U3RyaW5nKCdCYXNoJywge30pLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0YmFzaE5vQ29tbWFuZDogJ1J1bm5pbmcgc2hlbGwgY29tbWFuZCcsXG5cdFx0XHRcdGJhc2hXcm9uZ1R5cGU6ICdSdW5uaW5nIHNoZWxsIGNvbW1hbmQnLFxuXHRcdFx0XHRyZWFkTWlzc2luZ1BhdGg6ICdSZWFkaW5nIGZpbGUnLFxuXHRcdFx0XHRncmVwTWlzc2luZ1BhdHRlcm46ICdTZWFyY2hpbmcgZmlsZXMnLFxuXHRcdFx0XHRub25PYmplY3RJbnB1dDogJ1J1bm5pbmcgc2hlbGwgY29tbWFuZCcsXG5cdFx0XHRcdHVuZGVmaW5lZElucHV0OiAnUnVubmluZyBzaGVsbCBjb21tYW5kJyxcblx0XHRcdFx0dGFza05vRGVzY3JpcHRpb246ICdSdW4gc3ViYWdlbnQgdGFzaycsXG5cdFx0XHRcdGJhc2hGYWlsZWQ6ICdcIlJ1biBzaGVsbCBjb21tYW5kXCIgZmFpbGVkJyxcblx0XHRcdFx0aW5wdXRTdHJpbmdVbmRlZmluZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0aW5wdXRTdHJpbmdCYXNoTm9Db21tYW5kOiAne30nLFxuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdQaGFzZSA4LjUgXHUyMDE0IEFnZW50IHJvdyBtaXJyb3JzIFRhc2sgKHN1YmFnZW50IGtpbmQsIHNhbWUgZGlzcGxheSBuYW1lKScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W1xuXHRcdFx0XHRnZXRDbGF1ZGVUb29sS2luZCgnQWdlbnQnKSxcblx0XHRcdFx0YnVpbGRDbGF1ZGVUb29sTWV0YSgnQWdlbnQnKSxcblx0XHRcdFx0Z2V0Q2xhdWRlVG9vbERpc3BsYXlOYW1lKCdBZ2VudCcpLFxuXHRcdFx0XHRnZXRDbGF1ZGVQZXJtaXNzaW9uS2luZCgnQWdlbnQnKSxcblx0XHRcdFx0Z2V0Q2xhdWRlSW52b2NhdGlvbk1lc3NhZ2UoJ0FnZW50JywgZ2V0Q2xhdWRlVG9vbERpc3BsYXlOYW1lKCdBZ2VudCcpLCB7IGRlc2NyaXB0aW9uOiAncmV2aWV3IHRoaXMnIH0pLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J3N1YmFnZW50Jyxcblx0XHRcdFx0eyB0b29sS2luZDogJ3N1YmFnZW50JyB9LFxuXHRcdFx0XHQnUnVuIHN1YmFnZW50IHRhc2snLFxuXHRcdFx0XHQnY3VzdG9tLXRvb2wnLFxuXHRcdFx0XHQncmV2aWV3IHRoaXMnLFxuXHRcdFx0XSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdQaGFzZSA4LjUgXHUyMDE0IE1DUCB0b29scyBoYXZlIG5vIHRvb2xLaW5kLCBKU09OIGlucHV0IGZhbGxiYWNrJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6IGdldENsYXVkZVRvb2xLaW5kKCdtY3BfX2dpdGh1Yl9fbGlzdElzc3VlcycpLFxuXHRcdFx0XHRtZXRhOiBidWlsZENsYXVkZVRvb2xNZXRhKCdtY3BfX2dpdGh1Yl9fbGlzdElzc3VlcycpLFxuXHRcdFx0XHRpbnB1dFN0cmluZzogZ2V0Q2xhdWRlVG9vbElucHV0U3RyaW5nKCdtY3BfX2dpdGh1Yl9fbGlzdElzc3VlcycsIHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJyB9KSxcblx0XHRcdFx0aW52b2NhdGlvbjogZ2V0Q2xhdWRlSW52b2NhdGlvbk1lc3NhZ2UoJ21jcF9fZ2l0aHViX19saXN0SXNzdWVzJywgJ1J1biBNQ1AgdG9vbCBnaXRodWJfX2xpc3RJc3N1ZXMnLCB7IG93bmVyOiAnbWljcm9zb2Z0JyB9KSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bWV0YTogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbnB1dFN0cmluZzogJ3tcXG4gIFwib3duZXJcIjogXCJtaWNyb3NvZnRcIixcXG4gIFwicmVwb1wiOiBcInZzY29kZVwiXFxufScsXG5cdFx0XHRcdGludm9jYXRpb246ICdSdW4gTUNQIHRvb2wgZ2l0aHViX19saXN0SXNzdWVzJyxcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RDtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFRUCxNQUFNLGdEQUF3QyxNQUFNO0FBRW5ELDBDQUF3QztBQUV4QyxPQUFLLG1EQUFnRCxNQUFNO0FBQzFELFVBQU0sUUFBUTtBQUFBLE1BQ2I7QUFBQSxNQUFRO0FBQUEsTUFBYztBQUFBLE1BQ3RCO0FBQUEsTUFBUTtBQUFBLE1BQVE7QUFBQSxNQUFRO0FBQUEsTUFBTTtBQUFBLE1BQzlCO0FBQUEsTUFBUztBQUFBLE1BQVE7QUFBQSxNQUFhO0FBQUEsTUFBZ0I7QUFBQSxNQUM5QztBQUFBLE1BQVk7QUFBQSxNQUNaO0FBQUEsTUFBZ0I7QUFBQSxNQUNoQjtBQUFBLE1BQVM7QUFBQSxNQUFjO0FBQUEsTUFBYztBQUFBLE1BQVk7QUFBQSxJQUNsRDtBQUVBLFVBQU0sV0FBVyxNQUFNLElBQUksT0FBSyxDQUFDLEdBQUcsd0JBQXdCLENBQUMsR0FBRyx5QkFBeUIsQ0FBQyxDQUFDLENBQVU7QUFFckcsV0FBTyxnQkFBZ0IsVUFBVTtBQUFBLE1BQ2hDLENBQUMsUUFBUSxTQUFTLG1CQUFtQjtBQUFBLE1BQ3JDLENBQUMsY0FBYyxTQUFTLG1CQUFtQjtBQUFBLE1BQzNDLENBQUMsWUFBWSxTQUFTLG9CQUFvQjtBQUFBLE1BQzFDLENBQUMsUUFBUSxRQUFRLFdBQVc7QUFBQSxNQUM1QixDQUFD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
