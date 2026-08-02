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
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ChatContextKeys } from "../common/actions/chatContextKeys.js";
import { getSelectedModelIdentifier } from "../common/chatSelectedModel.js";
import { ChatAgentLocation, ChatConfiguration } from "../common/constants.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { localize } from "../../../../nls.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IChatService } from "../common/chatService/chatService.js";
import { CreateSlashCommandsUsageTracker } from "./createSlashCommandsUsageTracker.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { ChatRequestAgentSubcommandPart, ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart } from "../common/requestParser/chatParserTypes.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { TipEligibilityTracker } from "./chatTipEligibilityTracker.js";
import { ChatTipExperiment, ChatTipTier, extractCommandIds, TIP_CATALOG } from "./chatTipCatalog.js";
import { ChatTipStorageKeys, TipTrackingCommands } from "./chatTipStorageKeys.js";
import { IWorkbenchAssignmentService } from "../../../services/assignment/common/assignmentService.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
const ATTACH_FILES_REFERENCE_TRACKING_COMMAND = TipTrackingCommands.AttachFilesReferenceUsed;
const CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND = TipTrackingCommands.CreateAgentInstructionsUsed;
const CREATE_PROMPT_TRACKING_COMMAND = TipTrackingCommands.CreatePromptUsed;
const CREATE_AGENT_TRACKING_COMMAND = TipTrackingCommands.CreateAgentUsed;
const CREATE_SKILL_TRACKING_COMMAND = TipTrackingCommands.CreateSkillUsed;
const FORK_CONVERSATION_TRACKING_COMMAND = TipTrackingCommands.ForkConversationUsed;
const IChatTipService = createDecorator("chatTipService");
import { TipEligibilityTracker as TipEligibilityTracker2 } from "./chatTipEligibilityTracker.js";
let ChatTipService = class extends Disposable {
  constructor(_productService, _configurationService, _storageService, _chatService, instantiationService, _logService, _chatEntitlementService, _commandService, _telemetryService, _keybindingService, _assignmentService) {
    super();
    this._productService = _productService;
    this._configurationService = _configurationService;
    this._storageService = _storageService;
    this._chatService = _chatService;
    this._logService = _logService;
    this._chatEntitlementService = _chatEntitlementService;
    this._commandService = _commandService;
    this._telemetryService = _telemetryService;
    this._keybindingService = _keybindingService;
    this._assignmentService = _assignmentService;
    this._onDidDismissTip = this._register(new Emitter());
    this.onDidDismissTip = this._onDidDismissTip.event;
    this._onDidNavigateTip = this._register(new Emitter());
    this.onDidNavigateTip = this._onDidNavigateTip.event;
    this._onDidHideTip = this._register(new Emitter());
    this.onDidHideTip = this._onDidHideTip.event;
    this._onDidDisableTips = this._register(new Emitter());
    this.onDidDisableTips = this._onDidDisableTips.event;
    this._tipsHiddenForSession = false;
    this._tipCommandListener = this._register(new MutableDisposable());
    this._experimentalTipMessages = /* @__PURE__ */ new Map();
    this._tracker = this._register(instantiationService.createInstance(TipEligibilityTracker, TIP_CATALOG));
    this._createSlashCommandsUsageTracker = this._register(new CreateSlashCommandsUsageTracker(this._chatService, this._storageService, () => this._contextKeyService));
    this._fetchExperimentalTipMessages();
    this._register(this._assignmentService.onDidRefetchAssignments(() => this._fetchExperimentalTipMessages()));
    this._register(this._chatEntitlementService.onDidChangeQuotaExceeded(() => {
      if (this._chatEntitlementService.quotas.chat?.percentRemaining === 0 && this._shownTip) {
        this.hideTip();
      }
    }));
    this._register(this._chatService.onDidSubmitRequest((e) => {
      const message = e.message ?? this._chatService.getSession(e.chatSessionResource)?.lastRequest?.message;
      if (!message) {
        return;
      }
      if (this._hasFileOrFolderReference(message)) {
        this._tracker.recordCommandExecuted(TipTrackingCommands.AttachFilesReferenceUsed);
      }
      const slashCommandTrackingId = this._getSlashCommandTrackingId(message);
      if (slashCommandTrackingId) {
        this._tracker.recordCommandExecuted(slashCommandTrackingId);
      }
      this._hideShownTipIfNowIneligible();
    }));
    this._thinkingPhrasesEverModified = this._storageService.getBoolean(ChatTipStorageKeys.ThinkingPhrasesEverModified, StorageScope.APPLICATION, false);
    if (!this._thinkingPhrasesEverModified && this._isSettingModified(ChatConfiguration.ThinkingPhrases)) {
      this._thinkingPhrasesEverModified = true;
      this._storageService.store(ChatTipStorageKeys.ThinkingPhrasesEverModified, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    if (!this._thinkingPhrasesEverModified) {
      this._register(this._configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(ChatConfiguration.ThinkingPhrases)) {
          this._thinkingPhrasesEverModified = true;
          this._storageService.store(ChatTipStorageKeys.ThinkingPhrasesEverModified, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
        }
      }));
    }
  }
  _hasFileOrFolderReference(message) {
    return message.parts.some((part) => {
      if (part.kind !== ChatRequestDynamicVariablePart.Kind) {
        return false;
      }
      const dynamicPart = part;
      return dynamicPart.isFile === true || dynamicPart.isDirectory === true;
    });
  }
  _getSlashCommandTrackingId(message) {
    for (const part of message.parts) {
      if (part.kind === ChatRequestSlashCommandPart.Kind) {
        const slashCommand = part.slashCommand.command;
        return this._toSlashCommandTrackingId(slashCommand);
      }
      if (part.kind === ChatRequestAgentSubcommandPart.Kind) {
        const subCommand = part.command.name;
        return this._toSlashCommandTrackingId(subCommand);
      }
    }
    const trimmed = message.text.trimStart();
    const match = /^(?:@\S+\s+)?\/(init|create-(?:instructions|prompt|agent|skill)|fork)(?:\s|$)/.exec(trimmed);
    return match ? this._toSlashCommandTrackingId(match[1]) : void 0;
  }
  _toSlashCommandTrackingId(command) {
    switch (command) {
      case "init":
      case "create-instructions":
        return CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND;
      case "create-prompt":
        return CREATE_PROMPT_TRACKING_COMMAND;
      case "create-agent":
        return CREATE_AGENT_TRACKING_COMMAND;
      case "create-skill":
        return CREATE_SKILL_TRACKING_COMMAND;
      case "fork":
        return FORK_CONVERSATION_TRACKING_COMMAND;
      default:
        return void 0;
    }
  }
  recordSlashCommandUsage(command) {
    const trackingId = this._toSlashCommandTrackingId(command);
    if (!trackingId) {
      return;
    }
    this._tracker.recordCommandExecuted(trackingId);
    this._hideShownTipIfNowIneligible();
  }
  resetSession() {
    this._shownTip = void 0;
    this._tipRequestId = void 0;
    this._contextKeyService = void 0;
    this._tipsHiddenForSession = false;
  }
  dismissTip() {
    if (this._shownTip) {
      this._logTipTelemetry(this._shownTip.id, "dismissed");
      const dismissed = new Set(this._getDismissedTipIds());
      dismissed.add(this._shownTip.id);
      this._storageService.store(ChatTipStorageKeys.DismissedTips, JSON.stringify([...dismissed]), StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    this._tipRequestId = void 0;
    this._onDidDismissTip.fire();
  }
  dismissTipForSession() {
    this.dismissTip();
    this.hideTipsForSession();
  }
  clearDismissedTips() {
    this._storageService.remove(ChatTipStorageKeys.DismissedTips, StorageScope.APPLICATION);
    this._storageService.remove(ChatTipStorageKeys.DismissedTips, StorageScope.PROFILE);
    this._shownTip = void 0;
    this._tipRequestId = void 0;
    this._contextKeyService = void 0;
    this._tipsHiddenForSession = false;
    this._onDidDismissTip.fire();
  }
  _getDismissedTipIds() {
    const raw = this._readApplicationWithProfileFallback(ChatTipStorageKeys.DismissedTips);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      this._logService.debug("#ChatTips dismissed:", parsed);
      if (!Array.isArray(parsed)) {
        return [];
      }
      const knownTipIds = new Set(TIP_CATALOG.map((tip) => tip.id));
      const dismissed = /* @__PURE__ */ new Set();
      for (const value of parsed) {
        if (typeof value === "string" && knownTipIds.has(value)) {
          dismissed.add(value);
        }
      }
      return [...dismissed];
    } catch {
      return [];
    }
  }
  hideTip() {
    if (this._shownTip) {
      this._logTipTelemetry(this._shownTip.id, "hidden");
    }
    this._shownTip = void 0;
    this._tipRequestId = void 0;
    this._onDidHideTip.fire();
  }
  hideTipsForSession() {
    if (this._tipsHiddenForSession) {
      return;
    }
    this._tipsHiddenForSession = true;
    this._shownTip = void 0;
    this._tipRequestId = void 0;
    this._onDidHideTip.fire();
  }
  async disableTips() {
    if (this._shownTip) {
      this._logTipTelemetry(this._shownTip.id, "disabled");
    }
    this._shownTip = void 0;
    this._tipRequestId = void 0;
    await this._configurationService.updateValue("chat.tips.enabled", false, ConfigurationTarget.APPLICATION);
    this._onDidDisableTips.fire();
  }
  getWelcomeTip(contextKeyService) {
    this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
    this._tracker.recordCurrentMode(contextKeyService);
    this._tracker.refreshPromptFileExclusions();
    if (!this._configurationService.getValue("chat.tips.enabled")) {
      return void 0;
    }
    if (this._tipsHiddenForSession) {
      return void 0;
    }
    this._contextKeyService = contextKeyService;
    if (!this._isCopilotEnabled()) {
      return void 0;
    }
    if (this._chatEntitlementService.entitlement === ChatEntitlement.Unknown && !this._chatEntitlementService.hasByokModels) {
      return void 0;
    }
    if (!this._isChatLocation(contextKeyService)) {
      return void 0;
    }
    if (!this._hasSingleForegroundChatSurface(contextKeyService)) {
      return void 0;
    }
    if (this._isChatQuotaExceeded(contextKeyService)) {
      return void 0;
    }
    if (this._tipRequestId === "welcome" && this._shownTip) {
      if (this._shownTip.id !== "tip.switchToAuto") {
        const switchToAutoTip = TIP_CATALOG.find((tip2) => tip2.id === "tip.switchToAuto");
        if (switchToAutoTip) {
          const dismissedIds = new Set(this._getDismissedTipIds());
          if (!dismissedIds.has(switchToAutoTip.id) && this._isEligible(switchToAutoTip, contextKeyService)) {
            this._shownTip = switchToAutoTip;
            this._storageService.store(ChatTipStorageKeys.LastTipId, switchToAutoTip.id, StorageScope.APPLICATION, StorageTarget.USER);
            const tip2 = this._createTip(switchToAutoTip);
            this._logTipTelemetry(switchToAutoTip.id, "shown");
            this._trackTipCommandClicks(switchToAutoTip);
            this._onDidNavigateTip.fire(tip2);
            return tip2;
          }
        }
      }
      if (!this._isEligible(this._shownTip, contextKeyService)) {
        if (this._tracker.isExcluded(this._shownTip)) {
          this.hideTip();
          return void 0;
        }
        const nextTip = this._findNextEligibleTip(this._shownTip.id, contextKeyService);
        if (nextTip) {
          this._shownTip = nextTip;
          this._storageService.store(ChatTipStorageKeys.LastTipId, nextTip.id, StorageScope.APPLICATION, StorageTarget.USER);
          const tip2 = this._createTip(nextTip);
          this._onDidNavigateTip.fire(tip2);
          return tip2;
        }
        this.hideTip();
        return void 0;
      }
      return this._createTip(this._shownTip);
    }
    const tip = this._pickTip("welcome", contextKeyService);
    return tip;
  }
  _hasSingleForegroundChatSurface(contextKeyService) {
    const foregroundSessionCount = contextKeyService.getContextKeyValue(ChatContextKeys.foregroundSessionCount.key);
    return foregroundSessionCount === 1 || foregroundSessionCount === 0 && contextKeyService.getContextKeyValue(IsSessionsWindowContext.key) === true;
  }
  _findNextEligibleTip(currentTipId, contextKeyService) {
    this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
    const currentIndex = TIP_CATALOG.findIndex((tip) => tip.id === currentTipId);
    if (currentIndex === -1) {
      return void 0;
    }
    const dismissedIds = new Set(this._getDismissedTipIds());
    for (let i = 1; i < TIP_CATALOG.length; i++) {
      const idx = (currentIndex + i) % TIP_CATALOG.length;
      const candidate = TIP_CATALOG[idx];
      if (!dismissedIds.has(candidate.id) && this._isEligible(candidate, contextKeyService)) {
        return candidate;
      }
    }
    return void 0;
  }
  _hideShownTipIfNowIneligible() {
    if (!this._shownTip || !this._contextKeyService) {
      return;
    }
    if (this._tipsHiddenForSession) {
      return;
    }
    let eligible;
    try {
      eligible = this._isEligible(this._shownTip, this._contextKeyService);
    } catch (err) {
      this._contextKeyService = void 0;
      return;
    }
    if (eligible) {
      return;
    }
    this.hideTip();
  }
  _pickTip(sourceId, contextKeyService) {
    this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
    this._tracker.recordCurrentMode(contextKeyService);
    const dismissedIds = new Set(this._getDismissedTipIds());
    const eligibleTips = TIP_CATALOG.filter((tip) => !dismissedIds.has(tip.id) && this._isEligible(tip, contextKeyService));
    const selectedTip = this._selectTipByTier(eligibleTips);
    if (!selectedTip) {
      return void 0;
    }
    this._storageService.store(ChatTipStorageKeys.LastTipId, selectedTip.id, StorageScope.APPLICATION, StorageTarget.USER);
    this._tipRequestId = sourceId;
    this._shownTip = selectedTip;
    this._logTipTelemetry(selectedTip.id, "shown");
    this._trackTipCommandClicks(selectedTip);
    return this._createTip(selectedTip);
  }
  _selectTipByTier(eligibleTips) {
    const foundationalTips = eligibleTips.filter((tip) => tip.tier === ChatTipTier.Foundational);
    if (foundationalTips.length) {
      return this._sortByPriorityAndCatalogOrder(foundationalTips)[0];
    }
    const qolTips = eligibleTips.filter((tip) => tip.tier === ChatTipTier.Qol);
    if (!qolTips.length) {
      return void 0;
    }
    const randomIndex = Math.floor(Math.random() * qolTips.length);
    return qolTips[randomIndex];
  }
  navigateToNextTip() {
    if (!this._contextKeyService) {
      return void 0;
    }
    return this._navigateTip(1, this._contextKeyService);
  }
  navigateToPreviousTip() {
    if (!this._contextKeyService) {
      return void 0;
    }
    return this._navigateTip(-1, this._contextKeyService);
  }
  getNextEligibleTip() {
    if (!this._contextKeyService || !this._shownTip) {
      return void 0;
    }
    const contextKeyService = this._contextKeyService;
    this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
    const currentTipId = this._shownTip.id;
    const orderedTips = this._getOrderedEligibleTips(contextKeyService, { includeTipId: currentTipId });
    if (!orderedTips.length) {
      return void 0;
    }
    const currentIndex = orderedTips.findIndex((tip) => tip.id === currentTipId);
    const candidate = this._getNextTipFromOrderedList(orderedTips, currentIndex, currentTipId);
    if (candidate) {
      this._shownTip = candidate;
      this._tipRequestId = "welcome";
      this._storageService.store(ChatTipStorageKeys.LastTipId, candidate.id, StorageScope.APPLICATION, StorageTarget.USER);
      this._logTipTelemetry(candidate.id, "shown");
      this._trackTipCommandClicks(candidate);
      return this._createTip(candidate);
    }
    return void 0;
  }
  _getNextTipFromOrderedList(orderedTips, startIndex, currentTipId) {
    if (!orderedTips.length) {
      return void 0;
    }
    const fallbackIndex = 0;
    const normalizedStartIndex = startIndex === -1 ? fallbackIndex : startIndex;
    for (let i = 1; i <= orderedTips.length; i++) {
      const index = (normalizedStartIndex + i) % orderedTips.length;
      const candidate = orderedTips[index];
      if (candidate.id !== currentTipId) {
        return candidate;
      }
    }
    return void 0;
  }
  hasMultipleTips() {
    if (!this._contextKeyService) {
      return false;
    }
    this._createSlashCommandsUsageTracker.syncContextKey(this._contextKeyService);
    return this._hasNavigableTip(this._contextKeyService);
  }
  _navigateTip(direction, contextKeyService) {
    this._createSlashCommandsUsageTracker.syncContextKey(contextKeyService);
    if (!this._shownTip) {
      return void 0;
    }
    const orderedTips = this._getOrderedEligibleTips(contextKeyService);
    if (!orderedTips.length) {
      return void 0;
    }
    const currentIndex = orderedTips.findIndex((tip) => tip.id === this._shownTip.id);
    if (orderedTips.length === 1 && currentIndex !== -1) {
      return void 0;
    }
    const fallbackIndex = direction === 1 ? 0 : orderedTips.length - 1;
    const nextIndex = currentIndex === -1 ? fallbackIndex : (currentIndex + direction + orderedTips.length) % orderedTips.length;
    const candidate = orderedTips[nextIndex];
    if (candidate) {
      this._logTipTelemetry(this._shownTip.id, direction === 1 ? "navigateNext" : "navigatePrevious");
      this._shownTip = candidate;
      this._tipRequestId = "welcome";
      this._storageService.store(ChatTipStorageKeys.LastTipId, candidate.id, StorageScope.APPLICATION, StorageTarget.USER);
      this._logTipTelemetry(candidate.id, "shown");
      this._trackTipCommandClicks(candidate);
      const tip = this._createTip(candidate);
      this._onDidNavigateTip.fire(tip);
      return tip;
    }
    return void 0;
  }
  _hasNavigableTip(contextKeyService) {
    const orderedTips = this._getOrderedEligibleTips(contextKeyService);
    if (!orderedTips.length) {
      return false;
    }
    if (!this._shownTip) {
      return orderedTips.length > 1;
    }
    if (orderedTips.length > 1) {
      return true;
    }
    return orderedTips[0].id !== this._shownTip.id;
  }
  _getOrderedEligibleTips(contextKeyService, options) {
    const dismissedIds = new Set(this._getDismissedTipIds());
    const eligibleTips = TIP_CATALOG.filter((tip) => {
      if (options?.includeTipId && tip.id === options.includeTipId) {
        return true;
      }
      if (options?.excludeShownTip && this._shownTip && tip.id === this._shownTip.id) {
        return false;
      }
      return !dismissedIds.has(tip.id) && this._isEligible(tip, contextKeyService);
    });
    const foundationalTips = this._sortByPriorityAndCatalogOrder(eligibleTips.filter((tip) => tip.tier === ChatTipTier.Foundational));
    const qolTips = this._sortByPriorityAndCatalogOrder(eligibleTips.filter((tip) => tip.tier === ChatTipTier.Qol));
    return [...foundationalTips, ...qolTips];
  }
  _sortByPriorityAndCatalogOrder(tips) {
    return [...tips].sort((a, b) => {
      const aPriority = a.priority ?? Number.POSITIVE_INFINITY;
      const bPriority = b.priority ?? Number.POSITIVE_INFINITY;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      const aCatalogIndex = TIP_CATALOG.findIndex((tip) => tip.id === a.id);
      const bCatalogIndex = TIP_CATALOG.findIndex((tip) => tip.id === b.id);
      return aCatalogIndex - bCatalogIndex;
    });
  }
  _isEligible(tip, contextKeyService) {
    if (tip.onlyWhenModelIds?.length) {
      const currentModelId = this._getCurrentChatModelId(contextKeyService);
      const isModelMatch = tip.onlyWhenModelIds.some((modelId) => currentModelId === modelId || currentModelId.startsWith(`${modelId}-`));
      if (!isModelMatch) {
        return false;
      }
    }
    if (tip.excludeWhenSettingsChanged?.some((setting) => this._isSettingModified(setting))) {
      this._logService.debug("#ChatTips: tip excluded because setting was modified", tip.id, tip.excludeWhenSettingsChanged);
      return false;
    }
    if (tip.when && !contextKeyService.contextMatchesRules(tip.when)) {
      this._logService.debug("#ChatTips: tip is not eligible due to when clause", tip.id, tip.when.serialize());
      return false;
    }
    if (this._tracker.isExcluded(tip)) {
      return false;
    }
    if (tip.id === "tip.thinkingPhrases" && this._thinkingPhrasesEverModified) {
      this._logService.debug("#ChatTips: tip excluded because thinking phrases setting was previously modified", tip.id);
      return false;
    }
    if (!this._areTipCommandsRegistered(tip)) {
      return false;
    }
    this._logService.debug("#ChatTips: tip is eligible", tip.id);
    return true;
  }
  _areTipCommandsRegistered(tip) {
    const ctx = { keybindingService: this._keybindingService, experimentalTipMessages: this._experimentalTipMessages };
    const rawMessage = tip.buildMessage(ctx);
    const commandIds = extractCommandIds(rawMessage.value);
    for (const commandId of commandIds) {
      if (!CommandsRegistry.getCommand(commandId)) {
        this._logService.debug("#ChatTips: tip excluded because command is not registered", tip.id, commandId);
        return false;
      }
    }
    return true;
  }
  _isSettingModified(key) {
    const inspected = this._configurationService.inspect(key);
    return inspected.userValue !== void 0 || inspected.userLocalValue !== void 0 || inspected.userRemoteValue !== void 0 || inspected.workspaceValue !== void 0 || inspected.workspaceFolderValue !== void 0;
  }
  _getCurrentChatModelId(contextKeyService) {
    const normalize = (modelId) => {
      const normalizedModelId = modelId?.toLowerCase() ?? "";
      if (!normalizedModelId) {
        return "";
      }
      if (normalizedModelId.includes("/")) {
        return normalizedModelId.split("/").at(-1) ?? "";
      }
      return normalizedModelId;
    };
    return normalize(getSelectedModelIdentifier(contextKeyService, this._storageService));
  }
  _isChatLocation(contextKeyService) {
    const location = contextKeyService.getContextKeyValue(ChatContextKeys.location.key);
    return !location || location === ChatAgentLocation.Chat;
  }
  _isChatQuotaExceeded(contextKeyService) {
    return contextKeyService.getContextKeyValue(ChatContextKeys.chatQuotaExceeded.key) === true;
  }
  _isCopilotEnabled() {
    const defaultChatAgent = this._productService.defaultChatAgent;
    return !!defaultChatAgent?.chatExtensionId;
  }
  _fetchExperimentalTipMessages() {
    this._assignmentService.getTreatment(ChatTipExperiment.OpenAgentsWindowTip).then((value) => {
      if (typeof value === "string" && value.length > 0) {
        this._experimentalTipMessages.set(ChatTipExperiment.OpenAgentsWindowTip, value);
      }
    });
  }
  _createTip(tipDef) {
    const ctx = { keybindingService: this._keybindingService, experimentalTipMessages: this._experimentalTipMessages };
    const rawMessage = tipDef.buildMessage(ctx);
    const prefixedMessage = localize("tipPrefix", "**Tip:** {0}", rawMessage.value);
    const enabledCommands = extractCommandIds(prefixedMessage);
    const markdown = new MarkdownString(prefixedMessage, {
      isTrusted: enabledCommands.length > 0 ? { enabledCommands } : false
    });
    return {
      id: tipDef.id,
      content: markdown,
      enabledCommands
    };
  }
  _logTipTelemetry(tipId, action, commandId) {
    this._telemetryService.publicLog2("chatTip", {
      tipId,
      action,
      commandId
    });
  }
  _trackTipCommandClicks(tip) {
    this._tipCommandListener.clear();
    const ctx = { keybindingService: this._keybindingService, experimentalTipMessages: this._experimentalTipMessages };
    const rawMessage = tip.buildMessage(ctx);
    const enabledCommands = extractCommandIds(rawMessage.value);
    if (!enabledCommands.length) {
      return;
    }
    const enabledCommandSet = new Set(enabledCommands);
    this._tipCommandListener.value = this._commandService.onDidExecuteCommand((e) => {
      if (enabledCommandSet.has(e.commandId) && this._shownTip?.id === tip.id) {
        this._logTipTelemetry(tip.id, "commandClicked", e.commandId);
        this.dismissTipForSession();
      }
    });
  }
  _readApplicationWithProfileFallback(key) {
    const applicationValue = this._storageService.get(key, StorageScope.APPLICATION);
    if (applicationValue) {
      return applicationValue;
    }
    const profileValue = this._storageService.get(key, StorageScope.PROFILE);
    if (profileValue) {
      this._storageService.store(key, profileValue, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    return profileValue;
  }
};
ChatTipService = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IChatService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IChatEntitlementService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, ITelemetryService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, IWorkbenchAssignmentService)
], ChatTipService);
export {
  ATTACH_FILES_REFERENCE_TRACKING_COMMAND,
  CREATE_AGENT_INSTRUCTIONS_TRACKING_COMMAND,
  CREATE_AGENT_TRACKING_COMMAND,
  CREATE_PROMPT_TRACKING_COMMAND,
  CREATE_SKILL_TRACKING_COMMAND,
  ChatTipService,
  FORK_CONVERSATION_TRACKING_COMMAND,
  IChatTipService,
  TipEligibilityTracker2 as TipEligibilityTracker,
  TipTrackingCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0VGlwU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgZ2V0U2VsZWN0ZWRNb2RlbElkZW50aWZpZXIgfSBmcm9tICcuLi9jb21tb24vY2hhdFNlbGVjdGVkTW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ3JlYXRlU2xhc2hDb21tYW5kc1VzYWdlVHJhY2tlciB9IGZyb20gJy4vY3JlYXRlU2xhc2hDb21tYW5kc1VzYWdlVHJhY2tlci5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0QWdlbnRTdWJjb21tYW5kUGFydCwgQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0LCBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQsIElQYXJzZWRDaGF0UmVxdWVzdCB9IGZyb20gJy4uL2NvbW1vbi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFRpcEVsaWdpYmlsaXR5VHJhY2tlciB9IGZyb20gJy4vY2hhdFRpcEVsaWdpYmlsaXR5VHJhY2tlci5qcyc7XG5pbXBvcnQgeyBDaGF0VGlwRXhwZXJpbWVudCwgQ2hhdFRpcFRpZXIsIGV4dHJhY3RDb21tYW5kSWRzLCBJVGlwQnVpbGRDb250ZXh0LCBJVGlwRGVmaW5pdGlvbiwgVElQX0NBVEFMT0cgfSBmcm9tICcuL2NoYXRUaXBDYXRhbG9nLmpzJztcbmltcG9ydCB7IENoYXRUaXBTdG9yYWdlS2V5cywgVGlwVHJhY2tpbmdDb21tYW5kcyB9IGZyb20gJy4vY2hhdFRpcFN0b3JhZ2VLZXlzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcblxudHlwZSBDaGF0VGlwRXZlbnQgPSB7XG5cdHRpcElkOiBzdHJpbmc7XG5cdGFjdGlvbjogc3RyaW5nO1xuXHRjb21tYW5kSWQ/OiBzdHJpbmc7XG59O1xuXG50eXBlIENoYXRUaXBDbGFzc2lmaWNhdGlvbiA9IHtcblx0dGlwSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaWRlbnRpZmllciBvZiB0aGUgdGlwLicgfTtcblx0YWN0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGFjdGlvbiBwZXJmb3JtZWQgb24gdGhlIHRpcCAoc2hvd24sIGRpc21pc3NlZCwgbmF2aWdhdGVOZXh0LCBuYXZpZ2F0ZVByZXZpb3VzLCBoaWRkZW4sIGRpc2FibGVkLCBjb21tYW5kQ2xpY2tlZCkuJyB9O1xuXHRjb21tYW5kSWQ/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGNvbW1hbmQgSUQgdGhhdCB3YXMgY2xpY2tlZCwgaWYgYXBwbGljYWJsZS4nIH07XG5cdG93bmVyOiAnbWVnYW5yb2dnZSc7XG5cdGNvbW1lbnQ6ICdUcmFja3MgdXNlciBpbnRlcmFjdGlvbnMgd2l0aCBjaGF0IHRpcHMgdG8gdW5kZXJzdGFuZCB3aGljaCB0aXBzIHJlc29uYXRlIGFuZCB3aGljaCBhcmUgZGlzbWlzc2VkLic7XG59O1xuXG4vLyBSZS1leHBvcnQgdHJhY2tpbmcgY29tbWFuZHMgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG5leHBvcnQgeyBUaXBUcmFja2luZ0NvbW1hbmRzIH07XG4vKiogQGRlcHJlY2F0ZWQgVXNlIFRpcFRyYWNraW5nQ29tbWFuZHMuQXR0YWNoRmlsZXNSZWZlcmVuY2VVc2VkICovXG5leHBvcnQgY29uc3QgQVRUQUNIX0ZJTEVTX1JFRkVSRU5DRV9UUkFDS0lOR19DT01NQU5EID0gVGlwVHJhY2tpbmdDb21tYW5kcy5BdHRhY2hGaWxlc1JlZmVyZW5jZVVzZWQ7XG4vKiogQGRlcHJlY2F0ZWQgVXNlIFRpcFRyYWNraW5nQ29tbWFuZHMuQ3JlYXRlQWdlbnRJbnN0cnVjdGlvbnNVc2VkICovXG5leHBvcnQgY29uc3QgQ1JFQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19UUkFDS0lOR19DT01NQU5EID0gVGlwVHJhY2tpbmdDb21tYW5kcy5DcmVhdGVBZ2VudEluc3RydWN0aW9uc1VzZWQ7XG4vKiogQGRlcHJlY2F0ZWQgVXNlIFRpcFRyYWNraW5nQ29tbWFuZHMuQ3JlYXRlUHJvbXB0VXNlZCAqL1xuZXhwb3J0IGNvbnN0IENSRUFURV9QUk9NUFRfVFJBQ0tJTkdfQ09NTUFORCA9IFRpcFRyYWNraW5nQ29tbWFuZHMuQ3JlYXRlUHJvbXB0VXNlZDtcbi8qKiBAZGVwcmVjYXRlZCBVc2UgVGlwVHJhY2tpbmdDb21tYW5kcy5DcmVhdGVBZ2VudFVzZWQgKi9cbmV4cG9ydCBjb25zdCBDUkVBVEVfQUdFTlRfVFJBQ0tJTkdfQ09NTUFORCA9IFRpcFRyYWNraW5nQ29tbWFuZHMuQ3JlYXRlQWdlbnRVc2VkO1xuLyoqIEBkZXByZWNhdGVkIFVzZSBUaXBUcmFja2luZ0NvbW1hbmRzLkNyZWF0ZVNraWxsVXNlZCAqL1xuZXhwb3J0IGNvbnN0IENSRUFURV9TS0lMTF9UUkFDS0lOR19DT01NQU5EID0gVGlwVHJhY2tpbmdDb21tYW5kcy5DcmVhdGVTa2lsbFVzZWQ7XG4vKiogQGRlcHJlY2F0ZWQgVXNlIFRpcFRyYWNraW5nQ29tbWFuZHMuRm9ya0NvbnZlcnNhdGlvblVzZWQgKi9cbmV4cG9ydCBjb25zdCBGT1JLX0NPTlZFUlNBVElPTl9UUkFDS0lOR19DT01NQU5EID0gVGlwVHJhY2tpbmdDb21tYW5kcy5Gb3JrQ29udmVyc2F0aW9uVXNlZDtcblxuZXhwb3J0IGNvbnN0IElDaGF0VGlwU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQ2hhdFRpcFNlcnZpY2U+KCdjaGF0VGlwU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0VGlwIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgY29udGVudDogTWFya2Rvd25TdHJpbmc7XG5cdHJlYWRvbmx5IGVuYWJsZWRDb21tYW5kcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0VGlwU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogRmlyZWQgd2hlbiB0aGUgY3VycmVudCB0aXAgaXMgZGlzbWlzc2VkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWREaXNtaXNzVGlwOiBFdmVudDx2b2lkPjtcblxuXHQvKipcblx0ICogRmlyZWQgd2hlbiB0aGUgdXNlciBuYXZpZ2F0ZXMgdG8gYSBkaWZmZXJlbnQgdGlwIChwcmV2aW91cy9uZXh0KS5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkTmF2aWdhdGVUaXA6IEV2ZW50PElDaGF0VGlwPjtcblxuXHQvKipcblx0ICogRmlyZWQgd2hlbiB0aGUgdGlwIHdpZGdldCBpcyBoaWRkZW4gd2l0aG91dCBkaXNtaXNzaW5nIHRoZSB0aXAuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZEhpZGVUaXA6IEV2ZW50PHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBGaXJlZCB3aGVuIHRpcHMgYXJlIGRpc2FibGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWREaXNhYmxlVGlwczogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIEdldHMgYSB0aXAgdG8gc2hvdyBvbiB0aGUgd2VsY29tZS9nZXR0aW5nLXN0YXJ0ZWQgdmlldy5cblx0ICogUmV0dXJucyB0aGUgc2FtZSB0aXAgb24gcmVwZWF0ZWQgY2FsbHMgZm9yIHN0YWJsZSByZXJlbmRlcnMuXG5cdCAqL1xuXHRnZXRXZWxjb21lVGlwKGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBJQ2hhdFRpcCB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmVzZXRzIHRpcCBzdGF0ZSBmb3IgYSBuZXcgY29udmVyc2F0aW9uLlxuXHQgKiBDYWxsIHRoaXMgd2hlbiB0aGUgY2hhdCB3aWRnZXQgYmluZHMgdG8gYSBuZXcgbW9kZWwuXG5cdCAqL1xuXHRyZXNldFNlc3Npb24oKTogdm9pZDtcblxuXHQvKipcblx0ICogRGlzbWlzc2VzIHRoZSBjdXJyZW50IHRpcCBhbmQgYWxsb3dzIGEgbmV3IG9uZSB0byBiZSBwaWNrZWQgZm9yIHRoZSBzYW1lIHJlcXVlc3QuXG5cdCAqIFRoZSBkaXNtaXNzZWQgdGlwIHdpbGwgbm90IGJlIHNob3duIGFnYWluIGZvciB0aGlzIHVzZXIgb24gdGhpcyBhcHBsaWNhdGlvbiBpbnN0YWxsYXRpb24uXG5cdCAqL1xuXHRkaXNtaXNzVGlwKCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIERpc21pc3NlcyB0aGUgY3VycmVudCB0aXAgYW5kIGhpZGVzIGFsbCB0aXBzIGZvciB0aGUgcmVzdCBvZiB0aGUgY3VycmVudCBjaGF0IHNlc3Npb24uXG5cdCAqL1xuXHRkaXNtaXNzVGlwRm9yU2Vzc2lvbigpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBIaWRlcyB0aGUgdGlwIHdpZGdldCB3aXRob3V0IHBlcm1hbmVudGx5IGRpc21pc3NpbmcgdGhlIHRpcC5cblx0ICogVGhlIHRpcCBtYXkgYmUgc2hvd24gYWdhaW4gaW4gYSBmdXR1cmUgc2Vzc2lvbi5cblx0ICovXG5cdGhpZGVUaXAoKTogdm9pZDtcblxuXHQvKipcblx0ICogSGlkZXMgYWxsIHRpcHMgZm9yIHRoZSByZXN0IG9mIHRoZSBjdXJyZW50IGNoYXQgc2Vzc2lvbi5cblx0ICovXG5cdGhpZGVUaXBzRm9yU2Vzc2lvbigpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBEaXNhYmxlcyB0aXBzIHBlcm1hbmVudGx5IGJ5IHNldHRpbmcgdGhlIGBjaGF0LnRpcHMuZW5hYmxlZGAgY29uZmlndXJhdGlvbiB0byBmYWxzZS5cblx0ICovXG5cdGRpc2FibGVUaXBzKCk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIE5hdmlnYXRlcyB0byB0aGUgbmV4dCB0aXAgaW4gdGhlIGNhdGFsb2cgd2l0aG91dCBwZXJtYW5lbnRseSBkaXNtaXNzaW5nIHRoZSBjdXJyZW50IG9uZS5cblx0ICovXG5cdG5hdmlnYXRlVG9OZXh0VGlwKCk6IElDaGF0VGlwIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBOYXZpZ2F0ZXMgdG8gdGhlIHByZXZpb3VzIHRpcCBpbiB0aGUgY2F0YWxvZyB3aXRob3V0IHBlcm1hbmVudGx5IGRpc21pc3NpbmcgdGhlIGN1cnJlbnQgb25lLlxuXHQgKi9cblx0bmF2aWdhdGVUb1ByZXZpb3VzVGlwKCk6IElDaGF0VGlwIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBuZXh0IGVsaWdpYmxlIHRpcCBhZnRlciB0aGUgY3VycmVudCBvbmUsIHdpdGhvdXQgcmVxdWlyaW5nIG11bHRpcGxlIHRpcHMuXG5cdCAqIFVzZWQgYWZ0ZXIgZGlzbWlzc2luZyBhIHRpcCB0byBzaG93IHRoZSBuZXh0IGF2YWlsYWJsZSB0aXAgKGV2ZW4gaWYgaXQncyB0aGUgb25seSBvbmUgbGVmdCkuXG5cdCAqL1xuXHRnZXROZXh0RWxpZ2libGVUaXAoKTogSUNoYXRUaXAgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGVyZSBhcmUgbXVsdGlwbGUgZWxpZ2libGUgdGlwcyBmb3IgbmF2aWdhdGlvbi5cblx0ICovXG5cdGhhc011bHRpcGxlVGlwcygpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBSZWNvcmRzIHVzYWdlIG9mIGEgc2xhc2ggY29tbWFuZCB0byB1cGRhdGUgdGlwIGVsaWdpYmlsaXR5IGZvciBmbG93cyB3aGVyZVxuXHQgKiB0aGUgc2xhc2ggY29tbWFuZCB0ZXh0IGlzIHRyYW5zZm9ybWVkIGJlZm9yZSByZXF1ZXN0IHN1Ym1pc3Npb24uXG5cdCAqL1xuXHRyZWNvcmRTbGFzaENvbW1hbmRVc2FnZShjb21tYW5kOiBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBDbGVhcnMgYWxsIGRpc21pc3NlZCB0aXBzIHNvIHRoZXkgY2FuIGJlIHNob3duIGFnYWluLlxuXHQgKi9cblx0Y2xlYXJEaXNtaXNzZWRUaXBzKCk6IHZvaWQ7XG59XG5cbi8vIFJlLWV4cG9ydCB0eXBlcyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbmV4cG9ydCB0eXBlIHsgSVRpcERlZmluaXRpb24gfSBmcm9tICcuL2NoYXRUaXBDYXRhbG9nLmpzJztcbmV4cG9ydCB7IFRpcEVsaWdpYmlsaXR5VHJhY2tlciB9IGZyb20gJy4vY2hhdFRpcEVsaWdpYmlsaXR5VHJhY2tlci5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0VGlwU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdFRpcFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNtaXNzVGlwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzbWlzc1RpcCA9IHRoaXMuX29uRGlkRGlzbWlzc1RpcC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE5hdmlnYXRlVGlwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRUaXA+KCkpO1xuXHRyZWFkb25seSBvbkRpZE5hdmlnYXRlVGlwID0gdGhpcy5fb25EaWROYXZpZ2F0ZVRpcC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEhpZGVUaXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRIaWRlVGlwID0gdGhpcy5fb25EaWRIaWRlVGlwLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzYWJsZVRpcHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWREaXNhYmxlVGlwcyA9IHRoaXMuX29uRGlkRGlzYWJsZVRpcHMuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIFRoZSByZXF1ZXN0IElEIHRoYXQgd2FzIGFzc2lnbmVkIGEgdGlwIChmb3Igc3RhYmxlIHJlcmVuZGVycykuXG5cdCAqL1xuXHRwcml2YXRlIF90aXBSZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogVGhlIHRpcCB0aGF0IHdhcyBzaG93biAoZm9yIHN0YWJsZSByZXJlbmRlcnMpLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2hvd25UaXA6IElUaXBEZWZpbml0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBUaGUgc2NvcGVkIGNvbnRleHQga2V5IHNlcnZpY2UgZnJvbSB0aGUgY2hhdCB3aWRnZXQsIHN0b3JlZCB3aGVuXG5cdCAqIHtAbGluayBnZXRXZWxjb21lVGlwfSBpcyBmaXJzdCBjYWxsZWQgc28gdGhhdCBuYXZpZ2F0aW9uIG1ldGhvZHNcblx0ICogY2FuIGV2YWx1YXRlIHdoZW4tY2xhdXNlIGVsaWdpYmlsaXR5IGFnYWluc3QgdGhlIGNvcnJlY3QgY29udGV4dC5cblx0ICovXG5cdHByaXZhdGUgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cblxuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFja2VyOiBUaXBFbGlnaWJpbGl0eVRyYWNrZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NyZWF0ZVNsYXNoQ29tbWFuZHNVc2FnZVRyYWNrZXI6IENyZWF0ZVNsYXNoQ29tbWFuZHNVc2FnZVRyYWNrZXI7XG5cdHByaXZhdGUgX3RoaW5raW5nUGhyYXNlc0V2ZXJNb2RpZmllZDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfdGlwc0hpZGRlbkZvclNlc3Npb24gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGlwQ29tbWFuZExpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHBlcmltZW50YWxUaXBNZXNzYWdlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXNzaWdubWVudFNlcnZpY2U6IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl90cmFja2VyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGlwRWxpZ2liaWxpdHlUcmFja2VyLCBUSVBfQ0FUQUxPRykpO1xuXHRcdHRoaXMuX2NyZWF0ZVNsYXNoQ29tbWFuZHNVc2FnZVRyYWNrZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ3JlYXRlU2xhc2hDb21tYW5kc1VzYWdlVHJhY2tlcih0aGlzLl9jaGF0U2VydmljZSwgdGhpcy5fc3RvcmFnZVNlcnZpY2UsICgpID0+IHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fZmV0Y2hFeHBlcmltZW50YWxUaXBNZXNzYWdlcygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2Fzc2lnbm1lbnRTZXJ2aWNlLm9uRGlkUmVmZXRjaEFzc2lnbm1lbnRzKCgpID0+IHRoaXMuX2ZldGNoRXhwZXJpbWVudGFsVGlwTWVzc2FnZXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VRdW90YUV4Y2VlZGVkKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy5jaGF0Py5wZXJjZW50UmVtYWluaW5nID09PSAwICYmIHRoaXMuX3Nob3duVGlwKSB7XG5cdFx0XHRcdHRoaXMuaGlkZVRpcCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRTZXJ2aWNlLm9uRGlkU3VibWl0UmVxdWVzdChlID0+IHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlLm1lc3NhZ2UgPz8gdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihlLmNoYXRTZXNzaW9uUmVzb3VyY2UpPy5sYXN0UmVxdWVzdD8ubWVzc2FnZTtcblx0XHRcdGlmICghbWVzc2FnZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9oYXNGaWxlT3JGb2xkZXJSZWZlcmVuY2UobWVzc2FnZSkpIHtcblx0XHRcdFx0dGhpcy5fdHJhY2tlci5yZWNvcmRDb21tYW5kRXhlY3V0ZWQoVGlwVHJhY2tpbmdDb21tYW5kcy5BdHRhY2hGaWxlc1JlZmVyZW5jZVVzZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzbGFzaENvbW1hbmRUcmFja2luZ0lkID0gdGhpcy5fZ2V0U2xhc2hDb21tYW5kVHJhY2tpbmdJZChtZXNzYWdlKTtcblx0XHRcdGlmIChzbGFzaENvbW1hbmRUcmFja2luZ0lkKSB7XG5cdFx0XHRcdHRoaXMuX3RyYWNrZXIucmVjb3JkQ29tbWFuZEV4ZWN1dGVkKHNsYXNoQ29tbWFuZFRyYWNraW5nSWQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9oaWRlU2hvd25UaXBJZk5vd0luZWxpZ2libGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl90aGlua2luZ1BocmFzZXNFdmVyTW9kaWZpZWQgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKENoYXRUaXBTdG9yYWdlS2V5cy5UaGlua2luZ1BocmFzZXNFdmVyTW9kaWZpZWQsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXHRcdGlmICghdGhpcy5fdGhpbmtpbmdQaHJhc2VzRXZlck1vZGlmaWVkICYmIHRoaXMuX2lzU2V0dGluZ01vZGlmaWVkKENoYXRDb25maWd1cmF0aW9uLlRoaW5raW5nUGhyYXNlcykpIHtcblx0XHRcdHRoaXMuX3RoaW5raW5nUGhyYXNlc0V2ZXJNb2RpZmllZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShDaGF0VGlwU3RvcmFnZUtleXMuVGhpbmtpbmdQaHJhc2VzRXZlck1vZGlmaWVkLCB0cnVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fdGhpbmtpbmdQaHJhc2VzRXZlck1vZGlmaWVkKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlRoaW5raW5nUGhyYXNlcykpIHtcblx0XHRcdFx0XHR0aGlzLl90aGlua2luZ1BocmFzZXNFdmVyTW9kaWZpZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKENoYXRUaXBTdG9yYWdlS2V5cy5UaGlua2luZ1BocmFzZXNFdmVyTW9kaWZpZWQsIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhc0ZpbGVPckZvbGRlclJlZmVyZW5jZShtZXNzYWdlOiBJUGFyc2VkQ2hhdFJlcXVlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gbWVzc2FnZS5wYXJ0cy5zb21lKHBhcnQgPT4ge1xuXHRcdFx0aWYgKHBhcnQua2luZCAhPT0gQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0LktpbmQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkeW5hbWljUGFydCA9IHBhcnQgYXMgQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0O1xuXHRcdFx0cmV0dXJuIGR5bmFtaWNQYXJ0LmlzRmlsZSA9PT0gdHJ1ZSB8fCBkeW5hbWljUGFydC5pc0RpcmVjdG9yeSA9PT0gdHJ1ZTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNsYXNoQ29tbWFuZFRyYWNraW5nSWQobWVzc2FnZTogSVBhcnNlZENoYXRSZXF1ZXN0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgbWVzc2FnZS5wYXJ0cykge1xuXHRcdFx0aWYgKHBhcnQua2luZCA9PT0gQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0LktpbmQpIHtcblx0XHRcdFx0Y29uc3Qgc2xhc2hDb21tYW5kID0gKHBhcnQgYXMgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0KS5zbGFzaENvbW1hbmQuY29tbWFuZDtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3RvU2xhc2hDb21tYW5kVHJhY2tpbmdJZChzbGFzaENvbW1hbmQpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocGFydC5raW5kID09PSBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQuS2luZCkge1xuXHRcdFx0XHRjb25zdCBzdWJDb21tYW5kID0gKHBhcnQgYXMgQ2hhdFJlcXVlc3RBZ2VudFN1YmNvbW1hbmRQYXJ0KS5jb21tYW5kLm5hbWU7XG5cdFx0XHRcdHJldHVybiB0aGlzLl90b1NsYXNoQ29tbWFuZFRyYWNraW5nSWQoc3ViQ29tbWFuZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJpbW1lZCA9IG1lc3NhZ2UudGV4dC50cmltU3RhcnQoKTtcblx0XHRjb25zdCBtYXRjaCA9IC9eKD86QFxcUytcXHMrKT9cXC8oaW5pdHxjcmVhdGUtKD86aW5zdHJ1Y3Rpb25zfHByb21wdHxhZ2VudHxza2lsbCl8Zm9yaykoPzpcXHN8JCkvLmV4ZWModHJpbW1lZCk7XG5cdFx0cmV0dXJuIG1hdGNoID8gdGhpcy5fdG9TbGFzaENvbW1hbmRUcmFja2luZ0lkKG1hdGNoWzFdKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3RvU2xhc2hDb21tYW5kVHJhY2tpbmdJZChjb21tYW5kOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0Y2FzZSAnaW5pdCc6XG5cdFx0XHRjYXNlICdjcmVhdGUtaW5zdHJ1Y3Rpb25zJzpcblx0XHRcdFx0cmV0dXJuIENSRUFURV9BR0VOVF9JTlNUUlVDVElPTlNfVFJBQ0tJTkdfQ09NTUFORDtcblx0XHRcdGNhc2UgJ2NyZWF0ZS1wcm9tcHQnOlxuXHRcdFx0XHRyZXR1cm4gQ1JFQVRFX1BST01QVF9UUkFDS0lOR19DT01NQU5EO1xuXHRcdFx0Y2FzZSAnY3JlYXRlLWFnZW50Jzpcblx0XHRcdFx0cmV0dXJuIENSRUFURV9BR0VOVF9UUkFDS0lOR19DT01NQU5EO1xuXHRcdFx0Y2FzZSAnY3JlYXRlLXNraWxsJzpcblx0XHRcdFx0cmV0dXJuIENSRUFURV9TS0lMTF9UUkFDS0lOR19DT01NQU5EO1xuXHRcdFx0Y2FzZSAnZm9yayc6XG5cdFx0XHRcdHJldHVybiBGT1JLX0NPTlZFUlNBVElPTl9UUkFDS0lOR19DT01NQU5EO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRyZWNvcmRTbGFzaENvbW1hbmRVc2FnZShjb21tYW5kOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB0cmFja2luZ0lkID0gdGhpcy5fdG9TbGFzaENvbW1hbmRUcmFja2luZ0lkKGNvbW1hbmQpO1xuXHRcdGlmICghdHJhY2tpbmdJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3RyYWNrZXIucmVjb3JkQ29tbWFuZEV4ZWN1dGVkKHRyYWNraW5nSWQpO1xuXHRcdHRoaXMuX2hpZGVTaG93blRpcElmTm93SW5lbGlnaWJsZSgpO1xuXHR9XG5cblx0cmVzZXRTZXNzaW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Nob3duVGlwID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3RpcFJlcXVlc3RJZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl90aXBzSGlkZGVuRm9yU2Vzc2lvbiA9IGZhbHNlO1xuXHR9XG5cblx0ZGlzbWlzc1RpcCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2hvd25UaXApIHtcblx0XHRcdHRoaXMuX2xvZ1RpcFRlbGVtZXRyeSh0aGlzLl9zaG93blRpcC5pZCwgJ2Rpc21pc3NlZCcpO1xuXHRcdFx0Y29uc3QgZGlzbWlzc2VkID0gbmV3IFNldCh0aGlzLl9nZXREaXNtaXNzZWRUaXBJZHMoKSk7XG5cdFx0XHRkaXNtaXNzZWQuYWRkKHRoaXMuX3Nob3duVGlwLmlkKTtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKENoYXRUaXBTdG9yYWdlS2V5cy5EaXNtaXNzZWRUaXBzLCBKU09OLnN0cmluZ2lmeShbLi4uZGlzbWlzc2VkXSksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9XG5cdFx0Ly8gS2VlcCB0aGUgY3VycmVudCB0aXAgcmVmZXJlbmNlIHNvIGNhbGxlcnMgY2FuIG5hdmlnYXRlIHJlbGF0aXZlIHRvIGl0XG5cdFx0Ly8gKGZvciBleGFtcGxlLCBkaXNtaXNzIC0+IG5leHQgc2hvdWxkIG1pcnJvciBuZXh0L3ByZXZpb3VzIGJlaGF2aW9yKS5cblx0XHR0aGlzLl90aXBSZXF1ZXN0SWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb25EaWREaXNtaXNzVGlwLmZpcmUoKTtcblx0fVxuXG5cdGRpc21pc3NUaXBGb3JTZXNzaW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzbWlzc1RpcCgpO1xuXHRcdHRoaXMuaGlkZVRpcHNGb3JTZXNzaW9uKCk7XG5cdH1cblxuXHRjbGVhckRpc21pc3NlZFRpcHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKENoYXRUaXBTdG9yYWdlS2V5cy5EaXNtaXNzZWRUaXBzLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShDaGF0VGlwU3RvcmFnZUtleXMuRGlzbWlzc2VkVGlwcywgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdHRoaXMuX3Nob3duVGlwID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3RpcFJlcXVlc3RJZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl90aXBzSGlkZGVuRm9yU2Vzc2lvbiA9IGZhbHNlO1xuXHRcdHRoaXMuX29uRGlkRGlzbWlzc1RpcC5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXREaXNtaXNzZWRUaXBJZHMoKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuX3JlYWRBcHBsaWNhdGlvbldpdGhQcm9maWxlRmFsbGJhY2soQ2hhdFRpcFN0b3JhZ2VLZXlzLkRpc21pc3NlZFRpcHMpO1xuXHRcdGlmICghcmF3KSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCcjQ2hhdFRpcHMgZGlzbWlzc2VkOicsIHBhcnNlZCk7XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGtub3duVGlwSWRzID0gbmV3IFNldChUSVBfQ0FUQUxPRy5tYXAodGlwID0+IHRpcC5pZCkpO1xuXHRcdFx0Y29uc3QgZGlzbWlzc2VkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHBhcnNlZCkge1xuXHRcdFx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiBrbm93blRpcElkcy5oYXModmFsdWUpKSB7XG5cdFx0XHRcdFx0ZGlzbWlzc2VkLmFkZCh2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIFsuLi5kaXNtaXNzZWRdO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdGhpZGVUaXAoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Nob3duVGlwKSB7XG5cdFx0XHR0aGlzLl9sb2dUaXBUZWxlbWV0cnkodGhpcy5fc2hvd25UaXAuaWQsICdoaWRkZW4nKTtcblx0XHR9XG5cdFx0dGhpcy5fc2hvd25UaXAgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fdGlwUmVxdWVzdElkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX29uRGlkSGlkZVRpcC5maXJlKCk7XG5cdH1cblxuXHRoaWRlVGlwc0ZvclNlc3Npb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3RpcHNIaWRkZW5Gb3JTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdGlwc0hpZGRlbkZvclNlc3Npb24gPSB0cnVlO1xuXHRcdHRoaXMuX3Nob3duVGlwID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3RpcFJlcXVlc3RJZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vbkRpZEhpZGVUaXAuZmlyZSgpO1xuXHR9XG5cblx0YXN5bmMgZGlzYWJsZVRpcHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3Nob3duVGlwKSB7XG5cdFx0XHR0aGlzLl9sb2dUaXBUZWxlbWV0cnkodGhpcy5fc2hvd25UaXAuaWQsICdkaXNhYmxlZCcpO1xuXHRcdH1cblx0XHR0aGlzLl9zaG93blRpcCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl90aXBSZXF1ZXN0SWQgPSB1bmRlZmluZWQ7XG5cdFx0YXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2NoYXQudGlwcy5lbmFibGVkJywgZmFsc2UsIENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT04pO1xuXHRcdHRoaXMuX29uRGlkRGlzYWJsZVRpcHMuZmlyZSgpO1xuXHR9XG5cblx0Z2V0V2VsY29tZVRpcChjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKTogSUNoYXRUaXAgfCB1bmRlZmluZWQge1xuXHRcdHRoaXMuX2NyZWF0ZVNsYXNoQ29tbWFuZHNVc2FnZVRyYWNrZXIuc3luY0NvbnRleHRLZXkoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdC8vIEFsd2F5cyByZWNvcmQgdGhlIGN1cnJlbnQgbW9kZSBzbyB0aGF0IG1vZGUtYmFzZWQgZXhjbHVzaW9ucyBhcmVcblx0XHQvLyBwZXJzaXN0ZWQgZXZlbiBvbiBzdGFibGUtcmVyZW5kZXIgcGF0aHMgKGUuZy4gdXNlciBzd2l0Y2hlcyB0byBQbGFuXG5cdFx0Ly8gbW9kZSB3aGlsZSB2aWV3aW5nIHRoZSBQbGFuIHRpcCkuXG5cdFx0dGhpcy5fdHJhY2tlci5yZWNvcmRDdXJyZW50TW9kZShjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl90cmFja2VyLnJlZnJlc2hQcm9tcHRGaWxlRXhjbHVzaW9ucygpO1xuXHRcdC8vIENoZWNrIGlmIHRpcHMgYXJlIGVuYWJsZWRcblx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdjaGF0LnRpcHMuZW5hYmxlZCcpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl90aXBzSGlkZGVuRm9yU2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBTdG9yZSB0aGUgc2NvcGVkIGNvbnRleHQga2V5IHNlcnZpY2UgZm9yIGxhdGVyIG5hdmlnYXRpb24gY2FsbHNcblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZSA9IGNvbnRleHRLZXlTZXJ2aWNlO1xuXG5cdFx0Ly8gT25seSBzaG93IHRpcHMgZm9yIENvcGlsb3Rcblx0XHRpZiAoIXRoaXMuX2lzQ29waWxvdEVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBUaXBzIGFyZSBvbmx5IHJlbGV2YW50IGFmdGVyIHNpZ24taW4gaGFzIGNvbXBsZXRlZC5cblx0XHRpZiAodGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlVua25vd24gJiYgIXRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuaGFzQnlva01vZGVscykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBPbmx5IHNob3cgdGlwcyBpbiB0aGUgbWFpbiBjaGF0IHBhbmVsLCBub3QgaW4gdGVybWluYWwvZWRpdG9yIGlubGluZSBjaGF0XG5cdFx0aWYgKCF0aGlzLl9pc0NoYXRMb2NhdGlvbihjb250ZXh0S2V5U2VydmljZSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9oYXNTaW5nbGVGb3JlZ3JvdW5kQ2hhdFN1cmZhY2UoY29udGV4dEtleVNlcnZpY2UpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIERvbid0IHNob3cgdGlwcyB3aGVuIGNoYXQgcXVvdGEgaXMgZXhjZWVkZWQsIHRoZSB1cGdyYWRlIHdpZGdldCBpcyBtb3JlIHJlbGV2YW50XG5cdFx0aWYgKHRoaXMuX2lzQ2hhdFF1b3RhRXhjZWVkZWQoY29udGV4dEtleVNlcnZpY2UpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFJldHVybiB0aGUgYWxyZWFkeS1zaG93biB0aXAgZm9yIHN0YWJsZSByZXJlbmRlcnNcblx0XHRpZiAodGhpcy5fdGlwUmVxdWVzdElkID09PSAnd2VsY29tZScgJiYgdGhpcy5fc2hvd25UaXApIHtcblx0XHRcdGlmICh0aGlzLl9zaG93blRpcC5pZCAhPT0gJ3RpcC5zd2l0Y2hUb0F1dG8nKSB7XG5cdFx0XHRcdGNvbnN0IHN3aXRjaFRvQXV0b1RpcCA9IFRJUF9DQVRBTE9HLmZpbmQodGlwID0+IHRpcC5pZCA9PT0gJ3RpcC5zd2l0Y2hUb0F1dG8nKTtcblx0XHRcdFx0aWYgKHN3aXRjaFRvQXV0b1RpcCkge1xuXHRcdFx0XHRcdGNvbnN0IGRpc21pc3NlZElkcyA9IG5ldyBTZXQodGhpcy5fZ2V0RGlzbWlzc2VkVGlwSWRzKCkpO1xuXHRcdFx0XHRcdGlmICghZGlzbWlzc2VkSWRzLmhhcyhzd2l0Y2hUb0F1dG9UaXAuaWQpICYmIHRoaXMuX2lzRWxpZ2libGUoc3dpdGNoVG9BdXRvVGlwLCBjb250ZXh0S2V5U2VydmljZSkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Nob3duVGlwID0gc3dpdGNoVG9BdXRvVGlwO1xuXHRcdFx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2hhdFRpcFN0b3JhZ2VLZXlzLkxhc3RUaXBJZCwgc3dpdGNoVG9BdXRvVGlwLmlkLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHRcdFx0XHRjb25zdCB0aXAgPSB0aGlzLl9jcmVhdGVUaXAoc3dpdGNoVG9BdXRvVGlwKTtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1RpcFRlbGVtZXRyeShzd2l0Y2hUb0F1dG9UaXAuaWQsICdzaG93bicpO1xuXHRcdFx0XHRcdFx0dGhpcy5fdHJhY2tUaXBDb21tYW5kQ2xpY2tzKHN3aXRjaFRvQXV0b1RpcCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZE5hdmlnYXRlVGlwLmZpcmUodGlwKTtcblx0XHRcdFx0XHRcdHJldHVybiB0aXA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5faXNFbGlnaWJsZSh0aGlzLl9zaG93blRpcCwgY29udGV4dEtleVNlcnZpY2UpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl90cmFja2VyLmlzRXhjbHVkZWQodGhpcy5fc2hvd25UaXApKSB7XG5cdFx0XHRcdFx0dGhpcy5oaWRlVGlwKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5leHRUaXAgPSB0aGlzLl9maW5kTmV4dEVsaWdpYmxlVGlwKHRoaXMuX3Nob3duVGlwLmlkLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRcdGlmIChuZXh0VGlwKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2hvd25UaXAgPSBuZXh0VGlwO1xuXHRcdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKENoYXRUaXBTdG9yYWdlS2V5cy5MYXN0VGlwSWQsIG5leHRUaXAuaWQsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdFx0XHRjb25zdCB0aXAgPSB0aGlzLl9jcmVhdGVUaXAobmV4dFRpcCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWROYXZpZ2F0ZVRpcC5maXJlKHRpcCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRpcDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuaGlkZVRpcCgpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVRpcCh0aGlzLl9zaG93blRpcCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGlwID0gdGhpcy5fcGlja1RpcCgnd2VsY29tZScsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHJldHVybiB0aXA7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNTaW5nbGVGb3JlZ3JvdW5kQ2hhdFN1cmZhY2UoY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGZvcmVncm91bmRTZXNzaW9uQ291bnQgPSBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8bnVtYmVyPihDaGF0Q29udGV4dEtleXMuZm9yZWdyb3VuZFNlc3Npb25Db3VudC5rZXkpO1xuXHRcdHJldHVybiBmb3JlZ3JvdW5kU2Vzc2lvbkNvdW50ID09PSAxXG5cdFx0XHR8fCAoZm9yZWdyb3VuZFNlc3Npb25Db3VudCA9PT0gMCAmJiBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQua2V5KSA9PT0gdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kTmV4dEVsaWdpYmxlVGlwKGN1cnJlbnRUaXBJZDogc3RyaW5nLCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKTogSVRpcERlZmluaXRpb24gfCB1bmRlZmluZWQge1xuXHRcdHRoaXMuX2NyZWF0ZVNsYXNoQ29tbWFuZHNVc2FnZVRyYWNrZXIuc3luY0NvbnRleHRLZXkoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IFRJUF9DQVRBTE9HLmZpbmRJbmRleCh0aXAgPT4gdGlwLmlkID09PSBjdXJyZW50VGlwSWQpO1xuXHRcdGlmIChjdXJyZW50SW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc21pc3NlZElkcyA9IG5ldyBTZXQodGhpcy5fZ2V0RGlzbWlzc2VkVGlwSWRzKCkpO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgVElQX0NBVEFMT0cubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGlkeCA9IChjdXJyZW50SW5kZXggKyBpKSAlIFRJUF9DQVRBTE9HLmxlbmd0aDtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IFRJUF9DQVRBTE9HW2lkeF07XG5cdFx0XHRpZiAoIWRpc21pc3NlZElkcy5oYXMoY2FuZGlkYXRlLmlkKSAmJiB0aGlzLl9pc0VsaWdpYmxlKGNhbmRpZGF0ZSwgY29udGV4dEtleVNlcnZpY2UpKSB7XG5cdFx0XHRcdHJldHVybiBjYW5kaWRhdGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2hpZGVTaG93blRpcElmTm93SW5lbGlnaWJsZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Nob3duVGlwIHx8ICF0aGlzLl9jb250ZXh0S2V5U2VydmljZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl90aXBzSGlkZGVuRm9yU2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBlbGlnaWJsZTogYm9vbGVhbjtcblx0XHR0cnkge1xuXHRcdFx0ZWxpZ2libGUgPSB0aGlzLl9pc0VsaWdpYmxlKHRoaXMuX3Nob3duVGlwLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBUaGUgc3RvcmVkIHNjb3BlZCBjb250ZXh0IGtleSBzZXJ2aWNlIG1heSBoYXZlIGJlZW4gZGlzcG9zZWRcblx0XHRcdC8vIChlLmcuIGl0cyBvd25pbmcgY2hhdCB3aWRnZXQgd2FzIHRvcm4gZG93bikuIERyb3AgdGhlIHN0YWxlXG5cdFx0XHQvLyByZWZlcmVuY2UgYW5kIGJhaWwgb3V0IFx1MjAxNCB0aGVyZSBpcyBub3RoaW5nIG1lYW5pbmdmdWwgdG8gaGlkZS5cblx0XHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlbGlnaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaGlkZVRpcCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGlja1RpcChzb3VyY2VJZDogc3RyaW5nLCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKTogSUNoYXRUaXAgfCB1bmRlZmluZWQge1xuXHRcdHRoaXMuX2NyZWF0ZVNsYXNoQ29tbWFuZHNVc2FnZVRyYWNrZXIuc3luY0NvbnRleHRLZXkoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdC8vIFJlY29yZCB0aGUgY3VycmVudCBtb2RlIGZvciBmdXR1cmUgZWxpZ2liaWxpdHkgZGVjaXNpb25zLlxuXHRcdHRoaXMuX3RyYWNrZXIucmVjb3JkQ3VycmVudE1vZGUoY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZGlzbWlzc2VkSWRzID0gbmV3IFNldCh0aGlzLl9nZXREaXNtaXNzZWRUaXBJZHMoKSk7XG5cdFx0Y29uc3QgZWxpZ2libGVUaXBzID0gVElQX0NBVEFMT0cuZmlsdGVyKHRpcCA9PiAhZGlzbWlzc2VkSWRzLmhhcyh0aXAuaWQpICYmIHRoaXMuX2lzRWxpZ2libGUodGlwLCBjb250ZXh0S2V5U2VydmljZSkpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0ZWRUaXAgPSB0aGlzLl9zZWxlY3RUaXBCeVRpZXIoZWxpZ2libGVUaXBzKTtcblxuXHRcdGlmICghc2VsZWN0ZWRUaXApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gUGVyc2lzdCB0aGUgc2VsZWN0ZWQgdGlwIElEIGZvciBjb21wYXRpYmlsaXR5IHdpdGggZXhpc3Rpbmcgc3RvcmFnZSBjb25zdW1lcnMuXG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2hhdFRpcFN0b3JhZ2VLZXlzLkxhc3RUaXBJZCwgc2VsZWN0ZWRUaXAuaWQsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdC8vIFJlY29yZCB0aGF0IHdlJ3ZlIHNob3duIGEgdGlwIHRoaXMgc2Vzc2lvblxuXHRcdHRoaXMuX3RpcFJlcXVlc3RJZCA9IHNvdXJjZUlkO1xuXHRcdHRoaXMuX3Nob3duVGlwID0gc2VsZWN0ZWRUaXA7XG5cblx0XHR0aGlzLl9sb2dUaXBUZWxlbWV0cnkoc2VsZWN0ZWRUaXAuaWQsICdzaG93bicpO1xuXHRcdHRoaXMuX3RyYWNrVGlwQ29tbWFuZENsaWNrcyhzZWxlY3RlZFRpcCk7XG5cblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlVGlwKHNlbGVjdGVkVGlwKTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbGVjdFRpcEJ5VGllcihlbGlnaWJsZVRpcHM6IHJlYWRvbmx5IElUaXBEZWZpbml0aW9uW10pOiBJVGlwRGVmaW5pdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZm91bmRhdGlvbmFsVGlwcyA9IGVsaWdpYmxlVGlwcy5maWx0ZXIodGlwID0+IHRpcC50aWVyID09PSBDaGF0VGlwVGllci5Gb3VuZGF0aW9uYWwpO1xuXHRcdGlmIChmb3VuZGF0aW9uYWxUaXBzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NvcnRCeVByaW9yaXR5QW5kQ2F0YWxvZ09yZGVyKGZvdW5kYXRpb25hbFRpcHMpWzBdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHFvbFRpcHMgPSBlbGlnaWJsZVRpcHMuZmlsdGVyKHRpcCA9PiB0aXAudGllciA9PT0gQ2hhdFRpcFRpZXIuUW9sKTtcblx0XHRpZiAoIXFvbFRpcHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhbmRvbUluZGV4ID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogcW9sVGlwcy5sZW5ndGgpO1xuXHRcdHJldHVybiBxb2xUaXBzW3JhbmRvbUluZGV4XTtcblx0fVxuXG5cdG5hdmlnYXRlVG9OZXh0VGlwKCk6IElDaGF0VGlwIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbmF2aWdhdGVUaXAoMSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0bmF2aWdhdGVUb1ByZXZpb3VzVGlwKCk6IElDaGF0VGlwIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbmF2aWdhdGVUaXAoLTEsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdGdldE5leHRFbGlnaWJsZVRpcCgpOiBJQ2hhdFRpcCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9jb250ZXh0S2V5U2VydmljZSB8fCAhdGhpcy5fc2hvd25UaXApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9jb250ZXh0S2V5U2VydmljZTtcblx0XHR0aGlzLl9jcmVhdGVTbGFzaENvbW1hbmRzVXNhZ2VUcmFja2VyLnN5bmNDb250ZXh0S2V5KGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBjdXJyZW50VGlwSWQgPSB0aGlzLl9zaG93blRpcC5pZDtcblx0XHRjb25zdCBvcmRlcmVkVGlwcyA9IHRoaXMuX2dldE9yZGVyZWRFbGlnaWJsZVRpcHMoY29udGV4dEtleVNlcnZpY2UsIHsgaW5jbHVkZVRpcElkOiBjdXJyZW50VGlwSWQgfSk7XG5cdFx0aWYgKCFvcmRlcmVkVGlwcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudEluZGV4ID0gb3JkZXJlZFRpcHMuZmluZEluZGV4KHRpcCA9PiB0aXAuaWQgPT09IGN1cnJlbnRUaXBJZCk7XG5cdFx0Y29uc3QgY2FuZGlkYXRlID0gdGhpcy5fZ2V0TmV4dFRpcEZyb21PcmRlcmVkTGlzdChvcmRlcmVkVGlwcywgY3VycmVudEluZGV4LCBjdXJyZW50VGlwSWQpO1xuXHRcdGlmIChjYW5kaWRhdGUpIHtcblx0XHRcdC8vIEZvdW5kIHRoZSBuZXh0IGVsaWdpYmxlIHRpcCAtIHVwZGF0ZSBzdGF0ZSBhbmQgcmV0dXJuIGl0XG5cdFx0XHR0aGlzLl9zaG93blRpcCA9IGNhbmRpZGF0ZTtcblx0XHRcdHRoaXMuX3RpcFJlcXVlc3RJZCA9ICd3ZWxjb21lJztcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKENoYXRUaXBTdG9yYWdlS2V5cy5MYXN0VGlwSWQsIGNhbmRpZGF0ZS5pZCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0dGhpcy5fbG9nVGlwVGVsZW1ldHJ5KGNhbmRpZGF0ZS5pZCwgJ3Nob3duJyk7XG5cdFx0XHR0aGlzLl90cmFja1RpcENvbW1hbmRDbGlja3MoY2FuZGlkYXRlKTtcblx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVUaXAoY2FuZGlkYXRlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TmV4dFRpcEZyb21PcmRlcmVkTGlzdChvcmRlcmVkVGlwczogcmVhZG9ubHkgSVRpcERlZmluaXRpb25bXSwgc3RhcnRJbmRleDogbnVtYmVyLCBjdXJyZW50VGlwSWQ6IHN0cmluZyk6IElUaXBEZWZpbml0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIW9yZGVyZWRUaXBzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBmYWxsYmFja0luZGV4ID0gMDtcblx0XHRjb25zdCBub3JtYWxpemVkU3RhcnRJbmRleCA9IHN0YXJ0SW5kZXggPT09IC0xID8gZmFsbGJhY2tJbmRleCA6IHN0YXJ0SW5kZXg7XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPD0gb3JkZXJlZFRpcHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gKG5vcm1hbGl6ZWRTdGFydEluZGV4ICsgaSkgJSBvcmRlcmVkVGlwcy5sZW5ndGg7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGUgPSBvcmRlcmVkVGlwc1tpbmRleF07XG5cdFx0XHRpZiAoY2FuZGlkYXRlLmlkICE9PSBjdXJyZW50VGlwSWQpIHtcblx0XHRcdFx0cmV0dXJuIGNhbmRpZGF0ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0aGFzTXVsdGlwbGVUaXBzKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fY29udGV4dEtleVNlcnZpY2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9jcmVhdGVTbGFzaENvbW1hbmRzVXNhZ2VUcmFja2VyLnN5bmNDb250ZXh0S2V5KHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRyZXR1cm4gdGhpcy5faGFzTmF2aWdhYmxlVGlwKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgX25hdmlnYXRlVGlwKGRpcmVjdGlvbjogMSB8IC0xLCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKTogSUNoYXRUaXAgfCB1bmRlZmluZWQge1xuXHRcdHRoaXMuX2NyZWF0ZVNsYXNoQ29tbWFuZHNVc2FnZVRyYWNrZXIuc3luY0NvbnRleHRLZXkoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlmICghdGhpcy5fc2hvd25UaXApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG9yZGVyZWRUaXBzID0gdGhpcy5fZ2V0T3JkZXJlZEVsaWdpYmxlVGlwcyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aWYgKCFvcmRlcmVkVGlwcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudEluZGV4ID0gb3JkZXJlZFRpcHMuZmluZEluZGV4KHRpcCA9PiB0aXAuaWQgPT09IHRoaXMuX3Nob3duVGlwIS5pZCk7XG5cdFx0aWYgKG9yZGVyZWRUaXBzLmxlbmd0aCA9PT0gMSAmJiBjdXJyZW50SW5kZXggIT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZhbGxiYWNrSW5kZXggPSBkaXJlY3Rpb24gPT09IDEgPyAwIDogb3JkZXJlZFRpcHMubGVuZ3RoIC0gMTtcblx0XHRjb25zdCBuZXh0SW5kZXggPSBjdXJyZW50SW5kZXggPT09IC0xXG5cdFx0XHQ/IGZhbGxiYWNrSW5kZXhcblx0XHRcdDogKGN1cnJlbnRJbmRleCArIGRpcmVjdGlvbiArIG9yZGVyZWRUaXBzLmxlbmd0aCkgJSBvcmRlcmVkVGlwcy5sZW5ndGg7XG5cdFx0Y29uc3QgY2FuZGlkYXRlID0gb3JkZXJlZFRpcHNbbmV4dEluZGV4XTtcblx0XHRpZiAoY2FuZGlkYXRlKSB7XG5cdFx0XHR0aGlzLl9sb2dUaXBUZWxlbWV0cnkodGhpcy5fc2hvd25UaXAuaWQsIGRpcmVjdGlvbiA9PT0gMSA/ICduYXZpZ2F0ZU5leHQnIDogJ25hdmlnYXRlUHJldmlvdXMnKTtcblx0XHRcdHRoaXMuX3Nob3duVGlwID0gY2FuZGlkYXRlO1xuXHRcdFx0dGhpcy5fdGlwUmVxdWVzdElkID0gJ3dlbGNvbWUnO1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2hhdFRpcFN0b3JhZ2VLZXlzLkxhc3RUaXBJZCwgY2FuZGlkYXRlLmlkLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHR0aGlzLl9sb2dUaXBUZWxlbWV0cnkoY2FuZGlkYXRlLmlkLCAnc2hvd24nKTtcblx0XHRcdHRoaXMuX3RyYWNrVGlwQ29tbWFuZENsaWNrcyhjYW5kaWRhdGUpO1xuXHRcdFx0Y29uc3QgdGlwID0gdGhpcy5fY3JlYXRlVGlwKGNhbmRpZGF0ZSk7XG5cdFx0XHR0aGlzLl9vbkRpZE5hdmlnYXRlVGlwLmZpcmUodGlwKTtcblx0XHRcdHJldHVybiB0aXA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2hhc05hdmlnYWJsZVRpcChjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgb3JkZXJlZFRpcHMgPSB0aGlzLl9nZXRPcmRlcmVkRWxpZ2libGVUaXBzKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAoIW9yZGVyZWRUaXBzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fc2hvd25UaXApIHtcblx0XHRcdHJldHVybiBvcmRlcmVkVGlwcy5sZW5ndGggPiAxO1xuXHRcdH1cblxuXHRcdGlmIChvcmRlcmVkVGlwcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3JkZXJlZFRpcHNbMF0uaWQgIT09IHRoaXMuX3Nob3duVGlwLmlkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3JkZXJlZEVsaWdpYmxlVGlwcyhjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLCBvcHRpb25zPzogeyBleGNsdWRlU2hvd25UaXA/OiBib29sZWFuOyBpbmNsdWRlVGlwSWQ/OiBzdHJpbmcgfSk6IElUaXBEZWZpbml0aW9uW10ge1xuXHRcdGNvbnN0IGRpc21pc3NlZElkcyA9IG5ldyBTZXQodGhpcy5fZ2V0RGlzbWlzc2VkVGlwSWRzKCkpO1xuXHRcdGNvbnN0IGVsaWdpYmxlVGlwcyA9IFRJUF9DQVRBTE9HLmZpbHRlcih0aXAgPT4ge1xuXHRcdFx0aWYgKG9wdGlvbnM/LmluY2x1ZGVUaXBJZCAmJiB0aXAuaWQgPT09IG9wdGlvbnMuaW5jbHVkZVRpcElkKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG9wdGlvbnM/LmV4Y2x1ZGVTaG93blRpcCAmJiB0aGlzLl9zaG93blRpcCAmJiB0aXAuaWQgPT09IHRoaXMuX3Nob3duVGlwLmlkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiAhZGlzbWlzc2VkSWRzLmhhcyh0aXAuaWQpICYmIHRoaXMuX2lzRWxpZ2libGUodGlwLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBmb3VuZGF0aW9uYWxUaXBzID0gdGhpcy5fc29ydEJ5UHJpb3JpdHlBbmRDYXRhbG9nT3JkZXIoZWxpZ2libGVUaXBzLmZpbHRlcih0aXAgPT4gdGlwLnRpZXIgPT09IENoYXRUaXBUaWVyLkZvdW5kYXRpb25hbCkpO1xuXHRcdGNvbnN0IHFvbFRpcHMgPSB0aGlzLl9zb3J0QnlQcmlvcml0eUFuZENhdGFsb2dPcmRlcihlbGlnaWJsZVRpcHMuZmlsdGVyKHRpcCA9PiB0aXAudGllciA9PT0gQ2hhdFRpcFRpZXIuUW9sKSk7XG5cdFx0cmV0dXJuIFsuLi5mb3VuZGF0aW9uYWxUaXBzLCAuLi5xb2xUaXBzXTtcblx0fVxuXG5cdHByaXZhdGUgX3NvcnRCeVByaW9yaXR5QW5kQ2F0YWxvZ09yZGVyKHRpcHM6IHJlYWRvbmx5IElUaXBEZWZpbml0aW9uW10pOiBJVGlwRGVmaW5pdGlvbltdIHtcblx0XHRyZXR1cm4gWy4uLnRpcHNdLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGNvbnN0IGFQcmlvcml0eSA9IGEucHJpb3JpdHkgPz8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHRcdFx0Y29uc3QgYlByaW9yaXR5ID0gYi5wcmlvcml0eSA/PyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cdFx0XHRpZiAoYVByaW9yaXR5ICE9PSBiUHJpb3JpdHkpIHtcblx0XHRcdFx0cmV0dXJuIGFQcmlvcml0eSAtIGJQcmlvcml0eTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYUNhdGFsb2dJbmRleCA9IFRJUF9DQVRBTE9HLmZpbmRJbmRleCh0aXAgPT4gdGlwLmlkID09PSBhLmlkKTtcblx0XHRcdGNvbnN0IGJDYXRhbG9nSW5kZXggPSBUSVBfQ0FUQUxPRy5maW5kSW5kZXgodGlwID0+IHRpcC5pZCA9PT0gYi5pZCk7XG5cdFx0XHRyZXR1cm4gYUNhdGFsb2dJbmRleCAtIGJDYXRhbG9nSW5kZXg7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0VsaWdpYmxlKHRpcDogSVRpcERlZmluaXRpb24sIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBib29sZWFuIHtcblx0XHRpZiAodGlwLm9ubHlXaGVuTW9kZWxJZHM/Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgY3VycmVudE1vZGVsSWQgPSB0aGlzLl9nZXRDdXJyZW50Q2hhdE1vZGVsSWQoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgaXNNb2RlbE1hdGNoID0gdGlwLm9ubHlXaGVuTW9kZWxJZHMuc29tZShtb2RlbElkID0+IGN1cnJlbnRNb2RlbElkID09PSBtb2RlbElkIHx8IGN1cnJlbnRNb2RlbElkLnN0YXJ0c1dpdGgoYCR7bW9kZWxJZH0tYCkpO1xuXHRcdFx0aWYgKCFpc01vZGVsTWF0Y2gpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGlwLmV4Y2x1ZGVXaGVuU2V0dGluZ3NDaGFuZ2VkPy5zb21lKHNldHRpbmcgPT4gdGhpcy5faXNTZXR0aW5nTW9kaWZpZWQoc2V0dGluZykpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCcjQ2hhdFRpcHM6IHRpcCBleGNsdWRlZCBiZWNhdXNlIHNldHRpbmcgd2FzIG1vZGlmaWVkJywgdGlwLmlkLCB0aXAuZXhjbHVkZVdoZW5TZXR0aW5nc0NoYW5nZWQpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGlwLndoZW4gJiYgIWNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXModGlwLndoZW4pKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCcjQ2hhdFRpcHM6IHRpcCBpcyBub3QgZWxpZ2libGUgZHVlIHRvIHdoZW4gY2xhdXNlJywgdGlwLmlkLCB0aXAud2hlbi5zZXJpYWxpemUoKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl90cmFja2VyLmlzRXhjbHVkZWQodGlwKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGlwLmlkID09PSAndGlwLnRoaW5raW5nUGhyYXNlcycgJiYgdGhpcy5fdGhpbmtpbmdQaHJhc2VzRXZlck1vZGlmaWVkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCcjQ2hhdFRpcHM6IHRpcCBleGNsdWRlZCBiZWNhdXNlIHRoaW5raW5nIHBocmFzZXMgc2V0dGluZyB3YXMgcHJldmlvdXNseSBtb2RpZmllZCcsIHRpcC5pZCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fYXJlVGlwQ29tbWFuZHNSZWdpc3RlcmVkKHRpcCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnI0NoYXRUaXBzOiB0aXAgaXMgZWxpZ2libGUnLCB0aXAuaWQpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXJlVGlwQ29tbWFuZHNSZWdpc3RlcmVkKHRpcDogSVRpcERlZmluaXRpb24pOiBib29sZWFuIHtcblx0XHRjb25zdCBjdHg6IElUaXBCdWlsZENvbnRleHQgPSB7IGtleWJpbmRpbmdTZXJ2aWNlOiB0aGlzLl9rZXliaW5kaW5nU2VydmljZSwgZXhwZXJpbWVudGFsVGlwTWVzc2FnZXM6IHRoaXMuX2V4cGVyaW1lbnRhbFRpcE1lc3NhZ2VzIH07XG5cdFx0Y29uc3QgcmF3TWVzc2FnZSA9IHRpcC5idWlsZE1lc3NhZ2UoY3R4KTtcblx0XHRjb25zdCBjb21tYW5kSWRzID0gZXh0cmFjdENvbW1hbmRJZHMocmF3TWVzc2FnZS52YWx1ZSk7XG5cdFx0Zm9yIChjb25zdCBjb21tYW5kSWQgb2YgY29tbWFuZElkcykge1xuXHRcdFx0aWYgKCFDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoY29tbWFuZElkKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCcjQ2hhdFRpcHM6IHRpcCBleGNsdWRlZCBiZWNhdXNlIGNvbW1hbmQgaXMgbm90IHJlZ2lzdGVyZWQnLCB0aXAuaWQsIGNvbW1hbmRJZCk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9pc1NldHRpbmdNb2RpZmllZChrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGluc3BlY3RlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Qoa2V5KTtcblx0XHRyZXR1cm4gaW5zcGVjdGVkLnVzZXJWYWx1ZSAhPT0gdW5kZWZpbmVkXG5cdFx0XHR8fCBpbnNwZWN0ZWQudXNlckxvY2FsVmFsdWUgIT09IHVuZGVmaW5lZFxuXHRcdFx0fHwgaW5zcGVjdGVkLnVzZXJSZW1vdGVWYWx1ZSAhPT0gdW5kZWZpbmVkXG5cdFx0XHR8fCBpbnNwZWN0ZWQud29ya3NwYWNlVmFsdWUgIT09IHVuZGVmaW5lZFxuXHRcdFx0fHwgaW5zcGVjdGVkLndvcmtzcGFjZUZvbGRlclZhbHVlICE9PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDdXJyZW50Q2hhdE1vZGVsSWQoY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplID0gKG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyA9PiB7XG5cdFx0XHRjb25zdCBub3JtYWxpemVkTW9kZWxJZCA9IG1vZGVsSWQ/LnRvTG93ZXJDYXNlKCkgPz8gJyc7XG5cdFx0XHRpZiAoIW5vcm1hbGl6ZWRNb2RlbElkKSB7XG5cdFx0XHRcdHJldHVybiAnJztcblx0XHRcdH1cblxuXHRcdFx0aWYgKG5vcm1hbGl6ZWRNb2RlbElkLmluY2x1ZGVzKCcvJykpIHtcblx0XHRcdFx0cmV0dXJuIG5vcm1hbGl6ZWRNb2RlbElkLnNwbGl0KCcvJykuYXQoLTEpID8/ICcnO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbm9ybWFsaXplZE1vZGVsSWQ7XG5cdFx0fTtcblxuXHRcdHJldHVybiBub3JtYWxpemUoZ2V0U2VsZWN0ZWRNb2RlbElkZW50aWZpZXIoY29udGV4dEtleVNlcnZpY2UsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0NoYXRMb2NhdGlvbihjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Q2hhdEFnZW50TG9jYXRpb24+KENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5rZXkpO1xuXHRcdHJldHVybiAhbG9jYXRpb24gfHwgbG9jYXRpb24gPT09IENoYXRBZ2VudExvY2F0aW9uLkNoYXQ7XG5cdH1cblxuXHRwcml2YXRlIF9pc0NoYXRRdW90YUV4Y2VlZGVkKGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPGJvb2xlYW4+KENoYXRDb250ZXh0S2V5cy5jaGF0UXVvdGFFeGNlZWRlZC5rZXkpID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNDb3BpbG90RW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBkZWZhdWx0Q2hhdEFnZW50ID0gdGhpcy5fcHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudDtcblx0XHRyZXR1cm4gISFkZWZhdWx0Q2hhdEFnZW50Py5jaGF0RXh0ZW5zaW9uSWQ7XG5cdH1cblxuXHRwcml2YXRlIF9mZXRjaEV4cGVyaW1lbnRhbFRpcE1lc3NhZ2VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Fzc2lnbm1lbnRTZXJ2aWNlLmdldFRyZWF0bWVudDxzdHJpbmc+KENoYXRUaXBFeHBlcmltZW50Lk9wZW5BZ2VudHNXaW5kb3dUaXApLnRoZW4odmFsdWUgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9leHBlcmltZW50YWxUaXBNZXNzYWdlcy5zZXQoQ2hhdFRpcEV4cGVyaW1lbnQuT3BlbkFnZW50c1dpbmRvd1RpcCwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlVGlwKHRpcERlZjogSVRpcERlZmluaXRpb24pOiBJQ2hhdFRpcCB7XG5cdFx0Ly8gQnVpbGQgdGhlIHRpcCBtZXNzYWdlIHdpdGggZHluYW1pYyBrZXliaW5kaW5ncyBhbmQgY29tbWFuZCBsYWJlbHNcblx0XHRjb25zdCBjdHg6IElUaXBCdWlsZENvbnRleHQgPSB7IGtleWJpbmRpbmdTZXJ2aWNlOiB0aGlzLl9rZXliaW5kaW5nU2VydmljZSwgZXhwZXJpbWVudGFsVGlwTWVzc2FnZXM6IHRoaXMuX2V4cGVyaW1lbnRhbFRpcE1lc3NhZ2VzIH07XG5cdFx0Y29uc3QgcmF3TWVzc2FnZSA9IHRpcERlZi5idWlsZE1lc3NhZ2UoY3R4KTtcblxuXHRcdC8vIEFkZCBcIlRpcDpcIiBwcmVmaXggb25jZSBoZXJlLCBhdm9pZGluZyBkdXBsaWNhdGlvbiBpbiBpbmRpdmlkdWFsIHRpcCBkZWZpbml0aW9uc1xuXHRcdGNvbnN0IHByZWZpeGVkTWVzc2FnZSA9IGxvY2FsaXplKCd0aXBQcmVmaXgnLCBcIioqVGlwOioqIHswfVwiLCByYXdNZXNzYWdlLnZhbHVlKTtcblxuXHRcdC8vIEF1dG8tZXh0cmFjdCBlbmFibGVkIGNvbW1hbmRzIGZyb20gdGhlIGJ1aWx0IG1lc3NhZ2Vcblx0XHRjb25zdCBlbmFibGVkQ29tbWFuZHMgPSBleHRyYWN0Q29tbWFuZElkcyhwcmVmaXhlZE1lc3NhZ2UpO1xuXG5cdFx0Y29uc3QgbWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcocHJlZml4ZWRNZXNzYWdlLCB7XG5cdFx0XHRpc1RydXN0ZWQ6IGVuYWJsZWRDb21tYW5kcy5sZW5ndGggPiAwID8geyBlbmFibGVkQ29tbWFuZHMgfSA6IGZhbHNlLFxuXHRcdH0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogdGlwRGVmLmlkLFxuXHRcdFx0Y29udGVudDogbWFya2Rvd24sXG5cdFx0XHRlbmFibGVkQ29tbWFuZHMsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2xvZ1RpcFRlbGVtZXRyeSh0aXBJZDogc3RyaW5nLCBhY3Rpb246IHN0cmluZywgY29tbWFuZElkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRUaXBFdmVudCwgQ2hhdFRpcENsYXNzaWZpY2F0aW9uPignY2hhdFRpcCcsIHtcblx0XHRcdHRpcElkLFxuXHRcdFx0YWN0aW9uLFxuXHRcdFx0Y29tbWFuZElkLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJhY2tUaXBDb21tYW5kQ2xpY2tzKHRpcDogSVRpcERlZmluaXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl90aXBDb21tYW5kTGlzdGVuZXIuY2xlYXIoKTtcblxuXHRcdC8vIEJ1aWxkIG1lc3NhZ2UgdG8gZXh0cmFjdCBlbmFibGVkIGNvbW1hbmRzIGR5bmFtaWNhbGx5XG5cdFx0Y29uc3QgY3R4OiBJVGlwQnVpbGRDb250ZXh0ID0geyBrZXliaW5kaW5nU2VydmljZTogdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsIGV4cGVyaW1lbnRhbFRpcE1lc3NhZ2VzOiB0aGlzLl9leHBlcmltZW50YWxUaXBNZXNzYWdlcyB9O1xuXHRcdGNvbnN0IHJhd01lc3NhZ2UgPSB0aXAuYnVpbGRNZXNzYWdlKGN0eCk7XG5cdFx0Y29uc3QgZW5hYmxlZENvbW1hbmRzID0gZXh0cmFjdENvbW1hbmRJZHMocmF3TWVzc2FnZS52YWx1ZSk7XG5cblx0XHRpZiAoIWVuYWJsZWRDb21tYW5kcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZW5hYmxlZENvbW1hbmRTZXQgPSBuZXcgU2V0KGVuYWJsZWRDb21tYW5kcyk7XG5cdFx0dGhpcy5fdGlwQ29tbWFuZExpc3RlbmVyLnZhbHVlID0gdGhpcy5fY29tbWFuZFNlcnZpY2Uub25EaWRFeGVjdXRlQ29tbWFuZChlID0+IHtcblx0XHRcdGlmIChlbmFibGVkQ29tbWFuZFNldC5oYXMoZS5jb21tYW5kSWQpICYmIHRoaXMuX3Nob3duVGlwPy5pZCA9PT0gdGlwLmlkKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1RpcFRlbGVtZXRyeSh0aXAuaWQsICdjb21tYW5kQ2xpY2tlZCcsIGUuY29tbWFuZElkKTtcblx0XHRcdFx0dGhpcy5kaXNtaXNzVGlwRm9yU2Vzc2lvbigpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZEFwcGxpY2F0aW9uV2l0aFByb2ZpbGVGYWxsYmFjayhrZXk6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXBwbGljYXRpb25WYWx1ZSA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChrZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKGFwcGxpY2F0aW9uVmFsdWUpIHtcblx0XHRcdHJldHVybiBhcHBsaWNhdGlvblZhbHVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2ZpbGVWYWx1ZSA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChrZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRpZiAocHJvZmlsZVZhbHVlKSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShrZXksIHByb2ZpbGVWYWx1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1B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O0FBQUEsRUFFUSxvQ0FBb0MsS0FBaUM7QUFDNUUsVUFBTSxtQkFBbUIsS0FBSyxnQkFBZ0IsSUFBSSxLQUFLLGFBQWEsV0FBVztBQUMvRSxRQUFJLGtCQUFrQjtBQUNyQixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sZUFBZSxLQUFLLGdCQUFnQixJQUFJLEtBQUssYUFBYSxPQUFPO0FBQ3ZFLFFBQUksY0FBYztBQUNqQixXQUFLLGdCQUFnQixNQUFNLEtBQUssY0FBYyxhQUFhLGFBQWEsY0FBYyxPQUFPO0FBQUEsSUFDOUY7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBNXRCYSxpQkFBTjtBQUFBLEVBeUNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBbkRVOyIsCiAgIm5hbWVzIjogWyJUaXBFbGlnaWJpbGl0eVRyYWNrZXIiLCAidGlwIl0KfQo=
