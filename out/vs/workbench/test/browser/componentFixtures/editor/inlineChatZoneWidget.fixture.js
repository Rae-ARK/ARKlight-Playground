import { Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { CodeEditorWidget } from "../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IAccessibleViewService } from "../../../../../platform/accessibility/browser/accessibleView.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { ContextKeyService } from "../../../../../platform/contextkey/browser/contextKeyService.js";
import { IMenuService, MenuId, MenuRegistry } from "../../../../../platform/actions/common/actions.js";
import { MenuService } from "../../../../../platform/actions/common/menuService.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IWorkbenchLayoutService } from "../../../../services/layout/browser/layoutService.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { IDecorationsService } from "../../../../services/decorations/common/decorations.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { IWorkbenchAssignmentService } from "../../../../services/assignment/common/assignmentService.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { IVoiceModeOnboardingService } from "../../../../contrib/agentsVoice/browser/voiceModeOnboarding.js";
import { IChatInputNotificationService } from "../../../../contrib/chat/browser/widget/input/chatInputNotificationService.js";
import { IDictationOnboardingService } from "../../../../contrib/chat/browser/speechToText/dictationOnboarding.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { IChatWidgetService, IChatAccessibilityService } from "../../../../contrib/chat/browser/chat.js";
import { IChatContextPickService } from "../../../../contrib/chat/browser/attachments/chatContextPickService.js";
import { IChatAttachmentResolveService } from "../../../../contrib/chat/browser/attachments/chatAttachmentResolveService.js";
import { IChatAttachmentWidgetRegistry } from "../../../../contrib/chat/browser/attachments/chatAttachmentWidgetRegistry.js";
import { IChatContextService } from "../../../../contrib/chat/browser/contextContrib/chatContextService.js";
import { IChatImageCarouselService } from "../../../../contrib/chat/browser/chatImageCarouselService.js";
import { IChatTipService } from "../../../../contrib/chat/browser/chatTipService.js";
import { ChatAgentLocation } from "../../../../contrib/chat/common/constants.js";
import { IChatService } from "../../../../contrib/chat/common/chatService/chatService.js";
import { IChatSessionsService } from "../../../../contrib/chat/common/chatSessionsService.js";
import { IChatModeService, ChatMode } from "../../../../contrib/chat/common/chatModes.js";
import { ILanguageModelsService } from "../../../../contrib/chat/common/languageModels.js";
import { IChatAgentService } from "../../../../contrib/chat/common/participants/chatAgents.js";
import { IChatSlashCommandService } from "../../../../contrib/chat/common/participants/chatSlashCommands.js";
import { ILanguageModelToolsService } from "../../../../contrib/chat/common/tools/languageModelToolsService.js";
import { IChatArtifactsService } from "../../../../contrib/chat/common/tools/chatArtifactsService.js";
import { IChatTodoListService } from "../../../../contrib/chat/common/tools/chatTodoListService.js";
import { IChatDebugService } from "../../../../contrib/chat/common/chatDebugService.js";
import { IPromptsService } from "../../../../contrib/chat/common/promptSyntax/service/promptsService.js";
import { IChatWidgetHistoryService } from "../../../../contrib/chat/common/widget/chatWidgetHistoryService.js";
import { IChatLayoutService } from "../../../../contrib/chat/common/widget/chatLayoutService.js";
import { IAgentSessionsService } from "../../../../contrib/chat/browser/agentSessions/agentSessionsService.js";
import { IAgentHostService } from "../../../../../platform/agentHost/common/agentService.js";
import { IAgentHostUntitledProvisionalSessionService } from "../../../../contrib/chat/browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js";
import { IAgentHostSessionWorkingDirectoryResolver } from "../../../../contrib/chat/browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js";
import { IAgentHostNewSessionFolderService } from "../../../../contrib/chat/browser/agentSessions/agentHost/agentHostNewSessionFolderService.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IViewDescriptorService } from "../../../../common/views.js";
import { IListService, ListService } from "../../../../../platform/list/browser/listService.js";
import { INotebookDocumentService } from "../../../../services/notebook/common/notebookDocumentService.js";
import { ISCMService } from "../../../../contrib/scm/common/scm.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { ISharedWebContentExtractorService } from "../../../../../platform/webContentExtractor/common/webContentExtractor.js";
import { IUpdateService, StateType } from "../../../../../platform/update/common/update.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IMarkdownRendererService, MarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../fixtureUtils.js";
import { InlineChatZoneWidget } from "../../../../contrib/inlineChat/browser/inlineChatZoneWidget.js";
import { ChatModel } from "../../../../contrib/chat/common/model/chatModel.js";
import { IChatEditingService } from "../../../../contrib/chat/common/editing/chatEditingService.js";
import { Target } from "../../../../contrib/chat/common/promptSyntax/promptTypes.js";
import { ICustomizationHarnessService } from "../../../../contrib/chat/common/customizationHarnessService.js";
import "../../../../contrib/chat/browser/widget/input/editor/chatInputEditorContrib.js";
import "../../../../contrib/inlineChat/browser/media/inlineChat.css";
import "../../../../contrib/chat/browser/widget/media/chat.css";
import "../../../../../editor/contrib/zoneWidget/browser/zoneWidget.css";
import "../../../../../base/browser/ui/codicons/codiconStyles.js";
import { MockChatModeService } from "../../../../contrib/chat/test/common/mockChatModeService.js";
const SAMPLE_CODE = `import { useState, useEffect } from 'react';

interface User {
	id: number;
	name: string;
	email: string;
}

function useUsers() {
	const [users, setUsers] = useState<User[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetch('/api/users')
			.then(res => res.json())
			.then(data => {
				setUsers(data);
				setLoading(false);
			});
	}, []);

	return { users, loading };
}

export function UserList() {
	const { users, loading } = useUsers();

	if (loading) {
		return <div>Loading...</div>;
	}

	return (
		<ul>
			{users.map(user => (
				<li key={user.id}>{user.name}</li>
			))}
		</ul>
	);
}
`;
MenuRegistry.appendMenuItem(MenuId.ChatEditorInlineExecute, {
  group: "navigation",
  order: 1,
  command: { id: "inlineChat.accept", title: "Accept" }
});
MenuRegistry.appendMenuItem(MenuId.ChatEditorInlineExecute, {
  group: "navigation",
  order: 2,
  command: { id: "inlineChat.discard", title: "Discard" }
});
MenuRegistry.appendMenuItem(MenuId.ChatInput, {
  group: "navigation",
  order: -1,
  command: { id: "workbench.action.chat.attachContext", title: "+", icon: Codicon.add }
});
MenuRegistry.appendMenuItem(MenuId.ChatInput, {
  group: "navigation",
  order: 3,
  command: { id: "workbench.action.chat.openModelPicker", title: "GPT-4.1" }
});
MenuRegistry.appendMenuItem(MenuId.ChatExecute, {
  group: "navigation",
  order: 4,
  command: { id: "workbench.action.chat.submit", title: "Send", icon: Codicon.newLine }
});
function renderInlineChatZoneWidget({ container, disposableStore, theme }, showTerminationCard) {
  container.style.width = "600px";
  container.style.height = "700px";
  container.style.border = "1px solid var(--vscode-editorWidget-border)";
  const styleReset = document.createElement("style");
  styleReset.textContent = ".component-fixture-box-sizing-reset, .component-fixture-box-sizing-reset * { box-sizing: revert; }";
  container.appendChild(styleReset);
  container.classList.add("component-fixture-box-sizing-reset");
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.define(IContextKeyService, ContextKeyService);
      reg.define(IMenuService, MenuService);
      reg.define(IMarkdownRendererService, MarkdownRendererService);
      reg.defineInstance(IAccessibleViewService, new class extends mock() {
        getOpenAriaHint() {
          return "";
        }
      }());
      reg.defineInstance(IProductService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.urlProtocol = "vscode";
        }
      }());
      reg.defineInstance(ILifecycleService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onBeforeShutdown = Event.None;
          this.onWillShutdown = Event.None;
          this.onDidShutdown = Event.None;
          this.onShutdownVeto = Event.None;
        }
      }());
      reg.defineInstance(IChatService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidPerformUserAction = Event.None;
          this.onDidSubmitRequest = Event.None;
          this.requestInProgressObs = observableValue("requestInProgress", false);
        }
      }());
      reg.defineInstance(IChatAgentService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeAgents = Event.None;
        }
        getAgents() {
          return [];
        }
        getActivatedAgents() {
          return [];
        }
      }());
      reg.defineInstance(IChatWidgetService, new class extends mock() {
        getWidgetBySessionId() {
          return void 0;
        }
        register() {
          return { dispose() {
          } };
        }
      }());
      reg.defineInstance(IChatAccessibilityService, new class extends mock() {
        acceptRequest() {
        }
        acceptResponse() {
        }
      }());
      reg.defineInstance(IChatSlashCommandService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeCommands = Event.None;
        }
        getCommands() {
          return [];
        }
      }());
      reg.defineInstance(IPromptsService, new class extends mock() {
      }());
      reg.defineInstance(IChatLayoutService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.fontFamily = observableValue("fontFamily", null);
          this.fontSize = observableValue("fontSize", 13);
        }
      }());
      reg.defineInstance(IChatTipService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidReceiveTip = Event.None;
        }
        resetSession() {
        }
      }());
      reg.defineInstance(IChatDebugService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidAddEvent = Event.None;
        }
        getEvents() {
          return [];
        }
      }());
      reg.defineInstance(IChatEntitlementService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.sentimentObs = observableValue("sentiment", { completed: true });
          this.anonymousObs = observableValue("anonymous", false);
          this.onDidChangeAnonymous = Event.None;
          this.onDidChangeEntitlement = Event.None;
          this.onDidChangeSentiment = Event.None;
          // A signed-in, set-up user so the model picker renders normally
          // (no Restricted / Sign In state) in this fixture.
          this.sentiment = { completed: true };
          this.entitlement = ChatEntitlement.Pro;
          this.anonymous = false;
          this.hasByokModels = false;
          this.quotas = {};
          this.onDidChangeQuotaRemaining = Event.None;
          this.onDidChangeUsageBasedBilling = Event.None;
        }
      }());
      reg.defineInstance(IChatModeService, new MockChatModeService());
      reg.defineInstance(IChatSessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeSessionOptions = Event.None;
          this.onDidChangeOptionGroups = Event.None;
          this.onDidChangeAvailability = Event.None;
          this.onDidChangeCustomizations = Event.None;
          this.onDidChangeContentProviderSchemes = Event.None;
          this.onDidChangeItemsProviders = Event.None;
          this.onDidChangeSessionItems = Event.None;
          this.onDidCommitSession = Event.None;
          this.onDidChangeInProgress = Event.None;
        }
        getAllChatSessionContributions() {
          return [];
        }
        sessionSupportsFork() {
          return false;
        }
        supportsDelegationForSessionType() {
          return false;
        }
        getOptionGroupsForSessionType() {
          return void 0;
        }
        getCustomAgentTargetForSessionType() {
          return Target.Undefined;
        }
        requiresCustomModelsForSessionType() {
          return false;
        }
        supportsAutoModelForSessionType() {
          return true;
        }
        getChatSessionContribution() {
          return void 0;
        }
        getCapabilitiesForSessionType() {
          return void 0;
        }
        getSessionOptions() {
          return void 0;
        }
        hasCustomizationsProvider() {
          return false;
        }
      }());
      reg.defineInstance(ILanguageModelsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLanguageModels = Event.None;
          this.onDidChangeModelVisibility = Event.None;
        }
        getLanguageModelIds() {
          return [];
        }
        getVendors() {
          return [];
        }
      }());
      reg.defineInstance(ILanguageModelToolsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeTools = Event.None;
        }
        getTools() {
          return [];
        }
        observeTools() {
          return observableValue("tools", []);
        }
        getToolSetsForModel() {
          return [];
        }
      }());
      reg.defineInstance(IAgentSessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.model = new class extends mock() {
            constructor() {
              super(...arguments);
              this.onDidChangeSessions = Event.None;
            }
          }();
        }
      }());
      reg.defineInstance(IAgentHostService, new class extends mock() {
      }());
      reg.defineInstance(IAgentHostUntitledProvisionalSessionService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChange = Event.None;
        }
        get() {
          return void 0;
        }
      }());
      reg.defineInstance(IAgentHostSessionWorkingDirectoryResolver, new class extends mock() {
        resolve() {
          return void 0;
        }
      }());
      reg.defineInstance(IAgentHostNewSessionFolderService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeFolder = Event.None;
        }
        getFolder() {
          return void 0;
        }
      }());
      reg.defineInstance(IChatContextService, new class extends mock() {
      }());
      reg.defineInstance(IChatAttachmentWidgetRegistry, new class extends mock() {
      }());
      reg.defineInstance(IChatAttachmentResolveService, new class extends mock() {
      }());
      reg.defineInstance(IChatImageCarouselService, new class extends mock() {
      }());
      reg.defineInstance(IChatArtifactsService, new class extends mock() {
        getArtifacts() {
          return new class extends mock() {
            constructor() {
              super(...arguments);
              this.artifactGroups = observableValue("artifactGroups", []);
            }
            setAgentArtifacts() {
            }
            clearAgentArtifacts() {
            }
            clearSubagentArtifacts() {
            }
            migrate() {
            }
          }();
        }
      }());
      reg.defineInstance(IChatTodoListService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidUpdateTodos = Event.None;
        }
        getTodos() {
          return [];
        }
        setTodos() {
        }
        migrateTodos() {
        }
      }());
      reg.defineInstance(IChatWidgetHistoryService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeHistory = Event.None;
        }
        getHistory() {
          return [];
        }
      }());
      reg.defineInstance(IChatEditingService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.editingSessionsObs = observableValue("editingSessionsObs", []);
        }
      }());
      reg.defineInstance(IChatInputNotificationService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChange = Event.None;
        }
        getActiveNotification() {
          return void 0;
        }
        announceRendered() {
        }
      }());
      reg.defineInstance(IDictationOnboardingService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.isVisible = false;
        }
        registerHost() {
          return Disposable.None;
        }
      }());
      reg.defineInstance(IVoiceModeOnboardingService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.isVisible = false;
        }
        registerHost() {
          return Disposable.None;
        }
      }());
      reg.defineInstance(ICustomizationHarnessService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeSlashCommands = Event.None;
          this.onDidChangeCustomAgents = Event.None;
        }
      }());
      reg.defineInstance(IChatContextPickService, new class extends mock() {
      }());
      reg.defineInstance(IDecorationsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeDecorations = Event.None;
        }
      }());
      reg.defineInstance(ITextFileService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.untitled = new class extends mock() {
            constructor() {
              super(...arguments);
              this.onDidChangeLabel = Event.None;
            }
          }();
        }
      }());
      reg.defineInstance(IFileService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidFilesChange = Event.None;
          this.onDidRunOperation = Event.None;
        }
      }());
      reg.defineInstance(IEditorService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidActiveEditorChange = Event.None;
        }
      }());
      reg.defineInstance(ISharedWebContentExtractorService, new class extends mock() {
      }());
      reg.defineInstance(IWorkbenchAssignmentService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidRefetchAssignments = Event.None;
        }
        async getCurrentExperiments() {
          return [];
        }
        async getTreatment() {
          return void 0;
        }
      }());
      reg.defineInstance(IWorkbenchLayoutService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.mainContainerOffset = { top: 0, quickPickTop: 0 };
          this.onDidLayoutMainContainer = Event.None;
          this.onDidLayoutActiveContainer = Event.None;
          this.onDidLayoutContainer = Event.None;
          this.onDidChangeActiveContainer = Event.None;
          this.onDidAddContainer = Event.None;
          this.onDidChangePartVisibility = Event.None;
          this.onDidChangeWindowMaximized = Event.None;
        }
        get mainContainer() {
          return container;
        }
        get activeContainer() {
          return container;
        }
        get mainContainerDimension() {
          return { width: 600, height: 400 };
        }
        get activeContainerDimension() {
          return { width: 600, height: 400 };
        }
        get containers() {
          return [container];
        }
        getContainer() {
          return container;
        }
        whenContainerStylesLoaded() {
          return void 0;
        }
        isVisible() {
          return true;
        }
      }());
      reg.defineInstance(IViewDescriptorService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeLocation = Event.None;
        }
      }());
      reg.defineInstance(IWorkspaceContextService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeWorkspaceFolders = Event.None;
        }
        getWorkspace() {
          return { id: "", folders: [], configuration: void 0 };
        }
      }());
      reg.defineInstance(IExtensionService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeExtensions = Event.None;
        }
      }());
      reg.defineInstance(IPathService, new class extends mock() {
      }());
      reg.defineInstance(IListService, new ListService());
      reg.defineInstance(INotebookDocumentService, new class extends mock() {
      }());
      reg.defineInstance(ISCMService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidAddRepository = Event.None;
          this.onDidRemoveRepository = Event.None;
          this.repositories = [];
          this.repositoryCount = 0;
        }
      }());
      reg.defineInstance(IActionWidgetService, new class extends mock() {
        show() {
        }
        hide() {
        }
        get isVisible() {
          return false;
        }
      }());
      reg.defineInstance(IFileDialogService, new class extends mock() {
      }());
      reg.defineInstance(IUpdateService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onStateChange = Event.None;
        }
        get state() {
          return { type: StateType.Uninitialized };
        }
      }());
      reg.defineInstance(IUriIdentityService, new class extends mock() {
      }());
    }
  });
  const configService = instantiationService.get(IConfigurationService);
  configService.setUserConfiguration("chat", { editor: { fontSize: 14, fontFamily: "default", fontWeight: "normal", lineHeight: 0, wordWrap: "on" } });
  configService.setUserConfiguration("editor", { fontFamily: "monospace", fontLigatures: false, accessibilitySupport: "off" });
  const textModel = disposableStore.add(createTextModel(
    instantiationService,
    SAMPLE_CODE,
    URI.parse("inmemory://inline-chat-zone.tsx"),
    "typescriptreact"
  ));
  const editor = disposableStore.add(instantiationService.createInstance(
    CodeEditorWidget,
    container,
    {
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      fontSize: 14,
      cursorBlinking: "solid"
    },
    { contributions: [] }
  ));
  editor.setModel(textModel);
  editor.focus();
  const zoneWidget = disposableStore.add(instantiationService.createInstance(
    InlineChatZoneWidget,
    { location: ChatAgentLocation.EditorInline },
    {
      enableWorkingSet: "implicit",
      enableImplicitContext: false,
      renderInputOnTop: false,
      renderInputToolbarBelowInput: true,
      menus: {
        telemetrySource: "inlineChatWidget",
        executeToolbar: MenuId.ChatEditorInlineExecute,
        inputSideToolbar: MenuId.ChatEditorInlineInputSide
      },
      defaultMode: ChatMode.Ask
    },
    { editor },
    () => Promise.resolve()
  ));
  zoneWidget.domNode.classList.add("inline-chat-2");
  zoneWidget.show(new Position(10, 1));
  const dummyModel = disposableStore.add(instantiationService.createInstance(ChatModel, void 0, { initialLocation: ChatAgentLocation.EditorInline, canUseTools: false }));
  zoneWidget.widget.chatWidget.setModel(dummyModel);
  zoneWidget.widget.chatWidget.setInputPlaceholder("Ask Copilot...");
  zoneWidget.updatePositionAndHeight(new Position(10, 1));
  if (showTerminationCard) {
    zoneWidget.showTerminationCard(
      "The agent ran into an issue and stopped. You can review the changes made so far.",
      instantiationService
    );
  }
}
var inlineChatZoneWidget_fixture_default = defineThemedFixtureGroup({ path: "editor/" }, {
  InlineChatZoneWidget: defineComponentFixture({
    labels: { kind: "screenshot", blocksCi: true },
    render: (context) => renderInlineChatZoneWidget(context, false)
  }),
  InlineChatZoneWidgetTerminated: defineComponentFixture({
    labels: { kind: "screenshot", blocksCi: true },
    render: (context) => renderInlineChatZoneWidget(context, true)
  })
});
export {
  inlineChatZoneWidget_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvZWRpdG9yL2lubGluZUNoYXRab25lV2lkZ2V0LmZpeHR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQsIElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2Jyb3dzZXIvY29udGV4dEtleVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9tZW51U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSURlY29yYXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2RlY29yYXRpb25zL2NvbW1vbi9kZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9hc3NpZ25tZW50L2NvbW1vbi9hc3NpZ25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2FnZW50c1ZvaWNlL2Jyb3dzZXIvdm9pY2VNb2RlT25ib2FyZGluZy5qcyc7XG5pbXBvcnQgeyBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL3NwZWVjaFRvVGV4dC9kaWN0YXRpb25PbmJvYXJkaW5nLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSwgSUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZXh0UGlja1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0Q29udGV4dFBpY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50V2lkZ2V0UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NvbnRleHRDb250cmliL2NoYXRDb250ZXh0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0VGlwU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRUaXBTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVTZXJ2aWNlLCBDaGF0TW9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0U2xhc2hDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFydGlmYWN0cywgSUNoYXRBcnRpZmFjdHNTZXJ2aWNlLCBJQXJ0aWZhY3RTb3VyY2VHcm91cCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvY2hhdEFydGlmYWN0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRUb2RvTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2NoYXRUb2RvTGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXREZWJ1Z1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi93aWRnZXQvY2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0TGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vd2lkZ2V0L2NoYXRMYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSwgTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbm90ZWJvb2svY29tbW9uL25vdGVib29rRG9jdW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTQ01TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9zY20vY29tbW9uL3NjbS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJU2hhcmVkV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93ZWJDb250ZW50RXh0cmFjdG9yL2NvbW1vbi93ZWJDb250ZW50RXh0cmFjdG9yLmpzJztcbmltcG9ydCB7IElVcGRhdGVTZXJ2aWNlLCBTdGF0ZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSwgTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgY3JlYXRlRWRpdG9yU2VydmljZXMsIGNyZWF0ZVRleHRNb2RlbCwgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwLCByZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzIH0gZnJvbSAnLi4vZml4dHVyZVV0aWxzLmpzJztcbmltcG9ydCB7IElubGluZUNoYXRab25lV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9pbmxpbmVDaGF0L2Jyb3dzZXIvaW5saW5lQ2hhdFpvbmVXaWRnZXQuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcblxuLy8gU2lkZS1lZmZlY3QgaW1wb3J0OiByZWdpc3RlcnMgSW5wdXRFZGl0b3JEZWNvcmF0aW9ucyBpbnRvIENoYXRXaWRnZXQuQ09OVFJJQlNcbi8vIHNvIHRoZSBwbGFjZWhvbGRlciBkZWNvcmF0aW9uIGlzIHJlbmRlcmVkLlxuaW1wb3J0ICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvZWRpdG9yL2NoYXRJbnB1dEVkaXRvckNvbnRyaWIuanMnO1xuXG4vLyBDU1MgaW1wb3J0c1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9jb250cmliL2lubGluZUNoYXQvYnJvd3Nlci9tZWRpYS9pbmxpbmVDaGF0LmNzcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9tZWRpYS9jaGF0LmNzcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3pvbmVXaWRnZXQvYnJvd3Nlci96b25lV2lkZ2V0LmNzcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb2RpY29ucy9jb2RpY29uU3R5bGVzLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0TW9kZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvdGVzdC9jb21tb24vbW9ja0NoYXRNb2RlU2VydmljZS5qcyc7XG5cbmNvbnN0IFNBTVBMRV9DT0RFID0gYGltcG9ydCB7IHVzZVN0YXRlLCB1c2VFZmZlY3QgfSBmcm9tICdyZWFjdCc7XG5cbmludGVyZmFjZSBVc2VyIHtcblx0aWQ6IG51bWJlcjtcblx0bmFtZTogc3RyaW5nO1xuXHRlbWFpbDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiB1c2VVc2VycygpIHtcblx0Y29uc3QgW3VzZXJzLCBzZXRVc2Vyc10gPSB1c2VTdGF0ZTxVc2VyW10+KFtdKTtcblx0Y29uc3QgW2xvYWRpbmcsIHNldExvYWRpbmddID0gdXNlU3RhdGUodHJ1ZSk7XG5cblx0dXNlRWZmZWN0KCgpID0+IHtcblx0XHRmZXRjaCgnL2FwaS91c2VycycpXG5cdFx0XHQudGhlbihyZXMgPT4gcmVzLmpzb24oKSlcblx0XHRcdC50aGVuKGRhdGEgPT4ge1xuXHRcdFx0XHRzZXRVc2VycyhkYXRhKTtcblx0XHRcdFx0c2V0TG9hZGluZyhmYWxzZSk7XG5cdFx0XHR9KTtcblx0fSwgW10pO1xuXG5cdHJldHVybiB7IHVzZXJzLCBsb2FkaW5nIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBVc2VyTGlzdCgpIHtcblx0Y29uc3QgeyB1c2VycywgbG9hZGluZyB9ID0gdXNlVXNlcnMoKTtcblxuXHRpZiAobG9hZGluZykge1xuXHRcdHJldHVybiA8ZGl2PkxvYWRpbmcuLi48L2Rpdj47XG5cdH1cblxuXHRyZXR1cm4gKFxuXHRcdDx1bD5cblx0XHRcdHt1c2Vycy5tYXAodXNlciA9PiAoXG5cdFx0XHRcdDxsaSBrZXk9e3VzZXIuaWR9Pnt1c2VyLm5hbWV9PC9saT5cblx0XHRcdCkpfVxuXHRcdDwvdWw+XG5cdCk7XG59XG5gO1xuXG4vLyBSZWdpc3RlciBmYWtlIG1lbnUgaXRlbXMgb25jZSBhdCBtb2R1bGUgc2NvcGUgKG5vdCBwZXItcmVuZGVyKSB0byBhdm9pZFxuLy8gZHVwbGljYXRlcyB3aGVuIERhcmsgYW5kIExpZ2h0IGZpeHR1cmVzIGFyZSByZW5kZXJlZCBzaW11bHRhbmVvdXNseSxcbi8vIHNpbmNlIE1lbnVSZWdpc3RyeSBpcyBhIGdsb2JhbCBzaW5nbGV0b24uXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNoYXRFZGl0b3JJbmxpbmVFeGVjdXRlLCB7XG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsIG9yZGVyOiAxLFxuXHRjb21tYW5kOiB7IGlkOiAnaW5saW5lQ2hhdC5hY2NlcHQnLCB0aXRsZTogJ0FjY2VwdCcgfSxcbn0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5DaGF0RWRpdG9ySW5saW5lRXhlY3V0ZSwge1xuXHRncm91cDogJ25hdmlnYXRpb24nLCBvcmRlcjogMixcblx0Y29tbWFuZDogeyBpZDogJ2lubGluZUNoYXQuZGlzY2FyZCcsIHRpdGxlOiAnRGlzY2FyZCcgfSxcbn0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5DaGF0SW5wdXQsIHtcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJywgb3JkZXI6IC0xLFxuXHRjb21tYW5kOiB7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaENvbnRleHQnLCB0aXRsZTogJysnLCBpY29uOiBDb2RpY29uLmFkZCB9LFxufSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNoYXRJbnB1dCwge1xuXHRncm91cDogJ25hdmlnYXRpb24nLCBvcmRlcjogMyxcblx0Y29tbWFuZDogeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTW9kZWxQaWNrZXInLCB0aXRsZTogJ0dQVC00LjEnIH0sXG59KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ2hhdEV4ZWN1dGUsIHtcblx0Z3JvdXA6ICduYXZpZ2F0aW9uJywgb3JkZXI6IDQsXG5cdGNvbW1hbmQ6IHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc3VibWl0JywgdGl0bGU6ICdTZW5kJywgaWNvbjogQ29kaWNvbi5uZXdMaW5lIH0sXG59KTtcblxuZnVuY3Rpb24gcmVuZGVySW5saW5lQ2hhdFpvbmVXaWRnZXQoeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSwgdGhlbWUgfTogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIHNob3dUZXJtaW5hdGlvbkNhcmQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gJzYwMHB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICc3MDBweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkIHZhcigtLXZzY29kZS1lZGl0b3JXaWRnZXQtYm9yZGVyKSc7XG5cblx0Ly8gVGhlIGNvbXBvbmVudC1leHBsb3JlciBoYXJuZXNzIGluamVjdHMgYSBnbG9iYWwgYCogeyBib3gtc2l6aW5nOiBib3JkZXItYm94IH1gXG5cdC8vIHJlc2V0IGludG8gdGhlIGRvY3VtZW50IGhlYWQuIFRoZSBjaGF0IGlucHV0IHRvb2xiYXIgKGFuZCBvdGhlciBNb25hY28gVUkgYml0cylcblx0Ly8gcmVseSBvbiB0aGUgYnJvd3NlciBkZWZhdWx0IGBjb250ZW50LWJveGAgc28gdGhhdCBleHBsaWNpdCBgaGVpZ2h0YCBwbHVzIGBwYWRkaW5nYFxuXHQvLyBhZGQgdXAgY29ycmVjdGx5IChlLmcuIHRoZSBhdHRhY2htZW50cyByb3cgaXMgMTZweCBoZWlnaHQgKyAzcHggcGFkZGluZyA9IDIycHgpLlxuXHQvLyBSZXZlcnQgdGhlIHJlc2V0IGZvciBvdXIgc3VidHJlZSBzbyB0aGUgZml4dHVyZSByZW5kZXJzIGxpa2UgdGhlIHJlYWwgcHJvZHVjdC5cblx0Y29uc3Qgc3R5bGVSZXNldCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XG5cdHN0eWxlUmVzZXQudGV4dENvbnRlbnQgPSAnLmNvbXBvbmVudC1maXh0dXJlLWJveC1zaXppbmctcmVzZXQsIC5jb21wb25lbnQtZml4dHVyZS1ib3gtc2l6aW5nLXJlc2V0ICogeyBib3gtc2l6aW5nOiByZXZlcnQ7IH0nO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoc3R5bGVSZXNldCk7XG5cdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjb21wb25lbnQtZml4dHVyZS1ib3gtc2l6aW5nLXJlc2V0Jyk7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhkaXNwb3NhYmxlU3RvcmUsIHtcblx0XHRjb2xvclRoZW1lOiB0aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IChyZWcpID0+IHtcblx0XHRcdHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMocmVnKTtcblx0XHRcdHJlZy5kZWZpbmUoSUNvbnRleHRLZXlTZXJ2aWNlLCBDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lKElNZW51U2VydmljZSwgTWVudVNlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZShJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIE1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlKTtcblxuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBY2Nlc3NpYmxlVmlld1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjY2Vzc2libGVWaWV3U2VydmljZT4oKSB7XG5cdFx0XHRcdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRPcGVuQXJpYUhpbnQoKSB7IHJldHVybiAnJzsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJUHJvZHVjdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVByb2R1Y3RTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdXJsUHJvdG9jb2wgPSAndnNjb2RlJztcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUxpZmVjeWNsZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxpZmVjeWNsZVNlcnZpY2U+KCkge1xuXHRcdFx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25CZWZvcmVTaHV0ZG93biA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uV2lsbFNodXRkb3duID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRTaHV0ZG93biA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uU2h1dGRvd25WZXRvID0gRXZlbnQuTm9uZTtcblx0XHRcdH0oKSk7XG5cblx0XHRcdC8vIENoYXQgc2VydmljZXNcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRQZXJmb3JtVXNlckFjdGlvbiA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkU3VibWl0UmVxdWVzdCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlcXVlc3RJblByb2dyZXNzT2JzID0gb2JzZXJ2YWJsZVZhbHVlKCdyZXF1ZXN0SW5Qcm9ncmVzcycsIGZhbHNlKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRBZ2VudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRBZ2VudFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUFnZW50cyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldEFnZW50cygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldEFjdGl2YXRlZEFnZW50cygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFdpZGdldFNlcnZpY2U+KCkge1xuXHRcdFx0XHRnZXRXaWRnZXRCeVNlc3Npb25JZCgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRvdmVycmlkZSByZWdpc3RlcigpIHsgcmV0dXJuIHsgZGlzcG9zZSgpIHsgfSB9OyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0QWNjZXNzaWJpbGl0eVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFjY2VwdFJlcXVlc3QoKSB7IH1cblx0XHRcdFx0b3ZlcnJpZGUgYWNjZXB0UmVzcG9uc2UoKSB7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U2xhc2hDb21tYW5kU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29tbWFuZHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRDb21tYW5kcygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElQcm9tcHRzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUHJvbXB0c1NlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0TGF5b3V0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdExheW91dFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBmb250RmFtaWx5ID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IG51bGw+KCdmb250RmFtaWx5JywgbnVsbCk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGZvbnRTaXplID0gb2JzZXJ2YWJsZVZhbHVlKCdmb250U2l6ZScsIDEzKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRUaXBTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0VGlwU2VydmljZT4oKSB7XG5cdFx0XHRcdHJlYWRvbmx5IG9uRGlkUmVjZWl2ZVRpcCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlc2V0U2Vzc2lvbigpIHsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdERlYnVnU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdERlYnVnU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQWRkRXZlbnQgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRFdmVudHMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdEVudGl0bGVtZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEVudGl0bGVtZW50U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlbnRpbWVudE9icyA9IG9ic2VydmFibGVWYWx1ZSgnc2VudGltZW50JywgeyBjb21wbGV0ZWQ6IHRydWUgfSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFub255bW91c09icyA9IG9ic2VydmFibGVWYWx1ZSgnYW5vbnltb3VzJywgZmFsc2UpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUFub255bW91cyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRW50aXRsZW1lbnQgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlbnRpbWVudCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdC8vIEEgc2lnbmVkLWluLCBzZXQtdXAgdXNlciBzbyB0aGUgbW9kZWwgcGlja2VyIHJlbmRlcnMgbm9ybWFsbHlcblx0XHRcdFx0Ly8gKG5vIFJlc3RyaWN0ZWQgLyBTaWduIEluIHN0YXRlKSBpbiB0aGlzIGZpeHR1cmUuXG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlbnRpbWVudCA9IHsgY29tcGxldGVkOiB0cnVlIH07XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGVudGl0bGVtZW50ID0gQ2hhdEVudGl0bGVtZW50LlBybztcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYW5vbnltb3VzID0gZmFsc2U7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGhhc0J5b2tNb2RlbHMgPSBmYWxzZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcXVvdGFzID0ge307XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUXVvdGFSZW1haW5pbmcgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVVzYWdlQmFzZWRCaWxsaW5nID0gRXZlbnQuTm9uZTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRNb2RlU2VydmljZSwgbmV3IE1vY2tDaGF0TW9kZVNlcnZpY2UoKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBnZXRBbGxDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25PcHRpb25zID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VPcHRpb25Hcm91cHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUF2YWlsYWJpbGl0eSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnRQcm92aWRlclNjaGVtZXMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUl0ZW1zUHJvdmlkZXJzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uSXRlbXMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENvbW1pdFNlc3Npb24gPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUluUHJvZ3Jlc3MgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBzZXNzaW9uU3VwcG9ydHNGb3JrKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdFx0b3ZlcnJpZGUgc3VwcG9ydHNEZWxlZ2F0aW9uRm9yU2Vzc2lvblR5cGUoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRPcHRpb25Hcm91cHNGb3JTZXNzaW9uVHlwZSgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRDdXN0b21BZ2VudFRhcmdldEZvclNlc3Npb25UeXBlKCkgeyByZXR1cm4gVGFyZ2V0LlVuZGVmaW5lZDsgfVxuXHRcdFx0XHRvdmVycmlkZSByZXF1aXJlc0N1c3RvbU1vZGVsc0ZvclNlc3Npb25UeXBlKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdFx0b3ZlcnJpZGUgc3VwcG9ydHNBdXRvTW9kZWxGb3JTZXNzaW9uVHlwZSgpIHsgcmV0dXJuIHRydWU7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24oKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0Q2FwYWJpbGl0aWVzRm9yU2Vzc2lvblR5cGUoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbk9wdGlvbnMoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0b3ZlcnJpZGUgaGFzQ3VzdG9taXphdGlvbnNQcm92aWRlcigpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxzU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZU1vZGVsVmlzaWJpbGl0eSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldExhbmd1YWdlTW9kZWxJZHMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRWZW5kb3JzKCkgeyByZXR1cm4gW107IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVRvb2xzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0VG9vbHMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRvdmVycmlkZSBvYnNlcnZlVG9vbHMoKSB7IHJldHVybiBvYnNlcnZhYmxlVmFsdWUoJ3Rvb2xzJywgW10pOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldFRvb2xTZXRzRm9yTW9kZWwoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50U2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFNlc3Npb25zU2VydmljZVsnbW9kZWwnXT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9ucyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdH0oKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50SG9zdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50SG9zdFNlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0KCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZSgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VGb2xkZXIgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRGb2xkZXIoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRDb250ZXh0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdENvbnRleHRTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRJbWFnZUNhcm91c2VsU2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRBcnRpZmFjdHNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0QXJ0aWZhY3RzU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGdldEFydGlmYWN0cygpOiBJQ2hhdEFydGlmYWN0cyB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRBcnRpZmFjdHM+KCkge1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYXJ0aWZhY3RHcm91cHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFydGlmYWN0U291cmNlR3JvdXBbXT4oJ2FydGlmYWN0R3JvdXBzJywgW10pO1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgc2V0QWdlbnRBcnRpZmFjdHMoKSB7IH1cblx0XHRcdFx0XHRcdG92ZXJyaWRlIGNsZWFyQWdlbnRBcnRpZmFjdHMoKSB7IH1cblx0XHRcdFx0XHRcdG92ZXJyaWRlIGNsZWFyU3ViYWdlbnRBcnRpZmFjdHMoKSB7IH1cblx0XHRcdFx0XHRcdG92ZXJyaWRlIG1pZ3JhdGUoKSB7IH1cblx0XHRcdFx0XHR9KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRUb2RvTGlzdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRUb2RvTGlzdFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFVwZGF0ZVRvZG9zID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0VG9kb3MoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRvdmVycmlkZSBzZXRUb2RvcygpIHsgfVxuXHRcdFx0XHRvdmVycmlkZSBtaWdyYXRlVG9kb3MoKSB7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0SGlzdG9yeSgpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGlzdG9yeSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0RWRpdGluZ1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRFZGl0aW5nU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGVkaXRpbmdTZXNzaW9uc09icyA9IG9ic2VydmFibGVWYWx1ZSgnZWRpdGluZ1Nlc3Npb25zT2JzJywgW10pO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0QWN0aXZlTm90aWZpY2F0aW9uKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGFubm91bmNlUmVuZGVyZWQoKSB7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSURpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHRvdmVycmlkZSByZWdpc3Rlckhvc3QoKSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHRvdmVycmlkZSByZWdpc3Rlckhvc3QoKSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdENvbnRleHRQaWNrU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdENvbnRleHRQaWNrU2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSURlY29yYXRpb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRGVjb3JhdGlvbnNTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VEZWNvcmF0aW9ucyA9IEV2ZW50Lk5vbmU7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVRleHRGaWxlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGV4dEZpbGVTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgcmVhZG9ubHkgdW50aXRsZWQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXh0RmlsZVNlcnZpY2VbJ3VudGl0bGVkJ10+KCkgeyBvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUxhYmVsID0gRXZlbnQuTm9uZTsgfSgpOyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElGaWxlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRmlsZVNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSBvbkRpZEZpbGVzQ2hhbmdlID0gRXZlbnQuTm9uZTsgb3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRSdW5PcGVyYXRpb24gPSBFdmVudC5Ob25lOyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElFZGl0b3JTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UgPSBFdmVudC5Ob25lOyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElTaGFyZWRXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2hhcmVkV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2U+KCkgeyBvdmVycmlkZSBhc3luYyBnZXRDdXJyZW50RXhwZXJpbWVudHMoKSB7IHJldHVybiBbXTsgfSBvdmVycmlkZSBhc3luYyBnZXRUcmVhdG1lbnQoKSB7IHJldHVybiB1bmRlZmluZWQ7IH0gb3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRSZWZldGNoQXNzaWdubWVudHMgPSBFdmVudC5Ob25lOyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHRcdG92ZXJyaWRlIGdldCBtYWluQ29udGFpbmVyKCkgeyByZXR1cm4gY29udGFpbmVyOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldCBhY3RpdmVDb250YWluZXIoKSB7IHJldHVybiBjb250YWluZXI7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0IG1haW5Db250YWluZXJEaW1lbnNpb24oKSB7IHJldHVybiB7IHdpZHRoOiA2MDAsIGhlaWdodDogNDAwIH07IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0IGFjdGl2ZUNvbnRhaW5lckRpbWVuc2lvbigpIHsgcmV0dXJuIHsgd2lkdGg6IDYwMCwgaGVpZ2h0OiA0MDAgfTsgfVxuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBtYWluQ29udGFpbmVyT2Zmc2V0ID0geyB0b3A6IDAsIHF1aWNrUGlja1RvcDogMCB9O1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZExheW91dE1haW5Db250YWluZXIgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZExheW91dEFjdGl2ZUNvbnRhaW5lciA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkTGF5b3V0Q29udGFpbmVyID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVDb250YWluZXIgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFkZENvbnRhaW5lciA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGdldCBjb250YWluZXJzKCkgeyByZXR1cm4gW2NvbnRhaW5lcl07IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0Q29udGFpbmVyKCkgeyByZXR1cm4gY29udGFpbmVyOyB9XG5cdFx0XHRcdG92ZXJyaWRlIHdoZW5Db250YWluZXJTdHlsZXNMb2FkZWQoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlV2luZG93TWF4aW1pemVkID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgaXNWaXNpYmxlKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWaWV3RGVzY3JpcHRvclNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUxvY2F0aW9uID0gRXZlbnQuTm9uZTsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzID0gRXZlbnQuTm9uZTsgb3ZlcnJpZGUgZ2V0V29ya3NwYWNlKCk6IElXb3Jrc3BhY2UgeyByZXR1cm4geyBpZDogJycsIGZvbGRlcnM6IFtdLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQgfTsgfSB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElFeHRlbnNpb25TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRlbnNpb25TZXJ2aWNlPigpIHsgb3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VFeHRlbnNpb25zID0gRXZlbnQuTm9uZTsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJUGF0aFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVBhdGhTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJTGlzdFNlcnZpY2UsIG5ldyBMaXN0U2VydmljZSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJTm90ZWJvb2tEb2N1bWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJU0NNU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU0NNU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQWRkUmVwb3NpdG9yeSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkUmVtb3ZlUmVwb3NpdG9yeSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlcG9zaXRvcmllcyA9IFtdO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSByZXBvc2l0b3J5Q291bnQgPSAwO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWN0aW9uV2lkZ2V0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWN0aW9uV2lkZ2V0U2VydmljZT4oKSB7IG92ZXJyaWRlIHNob3coKSB7IH0gb3ZlcnJpZGUgaGlkZSgpIHsgfSBvdmVycmlkZSBnZXQgaXNWaXNpYmxlKCkgeyByZXR1cm4gZmFsc2U7IH0gfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJRmlsZURpYWxvZ1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVEaWFsb2dTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVXBkYXRlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVXBkYXRlU2VydmljZT4oKSB7IG92ZXJyaWRlIHJlYWRvbmx5IG9uU3RhdGVDaGFuZ2UgPSBFdmVudC5Ob25lOyBvdmVycmlkZSBnZXQgc3RhdGUoKSB7IHJldHVybiB7IHR5cGU6IFN0YXRlVHlwZS5VbmluaXRpYWxpemVkIGFzIGNvbnN0IH07IH0gfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJVXJpSWRlbnRpdHlTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVcmlJZGVudGl0eVNlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdH0sXG5cdH0pO1xuXG5cdC8vIENvbmZpZ3VyZSBjaGF0IGVkaXRvciBzZXR0aW5ncyByZXF1aXJlZCBieSBDaGF0RWRpdG9yT3B0aW9uc1xuXHRjb25zdCBjb25maWdTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkgYXMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0JywgeyBlZGl0b3I6IHsgZm9udFNpemU6IDE0LCBmb250RmFtaWx5OiAnZGVmYXVsdCcsIGZvbnRXZWlnaHQ6ICdub3JtYWwnLCBsaW5lSGVpZ2h0OiAwLCB3b3JkV3JhcDogJ29uJyB9IH0pO1xuXHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdlZGl0b3InLCB7IGZvbnRGYW1pbHk6ICdtb25vc3BhY2UnLCBmb250TGlnYXR1cmVzOiBmYWxzZSwgYWNjZXNzaWJpbGl0eVN1cHBvcnQ6ICdvZmYnIH0pO1xuXG5cdGNvbnN0IHRleHRNb2RlbCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFNBTVBMRV9DT0RFLFxuXHRcdFVSSS5wYXJzZSgnaW5tZW1vcnk6Ly9pbmxpbmUtY2hhdC16b25lLnRzeCcpLFxuXHRcdCd0eXBlc2NyaXB0cmVhY3QnXG5cdCkpO1xuXG5cdGNvbnN0IGVkaXRvciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0Q29kZUVkaXRvcldpZGdldCxcblx0XHRjb250YWluZXIsXG5cdFx0e1xuXHRcdFx0YXV0b21hdGljTGF5b3V0OiB0cnVlLFxuXHRcdFx0bWluaW1hcDogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0bGluZU51bWJlcnM6ICdvbicsXG5cdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdFx0XHRmb250U2l6ZTogMTQsXG5cdFx0XHRjdXJzb3JCbGlua2luZzogJ3NvbGlkJyxcblx0XHR9LFxuXHRcdHsgY29udHJpYnV0aW9uczogW10gfSBzYXRpc2ZpZXMgSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zXG5cdCkpO1xuXG5cdGVkaXRvci5zZXRNb2RlbCh0ZXh0TW9kZWwpO1xuXHRlZGl0b3IuZm9jdXMoKTtcblxuXHRjb25zdCB6b25lV2lkZ2V0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRJbmxpbmVDaGF0Wm9uZVdpZGdldCxcblx0XHR7IGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUgfSxcblx0XHR7XG5cdFx0XHRlbmFibGVXb3JraW5nU2V0OiAnaW1wbGljaXQnLFxuXHRcdFx0ZW5hYmxlSW1wbGljaXRDb250ZXh0OiBmYWxzZSxcblx0XHRcdHJlbmRlcklucHV0T25Ub3A6IGZhbHNlLFxuXHRcdFx0cmVuZGVySW5wdXRUb29sYmFyQmVsb3dJbnB1dDogdHJ1ZSxcblx0XHRcdG1lbnVzOiB7XG5cdFx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2lubGluZUNoYXRXaWRnZXQnLFxuXHRcdFx0XHRleGVjdXRlVG9vbGJhcjogTWVudUlkLkNoYXRFZGl0b3JJbmxpbmVFeGVjdXRlLFxuXHRcdFx0XHRpbnB1dFNpZGVUb29sYmFyOiBNZW51SWQuQ2hhdEVkaXRvcklubGluZUlucHV0U2lkZSxcblx0XHRcdH0sXG5cdFx0XHRkZWZhdWx0TW9kZTogQ2hhdE1vZGUuQXNrLFxuXHRcdH0sXG5cdFx0eyBlZGl0b3IgfSxcblx0XHQoKSA9PiBQcm9taXNlLnJlc29sdmUoKSxcblx0KSk7XG5cblx0Ly8gTWF0Y2ggd2hhdCBJbmxpbmVDaGF0Q29udHJvbGxlciBkb2VzIGluIHRoZSByZWFsIHByb2R1Y3Qgc28gdGhhdCB0aGVcblx0Ly8gaW5saW5lLWNoYXQtMiBzcGVjaWZpYyBzdHlsZXMgKHRvb2xiYXIgbGF5b3V0LCBhdHRhY2htZW50IHJvdyBzaXppbmcpIGFwcGx5LlxuXHR6b25lV2lkZ2V0LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnaW5saW5lLWNoYXQtMicpO1xuXG5cdHpvbmVXaWRnZXQuc2hvdyhuZXcgUG9zaXRpb24oMTAsIDEpKTtcblxuXHRjb25zdCBkdW1teU1vZGVsID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWwsIHVuZGVmaW5lZCwgeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSwgY2FuVXNlVG9vbHM6IGZhbHNlIH0pKTtcblx0em9uZVdpZGdldC53aWRnZXQuY2hhdFdpZGdldC5zZXRNb2RlbChkdW1teU1vZGVsKTtcblx0em9uZVdpZGdldC53aWRnZXQuY2hhdFdpZGdldC5zZXRJbnB1dFBsYWNlaG9sZGVyKCdBc2sgQ29waWxvdC4uLicpO1xuXG5cdC8vIEZvcmNlIGEgcmVsYXlvdXQgYWZ0ZXIgdGhlIGluaXRpYWwgc2hvdyBzbyB0aGF0IHRoZSBjaGF0IHdpZGdldCdzXG5cdC8vIGNvbnRlbnRIZWlnaHQgKHdoaWNoIGluY2x1ZGVzIHRoZSB0b29sYmFyIHJvdyByZW5kZXJlZCBiZWxvdyB0aGUgaW5wdXQpXG5cdC8vIGlzIGZ1bGx5IG1lYXN1cmVkIGFuZCB0aGUgem9uZSB3aWRnZXQgYWRqdXN0cyBpdHMgaGVpZ2h0IGFjY29yZGluZ2x5LlxuXHR6b25lV2lkZ2V0LnVwZGF0ZVBvc2l0aW9uQW5kSGVpZ2h0KG5ldyBQb3NpdGlvbigxMCwgMSkpO1xuXG5cdGlmIChzaG93VGVybWluYXRpb25DYXJkKSB7XG5cdFx0em9uZVdpZGdldC5zaG93VGVybWluYXRpb25DYXJkKFxuXHRcdFx0J1RoZSBhZ2VudCByYW4gaW50byBhbiBpc3N1ZSBhbmQgc3RvcHBlZC4gWW91IGNhbiByZXZpZXcgdGhlIGNoYW5nZXMgbWFkZSBzbyBmYXIuJyxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdCk7XG5cdH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHsgcGF0aDogJ2VkaXRvci8nIH0sIHtcblx0SW5saW5lQ2hhdFpvbmVXaWRnZXQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcsIGJsb2Nrc0NpOiB0cnVlIH0sXG5cdFx0cmVuZGVyOiAoY29udGV4dCkgPT4gcmVuZGVySW5saW5lQ2hhdFpvbmVXaWRnZXQoY29udGV4dCwgZmFsc2UpLFxuXHR9KSxcblx0SW5saW5lQ2hhdFpvbmVXaWRnZXRUZXJtaW5hdGVkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnLCBibG9ja3NDaTogdHJ1ZSB9LFxuXHRcdHJlbmRlcjogKGNvbnRleHQpID0+IHJlbmRlcklubGluZUNoYXRab25lV2lkZ2V0KGNvbnRleHQsIHRydWUpLFxuXHR9KSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsd0JBQWtEO0FBQzNELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsY0FBYyxRQUFRLG9CQUFvQjtBQUNuRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGlCQUFpQiwrQkFBK0I7QUFDekQsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQkFBb0IsaUNBQWlDO0FBQzlELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsa0JBQWtCLGdCQUFnQjtBQUMzQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGtDQUFrQztBQUMzQyxTQUF5Qiw2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
