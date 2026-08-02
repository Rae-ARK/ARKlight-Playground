import * as dom from "../../../../../base/browser/dom.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { autorun, constObservable } from "../../../../../base/common/observable.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { IMenuService, MenuId } from "../../../../../platform/actions/common/actions.js";
import { ChatRequestTextPart } from "../../../../contrib/chat/common/requestParser/chatParserTypes.js";
import { ChatModel } from "../../../../contrib/chat/common/model/chatModel.js";
import { ChatViewModel } from "../../../../contrib/chat/common/model/chatViewModel.js";
import { ChatListWidget } from "../../../../contrib/chat/browser/widget/chatListWidget.js";
import { ChatInputPart } from "../../../../contrib/chat/browser/widget/input/chatInputPart.js";
import { IChatWidgetService } from "../../../../contrib/chat/browser/chat.js";
import { ElicitationState, IChatService } from "../../../../contrib/chat/common/chatService/chatService.js";
import { ChatElicitationRequestPart } from "../../../../contrib/chat/common/model/chatProgressTypes/chatElicitationRequestPart.js";
import { ChatToolInvocation } from "../../../../contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../../../contrib/chat/common/tools/languageModelToolsService.js";
import { IChatToolRiskAssessmentService, ToolRiskLevel } from "../../../../contrib/chat/browser/tools/chatToolRiskAssessmentService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../../../contrib/chat/common/constants.js";
import { SessionType } from "../../../../contrib/chat/common/chatSessionsService.js";
import { IChatResponseFileChangesService } from "../../../../contrib/chat/browser/chatResponseFileChangesService.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from "../fixtureUtils.js";
import { registerChatFixtureServices } from "./chatFixtureUtils.js";
import { isChatTurnStatusPillsEnabled } from "../../../../contrib/chat/browser/widget/chatTurnPills.js";
import "../../../../contrib/chat/browser/widget/media/chat.css";
function makeFileDiff(change) {
  const modifiedURI = URI.file(`/repo/${change.name}`);
  const originalURI = change.created ? modifiedURI : URI.file(`/repo/.original/${change.name}`);
  return { originalURI, modifiedURI, added: change.added, removed: change.removed, quitEarly: false, identical: false, isFinal: true, isBusy: false };
}
function makeUserMessage(text) {
  return {
    text,
    parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
  };
}
async function renderChatWidget(context, options) {
  const { container, disposableStore } = context;
  const widgetHolder = { current: void 0 };
  const fixtureToolData = {
    id: "fixture.terminalTool",
    displayName: "Terminal",
    modelDescription: "Run a command in the terminal",
    source: ToolDataSource.Internal
  };
  const hasRiskAssessment = options.messages.some((m) => m.assistant?.some((p) => (p.kind === "terminalConfirmation" || p.kind === "elicitation") && p.riskAssessment));
  const hasRiskLoading = options.messages.some((m) => m.assistant?.some((p) => (p.kind === "terminalConfirmation" || p.kind === "elicitation") && p.riskLoading));
  const riskFeatureExplicitlyDisabled = options.riskAssessmentEnabled === false;
  const needsRiskService = hasRiskAssessment || hasRiskLoading || riskFeatureExplicitlyDisabled;
  const requestDiffs = /* @__PURE__ */ new Map();
  const needsTurnPills = isChatTurnStatusPillsEnabled(options.turnStatusPills);
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: context.theme,
    additionalServices: (reg) => {
      registerChatFixtureServices(reg);
      reg.defineInstance(IChatWidgetService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.lastFocusedWidget = void 0;
          this.onDidAddWidget = Event.None;
          this.onDidBackgroundSession = Event.None;
          this.onDidChangeFocusedWidget = Event.None;
          this.onDidChangeFocusedSession = Event.None;
        }
        getAllWidgets() {
          return widgetHolder.current ? [widgetHolder.current] : [];
        }
        getWidgetByInputUri() {
          return void 0;
        }
        getWidgetBySessionResource() {
          return widgetHolder.current;
        }
        getWidgetsByLocations() {
          return [];
        }
        register() {
          return { dispose() {
          } };
        }
      }());
      if (needsTurnPills) {
        reg.defineInstance(IChatResponseFileChangesService, new class extends mock() {
          getChangesForRequest(_sessionResource, requestId) {
            return constObservable(requestDiffs.get(requestId) ?? []);
          }
        }());
      }
      if (needsRiskService) {
        reg.defineInstance(ILanguageModelToolsService, new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidChangeTools = Event.None;
            this.onDidPrepareToolCallBecomeUnresponsive = Event.None;
          }
          getTools() {
            return [fixtureToolData];
          }
          getTool(id) {
            return id === fixtureToolData.id ? fixtureToolData : void 0;
          }
        }());
        reg.defineInstance(IChatToolRiskAssessmentService, new class extends mock() {
          isEnabled() {
            return !riskFeatureExplicitlyDisabled;
          }
          getCached() {
            for (const m of options.messages) {
              for (const p of m.assistant ?? []) {
                if ((p.kind === "terminalConfirmation" || p.kind === "elicitation") && p.riskAssessment) {
                  return p.riskAssessment;
                }
              }
            }
            return void 0;
          }
          // For riskLoading: assess() never resolves, keeping the badge in loading state.
          async assess() {
            return new Promise(() => {
            });
          }
        }());
      }
    }
  });
  const configService = instantiationService.get(IConfigurationService);
  configService.setUserConfiguration("chat", {
    editor: { fontSize: 13, fontFamily: "default", fontWeight: "default", lineHeight: 0, wordWrap: "off" }
  });
  configService.setUserConfiguration("editor", { fontFamily: "monospace", fontLigatures: false });
  configService.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, true);
  if (options.verbose !== void 0) {
    configService.setUserConfiguration(ChatConfiguration.Verbose, options.verbose);
  }
  if (needsTurnPills) {
    configService.setUserConfiguration(ChatConfiguration.TurnStatusPills, options.turnStatusPills);
  }
  const sessionResource = needsTurnPills ? URI.from({ scheme: SessionType.AgentHostCopilot, path: "/turn-pills-session" }) : void 0;
  const chatService = instantiationService.get(IChatService);
  const model = disposableStore.add(instantiationService.createInstance(
    ChatModel,
    void 0,
    { initialLocation: ChatAgentLocation.Chat, canUseTools: true, resource: sessionResource }
  ));
  chatService.addSession(model);
  for (const message of options.messages) {
    const request = model.addRequest(makeUserMessage(message.user), { variables: [] }, 0);
    const response = request.response;
    if (message.fileChanges) {
      requestDiffs.set(request.id, message.fileChanges.map(makeFileDiff));
    }
    for (const part of message.assistant ?? []) {
      if (part.kind === "markdown") {
        model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString(part.text) });
      } else if (part.kind === "progress") {
        model.acceptResponseProgress(request, { kind: "progressMessage", content: new MarkdownString(part.text) });
      } else if (part.kind === "elicitation") {
        const elicitation = new ChatElicitationRequestPart(
          part.title,
          part.message,
          "",
          "Continue",
          "Cancel",
          async () => ElicitationState.Accepted,
          async () => ElicitationState.Rejected,
          void 0,
          void 0,
          void 0,
          part.riskAssessment || part.riskLoading ? { toolId: fixtureToolData.id, parameters: void 0 } : void 0
        );
        model.acceptResponseProgress(request, elicitation);
      } else if (part.kind === "terminalConfirmation") {
        const title = part.title ?? `Run pwsh command?`;
        const toolInvocation = new ChatToolInvocation(
          {
            invocationMessage: new MarkdownString(`Running \`${part.command}\``),
            pastTenseMessage: new MarkdownString(`Ran \`${part.command}\``),
            confirmationMessages: { title, message: new MarkdownString(`\`${part.command}\``), disclaimer: part.disclaimer ? new MarkdownString(part.disclaimer, { supportThemeIcons: true }) : void 0 },
            toolSpecificData: {
              kind: "terminal",
              commandLine: { original: part.command },
              language: "pwsh",
              requestUnsandboxedExecution: part.requestUnsandboxedExecution,
              requestUnsandboxedExecutionReason: part.requestUnsandboxedExecutionReason,
              confirmation: part.confirmation
            }
          },
          fixtureToolData,
          generateUuid(),
          void 0,
          { command: part.command }
        );
        model.acceptResponseProgress(request, toolInvocation);
      }
    }
    if (message.details) {
      response.setResult({ details: message.details });
    }
    if (message.responseComplete !== false) {
      response.complete();
    }
  }
  const viewModel = disposableStore.add(instantiationService.createInstance(ChatViewModel, model, void 0));
  const width = options.width ?? 720;
  const height = options.height ?? 600;
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.backgroundColor = "var(--vscode-sideBar-background, var(--vscode-editor-background))";
  container.classList.add("monaco-workbench");
  const auxBar = dom.$(".part.auxiliarybar");
  auxBar.style.width = "100%";
  auxBar.style.height = "100%";
  const auxContent = dom.$(".content");
  auxContent.style.width = "100%";
  auxContent.style.height = "100%";
  auxBar.appendChild(auxContent);
  container.appendChild(auxBar);
  const session = dom.$(".interactive-session");
  auxContent.appendChild(session);
  const menuService = instantiationService.get(IMenuService);
  menuService.addItem(MenuId.ChatInput, { command: { id: "workbench.action.chat.attachContext", title: "+", icon: Codicon.add }, group: "navigation", order: -1 });
  menuService.addItem(MenuId.ChatInput, { command: { id: "workbench.action.chat.openModePicker", title: "Agent" }, group: "navigation", order: 1 });
  menuService.addItem(MenuId.ChatInput, { command: { id: "workbench.action.chat.openModelPicker", title: "GPT-5.3-Codex" }, group: "navigation", order: 3 });
  menuService.addItem(MenuId.ChatInput, { command: { id: "workbench.action.chat.configureTools", title: "", icon: Codicon.settingsGear }, group: "navigation", order: 100 });
  menuService.addItem(MenuId.ChatExecute, { command: { id: "workbench.action.chat.submit", title: "Send", icon: Codicon.newLine }, group: "navigation", order: 4 });
  menuService.addItem(MenuId.ChatInputSecondary, { command: { id: "workbench.action.chat.openSessionTargetPicker", title: "Local" }, group: "navigation", order: 0 });
  menuService.addItem(MenuId.ChatInputSecondary, { command: { id: "workbench.action.chat.openPermissionPicker", title: "Default Approvals" }, group: "navigation", order: 10 });
  if (options.responseFooterAction) {
    menuService.addItem(MenuId.ChatMessageFooter, { command: { id: "workbench.action.chat.copyResponse", title: "Copy", icon: Codicon.copy }, group: "navigation", order: 1 });
  }
  const inputOptions = {
    renderFollowups: false,
    renderInputToolbarBelowInput: false,
    renderWorkingSet: false,
    menus: { executeToolbar: MenuId.ChatExecute, telemetrySource: "fixture" },
    widgetViewKindTag: "view",
    inputEditorMinLines: 2
  };
  const inputStyles = {
    overlayBackground: "var(--vscode-editor-background)",
    listForeground: "var(--vscode-foreground)",
    listBackground: "var(--vscode-editor-background)"
  };
  const inputPart = disposableStore.add(instantiationService.createInstance(ChatInputPart, ChatAgentLocation.Chat, inputOptions, inputStyles, false));
  const fixtureWidget = new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeViewModel = new Emitter().event;
      this.viewModel = viewModel;
      this.contribs = [];
      this.location = ChatAgentLocation.Chat;
      this.viewContext = {};
      this.inputPart = inputPart;
    }
  }();
  widgetHolder.current = fixtureWidget;
  inputPart.render(session, "", fixtureWidget);
  inputPart.layout(width);
  options.decorateInputPart?.(inputPart, instantiationService);
  inputPart.element.classList.toggle("chat-input-hidden", options.inputVisible === false);
  const listContainer = dom.$(".interactive-list");
  listContainer.style.flex = options.hostLayoutMode ? "0 0 auto" : "1 1 auto";
  listContainer.style.minHeight = "0";
  listContainer.style.position = "relative";
  session.insertBefore(listContainer, session.firstChild);
  const listWidget = disposableStore.add(instantiationService.createInstance(
    ChatListWidget,
    listContainer,
    {
      currentChatMode: () => ChatModeKind.Agent,
      defaultElementHeight: 120,
      styles: {
        listForeground: "var(--vscode-foreground)",
        listBackground: "var(--vscode-editor-background)"
      },
      location: ChatAgentLocation.Chat,
      rendererOptions: {
        progressMessageAtBottomOfResponse: (mode) => mode !== ChatModeKind.Ask
      }
    }
  ));
  listWidget.setViewModel(viewModel);
  listWidget.setVisible(true);
  listWidget.refresh();
  const listHeight = 420;
  listWidget.layout(listHeight, width);
  listWidget.scrollTop = 0;
  if (options.hostLayoutMode && options.hostLayoutMode !== "none") {
    let layouting = false;
    disposableStore.add(autorun((reader) => {
      const inputHeight = inputPart.height.read(reader);
      if (layouting) {
        return;
      }
      layouting = true;
      try {
        if (options.hostLayoutMode === "stackedFull") {
          inputPart.setMaxHeight(Math.max(0, height - 50));
          inputPart.layout(width);
        }
        const contentHeight = options.hostLayoutMode === "stackedFull" || options.hostLayoutMode === "stackedTargeted" ? Math.max(0, Math.max(116, inputHeight) - inputHeight) : Math.max(0, height - inputHeight);
        listContainer.style.height = `${contentHeight}px`;
        listContainer.dataset["expectedHeight"] = String(contentHeight);
        listWidget.layout(contentHeight, width);
      } finally {
        layouting = false;
      }
    }));
  }
  options.onRendered?.({
    inputPart,
    listWidget,
    model,
    width,
    addTerminalConfirmation: (request, command) => {
      model.acceptResponseProgress(request, new ChatToolInvocation(
        {
          invocationMessage: new MarkdownString(`Running \`${command}\``),
          pastTenseMessage: new MarkdownString(`Ran \`${command}\``),
          confirmationMessages: { title: "Run diagnostic command?", message: new MarkdownString(`\`${command}\``) },
          toolSpecificData: {
            kind: "terminal",
            commandLine: { original: command },
            language: "pwsh"
          }
        },
        fixtureToolData,
        generateUuid(),
        void 0,
        { command }
      ));
    }
  });
}
const SIMPLE_QA = [
  {
    user: "Add a fibonacci function to fibon.ts",
    assistant: [
      { kind: "markdown", text: "I added a recursive `fibonacci(n)` to `fibon.ts`. Note that recursion is exponential \u2014 for large `n` consider an iterative version." }
    ]
  }
];
const LAST_RESPONSE_HOVER = [
  {
    user: "Summarize the changes",
    assistant: [
      { kind: "markdown", text: "The response content ends here." }
    ],
    details: "Claude Opus 4.8 - 2 credits"
  }
];
async function renderLastResponseHover(context) {
  await renderChatWidget(context, {
    messages: LAST_RESPONSE_HOVER,
    height: 600,
    inputVisible: false,
    responseFooterAction: true
  });
  const response = context.container.querySelector(".interactive-response.chat-most-recent-response");
  response?.querySelector(":scope > .value")?.dispatchEvent(new MouseEvent("mouseenter"));
}
const KEYBOARD_FOCUS = [
  {
    user: "Summarize the changes",
    assistant: [
      { kind: "markdown", text: "The first response has keyboard-accessible actions." }
    ],
    details: "Claude Opus 4.8 - 2 credits"
  },
  {
    user: "What should I do next?",
    assistant: [
      { kind: "markdown", text: "Run the tests and review the diff." }
    ],
    details: "Claude Opus 4.8 - 1 credit"
  }
];
async function renderKeyboardFocus(context, target) {
  await renderChatWidget(context, {
    messages: KEYBOARD_FOCUS,
    height: 600,
    inputVisible: false,
    responseFooterAction: true,
    verbose: target === "request-timestamp"
  });
  const selector = target === "response-action" ? ".interactive-response:not(.chat-most-recent-response) .chat-footer-toolbar .action-label" : ".interactive-request .chat-request-timestamp";
  const focusTarget = context.container.querySelector(selector);
  if (!focusTarget) {
    throw new Error(`Missing keyboard focus target: ${target}`);
  }
  focusTarget.focus();
  if (focusTarget.ownerDocument.activeElement !== focusTarget) {
    throw new Error(`Could not focus keyboard target: ${target}`);
  }
}
const PENDING_TOOL_APPROVAL = [
  {
    user: "run git init",
    assistant: [
      {
        kind: "terminalConfirmation",
        command: "git init",
        riskAssessment: {
          risk: ToolRiskLevel.Orange,
          explanation: "Initializes a new Git repository in the current directory. Reversible by removing the .git folder."
        }
      }
    ],
    responseComplete: false
  }
];
const ISSUE_309796_MISSING_BACKSLASH = [
  {
    user: "install dependencies in the server directory",
    assistant: [
      {
        kind: "terminalConfirmation",
        command: "cd packages\\server && npm install",
        title: "Run `pwsh` command within `packages\\server`?",
        confirmation: {
          commandLine: "npm install",
          cwdLabel: "packages\\server",
          cdPrefix: "cd packages\\server && "
        }
      }
    ],
    responseComplete: false
  }
];
const STREAMING = [
  {
    user: "Search the workspace for TODO comments",
    assistant: [
      { kind: "progress", text: "Searching workspace for `TODO` comments..." }
    ],
    responseComplete: false
  }
];
const MULTI_TURN = [
  {
    user: "What does this project do?",
    assistant: [
      { kind: "markdown", text: "This project is **Visual Studio Code**, a free source-code editor made by Microsoft for Windows, Linux and macOS." }
    ]
  },
  {
    user: "Where is the entrypoint?",
    assistant: [
      { kind: "markdown", text: "The desktop entrypoint is in `src/vs/code/electron-main/main.ts`. The browser/server entrypoints live under `src/vs/server/`." }
    ]
  },
  {
    user: "Thanks!",
    assistant: [
      { kind: "markdown", text: "You are welcome \u2014 let me know if you have more questions." }
    ]
  }
];
const CODE_BLOCK_IN_LIST = [
  {
    user: "How do I set up the project?",
    assistant: [
      {
        kind: "markdown",
        text: [
          "Follow these steps:",
          "",
          "- Clone the repository",
          "- Install the dependencies",
          "",
          "```bash",
          "npm install",
          "```",
          "",
          "- Then start the build watcher:",
          "",
          "  ```bash",
          "  npm run watch",
          "  ```",
          "",
          "- Finally, launch the app"
        ].join("\n")
      }
    ]
  }
];
async function renderResizeObserverLoopHarness(context, hostLayoutMode) {
  const targetWindow = dom.getWindow(context.container);
  let handle;
  await renderChatWidget(context, {
    messages: [{
      user: [
        "Investigate ResizeObserver re-entry.",
        "",
        "Context (text/plain; no binary upload):",
        "Issue #316501 tracks chat list and input resize-observer loop warnings."
      ].join("\n"),
      assistant: [{
        kind: "markdown",
        text: "The mocked chat harness is ready."
      }]
    }],
    width: 720,
    height: 600,
    hostLayoutMode,
    onRendered: (value) => handle = value
  });
  if (!handle) {
    throw new Error("ResizeObserver harness did not initialize");
  }
  const fixtureHandle = handle;
  const controls = dom.$(".resize-observer-loop-harness");
  const runButton = dom.append(controls, dom.$("button.resize-observer-loop-run"));
  runButton.type = "button";
  runButton.textContent = "Run 20-turn burst";
  const status = dom.append(controls, dom.$("span.resize-observer-loop-status"));
  status.role = "status";
  status.textContent = "Ready";
  const warnings = dom.append(controls, dom.$("span.resize-observer-loop-warnings"));
  warnings.textContent = "Warnings: 0";
  controls.style.position = "absolute";
  controls.style.top = "8px";
  controls.style.right = "8px";
  controls.style.zIndex = "100";
  controls.style.display = "flex";
  controls.style.gap = "8px";
  controls.style.alignItems = "center";
  controls.style.padding = "6px 8px";
  controls.style.background = "var(--vscode-editorWidget-background)";
  controls.style.border = "1px solid var(--vscode-widget-border)";
  context.container.style.position = "relative";
  context.container.appendChild(controls);
  let warningCount = 0;
  context.disposableStore.add(dom.addDisposableListener(targetWindow, dom.EventType.ERROR, (event) => {
    if (event instanceof ErrorEvent && event.message.includes("ResizeObserver loop")) {
      warningCount++;
      warnings.textContent = `Warnings: ${warningCount}`;
      warnings.dataset["observerContext"] = dom.getRecentDisposableResizeObserverContextForLoopError(event.message, targetWindow) ?? event.message;
      status.textContent = "Captured ResizeObserver warning";
    }
  }));
  const nextFrame = () => new Promise((resolve) => targetWindow.requestAnimationFrame(() => resolve()));
  const runBurst = async () => {
    runButton.disabled = true;
    status.textContent = "Adding queued turns...";
    const responses = [];
    for (let index = 1; index <= 20; index++) {
      const prompt = [
        `Queued prompt ${index}`,
        "",
        "Context (text/plain; no binary upload):",
        ...Array.from({ length: 12 }, (_, line) => `Resize stress sample ${index}.${line + 1}: ${"layout ".repeat(index % 5 + 1)}`)
      ].join("\n");
      fixtureHandle.inputPart.setValue(prompt, true);
      fixtureHandle.inputPart.layout(fixtureHandle.width);
      const request = fixtureHandle.model.addRequest(makeUserMessage(prompt), { variables: [] }, 0);
      fixtureHandle.model.acceptResponseProgress(request, {
        kind: "progressMessage",
        content: new MarkdownString(`Processing queued prompt ${index}...`)
      });
      if (index === 1) {
        fixtureHandle.addTerminalConfirmation(request, "git status --short");
      }
      responses.push(request.response);
      fixtureHandle.listWidget.refresh();
      await nextFrame();
      fixtureHandle.inputPart.setValue("", true);
      fixtureHandle.inputPart.layout(fixtureHandle.width);
      fixtureHandle.model.acceptResponseProgress(request, {
        kind: "markdownContent",
        content: new MarkdownString(`Mock streamed output ${index}

${"- response line\n".repeat(index % 7 + 1)}`)
      });
      fixtureHandle.listWidget.refresh();
      await nextFrame();
    }
    status.textContent = "Completing mocked responses...";
    for (const response of responses) {
      response.complete();
      fixtureHandle.listWidget.refresh();
      await nextFrame();
    }
    status.textContent = warningCount > 0 ? "Completed with ResizeObserver warning" : "Completed without warning";
    runButton.disabled = false;
  };
  context.disposableStore.add(dom.addDisposableListener(runButton, dom.EventType.CLICK, () => {
    void runBurst();
  }));
}
var chatWidget_fixture_default = defineThemedFixtureGroup({ path: "chat/widget/" }, {
  SimpleQA: defineComponentFixture({ render: (ctx) => renderChatWidget(ctx, { messages: SIMPLE_QA }) }),
  Streaming: defineComponentFixture({ labels: { kind: "animated" }, render: (ctx) => renderChatWidget(ctx, { messages: STREAMING }) }),
  PendingToolApproval: defineComponentFixture({ render: (ctx) => renderChatWidget(ctx, { messages: PENDING_TOOL_APPROVAL }) }),
  ResizeObserverLoopHarness: defineComponentFixture({
    labels: { kind: "animated" },
    virtualTime: { enabled: false },
    render: (context) => renderResizeObserverLoopHarness(context, "stackedFull")
  }),
  ResizeObserverLoopListOnly: defineComponentFixture({
    labels: { kind: "animated" },
    virtualTime: { enabled: false },
    render: (context) => renderResizeObserverLoopHarness(context, "listOnly")
  }),
  ResizeObserverLoopStackedTargeted: defineComponentFixture({
    labels: { kind: "animated" },
    virtualTime: { enabled: false },
    render: (context) => renderResizeObserverLoopHarness(context, "stackedTargeted")
  }),
  ResizeObserverLoopNoHostLayout: defineComponentFixture({
    labels: { kind: "animated" },
    virtualTime: { enabled: false },
    render: (context) => renderResizeObserverLoopHarness(context, "none")
  }),
  CodeBlockInList: defineComponentFixture({ render: (ctx) => renderChatWidget(ctx, { messages: CODE_BLOCK_IN_LIST }) }),
  bugs: defineThemedFixtureGroup({
    "issue-309796-missing-backslash": defineComponentFixture({ render: (ctx) => renderChatWidget(ctx, { messages: ISSUE_309796_MISSING_BACKSLASH }) })
  }),
  MultiTurn: defineComponentFixture({ render: (ctx) => renderChatWidget(ctx, { messages: MULTI_TURN }) }),
  LastResponseContentHover: defineComponentFixture({ render: renderLastResponseHover }),
  ResponseActionKeyboardFocus: defineComponentFixture({ render: (ctx) => renderKeyboardFocus(ctx, "response-action") }),
  RequestTimestampKeyboardFocus: defineComponentFixture({ render: (ctx) => renderKeyboardFocus(ctx, "request-timestamp") })
});
export {
  chatWidget_fixture_default as default,
  renderChatWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvY2hhdC9jaGF0V2lkZ2V0LmZpeHR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0VGV4dFBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IENoYXRWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdExpc3RXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdExpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0UGFydCwgSUNoYXRJbnB1dFBhcnRPcHRpb25zLCBJQ2hhdElucHV0U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dFBhcnQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBFbGljaXRhdGlvblN0YXRlLCBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRFbGljaXRhdGlvblJlcXVlc3RQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0RWxpY2l0YXRpb25SZXF1ZXN0UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbEludm9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRUb29sSW52b2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSVRvb2xEYXRhLCBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UsIElUb29sUmlza0Fzc2Vzc21lbnQsIFRvb2xSaXNrTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci90b29scy9jaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0Q29uZmlndXJhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRTZXNzaW9uRW50cnlEaWZmIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi9jaGF0U2VydmljZS9tb2NrQ2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIGNyZWF0ZUVkaXRvclNlcnZpY2VzLCBkZWZpbmVDb21wb25lbnRGaXh0dXJlLCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAgfSBmcm9tICcuLi9maXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgRml4dHVyZU1lbnVTZXJ2aWNlLCByZWdpc3RlckNoYXRGaXh0dXJlU2VydmljZXMgfSBmcm9tICcuL2NoYXRGaXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgQ2hhdFR1cm5TdGF0dXNQaWxsc1NldHRpbmcsIGlzQ2hhdFR1cm5TdGF0dXNQaWxsc0VuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdFR1cm5QaWxscy5qcyc7XG5cbmltcG9ydCAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L21lZGlhL2NoYXQuY3NzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRml4dHVyZUZpbGVDaGFuZ2Uge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFkZGVkOiBudW1iZXI7XG5cdHJlYWRvbmx5IHJlbW92ZWQ6IG51bWJlcjtcblx0LyoqIFdoZXRoZXIgdGhlIGZpbGUgd2FzIGNyZWF0ZWQgKHZzLiBlZGl0ZWQpIGR1cmluZyB0aGUgdHVybi4gKi9cblx0cmVhZG9ubHkgY3JlYXRlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRml4dHVyZU1lc3NhZ2Uge1xuXHRyZWFkb25seSB1c2VyOiBzdHJpbmc7IC8vIHVzZXIgcHJvbXB0IHRleHRcblx0cmVhZG9ubHkgYXNzaXN0YW50PzogUmVhZG9ubHlBcnJheTxcblx0XHR8IHsga2luZDogJ21hcmtkb3duJzsgdGV4dDogc3RyaW5nIH1cblx0XHR8IHsga2luZDogJ3Byb2dyZXNzJzsgdGV4dDogc3RyaW5nIH1cblx0XHR8IHsga2luZDogJ3Rlcm1pbmFsQ29uZmlybWF0aW9uJzsgY29tbWFuZDogc3RyaW5nOyB0aXRsZT86IHN0cmluZzsgZGlzY2xhaW1lcj86IHN0cmluZzsgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uPzogYm9vbGVhbjsgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uPzogc3RyaW5nOyByaXNrQXNzZXNzbWVudD86IHsgcmlzazogVG9vbFJpc2tMZXZlbDsgZXhwbGFuYXRpb246IHN0cmluZyB9OyByaXNrTG9hZGluZz86IGJvb2xlYW47IGNvbmZpcm1hdGlvbj86IHsgY29tbWFuZExpbmU6IHN0cmluZzsgY3dkTGFiZWw/OiBzdHJpbmc7IGNkUHJlZml4Pzogc3RyaW5nIH0gfVxuXHRcdHwgeyBraW5kOiAnZWxpY2l0YXRpb24nOyB0aXRsZTogc3RyaW5nOyBtZXNzYWdlOiBzdHJpbmc7IGNvbmZpcm1hdGlvbj86IHsgY29tbWFuZExpbmU6IHN0cmluZzsgY3dkTGFiZWw/OiBzdHJpbmc7IGNkUHJlZml4Pzogc3RyaW5nIH07IHJpc2tBc3Nlc3NtZW50PzogeyByaXNrOiBUb29sUmlza0xldmVsOyBleHBsYW5hdGlvbjogc3RyaW5nIH07IHJpc2tMb2FkaW5nPzogYm9vbGVhbiB9XG5cdD47XG5cdHJlYWRvbmx5IGRldGFpbHM/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlc3BvbnNlQ29tcGxldGU/OiBib29sZWFuO1xuXHQvKipcblx0ICogUGVyLXR1cm4gZmlsZSBjaGFuZ2VzIHN1cmZhY2VkIHZpYSB7QGxpbmsgSUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZX0sXG5cdCAqIHVzZWQgYnkgdGhlIHR1cm4gY2hhbmdlcyBzdW1tYXJ5LiBSZXF1aXJlcyBgdHVyblN0YXR1c1BpbGxzYCBvbiB0aGUgZml4dHVyZVxuXHQgKiBvcHRpb25zIHRvIGJlIHJlbmRlcmVkLlxuXHQgKi9cblx0cmVhZG9ubHkgZmlsZUNoYW5nZXM/OiBSZWFkb25seUFycmF5PElGaXh0dXJlRmlsZUNoYW5nZT47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRXaWRnZXRGaXh0dXJlT3B0aW9ucyB7XG5cdHJlYWRvbmx5IG1lc3NhZ2VzOiBSZWFkb25seUFycmF5PElGaXh0dXJlTWVzc2FnZT47XG5cdHJlYWRvbmx5IHdpZHRoPzogbnVtYmVyO1xuXHRyZWFkb25seSBoZWlnaHQ/OiBudW1iZXI7XG5cdC8qKiBXaGV0aGVyIHRvIHJlbmRlciB0aGUgbWFpbiBjaGF0IGlucHV0LiBEZWZhdWx0cyB0byBgdHJ1ZWAuICovXG5cdHJlYWRvbmx5IGlucHV0VmlzaWJsZT86IGJvb2xlYW47XG5cdC8qKiBXaGV0aGVyIHRvIHBvcHVsYXRlIHRoZSByZXNwb25zZSBmb290ZXIgd2l0aCBhbiBhY3Rpb24uICovXG5cdHJlYWRvbmx5IHJlc3BvbnNlRm9vdGVyQWN0aW9uPzogYm9vbGVhbjtcblx0LyoqIFdoZXRoZXIgdG8gc2hvdyByZXF1ZXN0IGFuZCByZXNwb25zZSB0aW1pbmcgZGV0YWlscy4gKi9cblx0cmVhZG9ubHkgdmVyYm9zZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBXaGVuIGBmYWxzZWAsIHJlZ2lzdGVycyBhIHN0dWIgYElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZWAgd2hvc2Vcblx0ICogYGlzRW5hYmxlZCgpYCByZXR1cm5zIGBmYWxzZWAsIGV4ZXJjaXNpbmcgdGhlIFwiZmVhdHVyZSBvZmZcIiBjb2RlIHBhdGguXG5cdCAqIFdoZW4gb21pdHRlZCwgYmVoYXZlcyBsaWtlIHRvZGF5IChhdXRvLWRldGVjdGVkIGZyb20gbWVzc2FnZSByaXNrIGRhdGEpLlxuXHQgKi9cblx0cmVhZG9ubHkgcmlza0Fzc2Vzc21lbnRFbmFibGVkPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGhvb2sgaW52b2tlZCBhZnRlciB0aGUgY2hhdCBpbnB1dCBwYXJ0IHJlbmRlcnMsIGUuZy4gdG8gbW91bnRcblx0ICogd2lkZ2V0cyBhYm92ZSB0aGUgaW5wdXQuIFJlY2VpdmVzIHRoZSByZW5kZXJlZCBpbnB1dCBwYXJ0IGFuZCB0aGUgZml4dHVyZSdzXG5cdCAqIGluc3RhbnRpYXRpb24gc2VydmljZSBzbyBjYWxsZXJzIGNhbiBjcmVhdGUgaW5zdGFuY2VzIGFnYWluc3QgdGhlIHNhbWVcblx0ICogc2VydmljZSBncmFwaC5cblx0ICovXG5cdHJlYWRvbmx5IGRlY29yYXRlSW5wdXRQYXJ0PzogKGlucHV0UGFydDogQ2hhdElucHV0UGFydCwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkgPT4gdm9pZDtcblx0LyoqXG5cdCAqIFdoZW4gc2V0LCByZW5kZXJzIHRoZSBjaGF0IGFzIGFuIGFnZW50IGhvc3Qgc2Vzc2lvbiBhbmQgZW5hYmxlcyB0aGUgdHVyblxuXHQgKiBjaGFuZ2VzIHN1bW1hcnkgKGBjaGF0LnR1cm5TdGF0dXNQaWxsc2ApLCBzbyBjb21wbGV0ZWQgdHVybnMgd2l0aFxuXHQgKiB7QGxpbmsgSUZpeHR1cmVNZXNzYWdlLmZpbGVDaGFuZ2VzfSBzaG93IHRoZSBzdW1tYXJ5L3ByZXZpZXcgdW5kZXIgdGhlXG5cdCAqIHJlc3BvbnNlLlxuXHQgKi9cblx0cmVhZG9ubHkgdHVyblN0YXR1c1BpbGxzPzogQ2hhdFR1cm5TdGF0dXNQaWxsc1NldHRpbmc7XG5cdHJlYWRvbmx5IG9uUmVuZGVyZWQ/OiAoaGFuZGxlOiBJQ2hhdFdpZGdldEZpeHR1cmVIYW5kbGUpID0+IHZvaWQ7XG5cdC8qKiBTZWxlY3RzIHRoZSBpbnB1dC1oZWlnaHQgY29uc3VtZXIgdXNlZCBieSB0aGUgUmVzaXplT2JzZXJ2ZXIgaGFybmVzcy4gKi9cblx0cmVhZG9ubHkgaG9zdExheW91dE1vZGU/OiAnbm9uZScgfCAnbGlzdE9ubHknIHwgJ3N0YWNrZWRGdWxsJyB8ICdzdGFja2VkVGFyZ2V0ZWQnO1xufVxuXG5pbnRlcmZhY2UgSUNoYXRXaWRnZXRGaXh0dXJlSGFuZGxlIHtcblx0cmVhZG9ubHkgaW5wdXRQYXJ0OiBDaGF0SW5wdXRQYXJ0O1xuXHRyZWFkb25seSBsaXN0V2lkZ2V0OiBDaGF0TGlzdFdpZGdldDtcblx0cmVhZG9ubHkgbW9kZWw6IENoYXRNb2RlbDtcblx0cmVhZG9ubHkgd2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgYWRkVGVybWluYWxDb25maXJtYXRpb246IChyZXF1ZXN0OiBSZXR1cm5UeXBlPENoYXRNb2RlbFsnYWRkUmVxdWVzdCddPiwgY29tbWFuZDogc3RyaW5nKSA9PiB2b2lkO1xufVxuXG5mdW5jdGlvbiBtYWtlRmlsZURpZmYoY2hhbmdlOiBJRml4dHVyZUZpbGVDaGFuZ2UpOiBJRWRpdFNlc3Npb25FbnRyeURpZmYge1xuXHQvLyBBIGNyZWF0ZWQgZmlsZSBoYXMgbm8gYmVmb3JlLWNvbnRlbnQsIHNvIHRoZSBhZ2VudCBob3N0IHByb3ZpZGVyIG1hcHMgaXRzXG5cdC8vIGBvcmlnaW5hbFVSSWAgdG8gdGhlIGBtb2RpZmllZFVSSWAgKGVxdWFsIFVSSXMpOyBhbiBlZGl0ZWQgZmlsZSBrZWVwcyBhXG5cdC8vIGRpc3RpbmN0IG9yaWdpbmFsLlxuXHRjb25zdCBtb2RpZmllZFVSSSA9IFVSSS5maWxlKGAvcmVwby8ke2NoYW5nZS5uYW1lfWApO1xuXHRjb25zdCBvcmlnaW5hbFVSSSA9IGNoYW5nZS5jcmVhdGVkID8gbW9kaWZpZWRVUkkgOiBVUkkuZmlsZShgL3JlcG8vLm9yaWdpbmFsLyR7Y2hhbmdlLm5hbWV9YCk7XG5cdHJldHVybiB7IG9yaWdpbmFsVVJJLCBtb2RpZmllZFVSSSwgYWRkZWQ6IGNoYW5nZS5hZGRlZCwgcmVtb3ZlZDogY2hhbmdlLnJlbW92ZWQsIHF1aXRFYXJseTogZmFsc2UsIGlkZW50aWNhbDogZmFsc2UsIGlzRmluYWw6IHRydWUsIGlzQnVzeTogZmFsc2UgfTtcbn1cblxuZnVuY3Rpb24gbWFrZVVzZXJNZXNzYWdlKHRleHQ6IHN0cmluZykge1xuXHRyZXR1cm4ge1xuXHRcdHRleHQsXG5cdFx0cGFydHM6IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgdGV4dC5sZW5ndGgpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgdGV4dC5sZW5ndGggKyAxKSwgdGV4dCldLFxuXHR9O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVuZGVyQ2hhdFdpZGdldChjb250ZXh0OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgb3B0aW9uczogSUNoYXRXaWRnZXRGaXh0dXJlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCB7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlIH0gPSBjb250ZXh0O1xuXG5cdGNvbnN0IHdpZGdldEhvbGRlcjogeyBjdXJyZW50OiBJQ2hhdFdpZGdldCB8IHVuZGVmaW5lZCB9ID0geyBjdXJyZW50OiB1bmRlZmluZWQgfTtcblxuXHRjb25zdCBmaXh0dXJlVG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0XHRpZDogJ2ZpeHR1cmUudGVybWluYWxUb29sJyxcblx0XHRkaXNwbGF5TmFtZTogJ1Rlcm1pbmFsJyxcblx0XHRtb2RlbERlc2NyaXB0aW9uOiAnUnVuIGEgY29tbWFuZCBpbiB0aGUgdGVybWluYWwnLFxuXHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdH07XG5cblx0Ly8gQ29sbGVjdCByaXNrIGFzc2Vzc21lbnRzIGZyb20gbWVzc2FnZXMgc28gdGhlIHJpc2sgYmFkZ2Ugc2VydmljZSBjYW5cblx0Ly8gcmV0dXJuIHRoZW0gc3luY2hyb25vdXNseSB2aWEgZ2V0Q2FjaGVkKCkuXG5cdGNvbnN0IGhhc1Jpc2tBc3Nlc3NtZW50ID0gb3B0aW9ucy5tZXNzYWdlcy5zb21lKG0gPT4gbS5hc3Npc3RhbnQ/LnNvbWUocCA9PiAocC5raW5kID09PSAndGVybWluYWxDb25maXJtYXRpb24nIHx8IHAua2luZCA9PT0gJ2VsaWNpdGF0aW9uJykgJiYgcC5yaXNrQXNzZXNzbWVudCkpO1xuXHRjb25zdCBoYXNSaXNrTG9hZGluZyA9IG9wdGlvbnMubWVzc2FnZXMuc29tZShtID0+IG0uYXNzaXN0YW50Py5zb21lKHAgPT4gKHAua2luZCA9PT0gJ3Rlcm1pbmFsQ29uZmlybWF0aW9uJyB8fCBwLmtpbmQgPT09ICdlbGljaXRhdGlvbicpICYmIHAucmlza0xvYWRpbmcpKTtcblx0Y29uc3Qgcmlza0ZlYXR1cmVFeHBsaWNpdGx5RGlzYWJsZWQgPSBvcHRpb25zLnJpc2tBc3Nlc3NtZW50RW5hYmxlZCA9PT0gZmFsc2U7XG5cdGNvbnN0IG5lZWRzUmlza1NlcnZpY2UgPSBoYXNSaXNrQXNzZXNzbWVudCB8fCBoYXNSaXNrTG9hZGluZyB8fCByaXNrRmVhdHVyZUV4cGxpY2l0bHlEaXNhYmxlZDtcblxuXHQvLyBNYXBzIGEgY29tcGxldGVkIHR1cm4ncyByZXF1ZXN0SWQgdG8gaXRzIHBlci10dXJuIGZpbGUgZGlmZnMsIGNvbnN1bWVkIGJ5XG5cdC8vIHRoZSB0dXJuIGNoYW5nZXMgc3VtbWFyeSB2aWEgdGhlIHN0dWJiZWQgSUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZS5cblx0Y29uc3QgcmVxdWVzdERpZmZzID0gbmV3IE1hcDxzdHJpbmcsIHJlYWRvbmx5IElFZGl0U2Vzc2lvbkVudHJ5RGlmZltdPigpO1xuXHRjb25zdCBuZWVkc1R1cm5QaWxscyA9IGlzQ2hhdFR1cm5TdGF0dXNQaWxsc0VuYWJsZWQob3B0aW9ucy50dXJuU3RhdHVzUGlsbHMpO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogY29udGV4dC50aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IChyZWcpID0+IHtcblx0XHRcdHJlZ2lzdGVyQ2hhdEZpeHR1cmVTZXJ2aWNlcyhyZWcpO1xuXHRcdFx0Ly8gT3ZlcnJpZGUgd2lkZ2V0IHNlcnZpY2Ugc28gdGhlIGNoYXQgbGlzdCByZW5kZXJlciBjYW4gcm91dGUgdG9vbFxuXHRcdFx0Ly8gY29uZmlybWF0aW9ucyB0byB0aGUgY2Fyb3VzZWwgYXR0YWNoZWQgdG8gb3VyIGlucHV0IHBhcnQuXG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRXaWRnZXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxhc3RGb2N1c2VkV2lkZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFkZFdpZGdldCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQmFja2dyb3VuZFNlc3Npb24gPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZvY3VzZWRXaWRnZXQgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZvY3VzZWRTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0QWxsV2lkZ2V0cygpIHsgcmV0dXJuIHdpZGdldEhvbGRlci5jdXJyZW50ID8gW3dpZGdldEhvbGRlci5jdXJyZW50XSA6IFtdOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldFdpZGdldEJ5SW5wdXRVcmkoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoKSB7IHJldHVybiB3aWRnZXRIb2xkZXIuY3VycmVudDsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRXaWRnZXRzQnlMb2NhdGlvbnMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRvdmVycmlkZSByZWdpc3RlcigpIHsgcmV0dXJuIHsgZGlzcG9zZSgpIHsgfSB9OyB9XG5cdFx0XHR9KCkpO1xuXG5cdFx0XHRpZiAobmVlZHNUdXJuUGlsbHMpIHtcblx0XHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgZ2V0Q2hhbmdlc0ZvclJlcXVlc3QoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCByZXF1ZXN0SWQ6IHN0cmluZykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGNvbnN0T2JzZXJ2YWJsZShyZXF1ZXN0RGlmZnMuZ2V0KHJlcXVlc3RJZCkgPz8gW10pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSgpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG5lZWRzUmlza1NlcnZpY2UpIHtcblx0XHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSBvbkRpZENoYW5nZVRvb2xzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0XHRvdmVycmlkZSBvbkRpZFByZXBhcmVUb29sQ2FsbEJlY29tZVVucmVzcG9uc2l2ZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgZ2V0VG9vbHMoKSB7IHJldHVybiBbZml4dHVyZVRvb2xEYXRhXTsgfVxuXHRcdFx0XHRcdG92ZXJyaWRlIGdldFRvb2woaWQ6IHN0cmluZykgeyByZXR1cm4gaWQgPT09IGZpeHR1cmVUb29sRGF0YS5pZCA/IGZpeHR1cmVUb29sRGF0YSA6IHVuZGVmaW5lZDsgfVxuXHRcdFx0XHR9KCkpO1xuXHRcdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgaXNFbmFibGVkKCkgeyByZXR1cm4gIXJpc2tGZWF0dXJlRXhwbGljaXRseURpc2FibGVkOyB9XG5cdFx0XHRcdFx0b3ZlcnJpZGUgZ2V0Q2FjaGVkKCkge1xuXHRcdFx0XHRcdFx0Ly8gUmV0dXJuIHRoZSBmaXJzdCByaXNrIGFzc2Vzc21lbnQgZm91bmQgaW4gdGhlIGZpeHR1cmUgbWVzc2FnZXMuXG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IG0gb2Ygb3B0aW9ucy5tZXNzYWdlcykge1xuXHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHAgb2YgbS5hc3Npc3RhbnQgPz8gW10pIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoKHAua2luZCA9PT0gJ3Rlcm1pbmFsQ29uZmlybWF0aW9uJyB8fCBwLmtpbmQgPT09ICdlbGljaXRhdGlvbicpICYmIHAucmlza0Fzc2Vzc21lbnQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBwLnJpc2tBc3Nlc3NtZW50O1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gRm9yIHJpc2tMb2FkaW5nOiBhc3Nlc3MoKSBuZXZlciByZXNvbHZlcywga2VlcGluZyB0aGUgYmFkZ2UgaW4gbG9hZGluZyBzdGF0ZS5cblx0XHRcdFx0XHRvdmVycmlkZSBhc3luYyBhc3Nlc3MoKTogUHJvbWlzZTxJVG9vbFJpc2tBc3Nlc3NtZW50IHwgdW5kZWZpbmVkPiB7IHJldHVybiBuZXcgUHJvbWlzZSgoKSA9PiB7IH0pOyB9XG5cdFx0XHRcdH0oKSk7XG5cdFx0XHR9XG5cdFx0fSxcblx0fSk7XG5cblx0Y29uc3QgY29uZmlnU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpIGFzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdCcsIHtcblx0XHRlZGl0b3I6IHsgZm9udFNpemU6IDEzLCBmb250RmFtaWx5OiAnZGVmYXVsdCcsIGZvbnRXZWlnaHQ6ICdkZWZhdWx0JywgbGluZUhlaWdodDogMCwgd29yZFdyYXA6ICdvZmYnIH0sXG5cdH0pO1xuXHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdlZGl0b3InLCB7IGZvbnRGYW1pbHk6ICdtb25vc3BhY2UnLCBmb250TGlnYXR1cmVzOiBmYWxzZSB9KTtcblx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5Ub29sQ29uZmlybWF0aW9uQ2Fyb3VzZWwsIHRydWUpO1xuXHRpZiAob3B0aW9ucy52ZXJib3NlICE9PSB1bmRlZmluZWQpIHtcblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlZlcmJvc2UsIG9wdGlvbnMudmVyYm9zZSk7XG5cdH1cblx0aWYgKG5lZWRzVHVyblBpbGxzKSB7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5UdXJuU3RhdHVzUGlsbHMsIG9wdGlvbnMudHVyblN0YXR1c1BpbGxzKTtcblx0fVxuXG5cdC8vIEJ1aWxkIGEgcmVhbCBDaGF0TW9kZWwgcG9wdWxhdGVkIHdpdGggaGFuZC1jcmFmdGVkIHJlcXVlc3RzL3Jlc3BvbnNlcywgdGhlbiBkcml2ZSBhXG5cdC8vIHJlYWwgQ2hhdFZpZXdNb2RlbCArIENoYXRMaXN0V2lkZ2V0IFx1MjAxNCB0aGUgc2FtZSBjb21wb25lbnRzIHVzZWQgaW4gcHJvZHVjdGlvbi5cblx0Ly8gVGhlIHR1cm4gY2hhbmdlcyBzdW1tYXJ5IG9ubHkgcmVuZGVycyBmb3IgYWdlbnQgaG9zdCBzZXNzaW9ucywgd2hvc2UgZnJvbnRlbmRcblx0Ly8gcmVzb3VyY2UgdXNlcyB0aGUgc2Vzc2lvbiB0eXBlIGFzIHRoZSBzY2hlbWUgKGUuZy4gYGFnZW50LWhvc3QtY29waWxvdGNsaTovXHUyMDI2YCksXG5cdC8vIHdoaWNoIGlzIHdoYXQgYGdldENoYXRTZXNzaW9uVHlwZWAgLyBgdG9BZ2VudEhvc3RCYWNrZW5kU2Vzc2lvblVyaWAgcmVjb2duaXplLlxuXHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBuZWVkc1R1cm5QaWxsc1xuXHRcdD8gVVJJLmZyb20oeyBzY2hlbWU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QsIHBhdGg6ICcvdHVybi1waWxscy1zZXNzaW9uJyB9KVxuXHRcdDogdW5kZWZpbmVkO1xuXHRjb25zdCBjaGF0U2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ2hhdFNlcnZpY2UpIGFzIE1vY2tDaGF0U2VydmljZTtcblx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdENoYXRNb2RlbCxcblx0XHR1bmRlZmluZWQsXG5cdFx0eyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlLCByZXNvdXJjZTogc2Vzc2lvblJlc291cmNlIH1cblx0KSk7XG5cdGNoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9kZWwpO1xuXG5cdGZvciAoY29uc3QgbWVzc2FnZSBvZiBvcHRpb25zLm1lc3NhZ2VzKSB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsLmFkZFJlcXVlc3QobWFrZVVzZXJNZXNzYWdlKG1lc3NhZ2UudXNlciksIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblx0XHRjb25zdCByZXNwb25zZSA9IHJlcXVlc3QucmVzcG9uc2UhO1xuXHRcdGlmIChtZXNzYWdlLmZpbGVDaGFuZ2VzKSB7XG5cdFx0XHRyZXF1ZXN0RGlmZnMuc2V0KHJlcXVlc3QuaWQsIG1lc3NhZ2UuZmlsZUNoYW5nZXMubWFwKG1ha2VGaWxlRGlmZikpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgbWVzc2FnZS5hc3Npc3RhbnQgPz8gW10pIHtcblx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdtYXJrZG93bicpIHtcblx0XHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcocGFydC50ZXh0KSB9KTtcblx0XHRcdH0gZWxzZSBpZiAocGFydC5raW5kID09PSAncHJvZ3Jlc3MnKSB7XG5cdFx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKHBhcnQudGV4dCkgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhcnQua2luZCA9PT0gJ2VsaWNpdGF0aW9uJykge1xuXHRcdFx0XHRjb25zdCBlbGljaXRhdGlvbiA9IG5ldyBDaGF0RWxpY2l0YXRpb25SZXF1ZXN0UGFydChcblx0XHRcdFx0XHRwYXJ0LnRpdGxlLFxuXHRcdFx0XHRcdHBhcnQubWVzc2FnZSxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnQ29udGludWUnLFxuXHRcdFx0XHRcdCdDYW5jZWwnLFxuXHRcdFx0XHRcdGFzeW5jICgpID0+IEVsaWNpdGF0aW9uU3RhdGUuQWNjZXB0ZWQsXG5cdFx0XHRcdFx0YXN5bmMgKCkgPT4gRWxpY2l0YXRpb25TdGF0ZS5SZWplY3RlZCxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwYXJ0LnJpc2tBc3Nlc3NtZW50IHx8IHBhcnQucmlza0xvYWRpbmcgPyB7IHRvb2xJZDogZml4dHVyZVRvb2xEYXRhLmlkLCBwYXJhbWV0ZXJzOiB1bmRlZmluZWQgfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0KTtcblx0XHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCBlbGljaXRhdGlvbik7XG5cdFx0XHR9IGVsc2UgaWYgKHBhcnQua2luZCA9PT0gJ3Rlcm1pbmFsQ29uZmlybWF0aW9uJykge1xuXHRcdFx0XHRjb25zdCB0aXRsZSA9IHBhcnQudGl0bGUgPz8gYFJ1biBwd3NoIGNvbW1hbmQ/YDtcblx0XHRcdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBuZXcgQ2hhdFRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoYFJ1bm5pbmcgXFxgJHtwYXJ0LmNvbW1hbmR9XFxgYCksXG5cdFx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoYFJhbiBcXGAke3BhcnQuY29tbWFuZH1cXGBgKSxcblx0XHRcdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB7IHRpdGxlLCBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoYFxcYCR7cGFydC5jb21tYW5kfVxcYGApLCBkaXNjbGFpbWVyOiBwYXJ0LmRpc2NsYWltZXIgPyBuZXcgTWFya2Rvd25TdHJpbmcocGFydC5kaXNjbGFpbWVyLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pIDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiBwYXJ0LmNvbW1hbmQgfSxcblx0XHRcdFx0XHRcdFx0bGFuZ3VhZ2U6ICdwd3NoJyxcblx0XHRcdFx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uOiBwYXJ0LnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbixcblx0XHRcdFx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uOiBwYXJ0LnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbixcblx0XHRcdFx0XHRcdFx0Y29uZmlybWF0aW9uOiBwYXJ0LmNvbmZpcm1hdGlvbixcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRmaXh0dXJlVG9vbERhdGEsXG5cdFx0XHRcdFx0Z2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdHsgY29tbWFuZDogcGFydC5jb21tYW5kIH0sXG5cdFx0XHRcdCk7XG5cdFx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgdG9vbEludm9jYXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAobWVzc2FnZS5kZXRhaWxzKSB7XG5cdFx0XHRyZXNwb25zZS5zZXRSZXN1bHQoeyBkZXRhaWxzOiBtZXNzYWdlLmRldGFpbHMgfSk7XG5cdFx0fVxuXHRcdGlmIChtZXNzYWdlLnJlc3BvbnNlQ29tcGxldGUgIT09IGZhbHNlKSB7XG5cdFx0XHRyZXNwb25zZS5jb21wbGV0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFZpZXdNb2RlbCwgbW9kZWwsIHVuZGVmaW5lZCkpO1xuXG5cdGNvbnN0IHdpZHRoID0gb3B0aW9ucy53aWR0aCA/PyA3MjA7XG5cdGNvbnN0IGhlaWdodCA9IG9wdGlvbnMuaGVpZ2h0ID8/IDYwMDtcblx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0Y29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICd2YXIoLS12c2NvZGUtc2lkZUJhci1iYWNrZ3JvdW5kLCB2YXIoLS12c2NvZGUtZWRpdG9yLWJhY2tncm91bmQpKSc7XG5cdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb25hY28td29ya2JlbmNoJyk7XG5cblx0Ly8gTWlycm9yIHRoZSBwcm9kdWN0IERPTSBhbmNlc3RyeTogdGhlIGNoYXQgd2lkZ2V0IGxpdmVzIGluc2lkZVxuXHQvLyBgLnBhcnQuYXV4aWxpYXJ5YmFyID4gLmNvbnRlbnRgLCB3aGVyZSBhdXhpbGlhcnlCYXJQYXJ0LmNzcyByZWNvbG9yc1xuXHQvLyBpbmxpbmUgZWRpdG9ycyB3aXRoIGAtLXZzY29kZS1zaWRlQmFyLWJhY2tncm91bmRgICh1c2VkIGJ5IHRoZSBjYXJvdXNlbCkuXG5cdGNvbnN0IGF1eEJhciA9IGRvbS4kKCcucGFydC5hdXhpbGlhcnliYXInKTtcblx0YXV4QmFyLnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXHRhdXhCYXIuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRjb25zdCBhdXhDb250ZW50ID0gZG9tLiQoJy5jb250ZW50Jyk7XG5cdGF1eENvbnRlbnQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdGF1eENvbnRlbnQuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRhdXhCYXIuYXBwZW5kQ2hpbGQoYXV4Q29udGVudCk7XG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChhdXhCYXIpO1xuXG5cdGNvbnN0IHNlc3Npb24gPSBkb20uJCgnLmludGVyYWN0aXZlLXNlc3Npb24nKTtcblx0YXV4Q29udGVudC5hcHBlbmRDaGlsZChzZXNzaW9uKTtcblxuXHQvLyBCdWlsZCB0aGUgaW5wdXQgcGFydCBGSVJTVCBzbyB0aGUgd2lkZ2V0ICh3aXRoIGl0cyBpbnB1dFBhcnQpIGlzIHJlZ2lzdGVyZWRcblx0Ly8gaW4gSUNoYXRXaWRnZXRTZXJ2aWNlIGJlZm9yZSB0aGUgbGlzdCB3aWRnZXQgcmVuZGVycy4gVGhlIHJlbmRlcmVyIHF1ZXJpZXNcblx0Ly8gdGhlIHNlcnZpY2Ugc3luY2hyb25vdXNseSB3aGVuIHJvdXRpbmcgdG9vbCBjb25maXJtYXRpb25zIHRvIHRoZSBjYXJvdXNlbC5cblx0Ly8gSW4gcHJvZHVjdGlvbiBhIGNoYXQgd2lkZ2V0IGFsd2F5cyBoYXMgYW4gaW5wdXRQYXJ0LCBzbyB0aGUgZml4dHVyZSBjcmVhdGVzXG5cdC8vIG9uZSB1bmNvbmRpdGlvbmFsbHk7IGB3aXRoSW5wdXRgIG9ubHkgY29udHJvbHMgd2hldGhlciBpdCBpcyByZW5kZXJlZCBpbiBET00uXG5cdGNvbnN0IG1lbnVTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElNZW51U2VydmljZSkgYXMgRml4dHVyZU1lbnVTZXJ2aWNlO1xuXHRtZW51U2VydmljZS5hZGRJdGVtKE1lbnVJZC5DaGF0SW5wdXQsIHsgY29tbWFuZDogeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5hdHRhY2hDb250ZXh0JywgdGl0bGU6ICcrJywgaWNvbjogQ29kaWNvbi5hZGQgfSwgZ3JvdXA6ICduYXZpZ2F0aW9uJywgb3JkZXI6IC0xIH0pO1xuXHRtZW51U2VydmljZS5hZGRJdGVtKE1lbnVJZC5DaGF0SW5wdXQsIHsgY29tbWFuZDogeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTW9kZVBpY2tlcicsIHRpdGxlOiAnQWdlbnQnIH0sIGdyb3VwOiAnbmF2aWdhdGlvbicsIG9yZGVyOiAxIH0pO1xuXHRtZW51U2VydmljZS5hZGRJdGVtKE1lbnVJZC5DaGF0SW5wdXQsIHsgY29tbWFuZDogeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTW9kZWxQaWNrZXInLCB0aXRsZTogJ0dQVC01LjMtQ29kZXgnIH0sIGdyb3VwOiAnbmF2aWdhdGlvbicsIG9yZGVyOiAzIH0pO1xuXHRtZW51U2VydmljZS5hZGRJdGVtKE1lbnVJZC5DaGF0SW5wdXQsIHsgY29tbWFuZDogeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jb25maWd1cmVUb29scycsIHRpdGxlOiAnJywgaWNvbjogQ29kaWNvbi5zZXR0aW5nc0dlYXIgfSwgZ3JvdXA6ICduYXZpZ2F0aW9uJywgb3JkZXI6IDEwMCB9KTtcblx0bWVudVNlcnZpY2UuYWRkSXRlbShNZW51SWQuQ2hhdEV4ZWN1dGUsIHsgY29tbWFuZDogeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zdWJtaXQnLCB0aXRsZTogJ1NlbmQnLCBpY29uOiBDb2RpY29uLm5ld0xpbmUgfSwgZ3JvdXA6ICduYXZpZ2F0aW9uJywgb3JkZXI6IDQgfSk7XG5cdG1lbnVTZXJ2aWNlLmFkZEl0ZW0oTWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSwgeyBjb21tYW5kOiB7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5TZXNzaW9uVGFyZ2V0UGlja2VyJywgdGl0bGU6ICdMb2NhbCcgfSwgZ3JvdXA6ICduYXZpZ2F0aW9uJywgb3JkZXI6IDAgfSk7XG5cdG1lbnVTZXJ2aWNlLmFkZEl0ZW0oTWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSwgeyBjb21tYW5kOiB7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5QZXJtaXNzaW9uUGlja2VyJywgdGl0bGU6ICdEZWZhdWx0IEFwcHJvdmFscycgfSwgZ3JvdXA6ICduYXZpZ2F0aW9uJywgb3JkZXI6IDEwIH0pO1xuXHRpZiAob3B0aW9ucy5yZXNwb25zZUZvb3RlckFjdGlvbikge1xuXHRcdG1lbnVTZXJ2aWNlLmFkZEl0ZW0oTWVudUlkLkNoYXRNZXNzYWdlRm9vdGVyLCB7IGNvbW1hbmQ6IHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuY29weVJlc3BvbnNlJywgdGl0bGU6ICdDb3B5JywgaWNvbjogQ29kaWNvbi5jb3B5IH0sIGdyb3VwOiAnbmF2aWdhdGlvbicsIG9yZGVyOiAxIH0pO1xuXHR9XG5cblx0Y29uc3QgaW5wdXRPcHRpb25zOiBJQ2hhdElucHV0UGFydE9wdGlvbnMgPSB7XG5cdFx0cmVuZGVyRm9sbG93dXBzOiBmYWxzZSxcblx0XHRyZW5kZXJJbnB1dFRvb2xiYXJCZWxvd0lucHV0OiBmYWxzZSxcblx0XHRyZW5kZXJXb3JraW5nU2V0OiBmYWxzZSxcblx0XHRtZW51czogeyBleGVjdXRlVG9vbGJhcjogTWVudUlkLkNoYXRFeGVjdXRlLCB0ZWxlbWV0cnlTb3VyY2U6ICdmaXh0dXJlJyB9LFxuXHRcdHdpZGdldFZpZXdLaW5kVGFnOiAndmlldycsXG5cdFx0aW5wdXRFZGl0b3JNaW5MaW5lczogMixcblx0fTtcblx0Y29uc3QgaW5wdXRTdHlsZXM6IElDaGF0SW5wdXRTdHlsZXMgPSB7XG5cdFx0b3ZlcmxheUJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtZWRpdG9yLWJhY2tncm91bmQpJyxcblx0XHRsaXN0Rm9yZWdyb3VuZDogJ3ZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKScsXG5cdFx0bGlzdEJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtZWRpdG9yLWJhY2tncm91bmQpJyxcblx0fTtcblxuXHRjb25zdCBpbnB1dFBhcnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRJbnB1dFBhcnQsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGlucHV0T3B0aW9ucywgaW5wdXRTdHlsZXMsIGZhbHNlKSk7XG5cblx0Y29uc3QgZml4dHVyZVdpZGdldCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRXaWRnZXQ+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlld01vZGVsID0gbmV3IEVtaXR0ZXI8bmV2ZXI+KCkuZXZlbnQ7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdmlld01vZGVsID0gdmlld01vZGVsO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNvbnRyaWJzID0gW107XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbG9jYXRpb24gPSBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0O1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHZpZXdDb250ZXh0ID0ge307XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaW5wdXRQYXJ0ID0gaW5wdXRQYXJ0O1xuXHR9KCk7XG5cdHdpZGdldEhvbGRlci5jdXJyZW50ID0gZml4dHVyZVdpZGdldDtcblxuXHRpbnB1dFBhcnQucmVuZGVyKHNlc3Npb24sICcnLCBmaXh0dXJlV2lkZ2V0KTtcblx0aW5wdXRQYXJ0LmxheW91dCh3aWR0aCk7XG5cblx0b3B0aW9ucy5kZWNvcmF0ZUlucHV0UGFydD8uKGlucHV0UGFydCwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRpbnB1dFBhcnQuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LWlucHV0LWhpZGRlbicsIG9wdGlvbnMuaW5wdXRWaXNpYmxlID09PSBmYWxzZSk7XG5cblx0Y29uc3QgbGlzdENvbnRhaW5lciA9IGRvbS4kKCcuaW50ZXJhY3RpdmUtbGlzdCcpO1xuXHRsaXN0Q29udGFpbmVyLnN0eWxlLmZsZXggPSBvcHRpb25zLmhvc3RMYXlvdXRNb2RlID8gJzAgMCBhdXRvJyA6ICcxIDEgYXV0byc7XG5cdGxpc3RDb250YWluZXIuc3R5bGUubWluSGVpZ2h0ID0gJzAnO1xuXHRsaXN0Q29udGFpbmVyLnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblx0Ly8gUHJlcGVuZCB0aGUgbGlzdCBiZWZvcmUgdGhlIGlucHV0IHNvIHRoZSB2aXN1YWwgb3JkZXIgbWF0Y2hlcyBwcm9kdWN0aW9uLlxuXHRzZXNzaW9uLmluc2VydEJlZm9yZShsaXN0Q29udGFpbmVyLCBzZXNzaW9uLmZpcnN0Q2hpbGQpO1xuXG5cdGNvbnN0IGxpc3RXaWRnZXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdENoYXRMaXN0V2lkZ2V0LFxuXHRcdGxpc3RDb250YWluZXIsXG5cdFx0e1xuXHRcdFx0Y3VycmVudENoYXRNb2RlOiAoKSA9PiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRkZWZhdWx0RWxlbWVudEhlaWdodDogMTIwLFxuXHRcdFx0c3R5bGVzOiB7XG5cdFx0XHRcdGxpc3RGb3JlZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWZvcmVncm91bmQpJyxcblx0XHRcdFx0bGlzdEJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtZWRpdG9yLWJhY2tncm91bmQpJyxcblx0XHRcdH0sXG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHJlbmRlcmVyT3B0aW9uczoge1xuXHRcdFx0XHRwcm9ncmVzc01lc3NhZ2VBdEJvdHRvbU9mUmVzcG9uc2U6IG1vZGUgPT4gbW9kZSAhPT0gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdH0sXG5cdFx0fSxcblx0KSk7XG5cblx0bGlzdFdpZGdldC5zZXRWaWV3TW9kZWwodmlld01vZGVsKTtcblx0bGlzdFdpZGdldC5zZXRWaXNpYmxlKHRydWUpO1xuXHRsaXN0V2lkZ2V0LnJlZnJlc2goKTtcblxuXHRjb25zdCBsaXN0SGVpZ2h0ID0gNDIwO1xuXHRsaXN0V2lkZ2V0LmxheW91dChsaXN0SGVpZ2h0LCB3aWR0aCk7XG5cdGxpc3RXaWRnZXQuc2Nyb2xsVG9wID0gMDtcblxuXHRpZiAob3B0aW9ucy5ob3N0TGF5b3V0TW9kZSAmJiBvcHRpb25zLmhvc3RMYXlvdXRNb2RlICE9PSAnbm9uZScpIHtcblx0XHRsZXQgbGF5b3V0aW5nID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dEhlaWdodCA9IGlucHV0UGFydC5oZWlnaHQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGxheW91dGluZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxheW91dGluZyA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAob3B0aW9ucy5ob3N0TGF5b3V0TW9kZSA9PT0gJ3N0YWNrZWRGdWxsJykge1xuXHRcdFx0XHRcdC8vIE1pcnJvcnMgQ2hhdFZpZXdQYW5lJ3Mgc3RhY2tlZC1zZXNzaW9ucyBjb252ZXJnZW5jZSBwYXRoOlxuXHRcdFx0XHRcdC8vIHRoZSBob3N0IHN5bmNocm9ub3VzbHkgbGF5cyBvdXQgdGhlIGlucHV0IGFnYWluLlxuXHRcdFx0XHRcdGlucHV0UGFydC5zZXRNYXhIZWlnaHQoTWF0aC5tYXgoMCwgaGVpZ2h0IC0gNTApKTtcblx0XHRcdFx0XHRpbnB1dFBhcnQubGF5b3V0KHdpZHRoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNvbnRlbnRIZWlnaHQgPSBvcHRpb25zLmhvc3RMYXlvdXRNb2RlID09PSAnc3RhY2tlZEZ1bGwnIHx8IG9wdGlvbnMuaG9zdExheW91dE1vZGUgPT09ICdzdGFja2VkVGFyZ2V0ZWQnXG5cdFx0XHRcdFx0PyBNYXRoLm1heCgwLCBNYXRoLm1heCgxMTYsIGlucHV0SGVpZ2h0KSAtIGlucHV0SGVpZ2h0KVxuXHRcdFx0XHRcdDogTWF0aC5tYXgoMCwgaGVpZ2h0IC0gaW5wdXRIZWlnaHQpO1xuXHRcdFx0XHRsaXN0Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2NvbnRlbnRIZWlnaHR9cHhgO1xuXHRcdFx0XHRsaXN0Q29udGFpbmVyLmRhdGFzZXRbJ2V4cGVjdGVkSGVpZ2h0J10gPSBTdHJpbmcoY29udGVudEhlaWdodCk7XG5cdFx0XHRcdGxpc3RXaWRnZXQubGF5b3V0KGNvbnRlbnRIZWlnaHQsIHdpZHRoKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGxheW91dGluZyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG9wdGlvbnMub25SZW5kZXJlZD8uKHtcblx0XHRpbnB1dFBhcnQsXG5cdFx0bGlzdFdpZGdldCxcblx0XHRtb2RlbCxcblx0XHR3aWR0aCxcblx0XHRhZGRUZXJtaW5hbENvbmZpcm1hdGlvbjogKHJlcXVlc3QsIGNvbW1hbmQpID0+IHtcblx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgbmV3IENoYXRUb29sSW52b2NhdGlvbihcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoYFJ1bm5pbmcgXFxgJHtjb21tYW5kfVxcYGApLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhgUmFuIFxcYCR7Y29tbWFuZH1cXGBgKSxcblx0XHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogeyB0aXRsZTogJ1J1biBkaWFnbm9zdGljIGNvbW1hbmQ/JywgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGBcXGAke2NvbW1hbmR9XFxgYCkgfSxcblx0XHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0XHRcdFx0Y29tbWFuZExpbmU6IHsgb3JpZ2luYWw6IGNvbW1hbmQgfSxcblx0XHRcdFx0XHRcdGxhbmd1YWdlOiAncHdzaCcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Zml4dHVyZVRvb2xEYXRhLFxuXHRcdFx0XHRnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR7IGNvbW1hbmQgfSxcblx0XHRcdCkpO1xuXHRcdH0sXG5cdH0pO1xufVxuXG5jb25zdCBTSU1QTEVfUUE6IElGaXh0dXJlTWVzc2FnZVtdID0gW1xuXHR7XG5cdFx0dXNlcjogJ0FkZCBhIGZpYm9uYWNjaSBmdW5jdGlvbiB0byBmaWJvbi50cycsXG5cdFx0YXNzaXN0YW50OiBbXG5cdFx0XHR7IGtpbmQ6ICdtYXJrZG93bicsIHRleHQ6ICdJIGFkZGVkIGEgcmVjdXJzaXZlIGBmaWJvbmFjY2kobilgIHRvIGBmaWJvbi50c2AuIE5vdGUgdGhhdCByZWN1cnNpb24gaXMgZXhwb25lbnRpYWwgXHUyMDE0IGZvciBsYXJnZSBgbmAgY29uc2lkZXIgYW4gaXRlcmF0aXZlIHZlcnNpb24uJyB9LFxuXHRcdF0sXG5cdH0sXG5dO1xuXG5jb25zdCBMQVNUX1JFU1BPTlNFX0hPVkVSOiBJRml4dHVyZU1lc3NhZ2VbXSA9IFtcblx0e1xuXHRcdHVzZXI6ICdTdW1tYXJpemUgdGhlIGNoYW5nZXMnLFxuXHRcdGFzc2lzdGFudDogW1xuXHRcdFx0eyBraW5kOiAnbWFya2Rvd24nLCB0ZXh0OiAnVGhlIHJlc3BvbnNlIGNvbnRlbnQgZW5kcyBoZXJlLicgfSxcblx0XHRdLFxuXHRcdGRldGFpbHM6ICdDbGF1ZGUgT3B1cyA0LjggLSAyIGNyZWRpdHMnLFxuXHR9LFxuXTtcblxuYXN5bmMgZnVuY3Rpb24gcmVuZGVyTGFzdFJlc3BvbnNlSG92ZXIoY29udGV4dDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0YXdhaXQgcmVuZGVyQ2hhdFdpZGdldChjb250ZXh0LCB7XG5cdFx0bWVzc2FnZXM6IExBU1RfUkVTUE9OU0VfSE9WRVIsXG5cdFx0aGVpZ2h0OiA2MDAsXG5cdFx0aW5wdXRWaXNpYmxlOiBmYWxzZSxcblx0XHRyZXNwb25zZUZvb3RlckFjdGlvbjogdHJ1ZSxcblx0fSk7XG5cblx0Y29uc3QgcmVzcG9uc2UgPSBjb250ZXh0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmludGVyYWN0aXZlLXJlc3BvbnNlLmNoYXQtbW9zdC1yZWNlbnQtcmVzcG9uc2UnKTtcblx0cmVzcG9uc2U/LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCc6c2NvcGUgPiAudmFsdWUnKT8uZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2VlbnRlcicpKTtcbn1cblxuY29uc3QgS0VZQk9BUkRfRk9DVVM6IElGaXh0dXJlTWVzc2FnZVtdID0gW1xuXHR7XG5cdFx0dXNlcjogJ1N1bW1hcml6ZSB0aGUgY2hhbmdlcycsXG5cdFx0YXNzaXN0YW50OiBbXG5cdFx0XHR7IGtpbmQ6ICdtYXJrZG93bicsIHRleHQ6ICdUaGUgZmlyc3QgcmVzcG9uc2UgaGFzIGtleWJvYXJkLWFjY2Vzc2libGUgYWN0aW9ucy4nIH0sXG5cdFx0XSxcblx0XHRkZXRhaWxzOiAnQ2xhdWRlIE9wdXMgNC44IC0gMiBjcmVkaXRzJyxcblx0fSxcblx0e1xuXHRcdHVzZXI6ICdXaGF0IHNob3VsZCBJIGRvIG5leHQ/Jyxcblx0XHRhc3Npc3RhbnQ6IFtcblx0XHRcdHsga2luZDogJ21hcmtkb3duJywgdGV4dDogJ1J1biB0aGUgdGVzdHMgYW5kIHJldmlldyB0aGUgZGlmZi4nIH0sXG5cdFx0XSxcblx0XHRkZXRhaWxzOiAnQ2xhdWRlIE9wdXMgNC44IC0gMSBjcmVkaXQnLFxuXHR9LFxuXTtcblxuYXN5bmMgZnVuY3Rpb24gcmVuZGVyS2V5Ym9hcmRGb2N1cyhjb250ZXh0OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgdGFyZ2V0OiAncmVzcG9uc2UtYWN0aW9uJyB8ICdyZXF1ZXN0LXRpbWVzdGFtcCcpOiBQcm9taXNlPHZvaWQ+IHtcblx0YXdhaXQgcmVuZGVyQ2hhdFdpZGdldChjb250ZXh0LCB7XG5cdFx0bWVzc2FnZXM6IEtFWUJPQVJEX0ZPQ1VTLFxuXHRcdGhlaWdodDogNjAwLFxuXHRcdGlucHV0VmlzaWJsZTogZmFsc2UsXG5cdFx0cmVzcG9uc2VGb290ZXJBY3Rpb246IHRydWUsXG5cdFx0dmVyYm9zZTogdGFyZ2V0ID09PSAncmVxdWVzdC10aW1lc3RhbXAnLFxuXHR9KTtcblxuXHRjb25zdCBzZWxlY3RvciA9IHRhcmdldCA9PT0gJ3Jlc3BvbnNlLWFjdGlvbidcblx0XHQ/ICcuaW50ZXJhY3RpdmUtcmVzcG9uc2U6bm90KC5jaGF0LW1vc3QtcmVjZW50LXJlc3BvbnNlKSAuY2hhdC1mb290ZXItdG9vbGJhciAuYWN0aW9uLWxhYmVsJ1xuXHRcdDogJy5pbnRlcmFjdGl2ZS1yZXF1ZXN0IC5jaGF0LXJlcXVlc3QtdGltZXN0YW1wJztcblx0Y29uc3QgZm9jdXNUYXJnZXQgPSBjb250ZXh0LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihzZWxlY3Rvcik7XG5cdGlmICghZm9jdXNUYXJnZXQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYE1pc3Npbmcga2V5Ym9hcmQgZm9jdXMgdGFyZ2V0OiAke3RhcmdldH1gKTtcblx0fVxuXHRmb2N1c1RhcmdldC5mb2N1cygpO1xuXHRpZiAoZm9jdXNUYXJnZXQub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50ICE9PSBmb2N1c1RhcmdldCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGZvY3VzIGtleWJvYXJkIHRhcmdldDogJHt0YXJnZXR9YCk7XG5cdH1cbn1cblxuY29uc3QgUEVORElOR19UT09MX0FQUFJPVkFMOiBJRml4dHVyZU1lc3NhZ2VbXSA9IFtcblx0e1xuXHRcdHVzZXI6ICdydW4gZ2l0IGluaXQnLFxuXHRcdGFzc2lzdGFudDogW1xuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAndGVybWluYWxDb25maXJtYXRpb24nLFxuXHRcdFx0XHRjb21tYW5kOiAnZ2l0IGluaXQnLFxuXHRcdFx0XHRyaXNrQXNzZXNzbWVudDoge1xuXHRcdFx0XHRcdHJpc2s6IFRvb2xSaXNrTGV2ZWwuT3JhbmdlLFxuXHRcdFx0XHRcdGV4cGxhbmF0aW9uOiAnSW5pdGlhbGl6ZXMgYSBuZXcgR2l0IHJlcG9zaXRvcnkgaW4gdGhlIGN1cnJlbnQgZGlyZWN0b3J5LiBSZXZlcnNpYmxlIGJ5IHJlbW92aW5nIHRoZSAuZ2l0IGZvbGRlci4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdLFxuXHRcdHJlc3BvbnNlQ29tcGxldGU6IGZhbHNlLFxuXHR9LFxuXTtcblxuLy8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMwOTc5NlxuY29uc3QgSVNTVUVfMzA5Nzk2X01JU1NJTkdfQkFDS1NMQVNIOiBJRml4dHVyZU1lc3NhZ2VbXSA9IFtcblx0e1xuXHRcdHVzZXI6ICdpbnN0YWxsIGRlcGVuZGVuY2llcyBpbiB0aGUgc2VydmVyIGRpcmVjdG9yeScsXG5cdFx0YXNzaXN0YW50OiBbXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICd0ZXJtaW5hbENvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGNvbW1hbmQ6ICdjZCBwYWNrYWdlc1xcXFxzZXJ2ZXIgJiYgbnBtIGluc3RhbGwnLFxuXHRcdFx0XHR0aXRsZTogJ1J1biBgcHdzaGAgY29tbWFuZCB3aXRoaW4gYHBhY2thZ2VzXFxcXHNlcnZlcmA/Jyxcblx0XHRcdFx0Y29uZmlybWF0aW9uOiB7XG5cdFx0XHRcdFx0Y29tbWFuZExpbmU6ICducG0gaW5zdGFsbCcsXG5cdFx0XHRcdFx0Y3dkTGFiZWw6ICdwYWNrYWdlc1xcXFxzZXJ2ZXInLFxuXHRcdFx0XHRcdGNkUHJlZml4OiAnY2QgcGFja2FnZXNcXFxcc2VydmVyICYmICcsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF0sXG5cdFx0cmVzcG9uc2VDb21wbGV0ZTogZmFsc2UsXG5cdH0sXG5dO1xuXG5jb25zdCBTVFJFQU1JTkc6IElGaXh0dXJlTWVzc2FnZVtdID0gW1xuXHR7XG5cdFx0dXNlcjogJ1NlYXJjaCB0aGUgd29ya3NwYWNlIGZvciBUT0RPIGNvbW1lbnRzJyxcblx0XHRhc3Npc3RhbnQ6IFtcblx0XHRcdHsga2luZDogJ3Byb2dyZXNzJywgdGV4dDogJ1NlYXJjaGluZyB3b3Jrc3BhY2UgZm9yIGBUT0RPYCBjb21tZW50cy4uLicgfSxcblx0XHRdLFxuXHRcdHJlc3BvbnNlQ29tcGxldGU6IGZhbHNlLFxuXHR9LFxuXTtcblxuY29uc3QgTVVMVElfVFVSTjogSUZpeHR1cmVNZXNzYWdlW10gPSBbXG5cdHtcblx0XHR1c2VyOiAnV2hhdCBkb2VzIHRoaXMgcHJvamVjdCBkbz8nLFxuXHRcdGFzc2lzdGFudDogW1xuXHRcdFx0eyBraW5kOiAnbWFya2Rvd24nLCB0ZXh0OiAnVGhpcyBwcm9qZWN0IGlzICoqVmlzdWFsIFN0dWRpbyBDb2RlKiosIGEgZnJlZSBzb3VyY2UtY29kZSBlZGl0b3IgbWFkZSBieSBNaWNyb3NvZnQgZm9yIFdpbmRvd3MsIExpbnV4IGFuZCBtYWNPUy4nIH0sXG5cdFx0XSxcblx0fSxcblx0e1xuXHRcdHVzZXI6ICdXaGVyZSBpcyB0aGUgZW50cnlwb2ludD8nLFxuXHRcdGFzc2lzdGFudDogW1xuXHRcdFx0eyBraW5kOiAnbWFya2Rvd24nLCB0ZXh0OiAnVGhlIGRlc2t0b3AgZW50cnlwb2ludCBpcyBpbiBgc3JjL3ZzL2NvZGUvZWxlY3Ryb24tbWFpbi9tYWluLnRzYC4gVGhlIGJyb3dzZXIvc2VydmVyIGVudHJ5cG9pbnRzIGxpdmUgdW5kZXIgYHNyYy92cy9zZXJ2ZXIvYC4nIH0sXG5cdFx0XSxcblx0fSxcblx0e1xuXHRcdHVzZXI6ICdUaGFua3MhJyxcblx0XHRhc3Npc3RhbnQ6IFtcblx0XHRcdHsga2luZDogJ21hcmtkb3duJywgdGV4dDogJ1lvdSBhcmUgd2VsY29tZSBcdTIwMTQgbGV0IG1lIGtub3cgaWYgeW91IGhhdmUgbW9yZSBxdWVzdGlvbnMuJyB9LFxuXHRcdF0sXG5cdH0sXG5dO1xuXG4vLyBDb2RlIGJsb2NrcyB0aGF0IGZvbGxvdyBvciBhcmUgbmVzdGVkIGluIGxpc3QgaXRlbXMgc2hvdWxkIGhhdmUgc3ltbWV0cmljIHNwYWNpbmdcbi8vIGFib3ZlIGFuZCBiZWxvdy4gQ292ZXJzIHRoZSB0d28gRE9NIHNoYXBlcyBtYXJrZG93biBwcm9kdWNlczogYSBjb2RlIGJsb2NrIHRoYXQgaXMgYVxuLy8gc2libGluZyBhZnRlciBhIGxpc3QsIGFuZCBhIGNvZGUgYmxvY2sgbmVzdGVkIGluc2lkZSBhIGxpc3QgaXRlbSAoaW5kZW50ZWQgZmVuY2UpLlxuY29uc3QgQ09ERV9CTE9DS19JTl9MSVNUOiBJRml4dHVyZU1lc3NhZ2VbXSA9IFtcblx0e1xuXHRcdHVzZXI6ICdIb3cgZG8gSSBzZXQgdXAgdGhlIHByb2plY3Q/Jyxcblx0XHRhc3Npc3RhbnQ6IFtcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duJywgdGV4dDogW1xuXHRcdFx0XHRcdCdGb2xsb3cgdGhlc2Ugc3RlcHM6Jyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnLSBDbG9uZSB0aGUgcmVwb3NpdG9yeScsXG5cdFx0XHRcdFx0Jy0gSW5zdGFsbCB0aGUgZGVwZW5kZW5jaWVzJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnYGBgYmFzaCcsXG5cdFx0XHRcdFx0J25wbSBpbnN0YWxsJyxcblx0XHRcdFx0XHQnYGBgJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnLSBUaGVuIHN0YXJ0IHRoZSBidWlsZCB3YXRjaGVyOicsXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0JyAgYGBgYmFzaCcsXG5cdFx0XHRcdFx0JyAgbnBtIHJ1biB3YXRjaCcsXG5cdFx0XHRcdFx0JyAgYGBgJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnLSBGaW5hbGx5LCBsYXVuY2ggdGhlIGFwcCcsXG5cdFx0XHRcdF0uam9pbignXFxuJylcblx0XHRcdH0sXG5cdFx0XSxcblx0fSxcbl07XG5cbmFzeW5jIGZ1bmN0aW9uIHJlbmRlclJlc2l6ZU9ic2VydmVyTG9vcEhhcm5lc3MoY29udGV4dDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIGhvc3RMYXlvdXRNb2RlOiBJQ2hhdFdpZGdldEZpeHR1cmVPcHRpb25zWydob3N0TGF5b3V0TW9kZSddKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IHRhcmdldFdpbmRvdyA9IGRvbS5nZXRXaW5kb3coY29udGV4dC5jb250YWluZXIpO1xuXG5cdGxldCBoYW5kbGU6IElDaGF0V2lkZ2V0Rml4dHVyZUhhbmRsZSB8IHVuZGVmaW5lZDtcblx0YXdhaXQgcmVuZGVyQ2hhdFdpZGdldChjb250ZXh0LCB7XG5cdFx0bWVzc2FnZXM6IFt7XG5cdFx0XHR1c2VyOiBbXG5cdFx0XHRcdCdJbnZlc3RpZ2F0ZSBSZXNpemVPYnNlcnZlciByZS1lbnRyeS4nLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0NvbnRleHQgKHRleHQvcGxhaW47IG5vIGJpbmFyeSB1cGxvYWQpOicsXG5cdFx0XHRcdCdJc3N1ZSAjMzE2NTAxIHRyYWNrcyBjaGF0IGxpc3QgYW5kIGlucHV0IHJlc2l6ZS1vYnNlcnZlciBsb29wIHdhcm5pbmdzLicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0YXNzaXN0YW50OiBbe1xuXHRcdFx0XHRraW5kOiAnbWFya2Rvd24nLFxuXHRcdFx0XHR0ZXh0OiAnVGhlIG1vY2tlZCBjaGF0IGhhcm5lc3MgaXMgcmVhZHkuJyxcblx0XHRcdH1dLFxuXHRcdH1dLFxuXHRcdHdpZHRoOiA3MjAsXG5cdFx0aGVpZ2h0OiA2MDAsXG5cdFx0aG9zdExheW91dE1vZGUsXG5cdFx0b25SZW5kZXJlZDogdmFsdWUgPT4gaGFuZGxlID0gdmFsdWUsXG5cdH0pO1xuXG5cdGlmICghaGFuZGxlKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdSZXNpemVPYnNlcnZlciBoYXJuZXNzIGRpZCBub3QgaW5pdGlhbGl6ZScpO1xuXHR9XG5cdGNvbnN0IGZpeHR1cmVIYW5kbGUgPSBoYW5kbGU7XG5cblx0Y29uc3QgY29udHJvbHMgPSBkb20uJCgnLnJlc2l6ZS1vYnNlcnZlci1sb29wLWhhcm5lc3MnKTtcblx0Y29uc3QgcnVuQnV0dG9uID0gZG9tLmFwcGVuZChjb250cm9scywgZG9tLiQ8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b24ucmVzaXplLW9ic2VydmVyLWxvb3AtcnVuJykpO1xuXHRydW5CdXR0b24udHlwZSA9ICdidXR0b24nO1xuXHRydW5CdXR0b24udGV4dENvbnRlbnQgPSAnUnVuIDIwLXR1cm4gYnVyc3QnO1xuXHRjb25zdCBzdGF0dXMgPSBkb20uYXBwZW5kKGNvbnRyb2xzLCBkb20uJCgnc3Bhbi5yZXNpemUtb2JzZXJ2ZXItbG9vcC1zdGF0dXMnKSk7XG5cdHN0YXR1cy5yb2xlID0gJ3N0YXR1cyc7XG5cdHN0YXR1cy50ZXh0Q29udGVudCA9ICdSZWFkeSc7XG5cdGNvbnN0IHdhcm5pbmdzID0gZG9tLmFwcGVuZChjb250cm9scywgZG9tLiQoJ3NwYW4ucmVzaXplLW9ic2VydmVyLWxvb3Atd2FybmluZ3MnKSk7XG5cdHdhcm5pbmdzLnRleHRDb250ZW50ID0gJ1dhcm5pbmdzOiAwJztcblx0Y29udHJvbHMuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRjb250cm9scy5zdHlsZS50b3AgPSAnOHB4Jztcblx0Y29udHJvbHMuc3R5bGUucmlnaHQgPSAnOHB4Jztcblx0Y29udHJvbHMuc3R5bGUuekluZGV4ID0gJzEwMCc7XG5cdGNvbnRyb2xzLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdGNvbnRyb2xzLnN0eWxlLmdhcCA9ICc4cHgnO1xuXHRjb250cm9scy5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XG5cdGNvbnRyb2xzLnN0eWxlLnBhZGRpbmcgPSAnNnB4IDhweCc7XG5cdGNvbnRyb2xzLnN0eWxlLmJhY2tncm91bmQgPSAndmFyKC0tdnNjb2RlLWVkaXRvcldpZGdldC1iYWNrZ3JvdW5kKSc7XG5cdGNvbnRyb2xzLnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgdmFyKC0tdnNjb2RlLXdpZGdldC1ib3JkZXIpJztcblx0Y29udGV4dC5jb250YWluZXIuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRjb250ZXh0LmNvbnRhaW5lci5hcHBlbmRDaGlsZChjb250cm9scyk7XG5cblx0bGV0IHdhcm5pbmdDb3VudCA9IDA7XG5cdGNvbnRleHQuZGlzcG9zYWJsZVN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldFdpbmRvdywgZG9tLkV2ZW50VHlwZS5FUlJPUiwgZXZlbnQgPT4ge1xuXHRcdGlmIChldmVudCBpbnN0YW5jZW9mIEVycm9yRXZlbnQgJiYgZXZlbnQubWVzc2FnZS5pbmNsdWRlcygnUmVzaXplT2JzZXJ2ZXIgbG9vcCcpKSB7XG5cdFx0XHR3YXJuaW5nQ291bnQrKztcblx0XHRcdHdhcm5pbmdzLnRleHRDb250ZW50ID0gYFdhcm5pbmdzOiAke3dhcm5pbmdDb3VudH1gO1xuXHRcdFx0d2FybmluZ3MuZGF0YXNldFsnb2JzZXJ2ZXJDb250ZXh0J10gPSBkb20uZ2V0UmVjZW50RGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyQ29udGV4dEZvckxvb3BFcnJvcihldmVudC5tZXNzYWdlLCB0YXJnZXRXaW5kb3cpID8/IGV2ZW50Lm1lc3NhZ2U7XG5cdFx0XHRzdGF0dXMudGV4dENvbnRlbnQgPSAnQ2FwdHVyZWQgUmVzaXplT2JzZXJ2ZXIgd2FybmluZyc7XG5cdFx0fVxuXHR9KSk7XG5cblx0Y29uc3QgbmV4dEZyYW1lID0gKCkgPT4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB0YXJnZXRXaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHJlc29sdmUoKSkpO1xuXHRjb25zdCBydW5CdXJzdCA9IGFzeW5jICgpID0+IHtcblx0XHRydW5CdXR0b24uZGlzYWJsZWQgPSB0cnVlO1xuXHRcdHN0YXR1cy50ZXh0Q29udGVudCA9ICdBZGRpbmcgcXVldWVkIHR1cm5zLi4uJztcblx0XHRjb25zdCByZXNwb25zZXMgPSBbXTtcblxuXHRcdGZvciAobGV0IGluZGV4ID0gMTsgaW5kZXggPD0gMjA7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IHByb21wdCA9IFtcblx0XHRcdFx0YFF1ZXVlZCBwcm9tcHQgJHtpbmRleH1gLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0NvbnRleHQgKHRleHQvcGxhaW47IG5vIGJpbmFyeSB1cGxvYWQpOicsXG5cdFx0XHRcdC4uLkFycmF5LmZyb20oeyBsZW5ndGg6IDEyIH0sIChfLCBsaW5lKSA9PiBgUmVzaXplIHN0cmVzcyBzYW1wbGUgJHtpbmRleH0uJHtsaW5lICsgMX06ICR7J2xheW91dCAnLnJlcGVhdChpbmRleCAlIDUgKyAxKX1gKSxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGZpeHR1cmVIYW5kbGUuaW5wdXRQYXJ0LnNldFZhbHVlKHByb21wdCwgdHJ1ZSk7XG5cdFx0XHRmaXh0dXJlSGFuZGxlLmlucHV0UGFydC5sYXlvdXQoZml4dHVyZUhhbmRsZS53aWR0aCk7XG5cblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBmaXh0dXJlSGFuZGxlLm1vZGVsLmFkZFJlcXVlc3QobWFrZVVzZXJNZXNzYWdlKHByb21wdCksIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblx0XHRcdGZpeHR1cmVIYW5kbGUubW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7XG5cdFx0XHRcdGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLFxuXHRcdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoYFByb2Nlc3NpbmcgcXVldWVkIHByb21wdCAke2luZGV4fS4uLmApLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoaW5kZXggPT09IDEpIHtcblx0XHRcdFx0Zml4dHVyZUhhbmRsZS5hZGRUZXJtaW5hbENvbmZpcm1hdGlvbihyZXF1ZXN0LCAnZ2l0IHN0YXR1cyAtLXNob3J0Jyk7XG5cdFx0XHR9XG5cdFx0XHRyZXNwb25zZXMucHVzaChyZXF1ZXN0LnJlc3BvbnNlISk7XG5cblx0XHRcdGZpeHR1cmVIYW5kbGUubGlzdFdpZGdldC5yZWZyZXNoKCk7XG5cdFx0XHRhd2FpdCBuZXh0RnJhbWUoKTtcblxuXHRcdFx0Zml4dHVyZUhhbmRsZS5pbnB1dFBhcnQuc2V0VmFsdWUoJycsIHRydWUpO1xuXHRcdFx0Zml4dHVyZUhhbmRsZS5pbnB1dFBhcnQubGF5b3V0KGZpeHR1cmVIYW5kbGUud2lkdGgpO1xuXHRcdFx0Zml4dHVyZUhhbmRsZS5tb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhgTW9jayBzdHJlYW1lZCBvdXRwdXQgJHtpbmRleH1cXG5cXG4keyctIHJlc3BvbnNlIGxpbmVcXG4nLnJlcGVhdChpbmRleCAlIDcgKyAxKX1gKSxcblx0XHRcdH0pO1xuXHRcdFx0Zml4dHVyZUhhbmRsZS5saXN0V2lkZ2V0LnJlZnJlc2goKTtcblx0XHRcdGF3YWl0IG5leHRGcmFtZSgpO1xuXHRcdH1cblxuXHRcdHN0YXR1cy50ZXh0Q29udGVudCA9ICdDb21wbGV0aW5nIG1vY2tlZCByZXNwb25zZXMuLi4nO1xuXHRcdGZvciAoY29uc3QgcmVzcG9uc2Ugb2YgcmVzcG9uc2VzKSB7XG5cdFx0XHRyZXNwb25zZS5jb21wbGV0ZSgpO1xuXHRcdFx0Zml4dHVyZUhhbmRsZS5saXN0V2lkZ2V0LnJlZnJlc2goKTtcblx0XHRcdGF3YWl0IG5leHRGcmFtZSgpO1xuXHRcdH1cblxuXHRcdHN0YXR1cy50ZXh0Q29udGVudCA9IHdhcm5pbmdDb3VudCA+IDBcblx0XHRcdD8gJ0NvbXBsZXRlZCB3aXRoIFJlc2l6ZU9ic2VydmVyIHdhcm5pbmcnXG5cdFx0XHQ6ICdDb21wbGV0ZWQgd2l0aG91dCB3YXJuaW5nJztcblx0XHRydW5CdXR0b24uZGlzYWJsZWQgPSBmYWxzZTtcblx0fTtcblxuXHRjb250ZXh0LmRpc3Bvc2FibGVTdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihydW5CdXR0b24sIGRvbS5FdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHR2b2lkIHJ1bkJ1cnN0KCk7XG5cdH0pKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHsgcGF0aDogJ2NoYXQvd2lkZ2V0LycgfSwge1xuXHRTaW1wbGVRQTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogY3R4ID0+IHJlbmRlckNoYXRXaWRnZXQoY3R4LCB7IG1lc3NhZ2VzOiBTSU1QTEVfUUEgfSkgfSksXG5cdFN0cmVhbWluZzogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IGxhYmVsczogeyBraW5kOiAnYW5pbWF0ZWQnIH0sIHJlbmRlcjogY3R4ID0+IHJlbmRlckNoYXRXaWRnZXQoY3R4LCB7IG1lc3NhZ2VzOiBTVFJFQU1JTkcgfSkgfSksXG5cdFBlbmRpbmdUb29sQXBwcm92YWw6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IGN0eCA9PiByZW5kZXJDaGF0V2lkZ2V0KGN0eCwgeyBtZXNzYWdlczogUEVORElOR19UT09MX0FQUFJPVkFMIH0pIH0pLFxuXHRSZXNpemVPYnNlcnZlckxvb3BIYXJuZXNzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ2FuaW1hdGVkJyB9LFxuXHRcdHZpcnR1YWxUaW1lOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0cmVuZGVyOiBjb250ZXh0ID0+IHJlbmRlclJlc2l6ZU9ic2VydmVyTG9vcEhhcm5lc3MoY29udGV4dCwgJ3N0YWNrZWRGdWxsJyksXG5cdH0pLFxuXHRSZXNpemVPYnNlcnZlckxvb3BMaXN0T25seTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdhbmltYXRlZCcgfSxcblx0XHR2aXJ0dWFsVGltZTogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdHJlbmRlcjogY29udGV4dCA9PiByZW5kZXJSZXNpemVPYnNlcnZlckxvb3BIYXJuZXNzKGNvbnRleHQsICdsaXN0T25seScpLFxuXHR9KSxcblx0UmVzaXplT2JzZXJ2ZXJMb29wU3RhY2tlZFRhcmdldGVkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ2FuaW1hdGVkJyB9LFxuXHRcdHZpcnR1YWxUaW1lOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0cmVuZGVyOiBjb250ZXh0ID0+IHJlbmRlclJlc2l6ZU9ic2VydmVyTG9vcEhhcm5lc3MoY29udGV4dCwgJ3N0YWNrZWRUYXJnZXRlZCcpLFxuXHR9KSxcblx0UmVzaXplT2JzZXJ2ZXJMb29wTm9Ib3N0TGF5b3V0OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ2FuaW1hdGVkJyB9LFxuXHRcdHZpcnR1YWxUaW1lOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0cmVuZGVyOiBjb250ZXh0ID0+IHJlbmRlclJlc2l6ZU9ic2VydmVyTG9vcEhhcm5lc3MoY29udGV4dCwgJ25vbmUnKSxcblx0fSksXG5cdENvZGVCbG9ja0luTGlzdDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogY3R4ID0+IHJlbmRlckNoYXRXaWRnZXQoY3R4LCB7IG1lc3NhZ2VzOiBDT0RFX0JMT0NLX0lOX0xJU1QgfSkgfSksXG5cdGJ1Z3M6IGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCh7XG5cdFx0J2lzc3VlLTMwOTc5Ni1taXNzaW5nLWJhY2tzbGFzaCc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IGN0eCA9PiByZW5kZXJDaGF0V2lkZ2V0KGN0eCwgeyBtZXNzYWdlczogSVNTVUVfMzA5Nzk2X01JU1NJTkdfQkFDS1NMQVNIIH0pIH0pLFxuXHR9KSxcblx0TXVsdGlUdXJuOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiBjdHggPT4gcmVuZGVyQ2hhdFdpZGdldChjdHgsIHsgbWVzc2FnZXM6IE1VTFRJX1RVUk4gfSkgfSksXG5cdExhc3RSZXNwb25zZUNvbnRlbnRIb3ZlcjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyTGFzdFJlc3BvbnNlSG92ZXIgfSksXG5cdFJlc3BvbnNlQWN0aW9uS2V5Ym9hcmRGb2N1czogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogY3R4ID0+IHJlbmRlcktleWJvYXJkRm9jdXMoY3R4LCAncmVzcG9uc2UtYWN0aW9uJykgfSksXG5cdFJlcXVlc3RUaW1lc3RhbXBLZXlib2FyZEZvY3VzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiBjdHggPT4gcmVuZGVyS2V5Ym9hcmRGb2N1cyhjdHgsICdyZXF1ZXN0LXRpbWVzdGFtcCcpIH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLFlBQVk7QUFDckIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxjQUFjLGNBQWM7QUFDckMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBOEQ7QUFFdkUsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsa0JBQWtCLG9CQUFvQjtBQUMvQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDRCQUF1QyxzQkFBc0I7QUFDdEUsU0FBUyxnQ0FBcUQscUJBQXFCO0FBQ25GLFNBQVMs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
