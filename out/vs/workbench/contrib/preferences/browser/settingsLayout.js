import { isWeb, isWindows } from "../../../../base/common/platform.js";
import { localize } from "../../../../nls.js";
import { ChatAIDisabledSettingId } from "../../../../platform/chat/common/chatSettings.js";
const COMMONLY_USED_SETTINGS = [
  "editor.fontSize",
  "editor.formatOnSave",
  "files.autoSave",
  "GitHub.copilot-chat.manageExtension",
  "editor.defaultFormatter",
  "editor.fontFamily",
  "editor.wordWrap",
  "chat.agent.maxRequests",
  "files.exclude",
  "workbench.colorTheme",
  "editor.tabSize",
  "editor.mouseWheelZoom",
  "editor.formatOnPaste"
];
function getCommonlyUsedData(settingGroups) {
  const allSettings = /* @__PURE__ */ new Map();
  for (const group of settingGroups) {
    for (const section of group.sections) {
      for (const s of section.settings) {
        allSettings.set(s.key, s);
      }
    }
  }
  const settings = [];
  for (const id of COMMONLY_USED_SETTINGS) {
    const setting = allSettings.get(id);
    if (setting) {
      settings.push(setting);
    }
  }
  return {
    id: "commonlyUsed",
    label: localize("commonlyUsed", "Commonly Used"),
    settings
  };
}
const tocData = {
  id: "root",
  label: "root",
  children: [
    {
      id: "editor",
      label: localize("textEditor", "Text Editor"),
      settings: ["editor.*"],
      children: [
        {
          id: "editor/cursor",
          label: localize("cursor", "Cursor"),
          settings: ["editor.cursor*"]
        },
        {
          id: "editor/find",
          label: localize("find", "Find"),
          settings: ["editor.find.*"]
        },
        {
          id: "editor/font",
          label: localize("font", "Font"),
          settings: ["editor.font*"]
        },
        {
          id: "editor/format",
          label: localize("formatting", "Formatting"),
          settings: ["editor.format*"]
        },
        {
          id: "editor/diffEditor",
          label: localize("diffEditor", "Diff Editor"),
          settings: ["diffEditor.*"]
        },
        {
          id: "editor/multiDiffEditor",
          label: localize("multiDiffEditor", "Multi-File Diff Editor"),
          settings: ["multiDiffEditor.*"]
        },
        {
          id: "editor/minimap",
          label: localize("minimap", "Minimap"),
          settings: ["editor.minimap.*"]
        },
        {
          id: "editor/suggestions",
          label: localize("suggestions", "Suggestions"),
          settings: ["editor.*suggest*"]
        },
        {
          id: "editor/files",
          label: localize("files", "Files"),
          settings: ["files.*"]
        }
      ]
    },
    {
      id: "workbench",
      label: localize("workbench", "Workbench"),
      settings: ["workbench.*"],
      children: [
        {
          id: "workbench/appearance",
          label: localize("appearance", "Appearance"),
          settings: ["workbench.activityBar.*", "workbench.*color*", "workbench.fontAliasing", "workbench.iconTheme", "workbench.sidebar.location", "workbench.*.visible", "workbench.tips.enabled", "workbench.tree.*", "workbench.view.*"]
        },
        {
          id: "workbench/breadcrumbs",
          label: localize("breadcrumbs", "Breadcrumbs"),
          settings: ["breadcrumbs.*"]
        },
        {
          id: "workbench/editor",
          label: localize("editorManagement", "Editor Management"),
          settings: ["workbench.editor.*"]
        },
        {
          id: "workbench/settings",
          label: localize("settings", "Settings Editor"),
          settings: ["workbench.settings.*"]
        },
        {
          id: "workbench/zenmode",
          label: localize("zenMode", "Zen Mode"),
          settings: ["zenmode.*"]
        },
        {
          id: "workbench/screencastmode",
          label: localize("screencastMode", "Screencast Mode"),
          settings: ["screencastMode.*"]
        },
        {
          id: "workbench/browser",
          label: localize("browser", "Browser"),
          settings: ["workbench.browser.*"]
        }
      ]
    },
    {
      id: "window",
      label: localize("window", "Window"),
      settings: ["window.*"],
      children: [
        {
          id: "window/newWindow",
          label: localize("newWindow", "New Window"),
          settings: ["window.*newwindow*"]
        }
      ]
    },
    {
      id: "chat",
      label: localize("chat", "Chat"),
      children: [
        {
          id: "chat/agent",
          label: localize("chatAgent", "Agent"),
          settings: [
            "chat.agent.*",
            "chat.checkpoints.*",
            "chat.editRequests",
            "chat.requestQueuing.*",
            "chat.undoRequests.*",
            "chat.customAgentInSubagent.*",
            "chat.editing.autoAcceptDelay",
            "chat.editing.confirmEditRequest*",
            "chat.planAgent.defaultModel"
          ]
        },
        {
          id: "chat/appearance",
          label: localize("chatAppearance", "Appearance"),
          settings: [
            "chat.editor.*",
            "chat.fontFamily",
            "chat.fontSize",
            "chat.math.*",
            "chat.agentsControl.*",
            "chat.alternativeToolAction.*",
            "chat.codeBlock.*",
            "chat.editing.explainChanges.enabled",
            "chat.editorAssociations",
            "chat.extensionUnification.*",
            "chat.inlineReferences.*",
            "chat.notifyWindow*",
            "chat.statusWidget.*",
            "chat.tips.*",
            "chat.unifiedAgentsBar.*",
            "accessibility.signals.chatUserActionRequired",
            "accessibility.signals.chatResponseReceived"
          ]
        },
        {
          id: "chat/sessions",
          label: localize("chatSessions", "Sessions"),
          settings: [
            "chat.agentSessionProjection.*",
            "chat.sessions.*",
            "chat.viewProgressBadge.*",
            "chat.viewSessions.*",
            "chat.restoreLastPanelSession",
            "chat.exitAfterDelegation",
            "chat.repoInfo.*"
          ]
        },
        {
          id: "chat/tools",
          label: localize("chatTools", "Tools"),
          settings: [
            "chat.tools.*",
            "chat.extensionTools.*"
          ]
        },
        {
          id: "chat/mcp",
          label: localize("chatMcp", "MCP"),
          settings: ["mcp", "chat.mcp.*", "mcp.*"]
        },
        {
          id: "chat/context",
          label: localize("chatContext", "Context"),
          settings: [
            "chat.detectParticipant.*",
            "chat.experimental.detectParticipant.*",
            "chat.implicitContext.*",
            "chat.promptFilesLocations",
            "chat.instructionsFilesLocations",
            "chat.modeFilesLocations",
            "chat.agentFilesLocations",
            "chat.agentSkillsLocations",
            "chat.hookFilesLocations",
            "chat.promptFilesRecommendations",
            "chat.useAgentsMdFile",
            "chat.useNestedAgentsMdFiles",
            "chat.useAgentSkills",
            "chat.experimental.useSkillAdherencePrompt",
            "chat.useHooks",
            "chat.includeApplyingInstructions",
            "chat.includeReferencedInstructions",
            "chat.useClaudeMdFile"
          ]
        },
        {
          id: "chat/inlineChat",
          label: localize("chatInlineChat", "Inline Chat"),
          settings: ["inlineChat.*"]
        },
        {
          id: "chat/miscellaneous",
          label: localize("chatMiscellaneous", "Miscellaneous"),
          settings: [
            ChatAIDisabledSettingId,
            "chat.allowAnonymousAccess"
          ]
        }
      ]
    },
    {
      id: "features",
      label: localize("features", "Features"),
      children: [
        {
          id: "features/accessibilitySignals",
          label: localize("accessibility.signals", "Accessibility Signals"),
          settings: ["accessibility.signal*"]
        },
        {
          id: "features/accessibility",
          label: localize("accessibility", "Accessibility"),
          settings: ["accessibility.*"]
        },
        {
          id: "features/explorer",
          label: localize("fileExplorer", "Explorer"),
          settings: ["explorer.*", "outline.*"]
        },
        {
          id: "features/search",
          label: localize("search", "Search"),
          settings: ["search.*"]
        },
        {
          id: "features/debug",
          label: localize("debug", "Debug"),
          settings: ["debug.*", "launch"]
        },
        {
          id: "features/testing",
          label: localize("testing", "Testing"),
          settings: ["testing.*"]
        },
        {
          id: "features/scm",
          label: localize("scm", "Source Control"),
          settings: ["scm.*"]
        },
        {
          id: "features/extensions",
          label: localize("extensions", "Extensions"),
          settings: ["extensions.*"]
        },
        {
          id: "features/terminal",
          label: localize("terminal", "Terminal"),
          settings: ["terminal.*"]
        },
        {
          id: "features/task",
          label: localize("task", "Task"),
          settings: ["task.*"]
        },
        {
          id: "features/problems",
          label: localize("problems", "Problems"),
          settings: ["problems.*"]
        },
        {
          id: "features/output",
          label: localize("output", "Output"),
          settings: ["output.*"]
        },
        {
          id: "features/comments",
          label: localize("comments", "Comments"),
          settings: ["comments.*"]
        },
        {
          id: "features/remote",
          label: localize("remote", "Remote"),
          settings: ["remote.*"]
        },
        {
          id: "features/timeline",
          label: localize("timeline", "Timeline"),
          settings: ["timeline.*"]
        },
        {
          id: "features/notebook",
          label: localize("notebook", "Notebook"),
          settings: ["notebook.*", "interactiveWindow.*"]
        },
        {
          id: "features/mergeEditor",
          label: localize("mergeEditor", "Merge Editor"),
          settings: ["mergeEditor.*"]
        },
        {
          id: "features/issueReporter",
          label: localize("issueReporter", "Issue Reporter"),
          settings: ["issueReporter.*"],
          hide: !isWeb
        }
      ]
    },
    {
      id: "application",
      label: localize("application", "Application"),
      children: [
        {
          id: "application/http",
          label: localize("proxy", "Proxy"),
          settings: ["http.*"]
        },
        {
          id: "application/keyboard",
          label: localize("keyboard", "Keyboard"),
          settings: ["keyboard.*"]
        },
        {
          id: "application/update",
          label: localize("update", "Update"),
          settings: ["update.*"]
        },
        {
          id: "application/telemetry",
          label: localize("telemetry", "Telemetry"),
          settings: ["telemetry.*"]
        },
        {
          id: "application/settingsSync",
          label: localize("settingsSync", "Settings Sync"),
          settings: ["settingsSync.*"]
        },
        {
          id: "application/network",
          label: localize("network", "Network"),
          settings: ["network.*"]
        },
        {
          id: "application/experimental",
          label: localize("experimental", "Experimental"),
          settings: ["application.experimental.*"]
        },
        {
          id: "application/other",
          label: localize("other", "Other"),
          settings: ["application.*"],
          hide: isWindows
        }
      ]
    },
    {
      id: "security",
      label: localize("security", "Security"),
      settings: ["security.*"],
      children: [
        {
          id: "security/workspace",
          label: localize("workspace", "Workspace"),
          settings: ["security.workspace.*"]
        }
      ]
    }
  ]
};
export {
  getCommonlyUsedData,
  tocData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIvc2V0dGluZ3NMYXlvdXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc1dlYiwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVNldHRpbmcsIElTZXR0aW5nc0dyb3VwIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IENoYXRBSURpc2FibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2hhdC9jb21tb24vY2hhdFNldHRpbmdzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJVE9DRmlsdGVyIHtcblx0aW5jbHVkZT86IHtcblx0XHRrZXlQYXR0ZXJucz86IHN0cmluZ1tdO1xuXHRcdHRhZ3M/OiBzdHJpbmdbXTtcblx0fTtcblx0ZXhjbHVkZT86IHtcblx0XHRrZXlQYXR0ZXJucz86IHN0cmluZ1tdO1xuXHRcdHRhZ3M/OiBzdHJpbmdbXTtcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVE9DRW50cnk8VD4ge1xuXHRpZDogc3RyaW5nO1xuXHRsYWJlbDogc3RyaW5nO1xuXHRvcmRlcj86IG51bWJlcjtcblx0Y2hpbGRyZW4/OiBJVE9DRW50cnk8VD5bXTtcblx0c2V0dGluZ3M/OiBBcnJheTxUPjtcblx0aGlkZT86IGJvb2xlYW47XG59XG5cbmNvbnN0IENPTU1PTkxZX1VTRURfU0VUVElOR1M6IHJlYWRvbmx5IHN0cmluZ1tdID0gW1xuXHQnZWRpdG9yLmZvbnRTaXplJyxcblx0J2VkaXRvci5mb3JtYXRPblNhdmUnLFxuXHQnZmlsZXMuYXV0b1NhdmUnLFxuXHQnR2l0SHViLmNvcGlsb3QtY2hhdC5tYW5hZ2VFeHRlbnNpb24nLFxuXHQnZWRpdG9yLmRlZmF1bHRGb3JtYXR0ZXInLFxuXHQnZWRpdG9yLmZvbnRGYW1pbHknLFxuXHQnZWRpdG9yLndvcmRXcmFwJyxcblx0J2NoYXQuYWdlbnQubWF4UmVxdWVzdHMnLFxuXHQnZmlsZXMuZXhjbHVkZScsXG5cdCd3b3JrYmVuY2guY29sb3JUaGVtZScsXG5cdCdlZGl0b3IudGFiU2l6ZScsXG5cdCdlZGl0b3IubW91c2VXaGVlbFpvb20nLFxuXHQnZWRpdG9yLmZvcm1hdE9uUGFzdGUnXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29tbW9ubHlVc2VkRGF0YShzZXR0aW5nR3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdKTogSVRPQ0VudHJ5PElTZXR0aW5nPiB7XG5cdGNvbnN0IGFsbFNldHRpbmdzID0gbmV3IE1hcDxzdHJpbmcsIElTZXR0aW5nPigpO1xuXHRmb3IgKGNvbnN0IGdyb3VwIG9mIHNldHRpbmdHcm91cHMpIHtcblx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2YgZ3JvdXAuc2VjdGlvbnMpIHtcblx0XHRcdGZvciAoY29uc3QgcyBvZiBzZWN0aW9uLnNldHRpbmdzKSB7XG5cdFx0XHRcdGFsbFNldHRpbmdzLnNldChzLmtleSwgcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGNvbnN0IHNldHRpbmdzOiBJU2V0dGluZ1tdID0gW107XG5cdGZvciAoY29uc3QgaWQgb2YgQ09NTU9OTFlfVVNFRF9TRVRUSU5HUykge1xuXHRcdGNvbnN0IHNldHRpbmcgPSBhbGxTZXR0aW5ncy5nZXQoaWQpO1xuXHRcdGlmIChzZXR0aW5nKSB7XG5cdFx0XHRzZXR0aW5ncy5wdXNoKHNldHRpbmcpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4ge1xuXHRcdGlkOiAnY29tbW9ubHlVc2VkJyxcblx0XHRsYWJlbDogbG9jYWxpemUoJ2NvbW1vbmx5VXNlZCcsIFwiQ29tbW9ubHkgVXNlZFwiKSxcblx0XHRzZXR0aW5nc1xuXHR9O1xufVxuXG5leHBvcnQgY29uc3QgdG9jRGF0YTogSVRPQ0VudHJ5PHN0cmluZz4gPSB7XG5cdGlkOiAncm9vdCcsXG5cdGxhYmVsOiAncm9vdCcsXG5cdGNoaWxkcmVuOiBbXG5cdFx0e1xuXHRcdFx0aWQ6ICdlZGl0b3InLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCd0ZXh0RWRpdG9yJywgXCJUZXh0IEVkaXRvclwiKSxcblx0XHRcdHNldHRpbmdzOiBbJ2VkaXRvci4qJ10sXG5cdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdlZGl0b3IvY3Vyc29yJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2N1cnNvcicsIFwiQ3Vyc29yXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ2VkaXRvci5jdXJzb3IqJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZWRpdG9yL2ZpbmQnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZmluZCcsIFwiRmluZFwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydlZGl0b3IuZmluZC4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZWRpdG9yL2ZvbnQnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZm9udCcsIFwiRm9udFwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydlZGl0b3IuZm9udConXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdlZGl0b3IvZm9ybWF0Jyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Zvcm1hdHRpbmcnLCBcIkZvcm1hdHRpbmdcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnZWRpdG9yLmZvcm1hdConXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdlZGl0b3IvZGlmZkVkaXRvcicsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkaWZmRWRpdG9yJywgXCJEaWZmIEVkaXRvclwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydkaWZmRWRpdG9yLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdlZGl0b3IvbXVsdGlEaWZmRWRpdG9yJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ211bHRpRGlmZkVkaXRvcicsIFwiTXVsdGktRmlsZSBEaWZmIEVkaXRvclwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydtdWx0aURpZmZFZGl0b3IuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2VkaXRvci9taW5pbWFwJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21pbmltYXAnLCBcIk1pbmltYXBcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnZWRpdG9yLm1pbmltYXAuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2VkaXRvci9zdWdnZXN0aW9ucycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzdWdnZXN0aW9ucycsIFwiU3VnZ2VzdGlvbnNcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnZWRpdG9yLipzdWdnZXN0KiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2VkaXRvci9maWxlcycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdmaWxlcycsIFwiRmlsZXNcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnZmlsZXMuKiddXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiAnd29ya2JlbmNoJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnd29ya2JlbmNoJywgXCJXb3JrYmVuY2hcIiksXG5cdFx0XHRzZXR0aW5nczogWyd3b3JrYmVuY2guKiddLFxuXHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoL2FwcGVhcmFuY2UnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYXBwZWFyYW5jZScsIFwiQXBwZWFyYW5jZVwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWyd3b3JrYmVuY2guYWN0aXZpdHlCYXIuKicsICd3b3JrYmVuY2guKmNvbG9yKicsICd3b3JrYmVuY2guZm9udEFsaWFzaW5nJywgJ3dvcmtiZW5jaC5pY29uVGhlbWUnLCAnd29ya2JlbmNoLnNpZGViYXIubG9jYXRpb24nLCAnd29ya2JlbmNoLioudmlzaWJsZScsICd3b3JrYmVuY2gudGlwcy5lbmFibGVkJywgJ3dvcmtiZW5jaC50cmVlLionLCAnd29ya2JlbmNoLnZpZXcuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC9icmVhZGNydW1icycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicmVhZGNydW1icycsIFwiQnJlYWRjcnVtYnNcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnYnJlYWRjcnVtYnMuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC9lZGl0b3InLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZWRpdG9yTWFuYWdlbWVudCcsIFwiRWRpdG9yIE1hbmFnZW1lbnRcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnd29ya2JlbmNoLmVkaXRvci4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoL3NldHRpbmdzJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NldHRpbmdzJywgXCJTZXR0aW5ncyBFZGl0b3JcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnd29ya2JlbmNoLnNldHRpbmdzLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gvemVubW9kZScsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd6ZW5Nb2RlJywgXCJaZW4gTW9kZVwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWyd6ZW5tb2RlLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gvc2NyZWVuY2FzdG1vZGUnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2NyZWVuY2FzdE1vZGUnLCBcIlNjcmVlbmNhc3QgTW9kZVwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydzY3JlZW5jYXN0TW9kZS4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoL2Jyb3dzZXInLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYnJvd3NlcicsIFwiQnJvd3NlclwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWyd3b3JrYmVuY2guYnJvd3Nlci4qJ11cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0aWQ6ICd3aW5kb3cnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCd3aW5kb3cnLCBcIldpbmRvd1wiKSxcblx0XHRcdHNldHRpbmdzOiBbJ3dpbmRvdy4qJ10sXG5cdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICd3aW5kb3cvbmV3V2luZG93Jyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ25ld1dpbmRvdycsIFwiTmV3IFdpbmRvd1wiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWyd3aW5kb3cuKm5ld3dpbmRvdyonXVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRpZDogJ2NoYXQnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0JywgXCJDaGF0XCIpLFxuXHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnY2hhdC9hZ2VudCcsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0QWdlbnQnLCBcIkFnZW50XCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbXG5cdFx0XHRcdFx0XHQnY2hhdC5hZ2VudC4qJyxcblx0XHRcdFx0XHRcdCdjaGF0LmNoZWNrcG9pbnRzLionLFxuXHRcdFx0XHRcdFx0J2NoYXQuZWRpdFJlcXVlc3RzJyxcblx0XHRcdFx0XHRcdCdjaGF0LnJlcXVlc3RRdWV1aW5nLionLFxuXHRcdFx0XHRcdFx0J2NoYXQudW5kb1JlcXVlc3RzLionLFxuXHRcdFx0XHRcdFx0J2NoYXQuY3VzdG9tQWdlbnRJblN1YmFnZW50LionLFxuXHRcdFx0XHRcdFx0J2NoYXQuZWRpdGluZy5hdXRvQWNjZXB0RGVsYXknLFxuXHRcdFx0XHRcdFx0J2NoYXQuZWRpdGluZy5jb25maXJtRWRpdFJlcXVlc3QqJyxcblx0XHRcdFx0XHRcdCdjaGF0LnBsYW5BZ2VudC5kZWZhdWx0TW9kZWwnXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdjaGF0L2FwcGVhcmFuY2UnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdEFwcGVhcmFuY2UnLCBcIkFwcGVhcmFuY2VcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFtcblx0XHRcdFx0XHRcdCdjaGF0LmVkaXRvci4qJyxcblx0XHRcdFx0XHRcdCdjaGF0LmZvbnRGYW1pbHknLFxuXHRcdFx0XHRcdFx0J2NoYXQuZm9udFNpemUnLFxuXHRcdFx0XHRcdFx0J2NoYXQubWF0aC4qJyxcblx0XHRcdFx0XHRcdCdjaGF0LmFnZW50c0NvbnRyb2wuKicsXG5cdFx0XHRcdFx0XHQnY2hhdC5hbHRlcm5hdGl2ZVRvb2xBY3Rpb24uKicsXG5cdFx0XHRcdFx0XHQnY2hhdC5jb2RlQmxvY2suKicsXG5cdFx0XHRcdFx0XHQnY2hhdC5lZGl0aW5nLmV4cGxhaW5DaGFuZ2VzLmVuYWJsZWQnLFxuXHRcdFx0XHRcdFx0J2NoYXQuZWRpdG9yQXNzb2NpYXRpb25zJyxcblx0XHRcdFx0XHRcdCdjaGF0LmV4dGVuc2lvblVuaWZpY2F0aW9uLionLFxuXHRcdFx0XHRcdFx0J2NoYXQuaW5saW5lUmVmZXJlbmNlcy4qJyxcblx0XHRcdFx0XHRcdCdjaGF0Lm5vdGlmeVdpbmRvdyonLFxuXHRcdFx0XHRcdFx0J2NoYXQuc3RhdHVzV2lkZ2V0LionLFxuXHRcdFx0XHRcdFx0J2NoYXQudGlwcy4qJyxcblx0XHRcdFx0XHRcdCdjaGF0LnVuaWZpZWRBZ2VudHNCYXIuKicsXG5cdFx0XHRcdFx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRVc2VyQWN0aW9uUmVxdWlyZWQnLFxuXHRcdFx0XHRcdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0UmVzcG9uc2VSZWNlaXZlZCdcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2NoYXQvc2Vzc2lvbnMnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zJywgXCJTZXNzaW9uc1wiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogW1xuXHRcdFx0XHRcdFx0J2NoYXQuYWdlbnRTZXNzaW9uUHJvamVjdGlvbi4qJyxcblx0XHRcdFx0XHRcdCdjaGF0LnNlc3Npb25zLionLFxuXHRcdFx0XHRcdFx0J2NoYXQudmlld1Byb2dyZXNzQmFkZ2UuKicsXG5cdFx0XHRcdFx0XHQnY2hhdC52aWV3U2Vzc2lvbnMuKicsXG5cdFx0XHRcdFx0XHQnY2hhdC5yZXN0b3JlTGFzdFBhbmVsU2Vzc2lvbicsXG5cdFx0XHRcdFx0XHQnY2hhdC5leGl0QWZ0ZXJEZWxlZ2F0aW9uJyxcblx0XHRcdFx0XHRcdCdjaGF0LnJlcG9JbmZvLionXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdjaGF0L3Rvb2xzJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXRUb29scycsIFwiVG9vbHNcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFtcblx0XHRcdFx0XHRcdCdjaGF0LnRvb2xzLionLFxuXHRcdFx0XHRcdFx0J2NoYXQuZXh0ZW5zaW9uVG9vbHMuKidcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2NoYXQvbWNwJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXRNY3AnLCBcIk1DUFwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydtY3AnLCAnY2hhdC5tY3AuKicsICdtY3AuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2NoYXQvY29udGV4dCcsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0Q29udGV4dCcsIFwiQ29udGV4dFwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogW1xuXHRcdFx0XHRcdFx0J2NoYXQuZGV0ZWN0UGFydGljaXBhbnQuKicsXG5cdFx0XHRcdFx0XHQnY2hhdC5leHBlcmltZW50YWwuZGV0ZWN0UGFydGljaXBhbnQuKicsXG5cdFx0XHRcdFx0XHQnY2hhdC5pbXBsaWNpdENvbnRleHQuKicsXG5cdFx0XHRcdFx0XHQnY2hhdC5wcm9tcHRGaWxlc0xvY2F0aW9ucycsXG5cdFx0XHRcdFx0XHQnY2hhdC5pbnN0cnVjdGlvbnNGaWxlc0xvY2F0aW9ucycsXG5cdFx0XHRcdFx0XHQnY2hhdC5tb2RlRmlsZXNMb2NhdGlvbnMnLFxuXHRcdFx0XHRcdFx0J2NoYXQuYWdlbnRGaWxlc0xvY2F0aW9ucycsXG5cdFx0XHRcdFx0XHQnY2hhdC5hZ2VudFNraWxsc0xvY2F0aW9ucycsXG5cdFx0XHRcdFx0XHQnY2hhdC5ob29rRmlsZXNMb2NhdGlvbnMnLFxuXHRcdFx0XHRcdFx0J2NoYXQucHJvbXB0RmlsZXNSZWNvbW1lbmRhdGlvbnMnLFxuXHRcdFx0XHRcdFx0J2NoYXQudXNlQWdlbnRzTWRGaWxlJyxcblx0XHRcdFx0XHRcdCdjaGF0LnVzZU5lc3RlZEFnZW50c01kRmlsZXMnLFxuXHRcdFx0XHRcdFx0J2NoYXQudXNlQWdlbnRTa2lsbHMnLFxuXHRcdFx0XHRcdFx0J2NoYXQuZXhwZXJpbWVudGFsLnVzZVNraWxsQWRoZXJlbmNlUHJvbXB0Jyxcblx0XHRcdFx0XHRcdCdjaGF0LnVzZUhvb2tzJyxcblx0XHRcdFx0XHRcdCdjaGF0LmluY2x1ZGVBcHBseWluZ0luc3RydWN0aW9ucycsXG5cdFx0XHRcdFx0XHQnY2hhdC5pbmNsdWRlUmVmZXJlbmNlZEluc3RydWN0aW9ucycsXG5cdFx0XHRcdFx0XHQnY2hhdC51c2VDbGF1ZGVNZEZpbGUnXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdjaGF0L2lubGluZUNoYXQnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdElubGluZUNoYXQnLCBcIklubGluZSBDaGF0XCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ2lubGluZUNoYXQuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2NoYXQvbWlzY2VsbGFuZW91cycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0TWlzY2VsbGFuZW91cycsIFwiTWlzY2VsbGFuZW91c1wiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogW1xuXHRcdFx0XHRcdFx0Q2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQsXG5cdFx0XHRcdFx0XHQnY2hhdC5hbGxvd0Fub255bW91c0FjY2Vzcydcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRdXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRpZDogJ2ZlYXR1cmVzJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZmVhdHVyZXMnLCBcIkZlYXR1cmVzXCIpLFxuXHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZmVhdHVyZXMvYWNjZXNzaWJpbGl0eVNpZ25hbHMnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzJywgJ0FjY2Vzc2liaWxpdHkgU2lnbmFscycpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ2FjY2Vzc2liaWxpdHkuc2lnbmFsKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2ZlYXR1cmVzL2FjY2Vzc2liaWxpdHknLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eScsIFwiQWNjZXNzaWJpbGl0eVwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydhY2Nlc3NpYmlsaXR5LionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdmZWF0dXJlcy9leHBsb3JlcicsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdmaWxlRXhwbG9yZXInLCBcIkV4cGxvcmVyXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ2V4cGxvcmVyLionLCAnb3V0bGluZS4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZmVhdHVyZXMvc2VhcmNoJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NlYXJjaCcsIFwiU2VhcmNoXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ3NlYXJjaC4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZmVhdHVyZXMvZGVidWcnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZGVidWcnLCBcIkRlYnVnXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ2RlYnVnLionLCAnbGF1bmNoJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZmVhdHVyZXMvdGVzdGluZycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd0ZXN0aW5nJywgXCJUZXN0aW5nXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ3Rlc3RpbmcuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2ZlYXR1cmVzL3NjbScsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzY20nLCBcIlNvdXJjZSBDb250cm9sXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ3NjbS4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZmVhdHVyZXMvZXh0ZW5zaW9ucycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdleHRlbnNpb25zJywgXCJFeHRlbnNpb25zXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ2V4dGVuc2lvbnMuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2ZlYXR1cmVzL3Rlcm1pbmFsJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Rlcm1pbmFsJywgXCJUZXJtaW5hbFwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWyd0ZXJtaW5hbC4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZmVhdHVyZXMvdGFzaycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd0YXNrJywgXCJUYXNrXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ3Rhc2suKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2ZlYXR1cmVzL3Byb2JsZW1zJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Byb2JsZW1zJywgXCJQcm9ibGVtc1wiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydwcm9ibGVtcy4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZmVhdHVyZXMvb3V0cHV0Jyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ291dHB1dCcsIFwiT3V0cHV0XCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ291dHB1dC4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZmVhdHVyZXMvY29tbWVudHMnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY29tbWVudHMnLCBcIkNvbW1lbnRzXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ2NvbW1lbnRzLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdmZWF0dXJlcy9yZW1vdGUnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVtb3RlJywgXCJSZW1vdGVcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsncmVtb3RlLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdmZWF0dXJlcy90aW1lbGluZScsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd0aW1lbGluZScsIFwiVGltZWxpbmVcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsndGltZWxpbmUuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2ZlYXR1cmVzL25vdGVib29rJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ25vdGVib29rJywgJ05vdGVib29rJyksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnbm90ZWJvb2suKicsICdpbnRlcmFjdGl2ZVdpbmRvdy4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZmVhdHVyZXMvbWVyZ2VFZGl0b3InLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWVyZ2VFZGl0b3InLCAnTWVyZ2UgRWRpdG9yJyksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnbWVyZ2VFZGl0b3IuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2ZlYXR1cmVzL2lzc3VlUmVwb3J0ZXInLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaXNzdWVSZXBvcnRlcicsICdJc3N1ZSBSZXBvcnRlcicpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ2lzc3VlUmVwb3J0ZXIuKiddLFxuXHRcdFx0XHRcdGhpZGU6ICFpc1dlYlxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRpZDogJ2FwcGxpY2F0aW9uJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYXBwbGljYXRpb24nLCBcIkFwcGxpY2F0aW9uXCIpLFxuXHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnYXBwbGljYXRpb24vaHR0cCcsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwcm94eScsIFwiUHJveHlcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnaHR0cC4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnYXBwbGljYXRpb24va2V5Ym9hcmQnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgna2V5Ym9hcmQnLCBcIktleWJvYXJkXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ2tleWJvYXJkLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdhcHBsaWNhdGlvbi91cGRhdGUnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndXBkYXRlJywgXCJVcGRhdGVcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsndXBkYXRlLionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdhcHBsaWNhdGlvbi90ZWxlbWV0cnknLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndGVsZW1ldHJ5JywgXCJUZWxlbWV0cnlcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsndGVsZW1ldHJ5LionXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdhcHBsaWNhdGlvbi9zZXR0aW5nc1N5bmMnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2V0dGluZ3NTeW5jJywgXCJTZXR0aW5ncyBTeW5jXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ3NldHRpbmdzU3luYy4qJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnYXBwbGljYXRpb24vbmV0d29yaycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCduZXR3b3JrJywgXCJOZXR3b3JrXCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBbJ25ldHdvcmsuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2FwcGxpY2F0aW9uL2V4cGVyaW1lbnRhbCcsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdleHBlcmltZW50YWwnLCBcIkV4cGVyaW1lbnRhbFwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydhcHBsaWNhdGlvbi5leHBlcmltZW50YWwuKiddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2FwcGxpY2F0aW9uL290aGVyJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ290aGVyJywgXCJPdGhlclwiKSxcblx0XHRcdFx0XHRzZXR0aW5nczogWydhcHBsaWNhdGlvbi4qJ10sXG5cdFx0XHRcdFx0aGlkZTogaXNXaW5kb3dzXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiAnc2VjdXJpdHknLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzZWN1cml0eScsIFwiU2VjdXJpdHlcIiksXG5cdFx0XHRzZXR0aW5nczogWydzZWN1cml0eS4qJ10sXG5cdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdzZWN1cml0eS93b3Jrc3BhY2UnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnd29ya3NwYWNlJywgXCJXb3Jrc3BhY2VcIiksXG5cdFx0XHRcdFx0c2V0dGluZ3M6IFsnc2VjdXJpdHkud29ya3NwYWNlLionXVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fVxuXHRdXG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxPQUFPLGlCQUFpQjtBQUNqQyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLCtCQUErQjtBQXNCeEMsTUFBTSx5QkFBNEM7QUFBQSxFQUNqRDtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUNEO0FBRU8sU0FBUyxvQkFBb0IsZUFBc0Q7QUFDekYsUUFBTSxjQUFjLG9CQUFJLElBQXNCO0FBQzlDLGFBQVcsU0FBUyxlQUFlO0FBQ2xDLGVBQVcsV0FBVyxNQUFNLFVBQVU7QUFDckMsaUJBQVcsS0FBSyxRQUFRLFVBQVU7QUFDakMsb0JBQVksSUFBSSxFQUFFLEtBQUssQ0FBQztBQUFBLE1BQ3pCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDQSxRQUFNLFdBQXVCLENBQUM7QUFDOUIsYUFBVyxNQUFNLHdCQUF3QjtBQUN4QyxVQUFNLFVBQVUsWUFBWSxJQUFJLEVBQUU7QUFDbEMsUUFBSSxTQUFTO0FBQ1osZUFBUyxLQUFLLE9BQU87QUFBQSxJQUN0QjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQUEsSUFDTixJQUFJO0FBQUEsSUFDSixPQUFPLFNBQVMsZ0JBQWdCLGVBQWU7QUFBQSxJQUMvQztBQUFBLEVBQ0Q7QUFDRDtBQUVPLE1BQU0sVUFBNkI7QUFBQSxFQUN6QyxJQUFJO0FBQUEsRUFDSixPQUFPO0FBQUEsRUFDUCxVQUFVO0FBQUEsSUFDVDtBQUFBLE1BQ0MsSUFBSTtBQUFBLE1BQ0osT0FBTyxTQUFTLGNBQWMsYUFBYTtBQUFBLE1BQzNDLFVBQVUsQ0FBQyxVQUFVO0FBQUEsTUFDckIsVUFBVTtBQUFBLFFBQ1Q7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxVQUFVLFFBQVE7QUFBQSxVQUNsQyxVQUFVLENBQUMsZ0JBQWdCO0FBQUEsUUFDNUI7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsUUFBUSxNQUFNO0FBQUEsVUFDOUIsVUFBVSxDQUFDLGVBQWU7QUFBQSxRQUMzQjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxRQUFRLE1BQU07QUFBQSxVQUM5QixVQUFVLENBQUMsY0FBYztBQUFBLFFBQzFCO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLGNBQWMsWUFBWTtBQUFBLFVBQzFDLFVBQVUsQ0FBQyxnQkFBZ0I7QUFBQSxRQUM1QjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxjQUFjLGFBQWE7QUFBQSxVQUMzQyxVQUFVLENBQUMsY0FBYztBQUFBLFFBQzFCO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLG1CQUFtQix3QkFBd0I7QUFBQSxVQUMzRCxVQUFVLENBQUMsbUJBQW1CO0FBQUEsUUFDL0I7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsV0FBVyxTQUFTO0FBQUEsVUFDcEMsVUFBVSxDQUFDLGtCQUFrQjtBQUFBLFFBQzlCO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLGVBQWUsYUFBYTtBQUFBLFVBQzVDLFVBQVUsQ0FBQyxrQkFBa0I7QUFBQSxRQUM5QjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxTQUFTLE9BQU87QUFBQSxVQUNoQyxVQUFVLENBQUMsU0FBUztBQUFBLFFBQ3JCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBO0FBQUEsTUFDQyxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsYUFBYSxXQUFXO0FBQUEsTUFDeEMsVUFBVSxDQUFDLGFBQWE7QUFBQSxNQUN4QixVQUFVO0FBQUEsUUFDVDtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLGNBQWMsWUFBWTtBQUFBLFVBQzFDLFVBQVUsQ0FBQywyQkFBMkIscUJBQXFCLDBCQUEwQix1QkFBdUIsOEJBQThCLHVCQUF1QiwwQkFBMEIsb0JBQW9CLGtCQUFrQjtBQUFBLFFBQ2xPO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLGVBQWUsYUFBYTtBQUFBLFVBQzVDLFVBQVUsQ0FBQyxlQUFlO0FBQUEsUUFDM0I7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsb0JBQW9CLG1CQUFtQjtBQUFBLFVBQ3ZELFVBQVUsQ0FBQyxvQkFBb0I7QUFBQSxRQUNoQztBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxZQUFZLGlCQUFpQjtBQUFBLFVBQzdDLFVBQVUsQ0FBQyxzQkFBc0I7QUFBQSxRQUNsQztBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxXQUFXLFVBQVU7QUFBQSxVQUNyQyxVQUFVLENBQUMsV0FBVztBQUFBLFFBQ3ZCO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLGtCQUFrQixpQkFBaUI7QUFBQSxVQUNuRCxVQUFVLENBQUMsa0JBQWtCO0FBQUEsUUFDOUI7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsV0FBVyxTQUFTO0FBQUEsVUFDcEMsVUFBVSxDQUFDLHFCQUFxQjtBQUFBLFFBQ2pDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBO0FBQUEsTUFDQyxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsVUFBVSxRQUFRO0FBQUEsTUFDbEMsVUFBVSxDQUFDLFVBQVU7QUFBQSxNQUNyQixVQUFVO0FBQUEsUUFDVDtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLGFBQWEsWUFBWTtBQUFBLFVBQ3pDLFVBQVUsQ0FBQyxvQkFBb0I7QUFBQSxRQUNoQztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQTtBQUFBLE1BQ0MsSUFBSTtBQUFBLE1BQ0osT0FBTyxTQUFTLFFBQVEsTUFBTTtBQUFBLE1BQzlCLFVBQVU7QUFBQSxRQUNUO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsYUFBYSxPQUFPO0FBQUEsVUFDcEMsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLGtCQUFrQixZQUFZO0FBQUEsVUFDOUMsVUFBVTtBQUFBLFlBQ1Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsZ0JBQWdCLFVBQVU7QUFBQSxVQUMxQyxVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLGFBQWEsT0FBTztBQUFBLFVBQ3BDLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLFdBQVcsS0FBSztBQUFBLFVBQ2hDLFVBQVUsQ0FBQyxPQUFPLGNBQWMsT0FBTztBQUFBLFFBQ3hDO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLGVBQWUsU0FBUztBQUFBLFVBQ3hDLFVBQVU7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxrQkFBa0IsYUFBYTtBQUFBLFVBQy9DLFVBQVUsQ0FBQyxjQUFjO0FBQUEsUUFDMUI7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMscUJBQXFCLGVBQWU7QUFBQSxVQUNwRCxVQUFVO0FBQUEsWUFDVDtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQTtBQUFBLE1BQ0MsSUFBSTtBQUFBLE1BQ0osT0FBTyxTQUFTLFlBQVksVUFBVTtBQUFBLE1BQ3RDLFVBQVU7QUFBQSxRQUNUO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMseUJBQXlCLHVCQUF1QjtBQUFBLFVBQ2hFLFVBQVUsQ0FBQyx1QkFBdUI7QUFBQSxRQUNuQztBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxpQkFBaUIsZUFBZTtBQUFBLFVBQ2hELFVBQVUsQ0FBQyxpQkFBaUI7QUFBQSxRQUM3QjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxnQkFBZ0IsVUFBVTtBQUFBLFVBQzFDLFVBQVUsQ0FBQyxjQUFjLFdBQVc7QUFBQSxRQUNyQztBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxVQUFVLFFBQVE7QUFBQSxVQUNsQyxVQUFVLENBQUMsVUFBVTtBQUFBLFFBQ3RCO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLFNBQVMsT0FBTztBQUFBLFVBQ2hDLFVBQVUsQ0FBQyxXQUFXLFFBQVE7QUFBQSxRQUMvQjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxXQUFXLFNBQVM7QUFBQSxVQUNwQyxVQUFVLENBQUMsV0FBVztBQUFBLFFBQ3ZCO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLE9BQU8sZ0JBQWdCO0FBQUEsVUFDdkMsVUFBVSxDQUFDLE9BQU87QUFBQSxRQUNuQjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxjQUFjLFlBQVk7QUFBQSxVQUMxQyxVQUFVLENBQUMsY0FBYztBQUFBLFFBQzFCO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLFlBQVksVUFBVTtBQUFBLFVBQ3RDLFVBQVUsQ0FBQyxZQUFZO0FBQUEsUUFDeEI7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsUUFBUSxNQUFNO0FBQUEsVUFDOUIsVUFBVSxDQUFDLFFBQVE7QUFBQSxRQUNwQjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxZQUFZLFVBQVU7QUFBQSxVQUN0QyxVQUFVLENBQUMsWUFBWTtBQUFBLFFBQ3hCO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLFVBQVUsUUFBUTtBQUFBLFVBQ2xDLFVBQVUsQ0FBQyxVQUFVO0FBQUEsUUFDdEI7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsWUFBWSxVQUFVO0FBQUEsVUFDdEMsVUFBVSxDQUFDLFlBQVk7QUFBQSxRQUN4QjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxVQUFVLFFBQVE7QUFBQSxVQUNsQyxVQUFVLENBQUMsVUFBVTtBQUFBLFFBQ3RCO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLFlBQVksVUFBVTtBQUFBLFVBQ3RDLFVBQVUsQ0FBQyxZQUFZO0FBQUEsUUFDeEI7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsWUFBWSxVQUFVO0FBQUEsVUFDdEMsVUFBVSxDQUFDLGNBQWMscUJBQXFCO0FBQUEsUUFDL0M7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsZUFBZSxjQUFjO0FBQUEsVUFDN0MsVUFBVSxDQUFDLGVBQWU7QUFBQSxRQUMzQjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxpQkFBaUIsZ0JBQWdCO0FBQUEsVUFDakQsVUFBVSxDQUFDLGlCQUFpQjtBQUFBLFVBQzVCLE1BQU0sQ0FBQztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0E7QUFBQSxNQUNDLElBQUk7QUFBQSxNQUNKLE9BQU8sU0FBUyxlQUFlLGFBQWE7QUFBQSxNQUM1QyxVQUFVO0FBQUEsUUFDVDtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLFNBQVMsT0FBTztBQUFBLFVBQ2hDLFVBQVUsQ0FBQyxRQUFRO0FBQUEsUUFDcEI7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsWUFBWSxVQUFVO0FBQUEsVUFDdEMsVUFBVSxDQUFDLFlBQVk7QUFBQSxRQUN4QjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxVQUFVLFFBQVE7QUFBQSxVQUNsQyxVQUFVLENBQUMsVUFBVTtBQUFBLFFBQ3RCO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLGFBQWEsV0FBVztBQUFBLFVBQ3hDLFVBQVUsQ0FBQyxhQUFhO0FBQUEsUUFDekI7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsZ0JBQWdCLGVBQWU7QUFBQSxVQUMvQyxVQUFVLENBQUMsZ0JBQWdCO0FBQUEsUUFDNUI7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixPQUFPLFNBQVMsV0FBVyxTQUFTO0FBQUEsVUFDcEMsVUFBVSxDQUFDLFdBQVc7QUFBQSxRQUN2QjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxnQkFBZ0IsY0FBYztBQUFBLFVBQzlDLFVBQVUsQ0FBQyw0QkFBNEI7QUFBQSxRQUN4QztBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUk7QUFBQSxVQUNKLE9BQU8sU0FBUyxTQUFTLE9BQU87QUFBQSxVQUNoQyxVQUFVLENBQUMsZUFBZTtBQUFBLFVBQzFCLE1BQU07QUFBQSxRQUNQO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBO0FBQUEsTUFDQyxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsWUFBWSxVQUFVO0FBQUEsTUFDdEMsVUFBVSxDQUFDLFlBQVk7QUFBQSxNQUN2QixVQUFVO0FBQUEsUUFDVDtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLGFBQWEsV0FBVztBQUFBLFVBQ3hDLFVBQVUsQ0FBQyxzQkFBc0I7QUFBQSxRQUNsQztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
