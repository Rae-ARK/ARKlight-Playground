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
import "../../../browser/media/sidebarActionButton.css";
import "./media/customizationsToolbar.css";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { AICustomizationManagementEditor } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js";
import { AICustomizationManagementEditorInput } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js";
import { IAICustomizationItemsModel } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js";
import { IMcpService } from "../../../../workbench/contrib/mcp/common/mcpTypes.js";
import { ILanguageModelToolsService } from "../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js";
import { AGENT_HOST_COPILOT_CLI_SESSION_TYPE, countEnabledCustomizationTools, IAgentHostToolSetEnablementService } from "../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js";
import { Menus } from "../../../browser/menus.js";
import { agentIcon, automationIcon, instructionsIcon, mcpServerIcon, pluginIcon, skillIcon, hookIcon, toolsIcon } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { $, append } from "../../../../base/browser/dom.js";
import { autorun } from "../../../../base/common/observable.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { AICustomizationManagementSection } from "../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { ChatAutomationsEnabledContext } from "../../../../workbench/contrib/chat/common/automations/automationsEnabled.js";
import { IAutomationService } from "../../../../workbench/contrib/chat/common/automations/automationService.js";
import { ICustomizationHarnessService } from "../../../../workbench/contrib/chat/common/customizationHarnessService.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { SessionType } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
function customizationSectionVisibleKey(section) {
  return `sessionsCustomizationSectionVisible.${section}`;
}
const CUSTOMIZATION_OVERVIEW_ITEM = {
  id: "sessions.customization.overview",
  label: localize("overview", "Overview"),
  icon: Codicon.home
};
const CUSTOMIZATION_ITEMS = [
  {
    id: "sessions.customization.agents",
    label: localize("agents", "Agents"),
    icon: agentIcon,
    section: AICustomizationManagementSection.Agents,
    modelSection: AICustomizationManagementSection.Agents
  },
  {
    id: "sessions.customization.skills",
    label: localize("skills", "Skills"),
    icon: skillIcon,
    section: AICustomizationManagementSection.Skills,
    modelSection: AICustomizationManagementSection.Skills
  },
  {
    id: "sessions.customization.instructions",
    label: localize("instructions", "Instructions"),
    icon: instructionsIcon,
    section: AICustomizationManagementSection.Instructions,
    modelSection: AICustomizationManagementSection.Instructions
  },
  {
    id: "sessions.customization.hooks",
    label: localize("hooks", "Hooks"),
    icon: hookIcon,
    section: AICustomizationManagementSection.Hooks,
    modelSection: AICustomizationManagementSection.Hooks
  },
  {
    id: "sessions.customization.automations",
    label: localize("automations", "Automations"),
    icon: automationIcon,
    section: AICustomizationManagementSection.Automations,
    isAutomations: true,
    when: ChatAutomationsEnabledContext
  },
  {
    id: "sessions.customization.mcpServers",
    label: localize("mcpServers", "MCP Servers"),
    icon: mcpServerIcon,
    section: AICustomizationManagementSection.McpServers,
    isMcp: true
  },
  {
    id: "sessions.customization.plugins",
    label: localize("plugins", "Plugins"),
    icon: pluginIcon,
    section: AICustomizationManagementSection.Plugins,
    isPlugins: true
  },
  {
    id: "sessions.customization.tools",
    label: localize("tools", "Tools"),
    icon: toolsIcon,
    section: AICustomizationManagementSection.Tools,
    isTools: true
  },
  {
    id: "sessions.customization.harnessSettings",
    label: localize("harnessSettings", "Codex Settings"),
    icon: Codicon.openai,
    section: AICustomizationManagementSection.HarnessSettings
  }
];
async function openCustomizationOverviewPage(editorService, harnessService, sessionsService) {
  const sessionResource = sessionsService.activeSession.get()?.resource;
  if (sessionResource) {
    harnessService.setActiveSession(sessionResource);
  }
  const input = AICustomizationManagementEditorInput.getOrCreate();
  const pane = await editorService.openEditor(input, { pinned: true });
  if (pane instanceof AICustomizationManagementEditor) {
    pane.showWelcomePage();
  }
}
async function openCustomizationSectionPage(editorService, harnessService, sessionsService, section) {
  const sessionResource = sessionsService.activeSession.get()?.resource;
  if (sessionResource) {
    harnessService.setActiveSession(sessionResource);
  }
  const input = AICustomizationManagementEditorInput.getOrCreate();
  const pane = await editorService.openEditor(input, { pinned: true });
  if (pane instanceof AICustomizationManagementEditor) {
    pane.selectSectionById(section);
  }
}
let CustomizationLinkViewItem = class extends ActionViewItem {
  constructor(action, options, _config, _itemsModel, _mcpService, _toolsService, _toolEnablementService, _automationService) {
    super(void 0, action, { ...options, icon: false, label: false });
    this._config = _config;
    this._itemsModel = _itemsModel;
    this._mcpService = _mcpService;
    this._toolsService = _toolsService;
    this._toolEnablementService = _toolEnablementService;
    this._automationService = _automationService;
    this._viewItemDisposables = this._register(new DisposableStore());
  }
  getTooltip() {
    return void 0;
  }
  render(container) {
    super.render(container);
    container.classList.add("customization-link-widget", "sidebar-action");
    const buttonContainer = append(container, $(".customization-link-button-container"));
    this._button = this._viewItemDisposables.add(new Button(buttonContainer, {
      ...defaultButtonStyles,
      secondary: true,
      title: false,
      supportIcons: true,
      buttonSecondaryBackground: "transparent",
      buttonSecondaryHoverBackground: void 0,
      buttonSecondaryForeground: void 0,
      buttonSecondaryBorder: void 0
    }));
    this._button.element.classList.add("customization-link-button", "sidebar-action-button");
    this._button.label = `$(${this._config.icon.id}) ${this._config.label}`;
    this._viewItemDisposables.add(this._button.onDidClick(() => {
      this._action.run();
    }));
    this._countContainer = append(this._button.element, $("span.customization-link-counts"));
    this._viewItemDisposables.add(autorun((reader) => {
      const count = this._readCount(reader);
      if (this._countContainer) {
        this._renderTotalCount(this._countContainer, count);
      }
    }));
  }
  _readCount(reader) {
    if (this._config.modelSection) {
      return this._itemsModel.getCount(this._config.modelSection).read(reader);
    }
    if (this._config.isMcp) {
      return this._mcpService.servers.read(reader).length;
    }
    if (this._config.isPlugins) {
      return this._itemsModel.getPluginCount().read(reader);
    }
    if (this._config.isTools) {
      const state = this._toolEnablementService.observe(AGENT_HOST_COPILOT_CLI_SESSION_TYPE).read(reader);
      const toolSets = this._toolsService.toolSets.read(reader);
      return countEnabledCustomizationTools(toolSets, state, reader);
    }
    if (this._config.isAutomations) {
      return this._automationService.automations.read(reader).length;
    }
    return 0;
  }
  _renderTotalCount(container, count) {
    container.textContent = "";
    container.classList.toggle("hidden", count === 0);
    if (count > 0) {
      const badge = append(container, $("span.source-count-badge"));
      const num = append(badge, $("span.source-count-num"));
      num.textContent = `${count}`;
    }
  }
};
CustomizationLinkViewItem = __decorateClass([
  __decorateParam(3, IAICustomizationItemsModel),
  __decorateParam(4, IMcpService),
  __decorateParam(5, ILanguageModelToolsService),
  __decorateParam(6, IAgentHostToolSetEnablementService),
  __decorateParam(7, IAutomationService)
], CustomizationLinkViewItem);
let CustomizationsToolbarContribution = class extends Disposable {
  constructor(actionViewItemService, instantiationService, harnessService, contextKeyService) {
    super();
    const visibilityKeys = /* @__PURE__ */ new Map();
    for (const config of CUSTOMIZATION_ITEMS) {
      if (!config.section) {
        continue;
      }
      const key = new RawContextKey(customizationSectionVisibleKey(config.section), true).bindTo(contextKeyService);
      visibilityKeys.set(config.section, key);
    }
    this._register(autorun((reader) => {
      const activeHarness = harnessService.activeHarness.read(reader);
      harnessService.availableHarnesses.read(reader);
      const descriptor = harnessService.getActiveDescriptor();
      const hidden = new Set(descriptor.hiddenSections ?? []);
      for (const config of CUSTOMIZATION_ITEMS) {
        if (!config.section) {
          continue;
        }
        const supported = config.section !== AICustomizationManagementSection.HarnessSettings || activeHarness === SessionType.AgentHostCodex;
        visibilityKeys.get(config.section).set(!hidden.has(config.section) && supported);
      }
    }));
    this._register(actionViewItemService.register(Menus.SidebarCustomizations, CUSTOMIZATION_OVERVIEW_ITEM.id, (action, options) => {
      return instantiationService.createInstance(CustomizationLinkViewItem, action, options, CUSTOMIZATION_OVERVIEW_ITEM);
    }, void 0));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: CUSTOMIZATION_OVERVIEW_ITEM.id,
          title: CUSTOMIZATION_OVERVIEW_ITEM.label,
          menu: {
            id: Menus.SidebarCustomizations,
            group: "navigation",
            order: 0,
            when: ChatContextKeys.enabled
          }
        });
      }
      async run(accessor) {
        await openCustomizationOverviewPage(
          accessor.get(IEditorService),
          accessor.get(ICustomizationHarnessService),
          accessor.get(ISessionsService)
        );
      }
    }));
    for (const [index, config] of CUSTOMIZATION_ITEMS.entries()) {
      if (!config.section) {
        continue;
      }
      const section = config.section;
      this._register(actionViewItemService.register(Menus.SidebarCustomizations, config.id, (action, options) => {
        return instantiationService.createInstance(CustomizationLinkViewItem, action, options, config);
      }, void 0));
      const sectionVisibleWhen = ContextKeyExpr.has(customizationSectionVisibleKey(section));
      const combinedWhen = config.when ? ContextKeyExpr.and(ChatContextKeys.enabled, sectionVisibleWhen, config.when) : ContextKeyExpr.and(ChatContextKeys.enabled, sectionVisibleWhen);
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: config.id,
            title: config.label,
            menu: {
              id: Menus.SidebarCustomizations,
              group: "navigation",
              order: index + 1,
              when: combinedWhen
            }
          });
        }
        async run(accessor) {
          const editorService = accessor.get(IEditorService);
          const harnessService2 = accessor.get(ICustomizationHarnessService);
          const sessionsService = accessor.get(ISessionsService);
          await openCustomizationSectionPage(editorService, harnessService2, sessionsService, section);
        }
      }));
    }
  }
};
CustomizationsToolbarContribution.ID = "workbench.contrib.sessionsCustomizationsToolbar";
CustomizationsToolbarContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ICustomizationHarnessService),
  __decorateParam(3, IContextKeyService)
], CustomizationsToolbarContribution);
registerWorkbenchContribution2(CustomizationsToolbarContribution.ID, CustomizationsToolbarContribution, WorkbenchPhase.AfterRestored);
function findHarnessIdForSession(session, harnessService) {
  if (!session) {
    return void 0;
  }
  const schemeId = session.resource.scheme;
  if (harnessService.findHarnessById(schemeId)) {
    return schemeId;
  }
  if (harnessService.findHarnessById(session.sessionType)) {
    return session.sessionType;
  }
  return void 0;
}
let ActiveSessionHarnessSyncContribution = class extends Disposable {
  constructor(sessionsService, harnessService) {
    super();
    this._register(autorun((reader) => {
      const session = sessionsService.activeSession.read(reader);
      if (!session) {
        return;
      }
      harnessService.availableHarnesses.read(reader);
      harnessService.setActiveSession(session.resource);
    }));
  }
};
ActiveSessionHarnessSyncContribution.ID = "workbench.contrib.sessionsActiveHarnessSync";
ActiveSessionHarnessSyncContribution = __decorateClass([
  __decorateParam(0, ISessionsService),
  __decorateParam(1, ICustomizationHarnessService)
], ActiveSessionHarnessSyncContribution);
registerWorkbenchContribution2(ActiveSessionHarnessSyncContribution.ID, ActiveSessionHarnessSyncContribution, WorkbenchPhase.AfterRestored);
export {
  ActiveSessionHarnessSyncContribution,
  CUSTOMIZATION_ITEMS,
  CustomizationLinkViewItem,
  CustomizationsToolbarContribution,
  findHarnessIdForSession,
  openCustomizationOverviewPage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvYnJvd3Nlci9jdXN0b21pemF0aW9uc1Rvb2xiYXIuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuLi8uLi8uLi9icm93c2VyL21lZGlhL3NpZGViYXJBY3Rpb25CdXR0b24uY3NzJztcbmltcG9ydCAnLi9tZWRpYS9jdXN0b21pemF0aW9uc1Rvb2xiYXIuY3NzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvci5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCwgSXRlbXNNb2RlbFNlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwuanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9tY3AvY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX0NPUElMT1RfQ0xJX1NFU1NJT05fVFlQRSwgY291bnRFbmFibGVkQ3VzdG9taXphdGlvblRvb2xzLCBJQWdlbnRIb3N0VG9vbFNldEVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFRvb2xTZXRFbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgYWdlbnRJY29uLCBhdXRvbWF0aW9uSWNvbiwgaW5zdHJ1Y3Rpb25zSWNvbiwgbWNwU2VydmVySWNvbiwgcGx1Z2luSWNvbiwgc2tpbGxJY29uLCBob29rSWNvbiwgdG9vbHNJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25JY29ucy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSwgSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyAkLCBhcHBlbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDaGF0QXV0b21hdGlvbnNFbmFibGVkQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25zRW5hYmxlZC5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUN1c3RvbWl6YXRpb25JdGVtQ29uZmlnIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xuXHRyZWFkb25seSBzZWN0aW9uPzogdHlwZW9mIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uW2tleW9mIHR5cGVvZiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbl07XG5cdC8qKiBJZiBzZXQsIGNvdW50IGNvbWVzIGZyb20gYElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsLmdldENvdW50KG1vZGVsU2VjdGlvbilgLiAqL1xuXHRyZWFkb25seSBtb2RlbFNlY3Rpb24/OiBJdGVtc01vZGVsU2VjdGlvbjtcblx0cmVhZG9ubHkgaXNNY3A/OiBib29sZWFuO1xuXHRyZWFkb25seSBpc1BsdWdpbnM/OiBib29sZWFuO1xuXHRyZWFkb25seSBpc1Rvb2xzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNBdXRvbWF0aW9ucz86IGJvb2xlYW47XG5cdC8qKiBBZGRpdGlvbmFsIGB3aGVuYCBjbGF1c2UgYmV5b25kIHRoZSBzdGFuZGFyZCBoYXJuZXNzLXZpc2liaWxpdHkgZ2F0ZS4gKi9cblx0cmVhZG9ubHkgd2hlbj86IENvbnRleHRLZXlFeHByZXNzaW9uO1xufVxuXG4vKipcbiAqIFBlci1zZWN0aW9uIGNvbnRleHQga2V5IGluZGljYXRpbmcgd2hldGhlciB0aGUgYWN0aXZlIGhhcm5lc3MgZXhwb3Nlc1xuICogdGhlIHNlY3Rpb24gaW4gdGhlIHNpZGViYXIgY3VzdG9taXphdGlvbnMgdG9vbGJhci4gRHJpdmVuIGJ5XG4gKiBgSUhhcm5lc3NEZXNjcmlwdG9yLmhpZGRlblNlY3Rpb25zYCBhbmQgY29uc3VtZWQgdmlhIHRoZSBtZW51IGB3aGVuYFxuICogY2xhdXNlIHJlZ2lzdGVyZWQgYWxvbmdzaWRlIGVhY2ggY3VzdG9taXphdGlvbiBhY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIGN1c3RvbWl6YXRpb25TZWN0aW9uVmlzaWJsZUtleShzZWN0aW9uOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYHNlc3Npb25zQ3VzdG9taXphdGlvblNlY3Rpb25WaXNpYmxlLiR7c2VjdGlvbn1gO1xufVxuXG5jb25zdCBDVVNUT01JWkFUSU9OX09WRVJWSUVXX0lURU06IElDdXN0b21pemF0aW9uSXRlbUNvbmZpZyA9IHtcblx0aWQ6ICdzZXNzaW9ucy5jdXN0b21pemF0aW9uLm92ZXJ2aWV3Jyxcblx0bGFiZWw6IGxvY2FsaXplKCdvdmVydmlldycsIFwiT3ZlcnZpZXdcIiksXG5cdGljb246IENvZGljb24uaG9tZSxcbn07XG5cbmV4cG9ydCBjb25zdCBDVVNUT01JWkFUSU9OX0lURU1TOiBJQ3VzdG9taXphdGlvbkl0ZW1Db25maWdbXSA9IFtcblx0e1xuXHRcdGlkOiAnc2Vzc2lvbnMuY3VzdG9taXphdGlvbi5hZ2VudHMnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRzJywgXCJBZ2VudHNcIiksXG5cdFx0aWNvbjogYWdlbnRJY29uLFxuXHRcdHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyxcblx0XHRtb2RlbFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyxcblx0fSxcblx0e1xuXHRcdGlkOiAnc2Vzc2lvbnMuY3VzdG9taXphdGlvbi5za2lsbHMnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2tpbGxzJywgXCJTa2lsbHNcIiksXG5cdFx0aWNvbjogc2tpbGxJY29uLFxuXHRcdHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyxcblx0XHRtb2RlbFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyxcblx0fSxcblx0e1xuXHRcdGlkOiAnc2Vzc2lvbnMuY3VzdG9taXphdGlvbi5pbnN0cnVjdGlvbnMnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25zJywgXCJJbnN0cnVjdGlvbnNcIiksXG5cdFx0aWNvbjogaW5zdHJ1Y3Rpb25zSWNvbixcblx0XHRzZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMsXG5cdFx0bW9kZWxTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMsXG5cdH0sXG5cdHtcblx0XHRpZDogJ3Nlc3Npb25zLmN1c3RvbWl6YXRpb24uaG9va3MnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnaG9va3MnLCBcIkhvb2tzXCIpLFxuXHRcdGljb246IGhvb2tJY29uLFxuXHRcdHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzLFxuXHRcdG1vZGVsU2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSG9va3MsXG5cdH0sXG5cdHtcblx0XHRpZDogJ3Nlc3Npb25zLmN1c3RvbWl6YXRpb24uYXV0b21hdGlvbnMnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnYXV0b21hdGlvbnMnLCBcIkF1dG9tYXRpb25zXCIpLFxuXHRcdGljb246IGF1dG9tYXRpb25JY29uLFxuXHRcdHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkF1dG9tYXRpb25zLFxuXHRcdGlzQXV0b21hdGlvbnM6IHRydWUsXG5cdFx0d2hlbjogQ2hhdEF1dG9tYXRpb25zRW5hYmxlZENvbnRleHQsXG5cdH0sXG5cdHtcblx0XHRpZDogJ3Nlc3Npb25zLmN1c3RvbWl6YXRpb24ubWNwU2VydmVycycsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdtY3BTZXJ2ZXJzJywgXCJNQ1AgU2VydmVyc1wiKSxcblx0XHRpY29uOiBtY3BTZXJ2ZXJJY29uLFxuXHRcdHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMsXG5cdFx0aXNNY3A6IHRydWUsXG5cdH0sXG5cdHtcblx0XHRpZDogJ3Nlc3Npb25zLmN1c3RvbWl6YXRpb24ucGx1Z2lucycsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdwbHVnaW5zJywgXCJQbHVnaW5zXCIpLFxuXHRcdGljb246IHBsdWdpbkljb24sXG5cdFx0c2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUGx1Z2lucyxcblx0XHRpc1BsdWdpbnM6IHRydWUsXG5cdH0sXG5cdHtcblx0XHRpZDogJ3Nlc3Npb25zLmN1c3RvbWl6YXRpb24udG9vbHMnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgndG9vbHMnLCBcIlRvb2xzXCIpLFxuXHRcdGljb246IHRvb2xzSWNvbixcblx0XHRzZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ub29scyxcblx0XHRpc1Rvb2xzOiB0cnVlLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICdzZXNzaW9ucy5jdXN0b21pemF0aW9uLmhhcm5lc3NTZXR0aW5ncycsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdoYXJuZXNzU2V0dGluZ3MnLCBcIkNvZGV4IFNldHRpbmdzXCIpLFxuXHRcdGljb246IENvZGljb24ub3BlbmFpLFxuXHRcdHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhhcm5lc3NTZXR0aW5ncyxcblx0fSxcbl07XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBvcGVuQ3VzdG9taXphdGlvbk92ZXJ2aWV3UGFnZShlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSwgaGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKT8ucmVzb3VyY2U7XG5cdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRoYXJuZXNzU2VydmljZS5zZXRBY3RpdmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRjb25zdCBpbnB1dCA9IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dC5nZXRPckNyZWF0ZSgpO1xuXHRjb25zdCBwYW5lID0gYXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0aWYgKHBhbmUgaW5zdGFuY2VvZiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yKSB7XG5cdFx0cGFuZS5zaG93V2VsY29tZVBhZ2UoKTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBvcGVuQ3VzdG9taXphdGlvblNlY3Rpb25QYWdlKGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLCBoYXJuZXNzU2VydmljZTogSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwgc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLCBzZWN0aW9uOiB0eXBlb2YgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25ba2V5b2YgdHlwZW9mIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uXSk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKT8ucmVzb3VyY2U7XG5cdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRoYXJuZXNzU2VydmljZS5zZXRBY3RpdmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRjb25zdCBpbnB1dCA9IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dC5nZXRPckNyZWF0ZSgpO1xuXHRjb25zdCBwYW5lID0gYXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0aWYgKHBhbmUgaW5zdGFuY2VvZiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yKSB7XG5cdFx0cGFuZS5zZWxlY3RTZWN0aW9uQnlJZChzZWN0aW9uKTtcblx0fVxufVxuXG4vKipcbiAqIEN1c3RvbSBBY3Rpb25WaWV3SXRlbSBmb3IgZWFjaCBjdXN0b21pemF0aW9uIGxpbmsgaW4gdGhlIHRvb2xiYXIuXG4gKiBSZW5kZXJzIGljb24gKyBsYWJlbCArIGEgc2luZ2xlIGNvdW50IGJhZGdlIGRyaXZlbiBieSB0aGUgc2FtZVxuICogb2JzZXJ2YWJsZXMgdGhhdCBmZWVkIHRoZSBjdXN0b21pemF0aW9ucyBlZGl0b3IgXHUyMDE0IHNvIHRoZSBiYWRnZSBhbHdheXNcbiAqIG1hdGNoZXMgdGhlIGVkaXRvcidzIGNvdW50IGV4YWN0bHkuXG4gKi9cbmV4cG9ydCBjbGFzcyBDdXN0b21pemF0aW9uTGlua1ZpZXdJdGVtIGV4dGVuZHMgQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdJdGVtRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cHJpdmF0ZSBfYnV0dG9uOiBCdXR0b24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvdW50Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0b3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlnOiBJQ3VzdG9taXphdGlvbkl0ZW1Db25maWcsXG5cdFx0QElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsIHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1zTW9kZWw6IElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsLFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUFnZW50SG9zdFRvb2xTZXRFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90b29sRW5hYmxlbWVudFNlcnZpY2U6IElBZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElBdXRvbWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hdXRvbWF0aW9uU2VydmljZTogSUF1dG9tYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgeyAuLi5vcHRpb25zLCBpY29uOiBmYWxzZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdHRoaXMuX3ZpZXdJdGVtRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFRvb2x0aXAoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY3VzdG9taXphdGlvbi1saW5rLXdpZGdldCcsICdzaWRlYmFyLWFjdGlvbicpO1xuXG5cdFx0Ly8gQnV0dG9uIChsZWZ0KSAtIHVzZXMgc3VwcG9ydEljb25zIHRvIHJlbmRlciBjb2RpY29uIGluIGxhYmVsXG5cdFx0Y29uc3QgYnV0dG9uQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmN1c3RvbWl6YXRpb24tbGluay1idXR0b24tY29udGFpbmVyJykpO1xuXHRcdHRoaXMuX2J1dHRvbiA9IHRoaXMuX3ZpZXdJdGVtRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oYnV0dG9uQ29udGFpbmVyLCB7XG5cdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLFxuXHRcdFx0c2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0dGl0bGU6IGZhbHNlLFxuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5QmFja2dyb3VuZDogJ3RyYW5zcGFyZW50Jyxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUhvdmVyQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5Rm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5Qm9yZGVyOiB1bmRlZmluZWQsXG5cdFx0fSkpO1xuXHRcdHRoaXMuX2J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2N1c3RvbWl6YXRpb24tbGluay1idXR0b24nLCAnc2lkZWJhci1hY3Rpb24tYnV0dG9uJyk7XG5cdFx0dGhpcy5fYnV0dG9uLmxhYmVsID0gYCQoJHt0aGlzLl9jb25maWcuaWNvbi5pZH0pICR7dGhpcy5fY29uZmlnLmxhYmVsfWA7XG5cblx0XHR0aGlzLl92aWV3SXRlbURpc3Bvc2FibGVzLmFkZCh0aGlzLl9idXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR0aGlzLl9hY3Rpb24ucnVuKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ291bnQgY29udGFpbmVyIChpbnNpZGUgYnV0dG9uLCBmbG9hdGluZyByaWdodClcblx0XHR0aGlzLl9jb3VudENvbnRhaW5lciA9IGFwcGVuZCh0aGlzLl9idXR0b24uZWxlbWVudCwgJCgnc3Bhbi5jdXN0b21pemF0aW9uLWxpbmstY291bnRzJykpO1xuXG5cdFx0dGhpcy5fdmlld0l0ZW1EaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY291bnQgPSB0aGlzLl9yZWFkQ291bnQocmVhZGVyKTtcblx0XHRcdGlmICh0aGlzLl9jb3VudENvbnRhaW5lcikge1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJUb3RhbENvdW50KHRoaXMuX2NvdW50Q29udGFpbmVyLCBjb3VudCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZENvdW50KHJlYWRlcjogUGFyYW1ldGVyczxQYXJhbWV0ZXJzPHR5cGVvZiBhdXRvcnVuPlswXT5bMF0pOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9jb25maWcubW9kZWxTZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faXRlbXNNb2RlbC5nZXRDb3VudCh0aGlzLl9jb25maWcubW9kZWxTZWN0aW9uKS5yZWFkKHJlYWRlcik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb25maWcuaXNNY3ApIHtcblx0XHRcdHJldHVybiB0aGlzLl9tY3BTZXJ2aWNlLnNlcnZlcnMucmVhZChyZWFkZXIpLmxlbmd0aDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NvbmZpZy5pc1BsdWdpbnMpIHtcblx0XHRcdHJldHVybiB0aGlzLl9pdGVtc01vZGVsLmdldFBsdWdpbkNvdW50KCkucmVhZChyZWFkZXIpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29uZmlnLmlzVG9vbHMpIHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fdG9vbEVuYWJsZW1lbnRTZXJ2aWNlLm9ic2VydmUoQUdFTlRfSE9TVF9DT1BJTE9UX0NMSV9TRVNTSU9OX1RZUEUpLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHRvb2xTZXRzID0gdGhpcy5fdG9vbHNTZXJ2aWNlLnRvb2xTZXRzLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBjb3VudEVuYWJsZWRDdXN0b21pemF0aW9uVG9vbHModG9vbFNldHMsIHN0YXRlLCByZWFkZXIpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29uZmlnLmlzQXV0b21hdGlvbnMpIHtcblx0XHRcdHJldHVybiB0aGlzLl9hdXRvbWF0aW9uU2VydmljZS5hdXRvbWF0aW9ucy5yZWFkKHJlYWRlcikubGVuZ3RoO1xuXHRcdH1cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclRvdGFsQ291bnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgY291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnRhaW5lci50ZXh0Q29udGVudCA9ICcnO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBjb3VudCA9PT0gMCk7XG5cdFx0aWYgKGNvdW50ID4gMCkge1xuXHRcdFx0Y29uc3QgYmFkZ2UgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLnNvdXJjZS1jb3VudC1iYWRnZScpKTtcblx0XHRcdGNvbnN0IG51bSA9IGFwcGVuZChiYWRnZSwgJCgnc3Bhbi5zb3VyY2UtY291bnQtbnVtJykpO1xuXHRcdFx0bnVtLnRleHRDb250ZW50ID0gYCR7Y291bnR9YDtcblx0XHR9XG5cdH1cbn1cblxuLy8gLS0tIFJlZ2lzdGVyIGFjdGlvbnMgYW5kIHZpZXcgaXRlbXMgLS0tIC8vXG5cbmV4cG9ydCBjbGFzcyBDdXN0b21pemF0aW9uc1Rvb2xiYXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnNlc3Npb25zQ3VzdG9taXphdGlvbnNUb29sYmFyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIGhhcm5lc3NTZXJ2aWNlOiBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFBlci1zZWN0aW9uIHZpc2liaWxpdHkgY29udGV4dCBrZXlzLCBrZXB0IGluIHN5bmMgd2l0aCB0aGUgYWN0aXZlXG5cdFx0Ly8gaGFybmVzcydzIGBoaWRkZW5TZWN0aW9uc2AuIEVhY2ggY3VzdG9taXphdGlvbiBhY3Rpb24ncyBtZW51IGVudHJ5XG5cdFx0Ly8gaXMgZ2F0ZWQgb24gaXRzIGtleSBzbyB0aGF0IGhhcm5lc3NlcyAoZS5nLiBDbGF1ZGUsIEFIUCkgd2hpY2hcblx0XHQvLyBkb24ndCBzdXBwb3J0IGEgY3VzdG9taXphdGlvbiB0eXBlIGRvbid0IHN1cmZhY2UgaXRzIHJvdy5cblx0XHRjb25zdCB2aXNpYmlsaXR5S2V5cyA9IG5ldyBNYXA8c3RyaW5nLCBJQ29udGV4dEtleTxib29sZWFuPj4oKTtcblx0XHRmb3IgKGNvbnN0IGNvbmZpZyBvZiBDVVNUT01JWkFUSU9OX0lURU1TKSB7XG5cdFx0XHRpZiAoIWNvbmZpZy5zZWN0aW9uKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qga2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oY3VzdG9taXphdGlvblNlY3Rpb25WaXNpYmxlS2V5KGNvbmZpZy5zZWN0aW9uKSwgdHJ1ZSkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdHZpc2liaWxpdHlLZXlzLnNldChjb25maWcuc2VjdGlvbiwga2V5KTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlSGFybmVzcyA9IGhhcm5lc3NTZXJ2aWNlLmFjdGl2ZUhhcm5lc3MucmVhZChyZWFkZXIpO1xuXHRcdFx0aGFybmVzc1NlcnZpY2UuYXZhaWxhYmxlSGFybmVzc2VzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGRlc2NyaXB0b3IgPSBoYXJuZXNzU2VydmljZS5nZXRBY3RpdmVEZXNjcmlwdG9yKCk7XG5cdFx0XHRjb25zdCBoaWRkZW4gPSBuZXcgU2V0KGRlc2NyaXB0b3IuaGlkZGVuU2VjdGlvbnMgPz8gW10pO1xuXHRcdFx0Zm9yIChjb25zdCBjb25maWcgb2YgQ1VTVE9NSVpBVElPTl9JVEVNUykge1xuXHRcdFx0XHRpZiAoIWNvbmZpZy5zZWN0aW9uKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc3VwcG9ydGVkID0gY29uZmlnLnNlY3Rpb24gIT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhhcm5lc3NTZXR0aW5ncyB8fCBhY3RpdmVIYXJuZXNzID09PSBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb2RleDtcblx0XHRcdFx0dmlzaWJpbGl0eUtleXMuZ2V0KGNvbmZpZy5zZWN0aW9uKSEuc2V0KCFoaWRkZW4uaGFzKGNvbmZpZy5zZWN0aW9uKSAmJiBzdXBwb3J0ZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihNZW51cy5TaWRlYmFyQ3VzdG9taXphdGlvbnMsIENVU1RPTUlaQVRJT05fT1ZFUlZJRVdfSVRFTS5pZCwgKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEN1c3RvbWl6YXRpb25MaW5rVmlld0l0ZW0sIGFjdGlvbiwgb3B0aW9ucywgQ1VTVE9NSVpBVElPTl9PVkVSVklFV19JVEVNKTtcblx0XHR9LCB1bmRlZmluZWQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogQ1VTVE9NSVpBVElPTl9PVkVSVklFV19JVEVNLmlkLFxuXHRcdFx0XHRcdHRpdGxlOiBDVVNUT01JWkFUSU9OX09WRVJWSUVXX0lURU0ubGFiZWwsXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVzLlNpZGViYXJDdXN0b21pemF0aW9ucyxcblx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0YXdhaXQgb3BlbkN1c3RvbWl6YXRpb25PdmVydmlld1BhZ2UoXG5cdFx0XHRcdFx0YWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSxcblx0XHRcdFx0XHRhY2Nlc3Nvci5nZXQoSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSksXG5cdFx0XHRcdFx0YWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGZvciAoY29uc3QgW2luZGV4LCBjb25maWddIG9mIENVU1RPTUlaQVRJT05fSVRFTVMuZW50cmllcygpKSB7XG5cdFx0XHRpZiAoIWNvbmZpZy5zZWN0aW9uKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VjdGlvbiA9IGNvbmZpZy5zZWN0aW9uO1xuXHRcdFx0Ly8gUmVnaXN0ZXIgdGhlIGN1c3RvbSBBY3Rpb25WaWV3SXRlbSBmb3IgdGhpcyBhY3Rpb25cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihNZW51cy5TaWRlYmFyQ3VzdG9taXphdGlvbnMsIGNvbmZpZy5pZCwgKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ3VzdG9taXphdGlvbkxpbmtWaWV3SXRlbSwgYWN0aW9uLCBvcHRpb25zLCBjb25maWcpO1xuXHRcdFx0fSwgdW5kZWZpbmVkKSk7XG5cblx0XHRcdGNvbnN0IHNlY3Rpb25WaXNpYmxlV2hlbiA9IENvbnRleHRLZXlFeHByLmhhcyhjdXN0b21pemF0aW9uU2VjdGlvblZpc2libGVLZXkoc2VjdGlvbikpO1xuXHRcdFx0Y29uc3QgY29tYmluZWRXaGVuID0gY29uZmlnLndoZW5cblx0XHRcdFx0PyBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsIHNlY3Rpb25WaXNpYmxlV2hlbiwgY29uZmlnLndoZW4pXG5cdFx0XHRcdDogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBzZWN0aW9uVmlzaWJsZVdoZW4pO1xuXG5cdFx0XHQvLyBSZWdpc3RlciB0aGUgYWN0aW9uIHdpdGggbWVudSBpdGVtXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IGNvbmZpZy5pZCxcblx0XHRcdFx0XHRcdHRpdGxlOiBjb25maWcubGFiZWwsXG5cdFx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51cy5TaWRlYmFyQ3VzdG9taXphdGlvbnMsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiBpbmRleCArIDEsXG5cdFx0XHRcdFx0XHRcdHdoZW46IGNvbWJpbmVkV2hlbixcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCBoYXJuZXNzU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSk7XG5cdFx0XHRcdFx0YXdhaXQgb3BlbkN1c3RvbWl6YXRpb25TZWN0aW9uUGFnZShlZGl0b3JTZXJ2aWNlLCBoYXJuZXNzU2VydmljZSwgc2Vzc2lvbnNTZXJ2aWNlLCBzZWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ3VzdG9taXphdGlvbnNUb29sYmFyQ29udHJpYnV0aW9uLklELCBDdXN0b21pemF0aW9uc1Rvb2xiYXJDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xuXG4vKipcbiAqIFJldHVybnMgdGhlIGhhcm5lc3MgaWQgdGhhdCBtYXRjaGVzIGEgZ2l2ZW4gc2Vzc2lvbiwgb3IgYHVuZGVmaW5lZGAgaWYgbm9cbiAqIGhhcm5lc3MgaXMgcmVnaXN0ZXJlZCBmb3IgaXQuXG4gKlxuICogVGhlIHNlc3Npb24ncyBgcmVzb3VyY2Uuc2NoZW1lYCBpcyB0aGUgcGVyLWhvc3QgaGFybmVzcyBpZCAoZS5nLiBsb2NhbCBBSFBcbiAqIHVzZXMgYGFnZW50LWhvc3QtJHtwcm92aWRlcn1gIGFuZCByZW1vdGUgQUhQIHVzZXMgYHJlbW90ZS0ke2F1dGhvcml0eX0tJHtwcm92aWRlcn1gKSxcbiAqIHdoaWxlIHtAbGluayBJU2Vzc2lvbi5zZXNzaW9uVHlwZX0gaXMgdGhlIGFnZW50IHByb3ZpZGVyIG5hbWUgc2hhcmVkIGFjcm9zc1xuICogaG9zdHMgKGUuZy4gYGNvcGlsb3RjbGlgKS4gTG9va3VwIHRoZXJlZm9yZSBwcmVmZXJzIHRoZSByZXNvdXJjZSBzY2hlbWUgc29cbiAqIHRoYXQgYW4gQUhQIHJlbW90ZSBzZXNzaW9uIHNlbGVjdHMgaXRzIHJlbW90ZSBoYXJuZXNzIHJhdGhlciB0aGFuIHRoZSBsb2NhbFxuICogaGFybmVzcyB3aXRoIHRoZSBzYW1lIGBzZXNzaW9uVHlwZWAuIFRoZSBgc2Vzc2lvblR5cGVgIGlzIGtlcHQgYXMgYSBmYWxsYmFja1xuICogZm9yIGhhcm5lc3NlcyB3aG9zZSBpZCBtYXRjaGVzIGl0IGRpcmVjdGx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZmluZEhhcm5lc3NJZEZvclNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQsIGhhcm5lc3NTZXJ2aWNlOiBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBzY2hlbWVJZCA9IHNlc3Npb24ucmVzb3VyY2Uuc2NoZW1lO1xuXHRpZiAoaGFybmVzc1NlcnZpY2UuZmluZEhhcm5lc3NCeUlkKHNjaGVtZUlkKSkge1xuXHRcdHJldHVybiBzY2hlbWVJZDtcblx0fVxuXHRpZiAoaGFybmVzc1NlcnZpY2UuZmluZEhhcm5lc3NCeUlkKHNlc3Npb24uc2Vzc2lvblR5cGUpKSB7XG5cdFx0cmV0dXJuIHNlc3Npb24uc2Vzc2lvblR5cGU7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBLZWVwcyB0aGUgYWN0aXZlIGN1c3RvbWl6YXRpb24gaGFybmVzcyBpbiBzeW5jIHdpdGggdGhlIGN1cnJlbnRseSBhY3RpdmVcbiAqIHNlc3Npb24uIFRoaXMgZHJpdmVzIHRoZSBjdXN0b21pemF0aW9ucyBzaWRlYmFyIChjb3VudHMsIGZpbHRlcmluZykgYW5kIHRoZVxuICogY3VzdG9taXphdGlvbnMgZWRpdG9yIHNvIHRoZXkgcmVmbGVjdCB0aGUgaGFybmVzcyB0aGF0IG1hdGNoZXMgdGhlIHNlc3Npb25cbiAqIHRoZSB1c2VyIGlzIGludGVyYWN0aW5nIHdpdGguXG4gKlxuICogVGhpcyBjb3ZlcnMgdHdvIGNhc2VzIGlkZW50aWNhbGx5OlxuICogIC0gb3BlbmluZyAvIG5hdmlnYXRpbmcgaW50byBhbiBleGlzdGluZyBzZXNzaW9uXG4gKiAgLSBzZWxlY3RpbmcgXCJOZXcgc2Vzc2lvbiBpbiB7d29ya3NwYWNlfVwiICh3aGljaCBzZXRzIGEgcGVuZGluZyBhY3RpdmVcbiAqICAgIHNlc3Npb24gYmVmb3JlIHRoZSB1c2VyIGhhcyBzZW50IHRoZSBmaXJzdCByZXF1ZXN0KVxuICovXG5leHBvcnQgY2xhc3MgQWN0aXZlU2Vzc2lvbkhhcm5lc3NTeW5jQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5zZXNzaW9uc0FjdGl2ZUhhcm5lc3NTeW5jJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVNlc3Npb25zU2VydmljZSBzZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgaGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIFJlLXJlYWQgYXZhaWxhYmxlIGhhcm5lc3NlcyBzbyB3ZSByZS1ydW4gd2hlbiBhbiBleHRlcm5hbCBoYXJuZXNzXG5cdFx0XHQvLyAoZS5nLiBhZ2VudCBob3N0LCBDTEkpIHJlZ2lzdGVycyBhc3luY2hyb25vdXNseSBhZnRlciB0aGUgc2Vzc2lvblxuXHRcdFx0Ly8gaGFzIGFscmVhZHkgYmVlbiBzZWxlY3RlZC5cblx0XHRcdGhhcm5lc3NTZXJ2aWNlLmF2YWlsYWJsZUhhcm5lc3Nlcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRoYXJuZXNzU2VydmljZS5zZXRBY3RpdmVTZXNzaW9uKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdH0pKTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQWN0aXZlU2Vzc2lvbkhhcm5lc3NTeW5jQ29udHJpYnV0aW9uLklELCBBY3RpdmVTZXNzaW9uSGFybmVzc1N5bmNDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFm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
