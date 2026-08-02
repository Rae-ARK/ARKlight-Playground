import assert from "assert";
import * as dom from "../../../../../../base/browser/dom.js";
import { mainWindow } from "../../../../../../base/browser/window.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { OffsetRange } from "../../../../../../editor/common/core/ranges/offsetRange.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { buildPlanReviewProgressContent, ChatListItemRenderer, endsWithCompletedQuestionInteraction, endsWithSubagentContent, formatCompletedResponseDisclosureLabel, getCompletedResponseCollapseEndIndex, getFinalResponseStartIndex, getVisibleCompletedResponseItemCount, getWorkingProgressRelevantParts, isWaitingForMcpServers, reconcileChatItemHeight, renderChatRequestTimestamp, renderChatResponseDetails, shouldCollapseCompletedResponsePart, shouldCreateGroupedThinkingPart, shouldHideChatUserIdentity, shouldPinToolInvocationToThinking, shouldRenderInitialProgressiveContentImmediately, shouldScheduleInitialHeightChange, shouldShowFileChangesSummaryForSettings, shouldShowPillsSummaryForSettings, shouldStartNewCollapsedThinkingGroup } from "../../../browser/widget/chatListRenderer.js";
import { ChatWidget } from "../../../browser/widget/chatWidget.js";
import { isChatTurnStatusPillsEnabled } from "../../../browser/widget/chatTurnPills.js";
import { IChatService, IChatToolInvocation, ToolConfirmKind } from "../../../common/chatService/chatService.js";
import { formatChatRequestTimestamp, formatChatResponseDetails, formatElapsedTime } from "../../../common/chatProgressFormatting.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, CollapsedToolsDisplayMode, ThinkingDisplayMode } from "../../../common/constants.js";
import { ChatModel } from "../../../common/model/chatModel.js";
import { ChatViewModel, isRequestVM, isResponseVM } from "../../../common/model/chatViewModel.js";
import { ChatToolInvocation } from "../../../common/model/chatProgressTypes/chatToolInvocation.js";
import { ChatAgentService, IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ChatRequestTextPart } from "../../../common/requestParser/chatParserTypes.js";
import { ToolDataSource } from "../../../common/tools/languageModelToolsService.js";
import { MockChatService } from "../../common/chatService/mockChatService.js";
suite("ChatListRenderer", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("shouldScheduleInitialHeightChange", () => {
    test("only schedules first measurement updates when needed to avoid clipping", () => {
      assert.deepStrictEqual([
        shouldScheduleInitialHeightChange(120, void 0),
        shouldScheduleInitialHeightChange(120, 120),
        shouldScheduleInitialHeightChange(120, 120.1),
        shouldScheduleInitialHeightChange(121, 120),
        shouldScheduleInitialHeightChange(121, 120.1)
      ], [
        true,
        false,
        false,
        true,
        true
      ]);
    });
    suite("getFinalResponseStartIndex", () => {
      test("finds the trailing markdown response while leaving trailing adjuncts in place", () => {
        assert.deepStrictEqual([
          getFinalResponseStartIndex([
            { kind: "references", references: [] },
            { kind: "markdownContent", content: new MarkdownString("Final response") },
            { kind: "references", references: [] }
          ]),
          getFinalResponseStartIndex([
            { kind: "markdownContent", content: new MarkdownString("Earlier response") },
            { kind: "references", references: [] },
            { kind: "markdownContent", content: new MarkdownString("First segment") },
            { kind: "markdownContent", content: new MarkdownString("Second segment") }
          ]),
          getFinalResponseStartIndex([
            { kind: "references", references: [] },
            { kind: "markdownContent", content: new MarkdownString("") }
          ])
        ], [
          1,
          2,
          void 0
        ]);
      });
      test("formats completed response disclosure step count and timing", () => {
        assert.deepStrictEqual([
          formatCompletedResponseDisclosureLabel(1, 83e3),
          formatCompletedResponseDisclosureLabel(6, 83e3),
          formatCompletedResponseDisclosureLabel(6, void 0)
        ], [
          "Completed 1 step in 1m 23s",
          "Completed 6 steps in 1m 23s",
          "Completed 6 steps"
        ]);
      });
      test("counts visible completed response items", () => {
        const hidden = document.createElement("div");
        hidden.style.display = "none";
        const first = document.createElement("div");
        const second = document.createElement("div");
        assert.deepStrictEqual([
          getVisibleCompletedResponseItemCount([hidden, first]),
          getVisibleCompletedResponseItemCount([hidden, first, second])
        ], [
          1,
          2
        ]);
      });
      test("keeps MCP apps outside completed response disclosure", () => {
        const tool = {
          kind: "toolInvocationSerialized",
          toolCallId: "mcp-app",
          toolId: "create_issue",
          invocationMessage: "Creating issue...",
          originMessage: void 0,
          pastTenseMessage: "Created issue",
          isComplete: true,
          isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
          presentation: void 0,
          source: ToolDataSource.Internal
        };
        const mcpAppTool = {
          ...tool,
          toolSpecificData: {
            kind: "input",
            rawInput: {},
            mcpAppData: {
              kind: "local",
              resourceUri: "ui://github/create-issue",
              serverDefinitionId: "github",
              collectionId: "github"
            }
          }
        };
        const finalResponse = { kind: "markdownContent", content: new MarkdownString("Final response") };
        assert.deepStrictEqual({
          regularToolCollapses: shouldCollapseCompletedResponsePart(tool),
          mcpAppCollapses: shouldCollapseCompletedResponsePart(mcpAppTool),
          withoutMcpApp: getCompletedResponseCollapseEndIndex([tool, tool, finalResponse], 2),
          mcpAppAfterOneStep: getCompletedResponseCollapseEndIndex([tool, mcpAppTool, tool, finalResponse], 3),
          mcpAppFirst: getCompletedResponseCollapseEndIndex([mcpAppTool, tool, finalResponse], 2),
          multipleMcpApps: getCompletedResponseCollapseEndIndex([tool, mcpAppTool, tool, mcpAppTool, finalResponse], 4)
        }, {
          regularToolCollapses: true,
          mcpAppCollapses: false,
          withoutMcpApp: 2,
          mcpAppAfterOneStep: 1,
          mcpAppFirst: 0,
          multipleMcpApps: 1
        });
      });
    });
  });
  suite("reconcileChatItemHeight", () => {
    const run = (steps, allocatedHeight, initialStored) => {
      let stored = initialStored;
      return steps.map(({ measured, isBeingRendered }) => {
        const update = reconcileChatItemHeight(measured, stored, isBeingRendered, allocatedHeight);
        stored = update.nextRenderedHeight;
        return { kind: update.kind, height: update.height, stored };
      });
    };
    test("does not strand a grown height first seen while the row is being rendered", () => {
      assert.deepStrictEqual(
        run(
          [
            { measured: 900, isBeingRendered: true },
            // grew mid-render -> suppressed, defer
            { measured: 900, isBeingRendered: false }
            // deferred re-measure delivers the height
          ],
          /*allocatedHeight*/
          500,
          /*initialStored*/
          500
        ),
        [
          { kind: "deferReMeasure", height: 900, stored: 500 },
          { kind: "fire", height: 900, stored: 900 }
        ]
      );
    });
    test("notifies the tree on async growth and ignores an unchanged measurement", () => {
      assert.deepStrictEqual(
        run(
          [
            { measured: 700, isBeingRendered: false },
            // async growth -> notify
            { measured: 700, isBeingRendered: false }
            // unchanged -> no-op
          ],
          /*allocatedHeight*/
          500,
          /*initialStored*/
          500
        ),
        [
          { kind: "fire", height: 700, stored: 700 },
          { kind: "none", height: 700, stored: 700 }
        ]
      );
    });
    test("first measurement (no stored height) only schedules an update when content would clip", () => {
      assert.deepStrictEqual([
        // Initial measurement that fits within the allocated height -> no notification.
        run(
          [{ measured: 500, isBeingRendered: false }],
          /*allocatedHeight*/
          500,
          /*initialStored*/
          void 0
        ),
        // Initial measurement larger than the allocation -> schedule an initial update.
        run(
          [{ measured: 700, isBeingRendered: false }],
          /*allocatedHeight*/
          500,
          /*initialStored*/
          void 0
        )
      ], [
        [{ kind: "none", height: 500, stored: 500 }],
        [{ kind: "scheduleInitial", height: 700, stored: 700 }]
      ]);
    });
  });
  suite("shouldRenderInitialProgressiveContentImmediately", () => {
    test("renders accumulated markdown immediately only when progressive rendering has not started", () => {
      assert.deepStrictEqual([
        shouldRenderInitialProgressiveContentImmediately(false, true, false),
        shouldRenderInitialProgressiveContentImmediately(false, true, true),
        shouldRenderInitialProgressiveContentImmediately(true, true, false),
        shouldRenderInitialProgressiveContentImmediately(false, false, false)
      ], [
        true,
        false,
        false,
        false
      ]);
    });
  });
  suite("shouldStartNewCollapsedThinkingGroup", () => {
    test("separates reasoning and grouped items only in collapsed mode", () => {
      assert.deepStrictEqual({
        reasoningToItems: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, "reasoning", "items"),
        itemsToReasoning: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, "items", "reasoning"),
        reasoningToReasoning: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, "reasoning", "reasoning"),
        itemsToItems: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, "items", "items"),
        fixedScrolling: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.FixedScrolling, "reasoning", "items"),
        collapsedPreview: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.CollapsedPreview, "reasoning", "items")
      }, {
        reasoningToItems: true,
        itemsToReasoning: true,
        reasoningToReasoning: false,
        itemsToItems: false,
        fixedScrolling: false,
        collapsedPreview: false
      });
    });
  });
  suite("shouldCreateGroupedThinkingPart", () => {
    test("honors withThinking unless a reasoning group was just separated", () => {
      assert.deepStrictEqual({
        withThinkingWithoutReasoning: shouldCreateGroupedThinkingPart(CollapsedToolsDisplayMode.WithThinking, false),
        withThinkingAfterReasoning: shouldCreateGroupedThinkingPart(CollapsedToolsDisplayMode.WithThinking, true),
        alwaysWithoutReasoning: shouldCreateGroupedThinkingPart(CollapsedToolsDisplayMode.Always, false)
      }, {
        withThinkingWithoutReasoning: false,
        withThinkingAfterReasoning: true,
        alwaysWithoutReasoning: true
      });
    });
  });
  suite("formatChatResponseDetails", () => {
    test("formats completion metadata for the footer", () => {
      assert.deepStrictEqual([
        formatChatResponseDetails("GPT-5.6 Sol \u2022 1.5 credits", "4:56 PM"),
        formatChatResponseDetails("GPT-5.6 Sol", void 0),
        formatChatResponseDetails(void 0, "4:56 PM"),
        formatElapsedTime(83e3)
      ], [
        "4:56 PM \u2022 GPT-5.6 Sol \u2022 1.5 credits",
        "GPT-5.6 Sol",
        "4:56 PM",
        "1m 23s"
      ]);
    });
    test("renders completion time with elapsed-time alternate only in verbose mode", () => {
      const container = document.createElement("div");
      container.className = "chat-footer-details";
      const completedAt = Date.now() - 60 * 60 * 1e3;
      renderChatResponseDetails(container, "Claude Opus 4.8", completedAt, 24e3, false);
      const compact = {
        text: container.textContent,
        timing: container.querySelector(".chat-response-timing"),
        tabIndex: container.tabIndex
      };
      renderChatResponseDetails(container, "Claude Opus 4.8", completedAt, 24e3, true);
      assert.deepStrictEqual({
        compact,
        completionDateTime: container.querySelector("time")?.dateTime,
        hasAlternate: container.querySelector(".chat-response-timing")?.classList.contains("has-alternate"),
        duration: container.querySelector(".chat-response-alternate")?.textContent,
        details: container.querySelector(".chat-response-model-details")?.textContent,
        separatorHidden: container.querySelector(".chat-response-details-separator")?.getAttribute("aria-hidden"),
        ariaIncludesElapsed: container.ariaLabel?.includes("24s") ?? false,
        tabIndex: container.tabIndex
      }, {
        compact: {
          text: "Claude Opus 4.8",
          timing: null,
          tabIndex: 0
        },
        completionDateTime: new Date(completedAt).toISOString(),
        hasAlternate: true,
        duration: "24s",
        details: "Claude Opus 4.8",
        separatorHidden: "true",
        ariaIncludesElapsed: true,
        tabIndex: 0
      });
      renderChatResponseDetails(container, void 0, void 0, 24e3, true);
      assert.deepStrictEqual({
        text: container.textContent,
        timing: container.querySelector(".chat-response-timing"),
        hidden: container.classList.contains("hidden"),
        tabIndex: container.tabIndex
      }, {
        text: "",
        timing: null,
        hidden: true,
        tabIndex: -1
      });
      const oldCompletion = Date.now() - 25 * 60 * 60 * 1e3;
      renderChatResponseDetails(container, void 0, oldCompletion, 24e3, true);
      assert.deepStrictEqual({
        compact: container.querySelector(".chat-response-completed-at")?.textContent,
        alternateEndsWithElapsed: container.querySelector(".chat-response-alternate")?.textContent?.endsWith(" \u2022 24s"),
        hasAlternate: container.querySelector(".chat-response-timing")?.classList.contains("has-alternate")
      }, {
        compact: "1 day",
        alternateEndsWithElapsed: true,
        hasAlternate: true
      });
    });
  });
  suite("formatChatRequestTimestamp", () => {
    test("formats valid persisted timestamps and rejects legacy placeholders", () => {
      const timestamp = Date.UTC(2026, 6, 8, 23, 18, 41);
      const formatted = formatChatRequestTimestamp(timestamp);
      assert.deepStrictEqual({
        hasText: !!formatted?.text,
        hasFullText: !!formatted?.fullText,
        dateTime: formatted?.dateTime,
        invalid: formatChatRequestTimestamp(-1)
      }, {
        hasText: true,
        hasFullText: true,
        dateTime: "2026-07-08T23:18:41.000Z",
        invalid: void 0
      });
    });
    test("uses relative days after 24 hours", () => {
      assert.deepStrictEqual([
        formatChatRequestTimestamp(Date.now() - 25 * 60 * 60 * 1e3)?.text,
        formatChatRequestTimestamp(Date.now() - 49 * 60 * 60 * 1e3)?.text
      ], [
        "1 day",
        "2 days"
      ]);
    });
    test("renders compact days with an animated full date alternate", () => {
      const container = document.createElement("div");
      const timestamp = Date.now() - 25 * 60 * 60 * 1e3;
      const rendered = renderChatRequestTimestamp(container, timestamp);
      assert.deepStrictEqual({
        compact: container.querySelector(".chat-request-relative")?.textContent,
        fullDate: container.querySelector(".chat-request-full-date")?.textContent,
        hasAlternate: container.querySelector(".chat-request-timing")?.classList.contains("has-alternate"),
        focusable: rendered?.element.tabIndex,
        managedHoverText: rendered?.hoverText
      }, {
        compact: "1 day",
        fullDate: formatChatRequestTimestamp(timestamp)?.fullText,
        hasAlternate: true,
        focusable: 0,
        managedHoverText: void 0
      });
    });
  });
  test("inline editing keeps a populated timestamp after the edit input with verbose timestamps disabled", () => {
    const disposables = store.add(new DisposableStore());
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
    configurationService.setUserConfiguration("chat.editRequests", "hover");
    configurationService.setUserConfiguration("chat.checkpoints.enabled", false);
    configurationService.setUserConfiguration("chat.checkpoints.showFileChanges", false);
    configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
    const model = disposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, void 0));
    const text = "test";
    const request = model.addRequest({
      text,
      parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
    }, { variables: [] }, Date.now());
    const requestViewModel = viewModel.getItems().find(isRequestVM);
    assert.ok(requestViewModel);
    const container = mainWindow.document.createElement("div");
    mainWindow.document.body.appendChild(container);
    disposables.add(toDisposable(() => container.remove()));
    const renderer = disposables.add(instantiationService.createInstance(
      ChatListItemRenderer,
      {},
      {},
      {
        getListLength: () => 1,
        onDidScroll: () => toDisposable(() => {
        }),
        container,
        currentChatMode: () => ChatModeKind.Agent
      },
      void 0,
      viewModel
    ));
    const template = renderer.renderTemplate(container);
    disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
    renderer.renderElement({ element: requestViewModel, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: void 0 }, 0, template);
    const widget = {
      viewModel,
      configurationService,
      recentlyRestoredCheckpoint: false,
      inputPart: {
        currentModeObs: { get: () => ({ id: ChatModeKind.Agent }) },
        currentModeInfo: {},
        setEditing: () => {
        },
        toggleChatInputOverlay: () => {
        },
        dnd: { setDisabledOverlay: () => {
        } },
        onDidClickOverlay: () => toDisposable(() => {
        })
      },
      input: {
        setChatMode: () => {
        },
        setPermissionLevel: () => {
        },
        setEditing: () => {
        },
        renderAttachedContext: () => {
        },
        setValue: () => {
        },
        attachmentModel: { addContext: () => {
        } },
        inputEditor: {
          getModel: () => void 0,
          focus: () => {
          }
        }
      },
      inlineInputPart: {
        inputEditor: {
          onDidChangeModelContent: () => toDisposable(() => {
          }),
          onDidChangeCursorSelection: () => toDisposable(() => {
          })
        }
      },
      listWidget: {
        acquireAutoScrollHold: () => toDisposable(() => {
        }),
        scrollToCurrentItem: () => {
        }
      },
      _editingAutoScrollHold: disposables.add(new MutableDisposable()),
      createInput: () => {
      },
      onDidChangeItems: () => {
      },
      getContrib: () => void 0,
      _onDidChangeActiveInputEditor: { fire: () => {
      } },
      _register: (disposable) => disposables.add(disposable),
      telemetryService: { publicLog2: () => {
      } }
    };
    ChatWidget.prototype.clickedRequest.call(widget, template);
    assert.deepStrictEqual({
      editingRequestId: viewModel.editing?.id,
      showsVerboseDetails: template.rowContainer.classList.contains("show-verbose-details"),
      timestampPopulated: !!template.requestTimestampContainer.querySelector("time"),
      previousSiblingClass: template.requestTimestampContainer.previousElementSibling?.className
    }, {
      editingRequestId: request.id,
      showsVerboseDetails: false,
      timestampPopulated: true,
      previousSiblingClass: "chat-edit-input-container"
    });
    disposables.dispose();
  });
  suite("turn status pills setting", () => {
    test("normalizes boolean and legacy object values", () => {
      assert.deepStrictEqual([
        isChatTurnStatusPillsEnabled(void 0),
        isChatTurnStatusPillsEnabled(false),
        isChatTurnStatusPillsEnabled(true),
        isChatTurnStatusPillsEnabled({}),
        isChatTurnStatusPillsEnabled({ changes: false, preview: false, browser: false }),
        isChatTurnStatusPillsEnabled({ changes: true }),
        isChatTurnStatusPillsEnabled({ preview: true }),
        isChatTurnStatusPillsEnabled({ browser: true })
      ], [false, false, true, false, false, true, true, true]);
    });
    test("computes pill and legacy file summaries independently", () => {
      assert.deepStrictEqual({
        fileSummary: shouldShowFileChangesSummaryForSettings(true, true, true),
        fileSummaryIncomplete: shouldShowFileChangesSummaryForSettings(false, true, true),
        fileSummaryNonLocal: shouldShowFileChangesSummaryForSettings(true, false, true),
        fileSummaryDisabled: shouldShowFileChangesSummaryForSettings(true, true, false),
        pillsSummary: shouldShowPillsSummaryForSettings(true, true, true),
        pillsSummaryLegacy: shouldShowPillsSummaryForSettings(true, true, { preview: true }),
        pillsSummaryIncomplete: shouldShowPillsSummaryForSettings(false, true, true),
        pillsSummaryNonAgentHost: shouldShowPillsSummaryForSettings(true, false, true),
        pillsSummaryDisabled: shouldShowPillsSummaryForSettings(true, true, false)
      }, {
        fileSummary: true,
        fileSummaryIncomplete: false,
        fileSummaryNonLocal: false,
        fileSummaryDisabled: false,
        pillsSummary: true,
        pillsSummaryLegacy: true,
        pillsSummaryIncomplete: false,
        pillsSummaryNonAgentHost: false,
        pillsSummaryDisabled: false
      });
    });
  });
  suite("shouldPinToolInvocationToThinking", () => {
    test("keeps tool invocations requiring user input or MCP apps outside Thinking", () => {
      assert.deepStrictEqual({
        executionConfirmation: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.WaitingForConfirmation, false, false),
        resultApproval: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.WaitingForPostApproval, false, false),
        authentication: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.WaitingForAuthentication, false, false),
        executingWithConfirmation: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Executing, true, false),
        executingWithoutConfirmation: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Executing, false, false),
        executingWithMcpApp: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Executing, false, true),
        streamingWithMcpApp: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Streaming, false, true)
      }, {
        executionConfirmation: false,
        resultApproval: false,
        authentication: false,
        executingWithConfirmation: false,
        executingWithoutConfirmation: true,
        executingWithMcpApp: false,
        streamingWithMcpApp: false
      });
      suite("endsWithCompletedQuestionInteraction", () => {
        test("resumes working progress after completed ask interactions", () => {
          const completedTool = {
            kind: "toolInvocationSerialized",
            toolCallId: "ask-1",
            toolId: "ask_user",
            invocationMessage: "Waiting for answer...",
            originMessage: void 0,
            pastTenseMessage: void 0,
            isComplete: true,
            isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
            presentation: void 0,
            source: ToolDataSource.Internal
          };
          const completedQuestion = {
            kind: "questionCarousel",
            questions: [],
            allowSkip: true,
            isUsed: true
          };
          assert.deepStrictEqual([
            endsWithCompletedQuestionInteraction([completedTool]),
            endsWithCompletedQuestionInteraction([completedTool, completedQuestion]),
            endsWithCompletedQuestionInteraction([{ ...completedQuestion, isUsed: false }]),
            endsWithCompletedQuestionInteraction([{ ...completedTool, toolId: "read_file" }])
          ], [true, true, false, false]);
        });
      });
    });
  });
  suite("shouldHideChatUserIdentity", () => {
    test("hides local Copilot and Agent Host Copilot response identity", () => {
      assert.deepStrictEqual([
        shouldHideChatUserIdentity("GitHub Copilot", URI.from({ scheme: "vscode-chat-editor" }), true, false, false),
        shouldHideChatUserIdentity("Copilot", URI.from({ scheme: "agent-host-copilotcli" }), true, false, false),
        shouldHideChatUserIdentity("Copilot", URI.from({ scheme: "agent-host-copilotcli" }), false, false, false),
        shouldHideChatUserIdentity("Copilot", URI.from({ scheme: "remote-test-authority-copilotcli" }), true, false, false),
        shouldHideChatUserIdentity("Copilot", URI.from({ scheme: "remote-test-authority-copilotcli" }), false, false, false),
        shouldHideChatUserIdentity("Claude", URI.from({ scheme: "remote-test-authority-claude" }), true, false, false),
        shouldHideChatUserIdentity("Claude", URI.from({ scheme: "agent-host-claude" }), true, false, false),
        shouldHideChatUserIdentity("Claude", URI.from({ scheme: "agent-host-claude" }), true, true, false),
        shouldHideChatUserIdentity("User", URI.from({ scheme: "vscode-chat-editor" }), false, false, true)
      ], [
        true,
        true,
        false,
        true,
        false,
        false,
        false,
        true,
        true
      ]);
    });
  });
  suite("buildPlanReviewProgressContent", () => {
    test("keeps plan summary and full plan link after approval", () => {
      const content = buildPlanReviewProgressContent({
        kind: "planReview",
        title: "Review Plan",
        content: "## Plan summary",
        actions: [{ id: "interactive", label: "Implement Plan" }],
        canProvideFeedback: true,
        planUri: URI.file("/sessions/abc/plan.md").toJSON(),
        isUsed: true,
        data: { rejected: false, action: "Implement Plan", actionId: "interactive" }
      }, "Approved plan");
      assert.strictEqual(content.value, "Approved&nbsp;plan\n\n## Plan summary\n\n[Open full plan file (plan.md)](file:///sessions/abc/plan.md?vscodeLinkType=file)");
    });
    test("renders structured feedback as markdown before the plan", () => {
      const content = buildPlanReviewProgressContent({
        kind: "planReview",
        title: "Review Plan",
        content: "## Plan summary",
        actions: [{ id: "interactive", label: "Implement Plan" }],
        canProvideFeedback: true,
        planUri: URI.file("/sessions/abc/plan.md").toJSON(),
        isUsed: true,
        data: {
          rejected: false,
          feedback: "Use **named helpers**.\n\nInline comments on `plan.md`:\n- **Line 6:** Extract this",
          feedbackOverall: "Use **named helpers**.",
          feedbackInlineMarkdown: "Inline comments on `plan.md`:\n- **Line 6:** Extract this"
        }
      }, "Provided feedback");
      assert.strictEqual(content.value, [
        "Provided&nbsp;feedback",
        "Use **named helpers**.",
        "Inline comments on `plan.md`:\n- **Line 6:** Extract this",
        "## Plan summary",
        "[Open full plan file (plan.md)](file:///sessions/abc/plan.md?vscodeLinkType=file)"
      ].join("\n\n"));
    });
    test("renders combined legacy feedback as markdown", () => {
      const content = buildPlanReviewProgressContent({
        kind: "planReview",
        title: "Review Plan",
        content: "",
        actions: [{ id: "interactive", label: "Implement Plan" }],
        canProvideFeedback: true,
        isUsed: true,
        data: {
          rejected: false,
          feedback: "Overall **comment**\n\nInline comments:\n- **Line 7:** Rename this"
        }
      }, "Provided feedback");
      assert.strictEqual(content.value, [
        "Provided&nbsp;feedback",
        "Overall **comment**",
        "Inline comments:\n- **Line 7:** Rename this"
      ].join("\n\n"));
    });
  });
  test("working progress ignores subagent-owned response parts", () => {
    const parentSubagent = {
      kind: "toolInvocationSerialized",
      toolCallId: "subagent-1",
      toolId: "task",
      source: ToolDataSource.Internal,
      invocationMessage: "Running subagent",
      originMessage: void 0,
      pastTenseMessage: void 0,
      isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
      isComplete: true,
      presentation: void 0,
      toolSpecificData: { kind: "subagent", description: "Investigate" }
    };
    const childTool = {
      ...parentSubagent,
      toolCallId: "child-1",
      toolId: "search",
      subAgentInvocationId: "subagent-1",
      toolSpecificData: void 0
    };
    const parts = [
      { kind: "references", references: [] },
      parentSubagent,
      childTool,
      { kind: "markdownContent", content: { value: '<vscode_codeblock_uri subAgentInvocationId="subagent-1">file:///test.txt</vscode_codeblock_uri>' } },
      { kind: "hook", hookType: "PreToolUse", subAgentInvocationId: "subagent-1" }
    ];
    assert.deepStrictEqual({
      relevantParts: getWorkingProgressRelevantParts(parts).map((part) => part.kind),
      endsWithTaggedMarkdown: endsWithSubagentContent(parts.slice(0, 4)),
      endsWithSubagentHook: endsWithSubagentContent(parts),
      endsWithSubagentChildTool: endsWithSubagentContent(parts.slice(0, 3)),
      endsWithParentSubagentTool: endsWithSubagentContent(parts.slice(0, 2))
    }, {
      relevantParts: ["references"],
      endsWithTaggedMarkdown: false,
      endsWithSubagentHook: false,
      endsWithSubagentChildTool: false,
      endsWithParentSubagentTool: true
    });
  });
  test("working progress is hidden while MCP servers are starting", () => {
    const servers = observableValue("servers", [{ id: "a", name: "alpha" }]);
    const part = {
      kind: "mcpServersStartingSlow",
      sessionResource: URI.parse("chat-session://test/session1"),
      servers
    };
    const whileStarting = isWaitingForMcpServers([part]);
    servers.set([], void 0);
    const afterStarting = isWaitingForMcpServers([part]);
    assert.deepStrictEqual({ whileStarting, afterStarting }, { whileStarting: true, afterStarting: false });
  });
  test("final markdown remains mounted after thinking and tool progress completes with reduced motion", async () => {
    const disposables = store.add(new DisposableStore());
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
    configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, ThinkingDisplayMode.FixedScrolling);
    configurationService.setUserConfiguration("chat.agent.thinking.collapsedTools", CollapsedToolsDisplayMode.Always);
    configurationService.setUserConfiguration("chat.checkpoints.enabled", false);
    configurationService.setUserConfiguration("chat.checkpoints.showFileChanges", false);
    configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
    configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
    configurationService.setUserConfiguration("workbench.reduceMotion", "on");
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
    const model = disposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, void 0));
    const text = "test";
    const request = model.addRequest({
      text,
      parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
    }, { variables: [] }, 0);
    const response = viewModel.getItems().find(isResponseVM);
    assert.ok(response);
    const container = mainWindow.document.createElement("div");
    mainWindow.document.body.appendChild(container);
    disposables.add(toDisposable(() => container.remove()));
    const renderer = disposables.add(instantiationService.createInstance(
      ChatListItemRenderer,
      {},
      { progressMessageAtBottomOfResponse: true },
      {
        getListLength: () => 1,
        onDidScroll: () => toDisposable(() => {
        }),
        container,
        currentChatMode: () => ChatModeKind.Agent
      },
      void 0,
      viewModel
    ));
    const template = renderer.renderTemplate(container);
    disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
    const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: void 0 };
    model.acceptResponseProgress(request, { kind: "thinking", value: "Thinking ...", id: "thinking-1" });
    renderer.renderElement(node, 0, template);
    const toolInvocation = new ChatToolInvocation({
      invocationMessage: "Running tool...",
      pastTenseMessage: "Tool completed"
    }, {
      id: "my-tool",
      displayName: "My Tool",
      modelDescription: "Test tool",
      source: ToolDataSource.Internal
    }, "call-1", void 0, {}, {}, request.id);
    model.acceptResponseProgress(request, toolInvocation);
    renderer.renderElement(node, 0, template);
    await toolInvocation.didExecuteTool(void 0);
    renderer.renderElement(node, 0, template);
    model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString("Final response") });
    renderer.renderElement(node, 0, template);
    const mountedWhileStreaming = template.value.textContent?.includes("Final response") ?? false;
    request.response?.complete();
    renderer.renderElement(node, 0, template);
    assert.deepStrictEqual({
      mountedWhileStreaming,
      mountedAfterCompletion: template.value.textContent?.includes("Final response") ?? false
    }, {
      mountedWhileStreaming: true,
      mountedAfterCompletion: true
    });
    disposables.dispose();
  });
  test.skip("fireItemHeightChange defers a mid-render measurement and delivers it after the render pass", async () => {
    const disposables = store.add(new DisposableStore());
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
    const model = disposables.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
    const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, void 0));
    const text = "test";
    const request = model.addRequest({
      text,
      parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
    }, { variables: [] }, 0);
    const response = viewModel.getItems().find(isResponseVM);
    assert.ok(response);
    const container = mainWindow.document.createElement("div");
    mainWindow.document.body.appendChild(container);
    disposables.add(toDisposable(() => container.remove()));
    const renderer = disposables.add(instantiationService.createInstance(
      ChatListItemRenderer,
      {},
      { progressMessageAtBottomOfResponse: true },
      {
        getListLength: () => 1,
        onDidScroll: () => toDisposable(() => {
        }),
        container,
        currentChatMode: () => ChatModeKind.Agent
      },
      void 0,
      viewModel
    ));
    const template = renderer.renderTemplate(container);
    disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
    const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: void 0 };
    model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString("Some initial content") });
    renderer.renderElement(node, 0, template);
    request.response?.complete();
    renderer.renderElement(node, 0, template);
    const privateRenderer = renderer;
    const nextFrame = () => new Promise((resolve) => dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => resolve()));
    await nextFrame();
    await nextFrame();
    const renderedHeight = Math.ceil(template.rowContainer.getBoundingClientRect().height);
    assert.ok(renderedHeight > 1, "row should have a real rendered height");
    response.currentRenderedHeight = renderedHeight - 1;
    const heightEvents = [];
    disposables.add(renderer.onDidChangeItemHeight((e) => heightEvents.push(e.height)));
    privateRenderer._elementBeingRendered = response;
    privateRenderer.fireItemHeightChange(template);
    assert.deepStrictEqual(
      { events: [...heightEvents], stored: response.currentRenderedHeight },
      { events: [], stored: renderedHeight - 1 }
    );
    privateRenderer._elementBeingRendered = void 0;
    await nextFrame();
    assert.deepStrictEqual(
      { events: [...heightEvents], stored: response.currentRenderedHeight },
      { events: [renderedHeight], stored: renderedHeight }
    );
    disposables.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0TGlzdFJlbmRlcmVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBidWlsZFBsYW5SZXZpZXdQcm9ncmVzc0NvbnRlbnQsIENoYXRMaXN0SXRlbVJlbmRlcmVyLCBlbmRzV2l0aENvbXBsZXRlZFF1ZXN0aW9uSW50ZXJhY3Rpb24sIGVuZHNXaXRoU3ViYWdlbnRDb250ZW50LCBmb3JtYXRDb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmVMYWJlbCwgZ2V0Q29tcGxldGVkUmVzcG9uc2VDb2xsYXBzZUVuZEluZGV4LCBnZXRGaW5hbFJlc3BvbnNlU3RhcnRJbmRleCwgZ2V0VmlzaWJsZUNvbXBsZXRlZFJlc3BvbnNlSXRlbUNvdW50LCBnZXRXb3JraW5nUHJvZ3Jlc3NSZWxldmFudFBhcnRzLCBJQ2hhdExpc3RJdGVtVGVtcGxhdGUsIGlzV2FpdGluZ0Zvck1jcFNlcnZlcnMsIHJlY29uY2lsZUNoYXRJdGVtSGVpZ2h0LCByZW5kZXJDaGF0UmVxdWVzdFRpbWVzdGFtcCwgcmVuZGVyQ2hhdFJlc3BvbnNlRGV0YWlscywgc2hvdWxkQ29sbGFwc2VDb21wbGV0ZWRSZXNwb25zZVBhcnQsIHNob3VsZENyZWF0ZUdyb3VwZWRUaGlua2luZ1BhcnQsIHNob3VsZEhpZGVDaGF0VXNlcklkZW50aXR5LCBzaG91bGRQaW5Ub29sSW52b2NhdGlvblRvVGhpbmtpbmcsIHNob3VsZFJlbmRlckluaXRpYWxQcm9ncmVzc2l2ZUNvbnRlbnRJbW1lZGlhdGVseSwgc2hvdWxkU2NoZWR1bGVJbml0aWFsSGVpZ2h0Q2hhbmdlLCBzaG91bGRTaG93RmlsZUNoYW5nZXNTdW1tYXJ5Rm9yU2V0dGluZ3MsIHNob3VsZFNob3dQaWxsc1N1bW1hcnlGb3JTZXR0aW5ncywgc2hvdWxkU3RhcnROZXdDb2xsYXBzZWRUaGlua2luZ0dyb3VwIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdExpc3RSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBDaGF0V2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBpc0NoYXRUdXJuU3RhdHVzUGlsbHNFbmFibGVkIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdFR1cm5QaWxscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZ1Nsb3csIElDaGF0UXVlc3Rpb25DYXJvdXNlbCwgSUNoYXRTZXJ2aWNlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCwgVG9vbENvbmZpcm1LaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGZvcm1hdENoYXRSZXF1ZXN0VGltZXN0YW1wLCBmb3JtYXRDaGF0UmVzcG9uc2VEZXRhaWxzLCBmb3JtYXRFbGFwc2VkVGltZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0UHJvZ3Jlc3NGb3JtYXR0aW5nLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0Q29uZmlndXJhdGlvbiwgQ2hhdE1vZGVLaW5kLCBDb2xsYXBzZWRUb29sc0Rpc3BsYXlNb2RlLCBUaGlua2luZ0Rpc3BsYXlNb2RlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IENoYXRWaWV3TW9kZWwsIElDaGF0UmVuZGVyZXJDb250ZW50LCBJQ2hhdFJlc3BvbnNlVmlld01vZGVsLCBpc1JlcXVlc3RWTSwgaXNSZXNwb25zZVZNIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRUb29sSW52b2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRTZXJ2aWNlLCBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFRleHRQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IFRvb2xEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0T3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvbW9ja0NoYXRTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ0NoYXRMaXN0UmVuZGVyZXInLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3Nob3VsZFNjaGVkdWxlSW5pdGlhbEhlaWdodENoYW5nZScsICgpID0+IHtcblx0XHR0ZXN0KCdvbmx5IHNjaGVkdWxlcyBmaXJzdCBtZWFzdXJlbWVudCB1cGRhdGVzIHdoZW4gbmVlZGVkIHRvIGF2b2lkIGNsaXBwaW5nJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdHNob3VsZFNjaGVkdWxlSW5pdGlhbEhlaWdodENoYW5nZSgxMjAsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHNob3VsZFNjaGVkdWxlSW5pdGlhbEhlaWdodENoYW5nZSgxMjAsIDEyMCksXG5cdFx0XHRcdHNob3VsZFNjaGVkdWxlSW5pdGlhbEhlaWdodENoYW5nZSgxMjAsIDEyMC4xKSxcblx0XHRcdFx0c2hvdWxkU2NoZWR1bGVJbml0aWFsSGVpZ2h0Q2hhbmdlKDEyMSwgMTIwKSxcblx0XHRcdFx0c2hvdWxkU2NoZWR1bGVJbml0aWFsSGVpZ2h0Q2hhbmdlKDEyMSwgMTIwLjEpLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdnZXRGaW5hbFJlc3BvbnNlU3RhcnRJbmRleCcsICgpID0+IHtcblx0XHRcdHRlc3QoJ2ZpbmRzIHRoZSB0cmFpbGluZyBtYXJrZG93biByZXNwb25zZSB3aGlsZSBsZWF2aW5nIHRyYWlsaW5nIGFkanVuY3RzIGluIHBsYWNlJywgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0XHRnZXRGaW5hbFJlc3BvbnNlU3RhcnRJbmRleChbXG5cdFx0XHRcdFx0XHR7IGtpbmQ6ICdyZWZlcmVuY2VzJywgcmVmZXJlbmNlczogW10gfSxcblx0XHRcdFx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnRmluYWwgcmVzcG9uc2UnKSB9LFxuXHRcdFx0XHRcdFx0eyBraW5kOiAncmVmZXJlbmNlcycsIHJlZmVyZW5jZXM6IFtdIH0sXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0Z2V0RmluYWxSZXNwb25zZVN0YXJ0SW5kZXgoW1xuXHRcdFx0XHRcdFx0eyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdFYXJsaWVyIHJlc3BvbnNlJykgfSxcblx0XHRcdFx0XHRcdHsga2luZDogJ3JlZmVyZW5jZXMnLCByZWZlcmVuY2VzOiBbXSB9LFxuXHRcdFx0XHRcdFx0eyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdGaXJzdCBzZWdtZW50JykgfSxcblx0XHRcdFx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnU2Vjb25kIHNlZ21lbnQnKSB9LFxuXHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRcdGdldEZpbmFsUmVzcG9uc2VTdGFydEluZGV4KFtcblx0XHRcdFx0XHRcdHsga2luZDogJ3JlZmVyZW5jZXMnLCByZWZlcmVuY2VzOiBbXSB9LFxuXHRcdFx0XHRcdFx0eyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCcnKSB9LFxuXHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRdLCBbXG5cdFx0XHRcdFx0MSxcblx0XHRcdFx0XHQyLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZm9ybWF0cyBjb21wbGV0ZWQgcmVzcG9uc2UgZGlzY2xvc3VyZSBzdGVwIGNvdW50IGFuZCB0aW1pbmcnLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRcdGZvcm1hdENvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZUxhYmVsKDEsIDgzXzAwMCksXG5cdFx0XHRcdFx0Zm9ybWF0Q29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlTGFiZWwoNiwgODNfMDAwKSxcblx0XHRcdFx0XHRmb3JtYXRDb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmVMYWJlbCg2LCB1bmRlZmluZWQpLFxuXHRcdFx0XHRdLCBbXG5cdFx0XHRcdFx0J0NvbXBsZXRlZCAxIHN0ZXAgaW4gMW0gMjNzJyxcblx0XHRcdFx0XHQnQ29tcGxldGVkIDYgc3RlcHMgaW4gMW0gMjNzJyxcblx0XHRcdFx0XHQnQ29tcGxldGVkIDYgc3RlcHMnLFxuXHRcdFx0XHRdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdjb3VudHMgdmlzaWJsZSBjb21wbGV0ZWQgcmVzcG9uc2UgaXRlbXMnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGhpZGRlbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRoaWRkZW4uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0Y29uc3QgZmlyc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0Y29uc3Qgc2Vjb25kID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdFx0Z2V0VmlzaWJsZUNvbXBsZXRlZFJlc3BvbnNlSXRlbUNvdW50KFtoaWRkZW4sIGZpcnN0XSksXG5cdFx0XHRcdFx0Z2V0VmlzaWJsZUNvbXBsZXRlZFJlc3BvbnNlSXRlbUNvdW50KFtoaWRkZW4sIGZpcnN0LCBzZWNvbmRdKSxcblx0XHRcdFx0XSwgW1xuXHRcdFx0XHRcdDEsXG5cdFx0XHRcdFx0Mixcblx0XHRcdFx0XSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgna2VlcHMgTUNQIGFwcHMgb3V0c2lkZSBjb21wbGV0ZWQgcmVzcG9uc2UgZGlzY2xvc3VyZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdG9vbDogSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQgPSB7XG5cdFx0XHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ21jcC1hcHAnLFxuXHRcdFx0XHRcdHRvb2xJZDogJ2NyZWF0ZV9pc3N1ZScsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdDcmVhdGluZyBpc3N1ZS4uLicsXG5cdFx0XHRcdFx0b3JpZ2luTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdDcmVhdGVkIGlzc3VlJyxcblx0XHRcdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRcdGlzQ29uZmlybWVkOiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgfSxcblx0XHRcdFx0XHRwcmVzZW50YXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBtY3BBcHBUb29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCA9IHtcblx0XHRcdFx0XHQuLi50b29sLFxuXHRcdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbnB1dCcsXG5cdFx0XHRcdFx0XHRyYXdJbnB1dDoge30sXG5cdFx0XHRcdFx0XHRtY3BBcHBEYXRhOiB7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICdsb2NhbCcsXG5cdFx0XHRcdFx0XHRcdHJlc291cmNlVXJpOiAndWk6Ly9naXRodWIvY3JlYXRlLWlzc3VlJyxcblx0XHRcdFx0XHRcdFx0c2VydmVyRGVmaW5pdGlvbklkOiAnZ2l0aHViJyxcblx0XHRcdFx0XHRcdFx0Y29sbGVjdGlvbklkOiAnZ2l0aHViJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgZmluYWxSZXNwb25zZSA9IHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnRmluYWwgcmVzcG9uc2UnKSB9IGFzIGNvbnN0O1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdHJlZ3VsYXJUb29sQ29sbGFwc2VzOiBzaG91bGRDb2xsYXBzZUNvbXBsZXRlZFJlc3BvbnNlUGFydCh0b29sKSxcblx0XHRcdFx0XHRtY3BBcHBDb2xsYXBzZXM6IHNob3VsZENvbGxhcHNlQ29tcGxldGVkUmVzcG9uc2VQYXJ0KG1jcEFwcFRvb2wpLFxuXHRcdFx0XHRcdHdpdGhvdXRNY3BBcHA6IGdldENvbXBsZXRlZFJlc3BvbnNlQ29sbGFwc2VFbmRJbmRleChbdG9vbCwgdG9vbCwgZmluYWxSZXNwb25zZV0sIDIpLFxuXHRcdFx0XHRcdG1jcEFwcEFmdGVyT25lU3RlcDogZ2V0Q29tcGxldGVkUmVzcG9uc2VDb2xsYXBzZUVuZEluZGV4KFt0b29sLCBtY3BBcHBUb29sLCB0b29sLCBmaW5hbFJlc3BvbnNlXSwgMyksXG5cdFx0XHRcdFx0bWNwQXBwRmlyc3Q6IGdldENvbXBsZXRlZFJlc3BvbnNlQ29sbGFwc2VFbmRJbmRleChbbWNwQXBwVG9vbCwgdG9vbCwgZmluYWxSZXNwb25zZV0sIDIpLFxuXHRcdFx0XHRcdG11bHRpcGxlTWNwQXBwczogZ2V0Q29tcGxldGVkUmVzcG9uc2VDb2xsYXBzZUVuZEluZGV4KFt0b29sLCBtY3BBcHBUb29sLCB0b29sLCBtY3BBcHBUb29sLCBmaW5hbFJlc3BvbnNlXSwgNCksXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRyZWd1bGFyVG9vbENvbGxhcHNlczogdHJ1ZSxcblx0XHRcdFx0XHRtY3BBcHBDb2xsYXBzZXM6IGZhbHNlLFxuXHRcdFx0XHRcdHdpdGhvdXRNY3BBcHA6IDIsXG5cdFx0XHRcdFx0bWNwQXBwQWZ0ZXJPbmVTdGVwOiAxLFxuXHRcdFx0XHRcdG1jcEFwcEZpcnN0OiAwLFxuXHRcdFx0XHRcdG11bHRpcGxlTWNwQXBwczogMSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlY29uY2lsZUNoYXRJdGVtSGVpZ2h0JywgKCkgPT4ge1xuXHRcdC8vIEhlbHBlcjogcnVuIGEgc2VxdWVuY2Ugb2YgbWVhc3VyZW1lbnRzIHRocm91Z2ggdGhlIHJlY29uY2lsZXIsIHRocmVhZGluZ1xuXHRcdC8vIGBjdXJyZW50UmVuZGVyZWRIZWlnaHRgIHRoZSB3YXkgYGZpcmVJdGVtSGVpZ2h0Q2hhbmdlYCBkb2VzLCBhbmQgY2FwdHVyZSB0aGVcblx0XHQvLyBub3RpZmljYXRpb24ga2luZCArIHRoZSBzdG9yZWQgaGVpZ2h0IGFmdGVyIGVhY2ggc3RlcC4gYGluaXRpYWxTdG9yZWRgIGlzIHRoZVxuXHRcdC8vIGVsZW1lbnQncyBgY3VycmVudFJlbmRlcmVkSGVpZ2h0YCBiZWZvcmUgdGhlIGZpcnN0IHN0ZXAgKHVuZGVmaW5lZCA9IG5ldmVyIG1lYXN1cmVkKS5cblx0XHRjb25zdCBydW4gPSAoc3RlcHM6IHJlYWRvbmx5IHsgbWVhc3VyZWQ6IG51bWJlcjsgaXNCZWluZ1JlbmRlcmVkOiBib29sZWFuIH1bXSwgYWxsb2NhdGVkSGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQsIGluaXRpYWxTdG9yZWQ6IG51bWJlciB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0bGV0IHN0b3JlZDogbnVtYmVyIHwgdW5kZWZpbmVkID0gaW5pdGlhbFN0b3JlZDtcblx0XHRcdHJldHVybiBzdGVwcy5tYXAoKHsgbWVhc3VyZWQsIGlzQmVpbmdSZW5kZXJlZCB9KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVwZGF0ZSA9IHJlY29uY2lsZUNoYXRJdGVtSGVpZ2h0KG1lYXN1cmVkLCBzdG9yZWQsIGlzQmVpbmdSZW5kZXJlZCwgYWxsb2NhdGVkSGVpZ2h0KTtcblx0XHRcdFx0c3RvcmVkID0gdXBkYXRlLm5leHRSZW5kZXJlZEhlaWdodDtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogdXBkYXRlLmtpbmQsIGhlaWdodDogdXBkYXRlLmhlaWdodCwgc3RvcmVkIH07XG5cdFx0XHR9KTtcblx0XHR9O1xuXG5cdFx0Ly8gUmVncmVzc2lvbiB0ZXN0IGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzI2OTUyLlxuXHRcdC8vIEEgcm93IGdyb3dzIGR1cmluZyBzdHJlYW1pbmcgYW5kIGlzIG1lYXN1cmVkIHN5bmNocm9ub3VzbHkgd2hpbGUgaXQgaXMgYmVpbmcgcmVuZGVyZWRcblx0XHQvLyAobm90aWZpY2F0aW9uIHN1cHByZXNzZWQpLiBUaGUgc3RvcmVkIGhlaWdodCBtdXN0IE5PVCBhZHZhbmNlLCBhbmQgYSBkZWZlcnJlZCByZS1tZWFzdXJlXG5cdFx0Ly8gbXVzdCBiZSByZXF1ZXN0ZWQsIHNvIGEgZm9sbG93LXVwIG1lYXN1cmVtZW50IG9mIHRoZSBncm93biBoZWlnaHQgYWN0dWFsbHkgcmVhY2hlcyB0aGVcblx0XHQvLyB0cmVlIGluc3RlYWQgb2YgYmVpbmcgZGVkdXBlZCBhd2F5ICh3aGljaCB3b3VsZCBzdHJhbmQgdGhlIGNvbnRlbnQgdW50aWwgYSB3aW5kb3cgcmVzaXplKS5cblx0XHR0ZXN0KCdkb2VzIG5vdCBzdHJhbmQgYSBncm93biBoZWlnaHQgZmlyc3Qgc2VlbiB3aGlsZSB0aGUgcm93IGlzIGJlaW5nIHJlbmRlcmVkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cnVuKFtcblx0XHRcdFx0XHR7IG1lYXN1cmVkOiA5MDAsIGlzQmVpbmdSZW5kZXJlZDogdHJ1ZSB9LCAgIC8vIGdyZXcgbWlkLXJlbmRlciAtPiBzdXBwcmVzc2VkLCBkZWZlclxuXHRcdFx0XHRcdHsgbWVhc3VyZWQ6IDkwMCwgaXNCZWluZ1JlbmRlcmVkOiBmYWxzZSB9LCAgLy8gZGVmZXJyZWQgcmUtbWVhc3VyZSBkZWxpdmVycyB0aGUgaGVpZ2h0XG5cdFx0XHRcdF0sIC8qYWxsb2NhdGVkSGVpZ2h0Ki8gNTAwLCAvKmluaXRpYWxTdG9yZWQqLyA1MDApLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBraW5kOiAnZGVmZXJSZU1lYXN1cmUnLCBoZWlnaHQ6IDkwMCwgc3RvcmVkOiA1MDAgfSxcblx0XHRcdFx0XHR7IGtpbmQ6ICdmaXJlJywgaGVpZ2h0OiA5MDAsIHN0b3JlZDogOTAwIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm90aWZpZXMgdGhlIHRyZWUgb24gYXN5bmMgZ3Jvd3RoIGFuZCBpZ25vcmVzIGFuIHVuY2hhbmdlZCBtZWFzdXJlbWVudCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJ1bihbXG5cdFx0XHRcdFx0eyBtZWFzdXJlZDogNzAwLCBpc0JlaW5nUmVuZGVyZWQ6IGZhbHNlIH0sICAvLyBhc3luYyBncm93dGggLT4gbm90aWZ5XG5cdFx0XHRcdFx0eyBtZWFzdXJlZDogNzAwLCBpc0JlaW5nUmVuZGVyZWQ6IGZhbHNlIH0sICAvLyB1bmNoYW5nZWQgLT4gbm8tb3Bcblx0XHRcdFx0XSwgLyphbGxvY2F0ZWRIZWlnaHQqLyA1MDAsIC8qaW5pdGlhbFN0b3JlZCovIDUwMCksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IGtpbmQ6ICdmaXJlJywgaGVpZ2h0OiA3MDAsIHN0b3JlZDogNzAwIH0sXG5cdFx0XHRcdFx0eyBraW5kOiAnbm9uZScsIGhlaWdodDogNzAwLCBzdG9yZWQ6IDcwMCB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpcnN0IG1lYXN1cmVtZW50IChubyBzdG9yZWQgaGVpZ2h0KSBvbmx5IHNjaGVkdWxlcyBhbiB1cGRhdGUgd2hlbiBjb250ZW50IHdvdWxkIGNsaXAnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0Ly8gSW5pdGlhbCBtZWFzdXJlbWVudCB0aGF0IGZpdHMgd2l0aGluIHRoZSBhbGxvY2F0ZWQgaGVpZ2h0IC0+IG5vIG5vdGlmaWNhdGlvbi5cblx0XHRcdFx0cnVuKFt7IG1lYXN1cmVkOiA1MDAsIGlzQmVpbmdSZW5kZXJlZDogZmFsc2UgfV0sIC8qYWxsb2NhdGVkSGVpZ2h0Ki8gNTAwLCAvKmluaXRpYWxTdG9yZWQqLyB1bmRlZmluZWQpLFxuXHRcdFx0XHQvLyBJbml0aWFsIG1lYXN1cmVtZW50IGxhcmdlciB0aGFuIHRoZSBhbGxvY2F0aW9uIC0+IHNjaGVkdWxlIGFuIGluaXRpYWwgdXBkYXRlLlxuXHRcdFx0XHRydW4oW3sgbWVhc3VyZWQ6IDcwMCwgaXNCZWluZ1JlbmRlcmVkOiBmYWxzZSB9XSwgLyphbGxvY2F0ZWRIZWlnaHQqLyA1MDAsIC8qaW5pdGlhbFN0b3JlZCovIHVuZGVmaW5lZCksXG5cdFx0XHRdLCBbXG5cdFx0XHRcdFt7IGtpbmQ6ICdub25lJywgaGVpZ2h0OiA1MDAsIHN0b3JlZDogNTAwIH1dLFxuXHRcdFx0XHRbeyBraW5kOiAnc2NoZWR1bGVJbml0aWFsJywgaGVpZ2h0OiA3MDAsIHN0b3JlZDogNzAwIH1dLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzaG91bGRSZW5kZXJJbml0aWFsUHJvZ3Jlc3NpdmVDb250ZW50SW1tZWRpYXRlbHknLCAoKSA9PiB7XG5cdFx0dGVzdCgncmVuZGVycyBhY2N1bXVsYXRlZCBtYXJrZG93biBpbW1lZGlhdGVseSBvbmx5IHdoZW4gcHJvZ3Jlc3NpdmUgcmVuZGVyaW5nIGhhcyBub3Qgc3RhcnRlZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRzaG91bGRSZW5kZXJJbml0aWFsUHJvZ3Jlc3NpdmVDb250ZW50SW1tZWRpYXRlbHkoZmFsc2UsIHRydWUsIGZhbHNlKSxcblx0XHRcdFx0c2hvdWxkUmVuZGVySW5pdGlhbFByb2dyZXNzaXZlQ29udGVudEltbWVkaWF0ZWx5KGZhbHNlLCB0cnVlLCB0cnVlKSxcblx0XHRcdFx0c2hvdWxkUmVuZGVySW5pdGlhbFByb2dyZXNzaXZlQ29udGVudEltbWVkaWF0ZWx5KHRydWUsIHRydWUsIGZhbHNlKSxcblx0XHRcdFx0c2hvdWxkUmVuZGVySW5pdGlhbFByb2dyZXNzaXZlQ29udGVudEltbWVkaWF0ZWx5KGZhbHNlLCBmYWxzZSwgZmFsc2UpLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzaG91bGRTdGFydE5ld0NvbGxhcHNlZFRoaW5raW5nR3JvdXAnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2VwYXJhdGVzIHJlYXNvbmluZyBhbmQgZ3JvdXBlZCBpdGVtcyBvbmx5IGluIGNvbGxhcHNlZCBtb2RlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlYXNvbmluZ1RvSXRlbXM6IHNob3VsZFN0YXJ0TmV3Q29sbGFwc2VkVGhpbmtpbmdHcm91cChUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZCwgJ3JlYXNvbmluZycsICdpdGVtcycpLFxuXHRcdFx0XHRpdGVtc1RvUmVhc29uaW5nOiBzaG91bGRTdGFydE5ld0NvbGxhcHNlZFRoaW5raW5nR3JvdXAoVGhpbmtpbmdEaXNwbGF5TW9kZS5Db2xsYXBzZWQsICdpdGVtcycsICdyZWFzb25pbmcnKSxcblx0XHRcdFx0cmVhc29uaW5nVG9SZWFzb25pbmc6IHNob3VsZFN0YXJ0TmV3Q29sbGFwc2VkVGhpbmtpbmdHcm91cChUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZCwgJ3JlYXNvbmluZycsICdyZWFzb25pbmcnKSxcblx0XHRcdFx0aXRlbXNUb0l0ZW1zOiBzaG91bGRTdGFydE5ld0NvbGxhcHNlZFRoaW5raW5nR3JvdXAoVGhpbmtpbmdEaXNwbGF5TW9kZS5Db2xsYXBzZWQsICdpdGVtcycsICdpdGVtcycpLFxuXHRcdFx0XHRmaXhlZFNjcm9sbGluZzogc2hvdWxkU3RhcnROZXdDb2xsYXBzZWRUaGlua2luZ0dyb3VwKFRoaW5raW5nRGlzcGxheU1vZGUuRml4ZWRTY3JvbGxpbmcsICdyZWFzb25pbmcnLCAnaXRlbXMnKSxcblx0XHRcdFx0Y29sbGFwc2VkUHJldmlldzogc2hvdWxkU3RhcnROZXdDb2xsYXBzZWRUaGlua2luZ0dyb3VwKFRoaW5raW5nRGlzcGxheU1vZGUuQ29sbGFwc2VkUHJldmlldywgJ3JlYXNvbmluZycsICdpdGVtcycpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZWFzb25pbmdUb0l0ZW1zOiB0cnVlLFxuXHRcdFx0XHRpdGVtc1RvUmVhc29uaW5nOiB0cnVlLFxuXHRcdFx0XHRyZWFzb25pbmdUb1JlYXNvbmluZzogZmFsc2UsXG5cdFx0XHRcdGl0ZW1zVG9JdGVtczogZmFsc2UsXG5cdFx0XHRcdGZpeGVkU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0Y29sbGFwc2VkUHJldmlldzogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Nob3VsZENyZWF0ZUdyb3VwZWRUaGlua2luZ1BhcnQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaG9ub3JzIHdpdGhUaGlua2luZyB1bmxlc3MgYSByZWFzb25pbmcgZ3JvdXAgd2FzIGp1c3Qgc2VwYXJhdGVkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHdpdGhUaGlua2luZ1dpdGhvdXRSZWFzb25pbmc6IHNob3VsZENyZWF0ZUdyb3VwZWRUaGlua2luZ1BhcnQoQ29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZS5XaXRoVGhpbmtpbmcsIGZhbHNlKSxcblx0XHRcdFx0d2l0aFRoaW5raW5nQWZ0ZXJSZWFzb25pbmc6IHNob3VsZENyZWF0ZUdyb3VwZWRUaGlua2luZ1BhcnQoQ29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZS5XaXRoVGhpbmtpbmcsIHRydWUpLFxuXHRcdFx0XHRhbHdheXNXaXRob3V0UmVhc29uaW5nOiBzaG91bGRDcmVhdGVHcm91cGVkVGhpbmtpbmdQYXJ0KENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGUuQWx3YXlzLCBmYWxzZSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHdpdGhUaGlua2luZ1dpdGhvdXRSZWFzb25pbmc6IGZhbHNlLFxuXHRcdFx0XHR3aXRoVGhpbmtpbmdBZnRlclJlYXNvbmluZzogdHJ1ZSxcblx0XHRcdFx0YWx3YXlzV2l0aG91dFJlYXNvbmluZzogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZm9ybWF0Q2hhdFJlc3BvbnNlRGV0YWlscycsICgpID0+IHtcblx0XHR0ZXN0KCdmb3JtYXRzIGNvbXBsZXRpb24gbWV0YWRhdGEgZm9yIHRoZSBmb290ZXInLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0Zm9ybWF0Q2hhdFJlc3BvbnNlRGV0YWlscygnR1BULTUuNiBTb2wgXFx1MjAyMiAxLjUgY3JlZGl0cycsICc0OjU2IFBNJyksXG5cdFx0XHRcdGZvcm1hdENoYXRSZXNwb25zZURldGFpbHMoJ0dQVC01LjYgU29sJywgdW5kZWZpbmVkKSxcblx0XHRcdFx0Zm9ybWF0Q2hhdFJlc3BvbnNlRGV0YWlscyh1bmRlZmluZWQsICc0OjU2IFBNJyksXG5cdFx0XHRcdGZvcm1hdEVsYXBzZWRUaW1lKDgzXzAwMCksXG5cdFx0XHRdLCBbXG5cdFx0XHRcdCc0OjU2IFBNIFxcdTIwMjIgR1BULTUuNiBTb2wgXFx1MjAyMiAxLjUgY3JlZGl0cycsXG5cdFx0XHRcdCdHUFQtNS42IFNvbCcsXG5cdFx0XHRcdCc0OjU2IFBNJyxcblx0XHRcdFx0JzFtIDIzcycsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgY29tcGxldGlvbiB0aW1lIHdpdGggZWxhcHNlZC10aW1lIGFsdGVybmF0ZSBvbmx5IGluIHZlcmJvc2UgbW9kZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTmFtZSA9ICdjaGF0LWZvb3Rlci1kZXRhaWxzJztcblx0XHRcdGNvbnN0IGNvbXBsZXRlZEF0ID0gRGF0ZS5ub3coKSAtIDYwICogNjAgKiAxMDAwO1xuXG5cdFx0XHRyZW5kZXJDaGF0UmVzcG9uc2VEZXRhaWxzKGNvbnRhaW5lciwgJ0NsYXVkZSBPcHVzIDQuOCcsIGNvbXBsZXRlZEF0LCAyNF8wMDAsIGZhbHNlKTtcblx0XHRcdGNvbnN0IGNvbXBhY3QgPSB7XG5cdFx0XHRcdHRleHQ6IGNvbnRhaW5lci50ZXh0Q29udGVudCxcblx0XHRcdFx0dGltaW5nOiBjb250YWluZXIucXVlcnlTZWxlY3RvcignLmNoYXQtcmVzcG9uc2UtdGltaW5nJyksXG5cdFx0XHRcdHRhYkluZGV4OiBjb250YWluZXIudGFiSW5kZXgsXG5cdFx0XHR9O1xuXG5cdFx0XHRyZW5kZXJDaGF0UmVzcG9uc2VEZXRhaWxzKGNvbnRhaW5lciwgJ0NsYXVkZSBPcHVzIDQuOCcsIGNvbXBsZXRlZEF0LCAyNF8wMDAsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNvbXBhY3QsXG5cdFx0XHRcdGNvbXBsZXRpb25EYXRlVGltZTogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ3RpbWUnKT8uZGF0ZVRpbWUsXG5cdFx0XHRcdGhhc0FsdGVybmF0ZTogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXJlc3BvbnNlLXRpbWluZycpPy5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy1hbHRlcm5hdGUnKSxcblx0XHRcdFx0ZHVyYXRpb246IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1yZXNwb25zZS1hbHRlcm5hdGUnKT8udGV4dENvbnRlbnQsXG5cdFx0XHRcdGRldGFpbHM6IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1yZXNwb25zZS1tb2RlbC1kZXRhaWxzJyk/LnRleHRDb250ZW50LFxuXHRcdFx0XHRzZXBhcmF0b3JIaWRkZW46IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1yZXNwb25zZS1kZXRhaWxzLXNlcGFyYXRvcicpPy5nZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJyksXG5cdFx0XHRcdGFyaWFJbmNsdWRlc0VsYXBzZWQ6IGNvbnRhaW5lci5hcmlhTGFiZWw/LmluY2x1ZGVzKCcyNHMnKSA/PyBmYWxzZSxcblx0XHRcdFx0dGFiSW5kZXg6IGNvbnRhaW5lci50YWJJbmRleCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29tcGFjdDoge1xuXHRcdFx0XHRcdHRleHQ6ICdDbGF1ZGUgT3B1cyA0LjgnLFxuXHRcdFx0XHRcdHRpbWluZzogbnVsbCxcblx0XHRcdFx0XHR0YWJJbmRleDogMCxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29tcGxldGlvbkRhdGVUaW1lOiBuZXcgRGF0ZShjb21wbGV0ZWRBdCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0aGFzQWx0ZXJuYXRlOiB0cnVlLFxuXHRcdFx0XHRkdXJhdGlvbjogJzI0cycsXG5cdFx0XHRcdGRldGFpbHM6ICdDbGF1ZGUgT3B1cyA0LjgnLFxuXHRcdFx0XHRzZXBhcmF0b3JIaWRkZW46ICd0cnVlJyxcblx0XHRcdFx0YXJpYUluY2x1ZGVzRWxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0dGFiSW5kZXg6IDAsXG5cdFx0XHR9KTtcblxuXHRcdFx0cmVuZGVyQ2hhdFJlc3BvbnNlRGV0YWlscyhjb250YWluZXIsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAyNF8wMDAsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHRleHQ6IGNvbnRhaW5lci50ZXh0Q29udGVudCxcblx0XHRcdFx0dGltaW5nOiBjb250YWluZXIucXVlcnlTZWxlY3RvcignLmNoYXQtcmVzcG9uc2UtdGltaW5nJyksXG5cdFx0XHRcdGhpZGRlbjogY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnaGlkZGVuJyksXG5cdFx0XHRcdHRhYkluZGV4OiBjb250YWluZXIudGFiSW5kZXgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0XHR0aW1pbmc6IG51bGwsXG5cdFx0XHRcdGhpZGRlbjogdHJ1ZSxcblx0XHRcdFx0dGFiSW5kZXg6IC0xLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IG9sZENvbXBsZXRpb24gPSBEYXRlLm5vdygpIC0gMjUgKiA2MCAqIDYwICogMTAwMDtcblx0XHRcdHJlbmRlckNoYXRSZXNwb25zZURldGFpbHMoY29udGFpbmVyLCB1bmRlZmluZWQsIG9sZENvbXBsZXRpb24sIDI0XzAwMCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y29tcGFjdDogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXJlc3BvbnNlLWNvbXBsZXRlZC1hdCcpPy50ZXh0Q29udGVudCxcblx0XHRcdFx0YWx0ZXJuYXRlRW5kc1dpdGhFbGFwc2VkOiBjb250YWluZXIucXVlcnlTZWxlY3RvcignLmNoYXQtcmVzcG9uc2UtYWx0ZXJuYXRlJyk/LnRleHRDb250ZW50Py5lbmRzV2l0aCgnIFxcdTIwMjIgMjRzJyksXG5cdFx0XHRcdGhhc0FsdGVybmF0ZTogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXJlc3BvbnNlLXRpbWluZycpPy5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy1hbHRlcm5hdGUnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29tcGFjdDogJzEgZGF5Jyxcblx0XHRcdFx0YWx0ZXJuYXRlRW5kc1dpdGhFbGFwc2VkOiB0cnVlLFxuXHRcdFx0XHRoYXNBbHRlcm5hdGU6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Zvcm1hdENoYXRSZXF1ZXN0VGltZXN0YW1wJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2Zvcm1hdHMgdmFsaWQgcGVyc2lzdGVkIHRpbWVzdGFtcHMgYW5kIHJlamVjdHMgbGVnYWN5IHBsYWNlaG9sZGVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRpbWVzdGFtcCA9IERhdGUuVVRDKDIwMjYsIDYsIDgsIDIzLCAxOCwgNDEpO1xuXHRcdFx0Y29uc3QgZm9ybWF0dGVkID0gZm9ybWF0Q2hhdFJlcXVlc3RUaW1lc3RhbXAodGltZXN0YW1wKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRoYXNUZXh0OiAhIWZvcm1hdHRlZD8udGV4dCxcblx0XHRcdFx0aGFzRnVsbFRleHQ6ICEhZm9ybWF0dGVkPy5mdWxsVGV4dCxcblx0XHRcdFx0ZGF0ZVRpbWU6IGZvcm1hdHRlZD8uZGF0ZVRpbWUsXG5cdFx0XHRcdGludmFsaWQ6IGZvcm1hdENoYXRSZXF1ZXN0VGltZXN0YW1wKC0xKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aGFzVGV4dDogdHJ1ZSxcblx0XHRcdFx0aGFzRnVsbFRleHQ6IHRydWUsXG5cdFx0XHRcdGRhdGVUaW1lOiAnMjAyNi0wNy0wOFQyMzoxODo0MS4wMDBaJyxcblx0XHRcdFx0aW52YWxpZDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIHJlbGF0aXZlIGRheXMgYWZ0ZXIgMjQgaG91cnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0Zm9ybWF0Q2hhdFJlcXVlc3RUaW1lc3RhbXAoRGF0ZS5ub3coKSAtIDI1ICogNjAgKiA2MCAqIDEwMDApPy50ZXh0LFxuXHRcdFx0XHRmb3JtYXRDaGF0UmVxdWVzdFRpbWVzdGFtcChEYXRlLm5vdygpIC0gNDkgKiA2MCAqIDYwICogMTAwMCk/LnRleHQsXG5cdFx0XHRdLCBbXG5cdFx0XHRcdCcxIGRheScsXG5cdFx0XHRcdCcyIGRheXMnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXJzIGNvbXBhY3QgZGF5cyB3aXRoIGFuIGFuaW1hdGVkIGZ1bGwgZGF0ZSBhbHRlcm5hdGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGNvbnN0IHRpbWVzdGFtcCA9IERhdGUubm93KCkgLSAyNSAqIDYwICogNjAgKiAxMDAwO1xuXG5cdFx0XHRjb25zdCByZW5kZXJlZCA9IHJlbmRlckNoYXRSZXF1ZXN0VGltZXN0YW1wKGNvbnRhaW5lciwgdGltZXN0YW1wKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNvbXBhY3Q6IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1yZXF1ZXN0LXJlbGF0aXZlJyk/LnRleHRDb250ZW50LFxuXHRcdFx0XHRmdWxsRGF0ZTogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXJlcXVlc3QtZnVsbC1kYXRlJyk/LnRleHRDb250ZW50LFxuXHRcdFx0XHRoYXNBbHRlcm5hdGU6IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1yZXF1ZXN0LXRpbWluZycpPy5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy1hbHRlcm5hdGUnKSxcblx0XHRcdFx0Zm9jdXNhYmxlOiByZW5kZXJlZD8uZWxlbWVudC50YWJJbmRleCxcblx0XHRcdFx0bWFuYWdlZEhvdmVyVGV4dDogcmVuZGVyZWQ/LmhvdmVyVGV4dCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29tcGFjdDogJzEgZGF5Jyxcblx0XHRcdFx0ZnVsbERhdGU6IGZvcm1hdENoYXRSZXF1ZXN0VGltZXN0YW1wKHRpbWVzdGFtcCk/LmZ1bGxUZXh0LFxuXHRcdFx0XHRoYXNBbHRlcm5hdGU6IHRydWUsXG5cdFx0XHRcdGZvY3VzYWJsZTogMCxcblx0XHRcdFx0bWFuYWdlZEhvdmVyVGV4dDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lubGluZSBlZGl0aW5nIGtlZXBzIGEgcG9wdWxhdGVkIHRpbWVzdGFtcCBhZnRlciB0aGUgZWRpdCBpbnB1dCB3aXRoIHZlcmJvc2UgdGltZXN0YW1wcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uVmVyYm9zZSwgZmFsc2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmVkaXRSZXF1ZXN0cycsICdob3ZlcicpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmNoZWNrcG9pbnRzLmVuYWJsZWQnLCBmYWxzZSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQuY2hlY2twb2ludHMuc2hvd0ZpbGVDaGFuZ2VzJywgZmFsc2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlR1cm5TdGF0dXNQaWxscywgZmFsc2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRBZ2VudFNlcnZpY2UpKSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFZpZXdNb2RlbCwgbW9kZWwsIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IHRleHQgPSAndGVzdCc7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsLmFkZFJlcXVlc3Qoe1xuXHRcdFx0dGV4dCxcblx0XHRcdHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSwgbmV3IFJhbmdlKDEsIDEsIDEsIHRleHQubGVuZ3RoICsgMSksIHRleHQpXVxuXHRcdH0sIHsgdmFyaWFibGVzOiBbXSB9LCBEYXRlLm5vdygpKTtcblx0XHRjb25zdCByZXF1ZXN0Vmlld01vZGVsID0gdmlld01vZGVsLmdldEl0ZW1zKCkuZmluZChpc1JlcXVlc3RWTSk7XG5cdFx0YXNzZXJ0Lm9rKHJlcXVlc3RWaWV3TW9kZWwpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSkpO1xuXHRcdGNvbnN0IHJlbmRlcmVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdExpc3RJdGVtUmVuZGVyZXIsXG5cdFx0XHR7fSBhcyBDaGF0RWRpdG9yT3B0aW9ucyxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRnZXRMaXN0TGVuZ3RoOiAoKSA9PiAxLFxuXHRcdFx0XHRvbkRpZFNjcm9sbDogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdGNvbnRhaW5lcixcblx0XHRcdFx0Y3VycmVudENoYXRNb2RlOiAoKSA9PiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHR9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dmlld01vZGVsLFxuXHRcdCkpO1xuXHRcdGNvbnN0IHRlbXBsYXRlID0gcmVuZGVyZXIucmVuZGVyVGVtcGxhdGUoY29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHJlbmRlcmVyLmRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZSkpKTtcblx0XHRyZW5kZXJlci5yZW5kZXJFbGVtZW50KHsgZWxlbWVudDogcmVxdWVzdFZpZXdNb2RlbCwgY2hpbGRyZW46IFtdLCBkZXB0aDogMCwgdmlzaWJsZUNoaWxkcmVuQ291bnQ6IDAsIHZpc2libGVDaGlsZEluZGV4OiAwLCBjb2xsYXBzaWJsZTogZmFsc2UsIGNvbGxhcHNlZDogZmFsc2UsIHZpc2libGU6IHRydWUsIGZpbHRlckRhdGE6IHVuZGVmaW5lZCB9LCAwLCB0ZW1wbGF0ZSk7XG5cblx0XHRjb25zdCB3aWRnZXQgPSB7XG5cdFx0XHR2aWV3TW9kZWwsXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHJlY2VudGx5UmVzdG9yZWRDaGVja3BvaW50OiBmYWxzZSxcblx0XHRcdGlucHV0UGFydDoge1xuXHRcdFx0XHRjdXJyZW50TW9kZU9iczogeyBnZXQ6ICgpID0+ICh7IGlkOiBDaGF0TW9kZUtpbmQuQWdlbnQgfSkgfSxcblx0XHRcdFx0Y3VycmVudE1vZGVJbmZvOiB7fSxcblx0XHRcdFx0c2V0RWRpdGluZzogKCkgPT4geyB9LFxuXHRcdFx0XHR0b2dnbGVDaGF0SW5wdXRPdmVybGF5OiAoKSA9PiB7IH0sXG5cdFx0XHRcdGRuZDogeyBzZXREaXNhYmxlZE92ZXJsYXk6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRvbkRpZENsaWNrT3ZlcmxheTogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHR9LFxuXHRcdFx0aW5wdXQ6IHtcblx0XHRcdFx0c2V0Q2hhdE1vZGU6ICgpID0+IHsgfSxcblx0XHRcdFx0c2V0UGVybWlzc2lvbkxldmVsOiAoKSA9PiB7IH0sXG5cdFx0XHRcdHNldEVkaXRpbmc6ICgpID0+IHsgfSxcblx0XHRcdFx0cmVuZGVyQXR0YWNoZWRDb250ZXh0OiAoKSA9PiB7IH0sXG5cdFx0XHRcdHNldFZhbHVlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGF0dGFjaG1lbnRNb2RlbDogeyBhZGRDb250ZXh0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0aW5wdXRFZGl0b3I6IHtcblx0XHRcdFx0XHRnZXRNb2RlbDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGZvY3VzOiAoKSA9PiB7IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0aW5saW5lSW5wdXRQYXJ0OiB7XG5cdFx0XHRcdGlucHV0RWRpdG9yOiB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VNb2RlbENvbnRlbnQ6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRsaXN0V2lkZ2V0OiB7XG5cdFx0XHRcdGFjcXVpcmVBdXRvU2Nyb2xsSG9sZDogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdHNjcm9sbFRvQ3VycmVudEl0ZW06ICgpID0+IHsgfSxcblx0XHRcdH0sXG5cdFx0XHRfZWRpdGluZ0F1dG9TY3JvbGxIb2xkOiBkaXNwb3NhYmxlcy5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpLFxuXHRcdFx0Y3JlYXRlSW5wdXQ6ICgpID0+IHsgfSxcblx0XHRcdG9uRGlkQ2hhbmdlSXRlbXM6ICgpID0+IHsgfSxcblx0XHRcdGdldENvbnRyaWI6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdF9vbkRpZENoYW5nZUFjdGl2ZUlucHV0RWRpdG9yOiB7IGZpcmU6ICgpID0+IHsgfSB9LFxuXHRcdFx0X3JlZ2lzdGVyOiA8VCBleHRlbmRzIHsgZGlzcG9zZSgpOiB2b2lkIH0+KGRpc3Bvc2FibGU6IFQpID0+IGRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlKSxcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2U6IHsgcHVibGljTG9nMjogKCkgPT4geyB9IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENoYXRXaWRnZXQ7XG5cdFx0KENoYXRXaWRnZXQucHJvdG90eXBlIGFzIHVua25vd24gYXMgeyBjbGlja2VkUmVxdWVzdCh0aGlzOiBDaGF0V2lkZ2V0LCBpdGVtOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiB2b2lkIH0pLmNsaWNrZWRSZXF1ZXN0LmNhbGwod2lkZ2V0LCB0ZW1wbGF0ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRpbmdSZXF1ZXN0SWQ6IHZpZXdNb2RlbC5lZGl0aW5nPy5pZCxcblx0XHRcdHNob3dzVmVyYm9zZURldGFpbHM6IHRlbXBsYXRlLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ3Nob3ctdmVyYm9zZS1kZXRhaWxzJyksXG5cdFx0XHR0aW1lc3RhbXBQb3B1bGF0ZWQ6ICEhdGVtcGxhdGUucmVxdWVzdFRpbWVzdGFtcENvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCd0aW1lJyksXG5cdFx0XHRwcmV2aW91c1NpYmxpbmdDbGFzczogdGVtcGxhdGUucmVxdWVzdFRpbWVzdGFtcENvbnRhaW5lci5wcmV2aW91c0VsZW1lbnRTaWJsaW5nPy5jbGFzc05hbWUsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdGluZ1JlcXVlc3RJZDogcmVxdWVzdC5pZCxcblx0XHRcdHNob3dzVmVyYm9zZURldGFpbHM6IGZhbHNlLFxuXHRcdFx0dGltZXN0YW1wUG9wdWxhdGVkOiB0cnVlLFxuXHRcdFx0cHJldmlvdXNTaWJsaW5nQ2xhc3M6ICdjaGF0LWVkaXQtaW5wdXQtY29udGFpbmVyJyxcblx0XHR9KTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0c3VpdGUoJ3R1cm4gc3RhdHVzIHBpbGxzIHNldHRpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbm9ybWFsaXplcyBib29sZWFuIGFuZCBsZWdhY3kgb2JqZWN0IHZhbHVlcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRpc0NoYXRUdXJuU3RhdHVzUGlsbHNFbmFibGVkKHVuZGVmaW5lZCksXG5cdFx0XHRcdGlzQ2hhdFR1cm5TdGF0dXNQaWxsc0VuYWJsZWQoZmFsc2UpLFxuXHRcdFx0XHRpc0NoYXRUdXJuU3RhdHVzUGlsbHNFbmFibGVkKHRydWUpLFxuXHRcdFx0XHRpc0NoYXRUdXJuU3RhdHVzUGlsbHNFbmFibGVkKHt9KSxcblx0XHRcdFx0aXNDaGF0VHVyblN0YXR1c1BpbGxzRW5hYmxlZCh7IGNoYW5nZXM6IGZhbHNlLCBwcmV2aWV3OiBmYWxzZSwgYnJvd3NlcjogZmFsc2UgfSksXG5cdFx0XHRcdGlzQ2hhdFR1cm5TdGF0dXNQaWxsc0VuYWJsZWQoeyBjaGFuZ2VzOiB0cnVlIH0pLFxuXHRcdFx0XHRpc0NoYXRUdXJuU3RhdHVzUGlsbHNFbmFibGVkKHsgcHJldmlldzogdHJ1ZSB9KSxcblx0XHRcdFx0aXNDaGF0VHVyblN0YXR1c1BpbGxzRW5hYmxlZCh7IGJyb3dzZXI6IHRydWUgfSksXG5cdFx0XHRdLCBbZmFsc2UsIGZhbHNlLCB0cnVlLCBmYWxzZSwgZmFsc2UsIHRydWUsIHRydWUsIHRydWVdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXB1dGVzIHBpbGwgYW5kIGxlZ2FjeSBmaWxlIHN1bW1hcmllcyBpbmRlcGVuZGVudGx5JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGZpbGVTdW1tYXJ5OiBzaG91bGRTaG93RmlsZUNoYW5nZXNTdW1tYXJ5Rm9yU2V0dGluZ3ModHJ1ZSwgdHJ1ZSwgdHJ1ZSksXG5cdFx0XHRcdGZpbGVTdW1tYXJ5SW5jb21wbGV0ZTogc2hvdWxkU2hvd0ZpbGVDaGFuZ2VzU3VtbWFyeUZvclNldHRpbmdzKGZhbHNlLCB0cnVlLCB0cnVlKSxcblx0XHRcdFx0ZmlsZVN1bW1hcnlOb25Mb2NhbDogc2hvdWxkU2hvd0ZpbGVDaGFuZ2VzU3VtbWFyeUZvclNldHRpbmdzKHRydWUsIGZhbHNlLCB0cnVlKSxcblx0XHRcdFx0ZmlsZVN1bW1hcnlEaXNhYmxlZDogc2hvdWxkU2hvd0ZpbGVDaGFuZ2VzU3VtbWFyeUZvclNldHRpbmdzKHRydWUsIHRydWUsIGZhbHNlKSxcblx0XHRcdFx0cGlsbHNTdW1tYXJ5OiBzaG91bGRTaG93UGlsbHNTdW1tYXJ5Rm9yU2V0dGluZ3ModHJ1ZSwgdHJ1ZSwgdHJ1ZSksXG5cdFx0XHRcdHBpbGxzU3VtbWFyeUxlZ2FjeTogc2hvdWxkU2hvd1BpbGxzU3VtbWFyeUZvclNldHRpbmdzKHRydWUsIHRydWUsIHsgcHJldmlldzogdHJ1ZSB9KSxcblx0XHRcdFx0cGlsbHNTdW1tYXJ5SW5jb21wbGV0ZTogc2hvdWxkU2hvd1BpbGxzU3VtbWFyeUZvclNldHRpbmdzKGZhbHNlLCB0cnVlLCB0cnVlKSxcblx0XHRcdFx0cGlsbHNTdW1tYXJ5Tm9uQWdlbnRIb3N0OiBzaG91bGRTaG93UGlsbHNTdW1tYXJ5Rm9yU2V0dGluZ3ModHJ1ZSwgZmFsc2UsIHRydWUpLFxuXHRcdFx0XHRwaWxsc1N1bW1hcnlEaXNhYmxlZDogc2hvdWxkU2hvd1BpbGxzU3VtbWFyeUZvclNldHRpbmdzKHRydWUsIHRydWUsIGZhbHNlKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZmlsZVN1bW1hcnk6IHRydWUsXG5cdFx0XHRcdGZpbGVTdW1tYXJ5SW5jb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRcdGZpbGVTdW1tYXJ5Tm9uTG9jYWw6IGZhbHNlLFxuXHRcdFx0XHRmaWxlU3VtbWFyeURpc2FibGVkOiBmYWxzZSxcblx0XHRcdFx0cGlsbHNTdW1tYXJ5OiB0cnVlLFxuXHRcdFx0XHRwaWxsc1N1bW1hcnlMZWdhY3k6IHRydWUsXG5cdFx0XHRcdHBpbGxzU3VtbWFyeUluY29tcGxldGU6IGZhbHNlLFxuXHRcdFx0XHRwaWxsc1N1bW1hcnlOb25BZ2VudEhvc3Q6IGZhbHNlLFxuXHRcdFx0XHRwaWxsc1N1bW1hcnlEaXNhYmxlZDogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Nob3VsZFBpblRvb2xJbnZvY2F0aW9uVG9UaGlua2luZycsICgpID0+IHtcblx0XHR0ZXN0KCdrZWVwcyB0b29sIGludm9jYXRpb25zIHJlcXVpcmluZyB1c2VyIGlucHV0IG9yIE1DUCBhcHBzIG91dHNpZGUgVGhpbmtpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZXhlY3V0aW9uQ29uZmlybWF0aW9uOiBzaG91bGRQaW5Ub29sSW52b2NhdGlvblRvVGhpbmtpbmcoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiwgZmFsc2UsIGZhbHNlKSxcblx0XHRcdFx0cmVzdWx0QXBwcm92YWw6IHNob3VsZFBpblRvb2xJbnZvY2F0aW9uVG9UaGlua2luZyhJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yUG9zdEFwcHJvdmFsLCBmYWxzZSwgZmFsc2UpLFxuXHRcdFx0XHRhdXRoZW50aWNhdGlvbjogc2hvdWxkUGluVG9vbEludm9jYXRpb25Ub1RoaW5raW5nKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JBdXRoZW50aWNhdGlvbiwgZmFsc2UsIGZhbHNlKSxcblx0XHRcdFx0ZXhlY3V0aW5nV2l0aENvbmZpcm1hdGlvbjogc2hvdWxkUGluVG9vbEludm9jYXRpb25Ub1RoaW5raW5nKElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZywgdHJ1ZSwgZmFsc2UpLFxuXHRcdFx0XHRleGVjdXRpbmdXaXRob3V0Q29uZmlybWF0aW9uOiBzaG91bGRQaW5Ub29sSW52b2NhdGlvblRvVGhpbmtpbmcoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLCBmYWxzZSwgZmFsc2UpLFxuXHRcdFx0XHRleGVjdXRpbmdXaXRoTWNwQXBwOiBzaG91bGRQaW5Ub29sSW52b2NhdGlvblRvVGhpbmtpbmcoSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLCBmYWxzZSwgdHJ1ZSksXG5cdFx0XHRcdHN0cmVhbWluZ1dpdGhNY3BBcHA6IHNob3VsZFBpblRvb2xJbnZvY2F0aW9uVG9UaGlua2luZyhJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcsIGZhbHNlLCB0cnVlKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZXhlY3V0aW9uQ29uZmlybWF0aW9uOiBmYWxzZSxcblx0XHRcdFx0cmVzdWx0QXBwcm92YWw6IGZhbHNlLFxuXHRcdFx0XHRhdXRoZW50aWNhdGlvbjogZmFsc2UsXG5cdFx0XHRcdGV4ZWN1dGluZ1dpdGhDb25maXJtYXRpb246IGZhbHNlLFxuXHRcdFx0XHRleGVjdXRpbmdXaXRob3V0Q29uZmlybWF0aW9uOiB0cnVlLFxuXHRcdFx0XHRleGVjdXRpbmdXaXRoTWNwQXBwOiBmYWxzZSxcblx0XHRcdFx0c3RyZWFtaW5nV2l0aE1jcEFwcDogZmFsc2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0c3VpdGUoJ2VuZHNXaXRoQ29tcGxldGVkUXVlc3Rpb25JbnRlcmFjdGlvbicsICgpID0+IHtcblx0XHRcdFx0dGVzdCgncmVzdW1lcyB3b3JraW5nIHByb2dyZXNzIGFmdGVyIGNvbXBsZXRlZCBhc2sgaW50ZXJhY3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNvbXBsZXRlZFRvb2w6IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkID0ge1xuXHRcdFx0XHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiAnYXNrLTEnLFxuXHRcdFx0XHRcdFx0dG9vbElkOiAnYXNrX3VzZXInLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdXYWl0aW5nIGZvciBhbnN3ZXIuLi4nLFxuXHRcdFx0XHRcdFx0b3JpZ2luTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0XHRcdGlzQ29uZmlybWVkOiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgfSxcblx0XHRcdFx0XHRcdHByZXNlbnRhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGNvbnN0IGNvbXBsZXRlZFF1ZXN0aW9uOiBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwgPSB7XG5cdFx0XHRcdFx0XHRraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcsXG5cdFx0XHRcdFx0XHRxdWVzdGlvbnM6IFtdLFxuXHRcdFx0XHRcdFx0YWxsb3dTa2lwOiB0cnVlLFxuXHRcdFx0XHRcdFx0aXNVc2VkOiB0cnVlLFxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0XHRcdGVuZHNXaXRoQ29tcGxldGVkUXVlc3Rpb25JbnRlcmFjdGlvbihbY29tcGxldGVkVG9vbF0pLFxuXHRcdFx0XHRcdFx0ZW5kc1dpdGhDb21wbGV0ZWRRdWVzdGlvbkludGVyYWN0aW9uKFtjb21wbGV0ZWRUb29sLCBjb21wbGV0ZWRRdWVzdGlvbl0pLFxuXHRcdFx0XHRcdFx0ZW5kc1dpdGhDb21wbGV0ZWRRdWVzdGlvbkludGVyYWN0aW9uKFt7IC4uLmNvbXBsZXRlZFF1ZXN0aW9uLCBpc1VzZWQ6IGZhbHNlIH1dKSxcblx0XHRcdFx0XHRcdGVuZHNXaXRoQ29tcGxldGVkUXVlc3Rpb25JbnRlcmFjdGlvbihbeyAuLi5jb21wbGV0ZWRUb29sLCB0b29sSWQ6ICdyZWFkX2ZpbGUnIH1dKSxcblx0XHRcdFx0XHRdLCBbdHJ1ZSwgdHJ1ZSwgZmFsc2UsIGZhbHNlXSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzaG91bGRIaWRlQ2hhdFVzZXJJZGVudGl0eScsICgpID0+IHtcblx0XHR0ZXN0KCdoaWRlcyBsb2NhbCBDb3BpbG90IGFuZCBBZ2VudCBIb3N0IENvcGlsb3QgcmVzcG9uc2UgaWRlbnRpdHknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0c2hvdWxkSGlkZUNoYXRVc2VySWRlbnRpdHkoJ0dpdEh1YiBDb3BpbG90JywgVVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtY2hhdC1lZGl0b3InIH0pLCB0cnVlLCBmYWxzZSwgZmFsc2UpLFxuXHRcdFx0XHRzaG91bGRIaWRlQ2hhdFVzZXJJZGVudGl0eSgnQ29waWxvdCcsIFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJyB9KSwgdHJ1ZSwgZmFsc2UsIGZhbHNlKSxcblx0XHRcdFx0c2hvdWxkSGlkZUNoYXRVc2VySWRlbnRpdHkoJ0NvcGlsb3QnLCBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaScgfSksIGZhbHNlLCBmYWxzZSwgZmFsc2UpLFxuXHRcdFx0XHRzaG91bGRIaWRlQ2hhdFVzZXJJZGVudGl0eSgnQ29waWxvdCcsIFVSSS5mcm9tKHsgc2NoZW1lOiAncmVtb3RlLXRlc3QtYXV0aG9yaXR5LWNvcGlsb3RjbGknIH0pLCB0cnVlLCBmYWxzZSwgZmFsc2UpLFxuXHRcdFx0XHRzaG91bGRIaWRlQ2hhdFVzZXJJZGVudGl0eSgnQ29waWxvdCcsIFVSSS5mcm9tKHsgc2NoZW1lOiAncmVtb3RlLXRlc3QtYXV0aG9yaXR5LWNvcGlsb3RjbGknIH0pLCBmYWxzZSwgZmFsc2UsIGZhbHNlKSxcblx0XHRcdFx0c2hvdWxkSGlkZUNoYXRVc2VySWRlbnRpdHkoJ0NsYXVkZScsIFVSSS5mcm9tKHsgc2NoZW1lOiAncmVtb3RlLXRlc3QtYXV0aG9yaXR5LWNsYXVkZScgfSksIHRydWUsIGZhbHNlLCBmYWxzZSksXG5cdFx0XHRcdHNob3VsZEhpZGVDaGF0VXNlcklkZW50aXR5KCdDbGF1ZGUnLCBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY2xhdWRlJyB9KSwgdHJ1ZSwgZmFsc2UsIGZhbHNlKSxcblx0XHRcdFx0c2hvdWxkSGlkZUNoYXRVc2VySWRlbnRpdHkoJ0NsYXVkZScsIFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnQtaG9zdC1jbGF1ZGUnIH0pLCB0cnVlLCB0cnVlLCBmYWxzZSksXG5cdFx0XHRcdHNob3VsZEhpZGVDaGF0VXNlcklkZW50aXR5KCdVc2VyJywgVVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtY2hhdC1lZGl0b3InIH0pLCBmYWxzZSwgZmFsc2UsIHRydWUpLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYnVpbGRQbGFuUmV2aWV3UHJvZ3Jlc3NDb250ZW50JywgKCkgPT4ge1xuXHRcdHRlc3QoJ2tlZXBzIHBsYW4gc3VtbWFyeSBhbmQgZnVsbCBwbGFuIGxpbmsgYWZ0ZXIgYXBwcm92YWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYnVpbGRQbGFuUmV2aWV3UHJvZ3Jlc3NDb250ZW50KHtcblx0XHRcdFx0a2luZDogJ3BsYW5SZXZpZXcnLFxuXHRcdFx0XHR0aXRsZTogJ1JldmlldyBQbGFuJyxcblx0XHRcdFx0Y29udGVudDogJyMjIFBsYW4gc3VtbWFyeScsXG5cdFx0XHRcdGFjdGlvbnM6IFt7IGlkOiAnaW50ZXJhY3RpdmUnLCBsYWJlbDogJ0ltcGxlbWVudCBQbGFuJyB9XSxcblx0XHRcdFx0Y2FuUHJvdmlkZUZlZWRiYWNrOiB0cnVlLFxuXHRcdFx0XHRwbGFuVXJpOiBVUkkuZmlsZSgnL3Nlc3Npb25zL2FiYy9wbGFuLm1kJykudG9KU09OKCksXG5cdFx0XHRcdGlzVXNlZDogdHJ1ZSxcblx0XHRcdFx0ZGF0YTogeyByZWplY3RlZDogZmFsc2UsIGFjdGlvbjogJ0ltcGxlbWVudCBQbGFuJywgYWN0aW9uSWQ6ICdpbnRlcmFjdGl2ZScgfSxcblx0XHRcdH0sICdBcHByb3ZlZCBwbGFuJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LnZhbHVlLCAnQXBwcm92ZWQmbmJzcDtwbGFuXFxuXFxuIyMgUGxhbiBzdW1tYXJ5XFxuXFxuW09wZW4gZnVsbCBwbGFuIGZpbGUgKHBsYW4ubWQpXShmaWxlOi8vL3Nlc3Npb25zL2FiYy9wbGFuLm1kP3ZzY29kZUxpbmtUeXBlPWZpbGUpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXJzIHN0cnVjdHVyZWQgZmVlZGJhY2sgYXMgbWFya2Rvd24gYmVmb3JlIHRoZSBwbGFuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGJ1aWxkUGxhblJldmlld1Byb2dyZXNzQ29udGVudCh7XG5cdFx0XHRcdGtpbmQ6ICdwbGFuUmV2aWV3Jyxcblx0XHRcdFx0dGl0bGU6ICdSZXZpZXcgUGxhbicsXG5cdFx0XHRcdGNvbnRlbnQ6ICcjIyBQbGFuIHN1bW1hcnknLFxuXHRcdFx0XHRhY3Rpb25zOiBbeyBpZDogJ2ludGVyYWN0aXZlJywgbGFiZWw6ICdJbXBsZW1lbnQgUGxhbicgfV0sXG5cdFx0XHRcdGNhblByb3ZpZGVGZWVkYmFjazogdHJ1ZSxcblx0XHRcdFx0cGxhblVyaTogVVJJLmZpbGUoJy9zZXNzaW9ucy9hYmMvcGxhbi5tZCcpLnRvSlNPTigpLFxuXHRcdFx0XHRpc1VzZWQ6IHRydWUsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0XHRcdFx0ZmVlZGJhY2s6ICdVc2UgKipuYW1lZCBoZWxwZXJzKiouXFxuXFxuSW5saW5lIGNvbW1lbnRzIG9uIGBwbGFuLm1kYDpcXG4tICoqTGluZSA2OioqIEV4dHJhY3QgdGhpcycsXG5cdFx0XHRcdFx0ZmVlZGJhY2tPdmVyYWxsOiAnVXNlICoqbmFtZWQgaGVscGVycyoqLicsXG5cdFx0XHRcdFx0ZmVlZGJhY2tJbmxpbmVNYXJrZG93bjogJ0lubGluZSBjb21tZW50cyBvbiBgcGxhbi5tZGA6XFxuLSAqKkxpbmUgNjoqKiBFeHRyYWN0IHRoaXMnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgJ1Byb3ZpZGVkIGZlZWRiYWNrJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LnZhbHVlLCBbXG5cdFx0XHRcdCdQcm92aWRlZCZuYnNwO2ZlZWRiYWNrJyxcblx0XHRcdFx0J1VzZSAqKm5hbWVkIGhlbHBlcnMqKi4nLFxuXHRcdFx0XHQnSW5saW5lIGNvbW1lbnRzIG9uIGBwbGFuLm1kYDpcXG4tICoqTGluZSA2OioqIEV4dHJhY3QgdGhpcycsXG5cdFx0XHRcdCcjIyBQbGFuIHN1bW1hcnknLFxuXHRcdFx0XHQnW09wZW4gZnVsbCBwbGFuIGZpbGUgKHBsYW4ubWQpXShmaWxlOi8vL3Nlc3Npb25zL2FiYy9wbGFuLm1kP3ZzY29kZUxpbmtUeXBlPWZpbGUpJyxcblx0XHRcdF0uam9pbignXFxuXFxuJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBjb21iaW5lZCBsZWdhY3kgZmVlZGJhY2sgYXMgbWFya2Rvd24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYnVpbGRQbGFuUmV2aWV3UHJvZ3Jlc3NDb250ZW50KHtcblx0XHRcdFx0a2luZDogJ3BsYW5SZXZpZXcnLFxuXHRcdFx0XHR0aXRsZTogJ1JldmlldyBQbGFuJyxcblx0XHRcdFx0Y29udGVudDogJycsXG5cdFx0XHRcdGFjdGlvbnM6IFt7IGlkOiAnaW50ZXJhY3RpdmUnLCBsYWJlbDogJ0ltcGxlbWVudCBQbGFuJyB9XSxcblx0XHRcdFx0Y2FuUHJvdmlkZUZlZWRiYWNrOiB0cnVlLFxuXHRcdFx0XHRpc1VzZWQ6IHRydWUsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0XHRcdFx0ZmVlZGJhY2s6ICdPdmVyYWxsICoqY29tbWVudCoqXFxuXFxuSW5saW5lIGNvbW1lbnRzOlxcbi0gKipMaW5lIDc6KiogUmVuYW1lIHRoaXMnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgJ1Byb3ZpZGVkIGZlZWRiYWNrJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LnZhbHVlLCBbXG5cdFx0XHRcdCdQcm92aWRlZCZuYnNwO2ZlZWRiYWNrJyxcblx0XHRcdFx0J092ZXJhbGwgKipjb21tZW50KionLFxuXHRcdFx0XHQnSW5saW5lIGNvbW1lbnRzOlxcbi0gKipMaW5lIDc6KiogUmVuYW1lIHRoaXMnLFxuXHRcdFx0XS5qb2luKCdcXG5cXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dvcmtpbmcgcHJvZ3Jlc3MgaWdub3JlcyBzdWJhZ2VudC1vd25lZCByZXNwb25zZSBwYXJ0cycsICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnRTdWJhZ2VudDogSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQgPSB7XG5cdFx0XHRraW5kOiAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICdzdWJhZ2VudC0xJyxcblx0XHRcdHRvb2xJZDogJ3Rhc2snLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBzdWJhZ2VudCcsXG5cdFx0XHRvcmlnaW5NZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRpc0NvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH0sXG5cdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7IGtpbmQ6ICdzdWJhZ2VudCcsIGRlc2NyaXB0aW9uOiAnSW52ZXN0aWdhdGUnIH0sXG5cdFx0fTtcblx0XHRjb25zdCBjaGlsZFRvb2w6IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkID0ge1xuXHRcdFx0Li4ucGFyZW50U3ViYWdlbnQsXG5cdFx0XHR0b29sQ2FsbElkOiAnY2hpbGQtMScsXG5cdFx0XHR0b29sSWQ6ICdzZWFyY2gnLFxuXHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6ICdzdWJhZ2VudC0xJyxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IHBhcnRzOiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdID0gW1xuXHRcdFx0eyBraW5kOiAncmVmZXJlbmNlcycsIHJlZmVyZW5jZXM6IFtdIH0sXG5cdFx0XHRwYXJlbnRTdWJhZ2VudCxcblx0XHRcdGNoaWxkVG9vbCxcblx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IHsgdmFsdWU6ICc8dnNjb2RlX2NvZGVibG9ja191cmkgc3ViQWdlbnRJbnZvY2F0aW9uSWQ9XCJzdWJhZ2VudC0xXCI+ZmlsZTovLy90ZXN0LnR4dDwvdnNjb2RlX2NvZGVibG9ja191cmk+JyB9IH0sXG5cdFx0XHR7IGtpbmQ6ICdob29rJywgaG9va1R5cGU6ICdQcmVUb29sVXNlJywgc3ViQWdlbnRJbnZvY2F0aW9uSWQ6ICdzdWJhZ2VudC0xJyB9LFxuXHRcdF07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlbGV2YW50UGFydHM6IGdldFdvcmtpbmdQcm9ncmVzc1JlbGV2YW50UGFydHMocGFydHMpLm1hcChwYXJ0ID0+IHBhcnQua2luZCksXG5cdFx0XHRlbmRzV2l0aFRhZ2dlZE1hcmtkb3duOiBlbmRzV2l0aFN1YmFnZW50Q29udGVudChwYXJ0cy5zbGljZSgwLCA0KSksXG5cdFx0XHRlbmRzV2l0aFN1YmFnZW50SG9vazogZW5kc1dpdGhTdWJhZ2VudENvbnRlbnQocGFydHMpLFxuXHRcdFx0ZW5kc1dpdGhTdWJhZ2VudENoaWxkVG9vbDogZW5kc1dpdGhTdWJhZ2VudENvbnRlbnQocGFydHMuc2xpY2UoMCwgMykpLFxuXHRcdFx0ZW5kc1dpdGhQYXJlbnRTdWJhZ2VudFRvb2w6IGVuZHNXaXRoU3ViYWdlbnRDb250ZW50KHBhcnRzLnNsaWNlKDAsIDIpKSxcblx0XHR9LCB7XG5cdFx0XHRyZWxldmFudFBhcnRzOiBbJ3JlZmVyZW5jZXMnXSxcblx0XHRcdGVuZHNXaXRoVGFnZ2VkTWFya2Rvd246IGZhbHNlLFxuXHRcdFx0ZW5kc1dpdGhTdWJhZ2VudEhvb2s6IGZhbHNlLFxuXHRcdFx0ZW5kc1dpdGhTdWJhZ2VudENoaWxkVG9vbDogZmFsc2UsXG5cdFx0XHRlbmRzV2l0aFBhcmVudFN1YmFnZW50VG9vbDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd29ya2luZyBwcm9ncmVzcyBpcyBoaWRkZW4gd2hpbGUgTUNQIHNlcnZlcnMgYXJlIHN0YXJ0aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZlcnMgPSBvYnNlcnZhYmxlVmFsdWUoJ3NlcnZlcnMnLCBbeyBpZDogJ2EnLCBuYW1lOiAnYWxwaGEnIH1dKTtcblx0XHRjb25zdCBwYXJ0OiBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZ1Nsb3cgPSB7XG5cdFx0XHRraW5kOiAnbWNwU2VydmVyc1N0YXJ0aW5nU2xvdycsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi8vdGVzdC9zZXNzaW9uMScpLFxuXHRcdFx0c2VydmVycyxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgd2hpbGVTdGFydGluZyA9IGlzV2FpdGluZ0Zvck1jcFNlcnZlcnMoW3BhcnRdKTtcblx0XHRzZXJ2ZXJzLnNldChbXSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBhZnRlclN0YXJ0aW5nID0gaXNXYWl0aW5nRm9yTWNwU2VydmVycyhbcGFydF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHdoaWxlU3RhcnRpbmcsIGFmdGVyU3RhcnRpbmcgfSwgeyB3aGlsZVN0YXJ0aW5nOiB0cnVlLCBhZnRlclN0YXJ0aW5nOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnZmluYWwgbWFya2Rvd24gcmVtYWlucyBtb3VudGVkIGFmdGVyIHRoaW5raW5nIGFuZCB0b29sIHByb2dyZXNzIGNvbXBsZXRlcyB3aXRoIHJlZHVjZWQgbW90aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5JbmNyZW1lbnRhbFJlbmRlcmluZywgZmFsc2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlRoaW5raW5nU3R5bGUsIFRoaW5raW5nRGlzcGxheU1vZGUuRml4ZWRTY3JvbGxpbmcpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmFnZW50LnRoaW5raW5nLmNvbGxhcHNlZFRvb2xzJywgQ29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZS5BbHdheXMpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmNoZWNrcG9pbnRzLmVuYWJsZWQnLCBmYWxzZSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQuY2hlY2twb2ludHMuc2hvd0ZpbGVDaGFuZ2VzJywgZmFsc2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlR1cm5TdGF0dXNQaWxscywgZmFsc2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlZlcmJvc2UsIGZhbHNlKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignd29ya2JlbmNoLnJlZHVjZU1vdGlvbicsICdvbicpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEFnZW50U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRBZ2VudFNlcnZpY2UpKSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNhblVzZVRvb2xzOiB0cnVlIH0pKTtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFZpZXdNb2RlbCwgbW9kZWwsIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IHRleHQgPSAndGVzdCc7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsLmFkZFJlcXVlc3Qoe1xuXHRcdFx0dGV4dCxcblx0XHRcdHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSwgbmV3IFJhbmdlKDEsIDEsIDEsIHRleHQubGVuZ3RoICsgMSksIHRleHQpXVxuXHRcdH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblx0XHRjb25zdCByZXNwb25zZSA9IHZpZXdNb2RlbC5nZXRJdGVtcygpLmZpbmQoaXNSZXNwb25zZVZNKTtcblx0XHRhc3NlcnQub2socmVzcG9uc2UpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSkpO1xuXHRcdGNvbnN0IHJlbmRlcmVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdExpc3RJdGVtUmVuZGVyZXIsXG5cdFx0XHR7fSBhcyBDaGF0RWRpdG9yT3B0aW9ucyxcblx0XHRcdHsgcHJvZ3Jlc3NNZXNzYWdlQXRCb3R0b21PZlJlc3BvbnNlOiB0cnVlIH0sXG5cdFx0XHR7XG5cdFx0XHRcdGdldExpc3RMZW5ndGg6ICgpID0+IDEsXG5cdFx0XHRcdG9uRGlkU2Nyb2xsOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0XHRjdXJyZW50Q2hhdE1vZGU6ICgpID0+IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR2aWV3TW9kZWwsXG5cdFx0KSk7XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSByZW5kZXJlci5yZW5kZXJUZW1wbGF0ZShjb250YWluZXIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcmVuZGVyZXIuZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlKSkpO1xuXHRcdGNvbnN0IG5vZGUgPSB7IGVsZW1lbnQ6IHJlc3BvbnNlLCBjaGlsZHJlbjogW10sIGRlcHRoOiAwLCB2aXNpYmxlQ2hpbGRyZW5Db3VudDogMCwgdmlzaWJsZUNoaWxkSW5kZXg6IDAsIGNvbGxhcHNpYmxlOiBmYWxzZSwgY29sbGFwc2VkOiBmYWxzZSwgdmlzaWJsZTogdHJ1ZSwgZmlsdGVyRGF0YTogdW5kZWZpbmVkIH07XG5cblx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHsga2luZDogJ3RoaW5raW5nJywgdmFsdWU6ICdUaGlua2luZyAuLi4nLCBpZDogJ3RoaW5raW5nLTEnIH0pO1xuXHRcdHJlbmRlcmVyLnJlbmRlckVsZW1lbnQobm9kZSwgMCwgdGVtcGxhdGUpO1xuXG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBuZXcgQ2hhdFRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyB0b29sLi4uJyxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdUb29sIGNvbXBsZXRlZCcsXG5cdFx0fSwge1xuXHRcdFx0aWQ6ICdteS10b29sJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnTXkgVG9vbCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVGVzdCB0b29sJyxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fSwgJ2NhbGwtMScsIHVuZGVmaW5lZCwge30sIHt9LCByZXF1ZXN0LmlkKTtcblx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHRvb2xJbnZvY2F0aW9uKTtcblx0XHRyZW5kZXJlci5yZW5kZXJFbGVtZW50KG5vZGUsIDAsIHRlbXBsYXRlKTtcblxuXHRcdGF3YWl0IHRvb2xJbnZvY2F0aW9uLmRpZEV4ZWN1dGVUb29sKHVuZGVmaW5lZCk7XG5cdFx0cmVuZGVyZXIucmVuZGVyRWxlbWVudChub2RlLCAwLCB0ZW1wbGF0ZSk7XG5cblx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnRmluYWwgcmVzcG9uc2UnKSB9KTtcblx0XHRyZW5kZXJlci5yZW5kZXJFbGVtZW50KG5vZGUsIDAsIHRlbXBsYXRlKTtcblx0XHRjb25zdCBtb3VudGVkV2hpbGVTdHJlYW1pbmcgPSB0ZW1wbGF0ZS52YWx1ZS50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ0ZpbmFsIHJlc3BvbnNlJykgPz8gZmFsc2U7XG5cblx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5jb21wbGV0ZSgpO1xuXHRcdHJlbmRlcmVyLnJlbmRlckVsZW1lbnQobm9kZSwgMCwgdGVtcGxhdGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bW91bnRlZFdoaWxlU3RyZWFtaW5nLFxuXHRcdFx0bW91bnRlZEFmdGVyQ29tcGxldGlvbjogdGVtcGxhdGUudmFsdWUudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdGaW5hbCByZXNwb25zZScpID8/IGZhbHNlLFxuXHRcdH0sIHtcblx0XHRcdG1vdW50ZWRXaGlsZVN0cmVhbWluZzogdHJ1ZSxcblx0XHRcdG1vdW50ZWRBZnRlckNvbXBsZXRpb246IHRydWUsXG5cdFx0fSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdC8vIEVuZC10by1lbmQgcmVncmVzc2lvbiB0ZXN0IGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzI2OTUyOiBhIGhlaWdodFxuXHQvLyBtZWFzdXJlZCBzeW5jaHJvbm91c2x5ICpkdXJpbmcqIHRoZSByZW5kZXIgcGFzcyBtdXN0IGJlIGRlZmVycmVkIChub3QgZmlyZWQgcmUtZW50cmFudGx5IGFuZFxuXHQvLyBub3Qgc3RvcmVkKSwgdGhlbiByZWxpYWJseSBkZWxpdmVyZWQgdG8gdGhlIHRyZWUgYWZ0ZXJ3YXJkcyB2aWEgYSByZS1tZWFzdXJlIFx1MjAxNCBzbyBzdHJlYW1lZFxuXHQvLyBjb250ZW50IGNhbid0IGdldCBzdHJhbmRlZCBiZWxvdyBhIHN0YWxlIHJvdyBoZWlnaHQgdW50aWwgYSB3aW5kb3cgcmVzaXplLlxuXHQvLyBza2lwcGVkIGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzI3NDAyXG5cdHRlc3Quc2tpcCgnZmlyZUl0ZW1IZWlnaHRDaGFuZ2UgZGVmZXJzIGEgbWlkLXJlbmRlciBtZWFzdXJlbWVudCBhbmQgZGVsaXZlcnMgaXQgYWZ0ZXIgdGhlIHJlbmRlciBwYXNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgTW9ja0NoYXRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0QWdlbnRTZXJ2aWNlKSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1vZGVsLCB1bmRlZmluZWQsIHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjYW5Vc2VUb29sczogdHJ1ZSB9KSk7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRWaWV3TW9kZWwsIG1vZGVsLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCB0ZXh0ID0gJ3Rlc3QnO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHtcblx0XHRcdHRleHQsXG5cdFx0XHRwYXJ0czogW25ldyBDaGF0UmVxdWVzdFRleHRQYXJ0KG5ldyBPZmZzZXRSYW5nZSgwLCB0ZXh0Lmxlbmd0aCksIG5ldyBSYW5nZSgxLCAxLCAxLCB0ZXh0Lmxlbmd0aCArIDEpLCB0ZXh0KV1cblx0XHR9LCB7IHZhcmlhYmxlczogW10gfSwgMCk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSB2aWV3TW9kZWwuZ2V0SXRlbXMoKS5maW5kKGlzUmVzcG9uc2VWTSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3BvbnNlKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb250YWluZXIucmVtb3ZlKCkpKTtcblx0XHRjb25zdCByZW5kZXJlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRMaXN0SXRlbVJlbmRlcmVyLFxuXHRcdFx0e30gYXMgQ2hhdEVkaXRvck9wdGlvbnMsXG5cdFx0XHR7IHByb2dyZXNzTWVzc2FnZUF0Qm90dG9tT2ZSZXNwb25zZTogdHJ1ZSB9LFxuXHRcdFx0e1xuXHRcdFx0XHRnZXRMaXN0TGVuZ3RoOiAoKSA9PiAxLFxuXHRcdFx0XHRvbkRpZFNjcm9sbDogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdGNvbnRhaW5lcixcblx0XHRcdFx0Y3VycmVudENoYXRNb2RlOiAoKSA9PiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHR9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dmlld01vZGVsLFxuXHRcdCkpO1xuXHRcdGNvbnN0IHRlbXBsYXRlID0gcmVuZGVyZXIucmVuZGVyVGVtcGxhdGUoY29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHJlbmRlcmVyLmRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZSkpKTtcblx0XHRjb25zdCBub2RlID0geyBlbGVtZW50OiByZXNwb25zZSwgY2hpbGRyZW46IFtdLCBkZXB0aDogMCwgdmlzaWJsZUNoaWxkcmVuQ291bnQ6IDAsIHZpc2libGVDaGlsZEluZGV4OiAwLCBjb2xsYXBzaWJsZTogZmFsc2UsIGNvbGxhcHNlZDogZmFsc2UsIHZpc2libGU6IHRydWUsIGZpbHRlckRhdGE6IHVuZGVmaW5lZCB9O1xuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdTb21lIGluaXRpYWwgY29udGVudCcpIH0pO1xuXHRcdHJlbmRlcmVyLnJlbmRlckVsZW1lbnQobm9kZSwgMCwgdGVtcGxhdGUpO1xuXHRcdC8vIENvbXBsZXRlIHRoZSByZXNwb25zZSBzbyBwcm9ncmVzc2l2ZSByZW5kZXJpbmcgc3RvcHMuIE90aGVyd2lzZSBhIHN0cmVhbWluZyByZXNwb25zZSBrZWVwc1xuXHRcdC8vIHNjaGVkdWxpbmcgYHJ1blByb2dyZXNzaXZlUmVuZGVyYCBvbiBhbmltYXRpb24gZnJhbWVzLCB3aGljaCBjcmVhdGVzIGFcblx0XHQvLyBDaGF0V29ya2luZ1Byb2dyZXNzQ29udGVudFBhcnQgdGhhdCBvdXRsaXZlcyB0aGUgdGVzdCAobGVha2VkIGRpc3Bvc2FibGUgKyBzdHJheSBjb25zb2xlXG5cdFx0Ly8gb3V0cHV0IGR1cmluZyB0ZWFyZG93bikuXG5cdFx0cmVxdWVzdC5yZXNwb25zZT8uY29tcGxldGUoKTtcblx0XHRyZW5kZXJlci5yZW5kZXJFbGVtZW50KG5vZGUsIDAsIHRlbXBsYXRlKTtcblxuXHRcdGNvbnN0IHByaXZhdGVSZW5kZXJlciA9IHJlbmRlcmVyIGFzIHVua25vd24gYXMge1xuXHRcdFx0X2VsZW1lbnRCZWluZ1JlbmRlcmVkOiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdFx0ZmlyZUl0ZW1IZWlnaHRDaGFuZ2UodGVtcGxhdGU6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSwgbWVhc3VyZWRIZWlnaHQ/OiBudW1iZXIpOiB2b2lkO1xuXHRcdH07XG5cdFx0Y29uc3QgbmV4dEZyYW1lID0gKCkgPT4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBkb20uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KGNvbnRhaW5lciksICgpID0+IHJlc29sdmUoKSkpO1xuXG5cdFx0Ly8gTGV0IHRoZSBpbml0aWFsIHJlbmRlcidzIGhlaWdodCBhY3Rpdml0eSAoUmVzaXplT2JzZXJ2ZXIgLyBzY2hlZHVsZWQgdXBkYXRlcykgc2V0dGxlLlxuXHRcdGF3YWl0IG5leHRGcmFtZSgpO1xuXHRcdGF3YWl0IG5leHRGcmFtZSgpO1xuXG5cdFx0Ly8gVGhlIHJvdydzIHJlYWwgcmVuZGVyZWQgaGVpZ2h0LiBUaGUgRE9NIGlzIE5PVCBtdXRhdGVkIGFmdGVyIHRoaXMgcG9pbnQsIHNvIHRoZSByb3cnc1xuXHRcdC8vIFJlc2l6ZU9ic2VydmVyIHN0YXlzIHF1aWV0IGFuZCBvbmx5IHRoZSBjb2RlIHVuZGVyIHRlc3QgY2FuIGRlbGl2ZXIgYSBmdXJ0aGVyIHVwZGF0ZS5cblx0XHRjb25zdCByZW5kZXJlZEhlaWdodCA9IE1hdGguY2VpbCh0ZW1wbGF0ZS5yb3dDb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkuaGVpZ2h0KTtcblx0XHRhc3NlcnQub2socmVuZGVyZWRIZWlnaHQgPiAxLCAncm93IHNob3VsZCBoYXZlIGEgcmVhbCByZW5kZXJlZCBoZWlnaHQnKTtcblxuXHRcdC8vIFNpbXVsYXRlIHN0cmVhbWluZyB0aGF0IGdyZXcgdGhlIHJvdyBwYXN0IHRoZSBoZWlnaHQgdGhlIHRyZWUgbGFzdCBhY2tub3dsZWRnZWQuXG5cdFx0cmVzcG9uc2UuY3VycmVudFJlbmRlcmVkSGVpZ2h0ID0gcmVuZGVyZWRIZWlnaHQgLSAxO1xuXHRcdGNvbnN0IGhlaWdodEV2ZW50czogbnVtYmVyW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVuZGVyZXIub25EaWRDaGFuZ2VJdGVtSGVpZ2h0KGUgPT4gaGVpZ2h0RXZlbnRzLnB1c2goZS5oZWlnaHQpKSk7XG5cblx0XHQvLyAoYSkgQSBtZWFzdXJlbWVudCBzZWVuIHN5bmNocm9ub3VzbHkgZHVyaW5nIHRoZSByZW5kZXIgcGFzcyBtdXN0IG5vdCBub3RpZnkgdGhlIHRyZWVcblx0XHQvLyByZS1lbnRyYW50bHkgYW5kIG11c3Qgbm90IGFkdmFuY2UgdGhlIHN0b3JlZCBoZWlnaHQuXG5cdFx0cHJpdmF0ZVJlbmRlcmVyLl9lbGVtZW50QmVpbmdSZW5kZXJlZCA9IHJlc3BvbnNlO1xuXHRcdHByaXZhdGVSZW5kZXJlci5maXJlSXRlbUhlaWdodENoYW5nZSh0ZW1wbGF0ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgZXZlbnRzOiBbLi4uaGVpZ2h0RXZlbnRzXSwgc3RvcmVkOiByZXNwb25zZS5jdXJyZW50UmVuZGVyZWRIZWlnaHQgfSxcblx0XHRcdHsgZXZlbnRzOiBbXSwgc3RvcmVkOiByZW5kZXJlZEhlaWdodCAtIDEgfSxcblx0XHQpO1xuXG5cdFx0Ly8gKGIpIE9uY2UgdGhlIHJlbmRlciBwYXNzIGlzIG92ZXIgdGhlIGRlZmVycmVkIHJlLW1lYXN1cmUgZGVsaXZlcnMgdGhlIHJlYWwgaGVpZ2h0LlxuXHRcdHByaXZhdGVSZW5kZXJlci5fZWxlbWVudEJlaW5nUmVuZGVyZWQgPSB1bmRlZmluZWQ7XG5cdFx0YXdhaXQgbmV4dEZyYW1lKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgZXZlbnRzOiBbLi4uaGVpZ2h0RXZlbnRzXSwgc3RvcmVkOiByZXNwb25zZS5jdXJyZW50UmVuZGVyZWRIZWlnaHQgfSxcblx0XHRcdHsgZXZlbnRzOiBbcmVuZGVyZWRIZWlnaHRdLCBzdG9yZWQ6IHJlbmRlcmVkSGVpZ2h0IH0sXG5cdFx0KTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksU0FBUztBQUNyQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlCQUFpQixtQkFBbUIsb0JBQW9CO0FBQ2pFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsYUFBYTtBQUN0QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxnQ0FBZ0Msc0JBQXNCLHNDQUFzQyx5QkFBeUIsd0NBQXdDLHNDQUFzQyw0QkFBNEIsc0NBQXNDLGlDQUF3RCx3QkFBd0IseUJBQXlCLDRCQUE0QiwyQkFBMkIscUNBQXFDLGlDQUFpQyw0QkFBNEIsbUNBQW1DLGtEQUFrRCxtQ0FBbUMseUNBQXlDLG1DQUFtQyw0Q0FBNEM7QUFDaHdCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQTZELGNBQWMscUJBQW9ELHVCQUF1QjtBQUN0SixTQUFTLDRCQUE0QiwyQkFBMkIseUJBQXlCO0FBQ3pGLFNBQVMsbUJBQW1CLG1CQUFtQixjQUFjLDJCQUEyQiwyQkFBMkI7QUFDbkgsU0FBUyxpQkFBaUI7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
