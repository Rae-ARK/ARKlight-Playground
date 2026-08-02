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
import "./media/extensionsViewlet.css";
import { localize, localize2 } from "../../../../nls.js";
import { timeout, Delayer } from "../../../../base/common/async.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { createErrorWithActions } from "../../../../base/common/errorMessage.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Event } from "../../../../base/common/event.js";
import { Action } from "../../../../base/common/actions.js";
import { append, $, Dimension, hide, show, DragAndDropObserver, trackFocus, addDisposableListener, EventType, clearNode } from "../../../../base/browser/dom.js";
import { renderMarkdown, renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { isMarkdownString } from "../../../../base/common/htmlContent.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IExtensionsWorkbenchService, VIEWLET_ID, CloseExtensionDetailsOnViewChangeKey, INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID, WORKSPACE_RECOMMENDATIONS_VIEW_ID, AutoCheckUpdatesConfigurationKey, OUTDATED_EXTENSIONS_VIEW_ID, CONTEXT_HAS_GALLERY, extensionsSearchActionsMenu, AutoRestartConfigurationKey, ExtensionRuntimeActionType, SearchMcpServersContext, SearchAgentPluginsContext, DefaultViewsContext, CONTEXT_EXTENSIONS_GALLERY_STATUS } from "../common/extensions.js";
import { InstallLocalExtensionsInRemoteAction, InstallRemoteExtensionsInLocalAction } from "./extensionsActions.js";
import { IExtensionManagementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IWorkbenchExtensionEnablementService, IExtensionManagementServerService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { ExtensionsInput } from "../common/extensionsInput.js";
import { ExtensionsListView, EnabledExtensionsView, DisabledExtensionsView, RecommendedExtensionsView, WorkspaceRecommendedExtensionsView, ServerInstalledExtensionsView, DefaultRecommendedExtensionsView, UntrustedWorkspaceUnsupportedExtensionsView, UntrustedWorkspacePartiallySupportedExtensionsView, VirtualWorkspaceUnsupportedExtensionsView, VirtualWorkspacePartiallySupportedExtensionsView, DefaultPopularExtensionsView, DeprecatedExtensionsView, SearchMarketplaceExtensionsView, RecentlyUpdatedExtensionsView, OutdatedExtensionsView, StaticQueryExtensionsView, NONE_CATEGORY, AbstractExtensionsListView } from "./extensionsViews.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import Severity from "../../../../base/common/severity.js";
import { IActivityService, NumberBadge, WarningBadge } from "../../../services/activity/common/activity.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions, IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IContextKeyService, ContextKeyExpr, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService, NotificationPriority } from "../../../../platform/notification/common/notification.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { Query } from "../common/extensionQuery.js";
import { SuggestEnabledInput } from "../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { EXTENSION_CATEGORIES } from "../../../../platform/extensions/common/extensions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { SIDE_BAR_DRAG_AND_DROP_BACKGROUND } from "../../../common/theme.js";
import { VirtualWorkspaceContext, WorkbenchStateContext } from "../../../common/contextkeys.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { installLocalInRemoteIcon } from "./extensionsIcons.js";
import { registerAction2, Action2, MenuId } from "../../../../platform/actions/common/actions.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { extractEditorsAndFilesDropData } from "../../../../platform/dnd/browser/dnd.js";
import { extname } from "../../../../base/common/resources.js";
import { registerNavigableContainer } from "../../../browser/actions/widgetNavigationCommands.js";
import { MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { SeverityIcon } from "../../../../base/browser/ui/severityIcon/severityIcon.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { IExtensionGalleryManifestService, ExtensionGalleryManifestStatus } from "../../../../platform/extensionManagement/common/extensionGalleryManifest.js";
import { URI } from "../../../../base/common/uri.js";
import { DEFAULT_ACCOUNT_SIGN_IN_COMMAND } from "../../../services/accounts/browser/defaultAccount.js";
const ExtensionsSortByContext = new RawContextKey("extensionsSortByValue", "");
const SearchMarketplaceExtensionsContext = new RawContextKey("searchMarketplaceExtensions", false);
const SearchHasTextContext = new RawContextKey("extensionSearchHasText", false);
const InstalledExtensionsContext = new RawContextKey("installedExtensions", false);
const SearchInstalledExtensionsContext = new RawContextKey("searchInstalledExtensions", false);
const SearchRecentlyUpdatedExtensionsContext = new RawContextKey("searchRecentlyUpdatedExtensions", false);
const SearchExtensionUpdatesContext = new RawContextKey("searchExtensionUpdates", false);
const SearchOutdatedExtensionsContext = new RawContextKey("searchOutdatedExtensions", false);
const SearchEnabledExtensionsContext = new RawContextKey("searchEnabledExtensions", false);
const SearchDisabledExtensionsContext = new RawContextKey("searchDisabledExtensions", false);
const HasInstalledExtensionsContext = new RawContextKey("hasInstalledExtensions", true);
const BuiltInExtensionsContext = new RawContextKey("builtInExtensions", false);
const SearchBuiltInExtensionsContext = new RawContextKey("searchBuiltInExtensions", false);
const SearchUnsupportedWorkspaceExtensionsContext = new RawContextKey("searchUnsupportedWorkspaceExtensions", false);
const SearchDeprecatedExtensionsContext = new RawContextKey("searchDeprecatedExtensions", false);
const SearchRestartRequiredExtensionsContext = new RawContextKey("searchRestartRequiredExtensions", false);
const RecommendedExtensionsContext = new RawContextKey("recommendedExtensions", false);
const SortByUpdateDateContext = new RawContextKey("sortByUpdateDate", false);
const ExtensionsSearchValueContext = new RawContextKey("extensionsSearchValue", "");
const REMOTE_CATEGORY = localize2({ key: "remote", comment: ["Remote as in remote machine"] }, "Remote");
let ExtensionsViewletViewsContribution = class extends Disposable {
  constructor(extensionManagementServerService, labelService, contextKeyService) {
    super();
    this.extensionManagementServerService = extensionManagementServerService;
    this.labelService = labelService;
    this.contextKeyService = contextKeyService;
    this.container = Registry.as(Extensions.ViewContainersRegistry).get(VIEWLET_ID);
    this.registerViews();
  }
  registerViews() {
    const viewDescriptors = [];
    viewDescriptors.push(...this.createDefaultExtensionsViewDescriptors());
    viewDescriptors.push(...this.createSearchExtensionsViewDescriptors());
    viewDescriptors.push(...this.createRecommendedExtensionsViewDescriptors());
    viewDescriptors.push(...this.createBuiltinExtensionsViewDescriptors());
    viewDescriptors.push(...this.createUnsupportedWorkspaceExtensionsViewDescriptors());
    viewDescriptors.push(...this.createOtherLocalFilteredExtensionsViewDescriptors());
    viewDescriptors.push({
      id: "workbench.views.extensions.marketplaceAccess",
      name: localize2("marketPlace", "Marketplace"),
      ctorDescriptor: new SyncDescriptor(class extends ViewPane {
        shouldShowWelcome() {
          return true;
        }
      }),
      when: ContextKeyExpr.and(
        ContextKeyExpr.or(
          ContextKeyExpr.has("searchMarketplaceExtensions"),
          ContextKeyExpr.and(DefaultViewsContext)
        ),
        ContextKeyExpr.or(CONTEXT_EXTENSIONS_GALLERY_STATUS.isEqualTo(ExtensionGalleryManifestStatus.RequiresSignIn), CONTEXT_EXTENSIONS_GALLERY_STATUS.isEqualTo(ExtensionGalleryManifestStatus.AccessDenied))
      ),
      order: -1
    });
    const viewRegistry = Registry.as(Extensions.ViewsRegistry);
    viewRegistry.registerViews(viewDescriptors, this.container);
    viewRegistry.registerViewWelcomeContent("workbench.views.extensions.marketplaceAccess", {
      content: localize("sign in", "[Sign in to access Extensions Marketplace]({0})", `command:${DEFAULT_ACCOUNT_SIGN_IN_COMMAND}`),
      when: CONTEXT_EXTENSIONS_GALLERY_STATUS.isEqualTo(ExtensionGalleryManifestStatus.RequiresSignIn)
    });
    viewRegistry.registerViewWelcomeContent("workbench.views.extensions.marketplaceAccess", {
      content: localize("access denied", "Your account does not have access to the Extensions Marketplace. Please contact your administrator."),
      when: CONTEXT_EXTENSIONS_GALLERY_STATUS.isEqualTo(ExtensionGalleryManifestStatus.AccessDenied)
    });
  }
  createDefaultExtensionsViewDescriptors() {
    const viewDescriptors = [];
    const servers = [];
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      servers.push(this.extensionManagementServerService.localExtensionManagementServer);
    }
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      servers.push(this.extensionManagementServerService.remoteExtensionManagementServer);
    }
    if (this.extensionManagementServerService.webExtensionManagementServer) {
      servers.push(this.extensionManagementServerService.webExtensionManagementServer);
    }
    const getViewName = (viewTitle, server) => {
      return servers.length > 1 ? `${server.label} - ${viewTitle}` : viewTitle;
    };
    let installedWebExtensionsContextChangeEvent = Event.None;
    if (this.extensionManagementServerService.webExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
      const interestingContextKeys = /* @__PURE__ */ new Set();
      interestingContextKeys.add("hasInstalledWebExtensions");
      installedWebExtensionsContextChangeEvent = Event.filter(this.contextKeyService.onDidChangeContext, (e) => e.affectsSome(interestingContextKeys));
    }
    const serverLabelChangeEvent = Event.any(this.labelService.onDidChangeFormatters, installedWebExtensionsContextChangeEvent);
    for (const server of servers) {
      const getInstalledViewName = () => getViewName(localize("installed", "Installed"), server);
      const onDidChangeTitle = Event.map(serverLabelChangeEvent, () => getInstalledViewName());
      const id = servers.length > 1 ? `workbench.views.extensions.${server.id}.installed` : `workbench.views.extensions.installed`;
      viewDescriptors.push({
        id,
        get name() {
          return {
            value: getInstalledViewName(),
            original: getViewName("Installed", server)
          };
        },
        weight: 100,
        order: 1,
        when: ContextKeyExpr.and(DefaultViewsContext),
        ctorDescriptor: new SyncDescriptor(ServerInstalledExtensionsView, [{ server, flexibleHeight: true, onDidChangeTitle }]),
        /* Installed extensions views shall not be allowed to hidden when there are more than one server */
        canToggleVisibility: servers.length === 1
      });
      if (server === this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManagementServerService.localExtensionManagementServer) {
        this._register(registerAction2(class InstallLocalExtensionsInRemoteAction2 extends Action2 {
          constructor() {
            super({
              id: "workbench.extensions.installLocalExtensions",
              get title() {
                return localize2("select and install local extensions", "Install Local Extensions in '{0}'...", server.label);
              },
              category: REMOTE_CATEGORY,
              icon: installLocalInRemoteIcon,
              f1: true,
              menu: {
                id: MenuId.ViewTitle,
                when: ContextKeyExpr.equals("view", id),
                group: "navigation"
              }
            });
          }
          run(accessor) {
            return accessor.get(IInstantiationService).createInstance(InstallLocalExtensionsInRemoteAction).run();
          }
        }));
      }
    }
    if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
      this._register(registerAction2(class InstallRemoteExtensionsInLocalAction2 extends Action2 {
        constructor() {
          super({
            id: "workbench.extensions.actions.installLocalExtensionsInRemote",
            title: localize2("install remote in local", "Install Remote Extensions Locally..."),
            category: REMOTE_CATEGORY,
            f1: true
          });
        }
        run(accessor) {
          return accessor.get(IInstantiationService).createInstance(InstallRemoteExtensionsInLocalAction, "workbench.extensions.actions.installLocalExtensionsInRemote").run();
        }
      }));
    }
    viewDescriptors.push({
      id: "workbench.views.extensions.popular",
      name: localize2("popularExtensions", "Popular"),
      ctorDescriptor: new SyncDescriptor(DefaultPopularExtensionsView, [{ hideBadge: true }]),
      when: ContextKeyExpr.and(DefaultViewsContext, ContextKeyExpr.not("hasInstalledExtensions"), CONTEXT_HAS_GALLERY),
      weight: 60,
      order: 2,
      canToggleVisibility: false
    });
    viewDescriptors.push({
      id: "extensions.recommendedList",
      name: localize2("recommendedExtensions", "Recommended"),
      ctorDescriptor: new SyncDescriptor(DefaultRecommendedExtensionsView, [{ flexibleHeight: true }]),
      when: ContextKeyExpr.and(DefaultViewsContext, SortByUpdateDateContext.negate(), ContextKeyExpr.not("config.extensions.showRecommendationsOnlyOnDemand"), CONTEXT_HAS_GALLERY),
      weight: 40,
      order: 3,
      canToggleVisibility: true
    });
    if (servers.length === 1) {
      viewDescriptors.push({
        id: "workbench.views.extensions.enabled",
        name: localize2("enabledExtensions", "Enabled"),
        ctorDescriptor: new SyncDescriptor(EnabledExtensionsView, [{}]),
        when: ContextKeyExpr.and(DefaultViewsContext, ContextKeyExpr.has("hasInstalledExtensions")),
        hideByDefault: true,
        weight: 40,
        order: 4,
        canToggleVisibility: true
      });
      viewDescriptors.push({
        id: "workbench.views.extensions.disabled",
        name: localize2("disabledExtensions", "Disabled"),
        ctorDescriptor: new SyncDescriptor(DisabledExtensionsView, [{}]),
        when: ContextKeyExpr.and(DefaultViewsContext, ContextKeyExpr.has("hasInstalledExtensions")),
        hideByDefault: true,
        weight: 10,
        order: 5,
        canToggleVisibility: true
      });
    }
    return viewDescriptors;
  }
  createSearchExtensionsViewDescriptors() {
    const viewDescriptors = [];
    viewDescriptors.push({
      id: "workbench.views.extensions.marketplace",
      name: localize2("marketPlace", "Marketplace"),
      ctorDescriptor: new SyncDescriptor(SearchMarketplaceExtensionsView, [{}]),
      when: ContextKeyExpr.and(ContextKeyExpr.has("searchMarketplaceExtensions"), CONTEXT_HAS_GALLERY)
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.searchInstalled",
      name: localize2("installed", "Installed"),
      ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
      when: ContextKeyExpr.or(ContextKeyExpr.has("searchInstalledExtensions"), ContextKeyExpr.has("installedExtensions"))
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.searchRecentlyUpdated",
      name: localize2("recently updated", "Recently Updated"),
      ctorDescriptor: new SyncDescriptor(RecentlyUpdatedExtensionsView, [{}]),
      when: ContextKeyExpr.or(SearchExtensionUpdatesContext, ContextKeyExpr.has("searchRecentlyUpdatedExtensions")),
      order: 2
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.searchEnabled",
      name: localize2("enabled", "Enabled"),
      ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
      when: ContextKeyExpr.and(ContextKeyExpr.has("searchEnabledExtensions"))
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.searchDisabled",
      name: localize2("disabled", "Disabled"),
      ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
      when: ContextKeyExpr.and(ContextKeyExpr.has("searchDisabledExtensions"))
    });
    viewDescriptors.push({
      id: OUTDATED_EXTENSIONS_VIEW_ID,
      name: localize2("availableUpdates", "Available Updates"),
      ctorDescriptor: new SyncDescriptor(OutdatedExtensionsView, [{}]),
      when: ContextKeyExpr.or(SearchExtensionUpdatesContext, ContextKeyExpr.has("searchOutdatedExtensions")),
      order: 1
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.searchBuiltin",
      name: localize2("builtin", "Builtin"),
      ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
      when: ContextKeyExpr.and(ContextKeyExpr.has("searchBuiltInExtensions"))
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.searchWorkspaceUnsupported",
      name: localize2("workspaceUnsupported", "Workspace Unsupported"),
      ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
      when: ContextKeyExpr.and(ContextKeyExpr.has("searchWorkspaceUnsupportedExtensions"))
    });
    return viewDescriptors;
  }
  createRecommendedExtensionsViewDescriptors() {
    const viewDescriptors = [];
    viewDescriptors.push({
      id: WORKSPACE_RECOMMENDATIONS_VIEW_ID,
      name: localize2("workspaceRecommendedExtensions", "Workspace Recommendations"),
      ctorDescriptor: new SyncDescriptor(WorkspaceRecommendedExtensionsView, [{}]),
      when: ContextKeyExpr.and(ContextKeyExpr.has("recommendedExtensions"), WorkbenchStateContext.notEqualsTo("empty")),
      order: 1
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.otherRecommendations",
      name: localize2("otherRecommendedExtensions", "Other Recommendations"),
      ctorDescriptor: new SyncDescriptor(RecommendedExtensionsView, [{}]),
      when: ContextKeyExpr.has("recommendedExtensions"),
      order: 2
    });
    return viewDescriptors;
  }
  createBuiltinExtensionsViewDescriptors() {
    const viewDescriptors = [];
    const configuredCategories = ["themes", "programming languages"];
    const otherCategories = EXTENSION_CATEGORIES.filter((c) => !configuredCategories.includes(c.toLowerCase()));
    otherCategories.push(NONE_CATEGORY);
    const otherCategoriesQuery = `${otherCategories.map((c) => `category:"${c}"`).join(" ")} ${configuredCategories.map((c) => `category:"-${c}"`).join(" ")}`;
    viewDescriptors.push({
      id: "workbench.views.extensions.builtinFeatureExtensions",
      name: localize2("builtinFeatureExtensions", "Features"),
      ctorDescriptor: new SyncDescriptor(StaticQueryExtensionsView, [{ query: `@builtin ${otherCategoriesQuery}` }]),
      when: ContextKeyExpr.has("builtInExtensions")
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.builtinThemeExtensions",
      name: localize2("builtInThemesExtensions", "Themes"),
      ctorDescriptor: new SyncDescriptor(StaticQueryExtensionsView, [{ query: `@builtin category:themes` }]),
      when: ContextKeyExpr.has("builtInExtensions")
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.builtinProgrammingLanguageExtensions",
      name: localize2("builtinProgrammingLanguageExtensions", "Programming Languages"),
      ctorDescriptor: new SyncDescriptor(StaticQueryExtensionsView, [{ query: `@builtin category:"programming languages"` }]),
      when: ContextKeyExpr.has("builtInExtensions")
    });
    return viewDescriptors;
  }
  createUnsupportedWorkspaceExtensionsViewDescriptors() {
    const viewDescriptors = [];
    viewDescriptors.push({
      id: "workbench.views.extensions.untrustedUnsupportedExtensions",
      name: localize2("untrustedUnsupportedExtensions", "Disabled in Restricted Mode"),
      ctorDescriptor: new SyncDescriptor(UntrustedWorkspaceUnsupportedExtensionsView, [{}]),
      when: ContextKeyExpr.and(SearchUnsupportedWorkspaceExtensionsContext)
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.untrustedPartiallySupportedExtensions",
      name: localize2("untrustedPartiallySupportedExtensions", "Limited in Restricted Mode"),
      ctorDescriptor: new SyncDescriptor(UntrustedWorkspacePartiallySupportedExtensionsView, [{}]),
      when: ContextKeyExpr.and(SearchUnsupportedWorkspaceExtensionsContext)
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.virtualUnsupportedExtensions",
      name: localize2("virtualUnsupportedExtensions", "Disabled in Virtual Workspaces"),
      ctorDescriptor: new SyncDescriptor(VirtualWorkspaceUnsupportedExtensionsView, [{}]),
      when: ContextKeyExpr.and(VirtualWorkspaceContext, SearchUnsupportedWorkspaceExtensionsContext)
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.virtualPartiallySupportedExtensions",
      name: localize2("virtualPartiallySupportedExtensions", "Limited in Virtual Workspaces"),
      ctorDescriptor: new SyncDescriptor(VirtualWorkspacePartiallySupportedExtensionsView, [{}]),
      when: ContextKeyExpr.and(VirtualWorkspaceContext, SearchUnsupportedWorkspaceExtensionsContext)
    });
    return viewDescriptors;
  }
  createOtherLocalFilteredExtensionsViewDescriptors() {
    const viewDescriptors = [];
    viewDescriptors.push({
      id: "workbench.views.extensions.deprecatedExtensions",
      name: localize2("deprecated", "Deprecated"),
      ctorDescriptor: new SyncDescriptor(DeprecatedExtensionsView, [{}]),
      when: ContextKeyExpr.and(SearchDeprecatedExtensionsContext)
    });
    viewDescriptors.push({
      id: "workbench.views.extensions.restartRequired",
      name: localize2("restart required", "Restart Required"),
      ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
      when: ContextKeyExpr.and(SearchRestartRequiredExtensionsContext)
    });
    return viewDescriptors;
  }
};
ExtensionsViewletViewsContribution = __decorateClass([
  __decorateParam(0, IExtensionManagementServerService),
  __decorateParam(1, ILabelService),
  __decorateParam(2, IContextKeyService)
], ExtensionsViewletViewsContribution);
let ExtensionsViewPaneContainer = class extends ViewPaneContainer {
  constructor(layoutService, telemetryService, progressService, instantiationService, editorGroupService, extensionGalleryManifestService, extensionsWorkbenchService, extensionManagementServerService, notificationService, paneCompositeService, themeService, configurationService, storageService, contextService, contextKeyService, contextMenuService, extensionService, viewDescriptorService, preferencesService, commandService, logService, openerService) {
    super(VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);
    this.progressService = progressService;
    this.editorGroupService = editorGroupService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.notificationService = notificationService;
    this.paneCompositeService = paneCompositeService;
    this.contextKeyService = contextKeyService;
    this.preferencesService = preferencesService;
    this.commandService = commandService;
    this.openerService = openerService;
    this.extensionGalleryManifest = null;
    this.notificationDisposables = this._register(new MutableDisposable());
    this.searchDelayer = this._register(new Delayer(500));
    this.extensionsSearchValueContextKey = ExtensionsSearchValueContext.bindTo(contextKeyService);
    this.defaultViewsContextKey = DefaultViewsContext.bindTo(contextKeyService);
    this.sortByContextKey = ExtensionsSortByContext.bindTo(contextKeyService);
    this.searchMarketplaceExtensionsContextKey = SearchMarketplaceExtensionsContext.bindTo(contextKeyService);
    this.searchMcpServersContextKey = SearchMcpServersContext.bindTo(contextKeyService);
    this.searchAgentPluginsContextKey = SearchAgentPluginsContext.bindTo(contextKeyService);
    this.searchHasTextContextKey = SearchHasTextContext.bindTo(contextKeyService);
    this.sortByUpdateDateContextKey = SortByUpdateDateContext.bindTo(contextKeyService);
    this.installedExtensionsContextKey = InstalledExtensionsContext.bindTo(contextKeyService);
    this.searchInstalledExtensionsContextKey = SearchInstalledExtensionsContext.bindTo(contextKeyService);
    this.searchRecentlyUpdatedExtensionsContextKey = SearchRecentlyUpdatedExtensionsContext.bindTo(contextKeyService);
    this.searchExtensionUpdatesContextKey = SearchExtensionUpdatesContext.bindTo(contextKeyService);
    this.searchWorkspaceUnsupportedExtensionsContextKey = SearchUnsupportedWorkspaceExtensionsContext.bindTo(contextKeyService);
    this.searchDeprecatedExtensionsContextKey = SearchDeprecatedExtensionsContext.bindTo(contextKeyService);
    this.searchRestartRequiredExtensionsContextKey = SearchRestartRequiredExtensionsContext.bindTo(contextKeyService);
    this.searchOutdatedExtensionsContextKey = SearchOutdatedExtensionsContext.bindTo(contextKeyService);
    this.searchEnabledExtensionsContextKey = SearchEnabledExtensionsContext.bindTo(contextKeyService);
    this.searchDisabledExtensionsContextKey = SearchDisabledExtensionsContext.bindTo(contextKeyService);
    this.hasInstalledExtensionsContextKey = HasInstalledExtensionsContext.bindTo(contextKeyService);
    this.builtInExtensionsContextKey = BuiltInExtensionsContext.bindTo(contextKeyService);
    this.searchBuiltInExtensionsContextKey = SearchBuiltInExtensionsContext.bindTo(contextKeyService);
    this.recommendedExtensionsContextKey = RecommendedExtensionsContext.bindTo(contextKeyService);
    this._register(this.paneCompositeService.onDidPaneCompositeOpen((e) => {
      if (e.viewContainerLocation === ViewContainerLocation.Sidebar) {
        this.onViewletOpen(e.composite);
      }
    }, this));
    this._register(extensionsWorkbenchService.onReset(() => this.refresh()));
    this.searchViewletState = this.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
    extensionGalleryManifestService.getExtensionGalleryManifest().then((galleryManifest) => {
      this.extensionGalleryManifest = galleryManifest;
      this._register(extensionGalleryManifestService.onDidChangeExtensionGalleryManifest((galleryManifest2) => {
        this.extensionGalleryManifest = galleryManifest2;
        this.refresh();
      }));
    });
  }
  get searchValue() {
    return this.searchBox?.getValue();
  }
  create(parent) {
    parent.classList.add("extensions-viewlet");
    this.root = parent;
    const overlay = append(this.root, $(".overlay"));
    const overlayBackgroundColor = this.getColor(SIDE_BAR_DRAG_AND_DROP_BACKGROUND) ?? "";
    overlay.style.backgroundColor = overlayBackgroundColor;
    hide(overlay);
    this.header = append(this.root, $(".header"));
    const placeholder = localize("searchExtensions", "Search Extensions in Marketplace");
    const searchValue = this.searchViewletState["query.value"] ? this.searchViewletState["query.value"] : "";
    const searchContainer = append(this.header, $(".extensions-search-container"));
    this.searchBox = this._register(this.instantiationService.createInstance(SuggestEnabledInput, `${VIEWLET_ID}.searchbox`, searchContainer, {
      triggerCharacters: ["@"],
      sortKey: (item) => {
        if (item.indexOf(":") === -1) {
          return "a";
        } else if (/ext:/.test(item) || /id:/.test(item) || /tag:/.test(item)) {
          return "b";
        } else if (/sort:/.test(item)) {
          return "c";
        } else {
          return "d";
        }
      },
      provideResults: (query) => Query.suggestions(query, this.extensionGalleryManifest)
    }, placeholder, "extensions:searchinput", { placeholderText: placeholder, value: searchValue }));
    this.notificationContainer = append(this.header, $(".notification-container.hidden", { "tabindex": "0" }));
    this.renderNotificaiton();
    this._register(this.extensionsWorkbenchService.onDidChangeExtensionsNotification(() => this.renderNotificaiton()));
    this.updateInstalledExtensionsContexts();
    if (this.searchBox.getValue()) {
      this.triggerSearch();
    }
    this._register(this.searchBox.onInputDidChange(() => {
      this.sortByContextKey.set(Query.parse(this.searchBox?.getValue() ?? "").sortBy);
      this.triggerSearch();
    }, this));
    this._register(this.searchBox.onShouldFocusResults(() => this.focusListView(), this));
    const controlElement = append(searchContainer, $(".extensions-search-actions-container"));
    this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, controlElement, extensionsSearchActionsMenu, {
      toolbarOptions: {
        primaryGroup: () => true
      },
      actionViewItemProvider: (action, options) => createActionViewItem(this.instantiationService, action, options)
    }));
    this._register(new DragAndDropObserver(this.root, {
      onDragEnter: (e) => {
        if (this.isSupportedDragElement(e)) {
          show(overlay);
        }
      },
      onDragLeave: (e) => {
        if (this.isSupportedDragElement(e)) {
          hide(overlay);
        }
      },
      onDragOver: (e) => {
        if (this.isSupportedDragElement(e)) {
          e.dataTransfer.dropEffect = "copy";
        }
      },
      onDrop: async (e) => {
        if (this.isSupportedDragElement(e)) {
          hide(overlay);
          const vsixs = coalesce((await this.instantiationService.invokeFunction((accessor) => extractEditorsAndFilesDropData(accessor, e))).map((editor) => editor.resource && extname(editor.resource) === ".vsix" ? editor.resource : void 0));
          if (vsixs.length > 0) {
            try {
              await this.commandService.executeCommand(INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID, vsixs);
            } catch (err) {
              this.notificationService.error(err);
            }
          }
        }
      }
    }));
    super.create(append(this.root, $(".extensions")));
    const focusTracker = this._register(trackFocus(this.root));
    const isSearchBoxFocused = () => this.searchBox?.inputWidget.hasWidgetFocus();
    this._register(registerNavigableContainer({
      name: "extensionsView",
      focusNotifiers: [focusTracker],
      focusNextWidget: () => {
        if (isSearchBoxFocused()) {
          this.focusListView();
        }
      },
      focusPreviousWidget: () => {
        if (!isSearchBoxFocused()) {
          this.searchBox?.focus();
        }
      }
    }));
  }
  focus() {
    super.focus();
    this.searchBox?.focus();
  }
  layout(dimension) {
    this._dimension = dimension;
    if (this.root) {
      this.root.classList.toggle("narrow", dimension.width <= 250);
      this.root.classList.toggle("mini", dimension.width <= 200);
    }
    this.searchBox?.layout(new Dimension(dimension.width - 34 - /*padding*/
    8 - 24 * 2, 20));
    const searchBoxHeight = 20 + 21;
    const headerHeight = this.header && !!this.notificationContainer?.childNodes.length ? this.notificationContainer.clientHeight + searchBoxHeight + 10 : searchBoxHeight;
    this.header.style.height = `${headerHeight}px`;
    super.layout(new Dimension(dimension.width, dimension.height - headerHeight));
  }
  getOptimalWidth() {
    return 400;
  }
  search(value) {
    if (this.searchBox && this.searchBox.getValue() !== value) {
      this.searchBox.setValue(value);
    }
  }
  async refresh() {
    await this.updateInstalledExtensionsContexts();
    this.doSearch(true);
    if (this.configurationService.getValue(AutoCheckUpdatesConfigurationKey)) {
      this.extensionsWorkbenchService.checkForUpdates();
    }
  }
  renderNotificaiton() {
    if (!this.notificationContainer) {
      return;
    }
    clearNode(this.notificationContainer);
    this.notificationDisposables.value = new DisposableStore();
    const status = this.extensionsWorkbenchService.getExtensionsNotification();
    const query = status?.query ?? status?.extensions.map((extension) => `@id:${extension.identifier.id}`).join(" ");
    if (status && (query === this.searchBox?.getValue() || !this.searchMarketplaceExtensionsContextKey.get())) {
      const messagePlainText = isMarkdownString(status.message) ? renderAsPlaintext(status.message) : status.message;
      this.notificationContainer.setAttribute("aria-label", messagePlainText);
      this.notificationContainer.classList.remove("hidden");
      const messageContainer = append(this.notificationContainer, $(".message-container"));
      append(messageContainer, $("span")).className = SeverityIcon.className(status.severity);
      const messageText = append(messageContainer, $("span.message-text"));
      const messageElement = append(messageText, $("span.message"));
      if (isMarkdownString(status.message)) {
        const isTrusted = status.message.isTrusted;
        const allowCommands = typeof isTrusted === "object" ? isTrusted.enabledCommands : !!isTrusted;
        this.notificationDisposables.value.add(renderMarkdown(status.message, {
          actionHandler: (link) => {
            this.openerService.open(link, { allowCommands });
          }
        }, messageElement));
      } else {
        messageElement.textContent = status.message;
      }
      if (status.extensions.length) {
        const showAction = append(
          messageText,
          $("span.message-text-action", {
            "tabindex": "0",
            "role": "button",
            "aria-label": `${messagePlainText}. ${localize("click show", "Click to Show")}`
          }, localize("show", "Show"))
        );
        this.notificationDisposables.value.add(addDisposableListener(showAction, EventType.CLICK, () => this.search(query ?? "")));
        this.notificationDisposables.value.add(addDisposableListener(showAction, EventType.KEY_DOWN, (e) => {
          const standardKeyboardEvent = new StandardKeyboardEvent(e);
          if (standardKeyboardEvent.keyCode === KeyCode.Enter || standardKeyboardEvent.keyCode === KeyCode.Space) {
            this.search(query ?? "");
          }
          standardKeyboardEvent.stopPropagation();
        }));
      }
      const actionsContainer = append(this.notificationContainer, $(".notification-actions"));
      if (status.action) {
        const actionButton = append(
          actionsContainer,
          $("span.message-action-button", {
            "tabindex": "0",
            "role": "button",
            "aria-label": status.action.label
          }, status.action.label)
        );
        this.notificationDisposables.value.add(addDisposableListener(actionButton, EventType.CLICK, () => {
          Promise.resolve(status.action.run()).catch((error) => this.notificationService.error(error));
        }));
        this.notificationDisposables.value.add(addDisposableListener(actionButton, EventType.KEY_DOWN, (e) => {
          const standardKeyboardEvent = new StandardKeyboardEvent(e);
          if (standardKeyboardEvent.keyCode === KeyCode.Enter || standardKeyboardEvent.keyCode === KeyCode.Space) {
            Promise.resolve(status.action.run()).catch((error) => this.notificationService.error(error));
          }
          standardKeyboardEvent.stopPropagation();
        }));
      }
      const dismiss = status.dismiss;
      if (dismiss) {
        const dismissLabel = localize("dismiss notification", "Dismiss");
        const dismissButton = append(
          actionsContainer,
          $("span.dismiss-action.codicon.codicon-close", {
            "tabindex": "0",
            "role": "button",
            "aria-label": dismissLabel,
            "title": dismissLabel
          })
        );
        this.notificationDisposables.value.add(addDisposableListener(dismissButton, EventType.CLICK, () => dismiss()));
        this.notificationDisposables.value.add(addDisposableListener(dismissButton, EventType.KEY_DOWN, (e) => {
          const standardKeyboardEvent = new StandardKeyboardEvent(e);
          if (standardKeyboardEvent.keyCode === KeyCode.Enter || standardKeyboardEvent.keyCode === KeyCode.Space) {
            dismiss();
          }
          standardKeyboardEvent.stopPropagation();
        }));
      }
    } else {
      this.notificationContainer.removeAttribute("aria-label");
      this.notificationContainer.classList.add("hidden");
      if (this.searchBox && ExtensionsListView.isRestartRequiredQuery(this.searchBox.getValue())) {
        this.search("");
      }
    }
    if (this._dimension) {
      this.layout(this._dimension);
    }
  }
  async updateInstalledExtensionsContexts() {
    const result = await this.extensionsWorkbenchService.queryLocal();
    this.hasInstalledExtensionsContextKey.set(result.some((r) => !r.isBuiltin));
  }
  triggerSearch() {
    this.searchDelayer.trigger(() => this.doSearch(), this.searchBox && this.searchBox.getValue() ? 500 : 0).then(void 0, (err) => this.onError(err));
  }
  normalizedQuery() {
    return this.searchBox ? this.searchBox.getValue().trim().replace(/@category/g, "category").replace(/@tag:/g, "tag:").replace(/@ext:/g, "ext:").replace(/@featured/g, "featured").replace(/@popular/g, this.extensionManagementServerService.webExtensionManagementServer && !this.extensionManagementServerService.localExtensionManagementServer && !this.extensionManagementServerService.remoteExtensionManagementServer ? "@web" : "@popular") : "";
  }
  saveState() {
    const value = this.searchBox ? this.searchBox.getValue() : "";
    if (ExtensionsListView.isLocalExtensionsQuery(value)) {
      this.searchViewletState["query.value"] = value;
    } else {
      this.searchViewletState["query.value"] = "";
    }
    super.saveState();
  }
  doSearch(refresh) {
    const value = this.normalizedQuery();
    this.contextKeyService.bufferChangeEvents(() => {
      const isRecommendedExtensionsQuery = ExtensionsListView.isRecommendedExtensionsQuery(value);
      this.searchHasTextContextKey.set(value.trim() !== "");
      this.extensionsSearchValueContextKey.set(value);
      this.installedExtensionsContextKey.set(ExtensionsListView.isInstalledExtensionsQuery(value));
      this.searchInstalledExtensionsContextKey.set(ExtensionsListView.isSearchInstalledExtensionsQuery(value));
      this.searchRecentlyUpdatedExtensionsContextKey.set(ExtensionsListView.isSearchRecentlyUpdatedQuery(value) && !ExtensionsListView.isSearchExtensionUpdatesQuery(value));
      this.searchOutdatedExtensionsContextKey.set(ExtensionsListView.isOutdatedExtensionsQuery(value) && !ExtensionsListView.isSearchExtensionUpdatesQuery(value));
      this.searchExtensionUpdatesContextKey.set(ExtensionsListView.isSearchExtensionUpdatesQuery(value));
      this.searchEnabledExtensionsContextKey.set(ExtensionsListView.isEnabledExtensionsQuery(value));
      this.searchDisabledExtensionsContextKey.set(ExtensionsListView.isDisabledExtensionsQuery(value));
      this.searchBuiltInExtensionsContextKey.set(ExtensionsListView.isSearchBuiltInExtensionsQuery(value));
      this.searchWorkspaceUnsupportedExtensionsContextKey.set(ExtensionsListView.isSearchWorkspaceUnsupportedExtensionsQuery(value));
      this.searchDeprecatedExtensionsContextKey.set(ExtensionsListView.isSearchDeprecatedExtensionsQuery(value));
      this.searchRestartRequiredExtensionsContextKey.set(ExtensionsListView.isRestartRequiredQuery(value));
      this.builtInExtensionsContextKey.set(ExtensionsListView.isBuiltInExtensionsQuery(value));
      this.recommendedExtensionsContextKey.set(isRecommendedExtensionsQuery);
      this.searchMcpServersContextKey.set(!!value && /@mcp\s?.*/i.test(value));
      this.searchAgentPluginsContextKey.set(!!value && /@agentPlugins\s?.*/i.test(value));
      this.searchMarketplaceExtensionsContextKey.set(!!value && !ExtensionsListView.isLocalExtensionsQuery(value) && !isRecommendedExtensionsQuery && !this.searchMcpServersContextKey.get() && !this.searchAgentPluginsContextKey.get());
      this.sortByUpdateDateContextKey.set(ExtensionsListView.isSortUpdateDateQuery(value));
      this.defaultViewsContextKey.set(!value || ExtensionsListView.isSortInstalledExtensionsQuery(value));
    });
    this.renderNotificaiton();
    return this.showExtensionsViews(this.panes);
  }
  onDidAddViewDescriptors(added) {
    const addedViews = super.onDidAddViewDescriptors(added);
    this.showExtensionsViews(addedViews);
    return addedViews;
  }
  async showExtensionsViews(views) {
    await this.progress(Promise.all(views.map(async (view) => {
      if (view instanceof AbstractExtensionsListView) {
        const model = await view.show(this.normalizedQuery());
        this.alertSearchResult(model.length, view.id);
      }
    })));
  }
  alertSearchResult(count, viewId) {
    const view = this.viewContainerModel.visibleViewDescriptors.find((view2) => view2.id === viewId);
    switch (count) {
      case 0:
        break;
      case 1:
        if (view) {
          alert(localize("extensionFoundInSection", "1 extension found in the {0} section.", view.name.value));
        } else {
          alert(localize("extensionFound", "1 extension found."));
        }
        break;
      default:
        if (view) {
          alert(localize("extensionsFoundInSection", "{0} extensions found in the {1} section.", count, view.name.value));
        } else {
          alert(localize("extensionsFound", "{0} extensions found.", count));
        }
        break;
    }
  }
  getFirstExpandedPane() {
    for (const pane of this.panes) {
      if (pane.isExpanded() && pane instanceof ExtensionsListView) {
        return pane;
      }
    }
    return void 0;
  }
  focusListView() {
    const pane = this.getFirstExpandedPane();
    if (pane && pane.count() > 0) {
      pane.focus();
    }
  }
  onViewletOpen(viewlet) {
    if (!viewlet || viewlet.getId() === VIEWLET_ID) {
      return;
    }
    if (this.configurationService.getValue(CloseExtensionDetailsOnViewChangeKey)) {
      const promises = this.editorGroupService.groups.map((group) => {
        const editors = group.editors.filter((input) => input instanceof ExtensionsInput);
        return group.closeEditors(editors);
      });
      Promise.all(promises);
    }
  }
  progress(promise) {
    return this.progressService.withProgress({ location: ProgressLocation.Extensions }, () => promise);
  }
  onError(err) {
    if (isCancellationError(err)) {
      return;
    }
    const message = err && err.message || "";
    if (/ECONNREFUSED/.test(message)) {
      const error = createErrorWithActions(localize("suggestProxyError", "Marketplace returned 'ECONNREFUSED'. Please check the 'http.proxy' setting."), [
        new Action("open user settings", localize("open user settings", "Open User Settings"), void 0, true, () => this.preferencesService.openUserSettings())
      ]);
      this.notificationService.error(error);
      return;
    }
    this.notificationService.error(err);
  }
  isSupportedDragElement(e) {
    if (e.dataTransfer) {
      const typesLowerCase = e.dataTransfer.types.map((t) => t.toLocaleLowerCase());
      return typesLowerCase.indexOf("files") !== -1;
    }
    return false;
  }
};
ExtensionsViewPaneContainer = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IProgressService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IEditorGroupsService),
  __decorateParam(5, IExtensionGalleryManifestService),
  __decorateParam(6, IExtensionsWorkbenchService),
  __decorateParam(7, IExtensionManagementServerService),
  __decorateParam(8, INotificationService),
  __decorateParam(9, IPaneCompositePartService),
  __decorateParam(10, IThemeService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IStorageService),
  __decorateParam(13, IWorkspaceContextService),
  __decorateParam(14, IContextKeyService),
  __decorateParam(15, IContextMenuService),
  __decorateParam(16, IExtensionService),
  __decorateParam(17, IViewDescriptorService),
  __decorateParam(18, IPreferencesService),
  __decorateParam(19, ICommandService),
  __decorateParam(20, ILogService),
  __decorateParam(21, IOpenerService)
], ExtensionsViewPaneContainer);
let StatusUpdater = class extends Disposable {
  constructor(activityService, extensionsWorkbenchService, extensionEnablementService, configurationService) {
    super();
    this.activityService = activityService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.configurationService = configurationService;
    this.badgeHandle = this._register(new MutableDisposable());
    this.onServiceChange();
    this._register(Event.any(Event.debounce(extensionsWorkbenchService.onChange, () => void 0, 100, void 0, void 0, void 0, this._store), extensionsWorkbenchService.onDidChangeExtensionsNotification)(this.onServiceChange, this));
  }
  onServiceChange() {
    this.badgeHandle.clear();
    let badge;
    const extensionsNotification = this.extensionsWorkbenchService.getExtensionsNotification();
    if (extensionsNotification && extensionsNotification.severity === Severity.Warning) {
      badge = new WarningBadge(() => isMarkdownString(extensionsNotification.message) ? renderAsPlaintext(extensionsNotification.message) : extensionsNotification.message);
    }
    if (!badge) {
      const actionRequired = this.configurationService.getValue(AutoRestartConfigurationKey) === true ? [] : this.extensionsWorkbenchService.installed.filter((e) => e.runtimeState !== void 0);
      const outdated = this.extensionsWorkbenchService.outdated.reduce((r, e) => r + (this.extensionEnablementService.isEnabled(e.local) && !actionRequired.includes(e) && !this.extensionsWorkbenchService.isAutoUpdateDelayed(e) ? 1 : 0), 0);
      const newBadgeNumber = outdated + actionRequired.length;
      if (newBadgeNumber > 0) {
        let msg = "";
        if (outdated) {
          msg += outdated === 1 ? localize("extensionToUpdate", "{0} requires update", outdated) : localize("extensionsToUpdate", "{0} require update", outdated);
        }
        if (outdated > 0 && actionRequired.length > 0) {
          msg += ", ";
        }
        if (actionRequired.length) {
          msg += actionRequired.length === 1 ? localize("extensionToReload", "{0} requires restart", actionRequired.length) : localize("extensionsToReload", "{0} require restart", actionRequired.length);
        }
        badge = new NumberBadge(newBadgeNumber, () => msg);
      }
    }
    if (badge) {
      this.badgeHandle.value = this.activityService.showViewContainerActivity(VIEWLET_ID, { badge });
    }
  }
};
StatusUpdater = __decorateClass([
  __decorateParam(0, IActivityService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IWorkbenchExtensionEnablementService),
  __decorateParam(3, IConfigurationService)
], StatusUpdater);
let MaliciousExtensionChecker = class {
  constructor(extensionsManagementService, extensionsWorkbenchService, hostService, logService, notificationService, commandService) {
    this.extensionsManagementService = extensionsManagementService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.hostService = hostService;
    this.logService = logService;
    this.notificationService = notificationService;
    this.commandService = commandService;
    this.loopCheckForMaliciousExtensions();
  }
  loopCheckForMaliciousExtensions() {
    this.checkForMaliciousExtensions().then(() => timeout(1e3 * 60 * 5)).then(() => this.loopCheckForMaliciousExtensions());
  }
  async checkForMaliciousExtensions() {
    try {
      const maliciousExtensions = [];
      let shouldRestartExtensions = false;
      let shouldReloadWindow = false;
      for (const extension of this.extensionsWorkbenchService.installed) {
        if (extension.isMalicious && extension.local) {
          maliciousExtensions.push([extension.local, extension.maliciousInfoLink]);
          shouldRestartExtensions = shouldRestartExtensions || extension.runtimeState?.action === ExtensionRuntimeActionType.RestartExtensions;
          shouldReloadWindow = shouldReloadWindow || extension.runtimeState?.action === ExtensionRuntimeActionType.ReloadWindow;
        }
      }
      if (maliciousExtensions.length) {
        await this.extensionsManagementService.uninstallExtensions(maliciousExtensions.map((e) => ({ extension: e[0], options: { remove: true } })));
        for (const [extension, link] of maliciousExtensions) {
          const buttons = [];
          if (shouldRestartExtensions || shouldReloadWindow) {
            buttons.push({
              label: shouldRestartExtensions ? localize("restartNow", "Restart Extensions") : localize("reloadNow", "Reload Now"),
              run: () => shouldRestartExtensions ? this.extensionsWorkbenchService.updateRunningExtensions() : this.hostService.reload()
            });
          }
          if (link) {
            buttons.push({
              label: localize("learnMore", "Learn More"),
              run: () => this.commandService.executeCommand("vscode.open", URI.parse(link))
            });
          }
          this.notificationService.prompt(
            Severity.Warning,
            localize("malicious warning", "The extension '{0}' was found to be problematic and has been uninstalled", extension.manifest.displayName || extension.identifier.id),
            buttons,
            {
              sticky: true,
              priority: NotificationPriority.URGENT
            }
          );
        }
      }
    } catch (err) {
      this.logService.error(err);
    }
  }
};
MaliciousExtensionChecker = __decorateClass([
  __decorateParam(0, IExtensionManagementService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IHostService),
  __decorateParam(3, ILogService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, ICommandService)
], MaliciousExtensionChecker);
let ExtensionMarketplaceStatusUpdater = class extends Disposable {
  constructor(activityService, extensionGalleryManifestService) {
    super();
    this.activityService = activityService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this.badgeHandle = this._register(new MutableDisposable());
    this.accountBadgeDisposable = this._register(new MutableDisposable());
    this.updateBadge();
    this._register(this.extensionGalleryManifestService.onDidChangeExtensionGalleryManifestStatus(() => this.updateBadge()));
  }
  async updateBadge() {
    this.badgeHandle.clear();
    const status = this.extensionGalleryManifestService.extensionGalleryManifestStatus;
    let badge;
    switch (status) {
      case ExtensionGalleryManifestStatus.RequiresSignIn:
        badge = new NumberBadge(1, () => localize("signInRequired", "Sign in required to access marketplace"));
        break;
      case ExtensionGalleryManifestStatus.AccessDenied:
        badge = new WarningBadge(() => localize("accessDenied", "Access denied to marketplace"));
        break;
    }
    if (badge) {
      this.badgeHandle.value = this.activityService.showViewContainerActivity(VIEWLET_ID, { badge });
    }
    this.accountBadgeDisposable.clear();
    if (status === ExtensionGalleryManifestStatus.RequiresSignIn) {
      const badge2 = new NumberBadge(1, () => localize("sign in enterprise marketplace", "Sign in to access Marketplace"));
      this.accountBadgeDisposable.value = this.activityService.showAccountsActivity({ badge: badge2 });
    }
  }
};
ExtensionMarketplaceStatusUpdater = __decorateClass([
  __decorateParam(0, IActivityService),
  __decorateParam(1, IExtensionGalleryManifestService)
], ExtensionMarketplaceStatusUpdater);
export {
  BuiltInExtensionsContext,
  ExtensionMarketplaceStatusUpdater,
  ExtensionsSearchValueContext,
  ExtensionsSortByContext,
  ExtensionsViewPaneContainer,
  ExtensionsViewletViewsContribution,
  MaliciousExtensionChecker,
  RecommendedExtensionsContext,
  SearchHasTextContext,
  SearchMarketplaceExtensionsContext,
  StatusUpdater
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zVmlld2xldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9leHRlbnNpb25zVmlld2xldC5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0LCBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVFcnJvcldpdGhBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBhcHBlbmQsICQsIERpbWVuc2lvbiwgaGlkZSwgc2hvdywgRHJhZ0FuZERyb3BPYnNlcnZlciwgdHJhY2tGb2N1cywgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIGNsZWFyTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVyTWFya2Rvd24sIHJlbmRlckFzUGxhaW50ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgaXNNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIElFeHRlbnNpb25zVmlld1BhbmVDb250YWluZXIsIFZJRVdMRVRfSUQsIENsb3NlRXh0ZW5zaW9uRGV0YWlsc09uVmlld0NoYW5nZUtleSwgSU5TVEFMTF9FWFRFTlNJT05fRlJPTV9WU0lYX0NPTU1BTkRfSUQsIFdPUktTUEFDRV9SRUNPTU1FTkRBVElPTlNfVklFV19JRCwgQXV0b0NoZWNrVXBkYXRlc0NvbmZpZ3VyYXRpb25LZXksIE9VVERBVEVEX0VYVEVOU0lPTlNfVklFV19JRCwgQ09OVEVYVF9IQVNfR0FMTEVSWSwgZXh0ZW5zaW9uc1NlYXJjaEFjdGlvbnNNZW51LCBBdXRvUmVzdGFydENvbmZpZ3VyYXRpb25LZXksIEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLCBTZWFyY2hNY3BTZXJ2ZXJzQ29udGV4dCwgU2VhcmNoQWdlbnRQbHVnaW5zQ29udGV4dCwgRGVmYXVsdFZpZXdzQ29udGV4dCwgQ09OVEVYVF9FWFRFTlNJT05TX0dBTExFUllfU1RBVFVTIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSW5zdGFsbExvY2FsRXh0ZW5zaW9uc0luUmVtb3RlQWN0aW9uLCBJbnN0YWxsUmVtb3RlRXh0ZW5zaW9uc0luTG9jYWxBY3Rpb24gfSBmcm9tICcuL2V4dGVuc2lvbnNBY3Rpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgSUxvY2FsRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNJbnB1dCB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zSW5wdXQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc0xpc3RWaWV3LCBFbmFibGVkRXh0ZW5zaW9uc1ZpZXcsIERpc2FibGVkRXh0ZW5zaW9uc1ZpZXcsIFJlY29tbWVuZGVkRXh0ZW5zaW9uc1ZpZXcsIFdvcmtzcGFjZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1ZpZXcsIFNlcnZlckluc3RhbGxlZEV4dGVuc2lvbnNWaWV3LCBEZWZhdWx0UmVjb21tZW5kZWRFeHRlbnNpb25zVmlldywgVW50cnVzdGVkV29ya3NwYWNlVW5zdXBwb3J0ZWRFeHRlbnNpb25zVmlldywgVW50cnVzdGVkV29ya3NwYWNlUGFydGlhbGx5U3VwcG9ydGVkRXh0ZW5zaW9uc1ZpZXcsIFZpcnR1YWxXb3Jrc3BhY2VVbnN1cHBvcnRlZEV4dGVuc2lvbnNWaWV3LCBWaXJ0dWFsV29ya3NwYWNlUGFydGlhbGx5U3VwcG9ydGVkRXh0ZW5zaW9uc1ZpZXcsIERlZmF1bHRQb3B1bGFyRXh0ZW5zaW9uc1ZpZXcsIERlcHJlY2F0ZWRFeHRlbnNpb25zVmlldywgU2VhcmNoTWFya2V0cGxhY2VFeHRlbnNpb25zVmlldywgUmVjZW50bHlVcGRhdGVkRXh0ZW5zaW9uc1ZpZXcsIE91dGRhdGVkRXh0ZW5zaW9uc1ZpZXcsIFN0YXRpY1F1ZXJ5RXh0ZW5zaW9uc1ZpZXcsIE5PTkVfQ0FURUdPUlksIEFic3RyYWN0RXh0ZW5zaW9uc0xpc3RWaWV3IH0gZnJvbSAnLi9leHRlbnNpb25zVmlld3MuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgSUFjdGl2aXR5U2VydmljZSwgSUJhZGdlLCBOdW1iZXJCYWRnZSwgV2FybmluZ0JhZGdlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVZpZXdzUmVnaXN0cnksIElWaWV3RGVzY3JpcHRvciwgRXh0ZW5zaW9ucywgVmlld0NvbnRhaW5lciwgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgSUFkZGVkVmlld0Rlc2NyaXB0b3JSZWYsIFZpZXdDb250YWluZXJMb2NhdGlvbiwgSVZpZXdDb250YWluZXJzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgQ29udGV4dEtleUV4cHIsIFJhd0NvbnRleHRLZXksIElDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBJUHJvbXB0Q2hvaWNlLCBOb3RpZmljYXRpb25Qcmlvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZUNvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmVDb250YWluZXIuanMnO1xuaW1wb3J0IHsgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IFF1ZXJ5IH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvblF1ZXJ5LmpzJztcbmltcG9ydCB7IFN1Z2dlc3RFbmFibGVkSW5wdXQgfSBmcm9tICcuLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvc3VnZ2VzdEVuYWJsZWRJbnB1dC9zdWdnZXN0RW5hYmxlZElucHV0LmpzJztcbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBFWFRFTlNJT05fQ0FURUdPUklFUyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgU0lERV9CQVJfRFJBR19BTkRfRFJPUF9CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IFZpcnR1YWxXb3Jrc3BhY2VDb250ZXh0LCBXb3JrYmVuY2hTdGF0ZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGluc3RhbGxMb2NhbEluUmVtb3RlSWNvbiB9IGZyb20gJy4vZXh0ZW5zaW9uc0ljb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQWN0aW9uMiwgQWN0aW9uMiwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYW5lY29tcG9zaXRlL2Jyb3dzZXIvcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBleHRyYWN0RWRpdG9yc0FuZEZpbGVzRHJvcERhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kbmQvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgZXh0bmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJOYXZpZ2FibGVDb250YWluZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvd2lkZ2V0TmF2aWdhdGlvbkNvbW1hbmRzLmpzJztcbmltcG9ydCB7IE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgU2V2ZXJpdHlJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NldmVyaXR5SWNvbi9zZXZlcml0eUljb24uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLCBFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IERFRkFVTFRfQUNDT1VOVF9TSUdOX0lOX0NPTU1BTkQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hY2NvdW50cy9icm93c2VyL2RlZmF1bHRBY2NvdW50LmpzJztcblxuZXhwb3J0IGNvbnN0IEV4dGVuc2lvbnNTb3J0QnlDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nPignZXh0ZW5zaW9uc1NvcnRCeVZhbHVlJywgJycpO1xuZXhwb3J0IGNvbnN0IFNlYXJjaE1hcmtldHBsYWNlRXh0ZW5zaW9uc0NvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2VhcmNoTWFya2V0cGxhY2VFeHRlbnNpb25zJywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IFNlYXJjaEhhc1RleHRDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2V4dGVuc2lvblNlYXJjaEhhc1RleHQnLCBmYWxzZSk7XG5jb25zdCBJbnN0YWxsZWRFeHRlbnNpb25zQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdpbnN0YWxsZWRFeHRlbnNpb25zJywgZmFsc2UpO1xuY29uc3QgU2VhcmNoSW5zdGFsbGVkRXh0ZW5zaW9uc0NvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2VhcmNoSW5zdGFsbGVkRXh0ZW5zaW9ucycsIGZhbHNlKTtcbmNvbnN0IFNlYXJjaFJlY2VudGx5VXBkYXRlZEV4dGVuc2lvbnNDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3NlYXJjaFJlY2VudGx5VXBkYXRlZEV4dGVuc2lvbnMnLCBmYWxzZSk7XG5jb25zdCBTZWFyY2hFeHRlbnNpb25VcGRhdGVzQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzZWFyY2hFeHRlbnNpb25VcGRhdGVzJywgZmFsc2UpO1xuY29uc3QgU2VhcmNoT3V0ZGF0ZWRFeHRlbnNpb25zQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzZWFyY2hPdXRkYXRlZEV4dGVuc2lvbnMnLCBmYWxzZSk7XG5jb25zdCBTZWFyY2hFbmFibGVkRXh0ZW5zaW9uc0NvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2VhcmNoRW5hYmxlZEV4dGVuc2lvbnMnLCBmYWxzZSk7XG5jb25zdCBTZWFyY2hEaXNhYmxlZEV4dGVuc2lvbnNDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3NlYXJjaERpc2FibGVkRXh0ZW5zaW9ucycsIGZhbHNlKTtcbmNvbnN0IEhhc0luc3RhbGxlZEV4dGVuc2lvbnNDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2hhc0luc3RhbGxlZEV4dGVuc2lvbnMnLCB0cnVlKTtcbmV4cG9ydCBjb25zdCBCdWlsdEluRXh0ZW5zaW9uc0NvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYnVpbHRJbkV4dGVuc2lvbnMnLCBmYWxzZSk7XG5jb25zdCBTZWFyY2hCdWlsdEluRXh0ZW5zaW9uc0NvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2VhcmNoQnVpbHRJbkV4dGVuc2lvbnMnLCBmYWxzZSk7XG5jb25zdCBTZWFyY2hVbnN1cHBvcnRlZFdvcmtzcGFjZUV4dGVuc2lvbnNDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3NlYXJjaFVuc3VwcG9ydGVkV29ya3NwYWNlRXh0ZW5zaW9ucycsIGZhbHNlKTtcbmNvbnN0IFNlYXJjaERlcHJlY2F0ZWRFeHRlbnNpb25zQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzZWFyY2hEZXByZWNhdGVkRXh0ZW5zaW9ucycsIGZhbHNlKTtcbmNvbnN0IFNlYXJjaFJlc3RhcnRSZXF1aXJlZEV4dGVuc2lvbnNDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3NlYXJjaFJlc3RhcnRSZXF1aXJlZEV4dGVuc2lvbnMnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgUmVjb21tZW5kZWRFeHRlbnNpb25zQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdyZWNvbW1lbmRlZEV4dGVuc2lvbnMnLCBmYWxzZSk7XG5jb25zdCBTb3J0QnlVcGRhdGVEYXRlQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzb3J0QnlVcGRhdGVEYXRlJywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IEV4dGVuc2lvbnNTZWFyY2hWYWx1ZUNvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KCdleHRlbnNpb25zU2VhcmNoVmFsdWUnLCAnJyk7XG5cbmNvbnN0IFJFTU9URV9DQVRFR09SWTogSUxvY2FsaXplZFN0cmluZyA9IGxvY2FsaXplMih7IGtleTogJ3JlbW90ZScsIGNvbW1lbnQ6IFsnUmVtb3RlIGFzIGluIHJlbW90ZSBtYWNoaW5lJ10gfSwgXCJSZW1vdGVcIik7XG5cbmludGVyZmFjZSBJRXh0ZW5zaW9uc1ZpZXdsZXRTdGF0ZSB7XG5cdCdxdWVyeS52YWx1ZSc/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25zVmlld2xldFZpZXdzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBWaWV3Q29udGFpbmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmNvbnRhaW5lciA9IFJlZ2lzdHJ5LmFzPElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5PihFeHRlbnNpb25zLlZpZXdDb250YWluZXJzUmVnaXN0cnkpLmdldChWSUVXTEVUX0lEKSE7XG5cdFx0dGhpcy5yZWdpc3RlclZpZXdzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVmlld3MoKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JzOiBJVmlld0Rlc2NyaXB0b3JbXSA9IFtdO1xuXG5cdFx0LyogRGVmYXVsdCB2aWV3cyAqL1xuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKC4uLnRoaXMuY3JlYXRlRGVmYXVsdEV4dGVuc2lvbnNWaWV3RGVzY3JpcHRvcnMoKSk7XG5cblx0XHQvKiBTZWFyY2ggdmlld3MgKi9cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCguLi50aGlzLmNyZWF0ZVNlYXJjaEV4dGVuc2lvbnNWaWV3RGVzY3JpcHRvcnMoKSk7XG5cblx0XHQvKiBSZWNvbW1lbmRhdGlvbnMgdmlld3MgKi9cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCguLi50aGlzLmNyZWF0ZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1ZpZXdEZXNjcmlwdG9ycygpKTtcblxuXHRcdC8qIEJ1aWx0LWluIGV4dGVuc2lvbnMgdmlld3MgKi9cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCguLi50aGlzLmNyZWF0ZUJ1aWx0aW5FeHRlbnNpb25zVmlld0Rlc2NyaXB0b3JzKCkpO1xuXG5cdFx0LyogVHJ1c3QgUmVxdWlyZWQgZXh0ZW5zaW9ucyB2aWV3cyAqL1xuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKC4uLnRoaXMuY3JlYXRlVW5zdXBwb3J0ZWRXb3Jrc3BhY2VFeHRlbnNpb25zVmlld0Rlc2NyaXB0b3JzKCkpO1xuXG5cdFx0LyogT3RoZXIgTG9jYWwgRmlsdGVyZWQgZXh0ZW5zaW9ucyB2aWV3cyAqL1xuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKC4uLnRoaXMuY3JlYXRlT3RoZXJMb2NhbEZpbHRlcmVkRXh0ZW5zaW9uc1ZpZXdEZXNjcmlwdG9ycygpKTtcblxuXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy5tYXJrZXRwbGFjZUFjY2VzcycsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ21hcmtldFBsYWNlJywgXCJNYXJrZXRwbGFjZVwiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoY2xhc3MgZXh0ZW5kcyBWaWV3UGFuZSB7XG5cdFx0XHRcdHB1YmxpYyBvdmVycmlkZSBzaG91bGRTaG93V2VsY29tZSgpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnc2VhcmNoTWFya2V0cGxhY2VFeHRlbnNpb25zJyksIENvbnRleHRLZXlFeHByLmFuZChEZWZhdWx0Vmlld3NDb250ZXh0KVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihDT05URVhUX0VYVEVOU0lPTlNfR0FMTEVSWV9TVEFUVVMuaXNFcXVhbFRvKEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1cy5SZXF1aXJlc1NpZ25JbiksIENPTlRFWFRfRVhURU5TSU9OU19HQUxMRVJZX1NUQVRVUy5pc0VxdWFsVG8oRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzLkFjY2Vzc0RlbmllZCkpXG5cdFx0XHQpLFxuXHRcdFx0b3JkZXI6IC0xLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgdmlld1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KEV4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSk7XG5cdFx0dmlld1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3Modmlld0Rlc2NyaXB0b3JzLCB0aGlzLmNvbnRhaW5lcik7XG5cblx0XHR2aWV3UmVnaXN0cnkucmVnaXN0ZXJWaWV3V2VsY29tZUNvbnRlbnQoJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLm1hcmtldHBsYWNlQWNjZXNzJywge1xuXHRcdFx0Y29udGVudDogbG9jYWxpemUoJ3NpZ24gaW4nLCBcIltTaWduIGluIHRvIGFjY2VzcyBFeHRlbnNpb25zIE1hcmtldHBsYWNlXSh7MH0pXCIsIGBjb21tYW5kOiR7REVGQVVMVF9BQ0NPVU5UX1NJR05fSU5fQ09NTUFORH1gKSxcblx0XHRcdHdoZW46IENPTlRFWFRfRVhURU5TSU9OU19HQUxMRVJZX1NUQVRVUy5pc0VxdWFsVG8oRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzLlJlcXVpcmVzU2lnbkluKVxuXHRcdH0pO1xuXG5cdFx0dmlld1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld1dlbGNvbWVDb250ZW50KCd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy5tYXJrZXRwbGFjZUFjY2VzcycsIHtcblx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplKCdhY2Nlc3MgZGVuaWVkJywgXCJZb3VyIGFjY291bnQgZG9lcyBub3QgaGF2ZSBhY2Nlc3MgdG8gdGhlIEV4dGVuc2lvbnMgTWFya2V0cGxhY2UuIFBsZWFzZSBjb250YWN0IHlvdXIgYWRtaW5pc3RyYXRvci5cIiksXG5cdFx0XHR3aGVuOiBDT05URVhUX0VYVEVOU0lPTlNfR0FMTEVSWV9TVEFUVVMuaXNFcXVhbFRvKEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1cy5BY2Nlc3NEZW5pZWQpXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZURlZmF1bHRFeHRlbnNpb25zVmlld0Rlc2NyaXB0b3JzKCk6IElWaWV3RGVzY3JpcHRvcltdIHtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcnM6IElWaWV3RGVzY3JpcHRvcltdID0gW107XG5cblx0XHQvKlxuXHRcdCAqIERlZmF1bHQgaW5zdGFsbGVkIGV4dGVuc2lvbnMgdmlld3MgLSBTaG93cyBhbGwgdXNlciBpbnN0YWxsZWQgZXh0ZW5zaW9ucy5cblx0XHQgKi9cblx0XHRjb25zdCBzZXJ2ZXJzOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcltdID0gW107XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRzZXJ2ZXJzLnB1c2godGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRzZXJ2ZXJzLnB1c2godGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0c2VydmVycy5wdXNoKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcik7XG5cdFx0fVxuXHRcdGNvbnN0IGdldFZpZXdOYW1lID0gKHZpZXdUaXRsZTogc3RyaW5nLCBzZXJ2ZXI6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKTogc3RyaW5nID0+IHtcblx0XHRcdHJldHVybiBzZXJ2ZXJzLmxlbmd0aCA+IDEgPyBgJHtzZXJ2ZXIubGFiZWx9IC0gJHt2aWV3VGl0bGV9YCA6IHZpZXdUaXRsZTtcblx0XHR9O1xuXHRcdGxldCBpbnN0YWxsZWRXZWJFeHRlbnNpb25zQ29udGV4dENoYW5nZUV2ZW50ID0gRXZlbnQuTm9uZTtcblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0Y29uc3QgaW50ZXJlc3RpbmdDb250ZXh0S2V5cyA9IG5ldyBTZXQoKTtcblx0XHRcdGludGVyZXN0aW5nQ29udGV4dEtleXMuYWRkKCdoYXNJbnN0YWxsZWRXZWJFeHRlbnNpb25zJyk7XG5cdFx0XHRpbnN0YWxsZWRXZWJFeHRlbnNpb25zQ29udGV4dENoYW5nZUV2ZW50ID0gRXZlbnQuZmlsdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0LCBlID0+IGUuYWZmZWN0c1NvbWUoaW50ZXJlc3RpbmdDb250ZXh0S2V5cykpO1xuXHRcdH1cblx0XHRjb25zdCBzZXJ2ZXJMYWJlbENoYW5nZUV2ZW50ID0gRXZlbnQuYW55KHRoaXMubGFiZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9ybWF0dGVycywgaW5zdGFsbGVkV2ViRXh0ZW5zaW9uc0NvbnRleHRDaGFuZ2VFdmVudCk7XG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2Ygc2VydmVycykge1xuXHRcdFx0Y29uc3QgZ2V0SW5zdGFsbGVkVmlld05hbWUgPSAoKTogc3RyaW5nID0+IGdldFZpZXdOYW1lKGxvY2FsaXplKCdpbnN0YWxsZWQnLCBcIkluc3RhbGxlZFwiKSwgc2VydmVyKTtcblx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlVGl0bGUgPSBFdmVudC5tYXA8dm9pZCwgc3RyaW5nPihzZXJ2ZXJMYWJlbENoYW5nZUV2ZW50LCAoKSA9PiBnZXRJbnN0YWxsZWRWaWV3TmFtZSgpKTtcblx0XHRcdGNvbnN0IGlkID0gc2VydmVycy5sZW5ndGggPiAxID8gYHdvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLiR7c2VydmVyLmlkfS5pbnN0YWxsZWRgIDogYHdvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLmluc3RhbGxlZGA7XG5cdFx0XHQvKiBJbnN0YWxsZWQgZXh0ZW5zaW9ucyB2aWV3ICovXG5cdFx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRnZXQgbmFtZSgpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dmFsdWU6IGdldEluc3RhbGxlZFZpZXdOYW1lKCksXG5cdFx0XHRcdFx0XHRvcmlnaW5hbDogZ2V0Vmlld05hbWUoJ0luc3RhbGxlZCcsIHNlcnZlcilcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR3ZWlnaHQ6IDEwMCxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChEZWZhdWx0Vmlld3NDb250ZXh0KSxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihTZXJ2ZXJJbnN0YWxsZWRFeHRlbnNpb25zVmlldywgW3sgc2VydmVyLCBmbGV4aWJsZUhlaWdodDogdHJ1ZSwgb25EaWRDaGFuZ2VUaXRsZSB9XSksXG5cdFx0XHRcdC8qIEluc3RhbGxlZCBleHRlbnNpb25zIHZpZXdzIHNoYWxsIG5vdCBiZSBhbGxvd2VkIHRvIGhpZGRlbiB3aGVuIHRoZXJlIGFyZSBtb3JlIHRoYW4gb25lIHNlcnZlciAqL1xuXHRcdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiBzZXJ2ZXJzLmxlbmd0aCA9PT0gMVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChzZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAmJiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgSW5zdGFsbExvY2FsRXh0ZW5zaW9uc0luUmVtb3RlQWN0aW9uMiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmluc3RhbGxMb2NhbEV4dGVuc2lvbnMnLFxuXHRcdFx0XHRcdFx0XHRnZXQgdGl0bGUoKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplMignc2VsZWN0IGFuZCBpbnN0YWxsIGxvY2FsIGV4dGVuc2lvbnMnLCBcIkluc3RhbGwgTG9jYWwgRXh0ZW5zaW9ucyBpbiAnezB9Jy4uLlwiLCBzZXJ2ZXIubGFiZWwpO1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRjYXRlZ29yeTogUkVNT1RFX0NBVEVHT1JZLFxuXHRcdFx0XHRcdFx0XHRpY29uOiBpbnN0YWxsTG9jYWxJblJlbW90ZUljb24sXG5cdFx0XHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgaWQpLFxuXHRcdFx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsTG9jYWxFeHRlbnNpb25zSW5SZW1vdGVBY3Rpb24pLnJ1bigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAmJiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBJbnN0YWxsUmVtb3RlRXh0ZW5zaW9uc0luTG9jYWxBY3Rpb24yIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9ucy5pbnN0YWxsTG9jYWxFeHRlbnNpb25zSW5SZW1vdGUnLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW5zdGFsbCByZW1vdGUgaW4gbG9jYWwnLCAnSW5zdGFsbCBSZW1vdGUgRXh0ZW5zaW9ucyBMb2NhbGx5Li4uJyksXG5cdFx0XHRcdFx0XHRjYXRlZ29yeTogUkVNT1RFX0NBVEVHT1JZLFxuXHRcdFx0XHRcdFx0ZjE6IHRydWVcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSkuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbFJlbW90ZUV4dGVuc2lvbnNJbkxvY2FsQWN0aW9uLCAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9ucy5pbnN0YWxsTG9jYWxFeHRlbnNpb25zSW5SZW1vdGUnKS5ydW4oKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8qXG5cdFx0ICogRGVmYXVsdCBwb3B1bGFyIGV4dGVuc2lvbnMgdmlld1xuXHRcdCAqIFNlcGFyYXRlIHZpZXcgZm9yIHBvcHVsYXIgZXh0ZW5zaW9ucyByZXF1aXJlZCBhcyB3ZSBuZWVkIHRvIHNob3cgcG9wdWxhciBhbmQgcmVjb21tZW5kZWQgc2VjdGlvbnNcblx0XHQgKiBpbiB0aGUgZGVmYXVsdCB2aWV3IHdoZW4gdGhlcmUgaXMgbm8gc2VhcmNoIHRleHQsIGFuZCB1c2VyIGhhcyBubyBpbnN0YWxsZWQgZXh0ZW5zaW9ucy5cblx0XHQgKi9cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLnBvcHVsYXInLFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCdwb3B1bGFyRXh0ZW5zaW9ucycsIFwiUG9wdWxhclwiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoRGVmYXVsdFBvcHVsYXJFeHRlbnNpb25zVmlldywgW3sgaGlkZUJhZGdlOiB0cnVlIH1dKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChEZWZhdWx0Vmlld3NDb250ZXh0LCBDb250ZXh0S2V5RXhwci5ub3QoJ2hhc0luc3RhbGxlZEV4dGVuc2lvbnMnKSwgQ09OVEVYVF9IQVNfR0FMTEVSWSksXG5cdFx0XHR3ZWlnaHQ6IDYwLFxuXHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiBmYWxzZVxuXHRcdH0pO1xuXG5cdFx0Lypcblx0XHQgKiBEZWZhdWx0IHJlY29tbWVuZGVkIGV4dGVuc2lvbnMgdmlld1xuXHRcdCAqIFdoZW4gdXNlciBoYXMgaW5zdGFsbGVkIGV4dGVuc2lvbnMsIHRoaXMgaXMgc2hvd24gYWxvbmcgd2l0aCB0aGUgdmlld3MgZm9yIGVuYWJsZWQgJiBkaXNhYmxlZCBleHRlbnNpb25zXG5cdFx0ICogV2hlbiB1c2VyIGhhcyBubyBpbnN0YWxsZWQgZXh0ZW5zaW9ucywgdGhpcyBpcyBzaG93biBhbG9uZyB3aXRoIHRoZSB2aWV3IGZvciBwb3B1bGFyIGV4dGVuc2lvbnNcblx0XHQgKi9cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRpZDogJ2V4dGVuc2lvbnMucmVjb21tZW5kZWRMaXN0Jyxcblx0XHRcdG5hbWU6IGxvY2FsaXplMigncmVjb21tZW5kZWRFeHRlbnNpb25zJywgXCJSZWNvbW1lbmRlZFwiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoRGVmYXVsdFJlY29tbWVuZGVkRXh0ZW5zaW9uc1ZpZXcsIFt7IGZsZXhpYmxlSGVpZ2h0OiB0cnVlIH1dKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChEZWZhdWx0Vmlld3NDb250ZXh0LCBTb3J0QnlVcGRhdGVEYXRlQ29udGV4dC5uZWdhdGUoKSwgQ29udGV4dEtleUV4cHIubm90KCdjb25maWcuZXh0ZW5zaW9ucy5zaG93UmVjb21tZW5kYXRpb25zT25seU9uRGVtYW5kJyksIENPTlRFWFRfSEFTX0dBTExFUlkpLFxuXHRcdFx0d2VpZ2h0OiA0MCxcblx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZVxuXHRcdH0pO1xuXG5cdFx0LyogSW5zdGFsbGVkIHZpZXdzIHNoYWxsIGJlIGRlZmF1bHQgaW4gbXVsdGkgc2VydmVyIHdpbmRvdyAgKi9cblx0XHRpZiAoc2VydmVycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdC8qXG5cdFx0XHQgKiBEZWZhdWx0IGVuYWJsZWQgZXh0ZW5zaW9ucyB2aWV3IC0gU2hvd3MgYWxsIHVzZXIgaW5zdGFsbGVkIGVuYWJsZWQgZXh0ZW5zaW9ucy5cblx0XHRcdCAqIEhpZGRlbiBieSBkZWZhdWx0XG5cdFx0XHQgKi9cblx0XHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy5lbmFibGVkJyxcblx0XHRcdFx0bmFtZTogbG9jYWxpemUyKCdlbmFibGVkRXh0ZW5zaW9ucycsIFwiRW5hYmxlZFwiKSxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihFbmFibGVkRXh0ZW5zaW9uc1ZpZXcsIFt7fV0pLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRGVmYXVsdFZpZXdzQ29udGV4dCwgQ29udGV4dEtleUV4cHIuaGFzKCdoYXNJbnN0YWxsZWRFeHRlbnNpb25zJykpLFxuXHRcdFx0XHRoaWRlQnlEZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHR3ZWlnaHQ6IDQwLFxuXHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdC8qXG5cdFx0XHQgKiBEZWZhdWx0IGRpc2FibGVkIGV4dGVuc2lvbnMgdmlldyAtIFNob3dzIGFsbCBkaXNhYmxlZCBleHRlbnNpb25zLlxuXHRcdFx0ICogSGlkZGVuIGJ5IGRlZmF1bHRcblx0XHRcdCAqL1xuXHRcdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLmRpc2FibGVkJyxcblx0XHRcdFx0bmFtZTogbG9jYWxpemUyKCdkaXNhYmxlZEV4dGVuc2lvbnMnLCBcIkRpc2FibGVkXCIpLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKERpc2FibGVkRXh0ZW5zaW9uc1ZpZXcsIFt7fV0pLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRGVmYXVsdFZpZXdzQ29udGV4dCwgQ29udGV4dEtleUV4cHIuaGFzKCdoYXNJbnN0YWxsZWRFeHRlbnNpb25zJykpLFxuXHRcdFx0XHRoaWRlQnlEZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHR3ZWlnaHQ6IDEwLFxuXHRcdFx0XHRvcmRlcjogNSxcblx0XHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHR9XG5cblx0XHRyZXR1cm4gdmlld0Rlc2NyaXB0b3JzO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTZWFyY2hFeHRlbnNpb25zVmlld0Rlc2NyaXB0b3JzKCk6IElWaWV3RGVzY3JpcHRvcltdIHtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcnM6IElWaWV3RGVzY3JpcHRvcltdID0gW107XG5cblx0XHQvKlxuXHRcdCAqIFZpZXcgdXNlZCBmb3Igc2VhcmNoaW5nIE1hcmtldHBsYWNlXG5cdFx0ICovXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy5tYXJrZXRwbGFjZScsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ21hcmtldFBsYWNlJywgXCJNYXJrZXRwbGFjZVwiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoU2VhcmNoTWFya2V0cGxhY2VFeHRlbnNpb25zVmlldywgW3t9XSksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuaGFzKCdzZWFyY2hNYXJrZXRwbGFjZUV4dGVuc2lvbnMnKSwgQ09OVEVYVF9IQVNfR0FMTEVSWSlcblx0XHR9KTtcblxuXHRcdC8qXG5cdFx0ICogVmlldyB1c2VkIGZvciBzZWFyY2hpbmcgYWxsIGluc3RhbGxlZCBleHRlbnNpb25zXG5cdFx0ICovXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy5zZWFyY2hJbnN0YWxsZWQnLFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCdpbnN0YWxsZWQnLCBcIkluc3RhbGxlZFwiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoRXh0ZW5zaW9uc0xpc3RWaWV3LCBbe31dKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKENvbnRleHRLZXlFeHByLmhhcygnc2VhcmNoSW5zdGFsbGVkRXh0ZW5zaW9ucycpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2luc3RhbGxlZEV4dGVuc2lvbnMnKSksXG5cdFx0fSk7XG5cblx0XHQvKlxuXHRcdCAqIFZpZXcgdXNlZCBmb3Igc2VhcmNoaW5nIHJlY2VudGx5IHVwZGF0ZWQgZXh0ZW5zaW9uc1xuXHRcdCAqL1xuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMuc2VhcmNoUmVjZW50bHlVcGRhdGVkJyxcblx0XHRcdG5hbWU6IGxvY2FsaXplMigncmVjZW50bHkgdXBkYXRlZCcsIFwiUmVjZW50bHkgVXBkYXRlZFwiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoUmVjZW50bHlVcGRhdGVkRXh0ZW5zaW9uc1ZpZXcsIFt7fV0pLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoU2VhcmNoRXh0ZW5zaW9uVXBkYXRlc0NvbnRleHQsIENvbnRleHRLZXlFeHByLmhhcygnc2VhcmNoUmVjZW50bHlVcGRhdGVkRXh0ZW5zaW9ucycpKSxcblx0XHRcdG9yZGVyOiAyLFxuXHRcdH0pO1xuXG5cdFx0Lypcblx0XHQgKiBWaWV3IHVzZWQgZm9yIHNlYXJjaGluZyBlbmFibGVkIGV4dGVuc2lvbnNcblx0XHQgKi9cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLnNlYXJjaEVuYWJsZWQnLFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCdlbmFibGVkJywgXCJFbmFibGVkXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihFeHRlbnNpb25zTGlzdFZpZXcsIFt7fV0pLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmhhcygnc2VhcmNoRW5hYmxlZEV4dGVuc2lvbnMnKSksXG5cdFx0fSk7XG5cblx0XHQvKlxuXHRcdCAqIFZpZXcgdXNlZCBmb3Igc2VhcmNoaW5nIGRpc2FibGVkIGV4dGVuc2lvbnNcblx0XHQgKi9cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLnNlYXJjaERpc2FibGVkJyxcblx0XHRcdG5hbWU6IGxvY2FsaXplMignZGlzYWJsZWQnLCBcIkRpc2FibGVkXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihFeHRlbnNpb25zTGlzdFZpZXcsIFt7fV0pLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmhhcygnc2VhcmNoRGlzYWJsZWRFeHRlbnNpb25zJykpLFxuXHRcdH0pO1xuXG5cdFx0Lypcblx0XHQgKiBWaWV3IHVzZWQgZm9yIHNlYXJjaGluZyBvdXRkYXRlZCBleHRlbnNpb25zXG5cdFx0ICovXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6IE9VVERBVEVEX0VYVEVOU0lPTlNfVklFV19JRCxcblx0XHRcdG5hbWU6IGxvY2FsaXplMignYXZhaWxhYmxlVXBkYXRlcycsIFwiQXZhaWxhYmxlIFVwZGF0ZXNcIiksXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKE91dGRhdGVkRXh0ZW5zaW9uc1ZpZXcsIFt7fV0pLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoU2VhcmNoRXh0ZW5zaW9uVXBkYXRlc0NvbnRleHQsIENvbnRleHRLZXlFeHByLmhhcygnc2VhcmNoT3V0ZGF0ZWRFeHRlbnNpb25zJykpLFxuXHRcdFx0b3JkZXI6IDEsXG5cdFx0fSk7XG5cblx0XHQvKlxuXHRcdCAqIFZpZXcgdXNlZCBmb3Igc2VhcmNoaW5nIGJ1aWx0aW4gZXh0ZW5zaW9uc1xuXHRcdCAqL1xuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMuc2VhcmNoQnVpbHRpbicsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ2J1aWx0aW4nLCBcIkJ1aWx0aW5cIiksXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKEV4dGVuc2lvbnNMaXN0VmlldywgW3t9XSksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuaGFzKCdzZWFyY2hCdWlsdEluRXh0ZW5zaW9ucycpKSxcblx0XHR9KTtcblxuXHRcdC8qXG5cdFx0ICogVmlldyB1c2VkIGZvciBzZWFyY2hpbmcgd29ya3NwYWNlIHVuc3VwcG9ydGVkIGV4dGVuc2lvbnNcblx0XHQgKi9cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLnNlYXJjaFdvcmtzcGFjZVVuc3VwcG9ydGVkJyxcblx0XHRcdG5hbWU6IGxvY2FsaXplMignd29ya3NwYWNlVW5zdXBwb3J0ZWQnLCBcIldvcmtzcGFjZSBVbnN1cHBvcnRlZFwiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoRXh0ZW5zaW9uc0xpc3RWaWV3LCBbe31dKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5oYXMoJ3NlYXJjaFdvcmtzcGFjZVVuc3VwcG9ydGVkRXh0ZW5zaW9ucycpKSxcblx0XHR9KTtcblxuXHRcdHJldHVybiB2aWV3RGVzY3JpcHRvcnM7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVJlY29tbWVuZGVkRXh0ZW5zaW9uc1ZpZXdEZXNjcmlwdG9ycygpOiBJVmlld0Rlc2NyaXB0b3JbXSB7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JzOiBJVmlld0Rlc2NyaXB0b3JbXSA9IFtdO1xuXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6IFdPUktTUEFDRV9SRUNPTU1FTkRBVElPTlNfVklFV19JRCxcblx0XHRcdG5hbWU6IGxvY2FsaXplMignd29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zJywgXCJXb3Jrc3BhY2UgUmVjb21tZW5kYXRpb25zXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihXb3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnNWaWV3LCBbe31dKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5oYXMoJ3JlY29tbWVuZGVkRXh0ZW5zaW9ucycpLCBXb3JrYmVuY2hTdGF0ZUNvbnRleHQubm90RXF1YWxzVG8oJ2VtcHR5JykpLFxuXHRcdFx0b3JkZXI6IDFcblx0XHR9KTtcblxuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMub3RoZXJSZWNvbW1lbmRhdGlvbnMnLFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCdvdGhlclJlY29tbWVuZGVkRXh0ZW5zaW9ucycsIFwiT3RoZXIgUmVjb21tZW5kYXRpb25zXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihSZWNvbW1lbmRlZEV4dGVuc2lvbnNWaWV3LCBbe31dKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmhhcygncmVjb21tZW5kZWRFeHRlbnNpb25zJyksXG5cdFx0XHRvcmRlcjogMlxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHZpZXdEZXNjcmlwdG9ycztcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQnVpbHRpbkV4dGVuc2lvbnNWaWV3RGVzY3JpcHRvcnMoKTogSVZpZXdEZXNjcmlwdG9yW10ge1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yczogSVZpZXdEZXNjcmlwdG9yW10gPSBbXTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyZWRDYXRlZ29yaWVzID0gWyd0aGVtZXMnLCAncHJvZ3JhbW1pbmcgbGFuZ3VhZ2VzJ107XG5cdFx0Y29uc3Qgb3RoZXJDYXRlZ29yaWVzID0gRVhURU5TSU9OX0NBVEVHT1JJRVMuZmlsdGVyKGMgPT4gIWNvbmZpZ3VyZWRDYXRlZ29yaWVzLmluY2x1ZGVzKGMudG9Mb3dlckNhc2UoKSkpO1xuXHRcdG90aGVyQ2F0ZWdvcmllcy5wdXNoKE5PTkVfQ0FURUdPUlkpO1xuXHRcdGNvbnN0IG90aGVyQ2F0ZWdvcmllc1F1ZXJ5ID0gYCR7b3RoZXJDYXRlZ29yaWVzLm1hcChjID0+IGBjYXRlZ29yeTpcIiR7Y31cImApLmpvaW4oJyAnKX0gJHtjb25maWd1cmVkQ2F0ZWdvcmllcy5tYXAoYyA9PiBgY2F0ZWdvcnk6XCItJHtjfVwiYCkuam9pbignICcpfWA7XG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy5idWlsdGluRmVhdHVyZUV4dGVuc2lvbnMnLFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCdidWlsdGluRmVhdHVyZUV4dGVuc2lvbnMnLCBcIkZlYXR1cmVzXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihTdGF0aWNRdWVyeUV4dGVuc2lvbnNWaWV3LCBbeyBxdWVyeTogYEBidWlsdGluICR7b3RoZXJDYXRlZ29yaWVzUXVlcnl9YCB9XSksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoJ2J1aWx0SW5FeHRlbnNpb25zJyksXG5cdFx0fSk7XG5cblx0XHR2aWV3RGVzY3JpcHRvcnMucHVzaCh7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5leHRlbnNpb25zLmJ1aWx0aW5UaGVtZUV4dGVuc2lvbnMnLFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCdidWlsdEluVGhlbWVzRXh0ZW5zaW9ucycsIFwiVGhlbWVzXCIpLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihTdGF0aWNRdWVyeUV4dGVuc2lvbnNWaWV3LCBbeyBxdWVyeTogYEBidWlsdGluIGNhdGVnb3J5OnRoZW1lc2AgfV0pLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuaGFzKCdidWlsdEluRXh0ZW5zaW9ucycpLFxuXHRcdH0pO1xuXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy5idWlsdGluUHJvZ3JhbW1pbmdMYW5ndWFnZUV4dGVuc2lvbnMnLFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCdidWlsdGluUHJvZ3JhbW1pbmdMYW5ndWFnZUV4dGVuc2lvbnMnLCBcIlByb2dyYW1taW5nIExhbmd1YWdlc1wiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoU3RhdGljUXVlcnlFeHRlbnNpb25zVmlldywgW3sgcXVlcnk6IGBAYnVpbHRpbiBjYXRlZ29yeTpcInByb2dyYW1taW5nIGxhbmd1YWdlc1wiYCB9XSksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoJ2J1aWx0SW5FeHRlbnNpb25zJyksXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdmlld0Rlc2NyaXB0b3JzO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVVbnN1cHBvcnRlZFdvcmtzcGFjZUV4dGVuc2lvbnNWaWV3RGVzY3JpcHRvcnMoKTogSVZpZXdEZXNjcmlwdG9yW10ge1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yczogSVZpZXdEZXNjcmlwdG9yW10gPSBbXTtcblxuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMudW50cnVzdGVkVW5zdXBwb3J0ZWRFeHRlbnNpb25zJyxcblx0XHRcdG5hbWU6IGxvY2FsaXplMigndW50cnVzdGVkVW5zdXBwb3J0ZWRFeHRlbnNpb25zJywgXCJEaXNhYmxlZCBpbiBSZXN0cmljdGVkIE1vZGVcIiksXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFVudHJ1c3RlZFdvcmtzcGFjZVVuc3VwcG9ydGVkRXh0ZW5zaW9uc1ZpZXcsIFt7fV0pLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFNlYXJjaFVuc3VwcG9ydGVkV29ya3NwYWNlRXh0ZW5zaW9uc0NvbnRleHQpLFxuXHRcdH0pO1xuXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy51bnRydXN0ZWRQYXJ0aWFsbHlTdXBwb3J0ZWRFeHRlbnNpb25zJyxcblx0XHRcdG5hbWU6IGxvY2FsaXplMigndW50cnVzdGVkUGFydGlhbGx5U3VwcG9ydGVkRXh0ZW5zaW9ucycsIFwiTGltaXRlZCBpbiBSZXN0cmljdGVkIE1vZGVcIiksXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFVudHJ1c3RlZFdvcmtzcGFjZVBhcnRpYWxseVN1cHBvcnRlZEV4dGVuc2lvbnNWaWV3LCBbe31dKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChTZWFyY2hVbnN1cHBvcnRlZFdvcmtzcGFjZUV4dGVuc2lvbnNDb250ZXh0KSxcblx0XHR9KTtcblxuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMudmlydHVhbFVuc3VwcG9ydGVkRXh0ZW5zaW9ucycsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ3ZpcnR1YWxVbnN1cHBvcnRlZEV4dGVuc2lvbnMnLCBcIkRpc2FibGVkIGluIFZpcnR1YWwgV29ya3NwYWNlc1wiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoVmlydHVhbFdvcmtzcGFjZVVuc3VwcG9ydGVkRXh0ZW5zaW9uc1ZpZXcsIFt7fV0pLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFZpcnR1YWxXb3Jrc3BhY2VDb250ZXh0LCBTZWFyY2hVbnN1cHBvcnRlZFdvcmtzcGFjZUV4dGVuc2lvbnNDb250ZXh0KSxcblx0XHR9KTtcblxuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMudmlydHVhbFBhcnRpYWxseVN1cHBvcnRlZEV4dGVuc2lvbnMnLFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCd2aXJ0dWFsUGFydGlhbGx5U3VwcG9ydGVkRXh0ZW5zaW9ucycsIFwiTGltaXRlZCBpbiBWaXJ0dWFsIFdvcmtzcGFjZXNcIiksXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFZpcnR1YWxXb3Jrc3BhY2VQYXJ0aWFsbHlTdXBwb3J0ZWRFeHRlbnNpb25zVmlldywgW3t9XSksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVmlydHVhbFdvcmtzcGFjZUNvbnRleHQsIFNlYXJjaFVuc3VwcG9ydGVkV29ya3NwYWNlRXh0ZW5zaW9uc0NvbnRleHQpLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHZpZXdEZXNjcmlwdG9ycztcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlT3RoZXJMb2NhbEZpbHRlcmVkRXh0ZW5zaW9uc1ZpZXdEZXNjcmlwdG9ycygpOiBJVmlld0Rlc2NyaXB0b3JbXSB7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JzOiBJVmlld0Rlc2NyaXB0b3JbXSA9IFtdO1xuXG5cdFx0dmlld0Rlc2NyaXB0b3JzLnB1c2goe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MuZXh0ZW5zaW9ucy5kZXByZWNhdGVkRXh0ZW5zaW9ucycsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ2RlcHJlY2F0ZWQnLCBcIkRlcHJlY2F0ZWRcIiksXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKERlcHJlY2F0ZWRFeHRlbnNpb25zVmlldywgW3t9XSksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoU2VhcmNoRGVwcmVjYXRlZEV4dGVuc2lvbnNDb250ZXh0KSxcblx0XHR9KTtcblxuXHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLmV4dGVuc2lvbnMucmVzdGFydFJlcXVpcmVkJyxcblx0XHRcdG5hbWU6IGxvY2FsaXplMigncmVzdGFydCByZXF1aXJlZCcsIFwiUmVzdGFydCBSZXF1aXJlZFwiKSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoRXh0ZW5zaW9uc0xpc3RWaWV3LCBbe31dKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChTZWFyY2hSZXN0YXJ0UmVxdWlyZWRFeHRlbnNpb25zQ29udGV4dCksXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdmlld0Rlc2NyaXB0b3JzO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbnNWaWV3UGFuZUNvbnRhaW5lciBleHRlbmRzIFZpZXdQYW5lQ29udGFpbmVyPElFeHRlbnNpb25zVmlld2xldFN0YXRlPiBpbXBsZW1lbnRzIElFeHRlbnNpb25zVmlld1BhbmVDb250YWluZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1NlYXJjaFZhbHVlQ29udGV4dEtleTogSUNvbnRleHRLZXk8c3RyaW5nPjtcblx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0Vmlld3NDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBzb3J0QnlDb250ZXh0S2V5OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlYXJjaE1hcmtldHBsYWNlRXh0ZW5zaW9uc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlYXJjaE1jcFNlcnZlcnNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBzZWFyY2hBZ2VudFBsdWdpbnNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBzZWFyY2hIYXNUZXh0Q29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgc29ydEJ5VXBkYXRlRGF0ZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGluc3RhbGxlZEV4dGVuc2lvbnNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBzZWFyY2hJbnN0YWxsZWRFeHRlbnNpb25zQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoUmVjZW50bHlVcGRhdGVkRXh0ZW5zaW9uc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlYXJjaEV4dGVuc2lvblVwZGF0ZXNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBzZWFyY2hPdXRkYXRlZEV4dGVuc2lvbnNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBzZWFyY2hFbmFibGVkRXh0ZW5zaW9uc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlYXJjaERpc2FibGVkRXh0ZW5zaW9uc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGhhc0luc3RhbGxlZEV4dGVuc2lvbnNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBidWlsdEluRXh0ZW5zaW9uc0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlYXJjaEJ1aWx0SW5FeHRlbnNpb25zQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoV29ya3NwYWNlVW5zdXBwb3J0ZWRFeHRlbnNpb25zQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoRGVwcmVjYXRlZEV4dGVuc2lvbnNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBzZWFyY2hSZXN0YXJ0UmVxdWlyZWRFeHRlbnNpb25zQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVjb21tZW5kZWRFeHRlbnNpb25zQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBzZWFyY2hEZWxheWVyOiBEZWxheWVyPHZvaWQ+O1xuXHRwcml2YXRlIHJvb3Q6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGhlYWRlcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2VhcmNoQm94OiBTdWdnZXN0RW5hYmxlZElucHV0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG5vdGlmaWNhdGlvbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoVmlld2xldFN0YXRlOiBJRXh0ZW5zaW9uc1ZpZXdsZXRTdGF0ZTtcblx0cHJpdmF0ZSBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Q6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhbmVDb21wb3NpdGVTZXJ2aWNlOiBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFZJRVdMRVRfSUQsIHsgbWVyZ2VWaWV3V2l0aENvbnRhaW5lcldoZW5TaW5nbGVWaWV3OiB0cnVlIH0sIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgbGF5b3V0U2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBjb250ZXh0U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblxuXHRcdHRoaXMuc2VhcmNoRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyKDUwMCkpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uc1NlYXJjaFZhbHVlQ29udGV4dEtleSA9IEV4dGVuc2lvbnNTZWFyY2hWYWx1ZUNvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmRlZmF1bHRWaWV3c0NvbnRleHRLZXkgPSBEZWZhdWx0Vmlld3NDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zb3J0QnlDb250ZXh0S2V5ID0gRXh0ZW5zaW9uc1NvcnRCeUNvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNlYXJjaE1hcmtldHBsYWNlRXh0ZW5zaW9uc0NvbnRleHRLZXkgPSBTZWFyY2hNYXJrZXRwbGFjZUV4dGVuc2lvbnNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hNY3BTZXJ2ZXJzQ29udGV4dEtleSA9IFNlYXJjaE1jcFNlcnZlcnNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hBZ2VudFBsdWdpbnNDb250ZXh0S2V5ID0gU2VhcmNoQWdlbnRQbHVnaW5zQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoSGFzVGV4dENvbnRleHRLZXkgPSBTZWFyY2hIYXNUZXh0Q29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc29ydEJ5VXBkYXRlRGF0ZUNvbnRleHRLZXkgPSBTb3J0QnlVcGRhdGVEYXRlQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaW5zdGFsbGVkRXh0ZW5zaW9uc0NvbnRleHRLZXkgPSBJbnN0YWxsZWRFeHRlbnNpb25zQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoSW5zdGFsbGVkRXh0ZW5zaW9uc0NvbnRleHRLZXkgPSBTZWFyY2hJbnN0YWxsZWRFeHRlbnNpb25zQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoUmVjZW50bHlVcGRhdGVkRXh0ZW5zaW9uc0NvbnRleHRLZXkgPSBTZWFyY2hSZWNlbnRseVVwZGF0ZWRFeHRlbnNpb25zQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoRXh0ZW5zaW9uVXBkYXRlc0NvbnRleHRLZXkgPSBTZWFyY2hFeHRlbnNpb25VcGRhdGVzQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoV29ya3NwYWNlVW5zdXBwb3J0ZWRFeHRlbnNpb25zQ29udGV4dEtleSA9IFNlYXJjaFVuc3VwcG9ydGVkV29ya3NwYWNlRXh0ZW5zaW9uc0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNlYXJjaERlcHJlY2F0ZWRFeHRlbnNpb25zQ29udGV4dEtleSA9IFNlYXJjaERlcHJlY2F0ZWRFeHRlbnNpb25zQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoUmVzdGFydFJlcXVpcmVkRXh0ZW5zaW9uc0NvbnRleHRLZXkgPSBTZWFyY2hSZXN0YXJ0UmVxdWlyZWRFeHRlbnNpb25zQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoT3V0ZGF0ZWRFeHRlbnNpb25zQ29udGV4dEtleSA9IFNlYXJjaE91dGRhdGVkRXh0ZW5zaW9uc0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNlYXJjaEVuYWJsZWRFeHRlbnNpb25zQ29udGV4dEtleSA9IFNlYXJjaEVuYWJsZWRFeHRlbnNpb25zQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoRGlzYWJsZWRFeHRlbnNpb25zQ29udGV4dEtleSA9IFNlYXJjaERpc2FibGVkRXh0ZW5zaW9uc0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmhhc0luc3RhbGxlZEV4dGVuc2lvbnNDb250ZXh0S2V5ID0gSGFzSW5zdGFsbGVkRXh0ZW5zaW9uc0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmJ1aWx0SW5FeHRlbnNpb25zQ29udGV4dEtleSA9IEJ1aWx0SW5FeHRlbnNpb25zQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoQnVpbHRJbkV4dGVuc2lvbnNDb250ZXh0S2V5ID0gU2VhcmNoQnVpbHRJbkV4dGVuc2lvbnNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5yZWNvbW1lbmRlZEV4dGVuc2lvbnNDb250ZXh0S2V5ID0gUmVjb21tZW5kZWRFeHRlbnNpb25zQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub25EaWRQYW5lQ29tcG9zaXRlT3BlbihlID0+IHsgaWYgKGUudmlld0NvbnRhaW5lckxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcikgeyB0aGlzLm9uVmlld2xldE9wZW4oZS5jb21wb3NpdGUpOyB9IH0sIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vblJlc2V0KCgpID0+IHRoaXMucmVmcmVzaCgpKSk7XG5cdFx0dGhpcy5zZWFyY2hWaWV3bGV0U3RhdGUgPSB0aGlzLmdldE1lbWVudG8oU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KClcblx0XHRcdC50aGVuKGdhbGxlcnlNYW5pZmVzdCA9PiB7XG5cdFx0XHRcdHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0ID0gZ2FsbGVyeU1hbmlmZXN0O1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KGdhbGxlcnlNYW5pZmVzdCA9PiB7XG5cdFx0XHRcdFx0dGhpcy5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgPSBnYWxsZXJ5TWFuaWZlc3Q7XG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXHR9XG5cblx0Z2V0IHNlYXJjaFZhbHVlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc2VhcmNoQm94Py5nZXRWYWx1ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY3JlYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRwYXJlbnQuY2xhc3NMaXN0LmFkZCgnZXh0ZW5zaW9ucy12aWV3bGV0Jyk7XG5cdFx0dGhpcy5yb290ID0gcGFyZW50O1xuXG5cdFx0Y29uc3Qgb3ZlcmxheSA9IGFwcGVuZCh0aGlzLnJvb3QsICQoJy5vdmVybGF5JykpO1xuXHRcdGNvbnN0IG92ZXJsYXlCYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLmdldENvbG9yKFNJREVfQkFSX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCkgPz8gJyc7XG5cdFx0b3ZlcmxheS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBvdmVybGF5QmFja2dyb3VuZENvbG9yO1xuXHRcdGhpZGUob3ZlcmxheSk7XG5cblx0XHR0aGlzLmhlYWRlciA9IGFwcGVuZCh0aGlzLnJvb3QsICQoJy5oZWFkZXInKSk7XG5cdFx0Y29uc3QgcGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnc2VhcmNoRXh0ZW5zaW9ucycsIFwiU2VhcmNoIEV4dGVuc2lvbnMgaW4gTWFya2V0cGxhY2VcIik7XG5cblx0XHRjb25zdCBzZWFyY2hWYWx1ZSA9IHRoaXMuc2VhcmNoVmlld2xldFN0YXRlWydxdWVyeS52YWx1ZSddID8gdGhpcy5zZWFyY2hWaWV3bGV0U3RhdGVbJ3F1ZXJ5LnZhbHVlJ10gOiAnJztcblxuXHRcdGNvbnN0IHNlYXJjaENvbnRhaW5lciA9IGFwcGVuZCh0aGlzLmhlYWRlciwgJCgnLmV4dGVuc2lvbnMtc2VhcmNoLWNvbnRhaW5lcicpKTtcblxuXHRcdHRoaXMuc2VhcmNoQm94ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTdWdnZXN0RW5hYmxlZElucHV0LCBgJHtWSUVXTEVUX0lEfS5zZWFyY2hib3hgLCBzZWFyY2hDb250YWluZXIsIHtcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzOiBbJ0AnXSxcblx0XHRcdHNvcnRLZXk6IChpdGVtOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0aWYgKGl0ZW0uaW5kZXhPZignOicpID09PSAtMSkgeyByZXR1cm4gJ2EnOyB9XG5cdFx0XHRcdGVsc2UgaWYgKC9leHQ6Ly50ZXN0KGl0ZW0pIHx8IC9pZDovLnRlc3QoaXRlbSkgfHwgL3RhZzovLnRlc3QoaXRlbSkpIHsgcmV0dXJuICdiJzsgfVxuXHRcdFx0XHRlbHNlIGlmICgvc29ydDovLnRlc3QoaXRlbSkpIHsgcmV0dXJuICdjJzsgfVxuXHRcdFx0XHRlbHNlIHsgcmV0dXJuICdkJzsgfVxuXHRcdFx0fSxcblx0XHRcdHByb3ZpZGVSZXN1bHRzOiAocXVlcnk6IHN0cmluZykgPT4gUXVlcnkuc3VnZ2VzdGlvbnMocXVlcnksIHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KVxuXHRcdH0sIHBsYWNlaG9sZGVyLCAnZXh0ZW5zaW9uczpzZWFyY2hpbnB1dCcsIHsgcGxhY2Vob2xkZXJUZXh0OiBwbGFjZWhvbGRlciwgdmFsdWU6IHNlYXJjaFZhbHVlIH0pKTtcblxuXHRcdHRoaXMubm90aWZpY2F0aW9uQ29udGFpbmVyID0gYXBwZW5kKHRoaXMuaGVhZGVyLCAkKCcubm90aWZpY2F0aW9uLWNvbnRhaW5lci5oaWRkZW4nLCB7ICd0YWJpbmRleCc6ICcwJyB9KSk7XG5cdFx0dGhpcy5yZW5kZXJOb3RpZmljYWl0b24oKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uc05vdGlmaWNhdGlvbigoKSA9PiB0aGlzLnJlbmRlck5vdGlmaWNhaXRvbigpKSk7XG5cblx0XHR0aGlzLnVwZGF0ZUluc3RhbGxlZEV4dGVuc2lvbnNDb250ZXh0cygpO1xuXHRcdGlmICh0aGlzLnNlYXJjaEJveC5nZXRWYWx1ZSgpKSB7XG5cdFx0XHR0aGlzLnRyaWdnZXJTZWFyY2goKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaEJveC5vbklucHV0RGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuc29ydEJ5Q29udGV4dEtleS5zZXQoUXVlcnkucGFyc2UodGhpcy5zZWFyY2hCb3g/LmdldFZhbHVlKCkgPz8gJycpLnNvcnRCeSk7XG5cdFx0XHR0aGlzLnRyaWdnZXJTZWFyY2goKTtcblx0XHR9LCB0aGlzKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaEJveC5vblNob3VsZEZvY3VzUmVzdWx0cygoKSA9PiB0aGlzLmZvY3VzTGlzdFZpZXcoKSwgdGhpcykpO1xuXG5cdFx0Y29uc3QgY29udHJvbEVsZW1lbnQgPSBhcHBlbmQoc2VhcmNoQ29udGFpbmVyLCAkKCcuZXh0ZW5zaW9ucy1zZWFyY2gtYWN0aW9ucy1jb250YWluZXInKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgY29udHJvbEVsZW1lbnQsIGV4dGVuc2lvbnNTZWFyY2hBY3Rpb25zTWVudSwge1xuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHtcblx0XHRcdFx0cHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IGNyZWF0ZUFjdGlvblZpZXdJdGVtKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbiwgb3B0aW9ucylcblx0XHR9KSk7XG5cblx0XHQvLyBSZWdpc3RlciBEcmFnQW5kRHJvcCBzdXBwb3J0XG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IERyYWdBbmREcm9wT2JzZXJ2ZXIodGhpcy5yb290LCB7XG5cdFx0XHRvbkRyYWdFbnRlcjogKGU6IERyYWdFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5pc1N1cHBvcnRlZERyYWdFbGVtZW50KGUpKSB7XG5cdFx0XHRcdFx0c2hvdyhvdmVybGF5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG9uRHJhZ0xlYXZlOiAoZTogRHJhZ0V2ZW50KSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmlzU3VwcG9ydGVkRHJhZ0VsZW1lbnQoZSkpIHtcblx0XHRcdFx0XHRoaWRlKG92ZXJsYXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b25EcmFnT3ZlcjogKGU6IERyYWdFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5pc1N1cHBvcnRlZERyYWdFbGVtZW50KGUpKSB7XG5cdFx0XHRcdFx0ZS5kYXRhVHJhbnNmZXIhLmRyb3BFZmZlY3QgPSAnY29weSc7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvbkRyb3A6IGFzeW5jIChlOiBEcmFnRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuaXNTdXBwb3J0ZWREcmFnRWxlbWVudChlKSkge1xuXHRcdFx0XHRcdGhpZGUob3ZlcmxheSk7XG5cblx0XHRcdFx0XHRjb25zdCB2c2l4cyA9IGNvYWxlc2NlKChhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGV4dHJhY3RFZGl0b3JzQW5kRmlsZXNEcm9wRGF0YShhY2Nlc3NvciwgZSkpKVxuXHRcdFx0XHRcdFx0Lm1hcChlZGl0b3IgPT4gZWRpdG9yLnJlc291cmNlICYmIGV4dG5hbWUoZWRpdG9yLnJlc291cmNlKSA9PT0gJy52c2l4JyA/IGVkaXRvci5yZXNvdXJjZSA6IHVuZGVmaW5lZCkpO1xuXG5cdFx0XHRcdFx0aWYgKHZzaXhzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdC8vIEF0dGVtcHQgdG8gaW5zdGFsbCB0aGUgZXh0ZW5zaW9uKHMpXG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoSU5TVEFMTF9FWFRFTlNJT05fRlJPTV9WU0lYX0NPTU1BTkRfSUQsIHZzaXhzKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0c3VwZXIuY3JlYXRlKGFwcGVuZCh0aGlzLnJvb3QsICQoJy5leHRlbnNpb25zJykpKTtcblxuXHRcdGNvbnN0IGZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKHRyYWNrRm9jdXModGhpcy5yb290KSk7XG5cdFx0Y29uc3QgaXNTZWFyY2hCb3hGb2N1c2VkID0gKCkgPT4gdGhpcy5zZWFyY2hCb3g/LmlucHV0V2lkZ2V0Lmhhc1dpZGdldEZvY3VzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJOYXZpZ2FibGVDb250YWluZXIoe1xuXHRcdFx0bmFtZTogJ2V4dGVuc2lvbnNWaWV3Jyxcblx0XHRcdGZvY3VzTm90aWZpZXJzOiBbZm9jdXNUcmFja2VyXSxcblx0XHRcdGZvY3VzTmV4dFdpZGdldDogKCkgPT4ge1xuXHRcdFx0XHRpZiAoaXNTZWFyY2hCb3hGb2N1c2VkKCkpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzTGlzdFZpZXcoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGZvY3VzUHJldmlvdXNXaWRnZXQ6ICgpID0+IHtcblx0XHRcdFx0aWYgKCFpc1NlYXJjaEJveEZvY3VzZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuc2VhcmNoQm94Py5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHR0aGlzLnNlYXJjaEJveD8uZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2RpbWVuc2lvbjogRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRvdmVycmlkZSBsYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cdFx0aWYgKHRoaXMucm9vdCkge1xuXHRcdFx0dGhpcy5yb290LmNsYXNzTGlzdC50b2dnbGUoJ25hcnJvdycsIGRpbWVuc2lvbi53aWR0aCA8PSAyNTApO1xuXHRcdFx0dGhpcy5yb290LmNsYXNzTGlzdC50b2dnbGUoJ21pbmknLCBkaW1lbnNpb24ud2lkdGggPD0gMjAwKTtcblx0XHR9XG5cdFx0dGhpcy5zZWFyY2hCb3g/LmxheW91dChuZXcgRGltZW5zaW9uKGRpbWVuc2lvbi53aWR0aCAtIDM0IC0gLypwYWRkaW5nKi84IC0gKDI0ICogMiksIDIwKSk7XG5cdFx0Y29uc3Qgc2VhcmNoQm94SGVpZ2h0ID0gMjAgKyAyMSAvKm1hcmdpbiovO1xuXHRcdGNvbnN0IGhlYWRlckhlaWdodCA9IHRoaXMuaGVhZGVyICYmICEhdGhpcy5ub3RpZmljYXRpb25Db250YWluZXI/LmNoaWxkTm9kZXMubGVuZ3RoID8gdGhpcy5ub3RpZmljYXRpb25Db250YWluZXIuY2xpZW50SGVpZ2h0ICsgc2VhcmNoQm94SGVpZ2h0ICsgMTAgLyptYXJnaW4qLyA6IHNlYXJjaEJveEhlaWdodDtcblx0XHR0aGlzLmhlYWRlciEuc3R5bGUuaGVpZ2h0ID0gYCR7aGVhZGVySGVpZ2h0fXB4YDtcblx0XHRzdXBlci5sYXlvdXQobmV3IERpbWVuc2lvbihkaW1lbnNpb24ud2lkdGgsIGRpbWVuc2lvbi5oZWlnaHQgLSBoZWFkZXJIZWlnaHQpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldE9wdGltYWxXaWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiA0MDA7XG5cdH1cblxuXHRzZWFyY2godmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNlYXJjaEJveCAmJiB0aGlzLnNlYXJjaEJveC5nZXRWYWx1ZSgpICE9PSB2YWx1ZSkge1xuXHRcdFx0dGhpcy5zZWFyY2hCb3guc2V0VmFsdWUodmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlZnJlc2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy51cGRhdGVJbnN0YWxsZWRFeHRlbnNpb25zQ29udGV4dHMoKTtcblx0XHR0aGlzLmRvU2VhcmNoKHRydWUpO1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEF1dG9DaGVja1VwZGF0ZXNDb25maWd1cmF0aW9uS2V5KSkge1xuXHRcdFx0dGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5jaGVja0ZvclVwZGF0ZXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvbkRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVuZGVyTm90aWZpY2FpdG9uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5ub3RpZmljYXRpb25Db250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjbGVhck5vZGUodGhpcy5ub3RpZmljYXRpb25Db250YWluZXIpO1xuXHRcdHRoaXMubm90aWZpY2F0aW9uRGlzcG9zYWJsZXMudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgc3RhdHVzID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zTm90aWZpY2F0aW9uKCk7XG5cdFx0Y29uc3QgcXVlcnkgPSBzdGF0dXM/LnF1ZXJ5ID8/IHN0YXR1cz8uZXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IGBAaWQ6JHtleHRlbnNpb24uaWRlbnRpZmllci5pZH1gKS5qb2luKCcgJyk7XG5cdFx0aWYgKHN0YXR1cyAmJiAocXVlcnkgPT09IHRoaXMuc2VhcmNoQm94Py5nZXRWYWx1ZSgpIHx8ICF0aGlzLnNlYXJjaE1hcmtldHBsYWNlRXh0ZW5zaW9uc0NvbnRleHRLZXkuZ2V0KCkpKSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlUGxhaW5UZXh0ID0gaXNNYXJrZG93blN0cmluZyhzdGF0dXMubWVzc2FnZSkgPyByZW5kZXJBc1BsYWludGV4dChzdGF0dXMubWVzc2FnZSkgOiBzdGF0dXMubWVzc2FnZTtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIG1lc3NhZ2VQbGFpblRleHQpO1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25Db250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG5cdFx0XHRjb25zdCBtZXNzYWdlQ29udGFpbmVyID0gYXBwZW5kKHRoaXMubm90aWZpY2F0aW9uQ29udGFpbmVyLCAkKCcubWVzc2FnZS1jb250YWluZXInKSk7XG5cdFx0XHRhcHBlbmQobWVzc2FnZUNvbnRhaW5lciwgJCgnc3BhbicpKS5jbGFzc05hbWUgPSBTZXZlcml0eUljb24uY2xhc3NOYW1lKHN0YXR1cy5zZXZlcml0eSk7XG5cdFx0XHRjb25zdCBtZXNzYWdlVGV4dCA9IGFwcGVuZChtZXNzYWdlQ29udGFpbmVyLCAkKCdzcGFuLm1lc3NhZ2UtdGV4dCcpKTtcblx0XHRcdGNvbnN0IG1lc3NhZ2VFbGVtZW50ID0gYXBwZW5kKG1lc3NhZ2VUZXh0LCAkKCdzcGFuLm1lc3NhZ2UnKSk7XG5cdFx0XHRpZiAoaXNNYXJrZG93blN0cmluZyhzdGF0dXMubWVzc2FnZSkpIHtcblx0XHRcdFx0Y29uc3QgaXNUcnVzdGVkID0gc3RhdHVzLm1lc3NhZ2UuaXNUcnVzdGVkO1xuXHRcdFx0XHRjb25zdCBhbGxvd0NvbW1hbmRzID0gdHlwZW9mIGlzVHJ1c3RlZCA9PT0gJ29iamVjdCcgPyBpc1RydXN0ZWQuZW5hYmxlZENvbW1hbmRzIDogISFpc1RydXN0ZWQ7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uRGlzcG9zYWJsZXMudmFsdWUuYWRkKHJlbmRlck1hcmtkb3duKHN0YXR1cy5tZXNzYWdlLCB7XG5cdFx0XHRcdFx0YWN0aW9uSGFuZGxlcjogbGluayA9PiB7IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGxpbmssIHsgYWxsb3dDb21tYW5kcyB9KTsgfSxcblx0XHRcdFx0fSwgbWVzc2FnZUVsZW1lbnQpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1lc3NhZ2VFbGVtZW50LnRleHRDb250ZW50ID0gc3RhdHVzLm1lc3NhZ2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RhdHVzLmV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IHNob3dBY3Rpb24gPSBhcHBlbmQobWVzc2FnZVRleHQsXG5cdFx0XHRcdFx0JCgnc3Bhbi5tZXNzYWdlLXRleHQtYWN0aW9uJywge1xuXHRcdFx0XHRcdFx0J3RhYmluZGV4JzogJzAnLFxuXHRcdFx0XHRcdFx0J3JvbGUnOiAnYnV0dG9uJyxcblx0XHRcdFx0XHRcdCdhcmlhLWxhYmVsJzogYCR7bWVzc2FnZVBsYWluVGV4dH0uICR7bG9jYWxpemUoJ2NsaWNrIHNob3cnLCBcIkNsaWNrIHRvIFNob3dcIil9YFxuXHRcdFx0XHRcdH0sIGxvY2FsaXplKCdzaG93JywgXCJTaG93XCIpKSk7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uRGlzcG9zYWJsZXMudmFsdWUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihzaG93QWN0aW9uLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuc2VhcmNoKHF1ZXJ5ID8/ICcnKSkpO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvbkRpc3Bvc2FibGVzLnZhbHVlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoc2hvd0FjdGlvbiwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHN0YW5kYXJkS2V5Ym9hcmRFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRcdFx0aWYgKHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyIHx8IHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlNwYWNlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNlYXJjaChxdWVyeSA/PyAnJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGFwcGVuZCh0aGlzLm5vdGlmaWNhdGlvbkNvbnRhaW5lciwgJCgnLm5vdGlmaWNhdGlvbi1hY3Rpb25zJykpO1xuXHRcdFx0aWYgKHN0YXR1cy5hY3Rpb24pIHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uQnV0dG9uID0gYXBwZW5kKGFjdGlvbnNDb250YWluZXIsXG5cdFx0XHRcdFx0JCgnc3Bhbi5tZXNzYWdlLWFjdGlvbi1idXR0b24nLCB7XG5cdFx0XHRcdFx0XHQndGFiaW5kZXgnOiAnMCcsXG5cdFx0XHRcdFx0XHQncm9sZSc6ICdidXR0b24nLFxuXHRcdFx0XHRcdFx0J2FyaWEtbGFiZWwnOiBzdGF0dXMuYWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdH0sIHN0YXR1cy5hY3Rpb24ubGFiZWwpKTtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25EaXNwb3NhYmxlcy52YWx1ZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGFjdGlvbkJ1dHRvbiwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHRcdFx0UHJvbWlzZS5yZXNvbHZlKHN0YXR1cy5hY3Rpb24hLnJ1bigpKS5jYXRjaChlcnJvciA9PiB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IpKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvbkRpc3Bvc2FibGVzLnZhbHVlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYWN0aW9uQnV0dG9uLCBFdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhbmRhcmRLZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdFx0XHRpZiAoc3RhbmRhcmRLZXlib2FyZEV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIgfHwgc3RhbmRhcmRLZXlib2FyZEV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuU3BhY2UpIHtcblx0XHRcdFx0XHRcdFByb21pc2UucmVzb2x2ZShzdGF0dXMuYWN0aW9uIS5ydW4oKSkuY2F0Y2goZXJyb3IgPT4gdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGlzbWlzcyA9IHN0YXR1cy5kaXNtaXNzO1xuXHRcdFx0aWYgKGRpc21pc3MpIHtcblx0XHRcdFx0Y29uc3QgZGlzbWlzc0xhYmVsID0gbG9jYWxpemUoJ2Rpc21pc3Mgbm90aWZpY2F0aW9uJywgXCJEaXNtaXNzXCIpO1xuXHRcdFx0XHRjb25zdCBkaXNtaXNzQnV0dG9uID0gYXBwZW5kKGFjdGlvbnNDb250YWluZXIsXG5cdFx0XHRcdFx0JCgnc3Bhbi5kaXNtaXNzLWFjdGlvbi5jb2RpY29uLmNvZGljb24tY2xvc2UnLCB7XG5cdFx0XHRcdFx0XHQndGFiaW5kZXgnOiAnMCcsXG5cdFx0XHRcdFx0XHQncm9sZSc6ICdidXR0b24nLFxuXHRcdFx0XHRcdFx0J2FyaWEtbGFiZWwnOiBkaXNtaXNzTGFiZWwsXG5cdFx0XHRcdFx0XHQndGl0bGUnOiBkaXNtaXNzTGFiZWwsXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvbkRpc3Bvc2FibGVzLnZhbHVlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZGlzbWlzc0J1dHRvbiwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiBkaXNtaXNzKCkpKTtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25EaXNwb3NhYmxlcy52YWx1ZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRpc21pc3NCdXR0b24sIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0XHRjb25zdCBzdGFuZGFyZEtleWJvYXJkRXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRcdGlmIChzdGFuZGFyZEtleWJvYXJkRXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciB8fCBzdGFuZGFyZEtleWJvYXJkRXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5TcGFjZSkge1xuXHRcdFx0XHRcdFx0ZGlzbWlzcygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzdGFuZGFyZEtleWJvYXJkRXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25Db250YWluZXIucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHRcdGlmICh0aGlzLnNlYXJjaEJveCAmJiBFeHRlbnNpb25zTGlzdFZpZXcuaXNSZXN0YXJ0UmVxdWlyZWRRdWVyeSh0aGlzLnNlYXJjaEJveC5nZXRWYWx1ZSgpKSkge1xuXHRcdFx0XHR0aGlzLnNlYXJjaCgnJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2RpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5fZGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUluc3RhbGxlZEV4dGVuc2lvbnNDb250ZXh0cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5TG9jYWwoKTtcblx0XHR0aGlzLmhhc0luc3RhbGxlZEV4dGVuc2lvbnNDb250ZXh0S2V5LnNldChyZXN1bHQuc29tZShyID0+ICFyLmlzQnVpbHRpbikpO1xuXHR9XG5cblx0cHJpdmF0ZSB0cmlnZ2VyU2VhcmNoKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoRGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMuZG9TZWFyY2goKSwgdGhpcy5zZWFyY2hCb3ggJiYgdGhpcy5zZWFyY2hCb3guZ2V0VmFsdWUoKSA/IDUwMCA6IDApLnRoZW4odW5kZWZpbmVkLCBlcnIgPT4gdGhpcy5vbkVycm9yKGVycikpO1xuXHR9XG5cblx0cHJpdmF0ZSBub3JtYWxpemVkUXVlcnkoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5zZWFyY2hCb3hcblx0XHRcdD8gdGhpcy5zZWFyY2hCb3guZ2V0VmFsdWUoKVxuXHRcdFx0XHQudHJpbSgpXG5cdFx0XHRcdC5yZXBsYWNlKC9AY2F0ZWdvcnkvZywgJ2NhdGVnb3J5Jylcblx0XHRcdFx0LnJlcGxhY2UoL0B0YWc6L2csICd0YWc6Jylcblx0XHRcdFx0LnJlcGxhY2UoL0BleHQ6L2csICdleHQ6Jylcblx0XHRcdFx0LnJlcGxhY2UoL0BmZWF0dXJlZC9nLCAnZmVhdHVyZWQnKVxuXHRcdFx0XHQucmVwbGFjZSgvQHBvcHVsYXIvZywgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmICF0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAmJiAhdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyID8gJ0B3ZWInIDogJ0Bwb3B1bGFyJylcblx0XHRcdDogJyc7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2F2ZVN0YXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5zZWFyY2hCb3ggPyB0aGlzLnNlYXJjaEJveC5nZXRWYWx1ZSgpIDogJyc7XG5cdFx0aWYgKEV4dGVuc2lvbnNMaXN0Vmlldy5pc0xvY2FsRXh0ZW5zaW9uc1F1ZXJ5KHZhbHVlKSkge1xuXHRcdFx0dGhpcy5zZWFyY2hWaWV3bGV0U3RhdGVbJ3F1ZXJ5LnZhbHVlJ10gPSB2YWx1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZWFyY2hWaWV3bGV0U3RhdGVbJ3F1ZXJ5LnZhbHVlJ10gPSAnJztcblx0XHR9XG5cdFx0c3VwZXIuc2F2ZVN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGRvU2VhcmNoKHJlZnJlc2g/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLm5vcm1hbGl6ZWRRdWVyeSgpO1xuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKCgpID0+IHtcblx0XHRcdGNvbnN0IGlzUmVjb21tZW5kZWRFeHRlbnNpb25zUXVlcnkgPSBFeHRlbnNpb25zTGlzdFZpZXcuaXNSZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeSh2YWx1ZSk7XG5cdFx0XHR0aGlzLnNlYXJjaEhhc1RleHRDb250ZXh0S2V5LnNldCh2YWx1ZS50cmltKCkgIT09ICcnKTtcblx0XHRcdHRoaXMuZXh0ZW5zaW9uc1NlYXJjaFZhbHVlQ29udGV4dEtleS5zZXQodmFsdWUpO1xuXHRcdFx0dGhpcy5pbnN0YWxsZWRFeHRlbnNpb25zQ29udGV4dEtleS5zZXQoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzSW5zdGFsbGVkRXh0ZW5zaW9uc1F1ZXJ5KHZhbHVlKSk7XG5cdFx0XHR0aGlzLnNlYXJjaEluc3RhbGxlZEV4dGVuc2lvbnNDb250ZXh0S2V5LnNldChFeHRlbnNpb25zTGlzdFZpZXcuaXNTZWFyY2hJbnN0YWxsZWRFeHRlbnNpb25zUXVlcnkodmFsdWUpKTtcblx0XHRcdHRoaXMuc2VhcmNoUmVjZW50bHlVcGRhdGVkRXh0ZW5zaW9uc0NvbnRleHRLZXkuc2V0KEV4dGVuc2lvbnNMaXN0Vmlldy5pc1NlYXJjaFJlY2VudGx5VXBkYXRlZFF1ZXJ5KHZhbHVlKSAmJiAhRXh0ZW5zaW9uc0xpc3RWaWV3LmlzU2VhcmNoRXh0ZW5zaW9uVXBkYXRlc1F1ZXJ5KHZhbHVlKSk7XG5cdFx0XHR0aGlzLnNlYXJjaE91dGRhdGVkRXh0ZW5zaW9uc0NvbnRleHRLZXkuc2V0KEV4dGVuc2lvbnNMaXN0Vmlldy5pc091dGRhdGVkRXh0ZW5zaW9uc1F1ZXJ5KHZhbHVlKSAmJiAhRXh0ZW5zaW9uc0xpc3RWaWV3LmlzU2VhcmNoRXh0ZW5zaW9uVXBkYXRlc1F1ZXJ5KHZhbHVlKSk7XG5cdFx0XHR0aGlzLnNlYXJjaEV4dGVuc2lvblVwZGF0ZXNDb250ZXh0S2V5LnNldChFeHRlbnNpb25zTGlzdFZpZXcuaXNTZWFyY2hFeHRlbnNpb25VcGRhdGVzUXVlcnkodmFsdWUpKTtcblx0XHRcdHRoaXMuc2VhcmNoRW5hYmxlZEV4dGVuc2lvbnNDb250ZXh0S2V5LnNldChFeHRlbnNpb25zTGlzdFZpZXcuaXNFbmFibGVkRXh0ZW5zaW9uc1F1ZXJ5KHZhbHVlKSk7XG5cdFx0XHR0aGlzLnNlYXJjaERpc2FibGVkRXh0ZW5zaW9uc0NvbnRleHRLZXkuc2V0KEV4dGVuc2lvbnNMaXN0Vmlldy5pc0Rpc2FibGVkRXh0ZW5zaW9uc1F1ZXJ5KHZhbHVlKSk7XG5cdFx0XHR0aGlzLnNlYXJjaEJ1aWx0SW5FeHRlbnNpb25zQ29udGV4dEtleS5zZXQoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzU2VhcmNoQnVpbHRJbkV4dGVuc2lvbnNRdWVyeSh2YWx1ZSkpO1xuXHRcdFx0dGhpcy5zZWFyY2hXb3Jrc3BhY2VVbnN1cHBvcnRlZEV4dGVuc2lvbnNDb250ZXh0S2V5LnNldChFeHRlbnNpb25zTGlzdFZpZXcuaXNTZWFyY2hXb3Jrc3BhY2VVbnN1cHBvcnRlZEV4dGVuc2lvbnNRdWVyeSh2YWx1ZSkpO1xuXHRcdFx0dGhpcy5zZWFyY2hEZXByZWNhdGVkRXh0ZW5zaW9uc0NvbnRleHRLZXkuc2V0KEV4dGVuc2lvbnNMaXN0Vmlldy5pc1NlYXJjaERlcHJlY2F0ZWRFeHRlbnNpb25zUXVlcnkodmFsdWUpKTtcblx0XHRcdHRoaXMuc2VhcmNoUmVzdGFydFJlcXVpcmVkRXh0ZW5zaW9uc0NvbnRleHRLZXkuc2V0KEV4dGVuc2lvbnNMaXN0Vmlldy5pc1Jlc3RhcnRSZXF1aXJlZFF1ZXJ5KHZhbHVlKSk7XG5cdFx0XHR0aGlzLmJ1aWx0SW5FeHRlbnNpb25zQ29udGV4dEtleS5zZXQoRXh0ZW5zaW9uc0xpc3RWaWV3LmlzQnVpbHRJbkV4dGVuc2lvbnNRdWVyeSh2YWx1ZSkpO1xuXHRcdFx0dGhpcy5yZWNvbW1lbmRlZEV4dGVuc2lvbnNDb250ZXh0S2V5LnNldChpc1JlY29tbWVuZGVkRXh0ZW5zaW9uc1F1ZXJ5KTtcblx0XHRcdHRoaXMuc2VhcmNoTWNwU2VydmVyc0NvbnRleHRLZXkuc2V0KCEhdmFsdWUgJiYgL0BtY3BcXHM/LiovaS50ZXN0KHZhbHVlKSk7XG5cdFx0XHR0aGlzLnNlYXJjaEFnZW50UGx1Z2luc0NvbnRleHRLZXkuc2V0KCEhdmFsdWUgJiYgL0BhZ2VudFBsdWdpbnNcXHM/LiovaS50ZXN0KHZhbHVlKSk7XG5cdFx0XHR0aGlzLnNlYXJjaE1hcmtldHBsYWNlRXh0ZW5zaW9uc0NvbnRleHRLZXkuc2V0KCEhdmFsdWUgJiYgIUV4dGVuc2lvbnNMaXN0Vmlldy5pc0xvY2FsRXh0ZW5zaW9uc1F1ZXJ5KHZhbHVlKSAmJiAhaXNSZWNvbW1lbmRlZEV4dGVuc2lvbnNRdWVyeSAmJiAhdGhpcy5zZWFyY2hNY3BTZXJ2ZXJzQ29udGV4dEtleS5nZXQoKSAmJiAhdGhpcy5zZWFyY2hBZ2VudFBsdWdpbnNDb250ZXh0S2V5LmdldCgpKTtcblx0XHRcdHRoaXMuc29ydEJ5VXBkYXRlRGF0ZUNvbnRleHRLZXkuc2V0KEV4dGVuc2lvbnNMaXN0Vmlldy5pc1NvcnRVcGRhdGVEYXRlUXVlcnkodmFsdWUpKTtcblx0XHRcdHRoaXMuZGVmYXVsdFZpZXdzQ29udGV4dEtleS5zZXQoIXZhbHVlIHx8IEV4dGVuc2lvbnNMaXN0Vmlldy5pc1NvcnRJbnN0YWxsZWRFeHRlbnNpb25zUXVlcnkodmFsdWUpKTtcblx0XHR9KTtcblxuXHRcdHRoaXMucmVuZGVyTm90aWZpY2FpdG9uKCk7XG5cblx0XHRyZXR1cm4gdGhpcy5zaG93RXh0ZW5zaW9uc1ZpZXdzKHRoaXMucGFuZXMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIG9uRGlkQWRkVmlld0Rlc2NyaXB0b3JzKGFkZGVkOiBJQWRkZWRWaWV3RGVzY3JpcHRvclJlZltdKTogVmlld1BhbmVbXSB7XG5cdFx0Y29uc3QgYWRkZWRWaWV3cyA9IHN1cGVyLm9uRGlkQWRkVmlld0Rlc2NyaXB0b3JzKGFkZGVkKTtcblx0XHR0aGlzLnNob3dFeHRlbnNpb25zVmlld3MoYWRkZWRWaWV3cyk7XG5cdFx0cmV0dXJuIGFkZGVkVmlld3M7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3dFeHRlbnNpb25zVmlld3Modmlld3M6IFZpZXdQYW5lW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnByb2dyZXNzKFByb21pc2UuYWxsKHZpZXdzLm1hcChhc3luYyB2aWV3ID0+IHtcblx0XHRcdGlmICh2aWV3IGluc3RhbmNlb2YgQWJzdHJhY3RFeHRlbnNpb25zTGlzdFZpZXcpIHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB2aWV3LnNob3codGhpcy5ub3JtYWxpemVkUXVlcnkoKSk7XG5cdFx0XHRcdHRoaXMuYWxlcnRTZWFyY2hSZXN1bHQobW9kZWwubGVuZ3RoLCB2aWV3LmlkKTtcblx0XHRcdH1cblx0XHR9KSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhbGVydFNlYXJjaFJlc3VsdChjb3VudDogbnVtYmVyLCB2aWV3SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXcgPSB0aGlzLnZpZXdDb250YWluZXJNb2RlbC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLmZpbmQodmlldyA9PiB2aWV3LmlkID09PSB2aWV3SWQpO1xuXHRcdHN3aXRjaCAoY291bnQpIHtcblx0XHRcdGNhc2UgMDpcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIDE6XG5cdFx0XHRcdGlmICh2aWV3KSB7XG5cdFx0XHRcdFx0YWxlcnQobG9jYWxpemUoJ2V4dGVuc2lvbkZvdW5kSW5TZWN0aW9uJywgXCIxIGV4dGVuc2lvbiBmb3VuZCBpbiB0aGUgezB9IHNlY3Rpb24uXCIsIHZpZXcubmFtZS52YWx1ZSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFsZXJ0KGxvY2FsaXplKCdleHRlbnNpb25Gb3VuZCcsIFwiMSBleHRlbnNpb24gZm91bmQuXCIpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGlmICh2aWV3KSB7XG5cdFx0XHRcdFx0YWxlcnQobG9jYWxpemUoJ2V4dGVuc2lvbnNGb3VuZEluU2VjdGlvbicsIFwiezB9IGV4dGVuc2lvbnMgZm91bmQgaW4gdGhlIHsxfSBzZWN0aW9uLlwiLCBjb3VudCwgdmlldy5uYW1lLnZhbHVlKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YWxlcnQobG9jYWxpemUoJ2V4dGVuc2lvbnNGb3VuZCcsIFwiezB9IGV4dGVuc2lvbnMgZm91bmQuXCIsIGNvdW50KSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRGaXJzdEV4cGFuZGVkUGFuZSgpOiBFeHRlbnNpb25zTGlzdFZpZXcgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgcGFuZSBvZiB0aGlzLnBhbmVzKSB7XG5cdFx0XHRpZiAocGFuZS5pc0V4cGFuZGVkKCkgJiYgcGFuZSBpbnN0YW5jZW9mIEV4dGVuc2lvbnNMaXN0Vmlldykge1xuXHRcdFx0XHRyZXR1cm4gcGFuZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZm9jdXNMaXN0VmlldygpOiB2b2lkIHtcblx0XHRjb25zdCBwYW5lID0gdGhpcy5nZXRGaXJzdEV4cGFuZGVkUGFuZSgpO1xuXHRcdGlmIChwYW5lICYmIHBhbmUuY291bnQoKSA+IDApIHtcblx0XHRcdHBhbmUuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uVmlld2xldE9wZW4odmlld2xldDogSVBhbmVDb21wb3NpdGUpOiB2b2lkIHtcblx0XHRpZiAoIXZpZXdsZXQgfHwgdmlld2xldC5nZXRJZCgpID09PSBWSUVXTEVUX0lEKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2xvc2VFeHRlbnNpb25EZXRhaWxzT25WaWV3Q2hhbmdlS2V5KSkge1xuXHRcdFx0Y29uc3QgcHJvbWlzZXMgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5ncm91cHMubWFwKGdyb3VwID0+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9ycyA9IGdyb3VwLmVkaXRvcnMuZmlsdGVyKGlucHV0ID0+IGlucHV0IGluc3RhbmNlb2YgRXh0ZW5zaW9uc0lucHV0KTtcblxuXHRcdFx0XHRyZXR1cm4gZ3JvdXAuY2xvc2VFZGl0b3JzKGVkaXRvcnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHByb2dyZXNzPFQ+KHByb21pc2U6IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0XHRyZXR1cm4gdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uRXh0ZW5zaW9ucyB9LCAoKSA9PiBwcm9taXNlKTtcblx0fVxuXG5cdHByaXZhdGUgb25FcnJvcihlcnI6IEVycm9yKTogdm9pZCB7XG5cdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgJiYgZXJyLm1lc3NhZ2UgfHwgJyc7XG5cblx0XHRpZiAoL0VDT05OUkVGVVNFRC8udGVzdChtZXNzYWdlKSkge1xuXHRcdFx0Y29uc3QgZXJyb3IgPSBjcmVhdGVFcnJvcldpdGhBY3Rpb25zKGxvY2FsaXplKCdzdWdnZXN0UHJveHlFcnJvcicsIFwiTWFya2V0cGxhY2UgcmV0dXJuZWQgJ0VDT05OUkVGVVNFRCcuIFBsZWFzZSBjaGVjayB0aGUgJ2h0dHAucHJveHknIHNldHRpbmcuXCIpLCBbXG5cdFx0XHRcdG5ldyBBY3Rpb24oJ29wZW4gdXNlciBzZXR0aW5ncycsIGxvY2FsaXplKCdvcGVuIHVzZXIgc2V0dGluZ3MnLCBcIk9wZW4gVXNlciBTZXR0aW5nc1wiKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuVXNlclNldHRpbmdzKCkpXG5cdFx0XHRdKTtcblxuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyKTtcblx0fVxuXG5cdHByaXZhdGUgaXNTdXBwb3J0ZWREcmFnRWxlbWVudChlOiBEcmFnRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAoZS5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdGNvbnN0IHR5cGVzTG93ZXJDYXNlID0gZS5kYXRhVHJhbnNmZXIudHlwZXMubWFwKHQgPT4gdC50b0xvY2FsZUxvd2VyQ2FzZSgpKTtcblx0XHRcdHJldHVybiB0eXBlc0xvd2VyQ2FzZS5pbmRleE9mKCdmaWxlcycpICE9PSAtMTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN0YXR1c1VwZGF0ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBiYWRnZUhhbmRsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjdGl2aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMub25TZXJ2aWNlQ2hhbmdlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KEV2ZW50LmRlYm91bmNlKGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9uQ2hhbmdlLCAoKSA9PiB1bmRlZmluZWQsIDEwMCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5fc3RvcmUpLCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnNOb3RpZmljYXRpb24pKHRoaXMub25TZXJ2aWNlQ2hhbmdlLCB0aGlzKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uU2VydmljZUNoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLmJhZGdlSGFuZGxlLmNsZWFyKCk7XG5cdFx0bGV0IGJhZGdlOiBJQmFkZ2UgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBleHRlbnNpb25zTm90aWZpY2F0aW9uID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zTm90aWZpY2F0aW9uKCk7XG5cdFx0aWYgKGV4dGVuc2lvbnNOb3RpZmljYXRpb24gJiYgZXh0ZW5zaW9uc05vdGlmaWNhdGlvbi5zZXZlcml0eSA9PT0gU2V2ZXJpdHkuV2FybmluZykge1xuXHRcdFx0YmFkZ2UgPSBuZXcgV2FybmluZ0JhZGdlKCgpID0+IGlzTWFya2Rvd25TdHJpbmcoZXh0ZW5zaW9uc05vdGlmaWNhdGlvbi5tZXNzYWdlKSA/IHJlbmRlckFzUGxhaW50ZXh0KGV4dGVuc2lvbnNOb3RpZmljYXRpb24ubWVzc2FnZSkgOiBleHRlbnNpb25zTm90aWZpY2F0aW9uLm1lc3NhZ2UpO1xuXHRcdH1cblxuXHRcdGlmICghYmFkZ2UpIHtcblx0XHRcdGNvbnN0IGFjdGlvblJlcXVpcmVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBdXRvUmVzdGFydENvbmZpZ3VyYXRpb25LZXkpID09PSB0cnVlID8gW10gOiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGxlZC5maWx0ZXIoZSA9PiBlLnJ1bnRpbWVTdGF0ZSAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IG91dGRhdGVkID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vdXRkYXRlZC5yZWR1Y2UoKHIsIGUpID0+IHIgKyAodGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoZS5sb2NhbCEpICYmICFhY3Rpb25SZXF1aXJlZC5pbmNsdWRlcyhlKSAmJiAhdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pc0F1dG9VcGRhdGVEZWxheWVkKGUpID8gMSA6IDApLCAwKTtcblx0XHRcdGNvbnN0IG5ld0JhZGdlTnVtYmVyID0gb3V0ZGF0ZWQgKyBhY3Rpb25SZXF1aXJlZC5sZW5ndGg7XG5cdFx0XHRpZiAobmV3QmFkZ2VOdW1iZXIgPiAwKSB7XG5cdFx0XHRcdGxldCBtc2cgPSAnJztcblx0XHRcdFx0aWYgKG91dGRhdGVkKSB7XG5cdFx0XHRcdFx0bXNnICs9IG91dGRhdGVkID09PSAxID8gbG9jYWxpemUoJ2V4dGVuc2lvblRvVXBkYXRlJywgJ3swfSByZXF1aXJlcyB1cGRhdGUnLCBvdXRkYXRlZCkgOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uc1RvVXBkYXRlJywgJ3swfSByZXF1aXJlIHVwZGF0ZScsIG91dGRhdGVkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3V0ZGF0ZWQgPiAwICYmIGFjdGlvblJlcXVpcmVkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRtc2cgKz0gJywgJztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYWN0aW9uUmVxdWlyZWQubGVuZ3RoKSB7XG5cdFx0XHRcdFx0bXNnICs9IGFjdGlvblJlcXVpcmVkLmxlbmd0aCA9PT0gMSA/IGxvY2FsaXplKCdleHRlbnNpb25Ub1JlbG9hZCcsICd7MH0gcmVxdWlyZXMgcmVzdGFydCcsIGFjdGlvblJlcXVpcmVkLmxlbmd0aCkgOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uc1RvUmVsb2FkJywgJ3swfSByZXF1aXJlIHJlc3RhcnQnLCBhY3Rpb25SZXF1aXJlZC5sZW5ndGgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJhZGdlID0gbmV3IE51bWJlckJhZGdlKG5ld0JhZGdlTnVtYmVyLCAoKSA9PiBtc2cpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChiYWRnZSkge1xuXHRcdFx0dGhpcy5iYWRnZUhhbmRsZS52YWx1ZSA9IHRoaXMuYWN0aXZpdHlTZXJ2aWNlLnNob3dWaWV3Q29udGFpbmVyQWN0aXZpdHkoVklFV0xFVF9JRCwgeyBiYWRnZSB9KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hbGljaW91c0V4dGVuc2lvbkNoZWNrZXIgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMubG9vcENoZWNrRm9yTWFsaWNpb3VzRXh0ZW5zaW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBsb29wQ2hlY2tGb3JNYWxpY2lvdXNFeHRlbnNpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuY2hlY2tGb3JNYWxpY2lvdXNFeHRlbnNpb25zKClcblx0XHRcdC50aGVuKCgpID0+IHRpbWVvdXQoMTAwMCAqIDYwICogNSkpIC8vIGV2ZXJ5IGZpdmUgbWludXRlc1xuXHRcdFx0LnRoZW4oKCkgPT4gdGhpcy5sb29wQ2hlY2tGb3JNYWxpY2lvdXNFeHRlbnNpb25zKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjaGVja0Zvck1hbGljaW91c0V4dGVuc2lvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1hbGljaW91c0V4dGVuc2lvbnM6IFtJTG9jYWxFeHRlbnNpb24sIHN0cmluZyB8IHVuZGVmaW5lZF1bXSA9IFtdO1xuXHRcdFx0bGV0IHNob3VsZFJlc3RhcnRFeHRlbnNpb25zID0gZmFsc2U7XG5cdFx0XHRsZXQgc2hvdWxkUmVsb2FkV2luZG93ID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGxlZCkge1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLmlzTWFsaWNpb3VzICYmIGV4dGVuc2lvbi5sb2NhbCkge1xuXHRcdFx0XHRcdG1hbGljaW91c0V4dGVuc2lvbnMucHVzaChbZXh0ZW5zaW9uLmxvY2FsLCBleHRlbnNpb24ubWFsaWNpb3VzSW5mb0xpbmtdKTtcblx0XHRcdFx0XHRzaG91bGRSZXN0YXJ0RXh0ZW5zaW9ucyA9IHNob3VsZFJlc3RhcnRFeHRlbnNpb25zIHx8IGV4dGVuc2lvbi5ydW50aW1lU3RhdGU/LmFjdGlvbiA9PT0gRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUuUmVzdGFydEV4dGVuc2lvbnM7XG5cdFx0XHRcdFx0c2hvdWxkUmVsb2FkV2luZG93ID0gc2hvdWxkUmVsb2FkV2luZG93IHx8IGV4dGVuc2lvbi5ydW50aW1lU3RhdGU/LmFjdGlvbiA9PT0gRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUuUmVsb2FkV2luZG93O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAobWFsaWNpb3VzRXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UudW5pbnN0YWxsRXh0ZW5zaW9ucyhtYWxpY2lvdXNFeHRlbnNpb25zLm1hcChlID0+ICh7IGV4dGVuc2lvbjogZVswXSwgb3B0aW9uczogeyByZW1vdmU6IHRydWUgfSB9KSkpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtleHRlbnNpb24sIGxpbmtdIG9mIG1hbGljaW91c0V4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRjb25zdCBidXR0b25zOiBJUHJvbXB0Q2hvaWNlW10gPSBbXTtcblx0XHRcdFx0XHRpZiAoc2hvdWxkUmVzdGFydEV4dGVuc2lvbnMgfHwgc2hvdWxkUmVsb2FkV2luZG93KSB7XG5cdFx0XHRcdFx0XHRidXR0b25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogc2hvdWxkUmVzdGFydEV4dGVuc2lvbnMgPyBsb2NhbGl6ZSgncmVzdGFydE5vdycsIFwiUmVzdGFydCBFeHRlbnNpb25zXCIpIDogbG9jYWxpemUoJ3JlbG9hZE5vdycsIFwiUmVsb2FkIE5vd1wiKSxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBzaG91bGRSZXN0YXJ0RXh0ZW5zaW9ucyA/IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UudXBkYXRlUnVubmluZ0V4dGVuc2lvbnMoKSA6IHRoaXMuaG9zdFNlcnZpY2UucmVsb2FkKClcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobGluaykge1xuXHRcdFx0XHRcdFx0YnV0dG9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdsZWFybk1vcmUnLCBcIkxlYXJuIE1vcmVcIiksXG5cdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgndnNjb2RlLm9wZW4nLCBVUkkucGFyc2UobGluaykpXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFx0XHRcdFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnbWFsaWNpb3VzIHdhcm5pbmcnLCBcIlRoZSBleHRlbnNpb24gJ3swfScgd2FzIGZvdW5kIHRvIGJlIHByb2JsZW1hdGljIGFuZCBoYXMgYmVlbiB1bmluc3RhbGxlZFwiLCBleHRlbnNpb24ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpLFxuXHRcdFx0XHRcdFx0YnV0dG9ucyxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0c3RpY2t5OiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuVVJHRU5UXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbk1hcmtldHBsYWNlU3RhdHVzVXBkYXRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGJhZGdlSGFuZGxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjY291bnRCYWRnZURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpdml0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY3Rpdml0eVNlcnZpY2U6IElBY3Rpdml0eVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnVwZGF0ZUJhZGdlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzKCgpID0+IHRoaXMudXBkYXRlQmFkZ2UoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVCYWRnZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmJhZGdlSGFuZGxlLmNsZWFyKCk7XG5cblx0XHRjb25zdCBzdGF0dXMgPSB0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzO1xuXHRcdGxldCBiYWRnZTogSUJhZGdlIHwgdW5kZWZpbmVkO1xuXG5cdFx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRcdGNhc2UgRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzLlJlcXVpcmVzU2lnbkluOlxuXHRcdFx0XHRiYWRnZSA9IG5ldyBOdW1iZXJCYWRnZSgxLCAoKSA9PiBsb2NhbGl6ZSgnc2lnbkluUmVxdWlyZWQnLCBcIlNpZ24gaW4gcmVxdWlyZWQgdG8gYWNjZXNzIG1hcmtldHBsYWNlXCIpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1cy5BY2Nlc3NEZW5pZWQ6XG5cdFx0XHRcdGJhZGdlID0gbmV3IFdhcm5pbmdCYWRnZSgoKSA9PiBsb2NhbGl6ZSgnYWNjZXNzRGVuaWVkJywgXCJBY2Nlc3MgZGVuaWVkIHRvIG1hcmtldHBsYWNlXCIpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKGJhZGdlKSB7XG5cdFx0XHR0aGlzLmJhZGdlSGFuZGxlLnZhbHVlID0gdGhpcy5hY3Rpdml0eVNlcnZpY2Uuc2hvd1ZpZXdDb250YWluZXJBY3Rpdml0eShWSUVXTEVUX0lELCB7IGJhZGdlIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuYWNjb3VudEJhZGdlRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdGlmIChzdGF0dXMgPT09IEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1cy5SZXF1aXJlc1NpZ25Jbikge1xuXHRcdFx0Y29uc3QgYmFkZ2UgPSBuZXcgTnVtYmVyQmFkZ2UoMSwgKCkgPT4gbG9jYWxpemUoJ3NpZ24gaW4gZW50ZXJwcmlzZSBtYXJrZXRwbGFjZScsIFwiU2lnbiBpbiB0byBhY2Nlc3MgTWFya2V0cGxhY2VcIikpO1xuXHRcdFx0dGhpcy5hY2NvdW50QmFkZ2VEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5hY3Rpdml0eVNlcnZpY2Uuc2hvd0FjY291bnRzQWN0aXZpdHkoeyBiYWRnZSB9KTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFTLGVBQWU7QUFDakMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw4QkFBOEI7QUFFdkMsU0FBUyxZQUFZLGlCQUFpQix5QkFBeUI7QUFDL0QsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsY0FBYztBQUN2QixTQUFTLFFBQVEsR0FBRyxXQUFXLE1BQU0sTUFBTSxxQkFBcUIsWUFBWSx1QkFBdUIsV0FBVyxpQkFBaUI7QUFDL0gsU0FBUyxnQkFBZ0IseUJBQXlCO0FBQ2xELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTJELFlBQVksc0NBQXNDLHdDQUF3QyxtQ0FBbUMsa0NBQWtDLDZCQUE2QixxQkFBcUIsNkJBQTZCLDZCQUE2Qiw0QkFBNEIseUJBQXlCLDJCQUEyQixxQkFBcUIseUNBQXlDO0FBQzdkLFNBQVMsc0NBQXNDLDRDQUE0QztBQUMzRixTQUFTLG1DQUFvRDtBQUM3RCxTQUFTLHNDQUFzQyx5Q0FBcUU7QUFDcEgsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQkFBb0IsdUJBQXVCLHdCQUF3QiwyQkFBMkIsb0NBQW9DLCtCQUErQixrQ0FBa0MsNkNBQTZDLG9EQUFvRCwyQ0FBMkMsa0RBQWtELDhCQUE4QiwwQkFBMEIsaUNBQWlDLCtCQUErQix3QkFBd0Is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
