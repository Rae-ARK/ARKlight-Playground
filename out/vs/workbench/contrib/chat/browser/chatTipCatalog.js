import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { localize } from "../../../../nls.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { ChatConfiguration, ChatModeKind, OPEN_AGENTS_WINDOW_COMMAND_ID, OPEN_AGENTS_WINDOW_PRECONDITION, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from "../common/constants.js";
import { ChatContextKeys } from "../common/actions/chatContextKeys.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { localChatSessionType } from "../common/chatSessionsService.js";
import { TipTrackingCommands } from "./chatTipStorageKeys.js";
import {
  GENERATE_AGENT_COMMAND_ID,
  GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
  GENERATE_PROMPT_COMMAND_ID,
  GENERATE_SKILL_COMMAND_ID,
  INSERT_FORK_CONVERSATION_COMMAND_ID,
  INSERT_TROUBLESHOOT_COMMAND_ID
} from "./actions/chatActions.js";
var ChatTipTier = /* @__PURE__ */ ((ChatTipTier2) => {
  ChatTipTier2["Foundational"] = "foundational";
  ChatTipTier2["Qol"] = "qol";
  return ChatTipTier2;
})(ChatTipTier || {});
var ChatTipExperiment = /* @__PURE__ */ ((ChatTipExperiment2) => {
  ChatTipExperiment2["OpenAgentsWindowTip"] = "openagentswindowtip";
  return ChatTipExperiment2;
})(ChatTipExperiment || {});
function getCommandLabel(commandId) {
  const command = MenuRegistry.getCommand(commandId);
  if (command?.title) {
    return typeof command.title === "string" ? command.title : command.title.value;
  }
  const parts = commandId.split(".");
  return parts[parts.length - 1];
}
function formatKeybinding(ctx, commandId) {
  const kb = ctx.keybindingService.lookupKeybinding(commandId);
  return kb ? ` (${kb.getLabel()})` : "";
}
function extractCommandIds(markdown) {
  const commandPattern = /\[.*?\]\(command:([^?\s)]+)/g;
  const commands = /* @__PURE__ */ new Set();
  let match;
  while ((match = commandPattern.exec(markdown)) !== null) {
    commands.add(match[1]);
  }
  return [...commands];
}
const TIP_CATALOG = [
  {
    id: "tip.switchToAuto",
    tier: "foundational" /* Foundational */,
    priority: 0,
    buildMessage(_ctx) {
      return new MarkdownString(
        localize(
          "tip.switchToAuto",
          'Using GPT-4.1? Try switching to [Auto](command:workbench.action.chat.openModelPicker "Open Model Picker") in the model picker for better coding performance.'
        )
      );
    },
    onlyWhenModelIds: ["gpt-4.1"]
  },
  {
    id: "tip.init",
    tier: "foundational" /* Foundational */,
    priority: 50,
    buildMessage(ctx) {
      const kb = formatKeybinding(ctx, GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID);
      return new MarkdownString(
        localize(
          "tip.init",
          'Use [{0}](command:{1} "Run /init"){2} to generate or update a workspace instructions file for AI coding agents.',
          "/init",
          GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
          kb
        )
      );
    },
    when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
    excludeWhenCommandsExecuted: [
      GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
      TipTrackingCommands.CreateAgentInstructionsUsed
    ]
  },
  {
    id: "tip.createPrompt",
    tier: "foundational" /* Foundational */,
    buildMessage(ctx) {
      const kb = formatKeybinding(ctx, GENERATE_PROMPT_COMMAND_ID);
      return new MarkdownString(
        localize(
          "tip.createPrompt",
          'Use [{0}](command:{1} "Run /create-prompt"){2} to generate a reusable prompt file with the agent.',
          "/create-prompt",
          GENERATE_PROMPT_COMMAND_ID,
          kb
        )
      );
    },
    when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
    excludeWhenCommandsExecuted: [
      GENERATE_PROMPT_COMMAND_ID,
      TipTrackingCommands.CreatePromptUsed
    ]
  },
  {
    id: "tip.createAgent",
    tier: "foundational" /* Foundational */,
    priority: 30,
    buildMessage(ctx) {
      const kb = formatKeybinding(ctx, GENERATE_AGENT_COMMAND_ID);
      return new MarkdownString(
        localize(
          "tip.createAgent",
          'Use [{0}](command:{1} "Run /create-agent"){2} to scaffold a custom agent for your workflow.',
          "/create-agent",
          GENERATE_AGENT_COMMAND_ID,
          kb
        )
      );
    },
    when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
    excludeWhenCommandsExecuted: [
      GENERATE_AGENT_COMMAND_ID,
      TipTrackingCommands.CreateAgentUsed
    ]
  },
  {
    id: "tip.createSkill",
    tier: "foundational" /* Foundational */,
    priority: 40,
    buildMessage(ctx) {
      const kb = formatKeybinding(ctx, GENERATE_SKILL_COMMAND_ID);
      return new MarkdownString(
        localize(
          "tip.createSkill",
          'Use [{0}](command:{1} "Run /create-skill"){2} to create a skill the agent can load when relevant.',
          "/create-skill",
          GENERATE_SKILL_COMMAND_ID,
          kb
        )
      );
    },
    when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
    excludeWhenCommandsExecuted: [
      GENERATE_SKILL_COMMAND_ID,
      TipTrackingCommands.CreateSkillUsed
    ]
  },
  {
    id: "tip.planMode",
    tier: "foundational" /* Foundational */,
    priority: 20,
    buildMessage(ctx) {
      const kb = formatKeybinding(ctx, "workbench.action.chat.openPlan");
      return new MarkdownString(
        localize(
          "tip.planMode",
          'Try the [{0}](command:workbench.action.chat.openPlan "Start Plan Mode"){1} to research and plan before implementing changes.',
          "Plan agent",
          kb
        )
      );
    },
    when: ChatContextKeys.chatModeName.notEqualsTo("Plan"),
    excludeWhenCommandsExecuted: ["workbench.action.chat.openPlan"],
    excludeWhenModesUsed: ["Plan"]
  },
  {
    id: "tip.attachFiles",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize("tip.attachFiles", "Reference files or folders with # to give the agent more context about the task.")
      );
    },
    excludeWhenCommandsExecuted: [
      "workbench.action.chat.attachContext",
      "workbench.action.chat.attachFile",
      "workbench.action.chat.attachFolder",
      "workbench.action.chat.attachSelection",
      TipTrackingCommands.AttachFilesReferenceUsed
    ]
  },
  {
    id: "tip.codeActions",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize("tip.codeActions", "Select a code block in the editor and right-click to access more AI actions.")
      );
    },
    excludeWhenCommandsExecuted: ["inlineChat.start"]
  },
  {
    id: "tip.undoChanges",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize("tip.undoChanges", 'Hover a previous request and select "Restore Checkpoint" to undo changes after that point in the chat conversation.')
      );
    },
    when: ContextKeyExpr.and(
      ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
      ContextKeyExpr.or(
        ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
        ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Edit)
      )
    ),
    excludeWhenCommandsExecuted: ["workbench.action.chat.restoreCheckpoint", "workbench.action.chat.restoreLastCheckpoint"]
  },
  {
    id: "tip.messageQueueing",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize("tip.messageQueueing", "Steer the agent mid-task by sending follow-up messages. They queue and apply in order.")
      );
    },
    when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
    excludeWhenCommandsExecuted: ["workbench.action.chat.queueMessage", "workbench.action.chat.steerWithMessage"]
  },
  {
    id: "tip.forkConversation",
    tier: "qol" /* Qol */,
    buildMessage(ctx) {
      const kb = formatKeybinding(ctx, INSERT_FORK_CONVERSATION_COMMAND_ID);
      return new MarkdownString(
        localize(
          "tip.forkConversation",
          'Use [{0}](command:{1} "Run /fork"){2} to branch the conversation. Explore a different approach without losing the original context.',
          "/fork",
          INSERT_FORK_CONVERSATION_COMMAND_ID,
          kb
        )
      );
    },
    excludeWhenCommandsExecuted: [
      INSERT_FORK_CONVERSATION_COMMAND_ID,
      "workbench.action.chat.forkConversation",
      TipTrackingCommands.ForkConversationUsed
    ]
  },
  {
    id: "tip.mermaid",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize("tip.mermaid", "Ask the agent to draw an architectural diagram or flow chart. It can render Mermaid diagrams directly in chat.")
      );
    },
    when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
    excludeWhenToolsInvoked: ["renderMermaidDiagram"]
  },
  {
    id: "tip.subagents",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize("tip.subagents", "Have another task to work on? Start a new session to run multiple agents at once.")
      );
    },
    when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
    excludeWhenToolsInvoked: ["runSubagent"]
  },
  {
    id: "tip.thinkingPhrases",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize(
          "tip.thinkingPhrases",
          'Customize the loading messages shown while the agent works with [{0}](command:workbench.action.openSettings?%5B%22{1}%22%5D "Open Settings").',
          "thinking phrases",
          ChatConfiguration.ThinkingPhrases
        )
      );
    },
    when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
    excludeWhenSettingsChanged: [ChatConfiguration.ThinkingPhrases],
    dismissWhenCommandsClicked: ["workbench.action.openSettings"]
  },
  {
    id: "tip.autoAcceptDelay",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize(
          "tip.autoAcceptDelay",
          'Configure [{0}](command:workbench.action.openSettings?%5B%22chat.editing.autoAcceptDelay%22%5D "Open Settings") to automatically accept changes from the agent after a short countdown.',
          "auto-accept delay"
        )
      );
    },
    when: ContextKeyExpr.or(
      ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
      ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Edit)
    ),
    excludeWhenSettingsChanged: ["chat.editing.autoAcceptDelay"],
    dismissWhenCommandsClicked: ["workbench.action.openSettings"]
  },
  {
    id: "tip.troubleshoot",
    tier: "qol" /* Qol */,
    buildMessage(ctx) {
      const kb = formatKeybinding(ctx, INSERT_TROUBLESHOOT_COMMAND_ID);
      return new MarkdownString(
        localize(
          "tip.troubleshoot",
          'Something not working? Type [{0}](command:{1} "Run /troubleshoot"){2} <question> to diagnose issues from debug logs.',
          "/troubleshoot",
          INSERT_TROUBLESHOOT_COMMAND_ID,
          kb
        )
      );
    },
    when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
    excludeWhenToolsInvoked: ["listDebugEvents"]
  },
  {
    id: "tip.agentsWindow",
    tier: "qol" /* Qol */,
    buildMessage(ctx) {
      const defaultMessage = localize(
        "tip.agentsWindow",
        'Work across multiple projects at once in the [Agents window](command:{0} "Open Agents Window").',
        OPEN_AGENTS_WINDOW_COMMAND_ID
      );
      const experimentalTemplate = ctx.experimentalTipMessages.get("openagentswindowtip" /* OpenAgentsWindowTip */);
      const message = experimentalTemplate ? experimentalTemplate.replace(/\{0\}/g, OPEN_AGENTS_WINDOW_COMMAND_ID) : defaultMessage;
      return new MarkdownString(message);
    },
    when: ContextKeyExpr.and(IsWebContext.negate(), OPEN_AGENTS_WINDOW_PRECONDITION),
    excludeWhenCommandsExecuted: [
      OPEN_AGENTS_WINDOW_COMMAND_ID,
      OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID
    ]
  },
  {
    id: "tip.copilotCli",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize(
          "tip.copilotCli",
          'Run agents in parallel with [Copilot CLI](command:workbench.action.chat.openNewChatSessionInPlace.copilotcli?%5B%22sidebar%22%5D "Switch to Copilot CLI").'
        )
      );
    },
    when: ContextKeyExpr.and(
      IsSessionsWindowContext.negate(),
      ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
      ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
      ChatContextKeys.hasCanDelegateProviders
    ),
    excludeWhenCommandsExecuted: ["workbench.action.chat.openNewChatSessionInPlace.copilotcli"]
  },
  {
    id: "tip.defaultPermissions",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize(
          "tip.defaultPermissions",
          'Configure [{0}](command:workbench.action.openSettings?%5B%22{1}%22%5D "Open Settings") to start new sessions in Bypass Approvals or Autopilot mode.',
          "default permissions",
          ChatConfiguration.DefaultPermissionLevel
        )
      );
    },
    when: ContextKeyExpr.or(
      ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
      ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Edit)
    ),
    excludeWhenSettingsChanged: [ChatConfiguration.DefaultPermissionLevel],
    dismissWhenCommandsClicked: ["workbench.action.openSettings"]
  }
];
export {
  ChatTipExperiment,
  ChatTipTier,
  TIP_CATALOG,
  extractCommandIds,
  getCommandLabel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0VGlwQ2F0YWxvZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJc1dlYkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCwgT1BFTl9BR0VOVFNfV0lORE9XX0NPTU1BTkRfSUQsIE9QRU5fQUdFTlRTX1dJTkRPV19QUkVDT05ESVRJT04sIE9QRU5fV09SS1NQQUNFX0lOX0FHRU5UU19XSU5ET1dfQ09NTUFORF9JRCB9IGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRpcEV4Y2x1c2lvbkNvbmZpZyB9IGZyb20gJy4vY2hhdFRpcEVsaWdpYmlsaXR5VHJhY2tlci5qcyc7XG5pbXBvcnQgeyBUaXBUcmFja2luZ0NvbW1hbmRzIH0gZnJvbSAnLi9jaGF0VGlwU3RvcmFnZUtleXMuanMnO1xuaW1wb3J0IHtcblx0R0VORVJBVEVfQUdFTlRfQ09NTUFORF9JRCxcblx0R0VORVJBVEVfQUdFTlRfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQsXG5cdEdFTkVSQVRFX1BST01QVF9DT01NQU5EX0lELFxuXHRHRU5FUkFURV9TS0lMTF9DT01NQU5EX0lELFxuXHRJTlNFUlRfRk9SS19DT05WRVJTQVRJT05fQ09NTUFORF9JRCxcblx0SU5TRVJUX1RST1VCTEVTSE9PVF9DT01NQU5EX0lELFxufSBmcm9tICcuL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBDaGF0VGlwVGllciB7XG5cdEZvdW5kYXRpb25hbCA9ICdmb3VuZGF0aW9uYWwnLFxuXHRRb2wgPSAncW9sJyxcbn1cblxuLyoqXG4gKiBUcmVhdG1lbnQgbmFtZXMgZm9yIHRpcCBtZXNzYWdlcyBvdmVycmlkYWJsZSB2aWEgdGhlIHdvcmtiZW5jaCBhc3NpZ25tZW50IHNlcnZpY2UuXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIENoYXRUaXBFeHBlcmltZW50IHtcblx0T3BlbkFnZW50c1dpbmRvd1RpcCA9ICdvcGVuYWdlbnRzd2luZG93dGlwJyxcbn1cblxuLyoqXG4gKiBDb250ZXh0IHByb3ZpZGVkIHRvIHRpcCBidWlsZGVycyBmb3IgZHluYW1pYyBtZXNzYWdlIGNvbnN0cnVjdGlvbi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGlwQnVpbGRDb250ZXh0IHtcblx0LyoqXG5cdCAqIEtleWJpbmRpbmcgc2VydmljZSBmb3IgbG9va2luZyB1cCBrZXlib2FyZCBzaG9ydGN1dHMuXG5cdCAqL1xuXHRyZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlO1xuXHQvKipcblx0ICogRXhwZXJpbWVudGFsIHRpcCBtZXNzYWdlIG92ZXJyaWRlcyBrZXllZCBieSB0cmVhdG1lbnQgbmFtZSAoc2VlIHtAbGluayBDaGF0VGlwRXhwZXJpbWVudH0pLlxuXHQgKiBCdWlsZGVycyBzaG91bGQgZmFsbCBiYWNrIHRvIHRoZWlyIGRlZmF1bHQgbG9jYWxpemVkIHN0cmluZ3Mgd2hlbiBhIHRyZWF0bWVudCBpcyBub3Qgc2V0LlxuXHQgKi9cblx0cmVhZG9ubHkgZXhwZXJpbWVudGFsVGlwTWVzc2FnZXM6IFJlYWRvbmx5TWFwPHN0cmluZywgc3RyaW5nPjtcbn1cblxuLyoqXG4gKiBHZXRzIHRoZSBkaXNwbGF5IGxhYmVsIGZvciBhIGNvbW1hbmQsIGxvb2tpbmcgaXQgdXAgZnJvbSBNZW51UmVnaXN0cnkuXG4gKiBGYWxscyBiYWNrIHRvIGV4dHJhY3RpbmcgYSByZWFkYWJsZSBuYW1lIGZyb20gdGhlIGNvbW1hbmQgSUQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb21tYW5kTGFiZWwoY29tbWFuZElkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBjb21tYW5kID0gTWVudVJlZ2lzdHJ5LmdldENvbW1hbmQoY29tbWFuZElkKTtcblx0aWYgKGNvbW1hbmQ/LnRpdGxlKSB7XG5cdFx0Ly8gSGFuZGxlIGJvdGggc3RyaW5nIGFuZCBJTG9jYWxpemVkU3RyaW5nIGZvcm1hdHNcblx0XHRyZXR1cm4gdHlwZW9mIGNvbW1hbmQudGl0bGUgPT09ICdzdHJpbmcnID8gY29tbWFuZC50aXRsZSA6IGNvbW1hbmQudGl0bGUudmFsdWU7XG5cdH1cblx0Ly8gRmFsbGJhY2s6IGV4dHJhY3QgcmVhZGFibGUgbmFtZSBmcm9tIGNvbW1hbmQgSURcblx0Ly8gZS5nLiwgJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuRWRpdFNlc3Npb24nIC0+ICdvcGVuRWRpdFNlc3Npb24nXG5cdGNvbnN0IHBhcnRzID0gY29tbWFuZElkLnNwbGl0KCcuJyk7XG5cdHJldHVybiBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXTtcbn1cblxuLyoqXG4gKiBGb3JtYXRzIGEga2V5YmluZGluZyBmb3IgZGlzcGxheSBpbiBhIHRpcCBtZXNzYWdlLlxuICogUmV0dXJucyBlbXB0eSBzdHJpbmcgaWYgbm8ga2V5YmluZGluZyBpcyBib3VuZC5cbiAqL1xuZnVuY3Rpb24gZm9ybWF0S2V5YmluZGluZyhjdHg6IElUaXBCdWlsZENvbnRleHQsIGNvbW1hbmRJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3Qga2IgPSBjdHgua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhjb21tYW5kSWQpO1xuXHRyZXR1cm4ga2IgPyBgICgke2tiLmdldExhYmVsKCl9KWAgOiAnJztcbn1cblxuLyoqXG4gKiBFeHRyYWN0cyBjb21tYW5kIElEcyBmcm9tIGNvbW1hbmQ6IGxpbmtzIGluIGEgbWFya2Rvd24gc3RyaW5nLlxuICogVXNlZCB0byBhdXRvbWF0aWNhbGx5IHBvcHVsYXRlIGVuYWJsZWRDb21tYW5kcyBmb3IgdHJ1c3RlZCBtYXJrZG93bi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RDb21tYW5kSWRzKG1hcmtkb3duOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGNvbW1hbmRQYXR0ZXJuID0gL1xcWy4qP1xcXVxcKGNvbW1hbmQ6KFteP1xccyldKykvZztcblx0Y29uc3QgY29tbWFuZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0bGV0IG1hdGNoO1xuXHR3aGlsZSAoKG1hdGNoID0gY29tbWFuZFBhdHRlcm4uZXhlYyhtYXJrZG93bikpICE9PSBudWxsKSB7XG5cdFx0Y29tbWFuZHMuYWRkKG1hdGNoWzFdKTtcblx0fVxuXHRyZXR1cm4gWy4uLmNvbW1hbmRzXTtcbn1cblxuLyoqXG4gKiBJbnRlcmZhY2UgZm9yIHRpcCBkZWZpbml0aW9ucyBpbiB0aGUgY2F0YWxvZy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGlwRGVmaW5pdGlvbiBleHRlbmRzIElUaXBFeGNsdXNpb25Db25maWcge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSB0aWVyOiBDaGF0VGlwVGllcjtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIHByaW9yaXR5IGZvciBvcmRlcmluZyB0aXBzIHdpdGhpbiB0aGUgc2FtZSB0aWVyLlxuXHQgKiBMb3dlciB2YWx1ZXMgYXJlIHNob3duIGZpcnN0LlxuXHQgKi9cblx0cmVhZG9ubHkgcHJpb3JpdHk/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBCdWlsZHMgdGhlIHRpcCBtZXNzYWdlIGR5bmFtaWNhbGx5IGF0IHJ1bnRpbWUuXG5cdCAqIFRoaXMgZW5hYmxlcyBrZXliaW5kaW5ncyBhbmQgY29tbWFuZCBsYWJlbHMgdG8gYmUgbG9va2VkIHVwIGZyZXNoLlxuXHQgKiBUaGUgcmV0dXJuZWQgTWFya2Rvd25TdHJpbmcgc2hvdWxkIE5PVCBpbmNsdWRlIHRoZSBcIlRpcDpcIiBwcmVmaXguXG5cdCAqL1xuXHRidWlsZE1lc3NhZ2UoY3R4OiBJVGlwQnVpbGRDb250ZXh0KTogTWFya2Rvd25TdHJpbmc7XG5cdC8qKlxuXHQgKiBXaGVuIGNsYXVzZSBleHByZXNzaW9uIHRoYXQgZGV0ZXJtaW5lcyBpZiB0aGlzIHRpcCBpcyBlbGlnaWJsZSB0byBiZSBzaG93bi5cblx0ICovXG5cdHJlYWRvbmx5IHdoZW4/OiBDb250ZXh0S2V5RXhwcmVzc2lvbjtcblx0LyoqXG5cdCAqIENoYXQgbW9kZWwgSURzIGZvciB3aGljaCB0aGlzIHRpcCBpcyBlbGlnaWJsZSAobG93ZXJjYXNlKS5cblx0ICovXG5cdHJlYWRvbmx5IG9ubHlXaGVuTW9kZWxJZHM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0LyoqXG5cdCAqIFNldHRpbmcga2V5cyB0aGF0LCBpZiBjaGFuZ2VkIGZyb20gZGVmYXVsdCwgbWFrZSB0aGlzIHRpcCBpbmVsaWdpYmxlLlxuXHQgKi9cblx0cmVhZG9ubHkgZXhjbHVkZVdoZW5TZXR0aW5nc0NoYW5nZWQ/OiByZWFkb25seSBzdHJpbmdbXTtcblx0LyoqXG5cdCAqIENvbW1hbmQgSURzIHRoYXQgZGlzbWlzcyB0aGlzIHRpcCB3aGVuIGNsaWNrZWQgZnJvbSB0aGUgdGlwIG1hcmtkb3duLlxuXHQgKi9cblx0cmVhZG9ubHkgZGlzbWlzc1doZW5Db21tYW5kc0NsaWNrZWQ/OiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFRpcCBDYXRhbG9nXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIFN0YXRpYyBjYXRhbG9nIG9mIHRpcHMuIFRpcHMgYXJlIGJ1aWx0IGR5bmFtaWNhbGx5IGF0IHJ1bnRpbWUgdG8gZW5hYmxlXG4gKiBrZXliaW5kaW5ncyBhbmQgY29tbWFuZCBsYWJlbHMgdG8gYmUgcmVzb2x2ZWQgZnJlc2guXG4gKi9cbmV4cG9ydCBjb25zdCBUSVBfQ0FUQUxPRzogcmVhZG9ubHkgSVRpcERlZmluaXRpb25bXSA9IFtcblx0e1xuXHRcdGlkOiAndGlwLnN3aXRjaFRvQXV0bycsXG5cdFx0dGllcjogQ2hhdFRpcFRpZXIuRm91bmRhdGlvbmFsLFxuXHRcdHByaW9yaXR5OiAwLFxuXHRcdGJ1aWxkTWVzc2FnZShfY3R4KSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0XHQndGlwLnN3aXRjaFRvQXV0bycsXG5cdFx0XHRcdFx0XCJVc2luZyBHUFQtNC4xPyBUcnkgc3dpdGNoaW5nIHRvIFtBdXRvXShjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTW9kZWxQaWNrZXIgXFxcIk9wZW4gTW9kZWwgUGlja2VyXFxcIikgaW4gdGhlIG1vZGVsIHBpY2tlciBmb3IgYmV0dGVyIGNvZGluZyBwZXJmb3JtYW5jZS5cIlxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH0sXG5cdFx0b25seVdoZW5Nb2RlbElkczogWydncHQtNC4xJ10sXG5cdH0sXG5cdHtcblx0XHRpZDogJ3RpcC5pbml0Jyxcblx0XHR0aWVyOiBDaGF0VGlwVGllci5Gb3VuZGF0aW9uYWwsXG5cdFx0cHJpb3JpdHk6IDUwLFxuXHRcdGJ1aWxkTWVzc2FnZShjdHgpIHtcblx0XHRcdGNvbnN0IGtiID0gZm9ybWF0S2V5YmluZGluZyhjdHgsIEdFTkVSQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19DT01NQU5EX0lEKTtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoXG5cdFx0XHRcdGxvY2FsaXplKFxuXHRcdFx0XHRcdCd0aXAuaW5pdCcsXG5cdFx0XHRcdFx0XCJVc2UgW3swfV0oY29tbWFuZDp7MX0gXFxcIlJ1biAvaW5pdFxcXCIpezJ9IHRvIGdlbmVyYXRlIG9yIHVwZGF0ZSBhIHdvcmtzcGFjZSBpbnN0cnVjdGlvbnMgZmlsZSBmb3IgQUkgY29kaW5nIGFnZW50cy5cIixcblx0XHRcdFx0XHQnL2luaXQnLFxuXHRcdFx0XHRcdEdFTkVSQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19DT01NQU5EX0lELFxuXHRcdFx0XHRcdGtiXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fSxcblx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmlzRXF1YWxUbyhsb2NhbENoYXRTZXNzaW9uVHlwZSksXG5cdFx0ZXhjbHVkZVdoZW5Db21tYW5kc0V4ZWN1dGVkOiBbXG5cdFx0XHRHRU5FUkFURV9BR0VOVF9JTlNUUlVDVElPTlNfQ09NTUFORF9JRCxcblx0XHRcdFRpcFRyYWNraW5nQ29tbWFuZHMuQ3JlYXRlQWdlbnRJbnN0cnVjdGlvbnNVc2VkLFxuXHRcdF0sXG5cdH0sXG5cdHtcblx0XHRpZDogJ3RpcC5jcmVhdGVQcm9tcHQnLFxuXHRcdHRpZXI6IENoYXRUaXBUaWVyLkZvdW5kYXRpb25hbCxcblx0XHRidWlsZE1lc3NhZ2UoY3R4KSB7XG5cdFx0XHRjb25zdCBrYiA9IGZvcm1hdEtleWJpbmRpbmcoY3R4LCBHRU5FUkFURV9QUk9NUFRfQ09NTUFORF9JRCk7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0XHQndGlwLmNyZWF0ZVByb21wdCcsXG5cdFx0XHRcdFx0XCJVc2UgW3swfV0oY29tbWFuZDp7MX0gXFxcIlJ1biAvY3JlYXRlLXByb21wdFxcXCIpezJ9IHRvIGdlbmVyYXRlIGEgcmV1c2FibGUgcHJvbXB0IGZpbGUgd2l0aCB0aGUgYWdlbnQuXCIsXG5cdFx0XHRcdFx0Jy9jcmVhdGUtcHJvbXB0Jyxcblx0XHRcdFx0XHRHRU5FUkFURV9QUk9NUFRfQ09NTUFORF9JRCxcblx0XHRcdFx0XHRrYlxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH0sXG5cdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5pc0VxdWFsVG8obG9jYWxDaGF0U2Vzc2lvblR5cGUpLFxuXHRcdGV4Y2x1ZGVXaGVuQ29tbWFuZHNFeGVjdXRlZDogW1xuXHRcdFx0R0VORVJBVEVfUFJPTVBUX0NPTU1BTkRfSUQsXG5cdFx0XHRUaXBUcmFja2luZ0NvbW1hbmRzLkNyZWF0ZVByb21wdFVzZWQsXG5cdFx0XSxcblx0fSxcblx0e1xuXHRcdGlkOiAndGlwLmNyZWF0ZUFnZW50Jyxcblx0XHR0aWVyOiBDaGF0VGlwVGllci5Gb3VuZGF0aW9uYWwsXG5cdFx0cHJpb3JpdHk6IDMwLFxuXHRcdGJ1aWxkTWVzc2FnZShjdHgpIHtcblx0XHRcdGNvbnN0IGtiID0gZm9ybWF0S2V5YmluZGluZyhjdHgsIEdFTkVSQVRFX0FHRU5UX0NPTU1BTkRfSUQpO1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0J3RpcC5jcmVhdGVBZ2VudCcsXG5cdFx0XHRcdFx0XCJVc2UgW3swfV0oY29tbWFuZDp7MX0gXFxcIlJ1biAvY3JlYXRlLWFnZW50XFxcIil7Mn0gdG8gc2NhZmZvbGQgYSBjdXN0b20gYWdlbnQgZm9yIHlvdXIgd29ya2Zsb3cuXCIsXG5cdFx0XHRcdFx0Jy9jcmVhdGUtYWdlbnQnLFxuXHRcdFx0XHRcdEdFTkVSQVRFX0FHRU5UX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0a2Jcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9LFxuXHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUuaXNFcXVhbFRvKGxvY2FsQ2hhdFNlc3Npb25UeXBlKSxcblx0XHRleGNsdWRlV2hlbkNvbW1hbmRzRXhlY3V0ZWQ6IFtcblx0XHRcdEdFTkVSQVRFX0FHRU5UX0NPTU1BTkRfSUQsXG5cdFx0XHRUaXBUcmFja2luZ0NvbW1hbmRzLkNyZWF0ZUFnZW50VXNlZCxcblx0XHRdLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICd0aXAuY3JlYXRlU2tpbGwnLFxuXHRcdHRpZXI6IENoYXRUaXBUaWVyLkZvdW5kYXRpb25hbCxcblx0XHRwcmlvcml0eTogNDAsXG5cdFx0YnVpbGRNZXNzYWdlKGN0eCkge1xuXHRcdFx0Y29uc3Qga2IgPSBmb3JtYXRLZXliaW5kaW5nKGN0eCwgR0VORVJBVEVfU0tJTExfQ09NTUFORF9JRCk7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0XHQndGlwLmNyZWF0ZVNraWxsJyxcblx0XHRcdFx0XHRcIlVzZSBbezB9XShjb21tYW5kOnsxfSBcXFwiUnVuIC9jcmVhdGUtc2tpbGxcXFwiKXsyfSB0byBjcmVhdGUgYSBza2lsbCB0aGUgYWdlbnQgY2FuIGxvYWQgd2hlbiByZWxldmFudC5cIixcblx0XHRcdFx0XHQnL2NyZWF0ZS1za2lsbCcsXG5cdFx0XHRcdFx0R0VORVJBVEVfU0tJTExfQ09NTUFORF9JRCxcblx0XHRcdFx0XHRrYlxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH0sXG5cdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5pc0VxdWFsVG8obG9jYWxDaGF0U2Vzc2lvblR5cGUpLFxuXHRcdGV4Y2x1ZGVXaGVuQ29tbWFuZHNFeGVjdXRlZDogW1xuXHRcdFx0R0VORVJBVEVfU0tJTExfQ09NTUFORF9JRCxcblx0XHRcdFRpcFRyYWNraW5nQ29tbWFuZHMuQ3JlYXRlU2tpbGxVc2VkLFxuXHRcdF0sXG5cdH0sXG5cdHtcblx0XHRpZDogJ3RpcC5wbGFuTW9kZScsXG5cdFx0dGllcjogQ2hhdFRpcFRpZXIuRm91bmRhdGlvbmFsLFxuXHRcdHByaW9yaXR5OiAyMCxcblx0XHRidWlsZE1lc3NhZ2UoY3R4KSB7XG5cdFx0XHRjb25zdCBrYiA9IGZvcm1hdEtleWJpbmRpbmcoY3R4LCAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5QbGFuJyk7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0XHQndGlwLnBsYW5Nb2RlJyxcblx0XHRcdFx0XHRcIlRyeSB0aGUgW3swfV0oY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlblBsYW4gXFxcIlN0YXJ0IFBsYW4gTW9kZVxcXCIpezF9IHRvIHJlc2VhcmNoIGFuZCBwbGFuIGJlZm9yZSBpbXBsZW1lbnRpbmcgY2hhbmdlcy5cIixcblx0XHRcdFx0XHQnUGxhbiBhZ2VudCcsXG5cdFx0XHRcdFx0a2Jcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9LFxuXHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZU5hbWUubm90RXF1YWxzVG8oJ1BsYW4nKSxcblx0XHRleGNsdWRlV2hlbkNvbW1hbmRzRXhlY3V0ZWQ6IFsnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5QbGFuJ10sXG5cdFx0ZXhjbHVkZVdoZW5Nb2Rlc1VzZWQ6IFsnUGxhbiddLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICd0aXAuYXR0YWNoRmlsZXMnLFxuXHRcdHRpZXI6IENoYXRUaXBUaWVyLlFvbCxcblx0XHRidWlsZE1lc3NhZ2UoKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRsb2NhbGl6ZSgndGlwLmF0dGFjaEZpbGVzJywgXCJSZWZlcmVuY2UgZmlsZXMgb3IgZm9sZGVycyB3aXRoICMgdG8gZ2l2ZSB0aGUgYWdlbnQgbW9yZSBjb250ZXh0IGFib3V0IHRoZSB0YXNrLlwiKVxuXHRcdFx0KTtcblx0XHR9LFxuXHRcdGV4Y2x1ZGVXaGVuQ29tbWFuZHNFeGVjdXRlZDogW1xuXHRcdFx0J3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5hdHRhY2hDb250ZXh0Jyxcblx0XHRcdCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYXR0YWNoRmlsZScsXG5cdFx0XHQnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaEZvbGRlcicsXG5cdFx0XHQnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaFNlbGVjdGlvbicsXG5cdFx0XHRUaXBUcmFja2luZ0NvbW1hbmRzLkF0dGFjaEZpbGVzUmVmZXJlbmNlVXNlZCxcblx0XHRdLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICd0aXAuY29kZUFjdGlvbnMnLFxuXHRcdHRpZXI6IENoYXRUaXBUaWVyLlFvbCxcblx0XHRidWlsZE1lc3NhZ2UoKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRsb2NhbGl6ZSgndGlwLmNvZGVBY3Rpb25zJywgXCJTZWxlY3QgYSBjb2RlIGJsb2NrIGluIHRoZSBlZGl0b3IgYW5kIHJpZ2h0LWNsaWNrIHRvIGFjY2VzcyBtb3JlIEFJIGFjdGlvbnMuXCIpXG5cdFx0XHQpO1xuXHRcdH0sXG5cdFx0ZXhjbHVkZVdoZW5Db21tYW5kc0V4ZWN1dGVkOiBbJ2lubGluZUNoYXQuc3RhcnQnXSxcblx0fSxcblx0e1xuXHRcdGlkOiAndGlwLnVuZG9DaGFuZ2VzJyxcblx0XHR0aWVyOiBDaGF0VGlwVGllci5Rb2wsXG5cdFx0YnVpbGRNZXNzYWdlKCkge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0bG9jYWxpemUoJ3RpcC51bmRvQ2hhbmdlcycsIFwiSG92ZXIgYSBwcmV2aW91cyByZXF1ZXN0IGFuZCBzZWxlY3QgXFxcIlJlc3RvcmUgQ2hlY2twb2ludFxcXCIgdG8gdW5kbyBjaGFuZ2VzIGFmdGVyIHRoYXQgcG9pbnQgaW4gdGhlIGNoYXQgY29udmVyc2F0aW9uLlwiKVxuXHRcdFx0KTtcblx0XHR9LFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUuaXNFcXVhbFRvKGxvY2FsQ2hhdFNlc3Npb25UeXBlKSxcblx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmlzRXF1YWxUbyhDaGF0TW9kZUtpbmQuQWdlbnQpLFxuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmlzRXF1YWxUbyhDaGF0TW9kZUtpbmQuRWRpdCksXG5cdFx0XHQpLFxuXHRcdCksXG5cdFx0ZXhjbHVkZVdoZW5Db21tYW5kc0V4ZWN1dGVkOiBbJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5yZXN0b3JlQ2hlY2twb2ludCcsICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVzdG9yZUxhc3RDaGVja3BvaW50J10sXG5cdH0sXG5cdHtcblx0XHRpZDogJ3RpcC5tZXNzYWdlUXVldWVpbmcnLFxuXHRcdHRpZXI6IENoYXRUaXBUaWVyLlFvbCxcblx0XHRidWlsZE1lc3NhZ2UoKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRsb2NhbGl6ZSgndGlwLm1lc3NhZ2VRdWV1ZWluZycsIFwiU3RlZXIgdGhlIGFnZW50IG1pZC10YXNrIGJ5IHNlbmRpbmcgZm9sbG93LXVwIG1lc3NhZ2VzLiBUaGV5IHF1ZXVlIGFuZCBhcHBseSBpbiBvcmRlci5cIilcblx0XHRcdCk7XG5cdFx0fSxcblx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmlzRXF1YWxUbyhDaGF0TW9kZUtpbmQuQWdlbnQpLFxuXHRcdGV4Y2x1ZGVXaGVuQ29tbWFuZHNFeGVjdXRlZDogWyd3b3JrYmVuY2guYWN0aW9uLmNoYXQucXVldWVNZXNzYWdlJywgJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zdGVlcldpdGhNZXNzYWdlJ10sXG5cdH0sXG5cdHtcblx0XHRpZDogJ3RpcC5mb3JrQ29udmVyc2F0aW9uJyxcblx0XHR0aWVyOiBDaGF0VGlwVGllci5Rb2wsXG5cdFx0YnVpbGRNZXNzYWdlKGN0eCkge1xuXHRcdFx0Y29uc3Qga2IgPSBmb3JtYXRLZXliaW5kaW5nKGN0eCwgSU5TRVJUX0ZPUktfQ09OVkVSU0FUSU9OX0NPTU1BTkRfSUQpO1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0J3RpcC5mb3JrQ29udmVyc2F0aW9uJyxcblx0XHRcdFx0XHRcIlVzZSBbezB9XShjb21tYW5kOnsxfSBcXFwiUnVuIC9mb3JrXFxcIil7Mn0gdG8gYnJhbmNoIHRoZSBjb252ZXJzYXRpb24uIEV4cGxvcmUgYSBkaWZmZXJlbnQgYXBwcm9hY2ggd2l0aG91dCBsb3NpbmcgdGhlIG9yaWdpbmFsIGNvbnRleHQuXCIsXG5cdFx0XHRcdFx0Jy9mb3JrJyxcblx0XHRcdFx0XHRJTlNFUlRfRk9SS19DT05WRVJTQVRJT05fQ09NTUFORF9JRCxcblx0XHRcdFx0XHRrYlxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH0sXG5cdFx0ZXhjbHVkZVdoZW5Db21tYW5kc0V4ZWN1dGVkOiBbXG5cdFx0XHRJTlNFUlRfRk9SS19DT05WRVJTQVRJT05fQ09NTUFORF9JRCxcblx0XHRcdCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZm9ya0NvbnZlcnNhdGlvbicsXG5cdFx0XHRUaXBUcmFja2luZ0NvbW1hbmRzLkZvcmtDb252ZXJzYXRpb25Vc2VkLFxuXHRcdF0sXG5cdH0sXG5cdHtcblx0XHRpZDogJ3RpcC5tZXJtYWlkJyxcblx0XHR0aWVyOiBDaGF0VGlwVGllci5Rb2wsXG5cdFx0YnVpbGRNZXNzYWdlKCkge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0bG9jYWxpemUoJ3RpcC5tZXJtYWlkJywgXCJBc2sgdGhlIGFnZW50IHRvIGRyYXcgYW4gYXJjaGl0ZWN0dXJhbCBkaWFncmFtIG9yIGZsb3cgY2hhcnQuIEl0IGNhbiByZW5kZXIgTWVybWFpZCBkaWFncmFtcyBkaXJlY3RseSBpbiBjaGF0LlwiKVxuXHRcdFx0KTtcblx0XHR9LFxuXHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQuaXNFcXVhbFRvKENoYXRNb2RlS2luZC5BZ2VudCksXG5cdFx0ZXhjbHVkZVdoZW5Ub29sc0ludm9rZWQ6IFsncmVuZGVyTWVybWFpZERpYWdyYW0nXSxcblx0fSxcblx0e1xuXHRcdGlkOiAndGlwLnN1YmFnZW50cycsXG5cdFx0dGllcjogQ2hhdFRpcFRpZXIuUW9sLFxuXHRcdGJ1aWxkTWVzc2FnZSgpIHtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoXG5cdFx0XHRcdGxvY2FsaXplKCd0aXAuc3ViYWdlbnRzJywgXCJIYXZlIGFub3RoZXIgdGFzayB0byB3b3JrIG9uPyBTdGFydCBhIG5ldyBzZXNzaW9uIHRvIHJ1biBtdWx0aXBsZSBhZ2VudHMgYXQgb25jZS5cIilcblx0XHRcdCk7XG5cdFx0fSxcblx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmlzRXF1YWxUbyhDaGF0TW9kZUtpbmQuQWdlbnQpLFxuXHRcdGV4Y2x1ZGVXaGVuVG9vbHNJbnZva2VkOiBbJ3J1blN1YmFnZW50J10sXG5cdH0sXG5cdHtcblx0XHRpZDogJ3RpcC50aGlua2luZ1BocmFzZXMnLFxuXHRcdHRpZXI6IENoYXRUaXBUaWVyLlFvbCxcblx0XHRidWlsZE1lc3NhZ2UoKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0XHQndGlwLnRoaW5raW5nUGhyYXNlcycsXG5cdFx0XHRcdFx0XCJDdXN0b21pemUgdGhlIGxvYWRpbmcgbWVzc2FnZXMgc2hvd24gd2hpbGUgdGhlIGFnZW50IHdvcmtzIHdpdGggW3swfV0oY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncz8lNUIlMjJ7MX0lMjIlNUQgXFxcIk9wZW4gU2V0dGluZ3NcXFwiKS5cIixcblx0XHRcdFx0XHQndGhpbmtpbmcgcGhyYXNlcycsXG5cdFx0XHRcdFx0Q2hhdENvbmZpZ3VyYXRpb24uVGhpbmtpbmdQaHJhc2VzXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fSxcblx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmlzRXF1YWxUbyhDaGF0TW9kZUtpbmQuQWdlbnQpLFxuXHRcdGV4Y2x1ZGVXaGVuU2V0dGluZ3NDaGFuZ2VkOiBbQ2hhdENvbmZpZ3VyYXRpb24uVGhpbmtpbmdQaHJhc2VzXSxcblx0XHRkaXNtaXNzV2hlbkNvbW1hbmRzQ2xpY2tlZDogWyd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncyddLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICd0aXAuYXV0b0FjY2VwdERlbGF5Jyxcblx0XHR0aWVyOiBDaGF0VGlwVGllci5Rb2wsXG5cdFx0YnVpbGRNZXNzYWdlKCkge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0J3RpcC5hdXRvQWNjZXB0RGVsYXknLFxuXHRcdFx0XHRcdFwiQ29uZmlndXJlIFt7MH1dKGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3M/JTVCJTIyY2hhdC5lZGl0aW5nLmF1dG9BY2NlcHREZWxheSUyMiU1RCBcXFwiT3BlbiBTZXR0aW5nc1xcXCIpIHRvIGF1dG9tYXRpY2FsbHkgYWNjZXB0IGNoYW5nZXMgZnJvbSB0aGUgYWdlbnQgYWZ0ZXIgYSBzaG9ydCBjb3VudGRvd24uXCIsXG5cdFx0XHRcdFx0J2F1dG8tYWNjZXB0IGRlbGF5J1xuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH0sXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmlzRXF1YWxUbyhDaGF0TW9kZUtpbmQuQWdlbnQpLFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5pc0VxdWFsVG8oQ2hhdE1vZGVLaW5kLkVkaXQpLFxuXHRcdCksXG5cdFx0ZXhjbHVkZVdoZW5TZXR0aW5nc0NoYW5nZWQ6IFsnY2hhdC5lZGl0aW5nLmF1dG9BY2NlcHREZWxheSddLFxuXHRcdGRpc21pc3NXaGVuQ29tbWFuZHNDbGlja2VkOiBbJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJ10sXG5cdH0sXG5cdHtcblx0XHRpZDogJ3RpcC50cm91Ymxlc2hvb3QnLFxuXHRcdHRpZXI6IENoYXRUaXBUaWVyLlFvbCxcblx0XHRidWlsZE1lc3NhZ2UoY3R4KSB7XG5cdFx0XHRjb25zdCBrYiA9IGZvcm1hdEtleWJpbmRpbmcoY3R4LCBJTlNFUlRfVFJPVUJMRVNIT09UX0NPTU1BTkRfSUQpO1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0J3RpcC50cm91Ymxlc2hvb3QnLFxuXHRcdFx0XHRcdFwiU29tZXRoaW5nIG5vdCB3b3JraW5nPyBUeXBlIFt7MH1dKGNvbW1hbmQ6ezF9IFxcXCJSdW4gL3Ryb3VibGVzaG9vdFxcXCIpezJ9IDxxdWVzdGlvbj4gdG8gZGlhZ25vc2UgaXNzdWVzIGZyb20gZGVidWcgbG9ncy5cIixcblx0XHRcdFx0XHQnL3Ryb3VibGVzaG9vdCcsXG5cdFx0XHRcdFx0SU5TRVJUX1RST1VCTEVTSE9PVF9DT01NQU5EX0lELFxuXHRcdFx0XHRcdGtiXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fSxcblx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmlzRXF1YWxUbyhsb2NhbENoYXRTZXNzaW9uVHlwZSksXG5cdFx0ZXhjbHVkZVdoZW5Ub29sc0ludm9rZWQ6IFsnbGlzdERlYnVnRXZlbnRzJ10sXG5cdH0sXG5cdHtcblx0XHRpZDogJ3RpcC5hZ2VudHNXaW5kb3cnLFxuXHRcdHRpZXI6IENoYXRUaXBUaWVyLlFvbCxcblx0XHRidWlsZE1lc3NhZ2UoY3R4KSB7XG5cdFx0XHRjb25zdCBkZWZhdWx0TWVzc2FnZSA9IGxvY2FsaXplKFxuXHRcdFx0XHQndGlwLmFnZW50c1dpbmRvdycsXG5cdFx0XHRcdFwiV29yayBhY3Jvc3MgbXVsdGlwbGUgcHJvamVjdHMgYXQgb25jZSBpbiB0aGUgW0FnZW50cyB3aW5kb3ddKGNvbW1hbmQ6ezB9IFxcXCJPcGVuIEFnZW50cyBXaW5kb3dcXFwiKS5cIixcblx0XHRcdFx0T1BFTl9BR0VOVFNfV0lORE9XX0NPTU1BTkRfSURcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBleHBlcmltZW50YWxUZW1wbGF0ZSA9IGN0eC5leHBlcmltZW50YWxUaXBNZXNzYWdlcy5nZXQoQ2hhdFRpcEV4cGVyaW1lbnQuT3BlbkFnZW50c1dpbmRvd1RpcCk7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gZXhwZXJpbWVudGFsVGVtcGxhdGVcblx0XHRcdFx0PyBleHBlcmltZW50YWxUZW1wbGF0ZS5yZXBsYWNlKC9cXHswXFx9L2csIE9QRU5fQUdFTlRTX1dJTkRPV19DT01NQU5EX0lEKVxuXHRcdFx0XHQ6IGRlZmF1bHRNZXNzYWdlO1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhtZXNzYWdlKTtcblx0XHR9LFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1dlYkNvbnRleHQubmVnYXRlKCksIE9QRU5fQUdFTlRTX1dJTkRPV19QUkVDT05ESVRJT04pLFxuXHRcdGV4Y2x1ZGVXaGVuQ29tbWFuZHNFeGVjdXRlZDogW1xuXHRcdFx0T1BFTl9BR0VOVFNfV0lORE9XX0NPTU1BTkRfSUQsXG5cdFx0XHRPUEVOX1dPUktTUEFDRV9JTl9BR0VOVFNfV0lORE9XX0NPTU1BTkRfSUQsXG5cdFx0XSxcblx0fSxcblx0e1xuXHRcdGlkOiAndGlwLmNvcGlsb3RDbGknLFxuXHRcdHRpZXI6IENoYXRUaXBUaWVyLlFvbCxcblx0XHRidWlsZE1lc3NhZ2UoKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0XHQndGlwLmNvcGlsb3RDbGknLFxuXHRcdFx0XHRcdFwiUnVuIGFnZW50cyBpbiBwYXJhbGxlbCB3aXRoIFtDb3BpbG90IENMSV0oY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk5ld0NoYXRTZXNzaW9uSW5QbGFjZS5jb3BpbG90Y2xpPyU1QiUyMnNpZGViYXIlMjIlNUQgXFxcIlN3aXRjaCB0byBDb3BpbG90IENMSVxcXCIpLlwiXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fSxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSxcblx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUuaXNFcXVhbFRvKGxvY2FsQ2hhdFNlc3Npb25UeXBlKSxcblx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQuaXNFcXVhbFRvKENoYXRNb2RlS2luZC5BZ2VudCksXG5cdFx0XHRDaGF0Q29udGV4dEtleXMuaGFzQ2FuRGVsZWdhdGVQcm92aWRlcnMsXG5cdFx0KSxcblx0XHRleGNsdWRlV2hlbkNvbW1hbmRzRXhlY3V0ZWQ6IFsnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5OZXdDaGF0U2Vzc2lvbkluUGxhY2UuY29waWxvdGNsaSddLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICd0aXAuZGVmYXVsdFBlcm1pc3Npb25zJyxcblx0XHR0aWVyOiBDaGF0VGlwVGllci5Rb2wsXG5cdFx0YnVpbGRNZXNzYWdlKCkge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0J3RpcC5kZWZhdWx0UGVybWlzc2lvbnMnLFxuXHRcdFx0XHRcdFwiQ29uZmlndXJlIFt7MH1dKGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3M/JTVCJTIyezF9JTIyJTVEIFxcXCJPcGVuIFNldHRpbmdzXFxcIikgdG8gc3RhcnQgbmV3IHNlc3Npb25zIGluIEJ5cGFzcyBBcHByb3ZhbHMgb3IgQXV0b3BpbG90IG1vZGUuXCIsXG5cdFx0XHRcdFx0J2RlZmF1bHQgcGVybWlzc2lvbnMnLFxuXHRcdFx0XHRcdENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRQZXJtaXNzaW9uTGV2ZWxcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9LFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5pc0VxdWFsVG8oQ2hhdE1vZGVLaW5kLkFnZW50KSxcblx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQuaXNFcXVhbFRvKENoYXRNb2RlS2luZC5FZGl0KSxcblx0XHQpLFxuXHRcdGV4Y2x1ZGVXaGVuU2V0dGluZ3NDaGFuZ2VkOiBbQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFBlcm1pc3Npb25MZXZlbF0sXG5cdFx0ZGlzbWlzc1doZW5Db21tYW5kc0NsaWNrZWQ6IFsnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnXSxcblx0fSxcbl07XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUE0QztBQUNyRCxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQixjQUFjLCtCQUErQixpQ0FBaUMsa0RBQWtEO0FBQzVKLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsMkJBQTJCO0FBQ3BDO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUVBLElBQVcsY0FBWCxrQkFBV0EsaUJBQVg7QUFDTixFQUFBQSxhQUFBLGtCQUFlO0FBQ2YsRUFBQUEsYUFBQSxTQUFNO0FBRlcsU0FBQUE7QUFBQSxHQUFBO0FBUVgsSUFBVyxvQkFBWCxrQkFBV0MsdUJBQVg7QUFDTixFQUFBQSxtQkFBQSx5QkFBc0I7QUFETCxTQUFBQTtBQUFBLEdBQUE7QUF1QlgsU0FBUyxnQkFBZ0IsV0FBMkI7QUFDMUQsUUFBTSxVQUFV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Q0osTUFBTTtBQUFBLElBQ04sYUFBYSxLQUFLO0FBQ2pCLFlBQU0sS0FBSyxpQkFBaUIsS0FBSyw4QkFBOEI7QUFDL0QsYUFBTyxJQUFJO0FBQUEsUUFDVjtBQUFBLFVBQ0M7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxNQUFNLGdCQUFnQixnQkFBZ0IsVUFBVSxvQkFBb0I7QUFBQSxJQUNwRSx5QkFBeUIsQ0FBQyxpQkFBaUI7QUFBQSxFQUM1QztBQUFBLEVBQ0E7QUFBQSxJQUNDLElBQUk7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUNOLGFBQWEsS0FBSztBQUNqQixZQUFNLGlCQUFpQjtBQUFBLFFBQ3RCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQ0EsWUFBTSx1QkFBdUIsSUFBSSx3QkFBd0IsSUFBSSwrQ0FBcUM7QUFDbEcsWUFBTSxVQUFVLHVCQUNiLHFCQUFxQixRQUFRLFVBQVUsNkJBQTZCLElBQ3BFO0FBQ0gsYUFBTyxJQUFJLGVBQWUsT0FBTztBQUFBLElBQ2xDO0FBQUEsSUFDQSxNQUFNLGVBQWUsSUFBSSxhQUFhLE9BQU8sR0FBRywrQkFBK0I7QUFBQSxJQUMvRSw2QkFBNkI7QUFBQSxNQUM1QjtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBQ0E7QUFBQSxJQUNDLElBQUk7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUNOLGVBQWU7QUFDZCxhQUFPLElBQUk7QUFBQSxRQUNWO0FBQUEsVUFDQztBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLE1BQU0sZUFBZTtBQUFBLE1BQ3BCLHdCQUF3QixPQUFPO0FBQUEsTUFDL0IsZ0JBQWdCLGdCQUFnQixVQUFVLG9CQUFvQjtBQUFBLE1BQzlELGdCQUFnQixhQUFhLFVBQVUsYUFBYSxLQUFLO0FBQUEsTUFDekQsZ0JBQWdCO0FBQUEsSUFDakI7QUFBQSxJQUNBLDZCQUE2QixDQUFDLDREQUE0RDtBQUFBLEVBQzNGO0FBQUEsRUFDQTtBQUFBLElBQ0MsSUFBSTtBQUFBLElBQ0osTUFBTTtBQUFBLElBQ04sZUFBZTtBQUNkLGFBQU8sSUFBSTtBQUFBLFFBQ1Y7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBLGtCQUFrQjtBQUFBLFFBQ25CO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLE1BQU0sZUFBZTtBQUFBLE1BQ3BCLGdCQUFnQixhQUFhLFVBQVUsYUFBYSxLQUFLO0FBQUEsTUFDekQsZ0JBQWdCLGFBQWEsVUFBVSxhQUFhLElBQUk7QUFBQSxJQUN6RDtBQUFBLElBQ0EsNEJBQTRCLENBQUMsa0JBQWtCLHNCQUFzQjtBQUFBLElBQ3JFLDRCQUE0QixDQUFDLCtCQUErQjtBQUFBLEVBQzdEO0FBQ0Q7IiwKICAibmFtZXMiOiBbIkNoYXRUaXBUaWVyIiwgIkNoYXRUaXBFeHBlcmltZW50Il0KfQo=
