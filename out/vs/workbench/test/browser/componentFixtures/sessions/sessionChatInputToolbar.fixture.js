import { mock } from "../../../../../base/test/common/mock.js";
import { Event } from "../../../../../base/common/event.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ChatConfiguration } from "../../../../contrib/chat/common/constants.js";
import { IBrowserViewWorkbenchService } from "../../../../contrib/browserView/common/browserView.js";
import { IAgentFeedbackService } from "../../../../../sessions/contrib/agentFeedback/browser/agentFeedbackService.js";
import { SessionChatInputToolbar } from "../../../../../sessions/contrib/chat/browser/sessionChatInputToolbar.js";
import { IGitHubService } from "../../../../../sessions/contrib/github/browser/githubService.js";
import { SessionInputBanners } from "../../../../../sessions/contrib/sessionInputBanners/browser/sessionInputBanners.js";
import { LOCAL_AGENT_HOST_PROVIDER_ID } from "../../../../../sessions/common/agentHostSessionsProvider.js";
import { ChatOriginKind, SessionStatus } from "../../../../../sessions/services/sessions/common/session.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from "../fixtureUtils.js";
import { registerChatFixtureServices } from "../chat/chatFixtureUtils.js";
import { renderChatWidget } from "../chat/chatWidget.fixture.js";
function createdFile(name, insertions, deletions) {
  return { uri: URI.file(`/repo/${name}`), modifiedUri: URI.file(`/repo/${name}`), insertions, deletions };
}
function editedFile(name, insertions, deletions) {
  const uri = URI.file(`/repo/${name}`);
  return { uri, modifiedUri: uri, originalUri: uri, insertions, deletions };
}
function createMockSession(spec) {
  const chat = new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = URI.parse("chat:1");
      this.title = constObservable("Main chat");
      // Pills above the input show while the chat has an active turn.
      this.status = constObservable(spec.status ?? SessionStatus.InProgress);
      this.lastTurnChanges = spec.turnChanges !== void 0 ? constObservable(spec.turnChanges) : void 0;
    }
  }();
  const subagents = (spec.subagents ?? []).map((title, index) => new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = URI.parse(`chat:subagent-${index}`);
      this.title = constObservable(title);
      this.status = constObservable(SessionStatus.InProgress);
      this.origin = { kind: ChatOriginKind.Tool, parentChat: chat.resource };
    }
  }());
  const session = new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = URI.parse("session:1");
      this.providerId = spec.providerId ?? LOCAL_AGENT_HOST_PROVIDER_ID;
      this.chats = constObservable([chat, ...subagents]);
    }
  }();
  const browsers = (spec.browsers ?? []).map((browser, index) => {
    const owner = browser.ownerSubagent === void 0 ? chat : subagents[browser.ownerSubagent];
    const model = new class extends mock() {
      constructor() {
        super(...arguments);
        this.owner = { mainWindowId: 1, sessionId: owner.resource.toString() };
      }
    }();
    return new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeLabel = Event.None;
      }
      get id() {
        return `browser-${index}`;
      }
      get model() {
        return model;
      }
      get title() {
        return browser.title;
      }
    }();
  });
  return { session, chat, browsers };
}
function createBrowserViewService(inputs) {
  const known = new Map(inputs.map((input) => [input.id, input]));
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeBrowserViews = Event.None;
    }
    getKnownBrowserViews() {
      return known;
    }
    async getPreferredGroup() {
      return void 0;
    }
  }();
}
function renderPills(ctx, sessionMock, options) {
  const { container, disposableStore } = ctx;
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerChatFixtureServices(reg);
      reg.defineInstance(IBrowserViewWorkbenchService, createBrowserViewService(sessionMock.browsers));
      if (options?.debugData) {
        reg.defineInstance(IGitHubService, new class extends mock() {
          constructor() {
            super(...arguments);
            this.activeSessionPullRequestObs = constObservable(void 0);
            this.activeSessionPullRequestCIObs = constObservable(void 0);
            this.activeSessionPullRequestReviewThreadsObs = constObservable(void 0);
          }
        }());
        reg.defineInstance(IAgentFeedbackService, new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidChangeFeedback = Event.None;
            this.onDidChangeFeedbackScope = Event.None;
          }
          getFeedback() {
            return [];
          }
          getFeedbackSessionResource() {
            return void 0;
          }
        }());
      }
    }
  });
  instantiationService.get(IConfigurationService).setUserConfiguration(ChatConfiguration.TurnStatusPills, options?.enabled ?? true);
  const pills = disposableStore.add(instantiationService.createInstance(SessionChatInputToolbar));
  pills.setSession(sessionMock.session, sessionMock.chat);
  pills.setDebugData(options?.debugData);
  container.appendChild(pills.element);
  if (options?.debugData) {
    const banners = disposableStore.add(instantiationService.createInstance(SessionInputBanners));
    banners.setDebugData(options.debugData);
    container.appendChild(banners.domNode);
  }
  container.style.padding = "12px";
  container.style.backgroundColor = "var(--vscode-sideBar-background)";
}
async function renderChatViewWithPills(ctx, mock2, messages) {
  await renderChatWidget(ctx, {
    messages,
    decorateInputPart: (inputPart, instantiationService) => {
      instantiationService.invokeFunction((accessor) => {
        accessor.get(IConfigurationService).setUserConfiguration(ChatConfiguration.TurnStatusPills, true);
      });
      const pills = ctx.disposableStore.add(instantiationService.createInstance(SessionChatInputToolbar));
      pills.setSession(mock2.session, mock2.chat);
      inputPart.persistentContentContainerElement.appendChild(pills.element);
    }
  });
}
const FULL_VIEW_MESSAGES = [
  {
    user: "Add a README describing the project",
    assistant: [
      { kind: "markdown", text: "I created `README.md` with a project overview, setup steps, and usage examples." }
    ]
  },
  {
    user: "Now scaffold a simple landing page",
    assistant: [
      { kind: "markdown", text: "Added `index.html` with a minimal landing page and linked it from the README." }
    ]
  }
];
var sessionChatInputToolbar_fixture_default = defineThemedFixtureGroup({ path: "sessions/" }, {
  // --- Changes pill (per turn) --------------------------------------------
  SessionChatPills_ChangesSingleFile: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ turnChanges: [editedFile("app.ts", 12, 5)] }))
  }),
  SessionChatPills_ChangesMultipleFiles: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      turnChanges: [editedFile("app.ts", 42, 7), editedFile("util.ts", 118, 64), editedFile("index.ts", 5, 0)]
    }))
  }),
  SessionChatPills_ChangesOnlyInsertions: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ turnChanges: [editedFile("feature.ts", 256, 0)] }))
  }),
  SessionChatPills_ChangesOnlyDeletions: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ turnChanges: [editedFile("legacy.ts", 0, 89)] }))
  }),
  // --- Preview pill (resource label + dropdown) ---------------------------
  SessionChatPills_PreviewMarkdown: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      status: SessionStatus.NeedsInput,
      turnChanges: [createdFile("README.md", 20, 0), editedFile("app.ts", 8, 3)]
    }))
  }),
  SessionChatPills_PreviewHtml: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      turnChanges: [createdFile("index.html", 60, 2), editedFile("styles.css", 14, 1)]
    }))
  }),
  SessionChatPills_PreviewMultiple_PrimaryCreated: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      turnChanges: [
        editedFile("app.ts", 8, 3),
        createdFile("README.md", 20, 0),
        createdFile("index.html", 30, 4),
        editedFile("CHANGELOG.md", 6, 1)
      ]
    }))
  }),
  SessionChatPills_PreviewMultiple_PrimaryEdited: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      turnChanges: [editedFile("docs.md", 10, 2), editedFile("page.html", 4, 1)]
    }))
  }),
  // --- Browser and background activity pills ------------------------------
  SessionChatPills_BackgroundBrowser: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ browsers: [{ title: "Visual Studio Code" }] }))
  }),
  SessionChatPills_BackgroundBrowserFallback: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ browsers: [{}] }))
  }),
  SessionChatPills_BackgroundSubagent: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ subagents: ["Investigate authentication failures"] }))
  }),
  SessionChatPills_BackgroundSubagentTruncated: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ subagents: ["Investigate the authentication failure in production"] }))
  }),
  SessionChatPills_BackgroundBrowsersMultiple: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ browsers: [{ title: "Visual Studio Code" }, { title: "GitHub" }] }))
  }),
  SessionChatPills_BackgroundSubagentsMultiple: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ subagents: ["Investigate authentication", "Review the proposed fix"] }))
  }),
  SessionChatPills_BackgroundMixed: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      browsers: [{ title: "Visual Studio Code" }, { title: "GitHub", ownerSubagent: 0 }],
      subagents: ["Investigate authentication"]
    }))
  }),
  SessionChatPills_BackgroundWithChanges: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      status: SessionStatus.NeedsInput,
      turnChanges: [createdFile("index.html", 30, 4), editedFile("app.ts", 8, 3)],
      browsers: [{ title: "Project Preview" }]
    }))
  }),
  SessionChatPills_DebugFakeData: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({ providerId: "debug-provider" }), {
      enabled: false,
      debugData: {
        stats: { files: 7, insertions: 128, deletions: 34 },
        markdownFiles: ["README.md", "CONTRIBUTING.md", "docs/testing.md"],
        subagents: ["Investigate authentication", "Review accessibility"],
        browsers: ["Project Preview", "Component Explorer"],
        ciFailed: 3,
        ciPending: 2,
        prFeedback: 4,
        agentFeedback: 2,
        autoIncrementChanges: false
      }
    })
  }),
  // --- Gating -------------------------------------------------------------
  SessionChatPills_NotAgentHost_Hidden: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({
      providerId: "copilot-cloud",
      turnChanges: [editedFile("app.ts", 12, 5)]
    }))
  }),
  SessionChatPills_NoActivity_Hidden: defineComponentFixture({
    render: (ctx) => renderPills(ctx, createMockSession({}))
  }),
  // --- Full chat view -----------------------------------------------------
  SessionChatView_ChangesPill: defineComponentFixture({
    render: (ctx) => renderChatViewWithPills(ctx, createMockSession({
      turnChanges: [editedFile("app.ts", 12, 5), editedFile("util.ts", 4, 2)]
    }), FULL_VIEW_MESSAGES)
  }),
  SessionChatView_BothPills: defineComponentFixture({
    render: (ctx) => renderChatViewWithPills(ctx, createMockSession({
      turnChanges: [createdFile("README.md", 20, 0), createdFile("index.html", 30, 4), editedFile("app.ts", 8, 3)]
    }), FULL_VIEW_MESSAGES)
  }),
  SessionChatView_ReadOnlyPills: defineComponentFixture({
    render: async (ctx) => {
      const mock2 = createMockSession({
        turnChanges: [editedFile("app.ts", 12, 5)],
        subagents: ["Investigate authentication"]
      });
      await renderChatWidget(ctx, {
        messages: FULL_VIEW_MESSAGES,
        inputVisible: false,
        decorateInputPart: (inputPart, instantiationService) => {
          instantiationService.invokeFunction((accessor) => {
            accessor.get(IConfigurationService).setUserConfiguration(ChatConfiguration.TurnStatusPills, true);
          });
          const pills = ctx.disposableStore.add(instantiationService.createInstance(SessionChatInputToolbar));
          pills.setSession(mock2.session, mock2.chat);
          inputPart.persistentContentContainerElement.appendChild(pills.element);
        }
      });
    }
  })
});
export {
  sessionChatInputToolbar_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvc2Vzc2lvbnMvc2Vzc2lvbkNoYXRJbnB1dFRvb2xiYXIuZml4dHVyZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlclZpZXdNb2RlbCwgSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgSUFnZW50RmVlZGJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvY29udHJpYi9hZ2VudEZlZWRiYWNrL2Jyb3dzZXIvYWdlbnRGZWVkYmFja1NlcnZpY2UuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBTZXNzaW9uQ2hhdElucHV0VG9vbGJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3Nlc3Npb25DaGF0SW5wdXRUb29sYmFyLmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgSVNlc3Npb25DaGF0UGlsbHNEZWJ1Z0RhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL2NoYXQvYnJvd3Nlci9zZXNzaW9uQ2hhdElucHV0VG9vbGJhckRlYnVnLmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgSUdpdEh1YlNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL2dpdGh1Yi9icm93c2VyL2dpdGh1YlNlcnZpY2UuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBTZXNzaW9uSW5wdXRCYW5uZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvY29udHJpYi9zZXNzaW9uSW5wdXRCYW5uZXJzL2Jyb3dzZXIvc2Vzc2lvbklucHV0QmFubmVycy5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IENoYXRPcmlnaW5LaW5kLCBJU2Vzc2lvbkZpbGVDaGFuZ2UsIElDaGF0LCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Nlc3Npb25zL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIGNyZWF0ZUVkaXRvclNlcnZpY2VzLCBkZWZpbmVDb21wb25lbnRGaXh0dXJlLCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAgfSBmcm9tICcuLi9maXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDaGF0Rml4dHVyZVNlcnZpY2VzIH0gZnJvbSAnLi4vY2hhdC9jaGF0Rml4dHVyZVV0aWxzLmpzJztcbmltcG9ydCB7IElGaXh0dXJlTWVzc2FnZSwgcmVuZGVyQ2hhdFdpZGdldCB9IGZyb20gJy4uL2NoYXQvY2hhdFdpZGdldC5maXh0dXJlLmpzJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gTW9jayBoZWxwZXJzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKiBBIGZpbGUgY3JlYXRlZCBkdXJpbmcgdGhlIHR1cm4gKG5vIG9yaWdpbmFsID0+IGNsYXNzaWZpZWQgYXMgXCJjcmVhdGVkXCIpLiAqL1xuZnVuY3Rpb24gY3JlYXRlZEZpbGUobmFtZTogc3RyaW5nLCBpbnNlcnRpb25zOiBudW1iZXIsIGRlbGV0aW9uczogbnVtYmVyKTogSVNlc3Npb25GaWxlQ2hhbmdlIHtcblx0cmV0dXJuIHsgdXJpOiBVUkkuZmlsZShgL3JlcG8vJHtuYW1lfWApLCBtb2RpZmllZFVyaTogVVJJLmZpbGUoYC9yZXBvLyR7bmFtZX1gKSwgaW5zZXJ0aW9ucywgZGVsZXRpb25zIH07XG59XG5cbi8qKiBBIGZpbGUgZWRpdGVkIGR1cmluZyB0aGUgdHVybiAoaGFzIGFuIG9yaWdpbmFsID0+IGNsYXNzaWZpZWQgYXMgXCJtb2RpZmllZFwiKS4gKi9cbmZ1bmN0aW9uIGVkaXRlZEZpbGUobmFtZTogc3RyaW5nLCBpbnNlcnRpb25zOiBudW1iZXIsIGRlbGV0aW9uczogbnVtYmVyKTogSVNlc3Npb25GaWxlQ2hhbmdlIHtcblx0Y29uc3QgdXJpID0gVVJJLmZpbGUoYC9yZXBvLyR7bmFtZX1gKTtcblx0cmV0dXJuIHsgdXJpLCBtb2RpZmllZFVyaTogdXJpLCBvcmlnaW5hbFVyaTogdXJpLCBpbnNlcnRpb25zLCBkZWxldGlvbnMgfTtcbn1cblxuaW50ZXJmYWNlIElTZXNzaW9uU3BlYyB7XG5cdHJlYWRvbmx5IHByb3ZpZGVySWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN0YXR1cz86IFNlc3Npb25TdGF0dXM7XG5cdC8qKiBGaWxlIGNoYW5nZXMgaW4gdGhlIGxhc3QgdHVybjsgb21pdCBmb3IgYSBjaGF0IHdpdGggbm8gbGFzdC10dXJuIGNoYW5nZXMuICovXG5cdHJlYWRvbmx5IHR1cm5DaGFuZ2VzPzogcmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW107XG5cdHJlYWRvbmx5IGJyb3dzZXJzPzogcmVhZG9ubHkgeyByZWFkb25seSB0aXRsZT86IHN0cmluZzsgcmVhZG9ubHkgb3duZXJTdWJhZ2VudD86IG51bWJlciB9W107XG5cdHJlYWRvbmx5IHN1YmFnZW50cz86IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG4vKiogQSBtb2NrIHNlc3Npb24gKyBpdHMgdmlld2VkIGNoYXQsIGFzIHRoZSB0b29sYmFyIGNvbnN1bWVzIHRoZW0uICovXG5pbnRlcmZhY2UgSU1vY2tTZXNzaW9uQW5kQ2hhdCB7XG5cdHJlYWRvbmx5IHNlc3Npb246IElBY3RpdmVTZXNzaW9uO1xuXHRyZWFkb25seSBjaGF0OiBJQ2hhdDtcblx0cmVhZG9ubHkgYnJvd3NlcnM6IHJlYWRvbmx5IEJyb3dzZXJFZGl0b3JJbnB1dFtdO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrU2Vzc2lvbihzcGVjOiBJU2Vzc2lvblNwZWMpOiBJTW9ja1Nlc3Npb25BbmRDaGF0IHtcblx0Y29uc3QgY2hhdCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXQ+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0OjEnKTtcblx0XHRvdmVycmlkZSByZWFkb25seSB0aXRsZSA9IGNvbnN0T2JzZXJ2YWJsZSgnTWFpbiBjaGF0Jyk7XG5cdFx0Ly8gUGlsbHMgYWJvdmUgdGhlIGlucHV0IHNob3cgd2hpbGUgdGhlIGNoYXQgaGFzIGFuIGFjdGl2ZSB0dXJuLlxuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXR1czogSU9ic2VydmFibGU8U2Vzc2lvblN0YXR1cz4gPSBjb25zdE9ic2VydmFibGUoc3BlYy5zdGF0dXMgPz8gU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBsYXN0VHVybkNoYW5nZXM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPiB8IHVuZGVmaW5lZCA9XG5cdFx0XHRzcGVjLnR1cm5DaGFuZ2VzICE9PSB1bmRlZmluZWQgPyBjb25zdE9ic2VydmFibGUoc3BlYy50dXJuQ2hhbmdlcykgOiB1bmRlZmluZWQ7XG5cdH0oKTtcblx0Y29uc3Qgc3ViYWdlbnRzID0gKHNwZWMuc3ViYWdlbnRzID8/IFtdKS5tYXAoKHRpdGxlLCBpbmRleCkgPT4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdD4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVzb3VyY2UgPSBVUkkucGFyc2UoYGNoYXQ6c3ViYWdlbnQtJHtpbmRleH1gKTtcblx0XHRvdmVycmlkZSByZWFkb25seSB0aXRsZSA9IGNvbnN0T2JzZXJ2YWJsZSh0aXRsZSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdHVzID0gY29uc3RPYnNlcnZhYmxlKFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb3JpZ2luID0geyBraW5kOiBDaGF0T3JpZ2luS2luZC5Ub29sLCBwYXJlbnRDaGF0OiBjaGF0LnJlc291cmNlIH07XG5cdH0oKSk7XG5cdGNvbnN0IHNlc3Npb24gPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBY3RpdmVTZXNzaW9uPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSByZXNvdXJjZSA9IFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcHJvdmlkZXJJZCA9IHNwZWMucHJvdmlkZXJJZCA/PyBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lEO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNoYXRzID0gY29uc3RPYnNlcnZhYmxlKFtjaGF0LCAuLi5zdWJhZ2VudHNdKTtcblx0fSgpO1xuXHRjb25zdCBicm93c2VycyA9IChzcGVjLmJyb3dzZXJzID8/IFtdKS5tYXAoKGJyb3dzZXIsIGluZGV4KSA9PiB7XG5cdFx0Y29uc3Qgb3duZXIgPSBicm93c2VyLm93bmVyU3ViYWdlbnQgPT09IHVuZGVmaW5lZCA/IGNoYXQgOiBzdWJhZ2VudHNbYnJvd3Nlci5vd25lclN1YmFnZW50XTtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUJyb3dzZXJWaWV3TW9kZWw+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb3duZXIgPSB7IG1haW5XaW5kb3dJZDogMSwgc2Vzc2lvbklkOiBvd25lci5yZXNvdXJjZS50b1N0cmluZygpIH07XG5cdFx0fSgpO1xuXHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPEJyb3dzZXJFZGl0b3JJbnB1dD4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXQgaWQoKTogc3RyaW5nIHsgcmV0dXJuIGBicm93c2VyLSR7aW5kZXh9YDsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0IG1vZGVsKCk6IElCcm93c2VyVmlld01vZGVsIHsgcmV0dXJuIG1vZGVsOyB9XG5cdFx0XHRvdmVycmlkZSBnZXQgdGl0bGUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIGJyb3dzZXIudGl0bGU7IH1cblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFiZWwgPSBFdmVudC5Ob25lO1xuXHRcdH0oKTtcblx0fSk7XG5cdHJldHVybiB7IHNlc3Npb24sIGNoYXQsIGJyb3dzZXJzIH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJyb3dzZXJWaWV3U2VydmljZShpbnB1dHM6IHJlYWRvbmx5IEJyb3dzZXJFZGl0b3JJbnB1dFtdKTogSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSB7XG5cdGNvbnN0IGtub3duID0gbmV3IE1hcChpbnB1dHMubWFwKGlucHV0ID0+IFtpbnB1dC5pZCwgaW5wdXRdKSk7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQnJvd3NlclZpZXdzID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSBnZXRLbm93bkJyb3dzZXJWaWV3cygpIHsgcmV0dXJuIGtub3duOyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0UHJlZmVycmVkR3JvdXAoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0fSgpO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBSZW5kZXIgaGVscGVyc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiByZW5kZXJQaWxscyhjdHg6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBzZXNzaW9uTW9jazogSU1vY2tTZXNzaW9uQW5kQ2hhdCwgb3B0aW9ucz86IHsgcmVhZG9ubHkgZGVidWdEYXRhPzogSVNlc3Npb25DaGF0UGlsbHNEZWJ1Z0RhdGE7IHJlYWRvbmx5IGVuYWJsZWQ/OiBib29sZWFuIH0pOiB2b2lkIHtcblx0Y29uc3QgeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSB9ID0gY3R4O1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogY3R4LnRoZW1lLFxuXHRcdGFkZGl0aW9uYWxTZXJ2aWNlczogKHJlZykgPT4ge1xuXHRcdFx0Ly8gQnJvYWQgY2hhdCBzZXJ2aWNlIGdyYXBoOiBwcm92aWRlcyBJQ29udGV4dE1lbnVTZXJ2aWNlIGFuZCB0aGVcblx0XHRcdC8vIFJlc291cmNlTGFiZWxzIGRlcGVuZGVuY2llcyAoZGVjb3JhdGlvbnMsIHRleHQgZmlsZSwgd29ya3NwYWNlLCBsYWJlbFxuXHRcdFx0Ly8gc2VydmljZXMpIHRoZSBwcmV2aWV3IHBpbGwgbmVlZHMsIG9uIHRvcCBvZiB0aGUgYmFzZSBlZGl0b3Igc2VydmljZXNcblx0XHRcdC8vICh3aGljaCByZWdpc3RlciBhIHBhcnRpYWwgSVNlc3Npb25zU2VydmljZSkuXG5cdFx0XHRyZWdpc3RlckNoYXRGaXh0dXJlU2VydmljZXMocmVnKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLCBjcmVhdGVCcm93c2VyVmlld1NlcnZpY2Uoc2Vzc2lvbk1vY2suYnJvd3NlcnMpKTtcblx0XHRcdGlmIChvcHRpb25zPy5kZWJ1Z0RhdGEpIHtcblx0XHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElHaXRIdWJTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElHaXRIdWJTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uUHVsbFJlcXVlc3RPYnMgPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uUHVsbFJlcXVlc3RDSU9icyA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25QdWxsUmVxdWVzdFJldmlld1RocmVhZHNPYnMgPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHRcdFx0fSgpKTtcblx0XHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBZ2VudEZlZWRiYWNrU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRGZWVkYmFja1NlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmVlZGJhY2sgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmVlZGJhY2tTY29wZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgZ2V0RmVlZGJhY2soKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRcdG92ZXJyaWRlIGdldEZlZWRiYWNrU2Vzc2lvblJlc291cmNlKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdH0oKSk7XG5cdFx0XHR9XG5cdFx0fSxcblx0fSk7XG5cblx0KGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpIGFzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSkuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uVHVyblN0YXR1c1BpbGxzLCBvcHRpb25zPy5lbmFibGVkID8/IHRydWUpO1xuXG5cdGNvbnN0IHBpbGxzID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ2hhdElucHV0VG9vbGJhcikpO1xuXHRwaWxscy5zZXRTZXNzaW9uKHNlc3Npb25Nb2NrLnNlc3Npb24sIHNlc3Npb25Nb2NrLmNoYXQpO1xuXHRwaWxscy5zZXREZWJ1Z0RhdGEob3B0aW9ucz8uZGVidWdEYXRhKTtcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHBpbGxzLmVsZW1lbnQpO1xuXHRpZiAob3B0aW9ucz8uZGVidWdEYXRhKSB7XG5cdFx0Y29uc3QgYmFubmVycyA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbklucHV0QmFubmVycykpO1xuXHRcdGJhbm5lcnMuc2V0RGVidWdEYXRhKG9wdGlvbnMuZGVidWdEYXRhKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoYmFubmVycy5kb21Ob2RlKTtcblx0fVxuXG5cdGNvbnRhaW5lci5zdHlsZS5wYWRkaW5nID0gJzEycHgnO1xuXHRjb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ3ZhcigtLXZzY29kZS1zaWRlQmFyLWJhY2tncm91bmQpJztcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVuZGVyQ2hhdFZpZXdXaXRoUGlsbHMoY3R4OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgbW9jazogSU1vY2tTZXNzaW9uQW5kQ2hhdCwgbWVzc2FnZXM6IElGaXh0dXJlTWVzc2FnZVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdGF3YWl0IHJlbmRlckNoYXRXaWRnZXQoY3R4LCB7XG5cdFx0bWVzc2FnZXMsXG5cdFx0ZGVjb3JhdGVJbnB1dFBhcnQ6IChpbnB1dFBhcnQsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHQvLyBUaGUgZml4dHVyZSdzIHRlc3QgY29uZmlndXJhdGlvbiBoYXMgbm8gcHJvZHVjdCBkZWZhdWx0cywgc28gb3B0IGluXG5cdFx0XHQvLyBleHBsaWNpdGx5IHRvIG1ha2Ugc3VyZSB0aGUgcGlsbHMgcmVuZGVyLlxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHQoYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkgYXMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5UdXJuU3RhdHVzUGlsbHMsIHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwaWxscyA9IGN0eC5kaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DaGF0SW5wdXRUb29sYmFyKSk7XG5cdFx0XHRwaWxscy5zZXRTZXNzaW9uKG1vY2suc2Vzc2lvbiwgbW9jay5jaGF0KTtcblx0XHRcdC8vIE1vdW50IGFib3ZlIHRoZSBpbnB1dCwgbWlycm9yaW5nIHRoZSBzZXNzaW9ucyBDaGF0Vmlldy5cblx0XHRcdGlucHV0UGFydC5wZXJzaXN0ZW50Q29udGVudENvbnRhaW5lckVsZW1lbnQuYXBwZW5kQ2hpbGQocGlsbHMuZWxlbWVudCk7XG5cdFx0fSxcblx0fSk7XG59XG5cbmNvbnN0IEZVTExfVklFV19NRVNTQUdFUzogSUZpeHR1cmVNZXNzYWdlW10gPSBbXG5cdHtcblx0XHR1c2VyOiAnQWRkIGEgUkVBRE1FIGRlc2NyaWJpbmcgdGhlIHByb2plY3QnLFxuXHRcdGFzc2lzdGFudDogW1xuXHRcdFx0eyBraW5kOiAnbWFya2Rvd24nLCB0ZXh0OiAnSSBjcmVhdGVkIGBSRUFETUUubWRgIHdpdGggYSBwcm9qZWN0IG92ZXJ2aWV3LCBzZXR1cCBzdGVwcywgYW5kIHVzYWdlIGV4YW1wbGVzLicgfSxcblx0XHRdLFxuXHR9LFxuXHR7XG5cdFx0dXNlcjogJ05vdyBzY2FmZm9sZCBhIHNpbXBsZSBsYW5kaW5nIHBhZ2UnLFxuXHRcdGFzc2lzdGFudDogW1xuXHRcdFx0eyBraW5kOiAnbWFya2Rvd24nLCB0ZXh0OiAnQWRkZWQgYGluZGV4Lmh0bWxgIHdpdGggYSBtaW5pbWFsIGxhbmRpbmcgcGFnZSBhbmQgbGlua2VkIGl0IGZyb20gdGhlIFJFQURNRS4nIH0sXG5cdFx0XSxcblx0fSxcbl07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEZpeHR1cmVzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCh7IHBhdGg6ICdzZXNzaW9ucy8nIH0sIHtcblxuXHQvLyAtLS0gQ2hhbmdlcyBwaWxsIChwZXIgdHVybikgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRTZXNzaW9uQ2hhdFBpbGxzX0NoYW5nZXNTaW5nbGVGaWxlOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlclBpbGxzKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oeyB0dXJuQ2hhbmdlczogW2VkaXRlZEZpbGUoJ2FwcC50cycsIDEyLCA1KV0gfSkpLFxuXHR9KSxcblxuXHRTZXNzaW9uQ2hhdFBpbGxzX0NoYW5nZXNNdWx0aXBsZUZpbGVzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlclBpbGxzKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0dHVybkNoYW5nZXM6IFtlZGl0ZWRGaWxlKCdhcHAudHMnLCA0MiwgNyksIGVkaXRlZEZpbGUoJ3V0aWwudHMnLCAxMTgsIDY0KSwgZWRpdGVkRmlsZSgnaW5kZXgudHMnLCA1LCAwKV0sXG5cdFx0fSkpLFxuXHR9KSxcblxuXHRTZXNzaW9uQ2hhdFBpbGxzX0NoYW5nZXNPbmx5SW5zZXJ0aW9uczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJQaWxscyhjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHsgdHVybkNoYW5nZXM6IFtlZGl0ZWRGaWxlKCdmZWF0dXJlLnRzJywgMjU2LCAwKV0gfSkpLFxuXHR9KSxcblxuXHRTZXNzaW9uQ2hhdFBpbGxzX0NoYW5nZXNPbmx5RGVsZXRpb25zOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlclBpbGxzKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oeyB0dXJuQ2hhbmdlczogW2VkaXRlZEZpbGUoJ2xlZ2FjeS50cycsIDAsIDg5KV0gfSkpLFxuXHR9KSxcblxuXHQvLyAtLS0gUHJldmlldyBwaWxsIChyZXNvdXJjZSBsYWJlbCArIGRyb3Bkb3duKSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRTZXNzaW9uQ2hhdFBpbGxzX1ByZXZpZXdNYXJrZG93bjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJQaWxscyhjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LFxuXHRcdFx0dHVybkNoYW5nZXM6IFtjcmVhdGVkRmlsZSgnUkVBRE1FLm1kJywgMjAsIDApLCBlZGl0ZWRGaWxlKCdhcHAudHMnLCA4LCAzKV0sXG5cdFx0fSkpLFxuXHR9KSxcblxuXHRTZXNzaW9uQ2hhdFBpbGxzX1ByZXZpZXdIdG1sOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlclBpbGxzKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0dHVybkNoYW5nZXM6IFtjcmVhdGVkRmlsZSgnaW5kZXguaHRtbCcsIDYwLCAyKSwgZWRpdGVkRmlsZSgnc3R5bGVzLmNzcycsIDE0LCAxKV0sXG5cdFx0fSkpLFxuXHR9KSxcblxuXHRTZXNzaW9uQ2hhdFBpbGxzX1ByZXZpZXdNdWx0aXBsZV9QcmltYXJ5Q3JlYXRlZDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJQaWxscyhjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdHR1cm5DaGFuZ2VzOiBbXG5cdFx0XHRcdGVkaXRlZEZpbGUoJ2FwcC50cycsIDgsIDMpLFxuXHRcdFx0XHRjcmVhdGVkRmlsZSgnUkVBRE1FLm1kJywgMjAsIDApLFxuXHRcdFx0XHRjcmVhdGVkRmlsZSgnaW5kZXguaHRtbCcsIDMwLCA0KSxcblx0XHRcdFx0ZWRpdGVkRmlsZSgnQ0hBTkdFTE9HLm1kJywgNiwgMSksXG5cdFx0XHRdLFxuXHRcdH0pKSxcblx0fSksXG5cblx0U2Vzc2lvbkNoYXRQaWxsc19QcmV2aWV3TXVsdGlwbGVfUHJpbWFyeUVkaXRlZDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJQaWxscyhjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdHR1cm5DaGFuZ2VzOiBbZWRpdGVkRmlsZSgnZG9jcy5tZCcsIDEwLCAyKSwgZWRpdGVkRmlsZSgncGFnZS5odG1sJywgNCwgMSldLFxuXHRcdH0pKSxcblx0fSksXG5cblx0Ly8gLS0tIEJyb3dzZXIgYW5kIGJhY2tncm91bmQgYWN0aXZpdHkgcGlsbHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0U2Vzc2lvbkNoYXRQaWxsc19CYWNrZ3JvdW5kQnJvd3NlcjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJQaWxscyhjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHsgYnJvd3NlcnM6IFt7IHRpdGxlOiAnVmlzdWFsIFN0dWRpbyBDb2RlJyB9XSB9KSksXG5cdH0pLFxuXG5cdFNlc3Npb25DaGF0UGlsbHNfQmFja2dyb3VuZEJyb3dzZXJGYWxsYmFjazogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJQaWxscyhjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHsgYnJvd3NlcnM6IFt7fV0gfSkpLFxuXHR9KSxcblxuXHRTZXNzaW9uQ2hhdFBpbGxzX0JhY2tncm91bmRTdWJhZ2VudDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJQaWxscyhjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHsgc3ViYWdlbnRzOiBbJ0ludmVzdGlnYXRlIGF1dGhlbnRpY2F0aW9uIGZhaWx1cmVzJ10gfSkpLFxuXHR9KSxcblxuXHRTZXNzaW9uQ2hhdFBpbGxzX0JhY2tncm91bmRTdWJhZ2VudFRydW5jYXRlZDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJQaWxscyhjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHsgc3ViYWdlbnRzOiBbJ0ludmVzdGlnYXRlIHRoZSBhdXRoZW50aWNhdGlvbiBmYWlsdXJlIGluIHByb2R1Y3Rpb24nXSB9KSksXG5cdH0pLFxuXG5cdFNlc3Npb25DaGF0UGlsbHNfQmFja2dyb3VuZEJyb3dzZXJzTXVsdGlwbGU6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7IGJyb3dzZXJzOiBbeyB0aXRsZTogJ1Zpc3VhbCBTdHVkaW8gQ29kZScgfSwgeyB0aXRsZTogJ0dpdEh1YicgfV0gfSkpLFxuXHR9KSxcblxuXHRTZXNzaW9uQ2hhdFBpbGxzX0JhY2tncm91bmRTdWJhZ2VudHNNdWx0aXBsZTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJQaWxscyhjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHsgc3ViYWdlbnRzOiBbJ0ludmVzdGlnYXRlIGF1dGhlbnRpY2F0aW9uJywgJ1JldmlldyB0aGUgcHJvcG9zZWQgZml4J10gfSkpLFxuXHR9KSxcblxuXHRTZXNzaW9uQ2hhdFBpbGxzX0JhY2tncm91bmRNaXhlZDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJQaWxscyhjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdGJyb3dzZXJzOiBbeyB0aXRsZTogJ1Zpc3VhbCBTdHVkaW8gQ29kZScgfSwgeyB0aXRsZTogJ0dpdEh1YicsIG93bmVyU3ViYWdlbnQ6IDAgfV0sXG5cdFx0XHRzdWJhZ2VudHM6IFsnSW52ZXN0aWdhdGUgYXV0aGVudGljYXRpb24nXSxcblx0XHR9KSksXG5cdH0pLFxuXG5cdFNlc3Npb25DaGF0UGlsbHNfQmFja2dyb3VuZFdpdGhDaGFuZ2VzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlclBpbGxzKGN0eCwgY3JlYXRlTW9ja1Nlc3Npb24oe1xuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQsXG5cdFx0XHR0dXJuQ2hhbmdlczogW2NyZWF0ZWRGaWxlKCdpbmRleC5odG1sJywgMzAsIDQpLCBlZGl0ZWRGaWxlKCdhcHAudHMnLCA4LCAzKV0sXG5cdFx0XHRicm93c2VyczogW3sgdGl0bGU6ICdQcm9qZWN0IFByZXZpZXcnIH1dLFxuXHRcdH0pKSxcblx0fSksXG5cblx0U2Vzc2lvbkNoYXRQaWxsc19EZWJ1Z0Zha2VEYXRhOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJQaWxscyhjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHsgcHJvdmlkZXJJZDogJ2RlYnVnLXByb3ZpZGVyJyB9KSwge1xuXHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRkZWJ1Z0RhdGE6IHtcblx0XHRcdFx0c3RhdHM6IHsgZmlsZXM6IDcsIGluc2VydGlvbnM6IDEyOCwgZGVsZXRpb25zOiAzNCB9LFxuXHRcdFx0XHRtYXJrZG93bkZpbGVzOiBbJ1JFQURNRS5tZCcsICdDT05UUklCVVRJTkcubWQnLCAnZG9jcy90ZXN0aW5nLm1kJ10sXG5cdFx0XHRcdHN1YmFnZW50czogWydJbnZlc3RpZ2F0ZSBhdXRoZW50aWNhdGlvbicsICdSZXZpZXcgYWNjZXNzaWJpbGl0eSddLFxuXHRcdFx0XHRicm93c2VyczogWydQcm9qZWN0IFByZXZpZXcnLCAnQ29tcG9uZW50IEV4cGxvcmVyJ10sXG5cdFx0XHRcdGNpRmFpbGVkOiAzLFxuXHRcdFx0XHRjaVBlbmRpbmc6IDIsXG5cdFx0XHRcdHByRmVlZGJhY2s6IDQsXG5cdFx0XHRcdGFnZW50RmVlZGJhY2s6IDIsXG5cdFx0XHRcdGF1dG9JbmNyZW1lbnRDaGFuZ2VzOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIC0tLSBHYXRpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdFNlc3Npb25DaGF0UGlsbHNfTm90QWdlbnRIb3N0X0hpZGRlbjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJQaWxscyhjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdHByb3ZpZGVySWQ6ICdjb3BpbG90LWNsb3VkJyxcblx0XHRcdHR1cm5DaGFuZ2VzOiBbZWRpdGVkRmlsZSgnYXBwLnRzJywgMTIsIDUpXSxcblx0XHR9KSksXG5cdH0pLFxuXG5cdFNlc3Npb25DaGF0UGlsbHNfTm9BY3Rpdml0eV9IaWRkZW46IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7fSkpLFxuXHR9KSxcblxuXHQvLyAtLS0gRnVsbCBjaGF0IHZpZXcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRTZXNzaW9uQ2hhdFZpZXdfQ2hhbmdlc1BpbGw6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyQ2hhdFZpZXdXaXRoUGlsbHMoY3R4LCBjcmVhdGVNb2NrU2Vzc2lvbih7XG5cdFx0XHR0dXJuQ2hhbmdlczogW2VkaXRlZEZpbGUoJ2FwcC50cycsIDEyLCA1KSwgZWRpdGVkRmlsZSgndXRpbC50cycsIDQsIDIpXSxcblx0XHR9KSwgRlVMTF9WSUVXX01FU1NBR0VTKSxcblx0fSksXG5cblx0U2Vzc2lvbkNoYXRWaWV3X0JvdGhQaWxsczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJDaGF0Vmlld1dpdGhQaWxscyhjdHgsIGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdHR1cm5DaGFuZ2VzOiBbY3JlYXRlZEZpbGUoJ1JFQURNRS5tZCcsIDIwLCAwKSwgY3JlYXRlZEZpbGUoJ2luZGV4Lmh0bWwnLCAzMCwgNCksIGVkaXRlZEZpbGUoJ2FwcC50cycsIDgsIDMpXSxcblx0XHR9KSwgRlVMTF9WSUVXX01FU1NBR0VTKSxcblx0fSksXG5cblx0U2Vzc2lvbkNoYXRWaWV3X1JlYWRPbmx5UGlsbHM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdHJlbmRlcjogYXN5bmMgKGN0eCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9jayA9IGNyZWF0ZU1vY2tTZXNzaW9uKHtcblx0XHRcdFx0dHVybkNoYW5nZXM6IFtlZGl0ZWRGaWxlKCdhcHAudHMnLCAxMiwgNSldLFxuXHRcdFx0XHRzdWJhZ2VudHM6IFsnSW52ZXN0aWdhdGUgYXV0aGVudGljYXRpb24nXSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgcmVuZGVyQ2hhdFdpZGdldChjdHgsIHtcblx0XHRcdFx0bWVzc2FnZXM6IEZVTExfVklFV19NRVNTQUdFUyxcblx0XHRcdFx0aW5wdXRWaXNpYmxlOiBmYWxzZSxcblx0XHRcdFx0ZGVjb3JhdGVJbnB1dFBhcnQ6IChpbnB1dFBhcnQsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdFx0KGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpIGFzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSkuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uVHVyblN0YXR1c1BpbGxzLCB0cnVlKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRjb25zdCBwaWxscyA9IGN0eC5kaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DaGF0SW5wdXRUb29sYmFyKSk7XG5cdFx0XHRcdFx0cGlsbHMuc2V0U2Vzc2lvbihtb2NrLnNlc3Npb24sIG1vY2suY2hhdCk7XG5cdFx0XHRcdFx0aW5wdXRQYXJ0LnBlcnNpc3RlbnRDb250ZW50Q29udGFpbmVyRWxlbWVudC5hcHBlbmRDaGlsZChwaWxscy5lbGVtZW50KTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0sXG5cdH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFlBQVk7QUFDckIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQW9DO0FBQzdDLFNBQVMsV0FBVztBQUNwQixTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLHlCQUF5QjtBQUVsQyxTQUE0QixvQ0FBb0M7QUFFaEUsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUywrQkFBK0I7QUFJeEMsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxvQ0FBb0M7QUFFN0MsU0FBUyxnQkFBMkMscUJBQXFCO0FBR3pFLFNBQWtDLHNCQUFzQix3QkFBd0IsZ0NBQWdDO0FBQ2hILFNBQVMsbUNBQW1DO0FBQzVDLFNBQTBCLHdCQUF3QjtBQU9sRCxTQUFTLFlBQVksTUFBYyxZQUFvQixXQUF1QztBQUM3RixTQUFPLEVBQUUsS0FBSyxJQUFJLEtBQUssU0FBUyxJQUFJLEVBQUUs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
