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
import { asArray } from "../../../../base/common/arrays.js";
import { mapFindFirst } from "../../../../base/common/arraysFind.js";
import { Sequencer } from "../../../../base/common/async.js";
import { decodeBase64 } from "../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isDefined } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, getConfigValueInTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { ChatConfiguration } from "../../chat/common/constants.js";
import { ChatMessageRole, ILanguageModelsService } from "../../chat/common/languageModels.js";
import { McpCommandIds } from "./mcpCommandIds.js";
import { mcpServerSamplingSection } from "./mcpConfiguration.js";
import { McpSamplingLog } from "./mcpSamplingLog.js";
import { McpError } from "./mcpTypes.js";
var ModelMatch = /* @__PURE__ */ ((ModelMatch2) => {
  ModelMatch2[ModelMatch2["UnsureAllowedDuringChat"] = 0] = "UnsureAllowedDuringChat";
  ModelMatch2[ModelMatch2["UnsureAllowedOutsideChat"] = 1] = "UnsureAllowedOutsideChat";
  ModelMatch2[ModelMatch2["NotAllowed"] = 2] = "NotAllowed";
  ModelMatch2[ModelMatch2["NoMatchingModel"] = 3] = "NoMatchingModel";
  return ModelMatch2;
})(ModelMatch || {});
let McpSamplingService = class extends Disposable {
  constructor(_languageModelsService, _configurationService, _dialogService, _notificationService, _commandService, instaService) {
    super();
    this._languageModelsService = _languageModelsService;
    this._configurationService = _configurationService;
    this._dialogService = _dialogService;
    this._notificationService = _notificationService;
    this._commandService = _commandService;
    this._sessionSets = {
      allowedDuringChat: /* @__PURE__ */ new Map(),
      allowedOutsideChat: /* @__PURE__ */ new Map()
    };
    this._modelSequencer = new Sequencer();
    this._logs = this._register(instaService.createInstance(McpSamplingLog));
  }
  async sample(opts, token = CancellationToken.None) {
    const messages = opts.params.messages.map((message) => {
      const content = asArray(message.content).map(
        (part) => part.type === "text" ? { type: "text", value: part.text } : part.type === "image" || part.type === "audio" ? { type: "image_url", value: { mimeType: part.mimeType, data: decodeBase64(part.data) } } : void 0
      ).filter(isDefined);
      if (!content.length) {
        return void 0;
      }
      return {
        role: message.role === "assistant" ? ChatMessageRole.Assistant : ChatMessageRole.User,
        content
      };
    }).filter(isDefined);
    if (opts.params.systemPrompt) {
      messages.unshift({ role: ChatMessageRole.System, content: [{ type: "text", value: opts.params.systemPrompt }] });
    }
    const model = await this._modelSequencer.queue(() => this._getMatchingModel(opts));
    const response = await this._languageModelsService.sendChatRequest(model, void 0, messages, {}, token);
    let responseText = "";
    const streaming = (async () => {
      for await (const part of response.stream) {
        if (Array.isArray(part)) {
          for (const p of part) {
            if (p.type === "text") {
              responseText += p.value;
            }
          }
        } else if (part.type === "text") {
          responseText += part.value;
        }
      }
    })();
    try {
      await Promise.all([response.result, streaming]);
      this._logs.add(opts.server, opts.params.messages, responseText, model);
      return {
        sample: {
          model,
          content: { type: "text", text: responseText },
          role: "assistant"
          // it came from the model!
        }
      };
    } catch (err) {
      throw McpError.unknown(err);
    }
  }
  hasLogs(server) {
    return this._logs.has(server);
  }
  getLogText(server) {
    return this._logs.getAsText(server);
  }
  async _getMatchingModel(opts) {
    const model = await this._getMatchingModelInner(opts.server, opts.isDuringToolCall, opts.params.modelPreferences);
    const globalAutoApprove = this._configurationService.getValue(ChatConfiguration.GlobalAutoApprove);
    if (model === 0 /* UnsureAllowedDuringChat */) {
      if (globalAutoApprove) {
        this._sessionSets.allowedDuringChat.set(opts.server.definition.id, true);
        return this._getMatchingModel(opts);
      }
      const retry = await this._showContextual(
        opts.isDuringToolCall,
        localize("mcp.sampling.allowDuringChat.title", 'Allow MCP tools from "{0}" to make LLM requests?', opts.server.definition.label),
        localize("mcp.sampling.allowDuringChat.desc", 'The MCP server "{0}" has issued a request to make a language model call. Do you want to allow it to make requests during chat?', opts.server.definition.label),
        this.allowButtons(opts.server, "allowedDuringChat")
      );
      if (retry) {
        return this._getMatchingModel(opts);
      }
      throw McpError.notAllowed();
    } else if (model === 1 /* UnsureAllowedOutsideChat */) {
      if (globalAutoApprove) {
        this._sessionSets.allowedOutsideChat.set(opts.server.definition.id, true);
        return this._getMatchingModel(opts);
      }
      const retry = await this._showContextual(
        opts.isDuringToolCall,
        localize("mcp.sampling.allowOutsideChat.title", 'Allow MCP server "{0}" to make LLM requests?', opts.server.definition.label),
        localize("mcp.sampling.allowOutsideChat.desc", 'The MCP server "{0}" has issued a request to make a language model call. Do you want to allow it to make requests, outside of tool calls during chat?', opts.server.definition.label),
        this.allowButtons(opts.server, "allowedOutsideChat")
      );
      if (retry) {
        return this._getMatchingModel(opts);
      }
      throw McpError.notAllowed();
    } else if (model === 2 /* NotAllowed */) {
      throw McpError.notAllowed();
    } else if (model === 3 /* NoMatchingModel */) {
      const newlyPickedModels = opts.isDuringToolCall ? await this._commandService.executeCommand(McpCommandIds.ConfigureSamplingModels, opts.server) : await this._notify(
        localize("mcp.sampling.needsModels", 'MCP server "{0}" triggered a language model request, but it has no allowlisted models.', opts.server.definition.label),
        {
          [localize("configure", "Configure")]: () => this._commandService.executeCommand(McpCommandIds.ConfigureSamplingModels, opts.server),
          [localize("cancel", "Cancel")]: () => Promise.resolve(void 0)
        }
      );
      if (newlyPickedModels) {
        return this._getMatchingModel(opts);
      }
      throw McpError.notAllowed();
    }
    return model;
  }
  allowButtons(server, key) {
    return {
      [localize("mcp.sampling.allow.inSession", "Allow in this Session")]: async () => {
        this._sessionSets[key].set(server.definition.id, true);
        return true;
      },
      [localize("mcp.sampling.allow.always", "Always")]: async () => {
        await this.updateConfig(server, (c) => c[key] = true);
        return true;
      },
      [localize("mcp.sampling.allow.notNow", "Not Now")]: async () => {
        this._sessionSets[key].set(server.definition.id, false);
        return false;
      },
      [localize("mcp.sampling.allow.never", "Never")]: async () => {
        await this.updateConfig(server, (c) => c[key] = false);
        return false;
      }
    };
  }
  async _showContextual(isDuringToolCall, title, message, buttons) {
    if (isDuringToolCall) {
      const result = await this._dialogService.prompt({
        type: "question",
        title,
        message,
        buttons: Object.entries(buttons).map(([label, run]) => ({ label, run }))
      });
      return await result.result;
    } else {
      return await this._notify(message, buttons);
    }
  }
  async _notify(message, buttons) {
    return await new Promise((resolve) => {
      const handle = this._notificationService.prompt(
        Severity.Info,
        message,
        Object.entries(buttons).map(([label, action]) => ({
          label,
          run: () => resolve(action())
        }))
      );
      Event.once(handle.onDidClose)(() => resolve(void 0));
    });
  }
  /**
   * Gets the matching model for the MCP server in this context, or
   * a reason why no model could be selected.
   */
  async _getMatchingModelInner(server, isDuringToolCall, preferences) {
    const config = this.getConfig(server);
    if (isDuringToolCall && !config.allowedDuringChat && !this._sessionSets.allowedDuringChat.has(server.definition.id)) {
      return config.allowedDuringChat === void 0 ? 0 /* UnsureAllowedDuringChat */ : 2 /* NotAllowed */;
    } else if (!isDuringToolCall && !config.allowedOutsideChat && !this._sessionSets.allowedOutsideChat.has(server.definition.id)) {
      return config.allowedOutsideChat === void 0 ? 1 /* UnsureAllowedOutsideChat */ : 2 /* NotAllowed */;
    }
    const foundModelIds = config.allowedModels?.filter((m) => !!this._languageModelsService.lookupLanguageModel(m)) || this._getDefaultModels();
    if (!foundModelIds.length) {
      return 3 /* NoMatchingModel */;
    }
    if (preferences?.hints) {
      const found = mapFindFirst(preferences.hints, (hint) => foundModelIds.find((model) => model.toLowerCase().includes(hint.name.toLowerCase())));
      if (found) {
        return found;
      }
    }
    return foundModelIds[0];
  }
  _getDefaultModels() {
    const candidates = this._languageModelsService.getLanguageModelIds().map((m) => {
      const model = this._languageModelsService.lookupLanguageModel(m);
      return model && !model.multiplierNumeric && !model.targetChatSessionType ? { model, id: m } : void 0;
    }).filter(isDefined);
    const someDefault = candidates.findIndex((c) => Object.values(c.model.isDefaultForLocation).some(Boolean));
    if (someDefault !== -1) {
      [candidates[0], candidates[someDefault]] = [candidates[someDefault], candidates[0]];
    }
    return candidates.map((c) => c.id);
  }
  _configKey(server) {
    return `${server.collection.label}: ${server.definition.label}`;
  }
  getConfig(server) {
    return this._getConfig(server).value || {};
  }
  /**
   * _getConfig reads the sampling config reads the `{ server: data }` mapping
   * from the appropriate config. We read from the most specific possible
   * config up to the default configuration location that the MCP server itself
   * is defined in. We don't go further because then workspace-specific servers
   * would get in the user settings which is not meaningful and could lead
   * to confusion.
   *
   * todo@connor4312: generalize this for other esttings when we have them
   */
  _getConfig(server) {
    const def = server.readDefinitions().get();
    const mostSpecificConfig = ConfigurationTarget.MEMORY;
    const leastSpecificConfig = def.collection?.configTarget || ConfigurationTarget.USER;
    const key = this._configKey(server);
    const resource = def.collection?.presentation?.origin;
    const configValue = this._configurationService.inspect(mcpServerSamplingSection, { resource });
    for (let target = mostSpecificConfig; target >= leastSpecificConfig; target--) {
      const mapping = getConfigValueInTarget(configValue, target);
      const config = mapping?.[key];
      if (config) {
        return { value: config, key, mapping, target, resource };
      }
    }
    return { value: void 0, mapping: getConfigValueInTarget(configValue, leastSpecificConfig), key, target: leastSpecificConfig, resource };
  }
  async updateConfig(server, mutate) {
    const { value, mapping, key, target, resource } = this._getConfig(server);
    const newConfig = { ...value };
    mutate(newConfig);
    await this._configurationService.updateValue(
      mcpServerSamplingSection,
      { ...mapping, [key]: newConfig },
      { resource },
      target
    );
    return newConfig;
  }
};
McpSamplingService = __decorateClass([
  __decorateParam(0, ILanguageModelsService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IInstantiationService)
], McpSamplingService);
export {
  McpSamplingService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwU2FtcGxpbmdTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBtYXBGaW5kRmlyc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IFNlcXVlbmNlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGRlY29kZUJhc2U2NCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIGdldENvbmZpZ1ZhbHVlSW5UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2hhdEltYWdlTWltZVR5cGUsIENoYXRNZXNzYWdlUm9sZSwgSUNoYXRNZXNzYWdlLCBJQ2hhdE1lc3NhZ2VQYXJ0LCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgTWNwQ29tbWFuZElkcyB9IGZyb20gJy4vbWNwQ29tbWFuZElkcy5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmVyU2FtcGxpbmdDb25maWd1cmF0aW9uLCBtY3BTZXJ2ZXJTYW1wbGluZ1NlY3Rpb24gfSBmcm9tICcuL21jcENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTWNwU2FtcGxpbmdMb2cgfSBmcm9tICcuL21jcFNhbXBsaW5nTG9nLmpzJztcbmltcG9ydCB7IElNY3BTYW1wbGluZ1NlcnZpY2UsIElNY3BTZXJ2ZXIsIElTYW1wbGluZ09wdGlvbnMsIElTYW1wbGluZ1Jlc3VsdCwgTWNwRXJyb3IgfSBmcm9tICcuL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IE1DUCB9IGZyb20gJy4vbW9kZWxDb250ZXh0UHJvdG9jb2wuanMnO1xuXG5jb25zdCBlbnVtIE1vZGVsTWF0Y2gge1xuXHRVbnN1cmVBbGxvd2VkRHVyaW5nQ2hhdCxcblx0VW5zdXJlQWxsb3dlZE91dHNpZGVDaGF0LFxuXHROb3RBbGxvd2VkLFxuXHROb01hdGNoaW5nTW9kZWwsXG59XG5cbmV4cG9ydCBjbGFzcyBNY3BTYW1wbGluZ1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1jcFNhbXBsaW5nU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TZXRzID0ge1xuXHRcdGFsbG93ZWREdXJpbmdDaGF0OiBuZXcgTWFwPHN0cmluZywgYm9vbGVhbj4oKSxcblx0XHRhbGxvd2VkT3V0c2lkZUNoYXQ6IG5ldyBNYXA8c3RyaW5nLCBib29sZWFuPigpLFxuXHR9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvZ3M6IE1jcFNhbXBsaW5nTG9nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlcigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9sb2dzID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFNhbXBsaW5nTG9nKSk7XG5cdH1cblxuXHRhc3luYyBzYW1wbGUob3B0czogSVNhbXBsaW5nT3B0aW9ucywgdG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTxJU2FtcGxpbmdSZXN1bHQ+IHtcblx0XHRjb25zdCBtZXNzYWdlcyA9IG9wdHMucGFyYW1zLm1lc3NhZ2VzLm1hcCgobWVzc2FnZSk6IElDaGF0TWVzc2FnZSB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50OiBJQ2hhdE1lc3NhZ2VQYXJ0W10gPSBhc0FycmF5KG1lc3NhZ2UuY29udGVudCkubWFwKChwYXJ0KTogSUNoYXRNZXNzYWdlUGFydCB8IHVuZGVmaW5lZCA9PiBwYXJ0LnR5cGUgPT09ICd0ZXh0J1xuXHRcdFx0XHQ/IHsgdHlwZTogJ3RleHQnLCB2YWx1ZTogcGFydC50ZXh0IH1cblx0XHRcdFx0OiBwYXJ0LnR5cGUgPT09ICdpbWFnZScgfHwgcGFydC50eXBlID09PSAnYXVkaW8nXG5cdFx0XHRcdFx0PyB7IHR5cGU6ICdpbWFnZV91cmwnLCB2YWx1ZTogeyBtaW1lVHlwZTogcGFydC5taW1lVHlwZSBhcyBDaGF0SW1hZ2VNaW1lVHlwZSwgZGF0YTogZGVjb2RlQmFzZTY0KHBhcnQuZGF0YSkgfSB9XG5cdFx0XHRcdFx0OiB1bmRlZmluZWRcblx0XHRcdCkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cblx0XHRcdGlmICghY29udGVudC5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJvbGU6IG1lc3NhZ2Uucm9sZSA9PT0gJ2Fzc2lzdGFudCcgPyBDaGF0TWVzc2FnZVJvbGUuQXNzaXN0YW50IDogQ2hhdE1lc3NhZ2VSb2xlLlVzZXIsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHR9O1xuXHRcdH0pLmZpbHRlcihpc0RlZmluZWQpO1xuXG5cdFx0aWYgKG9wdHMucGFyYW1zLnN5c3RlbVByb21wdCkge1xuXHRcdFx0bWVzc2FnZXMudW5zaGlmdCh7IHJvbGU6IENoYXRNZXNzYWdlUm9sZS5TeXN0ZW0sIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdmFsdWU6IG9wdHMucGFyYW1zLnN5c3RlbVByb21wdCB9XSB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMuX21vZGVsU2VxdWVuY2VyLnF1ZXVlKCgpID0+IHRoaXMuX2dldE1hdGNoaW5nTW9kZWwob3B0cykpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNlbmRDaGF0UmVxdWVzdChtb2RlbCwgdW5kZWZpbmVkLCBtZXNzYWdlcywge30sIHRva2VuKTtcblxuXHRcdGxldCByZXNwb25zZVRleHQgPSAnJztcblxuXHRcdC8vIE1DUCBkb2Vzbid0IGhhdmUgYSBub3Rpb24gb2YgYSBtdWx0aS1wYXJ0IHNhbXBsaW5nIHJlc3BvbnNlLCBzbyB3ZSBvbmx5IHByZXNlcnZlIHRleHRcblx0XHQvLyBSZWYgaHR0cHM6Ly9naXRodWIuY29tL21vZGVsY29udGV4dHByb3RvY29sL21vZGVsY29udGV4dHByb3RvY29sL2lzc3Vlcy85MVxuXHRcdGNvbnN0IHN0cmVhbWluZyA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IHBhcnQgb2YgcmVzcG9uc2Uuc3RyZWFtKSB7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHBhcnQpKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBwIG9mIHBhcnQpIHtcblx0XHRcdFx0XHRcdGlmIChwLnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRcdFx0XHRyZXNwb25zZVRleHQgKz0gcC52YWx1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAocGFydC50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0XHRyZXNwb25zZVRleHQgKz0gcGFydC52YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3Jlc3BvbnNlLnJlc3VsdCwgc3RyZWFtaW5nXSk7XG5cdFx0XHR0aGlzLl9sb2dzLmFkZChvcHRzLnNlcnZlciwgb3B0cy5wYXJhbXMubWVzc2FnZXMsIHJlc3BvbnNlVGV4dCwgbW9kZWwpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c2FtcGxlOiB7XG5cdFx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFx0Y29udGVudDogeyB0eXBlOiAndGV4dCcsIHRleHQ6IHJlc3BvbnNlVGV4dCB9LFxuXHRcdFx0XHRcdHJvbGU6ICdhc3Npc3RhbnQnLCAvLyBpdCBjYW1lIGZyb20gdGhlIG1vZGVsIVxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRocm93IE1jcEVycm9yLnVua25vd24oZXJyKTtcblx0XHR9XG5cdH1cblxuXHRoYXNMb2dzKHNlcnZlcjogSU1jcFNlcnZlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9sb2dzLmhhcyhzZXJ2ZXIpO1xuXHR9XG5cblx0Z2V0TG9nVGV4dChzZXJ2ZXI6IElNY3BTZXJ2ZXIpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9sb2dzLmdldEFzVGV4dChzZXJ2ZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0TWF0Y2hpbmdNb2RlbChvcHRzOiBJU2FtcGxpbmdPcHRpb25zKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMuX2dldE1hdGNoaW5nTW9kZWxJbm5lcihvcHRzLnNlcnZlciwgb3B0cy5pc0R1cmluZ1Rvb2xDYWxsLCBvcHRzLnBhcmFtcy5tb2RlbFByZWZlcmVuY2VzKTtcblx0XHRjb25zdCBnbG9iYWxBdXRvQXBwcm92ZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKTtcblxuXHRcdGlmIChtb2RlbCA9PT0gTW9kZWxNYXRjaC5VbnN1cmVBbGxvd2VkRHVyaW5nQ2hhdCkge1xuXHRcdFx0Ly8gSW4gWU9MTyBtb2RlLCBhdXRvLWFwcHJvdmUgTUNQIHNhbXBsaW5nIHJlcXVlc3RzIHdpdGhvdXQgcHJvbXB0aW5nXG5cdFx0XHRpZiAoZ2xvYmFsQXV0b0FwcHJvdmUpIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblNldHMuYWxsb3dlZER1cmluZ0NoYXQuc2V0KG9wdHMuc2VydmVyLmRlZmluaXRpb24uaWQsIHRydWUpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZ2V0TWF0Y2hpbmdNb2RlbChvcHRzKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJldHJ5ID0gYXdhaXQgdGhpcy5fc2hvd0NvbnRleHR1YWwoXG5cdFx0XHRcdG9wdHMuaXNEdXJpbmdUb29sQ2FsbCxcblx0XHRcdFx0bG9jYWxpemUoJ21jcC5zYW1wbGluZy5hbGxvd0R1cmluZ0NoYXQudGl0bGUnLCAnQWxsb3cgTUNQIHRvb2xzIGZyb20gXCJ7MH1cIiB0byBtYWtlIExMTSByZXF1ZXN0cz8nLCBvcHRzLnNlcnZlci5kZWZpbml0aW9uLmxhYmVsKSxcblx0XHRcdFx0bG9jYWxpemUoJ21jcC5zYW1wbGluZy5hbGxvd0R1cmluZ0NoYXQuZGVzYycsICdUaGUgTUNQIHNlcnZlciBcInswfVwiIGhhcyBpc3N1ZWQgYSByZXF1ZXN0IHRvIG1ha2UgYSBsYW5ndWFnZSBtb2RlbCBjYWxsLiBEbyB5b3Ugd2FudCB0byBhbGxvdyBpdCB0byBtYWtlIHJlcXVlc3RzIGR1cmluZyBjaGF0PycsIG9wdHMuc2VydmVyLmRlZmluaXRpb24ubGFiZWwpLFxuXHRcdFx0XHR0aGlzLmFsbG93QnV0dG9ucyhvcHRzLnNlcnZlciwgJ2FsbG93ZWREdXJpbmdDaGF0Jylcblx0XHRcdCk7XG5cdFx0XHRpZiAocmV0cnkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2dldE1hdGNoaW5nTW9kZWwob3B0cyk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBNY3BFcnJvci5ub3RBbGxvd2VkKCk7XG5cdFx0fSBlbHNlIGlmIChtb2RlbCA9PT0gTW9kZWxNYXRjaC5VbnN1cmVBbGxvd2VkT3V0c2lkZUNoYXQpIHtcblx0XHRcdC8vIEluIFlPTE8gbW9kZSwgYXV0by1hcHByb3ZlIE1DUCBzYW1wbGluZyByZXF1ZXN0cyB3aXRob3V0IHByb21wdGluZ1xuXHRcdFx0aWYgKGdsb2JhbEF1dG9BcHByb3ZlKSB7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25TZXRzLmFsbG93ZWRPdXRzaWRlQ2hhdC5zZXQob3B0cy5zZXJ2ZXIuZGVmaW5pdGlvbi5pZCwgdHJ1ZSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9nZXRNYXRjaGluZ01vZGVsKG9wdHMpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmV0cnkgPSBhd2FpdCB0aGlzLl9zaG93Q29udGV4dHVhbChcblx0XHRcdFx0b3B0cy5pc0R1cmluZ1Rvb2xDYWxsLFxuXHRcdFx0XHRsb2NhbGl6ZSgnbWNwLnNhbXBsaW5nLmFsbG93T3V0c2lkZUNoYXQudGl0bGUnLCAnQWxsb3cgTUNQIHNlcnZlciBcInswfVwiIHRvIG1ha2UgTExNIHJlcXVlc3RzPycsIG9wdHMuc2VydmVyLmRlZmluaXRpb24ubGFiZWwpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnbWNwLnNhbXBsaW5nLmFsbG93T3V0c2lkZUNoYXQuZGVzYycsICdUaGUgTUNQIHNlcnZlciBcInswfVwiIGhhcyBpc3N1ZWQgYSByZXF1ZXN0IHRvIG1ha2UgYSBsYW5ndWFnZSBtb2RlbCBjYWxsLiBEbyB5b3Ugd2FudCB0byBhbGxvdyBpdCB0byBtYWtlIHJlcXVlc3RzLCBvdXRzaWRlIG9mIHRvb2wgY2FsbHMgZHVyaW5nIGNoYXQ/Jywgb3B0cy5zZXJ2ZXIuZGVmaW5pdGlvbi5sYWJlbCksXG5cdFx0XHRcdHRoaXMuYWxsb3dCdXR0b25zKG9wdHMuc2VydmVyLCAnYWxsb3dlZE91dHNpZGVDaGF0Jylcblx0XHRcdCk7XG5cdFx0XHRpZiAocmV0cnkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2dldE1hdGNoaW5nTW9kZWwob3B0cyk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBNY3BFcnJvci5ub3RBbGxvd2VkKCk7XG5cdFx0fSBlbHNlIGlmIChtb2RlbCA9PT0gTW9kZWxNYXRjaC5Ob3RBbGxvd2VkKSB7XG5cdFx0XHR0aHJvdyBNY3BFcnJvci5ub3RBbGxvd2VkKCk7XG5cdFx0fSBlbHNlIGlmIChtb2RlbCA9PT0gTW9kZWxNYXRjaC5Ob01hdGNoaW5nTW9kZWwpIHtcblx0XHRcdGNvbnN0IG5ld2x5UGlja2VkTW9kZWxzID0gb3B0cy5pc0R1cmluZ1Rvb2xDYWxsXG5cdFx0XHRcdD8gYXdhaXQgdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8bnVtYmVyPihNY3BDb21tYW5kSWRzLkNvbmZpZ3VyZVNhbXBsaW5nTW9kZWxzLCBvcHRzLnNlcnZlcilcblx0XHRcdFx0OiBhd2FpdCB0aGlzLl9ub3RpZnkoXG5cdFx0XHRcdFx0bG9jYWxpemUoJ21jcC5zYW1wbGluZy5uZWVkc01vZGVscycsICdNQ1Agc2VydmVyIFwiezB9XCIgdHJpZ2dlcmVkIGEgbGFuZ3VhZ2UgbW9kZWwgcmVxdWVzdCwgYnV0IGl0IGhhcyBubyBhbGxvd2xpc3RlZCBtb2RlbHMuJywgb3B0cy5zZXJ2ZXIuZGVmaW5pdGlvbi5sYWJlbCksXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0W2xvY2FsaXplKCdjb25maWd1cmUnLCAnQ29uZmlndXJlJyldOiAoKSA9PiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxudW1iZXI+KE1jcENvbW1hbmRJZHMuQ29uZmlndXJlU2FtcGxpbmdNb2RlbHMsIG9wdHMuc2VydmVyKSxcblx0XHRcdFx0XHRcdFtsb2NhbGl6ZSgnY2FuY2VsJywgJ0NhbmNlbCcpXTogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpO1xuXHRcdFx0aWYgKG5ld2x5UGlja2VkTW9kZWxzKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9nZXRNYXRjaGluZ01vZGVsKG9wdHMpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgTWNwRXJyb3Iubm90QWxsb3dlZCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgYWxsb3dCdXR0b25zKHNlcnZlcjogSU1jcFNlcnZlciwga2V5OiAnYWxsb3dlZER1cmluZ0NoYXQnIHwgJ2FsbG93ZWRPdXRzaWRlQ2hhdCcpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0W2xvY2FsaXplKCdtY3Auc2FtcGxpbmcuYWxsb3cuaW5TZXNzaW9uJywgJ0FsbG93IGluIHRoaXMgU2Vzc2lvbicpXTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uU2V0c1trZXldLnNldChzZXJ2ZXIuZGVmaW5pdGlvbi5pZCwgdHJ1ZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdFtsb2NhbGl6ZSgnbWNwLnNhbXBsaW5nLmFsbG93LmFsd2F5cycsICdBbHdheXMnKV06IGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy51cGRhdGVDb25maWcoc2VydmVyLCBjID0+IGNba2V5XSA9IHRydWUpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0XHRbbG9jYWxpemUoJ21jcC5zYW1wbGluZy5hbGxvdy5ub3ROb3cnLCAnTm90IE5vdycpXTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uU2V0c1trZXldLnNldChzZXJ2ZXIuZGVmaW5pdGlvbi5pZCwgZmFsc2UpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9LFxuXHRcdFx0W2xvY2FsaXplKCdtY3Auc2FtcGxpbmcuYWxsb3cubmV2ZXInLCAnTmV2ZXInKV06IGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy51cGRhdGVDb25maWcoc2VydmVyLCBjID0+IGNba2V5XSA9IGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2hvd0NvbnRleHR1YWw8VD4oaXNEdXJpbmdUb29sQ2FsbDogYm9vbGVhbiwgdGl0bGU6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nLCBidXR0b25zOiBSZWNvcmQ8c3RyaW5nLCAoKSA9PiBUPik6IFByb21pc2U8QXdhaXRlZDxUPiB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChpc0R1cmluZ1Rvb2xDYWxsKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdHR5cGU6ICdxdWVzdGlvbicsXG5cdFx0XHRcdHRpdGxlOiB0aXRsZSxcblx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0YnV0dG9uczogT2JqZWN0LmVudHJpZXMoYnV0dG9ucykubWFwKChbbGFiZWwsIHJ1bl0pID0+ICh7IGxhYmVsLCBydW4gfSkpLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gYXdhaXQgcmVzdWx0LnJlc3VsdDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX25vdGlmeShtZXNzYWdlLCBidXR0b25zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ub3RpZnk8VD4obWVzc2FnZTogc3RyaW5nLCBidXR0b25zOiBSZWNvcmQ8c3RyaW5nLCAoKSA9PiBUPik6IFByb21pc2U8QXdhaXRlZDxUPiB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBhd2FpdCBuZXcgUHJvbWlzZTxUIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHRTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRPYmplY3QuZW50cmllcyhidXR0b25zKS5tYXAoKFtsYWJlbCwgYWN0aW9uXSkgPT4gKHtcblx0XHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0XHRydW46ICgpID0+IHJlc29sdmUoYWN0aW9uKCkpLFxuXHRcdFx0XHR9KSlcblx0XHRcdCk7XG5cdFx0XHRFdmVudC5vbmNlKGhhbmRsZS5vbkRpZENsb3NlKSgoKSA9PiByZXNvbHZlKHVuZGVmaW5lZCkpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIG1hdGNoaW5nIG1vZGVsIGZvciB0aGUgTUNQIHNlcnZlciBpbiB0aGlzIGNvbnRleHQsIG9yXG5cdCAqIGEgcmVhc29uIHdoeSBubyBtb2RlbCBjb3VsZCBiZSBzZWxlY3RlZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2dldE1hdGNoaW5nTW9kZWxJbm5lcihzZXJ2ZXI6IElNY3BTZXJ2ZXIsIGlzRHVyaW5nVG9vbENhbGw6IGJvb2xlYW4sIHByZWZlcmVuY2VzOiBNQ1AuTW9kZWxQcmVmZXJlbmNlcyB8IHVuZGVmaW5lZCk6IFByb21pc2U8TW9kZWxNYXRjaCB8IHN0cmluZz4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuZ2V0Q29uZmlnKHNlcnZlcik7XG5cdFx0Ly8gMS4gRW5zdXJlIHRoZSBzZXJ2ZXIgaXMgYWxsb3dlZCB0byBzYW1wbGUgaW4gdGhpcyBjb250ZXh0XG5cdFx0aWYgKGlzRHVyaW5nVG9vbENhbGwgJiYgIWNvbmZpZy5hbGxvd2VkRHVyaW5nQ2hhdCAmJiAhdGhpcy5fc2Vzc2lvblNldHMuYWxsb3dlZER1cmluZ0NoYXQuaGFzKHNlcnZlci5kZWZpbml0aW9uLmlkKSkge1xuXHRcdFx0cmV0dXJuIGNvbmZpZy5hbGxvd2VkRHVyaW5nQ2hhdCA9PT0gdW5kZWZpbmVkID8gTW9kZWxNYXRjaC5VbnN1cmVBbGxvd2VkRHVyaW5nQ2hhdCA6IE1vZGVsTWF0Y2guTm90QWxsb3dlZDtcblx0XHR9IGVsc2UgaWYgKCFpc0R1cmluZ1Rvb2xDYWxsICYmICFjb25maWcuYWxsb3dlZE91dHNpZGVDaGF0ICYmICF0aGlzLl9zZXNzaW9uU2V0cy5hbGxvd2VkT3V0c2lkZUNoYXQuaGFzKHNlcnZlci5kZWZpbml0aW9uLmlkKSkge1xuXHRcdFx0cmV0dXJuIGNvbmZpZy5hbGxvd2VkT3V0c2lkZUNoYXQgPT09IHVuZGVmaW5lZCA/IE1vZGVsTWF0Y2guVW5zdXJlQWxsb3dlZE91dHNpZGVDaGF0IDogTW9kZWxNYXRjaC5Ob3RBbGxvd2VkO1xuXHRcdH1cblxuXHRcdC8vIDIuIEdldCB0aGUgY29uZmlndXJlZCBtb2RlbHMsIG9yIHRoZSBkZWZhdWx0IGZyZWUgbW9kZWwocylcblx0XHRjb25zdCBmb3VuZE1vZGVsSWRzID0gY29uZmlnLmFsbG93ZWRNb2RlbHM/LmZpbHRlcihtID0+ICEhdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwobSkpIHx8IHRoaXMuX2dldERlZmF1bHRNb2RlbHMoKTtcblx0XHRpZiAoIWZvdW5kTW9kZWxJZHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gTW9kZWxNYXRjaC5Ob01hdGNoaW5nTW9kZWw7XG5cdFx0fVxuXG5cdFx0Ly8gMy4gSWYgcHJlZmVyZW5jZXMgYXJlIHByb3ZpZGVkLCB0cnkgdG8gbWF0Y2ggdGhlbSBmcm9tIHRoZSBhbGxvd2VkIG1vZGVsc1xuXHRcdGlmIChwcmVmZXJlbmNlcz8uaGludHMpIHtcblx0XHRcdGNvbnN0IGZvdW5kID0gbWFwRmluZEZpcnN0KHByZWZlcmVuY2VzLmhpbnRzLCBoaW50ID0+IGZvdW5kTW9kZWxJZHMuZmluZChtb2RlbCA9PiBtb2RlbC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGhpbnQubmFtZSEudG9Mb3dlckNhc2UoKSkpKTtcblx0XHRcdGlmIChmb3VuZCkge1xuXHRcdFx0XHRyZXR1cm4gZm91bmQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZvdW5kTW9kZWxJZHNbMF07IC8vIFJldHVybiB0aGUgZmlyc3QgbWF0Y2hpbmcgbW9kZWxcblx0fVxuXG5cdHByaXZhdGUgX2dldERlZmF1bHRNb2RlbHMoKSB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRMYW5ndWFnZU1vZGVsSWRzKCkubWFwKG0gPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChtKTtcblx0XHRcdHJldHVybiBtb2RlbCAmJiAhbW9kZWwubXVsdGlwbGllck51bWVyaWMgJiYgIW1vZGVsLnRhcmdldENoYXRTZXNzaW9uVHlwZSA/IHsgbW9kZWwsIGlkOiBtIH0gOiB1bmRlZmluZWQ7XG5cdFx0fSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cblx0XHRjb25zdCBzb21lRGVmYXVsdCA9IGNhbmRpZGF0ZXMuZmluZEluZGV4KGMgPT4gT2JqZWN0LnZhbHVlcyhjLm1vZGVsLmlzRGVmYXVsdEZvckxvY2F0aW9uKS5zb21lKEJvb2xlYW4pKTtcblx0XHRpZiAoc29tZURlZmF1bHQgIT09IC0xKSB7XG5cdFx0XHRbY2FuZGlkYXRlc1swXSwgY2FuZGlkYXRlc1tzb21lRGVmYXVsdF1dID0gW2NhbmRpZGF0ZXNbc29tZURlZmF1bHRdLCBjYW5kaWRhdGVzWzBdXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2FuZGlkYXRlcy5tYXAoYyA9PiBjLmlkKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbmZpZ0tleShzZXJ2ZXI6IElNY3BTZXJ2ZXIpIHtcblx0XHRyZXR1cm4gYCR7c2VydmVyLmNvbGxlY3Rpb24ubGFiZWx9OiAke3NlcnZlci5kZWZpbml0aW9uLmxhYmVsfWA7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29uZmlnKHNlcnZlcjogSU1jcFNlcnZlcik6IElNY3BTZXJ2ZXJTYW1wbGluZ0NvbmZpZ3VyYXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRDb25maWcoc2VydmVyKS52YWx1ZSB8fCB7fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBfZ2V0Q29uZmlnIHJlYWRzIHRoZSBzYW1wbGluZyBjb25maWcgcmVhZHMgdGhlIGB7IHNlcnZlcjogZGF0YSB9YCBtYXBwaW5nXG5cdCAqIGZyb20gdGhlIGFwcHJvcHJpYXRlIGNvbmZpZy4gV2UgcmVhZCBmcm9tIHRoZSBtb3N0IHNwZWNpZmljIHBvc3NpYmxlXG5cdCAqIGNvbmZpZyB1cCB0byB0aGUgZGVmYXVsdCBjb25maWd1cmF0aW9uIGxvY2F0aW9uIHRoYXQgdGhlIE1DUCBzZXJ2ZXIgaXRzZWxmXG5cdCAqIGlzIGRlZmluZWQgaW4uIFdlIGRvbid0IGdvIGZ1cnRoZXIgYmVjYXVzZSB0aGVuIHdvcmtzcGFjZS1zcGVjaWZpYyBzZXJ2ZXJzXG5cdCAqIHdvdWxkIGdldCBpbiB0aGUgdXNlciBzZXR0aW5ncyB3aGljaCBpcyBub3QgbWVhbmluZ2Z1bCBhbmQgY291bGQgbGVhZFxuXHQgKiB0byBjb25mdXNpb24uXG5cdCAqXG5cdCAqIHRvZG9AY29ubm9yNDMxMjogZ2VuZXJhbGl6ZSB0aGlzIGZvciBvdGhlciBlc3R0aW5ncyB3aGVuIHdlIGhhdmUgdGhlbVxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0Q29uZmlnKHNlcnZlcjogSU1jcFNlcnZlcikge1xuXHRcdGNvbnN0IGRlZiA9IHNlcnZlci5yZWFkRGVmaW5pdGlvbnMoKS5nZXQoKTtcblx0XHRjb25zdCBtb3N0U3BlY2lmaWNDb25maWcgPSBDb25maWd1cmF0aW9uVGFyZ2V0Lk1FTU9SWTtcblx0XHRjb25zdCBsZWFzdFNwZWNpZmljQ29uZmlnID0gZGVmLmNvbGxlY3Rpb24/LmNvbmZpZ1RhcmdldCB8fCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVI7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fY29uZmlnS2V5KHNlcnZlcik7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBkZWYuY29sbGVjdGlvbj8ucHJlc2VudGF0aW9uPy5vcmlnaW47XG5cblx0XHRjb25zdCBjb25maWdWYWx1ZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8UmVjb3JkPHN0cmluZywgSU1jcFNlcnZlclNhbXBsaW5nQ29uZmlndXJhdGlvbj4+KG1jcFNlcnZlclNhbXBsaW5nU2VjdGlvbiwgeyByZXNvdXJjZSB9KTtcblx0XHRmb3IgKGxldCB0YXJnZXQgPSBtb3N0U3BlY2lmaWNDb25maWc7IHRhcmdldCA+PSBsZWFzdFNwZWNpZmljQ29uZmlnOyB0YXJnZXQtLSkge1xuXHRcdFx0Y29uc3QgbWFwcGluZyA9IGdldENvbmZpZ1ZhbHVlSW5UYXJnZXQoY29uZmlnVmFsdWUsIHRhcmdldCk7XG5cdFx0XHRjb25zdCBjb25maWcgPSBtYXBwaW5nPy5ba2V5XTtcblx0XHRcdGlmIChjb25maWcpIHtcblx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6IGNvbmZpZywga2V5LCBtYXBwaW5nLCB0YXJnZXQsIHJlc291cmNlIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgdmFsdWU6IHVuZGVmaW5lZCwgbWFwcGluZzogZ2V0Q29uZmlnVmFsdWVJblRhcmdldChjb25maWdWYWx1ZSwgbGVhc3RTcGVjaWZpY0NvbmZpZyksIGtleSwgdGFyZ2V0OiBsZWFzdFNwZWNpZmljQ29uZmlnLCByZXNvdXJjZSB9O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHVwZGF0ZUNvbmZpZyhzZXJ2ZXI6IElNY3BTZXJ2ZXIsIG11dGF0ZTogKHI6IElNY3BTZXJ2ZXJTYW1wbGluZ0NvbmZpZ3VyYXRpb24pID0+IHVua25vd24pIHtcblx0XHRjb25zdCB7IHZhbHVlLCBtYXBwaW5nLCBrZXksIHRhcmdldCwgcmVzb3VyY2UgfSA9IHRoaXMuX2dldENvbmZpZyhzZXJ2ZXIpO1xuXG5cdFx0Y29uc3QgbmV3Q29uZmlnID0geyAuLi52YWx1ZSB9O1xuXHRcdG11dGF0ZShuZXdDb25maWcpO1xuXG5cdFx0YXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoXG5cdFx0XHRtY3BTZXJ2ZXJTYW1wbGluZ1NlY3Rpb24sXG5cdFx0XHR7IC4uLm1hcHBpbmcsIFtrZXldOiBuZXdDb25maWcgfSxcblx0XHRcdHsgcmVzb3VyY2UgfSxcblx0XHRcdHRhcmdldCxcblx0XHQpO1xuXHRcdHJldHVybiBuZXdDb25maWc7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxT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
