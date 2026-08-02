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
import "../../chat/browser/voiceClient/micCaptureService.js";
import "../../chat/browser/voiceClient/ttsPlaybackService.js";
import "../../chat/browser/voiceClient/voiceClientService.js";
import { IVoiceSessionController } from "../../chat/browser/voiceClient/voiceSessionController.js";
import { VOICE_AGENT_PROGRESS_SETTING } from "../../chat/common/voiceClient/voiceClientService.js";
import "../../chat/browser/voiceClient/voiceToolDispatchService.js";
import "../../chat/common/voicePlaybackService.js";
import "../common/voiceTranscriptStore.js";
import "./transcriptsView/voiceTranscripts.contribution.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import * as nls from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { SegmentedVoiceInputModePillInactive } from "../../chat/browser/voiceInputMode/voiceInputModeContextKeys.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { Extensions as WorkbenchConfigurationExtensions } from "../../../common/configuration.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { AgentsVoiceStorageKeys, AGENTS_VOICE_CONNECTED, AGENTS_VOICE_CONNECTING, AGENTS_VOICE_LISTENING } from "../common/agentsVoice.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { ChatAgentLocation } from "../../chat/common/constants.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID } from "../../chat/browser/actions/configureVoiceInstructionsAction.js";
import { IVoiceModeOnboardingService } from "./voiceModeOnboarding.js";
import { SHOW_VOICE_MODE_ONBOARDING_COMMAND } from "../../chat/browser/speechToText/micButtonMenuActions.js";
const AGENTS_VOICE_WIDGET_FOCUSED = new RawContextKey("agentsVoiceWidgetFocused", false);
let AgentsVoiceConnectedKeyContribution = class extends Disposable {
  constructor(voiceSessionController, contextKeyService) {
    super();
    const connectedKey = AGENTS_VOICE_CONNECTED.bindTo(contextKeyService);
    const connectingKey = AGENTS_VOICE_CONNECTING.bindTo(contextKeyService);
    const listeningKey = AGENTS_VOICE_LISTENING.bindTo(contextKeyService);
    this._register(autorun((reader) => {
      connectedKey.set(voiceSessionController.isConnected.read(reader));
      connectingKey.set(voiceSessionController.isConnecting.read(reader));
      listeningKey.set(voiceSessionController.voiceState.read(reader) === "listening");
    }));
  }
};
AgentsVoiceConnectedKeyContribution.ID = "workbench.contrib.agentsVoiceConnectedKey";
AgentsVoiceConnectedKeyContribution = __decorateClass([
  __decorateParam(0, IVoiceSessionController),
  __decorateParam(1, IContextKeyService)
], AgentsVoiceConnectedKeyContribution);
registerWorkbenchContribution2(AgentsVoiceConnectedKeyContribution.ID, AgentsVoiceConnectedKeyContribution, WorkbenchPhase.Eventually);
let AgentsVoiceTelemetryContribution = class extends Disposable {
  constructor(configurationService, telemetryService, storageService) {
    super();
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("agents.voice.enabled")) {
        const enabled = configurationService.getValue("agents.voice.enabled");
        if (enabled) {
          storageService.store(AgentsVoiceTelemetryContribution._ENABLED_AT_KEY, Date.now(), StorageScope.PROFILE, StorageTarget.MACHINE);
          telemetryService.publicLog2("voiceEnabled", { source: "setting" });
        } else {
          const enabledAt = storageService.getNumber(AgentsVoiceTelemetryContribution._ENABLED_AT_KEY, StorageScope.PROFILE, 0);
          const daysActive = enabledAt ? Math.round((Date.now() - enabledAt) / (1e3 * 60 * 60 * 24)) : 0;
          telemetryService.publicLog2("voiceDisabled", { daysActive });
          storageService.remove(AgentsVoiceTelemetryContribution._ENABLED_AT_KEY, StorageScope.PROFILE);
        }
      }
    }));
  }
};
AgentsVoiceTelemetryContribution.ID = "workbench.contrib.agentsVoiceTelemetry";
AgentsVoiceTelemetryContribution._ENABLED_AT_KEY = "agents.voice.enabledAtMs";
AgentsVoiceTelemetryContribution = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IStorageService)
], AgentsVoiceTelemetryContribution);
registerWorkbenchContribution2(AgentsVoiceTelemetryContribution.ID, AgentsVoiceTelemetryContribution, WorkbenchPhase.AfterRestored);
let AgentsVoiceOnboardingContribution = class extends Disposable {
  constructor(voiceSessionController, voiceModeOnboardingService) {
    super();
    this._register(autorun((reader) => {
      if (voiceSessionController.isConnecting.read(reader) || voiceSessionController.isConnected.read(reader)) {
        voiceModeOnboardingService.showIfNeeded();
      }
    }));
  }
};
AgentsVoiceOnboardingContribution.ID = "workbench.contrib.agentsVoiceOnboarding";
AgentsVoiceOnboardingContribution = __decorateClass([
  __decorateParam(0, IVoiceSessionController),
  __decorateParam(1, IVoiceModeOnboardingService)
], AgentsVoiceOnboardingContribution);
registerWorkbenchContribution2(AgentsVoiceOnboardingContribution.ID, AgentsVoiceOnboardingContribution, WorkbenchPhase.Eventually);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.connecting",
      title: nls.localize2("agentsVoice.connecting", "Connecting..."),
      icon: Codicon.loadingCompact,
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals("config.agents.voice.enabled", true),
        AGENTS_VOICE_CONNECTING.isEqualTo(true)
      ),
      menu: {
        id: MenuId.ChatExecute,
        when: ContextKeyExpr.and(
          SegmentedVoiceInputModePillInactive,
          ContextKeyExpr.equals("config.agents.voice.enabled", true),
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
          AGENTS_VOICE_CONNECTING.isEqualTo(true)
        ),
        group: "navigation",
        order: -10
      }
    });
  }
  async run() {
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.startVoiceInChat",
      title: nls.localize2("agentsVoice.startVoiceInChat", "Voice Mode"),
      icon: Codicon.voiceModeCompact,
      precondition: ContextKeyExpr.equals("config.agents.voice.enabled", true),
      menu: {
        id: MenuId.ChatExecute,
        when: ContextKeyExpr.and(
          SegmentedVoiceInputModePillInactive,
          ContextKeyExpr.equals("config.agents.voice.enabled", true),
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
          ChatContextKeys.currentlyEditing.negate(),
          AGENTS_VOICE_LISTENING.negate(),
          AGENTS_VOICE_CONNECTING.negate(),
          // Hide Voice Mode while dictation is active (recording or the
          // model is loading) so the two mic affordances never compete.
          ChatContextKeys.speechToTextRecording.negate(),
          ChatContextKeys.speechToTextPreparing.negate()
        ),
        group: "navigation",
        order: -10
      },
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space,
        when: ContextKeyExpr.and(
          SegmentedVoiceInputModePillInactive,
          ContextKeyExpr.equals("config.agents.voice.enabled", true),
          ChatContextKeys.inChatInput
        )
      }
    });
  }
  async run(accessor) {
    const voiceController = accessor.get(IVoiceSessionController);
    const keybindingService = accessor.get(IKeybindingService);
    const handsFree = accessor.get(IConfigurationService).getValue("agents.voice.handsFree") === true;
    const holdMode = keybindingService.enableKeybindingHoldMode("agentsVoice.startVoiceInChat");
    const wasConnected = voiceController.isConnected.get();
    if (!wasConnected) {
      await voiceController.connect(mainWindow);
    }
    if (!holdMode && !handsFree && !wasConnected) {
      return;
    }
    voiceController.pttDown();
    if (!holdMode) {
      voiceController.pttUp();
      return;
    }
    await holdMode;
    voiceController.pttUp();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.pttStopInChat",
      title: nls.localize2("agentsVoice.pttStopInChat", "Voice Mode: Stop Recording"),
      icon: Codicon.voiceModeCompact,
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals("config.agents.voice.enabled", true),
        AGENTS_VOICE_LISTENING.isEqualTo(true)
      ),
      menu: {
        id: MenuId.ChatExecute,
        when: ContextKeyExpr.and(
          SegmentedVoiceInputModePillInactive,
          ContextKeyExpr.equals("config.agents.voice.enabled", true),
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
          ChatContextKeys.currentlyEditing.negate(),
          AGENTS_VOICE_LISTENING.isEqualTo(true)
        ),
        group: "navigation",
        order: -10
      }
      // NOTE: intentionally no keybinding. The Cmd+Shift+Space chord is
      // owned solely by `agentsVoice.startVoiceInChat`, which handles both
      // starting and stopping (via the controller's push-to-talk model).
      // Binding the same chord here as well caused the two actions to
      // fight on every OS key-repeat, producing rapid start/stop toggling.
    });
  }
  async run(accessor) {
    const voiceController = accessor.get(IVoiceSessionController);
    voiceController.stopListening();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.disconnect",
      title: nls.localize2("agentsVoice.disconnect", "Disconnect Voice Mode"),
      icon: Codicon.debugDisconnectCompact,
      f1: true,
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals("config.agents.voice.enabled", true),
        AGENTS_VOICE_CONNECTED.isEqualTo(true)
      ),
      menu: {
        id: MenuId.ChatExecute,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("config.agents.voice.enabled", true),
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
          ChatContextKeys.currentlyEditing.negate(),
          AGENTS_VOICE_CONNECTED.isEqualTo(true),
          // The segmented voice pill's voice cell is itself the on/off toggle,
          // so a separate disconnect button would be redundant there.
          SegmentedVoiceInputModePillInactive
        ),
        group: "navigation",
        order: -9
      },
      keybinding: {
        // Keep this below the editor widgets and negate their contexts so
        // Escape still dismisses IntelliSense/hover and clears selections
        // while the user is typing in the chat input.
        weight: KeybindingWeight.EditorContrib - 5,
        primary: KeyCode.Escape,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("config.agents.voice.enabled", true),
          ChatContextKeys.inChatInput,
          AGENTS_VOICE_CONNECTED.isEqualTo(true),
          // Don't disconnect voice while a request is running — pressing
          // Escape there is meant to interrupt/cancel that request, not
          // tear down the voice session (which is especially disruptive
          // in hands-free mode where there is no reconnect button).
          ChatContextKeys.hasActiveRequest.negate(),
          EditorContextKeys.hoverVisible.toNegated(),
          EditorContextKeys.hasNonEmptySelection.toNegated(),
          EditorContextKeys.hasMultipleSelections.toNegated()
        )
      }
    });
  }
  async run(accessor) {
    const voiceController = accessor.get(IVoiceSessionController);
    voiceController.disconnect("explicit");
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.cancelActiveRequest",
      title: nls.localize2("agentsVoice.cancelActiveRequest", "Voice Mode: Cancel Request"),
      f1: false,
      keybinding: {
        weight: KeybindingWeight.EditorContrib - 5,
        primary: KeyCode.Escape,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("config.agents.voice.enabled", true),
          ChatContextKeys.inChatInput,
          AGENTS_VOICE_CONNECTED.isEqualTo(true),
          // Mirror the disconnect binding's editor negations so Escape
          // still dismisses IntelliSense/hover and clears selections first.
          ChatContextKeys.hasActiveRequest,
          EditorContextKeys.hoverVisible.toNegated(),
          EditorContextKeys.hasNonEmptySelection.toNegated(),
          EditorContextKeys.hasMultipleSelections.toNegated()
        )
      }
    });
  }
  async run(accessor) {
    await accessor.get(ICommandService).executeCommand("workbench.action.chat.cancel");
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.openSettings",
      title: nls.localize2("agentsVoice.openSettings", "Voice Mode Settings"),
      f1: true,
      precondition: ContextKeyExpr.equals("config.agents.voice.enabled", true)
    });
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    await commandService.executeCommand("workbench.action.openSettings", { query: "agents.voice" });
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SHOW_VOICE_MODE_ONBOARDING_COMMAND,
      title: nls.localize2("agentsVoice.showOnboarding", "Voice Mode: Show Introduction"),
      f1: true,
      precondition: ContextKeyExpr.equals("config.agents.voice.enabled", true)
    });
  }
  run(accessor) {
    if (!accessor.get(IVoiceModeOnboardingService).show()) {
      accessor.get(INotificationService).info(nls.localize("agentsVoice.onboardingNeedsChat", "Open a chat to see the Voice Mode introduction."));
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.simulateConnection",
      title: nls.localize2("agentsVoice.simulateConnection", "Voice: Simulate Connection (Dev)"),
      f1: true
    });
  }
  async run(accessor) {
    const voiceController = accessor.get(IVoiceSessionController);
    voiceController.simulateConnection();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.resetOnboarding",
      title: nls.localize2("resetAgentsVoiceOnboarding", "Voice: Reset Onboarding"),
      f1: true
    });
  }
  async run(accessor) {
    const storageService = accessor.get(IStorageService);
    storageService.remove(AgentsVoiceStorageKeys.OnboardingCompleted, StorageScope.PROFILE);
    storageService.remove(AgentsVoiceStorageKeys.IntroBannerShown, StorageScope.APPLICATION);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.pushToTalk",
      title: nls.localize2("agentsVoicePushToTalk", "Voice Mode: Push to Talk"),
      f1: true,
      precondition: ContextKeyExpr.equals("config.agents.voice.enabled", true),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space,
        when: ContextKeyExpr.and(
          AGENTS_VOICE_WIDGET_FOCUSED,
          ContextKeyExpr.not("inputFocus")
        )
      }
    });
  }
  async run(accessor) {
    const voiceController = accessor.get(IVoiceSessionController);
    const keybindingService = accessor.get(IKeybindingService);
    const holdMode = keybindingService.enableKeybindingHoldMode("agentsVoice.pushToTalk");
    if (!voiceController.isConnected.get() && !voiceController.isConnecting.get()) {
      await voiceController.connect(mainWindow);
    }
    if (!voiceController.isConnected.get()) {
      return;
    }
    voiceController.pttDown();
    if (!holdMode) {
      voiceController.pttUp();
      return;
    }
    await holdMode;
    voiceController.pttUp();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "agentsVoice.selectMicrophone",
      title: nls.localize2("agentsVoice.selectMicrophone", "Voice: Select Microphone"),
      f1: true,
      precondition: ContextKeyExpr.equals("config.agents.voice.enabled", true)
    });
  }
  async run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    const storageService = accessor.get(IStorageService);
    const devices = await navigator.mediaDevices.enumerateDevices();
    const seenDeviceIds = /* @__PURE__ */ new Set();
    const audioInputs = devices.filter((d) => {
      if (d.kind !== "audioinput" || d.deviceId === "default" || d.deviceId === "communications") {
        return false;
      }
      if (seenDeviceIds.has(d.deviceId)) {
        return false;
      }
      seenDeviceIds.add(d.deviceId);
      return true;
    });
    if (audioInputs.length === 0) {
      quickInputService.pick([{ label: nls.localize("noMicrophones", "No microphones found") }]);
      return;
    }
    const currentDeviceId = storageService.get(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION, "");
    const items = [];
    items.push({
      label: nls.localize("systemDefault", "System Default"),
      description: currentDeviceId === "" ? nls.localize("current", "(current)") : void 0,
      deviceId: ""
    });
    for (const d of audioInputs) {
      const label = d.label || nls.localize("unknownDevice", "Unknown Device ({0})", d.deviceId.slice(0, 8));
      items.push({
        label,
        description: d.deviceId === currentDeviceId ? nls.localize("current", "(current)") : void 0,
        deviceId: d.deviceId
      });
    }
    const picked = await quickInputService.pick(items, {
      placeHolder: nls.localize("selectMic", "Select a microphone for Voice Mode")
    });
    if (picked) {
      const selection = picked;
      if (selection.deviceId) {
        storageService.store(AgentsVoiceStorageKeys.MicrophoneDevice, selection.deviceId, StorageScope.APPLICATION, StorageTarget.MACHINE);
      } else {
        storageService.remove(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION);
      }
    }
  }
});
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  id: "agentsVoice",
  title: nls.localize("agentsVoiceConfigurationTitle", "Voice Mode"),
  type: "object",
  properties: {
    "agents.voice.enabled": {
      type: "boolean",
      description: nls.localize("agents.voice.enabled", "Enable the Voice Mode panel in the chat view for voice-driven coding conversations."),
      default: false,
      experiment: {
        mode: "auto"
      },
      tags: ["experimental"],
      scope: ConfigurationScope.APPLICATION,
      restricted: true
    },
    "agents.voice.backendUrl": {
      type: "string",
      description: nls.localize("agents.voice.backendUrl", "Voice backend WebSocket URL. Leave empty to use the default hosted backend. Set to e.g. `ws://localhost:8000/api/v1/realtime/voice` to point at a backend running on your machine."),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      included: false
    },
    "agents.voice.speakResponses": {
      type: "boolean",
      markdownDescription: nls.localize("agents.voice.speakResponses", "When enabled, the assistant reads responses aloud. When disabled, responses are not spoken; enable `#agents.voice.showTranscript#` to read them as a text transcript instead."),
      default: true,
      scope: ConfigurationScope.APPLICATION
    },
    [VOICE_AGENT_PROGRESS_SETTING]: {
      type: "boolean",
      markdownDescription: nls.localize("agents.voice.agentProgress", "Allow Agent mode to speak brief semantic progress updates while it investigates, plans, edits, validates, or recovers from a problem."),
      default: false,
      tags: ["experimental"],
      scope: ConfigurationScope.APPLICATION
    },
    "agents.voice.voice": {
      type: "string",
      enum: ["victoria_neutral", "kevin_neutral", "maya_neutral", "daniel_neutral"],
      enumItemLabels: ["Victoria", "Kevin", "Maya", "Daniel"],
      enumDescriptions: [
        nls.localize("agents.voice.voice.victoria", "Victoria."),
        nls.localize("agents.voice.voice.kevin", "Kevin."),
        nls.localize("agents.voice.voice.maya", "Maya."),
        nls.localize("agents.voice.voice.daniel", "Daniel.")
      ],
      markdownDescription: nls.localize("agents.voice.voice", "The voice used when the assistant reads responses aloud. Changing this while voice mode is connected takes effect immediately. Use [Voice Mode instructions](command:{0}) to customize Voice Mode behavior and terminology.", CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID),
      default: "maya_neutral",
      scope: ConfigurationScope.APPLICATION
    },
    "agents.voice.language": {
      type: "string",
      enum: ["auto", "en", "de", "es", "fr", "it", "pt", "ja", "ko", "zh"],
      enumItemLabels: [
        nls.localize("agents.voice.language.auto", "Automatic"),
        nls.localize("agents.voice.language.en", "English"),
        nls.localize("agents.voice.language.de", "German"),
        nls.localize("agents.voice.language.es", "Spanish"),
        nls.localize("agents.voice.language.fr", "French"),
        nls.localize("agents.voice.language.it", "Italian"),
        nls.localize("agents.voice.language.pt", "Portuguese"),
        nls.localize("agents.voice.language.ja", "Japanese"),
        nls.localize("agents.voice.language.ko", "Korean"),
        nls.localize("agents.voice.language.zh", "Chinese")
      ],
      markdownDescription: nls.localize("agents.voice.language", "The language used for speech recognition, dictation, and spoken responses. The selectable languages support native voice output. Automatic follows the system or browser locale for speech recognition and dictation, and uses English voice output when the detected language does not support native voice output. Changing this while voice mode is connected takes effect immediately."),
      default: "auto",
      scope: ConfigurationScope.APPLICATION
    },
    "agents.voice.showTranscript": {
      type: "boolean",
      markdownDescription: nls.localize("agents.voice.showTranscript", "Show the voice transcript overlay in the chat input area while voice mode is active. Enable this to read responses as text when `#agents.voice.speakResponses#` is disabled."),
      default: false,
      scope: ConfigurationScope.APPLICATION
    },
    "agents.voice.liveTranscript": {
      type: "boolean",
      markdownDescription: nls.localize("agents.voice.liveTranscript", "Show your speech as a live, word-by-word transcript while you are speaking. When disabled, your transcript appears only once you finish speaking. Requires `#agents.voice.showTranscript#` to be enabled to be visible."),
      default: false,
      scope: ConfigurationScope.APPLICATION
    },
    "agents.voice.handsFree": {
      type: "boolean",
      markdownDescription: nls.localize("agents.voice.handsFree", "When enabled, voice mode automatically re-enters listening after the assistant finishes speaking, so you can hold a hands-free back-and-forth conversation. When disabled, you start and end each turn manually, and ending the turn sends it. Turns are not ended automatically on trailing silence or a stop phrase unless {0} or {1} is explicitly configured.", "`#agents.voice.turn.silenceMs#`", "`#agents.voice.turn.stopPhrases#`"),
      default: true,
      scope: ConfigurationScope.APPLICATION
    },
    "agents.voice.turn.silenceMs": {
      type: "number",
      markdownDescription: nls.localize("agents.voice.turn.silenceMs", "Trailing silence in milliseconds before the backend ends the turn automatically. Set to `-1` to disable ending the turn on silence, in which case the turn ends only via a stop phrase ({0}) or manually. When enabled, the backend clamps this to its supported range (currently 200-5000 ms) and is the source of truth. When hands-free mode ({1}) is disabled, the turn is not ended on silence by default unless this setting is explicitly configured, so you keep manual control over when a turn is sent.", "`#agents.voice.turn.stopPhrases#`", "`#agents.voice.handsFree#`"),
      default: 800,
      anyOf: [
        {
          const: -1,
          description: nls.localize("agents.voice.turn.silenceMs.disabled", "Do not end the turn on trailing silence.")
        },
        {
          type: "number",
          minimum: 200,
          maximum: 5e3
        }
      ],
      scope: ConfigurationScope.APPLICATION
    },
    "agents.voice.turn.stopPhrases": {
      type: "array",
      items: { type: "string" },
      markdownDescription: nls.localize("agents.voice.turn.stopPhrases", "Phrases that end the turn when spoken at the end of an utterance. Leave empty to disable ending the turn on a stop phrase, in which case the turn ends only on trailing silence ({0}) or manually. The backend strips the matched phrase from the transcript before it reaches the agent. When hands-free mode ({1}) is disabled, stop phrases do not end the turn by default unless this setting is explicitly configured, so you keep manual control over when a turn is sent.", "`#agents.voice.turn.silenceMs#`", "`#agents.voice.handsFree#`"),
      default: ["send it"],
      scope: ConfigurationScope.APPLICATION
    }
  }
});
Registry.as(WorkbenchConfigurationExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "agents.voice.turn.autoEndMode",
  migrateFn: (value) => {
    const result = [["agents.voice.turn.autoEndMode", { value: void 0 }]];
    if (value === "off" || value === "vad" || value === "phrase" || value === "both") {
      const silenceEnabled = value === "vad" || value === "both";
      const phraseEnabled = value === "phrase" || value === "both";
      if (!silenceEnabled) {
        result.push(["agents.voice.turn.silenceMs", { value: -1 }]);
      }
      if (!phraseEnabled) {
        result.push(["agents.voice.turn.stopPhrases", { value: [] }]);
      }
    }
    return result;
  }
}]);
export {
  AGENTS_VOICE_WIDGET_FOCUSED
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2FnZW50c1ZvaWNlL2Jyb3dzZXIvYWdlbnRzVm9pY2UuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLy8gUmVnaXN0ZXIgdm9pY2UgY2xpZW50IHNlcnZpY2VzXG5pbXBvcnQgJy4uLy4uL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC9taWNDYXB0dXJlU2VydmljZS5qcyc7XG5pbXBvcnQgJy4uLy4uL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC90dHNQbGF5YmFja1NlcnZpY2UuanMnO1xuaW1wb3J0ICcuLi8uLi9jaGF0L2Jyb3dzZXIvdm9pY2VDbGllbnQvdm9pY2VDbGllbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWb2ljZVNlc3Npb25Db250cm9sbGVyIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgVk9JQ0VfQUdFTlRfUFJPR1JFU1NfU0VUVElORyB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL3ZvaWNlQ2xpZW50L3ZvaWNlQ2xpZW50U2VydmljZS5qcyc7XG5pbXBvcnQgJy4uLy4uL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UuanMnO1xuaW1wb3J0ICcuLi8uLi9jaGF0L2NvbW1vbi92b2ljZVBsYXliYWNrU2VydmljZS5qcyc7XG5cbi8vIFJlZ2lzdGVyIHRoZSB2b2ljZSB0cmFuc2NyaXB0IHN0b3JlIHNpbmdsZXRvblxuaW1wb3J0ICcuLi9jb21tb24vdm9pY2VUcmFuc2NyaXB0U3RvcmUuanMnO1xuXG4vLyBSZWdpc3RlciB0aGUgVm9pY2UgVHJhbnNjcmlwdHMgdmlldyArIHNob3ctY29tbWFuZCArIGNoYXQtbWVudSBlbnRyeVxuaW1wb3J0ICcuL3RyYW5zY3JpcHRzVmlldy92b2ljZVRyYW5zY3JpcHRzLmNvbnRyaWJ1dGlvbi5qcyc7XG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgQ29uZmlndXJhdGlvblNjb3BlLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNlZ21lbnRlZFZvaWNlSW5wdXRNb2RlUGlsbEluYWN0aXZlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3ZvaWNlSW5wdXRNb2RlL3ZvaWNlSW5wdXRNb2RlQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbktleVZhbHVlUGFpcnMsIElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuXG5pbXBvcnQgeyBBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLCBBR0VOVFNfVk9JQ0VfQ09OTkVDVEVELCBBR0VOVFNfVk9JQ0VfQ09OTkVDVElORywgQUdFTlRTX1ZPSUNFX0xJU1RFTklORyB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudHNWb2ljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7XG5cdFZvaWNlRW5hYmxlZENsYXNzaWZpY2F0aW9uLCBWb2ljZUVuYWJsZWRFdmVudCxcblx0Vm9pY2VEaXNhYmxlZENsYXNzaWZpY2F0aW9uLCBWb2ljZURpc2FibGVkRXZlbnQsXG59IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZVRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDT05GSUdVUkVfVk9JQ0VfSU5TVFJVQ1RJT05TX0FDVElPTl9JRCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NvbmZpZ3VyZVZvaWNlSW5zdHJ1Y3Rpb25zQWN0aW9uLmpzJztcbmltcG9ydCB7IElWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSB9IGZyb20gJy4vdm9pY2VNb2RlT25ib2FyZGluZy5qcyc7XG5pbXBvcnQgeyBTSE9XX1ZPSUNFX01PREVfT05CT0FSRElOR19DT01NQU5EIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3NwZWVjaFRvVGV4dC9taWNCdXR0b25NZW51QWN0aW9ucy5qcyc7XG5cbi8vIC0tLSBDb250ZXh0IEtleXMgLS0tXG5cbmV4cG9ydCBjb25zdCBBR0VOVFNfVk9JQ0VfV0lER0VUX0ZPQ1VTRUQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYWdlbnRzVm9pY2VXaWRnZXRGb2N1c2VkJywgZmFsc2UpO1xuXG4vLyAtLS0gQ29udGV4dCBLZXkgQmluZGluZyAtLS1cblxuLy8gU2VwYXJhdGUgY29udHJpYnV0aW9uIGZvciB2b2ljZSBjb25uZWN0ZWQgc3RhdGUgXHUyMDE0IHJ1bnMgbGF0ZXIgdG8gYXZvaWRcbi8vIGZvcmNpbmcgSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIgaW5zdGFudGlhdGlvbiB0b28gZWFybHkuXG5jbGFzcyBBZ2VudHNWb2ljZUNvbm5lY3RlZEtleUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuYWdlbnRzVm9pY2VDb25uZWN0ZWRLZXknO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciB2b2ljZVNlc3Npb25Db250cm9sbGVyOiBJVm9pY2VTZXNzaW9uQ29udHJvbGxlcixcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBjb25uZWN0ZWRLZXkgPSBBR0VOVFNfVk9JQ0VfQ09OTkVDVEVELmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgY29ubmVjdGluZ0tleSA9IEFHRU5UU19WT0lDRV9DT05ORUNUSU5HLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgbGlzdGVuaW5nS2V5ID0gQUdFTlRTX1ZPSUNFX0xJU1RFTklORy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbm5lY3RlZEtleS5zZXQodm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RlZC5yZWFkKHJlYWRlcikpO1xuXHRcdFx0Y29ubmVjdGluZ0tleS5zZXQodm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RpbmcucmVhZChyZWFkZXIpKTtcblx0XHRcdGxpc3RlbmluZ0tleS5zZXQodm9pY2VTZXNzaW9uQ29udHJvbGxlci52b2ljZVN0YXRlLnJlYWQocmVhZGVyKSA9PT0gJ2xpc3RlbmluZycpO1xuXHRcdH0pKTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQWdlbnRzVm9pY2VDb25uZWN0ZWRLZXlDb250cmlidXRpb24uSUQsIEFnZW50c1ZvaWNlQ29ubmVjdGVkS2V5Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5KTtcblxuLy8gLS0tIFRlbGVtZXRyeTogdHJhY2sgZW5hYmxlL2Rpc2FibGUgLS0tXG5cbmNsYXNzIEFnZW50c1ZvaWNlVGVsZW1ldHJ5Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuYWdlbnRzVm9pY2VUZWxlbWV0cnknO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfRU5BQkxFRF9BVF9LRVkgPSAnYWdlbnRzLnZvaWNlLmVuYWJsZWRBdE1zJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFRyYWNrIHdoZW4gdGhlIHNldHRpbmcgaXMgdG9nZ2xlZFxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdhZ2VudHMudm9pY2UuZW5hYmxlZCcpKSB7XG5cdFx0XHRcdGNvbnN0IGVuYWJsZWQgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignYWdlbnRzLnZvaWNlLmVuYWJsZWQnKTtcblx0XHRcdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShBZ2VudHNWb2ljZVRlbGVtZXRyeUNvbnRyaWJ1dGlvbi5fRU5BQkxFRF9BVF9LRVksIERhdGUubm93KCksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxWb2ljZUVuYWJsZWRFdmVudCwgVm9pY2VFbmFibGVkQ2xhc3NpZmljYXRpb24+KCd2b2ljZUVuYWJsZWQnLCB7IHNvdXJjZTogJ3NldHRpbmcnIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGVuYWJsZWRBdCA9IHN0b3JhZ2VTZXJ2aWNlLmdldE51bWJlcihBZ2VudHNWb2ljZVRlbGVtZXRyeUNvbnRyaWJ1dGlvbi5fRU5BQkxFRF9BVF9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAwKTtcblx0XHRcdFx0XHRjb25zdCBkYXlzQWN0aXZlID0gZW5hYmxlZEF0ID8gTWF0aC5yb3VuZCgoRGF0ZS5ub3coKSAtIGVuYWJsZWRBdCkgLyAoMTAwMCAqIDYwICogNjAgKiAyNCkpIDogMDtcblx0XHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Vm9pY2VEaXNhYmxlZEV2ZW50LCBWb2ljZURpc2FibGVkQ2xhc3NpZmljYXRpb24+KCd2b2ljZURpc2FibGVkJywgeyBkYXlzQWN0aXZlIH0pO1xuXHRcdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShBZ2VudHNWb2ljZVRlbGVtZXRyeUNvbnRyaWJ1dGlvbi5fRU5BQkxFRF9BVF9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQWdlbnRzVm9pY2VUZWxlbWV0cnlDb250cmlidXRpb24uSUQsIEFnZW50c1ZvaWNlVGVsZW1ldHJ5Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcblxuLy8gLS0tIEZpcnN0LXJ1biBpbnRyb2R1Y3Rpb24gLS0tXG5cbi8qKlxuICogU2hvd3MgdGhlIFZvaWNlIE1vZGUgaW50cm9kdWN0aW9uIHRoZSBmaXJzdCB0aW1lIGEgc2Vzc2lvbiBzdGFydHMuIFRoaXNcbiAqIHdhdGNoZXMgdGhlIGNvbm5lY3Rpb24gc3RhdGUgcmF0aGVyIHRoYW4gYW55IG9uZSBlbnRyeSBwb2ludCwgYmVjYXVzZSBWb2ljZVxuICogTW9kZSBjYW4gYmUgc3RhcnRlZCBmcm9tIHRoZSBpbnB1dC1tb2RlIHBpbGwsIGEgY29tbWFuZCwgYSBrZXliaW5kaW5nIG9yIHRoZVxuICogQWdlbnRzIHdpbmRvdyAtIGFsbCBvZiB3aGljaCBsYW5kIGhlcmUuXG4gKi9cbmNsYXNzIEFnZW50c1ZvaWNlT25ib2FyZGluZ0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmFnZW50c1ZvaWNlT25ib2FyZGluZyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElWb2ljZVNlc3Npb25Db250cm9sbGVyIHZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI6IElWb2ljZVNlc3Npb25Db250cm9sbGVyLFxuXHRcdEBJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2Ugdm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2U6IElWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGlmICh2b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGluZy5yZWFkKHJlYWRlcikgfHwgdm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RlZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0dm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2Uuc2hvd0lmTmVlZGVkKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG5cbi8vIFJlZ2lzdGVyZWQgYXQgdGhlIHNhbWUgbGF0ZSBwaGFzZSBhcyB0aGUgY29ubmVjdGVkLWtleSBjb250cmlidXRpb24gc28gaXRcbi8vIGRvZXMgbm90IGZvcmNlIGBJVm9pY2VTZXNzaW9uQ29udHJvbGxlcmAgdG8gaW5zdGFudGlhdGUgZWFybHkuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQWdlbnRzVm9pY2VPbmJvYXJkaW5nQ29udHJpYnV0aW9uLklELCBBZ2VudHNWb2ljZU9uYm9hcmRpbmdDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkV2ZW50dWFsbHkpO1xuXG4vLyAtLS0gVm9pY2UgbW9kZSBidXR0b24gaW4gQ2hhdCB0b29sYmFyIC0tLVxuLy8gU2hvd3MgdGhlIHZvaWNlIG1vZGUgaWNvbiBpbiBib3RoIGlkbGUgYW5kIGFjdGl2ZSBzdGF0ZXMuXG4vLyBDbGljayB0byBjb25uZWN0IGlmIGRpc2Nvbm5lY3RlZCwgb3IgdG9nZ2xlIFBUVCBpZiBjb25uZWN0ZWQuXG4vLyBUaGUgZGlzY29ubmVjdCBidXR0b24gKHNob3duIHdoZW4gY29ubmVjdGVkKSBpbmRpY2F0ZXMgYWN0aXZlIHZvaWNlIG1vZGUuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50c1ZvaWNlLmNvbm5lY3RpbmcnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FnZW50c1ZvaWNlLmNvbm5lY3RpbmcnLCBcIkNvbm5lY3RpbmcuLi5cIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmxvYWRpbmdDb21wYWN0LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLmFnZW50cy52b2ljZS5lbmFibGVkJywgdHJ1ZSksXG5cdFx0XHRcdEFHRU5UU19WT0lDRV9DT05ORUNUSU5HLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEV4ZWN1dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRTZWdtZW50ZWRWb2ljZUlucHV0TW9kZVBpbGxJbmFjdGl2ZSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5hZ2VudHMudm9pY2UuZW5hYmxlZCcsIHRydWUpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5pc0VxdWFsVG8oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCksXG5cdFx0XHRcdFx0QUdFTlRTX1ZPSUNFX0NPTk5FQ1RJTkcuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogLTEwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE5vLW9wIFx1MjAxNCBqdXN0IGEgdmlzdWFsIGluZGljYXRvclxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRzVm9pY2Uuc3RhcnRWb2ljZUluQ2hhdCcsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWdlbnRzVm9pY2Uuc3RhcnRWb2ljZUluQ2hhdCcsIFwiVm9pY2UgTW9kZVwiKSxcblx0XHRcdGljb246IENvZGljb24udm9pY2VNb2RlQ29tcGFjdCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuYWdlbnRzLnZvaWNlLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RXhlY3V0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFNlZ21lbnRlZFZvaWNlSW5wdXRNb2RlUGlsbEluYWN0aXZlLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLmFnZW50cy52b2ljZS5lbmFibGVkJywgdHJ1ZSksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmlzRXF1YWxUbyhDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY3VycmVudGx5RWRpdGluZy5uZWdhdGUoKSxcblx0XHRcdFx0XHRBR0VOVFNfVk9JQ0VfTElTVEVOSU5HLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdEFHRU5UU19WT0lDRV9DT05ORUNUSU5HLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdC8vIEhpZGUgVm9pY2UgTW9kZSB3aGlsZSBkaWN0YXRpb24gaXMgYWN0aXZlIChyZWNvcmRpbmcgb3IgdGhlXG5cdFx0XHRcdFx0Ly8gbW9kZWwgaXMgbG9hZGluZykgc28gdGhlIHR3byBtaWMgYWZmb3JkYW5jZXMgbmV2ZXIgY29tcGV0ZS5cblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuc3BlZWNoVG9UZXh0UmVjb3JkaW5nLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5zcGVlY2hUb1RleHRQcmVwYXJpbmcubmVnYXRlKCksXG5cdFx0XHRcdCksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAtMTBcblx0XHRcdH0sXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuU3BhY2UsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRTZWdtZW50ZWRWb2ljZUlucHV0TW9kZVBpbGxJbmFjdGl2ZSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5hZ2VudHMudm9pY2UuZW5hYmxlZCcsIHRydWUpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dCxcblx0XHRcdFx0KSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgdm9pY2VDb250cm9sbGVyID0gYWNjZXNzb3IuZ2V0KElWb2ljZVNlc3Npb25Db250cm9sbGVyKTtcblx0XHRjb25zdCBrZXliaW5kaW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJS2V5YmluZGluZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGhhbmRzRnJlZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpLmdldFZhbHVlPGJvb2xlYW4+KCdhZ2VudHMudm9pY2UuaGFuZHNGcmVlJykgPT09IHRydWU7XG5cblx0XHQvLyBDYXB0dXJlIGhvbGQtbW9kZSBGSVJTVCwgc3luY2hyb25vdXNseSwgYmVmb3JlIGFueSBgYXdhaXRgLiBUaGVcblx0XHQvLyBrZXliaW5kaW5nIHNlcnZpY2Ugb25seSByZXBvcnRzIGEgaGVsZCBjaG9yZCB3aGlsZSBpdCBpcyBzdGlsbFxuXHRcdC8vIGRpc3BhdGNoaW5nIHRoaXMgY29tbWFuZDsgdGhlIG1vbWVudCBgcnVuKClgIGZpcnN0IHN1c3BlbmRzIG9uIGFuXG5cdFx0Ly8gYXdhaXQgaXQgY2xlYXJzIGBfY3VycmVudGx5RGlzcGF0Y2hpbmdDb21tYW5kSWRgLCBhZnRlciB3aGljaFxuXHRcdC8vIGBlbmFibGVLZXliaW5kaW5nSG9sZE1vZGVgIHJldHVybnMgYHVuZGVmaW5lZGAuIENhbGxpbmcgaXQgdXAtZnJvbnQgaXNcblx0XHQvLyB3aGF0IG1ha2VzIHByZXNzLWFuZC1ob2xkIHdvcmsgZXZlbiBvbiB0aGUgdmVyeSBmaXJzdCAoY29sZCkgcHJlc3Ncblx0XHQvLyB3aGVyZSB3ZSBzdGlsbCBoYXZlIHRvIGNvbm5lY3QuIGB1bmRlZmluZWRgIGhlcmUgbWVhbnMgdGhlIGFjdGlvbiB3YXNcblx0XHQvLyBpbnZva2VkIHdpdGhvdXQgYSBoZWxkIGtleSAodG9vbGJhciBtaWMgYnV0dG9uIC8gY29tbWFuZCBwYWxldHRlKS5cblx0XHRjb25zdCBob2xkTW9kZSA9IGtleWJpbmRpbmdTZXJ2aWNlLmVuYWJsZUtleWJpbmRpbmdIb2xkTW9kZSgnYWdlbnRzVm9pY2Uuc3RhcnRWb2ljZUluQ2hhdCcpO1xuXG5cdFx0Ly8gRW5zdXJlIHRoZSBzZXNzaW9uIGlzIGNvbm5lY3RlZCBiZWZvcmUgd2Ugc3RhcnQgcmVjb3JkaW5nLiBUaGUgbWljXG5cdFx0Ly8gYnV0dG9uJ3MgZmlyc3QgcHJlc3MgY29ubmVjdHM7IGEgaGVsZCBrZXliaW5kaW5nIGFsc28gY29ubmVjdHMgaGVyZSBzb1xuXHRcdC8vIHRoYXQgcHJlc3MtYW5kLWhvbGQgd29ya3Mgb24gdGhlIHZlcnkgZmlyc3QgaW52b2NhdGlvbi4gSWYgdGhlIHVzZXJcblx0XHQvLyByZWxlYXNlcyB0aGUga2V5IHdoaWxlIHdlJ3JlIHN0aWxsIGNvbm5lY3RpbmcsIGBob2xkTW9kZWAgcmVzb2x2ZXNcblx0XHQvLyBlYXJseSBhbmQgdGhlIGF3YWl0ZWQgcmVsZWFzZSBiZWxvdyBmaXJlcyByaWdodCBhZnRlciBwdHREb3duKCkgXHUyMDE0IHRoZVxuXHRcdC8vIGNvbnRyb2xsZXIgdGhlbiB0cmVhdHMgaXQgYXMgYSBxdWljayB0YXAgKHRvZ2dsZSBvbikuXG5cdFx0Y29uc3Qgd2FzQ29ubmVjdGVkID0gdm9pY2VDb250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpO1xuXHRcdGlmICghd2FzQ29ubmVjdGVkKSB7XG5cdFx0XHRhd2FpdCB2b2ljZUNvbnRyb2xsZXIuY29ubmVjdChtYWluV2luZG93KTtcblx0XHR9XG5cblx0XHRpZiAoIWhvbGRNb2RlICYmICFoYW5kc0ZyZWUgJiYgIXdhc0Nvbm5lY3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE1hcCB0aGUgcGh5c2ljYWwga2V5L2J1dHRvbiBnZXN0dXJlIGRpcmVjdGx5IG9udG8gdGhlIGNvbnRyb2xsZXInc1xuXHRcdC8vIHB1c2gtdG8tdGFsayBtb2RlbDogcHJlc3MgPT4gcHR0RG93bigpLCByZWxlYXNlID0+IHB0dFVwKCkuIFRoZVxuXHRcdC8vIGNvbnRyb2xsZXIgaXRzZWxmIGRlY2lkZXMgdGFwLXZzLWhvbGQgYmFzZWQgb24gaG93IGxvbmcgdGhlIGtleSB3YXNcblx0XHQvLyBoZWxkIChhIHF1aWNrIHRhcCBlbnRlcnMgdG9nZ2xlIG1vZGUgYW5kIGtlZXBzIHJlY29yZGluZzsgYSByZWFsIGhvbGRcblx0XHQvLyByZWNvcmRzIG9ubHkgd2hpbGUgaGVsZCkuIGBlbmFibGVLZXliaW5kaW5nSG9sZE1vZGVgIGFsc28gc3dhbGxvd3MgT1Ncblx0XHQvLyBrZXktcmVwZWF0IHdoaWxlIGhlbGQsIHNvIGhvbGRpbmcgdGhlIHNob3J0Y3V0IG5vIGxvbmdlciByYXBpZGx5XG5cdFx0Ly8gdG9nZ2xlcy5cblx0XHR2b2ljZUNvbnRyb2xsZXIucHR0RG93bigpO1xuXHRcdGlmICghaG9sZE1vZGUpIHtcblx0XHRcdC8vIE5vdCBpbnZva2VkIHZpYSBhIGhlbGQga2V5YmluZGluZyAodG9vbGJhciBtaWMgYnV0dG9uIG9yIGNvbW1hbmRcblx0XHRcdC8vIHBhbGV0dGUpOiBlbXVsYXRlIGEgdGFwIHNvIHRoZSBjb250cm9sbGVyIGVudGVycyB0b2dnbGUgbW9kZSBhbmRcblx0XHRcdC8vIGtlZXBzIGxpc3RlbmluZy4gUHJlc3NpbmcgdGhlIGJ1dHRvbi9zaG9ydGN1dCBhZ2FpbiBzdG9wcy5cblx0XHRcdHZvaWNlQ29udHJvbGxlci5wdHRVcCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IGhvbGRNb2RlO1xuXHRcdHZvaWNlQ29udHJvbGxlci5wdHRVcCgpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRzVm9pY2UucHR0U3RvcEluQ2hhdCcsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWdlbnRzVm9pY2UucHR0U3RvcEluQ2hhdCcsIFwiVm9pY2UgTW9kZTogU3RvcCBSZWNvcmRpbmdcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnZvaWNlTW9kZUNvbXBhY3QsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuYWdlbnRzLnZvaWNlLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdFx0QUdFTlRTX1ZPSUNFX0xJU1RFTklORy5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHQpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFeGVjdXRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0U2VnbWVudGVkVm9pY2VJbnB1dE1vZGVQaWxsSW5hY3RpdmUsXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuYWdlbnRzLnZvaWNlLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9jYXRpb24uaXNFcXVhbFRvKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jdXJyZW50bHlFZGl0aW5nLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdEFHRU5UU19WT0lDRV9MSVNURU5JTkcuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogLTEwXG5cdFx0XHR9LFxuXHRcdFx0Ly8gTk9URTogaW50ZW50aW9uYWxseSBubyBrZXliaW5kaW5nLiBUaGUgQ21kK1NoaWZ0K1NwYWNlIGNob3JkIGlzXG5cdFx0XHQvLyBvd25lZCBzb2xlbHkgYnkgYGFnZW50c1ZvaWNlLnN0YXJ0Vm9pY2VJbkNoYXRgLCB3aGljaCBoYW5kbGVzIGJvdGhcblx0XHRcdC8vIHN0YXJ0aW5nIGFuZCBzdG9wcGluZyAodmlhIHRoZSBjb250cm9sbGVyJ3MgcHVzaC10by10YWxrIG1vZGVsKS5cblx0XHRcdC8vIEJpbmRpbmcgdGhlIHNhbWUgY2hvcmQgaGVyZSBhcyB3ZWxsIGNhdXNlZCB0aGUgdHdvIGFjdGlvbnMgdG9cblx0XHRcdC8vIGZpZ2h0IG9uIGV2ZXJ5IE9TIGtleS1yZXBlYXQsIHByb2R1Y2luZyByYXBpZCBzdGFydC9zdG9wIHRvZ2dsaW5nLlxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZvaWNlQ29udHJvbGxlciA9IGFjY2Vzc29yLmdldChJVm9pY2VTZXNzaW9uQ29udHJvbGxlcik7XG5cdFx0Ly8gU3RvcCByZWNvcmRpbmcgYW5kIHRoZSBhdXRvLWxpc3RlbiBsb29wIGJ1dCBrZWVwIHRoZSBXZWJTb2NrZXRcblx0XHQvLyBjb25uZWN0ZWQgc28gdGhlIHVzZXIgY2FuIHJlc3VtZSB3aXRob3V0IHJlY29ubmVjdGluZy4gVXNlIHRoZVxuXHRcdC8vIHNlcGFyYXRlIFwiRGlzY29ubmVjdCBWb2ljZSBNb2RlXCIgYnV0dG9uIHRvIGZ1bGx5IGVuZCB0aGUgc2Vzc2lvbi5cblx0XHR2b2ljZUNvbnRyb2xsZXIuc3RvcExpc3RlbmluZygpO1xuXHR9XG59KTtcblxuLy8gLS0tIERpc2Nvbm5lY3QgVm9pY2UgKGNvbW1hbmQgcGFsZXR0ZSArIHNlcGFyYXRlIHRvb2xiYXIgYnV0dG9uIHdoZW4gY29ubmVjdGVkKSAtLS1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRzVm9pY2UuZGlzY29ubmVjdCcsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWdlbnRzVm9pY2UuZGlzY29ubmVjdCcsIFwiRGlzY29ubmVjdCBWb2ljZSBNb2RlXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5kZWJ1Z0Rpc2Nvbm5lY3RDb21wYWN0LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuYWdlbnRzLnZvaWNlLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdFx0QUdFTlRTX1ZPSUNFX0NPTk5FQ1RFRC5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHQpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFeGVjdXRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuYWdlbnRzLnZvaWNlLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9jYXRpb24uaXNFcXVhbFRvKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jdXJyZW50bHlFZGl0aW5nLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdEFHRU5UU19WT0lDRV9DT05ORUNURUQuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0XHRcdC8vIFRoZSBzZWdtZW50ZWQgdm9pY2UgcGlsbCdzIHZvaWNlIGNlbGwgaXMgaXRzZWxmIHRoZSBvbi9vZmYgdG9nZ2xlLFxuXHRcdFx0XHRcdC8vIHNvIGEgc2VwYXJhdGUgZGlzY29ubmVjdCBidXR0b24gd291bGQgYmUgcmVkdW5kYW50IHRoZXJlLlxuXHRcdFx0XHRcdFNlZ21lbnRlZFZvaWNlSW5wdXRNb2RlUGlsbEluYWN0aXZlLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogLTlcblx0XHRcdH0sXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdC8vIEtlZXAgdGhpcyBiZWxvdyB0aGUgZWRpdG9yIHdpZGdldHMgYW5kIG5lZ2F0ZSB0aGVpciBjb250ZXh0cyBzb1xuXHRcdFx0XHQvLyBFc2NhcGUgc3RpbGwgZGlzbWlzc2VzIEludGVsbGlTZW5zZS9ob3ZlciBhbmQgY2xlYXJzIHNlbGVjdGlvbnNcblx0XHRcdFx0Ly8gd2hpbGUgdGhlIHVzZXIgaXMgdHlwaW5nIGluIHRoZSBjaGF0IGlucHV0LlxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiAtIDUsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuYWdlbnRzLnZvaWNlLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXQsXG5cdFx0XHRcdFx0QUdFTlRTX1ZPSUNFX0NPTk5FQ1RFRC5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRcdFx0Ly8gRG9uJ3QgZGlzY29ubmVjdCB2b2ljZSB3aGlsZSBhIHJlcXVlc3QgaXMgcnVubmluZyBcdTIwMTQgcHJlc3Npbmdcblx0XHRcdFx0XHQvLyBFc2NhcGUgdGhlcmUgaXMgbWVhbnQgdG8gaW50ZXJydXB0L2NhbmNlbCB0aGF0IHJlcXVlc3QsIG5vdFxuXHRcdFx0XHRcdC8vIHRlYXIgZG93biB0aGUgdm9pY2Ugc2Vzc2lvbiAod2hpY2ggaXMgZXNwZWNpYWxseSBkaXNydXB0aXZlXG5cdFx0XHRcdFx0Ly8gaW4gaGFuZHMtZnJlZSBtb2RlIHdoZXJlIHRoZXJlIGlzIG5vIHJlY29ubmVjdCBidXR0b24pLlxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5oYXNBY3RpdmVSZXF1ZXN0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhvdmVyVmlzaWJsZS50b05lZ2F0ZWQoKSxcblx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5oYXNOb25FbXB0eVNlbGVjdGlvbi50b05lZ2F0ZWQoKSxcblx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5oYXNNdWx0aXBsZVNlbGVjdGlvbnMudG9OZWdhdGVkKCksXG5cdFx0XHRcdCksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZvaWNlQ29udHJvbGxlciA9IGFjY2Vzc29yLmdldChJVm9pY2VTZXNzaW9uQ29udHJvbGxlcik7XG5cdFx0dm9pY2VDb250cm9sbGVyLmRpc2Nvbm5lY3QoJ2V4cGxpY2l0Jyk7XG5cdH1cbn0pO1xuXG4vLyAtLS0gQ2FuY2VsIEFjdGl2ZSBSZXF1ZXN0IHZpYSBFc2NhcGUgKHdoaWxlIHZvaWNlLWNvbm5lY3RlZCBpbiB0aGUgY2hhdCBpbnB1dCkgLS0tXG4vL1xuLy8gVGhlIERpc2Nvbm5lY3Qtb24tRXNjYXBlIGFjdGlvbiBhYm92ZSBkZWxpYmVyYXRlbHkgZG9lcyBOT1RISU5HIHdoaWxlIGFcbi8vIHJlcXVlc3QgaXMgcnVubmluZyAoaXRzIGB3aGVuYCBuZWdhdGVzIGhhc0FjdGl2ZVJlcXVlc3QpIHNvIGl0IGRvZXNuJ3QgdGVhclxuLy8gZG93biB0aGUgdm9pY2Ugc2Vzc2lvbiBtaWQtdHVybi4gQnV0IHRoZSBidWlsdC1pbiBDYW5jZWwgYWN0aW9uIGlzIGJvdW5kIHRvXG4vLyBDbWQvQ3RybCtFc2NhcGUgKEFsdCtCYWNrc3BhY2Ugb24gV2luZG93cyksIHNvIHBsYWluIEVzY2FwZSB3b3VsZCBvdGhlcndpc2Vcbi8vIGJlIGEgbm8tb3AgdGhlcmUuIFJlc3RvcmUgdGhlIGV4cGVjdGVkIGJlaGF2aW9yOiBwbGFpbiBFc2NhcGUgY2FuY2VscyB0aGVcbi8vIGluLWZsaWdodCByZXF1ZXN0IHdoaWxlIGxlYXZpbmcgdGhlIGlkbGUtb25seSBkaXNjb25uZWN0IGludGFjdC5cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRzVm9pY2UuY2FuY2VsQWN0aXZlUmVxdWVzdCcsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWdlbnRzVm9pY2UuY2FuY2VsQWN0aXZlUmVxdWVzdCcsIFwiVm9pY2UgTW9kZTogQ2FuY2VsIFJlcXVlc3RcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliIC0gNSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5hZ2VudHMudm9pY2UuZW5hYmxlZCcsIHRydWUpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dCxcblx0XHRcdFx0XHRBR0VOVFNfVk9JQ0VfQ09OTkVDVEVELmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdFx0XHQvLyBNaXJyb3IgdGhlIGRpc2Nvbm5lY3QgYmluZGluZydzIGVkaXRvciBuZWdhdGlvbnMgc28gRXNjYXBlXG5cdFx0XHRcdFx0Ly8gc3RpbGwgZGlzbWlzc2VzIEludGVsbGlTZW5zZS9ob3ZlciBhbmQgY2xlYXJzIHNlbGVjdGlvbnMgZmlyc3QuXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmhhc0FjdGl2ZVJlcXVlc3QsXG5cdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaG92ZXJWaXNpYmxlLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhhc05vbkVtcHR5U2VsZWN0aW9uLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhhc011bHRpcGxlU2VsZWN0aW9ucy50b05lZ2F0ZWQoKSxcblx0XHRcdFx0KSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jYW5jZWwnKTtcblx0fVxufSk7XG5cbi8vIC0tLSBPcGVuIFZvaWNlIE1vZGUgU2V0dGluZ3MgLS0tXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50c1ZvaWNlLm9wZW5TZXR0aW5ncycsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWdlbnRzVm9pY2Uub3BlblNldHRpbmdzJywgXCJWb2ljZSBNb2RlIFNldHRpbmdzXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLmFnZW50cy52b2ljZS5lbmFibGVkJywgdHJ1ZSksXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLCB7IHF1ZXJ5OiAnYWdlbnRzLnZvaWNlJyB9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU0hPV19WT0lDRV9NT0RFX09OQk9BUkRJTkdfQ09NTUFORCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdhZ2VudHNWb2ljZS5zaG93T25ib2FyZGluZycsIFwiVm9pY2UgTW9kZTogU2hvdyBJbnRyb2R1Y3Rpb25cIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuYWdlbnRzLnZvaWNlLmVuYWJsZWQnLCB0cnVlKSxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGlmICghYWNjZXNzb3IuZ2V0KElWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSkuc2hvdygpKSB7XG5cdFx0XHRhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpLmluZm8obmxzLmxvY2FsaXplKCdhZ2VudHNWb2ljZS5vbmJvYXJkaW5nTmVlZHNDaGF0JywgXCJPcGVuIGEgY2hhdCB0byBzZWUgdGhlIFZvaWNlIE1vZGUgaW50cm9kdWN0aW9uLlwiKSk7XG5cdFx0fVxuXHR9XG59KTtcblxuLy8gLS0tIFNpbXVsYXRlIFZvaWNlIENvbm5lY3Rpb24gKGRldiB1dGlsaXR5LCBiYWNrZW5kIGRvd24pIC0tLVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudHNWb2ljZS5zaW11bGF0ZUNvbm5lY3Rpb24nLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FnZW50c1ZvaWNlLnNpbXVsYXRlQ29ubmVjdGlvbicsIFwiVm9pY2U6IFNpbXVsYXRlIENvbm5lY3Rpb24gKERldilcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2b2ljZUNvbnRyb2xsZXIgPSBhY2Nlc3Nvci5nZXQoSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIpO1xuXHRcdHZvaWNlQ29udHJvbGxlci5zaW11bGF0ZUNvbm5lY3Rpb24oKTtcblx0fVxufSk7XG5cbi8vIC0tLSBSZXNldCBPbmJvYXJkaW5nIENvbW1hbmQgKGRldiB1dGlsaXR5KSAtLS1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWdlbnRzVm9pY2UucmVzZXRPbmJvYXJkaW5nJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdyZXNldEFnZW50c1ZvaWNlT25ib2FyZGluZycsIFwiVm9pY2U6IFJlc2V0IE9uYm9hcmRpbmdcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLk9uYm9hcmRpbmdDb21wbGV0ZWQsIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRzdG9yYWdlU2VydmljZS5yZW1vdmUoQWdlbnRzVm9pY2VTdG9yYWdlS2V5cy5JbnRyb0Jhbm5lclNob3duLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHR9XG59KTtcblxuLy8gLS0tIFB1c2gtdG8tVGFsayBDb21tYW5kIC0tLVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZ2VudHNWb2ljZS5wdXNoVG9UYWxrJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdhZ2VudHNWb2ljZVB1c2hUb1RhbGsnLCBcIlZvaWNlIE1vZGU6IFB1c2ggdG8gVGFsa1wiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5hZ2VudHMudm9pY2UuZW5hYmxlZCcsIHRydWUpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlNwYWNlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0QUdFTlRTX1ZPSUNFX1dJREdFVF9GT0NVU0VELFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdCgnaW5wdXRGb2N1cycpLFxuXHRcdFx0XHQpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2b2ljZUNvbnRyb2xsZXIgPSBhY2Nlc3Nvci5nZXQoSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cblx0XHQvLyBDYXB0dXJlIGhvbGQgbW9kZSBiZWZvcmUgYXdhaXRpbmcgc28gdGhlIGRpc3BhdGNoaW5nIGNvbW1hbmQgaXMgc3RpbGwgYXZhaWxhYmxlLlxuXHRcdGNvbnN0IGhvbGRNb2RlID0ga2V5YmluZGluZ1NlcnZpY2UuZW5hYmxlS2V5YmluZGluZ0hvbGRNb2RlKCdhZ2VudHNWb2ljZS5wdXNoVG9UYWxrJyk7XG5cblx0XHQvLyBBdXRvLWNvbm5lY3Qgb24gZmlyc3QgUFRUIHByZXNzXG5cdFx0aWYgKCF2b2ljZUNvbnRyb2xsZXIuaXNDb25uZWN0ZWQuZ2V0KCkgJiYgIXZvaWNlQ29udHJvbGxlci5pc0Nvbm5lY3RpbmcuZ2V0KCkpIHtcblx0XHRcdGF3YWl0IHZvaWNlQ29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXHRcdH1cblx0XHRpZiAoIXZvaWNlQ29udHJvbGxlci5pc0Nvbm5lY3RlZC5nZXQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZvaWNlQ29udHJvbGxlci5wdHREb3duKCk7XG5cblx0XHRpZiAoIWhvbGRNb2RlKSB7XG5cdFx0XHQvLyBOb3QgaW52b2tlZCB2aWEgYSBoZWxkIGtleWJpbmRpbmc6IGVtdWxhdGUgYSB0YXAgc28gdGhlIGNvbnRyb2xsZXJcblx0XHRcdC8vIGVudGVycyB0b2dnbGUgbW9kZSBhbmQga2VlcHMgbGlzdGVuaW5nLiBQcmVzc2luZyBhZ2FpbiBzdG9wcy5cblx0XHRcdHZvaWNlQ29udHJvbGxlci5wdHRVcCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBzaG9ydGN1dCBpcyBiZWluZyBoZWxkOiB3YWl0IGZvciByZWxlYXNlLCB0aGVuIGZpbmlzaCB0aGUgdHVybi5cblx0XHQvLyBUaGUgY29udHJvbGxlciBkZWNpZGVzIHRhcC12cy1ob2xkIGJhc2VkIG9uIGhvdyBsb25nIGl0IHdhcyBoZWxkLlxuXHRcdGF3YWl0IGhvbGRNb2RlO1xuXHRcdHZvaWNlQ29udHJvbGxlci5wdHRVcCgpO1xuXHR9XG59KTtcblxuLy8gLS0tIFNlbGVjdCBNaWNyb3Bob25lIENvbW1hbmQgLS0tXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2FnZW50c1ZvaWNlLnNlbGVjdE1pY3JvcGhvbmUnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FnZW50c1ZvaWNlLnNlbGVjdE1pY3JvcGhvbmUnLCBcIlZvaWNlOiBTZWxlY3QgTWljcm9waG9uZVwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5hZ2VudHMudm9pY2UuZW5hYmxlZCcsIHRydWUpLFxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGRldmljZXMgPSBhd2FpdCBuYXZpZ2F0b3IubWVkaWFEZXZpY2VzLmVudW1lcmF0ZURldmljZXMoKTtcblxuXHRcdC8vIEZpbHRlciBvdXQgdGhlIHZpcnR1YWwgXCJkZWZhdWx0XCIvXCJjb21tdW5pY2F0aW9uc1wiIGVudHJpZXMgKHdoaWNoIGR1cGxpY2F0ZSBhIHJlYWxcblx0XHQvLyBkZXZpY2UpIGFuZCBkZS1kdXBsaWNhdGUgYnkgZGV2aWNlSWQgc28gYSBzaW5nbGUgbWljcm9waG9uZSBzaG93cyB1cCBvbmx5IG9uY2UuXG5cdFx0Y29uc3Qgc2VlbkRldmljZUlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGF1ZGlvSW5wdXRzID0gZGV2aWNlcy5maWx0ZXIoZCA9PiB7XG5cdFx0XHRpZiAoZC5raW5kICE9PSAnYXVkaW9pbnB1dCcgfHwgZC5kZXZpY2VJZCA9PT0gJ2RlZmF1bHQnIHx8IGQuZGV2aWNlSWQgPT09ICdjb21tdW5pY2F0aW9ucycpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlZW5EZXZpY2VJZHMuaGFzKGQuZGV2aWNlSWQpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHNlZW5EZXZpY2VJZHMuYWRkKGQuZGV2aWNlSWQpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHRpZiAoYXVkaW9JbnB1dHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRxdWlja0lucHV0U2VydmljZS5waWNrKFt7IGxhYmVsOiBubHMubG9jYWxpemUoJ25vTWljcm9waG9uZXMnLCBcIk5vIG1pY3JvcGhvbmVzIGZvdW5kXCIpIH1dKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50RGV2aWNlSWQgPSBzdG9yYWdlU2VydmljZS5nZXQoQWdlbnRzVm9pY2VTdG9yYWdlS2V5cy5NaWNyb3Bob25lRGV2aWNlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sICcnKTtcblxuXHRcdHR5cGUgRGV2aWNlUGlja0l0ZW0gPSB7IGxhYmVsOiBzdHJpbmc7IGRlc2NyaXB0aW9uPzogc3RyaW5nOyBkZXZpY2VJZDogc3RyaW5nIH07XG5cdFx0Y29uc3QgaXRlbXM6IERldmljZVBpY2tJdGVtW10gPSBbXTtcblxuXHRcdC8vIFwiU3lzdGVtIERlZmF1bHRcIiBlbnRyeSBcdTIwMTQgY2xlYXJzIHRoZSBzdG9yZWQgZGV2aWNlIHNvIHRoZSBPUyBkZWZhdWx0IGlzIGFsd2F5cyB1c2VkXG5cdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdzeXN0ZW1EZWZhdWx0JywgXCJTeXN0ZW0gRGVmYXVsdFwiKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBjdXJyZW50RGV2aWNlSWQgPT09ICcnID8gbmxzLmxvY2FsaXplKCdjdXJyZW50JywgXCIoY3VycmVudClcIikgOiB1bmRlZmluZWQsXG5cdFx0XHRkZXZpY2VJZDogJycsXG5cdFx0fSk7XG5cblx0XHRmb3IgKGNvbnN0IGQgb2YgYXVkaW9JbnB1dHMpIHtcblx0XHRcdGNvbnN0IGxhYmVsID0gZC5sYWJlbCB8fCBubHMubG9jYWxpemUoJ3Vua25vd25EZXZpY2UnLCBcIlVua25vd24gRGV2aWNlICh7MH0pXCIsIGQuZGV2aWNlSWQuc2xpY2UoMCwgOCkpO1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZC5kZXZpY2VJZCA9PT0gY3VycmVudERldmljZUlkID8gbmxzLmxvY2FsaXplKCdjdXJyZW50JywgXCIoY3VycmVudClcIikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGRldmljZUlkOiBkLmRldmljZUlkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGlja2VkID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhpdGVtcywge1xuXHRcdFx0cGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnc2VsZWN0TWljJywgXCJTZWxlY3QgYSBtaWNyb3Bob25lIGZvciBWb2ljZSBNb2RlXCIpLFxuXHRcdH0pO1xuXG5cdFx0aWYgKHBpY2tlZCkge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gcGlja2VkIGFzIERldmljZVBpY2tJdGVtO1xuXHRcdFx0aWYgKHNlbGVjdGlvbi5kZXZpY2VJZCkge1xuXHRcdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLk1pY3JvcGhvbmVEZXZpY2UsIHNlbGVjdGlvbi5kZXZpY2VJZCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c3RvcmFnZVNlcnZpY2UucmVtb3ZlKEFnZW50c1ZvaWNlU3RvcmFnZUtleXMuTWljcm9waG9uZURldmljZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG4vLyAtLS0gU2V0dGluZ3MgLS0tXG5cbmNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdGlkOiAnYWdlbnRzVm9pY2UnLFxuXHR0aXRsZTogbmxzLmxvY2FsaXplKCdhZ2VudHNWb2ljZUNvbmZpZ3VyYXRpb25UaXRsZScsIFwiVm9pY2UgTW9kZVwiKSxcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHQnYWdlbnRzLnZvaWNlLmVuYWJsZWQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2UuZW5hYmxlZCcsIFwiRW5hYmxlIHRoZSBWb2ljZSBNb2RlIHBhbmVsIGluIHRoZSBjaGF0IHZpZXcgZm9yIHZvaWNlLWRyaXZlbiBjb2RpbmcgY29udmVyc2F0aW9ucy5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nLFxuXHRcdFx0fSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHR9LFxuXHRcdCdhZ2VudHMudm9pY2UuYmFja2VuZFVybCc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLmJhY2tlbmRVcmwnLCBcIlZvaWNlIGJhY2tlbmQgV2ViU29ja2V0IFVSTC4gTGVhdmUgZW1wdHkgdG8gdXNlIHRoZSBkZWZhdWx0IGhvc3RlZCBiYWNrZW5kLiBTZXQgdG8gZS5nLiBgd3M6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvdjEvcmVhbHRpbWUvdm9pY2VgIHRvIHBvaW50IGF0IGEgYmFja2VuZCBydW5uaW5nIG9uIHlvdXIgbWFjaGluZS5cIiksXG5cdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0fSxcblx0XHQnYWdlbnRzLnZvaWNlLnNwZWFrUmVzcG9uc2VzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2Uuc3BlYWtSZXNwb25zZXMnLCBcIldoZW4gZW5hYmxlZCwgdGhlIGFzc2lzdGFudCByZWFkcyByZXNwb25zZXMgYWxvdWQuIFdoZW4gZGlzYWJsZWQsIHJlc3BvbnNlcyBhcmUgbm90IHNwb2tlbjsgZW5hYmxlIGAjYWdlbnRzLnZvaWNlLnNob3dUcmFuc2NyaXB0I2AgdG8gcmVhZCB0aGVtIGFzIGEgdGV4dCB0cmFuc2NyaXB0IGluc3RlYWQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0fSxcblx0XHRbVk9JQ0VfQUdFTlRfUFJPR1JFU1NfU0VUVElOR106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLmFnZW50UHJvZ3Jlc3MnLCBcIkFsbG93IEFnZW50IG1vZGUgdG8gc3BlYWsgYnJpZWYgc2VtYW50aWMgcHJvZ3Jlc3MgdXBkYXRlcyB3aGlsZSBpdCBpbnZlc3RpZ2F0ZXMsIHBsYW5zLCBlZGl0cywgdmFsaWRhdGVzLCBvciByZWNvdmVycyBmcm9tIGEgcHJvYmxlbS5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdH0sXG5cdFx0J2FnZW50cy52b2ljZS52b2ljZSc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWyd2aWN0b3JpYV9uZXV0cmFsJywgJ2tldmluX25ldXRyYWwnLCAnbWF5YV9uZXV0cmFsJywgJ2RhbmllbF9uZXV0cmFsJ10sXG5cdFx0XHRlbnVtSXRlbUxhYmVsczogWydWaWN0b3JpYScsICdLZXZpbicsICdNYXlhJywgJ0RhbmllbCddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS52b2ljZS52aWN0b3JpYScsIFwiVmljdG9yaWEuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS52b2ljZS5rZXZpbicsIFwiS2V2aW4uXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS52b2ljZS5tYXlhJywgXCJNYXlhLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2Uudm9pY2UuZGFuaWVsJywgXCJEYW5pZWwuXCIpLFxuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLnZvaWNlJywgXCJUaGUgdm9pY2UgdXNlZCB3aGVuIHRoZSBhc3Npc3RhbnQgcmVhZHMgcmVzcG9uc2VzIGFsb3VkLiBDaGFuZ2luZyB0aGlzIHdoaWxlIHZvaWNlIG1vZGUgaXMgY29ubmVjdGVkIHRha2VzIGVmZmVjdCBpbW1lZGlhdGVseS4gVXNlIFtWb2ljZSBNb2RlIGluc3RydWN0aW9uc10oY29tbWFuZDp7MH0pIHRvIGN1c3RvbWl6ZSBWb2ljZSBNb2RlIGJlaGF2aW9yIGFuZCB0ZXJtaW5vbG9neS5cIiwgQ09ORklHVVJFX1ZPSUNFX0lOU1RSVUNUSU9OU19BQ1RJT05fSUQpLFxuXHRcdFx0ZGVmYXVsdDogJ21heWFfbmV1dHJhbCcsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdH0sXG5cdFx0J2FnZW50cy52b2ljZS5sYW5ndWFnZSc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydhdXRvJywgJ2VuJywgJ2RlJywgJ2VzJywgJ2ZyJywgJ2l0JywgJ3B0JywgJ2phJywgJ2tvJywgJ3poJ10sXG5cdFx0XHRlbnVtSXRlbUxhYmVsczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS5sYW5ndWFnZS5hdXRvJywgXCJBdXRvbWF0aWNcIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLmxhbmd1YWdlLmVuJywgXCJFbmdsaXNoXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS5sYW5ndWFnZS5kZScsIFwiR2VybWFuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS5sYW5ndWFnZS5lcycsIFwiU3BhbmlzaFwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UuZnInLCBcIkZyZW5jaFwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UuaXQnLCBcIkl0YWxpYW5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLmxhbmd1YWdlLnB0JywgXCJQb3J0dWd1ZXNlXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2FnZW50cy52b2ljZS5sYW5ndWFnZS5qYScsIFwiSmFwYW5lc2VcIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLmxhbmd1YWdlLmtvJywgXCJLb3JlYW5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLmxhbmd1YWdlLnpoJywgXCJDaGluZXNlXCIpLFxuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLmxhbmd1YWdlJywgXCJUaGUgbGFuZ3VhZ2UgdXNlZCBmb3Igc3BlZWNoIHJlY29nbml0aW9uLCBkaWN0YXRpb24sIGFuZCBzcG9rZW4gcmVzcG9uc2VzLiBUaGUgc2VsZWN0YWJsZSBsYW5ndWFnZXMgc3VwcG9ydCBuYXRpdmUgdm9pY2Ugb3V0cHV0LiBBdXRvbWF0aWMgZm9sbG93cyB0aGUgc3lzdGVtIG9yIGJyb3dzZXIgbG9jYWxlIGZvciBzcGVlY2ggcmVjb2duaXRpb24gYW5kIGRpY3RhdGlvbiwgYW5kIHVzZXMgRW5nbGlzaCB2b2ljZSBvdXRwdXQgd2hlbiB0aGUgZGV0ZWN0ZWQgbGFuZ3VhZ2UgZG9lcyBub3Qgc3VwcG9ydCBuYXRpdmUgdm9pY2Ugb3V0cHV0LiBDaGFuZ2luZyB0aGlzIHdoaWxlIHZvaWNlIG1vZGUgaXMgY29ubmVjdGVkIHRha2VzIGVmZmVjdCBpbW1lZGlhdGVseS5cIiksXG5cdFx0XHRkZWZhdWx0OiAnYXV0bycsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdH0sXG5cdFx0J2FnZW50cy52b2ljZS5zaG93VHJhbnNjcmlwdCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLnNob3dUcmFuc2NyaXB0JywgXCJTaG93IHRoZSB2b2ljZSB0cmFuc2NyaXB0IG92ZXJsYXkgaW4gdGhlIGNoYXQgaW5wdXQgYXJlYSB3aGlsZSB2b2ljZSBtb2RlIGlzIGFjdGl2ZS4gRW5hYmxlIHRoaXMgdG8gcmVhZCByZXNwb25zZXMgYXMgdGV4dCB3aGVuIGAjYWdlbnRzLnZvaWNlLnNwZWFrUmVzcG9uc2VzI2AgaXMgZGlzYWJsZWQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdH0sXG5cdFx0J2FnZW50cy52b2ljZS5saXZlVHJhbnNjcmlwdCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLmxpdmVUcmFuc2NyaXB0JywgXCJTaG93IHlvdXIgc3BlZWNoIGFzIGEgbGl2ZSwgd29yZC1ieS13b3JkIHRyYW5zY3JpcHQgd2hpbGUgeW91IGFyZSBzcGVha2luZy4gV2hlbiBkaXNhYmxlZCwgeW91ciB0cmFuc2NyaXB0IGFwcGVhcnMgb25seSBvbmNlIHlvdSBmaW5pc2ggc3BlYWtpbmcuIFJlcXVpcmVzIGAjYWdlbnRzLnZvaWNlLnNob3dUcmFuc2NyaXB0I2AgdG8gYmUgZW5hYmxlZCB0byBiZSB2aXNpYmxlLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHR9LFxuXHRcdCdhZ2VudHMudm9pY2UuaGFuZHNGcmVlJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2UuaGFuZHNGcmVlJywgXCJXaGVuIGVuYWJsZWQsIHZvaWNlIG1vZGUgYXV0b21hdGljYWxseSByZS1lbnRlcnMgbGlzdGVuaW5nIGFmdGVyIHRoZSBhc3Npc3RhbnQgZmluaXNoZXMgc3BlYWtpbmcsIHNvIHlvdSBjYW4gaG9sZCBhIGhhbmRzLWZyZWUgYmFjay1hbmQtZm9ydGggY29udmVyc2F0aW9uLiBXaGVuIGRpc2FibGVkLCB5b3Ugc3RhcnQgYW5kIGVuZCBlYWNoIHR1cm4gbWFudWFsbHksIGFuZCBlbmRpbmcgdGhlIHR1cm4gc2VuZHMgaXQuIFR1cm5zIGFyZSBub3QgZW5kZWQgYXV0b21hdGljYWxseSBvbiB0cmFpbGluZyBzaWxlbmNlIG9yIGEgc3RvcCBwaHJhc2UgdW5sZXNzIHswfSBvciB7MX0gaXMgZXhwbGljaXRseSBjb25maWd1cmVkLlwiLCAnYCNhZ2VudHMudm9pY2UudHVybi5zaWxlbmNlTXMjYCcsICdgI2FnZW50cy52b2ljZS50dXJuLnN0b3BQaHJhc2VzI2AnKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdH0sXG5cdFx0J2FnZW50cy52b2ljZS50dXJuLnNpbGVuY2VNcyc6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2UudHVybi5zaWxlbmNlTXMnLCBcIlRyYWlsaW5nIHNpbGVuY2UgaW4gbWlsbGlzZWNvbmRzIGJlZm9yZSB0aGUgYmFja2VuZCBlbmRzIHRoZSB0dXJuIGF1dG9tYXRpY2FsbHkuIFNldCB0byBgLTFgIHRvIGRpc2FibGUgZW5kaW5nIHRoZSB0dXJuIG9uIHNpbGVuY2UsIGluIHdoaWNoIGNhc2UgdGhlIHR1cm4gZW5kcyBvbmx5IHZpYSBhIHN0b3AgcGhyYXNlICh7MH0pIG9yIG1hbnVhbGx5LiBXaGVuIGVuYWJsZWQsIHRoZSBiYWNrZW5kIGNsYW1wcyB0aGlzIHRvIGl0cyBzdXBwb3J0ZWQgcmFuZ2UgKGN1cnJlbnRseSAyMDAtNTAwMCBtcykgYW5kIGlzIHRoZSBzb3VyY2Ugb2YgdHJ1dGguIFdoZW4gaGFuZHMtZnJlZSBtb2RlICh7MX0pIGlzIGRpc2FibGVkLCB0aGUgdHVybiBpcyBub3QgZW5kZWQgb24gc2lsZW5jZSBieSBkZWZhdWx0IHVubGVzcyB0aGlzIHNldHRpbmcgaXMgZXhwbGljaXRseSBjb25maWd1cmVkLCBzbyB5b3Uga2VlcCBtYW51YWwgY29udHJvbCBvdmVyIHdoZW4gYSB0dXJuIGlzIHNlbnQuXCIsICdgI2FnZW50cy52b2ljZS50dXJuLnN0b3BQaHJhc2VzI2AnLCAnYCNhZ2VudHMudm9pY2UuaGFuZHNGcmVlI2AnKSxcblx0XHRcdGRlZmF1bHQ6IDgwMCxcblx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb25zdDogLTEsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWdlbnRzLnZvaWNlLnR1cm4uc2lsZW5jZU1zLmRpc2FibGVkJywgXCJEbyBub3QgZW5kIHRoZSB0dXJuIG9uIHRyYWlsaW5nIHNpbGVuY2UuXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0bWluaW11bTogMjAwLFxuXHRcdFx0XHRcdG1heGltdW06IDUwMDAsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHR9LFxuXHRcdCdhZ2VudHMudm9pY2UudHVybi5zdG9wUGhyYXNlcyc6IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhZ2VudHMudm9pY2UudHVybi5zdG9wUGhyYXNlcycsIFwiUGhyYXNlcyB0aGF0IGVuZCB0aGUgdHVybiB3aGVuIHNwb2tlbiBhdCB0aGUgZW5kIG9mIGFuIHV0dGVyYW5jZS4gTGVhdmUgZW1wdHkgdG8gZGlzYWJsZSBlbmRpbmcgdGhlIHR1cm4gb24gYSBzdG9wIHBocmFzZSwgaW4gd2hpY2ggY2FzZSB0aGUgdHVybiBlbmRzIG9ubHkgb24gdHJhaWxpbmcgc2lsZW5jZSAoezB9KSBvciBtYW51YWxseS4gVGhlIGJhY2tlbmQgc3RyaXBzIHRoZSBtYXRjaGVkIHBocmFzZSBmcm9tIHRoZSB0cmFuc2NyaXB0IGJlZm9yZSBpdCByZWFjaGVzIHRoZSBhZ2VudC4gV2hlbiBoYW5kcy1mcmVlIG1vZGUgKHsxfSkgaXMgZGlzYWJsZWQsIHN0b3AgcGhyYXNlcyBkbyBub3QgZW5kIHRoZSB0dXJuIGJ5IGRlZmF1bHQgdW5sZXNzIHRoaXMgc2V0dGluZyBpcyBleHBsaWNpdGx5IGNvbmZpZ3VyZWQsIHNvIHlvdSBrZWVwIG1hbnVhbCBjb250cm9sIG92ZXIgd2hlbiBhIHR1cm4gaXMgc2VudC5cIiwgJ2AjYWdlbnRzLnZvaWNlLnR1cm4uc2lsZW5jZU1zI2AnLCAnYCNhZ2VudHMudm9pY2UuaGFuZHNGcmVlI2AnKSxcblx0XHRcdGRlZmF1bHQ6IFsnc2VuZCBpdCddLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHR9LFxuXHR9XG59KTtcblxuLy8gTWlncmF0ZSB0aGUgcmVtb3ZlZCBgYWdlbnRzLnZvaWNlLnR1cm4uYXV0b0VuZE1vZGVgIHNldHRpbmcgb250byB0aGUgdHdvXG4vLyBzZXR0aW5ncyB0aGF0IG5vdyBnb3Zlcm4gdHVybi1lbmRpbmcsIHByZXNlcnZpbmcgdGhlIHByZXZpb3VzIGJlaGF2aW9yOlxuLy8gc2lsZW5jZSBlbmRpbmcgaXMgZGlzYWJsZWQgKGBzaWxlbmNlTXM6IC0xYCkgdW5sZXNzIHRoZSBvbGQgbW9kZSB3YXMgYHZhZGBcbi8vIG9yIGBib3RoYCwgYW5kIHN0b3AtcGhyYXNlIGVuZGluZyBpcyBkaXNhYmxlZCAoYHN0b3BQaHJhc2VzOiBbXWApIHVubGVzcyB0aGVcbi8vIG9sZCBtb2RlIHdhcyBgcGhyYXNlYCBvciBgYm90aGAuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5PihXb3JrYmVuY2hDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uTWlncmF0aW9uKVxuXHQucmVnaXN0ZXJDb25maWd1cmF0aW9uTWlncmF0aW9ucyhbe1xuXHRcdGtleTogJ2FnZW50cy52b2ljZS50dXJuLmF1dG9FbmRNb2RlJyxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZTogdW5rbm93bikgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBDb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycyA9IFtbJ2FnZW50cy52b2ljZS50dXJuLmF1dG9FbmRNb2RlJywgeyB2YWx1ZTogdW5kZWZpbmVkIH1dXTtcblx0XHRcdGlmICh2YWx1ZSA9PT0gJ29mZicgfHwgdmFsdWUgPT09ICd2YWQnIHx8IHZhbHVlID09PSAncGhyYXNlJyB8fCB2YWx1ZSA9PT0gJ2JvdGgnKSB7XG5cdFx0XHRcdGNvbnN0IHNpbGVuY2VFbmFibGVkID0gdmFsdWUgPT09ICd2YWQnIHx8IHZhbHVlID09PSAnYm90aCc7XG5cdFx0XHRcdGNvbnN0IHBocmFzZUVuYWJsZWQgPSB2YWx1ZSA9PT0gJ3BocmFzZScgfHwgdmFsdWUgPT09ICdib3RoJztcblx0XHRcdFx0aWYgKCFzaWxlbmNlRW5hYmxlZCkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKFsnYWdlbnRzLnZvaWNlLnR1cm4uc2lsZW5jZU1zJywgeyB2YWx1ZTogLTEgfV0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghcGhyYXNlRW5hYmxlZCkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKFsnYWdlbnRzLnZvaWNlLnR1cm4uc3RvcFBocmFzZXMnLCB7IHZhbHVlOiBbXSB9XSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9XSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsb0NBQW9DO0FBQzdDLE9BQU87QUFDUCxPQUFPO0FBR1AsT0FBTztBQUdQLE9BQU87QUFFUCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLGNBQWMseUJBQXlCLDBC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
