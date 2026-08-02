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
import "./media/aiCustomizationManagement.css";
import * as DOM from "../../../../base/browser/dom.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { autorun } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ViewPane } from "../../../../workbench/browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../../workbench/common/views.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { ResourceSet } from "../../../../base/common/map.js";
import { IPromptsService } from "../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js";
import { PromptsType } from "../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js";
import { AICustomizationManagementSection, AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js";
import { AICustomizationManagementEditorInput } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js";
import { agentIcon, automationIcon, instructionsIcon, mcpServerIcon, pluginIcon, skillIcon, toolsIcon } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IAICustomizationWorkspaceService } from "../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { IMcpService } from "../../../../workbench/contrib/mcp/common/mcpTypes.js";
import { IAgentPluginService } from "../../../../workbench/contrib/chat/common/plugins/agentPluginService.js";
import { ILanguageModelToolsService } from "../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js";
import { AGENT_HOST_COPILOT_CLI_SESSION_TYPE, countEnabledCustomizationTools, IAgentHostToolSetEnablementService } from "../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js";
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from "../../../../workbench/contrib/chat/common/automations/automationsEnabled.js";
import { IAutomationService } from "../../../../workbench/contrib/chat/common/automations/automationService.js";
const $ = DOM.$;
const AI_CUSTOMIZATION_OVERVIEW_VIEW_ID = "workbench.view.aiCustomizationOverview";
function isWelcomePageEditor(editor) {
  return typeof editor?.showWelcomePage === "function";
}
let AICustomizationOverviewView = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, editorService, promptsService, workspaceContextService, workspaceService, mcpService, agentPluginService, languageModelToolsService, toolEnablementService, automationService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.editorService = editorService;
    this.promptsService = promptsService;
    this.workspaceContextService = workspaceContextService;
    this.workspaceService = workspaceService;
    this.mcpService = mcpService;
    this.agentPluginService = agentPluginService;
    this.languageModelToolsService = languageModelToolsService;
    this.toolEnablementService = toolEnablementService;
    this.automationService = automationService;
    this.sections = [];
    this.countElements = /* @__PURE__ */ new Map();
    this.sectionElements = /* @__PURE__ */ new Map();
    this.sections.push(
      { id: AICustomizationManagementSection.Agents, label: localize("agents", "Agents"), icon: agentIcon, count: 0 },
      { id: AICustomizationManagementSection.Skills, label: localize("skills", "Skills"), icon: skillIcon, count: 0 },
      { id: AICustomizationManagementSection.Instructions, label: localize("instructions", "Instructions"), icon: instructionsIcon, count: 0 }
    );
    if (this._isAutomationsEnabled()) {
      this.sections.push({ id: AICustomizationManagementSection.Automations, label: localize("automations", "Automations"), icon: automationIcon, count: 0 });
    }
    this.sections.push(
      { id: AICustomizationManagementSection.McpServers, label: localize("mcpServers", "MCP Servers"), icon: mcpServerIcon, count: 0 },
      { id: AICustomizationManagementSection.Plugins, label: localize("plugins", "Plugins"), icon: pluginIcon, count: 0 },
      { id: AICustomizationManagementSection.Tools, label: localize("tools", "Tools"), icon: toolsIcon, count: 0 }
    );
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING)) {
        return;
      }
      const present = this.sections.some((s) => s.id === AICustomizationManagementSection.Automations);
      const desired = this._isAutomationsEnabled();
      if (present === desired) {
        return;
      }
      if (desired) {
        const mcpIdx = this.sections.findIndex((s) => s.id === AICustomizationManagementSection.McpServers);
        const insertAt = mcpIdx === -1 ? this.sections.length : mcpIdx;
        this.sections.splice(insertAt, 0, { id: AICustomizationManagementSection.Automations, label: localize("automations", "Automations"), icon: automationIcon, count: 0 });
      } else {
        const idx = this.sections.findIndex((s) => s.id === AICustomizationManagementSection.Automations);
        if (idx !== -1) {
          this.sections.splice(idx, 1);
        }
      }
      if (this.sectionsContainer) {
        this.renderSections();
        void this.loadCounts();
      }
    }));
    this._register(this.promptsService.onDidChangeCustomAgents(() => this.loadCounts()));
    this._register(this.promptsService.onDidChangeSlashCommands(() => this.loadCounts()));
    this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.loadCounts()));
    this._register(autorun((reader) => {
      this.workspaceService.activeProjectRoot.read(reader);
      this.loadCounts();
    }));
  }
  renderBody(container) {
    super.renderBody(container);
    this.bodyElement = container;
    this.container = DOM.append(container, $(".ai-customization-overview"));
    this.sectionsContainer = DOM.append(this.container, $(".overview-sections"));
    this.renderSections();
    void this.loadCounts();
    this.layoutBody(this.bodyElement.offsetHeight, this.bodyElement.offsetWidth);
  }
  renderSections() {
    DOM.clearNode(this.sectionsContainer);
    this.countElements.clear();
    this.sectionElements.clear();
    for (const section of this.sections) {
      const sectionElement = DOM.append(this.sectionsContainer, $(".overview-section"));
      sectionElement.tabIndex = 0;
      sectionElement.setAttribute("role", "button");
      sectionElement.setAttribute("aria-label", this.getSectionAriaLabel(section));
      this.sectionElements.set(section.id, sectionElement);
      const iconElement = DOM.append(sectionElement, $(".section-icon"));
      iconElement.classList.add(...ThemeIcon.asClassNameArray(section.icon));
      const textContainer = DOM.append(sectionElement, $(".section-text"));
      const labelElement = DOM.append(textContainer, $(".section-label"));
      labelElement.textContent = section.label;
      const countElement = DOM.append(sectionElement, $(".section-count"));
      countElement.textContent = `${section.count}`;
      this.countElements.set(section.id, countElement);
      this._register(DOM.addDisposableListener(sectionElement, "click", () => {
        this.openOverview();
      }));
      this._register(DOM.addDisposableListener(sectionElement, "keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.openOverview();
        }
      }));
      this._register(this.hoverService.setupDelayedHoverAtMouse(sectionElement, () => ({
        content: localize("openOverview", "Open Chat Customizations editor"),
        appearance: { compact: true, skipFadeInAnimation: true }
      })));
    }
  }
  async loadCounts() {
    const sectionPromptTypes = [
      { section: AICustomizationManagementSection.Agents, type: PromptsType.agent },
      { section: AICustomizationManagementSection.Skills, type: PromptsType.skill },
      { section: AICustomizationManagementSection.Instructions, type: PromptsType.instructions }
    ];
    await Promise.all(sectionPromptTypes.map(async ({ section, type }) => {
      let count = 0;
      if (type === PromptsType.skill) {
        const skills = await this.promptsService.findAgentSkills(CancellationToken.None);
        if (skills) {
          count = skills.length;
        }
      } else {
        const allItems = await this.promptsService.listPromptFiles(type, CancellationToken.None);
        count = allItems.length;
        if (type === PromptsType.instructions) {
          const existingUris = new ResourceSet(allItems.map((item) => item.uri));
          const agentInstructions = await this.promptsService.listAgentInstructions(CancellationToken.None);
          for (const file of agentInstructions) {
            if (!existingUris.has(file.uri)) {
              count++;
            }
          }
        }
      }
      const sectionData = this.sections.find((s) => s.id === section);
      if (sectionData) {
        sectionData.count = count;
      }
    }));
    const mcpSection = this.sections.find((s) => s.id === AICustomizationManagementSection.McpServers);
    if (mcpSection) {
      this._register(autorun((reader) => {
        const servers = this.mcpService.servers.read(reader);
        mcpSection.count = servers.length;
        this.updateCountElements();
      }));
    }
    const pluginSection = this.sections.find((s) => s.id === AICustomizationManagementSection.Plugins);
    if (pluginSection) {
      this._register(autorun((reader) => {
        const plugins = this.agentPluginService.plugins.read(reader);
        pluginSection.count = plugins.length;
        this.updateCountElements();
      }));
    }
    const toolsSection = this.sections.find((s) => s.id === AICustomizationManagementSection.Tools);
    if (toolsSection) {
      this._register(autorun((reader) => {
        const state = this.toolEnablementService.observe(AGENT_HOST_COPILOT_CLI_SESSION_TYPE).read(reader);
        const toolSets = this.languageModelToolsService.toolSets.read(reader);
        toolsSection.count = countEnabledCustomizationTools(toolSets, state, reader);
        this.updateCountElements();
      }));
    }
    this._register(autorun((reader) => {
      const automations = this.automationService.automations.read(reader);
      const automationSection = this.sections.find((s) => s.id === AICustomizationManagementSection.Automations);
      if (automationSection) {
        automationSection.count = automations.length;
        this.updateCountElements();
      }
    }));
    this.updateCountElements();
  }
  _isAutomationsEnabled() {
    return this.configurationService.getValue(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
  }
  getSectionAriaLabel(section) {
    return localize("overviewSectionAriaLabelWithCount", "{0}, {1} items", section.label, section.count);
  }
  updateCountElements() {
    for (const section of this.sections) {
      const countElement = this.countElements.get(section.id);
      if (countElement) {
        countElement.textContent = `${section.count}`;
      }
      const sectionElement = this.sectionElements.get(section.id);
      if (sectionElement) {
        sectionElement.setAttribute("aria-label", this.getSectionAriaLabel(section));
      }
    }
  }
  async openOverview() {
    const input = AICustomizationManagementEditorInput.getOrCreate();
    const editor = await this.editorService.openEditor(input, { pinned: true });
    if (editor?.getId() === AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID && isWelcomePageEditor(editor)) {
      editor.showWelcomePage();
    }
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.container.style.height = `${height}px`;
  }
};
AICustomizationOverviewView = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IEditorService),
  __decorateParam(11, IPromptsService),
  __decorateParam(12, IWorkspaceContextService),
  __decorateParam(13, IAICustomizationWorkspaceService),
  __decorateParam(14, IMcpService),
  __decorateParam(15, IAgentPluginService),
  __decorateParam(16, ILanguageModelToolsService),
  __decorateParam(17, IAgentHostToolSetEnablementService),
  __decorateParam(18, IAutomationService)
], AICustomizationOverviewView);
export {
  AICustomizationOverviewView,
  AI_CUSTOMIZATION_OVERVIEW_VIEW_ID
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYWlDdXN0b21pemF0aW9uVHJlZVZpZXcvYnJvd3Nlci9haUN1c3RvbWl6YXRpb25PdmVydmlld1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC5jc3MnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVZpZXdQYW5lT3B0aW9ucywgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLCBBSV9DVVNUT01JWkFUSU9OX01BTkFHRU1FTlRfRURJVE9SX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IGFnZW50SWNvbiwgYXV0b21hdGlvbkljb24sIGluc3RydWN0aW9uc0ljb24sIG1jcFNlcnZlckljb24sIHBsdWdpbkljb24sIHNraWxsSWNvbiwgdG9vbHNJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25JY29ucy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfQ09QSUxPVF9DTElfU0VTU0lPTl9UWVBFLCBjb3VudEVuYWJsZWRDdXN0b21pemF0aW9uVG9vbHMsIElBZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0VG9vbFNldEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENIQVRfQVVUT01BVElPTlNfRU5BQkxFRF9TRVRUSU5HIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbnNFbmFibGVkLmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25TZXJ2aWNlLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5leHBvcnQgY29uc3QgQUlfQ1VTVE9NSVpBVElPTl9PVkVSVklFV19WSUVXX0lEID0gJ3dvcmtiZW5jaC52aWV3LmFpQ3VzdG9taXphdGlvbk92ZXJ2aWV3JztcblxuZnVuY3Rpb24gaXNXZWxjb21lUGFnZUVkaXRvcihlZGl0b3I6IHVua25vd24pOiBlZGl0b3IgaXMgeyBzaG93V2VsY29tZVBhZ2UoKTogdm9pZCB9IHtcblx0cmV0dXJuIHR5cGVvZiAoZWRpdG9yIGFzIHsgc2hvd1dlbGNvbWVQYWdlPzogdW5rbm93biB9KT8uc2hvd1dlbGNvbWVQYWdlID09PSAnZnVuY3Rpb24nO1xufVxuXG5pbnRlcmZhY2UgSVNlY3Rpb25TdW1tYXJ5IHtcblx0cmVhZG9ubHkgaWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb247XG5cdGNvdW50OiBudW1iZXI7XG59XG5cbi8qKlxuICogQSBjb21wYWN0IG92ZXJ2aWV3IHZpZXcgdGhhdCBzaG93cyBhIHNuYXBzaG90IG9mIEFJIGN1c3RvbWl6YXRpb25zXG4gKiBhbmQgcHJvdmlkZXMgZGVlcC1saW5rcyB0byB0aGUgbWFuYWdlbWVudCBlZGl0b3Igc2VjdGlvbnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBBSUN1c3RvbWl6YXRpb25PdmVydmlld1ZpZXcgZXh0ZW5kcyBWaWV3UGFuZSB7XG5cblx0cHJpdmF0ZSBib2R5RWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlY3Rpb25zQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2VjdGlvbnM6IElTZWN0aW9uU3VtbWFyeVtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgY291bnRFbGVtZW50cyA9IG5ldyBNYXA8QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24sIEhUTUxFbGVtZW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlY3Rpb25FbGVtZW50cyA9IG5ldyBNYXA8QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24sIEhUTUxFbGVtZW50PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3UGFuZU9wdGlvbnMsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElQcm9tcHRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb21wdHNTZXJ2aWNlOiBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElBZ2VudFBsdWdpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFBsdWdpblNlcnZpY2U6IElBZ2VudFBsdWdpblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0b29sRW5hYmxlbWVudFNlcnZpY2U6IElBZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElBdXRvbWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25TZXJ2aWNlOiBJQXV0b21hdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSBzZWN0aW9uc1xuXHRcdHRoaXMuc2VjdGlvbnMucHVzaChcblx0XHRcdHsgaWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cywgbGFiZWw6IGxvY2FsaXplKCdhZ2VudHMnLCBcIkFnZW50c1wiKSwgaWNvbjogYWdlbnRJY29uLCBjb3VudDogMCB9LFxuXHRcdFx0eyBpZDogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzLCBsYWJlbDogbG9jYWxpemUoJ3NraWxscycsIFwiU2tpbGxzXCIpLCBpY29uOiBza2lsbEljb24sIGNvdW50OiAwIH0sXG5cdFx0XHR7IGlkOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMsIGxhYmVsOiBsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25zJywgXCJJbnN0cnVjdGlvbnNcIiksIGljb246IGluc3RydWN0aW9uc0ljb24sIGNvdW50OiAwIH0sXG5cdFx0KTtcblx0XHQvLyBPbmx5IHNob3cgdGhlIHRpbGUgd2hlbiB0aGUgc2V0dGluZyBpcyBvbiAobWlycm9ycyB0aGUgbWFuYWdlbWVudCBlZGl0b3IgZ2F0ZSkuXG5cdFx0aWYgKHRoaXMuX2lzQXV0b21hdGlvbnNFbmFibGVkKCkpIHtcblx0XHRcdHRoaXMuc2VjdGlvbnMucHVzaCh7IGlkOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BdXRvbWF0aW9ucywgbGFiZWw6IGxvY2FsaXplKCdhdXRvbWF0aW9ucycsIFwiQXV0b21hdGlvbnNcIiksIGljb246IGF1dG9tYXRpb25JY29uLCBjb3VudDogMCB9KTtcblx0XHR9XG5cdFx0dGhpcy5zZWN0aW9ucy5wdXNoKFxuXHRcdFx0eyBpZDogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uTWNwU2VydmVycywgbGFiZWw6IGxvY2FsaXplKCdtY3BTZXJ2ZXJzJywgXCJNQ1AgU2VydmVyc1wiKSwgaWNvbjogbWNwU2VydmVySWNvbiwgY291bnQ6IDAgfSxcblx0XHRcdHsgaWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMsIGxhYmVsOiBsb2NhbGl6ZSgncGx1Z2lucycsIFwiUGx1Z2luc1wiKSwgaWNvbjogcGx1Z2luSWNvbiwgY291bnQ6IDAgfSxcblx0XHRcdHsgaWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlRvb2xzLCBsYWJlbDogbG9jYWxpemUoJ3Rvb2xzJywgXCJUb29sc1wiKSwgaWNvbjogdG9vbHNJY29uLCBjb3VudDogMCB9LFxuXHRcdCk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiB0aGUgdXNlciB0b2dnbGVzIGBjaGF0LmF1dG9tYXRpb25zLmVuYWJsZWRgLFxuXHRcdC8vIHNvIHRoZSB0aWxlIGFwcGVhcnMvZGlzYXBwZWFycyBsaXZlIHdpdGhvdXQgYSByZWxvYWQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoIWUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ0hBVF9BVVRPTUFUSU9OU19FTkFCTEVEX1NFVFRJTkcpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHByZXNlbnQgPSB0aGlzLnNlY3Rpb25zLnNvbWUocyA9PiBzLmlkID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BdXRvbWF0aW9ucyk7XG5cdFx0XHRjb25zdCBkZXNpcmVkID0gdGhpcy5faXNBdXRvbWF0aW9uc0VuYWJsZWQoKTtcblx0XHRcdGlmIChwcmVzZW50ID09PSBkZXNpcmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChkZXNpcmVkKSB7XG5cdFx0XHRcdC8vIEluc2VydCBiZWZvcmUgTWNwU2VydmVycyB0byBwcmVzZXJ2ZSB0aGUgb3JpZ2luYWwgb3JkZXIuXG5cdFx0XHRcdGNvbnN0IG1jcElkeCA9IHRoaXMuc2VjdGlvbnMuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uTWNwU2VydmVycyk7XG5cdFx0XHRcdGNvbnN0IGluc2VydEF0ID0gbWNwSWR4ID09PSAtMSA/IHRoaXMuc2VjdGlvbnMubGVuZ3RoIDogbWNwSWR4O1xuXHRcdFx0XHR0aGlzLnNlY3Rpb25zLnNwbGljZShpbnNlcnRBdCwgMCwgeyBpZDogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQXV0b21hdGlvbnMsIGxhYmVsOiBsb2NhbGl6ZSgnYXV0b21hdGlvbnMnLCBcIkF1dG9tYXRpb25zXCIpLCBpY29uOiBhdXRvbWF0aW9uSWNvbiwgY291bnQ6IDAgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBpZHggPSB0aGlzLnNlY3Rpb25zLmZpbmRJbmRleChzID0+IHMuaWQgPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkF1dG9tYXRpb25zKTtcblx0XHRcdFx0aWYgKGlkeCAhPT0gLTEpIHtcblx0XHRcdFx0XHR0aGlzLnNlY3Rpb25zLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5zZWN0aW9uc0NvbnRhaW5lcikge1xuXHRcdFx0XHR0aGlzLnJlbmRlclNlY3Rpb25zKCk7XG5cdFx0XHRcdHZvaWQgdGhpcy5sb2FkQ291bnRzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTGlzdGVuIHRvIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnByb21wdHNTZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzKCgpID0+IHRoaXMubG9hZENvdW50cygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wcm9tcHRzU2VydmljZS5vbkRpZENoYW5nZVNsYXNoQ29tbWFuZHMoKCkgPT4gdGhpcy5sb2FkQ291bnRzKCkpKTtcblxuXHRcdC8vIExpc3RlbiB0byB3b3Jrc3BhY2UgZm9sZGVyIGNoYW5nZXMgdG8gdXBkYXRlIGNvdW50c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCgpID0+IHRoaXMubG9hZENvdW50cygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmFjdGl2ZVByb2plY3RSb290LnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMubG9hZENvdW50cygpO1xuXHRcdH0pKTtcblxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuYm9keUVsZW1lbnQgPSBjb250YWluZXI7XG5cdFx0dGhpcy5jb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmFpLWN1c3RvbWl6YXRpb24tb3ZlcnZpZXcnKSk7XG5cdFx0dGhpcy5zZWN0aW9uc0NvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5jb250YWluZXIsICQoJy5vdmVydmlldy1zZWN0aW9ucycpKTtcblxuXHRcdHRoaXMucmVuZGVyU2VjdGlvbnMoKTtcblx0XHR2b2lkIHRoaXMubG9hZENvdW50cygpO1xuXG5cdFx0Ly8gRm9yY2UgaW5pdGlhbCBsYXlvdXRcblx0XHR0aGlzLmxheW91dEJvZHkodGhpcy5ib2R5RWxlbWVudC5vZmZzZXRIZWlnaHQsIHRoaXMuYm9keUVsZW1lbnQub2Zmc2V0V2lkdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTZWN0aW9ucygpOiB2b2lkIHtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuc2VjdGlvbnNDb250YWluZXIpO1xuXHRcdHRoaXMuY291bnRFbGVtZW50cy5jbGVhcigpO1xuXHRcdHRoaXMuc2VjdGlvbkVsZW1lbnRzLmNsZWFyKCk7XG5cblx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2YgdGhpcy5zZWN0aW9ucykge1xuXHRcdFx0Y29uc3Qgc2VjdGlvbkVsZW1lbnQgPSBET00uYXBwZW5kKHRoaXMuc2VjdGlvbnNDb250YWluZXIsICQoJy5vdmVydmlldy1zZWN0aW9uJykpO1xuXHRcdFx0c2VjdGlvbkVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdFx0c2VjdGlvbkVsZW1lbnQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0c2VjdGlvbkVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhpcy5nZXRTZWN0aW9uQXJpYUxhYmVsKHNlY3Rpb24pKTtcblx0XHRcdHRoaXMuc2VjdGlvbkVsZW1lbnRzLnNldChzZWN0aW9uLmlkLCBzZWN0aW9uRWxlbWVudCk7XG5cblx0XHRcdGNvbnN0IGljb25FbGVtZW50ID0gRE9NLmFwcGVuZChzZWN0aW9uRWxlbWVudCwgJCgnLnNlY3Rpb24taWNvbicpKTtcblx0XHRcdGljb25FbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoc2VjdGlvbi5pY29uKSk7XG5cblx0XHRcdGNvbnN0IHRleHRDb250YWluZXIgPSBET00uYXBwZW5kKHNlY3Rpb25FbGVtZW50LCAkKCcuc2VjdGlvbi10ZXh0JykpO1xuXHRcdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gRE9NLmFwcGVuZCh0ZXh0Q29udGFpbmVyLCAkKCcuc2VjdGlvbi1sYWJlbCcpKTtcblx0XHRcdGxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9IHNlY3Rpb24ubGFiZWw7XG5cblx0XHRcdGNvbnN0IGNvdW50RWxlbWVudCA9IERPTS5hcHBlbmQoc2VjdGlvbkVsZW1lbnQsICQoJy5zZWN0aW9uLWNvdW50JykpO1xuXHRcdFx0Y291bnRFbGVtZW50LnRleHRDb250ZW50ID0gYCR7c2VjdGlvbi5jb3VudH1gO1xuXHRcdFx0dGhpcy5jb3VudEVsZW1lbnRzLnNldChzZWN0aW9uLmlkLCBjb3VudEVsZW1lbnQpO1xuXG5cdFx0XHQvLyBDbGljayBoYW5kbGVyIHRvIG9wZW4gdGhlIG1hbmFnZW1lbnQgZWRpdG9yIG92ZXJ2aWV3XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNlY3Rpb25FbGVtZW50LCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMub3Blbk92ZXJ2aWV3KCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIEtleWJvYXJkIHN1cHBvcnRcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoc2VjdGlvbkVsZW1lbnQsICdrZXlkb3duJywgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0dGhpcy5vcGVuT3ZlcnZpZXcoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBIb3ZlciB0b29sdGlwXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlckF0TW91c2Uoc2VjdGlvbkVsZW1lbnQsICgpID0+ICh7XG5cdFx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplKCdvcGVuT3ZlcnZpZXcnLCBcIk9wZW4gQ2hhdCBDdXN0b21pemF0aW9ucyBlZGl0b3JcIiksXG5cdFx0XHRcdGFwcGVhcmFuY2U6IHsgY29tcGFjdDogdHJ1ZSwgc2tpcEZhZGVJbkFuaW1hdGlvbjogdHJ1ZSB9XG5cdFx0XHR9KSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZENvdW50cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZWN0aW9uUHJvbXB0VHlwZXM6IEFycmF5PHsgc2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb247IHR5cGU6IFByb21wdHNUeXBlIH0+ID0gW1xuXHRcdFx0eyBzZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMsIHR5cGU6IFByb21wdHNUeXBlLmFnZW50IH0sXG5cdFx0XHR7IHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscywgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwgfSxcblx0XHRcdHsgc2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSW5zdHJ1Y3Rpb25zLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfSxcblx0XHRdO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoc2VjdGlvblByb21wdFR5cGVzLm1hcChhc3luYyAoeyBzZWN0aW9uLCB0eXBlIH0pID0+IHtcblx0XHRcdGxldCBjb3VudCA9IDA7XG5cdFx0XHRpZiAodHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpIHtcblx0XHRcdFx0Y29uc3Qgc2tpbGxzID0gYXdhaXQgdGhpcy5wcm9tcHRzU2VydmljZS5maW5kQWdlbnRTa2lsbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGlmIChza2lsbHMpIHtcblx0XHRcdFx0XHRjb3VudCA9IHNraWxscy5sZW5ndGg7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGFsbEl0ZW1zID0gYXdhaXQgdGhpcy5wcm9tcHRzU2VydmljZS5saXN0UHJvbXB0RmlsZXModHlwZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGNvdW50ID0gYWxsSXRlbXMubGVuZ3RoO1xuXG5cdFx0XHRcdC8vIEZvciBpbnN0cnVjdGlvbnMsIGFsc28gY291bnQgYWdlbnQgaW5zdHJ1Y3Rpb25zIChBR0VOVFMubWQsIGNvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kLCBDTEFVREUubWQsIGV0Yy4pXG5cdFx0XHRcdGlmICh0eXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpIHtcblx0XHRcdFx0XHRjb25zdCBleGlzdGluZ1VyaXMgPSBuZXcgUmVzb3VyY2VTZXQoYWxsSXRlbXMubWFwKGl0ZW0gPT4gaXRlbS51cmkpKTtcblx0XHRcdFx0XHRjb25zdCBhZ2VudEluc3RydWN0aW9ucyA9IGF3YWl0IHRoaXMucHJvbXB0c1NlcnZpY2UubGlzdEFnZW50SW5zdHJ1Y3Rpb25zKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBhZ2VudEluc3RydWN0aW9ucykge1xuXHRcdFx0XHRcdFx0aWYgKCFleGlzdGluZ1VyaXMuaGFzKGZpbGUudXJpKSkge1xuXHRcdFx0XHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZWN0aW9uRGF0YSA9IHRoaXMuc2VjdGlvbnMuZmluZChzID0+IHMuaWQgPT09IHNlY3Rpb24pO1xuXHRcdFx0aWYgKHNlY3Rpb25EYXRhKSB7XG5cdFx0XHRcdHNlY3Rpb25EYXRhLmNvdW50ID0gY291bnQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVXBkYXRlIE1DUCBzZXJ2ZXIgY291bnQgcmVhY3RpdmVseVxuXHRcdGNvbnN0IG1jcFNlY3Rpb24gPSB0aGlzLnNlY3Rpb25zLmZpbmQocyA9PiBzLmlkID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzKTtcblx0XHRpZiAobWNwU2VjdGlvbikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBzZXJ2ZXJzID0gdGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRtY3BTZWN0aW9uLmNvdW50ID0gc2VydmVycy5sZW5ndGg7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ291bnRFbGVtZW50cygpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBwbHVnaW4gY291bnQgcmVhY3RpdmVseVxuXHRcdGNvbnN0IHBsdWdpblNlY3Rpb24gPSB0aGlzLnNlY3Rpb25zLmZpbmQocyA9PiBzLmlkID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zKTtcblx0XHRpZiAocGx1Z2luU2VjdGlvbikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBwbHVnaW5zID0gdGhpcy5hZ2VudFBsdWdpblNlcnZpY2UucGx1Z2lucy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHBsdWdpblNlY3Rpb24uY291bnQgPSBwbHVnaW5zLmxlbmd0aDtcblx0XHRcdFx0dGhpcy51cGRhdGVDb3VudEVsZW1lbnRzKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRvb2xzIGNvdW50IHJlYWN0aXZlbHlcblx0XHRjb25zdCB0b29sc1NlY3Rpb24gPSB0aGlzLnNlY3Rpb25zLmZpbmQocyA9PiBzLmlkID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ub29scyk7XG5cdFx0aWYgKHRvb2xzU2VjdGlvbikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMudG9vbEVuYWJsZW1lbnRTZXJ2aWNlLm9ic2VydmUoQUdFTlRfSE9TVF9DT1BJTE9UX0NMSV9TRVNTSU9OX1RZUEUpLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgdG9vbFNldHMgPSB0aGlzLmxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UudG9vbFNldHMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHR0b29sc1NlY3Rpb24uY291bnQgPSBjb3VudEVuYWJsZWRDdXN0b21pemF0aW9uVG9vbHModG9vbFNldHMsIHN0YXRlLCByZWFkZXIpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvdW50RWxlbWVudHMoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgYXV0b21hdGlvbiBjb3VudCByZWFjdGl2ZWx5IChuby1vcHMgd2hlbiB0aWxlIGlzIGhpZGRlbikuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYXV0b21hdGlvbnMgPSB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLmF1dG9tYXRpb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGF1dG9tYXRpb25TZWN0aW9uID0gdGhpcy5zZWN0aW9ucy5maW5kKHMgPT4gcy5pZCA9PT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQXV0b21hdGlvbnMpO1xuXHRcdFx0aWYgKGF1dG9tYXRpb25TZWN0aW9uKSB7XG5cdFx0XHRcdGF1dG9tYXRpb25TZWN0aW9uLmNvdW50ID0gYXV0b21hdGlvbnMubGVuZ3RoO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvdW50RWxlbWVudHMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZUNvdW50RWxlbWVudHMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzQXV0b21hdGlvbnNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENIQVRfQVVUT01BVElPTlNfRU5BQkxFRF9TRVRUSU5HKSA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2VjdGlvbkFyaWFMYWJlbChzZWN0aW9uOiBJU2VjdGlvblN1bW1hcnkpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnb3ZlcnZpZXdTZWN0aW9uQXJpYUxhYmVsV2l0aENvdW50JywgXCJ7MH0sIHsxfSBpdGVtc1wiLCBzZWN0aW9uLmxhYmVsLCBzZWN0aW9uLmNvdW50KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ291bnRFbGVtZW50cygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2YgdGhpcy5zZWN0aW9ucykge1xuXHRcdFx0Y29uc3QgY291bnRFbGVtZW50ID0gdGhpcy5jb3VudEVsZW1lbnRzLmdldChzZWN0aW9uLmlkKTtcblx0XHRcdGlmIChjb3VudEVsZW1lbnQpIHtcblx0XHRcdFx0Y291bnRFbGVtZW50LnRleHRDb250ZW50ID0gYCR7c2VjdGlvbi5jb3VudH1gO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VjdGlvbkVsZW1lbnQgPSB0aGlzLnNlY3Rpb25FbGVtZW50cy5nZXQoc2VjdGlvbi5pZCk7XG5cdFx0XHRpZiAoc2VjdGlvbkVsZW1lbnQpIHtcblx0XHRcdFx0c2VjdGlvbkVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhpcy5nZXRTZWN0aW9uQXJpYUxhYmVsKHNlY3Rpb24pKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5PdmVydmlldygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbnB1dCA9IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dC5nZXRPckNyZWF0ZSgpO1xuXHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdC8vIEFsd2F5cyByZXNldCB0byB0aGUgd2VsY29tZSBwYWdlIHdoZW4gb3BlbmluZyBmcm9tIHRoZSBzaWRlYmFyLFxuXHRcdC8vIHNvIHdlIGRvbid0IHJlc3RvcmUgdGhlIHByZXZpb3VzbHkgc2VsZWN0ZWQgc2VjdGlvbi5cblx0XHRpZiAoZWRpdG9yPy5nZXRJZCgpID09PSBBSV9DVVNUT01JWkFUSU9OX01BTkFHRU1FTlRfRURJVE9SX0lEICYmIGlzV2VsY29tZVBhZ2VFZGl0b3IoZWRpdG9yKSkge1xuXHRcdFx0ZWRpdG9yLnNob3dXZWxjb21lUGFnZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQTJCLGdCQUFnQjtBQUMzQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUFrQyw2Q0FBNkM7QUFDeEYsU0FBUyw0Q0FBNEM7QUFDckQsU0FBUyxXQUFXLGdCQUFnQixrQkFBa0IsZUFBZSxZQUFZLFdBQVcsaUJBQWlCO0FBQzdHLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMscUNBQXFDLGdDQUFnQywwQ0FBMEM7QUFD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
