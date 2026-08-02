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
import { append, DisposableResizeObserver, getWindow, h } from "../../../../../../../base/browser/dom.js";
import { HoverStyle } from "../../../../../../../base/browser/ui/hover/hover.js";
import { HoverPosition } from "../../../../../../../base/browser/ui/hover/hoverWidget.js";
import { Separator } from "../../../../../../../base/common/actions.js";
import { asArray } from "../../../../../../../base/common/arrays.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { ErrorNoTelemetry, onUnexpectedError } from "../../../../../../../base/common/errors.js";
import { createCommandUri, escapeMarkdownSyntaxTokens, MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import Severity from "../../../../../../../base/common/severity.js";
import { isObject } from "../../../../../../../base/common/types.js";
import { ILanguageService } from "../../../../../../../editor/common/languages/language.js";
import { localize } from "../../../../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../../../platform/dialogs/common/dialogs.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../../platform/storage/common/storage.js";
import { IPreferencesService } from "../../../../../../services/preferences/common/preferences.js";
import { ITerminalChatService } from "../../../../../terminal/browser/terminal.js";
import { TerminalContribCommandId, TerminalContribSettingId } from "../../../../../terminal/terminalContribExports.js";
import { ChatContextKeys } from "../../../../common/actions/chatContextKeys.js";
import { migrateLegacyTerminalToolSpecificData } from "../../../../common/chat.js";
import { SessionType } from "../../../../common/chatSessionsService.js";
import { getChatSessionType } from "../../../../common/model/chatUri.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { ILanguageModelToolsService } from "../../../../common/tools/languageModelToolsService.js";
import { AcceptToolConfirmationActionId, SkipToolConfirmationActionId } from "../../../actions/chatToolActions.js";
import { IChatWidgetService } from "../../../chat.js";
import { IChatToolRiskAssessmentService } from "../../../tools/chatToolRiskAssessmentService.js";
import { ChatCustomConfirmationWidget } from "../chatConfirmationWidget.js";
import { ChatMarkdownContentPart } from "../chatMarkdownContentPart.js";
import { CodeBlockPart } from "../codeBlockPart.js";
import { BaseChatToolInvocationSubPart } from "./chatToolInvocationSubPart.js";
import { createApprovalReasonBadge, createToolRiskBadge } from "./toolRiskBadgeHelper.js";
var TerminalToolConfirmationStorageKeys = /* @__PURE__ */ ((TerminalToolConfirmationStorageKeys2) => {
  TerminalToolConfirmationStorageKeys2["TerminalAutoApproveWarningAccepted"] = "chat.tools.terminal.autoApprove.warningAccepted";
  return TerminalToolConfirmationStorageKeys2;
})(TerminalToolConfirmationStorageKeys || {});
let ChatTerminalToolConfirmationSubPart = class extends BaseChatToolInvocationSubPart {
  constructor(toolInvocation, terminalData, context, renderer, editorPool, currentWidthDelegate, codeBlockStartIndex, instantiationService, dialogService, keybindingService, languageService, configurationService, contextKeyService, chatWidgetService, preferencesService, storageService, terminalChatService, hoverService, languageModelToolsService, riskAssessmentService) {
    super(toolInvocation);
    this.context = context;
    this.renderer = renderer;
    this.editorPool = editorPool;
    this.currentWidthDelegate = currentWidthDelegate;
    this.codeBlockStartIndex = codeBlockStartIndex;
    this.instantiationService = instantiationService;
    this.dialogService = dialogService;
    this.keybindingService = keybindingService;
    this.languageService = languageService;
    this.configurationService = configurationService;
    this.contextKeyService = contextKeyService;
    this.chatWidgetService = chatWidgetService;
    this.preferencesService = preferencesService;
    this.storageService = storageService;
    this.terminalChatService = terminalChatService;
    this.languageModelToolsService = languageModelToolsService;
    this.riskAssessmentService = riskAssessmentService;
    this.codeblocks = [];
    const state = toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation || !state.confirmationMessages?.title) {
      throw new Error("Confirmation messages are missing");
    }
    terminalData = migrateLegacyTerminalToolSpecificData(terminalData);
    const { title, message, disclaimer, terminalCustomActions } = state.confirmationMessages;
    const initialContent = terminalData.presentationOverrides?.commandLine ?? terminalData.confirmation?.commandLine ?? (terminalData.commandLine.toolEdited ?? terminalData.commandLine.original).trimStart();
    const cdPrefix = terminalData.confirmation?.cdPrefix ?? "";
    const isReadOnly = !!terminalData.presentationOverrides;
    const autoApproveEnabled = this.configurationService.getValue(TerminalContribSettingId.EnableAutoApprove) === true;
    let customActions = terminalCustomActions;
    const buildMoreActions = () => {
      if (!autoApproveEnabled) {
        return void 0;
      }
      const autoApproveWarningAccepted = this.storageService.getBoolean("chat.tools.terminal.autoApprove.warningAccepted" /* TerminalAutoApproveWarningAccepted */, StorageScope.APPLICATION, false);
      const moreActions = [];
      if (!autoApproveWarningAccepted) {
        moreActions.push({
          label: localize("autoApprove.enable", "Enable Auto Approve..."),
          data: {
            type: "enable"
          }
        });
        moreActions.push(new Separator());
        if (customActions) {
          for (const action of customActions) {
            if (!(action instanceof Separator)) {
              action.disabled = true;
            }
          }
        }
      }
      if (customActions) {
        moreActions.push(...customActions);
      }
      return moreActions.length === 0 ? void 0 : moreActions;
    };
    const codeBlockRenderOptions = {
      hideToolbar: true,
      reserveWidth: 19,
      verticalPadding: 5,
      editorOptions: {
        wordWrap: "on",
        readOnly: isReadOnly,
        tabFocusMode: true,
        ariaLabel: typeof title === "string" ? title : title.value
      }
    };
    const languageId = this.languageService.getLanguageIdByLanguageName(terminalData.presentationOverrides?.language ?? terminalData.language ?? "sh") ?? "shellscript";
    const key = CodeBlockPart.poolKey(this.context.element.id, this.codeBlockStartIndex);
    const editor = this._register(this.editorPool.get(key));
    editor.object.render({
      codeBlockIndex: this.codeBlockStartIndex,
      element: this.context.element,
      languageId,
      text: initialContent,
      renderOptions: codeBlockRenderOptions,
      chatSessionResource: this.context.element.sessionResource
    }, this.currentWidthDelegate());
    const model = editor.object.editor.getModel();
    this.codeblocks.push({
      codeBlockIndex: this.codeBlockStartIndex,
      codemapperUri: void 0,
      elementId: this.context.element.id,
      focus: () => editor.object.focus(),
      ownerMarkdownPartId: this.codeblocksPartId,
      uri: model.uri,
      chatSessionResource: this.context.element.sessionResource
    });
    this._register(model.onDidChangeContent(() => {
      const currentValue = model.getValue();
      if (currentValue !== initialContent) {
        terminalData.commandLine.userEdited = cdPrefix + currentValue;
      } else {
        terminalData.commandLine.userEdited = void 0;
      }
    }));
    const elements = h(".chat-confirmation-message-terminal", [
      h(".chat-confirmation-message-terminal-editor@editor"),
      h(".chat-confirmation-message-terminal-disclaimer@disclaimer")
    ]);
    append(elements.editor, editor.object.element);
    const editorResizeObserver = this._register(new DisposableResizeObserver("ChatTerminalToolConfirmationSubPart.editor", (entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) {
        editor.object.layout(width);
      }
    }, getWindow(this.context.container)));
    this._register(editorResizeObserver.observe(elements.editor));
    this._register(hoverService.setupDelayedHover(elements.editor, {
      content: message || "",
      style: HoverStyle.Pointer,
      position: { hoverPosition: HoverPosition.LEFT }
    }));
    const riskBadge = createApprovalReasonBadge(this._store, this.instantiationService, state.confirmationMessages.approvalReason) ?? createToolRiskBadge(this._store, this.instantiationService, this.riskAssessmentService, this.languageModelToolsService, this.toolInvocation.toolId, state.parameters, "terminal");
    const confirmWidget = this._register(this.instantiationService.createInstance(
      ChatCustomConfirmationWidget,
      this.context,
      {
        title,
        icon: Codicon.terminal,
        message: elements.root,
        footerBanner: riskBadge?.domNode,
        buttons: this._createButtons(buildMoreActions())
      }
    ));
    if (autoApproveEnabled && !customActions && terminalData.autoApproveRuleResolvable && getChatSessionType(this.context.element.sessionResource) === SessionType.AgentHostCopilot) {
      const commandForAnalysis = terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
      const analysisLanguage = terminalData.language === "powershell" ? "powershell" : "shellscript";
      this.terminalChatService.getAutoApproveActions(commandForAnalysis, analysisLanguage).then((actions) => {
        if (this._store.isDisposed || !actions?.length) {
          return;
        }
        if (toolInvocation.state.get().type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
          return;
        }
        customActions = actions;
        confirmWidget.updateButtons(this._createButtons(buildMoreActions()));
      }, onUnexpectedError);
    }
    const detailParts = [];
    if (terminalData.requestUnsandboxedExecution) {
      const reasonText = terminalData.requestUnsandboxedExecutionReason && terminalData.requestUnsandboxedExecutionReason.trim() || localize("chat.terminal.unsandboxedExecution.defaultReason", "The model did not provide a reason for requesting unsandboxed execution.");
      const inline = new MarkdownString(void 0, { supportThemeIcons: true });
      inline.appendMarkdown(`$(${Codicon.info.id}) `);
      inline.appendText(reasonText);
      detailParts.push({
        inline,
        hoverLabel: localize("chat.terminal.detail.sandboxInsufficient", "Sandbox insufficient:"),
        hoverBody: escapeMarkdownSyntaxTokens(reasonText),
        isTrusted: void 0
      });
    }
    if (terminalData.requestAllowNetwork) {
      const reasonText = terminalData.requestAllowNetworkReason && terminalData.requestAllowNetworkReason.trim() || localize("chat.terminal.allowNetwork.defaultReason", "The model did not provide a reason for requesting unrestricted network access in the sandbox.");
      const inline = new MarkdownString(void 0, { supportThemeIcons: true });
      inline.appendMarkdown(`$(${Codicon.info.id}) `);
      inline.appendText(reasonText);
      detailParts.push({
        inline,
        hoverLabel: localize("chat.terminal.detail.unrestrictedNetwork", "Unrestricted network access:"),
        hoverBody: escapeMarkdownSyntaxTokens(reasonText),
        isTrusted: void 0
      });
    }
    if (disclaimer) {
      const inline = typeof disclaimer === "string" ? new MarkdownString(disclaimer) : disclaimer;
      const hoverBody = inline.value.replace(/^\s*\$\([^)]+\)\s*/, "");
      detailParts.push({
        inline,
        hoverLabel: localize("chat.terminal.detail.approvalNeeded", "Approval needed:"),
        hoverBody,
        isTrusted: inline.isTrusted
      });
    }
    const renderInlineDisclaimers = () => {
      elements.disclaimer.replaceChildren();
      for (const part of detailParts) {
        this._appendMarkdownPart(elements.disclaimer, part.inline, codeBlockRenderOptions);
      }
    };
    if (riskBadge && detailParts.length) {
      const combined = new MarkdownString(void 0, {
        supportThemeIcons: true,
        isTrusted: detailParts.reduce((acc, part) => {
          if (part.isTrusted === true || acc === true) {
            return true;
          }
          if (typeof part.isTrusted === "object" && part.isTrusted) {
            const enabled = /* @__PURE__ */ new Set([
              ...typeof acc === "object" && acc?.enabledCommands ? acc.enabledCommands : [],
              ...part.isTrusted.enabledCommands
            ]);
            return { enabledCommands: [...enabled] };
          }
          return acc;
        }, void 0)
      });
      detailParts.forEach((part, i) => {
        if (i > 0) {
          combined.appendMarkdown("\n\n");
        }
        combined.appendMarkdown(`**${escapeMarkdownSyntaxTokens(part.hoverLabel)}** ${part.hoverBody}`);
      });
      riskBadge.setDetails(combined);
      this._register(riskBadge.onDidHide(() => renderInlineDisclaimers()));
    } else {
      renderInlineDisclaimers();
    }
    const hasToolConfirmationKey = ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService);
    hasToolConfirmationKey.set(true);
    this._register(toDisposable(() => hasToolConfirmationKey.reset()));
    this._register(confirmWidget.onDidClick(async ({ button, isTouchClick }) => {
      let doComplete = true;
      const data = button.data;
      let toolConfirmKind = ToolConfirmKind.Denied;
      if (typeof data === "boolean") {
        if (data) {
          toolConfirmKind = ToolConfirmKind.UserAction;
          if (terminalData.autoApproveInfo) {
            terminalData.autoApproveInfo = void 0;
          }
        }
      } else if (typeof data !== "boolean") {
        switch (data.type) {
          case "enable": {
            const optedIn = await this._showAutoApproveWarning();
            if (optedIn) {
              this.storageService.store("chat.tools.terminal.autoApprove.warningAccepted" /* TerminalAutoApproveWarningAccepted */, true, StorageScope.APPLICATION, StorageTarget.USER);
              if (terminalData.autoApproveInfo) {
                toolConfirmKind = ToolConfirmKind.UserAction;
              } else {
                if (customActions) {
                  for (const action of customActions) {
                    if (!(action instanceof Separator)) {
                      action.disabled = false;
                    }
                  }
                }
                confirmWidget.updateButtons(this._createButtons(buildMoreActions()));
                doComplete = false;
              }
            } else {
              doComplete = false;
            }
            break;
          }
          case "skip": {
            toolConfirmKind = ToolConfirmKind.Skipped;
            break;
          }
          case "newRule": {
            let formatRuleLinks2 = function(rules, scope) {
              return rules.map((e) => {
                if (scope === "session") {
                  return `\`${e.key}\``;
                }
                const target = scope === "workspace" ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER;
                const settingsUri = createCommandUri(TerminalContribCommandId.OpenTerminalSettingsLink, target);
                return `[\`${e.key}\`](${settingsUri.toString()} "${localize("ruleTooltip", "View rule in settings")}")`;
              }).join(", ");
            };
            var formatRuleLinks = formatRuleLinks2;
            const newRules = asArray(data.rule);
            const sessionRules = newRules.filter((r) => r.scope === "session");
            const workspaceRules = newRules.filter((r) => r.scope === "workspace");
            const userRules = newRules.filter((r) => r.scope === "user");
            const chatSessionResource = this.context.element.sessionResource;
            for (const rule of sessionRules) {
              this.terminalChatService.addSessionAutoApproveRule(chatSessionResource, rule.key, rule.value);
            }
            if (workspaceRules.length > 0) {
              const inspect = this.configurationService.inspect(TerminalContribSettingId.AutoApprove);
              const oldValue = inspect.workspaceValue ?? {};
              if (isObject(oldValue)) {
                const newValue = { ...oldValue };
                for (const rule of workspaceRules) {
                  newValue[rule.key] = rule.value;
                }
                await this.configurationService.updateValue(TerminalContribSettingId.AutoApprove, newValue, ConfigurationTarget.WORKSPACE);
              } else {
                this.preferencesService.openSettings({
                  jsonEditor: true,
                  target: ConfigurationTarget.WORKSPACE,
                  revealSetting: { key: TerminalContribSettingId.AutoApprove }
                });
                throw new ErrorNoTelemetry(`Cannot add new rule, existing workspace setting is unexpected format`);
              }
            }
            if (userRules.length > 0) {
              const inspect = this.configurationService.inspect(TerminalContribSettingId.AutoApprove);
              const oldValue = inspect.userValue ?? {};
              if (isObject(oldValue)) {
                const newValue = { ...oldValue };
                for (const rule of userRules) {
                  newValue[rule.key] = rule.value;
                }
                await this.configurationService.updateValue(TerminalContribSettingId.AutoApprove, newValue, ConfigurationTarget.USER);
              } else {
                this.preferencesService.openSettings({
                  jsonEditor: true,
                  target: ConfigurationTarget.USER,
                  revealSetting: { key: TerminalContribSettingId.AutoApprove }
                });
                throw new ErrorNoTelemetry(`Cannot add new rule, existing setting is unexpected format`);
              }
            }
            const mdTrustSettings = {
              isTrusted: {
                enabledCommands: [TerminalContribCommandId.OpenTerminalSettingsLink]
              }
            };
            const parts = [];
            if (sessionRules.length > 0) {
              parts.push(sessionRules.length === 1 ? localize("newRule.session", "Session auto approve rule {0} added", formatRuleLinks2(sessionRules, "session")) : localize("newRule.session.plural", "Session auto approve rules {0} added", formatRuleLinks2(sessionRules, "session")));
            }
            if (workspaceRules.length > 0) {
              parts.push(workspaceRules.length === 1 ? localize("newRule.workspace", "Workspace auto approve rule {0} added", formatRuleLinks2(workspaceRules, "workspace")) : localize("newRule.workspace.plural", "Workspace auto approve rules {0} added", formatRuleLinks2(workspaceRules, "workspace")));
            }
            if (userRules.length > 0) {
              parts.push(userRules.length === 1 ? localize("newRule.user", "User auto approve rule {0} added", formatRuleLinks2(userRules, "user")) : localize("newRule.user.plural", "User auto approve rules {0} added", formatRuleLinks2(userRules, "user")));
            }
            if (parts.length > 0) {
              terminalData.autoApproveInfo = new MarkdownString(parts.join(", "), mdTrustSettings);
            }
            toolConfirmKind = ToolConfirmKind.UserAction;
            break;
          }
          case "configure": {
            this.preferencesService.openSettings({
              target: ConfigurationTarget.USER,
              query: `@id:${TerminalContribSettingId.AutoApprove}`
            });
            doComplete = false;
            break;
          }
          case "sessionApproval": {
            const sessionResource = this.context.element.sessionResource;
            this.terminalChatService.setChatSessionAutoApproval(sessionResource, true);
            const disableUri = createCommandUri(TerminalContribCommandId.DisableSessionAutoApproval, sessionResource);
            const mdTrustSettings = {
              isTrusted: {
                enabledCommands: [TerminalContribCommandId.DisableSessionAutoApproval]
              }
            };
            terminalData.autoApproveInfo = new MarkdownString(`${localize("sessionApproval", "All commands will be auto approved for this session")} ([${localize("sessionApproval.disable", "Disable")}](${disableUri.toString()}))`, mdTrustSettings);
            toolConfirmKind = ToolConfirmKind.UserAction;
            break;
          }
        }
      }
      if (doComplete) {
        IChatToolInvocation.confirmWith(toolInvocation, { type: toolConfirmKind });
        if (!isTouchClick) {
          this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.focusInput();
        }
      }
    }));
    this.domNode = confirmWidget.domNode;
  }
  _createButtons(moreActions) {
    const getLabelAndTooltip = (label, actionId, tooltipDetail = label) => {
      const tooltip = this.keybindingService.appendKeybinding(tooltipDetail, actionId);
      return { label, tooltip };
    };
    return [
      {
        ...getLabelAndTooltip(localize("tool.allow", "Allow"), AcceptToolConfirmationActionId),
        data: true,
        moreActions
      },
      {
        ...getLabelAndTooltip(localize("tool.skip", "Skip"), SkipToolConfirmationActionId, localize("skip.detail", "Proceed without executing this command")),
        data: { type: "skip" },
        isSecondary: true
      }
    ];
  }
  async _showAutoApproveWarning() {
    const promptResult = await this.dialogService.prompt({
      type: Severity.Info,
      message: localize("autoApprove.title", "Enable terminal auto approve?"),
      buttons: [{
        label: localize("autoApprove.button.enable", "Enable"),
        run: () => true
      }],
      cancelButton: true,
      custom: {
        icon: Codicon.shield,
        markdownDetails: [{
          markdown: new MarkdownString(localize("autoApprove.markdown", "This will enable a configurable subset of commands to run in the terminal autonomously. It provides *best effort protections* and assumes the agent is not acting maliciously."))
        }, {
          markdown: new MarkdownString(`[${localize("autoApprove.markdown2", "Learn more about the potential risks and how to avoid them.")}](https://code.visualstudio.com/docs/agents/security?referrer=in-product#_security-risks-to-be-aware-of)`)
        }]
      }
    });
    return promptResult.result === true;
  }
  _appendMarkdownPart(container, message, codeBlockRenderOptions) {
    const part = this._register(this.instantiationService.createInstance(
      ChatMarkdownContentPart,
      {
        kind: "markdownContent",
        content: typeof message === "string" ? new MarkdownString().appendMarkdown(message) : message
      },
      this.context,
      this.editorPool,
      false,
      this.codeBlockStartIndex,
      this.renderer,
      void 0,
      this.currentWidthDelegate(),
      { codeBlockRenderOptions }
    ));
    append(container, part.domNode);
  }
};
ChatTerminalToolConfirmationSubPart = __decorateClass([
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, ILanguageService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IContextKeyService),
  __decorateParam(13, IChatWidgetService),
  __decorateParam(14, IPreferencesService),
  __decorateParam(15, IStorageService),
  __decorateParam(16, ITerminalChatService),
  __decorateParam(17, IHoverService),
  __decorateParam(18, ILanguageModelToolsService),
  __decorateParam(19, IChatToolRiskAssessmentService)
], ChatTerminalToolConfirmationSubPart);
export {
  ChatTerminalToolConfirmationSubPart,
  TerminalToolConfirmationStorageKeys
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdWJQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXBwZW5kLCBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIsIGdldFdpbmRvdywgaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSG92ZXJTdHlsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRXJyb3JOb1RlbGVtZXRyeSwgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29tbWFuZFVyaSwgZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMsIE1hcmtkb3duU3RyaW5nLCB0eXBlIElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgaXNPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udHJpYkNvbW1hbmRJZCwgVGVybWluYWxDb250cmliU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVybWluYWwvdGVybWluYWxDb250cmliRXhwb3J0cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgbWlncmF0ZUxlZ2FjeVRlcm1pbmFsVG9vbFNwZWNpZmljRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0LmpzJztcbmltcG9ydCB7IFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sSW52b2NhdGlvbiwgVG9vbENvbmZpcm1LaW5kLCB0eXBlIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsIHR5cGUgSUxlZ2FjeUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjY2VwdFRvb2xDb25maXJtYXRpb25BY3Rpb25JZCwgU2tpcFRvb2xDb25maXJtYXRpb25BY3Rpb25JZCB9IGZyb20gJy4uLy4uLy4uL2FjdGlvbnMvY2hhdFRvb2xBY3Rpb25zLmpzJztcbmltcG9ydCB7IElDaGF0Q29kZUJsb2NrSW5mbywgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90b29scy9jaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q3VzdG9tQ29uZmlybWF0aW9uV2lkZ2V0LCBJQ2hhdENvbmZpcm1hdGlvbkJ1dHRvbiB9IGZyb20gJy4uL2NoYXRDb25maXJtYXRpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yUG9vbCB9IGZyb20gJy4uL2NoYXRDb250ZW50Q29kZVBvb2xzLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi4vY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBDaGF0TWFya2Rvd25Db250ZW50UGFydCB9IGZyb20gJy4uL2NoYXRNYXJrZG93bkNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENvZGVCbG9ja1BhcnQsIElDb2RlQmxvY2tSZW5kZXJPcHRpb25zIH0gZnJvbSAnLi4vY29kZUJsb2NrUGFydC5qcyc7XG5pbXBvcnQgeyBCYXNlQ2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydCB9IGZyb20gJy4vY2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBcHByb3ZhbFJlYXNvbkJhZGdlLCBjcmVhdGVUb29sUmlza0JhZGdlIH0gZnJvbSAnLi90b29sUmlza0JhZGdlSGVscGVyLmpzJztcblxuZXhwb3J0IGNvbnN0IGVudW0gVGVybWluYWxUb29sQ29uZmlybWF0aW9uU3RvcmFnZUtleXMge1xuXHRUZXJtaW5hbEF1dG9BcHByb3ZlV2FybmluZ0FjY2VwdGVkID0gJ2NoYXQudG9vbHMudGVybWluYWwuYXV0b0FwcHJvdmUud2FybmluZ0FjY2VwdGVkJ1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXJtaW5hbE5ld0F1dG9BcHByb3ZlUnVsZSB7XG5cdGtleTogc3RyaW5nO1xuXHR2YWx1ZTogYm9vbGVhbiB8IHtcblx0XHRhcHByb3ZlOiBib29sZWFuO1xuXHRcdG1hdGNoQ29tbWFuZExpbmU/OiBib29sZWFuO1xuXHR9O1xuXHRzY29wZTogJ3Nlc3Npb24nIHwgJ3dvcmtzcGFjZScgfCAndXNlcic7XG59XG5cbmV4cG9ydCB0eXBlIFRlcm1pbmFsTmV3QXV0b0FwcHJvdmVCdXR0b25EYXRhID0gKFxuXHR7IHR5cGU6ICdlbmFibGUnIH0gfFxuXHR7IHR5cGU6ICdjb25maWd1cmUnIH0gfFxuXHR7IHR5cGU6ICdza2lwJyB9IHxcblx0eyB0eXBlOiAnbmV3UnVsZSc7IHJ1bGU6IElUZXJtaW5hbE5ld0F1dG9BcHByb3ZlUnVsZSB8IElUZXJtaW5hbE5ld0F1dG9BcHByb3ZlUnVsZVtdIH0gfFxuXHR7IHR5cGU6ICdzZXNzaW9uQXBwcm92YWwnIH1cbik7XG5cbmV4cG9ydCBjbGFzcyBDaGF0VGVybWluYWxUb29sQ29uZmlybWF0aW9uU3ViUGFydCBleHRlbmRzIEJhc2VDaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0IHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwdWJsaWMgcmVhZG9ubHkgY29kZWJsb2NrczogSUNoYXRDb2RlQmxvY2tJbmZvW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbixcblx0XHR0ZXJtaW5hbERhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfCBJTGVnYWN5Q2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJlcjogSU1hcmtkb3duUmVuZGVyZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JQb29sOiBFZGl0b3JQb29sLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY3VycmVudFdpZHRoRGVsZWdhdGU6ICgpID0+IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvZGVCbG9ja1N0YXJ0SW5kZXg6IG51bWJlcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRlcm1pbmFsQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXJtaW5hbENoYXRTZXJ2aWNlOiBJVGVybWluYWxDaGF0U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJpc2tBc3Nlc3NtZW50U2VydmljZTogSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih0b29sSW52b2NhdGlvbik7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdGlmIChzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uIHx8ICFzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ29uZmlybWF0aW9uIG1lc3NhZ2VzIGFyZSBtaXNzaW5nJyk7XG5cdFx0fVxuXG5cdFx0dGVybWluYWxEYXRhID0gbWlncmF0ZUxlZ2FjeVRlcm1pbmFsVG9vbFNwZWNpZmljRGF0YSh0ZXJtaW5hbERhdGEpO1xuXG5cdFx0Y29uc3QgeyB0aXRsZSwgbWVzc2FnZSwgZGlzY2xhaW1lciwgdGVybWluYWxDdXN0b21BY3Rpb25zIH0gPSBzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcztcblxuXHRcdC8vIFVzZSBwcmUtY29tcHV0ZWQgY29uZmlybWF0aW9uIGRhdGEgZnJvbSBydW5JblRlcm1pbmFsVG9vbCAoY2QgcHJlZml4IGV4dHJhY3Rpb24gaGFwcGVucyB0aGVyZSBmb3IgbG9jYWxpemF0aW9uKVxuXHRcdC8vIFVzZSBwcmVzZW50YXRpb25PdmVycmlkZXMgZm9yIGRpc3BsYXkgaWYgYXZhaWxhYmxlIChlLmcuLCBleHRyYWN0ZWQgUHl0aG9uIGNvZGUpXG5cdFx0Y29uc3QgaW5pdGlhbENvbnRlbnQgPSB0ZXJtaW5hbERhdGEucHJlc2VudGF0aW9uT3ZlcnJpZGVzPy5jb21tYW5kTGluZSA/PyB0ZXJtaW5hbERhdGEuY29uZmlybWF0aW9uPy5jb21tYW5kTGluZSA/PyAodGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLnRvb2xFZGl0ZWQgPz8gdGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLm9yaWdpbmFsKS50cmltU3RhcnQoKTtcblx0XHRjb25zdCBjZFByZWZpeCA9IHRlcm1pbmFsRGF0YS5jb25maXJtYXRpb24/LmNkUHJlZml4ID8/ICcnO1xuXHRcdC8vIFdoZW4gcHJlc2VudGF0aW9uT3ZlcnJpZGVzIGlzIHNldCwgdGhlIGVkaXRvciBzaG91bGQgYmUgcmVhZC1vbmx5IHNpbmNlIHRoZSBkaXNwbGF5ZWQgY29udGVudFxuXHRcdC8vIGRpZmZlcnMgZnJvbSB0aGUgYWN0dWFsIGNvbW1hbmQgKGUuZy4sIGV4dHJhY3RlZCBQeXRob24gY29kZSB2cyBmdWxsIHB5dGhvbiAtYyBjb21tYW5kKVxuXHRcdGNvbnN0IGlzUmVhZE9ubHkgPSAhIXRlcm1pbmFsRGF0YS5wcmVzZW50YXRpb25PdmVycmlkZXM7XG5cblx0XHRjb25zdCBhdXRvQXBwcm92ZUVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsQ29udHJpYlNldHRpbmdJZC5FbmFibGVBdXRvQXBwcm92ZSkgPT09IHRydWU7XG5cdFx0Ly8gQ3VzdG9tIGFjdGlvbnMgdHlwaWNhbGx5IGNvbWUgcHJlLWNvbXB1dGVkIGZyb20gdGhlIHJ1biBpbiB0ZXJtaW5hbCB0b29sLCBidXQgdGhleSBjYW5cblx0XHQvLyBhbHNvIGJlIGdlbmVyYXRlZCBhc3luY2hyb25vdXNseSBmb3IgY29uZmlybWF0aW9ucyB0aGF0IGFycml2ZSB3aXRob3V0IHRoZW0gKGVnLiBhZ2VudFxuXHRcdC8vIGhvc3Qgc2Vzc2lvbnMpLCBzbyB0cmFjayB0aGVtIGluIGEgbXV0YWJsZSBsb2NhbCBzaGFyZWQgYnkgdGhlIGJ1aWxkZXIgYmVsb3cgYW5kIHRoZVxuXHRcdC8vIGJ1dHRvbiBjbGljayBoYW5kbGVyLlxuXHRcdGxldCBjdXN0b21BY3Rpb25zID0gdGVybWluYWxDdXN0b21BY3Rpb25zO1xuXHRcdGNvbnN0IGJ1aWxkTW9yZUFjdGlvbnMgPSAoKTogKElDaGF0Q29uZmlybWF0aW9uQnV0dG9uPFRlcm1pbmFsTmV3QXV0b0FwcHJvdmVCdXR0b25EYXRhPiB8IFNlcGFyYXRvcilbXSB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRpZiAoIWF1dG9BcHByb3ZlRW5hYmxlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXV0b0FwcHJvdmVXYXJuaW5nQWNjZXB0ZWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oVGVybWluYWxUb29sQ29uZmlybWF0aW9uU3RvcmFnZUtleXMuVGVybWluYWxBdXRvQXBwcm92ZVdhcm5pbmdBY2NlcHRlZCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSk7XG5cdFx0XHRjb25zdCBtb3JlQWN0aW9uczogKElDaGF0Q29uZmlybWF0aW9uQnV0dG9uPFRlcm1pbmFsTmV3QXV0b0FwcHJvdmVCdXR0b25EYXRhPiB8IFNlcGFyYXRvcilbXSA9IFtdO1xuXHRcdFx0aWYgKCFhdXRvQXBwcm92ZVdhcm5pbmdBY2NlcHRlZCkge1xuXHRcdFx0XHRtb3JlQWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2F1dG9BcHByb3ZlLmVuYWJsZScsICdFbmFibGUgQXV0byBBcHByb3ZlLi4uJyksXG5cdFx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2VuYWJsZSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRtb3JlQWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHRcdGlmIChjdXN0b21BY3Rpb25zKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgY3VzdG9tQWN0aW9ucykge1xuXHRcdFx0XHRcdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSkge1xuXHRcdFx0XHRcdFx0XHRhY3Rpb24uZGlzYWJsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGN1c3RvbUFjdGlvbnMpIHtcblx0XHRcdFx0bW9yZUFjdGlvbnMucHVzaCguLi5jdXN0b21BY3Rpb25zKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBtb3JlQWN0aW9ucy5sZW5ndGggPT09IDAgPyB1bmRlZmluZWQgOiBtb3JlQWN0aW9ucztcblx0XHR9O1xuXG5cdFx0Y29uc3QgY29kZUJsb2NrUmVuZGVyT3B0aW9uczogSUNvZGVCbG9ja1JlbmRlck9wdGlvbnMgPSB7XG5cdFx0XHRoaWRlVG9vbGJhcjogdHJ1ZSxcblx0XHRcdHJlc2VydmVXaWR0aDogMTksXG5cdFx0XHR2ZXJ0aWNhbFBhZGRpbmc6IDUsXG5cdFx0XHRlZGl0b3JPcHRpb25zOiB7XG5cdFx0XHRcdHdvcmRXcmFwOiAnb24nLFxuXHRcdFx0XHRyZWFkT25seTogaXNSZWFkT25seSxcblx0XHRcdFx0dGFiRm9jdXNNb2RlOiB0cnVlLFxuXHRcdFx0XHRhcmlhTGFiZWw6IHR5cGVvZiB0aXRsZSA9PT0gJ3N0cmluZycgPyB0aXRsZSA6IHRpdGxlLnZhbHVlXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VJZEJ5TGFuZ3VhZ2VOYW1lKHRlcm1pbmFsRGF0YS5wcmVzZW50YXRpb25PdmVycmlkZXM/Lmxhbmd1YWdlID8/IHRlcm1pbmFsRGF0YS5sYW5ndWFnZSA/PyAnc2gnKSA/PyAnc2hlbGxzY3JpcHQnO1xuXHRcdGNvbnN0IGtleSA9IENvZGVCbG9ja1BhcnQucG9vbEtleSh0aGlzLmNvbnRleHQuZWxlbWVudC5pZCwgdGhpcy5jb2RlQmxvY2tTdGFydEluZGV4KTtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvclBvb2wuZ2V0KGtleSkpO1xuXHRcdGVkaXRvci5vYmplY3QucmVuZGVyKHtcblx0XHRcdGNvZGVCbG9ja0luZGV4OiB0aGlzLmNvZGVCbG9ja1N0YXJ0SW5kZXgsXG5cdFx0XHRlbGVtZW50OiB0aGlzLmNvbnRleHQuZWxlbWVudCxcblx0XHRcdGxhbmd1YWdlSWQsXG5cdFx0XHR0ZXh0OiBpbml0aWFsQ29udGVudCxcblx0XHRcdHJlbmRlck9wdGlvbnM6IGNvZGVCbG9ja1JlbmRlck9wdGlvbnMsXG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiB0aGlzLmNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2Vcblx0XHR9LCB0aGlzLmN1cnJlbnRXaWR0aERlbGVnYXRlKCkpO1xuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLm9iamVjdC5lZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0dGhpcy5jb2RlYmxvY2tzLnB1c2goe1xuXHRcdFx0Y29kZUJsb2NrSW5kZXg6IHRoaXMuY29kZUJsb2NrU3RhcnRJbmRleCxcblx0XHRcdGNvZGVtYXBwZXJVcmk6IHVuZGVmaW5lZCxcblx0XHRcdGVsZW1lbnRJZDogdGhpcy5jb250ZXh0LmVsZW1lbnQuaWQsXG5cdFx0XHRmb2N1czogKCkgPT4gZWRpdG9yLm9iamVjdC5mb2N1cygpLFxuXHRcdFx0b3duZXJNYXJrZG93blBhcnRJZDogdGhpcy5jb2RlYmxvY2tzUGFydElkLFxuXHRcdFx0dXJpOiBtb2RlbC51cmksXG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiB0aGlzLmNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2Vcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudFZhbHVlID0gbW9kZWwuZ2V0VmFsdWUoKTtcblx0XHRcdC8vIE9ubHkgc2V0IHVzZXJFZGl0ZWQgaWYgdGhlIGNvbnRlbnQgYWN0dWFsbHkgZGlmZmVycyBmcm9tIHRoZSBpbml0aWFsIHZhbHVlXG5cdFx0XHQvLyBQcmVwZW5kIGNkIHByZWZpeCBiYWNrIGlmIGl0IHdhcyBleHRyYWN0ZWQgZm9yIGRpc3BsYXlcblx0XHRcdGlmIChjdXJyZW50VmFsdWUgIT09IGluaXRpYWxDb250ZW50KSB7XG5cdFx0XHRcdHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS51c2VyRWRpdGVkID0gY2RQcmVmaXggKyBjdXJyZW50VmFsdWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUudXNlckVkaXRlZCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3QgZWxlbWVudHMgPSBoKCcuY2hhdC1jb25maXJtYXRpb24tbWVzc2FnZS10ZXJtaW5hbCcsIFtcblx0XHRcdGgoJy5jaGF0LWNvbmZpcm1hdGlvbi1tZXNzYWdlLXRlcm1pbmFsLWVkaXRvckBlZGl0b3InKSxcblx0XHRcdGgoJy5jaGF0LWNvbmZpcm1hdGlvbi1tZXNzYWdlLXRlcm1pbmFsLWRpc2NsYWltZXJAZGlzY2xhaW1lcicpLFxuXHRcdF0pO1xuXHRcdGFwcGVuZChlbGVtZW50cy5lZGl0b3IsIGVkaXRvci5vYmplY3QuZWxlbWVudCk7XG5cdFx0Y29uc3QgZWRpdG9yUmVzaXplT2JzZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdDaGF0VGVybWluYWxUb29sQ29uZmlybWF0aW9uU3ViUGFydC5lZGl0b3InLCBlbnRyaWVzID0+IHtcblx0XHRcdGNvbnN0IHdpZHRoID0gZW50cmllc1swXT8uY29udGVudFJlY3Qud2lkdGg7XG5cdFx0XHRpZiAod2lkdGgpIHtcblx0XHRcdFx0ZWRpdG9yLm9iamVjdC5sYXlvdXQod2lkdGgpO1xuXHRcdFx0fVxuXHRcdH0sIGdldFdpbmRvdyh0aGlzLmNvbnRleHQuY29udGFpbmVyKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvclJlc2l6ZU9ic2VydmVyLm9ic2VydmUoZWxlbWVudHMuZWRpdG9yKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKGVsZW1lbnRzLmVkaXRvciwge1xuXHRcdFx0Y29udGVudDogbWVzc2FnZSB8fCAnJyxcblx0XHRcdHN0eWxlOiBIb3ZlclN0eWxlLlBvaW50ZXIsXG5cdFx0XHRwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkxFRlQgfSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCByaXNrQmFkZ2UgPSBjcmVhdGVBcHByb3ZhbFJlYXNvbkJhZGdlKHRoaXMuX3N0b3JlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcy5hcHByb3ZhbFJlYXNvbilcblx0XHRcdD8/IGNyZWF0ZVRvb2xSaXNrQmFkZ2UodGhpcy5fc3RvcmUsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMucmlza0Fzc2Vzc21lbnRTZXJ2aWNlLCB0aGlzLmxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIHRoaXMudG9vbEludm9jYXRpb24udG9vbElkLCBzdGF0ZS5wYXJhbWV0ZXJzLCAndGVybWluYWwnKTtcblxuXHRcdGNvbnN0IGNvbmZpcm1XaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdEN1c3RvbUNvbmZpcm1hdGlvbldpZGdldDxUZXJtaW5hbE5ld0F1dG9BcHByb3ZlQnV0dG9uRGF0YSB8IGJvb2xlYW4+LFxuXHRcdFx0dGhpcy5jb250ZXh0LFxuXHRcdFx0e1xuXHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbCxcblx0XHRcdFx0bWVzc2FnZTogZWxlbWVudHMucm9vdCxcblx0XHRcdFx0Zm9vdGVyQmFubmVyOiByaXNrQmFkZ2U/LmRvbU5vZGUsXG5cdFx0XHRcdGJ1dHRvbnM6IHRoaXMuX2NyZWF0ZUJ1dHRvbnMoYnVpbGRNb3JlQWN0aW9ucygpKVxuXHRcdFx0fSxcblx0XHQpKTtcblxuXHRcdC8vIEFnZW50IEhvc3QgQ29waWxvdCBjb25maXJtYXRpb25zIG5lZWQgY2xpZW50LWdlbmVyYXRlZCBwZXJzaXN0ZW50IHJ1bGUgYWN0aW9ucy5cblx0XHRpZiAoYXV0b0FwcHJvdmVFbmFibGVkICYmICFjdXN0b21BY3Rpb25zICYmIHRlcm1pbmFsRGF0YS5hdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlICYmIGdldENoYXRTZXNzaW9uVHlwZSh0aGlzLmNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpID09PSBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90KSB7XG5cdFx0XHRjb25zdCBjb21tYW5kRm9yQW5hbHlzaXMgPSB0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUudG9vbEVkaXRlZCA/PyB0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUub3JpZ2luYWw7XG5cdFx0XHRjb25zdCBhbmFseXNpc0xhbmd1YWdlID0gdGVybWluYWxEYXRhLmxhbmd1YWdlID09PSAncG93ZXJzaGVsbCcgPyAncG93ZXJzaGVsbCcgOiAnc2hlbGxzY3JpcHQnO1xuXHRcdFx0dGhpcy50ZXJtaW5hbENoYXRTZXJ2aWNlLmdldEF1dG9BcHByb3ZlQWN0aW9ucyhjb21tYW5kRm9yQW5hbHlzaXMsIGFuYWx5c2lzTGFuZ3VhZ2UpLnRoZW4oYWN0aW9ucyA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkIHx8ICFhY3Rpb25zPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3VzdG9tQWN0aW9ucyA9IGFjdGlvbnM7XG5cdFx0XHRcdGNvbmZpcm1XaWRnZXQudXBkYXRlQnV0dG9ucyh0aGlzLl9jcmVhdGVCdXR0b25zKGJ1aWxkTW9yZUFjdGlvbnMoKSkpO1xuXHRcdFx0fSwgb25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdH1cblxuXHRcdC8vIEJ1aWxkIHRoZSB1bnNhbmRib3hlZC1leGVjdXRpb24gcmVhc29uIGFuZCBkaXNjbGFpbWVyIG1hcmtkb3duLiBXaGVuXG5cdFx0Ly8gdGhlIHJpc2sgYmFkZ2UgaXMgc2hvd24sIHN1cmZhY2UgdGhlbSB2aWEgaXRzIGRldGFpbHMgaG92ZXIgKHdpdGhcblx0XHQvLyBsYWJlbGxlZCBwcmVmaXhlcykgaW5zdGVhZCBvZiB0aGUgZGVkaWNhdGVkIGRpc2NsYWltZXIgcm93IHRvIGtlZXBcblx0XHQvLyB0aGUgY29uZmlybWF0aW9uIGNvbXBhY3QuXG5cdFx0aW50ZXJmYWNlIElEZXRhaWxQYXJ0IHtcblx0XHRcdHJlYWRvbmx5IGlubGluZTogSU1hcmtkb3duU3RyaW5nO1xuXHRcdFx0cmVhZG9ubHkgaG92ZXJMYWJlbDogc3RyaW5nO1xuXHRcdFx0cmVhZG9ubHkgaG92ZXJCb2R5OiBzdHJpbmc7XG5cdFx0XHRyZWFkb25seSBpc1RydXN0ZWQ6IElNYXJrZG93blN0cmluZ1snaXNUcnVzdGVkJ107XG5cdFx0fVxuXHRcdGNvbnN0IGRldGFpbFBhcnRzOiBJRGV0YWlsUGFydFtdID0gW107XG5cdFx0aWYgKHRlcm1pbmFsRGF0YS5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24pIHtcblx0XHRcdGNvbnN0IHJlYXNvblRleHQgPSAodGVybWluYWxEYXRhLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbiAmJiB0ZXJtaW5hbERhdGEucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uLnRyaW0oKSlcblx0XHRcdFx0fHwgbG9jYWxpemUoJ2NoYXQudGVybWluYWwudW5zYW5kYm94ZWRFeGVjdXRpb24uZGVmYXVsdFJlYXNvbicsIFwiVGhlIG1vZGVsIGRpZCBub3QgcHJvdmlkZSBhIHJlYXNvbiBmb3IgcmVxdWVzdGluZyB1bnNhbmRib3hlZCBleGVjdXRpb24uXCIpO1xuXHRcdFx0Y29uc3QgaW5saW5lID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRcdGlubGluZS5hcHBlbmRNYXJrZG93bihgJCgke0NvZGljb24uaW5mby5pZH0pIGApO1xuXHRcdFx0aW5saW5lLmFwcGVuZFRleHQocmVhc29uVGV4dCk7XG5cdFx0XHRkZXRhaWxQYXJ0cy5wdXNoKHtcblx0XHRcdFx0aW5saW5lLFxuXHRcdFx0XHRob3ZlckxhYmVsOiBsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbC5kZXRhaWwuc2FuZGJveEluc3VmZmljaWVudCcsIFwiU2FuZGJveCBpbnN1ZmZpY2llbnQ6XCIpLFxuXHRcdFx0XHRob3ZlckJvZHk6IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKHJlYXNvblRleHQpLFxuXHRcdFx0XHRpc1RydXN0ZWQ6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAodGVybWluYWxEYXRhLnJlcXVlc3RBbGxvd05ldHdvcmspIHtcblx0XHRcdGNvbnN0IHJlYXNvblRleHQgPSAodGVybWluYWxEYXRhLnJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24gJiYgdGVybWluYWxEYXRhLnJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24udHJpbSgpKVxuXHRcdFx0XHR8fCBsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbC5hbGxvd05ldHdvcmsuZGVmYXVsdFJlYXNvbicsIFwiVGhlIG1vZGVsIGRpZCBub3QgcHJvdmlkZSBhIHJlYXNvbiBmb3IgcmVxdWVzdGluZyB1bnJlc3RyaWN0ZWQgbmV0d29yayBhY2Nlc3MgaW4gdGhlIHNhbmRib3guXCIpO1xuXHRcdFx0Y29uc3QgaW5saW5lID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRcdGlubGluZS5hcHBlbmRNYXJrZG93bihgJCgke0NvZGljb24uaW5mby5pZH0pIGApO1xuXHRcdFx0aW5saW5lLmFwcGVuZFRleHQocmVhc29uVGV4dCk7XG5cdFx0XHRkZXRhaWxQYXJ0cy5wdXNoKHtcblx0XHRcdFx0aW5saW5lLFxuXHRcdFx0XHRob3ZlckxhYmVsOiBsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbC5kZXRhaWwudW5yZXN0cmljdGVkTmV0d29yaycsIFwiVW5yZXN0cmljdGVkIG5ldHdvcmsgYWNjZXNzOlwiKSxcblx0XHRcdFx0aG92ZXJCb2R5OiBlc2NhcGVNYXJrZG93blN5bnRheFRva2VucyhyZWFzb25UZXh0KSxcblx0XHRcdFx0aXNUcnVzdGVkOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0aWYgKGRpc2NsYWltZXIpIHtcblx0XHRcdGNvbnN0IGlubGluZSA9IHR5cGVvZiBkaXNjbGFpbWVyID09PSAnc3RyaW5nJyA/IG5ldyBNYXJrZG93blN0cmluZyhkaXNjbGFpbWVyKSA6IGRpc2NsYWltZXI7XG5cdFx0XHQvLyBGb3IgdGhlIGhvdmVyLCBkcm9wIHRoZSBsZWFkaW5nIGAkKGluZm8pIGAgaWNvbiBwcmVmaXggdGhhdCB0aGVcblx0XHRcdC8vIGRpc2NsYWltZXIgY2FycmllcyBmb3IgaW5saW5lIHJlbmRlcmluZyBcdTIwMTQgdGhlIGxhYmVsbGVkIHByZWZpeFxuXHRcdFx0Ly8gYWxyZWFkeSBjb252ZXlzIHRoZSBzYW1lIHJvbGUuXG5cdFx0XHRjb25zdCBob3ZlckJvZHkgPSBpbmxpbmUudmFsdWUucmVwbGFjZSgvXlxccypcXCRcXChbXildK1xcKVxccyovLCAnJyk7XG5cdFx0XHRkZXRhaWxQYXJ0cy5wdXNoKHtcblx0XHRcdFx0aW5saW5lLFxuXHRcdFx0XHRob3ZlckxhYmVsOiBsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbC5kZXRhaWwuYXBwcm92YWxOZWVkZWQnLCBcIkFwcHJvdmFsIG5lZWRlZDpcIiksXG5cdFx0XHRcdGhvdmVyQm9keSxcblx0XHRcdFx0aXNUcnVzdGVkOiBpbmxpbmUuaXNUcnVzdGVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVuZGVySW5saW5lRGlzY2xhaW1lcnMgPSAoKSA9PiB7XG5cdFx0XHRlbGVtZW50cy5kaXNjbGFpbWVyLnJlcGxhY2VDaGlsZHJlbigpO1xuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGRldGFpbFBhcnRzKSB7XG5cdFx0XHRcdHRoaXMuX2FwcGVuZE1hcmtkb3duUGFydChlbGVtZW50cy5kaXNjbGFpbWVyLCBwYXJ0LmlubGluZSwgY29kZUJsb2NrUmVuZGVyT3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGlmIChyaXNrQmFkZ2UgJiYgZGV0YWlsUGFydHMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBjb21iaW5lZCA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHtcblx0XHRcdFx0c3VwcG9ydFRoZW1lSWNvbnM6IHRydWUsXG5cdFx0XHRcdGlzVHJ1c3RlZDogZGV0YWlsUGFydHMucmVkdWNlPE1hcmtkb3duU3RyaW5nWydpc1RydXN0ZWQnXT4oKGFjYywgcGFydCkgPT4ge1xuXHRcdFx0XHRcdGlmIChwYXJ0LmlzVHJ1c3RlZCA9PT0gdHJ1ZSB8fCBhY2MgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodHlwZW9mIHBhcnQuaXNUcnVzdGVkID09PSAnb2JqZWN0JyAmJiBwYXJ0LmlzVHJ1c3RlZCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZW5hYmxlZCA9IG5ldyBTZXQoW1xuXHRcdFx0XHRcdFx0XHQuLi4odHlwZW9mIGFjYyA9PT0gJ29iamVjdCcgJiYgYWNjPy5lbmFibGVkQ29tbWFuZHMgPyBhY2MuZW5hYmxlZENvbW1hbmRzIDogW10pLFxuXHRcdFx0XHRcdFx0XHQuLi5wYXJ0LmlzVHJ1c3RlZC5lbmFibGVkQ29tbWFuZHMsXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdHJldHVybiB7IGVuYWJsZWRDb21tYW5kczogWy4uLmVuYWJsZWRdIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBhY2M7XG5cdFx0XHRcdH0sIHVuZGVmaW5lZCksXG5cdFx0XHR9KTtcblx0XHRcdGRldGFpbFBhcnRzLmZvckVhY2goKHBhcnQsIGkpID0+IHtcblx0XHRcdFx0aWYgKGkgPiAwKSB7XG5cdFx0XHRcdFx0Y29tYmluZWQuYXBwZW5kTWFya2Rvd24oJ1xcblxcbicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbWJpbmVkLmFwcGVuZE1hcmtkb3duKGAqKiR7ZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMocGFydC5ob3ZlckxhYmVsKX0qKiAke3BhcnQuaG92ZXJCb2R5fWApO1xuXHRcdFx0fSk7XG5cdFx0XHRyaXNrQmFkZ2Uuc2V0RGV0YWlscyhjb21iaW5lZCk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyaXNrQmFkZ2Uub25EaWRIaWRlKCgpID0+IHJlbmRlcklubGluZURpc2NsYWltZXJzKCkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVuZGVySW5saW5lRGlzY2xhaW1lcnMoKTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNUb29sQ29uZmlybWF0aW9uS2V5ID0gQ2hhdENvbnRleHRLZXlzLkVkaXRpbmcuaGFzVG9vbENvbmZpcm1hdGlvbi5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aGFzVG9vbENvbmZpcm1hdGlvbktleS5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGhhc1Rvb2xDb25maXJtYXRpb25LZXkucmVzZXQoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlybVdpZGdldC5vbkRpZENsaWNrKGFzeW5jICh7IGJ1dHRvbiwgaXNUb3VjaENsaWNrIH0pID0+IHtcblx0XHRcdGxldCBkb0NvbXBsZXRlID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGRhdGEgPSBidXR0b24uZGF0YTtcblx0XHRcdGxldCB0b29sQ29uZmlybUtpbmQ6IFRvb2xDb25maXJtS2luZCA9IFRvb2xDb25maXJtS2luZC5EZW5pZWQ7XG5cdFx0XHRpZiAodHlwZW9mIGRhdGEgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRpZiAoZGF0YSkge1xuXHRcdFx0XHRcdHRvb2xDb25maXJtS2luZCA9IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uO1xuXHRcdFx0XHRcdC8vIENsZWFyIG91dCBhbnkgYXV0byBhcHByb3ZlIGluZm8gc2luY2UgdGhpcyB3YXMgYW4gZXhwbGljaXQgdXNlciBhY3Rpb24uIFRoaXNcblx0XHRcdFx0XHQvLyBjYW4gaGFwcGVuIHdoZW4gdGhlIGF1dG8gYXBwcm92ZSBmZWF0dXJlIGlzIG9mZi5cblx0XHRcdFx0XHRpZiAodGVybWluYWxEYXRhLmF1dG9BcHByb3ZlSW5mbykge1xuXHRcdFx0XHRcdFx0dGVybWluYWxEYXRhLmF1dG9BcHByb3ZlSW5mbyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGRhdGEgIT09ICdib29sZWFuJykge1xuXHRcdFx0XHRzd2l0Y2ggKGRhdGEudHlwZSkge1xuXHRcdFx0XHRcdGNhc2UgJ2VuYWJsZSc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IG9wdGVkSW4gPSBhd2FpdCB0aGlzLl9zaG93QXV0b0FwcHJvdmVXYXJuaW5nKCk7XG5cdFx0XHRcdFx0XHRpZiAob3B0ZWRJbikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFRlcm1pbmFsVG9vbENvbmZpcm1hdGlvblN0b3JhZ2VLZXlzLlRlcm1pbmFsQXV0b0FwcHJvdmVXYXJuaW5nQWNjZXB0ZWQsIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdFx0XHRcdFx0Ly8gSWYgdGhpcyBjb21tYW5kIHdvdWxkIGhhdmUgYmVlbiBhdXRvLWFwcHJvdmVkLCBhcHByb3ZlIGltbWVkaWF0ZWx5XG5cdFx0XHRcdFx0XHRcdGlmICh0ZXJtaW5hbERhdGEuYXV0b0FwcHJvdmVJbmZvKSB7XG5cdFx0XHRcdFx0XHRcdFx0dG9vbENvbmZpcm1LaW5kID0gVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb247XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Ly8gSWYgdGhpcyB3b3VsZCBub3QgaGF2ZSBiZWVuIGF1dG8gYXBwcm92ZWQsIGVuYWJsZSB0aGUgb3B0aW9ucyBhbmRcblx0XHRcdFx0XHRcdFx0Ly8gZG8gbm90IGNvbXBsZXRlXG5cdFx0XHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChjdXN0b21BY3Rpb25zKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBjdXN0b21BY3Rpb25zKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIFNlcGFyYXRvcikpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhY3Rpb24uZGlzYWJsZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdGNvbmZpcm1XaWRnZXQudXBkYXRlQnV0dG9ucyh0aGlzLl9jcmVhdGVCdXR0b25zKGJ1aWxkTW9yZUFjdGlvbnMoKSkpO1xuXHRcdFx0XHRcdFx0XHRcdGRvQ29tcGxldGUgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0ZG9Db21wbGV0ZSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ3NraXAnOiB7XG5cdFx0XHRcdFx0XHR0b29sQ29uZmlybUtpbmQgPSBUb29sQ29uZmlybUtpbmQuU2tpcHBlZDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICduZXdSdWxlJzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgbmV3UnVsZXMgPSBhc0FycmF5KGRhdGEucnVsZSk7XG5cblx0XHRcdFx0XHRcdC8vIEdyb3VwIHJ1bGVzIGJ5IHNjb3BlXG5cdFx0XHRcdFx0XHRjb25zdCBzZXNzaW9uUnVsZXMgPSBuZXdSdWxlcy5maWx0ZXIociA9PiByLnNjb3BlID09PSAnc2Vzc2lvbicpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlUnVsZXMgPSBuZXdSdWxlcy5maWx0ZXIociA9PiByLnNjb3BlID09PSAnd29ya3NwYWNlJyk7XG5cdFx0XHRcdFx0XHRjb25zdCB1c2VyUnVsZXMgPSBuZXdSdWxlcy5maWx0ZXIociA9PiByLnNjb3BlID09PSAndXNlcicpO1xuXG5cdFx0XHRcdFx0XHQvLyBIYW5kbGUgc2Vzc2lvbi1zY29wZWQgcnVsZXMgKHRlbXBvcmFyeSwgaW4tbWVtb3J5IG9ubHkpXG5cdFx0XHRcdFx0XHRjb25zdCBjaGF0U2Vzc2lvblJlc291cmNlID0gdGhpcy5jb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBydWxlIG9mIHNlc3Npb25SdWxlcykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnRlcm1pbmFsQ2hhdFNlcnZpY2UuYWRkU2Vzc2lvbkF1dG9BcHByb3ZlUnVsZShjaGF0U2Vzc2lvblJlc291cmNlLCBydWxlLmtleSwgcnVsZS52YWx1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIEhhbmRsZSB3b3Jrc3BhY2Utc2NvcGVkIHJ1bGVzXG5cdFx0XHRcdFx0XHRpZiAod29ya3NwYWNlUnVsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBpbnNwZWN0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KFRlcm1pbmFsQ29udHJpYlNldHRpbmdJZC5BdXRvQXBwcm92ZSk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9sZFZhbHVlID0gKGluc3BlY3Qud29ya3NwYWNlVmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpID8/IHt9O1xuXHRcdFx0XHRcdFx0XHRpZiAoaXNPYmplY3Qob2xkVmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgbmV3VmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0geyAuLi5vbGRWYWx1ZSB9O1xuXHRcdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgcnVsZSBvZiB3b3Jrc3BhY2VSdWxlcykge1xuXHRcdFx0XHRcdFx0XHRcdFx0bmV3VmFsdWVbcnVsZS5rZXldID0gcnVsZS52YWx1ZTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShUZXJtaW5hbENvbnRyaWJTZXR0aW5nSWQuQXV0b0FwcHJvdmUsIG5ld1ZhbHVlLCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlblNldHRpbmdzKHtcblx0XHRcdFx0XHRcdFx0XHRcdGpzb25FZGl0b3I6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0XHR0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFLFxuXHRcdFx0XHRcdFx0XHRcdFx0cmV2ZWFsU2V0dGluZzogeyBrZXk6IFRlcm1pbmFsQ29udHJpYlNldHRpbmdJZC5BdXRvQXBwcm92ZSB9LFxuXHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvck5vVGVsZW1ldHJ5KGBDYW5ub3QgYWRkIG5ldyBydWxlLCBleGlzdGluZyB3b3Jrc3BhY2Ugc2V0dGluZyBpcyB1bmV4cGVjdGVkIGZvcm1hdGApO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIEhhbmRsZSB1c2VyLXNjb3BlZCBydWxlc1xuXHRcdFx0XHRcdFx0aWYgKHVzZXJSdWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGluc3BlY3QgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QoVGVybWluYWxDb250cmliU2V0dGluZ0lkLkF1dG9BcHByb3ZlKTtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb2xkVmFsdWUgPSAoaW5zcGVjdC51c2VyVmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpID8/IHt9O1xuXHRcdFx0XHRcdFx0XHRpZiAoaXNPYmplY3Qob2xkVmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgbmV3VmFsdWU6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0geyAuLi5vbGRWYWx1ZSB9O1xuXHRcdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgcnVsZSBvZiB1c2VyUnVsZXMpIHtcblx0XHRcdFx0XHRcdFx0XHRcdG5ld1ZhbHVlW3J1bGUua2V5XSA9IHJ1bGUudmFsdWU7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoVGVybWluYWxDb250cmliU2V0dGluZ0lkLkF1dG9BcHByb3ZlLCBuZXdWYWx1ZSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuU2V0dGluZ3Moe1xuXHRcdFx0XHRcdFx0XHRcdFx0anNvbkVkaXRvcjogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRcdHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0XHRcdFx0XHRcdFx0cmV2ZWFsU2V0dGluZzogeyBrZXk6IFRlcm1pbmFsQ29udHJpYlNldHRpbmdJZC5BdXRvQXBwcm92ZSB9LFxuXHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvck5vVGVsZW1ldHJ5KGBDYW5ub3QgYWRkIG5ldyBydWxlLCBleGlzdGluZyBzZXR0aW5nIGlzIHVuZXhwZWN0ZWQgZm9ybWF0YCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0ZnVuY3Rpb24gZm9ybWF0UnVsZUxpbmtzKHJ1bGVzOiBJVGVybWluYWxOZXdBdXRvQXBwcm92ZVJ1bGVbXSwgc2NvcGU6ICdzZXNzaW9uJyB8ICd3b3Jrc3BhY2UnIHwgJ3VzZXInKTogc3RyaW5nIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHJ1bGVzLm1hcChlID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoc2NvcGUgPT09ICdzZXNzaW9uJykge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGBcXGAke2Uua2V5fVxcYGA7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldCA9IHNjb3BlID09PSAnd29ya3NwYWNlJyA/IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFIDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHNldHRpbmdzVXJpID0gY3JlYXRlQ29tbWFuZFVyaShUZXJtaW5hbENvbnRyaWJDb21tYW5kSWQuT3BlblRlcm1pbmFsU2V0dGluZ3NMaW5rLCB0YXJnZXQpO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBgW1xcYCR7ZS5rZXl9XFxgXSgke3NldHRpbmdzVXJpLnRvU3RyaW5nKCl9IFwiJHtsb2NhbGl6ZSgncnVsZVRvb2x0aXAnLCAnVmlldyBydWxlIGluIHNldHRpbmdzJyl9XCIpYDtcblx0XHRcdFx0XHRcdFx0fSkuam9pbignLCAnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IG1kVHJ1c3RTZXR0aW5ncyA9IHtcblx0XHRcdFx0XHRcdFx0aXNUcnVzdGVkOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZW5hYmxlZENvbW1hbmRzOiBbVGVybWluYWxDb250cmliQ29tbWFuZElkLk9wZW5UZXJtaW5hbFNldHRpbmdzTGlua11cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRcdFx0aWYgKHNlc3Npb25SdWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHBhcnRzLnB1c2goc2Vzc2lvblJ1bGVzLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ25ld1J1bGUuc2Vzc2lvbicsICdTZXNzaW9uIGF1dG8gYXBwcm92ZSBydWxlIHswfSBhZGRlZCcsIGZvcm1hdFJ1bGVMaW5rcyhzZXNzaW9uUnVsZXMsICdzZXNzaW9uJykpXG5cdFx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnbmV3UnVsZS5zZXNzaW9uLnBsdXJhbCcsICdTZXNzaW9uIGF1dG8gYXBwcm92ZSBydWxlcyB7MH0gYWRkZWQnLCBmb3JtYXRSdWxlTGlua3Moc2Vzc2lvblJ1bGVzLCAnc2Vzc2lvbicpKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAod29ya3NwYWNlUnVsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0XHRwYXJ0cy5wdXNoKHdvcmtzcGFjZVJ1bGVzLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ25ld1J1bGUud29ya3NwYWNlJywgJ1dvcmtzcGFjZSBhdXRvIGFwcHJvdmUgcnVsZSB7MH0gYWRkZWQnLCBmb3JtYXRSdWxlTGlua3Mod29ya3NwYWNlUnVsZXMsICd3b3Jrc3BhY2UnKSlcblx0XHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCduZXdSdWxlLndvcmtzcGFjZS5wbHVyYWwnLCAnV29ya3NwYWNlIGF1dG8gYXBwcm92ZSBydWxlcyB7MH0gYWRkZWQnLCBmb3JtYXRSdWxlTGlua3Mod29ya3NwYWNlUnVsZXMsICd3b3Jrc3BhY2UnKSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHVzZXJSdWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHBhcnRzLnB1c2godXNlclJ1bGVzLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ25ld1J1bGUudXNlcicsICdVc2VyIGF1dG8gYXBwcm92ZSBydWxlIHswfSBhZGRlZCcsIGZvcm1hdFJ1bGVMaW5rcyh1c2VyUnVsZXMsICd1c2VyJykpXG5cdFx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnbmV3UnVsZS51c2VyLnBsdXJhbCcsICdVc2VyIGF1dG8gYXBwcm92ZSBydWxlcyB7MH0gYWRkZWQnLCBmb3JtYXRSdWxlTGlua3ModXNlclJ1bGVzLCAndXNlcicpKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAocGFydHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0XHR0ZXJtaW5hbERhdGEuYXV0b0FwcHJvdmVJbmZvID0gbmV3IE1hcmtkb3duU3RyaW5nKHBhcnRzLmpvaW4oJywgJyksIG1kVHJ1c3RTZXR0aW5ncyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0b29sQ29uZmlybUtpbmQgPSBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbjtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdjb25maWd1cmUnOiB7XG5cdFx0XHRcdFx0XHR0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuU2V0dGluZ3Moe1xuXHRcdFx0XHRcdFx0XHR0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdFx0XHRcdFx0cXVlcnk6IGBAaWQ6JHtUZXJtaW5hbENvbnRyaWJTZXR0aW5nSWQuQXV0b0FwcHJvdmV9YCxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0ZG9Db21wbGV0ZSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ3Nlc3Npb25BcHByb3ZhbCc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0XHRcdHRoaXMudGVybWluYWxDaGF0U2VydmljZS5zZXRDaGF0U2Vzc2lvbkF1dG9BcHByb3ZhbChzZXNzaW9uUmVzb3VyY2UsIHRydWUpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlzYWJsZVVyaSA9IGNyZWF0ZUNvbW1hbmRVcmkoVGVybWluYWxDb250cmliQ29tbWFuZElkLkRpc2FibGVTZXNzaW9uQXV0b0FwcHJvdmFsLCBzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbWRUcnVzdFNldHRpbmdzID0ge1xuXHRcdFx0XHRcdFx0XHRpc1RydXN0ZWQ6IHtcblx0XHRcdFx0XHRcdFx0XHRlbmFibGVkQ29tbWFuZHM6IFtUZXJtaW5hbENvbnRyaWJDb21tYW5kSWQuRGlzYWJsZVNlc3Npb25BdXRvQXBwcm92YWxdXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR0ZXJtaW5hbERhdGEuYXV0b0FwcHJvdmVJbmZvID0gbmV3IE1hcmtkb3duU3RyaW5nKGAke2xvY2FsaXplKCdzZXNzaW9uQXBwcm92YWwnLCAnQWxsIGNvbW1hbmRzIHdpbGwgYmUgYXV0byBhcHByb3ZlZCBmb3IgdGhpcyBzZXNzaW9uJyl9IChbJHtsb2NhbGl6ZSgnc2Vzc2lvbkFwcHJvdmFsLmRpc2FibGUnLCAnRGlzYWJsZScpfV0oJHtkaXNhYmxlVXJpLnRvU3RyaW5nKCl9KSlgLCBtZFRydXN0U2V0dGluZ3MpO1xuXHRcdFx0XHRcdFx0dG9vbENvbmZpcm1LaW5kID0gVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb247XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGRvQ29tcGxldGUpIHtcblx0XHRcdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aCh0b29sSW52b2NhdGlvbiwgeyB0eXBlOiB0b29sQ29uZmlybUtpbmQgfSk7XG5cdFx0XHRcdGlmICghaXNUb3VjaENsaWNrKSB7XG5cdFx0XHRcdFx0dGhpcy5jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZSh0aGlzLmNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpPy5mb2N1c0lucHV0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBjb25maXJtV2lkZ2V0LmRvbU5vZGU7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVCdXR0b25zKG1vcmVBY3Rpb25zOiAoSUNoYXRDb25maXJtYXRpb25CdXR0b248VGVybWluYWxOZXdBdXRvQXBwcm92ZUJ1dHRvbkRhdGE+IHwgU2VwYXJhdG9yKVtdIHwgdW5kZWZpbmVkKTogSUNoYXRDb25maXJtYXRpb25CdXR0b248Ym9vbGVhbiB8IFRlcm1pbmFsTmV3QXV0b0FwcHJvdmVCdXR0b25EYXRhPltdIHtcblx0XHRjb25zdCBnZXRMYWJlbEFuZFRvb2x0aXAgPSAobGFiZWw6IHN0cmluZywgYWN0aW9uSWQ6IHN0cmluZywgdG9vbHRpcERldGFpbDogc3RyaW5nID0gbGFiZWwpOiB7IGxhYmVsOiBzdHJpbmc7IHRvb2x0aXA6IHN0cmluZyB9ID0+IHtcblx0XHRcdGNvbnN0IHRvb2x0aXAgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcodG9vbHRpcERldGFpbCwgYWN0aW9uSWQpO1xuXHRcdFx0cmV0dXJuIHsgbGFiZWwsIHRvb2x0aXAgfTtcblx0XHR9O1xuXG5cdFx0cmV0dXJuIFtcblx0XHRcdHtcblx0XHRcdFx0Li4uZ2V0TGFiZWxBbmRUb29sdGlwKGxvY2FsaXplKCd0b29sLmFsbG93JywgXCJBbGxvd1wiKSwgQWNjZXB0VG9vbENvbmZpcm1hdGlvbkFjdGlvbklkKSxcblx0XHRcdFx0ZGF0YTogdHJ1ZSxcblx0XHRcdFx0bW9yZUFjdGlvbnMsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHQuLi5nZXRMYWJlbEFuZFRvb2x0aXAobG9jYWxpemUoJ3Rvb2wuc2tpcCcsIFwiU2tpcFwiKSwgU2tpcFRvb2xDb25maXJtYXRpb25BY3Rpb25JZCwgbG9jYWxpemUoJ3NraXAuZGV0YWlsJywgJ1Byb2NlZWQgd2l0aG91dCBleGVjdXRpbmcgdGhpcyBjb21tYW5kJykpLFxuXHRcdFx0XHRkYXRhOiB7IHR5cGU6ICdza2lwJyB9LFxuXHRcdFx0XHRpc1NlY29uZGFyeTogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Nob3dBdXRvQXBwcm92ZVdhcm5pbmcoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcHJvbXB0UmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2F1dG9BcHByb3ZlLnRpdGxlJywgJ0VuYWJsZSB0ZXJtaW5hbCBhdXRvIGFwcHJvdmU/JyksXG5cdFx0XHRidXR0b25zOiBbe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2F1dG9BcHByb3ZlLmJ1dHRvbi5lbmFibGUnLCAnRW5hYmxlJyksXG5cdFx0XHRcdHJ1bjogKCkgPT4gdHJ1ZVxuXHRcdFx0fV0sXG5cdFx0XHRjYW5jZWxCdXR0b246IHRydWUsXG5cdFx0XHRjdXN0b206IHtcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5zaGllbGQsXG5cdFx0XHRcdG1hcmtkb3duRGV0YWlsczogW3tcblx0XHRcdFx0XHRtYXJrZG93bjogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdhdXRvQXBwcm92ZS5tYXJrZG93bicsICdUaGlzIHdpbGwgZW5hYmxlIGEgY29uZmlndXJhYmxlIHN1YnNldCBvZiBjb21tYW5kcyB0byBydW4gaW4gdGhlIHRlcm1pbmFsIGF1dG9ub21vdXNseS4gSXQgcHJvdmlkZXMgKmJlc3QgZWZmb3J0IHByb3RlY3Rpb25zKiBhbmQgYXNzdW1lcyB0aGUgYWdlbnQgaXMgbm90IGFjdGluZyBtYWxpY2lvdXNseS4nKSksXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRtYXJrZG93bjogbmV3IE1hcmtkb3duU3RyaW5nKGBbJHtsb2NhbGl6ZSgnYXV0b0FwcHJvdmUubWFya2Rvd24yJywgJ0xlYXJuIG1vcmUgYWJvdXQgdGhlIHBvdGVudGlhbCByaXNrcyBhbmQgaG93IHRvIGF2b2lkIHRoZW0uJyl9XShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2FnZW50cy9zZWN1cml0eT9yZWZlcnJlcj1pbi1wcm9kdWN0I19zZWN1cml0eS1yaXNrcy10by1iZS1hd2FyZS1vZilgKVxuXHRcdFx0XHR9XSxcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gcHJvbXB0UmVzdWx0LnJlc3VsdCA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGVuZE1hcmtkb3duUGFydChjb250YWluZXI6IEhUTUxFbGVtZW50LCBtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcsIGNvZGVCbG9ja1JlbmRlck9wdGlvbnM6IElDb2RlQmxvY2tSZW5kZXJPcHRpb25zKSB7XG5cdFx0Y29uc3QgcGFydCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1hcmtkb3duQ29udGVudFBhcnQsXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0XHRjb250ZW50OiB0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgPyBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihtZXNzYWdlKSA6IG1lc3NhZ2Vcblx0XHRcdH0sXG5cdFx0XHR0aGlzLmNvbnRleHQsXG5cdFx0XHR0aGlzLmVkaXRvclBvb2wsXG5cdFx0XHRmYWxzZSxcblx0XHRcdHRoaXMuY29kZUJsb2NrU3RhcnRJbmRleCxcblx0XHRcdHRoaXMucmVuZGVyZXIsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR0aGlzLmN1cnJlbnRXaWR0aERlbGVnYXRlKCksXG5cdFx0XHR7IGNvZGVCbG9ja1JlbmRlck9wdGlvbnMgfSxcblx0XHQpKTtcblx0XHRhcHBlbmQoY29udGFpbmVyLCBwYXJ0LmRvbU5vZGUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsUUFBUSwwQkFBMEIsV0FBVyxTQUFTO0FBQy9ELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0IseUJBQXlCO0FBQ3BELFNBQVMsa0JBQWtCLDRCQUE0QixzQkFBNEM7QUFDbkcsU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQixn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QixTQUFTLGFBQWEsTUFBTSxHQUFHLDhCQUE4QixTQUFTLGVBQWUsd0NBQXdDLENBQUM7QUFBQSxRQUNwSixNQUFNLEVBQUUsTUFBTSxPQUFPO0FBQUEsUUFDckIsYUFBYTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYywwQkFBNEM7QUFDekQsVUFBTSxlQUFlLE1BQU0sS0FBSyxjQUFjLE9BQU87QUFBQSxNQUNwRCxNQUFNLFNBQVM7QUFBQSxNQUNmLFNBQVMsU0FBUyxxQkFBcUIsK0JBQStCO0FBQUEsTUFDdEUsU0FBUyxDQUFDO0FBQUEsUUFDVCxPQUFPLFNBQVMsNkJBQTZCLFFBQVE7QUFBQSxRQUNyRCxLQUFLLE1BQU07QUFBQSxNQUNaLENBQUM7QUFBQSxNQUNELGNBQWM7QUFBQSxNQUNkLFFBQVE7QUFBQSxRQUNQLE1BQU0sUUFBUTtBQUFBLFFBQ2QsaUJBQWlCLENBQUM7QUFBQSxVQUNqQixVQUFVLElBQUksZUFBZSxTQUFTLHdCQUF3QixnTEFBZ0wsQ0FBQztBQUFBLFFBQ2hQLEdBQUc7QUFBQSxVQUNGLFVBQVUsSUFBSSxlQUFlLElBQUksU0FBUyx5QkFBeUIsNkRBQTZELENBQUMsMEdBQTBHO0FBQUEsUUFDNU8sQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELENBQUM7QUFDRCxXQUFPLGFBQWEsV0FBVztBQUFBLEVBQ2hDO0FBQUEsRUFFUSxvQkFBb0IsV0FBd0IsU0FBbUMsd0JBQWlEO0FBQ3ZJLFVBQU0sT0FBTyxLQUFLLFVBQVUsS0FBSyxxQkFBcUI7QUFBQSxNQUFlO0FBQUEsTUFDcEU7QUFBQSxRQUNDLE1BQU07QUFBQSxRQUNOLFNBQVMsT0FBTyxZQUFZLFdBQVcsSUFBSSxlQUFlLEVBQUUsZUFBZSxPQUFPLElBQUk7QUFBQSxNQUN2RjtBQUFBLE1BQ0EsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0w7QUFBQSxNQUNBLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMO0FBQUEsTUFDQSxLQUFLLHFCQUFxQjtBQUFBLE1BQzFCLEVBQUUsdUJBQXVCO0FBQUEsSUFDMUIsQ0FBQztBQUNELFdBQU8sV0FBVyxLQUFLLE9BQU87QUFBQSxFQUMvQjtBQUNEO0FBM2VhLHNDQUFOO0FBQUEsRUFZSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBeEJVOyIsCiAgIm5hbWVzIjogWyJUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdG9yYWdlS2V5cyIsICJmb3JtYXRSdWxlTGlua3MiXQp9Cg==
