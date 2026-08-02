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
import { localize, localize2 } from "../../../../nls.js";
import { GettingStartedInputSerializer, GettingStartedPage, inWelcomeContext } from "./gettingStarted.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorExtensions } from "../../../common/editor.js";
import { MenuId, registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IWalkthroughsService } from "./gettingStartedService.js";
import { GettingStartedInput } from "./gettingStartedInput.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { workbenchConfigurationNodeBase } from "../../../common/configuration.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { isLinux, isMacintosh, isWindows, OperatingSystem as OS } from "../../../../base/common/platform.js";
import { IExtensionManagementServerService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { StartupPageEditorResolverContribution, StartupPageRunnerContribution } from "./startupPage.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { GettingStartedAccessibleView } from "./gettingStartedAccessibleView.js";
import { AgentSessionsWelcomePage } from "../../welcomeAgentSessions/browser/agentSessionsWelcome.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import * as icons from "./gettingStartedIcons.js";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.openWalkthrough",
      title: localize2("miWelcome", "Welcome"),
      category: Categories.Help,
      f1: true,
      menu: {
        id: MenuId.MenubarHelpMenu,
        group: "1_welcome",
        order: 1
      },
      metadata: {
        description: localize2("minWelcomeDescription", "Opens a Walkthrough to help you get started in VS Code.")
      }
    });
  }
  run(accessor, walkthroughID, optionsOrToSide) {
    const editorService = accessor.get(IEditorService);
    const commandService = accessor.get(ICommandService);
    const configurationService = accessor.get(IConfigurationService);
    const chatEntitlementService = accessor.get(IChatEntitlementService);
    const toSide = typeof optionsOrToSide === "object" ? optionsOrToSide.toSide : optionsOrToSide;
    const inactive = typeof optionsOrToSide === "object" ? optionsOrToSide.inactive : false;
    const activeEditor = editorService.activeEditor;
    if (!walkthroughID && !chatEntitlementService.sentiment.hidden && configurationService.getValue("workbench.startupEditor") === "agentSessionsWelcomePage") {
      commandService.executeCommand(AgentSessionsWelcomePage.COMMAND_ID);
      return;
    } else {
      if (walkthroughID) {
        const selectedCategory = typeof walkthroughID === "string" ? walkthroughID : walkthroughID.category;
        let selectedStep;
        if (typeof walkthroughID === "object" && "category" in walkthroughID && "step" in walkthroughID) {
          selectedStep = `${walkthroughID.category}#${walkthroughID.step}`;
        } else {
          selectedStep = void 0;
        }
        if (selectedStep && activeEditor instanceof GettingStartedInput && activeEditor.selectedCategory === selectedCategory) {
          activeEditor.showWelcome = false;
          commandService.executeCommand("walkthroughs.selectStep", selectedStep);
          return;
        }
        let options;
        if (selectedCategory) {
          options = { selectedCategory, selectedStep, showWelcome: false, preserveFocus: toSide ?? false, inactive };
        } else {
          options = { selectedCategory, selectedStep, showWelcome: true, preserveFocus: toSide ?? false, inactive };
        }
        editorService.openEditor({
          resource: GettingStartedInput.RESOURCE,
          options
        }, toSide ? SIDE_GROUP : void 0);
      } else {
        editorService.openEditor({
          resource: GettingStartedInput.RESOURCE,
          options: { preserveFocus: toSide ?? false, inactive }
        }, toSide ? SIDE_GROUP : void 0);
      }
    }
  }
});
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(GettingStartedInput.ID, GettingStartedInputSerializer);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    GettingStartedPage,
    GettingStartedPage.ID,
    localize("welcome", "Welcome")
  ),
  [
    new SyncDescriptor(GettingStartedInput)
  ]
);
const category = localize2("welcome", "Welcome");
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "welcome.goBack",
      title: localize2("welcome.goBack", "Go Back"),
      category,
      keybinding: {
        weight: KeybindingWeight.EditorContrib,
        primary: KeyCode.Escape,
        when: inWelcomeContext
      },
      precondition: ContextKeyExpr.equals("activeEditor", "gettingStartedPage"),
      f1: true
    });
  }
  run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorPane = editorService.activeEditorPane;
    if (editorPane instanceof GettingStartedPage) {
      editorPane.escape();
    }
  }
});
CommandsRegistry.registerCommand({
  id: "walkthroughs.selectStep",
  handler: (accessor, stepID) => {
    const editorService = accessor.get(IEditorService);
    const editorPane = editorService.activeEditorPane;
    if (editorPane instanceof GettingStartedPage) {
      editorPane.selectStepLoose(stepID);
    } else {
      console.error("Cannot run walkthroughs.selectStep outside of walkthrough context");
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "welcome.markStepComplete",
      title: localize("welcome.markStepComplete", "Mark Step Complete"),
      category
    });
  }
  run(accessor, arg) {
    if (!arg) {
      return;
    }
    const gettingStartedService = accessor.get(IWalkthroughsService);
    gettingStartedService.progressStep(arg);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "welcome.markStepIncomplete",
      title: localize("welcome.markStepInomplete", "Mark Step Incomplete"),
      category
    });
  }
  run(accessor, arg) {
    if (!arg) {
      return;
    }
    const gettingStartedService = accessor.get(IWalkthroughsService);
    gettingStartedService.deprogressStep(arg);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "welcome.showAllWalkthroughs",
      title: localize2("welcome.showAllWalkthroughs", "Open Walkthrough..."),
      category,
      f1: true,
      menu: {
        id: MenuId.MenubarHelpMenu,
        group: "1_welcome",
        order: 3
      }
    });
  }
  async getQuickPickItems(contextService, gettingStartedService) {
    const categories = await gettingStartedService.getWalkthroughs();
    return categories.filter((c) => contextService.contextMatchesRules(c.when)).map((x) => ({
      id: x.id,
      label: x.title,
      detail: x.description,
      description: x.source
    }));
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    const contextService = accessor.get(IContextKeyService);
    const quickInputService = accessor.get(IQuickInputService);
    const gettingStartedService = accessor.get(IWalkthroughsService);
    const extensionService = accessor.get(IExtensionService);
    const disposables = new DisposableStore();
    const quickPick = disposables.add(quickInputService.createQuickPick());
    quickPick.canSelectMany = false;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.placeholder = localize("pickWalkthroughs", "Select a walkthrough to open");
    quickPick.items = await this.getQuickPickItems(contextService, gettingStartedService);
    quickPick.busy = true;
    disposables.add(quickPick.onDidAccept(() => {
      const selection = quickPick.selectedItems[0];
      if (selection) {
        commandService.executeCommand("workbench.action.openWalkthrough", selection.id);
      }
      quickPick.hide();
    }));
    disposables.add(quickPick.onDidHide(() => disposables.dispose()));
    await extensionService.whenInstalledExtensionsRegistered();
    disposables.add(gettingStartedService.onDidAddWalkthrough(async () => {
      quickPick.items = await this.getQuickPickItems(contextService, gettingStartedService);
    }));
    quickPick.show();
    quickPick.busy = false;
  }
});
CommandsRegistry.registerCommand({
  id: "welcome.newWorkspaceChat",
  handler: (accessor, stepID) => {
    const commandService = accessor.get(ICommandService);
    commandService.executeCommand("workbench.action.chat.open", { mode: "agent", query: "#new ", isPartialQuery: true });
  }
});
const WorkspacePlatform = new RawContextKey("workspacePlatform", void 0, localize("workspacePlatform", "The platform of the current workspace, which in remote or serverless contexts may be different from the platform of the UI"));
let WorkspacePlatformContribution = class {
  constructor(extensionManagementServerService, remoteAgentService, contextService) {
    this.extensionManagementServerService = extensionManagementServerService;
    this.remoteAgentService = remoteAgentService;
    this.contextService = contextService;
    this.remoteAgentService.getEnvironment().then((env) => {
      const remoteOS = env?.os;
      const remotePlatform = remoteOS === OS.Macintosh ? "mac" : remoteOS === OS.Windows ? "windows" : remoteOS === OS.Linux ? "linux" : void 0;
      if (remotePlatform) {
        WorkspacePlatform.bindTo(this.contextService).set(remotePlatform);
      } else if (this.extensionManagementServerService.localExtensionManagementServer) {
        if (isMacintosh) {
          WorkspacePlatform.bindTo(this.contextService).set("mac");
        } else if (isLinux) {
          WorkspacePlatform.bindTo(this.contextService).set("linux");
        } else if (isWindows) {
          WorkspacePlatform.bindTo(this.contextService).set("windows");
        }
      } else if (this.extensionManagementServerService.webExtensionManagementServer) {
        WorkspacePlatform.bindTo(this.contextService).set("webworker");
      } else {
        console.error("Error: Unable to detect workspace platform");
      }
    });
  }
};
WorkspacePlatformContribution.ID = "workbench.contrib.workspacePlatform";
WorkspacePlatformContribution = __decorateClass([
  __decorateParam(0, IExtensionManagementServerService),
  __decorateParam(1, IRemoteAgentService),
  __decorateParam(2, IContextKeyService)
], WorkspacePlatformContribution);
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  ...workbenchConfigurationNodeBase,
  properties: {
    "workbench.welcomePage.walkthroughs.openOnInstall": {
      scope: ConfigurationScope.MACHINE,
      type: "boolean",
      default: true,
      description: localize("workbench.welcomePage.walkthroughs.openOnInstall", "When enabled, an extension's walkthrough will open upon install of the extension.")
    },
    "workbench.startupEditor": {
      "scope": ConfigurationScope.RESOURCE,
      "type": "string",
      "enum": ["none", "welcomePage", "readme", "newUntitledFile", "welcomePageInEmptyWorkbench", "terminal", "agentSessionsWelcomePage"],
      "enumDescriptions": [
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "workbench.startupEditor.none" }, "Start without an editor."),
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "workbench.startupEditor.welcomePage" }, "Open the Welcome page, with content to aid in getting started with VS Code and extensions."),
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "workbench.startupEditor.readme" }, "Open the README when opening a folder that contains one, fallback to 'welcomePage' otherwise. Note: This is only observed as a global configuration, it will be ignored if set in a workspace or folder configuration."),
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "workbench.startupEditor.newUntitledFile" }, "Open a new untitled text file (only applies when opening an empty window)."),
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "workbench.startupEditor.welcomePageInEmptyWorkbench" }, "Open the Welcome page when opening an empty workbench."),
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "workbench.startupEditor.terminal" }, "Open a new terminal in the editor area."),
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "workbench.startupEditor.agentSessionsWelcomePage" }, "Open the Agent Sessions Welcome page. Will override the workbench secondary side bar visibility settings.")
      ],
      "default": "welcomePage",
      "description": localize("workbench.startupEditor", "Controls which editor is shown at startup, if none are restored from the previous session."),
      "experiment": { mode: "auto" },
      agentsWindow: { default: "none", readOnly: true }
    },
    "workbench.welcomePage.preferReducedMotion": {
      scope: ConfigurationScope.APPLICATION,
      type: "boolean",
      default: false,
      deprecationMessage: localize("deprecationMessage", "Deprecated, use the global `workbench.reduceMotion`."),
      description: localize("workbench.welcomePage.preferReducedMotion", "When enabled, reduce motion in welcome page.")
    },
    "workbench.welcomePage.experimentalOnboarding": {
      scope: ConfigurationScope.APPLICATION,
      type: "boolean",
      default: true,
      tags: ["experimental"],
      description: localize("workbench.welcomePage.experimentalOnboarding", "When enabled, show the new onboarding experience instead of the classic walkthrough on first launch."),
      experiment: {
        mode: "auto"
      }
    }
  }
});
registerWorkbenchContribution2(WorkspacePlatformContribution.ID, WorkspacePlatformContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(StartupPageEditorResolverContribution.ID, StartupPageEditorResolverContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(StartupPageRunnerContribution.ID, StartupPageRunnerContribution, WorkbenchPhase.AfterRestored);
AccessibleViewRegistry.register(new GettingStartedAccessibleView());
export {
  WorkspacePlatform,
  icons
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9icm93c2VyL2dldHRpbmdTdGFydGVkLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgR2V0dGluZ1N0YXJ0ZWRJbnB1dFNlcmlhbGl6ZXIsIEdldHRpbmdTdGFydGVkUGFnZSwgaW5XZWxjb21lQ29udGV4dCB9IGZyb20gJy4vZ2V0dGluZ1N0YXJ0ZWQuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9ucywgSUVkaXRvckZhY3RvcnlSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgTWVudUlkLCByZWdpc3RlckFjdGlvbjIsIEFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lRGVzY3JpcHRvciwgSUVkaXRvclBhbmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSVdhbGt0aHJvdWdoc1NlcnZpY2UgfSBmcm9tICcuL2dldHRpbmdTdGFydGVkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHZXR0aW5nU3RhcnRlZEVkaXRvck9wdGlvbnMsIEdldHRpbmdTdGFydGVkSW5wdXQgfSBmcm9tICcuL2dldHRpbmdTdGFydGVkSW5wdXQuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cywgT3BlcmF0aW5nU3lzdGVtIGFzIE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU3RhcnR1cFBhZ2VFZGl0b3JSZXNvbHZlckNvbnRyaWJ1dGlvbiwgU3RhcnR1cFBhZ2VSdW5uZXJDb250cmlidXRpb24gfSBmcm9tICcuL3N0YXJ0dXBQYWdlLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBHZXR0aW5nU3RhcnRlZEFjY2Vzc2libGVWaWV3IH0gZnJvbSAnLi9nZXR0aW5nU3RhcnRlZEFjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbnNXZWxjb21lUGFnZSB9IGZyb20gJy4uLy4uL3dlbGNvbWVBZ2VudFNlc3Npb25zL2Jyb3dzZXIvYWdlbnRTZXNzaW9uc1dlbGNvbWUuanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcblxuZXhwb3J0ICogYXMgaWNvbnMgZnJvbSAnLi9nZXR0aW5nU3RhcnRlZEljb25zLmpzJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuV2Fsa3Rocm91Z2gnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWlXZWxjb21lJywgJ1dlbGNvbWUnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkhlbHAsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFySGVscE1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMV93ZWxjb21lJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMignbWluV2VsY29tZURlc2NyaXB0aW9uJywgJ09wZW5zIGEgV2Fsa3Rocm91Z2ggdG8gaGVscCB5b3UgZ2V0IHN0YXJ0ZWQgaW4gVlMgQ29kZS4nKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihcblx0XHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0XHR3YWxrdGhyb3VnaElEOiBzdHJpbmcgfCB7IGNhdGVnb3J5OiBzdHJpbmc7IHN0ZXA6IHN0cmluZyB9IHwgdW5kZWZpbmVkLFxuXHRcdG9wdGlvbnNPclRvU2lkZTogeyB0b1NpZGU/OiBib29sZWFuOyBpbmFjdGl2ZT86IGJvb2xlYW4gfSB8IGJvb2xlYW4gfCB1bmRlZmluZWRcblx0KSB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGNoYXRFbnRpdGxlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdG9TaWRlID0gdHlwZW9mIG9wdGlvbnNPclRvU2lkZSA9PT0gJ29iamVjdCcgPyBvcHRpb25zT3JUb1NpZGUudG9TaWRlIDogb3B0aW9uc09yVG9TaWRlO1xuXHRcdGNvbnN0IGluYWN0aXZlID0gdHlwZW9mIG9wdGlvbnNPclRvU2lkZSA9PT0gJ29iamVjdCcgPyBvcHRpb25zT3JUb1NpZGUuaW5hY3RpdmUgOiBmYWxzZTtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblxuXHRcdC8vIElmIG5vIHNwZWNpZmljIHdhbGt0aHJvdWdoIGlzIHJlcXVlc3RlZCBhbmQgYWdlbnQgc2Vzc2lvbnMgd2VsY29tZSBpcyBwcmVmZXJyZWQsIG9wZW4gdGhhdCBpbnN0ZWFkXG5cdFx0aWYgKCF3YWxrdGhyb3VnaElEICYmICFjaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5oaWRkZW4gJiYgY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignd29ya2JlbmNoLnN0YXJ0dXBFZGl0b3InKSA9PT0gJ2FnZW50U2Vzc2lvbnNXZWxjb21lUGFnZScpIHtcblx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFnZW50U2Vzc2lvbnNXZWxjb21lUGFnZS5DT01NQU5EX0lEKTtcblx0XHRcdHJldHVybjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHdhbGt0aHJvdWdoSUQpIHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRDYXRlZ29yeSA9IHR5cGVvZiB3YWxrdGhyb3VnaElEID09PSAnc3RyaW5nJyA/IHdhbGt0aHJvdWdoSUQgOiB3YWxrdGhyb3VnaElELmNhdGVnb3J5O1xuXHRcdFx0XHRsZXQgc2VsZWN0ZWRTdGVwOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICh0eXBlb2Ygd2Fsa3Rocm91Z2hJRCA9PT0gJ29iamVjdCcgJiYgJ2NhdGVnb3J5JyBpbiB3YWxrdGhyb3VnaElEICYmICdzdGVwJyBpbiB3YWxrdGhyb3VnaElEKSB7XG5cdFx0XHRcdFx0c2VsZWN0ZWRTdGVwID0gYCR7d2Fsa3Rocm91Z2hJRC5jYXRlZ29yeX0jJHt3YWxrdGhyb3VnaElELnN0ZXB9YDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZWxlY3RlZFN0ZXAgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJZiB0aGUgd2Fsa3Rocm91Z2ggaXMgYWxyZWFkeSBvcGVuIGp1c3QgcmV2ZWFsIHRoZSBzdGVwXG5cdFx0XHRcdGlmIChzZWxlY3RlZFN0ZXAgJiYgYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgR2V0dGluZ1N0YXJ0ZWRJbnB1dCAmJiBhY3RpdmVFZGl0b3Iuc2VsZWN0ZWRDYXRlZ29yeSA9PT0gc2VsZWN0ZWRDYXRlZ29yeSkge1xuXHRcdFx0XHRcdGFjdGl2ZUVkaXRvci5zaG93V2VsY29tZSA9IGZhbHNlO1xuXHRcdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3YWxrdGhyb3VnaHMuc2VsZWN0U3RlcCcsIHNlbGVjdGVkU3RlcCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IG9wdGlvbnM6IEdldHRpbmdTdGFydGVkRWRpdG9yT3B0aW9ucztcblx0XHRcdFx0aWYgKHNlbGVjdGVkQ2F0ZWdvcnkpIHtcblx0XHRcdFx0XHQvLyBPdGhlcndpc2Ugb3BlbiB0aGUgd2Fsa3Rocm91Z2ggZWRpdG9yIHdpdGggdGhlIHNlbGVjdGVkIGNhdGVnb3J5IGFuZCBzdGVwXG5cdFx0XHRcdFx0b3B0aW9ucyA9IHsgc2VsZWN0ZWRDYXRlZ29yeSwgc2VsZWN0ZWRTdGVwLCBzaG93V2VsY29tZTogZmFsc2UsIHByZXNlcnZlRm9jdXM6IHRvU2lkZSA/PyBmYWxzZSwgaW5hY3RpdmUgfTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBPcGVuIFdlbGNvbWUgcGFnZVxuXHRcdFx0XHRcdG9wdGlvbnMgPSB7IHNlbGVjdGVkQ2F0ZWdvcnksIHNlbGVjdGVkU3RlcCwgc2hvd1dlbGNvbWU6IHRydWUsIHByZXNlcnZlRm9jdXM6IHRvU2lkZSA/PyBmYWxzZSwgaW5hY3RpdmUgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdHJlc291cmNlOiBHZXR0aW5nU3RhcnRlZElucHV0LlJFU09VUkNFLFxuXHRcdFx0XHRcdG9wdGlvbnNcblx0XHRcdFx0fSwgdG9TaWRlID8gU0lERV9HUk9VUCA6IHVuZGVmaW5lZCk7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IEdldHRpbmdTdGFydGVkSW5wdXQuUkVTT1VSQ0UsXG5cdFx0XHRcdFx0b3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiB0b1NpZGUgPz8gZmFsc2UsIGluYWN0aXZlIH1cblx0XHRcdFx0fSwgdG9TaWRlID8gU0lERV9HUk9VUCA6IHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KS5yZWdpc3RlckVkaXRvclNlcmlhbGl6ZXIoR2V0dGluZ1N0YXJ0ZWRJbnB1dC5JRCwgR2V0dGluZ1N0YXJ0ZWRJbnB1dFNlcmlhbGl6ZXIpO1xuUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5yZWdpc3RlckVkaXRvclBhbmUoXG5cdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRHZXR0aW5nU3RhcnRlZFBhZ2UsXG5cdFx0R2V0dGluZ1N0YXJ0ZWRQYWdlLklELFxuXHRcdGxvY2FsaXplKCd3ZWxjb21lJywgXCJXZWxjb21lXCIpXG5cdCksXG5cdFtcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoR2V0dGluZ1N0YXJ0ZWRJbnB1dClcblx0XVxuKTtcblxuY29uc3QgY2F0ZWdvcnkgPSBsb2NhbGl6ZTIoJ3dlbGNvbWUnLCBcIldlbGNvbWVcIik7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dlbGNvbWUuZ29CYWNrJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dlbGNvbWUuZ29CYWNrJywgJ0dvIEJhY2snKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHRcdHdoZW46IGluV2VsY29tZUNvbnRleHRcblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgJ2dldHRpbmdTdGFydGVkUGFnZScpLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBHZXR0aW5nU3RhcnRlZFBhZ2UpIHtcblx0XHRcdGVkaXRvclBhbmUuZXNjYXBlKCk7XG5cdFx0fVxuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogJ3dhbGt0aHJvdWdocy5zZWxlY3RTdGVwJyxcblx0aGFuZGxlcjogKGFjY2Vzc29yLCBzdGVwSUQ6IHN0cmluZykgPT4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBHZXR0aW5nU3RhcnRlZFBhZ2UpIHtcblx0XHRcdGVkaXRvclBhbmUuc2VsZWN0U3RlcExvb3NlKHN0ZXBJRCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ0Nhbm5vdCBydW4gd2Fsa3Rocm91Z2hzLnNlbGVjdFN0ZXAgb3V0c2lkZSBvZiB3YWxrdGhyb3VnaCBjb250ZXh0Jyk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd2VsY29tZS5tYXJrU3RlcENvbXBsZXRlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd2VsY29tZS5tYXJrU3RlcENvbXBsZXRlJywgXCJNYXJrIFN0ZXAgQ29tcGxldGVcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnOiBzdHJpbmcpIHtcblx0XHRpZiAoIWFyZykgeyByZXR1cm47IH1cblx0XHRjb25zdCBnZXR0aW5nU3RhcnRlZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdhbGt0aHJvdWdoc1NlcnZpY2UpO1xuXHRcdGdldHRpbmdTdGFydGVkU2VydmljZS5wcm9ncmVzc1N0ZXAoYXJnKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dlbGNvbWUubWFya1N0ZXBJbmNvbXBsZXRlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd2VsY29tZS5tYXJrU3RlcElub21wbGV0ZScsIFwiTWFyayBTdGVwIEluY29tcGxldGVcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnOiBzdHJpbmcpIHtcblx0XHRpZiAoIWFyZykgeyByZXR1cm47IH1cblx0XHRjb25zdCBnZXR0aW5nU3RhcnRlZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdhbGt0aHJvdWdoc1NlcnZpY2UpO1xuXHRcdGdldHRpbmdTdGFydGVkU2VydmljZS5kZXByb2dyZXNzU3RlcChhcmcpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd2VsY29tZS5zaG93QWxsV2Fsa3Rocm91Z2hzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dlbGNvbWUuc2hvd0FsbFdhbGt0aHJvdWdocycsICdPcGVuIFdhbGt0aHJvdWdoLi4uJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJIZWxwTWVudSxcblx0XHRcdFx0Z3JvdXA6ICcxX3dlbGNvbWUnLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFF1aWNrUGlja0l0ZW1zKFxuXHRcdGNvbnRleHRTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0Z2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlOiBJV2Fsa3Rocm91Z2hzU2VydmljZVxuXHQpOiBQcm9taXNlPElRdWlja1BpY2tJdGVtW10+IHtcblx0XHRjb25zdCBjYXRlZ29yaWVzID0gYXdhaXQgZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLmdldFdhbGt0aHJvdWdocygpO1xuXHRcdHJldHVybiBjYXRlZ29yaWVzXG5cdFx0XHQuZmlsdGVyKGMgPT4gY29udGV4dFNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhjLndoZW4pKVxuXHRcdFx0Lm1hcCh4ID0+ICh7XG5cdFx0XHRcdGlkOiB4LmlkLFxuXHRcdFx0XHRsYWJlbDogeC50aXRsZSxcblx0XHRcdFx0ZGV0YWlsOiB4LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogeC5zb3VyY2UsXG5cdFx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBnZXR0aW5nU3RhcnRlZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdhbGt0aHJvdWdoc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGV4dGVuc2lvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljaygpKTtcblx0XHRxdWlja1BpY2suY2FuU2VsZWN0TWFueSA9IGZhbHNlO1xuXHRcdHF1aWNrUGljay5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHRcdHF1aWNrUGljay5tYXRjaE9uRGV0YWlsID0gdHJ1ZTtcblx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgncGlja1dhbGt0aHJvdWdocycsICdTZWxlY3QgYSB3YWxrdGhyb3VnaCB0byBvcGVuJyk7XG5cdFx0cXVpY2tQaWNrLml0ZW1zID0gYXdhaXQgdGhpcy5nZXRRdWlja1BpY2tJdGVtcyhjb250ZXh0U2VydmljZSwgZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlKTtcblx0XHRxdWlja1BpY2suYnVzeSA9IHRydWU7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXTtcblx0XHRcdGlmIChzZWxlY3Rpb24pIHtcblx0XHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbldhbGt0aHJvdWdoJywgc2VsZWN0aW9uLmlkKTtcblx0XHRcdH1cblx0XHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXHRcdGF3YWl0IGV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGdldHRpbmdTdGFydGVkU2VydmljZS5vbkRpZEFkZFdhbGt0aHJvdWdoKGFzeW5jICgpID0+IHtcblx0XHRcdHF1aWNrUGljay5pdGVtcyA9IGF3YWl0IHRoaXMuZ2V0UXVpY2tQaWNrSXRlbXMoY29udGV4dFNlcnZpY2UsIGdldHRpbmdTdGFydGVkU2VydmljZSk7XG5cdFx0fSkpO1xuXHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0cXVpY2tQaWNrLmJ1c3kgPSBmYWxzZTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6ICd3ZWxjb21lLm5ld1dvcmtzcGFjZUNoYXQnLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IsIHN0ZXBJRDogc3RyaW5nKSA9PiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW4nLCB7IG1vZGU6ICdhZ2VudCcsIHF1ZXJ5OiAnI25ldyAnLCBpc1BhcnRpYWxRdWVyeTogdHJ1ZSB9KTtcblx0fVxufSk7XG5cbmV4cG9ydCBjb25zdCBXb3Jrc3BhY2VQbGF0Zm9ybSA9IG5ldyBSYXdDb250ZXh0S2V5PCdtYWMnIHwgJ2xpbnV4JyB8ICd3aW5kb3dzJyB8ICd3ZWJ3b3JrZXInIHwgdW5kZWZpbmVkPignd29ya3NwYWNlUGxhdGZvcm0nLCB1bmRlZmluZWQsIGxvY2FsaXplKCd3b3Jrc3BhY2VQbGF0Zm9ybScsIFwiVGhlIHBsYXRmb3JtIG9mIHRoZSBjdXJyZW50IHdvcmtzcGFjZSwgd2hpY2ggaW4gcmVtb3RlIG9yIHNlcnZlcmxlc3MgY29udGV4dHMgbWF5IGJlIGRpZmZlcmVudCBmcm9tIHRoZSBwbGF0Zm9ybSBvZiB0aGUgVUlcIikpO1xuY2xhc3MgV29ya3NwYWNlUGxhdGZvcm1Db250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi53b3Jrc3BhY2VQbGF0Zm9ybSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMucmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCkudGhlbihlbnYgPT4ge1xuXHRcdFx0Y29uc3QgcmVtb3RlT1MgPSBlbnY/Lm9zO1xuXG5cdFx0XHRjb25zdCByZW1vdGVQbGF0Zm9ybSA9IHJlbW90ZU9TID09PSBPUy5NYWNpbnRvc2ggPyAnbWFjJ1xuXHRcdFx0XHQ6IHJlbW90ZU9TID09PSBPUy5XaW5kb3dzID8gJ3dpbmRvd3MnXG5cdFx0XHRcdFx0OiByZW1vdGVPUyA9PT0gT1MuTGludXggPyAnbGludXgnXG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKHJlbW90ZVBsYXRmb3JtKSB7XG5cdFx0XHRcdFdvcmtzcGFjZVBsYXRmb3JtLmJpbmRUbyh0aGlzLmNvbnRleHRTZXJ2aWNlKS5zZXQocmVtb3RlUGxhdGZvcm0pO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdFx0XHRXb3Jrc3BhY2VQbGF0Zm9ybS5iaW5kVG8odGhpcy5jb250ZXh0U2VydmljZSkuc2V0KCdtYWMnKTtcblx0XHRcdFx0fSBlbHNlIGlmIChpc0xpbnV4KSB7XG5cdFx0XHRcdFx0V29ya3NwYWNlUGxhdGZvcm0uYmluZFRvKHRoaXMuY29udGV4dFNlcnZpY2UpLnNldCgnbGludXgnKTtcblx0XHRcdFx0fSBlbHNlIGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdFx0XHRXb3Jrc3BhY2VQbGF0Zm9ybS5iaW5kVG8odGhpcy5jb250ZXh0U2VydmljZSkuc2V0KCd3aW5kb3dzJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdFdvcmtzcGFjZVBsYXRmb3JtLmJpbmRUbyh0aGlzLmNvbnRleHRTZXJ2aWNlKS5zZXQoJ3dlYndvcmtlcicpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcignRXJyb3I6IFVuYWJsZSB0byBkZXRlY3Qgd29ya3NwYWNlIHBsYXRmb3JtJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuY29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0Li4ud29ya2JlbmNoQ29uZmlndXJhdGlvbk5vZGVCYXNlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0J3dvcmtiZW5jaC53ZWxjb21lUGFnZS53YWxrdGhyb3VnaHMub3Blbk9uSW5zdGFsbCc6IHtcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtiZW5jaC53ZWxjb21lUGFnZS53YWxrdGhyb3VnaHMub3Blbk9uSW5zdGFsbCcsIFwiV2hlbiBlbmFibGVkLCBhbiBleHRlbnNpb24ncyB3YWxrdGhyb3VnaCB3aWxsIG9wZW4gdXBvbiBpbnN0YWxsIG9mIHRoZSBleHRlbnNpb24uXCIpXG5cdFx0fSxcblx0XHQnd29ya2JlbmNoLnN0YXJ0dXBFZGl0b3InOiB7XG5cdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0UsXG5cdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0J2VudW0nOiBbJ25vbmUnLCAnd2VsY29tZVBhZ2UnLCAncmVhZG1lJywgJ25ld1VudGl0bGVkRmlsZScsICd3ZWxjb21lUGFnZUluRW1wdHlXb3JrYmVuY2gnLCAndGVybWluYWwnLCAnYWdlbnRTZXNzaW9uc1dlbGNvbWVQYWdlJ10sXG5cdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0bG9jYWxpemUoeyBjb21tZW50OiBbJ1RoaXMgaXMgdGhlIGRlc2NyaXB0aW9uIGZvciBhIHNldHRpbmcuIFZhbHVlcyBzdXJyb3VuZGVkIGJ5IHNpbmdsZSBxdW90ZXMgYXJlIG5vdCB0byBiZSB0cmFuc2xhdGVkLiddLCBrZXk6ICd3b3JrYmVuY2guc3RhcnR1cEVkaXRvci5ub25lJyB9LCBcIlN0YXJ0IHdpdGhvdXQgYW4gZWRpdG9yLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoeyBjb21tZW50OiBbJ1RoaXMgaXMgdGhlIGRlc2NyaXB0aW9uIGZvciBhIHNldHRpbmcuIFZhbHVlcyBzdXJyb3VuZGVkIGJ5IHNpbmdsZSBxdW90ZXMgYXJlIG5vdCB0byBiZSB0cmFuc2xhdGVkLiddLCBrZXk6ICd3b3JrYmVuY2guc3RhcnR1cEVkaXRvci53ZWxjb21lUGFnZScgfSwgXCJPcGVuIHRoZSBXZWxjb21lIHBhZ2UsIHdpdGggY29udGVudCB0byBhaWQgaW4gZ2V0dGluZyBzdGFydGVkIHdpdGggVlMgQ29kZSBhbmQgZXh0ZW5zaW9ucy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKHsgY29tbWVudDogWydUaGlzIGlzIHRoZSBkZXNjcmlwdGlvbiBmb3IgYSBzZXR0aW5nLiBWYWx1ZXMgc3Vycm91bmRlZCBieSBzaW5nbGUgcXVvdGVzIGFyZSBub3QgdG8gYmUgdHJhbnNsYXRlZC4nXSwga2V5OiAnd29ya2JlbmNoLnN0YXJ0dXBFZGl0b3IucmVhZG1lJyB9LCBcIk9wZW4gdGhlIFJFQURNRSB3aGVuIG9wZW5pbmcgYSBmb2xkZXIgdGhhdCBjb250YWlucyBvbmUsIGZhbGxiYWNrIHRvICd3ZWxjb21lUGFnZScgb3RoZXJ3aXNlLiBOb3RlOiBUaGlzIGlzIG9ubHkgb2JzZXJ2ZWQgYXMgYSBnbG9iYWwgY29uZmlndXJhdGlvbiwgaXQgd2lsbCBiZSBpZ25vcmVkIGlmIHNldCBpbiBhIHdvcmtzcGFjZSBvciBmb2xkZXIgY29uZmlndXJhdGlvbi5cIiksXG5cdFx0XHRcdGxvY2FsaXplKHsgY29tbWVudDogWydUaGlzIGlzIHRoZSBkZXNjcmlwdGlvbiBmb3IgYSBzZXR0aW5nLiBWYWx1ZXMgc3Vycm91bmRlZCBieSBzaW5nbGUgcXVvdGVzIGFyZSBub3QgdG8gYmUgdHJhbnNsYXRlZC4nXSwga2V5OiAnd29ya2JlbmNoLnN0YXJ0dXBFZGl0b3IubmV3VW50aXRsZWRGaWxlJyB9LCBcIk9wZW4gYSBuZXcgdW50aXRsZWQgdGV4dCBmaWxlIChvbmx5IGFwcGxpZXMgd2hlbiBvcGVuaW5nIGFuIGVtcHR5IHdpbmRvdykuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gZm9yIGEgc2V0dGluZy4gVmFsdWVzIHN1cnJvdW5kZWQgYnkgc2luZ2xlIHF1b3RlcyBhcmUgbm90IHRvIGJlIHRyYW5zbGF0ZWQuJ10sIGtleTogJ3dvcmtiZW5jaC5zdGFydHVwRWRpdG9yLndlbGNvbWVQYWdlSW5FbXB0eVdvcmtiZW5jaCcgfSwgXCJPcGVuIHRoZSBXZWxjb21lIHBhZ2Ugd2hlbiBvcGVuaW5nIGFuIGVtcHR5IHdvcmtiZW5jaC5cIiksXG5cdFx0XHRcdGxvY2FsaXplKHsgY29tbWVudDogWydUaGlzIGlzIHRoZSBkZXNjcmlwdGlvbiBmb3IgYSBzZXR0aW5nLiBWYWx1ZXMgc3Vycm91bmRlZCBieSBzaW5nbGUgcXVvdGVzIGFyZSBub3QgdG8gYmUgdHJhbnNsYXRlZC4nXSwga2V5OiAnd29ya2JlbmNoLnN0YXJ0dXBFZGl0b3IudGVybWluYWwnIH0sIFwiT3BlbiBhIG5ldyB0ZXJtaW5hbCBpbiB0aGUgZWRpdG9yIGFyZWEuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gZm9yIGEgc2V0dGluZy4gVmFsdWVzIHN1cnJvdW5kZWQgYnkgc2luZ2xlIHF1b3RlcyBhcmUgbm90IHRvIGJlIHRyYW5zbGF0ZWQuJ10sIGtleTogJ3dvcmtiZW5jaC5zdGFydHVwRWRpdG9yLmFnZW50U2Vzc2lvbnNXZWxjb21lUGFnZScgfSwgXCJPcGVuIHRoZSBBZ2VudCBTZXNzaW9ucyBXZWxjb21lIHBhZ2UuIFdpbGwgb3ZlcnJpZGUgdGhlIHdvcmtiZW5jaCBzZWNvbmRhcnkgc2lkZSBiYXIgdmlzaWJpbGl0eSBzZXR0aW5ncy5cIiksXG5cdFx0XHRdLFxuXHRcdFx0J2RlZmF1bHQnOiAnd2VsY29tZVBhZ2UnLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ3dvcmtiZW5jaC5zdGFydHVwRWRpdG9yJywgXCJDb250cm9scyB3aGljaCBlZGl0b3IgaXMgc2hvd24gYXQgc3RhcnR1cCwgaWYgbm9uZSBhcmUgcmVzdG9yZWQgZnJvbSB0aGUgcHJldmlvdXMgc2Vzc2lvbi5cIiksXG5cdFx0XHQnZXhwZXJpbWVudCc6IHsgbW9kZTogJ2F1dG8nIH0sXG5cdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogJ25vbmUnLCByZWFkT25seTogdHJ1ZSB9LFxuXHRcdH0sXG5cdFx0J3dvcmtiZW5jaC53ZWxjb21lUGFnZS5wcmVmZXJSZWR1Y2VkTW90aW9uJzoge1xuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgnZGVwcmVjYXRpb25NZXNzYWdlJywgXCJEZXByZWNhdGVkLCB1c2UgdGhlIGdsb2JhbCBgd29ya2JlbmNoLnJlZHVjZU1vdGlvbmAuXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3b3JrYmVuY2gud2VsY29tZVBhZ2UucHJlZmVyUmVkdWNlZE1vdGlvbicsIFwiV2hlbiBlbmFibGVkLCByZWR1Y2UgbW90aW9uIGluIHdlbGNvbWUgcGFnZS5cIilcblx0XHR9LFxuXHRcdCd3b3JrYmVuY2gud2VsY29tZVBhZ2UuZXhwZXJpbWVudGFsT25ib2FyZGluZyc6IHtcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd29ya2JlbmNoLndlbGNvbWVQYWdlLmV4cGVyaW1lbnRhbE9uYm9hcmRpbmcnLCBcIldoZW4gZW5hYmxlZCwgc2hvdyB0aGUgbmV3IG9uYm9hcmRpbmcgZXhwZXJpZW5jZSBpbnN0ZWFkIG9mIHRoZSBjbGFzc2ljIHdhbGt0aHJvdWdoIG9uIGZpcnN0IGxhdW5jaC5cIiksXG5cdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihXb3Jrc3BhY2VQbGF0Zm9ybUNvbnRyaWJ1dGlvbi5JRCwgV29ya3NwYWNlUGxhdGZvcm1Db250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFN0YXJ0dXBQYWdlRWRpdG9yUmVzb2x2ZXJDb250cmlidXRpb24uSUQsIFN0YXJ0dXBQYWdlRWRpdG9yUmVzb2x2ZXJDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoU3RhcnR1cFBhZ2VSdW5uZXJDb250cmlidXRpb24uSUQsIFN0YXJ0dXBQYWdlUnVubmVyQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcblxuQWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5yZWdpc3RlcihuZXcgR2V0dGluZ1N0YXJ0ZWRBY2Nlc3NpYmxlVmlldygpKTtcblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsK0JBQStCLG9CQUFvQix3QkFBd0I7QUFDcEYsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBZ0Q7QUFDekQsU0FBUyxRQUFRLGlCQUFpQixlQUFlO0FBRWpELFNBQVMsZ0JBQWdCLG9CQUFvQixxQkFBcUI7QUFDbEUsU0FBUyxnQkFBZ0Isa0JBQWtCO0FBQzNDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLDRCQUFpRDtBQUMxRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFzQywyQkFBMkI7QUFDakUsU0FBUyxnQ0FBZ0Msc0JBQXNCO0FBQy9ELFNBQVMsb0JBQW9CLGNBQWMsK0JBQXVEO0FBQ2xHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsa0JBQWtCLHVCQUF1QjtBQUNsRCxTQUFTLDBCQUEwQztBQUNuRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLFNBQVMsYUFBYSxXQUFXLG1CQUFtQixVQUFVO0FBQ3ZFLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUNBQXVDLHFDQUFxQztBQUNyRixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLCtCQUErQjtBQUV4QyxZQUFZLFdBQVc7QUFFdkIsZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLEVBQ3JDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsYUFBYSxTQUFTO0FBQUEsTUFDdkMsVUFBVSxXQUFXO0FBQUEsTUFDckIsSUFB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
