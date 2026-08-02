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
import "./media/projectBarPart.css";
import { Part } from "../../../workbench/browser/part.js";
import { IWorkbenchLayoutService, Position } from "../../../workbench/services/layout/browser/layoutService.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../platform/workspace/common/workspace.js";
import { IHoverService } from "../../../platform/hover/browser/hover.js";
import { DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { $, addDisposableListener, append, clearNode, Dimension, EventType, getActiveDocument, getWindow } from "../../../base/browser/dom.js";
import { Emitter } from "../../../base/common/event.js";
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_BORDER, ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_INACTIVE_FOREGROUND } from "../../../workbench/common/theme.js";
import { contrastBorder } from "../../../platform/theme/common/colorRegistry.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { Codicon } from "../../../base/common/codicons.js";
import { codiconsLibrary } from "../../../base/common/codiconsLibrary.js";
import { Lazy } from "../../../base/common/lazy.js";
import { HoverPosition } from "../../../base/browser/ui/hover/hoverWidget.js";
import { GlobalCompositeBar } from "../../../workbench/browser/parts/globalCompositeBar.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { Action, Separator } from "../../../base/common/actions.js";
import { URI } from "../../../base/common/uri.js";
import { IFileDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { IPathService } from "../../../workbench/services/path/common/pathService.js";
import { IWorkspaceEditingService } from "../../../workbench/services/workspaces/common/workspaceEditing.js";
import { ILabelService } from "../../../platform/label/common/label.js";
import { basename } from "../../../base/common/resources.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { getIconRegistry } from "../../../platform/theme/common/iconRegistry.js";
import { defaultInputBoxStyles } from "../../../platform/theme/browser/defaultStyles.js";
import { WorkbenchIconSelectBox } from "../../../workbench/services/userDataProfile/browser/iconSelectBox.js";
import { localize } from "../../../nls.js";
import { AgenticParts } from "./parts.js";
const HOVER_GROUP_ID = "projectbar";
const PROJECT_BAR_FOLDERS_KEY = "workbench.agentsession.projectbar.folders";
const icons = new Lazy(() => {
  const iconDefinitions = getIconRegistry().getIcons();
  const includedChars = /* @__PURE__ */ new Set();
  const dedupedIcons = iconDefinitions.filter((e) => {
    if (e.id === codiconsLibrary.blank.id) {
      return false;
    }
    if (ThemeIcon.isThemeIcon(e.defaults)) {
      return false;
    }
    if (includedChars.has(e.defaults.fontCharacter)) {
      return false;
    }
    includedChars.add(e.defaults.fontCharacter);
    return true;
  });
  return dedupedIcons;
});
let ProjectBarPart = class extends Part {
  constructor(layoutService, themeService, storageService, workspaceContextService, fileDialogService, pathService, workspaceEditingService, labelService, hoverService, contextMenuService, quickInputService, instantiationService) {
    super(AgenticParts.PROJECTBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);
    this.storageService = storageService;
    this.workspaceContextService = workspaceContextService;
    this.fileDialogService = fileDialogService;
    this.pathService = pathService;
    this.workspaceEditingService = workspaceEditingService;
    this.labelService = labelService;
    this.hoverService = hoverService;
    this.contextMenuService = contextMenuService;
    this.quickInputService = quickInputService;
    this.instantiationService = instantiationService;
    //#region IView
    this.minimumWidth = 48;
    this.maximumWidth = 48;
    this.minimumHeight = 0;
    this.maximumHeight = Number.POSITIVE_INFINITY;
    this.entries = [];
    this.workspaceEntryDisposables = this._register(new MutableDisposable());
    this._onDidSelectWorkspace = this._register(new Emitter());
    this.onDidSelectWorkspace = this._onDidSelectWorkspace.event;
    this.globalCompositeBar = this._register(instantiationService.createInstance(
      GlobalCompositeBar,
      () => this.getContextMenuActions(),
      (theme) => ({
        activeForegroundColor: theme.getColor(ACTIVITY_BAR_FOREGROUND),
        inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_INACTIVE_FOREGROUND),
        badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
        badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
        activeBackgroundColor: void 0,
        inactiveBackgroundColor: void 0,
        activeBorderBottomColor: void 0
      }),
      {
        position: () => this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT
      }
    ));
    this.loadEntriesFromStorage();
  }
  getContextMenuActions() {
    return this.globalCompositeBar.getContextMenuActions();
  }
  loadEntriesFromStorage() {
    const raw = this.storageService.get(PROJECT_BAR_FOLDERS_KEY, StorageScope.WORKSPACE);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        this.entries = data.map((item) => {
          if (typeof item === "string") {
            const uri = URI.parse(item);
            return { uri, name: basename(uri), displayType: "letter" };
          } else {
            const uri = URI.parse(item.uri);
            return {
              uri,
              name: basename(uri),
              displayType: item.displayType ?? "letter",
              iconId: item.iconId
            };
          }
        });
      } catch {
        this.entries = [];
      }
    } else {
      this.entries = [];
    }
    const currentFolders = this.workspaceContextService.getWorkspace().folders;
    this._selectedFolderUri = currentFolders.length > 0 ? currentFolders[0].uri : void 0;
  }
  saveEntriesToStorage() {
    const data = this.entries.map((e) => ({
      uri: e.uri.toString(),
      displayType: e.displayType,
      iconId: e.iconId
    }));
    this.storageService.store(PROJECT_BAR_FOLDERS_KEY, JSON.stringify(data), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  addFolderEntry(uri) {
    if (this.entries.some((e) => e.uri.toString() === uri.toString())) {
      return;
    }
    this.entries.push({ uri, name: basename(uri), displayType: "letter" });
    this.saveEntriesToStorage();
    this._selectedFolderUri = uri;
    this.saveEntriesToStorage();
    this.applySelectedFolder();
    this._onDidSelectWorkspace.fire(this._selectedFolderUri);
    this.renderContent();
  }
  async applySelectedFolder() {
    if (!this._selectedFolderUri) {
      return;
    }
    const currentFolders = this.workspaceContextService.getWorkspace().folders;
    const foldersToRemove = currentFolders.map((f) => f.uri);
    await this.workspaceEditingService.updateFolders(
      0,
      foldersToRemove.length,
      [{ uri: this._selectedFolderUri }]
    );
  }
  createContentArea(parent) {
    this.element = parent;
    this.content = append(this.element, $(".content"));
    this.actionsContainer = append(this.content, $(".actions-container"));
    this.renderContent();
    this.globalCompositeBar.create(this.content);
    return this.content;
  }
  renderContent() {
    if (!this.actionsContainer) {
      return;
    }
    clearNode(this.actionsContainer);
    this.workspaceEntryDisposables.value = new DisposableStore();
    this.createAddFolderButton(this.actionsContainer);
    this.createWorkspaceEntries(this.actionsContainer);
  }
  createAddFolderButton(container) {
    this.addFolderButton = append(container, $(".action-item.add-folder"));
    const actionLabel = append(this.addFolderButton, $("span.action-label"));
    actionLabel.classList.add(...ThemeIcon.asClassNameArray(Codicon.add));
    this.workspaceEntryDisposables.value?.add(
      this.hoverService.setupDelayedHover(
        this.addFolderButton,
        {
          appearance: { showPointer: true },
          position: { hoverPosition: HoverPosition.RIGHT },
          content: "Add Folder to Project"
        },
        { groupId: HOVER_GROUP_ID }
      )
    );
    this.workspaceEntryDisposables.value?.add(
      addDisposableListener(this.addFolderButton, EventType.CLICK, () => {
        this.pickAndAddFolder();
      })
    );
    this.addFolderButton.setAttribute("tabindex", "0");
    this.addFolderButton.setAttribute("role", "button");
    this.addFolderButton.setAttribute("aria-label", "Add Folder to Project");
    this.workspaceEntryDisposables.value?.add(
      addDisposableListener(this.addFolderButton, EventType.KEY_DOWN, (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.pickAndAddFolder();
        }
      })
    );
  }
  async pickAndAddFolder() {
    const folders = await this.fileDialogService.showOpenDialog({
      openLabel: "Add",
      title: "Add Folder to Project",
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: await this.fileDialogService.defaultFolderPath(),
      availableFileSystems: [this.pathService.defaultUriScheme]
    });
    if (folders?.length) {
      this.addFolderEntry(folders[0]);
    }
  }
  createWorkspaceEntries(container) {
    for (let i = 0; i < this.entries.length; i++) {
      this.createWorkspaceEntry(container, this.entries[i], i);
    }
    if (this.entries.length > 0 && this._selectedFolderUri) {
      this._onDidSelectWorkspace.fire(this._selectedFolderUri);
    }
  }
  createWorkspaceEntry(container, entry, index) {
    const entryDisposables = this.workspaceEntryDisposables.value;
    const entryElement = append(container, $(".action-item.workspace-entry"));
    const actionLabel = append(entryElement, $("span.action-label.workspace-icon"));
    append(entryElement, $("span.active-item-indicator"));
    const folderName = entry.name;
    if (entry.displayType === "icon" && entry.iconId) {
      const icon = ThemeIcon.fromId(entry.iconId);
      actionLabel.classList.add(...ThemeIcon.asClassNameArray(icon));
      actionLabel.classList.add("codicon-icon");
      actionLabel.textContent = "";
    } else {
      const firstLetter = folderName.charAt(0).toUpperCase();
      actionLabel.textContent = firstLetter;
    }
    const isSelected = this._selectedFolderUri?.toString() === entry.uri.toString();
    if (isSelected) {
      entryElement.classList.add("checked");
    }
    const folderPath = this.labelService.getUriLabel(entry.uri, { relative: false });
    entryDisposables.add(
      this.hoverService.setupDelayedHover(
        entryElement,
        {
          appearance: { showPointer: true },
          position: { hoverPosition: HoverPosition.RIGHT },
          content: folderPath
        },
        { groupId: HOVER_GROUP_ID }
      )
    );
    entryDisposables.add(
      addDisposableListener(entryElement, EventType.CLICK, () => {
        this.selectWorkspace(index);
      })
    );
    entryElement.setAttribute("tabindex", "0");
    entryElement.setAttribute("role", "button");
    entryElement.setAttribute("aria-label", folderName);
    entryElement.setAttribute("aria-pressed", isSelected ? "true" : "false");
    entryDisposables.add(
      addDisposableListener(entryElement, EventType.KEY_DOWN, (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.selectWorkspace(index);
        }
      })
    );
    entryDisposables.add(
      addDisposableListener(entryElement, EventType.CONTEXT_MENU, (e) => {
        e.preventDefault();
        e.stopPropagation();
        const event = new StandardMouseEvent(getWindow(entryElement), e);
        this.contextMenuService.showContextMenu({
          getAnchor: () => event,
          getActions: () => [
            new Action("projectbar.customize", localize("projectbar.customize", "Customize"), void 0, true, () => this.showCustomizeQuickPick(index)),
            new Separator(),
            new Action("projectbar.removeFolder", localize("projectbar.removeFolder", "Remove Folder"), void 0, true, () => this.removeFolderEntry(index))
          ]
        });
      })
    );
  }
  selectWorkspace(index) {
    if (index < 0 || index >= this.entries.length) {
      return;
    }
    const entry = this.entries[index];
    if (this._selectedFolderUri?.toString() === entry.uri.toString()) {
      return;
    }
    this._selectedFolderUri = entry.uri;
    this.saveEntriesToStorage();
    this.renderContent();
    this.applySelectedFolder();
    this._onDidSelectWorkspace.fire(this._selectedFolderUri);
  }
  removeFolderEntry(index) {
    if (index < 0 || index >= this.entries.length) {
      return;
    }
    const removedUri = this.entries[index].uri;
    this.entries.splice(index, 1);
    this.saveEntriesToStorage();
    if (this._selectedFolderUri?.toString() === removedUri.toString()) {
      if (this.entries.length > 0) {
        this._selectedFolderUri = this.entries[0].uri;
        this.applySelectedFolder();
        this._onDidSelectWorkspace.fire(this._selectedFolderUri);
      } else {
        this._selectedFolderUri = void 0;
        this._onDidSelectWorkspace.fire(void 0);
      }
    }
    this.renderContent();
  }
  async showCustomizeQuickPick(index) {
    if (index < 0 || index >= this.entries.length) {
      return;
    }
    const entry = this.entries[index];
    const items = [
      {
        customType: "letter",
        label: localize("projectbar.customize.letter", "Letter"),
        description: localize("projectbar.customize.letter.description", "Show the first letter of the workspace name")
      },
      {
        customType: "icon",
        label: localize("projectbar.customize.icon", "Icon"),
        description: localize("projectbar.customize.icon.description", "Choose a codicon to represent the workspace")
      }
    ];
    const picked = await this.quickInputService.pick(items, {
      placeHolder: localize("projectbar.customize.placeholder", "Choose how to display the workspace in the project bar"),
      title: localize("projectbar.customize.title", "Customize Workspace Appearance")
    });
    if (!picked) {
      return;
    }
    if (picked.customType === "letter") {
      entry.displayType = "letter";
      entry.iconId = void 0;
      this.saveEntriesToStorage();
      this.renderContent();
    } else if (picked.customType === "icon") {
      const icon = await this.pickIcon();
      if (icon) {
        entry.displayType = "icon";
        entry.iconId = icon.id;
        this.saveEntriesToStorage();
        this.renderContent();
      }
    }
  }
  async pickIcon() {
    const iconSelectBox = this.instantiationService.createInstance(WorkbenchIconSelectBox, {
      icons: icons.value,
      inputBoxStyles: defaultInputBoxStyles
    });
    const dimension = new Dimension(486, 260);
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      disposables.add(iconSelectBox.onDidSelect((e) => {
        resolve(e);
        disposables.dispose();
        iconSelectBox.dispose();
      }));
      iconSelectBox.clearInput();
      const body = getActiveDocument().body;
      const bodyRect = body.getBoundingClientRect();
      const hoverWidget = this.hoverService.showInstantHover({
        content: iconSelectBox.domNode,
        target: {
          targetElements: [body],
          x: bodyRect.left + (bodyRect.width - dimension.width) / 2,
          y: bodyRect.top + this.layoutService.activeContainerOffset.top
        },
        position: {
          hoverPosition: HoverPosition.BELOW
        },
        persistence: {
          sticky: true
        }
      }, true);
      if (hoverWidget) {
        disposables.add(hoverWidget);
      }
      iconSelectBox.layout(dimension);
      iconSelectBox.focus();
    });
  }
  get selectedWorkspaceFolder() {
    return this._selectedFolderUri;
  }
  updateStyles() {
    super.updateStyles();
    const container = assertReturnsDefined(this.getContainer());
    const background = this.getColor(ACTIVITY_BAR_BACKGROUND) || "";
    container.style.backgroundColor = background;
    const borderColor = this.getColor(ACTIVITY_BAR_BORDER) || this.getColor(contrastBorder) || "";
    container.classList.toggle("bordered", !!borderColor);
    container.style.borderColor = borderColor ? borderColor : "";
  }
  focus() {
    this.addFolderButton?.focus();
  }
  focusGlobalCompositeBar() {
    this.globalCompositeBar.focus();
  }
  layout(width, height) {
    super.layout(width, height, 0, 0);
  }
  toJSON() {
    return {
      type: AgenticParts.PROJECTBAR_PART
    };
  }
};
ProjectBarPart.ACTION_HEIGHT = 48;
ProjectBarPart = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, IThemeService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IFileDialogService),
  __decorateParam(5, IPathService),
  __decorateParam(6, IWorkspaceEditingService),
  __decorateParam(7, ILabelService),
  __decorateParam(8, IHoverService),
  __decorateParam(9, IContextMenuService),
  __decorateParam(10, IQuickInputService),
  __decorateParam(11, IInstantiationService)
], ProjectBarPart);
export {
  ProjectBarPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2Jyb3dzZXIvcGFydHMvcHJvamVjdEJhclBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvcHJvamVjdEJhclBhcnQuY3NzJztcbmltcG9ydCB7IFBhcnQgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lLCBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFwcGVuZCwgY2xlYXJOb2RlLCBEaW1lbnNpb24sIEV2ZW50VHlwZSwgZ2V0QWN0aXZlRG9jdW1lbnQsIGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBBQ1RJVklUWV9CQVJfQkFDS0dST1VORCwgQUNUSVZJVFlfQkFSX0JBREdFX0JBQ0tHUk9VTkQsIEFDVElWSVRZX0JBUl9CQURHRV9GT1JFR1JPVU5ELCBBQ1RJVklUWV9CQVJfQk9SREVSLCBBQ1RJVklUWV9CQVJfRk9SRUdST1VORCwgQUNUSVZJVFlfQkFSX0lOQUNUSVZFX0ZPUkVHUk9VTkQgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGNvbnRyYXN0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGNvZGljb25zTGlicmFyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zTGlicmFyeS5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IEdsb2JhbENvbXBvc2l0ZUJhciB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2dsb2JhbENvbXBvc2l0ZUJhci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIEFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZUVkaXRpbmcuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBnZXRJY29uUmVnaXN0cnksIEljb25Db250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGRlZmF1bHRJbnB1dEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hJY29uU2VsZWN0Qm94IH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9icm93c2VyL2ljb25TZWxlY3RCb3guanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWdlbnRpY1BhcnRzIH0gZnJvbSAnLi9wYXJ0cy5qcyc7XG5cbmNvbnN0IEhPVkVSX0dST1VQX0lEID0gJ3Byb2plY3RiYXInO1xuY29uc3QgUFJPSkVDVF9CQVJfRk9MREVSU19LRVkgPSAnd29ya2JlbmNoLmFnZW50c2Vzc2lvbi5wcm9qZWN0YmFyLmZvbGRlcnMnO1xuXG50eXBlIFByb2plY3RCYXJFbnRyeURpc3BsYXlUeXBlID0gJ2xldHRlcicgfCAnaWNvbic7XG5cbmludGVyZmFjZSBJUHJvamVjdEJhckVudHJ5RGF0YSB7XG5cdHJlYWRvbmx5IHVyaTogc3RyaW5nO1xuXHRyZWFkb25seSBkaXNwbGF5VHlwZT86IFByb2plY3RCYXJFbnRyeURpc3BsYXlUeXBlO1xuXHRyZWFkb25seSBpY29uSWQ/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJUHJvamVjdEJhckVudHJ5IHtcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0ZGlzcGxheVR5cGU6IFByb2plY3RCYXJFbnRyeURpc3BsYXlUeXBlO1xuXHRpY29uSWQ/OiBzdHJpbmc7XG59XG5cbmNvbnN0IGljb25zID0gbmV3IExhenk8SWNvbkNvbnRyaWJ1dGlvbltdPigoKSA9PiB7XG5cdGNvbnN0IGljb25EZWZpbml0aW9ucyA9IGdldEljb25SZWdpc3RyeSgpLmdldEljb25zKCk7XG5cdGNvbnN0IGluY2x1ZGVkQ2hhcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgZGVkdXBlZEljb25zID0gaWNvbkRlZmluaXRpb25zLmZpbHRlcihlID0+IHtcblx0XHRpZiAoZS5pZCA9PT0gY29kaWNvbnNMaWJyYXJ5LmJsYW5rLmlkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChUaGVtZUljb24uaXNUaGVtZUljb24oZS5kZWZhdWx0cykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGluY2x1ZGVkQ2hhcnMuaGFzKGUuZGVmYXVsdHMuZm9udENoYXJhY3RlcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aW5jbHVkZWRDaGFycy5hZGQoZS5kZWZhdWx0cy5mb250Q2hhcmFjdGVyKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSk7XG5cdHJldHVybiBkZWR1cGVkSWNvbnM7XG59KTtcblxuLyoqXG4gKiBQcm9qZWN0QmFyUGFydCBkaXNwbGF5cyBwcm9qZWN0IGZvbGRlciBlbnRyaWVzIHN0b3JlZCBpbiB3b3Jrc3BhY2Ugc3RvcmFnZSBhbmQgYWxsb3dzIHNlbGVjdGlvbiBiZXR3ZWVuIHRoZW0uXG4gKiBXaGVuIGEgZm9sZGVyIGlzIHNlbGVjdGVkLCB0aGUgd29ya3NwYWNlIGVkaXRpbmcgc2VydmljZSBpcyB1c2VkIHRvIHJlcGxhY2UgdGhlIGN1cnJlbnQgd29ya3NwYWNlIGZvbGRlclxuICogd2l0aCB0aGUgc2VsZWN0ZWQgb25lLiBJdCBpcyBwb3NpdGlvbmVkIHRvIHRoZSBsZWZ0IG9mIHRoZSBzaWRlYmFyIGFuZCBoYXMgdGhlIHNhbWUgdmlzdWFsIHN0eWxlIGFzIHRoZSBhY3Rpdml0eSBiYXIuXG4gKiBBbHNvIGluY2x1ZGVzIGdsb2JhbCBhY3Rpdml0aWVzIChhY2NvdW50cywgc2V0dGluZ3MpIGF0IHRoZSBib3R0b20uXG4gKi9cbmV4cG9ydCBjbGFzcyBQcm9qZWN0QmFyUGFydCBleHRlbmRzIFBhcnQge1xuXG5cdHN0YXRpYyByZWFkb25seSBBQ1RJT05fSEVJR0hUID0gNDg7XG5cblx0Ly8jcmVnaW9uIElWaWV3XG5cblx0cmVhZG9ubHkgbWluaW11bVdpZHRoOiBudW1iZXIgPSA0ODtcblx0cmVhZG9ubHkgbWF4aW11bVdpZHRoOiBudW1iZXIgPSA0ODtcblx0cmVhZG9ubHkgbWluaW11bUhlaWdodDogbnVtYmVyID0gMDtcblx0cmVhZG9ubHkgbWF4aW11bUhlaWdodDogbnVtYmVyID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgY29udGVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYWN0aW9uc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYWRkRm9sZGVyQnV0dG9uOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBlbnRyaWVzOiBJUHJvamVjdEJhckVudHJ5W10gPSBbXTtcblx0cHJpdmF0ZSBfc2VsZWN0ZWRGb2xkZXJVcmk6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBnbG9iYWxDb21wb3NpdGVCYXI6IEdsb2JhbENvbXBvc2l0ZUJhcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUVudHJ5RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlbGVjdFdvcmtzcGFjZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVSSSB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2VsZWN0V29ya3NwYWNlOiBFdmVudDxVUkkgfCB1bmRlZmluZWQ+ID0gdGhpcy5fb25EaWRTZWxlY3RXb3Jrc3BhY2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlRWRpdGluZ1NlcnZpY2U6IElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoQWdlbnRpY1BhcnRzLlBST0pFQ1RCQVJfUEFSVCwgeyBoYXNUaXRsZTogZmFsc2UgfSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbGF5b3V0U2VydmljZSk7XG5cblx0XHQvLyBDcmVhdGUgdGhlIGdsb2JhbCBjb21wb3NpdGUgYmFyIGZvciBhY2NvdW50cyBhbmQgc2V0dGluZ3MgYXQgdGhlIGJvdHRvbVxuXHRcdHRoaXMuZ2xvYmFsQ29tcG9zaXRlQmFyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRHbG9iYWxDb21wb3NpdGVCYXIsXG5cdFx0XHQoKSA9PiB0aGlzLmdldENvbnRleHRNZW51QWN0aW9ucygpLFxuXHRcdFx0KHRoZW1lOiBJQ29sb3JUaGVtZSkgPT4gKHtcblx0XHRcdFx0YWN0aXZlRm9yZWdyb3VuZENvbG9yOiB0aGVtZS5nZXRDb2xvcihBQ1RJVklUWV9CQVJfRk9SRUdST1VORCksXG5cdFx0XHRcdGluYWN0aXZlRm9yZWdyb3VuZENvbG9yOiB0aGVtZS5nZXRDb2xvcihBQ1RJVklUWV9CQVJfSU5BQ1RJVkVfRk9SRUdST1VORCksXG5cdFx0XHRcdGJhZGdlQmFja2dyb3VuZDogdGhlbWUuZ2V0Q29sb3IoQUNUSVZJVFlfQkFSX0JBREdFX0JBQ0tHUk9VTkQpLFxuXHRcdFx0XHRiYWRnZUZvcmVncm91bmQ6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9CQURHRV9GT1JFR1JPVU5EKSxcblx0XHRcdFx0YWN0aXZlQmFja2dyb3VuZENvbG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdGluYWN0aXZlQmFja2dyb3VuZENvbG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdGFjdGl2ZUJvcmRlckJvdHRvbUNvbG9yOiB1bmRlZmluZWQsXG5cdFx0XHR9KSxcblx0XHRcdHtcblx0XHRcdFx0cG9zaXRpb246ICgpID0+IHRoaXMubGF5b3V0U2VydmljZS5nZXRTaWRlQmFyUG9zaXRpb24oKSA9PT0gUG9zaXRpb24uTEVGVCA/IEhvdmVyUG9zaXRpb24uUklHSFQgOiBIb3ZlclBvc2l0aW9uLkxFRlQsXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHQvLyBMb2FkIGVudHJpZXMgZnJvbSBzdG9yYWdlXG5cdFx0dGhpcy5sb2FkRW50cmllc0Zyb21TdG9yYWdlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnRleHRNZW51QWN0aW9ucygpOiBJQWN0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLmdsb2JhbENvbXBvc2l0ZUJhci5nZXRDb250ZXh0TWVudUFjdGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgbG9hZEVudHJpZXNGcm9tU3RvcmFnZSgpOiB2b2lkIHtcblx0XHRjb25zdCByYXcgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChQUk9KRUNUX0JBUl9GT0xERVJTX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0aWYgKHJhdykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZGF0YTogKHN0cmluZyB8IElQcm9qZWN0QmFyRW50cnlEYXRhKVtdID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0XHR0aGlzLmVudHJpZXMgPSBkYXRhLm1hcChpdGVtID0+IHtcblx0XHRcdFx0XHQvLyBTdXBwb3J0IGxlZ2FjeSBmb3JtYXQgKGp1c3QgVVJJcyBhcyBzdHJpbmdzKSBhbmQgbmV3IGZvcm1hdCAob2JqZWN0cyB3aXRoIGRpc3BsYXkgc2V0dGluZ3MpXG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBpdGVtID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKGl0ZW0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgdXJpLCBuYW1lOiBiYXNlbmFtZSh1cmkpLCBkaXNwbGF5VHlwZTogJ2xldHRlcicgYXMgUHJvamVjdEJhckVudHJ5RGlzcGxheVR5cGUgfTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKGl0ZW0udXJpKTtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHVyaSxcblx0XHRcdFx0XHRcdFx0bmFtZTogYmFzZW5hbWUodXJpKSxcblx0XHRcdFx0XHRcdFx0ZGlzcGxheVR5cGU6IGl0ZW0uZGlzcGxheVR5cGUgPz8gJ2xldHRlcicsXG5cdFx0XHRcdFx0XHRcdGljb25JZDogaXRlbS5pY29uSWRcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHR0aGlzLmVudHJpZXMgPSBbXTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbnRyaWVzID0gW107XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIHNlbGVjdGVkIGZvbGRlciBpcyBhbHdheXMgdGhlIGZpcnN0IHdvcmtzcGFjZSBmb2xkZXJcblx0XHRjb25zdCBjdXJyZW50Rm9sZGVycyA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHR0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSA9IGN1cnJlbnRGb2xkZXJzLmxlbmd0aCA+IDAgPyBjdXJyZW50Rm9sZGVyc1swXS51cmkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVFbnRyaWVzVG9TdG9yYWdlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGRhdGE6IElQcm9qZWN0QmFyRW50cnlEYXRhW10gPSB0aGlzLmVudHJpZXMubWFwKGUgPT4gKHtcblx0XHRcdHVyaTogZS51cmkudG9TdHJpbmcoKSxcblx0XHRcdGRpc3BsYXlUeXBlOiBlLmRpc3BsYXlUeXBlLFxuXHRcdFx0aWNvbklkOiBlLmljb25JZFxuXHRcdH0pKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFBST0pFQ1RfQkFSX0ZPTERFUlNfS0VZLCBKU09OLnN0cmluZ2lmeShkYXRhKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkRm9sZGVyRW50cnkodXJpOiBVUkkpOiB2b2lkIHtcblx0XHQvLyBEb24ndCBhZGQgZHVwbGljYXRlc1xuXHRcdGlmICh0aGlzLmVudHJpZXMuc29tZShlID0+IGUudXJpLnRvU3RyaW5nKCkgPT09IHVyaS50b1N0cmluZygpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZW50cmllcy5wdXNoKHsgdXJpLCBuYW1lOiBiYXNlbmFtZSh1cmkpLCBkaXNwbGF5VHlwZTogJ2xldHRlcicgfSk7XG5cdFx0dGhpcy5zYXZlRW50cmllc1RvU3RvcmFnZSgpO1xuXG5cdFx0Ly8gU2VsZWN0IHRoZSBuZXdseSBhZGRlZCBmb2xkZXJcblx0XHR0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSA9IHVyaTtcblx0XHR0aGlzLnNhdmVFbnRyaWVzVG9TdG9yYWdlKCk7XG5cdFx0dGhpcy5hcHBseVNlbGVjdGVkRm9sZGVyKCk7XG5cdFx0dGhpcy5fb25EaWRTZWxlY3RXb3Jrc3BhY2UuZmlyZSh0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSk7XG5cblx0XHR0aGlzLnJlbmRlckNvbnRlbnQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYXBwbHlTZWxlY3RlZEZvbGRlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGVkRm9sZGVyVXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudEZvbGRlcnMgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0Y29uc3QgZm9sZGVyc1RvUmVtb3ZlID0gY3VycmVudEZvbGRlcnMubWFwKGYgPT4gZi51cmkpO1xuXG5cdFx0Ly8gUmVtb3ZlIGV4aXN0aW5nIHdvcmtzcGFjZSBmb2xkZXJzIGFuZCBhZGQgdGhlIHNlbGVjdGVkIG9uZVxuXHRcdGF3YWl0IHRoaXMud29ya3NwYWNlRWRpdGluZ1NlcnZpY2UudXBkYXRlRm9sZGVycyhcblx0XHRcdDAsXG5cdFx0XHRmb2xkZXJzVG9SZW1vdmUubGVuZ3RoLFxuXHRcdFx0W3sgdXJpOiB0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSB9XVxuXHRcdCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlQ29udGVudEFyZWEocGFyZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHR0aGlzLmVsZW1lbnQgPSBwYXJlbnQ7XG5cdFx0dGhpcy5jb250ZW50ID0gYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLmNvbnRlbnQnKSk7XG5cblx0XHQvLyBDcmVhdGUgYWN0aW9ucyBjb250YWluZXIgZm9yIHdvcmtzcGFjZSBmb2xkZXJzIGFuZCBhZGQgYnV0dG9uXG5cdFx0dGhpcy5hY3Rpb25zQ29udGFpbmVyID0gYXBwZW5kKHRoaXMuY29udGVudCwgJCgnLmFjdGlvbnMtY29udGFpbmVyJykpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBVSSBmb3Igd29ya3NwYWNlIGZvbGRlcnNcblx0XHR0aGlzLnJlbmRlckNvbnRlbnQoKTtcblxuXHRcdC8vIENyZWF0ZSBnbG9iYWwgY29tcG9zaXRlIGJhciBhdCB0aGUgYm90dG9tIChhY2NvdW50cywgc2V0dGluZ3MpXG5cdFx0dGhpcy5nbG9iYWxDb21wb3NpdGVCYXIuY3JlYXRlKHRoaXMuY29udGVudCk7XG5cblx0XHRyZXR1cm4gdGhpcy5jb250ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDb250ZW50KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5hY3Rpb25zQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgZXhpc3RpbmcgY29udGVudFxuXHRcdGNsZWFyTm9kZSh0aGlzLmFjdGlvbnNDb250YWluZXIpO1xuXHRcdHRoaXMud29ya3NwYWNlRW50cnlEaXNwb3NhYmxlcy52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIENyZWF0ZSBhZGQgZm9sZGVyIGJ1dHRvblxuXHRcdHRoaXMuY3JlYXRlQWRkRm9sZGVyQnV0dG9uKHRoaXMuYWN0aW9uc0NvbnRhaW5lcik7XG5cblx0XHQvLyBDcmVhdGUgd29ya3NwYWNlIGZvbGRlciBlbnRyaWVzXG5cdFx0dGhpcy5jcmVhdGVXb3Jrc3BhY2VFbnRyaWVzKHRoaXMuYWN0aW9uc0NvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUFkZEZvbGRlckJ1dHRvbihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5hZGRGb2xkZXJCdXR0b24gPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuYWN0aW9uLWl0ZW0uYWRkLWZvbGRlcicpKTtcblx0XHRjb25zdCBhY3Rpb25MYWJlbCA9IGFwcGVuZCh0aGlzLmFkZEZvbGRlckJ1dHRvbiwgJCgnc3Bhbi5hY3Rpb24tbGFiZWwnKSk7XG5cblx0XHQvLyBBZGQgdGhlIHBsdXMgaWNvbiB1c2luZyBjb2RpY29uXG5cdFx0YWN0aW9uTGFiZWwuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmFkZCkpO1xuXG5cdFx0Ly8gQWRkIGhvdmVyIHRvb2x0aXBcblx0XHR0aGlzLndvcmtzcGFjZUVudHJ5RGlzcG9zYWJsZXMudmFsdWU/LmFkZChcblx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKFxuXHRcdFx0XHR0aGlzLmFkZEZvbGRlckJ1dHRvbixcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFwcGVhcmFuY2U6IHsgc2hvd1BvaW50ZXI6IHRydWUgfSxcblx0XHRcdFx0XHRwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLlJJR0hUIH0sXG5cdFx0XHRcdFx0Y29udGVudDogJ0FkZCBGb2xkZXIgdG8gUHJvamVjdCdcblx0XHRcdFx0fSxcblx0XHRcdFx0eyBncm91cElkOiBIT1ZFUl9HUk9VUF9JRCB9XG5cdFx0XHQpXG5cdFx0KTtcblxuXHRcdC8vIENsaWNrIGhhbmRsZXIgdG8gYWRkIGZvbGRlclxuXHRcdHRoaXMud29ya3NwYWNlRW50cnlEaXNwb3NhYmxlcy52YWx1ZT8uYWRkKFxuXHRcdFx0YWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuYWRkRm9sZGVyQnV0dG9uLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdFx0dGhpcy5waWNrQW5kQWRkRm9sZGVyKCk7XG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHQvLyBLZXlib2FyZCBzdXBwb3J0XG5cdFx0dGhpcy5hZGRGb2xkZXJCdXR0b24uc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0dGhpcy5hZGRGb2xkZXJCdXR0b24uc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuYWRkRm9sZGVyQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdBZGQgRm9sZGVyIHRvIFByb2plY3QnKTtcblx0XHR0aGlzLndvcmtzcGFjZUVudHJ5RGlzcG9zYWJsZXMudmFsdWU/LmFkZChcblx0XHRcdGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmFkZEZvbGRlckJ1dHRvbiwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHR0aGlzLnBpY2tBbmRBZGRGb2xkZXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwaWNrQW5kQWRkRm9sZGVyKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZvbGRlcnMgPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnNob3dPcGVuRGlhbG9nKHtcblx0XHRcdG9wZW5MYWJlbDogJ0FkZCcsXG5cdFx0XHR0aXRsZTogJ0FkZCBGb2xkZXIgdG8gUHJvamVjdCcsXG5cdFx0XHRjYW5TZWxlY3RGb2xkZXJzOiB0cnVlLFxuXHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0XHRkZWZhdWx0VXJpOiBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLmRlZmF1bHRGb2xkZXJQYXRoKCksXG5cdFx0XHRhdmFpbGFibGVGaWxlU3lzdGVtczogW3RoaXMucGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZV1cblx0XHR9KTtcblxuXHRcdGlmIChmb2xkZXJzPy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuYWRkRm9sZGVyRW50cnkoZm9sZGVyc1swXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVXb3Jrc3BhY2VFbnRyaWVzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuZW50cmllcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5jcmVhdGVXb3Jrc3BhY2VFbnRyeShjb250YWluZXIsIHRoaXMuZW50cmllc1tpXSwgaSk7XG5cdFx0fVxuXG5cdFx0Ly8gQXV0by1zZWxlY3QgZmlyc3QgZW50cnkgaWYgYXZhaWxhYmxlIGFuZCBub25lIHNlbGVjdGVkXG5cdFx0aWYgKHRoaXMuZW50cmllcy5sZW5ndGggPiAwICYmIHRoaXMuX3NlbGVjdGVkRm9sZGVyVXJpKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFNlbGVjdFdvcmtzcGFjZS5maXJlKHRoaXMuX3NlbGVjdGVkRm9sZGVyVXJpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVdvcmtzcGFjZUVudHJ5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGVudHJ5OiBJUHJvamVjdEJhckVudHJ5LCBpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cnlEaXNwb3NhYmxlcyA9IHRoaXMud29ya3NwYWNlRW50cnlEaXNwb3NhYmxlcy52YWx1ZSE7XG5cblx0XHRjb25zdCBlbnRyeUVsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuYWN0aW9uLWl0ZW0ud29ya3NwYWNlLWVudHJ5JykpO1xuXHRcdGNvbnN0IGFjdGlvbkxhYmVsID0gYXBwZW5kKGVudHJ5RWxlbWVudCwgJCgnc3Bhbi5hY3Rpb24tbGFiZWwud29ya3NwYWNlLWljb24nKSk7XG5cdFx0YXBwZW5kKGVudHJ5RWxlbWVudCwgJCgnc3Bhbi5hY3RpdmUtaXRlbS1pbmRpY2F0b3InKSk7XG5cblx0XHQvLyBSZW5kZXIgYmFzZWQgb24gZGlzcGxheSB0eXBlXG5cdFx0Y29uc3QgZm9sZGVyTmFtZSA9IGVudHJ5Lm5hbWU7XG5cdFx0aWYgKGVudHJ5LmRpc3BsYXlUeXBlID09PSAnaWNvbicgJiYgZW50cnkuaWNvbklkKSB7XG5cdFx0XHQvLyBSZW5kZXIgY29kaWNvblxuXHRcdFx0Y29uc3QgaWNvbiA9IFRoZW1lSWNvbi5mcm9tSWQoZW50cnkuaWNvbklkKTtcblx0XHRcdGFjdGlvbkxhYmVsLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoaWNvbikpO1xuXHRcdFx0YWN0aW9uTGFiZWwuY2xhc3NMaXN0LmFkZCgnY29kaWNvbi1pY29uJyk7XG5cdFx0XHRhY3Rpb25MYWJlbC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBEZWZhdWx0OiByZW5kZXIgZmlyc3QgbGV0dGVyIG9mIGZvbGRlciBuYW1lXG5cdFx0XHRjb25zdCBmaXJzdExldHRlciA9IGZvbGRlck5hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCk7XG5cdFx0XHRhY3Rpb25MYWJlbC50ZXh0Q29udGVudCA9IGZpcnN0TGV0dGVyO1xuXHRcdH1cblxuXHRcdC8vIFNldCBzZWxlY3RlZCBzdGF0ZVxuXHRcdGNvbnN0IGlzU2VsZWN0ZWQgPSB0aGlzLl9zZWxlY3RlZEZvbGRlclVyaT8udG9TdHJpbmcoKSA9PT0gZW50cnkudXJpLnRvU3RyaW5nKCk7XG5cdFx0aWYgKGlzU2VsZWN0ZWQpIHtcblx0XHRcdGVudHJ5RWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGVja2VkJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbGQgaG92ZXIgY29udGVudCB3aXRoIGZ1bGwgcGF0aFxuXHRcdGNvbnN0IGZvbGRlclBhdGggPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChlbnRyeS51cmksIHsgcmVsYXRpdmU6IGZhbHNlIH0pO1xuXG5cdFx0Ly8gQWRkIGhvdmVyIHRvb2x0aXAgd2l0aCBmb2xkZXIgbmFtZVxuXHRcdGVudHJ5RGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0dGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoXG5cdFx0XHRcdGVudHJ5RWxlbWVudCxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFwcGVhcmFuY2U6IHsgc2hvd1BvaW50ZXI6IHRydWUgfSxcblx0XHRcdFx0XHRwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLlJJR0hUIH0sXG5cdFx0XHRcdFx0Y29udGVudDogZm9sZGVyUGF0aFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7IGdyb3VwSWQ6IEhPVkVSX0dST1VQX0lEIH1cblx0XHRcdClcblx0XHQpO1xuXG5cdFx0Ly8gQ2xpY2sgaGFuZGxlciB0byBzZWxlY3Qgd29ya3NwYWNlXG5cdFx0ZW50cnlEaXNwb3NhYmxlcy5hZGQoXG5cdFx0XHRhZGREaXNwb3NhYmxlTGlzdGVuZXIoZW50cnlFbGVtZW50LCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdFx0dGhpcy5zZWxlY3RXb3Jrc3BhY2UoaW5kZXgpO1xuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0Ly8gS2V5Ym9hcmQgc3VwcG9ydFxuXHRcdGVudHJ5RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJzAnKTtcblx0XHRlbnRyeUVsZW1lbnQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdGVudHJ5RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBmb2xkZXJOYW1lKTtcblx0XHRlbnRyeUVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCBpc1NlbGVjdGVkID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cdFx0ZW50cnlEaXNwb3NhYmxlcy5hZGQoXG5cdFx0XHRhZGREaXNwb3NhYmxlTGlzdGVuZXIoZW50cnlFbGVtZW50LCBFdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdHRoaXMuc2VsZWN0V29ya3NwYWNlKGluZGV4KTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0Ly8gQ29udGV4dCBtZW51IHdpdGggY3VzdG9taXplIGFuZCByZW1vdmUgYWN0aW9uc1xuXHRcdGVudHJ5RGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0YWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVudHJ5RWxlbWVudCwgRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZ2V0V2luZG93KGVudHJ5RWxlbWVudCksIGUpO1xuXHRcdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gW1xuXHRcdFx0XHRcdFx0bmV3IEFjdGlvbigncHJvamVjdGJhci5jdXN0b21pemUnLCBsb2NhbGl6ZSgncHJvamVjdGJhci5jdXN0b21pemUnLCBcIkN1c3RvbWl6ZVwiKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0aGlzLnNob3dDdXN0b21pemVRdWlja1BpY2soaW5kZXgpKSxcblx0XHRcdFx0XHRcdG5ldyBTZXBhcmF0b3IoKSxcblx0XHRcdFx0XHRcdG5ldyBBY3Rpb24oJ3Byb2plY3RiYXIucmVtb3ZlRm9sZGVyJywgbG9jYWxpemUoJ3Byb2plY3RiYXIucmVtb3ZlRm9sZGVyJywgXCJSZW1vdmUgRm9sZGVyXCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHRoaXMucmVtb3ZlRm9sZGVyRW50cnkoaW5kZXgpKVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHNlbGVjdFdvcmtzcGFjZShpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLmVudHJpZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLmVudHJpZXNbaW5kZXhdO1xuXHRcdGlmICh0aGlzLl9zZWxlY3RlZEZvbGRlclVyaT8udG9TdHJpbmcoKSA9PT0gZW50cnkudXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdHJldHVybjsgLy8gQWxyZWFkeSBzZWxlY3RlZFxuXHRcdH1cblxuXHRcdHRoaXMuX3NlbGVjdGVkRm9sZGVyVXJpID0gZW50cnkudXJpO1xuXHRcdHRoaXMuc2F2ZUVudHJpZXNUb1N0b3JhZ2UoKTtcblxuXHRcdC8vIFJlLXJlbmRlciB0byB1cGRhdGUgdmlzdWFsIHN0YXRlXG5cdFx0dGhpcy5yZW5kZXJDb250ZW50KCk7XG5cblx0XHQvLyBBcHBseSB0aGUgc2VsZWN0ZWQgZm9sZGVyIGFzIHRoZSB3b3Jrc3BhY2UgZm9sZGVyXG5cdFx0dGhpcy5hcHBseVNlbGVjdGVkRm9sZGVyKCk7XG5cblx0XHQvLyBGaXJlIHNlbGVjdGlvbiBldmVudFxuXHRcdHRoaXMuX29uRGlkU2VsZWN0V29ya3NwYWNlLmZpcmUodGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVGb2xkZXJFbnRyeShpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLmVudHJpZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVtb3ZlZFVyaSA9IHRoaXMuZW50cmllc1tpbmRleF0udXJpO1xuXHRcdHRoaXMuZW50cmllcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdHRoaXMuc2F2ZUVudHJpZXNUb1N0b3JhZ2UoKTtcblxuXHRcdC8vIElmIHRoZSByZW1vdmVkIGVudHJ5IHdhcyB0aGUgc2VsZWN0ZWQgb25lLCBzZWxlY3QgdGhlIGZpcnN0IHJlbWFpbmluZyBlbnRyeVxuXHRcdGlmICh0aGlzLl9zZWxlY3RlZEZvbGRlclVyaT8udG9TdHJpbmcoKSA9PT0gcmVtb3ZlZFVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRpZiAodGhpcy5lbnRyaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkgPSB0aGlzLmVudHJpZXNbMF0udXJpO1xuXHRcdFx0XHR0aGlzLmFwcGx5U2VsZWN0ZWRGb2xkZXIoKTtcblx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RXb3Jrc3BhY2UuZmlyZSh0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RXb3Jrc3BhY2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyQ29udGVudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzaG93Q3VzdG9taXplUXVpY2tQaWNrKGluZGV4OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMuZW50cmllcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuZW50cmllc1tpbmRleF07XG5cblx0XHRpbnRlcmZhY2UgSUN1c3RvbWl6ZVF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdFx0XHRjdXN0b21UeXBlOiAnbGV0dGVyJyB8ICdpY29uJztcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtczogSUN1c3RvbWl6ZVF1aWNrUGlja0l0ZW1bXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0Y3VzdG9tVHlwZTogJ2xldHRlcicsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncHJvamVjdGJhci5jdXN0b21pemUubGV0dGVyJywgXCJMZXR0ZXJcIiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvamVjdGJhci5jdXN0b21pemUubGV0dGVyLmRlc2NyaXB0aW9uJywgXCJTaG93IHRoZSBmaXJzdCBsZXR0ZXIgb2YgdGhlIHdvcmtzcGFjZSBuYW1lXCIpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRjdXN0b21UeXBlOiAnaWNvbicsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncHJvamVjdGJhci5jdXN0b21pemUuaWNvbicsIFwiSWNvblwiKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9qZWN0YmFyLmN1c3RvbWl6ZS5pY29uLmRlc2NyaXB0aW9uJywgXCJDaG9vc2UgYSBjb2RpY29uIHRvIHJlcHJlc2VudCB0aGUgd29ya3NwYWNlXCIpXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHBpY2tlZCA9IGF3YWl0IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayhpdGVtcywge1xuXHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdwcm9qZWN0YmFyLmN1c3RvbWl6ZS5wbGFjZWhvbGRlcicsIFwiQ2hvb3NlIGhvdyB0byBkaXNwbGF5IHRoZSB3b3Jrc3BhY2UgaW4gdGhlIHByb2plY3QgYmFyXCIpLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdwcm9qZWN0YmFyLmN1c3RvbWl6ZS50aXRsZScsIFwiQ3VzdG9taXplIFdvcmtzcGFjZSBBcHBlYXJhbmNlXCIpXG5cdFx0fSk7XG5cblx0XHRpZiAoIXBpY2tlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChwaWNrZWQuY3VzdG9tVHlwZSA9PT0gJ2xldHRlcicpIHtcblx0XHRcdGVudHJ5LmRpc3BsYXlUeXBlID0gJ2xldHRlcic7XG5cdFx0XHRlbnRyeS5pY29uSWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnNhdmVFbnRyaWVzVG9TdG9yYWdlKCk7XG5cdFx0XHR0aGlzLnJlbmRlckNvbnRlbnQoKTtcblx0XHR9IGVsc2UgaWYgKHBpY2tlZC5jdXN0b21UeXBlID09PSAnaWNvbicpIHtcblx0XHRcdGNvbnN0IGljb24gPSBhd2FpdCB0aGlzLnBpY2tJY29uKCk7XG5cdFx0XHRpZiAoaWNvbikge1xuXHRcdFx0XHRlbnRyeS5kaXNwbGF5VHlwZSA9ICdpY29uJztcblx0XHRcdFx0ZW50cnkuaWNvbklkID0gaWNvbi5pZDtcblx0XHRcdFx0dGhpcy5zYXZlRW50cmllc1RvU3RvcmFnZSgpO1xuXHRcdFx0XHR0aGlzLnJlbmRlckNvbnRlbnQoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHBpY2tJY29uKCk6IFByb21pc2U8VGhlbWVJY29uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaWNvblNlbGVjdEJveCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoSWNvblNlbGVjdEJveCwge1xuXHRcdFx0aWNvbnM6IGljb25zLnZhbHVlLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlc1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGltZW5zaW9uID0gbmV3IERpbWVuc2lvbig0ODYsIDI2MCk7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPFRoZW1lSWNvbiB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGljb25TZWxlY3RCb3gub25EaWRTZWxlY3QoZSA9PiB7XG5cdFx0XHRcdHJlc29sdmUoZSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0aWNvblNlbGVjdEJveC5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGljb25TZWxlY3RCb3guY2xlYXJJbnB1dCgpO1xuXHRcdFx0Y29uc3QgYm9keSA9IGdldEFjdGl2ZURvY3VtZW50KCkuYm9keTtcblx0XHRcdGNvbnN0IGJvZHlSZWN0ID0gYm9keS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdGNvbnN0IGhvdmVyV2lkZ2V0ID0gdGhpcy5ob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdGNvbnRlbnQ6IGljb25TZWxlY3RCb3guZG9tTm9kZSxcblx0XHRcdFx0dGFyZ2V0OiB7XG5cdFx0XHRcdFx0dGFyZ2V0RWxlbWVudHM6IFtib2R5XSxcblx0XHRcdFx0XHR4OiBib2R5UmVjdC5sZWZ0ICsgKGJvZHlSZWN0LndpZHRoIC0gZGltZW5zaW9uLndpZHRoKSAvIDIsXG5cdFx0XHRcdFx0eTogYm9keVJlY3QudG9wICsgdGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lck9mZnNldC50b3Bcblx0XHRcdFx0fSxcblx0XHRcdFx0cG9zaXRpb246IHtcblx0XHRcdFx0XHRob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJzaXN0ZW5jZToge1xuXHRcdFx0XHRcdHN0aWNreTogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHRydWUpO1xuXG5cdFx0XHRpZiAoaG92ZXJXaWRnZXQpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGhvdmVyV2lkZ2V0KTtcblx0XHRcdH1cblxuXHRcdFx0aWNvblNlbGVjdEJveC5sYXlvdXQoZGltZW5zaW9uKTtcblx0XHRcdGljb25TZWxlY3RCb3guZm9jdXMoKTtcblx0XHR9KTtcblx0fVxuXG5cdGdldCBzZWxlY3RlZFdvcmtzcGFjZUZvbGRlcigpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZWxlY3RlZEZvbGRlclVyaTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVTdHlsZXMoKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuZ2V0Q29udGFpbmVyKCkpO1xuXHRcdGNvbnN0IGJhY2tncm91bmQgPSB0aGlzLmdldENvbG9yKEFDVElWSVRZX0JBUl9CQUNLR1JPVU5EKSB8fCAnJztcblx0XHRjb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYmFja2dyb3VuZDtcblxuXHRcdGNvbnN0IGJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihBQ1RJVklUWV9CQVJfQk9SREVSKSB8fCB0aGlzLmdldENvbG9yKGNvbnRyYXN0Qm9yZGVyKSB8fCAnJztcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYm9yZGVyZWQnLCAhIWJvcmRlckNvbG9yKTtcblx0XHRjb250YWluZXIuc3R5bGUuYm9yZGVyQ29sb3IgPSBib3JkZXJDb2xvciA/IGJvcmRlckNvbG9yIDogJyc7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHQvLyBGb2N1cyB0aGUgYWRkIGZvbGRlciBidXR0b24gKGZpcnN0IGZvY3VzYWJsZSBlbGVtZW50KVxuXHRcdHRoaXMuYWRkRm9sZGVyQnV0dG9uPy5mb2N1cygpO1xuXHR9XG5cblx0Zm9jdXNHbG9iYWxDb21wb3NpdGVCYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5nbG9iYWxDb21wb3NpdGVCYXIuZm9jdXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dCh3aWR0aCwgaGVpZ2h0LCAwLCAwKTtcblxuXHRcdC8vIFRoZSBnbG9iYWwgY29tcG9zaXRlIGJhciB0YWtlcyBzb21lIGhlaWdodCBhdCB0aGUgYm90dG9tXG5cdFx0Ly8gVGhlIGFjdGlvbnMgY29udGFpbmVyIHdpbGwgdGFrZSB0aGUgcmVtYWluaW5nIHNwYWNlIGR1ZSB0byBDU1MgZmxleCBsYXlvdXRcblx0fVxuXG5cdHRvSlNPTigpOiBvYmplY3Qge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiBBZ2VudGljUGFydHMuUFJPSkVDVEJBUl9QQVJUXG5cdFx0fTtc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
