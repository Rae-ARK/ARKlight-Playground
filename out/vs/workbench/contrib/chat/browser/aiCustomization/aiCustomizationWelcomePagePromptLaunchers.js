import "./media/aiCustomizationWelcomePromptLaunchers.css";
import * as DOM from "../../../../../base/browser/dom.js";
import { DomScrollableElement } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../../../base/common/scrollable.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { AICustomizationManagementSection } from "./aiCustomizationManagement.js";
import { agentIcon, instructionsIcon, pluginIcon, skillIcon, hookIcon, toolsIcon } from "./aiCustomizationIcons.js";
import { PromptsType } from "../../common/promptSyntax/promptTypes.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID, CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID } from "../actions/configureVoiceInstructionsAction.js";
const $ = DOM.$;
class PromptLaunchersAICustomizationWelcomePage extends Disposable {
  constructor(parent, welcomePageFeatures, callbacks, commandService, workspaceService, hoverService, harnessLabel) {
    super();
    this.welcomePageFeatures = welcomePageFeatures;
    this.callbacks = callbacks;
    this.commandService = commandService;
    this.workspaceService = workspaceService;
    this.hoverService = hoverService;
    this.harnessLabel = harnessLabel;
    this.cardDisposables = this._register(new DisposableStore());
    this.visibleSectionIds = /* @__PURE__ */ new Set();
    this.categoryDescriptions = [
      {
        id: AICustomizationManagementSection.Agents,
        label: localize("agents", "Agents"),
        icon: agentIcon,
        description: localize("agentsDesc", "Define custom agents with specialized personas, tool access, and instructions for specific tasks."),
        promptType: PromptsType.agent
      },
      {
        id: AICustomizationManagementSection.Skills,
        label: localize("skills", "Skills"),
        icon: skillIcon,
        description: localize("skillsDesc", "Create reusable skill files that provide domain-specific knowledge and workflows."),
        promptType: PromptsType.skill
      },
      {
        id: AICustomizationManagementSection.Instructions,
        label: localize("instructions", "Instructions"),
        icon: instructionsIcon,
        description: localize("instructionsDesc", "Set always-on instructions that guide AI behavior across your workspace or user profile."),
        promptType: PromptsType.instructions
      },
      {
        id: AICustomizationManagementSection.Hooks,
        label: localize("hooks", "Hooks"),
        icon: hookIcon,
        description: localize("hooksDesc", "Configure automated actions triggered by events like saving files or running tasks."),
        promptType: PromptsType.hook
      },
      {
        id: AICustomizationManagementSection.McpServers,
        label: localize("mcpServers", "MCP Servers"),
        icon: Codicon.server,
        description: localize("mcpServersDesc", "Connect external tool servers that extend AI capabilities with custom tools and data sources.")
      },
      {
        id: AICustomizationManagementSection.Plugins,
        label: localize("plugins", "Plugins"),
        icon: pluginIcon,
        description: localize("pluginsDesc", "Install and manage agent plugins that add additional tools, skills, and integrations.")
      },
      {
        id: AICustomizationManagementSection.Tools,
        label: localize("tools", "Tools"),
        icon: toolsIcon,
        description: localize("toolsDesc", "Enable or disable the tools available to chat.")
      }
    ];
    this.standaloneCustomizations = [
      {
        label: localize("voiceModeInstructions", "Voice Mode Instructions"),
        icon: Codicon.voiceMode,
        description: localize("voiceModeInstructionsDesc", "Customize Voice Mode behavior and terminology with voice.md."),
        commandId: CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID
      },
      {
        label: localize("dictationInstructions", "Dictation Instructions"),
        icon: Codicon.mic,
        description: localize("dictationInstructionsDesc", "Customize Dictation terminology and transcript formatting with dictation.md."),
        commandId: CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID
      }
    ];
    this.container = $(".welcome-prompts-content-container");
    this.scrollable = this._register(new DomScrollableElement(this.container, {
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Auto,
      useShadows: false
    }));
    const scrollableNode = this.scrollable.getDomNode();
    scrollableNode.classList.add("welcome-prompts-scrollable");
    parent.appendChild(scrollableNode);
    const resizeObserver = this._register(new DOM.DisposableResizeObserver("AICustomizationWelcomePagePromptLaunchers.scrollable", () => this.scrollable.scanDomNode()));
    this._register(resizeObserver.observe(scrollableNode));
    const welcomeInner = DOM.append(this.container, $(".welcome-prompts-inner"));
    this.heading = DOM.append(welcomeInner, $("h2.welcome-prompts-heading"));
    this.updateHeading();
    const subtitle = DOM.append(welcomeInner, $("p.welcome-prompts-subtitle"));
    subtitle.textContent = localize("welcomeSubtitle", "Tailor how agents work in your projects. Configure workspace customizations for the entire team, or create personal ones that follow you across projects.");
    if (this.welcomePageFeatures?.showGettingStartedBanner !== false) {
      const gettingStarted = DOM.append(welcomeInner, $(".welcome-prompts-primary"));
      const header = DOM.append(gettingStarted, $(".welcome-prompts-section-label"));
      const icon = DOM.append(header, $("span.welcome-prompts-section-label-icon.codicon.codicon-sparkle"));
      icon.setAttribute("aria-hidden", "true");
      const title = DOM.append(header, $("span"));
      title.textContent = localize("gettingStartedTitle", "Customize Your Agent");
      const description = DOM.append(gettingStarted, $("p.welcome-prompts-input-helper"));
      description.textContent = localize("gettingStartedDesc", "Describe your preferences and conventions to draft agents, skills, and instructions.");
      const inputRow = DOM.append(gettingStarted, $(".welcome-prompts-input-row"));
      this.inputRow = inputRow;
      this.inputElement = DOM.append(inputRow, $("input.welcome-prompts-input"));
      this.inputElement.type = "text";
      this.inputElement.placeholder = localize("workflowInputPlaceholder", "Prefer concise commits, thorough reviews, and tested code...");
      this.inputElement.setAttribute("aria-label", localize("workflowInputAriaLabel", "Describe your preferences to customize your agent"));
      const submitBtn = DOM.append(inputRow, $("button.welcome-prompts-input-submit"));
      this.submitBtn = submitBtn;
      submitBtn.setAttribute("aria-label", localize("workflowSubmitAriaLabel", "Customize agent"));
      this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), submitBtn, localize("workflowSubmitTooltip", "Open in Chat")));
      const chevron = DOM.append(submitBtn, $("span.codicon.codicon-arrow-up"));
      chevron.setAttribute("aria-hidden", "true");
      const updateSubmitState = () => {
        const hasValue = !!this.inputElement?.value?.trim();
        submitBtn.disabled = !hasValue;
        submitBtn.classList.toggle("welcome-prompts-input-submit-disabled", !hasValue);
      };
      const submit = () => {
        const value = this.inputElement?.value?.trim();
        if (!value) {
          return;
        }
        let query;
        if (this.workspaceService.isSessionsWindow) {
          query = `Generate agent customizations. ${value}`;
        } else {
          query = `/init ${value}`;
        }
        if (this.inputElement) {
          this.inputElement.value = "";
        }
        updateSubmitState();
        inputRow.classList.add("sent");
        submitBtn.style.display = "none";
        if (this.sentLabel) {
          this.sentLabel.remove();
        }
        this.sentLabel = DOM.append(inputRow, $("span.welcome-prompts-sent-label"));
        this.sentLabel.textContent = localize("sentToChat", "Sent to chat \u2713");
        this.callbacks.prefillChat(query, { isPartialQuery: false, newChat: true });
      };
      this._register(DOM.addDisposableListener(submitBtn, "click", (e) => {
        e.stopPropagation();
        submit();
      }));
      this._register(DOM.addDisposableListener(this.inputElement, "keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      }));
      this._register(DOM.addDisposableListener(this.inputElement, "input", () => {
        updateSubmitState();
        this._clearSentState();
      }));
      updateSubmitState();
    }
    this.cardsContainer = DOM.append(welcomeInner, $(".welcome-prompts-cards"));
  }
  _clearSentState() {
    if (this.sentLabel) {
      this.sentLabel.remove();
      this.sentLabel = void 0;
    }
    if (this.submitBtn) {
      this.submitBtn.style.display = "";
    }
    if (this.inputRow) {
      this.inputRow.classList.remove("sent");
    }
  }
  reset() {
    this._clearSentState();
  }
  rebuildCards(visibleSectionIds) {
    if (!this.cardsContainer) {
      return;
    }
    this.visibleSectionIds = new Set(visibleSectionIds);
    this.cardDisposables.clear();
    DOM.clearNode(this.cardsContainer);
    this.firstCard = void 0;
    for (const category of this.categoryDescriptions) {
      if (!visibleSectionIds.has(category.id)) {
        continue;
      }
      const card = DOM.append(this.cardsContainer, $(".welcome-prompts-card"));
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      if (!this.firstCard) {
        this.firstCard = card;
      }
      const cardHeader = DOM.append(card, $(".welcome-prompts-card-header"));
      const iconEl = DOM.append(cardHeader, $(".welcome-prompts-card-icon"));
      iconEl.classList.add(...ThemeIcon.asClassNameArray(category.icon));
      const labelEl = DOM.append(cardHeader, $("span.welcome-prompts-card-label"));
      labelEl.textContent = category.label;
      const descEl = DOM.append(card, $("p.welcome-prompts-card-description"));
      descEl.textContent = category.description;
      const footer = DOM.append(card, $(".welcome-prompts-card-footer"));
      if (category.promptType) {
        const generateBtn = DOM.append(footer, $("button.welcome-prompts-card-action"));
        generateBtn.textContent = localize("new", "New...");
        generateBtn.setAttribute("aria-label", localize("newCategoryAriaLabel", "New {0}...", category.label));
        this.cardDisposables.add(DOM.addDisposableListener(generateBtn, "click", (e) => {
          e.stopPropagation();
          this.callbacks.closeEditor();
          if (this.workspaceService.isSessionsWindow) {
            const typeLabel = category.label.toLowerCase().replace(/s$/, "");
            this.callbacks.prefillChat(`Create me a custom ${typeLabel} that `, { isPartialQuery: true, newChat: true });
          } else {
            this.workspaceService.generateCustomization(category.promptType);
          }
        }));
      } else {
        const browseBtn = DOM.append(footer, $("button.welcome-prompts-card-action"));
        browseBtn.textContent = localize("browse", "Browse...");
        browseBtn.setAttribute("aria-label", localize("browseCategoryAriaLabel", "Browse {0}...", category.label));
        this.cardDisposables.add(DOM.addDisposableListener(browseBtn, "click", (e) => {
          e.stopPropagation();
          this.callbacks.selectSectionWithMarketplace(category.id);
        }));
      }
      this.cardDisposables.add(DOM.addDisposableListener(card, "click", () => {
        this.callbacks.selectSection(category.id);
      }));
      this.cardDisposables.add(DOM.addDisposableListener(card, "keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.callbacks.selectSection(category.id);
        }
      }));
    }
    if (!this.workspaceService.isSessionsWindow) {
      for (const customization of this.standaloneCustomizations) {
        this.renderStandaloneCustomization(customization);
      }
    }
    if (this.promptMigrationInfo) {
      this.renderPromptMigrationCard();
    }
    this.scrollable.scanDomNode();
  }
  renderStandaloneCustomization(customization) {
    if (!this.cardsContainer) {
      return;
    }
    const card = DOM.append(this.cardsContainer, $(".welcome-prompts-card"));
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    if (!this.firstCard) {
      this.firstCard = card;
    }
    const cardHeader = DOM.append(card, $(".welcome-prompts-card-header"));
    const iconEl = DOM.append(cardHeader, $(".welcome-prompts-card-icon"));
    iconEl.classList.add(...ThemeIcon.asClassNameArray(customization.icon));
    const labelEl = DOM.append(cardHeader, $("span.welcome-prompts-card-label"));
    labelEl.textContent = customization.label;
    const descEl = DOM.append(card, $("p.welcome-prompts-card-description"));
    descEl.textContent = customization.description;
    const footer = DOM.append(card, $(".welcome-prompts-card-footer"));
    const configureButton = DOM.append(footer, $("button.welcome-prompts-card-action"));
    configureButton.textContent = localize("configure", "Configure...");
    configureButton.setAttribute("aria-label", localize("configureCategoryAriaLabel", "Configure {0}...", customization.label));
    const configure = () => {
      void this.commandService.executeCommand(customization.commandId);
    };
    this.cardDisposables.add(DOM.addDisposableListener(configureButton, "click", (e) => {
      e.stopPropagation();
      configure();
    }));
    this.cardDisposables.add(DOM.addDisposableListener(card, "click", configure));
    this.cardDisposables.add(DOM.addDisposableListener(card, "keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        configure();
      }
    }));
  }
  setPromptMigrationInfo(info) {
    const didChange = this.promptMigrationInfo?.totalPromptCount !== info?.totalPromptCount || this.promptMigrationInfo?.workspacePromptCount !== info?.workspacePromptCount || this.promptMigrationInfo?.userPromptCount !== info?.userPromptCount;
    this.promptMigrationInfo = info;
    if (didChange) {
      this.rebuildCards(this.visibleSectionIds);
    }
  }
  setHarnessLabel(label) {
    if (this.harnessLabel === label) {
      return;
    }
    this.harnessLabel = label;
    this.updateHeading();
  }
  updateHeading() {
    if (this.heading) {
      this.heading.textContent = localize("welcomeHeadingWithHarness", "Agent Customizations for {0}", this.harnessLabel);
    }
  }
  renderPromptMigrationCard() {
    if (!this.cardsContainer || !this.promptMigrationInfo) {
      return;
    }
    const migrationCard = DOM.append(this.cardsContainer, $(".welcome-prompts-card.welcome-prompts-migration-card"));
    migrationCard.setAttribute("tabindex", "0");
    migrationCard.setAttribute("role", "button");
    if (!this.firstCard) {
      this.firstCard = migrationCard;
    }
    const cardHeader = DOM.append(migrationCard, $(".welcome-prompts-card-header"));
    const iconEl = DOM.append(cardHeader, $(".welcome-prompts-card-icon"));
    iconEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.sync));
    const labelEl = DOM.append(cardHeader, $("span.welcome-prompts-card-label"));
    labelEl.textContent = localize("migratePromptFiles", "Migrate");
    const descEl = DOM.append(migrationCard, $("p.welcome-prompts-card-description"));
    descEl.textContent = this.getPromptMigrationDescription();
    const footer = DOM.append(migrationCard, $(".welcome-prompts-card-footer"));
    const migrateBtn = DOM.append(footer, $("button.welcome-prompts-card-action"));
    migrateBtn.textContent = localize("convertToSkills", "Convert to Skills...");
    migrateBtn.setAttribute("aria-label", localize("convertPromptFilesAriaLabel", "Convert prompt files to skills"));
    this.cardDisposables.add(DOM.addDisposableListener(migrateBtn, "click", (e) => {
      e.stopPropagation();
      this.callbacks.migratePromptFiles();
    }));
    this.cardDisposables.add(DOM.addDisposableListener(migrationCard, "click", () => {
      this.callbacks.migratePromptFiles();
    }));
    this.cardDisposables.add(DOM.addDisposableListener(migrationCard, "keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.callbacks.migratePromptFiles();
      }
    }));
  }
  getPromptMigrationDescription() {
    if (!this.promptMigrationInfo) {
      return "";
    }
    const { workspacePromptCount, userPromptCount, totalPromptCount } = this.promptMigrationInfo;
    if (workspacePromptCount > 0 && userPromptCount > 0) {
      return localize(
        "promptMigrationCardDescriptionWorkspaceAndUser",
        "Prompt files are deprecated for this harness. Found {0} prompt files ({1} workspace, {2} global) that local VS Code can still run, but {3} ignores. Convert them to skills to keep them available.",
        totalPromptCount,
        workspacePromptCount,
        userPromptCount,
        this.harnessLabel
      );
    }
    if (workspacePromptCount > 0) {
      return localize(
        "promptMigrationCardDescriptionWorkspace",
        "Prompt files are deprecated for this harness. Found {0} workspace prompt files that local VS Code can still run, but {1} ignores. Convert them to skills to keep them available.",
        workspacePromptCount,
        this.harnessLabel
      );
    }
    return localize(
      "promptMigrationCardDescriptionUser",
      "Prompt files are deprecated for this harness. Found {0} global prompt files that local VS Code can still run, but {1} ignores. Convert them to skills to keep them available.",
      userPromptCount,
      this.harnessLabel
    );
  }
  focus() {
    if (this.inputElement) {
      this.inputElement.focus();
      return;
    }
    this.firstCard?.focus();
  }
}
export {
  PromptLaunchersAICustomizationWelcomePage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uV2VsY29tZVBhZ2VQcm9tcHRMYXVuY2hlcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvYWlDdXN0b21pemF0aW9uV2VsY29tZVByb21wdExhdW5jaGVycy5jc3MnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IFNjcm9sbGJhclZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB0eXBlIHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uIH0gZnJvbSAnLi9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGFnZW50SWNvbiwgaW5zdHJ1Y3Rpb25zSWNvbiwgcGx1Z2luSWNvbiwgc2tpbGxJY29uLCBob29rSWNvbiwgdG9vbHNJY29uIH0gZnJvbSAnLi9haUN1c3RvbWl6YXRpb25JY29ucy5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSwgSVdlbGNvbWVQYWdlRmVhdHVyZXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQUlDdXN0b21pemF0aW9uV2VsY29tZVBhZ2VJbXBsZW1lbnRhdGlvbiwgSVdlbGNvbWVQYWdlQ2FsbGJhY2tzIH0gZnJvbSAnLi9haUN1c3RvbWl6YXRpb25XZWxjb21lUGFnZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0TWlncmF0aW9uSW5mbyB9IGZyb20gJy4vcHJvbXB0TWlncmF0aW9uLmpzJztcbmltcG9ydCB7IENPTkZJR1VSRV9ESUNUQVRJT05fSU5TVFJVQ1RJT05TX0FDVElPTl9JRCwgQ09ORklHVVJFX1ZPSUNFX0lOU1RSVUNUSU9OU19BQ1RJT05fSUQgfSBmcm9tICcuLi9hY3Rpb25zL2NvbmZpZ3VyZVZvaWNlSW5zdHJ1Y3Rpb25zQWN0aW9uLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5pbnRlcmZhY2UgSVByb21wdExhdW5jaGVyc0NhdGVnb3J5RGVzY3JpcHRpb24ge1xuXHRyZWFkb25seSBpZDogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb247XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcblx0cmVhZG9ubHkgcHJvbXB0VHlwZT86IFByb21wdHNUeXBlO1xufVxuXG5pbnRlcmZhY2UgSVN0YW5kYWxvbmVDdXN0b21pemF0aW9uRGVzY3JpcHRpb24ge1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb247XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbW1hbmRJZDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgUHJvbXB0TGF1bmNoZXJzQUlDdXN0b21pemF0aW9uV2VsY29tZVBhZ2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFJQ3VzdG9taXphdGlvbldlbGNvbWVQYWdlSW1wbGVtZW50YXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2FyZERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNjcm9sbGFibGU6IERvbVNjcm9sbGFibGVFbGVtZW50O1xuXHRwcml2YXRlIGNhcmRzQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBmaXJzdENhcmQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGhlYWRpbmc6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGlucHV0RWxlbWVudDogSFRNTElucHV0RWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB2aXNpYmxlU2VjdGlvbklkcyA9IG5ldyBTZXQ8QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24+KCk7XG5cblx0cHJpdmF0ZSBzZW50TGFiZWw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHN1Ym1pdEJ0bjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaW5wdXRSb3c6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHByb21wdE1pZ3JhdGlvbkluZm86IElQcm9tcHRNaWdyYXRpb25JbmZvIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2F0ZWdvcnlEZXNjcmlwdGlvbnM6IElQcm9tcHRMYXVuY2hlcnNDYXRlZ29yeURlc2NyaXB0aW9uW10gPSBbXG5cdFx0e1xuXHRcdFx0aWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRzJywgXCJBZ2VudHNcIiksXG5cdFx0XHRpY29uOiBhZ2VudEljb24sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50c0Rlc2MnLCBcIkRlZmluZSBjdXN0b20gYWdlbnRzIHdpdGggc3BlY2lhbGl6ZWQgcGVyc29uYXMsIHRvb2wgYWNjZXNzLCBhbmQgaW5zdHJ1Y3Rpb25zIGZvciBzcGVjaWZpYyB0YXNrcy5cIiksXG5cdFx0XHRwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5hZ2VudCxcblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NraWxscycsIFwiU2tpbGxzXCIpLFxuXHRcdFx0aWNvbjogc2tpbGxJY29uLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdza2lsbHNEZXNjJywgXCJDcmVhdGUgcmV1c2FibGUgc2tpbGwgZmlsZXMgdGhhdCBwcm92aWRlIGRvbWFpbi1zcGVjaWZpYyBrbm93bGVkZ2UgYW5kIHdvcmtmbG93cy5cIiksXG5cdFx0XHRwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5za2lsbCxcblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2luc3RydWN0aW9ucycsIFwiSW5zdHJ1Y3Rpb25zXCIpLFxuXHRcdFx0aWNvbjogaW5zdHJ1Y3Rpb25zSWNvbixcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25zRGVzYycsIFwiU2V0IGFsd2F5cy1vbiBpbnN0cnVjdGlvbnMgdGhhdCBndWlkZSBBSSBiZWhhdmlvciBhY3Jvc3MgeW91ciB3b3Jrc3BhY2Ugb3IgdXNlciBwcm9maWxlLlwiKSxcblx0XHRcdHByb21wdFR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ib29rcyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaG9va3MnLCBcIkhvb2tzXCIpLFxuXHRcdFx0aWNvbjogaG9va0ljb24sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2hvb2tzRGVzYycsIFwiQ29uZmlndXJlIGF1dG9tYXRlZCBhY3Rpb25zIHRyaWdnZXJlZCBieSBldmVudHMgbGlrZSBzYXZpbmcgZmlsZXMgb3IgcnVubmluZyB0YXNrcy5cIiksXG5cdFx0XHRwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5ob29rLFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0aWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcFNlcnZlcnMnLCBcIk1DUCBTZXJ2ZXJzXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zZXJ2ZXIsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21jcFNlcnZlcnNEZXNjJywgXCJDb25uZWN0IGV4dGVybmFsIHRvb2wgc2VydmVycyB0aGF0IGV4dGVuZCBBSSBjYXBhYmlsaXRpZXMgd2l0aCBjdXN0b20gdG9vbHMgYW5kIGRhdGEgc291cmNlcy5cIiksXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRpZDogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUGx1Z2lucyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncGx1Z2lucycsIFwiUGx1Z2luc1wiKSxcblx0XHRcdGljb246IHBsdWdpbkljb24sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3BsdWdpbnNEZXNjJywgXCJJbnN0YWxsIGFuZCBtYW5hZ2UgYWdlbnQgcGx1Z2lucyB0aGF0IGFkZCBhZGRpdGlvbmFsIHRvb2xzLCBza2lsbHMsIGFuZCBpbnRlZ3JhdGlvbnMuXCIpLFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0aWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlRvb2xzLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCd0b29scycsIFwiVG9vbHNcIiksXG5cdFx0XHRpY29uOiB0b29sc0ljb24sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rvb2xzRGVzYycsIFwiRW5hYmxlIG9yIGRpc2FibGUgdGhlIHRvb2xzIGF2YWlsYWJsZSB0byBjaGF0LlwiKSxcblx0XHR9LFxuXHRdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RhbmRhbG9uZUN1c3RvbWl6YXRpb25zOiBJU3RhbmRhbG9uZUN1c3RvbWl6YXRpb25EZXNjcmlwdGlvbltdID0gW1xuXHRcdHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndm9pY2VNb2RlSW5zdHJ1Y3Rpb25zJywgXCJWb2ljZSBNb2RlIEluc3RydWN0aW9uc1wiKSxcblx0XHRcdGljb246IENvZGljb24udm9pY2VNb2RlLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2b2ljZU1vZGVJbnN0cnVjdGlvbnNEZXNjJywgXCJDdXN0b21pemUgVm9pY2UgTW9kZSBiZWhhdmlvciBhbmQgdGVybWlub2xvZ3kgd2l0aCB2b2ljZS5tZC5cIiksXG5cdFx0XHRjb21tYW5kSWQ6IENPTkZJR1VSRV9WT0lDRV9JTlNUUlVDVElPTlNfQUNUSU9OX0lELFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkaWN0YXRpb25JbnN0cnVjdGlvbnMnLCBcIkRpY3RhdGlvbiBJbnN0cnVjdGlvbnNcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLm1pYyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGljdGF0aW9uSW5zdHJ1Y3Rpb25zRGVzYycsIFwiQ3VzdG9taXplIERpY3RhdGlvbiB0ZXJtaW5vbG9neSBhbmQgdHJhbnNjcmlwdCBmb3JtYXR0aW5nIHdpdGggZGljdGF0aW9uLm1kLlwiKSxcblx0XHRcdGNvbW1hbmRJZDogQ09ORklHVVJFX0RJQ1RBVElPTl9JTlNUUlVDVElPTlNfQUNUSU9OX0lELFxuXHRcdH0sXG5cdF07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdlbGNvbWVQYWdlRmVhdHVyZXM6IElXZWxjb21lUGFnZUZlYXR1cmVzIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2FsbGJhY2tzOiBJV2VsY29tZVBhZ2VDYWxsYmFja3MsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBoYXJuZXNzTGFiZWw6IHN0cmluZyxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY29udGFpbmVyID0gJCgnLndlbGNvbWUtcHJvbXB0cy1jb250ZW50LWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuc2Nyb2xsYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudCh0aGlzLmNvbnRhaW5lciwge1xuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0dXNlU2hhZG93czogZmFsc2UsXG5cdFx0fSkpO1xuXHRcdGNvbnN0IHNjcm9sbGFibGVOb2RlID0gdGhpcy5zY3JvbGxhYmxlLmdldERvbU5vZGUoKTtcblx0XHRzY3JvbGxhYmxlTm9kZS5jbGFzc0xpc3QuYWRkKCd3ZWxjb21lLXByb21wdHMtc2Nyb2xsYWJsZScpO1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZChzY3JvbGxhYmxlTm9kZSk7XG5cblx0XHQvLyBSZS1zY2FuIHdoZW5ldmVyIHRoZSB3cmFwcGVyIGNoYW5nZXMgc2l6ZSBzbyB0aGUgc2Nyb2xsYmFyIHJlZmxlY3RzXG5cdFx0Ly8gdGhlIGN1cnJlbnQgb3ZlcmZsb3cgc3RhdGUuIHJlYnVpbGRDYXJkcygpIHNjYW5zIGFmdGVyIGNvbnRlbnQgY2hhbmdlcy5cblx0XHRjb25zdCByZXNpemVPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBET00uRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdBSUN1c3RvbWl6YXRpb25XZWxjb21lUGFnZVByb21wdExhdW5jaGVycy5zY3JvbGxhYmxlJywgKCkgPT4gdGhpcy5zY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZXNpemVPYnNlcnZlci5vYnNlcnZlKHNjcm9sbGFibGVOb2RlKSk7XG5cblx0XHRjb25zdCB3ZWxjb21lSW5uZXIgPSBET00uYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCcud2VsY29tZS1wcm9tcHRzLWlubmVyJykpO1xuXG5cdFx0dGhpcy5oZWFkaW5nID0gRE9NLmFwcGVuZCh3ZWxjb21lSW5uZXIsICQoJ2gyLndlbGNvbWUtcHJvbXB0cy1oZWFkaW5nJykpO1xuXHRcdHRoaXMudXBkYXRlSGVhZGluZygpO1xuXG5cdFx0Y29uc3Qgc3VidGl0bGUgPSBET00uYXBwZW5kKHdlbGNvbWVJbm5lciwgJCgncC53ZWxjb21lLXByb21wdHMtc3VidGl0bGUnKSk7XG5cdFx0c3VidGl0bGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnd2VsY29tZVN1YnRpdGxlJywgXCJUYWlsb3IgaG93IGFnZW50cyB3b3JrIGluIHlvdXIgcHJvamVjdHMuIENvbmZpZ3VyZSB3b3Jrc3BhY2UgY3VzdG9taXphdGlvbnMgZm9yIHRoZSBlbnRpcmUgdGVhbSwgb3IgY3JlYXRlIHBlcnNvbmFsIG9uZXMgdGhhdCBmb2xsb3cgeW91IGFjcm9zcyBwcm9qZWN0cy5cIik7XG5cblx0XHRpZiAodGhpcy53ZWxjb21lUGFnZUZlYXR1cmVzPy5zaG93R2V0dGluZ1N0YXJ0ZWRCYW5uZXIgIT09IGZhbHNlKSB7XG5cdFx0XHRjb25zdCBnZXR0aW5nU3RhcnRlZCA9IERPTS5hcHBlbmQod2VsY29tZUlubmVyLCAkKCcud2VsY29tZS1wcm9tcHRzLXByaW1hcnknKSk7XG5cdFx0XHRjb25zdCBoZWFkZXIgPSBET00uYXBwZW5kKGdldHRpbmdTdGFydGVkLCAkKCcud2VsY29tZS1wcm9tcHRzLXNlY3Rpb24tbGFiZWwnKSk7XG5cdFx0XHRjb25zdCBpY29uID0gRE9NLmFwcGVuZChoZWFkZXIsICQoJ3NwYW4ud2VsY29tZS1wcm9tcHRzLXNlY3Rpb24tbGFiZWwtaWNvbi5jb2RpY29uLmNvZGljb24tc3BhcmtsZScpKTtcblx0XHRcdGljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRjb25zdCB0aXRsZSA9IERPTS5hcHBlbmQoaGVhZGVyLCAkKCdzcGFuJykpO1xuXHRcdFx0dGl0bGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWRUaXRsZScsIFwiQ3VzdG9taXplIFlvdXIgQWdlbnRcIik7XG5cblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gRE9NLmFwcGVuZChnZXR0aW5nU3RhcnRlZCwgJCgncC53ZWxjb21lLXByb21wdHMtaW5wdXQtaGVscGVyJykpO1xuXHRcdFx0ZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWREZXNjJywgXCJEZXNjcmliZSB5b3VyIHByZWZlcmVuY2VzIGFuZCBjb252ZW50aW9ucyB0byBkcmFmdCBhZ2VudHMsIHNraWxscywgYW5kIGluc3RydWN0aW9ucy5cIik7XG5cblx0XHRcdGNvbnN0IGlucHV0Um93ID0gRE9NLmFwcGVuZChnZXR0aW5nU3RhcnRlZCwgJCgnLndlbGNvbWUtcHJvbXB0cy1pbnB1dC1yb3cnKSk7XG5cdFx0XHR0aGlzLmlucHV0Um93ID0gaW5wdXRSb3c7XG5cdFx0XHR0aGlzLmlucHV0RWxlbWVudCA9IERPTS5hcHBlbmQoaW5wdXRSb3csICQoJ2lucHV0LndlbGNvbWUtcHJvbXB0cy1pbnB1dCcpKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuXHRcdFx0dGhpcy5pbnB1dEVsZW1lbnQudHlwZSA9ICd0ZXh0Jztcblx0XHRcdHRoaXMuaW5wdXRFbGVtZW50LnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3dvcmtmbG93SW5wdXRQbGFjZWhvbGRlcicsIFwiUHJlZmVyIGNvbmNpc2UgY29tbWl0cywgdGhvcm91Z2ggcmV2aWV3cywgYW5kIHRlc3RlZCBjb2RlLi4uXCIpO1xuXHRcdFx0dGhpcy5pbnB1dEVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3dvcmtmbG93SW5wdXRBcmlhTGFiZWwnLCBcIkRlc2NyaWJlIHlvdXIgcHJlZmVyZW5jZXMgdG8gY3VzdG9taXplIHlvdXIgYWdlbnRcIikpO1xuXG5cdFx0XHRjb25zdCBzdWJtaXRCdG4gPSBET00uYXBwZW5kKGlucHV0Um93LCAkKCdidXR0b24ud2VsY29tZS1wcm9tcHRzLWlucHV0LXN1Ym1pdCcpKTtcblx0XHRcdHRoaXMuc3VibWl0QnRuID0gc3VibWl0QnRuO1xuXHRcdFx0c3VibWl0QnRuLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCd3b3JrZmxvd1N1Ym1pdEFyaWFMYWJlbCcsIFwiQ3VzdG9taXplIGFnZW50XCIpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHN1Ym1pdEJ0biwgbG9jYWxpemUoJ3dvcmtmbG93U3VibWl0VG9vbHRpcCcsIFwiT3BlbiBpbiBDaGF0XCIpKSk7XG5cdFx0XHRjb25zdCBjaGV2cm9uID0gRE9NLmFwcGVuZChzdWJtaXRCdG4sICQoJ3NwYW4uY29kaWNvbi5jb2RpY29uLWFycm93LXVwJykpO1xuXHRcdFx0Y2hldnJvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdFx0Y29uc3QgdXBkYXRlU3VibWl0U3RhdGUgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGhhc1ZhbHVlID0gISEodGhpcy5pbnB1dEVsZW1lbnQ/LnZhbHVlPy50cmltKCkpO1xuXHRcdFx0XHQoc3VibWl0QnRuIGFzIEhUTUxCdXR0b25FbGVtZW50KS5kaXNhYmxlZCA9ICFoYXNWYWx1ZTtcblx0XHRcdFx0c3VibWl0QnRuLmNsYXNzTGlzdC50b2dnbGUoJ3dlbGNvbWUtcHJvbXB0cy1pbnB1dC1zdWJtaXQtZGlzYWJsZWQnLCAhaGFzVmFsdWUpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgc3VibWl0ID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuaW5wdXRFbGVtZW50Py52YWx1ZT8udHJpbSgpO1xuXHRcdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCBxdWVyeTogc3RyaW5nO1xuXHRcdFx0XHRpZiAodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdFx0XHRxdWVyeSA9IGBHZW5lcmF0ZSBhZ2VudCBjdXN0b21pemF0aW9ucy4gJHt2YWx1ZX1gO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHF1ZXJ5ID0gYC9pbml0ICR7dmFsdWV9YDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNob3cgY29uZmlybWF0aW9uIGltbWVkaWF0ZWx5IFx1MjAxNCBiZWZvcmUgcHJlZmlsbENoYXQgc28gaXQncyB2aXNpYmxlXG5cdFx0XHRcdC8vIGV2ZW4gaWYgcHJlZmlsbENoYXQgbmF2aWdhdGVzIGZvY3VzIGF3YXkgZnJvbSB0aGlzIGVkaXRvclxuXHRcdFx0XHRpZiAodGhpcy5pbnB1dEVsZW1lbnQpIHtcblx0XHRcdFx0XHR0aGlzLmlucHV0RWxlbWVudC52YWx1ZSA9ICcnO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHVwZGF0ZVN1Ym1pdFN0YXRlKCk7XG5cdFx0XHRcdGlucHV0Um93LmNsYXNzTGlzdC5hZGQoJ3NlbnQnKTtcblx0XHRcdFx0c3VibWl0QnRuLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdGlmICh0aGlzLnNlbnRMYWJlbCkge1xuXHRcdFx0XHRcdHRoaXMuc2VudExhYmVsLnJlbW92ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuc2VudExhYmVsID0gRE9NLmFwcGVuZChpbnB1dFJvdywgJCgnc3Bhbi53ZWxjb21lLXByb21wdHMtc2VudC1sYWJlbCcpKTtcblx0XHRcdFx0dGhpcy5zZW50TGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnc2VudFRvQ2hhdCcsIFwiU2VudCB0byBjaGF0IFxcdTI3MTNcIik7XG5cblx0XHRcdFx0dGhpcy5jYWxsYmFja3MucHJlZmlsbENoYXQocXVlcnksIHsgaXNQYXJ0aWFsUXVlcnk6IGZhbHNlLCBuZXdDaGF0OiB0cnVlIH0pO1xuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihzdWJtaXRCdG4sICdjbGljaycsIGUgPT4geyBlLnN0b3BQcm9wYWdhdGlvbigpOyBzdWJtaXQoKTsgfSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmlucHV0RWxlbWVudCwgJ2tleWRvd24nLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0c3VibWl0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5pbnB1dEVsZW1lbnQsICdpbnB1dCcsICgpID0+IHtcblx0XHRcdFx0dXBkYXRlU3VibWl0U3RhdGUoKTtcblx0XHRcdFx0Ly8gVHlwaW5nIHJlc3RvcmVzIHRoZSBpbnB1dCByb3cgZnJvbSBzZW50IHN0YXRlXG5cdFx0XHRcdHRoaXMuX2NsZWFyU2VudFN0YXRlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR1cGRhdGVTdWJtaXRTdGF0ZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuY2FyZHNDb250YWluZXIgPSBET00uYXBwZW5kKHdlbGNvbWVJbm5lciwgJCgnLndlbGNvbWUtcHJvbXB0cy1jYXJkcycpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyU2VudFN0YXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNlbnRMYWJlbCkge1xuXHRcdFx0dGhpcy5zZW50TGFiZWwucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLnNlbnRMYWJlbCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuc3VibWl0QnRuKSB7XG5cdFx0XHR0aGlzLnN1Ym1pdEJ0bi5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmlucHV0Um93KSB7XG5cdFx0XHR0aGlzLmlucHV0Um93LmNsYXNzTGlzdC5yZW1vdmUoJ3NlbnQnKTtcblx0XHR9XG5cdH1cblxuXHRyZXNldCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jbGVhclNlbnRTdGF0ZSgpO1xuXHR9XG5cblx0cmVidWlsZENhcmRzKHZpc2libGVTZWN0aW9uSWRzOiBSZWFkb25seVNldDxBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbj4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY2FyZHNDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy52aXNpYmxlU2VjdGlvbklkcyA9IG5ldyBTZXQodmlzaWJsZVNlY3Rpb25JZHMpO1xuXG5cdFx0dGhpcy5jYXJkRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuY2FyZHNDb250YWluZXIpO1xuXHRcdHRoaXMuZmlyc3RDYXJkID0gdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChjb25zdCBjYXRlZ29yeSBvZiB0aGlzLmNhdGVnb3J5RGVzY3JpcHRpb25zKSB7XG5cdFx0XHRpZiAoIXZpc2libGVTZWN0aW9uSWRzLmhhcyhjYXRlZ29yeS5pZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNhcmQgPSBET00uYXBwZW5kKHRoaXMuY2FyZHNDb250YWluZXIsICQoJy53ZWxjb21lLXByb21wdHMtY2FyZCcpKTtcblx0XHRcdGNhcmQuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0XHRjYXJkLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdGlmICghdGhpcy5maXJzdENhcmQpIHtcblx0XHRcdFx0dGhpcy5maXJzdENhcmQgPSBjYXJkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjYXJkSGVhZGVyID0gRE9NLmFwcGVuZChjYXJkLCAkKCcud2VsY29tZS1wcm9tcHRzLWNhcmQtaGVhZGVyJykpO1xuXHRcdFx0Y29uc3QgaWNvbkVsID0gRE9NLmFwcGVuZChjYXJkSGVhZGVyLCAkKCcud2VsY29tZS1wcm9tcHRzLWNhcmQtaWNvbicpKTtcblx0XHRcdGljb25FbC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGNhdGVnb3J5Lmljb24pKTtcblx0XHRcdGNvbnN0IGxhYmVsRWwgPSBET00uYXBwZW5kKGNhcmRIZWFkZXIsICQoJ3NwYW4ud2VsY29tZS1wcm9tcHRzLWNhcmQtbGFiZWwnKSk7XG5cdFx0XHRsYWJlbEVsLnRleHRDb250ZW50ID0gY2F0ZWdvcnkubGFiZWw7XG5cblx0XHRcdGNvbnN0IGRlc2NFbCA9IERPTS5hcHBlbmQoY2FyZCwgJCgncC53ZWxjb21lLXByb21wdHMtY2FyZC1kZXNjcmlwdGlvbicpKTtcblx0XHRcdGRlc2NFbC50ZXh0Q29udGVudCA9IGNhdGVnb3J5LmRlc2NyaXB0aW9uO1xuXG5cdFx0XHRjb25zdCBmb290ZXIgPSBET00uYXBwZW5kKGNhcmQsICQoJy53ZWxjb21lLXByb21wdHMtY2FyZC1mb290ZXInKSk7XG5cdFx0XHRpZiAoY2F0ZWdvcnkucHJvbXB0VHlwZSkge1xuXHRcdFx0XHRjb25zdCBnZW5lcmF0ZUJ0biA9IERPTS5hcHBlbmQoZm9vdGVyLCAkKCdidXR0b24ud2VsY29tZS1wcm9tcHRzLWNhcmQtYWN0aW9uJykpO1xuXHRcdFx0XHRnZW5lcmF0ZUJ0bi50ZXh0Q29udGVudCA9IGxvY2FsaXplKCduZXcnLCBcIk5ldy4uLlwiKTtcblx0XHRcdFx0Z2VuZXJhdGVCdG4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ25ld0NhdGVnb3J5QXJpYUxhYmVsJywgXCJOZXcgezB9Li4uXCIsIGNhdGVnb3J5LmxhYmVsKSk7XG5cdFx0XHRcdHRoaXMuY2FyZERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGdlbmVyYXRlQnRuLCAnY2xpY2snLCBlID0+IHtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdHRoaXMuY2FsbGJhY2tzLmNsb3NlRWRpdG9yKCk7XG5cdFx0XHRcdFx0aWYgKHRoaXMud29ya3NwYWNlU2VydmljZS5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0eXBlTGFiZWwgPSBjYXRlZ29yeS5sYWJlbC50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL3MkLywgJycpO1xuXHRcdFx0XHRcdFx0dGhpcy5jYWxsYmFja3MucHJlZmlsbENoYXQoYENyZWF0ZSBtZSBhIGN1c3RvbSAke3R5cGVMYWJlbH0gdGhhdCBgLCB7IGlzUGFydGlhbFF1ZXJ5OiB0cnVlLCBuZXdDaGF0OiB0cnVlIH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2VuZXJhdGVDdXN0b21pemF0aW9uKGNhdGVnb3J5LnByb21wdFR5cGUhKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGJyb3dzZUJ0biA9IERPTS5hcHBlbmQoZm9vdGVyLCAkKCdidXR0b24ud2VsY29tZS1wcm9tcHRzLWNhcmQtYWN0aW9uJykpO1xuXHRcdFx0XHRicm93c2VCdG4udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYnJvd3NlJywgXCJCcm93c2UuLi5cIik7XG5cdFx0XHRcdGJyb3dzZUJ0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnYnJvd3NlQ2F0ZWdvcnlBcmlhTGFiZWwnLCBcIkJyb3dzZSB7MH0uLi5cIiwgY2F0ZWdvcnkubGFiZWwpKTtcblx0XHRcdFx0dGhpcy5jYXJkRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnJvd3NlQnRuLCAnY2xpY2snLCBlID0+IHtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdHRoaXMuY2FsbGJhY2tzLnNlbGVjdFNlY3Rpb25XaXRoTWFya2V0cGxhY2UoY2F0ZWdvcnkuaWQpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY2FyZERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNhcmQsICdjbGljaycsICgpID0+IHtcblx0XHRcdFx0dGhpcy5jYWxsYmFja3Muc2VsZWN0U2VjdGlvbihjYXRlZ29yeS5pZCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLmNhcmREaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjYXJkLCAna2V5ZG93bicsIGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHR0aGlzLmNhbGxiYWNrcy5zZWxlY3RTZWN0aW9uKGNhdGVnb3J5LmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdGZvciAoY29uc3QgY3VzdG9taXphdGlvbiBvZiB0aGlzLnN0YW5kYWxvbmVDdXN0b21pemF0aW9ucykge1xuXHRcdFx0XHR0aGlzLnJlbmRlclN0YW5kYWxvbmVDdXN0b21pemF0aW9uKGN1c3RvbWl6YXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLnByb21wdE1pZ3JhdGlvbkluZm8pIHtcblx0XHRcdHRoaXMucmVuZGVyUHJvbXB0TWlncmF0aW9uQ2FyZCgpO1xuXHRcdH1cblxuXHRcdC8vIENvbnRlbnQgY2hhbmdlZCBcdTIwMTQgcmVjb21wdXRlIHNjcm9sbCBkaW1lbnNpb25zLlxuXHRcdHRoaXMuc2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTdGFuZGFsb25lQ3VzdG9taXphdGlvbihjdXN0b21pemF0aW9uOiBJU3RhbmRhbG9uZUN1c3RvbWl6YXRpb25EZXNjcmlwdGlvbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jYXJkc0NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhcmQgPSBET00uYXBwZW5kKHRoaXMuY2FyZHNDb250YWluZXIsICQoJy53ZWxjb21lLXByb21wdHMtY2FyZCcpKTtcblx0XHRjYXJkLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXHRcdGNhcmQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdGlmICghdGhpcy5maXJzdENhcmQpIHtcblx0XHRcdHRoaXMuZmlyc3RDYXJkID0gY2FyZDtcblx0XHR9XG5cblx0XHRjb25zdCBjYXJkSGVhZGVyID0gRE9NLmFwcGVuZChjYXJkLCAkKCcud2VsY29tZS1wcm9tcHRzLWNhcmQtaGVhZGVyJykpO1xuXHRcdGNvbnN0IGljb25FbCA9IERPTS5hcHBlbmQoY2FyZEhlYWRlciwgJCgnLndlbGNvbWUtcHJvbXB0cy1jYXJkLWljb24nKSk7XG5cdFx0aWNvbkVsLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoY3VzdG9taXphdGlvbi5pY29uKSk7XG5cdFx0Y29uc3QgbGFiZWxFbCA9IERPTS5hcHBlbmQoY2FyZEhlYWRlciwgJCgnc3Bhbi53ZWxjb21lLXByb21wdHMtY2FyZC1sYWJlbCcpKTtcblx0XHRsYWJlbEVsLnRleHRDb250ZW50ID0gY3VzdG9taXphdGlvbi5sYWJlbDtcblxuXHRcdGNvbnN0IGRlc2NFbCA9IERPTS5hcHBlbmQoY2FyZCwgJCgncC53ZWxjb21lLXByb21wdHMtY2FyZC1kZXNjcmlwdGlvbicpKTtcblx0XHRkZXNjRWwudGV4dENvbnRlbnQgPSBjdXN0b21pemF0aW9uLmRlc2NyaXB0aW9uO1xuXG5cdFx0Y29uc3QgZm9vdGVyID0gRE9NLmFwcGVuZChjYXJkLCAkKCcud2VsY29tZS1wcm9tcHRzLWNhcmQtZm9vdGVyJykpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZUJ1dHRvbiA9IERPTS5hcHBlbmQoZm9vdGVyLCAkKCdidXR0b24ud2VsY29tZS1wcm9tcHRzLWNhcmQtYWN0aW9uJykpO1xuXHRcdGNvbmZpZ3VyZUJ1dHRvbi50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjb25maWd1cmUnLCBcIkNvbmZpZ3VyZS4uLlwiKTtcblx0XHRjb25maWd1cmVCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NvbmZpZ3VyZUNhdGVnb3J5QXJpYUxhYmVsJywgXCJDb25maWd1cmUgezB9Li4uXCIsIGN1c3RvbWl6YXRpb24ubGFiZWwpKTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyZSA9ICgpID0+IHtcblx0XHRcdHZvaWQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjdXN0b21pemF0aW9uLmNvbW1hbmRJZCk7XG5cdFx0fTtcblx0XHR0aGlzLmNhcmREaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb25maWd1cmVCdXR0b24sICdjbGljaycsIGUgPT4ge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGNvbmZpZ3VyZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmNhcmREaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjYXJkLCAnY2xpY2snLCBjb25maWd1cmUpKTtcblx0XHR0aGlzLmNhcmREaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjYXJkLCAna2V5ZG93bicsIGUgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRjb25maWd1cmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRzZXRQcm9tcHRNaWdyYXRpb25JbmZvKGluZm86IElQcm9tcHRNaWdyYXRpb25JbmZvIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgZGlkQ2hhbmdlID0gdGhpcy5wcm9tcHRNaWdyYXRpb25JbmZvPy50b3RhbFByb21wdENvdW50ICE9PSBpbmZvPy50b3RhbFByb21wdENvdW50XG5cdFx0XHR8fCB0aGlzLnByb21wdE1pZ3JhdGlvbkluZm8/LndvcmtzcGFjZVByb21wdENvdW50ICE9PSBpbmZvPy53b3Jrc3BhY2VQcm9tcHRDb3VudFxuXHRcdFx0fHwgdGhpcy5wcm9tcHRNaWdyYXRpb25JbmZvPy51c2VyUHJvbXB0Q291bnQgIT09IGluZm8/LnVzZXJQcm9tcHRDb3VudDtcblx0XHR0aGlzLnByb21wdE1pZ3JhdGlvbkluZm8gPSBpbmZvO1xuXHRcdGlmIChkaWRDaGFuZ2UpIHtcblx0XHRcdHRoaXMucmVidWlsZENhcmRzKHRoaXMudmlzaWJsZVNlY3Rpb25JZHMpO1xuXHRcdH1cblx0fVxuXG5cdHNldEhhcm5lc3NMYWJlbChsYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaGFybmVzc0xhYmVsID09PSBsYWJlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmhhcm5lc3NMYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMudXBkYXRlSGVhZGluZygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVIZWFkaW5nKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmhlYWRpbmcpIHtcblx0XHRcdHRoaXMuaGVhZGluZy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd3ZWxjb21lSGVhZGluZ1dpdGhIYXJuZXNzJywgXCJBZ2VudCBDdXN0b21pemF0aW9ucyBmb3IgezB9XCIsIHRoaXMuaGFybmVzc0xhYmVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclByb21wdE1pZ3JhdGlvbkNhcmQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNhcmRzQ29udGFpbmVyIHx8ICF0aGlzLnByb21wdE1pZ3JhdGlvbkluZm8pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtaWdyYXRpb25DYXJkID0gRE9NLmFwcGVuZCh0aGlzLmNhcmRzQ29udGFpbmVyLCAkKCcud2VsY29tZS1wcm9tcHRzLWNhcmQud2VsY29tZS1wcm9tcHRzLW1pZ3JhdGlvbi1jYXJkJykpO1xuXHRcdG1pZ3JhdGlvbkNhcmQuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0bWlncmF0aW9uQ2FyZC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0aWYgKCF0aGlzLmZpcnN0Q2FyZCkge1xuXHRcdFx0dGhpcy5maXJzdENhcmQgPSBtaWdyYXRpb25DYXJkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhcmRIZWFkZXIgPSBET00uYXBwZW5kKG1pZ3JhdGlvbkNhcmQsICQoJy53ZWxjb21lLXByb21wdHMtY2FyZC1oZWFkZXInKSk7XG5cdFx0Y29uc3QgaWNvbkVsID0gRE9NLmFwcGVuZChjYXJkSGVhZGVyLCAkKCcud2VsY29tZS1wcm9tcHRzLWNhcmQtaWNvbicpKTtcblx0XHRpY29uRWwuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnN5bmMpKTtcblx0XHRjb25zdCBsYWJlbEVsID0gRE9NLmFwcGVuZChjYXJkSGVhZGVyLCAkKCdzcGFuLndlbGNvbWUtcHJvbXB0cy1jYXJkLWxhYmVsJykpO1xuXHRcdGxhYmVsRWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbWlncmF0ZVByb21wdEZpbGVzJywgXCJNaWdyYXRlXCIpO1xuXG5cdFx0Y29uc3QgZGVzY0VsID0gRE9NLmFwcGVuZChtaWdyYXRpb25DYXJkLCAkKCdwLndlbGNvbWUtcHJvbXB0cy1jYXJkLWRlc2NyaXB0aW9uJykpO1xuXHRcdGRlc2NFbC50ZXh0Q29udGVudCA9IHRoaXMuZ2V0UHJvbXB0TWlncmF0aW9uRGVzY3JpcHRpb24oKTtcblxuXHRcdGNvbnN0IGZvb3RlciA9IERPTS5hcHBlbmQobWlncmF0aW9uQ2FyZCwgJCgnLndlbGNvbWUtcHJvbXB0cy1jYXJkLWZvb3RlcicpKTtcblx0XHRjb25zdCBtaWdyYXRlQnRuID0gRE9NLmFwcGVuZChmb290ZXIsICQoJ2J1dHRvbi53ZWxjb21lLXByb21wdHMtY2FyZC1hY3Rpb24nKSk7XG5cdFx0bWlncmF0ZUJ0bi50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjb252ZXJ0VG9Ta2lsbHMnLCBcIkNvbnZlcnQgdG8gU2tpbGxzLi4uXCIpO1xuXHRcdG1pZ3JhdGVCdG4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NvbnZlcnRQcm9tcHRGaWxlc0FyaWFMYWJlbCcsIFwiQ29udmVydCBwcm9tcHQgZmlsZXMgdG8gc2tpbGxzXCIpKTtcblx0XHR0aGlzLmNhcmREaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihtaWdyYXRlQnRuLCAnY2xpY2snLCBlID0+IHtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLmNhbGxiYWNrcy5taWdyYXRlUHJvbXB0RmlsZXMoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmNhcmREaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihtaWdyYXRpb25DYXJkLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmNhbGxiYWNrcy5taWdyYXRlUHJvbXB0RmlsZXMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5jYXJkRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobWlncmF0aW9uQ2FyZCwgJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0dGhpcy5jYWxsYmFja3MubWlncmF0ZVByb21wdEZpbGVzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQcm9tcHRNaWdyYXRpb25EZXNjcmlwdGlvbigpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5wcm9tcHRNaWdyYXRpb25JbmZvKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB3b3Jrc3BhY2VQcm9tcHRDb3VudCwgdXNlclByb21wdENvdW50LCB0b3RhbFByb21wdENvdW50IH0gPSB0aGlzLnByb21wdE1pZ3JhdGlvbkluZm87XG5cdFx0aWYgKHdvcmtzcGFjZVByb21wdENvdW50ID4gMCAmJiB1c2VyUHJvbXB0Q291bnQgPiAwKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoXG5cdFx0XHRcdCdwcm9tcHRNaWdyYXRpb25DYXJkRGVzY3JpcHRpb25Xb3Jrc3BhY2VBbmRVc2VyJyxcblx0XHRcdFx0XCJQcm9tcHQgZmlsZXMgYXJlIGRlcHJlY2F0ZWQgZm9yIHRoaXMgaGFybmVzcy4gRm91bmQgezB9IHByb21wdCBmaWxlcyAoezF9IHdvcmtzcGFjZSwgezJ9IGdsb2JhbCkgdGhhdCBsb2NhbCBWUyBDb2RlIGNhbiBzdGlsbCBydW4sIGJ1dCB7M30gaWdub3Jlcy4gQ29udmVydCB0aGVtIHRvIHNraWxscyB0byBrZWVwIHRoZW0gYXZhaWxhYmxlLlwiLFxuXHRcdFx0XHR0b3RhbFByb21wdENvdW50LFxuXHRcdFx0XHR3b3Jrc3BhY2VQcm9tcHRDb3VudCxcblx0XHRcdFx0dXNlclByb21wdENvdW50LFxuXHRcdFx0XHR0aGlzLmhhcm5lc3NMYWJlbCxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0aWYgKHdvcmtzcGFjZVByb21wdENvdW50ID4gMCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKFxuXHRcdFx0XHQncHJvbXB0TWlncmF0aW9uQ2FyZERlc2NyaXB0aW9uV29ya3NwYWNlJyxcblx0XHRcdFx0XCJQcm9tcHQgZmlsZXMgYXJlIGRlcHJlY2F0ZWQgZm9yIHRoaXMgaGFybmVzcy4gRm91bmQgezB9IHdvcmtzcGFjZSBwcm9tcHQgZmlsZXMgdGhhdCBsb2NhbCBWUyBDb2RlIGNhbiBzdGlsbCBydW4sIGJ1dCB7MX0gaWdub3Jlcy4gQ29udmVydCB0aGVtIHRvIHNraWxscyB0byBrZWVwIHRoZW0gYXZhaWxhYmxlLlwiLFxuXHRcdFx0XHR3b3Jrc3BhY2VQcm9tcHRDb3VudCxcblx0XHRcdFx0dGhpcy5oYXJuZXNzTGFiZWwsXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBsb2NhbGl6ZShcblx0XHRcdCdwcm9tcHRNaWdyYXRpb25DYXJkRGVzY3JpcHRpb25Vc2VyJyxcblx0XHRcdFwiUHJvbXB0IGZpbGVzIGFyZSBkZXByZWNhdGVkIGZvciB0aGlzIGhhcm5lc3MuIEZvdW5kIHswfSBnbG9iYWwgcHJvbXB0IGZpbGVzIHRoYXQgbG9jYWwgVlMgQ29kZSBjYW4gc3RpbGwgcnVuLCBidXQgezF9IGlnbm9yZXMuIENvbnZlcnQgdGhlbSB0byBza2lsbHMgdG8ga2VlcCB0aGVtIGF2YWlsYWJsZS5cIixcblx0XHRcdHVzZXJQcm9tcHRDb3VudCxcblx0XHRcdHRoaXMuaGFybmVzc0xhYmVsLFxuXHRcdCk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHQvLyBQcmVmZXIgdGhlIHByb21wdCBpbnB1dCBzbyBzY3JlZW4gcmVhZGVyIC8ga2V5Ym9hcmQgdXNlcnMgbGFuZCBvbiBhIG1lYW5pbmdmdWxcblx0XHQvLyBjb250cm9sLiBJZiB0aGUgaW5wdXQgaXNuJ3QgcmVuZGVyZWQgKGUuZy4gd2hlbiB0aGUgZ2V0dGluZy1zdGFydGVkIGJhbm5lciBpc1xuXHRcdC8vIGRpc2FibGVkKSwgZmFsbCBiYWNrIHRvIHRoZSBmaXJzdCBmb2N1c2FibGUgY2FyZCBzbyBmb2N1cyBzdGF5cyBpbnNpZGUgdGhlXG5cdFx0Ly8gd2VsY29tZSBwYWdlIHJhdGhlciB0aGFuIGVzY2FwaW5nIHRvIHRoZSBzdXJyb3VuZGluZyB3b3JrYmVuY2ggZWRpdG9yLlxuXHRcdGlmICh0aGlzLmlucHV0RWxlbWVudCkge1xuXHRcdFx0dGhpcy5pbnB1dEVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5maXJzdENhcmQ/LmZvY3VzKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWU7QUFFeEIsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxXQUFXLGtCQUFrQixZQUFZLFdBQVcsVUFBVSxpQkFBaUI7QUFFeEYsU0FBUyxtQkFBbUI7QUFHNUIsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyw0Q0FBNEMsOENBQThDO0FBRW5HLE1BQU0sSUFBSSxJQUFJO0FBaUJQLE1BQU0sa0RBQWtELFdBQWdFO0FBQUEsRUFpRjlILFlBQ0MsUUFDaUIscUJBQ0EsV0FDQSxnQkFDQSxrQkFDQSxjQUNULGNBQ1A7QUFDRCxVQUFNO0FBUFc7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNUO0FBdEZU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
