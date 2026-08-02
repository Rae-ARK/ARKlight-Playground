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
import { coalesce, isNonEmptyArray } from "../../../../base/common/arrays.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { Event } from "../../../../base/common/event.js";
import { createCommandUri, MarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../../base/common/lifecycle.js";
import * as strings from "../../../../base/common/strings.js";
import { localize, localize2 } from "../../../../nls.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { ViewContainerLocation, Extensions as ViewExtensions } from "../../../common/views.js";
import { Extensions } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { isProposedApiEnabled } from "../../../services/extensions/common/extensions.js";
import * as extensionsRegistry from "../../../services/extensions/common/extensionsRegistry.js";
import { showExtensionsWithIdsCommandId } from "../../extensions/browser/extensionsActions.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { IChatAgentService } from "../common/participants/chatAgents.js";
import { ChatContextKeys } from "../common/actions/chatContextKeys.js";
import { ChatAgentLocation, ChatModeKind } from "../common/constants.js";
import { ChatViewId, ChatViewContainerId } from "./chat.js";
import { ChatViewPane } from "./widgetHosts/viewPane/chatViewPane.js";
const chatViewIcon = registerIcon("chat-view-icon", Codicon.chatSparkle, localize("chatViewIcon", "View icon of the chat view."));
const chatViewContainer = Registry.as(ViewExtensions.ViewContainersRegistry).registerViewContainer({
  id: ChatViewContainerId,
  title: localize2("chat.viewContainer.label", "Chat"),
  icon: chatViewIcon,
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [ChatViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
  storageId: ChatViewContainerId,
  hideIfEmpty: true,
  order: 1
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true, doNotRegisterOpenCommand: true });
const chatViewDescriptor = {
  id: ChatViewId,
  containerIcon: chatViewContainer.icon,
  containerTitle: chatViewContainer.title.value,
  singleViewPaneContainerTitle: chatViewContainer.title.value,
  name: localize2("chat.viewContainer.label", "Chat"),
  canToggleVisibility: false,
  canMoveView: true,
  openCommandActionDescriptor: {
    id: ChatViewContainerId,
    title: chatViewContainer.title,
    mnemonicTitle: localize({ key: "miToggleChat", comment: ["&& denotes a mnemonic"] }, "&&Chat"),
    keybindings: {
      primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI,
      mac: {
        primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyI
      }
    },
    order: 1
  },
  ctorDescriptor: new SyncDescriptor(ChatViewPane),
  when: ContextKeyExpr.and(
    ChatContextKeys.accountPolicyGateActive.negate(),
    ContextKeyExpr.or(
      ContextKeyExpr.and(
        ChatContextKeys.Setup.hidden.negate(),
        ChatContextKeys.Setup.disabledInWorkspace.negate()
      ),
      ChatContextKeys.panelParticipantRegistered,
      ChatContextKeys.extensionInvalid
    )
  )
};
Registry.as(ViewExtensions.ViewsRegistry).registerViews([chatViewDescriptor], chatViewContainer);
const chatParticipantExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "chatParticipants",
  jsonSchema: {
    description: localize("vscode.extension.contributes.chatParticipant", "Contributes a chat participant"),
    type: "array",
    items: {
      additionalProperties: false,
      type: "object",
      defaultSnippets: [{ body: { name: "", description: "" } }],
      required: ["name", "id"],
      properties: {
        id: {
          description: localize("chatParticipantId", "A unique id for this chat participant."),
          type: "string"
        },
        name: {
          description: localize("chatParticipantName", "User-facing name for this chat participant. The user will use '@' with this name to invoke the participant. Name must not contain whitespace."),
          type: "string",
          pattern: "^[\\w-]+$"
        },
        fullName: {
          markdownDescription: localize("chatParticipantFullName", "The full name of this chat participant, which is shown as the label for responses coming from this participant. If not provided, {0} is used.", "`name`"),
          type: "string"
        },
        description: {
          description: localize("chatParticipantDescription", "A description of this chat participant, shown in the UI."),
          type: "string"
        },
        isSticky: {
          description: localize("chatCommandSticky", "Whether invoking the command puts the chat into a persistent mode, where the command is automatically added to the chat input for the next message."),
          type: "boolean"
        },
        sampleRequest: {
          description: localize("chatSampleRequest", "When the user clicks this participant in `/help`, this text will be submitted to the participant."),
          type: "string"
        },
        when: {
          description: localize("chatParticipantWhen", "A condition which must be true to enable this participant."),
          type: "string"
        },
        disambiguation: {
          description: localize("chatParticipantDisambiguation", "Metadata to help with automatically routing user questions to this chat participant."),
          type: "array",
          items: {
            additionalProperties: false,
            type: "object",
            defaultSnippets: [{ body: { category: "", description: "", examples: [] } }],
            required: ["category", "description", "examples"],
            properties: {
              category: {
                markdownDescription: localize("chatParticipantDisambiguationCategory", "A detailed name for this category, e.g. `workspace_questions` or `web_questions`."),
                type: "string"
              },
              description: {
                description: localize("chatParticipantDisambiguationDescription", "A detailed description of the kinds of questions that are suitable for this chat participant."),
                type: "string"
              },
              examples: {
                description: localize("chatParticipantDisambiguationExamples", "A list of representative example questions that are suitable for this chat participant."),
                type: "array"
              }
            }
          }
        },
        commands: {
          markdownDescription: localize("chatCommandsDescription", "Commands available for this chat participant, which the user can invoke with a `/`."),
          type: "array",
          items: {
            additionalProperties: false,
            type: "object",
            defaultSnippets: [{ body: { name: "", description: "" } }],
            required: ["name"],
            properties: {
              name: {
                description: localize("chatCommand", "A short name by which this command is referred to in the UI, e.g. `fix` or `explain` for commands that fix an issue or explain code. The name should be unique among the commands provided by this participant."),
                type: "string"
              },
              description: {
                description: localize("chatCommandDescription", "A description of this command."),
                type: "string"
              },
              when: {
                description: localize("chatCommandWhen", "A condition which must be true to enable this command."),
                type: "string"
              },
              sampleRequest: {
                description: localize("chatCommandSampleRequest", "When the user clicks this command in `/help`, this text will be submitted to the participant."),
                type: "string"
              },
              isSticky: {
                description: localize("chatCommandSticky", "Whether invoking the command puts the chat into a persistent mode, where the command is automatically added to the chat input for the next message."),
                type: "boolean"
              },
              disambiguation: {
                description: localize("chatCommandDisambiguation", "Metadata to help with automatically routing user questions to this chat command."),
                type: "array",
                items: {
                  additionalProperties: false,
                  type: "object",
                  defaultSnippets: [{ body: { category: "", description: "", examples: [] } }],
                  required: ["category", "description", "examples"],
                  properties: {
                    category: {
                      markdownDescription: localize("chatCommandDisambiguationCategory", "A detailed name for this category, e.g. `workspace_questions` or `web_questions`."),
                      type: "string"
                    },
                    description: {
                      description: localize("chatCommandDisambiguationDescription", "A detailed description of the kinds of questions that are suitable for this chat command."),
                      type: "string"
                    },
                    examples: {
                      description: localize("chatCommandDisambiguationExamples", "A list of representative example questions that are suitable for this chat command."),
                      type: "array"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  activationEventsGenerator: function* (contributions) {
    for (const contrib of contributions) {
      yield `onChatParticipant:${contrib.id}`;
    }
  }
});
let ChatExtensionPointHandler = class {
  constructor(_chatAgentService) {
    this._chatAgentService = _chatAgentService;
    this._participantRegistrationDisposables = new DisposableMap();
    this.handleAndRegisterChatExtensions();
  }
  handleAndRegisterChatExtensions() {
    chatParticipantExtensionPoint.setHandler((extensions, delta) => {
      for (const extension of delta.added) {
        for (const providerDescriptor of extension.value) {
          if (!providerDescriptor.name?.match(/^[\w-]+$/)) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with invalid name: ${providerDescriptor.name}. Name must match /^[\\w-]+$/.`);
            continue;
          }
          if (providerDescriptor.fullName && strings.AmbiguousCharacters.getInstance(/* @__PURE__ */ new Set()).containsAmbiguousCharacter(providerDescriptor.fullName)) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with fullName that contains ambiguous characters: ${providerDescriptor.fullName}.`);
            continue;
          }
          if (providerDescriptor.fullName && strings.InvisibleCharacters.containsInvisibleCharacter(providerDescriptor.fullName.replace(/ /g, ""))) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with fullName that contains invisible characters: ${providerDescriptor.fullName}.`);
            continue;
          }
          if ((providerDescriptor.isDefault || providerDescriptor.modes) && !isProposedApiEnabled(extension.description, "defaultChatParticipant")) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT use API proposal: defaultChatParticipant.`);
            continue;
          }
          if (providerDescriptor.locations && !isProposedApiEnabled(extension.description, "chatParticipantAdditions")) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT use API proposal: chatParticipantAdditions.`);
            continue;
          }
          if (!providerDescriptor.id || !providerDescriptor.name) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant without both id and name.`);
            continue;
          }
          const participantsDisambiguation = [];
          if (providerDescriptor.disambiguation?.length) {
            participantsDisambiguation.push(...providerDescriptor.disambiguation.map((d) => ({
              ...d,
              category: d.category ?? d.categoryName
            })));
          }
          try {
            const store = new DisposableStore();
            store.add(this._chatAgentService.registerAgent(
              providerDescriptor.id,
              {
                extensionId: extension.description.identifier,
                extensionVersion: extension.description.version,
                publisherDisplayName: extension.description.publisherDisplayName ?? extension.description.publisher,
                // May not be present in OSS
                extensionPublisherId: extension.description.publisher,
                extensionDisplayName: extension.description.displayName ?? extension.description.name,
                id: providerDescriptor.id,
                description: providerDescriptor.description,
                when: providerDescriptor.when,
                metadata: {
                  isSticky: providerDescriptor.isSticky,
                  sampleRequest: providerDescriptor.sampleRequest
                },
                name: providerDescriptor.name,
                fullName: providerDescriptor.fullName,
                isDefault: providerDescriptor.isDefault,
                locations: isNonEmptyArray(providerDescriptor.locations) ? providerDescriptor.locations.map(ChatAgentLocation.fromRaw) : [ChatAgentLocation.Chat],
                modes: providerDescriptor.isDefault ? providerDescriptor.modes ?? [ChatModeKind.Ask] : [ChatModeKind.Agent, ChatModeKind.Ask, ChatModeKind.Edit],
                slashCommands: providerDescriptor.commands ?? [],
                disambiguation: coalesce(participantsDisambiguation.flat())
              }
            ));
            this._participantRegistrationDisposables.set(
              getParticipantKey(extension.description.identifier, providerDescriptor.id),
              store
            );
          } catch (e) {
            extension.collector.error(`Failed to register participant ${providerDescriptor.id}: ${toErrorMessage(e, true)}`);
          }
        }
      }
      for (const extension of delta.removed) {
        for (const providerDescriptor of extension.value) {
          this._participantRegistrationDisposables.deleteAndDispose(getParticipantKey(extension.description.identifier, providerDescriptor.id));
        }
      }
    });
  }
};
ChatExtensionPointHandler.ID = "workbench.contrib.chatExtensionPointHandler";
ChatExtensionPointHandler = __decorateClass([
  __decorateParam(0, IChatAgentService)
], ChatExtensionPointHandler);
function getParticipantKey(extensionId, participantName) {
  return `${extensionId.value}_${participantName}`;
}
let ChatCompatibilityNotifier = class extends Disposable {
  constructor(extensionsWorkbenchService, contextKeyService, productService) {
    super();
    this.productService = productService;
    this.registeredWelcomeView = false;
    const isInvalid = ChatContextKeys.extensionInvalid.bindTo(contextKeyService);
    this._register(Event.runAndSubscribe(
      extensionsWorkbenchService.onDidChangeExtensionsNotification,
      () => {
        const notification = extensionsWorkbenchService.getExtensionsNotification();
        const chatExtension = notification?.extensions.find((ext) => ExtensionIdentifier.equals(ext.identifier.id, this.productService.defaultChatAgent?.chatExtensionId));
        if (chatExtension) {
          isInvalid.set(true);
          this.registerWelcomeView(chatExtension);
        } else {
          isInvalid.set(false);
        }
      }
    ));
  }
  registerWelcomeView(chatExtension) {
    if (this.registeredWelcomeView) {
      return;
    }
    this.registeredWelcomeView = true;
    const showExtensionLabel = localize("showExtension", "Show Extension");
    const mainMessage = localize("chatFailErrorMessage", "Chat failed to load because the installed version of the Copilot Chat extension is not compatible with this version of {0}. Please ensure that the Copilot Chat extension is up to date.", this.productService.nameLong);
    const commandButton = `[${showExtensionLabel}](${createCommandUri(showExtensionsWithIdsCommandId, [this.productService.defaultChatAgent?.chatExtensionId])})`;
    const versionMessage = `Copilot Chat version: ${chatExtension.version}`;
    const viewsRegistry = Registry.as(ViewExtensions.ViewsRegistry);
    this._register(viewsRegistry.registerViewWelcomeContent(ChatViewId, {
      content: [mainMessage, commandButton, versionMessage].join("\n\n"),
      when: ChatContextKeys.extensionInvalid
    }));
  }
};
ChatCompatibilityNotifier.ID = "workbench.contrib.chatCompatNotifier";
ChatCompatibilityNotifier = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IProductService)
], ChatCompatibilityNotifier);
class ChatParticipantDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.chatParticipants;
  }
  render(manifest) {
    const nonDefaultContributions = manifest.contributes?.chatParticipants?.filter((c) => !c.isDefault) ?? [];
    if (!nonDefaultContributions.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("participantName", "Name"),
      localize("participantFullName", "Full Name"),
      localize("participantDescription", "Description"),
      localize("participantCommands", "Commands")
    ];
    const rows = nonDefaultContributions.map((d) => {
      return [
        "@" + d.name,
        d.fullName,
        d.description ?? "-",
        d.commands?.length ? new MarkdownString(d.commands.map((c) => `- /` + c.name).join("\n")) : "-"
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "chatParticipants",
  label: localize("chatParticipants", "Chat Participants"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ChatParticipantDataRenderer)
});
export {
  ChatCompatibilityNotifier,
  ChatExtensionPointHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0UGFydGljaXBhbnQuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY29hbGVzY2UsIGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb21tYW5kVXJpLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZUNvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmVDb250YWluZXIuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5LCBJVmlld0Rlc2NyaXB0b3IsIElWaWV3c1JlZ2lzdHJ5LCBWaWV3Q29udGFpbmVyLCBWaWV3Q29udGFpbmVyTG9jYXRpb24sIEV4dGVuc2lvbnMgYXMgVmlld0V4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnksIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciwgSVJlbmRlcmVkRGF0YSwgSVJvd0RhdGEsIElUYWJsZURhdGEgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0ICogYXMgZXh0ZW5zaW9uc1JlZ2lzdHJ5IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBzaG93RXh0ZW5zaW9uc1dpdGhJZHNDb21tYW5kSWQgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2Jyb3dzZXIvZXh0ZW5zaW9uc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbiwgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50RGF0YSwgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElSYXdDaGF0UGFydGljaXBhbnRDb250cmlidXRpb24gfSBmcm9tICcuLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRQYXJ0aWNpcGFudENvbnRyaWJUeXBlcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld0lkLCBDaGF0Vmlld0NvbnRhaW5lcklkIH0gZnJvbSAnLi9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRWaWV3UGFuZSB9IGZyb20gJy4vd2lkZ2V0SG9zdHMvdmlld1BhbmUvY2hhdFZpZXdQYW5lLmpzJztcblxuLy8gLS0tIENoYXQgQ29udGFpbmVyICYgIFZpZXcgUmVnaXN0cmF0aW9uXG5cbmNvbnN0IGNoYXRWaWV3SWNvbiA9IHJlZ2lzdGVySWNvbignY2hhdC12aWV3LWljb24nLCBDb2RpY29uLmNoYXRTcGFya2xlLCBsb2NhbGl6ZSgnY2hhdFZpZXdJY29uJywgJ1ZpZXcgaWNvbiBvZiB0aGUgY2hhdCB2aWV3LicpKTtcblxuY29uc3QgY2hhdFZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIgPSBSZWdpc3RyeS5hczxJVmlld0NvbnRhaW5lcnNSZWdpc3RyeT4oVmlld0V4dGVuc2lvbnMuVmlld0NvbnRhaW5lcnNSZWdpc3RyeSkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKHtcblx0aWQ6IENoYXRWaWV3Q29udGFpbmVySWQsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQudmlld0NvbnRhaW5lci5sYWJlbCcsIFwiQ2hhdFwiKSxcblx0aWNvbjogY2hhdFZpZXdJY29uLFxuXHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFZpZXdQYW5lQ29udGFpbmVyLCBbQ2hhdFZpZXdDb250YWluZXJJZCwgeyBtZXJnZVZpZXdXaXRoQ29udGFpbmVyV2hlblNpbmdsZVZpZXc6IHRydWUgfV0pLFxuXHRzdG9yYWdlSWQ6IENoYXRWaWV3Q29udGFpbmVySWQsXG5cdGhpZGVJZkVtcHR5OiB0cnVlLFxuXHRvcmRlcjogMSxcbn0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIsIHsgaXNEZWZhdWx0OiB0cnVlLCBkb05vdFJlZ2lzdGVyT3BlbkNvbW1hbmQ6IHRydWUgfSk7XG5cbmNvbnN0IGNoYXRWaWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yID0ge1xuXHRpZDogQ2hhdFZpZXdJZCxcblx0Y29udGFpbmVySWNvbjogY2hhdFZpZXdDb250YWluZXIuaWNvbixcblx0Y29udGFpbmVyVGl0bGU6IGNoYXRWaWV3Q29udGFpbmVyLnRpdGxlLnZhbHVlLFxuXHRzaW5nbGVWaWV3UGFuZUNvbnRhaW5lclRpdGxlOiBjaGF0Vmlld0NvbnRhaW5lci50aXRsZS52YWx1ZSxcblx0bmFtZTogbG9jYWxpemUyKCdjaGF0LnZpZXdDb250YWluZXIubGFiZWwnLCBcIkNoYXRcIiksXG5cdGNhblRvZ2dsZVZpc2liaWxpdHk6IGZhbHNlLFxuXHRjYW5Nb3ZlVmlldzogdHJ1ZSxcblx0b3BlbkNvbW1hbmRBY3Rpb25EZXNjcmlwdG9yOiB7XG5cdFx0aWQ6IENoYXRWaWV3Q29udGFpbmVySWQsXG5cdFx0dGl0bGU6IGNoYXRWaWV3Q29udGFpbmVyLnRpdGxlLFxuXHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlUb2dnbGVDaGF0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ2hhdFwiKSxcblx0XHRrZXliaW5kaW5nczoge1xuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlJLFxuXHRcdFx0bWFjOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLktleUlcblx0XHRcdH1cblx0XHR9LFxuXHRcdG9yZGVyOiAxXG5cdH0sXG5cdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoQ2hhdFZpZXdQYW5lKSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdENoYXRDb250ZXh0S2V5cy5hY2NvdW50UG9saWN5R2F0ZUFjdGl2ZS5uZWdhdGUoKSxcblx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSxcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdFx0XHQpLFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLnBhbmVsUGFydGljaXBhbnRSZWdpc3RlcmVkLFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLmV4dGVuc2lvbkludmFsaWRcblx0XHQpXG5cdClcbn07XG5SZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oVmlld0V4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSkucmVnaXN0ZXJWaWV3cyhbY2hhdFZpZXdEZXNjcmlwdG9yXSwgY2hhdFZpZXdDb250YWluZXIpO1xuXG5jb25zdCBjaGF0UGFydGljaXBhbnRFeHRlbnNpb25Qb2ludCA9IGV4dGVuc2lvbnNSZWdpc3RyeS5FeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJUmF3Q2hhdFBhcnRpY2lwYW50Q29udHJpYnV0aW9uW10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdjaGF0UGFydGljaXBhbnRzJyxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5jaGF0UGFydGljaXBhbnQnLCAnQ29udHJpYnV0ZXMgYSBjaGF0IHBhcnRpY2lwYW50JyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczoge1xuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgbmFtZTogJycsIGRlc2NyaXB0aW9uOiAnJyB9IH1dLFxuXHRcdFx0cmVxdWlyZWQ6IFsnbmFtZScsICdpZCddLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFBhcnRpY2lwYW50SWQnLCBcIkEgdW5pcXVlIGlkIGZvciB0aGlzIGNoYXQgcGFydGljaXBhbnQuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG5hbWU6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRQYXJ0aWNpcGFudE5hbWUnLCBcIlVzZXItZmFjaW5nIG5hbWUgZm9yIHRoaXMgY2hhdCBwYXJ0aWNpcGFudC4gVGhlIHVzZXIgd2lsbCB1c2UgJ0AnIHdpdGggdGhpcyBuYW1lIHRvIGludm9rZSB0aGUgcGFydGljaXBhbnQuIE5hbWUgbXVzdCBub3QgY29udGFpbiB3aGl0ZXNwYWNlLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRwYXR0ZXJuOiAnXltcXFxcdy1dKyQnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZ1bGxOYW1lOiB7XG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRQYXJ0aWNpcGFudEZ1bGxOYW1lJywgXCJUaGUgZnVsbCBuYW1lIG9mIHRoaXMgY2hhdCBwYXJ0aWNpcGFudCwgd2hpY2ggaXMgc2hvd24gYXMgdGhlIGxhYmVsIGZvciByZXNwb25zZXMgY29taW5nIGZyb20gdGhpcyBwYXJ0aWNpcGFudC4gSWYgbm90IHByb3ZpZGVkLCB7MH0gaXMgdXNlZC5cIiwgJ2BuYW1lYCcpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0UGFydGljaXBhbnREZXNjcmlwdGlvbicsIFwiQSBkZXNjcmlwdGlvbiBvZiB0aGlzIGNoYXQgcGFydGljaXBhbnQsIHNob3duIGluIHRoZSBVSS5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0aXNTdGlja3k6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRDb21tYW5kU3RpY2t5JywgXCJXaGV0aGVyIGludm9raW5nIHRoZSBjb21tYW5kIHB1dHMgdGhlIGNoYXQgaW50byBhIHBlcnNpc3RlbnQgbW9kZSwgd2hlcmUgdGhlIGNvbW1hbmQgaXMgYXV0b21hdGljYWxseSBhZGRlZCB0byB0aGUgY2hhdCBpbnB1dCBmb3IgdGhlIG5leHQgbWVzc2FnZS5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNhbXBsZVJlcXVlc3Q6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTYW1wbGVSZXF1ZXN0JywgXCJXaGVuIHRoZSB1c2VyIGNsaWNrcyB0aGlzIHBhcnRpY2lwYW50IGluIGAvaGVscGAsIHRoaXMgdGV4dCB3aWxsIGJlIHN1Ym1pdHRlZCB0byB0aGUgcGFydGljaXBhbnQuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdoZW46IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRQYXJ0aWNpcGFudFdoZW4nLCBcIkEgY29uZGl0aW9uIHdoaWNoIG11c3QgYmUgdHJ1ZSB0byBlbmFibGUgdGhpcyBwYXJ0aWNpcGFudC5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzYW1iaWd1YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRQYXJ0aWNpcGFudERpc2FtYmlndWF0aW9uJywgXCJNZXRhZGF0YSB0byBoZWxwIHdpdGggYXV0b21hdGljYWxseSByb3V0aW5nIHVzZXIgcXVlc3Rpb25zIHRvIHRoaXMgY2hhdCBwYXJ0aWNpcGFudC5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgY2F0ZWdvcnk6ICcnLCBkZXNjcmlwdGlvbjogJycsIGV4YW1wbGVzOiBbXSB9IH1dLFxuXHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnY2F0ZWdvcnknLCAnZGVzY3JpcHRpb24nLCAnZXhhbXBsZXMnXSxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IHtcblx0XHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFBhcnRpY2lwYW50RGlzYW1iaWd1YXRpb25DYXRlZ29yeScsIFwiQSBkZXRhaWxlZCBuYW1lIGZvciB0aGlzIGNhdGVnb3J5LCBlLmcuIGB3b3Jrc3BhY2VfcXVlc3Rpb25zYCBvciBgd2ViX3F1ZXN0aW9uc2AuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0UGFydGljaXBhbnREaXNhbWJpZ3VhdGlvbkRlc2NyaXB0aW9uJywgXCJBIGRldGFpbGVkIGRlc2NyaXB0aW9uIG9mIHRoZSBraW5kcyBvZiBxdWVzdGlvbnMgdGhhdCBhcmUgc3VpdGFibGUgZm9yIHRoaXMgY2hhdCBwYXJ0aWNpcGFudC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZXhhbXBsZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRQYXJ0aWNpcGFudERpc2FtYmlndWF0aW9uRXhhbXBsZXMnLCBcIkEgbGlzdCBvZiByZXByZXNlbnRhdGl2ZSBleGFtcGxlIHF1ZXN0aW9ucyB0aGF0IGFyZSBzdWl0YWJsZSBmb3IgdGhpcyBjaGF0IHBhcnRpY2lwYW50LlwiKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb21tYW5kczoge1xuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0Q29tbWFuZHNEZXNjcmlwdGlvbicsIFwiQ29tbWFuZHMgYXZhaWxhYmxlIGZvciB0aGlzIGNoYXQgcGFydGljaXBhbnQsIHdoaWNoIHRoZSB1c2VyIGNhbiBpbnZva2Ugd2l0aCBhIGAvYC5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgbmFtZTogJycsIGRlc2NyaXB0aW9uOiAnJyB9IH1dLFxuXHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnbmFtZSddLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRuYW1lOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0Q29tbWFuZCcsIFwiQSBzaG9ydCBuYW1lIGJ5IHdoaWNoIHRoaXMgY29tbWFuZCBpcyByZWZlcnJlZCB0byBpbiB0aGUgVUksIGUuZy4gYGZpeGAgb3IgYGV4cGxhaW5gIGZvciBjb21tYW5kcyB0aGF0IGZpeCBhbiBpc3N1ZSBvciBleHBsYWluIGNvZGUuIFRoZSBuYW1lIHNob3VsZCBiZSB1bmlxdWUgYW1vbmcgdGhlIGNvbW1hbmRzIHByb3ZpZGVkIGJ5IHRoaXMgcGFydGljaXBhbnQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0Q29tbWFuZERlc2NyaXB0aW9uJywgXCJBIGRlc2NyaXB0aW9uIG9mIHRoaXMgY29tbWFuZC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0d2hlbjoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdENvbW1hbmRXaGVuJywgXCJBIGNvbmRpdGlvbiB3aGljaCBtdXN0IGJlIHRydWUgdG8gZW5hYmxlIHRoaXMgY29tbWFuZC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0c2FtcGxlUmVxdWVzdDoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdENvbW1hbmRTYW1wbGVSZXF1ZXN0JywgXCJXaGVuIHRoZSB1c2VyIGNsaWNrcyB0aGlzIGNvbW1hbmQgaW4gYC9oZWxwYCwgdGhpcyB0ZXh0IHdpbGwgYmUgc3VibWl0dGVkIHRvIHRoZSBwYXJ0aWNpcGFudC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0aXNTdGlja3k6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRDb21tYW5kU3RpY2t5JywgXCJXaGV0aGVyIGludm9raW5nIHRoZSBjb21tYW5kIHB1dHMgdGhlIGNoYXQgaW50byBhIHBlcnNpc3RlbnQgbW9kZSwgd2hlcmUgdGhlIGNvbW1hbmQgaXMgYXV0b21hdGljYWxseSBhZGRlZCB0byB0aGUgY2hhdCBpbnB1dCBmb3IgdGhlIG5leHQgbWVzc2FnZS5cIiksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGRpc2FtYmlndWF0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0Q29tbWFuZERpc2FtYmlndWF0aW9uJywgXCJNZXRhZGF0YSB0byBoZWxwIHdpdGggYXV0b21hdGljYWxseSByb3V0aW5nIHVzZXIgcXVlc3Rpb25zIHRvIHRoaXMgY2hhdCBjb21tYW5kLlwiKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyBjYXRlZ29yeTogJycsIGRlc2NyaXB0aW9uOiAnJywgZXhhbXBsZXM6IFtdIH0gfV0sXG5cdFx0XHRcdFx0XHRcdFx0XHRyZXF1aXJlZDogWydjYXRlZ29yeScsICdkZXNjcmlwdGlvbicsICdleGFtcGxlcyddLFxuXHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRjYXRlZ29yeToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0Q29tbWFuZERpc2FtYmlndWF0aW9uQ2F0ZWdvcnknLCBcIkEgZGV0YWlsZWQgbmFtZSBmb3IgdGhpcyBjYXRlZ29yeSwgZS5nLiBgd29ya3NwYWNlX3F1ZXN0aW9uc2Agb3IgYHdlYl9xdWVzdGlvbnNgLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdENvbW1hbmREaXNhbWJpZ3VhdGlvbkRlc2NyaXB0aW9uJywgXCJBIGRldGFpbGVkIGRlc2NyaXB0aW9uIG9mIHRoZSBraW5kcyBvZiBxdWVzdGlvbnMgdGhhdCBhcmUgc3VpdGFibGUgZm9yIHRoaXMgY2hhdCBjb21tYW5kLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRleGFtcGxlczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdENvbW1hbmREaXNhbWJpZ3VhdGlvbkV4YW1wbGVzJywgXCJBIGxpc3Qgb2YgcmVwcmVzZW50YXRpdmUgZXhhbXBsZSBxdWVzdGlvbnMgdGhhdCBhcmUgc3VpdGFibGUgZm9yIHRoaXMgY2hhdCBjb21tYW5kLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH1cblx0fSxcblx0YWN0aXZhdGlvbkV2ZW50c0dlbmVyYXRvcjogZnVuY3Rpb24qIChjb250cmlidXRpb25zOiByZWFkb25seSBJUmF3Q2hhdFBhcnRpY2lwYW50Q29udHJpYnV0aW9uW10pIHtcblx0XHRmb3IgKGNvbnN0IGNvbnRyaWIgb2YgY29udHJpYnV0aW9ucykge1xuXHRcdFx0eWllbGQgYG9uQ2hhdFBhcnRpY2lwYW50OiR7Y29udHJpYi5pZH1gO1xuXHRcdH1cblx0fSxcbn0pO1xuXG5leHBvcnQgY2xhc3MgQ2hhdEV4dGVuc2lvblBvaW50SGFuZGxlciBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jaGF0RXh0ZW5zaW9uUG9pbnRIYW5kbGVyJztcblxuXHRwcml2YXRlIF9wYXJ0aWNpcGFudFJlZ2lzdHJhdGlvbkRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5oYW5kbGVBbmRSZWdpc3RlckNoYXRFeHRlbnNpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUFuZFJlZ2lzdGVyQ2hhdEV4dGVuc2lvbnMoKTogdm9pZCB7XG5cdFx0Y2hhdFBhcnRpY2lwYW50RXh0ZW5zaW9uUG9pbnQuc2V0SGFuZGxlcigoZXh0ZW5zaW9ucywgZGVsdGEpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGRlbHRhLmFkZGVkKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXJEZXNjcmlwdG9yIG9mIGV4dGVuc2lvbi52YWx1ZSkge1xuXHRcdFx0XHRcdGlmICghcHJvdmlkZXJEZXNjcmlwdG9yLm5hbWU/Lm1hdGNoKC9eW1xcdy1dKyQvKSkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihgRXh0ZW5zaW9uICcke2V4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlfScgQ0FOTk9UIHJlZ2lzdGVyIHBhcnRpY2lwYW50IHdpdGggaW52YWxpZCBuYW1lOiAke3Byb3ZpZGVyRGVzY3JpcHRvci5uYW1lfS4gTmFtZSBtdXN0IG1hdGNoIC9eW1xcXFx3LV0rJC8uYCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAocHJvdmlkZXJEZXNjcmlwdG9yLmZ1bGxOYW1lICYmIHN0cmluZ3MuQW1iaWd1b3VzQ2hhcmFjdGVycy5nZXRJbnN0YW5jZShuZXcgU2V0KCkpLmNvbnRhaW5zQW1iaWd1b3VzQ2hhcmFjdGVyKHByb3ZpZGVyRGVzY3JpcHRvci5mdWxsTmFtZSkpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IoYEV4dGVuc2lvbiAnJHtleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZX0nIENBTk5PVCByZWdpc3RlciBwYXJ0aWNpcGFudCB3aXRoIGZ1bGxOYW1lIHRoYXQgY29udGFpbnMgYW1iaWd1b3VzIGNoYXJhY3RlcnM6ICR7cHJvdmlkZXJEZXNjcmlwdG9yLmZ1bGxOYW1lfS5gKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFNwYWNlcyBhcmUgYWxsb3dlZCBidXQgY29uc2lkZXJlZCBcImludmlzaWJsZVwiXG5cdFx0XHRcdFx0aWYgKHByb3ZpZGVyRGVzY3JpcHRvci5mdWxsTmFtZSAmJiBzdHJpbmdzLkludmlzaWJsZUNoYXJhY3RlcnMuY29udGFpbnNJbnZpc2libGVDaGFyYWN0ZXIocHJvdmlkZXJEZXNjcmlwdG9yLmZ1bGxOYW1lLnJlcGxhY2UoLyAvZywgJycpKSkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihgRXh0ZW5zaW9uICcke2V4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlfScgQ0FOTk9UIHJlZ2lzdGVyIHBhcnRpY2lwYW50IHdpdGggZnVsbE5hbWUgdGhhdCBjb250YWlucyBpbnZpc2libGUgY2hhcmFjdGVyczogJHtwcm92aWRlckRlc2NyaXB0b3IuZnVsbE5hbWV9LmApO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKChwcm92aWRlckRlc2NyaXB0b3IuaXNEZWZhdWx0IHx8IHByb3ZpZGVyRGVzY3JpcHRvci5tb2RlcykgJiYgIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbi5kZXNjcmlwdGlvbiwgJ2RlZmF1bHRDaGF0UGFydGljaXBhbnQnKSkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihgRXh0ZW5zaW9uICcke2V4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlfScgQ0FOTk9UIHVzZSBBUEkgcHJvcG9zYWw6IGRlZmF1bHRDaGF0UGFydGljaXBhbnQuYCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAocHJvdmlkZXJEZXNjcmlwdG9yLmxvY2F0aW9ucyAmJiAhaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJykpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IoYEV4dGVuc2lvbiAnJHtleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZX0nIENBTk5PVCB1c2UgQVBJIHByb3Bvc2FsOiBjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMuYCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIXByb3ZpZGVyRGVzY3JpcHRvci5pZCB8fCAhcHJvdmlkZXJEZXNjcmlwdG9yLm5hbWUpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IoYEV4dGVuc2lvbiAnJHtleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZX0nIENBTk5PVCByZWdpc3RlciBwYXJ0aWNpcGFudCB3aXRob3V0IGJvdGggaWQgYW5kIG5hbWUuYCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBwYXJ0aWNpcGFudHNEaXNhbWJpZ3VhdGlvbjoge1xuXHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IHN0cmluZztcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdFx0XHRcdFx0XHRleGFtcGxlczogc3RyaW5nW107XG5cdFx0XHRcdFx0fVtdID0gW107XG5cblx0XHRcdFx0XHRpZiAocHJvdmlkZXJEZXNjcmlwdG9yLmRpc2FtYmlndWF0aW9uPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdHBhcnRpY2lwYW50c0Rpc2FtYmlndWF0aW9uLnB1c2goLi4ucHJvdmlkZXJEZXNjcmlwdG9yLmRpc2FtYmlndWF0aW9uLm1hcCgoZCkgPT4gKHtcblx0XHRcdFx0XHRcdFx0Li4uZCwgY2F0ZWdvcnk6IGQuY2F0ZWdvcnkgPz8gZC5jYXRlZ29yeU5hbWVcblx0XHRcdFx0XHRcdH0pKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRcdFx0c3RvcmUuYWRkKHRoaXMuX2NoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudChcblx0XHRcdFx0XHRcdFx0cHJvdmlkZXJEZXNjcmlwdG9yLmlkLFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvblZlcnNpb246IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi52ZXJzaW9uLFxuXHRcdFx0XHRcdFx0XHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBleHRlbnNpb24uZGVzY3JpcHRpb24ucHVibGlzaGVyRGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLnB1Ymxpc2hlciwgLy8gTWF5IG5vdCBiZSBwcmVzZW50IGluIE9TU1xuXHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvblB1Ymxpc2hlcklkOiBleHRlbnNpb24uZGVzY3JpcHRpb24ucHVibGlzaGVyLFxuXHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbkRpc3BsYXlOYW1lOiBleHRlbnNpb24uZGVzY3JpcHRpb24uZGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLm5hbWUsXG5cdFx0XHRcdFx0XHRcdFx0aWQ6IHByb3ZpZGVyRGVzY3JpcHRvci5pZCxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogcHJvdmlkZXJEZXNjcmlwdG9yLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0XHRcdHdoZW46IHByb3ZpZGVyRGVzY3JpcHRvci53aGVuLFxuXHRcdFx0XHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpc1N0aWNreTogcHJvdmlkZXJEZXNjcmlwdG9yLmlzU3RpY2t5LFxuXHRcdFx0XHRcdFx0XHRcdFx0c2FtcGxlUmVxdWVzdDogcHJvdmlkZXJEZXNjcmlwdG9yLnNhbXBsZVJlcXVlc3QsXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiBwcm92aWRlckRlc2NyaXB0b3IubmFtZSxcblx0XHRcdFx0XHRcdFx0XHRmdWxsTmFtZTogcHJvdmlkZXJEZXNjcmlwdG9yLmZ1bGxOYW1lLFxuXHRcdFx0XHRcdFx0XHRcdGlzRGVmYXVsdDogcHJvdmlkZXJEZXNjcmlwdG9yLmlzRGVmYXVsdCxcblx0XHRcdFx0XHRcdFx0XHRsb2NhdGlvbnM6IGlzTm9uRW1wdHlBcnJheShwcm92aWRlckRlc2NyaXB0b3IubG9jYXRpb25zKSA/XG5cdFx0XHRcdFx0XHRcdFx0XHRwcm92aWRlckRlc2NyaXB0b3IubG9jYXRpb25zLm1hcChDaGF0QWdlbnRMb2NhdGlvbi5mcm9tUmF3KSA6XG5cdFx0XHRcdFx0XHRcdFx0XHRbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdFx0XHRcdFx0XHRcdFx0bW9kZXM6IHByb3ZpZGVyRGVzY3JpcHRvci5pc0RlZmF1bHQgPyAocHJvdmlkZXJEZXNjcmlwdG9yLm1vZGVzID8/IFtDaGF0TW9kZUtpbmQuQXNrXSkgOiBbQ2hhdE1vZGVLaW5kLkFnZW50LCBDaGF0TW9kZUtpbmQuQXNrLCBDaGF0TW9kZUtpbmQuRWRpdF0sXG5cdFx0XHRcdFx0XHRcdFx0c2xhc2hDb21tYW5kczogcHJvdmlkZXJEZXNjcmlwdG9yLmNvbW1hbmRzID8/IFtdLFxuXHRcdFx0XHRcdFx0XHRcdGRpc2FtYmlndWF0aW9uOiBjb2FsZXNjZShwYXJ0aWNpcGFudHNEaXNhbWJpZ3VhdGlvbi5mbGF0KCkpLFxuXHRcdFx0XHRcdFx0XHR9IHNhdGlzZmllcyBJQ2hhdEFnZW50RGF0YSkpO1xuXG5cdFx0XHRcdFx0XHR0aGlzLl9wYXJ0aWNpcGFudFJlZ2lzdHJhdGlvbkRpc3Bvc2FibGVzLnNldChcblx0XHRcdFx0XHRcdFx0Z2V0UGFydGljaXBhbnRLZXkoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIsIHByb3ZpZGVyRGVzY3JpcHRvci5pZCksXG5cdFx0XHRcdFx0XHRcdHN0b3JlXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IoYEZhaWxlZCB0byByZWdpc3RlciBwYXJ0aWNpcGFudCAke3Byb3ZpZGVyRGVzY3JpcHRvci5pZH06ICR7dG9FcnJvck1lc3NhZ2UoZSwgdHJ1ZSl9YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGRlbHRhLnJlbW92ZWQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBwcm92aWRlckRlc2NyaXB0b3Igb2YgZXh0ZW5zaW9uLnZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGFydGljaXBhbnRSZWdpc3RyYXRpb25EaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKGdldFBhcnRpY2lwYW50S2V5KGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLCBwcm92aWRlckRlc2NyaXB0b3IuaWQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFBhcnRpY2lwYW50S2V5KGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBwYXJ0aWNpcGFudE5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBgJHtleHRlbnNpb25JZC52YWx1ZX1fJHtwYXJ0aWNpcGFudE5hbWV9YDtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRDb21wYXRpYmlsaXR5Tm90aWZpZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jaGF0Q29tcGF0Tm90aWZpZXInO1xuXG5cdHByaXZhdGUgcmVnaXN0ZXJlZFdlbGNvbWVWaWV3ID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIEl0IG1heSBiZSBiZXR0ZXIgdG8gaGF2ZSBzb21lIGdlbmVyaWMgVUkgZm9yIHRoaXMsIGZvciBhbnkgZXh0ZW5zaW9uIHRoYXQgaXMgaW5jb21wYXRpYmxlLFxuXHRcdC8vIGJ1dCB0aGlzIGlzIG9ubHkgZW5hYmxlZCBmb3IgQ2hhdCBub3cgYW5kIGl0IG5lZWRzIHRvIGJlIG9idmlvdXMuXG5cdFx0Y29uc3QgaXNJbnZhbGlkID0gQ2hhdENvbnRleHRLZXlzLmV4dGVuc2lvbkludmFsaWQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUoXG5cdFx0XHRleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnNOb3RpZmljYXRpb24sXG5cdFx0XHQoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnNOb3RpZmljYXRpb24oKTtcblx0XHRcdFx0Y29uc3QgY2hhdEV4dGVuc2lvbiA9IG5vdGlmaWNhdGlvbj8uZXh0ZW5zaW9ucy5maW5kKGV4dCA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhleHQuaWRlbnRpZmllci5pZCwgdGhpcy5wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50Py5jaGF0RXh0ZW5zaW9uSWQpKTtcblx0XHRcdFx0aWYgKGNoYXRFeHRlbnNpb24pIHtcblx0XHRcdFx0XHRpc0ludmFsaWQuc2V0KHRydWUpO1xuXHRcdFx0XHRcdHRoaXMucmVnaXN0ZXJXZWxjb21lVmlldyhjaGF0RXh0ZW5zaW9uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpc0ludmFsaWQuc2V0KGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlcldlbGNvbWVWaWV3KGNoYXRFeHRlbnNpb246IElFeHRlbnNpb24pIHtcblx0XHRpZiAodGhpcy5yZWdpc3RlcmVkV2VsY29tZVZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnJlZ2lzdGVyZWRXZWxjb21lVmlldyA9IHRydWU7XG5cdFx0Y29uc3Qgc2hvd0V4dGVuc2lvbkxhYmVsID0gbG9jYWxpemUoJ3Nob3dFeHRlbnNpb24nLCBcIlNob3cgRXh0ZW5zaW9uXCIpO1xuXHRcdGNvbnN0IG1haW5NZXNzYWdlID0gbG9jYWxpemUoJ2NoYXRGYWlsRXJyb3JNZXNzYWdlJywgXCJDaGF0IGZhaWxlZCB0byBsb2FkIGJlY2F1c2UgdGhlIGluc3RhbGxlZCB2ZXJzaW9uIG9mIHRoZSBDb3BpbG90IENoYXQgZXh0ZW5zaW9uIGlzIG5vdCBjb21wYXRpYmxlIHdpdGggdGhpcyB2ZXJzaW9uIG9mIHswfS4gUGxlYXNlIGVuc3VyZSB0aGF0IHRoZSBDb3BpbG90IENoYXQgZXh0ZW5zaW9uIGlzIHVwIHRvIGRhdGUuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpO1xuXHRcdGNvbnN0IGNvbW1hbmRCdXR0b24gPSBgWyR7c2hvd0V4dGVuc2lvbkxhYmVsfV0oJHtjcmVhdGVDb21tYW5kVXJpKHNob3dFeHRlbnNpb25zV2l0aElkc0NvbW1hbmRJZCwgW3RoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkXSl9KWA7XG5cdFx0Y29uc3QgdmVyc2lvbk1lc3NhZ2UgPSBgQ29waWxvdCBDaGF0IHZlcnNpb246ICR7Y2hhdEV4dGVuc2lvbi52ZXJzaW9ufWA7XG5cdFx0Y29uc3Qgdmlld3NSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihWaWV3RXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih2aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld1dlbGNvbWVDb250ZW50KENoYXRWaWV3SWQsIHtcblx0XHRcdGNvbnRlbnQ6IFttYWluTWVzc2FnZSwgY29tbWFuZEJ1dHRvbiwgdmVyc2lvbk1lc3NhZ2VdLmpvaW4oJ1xcblxcbicpLFxuXHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmV4dGVuc2lvbkludmFsaWQsXG5cdFx0fSkpO1xuXHR9XG59XG5cbmNsYXNzIENoYXRQYXJ0aWNpcGFudERhdGFSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIge1xuXHRyZWFkb25seSB0eXBlID0gJ3RhYmxlJztcblxuXHRzaG91bGRSZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIW1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5jaGF0UGFydGljaXBhbnRzO1xuXHR9XG5cblx0cmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBJUmVuZGVyZWREYXRhPElUYWJsZURhdGE+IHtcblx0XHRjb25zdCBub25EZWZhdWx0Q29udHJpYnV0aW9ucyA9IG1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5jaGF0UGFydGljaXBhbnRzPy5maWx0ZXIoYyA9PiAhYy5pc0RlZmF1bHQpID8/IFtdO1xuXHRcdGlmICghbm9uRGVmYXVsdENvbnRyaWJ1dGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4geyBkYXRhOiB7IGhlYWRlcnM6IFtdLCByb3dzOiBbXSB9LCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHR9XG5cblx0XHRjb25zdCBoZWFkZXJzID0gW1xuXHRcdFx0bG9jYWxpemUoJ3BhcnRpY2lwYW50TmFtZScsIFwiTmFtZVwiKSxcblx0XHRcdGxvY2FsaXplKCdwYXJ0aWNpcGFudEZ1bGxOYW1lJywgXCJGdWxsIE5hbWVcIiksXG5cdFx0XHRsb2NhbGl6ZSgncGFydGljaXBhbnREZXNjcmlwdGlvbicsIFwiRGVzY3JpcHRpb25cIiksXG5cdFx0XHRsb2NhbGl6ZSgncGFydGljaXBhbnRDb21tYW5kcycsIFwiQ29tbWFuZHNcIiksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJvd3M6IElSb3dEYXRhW11bXSA9IG5vbkRlZmF1bHRDb250cmlidXRpb25zLm1hcChkID0+IHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdCdAJyArIGQubmFtZSxcblx0XHRcdFx0ZC5mdWxsTmFtZSxcblx0XHRcdFx0ZC5kZXNjcmlwdGlvbiA/PyAnLScsXG5cdFx0XHRcdGQuY29tbWFuZHM/Lmxlbmd0aCA/IG5ldyBNYXJrZG93blN0cmluZyhkLmNvbW1hbmRzLm1hcChjID0+IGAtIC9gICsgYy5uYW1lKS5qb2luKCdcXG4nKSkgOiAnLSdcblx0XHRcdF07XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRyb3dzXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5yZWdpc3RlckV4dGVuc2lvbkZlYXR1cmUoe1xuXHRpZDogJ2NoYXRQYXJ0aWNpcGFudHMnLFxuXHRsYWJlbDogbG9jYWxpemUoJ2NoYXRQYXJ0aWNpcGFudHMnLCBcIkNoYXQgUGFydGljaXBhbnRzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoQ2hhdFBhcnRpY2lwYW50RGF0YVJlbmRlcmVyKSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFVBQVUsdUJBQXVCO0FBQzFDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0Isc0JBQXNCO0FBQ2pELFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsWUFBWSxlQUFlLHVCQUF1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
