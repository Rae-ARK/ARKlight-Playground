import * as dom from "../../../../../base/browser/dom.js";
import { Event } from "../../../../../base/common/event.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { ISearchService } from "../../../../../workbench/services/search/common/search.js";
import { IHistoryService } from "../../../../../workbench/services/history/common/history.js";
import { IAICustomizationWorkspaceService } from "../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js";
import { IPromptsService } from "../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js";
import { ICustomizationHarnessService } from "../../../../../workbench/contrib/chat/common/customizationHarnessService.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from "../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js";
import { registerChatFixtureServices } from "../../../../../workbench/test/browser/componentFixtures/chat/chatFixtureUtils.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { NewChatInputWidget } from "../../browser/newChatInput.js";
import { ChatSpeechToTextState, IChatSpeechToTextService } from "../../../../../workbench/contrib/chat/browser/speechToText/chatSpeechToTextService.js";
import { INewChatVoiceTargetService, NewChatVoiceTargetService } from "../../browser/newChatVoice.js";
import { IVoiceSessionController } from "../../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js";
import { IVoiceInputModeService } from "../../../../../workbench/contrib/chat/browser/voiceInputMode/voiceInputMode.js";
import { ITtsPlaybackService } from "../../../../../workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.js";
import { IMicCaptureService } from "../../../../../workbench/contrib/chat/browser/voiceClient/micCaptureService.js";
import "../../browser/media/chatInput.css";
import "../../browser/media/newChatInSession.css";
import "../../browser/media/chatWidget.css";
import "../../../../browser/media/style.css";
async function renderNewChatInput(context, fixtureOptions = {}) {
  const { container, disposableStore } = context;
  const { value, selection } = fixtureOptions;
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: context.theme,
    additionalServices: (reg) => {
      registerChatFixtureServices(reg);
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
  container.style.width = "600px";
  container.style.height = "160px";
  container.classList.add("monaco-workbench", "agent-sessions-workbench");
  const root = dom.append(container, dom.$(".new-chat-in-session.sessions-chat-widget"));
  const widgetContainer = dom.append(root, dom.$(".new-chat-widget-container.revealed"));
  const content = dom.append(widgetContainer, dom.$(".new-chat-widget-content"));
  const session = observableValue("session", void 0);
  const widget = disposableStore.add(instantiationService.createInstance(NewChatInputWidget, {
    session,
    getContextFolderUri: () => void 0,
    sendRequest: async () => true,
    canSendRequest: observableValue("canSendRequest", true),
    loading: observableValue("loading", false)
  }));
  widget.render(content, container);
  await new Promise((r) => setTimeout(r, 50));
  const editor = widget.inputEditor;
  if (editor) {
    if (value !== void 0) {
      editor.getModel()?.setValue(value);
    }
    editor.layout();
    if (selection) {
      editor.setSelection(selection);
    }
  }
  await new Promise((r) => setTimeout(r, 50));
}
var newChatInput_fixture_default = defineThemedFixtureGroup({ path: "sessions/chat/newInput/" }, {
  Default: defineComponentFixture({ render: (context) => renderNewChatInput(context, { value: "What are you building?" }) }),
  // Partial multi-line selection so the reverse-rounded selection corners are
  // rendered. These cut-out pieces use `.monaco-editor-background`, which the
  // sessions CSS forces transparent — the bug shows here as blocky corners.
  Selection: defineComponentFixture({
    render: (context) => renderNewChatInput(context, {
      value: "asdasd asdasd asdasd\nasd\nasdasd asdasd asdasd asdasd",
      selection: { startLineNumber: 1, startColumn: 3, endLineNumber: 3, endColumn: 8 }
    })
  }),
  // A recognized slash command is highlighted (`.sessions-slash-command`) and,
  // since nothing follows it, its description renders as ghost text
  // (`.sessions-slash-placeholder`).
  SlashCommand: defineComponentFixture({ render: (context) => renderNewChatInput(context, { value: "/models" }) }),
  // A `#file:` reference is highlighted via `.sessions-variable-reference`.
  VariableReference: defineComponentFixture({ render: (context) => renderNewChatInput(context, { value: "Explain #file:src/app.ts to me" }) })
});
export {
  newChatInput_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvbmV3Q2hhdElucHV0LmZpeHR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTZWFyY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IElIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBjcmVhdGVFZGl0b3JTZXJ2aWNlcywgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9maXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDaGF0Rml4dHVyZVNlcnZpY2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9jaGF0L2NoYXRGaXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24sIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5ld0NoYXRJbnB1dFdpZGdldCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbmV3Q2hhdElucHV0LmpzJztcbmltcG9ydCB7IENoYXRTcGVlY2hUb1RleHRTdGF0ZSwgSUNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3NwZWVjaFRvVGV4dC9jaGF0U3BlZWNoVG9UZXh0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZSwgTmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbmV3Q2hhdFZvaWNlLmpzJztcbmltcG9ydCB7IElWb2ljZVNlc3Npb25Db250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSVZvaWNlSW5wdXRNb2RlU2VydmljZSwgVm9pY2VJbnB1dE1vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvdm9pY2VJbnB1dE1vZGUvdm9pY2VJbnB1dE1vZGUuanMnO1xuaW1wb3J0IHsgSVR0c1BsYXliYWNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC90dHNQbGF5YmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1pY0NhcHR1cmVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L21pY0NhcHR1cmVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbi8vIFRoZSBuZXctc2Vzc2lvbiBpbnB1dCBib3ggc3R5bGluZyBsaXZlcyBpbiB0aGVzZSBzdHlsZXNoZWV0czsgYHN0eWxlLmNzc2Bcbi8vIHByb3ZpZGVzIHRoZSBgLS12c2NvZGUtYWdlbnRzQ2hhdElucHV0LSpgIHRoZW1lIHZhcmlhYmxlcyBhbmQgdGhlXG4vLyBgLmFnZW50LXNlc3Npb25zLXdvcmtiZW5jaGAgc2NvcGUuXG5pbXBvcnQgJy4uLy4uL2Jyb3dzZXIvbWVkaWEvY2hhdElucHV0LmNzcyc7XG5pbXBvcnQgJy4uLy4uL2Jyb3dzZXIvbWVkaWEvbmV3Q2hhdEluU2Vzc2lvbi5jc3MnO1xuaW1wb3J0ICcuLi8uLi9icm93c2VyL21lZGlhL2NoYXRXaWRnZXQuY3NzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vYnJvd3Nlci9tZWRpYS9zdHlsZS5jc3MnO1xuXG5pbnRlcmZhY2UgTmV3Q2hhdElucHV0Rml4dHVyZU9wdGlvbnMge1xuXHRyZWFkb25seSB2YWx1ZT86IHN0cmluZztcblx0cmVhZG9ubHkgc2VsZWN0aW9uPzogeyBzdGFydExpbmVOdW1iZXI6IG51bWJlcjsgc3RhcnRDb2x1bW46IG51bWJlcjsgZW5kTGluZU51bWJlcjogbnVtYmVyOyBlbmRDb2x1bW46IG51bWJlciB9O1xufVxuXG4vKipcbiAqIFJlbmRlcnMgdGhlIHJlYWwge0BsaW5rIE5ld0NoYXRJbnB1dFdpZGdldH0gaW5zaWRlIHRoZSBwcm9kdWN0aW9uIERPTSBhbmNlc3RyeVxuICogKGAubmV3LWNoYXQtaW4tc2Vzc2lvbiA+IC5uZXctY2hhdC13aWRnZXQtY29udGFpbmVyLnJldmVhbGVkID4gLm5ldy1jaGF0LXdpZGdldC1jb250ZW50YClcbiAqIHNvIHRoZSBgY2hhdElucHV0LmNzc2AgLyBgbmV3Q2hhdEluU2Vzc2lvbi5jc3NgIHJ1bGVzIGFwcGx5LiBUaGUgc2Vzc2lvbnMtc3BlY2lmaWNcbiAqIHNlcnZpY2VzIGl0cyBwaWNrZXJzIGRlcGVuZCBvbiBhcmUgbW9ja2VkIGhlcmUuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHJlbmRlck5ld0NoYXRJbnB1dChjb250ZXh0OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgZml4dHVyZU9wdGlvbnM6IE5ld0NoYXRJbnB1dEZpeHR1cmVPcHRpb25zID0ge30pOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSB9ID0gY29udGV4dDtcblx0Y29uc3QgeyB2YWx1ZSwgc2VsZWN0aW9uIH0gPSBmaXh0dXJlT3B0aW9ucztcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUVkaXRvclNlcnZpY2VzKGRpc3Bvc2FibGVTdG9yZSwge1xuXHRcdGNvbG9yVGhlbWU6IGNvbnRleHQudGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiAocmVnKSA9PiB7XG5cdFx0XHRyZWdpc3RlckNoYXRGaXh0dXJlU2VydmljZXMocmVnKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJUXVpY2tJbnB1dFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVF1aWNrSW5wdXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25TaG93ID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25IaWRlID0gRXZlbnQuTm9uZTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVNlYXJjaFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlYXJjaFNlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9uVHlwZXNGb3JGb2xkZXIoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJU2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignYWN0aXZlU2Vzc2lvbicsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zUHJvdmlkZXJzU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvdmlkZXJzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0UHJvdmlkZXJzKCkgeyByZXR1cm4gW107IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0UHJvdmlkZXIoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUhpc3RvcnlTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElIaXN0b3J5U2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBnZXRGaWx0ZXJlZFByb21wdFNsYXNoQ29tbWFuZHMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJUHJvbXB0c1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVByb21wdHNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzID0gRXZlbnQuTm9uZTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0U2xhc2hDb21tYW5kcygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElOZXdDaGF0Vm9pY2VUYXJnZXRTZXJ2aWNlLCBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBOZXdDaGF0Vm9pY2VUYXJnZXRTZXJ2aWNlKFxuXHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdhY3RpdmVTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSgpLFxuXHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0U2VydmljZT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VGb2N1c2VkU2Vzc2lvbiA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdH0oKSxcblx0XHRcdCkpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVm9pY2VJbnB1dE1vZGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWb2ljZUlucHV0TW9kZVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBzZWxlY3RlZE1vZGUgPSBvYnNlcnZhYmxlVmFsdWU8Vm9pY2VJbnB1dE1vZGU+KCdzZWxlY3RlZE1vZGUnLCAndm9pY2UnKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdm9pY2VBdmFpbGFibGUgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ3ZvaWNlQXZhaWxhYmxlJywgZmFsc2UpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBkaWN0YXRpb25BdmFpbGFibGUgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ2RpY3RhdGlvbkF2YWlsYWJsZScsIGZhbHNlKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaGFuZHNGcmVlID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdoYW5kc0ZyZWUnLCB0cnVlKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2ltdWxhdGVkVm9pY2VTdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTx1bmRlZmluZWQ+KCdzaW11bGF0ZWRWb2ljZVN0YXRlJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2ltdWxhdGVkSGFuZHNGcmVlID0gb2JzZXJ2YWJsZVZhbHVlPHVuZGVmaW5lZD4oJ3NpbXVsYXRlZEhhbmRzRnJlZScsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNpbXVsYXRlZFZlcnNpb24gPSBvYnNlcnZhYmxlVmFsdWU8dW5kZWZpbmVkPignc2ltdWxhdGVkVmVyc2lvbicsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNpbXVsYXRlZEhvdmVyID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdzaW11bGF0ZWRIb3ZlcicsIGZhbHNlKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpc0Nvbm5lY3RlZCA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignaXNDb25uZWN0ZWQnLCBmYWxzZSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzQ29ubmVjdGluZyA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignaXNDb25uZWN0aW5nJywgZmFsc2UpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSB2b2ljZVN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPCdpZGxlJyB8ICdsaXN0ZW5pbmcnIHwgJ3Byb2Nlc3NpbmcnIHwgJ3NwZWFraW5nJyB8ICdlcnJvcic+KCd2b2ljZVN0YXRlJywgJ2lkbGUnKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdGFyZ2V0U2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxVUkkgfCB1bmRlZmluZWQ+KCd0YXJnZXRTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdHJhbnNjcmlwdFR1cm5zID0gb2JzZXJ2YWJsZVZhbHVlPG5ldmVyW10+KCd0cmFuc2NyaXB0VHVybnMnLCBbXSk7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElUdHNQbGF5YmFja1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVR0c1BsYXliYWNrU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFuYWx5c2VyTm9kZSA9IHVuZGVmaW5lZDtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU1pY0NhcHR1cmVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNaWNDYXB0dXJlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFuYWx5c2VyTm9kZSA9IHVuZGVmaW5lZDtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U3BlZWNoVG9UZXh0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RhdGUgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVByZXBhcmluZ01vZGVsID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VEb3dubG9hZGluZ01vZGVsID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdGUgPSBDaGF0U3BlZWNoVG9UZXh0U3RhdGUuSWRsZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNDb25maWd1cmVkID0gZmFsc2U7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzUHJlcGFyaW5nTW9kZWwgPSBmYWxzZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNEb3dubG9hZGluZ01vZGVsID0gZmFsc2U7XG5cdFx0XHR9KCkpO1xuXHRcdH0sXG5cdH0pO1xuXG5cdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICc2MDBweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnMTYwcHgnO1xuXHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbW9uYWNvLXdvcmtiZW5jaCcsICdhZ2VudC1zZXNzaW9ucy13b3JrYmVuY2gnKTtcblxuXHQvLyBgLm5ldy1jaGF0LWluLXNlc3Npb25gIHNjb3BlcyB0aGUgbGF5b3V0IG92ZXJyaWRlcyBhbmRcblx0Ly8gYC5uZXctY2hhdC13aWRnZXQtY29udGFpbmVyLnJldmVhbGVkYCBmbGlwcyBgLm5ldy1jaGF0LWlucHV0LWNvbnRhaW5lcmBcblx0Ly8gZnJvbSBgZGlzcGxheTogbm9uZWAgdG8gdmlzaWJsZS5cblx0Y29uc3Qgcm9vdCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLm5ldy1jaGF0LWluLXNlc3Npb24uc2Vzc2lvbnMtY2hhdC13aWRnZXQnKSk7XG5cdGNvbnN0IHdpZGdldENvbnRhaW5lciA9IGRvbS5hcHBlbmQocm9vdCwgZG9tLiQoJy5uZXctY2hhdC13aWRnZXQtY29udGFpbmVyLnJldmVhbGVkJykpO1xuXHRjb25zdCBjb250ZW50ID0gZG9tLmFwcGVuZCh3aWRnZXRDb250YWluZXIsIGRvbS4kKCcubmV3LWNoYXQtd2lkZ2V0LWNvbnRlbnQnKSk7XG5cblx0Y29uc3Qgc2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCB1bmRlZmluZWQpO1xuXHRjb25zdCB3aWRnZXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ld0NoYXRJbnB1dFdpZGdldCwge1xuXHRcdHNlc3Npb24sXG5cdFx0Z2V0Q29udGV4dEZvbGRlclVyaTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdHNlbmRSZXF1ZXN0OiBhc3luYyAoKSA9PiB0cnVlLFxuXHRcdGNhblNlbmRSZXF1ZXN0OiBvYnNlcnZhYmxlVmFsdWUoJ2NhblNlbmRSZXF1ZXN0JywgdHJ1ZSksXG5cdFx0bG9hZGluZzogb2JzZXJ2YWJsZVZhbHVlKCdsb2FkaW5nJywgZmFsc2UpLFxuXHR9KSk7XG5cblx0d2lkZ2V0LnJlbmRlcihjb250ZW50LCBjb250YWluZXIpO1xuXG5cdC8vIFRoZSB3aWRnZXQgbGF5cyBvdXQgaXRzIGVkaXRvciBvbiB0aGUgaW5wdXQgY29udGFpbmVyJ3MgYGFuaW1hdGlvbmVuZGA7IGluIHRoZVxuXHQvLyBmaXh0dXJlIHRoZXJlIGlzIG5vIGFuaW1hdGlvbiwgc28gc2VlZCB0aGUgdmFsdWUgYW5kIGxheSBvdXQgZXhwbGljaXRseS5cblx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDUwKSk7XG5cdGNvbnN0IGVkaXRvciA9IHdpZGdldC5pbnB1dEVkaXRvcjtcblx0aWYgKGVkaXRvcikge1xuXHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRlZGl0b3IuZ2V0TW9kZWwoKT8uc2V0VmFsdWUodmFsdWUpO1xuXHRcdH1cblx0XHRlZGl0b3IubGF5b3V0KCk7XG5cdFx0aWYgKHNlbGVjdGlvbikge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihzZWxlY3Rpb24pO1xuXHRcdH1cblx0fVxuXHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNTApKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHsgcGF0aDogJ3Nlc3Npb25zL2NoYXQvbmV3SW5wdXQvJyB9LCB7XG5cdERlZmF1bHQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyTmV3Q2hhdElucHV0KGNvbnRleHQsIHsgdmFsdWU6ICdXaGF0IGFyZSB5b3UgYnVpbGRpbmc/JyB9KSB9KSxcblx0Ly8gUGFydGlhbCBtdWx0aS1saW5lIHNlbGVjdGlvbiBzbyB0aGUgcmV2ZXJzZS1yb3VuZGVkIHNlbGVjdGlvbiBjb3JuZXJzIGFyZVxuXHQvLyByZW5kZXJlZC4gVGhlc2UgY3V0LW91dCBwaWVjZXMgdXNlIGAubW9uYWNvLWVkaXRvci1iYWNrZ3JvdW5kYCwgd2hpY2ggdGhlXG5cdC8vIHNlc3Npb25zIENTUyBmb3JjZXMgdHJhbnNwYXJlbnQgXHUyMDE0IHRoZSBidWcgc2hvd3MgaGVyZSBhcyBibG9ja3kgY29ybmVycy5cblx0U2VsZWN0aW9uOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IGNvbnRleHQgPT4gcmVuZGVyTmV3Q2hhdElucHV0KGNvbnRleHQsIHtcblx0XHRcdHZhbHVlOiAnYXNkYXNkIGFzZGFzZCBhc2Rhc2RcXG5hc2RcXG5hc2Rhc2QgYXNkYXNkIGFzZGFzZCBhc2Rhc2QnLFxuXHRcdFx0c2VsZWN0aW9uOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDMsIGVuZExpbmVOdW1iZXI6IDMsIGVuZENvbHVtbjogOCB9LFxuXHRcdH0pXG5cdH0pLFxuXHQvLyBBIHJlY29nbml6ZWQgc2xhc2ggY29tbWFuZCBpcyBoaWdobGlnaHRlZCAoYC5zZXNzaW9ucy1zbGFzaC1jb21tYW5kYCkgYW5kLFxuXHQvLyBzaW5jZSBub3RoaW5nIGZvbGxvd3MgaXQsIGl0cyBkZXNjcmlwdGlvbiByZW5kZXJzIGFzIGdob3N0IHRleHRcblx0Ly8gKGAuc2Vzc2lvbnMtc2xhc2gtcGxhY2Vob2xkZXJgKS5cblx0U2xhc2hDb21tYW5kOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiBjb250ZXh0ID0+IHJlbmRlck5ld0NoYXRJbnB1dChjb250ZXh0LCB7IHZhbHVlOiAnL21vZGVscycgfSkgfSksXG5cdC8vIEEgYCNmaWxlOmAgcmVmZXJlbmNlIGlzIGhpZ2hsaWdodGVkIHZpYSBgLnNlc3Npb25zLXZhcmlhYmxlLXJlZmVyZW5jZWAuXG5cdFZhcmlhYmxlUmVmZXJlbmNlOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiBjb250ZXh0ID0+IHJlbmRlck5ld0NoYXRJbnB1dChjb250ZXh0LCB7IHZhbHVlOiAnRXhwbGFpbiAjZmlsZTpzcmMvYXBwLnRzIHRvIG1lJyB9KSB9KSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBa0Msc0JBQXNCLHdCQUF3QixnQ0FBZ0M7QUFDaEgsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBeUIsa0NBQWtDO0FBQzNELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVCLGdDQUFnQztBQUNoRSxTQUFTLDRCQUE0QixpQ0FBaUM7QUFDdEUsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyw4QkFBOEM7QUFDdkQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBMEI7QUFNbkMsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQWFQLGVBQWUsbUJBQW1CLFNBQWtDLGlCQUE2QyxDQUFDLEdBQWtCO0FBQ25JLFFBQU0sRUFBRSxXQUFXLGdCQUFnQixJQUFJO0FBQ3ZDLFFBQU0sRUFBRSxPQUFPLFVBQVUsSUFBSTtBQUU3QixRQUFNLHVCQUF1QixxQkFBcUIsaUJBQWlCO0FBQUEsSUFDbEUsWUFBWSxRQUFRO0FBQUEsSUFDcEIsb0JBQW9CLENBQUMsUUFBUTtBQUM1QixrQ0FBNEIsR0FBRztBQUMvQixVQUFJLGVBQWUsb0JBQW9CLElBQUksY0FBYyxLQUF5QixFQUFFO0FBQUEsUUFBekM7QUFBQTtBQUMxQyxlQUFrQixTQUFTLE1BQU07QUFDakMsZUFB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
