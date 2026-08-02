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
import * as DOM from "../../../../../base/browser/dom.js";
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import { RunOnceScheduler, timeout } from "../../../../../base/common/async.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Event } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { ResourceSet } from "../../../../../base/common/map.js";
import { autorun } from "../../../../../base/common/observable.js";
import { Orientation, Sizing, SplitView } from "../../../../../base/browser/ui/splitview/splitview.js";
import { Color } from "../../../../../base/common/color.js";
import { localize } from "../../../../../nls.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { EditorPane } from "../../../../browser/parts/editor/editorPane.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { WorkbenchList } from "../../../../../platform/list/browser/listService.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { basename, dirname, isEqual } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { AICustomizationManagementEditorInput } from "./aiCustomizationManagementEditorInput.js";
import { aiCustomizationManagementSectionRegistry } from "./aiCustomizationManagementSectionRegistry.js";
import { AICustomizationListWidget } from "./aiCustomizationListWidget.js";
import { IAICustomizationItemsModel, ITEMS_MODEL_SECTIONS } from "./aiCustomizationItemsModel.js";
import { McpListWidget } from "./mcpListWidget.js";
import { PluginListWidget } from "./pluginListWidget.js";
import { ToolsListWidget } from "./toolsListWidget.js";
import { AGENT_HOST_COPILOT_CLI_SESSION_TYPE } from "../agentSessions/agentHost/agentHostToolSetEnablementService.js";
import { AutomationsListWidget } from "./automationsListWidget.js";
import {
  AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID,
  AI_CUSTOMIZATION_MANAGEMENT_SIDEBAR_WIDTH_KEY,
  AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY,
  AICustomizationManagementSection,
  CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR,
  CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION,
  CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_HARNESS,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  CONTENT_MIN_WIDTH
} from "./aiCustomizationManagement.js";
import { agentIcon, instructionsIcon, promptIcon, skillIcon, hookIcon, pluginIcon, toolsIcon, automationIcon } from "./aiCustomizationIcons.js";
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from "../../common/automations/automationsEnabled.js";
import { ChatModelsWidget } from "../chatManagement/chatModelsWidget.js";
import { PromptsType, Target } from "../../common/promptSyntax/promptTypes.js";
import { IPromptsService, PromptsStorage } from "../../common/promptSyntax/service/promptsService.js";
import { AGENT_MD_FILENAME } from "../../common/promptSyntax/config/promptFileLocations.js";
import { getAttributeDefinition, getTarget } from "../../common/promptSyntax/languageProviders/promptFileAttributes.js";
import { NEW_PROMPT_COMMAND_ID, NEW_INSTRUCTIONS_COMMAND_ID, NEW_AGENT_COMMAND_ID, NEW_SKILL_COMMAND_ID } from "../promptSyntax/newPromptFileActions.js";
import { showConfigureHooksQuickPick } from "../promptSyntax/hookActions.js";
import { resolveWorkspaceTargetDirectory, resolveUserTargetDirectory, CustomizationLocationPicker } from "./customizationCreatorService.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { AICustomizationSources, IAICustomizationWorkspaceService } from "../../common/aiCustomizationWorkspaceService.js";
import { CodeEditorWidget } from "../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { InputBox } from "../../../../../base/browser/ui/inputbox/inputBox.js";
import { Checkbox } from "../../../../../base/browser/ui/toggle/toggle.js";
import { DomScrollableElement } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { createTextBufferFactoryFromSnapshot } from "../../../../../editor/common/model/textModel.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { getSimpleEditorOptions } from "../../../codeEditor/browser/simpleEditorOptions.js";
import { IWorkingCopyService } from "../../../../services/workingCopy/common/workingCopyService.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { FileSystemProviderCapabilities, IFileService } from "../../../../../platform/files/common/files.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { ScrollbarVisibility } from "../../../../../base/common/scrollable.js";
import { EmbeddedMcpServerDetail } from "./embeddedMcpServerDetail.js";
import { EmbeddedAgentPluginDetail } from "./embeddedAgentPluginDetail.js";
import { EmbeddedExtensionToolsDetail } from "./embeddedExtensionToolsDetail.js";
import { ICustomizationHarnessService } from "../../common/customizationHarnessService.js";
import { ChatConfiguration } from "../../common/constants.js";
import { AICustomizationWelcomePage } from "./aiCustomizationWelcomePage.js";
import { getPromptMigrationInfo, migratePromptFilesToSkills } from "./promptMigration.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { showNoFoldersDialog } from "../promptSyntax/pickers/askForPromptSourceFolder.js";
import { isAgentHostTarget } from "../../common/chatSessionsService.js";
const $ = DOM.$;
class SectionItemDelegate {
  getHeight() {
    return 26;
  }
  getTemplateId() {
    return "sectionItem";
  }
}
class SectionItemRenderer {
  constructor(hoverService) {
    this.hoverService = hoverService;
    this.templateId = "sectionItem";
  }
  renderTemplate(container) {
    container.classList.add("section-list-item");
    const icon = DOM.append(container, $(".section-icon"));
    const label = DOM.append(container, $(".section-label"));
    const count = DOM.append(container, $(".section-count"));
    const templateDisposables = new DisposableStore();
    return { container, icon, label, count, templateDisposables };
  }
  renderElement(element, index, templateData) {
    templateData.templateDisposables.clear();
    templateData.icon.className = "section-icon";
    templateData.icon.classList.add(...ThemeIcon.asClassNameArray(element.icon));
    templateData.label.textContent = element.label;
    if (element.count > 0) {
      templateData.count.textContent = String(element.count);
      templateData.count.style.display = "";
    } else {
      templateData.count.textContent = "";
      templateData.count.style.display = "none";
    }
    templateData.templateDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), templateData.container, element.description));
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
}
let AICustomizationManagementEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, instantiationService, contextKeyService, openerService, commandService, workspaceService, promptsService, textModelService, configurationService, workingCopyService, hoverService, contextViewService, markdownRendererService, modelService, quickInputService, fileService, notificationService, dialogService, harnessService, viewsService, labelService, itemsModel) {
    super(AICustomizationManagementEditor.ID, group, telemetryService, themeService, storageService);
    this.storageService = storageService;
    this.instantiationService = instantiationService;
    this.openerService = openerService;
    this.commandService = commandService;
    this.workspaceService = workspaceService;
    this.promptsService = promptsService;
    this.textModelService = textModelService;
    this.configurationService = configurationService;
    this.workingCopyService = workingCopyService;
    this.hoverService = hoverService;
    this.contextViewService = contextViewService;
    this.markdownRendererService = markdownRendererService;
    this.modelService = modelService;
    this.quickInputService = quickInputService;
    this.fileService = fileService;
    this.notificationService = notificationService;
    this.dialogService = dialogService;
    this.harnessService = harnessService;
    this.viewsService = viewsService;
    this.labelService = labelService;
    this.itemsModel = itemsModel;
    this.contributedSectionContainers = /* @__PURE__ */ new Map();
    this.contributedSectionWidgets = /* @__PURE__ */ new Map();
    this.editorActionButtonInProgress = false;
    this.editorDisplayMode = "preview";
    this.editorModelChangeDisposables = this._register(new DisposableStore());
    this.editorPreviewDisposables = this._register(new DisposableStore());
    this.editorPreviewRenderScheduler = this._register(new RunOnceScheduler(() => {
      if (this.viewMode === "editor" && this.editorDisplayMode === "preview") {
        this.renderCurrentEditorPreview();
      }
    }, 200));
    this.builtinEditingSessions = /* @__PURE__ */ new Map();
    this.currentEditingReadOnly = false;
    this.editorReturnViewMode = "list";
    this.viewMode = "list";
    this.migrationSearchQuery = "";
    this.collapsedPromptMigrationGroups = /* @__PURE__ */ new Set();
    this.selectedPromptMigrationUris = new ResourceSet();
    this.migrationPageDisposables = this._register(new DisposableStore());
    this.mcpDetailDisposables = this._register(new DisposableStore());
    this.pluginDetailDisposables = this._register(new DisposableStore());
    this.toolsDetailDisposables = this._register(new DisposableStore());
    this.sections = [];
    this.allSections = [];
    this.promptFilesToMigrate = [];
    this.promptMigrationRefreshSequence = 0;
    this.editorDisposables = this._register(new DisposableStore());
    this._editorContentChanged = false;
    this.sidebarWidth = 0;
    this.sidebarHeight = 0;
    this.inEditorContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR.bindTo(contextKeyService);
    this.sectionContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.bindTo(contextKeyService);
    this.harnessContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_HARNESS.bindTo(contextKeyService);
    this.updateHarnessLabelPresentation();
    this._register(autorun((reader) => {
      this.workspaceService.activeProjectRoot.read(reader);
      if (this.viewMode === "editor") {
        this.currentEditingProjectRoot = this.workspaceService.getActiveProjectRoot();
      }
    }));
    this._register(toDisposable(() => {
      this.currentModelRef?.dispose();
      this.currentModelRef = void 0;
    }));
    this._register(toDisposable(() => this.disposeBuiltinEditingSessions()));
    const sectionInfo = {
      [AICustomizationManagementSection.Agents]: { label: localize("agents", "Agents"), icon: agentIcon, description: localize("agentsDesc", "Define custom agents with specialized personas, tool access, and instructions for specific tasks.") },
      [AICustomizationManagementSection.Skills]: { label: localize("skills", "Skills"), icon: skillIcon, description: localize("skillsDesc", "Create reusable skill files that provide domain-specific knowledge and workflows.") },
      [AICustomizationManagementSection.Instructions]: { label: localize("instructions", "Instructions"), icon: instructionsIcon, description: localize("instructionsDesc", "Set always-on instructions that guide AI behavior across your workspace or user profile.") },
      [AICustomizationManagementSection.Prompts]: { label: localize("prompts", "Prompts"), icon: promptIcon, description: localize("promptsDesc", "Reusable prompt templates that can be invoked as slash commands.") },
      [AICustomizationManagementSection.Hooks]: { label: localize("hooks", "Hooks"), icon: hookIcon, description: localize("hooksDesc", "Configure automated actions triggered by events like saving files or running tasks.") },
      [AICustomizationManagementSection.Automations]: { label: localize("automations", "Automations"), icon: automationIcon, description: localize("automationsDesc", "Schedule agent sessions to run on a cadence you choose.") },
      [AICustomizationManagementSection.McpServers]: { label: localize("mcpServers", "MCP Servers"), icon: Codicon.server, description: localize("mcpServersDesc", "Connect external tool servers that extend AI capabilities with custom tools and data sources.") },
      [AICustomizationManagementSection.Plugins]: { label: localize("plugins", "Plugins"), icon: pluginIcon, description: localize("pluginsDesc", "Install and manage agent plugins that add additional tools, skills, and integrations.") },
      [AICustomizationManagementSection.Models]: { label: localize("models", "Models"), icon: Codicon.vm, description: localize("modelsDesc", "Configure and manage language models available for use.") },
      [AICustomizationManagementSection.Tools]: { label: localize("tools", "Tools"), icon: toolsIcon, description: localize("toolsDesc", "Enable or disable groups of language model tools available to chat.") }
    };
    const activeHarnessId = this.harnessService.activeHarness.get();
    for (const id of this.workspaceService.managementSections) {
      const contribution = aiCustomizationManagementSectionRegistry.get(id, activeHarnessId) ?? aiCustomizationManagementSectionRegistry.getDefault(id);
      const info = contribution ?? sectionInfo[id];
      if (info) {
        this.allSections.push({ id, label: info.label, icon: info.icon, description: info.description, count: 0 });
      }
    }
    this.rebuildVisibleSections();
    const savedSection = this.storageService.get(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, StorageScope.PROFILE);
    if (savedSection && this.sections.some((s) => s.id === savedSection)) {
      this.selectedSection = savedSection;
    } else {
      this.selectedSection = void 0;
    }
  }
  createEditor(parent) {
    this.editorDisposables.clear();
    this.contributedSectionContainers.clear();
    this.contributedSectionWidgets.clear();
    this.container = DOM.append(parent, $(".ai-customization-management-editor"));
    this.createSplitView();
    this.updateStyles();
  }
  createSplitView() {
    this.splitViewContainer = DOM.append(this.container, $(".management-split-view"));
    this.sidebarContainer = $(".management-sidebar");
    this.contentContainer = $(".management-content");
    this.createSidebar();
    this.createContent();
    this.splitView = this.editorDisposables.add(new SplitView(this.splitViewContainer, {
      orientation: Orientation.HORIZONTAL,
      proportionalLayout: true
    }));
    const savedWidth = this.storageService.getNumber(AI_CUSTOMIZATION_MANAGEMENT_SIDEBAR_WIDTH_KEY, StorageScope.PROFILE, SIDEBAR_DEFAULT_WIDTH);
    this.splitView.addView({
      onDidChange: Event.None,
      element: this.sidebarContainer,
      minimumSize: SIDEBAR_MIN_WIDTH,
      maximumSize: SIDEBAR_MAX_WIDTH,
      layout: (width, _, height) => {
        this.sidebarContainer.style.width = `${width}px`;
        if (height !== void 0) {
          this.layoutSidebar(width, height);
        }
      }
    }, savedWidth, void 0, true);
    this.splitView.addView({
      onDidChange: Event.None,
      element: this.contentContainer,
      minimumSize: CONTENT_MIN_WIDTH,
      maximumSize: Number.POSITIVE_INFINITY,
      layout: (width, _, height) => {
        this.contentContainer.style.width = `${width}px`;
        if (height !== void 0) {
          this.listWidget.layout(height - 16, width - 24);
          this.mcpListWidget?.layout(height - 16, width - 24);
          this.pluginListWidget?.layout(height - 16, width - 24);
          this.toolsListWidget?.layout(height - 16, width - 24);
          this.automationsListWidget?.layout(height - 16, width - 24);
          const modelsFooterHeight = this.modelsFooterElement?.offsetHeight || 80;
          this.modelsWidget?.layout(height - 16 - modelsFooterHeight, width);
          if (this.viewMode === "editor" && this.embeddedEditor && this.embeddedEditorContainer) {
            const { clientWidth, clientHeight } = this.embeddedEditorContainer;
            if (clientWidth > 0 && clientHeight > 0) {
              this.embeddedEditor.layout({ width: clientWidth, height: clientHeight });
            } else if (this.dimension) {
              DOM.getWindow(this.embeddedEditorContainer).requestAnimationFrame(() => {
                if (this.embeddedEditor && this.embeddedEditorContainer) {
                  const { clientWidth: w, clientHeight: h } = this.embeddedEditorContainer;
                  if (w > 0 && h > 0) {
                    this.embeddedEditor.layout({ width: w, height: h });
                  }
                }
              });
            }
          }
        }
      }
    }, Sizing.Distribute, void 0, true);
    this.editorDisposables.add(this.splitView.onDidSashChange(() => {
      const width = this.splitView.getViewSize(0);
      this.storageService.store(AI_CUSTOMIZATION_MANAGEMENT_SIDEBAR_WIDTH_KEY, width, StorageScope.PROFILE, StorageTarget.USER);
    }));
    this.editorDisposables.add(this.splitView.onDidSashReset(() => {
      const totalWidth = this.splitView.getViewSize(0) + this.splitView.getViewSize(1);
      this.splitView.resizeView(0, SIDEBAR_DEFAULT_WIDTH);
      this.splitView.resizeView(1, totalWidth - SIDEBAR_DEFAULT_WIDTH);
    }));
  }
  getActiveHarnessLabel() {
    return this.harnessService.getActiveDescriptor().label || localize("localHarnessLabel", "Local");
  }
  updateHarnessLabelPresentation() {
    const harnessLabel = this.getActiveHarnessLabel();
    AICustomizationManagementEditorInput.getOrCreate().setHarnessLabel(harnessLabel);
    this.welcomePage?.setHarnessLabel(harnessLabel);
  }
  /**
   * Rebuilds the visible sections list based on the active harness's
   * `hiddenSections`. If the current selection falls into a hidden
   * section, the first visible section is selected instead.
   */
  rebuildVisibleSections() {
    const activeId = this.harnessService.activeHarness.get();
    const descriptor = this.harnessService.findHarnessById(activeId);
    const hidden = new Set(descriptor?.hiddenSections ?? []);
    if (this.configurationService.getValue(CHAT_AUTOMATIONS_ENABLED_SETTING) !== true) {
      hidden.add(AICustomizationManagementSection.Automations);
    }
    this.sections.length = 0;
    for (const s of this.allSections) {
      const contribution = aiCustomizationManagementSectionRegistry.get(s.id, activeId);
      const contributed = aiCustomizationManagementSectionRegistry.has(s.id);
      if (!hidden.has(s.id) && (!contributed || !!contribution)) {
        this.sections.push(contribution ? { ...s, label: contribution.label, icon: contribution.icon, description: contribution.description } : s);
      }
    }
    if (this.sectionsList) {
      this.sectionsList.splice(0, this.sectionsList.length, this.sections);
      this.layoutSidebar(this.sidebarWidth, this.sidebarHeight);
    }
    this.welcomePage?.rebuildCards(new Set(this.sections.map((s) => s.id)));
    if (this.selectedSection !== void 0 && !this.sections.some((s) => s.id === this.selectedSection) && this.sections.length > 0) {
      this.showWelcomePage();
    } else {
      this.ensureSectionsListReflectsActiveSection();
    }
  }
  createSidebar() {
    const sidebarContent = DOM.append(this.sidebarContainer, $(".sidebar-content"));
    this.createSidebarHeader(sidebarContent);
    const sectionsListContainer = this.sectionsListContainer = DOM.append(sidebarContent, $(".sidebar-sections-list"));
    this.sectionsList = this.editorDisposables.add(this.instantiationService.createInstance(
      WorkbenchList,
      "AICustomizationManagementSections",
      sectionsListContainer,
      new SectionItemDelegate(),
      [new SectionItemRenderer(this.hoverService)],
      {
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel: (item) => item.count > 0 ? localize("sectionAriaLabelWithCount", "{0}, {1} items", item.label, item.count) : item.label,
          getWidgetAriaLabel: () => localize("sectionsAriaLabel", "Agent Customization Sections")
        },
        openOnSingleClick: true,
        identityProvider: {
          getId: (item) => item.id
        }
      }
    ));
    this.sectionsList.splice(0, this.sectionsList.length, this.sections);
    this.ensureSectionsListReflectsActiveSection();
    this.editorDisposables.add(this.sectionsList.onDidChangeSelection((e) => {
      if (e.elements.length === 0) {
        if (this.selectedSection !== void 0) {
          this.showWelcomePage();
        }
        return;
      }
      this.selectSection(e.elements[0].id);
    }));
    this.editorDisposables.add(autorun((reader) => {
      this.harnessService.availableHarnesses.read(reader);
      const activeId = this.harnessService.activeHarness.read(reader);
      this.harnessContextKey.set(activeId);
      this.updateHomeButtonHarnessPresentation();
      this.rebuildVisibleSections();
      if (this._previousActiveHarnessId !== void 0 && this._previousActiveHarnessId !== activeId) {
        for (const [section, widget] of this.contributedSectionWidgets) {
          this.editorDisposables.delete(widget);
          this.contributedSectionContainers.get(section)?.replaceChildren();
        }
        this.contributedSectionWidgets.clear();
        for (const section of this.sections) {
          this.updateSectionCount(section.id, 0);
        }
      }
      this._previousActiveHarnessId = activeId;
    }));
    this.editorDisposables.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled)) {
        this.onStructuredPreviewSettingChanged();
      }
      if (e.affectsConfiguration(ChatConfiguration.ChatCustomizationsPromptMigrationEnabled)) {
        this.refreshPromptMigrationUi();
      }
      if (e.affectsConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING)) {
        this.rebuildVisibleSections();
      }
    }));
    this.createSidebarMigrationShortcut(sidebarContent);
  }
  layoutSidebar(width, height) {
    this.sidebarWidth = width;
    this.sidebarHeight = height;
    if (!this.sectionsListContainer) {
      return;
    }
    const headerHeight = this.sidebarHeaderContainer?.offsetHeight ?? 0;
    const migrationHeight = this.migrationShortcutContainer?.style.display !== "none" ? this.migrationShortcutContainer?.offsetHeight ?? 0 : 0;
    const availableListHeight = Math.max(0, height - 8 - headerHeight - migrationHeight);
    const listHeight = Math.min(availableListHeight, this.sections.length * 26);
    this.sectionsListContainer.style.height = `${listHeight}px`;
    this.sectionsList.layout(listHeight, width);
  }
  createSidebarHeader(sidebarContent) {
    const headerRow = this.sidebarHeaderContainer = DOM.append(sidebarContent, $(".sidebar-header-row"));
    const homeButton = this.homeButton = DOM.append(headerRow, $("button.sidebar-home-button"));
    homeButton.classList.add("sidebar-harness-home-button");
    homeButton.setAttribute("aria-label", localize("homeButton", "Overview"));
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), homeButton, localize("homeButtonTooltip", "Back to overview")));
    const homeIcon = this.homeButtonIcon = DOM.append(homeButton, $("span.sidebar-home-icon"));
    homeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.home));
    homeIcon.setAttribute("aria-hidden", "true");
    const homeLabel = this.homeButtonLabel = DOM.append(homeButton, $("span.sidebar-home-label"));
    homeLabel.textContent = localize("homeButtonLabel", "Overview");
    this.editorDisposables.add(DOM.addDisposableListener(homeButton, "click", () => {
      this.showWelcomePage();
    }));
    this.updateHomeButtonHarnessPresentation();
    this.updateHomeButtonStyle();
  }
  updateHomeButtonStyle() {
    if (!this.homeButtonLabel || !this.homeButton) {
      return;
    }
    this.homeButtonLabel.style.display = "";
    this.homeButton.style.flex = "1";
  }
  updateHomeButtonHarnessPresentation() {
    this.updateHarnessLabelPresentation();
    if (!this.homeButton || !this.homeButtonIcon || !this.homeButtonLabel) {
      return;
    }
    this.homeButtonIcon.className = "sidebar-home-icon";
    this.homeButtonIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.home));
    this.homeButtonLabel.textContent = localize("homeButtonLabel", "Overview");
    this.homeButton.setAttribute("aria-label", localize("homeButton", "Overview"));
    this.homeButton.title = localize("homeButtonTooltip", "Back to overview");
  }
  createSidebarMigrationShortcut(sidebarContent) {
    const container = this.migrationShortcutContainer = DOM.append(sidebarContent, $(".sidebar-migration-shortcut"));
    container.style.display = "none";
    DOM.append(container, $("div.sidebar-migration-separator"));
    const button = this.migrationShortcutButton = DOM.append(container, $("button.sidebar-migration-button"));
    button.type = "button";
    button.setAttribute("aria-label", localize("migrationShortcutAriaLabel", "Migrate prompt files to skills"));
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), button, localize("migrationShortcutTooltip", "Convert deprecated prompt files to skills")));
    const icon = DOM.append(button, $("span.sidebar-migration-icon"));
    icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
    icon.setAttribute("aria-hidden", "true");
    const label = DOM.append(button, $("span.sidebar-migration-label"));
    label.textContent = localize("migrationShortcutLabel", "Migrate Prompts");
    this.migrationShortcutCount = DOM.append(button, $("span.sidebar-migration-count"));
    this.editorDisposables.add(DOM.addDisposableListener(button, "click", () => {
      this.showPromptMigrationPage();
    }));
  }
  createWelcomePage(parent) {
    this.welcomePage = this.editorDisposables.add(new AICustomizationWelcomePage(
      parent,
      this.workspaceService.welcomePageFeatures,
      {
        selectSection: (section) => this.selectSection(section),
        selectSectionWithMarketplace: (section) => this.selectSection(section, { showMarketplace: true }),
        closeEditor: () => {
          if (this.input) {
            this.group.closeEditor(this.input);
          }
        },
        migratePromptFiles: () => {
          this.showPromptMigrationPage();
        },
        prefillChat: async (query, options) => {
          try {
            if (this.workspaceService.isSessionsWindow) {
              const sessionsViewId = "workbench.view.sessions.chat";
              if (options?.newChat) {
                await this.commandService.executeCommand("workbench.action.sessions.newChat");
              }
              const view = await this.viewsService.openView(sessionsViewId, true);
              const chatView = view;
              if (options?.isPartialQuery && chatView?.prefillInput) {
                chatView.prefillInput(query);
              } else if (chatView?.sendQuery) {
                chatView.sendQuery(query);
              }
            } else {
              if (options?.newChat) {
                await this.commandService.executeCommand("workbench.action.chat.newChat");
              }
              await this.commandService.executeCommand("workbench.action.chat.open", { query, isPartialQuery: options?.isPartialQuery ?? false });
            }
          } catch (err) {
            onUnexpectedError(err);
          }
        }
      },
      this.commandService,
      this.workspaceService,
      this.hoverService,
      this.getActiveHarnessLabel()
    ));
    this.welcomePage.rebuildCards(new Set(this.sections.map((s) => s.id)));
    this.welcomePage.setPromptMigrationInfo(getPromptMigrationInfo(this.promptFilesToMigrate));
  }
  createBackArrowButton(onClick) {
    const button = $("button.section-back-arrow-button");
    button.type = "button";
    button.setAttribute("aria-label", localize("backToOverview", "Back to overview"));
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), button, localize("backToOverviewTooltip", "Back to overview")));
    const icon = DOM.append(button, $("span.section-back-arrow-icon"));
    icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.arrowLeft));
    icon.setAttribute("aria-hidden", "true");
    this.editorDisposables.add(DOM.addDisposableListener(button, "click", () => {
      if (onClick) {
        onClick();
      } else {
        this.showWelcomePage();
      }
    }));
    return button;
  }
  createPromptMigrationContent(contentInner) {
    this.migrationContentContainer = DOM.append(contentInner, $(".prompt-migration-content-container.ai-customization-list-widget"));
    const header = DOM.append(this.migrationContentContainer, $(".section-title-header"));
    const titleRow = DOM.append(header, $(".section-title-row"));
    const title = DOM.append(titleRow, $("h2.section-title"));
    title.textContent = localize("promptMigrationPageTitle", "Migrate Prompt Files");
    this.migrationDescriptionElement = DOM.append(header, $("p.section-title-description"));
    const sectionLink = DOM.append(header, $("a.section-title-link"));
    sectionLink.textContent = localize("learnMoreSkills", "Learn more about agent skills");
    sectionLink.href = "https://code.visualstudio.com/docs/agent-customization/agent-skills?referrer=in-product";
    this.editorDisposables.add(DOM.addDisposableListener(sectionLink, "click", (e) => {
      e.preventDefault();
      this.openerService.open(URI.parse(sectionLink.href));
    }));
    const actions = DOM.append(this.migrationContentContainer, $(".list-search-and-button-container.prompt-migration-actions"));
    const searchContainer = DOM.append(actions, $(".list-search-container"));
    this.migrationSearchInput = this.editorDisposables.add(new InputBox(searchContainer, this.contextViewService, {
      placeholder: localize("promptMigrationSearchPlaceholder", "Type to search..."),
      inputBoxStyles: defaultInputBoxStyles
    }));
    this.editorDisposables.add(this.migrationSearchInput.onDidChange(() => {
      this.migrationSearchQuery = this.migrationSearchInput?.value ?? "";
      this.renderPromptMigrationPage();
    }));
    const actionButtonContainer = DOM.append(actions, $(".list-add-button-container"));
    this.migrationMigrateButton = this.editorDisposables.add(new Button(actionButtonContainer, defaultButtonStyles));
    this.migrationMigrateButton.element.classList.add("list-add-button", "prompt-migration-button");
    this.migrationMigrateButton.label = localize("promptMigrationPageButton", "Migrate");
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), this.migrationMigrateButton.element, localize("promptMigrationPageButtonTooltip", "Convert selected prompt files to skills")));
    this.editorDisposables.add(this.migrationMigrateButton.onDidClick(() => {
      const selectedPromptFiles = this.promptFilesToMigrate.filter((file) => this.selectedPromptMigrationUris.has(file.uri));
      void this.migratePromptFiles(selectedPromptFiles);
    }));
    this.migrationListContainer = $(".prompt-migration-list.list-container");
    this.migrationListScrollable = this.editorDisposables.add(new DomScrollableElement(this.migrationListContainer, {
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Auto,
      useShadows: false
    }));
    const migrationListScrollableNode = this.migrationListScrollable.getDomNode();
    migrationListScrollableNode.classList.add("prompt-migration-list-scrollable");
    this.migrationContentContainer.appendChild(migrationListScrollableNode);
    const targetWindow = DOM.getWindow(this.migrationContentContainer);
    const migrationResizeObserver = this.editorDisposables.add(new DOM.DisposableResizeObserver(
      "AICustomizationManagementEditor.promptMigrationListScrollable",
      () => this.migrationListScrollable?.scanDomNode(),
      targetWindow
    ));
    this.editorDisposables.add(migrationResizeObserver.observe(migrationListScrollableNode));
    this.renderPromptMigrationPage();
  }
  createContent() {
    const contentInner = DOM.append(this.contentContainer, $(".content-inner"));
    this.createWelcomePage(contentInner);
    this.editorDisposables.add(this.promptsService.onDidChangeSlashCommands(() => {
      void this.refreshPromptMigrationInfo();
    }));
    this.editorDisposables.add(autorun((reader) => {
      this.harnessService.activeHarness.read(reader);
      void this.refreshPromptMigrationInfo();
    }));
    this.promptsContentContainer = DOM.append(contentInner, $(".prompts-content-container"));
    this.listWidget = this.editorDisposables.add(this.instantiationService.createInstance(AICustomizationListWidget));
    this.promptsContentContainer.appendChild(this.listWidget.element);
    this.createPromptMigrationContent(contentInner);
    this.editorDisposables.add(this.listWidget.onDidSelectItem((item) => {
      this.telemetryService.publicLog2("chatCustomizationEditor.itemSelected", {
        section: this.selectedSection ?? "welcome",
        promptType: item.promptType,
        storage: item.source ?? "external"
      });
      const source = item.source;
      const isWorkspaceFile = source === AICustomizationSources.local;
      const isReadOnly = !source || source === AICustomizationSources.extension || source === AICustomizationSources.plugin || source === AICustomizationSources.builtin;
      this.showEmbeddedEditor(item.uri, item.name, item.promptType, source ?? AICustomizationSources.builtin, isWorkspaceFile, isReadOnly);
    }));
    this.editorDisposables.add(this.listWidget.onDidRequestCreate((promptType) => {
      this.createNewItemWithAI(promptType);
    }));
    this.editorDisposables.add(this.listWidget.onDidRequestCreateManual(({ type, target, rootFileName }) => {
      this.createNewItemManual(type, target, rootFileName);
    }));
    const hasSections = new Set(this.workspaceService.managementSections);
    if (hasSections.has(AICustomizationManagementSection.Models)) {
      this.modelsContentContainer = DOM.append(contentInner, $(".models-content-container"));
      const modelsBackBar = DOM.append(this.modelsContentContainer, $(".section-back-bar"));
      modelsBackBar.appendChild(this.createBackArrowButton());
      this.modelsWidget = this.editorDisposables.add(this.instantiationService.createInstance(ChatModelsWidget));
      this.modelsContentContainer.appendChild(this.modelsWidget.element);
      this.modelsFooterElement = DOM.append(this.modelsContentContainer, $(".section-footer"));
      const modelsDescription = DOM.append(this.modelsFooterElement, $("p.section-footer-description"));
      modelsDescription.textContent = localize("modelsDescription", "Browse and manage language models from different providers. Select models for use in chat, code completion, and other AI features.");
      const modelsLink = DOM.append(this.modelsFooterElement, $("a.section-footer-link"));
      modelsLink.textContent = localize("learnMoreModels", "Learn more about language models");
      modelsLink.href = "https://code.visualstudio.com/docs/agent-customization/language-models?referrer=in-product";
      this.editorDisposables.add(DOM.addDisposableListener(modelsLink, "click", (e) => {
        e.preventDefault();
        this.openerService.open(URI.parse(modelsLink.href));
      }));
    }
    if (hasSections.has(AICustomizationManagementSection.McpServers)) {
      this.mcpContentContainer = DOM.append(contentInner, $(".mcp-content-container"));
      this.mcpListWidget = this.editorDisposables.add(this.instantiationService.createInstance(McpListWidget));
      this.mcpListWidget.setCloseCustomizationEditor(async () => {
        if (this.input) {
          await this.group.closeEditor(this.input);
        }
      });
      this.mcpContentContainer.appendChild(this.mcpListWidget.element);
      this.mcpDetailContainer = DOM.append(contentInner, $(".mcp-detail-container"));
      this.createEmbeddedMcpDetail();
      this.editorDisposables.add(this.mcpListWidget.onDidSelectServer((server) => {
        this.showEmbeddedMcpDetail(server);
      }));
      this.editorDisposables.add(this.mcpListWidget.onDidRequestShowPlugin((item) => {
        this.showPluginDetail(item);
      }));
    }
    if (hasSections.has(AICustomizationManagementSection.Plugins)) {
      this.pluginContentContainer = DOM.append(contentInner, $(".plugin-content-container"));
      this.pluginListWidget = this.editorDisposables.add(this.instantiationService.createInstance(PluginListWidget));
      this.pluginContentContainer.appendChild(this.pluginListWidget.element);
      this.pluginDetailContainer = DOM.append(contentInner, $(".plugin-detail-container"));
      this.createEmbeddedPluginDetail();
      this.editorDisposables.add(this.pluginListWidget.onDidSelectPlugin((item) => {
        this.pluginDetailReturnSection = void 0;
        this.showEmbeddedPluginDetail(item);
      }));
    }
    if (hasSections.has(AICustomizationManagementSection.Tools)) {
      this.toolsContentContainer = DOM.append(contentInner, $(".tools-content-container"));
      this.toolsListWidget = this.editorDisposables.add(this.instantiationService.createInstance(ToolsListWidget, AGENT_HOST_COPILOT_CLI_SESSION_TYPE));
      this.toolsContentContainer.appendChild(this.toolsListWidget.element);
      this.toolsDetailContainer = DOM.append(contentInner, $(".tools-detail-container"));
      this.createEmbeddedToolDetail();
      this.editorDisposables.add(this.toolsListWidget.onDidSelectExtension((extension) => {
        this.showEmbeddedToolDetail(extension);
      }));
    }
    if (hasSections.has(AICustomizationManagementSection.Automations)) {
      this.automationsContentContainer = DOM.append(contentInner, $(".automations-content-container"));
      this.automationsListWidget = this.editorDisposables.add(this.instantiationService.createInstance(AutomationsListWidget));
      this.automationsContentContainer.appendChild(this.automationsListWidget.element);
    }
    for (const section of this.workspaceService.managementSections) {
      if (!aiCustomizationManagementSectionRegistry.has(section)) {
        continue;
      }
      const container = DOM.append(contentInner, $(".contributed-section-container"));
      this.contributedSectionContainers.set(section, container);
    }
    this.editorContentContainer = DOM.append(contentInner, $(".editor-content-container"));
    this.createEmbeddedEditor();
    this.updateContentVisibility();
    this.editorDisposables.add(this.listWidget.onDidChangeItemCount((count) => {
      if (this.isPromptsSection(this.selectedSection)) {
        this.updateSectionCount(this.selectedSection, count);
      }
    }));
    if (this.mcpListWidget) {
      this.editorDisposables.add(this.mcpListWidget.onDidChangeItemCount((count) => {
        this.updateSectionCount(AICustomizationManagementSection.McpServers, count);
      }));
      this.mcpListWidget.fireItemCount();
    }
    if (this.pluginListWidget) {
      this.editorDisposables.add(this.pluginListWidget.onDidChangeItemCount((count) => {
        this.updateSectionCount(AICustomizationManagementSection.Plugins, count);
      }));
      this.pluginListWidget.fireItemCount();
    }
    if (this.automationsListWidget) {
      this.editorDisposables.add(this.automationsListWidget.onDidChangeItemCount((count) => {
        this.updateSectionCount(AICustomizationManagementSection.Automations, count);
      }));
      this.automationsListWidget.fireItemCount();
    }
    if (this.modelsWidget) {
      this.editorDisposables.add(this.modelsWidget.onDidChangeItemCount((count) => {
        this.updateSectionCount(AICustomizationManagementSection.Models, count);
      }));
      this.modelsWidget.fireItemCount();
    }
    if (this.toolsListWidget) {
      this.editorDisposables.add(this.toolsListWidget.onDidChangeItemCount((count) => {
        this.updateSectionCount(AICustomizationManagementSection.Tools, count);
      }));
      this.toolsListWidget.fireItemCount();
    }
    for (const section of ITEMS_MODEL_SECTIONS) {
      const observable = this.itemsModel.getCount(section);
      this.editorDisposables.add(autorun((reader) => {
        this.updateSectionCount(section, observable.read(reader));
      }));
    }
    if (this.isPromptsSection(this.selectedSection)) {
      void this.listWidget.setSection(this.selectedSection);
    }
    void this.refreshPromptMigrationInfo();
  }
  async refreshPromptMigrationInfo() {
    const activeHarnessId = this.harnessService.activeHarness.get();
    const refreshSequence = ++this.promptMigrationRefreshSequence;
    if (!isAgentHostTarget(activeHarnessId)) {
      this.setPromptFilesToMigrate([]);
      return;
    }
    try {
      const promptFiles = await this.promptsService.listPromptFiles(PromptsType.prompt, CancellationToken.None);
      if (refreshSequence !== this.promptMigrationRefreshSequence || activeHarnessId !== this.harnessService.activeHarness.get()) {
        return;
      }
      this.setPromptFilesToMigrate(promptFiles.filter((file) => file.storage === PromptsStorage.local || file.storage === PromptsStorage.user));
    } catch (error) {
      if (refreshSequence === this.promptMigrationRefreshSequence) {
        this.setPromptFilesToMigrate([]);
      }
      onUnexpectedError(error);
    }
  }
  setPromptFilesToMigrate(promptFiles) {
    const previousPromptUris = new ResourceSet(this.promptFilesToMigrate.map((promptFile) => promptFile.uri));
    const selectedPromptUris = new ResourceSet();
    for (const promptFile of promptFiles) {
      if (!previousPromptUris.has(promptFile.uri) || this.selectedPromptMigrationUris.has(promptFile.uri)) {
        selectedPromptUris.add(promptFile.uri);
      }
    }
    this.selectedPromptMigrationUris = selectedPromptUris;
    this.promptFilesToMigrate = promptFiles;
    this.refreshPromptMigrationUi();
  }
  refreshPromptMigrationUi() {
    const migrationInfo = this.isPromptMigrationEnabled() ? getPromptMigrationInfo(this.promptFilesToMigrate) : void 0;
    this.welcomePage?.setPromptMigrationInfo(migrationInfo);
    this.updateSidebarMigrationShortcut(migrationInfo);
    this.renderPromptMigrationPage();
  }
  updateSidebarMigrationShortcut(migrationInfo) {
    if (!this.migrationShortcutContainer || !this.migrationShortcutButton || !this.migrationShortcutCount) {
      return;
    }
    if (!migrationInfo) {
      this.migrationShortcutContainer.style.display = "none";
      this.layoutSidebar(this.sidebarWidth, this.sidebarHeight);
      return;
    }
    this.migrationShortcutContainer.style.display = "";
    this.migrationShortcutCount.textContent = String(migrationInfo.totalPromptCount);
    this.migrationShortcutButton.setAttribute(
      "aria-label",
      localize("migrationShortcutAriaLabelWithCount", "Prompts, {0} deprecated prompt files need migration", migrationInfo.totalPromptCount)
    );
    this.layoutSidebar(this.sidebarWidth, this.sidebarHeight);
  }
  async migratePromptFiles(promptFiles) {
    if (promptFiles.length === 0) {
      return;
    }
    if (!this.isPromptMigrationEnabled()) {
      return;
    }
    const migrationInfo = getPromptMigrationInfo(promptFiles);
    if (!migrationInfo) {
      return;
    }
    const confirmResult = await this.dialogService.confirm({
      type: "question",
      message: localize("promptMigrationConfirmMessage", "Convert prompt files to skills?"),
      detail: migrationInfo && migrationInfo.workspacePromptCount > 0 && migrationInfo.userPromptCount > 0 ? localize("promptMigrationConfirmDetailWorkspaceAndUser", "This converts {0} workspace prompt files and {1} user prompt files into skills.", migrationInfo.workspacePromptCount, migrationInfo.userPromptCount) : migrationInfo && migrationInfo.workspacePromptCount > 0 ? localize("promptMigrationConfirmDetailWorkspace", "This converts {0} workspace prompt files into skills.", migrationInfo.workspacePromptCount) : localize("promptMigrationConfirmDetailUser", "This converts {0} user prompt files into skills.", migrationInfo?.userPromptCount ?? this.promptFilesToMigrate.length),
      checkbox: {
        label: localize("promptMigrationDeletePromptFilesCheckbox", "Delete original prompt files after migration"),
        checked: true
      },
      primaryButton: localize("promptMigrationConfirmButton", "Convert to Skills")
    });
    if (!confirmResult.confirmed) {
      return;
    }
    const skillSourceFolders = await this.itemsModel.getActiveItemSource().fetchSourceFolders(PromptsType.skill);
    if (skillSourceFolders.length === 0) {
      this.notificationService.error(localize("promptMigrationNoSkillFolders", "No skill folders are configured for the active harness."));
      return;
    }
    const skillSourceFoldersByStorage = await this.resolveMigrationSkillSourceFolders(skillSourceFolders, migrationInfo);
    if (!skillSourceFoldersByStorage) {
      return;
    }
    const migrationResult = await migratePromptFilesToSkills(
      promptFiles,
      skillSourceFoldersByStorage,
      this.fileService,
      onUnexpectedError,
      { deleteOriginalPromptFiles: confirmResult.checkboxChecked !== false }
    );
    const { convertedCount, failedPromptFileNames, unsupportedHeaderKeys, convertedSkillFileUris } = migrationResult;
    if (failedPromptFileNames.length > 0) {
      const displayedFileNames = failedPromptFileNames.slice(0, 3);
      const hiddenFileCount = failedPromptFileNames.length - displayedFileNames.length;
      if (hiddenFileCount > 0) {
        this.notificationService.error(localize(
          "promptMigrationFilesFailedWithRemainder",
          "Failed to migrate {0} prompt files: {1}, and {2} more.",
          failedPromptFileNames.length,
          displayedFileNames.join(", "),
          hiddenFileCount
        ));
      } else {
        this.notificationService.error(localize(
          "promptMigrationFilesFailed",
          "Failed to migrate {0} prompt files: {1}.",
          failedPromptFileNames.length,
          displayedFileNames.join(", ")
        ));
      }
    }
    if (convertedCount === 0) {
      if (failedPromptFileNames.length === 0) {
        this.notificationService.warn(localize("promptMigrationNoFilesConverted", "No prompt files were converted."));
      }
      return;
    }
    await this.refreshPromptMigrationInfo();
    const unsupportedKeysLabel = Array.from(unsupportedHeaderKeys).sort().join(", ");
    if (unsupportedKeysLabel.length > 0) {
      this.notificationService.info(localize(
        "promptMigrationConvertedWithReview",
        "Converted {0} prompt files to skills. Review migrated skills that used unsupported prompt headers: {1}.",
        convertedCount,
        unsupportedKeysLabel
      ));
    } else {
      this.notificationService.info(localize("promptMigrationConverted", "Converted {0} prompt files to skills.", convertedCount));
    }
    this.selectSection(AICustomizationManagementSection.Skills);
    void this.revealMigratedSkills(convertedSkillFileUris);
  }
  renderPromptMigrationPage() {
    if (!this.migrationListContainer || !this.migrationMigrateButton) {
      return;
    }
    this.migrationPageDisposables.clear();
    DOM.clearNode(this.migrationListContainer);
    this.updatePromptMigrationPageDescription();
    if (this.promptFilesToMigrate.length === 0 || !this.isPromptMigrationEnabled()) {
      const emptyMessage = DOM.append(this.migrationListContainer, $("p.prompt-migration-empty"));
      emptyMessage.textContent = localize("promptMigrationPageEmpty", "No prompt files are available to migrate.");
      this.migrationMigrateButton.enabled = false;
      this.migrationListScrollable?.scanDomNode();
      return;
    }
    const query = this.migrationSearchQuery.trim().toLowerCase();
    const filteredPromptFiles = this.promptFilesToMigrate.filter((promptFile) => {
      if (!query) {
        return true;
      }
      const displayName = (promptFile.name ?? basename(promptFile.uri)).toLowerCase();
      const relativePath = this.labelService.getUriLabel(promptFile.uri, { relative: true }).toLowerCase();
      return displayName.includes(query) || relativePath.includes(query);
    });
    if (filteredPromptFiles.length === 0) {
      const emptyMessage = DOM.append(this.migrationListContainer, $("p.prompt-migration-empty"));
      emptyMessage.textContent = localize("promptMigrationSearchEmpty", "No prompt files match your search.");
      this.updatePromptMigrationActionState();
      this.migrationListScrollable?.scanDomNode();
      return;
    }
    const workspacePromptFiles = filteredPromptFiles.filter((file) => file.storage === PromptsStorage.local);
    const userPromptFiles = filteredPromptFiles.filter((file) => file.storage === PromptsStorage.user);
    const openPromptFileInEmbeddedEditor = (promptFile) => {
      const isWorkspaceFile = promptFile.storage === PromptsStorage.local;
      void this.showEmbeddedEditor(
        promptFile.uri,
        promptFile.name ?? basename(promptFile.uri),
        PromptsType.prompt,
        promptFile.storage,
        isWorkspaceFile
      );
    };
    const renderSelectionCheckbox = (row, promptFile) => {
      const checkboxContainer = DOM.append(row, $(".item-sync-checkbox.prompt-migration-checkbox"));
      const checkboxTitle = localize("promptMigrationSelectAriaLabel", "Select {0}", promptFile.name ?? basename(promptFile.uri));
      const checkbox = this.migrationPageDisposables.add(new Checkbox(checkboxTitle, this.selectedPromptMigrationUris.has(promptFile.uri), defaultCheckboxStyles));
      checkboxContainer.replaceChildren(checkbox.domNode);
      this.migrationPageDisposables.add(checkbox.onChange(() => {
        if (checkbox.checked) {
          this.selectedPromptMigrationUris.add(promptFile.uri);
        } else {
          this.selectedPromptMigrationUris.delete(promptFile.uri);
        }
        this.updatePromptMigrationActionState();
      }));
      return checkbox;
    };
    const renderItem = (container, promptFile) => {
      const row = DOM.append(container, $("div.ai-customization-list-item.prompt-migration-item"));
      const checkbox = renderSelectionCheckbox(row, promptFile);
      this.migrationPageDisposables.add(DOM.addDisposableListener(row, "click", (event) => {
        if (event.target instanceof Node && checkbox.domNode.contains(event.target)) {
          return;
        }
        openPromptFileInEmbeddedEditor(promptFile);
      }));
      const itemLeft = DOM.append(row, $("span.item-left"));
      const itemText = DOM.append(itemLeft, $("span.item-text"));
      const nameRow = DOM.append(itemText, $("span.item-name-row"));
      const nameLabel = DOM.append(nameRow, $("span.item-name.prompt-migration-item-name"));
      nameLabel.textContent = promptFile.name ?? basename(promptFile.uri);
      const pathLabel = DOM.append(itemText, $("span.item-description.is-filename.prompt-migration-item-path"));
      pathLabel.textContent = this.labelService.getUriLabel(promptFile.uri, { relative: true });
      const itemRight = DOM.append(row, $("span.item-right"));
      const deleteButton = DOM.append(itemRight, $("button.icon-button", {
        type: "button",
        "aria-label": localize("deletePromptFile", "Delete {0}", promptFile.name ?? basename(promptFile.uri))
      }));
      deleteButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.trash));
      this.migrationPageDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), deleteButton, localize("deletePromptFileTooltip", "Delete")));
      this.migrationPageDisposables.add(DOM.addDisposableListener(deleteButton, "click", (event) => {
        event.stopPropagation();
        void this.deletePromptFile(promptFile);
      }));
    };
    const renderGroup = (groupKey, groupLabel, promptFiles) => {
      if (promptFiles.length === 0) {
        return;
      }
      const group = DOM.append(this.migrationListContainer, $(".prompt-migration-group"));
      const groupHeader = DOM.append(group, $(".ai-customization-group-header.prompt-migration-group-header"));
      const groupCheckboxContainer = DOM.append(groupHeader, $(".item-sync-checkbox.prompt-migration-group-checkbox"));
      const allInGroupSelected = promptFiles.every((file) => this.selectedPromptMigrationUris.has(file.uri));
      const groupCheckboxAriaLabel = localize("promptMigrationSelectGroupAriaLabel", "Select all {0} prompt files", groupLabel.toLowerCase());
      const groupCheckbox = this.migrationPageDisposables.add(new Checkbox(groupCheckboxAriaLabel, allInGroupSelected, defaultCheckboxStyles));
      groupCheckboxContainer.replaceChildren(groupCheckbox.domNode);
      this.migrationPageDisposables.add(groupCheckbox.onChange(() => {
        for (const promptFile of promptFiles) {
          if (groupCheckbox.checked) {
            this.selectedPromptMigrationUris.add(promptFile.uri);
          } else {
            this.selectedPromptMigrationUris.delete(promptFile.uri);
          }
        }
        this.renderPromptMigrationPage();
      }));
      const groupToggle = DOM.append(groupHeader, $("button.prompt-migration-group-toggle"));
      groupToggle.type = "button";
      const groupId = `prompt-migration-group-${groupKey}`;
      const collapsed = this.collapsedPromptMigrationGroups.has(groupId);
      groupToggle.setAttribute("aria-controls", `${groupId}-items`);
      groupToggle.setAttribute("aria-expanded", String(!collapsed));
      const chevron = DOM.append(groupToggle, $("span.group-chevron"));
      chevron.setAttribute("aria-hidden", "true");
      const groupLabelGroup = DOM.append(groupToggle, $(".group-label-group"));
      const label = DOM.append(groupLabelGroup, $("span.group-label"));
      label.textContent = groupLabel;
      const count = DOM.append(groupToggle, $("span.group-count"));
      count.textContent = String(promptFiles.length);
      const groupItems = DOM.append(group, $(".prompt-migration-group-items"));
      groupItems.id = `${groupId}-items`;
      const setGroupCollapsed = (collapsed2) => {
        groupItems.style.display = collapsed2 ? "none" : "";
        chevron.className = "group-chevron";
        chevron.classList.add(...ThemeIcon.asClassNameArray(collapsed2 ? Codicon.chevronRight : Codicon.chevronDown));
        groupToggle.setAttribute("aria-expanded", String(!collapsed2));
        this.migrationListScrollable?.scanDomNode();
      };
      setGroupCollapsed(collapsed);
      this.migrationPageDisposables.add(DOM.addDisposableListener(groupToggle, "click", () => {
        if (this.collapsedPromptMigrationGroups.has(groupId)) {
          this.collapsedPromptMigrationGroups.delete(groupId);
          setGroupCollapsed(false);
        } else {
          this.collapsedPromptMigrationGroups.add(groupId);
          setGroupCollapsed(true);
        }
      }));
      for (const promptFile of promptFiles) {
        renderItem(groupItems, promptFile);
      }
    };
    renderGroup(PromptsStorage.local, localize("promptMigrationWorkspaceGroup", "Workspace"), workspacePromptFiles);
    renderGroup(PromptsStorage.user, localize("promptMigrationUserGroup", "User"), userPromptFiles);
    for (const promptFile of filteredPromptFiles.filter((file) => file.storage !== PromptsStorage.local && file.storage !== PromptsStorage.user)) {
      renderItem(this.migrationListContainer, promptFile);
    }
    this.updatePromptMigrationActionState();
    this.migrationListScrollable?.scanDomNode();
  }
  updatePromptMigrationPageDescription() {
    if (!this.migrationDescriptionElement) {
      return;
    }
    const migrationInfo = getPromptMigrationInfo(this.promptFilesToMigrate);
    if (!migrationInfo) {
      this.migrationDescriptionElement.textContent = localize("promptMigrationPageDescription", "Select prompt files to convert into skills for the active harness.");
      return;
    }
    const { workspacePromptCount, userPromptCount, totalPromptCount } = migrationInfo;
    const harnessLabel = this.getActiveHarnessLabel();
    if (workspacePromptCount > 0 && userPromptCount > 0) {
      this.migrationDescriptionElement.textContent = localize(
        "promptMigrationPageDescriptionWorkspaceAndUser",
        "Prompt files are not supported for this harness. Found {0} prompt files ({1} workspace, {2} user) that local VS Code can still run, but {3} ignores. Convert them to skills to keep them available.",
        totalPromptCount,
        workspacePromptCount,
        userPromptCount,
        harnessLabel
      );
      return;
    }
    if (workspacePromptCount > 0) {
      this.migrationDescriptionElement.textContent = localize(
        "promptMigrationPageDescriptionWorkspace",
        "Prompt files are not supported for this harness. Found {0} workspace prompt files that local VS Code can still run, but {1} ignores. Convert them to skills to keep them available.",
        workspacePromptCount,
        harnessLabel
      );
      return;
    }
    this.migrationDescriptionElement.textContent = localize(
      "promptMigrationPageDescriptionUser",
      "Prompt files are not supported for this harness. Found {0} user prompt files that local VS Code can still run, but {1} ignores. Convert them to skills to keep them available.",
      userPromptCount,
      harnessLabel
    );
  }
  updatePromptMigrationActionState() {
    if (!this.migrationMigrateButton) {
      return;
    }
    const selectedCount = this.promptFilesToMigrate.filter((file) => this.selectedPromptMigrationUris.has(file.uri)).length;
    this.migrationMigrateButton.enabled = selectedCount > 0;
    this.migrationMigrateButton.label = selectedCount > 0 ? localize("promptMigrationPageButtonWithCount", "Migrate ({0})", selectedCount) : localize("promptMigrationPageButton", "Migrate");
  }
  async deletePromptFile(promptFile) {
    const fileName = promptFile.name ?? basename(promptFile.uri);
    const confirmation = await this.dialogService.confirm({
      message: localize("confirmDeletePromptFile", "Are you sure you want to delete '{0}'?", fileName),
      detail: localize("confirmDeleteDetail", "This action cannot be undone."),
      primaryButton: localize("delete", "Delete"),
      type: "warning"
    });
    if (!confirmation.confirmed) {
      return;
    }
    const useTrash = this.fileService.hasCapability(promptFile.uri, FileSystemProviderCapabilities.Trash);
    await this.fileService.del(promptFile.uri, { useTrash });
    if (promptFile.storage === PromptsStorage.local) {
      const projectRoot = this.workspaceService.getActiveProjectRoot();
      if (projectRoot) {
        await this.workspaceService.deleteFiles(projectRoot, [promptFile.uri]);
      }
    }
    const updatedFiles = this.promptFilesToMigrate.filter((f) => !isEqual(f.uri, promptFile.uri));
    this.setPromptFilesToMigrate(updatedFiles);
  }
  isPromptMigrationEnabled() {
    return this.configurationService.getValue(ChatConfiguration.ChatCustomizationsPromptMigrationEnabled) === true;
  }
  async resolveMigrationSkillSourceFolders(skillSourceFolders, migrationInfo) {
    const sourceFoldersByStorage = /* @__PURE__ */ new Map();
    const localSkillSourceFolders = skillSourceFolders.filter((folder) => folder.source === PromptsStorage.local);
    if (localSkillSourceFolders.length > 0) {
      if ((migrationInfo?.workspacePromptCount ?? 0) > 0 && localSkillSourceFolders.length > 1) {
        const pickedLocalFolder = await this.pickMigrationWorkspaceSkillSourceFolder(localSkillSourceFolders);
        if (!pickedLocalFolder) {
          return void 0;
        }
        sourceFoldersByStorage.set(PromptsStorage.local, pickedLocalFolder);
      } else {
        sourceFoldersByStorage.set(PromptsStorage.local, localSkillSourceFolders[0]);
      }
    }
    for (const folder of skillSourceFolders) {
      if (folder.source === PromptsStorage.user && !sourceFoldersByStorage.has(PromptsStorage.user)) {
        sourceFoldersByStorage.set(PromptsStorage.user, folder);
      }
      if (folder.source === PromptsStorage.local && !sourceFoldersByStorage.has(PromptsStorage.local)) {
        sourceFoldersByStorage.set(PromptsStorage.local, folder);
      }
    }
    return sourceFoldersByStorage;
  }
  async pickMigrationWorkspaceSkillSourceFolder(localSkillSourceFolders) {
    const picks = localSkillSourceFolders.map((folder) => ({
      label: folder.label,
      description: this.labelService.getUriLabel(folder.uri, { relative: true }),
      folder
    }));
    const selected = await this.quickInputService.pick(picks, {
      canPickMany: false,
      placeHolder: localize("promptMigrationPickWorkspaceSkillFolder", "Select a workspace skill folder for migrated prompts"),
      matchOnDescription: true
    });
    return selected?.folder;
  }
  async revealMigratedSkills(skillUris) {
    if (skillUris.length === 0) {
      return;
    }
    await this.listWidget.setSection(AICustomizationManagementSection.Skills);
    if (this.listWidget.revealAndSelectFirstItemByUri(skillUris)) {
      return;
    }
    this.listWidget.clearSearch();
    if (this.listWidget.revealAndSelectFirstItemByUri(skillUris)) {
      return;
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      await timeout(100);
      if (this.listWidget.revealAndSelectFirstItemByUri(skillUris)) {
        return;
      }
    }
  }
  isPromptsSection(section) {
    return section === AICustomizationManagementSection.Agents || section === AICustomizationManagementSection.Skills || section === AICustomizationManagementSection.Instructions || section === AICustomizationManagementSection.Prompts || section === AICustomizationManagementSection.Hooks;
  }
  //#region Section Counts
  /**
   * Updates the count for a specific section and re-renders the sidebar.
   */
  updateSectionCount(sectionId, count) {
    const section = this.sections.find((s) => s.id === sectionId);
    if (!section || section.count === count) {
      return;
    }
    section.count = count;
    this.sectionsList.splice(0, this.sectionsList.length, this.sections);
    this.ensureSectionsListReflectsActiveSection();
  }
  //#endregion
  /**
   * Navigates to the welcome page (no section selected).
   */
  showWelcomePage() {
    if (this.viewMode === "editor") {
      this.goBackToList();
    }
    if (this.viewMode === "migration") {
      this.viewMode = "list";
    }
    if (this.viewMode === "mcpDetail") {
      this.goBackFromMcpDetail();
    }
    if (this.viewMode === "pluginDetail") {
      this.goBackFromPluginDetail();
    }
    if (this.viewMode === "toolsDetail") {
      this.goBackFromToolDetail();
    }
    this.selectedSection = void 0;
    this.sectionContextKey.set("");
    this.storageService.remove(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, StorageScope.PROFILE);
    this.welcomePage?.reset();
    this.updateContentVisibility();
    this.ensureSectionsListReflectsActiveSection(void 0);
    this.welcomePage?.focus();
  }
  selectSection(section, options) {
    if (this.selectedSection === section && !options?.showMarketplace) {
      this.ensureSectionsListReflectsActiveSection(section);
      return;
    }
    this.telemetryService.publicLog2("chatCustomizationEditor.sectionChanged", {
      section
    });
    if (this.viewMode === "editor") {
      this.goBackToList();
    }
    if (this.viewMode === "migration") {
      this.viewMode = "list";
    }
    if (this.viewMode === "mcpDetail") {
      this.goBackFromMcpDetail();
    }
    if (this.viewMode === "pluginDetail") {
      this.goBackFromPluginDetail();
    }
    if (this.viewMode === "toolsDetail") {
      this.goBackFromToolDetail();
    }
    this.selectedSection = section;
    this.sectionContextKey.set(section);
    this.storageService.store(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, section, StorageScope.PROFILE, StorageTarget.USER);
    this.updateContentVisibility();
    if (this.isPromptsSection(section)) {
      void this.listWidget.setSection(section);
    }
    if (this.dimension) {
      this.layout(this.dimension);
    }
    this.ensureSectionsListReflectsActiveSection(section);
    if (options?.showMarketplace) {
      if (section === AICustomizationManagementSection.McpServers) {
        this.mcpListWidget?.showBrowseMarketplace();
      } else if (section === AICustomizationManagementSection.Plugins) {
        this.pluginListWidget?.showBrowseMarketplace();
      }
    }
    if (section === AICustomizationManagementSection.McpServers) {
      this.mcpListWidget?.focusSearch();
    } else if (section === AICustomizationManagementSection.Plugins) {
      this.pluginListWidget?.focusSearch();
    } else if (section === AICustomizationManagementSection.Models) {
      this.modelsWidget?.focusSearch();
    } else if (section === AICustomizationManagementSection.Tools) {
      this.toolsListWidget?.focusSearch();
    } else if (section === AICustomizationManagementSection.Automations) {
      this.automationsListWidget?.focus();
    } else {
      this.listWidget?.focusSearch();
    }
  }
  ensureSectionsListReflectsActiveSection(section = this.selectedSection) {
    if (!this.sectionsList) {
      return;
    }
    if (section === void 0) {
      this.sectionsList.setSelection([]);
      this.sectionsList.setFocus([]);
      return;
    }
    const index = this.sections.findIndex((s) => s.id === section);
    if (index < 0) {
      return;
    }
    const selection = this.sectionsList.getSelection();
    if (selection.length !== 1 || selection[0] !== index) {
      this.sectionsList.setSelection([index]);
    }
    const focus = this.sectionsList.getFocus();
    if (focus.length !== 1 || focus[0] !== index) {
      this.sectionsList.setFocus([index]);
    }
  }
  updateContentVisibility() {
    const isEditorMode = this.viewMode === "editor";
    const isMigrationMode = this.viewMode === "migration";
    const isMcpDetailMode = this.viewMode === "mcpDetail";
    const isPluginDetailMode = this.viewMode === "pluginDetail";
    const isToolsDetailMode = this.viewMode === "toolsDetail";
    const isDetailMode = isMcpDetailMode || isPluginDetailMode || isToolsDetailMode;
    const isWelcome = this.selectedSection === void 0;
    const isPromptsSection = this.selectedSection !== void 0 && this.isPromptsSection(this.selectedSection);
    const isModelsSection = this.selectedSection === AICustomizationManagementSection.Models;
    const isMcpSection = this.selectedSection === AICustomizationManagementSection.McpServers;
    const isPluginsSection = this.selectedSection === AICustomizationManagementSection.Plugins;
    const isToolsSection = this.selectedSection === AICustomizationManagementSection.Tools;
    const isAutomationsSection = this.selectedSection === AICustomizationManagementSection.Automations;
    if (this.welcomePage) {
      this.welcomePage.container.style.display = isWelcome && !isEditorMode && !isMigrationMode && !isDetailMode ? "" : "none";
    }
    if (this.promptsContentContainer) {
      this.promptsContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isPromptsSection ? "" : "none";
    }
    if (this.migrationContentContainer) {
      this.migrationContentContainer.style.display = isMigrationMode ? "" : "none";
    }
    if (this.modelsContentContainer) {
      this.modelsContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isModelsSection ? "" : "none";
    }
    if (this.mcpContentContainer) {
      this.mcpContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isMcpSection ? "" : "none";
    }
    if (this.mcpDetailContainer) {
      this.mcpDetailContainer.style.display = isMcpDetailMode ? "" : "none";
    }
    if (this.pluginContentContainer) {
      this.pluginContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isPluginsSection ? "" : "none";
    }
    this.updateAutomationsContentVisibility(!isEditorMode && !isMigrationMode && !isDetailMode && isAutomationsSection);
    if (this.pluginDetailContainer) {
      this.pluginDetailContainer.style.display = isPluginDetailMode ? "" : "none";
    }
    if (this.toolsContentContainer) {
      this.toolsContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isToolsSection ? "" : "none";
    }
    if (this.toolsDetailContainer) {
      this.toolsDetailContainer.style.display = isToolsDetailMode ? "" : "none";
    }
    for (const [section, container] of this.contributedSectionContainers) {
      const visible = !isEditorMode && !isMigrationMode && !isDetailMode && this.selectedSection === section;
      container.style.display = visible ? "" : "none";
      if (visible) {
        this.ensureContributedSectionWidget(section);
      }
    }
    if (this.editorContentContainer) {
      this.editorContentContainer.style.display = isEditorMode ? "" : "none";
    }
    if (isModelsSection && this.modelsWidget) {
      this.modelsWidget.render();
      if (this.dimension) {
        this.layout(this.dimension);
      }
    }
  }
  ensureContributedSectionWidget(section) {
    const existing = this.contributedSectionWidgets.get(section);
    if (existing) {
      return existing;
    }
    const contribution = aiCustomizationManagementSectionRegistry.get(section, this.harnessService.activeHarness.get());
    const container = this.contributedSectionContainers.get(section);
    if (!contribution || !container) {
      return void 0;
    }
    const widget = contribution.create(this.instantiationService, container);
    this.contributedSectionWidgets.set(section, widget);
    this.editorDisposables.add(widget);
    if (this.dimension) {
      widget.layout?.(this.dimension);
    }
    return widget;
  }
  updateAutomationsContentVisibility(sectionVisible) {
    if (!this.automationsContentContainer) {
      return;
    }
    if (sectionVisible) {
      this.automationsContentContainer.style.display = "";
      this.automationsListWidget?.setVisible(this.isVisible());
    } else {
      this.automationsListWidget?.setVisible(false);
      this.automationsContentContainer.style.display = "none";
    }
  }
  /**
   * Creates a new customization using the AI-guided flow.
   */
  async createNewItemWithAI(type) {
    this.telemetryService.publicLog2("chatCustomizationEditor.createItem", {
      section: this.selectedSection ?? "welcome",
      promptType: type,
      creationMode: "ai",
      target: "workspace"
    });
    if (this.input) {
      this.group.closeEditor(this.input);
    }
    await this.workspaceService.generateCustomization(type);
  }
  /**
   * Creates a new prompt file and opens it in the embedded editor.
   */
  async createNewItemManual(type, target, rootFileName) {
    this.telemetryService.publicLog2("chatCustomizationEditor.createItem", {
      section: this.selectedSection ?? "welcome",
      promptType: type,
      creationMode: "manual",
      target: target === "workspace-root" ? "workspace" : target
    });
    if (target === "workspace-root") {
      const projectRoot = this.workspaceService.getActiveProjectRoot();
      if (!projectRoot) {
        return;
      }
      const override2 = this.selectedSection ? this.harnessService.getActiveDescriptor().sectionOverrides?.get(this.selectedSection) : void 0;
      const fileName = rootFileName ?? override2?.rootFile ?? AGENT_MD_FILENAME;
      const fileUri = URI.joinPath(projectRoot, fileName);
      if (await this.fileService.exists(fileUri)) {
        await this.showEmbeddedEditor(fileUri, fileName, PromptsType.instructions, PromptsStorage.local, true);
      } else {
        await this.fileService.createFile(fileUri);
        await this.showEmbeddedEditor(fileUri, fileName, PromptsType.instructions, PromptsStorage.local, true);
      }
      this.listWidget.refresh();
      return;
    }
    if (type === PromptsType.hook) {
      if (this.workspaceService.isSessionsWindow) {
        await this.instantiationService.invokeFunction(showConfigureHooksQuickPick, {
          openEditor: async (resource) => {
            await this.showEmbeddedEditor(resource, basename(resource), PromptsType.hook, PromptsStorage.local, true);
            return;
          },
          target: Target.GitHubCopilot
        });
      } else {
        await this.instantiationService.invokeFunction(showConfigureHooksQuickPick, {
          openEditor: async (resource) => {
            await this.showEmbeddedEditor(resource, basename(resource), PromptsType.hook, PromptsStorage.local, true);
            return;
          }
        });
      }
      return;
    }
    const sessionResource = this.harnessService.activeSessionResource.get();
    const picker = this.instantiationService.createInstance(CustomizationLocationPicker);
    const targetDir = await picker.resolveTargetDirectoryWithPicker(
      sessionResource,
      type,
      target
    );
    if (targetDir === null) {
      return;
    }
    if (targetDir === void 0) {
      await this.instantiationService.invokeFunction(showNoFoldersDialog, type);
      return;
    }
    const override = this.selectedSection ? this.harnessService.getActiveDescriptor().sectionOverrides?.get(this.selectedSection) : void 0;
    const options = {
      targetFolder: targetDir,
      targetStorage: target === AICustomizationSources.user ? PromptsStorage.user : PromptsStorage.local,
      fileExtension: override?.fileExtension,
      openFile: async (uri) => {
        const isWorkspace = target === AICustomizationSources.local;
        await this.showEmbeddedEditor(uri, basename(uri), type, target, isWorkspace);
        return this.embeddedEditor;
      }
    };
    let commandId;
    switch (type) {
      case PromptsType.prompt:
        commandId = NEW_PROMPT_COMMAND_ID;
        break;
      case PromptsType.instructions:
        commandId = NEW_INSTRUCTIONS_COMMAND_ID;
        break;
      case PromptsType.agent:
        commandId = NEW_AGENT_COMMAND_ID;
        break;
      case PromptsType.skill:
        commandId = NEW_SKILL_COMMAND_ID;
        break;
      default:
        return;
    }
    await this.commandService.executeCommand(commandId, options);
    this.listWidget.refresh();
  }
  updateStyles() {
    this.splitView?.style({ separatorBorder: Color.transparent });
  }
  async setInput(input, options, context, token) {
    this.workspaceService.clearOverrideProjectRoot();
    this.inEditorContextKey.set(true);
    this.sectionContextKey.set(this.selectedSection ?? "");
    input.setSaveHandler(() => this.handleBuiltinSave());
    this.telemetryService.publicLog2("chatCustomizationEditor.opened", {
      section: this.selectedSection ?? "welcome"
    });
    await super.setInput(input, options, context, token);
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
  clearInput() {
    const input = this.input;
    if (input instanceof AICustomizationManagementEditorInput) {
      input.setSaveHandler(void 0);
      input.setDirty(false);
    }
    this.inEditorContextKey.set(false);
    if (this.viewMode === "editor") {
      this.goBackToList();
    }
    if (this.viewMode === "migration") {
      this.viewMode = "list";
    }
    if (this.viewMode === "mcpDetail") {
      this.goBackFromMcpDetail();
    }
    if (this.viewMode === "pluginDetail") {
      this.goBackFromPluginDetail();
    }
    if (this.viewMode === "toolsDetail") {
      this.goBackFromToolDetail();
    }
    this.workspaceService.clearOverrideProjectRoot();
    this.disposeBuiltinEditingSessions();
    super.clearInput();
  }
  setEditorVisible(visible) {
    super.setEditorVisible(visible);
    this.updateAutomationsContentVisibility(this.viewMode === "list" && this.selectedSection === AICustomizationManagementSection.Automations);
    if (visible && this.dimension) {
      this.layout(this.dimension);
    }
  }
  layout(dimension) {
    this.dimension = dimension;
    if (this.container && this.splitView) {
      this.splitViewContainer.style.height = `${dimension.height}px`;
      this.splitView.layout(dimension.width, dimension.height);
    }
    for (const widget of this.contributedSectionWidgets.values()) {
      widget.layout?.(dimension);
    }
    this.migrationSearchInput?.layout();
    this.migrationListScrollable?.scanDomNode();
  }
  focus() {
    super.focus();
    if (this.viewMode === "editor") {
      if (this.editorDisplayMode === "raw") {
        this.embeddedEditor?.focus();
      } else {
        this.editorModeButton?.focus();
      }
      return;
    }
    if (this.viewMode === "migration") {
      this.migrationSearchInput?.focus();
      return;
    }
    if (this.selectedSection === void 0) {
      this.welcomePage?.focus();
      return;
    }
    if (this.selectedSection === AICustomizationManagementSection.McpServers) {
      this.mcpListWidget?.focusSearch();
    } else if (this.selectedSection === AICustomizationManagementSection.Plugins) {
      this.pluginListWidget?.focusSearch();
    } else if (this.selectedSection === AICustomizationManagementSection.Models) {
      this.modelsWidget?.focusSearch();
    } else if (this.selectedSection === AICustomizationManagementSection.Tools) {
      this.toolsListWidget?.focusSearch();
    } else if (this.selectedSection === AICustomizationManagementSection.Automations) {
      this.automationsListWidget?.focus();
    } else if (this.selectedSection && this.contributedSectionContainers.has(this.selectedSection)) {
      this.ensureContributedSectionWidget(this.selectedSection)?.focus?.();
    } else {
      this.listWidget?.focusSearch();
    }
  }
  /**
   * Selects a specific section programmatically.
   */
  selectSectionById(sectionId, options) {
    const index = this.sections.findIndex((s) => s.id === sectionId);
    if (index >= 0) {
      if (this.viewMode === "editor") {
        this.goBackToList();
      }
      if (this.viewMode === "migration") {
        this.viewMode = "list";
      }
      if (this.viewMode === "mcpDetail") {
        this.goBackFromMcpDetail();
      }
      if (this.viewMode === "pluginDetail") {
        this.goBackFromPluginDetail();
      }
      if (this.viewMode === "toolsDetail") {
        this.goBackFromToolDetail();
      }
      this.selectedSection = sectionId;
      this.sectionContextKey.set(sectionId);
      this.storageService.store(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, sectionId, StorageScope.PROFILE, StorageTarget.USER);
      this.updateContentVisibility();
      if (this.isPromptsSection(sectionId)) {
        void this.listWidget.setSection(sectionId);
      }
      if (this.dimension) {
        this.layout(this.dimension);
      }
      this.ensureSectionsListReflectsActiveSection(sectionId);
      if (options?.showMarketplace) {
        if (sectionId === AICustomizationManagementSection.McpServers) {
          this.mcpListWidget?.showBrowseMarketplace();
        } else if (sectionId === AICustomizationManagementSection.Plugins) {
          this.pluginListWidget?.showBrowseMarketplace();
        }
      }
    }
  }
  /**
   * Moves focus to a specific automation in the Automations section.
   */
  focusAutomation(automationId) {
    this.automationsListWidget?.focusAutomation(automationId);
  }
  showPromptMigrationPage() {
    if (!this.isPromptMigrationEnabled()) {
      return;
    }
    if (this.viewMode === "editor") {
      this.goBackToList();
    }
    if (this.viewMode === "mcpDetail") {
      this.goBackFromMcpDetail();
    }
    if (this.viewMode === "pluginDetail") {
      this.goBackFromPluginDetail();
    }
    if (this.viewMode === "toolsDetail") {
      this.goBackFromToolDetail();
    }
    this.selectedSection = void 0;
    this.sectionContextKey.set("");
    this.viewMode = "migration";
    this.ensureSectionsListReflectsActiveSection(void 0);
    this.renderPromptMigrationPage();
    this.updateContentVisibility();
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
  /**
   * Refreshes the list widget.
   */
  refreshList() {
    this.listWidget.refresh();
  }
  /**
   * Scrolls the active list widget so the last item is visible.
   */
  revealLastItem() {
    if (this.selectedSection === AICustomizationManagementSection.McpServers) {
      this.mcpListWidget?.revealLastItem();
    } else if (this.selectedSection === AICustomizationManagementSection.Plugins) {
      this.pluginListWidget?.revealLastItem();
    } else {
      this.listWidget.revealLastItem();
    }
  }
  /**
   * Generates a debug report for the current section.
   */
  async generateDebugReport() {
    return this.listWidget.generateDebugReport();
  }
  //#region Embedded Editor
  createEmbeddedEditor() {
    if (!this.editorContentContainer) {
      return;
    }
    const editorHeader = DOM.append(this.editorContentContainer, $(".editor-header"));
    this.editorActionButton = DOM.append(editorHeader, $("button.editor-back-button"));
    this.editorActionButton.setAttribute("aria-label", localize("backToList", "Back to list"));
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), this.editorActionButton, localize("backToListTooltip", "Back to list")));
    this.editorActionButtonIcon = DOM.append(this.editorActionButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}.editor-action-button-icon`));
    this.editorActionButtonIcon.setAttribute("aria-hidden", "true");
    this.editorDisposables.add(DOM.addDisposableListener(this.editorActionButton, "click", () => {
      void this.handleEditorActionButton().catch((error) => {
        console.error("Failed to handle editor back action:", error);
        this.notificationService.error(localize("editorActionButtonFailed", "Failed to finish the prompt action."));
      });
    }));
    const itemInfo = DOM.append(editorHeader, $(".editor-item-info"));
    this.editorItemNameElement = DOM.append(itemInfo, $(".editor-item-name"));
    this.editorItemPathElement = DOM.append(itemInfo, $(".editor-item-path"));
    this.editorModeButton = DOM.append(editorHeader, $("button.editor-mode-button"));
    this.editorModeButton.type = "button";
    this.editorModeButton.setAttribute("aria-pressed", "false");
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), this.editorModeButton, () => this.getEditorModeButtonTooltip()));
    this.editorDisposables.add(DOM.addDisposableListener(this.editorModeButton, "click", () => {
      this.toggleEditorDisplayMode();
    }));
    this.editorSaveIndicator = DOM.append(editorHeader, $(".editor-save-indicator"));
    this.editorPreviewContainer = DOM.append(this.editorContentContainer, $(".editor-preview-container"));
    this.editorPreviewScrollContainer = DOM.append(this.editorPreviewContainer, $(".editor-preview-scroll-container"));
    this.editorPreviewScrollContainer.setAttribute("role", "region");
    this.editorPreviewScrollContainer.setAttribute("aria-label", localize("customizationPreviewAriaLabel", "Customization preview"));
    this.editorPreviewIssuesContainer = DOM.append(this.editorPreviewScrollContainer, $(".editor-preview-issues"));
    const frontMatterSection = DOM.append(this.editorPreviewScrollContainer, $(".editor-preview-section.editor-preview-frontmatter-section"));
    this.editorPreviewFrontMatterContainer = DOM.append(frontMatterSection, $(".editor-preview-frontmatter-list"));
    const bodySection = DOM.append(this.editorPreviewScrollContainer, $(".editor-preview-section.editor-preview-body-section"));
    this.editorPreviewBodyContainer = DOM.append(bodySection, $(".editor-preview-body-content"));
    this.embeddedEditorContainer = DOM.append(this.editorContentContainer, $(".embedded-editor-container"));
    const overflowWidgetsDomNode = DOM.append(this.editorContentContainer, $(".embedded-editor-overflow-widgets.monaco-editor"));
    this.editorDisposables.add(toDisposable(() => overflowWidgetsDomNode.remove()));
    this.embeddedEditor = this.editorDisposables.add(this.instantiationService.createInstance(
      CodeEditorWidget,
      this.embeddedEditorContainer,
      {
        ...getSimpleEditorOptions(this.configurationService),
        readOnly: false,
        minimap: { enabled: false },
        lineNumbers: "on",
        wordWrap: "on",
        scrollBeyondLastLine: false,
        automaticLayout: false,
        folding: true,
        renderLineHighlight: "all",
        scrollbar: { vertical: "auto", horizontal: "auto" },
        overflowWidgetsDomNode
      },
      { isSimpleWidget: false }
    ));
    this.updateEditorDisplayMode();
  }
  async showEmbeddedEditor(uri, displayName, promptType, source, isWorkspaceFile = false, isReadOnly = false) {
    this.editorReturnViewMode = this.viewMode === "migration" ? "migration" : "list";
    this.currentModelRef?.dispose();
    this.currentModelRef = void 0;
    this.editorModelChangeDisposables.clear();
    this.editorPreviewDisposables.clear();
    this.editorPreviewRenderScheduler.cancel();
    this.currentEditingUri = uri;
    this.currentEditingProjectRoot = isWorkspaceFile ? this.workspaceService.getActiveProjectRoot() : void 0;
    this.currentEditingSource = source;
    this.currentEditingPromptType = promptType;
    this.currentEditingReadOnly = isReadOnly;
    this.editorDisplayMode = this.isStructuredPreviewSupported(promptType) ? "preview" : "raw";
    this.viewMode = "editor";
    this.editorItemNameElement.textContent = displayName;
    this.editorItemPathElement.textContent = basename(uri);
    this._editorContentChanged = false;
    this.resetEditorSaveIndicator();
    this.updateEditorActionButton();
    this.updateEditorDisplayMode();
    this.updateContentVisibility();
    try {
      if (source === AICustomizationSources.builtin && (promptType === PromptsType.prompt || promptType === PromptsType.skill)) {
        const session = await this.getOrCreateBuiltinEditingSession(uri);
        if (!isEqual(this.currentEditingUri, uri)) {
          return;
        }
        this.embeddedEditor.setModel(session.model);
        this.embeddedEditor.updateOptions({ readOnly: false });
        this._editorContentChanged = session.model.getValue() !== session.originalContent;
        this.renderCurrentEditorPreview();
        this.updateEditorActionButton();
        if (this.dimension) {
          this.layout(this.dimension);
        }
        if (this.editorDisplayMode === "raw") {
          this.embeddedEditor.focus();
        } else {
          this.editorModeButton?.focus();
        }
        this.editorModelChangeDisposables.add(session.model.onDidChangeContent(() => {
          this._editorContentChanged = session.model.getValue() !== session.originalContent;
          this.scheduleCurrentEditorPreviewRender();
          this.updateEditorActionButton();
        }));
        return;
      }
      const ref = await this.textModelService.createModelReference(uri);
      if (!isEqual(this.currentEditingUri, uri)) {
        ref.dispose();
        return;
      }
      this.currentModelRef = ref;
      this.embeddedEditor.setModel(ref.object.textEditorModel);
      this.embeddedEditor.updateOptions({ readOnly: isReadOnly });
      this.renderCurrentEditorPreview();
      if (this.dimension) {
        this.layout(this.dimension);
      }
      if (this.editorDisplayMode === "raw") {
        this.embeddedEditor.focus();
      } else {
        this.editorModeButton?.focus();
      }
      this._editorContentChanged = this.workingCopyService.isDirty(uri);
      this.editorModelChangeDisposables.add(ref.object.textEditorModel.onDidChangeContent(() => {
        this._editorContentChanged = true;
        this.scheduleCurrentEditorPreviewRender();
        this.resetEditorSaveIndicator();
      }));
      this.editorModelChangeDisposables.add(this.workingCopyService.onDidSave((e) => {
        if (isEqual(e.workingCopy.resource, uri)) {
          this._editorContentChanged = this.workingCopyService.isDirty(uri);
          this.editorSaveIndicator.className = "editor-save-indicator visible saved";
          this.editorSaveIndicator.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
          this.editorSaveIndicator.title = localize("saved", "Saved");
          this.editorSaveIndicator.setAttribute("aria-label", localize("saved", "Saved"));
          status(localize("saved", "Saved"));
        }
      }));
    } catch (error) {
      console.error("Failed to load model for embedded editor:", error);
      if (isEqual(this.currentEditingUri, uri)) {
        this.goBackToList();
      }
    }
  }
  goBackToList() {
    const returnViewMode = this.editorReturnViewMode;
    this.editorReturnViewMode = "list";
    const fileUri = this.currentEditingUri;
    const backgroundSaveRequest = this.createExistingCustomizationSaveRequest();
    if (backgroundSaveRequest) {
      this.telemetryService.publicLog2("chatCustomizationEditor.saveItem", {
        promptType: this.currentEditingPromptType ?? "",
        storage: String(this.currentEditingSource ?? ""),
        saveTarget: "existing"
      });
    }
    if (fileUri && this.currentEditingSource === AICustomizationSources.builtin) {
      this.disposeBuiltinEditingSession(fileUri);
    }
    this.currentModelRef?.dispose();
    this.currentModelRef = void 0;
    this.currentEditingUri = void 0;
    this.currentEditingProjectRoot = void 0;
    this.currentEditingSource = void 0;
    this.currentEditingPromptType = void 0;
    this.currentEditingReadOnly = false;
    this.editorDisplayMode = "preview";
    this._editorContentChanged = false;
    this.editorModelChangeDisposables.clear();
    this.editorPreviewRenderScheduler.cancel();
    this.clearEditorPreview();
    this.resetEditorSaveIndicator();
    this.updateEditorActionButton();
    this.updateEditorDisplayMode();
    this.embeddedEditor?.setModel(null);
    this.viewMode = returnViewMode;
    this.updateContentVisibility();
    if (returnViewMode === "migration") {
      this.renderPromptMigrationPage();
      void this.refreshPromptMigrationInfo();
    } else {
      void this.listWidget?.refresh();
    }
    if (this.dimension) {
      this.layout(this.dimension);
    }
    if (returnViewMode === "migration") {
      this.migrationSearchInput?.focus();
    } else {
      this.listWidget?.focusSearch();
    }
    if (backgroundSaveRequest) {
      const saveRequest = backgroundSaveRequest;
      void this.saveExistingCustomization(saveRequest).catch((error) => {
        console.error("Failed to save customization changes on exit:", error);
        this.notificationService.warn(localize("saveCustomizationOnExitFailed", "Could not save changes to {0}.", basename(saveRequest.fileUri)));
      });
    }
  }
  //#endregion
  async getOrCreateBuiltinEditingSession(uri) {
    const key = uri.toString();
    const existing = this.builtinEditingSessions.get(key);
    if (existing && !existing.model.isDisposed()) {
      return existing;
    }
    const ref = await this.textModelService.createModelReference(uri);
    try {
      const session = {
        model: this.modelService.createModel(
          createTextBufferFactoryFromSnapshot(ref.object.textEditorModel.createSnapshot()),
          { languageId: ref.object.textEditorModel.getLanguageId(), onDidChange: Event.None },
          URI.from({ scheme: "ai-customization-builtin", path: uri.path, query: generateUuid() }),
          false
        ),
        originalContent: ref.object.textEditorModel.getValue()
      };
      this.builtinEditingSessions.set(key, session);
      return session;
    } finally {
      ref.dispose();
    }
  }
  createBuiltinPromptSaveRequest(target) {
    const sourceUri = this.currentEditingUri;
    const promptType = this.currentEditingPromptType;
    if (!sourceUri || this.currentEditingSource !== AICustomizationSources.builtin || promptType !== PromptsType.prompt && promptType !== PromptsType.skill || !target.folder || target.target === "cancel") {
      return;
    }
    const session = this.builtinEditingSessions.get(sourceUri.toString());
    if (!session || !this._editorContentChanged) {
      return;
    }
    return {
      target: target.target,
      folder: target.folder,
      sourceUri,
      content: session.model.getValue(),
      promptType,
      projectRoot: target.target === "workspace" ? this.workspaceService.getActiveProjectRoot() : void 0
    };
  }
  createExistingCustomizationSaveRequest() {
    if (!this._editorContentChanged || this.currentEditingSource === AICustomizationSources.builtin || !this.currentEditingUri) {
      return void 0;
    }
    const model = this.currentModelRef?.object.textEditorModel;
    if (!model) {
      return void 0;
    }
    return {
      fileUri: this.currentEditingUri,
      content: model.getValue(),
      projectRoot: this.currentEditingProjectRoot
    };
  }
  async saveBuiltinPromptCopy(request) {
    let targetUri;
    if (request.promptType === PromptsType.skill) {
      const skillFolderName = basename(dirname(request.sourceUri));
      targetUri = URI.joinPath(request.folder, skillFolderName, basename(request.sourceUri));
    } else {
      targetUri = URI.joinPath(request.folder, basename(request.sourceUri));
    }
    await this.fileService.createFolder(dirname(targetUri));
    await this.fileService.writeFile(targetUri, VSBuffer.fromString(request.content));
    if (request.target === "workspace" && request.projectRoot) {
      await this.workspaceService.commitFiles(request.projectRoot, [targetUri]);
    }
  }
  async saveExistingCustomization(request) {
    await this.fileService.writeFile(request.fileUri, VSBuffer.fromString(request.content));
    if (request.projectRoot) {
      await this.workspaceService.commitFiles(request.projectRoot, [request.fileUri]);
    }
  }
  async pickBuiltinPromptSaveTarget() {
    const items = [];
    const promptType = this.currentEditingPromptType ?? PromptsType.prompt;
    const workspaceFolder = resolveWorkspaceTargetDirectory(this.workspaceService, promptType);
    if (workspaceFolder) {
      items.push({
        label: localize("workspaceSaveTarget", "Workspace"),
        description: this.labelService.getUriLabel(workspaceFolder, { relative: true }),
        target: "workspace",
        folder: workspaceFolder
      });
    }
    const userFolder = await resolveUserTargetDirectory(this.promptsService, promptType);
    if (userFolder) {
      items.push({
        label: localize("userSaveTarget", "User"),
        description: this.labelService.getUriLabel(userFolder, { relative: true }),
        target: "user",
        folder: userFolder
      });
    }
    items.push({
      label: localize("cancelSaveTarget", "Cancel"),
      target: "cancel"
    });
    return this.quickInputService.pick(items, {
      canPickMany: false,
      placeHolder: localize("saveBuiltinCopyPlaceholder", "Select Workspace, User, or Cancel"),
      matchOnDescription: true
    });
  }
  async handleEditorActionButton() {
    if (this.editorActionButtonInProgress) {
      return;
    }
    this.editorActionButtonInProgress = true;
    this.updateEditorActionButton();
    let backgroundSaveRequest;
    try {
      if (this.shouldShowBuiltinSaveAction()) {
        const selection = await this.pickBuiltinPromptSaveTarget();
        if (!selection || selection.target === "cancel") {
          return;
        }
        backgroundSaveRequest = this.createBuiltinPromptSaveRequest(selection);
        if (backgroundSaveRequest) {
          this.telemetryService.publicLog2("chatCustomizationEditor.saveItem", {
            promptType: this.currentEditingPromptType ?? "",
            storage: String(this.currentEditingSource ?? ""),
            saveTarget: selection.target
          });
        }
      }
      this.goBackToList();
      if (backgroundSaveRequest) {
        const saveRequest = backgroundSaveRequest;
        void this.saveBuiltinPromptCopy(saveRequest).then(() => {
          void this.listWidget?.refresh();
        }, (error) => {
          console.error("Failed to save built-in override:", error);
          this.notificationService.warn(saveRequest.target === "workspace" ? localize("saveBuiltinCopyFailedWorkspace", "Could not save the override to the workspace.") : localize("saveBuiltinCopyFailedUser", "Could not save the override to your user folder."));
        });
      }
    } finally {
      this.editorActionButtonInProgress = false;
      this.updateEditorActionButton();
    }
  }
  updateEditorActionButton() {
    this.updateInputDirtyState();
    if (!this.editorActionButton || !this.editorActionButtonIcon) {
      return;
    }
    const shouldShowBuiltinSaveAction = this.shouldShowBuiltinSaveAction();
    this.editorActionButtonIcon.className = `codicon codicon-${shouldShowBuiltinSaveAction ? Codicon.save.id : Codicon.arrowLeft.id} editor-action-button-icon`;
    this.editorActionButton.disabled = this.editorActionButtonInProgress;
    this.editorActionButton.setAttribute("aria-label", shouldShowBuiltinSaveAction ? localize("saveBuiltinCopyAndChooseLocation", "Save override") : this.editorReturnViewMode === "migration" ? localize("backToPromptMigration", "Back to Migrate Prompt Files") : localize("backToList", "Back to list"));
    this.editorActionButton.title = shouldShowBuiltinSaveAction ? localize("saveBuiltinCopyAndChooseLocationTooltip", "Save override (choose Workspace, User, or Cancel)") : this.editorReturnViewMode === "migration" ? localize("backToPromptMigrationTooltip", "Back to Migrate Prompt Files") : localize("backToList", "Back to list");
  }
  shouldShowBuiltinSaveAction() {
    return this._editorContentChanged && this.currentEditingSource === AICustomizationSources.builtin && (this.currentEditingPromptType === PromptsType.prompt || this.currentEditingPromptType === PromptsType.skill);
  }
  updateInputDirtyState() {
    const input = this.input;
    if (input instanceof AICustomizationManagementEditorInput) {
      input.setDirty(this.shouldShowBuiltinSaveAction());
    }
  }
  async handleBuiltinSave() {
    if (!this.shouldShowBuiltinSaveAction()) {
      return false;
    }
    const target = await this.pickBuiltinPromptSaveTarget();
    if (!target || target.target === "cancel") {
      return false;
    }
    const saveRequest = this.createBuiltinPromptSaveRequest(target);
    if (!saveRequest) {
      return false;
    }
    try {
      await this.saveBuiltinPromptCopy(saveRequest);
      this.telemetryService.publicLog2("chatCustomizationEditor.saveItem", {
        promptType: this.currentEditingPromptType ?? "",
        storage: String(this.currentEditingSource ?? ""),
        saveTarget: target.target
      });
      this._editorContentChanged = false;
      this.updateEditorActionButton();
      return true;
    } catch (error) {
      console.error("Failed to save built-in override:", error);
      this.notificationService.warn(target.target === "workspace" ? localize("saveBuiltinCopyFailedWorkspace", "Could not save the override to the workspace.") : localize("saveBuiltinCopyFailedUser", "Could not save the override to your user folder."));
      return false;
    }
  }
  resetEditorSaveIndicator() {
    this.editorSaveIndicator.className = "editor-save-indicator";
    this.editorSaveIndicator.title = "";
    this.editorSaveIndicator.removeAttribute("aria-label");
  }
  isStructuredPreviewSupported(promptType) {
    if (this.configurationService.getValue(ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled) !== true) {
      return false;
    }
    return promptType === PromptsType.agent || promptType === PromptsType.skill || promptType === PromptsType.instructions || promptType === PromptsType.prompt;
  }
  onStructuredPreviewSettingChanged() {
    if (this.viewMode !== "editor") {
      return;
    }
    const supportsStructuredPreview = this.isStructuredPreviewSupported(this.currentEditingPromptType);
    if (!supportsStructuredPreview) {
      this.editorDisplayMode = "raw";
      this.editorPreviewRenderScheduler.cancel();
      this.clearEditorPreview();
    } else if (this.editorDisplayMode === "preview") {
      this.editorPreviewRenderScheduler.schedule();
    }
    this.updateEditorDisplayMode();
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
  getCurrentEditingModel() {
    if (!this.currentEditingUri) {
      return void 0;
    }
    if (this.currentEditingSource === AICustomizationSources.builtin) {
      return this.builtinEditingSessions.get(this.currentEditingUri.toString())?.model;
    }
    return this.currentModelRef?.object.textEditorModel;
  }
  toggleEditorDisplayMode() {
    if (!this.isStructuredPreviewSupported(this.currentEditingPromptType)) {
      return;
    }
    this.editorDisplayMode = this.editorDisplayMode === "preview" ? "raw" : "preview";
    if (this.editorDisplayMode === "preview") {
      this.editorPreviewRenderScheduler.cancel();
      this.renderCurrentEditorPreview();
    }
    this.updateEditorDisplayMode();
    if (this.dimension) {
      this.layout(this.dimension);
    }
    if (this.editorDisplayMode === "raw") {
      this.embeddedEditor?.focus();
    } else {
      this.editorModeButton?.focus();
    }
  }
  updateEditorDisplayMode() {
    const supportsStructuredPreview = this.isStructuredPreviewSupported(this.currentEditingPromptType);
    const showPreview = supportsStructuredPreview && this.editorDisplayMode === "preview";
    if (this.editorModeButton) {
      this.editorModeButton.style.display = supportsStructuredPreview ? "" : "none";
      this.editorModeButton.textContent = this.getEditorModeButtonLabel();
      this.editorModeButton.setAttribute("aria-label", this.getEditorModeButtonTooltip());
      this.editorModeButton.setAttribute("aria-pressed", String(this.editorDisplayMode === "raw"));
      this.editorModeButton.title = this.getEditorModeButtonTooltip();
    }
    if (this.editorPreviewContainer) {
      this.editorPreviewContainer.style.display = showPreview ? "" : "none";
    }
    if (this.embeddedEditorContainer) {
      this.embeddedEditorContainer.style.display = showPreview ? "none" : "";
    }
  }
  getEditorModeButtonLabel() {
    if (!this.isStructuredPreviewSupported(this.currentEditingPromptType)) {
      return "";
    }
    if (this.editorDisplayMode === "raw") {
      return localize("editorPreviewButtonLabel", "Preview");
    }
    return this.canEditCurrentRaw() ? localize("editorEditRawButtonLabel", "Edit") : localize("editorViewRawButtonLabel", "View Raw");
  }
  getEditorModeButtonTooltip() {
    if (!this.isStructuredPreviewSupported(this.currentEditingPromptType)) {
      return "";
    }
    if (this.editorDisplayMode === "raw") {
      return localize("editorPreviewButtonTooltip", "Show structured preview");
    }
    return this.canEditCurrentRaw() ? localize("editorEditRawButtonTooltip", "Edit the raw markdown file") : localize("editorViewRawButtonTooltip", "Show the raw markdown file");
  }
  canEditCurrentRaw() {
    const promptType = this.currentEditingPromptType;
    if (!promptType) {
      return false;
    }
    return this.currentEditingSource === AICustomizationSources.builtin && (promptType === PromptsType.prompt || promptType === PromptsType.skill) || !this.currentEditingReadOnly;
  }
  scheduleCurrentEditorPreviewRender() {
    if (this.editorDisplayMode !== "preview") {
      return;
    }
    this.editorPreviewRenderScheduler.schedule();
  }
  renderCurrentEditorPreview() {
    const model = this.getCurrentEditingModel();
    const promptType = this.currentEditingPromptType;
    if (!model || !promptType || this.editorDisplayMode !== "preview" || !this.isStructuredPreviewSupported(promptType)) {
      this.clearEditorPreview();
      return;
    }
    const parsedPromptFile = this.promptsService.getParsedPromptFile(model);
    this.renderEditorPreview(parsedPromptFile, promptType);
  }
  renderEditorPreview(parsedPromptFile, promptType) {
    if (!this.editorPreviewIssuesContainer || !this.editorPreviewFrontMatterContainer || !this.editorPreviewBodyContainer) {
      return;
    }
    this.editorPreviewDisposables.clear();
    DOM.clearNode(this.editorPreviewIssuesContainer);
    DOM.clearNode(this.editorPreviewFrontMatterContainer);
    DOM.clearNode(this.editorPreviewBodyContainer);
    const target = getTarget(promptType, parsedPromptFile.header ?? parsedPromptFile.uri);
    this.renderPreviewIssues(parsedPromptFile);
    this.renderPreviewFrontMatter(parsedPromptFile, promptType, target);
    this.renderPreviewBody(parsedPromptFile);
  }
  renderPreviewIssues(parsedPromptFile) {
    if (!this.editorPreviewIssuesContainer || !parsedPromptFile.header?.errors.length) {
      return;
    }
    const issuesContainer = DOM.append(this.editorPreviewIssuesContainer, $(".editor-preview-issues-box"));
    DOM.append(issuesContainer, $("div.editor-preview-issues-title")).textContent = localize("previewHeaderIssuesTitle", "Header issues detected");
    DOM.append(issuesContainer, $("div.editor-preview-issues-description")).textContent = localize("previewHeaderIssuesDescription", "Switch to raw view to fix invalid or unsupported metadata entries.");
    const list = DOM.append(issuesContainer, $("ul.editor-preview-issues-list"));
    for (const error of parsedPromptFile.header.errors) {
      DOM.append(list, $("li.editor-preview-issues-item")).textContent = error.message;
    }
  }
  renderPreviewFrontMatter(parsedPromptFile, promptType, target) {
    if (!this.editorPreviewFrontMatterContainer) {
      return;
    }
    const attributes = parsedPromptFile.header?.attributes ?? [];
    if (!attributes.length) {
      DOM.append(this.editorPreviewFrontMatterContainer, $("div.editor-preview-empty-state")).textContent = localize("previewNoFrontMatter", "No metadata found in this file.");
      return;
    }
    for (const attribute of attributes) {
      this.renderPreviewAttribute(attribute, promptType, target);
    }
  }
  renderPreviewAttribute(attribute, promptType, target) {
    if (!this.editorPreviewFrontMatterContainer) {
      return;
    }
    const row = DOM.append(this.editorPreviewFrontMatterContainer, $(".editor-preview-row"));
    const header = DOM.append(row, $(".editor-preview-row-header"));
    DOM.append(header, $("div.editor-preview-row-key")).textContent = attribute.key;
    const helpButton = DOM.append(header, $("button.editor-preview-row-help"));
    helpButton.type = "button";
    helpButton.setAttribute("aria-label", localize("previewFieldHelpAriaLabel", "Show help for '{0}'", attribute.key));
    const helpIcon = DOM.append(helpButton, $("span.editor-preview-row-help-icon"));
    helpIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
    helpIcon.setAttribute("aria-hidden", "true");
    const description = getAttributeDefinition(attribute.key, promptType, target)?.description ?? localize("previewUnknownFieldDescription", "Custom metadata field `{0}`.", attribute.key);
    const helpHover = this.editorPreviewDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), helpButton, {
      markdown: new MarkdownString(description),
      markdownNotSupportedFallback: description
    }));
    this.editorPreviewDisposables.add(DOM.addDisposableListener(helpButton, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      helpHover.show(true);
    }));
    const valueElement = DOM.append(row, $("div.editor-preview-row-value"));
    const valueText = this.stringifyPreviewValue(attribute.value);
    valueElement.textContent = valueText;
    valueElement.classList.toggle("multiline", valueText.includes("\n"));
  }
  renderPreviewBody(parsedPromptFile) {
    if (!this.editorPreviewBodyContainer) {
      return;
    }
    const bodyContent = parsedPromptFile.body?.getContent() ?? "";
    if (!bodyContent.trim()) {
      DOM.append(this.editorPreviewBodyContainer, $("div.editor-preview-empty-state")).textContent = localize("previewNoBody", "No markdown body found in this file.");
      return;
    }
    const markdown = new MarkdownString(bodyContent, { supportThemeIcons: true });
    markdown.baseUri = parsedPromptFile.uri;
    const renderedMarkdown = this.editorPreviewDisposables.add(this.markdownRendererService.render(markdown));
    this.editorPreviewBodyContainer.appendChild(renderedMarkdown.element);
  }
  stringifyPreviewValue(value) {
    switch (value.type) {
      case "scalar":
        return value.value;
      case "sequence":
        if (value.items.every((item) => item.type === "scalar")) {
          return value.items.map((item) => item.value).join("\n");
        }
        return JSON.stringify(this.toPreviewObject(value), null, 2);
      case "map":
        return JSON.stringify(this.toPreviewObject(value), null, 2);
    }
  }
  toPreviewObject(value) {
    switch (value.type) {
      case "scalar":
        return value.value;
      case "sequence":
        return value.items.map((item) => this.toPreviewObject(item));
      case "map": {
        const entries = {};
        for (const property of value.properties) {
          entries[property.key.value] = this.toPreviewObject(property.value);
        }
        return entries;
      }
    }
  }
  clearEditorPreview() {
    this.editorPreviewRenderScheduler.cancel();
    this.editorPreviewDisposables.clear();
    if (this.editorPreviewIssuesContainer) {
      DOM.clearNode(this.editorPreviewIssuesContainer);
    }
    if (this.editorPreviewFrontMatterContainer) {
      DOM.clearNode(this.editorPreviewFrontMatterContainer);
    }
    if (this.editorPreviewBodyContainer) {
      DOM.clearNode(this.editorPreviewBodyContainer);
    }
  }
  disposeBuiltinEditingSessions() {
    for (const session of this.builtinEditingSessions.values()) {
      session.model.dispose();
    }
    this.builtinEditingSessions.clear();
  }
  disposeBuiltinEditingSession(uri) {
    const key = uri.toString();
    const session = this.builtinEditingSessions.get(key);
    if (!session) {
      return;
    }
    session.model.dispose();
    this.builtinEditingSessions.delete(key);
  }
  //#region Embedded MCP Server Detail
  createEmbeddedMcpDetail() {
    if (!this.mcpDetailContainer) {
      return;
    }
    const detailBody = DOM.append(this.mcpDetailContainer, $(".mcp-detail-editor-container"));
    this.embeddedMcpDetail = this.editorDisposables.add(this.instantiationService.createInstance(EmbeddedMcpServerDetail, detailBody));
    const backButton = DOM.append(this.embeddedMcpDetail.leadingSlot, $("button.editor-back-button"));
    backButton.setAttribute("type", "button");
    backButton.setAttribute("aria-label", localize("backToMcpList", "Back to MCP servers"));
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), backButton, localize("backToMcpListTooltip", "Back to MCP servers")));
    const backIconEl = DOM.append(backButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}`));
    backIconEl.setAttribute("aria-hidden", "true");
    this.editorDisposables.add(DOM.addDisposableListener(backButton, "click", () => {
      this.goBackFromMcpDetail();
    }));
  }
  async showEmbeddedMcpDetail(server) {
    if (!this.embeddedMcpDetail) {
      return;
    }
    this.viewMode = "mcpDetail";
    this.updateContentVisibility();
    this.mcpDetailDisposables.clear();
    this.embeddedMcpDetail.setInput(server);
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
  goBackFromMcpDetail() {
    this.mcpDetailDisposables.clear();
    this.embeddedMcpDetail?.clearInput();
    this.viewMode = "list";
    this.updateContentVisibility();
    if (this.dimension) {
      this.layout(this.dimension);
    }
    this.mcpListWidget?.focusSearch();
  }
  //#endregion
  //#region Embedded Plugin Detail
  createEmbeddedPluginDetail() {
    if (!this.pluginDetailContainer) {
      return;
    }
    const detailBody = DOM.append(this.pluginDetailContainer, $(".plugin-detail-editor-container"));
    this.embeddedPluginDetail = this.editorDisposables.add(this.instantiationService.createInstance(EmbeddedAgentPluginDetail, detailBody));
    const backButton = DOM.append(this.embeddedPluginDetail.leadingSlot, $("button.editor-back-button"));
    backButton.setAttribute("type", "button");
    backButton.setAttribute("aria-label", localize("backToPluginList", "Back to plugins"));
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), backButton, localize("backToPluginListTooltip", "Back to plugins")));
    const backIconEl = DOM.append(backButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}`));
    backIconEl.setAttribute("aria-hidden", "true");
    this.editorDisposables.add(DOM.addDisposableListener(backButton, "click", () => {
      this.goBackFromPluginDetail();
    }));
  }
  async showEmbeddedPluginDetail(item) {
    if (!this.embeddedPluginDetail) {
      return;
    }
    this.viewMode = "pluginDetail";
    this.updateContentVisibility();
    this.pluginDetailDisposables.clear();
    this.embeddedPluginDetail.setInput(item);
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
  /**
   * Public method to show a plugin detail from any section (e.g. from "Show Plugin" context menu).
   * Saves the current section so the back button returns the user to it.
   */
  async showPluginDetail(item) {
    if (this.selectedSection !== AICustomizationManagementSection.Plugins) {
      this.pluginDetailReturnSection = this.selectedSection ?? AICustomizationManagementSection.Agents;
    }
    await this.showEmbeddedPluginDetail(item);
  }
  goBackFromPluginDetail() {
    this.pluginDetailDisposables.clear();
    this.embeddedPluginDetail?.clearInput();
    const returnSection = this.pluginDetailReturnSection;
    this.pluginDetailReturnSection = void 0;
    if (returnSection) {
      this.viewMode = "list";
      this.updateContentVisibility();
      this.selectSection(returnSection);
    } else {
      this.viewMode = "list";
      this.updateContentVisibility();
      this.pluginListWidget?.focusSearch();
    }
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
  //#endregion
  //#region Embedded Tool Extension Detail
  createEmbeddedToolDetail() {
    if (!this.toolsDetailContainer) {
      return;
    }
    const detailBody = DOM.append(this.toolsDetailContainer, $(".tools-detail-editor-container"));
    this.embeddedToolDetail = this.editorDisposables.add(this.instantiationService.createInstance(EmbeddedExtensionToolsDetail, detailBody));
    const backButton = DOM.append(this.embeddedToolDetail.leadingSlot, $("button.editor-back-button"));
    backButton.setAttribute("type", "button");
    backButton.setAttribute("aria-label", localize("backToToolsList", "Back to tools"));
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), backButton, localize("backToToolsListTooltip", "Back to tools")));
    const backIconEl = DOM.append(backButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}`));
    backIconEl.setAttribute("aria-hidden", "true");
    this.editorDisposables.add(DOM.addDisposableListener(backButton, "click", () => {
      this.goBackFromToolDetail();
    }));
  }
  async showEmbeddedToolDetail(extension) {
    if (!this.embeddedToolDetail) {
      return;
    }
    this.viewMode = "toolsDetail";
    this.updateContentVisibility();
    this.toolsDetailDisposables.clear();
    this.embeddedToolDetail.setInput(extension);
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
  goBackFromToolDetail() {
    this.toolsDetailDisposables.clear();
    this.embeddedToolDetail?.clearInput();
    this.viewMode = "list";
    this.updateContentVisibility();
    if (this.dimension) {
      this.layout(this.dimension);
    }
    this.toolsListWidget?.focusSearch();
  }
  //#endregion
};
AICustomizationManagementEditor.ID = AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID;
AICustomizationManagementEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IAICustomizationWorkspaceService),
  __decorateParam(9, IPromptsService),
  __decorateParam(10, ITextModelService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IWorkingCopyService),
  __decorateParam(13, IHoverService),
  __decorateParam(14, IContextViewService),
  __decorateParam(15, IMarkdownRendererService),
  __decorateParam(16, IModelService),
  __decorateParam(17, IQuickInputService),
  __decorateParam(18, IFileService),
  __decorateParam(19, INotificationService),
  __decorateParam(20, IDialogService),
  __decorateParam(21, ICustomizationHarnessService),
  __decorateParam(22, IViewsService),
  __decorateParam(23, ILabelService),
  __decorateParam(24, IAICustomizationItemsModel)
], AICustomizationManagementEditor);
export {
  AICustomizationManagementEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmNzcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5cbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSVJlZmVyZW5jZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBPcmllbnRhdGlvbiwgU2l6aW5nLCBTcGxpdFZpZXcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc3BsaXR2aWV3L3NwbGl0dmlldy5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wZW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlLCBJTGlzdFJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dCB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IGFpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uUmVnaXN0cnksIElBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbldpZGdldCB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0IH0gZnJvbSAnLi9haUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsLCBJVEVNU19NT0RFTF9TRUNUSU9OUyB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uSXRlbXNNb2RlbC5qcyc7XG5pbXBvcnQgeyBNY3BMaXN0V2lkZ2V0IH0gZnJvbSAnLi9tY3BMaXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IFBsdWdpbkxpc3RXaWRnZXQgfSBmcm9tICcuL3BsdWdpbkxpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgVG9vbHNMaXN0V2lkZ2V0IH0gZnJvbSAnLi90b29sc0xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9DT1BJTE9UX0NMSV9TRVNTSU9OX1RZUEUgfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXV0b21hdGlvbnNMaXN0V2lkZ2V0IH0gZnJvbSAnLi9hdXRvbWF0aW9uc0xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHtcblx0QUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX0VESVRPUl9JRCxcblx0QUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX1NJREVCQVJfV0lEVEhfS0VZLFxuXHRBSV9DVVNUT01JWkFUSU9OX01BTkFHRU1FTlRfU0VMRUNURURfU0VDVElPTl9LRVksXG5cdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLFxuXHRBSUN1c3RvbWl6YXRpb25Tb3VyY2UsXG5cdENPTlRFWFRfQUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX0VESVRPUixcblx0Q09OVEVYVF9BSV9DVVNUT01JWkFUSU9OX01BTkFHRU1FTlRfU0VDVElPTixcblx0Q09OVEVYVF9BSV9DVVNUT01JWkFUSU9OX01BTkFHRU1FTlRfSEFSTkVTUyxcblx0U0lERUJBUl9ERUZBVUxUX1dJRFRILFxuXHRTSURFQkFSX01JTl9XSURUSCxcblx0U0lERUJBUl9NQVhfV0lEVEgsXG5cdENPTlRFTlRfTUlOX1dJRFRILFxufSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgYWdlbnRJY29uLCBpbnN0cnVjdGlvbnNJY29uLCBwcm9tcHRJY29uLCBza2lsbEljb24sIGhvb2tJY29uLCBwbHVnaW5JY29uLCB0b29sc0ljb24sIGF1dG9tYXRpb25JY29uIH0gZnJvbSAnLi9haUN1c3RvbWl6YXRpb25JY29ucy5qcyc7XG5pbXBvcnQgeyBDSEFUX0FVVE9NQVRJT05TX0VOQUJMRURfU0VUVElORyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uc0VuYWJsZWQuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVsc1dpZGdldCB9IGZyb20gJy4uL2NoYXRNYW5hZ2VtZW50L2NoYXRNb2RlbHNXaWRnZXQuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUsIFRhcmdldCB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlLCBJUHJvbXB0UGF0aCwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhlYWRlckF0dHJpYnV0ZSwgSVZhbHVlLCBQYXJzZWRQcm9tcHRGaWxlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlUGFyc2VyLmpzJztcbmltcG9ydCB7IEFHRU5UX01EX0ZJTEVOQU1FIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBnZXRBdHRyaWJ1dGVEZWZpbml0aW9uLCBnZXRUYXJnZXQgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2xhbmd1YWdlUHJvdmlkZXJzL3Byb21wdEZpbGVBdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IElOZXdQcm9tcHRPcHRpb25zLCBORVdfUFJPTVBUX0NPTU1BTkRfSUQsIE5FV19JTlNUUlVDVElPTlNfQ09NTUFORF9JRCwgTkVXX0FHRU5UX0NPTU1BTkRfSUQsIE5FV19TS0lMTF9DT01NQU5EX0lEIH0gZnJvbSAnLi4vcHJvbXB0U3ludGF4L25ld1Byb21wdEZpbGVBY3Rpb25zLmpzJztcbmltcG9ydCB7IHNob3dDb25maWd1cmVIb29rc1F1aWNrUGljayB9IGZyb20gJy4uL3Byb21wdFN5bnRheC9ob29rQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZXNvbHZlV29ya3NwYWNlVGFyZ2V0RGlyZWN0b3J5LCByZXNvbHZlVXNlclRhcmdldERpcmVjdG9yeSwgQ3VzdG9taXphdGlvbkxvY2F0aW9uUGlja2VyIH0gZnJvbSAnLi9jdXN0b21pemF0aW9uQ3JlYXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvblNvdXJjZXMsIElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgSW5wdXRCb3ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgQ2hlY2tib3ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnlGcm9tU25hcHNob3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRTaW1wbGVFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29kZUVkaXRvci9icm93c2VyL3NpbXBsZUVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcywgZGVmYXVsdENoZWNrYm94U3R5bGVzLCBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaE1jcFNlcnZlciB9IGZyb20gJy4uLy4uLy4uL21jcC9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luSXRlbSB9IGZyb20gJy4uL2FnZW50UGx1Z2luRWRpdG9yL2FnZW50UGx1Z2luSXRlbXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRW1iZWRkZWRNY3BTZXJ2ZXJEZXRhaWwgfSBmcm9tICcuL2VtYmVkZGVkTWNwU2VydmVyRGV0YWlsLmpzJztcbmltcG9ydCB7IEVtYmVkZGVkQWdlbnRQbHVnaW5EZXRhaWwgfSBmcm9tICcuL2VtYmVkZGVkQWdlbnRQbHVnaW5EZXRhaWwuanMnO1xuaW1wb3J0IHsgRW1iZWRkZWRFeHRlbnNpb25Ub29sc0RldGFpbCB9IGZyb20gJy4vZW1iZWRkZWRFeHRlbnNpb25Ub29sc0RldGFpbC5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLCB0eXBlIElDdXN0b21pemF0aW9uU291cmNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uV2VsY29tZVBhZ2UgfSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbldlbGNvbWVQYWdlLmpzJztcbmltcG9ydCB7IGdldFByb21wdE1pZ3JhdGlvbkluZm8sIG1pZ3JhdGVQcm9tcHRGaWxlc1RvU2tpbGxzLCB0eXBlIFByb21wdE1pZ3JhdGlvblNraWxsU291cmNlRm9sZGVycyB9IGZyb20gJy4vcHJvbXB0TWlncmF0aW9uLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgc2hvd05vRm9sZGVyc0RpYWxvZyB9IGZyb20gJy4uL3Byb21wdFN5bnRheC9waWNrZXJzL2Fza0ZvclByb21wdFNvdXJjZUZvbGRlci5qcyc7XG5pbXBvcnQgeyBpc0FnZW50SG9zdFRhcmdldCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG4vLyNyZWdpb24gVGVsZW1ldHJ5XG5cbnR5cGUgQ3VzdG9taXphdGlvbkVkaXRvck9wZW5lZEV2ZW50ID0ge1xuXHRzZWN0aW9uOiBzdHJpbmc7XG59O1xuXG50eXBlIEN1c3RvbWl6YXRpb25FZGl0b3JPcGVuZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0c2VjdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBpbml0aWFsbHkgc2VsZWN0ZWQgc2VjdGlvbiB3aGVuIHRoZSBlZGl0b3Igb3BlbnMuJyB9O1xuXHRvd25lcjogJ2pvc2hzcGljZXInO1xuXHRjb21tZW50OiAnVHJhY2tzIHdoZW4gdGhlIEFnZW50IEN1c3RvbWl6YXRpb25zIGVkaXRvciBpcyBvcGVuZWQuJztcbn07XG5cbnR5cGUgQ3VzdG9taXphdGlvbkVkaXRvclNlY3Rpb25DaGFuZ2VkRXZlbnQgPSB7XG5cdHNlY3Rpb246IHN0cmluZztcbn07XG5cbnR5cGUgQ3VzdG9taXphdGlvbkVkaXRvclNlY3Rpb25DaGFuZ2VkQ2xhc3NpZmljYXRpb24gPSB7XG5cdHNlY3Rpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgc2VjdGlvbiB0aGUgdXNlciBuYXZpZ2F0ZWQgdG8uJyB9O1xuXHRvd25lcjogJ2pvc2hzcGljZXInO1xuXHRjb21tZW50OiAnVHJhY2tzIHNlY3Rpb24gbmF2aWdhdGlvbiB3aXRoaW4gdGhlIEFnZW50IEN1c3RvbWl6YXRpb25zIGVkaXRvci4nO1xufTtcblxudHlwZSBDdXN0b21pemF0aW9uRWRpdG9ySXRlbVNlbGVjdGVkRXZlbnQgPSB7XG5cdHNlY3Rpb246IHN0cmluZztcblx0cHJvbXB0VHlwZTogc3RyaW5nO1xuXHRzdG9yYWdlOiBzdHJpbmc7XG59O1xuXG50eXBlIEN1c3RvbWl6YXRpb25FZGl0b3JJdGVtU2VsZWN0ZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0c2VjdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBhY3RpdmUgc2VjdGlvbiB3aGVuIHRoZSBpdGVtIHdhcyBzZWxlY3RlZC4nIH07XG5cdHByb21wdFR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgcHJvbXB0IHR5cGUgb2YgdGhlIHNlbGVjdGVkIGl0ZW0uJyB9O1xuXHRzdG9yYWdlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHN0b3JhZ2UgbG9jYXRpb24gb2YgdGhlIHNlbGVjdGVkIGl0ZW0gKGxvY2FsLCB1c2VyLCBleHRlbnNpb24sIHBsdWdpbiwgYnVpbHRpbikuJyB9O1xuXHRvd25lcjogJ2pvc2hzcGljZXInO1xuXHRjb21tZW50OiAnVHJhY2tzIGl0ZW0gc2VsZWN0aW9uIGluIHRoZSBBZ2VudCBDdXN0b21pemF0aW9ucyBlZGl0b3IuJztcbn07XG5cbnR5cGUgQ3VzdG9taXphdGlvbkVkaXRvckNyZWF0ZUl0ZW1FdmVudCA9IHtcblx0c2VjdGlvbjogc3RyaW5nO1xuXHRwcm9tcHRUeXBlOiBzdHJpbmc7XG5cdGNyZWF0aW9uTW9kZTogJ2FpJyB8ICdtYW51YWwnO1xuXHR0YXJnZXQ6IHN0cmluZztcbn07XG5cbnR5cGUgQ3VzdG9taXphdGlvbkVkaXRvckNyZWF0ZUl0ZW1DbGFzc2lmaWNhdGlvbiA9IHtcblx0c2VjdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBhY3RpdmUgc2VjdGlvbiB3aGVuIHRoZSBpdGVtIHdhcyBjcmVhdGVkLicgfTtcblx0cHJvbXB0VHlwZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB0eXBlIG9mIGN1c3RvbWl6YXRpb24gYmVpbmcgY3JlYXRlZC4nIH07XG5cdGNyZWF0aW9uTW9kZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGl0ZW0gd2FzIGNyZWF0ZWQgdmlhIEFJLWd1aWRlZCBmbG93IG9yIG1hbnVhbCBjcmVhdGlvbi4nIH07XG5cdHRhcmdldDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB0YXJnZXQgc3RvcmFnZSBmb3IgdGhlIG5ldyBpdGVtICh3b3Jrc3BhY2UsIHVzZXIpLicgfTtcblx0b3duZXI6ICdqb3Noc3BpY2VyJztcblx0Y29tbWVudDogJ1RyYWNrcyBjdXN0b21pemF0aW9uIGNyZWF0aW9uIGluIHRoZSBBZ2VudCBDdXN0b21pemF0aW9ucyBlZGl0b3IuJztcbn07XG5cbnR5cGUgQ3VzdG9taXphdGlvbkVkaXRvclNhdmVJdGVtRXZlbnQgPSB7XG5cdHByb21wdFR5cGU6IHN0cmluZztcblx0c3RvcmFnZTogc3RyaW5nO1xuXHRzYXZlVGFyZ2V0OiBzdHJpbmc7XG59O1xuXG50eXBlIEN1c3RvbWl6YXRpb25FZGl0b3JTYXZlSXRlbUNsYXNzaWZpY2F0aW9uID0ge1xuXHRwcm9tcHRUeXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHR5cGUgb2YgY3VzdG9taXphdGlvbiBiZWluZyBzYXZlZC4nIH07XG5cdHN0b3JhZ2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgb3JpZ2luYWwgc3RvcmFnZSBsb2NhdGlvbiBvZiB0aGUgaXRlbS4nIH07XG5cdHNhdmVUYXJnZXQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgdGFyZ2V0IHN0b3JhZ2UgZm9yIHRoZSBzYXZlICh3b3Jrc3BhY2UsIHVzZXIsIGV4aXN0aW5nKS4nIH07XG5cdG93bmVyOiAnam9zaHNwaWNlcic7XG5cdGNvbW1lbnQ6ICdUcmFja3Mgc2F2ZSBhY3Rpb25zIGluIHRoZSBBZ2VudCBDdXN0b21pemF0aW9ucyBlZGl0b3IuJztcbn07XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gU2lkZWJhciBTZWN0aW9uIEl0ZW1cblxuaW50ZXJmYWNlIElTZWN0aW9uSXRlbSB7XG5cdHJlYWRvbmx5IGlkOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbjtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRjb3VudDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSVNhdmVUYXJnZXRRdWlja1BpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRyZWFkb25seSB0YXJnZXQ6ICd3b3Jrc3BhY2UnIHwgJ3VzZXInIHwgJ2NhbmNlbCc7XG5cdHJlYWRvbmx5IGZvbGRlcj86IFVSSTtcbn1cblxuaW50ZXJmYWNlIElNaWdyYXRpb25Ta2lsbFRhcmdldFF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHJlYWRvbmx5IGZvbGRlcjogSUN1c3RvbWl6YXRpb25Tb3VyY2VGb2xkZXI7XG59XG5cbmludGVyZmFjZSBJQnVpbHRpblByb21wdFNhdmVSZXF1ZXN0IHtcblx0cmVhZG9ubHkgdGFyZ2V0OiAnd29ya3NwYWNlJyB8ICd1c2VyJztcblx0cmVhZG9ubHkgZm9sZGVyOiBVUkk7XG5cdHJlYWRvbmx5IHNvdXJjZVVyaTogVVJJO1xuXHRyZWFkb25seSBjb250ZW50OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByb21wdFR5cGU6IFByb21wdHNUeXBlO1xuXHRyZWFkb25seSBwcm9qZWN0Um9vdD86IFVSSTtcbn1cblxuaW50ZXJmYWNlIElFeGlzdGluZ0N1c3RvbWl6YXRpb25TYXZlUmVxdWVzdCB7XG5cdHJlYWRvbmx5IGZpbGVVcmk6IFVSSTtcblx0cmVhZG9ubHkgY29udGVudDogc3RyaW5nO1xuXHRyZWFkb25seSBwcm9qZWN0Um9vdD86IFVSSTtcbn1cblxuY2xhc3MgU2VjdGlvbkl0ZW1EZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPElTZWN0aW9uSXRlbT4ge1xuXHRnZXRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMjY7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdzZWN0aW9uSXRlbSc7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElTZWN0aW9uSXRlbVRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGljb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGNvdW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5jbGFzcyBTZWN0aW9uSXRlbVJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJU2VjdGlvbkl0ZW0sIElTZWN0aW9uSXRlbVRlbXBsYXRlRGF0YT4ge1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gJ3NlY3Rpb25JdGVtJztcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZWN0aW9uSXRlbVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3NlY3Rpb24tbGlzdC1pdGVtJyk7XG5cdFx0Y29uc3QgaWNvbiA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2VjdGlvbi1pY29uJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZWN0aW9uLWxhYmVsJykpO1xuXHRcdGNvbnN0IGNvdW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZWN0aW9uLWNvdW50JykpO1xuXHRcdGNvbnN0IHRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0cmV0dXJuIHsgY29udGFpbmVyLCBpY29uLCBsYWJlbCwgY291bnQsIHRlbXBsYXRlRGlzcG9zYWJsZXMgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVNlY3Rpb25JdGVtLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTZWN0aW9uSXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gJ3NlY3Rpb24taWNvbic7XG5cdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShlbGVtZW50Lmljb24pKTtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwudGV4dENvbnRlbnQgPSBlbGVtZW50LmxhYmVsO1xuXHRcdGlmIChlbGVtZW50LmNvdW50ID4gMCkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvdW50LnRleHRDb250ZW50ID0gU3RyaW5nKGVsZW1lbnQuY291bnQpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvdW50LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvdW50LnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY291bnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRlbXBsYXRlRGF0YS5jb250YWluZXIsIGVsZW1lbnQuZGVzY3JpcHRpb24pKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElTZWN0aW9uSXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLyoqXG4gKiBFZGl0b3IgcGFuZSBmb3IgdGhlIEFJIEN1c3RvbWl6YXRpb25zIE1hbmFnZW1lbnQgRWRpdG9yLlxuICogUHJvdmlkZXMgYSBnbG9iYWwgdmlldyBvZiBhbGwgQUkgY3VzdG9taXphdGlvbnMgd2l0aCBhIHNpZGViYXIgZm9yIG5hdmlnYXRpb25cbiAqIGFuZCBhIGNvbnRlbnQgYXJlYSBzaG93aW5nIGEgc2VhcmNoYWJsZSBsaXN0IG9mIGl0ZW1zLlxuICovXG5leHBvcnQgY2xhc3MgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvciBleHRlbmRzIEVkaXRvclBhbmUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9IEFJX0NVU1RPTUlaQVRJT05fTUFOQUdFTUVOVF9FRElUT1JfSUQ7XG5cblx0cHJpdmF0ZSBjb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzcGxpdFZpZXdDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzcGxpdFZpZXchOiBTcGxpdFZpZXc8bnVtYmVyPjtcblx0cHJpdmF0ZSBzaWRlYmFyQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2VjdGlvbnNMaXN0Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzZWN0aW9uc0xpc3QhOiBXb3JrYmVuY2hMaXN0PElTZWN0aW9uSXRlbT47XG5cdHByaXZhdGUgY29udGVudENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGxpc3RXaWRnZXQhOiBBSUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0O1xuXHRwcml2YXRlIG1jcExpc3RXaWRnZXQ6IE1jcExpc3RXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcGx1Z2luTGlzdFdpZGdldDogUGx1Z2luTGlzdFdpZGdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhdXRvbWF0aW9uc0xpc3RXaWRnZXQ6IEF1dG9tYXRpb25zTGlzdFdpZGdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtb2RlbHNXaWRnZXQ6IENoYXRNb2RlbHNXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdG9vbHNMaXN0V2lkZ2V0OiBUb29sc0xpc3RXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcHJvbXB0c0NvbnRlbnRDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBtY3BDb250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwbHVnaW5Db250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhdXRvbWF0aW9uc0NvbnRlbnRDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1vZGVsc0NvbnRlbnRDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRvb2xzQ29udGVudENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29udHJpYnV0ZWRTZWN0aW9uQ29udGFpbmVycyA9IG5ldyBNYXA8QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24sIEhUTUxFbGVtZW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRyaWJ1dGVkU2VjdGlvbldpZGdldHMgPSBuZXcgTWFwPEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLCBJQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25XaWRnZXQ+KCk7XG5cdHByaXZhdGUgbW9kZWxzRm9vdGVyRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Ly8gRW1iZWRkZWQgZWRpdG9yIHN0YXRlXG5cdHByaXZhdGUgZWRpdG9yQ29udGVudENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZWRpdG9yUHJldmlld0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZWRpdG9yUHJldmlld1Njcm9sbENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZWRpdG9yUHJldmlld0lzc3Vlc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZWRpdG9yUHJldmlld0Zyb250TWF0dGVyQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBlZGl0b3JQcmV2aWV3Qm9keUNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZW1iZWRkZWRFZGl0b3JDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGVtYmVkZGVkRWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGVkaXRvckFjdGlvbkJ1dHRvbiE6IEhUTUxCdXR0b25FbGVtZW50O1xuXHRwcml2YXRlIGVkaXRvckFjdGlvbkJ1dHRvbkljb24hOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBlZGl0b3JNb2RlQnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBlZGl0b3JBY3Rpb25CdXR0b25JblByb2dyZXNzID0gZmFsc2U7XG5cdHByaXZhdGUgZWRpdG9yRGlzcGxheU1vZGU6ICdwcmV2aWV3JyB8ICdyYXcnID0gJ3ByZXZpZXcnO1xuXHRwcml2YXRlIGVkaXRvckl0ZW1OYW1lRWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGVkaXRvckl0ZW1QYXRoRWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGVkaXRvclNhdmVJbmRpY2F0b3IhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JNb2RlbENoYW5nZURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JQcmV2aWV3RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvclByZXZpZXdSZW5kZXJTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0aWYgKHRoaXMudmlld01vZGUgPT09ICdlZGl0b3InICYmIHRoaXMuZWRpdG9yRGlzcGxheU1vZGUgPT09ICdwcmV2aWV3Jykge1xuXHRcdFx0dGhpcy5yZW5kZXJDdXJyZW50RWRpdG9yUHJldmlldygpO1xuXHRcdH1cblx0fSwgMjAwKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYnVpbHRpbkVkaXRpbmdTZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCB7IG1vZGVsOiBJVGV4dE1vZGVsOyBvcmlnaW5hbENvbnRlbnQ6IHN0cmluZyB9PigpO1xuXHRwcml2YXRlIGN1cnJlbnRFZGl0aW5nVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VycmVudEVkaXRpbmdQcm9qZWN0Um9vdDogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGN1cnJlbnRFZGl0aW5nU291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VycmVudEVkaXRpbmdQcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXJyZW50RWRpdGluZ1JlYWRPbmx5ID0gZmFsc2U7XG5cdHByaXZhdGUgZWRpdG9yUmV0dXJuVmlld01vZGU6ICdsaXN0JyB8ICdtaWdyYXRpb24nID0gJ2xpc3QnO1xuXHRwcml2YXRlIGN1cnJlbnRNb2RlbFJlZjogSVJlZmVyZW5jZTxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHZpZXdNb2RlOiAnbGlzdCcgfCAnbWlncmF0aW9uJyB8ICdlZGl0b3InIHwgJ21jcERldGFpbCcgfCAncGx1Z2luRGV0YWlsJyB8ICd0b29sc0RldGFpbCcgPSAnbGlzdCc7XG5cdHByaXZhdGUgbWlncmF0aW9uQ29udGVudENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbWlncmF0aW9uTGlzdENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbWlncmF0aW9uTGlzdFNjcm9sbGFibGU6IERvbVNjcm9sbGFibGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1pZ3JhdGlvbk1pZ3JhdGVCdXR0b246IEJ1dHRvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtaWdyYXRpb25TZWFyY2hJbnB1dDogSW5wdXRCb3ggfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbWlncmF0aW9uRGVzY3JpcHRpb25FbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtaWdyYXRpb25TZWFyY2hRdWVyeSA9ICcnO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbGxhcHNlZFByb21wdE1pZ3JhdGlvbkdyb3VwcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHNlbGVjdGVkUHJvbXB0TWlncmF0aW9uVXJpcyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1pZ3JhdGlvblBhZ2VEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Ly8gRW1iZWRkZWQgTUNQIHNlcnZlciBkZXRhaWwgdmlld1xuXHRwcml2YXRlIG1jcERldGFpbENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZW1iZWRkZWRNY3BEZXRhaWw6IEVtYmVkZGVkTWNwU2VydmVyRGV0YWlsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1jcERldGFpbERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHQvLyBFbWJlZGRlZCBwbHVnaW4gZGV0YWlsIHZpZXdcblx0cHJpdmF0ZSBwbHVnaW5EZXRhaWxDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGVtYmVkZGVkUGx1Z2luRGV0YWlsOiBFbWJlZGRlZEFnZW50UGx1Z2luRGV0YWlsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHBsdWdpbkRldGFpbERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0LyoqIFNlY3Rpb24gdG8gcmVzdG9yZSB3aGVuIG5hdmlnYXRpbmcgYmFjayBmcm9tIHBsdWdpbiBkZXRhaWwgKHdoZW4gb3BlbmVkIGZyb20gYSBub24tcGx1Z2luIHNlY3Rpb24pLiAqL1xuXHRwcml2YXRlIHBsdWdpbkRldGFpbFJldHVyblNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdC8vIEVtYmVkZGVkIHRvb2wtY29udHJpYnV0aW5nIGV4dGVuc2lvbiBkZXRhaWwgdmlld1xuXHRwcml2YXRlIHRvb2xzRGV0YWlsQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBlbWJlZGRlZFRvb2xEZXRhaWw6IEVtYmVkZGVkRXh0ZW5zaW9uVG9vbHNEZXRhaWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9vbHNEZXRhaWxEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSBkaW1lbnNpb246IERPTS5EaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2VjdGlvbnM6IElTZWN0aW9uSXRlbVtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgYWxsU2VjdGlvbnM6IElTZWN0aW9uSXRlbVtdID0gW107XG5cdHByaXZhdGUgc2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiB8IHVuZGVmaW5lZDtcblxuXHQvLyBXZWxjb21lIHBhZ2Vcblx0cHJpdmF0ZSB3ZWxjb21lUGFnZTogQUlDdXN0b21pemF0aW9uV2VsY29tZVBhZ2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcHJvbXB0RmlsZXNUb01pZ3JhdGU6IHJlYWRvbmx5IElQcm9tcHRQYXRoW10gPSBbXTtcblx0cHJpdmF0ZSBwcm9tcHRNaWdyYXRpb25SZWZyZXNoU2VxdWVuY2UgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9lZGl0b3JDb250ZW50Q2hhbmdlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9wcmV2aW91c0FjdGl2ZUhhcm5lc3NJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc2lkZWJhckhlYWRlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaG9tZUJ1dHRvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaG9tZUJ1dHRvbkljb246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGhvbWVCdXR0b25MYWJlbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbWlncmF0aW9uU2hvcnRjdXRDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1pZ3JhdGlvblNob3J0Y3V0QnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtaWdyYXRpb25TaG9ydGN1dENvdW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzaWRlYmFyV2lkdGggPSAwO1xuXHRwcml2YXRlIHNpZGViYXJIZWlnaHQgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaW5FZGl0b3JDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBzZWN0aW9uQ29udGV4dEtleTogSUNvbnRleHRLZXk8c3RyaW5nPjtcblx0cHJpdmF0ZSByZWFkb25seSBoYXJuZXNzQ29udGV4dEtleTogSUNvbnRleHRLZXk8c3RyaW5nPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRncm91cDogSUVkaXRvckdyb3VwLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVNlcnZpY2U6IElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2luZ0NvcHlTZXJ2aWNlOiBJV29ya2luZ0NvcHlTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsIHByaXZhdGUgcmVhZG9ubHkgaXRlbXNNb2RlbDogSUFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwsXG5cdCkge1xuXHRcdHN1cGVyKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3IuSUQsIGdyb3VwLCB0ZWxlbWV0cnlTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdHRoaXMuaW5FZGl0b3JDb250ZXh0S2V5ID0gQ09OVEVYVF9BSV9DVVNUT01JWkFUSU9OX01BTkFHRU1FTlRfRURJVE9SLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWN0aW9uQ29udGV4dEtleSA9IENPTlRFWFRfQUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX1NFQ1RJT04uYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmhhcm5lc3NDb250ZXh0S2V5ID0gQ09OVEVYVF9BSV9DVVNUT01JWkFUSU9OX01BTkFHRU1FTlRfSEFSTkVTUy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudXBkYXRlSGFybmVzc0xhYmVsUHJlc2VudGF0aW9uKCk7XG5cblx0XHQvLyBUcmFjayB3b3Jrc3BhY2UgY2hhbmdlcyBmb3IgZW1iZWRkZWQgZWRpdG9yXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmFjdGl2ZVByb2plY3RSb290LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAnZWRpdG9yJykge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRFZGl0aW5nUHJvamVjdFJvb3QgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0QWN0aXZlUHJvamVjdFJvb3QoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuY3VycmVudE1vZGVsUmVmPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLmN1cnJlbnRNb2RlbFJlZiA9IHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuZGlzcG9zZUJ1aWx0aW5FZGl0aW5nU2Vzc2lvbnMoKSkpO1xuXG5cdFx0Ly8gQnVpbGQgc2VjdGlvbnMgZnJvbSB0aGUgd29ya3NwYWNlIHNlcnZpY2UgY29uZmlndXJhdGlvblxuXHRcdGNvbnN0IHNlY3Rpb25JbmZvOiBSZWNvcmQ8c3RyaW5nLCB7IGxhYmVsOiBzdHJpbmc7IGljb246IFRoZW1lSWNvbjsgZGVzY3JpcHRpb246IHN0cmluZyB9PiA9IHtcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHNdOiB7IGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRzJywgXCJBZ2VudHNcIiksIGljb246IGFnZW50SWNvbiwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudHNEZXNjJywgXCJEZWZpbmUgY3VzdG9tIGFnZW50cyB3aXRoIHNwZWNpYWxpemVkIHBlcnNvbmFzLCB0b29sIGFjY2VzcywgYW5kIGluc3RydWN0aW9ucyBmb3Igc3BlY2lmaWMgdGFza3MuXCIpIH0sXG5cdFx0XHRbQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzXTogeyBsYWJlbDogbG9jYWxpemUoJ3NraWxscycsIFwiU2tpbGxzXCIpLCBpY29uOiBza2lsbEljb24sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2tpbGxzRGVzYycsIFwiQ3JlYXRlIHJldXNhYmxlIHNraWxsIGZpbGVzIHRoYXQgcHJvdmlkZSBkb21haW4tc3BlY2lmaWMga25vd2xlZGdlIGFuZCB3b3JrZmxvd3MuXCIpIH0sXG5cdFx0XHRbQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSW5zdHJ1Y3Rpb25zXTogeyBsYWJlbDogbG9jYWxpemUoJ2luc3RydWN0aW9ucycsIFwiSW5zdHJ1Y3Rpb25zXCIpLCBpY29uOiBpbnN0cnVjdGlvbnNJY29uLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2luc3RydWN0aW9uc0Rlc2MnLCBcIlNldCBhbHdheXMtb24gaW5zdHJ1Y3Rpb25zIHRoYXQgZ3VpZGUgQUkgYmVoYXZpb3IgYWNyb3NzIHlvdXIgd29ya3NwYWNlIG9yIHVzZXIgcHJvZmlsZS5cIikgfSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Qcm9tcHRzXTogeyBsYWJlbDogbG9jYWxpemUoJ3Byb21wdHMnLCBcIlByb21wdHNcIiksIGljb246IHByb21wdEljb24sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0c0Rlc2MnLCBcIlJldXNhYmxlIHByb21wdCB0ZW1wbGF0ZXMgdGhhdCBjYW4gYmUgaW52b2tlZCBhcyBzbGFzaCBjb21tYW5kcy5cIikgfSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ib29rc106IHsgbGFiZWw6IGxvY2FsaXplKCdob29rcycsIFwiSG9va3NcIiksIGljb246IGhvb2tJY29uLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2hvb2tzRGVzYycsIFwiQ29uZmlndXJlIGF1dG9tYXRlZCBhY3Rpb25zIHRyaWdnZXJlZCBieSBldmVudHMgbGlrZSBzYXZpbmcgZmlsZXMgb3IgcnVubmluZyB0YXNrcy5cIikgfSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BdXRvbWF0aW9uc106IHsgbGFiZWw6IGxvY2FsaXplKCdhdXRvbWF0aW9ucycsIFwiQXV0b21hdGlvbnNcIiksIGljb246IGF1dG9tYXRpb25JY29uLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F1dG9tYXRpb25zRGVzYycsIFwiU2NoZWR1bGUgYWdlbnQgc2Vzc2lvbnMgdG8gcnVuIG9uIGEgY2FkZW5jZSB5b3UgY2hvb3NlLlwiKSB9LFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnNdOiB7IGxhYmVsOiBsb2NhbGl6ZSgnbWNwU2VydmVycycsIFwiTUNQIFNlcnZlcnNcIiksIGljb246IENvZGljb24uc2VydmVyLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21jcFNlcnZlcnNEZXNjJywgXCJDb25uZWN0IGV4dGVybmFsIHRvb2wgc2VydmVycyB0aGF0IGV4dGVuZCBBSSBjYXBhYmlsaXRpZXMgd2l0aCBjdXN0b20gdG9vbHMgYW5kIGRhdGEgc291cmNlcy5cIikgfSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zXTogeyBsYWJlbDogbG9jYWxpemUoJ3BsdWdpbnMnLCBcIlBsdWdpbnNcIiksIGljb246IHBsdWdpbkljb24sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncGx1Z2luc0Rlc2MnLCBcIkluc3RhbGwgYW5kIG1hbmFnZSBhZ2VudCBwbHVnaW5zIHRoYXQgYWRkIGFkZGl0aW9uYWwgdG9vbHMsIHNraWxscywgYW5kIGludGVncmF0aW9ucy5cIikgfSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Nb2RlbHNdOiB7IGxhYmVsOiBsb2NhbGl6ZSgnbW9kZWxzJywgXCJNb2RlbHNcIiksIGljb246IENvZGljb24udm0sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbW9kZWxzRGVzYycsIFwiQ29uZmlndXJlIGFuZCBtYW5hZ2UgbGFuZ3VhZ2UgbW9kZWxzIGF2YWlsYWJsZSBmb3IgdXNlLlwiKSB9LFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlRvb2xzXTogeyBsYWJlbDogbG9jYWxpemUoJ3Rvb2xzJywgXCJUb29sc1wiKSwgaWNvbjogdG9vbHNJY29uLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rvb2xzRGVzYycsIFwiRW5hYmxlIG9yIGRpc2FibGUgZ3JvdXBzIG9mIGxhbmd1YWdlIG1vZGVsIHRvb2xzIGF2YWlsYWJsZSB0byBjaGF0LlwiKSB9LFxuXHRcdH07XG5cdFx0Y29uc3QgYWN0aXZlSGFybmVzc0lkID0gdGhpcy5oYXJuZXNzU2VydmljZS5hY3RpdmVIYXJuZXNzLmdldCgpO1xuXHRcdGZvciAoY29uc3QgaWQgb2YgdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLm1hbmFnZW1lbnRTZWN0aW9ucykge1xuXHRcdFx0Y29uc3QgY29udHJpYnV0aW9uID0gYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25SZWdpc3RyeS5nZXQoaWQsIGFjdGl2ZUhhcm5lc3NJZCkgPz8gYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25SZWdpc3RyeS5nZXREZWZhdWx0KGlkKTtcblx0XHRcdGNvbnN0IGluZm8gPSBjb250cmlidXRpb24gPz8gc2VjdGlvbkluZm9baWRdO1xuXHRcdFx0aWYgKGluZm8pIHtcblx0XHRcdFx0dGhpcy5hbGxTZWN0aW9ucy5wdXNoKHsgaWQsIGxhYmVsOiBpbmZvLmxhYmVsLCBpY29uOiBpbmZvLmljb24sIGRlc2NyaXB0aW9uOiBpbmZvLmRlc2NyaXB0aW9uLCBjb3VudDogMCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5yZWJ1aWxkVmlzaWJsZVNlY3Rpb25zKCk7XG5cblx0XHQvLyBSZXN0b3JlIHNlbGVjdGVkIHNlY3Rpb24gZnJvbSBzdG9yYWdlLCBmYWxsaW5nIGJhY2sgdG8gd2VsY29tZSBwYWdlXG5cdFx0Y29uc3Qgc2F2ZWRTZWN0aW9uID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoQUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX1NFTEVDVEVEX1NFQ1RJT05fS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0aWYgKHNhdmVkU2VjdGlvbiAmJiB0aGlzLnNlY3Rpb25zLnNvbWUocyA9PiBzLmlkID09PSBzYXZlZFNlY3Rpb24pKSB7XG5cdFx0XHR0aGlzLnNlbGVjdGVkU2VjdGlvbiA9IHNhdmVkU2VjdGlvbiBhcyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZWxlY3RlZFNlY3Rpb24gPSB1bmRlZmluZWQ7IC8vIFNob3cgd2VsY29tZSBwYWdlXG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUVkaXRvcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuY29udHJpYnV0ZWRTZWN0aW9uQ29udGFpbmVycy5jbGVhcigpO1xuXHRcdHRoaXMuY29udHJpYnV0ZWRTZWN0aW9uV2lkZ2V0cy5jbGVhcigpO1xuXHRcdHRoaXMuY29udGFpbmVyID0gRE9NLmFwcGVuZChwYXJlbnQsICQoJy5haS1jdXN0b21pemF0aW9uLW1hbmFnZW1lbnQtZWRpdG9yJykpO1xuXG5cdFx0dGhpcy5jcmVhdGVTcGxpdFZpZXcoKTtcblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTcGxpdFZpZXcoKTogdm9pZCB7XG5cdFx0dGhpcy5zcGxpdFZpZXdDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCcubWFuYWdlbWVudC1zcGxpdC12aWV3JykpO1xuXG5cdFx0dGhpcy5zaWRlYmFyQ29udGFpbmVyID0gJCgnLm1hbmFnZW1lbnQtc2lkZWJhcicpO1xuXHRcdHRoaXMuY29udGVudENvbnRhaW5lciA9ICQoJy5tYW5hZ2VtZW50LWNvbnRlbnQnKTtcblxuXHRcdHRoaXMuY3JlYXRlU2lkZWJhcigpO1xuXHRcdHRoaXMuY3JlYXRlQ29udGVudCgpO1xuXG5cdFx0dGhpcy5zcGxpdFZpZXcgPSB0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChuZXcgU3BsaXRWaWV3KHRoaXMuc3BsaXRWaWV3Q29udGFpbmVyLCB7XG5cdFx0XHRvcmllbnRhdGlvbjogT3JpZW50YXRpb24uSE9SSVpPTlRBTCxcblx0XHRcdHByb3BvcnRpb25hbExheW91dDogdHJ1ZSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBzYXZlZFdpZHRoID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXROdW1iZXIoQUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX1NJREVCQVJfV0lEVEhfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU0lERUJBUl9ERUZBVUxUX1dJRFRIKTtcblxuXHRcdC8vIFNpZGViYXIgdmlld1xuXHRcdHRoaXMuc3BsaXRWaWV3LmFkZFZpZXcoe1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRlbGVtZW50OiB0aGlzLnNpZGViYXJDb250YWluZXIsXG5cdFx0XHRtaW5pbXVtU2l6ZTogU0lERUJBUl9NSU5fV0lEVEgsXG5cdFx0XHRtYXhpbXVtU2l6ZTogU0lERUJBUl9NQVhfV0lEVEgsXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aCwgXywgaGVpZ2h0KSA9PiB7XG5cdFx0XHRcdHRoaXMuc2lkZWJhckNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0XHRcdFx0aWYgKGhlaWdodCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5sYXlvdXRTaWRlYmFyKHdpZHRoLCBoZWlnaHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0sIHNhdmVkV2lkdGgsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHQvLyBDb250ZW50IHZpZXdcblx0XHR0aGlzLnNwbGl0Vmlldy5hZGRWaWV3KHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0ZWxlbWVudDogdGhpcy5jb250ZW50Q29udGFpbmVyLFxuXHRcdFx0bWluaW11bVNpemU6IENPTlRFTlRfTUlOX1dJRFRILFxuXHRcdFx0bWF4aW11bVNpemU6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSxcblx0XHRcdGxheW91dDogKHdpZHRoLCBfLCBoZWlnaHQpID0+IHtcblx0XHRcdFx0dGhpcy5jb250ZW50Q29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRcdFx0XHRpZiAoaGVpZ2h0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLmxpc3RXaWRnZXQubGF5b3V0KGhlaWdodCAtIDE2LCB3aWR0aCAtIDI0KTtcblx0XHRcdFx0XHR0aGlzLm1jcExpc3RXaWRnZXQ/LmxheW91dChoZWlnaHQgLSAxNiwgd2lkdGggLSAyNCk7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW5MaXN0V2lkZ2V0Py5sYXlvdXQoaGVpZ2h0IC0gMTYsIHdpZHRoIC0gMjQpO1xuXHRcdFx0XHRcdHRoaXMudG9vbHNMaXN0V2lkZ2V0Py5sYXlvdXQoaGVpZ2h0IC0gMTYsIHdpZHRoIC0gMjQpO1xuXHRcdFx0XHRcdHRoaXMuYXV0b21hdGlvbnNMaXN0V2lkZ2V0Py5sYXlvdXQoaGVpZ2h0IC0gMTYsIHdpZHRoIC0gMjQpO1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsc0Zvb3RlckhlaWdodCA9IHRoaXMubW9kZWxzRm9vdGVyRWxlbWVudD8ub2Zmc2V0SGVpZ2h0IHx8IDgwO1xuXHRcdFx0XHRcdHRoaXMubW9kZWxzV2lkZ2V0Py5sYXlvdXQoaGVpZ2h0IC0gMTYgLSBtb2RlbHNGb290ZXJIZWlnaHQsIHdpZHRoKTtcblx0XHRcdFx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ2VkaXRvcicgJiYgdGhpcy5lbWJlZGRlZEVkaXRvciAmJiB0aGlzLmVtYmVkZGVkRWRpdG9yQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0XHQvLyBVc2UgdGhlIGFjdHVhbCByZW5kZXJlZCBzaXplIG9mIHRoZSBlbWJlZGRlZCBlZGl0b3IgY29udGFpbmVyIHNvXG5cdFx0XHRcdFx0XHQvLyB0aGUgTW9uYWNvIGVkaXRvciAoYW5kIGl0cyBzY3JvbGxiYXJzKSBzdGF5IHdpdGhpbiB0aGUgcm91bmRlZFxuXHRcdFx0XHRcdFx0Ly8gcGFuZWwgY2hyb21lIHJlZ2FyZGxlc3Mgb2YgaGVhZGVyL21hcmdpbiBjaGFuZ2VzLiBHdWFyZCBhZ2FpbnN0XG5cdFx0XHRcdFx0XHQvLyB0aGUgY29udGFpbmVyIGJlaW5nIGhpZGRlbiAoY2xpZW50SGVpZ2h0ID09PSAwKTsgcmUtbGF5b3V0IG9uY2Vcblx0XHRcdFx0XHRcdC8vIGl0IGJlY29tZXMgdmlzaWJsZSB0byBhdm9pZCBhIHplcm8taGVpZ2h0IGVkaXRvci5cblx0XHRcdFx0XHRcdGNvbnN0IHsgY2xpZW50V2lkdGgsIGNsaWVudEhlaWdodCB9ID0gdGhpcy5lbWJlZGRlZEVkaXRvckNvbnRhaW5lcjtcblx0XHRcdFx0XHRcdGlmIChjbGllbnRXaWR0aCA+IDAgJiYgY2xpZW50SGVpZ2h0ID4gMCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmVtYmVkZGVkRWRpdG9yLmxheW91dCh7IHdpZHRoOiBjbGllbnRXaWR0aCwgaGVpZ2h0OiBjbGllbnRIZWlnaHQgfSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHRcdFx0XHRcdERPTS5nZXRXaW5kb3codGhpcy5lbWJlZGRlZEVkaXRvckNvbnRhaW5lcikucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAodGhpcy5lbWJlZGRlZEVkaXRvciAmJiB0aGlzLmVtYmVkZGVkRWRpdG9yQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCB7IGNsaWVudFdpZHRoOiB3LCBjbGllbnRIZWlnaHQ6IGggfSA9IHRoaXMuZW1iZWRkZWRFZGl0b3JDb250YWluZXI7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAodyA+IDAgJiYgaCA+IDApIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5lbWJlZGRlZEVkaXRvci5sYXlvdXQoeyB3aWR0aDogdywgaGVpZ2h0OiBoIH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIEVtYmVkZGVkIE1DUC9wbHVnaW4gZGV0YWlsIHBhbmVzIHVzZSBhIHBsYWluIERPTSB3aWRnZXQgdGhhdCBmbG93cyB3aXRoXG5cdFx0XHRcdFx0Ly8gdGhlIGNvbnRhaW5lcjsgbm8gZXhwbGljaXQgbGF5b3V0IGNhbGwgaXMgbmVlZGVkIGhlcmUuXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSwgU2l6aW5nLkRpc3RyaWJ1dGUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHQvLyBQZXJzaXN0IHNpZGViYXIgd2lkdGhcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLnNwbGl0Vmlldy5vbkRpZFNhc2hDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2lkdGggPSB0aGlzLnNwbGl0Vmlldy5nZXRWaWV3U2l6ZSgwKTtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX1NJREVCQVJfV0lEVEhfS0VZLCB3aWR0aCwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVzZXQgb24gZG91YmxlLWNsaWNrXG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5zcGxpdFZpZXcub25EaWRTYXNoUmVzZXQoKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG90YWxXaWR0aCA9IHRoaXMuc3BsaXRWaWV3LmdldFZpZXdTaXplKDApICsgdGhpcy5zcGxpdFZpZXcuZ2V0Vmlld1NpemUoMSk7XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5yZXNpemVWaWV3KDAsIFNJREVCQVJfREVGQVVMVF9XSURUSCk7XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5yZXNpemVWaWV3KDEsIHRvdGFsV2lkdGggLSBTSURFQkFSX0RFRkFVTFRfV0lEVEgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aXZlSGFybmVzc0xhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaGFybmVzc1NlcnZpY2UuZ2V0QWN0aXZlRGVzY3JpcHRvcigpLmxhYmVsIHx8IGxvY2FsaXplKCdsb2NhbEhhcm5lc3NMYWJlbCcsIFwiTG9jYWxcIik7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUhhcm5lc3NMYWJlbFByZXNlbnRhdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBoYXJuZXNzTGFiZWwgPSB0aGlzLmdldEFjdGl2ZUhhcm5lc3NMYWJlbCgpO1xuXHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dC5nZXRPckNyZWF0ZSgpLnNldEhhcm5lc3NMYWJlbChoYXJuZXNzTGFiZWwpO1xuXHRcdHRoaXMud2VsY29tZVBhZ2U/LnNldEhhcm5lc3NMYWJlbChoYXJuZXNzTGFiZWwpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlYnVpbGRzIHRoZSB2aXNpYmxlIHNlY3Rpb25zIGxpc3QgYmFzZWQgb24gdGhlIGFjdGl2ZSBoYXJuZXNzJ3Ncblx0ICogYGhpZGRlblNlY3Rpb25zYC4gSWYgdGhlIGN1cnJlbnQgc2VsZWN0aW9uIGZhbGxzIGludG8gYSBoaWRkZW5cblx0ICogc2VjdGlvbiwgdGhlIGZpcnN0IHZpc2libGUgc2VjdGlvbiBpcyBzZWxlY3RlZCBpbnN0ZWFkLlxuXHQgKi9cblx0cHJpdmF0ZSByZWJ1aWxkVmlzaWJsZVNlY3Rpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUlkID0gdGhpcy5oYXJuZXNzU2VydmljZS5hY3RpdmVIYXJuZXNzLmdldCgpO1xuXHRcdGNvbnN0IGRlc2NyaXB0b3IgPSB0aGlzLmhhcm5lc3NTZXJ2aWNlLmZpbmRIYXJuZXNzQnlJZChhY3RpdmVJZCk7XG5cdFx0Y29uc3QgaGlkZGVuID0gbmV3IFNldChkZXNjcmlwdG9yPy5oaWRkZW5TZWN0aW9ucyA/PyBbXSk7XG5cblx0XHQvLyBBbHNvIGhpZGUgdGhlIEF1dG9tYXRpb25zIHNlY3Rpb24gd2hlbiB0aGUgZmVhdHVyZSBzZXR0aW5nIGlzIG9mZi5cblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDSEFUX0FVVE9NQVRJT05TX0VOQUJMRURfU0VUVElORykgIT09IHRydWUpIHtcblx0XHRcdGhpZGRlbi5hZGQoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQXV0b21hdGlvbnMpO1xuXHRcdH1cblxuXHRcdHRoaXMuc2VjdGlvbnMubGVuZ3RoID0gMDtcblx0XHRmb3IgKGNvbnN0IHMgb2YgdGhpcy5hbGxTZWN0aW9ucykge1xuXHRcdFx0Y29uc3QgY29udHJpYnV0aW9uID0gYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25SZWdpc3RyeS5nZXQocy5pZCwgYWN0aXZlSWQpO1xuXHRcdFx0Y29uc3QgY29udHJpYnV0ZWQgPSBhaUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvblJlZ2lzdHJ5LmhhcyhzLmlkKTtcblx0XHRcdGlmICghaGlkZGVuLmhhcyhzLmlkKSAmJiAoIWNvbnRyaWJ1dGVkIHx8ICEhY29udHJpYnV0aW9uKSkge1xuXHRcdFx0XHR0aGlzLnNlY3Rpb25zLnB1c2goY29udHJpYnV0aW9uID8geyAuLi5zLCBsYWJlbDogY29udHJpYnV0aW9uLmxhYmVsLCBpY29uOiBjb250cmlidXRpb24uaWNvbiwgZGVzY3JpcHRpb246IGNvbnRyaWJ1dGlvbi5kZXNjcmlwdGlvbiB9IDogcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRoZSBsaXN0IHdpZGdldCBpZiBpdCBleGlzdHNcblx0XHRpZiAodGhpcy5zZWN0aW9uc0xpc3QpIHtcblx0XHRcdHRoaXMuc2VjdGlvbnNMaXN0LnNwbGljZSgwLCB0aGlzLnNlY3Rpb25zTGlzdC5sZW5ndGgsIHRoaXMuc2VjdGlvbnMpO1xuXHRcdFx0dGhpcy5sYXlvdXRTaWRlYmFyKHRoaXMuc2lkZWJhcldpZHRoLCB0aGlzLnNpZGViYXJIZWlnaHQpO1xuXHRcdH1cblxuXHRcdC8vIFJlYnVpbGQgd2VsY29tZSBjYXJkcyB0byByZWZsZWN0IG5ldyB2aXNpYmxlIHNlY3Rpb25zXG5cdFx0dGhpcy53ZWxjb21lUGFnZT8ucmVidWlsZENhcmRzKG5ldyBTZXQodGhpcy5zZWN0aW9ucy5tYXAocyA9PiBzLmlkKSkpO1xuXG5cdFx0Ly8gSWYgdGhlIGN1cnJlbnQgc2VsZWN0aW9uIGlzIGhpZGRlbiwgZmFsbCBiYWNrIHRvIHdlbGNvbWUgcGFnZVxuXHRcdGlmICh0aGlzLnNlbGVjdGVkU2VjdGlvbiAhPT0gdW5kZWZpbmVkICYmICF0aGlzLnNlY3Rpb25zLnNvbWUocyA9PiBzLmlkID09PSB0aGlzLnNlbGVjdGVkU2VjdGlvbikgJiYgdGhpcy5zZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLnNob3dXZWxjb21lUGFnZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVuc3VyZVNlY3Rpb25zTGlzdFJlZmxlY3RzQWN0aXZlU2VjdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU2lkZWJhcigpOiB2b2lkIHtcblx0XHRjb25zdCBzaWRlYmFyQ29udGVudCA9IERPTS5hcHBlbmQodGhpcy5zaWRlYmFyQ29udGFpbmVyLCAkKCcuc2lkZWJhci1jb250ZW50JykpO1xuXG5cdFx0dGhpcy5jcmVhdGVTaWRlYmFySGVhZGVyKHNpZGViYXJDb250ZW50KTtcblxuXHRcdC8vIE1haW4gc2VjdGlvbnMgbGlzdCBjb250YWluZXIgKHRha2VzIHJlbWFpbmluZyBzcGFjZSlcblx0XHRjb25zdCBzZWN0aW9uc0xpc3RDb250YWluZXIgPSB0aGlzLnNlY3Rpb25zTGlzdENvbnRhaW5lciA9IERPTS5hcHBlbmQoc2lkZWJhckNvbnRlbnQsICQoJy5zaWRlYmFyLXNlY3Rpb25zLWxpc3QnKSk7XG5cblx0XHR0aGlzLnNlY3Rpb25zTGlzdCA9IHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hMaXN0PElTZWN0aW9uSXRlbT4sXG5cdFx0XHQnQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25zJyxcblx0XHRcdHNlY3Rpb25zTGlzdENvbnRhaW5lcixcblx0XHRcdG5ldyBTZWN0aW9uSXRlbURlbGVnYXRlKCksXG5cdFx0XHRbbmV3IFNlY3Rpb25JdGVtUmVuZGVyZXIodGhpcy5ob3ZlclNlcnZpY2UpXSxcblx0XHRcdHtcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWw6IChpdGVtOiBJU2VjdGlvbkl0ZW0pID0+IGl0ZW0uY291bnQgPiAwXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdzZWN0aW9uQXJpYUxhYmVsV2l0aENvdW50JywgXCJ7MH0sIHsxfSBpdGVtc1wiLCBpdGVtLmxhYmVsLCBpdGVtLmNvdW50KVxuXHRcdFx0XHRcdFx0OiBpdGVtLmxhYmVsLFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ3NlY3Rpb25zQXJpYUxhYmVsJywgXCJBZ2VudCBDdXN0b21pemF0aW9uIFNlY3Rpb25zXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvcGVuT25TaW5nbGVDbGljazogdHJ1ZSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldElkOiAoaXRlbTogSVNlY3Rpb25JdGVtKSA9PiBpdGVtLmlkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0dGhpcy5zZWN0aW9uc0xpc3Quc3BsaWNlKDAsIHRoaXMuc2VjdGlvbnNMaXN0Lmxlbmd0aCwgdGhpcy5zZWN0aW9ucyk7XG5cdFx0dGhpcy5lbnN1cmVTZWN0aW9uc0xpc3RSZWZsZWN0c0FjdGl2ZVNlY3Rpb24oKTtcblxuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuc2VjdGlvbnNMaXN0Lm9uRGlkQ2hhbmdlU2VsZWN0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuZWxlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGlmICh0aGlzLnNlbGVjdGVkU2VjdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5zaG93V2VsY29tZVBhZ2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNlbGVjdFNlY3Rpb24oZS5lbGVtZW50c1swXS5pZCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVhY3QgdG8gaGFybmVzcyBjaGFuZ2VzIFx1MjAxNCByZWJ1aWxkIHZpc2libGUgc2VjdGlvbnMgYW5kIHJlZnJlc2ggY291bnRzLlxuXHRcdC8vIEFsc28gdHJhY2sgYXZhaWxhYmxlSGFybmVzc2VzIHRvIGhhbmRsZSBhZ2VudCByZWdpc3RyYXRpb24vdW5yZWdpc3RyYXRpb24uXG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5oYXJuZXNzU2VydmljZS5hdmFpbGFibGVIYXJuZXNzZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYWN0aXZlSWQgPSB0aGlzLmhhcm5lc3NTZXJ2aWNlLmFjdGl2ZUhhcm5lc3MucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5oYXJuZXNzQ29udGV4dEtleS5zZXQoYWN0aXZlSWQpO1xuXHRcdFx0dGhpcy51cGRhdGVIb21lQnV0dG9uSGFybmVzc1ByZXNlbnRhdGlvbigpO1xuXHRcdFx0dGhpcy5yZWJ1aWxkVmlzaWJsZVNlY3Rpb25zKCk7XG5cdFx0XHQvLyBSZXNldCBjb3VudHMgdG8gemVybyBpbW1lZGlhdGVseSBvbiBoYXJuZXNzIHN3aXRjaCB0byBwcmV2ZW50XG5cdFx0XHQvLyBzdGFsZSBjb3VudHMgZnJvbSB0aGUgcHJldmlvdXMgaGFybmVzcyBmbGFzaGluZyBiZWZvcmUgdGhlIGFzeW5jXG5cdFx0XHQvLyBjb3VudCByZWZyZXNoIGNvbXBsZXRlcy4gT25seSByZXNldCB3aGVuIHRoZSBhY3RpdmUgaGFybmVzc1xuXHRcdFx0Ly8gYWN0dWFsbHkgY2hhbmdlZCB0byBhdm9pZCBmbGlja2VyIG9uIGhhcm5lc3MgcmVnaXN0cmF0aW9uIGV2ZW50cy5cblx0XHRcdGlmICh0aGlzLl9wcmV2aW91c0FjdGl2ZUhhcm5lc3NJZCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX3ByZXZpb3VzQWN0aXZlSGFybmVzc0lkICE9PSBhY3RpdmVJZCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtzZWN0aW9uLCB3aWRnZXRdIG9mIHRoaXMuY29udHJpYnV0ZWRTZWN0aW9uV2lkZ2V0cykge1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuZGVsZXRlKHdpZGdldCk7XG5cdFx0XHRcdFx0dGhpcy5jb250cmlidXRlZFNlY3Rpb25Db250YWluZXJzLmdldChzZWN0aW9uKT8ucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5jb250cmlidXRlZFNlY3Rpb25XaWRnZXRzLmNsZWFyKCk7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiB0aGlzLnNlY3Rpb25zKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVTZWN0aW9uQ291bnQoc2VjdGlvbi5pZCwgMCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3ByZXZpb3VzQWN0aXZlSGFybmVzc0lkID0gYWN0aXZlSWQ7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q3VzdG9taXphdGlvbnNTdHJ1Y3R1cmVkUHJldmlld0VuYWJsZWQpKSB7XG5cdFx0XHRcdHRoaXMub25TdHJ1Y3R1cmVkUHJldmlld1NldHRpbmdDaGFuZ2VkKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q3VzdG9taXphdGlvbnNQcm9tcHRNaWdyYXRpb25FbmFibGVkKSkge1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hQcm9tcHRNaWdyYXRpb25VaSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ0hBVF9BVVRPTUFUSU9OU19FTkFCTEVEX1NFVFRJTkcpKSB7XG5cdFx0XHRcdHRoaXMucmVidWlsZFZpc2libGVTZWN0aW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuY3JlYXRlU2lkZWJhck1pZ3JhdGlvblNob3J0Y3V0KHNpZGViYXJDb250ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgbGF5b3V0U2lkZWJhcih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuc2lkZWJhcldpZHRoID0gd2lkdGg7XG5cdFx0dGhpcy5zaWRlYmFySGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdGlmICghdGhpcy5zZWN0aW9uc0xpc3RDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTdWJ0cmFjdCBzaWRlYmFyLWNvbnRlbnQgcGFkZGluZyAoNHB4IGVhY2ggc2lkZSA9IDhweCksIHRoZSBmaXhlZCBoZWFkZXIsXG5cdFx0Ly8gYW5kIHRoZSBvcHRpb25hbCBtaWdyYXRpb24gcm93IHNvIHRoZSBzZWN0aW9ucyBsaXN0IG9ubHkgb2NjdXBpZXMgdGhlXG5cdFx0Ly8gc3BhY2UgaXQgbmVlZHMgYW5kIHRoZSBtaWdyYXRpb24gZW50cnkgY2FuIHNpdCBkaXJlY3RseSBiZW5lYXRoIGl0LlxuXHRcdGNvbnN0IGhlYWRlckhlaWdodCA9IHRoaXMuc2lkZWJhckhlYWRlckNvbnRhaW5lcj8ub2Zmc2V0SGVpZ2h0ID8/IDA7XG5cdFx0Y29uc3QgbWlncmF0aW9uSGVpZ2h0ID0gdGhpcy5taWdyYXRpb25TaG9ydGN1dENvbnRhaW5lcj8uc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnXG5cdFx0XHQ/ICh0aGlzLm1pZ3JhdGlvblNob3J0Y3V0Q29udGFpbmVyPy5vZmZzZXRIZWlnaHQgPz8gMClcblx0XHRcdDogMDtcblx0XHRjb25zdCBhdmFpbGFibGVMaXN0SGVpZ2h0ID0gTWF0aC5tYXgoMCwgaGVpZ2h0IC0gOCAtIGhlYWRlckhlaWdodCAtIG1pZ3JhdGlvbkhlaWdodCk7XG5cdFx0Y29uc3QgbGlzdEhlaWdodCA9IE1hdGgubWluKGF2YWlsYWJsZUxpc3RIZWlnaHQsIHRoaXMuc2VjdGlvbnMubGVuZ3RoICogMjYpO1xuXHRcdHRoaXMuc2VjdGlvbnNMaXN0Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2xpc3RIZWlnaHR9cHhgO1xuXHRcdHRoaXMuc2VjdGlvbnNMaXN0LmxheW91dChsaXN0SGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNpZGViYXJIZWFkZXIoc2lkZWJhckNvbnRlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgaGVhZGVyUm93ID0gdGhpcy5zaWRlYmFySGVhZGVyQ29udGFpbmVyID0gRE9NLmFwcGVuZChzaWRlYmFyQ29udGVudCwgJCgnLnNpZGViYXItaGVhZGVyLXJvdycpKTtcblxuXHRcdC8vIEhvbWUvb3ZlcnZpZXcgYnV0dG9uXG5cdFx0Y29uc3QgaG9tZUJ1dHRvbiA9IHRoaXMuaG9tZUJ1dHRvbiA9IERPTS5hcHBlbmQoaGVhZGVyUm93LCAkKCdidXR0b24uc2lkZWJhci1ob21lLWJ1dHRvbicpKTtcblx0XHRob21lQnV0dG9uLmNsYXNzTGlzdC5hZGQoJ3NpZGViYXItaGFybmVzcy1ob21lLWJ1dHRvbicpO1xuXHRcdGhvbWVCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2hvbWVCdXR0b24nLCBcIk92ZXJ2aWV3XCIpKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCBob21lQnV0dG9uLCBsb2NhbGl6ZSgnaG9tZUJ1dHRvblRvb2x0aXAnLCBcIkJhY2sgdG8gb3ZlcnZpZXdcIikpKTtcblx0XHRjb25zdCBob21lSWNvbiA9IHRoaXMuaG9tZUJ1dHRvbkljb24gPSBET00uYXBwZW5kKGhvbWVCdXR0b24sICQoJ3NwYW4uc2lkZWJhci1ob21lLWljb24nKSk7XG5cdFx0aG9tZUljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmhvbWUpKTtcblx0XHRob21lSWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRjb25zdCBob21lTGFiZWwgPSB0aGlzLmhvbWVCdXR0b25MYWJlbCA9IERPTS5hcHBlbmQoaG9tZUJ1dHRvbiwgJCgnc3Bhbi5zaWRlYmFyLWhvbWUtbGFiZWwnKSk7XG5cdFx0aG9tZUxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2hvbWVCdXR0b25MYWJlbCcsIFwiT3ZlcnZpZXdcIik7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihob21lQnV0dG9uLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnNob3dXZWxjb21lUGFnZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLnVwZGF0ZUhvbWVCdXR0b25IYXJuZXNzUHJlc2VudGF0aW9uKCk7XG5cblx0XHR0aGlzLnVwZGF0ZUhvbWVCdXR0b25TdHlsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVIb21lQnV0dG9uU3R5bGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmhvbWVCdXR0b25MYWJlbCB8fCAhdGhpcy5ob21lQnV0dG9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuaG9tZUJ1dHRvbkxhYmVsLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR0aGlzLmhvbWVCdXR0b24uc3R5bGUuZmxleCA9ICcxJztcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSG9tZUJ1dHRvbkhhcm5lc3NQcmVzZW50YXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVIYXJuZXNzTGFiZWxQcmVzZW50YXRpb24oKTtcblxuXHRcdGlmICghdGhpcy5ob21lQnV0dG9uIHx8ICF0aGlzLmhvbWVCdXR0b25JY29uIHx8ICF0aGlzLmhvbWVCdXR0b25MYWJlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaG9tZUJ1dHRvbkljb24uY2xhc3NOYW1lID0gJ3NpZGViYXItaG9tZS1pY29uJztcblx0XHR0aGlzLmhvbWVCdXR0b25JY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5ob21lKSk7XG5cdFx0dGhpcy5ob21lQnV0dG9uTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnaG9tZUJ1dHRvbkxhYmVsJywgXCJPdmVydmlld1wiKTtcblx0XHR0aGlzLmhvbWVCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2hvbWVCdXR0b24nLCBcIk92ZXJ2aWV3XCIpKTtcblx0XHR0aGlzLmhvbWVCdXR0b24udGl0bGUgPSBsb2NhbGl6ZSgnaG9tZUJ1dHRvblRvb2x0aXAnLCBcIkJhY2sgdG8gb3ZlcnZpZXdcIik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNpZGViYXJNaWdyYXRpb25TaG9ydGN1dChzaWRlYmFyQ29udGVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLm1pZ3JhdGlvblNob3J0Y3V0Q29udGFpbmVyID0gRE9NLmFwcGVuZChzaWRlYmFyQ29udGVudCwgJCgnLnNpZGViYXItbWlncmF0aW9uLXNob3J0Y3V0JykpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0RE9NLmFwcGVuZChjb250YWluZXIsICQoJ2Rpdi5zaWRlYmFyLW1pZ3JhdGlvbi1zZXBhcmF0b3InKSk7XG5cblx0XHRjb25zdCBidXR0b24gPSB0aGlzLm1pZ3JhdGlvblNob3J0Y3V0QnV0dG9uID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJ2J1dHRvbi5zaWRlYmFyLW1pZ3JhdGlvbi1idXR0b24nKSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0YnV0dG9uLnR5cGUgPSAnYnV0dG9uJztcblx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ21pZ3JhdGlvblNob3J0Y3V0QXJpYUxhYmVsJywgXCJNaWdyYXRlIHByb21wdCBmaWxlcyB0byBza2lsbHNcIikpO1xuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIGJ1dHRvbiwgbG9jYWxpemUoJ21pZ3JhdGlvblNob3J0Y3V0VG9vbHRpcCcsIFwiQ29udmVydCBkZXByZWNhdGVkIHByb21wdCBmaWxlcyB0byBza2lsbHNcIikpKTtcblxuXHRcdGNvbnN0IGljb24gPSBET00uYXBwZW5kKGJ1dHRvbiwgJCgnc3Bhbi5zaWRlYmFyLW1pZ3JhdGlvbi1pY29uJykpO1xuXHRcdGljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLndhcm5pbmcpKTtcblx0XHRpY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXG5cdFx0Y29uc3QgbGFiZWwgPSBET00uYXBwZW5kKGJ1dHRvbiwgJCgnc3Bhbi5zaWRlYmFyLW1pZ3JhdGlvbi1sYWJlbCcpKTtcblx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdtaWdyYXRpb25TaG9ydGN1dExhYmVsJywgXCJNaWdyYXRlIFByb21wdHNcIik7XG5cblx0XHR0aGlzLm1pZ3JhdGlvblNob3J0Y3V0Q291bnQgPSBET00uYXBwZW5kKGJ1dHRvbiwgJCgnc3Bhbi5zaWRlYmFyLW1pZ3JhdGlvbi1jb3VudCcpKTtcblxuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnNob3dQcm9tcHRNaWdyYXRpb25QYWdlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVXZWxjb21lUGFnZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy53ZWxjb21lUGFnZSA9IHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKG5ldyBBSUN1c3RvbWl6YXRpb25XZWxjb21lUGFnZShcblx0XHRcdHBhcmVudCxcblx0XHRcdHRoaXMud29ya3NwYWNlU2VydmljZS53ZWxjb21lUGFnZUZlYXR1cmVzLFxuXHRcdFx0e1xuXHRcdFx0XHRzZWxlY3RTZWN0aW9uOiAoc2VjdGlvbikgPT4gdGhpcy5zZWxlY3RTZWN0aW9uKHNlY3Rpb24pLFxuXHRcdFx0XHRzZWxlY3RTZWN0aW9uV2l0aE1hcmtldHBsYWNlOiAoc2VjdGlvbikgPT4gdGhpcy5zZWxlY3RTZWN0aW9uKHNlY3Rpb24sIHsgc2hvd01hcmtldHBsYWNlOiB0cnVlIH0pLFxuXHRcdFx0XHRjbG9zZUVkaXRvcjogKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLmlucHV0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLmdyb3VwLmNsb3NlRWRpdG9yKHRoaXMuaW5wdXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0bWlncmF0ZVByb21wdEZpbGVzOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5zaG93UHJvbXB0TWlncmF0aW9uUGFnZSgpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRwcmVmaWxsQ2hhdDogYXN5bmMgKHF1ZXJ5LCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLndvcmtzcGFjZVNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzZXNzaW9uc1ZpZXdJZCA9ICd3b3JrYmVuY2gudmlldy5zZXNzaW9ucy5jaGF0Jztcblx0XHRcdFx0XHRcdFx0aWYgKG9wdGlvbnM/Lm5ld0NoYXQpIHtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLnNlc3Npb25zLm5ld0NoYXQnKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRjb25zdCB2aWV3ID0gYXdhaXQgdGhpcy52aWV3c1NlcnZpY2Uub3BlblZpZXcoc2Vzc2lvbnNWaWV3SWQsIHRydWUpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjaGF0VmlldyA9IHZpZXcgYXMgdW5rbm93biBhcyB7IHByZWZpbGxJbnB1dD8odGV4dDogc3RyaW5nKTogdm9pZDsgc2VuZFF1ZXJ5Pyh0ZXh0OiBzdHJpbmcpOiB2b2lkIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdGlmIChvcHRpb25zPy5pc1BhcnRpYWxRdWVyeSAmJiBjaGF0Vmlldz8ucHJlZmlsbElucHV0KSB7XG5cdFx0XHRcdFx0XHRcdFx0Y2hhdFZpZXcucHJlZmlsbElucHV0KHF1ZXJ5KTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmIChjaGF0Vmlldz8uc2VuZFF1ZXJ5KSB7XG5cdFx0XHRcdFx0XHRcdFx0Y2hhdFZpZXcuc2VuZFF1ZXJ5KHF1ZXJ5KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0aWYgKG9wdGlvbnM/Lm5ld0NoYXQpIHtcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQubmV3Q2hhdCcpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuJywgeyBxdWVyeSwgaXNQYXJ0aWFsUXVlcnk6IG9wdGlvbnM/LmlzUGFydGlhbFF1ZXJ5ID8/IGZhbHNlIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0dGhpcy5jb21tYW5kU2VydmljZSxcblx0XHRcdHRoaXMud29ya3NwYWNlU2VydmljZSxcblx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLFxuXHRcdFx0dGhpcy5nZXRBY3RpdmVIYXJuZXNzTGFiZWwoKSxcblx0XHQpKTtcblx0XHR0aGlzLndlbGNvbWVQYWdlLnJlYnVpbGRDYXJkcyhuZXcgU2V0KHRoaXMuc2VjdGlvbnMubWFwKHMgPT4gcy5pZCkpKTtcblx0XHR0aGlzLndlbGNvbWVQYWdlLnNldFByb21wdE1pZ3JhdGlvbkluZm8oZ2V0UHJvbXB0TWlncmF0aW9uSW5mbyh0aGlzLnByb21wdEZpbGVzVG9NaWdyYXRlKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUJhY2tBcnJvd0J1dHRvbihvbkNsaWNrPzogKCkgPT4gdm9pZCk6IEhUTUxCdXR0b25FbGVtZW50IHtcblx0XHRjb25zdCBidXR0b24gPSAkKCdidXR0b24uc2VjdGlvbi1iYWNrLWFycm93LWJ1dHRvbicpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdGJ1dHRvbi50eXBlID0gJ2J1dHRvbic7XG5cdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdiYWNrVG9PdmVydmlldycsIFwiQmFjayB0byBvdmVydmlld1wiKSk7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgYnV0dG9uLCBsb2NhbGl6ZSgnYmFja1RvT3ZlcnZpZXdUb29sdGlwJywgXCJCYWNrIHRvIG92ZXJ2aWV3XCIpKSk7XG5cdFx0Y29uc3QgaWNvbiA9IERPTS5hcHBlbmQoYnV0dG9uLCAkKCdzcGFuLnNlY3Rpb24tYmFjay1hcnJvdy1pY29uJykpO1xuXHRcdGljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmFycm93TGVmdCkpO1xuXHRcdGljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sICdjbGljaycsICgpID0+IHtcblx0XHRcdGlmIChvbkNsaWNrKSB7XG5cdFx0XHRcdG9uQ2xpY2soKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2hvd1dlbGNvbWVQYWdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHJldHVybiBidXR0b247XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVByb21wdE1pZ3JhdGlvbkNvbnRlbnQoY29udGVudElubmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMubWlncmF0aW9uQ29udGVudENvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGVudElubmVyLCAkKCcucHJvbXB0LW1pZ3JhdGlvbi1jb250ZW50LWNvbnRhaW5lci5haS1jdXN0b21pemF0aW9uLWxpc3Qtd2lkZ2V0JykpO1xuXG5cdFx0Y29uc3QgaGVhZGVyID0gRE9NLmFwcGVuZCh0aGlzLm1pZ3JhdGlvbkNvbnRlbnRDb250YWluZXIsICQoJy5zZWN0aW9uLXRpdGxlLWhlYWRlcicpKTtcblx0XHRjb25zdCB0aXRsZVJvdyA9IERPTS5hcHBlbmQoaGVhZGVyLCAkKCcuc2VjdGlvbi10aXRsZS1yb3cnKSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBET00uYXBwZW5kKHRpdGxlUm93LCAkKCdoMi5zZWN0aW9uLXRpdGxlJykpO1xuXHRcdHRpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3Byb21wdE1pZ3JhdGlvblBhZ2VUaXRsZScsIFwiTWlncmF0ZSBQcm9tcHQgRmlsZXNcIik7XG5cdFx0dGhpcy5taWdyYXRpb25EZXNjcmlwdGlvbkVsZW1lbnQgPSBET00uYXBwZW5kKGhlYWRlciwgJCgncC5zZWN0aW9uLXRpdGxlLWRlc2NyaXB0aW9uJykpO1xuXHRcdGNvbnN0IHNlY3Rpb25MaW5rID0gRE9NLmFwcGVuZChoZWFkZXIsICQoJ2Euc2VjdGlvbi10aXRsZS1saW5rJykpIGFzIEhUTUxBbmNob3JFbGVtZW50O1xuXHRcdHNlY3Rpb25MaW5rLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2xlYXJuTW9yZVNraWxscycsIFwiTGVhcm4gbW9yZSBhYm91dCBhZ2VudCBza2lsbHNcIik7XG5cdFx0c2VjdGlvbkxpbmsuaHJlZiA9ICdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2FnZW50LWN1c3RvbWl6YXRpb24vYWdlbnQtc2tpbGxzP3JlZmVycmVyPWluLXByb2R1Y3QnO1xuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoc2VjdGlvbkxpbmssICdjbGljaycsIGUgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKHNlY3Rpb25MaW5rLmhyZWYpKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gRE9NLmFwcGVuZCh0aGlzLm1pZ3JhdGlvbkNvbnRlbnRDb250YWluZXIsICQoJy5saXN0LXNlYXJjaC1hbmQtYnV0dG9uLWNvbnRhaW5lci5wcm9tcHQtbWlncmF0aW9uLWFjdGlvbnMnKSk7XG5cdFx0Y29uc3Qgc2VhcmNoQ29udGFpbmVyID0gRE9NLmFwcGVuZChhY3Rpb25zLCAkKCcubGlzdC1zZWFyY2gtY29udGFpbmVyJykpO1xuXHRcdHRoaXMubWlncmF0aW9uU2VhcmNoSW5wdXQgPSB0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChuZXcgSW5wdXRCb3goc2VhcmNoQ29udGFpbmVyLCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwge1xuXHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25TZWFyY2hQbGFjZWhvbGRlcicsIFwiVHlwZSB0byBzZWFyY2guLi5cIiksXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzLFxuXHRcdH0pKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLm1pZ3JhdGlvblNlYXJjaElucHV0Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMubWlncmF0aW9uU2VhcmNoUXVlcnkgPSB0aGlzLm1pZ3JhdGlvblNlYXJjaElucHV0Py52YWx1ZSA/PyAnJztcblx0XHRcdHRoaXMucmVuZGVyUHJvbXB0TWlncmF0aW9uUGFnZSgpO1xuXHRcdH0pKTtcblx0XHRjb25zdCBhY3Rpb25CdXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKGFjdGlvbnMsICQoJy5saXN0LWFkZC1idXR0b24tY29udGFpbmVyJykpO1xuXHRcdHRoaXMubWlncmF0aW9uTWlncmF0ZUJ1dHRvbiA9IHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oYWN0aW9uQnV0dG9uQ29udGFpbmVyLCBkZWZhdWx0QnV0dG9uU3R5bGVzKSk7XG5cdFx0dGhpcy5taWdyYXRpb25NaWdyYXRlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbGlzdC1hZGQtYnV0dG9uJywgJ3Byb21wdC1taWdyYXRpb24tYnV0dG9uJyk7XG5cdFx0dGhpcy5taWdyYXRpb25NaWdyYXRlQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ3Byb21wdE1pZ3JhdGlvblBhZ2VCdXR0b24nLCBcIk1pZ3JhdGVcIik7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgdGhpcy5taWdyYXRpb25NaWdyYXRlQnV0dG9uLmVsZW1lbnQsIGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25QYWdlQnV0dG9uVG9vbHRpcCcsIFwiQ29udmVydCBzZWxlY3RlZCBwcm9tcHQgZmlsZXMgdG8gc2tpbGxzXCIpKSk7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5taWdyYXRpb25NaWdyYXRlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRQcm9tcHRGaWxlcyA9IHRoaXMucHJvbXB0RmlsZXNUb01pZ3JhdGUuZmlsdGVyKGZpbGUgPT4gdGhpcy5zZWxlY3RlZFByb21wdE1pZ3JhdGlvblVyaXMuaGFzKGZpbGUudXJpKSk7XG5cdFx0XHR2b2lkIHRoaXMubWlncmF0ZVByb21wdEZpbGVzKHNlbGVjdGVkUHJvbXB0RmlsZXMpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMubWlncmF0aW9uTGlzdENvbnRhaW5lciA9ICQoJy5wcm9tcHQtbWlncmF0aW9uLWxpc3QubGlzdC1jb250YWluZXInKTtcblx0XHR0aGlzLm1pZ3JhdGlvbkxpc3RTY3JvbGxhYmxlID0gdGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHRoaXMubWlncmF0aW9uTGlzdENvbnRhaW5lciwge1xuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0dXNlU2hhZG93czogZmFsc2UsXG5cdFx0fSkpO1xuXHRcdGNvbnN0IG1pZ3JhdGlvbkxpc3RTY3JvbGxhYmxlTm9kZSA9IHRoaXMubWlncmF0aW9uTGlzdFNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpO1xuXHRcdG1pZ3JhdGlvbkxpc3RTY3JvbGxhYmxlTm9kZS5jbGFzc0xpc3QuYWRkKCdwcm9tcHQtbWlncmF0aW9uLWxpc3Qtc2Nyb2xsYWJsZScpO1xuXHRcdHRoaXMubWlncmF0aW9uQ29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChtaWdyYXRpb25MaXN0U2Nyb2xsYWJsZU5vZGUpO1xuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IERPTS5nZXRXaW5kb3codGhpcy5taWdyYXRpb25Db250ZW50Q29udGFpbmVyKTtcblx0XHRjb25zdCBtaWdyYXRpb25SZXNpemVPYnNlcnZlciA9IHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKG5ldyBET00uRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKFxuXHRcdFx0J0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3IucHJvbXB0TWlncmF0aW9uTGlzdFNjcm9sbGFibGUnLFxuXHRcdFx0KCkgPT4gdGhpcy5taWdyYXRpb25MaXN0U2Nyb2xsYWJsZT8uc2NhbkRvbU5vZGUoKSxcblx0XHRcdHRhcmdldFdpbmRvdyxcblx0XHQpKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChtaWdyYXRpb25SZXNpemVPYnNlcnZlci5vYnNlcnZlKG1pZ3JhdGlvbkxpc3RTY3JvbGxhYmxlTm9kZSkpO1xuXHRcdHRoaXMucmVuZGVyUHJvbXB0TWlncmF0aW9uUGFnZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb250ZW50KCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRlbnRJbm5lciA9IERPTS5hcHBlbmQodGhpcy5jb250ZW50Q29udGFpbmVyLCAkKCcuY29udGVudC1pbm5lcicpKTtcblxuXHRcdC8vIFdlbGNvbWUgcGFnZSAoc2hvd24gd2hlbiBubyBzZWN0aW9uIGlzIHNlbGVjdGVkKVxuXHRcdHRoaXMuY3JlYXRlV2VsY29tZVBhZ2UoY29udGVudElubmVyKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLnByb21wdHNTZXJ2aWNlLm9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcygoKSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMucmVmcmVzaFByb21wdE1pZ3JhdGlvbkluZm8oKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5oYXJuZXNzU2VydmljZS5hY3RpdmVIYXJuZXNzLnJlYWQocmVhZGVyKTtcblx0XHRcdHZvaWQgdGhpcy5yZWZyZXNoUHJvbXB0TWlncmF0aW9uSW5mbygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIENvbnRhaW5lciBmb3IgcHJvbXB0cy1iYXNlZCBjb250ZW50IChBZ2VudHMsIFNraWxscywgSW5zdHJ1Y3Rpb25zLCBQcm9tcHRzKVxuXHRcdHRoaXMucHJvbXB0c0NvbnRlbnRDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRlbnRJbm5lciwgJCgnLnByb21wdHMtY29udGVudC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5saXN0V2lkZ2V0ID0gdGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0KSk7XG5cdFx0dGhpcy5wcm9tcHRzQ29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmxpc3RXaWRnZXQuZWxlbWVudCk7XG5cdFx0dGhpcy5jcmVhdGVQcm9tcHRNaWdyYXRpb25Db250ZW50KGNvbnRlbnRJbm5lcik7XG5cblx0XHQvLyBIYW5kbGUgaXRlbSBzZWxlY3Rpb25cblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmxpc3RXaWRnZXQub25EaWRTZWxlY3RJdGVtKGl0ZW0gPT4ge1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q3VzdG9taXphdGlvbkVkaXRvckl0ZW1TZWxlY3RlZEV2ZW50LCBDdXN0b21pemF0aW9uRWRpdG9ySXRlbVNlbGVjdGVkQ2xhc3NpZmljYXRpb24+KCdjaGF0Q3VzdG9taXphdGlvbkVkaXRvci5pdGVtU2VsZWN0ZWQnLCB7XG5cdFx0XHRcdHNlY3Rpb246IHRoaXMuc2VsZWN0ZWRTZWN0aW9uID8/ICd3ZWxjb21lJyxcblx0XHRcdFx0cHJvbXB0VHlwZTogaXRlbS5wcm9tcHRUeXBlLFxuXHRcdFx0XHRzdG9yYWdlOiBpdGVtLnNvdXJjZSA/PyAnZXh0ZXJuYWwnLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBpdGVtLnNvdXJjZTtcblx0XHRcdGNvbnN0IGlzV29ya3NwYWNlRmlsZSA9IHNvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy5sb2NhbDtcblx0XHRcdGNvbnN0IGlzUmVhZE9ubHkgPSAhc291cmNlIHx8IHNvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy5leHRlbnNpb24gfHwgc291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbiB8fCBzb3VyY2UgPT09IEFJQ3VzdG9taXphdGlvblNvdXJjZXMuYnVpbHRpbjtcblx0XHRcdHRoaXMuc2hvd0VtYmVkZGVkRWRpdG9yKGl0ZW0udXJpLCBpdGVtLm5hbWUsIGl0ZW0ucHJvbXB0VHlwZSwgc291cmNlID8/IEFJQ3VzdG9taXphdGlvblNvdXJjZXMuYnVpbHRpbiwgaXNXb3Jrc3BhY2VGaWxlLCBpc1JlYWRPbmx5KTtcblx0XHR9KSk7XG5cblx0XHQvLyBIYW5kbGUgY3JlYXRlIGFjdGlvbnMgLSBBSS1ndWlkZWQgY3JlYXRpb25cblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmxpc3RXaWRnZXQub25EaWRSZXF1ZXN0Q3JlYXRlKHByb21wdFR5cGUgPT4ge1xuXHRcdFx0dGhpcy5jcmVhdGVOZXdJdGVtV2l0aEFJKHByb21wdFR5cGUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEhhbmRsZSBtYW51YWwgY3JlYXRlIGFjdGlvbnMgLSBvcGVuIGVkaXRvciBkaXJlY3RseVxuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMubGlzdFdpZGdldC5vbkRpZFJlcXVlc3RDcmVhdGVNYW51YWwoKHsgdHlwZSwgdGFyZ2V0LCByb290RmlsZU5hbWUgfSkgPT4ge1xuXHRcdFx0dGhpcy5jcmVhdGVOZXdJdGVtTWFudWFsKHR5cGUsIHRhcmdldCwgcm9vdEZpbGVOYW1lKTtcblx0XHR9KSk7XG5cblx0XHQvLyBDb250YWluZXIgZm9yIE1vZGVscyBjb250ZW50IChvbmx5IGluIHNlc3Npb25zKVxuXHRcdGNvbnN0IGhhc1NlY3Rpb25zID0gbmV3IFNldCh0aGlzLndvcmtzcGFjZVNlcnZpY2UubWFuYWdlbWVudFNlY3Rpb25zKTtcblx0XHRpZiAoaGFzU2VjdGlvbnMuaGFzKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1vZGVscykpIHtcblx0XHRcdHRoaXMubW9kZWxzQ29udGVudENvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGVudElubmVyLCAkKCcubW9kZWxzLWNvbnRlbnQtY29udGFpbmVyJykpO1xuXHRcdFx0Y29uc3QgbW9kZWxzQmFja0JhciA9IERPTS5hcHBlbmQodGhpcy5tb2RlbHNDb250ZW50Q29udGFpbmVyLCAkKCcuc2VjdGlvbi1iYWNrLWJhcicpKTtcblx0XHRcdG1vZGVsc0JhY2tCYXIuYXBwZW5kQ2hpbGQodGhpcy5jcmVhdGVCYWNrQXJyb3dCdXR0b24oKSk7XG5cdFx0XHR0aGlzLm1vZGVsc1dpZGdldCA9IHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1vZGVsc1dpZGdldCkpO1xuXHRcdFx0dGhpcy5tb2RlbHNDb250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMubW9kZWxzV2lkZ2V0LmVsZW1lbnQpO1xuXG5cdFx0XHR0aGlzLm1vZGVsc0Zvb3RlckVsZW1lbnQgPSBET00uYXBwZW5kKHRoaXMubW9kZWxzQ29udGVudENvbnRhaW5lciwgJCgnLnNlY3Rpb24tZm9vdGVyJykpO1xuXHRcdFx0Y29uc3QgbW9kZWxzRGVzY3JpcHRpb24gPSBET00uYXBwZW5kKHRoaXMubW9kZWxzRm9vdGVyRWxlbWVudCwgJCgncC5zZWN0aW9uLWZvb3Rlci1kZXNjcmlwdGlvbicpKTtcblx0XHRcdG1vZGVsc0Rlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ21vZGVsc0Rlc2NyaXB0aW9uJywgXCJCcm93c2UgYW5kIG1hbmFnZSBsYW5ndWFnZSBtb2RlbHMgZnJvbSBkaWZmZXJlbnQgcHJvdmlkZXJzLiBTZWxlY3QgbW9kZWxzIGZvciB1c2UgaW4gY2hhdCwgY29kZSBjb21wbGV0aW9uLCBhbmQgb3RoZXIgQUkgZmVhdHVyZXMuXCIpO1xuXHRcdFx0Y29uc3QgbW9kZWxzTGluayA9IERPTS5hcHBlbmQodGhpcy5tb2RlbHNGb290ZXJFbGVtZW50LCAkKCdhLnNlY3Rpb24tZm9vdGVyLWxpbmsnKSkgYXMgSFRNTEFuY2hvckVsZW1lbnQ7XG5cdFx0XHRtb2RlbHNMaW5rLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2xlYXJuTW9yZU1vZGVscycsIFwiTGVhcm4gbW9yZSBhYm91dCBsYW5ndWFnZSBtb2RlbHNcIik7XG5cdFx0XHRtb2RlbHNMaW5rLmhyZWYgPSAnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9hZ2VudC1jdXN0b21pemF0aW9uL2xhbmd1YWdlLW1vZGVscz9yZWZlcnJlcj1pbi1wcm9kdWN0Jztcblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobW9kZWxzTGluaywgJ2NsaWNrJywgKGUpID0+IHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UobW9kZWxzTGluay5ocmVmKSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGFpbmVyIGZvciBNQ1AgY29udGVudFxuXHRcdGlmIChoYXNTZWN0aW9ucy5oYXMoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uTWNwU2VydmVycykpIHtcblx0XHRcdHRoaXMubWNwQ29udGVudENvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGVudElubmVyLCAkKCcubWNwLWNvbnRlbnQtY29udGFpbmVyJykpO1xuXHRcdFx0dGhpcy5tY3BMaXN0V2lkZ2V0ID0gdGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BMaXN0V2lkZ2V0KSk7XG5cdFx0XHR0aGlzLm1jcExpc3RXaWRnZXQuc2V0Q2xvc2VDdXN0b21pemF0aW9uRWRpdG9yKGFzeW5jICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuaW5wdXQpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmdyb3VwLmNsb3NlRWRpdG9yKHRoaXMuaW5wdXQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMubWNwQ29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLm1jcExpc3RXaWRnZXQuZWxlbWVudCk7XG5cblx0XHRcdC8vIEVtYmVkZGVkIE1DUCBzZXJ2ZXIgZGV0YWlsIHZpZXdcblx0XHRcdHRoaXMubWNwRGV0YWlsQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb250ZW50SW5uZXIsICQoJy5tY3AtZGV0YWlsLWNvbnRhaW5lcicpKTtcblx0XHRcdHRoaXMuY3JlYXRlRW1iZWRkZWRNY3BEZXRhaWwoKTtcblxuXHRcdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5tY3BMaXN0V2lkZ2V0Lm9uRGlkU2VsZWN0U2VydmVyKHNlcnZlciA9PiB7XG5cdFx0XHRcdHRoaXMuc2hvd0VtYmVkZGVkTWNwRGV0YWlsKHNlcnZlcik7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMubWNwTGlzdFdpZGdldC5vbkRpZFJlcXVlc3RTaG93UGx1Z2luKGl0ZW0gPT4ge1xuXHRcdFx0XHR0aGlzLnNob3dQbHVnaW5EZXRhaWwoaXRlbSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGFpbmVyIGZvciBQbHVnaW5zIGNvbnRlbnRcblx0XHRpZiAoaGFzU2VjdGlvbnMuaGFzKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMpKSB7XG5cdFx0XHR0aGlzLnBsdWdpbkNvbnRlbnRDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRlbnRJbm5lciwgJCgnLnBsdWdpbi1jb250ZW50LWNvbnRhaW5lcicpKTtcblx0XHRcdHRoaXMucGx1Z2luTGlzdFdpZGdldCA9IHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGx1Z2luTGlzdFdpZGdldCkpO1xuXHRcdFx0dGhpcy5wbHVnaW5Db250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMucGx1Z2luTGlzdFdpZGdldC5lbGVtZW50KTtcblxuXHRcdFx0Ly8gRW1iZWRkZWQgcGx1Z2luIGRldGFpbCB2aWV3XG5cdFx0XHR0aGlzLnBsdWdpbkRldGFpbENvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGVudElubmVyLCAkKCcucGx1Z2luLWRldGFpbC1jb250YWluZXInKSk7XG5cdFx0XHR0aGlzLmNyZWF0ZUVtYmVkZGVkUGx1Z2luRGV0YWlsKCk7XG5cblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMucGx1Z2luTGlzdFdpZGdldC5vbkRpZFNlbGVjdFBsdWdpbihpdGVtID0+IHtcblx0XHRcdFx0dGhpcy5wbHVnaW5EZXRhaWxSZXR1cm5TZWN0aW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLnNob3dFbWJlZGRlZFBsdWdpbkRldGFpbChpdGVtKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBDb250YWluZXIgZm9yIFRvb2xzIGNvbnRlbnQuXG5cdFx0aWYgKGhhc1NlY3Rpb25zLmhhcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ub29scykpIHtcblx0XHRcdHRoaXMudG9vbHNDb250ZW50Q29udGFpbmVyID0gRE9NLmFwcGVuZChjb250ZW50SW5uZXIsICQoJy50b29scy1jb250ZW50LWNvbnRhaW5lcicpKTtcblx0XHRcdC8vIFRvb2xzIGN1c3RvbWl6YXRpb25zIG9ubHkgdGFyZ2V0IHRoZSBhZ2VudCBob3N0IChDb3BpbG90IENMSSksIGluIGJvdGggd2luZG93cy5cblx0XHRcdHRoaXMudG9vbHNMaXN0V2lkZ2V0ID0gdGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUb29sc0xpc3RXaWRnZXQsIEFHRU5UX0hPU1RfQ09QSUxPVF9DTElfU0VTU0lPTl9UWVBFKSk7XG5cdFx0XHR0aGlzLnRvb2xzQ29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLnRvb2xzTGlzdFdpZGdldC5lbGVtZW50KTtcblxuXHRcdFx0Ly8gRW1iZWRkZWQgdG9vbC1jb250cmlidXRpbmcgZXh0ZW5zaW9uIGRldGFpbCB2aWV3XG5cdFx0XHR0aGlzLnRvb2xzRGV0YWlsQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb250ZW50SW5uZXIsICQoJy50b29scy1kZXRhaWwtY29udGFpbmVyJykpO1xuXHRcdFx0dGhpcy5jcmVhdGVFbWJlZGRlZFRvb2xEZXRhaWwoKTtcblxuXHRcdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy50b29sc0xpc3RXaWRnZXQub25EaWRTZWxlY3RFeHRlbnNpb24oZXh0ZW5zaW9uID0+IHtcblx0XHRcdFx0dGhpcy5zaG93RW1iZWRkZWRUb29sRGV0YWlsKGV4dGVuc2lvbik7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGFpbmVyIGZvciBBdXRvbWF0aW9ucyBjb250ZW50XG5cdFx0aWYgKGhhc1NlY3Rpb25zLmhhcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BdXRvbWF0aW9ucykpIHtcblx0XHRcdHRoaXMuYXV0b21hdGlvbnNDb250ZW50Q29udGFpbmVyID0gRE9NLmFwcGVuZChjb250ZW50SW5uZXIsICQoJy5hdXRvbWF0aW9ucy1jb250ZW50LWNvbnRhaW5lcicpKTtcblx0XHRcdHRoaXMuYXV0b21hdGlvbnNMaXN0V2lkZ2V0ID0gdGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBdXRvbWF0aW9uc0xpc3RXaWRnZXQpKTtcblx0XHRcdHRoaXMuYXV0b21hdGlvbnNDb250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuYXV0b21hdGlvbnNMaXN0V2lkZ2V0LmVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiB0aGlzLndvcmtzcGFjZVNlcnZpY2UubWFuYWdlbWVudFNlY3Rpb25zKSB7XG5cdFx0XHRpZiAoIWFpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uUmVnaXN0cnkuaGFzKHNlY3Rpb24pKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gRE9NLmFwcGVuZChjb250ZW50SW5uZXIsICQoJy5jb250cmlidXRlZC1zZWN0aW9uLWNvbnRhaW5lcicpKTtcblx0XHRcdHRoaXMuY29udHJpYnV0ZWRTZWN0aW9uQ29udGFpbmVycy5zZXQoc2VjdGlvbiwgY29udGFpbmVyKTtcblx0XHR9XG5cblx0XHQvLyBFbWJlZGRlZCBlZGl0b3IgY29udGFpbmVyXG5cdFx0dGhpcy5lZGl0b3JDb250ZW50Q29udGFpbmVyID0gRE9NLmFwcGVuZChjb250ZW50SW5uZXIsICQoJy5lZGl0b3ItY29udGVudC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5jcmVhdGVFbWJlZGRlZEVkaXRvcigpO1xuXG5cdFx0Ly8gU2V0IGluaXRpYWwgdmlzaWJpbGl0eSBiYXNlZCBvbiBzZWxlY3RlZCBzZWN0aW9uXG5cdFx0dGhpcy51cGRhdGVDb250ZW50VmlzaWJpbGl0eSgpO1xuXG5cdFx0Ly8gV2lyZSB1cCBzZWN0aW9uIGNvdW50IHVwZGF0ZXMgXHUyMDE0IGFjdGl2ZSBwcm9tcHRzIHNlY3Rpb24gZ2V0cyBpdHMgY291bnRcblx0XHQvLyBmcm9tIHRoZSBsaXN0IHdpZGdldDsgYWxsIHByb21wdHMgc2VjdGlvbnMgYXJlIGFsc28gcmVmcmVzaGVkIGZyb21cblx0XHQvLyB0aGUgcHJvbXB0cyBzZXJ2aWNlIG9uIGV2ZXJ5IGNoYW5nZSBldmVudCBmb3IgY29uc2lzdGVuY3kuXG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5saXN0V2lkZ2V0Lm9uRGlkQ2hhbmdlSXRlbUNvdW50KGNvdW50ID0+IHtcblx0XHRcdGlmICh0aGlzLmlzUHJvbXB0c1NlY3Rpb24odGhpcy5zZWxlY3RlZFNlY3Rpb24pKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2VjdGlvbkNvdW50KHRoaXMuc2VsZWN0ZWRTZWN0aW9uLCBjb3VudCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGlmICh0aGlzLm1jcExpc3RXaWRnZXQpIHtcblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMubWNwTGlzdFdpZGdldC5vbkRpZENoYW5nZUl0ZW1Db3VudChjb3VudCA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2VjdGlvbkNvdW50KEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMsIGNvdW50KTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMubWNwTGlzdFdpZGdldC5maXJlSXRlbUNvdW50KCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnBsdWdpbkxpc3RXaWRnZXQpIHtcblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMucGx1Z2luTGlzdFdpZGdldC5vbkRpZENoYW5nZUl0ZW1Db3VudChjb3VudCA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2VjdGlvbkNvdW50KEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMsIGNvdW50KTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMucGx1Z2luTGlzdFdpZGdldC5maXJlSXRlbUNvdW50KCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmF1dG9tYXRpb25zTGlzdFdpZGdldCkge1xuXHRcdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5hdXRvbWF0aW9uc0xpc3RXaWRnZXQub25EaWRDaGFuZ2VJdGVtQ291bnQoY291bnQgPT4ge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVNlY3Rpb25Db3VudChBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BdXRvbWF0aW9ucywgY291bnQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5hdXRvbWF0aW9uc0xpc3RXaWRnZXQuZmlyZUl0ZW1Db3VudCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5tb2RlbHNXaWRnZXQpIHtcblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMubW9kZWxzV2lkZ2V0Lm9uRGlkQ2hhbmdlSXRlbUNvdW50KGNvdW50ID0+IHtcblx0XHRcdFx0dGhpcy51cGRhdGVTZWN0aW9uQ291bnQoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uTW9kZWxzLCBjb3VudCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLm1vZGVsc1dpZGdldC5maXJlSXRlbUNvdW50KCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnRvb2xzTGlzdFdpZGdldCkge1xuXHRcdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy50b29sc0xpc3RXaWRnZXQub25EaWRDaGFuZ2VJdGVtQ291bnQoY291bnQgPT4ge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVNlY3Rpb25Db3VudChBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ub29scywgY291bnQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy50b29sc0xpc3RXaWRnZXQuZmlyZUl0ZW1Db3VudCgpO1xuXHRcdH1cblxuXHRcdC8vIFBlci1wcm9tcHRzLXNlY3Rpb24gYXV0b3J1bnM6IGRyaXZlIHNpZGViYXIgY291bnRzIGZyb20gdGhlIGl0ZW1zIG1vZGVsLFxuXHRcdC8vIHRoZSBzYW1lIHNvdXJjZSB0aGUgZWRpdG9yIGxpc3Qgd2lkZ2V0IHJlbmRlcnMgZnJvbS5cblx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2YgSVRFTVNfTU9ERUxfU0VDVElPTlMpIHtcblx0XHRcdGNvbnN0IG9ic2VydmFibGUgPSB0aGlzLml0ZW1zTW9kZWwuZ2V0Q291bnQoc2VjdGlvbik7XG5cdFx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2VjdGlvbkNvdW50KHNlY3Rpb24sIG9ic2VydmFibGUucmVhZChyZWFkZXIpKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBMb2FkIGl0ZW1zIGZvciB0aGUgaW5pdGlhbCBzZWN0aW9uXG5cdFx0aWYgKHRoaXMuaXNQcm9tcHRzU2VjdGlvbih0aGlzLnNlbGVjdGVkU2VjdGlvbikpIHtcblx0XHRcdHZvaWQgdGhpcy5saXN0V2lkZ2V0LnNldFNlY3Rpb24odGhpcy5zZWxlY3RlZFNlY3Rpb24pO1xuXHRcdH1cblxuXHRcdHZvaWQgdGhpcy5yZWZyZXNoUHJvbXB0TWlncmF0aW9uSW5mbygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWZyZXNoUHJvbXB0TWlncmF0aW9uSW5mbygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhY3RpdmVIYXJuZXNzSWQgPSB0aGlzLmhhcm5lc3NTZXJ2aWNlLmFjdGl2ZUhhcm5lc3MuZ2V0KCk7XG5cdFx0Y29uc3QgcmVmcmVzaFNlcXVlbmNlID0gKyt0aGlzLnByb21wdE1pZ3JhdGlvblJlZnJlc2hTZXF1ZW5jZTtcblxuXHRcdGlmICghaXNBZ2VudEhvc3RUYXJnZXQoYWN0aXZlSGFybmVzc0lkKSkge1xuXHRcdFx0dGhpcy5zZXRQcm9tcHRGaWxlc1RvTWlncmF0ZShbXSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHByb21wdEZpbGVzID0gYXdhaXQgdGhpcy5wcm9tcHRzU2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGlmIChyZWZyZXNoU2VxdWVuY2UgIT09IHRoaXMucHJvbXB0TWlncmF0aW9uUmVmcmVzaFNlcXVlbmNlIHx8IGFjdGl2ZUhhcm5lc3NJZCAhPT0gdGhpcy5oYXJuZXNzU2VydmljZS5hY3RpdmVIYXJuZXNzLmdldCgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zZXRQcm9tcHRGaWxlc1RvTWlncmF0ZShwcm9tcHRGaWxlcy5maWx0ZXIoZmlsZSA9PiBmaWxlLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmxvY2FsIHx8IGZpbGUuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UudXNlcikpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAocmVmcmVzaFNlcXVlbmNlID09PSB0aGlzLnByb21wdE1pZ3JhdGlvblJlZnJlc2hTZXF1ZW5jZSkge1xuXHRcdFx0XHR0aGlzLnNldFByb21wdEZpbGVzVG9NaWdyYXRlKFtdKTtcblx0XHRcdH1cblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldFByb21wdEZpbGVzVG9NaWdyYXRlKHByb21wdEZpbGVzOiByZWFkb25seSBJUHJvbXB0UGF0aFtdKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXNQcm9tcHRVcmlzID0gbmV3IFJlc291cmNlU2V0KHRoaXMucHJvbXB0RmlsZXNUb01pZ3JhdGUubWFwKHByb21wdEZpbGUgPT4gcHJvbXB0RmlsZS51cmkpKTtcblx0XHRjb25zdCBzZWxlY3RlZFByb21wdFVyaXMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRmb3IgKGNvbnN0IHByb21wdEZpbGUgb2YgcHJvbXB0RmlsZXMpIHtcblx0XHRcdGlmICghcHJldmlvdXNQcm9tcHRVcmlzLmhhcyhwcm9tcHRGaWxlLnVyaSkgfHwgdGhpcy5zZWxlY3RlZFByb21wdE1pZ3JhdGlvblVyaXMuaGFzKHByb21wdEZpbGUudXJpKSkge1xuXHRcdFx0XHRzZWxlY3RlZFByb21wdFVyaXMuYWRkKHByb21wdEZpbGUudXJpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5zZWxlY3RlZFByb21wdE1pZ3JhdGlvblVyaXMgPSBzZWxlY3RlZFByb21wdFVyaXM7XG5cdFx0dGhpcy5wcm9tcHRGaWxlc1RvTWlncmF0ZSA9IHByb21wdEZpbGVzO1xuXHRcdHRoaXMucmVmcmVzaFByb21wdE1pZ3JhdGlvblVpKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hQcm9tcHRNaWdyYXRpb25VaSgpOiB2b2lkIHtcblx0XHRjb25zdCBtaWdyYXRpb25JbmZvID0gdGhpcy5pc1Byb21wdE1pZ3JhdGlvbkVuYWJsZWQoKSA/IGdldFByb21wdE1pZ3JhdGlvbkluZm8odGhpcy5wcm9tcHRGaWxlc1RvTWlncmF0ZSkgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy53ZWxjb21lUGFnZT8uc2V0UHJvbXB0TWlncmF0aW9uSW5mbyhtaWdyYXRpb25JbmZvKTtcblx0XHR0aGlzLnVwZGF0ZVNpZGViYXJNaWdyYXRpb25TaG9ydGN1dChtaWdyYXRpb25JbmZvKTtcblx0XHR0aGlzLnJlbmRlclByb21wdE1pZ3JhdGlvblBhZ2UoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU2lkZWJhck1pZ3JhdGlvblNob3J0Y3V0KG1pZ3JhdGlvbkluZm86IFJldHVyblR5cGU8dHlwZW9mIGdldFByb21wdE1pZ3JhdGlvbkluZm8+IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm1pZ3JhdGlvblNob3J0Y3V0Q29udGFpbmVyIHx8ICF0aGlzLm1pZ3JhdGlvblNob3J0Y3V0QnV0dG9uIHx8ICF0aGlzLm1pZ3JhdGlvblNob3J0Y3V0Q291bnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIW1pZ3JhdGlvbkluZm8pIHtcblx0XHRcdHRoaXMubWlncmF0aW9uU2hvcnRjdXRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMubGF5b3V0U2lkZWJhcih0aGlzLnNpZGViYXJXaWR0aCwgdGhpcy5zaWRlYmFySGVpZ2h0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLm1pZ3JhdGlvblNob3J0Y3V0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR0aGlzLm1pZ3JhdGlvblNob3J0Y3V0Q291bnQudGV4dENvbnRlbnQgPSBTdHJpbmcobWlncmF0aW9uSW5mby50b3RhbFByb21wdENvdW50KTtcblx0XHR0aGlzLm1pZ3JhdGlvblNob3J0Y3V0QnV0dG9uLnNldEF0dHJpYnV0ZShcblx0XHRcdCdhcmlhLWxhYmVsJyxcblx0XHRcdGxvY2FsaXplKCdtaWdyYXRpb25TaG9ydGN1dEFyaWFMYWJlbFdpdGhDb3VudCcsIFwiUHJvbXB0cywgezB9IGRlcHJlY2F0ZWQgcHJvbXB0IGZpbGVzIG5lZWQgbWlncmF0aW9uXCIsIG1pZ3JhdGlvbkluZm8udG90YWxQcm9tcHRDb3VudCksXG5cdFx0KTtcblx0XHR0aGlzLmxheW91dFNpZGViYXIodGhpcy5zaWRlYmFyV2lkdGgsIHRoaXMuc2lkZWJhckhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1pZ3JhdGVQcm9tcHRGaWxlcyhwcm9tcHRGaWxlczogcmVhZG9ubHkgSVByb21wdFBhdGhbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChwcm9tcHRGaWxlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmlzUHJvbXB0TWlncmF0aW9uRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWlncmF0aW9uSW5mbyA9IGdldFByb21wdE1pZ3JhdGlvbkluZm8ocHJvbXB0RmlsZXMpO1xuXHRcdGlmICghbWlncmF0aW9uSW5mbykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb25maXJtUmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ3F1ZXN0aW9uJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25Db25maXJtTWVzc2FnZScsIFwiQ29udmVydCBwcm9tcHQgZmlsZXMgdG8gc2tpbGxzP1wiKSxcblx0XHRcdGRldGFpbDogbWlncmF0aW9uSW5mbyAmJiBtaWdyYXRpb25JbmZvLndvcmtzcGFjZVByb21wdENvdW50ID4gMCAmJiBtaWdyYXRpb25JbmZvLnVzZXJQcm9tcHRDb3VudCA+IDBcblx0XHRcdFx0PyBsb2NhbGl6ZSgncHJvbXB0TWlncmF0aW9uQ29uZmlybURldGFpbFdvcmtzcGFjZUFuZFVzZXInLCBcIlRoaXMgY29udmVydHMgezB9IHdvcmtzcGFjZSBwcm9tcHQgZmlsZXMgYW5kIHsxfSB1c2VyIHByb21wdCBmaWxlcyBpbnRvIHNraWxscy5cIiwgbWlncmF0aW9uSW5mby53b3Jrc3BhY2VQcm9tcHRDb3VudCwgbWlncmF0aW9uSW5mby51c2VyUHJvbXB0Q291bnQpXG5cdFx0XHRcdDogbWlncmF0aW9uSW5mbyAmJiBtaWdyYXRpb25JbmZvLndvcmtzcGFjZVByb21wdENvdW50ID4gMFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ3Byb21wdE1pZ3JhdGlvbkNvbmZpcm1EZXRhaWxXb3Jrc3BhY2UnLCBcIlRoaXMgY29udmVydHMgezB9IHdvcmtzcGFjZSBwcm9tcHQgZmlsZXMgaW50byBza2lsbHMuXCIsIG1pZ3JhdGlvbkluZm8ud29ya3NwYWNlUHJvbXB0Q291bnQpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgncHJvbXB0TWlncmF0aW9uQ29uZmlybURldGFpbFVzZXInLCBcIlRoaXMgY29udmVydHMgezB9IHVzZXIgcHJvbXB0IGZpbGVzIGludG8gc2tpbGxzLlwiLCBtaWdyYXRpb25JbmZvPy51c2VyUHJvbXB0Q291bnQgPz8gdGhpcy5wcm9tcHRGaWxlc1RvTWlncmF0ZS5sZW5ndGgpLFxuXHRcdFx0Y2hlY2tib3g6IHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25EZWxldGVQcm9tcHRGaWxlc0NoZWNrYm94JywgXCJEZWxldGUgb3JpZ2luYWwgcHJvbXB0IGZpbGVzIGFmdGVyIG1pZ3JhdGlvblwiKSxcblx0XHRcdFx0Y2hlY2tlZDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgncHJvbXB0TWlncmF0aW9uQ29uZmlybUJ1dHRvbicsIFwiQ29udmVydCB0byBTa2lsbHNcIiksXG5cdFx0fSk7XG5cdFx0aWYgKCFjb25maXJtUmVzdWx0LmNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNraWxsU291cmNlRm9sZGVycyA9IGF3YWl0IHRoaXMuaXRlbXNNb2RlbC5nZXRBY3RpdmVJdGVtU291cmNlKCkuZmV0Y2hTb3VyY2VGb2xkZXJzKFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRpZiAoc2tpbGxTb3VyY2VGb2xkZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25Ob1NraWxsRm9sZGVycycsIFwiTm8gc2tpbGwgZm9sZGVycyBhcmUgY29uZmlndXJlZCBmb3IgdGhlIGFjdGl2ZSBoYXJuZXNzLlwiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNraWxsU291cmNlRm9sZGVyc0J5U3RvcmFnZSA9IGF3YWl0IHRoaXMucmVzb2x2ZU1pZ3JhdGlvblNraWxsU291cmNlRm9sZGVycyhza2lsbFNvdXJjZUZvbGRlcnMsIG1pZ3JhdGlvbkluZm8pO1xuXHRcdGlmICghc2tpbGxTb3VyY2VGb2xkZXJzQnlTdG9yYWdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWlncmF0aW9uUmVzdWx0ID0gYXdhaXQgbWlncmF0ZVByb21wdEZpbGVzVG9Ta2lsbHMoXG5cdFx0XHRwcm9tcHRGaWxlcyxcblx0XHRcdHNraWxsU291cmNlRm9sZGVyc0J5U3RvcmFnZSxcblx0XHRcdHRoaXMuZmlsZVNlcnZpY2UsXG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcixcblx0XHRcdHsgZGVsZXRlT3JpZ2luYWxQcm9tcHRGaWxlczogY29uZmlybVJlc3VsdC5jaGVja2JveENoZWNrZWQgIT09IGZhbHNlIH0sXG5cdFx0KTtcblx0XHRjb25zdCB7IGNvbnZlcnRlZENvdW50LCBmYWlsZWRQcm9tcHRGaWxlTmFtZXMsIHVuc3VwcG9ydGVkSGVhZGVyS2V5cywgY29udmVydGVkU2tpbGxGaWxlVXJpcyB9ID0gbWlncmF0aW9uUmVzdWx0O1xuXG5cdFx0aWYgKGZhaWxlZFByb21wdEZpbGVOYW1lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBkaXNwbGF5ZWRGaWxlTmFtZXMgPSBmYWlsZWRQcm9tcHRGaWxlTmFtZXMuc2xpY2UoMCwgMyk7XG5cdFx0XHRjb25zdCBoaWRkZW5GaWxlQ291bnQgPSBmYWlsZWRQcm9tcHRGaWxlTmFtZXMubGVuZ3RoIC0gZGlzcGxheWVkRmlsZU5hbWVzLmxlbmd0aDtcblx0XHRcdGlmIChoaWRkZW5GaWxlQ291bnQgPiAwKSB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZShcblx0XHRcdFx0XHQncHJvbXB0TWlncmF0aW9uRmlsZXNGYWlsZWRXaXRoUmVtYWluZGVyJyxcblx0XHRcdFx0XHRcIkZhaWxlZCB0byBtaWdyYXRlIHswfSBwcm9tcHQgZmlsZXM6IHsxfSwgYW5kIHsyfSBtb3JlLlwiLFxuXHRcdFx0XHRcdGZhaWxlZFByb21wdEZpbGVOYW1lcy5sZW5ndGgsXG5cdFx0XHRcdFx0ZGlzcGxheWVkRmlsZU5hbWVzLmpvaW4oJywgJyksXG5cdFx0XHRcdFx0aGlkZGVuRmlsZUNvdW50LFxuXHRcdFx0XHQpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZShcblx0XHRcdFx0XHQncHJvbXB0TWlncmF0aW9uRmlsZXNGYWlsZWQnLFxuXHRcdFx0XHRcdFwiRmFpbGVkIHRvIG1pZ3JhdGUgezB9IHByb21wdCBmaWxlczogezF9LlwiLFxuXHRcdFx0XHRcdGZhaWxlZFByb21wdEZpbGVOYW1lcy5sZW5ndGgsXG5cdFx0XHRcdFx0ZGlzcGxheWVkRmlsZU5hbWVzLmpvaW4oJywgJyksXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjb252ZXJ0ZWRDb3VudCA9PT0gMCkge1xuXHRcdFx0aWYgKGZhaWxlZFByb21wdEZpbGVOYW1lcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ3Byb21wdE1pZ3JhdGlvbk5vRmlsZXNDb252ZXJ0ZWQnLCBcIk5vIHByb21wdCBmaWxlcyB3ZXJlIGNvbnZlcnRlZC5cIikpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMucmVmcmVzaFByb21wdE1pZ3JhdGlvbkluZm8oKTtcblxuXHRcdGNvbnN0IHVuc3VwcG9ydGVkS2V5c0xhYmVsID0gQXJyYXkuZnJvbSh1bnN1cHBvcnRlZEhlYWRlcktleXMpLnNvcnQoKS5qb2luKCcsICcpO1xuXHRcdGlmICh1bnN1cHBvcnRlZEtleXNMYWJlbC5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZShcblx0XHRcdFx0J3Byb21wdE1pZ3JhdGlvbkNvbnZlcnRlZFdpdGhSZXZpZXcnLFxuXHRcdFx0XHRcIkNvbnZlcnRlZCB7MH0gcHJvbXB0IGZpbGVzIHRvIHNraWxscy4gUmV2aWV3IG1pZ3JhdGVkIHNraWxscyB0aGF0IHVzZWQgdW5zdXBwb3J0ZWQgcHJvbXB0IGhlYWRlcnM6IHsxfS5cIixcblx0XHRcdFx0Y29udmVydGVkQ291bnQsXG5cdFx0XHRcdHVuc3VwcG9ydGVkS2V5c0xhYmVsLFxuXHRcdFx0KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5pbmZvKGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25Db252ZXJ0ZWQnLCBcIkNvbnZlcnRlZCB7MH0gcHJvbXB0IGZpbGVzIHRvIHNraWxscy5cIiwgY29udmVydGVkQ291bnQpKTtcblx0XHR9XG5cblx0XHR0aGlzLnNlbGVjdFNlY3Rpb24oQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzKTtcblx0XHR2b2lkIHRoaXMucmV2ZWFsTWlncmF0ZWRTa2lsbHMoY29udmVydGVkU2tpbGxGaWxlVXJpcyk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclByb21wdE1pZ3JhdGlvblBhZ2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm1pZ3JhdGlvbkxpc3RDb250YWluZXIgfHwgIXRoaXMubWlncmF0aW9uTWlncmF0ZUJ1dHRvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubWlncmF0aW9uUGFnZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLm1pZ3JhdGlvbkxpc3RDb250YWluZXIpO1xuXHRcdHRoaXMudXBkYXRlUHJvbXB0TWlncmF0aW9uUGFnZURlc2NyaXB0aW9uKCk7XG5cdFx0aWYgKHRoaXMucHJvbXB0RmlsZXNUb01pZ3JhdGUubGVuZ3RoID09PSAwIHx8ICF0aGlzLmlzUHJvbXB0TWlncmF0aW9uRW5hYmxlZCgpKSB7XG5cdFx0XHRjb25zdCBlbXB0eU1lc3NhZ2UgPSBET00uYXBwZW5kKHRoaXMubWlncmF0aW9uTGlzdENvbnRhaW5lciwgJCgncC5wcm9tcHQtbWlncmF0aW9uLWVtcHR5JykpO1xuXHRcdFx0ZW1wdHlNZXNzYWdlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3Byb21wdE1pZ3JhdGlvblBhZ2VFbXB0eScsIFwiTm8gcHJvbXB0IGZpbGVzIGFyZSBhdmFpbGFibGUgdG8gbWlncmF0ZS5cIik7XG5cdFx0XHR0aGlzLm1pZ3JhdGlvbk1pZ3JhdGVCdXR0b24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5taWdyYXRpb25MaXN0U2Nyb2xsYWJsZT8uc2NhbkRvbU5vZGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBxdWVyeSA9IHRoaXMubWlncmF0aW9uU2VhcmNoUXVlcnkudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cdFx0Y29uc3QgZmlsdGVyZWRQcm9tcHRGaWxlcyA9IHRoaXMucHJvbXB0RmlsZXNUb01pZ3JhdGUuZmlsdGVyKHByb21wdEZpbGUgPT4ge1xuXHRcdFx0aWYgKCFxdWVyeSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gKHByb21wdEZpbGUubmFtZSA/PyBiYXNlbmFtZShwcm9tcHRGaWxlLnVyaSkpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRjb25zdCByZWxhdGl2ZVBhdGggPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChwcm9tcHRGaWxlLnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0cmV0dXJuIGRpc3BsYXlOYW1lLmluY2x1ZGVzKHF1ZXJ5KSB8fCByZWxhdGl2ZVBhdGguaW5jbHVkZXMocXVlcnkpO1xuXHRcdH0pO1xuXHRcdGlmIChmaWx0ZXJlZFByb21wdEZpbGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29uc3QgZW1wdHlNZXNzYWdlID0gRE9NLmFwcGVuZCh0aGlzLm1pZ3JhdGlvbkxpc3RDb250YWluZXIsICQoJ3AucHJvbXB0LW1pZ3JhdGlvbi1lbXB0eScpKTtcblx0XHRcdGVtcHR5TWVzc2FnZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25TZWFyY2hFbXB0eScsIFwiTm8gcHJvbXB0IGZpbGVzIG1hdGNoIHlvdXIgc2VhcmNoLlwiKTtcblx0XHRcdHRoaXMudXBkYXRlUHJvbXB0TWlncmF0aW9uQWN0aW9uU3RhdGUoKTtcblx0XHRcdHRoaXMubWlncmF0aW9uTGlzdFNjcm9sbGFibGU/LnNjYW5Eb21Ob2RlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya3NwYWNlUHJvbXB0RmlsZXMgPSBmaWx0ZXJlZFByb21wdEZpbGVzLmZpbHRlcihmaWxlID0+IGZpbGUuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwpO1xuXHRcdGNvbnN0IHVzZXJQcm9tcHRGaWxlcyA9IGZpbHRlcmVkUHJvbXB0RmlsZXMuZmlsdGVyKGZpbGUgPT4gZmlsZS5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS51c2VyKTtcblx0XHRjb25zdCBvcGVuUHJvbXB0RmlsZUluRW1iZWRkZWRFZGl0b3IgPSAocHJvbXB0RmlsZTogSVByb21wdFBhdGgpOiB2b2lkID0+IHtcblx0XHRcdGNvbnN0IGlzV29ya3NwYWNlRmlsZSA9IHByb21wdEZpbGUuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UubG9jYWw7XG5cdFx0XHR2b2lkIHRoaXMuc2hvd0VtYmVkZGVkRWRpdG9yKFxuXHRcdFx0XHRwcm9tcHRGaWxlLnVyaSxcblx0XHRcdFx0cHJvbXB0RmlsZS5uYW1lID8/IGJhc2VuYW1lKHByb21wdEZpbGUudXJpKSxcblx0XHRcdFx0UHJvbXB0c1R5cGUucHJvbXB0LFxuXHRcdFx0XHRwcm9tcHRGaWxlLnN0b3JhZ2UsXG5cdFx0XHRcdGlzV29ya3NwYWNlRmlsZSxcblx0XHRcdCk7XG5cdFx0fTtcblx0XHRjb25zdCByZW5kZXJTZWxlY3Rpb25DaGVja2JveCA9IChyb3c6IEhUTUxFbGVtZW50LCBwcm9tcHRGaWxlOiBJUHJvbXB0UGF0aCk6IENoZWNrYm94ID0+IHtcblx0XHRcdGNvbnN0IGNoZWNrYm94Q29udGFpbmVyID0gRE9NLmFwcGVuZChyb3csICQoJy5pdGVtLXN5bmMtY2hlY2tib3gucHJvbXB0LW1pZ3JhdGlvbi1jaGVja2JveCcpKTtcblx0XHRcdGNvbnN0IGNoZWNrYm94VGl0bGUgPSBsb2NhbGl6ZSgncHJvbXB0TWlncmF0aW9uU2VsZWN0QXJpYUxhYmVsJywgXCJTZWxlY3QgezB9XCIsIHByb21wdEZpbGUubmFtZSA/PyBiYXNlbmFtZShwcm9tcHRGaWxlLnVyaSkpO1xuXHRcdFx0Y29uc3QgY2hlY2tib3ggPSB0aGlzLm1pZ3JhdGlvblBhZ2VEaXNwb3NhYmxlcy5hZGQobmV3IENoZWNrYm94KGNoZWNrYm94VGl0bGUsIHRoaXMuc2VsZWN0ZWRQcm9tcHRNaWdyYXRpb25VcmlzLmhhcyhwcm9tcHRGaWxlLnVyaSksIGRlZmF1bHRDaGVja2JveFN0eWxlcykpO1xuXHRcdFx0Y2hlY2tib3hDb250YWluZXIucmVwbGFjZUNoaWxkcmVuKGNoZWNrYm94LmRvbU5vZGUpO1xuXHRcdFx0dGhpcy5taWdyYXRpb25QYWdlRGlzcG9zYWJsZXMuYWRkKGNoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0aWYgKGNoZWNrYm94LmNoZWNrZWQpIHtcblx0XHRcdFx0XHR0aGlzLnNlbGVjdGVkUHJvbXB0TWlncmF0aW9uVXJpcy5hZGQocHJvbXB0RmlsZS51cmkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuc2VsZWN0ZWRQcm9tcHRNaWdyYXRpb25VcmlzLmRlbGV0ZShwcm9tcHRGaWxlLnVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy51cGRhdGVQcm9tcHRNaWdyYXRpb25BY3Rpb25TdGF0ZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0cmV0dXJuIGNoZWNrYm94O1xuXHRcdH07XG5cblx0XHRjb25zdCByZW5kZXJJdGVtID0gKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHByb21wdEZpbGU6IElQcm9tcHRQYXRoKTogdm9pZCA9PiB7XG5cdFx0XHRjb25zdCByb3cgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnZGl2LmFpLWN1c3RvbWl6YXRpb24tbGlzdC1pdGVtLnByb21wdC1taWdyYXRpb24taXRlbScpKTtcblx0XHRcdGNvbnN0IGNoZWNrYm94ID0gcmVuZGVyU2VsZWN0aW9uQ2hlY2tib3gocm93LCBwcm9tcHRGaWxlKTtcblx0XHRcdHRoaXMubWlncmF0aW9uUGFnZURpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJvdywgJ2NsaWNrJywgZXZlbnQgPT4ge1xuXHRcdFx0XHRpZiAoZXZlbnQudGFyZ2V0IGluc3RhbmNlb2YgTm9kZSAmJiBjaGVja2JveC5kb21Ob2RlLmNvbnRhaW5zKGV2ZW50LnRhcmdldCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0b3BlblByb21wdEZpbGVJbkVtYmVkZGVkRWRpdG9yKHByb21wdEZpbGUpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBpdGVtTGVmdCA9IERPTS5hcHBlbmQocm93LCAkKCdzcGFuLml0ZW0tbGVmdCcpKTtcblx0XHRcdGNvbnN0IGl0ZW1UZXh0ID0gRE9NLmFwcGVuZChpdGVtTGVmdCwgJCgnc3Bhbi5pdGVtLXRleHQnKSk7XG5cdFx0XHRjb25zdCBuYW1lUm93ID0gRE9NLmFwcGVuZChpdGVtVGV4dCwgJCgnc3Bhbi5pdGVtLW5hbWUtcm93JykpO1xuXHRcdFx0Y29uc3QgbmFtZUxhYmVsID0gRE9NLmFwcGVuZChuYW1lUm93LCAkKCdzcGFuLml0ZW0tbmFtZS5wcm9tcHQtbWlncmF0aW9uLWl0ZW0tbmFtZScpKTtcblx0XHRcdG5hbWVMYWJlbC50ZXh0Q29udGVudCA9IHByb21wdEZpbGUubmFtZSA/PyBiYXNlbmFtZShwcm9tcHRGaWxlLnVyaSk7XG5cblx0XHRcdGNvbnN0IHBhdGhMYWJlbCA9IERPTS5hcHBlbmQoaXRlbVRleHQsICQoJ3NwYW4uaXRlbS1kZXNjcmlwdGlvbi5pcy1maWxlbmFtZS5wcm9tcHQtbWlncmF0aW9uLWl0ZW0tcGF0aCcpKTtcblx0XHRcdHBhdGhMYWJlbC50ZXh0Q29udGVudCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHByb21wdEZpbGUudXJpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXG5cdFx0XHRjb25zdCBpdGVtUmlnaHQgPSBET00uYXBwZW5kKHJvdywgJCgnc3Bhbi5pdGVtLXJpZ2h0JykpO1xuXHRcdFx0Y29uc3QgZGVsZXRlQnV0dG9uID0gRE9NLmFwcGVuZChpdGVtUmlnaHQsICQoJ2J1dHRvbi5pY29uLWJ1dHRvbicsIHtcblx0XHRcdFx0dHlwZTogJ2J1dHRvbicsXG5cdFx0XHRcdCdhcmlhLWxhYmVsJzogbG9jYWxpemUoJ2RlbGV0ZVByb21wdEZpbGUnLCBcIkRlbGV0ZSB7MH1cIiwgcHJvbXB0RmlsZS5uYW1lID8/IGJhc2VuYW1lKHByb21wdEZpbGUudXJpKSksXG5cdFx0XHR9KSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0XHRkZWxldGVCdXR0b24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnRyYXNoKSk7XG5cdFx0XHR0aGlzLm1pZ3JhdGlvblBhZ2VEaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgZGVsZXRlQnV0dG9uLCBsb2NhbGl6ZSgnZGVsZXRlUHJvbXB0RmlsZVRvb2x0aXAnLCBcIkRlbGV0ZVwiKSkpO1xuXHRcdFx0dGhpcy5taWdyYXRpb25QYWdlRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZGVsZXRlQnV0dG9uLCAnY2xpY2snLCBldmVudCA9PiB7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR2b2lkIHRoaXMuZGVsZXRlUHJvbXB0RmlsZShwcm9tcHRGaWxlKTtcblx0XHRcdH0pKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVuZGVyR3JvdXAgPSAoZ3JvdXBLZXk6IHN0cmluZywgZ3JvdXBMYWJlbDogc3RyaW5nLCBwcm9tcHRGaWxlczogcmVhZG9ubHkgSVByb21wdFBhdGhbXSk6IHZvaWQgPT4ge1xuXHRcdFx0aWYgKHByb21wdEZpbGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGdyb3VwID0gRE9NLmFwcGVuZCh0aGlzLm1pZ3JhdGlvbkxpc3RDb250YWluZXIhLCAkKCcucHJvbXB0LW1pZ3JhdGlvbi1ncm91cCcpKTtcblx0XHRcdGNvbnN0IGdyb3VwSGVhZGVyID0gRE9NLmFwcGVuZChncm91cCwgJCgnLmFpLWN1c3RvbWl6YXRpb24tZ3JvdXAtaGVhZGVyLnByb21wdC1taWdyYXRpb24tZ3JvdXAtaGVhZGVyJykpO1xuXHRcdFx0Y29uc3QgZ3JvdXBDaGVja2JveENvbnRhaW5lciA9IERPTS5hcHBlbmQoZ3JvdXBIZWFkZXIsICQoJy5pdGVtLXN5bmMtY2hlY2tib3gucHJvbXB0LW1pZ3JhdGlvbi1ncm91cC1jaGVja2JveCcpKTtcblx0XHRcdGNvbnN0IGFsbEluR3JvdXBTZWxlY3RlZCA9IHByb21wdEZpbGVzLmV2ZXJ5KGZpbGUgPT4gdGhpcy5zZWxlY3RlZFByb21wdE1pZ3JhdGlvblVyaXMuaGFzKGZpbGUudXJpKSk7XG5cdFx0XHRjb25zdCBncm91cENoZWNrYm94QXJpYUxhYmVsID0gbG9jYWxpemUoJ3Byb21wdE1pZ3JhdGlvblNlbGVjdEdyb3VwQXJpYUxhYmVsJywgXCJTZWxlY3QgYWxsIHswfSBwcm9tcHQgZmlsZXNcIiwgZ3JvdXBMYWJlbC50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdGNvbnN0IGdyb3VwQ2hlY2tib3ggPSB0aGlzLm1pZ3JhdGlvblBhZ2VEaXNwb3NhYmxlcy5hZGQobmV3IENoZWNrYm94KGdyb3VwQ2hlY2tib3hBcmlhTGFiZWwsIGFsbEluR3JvdXBTZWxlY3RlZCwgZGVmYXVsdENoZWNrYm94U3R5bGVzKSk7XG5cdFx0XHRncm91cENoZWNrYm94Q29udGFpbmVyLnJlcGxhY2VDaGlsZHJlbihncm91cENoZWNrYm94LmRvbU5vZGUpO1xuXHRcdFx0dGhpcy5taWdyYXRpb25QYWdlRGlzcG9zYWJsZXMuYWRkKGdyb3VwQ2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHByb21wdEZpbGUgb2YgcHJvbXB0RmlsZXMpIHtcblx0XHRcdFx0XHRpZiAoZ3JvdXBDaGVja2JveC5jaGVja2VkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNlbGVjdGVkUHJvbXB0TWlncmF0aW9uVXJpcy5hZGQocHJvbXB0RmlsZS51cmkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNlbGVjdGVkUHJvbXB0TWlncmF0aW9uVXJpcy5kZWxldGUocHJvbXB0RmlsZS51cmkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnJlbmRlclByb21wdE1pZ3JhdGlvblBhZ2UoKTtcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IGdyb3VwVG9nZ2xlID0gRE9NLmFwcGVuZChncm91cEhlYWRlciwgJCgnYnV0dG9uLnByb21wdC1taWdyYXRpb24tZ3JvdXAtdG9nZ2xlJykpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdFx0Z3JvdXBUb2dnbGUudHlwZSA9ICdidXR0b24nO1xuXHRcdFx0Y29uc3QgZ3JvdXBJZCA9IGBwcm9tcHQtbWlncmF0aW9uLWdyb3VwLSR7Z3JvdXBLZXl9YDtcblx0XHRcdGNvbnN0IGNvbGxhcHNlZCA9IHRoaXMuY29sbGFwc2VkUHJvbXB0TWlncmF0aW9uR3JvdXBzLmhhcyhncm91cElkKTtcblx0XHRcdGdyb3VwVG9nZ2xlLnNldEF0dHJpYnV0ZSgnYXJpYS1jb250cm9scycsIGAke2dyb3VwSWR9LWl0ZW1zYCk7XG5cdFx0XHRncm91cFRvZ2dsZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcoIWNvbGxhcHNlZCkpO1xuXHRcdFx0Y29uc3QgY2hldnJvbiA9IERPTS5hcHBlbmQoZ3JvdXBUb2dnbGUsICQoJ3NwYW4uZ3JvdXAtY2hldnJvbicpKTtcblx0XHRcdGNoZXZyb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRjb25zdCBncm91cExhYmVsR3JvdXAgPSBET00uYXBwZW5kKGdyb3VwVG9nZ2xlLCAkKCcuZ3JvdXAtbGFiZWwtZ3JvdXAnKSk7XG5cdFx0XHRjb25zdCBsYWJlbCA9IERPTS5hcHBlbmQoZ3JvdXBMYWJlbEdyb3VwLCAkKCdzcGFuLmdyb3VwLWxhYmVsJykpO1xuXHRcdFx0bGFiZWwudGV4dENvbnRlbnQgPSBncm91cExhYmVsO1xuXHRcdFx0Y29uc3QgY291bnQgPSBET00uYXBwZW5kKGdyb3VwVG9nZ2xlLCAkKCdzcGFuLmdyb3VwLWNvdW50JykpO1xuXHRcdFx0Y291bnQudGV4dENvbnRlbnQgPSBTdHJpbmcocHJvbXB0RmlsZXMubGVuZ3RoKTtcblx0XHRcdGNvbnN0IGdyb3VwSXRlbXMgPSBET00uYXBwZW5kKGdyb3VwLCAkKCcucHJvbXB0LW1pZ3JhdGlvbi1ncm91cC1pdGVtcycpKTtcblx0XHRcdGdyb3VwSXRlbXMuaWQgPSBgJHtncm91cElkfS1pdGVtc2A7XG5cdFx0XHRjb25zdCBzZXRHcm91cENvbGxhcHNlZCA9IChjb2xsYXBzZWQ6IGJvb2xlYW4pOiB2b2lkID0+IHtcblx0XHRcdFx0Z3JvdXBJdGVtcy5zdHlsZS5kaXNwbGF5ID0gY29sbGFwc2VkID8gJ25vbmUnIDogJyc7XG5cdFx0XHRcdGNoZXZyb24uY2xhc3NOYW1lID0gJ2dyb3VwLWNoZXZyb24nO1xuXHRcdFx0XHRjaGV2cm9uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoY29sbGFwc2VkID8gQ29kaWNvbi5jaGV2cm9uUmlnaHQgOiBDb2RpY29uLmNoZXZyb25Eb3duKSk7XG5cdFx0XHRcdGdyb3VwVG9nZ2xlLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyghY29sbGFwc2VkKSk7XG5cdFx0XHRcdHRoaXMubWlncmF0aW9uTGlzdFNjcm9sbGFibGU/LnNjYW5Eb21Ob2RlKCk7XG5cdFx0XHR9O1xuXHRcdFx0c2V0R3JvdXBDb2xsYXBzZWQoY29sbGFwc2VkKTtcblx0XHRcdHRoaXMubWlncmF0aW9uUGFnZURpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGdyb3VwVG9nZ2xlLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmNvbGxhcHNlZFByb21wdE1pZ3JhdGlvbkdyb3Vwcy5oYXMoZ3JvdXBJZCkpIHtcblx0XHRcdFx0XHR0aGlzLmNvbGxhcHNlZFByb21wdE1pZ3JhdGlvbkdyb3Vwcy5kZWxldGUoZ3JvdXBJZCk7XG5cdFx0XHRcdFx0c2V0R3JvdXBDb2xsYXBzZWQoZmFsc2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuY29sbGFwc2VkUHJvbXB0TWlncmF0aW9uR3JvdXBzLmFkZChncm91cElkKTtcblx0XHRcdFx0XHRzZXRHcm91cENvbGxhcHNlZCh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHByb21wdEZpbGUgb2YgcHJvbXB0RmlsZXMpIHtcblx0XHRcdFx0cmVuZGVySXRlbShncm91cEl0ZW1zLCBwcm9tcHRGaWxlKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cmVuZGVyR3JvdXAoUHJvbXB0c1N0b3JhZ2UubG9jYWwsIGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25Xb3Jrc3BhY2VHcm91cCcsIFwiV29ya3NwYWNlXCIpLCB3b3Jrc3BhY2VQcm9tcHRGaWxlcyk7XG5cdFx0cmVuZGVyR3JvdXAoUHJvbXB0c1N0b3JhZ2UudXNlciwgbG9jYWxpemUoJ3Byb21wdE1pZ3JhdGlvblVzZXJHcm91cCcsIFwiVXNlclwiKSwgdXNlclByb21wdEZpbGVzKTtcblxuXHRcdGZvciAoY29uc3QgcHJvbXB0RmlsZSBvZiBmaWx0ZXJlZFByb21wdEZpbGVzLmZpbHRlcihmaWxlID0+IGZpbGUuc3RvcmFnZSAhPT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwgJiYgZmlsZS5zdG9yYWdlICE9PSBQcm9tcHRzU3RvcmFnZS51c2VyKSkge1xuXHRcdFx0cmVuZGVySXRlbSh0aGlzLm1pZ3JhdGlvbkxpc3RDb250YWluZXIsIHByb21wdEZpbGUpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlUHJvbXB0TWlncmF0aW9uQWN0aW9uU3RhdGUoKTtcblx0XHR0aGlzLm1pZ3JhdGlvbkxpc3RTY3JvbGxhYmxlPy5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQcm9tcHRNaWdyYXRpb25QYWdlRGVzY3JpcHRpb24oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm1pZ3JhdGlvbkRlc2NyaXB0aW9uRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1pZ3JhdGlvbkluZm8gPSBnZXRQcm9tcHRNaWdyYXRpb25JbmZvKHRoaXMucHJvbXB0RmlsZXNUb01pZ3JhdGUpO1xuXHRcdGlmICghbWlncmF0aW9uSW5mbykge1xuXHRcdFx0dGhpcy5taWdyYXRpb25EZXNjcmlwdGlvbkVsZW1lbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncHJvbXB0TWlncmF0aW9uUGFnZURlc2NyaXB0aW9uJywgXCJTZWxlY3QgcHJvbXB0IGZpbGVzIHRvIGNvbnZlcnQgaW50byBza2lsbHMgZm9yIHRoZSBhY3RpdmUgaGFybmVzcy5cIik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB3b3Jrc3BhY2VQcm9tcHRDb3VudCwgdXNlclByb21wdENvdW50LCB0b3RhbFByb21wdENvdW50IH0gPSBtaWdyYXRpb25JbmZvO1xuXHRcdGNvbnN0IGhhcm5lc3NMYWJlbCA9IHRoaXMuZ2V0QWN0aXZlSGFybmVzc0xhYmVsKCk7XG5cblx0XHRpZiAod29ya3NwYWNlUHJvbXB0Q291bnQgPiAwICYmIHVzZXJQcm9tcHRDb3VudCA+IDApIHtcblx0XHRcdHRoaXMubWlncmF0aW9uRGVzY3JpcHRpb25FbGVtZW50LnRleHRDb250ZW50ID0gbG9jYWxpemUoXG5cdFx0XHRcdCdwcm9tcHRNaWdyYXRpb25QYWdlRGVzY3JpcHRpb25Xb3Jrc3BhY2VBbmRVc2VyJyxcblx0XHRcdFx0XCJQcm9tcHQgZmlsZXMgYXJlIG5vdCBzdXBwb3J0ZWQgZm9yIHRoaXMgaGFybmVzcy4gRm91bmQgezB9IHByb21wdCBmaWxlcyAoezF9IHdvcmtzcGFjZSwgezJ9IHVzZXIpIHRoYXQgbG9jYWwgVlMgQ29kZSBjYW4gc3RpbGwgcnVuLCBidXQgezN9IGlnbm9yZXMuIENvbnZlcnQgdGhlbSB0byBza2lsbHMgdG8ga2VlcCB0aGVtIGF2YWlsYWJsZS5cIixcblx0XHRcdFx0dG90YWxQcm9tcHRDb3VudCxcblx0XHRcdFx0d29ya3NwYWNlUHJvbXB0Q291bnQsXG5cdFx0XHRcdHVzZXJQcm9tcHRDb3VudCxcblx0XHRcdFx0aGFybmVzc0xhYmVsLFxuXHRcdFx0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAod29ya3NwYWNlUHJvbXB0Q291bnQgPiAwKSB7XG5cdFx0XHR0aGlzLm1pZ3JhdGlvbkRlc2NyaXB0aW9uRWxlbWVudC50ZXh0Q29udGVudCA9IGxvY2FsaXplKFxuXHRcdFx0XHQncHJvbXB0TWlncmF0aW9uUGFnZURlc2NyaXB0aW9uV29ya3NwYWNlJyxcblx0XHRcdFx0XCJQcm9tcHQgZmlsZXMgYXJlIG5vdCBzdXBwb3J0ZWQgZm9yIHRoaXMgaGFybmVzcy4gRm91bmQgezB9IHdvcmtzcGFjZSBwcm9tcHQgZmlsZXMgdGhhdCBsb2NhbCBWUyBDb2RlIGNhbiBzdGlsbCBydW4sIGJ1dCB7MX0gaWdub3Jlcy4gQ29udmVydCB0aGVtIHRvIHNraWxscyB0byBrZWVwIHRoZW0gYXZhaWxhYmxlLlwiLFxuXHRcdFx0XHR3b3Jrc3BhY2VQcm9tcHRDb3VudCxcblx0XHRcdFx0aGFybmVzc0xhYmVsLFxuXHRcdFx0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLm1pZ3JhdGlvbkRlc2NyaXB0aW9uRWxlbWVudC50ZXh0Q29udGVudCA9IGxvY2FsaXplKFxuXHRcdFx0J3Byb21wdE1pZ3JhdGlvblBhZ2VEZXNjcmlwdGlvblVzZXInLFxuXHRcdFx0XCJQcm9tcHQgZmlsZXMgYXJlIG5vdCBzdXBwb3J0ZWQgZm9yIHRoaXMgaGFybmVzcy4gRm91bmQgezB9IHVzZXIgcHJvbXB0IGZpbGVzIHRoYXQgbG9jYWwgVlMgQ29kZSBjYW4gc3RpbGwgcnVuLCBidXQgezF9IGlnbm9yZXMuIENvbnZlcnQgdGhlbSB0byBza2lsbHMgdG8ga2VlcCB0aGVtIGF2YWlsYWJsZS5cIixcblx0XHRcdHVzZXJQcm9tcHRDb3VudCxcblx0XHRcdGhhcm5lc3NMYWJlbCxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQcm9tcHRNaWdyYXRpb25BY3Rpb25TdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubWlncmF0aW9uTWlncmF0ZUJ1dHRvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZWxlY3RlZENvdW50ID0gdGhpcy5wcm9tcHRGaWxlc1RvTWlncmF0ZS5maWx0ZXIoZmlsZSA9PiB0aGlzLnNlbGVjdGVkUHJvbXB0TWlncmF0aW9uVXJpcy5oYXMoZmlsZS51cmkpKS5sZW5ndGg7XG5cdFx0dGhpcy5taWdyYXRpb25NaWdyYXRlQnV0dG9uLmVuYWJsZWQgPSBzZWxlY3RlZENvdW50ID4gMDtcblx0XHR0aGlzLm1pZ3JhdGlvbk1pZ3JhdGVCdXR0b24ubGFiZWwgPSBzZWxlY3RlZENvdW50ID4gMFxuXHRcdFx0PyBsb2NhbGl6ZSgncHJvbXB0TWlncmF0aW9uUGFnZUJ1dHRvbldpdGhDb3VudCcsIFwiTWlncmF0ZSAoezB9KVwiLCBzZWxlY3RlZENvdW50KVxuXHRcdFx0OiBsb2NhbGl6ZSgncHJvbXB0TWlncmF0aW9uUGFnZUJ1dHRvbicsIFwiTWlncmF0ZVwiKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGVsZXRlUHJvbXB0RmlsZShwcm9tcHRGaWxlOiBJUHJvbXB0UGF0aCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVOYW1lID0gcHJvbXB0RmlsZS5uYW1lID8/IGJhc2VuYW1lKHByb21wdEZpbGUudXJpKTtcblx0XHRjb25zdCBjb25maXJtYXRpb24gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmlybURlbGV0ZVByb21wdEZpbGUnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgJ3swfSc/XCIsIGZpbGVOYW1lKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NvbmZpcm1EZWxldGVEZXRhaWwnLCBcIlRoaXMgYWN0aW9uIGNhbm5vdCBiZSB1bmRvbmUuXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ2RlbGV0ZScsIFwiRGVsZXRlXCIpLFxuXHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdH0pO1xuXG5cdFx0aWYgKCFjb25maXJtYXRpb24uY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXNlVHJhc2ggPSB0aGlzLmZpbGVTZXJ2aWNlLmhhc0NhcGFiaWxpdHkocHJvbXB0RmlsZS51cmksIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5UcmFzaCk7XG5cdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwocHJvbXB0RmlsZS51cmksIHsgdXNlVHJhc2ggfSk7XG5cdFx0aWYgKHByb21wdEZpbGUuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwpIHtcblx0XHRcdGNvbnN0IHByb2plY3RSb290ID0gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldEFjdGl2ZVByb2plY3RSb290KCk7XG5cdFx0XHRpZiAocHJvamVjdFJvb3QpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmRlbGV0ZUZpbGVzKHByb2plY3RSb290LCBbcHJvbXB0RmlsZS51cmldKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgdGhlIGRlbGV0ZWQgZmlsZSBmcm9tIHRoZSBsaXN0IGFuZCByZS1yZW5kZXIgaW1tZWRpYXRlbHlcblx0XHRjb25zdCB1cGRhdGVkRmlsZXMgPSB0aGlzLnByb21wdEZpbGVzVG9NaWdyYXRlLmZpbHRlcihmID0+ICFpc0VxdWFsKGYudXJpLCBwcm9tcHRGaWxlLnVyaSkpO1xuXHRcdHRoaXMuc2V0UHJvbXB0RmlsZXNUb01pZ3JhdGUodXBkYXRlZEZpbGVzKTtcblx0fVxuXG5cdHByaXZhdGUgaXNQcm9tcHRNaWdyYXRpb25FbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkNoYXRDdXN0b21pemF0aW9uc1Byb21wdE1pZ3JhdGlvbkVuYWJsZWQpID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlTWlncmF0aW9uU2tpbGxTb3VyY2VGb2xkZXJzKFxuXHRcdHNraWxsU291cmNlRm9sZGVyczogcmVhZG9ubHkgSUN1c3RvbWl6YXRpb25Tb3VyY2VGb2xkZXJbXSxcblx0XHRtaWdyYXRpb25JbmZvOiBSZXR1cm5UeXBlPHR5cGVvZiBnZXRQcm9tcHRNaWdyYXRpb25JbmZvPixcblx0KTogUHJvbWlzZTxQcm9tcHRNaWdyYXRpb25Ta2lsbFNvdXJjZUZvbGRlcnMgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzb3VyY2VGb2xkZXJzQnlTdG9yYWdlID0gbmV3IE1hcDxQcm9tcHRzU3RvcmFnZSwgSUN1c3RvbWl6YXRpb25Tb3VyY2VGb2xkZXI+KCk7XG5cblx0XHRjb25zdCBsb2NhbFNraWxsU291cmNlRm9sZGVycyA9IHNraWxsU291cmNlRm9sZGVycy5maWx0ZXIoZm9sZGVyID0+IGZvbGRlci5zb3VyY2UgPT09IFByb21wdHNTdG9yYWdlLmxvY2FsKTtcblx0XHRpZiAobG9jYWxTa2lsbFNvdXJjZUZvbGRlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKChtaWdyYXRpb25JbmZvPy53b3Jrc3BhY2VQcm9tcHRDb3VudCA/PyAwKSA+IDAgJiYgbG9jYWxTa2lsbFNvdXJjZUZvbGRlcnMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRjb25zdCBwaWNrZWRMb2NhbEZvbGRlciA9IGF3YWl0IHRoaXMucGlja01pZ3JhdGlvbldvcmtzcGFjZVNraWxsU291cmNlRm9sZGVyKGxvY2FsU2tpbGxTb3VyY2VGb2xkZXJzKTtcblx0XHRcdFx0aWYgKCFwaWNrZWRMb2NhbEZvbGRlcikge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0c291cmNlRm9sZGVyc0J5U3RvcmFnZS5zZXQoUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHBpY2tlZExvY2FsRm9sZGVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNvdXJjZUZvbGRlcnNCeVN0b3JhZ2Uuc2V0KFByb21wdHNTdG9yYWdlLmxvY2FsLCBsb2NhbFNraWxsU291cmNlRm9sZGVyc1swXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBmb2xkZXIgb2Ygc2tpbGxTb3VyY2VGb2xkZXJzKSB7XG5cdFx0XHRpZiAoZm9sZGVyLnNvdXJjZSA9PT0gUHJvbXB0c1N0b3JhZ2UudXNlciAmJiAhc291cmNlRm9sZGVyc0J5U3RvcmFnZS5oYXMoUHJvbXB0c1N0b3JhZ2UudXNlcikpIHtcblx0XHRcdFx0c291cmNlRm9sZGVyc0J5U3RvcmFnZS5zZXQoUHJvbXB0c1N0b3JhZ2UudXNlciwgZm9sZGVyKTtcblx0XHRcdH1cblx0XHRcdGlmIChmb2xkZXIuc291cmNlID09PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCAmJiAhc291cmNlRm9sZGVyc0J5U3RvcmFnZS5oYXMoUHJvbXB0c1N0b3JhZ2UubG9jYWwpKSB7XG5cdFx0XHRcdHNvdXJjZUZvbGRlcnNCeVN0b3JhZ2Uuc2V0KFByb21wdHNTdG9yYWdlLmxvY2FsLCBmb2xkZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBzb3VyY2VGb2xkZXJzQnlTdG9yYWdlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwaWNrTWlncmF0aW9uV29ya3NwYWNlU2tpbGxTb3VyY2VGb2xkZXIobG9jYWxTa2lsbFNvdXJjZUZvbGRlcnM6IHJlYWRvbmx5IElDdXN0b21pemF0aW9uU291cmNlRm9sZGVyW10pOiBQcm9taXNlPElDdXN0b21pemF0aW9uU291cmNlRm9sZGVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGlja3M6IElNaWdyYXRpb25Ta2lsbFRhcmdldFF1aWNrUGlja0l0ZW1bXSA9IGxvY2FsU2tpbGxTb3VyY2VGb2xkZXJzLm1hcChmb2xkZXIgPT4gKHtcblx0XHRcdGxhYmVsOiBmb2xkZXIubGFiZWwsXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZm9sZGVyLnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSxcblx0XHRcdGZvbGRlcixcblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcywge1xuXHRcdFx0Y2FuUGlja01hbnk6IGZhbHNlLFxuXHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdwcm9tcHRNaWdyYXRpb25QaWNrV29ya3NwYWNlU2tpbGxGb2xkZXInLCBcIlNlbGVjdCBhIHdvcmtzcGFjZSBza2lsbCBmb2xkZXIgZm9yIG1pZ3JhdGVkIHByb21wdHNcIiksXG5cdFx0XHRtYXRjaE9uRGVzY3JpcHRpb246IHRydWUsXG5cdFx0fSk7XG5cdFx0cmV0dXJuIHNlbGVjdGVkPy5mb2xkZXI7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJldmVhbE1pZ3JhdGVkU2tpbGxzKHNraWxsVXJpczogcmVhZG9ubHkgVVJJW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc2tpbGxVcmlzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMubGlzdFdpZGdldC5zZXRTZWN0aW9uKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyk7XG5cdFx0aWYgKHRoaXMubGlzdFdpZGdldC5yZXZlYWxBbmRTZWxlY3RGaXJzdEl0ZW1CeVVyaShza2lsbFVyaXMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQSBzdGFsZSBzZWFyY2ggZmlsdGVyIGNhbiBoaWRlIG1pZ3JhdGVkIHNraWxscyBmcm9tIHRoZSBsaXN0LlxuXHRcdHRoaXMubGlzdFdpZGdldC5jbGVhclNlYXJjaCgpO1xuXHRcdGlmICh0aGlzLmxpc3RXaWRnZXQucmV2ZWFsQW5kU2VsZWN0Rmlyc3RJdGVtQnlVcmkoc2tpbGxVcmlzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNraWxsIGRpc2NvdmVyeS9saXN0IHJlZnJlc2ggY2FuIGxhZyBpbW1lZGlhdGVseSBhZnRlciBtaWdyYXRpb247XG5cdFx0Ly8gcmV0cnkgYnJpZWZseSB1bnRpbCB0aGUgbmV3IGl0ZW0gYXBwZWFycy5cblx0XHRmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8IDEwOyBhdHRlbXB0KyspIHtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwKTtcblx0XHRcdGlmICh0aGlzLmxpc3RXaWRnZXQucmV2ZWFsQW5kU2VsZWN0Rmlyc3RJdGVtQnlVcmkoc2tpbGxVcmlzKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpc1Byb21wdHNTZWN0aW9uKHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uIHwgdW5kZWZpbmVkKTogc2VjdGlvbiBpcyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiB7XG5cdFx0cmV0dXJuIHNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyB8fFxuXHRcdFx0c2VjdGlvbiA9PT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzIHx8XG5cdFx0XHRzZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMgfHxcblx0XHRcdHNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlByb21wdHMgfHxcblx0XHRcdHNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzO1xuXHR9XG5cblx0Ly8jcmVnaW9uIFNlY3Rpb24gQ291bnRzXG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIGNvdW50IGZvciBhIHNwZWNpZmljIHNlY3Rpb24gYW5kIHJlLXJlbmRlcnMgdGhlIHNpZGViYXIuXG5cdCAqL1xuXHRwcml2YXRlIHVwZGF0ZVNlY3Rpb25Db3VudChzZWN0aW9uSWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLCBjb3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VjdGlvbiA9IHRoaXMuc2VjdGlvbnMuZmluZChzID0+IHMuaWQgPT09IHNlY3Rpb25JZCk7XG5cdFx0aWYgKCFzZWN0aW9uIHx8IHNlY3Rpb24uY291bnQgPT09IGNvdW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNlY3Rpb24uY291bnQgPSBjb3VudDtcblx0XHQvLyBSZS1zcGxpY2UgdGhlIHNlY3Rpb25zIGxpc3QgdG8gdHJpZ2dlciByZS1yZW5kZXJcblx0XHR0aGlzLnNlY3Rpb25zTGlzdC5zcGxpY2UoMCwgdGhpcy5zZWN0aW9uc0xpc3QubGVuZ3RoLCB0aGlzLnNlY3Rpb25zKTtcblx0XHR0aGlzLmVuc3VyZVNlY3Rpb25zTGlzdFJlZmxlY3RzQWN0aXZlU2VjdGlvbigpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0LyoqXG5cdCAqIE5hdmlnYXRlcyB0byB0aGUgd2VsY29tZSBwYWdlIChubyBzZWN0aW9uIHNlbGVjdGVkKS5cblx0ICovXG5cdHB1YmxpYyBzaG93V2VsY29tZVBhZ2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmlld01vZGUgPT09ICdlZGl0b3InKSB7XG5cdFx0XHR0aGlzLmdvQmFja1RvTGlzdCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ21pZ3JhdGlvbicpIHtcblx0XHRcdHRoaXMudmlld01vZGUgPSAnbGlzdCc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAnbWNwRGV0YWlsJykge1xuXHRcdFx0dGhpcy5nb0JhY2tGcm9tTWNwRGV0YWlsKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAncGx1Z2luRGV0YWlsJykge1xuXHRcdFx0dGhpcy5nb0JhY2tGcm9tUGx1Z2luRGV0YWlsKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAndG9vbHNEZXRhaWwnKSB7XG5cdFx0XHR0aGlzLmdvQmFja0Zyb21Ub29sRGV0YWlsKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZWxlY3RlZFNlY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5zZWN0aW9uQ29udGV4dEtleS5zZXQoJycpO1xuXG5cdFx0Ly8gQ2xlYXIgcGVyc2lzdGVkIHNlY3Rpb24gc28gd2VsY29tZSBzaG93cyBuZXh0IHRpbWVcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShBSV9DVVNUT01JWkFUSU9OX01BTkFHRU1FTlRfU0VMRUNURURfU0VDVElPTl9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblxuXHRcdHRoaXMud2VsY29tZVBhZ2U/LnJlc2V0KCk7XG5cdFx0dGhpcy51cGRhdGVDb250ZW50VmlzaWJpbGl0eSgpO1xuXHRcdHRoaXMuZW5zdXJlU2VjdGlvbnNMaXN0UmVmbGVjdHNBY3RpdmVTZWN0aW9uKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy53ZWxjb21lUGFnZT8uZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgc2VsZWN0U2VjdGlvbihzZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiwgb3B0aW9ucz86IHsgc2hvd01hcmtldHBsYWNlPzogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRTZWN0aW9uID09PSBzZWN0aW9uICYmICFvcHRpb25zPy5zaG93TWFya2V0cGxhY2UpIHtcblx0XHRcdHRoaXMuZW5zdXJlU2VjdGlvbnNMaXN0UmVmbGVjdHNBY3RpdmVTZWN0aW9uKHNlY3Rpb24pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEN1c3RvbWl6YXRpb25FZGl0b3JTZWN0aW9uQ2hhbmdlZEV2ZW50LCBDdXN0b21pemF0aW9uRWRpdG9yU2VjdGlvbkNoYW5nZWRDbGFzc2lmaWNhdGlvbj4oJ2NoYXRDdXN0b21pemF0aW9uRWRpdG9yLnNlY3Rpb25DaGFuZ2VkJywge1xuXHRcdFx0c2VjdGlvbixcblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAnZWRpdG9yJykge1xuXHRcdFx0dGhpcy5nb0JhY2tUb0xpc3QoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudmlld01vZGUgPT09ICdtaWdyYXRpb24nKSB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlID0gJ2xpc3QnO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ21jcERldGFpbCcpIHtcblx0XHRcdHRoaXMuZ29CYWNrRnJvbU1jcERldGFpbCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ3BsdWdpbkRldGFpbCcpIHtcblx0XHRcdHRoaXMuZ29CYWNrRnJvbVBsdWdpbkRldGFpbCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ3Rvb2xzRGV0YWlsJykge1xuXHRcdFx0dGhpcy5nb0JhY2tGcm9tVG9vbERldGFpbCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuc2VsZWN0ZWRTZWN0aW9uID0gc2VjdGlvbjtcblx0XHR0aGlzLnNlY3Rpb25Db250ZXh0S2V5LnNldChzZWN0aW9uKTtcblxuXHRcdC8vIFBlcnNpc3Qgc2VsZWN0aW9uXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShBSV9DVVNUT01JWkFUSU9OX01BTkFHRU1FTlRfU0VMRUNURURfU0VDVElPTl9LRVksIHNlY3Rpb24sIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0Ly8gVXBkYXRlIGNvbnRlbnQgdmlzaWJpbGl0eVxuXHRcdHRoaXMudXBkYXRlQ29udGVudFZpc2liaWxpdHkoKTtcblxuXHRcdC8vIExvYWQgaXRlbXMgZm9yIHRoZSBuZXcgc2VjdGlvbiAob25seSBmb3IgcHJvbXB0cy1iYXNlZCBzZWN0aW9ucylcblx0XHRpZiAodGhpcy5pc1Byb21wdHNTZWN0aW9uKHNlY3Rpb24pKSB7XG5cdFx0XHR2b2lkIHRoaXMubGlzdFdpZGdldC5zZXRTZWN0aW9uKHNlY3Rpb24pO1xuXHRcdH1cblxuXHRcdC8vIFJlLWxheW91dCBhZnRlciB2aXNpYmlsaXR5IGNoYW5nZSBzbyB0aGUgbmV3bHktdmlzaWJsZSB3aWRnZXQgY2FuXG5cdFx0Ly8gbWVhc3VyZSBpdHMgZmxleC1jb21wdXRlZCBjb250YWluZXIgaGVpZ2h0IGNvcnJlY3RseS4gV2l0aG91dCB0aGlzLFxuXHRcdC8vIGEgd2lkZ2V0IHRoYXQgd2FzIHByZXZpb3VzbHkgaGlkZGVuIChvZmZzZXRIZWlnaHQgPT09IDApIGtlZXBzIGl0c1xuXHRcdC8vIHN0YWxlIGxpc3RDb250YWluZXIgaGVpZ2h0IGFuZCBjbGlwcyBpdGVtcyBhdCB0aGUgYm90dG9tLlxuXHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdH1cblxuXHRcdHRoaXMuZW5zdXJlU2VjdGlvbnNMaXN0UmVmbGVjdHNBY3RpdmVTZWN0aW9uKHNlY3Rpb24pO1xuXG5cdFx0Ly8gQWN0aXZhdGUgbWFya2V0cGxhY2UgYnJvd3NlIG1vZGUgaWYgcmVxdWVzdGVkXG5cdFx0aWYgKG9wdGlvbnM/LnNob3dNYXJrZXRwbGFjZSkge1xuXHRcdFx0aWYgKHNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMpIHtcblx0XHRcdFx0dGhpcy5tY3BMaXN0V2lkZ2V0Py5zaG93QnJvd3NlTWFya2V0cGxhY2UoKTtcblx0XHRcdH0gZWxzZSBpZiAoc2VjdGlvbiA9PT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUGx1Z2lucykge1xuXHRcdFx0XHR0aGlzLnBsdWdpbkxpc3RXaWRnZXQ/LnNob3dCcm93c2VNYXJrZXRwbGFjZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE1vdmUgZm9jdXMgdG8gdGhlIHNlYXJjaCBpbnB1dCBzbyBrZXlib2FyZCB1c2VycyBjYW4gaW1tZWRpYXRlbHlcblx0XHQvLyBmaWx0ZXIgd2l0aG91dCBleHRyYSBUYWIgdHJhdmVyc2FsIChwYXJpdHkgd2l0aCBtb3VzZS1jbGljayBmbG93KS5cblx0XHRpZiAoc2VjdGlvbiA9PT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uTWNwU2VydmVycykge1xuXHRcdFx0dGhpcy5tY3BMaXN0V2lkZ2V0Py5mb2N1c1NlYXJjaCgpO1xuXHRcdH0gZWxzZSBpZiAoc2VjdGlvbiA9PT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUGx1Z2lucykge1xuXHRcdFx0dGhpcy5wbHVnaW5MaXN0V2lkZ2V0Py5mb2N1c1NlYXJjaCgpO1xuXHRcdH0gZWxzZSBpZiAoc2VjdGlvbiA9PT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uTW9kZWxzKSB7XG5cdFx0XHR0aGlzLm1vZGVsc1dpZGdldD8uZm9jdXNTZWFyY2goKTtcblx0XHR9IGVsc2UgaWYgKHNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlRvb2xzKSB7XG5cdFx0XHR0aGlzLnRvb2xzTGlzdFdpZGdldD8uZm9jdXNTZWFyY2goKTtcblx0XHR9IGVsc2UgaWYgKHNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkF1dG9tYXRpb25zKSB7XG5cdFx0XHR0aGlzLmF1dG9tYXRpb25zTGlzdFdpZGdldD8uZm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5saXN0V2lkZ2V0Py5mb2N1c1NlYXJjaCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZW5zdXJlU2VjdGlvbnNMaXN0UmVmbGVjdHNBY3RpdmVTZWN0aW9uKHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uIHwgdW5kZWZpbmVkID0gdGhpcy5zZWxlY3RlZFNlY3Rpb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuc2VjdGlvbnNMaXN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHNlY3Rpb24gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gV2VsY29tZSBwYWdlIFx1MjAxNCBkZXNlbGVjdCBhbGxcblx0XHRcdHRoaXMuc2VjdGlvbnNMaXN0LnNldFNlbGVjdGlvbihbXSk7XG5cdFx0XHR0aGlzLnNlY3Rpb25zTGlzdC5zZXRGb2N1cyhbXSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLnNlY3Rpb25zLmZpbmRJbmRleChzID0+IHMuaWQgPT09IHNlY3Rpb24pO1xuXHRcdGlmIChpbmRleCA8IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLnNlY3Rpb25zTGlzdC5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoc2VsZWN0aW9uLmxlbmd0aCAhPT0gMSB8fCBzZWxlY3Rpb25bMF0gIT09IGluZGV4KSB7XG5cdFx0XHR0aGlzLnNlY3Rpb25zTGlzdC5zZXRTZWxlY3Rpb24oW2luZGV4XSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXMgPSB0aGlzLnNlY3Rpb25zTGlzdC5nZXRGb2N1cygpO1xuXHRcdGlmIChmb2N1cy5sZW5ndGggIT09IDEgfHwgZm9jdXNbMF0gIT09IGluZGV4KSB7XG5cdFx0XHR0aGlzLnNlY3Rpb25zTGlzdC5zZXRGb2N1cyhbaW5kZXhdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbnRlbnRWaXNpYmlsaXR5KCk6IHZvaWQge1xuXHRcdGNvbnN0IGlzRWRpdG9yTW9kZSA9IHRoaXMudmlld01vZGUgPT09ICdlZGl0b3InO1xuXHRcdGNvbnN0IGlzTWlncmF0aW9uTW9kZSA9IHRoaXMudmlld01vZGUgPT09ICdtaWdyYXRpb24nO1xuXHRcdGNvbnN0IGlzTWNwRGV0YWlsTW9kZSA9IHRoaXMudmlld01vZGUgPT09ICdtY3BEZXRhaWwnO1xuXHRcdGNvbnN0IGlzUGx1Z2luRGV0YWlsTW9kZSA9IHRoaXMudmlld01vZGUgPT09ICdwbHVnaW5EZXRhaWwnO1xuXHRcdGNvbnN0IGlzVG9vbHNEZXRhaWxNb2RlID0gdGhpcy52aWV3TW9kZSA9PT0gJ3Rvb2xzRGV0YWlsJztcblx0XHRjb25zdCBpc0RldGFpbE1vZGUgPSBpc01jcERldGFpbE1vZGUgfHwgaXNQbHVnaW5EZXRhaWxNb2RlIHx8IGlzVG9vbHNEZXRhaWxNb2RlO1xuXHRcdGNvbnN0IGlzV2VsY29tZSA9IHRoaXMuc2VsZWN0ZWRTZWN0aW9uID09PSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaXNQcm9tcHRzU2VjdGlvbiA9IHRoaXMuc2VsZWN0ZWRTZWN0aW9uICE9PSB1bmRlZmluZWQgJiYgdGhpcy5pc1Byb21wdHNTZWN0aW9uKHRoaXMuc2VsZWN0ZWRTZWN0aW9uKTtcblx0XHRjb25zdCBpc01vZGVsc1NlY3Rpb24gPSB0aGlzLnNlbGVjdGVkU2VjdGlvbiA9PT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uTW9kZWxzO1xuXHRcdGNvbnN0IGlzTWNwU2VjdGlvbiA9IHRoaXMuc2VsZWN0ZWRTZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzO1xuXHRcdGNvbnN0IGlzUGx1Z2luc1NlY3Rpb24gPSB0aGlzLnNlbGVjdGVkU2VjdGlvbiA9PT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUGx1Z2lucztcblx0XHRjb25zdCBpc1Rvb2xzU2VjdGlvbiA9IHRoaXMuc2VsZWN0ZWRTZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ub29scztcblx0XHRjb25zdCBpc0F1dG9tYXRpb25zU2VjdGlvbiA9IHRoaXMuc2VsZWN0ZWRTZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BdXRvbWF0aW9ucztcblxuXHRcdGlmICh0aGlzLndlbGNvbWVQYWdlKSB7XG5cdFx0XHR0aGlzLndlbGNvbWVQYWdlLmNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gaXNXZWxjb21lICYmICFpc0VkaXRvck1vZGUgJiYgIWlzTWlncmF0aW9uTW9kZSAmJiAhaXNEZXRhaWxNb2RlID8gJycgOiAnbm9uZSc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnByb21wdHNDb250ZW50Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnByb21wdHNDb250ZW50Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAhaXNFZGl0b3JNb2RlICYmICFpc01pZ3JhdGlvbk1vZGUgJiYgIWlzRGV0YWlsTW9kZSAmJiBpc1Byb21wdHNTZWN0aW9uID8gJycgOiAnbm9uZSc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1pZ3JhdGlvbkNvbnRlbnRDb250YWluZXIpIHtcblx0XHRcdHRoaXMubWlncmF0aW9uQ29udGVudENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gaXNNaWdyYXRpb25Nb2RlID8gJycgOiAnbm9uZSc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1vZGVsc0NvbnRlbnRDb250YWluZXIpIHtcblx0XHRcdHRoaXMubW9kZWxzQ29udGVudENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gIWlzRWRpdG9yTW9kZSAmJiAhaXNNaWdyYXRpb25Nb2RlICYmICFpc0RldGFpbE1vZGUgJiYgaXNNb2RlbHNTZWN0aW9uID8gJycgOiAnbm9uZSc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1jcENvbnRlbnRDb250YWluZXIpIHtcblx0XHRcdHRoaXMubWNwQ29udGVudENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gIWlzRWRpdG9yTW9kZSAmJiAhaXNNaWdyYXRpb25Nb2RlICYmICFpc0RldGFpbE1vZGUgJiYgaXNNY3BTZWN0aW9uID8gJycgOiAnbm9uZSc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1jcERldGFpbENvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5tY3BEZXRhaWxDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IGlzTWNwRGV0YWlsTW9kZSA/ICcnIDogJ25vbmUnO1xuXHRcdH1cblx0XHRpZiAodGhpcy5wbHVnaW5Db250ZW50Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnBsdWdpbkNvbnRlbnRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICFpc0VkaXRvck1vZGUgJiYgIWlzTWlncmF0aW9uTW9kZSAmJiAhaXNEZXRhaWxNb2RlICYmIGlzUGx1Z2luc1NlY3Rpb24gPyAnJyA6ICdub25lJztcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVBdXRvbWF0aW9uc0NvbnRlbnRWaXNpYmlsaXR5KCFpc0VkaXRvck1vZGUgJiYgIWlzTWlncmF0aW9uTW9kZSAmJiAhaXNEZXRhaWxNb2RlICYmIGlzQXV0b21hdGlvbnNTZWN0aW9uKTtcblx0XHRpZiAodGhpcy5wbHVnaW5EZXRhaWxDb250YWluZXIpIHtcblx0XHRcdHRoaXMucGx1Z2luRGV0YWlsQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBpc1BsdWdpbkRldGFpbE1vZGUgPyAnJyA6ICdub25lJztcblx0XHR9XG5cdFx0aWYgKHRoaXMudG9vbHNDb250ZW50Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnRvb2xzQ29udGVudENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gIWlzRWRpdG9yTW9kZSAmJiAhaXNNaWdyYXRpb25Nb2RlICYmICFpc0RldGFpbE1vZGUgJiYgaXNUb29sc1NlY3Rpb24gPyAnJyA6ICdub25lJztcblx0XHR9XG5cdFx0aWYgKHRoaXMudG9vbHNEZXRhaWxDb250YWluZXIpIHtcblx0XHRcdHRoaXMudG9vbHNEZXRhaWxDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IGlzVG9vbHNEZXRhaWxNb2RlID8gJycgOiAnbm9uZSc7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW3NlY3Rpb24sIGNvbnRhaW5lcl0gb2YgdGhpcy5jb250cmlidXRlZFNlY3Rpb25Db250YWluZXJzKSB7XG5cdFx0XHRjb25zdCB2aXNpYmxlID0gIWlzRWRpdG9yTW9kZSAmJiAhaXNNaWdyYXRpb25Nb2RlICYmICFpc0RldGFpbE1vZGUgJiYgdGhpcy5zZWxlY3RlZFNlY3Rpb24gPT09IHNlY3Rpb247XG5cdFx0XHRjb250YWluZXIuc3R5bGUuZGlzcGxheSA9IHZpc2libGUgPyAnJyA6ICdub25lJztcblx0XHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuZW5zdXJlQ29udHJpYnV0ZWRTZWN0aW9uV2lkZ2V0KHNlY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5lZGl0b3JDb250ZW50Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmVkaXRvckNvbnRlbnRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IGlzRWRpdG9yTW9kZSA/ICcnIDogJ25vbmUnO1xuXHRcdH1cblxuXHRcdC8vIFJlbmRlciBhbmQgbGF5b3V0IG1vZGVscyB3aWRnZXQgd2hlbiBzd2l0Y2hpbmcgdG8gaXRcblx0XHRpZiAoaXNNb2RlbHNTZWN0aW9uICYmIHRoaXMubW9kZWxzV2lkZ2V0KSB7XG5cdFx0XHR0aGlzLm1vZGVsc1dpZGdldC5yZW5kZXIoKTtcblx0XHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBlbnN1cmVDb250cmlidXRlZFNlY3Rpb25XaWRnZXQoc2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24pOiBJQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25XaWRnZXQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5jb250cmlidXRlZFNlY3Rpb25XaWRnZXRzLmdldChzZWN0aW9uKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25SZWdpc3RyeS5nZXQoc2VjdGlvbiwgdGhpcy5oYXJuZXNzU2VydmljZS5hY3RpdmVIYXJuZXNzLmdldCgpKTtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmNvbnRyaWJ1dGVkU2VjdGlvbkNvbnRhaW5lcnMuZ2V0KHNlY3Rpb24pO1xuXHRcdGlmICghY29udHJpYnV0aW9uIHx8ICFjb250YWluZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHdpZGdldCA9IGNvbnRyaWJ1dGlvbi5jcmVhdGUodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgY29udGFpbmVyKTtcblx0XHR0aGlzLmNvbnRyaWJ1dGVkU2VjdGlvbldpZGdldHMuc2V0KHNlY3Rpb24sIHdpZGdldCk7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQod2lkZ2V0KTtcblx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHdpZGdldC5sYXlvdXQ/Lih0aGlzLmRpbWVuc2lvbik7XG5cdFx0fVxuXHRcdHJldHVybiB3aWRnZXQ7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUF1dG9tYXRpb25zQ29udGVudFZpc2liaWxpdHkoc2VjdGlvblZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuYXV0b21hdGlvbnNDb250ZW50Q29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHNlY3Rpb25WaXNpYmxlKSB7XG5cdFx0XHR0aGlzLmF1dG9tYXRpb25zQ29udGVudENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR0aGlzLmF1dG9tYXRpb25zTGlzdFdpZGdldD8uc2V0VmlzaWJsZSh0aGlzLmlzVmlzaWJsZSgpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hdXRvbWF0aW9uc0xpc3RXaWRnZXQ/LnNldFZpc2libGUoZmFsc2UpO1xuXHRcdFx0dGhpcy5hdXRvbWF0aW9uc0NvbnRlbnRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyBjdXN0b21pemF0aW9uIHVzaW5nIHRoZSBBSS1ndWlkZWQgZmxvdy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlTmV3SXRlbVdpdGhBSSh0eXBlOiBQcm9tcHRzVHlwZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEN1c3RvbWl6YXRpb25FZGl0b3JDcmVhdGVJdGVtRXZlbnQsIEN1c3RvbWl6YXRpb25FZGl0b3JDcmVhdGVJdGVtQ2xhc3NpZmljYXRpb24+KCdjaGF0Q3VzdG9taXphdGlvbkVkaXRvci5jcmVhdGVJdGVtJywge1xuXHRcdFx0c2VjdGlvbjogdGhpcy5zZWxlY3RlZFNlY3Rpb24gPz8gJ3dlbGNvbWUnLFxuXHRcdFx0cHJvbXB0VHlwZTogdHlwZSxcblx0XHRcdGNyZWF0aW9uTW9kZTogJ2FpJyxcblx0XHRcdHRhcmdldDogJ3dvcmtzcGFjZScsXG5cdFx0fSk7XG5cdFx0aWYgKHRoaXMuaW5wdXQpIHtcblx0XHRcdHRoaXMuZ3JvdXAuY2xvc2VFZGl0b3IodGhpcy5pbnB1dCk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMud29ya3NwYWNlU2VydmljZS5nZW5lcmF0ZUN1c3RvbWl6YXRpb24odHlwZSk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyBwcm9tcHQgZmlsZSBhbmQgb3BlbnMgaXQgaW4gdGhlIGVtYmVkZGVkIGVkaXRvci5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlTmV3SXRlbU1hbnVhbCh0eXBlOiBQcm9tcHRzVHlwZSwgdGFyZ2V0OiAnbG9jYWwnIHwgJ3VzZXInIHwgJ3dvcmtzcGFjZS1yb290Jywgcm9vdEZpbGVOYW1lPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q3VzdG9taXphdGlvbkVkaXRvckNyZWF0ZUl0ZW1FdmVudCwgQ3VzdG9taXphdGlvbkVkaXRvckNyZWF0ZUl0ZW1DbGFzc2lmaWNhdGlvbj4oJ2NoYXRDdXN0b21pemF0aW9uRWRpdG9yLmNyZWF0ZUl0ZW0nLCB7XG5cdFx0XHRzZWN0aW9uOiB0aGlzLnNlbGVjdGVkU2VjdGlvbiA/PyAnd2VsY29tZScsXG5cdFx0XHRwcm9tcHRUeXBlOiB0eXBlLFxuXHRcdFx0Y3JlYXRpb25Nb2RlOiAnbWFudWFsJyxcblx0XHRcdHRhcmdldDogdGFyZ2V0ID09PSAnd29ya3NwYWNlLXJvb3QnID8gJ3dvcmtzcGFjZScgOiB0YXJnZXQsXG5cdFx0fSk7XG5cblx0XHQvLyBIYW5kbGUgd29ya3NwYWNlLXJvb3QgZmlsZXMgKGUuZy4gQUdFTlRTLm1kIG9yIENMQVVERS5tZCBhdCBwcm9qZWN0IHJvb3QpLlxuXHRcdC8vIHJvb3RGaWxlTmFtZSBpcyBwYXNzZWQgZnJvbSByb290RmlsZVNob3J0Y3V0czsgZmFsbHMgYmFjayB0b1xuXHRcdC8vIHRoZSBzZWN0aW9uIG92ZXJyaWRlJ3Mgcm9vdEZpbGUsIHRoZW4gQUdFTlRTLm1kIGFzIHRoZSBkZWZhdWx0LlxuXHRcdGlmICh0YXJnZXQgPT09ICd3b3Jrc3BhY2Utcm9vdCcpIHtcblx0XHRcdGNvbnN0IHByb2plY3RSb290ID0gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldEFjdGl2ZVByb2plY3RSb290KCk7XG5cdFx0XHRpZiAoIXByb2plY3RSb290KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG92ZXJyaWRlID0gdGhpcy5zZWxlY3RlZFNlY3Rpb24gPyB0aGlzLmhhcm5lc3NTZXJ2aWNlLmdldEFjdGl2ZURlc2NyaXB0b3IoKS5zZWN0aW9uT3ZlcnJpZGVzPy5nZXQodGhpcy5zZWxlY3RlZFNlY3Rpb24pIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgZmlsZU5hbWUgPSByb290RmlsZU5hbWUgPz8gb3ZlcnJpZGU/LnJvb3RGaWxlID8/IEFHRU5UX01EX0ZJTEVOQU1FO1xuXHRcdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5qb2luUGF0aChwcm9qZWN0Um9vdCwgZmlsZU5hbWUpO1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKGZpbGVVcmkpKSB7XG5cdFx0XHRcdC8vIEZpbGUgYWxyZWFkeSBleGlzdHMgXHUyMDE0IGp1c3Qgb3BlbiBpdFxuXHRcdFx0XHRhd2FpdCB0aGlzLnNob3dFbWJlZGRlZEVkaXRvcihmaWxlVXJpLCBmaWxlTmFtZSwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNyZWF0ZUZpbGUoZmlsZVVyaSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2hvd0VtYmVkZGVkRWRpdG9yKGZpbGVVcmksIGZpbGVOYW1lLCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIFByb21wdHNTdG9yYWdlLmxvY2FsLCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMubGlzdFdpZGdldC5yZWZyZXNoKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGUgPT09IFByb21wdHNUeXBlLmhvb2spIHtcblx0XHRcdGlmICh0aGlzLndvcmtzcGFjZVNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0XHQvLyBTZXNzaW9uczogc2hvdyBob29rcyBmaWx0ZXJlZCB0byBDb3BpbG90IENMSSAoR2l0SHViIENvcGlsb3QpIGhvb2sgdHlwZXNcblx0XHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihzaG93Q29uZmlndXJlSG9va3NRdWlja1BpY2ssIHtcblx0XHRcdFx0XHRvcGVuRWRpdG9yOiBhc3luYyAocmVzb3VyY2UpID0+IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuc2hvd0VtYmVkZGVkRWRpdG9yKHJlc291cmNlLCBiYXNlbmFtZShyZXNvdXJjZSksIFByb21wdHNUeXBlLmhvb2ssIFByb21wdHNTdG9yYWdlLmxvY2FsLCB0cnVlKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRhcmdldDogVGFyZ2V0LkdpdEh1YkNvcGlsb3QsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gQ29yZTogdXNlIHRoZSBkZWZhdWx0IGNvcmUgYmVoYXZpb3VyXG5cdFx0XHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oc2hvd0NvbmZpZ3VyZUhvb2tzUXVpY2tQaWNrLCB7XG5cdFx0XHRcdFx0b3BlbkVkaXRvcjogYXN5bmMgKHJlc291cmNlKSA9PiB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnNob3dFbWJlZGRlZEVkaXRvcihyZXNvdXJjZSwgYmFzZW5hbWUocmVzb3VyY2UpLCBQcm9tcHRzVHlwZS5ob29rLCBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5oYXJuZXNzU2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2UuZ2V0KCk7XG5cdFx0Y29uc3QgcGlja2VyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDdXN0b21pemF0aW9uTG9jYXRpb25QaWNrZXIpO1xuXHRcdGNvbnN0IHRhcmdldERpciA9IGF3YWl0IHBpY2tlci5yZXNvbHZlVGFyZ2V0RGlyZWN0b3J5V2l0aFBpY2tlcihcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHR5cGUsXG5cdFx0XHR0YXJnZXQsXG5cdFx0KTtcblx0XHRpZiAodGFyZ2V0RGlyID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm47IC8vIFVzZXIgY2FuY2VsbGVkIHRoZSBwaWNrZXJcblx0XHR9XG5cblx0XHRpZiAodGFyZ2V0RGlyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIHRhcmdldERpciBtYXkgYmUgdW5kZWZpbmVkIHdoZW4gbm8gbWF0Y2hpbmcgZm9sZGVyIGV4aXN0cyBmb3IgdGhlXG5cdFx0XHQvLyByZXF1ZXN0ZWQgc3RvcmFnZSB0eXBlIChlLmcuIHNraWxscyBoYXZlIG5vIHVzZXItc3RvcmFnZSBmb2xkZXIpLlxuXHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihzaG93Tm9Gb2xkZXJzRGlhbG9nLCB0eXBlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBXaGVuIHRoZSBhY3RpdmUgaGFybmVzcyBvdmVycmlkZXMgdGhlIGZpbGUgZXh0ZW5zaW9uIChlLmcuIENsYXVkZVxuXHRcdC8vIHJ1bGVzIHVzZSAubWQgaW5zdGVhZCBvZiAuaW5zdHJ1Y3Rpb25zLm1kKSwgcGFzcyBpdCB0aHJvdWdoIHNvIHRoZVxuXHRcdC8vIG5hbWUgcGlja2VyIGFuZCBmaWxlIGNyZWF0aW9uIHVzZSB0aGUgY29ycmVjdCBleHRlbnNpb24uXG5cdFx0Y29uc3Qgb3ZlcnJpZGUgPSB0aGlzLnNlbGVjdGVkU2VjdGlvbiA/IHRoaXMuaGFybmVzc1NlcnZpY2UuZ2V0QWN0aXZlRGVzY3JpcHRvcigpLnNlY3Rpb25PdmVycmlkZXM/LmdldCh0aGlzLnNlbGVjdGVkU2VjdGlvbikgOiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBvcHRpb25zOiBJTmV3UHJvbXB0T3B0aW9ucyA9IHtcblx0XHRcdHRhcmdldEZvbGRlcjogdGFyZ2V0RGlyLFxuXHRcdFx0dGFyZ2V0U3RvcmFnZTogdGFyZ2V0ID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnVzZXIgPyBQcm9tcHRzU3RvcmFnZS51c2VyIDogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRmaWxlRXh0ZW5zaW9uOiBvdmVycmlkZT8uZmlsZUV4dGVuc2lvbixcblx0XHRcdG9wZW5GaWxlOiBhc3luYyAodXJpKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGlzV29ya3NwYWNlID0gdGFyZ2V0ID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmxvY2FsO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnNob3dFbWJlZGRlZEVkaXRvcih1cmksIGJhc2VuYW1lKHVyaSksIHR5cGUsIHRhcmdldCwgaXNXb3Jrc3BhY2UpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5lbWJlZGRlZEVkaXRvcjtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGxldCBjb21tYW5kSWQ6IHN0cmluZztcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUucHJvbXB0OiBjb21tYW5kSWQgPSBORVdfUFJPTVBUX0NPTU1BTkRfSUQ7IGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnM6IGNvbW1hbmRJZCA9IE5FV19JTlNUUlVDVElPTlNfQ09NTUFORF9JRDsgYnJlYWs7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmFnZW50OiBjb21tYW5kSWQgPSBORVdfQUdFTlRfQ09NTUFORF9JRDsgYnJlYWs7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLnNraWxsOiBjb21tYW5kSWQgPSBORVdfU0tJTExfQ09NTUFORF9JRDsgYnJlYWs7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kSWQsIG9wdGlvbnMpO1xuXHRcdHRoaXMubGlzdFdpZGdldC5yZWZyZXNoKCk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0Ly8gVGhlIG1vZGFsIHByb3ZpZGVzIGl0cyBvd24gcGFuZWwgY2hyb21lLCBzbyB0aGUgc3BsaXQgdmlldyBzZXBhcmF0b3Jcblx0XHQvLyBpcyBpbnRlbnRpb25hbGx5IGhpZGRlbiBoZXJlIHJlZ2FyZGxlc3Mgb2YgdGhlbWUuXG5cdFx0dGhpcy5zcGxpdFZpZXc/LnN0eWxlKHsgc2VwYXJhdG9yQm9yZGVyOiBDb2xvci50cmFuc3BhcmVudCB9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNldElucHV0KGlucHV0OiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9ySW5wdXQsIG9wdGlvbnM6IElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE9uIChyZSlvcGVuLCBjbGVhciBhbnkgb3ZlcnJpZGUgc28gdGhlIHJvb3QgY29tZXMgZnJvbSB0aGUgZGVmYXVsdCBzb3VyY2Vcblx0XHR0aGlzLndvcmtzcGFjZVNlcnZpY2UuY2xlYXJPdmVycmlkZVByb2plY3RSb290KCk7XG5cblx0XHR0aGlzLmluRWRpdG9yQ29udGV4dEtleS5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5zZWN0aW9uQ29udGV4dEtleS5zZXQodGhpcy5zZWxlY3RlZFNlY3Rpb24gPz8gJycpO1xuXG5cdFx0aW5wdXQuc2V0U2F2ZUhhbmRsZXIoKCkgPT4gdGhpcy5oYW5kbGVCdWlsdGluU2F2ZSgpKTtcblxuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEN1c3RvbWl6YXRpb25FZGl0b3JPcGVuZWRFdmVudCwgQ3VzdG9taXphdGlvbkVkaXRvck9wZW5lZENsYXNzaWZpY2F0aW9uPignY2hhdEN1c3RvbWl6YXRpb25FZGl0b3Iub3BlbmVkJywge1xuXHRcdFx0c2VjdGlvbjogdGhpcy5zZWxlY3RlZFNlY3Rpb24gPz8gJ3dlbGNvbWUnLFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgc3VwZXIuc2V0SW5wdXQoaW5wdXQsIG9wdGlvbnMsIGNvbnRleHQsIHRva2VuKTtcblxuXHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGNsZWFySW5wdXQoKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5wdXQgPSB0aGlzLmlucHV0O1xuXHRcdGlmIChpbnB1dCBpbnN0YW5jZW9mIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dCkge1xuXHRcdFx0aW5wdXQuc2V0U2F2ZUhhbmRsZXIodW5kZWZpbmVkKTtcblx0XHRcdGlucHV0LnNldERpcnR5KGZhbHNlKTtcblx0XHR9XG5cblx0XHR0aGlzLmluRWRpdG9yQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAnZWRpdG9yJykge1xuXHRcdFx0dGhpcy5nb0JhY2tUb0xpc3QoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudmlld01vZGUgPT09ICdtaWdyYXRpb24nKSB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlID0gJ2xpc3QnO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ21jcERldGFpbCcpIHtcblx0XHRcdHRoaXMuZ29CYWNrRnJvbU1jcERldGFpbCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ3BsdWdpbkRldGFpbCcpIHtcblx0XHRcdHRoaXMuZ29CYWNrRnJvbVBsdWdpbkRldGFpbCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ3Rvb2xzRGV0YWlsJykge1xuXHRcdFx0dGhpcy5nb0JhY2tGcm9tVG9vbERldGFpbCgpO1xuXHRcdH1cblx0XHQvLyBDbGVhciB0cmFuc2llbnQgZm9sZGVyIG92ZXJyaWRlIG9uIGNsb3NlXG5cdFx0dGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmNsZWFyT3ZlcnJpZGVQcm9qZWN0Um9vdCgpO1xuXHRcdHRoaXMuZGlzcG9zZUJ1aWx0aW5FZGl0aW5nU2Vzc2lvbnMoKTtcblx0XHRzdXBlci5jbGVhcklucHV0KCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlKTtcblx0XHR0aGlzLnVwZGF0ZUF1dG9tYXRpb25zQ29udGVudFZpc2liaWxpdHkodGhpcy52aWV3TW9kZSA9PT0gJ2xpc3QnICYmIHRoaXMuc2VsZWN0ZWRTZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BdXRvbWF0aW9ucyk7XG5cdFx0aWYgKHZpc2libGUgJiYgdGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBsYXlvdXQoZGltZW5zaW9uOiBET00uRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cblx0XHRpZiAodGhpcy5jb250YWluZXIgJiYgdGhpcy5zcGxpdFZpZXcpIHtcblx0XHRcdHRoaXMuc3BsaXRWaWV3Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2RpbWVuc2lvbi5oZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy5zcGxpdFZpZXcubGF5b3V0KGRpbWVuc2lvbi53aWR0aCwgZGltZW5zaW9uLmhlaWdodCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHRoaXMuY29udHJpYnV0ZWRTZWN0aW9uV2lkZ2V0cy52YWx1ZXMoKSkge1xuXHRcdFx0d2lkZ2V0LmxheW91dD8uKGRpbWVuc2lvbik7XG5cdFx0fVxuXHRcdHRoaXMubWlncmF0aW9uU2VhcmNoSW5wdXQ/LmxheW91dCgpO1xuXHRcdHRoaXMubWlncmF0aW9uTGlzdFNjcm9sbGFibGU/LnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAnZWRpdG9yJykge1xuXHRcdFx0aWYgKHRoaXMuZWRpdG9yRGlzcGxheU1vZGUgPT09ICdyYXcnKSB7XG5cdFx0XHRcdHRoaXMuZW1iZWRkZWRFZGl0b3I/LmZvY3VzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVkaXRvck1vZGVCdXR0b24/LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAnbWlncmF0aW9uJykge1xuXHRcdFx0dGhpcy5taWdyYXRpb25TZWFyY2hJbnB1dD8uZm9jdXMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRTZWN0aW9uID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMud2VsY29tZVBhZ2U/LmZvY3VzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLnNlbGVjdGVkU2VjdGlvbiA9PT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uTWNwU2VydmVycykge1xuXHRcdFx0dGhpcy5tY3BMaXN0V2lkZ2V0Py5mb2N1c1NlYXJjaCgpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zZWxlY3RlZFNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMpIHtcblx0XHRcdHRoaXMucGx1Z2luTGlzdFdpZGdldD8uZm9jdXNTZWFyY2goKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuc2VsZWN0ZWRTZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Nb2RlbHMpIHtcblx0XHRcdHRoaXMubW9kZWxzV2lkZ2V0Py5mb2N1c1NlYXJjaCgpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zZWxlY3RlZFNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlRvb2xzKSB7XG5cdFx0XHR0aGlzLnRvb2xzTGlzdFdpZGdldD8uZm9jdXNTZWFyY2goKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuc2VsZWN0ZWRTZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BdXRvbWF0aW9ucykge1xuXHRcdFx0dGhpcy5hdXRvbWF0aW9uc0xpc3RXaWRnZXQ/LmZvY3VzKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNlbGVjdGVkU2VjdGlvbiAmJiB0aGlzLmNvbnRyaWJ1dGVkU2VjdGlvbkNvbnRhaW5lcnMuaGFzKHRoaXMuc2VsZWN0ZWRTZWN0aW9uKSkge1xuXHRcdFx0dGhpcy5lbnN1cmVDb250cmlidXRlZFNlY3Rpb25XaWRnZXQodGhpcy5zZWxlY3RlZFNlY3Rpb24pPy5mb2N1cz8uKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubGlzdFdpZGdldD8uZm9jdXNTZWFyY2goKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2VsZWN0cyBhIHNwZWNpZmljIHNlY3Rpb24gcHJvZ3JhbW1hdGljYWxseS5cblx0ICovXG5cdHB1YmxpYyBzZWxlY3RTZWN0aW9uQnlJZChzZWN0aW9uSWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLCBvcHRpb25zPzogeyBzaG93TWFya2V0cGxhY2U/OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuc2VjdGlvbnMuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gc2VjdGlvbklkKTtcblx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0Ly8gRGlyZWN0bHkgdXBkYXRlIHN0YXRlIGFuZCBVSSwgYnlwYXNzaW5nIHRoZSBlYXJseS1yZXR1cm4gZ3VhcmQgaW4gc2VsZWN0U2VjdGlvblxuXHRcdFx0Ly8gdG8gaGFuZGxlIHRoZSBjYXNlIHdoZXJlIHRoZSBlZGl0b3IganVzdCBvcGVuZWQgd2l0aCBhIHBlcnNpc3RlZCBzZWN0aW9uIHRoYXRcblx0XHRcdC8vIG1hdGNoZXMgdGhlIHJlcXVlc3RlZCBvbmUgKGNvbnRlbnQgbWlnaHQgbm90IGJlIGxvYWRlZCB5ZXQpLlxuXHRcdFx0aWYgKHRoaXMudmlld01vZGUgPT09ICdlZGl0b3InKSB7XG5cdFx0XHRcdHRoaXMuZ29CYWNrVG9MaXN0KCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ21pZ3JhdGlvbicpIHtcblx0XHRcdFx0dGhpcy52aWV3TW9kZSA9ICdsaXN0Jztcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAnbWNwRGV0YWlsJykge1xuXHRcdFx0XHR0aGlzLmdvQmFja0Zyb21NY3BEZXRhaWwoKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAncGx1Z2luRGV0YWlsJykge1xuXHRcdFx0XHR0aGlzLmdvQmFja0Zyb21QbHVnaW5EZXRhaWwoKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAndG9vbHNEZXRhaWwnKSB7XG5cdFx0XHRcdHRoaXMuZ29CYWNrRnJvbVRvb2xEZXRhaWwoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuc2VsZWN0ZWRTZWN0aW9uID0gc2VjdGlvbklkO1xuXHRcdFx0dGhpcy5zZWN0aW9uQ29udGV4dEtleS5zZXQoc2VjdGlvbklkKTtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX1NFTEVDVEVEX1NFQ1RJT05fS0VZLCBzZWN0aW9uSWQsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0dGhpcy51cGRhdGVDb250ZW50VmlzaWJpbGl0eSgpO1xuXHRcdFx0aWYgKHRoaXMuaXNQcm9tcHRzU2VjdGlvbihzZWN0aW9uSWQpKSB7XG5cdFx0XHRcdHZvaWQgdGhpcy5saXN0V2lkZ2V0LnNldFNlY3Rpb24oc2VjdGlvbklkKTtcblx0XHRcdH1cblx0XHRcdC8vIFJlLWxheW91dCBhZnRlciB2aXNpYmlsaXR5IGNoYW5nZSBzbyB0aGUgbmV3bHktdmlzaWJsZSB3aWRnZXRcblx0XHRcdC8vIGNhbiBtZWFzdXJlIGl0cyBmbGV4LWNvbXB1dGVkIGNvbnRhaW5lciBoZWlnaHQgY29ycmVjdGx5LlxuXHRcdFx0aWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuZW5zdXJlU2VjdGlvbnNMaXN0UmVmbGVjdHNBY3RpdmVTZWN0aW9uKHNlY3Rpb25JZCk7XG5cblx0XHRcdC8vIEFjdGl2YXRlIG1hcmtldHBsYWNlIGJyb3dzZSBtb2RlIGlmIHJlcXVlc3RlZFxuXHRcdFx0aWYgKG9wdGlvbnM/LnNob3dNYXJrZXRwbGFjZSkge1xuXHRcdFx0XHRpZiAoc2VjdGlvbklkID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzKSB7XG5cdFx0XHRcdFx0dGhpcy5tY3BMaXN0V2lkZ2V0Py5zaG93QnJvd3NlTWFya2V0cGxhY2UoKTtcblx0XHRcdFx0fSBlbHNlIGlmIChzZWN0aW9uSWQgPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMpIHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbkxpc3RXaWRnZXQ/LnNob3dCcm93c2VNYXJrZXRwbGFjZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE1vdmVzIGZvY3VzIHRvIGEgc3BlY2lmaWMgYXV0b21hdGlvbiBpbiB0aGUgQXV0b21hdGlvbnMgc2VjdGlvbi5cblx0ICovXG5cdHB1YmxpYyBmb2N1c0F1dG9tYXRpb24oYXV0b21hdGlvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmF1dG9tYXRpb25zTGlzdFdpZGdldD8uZm9jdXNBdXRvbWF0aW9uKGF1dG9tYXRpb25JZCk7XG5cdH1cblxuXHRwdWJsaWMgc2hvd1Byb21wdE1pZ3JhdGlvblBhZ2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzUHJvbXB0TWlncmF0aW9uRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudmlld01vZGUgPT09ICdlZGl0b3InKSB7XG5cdFx0XHR0aGlzLmdvQmFja1RvTGlzdCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ21jcERldGFpbCcpIHtcblx0XHRcdHRoaXMuZ29CYWNrRnJvbU1jcERldGFpbCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ3BsdWdpbkRldGFpbCcpIHtcblx0XHRcdHRoaXMuZ29CYWNrRnJvbVBsdWdpbkRldGFpbCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ3Rvb2xzRGV0YWlsJykge1xuXHRcdFx0dGhpcy5nb0JhY2tGcm9tVG9vbERldGFpbCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuc2VsZWN0ZWRTZWN0aW9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuc2VjdGlvbkNvbnRleHRLZXkuc2V0KCcnKTtcblx0XHR0aGlzLnZpZXdNb2RlID0gJ21pZ3JhdGlvbic7XG5cdFx0dGhpcy5lbnN1cmVTZWN0aW9uc0xpc3RSZWZsZWN0c0FjdGl2ZVNlY3Rpb24odW5kZWZpbmVkKTtcblx0XHR0aGlzLnJlbmRlclByb21wdE1pZ3JhdGlvblBhZ2UoKTtcblx0XHR0aGlzLnVwZGF0ZUNvbnRlbnRWaXNpYmlsaXR5KCk7XG5cdFx0aWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlZnJlc2hlcyB0aGUgbGlzdCB3aWRnZXQuXG5cdCAqL1xuXHRwdWJsaWMgcmVmcmVzaExpc3QoKTogdm9pZCB7XG5cdFx0dGhpcy5saXN0V2lkZ2V0LnJlZnJlc2goKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTY3JvbGxzIHRoZSBhY3RpdmUgbGlzdCB3aWRnZXQgc28gdGhlIGxhc3QgaXRlbSBpcyB2aXNpYmxlLlxuXHQgKi9cblx0cHVibGljIHJldmVhbExhc3RJdGVtKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNlbGVjdGVkU2VjdGlvbiA9PT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uTWNwU2VydmVycykge1xuXHRcdFx0dGhpcy5tY3BMaXN0V2lkZ2V0Py5yZXZlYWxMYXN0SXRlbSgpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zZWxlY3RlZFNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMpIHtcblx0XHRcdHRoaXMucGx1Z2luTGlzdFdpZGdldD8ucmV2ZWFsTGFzdEl0ZW0oKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5saXN0V2lkZ2V0LnJldmVhbExhc3RJdGVtKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEdlbmVyYXRlcyBhIGRlYnVnIHJlcG9ydCBmb3IgdGhlIGN1cnJlbnQgc2VjdGlvbi5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBnZW5lcmF0ZURlYnVnUmVwb3J0KCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdFdpZGdldC5nZW5lcmF0ZURlYnVnUmVwb3J0KCk7XG5cdH1cblxuXHQvLyNyZWdpb24gRW1iZWRkZWQgRWRpdG9yXG5cblx0cHJpdmF0ZSBjcmVhdGVFbWJlZGRlZEVkaXRvcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWRpdG9yQ29udGVudENvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvckhlYWRlciA9IERPTS5hcHBlbmQodGhpcy5lZGl0b3JDb250ZW50Q29udGFpbmVyLCAkKCcuZWRpdG9yLWhlYWRlcicpKTtcblxuXHRcdHRoaXMuZWRpdG9yQWN0aW9uQnV0dG9uID0gRE9NLmFwcGVuZChlZGl0b3JIZWFkZXIsICQoJ2J1dHRvbi5lZGl0b3ItYmFjay1idXR0b24nKSk7XG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25CdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2JhY2tUb0xpc3QnLCBcIkJhY2sgdG8gbGlzdFwiKSk7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgdGhpcy5lZGl0b3JBY3Rpb25CdXR0b24sIGxvY2FsaXplKCdiYWNrVG9MaXN0VG9vbHRpcCcsIFwiQmFjayB0byBsaXN0XCIpKSk7XG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25CdXR0b25JY29uID0gRE9NLmFwcGVuZCh0aGlzLmVkaXRvckFjdGlvbkJ1dHRvbiwgJChgLmNvZGljb24uY29kaWNvbi0ke0NvZGljb24uYXJyb3dMZWZ0LmlkfS5lZGl0b3ItYWN0aW9uLWJ1dHRvbi1pY29uYCkpO1xuXHRcdHRoaXMuZWRpdG9yQWN0aW9uQnV0dG9uSWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWRpdG9yQWN0aW9uQnV0dG9uLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMuaGFuZGxlRWRpdG9yQWN0aW9uQnV0dG9uKCkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gaGFuZGxlIGVkaXRvciBiYWNrIGFjdGlvbjonLCBlcnJvcik7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnZWRpdG9yQWN0aW9uQnV0dG9uRmFpbGVkJywgXCJGYWlsZWQgdG8gZmluaXNoIHRoZSBwcm9tcHQgYWN0aW9uLlwiKSk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpdGVtSW5mbyA9IERPTS5hcHBlbmQoZWRpdG9ySGVhZGVyLCAkKCcuZWRpdG9yLWl0ZW0taW5mbycpKTtcblx0XHR0aGlzLmVkaXRvckl0ZW1OYW1lRWxlbWVudCA9IERPTS5hcHBlbmQoaXRlbUluZm8sICQoJy5lZGl0b3ItaXRlbS1uYW1lJykpO1xuXHRcdHRoaXMuZWRpdG9ySXRlbVBhdGhFbGVtZW50ID0gRE9NLmFwcGVuZChpdGVtSW5mbywgJCgnLmVkaXRvci1pdGVtLXBhdGgnKSk7XG5cblx0XHR0aGlzLmVkaXRvck1vZGVCdXR0b24gPSBET00uYXBwZW5kKGVkaXRvckhlYWRlciwgJCgnYnV0dG9uLmVkaXRvci1tb2RlLWJ1dHRvbicpKTtcblx0XHR0aGlzLmVkaXRvck1vZGVCdXR0b24udHlwZSA9ICdidXR0b24nO1xuXHRcdHRoaXMuZWRpdG9yTW9kZUJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsICdmYWxzZScpO1xuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRoaXMuZWRpdG9yTW9kZUJ1dHRvbiwgKCkgPT4gdGhpcy5nZXRFZGl0b3JNb2RlQnV0dG9uVG9vbHRpcCgpKSk7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVkaXRvck1vZGVCdXR0b24sICdjbGljaycsICgpID0+IHtcblx0XHRcdHRoaXMudG9nZ2xlRWRpdG9yRGlzcGxheU1vZGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmVkaXRvclNhdmVJbmRpY2F0b3IgPSBET00uYXBwZW5kKGVkaXRvckhlYWRlciwgJCgnLmVkaXRvci1zYXZlLWluZGljYXRvcicpKTtcblxuXHRcdHRoaXMuZWRpdG9yUHJldmlld0NvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5lZGl0b3JDb250ZW50Q29udGFpbmVyLCAkKCcuZWRpdG9yLXByZXZpZXctY29udGFpbmVyJykpO1xuXHRcdHRoaXMuZWRpdG9yUHJldmlld1Njcm9sbENvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5lZGl0b3JQcmV2aWV3Q29udGFpbmVyLCAkKCcuZWRpdG9yLXByZXZpZXctc2Nyb2xsLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLmVkaXRvclByZXZpZXdTY3JvbGxDb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3JlZ2lvbicpO1xuXHRcdHRoaXMuZWRpdG9yUHJldmlld1Njcm9sbENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnY3VzdG9taXphdGlvblByZXZpZXdBcmlhTGFiZWwnLCBcIkN1c3RvbWl6YXRpb24gcHJldmlld1wiKSk7XG5cblx0XHR0aGlzLmVkaXRvclByZXZpZXdJc3N1ZXNDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuZWRpdG9yUHJldmlld1Njcm9sbENvbnRhaW5lciwgJCgnLmVkaXRvci1wcmV2aWV3LWlzc3VlcycpKTtcblxuXHRcdGNvbnN0IGZyb250TWF0dGVyU2VjdGlvbiA9IERPTS5hcHBlbmQodGhpcy5lZGl0b3JQcmV2aWV3U2Nyb2xsQ29udGFpbmVyLCAkKCcuZWRpdG9yLXByZXZpZXctc2VjdGlvbi5lZGl0b3ItcHJldmlldy1mcm9udG1hdHRlci1zZWN0aW9uJykpO1xuXHRcdHRoaXMuZWRpdG9yUHJldmlld0Zyb250TWF0dGVyQ29udGFpbmVyID0gRE9NLmFwcGVuZChmcm9udE1hdHRlclNlY3Rpb24sICQoJy5lZGl0b3ItcHJldmlldy1mcm9udG1hdHRlci1saXN0JykpO1xuXG5cdFx0Y29uc3QgYm9keVNlY3Rpb24gPSBET00uYXBwZW5kKHRoaXMuZWRpdG9yUHJldmlld1Njcm9sbENvbnRhaW5lciwgJCgnLmVkaXRvci1wcmV2aWV3LXNlY3Rpb24uZWRpdG9yLXByZXZpZXctYm9keS1zZWN0aW9uJykpO1xuXHRcdHRoaXMuZWRpdG9yUHJldmlld0JvZHlDb250YWluZXIgPSBET00uYXBwZW5kKGJvZHlTZWN0aW9uLCAkKCcuZWRpdG9yLXByZXZpZXctYm9keS1jb250ZW50JykpO1xuXG5cdFx0dGhpcy5lbWJlZGRlZEVkaXRvckNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5lZGl0b3JDb250ZW50Q29udGFpbmVyLCAkKCcuZW1iZWRkZWQtZWRpdG9yLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBvdmVyZmxvd1dpZGdldHNEb21Ob2RlID0gRE9NLmFwcGVuZCh0aGlzLmVkaXRvckNvbnRlbnRDb250YWluZXIsICQoJy5lbWJlZGRlZC1lZGl0b3Itb3ZlcmZsb3ctd2lkZ2V0cy5tb25hY28tZWRpdG9yJykpO1xuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBvdmVyZmxvd1dpZGdldHNEb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHR0aGlzLmVtYmVkZGVkRWRpdG9yID0gdGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENvZGVFZGl0b3JXaWRnZXQsXG5cdFx0XHR0aGlzLmVtYmVkZGVkRWRpdG9yQ29udGFpbmVyLFxuXHRcdFx0e1xuXHRcdFx0XHQuLi5nZXRTaW1wbGVFZGl0b3JPcHRpb25zKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpLFxuXHRcdFx0XHRyZWFkT25seTogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXA6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0bGluZU51bWJlcnM6ICdvbicgYXMgY29uc3QsXG5cdFx0XHRcdHdvcmRXcmFwOiAnb24nIGFzIGNvbnN0LFxuXHRcdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdFx0XHRcdGF1dG9tYXRpY0xheW91dDogZmFsc2UsXG5cdFx0XHRcdGZvbGRpbmc6IHRydWUsXG5cdFx0XHRcdHJlbmRlckxpbmVIaWdobGlnaHQ6ICdhbGwnIGFzIGNvbnN0LFxuXHRcdFx0XHRzY3JvbGxiYXI6IHsgdmVydGljYWw6ICdhdXRvJyBhcyBjb25zdCwgaG9yaXpvbnRhbDogJ2F1dG8nIGFzIGNvbnN0IH0sXG5cdFx0XHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsXG5cdFx0XHR9LFxuXHRcdFx0eyBpc1NpbXBsZVdpZGdldDogZmFsc2UgfVxuXHRcdCkpO1xuXG5cdFx0dGhpcy51cGRhdGVFZGl0b3JEaXNwbGF5TW9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzaG93RW1iZWRkZWRFZGl0b3IodXJpOiBVUkksIGRpc3BsYXlOYW1lOiBzdHJpbmcsIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCBzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZSwgaXNXb3Jrc3BhY2VGaWxlID0gZmFsc2UsIGlzUmVhZE9ubHkgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZWRpdG9yUmV0dXJuVmlld01vZGUgPSB0aGlzLnZpZXdNb2RlID09PSAnbWlncmF0aW9uJyA/ICdtaWdyYXRpb24nIDogJ2xpc3QnO1xuXHRcdHRoaXMuY3VycmVudE1vZGVsUmVmPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5jdXJyZW50TW9kZWxSZWYgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5lZGl0b3JNb2RlbENoYW5nZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5lZGl0b3JQcmV2aWV3RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmVkaXRvclByZXZpZXdSZW5kZXJTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0dGhpcy5jdXJyZW50RWRpdGluZ1VyaSA9IHVyaTtcblx0XHR0aGlzLmN1cnJlbnRFZGl0aW5nUHJvamVjdFJvb3QgPSBpc1dvcmtzcGFjZUZpbGUgPyB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0QWN0aXZlUHJvamVjdFJvb3QoKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLmN1cnJlbnRFZGl0aW5nU291cmNlID0gc291cmNlO1xuXHRcdHRoaXMuY3VycmVudEVkaXRpbmdQcm9tcHRUeXBlID0gcHJvbXB0VHlwZTtcblx0XHR0aGlzLmN1cnJlbnRFZGl0aW5nUmVhZE9ubHkgPSBpc1JlYWRPbmx5O1xuXHRcdHRoaXMuZWRpdG9yRGlzcGxheU1vZGUgPSB0aGlzLmlzU3RydWN0dXJlZFByZXZpZXdTdXBwb3J0ZWQocHJvbXB0VHlwZSkgPyAncHJldmlldycgOiAncmF3Jztcblx0XHR0aGlzLnZpZXdNb2RlID0gJ2VkaXRvcic7XG5cblx0XHR0aGlzLmVkaXRvckl0ZW1OYW1lRWxlbWVudC50ZXh0Q29udGVudCA9IGRpc3BsYXlOYW1lO1xuXHRcdHRoaXMuZWRpdG9ySXRlbVBhdGhFbGVtZW50LnRleHRDb250ZW50ID0gYmFzZW5hbWUodXJpKTtcblx0XHR0aGlzLl9lZGl0b3JDb250ZW50Q2hhbmdlZCA9IGZhbHNlO1xuXHRcdHRoaXMucmVzZXRFZGl0b3JTYXZlSW5kaWNhdG9yKCk7XG5cdFx0dGhpcy51cGRhdGVFZGl0b3JBY3Rpb25CdXR0b24oKTtcblx0XHR0aGlzLnVwZGF0ZUVkaXRvckRpc3BsYXlNb2RlKCk7XG5cdFx0dGhpcy51cGRhdGVDb250ZW50VmlzaWJpbGl0eSgpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChzb3VyY2UgPT09IEFJQ3VzdG9taXphdGlvblNvdXJjZXMuYnVpbHRpbiAmJiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUucHJvbXB0IHx8IHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5nZXRPckNyZWF0ZUJ1aWx0aW5FZGl0aW5nU2Vzc2lvbih1cmkpO1xuXG5cdFx0XHRcdGlmICghaXNFcXVhbCh0aGlzLmN1cnJlbnRFZGl0aW5nVXJpLCB1cmkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5lbWJlZGRlZEVkaXRvciEuc2V0TW9kZWwoc2Vzc2lvbi5tb2RlbCk7XG5cdFx0XHRcdHRoaXMuZW1iZWRkZWRFZGl0b3IhLnVwZGF0ZU9wdGlvbnMoeyByZWFkT25seTogZmFsc2UgfSk7XG5cdFx0XHRcdHRoaXMuX2VkaXRvckNvbnRlbnRDaGFuZ2VkID0gc2Vzc2lvbi5tb2RlbC5nZXRWYWx1ZSgpICE9PSBzZXNzaW9uLm9yaWdpbmFsQ29udGVudDtcblx0XHRcdFx0dGhpcy5yZW5kZXJDdXJyZW50RWRpdG9yUHJldmlldygpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUVkaXRvckFjdGlvbkJ1dHRvbigpO1xuXG5cdFx0XHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9PT0gJ3JhdycpIHtcblx0XHRcdFx0XHR0aGlzLmVtYmVkZGVkRWRpdG9yIS5mb2N1cygpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yTW9kZUJ1dHRvbj8uZm9jdXMoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuZWRpdG9yTW9kZWxDaGFuZ2VEaXNwb3NhYmxlcy5hZGQoc2Vzc2lvbi5tb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2VkaXRvckNvbnRlbnRDaGFuZ2VkID0gc2Vzc2lvbi5tb2RlbC5nZXRWYWx1ZSgpICE9PSBzZXNzaW9uLm9yaWdpbmFsQ29udGVudDtcblx0XHRcdFx0XHR0aGlzLnNjaGVkdWxlQ3VycmVudEVkaXRvclByZXZpZXdSZW5kZXIoKTtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUVkaXRvckFjdGlvbkJ1dHRvbigpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHVyaSk7XG5cblx0XHRcdGlmICghaXNFcXVhbCh0aGlzLmN1cnJlbnRFZGl0aW5nVXJpLCB1cmkpKSB7XG5cdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybjsgLy8gYW5vdGhlciBpdGVtIHdhcyBzZWxlY3RlZCB3aGlsZSBsb2FkaW5nXG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY3VycmVudE1vZGVsUmVmID0gcmVmO1xuXHRcdFx0dGhpcy5lbWJlZGRlZEVkaXRvciEuc2V0TW9kZWwocmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwpO1xuXHRcdFx0dGhpcy5lbWJlZGRlZEVkaXRvciEudXBkYXRlT3B0aW9ucyh7IHJlYWRPbmx5OiBpc1JlYWRPbmx5IH0pO1xuXHRcdFx0dGhpcy5yZW5kZXJDdXJyZW50RWRpdG9yUHJldmlldygpO1xuXG5cdFx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuZWRpdG9yRGlzcGxheU1vZGUgPT09ICdyYXcnKSB7XG5cdFx0XHRcdHRoaXMuZW1iZWRkZWRFZGl0b3IhLmZvY3VzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVkaXRvck1vZGVCdXR0b24/LmZvY3VzKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2VkaXRvckNvbnRlbnRDaGFuZ2VkID0gdGhpcy53b3JraW5nQ29weVNlcnZpY2UuaXNEaXJ0eSh1cmkpO1xuXHRcdFx0dGhpcy5lZGl0b3JNb2RlbENoYW5nZURpc3Bvc2FibGVzLmFkZChyZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JDb250ZW50Q2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuc2NoZWR1bGVDdXJyZW50RWRpdG9yUHJldmlld1JlbmRlcigpO1xuXHRcdFx0XHR0aGlzLnJlc2V0RWRpdG9yU2F2ZUluZGljYXRvcigpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5lZGl0b3JNb2RlbENoYW5nZURpc3Bvc2FibGVzLmFkZCh0aGlzLndvcmtpbmdDb3B5U2VydmljZS5vbkRpZFNhdmUoZSA9PiB7XG5cdFx0XHRcdGlmIChpc0VxdWFsKGUud29ya2luZ0NvcHkucmVzb3VyY2UsIHVyaSkpIHtcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3JDb250ZW50Q2hhbmdlZCA9IHRoaXMud29ya2luZ0NvcHlTZXJ2aWNlLmlzRGlydHkodXJpKTtcblx0XHRcdFx0XHR0aGlzLmVkaXRvclNhdmVJbmRpY2F0b3IuY2xhc3NOYW1lID0gJ2VkaXRvci1zYXZlLWluZGljYXRvciB2aXNpYmxlIHNhdmVkJztcblx0XHRcdFx0XHR0aGlzLmVkaXRvclNhdmVJbmRpY2F0b3IuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmNoZWNrKSk7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JTYXZlSW5kaWNhdG9yLnRpdGxlID0gbG9jYWxpemUoJ3NhdmVkJywgXCJTYXZlZFwiKTtcblx0XHRcdFx0XHR0aGlzLmVkaXRvclNhdmVJbmRpY2F0b3Iuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3NhdmVkJywgXCJTYXZlZFwiKSk7XG5cdFx0XHRcdFx0c3RhdHVzKGxvY2FsaXplKCdzYXZlZCcsIFwiU2F2ZWRcIikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIG1vZGVsIGZvciBlbWJlZGRlZCBlZGl0b3I6JywgZXJyb3IpO1xuXHRcdFx0aWYgKGlzRXF1YWwodGhpcy5jdXJyZW50RWRpdGluZ1VyaSwgdXJpKSkge1xuXHRcdFx0XHR0aGlzLmdvQmFja1RvTGlzdCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ29CYWNrVG9MaXN0KCk6IHZvaWQge1xuXHRcdGNvbnN0IHJldHVyblZpZXdNb2RlID0gdGhpcy5lZGl0b3JSZXR1cm5WaWV3TW9kZTtcblx0XHR0aGlzLmVkaXRvclJldHVyblZpZXdNb2RlID0gJ2xpc3QnO1xuXHRcdGNvbnN0IGZpbGVVcmkgPSB0aGlzLmN1cnJlbnRFZGl0aW5nVXJpO1xuXHRcdGNvbnN0IGJhY2tncm91bmRTYXZlUmVxdWVzdCA9IHRoaXMuY3JlYXRlRXhpc3RpbmdDdXN0b21pemF0aW9uU2F2ZVJlcXVlc3QoKTtcblx0XHRpZiAoYmFja2dyb3VuZFNhdmVSZXF1ZXN0KSB7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDdXN0b21pemF0aW9uRWRpdG9yU2F2ZUl0ZW1FdmVudCwgQ3VzdG9taXphdGlvbkVkaXRvclNhdmVJdGVtQ2xhc3NpZmljYXRpb24+KCdjaGF0Q3VzdG9taXphdGlvbkVkaXRvci5zYXZlSXRlbScsIHtcblx0XHRcdFx0cHJvbXB0VHlwZTogdGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGUgPz8gJycsXG5cdFx0XHRcdHN0b3JhZ2U6IFN0cmluZyh0aGlzLmN1cnJlbnRFZGl0aW5nU291cmNlID8/ICcnKSxcblx0XHRcdFx0c2F2ZVRhcmdldDogJ2V4aXN0aW5nJyxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAoZmlsZVVyaSAmJiB0aGlzLmN1cnJlbnRFZGl0aW5nU291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4pIHtcblx0XHRcdHRoaXMuZGlzcG9zZUJ1aWx0aW5FZGl0aW5nU2Vzc2lvbihmaWxlVXJpKTtcblx0XHR9XG5cblx0XHR0aGlzLmN1cnJlbnRNb2RlbFJlZj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuY3VycmVudE1vZGVsUmVmID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY3VycmVudEVkaXRpbmdVcmkgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jdXJyZW50RWRpdGluZ1Byb2plY3RSb290ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY3VycmVudEVkaXRpbmdTb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jdXJyZW50RWRpdGluZ1JlYWRPbmx5ID0gZmFsc2U7XG5cdFx0dGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9ICdwcmV2aWV3Jztcblx0XHR0aGlzLl9lZGl0b3JDb250ZW50Q2hhbmdlZCA9IGZhbHNlO1xuXHRcdHRoaXMuZWRpdG9yTW9kZWxDaGFuZ2VEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZWRpdG9yUHJldmlld1JlbmRlclNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHR0aGlzLmNsZWFyRWRpdG9yUHJldmlldygpO1xuXHRcdHRoaXMucmVzZXRFZGl0b3JTYXZlSW5kaWNhdG9yKCk7XG5cdFx0dGhpcy51cGRhdGVFZGl0b3JBY3Rpb25CdXR0b24oKTtcblx0XHR0aGlzLnVwZGF0ZUVkaXRvckRpc3BsYXlNb2RlKCk7XG5cdFx0dGhpcy5lbWJlZGRlZEVkaXRvcj8uc2V0TW9kZWwobnVsbCk7XG5cdFx0dGhpcy52aWV3TW9kZSA9IHJldHVyblZpZXdNb2RlO1xuXHRcdHRoaXMudXBkYXRlQ29udGVudFZpc2liaWxpdHkoKTtcblxuXHRcdGlmIChyZXR1cm5WaWV3TW9kZSA9PT0gJ21pZ3JhdGlvbicpIHtcblx0XHRcdHRoaXMucmVuZGVyUHJvbXB0TWlncmF0aW9uUGFnZSgpO1xuXHRcdFx0dm9pZCB0aGlzLnJlZnJlc2hQcm9tcHRNaWdyYXRpb25JbmZvKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFJlZnJlc2ggdGhlIGxpc3QgdG8gcGljayB1cCBuZXdseSBjcmVhdGVkL2VkaXRlZCBmaWxlc1xuXHRcdFx0dm9pZCB0aGlzLmxpc3RXaWRnZXQ/LnJlZnJlc2goKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHR9XG5cdFx0aWYgKHJldHVyblZpZXdNb2RlID09PSAnbWlncmF0aW9uJykge1xuXHRcdFx0dGhpcy5taWdyYXRpb25TZWFyY2hJbnB1dD8uZm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5saXN0V2lkZ2V0Py5mb2N1c1NlYXJjaCgpO1xuXHRcdH1cblxuXHRcdGlmIChiYWNrZ3JvdW5kU2F2ZVJlcXVlc3QpIHtcblx0XHRcdGNvbnN0IHNhdmVSZXF1ZXN0ID0gYmFja2dyb3VuZFNhdmVSZXF1ZXN0O1xuXHRcdFx0dm9pZCB0aGlzLnNhdmVFeGlzdGluZ0N1c3RvbWl6YXRpb24oc2F2ZVJlcXVlc3QpLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcignRmFpbGVkIHRvIHNhdmUgY3VzdG9taXphdGlvbiBjaGFuZ2VzIG9uIGV4aXQ6JywgZXJyb3IpO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnc2F2ZUN1c3RvbWl6YXRpb25PbkV4aXRGYWlsZWQnLCBcIkNvdWxkIG5vdCBzYXZlIGNoYW5nZXMgdG8gezB9LlwiLCBiYXNlbmFtZShzYXZlUmVxdWVzdC5maWxlVXJpKSkpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSBhc3luYyBnZXRPckNyZWF0ZUJ1aWx0aW5FZGl0aW5nU2Vzc2lvbih1cmk6IFVSSSk6IFByb21pc2U8eyBtb2RlbDogSVRleHRNb2RlbDsgb3JpZ2luYWxDb250ZW50OiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IGtleSA9IHVyaS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5idWlsdGluRWRpdGluZ1Nlc3Npb25zLmdldChrZXkpO1xuXHRcdGlmIChleGlzdGluZyAmJiAhZXhpc3RpbmcubW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHVyaSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB7XG5cdFx0XHRcdG1vZGVsOiB0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbChcblx0XHRcdFx0XHRjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeUZyb21TbmFwc2hvdChyZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5jcmVhdGVTbmFwc2hvdCgpKSxcblx0XHRcdFx0XHR7IGxhbmd1YWdlSWQ6IHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLmdldExhbmd1YWdlSWQoKSwgb25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUgfSxcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogJ2FpLWN1c3RvbWl6YXRpb24tYnVpbHRpbicsIHBhdGg6IHVyaS5wYXRoLCBxdWVyeTogZ2VuZXJhdGVVdWlkKCkgfSksXG5cdFx0XHRcdFx0ZmFsc2Vcblx0XHRcdFx0KSxcblx0XHRcdFx0b3JpZ2luYWxDb250ZW50OiByZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5nZXRWYWx1ZSgpLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuYnVpbHRpbkVkaXRpbmdTZXNzaW9ucy5zZXQoa2V5LCBzZXNzaW9uKTtcblx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQnVpbHRpblByb21wdFNhdmVSZXF1ZXN0KHRhcmdldDogSVNhdmVUYXJnZXRRdWlja1BpY2tJdGVtKTogSUJ1aWx0aW5Qcm9tcHRTYXZlUmVxdWVzdCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc291cmNlVXJpID0gdGhpcy5jdXJyZW50RWRpdGluZ1VyaTtcblx0XHRjb25zdCBwcm9tcHRUeXBlID0gdGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGU7XG5cdFx0aWYgKCFzb3VyY2VVcmkgfHwgdGhpcy5jdXJyZW50RWRpdGluZ1NvdXJjZSAhPT0gQUlDdXN0b21pemF0aW9uU291cmNlcy5idWlsdGluIHx8IChwcm9tcHRUeXBlICE9PSBQcm9tcHRzVHlwZS5wcm9tcHQgJiYgcHJvbXB0VHlwZSAhPT0gUHJvbXB0c1R5cGUuc2tpbGwpIHx8ICF0YXJnZXQuZm9sZGVyIHx8IHRhcmdldC50YXJnZXQgPT09ICdjYW5jZWwnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuYnVpbHRpbkVkaXRpbmdTZXNzaW9ucy5nZXQoc291cmNlVXJpLnRvU3RyaW5nKCkpO1xuXHRcdGlmICghc2Vzc2lvbiB8fCAhdGhpcy5fZWRpdG9yQ29udGVudENoYW5nZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dGFyZ2V0OiB0YXJnZXQudGFyZ2V0LFxuXHRcdFx0Zm9sZGVyOiB0YXJnZXQuZm9sZGVyLFxuXHRcdFx0c291cmNlVXJpLFxuXHRcdFx0Y29udGVudDogc2Vzc2lvbi5tb2RlbC5nZXRWYWx1ZSgpLFxuXHRcdFx0cHJvbXB0VHlwZSxcblx0XHRcdHByb2plY3RSb290OiB0YXJnZXQudGFyZ2V0ID09PSAnd29ya3NwYWNlJyA/IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRBY3RpdmVQcm9qZWN0Um9vdCgpIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUV4aXN0aW5nQ3VzdG9taXphdGlvblNhdmVSZXF1ZXN0KCk6IElFeGlzdGluZ0N1c3RvbWl6YXRpb25TYXZlUmVxdWVzdCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3JDb250ZW50Q2hhbmdlZCB8fCB0aGlzLmN1cnJlbnRFZGl0aW5nU291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4gfHwgIXRoaXMuY3VycmVudEVkaXRpbmdVcmkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmN1cnJlbnRNb2RlbFJlZj8ub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRmaWxlVXJpOiB0aGlzLmN1cnJlbnRFZGl0aW5nVXJpLFxuXHRcdFx0Y29udGVudDogbW9kZWwuZ2V0VmFsdWUoKSxcblx0XHRcdHByb2plY3RSb290OiB0aGlzLmN1cnJlbnRFZGl0aW5nUHJvamVjdFJvb3QsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2F2ZUJ1aWx0aW5Qcm9tcHRDb3B5KHJlcXVlc3Q6IElCdWlsdGluUHJvbXB0U2F2ZVJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgdGFyZ2V0VXJpOiBVUkk7XG5cdFx0aWYgKHJlcXVlc3QucHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpIHtcblx0XHRcdC8vIFNraWxscyB1c2Uge3NraWxsTmFtZX0vU0tJTEwubWQgZGlyZWN0b3J5IHN0cnVjdHVyZVxuXHRcdFx0Y29uc3Qgc2tpbGxGb2xkZXJOYW1lID0gYmFzZW5hbWUoZGlybmFtZShyZXF1ZXN0LnNvdXJjZVVyaSkpO1xuXHRcdFx0dGFyZ2V0VXJpID0gVVJJLmpvaW5QYXRoKHJlcXVlc3QuZm9sZGVyLCBza2lsbEZvbGRlck5hbWUsIGJhc2VuYW1lKHJlcXVlc3Quc291cmNlVXJpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRhcmdldFVyaSA9IFVSSS5qb2luUGF0aChyZXF1ZXN0LmZvbGRlciwgYmFzZW5hbWUocmVxdWVzdC5zb3VyY2VVcmkpKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5jcmVhdGVGb2xkZXIoZGlybmFtZSh0YXJnZXRVcmkpKTtcblx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0YXJnZXRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcocmVxdWVzdC5jb250ZW50KSk7XG5cdFx0aWYgKHJlcXVlc3QudGFyZ2V0ID09PSAnd29ya3NwYWNlJyAmJiByZXF1ZXN0LnByb2plY3RSb290KSB7XG5cdFx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVNlcnZpY2UuY29tbWl0RmlsZXMocmVxdWVzdC5wcm9qZWN0Um9vdCwgW3RhcmdldFVyaV0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2F2ZUV4aXN0aW5nQ3VzdG9taXphdGlvbihyZXF1ZXN0OiBJRXhpc3RpbmdDdXN0b21pemF0aW9uU2F2ZVJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXF1ZXN0LmZpbGVVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcocmVxdWVzdC5jb250ZW50KSk7XG5cdFx0aWYgKHJlcXVlc3QucHJvamVjdFJvb3QpIHtcblx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlU2VydmljZS5jb21taXRGaWxlcyhyZXF1ZXN0LnByb2plY3RSb290LCBbcmVxdWVzdC5maWxlVXJpXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwaWNrQnVpbHRpblByb21wdFNhdmVUYXJnZXQoKTogUHJvbWlzZTxJU2F2ZVRhcmdldFF1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBpdGVtczogSVNhdmVUYXJnZXRRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRjb25zdCBwcm9tcHRUeXBlID0gdGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGUgPz8gUHJvbXB0c1R5cGUucHJvbXB0O1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gcmVzb2x2ZVdvcmtzcGFjZVRhcmdldERpcmVjdG9yeSh0aGlzLndvcmtzcGFjZVNlcnZpY2UsIHByb21wdFR5cGUpO1xuXHRcdGlmICh3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3dvcmtzcGFjZVNhdmVUYXJnZXQnLCBcIldvcmtzcGFjZVwiKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHdvcmtzcGFjZUZvbGRlciwgeyByZWxhdGl2ZTogdHJ1ZSB9KSxcblx0XHRcdFx0dGFyZ2V0OiAnd29ya3NwYWNlJyxcblx0XHRcdFx0Zm9sZGVyOiB3b3Jrc3BhY2VGb2xkZXIsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCB1c2VyRm9sZGVyID0gYXdhaXQgcmVzb2x2ZVVzZXJUYXJnZXREaXJlY3RvcnkodGhpcy5wcm9tcHRzU2VydmljZSwgcHJvbXB0VHlwZSk7XG5cdFx0aWYgKHVzZXJGb2xkZXIpIHtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3VzZXJTYXZlVGFyZ2V0JywgXCJVc2VyXCIpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwodXNlckZvbGRlciwgeyByZWxhdGl2ZTogdHJ1ZSB9KSxcblx0XHRcdFx0dGFyZ2V0OiAndXNlcicsXG5cdFx0XHRcdGZvbGRlcjogdXNlckZvbGRlcixcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjYW5jZWxTYXZlVGFyZ2V0JywgXCJDYW5jZWxcIiksXG5cdFx0XHR0YXJnZXQ6ICdjYW5jZWwnLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayhpdGVtcywge1xuXHRcdFx0Y2FuUGlja01hbnk6IGZhbHNlLFxuXHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdzYXZlQnVpbHRpbkNvcHlQbGFjZWhvbGRlcicsIFwiU2VsZWN0IFdvcmtzcGFjZSwgVXNlciwgb3IgQ2FuY2VsXCIpLFxuXHRcdFx0bWF0Y2hPbkRlc2NyaXB0aW9uOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVFZGl0b3JBY3Rpb25CdXR0b24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuZWRpdG9yQWN0aW9uQnV0dG9uSW5Qcm9ncmVzcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWRpdG9yQWN0aW9uQnV0dG9uSW5Qcm9ncmVzcyA9IHRydWU7XG5cdFx0dGhpcy51cGRhdGVFZGl0b3JBY3Rpb25CdXR0b24oKTtcblxuXHRcdGxldCBiYWNrZ3JvdW5kU2F2ZVJlcXVlc3Q6IElCdWlsdGluUHJvbXB0U2F2ZVJlcXVlc3QgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0aGlzLnNob3VsZFNob3dCdWlsdGluU2F2ZUFjdGlvbigpKSB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGF3YWl0IHRoaXMucGlja0J1aWx0aW5Qcm9tcHRTYXZlVGFyZ2V0KCk7XG5cdFx0XHRcdGlmICghc2VsZWN0aW9uIHx8IHNlbGVjdGlvbi50YXJnZXQgPT09ICdjYW5jZWwnKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YmFja2dyb3VuZFNhdmVSZXF1ZXN0ID0gdGhpcy5jcmVhdGVCdWlsdGluUHJvbXB0U2F2ZVJlcXVlc3Qoc2VsZWN0aW9uKTtcblx0XHRcdFx0aWYgKGJhY2tncm91bmRTYXZlUmVxdWVzdCkge1xuXHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEN1c3RvbWl6YXRpb25FZGl0b3JTYXZlSXRlbUV2ZW50LCBDdXN0b21pemF0aW9uRWRpdG9yU2F2ZUl0ZW1DbGFzc2lmaWNhdGlvbj4oJ2NoYXRDdXN0b21pemF0aW9uRWRpdG9yLnNhdmVJdGVtJywge1xuXHRcdFx0XHRcdFx0cHJvbXB0VHlwZTogdGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGUgPz8gJycsXG5cdFx0XHRcdFx0XHRzdG9yYWdlOiBTdHJpbmcodGhpcy5jdXJyZW50RWRpdGluZ1NvdXJjZSA/PyAnJyksXG5cdFx0XHRcdFx0XHRzYXZlVGFyZ2V0OiBzZWxlY3Rpb24udGFyZ2V0LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZ29CYWNrVG9MaXN0KCk7XG5cdFx0XHRpZiAoYmFja2dyb3VuZFNhdmVSZXF1ZXN0KSB7XG5cdFx0XHRcdGNvbnN0IHNhdmVSZXF1ZXN0ID0gYmFja2dyb3VuZFNhdmVSZXF1ZXN0O1xuXHRcdFx0XHR2b2lkIHRoaXMuc2F2ZUJ1aWx0aW5Qcm9tcHRDb3B5KHNhdmVSZXF1ZXN0KS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHR2b2lkIHRoaXMubGlzdFdpZGdldD8ucmVmcmVzaCgpO1xuXHRcdFx0XHR9LCBlcnJvciA9PiB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcignRmFpbGVkIHRvIHNhdmUgYnVpbHQtaW4gb3ZlcnJpZGU6JywgZXJyb3IpO1xuXHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS53YXJuKHNhdmVSZXF1ZXN0LnRhcmdldCA9PT0gJ3dvcmtzcGFjZSdcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3NhdmVCdWlsdGluQ29weUZhaWxlZFdvcmtzcGFjZScsIFwiQ291bGQgbm90IHNhdmUgdGhlIG92ZXJyaWRlIHRvIHRoZSB3b3Jrc3BhY2UuXCIpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdzYXZlQnVpbHRpbkNvcHlGYWlsZWRVc2VyJywgXCJDb3VsZCBub3Qgc2F2ZSB0aGUgb3ZlcnJpZGUgdG8geW91ciB1c2VyIGZvbGRlci5cIikpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5lZGl0b3JBY3Rpb25CdXR0b25JblByb2dyZXNzID0gZmFsc2U7XG5cdFx0XHR0aGlzLnVwZGF0ZUVkaXRvckFjdGlvbkJ1dHRvbigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRWRpdG9yQWN0aW9uQnV0dG9uKCk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlSW5wdXREaXJ0eVN0YXRlKCk7XG5cblx0XHRpZiAoIXRoaXMuZWRpdG9yQWN0aW9uQnV0dG9uIHx8ICF0aGlzLmVkaXRvckFjdGlvbkJ1dHRvbkljb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzaG91bGRTaG93QnVpbHRpblNhdmVBY3Rpb24gPSB0aGlzLnNob3VsZFNob3dCdWlsdGluU2F2ZUFjdGlvbigpO1xuXHRcdHRoaXMuZWRpdG9yQWN0aW9uQnV0dG9uSWNvbi5jbGFzc05hbWUgPSBgY29kaWNvbiBjb2RpY29uLSR7c2hvdWxkU2hvd0J1aWx0aW5TYXZlQWN0aW9uID8gQ29kaWNvbi5zYXZlLmlkIDogQ29kaWNvbi5hcnJvd0xlZnQuaWR9IGVkaXRvci1hY3Rpb24tYnV0dG9uLWljb25gO1xuXHRcdHRoaXMuZWRpdG9yQWN0aW9uQnV0dG9uLmRpc2FibGVkID0gdGhpcy5lZGl0b3JBY3Rpb25CdXR0b25JblByb2dyZXNzO1xuXHRcdHRoaXMuZWRpdG9yQWN0aW9uQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHNob3VsZFNob3dCdWlsdGluU2F2ZUFjdGlvblxuXHRcdFx0PyBsb2NhbGl6ZSgnc2F2ZUJ1aWx0aW5Db3B5QW5kQ2hvb3NlTG9jYXRpb24nLCBcIlNhdmUgb3ZlcnJpZGVcIilcblx0XHRcdDogdGhpcy5lZGl0b3JSZXR1cm5WaWV3TW9kZSA9PT0gJ21pZ3JhdGlvbidcblx0XHRcdFx0PyBsb2NhbGl6ZSgnYmFja1RvUHJvbXB0TWlncmF0aW9uJywgXCJCYWNrIHRvIE1pZ3JhdGUgUHJvbXB0IEZpbGVzXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2JhY2tUb0xpc3QnLCBcIkJhY2sgdG8gbGlzdFwiKSk7XG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25CdXR0b24udGl0bGUgPSBzaG91bGRTaG93QnVpbHRpblNhdmVBY3Rpb25cblx0XHRcdD8gbG9jYWxpemUoJ3NhdmVCdWlsdGluQ29weUFuZENob29zZUxvY2F0aW9uVG9vbHRpcCcsIFwiU2F2ZSBvdmVycmlkZSAoY2hvb3NlIFdvcmtzcGFjZSwgVXNlciwgb3IgQ2FuY2VsKVwiKVxuXHRcdFx0OiB0aGlzLmVkaXRvclJldHVyblZpZXdNb2RlID09PSAnbWlncmF0aW9uJ1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdiYWNrVG9Qcm9tcHRNaWdyYXRpb25Ub29sdGlwJywgXCJCYWNrIHRvIE1pZ3JhdGUgUHJvbXB0IEZpbGVzXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2JhY2tUb0xpc3QnLCBcIkJhY2sgdG8gbGlzdFwiKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkU2hvd0J1aWx0aW5TYXZlQWN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3JDb250ZW50Q2hhbmdlZFxuXHRcdFx0JiYgdGhpcy5jdXJyZW50RWRpdGluZ1NvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy5idWlsdGluXG5cdFx0XHQmJiAodGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCB8fCB0aGlzLmN1cnJlbnRFZGl0aW5nUHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJbnB1dERpcnR5U3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5wdXQgPSB0aGlzLmlucHV0O1xuXHRcdGlmIChpbnB1dCBpbnN0YW5jZW9mIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dCkge1xuXHRcdFx0aW5wdXQuc2V0RGlydHkodGhpcy5zaG91bGRTaG93QnVpbHRpblNhdmVBY3Rpb24oKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVCdWlsdGluU2F2ZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIXRoaXMuc2hvdWxkU2hvd0J1aWx0aW5TYXZlQWN0aW9uKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCB0aGlzLnBpY2tCdWlsdGluUHJvbXB0U2F2ZVRhcmdldCgpO1xuXHRcdGlmICghdGFyZ2V0IHx8IHRhcmdldC50YXJnZXQgPT09ICdjYW5jZWwnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2F2ZVJlcXVlc3QgPSB0aGlzLmNyZWF0ZUJ1aWx0aW5Qcm9tcHRTYXZlUmVxdWVzdCh0YXJnZXQpO1xuXHRcdGlmICghc2F2ZVJlcXVlc3QpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5zYXZlQnVpbHRpblByb21wdENvcHkoc2F2ZVJlcXVlc3QpO1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q3VzdG9taXphdGlvbkVkaXRvclNhdmVJdGVtRXZlbnQsIEN1c3RvbWl6YXRpb25FZGl0b3JTYXZlSXRlbUNsYXNzaWZpY2F0aW9uPignY2hhdEN1c3RvbWl6YXRpb25FZGl0b3Iuc2F2ZUl0ZW0nLCB7XG5cdFx0XHRcdHByb21wdFR5cGU6IHRoaXMuY3VycmVudEVkaXRpbmdQcm9tcHRUeXBlID8/ICcnLFxuXHRcdFx0XHRzdG9yYWdlOiBTdHJpbmcodGhpcy5jdXJyZW50RWRpdGluZ1NvdXJjZSA/PyAnJyksXG5cdFx0XHRcdHNhdmVUYXJnZXQ6IHRhcmdldC50YXJnZXQsXG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5fZWRpdG9yQ29udGVudENoYW5nZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMudXBkYXRlRWRpdG9yQWN0aW9uQnV0dG9uKCk7XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gc2F2ZSBidWlsdC1pbiBvdmVycmlkZTonLCBlcnJvcik7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybih0YXJnZXQudGFyZ2V0ID09PSAnd29ya3NwYWNlJ1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdzYXZlQnVpbHRpbkNvcHlGYWlsZWRXb3Jrc3BhY2UnLCBcIkNvdWxkIG5vdCBzYXZlIHRoZSBvdmVycmlkZSB0byB0aGUgd29ya3NwYWNlLlwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdzYXZlQnVpbHRpbkNvcHlGYWlsZWRVc2VyJywgXCJDb3VsZCBub3Qgc2F2ZSB0aGUgb3ZlcnJpZGUgdG8geW91ciB1c2VyIGZvbGRlci5cIikpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVzZXRFZGl0b3JTYXZlSW5kaWNhdG9yKCk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yU2F2ZUluZGljYXRvci5jbGFzc05hbWUgPSAnZWRpdG9yLXNhdmUtaW5kaWNhdG9yJztcblx0XHR0aGlzLmVkaXRvclNhdmVJbmRpY2F0b3IudGl0bGUgPSAnJztcblx0XHR0aGlzLmVkaXRvclNhdmVJbmRpY2F0b3IucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG5cdH1cblxuXHRwcml2YXRlIGlzU3RydWN0dXJlZFByZXZpZXdTdXBwb3J0ZWQocHJvbXB0VHlwZTogUHJvbXB0c1R5cGUgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q3VzdG9taXphdGlvbnNTdHJ1Y3R1cmVkUHJldmlld0VuYWJsZWQpICE9PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudFxuXHRcdFx0fHwgcHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGxcblx0XHRcdHx8IHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9uc1xuXHRcdFx0fHwgcHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUucHJvbXB0O1xuXHR9XG5cblx0cHJpdmF0ZSBvblN0cnVjdHVyZWRQcmV2aWV3U2V0dGluZ0NoYW5nZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmlld01vZGUgIT09ICdlZGl0b3InKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN1cHBvcnRzU3RydWN0dXJlZFByZXZpZXcgPSB0aGlzLmlzU3RydWN0dXJlZFByZXZpZXdTdXBwb3J0ZWQodGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGUpO1xuXHRcdGlmICghc3VwcG9ydHNTdHJ1Y3R1cmVkUHJldmlldykge1xuXHRcdFx0dGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9ICdyYXcnO1xuXHRcdFx0dGhpcy5lZGl0b3JQcmV2aWV3UmVuZGVyU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5jbGVhckVkaXRvclByZXZpZXcoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuZWRpdG9yRGlzcGxheU1vZGUgPT09ICdwcmV2aWV3Jykge1xuXHRcdFx0dGhpcy5lZGl0b3JQcmV2aWV3UmVuZGVyU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlRWRpdG9yRGlzcGxheU1vZGUoKTtcblx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEN1cnJlbnRFZGl0aW5nTW9kZWwoKTogSVRleHRNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRFZGl0aW5nVXJpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmN1cnJlbnRFZGl0aW5nU291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4pIHtcblx0XHRcdHJldHVybiB0aGlzLmJ1aWx0aW5FZGl0aW5nU2Vzc2lvbnMuZ2V0KHRoaXMuY3VycmVudEVkaXRpbmdVcmkudG9TdHJpbmcoKSk/Lm1vZGVsO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmN1cnJlbnRNb2RlbFJlZj8ub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlRWRpdG9yRGlzcGxheU1vZGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzU3RydWN0dXJlZFByZXZpZXdTdXBwb3J0ZWQodGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9IHRoaXMuZWRpdG9yRGlzcGxheU1vZGUgPT09ICdwcmV2aWV3JyA/ICdyYXcnIDogJ3ByZXZpZXcnO1xuXHRcdGlmICh0aGlzLmVkaXRvckRpc3BsYXlNb2RlID09PSAncHJldmlldycpIHtcblx0XHRcdHRoaXMuZWRpdG9yUHJldmlld1JlbmRlclNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdHRoaXMucmVuZGVyQ3VycmVudEVkaXRvclByZXZpZXcoKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUVkaXRvckRpc3BsYXlNb2RlKCk7XG5cdFx0aWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbik7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZWRpdG9yRGlzcGxheU1vZGUgPT09ICdyYXcnKSB7XG5cdFx0XHR0aGlzLmVtYmVkZGVkRWRpdG9yPy5mb2N1cygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVkaXRvck1vZGVCdXR0b24/LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFZGl0b3JEaXNwbGF5TW9kZSgpOiB2b2lkIHtcblx0XHRjb25zdCBzdXBwb3J0c1N0cnVjdHVyZWRQcmV2aWV3ID0gdGhpcy5pc1N0cnVjdHVyZWRQcmV2aWV3U3VwcG9ydGVkKHRoaXMuY3VycmVudEVkaXRpbmdQcm9tcHRUeXBlKTtcblx0XHRjb25zdCBzaG93UHJldmlldyA9IHN1cHBvcnRzU3RydWN0dXJlZFByZXZpZXcgJiYgdGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9PT0gJ3ByZXZpZXcnO1xuXG5cdFx0aWYgKHRoaXMuZWRpdG9yTW9kZUJ1dHRvbikge1xuXHRcdFx0dGhpcy5lZGl0b3JNb2RlQnV0dG9uLnN0eWxlLmRpc3BsYXkgPSBzdXBwb3J0c1N0cnVjdHVyZWRQcmV2aWV3ID8gJycgOiAnbm9uZSc7XG5cdFx0XHR0aGlzLmVkaXRvck1vZGVCdXR0b24udGV4dENvbnRlbnQgPSB0aGlzLmdldEVkaXRvck1vZGVCdXR0b25MYWJlbCgpO1xuXHRcdFx0dGhpcy5lZGl0b3JNb2RlQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuZ2V0RWRpdG9yTW9kZUJ1dHRvblRvb2x0aXAoKSk7XG5cdFx0XHR0aGlzLmVkaXRvck1vZGVCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCBTdHJpbmcodGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9PT0gJ3JhdycpKTtcblx0XHRcdHRoaXMuZWRpdG9yTW9kZUJ1dHRvbi50aXRsZSA9IHRoaXMuZ2V0RWRpdG9yTW9kZUJ1dHRvblRvb2x0aXAoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5lZGl0b3JQcmV2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmVkaXRvclByZXZpZXdDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IHNob3dQcmV2aWV3ID8gJycgOiAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZW1iZWRkZWRFZGl0b3JDb250YWluZXIpIHtcblx0XHRcdHRoaXMuZW1iZWRkZWRFZGl0b3JDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IHNob3dQcmV2aWV3ID8gJ25vbmUnIDogJyc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRFZGl0b3JNb2RlQnV0dG9uTGFiZWwoKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuaXNTdHJ1Y3R1cmVkUHJldmlld1N1cHBvcnRlZCh0aGlzLmN1cnJlbnRFZGl0aW5nUHJvbXB0VHlwZSkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRpZiAodGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9PT0gJ3JhdycpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnZWRpdG9yUHJldmlld0J1dHRvbkxhYmVsJywgXCJQcmV2aWV3XCIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNhbkVkaXRDdXJyZW50UmF3KClcblx0XHRcdD8gbG9jYWxpemUoJ2VkaXRvckVkaXRSYXdCdXR0b25MYWJlbCcsIFwiRWRpdFwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnZWRpdG9yVmlld1Jhd0J1dHRvbkxhYmVsJywgXCJWaWV3IFJhd1wiKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RWRpdG9yTW9kZUJ1dHRvblRvb2x0aXAoKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuaXNTdHJ1Y3R1cmVkUHJldmlld1N1cHBvcnRlZCh0aGlzLmN1cnJlbnRFZGl0aW5nUHJvbXB0VHlwZSkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRpZiAodGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9PT0gJ3JhdycpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnZWRpdG9yUHJldmlld0J1dHRvblRvb2x0aXAnLCBcIlNob3cgc3RydWN0dXJlZCBwcmV2aWV3XCIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNhbkVkaXRDdXJyZW50UmF3KClcblx0XHRcdD8gbG9jYWxpemUoJ2VkaXRvckVkaXRSYXdCdXR0b25Ub29sdGlwJywgXCJFZGl0IHRoZSByYXcgbWFya2Rvd24gZmlsZVwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnZWRpdG9yVmlld1Jhd0J1dHRvblRvb2x0aXAnLCBcIlNob3cgdGhlIHJhdyBtYXJrZG93biBmaWxlXCIpO1xuXHR9XG5cblx0cHJpdmF0ZSBjYW5FZGl0Q3VycmVudFJhdygpOiBib29sZWFuIHtcblx0XHRjb25zdCBwcm9tcHRUeXBlID0gdGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGU7XG5cdFx0aWYgKCFwcm9tcHRUeXBlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICh0aGlzLmN1cnJlbnRFZGl0aW5nU291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4gJiYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCB8fCBwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCkpXG5cdFx0XHR8fCAhdGhpcy5jdXJyZW50RWRpdGluZ1JlYWRPbmx5O1xuXHR9XG5cblx0cHJpdmF0ZSBzY2hlZHVsZUN1cnJlbnRFZGl0b3JQcmV2aWV3UmVuZGVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmVkaXRvckRpc3BsYXlNb2RlICE9PSAncHJldmlldycpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVkaXRvclByZXZpZXdSZW5kZXJTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ3VycmVudEVkaXRvclByZXZpZXcoKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmdldEN1cnJlbnRFZGl0aW5nTW9kZWwoKTtcblx0XHRjb25zdCBwcm9tcHRUeXBlID0gdGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGU7XG5cdFx0aWYgKCFtb2RlbCB8fCAhcHJvbXB0VHlwZSB8fCB0aGlzLmVkaXRvckRpc3BsYXlNb2RlICE9PSAncHJldmlldycgfHwgIXRoaXMuaXNTdHJ1Y3R1cmVkUHJldmlld1N1cHBvcnRlZChwcm9tcHRUeXBlKSkge1xuXHRcdFx0dGhpcy5jbGVhckVkaXRvclByZXZpZXcoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJzZWRQcm9tcHRGaWxlID0gdGhpcy5wcm9tcHRzU2VydmljZS5nZXRQYXJzZWRQcm9tcHRGaWxlKG1vZGVsKTtcblx0XHR0aGlzLnJlbmRlckVkaXRvclByZXZpZXcocGFyc2VkUHJvbXB0RmlsZSwgcHJvbXB0VHlwZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckVkaXRvclByZXZpZXcocGFyc2VkUHJvbXB0RmlsZTogUGFyc2VkUHJvbXB0RmlsZSwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWRpdG9yUHJldmlld0lzc3Vlc0NvbnRhaW5lciB8fCAhdGhpcy5lZGl0b3JQcmV2aWV3RnJvbnRNYXR0ZXJDb250YWluZXIgfHwgIXRoaXMuZWRpdG9yUHJldmlld0JvZHlDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVkaXRvclByZXZpZXdEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdERPTS5jbGVhck5vZGUodGhpcy5lZGl0b3JQcmV2aWV3SXNzdWVzQ29udGFpbmVyKTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuZWRpdG9yUHJldmlld0Zyb250TWF0dGVyQ29udGFpbmVyKTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuZWRpdG9yUHJldmlld0JvZHlDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gZ2V0VGFyZ2V0KHByb21wdFR5cGUsIHBhcnNlZFByb21wdEZpbGUuaGVhZGVyID8/IHBhcnNlZFByb21wdEZpbGUudXJpKTtcblx0XHR0aGlzLnJlbmRlclByZXZpZXdJc3N1ZXMocGFyc2VkUHJvbXB0RmlsZSk7XG5cdFx0dGhpcy5yZW5kZXJQcmV2aWV3RnJvbnRNYXR0ZXIocGFyc2VkUHJvbXB0RmlsZSwgcHJvbXB0VHlwZSwgdGFyZ2V0KTtcblx0XHR0aGlzLnJlbmRlclByZXZpZXdCb2R5KHBhcnNlZFByb21wdEZpbGUpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJQcmV2aWV3SXNzdWVzKHBhcnNlZFByb21wdEZpbGU6IFBhcnNlZFByb21wdEZpbGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWRpdG9yUHJldmlld0lzc3Vlc0NvbnRhaW5lciB8fCAhcGFyc2VkUHJvbXB0RmlsZS5oZWFkZXI/LmVycm9ycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc3N1ZXNDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuZWRpdG9yUHJldmlld0lzc3Vlc0NvbnRhaW5lciwgJCgnLmVkaXRvci1wcmV2aWV3LWlzc3Vlcy1ib3gnKSk7XG5cdFx0RE9NLmFwcGVuZChpc3N1ZXNDb250YWluZXIsICQoJ2Rpdi5lZGl0b3ItcHJldmlldy1pc3N1ZXMtdGl0bGUnKSkudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncHJldmlld0hlYWRlcklzc3Vlc1RpdGxlJywgXCJIZWFkZXIgaXNzdWVzIGRldGVjdGVkXCIpO1xuXHRcdERPTS5hcHBlbmQoaXNzdWVzQ29udGFpbmVyLCAkKCdkaXYuZWRpdG9yLXByZXZpZXctaXNzdWVzLWRlc2NyaXB0aW9uJykpLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3ByZXZpZXdIZWFkZXJJc3N1ZXNEZXNjcmlwdGlvbicsIFwiU3dpdGNoIHRvIHJhdyB2aWV3IHRvIGZpeCBpbnZhbGlkIG9yIHVuc3VwcG9ydGVkIG1ldGFkYXRhIGVudHJpZXMuXCIpO1xuXHRcdGNvbnN0IGxpc3QgPSBET00uYXBwZW5kKGlzc3Vlc0NvbnRhaW5lciwgJCgndWwuZWRpdG9yLXByZXZpZXctaXNzdWVzLWxpc3QnKSk7XG5cdFx0Zm9yIChjb25zdCBlcnJvciBvZiBwYXJzZWRQcm9tcHRGaWxlLmhlYWRlci5lcnJvcnMpIHtcblx0XHRcdERPTS5hcHBlbmQobGlzdCwgJCgnbGkuZWRpdG9yLXByZXZpZXctaXNzdWVzLWl0ZW0nKSkudGV4dENvbnRlbnQgPSBlcnJvci5tZXNzYWdlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUHJldmlld0Zyb250TWF0dGVyKHBhcnNlZFByb21wdEZpbGU6IFBhcnNlZFByb21wdEZpbGUsIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCB0YXJnZXQ6IFRhcmdldCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lZGl0b3JQcmV2aWV3RnJvbnRNYXR0ZXJDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhdHRyaWJ1dGVzID0gcGFyc2VkUHJvbXB0RmlsZS5oZWFkZXI/LmF0dHJpYnV0ZXMgPz8gW107XG5cdFx0aWYgKCFhdHRyaWJ1dGVzLmxlbmd0aCkge1xuXHRcdFx0RE9NLmFwcGVuZCh0aGlzLmVkaXRvclByZXZpZXdGcm9udE1hdHRlckNvbnRhaW5lciwgJCgnZGl2LmVkaXRvci1wcmV2aWV3LWVtcHR5LXN0YXRlJykpLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3ByZXZpZXdOb0Zyb250TWF0dGVyJywgXCJObyBtZXRhZGF0YSBmb3VuZCBpbiB0aGlzIGZpbGUuXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgYXR0cmlidXRlIG9mIGF0dHJpYnV0ZXMpIHtcblx0XHRcdHRoaXMucmVuZGVyUHJldmlld0F0dHJpYnV0ZShhdHRyaWJ1dGUsIHByb21wdFR5cGUsIHRhcmdldCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJQcmV2aWV3QXR0cmlidXRlKGF0dHJpYnV0ZTogSUhlYWRlckF0dHJpYnV0ZSwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsIHRhcmdldDogVGFyZ2V0KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvclByZXZpZXdGcm9udE1hdHRlckNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJvdyA9IERPTS5hcHBlbmQodGhpcy5lZGl0b3JQcmV2aWV3RnJvbnRNYXR0ZXJDb250YWluZXIsICQoJy5lZGl0b3ItcHJldmlldy1yb3cnKSk7XG5cdFx0Y29uc3QgaGVhZGVyID0gRE9NLmFwcGVuZChyb3csICQoJy5lZGl0b3ItcHJldmlldy1yb3ctaGVhZGVyJykpO1xuXHRcdERPTS5hcHBlbmQoaGVhZGVyLCAkKCdkaXYuZWRpdG9yLXByZXZpZXctcm93LWtleScpKS50ZXh0Q29udGVudCA9IGF0dHJpYnV0ZS5rZXk7XG5cblx0XHRjb25zdCBoZWxwQnV0dG9uID0gRE9NLmFwcGVuZChoZWFkZXIsICQoJ2J1dHRvbi5lZGl0b3ItcHJldmlldy1yb3ctaGVscCcpKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRoZWxwQnV0dG9uLnR5cGUgPSAnYnV0dG9uJztcblx0XHRoZWxwQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdwcmV2aWV3RmllbGRIZWxwQXJpYUxhYmVsJywgXCJTaG93IGhlbHAgZm9yICd7MH0nXCIsIGF0dHJpYnV0ZS5rZXkpKTtcblx0XHRjb25zdCBoZWxwSWNvbiA9IERPTS5hcHBlbmQoaGVscEJ1dHRvbiwgJCgnc3Bhbi5lZGl0b3ItcHJldmlldy1yb3ctaGVscC1pY29uJykpO1xuXHRcdGhlbHBJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5pbmZvKSk7XG5cdFx0aGVscEljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGdldEF0dHJpYnV0ZURlZmluaXRpb24oYXR0cmlidXRlLmtleSwgcHJvbXB0VHlwZSwgdGFyZ2V0KT8uZGVzY3JpcHRpb24gPz8gbG9jYWxpemUoJ3ByZXZpZXdVbmtub3duRmllbGREZXNjcmlwdGlvbicsIFwiQ3VzdG9tIG1ldGFkYXRhIGZpZWxkIGB7MH1gLlwiLCBhdHRyaWJ1dGUua2V5KTtcblx0XHRjb25zdCBoZWxwSG92ZXIgPSB0aGlzLmVkaXRvclByZXZpZXdEaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgaGVscEJ1dHRvbiwge1xuXHRcdFx0bWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhkZXNjcmlwdGlvbiksXG5cdFx0XHRtYXJrZG93bk5vdFN1cHBvcnRlZEZhbGxiYWNrOiBkZXNjcmlwdGlvbixcblx0XHR9KSk7XG5cdFx0dGhpcy5lZGl0b3JQcmV2aWV3RGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoaGVscEJ1dHRvbiwgJ2NsaWNrJywgZSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0aGVscEhvdmVyLnNob3codHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdmFsdWVFbGVtZW50ID0gRE9NLmFwcGVuZChyb3csICQoJ2Rpdi5lZGl0b3ItcHJldmlldy1yb3ctdmFsdWUnKSk7XG5cdFx0Y29uc3QgdmFsdWVUZXh0ID0gdGhpcy5zdHJpbmdpZnlQcmV2aWV3VmFsdWUoYXR0cmlidXRlLnZhbHVlKTtcblx0XHR2YWx1ZUVsZW1lbnQudGV4dENvbnRlbnQgPSB2YWx1ZVRleHQ7XG5cdFx0dmFsdWVFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ211bHRpbGluZScsIHZhbHVlVGV4dC5pbmNsdWRlcygnXFxuJykpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJQcmV2aWV3Qm9keShwYXJzZWRQcm9tcHRGaWxlOiBQYXJzZWRQcm9tcHRGaWxlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvclByZXZpZXdCb2R5Q29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYm9keUNvbnRlbnQgPSBwYXJzZWRQcm9tcHRGaWxlLmJvZHk/LmdldENvbnRlbnQoKSA/PyAnJztcblx0XHRpZiAoIWJvZHlDb250ZW50LnRyaW0oKSkge1xuXHRcdFx0RE9NLmFwcGVuZCh0aGlzLmVkaXRvclByZXZpZXdCb2R5Q29udGFpbmVyLCAkKCdkaXYuZWRpdG9yLXByZXZpZXctZW1wdHktc3RhdGUnKSkudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncHJldmlld05vQm9keScsIFwiTm8gbWFya2Rvd24gYm9keSBmb3VuZCBpbiB0aGlzIGZpbGUuXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKGJvZHlDb250ZW50LCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdG1hcmtkb3duLmJhc2VVcmkgPSBwYXJzZWRQcm9tcHRGaWxlLnVyaTtcblx0XHRjb25zdCByZW5kZXJlZE1hcmtkb3duID0gdGhpcy5lZGl0b3JQcmV2aWV3RGlzcG9zYWJsZXMuYWRkKHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKG1hcmtkb3duKSk7XG5cdFx0dGhpcy5lZGl0b3JQcmV2aWV3Qm9keUNvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJlZE1hcmtkb3duLmVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdHJpbmdpZnlQcmV2aWV3VmFsdWUodmFsdWU6IElWYWx1ZSk6IHN0cmluZyB7XG5cdFx0c3dpdGNoICh2YWx1ZS50eXBlKSB7XG5cdFx0XHRjYXNlICdzY2FsYXInOlxuXHRcdFx0XHRyZXR1cm4gdmFsdWUudmFsdWU7XG5cdFx0XHRjYXNlICdzZXF1ZW5jZSc6XG5cdFx0XHRcdGlmICh2YWx1ZS5pdGVtcy5ldmVyeShpdGVtID0+IGl0ZW0udHlwZSA9PT0gJ3NjYWxhcicpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHZhbHVlLml0ZW1zLm1hcChpdGVtID0+IGl0ZW0udmFsdWUpLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh0aGlzLnRvUHJldmlld09iamVjdCh2YWx1ZSksIG51bGwsIDIpO1xuXHRcdFx0Y2FzZSAnbWFwJzpcblx0XHRcdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHRoaXMudG9QcmV2aWV3T2JqZWN0KHZhbHVlKSwgbnVsbCwgMik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0b1ByZXZpZXdPYmplY3QodmFsdWU6IElWYWx1ZSk6IHVua25vd24ge1xuXHRcdHN3aXRjaCAodmFsdWUudHlwZSkge1xuXHRcdFx0Y2FzZSAnc2NhbGFyJzpcblx0XHRcdFx0cmV0dXJuIHZhbHVlLnZhbHVlO1xuXHRcdFx0Y2FzZSAnc2VxdWVuY2UnOlxuXHRcdFx0XHRyZXR1cm4gdmFsdWUuaXRlbXMubWFwKGl0ZW0gPT4gdGhpcy50b1ByZXZpZXdPYmplY3QoaXRlbSkpO1xuXHRcdFx0Y2FzZSAnbWFwJzoge1xuXHRcdFx0XHRjb25zdCBlbnRyaWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRcdFx0XHRmb3IgKGNvbnN0IHByb3BlcnR5IG9mIHZhbHVlLnByb3BlcnRpZXMpIHtcblx0XHRcdFx0XHRlbnRyaWVzW3Byb3BlcnR5LmtleS52YWx1ZV0gPSB0aGlzLnRvUHJldmlld09iamVjdChwcm9wZXJ0eS52YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGVudHJpZXM7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckVkaXRvclByZXZpZXcoKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3JQcmV2aWV3UmVuZGVyU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdHRoaXMuZWRpdG9yUHJldmlld0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMuZWRpdG9yUHJldmlld0lzc3Vlc0NvbnRhaW5lcikge1xuXHRcdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmVkaXRvclByZXZpZXdJc3N1ZXNDb250YWluZXIpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5lZGl0b3JQcmV2aWV3RnJvbnRNYXR0ZXJDb250YWluZXIpIHtcblx0XHRcdERPTS5jbGVhck5vZGUodGhpcy5lZGl0b3JQcmV2aWV3RnJvbnRNYXR0ZXJDb250YWluZXIpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5lZGl0b3JQcmV2aWV3Qm9keUNvbnRhaW5lcikge1xuXHRcdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmVkaXRvclByZXZpZXdCb2R5Q29udGFpbmVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRpc3Bvc2VCdWlsdGluRWRpdGluZ1Nlc3Npb25zKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLmJ1aWx0aW5FZGl0aW5nU2Vzc2lvbnMudmFsdWVzKCkpIHtcblx0XHRcdHNlc3Npb24ubW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLmJ1aWx0aW5FZGl0aW5nU2Vzc2lvbnMuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZUJ1aWx0aW5FZGl0aW5nU2Vzc2lvbih1cmk6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHVyaS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmJ1aWx0aW5FZGl0aW5nU2Vzc2lvbnMuZ2V0KGtleSk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c2Vzc2lvbi5tb2RlbC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5idWlsdGluRWRpdGluZ1Nlc3Npb25zLmRlbGV0ZShrZXkpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEVtYmVkZGVkIE1DUCBTZXJ2ZXIgRGV0YWlsXG5cblx0cHJpdmF0ZSBjcmVhdGVFbWJlZGRlZE1jcERldGFpbCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubWNwRGV0YWlsQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGFpbmVyIGZvciB0aGUgY29tcGFjdCBNQ1AgZGV0YWlsIGNvbXBvbmVudFxuXHRcdGNvbnN0IGRldGFpbEJvZHkgPSBET00uYXBwZW5kKHRoaXMubWNwRGV0YWlsQ29udGFpbmVyLCAkKCcubWNwLWRldGFpbC1lZGl0b3ItY29udGFpbmVyJykpO1xuXG5cdFx0dGhpcy5lbWJlZGRlZE1jcERldGFpbCA9IHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW1iZWRkZWRNY3BTZXJ2ZXJEZXRhaWwsIGRldGFpbEJvZHkpKTtcblxuXHRcdC8vIEJhY2sgYnV0dG9uIHJlbmRlcmVkIGludG8gdGhlIGRldGFpbCdzIGxlYWRpbmcgc2xvdFxuXHRcdGNvbnN0IGJhY2tCdXR0b24gPSBET00uYXBwZW5kKHRoaXMuZW1iZWRkZWRNY3BEZXRhaWwubGVhZGluZ1Nsb3QsICQoJ2J1dHRvbi5lZGl0b3ItYmFjay1idXR0b24nKSk7XG5cdFx0YmFja0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAnYnV0dG9uJyk7XG5cdFx0YmFja0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnYmFja1RvTWNwTGlzdCcsIFwiQmFjayB0byBNQ1Agc2VydmVyc1wiKSk7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgYmFja0J1dHRvbiwgbG9jYWxpemUoJ2JhY2tUb01jcExpc3RUb29sdGlwJywgXCJCYWNrIHRvIE1DUCBzZXJ2ZXJzXCIpKSk7XG5cdFx0Y29uc3QgYmFja0ljb25FbCA9IERPTS5hcHBlbmQoYmFja0J1dHRvbiwgJChgLmNvZGljb24uY29kaWNvbi0ke0NvZGljb24uYXJyb3dMZWZ0LmlkfWApKTtcblx0XHRiYWNrSWNvbkVsLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYmFja0J1dHRvbiwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5nb0JhY2tGcm9tTWNwRGV0YWlsKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzaG93RW1iZWRkZWRNY3BEZXRhaWwoc2VydmVyOiBJV29ya2JlbmNoTWNwU2VydmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmVtYmVkZGVkTWNwRGV0YWlsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3TW9kZSA9ICdtY3BEZXRhaWwnO1xuXHRcdHRoaXMudXBkYXRlQ29udGVudFZpc2liaWxpdHkoKTtcblxuXHRcdHRoaXMubWNwRGV0YWlsRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmVtYmVkZGVkTWNwRGV0YWlsLnNldElucHV0KHNlcnZlcik7XG5cblx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdvQmFja0Zyb21NY3BEZXRhaWwoKTogdm9pZCB7XG5cdFx0dGhpcy5tY3BEZXRhaWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZW1iZWRkZWRNY3BEZXRhaWw/LmNsZWFySW5wdXQoKTtcblx0XHR0aGlzLnZpZXdNb2RlID0gJ2xpc3QnO1xuXHRcdHRoaXMudXBkYXRlQ29udGVudFZpc2liaWxpdHkoKTtcblxuXHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdH1cblx0XHR0aGlzLm1jcExpc3RXaWRnZXQ/LmZvY3VzU2VhcmNoKCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRW1iZWRkZWQgUGx1Z2luIERldGFpbFxuXG5cdHByaXZhdGUgY3JlYXRlRW1iZWRkZWRQbHVnaW5EZXRhaWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnBsdWdpbkRldGFpbENvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENvbnRhaW5lciBmb3IgdGhlIGNvbXBhY3QgcGx1Z2luIGRldGFpbCBjb21wb25lbnRcblx0XHRjb25zdCBkZXRhaWxCb2R5ID0gRE9NLmFwcGVuZCh0aGlzLnBsdWdpbkRldGFpbENvbnRhaW5lciwgJCgnLnBsdWdpbi1kZXRhaWwtZWRpdG9yLWNvbnRhaW5lcicpKTtcblxuXHRcdHRoaXMuZW1iZWRkZWRQbHVnaW5EZXRhaWwgPSB0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVtYmVkZGVkQWdlbnRQbHVnaW5EZXRhaWwsIGRldGFpbEJvZHkpKTtcblxuXHRcdC8vIEJhY2sgYnV0dG9uIHJlbmRlcmVkIGludG8gdGhlIGRldGFpbCdzIGxlYWRpbmcgc2xvdFxuXHRcdGNvbnN0IGJhY2tCdXR0b24gPSBET00uYXBwZW5kKHRoaXMuZW1iZWRkZWRQbHVnaW5EZXRhaWwubGVhZGluZ1Nsb3QsICQoJ2J1dHRvbi5lZGl0b3ItYmFjay1idXR0b24nKSk7XG5cdFx0YmFja0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAnYnV0dG9uJyk7XG5cdFx0YmFja0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnYmFja1RvUGx1Z2luTGlzdCcsIFwiQmFjayB0byBwbHVnaW5zXCIpKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCBiYWNrQnV0dG9uLCBsb2NhbGl6ZSgnYmFja1RvUGx1Z2luTGlzdFRvb2x0aXAnLCBcIkJhY2sgdG8gcGx1Z2luc1wiKSkpO1xuXHRcdGNvbnN0IGJhY2tJY29uRWwgPSBET00uYXBwZW5kKGJhY2tCdXR0b24sICQoYC5jb2RpY29uLmNvZGljb24tJHtDb2RpY29uLmFycm93TGVmdC5pZH1gKSk7XG5cdFx0YmFja0ljb25FbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJhY2tCdXR0b24sICdjbGljaycsICgpID0+IHtcblx0XHRcdHRoaXMuZ29CYWNrRnJvbVBsdWdpbkRldGFpbCgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd0VtYmVkZGVkUGx1Z2luRGV0YWlsKGl0ZW06IElBZ2VudFBsdWdpbkl0ZW0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuZW1iZWRkZWRQbHVnaW5EZXRhaWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdNb2RlID0gJ3BsdWdpbkRldGFpbCc7XG5cdFx0dGhpcy51cGRhdGVDb250ZW50VmlzaWJpbGl0eSgpO1xuXG5cdFx0dGhpcy5wbHVnaW5EZXRhaWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZW1iZWRkZWRQbHVnaW5EZXRhaWwuc2V0SW5wdXQoaXRlbSk7XG5cblx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUHVibGljIG1ldGhvZCB0byBzaG93IGEgcGx1Z2luIGRldGFpbCBmcm9tIGFueSBzZWN0aW9uIChlLmcuIGZyb20gXCJTaG93IFBsdWdpblwiIGNvbnRleHQgbWVudSkuXG5cdCAqIFNhdmVzIHRoZSBjdXJyZW50IHNlY3Rpb24gc28gdGhlIGJhY2sgYnV0dG9uIHJldHVybnMgdGhlIHVzZXIgdG8gaXQuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgc2hvd1BsdWdpbkRldGFpbChpdGVtOiBJQWdlbnRQbHVnaW5JdGVtKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRTZWN0aW9uICE9PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zKSB7XG5cdFx0XHR0aGlzLnBsdWdpbkRldGFpbFJldHVyblNlY3Rpb24gPSB0aGlzLnNlbGVjdGVkU2VjdGlvbiA/PyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHM7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuc2hvd0VtYmVkZGVkUGx1Z2luRGV0YWlsKGl0ZW0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnb0JhY2tGcm9tUGx1Z2luRGV0YWlsKCk6IHZvaWQge1xuXHRcdHRoaXMucGx1Z2luRGV0YWlsRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmVtYmVkZGVkUGx1Z2luRGV0YWlsPy5jbGVhcklucHV0KCk7XG5cblx0XHRjb25zdCByZXR1cm5TZWN0aW9uID0gdGhpcy5wbHVnaW5EZXRhaWxSZXR1cm5TZWN0aW9uO1xuXHRcdHRoaXMucGx1Z2luRGV0YWlsUmV0dXJuU2VjdGlvbiA9IHVuZGVmaW5lZDtcblxuXHRcdGlmIChyZXR1cm5TZWN0aW9uKSB7XG5cdFx0XHQvLyBSZXR1cm4gdG8gdGhlIHNlY3Rpb24gdGhlIHVzZXIgd2FzIG9uIGJlZm9yZSBvcGVuaW5nIHRoZSBwbHVnaW4gZGV0YWlsLlxuXHRcdFx0Ly8gc2VsZWN0U2VjdGlvbiBtYXkgZWFybHktcmV0dXJuIHdoZW4gdGhlIHNlY3Rpb24gaGFzbid0IGNoYW5nZWQsIHNvIGFsd2F5c1xuXHRcdFx0Ly8gZW5zdXJlIHZpZXdNb2RlIGFuZCBjb250ZW50IHZpc2liaWxpdHkgYXJlIHVwZGF0ZWQuXG5cdFx0XHR0aGlzLnZpZXdNb2RlID0gJ2xpc3QnO1xuXHRcdFx0dGhpcy51cGRhdGVDb250ZW50VmlzaWJpbGl0eSgpO1xuXHRcdFx0dGhpcy5zZWxlY3RTZWN0aW9uKHJldHVyblNlY3Rpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlID0gJ2xpc3QnO1xuXHRcdFx0dGhpcy51cGRhdGVDb250ZW50VmlzaWJpbGl0eSgpO1xuXHRcdFx0dGhpcy5wbHVnaW5MaXN0V2lkZ2V0Py5mb2N1c1NlYXJjaCgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBFbWJlZGRlZCBUb29sIEV4dGVuc2lvbiBEZXRhaWxcblxuXHRwcml2YXRlIGNyZWF0ZUVtYmVkZGVkVG9vbERldGFpbCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudG9vbHNEZXRhaWxDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDb250YWluZXIgZm9yIHRoZSBjb21wYWN0IHRvb2wgZXh0ZW5zaW9uIGRldGFpbCBjb21wb25lbnRcblx0XHRjb25zdCBkZXRhaWxCb2R5ID0gRE9NLmFwcGVuZCh0aGlzLnRvb2xzRGV0YWlsQ29udGFpbmVyLCAkKCcudG9vbHMtZGV0YWlsLWVkaXRvci1jb250YWluZXInKSk7XG5cblx0XHR0aGlzLmVtYmVkZGVkVG9vbERldGFpbCA9IHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW1iZWRkZWRFeHRlbnNpb25Ub29sc0RldGFpbCwgZGV0YWlsQm9keSkpO1xuXG5cdFx0Ly8gQmFjayBidXR0b24gcmVuZGVyZWQgaW50byB0aGUgZGV0YWlsJ3MgbGVhZGluZyBzbG90XG5cdFx0Y29uc3QgYmFja0J1dHRvbiA9IERPTS5hcHBlbmQodGhpcy5lbWJlZGRlZFRvb2xEZXRhaWwubGVhZGluZ1Nsb3QsICQoJ2J1dHRvbi5lZGl0b3ItYmFjay1idXR0b24nKSk7XG5cdFx0YmFja0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAnYnV0dG9uJyk7XG5cdFx0YmFja0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnYmFja1RvVG9vbHNMaXN0JywgXCJCYWNrIHRvIHRvb2xzXCIpKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCBiYWNrQnV0dG9uLCBsb2NhbGl6ZSgnYmFja1RvVG9vbHNMaXN0VG9vbHRpcCcsIFwiQmFjayB0byB0b29sc1wiKSkpO1xuXHRcdGNvbnN0IGJhY2tJY29uRWwgPSBET00uYXBwZW5kKGJhY2tCdXR0b24sICQoYC5jb2RpY29uLmNvZGljb24tJHtDb2RpY29uLmFycm93TGVmdC5pZH1gKSk7XG5cdFx0YmFja0ljb25FbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJhY2tCdXR0b24sICdjbGljaycsICgpID0+IHtcblx0XHRcdHRoaXMuZ29CYWNrRnJvbVRvb2xEZXRhaWwoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3dFbWJlZGRlZFRvb2xEZXRhaWwoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmVtYmVkZGVkVG9vbERldGFpbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudmlld01vZGUgPSAndG9vbHNEZXRhaWwnO1xuXHRcdHRoaXMudXBkYXRlQ29udGVudFZpc2liaWxpdHkoKTtcblxuXHRcdHRoaXMudG9vbHNEZXRhaWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZW1iZWRkZWRUb29sRGV0YWlsLnNldElucHV0KGV4dGVuc2lvbik7XG5cblx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdvQmFja0Zyb21Ub29sRGV0YWlsKCk6IHZvaWQge1xuXHRcdHRoaXMudG9vbHNEZXRhaWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZW1iZWRkZWRUb29sRGV0YWlsPy5jbGVhcklucHV0KCk7XG5cdFx0dGhpcy52aWV3TW9kZSA9ICdsaXN0Jztcblx0XHR0aGlzLnVwZGF0ZUNvbnRlbnRWaXNpYmlsaXR5KCk7XG5cblx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHR9XG5cdFx0dGhpcy50b29sc0xpc3RXaWRnZXQ/LmZvY3VzU2VhcmNoKCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUVyQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxrQkFBa0IsZUFBZTtBQUMxQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlCQUE2QixvQkFBb0I7QUFDMUQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWEsUUFBUSxpQkFBaUI7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
