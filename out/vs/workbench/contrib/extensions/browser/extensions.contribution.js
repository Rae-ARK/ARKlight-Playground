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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { mnemonicButtonLabel } from "../../../../base/common/labels.js";
import { Disposable, DisposableStore, isDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { isNative, isWeb } from "../../../../base/common/platform.js";
import { PolicyCategory } from "../../../../base/common/policy.js";
import { URI } from "../../../../base/common/uri.js";
import { CopyAction, CutAction, PasteAction } from "../../../../editor/contrib/clipboard/browser/clipboard.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ExtensionGalleryManifestStatus, ExtensionGalleryResourceType, ExtensionGalleryServiceUrlConfigKey, getExtensionGalleryManifestResourceUri, IExtensionGalleryManifestService } from "../../../../platform/extensionManagement/common/extensionGalleryManifest.js";
import { EXTENSION_INSTALL_SOURCE_CONTEXT, ExtensionInstallSource, ExtensionRequestsTimeoutConfigKey, ExtensionsLocalizedLabel, FilterType, IExtensionGalleryService, IExtensionManagementService, PreferencesLocalizedLabel, SortBy, VerifyExtensionSignatureConfigKey } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { areSameExtensions, getIdAndVersion } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { ExtensionStorageService } from "../../../../platform/extensionManagement/common/extensionStorage.js";
import { IExtensionRecommendationNotificationService } from "../../../../platform/extensionRecommendations/common/extensionRecommendations.js";
import { EXTENSION_CATEGORIES, ExtensionType } from "../../../../platform/extensions/common/extensions.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import * as jsonContributionRegistry from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import product from "../../../../platform/product/common/product.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { Extensions } from "../../../../platform/quickinput/common/quickAccess.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { Extensions as ConfigurationMigrationExtensions } from "../../../common/configuration.js";
import { IsSessionsWindowContext, ResourceContextKey, WorkbenchStateContext } from "../../../common/contextkeys.js";
import { registerWorkbenchContribution2, Extensions as WorkbenchExtensions, WorkbenchPhase } from "../../../common/contributions.js";
import { EditorExtensions } from "../../../common/editor.js";
import { Extensions as ViewContainerExtensions, ViewContainerLocation } from "../../../common/views.js";
import { DEFAULT_ACCOUNT_SIGN_IN_COMMAND } from "../../../services/accounts/browser/defaultAccount.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { EnablementState, IExtensionManagementServerService, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { IExtensionIgnoredRecommendationsService, IExtensionRecommendationsService } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
import { IWorkspaceExtensionsConfigService } from "../../../services/extensionRecommendations/common/workspaceExtensionsConfig.js";
import { EXTENSIONS_SUPPORT_AGENTS_WINDOW } from "../../../services/extensions/common/extensionManifestPropertiesService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { CONTEXT_SYNC_ENABLEMENT } from "../../../services/userDataSync/common/userDataSync.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { WORKSPACE_TRUST_EXTENSION_SUPPORT } from "../../../services/workspaces/common/workspaceTrust.js";
import { IPluginInstallService } from "../../chat/common/plugins/pluginInstallService.js";
import { ILanguageModelToolsService } from "../../chat/common/tools/languageModelToolsService.js";
import { CONTEXT_KEYBINDINGS_EDITOR } from "../../preferences/common/preferences.js";
import { Query } from "../common/extensionQuery.js";
import { AutoRestartConfigurationKey, AutoUpdateConfigurationKey, CONTEXT_EXTENSIONS_GALLERY_STATUS, CONTEXT_HAS_GALLERY, DefaultViewsContext, ExtensionRuntimeActionType, EXTENSIONS_CATEGORY, extensionsFilterSubMenu, extensionsSearchActionsMenu, HasOutdatedExtensionsContext, IExtensionsWorkbenchService, INSTALL_ACTIONS_GROUP, INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID, LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID, OUTDATED_EXTENSIONS_VIEW_ID, SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID, THEME_ACTIONS_GROUP, TOGGLE_IGNORE_EXTENSION_ACTION_ID, UPDATE_ACTIONS_GROUP, VIEWLET_ID, WORKSPACE_RECOMMENDATIONS_VIEW_ID } from "../common/extensions.js";
import { ExtensionsConfigurationSchema, ExtensionsConfigurationSchemaId } from "../common/extensionsFileTemplate.js";
import { ExtensionsInput } from "../common/extensionsInput.js";
import { KeymapExtensions } from "../common/extensionsUtils.js";
import { SearchExtensionsTool, SearchExtensionsToolData } from "../common/searchExtensionsTool.js";
import { ExtensionEditor } from "./extensionEditor.js";
import { ExtensionEnablementWorkspaceTrustTransitionParticipant } from "./extensionEnablementWorkspaceTrustTransitionParticipant.js";
import { ExtensionRecommendationNotificationService } from "./extensionRecommendationNotificationService.js";
import { ExtensionRecommendationsService } from "./extensionRecommendationsService.js";
import { ClearLanguageAction, ConfigureWorkspaceFolderRecommendedExtensionsAction, ConfigureWorkspaceRecommendedExtensionsAction, InstallAction, InstallAnotherVersionAction, InstallSpecificVersionOfExtensionAction, SetColorThemeAction, SetFileIconThemeAction, SetProductIconThemeAction, ToggleAutoUpdateForExtensionAction, ToggleAutoUpdatesForPublisherAction, TogglePreReleaseExtensionAction } from "./extensionsActions.js";
import { ExtensionActivationProgress } from "./extensionsActivationProgress.js";
import { ExtensionsCompletionItemsProvider } from "./extensionsCompletionItemsProvider.js";
import { ExtensionEnablementContextKeysContribution } from "./extensionEnablementContext.js";
import { ExtensionDependencyChecker } from "./extensionsDependencyChecker.js";
import { clearSearchResultsIcon, configureRecommendedIcon, extensionsViewIcon, filterIcon, installWorkspaceRecommendedIcon, refreshIcon } from "./extensionsIcons.js";
import { InstallExtensionQuickAccessProvider, ManageExtensionsQuickAccessProvider } from "./extensionsQuickAccess.js";
import { BuiltInExtensionsContext, ExtensionMarketplaceStatusUpdater, ExtensionsSearchValueContext, ExtensionsSortByContext, ExtensionsViewletViewsContribution, ExtensionsViewPaneContainer, MaliciousExtensionChecker, RecommendedExtensionsContext, SearchHasTextContext, SearchMarketplaceExtensionsContext, StatusUpdater } from "./extensionsViewlet.js";
import { ExtensionsWorkbenchService } from "./extensionsWorkbenchService.js";
import "./media/extensionManagement.css";
import { UnsupportedExtensionsMigrationContrib } from "./unsupportedExtensionsMigrationContribution.js";
registerSingleton(
  IExtensionsWorkbenchService,
  ExtensionsWorkbenchService,
  InstantiationType.Eager
  /* Auto updates extensions */
);
registerSingleton(IExtensionRecommendationNotificationService, ExtensionRecommendationNotificationService, InstantiationType.Delayed);
registerSingleton(
  IExtensionRecommendationsService,
  ExtensionRecommendationsService,
  InstantiationType.Eager
  /* Prompts recommendations in the background */
);
Registry.as(Extensions.Quickaccess).registerQuickAccessProvider({
  ctor: ManageExtensionsQuickAccessProvider,
  prefix: ManageExtensionsQuickAccessProvider.PREFIX,
  placeholder: localize("manageExtensionsQuickAccessPlaceholder", "Press Enter to manage extensions."),
  helpEntries: [{ description: localize("manageExtensionsHelp", "Manage Extensions") }]
});
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    ExtensionEditor,
    ExtensionEditor.ID,
    localize("extension", "Extension")
  ),
  [
    new SyncDescriptor(ExtensionsInput)
  ]
);
const VIEW_CONTAINER = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer(
  {
    id: VIEWLET_ID,
    title: localize2("extensions", "Extensions"),
    openCommandActionDescriptor: {
      id: VIEWLET_ID,
      mnemonicTitle: localize({ key: "miViewExtensions", comment: ["&& denotes a mnemonic"] }, "E&&xtensions"),
      keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyX },
      order: 4
    },
    ctorDescriptor: new SyncDescriptor(ExtensionsViewPaneContainer),
    icon: extensionsViewIcon,
    order: 4,
    rejectAddedViews: true,
    alwaysUseContainerInfo: true
  },
  ViewContainerLocation.Sidebar
);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "extensions",
  order: 30,
  title: localize("extensionsConfigurationTitle", "Extensions"),
  type: "object",
  properties: {
    "extensions.autoUpdate": {
      type: "string",
      enum: ["on", "off"],
      enumDescriptions: [
        localize("extensions.autoUpdate.on", "Download and install updates automatically only for enabled extensions."),
        localize("extensions.autoUpdate.off", "Extensions are not automatically updated.")
      ],
      description: localize("extensions.autoUpdate", "Controls the automatic update behavior of extensions. The updates are fetched from a Microsoft online service."),
      default: "on",
      scope: ConfigurationScope.APPLICATION,
      tags: ["usesOnlineServices"],
      policy: {
        name: "ExtensionsAutoUpdate",
        category: PolicyCategory.Extensions,
        minimumVersion: "1.125",
        localization: {
          description: {
            key: "extensions.autoUpdate",
            value: localize("extensions.autoUpdate", "Controls the automatic update behavior of extensions. The updates are fetched from a Microsoft online service.")
          },
          enumDescriptions: [
            {
              key: "extensions.autoUpdate.on",
              value: localize("extensions.autoUpdate.on", "Download and install updates automatically only for enabled extensions.")
            },
            {
              key: "extensions.autoUpdate.off",
              value: localize("extensions.autoUpdate.off", "Extensions are not automatically updated.")
            }
          ]
        }
      }
    },
    "extensions.autoUpdateDelay": {
      type: "number",
      default: 2,
      minimum: 0,
      markdownDescription: localize("extensions.autoUpdateDelay", "Controls the delay in hours after an extension update is published before it is automatically installed. Only applies when `#extensions.autoUpdate#` is set to `on`. This delay helps avoid installing potentially problematic updates immediately after release."),
      scope: ConfigurationScope.APPLICATION,
      policy: {
        name: "ExtensionsAutoUpdateDelay",
        category: PolicyCategory.Extensions,
        minimumVersion: "1.125",
        localization: {
          description: {
            key: "extensions.autoUpdateDelay",
            value: localize("extensions.autoUpdateDelay", "Controls the delay in hours after an extension update is published before it is automatically installed. Only applies when `#extensions.autoUpdate#` is set to `on`. This delay helps avoid installing potentially problematic updates immediately after release.")
          }
        }
      }
    },
    "extensions.autoCheckUpdates": {
      type: "boolean",
      description: localize("extensionsCheckUpdates", "When enabled, automatically checks extensions for updates. If an extension has an update, it is marked as outdated in the Extensions view. The updates are fetched from a Microsoft online service."),
      default: true,
      scope: ConfigurationScope.APPLICATION,
      tags: ["usesOnlineServices"]
    },
    "extensions.ignoreRecommendations": {
      type: "boolean",
      description: localize("extensionsIgnoreRecommendations", "When enabled, the notifications for extension recommendations will not be shown."),
      default: false,
      agentsWindow: { default: true, readOnly: true }
    },
    "extensions.showRecommendationsOnlyOnDemand": {
      type: "boolean",
      deprecationMessage: localize("extensionsShowRecommendationsOnlyOnDemand_Deprecated", "This setting is deprecated. Use extensions.ignoreRecommendations setting to control recommendation notifications. Use Extensions view's visibility actions to hide Recommended view by default."),
      default: false,
      tags: ["usesOnlineServices"]
    },
    "extensions.closeExtensionDetailsOnViewChange": {
      type: "boolean",
      description: localize("extensionsCloseExtensionDetailsOnViewChange", "When enabled, editors with extension details will be automatically closed upon navigating away from the Extensions View."),
      default: false
    },
    "extensions.confirmedUriHandlerExtensionIds": {
      type: "array",
      items: {
        type: "string"
      },
      description: localize("handleUriConfirmedExtensions", "When an extension is listed here, a confirmation prompt will not be shown when that extension handles a URI."),
      default: [],
      scope: ConfigurationScope.APPLICATION
    },
    "extensions.webWorker": {
      type: ["boolean", "string"],
      enum: [true, false, "auto"],
      enumDescriptions: [
        localize("extensionsWebWorker.true", "The Web Worker Extension Host will always be launched."),
        localize("extensionsWebWorker.false", "The Web Worker Extension Host will never be launched."),
        localize("extensionsWebWorker.auto", "The Web Worker Extension Host will be launched when a web extension needs it.")
      ],
      description: localize("extensionsWebWorker", "Enable web worker extension host."),
      default: "auto"
    },
    "extensions.supportVirtualWorkspaces": {
      type: "object",
      markdownDescription: localize("extensions.supportVirtualWorkspaces", "Override the virtual workspaces support of an extension."),
      patternProperties: {
        "([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$": {
          type: "boolean",
          default: false
        }
      },
      additionalProperties: false,
      default: {},
      defaultSnippets: [{
        "body": {
          "pub.name": false
        }
      }]
    },
    [EXTENSIONS_SUPPORT_AGENTS_WINDOW]: {
      type: "object",
      scope: ConfigurationScope.APPLICATION,
      markdownDescription: localize("extensions.supportAgentsWindow", "Override the Agents window support of an extension. Extensions using `true` will be enabled in the Agents window even when they would otherwise be disabled."),
      patternProperties: {
        "([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$": {
          type: "boolean",
          default: false
        }
      },
      additionalProperties: false,
      default: {},
      defaultSnippets: [{
        "body": {
          "pub.name": true
        }
      }]
    },
    "extensions.experimental.affinity": {
      type: "object",
      markdownDescription: localize("extensions.affinity", "Configure an extension to execute in a different extension host process."),
      patternProperties: {
        "([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$": {
          type: "integer",
          default: 1
        }
      },
      additionalProperties: false,
      default: {},
      defaultSnippets: [{
        "body": {
          "pub.name": 1
        }
      }]
    },
    [WORKSPACE_TRUST_EXTENSION_SUPPORT]: {
      type: "object",
      scope: ConfigurationScope.APPLICATION,
      markdownDescription: localize("extensions.supportUntrustedWorkspaces", "Override the untrusted workspace support of an extension. Extensions using `true` will always be enabled. Extensions using `limited` will always be enabled, and the extension will hide functionality that requires trust. Extensions using `false` will only be enabled only when the workspace is trusted."),
      patternProperties: {
        "([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$": {
          type: "object",
          properties: {
            "supported": {
              type: ["boolean", "string"],
              enum: [true, false, "limited"],
              enumDescriptions: [
                localize("extensions.supportUntrustedWorkspaces.true", "Extension will always be enabled."),
                localize("extensions.supportUntrustedWorkspaces.false", "Extension will only be enabled only when the workspace is trusted."),
                localize("extensions.supportUntrustedWorkspaces.limited", "Extension will always be enabled, and the extension will hide functionality requiring trust.")
              ],
              description: localize("extensions.supportUntrustedWorkspaces.supported", "Defines the untrusted workspace support setting for the extension.")
            },
            "version": {
              type: "string",
              description: localize("extensions.supportUntrustedWorkspaces.version", "Defines the version of the extension for which the override should be applied. If not specified, the override will be applied independent of the extension version.")
            }
          }
        }
      }
    },
    "extensions.experimental.deferredStartupFinishedActivation": {
      type: "boolean",
      description: localize("extensionsDeferredStartupFinishedActivation", "When enabled, extensions which declare the `onStartupFinished` activation event will be activated after a timeout."),
      default: false
    },
    "extensions.experimental.issueQuickAccess": {
      type: "boolean",
      description: localize("extensionsInQuickAccess", "When enabled, extensions can be searched for via Quick Access and report issues from there."),
      default: true
    },
    "extensions.allowOpenInModalEditor": {
      type: "boolean",
      description: localize("extensions.allowOpenInModalEditor", "Controls whether extensions and MCP servers open in a modal editor overlay."),
      default: false,
      // TODO@bpasero figure out the default for stable and retire this setting
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    [VerifyExtensionSignatureConfigKey]: {
      type: "boolean",
      description: localize("extensions.verifySignature", "When enabled, extensions are verified to be signed before getting installed."),
      default: true,
      scope: ConfigurationScope.APPLICATION,
      included: isNative
    },
    [AutoRestartConfigurationKey]: {
      type: "boolean",
      description: localize("autoRestart", "If activated, extensions will automatically restart following an update if the window is not in focus. There can be a data loss if you have open Notebooks or Custom Editors."),
      default: false,
      included: product.quality !== "stable"
    },
    [ExtensionGalleryServiceUrlConfigKey]: {
      type: "string",
      description: localize("extensions.gallery.serviceUrl", "Configure the Marketplace service URL to connect to"),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      tags: ["usesOnlineServices"],
      included: false,
      policy: {
        name: "ExtensionGalleryServiceUrl",
        category: PolicyCategory.Extensions,
        minimumVersion: "1.99",
        localization: {
          description: {
            key: "extensions.gallery.serviceUrl",
            value: localize("extensions.gallery.serviceUrl", "Configure the Marketplace service URL to connect to")
          }
        }
      }
    },
    "extensions.supportNodeGlobalNavigator": {
      type: "boolean",
      description: localize("extensionsSupportNodeGlobalNavigator", "When enabled, Node.js navigator object is exposed on the global scope."),
      default: false
    },
    [ExtensionRequestsTimeoutConfigKey]: {
      type: "number",
      description: localize("extensionsRequestTimeout", "Controls the timeout in milliseconds for HTTP requests made when fetching extensions from the Marketplace"),
      default: 6e4,
      scope: ConfigurationScope.APPLICATION,
      tags: ["advanced", "usesOnlineServices"]
    }
  }
});
const jsonRegistry = Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
jsonRegistry.registerSchema(ExtensionsConfigurationSchemaId, ExtensionsConfigurationSchema);
CommandsRegistry.registerCommand("_extensions.manage", (accessor, extensionId, tab, preserveFocus, feature) => {
  const extensionService = accessor.get(IExtensionsWorkbenchService);
  const extension = extensionService.local.find((e) => areSameExtensions(e.identifier, { id: extensionId }));
  if (extension) {
    extensionService.open(extension, { tab, preserveFocus, feature });
  } else {
    throw new Error(localize("notFound", "Extension '{0}' not found.", extensionId));
  }
});
CommandsRegistry.registerCommand("extension.open", async (accessor, extensionId, tab, preserveFocus, feature, sideByside) => {
  const extensionService = accessor.get(IExtensionsWorkbenchService);
  const commandService = accessor.get(ICommandService);
  const [extension] = await extensionService.getExtensions([{ id: extensionId }], CancellationToken.None);
  if (extension) {
    return extensionService.open(extension, { tab, preserveFocus, feature, sideByside });
  }
  return commandService.executeCommand("_extensions.manage", extensionId, tab, preserveFocus, feature);
});
CommandsRegistry.registerCommand({
  id: "workbench.extensions.installExtension",
  metadata: {
    description: localize("workbench.extensions.installExtension.description", "Install the given extension"),
    args: [
      {
        name: "extensionIdOrVSIXUri",
        description: localize("workbench.extensions.installExtension.arg.decription", "Extension id or VSIX resource uri"),
        constraint: (value) => typeof value === "string" || value instanceof URI
      },
      {
        name: "options",
        description: "(optional) Options for installing the extension. Object with the following properties: `installOnlyNewlyAddedFromExtensionPackVSIX`: When enabled, VS Code installs only newly added extensions from the extension pack VSIX. This option is considered only when installing VSIX. ",
        isOptional: true,
        schema: {
          "type": "object",
          "properties": {
            "installOnlyNewlyAddedFromExtensionPackVSIX": {
              "type": "boolean",
              "description": localize("workbench.extensions.installExtension.option.installOnlyNewlyAddedFromExtensionPackVSIX", "When enabled, VS Code installs only newly added extensions from the extension pack VSIX. This option is considered only while installing a VSIX."),
              default: false
            },
            "installPreReleaseVersion": {
              "type": "boolean",
              "description": localize("workbench.extensions.installExtension.option.installPreReleaseVersion", "When enabled, VS Code installs the pre-release version of the extension if available."),
              default: false
            },
            "donotSync": {
              "type": "boolean",
              "description": localize("workbench.extensions.installExtension.option.donotSync", "When enabled, VS Code do not sync this extension when Settings Sync is on."),
              default: false
            },
            "justification": {
              "type": ["string", "object"],
              "description": localize("workbench.extensions.installExtension.option.justification", "Justification for installing the extension. This is a string or an object that can be used to pass any information to the installation handlers. i.e. `{reason: 'This extension wants to open a URI', action: 'Open URI'}` will show a message box with the reason and action upon install.")
            },
            "enable": {
              "type": "boolean",
              "description": localize("workbench.extensions.installExtension.option.enable", "When enabled, the extension will be enabled if it is installed but disabled. If the extension is already enabled, this has no effect."),
              default: false
            }
          }
        }
      }
    ]
  },
  handler: async (accessor, arg, options) => {
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    const extensionManagementService = accessor.get(IWorkbenchExtensionManagementService);
    const extensionGalleryService = accessor.get(IExtensionGalleryService);
    try {
      if (typeof arg === "string") {
        const [id, version] = getIdAndVersion(arg);
        const extension = extensionsWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id, uuid: version }));
        if (extension?.enablementState === EnablementState.DisabledByExtensionKind) {
          const [gallery] = await extensionGalleryService.getExtensions([{ id, preRelease: options?.installPreReleaseVersion }], CancellationToken.None);
          if (!gallery) {
            throw new Error(localize("notFound", "Extension '{0}' not found.", arg));
          }
          await extensionManagementService.installFromGallery(gallery, {
            isMachineScoped: options?.donotSync ? true : void 0,
            /* do not allow syncing extensions automatically while installing through the command */
            installPreReleaseVersion: options?.installPreReleaseVersion,
            installGivenVersion: !!version,
            context: { [EXTENSION_INSTALL_SOURCE_CONTEXT]: ExtensionInstallSource.COMMAND }
          });
        } else {
          await extensionsWorkbenchService.install(id, {
            version,
            installPreReleaseVersion: options?.installPreReleaseVersion,
            context: { [EXTENSION_INSTALL_SOURCE_CONTEXT]: ExtensionInstallSource.COMMAND },
            justification: options?.justification,
            enable: options?.enable,
            isMachineScoped: options?.donotSync ? true : void 0
            /* do not allow syncing extensions automatically while installing through the command */
          }, ProgressLocation.Notification);
        }
      } else {
        const vsix = URI.revive(arg);
        await extensionsWorkbenchService.install(vsix, { installGivenVersion: true });
      }
    } catch (e) {
      onUnexpectedError(e);
      throw e;
    }
  }
});
CommandsRegistry.registerCommand({
  id: "workbench.extensions.uninstallExtension",
  metadata: {
    description: localize("workbench.extensions.uninstallExtension.description", "Uninstall the given extension"),
    args: [
      {
        name: localize("workbench.extensions.uninstallExtension.arg.name", "Id of the extension to uninstall"),
        schema: {
          "type": "string"
        }
      }
    ]
  },
  handler: async (accessor, id) => {
    if (!id) {
      throw new Error(localize("id required", "Extension id required."));
    }
    const extensionManagementService = accessor.get(IExtensionManagementService);
    const installed = await extensionManagementService.getInstalled();
    const [extensionToUninstall] = installed.filter((e) => areSameExtensions(e.identifier, { id }));
    if (!extensionToUninstall) {
      throw new Error(localize("notInstalled", "Extension '{0}' is not installed. Make sure you use the full extension ID, including the publisher, e.g.: ms-dotnettools.csharp.", id));
    }
    if (extensionToUninstall.isBuiltin) {
      throw new Error(localize("builtin", "Extension '{0}' is a Built-in extension and cannot be uninstalled", id));
    }
    try {
      await extensionManagementService.uninstall(extensionToUninstall);
    } catch (e) {
      onUnexpectedError(e);
      throw e;
    }
  }
});
CommandsRegistry.registerCommand({
  id: "workbench.extensions.search",
  metadata: {
    description: localize("workbench.extensions.search.description", "Search for a specific extension"),
    args: [
      {
        name: localize("workbench.extensions.search.arg.name", "Query to use in search"),
        schema: { "type": "string" }
      }
    ]
  },
  handler: async (accessor, query = "") => {
    return accessor.get(IExtensionsWorkbenchService).openSearch(query);
  }
});
function overrideActionForActiveExtensionEditorWebview(command, f) {
  command?.addImplementation(105, "extensions-editor", (accessor) => {
    const editorService = accessor.get(IEditorService);
    const editor = editorService.activeEditorPane;
    if (editor instanceof ExtensionEditor) {
      if (editor.activeWebview?.isFocused) {
        f(editor.activeWebview);
        return true;
      }
    }
    return false;
  });
}
overrideActionForActiveExtensionEditorWebview(CopyAction, (webview) => webview.copy());
overrideActionForActiveExtensionEditorWebview(CutAction, (webview) => webview.cut());
overrideActionForActiveExtensionEditorWebview(PasteAction, (webview) => webview.paste());
const CONTEXT_HAS_LOCAL_SERVER = new RawContextKey("hasLocalServer", false);
const CONTEXT_HAS_REMOTE_SERVER = new RawContextKey("hasRemoteServer", false);
const CONTEXT_HAS_WEB_SERVER = new RawContextKey("hasWebServer", false);
const CONTEXT_GALLERY_SORT_CAPABILITIES = new RawContextKey("gallerySortCapabilities", "");
const CONTEXT_GALLERY_FILTER_CAPABILITIES = new RawContextKey("galleryFilterCapabilities", "");
const CONTEXT_GALLERY_ALL_PUBLIC_REPOSITORY_SIGNED = new RawContextKey("galleryAllPublicRepositorySigned", false);
const CONTEXT_GALLERY_ALL_PRIVATE_REPOSITORY_SIGNED = new RawContextKey("galleryAllPrivateRepositorySigned", false);
const CONTEXT_GALLERY_HAS_EXTENSION_LINK = new RawContextKey("galleryHasExtensionLink", false);
async function runAction(action) {
  try {
    return await action.run();
  } finally {
    if (isDisposable(action)) {
      action.dispose();
    }
  }
}
let ExtensionsContributions = class extends Disposable {
  constructor(extensionManagementService, extensionManagementServerService, extensionGalleryManifestService, contextKeyService, viewsService, extensionsWorkbenchService, extensionEnablementService, instantiationService, dialogService, commandService, productService, pluginInstallService) {
    super();
    this.extensionManagementService = extensionManagementService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this.contextKeyService = contextKeyService;
    this.viewsService = viewsService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.instantiationService = instantiationService;
    this.dialogService = dialogService;
    this.commandService = commandService;
    this.productService = productService;
    this.pluginInstallService = pluginInstallService;
    const hasLocalServerContext = CONTEXT_HAS_LOCAL_SERVER.bindTo(contextKeyService);
    if (this.extensionManagementServerService.localExtensionManagementServer) {
      hasLocalServerContext.set(true);
    }
    const hasRemoteServerContext = CONTEXT_HAS_REMOTE_SERVER.bindTo(contextKeyService);
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      hasRemoteServerContext.set(true);
    }
    const hasWebServerContext = CONTEXT_HAS_WEB_SERVER.bindTo(contextKeyService);
    if (this.extensionManagementServerService.webExtensionManagementServer) {
      hasWebServerContext.set(true);
    }
    this.updateExtensionGalleryStatusContexts();
    this._register(extensionGalleryManifestService.onDidChangeExtensionGalleryManifestStatus(() => this.updateExtensionGalleryStatusContexts()));
    extensionGalleryManifestService.getExtensionGalleryManifest().then((extensionGalleryManifest) => {
      this.updateGalleryCapabilitiesContexts(extensionGalleryManifest);
      this._register(extensionGalleryManifestService.onDidChangeExtensionGalleryManifest((extensionGalleryManifest2) => this.updateGalleryCapabilitiesContexts(extensionGalleryManifest2)));
    });
    this.registerGlobalActions();
    this.registerContextMenuActions();
    this.registerQuickAccessProvider();
  }
  async updateExtensionGalleryStatusContexts() {
    CONTEXT_HAS_GALLERY.bindTo(this.contextKeyService).set(this.extensionGalleryManifestService.extensionGalleryManifestStatus === ExtensionGalleryManifestStatus.Available);
    CONTEXT_EXTENSIONS_GALLERY_STATUS.bindTo(this.contextKeyService).set(this.extensionGalleryManifestService.extensionGalleryManifestStatus);
  }
  async updateGalleryCapabilitiesContexts(extensionGalleryManifest) {
    CONTEXT_GALLERY_SORT_CAPABILITIES.bindTo(this.contextKeyService).set(`_${extensionGalleryManifest?.capabilities.extensionQuery.sorting?.map((s) => s.name)?.join("_")}_UpdateDate_`);
    CONTEXT_GALLERY_FILTER_CAPABILITIES.bindTo(this.contextKeyService).set(`_${extensionGalleryManifest?.capabilities.extensionQuery.filtering?.map((s) => s.name)?.join("_")}_`);
    CONTEXT_GALLERY_ALL_PUBLIC_REPOSITORY_SIGNED.bindTo(this.contextKeyService).set(!!extensionGalleryManifest?.capabilities?.signing?.allPublicRepositorySigned);
    CONTEXT_GALLERY_ALL_PRIVATE_REPOSITORY_SIGNED.bindTo(this.contextKeyService).set(!!extensionGalleryManifest?.capabilities?.signing?.allPrivateRepositorySigned);
    CONTEXT_GALLERY_HAS_EXTENSION_LINK.bindTo(this.contextKeyService).set(!!(extensionGalleryManifest && getExtensionGalleryManifestResourceUri(extensionGalleryManifest, ExtensionGalleryResourceType.ExtensionDetailsViewUri)));
  }
  registerQuickAccessProvider() {
    if (this.extensionManagementServerService.localExtensionManagementServer || this.extensionManagementServerService.remoteExtensionManagementServer || this.extensionManagementServerService.webExtensionManagementServer) {
      Registry.as(Extensions.Quickaccess).registerQuickAccessProvider({
        ctor: InstallExtensionQuickAccessProvider,
        prefix: InstallExtensionQuickAccessProvider.PREFIX,
        placeholder: localize("installExtensionQuickAccessPlaceholder", "Type the name of an extension to install or search."),
        helpEntries: [{ description: localize("installExtensionQuickAccessHelp", "Install or Search Extensions") }]
      });
    }
  }
  // Global actions
  registerGlobalActions() {
    this._register(MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
      command: {
        id: VIEWLET_ID,
        title: localize({ key: "miPreferencesExtensions", comment: ["&& denotes a mnemonic"] }, "&&Extensions")
      },
      group: "2_configuration",
      order: 3,
      when: IsSessionsWindowContext.negate()
    }));
    this._register(MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
      command: {
        id: VIEWLET_ID,
        title: localize("showExtensions", "Extensions")
      },
      group: "2_configuration",
      order: 3
    }));
    this.registerExtensionAction({
      id: "workbench.extensions.action.focusExtensionsView",
      title: localize2("focusExtensions", "Focus on Extensions View"),
      category: ExtensionsLocalizedLabel,
      f1: true,
      run: async (accessor) => {
        await accessor.get(IExtensionsWorkbenchService).openSearch("");
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.installExtensions",
      title: localize2("installExtensions", "Install Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
      },
      run: async (accessor) => {
        accessor.get(IViewsService).openViewContainer(VIEWLET_ID, true);
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showRecommendedKeymapExtensions",
      title: localize2("showRecommendedKeymapExtensionsShort", "Keymaps"),
      category: PreferencesLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: CONTEXT_HAS_GALLERY
      }, {
        id: MenuId.EditorTitle,
        when: ContextKeyExpr.and(CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_HAS_GALLERY),
        group: "2_keyboard_discover_actions"
      }],
      menuTitles: {
        [MenuId.EditorTitle.id]: localize("importKeyboardShortcutsFroms", "Migrate Keyboard Shortcuts from...")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@recommended:keymaps ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showLanguageExtensions",
      title: localize2("showLanguageExtensionsShort", "Language Extensions"),
      category: PreferencesLocalizedLabel,
      menu: {
        id: MenuId.CommandPalette,
        when: CONTEXT_HAS_GALLERY
      },
      run: () => this.extensionsWorkbenchService.openSearch("@recommended:languages ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.checkForUpdates",
      title: localize2("checkForUpdates", "Check for Extension Updates"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
      }, {
        id: MenuId.ViewContainerTitle,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("viewContainer", VIEWLET_ID), CONTEXT_HAS_GALLERY),
        group: "1_updates",
        order: 1
      }],
      run: async () => {
        const [, pluginResult] = await Promise.all([
          this.extensionsWorkbenchService.checkForUpdates(),
          this.pluginInstallService.updateAllPlugins({ silent: true }, CancellationToken.None)
        ]);
        const outdated = this.extensionsWorkbenchService.outdated;
        if (outdated.length) {
          return this.extensionsWorkbenchService.openSearch("@outdated ");
        } else if (pluginResult.updatedNames.length === 0 && pluginResult.failedNames.length === 0) {
          return this.dialogService.info(localize("noUpdatesAvailable", "All extensions are up to date."));
        }
      }
    });
    const enableAutoUpdateWhenCondition = ContextKeyExpr.equals(`config.${AutoUpdateConfigurationKey}`, "off");
    this.registerExtensionAction({
      id: "workbench.extensions.action.enableAutoUpdate",
      title: localize2("enableAutoUpdate", "Enable Auto Update for Extensions"),
      category: ExtensionsLocalizedLabel,
      precondition: enableAutoUpdateWhenCondition,
      menu: [{
        id: MenuId.ViewContainerTitle,
        order: 5,
        group: "1_updates",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("viewContainer", VIEWLET_ID), enableAutoUpdateWhenCondition)
      }, {
        id: MenuId.CommandPalette
      }],
      run: (accessor) => accessor.get(IExtensionsWorkbenchService).updateAutoUpdateForAllExtensions(true)
    });
    const disableAutoUpdateWhenCondition = ContextKeyExpr.notEquals(`config.${AutoUpdateConfigurationKey}`, "off");
    this.registerExtensionAction({
      id: "workbench.extensions.action.disableAutoUpdate",
      title: localize2("disableAutoUpdate", "Disable Auto Update for Extensions"),
      precondition: disableAutoUpdateWhenCondition,
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.ViewContainerTitle,
        order: 5,
        group: "1_updates",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("viewContainer", VIEWLET_ID), disableAutoUpdateWhenCondition)
      }, {
        id: MenuId.CommandPalette
      }],
      run: (accessor) => accessor.get(IExtensionsWorkbenchService).updateAutoUpdateForAllExtensions(false)
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.updateAllExtensions",
      title: localize2("updateAll", "Update All Extensions"),
      category: ExtensionsLocalizedLabel,
      precondition: HasOutdatedExtensionsContext,
      menu: [
        {
          id: MenuId.CommandPalette,
          when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
        },
        {
          id: MenuId.ViewContainerTitle,
          when: ContextKeyExpr.equals("viewContainer", VIEWLET_ID),
          group: "1_updates",
          order: 2
        },
        {
          id: MenuId.ViewTitle,
          when: ContextKeyExpr.equals("view", OUTDATED_EXTENSIONS_VIEW_ID),
          group: "navigation",
          order: 1
        }
      ],
      icon: installWorkspaceRecommendedIcon,
      run: async () => {
        await this.extensionsWorkbenchService.updateAll();
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.enableAll",
      title: localize2("enableAll", "Enable All Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER)
      }, {
        id: MenuId.ViewContainerTitle,
        when: ContextKeyExpr.equals("viewContainer", VIEWLET_ID),
        group: "2_enablement",
        order: 1
      }],
      run: async () => {
        const extensionsToEnable = this.extensionsWorkbenchService.local.filter((e) => !!e.local && this.extensionEnablementService.canChangeEnablement(e.local) && !this.extensionEnablementService.isEnabled(e.local));
        if (extensionsToEnable.length) {
          await this.extensionsWorkbenchService.setEnablement(extensionsToEnable, EnablementState.EnabledGlobally);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.enableAllWorkspace",
      title: localize2("enableAllWorkspace", "Enable All Extensions for this Workspace"),
      category: ExtensionsLocalizedLabel,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("empty"), ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
      },
      run: async () => {
        const extensionsToEnable = this.extensionsWorkbenchService.local.filter((e) => !!e.local && this.extensionEnablementService.canChangeEnablement(e.local) && !this.extensionEnablementService.isEnabled(e.local));
        if (extensionsToEnable.length) {
          await this.extensionsWorkbenchService.setEnablement(extensionsToEnable, EnablementState.EnabledWorkspace);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.disableAll",
      title: localize2("disableAll", "Disable All Installed Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER)
      }, {
        id: MenuId.ViewContainerTitle,
        when: ContextKeyExpr.equals("viewContainer", VIEWLET_ID),
        group: "2_enablement",
        order: 2
      }],
      run: async () => {
        const extensionsToDisable = this.extensionsWorkbenchService.local.filter((e) => !e.isBuiltin && !!e.local && this.extensionEnablementService.isEnabled(e.local) && this.extensionEnablementService.canChangeEnablement(e.local));
        if (extensionsToDisable.length) {
          await this.extensionsWorkbenchService.setEnablement(extensionsToDisable, EnablementState.DisabledGlobally);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.disableAllWorkspace",
      title: localize2("disableAllWorkspace", "Disable All Installed Extensions for this Workspace"),
      category: ExtensionsLocalizedLabel,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("empty"), ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
      },
      run: async () => {
        const extensionsToDisable = this.extensionsWorkbenchService.local.filter((e) => !e.isBuiltin && !!e.local && this.extensionEnablementService.isEnabled(e.local) && this.extensionEnablementService.canChangeEnablement(e.local));
        if (extensionsToDisable.length) {
          await this.extensionsWorkbenchService.setEnablement(extensionsToDisable, EnablementState.DisabledWorkspace);
        }
      }
    });
    this.registerExtensionAction({
      id: SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID,
      title: localize2("InstallFromVSIX", "Install from VSIX..."),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER)
      }, {
        id: MenuId.ViewContainerTitle,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("viewContainer", VIEWLET_ID), ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER)),
        group: "3_install",
        order: 1
      }],
      run: async (accessor) => {
        const fileDialogService = accessor.get(IFileDialogService);
        const commandService = accessor.get(ICommandService);
        const vsixPaths = await fileDialogService.showOpenDialog({
          title: localize("installFromVSIX", "Install from VSIX"),
          filters: [{ name: "VSIX Extensions", extensions: ["vsix"] }],
          canSelectFiles: true,
          canSelectMany: true,
          openLabel: mnemonicButtonLabel(localize({ key: "installButton", comment: ["&& denotes a mnemonic"] }, "&&Install"))
        });
        if (vsixPaths) {
          await commandService.executeCommand(INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID, vsixPaths);
        }
      }
    });
    this.registerExtensionAction({
      id: INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID,
      title: localize("installVSIX", "Install Extension VSIX"),
      menu: [{
        id: MenuId.ExplorerContext,
        group: "extensions",
        when: ContextKeyExpr.and(ResourceContextKey.Extension.isEqualTo(".vsix"), ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER))
      }],
      run: async (accessor, resources) => {
        const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const hostService = accessor.get(IHostService);
        const notificationService = accessor.get(INotificationService);
        const vsixs = Array.isArray(resources) ? resources : [resources];
        const result = await Promise.allSettled(vsixs.map(async (vsix) => await extensionsWorkbenchService.install(vsix, { installGivenVersion: true })));
        let error, requireReload = false, requireRestart = false;
        for (const r of result) {
          if (r.status === "rejected") {
            error = new Error(r.reason);
            break;
          }
          requireReload = requireReload || r.value.runtimeState?.action === ExtensionRuntimeActionType.ReloadWindow;
          requireRestart = requireRestart || r.value.runtimeState?.action === ExtensionRuntimeActionType.RestartExtensions;
        }
        if (error) {
          throw error;
        }
        if (requireReload) {
          notificationService.prompt(
            Severity.Info,
            vsixs.length > 1 ? localize("InstallVSIXs.successReload", "Completed installing extensions. Please reload Visual Studio Code to enable them.") : localize("InstallVSIXAction.successReload", "Completed installing extension. Please reload Visual Studio Code to enable it."),
            [{
              label: localize("InstallVSIXAction.reloadNow", "Reload Now"),
              run: () => hostService.reload()
            }]
          );
        } else if (requireRestart) {
          notificationService.prompt(
            Severity.Info,
            vsixs.length > 1 ? localize("InstallVSIXs.successRestart", "Completed installing extensions. Please restart extensions to enable them.") : localize("InstallVSIXAction.successRestart", "Completed installing extension. Please restart extensions to enable it."),
            [{
              label: localize("InstallVSIXAction.restartExtensions", "Restart Extensions"),
              run: () => extensionsWorkbenchService.updateRunningExtensions()
            }]
          );
        } else {
          notificationService.prompt(
            Severity.Info,
            vsixs.length > 1 ? localize("InstallVSIXs.successNoReload", "Completed installing extensions.") : localize("InstallVSIXAction.successNoReload", "Completed installing extension."),
            []
          );
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.installExtensionFromLocation",
      title: localize2("installExtensionFromLocation", "Install Extension from Location..."),
      category: Categories.Developer,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_WEB_SERVER, CONTEXT_HAS_LOCAL_SERVER)
      }],
      run: async (accessor) => {
        const extensionManagementService = accessor.get(IWorkbenchExtensionManagementService);
        if (isWeb) {
          return new Promise((c, e) => {
            const quickInputService = accessor.get(IQuickInputService);
            const disposables = new DisposableStore();
            const quickPick = disposables.add(quickInputService.createQuickPick());
            quickPick.title = localize("installFromLocation", "Install Extension from Location");
            quickPick.customButton = true;
            quickPick.customLabel = localize("install button", "Install");
            quickPick.placeholder = localize("installFromLocationPlaceHolder", "Location of the web extension");
            quickPick.ignoreFocusOut = true;
            disposables.add(Event.any(quickPick.onDidAccept, quickPick.onDidCustom)(async () => {
              quickPick.hide();
              if (quickPick.value) {
                try {
                  await extensionManagementService.installFromLocation(URI.parse(quickPick.value));
                } catch (error) {
                  e(error);
                  return;
                }
              }
              c();
            }));
            disposables.add(quickPick.onDidHide(() => disposables.dispose()));
            quickPick.show();
          });
        } else {
          const fileDialogService = accessor.get(IFileDialogService);
          const extensionLocation = await fileDialogService.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            title: localize("installFromLocation", "Install Extension from Location")
          });
          if (extensionLocation?.[0]) {
            await extensionManagementService.installFromLocation(extensionLocation[0]);
          }
        }
      }
    });
    MenuRegistry.appendMenuItem(extensionsSearchActionsMenu, {
      submenu: extensionsFilterSubMenu,
      title: localize("filterExtensions", "Filter Extensions..."),
      group: "navigation",
      order: 2,
      icon: filterIcon
    });
    const showFeaturedExtensionsId = "extensions.filter.featured";
    const featuresExtensionsWhenContext = ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.regex(CONTEXT_GALLERY_FILTER_CAPABILITIES.key, new RegExp(`_${FilterType.Featured}_`)));
    this.registerExtensionAction({
      id: showFeaturedExtensionsId,
      title: localize2("showFeaturedExtensions", "Show Featured Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: featuresExtensionsWhenContext
      }, {
        id: extensionsFilterSubMenu,
        when: featuresExtensionsWhenContext,
        group: "1_predefined",
        order: 1
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("featured filter", "Featured")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@featured ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showPopularExtensions",
      title: localize2("showPopularExtensions", "Show Popular Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: CONTEXT_HAS_GALLERY
      }, {
        id: extensionsFilterSubMenu,
        when: CONTEXT_HAS_GALLERY,
        group: "1_predefined",
        order: 2
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("most popular filter", "Most Popular")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@popular ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showRecommendedExtensions",
      title: localize2("showRecommendedExtensions", "Show Recommended Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: CONTEXT_HAS_GALLERY
      }, {
        id: extensionsFilterSubMenu,
        when: CONTEXT_HAS_GALLERY,
        group: "1_predefined",
        order: 2
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("most popular recommended", "Recommended")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@recommended ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.recentlyPublishedExtensions",
      title: localize2("recentlyPublishedExtensions", "Show Recently Published Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: CONTEXT_HAS_GALLERY
      }, {
        id: extensionsFilterSubMenu,
        when: CONTEXT_HAS_GALLERY,
        group: "1_predefined",
        order: 2
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("recently published filter", "Recently Published")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@recentlyPublished ")
    });
    const extensionsCategoryFilterSubMenu = new MenuId("extensionsCategoryFilterSubMenu");
    MenuRegistry.appendMenuItem(extensionsFilterSubMenu, {
      submenu: extensionsCategoryFilterSubMenu,
      title: localize("filter by category", "Category"),
      when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.regex(CONTEXT_GALLERY_FILTER_CAPABILITIES.key, new RegExp(`_${FilterType.Category}_`))),
      group: "2_categories",
      order: 1
    });
    EXTENSION_CATEGORIES.forEach((category, index) => {
      this.registerExtensionAction({
        id: `extensions.actions.searchByCategory.${category}`,
        title: category,
        menu: [{
          id: extensionsCategoryFilterSubMenu,
          when: CONTEXT_HAS_GALLERY,
          order: index
        }],
        run: () => this.extensionsWorkbenchService.openSearch(`@category:"${category.toLowerCase()}"`)
      });
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.installedExtensions",
      title: localize2("installedExtensions", "Show Installed Extensions"),
      category: ExtensionsLocalizedLabel,
      f1: true,
      menu: [{
        id: extensionsFilterSubMenu,
        group: "3_installed",
        order: 1
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("installed filter", "Installed")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@installed ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.listBuiltInExtensions",
      title: localize2("showBuiltInExtensions", "Show Built-in Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER)
      }, {
        id: extensionsFilterSubMenu,
        group: "3_installed",
        order: 3
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("builtin filter", "Built-in")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@builtin ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.extensionUpdates",
      title: localize2("extensionUpdates", "Show Extension Updates"),
      category: ExtensionsLocalizedLabel,
      precondition: CONTEXT_HAS_GALLERY,
      f1: true,
      menu: [{
        id: extensionsFilterSubMenu,
        group: "3_installed",
        when: CONTEXT_HAS_GALLERY,
        order: 2
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("extension updates filter", "Updates")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@updates")
    });
    this.registerExtensionAction({
      id: LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID,
      title: localize2("showWorkspaceUnsupportedExtensions", "Show Extensions Unsupported By Workspace"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER)
      }, {
        id: extensionsFilterSubMenu,
        group: "3_installed",
        order: 6,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER)
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("workspace unsupported filter", "Workspace Unsupported")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@workspaceUnsupported")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showEnabledExtensions",
      title: localize2("showEnabledExtensions", "Show Enabled Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER)
      }, {
        id: extensionsFilterSubMenu,
        group: "3_installed",
        order: 4
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("enabled filter", "Enabled")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@enabled ")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showDisabledExtensions",
      title: localize2("showDisabledExtensions", "Show Disabled Extensions"),
      category: ExtensionsLocalizedLabel,
      menu: [{
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER)
      }, {
        id: extensionsFilterSubMenu,
        group: "3_installed",
        order: 5
      }],
      menuTitles: {
        [extensionsFilterSubMenu.id]: localize("disabled filter", "Disabled")
      },
      run: () => this.extensionsWorkbenchService.openSearch("@disabled ")
    });
    const extensionsSortSubMenu = new MenuId("extensionsSortSubMenu");
    MenuRegistry.appendMenuItem(extensionsFilterSubMenu, {
      submenu: extensionsSortSubMenu,
      title: localize("sorty by", "Sort By"),
      when: ContextKeyExpr.and(ContextKeyExpr.or(CONTEXT_HAS_GALLERY, DefaultViewsContext)),
      group: "4_sort",
      order: 1
    });
    [
      { id: "installs", title: localize("sort by installs", "Install Count"), precondition: BuiltInExtensionsContext.negate(), sortCapability: SortBy.InstallCount },
      { id: "rating", title: localize("sort by rating", "Rating"), precondition: BuiltInExtensionsContext.negate(), sortCapability: SortBy.WeightedRating },
      { id: "name", title: localize("sort by name", "Name"), precondition: BuiltInExtensionsContext.negate(), sortCapability: SortBy.Title },
      { id: "publishedDate", title: localize("sort by published date", "Published Date"), precondition: BuiltInExtensionsContext.negate(), sortCapability: SortBy.PublishedDate },
      { id: "updateDate", title: localize("sort by update date", "Updated Date"), precondition: ContextKeyExpr.and(SearchMarketplaceExtensionsContext.negate(), RecommendedExtensionsContext.negate(), BuiltInExtensionsContext.negate()), sortCapability: "UpdateDate" }
    ].map(({ id, title, precondition, sortCapability }, index) => {
      const sortCapabilityContext = ContextKeyExpr.regex(CONTEXT_GALLERY_SORT_CAPABILITIES.key, new RegExp(`_${sortCapability}_`));
      this.registerExtensionAction({
        id: `extensions.sort.${id}`,
        title,
        precondition: ContextKeyExpr.and(precondition, ContextKeyExpr.regex(ExtensionsSearchValueContext.key, /^@contribute:/).negate(), sortCapabilityContext),
        menu: [{
          id: extensionsSortSubMenu,
          when: ContextKeyExpr.and(ContextKeyExpr.or(CONTEXT_HAS_GALLERY, DefaultViewsContext), sortCapabilityContext),
          order: index
        }],
        toggled: ExtensionsSortByContext.isEqualTo(id),
        run: async () => {
          const extensionsViewPaneContainer = (await this.viewsService.openViewContainer(VIEWLET_ID, true))?.getViewPaneContainer();
          const currentQuery = Query.parse(extensionsViewPaneContainer?.searchValue ?? "");
          extensionsViewPaneContainer?.search(new Query(currentQuery.value, id).toString());
          extensionsViewPaneContainer?.focus();
        }
      });
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.clearExtensionsSearchResults",
      title: localize2("clearExtensionsSearchResults", "Clear Extensions Search Results"),
      category: ExtensionsLocalizedLabel,
      icon: clearSearchResultsIcon,
      f1: true,
      precondition: SearchHasTextContext,
      menu: {
        id: extensionsSearchActionsMenu,
        group: "navigation",
        order: 1
      },
      run: async (accessor) => {
        const viewPaneContainer = accessor.get(IViewsService).getActiveViewPaneContainerWithId(VIEWLET_ID);
        if (viewPaneContainer) {
          const extensionsViewPaneContainer = viewPaneContainer;
          extensionsViewPaneContainer.search("");
          extensionsViewPaneContainer.focus();
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.refreshExtension",
      title: localize2("refreshExtension", "Refresh"),
      category: ExtensionsLocalizedLabel,
      icon: refreshIcon,
      f1: true,
      menu: {
        id: MenuId.ViewContainerTitle,
        when: ContextKeyExpr.equals("viewContainer", VIEWLET_ID),
        group: "navigation",
        order: 2
      },
      run: async (accessor) => {
        const viewPaneContainer = accessor.get(IViewsService).getActiveViewPaneContainerWithId(VIEWLET_ID);
        if (viewPaneContainer) {
          await viewPaneContainer.refresh();
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.installWorkspaceRecommendedExtensions",
      title: localize("installWorkspaceRecommendedExtensions", "Install Workspace Recommended Extensions"),
      icon: installWorkspaceRecommendedIcon,
      menu: {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.equals("view", WORKSPACE_RECOMMENDATIONS_VIEW_ID),
        group: "navigation",
        order: 1
      },
      run: async (accessor) => {
        const view = accessor.get(IViewsService).getActiveViewWithId(WORKSPACE_RECOMMENDATIONS_VIEW_ID);
        return view.installWorkspaceRecommendations();
      }
    });
    this.registerExtensionAction({
      id: ConfigureWorkspaceFolderRecommendedExtensionsAction.ID,
      title: ConfigureWorkspaceFolderRecommendedExtensionsAction.LABEL,
      icon: configureRecommendedIcon,
      menu: [{
        id: MenuId.CommandPalette,
        when: WorkbenchStateContext.notEqualsTo("empty")
      }, {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.equals("view", WORKSPACE_RECOMMENDATIONS_VIEW_ID),
        group: "navigation",
        order: 2
      }],
      run: () => runAction(this.instantiationService.createInstance(ConfigureWorkspaceFolderRecommendedExtensionsAction, ConfigureWorkspaceFolderRecommendedExtensionsAction.ID, ConfigureWorkspaceFolderRecommendedExtensionsAction.LABEL))
    });
    this.registerExtensionAction({
      id: InstallSpecificVersionOfExtensionAction.ID,
      title: { value: InstallSpecificVersionOfExtensionAction.LABEL, original: "Install Specific Version of Extension..." },
      category: ExtensionsLocalizedLabel,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.or(CONTEXT_HAS_LOCAL_SERVER, CONTEXT_HAS_REMOTE_SERVER, CONTEXT_HAS_WEB_SERVER))
      },
      run: () => runAction(this.instantiationService.createInstance(InstallSpecificVersionOfExtensionAction, InstallSpecificVersionOfExtensionAction.ID, InstallSpecificVersionOfExtensionAction.LABEL))
    });
  }
  // Extension Context Menu
  registerContextMenuActions() {
    this.registerExtensionAction({
      id: SetColorThemeAction.ID,
      title: SetColorThemeAction.TITLE,
      menu: {
        id: MenuId.ExtensionContext,
        group: THEME_ACTIONS_GROUP,
        order: 0,
        when: ContextKeyExpr.and(ContextKeyExpr.not("inExtensionEditor"), ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.has("extensionHasColorThemes"))
      },
      run: async (accessor, extensionId) => {
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const instantiationService = accessor.get(IInstantiationService);
        const extension = extensionWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id: extensionId }));
        if (extension) {
          const action = instantiationService.createInstance(SetColorThemeAction);
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: SetFileIconThemeAction.ID,
      title: SetFileIconThemeAction.TITLE,
      menu: {
        id: MenuId.ExtensionContext,
        group: THEME_ACTIONS_GROUP,
        order: 0,
        when: ContextKeyExpr.and(ContextKeyExpr.not("inExtensionEditor"), ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.has("extensionHasFileIconThemes"))
      },
      run: async (accessor, extensionId) => {
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const instantiationService = accessor.get(IInstantiationService);
        const extension = extensionWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id: extensionId }));
        if (extension) {
          const action = instantiationService.createInstance(SetFileIconThemeAction);
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: SetProductIconThemeAction.ID,
      title: SetProductIconThemeAction.TITLE,
      menu: {
        id: MenuId.ExtensionContext,
        group: THEME_ACTIONS_GROUP,
        order: 0,
        when: ContextKeyExpr.and(ContextKeyExpr.not("inExtensionEditor"), ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.has("extensionHasProductIconThemes"))
      },
      run: async (accessor, extensionId) => {
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const instantiationService = accessor.get(IInstantiationService);
        const extension = extensionWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id: extensionId }));
        if (extension) {
          const action = instantiationService.createInstance(SetProductIconThemeAction);
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showPreReleaseVersion",
      title: localize2("show pre-release version", "Show Pre-Release Version"),
      menu: {
        id: MenuId.ExtensionContext,
        group: INSTALL_ACTIONS_GROUP,
        order: 0,
        when: ContextKeyExpr.and(ContextKeyExpr.has("inExtensionEditor"), ContextKeyExpr.has("galleryExtensionHasPreReleaseVersion"), ContextKeyExpr.has("isPreReleaseExtensionAllowed"), ContextKeyExpr.not("showPreReleaseVersion"), ContextKeyExpr.not("isBuiltinExtension"))
      },
      run: async (accessor, extensionId) => {
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extension = (await extensionWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        extensionWorkbenchService.open(extension, { showPreReleaseVersion: true });
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.showReleasedVersion",
      title: localize2("show released version", "Show Release Version"),
      menu: {
        id: MenuId.ExtensionContext,
        group: INSTALL_ACTIONS_GROUP,
        order: 1,
        when: ContextKeyExpr.and(ContextKeyExpr.has("inExtensionEditor"), ContextKeyExpr.has("galleryExtensionHasPreReleaseVersion"), ContextKeyExpr.has("extensionHasReleaseVersion"), ContextKeyExpr.has("showPreReleaseVersion"), ContextKeyExpr.not("isBuiltinExtension"))
      },
      run: async (accessor, extensionId) => {
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extension = (await extensionWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        extensionWorkbenchService.open(extension, { showPreReleaseVersion: false });
      }
    });
    this.registerExtensionAction({
      id: ToggleAutoUpdateForExtensionAction.ID,
      title: ToggleAutoUpdateForExtensionAction.LABEL,
      category: ExtensionsLocalizedLabel,
      precondition: ContextKeyExpr.and(ContextKeyExpr.or(ContextKeyExpr.notEquals(`config.${AutoUpdateConfigurationKey}`, "on"), ContextKeyExpr.equals("isExtensionEnabled", true)), ContextKeyExpr.not("extensionDisallowInstall"), ContextKeyExpr.has("isExtensionAllowed")),
      menu: {
        id: MenuId.ExtensionContext,
        group: UPDATE_ACTIONS_GROUP,
        order: 1,
        when: ContextKeyExpr.and(
          ContextKeyExpr.not("inExtensionEditor"),
          ContextKeyExpr.equals("extensionStatus", "installed"),
          ContextKeyExpr.not("isBuiltinExtension")
        )
      },
      run: async (accessor, id) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extension = extensionWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id }));
        if (extension) {
          const action = instantiationService.createInstance(ToggleAutoUpdateForExtensionAction);
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: ToggleAutoUpdatesForPublisherAction.ID,
      title: { value: ToggleAutoUpdatesForPublisherAction.LABEL, original: "Auto Update (Publisher)" },
      category: ExtensionsLocalizedLabel,
      precondition: ContextKeyExpr.equals(`config.${AutoUpdateConfigurationKey}`, "off"),
      menu: {
        id: MenuId.ExtensionContext,
        group: UPDATE_ACTIONS_GROUP,
        order: 2,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.not("isBuiltinExtension"))
      },
      run: async (accessor, id) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extension = extensionWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id }));
        if (extension) {
          const action = instantiationService.createInstance(ToggleAutoUpdatesForPublisherAction);
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.switchToPreRlease",
      title: localize("enablePreRleaseLabel", "Switch to Pre-Release Version"),
      category: ExtensionsLocalizedLabel,
      menu: {
        id: MenuId.ExtensionContext,
        group: INSTALL_ACTIONS_GROUP,
        order: 2,
        when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.has("galleryExtensionHasPreReleaseVersion"), ContextKeyExpr.has("isPreReleaseExtensionAllowed"), ContextKeyExpr.not("installedExtensionIsOptedToPreRelease"), ContextKeyExpr.not("inExtensionEditor"), ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.not("isBuiltinExtension"))
      },
      run: async (accessor, id) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extension = extensionWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id }));
        if (extension) {
          const action = instantiationService.createInstance(TogglePreReleaseExtensionAction);
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.switchToRelease",
      title: localize("disablePreRleaseLabel", "Switch to Release Version"),
      category: ExtensionsLocalizedLabel,
      menu: {
        id: MenuId.ExtensionContext,
        group: INSTALL_ACTIONS_GROUP,
        order: 2,
        when: ContextKeyExpr.and(CONTEXT_HAS_GALLERY, ContextKeyExpr.has("galleryExtensionHasPreReleaseVersion"), ContextKeyExpr.has("isExtensionAllowed"), ContextKeyExpr.has("installedExtensionIsOptedToPreRelease"), ContextKeyExpr.not("inExtensionEditor"), ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.not("isBuiltinExtension"))
      },
      run: async (accessor, id) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extension = extensionWorkbenchService.local.find((e) => areSameExtensions(e.identifier, { id }));
        if (extension) {
          const action = instantiationService.createInstance(TogglePreReleaseExtensionAction);
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: ClearLanguageAction.ID,
      title: ClearLanguageAction.TITLE,
      menu: {
        id: MenuId.ExtensionContext,
        group: INSTALL_ACTIONS_GROUP,
        order: 0,
        when: ContextKeyExpr.and(ContextKeyExpr.not("inExtensionEditor"), ContextKeyExpr.has("canSetLanguage"), ContextKeyExpr.has("isActiveLanguagePackExtension"))
      },
      run: async (accessor, extensionId) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extension = (await extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        const action = instantiationService.createInstance(ClearLanguageAction);
        action.extension = extension;
        return runAction(action);
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.installUnsigned",
      title: localize("install", "Install"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "0_install",
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("extensionStatus", "uninstalled"),
          ContextKeyExpr.has("isGalleryExtension"),
          ContextKeyExpr.not("extensionDisallowInstall"),
          ContextKeyExpr.has("extensionIsUnsigned"),
          ContextKeyExpr.or(ContextKeyExpr.and(CONTEXT_GALLERY_ALL_PUBLIC_REPOSITORY_SIGNED, ContextKeyExpr.not("extensionIsPrivate")), ContextKeyExpr.and(CONTEXT_GALLERY_ALL_PRIVATE_REPOSITORY_SIGNED, ContextKeyExpr.has("extensionIsPrivate")))
        ),
        order: 1
      },
      run: async (accessor, extensionId) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extension = this.extensionsWorkbenchService.local.filter((e) => areSameExtensions(e.identifier, { id: extensionId }))[0] || (await this.extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        if (extension) {
          const action = instantiationService.createInstance(InstallAction, { installPreReleaseVersion: this.extensionManagementService.preferPreReleases });
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.installAndDonotSync",
      title: localize("install installAndDonotSync", "Install (Do not Sync)"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "0_install",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "uninstalled"), ContextKeyExpr.has("isGalleryExtension"), ContextKeyExpr.has("isExtensionAllowed"), ContextKeyExpr.not("extensionDisallowInstall"), CONTEXT_SYNC_ENABLEMENT),
        order: 1
      },
      run: async (accessor, extensionId) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extension = this.extensionsWorkbenchService.local.filter((e) => areSameExtensions(e.identifier, { id: extensionId }))[0] || (await this.extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        if (extension) {
          const action = instantiationService.createInstance(InstallAction, {
            installPreReleaseVersion: this.extensionManagementService.preferPreReleases,
            isMachineScoped: true
          });
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.installPrereleaseAndDonotSync",
      title: localize("installPrereleaseAndDonotSync", "Install Pre-Release (Do not Sync)"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "0_install",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "uninstalled"), ContextKeyExpr.has("isGalleryExtension"), ContextKeyExpr.has("extensionHasPreReleaseVersion"), ContextKeyExpr.has("isPreReleaseExtensionAllowed"), ContextKeyExpr.not("extensionDisallowInstall"), CONTEXT_SYNC_ENABLEMENT),
        order: 2
      },
      run: async (accessor, extensionId) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extension = this.extensionsWorkbenchService.local.filter((e) => areSameExtensions(e.identifier, { id: extensionId }))[0] || (await this.extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        if (extension) {
          const action = instantiationService.createInstance(InstallAction, {
            isMachineScoped: true,
            preRelease: true
          });
          action.extension = extension;
          return runAction(action);
        }
      }
    });
    this.registerExtensionAction({
      id: InstallAnotherVersionAction.ID,
      title: InstallAnotherVersionAction.LABEL,
      menu: {
        id: MenuId.ExtensionContext,
        group: "0_install",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "uninstalled"), ContextKeyExpr.has("isGalleryExtension"), ContextKeyExpr.has("isExtensionAllowed"), ContextKeyExpr.not("extensionDisallowInstall")),
        order: 3
      },
      run: async (accessor, extensionId) => {
        const instantiationService = accessor.get(IInstantiationService);
        const extension = this.extensionsWorkbenchService.local.filter((e) => areSameExtensions(e.identifier, { id: extensionId }))[0] || (await this.extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        if (extension) {
          return runAction(instantiationService.createInstance(InstallAnotherVersionAction, extension, false));
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.copyExtension",
      title: localize2("workbench.extensions.action.copyExtension", "Copy"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "1_copy"
      },
      run: async (accessor, extensionId) => {
        const clipboardService = accessor.get(IClipboardService);
        const extension = this.extensionsWorkbenchService.local.filter((e) => areSameExtensions(e.identifier, { id: extensionId }))[0] || (await this.extensionsWorkbenchService.getExtensions([{ id: extensionId }], CancellationToken.None))[0];
        if (extension) {
          const name = localize("extensionInfoName", "Name: {0}", extension.displayName);
          const id = localize("extensionInfoId", "Id: {0}", extensionId);
          const description = localize("extensionInfoDescription", "Description: {0}", extension.description);
          const verision = localize("extensionInfoVersion", "Version: {0}", extension.version);
          const publisher = localize("extensionInfoPublisher", "Publisher: {0}", extension.publisherDisplayName);
          const link = extension.url ? localize("extensionInfoVSMarketplaceLink", "VS Marketplace Link: {0}", `${extension.url}`) : null;
          const clipboardStr = `${name}
${id}
${description}
${verision}
${publisher}${link ? "\n" + link : ""}`;
          await clipboardService.writeText(clipboardStr);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.copyExtensionId",
      title: localize2("workbench.extensions.action.copyExtensionId", "Copy Extension ID"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "1_copy"
      },
      run: async (accessor, id) => accessor.get(IClipboardService).writeText(id)
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.copyLink",
      title: localize2("workbench.extensions.action.copyLink", "Copy Link"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "1_copy",
        when: ContextKeyExpr.and(ContextKeyExpr.has("isGalleryExtension"), CONTEXT_GALLERY_HAS_EXTENSION_LINK)
      },
      run: async (accessor, _, extension) => {
        const clipboardService = accessor.get(IClipboardService);
        if (extension.galleryLink) {
          await clipboardService.writeText(extension.galleryLink);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.configure",
      title: localize2("workbench.extensions.action.configure", "Settings"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "2_configure",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.has("extensionHasConfiguration")),
        order: 1
      },
      run: async (accessor, id) => accessor.get(IPreferencesService).openSettings({ jsonEditor: false, query: `@ext:${id}` })
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.download",
      title: localize("download VSIX", "Download VSIX"),
      menu: {
        id: MenuId.ExtensionContext,
        when: ContextKeyExpr.and(ContextKeyExpr.not("extensionDisallowInstall"), ContextKeyExpr.has("isGalleryExtension")),
        order: this.productService.quality === "stable" ? 0 : 1
      },
      run: async (accessor, extensionId) => {
        accessor.get(IExtensionsWorkbenchService).downloadVSIX(extensionId, "release");
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.downloadPreRelease",
      title: localize("download pre-release", "Download Pre-Release VSIX"),
      menu: {
        id: MenuId.ExtensionContext,
        when: ContextKeyExpr.and(ContextKeyExpr.not("extensionDisallowInstall"), ContextKeyExpr.has("isGalleryExtension"), ContextKeyExpr.has("extensionHasPreReleaseVersion")),
        order: this.productService.quality === "stable" ? 1 : 0
      },
      run: async (accessor, extensionId) => {
        accessor.get(IExtensionsWorkbenchService).downloadVSIX(extensionId, "prerelease");
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.downloadSpecificVersion",
      title: localize("download specific version", "Download Specific Version VSIX..."),
      menu: {
        id: MenuId.ExtensionContext,
        when: ContextKeyExpr.and(ContextKeyExpr.not("extensionDisallowInstall"), ContextKeyExpr.has("isGalleryExtension")),
        order: 2
      },
      run: async (accessor, extensionId) => {
        accessor.get(IExtensionsWorkbenchService).downloadVSIX(extensionId, "any");
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.manageAccountPreferences",
      title: localize2("workbench.extensions.action.changeAccountPreference", "Account Preferences"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "2_configure",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.has("extensionHasAccountPreferences")),
        order: 2
      },
      run: (accessor, id) => accessor.get(ICommandService).executeCommand("_manageAccountPreferencesForExtension", id)
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.configureKeybindings",
      title: localize2("workbench.extensions.action.configureKeybindings", "Keyboard Shortcuts"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "2_configure",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.has("extensionHasKeybindings")),
        order: 2
      },
      run: async (accessor, id) => accessor.get(IPreferencesService).openGlobalKeybindingSettings(false, { query: `@ext:${id}` })
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.toggleApplyToAllProfiles",
      title: localize2("workbench.extensions.action.toggleApplyToAllProfiles", "Apply Extension to all Profiles"),
      toggled: ContextKeyExpr.has("isApplicationScopedExtension"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "2_configure",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "installed"), ContextKeyExpr.has("isDefaultApplicationScopedExtension").negate(), ContextKeyExpr.has("isBuiltinExtension").negate(), ContextKeyExpr.equals("isWorkspaceScopedExtension", false)),
        order: 3
      },
      run: async (accessor, _, extensionArg) => {
        const uriIdentityService = accessor.get(IUriIdentityService);
        const extension = extensionArg.location ? this.extensionsWorkbenchService.installed.find((e) => uriIdentityService.extUri.isEqual(e.local?.location, extensionArg.location)) : void 0;
        if (extension) {
          return this.extensionsWorkbenchService.toggleApplyExtensionToAllProfiles(extension);
        }
      }
    });
    this.registerExtensionAction({
      id: TOGGLE_IGNORE_EXTENSION_ACTION_ID,
      title: localize2("workbench.extensions.action.toggleIgnoreExtension", "Sync This Extension"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "2_configure",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("extensionStatus", "installed"), CONTEXT_SYNC_ENABLEMENT, ContextKeyExpr.equals("isWorkspaceScopedExtension", false)),
        order: 4
      },
      run: async (accessor, id) => {
        const extension = this.extensionsWorkbenchService.local.find((e) => areSameExtensions({ id }, e.identifier));
        if (extension) {
          return this.extensionsWorkbenchService.toggleExtensionIgnoredToSync(extension);
        }
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.ignoreRecommendation",
      title: localize2("workbench.extensions.action.ignoreRecommendation", "Ignore Recommendation"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "3_recommendations",
        when: ContextKeyExpr.has("isExtensionRecommended"),
        order: 1
      },
      run: async (accessor, id) => accessor.get(IExtensionIgnoredRecommendationsService).toggleGlobalIgnoredRecommendation(id, true)
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.undoIgnoredRecommendation",
      title: localize2("workbench.extensions.action.undoIgnoredRecommendation", "Undo Ignored Recommendation"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "3_recommendations",
        when: ContextKeyExpr.has("isUserIgnoredRecommendation"),
        order: 1
      },
      run: async (accessor, id) => accessor.get(IExtensionIgnoredRecommendationsService).toggleGlobalIgnoredRecommendation(id, false)
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.addExtensionToWorkspaceRecommendations",
      title: localize2("workbench.extensions.action.addExtensionToWorkspaceRecommendations", "Add to Workspace Recommendations"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "3_recommendations",
        when: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("empty"), ContextKeyExpr.has("isBuiltinExtension").negate(), ContextKeyExpr.has("isExtensionWorkspaceRecommended").negate(), ContextKeyExpr.has("isUserIgnoredRecommendation").negate(), ContextKeyExpr.notEquals("extensionSource", "resource")),
        order: 2
      },
      run: (accessor, id) => accessor.get(IWorkspaceExtensionsConfigService).toggleRecommendation(id)
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.removeExtensionFromWorkspaceRecommendations",
      title: localize2("workbench.extensions.action.removeExtensionFromWorkspaceRecommendations", "Remove from Workspace Recommendations"),
      menu: {
        id: MenuId.ExtensionContext,
        group: "3_recommendations",
        when: ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("empty"), ContextKeyExpr.has("isBuiltinExtension").negate(), ContextKeyExpr.has("isExtensionWorkspaceRecommended")),
        order: 2
      },
      run: (accessor, id) => accessor.get(IWorkspaceExtensionsConfigService).toggleRecommendation(id)
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.addToWorkspaceRecommendations",
      title: localize2("workbench.extensions.action.addToWorkspaceRecommendations", "Add Extension to Workspace Recommendations"),
      category: EXTENSIONS_CATEGORY,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("workspace"), ContextKeyExpr.equals("resourceScheme", Schemas.extension))
      },
      async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const workspaceExtensionsConfigService = accessor.get(IWorkspaceExtensionsConfigService);
        if (!(editorService.activeEditor instanceof ExtensionsInput)) {
          return;
        }
        const extensionId = editorService.activeEditor.extension.identifier.id.toLowerCase();
        const recommendations = await workspaceExtensionsConfigService.getRecommendations();
        if (recommendations.includes(extensionId)) {
          return;
        }
        await workspaceExtensionsConfigService.toggleRecommendation(extensionId);
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.addToWorkspaceFolderRecommendations",
      title: localize2("workbench.extensions.action.addToWorkspaceFolderRecommendations", "Add Extension to Workspace Folder Recommendations"),
      category: EXTENSIONS_CATEGORY,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("folder"), ContextKeyExpr.equals("resourceScheme", Schemas.extension))
      },
      run: () => this.commandService.executeCommand("workbench.extensions.action.addToWorkspaceRecommendations")
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.addToWorkspaceIgnoredRecommendations",
      title: localize2("workbench.extensions.action.addToWorkspaceIgnoredRecommendations", "Add Extension to Workspace Ignored Recommendations"),
      category: EXTENSIONS_CATEGORY,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("workspace"), ContextKeyExpr.equals("resourceScheme", Schemas.extension))
      },
      async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const workspaceExtensionsConfigService = accessor.get(IWorkspaceExtensionsConfigService);
        if (!(editorService.activeEditor instanceof ExtensionsInput)) {
          return;
        }
        const extensionId = editorService.activeEditor.extension.identifier.id.toLowerCase();
        const unwantedRecommendations = await workspaceExtensionsConfigService.getUnwantedRecommendations();
        if (unwantedRecommendations.includes(extensionId)) {
          return;
        }
        await workspaceExtensionsConfigService.toggleUnwantedRecommendation(extensionId);
      }
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.addToWorkspaceFolderIgnoredRecommendations",
      title: localize2("workbench.extensions.action.addToWorkspaceFolderIgnoredRecommendations", "Add Extension to Workspace Folder Ignored Recommendations"),
      category: EXTENSIONS_CATEGORY,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("folder"), ContextKeyExpr.equals("resourceScheme", Schemas.extension))
      },
      run: () => this.commandService.executeCommand("workbench.extensions.action.addToWorkspaceIgnoredRecommendations")
    });
    this.registerExtensionAction({
      id: ConfigureWorkspaceRecommendedExtensionsAction.ID,
      title: { value: ConfigureWorkspaceRecommendedExtensionsAction.LABEL, original: "Configure Recommended Extensions (Workspace)" },
      category: EXTENSIONS_CATEGORY,
      menu: {
        id: MenuId.CommandPalette,
        when: WorkbenchStateContext.isEqualTo("workspace")
      },
      run: () => runAction(this.instantiationService.createInstance(ConfigureWorkspaceRecommendedExtensionsAction, ConfigureWorkspaceRecommendedExtensionsAction.ID, ConfigureWorkspaceRecommendedExtensionsAction.LABEL))
    });
    this.registerExtensionAction({
      id: "workbench.extensions.action.manageTrustedPublishers",
      title: localize2("workbench.extensions.action.manageTrustedPublishers", "Manage Trusted Extension Publishers"),
      category: EXTENSIONS_CATEGORY,
      f1: true,
      run: async (accessor) => {
        const quickInputService = accessor.get(IQuickInputService);
        const extensionManagementService = accessor.get(IWorkbenchExtensionManagementService);
        const trustedPublishers = extensionManagementService.getTrustedPublishers();
        const trustedPublisherItems = trustedPublishers.map((publisher) => ({
          id: publisher.publisher,
          label: publisher.publisherDisplayName,
          description: publisher.publisher,
          picked: true
        })).sort((a, b) => a.label.localeCompare(b.label));
        const result = await quickInputService.pick(trustedPublisherItems, {
          canPickMany: true,
          title: localize("trustedPublishers", "Manage Trusted Extension Publishers"),
          placeHolder: localize("trustedPublishersPlaceholder", "Choose which publishers to trust")
        });
        if (result) {
          const untrustedPublishers = [];
          for (const { publisher } of trustedPublishers) {
            if (!result.some((r) => r.id === publisher)) {
              untrustedPublishers.push(publisher);
            }
          }
          trustedPublishers.filter((publisher) => !result.some((r) => r.id === publisher.publisher));
          extensionManagementService.untrustPublishers(...untrustedPublishers);
        }
      }
    });
  }
  registerExtensionAction(extensionActionOptions) {
    const menus = extensionActionOptions.menu ? Array.isArray(extensionActionOptions.menu) ? extensionActionOptions.menu : [extensionActionOptions.menu] : [];
    let menusWithOutTitles = [];
    const menusWithTitles = [];
    if (extensionActionOptions.menuTitles) {
      for (let index = 0; index < menus.length; index++) {
        const menu = menus[index];
        const menuTitle = extensionActionOptions.menuTitles[menu.id.id];
        if (menuTitle) {
          menusWithTitles.push({ id: menu.id, item: { ...menu, command: { id: extensionActionOptions.id, title: menuTitle } } });
        } else {
          menusWithOutTitles.push(menu);
        }
      }
    } else {
      menusWithOutTitles = menus;
    }
    const disposables = new DisposableStore();
    disposables.add(registerAction2(class extends Action2 {
      constructor() {
        super({
          ...extensionActionOptions,
          menu: menusWithOutTitles
        });
      }
      run(accessor, ...args) {
        return extensionActionOptions.run(accessor, ...args);
      }
    }));
    if (menusWithTitles.length) {
      disposables.add(MenuRegistry.appendMenuItems(menusWithTitles));
    }
    return disposables;
  }
};
ExtensionsContributions = __decorateClass([
  __decorateParam(0, IExtensionManagementService),
  __decorateParam(1, IExtensionManagementServerService),
  __decorateParam(2, IExtensionGalleryManifestService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IViewsService),
  __decorateParam(5, IExtensionsWorkbenchService),
  __decorateParam(6, IWorkbenchExtensionEnablementService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, IProductService),
  __decorateParam(11, IPluginInstallService)
], ExtensionsContributions);
let ExtensionStorageCleaner = class {
  constructor(extensionManagementService, storageService) {
    ExtensionStorageService.removeOutdatedExtensionVersions(extensionManagementService, storageService);
  }
};
ExtensionStorageCleaner = __decorateClass([
  __decorateParam(0, IExtensionManagementService),
  __decorateParam(1, IStorageService)
], ExtensionStorageCleaner);
let TrustedPublishersInitializer = class {
  constructor(extensionManagementService, userDataProfilesService, productService, storageService) {
    const trustedPublishersInitStatusKey = "trusted-publishers-init-migration";
    if (!storageService.get(trustedPublishersInitStatusKey, StorageScope.APPLICATION)) {
      for (const profile of userDataProfilesService.profiles) {
        extensionManagementService.getInstalled(ExtensionType.User, profile.extensionsResource).then(async (extensions) => {
          const trustedPublishers = /* @__PURE__ */ new Map();
          for (const extension of extensions) {
            if (!extension.publisherDisplayName) {
              continue;
            }
            const publisher = extension.manifest.publisher.toLowerCase();
            if (productService.trustedExtensionPublishers?.includes(publisher) || extension.publisherDisplayName && productService.trustedExtensionPublishers?.includes(extension.publisherDisplayName.toLowerCase())) {
              continue;
            }
            trustedPublishers.set(publisher, { publisher, publisherDisplayName: extension.publisherDisplayName });
          }
          if (trustedPublishers.size) {
            extensionManagementService.trustPublishers(...trustedPublishers.values());
          }
          storageService.store(trustedPublishersInitStatusKey, "true", StorageScope.APPLICATION, StorageTarget.MACHINE);
        });
      }
    }
  }
};
TrustedPublishersInitializer = __decorateClass([
  __decorateParam(0, IWorkbenchExtensionManagementService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IStorageService)
], TrustedPublishersInitializer);
let ExtensionToolsContribution = class extends Disposable {
  constructor(toolsService, instantiationService) {
    super();
    const searchExtensionsTool = instantiationService.createInstance(SearchExtensionsTool);
    this._register(toolsService.registerTool(SearchExtensionsToolData, searchExtensionsTool));
    this._register(toolsService.vscodeToolSet.addTool(SearchExtensionsToolData));
  }
};
ExtensionToolsContribution.ID = "extensions.chat.toolsContribution";
ExtensionToolsContribution = __decorateClass([
  __decorateParam(0, ILanguageModelToolsService),
  __decorateParam(1, IInstantiationService)
], ExtensionToolsContribution);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ExtensionsContributions, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(StatusUpdater, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(MaliciousExtensionChecker, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(KeymapExtensions, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(ExtensionsViewletViewsContribution, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(ExtensionActivationProgress, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(ExtensionDependencyChecker, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(ExtensionEnablementWorkspaceTrustTransitionParticipant, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(ExtensionsCompletionItemsProvider, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(ExtensionEnablementContextKeysContribution, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(UnsupportedExtensionsMigrationContrib, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(TrustedPublishersInitializer, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(ExtensionMarketplaceStatusUpdater, LifecyclePhase.Eventually);
if (isWeb) {
  workbenchRegistry.registerWorkbenchContribution(ExtensionStorageCleaner, LifecyclePhase.Eventually);
}
registerWorkbenchContribution2(ExtensionToolsContribution.ID, ExtensionToolsContribution, WorkbenchPhase.AfterRestored);
registerAction2(class ExtensionsGallerySignInAction extends Action2 {
  constructor() {
    super({
      id: "workbench.extensions.actions.gallery.signIn",
      title: localize2("signInToMarketplace", "Sign in to access Extensions Marketplace"),
      menu: {
        id: MenuId.AccountsContext,
        when: CONTEXT_EXTENSIONS_GALLERY_STATUS.isEqualTo(ExtensionGalleryManifestStatus.RequiresSignIn)
      }
    });
  }
  run(accessor) {
    return accessor.get(ICommandService).executeCommand(DEFAULT_ACCOUNT_SIGN_IN_COMMAND);
  }
});
Registry.as(ConfigurationMigrationExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: AutoUpdateConfigurationKey,
  /**
   * Migrates the `extensions.autoUpdate` setting to its new `'on' | 'off'` values.
   *
   * The setting previously supported several values that are now retired:
   * - `true` (All Extensions) and `'onlyEnabledExtensions'` (Only Enabled Extensions)
   *   are folded into the new `'on'` value, along with the insiders-only `'delayed'` value.
   * - `false` (None) and the internal `'onlySelectedExtensions'` value map to `'off'`.
   *   In `'off'` mode, extensions explicitly opted in per-extension are still auto-updated,
   *   which preserves the `'onlySelectedExtensions'` behavior.
   *
   * Returning `[]` is a no-op, used when the value is already in the new format
   * (`'on'`/`'off'`) or unset.
   */
  migrateFn: (value, accessor) => {
    if (value === void 0 || value === "on" || value === "off") {
      return [];
    }
    if (value === false || value === "onlySelectedExtensions") {
      return { value: "off" };
    }
    return { value: "on" };
  }
}]);
export {
  CONTEXT_HAS_LOCAL_SERVER,
  CONTEXT_HAS_REMOTE_SERVER,
  CONTEXT_HAS_WEB_SERVER,
  VIEW_CONTAINER
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgbW5lbW9uaWNCdXR0b25MYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBpc0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNOYXRpdmUsIGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgUG9saWN5Q2F0ZWdvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IE11bHRpQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29weUFjdGlvbiwgQ3V0QWN0aW9uLCBQYXN0ZUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NsaXBib2FyZC9icm93c2VyL2NsaXBib2FyZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSUFjdGlvbjJPcHRpb25zLCBJTWVudUl0ZW0sIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBDb25maWd1cmF0aW9uU2NvcGUsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UsIElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzLCBFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VUeXBlLCBFeHRlbnNpb25HYWxsZXJ5U2VydmljZVVybENvbmZpZ0tleSwgZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmksIElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LmpzJztcbmltcG9ydCB7IEVYVEVOU0lPTl9JTlNUQUxMX1NPVVJDRV9DT05URVhULCBFeHRlbnNpb25JbnN0YWxsU291cmNlLCBFeHRlbnNpb25SZXF1ZXN0c1RpbWVvdXRDb25maWdLZXksIEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCwgRmlsdGVyVHlwZSwgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIFByZWZlcmVuY2VzTG9jYWxpemVkTGFiZWwsIFNvcnRCeSwgVmVyaWZ5RXh0ZW5zaW9uU2lnbmF0dXJlQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lRXh0ZW5zaW9ucywgZ2V0SWRBbmRWZXJzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25TdG9yYWdlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMvY29tbW9uL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBFWFRFTlNJT05fQ0FURUdPUklFUywgRXh0ZW5zaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0ICogYXMganNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElRdWlja0FjY2Vzc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lRGVzY3JpcHRvciwgSUVkaXRvclBhbmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbk1pZ3JhdGlvbkV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgUmVzb3VyY2VDb250ZXh0S2V5LCBXb3JrYmVuY2hTdGF0ZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVZpZXdDb250YWluZXJzUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgVmlld0NvbnRhaW5lckV4dGVuc2lvbnMsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0FDQ09VTlRfU0lHTl9JTl9DT01NQU5EIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYWNjb3VudHMvYnJvd3Nlci9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbmFibGVtZW50U3RhdGUsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSwgSVB1Ymxpc2hlckluZm8sIElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UsIElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi93b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnLmpzJztcbmltcG9ydCB7IEVYVEVOU0lPTlNfU1VQUE9SVF9BR0VOVFNfV0lORE9XIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9TWU5DX0VOQUJMRU1FTlQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBXT1JLU1BBQ0VfVFJVU1RfRVhURU5TSU9OX1NVUFBPUlQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJUGx1Z2luSW5zdGFsbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9wbHVnaW5zL3BsdWdpbkluc3RhbGxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0tFWUJJTkRJTkdTX0VESVRPUiB9IGZyb20gJy4uLy4uL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJV2VidmlldyB9IGZyb20gJy4uLy4uL3dlYnZpZXcvYnJvd3Nlci93ZWJ2aWV3LmpzJztcbmltcG9ydCB7IFF1ZXJ5IH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvblF1ZXJ5LmpzJztcbmltcG9ydCB7IEF1dG9SZXN0YXJ0Q29uZmlndXJhdGlvbktleSwgQXV0b1VwZGF0ZUNvbmZpZ3VyYXRpb25LZXksIENPTlRFWFRfRVhURU5TSU9OU19HQUxMRVJZX1NUQVRVUywgQ09OVEVYVF9IQVNfR0FMTEVSWSwgRGVmYXVsdFZpZXdzQ29udGV4dCwgRXh0ZW5zaW9uRWRpdG9yVGFiLCBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZSwgRVhURU5TSU9OU19DQVRFR09SWSwgZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUsIGV4dGVuc2lvbnNTZWFyY2hBY3Rpb25zTWVudSwgSGFzT3V0ZGF0ZWRFeHRlbnNpb25zQ29udGV4dCwgSUV4dGVuc2lvbkFyZywgSUV4dGVuc2lvbnNWaWV3UGFuZUNvbnRhaW5lciwgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCBJTlNUQUxMX0FDVElPTlNfR1JPVVAsIElOU1RBTExfRVhURU5TSU9OX0ZST01fVlNJWF9DT01NQU5EX0lELCBJV29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zVmlldywgTElTVF9XT1JLU1BBQ0VfVU5TVVBQT1JURURfRVhURU5TSU9OU19DT01NQU5EX0lELCBPVVREQVRFRF9FWFRFTlNJT05TX1ZJRVdfSUQsIFNFTEVDVF9JTlNUQUxMX1ZTSVhfRVhURU5TSU9OX0NPTU1BTkRfSUQsIFRIRU1FX0FDVElPTlNfR1JPVVAsIFRPR0dMRV9JR05PUkVfRVhURU5TSU9OX0FDVElPTl9JRCwgVVBEQVRFX0FDVElPTlNfR1JPVVAsIFZJRVdMRVRfSUQsIFdPUktTUEFDRV9SRUNPTU1FTkRBVElPTlNfVklFV19JRCB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNDb25maWd1cmF0aW9uU2NoZW1hLCBFeHRlbnNpb25zQ29uZmlndXJhdGlvblNjaGVtYUlkIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnNGaWxlVGVtcGxhdGUuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc0lucHV0IH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnNJbnB1dC5qcyc7XG5pbXBvcnQgeyBLZXltYXBFeHRlbnNpb25zIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnNVdGlscy5qcyc7XG5pbXBvcnQgeyBTZWFyY2hFeHRlbnNpb25zVG9vbCwgU2VhcmNoRXh0ZW5zaW9uc1Rvb2xEYXRhIH0gZnJvbSAnLi4vY29tbW9uL3NlYXJjaEV4dGVuc2lvbnNUb29sLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkVkaXRvciB9IGZyb20gJy4vZXh0ZW5zaW9uRWRpdG9yLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkVuYWJsZW1lbnRXb3Jrc3BhY2VUcnVzdFRyYW5zaXRpb25QYXJ0aWNpcGFudCB9IGZyb20gJy4vZXh0ZW5zaW9uRW5hYmxlbWVudFdvcmtzcGFjZVRydXN0VHJhbnNpdGlvblBhcnRpY2lwYW50LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UgfSBmcm9tICcuL2V4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2xlYXJMYW5ndWFnZUFjdGlvbiwgQ29uZmlndXJlV29ya3NwYWNlRm9sZGVyUmVjb21tZW5kZWRFeHRlbnNpb25zQWN0aW9uLCBDb25maWd1cmVXb3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnNBY3Rpb24sIEluc3RhbGxBY3Rpb24sIEluc3RhbGxBbm90aGVyVmVyc2lvbkFjdGlvbiwgSW5zdGFsbFNwZWNpZmljVmVyc2lvbk9mRXh0ZW5zaW9uQWN0aW9uLCBTZXRDb2xvclRoZW1lQWN0aW9uLCBTZXRGaWxlSWNvblRoZW1lQWN0aW9uLCBTZXRQcm9kdWN0SWNvblRoZW1lQWN0aW9uLCBUb2dnbGVBdXRvVXBkYXRlRm9yRXh0ZW5zaW9uQWN0aW9uLCBUb2dnbGVBdXRvVXBkYXRlc0ZvclB1Ymxpc2hlckFjdGlvbiwgVG9nZ2xlUHJlUmVsZWFzZUV4dGVuc2lvbkFjdGlvbiB9IGZyb20gJy4vZXh0ZW5zaW9uc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uQWN0aXZhdGlvblByb2dyZXNzIH0gZnJvbSAnLi9leHRlbnNpb25zQWN0aXZhdGlvblByb2dyZXNzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNDb21wbGV0aW9uSXRlbXNQcm92aWRlciB9IGZyb20gJy4vZXh0ZW5zaW9uc0NvbXBsZXRpb25JdGVtc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkVuYWJsZW1lbnRDb250ZXh0S2V5c0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4vZXh0ZW5zaW9uRW5hYmxlbWVudENvbnRleHQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uRGVwZW5kZW5jeUNoZWNrZXIgfSBmcm9tICcuL2V4dGVuc2lvbnNEZXBlbmRlbmN5Q2hlY2tlci5qcyc7XG5pbXBvcnQgeyBjbGVhclNlYXJjaFJlc3VsdHNJY29uLCBjb25maWd1cmVSZWNvbW1lbmRlZEljb24sIGV4dGVuc2lvbnNWaWV3SWNvbiwgZmlsdGVySWNvbiwgaW5zdGFsbFdvcmtzcGFjZVJlY29tbWVuZGVkSWNvbiwgcmVmcmVzaEljb24gfSBmcm9tICcuL2V4dGVuc2lvbnNJY29ucy5qcyc7XG5pbXBvcnQgeyBJbnN0YWxsRXh0ZW5zaW9uUXVpY2tBY2Nlc3NQcm92aWRlciwgTWFuYWdlRXh0ZW5zaW9uc1F1aWNrQWNjZXNzUHJvdmlkZXIgfSBmcm9tICcuL2V4dGVuc2lvbnNRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBCdWlsdEluRXh0ZW5zaW9uc0NvbnRleHQsIEV4dGVuc2lvbk1hcmtldHBsYWNlU3RhdHVzVXBkYXRlciwgRXh0ZW5zaW9uc1NlYXJjaFZhbHVlQ29udGV4dCwgRXh0ZW5zaW9uc1NvcnRCeUNvbnRleHQsIEV4dGVuc2lvbnNWaWV3bGV0Vmlld3NDb250cmlidXRpb24sIEV4dGVuc2lvbnNWaWV3UGFuZUNvbnRhaW5lciwgTWFsaWNpb3VzRXh0ZW5zaW9uQ2hlY2tlciwgUmVjb21tZW5kZWRFeHRlbnNpb25zQ29udGV4dCwgU2VhcmNoSGFzVGV4dENvbnRleHQsIFNlYXJjaE1hcmtldHBsYWNlRXh0ZW5zaW9uc0NvbnRleHQsIFN0YXR1c1VwZGF0ZXIgfSBmcm9tICcuL2V4dGVuc2lvbnNWaWV3bGV0LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi9leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvZXh0ZW5zaW9uTWFuYWdlbWVudC5jc3MnO1xuaW1wb3J0IHsgVW5zdXBwb3J0ZWRFeHRlbnNpb25zTWlncmF0aW9uQ29udHJpYiB9IGZyb20gJy4vdW5zdXBwb3J0ZWRFeHRlbnNpb25zTWlncmF0aW9uQ29udHJpYnV0aW9uLmpzJztcblxuLy8gU2luZ2xldG9uc1xucmVnaXN0ZXJTaW5nbGV0b24oSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCBFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIgLyogQXV0byB1cGRhdGVzIGV4dGVuc2lvbnMgKi8pO1xucmVnaXN0ZXJTaW5nbGV0b24oSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZSwgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLCBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlciAvKiBQcm9tcHRzIHJlY29tbWVuZGF0aW9ucyBpbiB0aGUgYmFja2dyb3VuZCAqLyk7XG5cbi8vIFF1aWNrIEFjY2Vzc1xuUmVnaXN0cnkuYXM8SVF1aWNrQWNjZXNzUmVnaXN0cnk+KEV4dGVuc2lvbnMuUXVpY2thY2Nlc3MpLnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcih7XG5cdGN0b3I6IE1hbmFnZUV4dGVuc2lvbnNRdWlja0FjY2Vzc1Byb3ZpZGVyLFxuXHRwcmVmaXg6IE1hbmFnZUV4dGVuc2lvbnNRdWlja0FjY2Vzc1Byb3ZpZGVyLlBSRUZJWCxcblx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdtYW5hZ2VFeHRlbnNpb25zUXVpY2tBY2Nlc3NQbGFjZWhvbGRlcicsIFwiUHJlc3MgRW50ZXIgdG8gbWFuYWdlIGV4dGVuc2lvbnMuXCIpLFxuXHRoZWxwRW50cmllczogW3sgZGVzY3JpcHRpb246IGxvY2FsaXplKCdtYW5hZ2VFeHRlbnNpb25zSGVscCcsIFwiTWFuYWdlIEV4dGVuc2lvbnNcIikgfV1cbn0pO1xuXG4vLyBFZGl0b3JcblJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0RXh0ZW5zaW9uRWRpdG9yLFxuXHRcdEV4dGVuc2lvbkVkaXRvci5JRCxcblx0XHRsb2NhbGl6ZSgnZXh0ZW5zaW9uJywgXCJFeHRlbnNpb25cIilcblx0KSxcblx0W1xuXHRcdG5ldyBTeW5jRGVzY3JpcHRvcihFeHRlbnNpb25zSW5wdXQpXG5cdF0pO1xuXG5leHBvcnQgY29uc3QgVklFV19DT05UQUlORVIgPSBSZWdpc3RyeS5hczxJVmlld0NvbnRhaW5lcnNSZWdpc3RyeT4oVmlld0NvbnRhaW5lckV4dGVuc2lvbnMuVmlld0NvbnRhaW5lcnNSZWdpc3RyeSkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKFxuXHR7XG5cdFx0aWQ6IFZJRVdMRVRfSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignZXh0ZW5zaW9ucycsIFwiRXh0ZW5zaW9uc1wiKSxcblx0XHRvcGVuQ29tbWFuZEFjdGlvbkRlc2NyaXB0b3I6IHtcblx0XHRcdGlkOiBWSUVXTEVUX0lELFxuXHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVZpZXdFeHRlbnNpb25zJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkUmJnh0ZW5zaW9uc1wiKSxcblx0XHRcdGtleWJpbmRpbmdzOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlYIH0sXG5cdFx0XHRvcmRlcjogNCxcblx0XHR9LFxuXHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoRXh0ZW5zaW9uc1ZpZXdQYW5lQ29udGFpbmVyKSxcblx0XHRpY29uOiBleHRlbnNpb25zVmlld0ljb24sXG5cdFx0b3JkZXI6IDQsXG5cdFx0cmVqZWN0QWRkZWRWaWV3czogdHJ1ZSxcblx0XHRhbHdheXNVc2VDb250YWluZXJJbmZvOiB0cnVlLFxuXHR9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pXG5cdC5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdGlkOiAnZXh0ZW5zaW9ucycsXG5cdFx0b3JkZXI6IDMwLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uc0NvbmZpZ3VyYXRpb25UaXRsZScsIFwiRXh0ZW5zaW9uc1wiKSxcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHQnZXh0ZW5zaW9ucy5hdXRvVXBkYXRlJzoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZW51bTogWydvbicsICdvZmYnXSxcblx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdGxvY2FsaXplKCdleHRlbnNpb25zLmF1dG9VcGRhdGUub24nLCAnRG93bmxvYWQgYW5kIGluc3RhbGwgdXBkYXRlcyBhdXRvbWF0aWNhbGx5IG9ubHkgZm9yIGVuYWJsZWQgZXh0ZW5zaW9ucy4nKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hdXRvVXBkYXRlLm9mZicsICdFeHRlbnNpb25zIGFyZSBub3QgYXV0b21hdGljYWxseSB1cGRhdGVkLicpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2V4dGVuc2lvbnMuYXV0b1VwZGF0ZScsIFwiQ29udHJvbHMgdGhlIGF1dG9tYXRpYyB1cGRhdGUgYmVoYXZpb3Igb2YgZXh0ZW5zaW9ucy4gVGhlIHVwZGF0ZXMgYXJlIGZldGNoZWQgZnJvbSBhIE1pY3Jvc29mdCBvbmxpbmUgc2VydmljZS5cIiksXG5cdFx0XHRcdGRlZmF1bHQ6ICdvbicsXG5cdFx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRcdHRhZ3M6IFsndXNlc09ubGluZVNlcnZpY2VzJ10sXG5cdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdG5hbWU6ICdFeHRlbnNpb25zQXV0b1VwZGF0ZScsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEyNScsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRrZXk6ICdleHRlbnNpb25zLmF1dG9VcGRhdGUnLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ2V4dGVuc2lvbnMuYXV0b1VwZGF0ZScsIFwiQ29udHJvbHMgdGhlIGF1dG9tYXRpYyB1cGRhdGUgYmVoYXZpb3Igb2YgZXh0ZW5zaW9ucy4gVGhlIHVwZGF0ZXMgYXJlIGZldGNoZWQgZnJvbSBhIE1pY3Jvc29mdCBvbmxpbmUgc2VydmljZS5cIiksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0a2V5OiAnZXh0ZW5zaW9ucy5hdXRvVXBkYXRlLm9uJyxcblx0XHRcdFx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ2V4dGVuc2lvbnMuYXV0b1VwZGF0ZS5vbicsICdEb3dubG9hZCBhbmQgaW5zdGFsbCB1cGRhdGVzIGF1dG9tYXRpY2FsbHkgb25seSBmb3IgZW5hYmxlZCBleHRlbnNpb25zLicpLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0a2V5OiAnZXh0ZW5zaW9ucy5hdXRvVXBkYXRlLm9mZicsXG5cdFx0XHRcdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdleHRlbnNpb25zLmF1dG9VcGRhdGUub2ZmJywgJ0V4dGVuc2lvbnMgYXJlIG5vdCBhdXRvbWF0aWNhbGx5IHVwZGF0ZWQuJyksXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J2V4dGVuc2lvbnMuYXV0b1VwZGF0ZURlbGF5Jzoge1xuXHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0ZGVmYXVsdDogMixcblx0XHRcdFx0bWluaW11bTogMCxcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2V4dGVuc2lvbnMuYXV0b1VwZGF0ZURlbGF5JywgXCJDb250cm9scyB0aGUgZGVsYXkgaW4gaG91cnMgYWZ0ZXIgYW4gZXh0ZW5zaW9uIHVwZGF0ZSBpcyBwdWJsaXNoZWQgYmVmb3JlIGl0IGlzIGF1dG9tYXRpY2FsbHkgaW5zdGFsbGVkLiBPbmx5IGFwcGxpZXMgd2hlbiBgI2V4dGVuc2lvbnMuYXV0b1VwZGF0ZSNgIGlzIHNldCB0byBgb25gLiBUaGlzIGRlbGF5IGhlbHBzIGF2b2lkIGluc3RhbGxpbmcgcG90ZW50aWFsbHkgcHJvYmxlbWF0aWMgdXBkYXRlcyBpbW1lZGlhdGVseSBhZnRlciByZWxlYXNlLlwiKSxcblx0XHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0bmFtZTogJ0V4dGVuc2lvbnNBdXRvVXBkYXRlRGVsYXknLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMjUnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdFx0a2V5OiAnZXh0ZW5zaW9ucy5hdXRvVXBkYXRlRGVsYXknLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ2V4dGVuc2lvbnMuYXV0b1VwZGF0ZURlbGF5JywgXCJDb250cm9scyB0aGUgZGVsYXkgaW4gaG91cnMgYWZ0ZXIgYW4gZXh0ZW5zaW9uIHVwZGF0ZSBpcyBwdWJsaXNoZWQgYmVmb3JlIGl0IGlzIGF1dG9tYXRpY2FsbHkgaW5zdGFsbGVkLiBPbmx5IGFwcGxpZXMgd2hlbiBgI2V4dGVuc2lvbnMuYXV0b1VwZGF0ZSNgIGlzIHNldCB0byBgb25gLiBUaGlzIGRlbGF5IGhlbHBzIGF2b2lkIGluc3RhbGxpbmcgcG90ZW50aWFsbHkgcHJvYmxlbWF0aWMgdXBkYXRlcyBpbW1lZGlhdGVseSBhZnRlciByZWxlYXNlLlwiKSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnZXh0ZW5zaW9ucy5hdXRvQ2hlY2tVcGRhdGVzJzoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uc0NoZWNrVXBkYXRlcycsIFwiV2hlbiBlbmFibGVkLCBhdXRvbWF0aWNhbGx5IGNoZWNrcyBleHRlbnNpb25zIGZvciB1cGRhdGVzLiBJZiBhbiBleHRlbnNpb24gaGFzIGFuIHVwZGF0ZSwgaXQgaXMgbWFya2VkIGFzIG91dGRhdGVkIGluIHRoZSBFeHRlbnNpb25zIHZpZXcuIFRoZSB1cGRhdGVzIGFyZSBmZXRjaGVkIGZyb20gYSBNaWNyb3NvZnQgb25saW5lIHNlcnZpY2UuXCIpLFxuXHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0XHR0YWdzOiBbJ3VzZXNPbmxpbmVTZXJ2aWNlcyddXG5cdFx0XHR9LFxuXHRcdFx0J2V4dGVuc2lvbnMuaWdub3JlUmVjb21tZW5kYXRpb25zJzoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uc0lnbm9yZVJlY29tbWVuZGF0aW9ucycsIFwiV2hlbiBlbmFibGVkLCB0aGUgbm90aWZpY2F0aW9ucyBmb3IgZXh0ZW5zaW9uIHJlY29tbWVuZGF0aW9ucyB3aWxsIG5vdCBiZSBzaG93bi5cIiksXG5cdFx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogdHJ1ZSwgcmVhZE9ubHk6IHRydWUgfSxcblx0XHRcdH0sXG5cdFx0XHQnZXh0ZW5zaW9ucy5zaG93UmVjb21tZW5kYXRpb25zT25seU9uRGVtYW5kJzoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ2V4dGVuc2lvbnNTaG93UmVjb21tZW5kYXRpb25zT25seU9uRGVtYW5kX0RlcHJlY2F0ZWQnLCBcIlRoaXMgc2V0dGluZyBpcyBkZXByZWNhdGVkLiBVc2UgZXh0ZW5zaW9ucy5pZ25vcmVSZWNvbW1lbmRhdGlvbnMgc2V0dGluZyB0byBjb250cm9sIHJlY29tbWVuZGF0aW9uIG5vdGlmaWNhdGlvbnMuIFVzZSBFeHRlbnNpb25zIHZpZXcncyB2aXNpYmlsaXR5IGFjdGlvbnMgdG8gaGlkZSBSZWNvbW1lbmRlZCB2aWV3IGJ5IGRlZmF1bHQuXCIpLFxuXHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0dGFnczogWyd1c2VzT25saW5lU2VydmljZXMnXVxuXHRcdFx0fSxcblx0XHRcdCdleHRlbnNpb25zLmNsb3NlRXh0ZW5zaW9uRGV0YWlsc09uVmlld0NoYW5nZSc6IHtcblx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2V4dGVuc2lvbnNDbG9zZUV4dGVuc2lvbkRldGFpbHNPblZpZXdDaGFuZ2UnLCBcIldoZW4gZW5hYmxlZCwgZWRpdG9ycyB3aXRoIGV4dGVuc2lvbiBkZXRhaWxzIHdpbGwgYmUgYXV0b21hdGljYWxseSBjbG9zZWQgdXBvbiBuYXZpZ2F0aW5nIGF3YXkgZnJvbSB0aGUgRXh0ZW5zaW9ucyBWaWV3LlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdH0sXG5cdFx0XHQnZXh0ZW5zaW9ucy5jb25maXJtZWRVcmlIYW5kbGVyRXh0ZW5zaW9uSWRzJzoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaGFuZGxlVXJpQ29uZmlybWVkRXh0ZW5zaW9ucycsIFwiV2hlbiBhbiBleHRlbnNpb24gaXMgbGlzdGVkIGhlcmUsIGEgY29uZmlybWF0aW9uIHByb21wdCB3aWxsIG5vdCBiZSBzaG93biB3aGVuIHRoYXQgZXh0ZW5zaW9uIGhhbmRsZXMgYSBVUkkuXCIpLFxuXHRcdFx0XHRkZWZhdWx0OiBbXSxcblx0XHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTlxuXHRcdFx0fSxcblx0XHRcdCdleHRlbnNpb25zLndlYldvcmtlcic6IHtcblx0XHRcdFx0dHlwZTogWydib29sZWFuJywgJ3N0cmluZyddLFxuXHRcdFx0XHRlbnVtOiBbdHJ1ZSwgZmFsc2UsICdhdXRvJ10sXG5cdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRsb2NhbGl6ZSgnZXh0ZW5zaW9uc1dlYldvcmtlci50cnVlJywgXCJUaGUgV2ViIFdvcmtlciBFeHRlbnNpb24gSG9zdCB3aWxsIGFsd2F5cyBiZSBsYXVuY2hlZC5cIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2V4dGVuc2lvbnNXZWJXb3JrZXIuZmFsc2UnLCBcIlRoZSBXZWIgV29ya2VyIEV4dGVuc2lvbiBIb3N0IHdpbGwgbmV2ZXIgYmUgbGF1bmNoZWQuXCIpLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdleHRlbnNpb25zV2ViV29ya2VyLmF1dG8nLCBcIlRoZSBXZWIgV29ya2VyIEV4dGVuc2lvbiBIb3N0IHdpbGwgYmUgbGF1bmNoZWQgd2hlbiBhIHdlYiBleHRlbnNpb24gbmVlZHMgaXQuXCIpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2V4dGVuc2lvbnNXZWJXb3JrZXInLCBcIkVuYWJsZSB3ZWIgd29ya2VyIGV4dGVuc2lvbiBob3N0LlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogJ2F1dG8nXG5cdFx0XHR9LFxuXHRcdFx0J2V4dGVuc2lvbnMuc3VwcG9ydFZpcnR1YWxXb3Jrc3BhY2VzJzoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2V4dGVuc2lvbnMuc3VwcG9ydFZpcnR1YWxXb3Jrc3BhY2VzJywgXCJPdmVycmlkZSB0aGUgdmlydHVhbCB3b3Jrc3BhY2VzIHN1cHBvcnQgb2YgYW4gZXh0ZW5zaW9uLlwiKSxcblx0XHRcdFx0cGF0dGVyblByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHQnKFthLXowLTlBLVpdW2EtejAtOS1BLVpdKilcXFxcLihbYS16MC05QS1aXVthLXowLTktQS1aXSopJCc6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdGRlZmF1bHQ6IHt9LFxuXHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7XG5cdFx0XHRcdFx0J2JvZHknOiB7XG5cdFx0XHRcdFx0XHQncHViLm5hbWUnOiBmYWxzZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV1cblx0XHRcdH0sXG5cdFx0XHRbRVhURU5TSU9OU19TVVBQT1JUX0FHRU5UU19XSU5ET1ddOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5zdXBwb3J0QWdlbnRzV2luZG93JywgXCJPdmVycmlkZSB0aGUgQWdlbnRzIHdpbmRvdyBzdXBwb3J0IG9mIGFuIGV4dGVuc2lvbi4gRXh0ZW5zaW9ucyB1c2luZyBgdHJ1ZWAgd2lsbCBiZSBlbmFibGVkIGluIHRoZSBBZ2VudHMgd2luZG93IGV2ZW4gd2hlbiB0aGV5IHdvdWxkIG90aGVyd2lzZSBiZSBkaXNhYmxlZC5cIiksXG5cdFx0XHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0JyhbYS16MC05QS1aXVthLXowLTktQS1aXSopXFxcXC4oW2EtejAtOUEtWl1bYS16MC05LUEtWl0qKSQnOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRkZWZhdWx0OiB7fSxcblx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbe1xuXHRcdFx0XHRcdCdib2R5Jzoge1xuXHRcdFx0XHRcdFx0J3B1Yi5uYW1lJzogdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV1cblx0XHRcdH0sXG5cdFx0XHQnZXh0ZW5zaW9ucy5leHBlcmltZW50YWwuYWZmaW5pdHknOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hZmZpbml0eScsIFwiQ29uZmlndXJlIGFuIGV4dGVuc2lvbiB0byBleGVjdXRlIGluIGEgZGlmZmVyZW50IGV4dGVuc2lvbiBob3N0IHByb2Nlc3MuXCIpLFxuXHRcdFx0XHRwYXR0ZXJuUHJvcGVydGllczoge1xuXHRcdFx0XHRcdCcoW2EtejAtOUEtWl1bYS16MC05LUEtWl0qKVxcXFwuKFthLXowLTlBLVpdW2EtejAtOS1BLVpdKikkJzoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2ludGVnZXInLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogMVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRkZWZhdWx0OiB7fSxcblx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbe1xuXHRcdFx0XHRcdCdib2R5Jzoge1xuXHRcdFx0XHRcdFx0J3B1Yi5uYW1lJzogMVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV1cblx0XHRcdH0sXG5cdFx0XHRbV09SS1NQQUNFX1RSVVNUX0VYVEVOU0lPTl9TVVBQT1JUXToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2V4dGVuc2lvbnMuc3VwcG9ydFVudHJ1c3RlZFdvcmtzcGFjZXMnLCBcIk92ZXJyaWRlIHRoZSB1bnRydXN0ZWQgd29ya3NwYWNlIHN1cHBvcnQgb2YgYW4gZXh0ZW5zaW9uLiBFeHRlbnNpb25zIHVzaW5nIGB0cnVlYCB3aWxsIGFsd2F5cyBiZSBlbmFibGVkLiBFeHRlbnNpb25zIHVzaW5nIGBsaW1pdGVkYCB3aWxsIGFsd2F5cyBiZSBlbmFibGVkLCBhbmQgdGhlIGV4dGVuc2lvbiB3aWxsIGhpZGUgZnVuY3Rpb25hbGl0eSB0aGF0IHJlcXVpcmVzIHRydXN0LiBFeHRlbnNpb25zIHVzaW5nIGBmYWxzZWAgd2lsbCBvbmx5IGJlIGVuYWJsZWQgb25seSB3aGVuIHRoZSB3b3Jrc3BhY2UgaXMgdHJ1c3RlZC5cIiksXG5cdFx0XHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0JyhbYS16MC05QS1aXVthLXowLTktQS1aXSopXFxcXC4oW2EtejAtOUEtWl1bYS16MC05LUEtWl0qKSQnOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0J3N1cHBvcnRlZCc6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiBbJ2Jvb2xlYW4nLCAnc3RyaW5nJ10sXG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogW3RydWUsIGZhbHNlLCAnbGltaXRlZCddLFxuXHRcdFx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdleHRlbnNpb25zLnN1cHBvcnRVbnRydXN0ZWRXb3Jrc3BhY2VzLnRydWUnLCBcIkV4dGVuc2lvbiB3aWxsIGFsd2F5cyBiZSBlbmFibGVkLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdleHRlbnNpb25zLnN1cHBvcnRVbnRydXN0ZWRXb3Jrc3BhY2VzLmZhbHNlJywgXCJFeHRlbnNpb24gd2lsbCBvbmx5IGJlIGVuYWJsZWQgb25seSB3aGVuIHRoZSB3b3Jrc3BhY2UgaXMgdHJ1c3RlZC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5zdXBwb3J0VW50cnVzdGVkV29ya3NwYWNlcy5saW1pdGVkJywgXCJFeHRlbnNpb24gd2lsbCBhbHdheXMgYmUgZW5hYmxlZCwgYW5kIHRoZSBleHRlbnNpb24gd2lsbCBoaWRlIGZ1bmN0aW9uYWxpdHkgcmVxdWlyaW5nIHRydXN0LlwiKSxcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5zdXBwb3J0VW50cnVzdGVkV29ya3NwYWNlcy5zdXBwb3J0ZWQnLCBcIkRlZmluZXMgdGhlIHVudHJ1c3RlZCB3b3Jrc3BhY2Ugc3VwcG9ydCBzZXR0aW5nIGZvciB0aGUgZXh0ZW5zaW9uLlwiKSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0J3ZlcnNpb24nOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zLnN1cHBvcnRVbnRydXN0ZWRXb3Jrc3BhY2VzLnZlcnNpb24nLCBcIkRlZmluZXMgdGhlIHZlcnNpb24gb2YgdGhlIGV4dGVuc2lvbiBmb3Igd2hpY2ggdGhlIG92ZXJyaWRlIHNob3VsZCBiZSBhcHBsaWVkLiBJZiBub3Qgc3BlY2lmaWVkLCB0aGUgb3ZlcnJpZGUgd2lsbCBiZSBhcHBsaWVkIGluZGVwZW5kZW50IG9mIHRoZSBleHRlbnNpb24gdmVyc2lvbi5cIiksXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnZXh0ZW5zaW9ucy5leHBlcmltZW50YWwuZGVmZXJyZWRTdGFydHVwRmluaXNoZWRBY3RpdmF0aW9uJzoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uc0RlZmVycmVkU3RhcnR1cEZpbmlzaGVkQWN0aXZhdGlvbicsIFwiV2hlbiBlbmFibGVkLCBleHRlbnNpb25zIHdoaWNoIGRlY2xhcmUgdGhlIGBvblN0YXJ0dXBGaW5pc2hlZGAgYWN0aXZhdGlvbiBldmVudCB3aWxsIGJlIGFjdGl2YXRlZCBhZnRlciBhIHRpbWVvdXQuXCIpLFxuXHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdCdleHRlbnNpb25zLmV4cGVyaW1lbnRhbC5pc3N1ZVF1aWNrQWNjZXNzJzoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uc0luUXVpY2tBY2Nlc3MnLCBcIldoZW4gZW5hYmxlZCwgZXh0ZW5zaW9ucyBjYW4gYmUgc2VhcmNoZWQgZm9yIHZpYSBRdWljayBBY2Nlc3MgYW5kIHJlcG9ydCBpc3N1ZXMgZnJvbSB0aGVyZS5cIiksXG5cdFx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHRcdH0sXG5cdFx0XHQnZXh0ZW5zaW9ucy5hbGxvd09wZW5Jbk1vZGFsRWRpdG9yJzoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5hbGxvd09wZW5Jbk1vZGFsRWRpdG9yJywgXCJDb250cm9scyB3aGV0aGVyIGV4dGVuc2lvbnMgYW5kIE1DUCBzZXJ2ZXJzIG9wZW4gaW4gYSBtb2RhbCBlZGl0b3Igb3ZlcmxheS5cIiksXG5cdFx0XHRcdGRlZmF1bHQ6IGZhbHNlLCAvLyBUT0RPQGJwYXNlcm8gZmlndXJlIG91dCB0aGUgZGVmYXVsdCBmb3Igc3RhYmxlIGFuZCByZXRpcmUgdGhpcyBzZXR0aW5nXG5cdFx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdFtWZXJpZnlFeHRlbnNpb25TaWduYXR1cmVDb25maWdLZXldOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zLnZlcmlmeVNpZ25hdHVyZScsIFwiV2hlbiBlbmFibGVkLCBleHRlbnNpb25zIGFyZSB2ZXJpZmllZCB0byBiZSBzaWduZWQgYmVmb3JlIGdldHRpbmcgaW5zdGFsbGVkLlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdFx0aW5jbHVkZWQ6IGlzTmF0aXZlXG5cdFx0XHR9LFxuXHRcdFx0W0F1dG9SZXN0YXJ0Q29uZmlndXJhdGlvbktleV06IHtcblx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F1dG9SZXN0YXJ0JywgXCJJZiBhY3RpdmF0ZWQsIGV4dGVuc2lvbnMgd2lsbCBhdXRvbWF0aWNhbGx5IHJlc3RhcnQgZm9sbG93aW5nIGFuIHVwZGF0ZSBpZiB0aGUgd2luZG93IGlzIG5vdCBpbiBmb2N1cy4gVGhlcmUgY2FuIGJlIGEgZGF0YSBsb3NzIGlmIHlvdSBoYXZlIG9wZW4gTm90ZWJvb2tzIG9yIEN1c3RvbSBFZGl0b3JzLlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRcdGluY2x1ZGVkOiBwcm9kdWN0LnF1YWxpdHkgIT09ICdzdGFibGUnXG5cdFx0XHR9LFxuXHRcdFx0W0V4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlVXJsQ29uZmlnS2V5XToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zLmdhbGxlcnkuc2VydmljZVVybCcsIFwiQ29uZmlndXJlIHRoZSBNYXJrZXRwbGFjZSBzZXJ2aWNlIFVSTCB0byBjb25uZWN0IHRvXCIpLFxuXHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdFx0dGFnczogWyd1c2VzT25saW5lU2VydmljZXMnXSxcblx0XHRcdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2VVcmwnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS45OScsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRrZXk6ICdleHRlbnNpb25zLmdhbGxlcnkuc2VydmljZVVybCcsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucy5nYWxsZXJ5LnNlcnZpY2VVcmwnLCBcIkNvbmZpZ3VyZSB0aGUgTWFya2V0cGxhY2Ugc2VydmljZSBVUkwgdG8gY29ubmVjdCB0b1wiKSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0J2V4dGVuc2lvbnMuc3VwcG9ydE5vZGVHbG9iYWxOYXZpZ2F0b3InOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHRlbnNpb25zU3VwcG9ydE5vZGVHbG9iYWxOYXZpZ2F0b3InLCBcIldoZW4gZW5hYmxlZCwgTm9kZS5qcyBuYXZpZ2F0b3Igb2JqZWN0IGlzIGV4cG9zZWQgb24gdGhlIGdsb2JhbCBzY29wZS5cIiksXG5cdFx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRcdFtFeHRlbnNpb25SZXF1ZXN0c1RpbWVvdXRDb25maWdLZXldOiB7XG5cdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2V4dGVuc2lvbnNSZXF1ZXN0VGltZW91dCcsIFwiQ29udHJvbHMgdGhlIHRpbWVvdXQgaW4gbWlsbGlzZWNvbmRzIGZvciBIVFRQIHJlcXVlc3RzIG1hZGUgd2hlbiBmZXRjaGluZyBleHRlbnNpb25zIGZyb20gdGhlIE1hcmtldHBsYWNlXCIpLFxuXHRcdFx0XHRkZWZhdWx0OiA2MF8wMDAsXG5cdFx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRcdHRhZ3M6IFsnYWR2YW5jZWQnLCAndXNlc09ubGluZVNlcnZpY2VzJ11cblx0XHRcdH0sXG5cdFx0fVxuXHR9KTtcblxuY29uc3QganNvblJlZ2lzdHJ5ID0gPGpzb25Db250cmlidXRpb25SZWdpc3RyeS5JSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PlJlZ2lzdHJ5LmFzKGpzb25Db250cmlidXRpb25SZWdpc3RyeS5FeHRlbnNpb25zLkpTT05Db250cmlidXRpb24pO1xuanNvblJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKEV4dGVuc2lvbnNDb25maWd1cmF0aW9uU2NoZW1hSWQsIEV4dGVuc2lvbnNDb25maWd1cmF0aW9uU2NoZW1hKTtcblxuLy8gUmVnaXN0ZXIgQ29tbWFuZHNcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfZXh0ZW5zaW9ucy5tYW5hZ2UnLCAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4dGVuc2lvbklkOiBzdHJpbmcsIHRhYj86IEV4dGVuc2lvbkVkaXRvclRhYiwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4sIGZlYXR1cmU/OiBzdHJpbmcpID0+IHtcblx0Y29uc3QgZXh0ZW5zaW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRjb25zdCBleHRlbnNpb24gPSBleHRlbnNpb25TZXJ2aWNlLmxvY2FsLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQ6IGV4dGVuc2lvbklkIH0pKTtcblx0aWYgKGV4dGVuc2lvbikge1xuXHRcdGV4dGVuc2lvblNlcnZpY2Uub3BlbihleHRlbnNpb24sIHsgdGFiLCBwcmVzZXJ2ZUZvY3VzLCBmZWF0dXJlIH0pO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm90Rm91bmQnLCBcIkV4dGVuc2lvbiAnezB9JyBub3QgZm91bmQuXCIsIGV4dGVuc2lvbklkKSk7XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnZXh0ZW5zaW9uLm9wZW4nLCBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4dGVuc2lvbklkOiBzdHJpbmcsIHRhYj86IEV4dGVuc2lvbkVkaXRvclRhYiwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4sIGZlYXR1cmU/OiBzdHJpbmcsIHNpZGVCeXNpZGU/OiBib29sZWFuKSA9PiB7XG5cdGNvbnN0IGV4dGVuc2lvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRjb25zdCBbZXh0ZW5zaW9uXSA9IGF3YWl0IGV4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyBpZDogZXh0ZW5zaW9uSWQgfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0cmV0dXJuIGV4dGVuc2lvblNlcnZpY2Uub3BlbihleHRlbnNpb24sIHsgdGFiLCBwcmVzZXJ2ZUZvY3VzLCBmZWF0dXJlLCBzaWRlQnlzaWRlIH0pO1xuXHR9XG5cblx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfZXh0ZW5zaW9ucy5tYW5hZ2UnLCBleHRlbnNpb25JZCwgdGFiLCBwcmVzZXJ2ZUZvY3VzLCBmZWF0dXJlKTtcbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuaW5zdGFsbEV4dGVuc2lvbicsXG5cdG1ldGFkYXRhOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5pbnN0YWxsRXh0ZW5zaW9uLmRlc2NyaXB0aW9uJywgXCJJbnN0YWxsIHRoZSBnaXZlbiBleHRlbnNpb25cIiksXG5cdFx0YXJnczogW1xuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiAnZXh0ZW5zaW9uSWRPclZTSVhVcmknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmluc3RhbGxFeHRlbnNpb24uYXJnLmRlY3JpcHRpb24nLCBcIkV4dGVuc2lvbiBpZCBvciBWU0lYIHJlc291cmNlIHVyaVwiKSxcblx0XHRcdFx0Y29uc3RyYWludDogKHZhbHVlOiBhbnkpID0+IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBVUkksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiAnb3B0aW9ucycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnKG9wdGlvbmFsKSBPcHRpb25zIGZvciBpbnN0YWxsaW5nIHRoZSBleHRlbnNpb24uIE9iamVjdCB3aXRoIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllczogJyArXG5cdFx0XHRcdFx0J2BpbnN0YWxsT25seU5ld2x5QWRkZWRGcm9tRXh0ZW5zaW9uUGFja1ZTSVhgOiBXaGVuIGVuYWJsZWQsIFZTIENvZGUgaW5zdGFsbHMgb25seSBuZXdseSBhZGRlZCBleHRlbnNpb25zIGZyb20gdGhlIGV4dGVuc2lvbiBwYWNrIFZTSVguIFRoaXMgb3B0aW9uIGlzIGNvbnNpZGVyZWQgb25seSB3aGVuIGluc3RhbGxpbmcgVlNJWC4gJyxcblx0XHRcdFx0aXNPcHRpb25hbDogdHJ1ZSxcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0XHRcdCdpbnN0YWxsT25seU5ld2x5QWRkZWRGcm9tRXh0ZW5zaW9uUGFja1ZTSVgnOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmV4dGVuc2lvbnMuaW5zdGFsbEV4dGVuc2lvbi5vcHRpb24uaW5zdGFsbE9ubHlOZXdseUFkZGVkRnJvbUV4dGVuc2lvblBhY2tWU0lYJywgXCJXaGVuIGVuYWJsZWQsIFZTIENvZGUgaW5zdGFsbHMgb25seSBuZXdseSBhZGRlZCBleHRlbnNpb25zIGZyb20gdGhlIGV4dGVuc2lvbiBwYWNrIFZTSVguIFRoaXMgb3B0aW9uIGlzIGNvbnNpZGVyZWQgb25seSB3aGlsZSBpbnN0YWxsaW5nIGEgVlNJWC5cIiksXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0J2luc3RhbGxQcmVSZWxlYXNlVmVyc2lvbic6IHtcblx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5pbnN0YWxsRXh0ZW5zaW9uLm9wdGlvbi5pbnN0YWxsUHJlUmVsZWFzZVZlcnNpb24nLCBcIldoZW4gZW5hYmxlZCwgVlMgQ29kZSBpbnN0YWxscyB0aGUgcHJlLXJlbGVhc2UgdmVyc2lvbiBvZiB0aGUgZXh0ZW5zaW9uIGlmIGF2YWlsYWJsZS5cIiksXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0J2Rvbm90U3luYyc6IHtcblx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5pbnN0YWxsRXh0ZW5zaW9uLm9wdGlvbi5kb25vdFN5bmMnLCBcIldoZW4gZW5hYmxlZCwgVlMgQ29kZSBkbyBub3Qgc3luYyB0aGlzIGV4dGVuc2lvbiB3aGVuIFNldHRpbmdzIFN5bmMgaXMgb24uXCIpLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdCdqdXN0aWZpY2F0aW9uJzoge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6IFsnc3RyaW5nJywgJ29iamVjdCddLFxuXHRcdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmV4dGVuc2lvbnMuaW5zdGFsbEV4dGVuc2lvbi5vcHRpb24uanVzdGlmaWNhdGlvbicsIFwiSnVzdGlmaWNhdGlvbiBmb3IgaW5zdGFsbGluZyB0aGUgZXh0ZW5zaW9uLiBUaGlzIGlzIGEgc3RyaW5nIG9yIGFuIG9iamVjdCB0aGF0IGNhbiBiZSB1c2VkIHRvIHBhc3MgYW55IGluZm9ybWF0aW9uIHRvIHRoZSBpbnN0YWxsYXRpb24gaGFuZGxlcnMuIGkuZS4gYHtyZWFzb246ICdUaGlzIGV4dGVuc2lvbiB3YW50cyB0byBvcGVuIGEgVVJJJywgYWN0aW9uOiAnT3BlbiBVUkknfWAgd2lsbCBzaG93IGEgbWVzc2FnZSBib3ggd2l0aCB0aGUgcmVhc29uIGFuZCBhY3Rpb24gdXBvbiBpbnN0YWxsLlwiKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQnZW5hYmxlJzoge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmluc3RhbGxFeHRlbnNpb24ub3B0aW9uLmVuYWJsZScsIFwiV2hlbiBlbmFibGVkLCB0aGUgZXh0ZW5zaW9uIHdpbGwgYmUgZW5hYmxlZCBpZiBpdCBpcyBpbnN0YWxsZWQgYnV0IGRpc2FibGVkLiBJZiB0aGUgZXh0ZW5zaW9uIGlzIGFscmVhZHkgZW5hYmxlZCwgdGhpcyBoYXMgbm8gZWZmZWN0LlwiKSxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRdXG5cdH0sXG5cdGhhbmRsZXI6IGFzeW5jIChcblx0XHRhY2Nlc3Nvcixcblx0XHRhcmc6IHN0cmluZyB8IFVyaUNvbXBvbmVudHMsXG5cdFx0b3B0aW9ucz86IHtcblx0XHRcdGluc3RhbGxPbmx5TmV3bHlBZGRlZEZyb21FeHRlbnNpb25QYWNrVlNJWD86IGJvb2xlYW47XG5cdFx0XHRpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb24/OiBib29sZWFuO1xuXHRcdFx0ZG9ub3RTeW5jPzogYm9vbGVhbjtcblx0XHRcdGp1c3RpZmljYXRpb24/OiBzdHJpbmcgfCB7IHJlYXNvbjogc3RyaW5nOyBhY3Rpb246IHN0cmluZyB9O1xuXHRcdFx0ZW5hYmxlPzogYm9vbGVhbjtcblx0XHR9KSA9PiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRjb25zdCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSk7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0eXBlb2YgYXJnID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb25zdCBbaWQsIHZlcnNpb25dID0gZ2V0SWRBbmRWZXJzaW9uKGFyZyk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQsIHV1aWQ6IHZlcnNpb24gfSkpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uPy5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RXh0ZW5zaW9uS2luZCkge1xuXHRcdFx0XHRcdGNvbnN0IFtnYWxsZXJ5XSA9IGF3YWl0IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQsIHByZVJlbGVhc2U6IG9wdGlvbnM/Lmluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbiB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdFx0aWYgKCFnYWxsZXJ5KSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vdEZvdW5kJywgXCJFeHRlbnNpb24gJ3swfScgbm90IGZvdW5kLlwiLCBhcmcpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXdhaXQgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEZyb21HYWxsZXJ5KGdhbGxlcnksIHtcblx0XHRcdFx0XHRcdGlzTWFjaGluZVNjb3BlZDogb3B0aW9ucz8uZG9ub3RTeW5jID8gdHJ1ZSA6IHVuZGVmaW5lZCwgLyogZG8gbm90IGFsbG93IHN5bmNpbmcgZXh0ZW5zaW9ucyBhdXRvbWF0aWNhbGx5IHdoaWxlIGluc3RhbGxpbmcgdGhyb3VnaCB0aGUgY29tbWFuZCAqL1xuXHRcdFx0XHRcdFx0aW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiBvcHRpb25zPy5pbnN0YWxsUHJlUmVsZWFzZVZlcnNpb24sXG5cdFx0XHRcdFx0XHRpbnN0YWxsR2l2ZW5WZXJzaW9uOiAhIXZlcnNpb24sXG5cdFx0XHRcdFx0XHRjb250ZXh0OiB7IFtFWFRFTlNJT05fSU5TVEFMTF9TT1VSQ0VfQ09OVEVYVF06IEV4dGVuc2lvbkluc3RhbGxTb3VyY2UuQ09NTUFORCB9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGwoaWQsIHtcblx0XHRcdFx0XHRcdHZlcnNpb24sXG5cdFx0XHRcdFx0XHRpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb246IG9wdGlvbnM/Lmluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbixcblx0XHRcdFx0XHRcdGNvbnRleHQ6IHsgW0VYVEVOU0lPTl9JTlNUQUxMX1NPVVJDRV9DT05URVhUXTogRXh0ZW5zaW9uSW5zdGFsbFNvdXJjZS5DT01NQU5EIH0sXG5cdFx0XHRcdFx0XHRqdXN0aWZpY2F0aW9uOiBvcHRpb25zPy5qdXN0aWZpY2F0aW9uLFxuXHRcdFx0XHRcdFx0ZW5hYmxlOiBvcHRpb25zPy5lbmFibGUsXG5cdFx0XHRcdFx0XHRpc01hY2hpbmVTY29wZWQ6IG9wdGlvbnM/LmRvbm90U3luYyA/IHRydWUgOiB1bmRlZmluZWQsIC8qIGRvIG5vdCBhbGxvdyBzeW5jaW5nIGV4dGVuc2lvbnMgYXV0b21hdGljYWxseSB3aGlsZSBpbnN0YWxsaW5nIHRocm91Z2ggdGhlIGNvbW1hbmQgKi9cblx0XHRcdFx0XHR9LCBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHZzaXggPSBVUkkucmV2aXZlKGFyZyk7XG5cdFx0XHRcdGF3YWl0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGwodnNpeCwgeyBpbnN0YWxsR2l2ZW5WZXJzaW9uOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGUpO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMudW5pbnN0YWxsRXh0ZW5zaW9uJyxcblx0bWV0YWRhdGE6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtiZW5jaC5leHRlbnNpb25zLnVuaW5zdGFsbEV4dGVuc2lvbi5kZXNjcmlwdGlvbicsIFwiVW5pbnN0YWxsIHRoZSBnaXZlbiBleHRlbnNpb25cIiksXG5cdFx0YXJnczogW1xuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmV4dGVuc2lvbnMudW5pbnN0YWxsRXh0ZW5zaW9uLmFyZy5uYW1lJywgXCJJZCBvZiB0aGUgZXh0ZW5zaW9uIHRvIHVuaW5zdGFsbFwiKSxcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XVxuXHR9LFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIGlkOiBzdHJpbmcpID0+IHtcblx0XHRpZiAoIWlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2lkIHJlcXVpcmVkJywgXCJFeHRlbnNpb24gaWQgcmVxdWlyZWQuXCIpKTtcblx0XHR9XG5cdFx0Y29uc3QgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnN0YWxsZWQgPSBhd2FpdCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoKTtcblx0XHRjb25zdCBbZXh0ZW5zaW9uVG9Vbmluc3RhbGxdID0gaW5zdGFsbGVkLmZpbHRlcihlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZCB9KSk7XG5cdFx0aWYgKCFleHRlbnNpb25Ub1VuaW5zdGFsbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub3RJbnN0YWxsZWQnLCBcIkV4dGVuc2lvbiAnezB9JyBpcyBub3QgaW5zdGFsbGVkLiBNYWtlIHN1cmUgeW91IHVzZSB0aGUgZnVsbCBleHRlbnNpb24gSUQsIGluY2x1ZGluZyB0aGUgcHVibGlzaGVyLCBlLmcuOiBtcy1kb3RuZXR0b29scy5jc2hhcnAuXCIsIGlkKSk7XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb25Ub1VuaW5zdGFsbC5pc0J1aWx0aW4pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnYnVpbHRpbicsIFwiRXh0ZW5zaW9uICd7MH0nIGlzIGEgQnVpbHQtaW4gZXh0ZW5zaW9uIGFuZCBjYW5ub3QgYmUgdW5pbnN0YWxsZWRcIiwgaWQpKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudW5pbnN0YWxsKGV4dGVuc2lvblRvVW5pbnN0YWxsKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlKTtcblx0XHRcdHRocm93IGU7XG5cdFx0fVxuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLnNlYXJjaCcsXG5cdG1ldGFkYXRhOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5zZWFyY2guZGVzY3JpcHRpb24nLCBcIlNlYXJjaCBmb3IgYSBzcGVjaWZpYyBleHRlbnNpb25cIiksXG5cdFx0YXJnczogW1xuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmV4dGVuc2lvbnMuc2VhcmNoLmFyZy5uYW1lJywgXCJRdWVyeSB0byB1c2UgaW4gc2VhcmNoXCIpLFxuXHRcdFx0XHRzY2hlbWE6IHsgJ3R5cGUnOiAnc3RyaW5nJyB9XG5cdFx0XHR9XG5cdFx0XVxuXHR9LFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIHF1ZXJ5OiBzdHJpbmcgPSAnJykgPT4ge1xuXHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKS5vcGVuU2VhcmNoKHF1ZXJ5KTtcblx0fVxufSk7XG5cbmZ1bmN0aW9uIG92ZXJyaWRlQWN0aW9uRm9yQWN0aXZlRXh0ZW5zaW9uRWRpdG9yV2Vidmlldyhjb21tYW5kOiBNdWx0aUNvbW1hbmQgfCB1bmRlZmluZWQsIGY6ICh3ZWJ2aWV3OiBJV2VidmlldykgPT4gdm9pZCkge1xuXHRjb21tYW5kPy5hZGRJbXBsZW1lbnRhdGlvbigxMDUsICdleHRlbnNpb25zLWVkaXRvcicsIChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvciA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgRXh0ZW5zaW9uRWRpdG9yKSB7XG5cdFx0XHRpZiAoZWRpdG9yLmFjdGl2ZVdlYnZpZXc/LmlzRm9jdXNlZCkge1xuXHRcdFx0XHRmKGVkaXRvci5hY3RpdmVXZWJ2aWV3KTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fSk7XG59XG5cbm92ZXJyaWRlQWN0aW9uRm9yQWN0aXZlRXh0ZW5zaW9uRWRpdG9yV2VidmlldyhDb3B5QWN0aW9uLCB3ZWJ2aWV3ID0+IHdlYnZpZXcuY29weSgpKTtcbm92ZXJyaWRlQWN0aW9uRm9yQWN0aXZlRXh0ZW5zaW9uRWRpdG9yV2VidmlldyhDdXRBY3Rpb24sIHdlYnZpZXcgPT4gd2Vidmlldy5jdXQoKSk7XG5vdmVycmlkZUFjdGlvbkZvckFjdGl2ZUV4dGVuc2lvbkVkaXRvcldlYnZpZXcoUGFzdGVBY3Rpb24sIHdlYnZpZXcgPT4gd2Vidmlldy5wYXN0ZSgpKTtcblxuLy8gQ29udGV4dHNcbmV4cG9ydCBjb25zdCBDT05URVhUX0hBU19MT0NBTF9TRVJWRVIgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignaGFzTG9jYWxTZXJ2ZXInLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgQ09OVEVYVF9IQVNfUkVNT1RFX1NFUlZFUiA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdoYXNSZW1vdGVTZXJ2ZXInLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgQ09OVEVYVF9IQVNfV0VCX1NFUlZFUiA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdoYXNXZWJTZXJ2ZXInLCBmYWxzZSk7XG5jb25zdCBDT05URVhUX0dBTExFUllfU09SVF9DQVBBQklMSVRJRVMgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KCdnYWxsZXJ5U29ydENhcGFiaWxpdGllcycsICcnKTtcbmNvbnN0IENPTlRFWFRfR0FMTEVSWV9GSUxURVJfQ0FQQUJJTElUSUVTID0gbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nPignZ2FsbGVyeUZpbHRlckNhcGFiaWxpdGllcycsICcnKTtcbmNvbnN0IENPTlRFWFRfR0FMTEVSWV9BTExfUFVCTElDX1JFUE9TSVRPUllfU0lHTkVEID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2dhbGxlcnlBbGxQdWJsaWNSZXBvc2l0b3J5U2lnbmVkJywgZmFsc2UpO1xuY29uc3QgQ09OVEVYVF9HQUxMRVJZX0FMTF9QUklWQVRFX1JFUE9TSVRPUllfU0lHTkVEID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2dhbGxlcnlBbGxQcml2YXRlUmVwb3NpdG9yeVNpZ25lZCcsIGZhbHNlKTtcbmNvbnN0IENPTlRFWFRfR0FMTEVSWV9IQVNfRVhURU5TSU9OX0xJTksgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignZ2FsbGVyeUhhc0V4dGVuc2lvbkxpbmsnLCBmYWxzZSk7XG5cbmFzeW5jIGZ1bmN0aW9uIHJ1bkFjdGlvbjxUID0gdm9pZD4oYWN0aW9uOiBJQWN0aW9uKTogUHJvbWlzZTxUPiB7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIGF3YWl0IGFjdGlvbi5ydW4oKSBhcyBUO1xuXHR9IGZpbmFsbHkge1xuXHRcdGlmIChpc0Rpc3Bvc2FibGUoYWN0aW9uKSkge1xuXHRcdFx0YWN0aW9uLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxudHlwZSBJRXh0ZW5zaW9uQWN0aW9uT3B0aW9ucyA9IElBY3Rpb24yT3B0aW9ucyAmIHtcblx0bWVudVRpdGxlcz86IHsgW2lkOiBzdHJpbmddOiBzdHJpbmcgfTtcblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPGFueT47XG59O1xuXG5jbGFzcyBFeHRlbnNpb25zQ29udHJpYnV0aW9ucyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVBsdWdpbkluc3RhbGxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luSW5zdGFsbFNlcnZpY2U6IElQbHVnaW5JbnN0YWxsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBoYXNMb2NhbFNlcnZlckNvbnRleHQgPSBDT05URVhUX0hBU19MT0NBTF9TRVJWRVIuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdGhhc0xvY2FsU2VydmVyQ29udGV4dC5zZXQodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzUmVtb3RlU2VydmVyQ29udGV4dCA9IENPTlRFWFRfSEFTX1JFTU9URV9TRVJWRVIuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRoYXNSZW1vdGVTZXJ2ZXJDb250ZXh0LnNldCh0cnVlKTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNXZWJTZXJ2ZXJDb250ZXh0ID0gQ09OVEVYVF9IQVNfV0VCX1NFUlZFUi5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdGhhc1dlYlNlcnZlckNvbnRleHQuc2V0KHRydWUpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9uR2FsbGVyeVN0YXR1c0NvbnRleHRzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFN0YXR1cygoKSA9PiB0aGlzLnVwZGF0ZUV4dGVuc2lvbkdhbGxlcnlTdGF0dXNDb250ZXh0cygpKSk7XG5cdFx0ZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5nZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QoKVxuXHRcdFx0LnRoZW4oZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0ID0+IHtcblx0XHRcdFx0dGhpcy51cGRhdGVHYWxsZXJ5Q2FwYWJpbGl0aWVzQ29udGV4dHMoZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdChleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgPT4gdGhpcy51cGRhdGVHYWxsZXJ5Q2FwYWJpbGl0aWVzQ29udGV4dHMoZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KSkpO1xuXHRcdFx0fSk7XG5cdFx0dGhpcy5yZWdpc3Rlckdsb2JhbEFjdGlvbnMoKTtcblx0XHR0aGlzLnJlZ2lzdGVyQ29udGV4dE1lbnVBY3Rpb25zKCk7XG5cdFx0dGhpcy5yZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlRXh0ZW5zaW9uR2FsbGVyeVN0YXR1c0NvbnRleHRzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdENPTlRFWFRfSEFTX0dBTExFUlkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpLnNldCh0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzID09PSBFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTdGF0dXMuQXZhaWxhYmxlKTtcblx0XHRDT05URVhUX0VYVEVOU0lPTlNfR0FMTEVSWV9TVEFUVVMuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpLnNldCh0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlR2FsbGVyeUNhcGFiaWxpdGllc0NvbnRleHRzKGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdDogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCB8IG51bGwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRDT05URVhUX0dBTExFUllfU09SVF9DQVBBQklMSVRJRVMuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpLnNldChgXyR7ZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0Py5jYXBhYmlsaXRpZXMuZXh0ZW5zaW9uUXVlcnkuc29ydGluZz8ubWFwKHMgPT4gcy5uYW1lKT8uam9pbignXycpfV9VcGRhdGVEYXRlX2ApO1xuXHRcdENPTlRFWFRfR0FMTEVSWV9GSUxURVJfQ0FQQUJJTElUSUVTLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoYF8ke2V4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdD8uY2FwYWJpbGl0aWVzLmV4dGVuc2lvblF1ZXJ5LmZpbHRlcmluZz8ubWFwKHMgPT4gcy5uYW1lKT8uam9pbignXycpfV9gKTtcblx0XHRDT05URVhUX0dBTExFUllfQUxMX1BVQkxJQ19SRVBPU0lUT1JZX1NJR05FRC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSkuc2V0KCEhZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0Py5jYXBhYmlsaXRpZXM/LnNpZ25pbmc/LmFsbFB1YmxpY1JlcG9zaXRvcnlTaWduZWQpO1xuXHRcdENPTlRFWFRfR0FMTEVSWV9BTExfUFJJVkFURV9SRVBPU0lUT1JZX1NJR05FRC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSkuc2V0KCEhZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0Py5jYXBhYmlsaXRpZXM/LnNpZ25pbmc/LmFsbFByaXZhdGVSZXBvc2l0b3J5U2lnbmVkKTtcblx0XHRDT05URVhUX0dBTExFUllfSEFTX0VYVEVOU0lPTl9MSU5LLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoISEoZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0ICYmIGdldEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFJlc291cmNlVXJpKGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCwgRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVHlwZS5FeHRlbnNpb25EZXRhaWxzVmlld1VyaSkpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclxuXHRcdFx0fHwgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyXG5cdFx0XHR8fCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJcblx0XHQpIHtcblx0XHRcdFJlZ2lzdHJ5LmFzPElRdWlja0FjY2Vzc1JlZ2lzdHJ5PihFeHRlbnNpb25zLlF1aWNrYWNjZXNzKS5yZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIoe1xuXHRcdFx0XHRjdG9yOiBJbnN0YWxsRXh0ZW5zaW9uUXVpY2tBY2Nlc3NQcm92aWRlcixcblx0XHRcdFx0cHJlZml4OiBJbnN0YWxsRXh0ZW5zaW9uUXVpY2tBY2Nlc3NQcm92aWRlci5QUkVGSVgsXG5cdFx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnaW5zdGFsbEV4dGVuc2lvblF1aWNrQWNjZXNzUGxhY2Vob2xkZXInLCBcIlR5cGUgdGhlIG5hbWUgb2YgYW4gZXh0ZW5zaW9uIHRvIGluc3RhbGwgb3Igc2VhcmNoLlwiKSxcblx0XHRcdFx0aGVscEVudHJpZXM6IFt7IGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW5zdGFsbEV4dGVuc2lvblF1aWNrQWNjZXNzSGVscCcsIFwiSW5zdGFsbCBvciBTZWFyY2ggRXh0ZW5zaW9uc1wiKSB9XVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gR2xvYmFsIGFjdGlvbnNcblx0cHJpdmF0ZSByZWdpc3Rlckdsb2JhbEFjdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyUHJlZmVyZW5jZXNNZW51LCB7XG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBWSUVXTEVUX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVByZWZlcmVuY2VzRXh0ZW5zaW9ucycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkV4dGVuc2lvbnNcIilcblx0XHRcdH0sXG5cdFx0XHRncm91cDogJzJfY29uZmlndXJhdGlvbicsXG5cdFx0XHRvcmRlcjogMyxcblx0XHRcdHdoZW46IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuR2xvYmFsQWN0aXZpdHksIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6IFZJRVdMRVRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2hvd0V4dGVuc2lvbnMnLCBcIkV4dGVuc2lvbnNcIilcblx0XHRcdH0sXG5cdFx0XHRncm91cDogJzJfY29uZmlndXJhdGlvbicsXG5cdFx0XHRvcmRlcjogM1xuXHRcdH0pKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uZm9jdXNFeHRlbnNpb25zVmlldycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmb2N1c0V4dGVuc2lvbnMnLCAnRm9jdXMgb24gRXh0ZW5zaW9ucyBWaWV3JyksXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRhd2FpdCBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKS5vcGVuU2VhcmNoKCcnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uaW5zdGFsbEV4dGVuc2lvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW5zdGFsbEV4dGVuc2lvbnMnLCAnSW5zdGFsbCBFeHRlbnNpb25zJyksXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9IQVNfR0FMTEVSWSwgQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9IQVNfTE9DQUxfU0VSVkVSLCBDT05URVhUX0hBU19SRU1PVEVfU0VSVkVSLCBDT05URVhUX0hBU19XRUJfU0VSVkVSKSlcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkub3BlblZpZXdDb250YWluZXIoVklFV0xFVF9JRCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNob3dSZWNvbW1lbmRlZEtleW1hcEV4dGVuc2lvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2hvd1JlY29tbWVuZGVkS2V5bWFwRXh0ZW5zaW9uc1Nob3J0JywgJ0tleW1hcHMnKSxcblx0XHRcdGNhdGVnb3J5OiBQcmVmZXJlbmNlc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9IQVNfR0FMTEVSWVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IsIENPTlRFWFRfSEFTX0dBTExFUlkpLFxuXHRcdFx0XHRncm91cDogJzJfa2V5Ym9hcmRfZGlzY292ZXJfYWN0aW9ucydcblx0XHRcdH1dLFxuXHRcdFx0bWVudVRpdGxlczoge1xuXHRcdFx0XHRbTWVudUlkLkVkaXRvclRpdGxlLmlkXTogbG9jYWxpemUoJ2ltcG9ydEtleWJvYXJkU2hvcnRjdXRzRnJvbXMnLCBcIk1pZ3JhdGUgS2V5Ym9hcmQgU2hvcnRjdXRzIGZyb20uLi5cIilcblx0XHRcdH0sXG5cdFx0XHRydW46ICgpID0+IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaCgnQHJlY29tbWVuZGVkOmtleW1hcHMgJylcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2hvd0xhbmd1YWdlRXh0ZW5zaW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93TGFuZ3VhZ2VFeHRlbnNpb25zU2hvcnQnLCAnTGFuZ3VhZ2UgRXh0ZW5zaW9ucycpLFxuXHRcdFx0Y2F0ZWdvcnk6IFByZWZlcmVuY2VzTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENPTlRFWFRfSEFTX0dBTExFUllcblx0XHRcdH0sXG5cdFx0XHRydW46ICgpID0+IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaCgnQHJlY29tbWVuZGVkOmxhbmd1YWdlcyAnKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5jaGVja0ZvclVwZGF0ZXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hlY2tGb3JVcGRhdGVzJywgJ0NoZWNrIGZvciBFeHRlbnNpb24gVXBkYXRlcycpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0hBU19HQUxMRVJZLCBDb250ZXh0S2V5RXhwci5vcihDT05URVhUX0hBU19MT0NBTF9TRVJWRVIsIENPTlRFWFRfSEFTX1JFTU9URV9TRVJWRVIsIENPTlRFWFRfSEFTX1dFQl9TRVJWRVIpKVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdDb250YWluZXJUaXRsZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lcicsIFZJRVdMRVRfSUQpLCBDT05URVhUX0hBU19HQUxMRVJZKSxcblx0XHRcdFx0Z3JvdXA6ICcxX3VwZGF0ZXMnLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fV0sXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgWywgcGx1Z2luUmVzdWx0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmNoZWNrRm9yVXBkYXRlcygpLFxuXHRcdFx0XHRcdHRoaXMucGx1Z2luSW5zdGFsbFNlcnZpY2UudXBkYXRlQWxsUGx1Z2lucyh7IHNpbGVudDogdHJ1ZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGNvbnN0IG91dGRhdGVkID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vdXRkYXRlZDtcblx0XHRcdFx0aWYgKG91dGRhdGVkLmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goJ0BvdXRkYXRlZCAnKTtcblx0XHRcdFx0fSBlbHNlIGlmIChwbHVnaW5SZXN1bHQudXBkYXRlZE5hbWVzLmxlbmd0aCA9PT0gMCAmJiBwbHVnaW5SZXN1bHQuZmFpbGVkTmFtZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZGlhbG9nU2VydmljZS5pbmZvKGxvY2FsaXplKCdub1VwZGF0ZXNBdmFpbGFibGUnLCBcIkFsbCBleHRlbnNpb25zIGFyZSB1cCB0byBkYXRlLlwiKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGVuYWJsZUF1dG9VcGRhdGVXaGVuQ29uZGl0aW9uID0gQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtBdXRvVXBkYXRlQ29uZmlndXJhdGlvbktleX1gLCAnb2ZmJyk7XG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5lbmFibGVBdXRvVXBkYXRlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2VuYWJsZUF1dG9VcGRhdGUnLCAnRW5hYmxlIEF1dG8gVXBkYXRlIGZvciBFeHRlbnNpb25zJyksXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBlbmFibGVBdXRvVXBkYXRlV2hlbkNvbmRpdGlvbixcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlLFxuXHRcdFx0XHRvcmRlcjogNSxcblx0XHRcdFx0Z3JvdXA6ICcxX3VwZGF0ZXMnLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyJywgVklFV0xFVF9JRCksIGVuYWJsZUF1dG9VcGRhdGVXaGVuQ29uZGl0aW9uKVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0fV0sXG5cdFx0XHRydW46IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSkudXBkYXRlQXV0b1VwZGF0ZUZvckFsbEV4dGVuc2lvbnModHJ1ZSlcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRpc2FibGVBdXRvVXBkYXRlV2hlbkNvbmRpdGlvbiA9IENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhgY29uZmlnLiR7QXV0b1VwZGF0ZUNvbmZpZ3VyYXRpb25LZXl9YCwgJ29mZicpO1xuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uZGlzYWJsZUF1dG9VcGRhdGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZGlzYWJsZUF1dG9VcGRhdGUnLCAnRGlzYWJsZSBBdXRvIFVwZGF0ZSBmb3IgRXh0ZW5zaW9ucycpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBkaXNhYmxlQXV0b1VwZGF0ZVdoZW5Db25kaXRpb24sXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGUsXG5cdFx0XHRcdG9yZGVyOiA1LFxuXHRcdFx0XHRncm91cDogJzFfdXBkYXRlcycsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXInLCBWSUVXTEVUX0lEKSwgZGlzYWJsZUF1dG9VcGRhdGVXaGVuQ29uZGl0aW9uKVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0fV0sXG5cdFx0XHRydW46IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSkudXBkYXRlQXV0b1VwZGF0ZUZvckFsbEV4dGVuc2lvbnMoZmFsc2UpXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnVwZGF0ZUFsbEV4dGVuc2lvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndXBkYXRlQWxsJywgJ1VwZGF0ZSBBbGwgRXh0ZW5zaW9ucycpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdHByZWNvbmRpdGlvbjogSGFzT3V0ZGF0ZWRFeHRlbnNpb25zQ29udGV4dCxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfSEFTX0dBTExFUlksIENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUiwgQ09OVEVYVF9IQVNfUkVNT1RFX1NFUlZFUiwgQ09OVEVYVF9IQVNfV0VCX1NFUlZFUikpXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdDb250YWluZXJUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXInLCBWSUVXTEVUX0lEKSxcblx0XHRcdFx0XHRncm91cDogJzFfdXBkYXRlcycsXG5cdFx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIE9VVERBVEVEX0VYVEVOU0lPTlNfVklFV19JRCksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0aWNvbjogaW5zdGFsbFdvcmtzcGFjZVJlY29tbWVuZGVkSWNvbixcblx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnVwZGF0ZUFsbCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5lbmFibGVBbGwnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZW5hYmxlQWxsJywgJ0VuYWJsZSBBbGwgRXh0ZW5zaW9ucycpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUiwgQ09OVEVYVF9IQVNfUkVNT1RFX1NFUlZFUiwgQ09OVEVYVF9IQVNfV0VCX1NFUlZFUilcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lcicsIFZJRVdMRVRfSUQpLFxuXHRcdFx0XHRncm91cDogJzJfZW5hYmxlbWVudCcsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9XSxcblx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zVG9FbmFibGUgPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbHRlcihlID0+ICEhZS5sb2NhbCAmJiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmNhbkNoYW5nZUVuYWJsZW1lbnQoZS5sb2NhbCkgJiYgIXRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKGUubG9jYWwpKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbnNUb0VuYWJsZS5sZW5ndGgpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnNldEVuYWJsZW1lbnQoZXh0ZW5zaW9uc1RvRW5hYmxlLCBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEdsb2JhbGx5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5lbmFibGVBbGxXb3Jrc3BhY2UnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZW5hYmxlQWxsV29ya3NwYWNlJywgJ0VuYWJsZSBBbGwgRXh0ZW5zaW9ucyBmb3IgdGhpcyBXb3Jrc3BhY2UnKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hTdGF0ZUNvbnRleHQubm90RXF1YWxzVG8oJ2VtcHR5JyksIENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUiwgQ09OVEVYVF9IQVNfUkVNT1RFX1NFUlZFUiwgQ09OVEVYVF9IQVNfV0VCX1NFUlZFUikpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnNUb0VuYWJsZSA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmlsdGVyKGUgPT4gISFlLmxvY2FsICYmIHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuY2FuQ2hhbmdlRW5hYmxlbWVudChlLmxvY2FsKSAmJiAhdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoZS5sb2NhbCkpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uc1RvRW5hYmxlLmxlbmd0aCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uuc2V0RW5hYmxlbWVudChleHRlbnNpb25zVG9FbmFibGUsIEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5kaXNhYmxlQWxsJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Rpc2FibGVBbGwnLCAnRGlzYWJsZSBBbGwgSW5zdGFsbGVkIEV4dGVuc2lvbnMnKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihDT05URVhUX0hBU19MT0NBTF9TRVJWRVIsIENPTlRFWFRfSEFTX1JFTU9URV9TRVJWRVIsIENPTlRFWFRfSEFTX1dFQl9TRVJWRVIpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXInLCBWSUVXTEVUX0lEKSxcblx0XHRcdFx0Z3JvdXA6ICcyX2VuYWJsZW1lbnQnLFxuXHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0fV0sXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uc1RvRGlzYWJsZSA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmlsdGVyKGUgPT4gIWUuaXNCdWlsdGluICYmICEhZS5sb2NhbCAmJiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZChlLmxvY2FsKSAmJiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmNhbkNoYW5nZUVuYWJsZW1lbnQoZS5sb2NhbCkpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uc1RvRGlzYWJsZS5sZW5ndGgpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnNldEVuYWJsZW1lbnQoZXh0ZW5zaW9uc1RvRGlzYWJsZSwgRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkR2xvYmFsbHkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmRpc2FibGVBbGxXb3Jrc3BhY2UnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZGlzYWJsZUFsbFdvcmtzcGFjZScsICdEaXNhYmxlIEFsbCBJbnN0YWxsZWQgRXh0ZW5zaW9ucyBmb3IgdGhpcyBXb3Jrc3BhY2UnKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hTdGF0ZUNvbnRleHQubm90RXF1YWxzVG8oJ2VtcHR5JyksIENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUiwgQ09OVEVYVF9IQVNfUkVNT1RFX1NFUlZFUiwgQ09OVEVYVF9IQVNfV0VCX1NFUlZFUikpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnNUb0Rpc2FibGUgPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbHRlcihlID0+ICFlLmlzQnVpbHRpbiAmJiAhIWUubG9jYWwgJiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoZS5sb2NhbCkgJiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5jYW5DaGFuZ2VFbmFibGVtZW50KGUubG9jYWwpKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbnNUb0Rpc2FibGUubGVuZ3RoKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5zZXRFbmFibGVtZW50KGV4dGVuc2lvbnNUb0Rpc2FibGUsIEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6IFNFTEVDVF9JTlNUQUxMX1ZTSVhfRVhURU5TSU9OX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdJbnN0YWxsRnJvbVZTSVgnLCAnSW5zdGFsbCBmcm9tIFZTSVguLi4nKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihDT05URVhUX0hBU19MT0NBTF9TRVJWRVIsIENPTlRFWFRfSEFTX1JFTU9URV9TRVJWRVIpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyJywgVklFV0xFVF9JRCksIENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUiwgQ09OVEVYVF9IQVNfUkVNT1RFX1NFUlZFUikpLFxuXHRcdFx0XHRncm91cDogJzNfaW5zdGFsbCcsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9XSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZpbGVEaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlRGlhbG9nU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHZzaXhQYXRocyA9IGF3YWl0IGZpbGVEaWFsb2dTZXJ2aWNlLnNob3dPcGVuRGlhbG9nKHtcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2luc3RhbGxGcm9tVlNJWCcsIFwiSW5zdGFsbCBmcm9tIFZTSVhcIiksXG5cdFx0XHRcdFx0ZmlsdGVyczogW3sgbmFtZTogJ1ZTSVggRXh0ZW5zaW9ucycsIGV4dGVuc2lvbnM6IFsndnNpeCddIH1dLFxuXHRcdFx0XHRcdGNhblNlbGVjdEZpbGVzOiB0cnVlLFxuXHRcdFx0XHRcdGNhblNlbGVjdE1hbnk6IHRydWUsXG5cdFx0XHRcdFx0b3BlbkxhYmVsOiBtbmVtb25pY0J1dHRvbkxhYmVsKGxvY2FsaXplKHsga2V5OiAnaW5zdGFsbEJ1dHRvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkluc3RhbGxcIikpXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAodnNpeFBhdGhzKSB7XG5cdFx0XHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoSU5TVEFMTF9FWFRFTlNJT05fRlJPTV9WU0lYX0NPTU1BTkRfSUQsIHZzaXhQYXRocyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6IElOU1RBTExfRVhURU5TSU9OX0ZST01fVlNJWF9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdpbnN0YWxsVlNJWCcsIFwiSW5zdGFsbCBFeHRlbnNpb24gVlNJWFwiKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXhwbG9yZXJDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ2V4dGVuc2lvbnMnLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoUmVzb3VyY2VDb250ZXh0S2V5LkV4dGVuc2lvbi5pc0VxdWFsVG8oJy52c2l4JyksIENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUiwgQ09OVEVYVF9IQVNfUkVNT1RFX1NFUlZFUikpLFxuXHRcdFx0fV0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVzb3VyY2VzOiBVUklbXSB8IFVSSSkgPT4ge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblxuXHRcdFx0XHRjb25zdCB2c2l4cyA9IEFycmF5LmlzQXJyYXkocmVzb3VyY2VzKSA/IHJlc291cmNlcyA6IFtyZXNvdXJjZXNdO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQodnNpeHMubWFwKGFzeW5jICh2c2l4KSA9PiBhd2FpdCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsKHZzaXgsIHsgaW5zdGFsbEdpdmVuVmVyc2lvbjogdHJ1ZSB9KSkpO1xuXHRcdFx0XHRsZXQgZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkLCByZXF1aXJlUmVsb2FkID0gZmFsc2UsIHJlcXVpcmVSZXN0YXJ0ID0gZmFsc2U7XG5cdFx0XHRcdGZvciAoY29uc3QgciBvZiByZXN1bHQpIHtcblx0XHRcdFx0XHRpZiAoci5zdGF0dXMgPT09ICdyZWplY3RlZCcpIHtcblx0XHRcdFx0XHRcdGVycm9yID0gbmV3IEVycm9yKHIucmVhc29uKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXF1aXJlUmVsb2FkID0gcmVxdWlyZVJlbG9hZCB8fCByLnZhbHVlLnJ1bnRpbWVTdGF0ZT8uYWN0aW9uID09PSBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5SZWxvYWRXaW5kb3c7XG5cdFx0XHRcdFx0cmVxdWlyZVJlc3RhcnQgPSByZXF1aXJlUmVzdGFydCB8fCByLnZhbHVlLnJ1bnRpbWVTdGF0ZT8uYWN0aW9uID09PSBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5SZXN0YXJ0RXh0ZW5zaW9ucztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmVxdWlyZVJlbG9hZCkge1xuXHRcdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHRcdFx0U2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRcdHZzaXhzLmxlbmd0aCA+IDEgPyBsb2NhbGl6ZSgnSW5zdGFsbFZTSVhzLnN1Y2Nlc3NSZWxvYWQnLCBcIkNvbXBsZXRlZCBpbnN0YWxsaW5nIGV4dGVuc2lvbnMuIFBsZWFzZSByZWxvYWQgVmlzdWFsIFN0dWRpbyBDb2RlIHRvIGVuYWJsZSB0aGVtLlwiKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdJbnN0YWxsVlNJWEFjdGlvbi5zdWNjZXNzUmVsb2FkJywgXCJDb21wbGV0ZWQgaW5zdGFsbGluZyBleHRlbnNpb24uIFBsZWFzZSByZWxvYWQgVmlzdWFsIFN0dWRpbyBDb2RlIHRvIGVuYWJsZSBpdC5cIiksXG5cdFx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ0luc3RhbGxWU0lYQWN0aW9uLnJlbG9hZE5vdycsIFwiUmVsb2FkIE5vd1wiKSxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBob3N0U2VydmljZS5yZWxvYWQoKVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2UgaWYgKHJlcXVpcmVSZXN0YXJ0KSB7XG5cdFx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFx0XHRTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0dnNpeHMubGVuZ3RoID4gMSA/IGxvY2FsaXplKCdJbnN0YWxsVlNJWHMuc3VjY2Vzc1Jlc3RhcnQnLCBcIkNvbXBsZXRlZCBpbnN0YWxsaW5nIGV4dGVuc2lvbnMuIFBsZWFzZSByZXN0YXJ0IGV4dGVuc2lvbnMgdG8gZW5hYmxlIHRoZW0uXCIpXG5cdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ0luc3RhbGxWU0lYQWN0aW9uLnN1Y2Nlc3NSZXN0YXJ0JywgXCJDb21wbGV0ZWQgaW5zdGFsbGluZyBleHRlbnNpb24uIFBsZWFzZSByZXN0YXJ0IGV4dGVuc2lvbnMgdG8gZW5hYmxlIGl0LlwiKSxcblx0XHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnSW5zdGFsbFZTSVhBY3Rpb24ucmVzdGFydEV4dGVuc2lvbnMnLCBcIlJlc3RhcnQgRXh0ZW5zaW9uc1wiKSxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS51cGRhdGVSdW5uaW5nRXh0ZW5zaW9ucygpXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFx0XHRTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0dnNpeHMubGVuZ3RoID4gMSA/IGxvY2FsaXplKCdJbnN0YWxsVlNJWHMuc3VjY2Vzc05vUmVsb2FkJywgXCJDb21wbGV0ZWQgaW5zdGFsbGluZyBleHRlbnNpb25zLlwiKSA6IGxvY2FsaXplKCdJbnN0YWxsVlNJWEFjdGlvbi5zdWNjZXNzTm9SZWxvYWQnLCBcIkNvbXBsZXRlZCBpbnN0YWxsaW5nIGV4dGVuc2lvbi5cIiksXG5cdFx0XHRcdFx0XHRbXVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uaW5zdGFsbEV4dGVuc2lvbkZyb21Mb2NhdGlvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnN0YWxsRXh0ZW5zaW9uRnJvbUxvY2F0aW9uJywgJ0luc3RhbGwgRXh0ZW5zaW9uIGZyb20gTG9jYXRpb24uLi4nKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSEFTX1dFQl9TRVJWRVIsIENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUilcblx0XHRcdH1dLFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRcdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChjLCBlKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBxdWlja1BpY2sgPSBkaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKCkpO1xuXHRcdFx0XHRcdFx0cXVpY2tQaWNrLnRpdGxlID0gbG9jYWxpemUoJ2luc3RhbGxGcm9tTG9jYXRpb24nLCBcIkluc3RhbGwgRXh0ZW5zaW9uIGZyb20gTG9jYXRpb25cIik7XG5cdFx0XHRcdFx0XHRxdWlja1BpY2suY3VzdG9tQnV0dG9uID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHF1aWNrUGljay5jdXN0b21MYWJlbCA9IGxvY2FsaXplKCdpbnN0YWxsIGJ1dHRvbicsIFwiSW5zdGFsbFwiKTtcblx0XHRcdFx0XHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdpbnN0YWxsRnJvbUxvY2F0aW9uUGxhY2VIb2xkZXInLCBcIkxvY2F0aW9uIG9mIHRoZSB3ZWIgZXh0ZW5zaW9uXCIpO1xuXHRcdFx0XHRcdFx0cXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5hbnkocXVpY2tQaWNrLm9uRGlkQWNjZXB0LCBxdWlja1BpY2sub25EaWRDdXN0b20pKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0cXVpY2tQaWNrLmhpZGUoKTtcblx0XHRcdFx0XHRcdFx0aWYgKHF1aWNrUGljay52YWx1ZSkge1xuXHRcdFx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRhd2FpdCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUxvY2F0aW9uKFVSSS5wYXJzZShxdWlja1BpY2sudmFsdWUpKTtcblx0XHRcdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZShlcnJvcik7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGMoKTtcblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXHRcdFx0XHRcdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBmaWxlRGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZURpYWxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkxvY2F0aW9uID0gYXdhaXQgZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd09wZW5EaWFsb2coe1xuXHRcdFx0XHRcdFx0Y2FuU2VsZWN0Rm9sZGVyczogdHJ1ZSxcblx0XHRcdFx0XHRcdGNhblNlbGVjdEZpbGVzOiBmYWxzZSxcblx0XHRcdFx0XHRcdGNhblNlbGVjdE1hbnk6IGZhbHNlLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdpbnN0YWxsRnJvbUxvY2F0aW9uJywgXCJJbnN0YWxsIEV4dGVuc2lvbiBmcm9tIExvY2F0aW9uXCIpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmIChleHRlbnNpb25Mb2NhdGlvbj8uWzBdKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUxvY2F0aW9uKGV4dGVuc2lvbkxvY2F0aW9uWzBdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShleHRlbnNpb25zU2VhcmNoQWN0aW9uc01lbnUsIHtcblx0XHRcdHN1Ym1lbnU6IGV4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdmaWx0ZXJFeHRlbnNpb25zJywgXCJGaWx0ZXIgRXh0ZW5zaW9ucy4uLlwiKSxcblx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRvcmRlcjogMixcblx0XHRcdGljb246IGZpbHRlckljb24sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzaG93RmVhdHVyZWRFeHRlbnNpb25zSWQgPSAnZXh0ZW5zaW9ucy5maWx0ZXIuZmVhdHVyZWQnO1xuXHRcdGNvbnN0IGZlYXR1cmVzRXh0ZW5zaW9uc1doZW5Db250ZXh0ID0gQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfSEFTX0dBTExFUlksIENvbnRleHRLZXlFeHByLnJlZ2V4KENPTlRFWFRfR0FMTEVSWV9GSUxURVJfQ0FQQUJJTElUSUVTLmtleSwgbmV3IFJlZ0V4cChgXyR7RmlsdGVyVHlwZS5GZWF0dXJlZH1fYCkpKTtcblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiBzaG93RmVhdHVyZWRFeHRlbnNpb25zSWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93RmVhdHVyZWRFeHRlbnNpb25zJywgJ1Nob3cgRmVhdHVyZWQgRXh0ZW5zaW9ucycpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IGZlYXR1cmVzRXh0ZW5zaW9uc1doZW5Db250ZXh0XG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBleHRlbnNpb25zRmlsdGVyU3ViTWVudSxcblx0XHRcdFx0d2hlbjogZmVhdHVyZXNFeHRlbnNpb25zV2hlbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMV9wcmVkZWZpbmVkJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR9XSxcblx0XHRcdG1lbnVUaXRsZXM6IHtcblx0XHRcdFx0W2V4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LmlkXTogbG9jYWxpemUoJ2ZlYXR1cmVkIGZpbHRlcicsIFwiRmVhdHVyZWRcIilcblx0XHRcdH0sXG5cdFx0XHRydW46ICgpID0+IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaCgnQGZlYXR1cmVkICcpXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNob3dQb3B1bGFyRXh0ZW5zaW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93UG9wdWxhckV4dGVuc2lvbnMnLCAnU2hvdyBQb3B1bGFyIEV4dGVuc2lvbnMnKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDT05URVhUX0hBU19HQUxMRVJZXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBleHRlbnNpb25zRmlsdGVyU3ViTWVudSxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9IQVNfR0FMTEVSWSxcblx0XHRcdFx0Z3JvdXA6ICcxX3ByZWRlZmluZWQnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdH1dLFxuXHRcdFx0bWVudVRpdGxlczoge1xuXHRcdFx0XHRbZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUuaWRdOiBsb2NhbGl6ZSgnbW9zdCBwb3B1bGFyIGZpbHRlcicsIFwiTW9zdCBQb3B1bGFyXCIpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goJ0Bwb3B1bGFyICcpXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNob3dSZWNvbW1lbmRlZEV4dGVuc2lvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2hvd1JlY29tbWVuZGVkRXh0ZW5zaW9ucycsICdTaG93IFJlY29tbWVuZGVkIEV4dGVuc2lvbnMnKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDT05URVhUX0hBU19HQUxMRVJZXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBleHRlbnNpb25zRmlsdGVyU3ViTWVudSxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9IQVNfR0FMTEVSWSxcblx0XHRcdFx0Z3JvdXA6ICcxX3ByZWRlZmluZWQnLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdH1dLFxuXHRcdFx0bWVudVRpdGxlczoge1xuXHRcdFx0XHRbZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUuaWRdOiBsb2NhbGl6ZSgnbW9zdCBwb3B1bGFyIHJlY29tbWVuZGVkJywgXCJSZWNvbW1lbmRlZFwiKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKCdAcmVjb21tZW5kZWQgJylcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24ucmVjZW50bHlQdWJsaXNoZWRFeHRlbnNpb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3JlY2VudGx5UHVibGlzaGVkRXh0ZW5zaW9ucycsICdTaG93IFJlY2VudGx5IFB1Ymxpc2hlZCBFeHRlbnNpb25zJyksXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9IQVNfR0FMTEVSWVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUsXG5cdFx0XHRcdHdoZW46IENPTlRFWFRfSEFTX0dBTExFUlksXG5cdFx0XHRcdGdyb3VwOiAnMV9wcmVkZWZpbmVkJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHR9XSxcblx0XHRcdG1lbnVUaXRsZXM6IHtcblx0XHRcdFx0W2V4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LmlkXTogbG9jYWxpemUoJ3JlY2VudGx5IHB1Ymxpc2hlZCBmaWx0ZXInLCBcIlJlY2VudGx5IFB1Ymxpc2hlZFwiKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKCdAcmVjZW50bHlQdWJsaXNoZWQgJylcblx0XHR9KTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbnNDYXRlZ29yeUZpbHRlclN1Yk1lbnUgPSBuZXcgTWVudUlkKCdleHRlbnNpb25zQ2F0ZWdvcnlGaWx0ZXJTdWJNZW51Jyk7XG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKGV4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LCB7XG5cdFx0XHRzdWJtZW51OiBleHRlbnNpb25zQ2F0ZWdvcnlGaWx0ZXJTdWJNZW51LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdmaWx0ZXIgYnkgY2F0ZWdvcnknLCBcIkNhdGVnb3J5XCIpLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfSEFTX0dBTExFUlksIENvbnRleHRLZXlFeHByLnJlZ2V4KENPTlRFWFRfR0FMTEVSWV9GSUxURVJfQ0FQQUJJTElUSUVTLmtleSwgbmV3IFJlZ0V4cChgXyR7RmlsdGVyVHlwZS5DYXRlZ29yeX1fYCkpKSxcblx0XHRcdGdyb3VwOiAnMl9jYXRlZ29yaWVzJyxcblx0XHRcdG9yZGVyOiAxLFxuXHRcdH0pO1xuXG5cdFx0RVhURU5TSU9OX0NBVEVHT1JJRVMuZm9yRWFjaCgoY2F0ZWdvcnksIGluZGV4KSA9PiB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdFx0aWQ6IGBleHRlbnNpb25zLmFjdGlvbnMuc2VhcmNoQnlDYXRlZ29yeS4ke2NhdGVnb3J5fWAsXG5cdFx0XHRcdHRpdGxlOiBjYXRlZ29yeSxcblx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRpZDogZXh0ZW5zaW9uc0NhdGVnb3J5RmlsdGVyU3ViTWVudSxcblx0XHRcdFx0XHR3aGVuOiBDT05URVhUX0hBU19HQUxMRVJZLFxuXHRcdFx0XHRcdG9yZGVyOiBpbmRleCxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGBAY2F0ZWdvcnk6XCIke2NhdGVnb3J5LnRvTG93ZXJDYXNlKCl9XCJgKVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmluc3RhbGxlZEV4dGVuc2lvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW5zdGFsbGVkRXh0ZW5zaW9ucycsICdTaG93IEluc3RhbGxlZCBFeHRlbnNpb25zJyksXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnM19pbnN0YWxsZWQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdH1dLFxuXHRcdFx0bWVudVRpdGxlczoge1xuXHRcdFx0XHRbZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUuaWRdOiBsb2NhbGl6ZSgnaW5zdGFsbGVkIGZpbHRlcicsIFwiSW5zdGFsbGVkXCIpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goJ0BpbnN0YWxsZWQgJylcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24ubGlzdEJ1aWx0SW5FeHRlbnNpb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3dCdWlsdEluRXh0ZW5zaW9ucycsICdTaG93IEJ1aWx0LWluIEV4dGVuc2lvbnMnKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihDT05URVhUX0hBU19MT0NBTF9TRVJWRVIsIENPTlRFWFRfSEFTX1JFTU9URV9TRVJWRVIsIENPTlRFWFRfSEFTX1dFQl9TRVJWRVIpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBleHRlbnNpb25zRmlsdGVyU3ViTWVudSxcblx0XHRcdFx0Z3JvdXA6ICczX2luc3RhbGxlZCcsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0fV0sXG5cdFx0XHRtZW51VGl0bGVzOiB7XG5cdFx0XHRcdFtleHRlbnNpb25zRmlsdGVyU3ViTWVudS5pZF06IGxvY2FsaXplKCdidWlsdGluIGZpbHRlcicsIFwiQnVpbHQtaW5cIilcblx0XHRcdH0sXG5cdFx0XHRydW46ICgpID0+IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaCgnQGJ1aWx0aW4gJylcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uZXh0ZW5zaW9uVXBkYXRlcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdleHRlbnNpb25VcGRhdGVzJywgJ1Nob3cgRXh0ZW5zaW9uIFVwZGF0ZXMnKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfSEFTX0dBTExFUlksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBleHRlbnNpb25zRmlsdGVyU3ViTWVudSxcblx0XHRcdFx0Z3JvdXA6ICczX2luc3RhbGxlZCcsXG5cdFx0XHRcdHdoZW46IENPTlRFWFRfSEFTX0dBTExFUlksXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0fV0sXG5cdFx0XHRtZW51VGl0bGVzOiB7XG5cdFx0XHRcdFtleHRlbnNpb25zRmlsdGVyU3ViTWVudS5pZF06IGxvY2FsaXplKCdleHRlbnNpb24gdXBkYXRlcyBmaWx0ZXInLCBcIlVwZGF0ZXNcIilcblx0XHRcdH0sXG5cdFx0XHRydW46ICgpID0+IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaCgnQHVwZGF0ZXMnKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogTElTVF9XT1JLU1BBQ0VfVU5TVVBQT1JURURfRVhURU5TSU9OU19DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2hvd1dvcmtzcGFjZVVuc3VwcG9ydGVkRXh0ZW5zaW9ucycsICdTaG93IEV4dGVuc2lvbnMgVW5zdXBwb3J0ZWQgQnkgV29ya3NwYWNlJyksXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9IQVNfTE9DQUxfU0VSVkVSLCBDT05URVhUX0hBU19SRU1PVEVfU0VSVkVSKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IGV4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LFxuXHRcdFx0XHRncm91cDogJzNfaW5zdGFsbGVkJyxcblx0XHRcdFx0b3JkZXI6IDYsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUiwgQ09OVEVYVF9IQVNfUkVNT1RFX1NFUlZFUiksXG5cdFx0XHR9XSxcblx0XHRcdG1lbnVUaXRsZXM6IHtcblx0XHRcdFx0W2V4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LmlkXTogbG9jYWxpemUoJ3dvcmtzcGFjZSB1bnN1cHBvcnRlZCBmaWx0ZXInLCBcIldvcmtzcGFjZSBVbnN1cHBvcnRlZFwiKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKCdAd29ya3NwYWNlVW5zdXBwb3J0ZWQnKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zaG93RW5hYmxlZEV4dGVuc2lvbnMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2hvd0VuYWJsZWRFeHRlbnNpb25zJywgJ1Nob3cgRW5hYmxlZCBFeHRlbnNpb25zJyksXG5cdFx0XHRjYXRlZ29yeTogRXh0ZW5zaW9uc0xvY2FsaXplZExhYmVsLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9IQVNfTE9DQUxfU0VSVkVSLCBDT05URVhUX0hBU19SRU1PVEVfU0VSVkVSLCBDT05URVhUX0hBU19XRUJfU0VSVkVSKVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnM19pbnN0YWxsZWQnLFxuXHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdH1dLFxuXHRcdFx0bWVudVRpdGxlczoge1xuXHRcdFx0XHRbZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUuaWRdOiBsb2NhbGl6ZSgnZW5hYmxlZCBmaWx0ZXInLCBcIkVuYWJsZWRcIilcblx0XHRcdH0sXG5cdFx0XHRydW46ICgpID0+IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaCgnQGVuYWJsZWQgJylcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2hvd0Rpc2FibGVkRXh0ZW5zaW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93RGlzYWJsZWRFeHRlbnNpb25zJywgJ1Nob3cgRGlzYWJsZWQgRXh0ZW5zaW9ucycpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSEFTX0xPQ0FMX1NFUlZFUiwgQ09OVEVYVF9IQVNfUkVNT1RFX1NFUlZFUiwgQ09OVEVYVF9IQVNfV0VCX1NFUlZFUilcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IGV4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LFxuXHRcdFx0XHRncm91cDogJzNfaW5zdGFsbGVkJyxcblx0XHRcdFx0b3JkZXI6IDUsXG5cdFx0XHR9XSxcblx0XHRcdG1lbnVUaXRsZXM6IHtcblx0XHRcdFx0W2V4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LmlkXTogbG9jYWxpemUoJ2Rpc2FibGVkIGZpbHRlcicsIFwiRGlzYWJsZWRcIilcblx0XHRcdH0sXG5cdFx0XHRydW46ICgpID0+IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaCgnQGRpc2FibGVkICcpXG5cdFx0fSk7XG5cblx0XHRjb25zdCBleHRlbnNpb25zU29ydFN1Yk1lbnUgPSBuZXcgTWVudUlkKCdleHRlbnNpb25zU29ydFN1Yk1lbnUnKTtcblx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUsIHtcblx0XHRcdHN1Ym1lbnU6IGV4dGVuc2lvbnNTb3J0U3ViTWVudSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc29ydHkgYnknLCBcIlNvcnQgQnlcIiksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9IQVNfR0FMTEVSWSwgRGVmYXVsdFZpZXdzQ29udGV4dCkpLFxuXHRcdFx0Z3JvdXA6ICc0X3NvcnQnLFxuXHRcdFx0b3JkZXI6IDEsXG5cdFx0fSk7XG5cblx0XHRbXG5cdFx0XHR7IGlkOiAnaW5zdGFsbHMnLCB0aXRsZTogbG9jYWxpemUoJ3NvcnQgYnkgaW5zdGFsbHMnLCBcIkluc3RhbGwgQ291bnRcIiksIHByZWNvbmRpdGlvbjogQnVpbHRJbkV4dGVuc2lvbnNDb250ZXh0Lm5lZ2F0ZSgpLCBzb3J0Q2FwYWJpbGl0eTogU29ydEJ5Lkluc3RhbGxDb3VudCB9LFxuXHRcdFx0eyBpZDogJ3JhdGluZycsIHRpdGxlOiBsb2NhbGl6ZSgnc29ydCBieSByYXRpbmcnLCBcIlJhdGluZ1wiKSwgcHJlY29uZGl0aW9uOiBCdWlsdEluRXh0ZW5zaW9uc0NvbnRleHQubmVnYXRlKCksIHNvcnRDYXBhYmlsaXR5OiBTb3J0QnkuV2VpZ2h0ZWRSYXRpbmcgfSxcblx0XHRcdHsgaWQ6ICduYW1lJywgdGl0bGU6IGxvY2FsaXplKCdzb3J0IGJ5IG5hbWUnLCBcIk5hbWVcIiksIHByZWNvbmRpdGlvbjogQnVpbHRJbkV4dGVuc2lvbnNDb250ZXh0Lm5lZ2F0ZSgpLCBzb3J0Q2FwYWJpbGl0eTogU29ydEJ5LlRpdGxlIH0sXG5cdFx0XHR7IGlkOiAncHVibGlzaGVkRGF0ZScsIHRpdGxlOiBsb2NhbGl6ZSgnc29ydCBieSBwdWJsaXNoZWQgZGF0ZScsIFwiUHVibGlzaGVkIERhdGVcIiksIHByZWNvbmRpdGlvbjogQnVpbHRJbkV4dGVuc2lvbnNDb250ZXh0Lm5lZ2F0ZSgpLCBzb3J0Q2FwYWJpbGl0eTogU29ydEJ5LlB1Ymxpc2hlZERhdGUgfSxcblx0XHRcdHsgaWQ6ICd1cGRhdGVEYXRlJywgdGl0bGU6IGxvY2FsaXplKCdzb3J0IGJ5IHVwZGF0ZSBkYXRlJywgXCJVcGRhdGVkIERhdGVcIiksIHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFNlYXJjaE1hcmtldHBsYWNlRXh0ZW5zaW9uc0NvbnRleHQubmVnYXRlKCksIFJlY29tbWVuZGVkRXh0ZW5zaW9uc0NvbnRleHQubmVnYXRlKCksIEJ1aWx0SW5FeHRlbnNpb25zQ29udGV4dC5uZWdhdGUoKSksIHNvcnRDYXBhYmlsaXR5OiAnVXBkYXRlRGF0ZScgfSxcblx0XHRdLm1hcCgoeyBpZCwgdGl0bGUsIHByZWNvbmRpdGlvbiwgc29ydENhcGFiaWxpdHkgfSwgaW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IHNvcnRDYXBhYmlsaXR5Q29udGV4dCA9IENvbnRleHRLZXlFeHByLnJlZ2V4KENPTlRFWFRfR0FMTEVSWV9TT1JUX0NBUEFCSUxJVElFUy5rZXksIG5ldyBSZWdFeHAoYF8ke3NvcnRDYXBhYmlsaXR5fV9gKSk7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdFx0aWQ6IGBleHRlbnNpb25zLnNvcnQuJHtpZH1gLFxuXHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQocHJlY29uZGl0aW9uLCBDb250ZXh0S2V5RXhwci5yZWdleChFeHRlbnNpb25zU2VhcmNoVmFsdWVDb250ZXh0LmtleSwgL15AY29udHJpYnV0ZTovKS5uZWdhdGUoKSwgc29ydENhcGFiaWxpdHlDb250ZXh0KSxcblx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRpZDogZXh0ZW5zaW9uc1NvcnRTdWJNZW51LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5vcihDT05URVhUX0hBU19HQUxMRVJZLCBEZWZhdWx0Vmlld3NDb250ZXh0KSwgc29ydENhcGFiaWxpdHlDb250ZXh0KSxcblx0XHRcdFx0XHRvcmRlcjogaW5kZXgsXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHR0b2dnbGVkOiBFeHRlbnNpb25zU29ydEJ5Q29udGV4dC5pc0VxdWFsVG8oaWQpLFxuXHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25zVmlld1BhbmVDb250YWluZXIgPSAoKGF3YWl0IHRoaXMudmlld3NTZXJ2aWNlLm9wZW5WaWV3Q29udGFpbmVyKFZJRVdMRVRfSUQsIHRydWUpKT8uZ2V0Vmlld1BhbmVDb250YWluZXIoKSkgYXMgSUV4dGVuc2lvbnNWaWV3UGFuZUNvbnRhaW5lciB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50UXVlcnkgPSBRdWVyeS5wYXJzZShleHRlbnNpb25zVmlld1BhbmVDb250YWluZXI/LnNlYXJjaFZhbHVlID8/ICcnKTtcblx0XHRcdFx0XHRleHRlbnNpb25zVmlld1BhbmVDb250YWluZXI/LnNlYXJjaChuZXcgUXVlcnkoY3VycmVudFF1ZXJ5LnZhbHVlLCBpZCkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uc1ZpZXdQYW5lQ29udGFpbmVyPy5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uY2xlYXJFeHRlbnNpb25zU2VhcmNoUmVzdWx0cycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjbGVhckV4dGVuc2lvbnNTZWFyY2hSZXN1bHRzJywgJ0NsZWFyIEV4dGVuc2lvbnMgU2VhcmNoIFJlc3VsdHMnKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRpY29uOiBjbGVhclNlYXJjaFJlc3VsdHNJY29uLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IFNlYXJjaEhhc1RleHRDb250ZXh0LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogZXh0ZW5zaW9uc1NlYXJjaEFjdGlvbnNNZW51LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRjb25zdCB2aWV3UGFuZUNvbnRhaW5lciA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKS5nZXRBY3RpdmVWaWV3UGFuZUNvbnRhaW5lcldpdGhJZChWSUVXTEVUX0lEKTtcblx0XHRcdFx0aWYgKHZpZXdQYW5lQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uc1ZpZXdQYW5lQ29udGFpbmVyID0gdmlld1BhbmVDb250YWluZXIgYXMgSUV4dGVuc2lvbnNWaWV3UGFuZUNvbnRhaW5lcjtcblx0XHRcdFx0XHRleHRlbnNpb25zVmlld1BhbmVDb250YWluZXIuc2VhcmNoKCcnKTtcblx0XHRcdFx0XHRleHRlbnNpb25zVmlld1BhbmVDb250YWluZXIuZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5yZWZyZXNoRXh0ZW5zaW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3JlZnJlc2hFeHRlbnNpb24nLCAnUmVmcmVzaCcpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdGljb246IHJlZnJlc2hJY29uLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXInLCBWSUVXTEVUX0lEKSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRjb25zdCB2aWV3UGFuZUNvbnRhaW5lciA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKS5nZXRBY3RpdmVWaWV3UGFuZUNvbnRhaW5lcldpdGhJZChWSUVXTEVUX0lEKTtcblx0XHRcdFx0aWYgKHZpZXdQYW5lQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0YXdhaXQgKHZpZXdQYW5lQ29udGFpbmVyIGFzIElFeHRlbnNpb25zVmlld1BhbmVDb250YWluZXIpLnJlZnJlc2goKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5pbnN0YWxsV29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnaW5zdGFsbFdvcmtzcGFjZVJlY29tbWVuZGVkRXh0ZW5zaW9ucycsIFwiSW5zdGFsbCBXb3Jrc3BhY2UgUmVjb21tZW5kZWQgRXh0ZW5zaW9uc1wiKSxcblx0XHRcdGljb246IGluc3RhbGxXb3Jrc3BhY2VSZWNvbW1lbmRlZEljb24sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBXT1JLU1BBQ0VfUkVDT01NRU5EQVRJT05TX1ZJRVdfSUQpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHZpZXcgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkuZ2V0QWN0aXZlVmlld1dpdGhJZChXT1JLU1BBQ0VfUkVDT01NRU5EQVRJT05TX1ZJRVdfSUQpIGFzIElXb3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnNWaWV3O1xuXHRcdFx0XHRyZXR1cm4gdmlldy5pbnN0YWxsV29ya3NwYWNlUmVjb21tZW5kYXRpb25zKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiBDb25maWd1cmVXb3Jrc3BhY2VGb2xkZXJSZWNvbW1lbmRlZEV4dGVuc2lvbnNBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogQ29uZmlndXJlV29ya3NwYWNlRm9sZGVyUmVjb21tZW5kZWRFeHRlbnNpb25zQWN0aW9uLkxBQkVMLFxuXHRcdFx0aWNvbjogY29uZmlndXJlUmVjb21tZW5kZWRJY29uLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogV29ya2JlbmNoU3RhdGVDb250ZXh0Lm5vdEVxdWFsc1RvKCdlbXB0eScpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgV09SS1NQQUNFX1JFQ09NTUVOREFUSU9OU19WSUVXX0lEKSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdH1dLFxuXHRcdFx0cnVuOiAoKSA9PiBydW5BY3Rpb24odGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb25maWd1cmVXb3Jrc3BhY2VGb2xkZXJSZWNvbW1lbmRlZEV4dGVuc2lvbnNBY3Rpb24sIENvbmZpZ3VyZVdvcmtzcGFjZUZvbGRlclJlY29tbWVuZGVkRXh0ZW5zaW9uc0FjdGlvbi5JRCwgQ29uZmlndXJlV29ya3NwYWNlRm9sZGVyUmVjb21tZW5kZWRFeHRlbnNpb25zQWN0aW9uLkxBQkVMKSlcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6IEluc3RhbGxTcGVjaWZpY1ZlcnNpb25PZkV4dGVuc2lvbkFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiB7IHZhbHVlOiBJbnN0YWxsU3BlY2lmaWNWZXJzaW9uT2ZFeHRlbnNpb25BY3Rpb24uTEFCRUwsIG9yaWdpbmFsOiAnSW5zdGFsbCBTcGVjaWZpYyBWZXJzaW9uIG9mIEV4dGVuc2lvbi4uLicgfSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0hBU19HQUxMRVJZLCBDb250ZXh0S2V5RXhwci5vcihDT05URVhUX0hBU19MT0NBTF9TRVJWRVIsIENPTlRFWFRfSEFTX1JFTU9URV9TRVJWRVIsIENPTlRFWFRfSEFTX1dFQl9TRVJWRVIpKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogKCkgPT4gcnVuQWN0aW9uKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbFNwZWNpZmljVmVyc2lvbk9mRXh0ZW5zaW9uQWN0aW9uLCBJbnN0YWxsU3BlY2lmaWNWZXJzaW9uT2ZFeHRlbnNpb25BY3Rpb24uSUQsIEluc3RhbGxTcGVjaWZpY1ZlcnNpb25PZkV4dGVuc2lvbkFjdGlvbi5MQUJFTCkpXG5cdFx0fSk7XG5cdH1cblxuXHQvLyBFeHRlbnNpb24gQ29udGV4dCBNZW51XG5cdHByaXZhdGUgcmVnaXN0ZXJDb250ZXh0TWVudUFjdGlvbnMoKTogdm9pZCB7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiBTZXRDb2xvclRoZW1lQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IFNldENvbG9yVGhlbWVBY3Rpb24uVElUTEUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6IFRIRU1FX0FDVElPTlNfR1JPVVAsXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIubm90KCdpbkV4dGVuc2lvbkVkaXRvcicpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2V4dGVuc2lvblN0YXR1cycsICdpbnN0YWxsZWQnKSwgQ29udGV4dEtleUV4cHIuaGFzKCdleHRlbnNpb25IYXNDb2xvclRoZW1lcycpKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBleHRlbnNpb25JZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5sb2NhbC5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCB7IGlkOiBleHRlbnNpb25JZCB9KSk7XG5cdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXRDb2xvclRoZW1lQWN0aW9uKTtcblx0XHRcdFx0XHRhY3Rpb24uZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdFx0XHRcdHJldHVybiBydW5BY3Rpb24oYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogU2V0RmlsZUljb25UaGVtZUFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBTZXRGaWxlSWNvblRoZW1lQWN0aW9uLlRJVExFLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiBUSEVNRV9BQ1RJT05TX0dST1VQLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm5vdCgnaW5FeHRlbnNpb25FZGl0b3InKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdleHRlbnNpb25TdGF0dXMnLCAnaW5zdGFsbGVkJyksIENvbnRleHRLZXlFeHByLmhhcygnZXh0ZW5zaW9uSGFzRmlsZUljb25UaGVtZXMnKSlcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXh0ZW5zaW9uSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmluZChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZDogZXh0ZW5zaW9uSWQgfSkpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0RmlsZUljb25UaGVtZUFjdGlvbik7XG5cdFx0XHRcdFx0YWN0aW9uLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdFx0XHRyZXR1cm4gcnVuQWN0aW9uKGFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6IFNldFByb2R1Y3RJY29uVGhlbWVBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogU2V0UHJvZHVjdEljb25UaGVtZUFjdGlvbi5USVRMRSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogVEhFTUVfQUNUSU9OU19HUk9VUCxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5ub3QoJ2luRXh0ZW5zaW9uRWRpdG9yJyksIENvbnRleHRLZXlFeHByLmVxdWFscygnZXh0ZW5zaW9uU3RhdHVzJywgJ2luc3RhbGxlZCcpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2V4dGVuc2lvbkhhc1Byb2R1Y3RJY29uVGhlbWVzJykpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4dGVuc2lvbklkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQ6IGV4dGVuc2lvbklkIH0pKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldFByb2R1Y3RJY29uVGhlbWVBY3Rpb24pO1xuXHRcdFx0XHRcdGFjdGlvbi5leHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0XHRcdFx0cmV0dXJuIHJ1bkFjdGlvbihhY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNob3dQcmVSZWxlYXNlVmVyc2lvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93IHByZS1yZWxlYXNlIHZlcnNpb24nLCAnU2hvdyBQcmUtUmVsZWFzZSBWZXJzaW9uJyksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6IElOU1RBTExfQUNUSU9OU19HUk9VUCxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5oYXMoJ2luRXh0ZW5zaW9uRWRpdG9yJyksIENvbnRleHRLZXlFeHByLmhhcygnZ2FsbGVyeUV4dGVuc2lvbkhhc1ByZVJlbGVhc2VWZXJzaW9uJyksIENvbnRleHRLZXlFeHByLmhhcygnaXNQcmVSZWxlYXNlRXh0ZW5zaW9uQWxsb3dlZCcpLCBDb250ZXh0S2V5RXhwci5ub3QoJ3Nob3dQcmVSZWxlYXNlVmVyc2lvbicpLCBDb250ZXh0S2V5RXhwci5ub3QoJ2lzQnVpbHRpbkV4dGVuc2lvbicpKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBleHRlbnNpb25JZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gKGF3YWl0IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyBpZDogZXh0ZW5zaW9uSWQgfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXTtcblx0XHRcdFx0ZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5vcGVuKGV4dGVuc2lvbiwgeyBzaG93UHJlUmVsZWFzZVZlcnNpb246IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNob3dSZWxlYXNlZFZlcnNpb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2hvdyByZWxlYXNlZCB2ZXJzaW9uJywgJ1Nob3cgUmVsZWFzZSBWZXJzaW9uJyksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6IElOU1RBTExfQUNUSU9OU19HUk9VUCxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5oYXMoJ2luRXh0ZW5zaW9uRWRpdG9yJyksIENvbnRleHRLZXlFeHByLmhhcygnZ2FsbGVyeUV4dGVuc2lvbkhhc1ByZVJlbGVhc2VWZXJzaW9uJyksIENvbnRleHRLZXlFeHByLmhhcygnZXh0ZW5zaW9uSGFzUmVsZWFzZVZlcnNpb24nKSwgQ29udGV4dEtleUV4cHIuaGFzKCdzaG93UHJlUmVsZWFzZVZlcnNpb24nKSwgQ29udGV4dEtleUV4cHIubm90KCdpc0J1aWx0aW5FeHRlbnNpb24nKSlcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXh0ZW5zaW9uSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IChhd2FpdCBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQ6IGV4dGVuc2lvbklkIH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlbMF07XG5cdFx0XHRcdGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2Uub3BlbihleHRlbnNpb24sIHsgc2hvd1ByZVJlbGVhc2VWZXJzaW9uOiBmYWxzZSB9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6IFRvZ2dsZUF1dG9VcGRhdGVGb3JFeHRlbnNpb25BY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogVG9nZ2xlQXV0b1VwZGF0ZUZvckV4dGVuc2lvbkFjdGlvbi5MQUJFTCxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5vcihDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke0F1dG9VcGRhdGVDb25maWd1cmF0aW9uS2V5fWAsICdvbicpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2lzRXh0ZW5zaW9uRW5hYmxlZCcsIHRydWUpKSwgQ29udGV4dEtleUV4cHIubm90KCdleHRlbnNpb25EaXNhbGxvd0luc3RhbGwnKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpc0V4dGVuc2lvbkFsbG93ZWQnKSksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6IFVQREFURV9BQ1RJT05TX0dST1VQLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdCgnaW5FeHRlbnNpb25FZGl0b3InKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2V4dGVuc2lvblN0YXR1cycsICdpbnN0YWxsZWQnKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5ub3QoJ2lzQnVpbHRpbkV4dGVuc2lvbicpLFxuXHRcdFx0XHQpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGlkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQgfSkpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVG9nZ2xlQXV0b1VwZGF0ZUZvckV4dGVuc2lvbkFjdGlvbik7XG5cdFx0XHRcdFx0YWN0aW9uLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdFx0XHRyZXR1cm4gcnVuQWN0aW9uKGFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6IFRvZ2dsZUF1dG9VcGRhdGVzRm9yUHVibGlzaGVyQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IHsgdmFsdWU6IFRvZ2dsZUF1dG9VcGRhdGVzRm9yUHVibGlzaGVyQWN0aW9uLkxBQkVMLCBvcmlnaW5hbDogJ0F1dG8gVXBkYXRlIChQdWJsaXNoZXIpJyB9LFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtBdXRvVXBkYXRlQ29uZmlndXJhdGlvbktleX1gLCAnb2ZmJyksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6IFVQREFURV9BQ1RJT05TX0dST1VQLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnZXh0ZW5zaW9uU3RhdHVzJywgJ2luc3RhbGxlZCcpLCBDb250ZXh0S2V5RXhwci5ub3QoJ2lzQnVpbHRpbkV4dGVuc2lvbicpKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5sb2NhbC5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCB7IGlkIH0pKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRvZ2dsZUF1dG9VcGRhdGVzRm9yUHVibGlzaGVyQWN0aW9uKTtcblx0XHRcdFx0XHRhY3Rpb24uZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdFx0XHRcdHJldHVybiBydW5BY3Rpb24oYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zd2l0Y2hUb1ByZVJsZWFzZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2VuYWJsZVByZVJsZWFzZUxhYmVsJywgXCJTd2l0Y2ggdG8gUHJlLVJlbGVhc2UgVmVyc2lvblwiKSxcblx0XHRcdGNhdGVnb3J5OiBFeHRlbnNpb25zTG9jYWxpemVkTGFiZWwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6IElOU1RBTExfQUNUSU9OU19HUk9VUCxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0hBU19HQUxMRVJZLCBDb250ZXh0S2V5RXhwci5oYXMoJ2dhbGxlcnlFeHRlbnNpb25IYXNQcmVSZWxlYXNlVmVyc2lvbicpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzUHJlUmVsZWFzZUV4dGVuc2lvbkFsbG93ZWQnKSwgQ29udGV4dEtleUV4cHIubm90KCdpbnN0YWxsZWRFeHRlbnNpb25Jc09wdGVkVG9QcmVSZWxlYXNlJyksIENvbnRleHRLZXlFeHByLm5vdCgnaW5FeHRlbnNpb25FZGl0b3InKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdleHRlbnNpb25TdGF0dXMnLCAnaW5zdGFsbGVkJyksIENvbnRleHRLZXlFeHByLm5vdCgnaXNCdWlsdGluRXh0ZW5zaW9uJykpXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGlkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbmQoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQgfSkpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVG9nZ2xlUHJlUmVsZWFzZUV4dGVuc2lvbkFjdGlvbik7XG5cdFx0XHRcdFx0YWN0aW9uLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdFx0XHRyZXR1cm4gcnVuQWN0aW9uKGFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc3dpdGNoVG9SZWxlYXNlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZGlzYWJsZVByZVJsZWFzZUxhYmVsJywgXCJTd2l0Y2ggdG8gUmVsZWFzZSBWZXJzaW9uXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IEV4dGVuc2lvbnNMb2NhbGl6ZWRMYWJlbCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogSU5TVEFMTF9BQ1RJT05TX0dST1VQLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfSEFTX0dBTExFUlksIENvbnRleHRLZXlFeHByLmhhcygnZ2FsbGVyeUV4dGVuc2lvbkhhc1ByZVJlbGVhc2VWZXJzaW9uJyksIENvbnRleHRLZXlFeHByLmhhcygnaXNFeHRlbnNpb25BbGxvd2VkJyksIENvbnRleHRLZXlFeHByLmhhcygnaW5zdGFsbGVkRXh0ZW5zaW9uSXNPcHRlZFRvUHJlUmVsZWFzZScpLCBDb250ZXh0S2V5RXhwci5ub3QoJ2luRXh0ZW5zaW9uRWRpdG9yJyksIENvbnRleHRLZXlFeHByLmVxdWFscygnZXh0ZW5zaW9uU3RhdHVzJywgJ2luc3RhbGxlZCcpLCBDb250ZXh0S2V5RXhwci5ub3QoJ2lzQnVpbHRpbkV4dGVuc2lvbicpKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5sb2NhbC5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCB7IGlkIH0pKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRvZ2dsZVByZVJlbGVhc2VFeHRlbnNpb25BY3Rpb24pO1xuXHRcdFx0XHRcdGFjdGlvbi5leHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0XHRcdFx0cmV0dXJuIHJ1bkFjdGlvbihhY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiBDbGVhckxhbmd1YWdlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IENsZWFyTGFuZ3VhZ2VBY3Rpb24uVElUTEUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6IElOU1RBTExfQUNUSU9OU19HUk9VUCxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5ub3QoJ2luRXh0ZW5zaW9uRWRpdG9yJyksIENvbnRleHRLZXlFeHByLmhhcygnY2FuU2V0TGFuZ3VhZ2UnKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpc0FjdGl2ZUxhbmd1YWdlUGFja0V4dGVuc2lvbicpKVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBleHRlbnNpb25JZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IChhd2FpdCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zKFt7IGlkOiBleHRlbnNpb25JZCB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpWzBdO1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGVhckxhbmd1YWdlQWN0aW9uKTtcblx0XHRcdFx0YWN0aW9uLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdFx0cmV0dXJuIHJ1bkFjdGlvbihhY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5pbnN0YWxsVW5zaWduZWQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdpbnN0YWxsJywgXCJJbnN0YWxsXCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMF9pbnN0YWxsJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnZXh0ZW5zaW9uU3RhdHVzJywgJ3VuaW5zdGFsbGVkJyksIENvbnRleHRLZXlFeHByLmhhcygnaXNHYWxsZXJ5RXh0ZW5zaW9uJyksIENvbnRleHRLZXlFeHByLm5vdCgnZXh0ZW5zaW9uRGlzYWxsb3dJbnN0YWxsJyksIENvbnRleHRLZXlFeHByLmhhcygnZXh0ZW5zaW9uSXNVbnNpZ25lZCcpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0dBTExFUllfQUxMX1BVQkxJQ19SRVBPU0lUT1JZX1NJR05FRCwgQ29udGV4dEtleUV4cHIubm90KCdleHRlbnNpb25Jc1ByaXZhdGUnKSksIENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0dBTExFUllfQUxMX1BSSVZBVEVfUkVQT1NJVE9SWV9TSUdORUQsIENvbnRleHRLZXlFeHByLmhhcygnZXh0ZW5zaW9uSXNQcml2YXRlJykpKSksXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4dGVuc2lvbklkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbC5maWx0ZXIoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQ6IGV4dGVuc2lvbklkIH0pKVswXVxuXHRcdFx0XHRcdHx8IChhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQ6IGV4dGVuc2lvbklkIH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlbMF07XG5cdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsQWN0aW9uLCB7IGluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbjogdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5wcmVmZXJQcmVSZWxlYXNlcyB9KTtcblx0XHRcdFx0XHRhY3Rpb24uZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdFx0XHRcdHJldHVybiBydW5BY3Rpb24oYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5pbnN0YWxsQW5kRG9ub3RTeW5jJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnaW5zdGFsbCBpbnN0YWxsQW5kRG9ub3RTeW5jJywgXCJJbnN0YWxsIChEbyBub3QgU3luYylcIiksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcwX2luc3RhbGwnLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdleHRlbnNpb25TdGF0dXMnLCAndW5pbnN0YWxsZWQnKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpc0dhbGxlcnlFeHRlbnNpb24nKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpc0V4dGVuc2lvbkFsbG93ZWQnKSwgQ29udGV4dEtleUV4cHIubm90KCdleHRlbnNpb25EaXNhbGxvd0luc3RhbGwnKSwgQ09OVEVYVF9TWU5DX0VOQUJMRU1FTlQpLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBleHRlbnNpb25JZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmlsdGVyKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCB7IGlkOiBleHRlbnNpb25JZCB9KSlbMF1cblx0XHRcdFx0XHR8fCAoYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zKFt7IGlkOiBleHRlbnNpb25JZCB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpWzBdO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbEFjdGlvbiwge1xuXHRcdFx0XHRcdFx0aW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnByZWZlclByZVJlbGVhc2VzLFxuXHRcdFx0XHRcdFx0aXNNYWNoaW5lU2NvcGVkOiB0cnVlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGFjdGlvbi5leHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0XHRcdFx0cmV0dXJuIHJ1bkFjdGlvbihhY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmluc3RhbGxQcmVyZWxlYXNlQW5kRG9ub3RTeW5jJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnaW5zdGFsbFByZXJlbGVhc2VBbmREb25vdFN5bmMnLCBcIkluc3RhbGwgUHJlLVJlbGVhc2UgKERvIG5vdCBTeW5jKVwiKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzBfaW5zdGFsbCcsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2V4dGVuc2lvblN0YXR1cycsICd1bmluc3RhbGxlZCcpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzR2FsbGVyeUV4dGVuc2lvbicpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2V4dGVuc2lvbkhhc1ByZVJlbGVhc2VWZXJzaW9uJyksIENvbnRleHRLZXlFeHByLmhhcygnaXNQcmVSZWxlYXNlRXh0ZW5zaW9uQWxsb3dlZCcpLCBDb250ZXh0S2V5RXhwci5ub3QoJ2V4dGVuc2lvbkRpc2FsbG93SW5zdGFsbCcpLCBDT05URVhUX1NZTkNfRU5BQkxFTUVOVCksXG5cdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4dGVuc2lvbklkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbC5maWx0ZXIoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQ6IGV4dGVuc2lvbklkIH0pKVswXVxuXHRcdFx0XHRcdHx8IChhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQ6IGV4dGVuc2lvbklkIH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlbMF07XG5cdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsQWN0aW9uLCB7XG5cdFx0XHRcdFx0XHRpc01hY2hpbmVTY29wZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRwcmVSZWxlYXNlOiB0cnVlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YWN0aW9uLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdFx0XHRyZXR1cm4gcnVuQWN0aW9uKGFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6IEluc3RhbGxBbm90aGVyVmVyc2lvbkFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBJbnN0YWxsQW5vdGhlclZlcnNpb25BY3Rpb24uTEFCRUwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcwX2luc3RhbGwnLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdleHRlbnNpb25TdGF0dXMnLCAndW5pbnN0YWxsZWQnKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpc0dhbGxlcnlFeHRlbnNpb24nKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpc0V4dGVuc2lvbkFsbG93ZWQnKSwgQ29udGV4dEtleUV4cHIubm90KCdleHRlbnNpb25EaXNhbGxvd0luc3RhbGwnKSksXG5cdFx0XHRcdG9yZGVyOiAzXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4dGVuc2lvbklkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbC5maWx0ZXIoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQ6IGV4dGVuc2lvbklkIH0pKVswXVxuXHRcdFx0XHRcdHx8IChhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQ6IGV4dGVuc2lvbklkIH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlbMF07XG5cdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gcnVuQWN0aW9uKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxBbm90aGVyVmVyc2lvbkFjdGlvbiwgZXh0ZW5zaW9uLCBmYWxzZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmNvcHlFeHRlbnNpb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmNvcHlFeHRlbnNpb24nLCAnQ29weScpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMV9jb3B5J1xuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBleHRlbnNpb25JZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbHRlcihlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZDogZXh0ZW5zaW9uSWQgfSkpWzBdXG5cdFx0XHRcdFx0fHwgKGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyBpZDogZXh0ZW5zaW9uSWQgfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdGNvbnN0IG5hbWUgPSBsb2NhbGl6ZSgnZXh0ZW5zaW9uSW5mb05hbWUnLCAnTmFtZTogezB9JywgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKTtcblx0XHRcdFx0XHRjb25zdCBpZCA9IGxvY2FsaXplKCdleHRlbnNpb25JbmZvSWQnLCAnSWQ6IHswfScsIGV4dGVuc2lvbklkKTtcblx0XHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdleHRlbnNpb25JbmZvRGVzY3JpcHRpb24nLCAnRGVzY3JpcHRpb246IHswfScsIGV4dGVuc2lvbi5kZXNjcmlwdGlvbik7XG5cdFx0XHRcdFx0Y29uc3QgdmVyaXNpb24gPSBsb2NhbGl6ZSgnZXh0ZW5zaW9uSW5mb1ZlcnNpb24nLCAnVmVyc2lvbjogezB9JywgZXh0ZW5zaW9uLnZlcnNpb24pO1xuXHRcdFx0XHRcdGNvbnN0IHB1Ymxpc2hlciA9IGxvY2FsaXplKCdleHRlbnNpb25JbmZvUHVibGlzaGVyJywgJ1B1Ymxpc2hlcjogezB9JywgZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lKTtcblx0XHRcdFx0XHRjb25zdCBsaW5rID0gZXh0ZW5zaW9uLnVybCA/IGxvY2FsaXplKCdleHRlbnNpb25JbmZvVlNNYXJrZXRwbGFjZUxpbmsnLCAnVlMgTWFya2V0cGxhY2UgTGluazogezB9JywgYCR7ZXh0ZW5zaW9uLnVybH1gKSA6IG51bGw7XG5cdFx0XHRcdFx0Y29uc3QgY2xpcGJvYXJkU3RyID0gYCR7bmFtZX1cXG4ke2lkfVxcbiR7ZGVzY3JpcHRpb259XFxuJHt2ZXJpc2lvbn1cXG4ke3B1Ymxpc2hlcn0ke2xpbmsgPyAnXFxuJyArIGxpbmsgOiAnJ31gO1xuXHRcdFx0XHRcdGF3YWl0IGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGNsaXBib2FyZFN0cik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uY29weUV4dGVuc2lvbklkJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5jb3B5RXh0ZW5zaW9uSWQnLCAnQ29weSBFeHRlbnNpb24gSUQnKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzFfY29weSdcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaWQ6IHN0cmluZykgPT4gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKS53cml0ZVRleHQoaWQpXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmNvcHlMaW5rJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5jb3B5TGluaycsICdDb3B5IExpbmsnKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzFfY29weScsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5oYXMoJ2lzR2FsbGVyeUV4dGVuc2lvbicpLCBDT05URVhUX0dBTExFUllfSEFTX0VYVEVOU0lPTl9MSU5LKSxcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgXywgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uQXJnKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uLmdhbGxlcnlMaW5rKSB7XG5cdFx0XHRcdFx0YXdhaXQgY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQoZXh0ZW5zaW9uLmdhbGxlcnlMaW5rKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5jb25maWd1cmUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmNvbmZpZ3VyZScsICdTZXR0aW5ncycpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMl9jb25maWd1cmUnLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdleHRlbnNpb25TdGF0dXMnLCAnaW5zdGFsbGVkJyksIENvbnRleHRLZXlFeHByLmhhcygnZXh0ZW5zaW9uSGFzQ29uZmlndXJhdGlvbicpKSxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaWQ6IHN0cmluZykgPT4gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5TZXR0aW5ncyh7IGpzb25FZGl0b3I6IGZhbHNlLCBxdWVyeTogYEBleHQ6JHtpZH1gIH0pXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmRvd25sb2FkJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZG93bmxvYWQgVlNJWCcsIFwiRG93bmxvYWQgVlNJWFwiKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIubm90KCdleHRlbnNpb25EaXNhbGxvd0luc3RhbGwnKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpc0dhbGxlcnlFeHRlbnNpb24nKSksXG5cdFx0XHRcdG9yZGVyOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgPT09ICdzdGFibGUnID8gMCA6IDFcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXh0ZW5zaW9uSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKS5kb3dubG9hZFZTSVgoZXh0ZW5zaW9uSWQsICdyZWxlYXNlJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmRvd25sb2FkUHJlUmVsZWFzZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2Rvd25sb2FkIHByZS1yZWxlYXNlJywgXCJEb3dubG9hZCBQcmUtUmVsZWFzZSBWU0lYXCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5ub3QoJ2V4dGVuc2lvbkRpc2FsbG93SW5zdGFsbCcpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzR2FsbGVyeUV4dGVuc2lvbicpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2V4dGVuc2lvbkhhc1ByZVJlbGVhc2VWZXJzaW9uJykpLFxuXHRcdFx0XHRvcmRlcjogdGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5ID09PSAnc3RhYmxlJyA/IDEgOiAwXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4dGVuc2lvbklkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSkuZG93bmxvYWRWU0lYKGV4dGVuc2lvbklkLCAncHJlcmVsZWFzZScpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5kb3dubG9hZFNwZWNpZmljVmVyc2lvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2Rvd25sb2FkIHNwZWNpZmljIHZlcnNpb24nLCBcIkRvd25sb2FkIFNwZWNpZmljIFZlcnNpb24gVlNJWC4uLlwiKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIubm90KCdleHRlbnNpb25EaXNhbGxvd0luc3RhbGwnKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpc0dhbGxlcnlFeHRlbnNpb24nKSksXG5cdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4dGVuc2lvbklkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSkuZG93bmxvYWRWU0lYKGV4dGVuc2lvbklkLCAnYW55Jyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLm1hbmFnZUFjY291bnRQcmVmZXJlbmNlcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uY2hhbmdlQWNjb3VudFByZWZlcmVuY2UnLCBcIkFjY291bnQgUHJlZmVyZW5jZXNcIiksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcyX2NvbmZpZ3VyZScsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2V4dGVuc2lvblN0YXR1cycsICdpbnN0YWxsZWQnKSwgQ29udGV4dEtleUV4cHIuaGFzKCdleHRlbnNpb25IYXNBY2NvdW50UHJlZmVyZW5jZXMnKSksXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0fSxcblx0XHRcdHJ1bjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpZDogc3RyaW5nKSA9PiBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZCgnX21hbmFnZUFjY291bnRQcmVmZXJlbmNlc0ZvckV4dGVuc2lvbicsIGlkKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5jb25maWd1cmVLZXliaW5kaW5ncycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uY29uZmlndXJlS2V5YmluZGluZ3MnLCAnS2V5Ym9hcmQgU2hvcnRjdXRzJyksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcyX2NvbmZpZ3VyZScsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2V4dGVuc2lvblN0YXR1cycsICdpbnN0YWxsZWQnKSwgQ29udGV4dEtleUV4cHIuaGFzKCdleHRlbnNpb25IYXNLZXliaW5kaW5ncycpKSxcblx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdH0sXG5cdFx0XHRydW46IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaWQ6IHN0cmluZykgPT4gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5HbG9iYWxLZXliaW5kaW5nU2V0dGluZ3MoZmFsc2UsIHsgcXVlcnk6IGBAZXh0OiR7aWR9YCB9KVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi50b2dnbGVBcHBseVRvQWxsUHJvZmlsZXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnRvZ2dsZUFwcGx5VG9BbGxQcm9maWxlcycsIFwiQXBwbHkgRXh0ZW5zaW9uIHRvIGFsbCBQcm9maWxlc1wiKSxcblx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmhhcygnaXNBcHBsaWNhdGlvblNjb3BlZEV4dGVuc2lvbicpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMl9jb25maWd1cmUnLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdleHRlbnNpb25TdGF0dXMnLCAnaW5zdGFsbGVkJyksIENvbnRleHRLZXlFeHByLmhhcygnaXNEZWZhdWx0QXBwbGljYXRpb25TY29wZWRFeHRlbnNpb24nKS5uZWdhdGUoKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpc0J1aWx0aW5FeHRlbnNpb24nKS5uZWdhdGUoKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdpc1dvcmtzcGFjZVNjb3BlZEV4dGVuc2lvbicsIGZhbHNlKSksXG5cdFx0XHRcdG9yZGVyOiAzXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIF86IHN0cmluZywgZXh0ZW5zaW9uQXJnOiBJRXh0ZW5zaW9uQXJnKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVyaUlkZW50aXR5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gZXh0ZW5zaW9uQXJnLmxvY2F0aW9uID8gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsZWQuZmluZChlID0+IHVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChlLmxvY2FsPy5sb2NhdGlvbiwgZXh0ZW5zaW9uQXJnLmxvY2F0aW9uKSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS50b2dnbGVBcHBseUV4dGVuc2lvblRvQWxsUHJvZmlsZXMoZXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogVE9HR0xFX0lHTk9SRV9FWFRFTlNJT05fQUNUSU9OX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnRvZ2dsZUlnbm9yZUV4dGVuc2lvbicsIFwiU3luYyBUaGlzIEV4dGVuc2lvblwiKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzJfY29uZmlndXJlJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnZXh0ZW5zaW9uU3RhdHVzJywgJ2luc3RhbGxlZCcpLCBDT05URVhUX1NZTkNfRU5BQkxFTUVOVCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdpc1dvcmtzcGFjZVNjb3BlZEV4dGVuc2lvbicsIGZhbHNlKSksXG5cdFx0XHRcdG9yZGVyOiA0XG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGlkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbC5maW5kKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBlLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnRvZ2dsZUV4dGVuc2lvbklnbm9yZWRUb1N5bmMoZXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5pZ25vcmVSZWNvbW1lbmRhdGlvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uaWdub3JlUmVjb21tZW5kYXRpb24nLCBcIklnbm9yZSBSZWNvbW1lbmRhdGlvblwiKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHRlbnNpb25Db250ZXh0LFxuXHRcdFx0XHRncm91cDogJzNfcmVjb21tZW5kYXRpb25zJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuaGFzKCdpc0V4dGVuc2lvblJlY29tbWVuZGVkJyksXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGlkOiBzdHJpbmcpID0+IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UpLnRvZ2dsZUdsb2JhbElnbm9yZWRSZWNvbW1lbmRhdGlvbihpZCwgdHJ1ZSlcblx0XHR9KTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFeHRlbnNpb25BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24udW5kb0lnbm9yZWRSZWNvbW1lbmRhdGlvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24udW5kb0lnbm9yZWRSZWNvbW1lbmRhdGlvbicsIFwiVW5kbyBJZ25vcmVkIFJlY29tbWVuZGF0aW9uXCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnM19yZWNvbW1lbmRhdGlvbnMnLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoJ2lzVXNlcklnbm9yZWRSZWNvbW1lbmRhdGlvbicpLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpZDogc3RyaW5nKSA9PiBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlKS50b2dnbGVHbG9iYWxJZ25vcmVkUmVjb21tZW5kYXRpb24oaWQsIGZhbHNlKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5hZGRFeHRlbnNpb25Ub1dvcmtzcGFjZVJlY29tbWVuZGF0aW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uYWRkRXh0ZW5zaW9uVG9Xb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMnLCBcIkFkZCB0byBXb3Jrc3BhY2UgUmVjb21tZW5kYXRpb25zXCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnM19yZWNvbW1lbmRhdGlvbnMnLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoU3RhdGVDb250ZXh0Lm5vdEVxdWFsc1RvKCdlbXB0eScpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzQnVpbHRpbkV4dGVuc2lvbicpLm5lZ2F0ZSgpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzRXh0ZW5zaW9uV29ya3NwYWNlUmVjb21tZW5kZWQnKS5uZWdhdGUoKSwgQ29udGV4dEtleUV4cHIuaGFzKCdpc1VzZXJJZ25vcmVkUmVjb21tZW5kYXRpb24nKS5uZWdhdGUoKSwgQ29udGV4dEtleUV4cHIubm90RXF1YWxzKCdleHRlbnNpb25Tb3VyY2UnLCAncmVzb3VyY2UnKSksXG5cdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGlkOiBzdHJpbmcpID0+IGFjY2Vzc29yLmdldChJV29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2UpLnRvZ2dsZVJlY29tbWVuZGF0aW9uKGlkKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5yZW1vdmVFeHRlbnNpb25Gcm9tV29ya3NwYWNlUmVjb21tZW5kYXRpb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5yZW1vdmVFeHRlbnNpb25Gcm9tV29ya3NwYWNlUmVjb21tZW5kYXRpb25zJywgXCJSZW1vdmUgZnJvbSBXb3Jrc3BhY2UgUmVjb21tZW5kYXRpb25zXCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnM19yZWNvbW1lbmRhdGlvbnMnLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoU3RhdGVDb250ZXh0Lm5vdEVxdWFsc1RvKCdlbXB0eScpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzQnVpbHRpbkV4dGVuc2lvbicpLm5lZ2F0ZSgpLCBDb250ZXh0S2V5RXhwci5oYXMoJ2lzRXh0ZW5zaW9uV29ya3NwYWNlUmVjb21tZW5kZWQnKSksXG5cdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHR9LFxuXHRcdFx0cnVuOiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGlkOiBzdHJpbmcpID0+IGFjY2Vzc29yLmdldChJV29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2UpLnRvZ2dsZVJlY29tbWVuZGF0aW9uKGlkKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5hZGRUb1dvcmtzcGFjZVJlY29tbWVuZGF0aW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uYWRkVG9Xb3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMnLCBcIkFkZCBFeHRlbnNpb24gdG8gV29ya3NwYWNlIFJlY29tbWVuZGF0aW9uc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBFWFRFTlNJT05TX0NBVEVHT1JZLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnd29ya3NwYWNlJyksIENvbnRleHRLZXlFeHByLmVxdWFscygncmVzb3VyY2VTY2hlbWUnLCBTY2hlbWFzLmV4dGVuc2lvbikpLFxuXHRcdFx0fSxcblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8YW55PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2UpO1xuXHRcdFx0XHRpZiAoIShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvciBpbnN0YW5jZW9mIEV4dGVuc2lvbnNJbnB1dCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvci5leHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRjb25zdCByZWNvbW1lbmRhdGlvbnMgPSBhd2FpdCB3b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZS5nZXRSZWNvbW1lbmRhdGlvbnMoKTtcblx0XHRcdFx0aWYgKHJlY29tbWVuZGF0aW9ucy5pbmNsdWRlcyhleHRlbnNpb25JZCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgd29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2UudG9nZ2xlUmVjb21tZW5kYXRpb24oZXh0ZW5zaW9uSWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5hZGRUb1dvcmtzcGFjZUZvbGRlclJlY29tbWVuZGF0aW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uYWRkVG9Xb3Jrc3BhY2VGb2xkZXJSZWNvbW1lbmRhdGlvbnMnLCBcIkFkZCBFeHRlbnNpb24gdG8gV29ya3NwYWNlIEZvbGRlciBSZWNvbW1lbmRhdGlvbnNcIiksXG5cdFx0XHRjYXRlZ29yeTogRVhURU5TSU9OU19DQVRFR09SWSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFdvcmtiZW5jaFN0YXRlQ29udGV4dC5pc0VxdWFsVG8oJ2ZvbGRlcicpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3Jlc291cmNlU2NoZW1lJywgU2NoZW1hcy5leHRlbnNpb24pKSxcblx0XHRcdH0sXG5cdFx0XHRydW46ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5hZGRUb1dvcmtzcGFjZVJlY29tbWVuZGF0aW9ucycpXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmFkZFRvV29ya3NwYWNlSWdub3JlZFJlY29tbWVuZGF0aW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uYWRkVG9Xb3Jrc3BhY2VJZ25vcmVkUmVjb21tZW5kYXRpb25zJywgXCJBZGQgRXh0ZW5zaW9uIHRvIFdvcmtzcGFjZSBJZ25vcmVkIFJlY29tbWVuZGF0aW9uc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBFWFRFTlNJT05TX0NBVEVHT1JZLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnd29ya3NwYWNlJyksIENvbnRleHRLZXlFeHByLmVxdWFscygncmVzb3VyY2VTY2hlbWUnLCBTY2hlbWFzLmV4dGVuc2lvbikpLFxuXHRcdFx0fSxcblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8YW55PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2UpO1xuXHRcdFx0XHRpZiAoIShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvciBpbnN0YW5jZW9mIEV4dGVuc2lvbnNJbnB1dCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvci5leHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRjb25zdCB1bndhbnRlZFJlY29tbWVuZGF0aW9ucyA9IGF3YWl0IHdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdTZXJ2aWNlLmdldFVud2FudGVkUmVjb21tZW5kYXRpb25zKCk7XG5cdFx0XHRcdGlmICh1bndhbnRlZFJlY29tbWVuZGF0aW9ucy5pbmNsdWRlcyhleHRlbnNpb25JZCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgd29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2UudG9nZ2xlVW53YW50ZWRSZWNvbW1lbmRhdGlvbihleHRlbnNpb25JZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmFkZFRvV29ya3NwYWNlRm9sZGVySWdub3JlZFJlY29tbWVuZGF0aW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uYWRkVG9Xb3Jrc3BhY2VGb2xkZXJJZ25vcmVkUmVjb21tZW5kYXRpb25zJywgXCJBZGQgRXh0ZW5zaW9uIHRvIFdvcmtzcGFjZSBGb2xkZXIgSWdub3JlZCBSZWNvbW1lbmRhdGlvbnNcIiksXG5cdFx0XHRjYXRlZ29yeTogRVhURU5TSU9OU19DQVRFR09SWSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFdvcmtiZW5jaFN0YXRlQ29udGV4dC5pc0VxdWFsVG8oJ2ZvbGRlcicpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3Jlc291cmNlU2NoZW1lJywgU2NoZW1hcy5leHRlbnNpb24pKSxcblx0XHRcdH0sXG5cdFx0XHRydW46ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5hZGRUb1dvcmtzcGFjZUlnbm9yZWRSZWNvbW1lbmRhdGlvbnMnKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogQ29uZmlndXJlV29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IHsgdmFsdWU6IENvbmZpZ3VyZVdvcmtzcGFjZVJlY29tbWVuZGVkRXh0ZW5zaW9uc0FjdGlvbi5MQUJFTCwgb3JpZ2luYWw6ICdDb25maWd1cmUgUmVjb21tZW5kZWQgRXh0ZW5zaW9ucyAoV29ya3NwYWNlKScgfSxcblx0XHRcdGNhdGVnb3J5OiBFWFRFTlNJT05TX0NBVEVHT1JZLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBXb3JrYmVuY2hTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCd3b3Jrc3BhY2UnKSxcblx0XHRcdH0sXG5cdFx0XHRydW46ICgpID0+IHJ1bkFjdGlvbih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbmZpZ3VyZVdvcmtzcGFjZVJlY29tbWVuZGVkRXh0ZW5zaW9uc0FjdGlvbiwgQ29uZmlndXJlV29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zQWN0aW9uLklELCBDb25maWd1cmVXb3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnNBY3Rpb24uTEFCRUwpKVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV4dGVuc2lvbkFjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5tYW5hZ2VUcnVzdGVkUHVibGlzaGVycycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24ubWFuYWdlVHJ1c3RlZFB1Ymxpc2hlcnMnLCBcIk1hbmFnZSBUcnVzdGVkIEV4dGVuc2lvbiBQdWJsaXNoZXJzXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IEVYVEVOU0lPTlNfQ0FURUdPUlksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHJ1bjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHRydXN0ZWRQdWJsaXNoZXJzID0gZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0VHJ1c3RlZFB1Ymxpc2hlcnMoKTtcblx0XHRcdFx0Y29uc3QgdHJ1c3RlZFB1Ymxpc2hlckl0ZW1zID0gdHJ1c3RlZFB1Ymxpc2hlcnMubWFwKHB1Ymxpc2hlciA9PiAoe1xuXHRcdFx0XHRcdGlkOiBwdWJsaXNoZXIucHVibGlzaGVyLFxuXHRcdFx0XHRcdGxhYmVsOiBwdWJsaXNoZXIucHVibGlzaGVyRGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHB1Ymxpc2hlci5wdWJsaXNoZXIsXG5cdFx0XHRcdFx0cGlja2VkOiB0cnVlLFxuXHRcdFx0XHR9KSkuc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayh0cnVzdGVkUHVibGlzaGVySXRlbXMsIHtcblx0XHRcdFx0XHRjYW5QaWNrTWFueTogdHJ1ZSxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3RydXN0ZWRQdWJsaXNoZXJzJywgXCJNYW5hZ2UgVHJ1c3RlZCBFeHRlbnNpb24gUHVibGlzaGVyc1wiKSxcblx0XHRcdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3RydXN0ZWRQdWJsaXNoZXJzUGxhY2Vob2xkZXInLCBcIkNob29zZSB3aGljaCBwdWJsaXNoZXJzIHRvIHRydXN0XCIpLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdGNvbnN0IHVudHJ1c3RlZFB1Ymxpc2hlcnMgPSBbXTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHsgcHVibGlzaGVyIH0gb2YgdHJ1c3RlZFB1Ymxpc2hlcnMpIHtcblx0XHRcdFx0XHRcdGlmICghcmVzdWx0LnNvbWUociA9PiByLmlkID09PSBwdWJsaXNoZXIpKSB7XG5cdFx0XHRcdFx0XHRcdHVudHJ1c3RlZFB1Ymxpc2hlcnMucHVzaChwdWJsaXNoZXIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0cnVzdGVkUHVibGlzaGVycy5maWx0ZXIocHVibGlzaGVyID0+ICFyZXN1bHQuc29tZShyID0+IHIuaWQgPT09IHB1Ymxpc2hlci5wdWJsaXNoZXIpKTtcblx0XHRcdFx0XHRleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS51bnRydXN0UHVibGlzaGVycyguLi51bnRydXN0ZWRQdWJsaXNoZXJzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRXh0ZW5zaW9uQWN0aW9uKGV4dGVuc2lvbkFjdGlvbk9wdGlvbnM6IElFeHRlbnNpb25BY3Rpb25PcHRpb25zKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IG1lbnVzID0gZXh0ZW5zaW9uQWN0aW9uT3B0aW9ucy5tZW51ID8gQXJyYXkuaXNBcnJheShleHRlbnNpb25BY3Rpb25PcHRpb25zLm1lbnUpID8gZXh0ZW5zaW9uQWN0aW9uT3B0aW9ucy5tZW51IDogW2V4dGVuc2lvbkFjdGlvbk9wdGlvbnMubWVudV0gOiBbXTtcblx0XHRsZXQgbWVudXNXaXRoT3V0VGl0bGVzOiAoeyBpZDogTWVudUlkIH0gJiBPbWl0PElNZW51SXRlbSwgJ2NvbW1hbmQnPilbXSA9IFtdO1xuXHRcdGNvbnN0IG1lbnVzV2l0aFRpdGxlczogeyBpZDogTWVudUlkOyBpdGVtOiBJTWVudUl0ZW0gfVtdID0gW107XG5cdFx0aWYgKGV4dGVuc2lvbkFjdGlvbk9wdGlvbnMubWVudVRpdGxlcykge1xuXHRcdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IG1lbnVzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0XHRjb25zdCBtZW51ID0gbWVudXNbaW5kZXhdO1xuXHRcdFx0XHRjb25zdCBtZW51VGl0bGUgPSBleHRlbnNpb25BY3Rpb25PcHRpb25zLm1lbnVUaXRsZXNbbWVudS5pZC5pZF07XG5cdFx0XHRcdGlmIChtZW51VGl0bGUpIHtcblx0XHRcdFx0XHRtZW51c1dpdGhUaXRsZXMucHVzaCh7IGlkOiBtZW51LmlkLCBpdGVtOiB7IC4uLm1lbnUsIGNvbW1hbmQ6IHsgaWQ6IGV4dGVuc2lvbkFjdGlvbk9wdGlvbnMuaWQsIHRpdGxlOiBtZW51VGl0bGUgfSB9IH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG1lbnVzV2l0aE91dFRpdGxlcy5wdXNoKG1lbnUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1lbnVzV2l0aE91dFRpdGxlcyA9IG1lbnVzO1xuXHRcdH1cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdC4uLmV4dGVuc2lvbkFjdGlvbk9wdGlvbnMsXG5cdFx0XHRcdFx0bWVudTogbWVudXNXaXRoT3V0VGl0bGVzXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPGFueT4ge1xuXHRcdFx0XHRyZXR1cm4gZXh0ZW5zaW9uQWN0aW9uT3B0aW9ucy5ydW4oYWNjZXNzb3IsIC4uLmFyZ3MpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRpZiAobWVudXNXaXRoVGl0bGVzLmxlbmd0aCkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbXMobWVudXNXaXRoVGl0bGVzKSk7XG5cdFx0fVxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG59XG5cbmNsYXNzIEV4dGVuc2lvblN0b3JhZ2VDbGVhbmVyIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0RXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UucmVtb3ZlT3V0ZGF0ZWRFeHRlbnNpb25WZXJzaW9ucyhleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXHR9XG59XG5cbmNsYXNzIFRydXN0ZWRQdWJsaXNoZXJzSW5pdGlhbGl6ZXIgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCB0cnVzdGVkUHVibGlzaGVyc0luaXRTdGF0dXNLZXkgPSAndHJ1c3RlZC1wdWJsaXNoZXJzLWluaXQtbWlncmF0aW9uJztcblx0XHRpZiAoIXN0b3JhZ2VTZXJ2aWNlLmdldCh0cnVzdGVkUHVibGlzaGVyc0luaXRTdGF0dXNLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikpIHtcblx0XHRcdGZvciAoY29uc3QgcHJvZmlsZSBvZiB1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcykge1xuXHRcdFx0XHRleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoRXh0ZW5zaW9uVHlwZS5Vc2VyLCBwcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSlcblx0XHRcdFx0XHQudGhlbihhc3luYyBleHRlbnNpb25zID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHRydXN0ZWRQdWJsaXNoZXJzID0gbmV3IE1hcDxzdHJpbmcsIElQdWJsaXNoZXJJbmZvPigpO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdFx0XHRpZiAoIWV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHB1Ymxpc2hlciA9IGV4dGVuc2lvbi5tYW5pZmVzdC5wdWJsaXNoZXIudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0XHRcdFx0aWYgKHByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRFeHRlbnNpb25QdWJsaXNoZXJzPy5pbmNsdWRlcyhwdWJsaXNoZXIpXG5cdFx0XHRcdFx0XHRcdFx0fHwgKGV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZSAmJiBwcm9kdWN0U2VydmljZS50cnVzdGVkRXh0ZW5zaW9uUHVibGlzaGVycz8uaW5jbHVkZXMoZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lLnRvTG93ZXJDYXNlKCkpKSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHRydXN0ZWRQdWJsaXNoZXJzLnNldChwdWJsaXNoZXIsIHsgcHVibGlzaGVyLCBwdWJsaXNoZXJEaXNwbGF5TmFtZTogZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHRydXN0ZWRQdWJsaXNoZXJzLnNpemUpIHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudHJ1c3RQdWJsaXNoZXJzKC4uLnRydXN0ZWRQdWJsaXNoZXJzLnZhbHVlcygpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHRydXN0ZWRQdWJsaXNoZXJzSW5pdFN0YXR1c0tleSwgJ3RydWUnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEV4dGVuc2lvblRvb2xzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdleHRlbnNpb25zLmNoYXQudG9vbHNDb250cmlidXRpb24nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB0b29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBzZWFyY2hFeHRlbnNpb25zVG9vbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaEV4dGVuc2lvbnNUb29sKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sKFNlYXJjaEV4dGVuc2lvbnNUb29sRGF0YSwgc2VhcmNoRXh0ZW5zaW9uc1Rvb2wpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b29sc1NlcnZpY2UudnNjb2RlVG9vbFNldC5hZGRUb29sKFNlYXJjaEV4dGVuc2lvbnNUb29sRGF0YSkpO1xuXHR9XG59XG5cbmNvbnN0IHdvcmtiZW5jaFJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpO1xud29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oRXh0ZW5zaW9uc0NvbnRyaWJ1dGlvbnMsIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcbndvcmtiZW5jaFJlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFN0YXR1c1VwZGF0ZXIsIExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xud29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oTWFsaWNpb3VzRXh0ZW5zaW9uQ2hlY2tlciwgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihLZXltYXBFeHRlbnNpb25zLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihFeHRlbnNpb25zVmlld2xldFZpZXdzQ29udHJpYnV0aW9uLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihFeHRlbnNpb25BY3RpdmF0aW9uUHJvZ3Jlc3MsIExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xud29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oRXh0ZW5zaW9uRGVwZW5kZW5jeUNoZWNrZXIsIExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xud29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oRXh0ZW5zaW9uRW5hYmxlbWVudFdvcmtzcGFjZVRydXN0VHJhbnNpdGlvblBhcnRpY2lwYW50LCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihFeHRlbnNpb25zQ29tcGxldGlvbkl0ZW1zUHJvdmlkZXIsIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcbndvcmtiZW5jaFJlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKEV4dGVuc2lvbkVuYWJsZW1lbnRDb250ZXh0S2V5c0NvbnRyaWJ1dGlvbiwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xud29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oVW5zdXBwb3J0ZWRFeHRlbnNpb25zTWlncmF0aW9uQ29udHJpYiwgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihUcnVzdGVkUHVibGlzaGVyc0luaXRpYWxpemVyLCBMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KTtcbndvcmtiZW5jaFJlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKEV4dGVuc2lvbk1hcmtldHBsYWNlU3RhdHVzVXBkYXRlciwgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG5pZiAoaXNXZWIpIHtcblx0d29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oRXh0ZW5zaW9uU3RvcmFnZUNsZWFuZXIsIExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoRXh0ZW5zaW9uVG9vbHNDb250cmlidXRpb24uSUQsIEV4dGVuc2lvblRvb2xzQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEV4dGVuc2lvbnNHYWxsZXJ5U2lnbkluQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9ucy5nYWxsZXJ5LnNpZ25JbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaWduSW5Ub01hcmtldHBsYWNlJywgJ1NpZ24gaW4gdG8gYWNjZXNzIEV4dGVuc2lvbnMgTWFya2V0cGxhY2UnKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5BY2NvdW50c0NvbnRleHQsXG5cdFx0XHRcdHdoZW46IENPTlRFWFRfRVhURU5TSU9OU19HQUxMRVJZX1NUQVRVUy5pc0VxdWFsVG8oRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U3RhdHVzLlJlcXVpcmVzU2lnbkluKVxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoREVGQVVMVF9BQ0NPVU5UX1NJR05fSU5fQ09NTUFORCk7XG5cdH1cbn0pO1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uTWlncmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uTWlncmF0aW9uKVxuXHQucmVnaXN0ZXJDb25maWd1cmF0aW9uTWlncmF0aW9ucyhbe1xuXHRcdGtleTogQXV0b1VwZGF0ZUNvbmZpZ3VyYXRpb25LZXksXG5cdFx0LyoqXG5cdFx0ICogTWlncmF0ZXMgdGhlIGBleHRlbnNpb25zLmF1dG9VcGRhdGVgIHNldHRpbmcgdG8gaXRzIG5ldyBgJ29uJyB8ICdvZmYnYCB2YWx1ZXMuXG5cdFx0ICpcblx0XHQgKiBUaGUgc2V0dGluZyBwcmV2aW91c2x5IHN1cHBvcnRlZCBzZXZlcmFsIHZhbHVlcyB0aGF0IGFyZSBub3cgcmV0aXJlZDpcblx0XHQgKiAtIGB0cnVlYCAoQWxsIEV4dGVuc2lvbnMpIGFuZCBgJ29ubHlFbmFibGVkRXh0ZW5zaW9ucydgIChPbmx5IEVuYWJsZWQgRXh0ZW5zaW9ucylcblx0XHQgKiAgIGFyZSBmb2xkZWQgaW50byB0aGUgbmV3IGAnb24nYCB2YWx1ZSwgYWxvbmcgd2l0aCB0aGUgaW5zaWRlcnMtb25seSBgJ2RlbGF5ZWQnYCB2YWx1ZS5cblx0XHQgKiAtIGBmYWxzZWAgKE5vbmUpIGFuZCB0aGUgaW50ZXJuYWwgYCdvbmx5U2VsZWN0ZWRFeHRlbnNpb25zJ2AgdmFsdWUgbWFwIHRvIGAnb2ZmJ2AuXG5cdFx0ICogICBJbiBgJ29mZidgIG1vZGUsIGV4dGVuc2lvbnMgZXhwbGljaXRseSBvcHRlZCBpbiBwZXItZXh0ZW5zaW9uIGFyZSBzdGlsbCBhdXRvLXVwZGF0ZWQsXG5cdFx0ICogICB3aGljaCBwcmVzZXJ2ZXMgdGhlIGAnb25seVNlbGVjdGVkRXh0ZW5zaW9ucydgIGJlaGF2aW9yLlxuXHRcdCAqXG5cdFx0ICogUmV0dXJuaW5nIGBbXWAgaXMgYSBuby1vcCwgdXNlZCB3aGVuIHRoZSB2YWx1ZSBpcyBhbHJlYWR5IGluIHRoZSBuZXcgZm9ybWF0XG5cdFx0ICogKGAnb24nYC9gJ29mZidgKSBvciB1bnNldC5cblx0XHQgKi9cblx0XHRtaWdyYXRlRm46ICh2YWx1ZSwgYWNjZXNzb3IpID0+IHtcblx0XHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSAnb24nIHx8IHZhbHVlID09PSAnb2ZmJykge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRpZiAodmFsdWUgPT09IGZhbHNlIHx8IHZhbHVlID09PSAnb25seVNlbGVjdGVkRXh0ZW5zaW9ucycpIHtcblx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6ICdvZmYnIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyB2YWx1ZTogJ29uJyB9O1xuXHRcdH1cblx0fV0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsVUFBVSxhQUFhO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBMEI7QUFFbkMsU0FBUyxZQUFZLFdBQVcsbUJBQW1CO0FBQ25ELFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFxQyxRQUFRLGNBQWMsdUJBQXVCO0FBQzNGLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCLHVCQUF1QjtBQUNsRCxTQUFTLGNBQWMseUJBQXlCLDBCQUFrRDtBQUNsRyxTQUFTLGdCQUFnQixvQkFBb0IscUJBQXFCO0FBQ2xFLFNBQVMsZ0JBQWdCLDBCQUEwQjtBQUNuRCxTQUFTLGdDQUFnQyw4QkFBOEIscUNBQXFDLHdDQUFtRSx3Q0FBd0M7QUFDdk4sU0FBUyxrQ0FBa0Msd0JBQXdCLG1DQUFtQywwQkFBMEIsWUFBWSwwQkFBMEIsNkJBQTZCLDJCQUEyQixRQUFRLHlDQUF5QztBQUMvUSxTQUFTLG1CQUFtQix1QkFBdUI7QUFDbkQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxtREFBbUQ7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
