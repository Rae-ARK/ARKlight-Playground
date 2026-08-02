import * as nls from "../../../../nls.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import Severity from "../../../../base/common/severity.js";
import { EXTENSION_IDENTIFIER_PATTERN } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { Extensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EXTENSION_CATEGORIES, ExtensionIdentifierSet } from "../../../../platform/extensions/common/extensions.js";
import { productSchemaId } from "../../../../platform/product/common/productService.js";
import { ImplicitActivationEvents } from "../../../../platform/extensionManagement/common/implicitActivationEvents.js";
import { allApiProposals } from "../../../../platform/extensions/common/extensionsApiProposals.js";
const schemaRegistry = Registry.as(Extensions.JSONContribution);
class ExtensionMessageCollector {
  constructor(messageHandler, extension, extensionPointId) {
    this._messageHandler = messageHandler;
    this._extension = extension;
    this._extensionPointId = extensionPointId;
  }
  _msg(type, message) {
    this._messageHandler({
      type,
      message,
      extensionId: this._extension.identifier,
      extensionPointId: this._extensionPointId
    });
  }
  error(message) {
    this._msg(Severity.Error, message);
  }
  warn(message) {
    this._msg(Severity.Warning, message);
  }
  info(message) {
    this._msg(Severity.Info, message);
  }
}
class ExtensionPointUserDelta {
  constructor(added, removed) {
    this.added = added;
    this.removed = removed;
  }
  static _toSet(arr) {
    const result = new ExtensionIdentifierSet();
    for (let i = 0, len = arr.length; i < len; i++) {
      result.add(arr[i].description.identifier);
    }
    return result;
  }
  static compute(previous, current) {
    if (!previous || !previous.length) {
      return new ExtensionPointUserDelta(current, []);
    }
    if (!current || !current.length) {
      return new ExtensionPointUserDelta([], previous);
    }
    const previousSet = this._toSet(previous);
    const currentSet = this._toSet(current);
    const added = current.filter((user) => !previousSet.has(user.description.identifier));
    const removed = previous.filter((user) => !currentSet.has(user.description.identifier));
    return new ExtensionPointUserDelta(added, removed);
  }
}
class ExtensionPoint {
  constructor(name, defaultExtensionKind, canHandleResolver) {
    this.name = name;
    this.defaultExtensionKind = defaultExtensionKind;
    this.canHandleResolver = canHandleResolver;
    this._handler = null;
    this._users = null;
    this._delta = null;
  }
  setHandler(handler) {
    if (this._handler !== null) {
      throw new Error("Handler already set!");
    }
    this._handler = handler;
    this._handle();
    return {
      dispose: () => {
        this._handler = null;
      }
    };
  }
  acceptUsers(users) {
    this._delta = ExtensionPointUserDelta.compute(this._users, users);
    this._users = users;
    this._handle();
  }
  _handle() {
    if (this._handler === null || this._users === null || this._delta === null) {
      return;
    }
    try {
      this._handler(this._users, this._delta);
    } catch (err) {
      onUnexpectedError(err);
    }
  }
}
const extensionKindSchema = {
  type: "string",
  enum: [
    "ui",
    "workspace"
  ],
  enumDescriptions: [
    nls.localize("ui", "UI extension kind. In a remote window, such extensions are enabled only when available on the local machine."),
    nls.localize("workspace", "Workspace extension kind. In a remote window, such extensions are enabled only when available on the remote.")
  ]
};
const schemaId = "vscode://schemas/vscode-extensions";
const schema = {
  properties: {
    engines: {
      type: "object",
      description: nls.localize("vscode.extension.engines", "Engine compatibility."),
      properties: {
        "vscode": {
          type: "string",
          description: nls.localize("vscode.extension.engines.vscode", "For VS Code extensions, specifies the VS Code version that the extension is compatible with. Cannot be *. For example: ^1.105.0 indicates compatibility with a minimum VS Code version of 1.105.0."),
          default: "^1.105.0"
        }
      }
    },
    publisher: {
      description: nls.localize("vscode.extension.publisher", "The publisher of the VS Code extension."),
      type: "string"
    },
    displayName: {
      description: nls.localize("vscode.extension.displayName", "The display name for the extension used in the VS Code gallery."),
      type: "string"
    },
    categories: {
      description: nls.localize("vscode.extension.categories", "The categories used by the VS Code gallery to categorize the extension."),
      type: "array",
      uniqueItems: true,
      items: {
        oneOf: [
          {
            type: "string",
            enum: EXTENSION_CATEGORIES
          },
          {
            type: "string",
            const: "Languages",
            deprecationMessage: nls.localize("vscode.extension.category.languages.deprecated", "Use 'Programming  Languages' instead")
          }
        ]
      }
    },
    galleryBanner: {
      type: "object",
      description: nls.localize("vscode.extension.galleryBanner", "Banner used in the VS Code marketplace."),
      properties: {
        color: {
          description: nls.localize("vscode.extension.galleryBanner.color", "The banner color on the VS Code marketplace page header."),
          type: "string"
        },
        theme: {
          description: nls.localize("vscode.extension.galleryBanner.theme", "The color theme for the font used in the banner."),
          type: "string",
          enum: ["dark", "light"]
        }
      }
    },
    contributes: {
      description: nls.localize("vscode.extension.contributes", "All contributions of the VS Code extension represented by this package."),
      type: "object",
      // eslint-disable-next-line local/code-no-any-casts
      properties: {
        // extensions will fill in
      },
      default: {}
    },
    preview: {
      type: "boolean",
      description: nls.localize("vscode.extension.preview", "Sets the extension to be flagged as a Preview in the Marketplace.")
    },
    enableProposedApi: {
      type: "boolean",
      deprecationMessage: nls.localize("vscode.extension.enableProposedApi.deprecated", "Use `enabledApiProposals` instead.")
    },
    enabledApiProposals: {
      markdownDescription: nls.localize("vscode.extension.enabledApiProposals", "Enable API proposals to try them out. Only valid **during development**. Extensions **cannot be published** with this property. For more details visit: https://code.visualstudio.com/api/advanced-topics/using-proposed-api"),
      type: "array",
      uniqueItems: true,
      items: {
        type: "string",
        enum: Object.keys(allApiProposals).map((proposalName) => proposalName),
        markdownEnumDescriptions: Object.values(allApiProposals).map((value) => value.proposal)
      }
    },
    api: {
      markdownDescription: nls.localize("vscode.extension.api", "Describe the API provided by this extension. For more details visit: https://code.visualstudio.com/api/advanced-topics/remote-extensions#handling-dependencies-with-remote-extensions"),
      type: "string",
      enum: ["none"],
      enumDescriptions: [
        nls.localize("vscode.extension.api.none", "Give up entirely the ability to export any APIs. This allows other extensions that depend on this extension to run in a separate extension host process or in a remote machine.")
      ]
    },
    activationEvents: {
      description: nls.localize("vscode.extension.activationEvents", "Activation events for the VS Code extension."),
      type: "array",
      items: {
        type: "string",
        defaultSnippets: [
          {
            label: "onWebviewPanel",
            description: nls.localize("vscode.extension.activationEvents.onWebviewPanel", "An activation event emitted when a webview is loaded of a certain viewType"),
            body: "onWebviewPanel:viewType"
          },
          {
            label: "onLanguage",
            description: nls.localize("vscode.extension.activationEvents.onLanguage", "An activation event emitted whenever a file that resolves to the specified language gets opened."),
            body: "onLanguage:${1:languageId}"
          },
          {
            label: "onCommand",
            description: nls.localize("vscode.extension.activationEvents.onCommand", "An activation event emitted whenever the specified command gets invoked."),
            body: "onCommand:${2:commandId}"
          },
          {
            label: "onDebug",
            description: nls.localize("vscode.extension.activationEvents.onDebug", "An activation event emitted whenever a user is about to start debugging or about to setup debug configurations."),
            body: "onDebug"
          },
          {
            label: "onDebugInitialConfigurations",
            description: nls.localize("vscode.extension.activationEvents.onDebugInitialConfigurations", 'An activation event emitted whenever a "launch.json" needs to be created (and all provideDebugConfigurations methods need to be called).'),
            body: "onDebugInitialConfigurations"
          },
          {
            label: "onDebugDynamicConfigurations",
            description: nls.localize("vscode.extension.activationEvents.onDebugDynamicConfigurations", 'An activation event emitted whenever a list of all debug configurations needs to be created (and all provideDebugConfigurations methods for the "dynamic" scope need to be called).'),
            body: "onDebugDynamicConfigurations"
          },
          {
            label: "onDebugResolve",
            description: nls.localize("vscode.extension.activationEvents.onDebugResolve", "An activation event emitted whenever a debug session with the specific type is about to be launched (and a corresponding resolveDebugConfiguration method needs to be called)."),
            body: "onDebugResolve:${6:type}"
          },
          {
            label: "onDebugAdapterProtocolTracker",
            description: nls.localize("vscode.extension.activationEvents.onDebugAdapterProtocolTracker", "An activation event emitted whenever a debug session with the specific type is about to be launched and a debug protocol tracker might be needed."),
            body: "onDebugAdapterProtocolTracker:${6:type}"
          },
          {
            label: "workspaceContains",
            description: nls.localize("vscode.extension.activationEvents.workspaceContains", "An activation event emitted whenever a folder is opened that contains at least a file matching the specified glob pattern."),
            body: "workspaceContains:${4:filePattern}"
          },
          {
            label: "onStartupFinished",
            description: nls.localize("vscode.extension.activationEvents.onStartupFinished", "An activation event emitted after the start-up finished (after all `*` activated extensions have finished activating)."),
            body: "onStartupFinished"
          },
          {
            label: "onTaskType",
            description: nls.localize("vscode.extension.activationEvents.onTaskType", "An activation event emitted whenever tasks of a certain type need to be listed or resolved."),
            body: "onTaskType:${1:taskType}"
          },
          {
            label: "onFileSystem",
            description: nls.localize("vscode.extension.activationEvents.onFileSystem", "An activation event emitted whenever a file or folder is accessed with the given scheme."),
            body: "onFileSystem:${1:scheme}"
          },
          {
            label: "onEditSession",
            description: nls.localize("vscode.extension.activationEvents.onEditSession", "An activation event emitted whenever an edit session is accessed with the given scheme."),
            body: "onEditSession:${1:scheme}"
          },
          {
            label: "onSearch",
            description: nls.localize("vscode.extension.activationEvents.onSearch", "An activation event emitted whenever a search is started in the folder with the given scheme."),
            body: "onSearch:${7:scheme}"
          },
          {
            label: "onView",
            body: "onView:${5:viewId}",
            description: nls.localize("vscode.extension.activationEvents.onView", "An activation event emitted whenever the specified view is expanded.")
          },
          {
            label: "onUri",
            body: "onUri",
            description: nls.localize("vscode.extension.activationEvents.onUri", "An activation event emitted whenever a system-wide Uri directed towards this extension is open.")
          },
          {
            label: "onOpenExternalUri",
            body: "onOpenExternalUri",
            description: nls.localize("vscode.extension.activationEvents.onOpenExternalUri", "An activation event emitted whenever a external uri (such as an http or https link) is being opened.")
          },
          {
            label: "onCustomEditor",
            body: "onCustomEditor:${9:viewType}",
            description: nls.localize("vscode.extension.activationEvents.onCustomEditor", "An activation event emitted whenever the specified custom editor becomes visible.")
          },
          {
            label: "onNotebook",
            body: "onNotebook:${1:type}",
            description: nls.localize("vscode.extension.activationEvents.onNotebook", "An activation event emitted whenever the specified notebook document is opened.")
          },
          {
            label: "onAuthenticationRequest",
            body: "onAuthenticationRequest:${11:authenticationProviderId}",
            description: nls.localize("vscode.extension.activationEvents.onAuthenticationRequest", "An activation event emitted whenever sessions are requested from the specified authentication provider.")
          },
          {
            label: "onRenderer",
            description: nls.localize("vscode.extension.activationEvents.onRenderer", "An activation event emitted whenever a notebook output renderer is used."),
            body: "onRenderer:${11:rendererId}"
          },
          {
            label: "onTerminalProfile",
            body: "onTerminalProfile:${1:terminalId}",
            description: nls.localize("vscode.extension.activationEvents.onTerminalProfile", "An activation event emitted when a specific terminal profile is launched.")
          },
          {
            label: "onTerminalQuickFixRequest",
            body: "onTerminalQuickFixRequest:${1:quickFixId}",
            description: nls.localize("vscode.extension.activationEvents.onTerminalQuickFixRequest", "An activation event emitted when a command matches the selector associated with this ID")
          },
          {
            label: "onWalkthrough",
            body: "onWalkthrough:${1:walkthroughID}",
            description: nls.localize("vscode.extension.activationEvents.onWalkthrough", "An activation event emitted when a specified walkthrough is opened.")
          },
          {
            label: "onIssueReporterOpened",
            body: "onIssueReporterOpened",
            description: nls.localize("vscode.extension.activationEvents.onIssueReporterOpened", "An activation event emitted when the issue reporter is opened.")
          },
          {
            label: "onChatParticipant",
            body: "onChatParticipant:${1:participantId}",
            description: nls.localize("vscode.extension.activationEvents.onChatParticipant", "An activation event emitted when the specified chat participant is invoked.")
          },
          {
            label: "onChatContextProvider",
            body: "onChatContextProvider:${1:contextProviderId}",
            description: nls.localize("vscode.extension.activationEvents.onChatContextProvider", "An activation event emitted when the specified chat context provider is invoked.")
          },
          {
            label: "onLanguageModelChatProvider",
            body: "onLanguageModelChatProvider:${1:vendor}",
            description: nls.localize("vscode.extension.activationEvents.onLanguageModelChatProvider", "An activation event emitted when a chat model provider for the given vendor is requested.")
          },
          {
            label: "onLanguageModelTool",
            body: "onLanguageModelTool:${1:toolId}",
            description: nls.localize("vscode.extension.activationEvents.onLanguageModelTool", "An activation event emitted when the specified language model tool is invoked.")
          },
          {
            label: "onTerminal",
            body: "onTerminal:{1:shellType}",
            description: nls.localize("vscode.extension.activationEvents.onTerminal", "An activation event emitted when a terminal of the given shell type is opened.")
          },
          {
            label: "onTerminalShellIntegration",
            body: "onTerminalShellIntegration:${1:shellType}",
            description: nls.localize("vscode.extension.activationEvents.onTerminalShellIntegration", "An activation event emitted when terminal shell integration is activated for the given shell type.")
          },
          {
            label: "onMcpCollection",
            description: nls.localize("vscode.extension.activationEvents.onMcpCollection", "An activation event emitted whenever a tool from the MCP server is requested."),
            body: "onMcpCollection:${2:collectionId}"
          },
          {
            label: "*",
            description: nls.localize("vscode.extension.activationEvents.star", "An activation event emitted on VS Code startup. To ensure a great end user experience, please use this activation event in your extension only when no other activation events combination works in your use-case."),
            body: "*"
          }
        ]
      }
    },
    badges: {
      type: "array",
      description: nls.localize("vscode.extension.badges", "Array of badges to display in the sidebar of the Marketplace's extension page."),
      items: {
        type: "object",
        required: ["url", "href", "description"],
        properties: {
          url: {
            type: "string",
            description: nls.localize("vscode.extension.badges.url", "Badge image URL.")
          },
          href: {
            type: "string",
            description: nls.localize("vscode.extension.badges.href", "Badge link.")
          },
          description: {
            type: "string",
            description: nls.localize("vscode.extension.badges.description", "Badge description.")
          }
        }
      }
    },
    markdown: {
      type: "string",
      description: nls.localize("vscode.extension.markdown", "Controls the Markdown rendering engine used in the Marketplace. Either github (default) or standard."),
      enum: ["github", "standard"],
      default: "github"
    },
    qna: {
      default: "marketplace",
      description: nls.localize("vscode.extension.qna", "Controls the Q&A link in the Marketplace. Set to marketplace to enable the default Marketplace Q & A site. Set to a string to provide the URL of a custom Q & A site. Set to false to disable Q & A altogether."),
      anyOf: [
        {
          type: ["string", "boolean"],
          enum: ["marketplace", false]
        },
        {
          type: "string"
        }
      ]
    },
    extensionDependencies: {
      description: nls.localize("vscode.extension.extensionDependencies", "Dependencies to other extensions. The identifier of an extension is always ${publisher}.${name}. For example: vscode.csharp."),
      type: "array",
      uniqueItems: true,
      items: {
        type: "string",
        pattern: EXTENSION_IDENTIFIER_PATTERN
      }
    },
    extensionAffinity: {
      description: nls.localize("vscode.extension.extensionAffinity", "Extensions that this extension should be colocated with in the same extension host process if possible. The identifier of an extension is always ${publisher}.${name}. For example: vscode.git."),
      type: "array",
      uniqueItems: true,
      items: {
        type: "string",
        pattern: EXTENSION_IDENTIFIER_PATTERN
      }
    },
    extensionPack: {
      description: nls.localize("vscode.extension.contributes.extensionPack", "A set of extensions that can be installed together. The identifier of an extension is always ${publisher}.${name}. For example: vscode.csharp."),
      type: "array",
      uniqueItems: true,
      items: {
        type: "string",
        pattern: EXTENSION_IDENTIFIER_PATTERN
      }
    },
    extensionKind: {
      description: nls.localize("extensionKind", "Define the kind of an extension. `ui` extensions are installed and run on the local machine while `workspace` extensions run on the remote."),
      type: "array",
      items: extensionKindSchema,
      default: ["workspace"],
      defaultSnippets: [
        {
          body: ["ui"],
          description: nls.localize("extensionKind.ui", "Define an extension which can run only on the local machine when connected to remote window.")
        },
        {
          body: ["workspace"],
          description: nls.localize("extensionKind.workspace", "Define an extension which can run only on the remote machine when connected remote window.")
        },
        {
          body: ["ui", "workspace"],
          description: nls.localize("extensionKind.ui-workspace", "Define an extension which can run on either side, with a preference towards running on the local machine.")
        },
        {
          body: ["workspace", "ui"],
          description: nls.localize("extensionKind.workspace-ui", "Define an extension which can run on either side, with a preference towards running on the remote machine.")
        },
        {
          body: [],
          description: nls.localize("extensionKind.empty", "Define an extension which cannot run in a remote context, neither on the local, nor on the remote machine.")
        }
      ]
    },
    capabilities: {
      description: nls.localize("vscode.extension.capabilities", "Declare the set of supported capabilities by the extension."),
      type: "object",
      properties: {
        virtualWorkspaces: {
          description: nls.localize("vscode.extension.capabilities.virtualWorkspaces", "Declares whether the extension should be enabled in virtual workspaces. A virtual workspace is a workspace which is not backed by any on-disk resources. When false, this extension will be automatically disabled in virtual workspaces. Default is true."),
          type: ["boolean", "object"],
          defaultSnippets: [
            { label: "limited", body: { supported: "${1:limited}", description: "${2}" } },
            { label: "false", body: { supported: false, description: "${2}" } }
          ],
          default: true.valueOf,
          properties: {
            supported: {
              markdownDescription: nls.localize("vscode.extension.capabilities.virtualWorkspaces.supported", "Declares the level of support for virtual workspaces by the extension."),
              type: ["string", "boolean"],
              enum: ["limited", true, false],
              enumDescriptions: [
                nls.localize("vscode.extension.capabilities.virtualWorkspaces.supported.limited", "The extension will be enabled in virtual workspaces with some functionality disabled."),
                nls.localize("vscode.extension.capabilities.virtualWorkspaces.supported.true", "The extension will be enabled in virtual workspaces with all functionality enabled."),
                nls.localize("vscode.extension.capabilities.virtualWorkspaces.supported.false", "The extension will not be enabled in virtual workspaces.")
              ]
            },
            description: {
              type: "string",
              markdownDescription: nls.localize("vscode.extension.capabilities.virtualWorkspaces.description", "A description of how virtual workspaces affects the extensions behavior and why it is needed. This only applies when `supported` is not `true`.")
            }
          }
        },
        untrustedWorkspaces: {
          description: nls.localize("vscode.extension.capabilities.untrustedWorkspaces", "Declares how the extension should be handled in untrusted workspaces."),
          type: "object",
          required: ["supported"],
          defaultSnippets: [
            { body: { supported: "${1:limited}", description: "${2}" } }
          ],
          properties: {
            supported: {
              markdownDescription: nls.localize("vscode.extension.capabilities.untrustedWorkspaces.supported", "Declares the level of support for untrusted workspaces by the extension."),
              type: ["string", "boolean"],
              enum: ["limited", true, false],
              enumDescriptions: [
                nls.localize("vscode.extension.capabilities.untrustedWorkspaces.supported.limited", "The extension will be enabled in untrusted workspaces with some functionality disabled."),
                nls.localize("vscode.extension.capabilities.untrustedWorkspaces.supported.true", "The extension will be enabled in untrusted workspaces with all functionality enabled."),
                nls.localize("vscode.extension.capabilities.untrustedWorkspaces.supported.false", "The extension will not be enabled in untrusted workspaces.")
              ]
            },
            restrictedConfigurations: {
              description: nls.localize("vscode.extension.capabilities.untrustedWorkspaces.restrictedConfigurations", "A list of configuration keys contributed by the extension that should not use workspace values in untrusted workspaces."),
              type: "array",
              items: {
                type: "string"
              }
            },
            description: {
              type: "string",
              markdownDescription: nls.localize("vscode.extension.capabilities.untrustedWorkspaces.description", "A description of how workspace trust affects the extensions behavior and why it is needed. This only applies when `supported` is not `true`.")
            }
          }
        }
      }
    },
    sponsor: {
      description: nls.localize("vscode.extension.contributes.sponsor", "Specify the location from where users can sponsor your extension."),
      type: "object",
      defaultSnippets: [
        { body: { url: "${1:https:}" } }
      ],
      properties: {
        "url": {
          description: nls.localize("vscode.extension.contributes.sponsor.url", "URL from where users can sponsor your extension. It must be a valid URL with a HTTP or HTTPS protocol. Example value: https://github.com/sponsors/nvaccess"),
          type: "string"
        }
      }
    },
    scripts: {
      type: "object",
      properties: {
        "vscode:prepublish": {
          description: nls.localize("vscode.extension.scripts.prepublish", "Script executed before the package is published as a VS Code extension."),
          type: "string"
        },
        "vscode:uninstall": {
          description: nls.localize("vscode.extension.scripts.uninstall", "Uninstall hook for VS Code extension. Script that gets executed when the extension is completely uninstalled from VS Code which is when VS Code is restarted (shutdown and start) after the extension is uninstalled. Only Node scripts are supported."),
          type: "string"
        }
      }
    },
    icon: {
      type: "string",
      description: nls.localize("vscode.extension.icon", "The path to a 128x128 pixel icon.")
    },
    l10n: {
      type: "string",
      description: nls.localize({
        key: "vscode.extension.l10n",
        comment: [
          '{Locked="bundle.l10n._locale_.json"}',
          '{Locked="vscode.l10n API"}'
        ]
      }, "The relative path to a folder containing localization (bundle.l10n.*.json) files. Must be specified if you are using the vscode.l10n API.")
    },
    pricing: {
      type: "string",
      markdownDescription: nls.localize("vscode.extension.pricing", "The pricing information for the extension. Can be Free (default) or Trial. For more details visit: https://code.visualstudio.com/api/working-with-extensions/publishing-extension#extension-pricing-label"),
      enum: ["Free", "Trial"],
      default: "Free"
    }
  }
};
class ExtensionsRegistryImpl {
  constructor() {
    this._extensionPoints = /* @__PURE__ */ new Map();
  }
  registerExtensionPoint(desc) {
    if (this._extensionPoints.has(desc.extensionPoint)) {
      throw new Error("Duplicate extension point: " + desc.extensionPoint);
    }
    const result = new ExtensionPoint(desc.extensionPoint, desc.defaultExtensionKind, desc.canHandleResolver);
    this._extensionPoints.set(desc.extensionPoint, result);
    if (desc.activationEventsGenerator) {
      ImplicitActivationEvents.register(desc.extensionPoint, desc.activationEventsGenerator);
    }
    schema.properties["contributes"].properties[desc.extensionPoint] = desc.jsonSchema;
    schemaRegistry.registerSchema(schemaId, schema);
    return result;
  }
  getExtensionPoints() {
    return Array.from(this._extensionPoints.values());
  }
}
const PRExtensions = {
  ExtensionsRegistry: "ExtensionsRegistry"
};
Registry.add(PRExtensions.ExtensionsRegistry, new ExtensionsRegistryImpl());
const ExtensionsRegistry = Registry.as(PRExtensions.ExtensionsRegistry);
schemaRegistry.registerSchema(schemaId, schema);
schemaRegistry.registerSchema(productSchemaId, {
  properties: {
    extensionEnabledApiProposals: {
      description: nls.localize("product.extensionEnabledApiProposals", "API proposals that the respective extensions can freely use."),
      type: "object",
      properties: {},
      additionalProperties: {
        anyOf: [{
          type: "array",
          uniqueItems: true,
          items: {
            type: "string",
            enum: Object.keys(allApiProposals),
            markdownEnumDescriptions: Object.values(allApiProposals).map((value) => value.proposal)
          }
        }]
      }
    }
  }
});
export {
  ExtensionMessageCollector,
  ExtensionPoint,
  ExtensionPointUserDelta,
  ExtensionsRegistry,
  ExtensionsRegistryImpl,
  schema
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgRVhURU5TSU9OX0lERU5USUZJRVJfUEFUVEVSTiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSU1lc3NhZ2UgfSBmcm9tICcuL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBFWFRFTlNJT05fQ0FURUdPUklFUywgRXh0ZW5zaW9uSWRlbnRpZmllclNldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBwcm9kdWN0U2NoZW1hSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbXBsaWNpdEFjdGl2YXRpb25FdmVudHMsIElBY3RpdmF0aW9uRXZlbnRzR2VuZXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vaW1wbGljaXRBY3RpdmF0aW9uRXZlbnRzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGFsbEFwaVByb3Bvc2FscyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNBcGlQcm9wb3NhbHMuanMnO1xuXG5jb25zdCBzY2hlbWFSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlSGFuZGxlcjogKG1zZzogSU1lc3NhZ2UpID0+IHZvaWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25Qb2ludElkOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bWVzc2FnZUhhbmRsZXI6IChtc2c6IElNZXNzYWdlKSA9PiB2b2lkLFxuXHRcdGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdGV4dGVuc2lvblBvaW50SWQ6IHN0cmluZ1xuXHQpIHtcblx0XHR0aGlzLl9tZXNzYWdlSGFuZGxlciA9IG1lc3NhZ2VIYW5kbGVyO1xuXHRcdHRoaXMuX2V4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHR0aGlzLl9leHRlbnNpb25Qb2ludElkID0gZXh0ZW5zaW9uUG9pbnRJZDtcblx0fVxuXG5cdHByaXZhdGUgX21zZyh0eXBlOiBTZXZlcml0eSwgbWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbWVzc2FnZUhhbmRsZXIoe1xuXHRcdFx0dHlwZTogdHlwZSxcblx0XHRcdG1lc3NhZ2U6IG1lc3NhZ2UsXG5cdFx0XHRleHRlbnNpb25JZDogdGhpcy5fZXh0ZW5zaW9uLmlkZW50aWZpZXIsXG5cdFx0XHRleHRlbnNpb25Qb2ludElkOiB0aGlzLl9leHRlbnNpb25Qb2ludElkXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZXJyb3IobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbXNnKFNldmVyaXR5LkVycm9yLCBtZXNzYWdlKTtcblx0fVxuXG5cdHB1YmxpYyB3YXJuKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX21zZyhTZXZlcml0eS5XYXJuaW5nLCBtZXNzYWdlKTtcblx0fVxuXG5cdHB1YmxpYyBpbmZvKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX21zZyhTZXZlcml0eS5JbmZvLCBtZXNzYWdlKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25Qb2ludFVzZXI8VD4ge1xuXHRkZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXHR2YWx1ZTogVDtcblx0Y29sbGVjdG9yOiBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yO1xufVxuXG5leHBvcnQgdHlwZSBJRXh0ZW5zaW9uUG9pbnRIYW5kbGVyPFQ+ID0gKGV4dGVuc2lvbnM6IHJlYWRvbmx5IElFeHRlbnNpb25Qb2ludFVzZXI8VD5bXSwgZGVsdGE6IEV4dGVuc2lvblBvaW50VXNlckRlbHRhPFQ+KSA9PiB2b2lkO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25Qb2ludDxUPiB7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0c2V0SGFuZGxlcihoYW5kbGVyOiBJRXh0ZW5zaW9uUG9pbnRIYW5kbGVyPFQ+KTogSURpc3Bvc2FibGU7XG5cdHJlYWRvbmx5IGRlZmF1bHRFeHRlbnNpb25LaW5kOiBFeHRlbnNpb25LaW5kW10gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNhbkhhbmRsZVJlc29sdmVyPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvblBvaW50VXNlckRlbHRhPFQ+IHtcblxuXHRwcml2YXRlIHN0YXRpYyBfdG9TZXQ8VD4oYXJyOiByZWFkb25seSBJRXh0ZW5zaW9uUG9pbnRVc2VyPFQ+W10pOiBFeHRlbnNpb25JZGVudGlmaWVyU2V0IHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllclNldCgpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBhcnIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdHJlc3VsdC5hZGQoYXJyW2ldLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBjb21wdXRlPFQ+KHByZXZpb3VzOiByZWFkb25seSBJRXh0ZW5zaW9uUG9pbnRVc2VyPFQ+W10gfCBudWxsLCBjdXJyZW50OiByZWFkb25seSBJRXh0ZW5zaW9uUG9pbnRVc2VyPFQ+W10pOiBFeHRlbnNpb25Qb2ludFVzZXJEZWx0YTxUPiB7XG5cdFx0aWYgKCFwcmV2aW91cyB8fCAhcHJldmlvdXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gbmV3IEV4dGVuc2lvblBvaW50VXNlckRlbHRhPFQ+KGN1cnJlbnQsIFtdKTtcblx0XHR9XG5cdFx0aWYgKCFjdXJyZW50IHx8ICFjdXJyZW50Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG5ldyBFeHRlbnNpb25Qb2ludFVzZXJEZWx0YTxUPihbXSwgcHJldmlvdXMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzU2V0ID0gdGhpcy5fdG9TZXQocHJldmlvdXMpO1xuXHRcdGNvbnN0IGN1cnJlbnRTZXQgPSB0aGlzLl90b1NldChjdXJyZW50KTtcblxuXHRcdGNvbnN0IGFkZGVkID0gY3VycmVudC5maWx0ZXIodXNlciA9PiAhcHJldmlvdXNTZXQuaGFzKHVzZXIuZGVzY3JpcHRpb24uaWRlbnRpZmllcikpO1xuXHRcdGNvbnN0IHJlbW92ZWQgPSBwcmV2aW91cy5maWx0ZXIodXNlciA9PiAhY3VycmVudFNldC5oYXModXNlci5kZXNjcmlwdGlvbi5pZGVudGlmaWVyKSk7XG5cblx0XHRyZXR1cm4gbmV3IEV4dGVuc2lvblBvaW50VXNlckRlbHRhPFQ+KGFkZGVkLCByZW1vdmVkKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBhZGRlZDogcmVhZG9ubHkgSUV4dGVuc2lvblBvaW50VXNlcjxUPltdLFxuXHRcdHB1YmxpYyByZWFkb25seSByZW1vdmVkOiByZWFkb25seSBJRXh0ZW5zaW9uUG9pbnRVc2VyPFQ+W10sXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25Qb2ludDxUPiBpbXBsZW1lbnRzIElFeHRlbnNpb25Qb2ludDxUPiB7XG5cblx0cHVibGljIHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IGRlZmF1bHRFeHRlbnNpb25LaW5kOiBFeHRlbnNpb25LaW5kW10gfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSBjYW5IYW5kbGVSZXNvbHZlcj86IGJvb2xlYW47XG5cblx0cHJpdmF0ZSBfaGFuZGxlcjogSUV4dGVuc2lvblBvaW50SGFuZGxlcjxUPiB8IG51bGw7XG5cdHByaXZhdGUgX3VzZXJzOiBJRXh0ZW5zaW9uUG9pbnRVc2VyPFQ+W10gfCBudWxsO1xuXHRwcml2YXRlIF9kZWx0YTogRXh0ZW5zaW9uUG9pbnRVc2VyRGVsdGE8VD4gfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgZGVmYXVsdEV4dGVuc2lvbktpbmQ6IEV4dGVuc2lvbktpbmRbXSB8IHVuZGVmaW5lZCwgY2FuSGFuZGxlUmVzb2x2ZXI/OiBib29sZWFuKSB7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLmRlZmF1bHRFeHRlbnNpb25LaW5kID0gZGVmYXVsdEV4dGVuc2lvbktpbmQ7XG5cdFx0dGhpcy5jYW5IYW5kbGVSZXNvbHZlciA9IGNhbkhhbmRsZVJlc29sdmVyO1xuXHRcdHRoaXMuX2hhbmRsZXIgPSBudWxsO1xuXHRcdHRoaXMuX3VzZXJzID0gbnVsbDtcblx0XHR0aGlzLl9kZWx0YSA9IG51bGw7XG5cdH1cblxuXHRzZXRIYW5kbGVyKGhhbmRsZXI6IElFeHRlbnNpb25Qb2ludEhhbmRsZXI8VD4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMuX2hhbmRsZXIgIT09IG51bGwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSGFuZGxlciBhbHJlYWR5IHNldCEnKTtcblx0XHR9XG5cdFx0dGhpcy5faGFuZGxlciA9IGhhbmRsZXI7XG5cdFx0dGhpcy5faGFuZGxlKCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVyID0gbnVsbDtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0YWNjZXB0VXNlcnModXNlcnM6IElFeHRlbnNpb25Qb2ludFVzZXI8VD5bXSk6IHZvaWQge1xuXHRcdHRoaXMuX2RlbHRhID0gRXh0ZW5zaW9uUG9pbnRVc2VyRGVsdGEuY29tcHV0ZSh0aGlzLl91c2VycywgdXNlcnMpO1xuXHRcdHRoaXMuX3VzZXJzID0gdXNlcnM7XG5cdFx0dGhpcy5faGFuZGxlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2hhbmRsZXIgPT09IG51bGwgfHwgdGhpcy5fdXNlcnMgPT09IG51bGwgfHwgdGhpcy5fZGVsdGEgPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5faGFuZGxlcih0aGlzLl91c2VycywgdGhpcy5fZGVsdGEpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHR9XG5cdH1cbn1cblxuY29uc3QgZXh0ZW5zaW9uS2luZFNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdzdHJpbmcnLFxuXHRlbnVtOiBbXG5cdFx0J3VpJyxcblx0XHQnd29ya3NwYWNlJ1xuXHRdLFxuXHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0bmxzLmxvY2FsaXplKCd1aScsIFwiVUkgZXh0ZW5zaW9uIGtpbmQuIEluIGEgcmVtb3RlIHdpbmRvdywgc3VjaCBleHRlbnNpb25zIGFyZSBlbmFibGVkIG9ubHkgd2hlbiBhdmFpbGFibGUgb24gdGhlIGxvY2FsIG1hY2hpbmUuXCIpLFxuXHRcdG5scy5sb2NhbGl6ZSgnd29ya3NwYWNlJywgXCJXb3Jrc3BhY2UgZXh0ZW5zaW9uIGtpbmQuIEluIGEgcmVtb3RlIHdpbmRvdywgc3VjaCBleHRlbnNpb25zIGFyZSBlbmFibGVkIG9ubHkgd2hlbiBhdmFpbGFibGUgb24gdGhlIHJlbW90ZS5cIiksXG5cdF0sXG59O1xuXG5jb25zdCBzY2hlbWFJZCA9ICd2c2NvZGU6Ly9zY2hlbWFzL3ZzY29kZS1leHRlbnNpb25zJztcbmV4cG9ydCBjb25zdCBzY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0ZW5naW5lczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmVuZ2luZXMnLCBcIkVuZ2luZSBjb21wYXRpYmlsaXR5LlwiKSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0J3ZzY29kZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmVuZ2luZXMudnNjb2RlJywgJ0ZvciBWUyBDb2RlIGV4dGVuc2lvbnMsIHNwZWNpZmllcyB0aGUgVlMgQ29kZSB2ZXJzaW9uIHRoYXQgdGhlIGV4dGVuc2lvbiBpcyBjb21wYXRpYmxlIHdpdGguIENhbm5vdCBiZSAqLiBGb3IgZXhhbXBsZTogXjEuMTA1LjAgaW5kaWNhdGVzIGNvbXBhdGliaWxpdHkgd2l0aCBhIG1pbmltdW0gVlMgQ29kZSB2ZXJzaW9uIG9mIDEuMTA1LjAuJyksXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ14xLjEwNS4wJyxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0cHVibGlzaGVyOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLnB1Ymxpc2hlcicsICdUaGUgcHVibGlzaGVyIG9mIHRoZSBWUyBDb2RlIGV4dGVuc2lvbi4nKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0XHRkaXNwbGF5TmFtZToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5kaXNwbGF5TmFtZScsICdUaGUgZGlzcGxheSBuYW1lIGZvciB0aGUgZXh0ZW5zaW9uIHVzZWQgaW4gdGhlIFZTIENvZGUgZ2FsbGVyeS4nKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0XHRjYXRlZ29yaWVzOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNhdGVnb3JpZXMnLCAnVGhlIGNhdGVnb3JpZXMgdXNlZCBieSB0aGUgVlMgQ29kZSBnYWxsZXJ5IHRvIGNhdGVnb3JpemUgdGhlIGV4dGVuc2lvbi4nKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHR1bmlxdWVJdGVtczogdHJ1ZSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdG9uZU9mOiBbe1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IEVYVEVOU0lPTl9DQVRFR09SSUVTLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0Y29uc3Q6ICdMYW5ndWFnZXMnLFxuXHRcdFx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNhdGVnb3J5Lmxhbmd1YWdlcy5kZXByZWNhdGVkJywgJ1VzZSBcXCdQcm9ncmFtbWluZyAgTGFuZ3VhZ2VzXFwnIGluc3RlYWQnKSxcblx0XHRcdFx0fV1cblx0XHRcdH1cblx0XHR9LFxuXHRcdGdhbGxlcnlCYW5uZXI6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5nYWxsZXJ5QmFubmVyJywgJ0Jhbm5lciB1c2VkIGluIHRoZSBWUyBDb2RlIG1hcmtldHBsYWNlLicpLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRjb2xvcjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uZ2FsbGVyeUJhbm5lci5jb2xvcicsICdUaGUgYmFubmVyIGNvbG9yIG9uIHRoZSBWUyBDb2RlIG1hcmtldHBsYWNlIHBhZ2UgaGVhZGVyLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRoZW1lOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5nYWxsZXJ5QmFubmVyLnRoZW1lJywgJ1RoZSBjb2xvciB0aGVtZSBmb3IgdGhlIGZvbnQgdXNlZCBpbiB0aGUgYmFubmVyLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnZGFyaycsICdsaWdodCddXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdGNvbnRyaWJ1dGVzOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzJywgJ0FsbCBjb250cmlidXRpb25zIG9mIHRoZSBWUyBDb2RlIGV4dGVuc2lvbiByZXByZXNlbnRlZCBieSB0aGlzIHBhY2thZ2UuJyksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHQvLyBleHRlbnNpb25zIHdpbGwgZmlsbCBpblxuXHRcdFx0fSBhcyBhbnkgYXMgeyBba2V5OiBzdHJpbmddOiBhbnkgfSxcblx0XHRcdGRlZmF1bHQ6IHt9XG5cdFx0fSxcblx0XHRwcmV2aWV3OiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLnByZXZpZXcnLCAnU2V0cyB0aGUgZXh0ZW5zaW9uIHRvIGJlIGZsYWdnZWQgYXMgYSBQcmV2aWV3IGluIHRoZSBNYXJrZXRwbGFjZS4nKSxcblx0XHR9LFxuXHRcdGVuYWJsZVByb3Bvc2VkQXBpOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5lbmFibGVQcm9wb3NlZEFwaS5kZXByZWNhdGVkJywgJ1VzZSBgZW5hYmxlZEFwaVByb3Bvc2Fsc2AgaW5zdGVhZC4nKSxcblx0XHR9LFxuXHRcdGVuYWJsZWRBcGlQcm9wb3NhbHM6IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5lbmFibGVkQXBpUHJvcG9zYWxzJywgJ0VuYWJsZSBBUEkgcHJvcG9zYWxzIHRvIHRyeSB0aGVtIG91dC4gT25seSB2YWxpZCAqKmR1cmluZyBkZXZlbG9wbWVudCoqLiBFeHRlbnNpb25zICoqY2Fubm90IGJlIHB1Ymxpc2hlZCoqIHdpdGggdGhpcyBwcm9wZXJ0eS4gRm9yIG1vcmUgZGV0YWlscyB2aXNpdDogaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vYXBpL2FkdmFuY2VkLXRvcGljcy91c2luZy1wcm9wb3NlZC1hcGknKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHR1bmlxdWVJdGVtczogdHJ1ZSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRlbnVtOiBPYmplY3Qua2V5cyhhbGxBcGlQcm9wb3NhbHMpLm1hcChwcm9wb3NhbE5hbWUgPT4gcHJvcG9zYWxOYW1lKSxcblx0XHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBPYmplY3QudmFsdWVzKGFsbEFwaVByb3Bvc2FscykubWFwKHZhbHVlID0+IHZhbHVlLnByb3Bvc2FsKVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0YXBpOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYXBpJywgJ0Rlc2NyaWJlIHRoZSBBUEkgcHJvdmlkZWQgYnkgdGhpcyBleHRlbnNpb24uIEZvciBtb3JlIGRldGFpbHMgdmlzaXQ6IGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2FwaS9hZHZhbmNlZC10b3BpY3MvcmVtb3RlLWV4dGVuc2lvbnMjaGFuZGxpbmctZGVwZW5kZW5jaWVzLXdpdGgtcmVtb3RlLWV4dGVuc2lvbnMnKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydub25lJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hcGkubm9uZScsIFwiR2l2ZSB1cCBlbnRpcmVseSB0aGUgYWJpbGl0eSB0byBleHBvcnQgYW55IEFQSXMuIFRoaXMgYWxsb3dzIG90aGVyIGV4dGVuc2lvbnMgdGhhdCBkZXBlbmQgb24gdGhpcyBleHRlbnNpb24gdG8gcnVuIGluIGEgc2VwYXJhdGUgZXh0ZW5zaW9uIGhvc3QgcHJvY2VzcyBvciBpbiBhIHJlbW90ZSBtYWNoaW5lLlwiKVxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0YWN0aXZhdGlvbkV2ZW50czoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzJywgJ0FjdGl2YXRpb24gZXZlbnRzIGZvciB0aGUgVlMgQ29kZSBleHRlbnNpb24uJyksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25XZWJ2aWV3UGFuZWwnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uV2Vidmlld1BhbmVsJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuIGEgd2VidmlldyBpcyBsb2FkZWQgb2YgYSBjZXJ0YWluIHZpZXdUeXBlJyksXG5cdFx0XHRcdFx0XHRib2R5OiAnb25XZWJ2aWV3UGFuZWw6dmlld1R5cGUnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uTGFuZ3VhZ2UnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uTGFuZ3VhZ2UnLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW5ldmVyIGEgZmlsZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBzcGVjaWZpZWQgbGFuZ3VhZ2UgZ2V0cyBvcGVuZWQuJyksXG5cdFx0XHRcdFx0XHRib2R5OiAnb25MYW5ndWFnZTokezE6bGFuZ3VhZ2VJZH0nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uQ29tbWFuZCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25Db21tYW5kJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuZXZlciB0aGUgc3BlY2lmaWVkIGNvbW1hbmQgZ2V0cyBpbnZva2VkLicpLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uQ29tbWFuZDokezI6Y29tbWFuZElkfSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25EZWJ1ZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25EZWJ1ZycsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbmV2ZXIgYSB1c2VyIGlzIGFib3V0IHRvIHN0YXJ0IGRlYnVnZ2luZyBvciBhYm91dCB0byBzZXR1cCBkZWJ1ZyBjb25maWd1cmF0aW9ucy4nKSxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbkRlYnVnJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvbkRlYnVnSW5pdGlhbENvbmZpZ3VyYXRpb25zJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vbkRlYnVnSW5pdGlhbENvbmZpZ3VyYXRpb25zJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuZXZlciBhIFwibGF1bmNoLmpzb25cIiBuZWVkcyB0byBiZSBjcmVhdGVkIChhbmQgYWxsIHByb3ZpZGVEZWJ1Z0NvbmZpZ3VyYXRpb25zIG1ldGhvZHMgbmVlZCB0byBiZSBjYWxsZWQpLicpLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uRGVidWdJbml0aWFsQ29uZmlndXJhdGlvbnMnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uRGVidWdEeW5hbWljQ29uZmlndXJhdGlvbnMnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uRGVidWdEeW5hbWljQ29uZmlndXJhdGlvbnMnLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW5ldmVyIGEgbGlzdCBvZiBhbGwgZGVidWcgY29uZmlndXJhdGlvbnMgbmVlZHMgdG8gYmUgY3JlYXRlZCAoYW5kIGFsbCBwcm92aWRlRGVidWdDb25maWd1cmF0aW9ucyBtZXRob2RzIGZvciB0aGUgXCJkeW5hbWljXCIgc2NvcGUgbmVlZCB0byBiZSBjYWxsZWQpLicpLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uRGVidWdEeW5hbWljQ29uZmlndXJhdGlvbnMnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uRGVidWdSZXNvbHZlJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vbkRlYnVnUmVzb2x2ZScsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbmV2ZXIgYSBkZWJ1ZyBzZXNzaW9uIHdpdGggdGhlIHNwZWNpZmljIHR5cGUgaXMgYWJvdXQgdG8gYmUgbGF1bmNoZWQgKGFuZCBhIGNvcnJlc3BvbmRpbmcgcmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbiBtZXRob2QgbmVlZHMgdG8gYmUgY2FsbGVkKS4nKSxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbkRlYnVnUmVzb2x2ZTokezY6dHlwZX0nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uRGVidWdBZGFwdGVyUHJvdG9jb2xUcmFja2VyJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vbkRlYnVnQWRhcHRlclByb3RvY29sVHJhY2tlcicsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbmV2ZXIgYSBkZWJ1ZyBzZXNzaW9uIHdpdGggdGhlIHNwZWNpZmljIHR5cGUgaXMgYWJvdXQgdG8gYmUgbGF1bmNoZWQgYW5kIGEgZGVidWcgcHJvdG9jb2wgdHJhY2tlciBtaWdodCBiZSBuZWVkZWQuJyksXG5cdFx0XHRcdFx0XHRib2R5OiAnb25EZWJ1Z0FkYXB0ZXJQcm90b2NvbFRyYWNrZXI6JHs2OnR5cGV9J1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICd3b3Jrc3BhY2VDb250YWlucycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMud29ya3NwYWNlQ29udGFpbnMnLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW5ldmVyIGEgZm9sZGVyIGlzIG9wZW5lZCB0aGF0IGNvbnRhaW5zIGF0IGxlYXN0IGEgZmlsZSBtYXRjaGluZyB0aGUgc3BlY2lmaWVkIGdsb2IgcGF0dGVybi4nKSxcblx0XHRcdFx0XHRcdGJvZHk6ICd3b3Jrc3BhY2VDb250YWluczokezQ6ZmlsZVBhdHRlcm59J1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvblN0YXJ0dXBGaW5pc2hlZCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25TdGFydHVwRmluaXNoZWQnLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIGFmdGVyIHRoZSBzdGFydC11cCBmaW5pc2hlZCAoYWZ0ZXIgYWxsIGAqYCBhY3RpdmF0ZWQgZXh0ZW5zaW9ucyBoYXZlIGZpbmlzaGVkIGFjdGl2YXRpbmcpLicpLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uU3RhcnR1cEZpbmlzaGVkJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvblRhc2tUeXBlJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vblRhc2tUeXBlJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuZXZlciB0YXNrcyBvZiBhIGNlcnRhaW4gdHlwZSBuZWVkIHRvIGJlIGxpc3RlZCBvciByZXNvbHZlZC4nKSxcblx0XHRcdFx0XHRcdGJvZHk6ICdvblRhc2tUeXBlOiR7MTp0YXNrVHlwZX0nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uRmlsZVN5c3RlbScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25GaWxlU3lzdGVtJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuZXZlciBhIGZpbGUgb3IgZm9sZGVyIGlzIGFjY2Vzc2VkIHdpdGggdGhlIGdpdmVuIHNjaGVtZS4nKSxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbkZpbGVTeXN0ZW06JHsxOnNjaGVtZX0nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uRWRpdFNlc3Npb24nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uRWRpdFNlc3Npb24nLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW5ldmVyIGFuIGVkaXQgc2Vzc2lvbiBpcyBhY2Nlc3NlZCB3aXRoIHRoZSBnaXZlbiBzY2hlbWUuJyksXG5cdFx0XHRcdFx0XHRib2R5OiAnb25FZGl0U2Vzc2lvbjokezE6c2NoZW1lfSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25TZWFyY2gnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uU2VhcmNoJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuZXZlciBhIHNlYXJjaCBpcyBzdGFydGVkIGluIHRoZSBmb2xkZXIgd2l0aCB0aGUgZ2l2ZW4gc2NoZW1lLicpLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uU2VhcmNoOiR7NzpzY2hlbWV9J1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvblZpZXcnLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uVmlldzokezU6dmlld0lkfScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25WaWV3JywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuZXZlciB0aGUgc3BlY2lmaWVkIHZpZXcgaXMgZXhwYW5kZWQuJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uVXJpJyxcblx0XHRcdFx0XHRcdGJvZHk6ICdvblVyaScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25VcmknLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW5ldmVyIGEgc3lzdGVtLXdpZGUgVXJpIGRpcmVjdGVkIHRvd2FyZHMgdGhpcyBleHRlbnNpb24gaXMgb3Blbi4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25PcGVuRXh0ZXJuYWxVcmknLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uT3BlbkV4dGVybmFsVXJpJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vbk9wZW5FeHRlcm5hbFVyaScsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbmV2ZXIgYSBleHRlcm5hbCB1cmkgKHN1Y2ggYXMgYW4gaHR0cCBvciBodHRwcyBsaW5rKSBpcyBiZWluZyBvcGVuZWQuJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uQ3VzdG9tRWRpdG9yJyxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbkN1c3RvbUVkaXRvcjokezk6dmlld1R5cGV9Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vbkN1c3RvbUVkaXRvcicsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbmV2ZXIgdGhlIHNwZWNpZmllZCBjdXN0b20gZWRpdG9yIGJlY29tZXMgdmlzaWJsZS4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25Ob3RlYm9vaycsXG5cdFx0XHRcdFx0XHRib2R5OiAnb25Ob3RlYm9vazokezE6dHlwZX0nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uTm90ZWJvb2snLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW5ldmVyIHRoZSBzcGVjaWZpZWQgbm90ZWJvb2sgZG9jdW1lbnQgaXMgb3BlbmVkLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvbkF1dGhlbnRpY2F0aW9uUmVxdWVzdCcsXG5cdFx0XHRcdFx0XHRib2R5OiAnb25BdXRoZW50aWNhdGlvblJlcXVlc3Q6JHsxMTphdXRoZW50aWNhdGlvblByb3ZpZGVySWR9Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vbkF1dGhlbnRpY2F0aW9uUmVxdWVzdCcsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbmV2ZXIgc2Vzc2lvbnMgYXJlIHJlcXVlc3RlZCBmcm9tIHRoZSBzcGVjaWZpZWQgYXV0aGVudGljYXRpb24gcHJvdmlkZXIuJylcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25SZW5kZXJlcicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25SZW5kZXJlcicsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbmV2ZXIgYSBub3RlYm9vayBvdXRwdXQgcmVuZGVyZXIgaXMgdXNlZC4nKSxcblx0XHRcdFx0XHRcdGJvZHk6ICdvblJlbmRlcmVyOiR7MTE6cmVuZGVyZXJJZH0nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uVGVybWluYWxQcm9maWxlJyxcblx0XHRcdFx0XHRcdGJvZHk6ICdvblRlcm1pbmFsUHJvZmlsZTokezE6dGVybWluYWxJZH0nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uVGVybWluYWxQcm9maWxlJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuIGEgc3BlY2lmaWMgdGVybWluYWwgcHJvZmlsZSBpcyBsYXVuY2hlZC4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25UZXJtaW5hbFF1aWNrRml4UmVxdWVzdCcsXG5cdFx0XHRcdFx0XHRib2R5OiAnb25UZXJtaW5hbFF1aWNrRml4UmVxdWVzdDokezE6cXVpY2tGaXhJZH0nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uVGVybWluYWxRdWlja0ZpeFJlcXVlc3QnLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW4gYSBjb21tYW5kIG1hdGNoZXMgdGhlIHNlbGVjdG9yIGFzc29jaWF0ZWQgd2l0aCB0aGlzIElEJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uV2Fsa3Rocm91Z2gnLFxuXHRcdFx0XHRcdFx0Ym9keTogJ29uV2Fsa3Rocm91Z2g6JHsxOndhbGt0aHJvdWdoSUR9Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vbldhbGt0aHJvdWdoJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuIGEgc3BlY2lmaWVkIHdhbGt0aHJvdWdoIGlzIG9wZW5lZC4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25Jc3N1ZVJlcG9ydGVyT3BlbmVkJyxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbklzc3VlUmVwb3J0ZXJPcGVuZWQnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uSXNzdWVSZXBvcnRlck9wZW5lZCcsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbiB0aGUgaXNzdWUgcmVwb3J0ZXIgaXMgb3BlbmVkLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvbkNoYXRQYXJ0aWNpcGFudCcsXG5cdFx0XHRcdFx0XHRib2R5OiAnb25DaGF0UGFydGljaXBhbnQ6JHsxOnBhcnRpY2lwYW50SWR9Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vbkNoYXRQYXJ0aWNpcGFudCcsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbiB0aGUgc3BlY2lmaWVkIGNoYXQgcGFydGljaXBhbnQgaXMgaW52b2tlZC4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25DaGF0Q29udGV4dFByb3ZpZGVyJyxcblx0XHRcdFx0XHRcdGJvZHk6ICdvbkNoYXRDb250ZXh0UHJvdmlkZXI6JHsxOmNvbnRleHRQcm92aWRlcklkfScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25DaGF0Q29udGV4dFByb3ZpZGVyJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuIHRoZSBzcGVjaWZpZWQgY2hhdCBjb250ZXh0IHByb3ZpZGVyIGlzIGludm9rZWQuJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcicsXG5cdFx0XHRcdFx0XHRib2R5OiAnb25MYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyOiR7MTp2ZW5kb3J9Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vbkxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXInLCAnQW4gYWN0aXZhdGlvbiBldmVudCBlbWl0dGVkIHdoZW4gYSBjaGF0IG1vZGVsIHByb3ZpZGVyIGZvciB0aGUgZ2l2ZW4gdmVuZG9yIGlzIHJlcXVlc3RlZC4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25MYW5ndWFnZU1vZGVsVG9vbCcsXG5cdFx0XHRcdFx0XHRib2R5OiAnb25MYW5ndWFnZU1vZGVsVG9vbDokezE6dG9vbElkfScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25MYW5ndWFnZU1vZGVsVG9vbCcsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgd2hlbiB0aGUgc3BlY2lmaWVkIGxhbmd1YWdlIG1vZGVsIHRvb2wgaXMgaW52b2tlZC4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnb25UZXJtaW5hbCcsXG5cdFx0XHRcdFx0XHRib2R5OiAnb25UZXJtaW5hbDp7MTpzaGVsbFR5cGV9Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5vblRlcm1pbmFsJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuIGEgdGVybWluYWwgb2YgdGhlIGdpdmVuIHNoZWxsIHR5cGUgaXMgb3BlbmVkLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdvblRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbicsXG5cdFx0XHRcdFx0XHRib2R5OiAnb25UZXJtaW5hbFNoZWxsSW50ZWdyYXRpb246JHsxOnNoZWxsVHlwZX0nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzLm9uVGVybWluYWxTaGVsbEludGVncmF0aW9uJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuIHRlcm1pbmFsIHNoZWxsIGludGVncmF0aW9uIGlzIGFjdGl2YXRlZCBmb3IgdGhlIGdpdmVuIHNoZWxsIHR5cGUuJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uTWNwQ29sbGVjdGlvbicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMub25NY3BDb2xsZWN0aW9uJywgJ0FuIGFjdGl2YXRpb24gZXZlbnQgZW1pdHRlZCB3aGVuZXZlciBhIHRvb2wgZnJvbSB0aGUgTUNQIHNlcnZlciBpcyByZXF1ZXN0ZWQuJyksXG5cdFx0XHRcdFx0XHRib2R5OiAnb25NY3BDb2xsZWN0aW9uOiR7Mjpjb2xsZWN0aW9uSWR9Jyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnKicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMuc3RhcicsICdBbiBhY3RpdmF0aW9uIGV2ZW50IGVtaXR0ZWQgb24gVlMgQ29kZSBzdGFydHVwLiBUbyBlbnN1cmUgYSBncmVhdCBlbmQgdXNlciBleHBlcmllbmNlLCBwbGVhc2UgdXNlIHRoaXMgYWN0aXZhdGlvbiBldmVudCBpbiB5b3VyIGV4dGVuc2lvbiBvbmx5IHdoZW4gbm8gb3RoZXIgYWN0aXZhdGlvbiBldmVudHMgY29tYmluYXRpb24gd29ya3MgaW4geW91ciB1c2UtY2FzZS4nKSxcblx0XHRcdFx0XHRcdGJvZHk6ICcqJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdH1cblx0XHR9LFxuXHRcdGJhZGdlczoge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYmFkZ2VzJywgJ0FycmF5IG9mIGJhZGdlcyB0byBkaXNwbGF5IGluIHRoZSBzaWRlYmFyIG9mIHRoZSBNYXJrZXRwbGFjZVxcJ3MgZXh0ZW5zaW9uIHBhZ2UuJyksXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cmVxdWlyZWQ6IFsndXJsJywgJ2hyZWYnLCAnZGVzY3JpcHRpb24nXSxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdHVybDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmJhZGdlcy51cmwnLCAnQmFkZ2UgaW1hZ2UgVVJMLicpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRocmVmOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uYmFkZ2VzLmhyZWYnLCAnQmFkZ2UgbGluay4nKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5iYWRnZXMuZGVzY3JpcHRpb24nLCAnQmFkZ2UgZGVzY3JpcHRpb24uJylcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdG1hcmtkb3duOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24ubWFya2Rvd24nLCBcIkNvbnRyb2xzIHRoZSBNYXJrZG93biByZW5kZXJpbmcgZW5naW5lIHVzZWQgaW4gdGhlIE1hcmtldHBsYWNlLiBFaXRoZXIgZ2l0aHViIChkZWZhdWx0KSBvciBzdGFuZGFyZC5cIiksXG5cdFx0XHRlbnVtOiBbJ2dpdGh1YicsICdzdGFuZGFyZCddLFxuXHRcdFx0ZGVmYXVsdDogJ2dpdGh1Yidcblx0XHR9LFxuXHRcdHFuYToge1xuXHRcdFx0ZGVmYXVsdDogJ21hcmtldHBsYWNlJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24ucW5hJywgXCJDb250cm9scyB0aGUgUSZBIGxpbmsgaW4gdGhlIE1hcmtldHBsYWNlLiBTZXQgdG8gbWFya2V0cGxhY2UgdG8gZW5hYmxlIHRoZSBkZWZhdWx0IE1hcmtldHBsYWNlIFEgJiBBIHNpdGUuIFNldCB0byBhIHN0cmluZyB0byBwcm92aWRlIHRoZSBVUkwgb2YgYSBjdXN0b20gUSAmIEEgc2l0ZS4gU2V0IHRvIGZhbHNlIHRvIGRpc2FibGUgUSAmIEEgYWx0b2dldGhlci5cIiksXG5cdFx0XHRhbnlPZjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogWydzdHJpbmcnLCAnYm9vbGVhbiddLFxuXHRcdFx0XHRcdGVudW06IFsnbWFya2V0cGxhY2UnLCBmYWxzZV1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9LFxuXHRcdGV4dGVuc2lvbkRlcGVuZGVuY2llczoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5leHRlbnNpb25EZXBlbmRlbmNpZXMnLCAnRGVwZW5kZW5jaWVzIHRvIG90aGVyIGV4dGVuc2lvbnMuIFRoZSBpZGVudGlmaWVyIG9mIGFuIGV4dGVuc2lvbiBpcyBhbHdheXMgJHtwdWJsaXNoZXJ9LiR7bmFtZX0uIEZvciBleGFtcGxlOiB2c2NvZGUuY3NoYXJwLicpLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdHVuaXF1ZUl0ZW1zOiB0cnVlLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdHBhdHRlcm46IEVYVEVOU0lPTl9JREVOVElGSUVSX1BBVFRFUk5cblx0XHRcdH1cblx0XHR9LFxuXHRcdGV4dGVuc2lvbkFmZmluaXR5OiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmV4dGVuc2lvbkFmZmluaXR5JywgJ0V4dGVuc2lvbnMgdGhhdCB0aGlzIGV4dGVuc2lvbiBzaG91bGQgYmUgY29sb2NhdGVkIHdpdGggaW4gdGhlIHNhbWUgZXh0ZW5zaW9uIGhvc3QgcHJvY2VzcyBpZiBwb3NzaWJsZS4gVGhlIGlkZW50aWZpZXIgb2YgYW4gZXh0ZW5zaW9uIGlzIGFsd2F5cyAke3B1Ymxpc2hlcn0uJHtuYW1lfS4gRm9yIGV4YW1wbGU6IHZzY29kZS5naXQuJyksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0dW5pcXVlSXRlbXM6IHRydWUsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0cGF0dGVybjogRVhURU5TSU9OX0lERU5USUZJRVJfUEFUVEVSTlxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0ZXh0ZW5zaW9uUGFjazoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5leHRlbnNpb25QYWNrJywgXCJBIHNldCBvZiBleHRlbnNpb25zIHRoYXQgY2FuIGJlIGluc3RhbGxlZCB0b2dldGhlci4gVGhlIGlkZW50aWZpZXIgb2YgYW4gZXh0ZW5zaW9uIGlzIGFsd2F5cyAke3B1Ymxpc2hlcn0uJHtuYW1lfS4gRm9yIGV4YW1wbGU6IHZzY29kZS5jc2hhcnAuXCIpLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdHVuaXF1ZUl0ZW1zOiB0cnVlLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdHBhdHRlcm46IEVYVEVOU0lPTl9JREVOVElGSUVSX1BBVFRFUk5cblx0XHRcdH1cblx0XHR9LFxuXHRcdGV4dGVuc2lvbktpbmQ6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2V4dGVuc2lvbktpbmQnLCBcIkRlZmluZSB0aGUga2luZCBvZiBhbiBleHRlbnNpb24uIGB1aWAgZXh0ZW5zaW9ucyBhcmUgaW5zdGFsbGVkIGFuZCBydW4gb24gdGhlIGxvY2FsIG1hY2hpbmUgd2hpbGUgYHdvcmtzcGFjZWAgZXh0ZW5zaW9ucyBydW4gb24gdGhlIHJlbW90ZS5cIiksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IGV4dGVuc2lvbktpbmRTY2hlbWEsXG5cdFx0XHRkZWZhdWx0OiBbJ3dvcmtzcGFjZSddLFxuXHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRib2R5OiBbJ3VpJ10sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uS2luZC51aScsIFwiRGVmaW5lIGFuIGV4dGVuc2lvbiB3aGljaCBjYW4gcnVuIG9ubHkgb24gdGhlIGxvY2FsIG1hY2hpbmUgd2hlbiBjb25uZWN0ZWQgdG8gcmVtb3RlIHdpbmRvdy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJvZHk6IFsnd29ya3NwYWNlJ10sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uS2luZC53b3Jrc3BhY2UnLCBcIkRlZmluZSBhbiBleHRlbnNpb24gd2hpY2ggY2FuIHJ1biBvbmx5IG9uIHRoZSByZW1vdGUgbWFjaGluZSB3aGVuIGNvbm5lY3RlZCByZW1vdGUgd2luZG93LlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ym9keTogWyd1aScsICd3b3Jrc3BhY2UnXSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdleHRlbnNpb25LaW5kLnVpLXdvcmtzcGFjZScsIFwiRGVmaW5lIGFuIGV4dGVuc2lvbiB3aGljaCBjYW4gcnVuIG9uIGVpdGhlciBzaWRlLCB3aXRoIGEgcHJlZmVyZW5jZSB0b3dhcmRzIHJ1bm5pbmcgb24gdGhlIGxvY2FsIG1hY2hpbmUuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRib2R5OiBbJ3dvcmtzcGFjZScsICd1aSddLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2V4dGVuc2lvbktpbmQud29ya3NwYWNlLXVpJywgXCJEZWZpbmUgYW4gZXh0ZW5zaW9uIHdoaWNoIGNhbiBydW4gb24gZWl0aGVyIHNpZGUsIHdpdGggYSBwcmVmZXJlbmNlIHRvd2FyZHMgcnVubmluZyBvbiB0aGUgcmVtb3RlIG1hY2hpbmUuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRib2R5OiBbXSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdleHRlbnNpb25LaW5kLmVtcHR5JywgXCJEZWZpbmUgYW4gZXh0ZW5zaW9uIHdoaWNoIGNhbm5vdCBydW4gaW4gYSByZW1vdGUgY29udGV4dCwgbmVpdGhlciBvbiB0aGUgbG9jYWwsIG5vciBvbiB0aGUgcmVtb3RlIG1hY2hpbmUuXCIpXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9LFxuXHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jYXBhYmlsaXRpZXMnLCBcIkRlY2xhcmUgdGhlIHNldCBvZiBzdXBwb3J0ZWQgY2FwYWJpbGl0aWVzIGJ5IHRoZSBleHRlbnNpb24uXCIpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHZpcnR1YWxXb3Jrc3BhY2VzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jYXBhYmlsaXRpZXMudmlydHVhbFdvcmtzcGFjZXMnLCBcIkRlY2xhcmVzIHdoZXRoZXIgdGhlIGV4dGVuc2lvbiBzaG91bGQgYmUgZW5hYmxlZCBpbiB2aXJ0dWFsIHdvcmtzcGFjZXMuIEEgdmlydHVhbCB3b3Jrc3BhY2UgaXMgYSB3b3Jrc3BhY2Ugd2hpY2ggaXMgbm90IGJhY2tlZCBieSBhbnkgb24tZGlzayByZXNvdXJjZXMuIFdoZW4gZmFsc2UsIHRoaXMgZXh0ZW5zaW9uIHdpbGwgYmUgYXV0b21hdGljYWxseSBkaXNhYmxlZCBpbiB2aXJ0dWFsIHdvcmtzcGFjZXMuIERlZmF1bHQgaXMgdHJ1ZS5cIiksXG5cdFx0XHRcdFx0dHlwZTogWydib29sZWFuJywgJ29iamVjdCddLFxuXHRcdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW1xuXHRcdFx0XHRcdFx0eyBsYWJlbDogJ2xpbWl0ZWQnLCBib2R5OiB7IHN1cHBvcnRlZDogJyR7MTpsaW1pdGVkfScsIGRlc2NyaXB0aW9uOiAnJHsyfScgfSB9LFxuXHRcdFx0XHRcdFx0eyBsYWJlbDogJ2ZhbHNlJywgYm9keTogeyBzdXBwb3J0ZWQ6IGZhbHNlLCBkZXNjcmlwdGlvbjogJyR7Mn0nIH0gfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUudmFsdWVPZixcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRzdXBwb3J0ZWQ6IHtcblx0XHRcdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNhcGFiaWxpdGllcy52aXJ0dWFsV29ya3NwYWNlcy5zdXBwb3J0ZWQnLCBcIkRlY2xhcmVzIHRoZSBsZXZlbCBvZiBzdXBwb3J0IGZvciB2aXJ0dWFsIHdvcmtzcGFjZXMgYnkgdGhlIGV4dGVuc2lvbi5cIiksXG5cdFx0XHRcdFx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ2Jvb2xlYW4nXSxcblx0XHRcdFx0XHRcdFx0ZW51bTogWydsaW1pdGVkJywgdHJ1ZSwgZmFsc2VdLFxuXHRcdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNhcGFiaWxpdGllcy52aXJ0dWFsV29ya3NwYWNlcy5zdXBwb3J0ZWQubGltaXRlZCcsIFwiVGhlIGV4dGVuc2lvbiB3aWxsIGJlIGVuYWJsZWQgaW4gdmlydHVhbCB3b3Jrc3BhY2VzIHdpdGggc29tZSBmdW5jdGlvbmFsaXR5IGRpc2FibGVkLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY2FwYWJpbGl0aWVzLnZpcnR1YWxXb3Jrc3BhY2VzLnN1cHBvcnRlZC50cnVlJywgXCJUaGUgZXh0ZW5zaW9uIHdpbGwgYmUgZW5hYmxlZCBpbiB2aXJ0dWFsIHdvcmtzcGFjZXMgd2l0aCBhbGwgZnVuY3Rpb25hbGl0eSBlbmFibGVkLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY2FwYWJpbGl0aWVzLnZpcnR1YWxXb3Jrc3BhY2VzLnN1cHBvcnRlZC5mYWxzZScsIFwiVGhlIGV4dGVuc2lvbiB3aWxsIG5vdCBiZSBlbmFibGVkIGluIHZpcnR1YWwgd29ya3NwYWNlcy5cIiksXG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNhcGFiaWxpdGllcy52aXJ0dWFsV29ya3NwYWNlcy5kZXNjcmlwdGlvbicsIFwiQSBkZXNjcmlwdGlvbiBvZiBob3cgdmlydHVhbCB3b3Jrc3BhY2VzIGFmZmVjdHMgdGhlIGV4dGVuc2lvbnMgYmVoYXZpb3IgYW5kIHdoeSBpdCBpcyBuZWVkZWQuIFRoaXMgb25seSBhcHBsaWVzIHdoZW4gYHN1cHBvcnRlZGAgaXMgbm90IGB0cnVlYC5cIiksXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR1bnRydXN0ZWRXb3Jrc3BhY2VzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jYXBhYmlsaXRpZXMudW50cnVzdGVkV29ya3NwYWNlcycsICdEZWNsYXJlcyBob3cgdGhlIGV4dGVuc2lvbiBzaG91bGQgYmUgaGFuZGxlZCBpbiB1bnRydXN0ZWQgd29ya3NwYWNlcy4nKSxcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRyZXF1aXJlZDogWydzdXBwb3J0ZWQnXSxcblx0XHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFtcblx0XHRcdFx0XHRcdHsgYm9keTogeyBzdXBwb3J0ZWQ6ICckezE6bGltaXRlZH0nLCBkZXNjcmlwdGlvbjogJyR7Mn0nIH0gfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHN1cHBvcnRlZDoge1xuXHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY2FwYWJpbGl0aWVzLnVudHJ1c3RlZFdvcmtzcGFjZXMuc3VwcG9ydGVkJywgXCJEZWNsYXJlcyB0aGUgbGV2ZWwgb2Ygc3VwcG9ydCBmb3IgdW50cnVzdGVkIHdvcmtzcGFjZXMgYnkgdGhlIGV4dGVuc2lvbi5cIiksXG5cdFx0XHRcdFx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ2Jvb2xlYW4nXSxcblx0XHRcdFx0XHRcdFx0ZW51bTogWydsaW1pdGVkJywgdHJ1ZSwgZmFsc2VdLFxuXHRcdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNhcGFiaWxpdGllcy51bnRydXN0ZWRXb3Jrc3BhY2VzLnN1cHBvcnRlZC5saW1pdGVkJywgXCJUaGUgZXh0ZW5zaW9uIHdpbGwgYmUgZW5hYmxlZCBpbiB1bnRydXN0ZWQgd29ya3NwYWNlcyB3aXRoIHNvbWUgZnVuY3Rpb25hbGl0eSBkaXNhYmxlZC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNhcGFiaWxpdGllcy51bnRydXN0ZWRXb3Jrc3BhY2VzLnN1cHBvcnRlZC50cnVlJywgXCJUaGUgZXh0ZW5zaW9uIHdpbGwgYmUgZW5hYmxlZCBpbiB1bnRydXN0ZWQgd29ya3NwYWNlcyB3aXRoIGFsbCBmdW5jdGlvbmFsaXR5IGVuYWJsZWQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jYXBhYmlsaXRpZXMudW50cnVzdGVkV29ya3NwYWNlcy5zdXBwb3J0ZWQuZmFsc2UnLCBcIlRoZSBleHRlbnNpb24gd2lsbCBub3QgYmUgZW5hYmxlZCBpbiB1bnRydXN0ZWQgd29ya3NwYWNlcy5cIiksXG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRyZXN0cmljdGVkQ29uZmlndXJhdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jYXBhYmlsaXRpZXMudW50cnVzdGVkV29ya3NwYWNlcy5yZXN0cmljdGVkQ29uZmlndXJhdGlvbnMnLCBcIkEgbGlzdCBvZiBjb25maWd1cmF0aW9uIGtleXMgY29udHJpYnV0ZWQgYnkgdGhlIGV4dGVuc2lvbiB0aGF0IHNob3VsZCBub3QgdXNlIHdvcmtzcGFjZSB2YWx1ZXMgaW4gdW50cnVzdGVkIHdvcmtzcGFjZXMuXCIpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNhcGFiaWxpdGllcy51bnRydXN0ZWRXb3Jrc3BhY2VzLmRlc2NyaXB0aW9uJywgXCJBIGRlc2NyaXB0aW9uIG9mIGhvdyB3b3Jrc3BhY2UgdHJ1c3QgYWZmZWN0cyB0aGUgZXh0ZW5zaW9ucyBiZWhhdmlvciBhbmQgd2h5IGl0IGlzIG5lZWRlZC4gVGhpcyBvbmx5IGFwcGxpZXMgd2hlbiBgc3VwcG9ydGVkYCBpcyBub3QgYHRydWVgLlwiKSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdHNwb25zb3I6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuc3BvbnNvcicsIFwiU3BlY2lmeSB0aGUgbG9jYXRpb24gZnJvbSB3aGVyZSB1c2VycyBjYW4gc3BvbnNvciB5b3VyIGV4dGVuc2lvbi5cIiksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlZmF1bHRTbmlwcGV0czogW1xuXHRcdFx0XHR7IGJvZHk6IHsgdXJsOiAnJHsxOmh0dHBzOn0nIH0gfSxcblx0XHRcdF0sXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCd1cmwnOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5zcG9uc29yLnVybCcsIFwiVVJMIGZyb20gd2hlcmUgdXNlcnMgY2FuIHNwb25zb3IgeW91ciBleHRlbnNpb24uIEl0IG11c3QgYmUgYSB2YWxpZCBVUkwgd2l0aCBhIEhUVFAgb3IgSFRUUFMgcHJvdG9jb2wuIEV4YW1wbGUgdmFsdWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9zcG9uc29ycy9udmFjY2Vzc1wiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0c2NyaXB0czoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCd2c2NvZGU6cHJlcHVibGlzaCc6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLnNjcmlwdHMucHJlcHVibGlzaCcsICdTY3JpcHQgZXhlY3V0ZWQgYmVmb3JlIHRoZSBwYWNrYWdlIGlzIHB1Ymxpc2hlZCBhcyBhIFZTIENvZGUgZXh0ZW5zaW9uLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCd2c2NvZGU6dW5pbnN0YWxsJzoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uc2NyaXB0cy51bmluc3RhbGwnLCAnVW5pbnN0YWxsIGhvb2sgZm9yIFZTIENvZGUgZXh0ZW5zaW9uLiBTY3JpcHQgdGhhdCBnZXRzIGV4ZWN1dGVkIHdoZW4gdGhlIGV4dGVuc2lvbiBpcyBjb21wbGV0ZWx5IHVuaW5zdGFsbGVkIGZyb20gVlMgQ29kZSB3aGljaCBpcyB3aGVuIFZTIENvZGUgaXMgcmVzdGFydGVkIChzaHV0ZG93biBhbmQgc3RhcnQpIGFmdGVyIHRoZSBleHRlbnNpb24gaXMgdW5pbnN0YWxsZWQuIE9ubHkgTm9kZSBzY3JpcHRzIGFyZSBzdXBwb3J0ZWQuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0aWNvbjoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmljb24nLCAnVGhlIHBhdGggdG8gYSAxMjh4MTI4IHBpeGVsIGljb24uJylcblx0XHR9LFxuXHRcdGwxMG46IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdGtleTogJ3ZzY29kZS5leHRlbnNpb24ubDEwbicsXG5cdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHQne0xvY2tlZD1cImJ1bmRsZS5sMTBuLl9sb2NhbGVfLmpzb25cIn0nLFxuXHRcdFx0XHRcdCd7TG9ja2VkPVwidnNjb2RlLmwxMG4gQVBJXCJ9J1xuXHRcdFx0XHRdXG5cdFx0XHR9LCAnVGhlIHJlbGF0aXZlIHBhdGggdG8gYSBmb2xkZXIgY29udGFpbmluZyBsb2NhbGl6YXRpb24gKGJ1bmRsZS5sMTBuLiouanNvbikgZmlsZXMuIE11c3QgYmUgc3BlY2lmaWVkIGlmIHlvdSBhcmUgdXNpbmcgdGhlIHZzY29kZS5sMTBuIEFQSS4nKVxuXHRcdH0sXG5cdFx0cHJpY2luZzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24ucHJpY2luZycsICdUaGUgcHJpY2luZyBpbmZvcm1hdGlvbiBmb3IgdGhlIGV4dGVuc2lvbi4gQ2FuIGJlIEZyZWUgKGRlZmF1bHQpIG9yIFRyaWFsLiBGb3IgbW9yZSBkZXRhaWxzIHZpc2l0OiBodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9hcGkvd29ya2luZy13aXRoLWV4dGVuc2lvbnMvcHVibGlzaGluZy1leHRlbnNpb24jZXh0ZW5zaW9uLXByaWNpbmctbGFiZWwnKSxcblx0XHRcdGVudW06IFsnRnJlZScsICdUcmlhbCddLFxuXHRcdFx0ZGVmYXVsdDogJ0ZyZWUnXG5cdFx0fVxuXHR9XG59O1xuXG5leHBvcnQgdHlwZSByZW1vdmVBcnJheTxUPiA9IFQgZXh0ZW5kcyBBcnJheTxpbmZlciBYPiA/IFggOiBUO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25Qb2ludERlc2NyaXB0b3I8VD4ge1xuXHRleHRlbnNpb25Qb2ludDogc3RyaW5nO1xuXHRkZXBzPzogSUV4dGVuc2lvblBvaW50PHVua25vd24+W107XG5cdGpzb25TY2hlbWE6IElKU09OU2NoZW1hO1xuXHRkZWZhdWx0RXh0ZW5zaW9uS2luZD86IEV4dGVuc2lvbktpbmRbXTtcblx0Y2FuSGFuZGxlUmVzb2x2ZXI/OiBib29sZWFuO1xuXHQvKipcblx0ICogQSBmdW5jdGlvbiB3aGljaCBydW5zIGJlZm9yZSB0aGUgZXh0ZW5zaW9uIHBvaW50IGhhcyBiZWVuIHZhbGlkYXRlZCBhbmQgd2hpY2hcblx0ICogc2hvdWxkIGNvbGxlY3QgYXV0b21hdGljIGFjdGl2YXRpb24gZXZlbnRzIGZyb20gdGhlIGNvbnRyaWJ1dGlvbi5cblx0ICovXG5cdGFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3I/OiBJQWN0aXZhdGlvbkV2ZW50c0dlbmVyYXRvcjxyZW1vdmVBcnJheTxUPj47XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25zUmVnaXN0cnlJbXBsIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25Qb2ludHMgPSBuZXcgTWFwPHN0cmluZywgRXh0ZW5zaW9uUG9pbnQ8YW55Pj4oKTtcblxuXHRwdWJsaWMgcmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxUPihkZXNjOiBJRXh0ZW5zaW9uUG9pbnREZXNjcmlwdG9yPFQ+KTogSUV4dGVuc2lvblBvaW50PFQ+IHtcblx0XHRpZiAodGhpcy5fZXh0ZW5zaW9uUG9pbnRzLmhhcyhkZXNjLmV4dGVuc2lvblBvaW50KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdEdXBsaWNhdGUgZXh0ZW5zaW9uIHBvaW50OiAnICsgZGVzYy5leHRlbnNpb25Qb2ludCk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBFeHRlbnNpb25Qb2ludDxUPihkZXNjLmV4dGVuc2lvblBvaW50LCBkZXNjLmRlZmF1bHRFeHRlbnNpb25LaW5kLCBkZXNjLmNhbkhhbmRsZVJlc29sdmVyKTtcblx0XHR0aGlzLl9leHRlbnNpb25Qb2ludHMuc2V0KGRlc2MuZXh0ZW5zaW9uUG9pbnQsIHJlc3VsdCk7XG5cdFx0aWYgKGRlc2MuYWN0aXZhdGlvbkV2ZW50c0dlbmVyYXRvcikge1xuXHRcdFx0SW1wbGljaXRBY3RpdmF0aW9uRXZlbnRzLnJlZ2lzdGVyKGRlc2MuZXh0ZW5zaW9uUG9pbnQsIGRlc2MuYWN0aXZhdGlvbkV2ZW50c0dlbmVyYXRvcik7XG5cdFx0fVxuXG5cdFx0c2NoZW1hLnByb3BlcnRpZXMhWydjb250cmlidXRlcyddLnByb3BlcnRpZXMhW2Rlc2MuZXh0ZW5zaW9uUG9pbnRdID0gZGVzYy5qc29uU2NoZW1hO1xuXHRcdHNjaGVtYVJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKHNjaGVtYUlkLCBzY2hlbWEpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBnZXRFeHRlbnNpb25Qb2ludHMoKTogRXh0ZW5zaW9uUG9pbnQ8dW5rbm93bj5bXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fZXh0ZW5zaW9uUG9pbnRzLnZhbHVlcygpKTtcblx0fVxufVxuXG5jb25zdCBQUkV4dGVuc2lvbnMgPSB7XG5cdEV4dGVuc2lvbnNSZWdpc3RyeTogJ0V4dGVuc2lvbnNSZWdpc3RyeSdcbn07XG5SZWdpc3RyeS5hZGQoUFJFeHRlbnNpb25zLkV4dGVuc2lvbnNSZWdpc3RyeSwgbmV3IEV4dGVuc2lvbnNSZWdpc3RyeUltcGwoKSk7XG5leHBvcnQgY29uc3QgRXh0ZW5zaW9uc1JlZ2lzdHJ5OiBFeHRlbnNpb25zUmVnaXN0cnlJbXBsID0gUmVnaXN0cnkuYXMoUFJFeHRlbnNpb25zLkV4dGVuc2lvbnNSZWdpc3RyeSk7XG5cbnNjaGVtYVJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKHNjaGVtYUlkLCBzY2hlbWEpO1xuXG5cbnNjaGVtYVJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKHByb2R1Y3RTY2hlbWFJZCwge1xuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0ZXh0ZW5zaW9uRW5hYmxlZEFwaVByb3Bvc2Fsczoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncHJvZHVjdC5leHRlbnNpb25FbmFibGVkQXBpUHJvcG9zYWxzJywgXCJBUEkgcHJvcG9zYWxzIHRoYXQgdGhlIHJlc3BlY3RpdmUgZXh0ZW5zaW9ucyBjYW4gZnJlZWx5IHVzZS5cIiksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHt9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0YW55T2Y6IFt7XG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHR1bmlxdWVJdGVtczogdHJ1ZSxcblx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRlbnVtOiBPYmplY3Qua2V5cyhhbGxBcGlQcm9wb3NhbHMpLFxuXHRcdFx0XHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBPYmplY3QudmFsdWVzKGFsbEFwaVByb3Bvc2FscykubWFwKHZhbHVlID0+IHZhbHVlLnByb3Bvc2FsKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMseUJBQXlCO0FBRWxDLE9BQU8sY0FBYztBQUNyQixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGtCQUE2QztBQUN0RCxTQUFTLGdCQUFnQjtBQUV6QixTQUFnQyxzQkFBc0IsOEJBQThCO0FBRXBGLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0NBQTREO0FBRXJFLFNBQVMsdUJBQXVCO0FBRWhDLE1BQU0saUJBQWlCLFNBQVMsR0FBOEIsV0FBVyxnQkFBZ0I7QUFFbEYsTUFBTSwwQkFBMEI7QUFBQSxFQU10QyxZQUNDLGdCQUNBLFdBQ0Esa0JBQ0M7QUFDRCxTQUFLLGtCQUFrQjtBQUN2QixTQUFLLGFBQWE7QUFDbEIsU0FBSyxvQkFBb0I7QUFBQSxFQUMxQjtBQUFBLEVBRVEsS0FBSyxNQUFnQixTQUF1QjtBQUNuRCxTQUFLLGdCQUFnQjtBQUFBLE1BQ3BCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsYUFBYSxLQUFLLFdBQVc7QUFBQSxNQUM3QixrQkFBa0IsS0FBSztBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFTyxNQUFNLFNBQXVCO0FBQ25DLFNBQUssS0FBSyxTQUFTLE9BQU8sT0FBTztBQUFBLEVBQ2xDO0FBQUEsRUFFTyxLQUFLLFNBQXVCO0FBQ2xDLFNBQUssS0FBSyxTQUFTLFNBQVMsT0FBTztBQUFBLEVBQ3BDO0FBQUEsRUFFTyxLQUFLLFNBQXVCO0FBQ2xDLFNBQUssS0FBSyxTQUFTLE1BQU0sT0FBTztBQUFBLEVBQ2pDO0FBQ0Q7QUFpQk8sTUFBTSx3QkFBMkI7QUFBQSxFQTJCdkMsWUFDaUIs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
