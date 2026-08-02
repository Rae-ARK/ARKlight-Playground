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
import "./media/aiCustomizationTreeView.css";
import * as dom from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { basename, dirname } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { createActionViewItem, getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ViewPane } from "../../../../workbench/browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../../workbench/common/views.js";
import { IPromptsService, PromptsStorage } from "../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js";
import { ResourceSet } from "../../../../base/common/map.js";
import { PromptsType } from "../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js";
import { agentIcon, automationIcon, extensionIcon, instructionsIcon, mcpServerIcon, pluginIcon, promptIcon, skillIcon, userIcon, workspaceIcon, builtinIcon } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js";
import { AICustomizationItemMenuId } from "./aiCustomizationTreeView.js";
import { AICustomizationManagementSection } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js";
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from "../../../../workbench/contrib/chat/common/automations/automationsEnabled.js";
import { AICustomizationManagementEditorInput } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js";
import { AICustomizationManagementEditor } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { AICustomizationSources, IAICustomizationWorkspaceService } from "../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js";
const AICustomizationIsEmptyContextKey = new RawContextKey("aiCustomization.isEmpty", true);
const AICustomizationItemTypeContextKey = new RawContextKey("aiCustomizationItemType", "");
const AICustomizationItemDisabledContextKey = new RawContextKey("aiCustomizationItemDisabled", false);
const AICustomizationItemStorageContextKey = new RawContextKey("aiCustomizationItemStorage", "");
const ROOT_ELEMENT = /* @__PURE__ */ Symbol("root");
class AICustomizationTreeDelegate {
  getHeight(_element) {
    return 22;
  }
  getTemplateId(element) {
    switch (element.type) {
      case "category":
      case "link":
        return "category";
      case "group":
        return "group";
      case "file":
        return "file";
    }
  }
}
class AICustomizationCategoryRenderer {
  constructor() {
    this.templateId = "category";
  }
  renderTemplate(container) {
    const element = dom.append(container, dom.$(".ai-customization-category"));
    const icon = dom.append(element, dom.$(".icon"));
    const label = dom.append(element, dom.$(".label"));
    return { container: element, icon, label };
  }
  renderElement(node, _index, templateData) {
    templateData.icon.className = "icon";
    templateData.icon.classList.add(...ThemeIcon.asClassNameArray(node.element.icon));
    templateData.label.textContent = node.element.label;
  }
  disposeTemplate(_templateData) {
  }
}
class AICustomizationGroupRenderer {
  constructor() {
    this.templateId = "group";
  }
  renderTemplate(container) {
    const element = dom.append(container, dom.$(".ai-customization-group-header"));
    const label = dom.append(element, dom.$(".label"));
    return { container: element, label };
  }
  renderElement(node, _index, templateData) {
    templateData.label.textContent = node.element.label;
  }
  disposeTemplate(_templateData) {
  }
}
class AICustomizationFileRenderer {
  constructor(menuService, contextKeyService, instantiationService) {
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.templateId = "file";
  }
  renderTemplate(container) {
    const element = dom.append(container, dom.$(".ai-customization-tree-item"));
    const icon = dom.append(element, dom.$(".icon"));
    const name = dom.append(element, dom.$(".name"));
    const actionsContainer = dom.append(element, dom.$(".actions"));
    const templateDisposables = new DisposableStore();
    const actionBar = templateDisposables.add(new ActionBar(actionsContainer, {
      actionViewItemProvider: createActionViewItem.bind(void 0, this.instantiationService)
    }));
    return { container: element, icon, name, actionBar, elementDisposables: new DisposableStore(), templateDisposables };
  }
  renderElement(node, _index, templateData) {
    const item = node.element;
    templateData.elementDisposables.clear();
    let icon;
    switch (item.promptType) {
      case PromptsType.agent:
        icon = agentIcon;
        break;
      case PromptsType.skill:
        icon = skillIcon;
        break;
      case PromptsType.instructions:
        icon = instructionsIcon;
        break;
      case PromptsType.prompt:
      default:
        icon = promptIcon;
        break;
    }
    templateData.icon.className = "icon";
    templateData.icon.classList.add(...ThemeIcon.asClassNameArray(icon));
    templateData.name.textContent = item.name;
    templateData.container.classList.toggle("disabled", item.disabled);
    const tooltip = item.description ? `${item.name} - ${item.description}` : item.name;
    templateData.container.title = tooltip;
    const context = {
      uri: item.uri.toString(),
      name: item.name,
      promptType: item.promptType,
      storage: item.storage
    };
    const overlay = this.contextKeyService.createOverlay([
      [AICustomizationItemTypeContextKey.key, item.promptType],
      [AICustomizationItemDisabledContextKey.key, item.disabled],
      [AICustomizationItemStorageContextKey.key, item.storage]
    ]);
    const menu = templateData.elementDisposables.add(
      this.menuService.createMenu(AICustomizationItemMenuId, overlay)
    );
    const updateActions = () => {
      const actions = menu.getActions({ arg: context, shouldForwardArgs: true });
      const { primary } = getContextMenuActions(actions, "inline");
      templateData.actionBar.clear();
      templateData.actionBar.push(primary, { icon: true, label: false });
    };
    updateActions();
    templateData.elementDisposables.add(menu.onDidChange(updateActions));
    templateData.actionBar.context = context;
  }
  disposeElement(_node, _index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
    templateData.elementDisposables.dispose();
  }
}
class UnifiedAICustomizationDataSource {
  constructor(promptsService, logService, onItemCountChanged, isAutomationsEnabled) {
    this.promptsService = promptsService;
    this.logService = logService;
    this.onItemCountChanged = onItemCountChanged;
    this.isAutomationsEnabled = isAutomationsEnabled;
    this.cache = /* @__PURE__ */ new Map();
    this.totalItemCount = 0;
  }
  /**
   * Clears the cache. Should be called when the view refreshes.
   */
  clearCache() {
    this.cache.clear();
    this.totalItemCount = 0;
  }
  hasChildren(element) {
    if (element === ROOT_ELEMENT) {
      return true;
    }
    if (element.type === "link") {
      return false;
    }
    return element.type === "category" || element.type === "group";
  }
  async getChildren(element) {
    try {
      if (element === ROOT_ELEMENT) {
        return this.getTypeCategories();
      }
      if (element.type === "category") {
        return this.getStorageGroups(element.promptType);
      }
      if (element.type === "group") {
        return this.getFilesForStorageAndType(element.storage, element.promptType);
      }
      return [];
    } catch (error) {
      this.logService.error("[AICustomization] Error fetching tree children:", error);
      return [];
    }
  }
  getTypeCategories() {
    const items = [
      {
        type: "category",
        id: "category-agents",
        label: localize("customAgents", "Custom Agents"),
        promptType: PromptsType.agent,
        icon: agentIcon
      },
      {
        type: "category",
        id: "category-skills",
        label: localize("skills", "Skills"),
        promptType: PromptsType.skill,
        icon: skillIcon
      },
      {
        type: "category",
        id: "category-instructions",
        label: localize("instructions", "Instructions"),
        promptType: PromptsType.instructions,
        icon: instructionsIcon
      }
    ];
    if (this.isAutomationsEnabled()) {
      items.push({
        type: "link",
        id: "link-automations",
        label: localize("automations", "Automations"),
        icon: automationIcon,
        section: AICustomizationManagementSection.Automations
      });
    }
    items.push(
      {
        type: "link",
        id: "link-mcp-servers",
        label: localize("mcpServers", "MCP Servers"),
        icon: mcpServerIcon,
        section: AICustomizationManagementSection.McpServers
      }
    );
    return items;
  }
  /**
   * Fetches and caches data for a prompt type, returning storage groups with items.
   */
  async getStorageGroups(promptType) {
    const groups = [];
    let cached = this.cache.get(promptType);
    if (!cached) {
      cached = {};
      this.cache.set(promptType, cached);
    }
    if (promptType === PromptsType.skill) {
      if (!cached.skills) {
        const skills = await this.promptsService.findAgentSkills(CancellationToken.None);
        cached.skills = skills || [];
        this.totalItemCount += cached.skills.length;
        this.onItemCountChanged(this.totalItemCount);
      }
      const workspaceSkills = cached.skills.filter((s) => s.storage === PromptsStorage.local);
      const userSkills = cached.skills.filter((s) => s.storage === PromptsStorage.user);
      const extensionSkills = cached.skills.filter((s) => s.storage === PromptsStorage.extension);
      const builtinSkills = cached.skills.filter((s) => s.storage === PromptsStorage.builtIn);
      if (workspaceSkills.length > 0) {
        groups.push(this.createGroupItem(promptType, AICustomizationSources.local, workspaceSkills.length));
      }
      if (userSkills.length > 0) {
        groups.push(this.createGroupItem(promptType, AICustomizationSources.user, userSkills.length));
      }
      if (extensionSkills.length > 0) {
        groups.push(this.createGroupItem(promptType, AICustomizationSources.extension, extensionSkills.length));
      }
      if (builtinSkills.length > 0) {
        groups.push(this.createGroupItem(promptType, AICustomizationSources.builtin, builtinSkills.length));
      }
      return groups;
    }
    if (!cached.files) {
      const allItems = [...await this.promptsService.listPromptFiles(promptType, CancellationToken.None)];
      if (promptType === PromptsType.instructions) {
        const existingUris = new ResourceSet(allItems.map((item) => item.uri));
        const agentInstructions = await this.promptsService.listAgentInstructions(CancellationToken.None);
        for (const file of agentInstructions) {
          if (!existingUris.has(file.uri)) {
            allItems.push({ uri: file.uri, storage: PromptsStorage.local, type: PromptsType.instructions });
          }
        }
      }
      const workspaceItems2 = allItems.filter((item) => item.storage === PromptsStorage.local);
      const userItems2 = allItems.filter((item) => item.storage === PromptsStorage.user);
      const extensionItems2 = allItems.filter((item) => item.storage === PromptsStorage.extension);
      const builtinItems2 = allItems.filter((item) => item.storage === PromptsStorage.builtIn);
      cached.files = /* @__PURE__ */ new Map([
        [PromptsStorage.local, workspaceItems2],
        [PromptsStorage.user, userItems2],
        [PromptsStorage.extension, extensionItems2],
        [PromptsStorage.builtIn, builtinItems2]
      ]);
      const itemCount = allItems.length;
      this.totalItemCount += itemCount;
      this.onItemCountChanged(this.totalItemCount);
    }
    const workspaceItems = cached.files.get(PromptsStorage.local) || [];
    const userItems = cached.files.get(PromptsStorage.user) || [];
    const extensionItems = cached.files.get(PromptsStorage.extension) || [];
    const builtinItems = cached.files.get(PromptsStorage.builtIn) || [];
    if (workspaceItems.length > 0) {
      groups.push(this.createGroupItem(promptType, PromptsStorage.local, workspaceItems.length));
    }
    if (userItems.length > 0) {
      groups.push(this.createGroupItem(promptType, PromptsStorage.user, userItems.length));
    }
    if (extensionItems.length > 0) {
      groups.push(this.createGroupItem(promptType, PromptsStorage.extension, extensionItems.length));
    }
    if (builtinItems.length > 0) {
      groups.push(this.createGroupItem(promptType, PromptsStorage.builtIn, builtinItems.length));
    }
    return groups;
  }
  /**
   * Creates a group item with consistent structure.
   */
  createGroupItem(promptType, storage, count) {
    const storageLabels = {
      [AICustomizationSources.local]: localize("workspaceWithCount", "Workspace ({0})", count),
      [AICustomizationSources.user]: localize("userWithCount", "User ({0})", count),
      [AICustomizationSources.extension]: localize("extensionsWithCount", "Extensions ({0})", count),
      [AICustomizationSources.plugin]: localize("pluginsWithCount", "Plugins ({0})", count),
      [AICustomizationSources.builtin]: localize("builtinWithCount", "Built-in ({0})", count)
    };
    const storageIcons = {
      [AICustomizationSources.local]: workspaceIcon,
      [AICustomizationSources.user]: userIcon,
      [AICustomizationSources.extension]: extensionIcon,
      [AICustomizationSources.plugin]: pluginIcon,
      [AICustomizationSources.builtin]: builtinIcon
    };
    const storageSuffixes = {
      [AICustomizationSources.local]: "workspace",
      [AICustomizationSources.user]: "user",
      [AICustomizationSources.extension]: "extensions",
      [AICustomizationSources.plugin]: "plugins",
      [AICustomizationSources.builtin]: "builtin"
    };
    return {
      type: "group",
      id: `group-${promptType}-${storageSuffixes[storage]}`,
      label: storageLabels[storage],
      storage,
      promptType,
      icon: storageIcons[storage]
    };
  }
  /**
   * Returns files for a specific storage/type combination from cache.
   * getStorageGroups must be called first to populate the cache.
   */
  async getFilesForStorageAndType(storage, promptType) {
    const cached = this.cache.get(promptType);
    const disabledUris = this.promptsService.getDisabledPromptFiles(promptType);
    if (promptType === PromptsType.skill) {
      const skills = cached?.skills || [];
      const filtered = skills.filter((skill) => skill.storage === storage);
      const seenUris = /* @__PURE__ */ new Set();
      const result = filtered.map((skill) => {
        seenUris.add(skill.uri.toString());
        const skillName = skill.name || basename(dirname(skill.uri)) || basename(skill.uri);
        return {
          type: "file",
          id: skill.uri.toString(),
          uri: skill.uri,
          name: skillName,
          description: skill.description,
          storage: skill.storage,
          promptType,
          disabled: disabledUris.has(skill.uri)
        };
      });
      if (disabledUris.size > 0) {
        const allSkillFiles = await this.promptsService.listPromptFiles(PromptsType.skill, CancellationToken.None);
        for (const file of allSkillFiles) {
          if (file.storage === storage && !seenUris.has(file.uri.toString()) && disabledUris.has(file.uri)) {
            result.push({
              type: "file",
              id: file.uri.toString(),
              uri: file.uri,
              name: file.name || basename(dirname(file.uri)) || basename(file.uri),
              description: file.description,
              storage: file.storage,
              promptType,
              disabled: true
            });
          }
        }
      }
      return result;
    }
    const items = [...cached?.files?.get(storage) || []];
    return items.map((item) => ({
      type: "file",
      id: item.uri.toString(),
      uri: item.uri,
      name: item.name || basename(item.uri),
      description: item.description,
      storage: item.storage,
      promptType,
      disabled: disabledUris.has(item.uri)
    }));
  }
}
let AICustomizationViewPane = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, promptsService, editorService, menuService, logService, workspaceContextService, workspaceService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.promptsService = promptsService;
    this.editorService = editorService;
    this.menuService = menuService;
    this.logService = logService;
    this.workspaceContextService = workspaceContextService;
    this.workspaceService = workspaceService;
    this.treeDisposables = this._register(new DisposableStore());
    this.isEmptyContextKey = AICustomizationIsEmptyContextKey.bindTo(contextKeyService);
    this.itemTypeContextKey = AICustomizationItemTypeContextKey.bindTo(contextKeyService);
    this.itemDisabledContextKey = AICustomizationItemDisabledContextKey.bindTo(contextKeyService);
    this.itemStorageContextKey = AICustomizationItemStorageContextKey.bindTo(contextKeyService);
    this._register(this.promptsService.onDidChangeCustomAgents(() => this.refresh()));
    this._register(this.promptsService.onDidChangeSlashCommands(() => this.refresh()));
    this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.refresh()));
    this._register(autorun((reader) => {
      this.workspaceService.activeProjectRoot.read(reader);
      this.refresh();
    }));
  }
  renderBody(container) {
    super.renderBody(container);
    container.classList.add("ai-customization-view");
    this.treeContainer = dom.append(container, dom.$(".tree-container"));
    this.createTree();
  }
  createTree() {
    if (!this.treeContainer) {
      return;
    }
    this.dataSource = new UnifiedAICustomizationDataSource(
      this.promptsService,
      this.logService,
      (count) => this.isEmptyContextKey.set(count === 0),
      () => this.configurationService.getValue(CHAT_AUTOMATIONS_ENABLED_SETTING) === true
    );
    this.tree = this.treeDisposables.add(this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "AICustomization",
      this.treeContainer,
      new AICustomizationTreeDelegate(),
      [
        new AICustomizationCategoryRenderer(),
        new AICustomizationGroupRenderer(),
        new AICustomizationFileRenderer(this.menuService, this.contextKeyService, this.instantiationService)
      ],
      this.dataSource,
      {
        identityProvider: {
          getId: (element) => element.id
        },
        accessibilityProvider: {
          getAriaLabel: (element) => {
            if (element.type === "category" || element.type === "link") {
              return element.label;
            }
            if (element.type === "group") {
              return element.label;
            }
            const nameAndDesc = element.description ? localize("fileAriaLabel", "{0}, {1}", element.name, element.description) : element.name;
            return element.disabled ? localize("fileAriaLabelDisabled", "{0}, disabled", nameAndDesc) : nameAndDesc;
          },
          getWidgetAriaLabel: () => localize("aiCustomizationTree", "Chat Customization Items")
        },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (element) => {
            if (element.type === "file") {
              return element.name;
            }
            return element.label;
          }
        }
      }
    ));
    this.treeDisposables.add(this.tree.onDidOpen(async (e) => {
      if (e.element && e.element.type === "file") {
        this.editorService.openEditor({
          resource: e.element.uri
        });
      } else if (e.element && e.element.type === "link") {
        const input = AICustomizationManagementEditorInput.getOrCreate();
        const editor = await this.editorService.openEditor(input, { pinned: true });
        if (editor instanceof AICustomizationManagementEditor) {
          editor.selectSectionById(e.element.section);
        }
      }
    }));
    this.treeDisposables.add(this.tree.onContextMenu((e) => this.onContextMenu(e)));
    void this.tree.setInput(ROOT_ELEMENT).then(() => this.autoExpandCategories());
  }
  async autoExpandCategories() {
    if (!this.tree) {
      return;
    }
    const rootNode = this.tree.getNode(ROOT_ELEMENT);
    for (const child of rootNode.children) {
      if (child.element !== ROOT_ELEMENT) {
        await this.tree.expand(child.element);
      }
    }
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.tree?.layout(height, width);
  }
  refresh() {
    this.dataSource?.clearCache();
    this.isEmptyContextKey.set(true);
    void this.tree?.setInput(ROOT_ELEMENT).then(() => this.autoExpandCategories());
  }
  collapseAll() {
    this.tree?.collapseAll();
  }
  expandAll() {
    this.tree?.expandAll();
  }
  onContextMenu(e) {
    if (!e.element || e.element.type !== "file") {
      return;
    }
    const element = e.element;
    this.itemTypeContextKey.set(element.promptType);
    this.itemDisabledContextKey.set(element.disabled);
    this.itemStorageContextKey.set(element.storage);
    const context = {
      uri: element.uri.toString(),
      name: element.name,
      promptType: element.promptType,
      disabled: element.disabled
    };
    const menu = this.menuService.getMenuActions(AICustomizationItemMenuId, this.contextKeyService, { arg: context, shouldForwardArgs: true });
    const { secondary } = getContextMenuActions(menu, "inline");
    if (secondary.length > 0) {
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => secondary,
        getActionsContext: () => context,
        onHide: () => {
          this.itemTypeContextKey.reset();
          this.itemDisabledContextKey.reset();
          this.itemStorageContextKey.reset();
        }
      });
    }
  }
};
AICustomizationViewPane.ID = "aiCustomization.view";
AICustomizationViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IPromptsService),
  __decorateParam(11, IEditorService),
  __decorateParam(12, IMenuService),
  __decorateParam(13, ILogService),
  __decorateParam(14, IWorkspaceContextService),
  __decorateParam(15, IAICustomizationWorkspaceService)
], AICustomizationViewPane);
export {
  AICustomizationIsEmptyContextKey,
  AICustomizationItemDisabledContextKey,
  AICustomizationItemStorageContextKey,
  AICustomizationItemTypeContextKey,
  AICustomizationViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYWlDdXN0b21pemF0aW9uVHJlZVZpZXcvYnJvd3Nlci9haUN1c3RvbWl6YXRpb25UcmVlVmlld1ZpZXdzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2FpQ3VzdG9taXphdGlvblRyZWVWaWV3LmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb25WaWV3SXRlbSwgZ2V0Q29udGV4dE1lbnVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQXN5bmNEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3UGFuZU9wdGlvbnMsIFZpZXdQYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlLCBQcm9tcHRzU3RvcmFnZSwgSUFnZW50U2tpbGwsIElQcm9tcHRQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgYWdlbnRJY29uLCBhdXRvbWF0aW9uSWNvbiwgZXh0ZW5zaW9uSWNvbiwgaW5zdHJ1Y3Rpb25zSWNvbiwgbWNwU2VydmVySWNvbiwgcGx1Z2luSWNvbiwgcHJvbXB0SWNvbiwgc2tpbGxJY29uLCB1c2VySWNvbiwgd29ya3NwYWNlSWNvbiwgYnVpbHRpbkljb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbkljb25zLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbkl0ZW1NZW51SWQgfSBmcm9tICcuL2FpQ3VzdG9taXphdGlvblRyZWVWaWV3LmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IENIQVRfQVVUT01BVElPTlNfRU5BQkxFRF9TRVRUSU5HIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbnNFbmFibGVkLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUFzeW5jRGF0YVNvdXJjZSwgSVRyZWVOb2RlLCBJVHJlZVJlbmRlcmVyLCBJVHJlZUNvbnRleHRNZW51RXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IEZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25Tb3VyY2UsIEFJQ3VzdG9taXphdGlvblNvdXJjZXMsIElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5cbi8vI3JlZ2lvbiBDb250ZXh0IEtleXNcblxuLyoqXG4gKiBDb250ZXh0IGtleSBpbmRpY2F0aW5nIHdoZXRoZXIgdGhlIEFJIEN1c3RvbWl6YXRpb24gdmlldyBoYXMgbm8gaXRlbXMuXG4gKi9cbmV4cG9ydCBjb25zdCBBSUN1c3RvbWl6YXRpb25Jc0VtcHR5Q29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdhaUN1c3RvbWl6YXRpb24uaXNFbXB0eScsIHRydWUpO1xuXG4vKipcbiAqIENvbnRleHQga2V5IGZvciB0aGUgY3VycmVudCBpdGVtJ3MgcHJvbXB0IHR5cGUgaW4gY29udGV4dCBtZW51cy5cbiAqL1xuZXhwb3J0IGNvbnN0IEFJQ3VzdG9taXphdGlvbkl0ZW1UeXBlQ29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PHN0cmluZz4oJ2FpQ3VzdG9taXphdGlvbkl0ZW1UeXBlJywgJycpO1xuXG4vKipcbiAqIENvbnRleHQga2V5IGluZGljYXRpbmcgd2hldGhlciB0aGUgY3VycmVudCBpdGVtIGlzIGRpc2FibGVkLlxuICovXG5leHBvcnQgY29uc3QgQUlDdXN0b21pemF0aW9uSXRlbURpc2FibGVkQ29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdhaUN1c3RvbWl6YXRpb25JdGVtRGlzYWJsZWQnLCBmYWxzZSk7XG5cbi8qKlxuICogQ29udGV4dCBrZXkgZm9yIHRoZSBjdXJyZW50IGl0ZW0ncyBzdG9yYWdlIHR5cGUgaW4gY29udGV4dCBtZW51cy5cbiAqL1xuZXhwb3J0IGNvbnN0IEFJQ3VzdG9taXphdGlvbkl0ZW1TdG9yYWdlQ29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PHN0cmluZz4oJ2FpQ3VzdG9taXphdGlvbkl0ZW1TdG9yYWdlJywgJycpO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFRyZWUgSXRlbSBUeXBlc1xuXG4vKipcbiAqIFJvb3QgZWxlbWVudCBtYXJrZXIgZm9yIHRoZSB0cmVlLlxuICovXG5jb25zdCBST09UX0VMRU1FTlQgPSBTeW1ib2woJ3Jvb3QnKTtcbnR5cGUgUm9vdEVsZW1lbnQgPSB0eXBlb2YgUk9PVF9FTEVNRU5UO1xuXG4vKipcbiAqIFJlcHJlc2VudHMgYSB0eXBlIGNhdGVnb3J5IGluIHRoZSB0cmVlIChlLmcuLCBcIkN1c3RvbSBBZ2VudHNcIiwgXCJTa2lsbHNcIikuXG4gKi9cbmludGVyZmFjZSBJQUlDdXN0b21pemF0aW9uVHlwZUl0ZW0ge1xuXHRyZWFkb25seSB0eXBlOiAnY2F0ZWdvcnknO1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZTtcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBzdG9yYWdlIGdyb3VwIGhlYWRlciBpbiB0aGUgdHJlZSAoZS5nLiwgXCJXb3Jrc3BhY2VcIiwgXCJVc2VyXCIsIFwiRXh0ZW5zaW9uc1wiKS5cbiAqL1xuaW50ZXJmYWNlIElBSUN1c3RvbWl6YXRpb25Hcm91cEl0ZW0ge1xuXHRyZWFkb25seSB0eXBlOiAnZ3JvdXAnO1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBzdG9yYWdlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2U7XG5cdHJlYWRvbmx5IHByb21wdFR5cGU6IFByb21wdHNUeXBlO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb247XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhbiBpbmRpdmlkdWFsIEFJIGN1c3RvbWl6YXRpb24gaXRlbSAoYWdlbnQsIHNraWxsLCBpbnN0cnVjdGlvbiwgb3IgcHJvbXB0KS5cbiAqL1xuaW50ZXJmYWNlIElBSUN1c3RvbWl6YXRpb25GaWxlSXRlbSB7XG5cdHJlYWRvbmx5IHR5cGU6ICdmaWxlJztcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN0b3JhZ2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZTtcblx0cmVhZG9ubHkgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGU7XG5cdHJlYWRvbmx5IGRpc2FibGVkOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBsaW5rIGl0ZW0gdGhhdCBuYXZpZ2F0ZXMgdG8gdGhlIG1hbmFnZW1lbnQgZWRpdG9yLlxuICovXG5pbnRlcmZhY2UgSUFJQ3VzdG9taXphdGlvbkxpbmtJdGVtIHtcblx0cmVhZG9ubHkgdHlwZTogJ2xpbmsnO1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb247XG5cdHJlYWRvbmx5IHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uO1xufVxuXG50eXBlIEFJQ3VzdG9taXphdGlvblRyZWVJdGVtID0gSUFJQ3VzdG9taXphdGlvblR5cGVJdGVtIHwgSUFJQ3VzdG9taXphdGlvbkdyb3VwSXRlbSB8IElBSUN1c3RvbWl6YXRpb25GaWxlSXRlbSB8IElBSUN1c3RvbWl6YXRpb25MaW5rSXRlbTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBUcmVlIEluZnJhc3RydWN0dXJlXG5cbmNsYXNzIEFJQ3VzdG9taXphdGlvblRyZWVEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPEFJQ3VzdG9taXphdGlvblRyZWVJdGVtPiB7XG5cdGdldEhlaWdodChfZWxlbWVudDogQUlDdXN0b21pemF0aW9uVHJlZUl0ZW0pOiBudW1iZXIge1xuXHRcdHJldHVybiAyMjtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogQUlDdXN0b21pemF0aW9uVHJlZUl0ZW0pOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAoZWxlbWVudC50eXBlKSB7XG5cdFx0XHRjYXNlICdjYXRlZ29yeSc6XG5cdFx0XHRjYXNlICdsaW5rJzpcblx0XHRcdFx0cmV0dXJuICdjYXRlZ29yeSc7XG5cdFx0XHRjYXNlICdncm91cCc6XG5cdFx0XHRcdHJldHVybiAnZ3JvdXAnO1xuXHRcdFx0Y2FzZSAnZmlsZSc6XG5cdFx0XHRcdHJldHVybiAnZmlsZSc7XG5cdFx0fVxuXHR9XG59XG5cbmludGVyZmFjZSBJQ2F0ZWdvcnlUZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBpY29uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgbGFiZWw6IEhUTUxFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSUdyb3VwVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgbGFiZWw6IEhUTUxFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSUZpbGVUZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBpY29uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgbmFtZTogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5jbGFzcyBBSUN1c3RvbWl6YXRpb25DYXRlZ29yeVJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxJQUlDdXN0b21pemF0aW9uVHlwZUl0ZW0gfCBJQUlDdXN0b21pemF0aW9uTGlua0l0ZW0sIEZ1enp5U2NvcmUsIElDYXRlZ29yeVRlbXBsYXRlRGF0YT4ge1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gJ2NhdGVnb3J5JztcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUNhdGVnb3J5VGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBlbGVtZW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuYWktY3VzdG9taXphdGlvbi1jYXRlZ29yeScpKTtcblx0XHRjb25zdCBpY29uID0gZG9tLmFwcGVuZChlbGVtZW50LCBkb20uJCgnLmljb24nKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBkb20uYXBwZW5kKGVsZW1lbnQsIGRvbS4kKCcubGFiZWwnKSk7XG5cdFx0cmV0dXJuIHsgY29udGFpbmVyOiBlbGVtZW50LCBpY29uLCBsYWJlbCB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUFJQ3VzdG9taXphdGlvblR5cGVJdGVtIHwgSUFJQ3VzdG9taXphdGlvbkxpbmtJdGVtLCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNhdGVnb3J5VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gJ2ljb24nO1xuXHRcdHRlbXBsYXRlRGF0YS5pY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkobm9kZS5lbGVtZW50Lmljb24pKTtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwudGV4dENvbnRlbnQgPSBub2RlLmVsZW1lbnQubGFiZWw7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUoX3RlbXBsYXRlRGF0YTogSUNhdGVnb3J5VGVtcGxhdGVEYXRhKTogdm9pZCB7IH1cbn1cblxuY2xhc3MgQUlDdXN0b21pemF0aW9uR3JvdXBSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8SUFJQ3VzdG9taXphdGlvbkdyb3VwSXRlbSwgRnV6enlTY29yZSwgSUdyb3VwVGVtcGxhdGVEYXRhPiB7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSAnZ3JvdXAnO1xuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJR3JvdXBUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5haS1jdXN0b21pemF0aW9uLWdyb3VwLWhlYWRlcicpKTtcblx0XHRjb25zdCBsYWJlbCA9IGRvbS5hcHBlbmQoZWxlbWVudCwgZG9tLiQoJy5sYWJlbCcpKTtcblx0XHRyZXR1cm4geyBjb250YWluZXI6IGVsZW1lbnQsIGxhYmVsIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJQUlDdXN0b21pemF0aW9uR3JvdXBJdGVtLCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUdyb3VwVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnRleHRDb250ZW50ID0gbm9kZS5lbGVtZW50LmxhYmVsO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKF90ZW1wbGF0ZURhdGE6IElHcm91cFRlbXBsYXRlRGF0YSk6IHZvaWQgeyB9XG59XG5cbmNsYXNzIEFJQ3VzdG9taXphdGlvbkZpbGVSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8SUFJQ3VzdG9taXphdGlvbkZpbGVJdGVtLCBGdXp6eVNjb3JlLCBJRmlsZVRlbXBsYXRlRGF0YT4ge1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gJ2ZpbGUnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRmlsZVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLmFpLWN1c3RvbWl6YXRpb24tdHJlZS1pdGVtJykpO1xuXHRcdGNvbnN0IGljb24gPSBkb20uYXBwZW5kKGVsZW1lbnQsIGRvbS4kKCcuaWNvbicpKTtcblx0XHRjb25zdCBuYW1lID0gZG9tLmFwcGVuZChlbGVtZW50LCBkb20uJCgnLm5hbWUnKSk7XG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGRvbS5hcHBlbmQoZWxlbWVudCwgZG9tLiQoJy5hY3Rpb25zJykpO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uQmFyKGFjdGlvbnNDb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IGNyZWF0ZUFjdGlvblZpZXdJdGVtLmJpbmQodW5kZWZpbmVkLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKSxcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4geyBjb250YWluZXI6IGVsZW1lbnQsIGljb24sIG5hbWUsIGFjdGlvbkJhciwgZWxlbWVudERpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCksIHRlbXBsYXRlRGlzcG9zYWJsZXMgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElBSUN1c3RvbWl6YXRpb25GaWxlSXRlbSwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElGaWxlVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlbSA9IG5vZGUuZWxlbWVudDtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHQvLyBTZXQgaWNvbiBiYXNlZCBvbiBwcm9tcHQgdHlwZVxuXHRcdGxldCBpY29uOiBUaGVtZUljb247XG5cdFx0c3dpdGNoIChpdGVtLnByb21wdFR5cGUpIHtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuYWdlbnQ6XG5cdFx0XHRcdGljb24gPSBhZ2VudEljb247XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5za2lsbDpcblx0XHRcdFx0aWNvbiA9IHNraWxsSWNvbjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmluc3RydWN0aW9uczpcblx0XHRcdFx0aWNvbiA9IGluc3RydWN0aW9uc0ljb247XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5wcm9tcHQ6XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRpY29uID0gcHJvbXB0SWNvbjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gJ2ljb24nO1xuXHRcdHRlbXBsYXRlRGF0YS5pY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoaWNvbikpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLm5hbWUudGV4dENvbnRlbnQgPSBpdGVtLm5hbWU7XG5cblx0XHQvLyBBcHBseSBkaXNhYmxlZCBzdHlsaW5nXG5cdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsIGl0ZW0uZGlzYWJsZWQpO1xuXG5cdFx0Ly8gU2V0IHRvb2x0aXAgd2l0aCBuYW1lIGFuZCBkZXNjcmlwdGlvblxuXHRcdGNvbnN0IHRvb2x0aXAgPSBpdGVtLmRlc2NyaXB0aW9uID8gYCR7aXRlbS5uYW1lfSAtICR7aXRlbS5kZXNjcmlwdGlvbn1gIDogaXRlbS5uYW1lO1xuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIudGl0bGUgPSB0b29sdGlwO1xuXG5cdFx0Ly8gQnVpbGQgY29udGV4dCBmb3IgbWVudSBhY3Rpb25zXG5cdFx0Y29uc3QgY29udGV4dCA9IHtcblx0XHRcdHVyaTogaXRlbS51cmkudG9TdHJpbmcoKSxcblx0XHRcdG5hbWU6IGl0ZW0ubmFtZSxcblx0XHRcdHByb21wdFR5cGU6IGl0ZW0ucHJvbXB0VHlwZSxcblx0XHRcdHN0b3JhZ2U6IGl0ZW0uc3RvcmFnZSxcblx0XHR9O1xuXG5cdFx0Ly8gQ3JlYXRlIHNjb3BlZCBjb250ZXh0IGtleSBzZXJ2aWNlIHdpdGggaXRlbSB0eXBlIGZvciB3aGVuLWNsYXVzZSBmaWx0ZXJpbmdcblx0XHRjb25zdCBvdmVybGF5ID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KFtcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25JdGVtVHlwZUNvbnRleHRLZXkua2V5LCBpdGVtLnByb21wdFR5cGVdLFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvbkl0ZW1EaXNhYmxlZENvbnRleHRLZXkua2V5LCBpdGVtLmRpc2FibGVkXSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25JdGVtU3RvcmFnZUNvbnRleHRLZXkua2V5LCBpdGVtLnN0b3JhZ2VdLFxuXHRcdF0pO1xuXG5cdFx0Ly8gQ3JlYXRlIG1lbnUgYW5kIGV4dHJhY3QgaW5saW5lIGFjdGlvbnNcblx0XHRjb25zdCBtZW51ID0gdGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoXG5cdFx0XHR0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoQUlDdXN0b21pemF0aW9uSXRlbU1lbnVJZCwgb3ZlcmxheSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgdXBkYXRlQWN0aW9ucyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBtZW51LmdldEFjdGlvbnMoeyBhcmc6IGNvbnRleHQsIHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3QgeyBwcmltYXJ5IH0gPSBnZXRDb250ZXh0TWVudUFjdGlvbnMoYWN0aW9ucywgJ2lubGluZScpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5wdXNoKHByaW1hcnksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdH07XG5cdFx0dXBkYXRlQWN0aW9ucygpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG1lbnUub25EaWRDaGFuZ2UodXBkYXRlQWN0aW9ucykpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jb250ZXh0ID0gY29udGV4dDtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KF9ub2RlOiBJVHJlZU5vZGU8SUFJQ3VzdG9taXphdGlvbkZpbGVJdGVtLCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUZpbGVUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJRmlsZVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIENhY2hlZCBkYXRhIGZvciBhIHNwZWNpZmljIHByb21wdCB0eXBlLlxuICovXG5pbnRlcmZhY2UgSUNhY2hlZFR5cGVEYXRhIHtcblx0c2tpbGxzPzogSUFnZW50U2tpbGxbXTtcblx0ZmlsZXM/OiBNYXA8c3RyaW5nLCByZWFkb25seSBJUHJvbXB0UGF0aFtdPjtcbn1cblxuLyoqXG4gKiBEYXRhIHNvdXJjZSBmb3IgdGhlIEFJIEN1c3RvbWl6YXRpb24gdHJlZSB3aXRoIGVmZmljaWVudCBjYWNoaW5nLlxuICogQ2FjaGVzIGRhdGEgcGVyLXR5cGUgdG8gYXZvaWQgcmVkdW5kYW50IGZldGNoZXMgd2hlbiBleHBhbmRpbmcgZ3JvdXBzLlxuICovXG5jbGFzcyBVbmlmaWVkQUlDdXN0b21pemF0aW9uRGF0YVNvdXJjZSBpbXBsZW1lbnRzIElBc3luY0RhdGFTb3VyY2U8Um9vdEVsZW1lbnQsIEFJQ3VzdG9taXphdGlvblRyZWVJdGVtPiB7XG5cdHByaXZhdGUgY2FjaGUgPSBuZXcgTWFwPFByb21wdHNUeXBlLCBJQ2FjaGVkVHlwZURhdGE+KCk7XG5cdHByaXZhdGUgdG90YWxJdGVtQ291bnQgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJvbXB0c1NlcnZpY2U6IElQcm9tcHRzU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb25JdGVtQ291bnRDaGFuZ2VkOiAoY291bnQ6IG51bWJlcikgPT4gdm9pZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlzQXV0b21hdGlvbnNFbmFibGVkOiAoKSA9PiBib29sZWFuLFxuXHQpIHsgfVxuXG5cdC8qKlxuXHQgKiBDbGVhcnMgdGhlIGNhY2hlLiBTaG91bGQgYmUgY2FsbGVkIHdoZW4gdGhlIHZpZXcgcmVmcmVzaGVzLlxuXHQgKi9cblx0Y2xlYXJDYWNoZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNhY2hlLmNsZWFyKCk7XG5cdFx0dGhpcy50b3RhbEl0ZW1Db3VudCA9IDA7XG5cdH1cblxuXHRoYXNDaGlsZHJlbihlbGVtZW50OiBSb290RWxlbWVudCB8IEFJQ3VzdG9taXphdGlvblRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0aWYgKGVsZW1lbnQgPT09IFJPT1RfRUxFTUVOVCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdsaW5rJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gZWxlbWVudC50eXBlID09PSAnY2F0ZWdvcnknIHx8IGVsZW1lbnQudHlwZSA9PT0gJ2dyb3VwJztcblx0fVxuXG5cdGFzeW5jIGdldENoaWxkcmVuKGVsZW1lbnQ6IFJvb3RFbGVtZW50IHwgQUlDdXN0b21pemF0aW9uVHJlZUl0ZW0pOiBQcm9taXNlPEFJQ3VzdG9taXphdGlvblRyZWVJdGVtW10+IHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKGVsZW1lbnQgPT09IFJPT1RfRUxFTUVOVCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRUeXBlQ2F0ZWdvcmllcygpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWxlbWVudC50eXBlID09PSAnY2F0ZWdvcnknKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldFN0b3JhZ2VHcm91cHMoZWxlbWVudC5wcm9tcHRUeXBlKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ2dyb3VwJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRGaWxlc0ZvclN0b3JhZ2VBbmRUeXBlKGVsZW1lbnQuc3RvcmFnZSwgZWxlbWVudC5wcm9tcHRUeXBlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tBSUN1c3RvbWl6YXRpb25dIEVycm9yIGZldGNoaW5nIHRyZWUgY2hpbGRyZW46JywgZXJyb3IpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0VHlwZUNhdGVnb3JpZXMoKTogKElBSUN1c3RvbWl6YXRpb25UeXBlSXRlbSB8IElBSUN1c3RvbWl6YXRpb25MaW5rSXRlbSlbXSB7XG5cdFx0Y29uc3QgaXRlbXM6IChJQUlDdXN0b21pemF0aW9uVHlwZUl0ZW0gfCBJQUlDdXN0b21pemF0aW9uTGlua0l0ZW0pW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdjYXRlZ29yeScsXG5cdFx0XHRcdGlkOiAnY2F0ZWdvcnktYWdlbnRzJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjdXN0b21BZ2VudHMnLCBcIkN1c3RvbSBBZ2VudHNcIiksXG5cdFx0XHRcdHByb21wdFR5cGU6IFByb21wdHNUeXBlLmFnZW50LFxuXHRcdFx0XHRpY29uOiBhZ2VudEljb24sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnY2F0ZWdvcnknLFxuXHRcdFx0XHRpZDogJ2NhdGVnb3J5LXNraWxscycsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2tpbGxzJywgXCJTa2lsbHNcIiksXG5cdFx0XHRcdHByb21wdFR5cGU6IFByb21wdHNUeXBlLnNraWxsLFxuXHRcdFx0XHRpY29uOiBza2lsbEljb24sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnY2F0ZWdvcnknLFxuXHRcdFx0XHRpZDogJ2NhdGVnb3J5LWluc3RydWN0aW9ucycsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25zJywgXCJJbnN0cnVjdGlvbnNcIiksXG5cdFx0XHRcdHByb21wdFR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdFx0aWNvbjogaW5zdHJ1Y3Rpb25zSWNvbixcblx0XHRcdH0sXG5cdFx0XTtcblx0XHRpZiAodGhpcy5pc0F1dG9tYXRpb25zRW5hYmxlZCgpKSB7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0dHlwZTogJ2xpbmsnLFxuXHRcdFx0XHRpZDogJ2xpbmstYXV0b21hdGlvbnMnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2F1dG9tYXRpb25zJywgXCJBdXRvbWF0aW9uc1wiKSxcblx0XHRcdFx0aWNvbjogYXV0b21hdGlvbkljb24sXG5cdFx0XHRcdHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkF1dG9tYXRpb25zLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGl0ZW1zLnB1c2goXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdsaW5rJyxcblx0XHRcdFx0aWQ6ICdsaW5rLW1jcC1zZXJ2ZXJzJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3BTZXJ2ZXJzJywgXCJNQ1AgU2VydmVyc1wiKSxcblx0XHRcdFx0aWNvbjogbWNwU2VydmVySWNvbixcblx0XHRcdFx0c2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uTWNwU2VydmVycyxcblx0XHRcdH0sXG5cdFx0KTtcblx0XHRyZXR1cm4gaXRlbXM7XG5cdH1cblxuXHQvKipcblx0ICogRmV0Y2hlcyBhbmQgY2FjaGVzIGRhdGEgZm9yIGEgcHJvbXB0IHR5cGUsIHJldHVybmluZyBzdG9yYWdlIGdyb3VwcyB3aXRoIGl0ZW1zLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBnZXRTdG9yYWdlR3JvdXBzKHByb21wdFR5cGU6IFByb21wdHNUeXBlKTogUHJvbWlzZTxJQUlDdXN0b21pemF0aW9uR3JvdXBJdGVtW10+IHtcblx0XHRjb25zdCBncm91cHM6IElBSUN1c3RvbWl6YXRpb25Hcm91cEl0ZW1bXSA9IFtdO1xuXG5cdFx0Ly8gQ2hlY2sgY2FjaGUgZmlyc3Rcblx0XHRsZXQgY2FjaGVkID0gdGhpcy5jYWNoZS5nZXQocHJvbXB0VHlwZSk7XG5cdFx0aWYgKCFjYWNoZWQpIHtcblx0XHRcdGNhY2hlZCA9IHt9O1xuXHRcdFx0dGhpcy5jYWNoZS5zZXQocHJvbXB0VHlwZSwgY2FjaGVkKTtcblx0XHR9XG5cblx0XHQvLyBGb3Igc2tpbGxzLCB1c2UgZmluZEFnZW50U2tpbGxzIHdoaWNoIGhhcyB0aGUgcHJvcGVyIG5hbWVzIGZyb20gZnJvbnRtYXR0ZXJcblx0XHRpZiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpIHtcblx0XHRcdGlmICghY2FjaGVkLnNraWxscykge1xuXHRcdFx0XHRjb25zdCBza2lsbHMgPSBhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Y2FjaGVkLnNraWxscyA9IHNraWxscyB8fCBbXTtcblx0XHRcdFx0dGhpcy50b3RhbEl0ZW1Db3VudCArPSBjYWNoZWQuc2tpbGxzLmxlbmd0aDtcblx0XHRcdFx0dGhpcy5vbkl0ZW1Db3VudENoYW5nZWQodGhpcy50b3RhbEl0ZW1Db3VudCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZVNraWxscyA9IGNhY2hlZC5za2lsbHMuZmlsdGVyKHMgPT4gcy5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCk7XG5cdFx0XHRjb25zdCB1c2VyU2tpbGxzID0gY2FjaGVkLnNraWxscy5maWx0ZXIocyA9PiBzLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uU2tpbGxzID0gY2FjaGVkLnNraWxscy5maWx0ZXIocyA9PiBzLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbik7XG5cdFx0XHRjb25zdCBidWlsdGluU2tpbGxzID0gY2FjaGVkLnNraWxscy5maWx0ZXIocyA9PiBzLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmJ1aWx0SW4pO1xuXG5cdFx0XHRpZiAod29ya3NwYWNlU2tpbGxzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Z3JvdXBzLnB1c2godGhpcy5jcmVhdGVHcm91cEl0ZW0ocHJvbXB0VHlwZSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5sb2NhbCwgd29ya3NwYWNlU2tpbGxzLmxlbmd0aCkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHVzZXJTa2lsbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRncm91cHMucHVzaCh0aGlzLmNyZWF0ZUdyb3VwSXRlbShwcm9tcHRUeXBlLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnVzZXIsIHVzZXJTa2lsbHMubGVuZ3RoKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uU2tpbGxzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Z3JvdXBzLnB1c2godGhpcy5jcmVhdGVHcm91cEl0ZW0ocHJvbXB0VHlwZSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5leHRlbnNpb24sIGV4dGVuc2lvblNraWxscy5sZW5ndGgpKTtcblx0XHRcdH1cblx0XHRcdGlmIChidWlsdGluU2tpbGxzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Z3JvdXBzLnB1c2godGhpcy5jcmVhdGVHcm91cEl0ZW0ocHJvbXB0VHlwZSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5idWlsdGluLCBidWlsdGluU2tpbGxzLmxlbmd0aCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZ3JvdXBzO1xuXHRcdH1cblxuXHRcdC8vIEZvciBvdGhlciB0eXBlcywgZmV0Y2ggb25jZSBhbmQgY2FjaGUgZ3JvdXBlZCBieSBzdG9yYWdlXG5cdFx0aWYgKCFjYWNoZWQuZmlsZXMpIHtcblx0XHRcdGNvbnN0IGFsbEl0ZW1zOiBJUHJvbXB0UGF0aFtdID0gWy4uLmF3YWl0IHRoaXMucHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzKHByb21wdFR5cGUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpXTtcblxuXHRcdFx0Ly8gRm9yIGluc3RydWN0aW9ucywgYWxzbyBpbmNsdWRlIGFnZW50IGluc3RydWN0aW9ucyAoQUdFTlRTLm1kLCBjb3BpbG90LWluc3RydWN0aW9ucy5tZCwgQ0xBVURFLm1kLCBldGMuKVxuXHRcdFx0aWYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucykge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZ1VyaXMgPSBuZXcgUmVzb3VyY2VTZXQoYWxsSXRlbXMubWFwKGl0ZW0gPT4gaXRlbS51cmkpKTtcblx0XHRcdFx0Y29uc3QgYWdlbnRJbnN0cnVjdGlvbnMgPSBhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmxpc3RBZ2VudEluc3RydWN0aW9ucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Zm9yIChjb25zdCBmaWxlIG9mIGFnZW50SW5zdHJ1Y3Rpb25zKSB7XG5cdFx0XHRcdFx0aWYgKCFleGlzdGluZ1VyaXMuaGFzKGZpbGUudXJpKSkge1xuXHRcdFx0XHRcdFx0YWxsSXRlbXMucHVzaCh7IHVyaTogZmlsZS51cmksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZUl0ZW1zID0gYWxsSXRlbXMuZmlsdGVyKGl0ZW0gPT4gaXRlbS5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCk7XG5cdFx0XHRjb25zdCB1c2VySXRlbXMgPSBhbGxJdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSXRlbXMgPSBhbGxJdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbik7XG5cdFx0XHRjb25zdCBidWlsdGluSXRlbXMgPSBhbGxJdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmJ1aWx0SW4pO1xuXG5cdFx0XHRjYWNoZWQuZmlsZXMgPSBuZXcgTWFwPHN0cmluZywgcmVhZG9ubHkgSVByb21wdFBhdGhbXT4oW1xuXHRcdFx0XHRbUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHdvcmtzcGFjZUl0ZW1zXSxcblx0XHRcdFx0W1Byb21wdHNTdG9yYWdlLnVzZXIsIHVzZXJJdGVtc10sXG5cdFx0XHRcdFtQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIGV4dGVuc2lvbkl0ZW1zXSxcblx0XHRcdFx0W1Byb21wdHNTdG9yYWdlLmJ1aWx0SW4sIGJ1aWx0aW5JdGVtc10sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgaXRlbUNvdW50ID0gYWxsSXRlbXMubGVuZ3RoO1xuXHRcdFx0dGhpcy50b3RhbEl0ZW1Db3VudCArPSBpdGVtQ291bnQ7XG5cdFx0XHR0aGlzLm9uSXRlbUNvdW50Q2hhbmdlZCh0aGlzLnRvdGFsSXRlbUNvdW50KTtcblx0XHR9XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VJdGVtcyA9IGNhY2hlZC5maWxlcyEuZ2V0KFByb21wdHNTdG9yYWdlLmxvY2FsKSB8fCBbXTtcblx0XHRjb25zdCB1c2VySXRlbXMgPSBjYWNoZWQuZmlsZXMhLmdldChQcm9tcHRzU3RvcmFnZS51c2VyKSB8fCBbXTtcblx0XHRjb25zdCBleHRlbnNpb25JdGVtcyA9IGNhY2hlZC5maWxlcyEuZ2V0KFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbikgfHwgW107XG5cdFx0Y29uc3QgYnVpbHRpbkl0ZW1zID0gY2FjaGVkLmZpbGVzIS5nZXQoUHJvbXB0c1N0b3JhZ2UuYnVpbHRJbikgfHwgW107XG5cblx0XHRpZiAod29ya3NwYWNlSXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Z3JvdXBzLnB1c2godGhpcy5jcmVhdGVHcm91cEl0ZW0ocHJvbXB0VHlwZSwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHdvcmtzcGFjZUl0ZW1zLmxlbmd0aCkpO1xuXHRcdH1cblx0XHRpZiAodXNlckl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdGdyb3Vwcy5wdXNoKHRoaXMuY3JlYXRlR3JvdXBJdGVtKHByb21wdFR5cGUsIFByb21wdHNTdG9yYWdlLnVzZXIsIHVzZXJJdGVtcy5sZW5ndGgpKTtcblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbkl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdGdyb3Vwcy5wdXNoKHRoaXMuY3JlYXRlR3JvdXBJdGVtKHByb21wdFR5cGUsIFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiwgZXh0ZW5zaW9uSXRlbXMubGVuZ3RoKSk7XG5cdFx0fVxuXHRcdGlmIChidWlsdGluSXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Z3JvdXBzLnB1c2godGhpcy5jcmVhdGVHcm91cEl0ZW0ocHJvbXB0VHlwZSwgUHJvbXB0c1N0b3JhZ2UuYnVpbHRJbiwgYnVpbHRpbkl0ZW1zLmxlbmd0aCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBncm91cHM7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIGdyb3VwIGl0ZW0gd2l0aCBjb25zaXN0ZW50IHN0cnVjdHVyZS5cblx0ICovXG5cdHByaXZhdGUgY3JlYXRlR3JvdXBJdGVtKHByb21wdFR5cGU6IFByb21wdHNUeXBlLCBzdG9yYWdlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2UsIGNvdW50OiBudW1iZXIpOiBJQUlDdXN0b21pemF0aW9uR3JvdXBJdGVtIHtcblx0XHRjb25zdCBzdG9yYWdlTGFiZWxzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRcdFx0W0FJQ3VzdG9taXphdGlvblNvdXJjZXMubG9jYWxdOiBsb2NhbGl6ZSgnd29ya3NwYWNlV2l0aENvdW50JywgXCJXb3Jrc3BhY2UgKHswfSlcIiwgY291bnQpLFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvblNvdXJjZXMudXNlcl06IGxvY2FsaXplKCd1c2VyV2l0aENvdW50JywgXCJVc2VyICh7MH0pXCIsIGNvdW50KSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmV4dGVuc2lvbl06IGxvY2FsaXplKCdleHRlbnNpb25zV2l0aENvdW50JywgXCJFeHRlbnNpb25zICh7MH0pXCIsIGNvdW50KSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbl06IGxvY2FsaXplKCdwbHVnaW5zV2l0aENvdW50JywgXCJQbHVnaW5zICh7MH0pXCIsIGNvdW50KSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW5dOiBsb2NhbGl6ZSgnYnVpbHRpbldpdGhDb3VudCcsIFwiQnVpbHQtaW4gKHswfSlcIiwgY291bnQpLFxuXHRcdH07XG5cblx0XHRjb25zdCBzdG9yYWdlSWNvbnM6IFJlY29yZDxzdHJpbmcsIFRoZW1lSWNvbj4gPSB7XG5cdFx0XHRbQUlDdXN0b21pemF0aW9uU291cmNlcy5sb2NhbF06IHdvcmtzcGFjZUljb24sXG5cdFx0XHRbQUlDdXN0b21pemF0aW9uU291cmNlcy51c2VyXTogdXNlckljb24sXG5cdFx0XHRbQUlDdXN0b21pemF0aW9uU291cmNlcy5leHRlbnNpb25dOiBleHRlbnNpb25JY29uLFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luXTogcGx1Z2luSWNvbixcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW5dOiBidWlsdGluSWNvbixcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RvcmFnZVN1ZmZpeGVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRcdFx0W0FJQ3VzdG9taXphdGlvblNvdXJjZXMubG9jYWxdOiAnd29ya3NwYWNlJyxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnVzZXJdOiAndXNlcicsXG5cdFx0XHRbQUlDdXN0b21pemF0aW9uU291cmNlcy5leHRlbnNpb25dOiAnZXh0ZW5zaW9ucycsXG5cdFx0XHRbQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW5dOiAncGx1Z2lucycsXG5cdFx0XHRbQUlDdXN0b21pemF0aW9uU291cmNlcy5idWlsdGluXTogJ2J1aWx0aW4nLFxuXHRcdH07XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ2dyb3VwJyxcblx0XHRcdGlkOiBgZ3JvdXAtJHtwcm9tcHRUeXBlfS0ke3N0b3JhZ2VTdWZmaXhlc1tzdG9yYWdlXX1gLFxuXHRcdFx0bGFiZWw6IHN0b3JhZ2VMYWJlbHNbc3RvcmFnZV0sXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0cHJvbXB0VHlwZSxcblx0XHRcdGljb246IHN0b3JhZ2VJY29uc1tzdG9yYWdlXSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgZmlsZXMgZm9yIGEgc3BlY2lmaWMgc3RvcmFnZS90eXBlIGNvbWJpbmF0aW9uIGZyb20gY2FjaGUuXG5cdCAqIGdldFN0b3JhZ2VHcm91cHMgbXVzdCBiZSBjYWxsZWQgZmlyc3QgdG8gcG9wdWxhdGUgdGhlIGNhY2hlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBnZXRGaWxlc0ZvclN0b3JhZ2VBbmRUeXBlKHN0b3JhZ2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZSwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUpOiBQcm9taXNlPElBSUN1c3RvbWl6YXRpb25GaWxlSXRlbVtdPiB7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5jYWNoZS5nZXQocHJvbXB0VHlwZSk7XG5cdFx0Y29uc3QgZGlzYWJsZWRVcmlzID0gdGhpcy5wcm9tcHRzU2VydmljZS5nZXREaXNhYmxlZFByb21wdEZpbGVzKHByb21wdFR5cGUpO1xuXG5cdFx0Ly8gRm9yIHNraWxscywgdXNlIHRoZSBjYWNoZWQgc2tpbGxzIGRhdGEgYW5kIG1lcmdlIGluIGRpc2FibGVkIHNraWxsc1xuXHRcdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCkge1xuXHRcdFx0Y29uc3Qgc2tpbGxzID0gY2FjaGVkPy5za2lsbHMgfHwgW107XG5cdFx0XHRjb25zdCBmaWx0ZXJlZCA9IHNraWxscy5maWx0ZXIoc2tpbGwgPT4gc2tpbGwuc3RvcmFnZSA9PT0gc3RvcmFnZSk7XG5cdFx0XHRjb25zdCBzZWVuVXJpcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBJQUlDdXN0b21pemF0aW9uRmlsZUl0ZW1bXSA9IGZpbHRlcmVkXG5cdFx0XHRcdC5tYXAoc2tpbGwgPT4ge1xuXHRcdFx0XHRcdHNlZW5VcmlzLmFkZChza2lsbC51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0Ly8gVXNlIHNraWxsIG5hbWUgZnJvbSBmcm9udG1hdHRlciwgb3IgZmFsbGJhY2sgdG8gcGFyZW50IGZvbGRlciBuYW1lXG5cdFx0XHRcdFx0Y29uc3Qgc2tpbGxOYW1lID0gc2tpbGwubmFtZSB8fCBiYXNlbmFtZShkaXJuYW1lKHNraWxsLnVyaSkpIHx8IGJhc2VuYW1lKHNraWxsLnVyaSk7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHR5cGU6ICdmaWxlJyBhcyBjb25zdCxcblx0XHRcdFx0XHRcdGlkOiBza2lsbC51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdHVyaTogc2tpbGwudXJpLFxuXHRcdFx0XHRcdFx0bmFtZTogc2tpbGxOYW1lLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHNraWxsLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0c3RvcmFnZTogc2tpbGwuc3RvcmFnZSxcblx0XHRcdFx0XHRcdHByb21wdFR5cGUsXG5cdFx0XHRcdFx0XHRkaXNhYmxlZDogZGlzYWJsZWRVcmlzLmhhcyhza2lsbC51cmkpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHQvLyBJbmNsdWRlIGRpc2FibGVkIHNraWxscyBub3QgYWxyZWFkeSBpbiB0aGUgZW5hYmxlZCBsaXN0XG5cdFx0XHRpZiAoZGlzYWJsZWRVcmlzLnNpemUgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGFsbFNraWxsRmlsZXMgPSBhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5za2lsbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBhbGxTa2lsbEZpbGVzKSB7XG5cdFx0XHRcdFx0aWYgKGZpbGUuc3RvcmFnZSA9PT0gc3RvcmFnZSAmJiAhc2VlblVyaXMuaGFzKGZpbGUudXJpLnRvU3RyaW5nKCkpICYmIGRpc2FibGVkVXJpcy5oYXMoZmlsZS51cmkpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdmaWxlJyBhcyBjb25zdCxcblx0XHRcdFx0XHRcdFx0aWQ6IGZpbGUudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRcdHVyaTogZmlsZS51cmksXG5cdFx0XHRcdFx0XHRcdG5hbWU6IGZpbGUubmFtZSB8fCBiYXNlbmFtZShkaXJuYW1lKGZpbGUudXJpKSkgfHwgYmFzZW5hbWUoZmlsZS51cmkpLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZmlsZS5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdFx0c3RvcmFnZTogZmlsZS5zdG9yYWdlLFxuXHRcdFx0XHRcdFx0XHRwcm9tcHRUeXBlLFxuXHRcdFx0XHRcdFx0XHRkaXNhYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdC8vIFVzZSBjYWNoZWQgZmlsZXMgZGF0YSAoYWxyZWFkeSBmZXRjaGVkIGluIGdldFN0b3JhZ2VHcm91cHMpXG5cdFx0Y29uc3QgaXRlbXMgPSBbLi4uKGNhY2hlZD8uZmlsZXM/LmdldChzdG9yYWdlKSB8fCBbXSldO1xuXHRcdHJldHVybiBpdGVtcy5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0dHlwZTogJ2ZpbGUnIGFzIGNvbnN0LFxuXHRcdFx0aWQ6IGl0ZW0udXJpLnRvU3RyaW5nKCksXG5cdFx0XHR1cmk6IGl0ZW0udXJpLFxuXHRcdFx0bmFtZTogaXRlbS5uYW1lIHx8IGJhc2VuYW1lKGl0ZW0udXJpKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0c3RvcmFnZTogaXRlbS5zdG9yYWdlLFxuXHRcdFx0cHJvbXB0VHlwZSxcblx0XHRcdGRpc2FibGVkOiBkaXNhYmxlZFVyaXMuaGFzKGl0ZW0udXJpKSxcblx0XHR9KSk7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBVbmlmaWVkIFZpZXcgUGFuZVxuXG4vKipcbiAqIFVuaWZpZWQgdmlldyBwYW5lIGZvciBhbGwgQUkgQ3VzdG9taXphdGlvbiBpdGVtcyAoYWdlbnRzLCBza2lsbHMsIGluc3RydWN0aW9ucywgcHJvbXB0cykuXG4gKi9cbmV4cG9ydCBjbGFzcyBBSUN1c3RvbWl6YXRpb25WaWV3UGFuZSBleHRlbmRzIFZpZXdQYW5lIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2FpQ3VzdG9taXphdGlvbi52aWV3JztcblxuXHRwcml2YXRlIHRyZWU6IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8Um9vdEVsZW1lbnQsIEFJQ3VzdG9taXphdGlvblRyZWVJdGVtLCBGdXp6eVNjb3JlPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkYXRhU291cmNlOiBVbmlmaWVkQUlDdXN0b21pemF0aW9uRGF0YVNvdXJjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0cmVlQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSB0cmVlRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdC8vIENvbnRleHQga2V5cyBmb3IgY29udHJvbGxpbmcgbWVudSB2aXNpYmlsaXR5IGFuZCB3ZWxjb21lIGNvbnRlbnRcblx0cHJpdmF0ZSByZWFkb25seSBpc0VtcHR5Q29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgaXRlbVR5cGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGl0ZW1EaXNhYmxlZENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGl0ZW1TdG9yYWdlQ29udGV4dEtleTogSUNvbnRleHRLZXk8c3RyaW5nPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld1BhbmVPcHRpb25zLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVNlcnZpY2U6IElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihvcHRpb25zLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblxuXHRcdC8vIEluaXRpYWxpemUgY29udGV4dCBrZXlzXG5cdFx0dGhpcy5pc0VtcHR5Q29udGV4dEtleSA9IEFJQ3VzdG9taXphdGlvbklzRW1wdHlDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5pdGVtVHlwZUNvbnRleHRLZXkgPSBBSUN1c3RvbWl6YXRpb25JdGVtVHlwZUNvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLml0ZW1EaXNhYmxlZENvbnRleHRLZXkgPSBBSUN1c3RvbWl6YXRpb25JdGVtRGlzYWJsZWRDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5pdGVtU3RvcmFnZUNvbnRleHRLZXkgPSBBSUN1c3RvbWl6YXRpb25JdGVtU3RvcmFnZUNvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIFN1YnNjcmliZSB0byBwcm9tcHQgc2VydmljZSBldmVudHMgdG8gcmVmcmVzaCB0cmVlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wcm9tcHRzU2VydmljZS5vbkRpZENoYW5nZUN1c3RvbUFnZW50cygoKSA9PiB0aGlzLnJlZnJlc2goKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucHJvbXB0c1NlcnZpY2Uub25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzKCgpID0+IHRoaXMucmVmcmVzaCgpKSk7XG5cblx0XHQvLyBMaXN0ZW4gdG8gd29ya3NwYWNlIGZvbGRlciBjaGFuZ2VzIHRvIHJlZnJlc2ggdHJlZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCgpID0+IHRoaXMucmVmcmVzaCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmFjdGl2ZVByb2plY3RSb290LnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdH0pKTtcblxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdhaS1jdXN0b21pemF0aW9uLXZpZXcnKTtcblx0XHR0aGlzLnRyZWVDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy50cmVlLWNvbnRhaW5lcicpKTtcblxuXHRcdHRoaXMuY3JlYXRlVHJlZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUcmVlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy50cmVlQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIGRhdGEgc291cmNlIHdpdGggY2FsbGJhY2sgZm9yIHRyYWNraW5nIGl0ZW0gY291bnRcblx0XHR0aGlzLmRhdGFTb3VyY2UgPSBuZXcgVW5pZmllZEFJQ3VzdG9taXphdGlvbkRhdGFTb3VyY2UoXG5cdFx0XHR0aGlzLnByb21wdHNTZXJ2aWNlLFxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLFxuXHRcdFx0KGNvdW50KSA9PiB0aGlzLmlzRW1wdHlDb250ZXh0S2V5LnNldChjb3VudCA9PT0gMCksXG5cdFx0XHQoKSA9PiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENIQVRfQVVUT01BVElPTlNfRU5BQkxFRF9TRVRUSU5HKSA9PT0gdHJ1ZSxcblx0XHQpO1xuXG5cdFx0dGhpcy50cmVlID0gdGhpcy50cmVlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hBc3luY0RhdGFUcmVlPFJvb3RFbGVtZW50LCBBSUN1c3RvbWl6YXRpb25UcmVlSXRlbSwgRnV6enlTY29yZT4sXG5cdFx0XHQnQUlDdXN0b21pemF0aW9uJyxcblx0XHRcdHRoaXMudHJlZUNvbnRhaW5lcixcblx0XHRcdG5ldyBBSUN1c3RvbWl6YXRpb25UcmVlRGVsZWdhdGUoKSxcblx0XHRcdFtcblx0XHRcdFx0bmV3IEFJQ3VzdG9taXphdGlvbkNhdGVnb3J5UmVuZGVyZXIoKSxcblx0XHRcdFx0bmV3IEFJQ3VzdG9taXphdGlvbkdyb3VwUmVuZGVyZXIoKSxcblx0XHRcdFx0bmV3IEFJQ3VzdG9taXphdGlvbkZpbGVSZW5kZXJlcih0aGlzLm1lbnVTZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKSxcblx0XHRcdF0sXG5cdFx0XHR0aGlzLmRhdGFTb3VyY2UsXG5cdFx0XHR7XG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZDogKGVsZW1lbnQ6IEFJQ3VzdG9taXphdGlvblRyZWVJdGVtKSA9PiBlbGVtZW50LmlkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWw6IChlbGVtZW50OiBBSUN1c3RvbWl6YXRpb25UcmVlSXRlbSkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ2NhdGVnb3J5JyB8fCBlbGVtZW50LnR5cGUgPT09ICdsaW5rJykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5sYWJlbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdncm91cCcpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQubGFiZWw7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQvLyBGb3IgZmlsZXMsIGluY2x1ZGUgZGVzY3JpcHRpb24gYW5kIGRpc2FibGVkIHN0YXRlXG5cdFx0XHRcdFx0XHRjb25zdCBuYW1lQW5kRGVzYyA9IGVsZW1lbnQuZGVzY3JpcHRpb25cblx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZmlsZUFyaWFMYWJlbCcsIFwiezB9LCB7MX1cIiwgZWxlbWVudC5uYW1lLCBlbGVtZW50LmRlc2NyaXB0aW9uKVxuXHRcdFx0XHRcdFx0XHQ6IGVsZW1lbnQubmFtZTtcblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmRpc2FibGVkXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2ZpbGVBcmlhTGFiZWxEaXNhYmxlZCcsIFwiezB9LCBkaXNhYmxlZFwiLCBuYW1lQW5kRGVzYylcblx0XHRcdFx0XHRcdFx0OiBuYW1lQW5kRGVzYztcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ2FpQ3VzdG9taXphdGlvblRyZWUnLCBcIkNoYXQgQ3VzdG9taXphdGlvbiBJdGVtc1wiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsOiAoZWxlbWVudDogQUlDdXN0b21pemF0aW9uVHJlZUl0ZW0pID0+IHtcblx0XHRcdFx0XHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdmaWxlJykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5uYW1lO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQubGFiZWw7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdC8vIEhhbmRsZSBkb3VibGUtY2xpY2sgdG8gb3BlbiBmaWxlIG9yIG5hdmlnYXRlIHRvIHNlY3Rpb25cblx0XHR0aGlzLnRyZWVEaXNwb3NhYmxlcy5hZGQodGhpcy50cmVlLm9uRGlkT3Blbihhc3luYyBlID0+IHtcblx0XHRcdGlmIChlLmVsZW1lbnQgJiYgZS5lbGVtZW50LnR5cGUgPT09ICdmaWxlJykge1xuXHRcdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IGUuZWxlbWVudC51cmksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChlLmVsZW1lbnQgJiYgZS5lbGVtZW50LnR5cGUgPT09ICdsaW5rJykge1xuXHRcdFx0XHRjb25zdCBpbnB1dCA9IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dC5nZXRPckNyZWF0ZSgpO1xuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSBhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0XHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yKSB7XG5cdFx0XHRcdFx0ZWRpdG9yLnNlbGVjdFNlY3Rpb25CeUlkKGUuZWxlbWVudC5zZWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEhhbmRsZSBjb250ZXh0IG1lbnVcblx0XHR0aGlzLnRyZWVEaXNwb3NhYmxlcy5hZGQodGhpcy50cmVlLm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uQ29udGV4dE1lbnUoZSkpKTtcblxuXHRcdC8vIEluaXRpYWwgbG9hZCBhbmQgYXV0by1leHBhbmQgY2F0ZWdvcnkgbm9kZXNcblx0XHR2b2lkIHRoaXMudHJlZS5zZXRJbnB1dChST09UX0VMRU1FTlQpLnRoZW4oKCkgPT4gdGhpcy5hdXRvRXhwYW5kQ2F0ZWdvcmllcygpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYXV0b0V4cGFuZENhdGVnb3JpZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnRyZWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQXV0by1leHBhbmQgYWxsIGNhdGVnb3J5IG5vZGVzIHRvIHNob3cgc3RvcmFnZSBncm91cHNcblx0XHRjb25zdCByb290Tm9kZSA9IHRoaXMudHJlZS5nZXROb2RlKFJPT1RfRUxFTUVOVCk7XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiByb290Tm9kZS5jaGlsZHJlbikge1xuXHRcdFx0aWYgKGNoaWxkLmVsZW1lbnQgIT09IFJPT1RfRUxFTUVOVCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUuZXhwYW5kKGNoaWxkLmVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLnRyZWU/LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdHB1YmxpYyByZWZyZXNoKCk6IHZvaWQge1xuXHRcdC8vIENsZWFyIHRoZSBjYWNoZSBiZWZvcmUgcmVmcmVzaGluZ1xuXHRcdHRoaXMuZGF0YVNvdXJjZT8uY2xlYXJDYWNoZSgpO1xuXHRcdHRoaXMuaXNFbXB0eUNvbnRleHRLZXkuc2V0KHRydWUpOyAvLyBSZXNldCB1bnRpbCB3ZSBrbm93IHRoZSBjb3VudFxuXHRcdHZvaWQgdGhpcy50cmVlPy5zZXRJbnB1dChST09UX0VMRU1FTlQpLnRoZW4oKCkgPT4gdGhpcy5hdXRvRXhwYW5kQ2F0ZWdvcmllcygpKTtcblx0fVxuXG5cdHB1YmxpYyBjb2xsYXBzZUFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWU/LmNvbGxhcHNlQWxsKCk7XG5cdH1cblxuXHRwdWJsaWMgZXhwYW5kQWxsKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZT8uZXhwYW5kQWxsKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ29udGV4dE1lbnUoZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PEFJQ3VzdG9taXphdGlvblRyZWVJdGVtIHwgbnVsbD4pOiB2b2lkIHtcblx0XHQvLyBPbmx5IHNob3cgY29udGV4dCBtZW51IGZvciBmaWxlIGl0ZW1zXG5cdFx0aWYgKCFlLmVsZW1lbnQgfHwgZS5lbGVtZW50LnR5cGUgIT09ICdmaWxlJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVsZW1lbnQgPSBlLmVsZW1lbnQ7XG5cblx0XHQvLyBTZXQgY29udGV4dCBrZXlzIGZvciB0aGUgaXRlbSBzbyBtZW51IGl0ZW1zIGNhbiB1c2UgYHdoZW5gIGNsYXVzZXNcblx0XHR0aGlzLml0ZW1UeXBlQ29udGV4dEtleS5zZXQoZWxlbWVudC5wcm9tcHRUeXBlKTtcblx0XHR0aGlzLml0ZW1EaXNhYmxlZENvbnRleHRLZXkuc2V0KGVsZW1lbnQuZGlzYWJsZWQpO1xuXHRcdHRoaXMuaXRlbVN0b3JhZ2VDb250ZXh0S2V5LnNldChlbGVtZW50LnN0b3JhZ2UpO1xuXG5cdFx0Ly8gR2V0IG1lbnUgYWN0aW9ucyBmcm9tIHRoZSBtZW51IHNlcnZpY2Vcblx0XHRjb25zdCBjb250ZXh0ID0ge1xuXHRcdFx0dXJpOiBlbGVtZW50LnVyaS50b1N0cmluZygpLFxuXHRcdFx0bmFtZTogZWxlbWVudC5uYW1lLFxuXHRcdFx0cHJvbXB0VHlwZTogZWxlbWVudC5wcm9tcHRUeXBlLFxuXHRcdFx0ZGlzYWJsZWQ6IGVsZW1lbnQuZGlzYWJsZWQsXG5cdFx0fTtcblx0XHRjb25zdCBtZW51ID0gdGhpcy5tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhBSUN1c3RvbWl6YXRpb25JdGVtTWVudUlkLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB7IGFyZzogY29udGV4dCwgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSk7XG5cdFx0Y29uc3QgeyBzZWNvbmRhcnkgfSA9IGdldENvbnRleHRNZW51QWN0aW9ucyhtZW51LCAnaW5saW5lJyk7XG5cblx0XHQvLyBTaG93IHRoZSBjb250ZXh0IG1lbnVcblx0XHRpZiAoc2Vjb25kYXJ5Lmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHNlY29uZGFyeSxcblx0XHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IGNvbnRleHQsXG5cdFx0XHRcdG9uSGlkZTogKCkgPT4ge1xuXHRcdFx0XHRcdC8vIENsZWFyIHRoZSBjb250ZXh0IGtleXMgd2hlbiBtZW51IGNsb3Nlc1xuXHRcdFx0XHRcdHRoaXMuaXRlbVR5cGVDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0XHRcdFx0dGhpcy5pdGVtRGlzYWJsZWRDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0XHRcdFx0dGhpcy5pdGVtU3RvcmFnZUNvbnRleHRLZXkucmVzZXQoKTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLGVBQWU7QUFDbEMsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0IsNkJBQTZCO0FBQzVELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLG9CQUFvQixxQkFBcUI7QUFDL0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFDOUIs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
