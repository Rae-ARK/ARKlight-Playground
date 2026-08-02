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
import { Codicon } from "../../../base/common/codicons.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { matchesBaseContiguousSubString, matchesWords, or } from "../../../base/common/filters.js";
import { createSingleCallFunction } from "../../../base/common/functional.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { LRUCache } from "../../../base/common/map.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { TfIdfCalculator, normalizeTfIdfScores } from "../../../base/common/tfIdf.js";
import { localize } from "../../../nls.js";
import { ICommandService } from "../../commands/common/commands.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IDialogService } from "../../dialogs/common/dialogs.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { ILogService } from "../../log/common/log.js";
import { PickerQuickAccessProvider, TriggerAction } from "./pickerQuickAccess.js";
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from "../../storage/common/storage.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { Categories } from "../../action/common/actionCommonCategories.js";
let AbstractCommandsQuickAccessProvider = class extends PickerQuickAccessProvider {
  constructor(options, instantiationService, keybindingService, commandService, telemetryService, dialogService) {
    super(AbstractCommandsQuickAccessProvider.PREFIX, options);
    this.keybindingService = keybindingService;
    this.commandService = commandService;
    this.telemetryService = telemetryService;
    this.dialogService = dialogService;
    this.commandsHistory = this._register(instantiationService.createInstance(CommandsHistory));
    this.options = options;
  }
  async _getPicks(filter, _disposables, token, runOptions) {
    const allCommandPicks = await this.getCommandPicks(token);
    if (token.isCancellationRequested) {
      return [];
    }
    const runTfidf = createSingleCallFunction(() => {
      const tfidf = new TfIdfCalculator();
      tfidf.updateDocuments(allCommandPicks.map((commandPick) => ({
        key: commandPick.commandId,
        textChunks: [this.getTfIdfChunk(commandPick)]
      })));
      const result = tfidf.calculateScores(filter, token);
      return normalizeTfIdfScores(result).filter((score) => score.score > AbstractCommandsQuickAccessProvider.TFIDF_THRESHOLD).slice(0, AbstractCommandsQuickAccessProvider.TFIDF_MAX_RESULTS);
    });
    const filteredCommandPicks = [];
    for (const commandPick of allCommandPicks) {
      const labelHighlights = AbstractCommandsQuickAccessProvider.WORD_FILTER(filter, commandPick.label) ?? void 0;
      let aliasHighlights;
      if (commandPick.commandAlias) {
        aliasHighlights = AbstractCommandsQuickAccessProvider.WORD_FILTER(filter, commandPick.commandAlias) ?? void 0;
      }
      if (labelHighlights || aliasHighlights) {
        commandPick.highlights = {
          label: labelHighlights,
          detail: this.options.showAlias ? aliasHighlights : void 0
        };
        filteredCommandPicks.push(commandPick);
      } else if (filter === commandPick.commandId) {
        filteredCommandPicks.push(commandPick);
      } else if (filter.length >= 3) {
        const tfidf = runTfidf();
        if (token.isCancellationRequested) {
          return [];
        }
        const tfidfScore = tfidf.find((score) => score.key === commandPick.commandId);
        if (tfidfScore) {
          commandPick.tfIdfScore = tfidfScore.score;
          filteredCommandPicks.push(commandPick);
        }
      }
    }
    const mapLabelToCommand = /* @__PURE__ */ new Map();
    for (const commandPick of filteredCommandPicks) {
      const existingCommandForLabel = mapLabelToCommand.get(commandPick.label);
      if (existingCommandForLabel) {
        commandPick.description = commandPick.commandId;
        existingCommandForLabel.description = existingCommandForLabel.commandId;
      } else {
        mapLabelToCommand.set(commandPick.label, commandPick);
      }
    }
    filteredCommandPicks.sort((commandPickA, commandPickB) => {
      if (commandPickA.tfIdfScore && commandPickB.tfIdfScore) {
        if (commandPickA.tfIdfScore === commandPickB.tfIdfScore) {
          return commandPickA.label.localeCompare(commandPickB.label);
        }
        return commandPickB.tfIdfScore - commandPickA.tfIdfScore;
      } else if (commandPickA.tfIdfScore) {
        return 1;
      } else if (commandPickB.tfIdfScore) {
        return -1;
      }
      const commandACounter = this.commandsHistory.peek(commandPickA.commandId);
      const commandBCounter = this.commandsHistory.peek(commandPickB.commandId);
      if (commandACounter && commandBCounter) {
        return commandACounter > commandBCounter ? -1 : 1;
      }
      if (commandACounter) {
        return -1;
      }
      if (commandBCounter) {
        return 1;
      }
      if (this.options.suggestedCommandIds) {
        const commandASuggestion = this.options.suggestedCommandIds.has(commandPickA.commandId);
        const commandBSuggestion = this.options.suggestedCommandIds.has(commandPickB.commandId);
        if (commandASuggestion && commandBSuggestion) {
          return 0;
        }
        if (commandASuggestion) {
          return -1;
        }
        if (commandBSuggestion) {
          return 1;
        }
      }
      const isDeveloperA = commandPickA.commandCategory === Categories.Developer.value;
      const isDeveloperB = commandPickB.commandCategory === Categories.Developer.value;
      if (isDeveloperA && !isDeveloperB) {
        return 1;
      }
      if (!isDeveloperA && isDeveloperB) {
        return -1;
      }
      return commandPickA.label.localeCompare(commandPickB.label);
    });
    const commandPicks = [];
    let addOtherSeparator = false;
    let addSuggestedSeparator = true;
    let addCommonlyUsedSeparator = !!this.options.suggestedCommandIds;
    for (let i = 0; i < filteredCommandPicks.length; i++) {
      const commandPick = filteredCommandPicks[i];
      const isInHistory = !!this.commandsHistory.peek(commandPick.commandId);
      if (i === 0 && isInHistory) {
        commandPicks.push({ type: "separator", label: localize("recentlyUsed", "recently used") });
        addOtherSeparator = true;
      }
      if (addSuggestedSeparator && commandPick.tfIdfScore !== void 0) {
        commandPicks.push({ type: "separator", label: localize("suggested", "similar commands") });
        addSuggestedSeparator = false;
      }
      if (addCommonlyUsedSeparator && commandPick.tfIdfScore === void 0 && !isInHistory && this.options.suggestedCommandIds?.has(commandPick.commandId)) {
        commandPicks.push({ type: "separator", label: localize("commonlyUsed", "commonly used") });
        addOtherSeparator = true;
        addCommonlyUsedSeparator = false;
      }
      if (addOtherSeparator && commandPick.tfIdfScore === void 0 && !isInHistory && !this.options.suggestedCommandIds?.has(commandPick.commandId)) {
        commandPicks.push({ type: "separator", label: localize("morecCommands", "other commands") });
        addOtherSeparator = false;
      }
      commandPicks.push(this.toCommandPick(commandPick, runOptions, isInHistory));
    }
    if (!this.hasAdditionalCommandPicks(filter, token)) {
      return commandPicks;
    }
    return {
      picks: commandPicks,
      additionalPicks: (async () => {
        const additionalCommandPicks = await this.getAdditionalCommandPicks(allCommandPicks, filteredCommandPicks, filter, token);
        if (token.isCancellationRequested) {
          return [];
        }
        const commandPicks2 = additionalCommandPicks.map((commandPick) => this.toCommandPick(commandPick, runOptions));
        if (addSuggestedSeparator && commandPicks2[0]?.type !== "separator") {
          commandPicks2.unshift({ type: "separator", label: localize("suggested", "similar commands") });
        }
        return commandPicks2;
      })()
    };
  }
  toCommandPick(commandPick, runOptions, isRecentlyUsed = false) {
    if (commandPick.type === "separator") {
      return commandPick;
    }
    const tooltip = commandPick.tooltip ?? commandPick.commandDescription?.value;
    const keybinding = this.keybindingService.lookupKeybinding(commandPick.commandId);
    const ariaLabel = keybinding ? localize("commandPickAriaLabelWithKeybinding", "{0}, {1}", commandPick.label, keybinding.getAriaLabel()) : commandPick.label;
    const existingButtons = commandPick.buttons || [];
    const buttons = isRecentlyUsed ? [
      ...existingButtons,
      {
        iconClass: ThemeIcon.asClassName(Codicon.close),
        tooltip: localize("removeFromRecentlyUsed", "Remove from Recently Used")
      }
    ] : commandPick.buttons;
    return {
      ...commandPick,
      tooltip,
      ariaLabel,
      detail: this.options.showAlias && commandPick.commandAlias !== commandPick.label ? commandPick.commandAlias : void 0,
      keybinding,
      buttons,
      accept: async () => {
        this.commandsHistory.push(commandPick.commandId);
        this.telemetryService.publicLog2("workbenchActionExecuted", {
          id: commandPick.commandId,
          from: runOptions?.from ?? "quick open"
        });
        try {
          commandPick.args?.length ? await this.commandService.executeCommand(commandPick.commandId, ...commandPick.args) : await this.commandService.executeCommand(commandPick.commandId);
        } catch (error) {
          if (!isCancellationError(error)) {
            this.dialogService.error(localize("canNotRun", "Command '{0}' resulted in an error", commandPick.label), toErrorMessage(error));
          }
        }
      },
      trigger: isRecentlyUsed ? (buttonIndex, keyMods) => {
        const removeButtonIndex = existingButtons.length;
        if (buttonIndex === removeButtonIndex) {
          this.commandsHistory.remove(commandPick.commandId);
          return TriggerAction.REMOVE_ITEM;
        }
        if (commandPick.trigger) {
          return commandPick.trigger(buttonIndex, keyMods);
        }
        return TriggerAction.NO_ACTION;
      } : commandPick.trigger
    };
  }
  // TF-IDF string to be indexed
  getTfIdfChunk({ label, commandAlias, commandDescription }) {
    let chunk = label;
    if (commandAlias && commandAlias !== label) {
      chunk += ` - ${commandAlias}`;
    }
    if (commandDescription && commandDescription.value !== label) {
      chunk += ` - ${commandDescription.value === commandDescription.original ? commandDescription.value : `${commandDescription.value} (${commandDescription.original})`}`;
    }
    return chunk;
  }
};
AbstractCommandsQuickAccessProvider.PREFIX = ">";
AbstractCommandsQuickAccessProvider.TFIDF_THRESHOLD = 0.5;
AbstractCommandsQuickAccessProvider.TFIDF_MAX_RESULTS = 5;
AbstractCommandsQuickAccessProvider.WORD_FILTER = or(matchesBaseContiguousSubString, matchesWords);
AbstractCommandsQuickAccessProvider = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IDialogService)
], AbstractCommandsQuickAccessProvider);
let CommandsHistory = class extends Disposable {
  constructor(storageService, configurationService, logService) {
    super();
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.logService = logService;
    this.configuredCommandsHistoryLength = 0;
    this.updateConfiguration();
    this.load();
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.updateConfiguration(e)));
    this._register(this.storageService.onWillSaveState((e) => {
      if (e.reason === WillSaveStateReason.SHUTDOWN) {
        this.saveState();
      }
    }));
  }
  updateConfiguration(e) {
    if (e && !e.affectsConfiguration("workbench.commandPalette.history")) {
      return;
    }
    this.configuredCommandsHistoryLength = CommandsHistory.getConfiguredCommandHistoryLength(this.configurationService);
    if (CommandsHistory.cache && CommandsHistory.cache.limit !== this.configuredCommandsHistoryLength) {
      CommandsHistory.cache.limit = this.configuredCommandsHistoryLength;
      CommandsHistory.hasChanges = true;
    }
  }
  load() {
    const raw = this.storageService.get(CommandsHistory.PREF_KEY_CACHE, StorageScope.PROFILE);
    let serializedCache;
    if (raw) {
      try {
        serializedCache = JSON.parse(raw);
      } catch (error) {
        this.logService.error(`[CommandsHistory] invalid data: ${error}`);
      }
    }
    const cache = CommandsHistory.cache = new LRUCache(this.configuredCommandsHistoryLength, 1);
    if (serializedCache) {
      let entries;
      if (serializedCache.usesLRU) {
        entries = serializedCache.entries;
      } else {
        entries = serializedCache.entries.sort((a, b) => a.value - b.value);
      }
      entries.forEach((entry) => cache.set(entry.key, entry.value));
    }
    CommandsHistory.counter = this.storageService.getNumber(CommandsHistory.PREF_KEY_COUNTER, StorageScope.PROFILE, CommandsHistory.counter);
  }
  push(commandId) {
    if (!CommandsHistory.cache) {
      return;
    }
    CommandsHistory.cache.set(commandId, CommandsHistory.counter++);
    CommandsHistory.hasChanges = true;
  }
  peek(commandId) {
    return CommandsHistory.cache?.peek(commandId);
  }
  remove(commandId) {
    if (!CommandsHistory.cache) {
      return;
    }
    CommandsHistory.cache.delete(commandId);
    CommandsHistory.hasChanges = true;
  }
  saveState() {
    if (!CommandsHistory.cache) {
      return;
    }
    if (!CommandsHistory.hasChanges) {
      return;
    }
    const serializedCache = { usesLRU: true, entries: [] };
    CommandsHistory.cache.forEach((value, key) => serializedCache.entries.push({ key, value }));
    this.storageService.store(CommandsHistory.PREF_KEY_CACHE, JSON.stringify(serializedCache), StorageScope.PROFILE, StorageTarget.USER);
    this.storageService.store(CommandsHistory.PREF_KEY_COUNTER, CommandsHistory.counter, StorageScope.PROFILE, StorageTarget.USER);
    CommandsHistory.hasChanges = false;
  }
  static getConfiguredCommandHistoryLength(configurationService) {
    const config = configurationService.getValue();
    const configuredCommandHistoryLength = config.workbench?.commandPalette?.history;
    if (typeof configuredCommandHistoryLength === "number") {
      return configuredCommandHistoryLength;
    }
    return CommandsHistory.DEFAULT_COMMANDS_HISTORY_LENGTH;
  }
  static clearHistory(configurationService, storageService) {
    const commandHistoryLength = CommandsHistory.getConfiguredCommandHistoryLength(configurationService);
    CommandsHistory.cache = new LRUCache(commandHistoryLength);
    CommandsHistory.counter = 1;
    CommandsHistory.hasChanges = true;
  }
};
CommandsHistory.DEFAULT_COMMANDS_HISTORY_LENGTH = 50;
CommandsHistory.PREF_KEY_CACHE = "commandPalette.mru.cache";
CommandsHistory.PREF_KEY_COUNTER = "commandPalette.mru.counter";
CommandsHistory.counter = 1;
CommandsHistory.hasChanges = false;
CommandsHistory = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ILogService)
], CommandsHistory);
export {
  AbstractCommandsQuickAccessProvider,
  CommandsHistory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci9jb21tYW5kc1F1aWNrQWNjZXNzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbiwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSU1hdGNoLCBtYXRjaGVzQmFzZUNvbnRpZ3VvdXNTdWJTdHJpbmcsIG1hdGNoZXNXb3Jkcywgb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Z1bmN0aW9uYWwuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBMUlVDYWNoZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVGZJZGZDYWxjdWxhdG9yLCBub3JtYWxpemVUZklkZlNjb3JlcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RmSWRmLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElMb2NhbGl6ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRmFzdEFuZFNsb3dQaWNrcywgSVBpY2tlclF1aWNrQWNjZXNzSXRlbSwgSVBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXJPcHRpb25zLCBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyLCBQaWNrcywgVHJpZ2dlckFjdGlvbiB9IGZyb20gJy4vcGlja2VyUXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgSVF1aWNrQWNjZXNzUHJvdmlkZXJSdW5PcHRpb25zIH0gZnJvbSAnLi4vY29tbW9uL3F1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IElLZXlNb2RzLCBJUXVpY2tQaWNrU2VwYXJhdG9yIH0gZnJvbSAnLi4vY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQsIFdpbGxTYXZlU3RhdGVSZWFzb24gfSBmcm9tICcuLi8uLi9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbW1hbmRRdWlja1BpY2sgZXh0ZW5kcyBJUGlja2VyUXVpY2tBY2Nlc3NJdGVtIHtcblx0cmVhZG9ubHkgY29tbWFuZElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbW1hbmRXaGVuPzogc3RyaW5nO1xuXHRyZWFkb25seSBjb21tYW5kQWxpYXM/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbW1hbmREZXNjcmlwdGlvbj86IElMb2NhbGl6ZWRTdHJpbmc7XG5cdHJlYWRvbmx5IGNvbW1hbmRDYXRlZ29yeT86IHN0cmluZztcblxuXHRyZWFkb25seSBhcmdzPzogdW5rbm93bltdO1xuXG5cdHRmSWRmU2NvcmU/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbW1hbmRzUXVpY2tBY2Nlc3NPcHRpb25zIGV4dGVuZHMgSVBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXJPcHRpb25zPElDb21tYW5kUXVpY2tQaWNrPiB7XG5cdHJlYWRvbmx5IHNob3dBbGlhczogYm9vbGVhbjtcblx0c3VnZ2VzdGVkQ29tbWFuZElkcz86IFNldDxzdHJpbmc+O1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RDb21tYW5kc1F1aWNrQWNjZXNzUHJvdmlkZXIgZXh0ZW5kcyBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyPElDb21tYW5kUXVpY2tQaWNrPiBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRzdGF0aWMgUFJFRklYID0gJz4nO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRGSURGX1RIUkVTSE9MRCA9IDAuNTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVEZJREZfTUFYX1JFU1VMVFMgPSA1O1xuXG5cdHByaXZhdGUgc3RhdGljIFdPUkRfRklMVEVSID0gb3IobWF0Y2hlc0Jhc2VDb250aWd1b3VzU3ViU3RyaW5nLCBtYXRjaGVzV29yZHMpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZHNIaXN0b3J5OiBDb21tYW5kc0hpc3Rvcnk7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlYWRvbmx5IG9wdGlvbnM6IElDb21tYW5kc1F1aWNrQWNjZXNzT3B0aW9ucztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJQ29tbWFuZHNRdWlja0FjY2Vzc09wdGlvbnMsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoQWJzdHJhY3RDb21tYW5kc1F1aWNrQWNjZXNzUHJvdmlkZXIuUFJFRklYLCBvcHRpb25zKTtcblxuXHRcdHRoaXMuY29tbWFuZHNIaXN0b3J5ID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tbWFuZHNIaXN0b3J5KSk7XG5cblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9nZXRQaWNrcyhmaWx0ZXI6IHN0cmluZywgX2Rpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgcnVuT3B0aW9ucz86IElRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucyk6IFByb21pc2U8UGlja3M8SUNvbW1hbmRRdWlja1BpY2s+IHwgRmFzdEFuZFNsb3dQaWNrczxJQ29tbWFuZFF1aWNrUGljaz4+IHtcblxuXHRcdC8vIEFzayBzdWJjbGFzcyBmb3IgYWxsIGNvbW1hbmQgcGlja3Ncblx0XHRjb25zdCBhbGxDb21tYW5kUGlja3MgPSBhd2FpdCB0aGlzLmdldENvbW1hbmRQaWNrcyh0b2tlbik7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBydW5UZmlkZiA9IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbigoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZmlkZiA9IG5ldyBUZklkZkNhbGN1bGF0b3IoKTtcblx0XHRcdHRmaWRmLnVwZGF0ZURvY3VtZW50cyhhbGxDb21tYW5kUGlja3MubWFwKGNvbW1hbmRQaWNrID0+ICh7XG5cdFx0XHRcdGtleTogY29tbWFuZFBpY2suY29tbWFuZElkLFxuXHRcdFx0XHR0ZXh0Q2h1bmtzOiBbdGhpcy5nZXRUZklkZkNodW5rKGNvbW1hbmRQaWNrKV1cblx0XHRcdH0pKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0ZmlkZi5jYWxjdWxhdGVTY29yZXMoZmlsdGVyLCB0b2tlbik7XG5cblx0XHRcdHJldHVybiBub3JtYWxpemVUZklkZlNjb3JlcyhyZXN1bHQpXG5cdFx0XHRcdC5maWx0ZXIoc2NvcmUgPT4gc2NvcmUuc2NvcmUgPiBBYnN0cmFjdENvbW1hbmRzUXVpY2tBY2Nlc3NQcm92aWRlci5URklERl9USFJFU0hPTEQpXG5cdFx0XHRcdC5zbGljZSgwLCBBYnN0cmFjdENvbW1hbmRzUXVpY2tBY2Nlc3NQcm92aWRlci5URklERl9NQVhfUkVTVUxUUyk7XG5cdFx0fSk7XG5cblx0XHQvLyBGaWx0ZXJcblx0XHRjb25zdCBmaWx0ZXJlZENvbW1hbmRQaWNrczogSUNvbW1hbmRRdWlja1BpY2tbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY29tbWFuZFBpY2sgb2YgYWxsQ29tbWFuZFBpY2tzKSB7XG5cdFx0XHRjb25zdCBsYWJlbEhpZ2hsaWdodHMgPSBBYnN0cmFjdENvbW1hbmRzUXVpY2tBY2Nlc3NQcm92aWRlci5XT1JEX0ZJTFRFUihmaWx0ZXIsIGNvbW1hbmRQaWNrLmxhYmVsKSA/PyB1bmRlZmluZWQ7XG5cblx0XHRcdGxldCBhbGlhc0hpZ2hsaWdodHM6IElNYXRjaFtdIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGNvbW1hbmRQaWNrLmNvbW1hbmRBbGlhcykge1xuXHRcdFx0XHRhbGlhc0hpZ2hsaWdodHMgPSBBYnN0cmFjdENvbW1hbmRzUXVpY2tBY2Nlc3NQcm92aWRlci5XT1JEX0ZJTFRFUihmaWx0ZXIsIGNvbW1hbmRQaWNrLmNvbW1hbmRBbGlhcykgPz8gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBZGQgaWYgbWF0Y2hpbmcgaW4gbGFiZWwgb3IgYWxpYXNcblx0XHRcdGlmIChsYWJlbEhpZ2hsaWdodHMgfHwgYWxpYXNIaWdobGlnaHRzKSB7XG5cdFx0XHRcdGNvbW1hbmRQaWNrLmhpZ2hsaWdodHMgPSB7XG5cdFx0XHRcdFx0bGFiZWw6IGxhYmVsSGlnaGxpZ2h0cyxcblx0XHRcdFx0XHRkZXRhaWw6IHRoaXMub3B0aW9ucy5zaG93QWxpYXMgPyBhbGlhc0hpZ2hsaWdodHMgOiB1bmRlZmluZWRcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRmaWx0ZXJlZENvbW1hbmRQaWNrcy5wdXNoKGNvbW1hbmRQaWNrKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQWxzbyBhZGQgaWYgd2UgaGF2ZSBhIDEwMCUgY29tbWFuZCBJRCBtYXRjaFxuXHRcdFx0ZWxzZSBpZiAoZmlsdGVyID09PSBjb21tYW5kUGljay5jb21tYW5kSWQpIHtcblx0XHRcdFx0ZmlsdGVyZWRDb21tYW5kUGlja3MucHVzaChjb21tYW5kUGljayk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEhhbmRsZSB0Zi1pZGYgc2NvcmluZyBmb3IgdGhlIHJlc3QgaWYgdGhlcmUncyBhIGZpbHRlclxuXHRcdFx0ZWxzZSBpZiAoZmlsdGVyLmxlbmd0aCA+PSAzKSB7XG5cdFx0XHRcdGNvbnN0IHRmaWRmID0gcnVuVGZpZGYoKTtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQWRkIGlmIHdlIGhhdmUgYSB0Zi1pZGYgc2NvcmVcblx0XHRcdFx0Y29uc3QgdGZpZGZTY29yZSA9IHRmaWRmLmZpbmQoc2NvcmUgPT4gc2NvcmUua2V5ID09PSBjb21tYW5kUGljay5jb21tYW5kSWQpO1xuXHRcdFx0XHRpZiAodGZpZGZTY29yZSkge1xuXHRcdFx0XHRcdGNvbW1hbmRQaWNrLnRmSWRmU2NvcmUgPSB0ZmlkZlNjb3JlLnNjb3JlO1xuXHRcdFx0XHRcdGZpbHRlcmVkQ29tbWFuZFBpY2tzLnB1c2goY29tbWFuZFBpY2spO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGRlc2NyaXB0aW9uIHRvIGNvbW1hbmRzIHRoYXQgaGF2ZSBkdXBsaWNhdGUgbGFiZWxzXG5cdFx0Y29uc3QgbWFwTGFiZWxUb0NvbW1hbmQgPSBuZXcgTWFwPHN0cmluZywgSUNvbW1hbmRRdWlja1BpY2s+KCk7XG5cdFx0Zm9yIChjb25zdCBjb21tYW5kUGljayBvZiBmaWx0ZXJlZENvbW1hbmRQaWNrcykge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdDb21tYW5kRm9yTGFiZWwgPSBtYXBMYWJlbFRvQ29tbWFuZC5nZXQoY29tbWFuZFBpY2subGFiZWwpO1xuXHRcdFx0aWYgKGV4aXN0aW5nQ29tbWFuZEZvckxhYmVsKSB7XG5cdFx0XHRcdGNvbW1hbmRQaWNrLmRlc2NyaXB0aW9uID0gY29tbWFuZFBpY2suY29tbWFuZElkO1xuXHRcdFx0XHRleGlzdGluZ0NvbW1hbmRGb3JMYWJlbC5kZXNjcmlwdGlvbiA9IGV4aXN0aW5nQ29tbWFuZEZvckxhYmVsLmNvbW1hbmRJZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1hcExhYmVsVG9Db21tYW5kLnNldChjb21tYW5kUGljay5sYWJlbCwgY29tbWFuZFBpY2spO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNvcnQgYnkgTVJVIG9yZGVyIGFuZCBmYWxsYmFjayB0byBuYW1lIG90aGVyd2lzZVxuXHRcdGZpbHRlcmVkQ29tbWFuZFBpY2tzLnNvcnQoKGNvbW1hbmRQaWNrQSwgY29tbWFuZFBpY2tCKSA9PiB7XG5cblx0XHRcdC8vIElmIGEgcmVzdWx0IGNhbWUgZnJvbSB0Zi1pZGYsIHdlIHdhbnQgdG8gcHV0IHRoYXQgdG93YXJkcyB0aGUgYm90dG9tXG5cdFx0XHRpZiAoY29tbWFuZFBpY2tBLnRmSWRmU2NvcmUgJiYgY29tbWFuZFBpY2tCLnRmSWRmU2NvcmUpIHtcblx0XHRcdFx0aWYgKGNvbW1hbmRQaWNrQS50ZklkZlNjb3JlID09PSBjb21tYW5kUGlja0IudGZJZGZTY29yZSkge1xuXHRcdFx0XHRcdHJldHVybiBjb21tYW5kUGlja0EubGFiZWwubG9jYWxlQ29tcGFyZShjb21tYW5kUGlja0IubGFiZWwpOyAvLyBwcmVmZXIgbGV4aWNvZ3JhcGhpY2FsbHkgc21hbGxlciBjb21tYW5kXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gY29tbWFuZFBpY2tCLnRmSWRmU2NvcmUgLSBjb21tYW5kUGlja0EudGZJZGZTY29yZTsgLy8gcHJlZmVyIGhpZ2hlciB0Zi1pZGYgc2NvcmVcblx0XHRcdH0gZWxzZSBpZiAoY29tbWFuZFBpY2tBLnRmSWRmU2NvcmUpIHtcblx0XHRcdFx0cmV0dXJuIDE7IC8vIGZpcnN0IGNvbW1hbmQgaGFzIGEgc2NvcmUgYnV0IG90aGVyIGRvZXNuJ3Qgc28gb3RoZXIgd2luc1xuXHRcdFx0fSBlbHNlIGlmIChjb21tYW5kUGlja0IudGZJZGZTY29yZSkge1xuXHRcdFx0XHRyZXR1cm4gLTE7IC8vIG90aGVyIGNvbW1hbmQgaGFzIGEgc2NvcmUgYnV0IGZpcnN0IGRvZXNuJ3Qgc28gZmlyc3Qgd2luc1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb21tYW5kQUNvdW50ZXIgPSB0aGlzLmNvbW1hbmRzSGlzdG9yeS5wZWVrKGNvbW1hbmRQaWNrQS5jb21tYW5kSWQpO1xuXHRcdFx0Y29uc3QgY29tbWFuZEJDb3VudGVyID0gdGhpcy5jb21tYW5kc0hpc3RvcnkucGVlayhjb21tYW5kUGlja0IuY29tbWFuZElkKTtcblxuXHRcdFx0aWYgKGNvbW1hbmRBQ291bnRlciAmJiBjb21tYW5kQkNvdW50ZXIpIHtcblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRBQ291bnRlciA+IGNvbW1hbmRCQ291bnRlciA/IC0xIDogMTsgLy8gdXNlIG1vcmUgcmVjZW50bHkgdXNlZCBjb21tYW5kIGJlZm9yZSBvbGRlclxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29tbWFuZEFDb3VudGVyKSB7XG5cdFx0XHRcdHJldHVybiAtMTsgLy8gZmlyc3QgY29tbWFuZCB3YXMgdXNlZCwgc28gaXQgd2lucyBvdmVyIHRoZSBub24gdXNlZCBvbmVcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbW1hbmRCQ291bnRlcikge1xuXHRcdFx0XHRyZXR1cm4gMTsgLy8gb3RoZXIgY29tbWFuZCB3YXMgdXNlZCBzbyBpdCB3aW5zIG92ZXIgdGhlIGNvbW1hbmRcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5zdWdnZXN0ZWRDb21tYW5kSWRzKSB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRBU3VnZ2VzdGlvbiA9IHRoaXMub3B0aW9ucy5zdWdnZXN0ZWRDb21tYW5kSWRzLmhhcyhjb21tYW5kUGlja0EuY29tbWFuZElkKTtcblx0XHRcdFx0Y29uc3QgY29tbWFuZEJTdWdnZXN0aW9uID0gdGhpcy5vcHRpb25zLnN1Z2dlc3RlZENvbW1hbmRJZHMuaGFzKGNvbW1hbmRQaWNrQi5jb21tYW5kSWQpO1xuXHRcdFx0XHRpZiAoY29tbWFuZEFTdWdnZXN0aW9uICYmIGNvbW1hbmRCU3VnZ2VzdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiAwOyAvLyBob25vciB0aGUgb3JkZXIgb2YgdGhlIGFycmF5XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY29tbWFuZEFTdWdnZXN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIC0xOyAvLyBmaXJzdCBjb21tYW5kIHdhcyBzdWdnZXN0ZWQsIHNvIGl0IHdpbnMgb3ZlciB0aGUgbm9uIHN1Z2dlc3RlZCBvbmVcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjb21tYW5kQlN1Z2dlc3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gMTsgLy8gb3RoZXIgY29tbWFuZCB3YXMgc3VnZ2VzdGVkIHNvIGl0IHdpbnMgb3ZlciB0aGUgY29tbWFuZFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIGlmIG9uZSBpcyBEZXZlbG9wZXIgYW5kIHRoZSBvdGhlciBpc24ndCwgcHV0IG5vbi1EZXZlbG9wZXIgZmlyc3Rcblx0XHRcdGNvbnN0IGlzRGV2ZWxvcGVyQSA9IGNvbW1hbmRQaWNrQS5jb21tYW5kQ2F0ZWdvcnkgPT09IENhdGVnb3JpZXMuRGV2ZWxvcGVyLnZhbHVlO1xuXHRcdFx0Y29uc3QgaXNEZXZlbG9wZXJCID0gY29tbWFuZFBpY2tCLmNvbW1hbmRDYXRlZ29yeSA9PT0gQ2F0ZWdvcmllcy5EZXZlbG9wZXIudmFsdWU7XG5cdFx0XHRpZiAoaXNEZXZlbG9wZXJBICYmICFpc0RldmVsb3BlckIpIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzRGV2ZWxvcGVyQSAmJiBpc0RldmVsb3BlckIpIHtcblx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBib3RoIGNvbW1hbmRzIHdlcmUgbmV2ZXIgdXNlZCwgc28gd2Ugc29ydCBieSBuYW1lXG5cdFx0XHRyZXR1cm4gY29tbWFuZFBpY2tBLmxhYmVsLmxvY2FsZUNvbXBhcmUoY29tbWFuZFBpY2tCLmxhYmVsKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbW1hbmRQaWNrczogQXJyYXk8SUNvbW1hbmRRdWlja1BpY2sgfCBJUXVpY2tQaWNrU2VwYXJhdG9yPiA9IFtdO1xuXG5cdFx0bGV0IGFkZE90aGVyU2VwYXJhdG9yID0gZmFsc2U7XG5cdFx0bGV0IGFkZFN1Z2dlc3RlZFNlcGFyYXRvciA9IHRydWU7XG5cdFx0bGV0IGFkZENvbW1vbmx5VXNlZFNlcGFyYXRvciA9ICEhdGhpcy5vcHRpb25zLnN1Z2dlc3RlZENvbW1hbmRJZHM7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBmaWx0ZXJlZENvbW1hbmRQaWNrcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY29tbWFuZFBpY2sgPSBmaWx0ZXJlZENvbW1hbmRQaWNrc1tpXTtcblx0XHRcdGNvbnN0IGlzSW5IaXN0b3J5ID0gISF0aGlzLmNvbW1hbmRzSGlzdG9yeS5wZWVrKGNvbW1hbmRQaWNrLmNvbW1hbmRJZCk7XG5cblx0XHRcdC8vIFNlcGFyYXRvcjogcmVjZW50bHkgdXNlZFxuXHRcdFx0aWYgKGkgPT09IDAgJiYgaXNJbkhpc3RvcnkpIHtcblx0XHRcdFx0Y29tbWFuZFBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdyZWNlbnRseVVzZWQnLCBcInJlY2VudGx5IHVzZWRcIikgfSk7XG5cdFx0XHRcdGFkZE90aGVyU2VwYXJhdG9yID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFkZFN1Z2dlc3RlZFNlcGFyYXRvciAmJiBjb21tYW5kUGljay50ZklkZlNjb3JlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29tbWFuZFBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdzdWdnZXN0ZWQnLCBcInNpbWlsYXIgY29tbWFuZHNcIikgfSk7XG5cdFx0XHRcdGFkZFN1Z2dlc3RlZFNlcGFyYXRvciA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTZXBhcmF0b3I6IGNvbW1vbmx5IHVzZWRcblx0XHRcdGlmIChhZGRDb21tb25seVVzZWRTZXBhcmF0b3IgJiYgY29tbWFuZFBpY2sudGZJZGZTY29yZSA9PT0gdW5kZWZpbmVkICYmICFpc0luSGlzdG9yeSAmJiB0aGlzLm9wdGlvbnMuc3VnZ2VzdGVkQ29tbWFuZElkcz8uaGFzKGNvbW1hbmRQaWNrLmNvbW1hbmRJZCkpIHtcblx0XHRcdFx0Y29tbWFuZFBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdjb21tb25seVVzZWQnLCBcImNvbW1vbmx5IHVzZWRcIikgfSk7XG5cdFx0XHRcdGFkZE90aGVyU2VwYXJhdG9yID0gdHJ1ZTtcblx0XHRcdFx0YWRkQ29tbW9ubHlVc2VkU2VwYXJhdG9yID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNlcGFyYXRvcjogb3RoZXIgY29tbWFuZHNcblx0XHRcdGlmIChhZGRPdGhlclNlcGFyYXRvciAmJiBjb21tYW5kUGljay50ZklkZlNjb3JlID09PSB1bmRlZmluZWQgJiYgIWlzSW5IaXN0b3J5ICYmICF0aGlzLm9wdGlvbnMuc3VnZ2VzdGVkQ29tbWFuZElkcz8uaGFzKGNvbW1hbmRQaWNrLmNvbW1hbmRJZCkpIHtcblx0XHRcdFx0Y29tbWFuZFBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdtb3JlY0NvbW1hbmRzJywgXCJvdGhlciBjb21tYW5kc1wiKSB9KTtcblx0XHRcdFx0YWRkT3RoZXJTZXBhcmF0b3IgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29tbWFuZFxuXHRcdFx0Y29tbWFuZFBpY2tzLnB1c2godGhpcy50b0NvbW1hbmRQaWNrKGNvbW1hbmRQaWNrLCBydW5PcHRpb25zLCBpc0luSGlzdG9yeSkpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5oYXNBZGRpdGlvbmFsQ29tbWFuZFBpY2tzKGZpbHRlciwgdG9rZW4pKSB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZFBpY2tzO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRwaWNrczogY29tbWFuZFBpY2tzLFxuXHRcdFx0YWRkaXRpb25hbFBpY2tzOiAoYXN5bmMgKCk6IFByb21pc2U8UGlja3M8SUNvbW1hbmRRdWlja1BpY2s+PiA9PiB7XG5cdFx0XHRcdGNvbnN0IGFkZGl0aW9uYWxDb21tYW5kUGlja3MgPSBhd2FpdCB0aGlzLmdldEFkZGl0aW9uYWxDb21tYW5kUGlja3MoYWxsQ29tbWFuZFBpY2tzLCBmaWx0ZXJlZENvbW1hbmRQaWNrcywgZmlsdGVyLCB0b2tlbik7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRQaWNrczogQXJyYXk8SUNvbW1hbmRRdWlja1BpY2sgfCBJUXVpY2tQaWNrU2VwYXJhdG9yPiA9IGFkZGl0aW9uYWxDb21tYW5kUGlja3MubWFwKGNvbW1hbmRQaWNrID0+IHRoaXMudG9Db21tYW5kUGljayhjb21tYW5kUGljaywgcnVuT3B0aW9ucykpO1xuXHRcdFx0XHQvLyBCYXNpY2FsbHksIGlmIHdlIGhhdmVuJ3QgYWxyZWFkeSBhZGRlZCBhIHNlcGFyYXRvciwgd2UgYWRkIG9uZSBiZWZvcmUgdGhlIGFkZGl0aW9uYWwgcGlja3Mgc28gbG9uZ1xuXHRcdFx0XHQvLyBhcyBvbmUgaGFzbid0IGJlZW4gYWRkZWQgdG8gdGhlIHN0YXJ0IG9mIHRoZSBhcnJheS5cblx0XHRcdFx0aWYgKGFkZFN1Z2dlc3RlZFNlcGFyYXRvciAmJiBjb21tYW5kUGlja3NbMF0/LnR5cGUgIT09ICdzZXBhcmF0b3InKSB7XG5cdFx0XHRcdFx0Y29tbWFuZFBpY2tzLnVuc2hpZnQoeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdzdWdnZXN0ZWQnLCBcInNpbWlsYXIgY29tbWFuZHNcIikgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRQaWNrcztcblx0XHRcdH0pKClcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSB0b0NvbW1hbmRQaWNrKGNvbW1hbmRQaWNrOiBJQ29tbWFuZFF1aWNrUGljayB8IElRdWlja1BpY2tTZXBhcmF0b3IsIHJ1bk9wdGlvbnM/OiBJUXVpY2tBY2Nlc3NQcm92aWRlclJ1bk9wdGlvbnMsIGlzUmVjZW50bHlVc2VkOiBib29sZWFuID0gZmFsc2UpOiBJQ29tbWFuZFF1aWNrUGljayB8IElRdWlja1BpY2tTZXBhcmF0b3Ige1xuXHRcdGlmIChjb21tYW5kUGljay50eXBlID09PSAnc2VwYXJhdG9yJykge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRQaWNrO1xuXHRcdH1cblx0XHRjb25zdCB0b29sdGlwID0gY29tbWFuZFBpY2sudG9vbHRpcFxuXHRcdFx0Pz8gY29tbWFuZFBpY2suY29tbWFuZERlc2NyaXB0aW9uPy52YWx1ZTtcblxuXHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoY29tbWFuZFBpY2suY29tbWFuZElkKTtcblx0XHRjb25zdCBhcmlhTGFiZWwgPSBrZXliaW5kaW5nID9cblx0XHRcdGxvY2FsaXplKCdjb21tYW5kUGlja0FyaWFMYWJlbFdpdGhLZXliaW5kaW5nJywgXCJ7MH0sIHsxfVwiLCBjb21tYW5kUGljay5sYWJlbCwga2V5YmluZGluZy5nZXRBcmlhTGFiZWwoKSkgOlxuXHRcdFx0Y29tbWFuZFBpY2subGFiZWw7XG5cblx0XHQvLyBBZGQgcmVtb3ZlIGJ1dHRvbiBmb3IgcmVjZW50bHkgdXNlZCBpdGVtcyAoYXMgdGhlIGxhc3QgYnV0dG9uLCB0byB0aGUgcmlnaHQpXG5cdFx0Y29uc3QgZXhpc3RpbmdCdXR0b25zID0gY29tbWFuZFBpY2suYnV0dG9ucyB8fCBbXTtcblx0XHRjb25zdCBidXR0b25zID0gaXNSZWNlbnRseVVzZWQgPyBbXG5cdFx0XHQuLi5leGlzdGluZ0J1dHRvbnMsXG5cdFx0XHR7XG5cdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2UpLFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgncmVtb3ZlRnJvbVJlY2VudGx5VXNlZCcsIFwiUmVtb3ZlIGZyb20gUmVjZW50bHkgVXNlZFwiKVxuXHRcdFx0fVxuXHRcdF0gOiBjb21tYW5kUGljay5idXR0b25zO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNvbW1hbmRQaWNrLFxuXHRcdFx0dG9vbHRpcCxcblx0XHRcdGFyaWFMYWJlbCxcblx0XHRcdGRldGFpbDogdGhpcy5vcHRpb25zLnNob3dBbGlhcyAmJiBjb21tYW5kUGljay5jb21tYW5kQWxpYXMgIT09IGNvbW1hbmRQaWNrLmxhYmVsID8gY29tbWFuZFBpY2suY29tbWFuZEFsaWFzIDogdW5kZWZpbmVkLFxuXHRcdFx0a2V5YmluZGluZyxcblx0XHRcdGJ1dHRvbnMsXG5cdFx0XHRhY2NlcHQ6IGFzeW5jICgpID0+IHtcblxuXHRcdFx0XHQvLyBBZGQgdG8gaGlzdG9yeVxuXHRcdFx0XHR0aGlzLmNvbW1hbmRzSGlzdG9yeS5wdXNoKGNvbW1hbmRQaWNrLmNvbW1hbmRJZCk7XG5cblx0XHRcdFx0Ly8gVGVsZW1lbnRyeVxuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7XG5cdFx0XHRcdFx0aWQ6IGNvbW1hbmRQaWNrLmNvbW1hbmRJZCxcblx0XHRcdFx0XHRmcm9tOiBydW5PcHRpb25zPy5mcm9tID8/ICdxdWljayBvcGVuJ1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBSdW5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb21tYW5kUGljay5hcmdzPy5sZW5ndGhcblx0XHRcdFx0XHRcdD8gYXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kUGljay5jb21tYW5kSWQsIC4uLmNvbW1hbmRQaWNrLmFyZ3MpXG5cdFx0XHRcdFx0XHQ6IGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZFBpY2suY29tbWFuZElkKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmRpYWxvZ1NlcnZpY2UuZXJyb3IobG9jYWxpemUoJ2Nhbk5vdFJ1bicsIFwiQ29tbWFuZCAnezB9JyByZXN1bHRlZCBpbiBhbiBlcnJvclwiLCBjb21tYW5kUGljay5sYWJlbCksIHRvRXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0dHJpZ2dlcjogaXNSZWNlbnRseVVzZWQgPyAoYnV0dG9uSW5kZXg6IG51bWJlciwga2V5TW9kczogSUtleU1vZHMpOiBUcmlnZ2VyQWN0aW9uIHwgUHJvbWlzZTxUcmlnZ2VyQWN0aW9uPiA9PiB7XG5cdFx0XHRcdC8vIFRoZSByZW1vdmUgYnV0dG9uIGlzIG5vdyB0aGUgbGFzdCBidXR0b25cblx0XHRcdFx0Y29uc3QgcmVtb3ZlQnV0dG9uSW5kZXggPSBleGlzdGluZ0J1dHRvbnMubGVuZ3RoO1xuXHRcdFx0XHRpZiAoYnV0dG9uSW5kZXggPT09IHJlbW92ZUJ1dHRvbkluZGV4KSB7XG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kc0hpc3RvcnkucmVtb3ZlKGNvbW1hbmRQaWNrLmNvbW1hbmRJZCk7XG5cdFx0XHRcdFx0cmV0dXJuIFRyaWdnZXJBY3Rpb24uUkVNT1ZFX0lURU07XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gSGFuZGxlIG90aGVyIGJ1dHRvbnMgKGUuZy4sIGNvbmZpZ3VyZSBrZXliaW5kaW5nIGJ1dHRvbilcblx0XHRcdFx0aWYgKGNvbW1hbmRQaWNrLnRyaWdnZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gY29tbWFuZFBpY2sudHJpZ2dlcihidXR0b25JbmRleCwga2V5TW9kcyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFRyaWdnZXJBY3Rpb24uTk9fQUNUSU9OO1xuXHRcdFx0fSA6IGNvbW1hbmRQaWNrLnRyaWdnZXJcblx0XHR9O1xuXHR9XG5cblx0Ly8gVEYtSURGIHN0cmluZyB0byBiZSBpbmRleGVkXG5cdHByaXZhdGUgZ2V0VGZJZGZDaHVuayh7IGxhYmVsLCBjb21tYW5kQWxpYXMsIGNvbW1hbmREZXNjcmlwdGlvbiB9OiBJQ29tbWFuZFF1aWNrUGljaykge1xuXHRcdGxldCBjaHVuayA9IGxhYmVsO1xuXHRcdGlmIChjb21tYW5kQWxpYXMgJiYgY29tbWFuZEFsaWFzICE9PSBsYWJlbCkge1xuXHRcdFx0Y2h1bmsgKz0gYCAtICR7Y29tbWFuZEFsaWFzfWA7XG5cdFx0fVxuXHRcdGlmIChjb21tYW5kRGVzY3JpcHRpb24gJiYgY29tbWFuZERlc2NyaXB0aW9uLnZhbHVlICE9PSBsYWJlbCkge1xuXHRcdFx0Ly8gSWYgdGhlIG9yaWdpbmFsIGlzIHRoZSBzYW1lIGFzIHRoZSB2YWx1ZSwgZG9uJ3QgYWRkIGl0XG5cdFx0XHRjaHVuayArPSBgIC0gJHtjb21tYW5kRGVzY3JpcHRpb24udmFsdWUgPT09IGNvbW1hbmREZXNjcmlwdGlvbi5vcmlnaW5hbCA/IGNvbW1hbmREZXNjcmlwdGlvbi52YWx1ZSA6IGAke2NvbW1hbmREZXNjcmlwdGlvbi52YWx1ZX0gKCR7Y29tbWFuZERlc2NyaXB0aW9uLm9yaWdpbmFsfSlgfWA7XG5cdFx0fVxuXHRcdHJldHVybiBjaHVuaztcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRDb21tYW5kUGlja3ModG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxBcnJheTxJQ29tbWFuZFF1aWNrUGljaz4+O1xuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBoYXNBZGRpdGlvbmFsQ29tbWFuZFBpY2tzKGZpbHRlcjogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBib29sZWFuO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0QWRkaXRpb25hbENvbW1hbmRQaWNrcyhhbGxQaWNrczogSUNvbW1hbmRRdWlja1BpY2tbXSwgcGlja3NTb0ZhcjogSUNvbW1hbmRRdWlja1BpY2tbXSwgZmlsdGVyOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8QXJyYXk8SUNvbW1hbmRRdWlja1BpY2sgfCBJUXVpY2tQaWNrU2VwYXJhdG9yPj47XG59XG5cbmludGVyZmFjZSBJU2VyaWFsaXplZENvbW1hbmRIaXN0b3J5IHtcblx0cmVhZG9ubHkgdXNlc0xSVT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGVudHJpZXM6IHsga2V5OiBzdHJpbmc7IHZhbHVlOiBudW1iZXIgfVtdO1xufVxuXG5pbnRlcmZhY2UgSUNvbW1hbmRzUXVpY2tBY2Nlc3NDb25maWd1cmF0aW9uIHtcblx0cmVhZG9ubHkgd29ya2JlbmNoOiB7XG5cdFx0cmVhZG9ubHkgY29tbWFuZFBhbGV0dGU6IHtcblx0XHRcdHJlYWRvbmx5IGhpc3Rvcnk6IG51bWJlcjtcblx0XHRcdHJlYWRvbmx5IHByZXNlcnZlSW5wdXQ6IGJvb2xlYW47XG5cdFx0fTtcblx0fTtcbn1cblxuZXhwb3J0IGNsYXNzIENvbW1hbmRzSGlzdG9yeSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyByZWFkb25seSBERUZBVUxUX0NPTU1BTkRTX0hJU1RPUllfTEVOR1RIID0gNTA7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUFJFRl9LRVlfQ0FDSEUgPSAnY29tbWFuZFBhbGV0dGUubXJ1LmNhY2hlJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUFJFRl9LRVlfQ09VTlRFUiA9ICdjb21tYW5kUGFsZXR0ZS5tcnUuY291bnRlcic7XG5cblx0cHJpdmF0ZSBzdGF0aWMgY2FjaGU6IExSVUNhY2hlPHN0cmluZywgbnVtYmVyPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdGF0aWMgY291bnRlciA9IDE7XG5cdHByaXZhdGUgc3RhdGljIGhhc0NoYW5nZXMgPSBmYWxzZTtcblxuXHRwcml2YXRlIGNvbmZpZ3VyZWRDb21tYW5kc0hpc3RvcnlMZW5ndGggPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnVwZGF0ZUNvbmZpZ3VyYXRpb24oKTtcblx0XHR0aGlzLmxvYWQoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB0aGlzLnVwZGF0ZUNvbmZpZ3VyYXRpb24oZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZShlID0+IHtcblx0XHRcdGlmIChlLnJlYXNvbiA9PT0gV2lsbFNhdmVTdGF0ZVJlYXNvbi5TSFVURE9XTikge1xuXHRcdFx0XHQvLyBDb21tYW5kcyBoaXN0b3J5IGlzIHZlcnkgZHluYW1pYyBhbmQgc28gd2UgbGltaXQgaW1wYWN0XG5cdFx0XHRcdC8vIG9uIHN0b3JhZ2UgdG8gb25seSBzYXZlIG9uIHNodXRkb3duLiBUaGlzIGhlbHBzIHJlZHVjZVxuXHRcdFx0XHQvLyB0aGUgb3ZlcmhlYWQgb2Ygc3luY2luZyB0aGlzIGRhdGEgYWNyb3NzIG1hY2hpbmVzLlxuXHRcdFx0XHR0aGlzLnNhdmVTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29uZmlndXJhdGlvbihlPzogSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlICYmICFlLmFmZmVjdHNDb25maWd1cmF0aW9uKCd3b3JrYmVuY2guY29tbWFuZFBhbGV0dGUuaGlzdG9yeScpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jb25maWd1cmVkQ29tbWFuZHNIaXN0b3J5TGVuZ3RoID0gQ29tbWFuZHNIaXN0b3J5LmdldENvbmZpZ3VyZWRDb21tYW5kSGlzdG9yeUxlbmd0aCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGlmIChDb21tYW5kc0hpc3RvcnkuY2FjaGUgJiYgQ29tbWFuZHNIaXN0b3J5LmNhY2hlLmxpbWl0ICE9PSB0aGlzLmNvbmZpZ3VyZWRDb21tYW5kc0hpc3RvcnlMZW5ndGgpIHtcblx0XHRcdENvbW1hbmRzSGlzdG9yeS5jYWNoZS5saW1pdCA9IHRoaXMuY29uZmlndXJlZENvbW1hbmRzSGlzdG9yeUxlbmd0aDtcblx0XHRcdENvbW1hbmRzSGlzdG9yeS5oYXNDaGFuZ2VzID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxvYWQoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoQ29tbWFuZHNIaXN0b3J5LlBSRUZfS0VZX0NBQ0hFLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0bGV0IHNlcmlhbGl6ZWRDYWNoZTogSVNlcmlhbGl6ZWRDb21tYW5kSGlzdG9yeSB8IHVuZGVmaW5lZDtcblx0XHRpZiAocmF3KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzZXJpYWxpemVkQ2FjaGUgPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtDb21tYW5kc0hpc3RvcnldIGludmFsaWQgZGF0YTogJHtlcnJvcn1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjYWNoZSA9IENvbW1hbmRzSGlzdG9yeS5jYWNoZSA9IG5ldyBMUlVDYWNoZTxzdHJpbmcsIG51bWJlcj4odGhpcy5jb25maWd1cmVkQ29tbWFuZHNIaXN0b3J5TGVuZ3RoLCAxKTtcblx0XHRpZiAoc2VyaWFsaXplZENhY2hlKSB7XG5cdFx0XHRsZXQgZW50cmllczogeyBrZXk6IHN0cmluZzsgdmFsdWU6IG51bWJlciB9W107XG5cdFx0XHRpZiAoc2VyaWFsaXplZENhY2hlLnVzZXNMUlUpIHtcblx0XHRcdFx0ZW50cmllcyA9IHNlcmlhbGl6ZWRDYWNoZS5lbnRyaWVzO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZW50cmllcyA9IHNlcmlhbGl6ZWRDYWNoZS5lbnRyaWVzLnNvcnQoKGEsIGIpID0+IGEudmFsdWUgLSBiLnZhbHVlKTtcblx0XHRcdH1cblx0XHRcdGVudHJpZXMuZm9yRWFjaChlbnRyeSA9PiBjYWNoZS5zZXQoZW50cnkua2V5LCBlbnRyeS52YWx1ZSkpO1xuXHRcdH1cblxuXHRcdENvbW1hbmRzSGlzdG9yeS5jb3VudGVyID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXROdW1iZXIoQ29tbWFuZHNIaXN0b3J5LlBSRUZfS0VZX0NPVU5URVIsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBDb21tYW5kc0hpc3RvcnkuY291bnRlcik7XG5cdH1cblxuXHRwdXNoKGNvbW1hbmRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCFDb21tYW5kc0hpc3RvcnkuY2FjaGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRDb21tYW5kc0hpc3RvcnkuY2FjaGUuc2V0KGNvbW1hbmRJZCwgQ29tbWFuZHNIaXN0b3J5LmNvdW50ZXIrKyk7IC8vIHNldCBjb3VudGVyIHRvIGNvbW1hbmRcblx0XHRDb21tYW5kc0hpc3RvcnkuaGFzQ2hhbmdlcyA9IHRydWU7XG5cdH1cblxuXHRwZWVrKGNvbW1hbmRJZDogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gQ29tbWFuZHNIaXN0b3J5LmNhY2hlPy5wZWVrKGNvbW1hbmRJZCk7XG5cdH1cblxuXHRyZW1vdmUoY29tbWFuZElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIUNvbW1hbmRzSGlzdG9yeS5jYWNoZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdENvbW1hbmRzSGlzdG9yeS5jYWNoZS5kZWxldGUoY29tbWFuZElkKTtcblx0XHRDb21tYW5kc0hpc3RvcnkuaGFzQ2hhbmdlcyA9IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIUNvbW1hbmRzSGlzdG9yeS5jYWNoZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghQ29tbWFuZHNIaXN0b3J5Lmhhc0NoYW5nZXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZXJpYWxpemVkQ2FjaGU6IElTZXJpYWxpemVkQ29tbWFuZEhpc3RvcnkgPSB7IHVzZXNMUlU6IHRydWUsIGVudHJpZXM6IFtdIH07XG5cdFx0Q29tbWFuZHNIaXN0b3J5LmNhY2hlLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHNlcmlhbGl6ZWRDYWNoZS5lbnRyaWVzLnB1c2goeyBrZXksIHZhbHVlIH0pKTtcblxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ29tbWFuZHNIaXN0b3J5LlBSRUZfS0VZX0NBQ0hFLCBKU09OLnN0cmluZ2lmeShzZXJpYWxpemVkQ2FjaGUpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENvbW1hbmRzSGlzdG9yeS5QUkVGX0tFWV9DT1VOVEVSLCBDb21tYW5kc0hpc3RvcnkuY291bnRlciwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0Q29tbWFuZHNIaXN0b3J5Lmhhc0NoYW5nZXMgPSBmYWxzZTtcblx0fVxuXG5cdHN0YXRpYyBnZXRDb25maWd1cmVkQ29tbWFuZEhpc3RvcnlMZW5ndGgoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IG51bWJlciB7XG5cdFx0Y29uc3QgY29uZmlnID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUNvbW1hbmRzUXVpY2tBY2Nlc3NDb25maWd1cmF0aW9uPigpO1xuXG5cdFx0Y29uc3QgY29uZmlndXJlZENvbW1hbmRIaXN0b3J5TGVuZ3RoID0gY29uZmlnLndvcmtiZW5jaD8uY29tbWFuZFBhbGV0dGU/Lmhpc3Rvcnk7XG5cdFx0aWYgKHR5cGVvZiBjb25maWd1cmVkQ29tbWFuZEhpc3RvcnlMZW5ndGggPT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlndXJlZENvbW1hbmRIaXN0b3J5TGVuZ3RoO1xuXHRcdH1cblxuXHRcdHJldHVybiBDb21tYW5kc0hpc3RvcnkuREVGQVVMVF9DT01NQU5EU19ISVNUT1JZX0xFTkdUSDtcblx0fVxuXG5cdHN0YXRpYyBjbGVhckhpc3RvcnkoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbW1hbmRIaXN0b3J5TGVuZ3RoID0gQ29tbWFuZHNIaXN0b3J5LmdldENvbmZpZ3VyZWRDb21tYW5kSGlzdG9yeUxlbmd0aChjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Q29tbWFuZHNIaXN0b3J5LmNhY2hlID0gbmV3IExSVUNhY2hlPHN0cmluZywgbnVtYmVyPihjb21tYW5kSGlzdG9yeUxlbmd0aCk7XG5cdFx0Q29tbWFuZHNIaXN0b3J5LmNvdW50ZXIgPSAxO1xuXG5cdFx0Q29tbWFuZHNIaXN0b3J5Lmhhc0NoYW5nZXMgPSB0cnVlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU9BLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFT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
