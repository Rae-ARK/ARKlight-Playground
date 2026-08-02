import * as dom from "../../../../../base/browser/dom.js";
import { Event } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { URI } from "../../../../../base/common/uri.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { IRemoteAgentHostService } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { asCssVariable } from "../../../../../platform/theme/common/colorUtils.js";
import { IChatTipService } from "../../../../../workbench/contrib/chat/browser/chatTipService.js";
import { ChatSpeechToTextState, IChatSpeechToTextService } from "../../../../../workbench/contrib/chat/browser/speechToText/chatSpeechToTextService.js";
import { IMicCaptureService } from "../../../../../workbench/contrib/chat/browser/voiceClient/micCaptureService.js";
import { ITtsPlaybackService } from "../../../../../workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.js";
import { IVoiceSessionController } from "../../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js";
import { IVoiceInputModeService } from "../../../../../workbench/contrib/chat/browser/voiceInputMode/voiceInputMode.js";
import { IAICustomizationWorkspaceService } from "../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js";
import { ICustomizationHarnessService } from "../../../../../workbench/contrib/chat/common/customizationHarnessService.js";
import { IPromptsService } from "../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js";
import { IHistoryService } from "../../../../../workbench/services/history/common/history.js";
import { ISearchService } from "../../../../../workbench/services/search/common/search.js";
import { registerChatFixtureServices } from "../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from "../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js";
import { activeSessionViewBackground } from "../../../../common/theme.js";
import { IAgentHostFilterService } from "../../../../services/agentHostFilter/common/agentHostFilter.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionsRecentWorkspacesService } from "../../../../services/sessions/browser/sessionsRecentWorkspacesService.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { AGENT_FEEDBACK_NEW_SESSION_RESOURCE, AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackService } from "../../../agentFeedback/browser/agentFeedbackService.js";
import { IAquariumService } from "../../../aquarium/browser/aquariumOverlay.js";
import { NewChatView } from "../../browser/chatView.js";
import { INewChatVoiceTargetService, NewChatVoiceTargetService } from "../../browser/newChatVoice.js";
import "../../../../browser/media/style.css";
import "../../../../browser/parts/media/sessionView.css";
const WIDTH = 800;
const HEIGHT = 360;
async function renderNewChatWidget(context, commentCount, showTip) {
  const { container, disposableStore } = context;
  const feedbackItems = Array.from({ length: commentCount }, (_, index) => ({
    id: `feedback-${index}`,
    text: `Comment ${index + 1}`,
    resourceUri: URI.file(`/workspace/src/file-${index + 1}.ts`),
    range: new Range(index + 1, 1, index + 1, 8),
    sessionResource: AGENT_FEEDBACK_NEW_SESSION_RESOURCE,
    kind: AgentFeedbackKind.UserReview,
    state: AgentFeedbackState.Accepted
  }));
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: context.theme,
    additionalServices: (reg) => {
      registerChatFixtureServices(reg);
      reg.defineInstance(IChatTipService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidDismissTip = Event.None;
          this.onDidNavigateTip = Event.None;
          this.onDidHideTip = Event.None;
          this.onDidDisableTips = Event.None;
        }
        getWelcomeTip() {
          return showTip ? { id: "fixture-tip", content: new MarkdownString("**Tip:** Reference files or folders with # to give the agent more context.") } : void 0;
        }
        resetSession() {
        }
        hasMultipleTips() {
          return false;
        }
      }());
      reg.defineInstance(IQuickInputService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onShow = Event.None;
          this.onHide = Event.None;
        }
      }());
      reg.defineInstance(ISearchService, new class extends mock() {
      }());
      reg.defineInstance(ISessionsManagementService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeSessionTypes = Event.None;
        }
        getSessionTypesForFolder() {
          return [];
        }
      }());
      reg.defineInstance(ISessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSession = observableValue("activeSession", void 0);
        }
      }());
      reg.defineInstance(ISessionsProvidersService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeProviders = Event.None;
        }
        getProviders() {
          return [];
        }
        getProvider() {
          return void 0;
        }
      }());
      reg.defineInstance(ISessionsRecentWorkspacesService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeRecentWorkspaces = Event.None;
        }
        getRecentWorkspaces() {
          return [];
        }
      }());
      reg.defineInstance(IRemoteAgentHostService, new class extends mock() {
      }());
      reg.defineInstance(IAgentHostFilterService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChange = Event.None;
          this.onDidChangeDiscovering = Event.None;
          this.selectedProviderId = void 0;
          this.hosts = [];
          this.isDiscovering = false;
        }
        async rediscover() {
        }
      }());
      reg.defineInstance(IAquariumService, new class extends mock() {
        mountToggle() {
          return { dispose() {
          }, setHostVisible() {
          } };
        }
      }());
      reg.defineInstance(IAgentFeedbackService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeFeedback = Event.None;
          this.onDidChangeFeedbackScope = Event.None;
        }
        getFeedback(sessionResource) {
          return sessionResource.toString() === AGENT_FEEDBACK_NEW_SESSION_RESOURCE.toString() ? feedbackItems : [];
        }
        getFeedbackSessionResource() {
          return void 0;
        }
        async revealFeedback() {
        }
      }());
      reg.defineInstance(IHistoryService, new class extends mock() {
      }());
      reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock() {
        async getFilteredPromptSlashCommands() {
          return [];
        }
      }());
      reg.defineInstance(IPromptsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeSlashCommands = Event.None;
        }
      }());
      reg.defineInstance(ICustomizationHarnessService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeSlashCommands = Event.None;
        }
        async getSlashCommands() {
          return [];
        }
      }());
      reg.defineInstance(INewChatVoiceTargetService, disposableStore.add(new NewChatVoiceTargetService(
        new class extends mock() {
          constructor() {
            super(...arguments);
            this.activeSession = observableValue("activeSession", void 0);
          }
        }(),
        new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidChangeFocusedSession = Event.None;
          }
        }()
      )));
      reg.defineInstance(IVoiceInputModeService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.selectedMode = observableValue("selectedMode", "voice");
          this.voiceAvailable = observableValue("voiceAvailable", false);
          this.dictationAvailable = observableValue("dictationAvailable", false);
          this.handsFree = observableValue("handsFree", true);
          this.simulatedVoiceState = observableValue("simulatedVoiceState", void 0);
          this.simulatedHandsFree = observableValue("simulatedHandsFree", void 0);
          this.simulatedVersion = observableValue("simulatedVersion", void 0);
          this.simulatedHover = observableValue("simulatedHover", false);
        }
      }());
      reg.defineInstance(IVoiceSessionController, new class extends mock() {
        constructor() {
          super(...arguments);
          this.isConnected = observableValue("isConnected", false);
          this.isConnecting = observableValue("isConnecting", false);
          this.voiceState = observableValue("voiceState", "idle");
          this.targetSession = observableValue("targetSession", void 0);
          this.transcriptTurns = observableValue("transcriptTurns", []);
        }
      }());
      reg.defineInstance(ITtsPlaybackService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.analyserNode = void 0;
        }
      }());
      reg.defineInstance(IMicCaptureService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.analyserNode = void 0;
        }
      }());
      reg.defineInstance(IChatSpeechToTextService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeState = Event.None;
          this.onDidChangePreparingModel = Event.None;
          this.onDidChangeDownloadingModel = Event.None;
          this.state = ChatSpeechToTextState.Idle;
          this.isConfigured = false;
          this.isPreparingModel = false;
          this.isDownloadingModel = false;
        }
      }());
    }
  });
  container.style.width = `${WIDTH}px`;
  container.style.height = `${HEIGHT}px`;
  container.classList.add("monaco-workbench", "agent-sessions-workbench");
  const sessionView = dom.append(container, dom.$(".session-view.is-active"));
  sessionView.style.width = "100%";
  sessionView.style.height = "100%";
  sessionView.style.backgroundColor = asCssVariable(activeSessionViewBackground);
  sessionView.style.setProperty("--session-view-background", asCssVariable(activeSessionViewBackground));
  const sessionViewContent = dom.append(sessionView, dom.$(".session-view-content"));
  sessionViewContent.style.width = "100%";
  sessionViewContent.style.height = "100%";
  const view = disposableStore.add(instantiationService.createInstance(NewChatView, false, {
    renderSessionTypePickerInControls: constObservable(true)
  }));
  sessionViewContent.appendChild(view.element);
  view.layout(WIDTH, HEIGHT, 0, 0);
  await new Promise((resolve) => setTimeout(resolve, 100));
}
var newChatWidget_fixture_default = defineThemedFixtureGroup({ path: "sessions/chat/newWidget/" }, {
  NewSessionComments: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderNewChatWidget(context, 3, false)
  }),
  NewSessionTip: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderNewChatWidget(context, 0, true)
  })
});
export {
  newChatWidget_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvbmV3Q2hhdFdpZGdldC5maXh0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JVdGlscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRpcFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFRpcFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFNwZWVjaFRvVGV4dFN0YXRlLCBJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvc3BlZWNoVG9UZXh0L2NoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNaWNDYXB0dXJlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC9taWNDYXB0dXJlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVHRzUGxheWJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L3R0c1BsYXliYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZVNlc3Npb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElWb2ljZUlucHV0TW9kZVNlcnZpY2UsIFZvaWNlSW5wdXRNb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3ZvaWNlSW5wdXRNb2RlL3ZvaWNlSW5wdXRNb2RlLmpzJztcbmltcG9ydCB7IElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IElTZWFyY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ2hhdEZpeHR1cmVTZXJ2aWNlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvY2hhdC9jaGF0Rml4dHVyZVV0aWxzLmpzJztcbmltcG9ydCB7IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBjcmVhdGVFZGl0b3JTZXJ2aWNlcywgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9maXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgYWN0aXZlU2Vzc2lvblZpZXdCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvYWdlbnRIb3N0RmlsdGVyL2NvbW1vbi9hZ2VudEhvc3RGaWx0ZXIuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiwgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFLCBBZ2VudEZlZWRiYWNrS2luZCwgQWdlbnRGZWVkYmFja1N0YXRlLCBJQWdlbnRGZWVkYmFjaywgSUFnZW50RmVlZGJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYWdlbnRGZWVkYmFjay9icm93c2VyL2FnZW50RmVlZGJhY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBcXVhcml1bVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9hcXVhcml1bS9icm93c2VyL2FxdWFyaXVtT3ZlcmxheS5qcyc7XG5pbXBvcnQgeyBOZXdDaGF0VmlldyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvY2hhdFZpZXcuanMnO1xuaW1wb3J0IHsgSU5ld0NoYXRWb2ljZVRhcmdldFNlcnZpY2UsIE5ld0NoYXRWb2ljZVRhcmdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL25ld0NoYXRWb2ljZS5qcyc7XG5cbmltcG9ydCAnLi4vLi4vLi4vLi4vYnJvd3Nlci9tZWRpYS9zdHlsZS5jc3MnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL21lZGlhL3Nlc3Npb25WaWV3LmNzcyc7XG5cbmNvbnN0IFdJRFRIID0gODAwO1xuY29uc3QgSEVJR0hUID0gMzYwO1xuXG4vKipcbiAqIFJlbmRlcnMgdGhlIHdob2xlIG5ldy1zZXNzaW9uIGNvbXBvc2VyIChgTmV3Q2hhdFZpZXdgIFx1MjE5MiBgTmV3Q2hhdFdpZGdldGApIGluc2lkZVxuICogYSBgLnNlc3Npb24tdmlld2Agc28gdGhlIGRyYWZ0LWNvbW1lbnRzIGJhbm5lciBzaXRzIGFib3ZlIHRoZSBpbnB1dCB0aGUgd2F5IGl0XG4gKiBkb2VzIGluIHRoZSBBZ2VudHMgd2luZG93LlxuICpcbiAqIERlbGliZXJhdGVseSBhIHNlcGFyYXRlIGZpbGUgZnJvbSBgbmV3Q2hhdElucHV0LmZpeHR1cmUudHNgOiBwdWxsaW5nXG4gKiBgTmV3Q2hhdFZpZXdgIGludG8gdGhhdCBtb2R1bGUgd291bGQgY2hhbmdlIHRoZSBvcmRlciBpdHMgc3R5bGVzaGVldHMgYXJlXG4gKiBpbmplY3RlZCBpbiwgYW5kIGAubmV3LWNoYXQtYm90dG9tLWNvbnRhaW5lcmAgaXMgc3R5bGVkIGJ5IHR3byBlcXVhbGx5XG4gKiBzcGVjaWZpYyBydWxlcyAoYGNoYXRXaWRnZXQuY3NzYCB2cyBgbmV3Q2hhdEluU2Vzc2lvbi5jc3NgKSB0aGF0IHNvdXJjZSBvcmRlclxuICogZGVjaWRlcyBiZXR3ZWVuLlxuICovXG5hc3luYyBmdW5jdGlvbiByZW5kZXJOZXdDaGF0V2lkZ2V0KGNvbnRleHQ6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBjb21tZW50Q291bnQ6IG51bWJlciwgc2hvd1RpcDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCB7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlIH0gPSBjb250ZXh0O1xuXHRjb25zdCBmZWVkYmFja0l0ZW1zOiByZWFkb25seSBJQWdlbnRGZWVkYmFja1tdID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogY29tbWVudENvdW50IH0sIChfLCBpbmRleCkgPT4gKHtcblx0XHRpZDogYGZlZWRiYWNrLSR7aW5kZXh9YCxcblx0XHR0ZXh0OiBgQ29tbWVudCAke2luZGV4ICsgMX1gLFxuXHRcdHJlc291cmNlVXJpOiBVUkkuZmlsZShgL3dvcmtzcGFjZS9zcmMvZmlsZS0ke2luZGV4ICsgMX0udHNgKSxcblx0XHRyYW5nZTogbmV3IFJhbmdlKGluZGV4ICsgMSwgMSwgaW5kZXggKyAxLCA4KSxcblx0XHRzZXNzaW9uUmVzb3VyY2U6IEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFLFxuXHRcdGtpbmQ6IEFnZW50RmVlZGJhY2tLaW5kLlVzZXJSZXZpZXcsXG5cdFx0c3RhdGU6IEFnZW50RmVlZGJhY2tTdGF0ZS5BY2NlcHRlZCxcblx0fSkpO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogY29udGV4dC50aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IHJlZyA9PiB7XG5cdFx0XHRyZWdpc3RlckNoYXRGaXh0dXJlU2VydmljZXMocmVnKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFRpcFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRUaXBTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWREaXNtaXNzVGlwID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWROYXZpZ2F0ZVRpcCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkSGlkZVRpcCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkRGlzYWJsZVRpcHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRXZWxjb21lVGlwKCkge1xuXHRcdFx0XHRcdHJldHVybiBzaG93VGlwID8geyBpZDogJ2ZpeHR1cmUtdGlwJywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCcqKlRpcDoqKiBSZWZlcmVuY2UgZmlsZXMgb3IgZm9sZGVycyB3aXRoICMgdG8gZ2l2ZSB0aGUgYWdlbnQgbW9yZSBjb250ZXh0LicpIH0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3ZlcnJpZGUgcmVzZXRTZXNzaW9uKCk6IHZvaWQgeyB9XG5cdFx0XHRcdG92ZXJyaWRlIGhhc011bHRpcGxlVGlwcygpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElRdWlja0lucHV0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUXVpY2tJbnB1dFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvblNob3cgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkhpZGUgPSBFdmVudC5Ob25lO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJU2VhcmNoU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2VhcmNoU2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25UeXBlcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb25UeXBlc0ZvckZvbGRlcigpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdhY3RpdmVTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VQcm92aWRlcnMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRQcm92aWRlcnMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRQcm92aWRlcigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJU2Vzc2lvbnNSZWNlbnRXb3Jrc3BhY2VzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNSZWNlbnRXb3Jrc3BhY2VzU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVjZW50V29ya3NwYWNlcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldFJlY2VudFdvcmtzcGFjZXMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUmVtb3RlQWdlbnRIb3N0U2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50SG9zdEZpbHRlclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50SG9zdEZpbHRlclNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGlzY292ZXJpbmcgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBzZWxlY3RlZFByb3ZpZGVySWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGhvc3RzID0gW107XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzRGlzY292ZXJpbmcgPSBmYWxzZTtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVkaXNjb3ZlcigpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQXF1YXJpdW1TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBcXVhcml1bVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBtb3VudFRvZ2dsZSgpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBkaXNwb3NlKCkgeyB9LCBzZXRIb3N0VmlzaWJsZSgpIHsgfSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBZ2VudEZlZWRiYWNrU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRGZWVkYmFja1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZlZWRiYWNrID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VGZWVkYmFja1Njb3BlID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0RmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkkpOiByZWFkb25seSBJQWdlbnRGZWVkYmFja1tdIHtcblx0XHRcdFx0XHRyZXR1cm4gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgPT09IEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFLnRvU3RyaW5nKCkgPyBmZWVkYmFja0l0ZW1zIDogW107XG5cdFx0XHRcdH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0RmVlZGJhY2tTZXNzaW9uUmVzb3VyY2UoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmV2ZWFsRmVlZGJhY2soKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUhpc3RvcnlTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElIaXN0b3J5U2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBnZXRGaWx0ZXJlZFByb21wdFNsYXNoQ29tbWFuZHMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJUHJvbXB0c1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVByb21wdHNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzID0gRXZlbnQuTm9uZTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0U2xhc2hDb21tYW5kcygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElOZXdDaGF0Vm9pY2VUYXJnZXRTZXJ2aWNlLCBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBOZXdDaGF0Vm9pY2VUYXJnZXRTZXJ2aWNlKFxuXHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdhY3RpdmVTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSgpLFxuXHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0U2VydmljZT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VGb2N1c2VkU2Vzc2lvbiA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdH0oKSxcblx0XHRcdCkpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVm9pY2VJbnB1dE1vZGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWb2ljZUlucHV0TW9kZVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBzZWxlY3RlZE1vZGUgPSBvYnNlcnZhYmxlVmFsdWU8Vm9pY2VJbnB1dE1vZGU+KCdzZWxlY3RlZE1vZGUnLCAndm9pY2UnKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdm9pY2VBdmFpbGFibGUgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ3ZvaWNlQXZhaWxhYmxlJywgZmFsc2UpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBkaWN0YXRpb25BdmFpbGFibGUgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ2RpY3RhdGlvbkF2YWlsYWJsZScsIGZhbHNlKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaGFuZHNGcmVlID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdoYW5kc0ZyZWUnLCB0cnVlKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2ltdWxhdGVkVm9pY2VTdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTx1bmRlZmluZWQ+KCdzaW11bGF0ZWRWb2ljZVN0YXRlJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2ltdWxhdGVkSGFuZHNGcmVlID0gb2JzZXJ2YWJsZVZhbHVlPHVuZGVmaW5lZD4oJ3NpbXVsYXRlZEhhbmRzRnJlZScsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNpbXVsYXRlZFZlcnNpb24gPSBvYnNlcnZhYmxlVmFsdWU8dW5kZWZpbmVkPignc2ltdWxhdGVkVmVyc2lvbicsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNpbXVsYXRlZEhvdmVyID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdzaW11bGF0ZWRIb3ZlcicsIGZhbHNlKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpc0Nvbm5lY3RlZCA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignaXNDb25uZWN0ZWQnLCBmYWxzZSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzQ29ubmVjdGluZyA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignaXNDb25uZWN0aW5nJywgZmFsc2UpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSB2b2ljZVN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPCdpZGxlJyB8ICdsaXN0ZW5pbmcnIHwgJ3Byb2Nlc3NpbmcnIHwgJ3NwZWFraW5nJyB8ICdlcnJvcic+KCd2b2ljZVN0YXRlJywgJ2lkbGUnKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdGFyZ2V0U2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxVUkkgfCB1bmRlZmluZWQ+KCd0YXJnZXRTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdHJhbnNjcmlwdFR1cm5zID0gb2JzZXJ2YWJsZVZhbHVlPG5ldmVyW10+KCd0cmFuc2NyaXB0VHVybnMnLCBbXSk7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElUdHNQbGF5YmFja1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVR0c1BsYXliYWNrU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFuYWx5c2VyTm9kZSA9IHVuZGVmaW5lZDtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU1pY0NhcHR1cmVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNaWNDYXB0dXJlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFuYWx5c2VyTm9kZSA9IHVuZGVmaW5lZDtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U3BlZWNoVG9UZXh0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RhdGUgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVByZXBhcmluZ01vZGVsID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VEb3dubG9hZGluZ01vZGVsID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdGUgPSBDaGF0U3BlZWNoVG9UZXh0U3RhdGUuSWRsZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNDb25maWd1cmVkID0gZmFsc2U7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzUHJlcGFyaW5nTW9kZWwgPSBmYWxzZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNEb3dubG9hZGluZ01vZGVsID0gZmFsc2U7XG5cdFx0XHR9KCkpO1xuXHRcdH0sXG5cdH0pO1xuXG5cdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke1dJRFRIfXB4YDtcblx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke0hFSUdIVH1weGA7XG5cdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb25hY28td29ya2JlbmNoJywgJ2FnZW50LXNlc3Npb25zLXdvcmtiZW5jaCcpO1xuXG5cdGNvbnN0IHNlc3Npb25WaWV3ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuc2Vzc2lvbi12aWV3LmlzLWFjdGl2ZScpKTtcblx0c2Vzc2lvblZpZXcuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdHNlc3Npb25WaWV3LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblx0c2Vzc2lvblZpZXcuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYXNDc3NWYXJpYWJsZShhY3RpdmVTZXNzaW9uVmlld0JhY2tncm91bmQpO1xuXHRzZXNzaW9uVmlldy5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1zZXNzaW9uLXZpZXctYmFja2dyb3VuZCcsIGFzQ3NzVmFyaWFibGUoYWN0aXZlU2Vzc2lvblZpZXdCYWNrZ3JvdW5kKSk7XG5cdGNvbnN0IHNlc3Npb25WaWV3Q29udGVudCA9IGRvbS5hcHBlbmQoc2Vzc2lvblZpZXcsIGRvbS4kKCcuc2Vzc2lvbi12aWV3LWNvbnRlbnQnKSk7XG5cdHNlc3Npb25WaWV3Q29udGVudC5zdHlsZS53aWR0aCA9ICcxMDAlJztcblx0c2Vzc2lvblZpZXdDb250ZW50LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblxuXHRjb25zdCB2aWV3ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOZXdDaGF0VmlldywgZmFsc2UsIHtcblx0XHRyZW5kZXJTZXNzaW9uVHlwZVBpY2tlckluQ29udHJvbHM6IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSxcblx0fSkpO1xuXHRzZXNzaW9uVmlld0NvbnRlbnQuYXBwZW5kQ2hpbGQodmlldy5lbGVtZW50KTtcblx0dmlldy5sYXlvdXQoV0lEVEgsIEhFSUdIVCwgMCwgMCk7XG5cdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDApKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHsgcGF0aDogJ3Nlc3Npb25zL2NoYXQvbmV3V2lkZ2V0LycgfSwge1xuXHROZXdTZXNzaW9uQ29tbWVudHM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyTmV3Q2hhdFdpZGdldChjb250ZXh0LCAzLCBmYWxzZSksXG5cdH0pLFxuXHROZXdTZXNzaW9uVGlwOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjb250ZXh0ID0+IHJlbmRlck5ld0NoYXRXaWRnZXQoY29udGV4dCwgMCwgdHJ1ZSksXG5cdH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQWlCLHVCQUF1QjtBQUNqRCxTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsYUFBYTtBQUN0QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QixnQ0FBZ0M7QUFDaEUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyw4QkFBOEM7QUFDdkQsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBa0Msc0JBQXNCLHdCQUF3QixnQ0FBZ0M7QUFDaEgsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxpQ0FBaUM7QUFD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
