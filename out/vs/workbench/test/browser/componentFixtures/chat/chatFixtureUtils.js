var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IMenuService, MenuItemAction } from "../../../../../platform/actions/common/actions.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IListService, ListService } from "../../../../../platform/list/browser/listService.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IUpdateService, StateType } from "../../../../../platform/update/common/update.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { ISharedWebContentExtractorService } from "../../../../../platform/webContentExtractor/common/webContentExtractor.js";
import { IAccessibleViewService } from "../../../../../platform/accessibility/browser/accessibleView.js";
import { IMarkdownRendererService, MarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IDecorationsService } from "../../../../services/decorations/common/decorations.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { IWorkbenchAssignmentService } from "../../../../services/assignment/common/assignmentService.js";
import { IWorkbenchLayoutService } from "../../../../services/layout/browser/layoutService.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { INotebookDocumentService } from "../../../../services/notebook/common/notebookDocumentService.js";
import { IViewDescriptorService } from "../../../../common/views.js";
import { ISCMService } from "../../../../contrib/scm/common/scm.js";
import { IBrowserViewWorkbenchService } from "../../../../contrib/browserView/common/browserView.js";
import { IAgentHostService } from "../../../../../platform/agentHost/common/agentService.js";
import { IAgentHostEnablementService } from "../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { IAgentSessionsService } from "../../../../contrib/chat/browser/agentSessions/agentSessionsService.js";
import { IAgentHostUntitledProvisionalSessionService } from "../../../../contrib/chat/browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js";
import { IAgentHostSessionWorkingDirectoryResolver } from "../../../../contrib/chat/browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js";
import { IAgentHostNewSessionFolderService } from "../../../../contrib/chat/browser/agentSessions/agentHost/agentHostNewSessionFolderService.js";
import { IVoiceModeOnboardingService } from "../../../../contrib/agentsVoice/browser/voiceModeOnboarding.js";
import { IChatAccessibilityService, IChatWidgetService } from "../../../../contrib/chat/browser/chat.js";
import { IChatPetService } from "../../../../contrib/chat/browser/chatPetService.js";
import { IChatOutputRendererService } from "../../../../contrib/chat/browser/chatOutputItemRenderer.js";
import { IAiEditTelemetryService } from "../../../../contrib/editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { EditSuggestionId } from "../../../../../editor/common/textModelEditSource.js";
import { IChatAttachmentResolveService } from "../../../../contrib/chat/browser/attachments/chatAttachmentResolveService.js";
import { IChatAttachmentWidgetRegistry } from "../../../../contrib/chat/browser/attachments/chatAttachmentWidgetRegistry.js";
import { IChatContextPickService } from "../../../../contrib/chat/browser/attachments/chatContextPickService.js";
import { IChatContextService } from "../../../../contrib/chat/browser/contextContrib/chatContextService.js";
import { IChatImageCarouselService } from "../../../../contrib/chat/browser/chatImageCarouselService.js";
import { IChatInputNotificationService } from "../../../../contrib/chat/browser/widget/input/chatInputNotificationService.js";
import { IDictationOnboardingService } from "../../../../contrib/chat/browser/speechToText/dictationOnboarding.js";
import { ChatSubmitRequestHandlerService, IChatSubmitRequestHandlerService } from "../../../../contrib/chat/browser/chatSubmitRequestHandlerService.js";
import { IChatMarkdownAnchorService } from "../../../../contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js";
import { IChatWidgetHistoryService } from "../../../../contrib/chat/common/widget/chatWidgetHistoryService.js";
import { IChatModeService } from "../../../../contrib/chat/common/chatModes.js";
import { MockChatModeService } from "../../../../contrib/chat/test/common/mockChatModeService.js";
import { IChatService } from "../../../../contrib/chat/common/chatService/chatService.js";
import { IChatSessionsService } from "../../../../contrib/chat/common/chatSessionsService.js";
import { Target } from "../../../../contrib/chat/common/promptSyntax/promptTypes.js";
import { ILanguageModelsService } from "../../../../contrib/chat/common/languageModels.js";
import { ChatAgentService, IChatAgentNameService, IChatAgentService } from "../../../../contrib/chat/common/participants/chatAgents.js";
import { MockChatService } from "../../../../contrib/chat/test/common/chatService/mockChatService.js";
import { ILanguageModelToolsService } from "../../../../contrib/chat/common/tools/languageModelToolsService.js";
import { IChatArtifactsService } from "../../../../contrib/chat/common/tools/chatArtifactsService.js";
import { IChatTodoListService } from "../../../../contrib/chat/common/tools/chatTodoListService.js";
import { IChatToolRiskAssessmentService } from "../../../../contrib/chat/browser/tools/chatToolRiskAssessmentService.js";
import { registerWorkbenchServices } from "../fixtureUtils.js";
let FixtureMenuService = class {
  constructor(_contextKeyService, _commandService) {
    this._contextKeyService = _contextKeyService;
    this._commandService = _commandService;
    this._items = /* @__PURE__ */ new Map();
  }
  addItem(menuId, item) {
    const key = menuId.id;
    let items = this._items.get(key);
    if (!items) {
      items = [];
      this._items.set(key, items);
    }
    items.push(item);
  }
  createMenu(id) {
    const actions = [];
    for (const item of this._items.get(id.id) ?? []) {
      const group = item.group ?? "";
      let entry = actions.find((a) => a[0] === group);
      if (!entry) {
        entry = [group, []];
        actions.push(entry);
      }
      entry[1].push(new MenuItemAction(item.command, item.alt, {}, void 0, void 0, this._contextKeyService, this._commandService));
    }
    return { onDidChange: Event.None, dispose() {
    }, getActions: () => actions };
  }
  getMenuActions() {
    return [];
  }
  getMenuContexts() {
    return /* @__PURE__ */ new Set();
  }
  resetHiddenStates() {
  }
};
FixtureMenuService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ICommandService)
], FixtureMenuService);
function registerChatFixtureServices(reg, options = {}) {
  registerWorkbenchServices(reg);
  reg.define(IMenuService, FixtureMenuService);
  reg.define(IMarkdownRendererService, MarkdownRendererService);
  reg.define(IListService, ListService);
  reg.defineInstance(IDecorationsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeDecorations = Event.None;
    }
  }());
  reg.defineInstance(IBrowserViewWorkbenchService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeBrowserViews = Event.None;
    }
    getKnownBrowserViews() {
      return /* @__PURE__ */ new Map();
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
    hasProvider() {
      return false;
    }
  }());
  reg.defineInstance(IEditorService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidActiveEditorChange = Event.None;
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
  reg.defineInstance(IWorkspaceContextService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeWorkspaceFolders = Event.None;
    }
    getWorkspace() {
      return { id: "", folders: [], configuration: void 0 };
    }
  }());
  reg.defineInstance(IWorkbenchLayoutService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangePartVisibility = Event.None;
      this.onDidChangeWindowMaximized = Event.None;
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
  reg.defineInstance(IFileDialogService, new class extends mock() {
  }());
  reg.defineInstance(IProductService, new class extends mock() {
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
  reg.defineInstance(IActionWidgetService, new class extends mock() {
    show() {
    }
    hide() {
    }
    get isVisible() {
      return false;
    }
  }());
  reg.defineInstance(ISharedWebContentExtractorService, new class extends mock() {
  }());
  reg.defineInstance(IAccessibleViewService, new class extends mock() {
    getOpenAriaHint() {
      return null;
    }
  }());
  reg.define(IChatAgentService, class FixtureChatAgentService extends ChatAgentService {
    getDefaultAgent() {
      return { fullName: "GitHub Copilot", id: "githubCopilot" };
    }
  });
  reg.defineInstance(IChatAgentNameService, new class extends mock() {
    getAgentNameRestriction() {
      return true;
    }
  }());
  reg.define(IChatService, MockChatService);
  reg.defineInstance(IChatPetService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.enabled = observableValue("chatPetEnabled", false);
      this.variant = observableValue("chatPetVariant", "stable");
      this.onTheRun = observableValue("chatPetOnTheRun", false);
    }
    toggle() {
      return false;
    }
    setVariant() {
    }
    setOnTheRun() {
    }
  }());
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
      return [];
    }
    getWidgetByInputUri() {
      return void 0;
    }
    getWidgetBySessionResource() {
      return void 0;
    }
    getWidgetsByLocations() {
      return [];
    }
    register() {
      return { dispose() {
      } };
    }
  }());
  reg.defineInstance(IChatAccessibilityService, new class extends mock() {
    acceptRequest() {
    }
    disposeRequest() {
    }
    acceptResponse() {
    }
    acceptElicitation() {
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
  reg.defineInstance(IWorkbenchEnvironmentService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.isExtensionDevelopment = false;
      this.isBuilt = true;
      this.isSessionsWindow = false;
    }
  }());
  reg.defineInstance(IChatSessionsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeSessionOptions = Event.None;
      this.onDidChangeOptionGroups = Event.None;
      this.onDidChangeAvailability = Event.None;
    }
    getAllChatSessionContributions() {
      return [];
    }
    getCustomAgentTargetForSessionType() {
      return Target.Undefined;
    }
    requiresCustomModelsForSessionType() {
      return false;
    }
    supportsAutoModelForSessionType() {
      return false;
    }
    getOptionGroupsForSessionType() {
      return [];
    }
    supportsDelegationForSessionType() {
      return false;
    }
    getSessionOption() {
      return void 0;
    }
    getCapabilitiesForSessionType() {
      return void 0;
    }
  }());
  reg.defineInstance(IChatEntitlementService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.quotas = {};
      this.onDidChangeQuotaRemaining = Event.None;
      this.onDidChangeUsageBasedBilling = Event.None;
      this.onDidChangeEntitlement = Event.None;
      this.onDidChangeSentiment = Event.None;
      this.onDidChangeAnonymous = Event.None;
      // A signed-in, set-up user so the picker renders normally (no Restricted /
      // Sign In state) in fixtures.
      this.entitlement = ChatEntitlement.Pro;
      this.sentiment = { completed: true, installed: true };
      this.anonymous = false;
      this.hasByokModels = false;
    }
  }());
  reg.defineInstance(IChatModeService, new MockChatModeService());
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
    hasResolvedVendor() {
      return false;
    }
  }());
  reg.defineInstance(ILanguageModelToolsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeTools = Event.None;
      this.onDidPrepareToolCallBecomeUnresponsive = Event.None;
    }
    getTools() {
      return [];
    }
  }());
  reg.defineInstance(IChatToolRiskAssessmentService, new class extends mock() {
    isEnabled() {
      return false;
    }
    getCached() {
      return void 0;
    }
    async assess() {
      return void 0;
    }
  }());
  reg.defineInstance(IChatContextService, new class extends mock() {
  }());
  reg.defineInstance(IChatContextPickService, new class extends mock() {
  }());
  reg.defineInstance(IChatOutputRendererService, new class extends mock() {
    hasCodeBlockRenderer() {
      return false;
    }
  }());
  reg.defineInstance(IAiEditTelemetryService, new class extends mock() {
    createSuggestionId() {
      return EditSuggestionId.newId();
    }
  }());
  reg.defineInstance(IChatAttachmentWidgetRegistry, new class extends mock() {
  }());
  reg.defineInstance(IChatAttachmentResolveService, new class extends mock() {
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
  reg.defineInstance(IChatImageCarouselService, new class extends mock() {
  }());
  reg.defineInstance(IChatMarkdownAnchorService, new class extends mock() {
    register() {
      return { dispose() {
      } };
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
  reg.defineInstance(IChatSubmitRequestHandlerService, new ChatSubmitRequestHandlerService());
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
    getSession() {
      return void 0;
    }
  }());
  reg.defineInstance(IAgentHostService, new class extends mock() {
    getSubscription(_kind, _resource) {
      return {
        object: {
          value: void 0,
          verifiedValue: void 0,
          onDidChange: Event.None,
          onWillApplyAction: Event.None,
          onDidApplyAction: Event.None
        },
        dispose: () => {
        }
      };
    }
    getSubscriptionUnmanaged(_kind, _resource) {
      return void 0;
    }
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
  reg.defineInstance(IAgentHostEnablementService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.enabled = constObservable(false);
    }
  }());
  const artifactGroups = options.artifactGroups ?? observableValue("artifactGroups", []);
  reg.defineInstance(IChatArtifactsService, new class extends mock() {
    getArtifacts() {
      return new class extends mock() {
        constructor() {
          super(...arguments);
          this.artifactGroups = artifactGroups;
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
  const todos = [...options.todos ?? []];
  reg.defineInstance(IChatTodoListService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidUpdateTodos = Event.None;
    }
    getTodos() {
      return [...todos];
    }
    setTodos() {
    }
    migrateTodos() {
    }
  }());
}
export {
  FixtureMenuService,
  registerChatFixtureServices
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvY2hhdC9jaGF0Rml4dHVyZVV0aWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSU1lbnUsIElNZW51SXRlbSwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcGRhdGVTZXJ2aWNlLCBTdGF0ZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElTaGFyZWRXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dlYkNvbnRlbnRFeHRyYWN0b3IvY29tbW9uL3dlYkNvbnRlbnRFeHRyYWN0b3IuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2libGVWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIE1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9kZWNvcmF0aW9ucy9jb21tb24vZGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tEb2N1bWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tEb2N1bWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJU0NNU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvc2NtL2NvbW1vbi9zY20uanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTdWJzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL2FnZW50U3Vic2NyaXB0aW9uLmpzJztcbmltcG9ydCB7IFN0YXRlQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9hZ2VudHNWb2ljZS9icm93c2VyL3ZvaWNlTW9kZU9uYm9hcmRpbmcuanMnO1xuaW1wb3J0IHsgSUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSwgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRQZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFBldFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRPdXRwdXRSZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0T3V0cHV0SXRlbVJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9lZGl0VGVsZW1ldHJ5L2Jyb3dzZXIvdGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeS9haUVkaXRUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRTdWdnZXN0aW9uSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0QXR0YWNobWVudFdpZGdldFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRleHRQaWNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRDb250ZXh0UGlja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NvbnRleHRDb250cmliL2NoYXRDb250ZXh0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvc3BlZWNoVG9UZXh0L2RpY3RhdGlvbk9uYm9hcmRpbmcuanMnO1xuaW1wb3J0IHsgQ2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZSwgSUNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi93aWRnZXQvY2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdE1vZGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL21vY2tDaGF0TW9kZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRTZXJ2aWNlLCBJQ2hhdEFnZW50LCBJQ2hhdEFnZW50TmFtZVNlcnZpY2UsIElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvdGVzdC9jb21tb24vY2hhdFNlcnZpY2UvbW9ja0NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBcnRpZmFjdFNvdXJjZUdyb3VwLCBJQ2hhdEFydGlmYWN0cywgSUNoYXRBcnRpZmFjdHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9jaGF0QXJ0aWZhY3RzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvZG8sIElDaGF0VG9kb0xpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9jaGF0VG9kb0xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL3Rvb2xzL2NoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VSZWdpc3RyYXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMgfSBmcm9tICcuLi9maXh0dXJlVXRpbHMuanMnO1xuXG4vKipcbiAqIEEgbWluaW1hbCBJTWVudVNlcnZpY2UgaW1wbGVtZW50YXRpb24gYmFja2VkIGJ5IGFuIGluLW1lbW9yeSBtYXAuIFRlc3RzIGNhblxuICogcmVnaXN0ZXIgbWVudSBpdGVtcyB3aXRoIGFkZEl0ZW0oKSBiZWZvcmUgdGhlIGNvbXBvbmVudCByZW5kZXJzIHRoZSBtZW51LlxuICovXG5leHBvcnQgY2xhc3MgRml4dHVyZU1lbnVTZXJ2aWNlIGltcGxlbWVudHMgSU1lbnVTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1zID0gbmV3IE1hcDxzdHJpbmcsIElNZW51SXRlbVtdPigpO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHQpIHsgfVxuXHRhZGRJdGVtKG1lbnVJZDogTWVudUlkLCBpdGVtOiBJTWVudUl0ZW0pOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBtZW51SWQuaWQ7XG5cdFx0bGV0IGl0ZW1zID0gdGhpcy5faXRlbXMuZ2V0KGtleSk7XG5cdFx0aWYgKCFpdGVtcykge1xuXHRcdFx0aXRlbXMgPSBbXTtcblx0XHRcdHRoaXMuX2l0ZW1zLnNldChrZXksIGl0ZW1zKTtcblx0XHR9XG5cdFx0aXRlbXMucHVzaChpdGVtKTtcblx0fVxuXHRjcmVhdGVNZW51KGlkOiBNZW51SWQpOiBJTWVudSB7XG5cdFx0Y29uc3QgYWN0aW9uczogW3N0cmluZywgTWVudUl0ZW1BY3Rpb25bXV1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLl9pdGVtcy5nZXQoaWQuaWQpID8/IFtdKSB7XG5cdFx0XHRjb25zdCBncm91cCA9IGl0ZW0uZ3JvdXAgPz8gJyc7XG5cdFx0XHRsZXQgZW50cnkgPSBhY3Rpb25zLmZpbmQoYSA9PiBhWzBdID09PSBncm91cCk7XG5cdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdGVudHJ5ID0gW2dyb3VwLCBbXV07XG5cdFx0XHRcdGFjdGlvbnMucHVzaChlbnRyeSk7XG5cdFx0XHR9XG5cdFx0XHRlbnRyeVsxXS5wdXNoKG5ldyBNZW51SXRlbUFjdGlvbihpdGVtLmNvbW1hbmQsIGl0ZW0uYWx0LCB7fSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9jb21tYW5kU2VydmljZSkpO1xuXHRcdH1cblx0XHRyZXR1cm4geyBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSwgZGlzcG9zZSgpIHsgfSwgZ2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyB9O1xuXHR9XG5cdGdldE1lbnVBY3Rpb25zKCkgeyByZXR1cm4gW107IH1cblx0Z2V0TWVudUNvbnRleHRzKCkgeyByZXR1cm4gbmV3IFNldDxzdHJpbmc+KCk7IH1cblx0cmVzZXRIaWRkZW5TdGF0ZXMoKSB7IH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEZpeHR1cmVTZXJ2aWNlc09wdGlvbnMge1xuXHQvKiogT2JzZXJ2YWJsZSBiYWNraW5nIElDaGF0QXJ0aWZhY3RzU2VydmljZS5nZXRBcnRpZmFjdHMoKS5hcnRpZmFjdEdyb3Vwcy4gKi9cblx0cmVhZG9ubHkgYXJ0aWZhY3RHcm91cHM/OiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQXJ0aWZhY3RTb3VyY2VHcm91cFtdPjtcblx0LyoqIEluaXRpYWwgdG9kb3MgcmV0dXJuZWQgZnJvbSBJQ2hhdFRvZG9MaXN0U2VydmljZS5nZXRUb2RvcygpLiAqL1xuXHRyZWFkb25seSB0b2Rvcz86IHJlYWRvbmx5IElDaGF0VG9kb1tdO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVycyB0aGUgd2lkZSBzZXQgb2Ygc2VydmljZSBtb2NrcyBuZWVkZWQgdG8gaW5zdGFudGlhdGUgY2hhdCB3aWRnZXRzXG4gKiAoaW5wdXQgcGFydCwgbGlzdCB3aWRnZXQsIGNvbnRlbnQgcGFydHMpLiBBbGwgb2YgdGhlc2UgYXJlIG5vLW9wIG1vY2tzXG4gKiBzdWl0YWJsZSBmb3IgZml4dHVyZXMuXG4gKlxuICogQ2FsbGVycyBjYW4gb3ZlcnJpZGUgYW55IHNlcnZpY2UgYnkgcmVnaXN0ZXJpbmcgaXQgYWdhaW4gYWZ0ZXIgdGhpcyBjYWxsLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDaGF0Rml4dHVyZVNlcnZpY2VzKHJlZzogU2VydmljZVJlZ2lzdHJhdGlvbiwgb3B0aW9uczogSUNoYXRGaXh0dXJlU2VydmljZXNPcHRpb25zID0ge30pOiB2b2lkIHtcblx0cmVnaXN0ZXJXb3JrYmVuY2hTZXJ2aWNlcyhyZWcpO1xuXHRyZWcuZGVmaW5lKElNZW51U2VydmljZSwgRml4dHVyZU1lbnVTZXJ2aWNlKTtcblx0cmVnLmRlZmluZShJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIE1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlKTtcblx0cmVnLmRlZmluZShJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlKTtcblxuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSURlY29yYXRpb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRGVjb3JhdGlvbnNTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgb25EaWRDaGFuZ2VEZWNvcmF0aW9ucyA9IEV2ZW50Lk5vbmU7IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQnJvd3NlclZpZXdzID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSBnZXRLbm93bkJyb3dzZXJWaWV3cygpIHsgcmV0dXJuIG5ldyBNYXAoKTsgfVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSVRleHRGaWxlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGV4dEZpbGVTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgcmVhZG9ubHkgdW50aXRsZWQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXh0RmlsZVNlcnZpY2VbJ3VudGl0bGVkJ10+KCkgeyBvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUxhYmVsID0gRXZlbnQuTm9uZTsgfSgpOyB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUZpbGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElGaWxlU2VydmljZT4oKSB7IG92ZXJyaWRlIG9uRGlkRmlsZXNDaGFuZ2UgPSBFdmVudC5Ob25lOyBvdmVycmlkZSBvbkRpZFJ1bk9wZXJhdGlvbiA9IEV2ZW50Lk5vbmU7IG92ZXJyaWRlIGhhc1Byb3ZpZGVyKCkgeyByZXR1cm4gZmFsc2U7IH0gfSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElFZGl0b3JTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UgPSBFdmVudC5Ob25lOyB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUV4dGVuc2lvblNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dGVuc2lvblNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUV4dGVuc2lvbnMgPSBFdmVudC5Ob25lOyB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSVBhdGhTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQYXRoU2VydmljZT4oKSB7IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgYXN5bmMgZ2V0Q3VycmVudEV4cGVyaW1lbnRzKCkgeyByZXR1cm4gW107IH0gb3ZlcnJpZGUgYXN5bmMgZ2V0VHJlYXRtZW50KCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9IG92ZXJyaWRlIG9uRGlkUmVmZXRjaEFzc2lnbm1lbnRzID0gRXZlbnQuTm9uZTsgfSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U+KCkgeyBvdmVycmlkZSBvbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMgPSBFdmVudC5Ob25lOyBvdmVycmlkZSBnZXRXb3Jrc3BhY2UoKTogSVdvcmtzcGFjZSB7IHJldHVybiB7IGlkOiAnJywgZm9sZGVyczogW10sIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCB9OyB9IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya2JlbmNoTGF5b3V0U2VydmljZT4oKSB7IG92ZXJyaWRlIG9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkgPSBFdmVudC5Ob25lOyBvdmVycmlkZSBvbkRpZENoYW5nZVdpbmRvd01heGltaXplZCA9IEV2ZW50Lk5vbmU7IG92ZXJyaWRlIGlzVmlzaWJsZSgpIHsgcmV0dXJuIHRydWU7IH0gfSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZpZXdEZXNjcmlwdG9yU2VydmljZT4oKSB7IG92ZXJyaWRlIG9uRGlkQ2hhbmdlTG9jYXRpb24gPSBFdmVudC5Ob25lOyB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va0RvY3VtZW50U2VydmljZT4oKSB7IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJU0NNU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU0NNU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBZGRSZXBvc2l0b3J5ID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFJlbW92ZVJlcG9zaXRvcnkgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlcG9zaXRvcmllcyA9IFtdO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlcG9zaXRvcnlDb3VudCA9IDA7XG5cdH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJRmlsZURpYWxvZ1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVEaWFsb2dTZXJ2aWNlPigpIHsgfSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElQcm9kdWN0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUHJvZHVjdFNlcnZpY2U+KCkgeyB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSVVwZGF0ZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVVwZGF0ZVNlcnZpY2U+KCkgeyBvdmVycmlkZSBvblN0YXRlQ2hhbmdlID0gRXZlbnQuTm9uZTsgb3ZlcnJpZGUgZ2V0IHN0YXRlKCkgeyByZXR1cm4geyB0eXBlOiBTdGF0ZVR5cGUuVW5pbml0aWFsaXplZCBhcyBjb25zdCB9OyB9IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJVXJpSWRlbnRpdHlTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVcmlJZGVudGl0eVNlcnZpY2U+KCkgeyB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFjdGlvbldpZGdldFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjdGlvbldpZGdldFNlcnZpY2U+KCkgeyBvdmVycmlkZSBzaG93KCkgeyB9IG92ZXJyaWRlIGhpZGUoKSB7IH0gb3ZlcnJpZGUgZ2V0IGlzVmlzaWJsZSgpIHsgcmV0dXJuIGZhbHNlOyB9IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJU2hhcmVkV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNoYXJlZFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlPigpIHsgfSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElBY2Nlc3NpYmxlVmlld1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjY2Vzc2libGVWaWV3U2VydmljZT4oKSB7IG92ZXJyaWRlIGdldE9wZW5BcmlhSGludCgpIHsgcmV0dXJuIG51bGw7IH0gfSgpKTtcblxuXHQvLyBDaGF0IHNlcnZpY2VzXG5cdHJlZy5kZWZpbmUoSUNoYXRBZ2VudFNlcnZpY2UsIGNsYXNzIEZpeHR1cmVDaGF0QWdlbnRTZXJ2aWNlIGV4dGVuZHMgQ2hhdEFnZW50U2VydmljZSB7XG5cdFx0b3ZlcnJpZGUgZ2V0RGVmYXVsdEFnZW50KCk6IElDaGF0QWdlbnQge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdFx0cmV0dXJuIHsgZnVsbE5hbWU6ICdHaXRIdWIgQ29waWxvdCcsIGlkOiAnZ2l0aHViQ29waWxvdCcgfSBhcyB1bmtub3duIGFzIElDaGF0QWdlbnQ7XG5cdFx0fVxuXHR9KTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0QWdlbnROYW1lU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEFnZW50TmFtZVNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGdldEFnZW50TmFtZVJlc3RyaWN0aW9uKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lKElDaGF0U2VydmljZSwgTW9ja0NoYXRTZXJ2aWNlKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0UGV0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFBldFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGVuYWJsZWQgPSBvYnNlcnZhYmxlVmFsdWUoJ2NoYXRQZXRFbmFibGVkJywgZmFsc2UpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHZhcmlhbnQgPSBvYnNlcnZhYmxlVmFsdWUoJ2NoYXRQZXRWYXJpYW50JywgJ3N0YWJsZScgYXMgY29uc3QpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uVGhlUnVuID0gb2JzZXJ2YWJsZVZhbHVlKCdjaGF0UGV0T25UaGVSdW4nLCBmYWxzZSk7XG5cdFx0b3ZlcnJpZGUgdG9nZ2xlKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRvdmVycmlkZSBzZXRWYXJpYW50KCkgeyB9XG5cdFx0b3ZlcnJpZGUgc2V0T25UaGVSdW4oKSB7IH1cblx0fSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFdpZGdldFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxhc3RGb2N1c2VkV2lkZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQWRkV2lkZ2V0ID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZEJhY2tncm91bmRTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZvY3VzZWRXaWRnZXQgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRm9jdXNlZFNlc3Npb24gPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGdldEFsbFdpZGdldHMoKTogcmVhZG9ubHkgSUNoYXRXaWRnZXRbXSB7IHJldHVybiBbXTsgfVxuXHRcdG92ZXJyaWRlIGdldFdpZGdldEJ5SW5wdXRVcmkoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRvdmVycmlkZSBnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZSgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdG92ZXJyaWRlIGdldFdpZGdldHNCeUxvY2F0aW9ucygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0b3ZlcnJpZGUgcmVnaXN0ZXIoKSB7IHJldHVybiB7IGRpc3Bvc2UoKSB7IH0gfTsgfVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEFjY2Vzc2liaWxpdHlTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBhY2NlcHRSZXF1ZXN0KCkgeyB9XG5cdFx0b3ZlcnJpZGUgZGlzcG9zZVJlcXVlc3QoKSB7IH1cblx0XHRvdmVycmlkZSBhY2NlcHRSZXNwb25zZSgpIHsgfVxuXHRcdG92ZXJyaWRlIGFjY2VwdEVsaWNpdGF0aW9uKCkgeyB9XG5cdH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJRGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SURpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBpc1Zpc2libGUgPSBmYWxzZTtcblx0XHRvdmVycmlkZSByZWdpc3Rlckhvc3QoKSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblx0fSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzVmlzaWJsZSA9IGZhbHNlO1xuXHRcdG92ZXJyaWRlIHJlZ2lzdGVySG9zdCgpIHsgcmV0dXJuIERpc3Bvc2FibGUuTm9uZTsgfVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBpc0V4dGVuc2lvbkRldmVsb3BtZW50ID0gZmFsc2U7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNCdWlsdCA9IHRydWU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNTZXNzaW9uc1dpbmRvdyA9IGZhbHNlO1xuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGdldEFsbENoYXRTZXNzaW9uQ29udHJpYnV0aW9ucygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uT3B0aW9ucyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VPcHRpb25Hcm91cHMgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXZhaWxhYmlsaXR5ID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSBnZXRDdXN0b21BZ2VudFRhcmdldEZvclNlc3Npb25UeXBlKCkgeyByZXR1cm4gVGFyZ2V0LlVuZGVmaW5lZDsgfVxuXHRcdG92ZXJyaWRlIHJlcXVpcmVzQ3VzdG9tTW9kZWxzRm9yU2Vzc2lvblR5cGUoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdG92ZXJyaWRlIHN1cHBvcnRzQXV0b01vZGVsRm9yU2Vzc2lvblR5cGUoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdG92ZXJyaWRlIGdldE9wdGlvbkdyb3Vwc0ZvclNlc3Npb25UeXBlKCkgeyByZXR1cm4gW107IH1cblx0XHRvdmVycmlkZSBzdXBwb3J0c0RlbGVnYXRpb25Gb3JTZXNzaW9uVHlwZSgpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbk9wdGlvbigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdG92ZXJyaWRlIGdldENhcGFiaWxpdGllc0ZvclNlc3Npb25UeXBlKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdEVudGl0bGVtZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEVudGl0bGVtZW50U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcXVvdGFzID0ge307XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VRdW90YVJlbWFpbmluZyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VVc2FnZUJhc2VkQmlsbGluZyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VFbnRpdGxlbWVudCA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTZW50aW1lbnQgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQW5vbnltb3VzID0gRXZlbnQuTm9uZTtcblx0XHQvLyBBIHNpZ25lZC1pbiwgc2V0LXVwIHVzZXIgc28gdGhlIHBpY2tlciByZW5kZXJzIG5vcm1hbGx5IChubyBSZXN0cmljdGVkIC9cblx0XHQvLyBTaWduIEluIHN0YXRlKSBpbiBmaXh0dXJlcy5cblx0XHRvdmVycmlkZSByZWFkb25seSBlbnRpdGxlbWVudCA9IENoYXRFbnRpdGxlbWVudC5Qcm87XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2VudGltZW50ID0geyBjb21wbGV0ZWQ6IHRydWUsIGluc3RhbGxlZDogdHJ1ZSB9O1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFub255bW91cyA9IGZhbHNlO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGhhc0J5b2tNb2RlbHMgPSBmYWxzZTtcblx0fSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0TW9kZVNlcnZpY2UsIG5ldyBNb2NrQ2hhdE1vZGVTZXJ2aWNlKCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyA9IEV2ZW50Lk5vbmU7IG92ZXJyaWRlIG9uRGlkQ2hhbmdlTW9kZWxWaXNpYmlsaXR5ID0gRXZlbnQuTm9uZTsgb3ZlcnJpZGUgZ2V0TGFuZ3VhZ2VNb2RlbElkcygpIHsgcmV0dXJuIFtdOyB9IG92ZXJyaWRlIGdldFZlbmRvcnMoKSB7IHJldHVybiBbXTsgfSBvdmVycmlkZSBoYXNSZXNvbHZlZFZlbmRvcigpIHsgcmV0dXJuIGZhbHNlOyB9IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZT4oKSB7IG92ZXJyaWRlIG9uRGlkQ2hhbmdlVG9vbHMgPSBFdmVudC5Ob25lOyBvdmVycmlkZSBvbkRpZFByZXBhcmVUb29sQ2FsbEJlY29tZVVucmVzcG9uc2l2ZSA9IEV2ZW50Lk5vbmU7IG92ZXJyaWRlIGdldFRvb2xzKCkgeyByZXR1cm4gW107IH0gfSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGlzRW5hYmxlZCgpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0Q2FjaGVkKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgYXNzZXNzKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdENvbnRleHRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0Q29udGV4dFNlcnZpY2U+KCkgeyB9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRDb250ZXh0UGlja1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRDb250ZXh0UGlja1NlcnZpY2U+KCkgeyB9KCkpO1xuXHQvLyBOZWVkZWQgd2hlbmV2ZXIgY2hhdCBtYXJrZG93biBjb250YWlucyBhIGNvZGUgYmxvY2s7IHJldHVybnMgbm8gY3VzdG9tIHJlbmRlcmVyIHNvXG5cdC8vIGNvZGUgYmxvY2tzIGZhbGwgYmFjayB0byB0aGUgbm9ybWFsIGVkaXRvci1iYWNrZWQgQ29kZUJsb2NrUGFydC5cblx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0T3V0cHV0UmVuZGVyZXJTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0T3V0cHV0UmVuZGVyZXJTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBoYXNDb2RlQmxvY2tSZW5kZXJlcigpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdH0oKSk7XG5cdC8vIENoYXQgY29kZSBibG9ja3MgZ2VuZXJhdGUgYSBzdWdnZXN0aW9uIGlkIGZvciBlZGl0IHRlbGVtZXRyeSB3aGVuIHRoZSByZXNwb25zZSBjb21wbGV0ZXMuXG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQWlFZGl0VGVsZW1ldHJ5U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWlFZGl0VGVsZW1ldHJ5U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgY3JlYXRlU3VnZ2VzdGlvbklkKCkgeyByZXR1cm4gRWRpdFN1Z2dlc3Rpb25JZC5uZXdJZCgpOyB9XG5cdH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeT4oKSB7IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZT4oKSB7IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2U+KCkgeyBvdmVycmlkZSBnZXRIaXN0b3J5KCkgeyByZXR1cm4gW107IH0gb3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VIaXN0b3J5ID0gRXZlbnQuTm9uZTsgfSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRJbWFnZUNhcm91c2VsU2VydmljZT4oKSB7IH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZT4oKSB7IG92ZXJyaWRlIHJlZ2lzdGVyKCkgeyByZXR1cm4geyBkaXNwb3NlKCkgeyB9IH07IH0gfSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgZ2V0QWN0aXZlTm90aWZpY2F0aW9uKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0b3ZlcnJpZGUgYW5ub3VuY2VSZW5kZXJlZCgpIHsgfVxuXHR9KCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UsIG5ldyBDaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlKCkpO1xuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFNlc3Npb25zU2VydmljZVsnbW9kZWwnXT4oKSB7IG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbnMgPSBFdmVudC5Ob25lOyB9KCk7XG5cdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHR9KCkpO1xuXHQvLyBBZ2VudC1ob3N0IGNoYXQgd2lkZ2V0cyAoZS5nLiB0aGUgdHVybiBjaGFuZ2VzIHN1bW1hcnkgZml4dHVyZXMpIGNyZWF0ZSB0aGVcblx0Ly8gZ2VuZXJpYyBjb25maWcgY2hpcHMgbGFuZSwgd2hpY2ggb3BlbnMgYSBzZXNzaW9uIHN1YnNjcmlwdGlvbi4gUmV0dXJuIGFuXG5cdC8vIGluZXJ0LCBuZXZlci1oeWRyYXRpbmcgc3Vic2NyaXB0aW9uICh2YWx1ZSBgdW5kZWZpbmVkYCkgc28gbm8gY29uZmlnIGNoaXBzXG5cdC8vIHJlbmRlciBhbmQgbm90aGluZyBjcmFzaGVzLlxuXHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50SG9zdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50SG9zdFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGdldFN1YnNjcmlwdGlvbjxUPihfa2luZDogU3RhdGVDb21wb25lbnRzLCBfcmVzb3VyY2U6IFVSSSk6IElSZWZlcmVuY2U8SUFnZW50U3Vic2NyaXB0aW9uPFQ+PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRvYmplY3Q6IHtcblx0XHRcdFx0XHR2YWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHZlcmlmaWVkVmFsdWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRvbldpbGxBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRvbkRpZEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRvdmVycmlkZSBnZXRTdWJzY3JpcHRpb25Vbm1hbmFnZWQ8VD4oX2tpbmQ6IFN0YXRlQ29tcG9uZW50cywgX3Jlc291cmNlOiBVUkkpOiBJQWdlbnRTdWJzY3JpcHRpb248VD4gfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSBnZXQoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0fSgpKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyPigpIHtcblx0XHRvdmVycmlkZSByZXNvbHZlKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZvbGRlciA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgZ2V0Rm9sZGVyKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdH0oKSk7XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBlbmFibGVkID0gY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblx0fSgpKTtcblxuXHRjb25zdCBhcnRpZmFjdEdyb3VwcyA9IG9wdGlvbnMuYXJ0aWZhY3RHcm91cHMgPz8gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBcnRpZmFjdFNvdXJjZUdyb3VwW10+KCdhcnRpZmFjdEdyb3VwcycsIFtdKTtcblx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0QXJ0aWZhY3RzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEFydGlmYWN0c1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGdldEFydGlmYWN0cygpOiBJQ2hhdEFydGlmYWN0cyB7XG5cdFx0XHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEFydGlmYWN0cz4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFydGlmYWN0R3JvdXBzID0gYXJ0aWZhY3RHcm91cHM7XG5cdFx0XHRcdG92ZXJyaWRlIHNldEFnZW50QXJ0aWZhY3RzKCkgeyB9XG5cdFx0XHRcdG92ZXJyaWRlIGNsZWFyQWdlbnRBcnRpZmFjdHMoKSB7IH1cblx0XHRcdFx0b3ZlcnJpZGUgY2xlYXJTdWJhZ2VudEFydGlmYWN0cygpIHsgfVxuXHRcdFx0XHRvdmVycmlkZSBtaWdyYXRlKCkgeyB9XG5cdFx0XHR9KCk7XG5cdFx0fVxuXHR9KCkpO1xuXG5cdGNvbnN0IHRvZG9zID0gWy4uLihvcHRpb25zLnRvZG9zID8/IFtdKV07XG5cdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhdFRvZG9MaXN0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFRvZG9MaXN0U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRVcGRhdGVUb2RvcyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgZ2V0VG9kb3MoKSB7IHJldHVybiBbLi4udG9kb3NdOyB9XG5cdFx0b3ZlcnJpZGUgc2V0VG9kb3MoKSB7IH1cblx0XHRvdmVycmlkZSBtaWdyYXRlVG9kb3MoKSB7IH1cblx0fSgpKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQThCO0FBQ3ZDLFNBQVMsaUJBQThCLHVCQUF1QjtBQUU5RCxTQUFTLFlBQVk7QUFDckIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBMkIsY0FBc0Isc0JBQXNCO0FBQ3ZFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsY0FBYyxtQkFBbUI7QUFDMUMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0IsaUJBQWlCO0FBQzFDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsMEJBQTBCLCtCQUErQjtBQUNsRSxTQUFxQixnQ0FBZ0M7QUFDckQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxpQkFBaUIsK0JBQStCO0FBQ3pELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUNBQW1DO0FBRzVDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbURBQW1EO0FBQzVELFNBQVMsaURBQWlEO0FBQzFE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
