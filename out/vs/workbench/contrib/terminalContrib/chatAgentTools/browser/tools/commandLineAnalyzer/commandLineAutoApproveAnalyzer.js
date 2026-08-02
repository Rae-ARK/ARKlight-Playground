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
import { asArray } from "../../../../../../../base/common/arrays.js";
import { createCommandUri, MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { ITerminalChatService } from "../../../../../terminal/browser/terminal.js";
import { IStorageService, StorageScope } from "../../../../../../../platform/storage/common/storage.js";
import { TerminalToolConfirmationStorageKeys } from "../../../../../chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js";
import { ChatConfiguration } from "../../../../../chat/common/constants.js";
import { TerminalChatAgentToolsSettingId } from "../../../common/terminalChatAgentToolsConfiguration.js";
import { dedupeRules, generateAutoApproveActions, isPowerShell } from "../../runInTerminalHelpers.js";
import { isAutoApproveRule, isNpmScriptAutoApproveRule } from "./commandLineAnalyzer.js";
import { TerminalChatCommandId } from "../../../../chat/browser/terminalChat.js";
import { CommandLineAutoApprover } from "./autoApprove/commandLineAutoApprover.js";
const promptInjectionWarningCommandsLower = [
  "curl",
  "wget"
];
const promptInjectionWarningCommandsLowerPwshOnly = [
  "invoke-restmethod",
  "invoke-webrequest",
  "irm",
  "iwr"
];
let CommandLineAutoApproveAnalyzer = class extends Disposable {
  constructor(_treeSitterCommandParser, _telemetry, _log, _configurationService, instantiationService, _storageService, _terminalChatService) {
    super();
    this._treeSitterCommandParser = _treeSitterCommandParser;
    this._telemetry = _telemetry;
    this._log = _log;
    this._configurationService = _configurationService;
    this._storageService = _storageService;
    this._terminalChatService = _terminalChatService;
    this._commandLineAutoApprover = this._register(instantiationService.createInstance(CommandLineAutoApprover));
  }
  async analyze(options) {
    const isAutoApproveEnabledInSettings = this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) === true;
    if (isAutoApproveEnabledInSettings && options.chatSessionResource && this._terminalChatService.hasChatSessionAutoApproval(options.chatSessionResource)) {
      this._log("Session has auto approval enabled, auto approving command");
      const disableUri = createCommandUri(TerminalChatCommandId.DisableSessionAutoApproval, options.chatSessionResource);
      const mdTrustSettings = {
        isTrusted: {
          enabledCommands: [TerminalChatCommandId.DisableSessionAutoApproval]
        }
      };
      return {
        isAutoApproved: true,
        isAutoApproveAllowed: true,
        disclaimers: [],
        autoApproveInfo: new MarkdownString(`${localize("autoApprove.session", "Auto approved for this session")} ([${localize("autoApprove.session.disable", "Disable")}](${disableUri.toString()}))`, mdTrustSettings)
      };
    }
    const trimmedCommandLine = options.commandLine.trimStart();
    let subCommands;
    let hasUnanalyzableSyntax = false;
    try {
      const parseResult = await this._treeSitterCommandParser.extractAutoApprovalSubCommands(options.treeSitterLanguage, trimmedCommandLine);
      subCommands = parseResult.subCommands;
      hasUnanalyzableSyntax = parseResult.hasUnanalyzableSyntax;
      this._log(`Parsed sub-commands via ${options.treeSitterLanguage} grammar`, subCommands);
      if (hasUnanalyzableSyntax) {
        this._log("Command line contains syntax that cannot be safely auto-approved");
      }
    } catch (e) {
      console.error(e);
      this._log(`Failed to parse sub-commands via ${options.treeSitterLanguage} grammar`);
    }
    let isAutoApproved = false;
    let autoApproveInfo;
    let customActions;
    if (!subCommands?.length) {
      if (trimmedCommandLine.length === 0) {
        this._log("Command line is empty, auto approving");
        return {
          isAutoApproved: true,
          isAutoApproveAllowed: true,
          disclaimers: []
        };
      }
      this._log("No sub-commands were parsed, auto approval is not allowed");
      return {
        isAutoApproveAllowed: false,
        disclaimers: []
      };
    }
    const subCommandResults = await Promise.all(subCommands.map((e) => this._commandLineAutoApprover.isCommandAutoApproved(e, options.shell, options.os, options.cwd, options.chatSessionResource)));
    const commandLineResult = this._commandLineAutoApprover.isCommandLineAutoApproved(trimmedCommandLine, options.chatSessionResource);
    const autoApproveReasons = [
      ...subCommandResults.map((e) => e.reason),
      commandLineResult.reason
    ];
    let isDenied = false;
    let autoApproveReason;
    let autoApproveDefault;
    const deniedSubCommandResult = subCommandResults.find((e) => e.result === "denied");
    if (deniedSubCommandResult) {
      this._log("Sub-command DENIED auto approval");
      isDenied = true;
      autoApproveDefault = isAutoApproveRule(deniedSubCommandResult.rule) ? deniedSubCommandResult.rule.isDefaultRule : void 0;
      autoApproveReason = "subCommand";
    } else if (commandLineResult.result === "denied") {
      this._log("Command line DENIED auto approval");
      isDenied = true;
      autoApproveDefault = isAutoApproveRule(commandLineResult.rule) ? commandLineResult.rule.isDefaultRule : void 0;
      autoApproveReason = "commandLine";
    } else {
      if (subCommandResults.every((e) => e.result === "approved")) {
        this._log("All sub-commands auto-approved");
        isAutoApproved = true;
        autoApproveReason = "subCommand";
        autoApproveDefault = subCommandResults.every((e) => isAutoApproveRule(e.rule) && e.rule.isDefaultRule);
      } else {
        this._log("All sub-commands NOT auto-approved");
        if (commandLineResult.result === "approved") {
          this._log("Command line auto-approved");
          autoApproveReason = "commandLine";
          isAutoApproved = true;
          autoApproveDefault = isAutoApproveRule(commandLineResult.rule) ? commandLineResult.rule.isDefaultRule : void 0;
        } else {
          this._log("Command line NOT auto-approved");
        }
      }
    }
    if (hasUnanalyzableSyntax) {
      isAutoApproved = false;
    }
    for (const reason of autoApproveReasons) {
      this._log(`- ${reason}`);
    }
    const isAutoApproveEnabled = this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) === true;
    const isAutoApproveWarningAccepted = this._storageService.getBoolean(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, StorageScope.APPLICATION, false);
    if (isAutoApproveEnabled && isAutoApproved) {
      autoApproveInfo = this._createAutoApproveInfo(
        isAutoApproved,
        isDenied,
        autoApproveReason,
        subCommandResults,
        commandLineResult
      );
    } else {
      isAutoApproved = false;
    }
    this._telemetry.logPrepare({
      terminalToolSessionId: options.terminalToolSessionId,
      subCommands,
      autoApproveAllowed: !isAutoApproveEnabled ? "off" : isAutoApproveWarningAccepted ? "allowed" : "needsOptIn",
      autoApproveResult: isAutoApproved ? "approved" : isDenied ? "denied" : "manual",
      autoApproveReason,
      autoApproveDefault
    });
    const disclaimers = [];
    const subCommandsLowerFirstWordOnly = subCommands.map((command) => command.split(" ")[0].toLowerCase());
    if (!isAutoApproved && (subCommandsLowerFirstWordOnly.some((command) => promptInjectionWarningCommandsLower.includes(command)) || isPowerShell(options.shell, options.os) && subCommandsLowerFirstWordOnly.some((command) => promptInjectionWarningCommandsLowerPwshOnly.includes(command)))) {
      disclaimers.push(localize("runInTerminal.promptInjectionDisclaimer", "Web content may contain malicious code or attempt prompt injection attacks."));
    }
    if (isAutoApproveEnabled && isDenied) {
      const denialInfo = this._createAutoApproveInfo(
        isAutoApproved,
        isDenied,
        autoApproveReason,
        subCommandResults,
        commandLineResult
      );
      if (denialInfo) {
        disclaimers.push(denialInfo);
      }
    }
    if (!isAutoApproved && isAutoApproveEnabled && !hasUnanalyzableSyntax) {
      customActions = generateAutoApproveActions(trimmedCommandLine, subCommands, { subCommandResults, commandLineResult });
    }
    return {
      isAutoApproved,
      // Denied rules stay configurable; unanalyzable syntax cannot be auto-approved safely.
      isAutoApproveAllowed: !hasUnanalyzableSyntax,
      disclaimers,
      autoApproveInfo,
      customActions
    };
  }
  _createAutoApproveInfo(isAutoApproved, isDenied, autoApproveReason, subCommandResults, commandLineResult) {
    const formatRuleLinks = (result) => {
      return asArray(result).filter((e) => isAutoApproveRule(e.rule)).map((e) => {
        const escapedSourceText = e.rule.sourceText.replaceAll("$", "\\$");
        if (e.rule.sourceTarget === "session") {
          return localize("autoApproveRule.sessionIndicator", "{0} (session)", `\`${escapedSourceText}\``);
        }
        const settingsUri = createCommandUri(TerminalChatCommandId.OpenTerminalSettingsLink, e.rule.sourceTarget);
        const tooltip = localize("ruleTooltip", "View rule in settings");
        let label = escapedSourceText;
        switch (e.rule?.sourceTarget) {
          case ConfigurationTarget.DEFAULT:
            label = `${label} (default)`;
            break;
          case ConfigurationTarget.USER:
          case ConfigurationTarget.USER_LOCAL:
            label = `${label} (user)`;
            break;
          case ConfigurationTarget.USER_REMOTE:
            label = `${label} (remote)`;
            break;
          case ConfigurationTarget.WORKSPACE:
          case ConfigurationTarget.WORKSPACE_FOLDER:
            label = `${label} (workspace)`;
            break;
        }
        return `[\`${label}\`](${settingsUri.toString()} "${tooltip}")`;
      }).join(", ");
    };
    const mdTrustSettings = {
      isTrusted: {
        enabledCommands: [TerminalChatCommandId.OpenTerminalSettingsLink]
      }
    };
    const config = this._configurationService.inspect(ChatConfiguration.GlobalAutoApprove);
    const isGlobalAutoApproved = config?.value ?? config.defaultValue;
    if (isGlobalAutoApproved) {
      const settingsUri = createCommandUri(TerminalChatCommandId.OpenTerminalSettingsLink, "global");
      return new MarkdownString(`${localize("autoApprove.global", "Auto approved by setting {0}", `[\`${ChatConfiguration.GlobalAutoApprove}\`](${settingsUri.toString()} "${localize("ruleTooltip.global", "View settings")}")`)}`, mdTrustSettings);
    }
    if (isAutoApproved) {
      switch (autoApproveReason) {
        case "commandLine": {
          if (isAutoApproveRule(commandLineResult.rule)) {
            return new MarkdownString(localize("autoApprove.rule", "Auto approved by rule {0}", formatRuleLinks(commandLineResult)), mdTrustSettings);
          }
          break;
        }
        case "subCommand": {
          const npmScriptApproval = subCommandResults.find((e) => isNpmScriptAutoApproveRule(e.rule));
          if (npmScriptApproval && isNpmScriptAutoApproveRule(npmScriptApproval.rule) && npmScriptApproval.rule.npmScriptResult.autoApproveInfo) {
            return npmScriptApproval.rule.npmScriptResult.autoApproveInfo;
          }
          const uniqueRules = dedupeRules(subCommandResults);
          if (uniqueRules.length === 1) {
            return new MarkdownString(localize("autoApprove.rule", "Auto approved by rule {0}", formatRuleLinks(uniqueRules)), mdTrustSettings);
          } else if (uniqueRules.length > 1) {
            return new MarkdownString(localize("autoApprove.rules", "Auto approved by rules {0}", formatRuleLinks(uniqueRules)), mdTrustSettings);
          }
          break;
        }
      }
    } else if (isDenied) {
      switch (autoApproveReason) {
        case "commandLine": {
          if (commandLineResult.rule) {
            return new MarkdownString(localize("autoApproveDenied.rule", "Auto approval denied by rule {0}", formatRuleLinks(commandLineResult)), mdTrustSettings);
          }
          break;
        }
        case "subCommand": {
          const uniqueRules = dedupeRules(subCommandResults.filter((e) => e.result === "denied"));
          if (uniqueRules.length === 1) {
            return new MarkdownString(localize("autoApproveDenied.rule", "Auto approval denied by rule {0}", formatRuleLinks(uniqueRules)), mdTrustSettings);
          } else if (uniqueRules.length > 1) {
            return new MarkdownString(localize("autoApproveDenied.rules", "Auto approval denied by rules {0}", formatRuleLinks(uniqueRules)), mdTrustSettings);
          }
          break;
        }
      }
    }
    return void 0;
  }
};
CommandLineAutoApproveAnalyzer = __decorateClass([
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, ITerminalChatService)
], CommandLineAutoApproveAnalyzer);
export {
  CommandLineAutoApproveAnalyzer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL2NvbW1hbmRMaW5lQW5hbHl6ZXIvY29tbWFuZExpbmVBdXRvQXBwcm92ZUFuYWx5emVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb21tYW5kVXJpLCBNYXJrZG93blN0cmluZywgdHlwZSBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB0eXBlIHsgU2luZ2xlT3JNYW55IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgVGVybWluYWxUb29sQ29uZmlybWF0aW9uU3RvcmFnZUtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0VGVybWluYWxUb29sQ29uZmlybWF0aW9uU3ViUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgdHlwZSB7IFRvb2xDb25maXJtYXRpb25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGVybWluYWxDaGF0QWdlbnRUb29sc0NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgZGVkdXBlUnVsZXMsIGdlbmVyYXRlQXV0b0FwcHJvdmVBY3Rpb25zLCBpc1Bvd2VyU2hlbGwgfSBmcm9tICcuLi8uLi9ydW5JblRlcm1pbmFsSGVscGVycy5qcyc7XG5pbXBvcnQgdHlwZSB7IFJ1bkluVGVybWluYWxUb29sVGVsZW1ldHJ5IH0gZnJvbSAnLi4vLi4vcnVuSW5UZXJtaW5hbFRvb2xUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgdHlwZSBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlciB9IGZyb20gJy4uLy4uL3RyZWVTaXR0ZXJDb21tYW5kUGFyc2VyLmpzJztcbmltcG9ydCB7IHR5cGUgSUNvbW1hbmRMaW5lQW5hbHl6ZXIsIHR5cGUgSUNvbW1hbmRMaW5lQW5hbHl6ZXJPcHRpb25zLCB0eXBlIElDb21tYW5kTGluZUFuYWx5emVyUmVzdWx0LCB0eXBlIElBdXRvQXBwcm92ZVJ1bGUsIGlzQXV0b0FwcHJvdmVSdWxlLCBpc05wbVNjcmlwdEF1dG9BcHByb3ZlUnVsZSB9IGZyb20gJy4vY29tbWFuZExpbmVBbmFseXplci5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENoYXRDb21tYW5kSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2Jyb3dzZXIvdGVybWluYWxDaGF0LmpzJztcbmltcG9ydCB7IENvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLCB0eXBlIElDb21tYW5kQXBwcm92YWxSZXN1bHRXaXRoUmVhc29uIH0gZnJvbSAnLi9hdXRvQXBwcm92ZS9jb21tYW5kTGluZUF1dG9BcHByb3Zlci5qcyc7XG5cbmNvbnN0IHByb21wdEluamVjdGlvbldhcm5pbmdDb21tYW5kc0xvd2VyID0gW1xuXHQnY3VybCcsXG5cdCd3Z2V0Jyxcbl07XG5jb25zdCBwcm9tcHRJbmplY3Rpb25XYXJuaW5nQ29tbWFuZHNMb3dlclB3c2hPbmx5ID0gW1xuXHQnaW52b2tlLXJlc3RtZXRob2QnLFxuXHQnaW52b2tlLXdlYnJlcXVlc3QnLFxuXHQnaXJtJyxcblx0J2l3cicsXG5dO1xuXG5leHBvcnQgY2xhc3MgQ29tbWFuZExpbmVBdXRvQXBwcm92ZUFuYWx5emVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb21tYW5kTGluZUFuYWx5emVyIHtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZExpbmVBdXRvQXBwcm92ZXI6IENvbW1hbmRMaW5lQXV0b0FwcHJvdmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RyZWVTaXR0ZXJDb21tYW5kUGFyc2VyOiBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnk6IFJ1bkluVGVybWluYWxUb29sVGVsZW1ldHJ5LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZzogKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbENoYXRTZXJ2aWNlOiBJVGVybWluYWxDaGF0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jb21tYW5kTGluZUF1dG9BcHByb3ZlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbW1hbmRMaW5lQXV0b0FwcHJvdmVyKSk7XG5cdH1cblxuXHRhc3luYyBhbmFseXplKG9wdGlvbnM6IElDb21tYW5kTGluZUFuYWx5emVyT3B0aW9ucyk6IFByb21pc2U8SUNvbW1hbmRMaW5lQW5hbHl6ZXJSZXN1bHQ+IHtcblx0XHRjb25zdCBpc0F1dG9BcHByb3ZlRW5hYmxlZEluU2V0dGluZ3MgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkVuYWJsZUF1dG9BcHByb3ZlKSA9PT0gdHJ1ZTtcblx0XHRpZiAoaXNBdXRvQXBwcm92ZUVuYWJsZWRJblNldHRpbmdzICYmIG9wdGlvbnMuY2hhdFNlc3Npb25SZXNvdXJjZSAmJiB0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLmhhc0NoYXRTZXNzaW9uQXV0b0FwcHJvdmFsKG9wdGlvbnMuY2hhdFNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdHRoaXMuX2xvZygnU2Vzc2lvbiBoYXMgYXV0byBhcHByb3ZhbCBlbmFibGVkLCBhdXRvIGFwcHJvdmluZyBjb21tYW5kJyk7XG5cdFx0XHRjb25zdCBkaXNhYmxlVXJpID0gY3JlYXRlQ29tbWFuZFVyaShUZXJtaW5hbENoYXRDb21tYW5kSWQuRGlzYWJsZVNlc3Npb25BdXRvQXBwcm92YWwsIG9wdGlvbnMuY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBtZFRydXN0U2V0dGluZ3MgPSB7XG5cdFx0XHRcdGlzVHJ1c3RlZDoge1xuXHRcdFx0XHRcdGVuYWJsZWRDb21tYW5kczogW1Rlcm1pbmFsQ2hhdENvbW1hbmRJZC5EaXNhYmxlU2Vzc2lvbkF1dG9BcHByb3ZhbF1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlzQXV0b0FwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRpc0F1dG9BcHByb3ZlQWxsb3dlZDogdHJ1ZSxcblx0XHRcdFx0ZGlzY2xhaW1lcnM6IFtdLFxuXHRcdFx0XHRhdXRvQXBwcm92ZUluZm86IG5ldyBNYXJrZG93blN0cmluZyhgJHtsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuc2Vzc2lvbicsICdBdXRvIGFwcHJvdmVkIGZvciB0aGlzIHNlc3Npb24nKX0gKFske2xvY2FsaXplKCdhdXRvQXBwcm92ZS5zZXNzaW9uLmRpc2FibGUnLCAnRGlzYWJsZScpfV0oJHtkaXNhYmxlVXJpLnRvU3RyaW5nKCl9KSlgLCBtZFRydXN0U2V0dGluZ3MpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCB0cmltbWVkQ29tbWFuZExpbmUgPSBvcHRpb25zLmNvbW1hbmRMaW5lLnRyaW1TdGFydCgpO1xuXG5cdFx0bGV0IHN1YkNvbW1hbmRzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgaGFzVW5hbmFseXphYmxlU3ludGF4ID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlUmVzdWx0ID0gYXdhaXQgdGhpcy5fdHJlZVNpdHRlckNvbW1hbmRQYXJzZXIuZXh0cmFjdEF1dG9BcHByb3ZhbFN1YkNvbW1hbmRzKG9wdGlvbnMudHJlZVNpdHRlckxhbmd1YWdlLCB0cmltbWVkQ29tbWFuZExpbmUpO1xuXHRcdFx0c3ViQ29tbWFuZHMgPSBwYXJzZVJlc3VsdC5zdWJDb21tYW5kcztcblx0XHRcdGhhc1VuYW5hbHl6YWJsZVN5bnRheCA9IHBhcnNlUmVzdWx0Lmhhc1VuYW5hbHl6YWJsZVN5bnRheDtcblx0XHRcdHRoaXMuX2xvZyhgUGFyc2VkIHN1Yi1jb21tYW5kcyB2aWEgJHtvcHRpb25zLnRyZWVTaXR0ZXJMYW5ndWFnZX0gZ3JhbW1hcmAsIHN1YkNvbW1hbmRzKTtcblx0XHRcdGlmIChoYXNVbmFuYWx5emFibGVTeW50YXgpIHtcblx0XHRcdFx0dGhpcy5fbG9nKCdDb21tYW5kIGxpbmUgY29udGFpbnMgc3ludGF4IHRoYXQgY2Fubm90IGJlIHNhZmVseSBhdXRvLWFwcHJvdmVkJyk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcihlKTtcblx0XHRcdHRoaXMuX2xvZyhgRmFpbGVkIHRvIHBhcnNlIHN1Yi1jb21tYW5kcyB2aWEgJHtvcHRpb25zLnRyZWVTaXR0ZXJMYW5ndWFnZX0gZ3JhbW1hcmApO1xuXHRcdH1cblxuXHRcdGxldCBpc0F1dG9BcHByb3ZlZCA9IGZhbHNlO1xuXHRcdGxldCBhdXRvQXBwcm92ZUluZm86IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY3VzdG9tQWN0aW9uczogVG9vbENvbmZpcm1hdGlvbkFjdGlvbltdIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKCFzdWJDb21tYW5kcz8ubGVuZ3RoKSB7XG5cdFx0XHRpZiAodHJpbW1lZENvbW1hbmRMaW5lLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9sb2coJ0NvbW1hbmQgbGluZSBpcyBlbXB0eSwgYXV0byBhcHByb3ZpbmcnKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpc0F1dG9BcHByb3ZlZDogdHJ1ZSxcblx0XHRcdFx0XHRpc0F1dG9BcHByb3ZlQWxsb3dlZDogdHJ1ZSxcblx0XHRcdFx0XHRkaXNjbGFpbWVyczogW10sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2xvZygnTm8gc3ViLWNvbW1hbmRzIHdlcmUgcGFyc2VkLCBhdXRvIGFwcHJvdmFsIGlzIG5vdCBhbGxvd2VkJyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpc0F1dG9BcHByb3ZlQWxsb3dlZDogZmFsc2UsXG5cdFx0XHRcdGRpc2NsYWltZXJzOiBbXSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3ViQ29tbWFuZFJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChzdWJDb21tYW5kcy5tYXAoZSA9PiB0aGlzLl9jb21tYW5kTGluZUF1dG9BcHByb3Zlci5pc0NvbW1hbmRBdXRvQXBwcm92ZWQoZSwgb3B0aW9ucy5zaGVsbCwgb3B0aW9ucy5vcywgb3B0aW9ucy5jd2QsIG9wdGlvbnMuY2hhdFNlc3Npb25SZXNvdXJjZSkpKTtcblx0XHRjb25zdCBjb21tYW5kTGluZVJlc3VsdCA9IHRoaXMuX2NvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLmlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQodHJpbW1lZENvbW1hbmRMaW5lLCBvcHRpb25zLmNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGF1dG9BcHByb3ZlUmVhc29uczogc3RyaW5nW10gPSBbXG5cdFx0XHQuLi5zdWJDb21tYW5kUmVzdWx0cy5tYXAoZSA9PiBlLnJlYXNvbiksXG5cdFx0XHRjb21tYW5kTGluZVJlc3VsdC5yZWFzb24sXG5cdFx0XTtcblxuXHRcdGxldCBpc0RlbmllZCA9IGZhbHNlO1xuXHRcdGxldCBhdXRvQXBwcm92ZVJlYXNvbjogJ3N1YkNvbW1hbmQnIHwgJ2NvbW1hbmRMaW5lJyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYXV0b0FwcHJvdmVEZWZhdWx0OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgZGVuaWVkU3ViQ29tbWFuZFJlc3VsdCA9IHN1YkNvbW1hbmRSZXN1bHRzLmZpbmQoZSA9PiBlLnJlc3VsdCA9PT0gJ2RlbmllZCcpO1xuXHRcdGlmIChkZW5pZWRTdWJDb21tYW5kUmVzdWx0KSB7XG5cdFx0XHR0aGlzLl9sb2coJ1N1Yi1jb21tYW5kIERFTklFRCBhdXRvIGFwcHJvdmFsJyk7XG5cdFx0XHRpc0RlbmllZCA9IHRydWU7XG5cdFx0XHRhdXRvQXBwcm92ZURlZmF1bHQgPSBpc0F1dG9BcHByb3ZlUnVsZShkZW5pZWRTdWJDb21tYW5kUmVzdWx0LnJ1bGUpID8gZGVuaWVkU3ViQ29tbWFuZFJlc3VsdC5ydWxlLmlzRGVmYXVsdFJ1bGUgOiB1bmRlZmluZWQ7XG5cdFx0XHRhdXRvQXBwcm92ZVJlYXNvbiA9ICdzdWJDb21tYW5kJztcblx0XHR9IGVsc2UgaWYgKGNvbW1hbmRMaW5lUmVzdWx0LnJlc3VsdCA9PT0gJ2RlbmllZCcpIHtcblx0XHRcdHRoaXMuX2xvZygnQ29tbWFuZCBsaW5lIERFTklFRCBhdXRvIGFwcHJvdmFsJyk7XG5cdFx0XHRpc0RlbmllZCA9IHRydWU7XG5cdFx0XHRhdXRvQXBwcm92ZURlZmF1bHQgPSBpc0F1dG9BcHByb3ZlUnVsZShjb21tYW5kTGluZVJlc3VsdC5ydWxlKSA/IGNvbW1hbmRMaW5lUmVzdWx0LnJ1bGUuaXNEZWZhdWx0UnVsZSA6IHVuZGVmaW5lZDtcblx0XHRcdGF1dG9BcHByb3ZlUmVhc29uID0gJ2NvbW1hbmRMaW5lJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHN1YkNvbW1hbmRSZXN1bHRzLmV2ZXJ5KGUgPT4gZS5yZXN1bHQgPT09ICdhcHByb3ZlZCcpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZygnQWxsIHN1Yi1jb21tYW5kcyBhdXRvLWFwcHJvdmVkJyk7XG5cdFx0XHRcdGlzQXV0b0FwcHJvdmVkID0gdHJ1ZTtcblx0XHRcdFx0YXV0b0FwcHJvdmVSZWFzb24gPSAnc3ViQ29tbWFuZCc7XG5cdFx0XHRcdGF1dG9BcHByb3ZlRGVmYXVsdCA9IHN1YkNvbW1hbmRSZXN1bHRzLmV2ZXJ5KGUgPT4gaXNBdXRvQXBwcm92ZVJ1bGUoZS5ydWxlKSAmJiBlLnJ1bGUuaXNEZWZhdWx0UnVsZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2coJ0FsbCBzdWItY29tbWFuZHMgTk9UIGF1dG8tYXBwcm92ZWQnKTtcblx0XHRcdFx0aWYgKGNvbW1hbmRMaW5lUmVzdWx0LnJlc3VsdCA9PT0gJ2FwcHJvdmVkJykge1xuXHRcdFx0XHRcdHRoaXMuX2xvZygnQ29tbWFuZCBsaW5lIGF1dG8tYXBwcm92ZWQnKTtcblx0XHRcdFx0XHRhdXRvQXBwcm92ZVJlYXNvbiA9ICdjb21tYW5kTGluZSc7XG5cdFx0XHRcdFx0aXNBdXRvQXBwcm92ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGF1dG9BcHByb3ZlRGVmYXVsdCA9IGlzQXV0b0FwcHJvdmVSdWxlKGNvbW1hbmRMaW5lUmVzdWx0LnJ1bGUpID8gY29tbWFuZExpbmVSZXN1bHQucnVsZS5pc0RlZmF1bHRSdWxlIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2xvZygnQ29tbWFuZCBsaW5lIE5PVCBhdXRvLWFwcHJvdmVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTaGVsbC1zdGF0ZSBtdXRhdGlvbnMgb21pdHRlZCBmcm9tIG5vcm1hbCBjb21tYW5kIGV4dHJhY3Rpb24gbXVzdCBuZXZlclxuXHRcdC8vIGF1dG8tYXBwcm92ZSwgZXZlbiB3aGVuIGV2ZXJ5IGV4dHJhY3RlZCBzdWItY29tbWFuZCBtYXRjaGVzIGFuIGFsbG93IHJ1bGUuXG5cdFx0aWYgKGhhc1VuYW5hbHl6YWJsZVN5bnRheCkge1xuXHRcdFx0aXNBdXRvQXBwcm92ZWQgPSBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBMb2cgZGV0YWlsZWQgYXV0byBhcHByb3ZhbCByZWFzb25pbmdcblx0XHRmb3IgKGNvbnN0IHJlYXNvbiBvZiBhdXRvQXBwcm92ZVJlYXNvbnMpIHtcblx0XHRcdHRoaXMuX2xvZyhgLSAke3JlYXNvbn1gKTtcblx0XHR9XG5cblx0XHQvLyBBcHBseSBhdXRvIGFwcHJvdmFsIG9yIGZvcmNlIGl0IG9mZiBkZXBlbmRpbmcgb24gZW5hYmxlbWVudC9vcHQtaW4gc3RhdGVcblx0XHRjb25zdCBpc0F1dG9BcHByb3ZlRW5hYmxlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRW5hYmxlQXV0b0FwcHJvdmUpID09PSB0cnVlO1xuXHRcdGNvbnN0IGlzQXV0b0FwcHJvdmVXYXJuaW5nQWNjZXB0ZWQgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKFRlcm1pbmFsVG9vbENvbmZpcm1hdGlvblN0b3JhZ2VLZXlzLlRlcm1pbmFsQXV0b0FwcHJvdmVXYXJuaW5nQWNjZXB0ZWQsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXHRcdGlmIChpc0F1dG9BcHByb3ZlRW5hYmxlZCAmJiBpc0F1dG9BcHByb3ZlZCkge1xuXHRcdFx0YXV0b0FwcHJvdmVJbmZvID0gdGhpcy5fY3JlYXRlQXV0b0FwcHJvdmVJbmZvKFxuXHRcdFx0XHRpc0F1dG9BcHByb3ZlZCxcblx0XHRcdFx0aXNEZW5pZWQsXG5cdFx0XHRcdGF1dG9BcHByb3ZlUmVhc29uLFxuXHRcdFx0XHRzdWJDb21tYW5kUmVzdWx0cyxcblx0XHRcdFx0Y29tbWFuZExpbmVSZXN1bHQsXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpc0F1dG9BcHByb3ZlZCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFNlbmQgdGVsZW1ldHJ5IGFib3V0IGF1dG8gYXBwcm92YWwgcHJvY2Vzc1xuXHRcdHRoaXMuX3RlbGVtZXRyeS5sb2dQcmVwYXJlKHtcblx0XHRcdHRlcm1pbmFsVG9vbFNlc3Npb25JZDogb3B0aW9ucy50ZXJtaW5hbFRvb2xTZXNzaW9uSWQsXG5cdFx0XHRzdWJDb21tYW5kcyxcblx0XHRcdGF1dG9BcHByb3ZlQWxsb3dlZDogIWlzQXV0b0FwcHJvdmVFbmFibGVkID8gJ29mZicgOiBpc0F1dG9BcHByb3ZlV2FybmluZ0FjY2VwdGVkID8gJ2FsbG93ZWQnIDogJ25lZWRzT3B0SW4nLFxuXHRcdFx0YXV0b0FwcHJvdmVSZXN1bHQ6IGlzQXV0b0FwcHJvdmVkID8gJ2FwcHJvdmVkJyA6IGlzRGVuaWVkID8gJ2RlbmllZCcgOiAnbWFudWFsJyxcblx0XHRcdGF1dG9BcHByb3ZlUmVhc29uLFxuXHRcdFx0YXV0b0FwcHJvdmVEZWZhdWx0XG5cdFx0fSk7XG5cblx0XHQvLyBQcm9tcHQgaW5qZWN0aW9uIHdhcm5pbmcgZm9yIGNvbW1vbiBjb21tYW5kcyB0aGF0IHJldHVybiBjb250ZW50IGZyb20gdGhlIHdlYlxuXHRcdGNvbnN0IGRpc2NsYWltZXJzOiAoc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nKVtdID0gW107XG5cdFx0Y29uc3Qgc3ViQ29tbWFuZHNMb3dlckZpcnN0V29yZE9ubHkgPSBzdWJDb21tYW5kcy5tYXAoY29tbWFuZCA9PiBjb21tYW5kLnNwbGl0KCcgJylbMF0udG9Mb3dlckNhc2UoKSk7XG5cdFx0aWYgKCFpc0F1dG9BcHByb3ZlZCAmJiAoXG5cdFx0XHRzdWJDb21tYW5kc0xvd2VyRmlyc3RXb3JkT25seS5zb21lKGNvbW1hbmQgPT4gcHJvbXB0SW5qZWN0aW9uV2FybmluZ0NvbW1hbmRzTG93ZXIuaW5jbHVkZXMoY29tbWFuZCkpIHx8XG5cdFx0XHQoaXNQb3dlclNoZWxsKG9wdGlvbnMuc2hlbGwsIG9wdGlvbnMub3MpICYmIHN1YkNvbW1hbmRzTG93ZXJGaXJzdFdvcmRPbmx5LnNvbWUoY29tbWFuZCA9PiBwcm9tcHRJbmplY3Rpb25XYXJuaW5nQ29tbWFuZHNMb3dlclB3c2hPbmx5LmluY2x1ZGVzKGNvbW1hbmQpKSlcblx0XHQpKSB7XG5cdFx0XHRkaXNjbGFpbWVycy5wdXNoKGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnByb21wdEluamVjdGlvbkRpc2NsYWltZXInLCAnV2ViIGNvbnRlbnQgbWF5IGNvbnRhaW4gbWFsaWNpb3VzIGNvZGUgb3IgYXR0ZW1wdCBwcm9tcHQgaW5qZWN0aW9uIGF0dGFja3MuJykpO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBkZW5pYWwgcmVhc29uIHRvIGRpc2NsYWltZXJzIHdoZW4gYXV0by1hcHByb3ZlIGlzIGVuYWJsZWQgYnV0IGNvbW1hbmQgd2FzIGRlbmllZCBieSBhIHJ1bGVcblx0XHRpZiAoaXNBdXRvQXBwcm92ZUVuYWJsZWQgJiYgaXNEZW5pZWQpIHtcblx0XHRcdGNvbnN0IGRlbmlhbEluZm8gPSB0aGlzLl9jcmVhdGVBdXRvQXBwcm92ZUluZm8oXG5cdFx0XHRcdGlzQXV0b0FwcHJvdmVkLFxuXHRcdFx0XHRpc0RlbmllZCxcblx0XHRcdFx0YXV0b0FwcHJvdmVSZWFzb24sXG5cdFx0XHRcdHN1YkNvbW1hbmRSZXN1bHRzLFxuXHRcdFx0XHRjb21tYW5kTGluZVJlc3VsdCxcblx0XHRcdCk7XG5cdFx0XHRpZiAoZGVuaWFsSW5mbykge1xuXHRcdFx0XHRkaXNjbGFpbWVycy5wdXNoKGRlbmlhbEluZm8pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVuYW5hbHl6YWJsZSBzaGVsbC1zdGF0ZSBzeW50YXggY2Fubm90IGJlIGV4cHJlc3NlZCBhcyBhIHNhZmUgcGVyc2lzdGVudCBydWxlLlxuXHRcdGlmICghaXNBdXRvQXBwcm92ZWQgJiYgaXNBdXRvQXBwcm92ZUVuYWJsZWQgJiYgIWhhc1VuYW5hbHl6YWJsZVN5bnRheCkge1xuXHRcdFx0Y3VzdG9tQWN0aW9ucyA9IGdlbmVyYXRlQXV0b0FwcHJvdmVBY3Rpb25zKHRyaW1tZWRDb21tYW5kTGluZSwgc3ViQ29tbWFuZHMsIHsgc3ViQ29tbWFuZFJlc3VsdHMsIGNvbW1hbmRMaW5lUmVzdWx0IH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpc0F1dG9BcHByb3ZlZCxcblx0XHRcdC8vIERlbmllZCBydWxlcyBzdGF5IGNvbmZpZ3VyYWJsZTsgdW5hbmFseXphYmxlIHN5bnRheCBjYW5ub3QgYmUgYXV0by1hcHByb3ZlZCBzYWZlbHkuXG5cdFx0XHRpc0F1dG9BcHByb3ZlQWxsb3dlZDogIWhhc1VuYW5hbHl6YWJsZVN5bnRheCxcblx0XHRcdGRpc2NsYWltZXJzLFxuXHRcdFx0YXV0b0FwcHJvdmVJbmZvLFxuXHRcdFx0Y3VzdG9tQWN0aW9ucyxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlQXV0b0FwcHJvdmVJbmZvKFxuXHRcdGlzQXV0b0FwcHJvdmVkOiBib29sZWFuLFxuXHRcdGlzRGVuaWVkOiBib29sZWFuLFxuXHRcdGF1dG9BcHByb3ZlUmVhc29uOiAnc3ViQ29tbWFuZCcgfCAnY29tbWFuZExpbmUnIHwgdW5kZWZpbmVkLFxuXHRcdHN1YkNvbW1hbmRSZXN1bHRzOiBJQ29tbWFuZEFwcHJvdmFsUmVzdWx0V2l0aFJlYXNvbltdLFxuXHRcdGNvbW1hbmRMaW5lUmVzdWx0OiBJQ29tbWFuZEFwcHJvdmFsUmVzdWx0V2l0aFJlYXNvbixcblx0KTogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmb3JtYXRSdWxlTGlua3MgPSAocmVzdWx0OiBTaW5nbGVPck1hbnk8SUNvbW1hbmRBcHByb3ZhbFJlc3VsdFdpdGhSZWFzb24+KTogc3RyaW5nID0+IHtcblx0XHRcdHJldHVybiBhc0FycmF5KHJlc3VsdClcblx0XHRcdFx0LmZpbHRlcigoZSk6IGUgaXMgSUNvbW1hbmRBcHByb3ZhbFJlc3VsdFdpdGhSZWFzb24gJiB7IHJ1bGU6IElBdXRvQXBwcm92ZVJ1bGUgfSA9PlxuXHRcdFx0XHRcdGlzQXV0b0FwcHJvdmVSdWxlKGUucnVsZSkpXG5cdFx0XHRcdC5tYXAoZSA9PiB7XG5cdFx0XHRcdFx0Ly8gU2Vzc2lvbiBydWxlcyBjYW5ub3QgYmUgYWN0aW9uZWQgY3VycmVudGx5IHNvIG5vIGxpbmtcblx0XHRcdFx0XHRjb25zdCBlc2NhcGVkU291cmNlVGV4dCA9IGUucnVsZS5zb3VyY2VUZXh0LnJlcGxhY2VBbGwoJyQnLCAnXFxcXCQnKTtcblx0XHRcdFx0XHRpZiAoZS5ydWxlLnNvdXJjZVRhcmdldCA9PT0gJ3Nlc3Npb24nKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2F1dG9BcHByb3ZlUnVsZS5zZXNzaW9uSW5kaWNhdG9yJywgJ3swfSAoc2Vzc2lvbiknLCBgXFxgJHtlc2NhcGVkU291cmNlVGV4dH1cXGBgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3Qgc2V0dGluZ3NVcmkgPSBjcmVhdGVDb21tYW5kVXJpKFRlcm1pbmFsQ2hhdENvbW1hbmRJZC5PcGVuVGVybWluYWxTZXR0aW5nc0xpbmssIGUucnVsZS5zb3VyY2VUYXJnZXQpO1xuXHRcdFx0XHRcdGNvbnN0IHRvb2x0aXAgPSBsb2NhbGl6ZSgncnVsZVRvb2x0aXAnLCAnVmlldyBydWxlIGluIHNldHRpbmdzJyk7XG5cdFx0XHRcdFx0bGV0IGxhYmVsID0gZXNjYXBlZFNvdXJjZVRleHQ7XG5cdFx0XHRcdFx0c3dpdGNoIChlLnJ1bGU/LnNvdXJjZVRhcmdldCkge1xuXHRcdFx0XHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LkRFRkFVTFQ6XG5cdFx0XHRcdFx0XHRcdGxhYmVsID0gYCR7bGFiZWx9IChkZWZhdWx0KWA7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVI6XG5cdFx0XHRcdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDpcblx0XHRcdFx0XHRcdFx0bGFiZWwgPSBgJHtsYWJlbH0gKHVzZXIpYDtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEU6XG5cdFx0XHRcdFx0XHRcdGxhYmVsID0gYCR7bGFiZWx9IChyZW1vdGUpYDtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFOlxuXHRcdFx0XHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI6XG5cdFx0XHRcdFx0XHRcdGxhYmVsID0gYCR7bGFiZWx9ICh3b3Jrc3BhY2UpYDtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBgW1xcYCR7bGFiZWx9XFxgXSgke3NldHRpbmdzVXJpLnRvU3RyaW5nKCl9IFwiJHt0b29sdGlwfVwiKWA7XG5cdFx0XHRcdH0pLmpvaW4oJywgJyk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IG1kVHJ1c3RTZXR0aW5ncyA9IHtcblx0XHRcdGlzVHJ1c3RlZDoge1xuXHRcdFx0XHRlbmFibGVkQ29tbWFuZHM6IFtUZXJtaW5hbENoYXRDb21tYW5kSWQuT3BlblRlcm1pbmFsU2V0dGluZ3NMaW5rXVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBjb25maWcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PGJvb2xlYW4gfCBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPj4oQ2hhdENvbmZpZ3VyYXRpb24uR2xvYmFsQXV0b0FwcHJvdmUpO1xuXHRcdGNvbnN0IGlzR2xvYmFsQXV0b0FwcHJvdmVkID0gY29uZmlnPy52YWx1ZSA/PyBjb25maWcuZGVmYXVsdFZhbHVlO1xuXHRcdGlmIChpc0dsb2JhbEF1dG9BcHByb3ZlZCkge1xuXHRcdFx0Y29uc3Qgc2V0dGluZ3NVcmkgPSBjcmVhdGVDb21tYW5kVXJpKFRlcm1pbmFsQ2hhdENvbW1hbmRJZC5PcGVuVGVybWluYWxTZXR0aW5nc0xpbmssICdnbG9iYWwnKTtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoYCR7bG9jYWxpemUoJ2F1dG9BcHByb3ZlLmdsb2JhbCcsICdBdXRvIGFwcHJvdmVkIGJ5IHNldHRpbmcgezB9JywgYFtcXGAke0NoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlfVxcYF0oJHtzZXR0aW5nc1VyaS50b1N0cmluZygpfSBcIiR7bG9jYWxpemUoJ3J1bGVUb29sdGlwLmdsb2JhbCcsICdWaWV3IHNldHRpbmdzJyl9XCIpYCl9YCwgbWRUcnVzdFNldHRpbmdzKTtcblx0XHR9XG5cblx0XHRpZiAoaXNBdXRvQXBwcm92ZWQpIHtcblx0XHRcdHN3aXRjaCAoYXV0b0FwcHJvdmVSZWFzb24pIHtcblx0XHRcdFx0Y2FzZSAnY29tbWFuZExpbmUnOiB7XG5cdFx0XHRcdFx0aWYgKGlzQXV0b0FwcHJvdmVSdWxlKGNvbW1hbmRMaW5lUmVzdWx0LnJ1bGUpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdhdXRvQXBwcm92ZS5ydWxlJywgJ0F1dG8gYXBwcm92ZWQgYnkgcnVsZSB7MH0nLCBmb3JtYXRSdWxlTGlua3MoY29tbWFuZExpbmVSZXN1bHQpKSwgbWRUcnVzdFNldHRpbmdzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnc3ViQ29tbWFuZCc6IHtcblx0XHRcdFx0XHQvLyBDaGVjayBpZiBhcHByb3ZhbCBjYW1lIGZyb20gbnBtIHNjcmlwdFxuXHRcdFx0XHRcdGNvbnN0IG5wbVNjcmlwdEFwcHJvdmFsID0gc3ViQ29tbWFuZFJlc3VsdHMuZmluZChlID0+IGlzTnBtU2NyaXB0QXV0b0FwcHJvdmVSdWxlKGUucnVsZSkpO1xuXHRcdFx0XHRcdGlmIChucG1TY3JpcHRBcHByb3ZhbCAmJiBpc05wbVNjcmlwdEF1dG9BcHByb3ZlUnVsZShucG1TY3JpcHRBcHByb3ZhbC5ydWxlKSAmJiBucG1TY3JpcHRBcHByb3ZhbC5ydWxlLm5wbVNjcmlwdFJlc3VsdC5hdXRvQXBwcm92ZUluZm8pIHtcblx0XHRcdFx0XHRcdHJldHVybiBucG1TY3JpcHRBcHByb3ZhbC5ydWxlLm5wbVNjcmlwdFJlc3VsdC5hdXRvQXBwcm92ZUluZm87XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHVuaXF1ZVJ1bGVzID0gZGVkdXBlUnVsZXMoc3ViQ29tbWFuZFJlc3VsdHMpO1xuXHRcdFx0XHRcdGlmICh1bmlxdWVSdWxlcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2F1dG9BcHByb3ZlLnJ1bGUnLCAnQXV0byBhcHByb3ZlZCBieSBydWxlIHswfScsIGZvcm1hdFJ1bGVMaW5rcyh1bmlxdWVSdWxlcykpLCBtZFRydXN0U2V0dGluZ3MpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodW5pcXVlUnVsZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYXV0b0FwcHJvdmUucnVsZXMnLCAnQXV0byBhcHByb3ZlZCBieSBydWxlcyB7MH0nLCBmb3JtYXRSdWxlTGlua3ModW5pcXVlUnVsZXMpKSwgbWRUcnVzdFNldHRpbmdzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzRGVuaWVkKSB7XG5cdFx0XHRzd2l0Y2ggKGF1dG9BcHByb3ZlUmVhc29uKSB7XG5cdFx0XHRcdGNhc2UgJ2NvbW1hbmRMaW5lJzoge1xuXHRcdFx0XHRcdGlmIChjb21tYW5kTGluZVJlc3VsdC5ydWxlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdhdXRvQXBwcm92ZURlbmllZC5ydWxlJywgJ0F1dG8gYXBwcm92YWwgZGVuaWVkIGJ5IHJ1bGUgezB9JywgZm9ybWF0UnVsZUxpbmtzKGNvbW1hbmRMaW5lUmVzdWx0KSksIG1kVHJ1c3RTZXR0aW5ncyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ3N1YkNvbW1hbmQnOiB7XG5cdFx0XHRcdFx0Y29uc3QgdW5pcXVlUnVsZXMgPSBkZWR1cGVSdWxlcyhzdWJDb21tYW5kUmVzdWx0cy5maWx0ZXIoZSA9PiBlLnJlc3VsdCA9PT0gJ2RlbmllZCcpKTtcblx0XHRcdFx0XHRpZiAodW5pcXVlUnVsZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdhdXRvQXBwcm92ZURlbmllZC5ydWxlJywgJ0F1dG8gYXBwcm92YWwgZGVuaWVkIGJ5IHJ1bGUgezB9JywgZm9ybWF0UnVsZUxpbmtzKHVuaXF1ZVJ1bGVzKSksIG1kVHJ1c3RTZXR0aW5ncyk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh1bmlxdWVSdWxlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdhdXRvQXBwcm92ZURlbmllZC5ydWxlcycsICdBdXRvIGFwcHJvdmFsIGRlbmllZCBieSBydWxlcyB7MH0nLCBmb3JtYXRSdWxlTGlua3ModW5pcXVlUnVsZXMpKSwgbWRUcnVzdFNldHRpbmdzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQixzQkFBNEM7QUFDdkUsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGFBQWEsNEJBQTRCLG9CQUFvQjtBQUd0RSxTQUE4SCxtQkFBbUIsa0NBQWtDO0FBQ25MLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsK0JBQXNFO0FBRS9FLE1BQU0sc0NBQXNDO0FBQUEsRUFDM0M7QUFBQSxFQUNBO0FBQ0Q7QUFDQSxNQUFNLDhDQUE4QztBQUFBLEVBQ25EO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0Q7QUFFTyxJQUFNLGlDQUFOLGNBQTZDLFdBQTJDO0FBQUEsRUFHOUYsWUFDa0IsMEJBQ0EsWUFDQSxNQUN1Qix1QkFDakIsc0JBQ1csaUJBQ0ssc0JBQ3RDO0FBQ0QsVUFBTTtBQVJXO0FBQ0E7QUFDQTtBQUN1QjtBQUVOO0FBQ0s7QUFHdkMsU0FBSywyQkFBMkIsS0FBSyxVQUFVLHFCQUFxQixlQUFlLHVCQUF1QixDQUFDO0FBQUEsRUFDNUc7QUFBQSxFQUVBLE1BQU0sUUFBUSxTQUEyRTtBQUN4RixVQUFNLGlDQUFpQyxLQUFLLHNCQUFzQixTQUFrQixnQ0FBZ0MsaUJBQWlCLE1BQU07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
