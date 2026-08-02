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
import "./media/userDataProfilesEditor.css";
import { $, addDisposableListener, append, clearNode, Dimension, EventHelper, EventType, trackFocus } from "../../../../base/browser/dom.js";
import { Action, Separator, SubmenuAction, toAction } from "../../../../base/common/actions.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IUserDataProfilesService, ProfileResourceType } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { EditorInputCapabilities } from "../../../common/editor.js";
import { EditorInput } from "../../../common/editor/editorInput.js";
import { defaultUserDataProfileIcon, IUserDataProfileManagementService, IUserDataProfileService, PROFILE_FILTER } from "../../../services/userDataProfile/common/userDataProfile.js";
import { Orientation, Sizing, SplitView } from "../../../../base/browser/ui/splitview/splitview.js";
import { Button, ButtonBar, ButtonWithDropdown } from "../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles, defaultSelectBoxStyles, getInputBoxStyle, getListStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { editorBackground, foreground, registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { PANEL_BORDER } from "../../../common/theme.js";
import { WorkbenchAsyncDataTree, WorkbenchList, WorkbenchTable } from "../../../../platform/list/browser/listService.js";
import { CachedListVirtualDelegate } from "../../../../base/browser/ui/list/list.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { InputBox, MessageType } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { Checkbox } from "../../../../base/browser/ui/toggle/toggle.js";
import { DEFAULT_ICON, ICONS } from "../../../services/userDataProfile/common/userDataProfileIcons.js";
import { WorkbenchIconSelectBox } from "../../../services/userDataProfile/browser/iconSelectBox.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../../../platform/hover/browser/hover.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { SelectBox, SeparatorSelectOption } from "../../../../base/browser/ui/selectBox/selectBox.js";
import { URI } from "../../../../base/common/uri.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { isString, isUndefined } from "../../../../base/common/types.js";
import { basename } from "../../../../base/common/resources.js";
import { RenderIndentGuides } from "../../../../base/browser/ui/tree/abstractTree.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../browser/labels.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { AbstractUserDataProfileElement, isProfileResourceChildElement, isProfileResourceTypeElement, NewProfileElement, UserDataProfileElement, UserDataProfilesEditorModel } from "./userDataProfilesEditorModel.js";
import { WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { createInstantHoverDelegate, getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Radio } from "../../../../base/browser/ui/radio/radio.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { settingsTextInputBorder } from "../../preferences/common/settingsEditorColorRegistry.js";
import { renderMarkdown } from "../../../../base/browser/markdownRenderer.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { Schemas } from "../../../../base/common/network.js";
import { posix, win32 } from "../../../../base/common/path.js";
import { hasDriveLetter } from "../../../../base/common/extpath.js";
import { normalizeDriveLetter } from "../../../../base/common/labels.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { DropdownMenuActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
const editIcon = registerIcon("profiles-editor-edit-folder", Codicon.edit, localize("editIcon", "Icon for the edit folder icon in the profiles editor."));
const removeIcon = registerIcon("profiles-editor-remove-folder", Codicon.close, localize("removeIcon", "Icon for the remove folder icon in the profiles editor."));
const profilesSashBorder = registerColor("profiles.sashBorder", PANEL_BORDER, localize("profilesSashBorder", "The color of the Profiles editor splitview sash border."));
const listStyles = getListStyles({
  listActiveSelectionBackground: editorBackground,
  listActiveSelectionForeground: foreground,
  listFocusAndSelectionBackground: editorBackground,
  listFocusAndSelectionForeground: foreground,
  listFocusBackground: editorBackground,
  listFocusForeground: foreground,
  listHoverForeground: foreground,
  listHoverBackground: editorBackground,
  listHoverOutline: editorBackground,
  listFocusOutline: editorBackground,
  listInactiveSelectionBackground: editorBackground,
  listInactiveSelectionForeground: foreground,
  listInactiveFocusBackground: editorBackground,
  listInactiveFocusOutline: editorBackground,
  treeIndentGuidesStroke: void 0,
  treeInactiveIndentGuidesStroke: void 0,
  tableOddRowsBackgroundColor: editorBackground
});
let UserDataProfilesEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, quickInputService, fileDialogService, contextMenuService, instantiationService) {
    super(UserDataProfilesEditor.ID, group, telemetryService, themeService, storageService);
    this.quickInputService = quickInputService;
    this.fileDialogService = fileDialogService;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this.templates = [];
  }
  layout(dimension, position) {
    if (this.container && this.splitView) {
      const height = dimension.height - 20;
      this.splitView.layout(this.container?.clientWidth, height);
      this.splitView.el.style.height = `${height}px`;
    }
  }
  createEditor(parent) {
    this.container = append(parent, $(".profiles-editor"));
    const sidebarView = append(this.container, $(".sidebar-view"));
    const sidebarContainer = append(sidebarView, $(".sidebar-container"));
    const contentsView = append(this.container, $(".contents-view"));
    const contentsContainer = append(contentsView, $(".contents-container"));
    this.profileWidget = this._register(this.instantiationService.createInstance(ProfileWidget, contentsContainer));
    this.splitView = new SplitView(this.container, {
      orientation: Orientation.HORIZONTAL,
      proportionalLayout: true
    });
    this.renderSidebar(sidebarContainer);
    this.splitView.addView({
      onDidChange: Event.None,
      element: sidebarView,
      minimumSize: 200,
      maximumSize: 350,
      layout: (width, _, height) => {
        sidebarView.style.width = `${width}px`;
        if (height && this.profilesList) {
          const listHeight = height - 40 - 15;
          this.profilesList.getHTMLElement().style.height = `${listHeight}px`;
          this.profilesList.layout(listHeight, width);
        }
      }
    }, 300, void 0, true);
    this.splitView.addView({
      onDidChange: Event.None,
      element: contentsView,
      minimumSize: 550,
      maximumSize: Number.POSITIVE_INFINITY,
      layout: (width, _, height) => {
        contentsView.style.width = `${width}px`;
        if (height) {
          this.profileWidget?.layout(new Dimension(width, height));
        }
      }
    }, Sizing.Distribute, void 0, true);
    this.registerListeners();
    this.updateStyles();
  }
  updateStyles() {
    const borderColor = this.theme.getColor(profilesSashBorder);
    this.splitView?.style({ separatorBorder: borderColor });
  }
  renderSidebar(parent) {
    this.renderNewProfileButton(append(parent, $(".new-profile-button")));
    const renderer = this.instantiationService.createInstance(ProfileElementRenderer);
    const delegate = new ProfileElementDelegate();
    this.profilesList = this._register(this.instantiationService.createInstance(
      WorkbenchList,
      "ProfilesList",
      append(parent, $(".profiles-list")),
      delegate,
      [renderer],
      {
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel(profileElement) {
            return profileElement?.name ?? "";
          },
          getWidgetAriaLabel() {
            return localize("profiles", "Profiles");
          }
        },
        openOnSingleClick: true,
        identityProvider: {
          getId(e) {
            if (e instanceof UserDataProfileElement) {
              return e.profile.id;
            }
            return e.name;
          }
        },
        alwaysConsumeMouseWheel: false
      }
    ));
  }
  renderNewProfileButton(parent) {
    const button = this._register(new ButtonWithDropdown(parent, {
      actions: {
        getActions: () => {
          const actions = [];
          if (this.templates.length) {
            actions.push(new SubmenuAction("from.template", localize("from template", "From Template"), this.getCreateFromTemplateActions()));
            actions.push(new Separator());
          }
          actions.push(toAction({
            id: "importProfile",
            label: localize("importProfile", "Import Profile..."),
            run: () => this.importProfile()
          }));
          return actions;
        }
      },
      addPrimaryActionToDropdown: false,
      contextMenuProvider: this.contextMenuService,
      supportIcons: true,
      ...defaultButtonStyles
    }));
    button.label = localize("newProfile", "New Profile");
    this._register(button.onDidClick((e) => this.createNewProfile()));
  }
  getCreateFromTemplateActions() {
    return this.templates.map((template) => toAction({
      id: `template:${template.url}`,
      label: template.name,
      run: () => this.createNewProfile(URI.parse(template.url))
    }));
  }
  registerListeners() {
    if (this.profilesList) {
      this._register(this.profilesList.onDidChangeSelection((e) => {
        const [element] = e.elements;
        if (element instanceof AbstractUserDataProfileElement) {
          this.profileWidget?.render(element);
        }
      }));
      this._register(this.profilesList.onContextMenu((e) => {
        const actions = [];
        if (!e.element) {
          actions.push(...this.getTreeContextMenuActions());
        }
        if (e.element instanceof AbstractUserDataProfileElement) {
          actions.push(...e.element.actions[1]);
        }
        if (actions.length) {
          this.contextMenuService.showContextMenu({
            getAnchor: () => e.anchor,
            getActions: () => actions,
            getActionsContext: () => e.element
          });
        }
      }));
      this._register(this.profilesList.onMouseDblClick((e) => {
        if (!e.element) {
          this.createNewProfile();
        }
      }));
    }
  }
  getTreeContextMenuActions() {
    const actions = [];
    actions.push(toAction({
      id: "newProfile",
      label: localize("newProfile", "New Profile"),
      run: () => this.createNewProfile()
    }));
    const templateActions = this.getCreateFromTemplateActions();
    if (templateActions.length) {
      actions.push(new SubmenuAction("from.template", localize("new from template", "New Profile From Template"), templateActions));
    }
    actions.push(new Separator());
    actions.push(toAction({
      id: "importProfile",
      label: localize("importProfile", "Import Profile..."),
      run: () => this.importProfile()
    }));
    return actions;
  }
  async importProfile() {
    const disposables = new DisposableStore();
    const quickPick = disposables.add(this.quickInputService.createQuickPick());
    const updateQuickPickItems = (value) => {
      const quickPickItems = [];
      if (value) {
        quickPickItems.push({ label: quickPick.value, description: localize("import from url", "Import from URL") });
      }
      quickPickItems.push({ label: localize("import from file", "Select File...") });
      quickPick.items = quickPickItems;
    };
    quickPick.title = localize("import profile quick pick title", "Import from Profile Template...");
    quickPick.placeholder = localize("import profile placeholder", "Provide Profile Template URL");
    quickPick.ignoreFocusOut = true;
    disposables.add(quickPick.onDidChangeValue(updateQuickPickItems));
    updateQuickPickItems();
    quickPick.matchOnLabel = false;
    quickPick.matchOnDescription = false;
    disposables.add(quickPick.onDidAccept(async () => {
      quickPick.hide();
      const selectedItem = quickPick.selectedItems[0];
      if (!selectedItem) {
        return;
      }
      const url = selectedItem.label === quickPick.value ? URI.parse(quickPick.value) : await this.getProfileUriFromFileSystem();
      if (url) {
        this.createNewProfile(url);
      }
    }));
    disposables.add(quickPick.onDidHide(() => disposables.dispose()));
    quickPick.show();
  }
  async createNewProfile(copyFrom) {
    await this.model?.createNewProfile(copyFrom);
  }
  selectProfile(profile) {
    const index = this.model?.profiles.findIndex((p) => p instanceof UserDataProfileElement && p.profile.id === profile.id);
    if (index !== void 0 && index >= 0) {
      this.profilesList?.setSelection([index]);
    }
  }
  async getProfileUriFromFileSystem() {
    const profileLocation = await this.fileDialogService.showOpenDialog({
      canSelectFolders: false,
      canSelectFiles: true,
      canSelectMany: false,
      filters: PROFILE_FILTER,
      title: localize("import profile dialog", "Select Profile Template File")
    });
    if (!profileLocation) {
      return null;
    }
    return profileLocation[0];
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    this.model = await input.resolve();
    this.model.getTemplates().then((templates) => {
      this.templates = templates;
      if (this.profileWidget) {
        this.profileWidget.templates = templates;
      }
    });
    this.updateProfilesList();
    this._register(this.model.onDidChange((element) => this.updateProfilesList(element)));
  }
  focus() {
    super.focus();
    this.profilesList?.domFocus();
  }
  updateProfilesList(elementToSelect) {
    if (!this.model) {
      return;
    }
    const currentSelectionIndex = this.profilesList?.getSelection()?.[0];
    const currentSelection = currentSelectionIndex !== void 0 ? this.profilesList?.element(currentSelectionIndex) : void 0;
    this.profilesList?.splice(0, this.profilesList.length, this.model.profiles);
    if (elementToSelect) {
      this.profilesList?.setSelection([this.model.profiles.indexOf(elementToSelect)]);
    } else if (currentSelection) {
      if (!this.model.profiles.includes(currentSelection)) {
        const elementToSelect2 = this.model.profiles.find((profile) => profile.name === currentSelection.name) ?? this.model.profiles[0];
        if (elementToSelect2) {
          this.profilesList?.setSelection([this.model.profiles.indexOf(elementToSelect2)]);
        }
      }
    } else {
      const elementToSelect2 = this.model.profiles.find((profile) => profile.active) ?? this.model.profiles[0];
      if (elementToSelect2) {
        this.profilesList?.setSelection([this.model.profiles.indexOf(elementToSelect2)]);
      }
    }
  }
};
UserDataProfilesEditor.ID = "workbench.editor.userDataProfiles";
UserDataProfilesEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IQuickInputService),
  __decorateParam(5, IFileDialogService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IInstantiationService)
], UserDataProfilesEditor);
class ProfileElementDelegate {
  getHeight(element) {
    return 22;
  }
  getTemplateId() {
    return "profileListElement";
  }
}
let ProfileElementRenderer = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
    this.templateId = "profileListElement";
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    container.classList.add("profile-list-item");
    const icon = append(container, $(".profile-list-item-icon"));
    const label = append(container, $(".profile-list-item-label"));
    const dirty = append(container, $(`span${ThemeIcon.asCSSSelector(Codicon.circleFilled)}`));
    const description = append(container, $(".profile-list-item-description"));
    append(description, $(`span${ThemeIcon.asCSSSelector(Codicon.check)}`), $("span", void 0, localize("activeProfile", "Active")));
    const actionsContainer = append(container, $(".profile-tree-item-actions-container"));
    const actionBar = disposables.add(this.instantiationService.createInstance(
      WorkbenchToolBar,
      actionsContainer,
      {
        hoverDelegate: disposables.add(createInstantHoverDelegate()),
        highlightToggledItems: true
      }
    ));
    return { label, icon, dirty, description, actionBar, disposables, elementDisposables };
  }
  renderElement(element, index, templateData) {
    templateData.elementDisposables.clear();
    templateData.label.textContent = element.name;
    templateData.label.classList.toggle("new-profile", element instanceof NewProfileElement);
    templateData.icon.className = ThemeIcon.asClassName(element.icon ? ThemeIcon.fromId(element.icon) : DEFAULT_ICON);
    templateData.dirty.classList.toggle("hide", !(element instanceof NewProfileElement));
    templateData.description.classList.toggle("hide", !element.active);
    templateData.elementDisposables.add(element.onDidChange((e) => {
      if (e.name) {
        templateData.label.textContent = element.name;
      }
      if (e.icon) {
        if (element.icon) {
          templateData.icon.className = ThemeIcon.asClassName(ThemeIcon.fromId(element.icon));
        } else {
          templateData.icon.className = "hide";
        }
      }
      if (e.active) {
        templateData.description.classList.toggle("hide", !element.active);
      }
    }));
    const setActions = () => templateData.actionBar.setActions(element.actions[0].filter((a) => a.enabled), element.actions[1].filter((a) => a.enabled));
    setActions();
    const events = [];
    for (const action of element.actions.flat()) {
      if (action instanceof Action) {
        events.push(action.onDidChange);
      }
    }
    templateData.elementDisposables.add(Event.any(...events)((e) => {
      if (e.enabled !== void 0) {
        setActions();
      }
    }));
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
    templateData.elementDisposables.dispose();
  }
};
ProfileElementRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], ProfileElementRenderer);
let ProfileWidget = class extends Disposable {
  constructor(parent, editorProgressService, instantiationService) {
    super();
    this.editorProgressService = editorProgressService;
    this.instantiationService = instantiationService;
    this._profileElement = this._register(new MutableDisposable());
    this.layoutParticipants = [];
    const header = append(parent, $(".profile-header"));
    const title = append(header, $(".profile-title-container"));
    this.profileTitle = append(title, $(".profile-title"));
    this.builtInLabel = append(title, $(".profile-built-in-label", void 0, localize("builtIn", "Built-in")));
    this.builtInLabel.classList.add("hide");
    const body = append(parent, $(".profile-body"));
    const delegate = new ProfileTreeDelegate();
    const contentsRenderer = this._register(this.instantiationService.createInstance(ContentsProfileRenderer));
    const associationsRenderer = this._register(this.instantiationService.createInstance(ProfileWorkspacesRenderer));
    this.layoutParticipants.push(associationsRenderer);
    this.copyFromProfileRenderer = this._register(this.instantiationService.createInstance(CopyFromProfileRenderer));
    this.profileTreeContainer = append(body, $(".profile-tree"));
    this.profileTree = this._register(this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "ProfileEditor-Tree",
      this.profileTreeContainer,
      delegate,
      [
        this._register(this.instantiationService.createInstance(ProfileNameRenderer)),
        this._register(this.instantiationService.createInstance(ProfileIconRenderer)),
        this._register(this.instantiationService.createInstance(UseForCurrentWindowPropertyRenderer)),
        this._register(this.instantiationService.createInstance(UseAsDefaultProfileRenderer)),
        this.copyFromProfileRenderer,
        contentsRenderer,
        associationsRenderer
      ],
      this.instantiationService.createInstance(ProfileTreeDataSource),
      {
        multipleSelectionSupport: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel(element) {
            return element?.element ?? "";
          },
          getWidgetAriaLabel() {
            return "";
          }
        },
        identityProvider: {
          getId(element) {
            return element.element;
          }
        },
        expandOnlyOnTwistieClick: true,
        renderIndentGuides: RenderIndentGuides.None,
        enableStickyScroll: false,
        openOnSingleClick: false,
        setRowLineHeight: false,
        supportDynamicHeights: true,
        alwaysConsumeMouseWheel: false
      }
    ));
    this.profileTree.style(listStyles);
    this._register(contentsRenderer.onDidChangeContentHeight((e) => this.profileTree.updateElementHeight(e, void 0)));
    this._register(associationsRenderer.onDidChangeContentHeight((e) => this.profileTree.updateElementHeight(e, void 0)));
    this._register(contentsRenderer.onDidChangeSelection((e) => {
      if (e.selected) {
        this.profileTree.setFocus([]);
        this.profileTree.setSelection([]);
      }
    }));
    this._register(this.profileTree.onDidChangeContentHeight((e) => {
      if (this.dimension) {
        this.layout(this.dimension);
      }
    }));
    this._register(this.profileTree.onDidChangeSelection((e) => {
      if (e.elements.length) {
        contentsRenderer.clearSelection();
      }
    }));
    this.buttonContainer = append(body, $(".profile-row-container.profile-button-container"));
  }
  set templates(templates) {
    this.copyFromProfileRenderer.setTemplates(templates);
    this.profileTree.rerender();
  }
  layout(dimension) {
    this.dimension = dimension;
    const treeContentHeight = this.profileTree.contentHeight;
    const height = Math.min(treeContentHeight, dimension.height - (this._profileElement.value?.element instanceof NewProfileElement ? 116 : 54));
    this.profileTreeContainer.style.height = `${height}px`;
    this.profileTree.layout(height, dimension.width);
    for (const participant of this.layoutParticipants) {
      participant.layout();
    }
  }
  render(profileElement) {
    if (this._profileElement.value?.element === profileElement) {
      return;
    }
    if (this._profileElement.value?.element instanceof UserDataProfileElement) {
      this._profileElement.value.element.reset();
    }
    this.profileTree.setInput(profileElement);
    const disposables = new DisposableStore();
    this._profileElement.value = { element: profileElement, dispose: () => disposables.dispose() };
    this.profileTitle.textContent = profileElement.name;
    this.builtInLabel.classList.toggle("hide", !(profileElement instanceof UserDataProfileElement && profileElement.profile.isDefault));
    disposables.add(profileElement.onDidChange((e) => {
      if (e.name) {
        this.profileTitle.textContent = profileElement.name;
      }
    }));
    const [primaryTitleButtons, secondatyTitleButtons] = profileElement.titleButtons;
    if (primaryTitleButtons?.length || secondatyTitleButtons?.length) {
      this.buttonContainer.classList.remove("hide");
      if (secondatyTitleButtons?.length) {
        for (const action of secondatyTitleButtons) {
          const button = disposables.add(new Button(this.buttonContainer, {
            ...defaultButtonStyles,
            secondary: true
          }));
          button.label = action.label;
          button.enabled = action.enabled;
          disposables.add(button.onDidClick(() => this.editorProgressService.showWhile(action.run())));
          disposables.add(action.onDidChange((e) => {
            if (!isUndefined(e.enabled)) {
              button.enabled = action.enabled;
            }
            if (!isUndefined(e.label)) {
              button.label = action.label;
            }
          }));
        }
      }
      if (primaryTitleButtons?.length) {
        for (const action of primaryTitleButtons) {
          const button = disposables.add(new Button(this.buttonContainer, {
            ...defaultButtonStyles
          }));
          button.label = action.label;
          button.enabled = action.enabled;
          disposables.add(button.onDidClick(() => this.editorProgressService.showWhile(action.run())));
          disposables.add(action.onDidChange((e) => {
            if (!isUndefined(e.enabled)) {
              button.enabled = action.enabled;
            }
            if (!isUndefined(e.label)) {
              button.label = action.label;
            }
          }));
          disposables.add(profileElement.onDidChange((e) => {
            if (e.message) {
              button.setTitle(profileElement.message ?? action.label);
              button.element.classList.toggle("error", !!profileElement.message);
            }
          }));
        }
      }
    } else {
      this.buttonContainer.classList.add("hide");
    }
    if (profileElement instanceof NewProfileElement) {
      this.profileTree.focusFirst();
    }
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
};
ProfileWidget = __decorateClass([
  __decorateParam(1, IEditorProgressService),
  __decorateParam(2, IInstantiationService)
], ProfileWidget);
class ProfileTreeDelegate extends CachedListVirtualDelegate {
  getTemplateId({ element }) {
    return element;
  }
  hasDynamicHeight({ element }) {
    return element === "contents" || element === "workspaces";
  }
  estimateHeight({ element, root }) {
    switch (element) {
      case "name":
        return 72;
      case "icon":
        return 68;
      case "copyFrom":
        return 90;
      case "useForCurrent":
      case "useAsDefault":
        return 68;
      case "contents":
        return 258;
      case "workspaces":
        return (root.workspaces ? root.workspaces.length * 24 + 30 : 0) + 112;
    }
  }
}
class ProfileTreeDataSource {
  hasChildren(element) {
    return element instanceof AbstractUserDataProfileElement;
  }
  async getChildren(element) {
    if (element instanceof AbstractUserDataProfileElement) {
      const children = [];
      if (element instanceof NewProfileElement) {
        children.push({ element: "name", root: element });
        children.push({ element: "icon", root: element });
        children.push({ element: "copyFrom", root: element });
        children.push({ element: "contents", root: element });
      } else if (element instanceof UserDataProfileElement) {
        if (!element.profile.isDefault) {
          children.push({ element: "name", root: element });
          children.push({ element: "icon", root: element });
        }
        children.push({ element: "useAsDefault", root: element });
        children.push({ element: "contents", root: element });
        children.push({ element: "workspaces", root: element });
      }
      return children;
    }
    return [];
  }
}
class ProfileContentTreeElementDelegate {
  getTemplateId(element) {
    if (!element.element.resourceType) {
      return ProfileResourceChildTreeItemRenderer.TEMPLATE_ID;
    }
    if (element.root instanceof NewProfileElement) {
      return NewProfileResourceTreeRenderer.TEMPLATE_ID;
    }
    return ExistingProfileResourceTreeRenderer.TEMPLATE_ID;
  }
  getHeight(element) {
    return 24;
  }
}
let ProfileResourceTreeDataSource = class {
  constructor(editorProgressService) {
    this.editorProgressService = editorProgressService;
  }
  hasChildren(element) {
    if (element instanceof AbstractUserDataProfileElement) {
      return true;
    }
    if (element.element.resourceType) {
      if (element.element.resourceType !== ProfileResourceType.Extensions && element.element.resourceType !== ProfileResourceType.Snippets) {
        return false;
      }
      if (element.root instanceof NewProfileElement) {
        const resourceType = element.element.resourceType;
        if (element.root.getFlag(resourceType)) {
          return true;
        }
        if (!element.root.hasResource(resourceType)) {
          return false;
        }
        if (element.root.copyFrom === void 0) {
          return false;
        }
        if (!element.root.getCopyFlag(resourceType)) {
          return false;
        }
      }
      return true;
    }
    return false;
  }
  async getChildren(element) {
    if (element instanceof AbstractUserDataProfileElement) {
      const children = await element.getChildren();
      return children.map((e) => ({ element: e, root: element }));
    }
    if (element.element.resourceType) {
      const progressRunner = this.editorProgressService.show(true, 500);
      try {
        const extensions = await element.root.getChildren(element.element.resourceType);
        return extensions.map((e) => ({ element: e, root: element.root }));
      } finally {
        progressRunner.done();
      }
    }
    return [];
  }
};
ProfileResourceTreeDataSource = __decorateClass([
  __decorateParam(0, IEditorProgressService)
], ProfileResourceTreeDataSource);
class AbstractProfileResourceTreeRenderer extends Disposable {
  getResourceTypeTitle(resourceType) {
    switch (resourceType) {
      case ProfileResourceType.Settings:
        return localize("settings", "Settings");
      case ProfileResourceType.Keybindings:
        return localize("keybindings", "Keyboard Shortcuts");
      case ProfileResourceType.Snippets:
        return localize("snippets", "Snippets");
      case ProfileResourceType.Tasks:
        return localize("tasks", "Tasks");
      case ProfileResourceType.Mcp:
        return localize("mcp", "MCP Servers");
      case ProfileResourceType.Extensions:
        return localize("extensions", "Extensions");
    }
    return "";
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
}
class ProfilePropertyRenderer extends AbstractProfileResourceTreeRenderer {
  renderElement({ element }, index, templateData) {
    templateData.elementDisposables.clear();
    templateData.element = element;
  }
}
let ProfileNameRenderer = class extends ProfilePropertyRenderer {
  constructor(userDataProfilesService, contextViewService) {
    super();
    this.userDataProfilesService = userDataProfilesService;
    this.contextViewService = contextViewService;
    this.templateId = "name";
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    let profileElement;
    const nameContainer = append(parent, $(".profile-row-container"));
    append(nameContainer, $(".profile-label-element", void 0, localize("name", "Name")));
    const nameInput = disposables.add(new InputBox(
      nameContainer,
      this.contextViewService,
      {
        inputBoxStyles: getInputBoxStyle({
          inputBorder: settingsTextInputBorder
        }),
        ariaLabel: localize("profileName", "Profile Name"),
        placeholder: localize("profileName", "Profile Name"),
        validationOptions: {
          validation: (value) => {
            if (!value) {
              return {
                content: localize("name required", "Profile name is required and must be a non-empty value."),
                type: MessageType.WARNING
              };
            }
            if (profileElement?.root.disabled) {
              return null;
            }
            if (!profileElement?.root.shouldValidateName()) {
              return null;
            }
            const initialName = profileElement?.root.getInitialName();
            value = value.trim();
            if (initialName !== value && this.userDataProfilesService.profiles.some((p) => !p.isInternal && p.name === value)) {
              return {
                content: localize("profileExists", "Profile with name {0} already exists.", value),
                type: MessageType.WARNING
              };
            }
            return null;
          }
        }
      }
    ));
    disposables.add(nameInput.onDidChange((value) => {
      if (profileElement && value) {
        profileElement.root.name = value;
      }
    }));
    const focusTracker = disposables.add(trackFocus(nameInput.inputElement));
    disposables.add(focusTracker.onDidBlur(() => {
      if (profileElement && !nameInput.value) {
        nameInput.value = profileElement.root.name;
      }
    }));
    const renderName = (profileElement2) => {
      nameInput.value = profileElement2.root.name;
      nameInput.validate();
      const isSystemProfile = profileElement2.root instanceof UserDataProfileElement && profileElement2.root.profile.isDefault;
      if (profileElement2.root.disabled || isSystemProfile) {
        nameInput.disable();
      } else {
        nameInput.enable();
      }
      if (isSystemProfile) {
        nameInput.setTooltip(localize("defaultProfileName", "Name cannot be changed for the built in profiles"));
      } else {
        nameInput.setTooltip(localize("profileName", "Profile Name"));
      }
    };
    return {
      set element(element) {
        profileElement = element;
        renderName(profileElement);
        elementDisposables.add(profileElement.root.onDidChange((e) => {
          if (e.name || e.disabled) {
            renderName(element);
          }
          if (e.profile) {
            nameInput.validate();
          }
        }));
      },
      disposables,
      elementDisposables
    };
  }
};
ProfileNameRenderer = __decorateClass([
  __decorateParam(0, IUserDataProfilesService),
  __decorateParam(1, IContextViewService)
], ProfileNameRenderer);
let ProfileIconRenderer = class extends ProfilePropertyRenderer {
  constructor(instantiationService, hoverService) {
    super();
    this.instantiationService = instantiationService;
    this.hoverService = hoverService;
    this.templateId = "icon";
    this.hoverDelegate = getDefaultHoverDelegate("element");
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    let profileElement;
    const iconContainer = append(parent, $(".profile-row-container"));
    append(iconContainer, $(".profile-label-element", void 0, localize("icon-label", "Icon")));
    const iconValueContainer = append(iconContainer, $(".profile-icon-container"));
    const iconElement = append(iconValueContainer, $(`${ThemeIcon.asCSSSelector(DEFAULT_ICON)}`, { "tabindex": "0", "role": "button", "aria-label": localize("icon", "Profile Icon") }));
    const iconHover = disposables.add(this.hoverService.setupManagedHover(this.hoverDelegate, iconElement, ""));
    const iconSelectBox = disposables.add(this.instantiationService.createInstance(WorkbenchIconSelectBox, { icons: ICONS, inputBoxStyles: defaultInputBoxStyles }));
    let hoverWidget;
    const showIconSelectBox = () => {
      if (profileElement?.root instanceof UserDataProfileElement && profileElement.root.profile.isDefault) {
        return;
      }
      if (profileElement?.root.disabled) {
        return;
      }
      if (profileElement?.root instanceof UserDataProfileElement && profileElement.root.profile.isDefault) {
        return;
      }
      iconSelectBox.clearInput();
      hoverWidget = this.hoverService.showInstantHover({
        content: iconSelectBox.domNode,
        target: iconElement,
        position: {
          hoverPosition: HoverPosition.BELOW
        },
        persistence: {
          sticky: true
        },
        appearance: {
          showPointer: true
        }
      }, true);
      if (hoverWidget) {
        iconSelectBox.layout(new Dimension(486, 292));
        iconSelectBox.focus();
      }
    };
    disposables.add(addDisposableListener(iconElement, EventType.CLICK, (e) => {
      EventHelper.stop(e, true);
      showIconSelectBox();
    }));
    disposables.add(addDisposableListener(iconElement, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        EventHelper.stop(event, true);
        showIconSelectBox();
      }
    }));
    disposables.add(addDisposableListener(iconSelectBox.domNode, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Escape)) {
        EventHelper.stop(event, true);
        hoverWidget?.dispose();
        iconElement.focus();
      }
    }));
    disposables.add(iconSelectBox.onDidSelect((selectedIcon) => {
      hoverWidget?.dispose();
      iconElement.focus();
      if (profileElement) {
        profileElement.root.icon = selectedIcon.id;
      }
    }));
    append(iconValueContainer, $(".profile-description-element", void 0, localize("icon-description", "Profile icon to be shown in the activity bar")));
    const renderIcon = (profileElement2) => {
      if (profileElement2?.root instanceof UserDataProfileElement && profileElement2.root.profile.isDefault) {
        iconValueContainer.classList.add("disabled");
        iconHover.update(localize("defaultProfileIcon", "Icon cannot be changed for the default profile"));
      } else {
        iconHover.update(localize("changeIcon", "Click to change icon"));
        iconValueContainer.classList.remove("disabled");
      }
      if (profileElement2.root.icon) {
        iconElement.className = ThemeIcon.asClassName(ThemeIcon.fromId(profileElement2.root.icon));
      } else {
        iconElement.className = ThemeIcon.asClassName(ThemeIcon.fromId(DEFAULT_ICON.id));
      }
    };
    return {
      set element(element) {
        profileElement = element;
        renderIcon(profileElement);
        elementDisposables.add(profileElement.root.onDidChange((e) => {
          if (e.icon) {
            renderIcon(element);
          }
        }));
      },
      disposables,
      elementDisposables
    };
  }
};
ProfileIconRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IHoverService)
], ProfileIconRenderer);
let UseForCurrentWindowPropertyRenderer = class extends ProfilePropertyRenderer {
  constructor(userDataProfileService) {
    super();
    this.userDataProfileService = userDataProfileService;
    this.templateId = "useForCurrent";
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    let profileElement;
    const useForCurrentWindowContainer = append(parent, $(".profile-row-container"));
    append(useForCurrentWindowContainer, $(".profile-label-element", void 0, localize("use for curren window", "Use for Current Window")));
    const useForCurrentWindowValueContainer = append(useForCurrentWindowContainer, $(".profile-use-for-current-container"));
    const useForCurrentWindowTitle = localize("enable for current window", "Use this profile for the current window");
    const useForCurrentWindowCheckbox = disposables.add(new Checkbox(useForCurrentWindowTitle, false, defaultCheckboxStyles));
    append(useForCurrentWindowValueContainer, useForCurrentWindowCheckbox.domNode);
    const useForCurrentWindowLabel = append(useForCurrentWindowValueContainer, $(".profile-description-element", void 0, useForCurrentWindowTitle));
    disposables.add(useForCurrentWindowCheckbox.onChange(() => {
      if (profileElement?.root instanceof UserDataProfileElement) {
        profileElement.root.toggleCurrentWindowProfile();
      }
    }));
    disposables.add(addDisposableListener(useForCurrentWindowLabel, EventType.CLICK, () => {
      if (profileElement?.root instanceof UserDataProfileElement) {
        profileElement.root.toggleCurrentWindowProfile();
      }
    }));
    const renderUseCurrentProfile = (profileElement2) => {
      useForCurrentWindowCheckbox.checked = profileElement2.root instanceof UserDataProfileElement && this.userDataProfileService.currentProfile.id === profileElement2.root.profile.id;
      if (useForCurrentWindowCheckbox.checked && this.userDataProfileService.currentProfile.isDefault) {
        useForCurrentWindowCheckbox.disable();
      } else {
        useForCurrentWindowCheckbox.enable();
      }
    };
    const that = this;
    return {
      set element(element) {
        profileElement = element;
        renderUseCurrentProfile(profileElement);
        elementDisposables.add(that.userDataProfileService.onDidChangeCurrentProfile((e) => {
          renderUseCurrentProfile(element);
        }));
      },
      disposables,
      elementDisposables
    };
  }
};
UseForCurrentWindowPropertyRenderer = __decorateClass([
  __decorateParam(0, IUserDataProfileService)
], UseForCurrentWindowPropertyRenderer);
class UseAsDefaultProfileRenderer extends ProfilePropertyRenderer {
  constructor() {
    super(...arguments);
    this.templateId = "useAsDefault";
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    let profileElement;
    const useAsDefaultProfileContainer = append(parent, $(".profile-row-container"));
    append(useAsDefaultProfileContainer, $(".profile-label-element", void 0, localize("use for new windows", "Use for New Windows")));
    const useAsDefaultProfileValueContainer = append(useAsDefaultProfileContainer, $(".profile-use-as-default-container"));
    const useAsDefaultProfileTitle = localize("enable for new windows", "Use this profile as the default for new windows");
    const useAsDefaultProfileCheckbox = disposables.add(new Checkbox(useAsDefaultProfileTitle, false, defaultCheckboxStyles));
    append(useAsDefaultProfileValueContainer, useAsDefaultProfileCheckbox.domNode);
    const useAsDefaultProfileLabel = append(useAsDefaultProfileValueContainer, $(".profile-description-element", void 0, useAsDefaultProfileTitle));
    disposables.add(useAsDefaultProfileCheckbox.onChange(() => {
      if (profileElement?.root instanceof UserDataProfileElement) {
        profileElement.root.toggleNewWindowProfile();
      }
    }));
    disposables.add(addDisposableListener(useAsDefaultProfileLabel, EventType.CLICK, () => {
      if (profileElement?.root instanceof UserDataProfileElement) {
        profileElement.root.toggleNewWindowProfile();
      }
    }));
    const renderUseAsDefault = (profileElement2) => {
      useAsDefaultProfileCheckbox.checked = profileElement2.root instanceof UserDataProfileElement && profileElement2.root.isNewWindowProfile;
    };
    return {
      set element(element) {
        profileElement = element;
        renderUseAsDefault(profileElement);
        elementDisposables.add(profileElement.root.onDidChange((e) => {
          if (e.newWindowProfile) {
            renderUseAsDefault(element);
          }
        }));
      },
      disposables,
      elementDisposables
    };
  }
}
let CopyFromProfileRenderer = class extends ProfilePropertyRenderer {
  constructor(userDataProfilesService, instantiationService, uriIdentityService, contextViewService) {
    super();
    this.userDataProfilesService = userDataProfilesService;
    this.instantiationService = instantiationService;
    this.uriIdentityService = uriIdentityService;
    this.contextViewService = contextViewService;
    this.templateId = "copyFrom";
    this.templates = [];
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    let profileElement;
    const copyFromContainer = append(parent, $(".profile-row-container.profile-copy-from-container"));
    append(copyFromContainer, $(".profile-label-element", void 0, localize("create from", "Copy from")));
    append(copyFromContainer, $(".profile-description-element", void 0, localize("copy from description", "Select the profile source from which you want to copy contents")));
    const copyFromSelectBox = disposables.add(this.instantiationService.createInstance(
      SelectBox,
      [],
      0,
      this.contextViewService,
      defaultSelectBoxStyles,
      {
        useCustomDrawn: true,
        ariaLabel: localize("copy profile from", "Copy profile from")
      }
    ));
    copyFromSelectBox.render(append(copyFromContainer, $(".profile-select-container")));
    const render = (profileElement2, copyFromOptions) => {
      copyFromSelectBox.setOptions(copyFromOptions);
      const id = profileElement2.copyFrom instanceof URI ? profileElement2.copyFrom.toString() : profileElement2.copyFrom?.id;
      const index = id ? copyFromOptions.findIndex((option) => option.id === id) : 0;
      copyFromSelectBox.select(index);
    };
    const that = this;
    return {
      set element(element) {
        profileElement = element;
        if (profileElement.root instanceof NewProfileElement) {
          const newProfileElement = profileElement.root;
          let copyFromOptions = that.getCopyFromOptions(newProfileElement);
          render(newProfileElement, copyFromOptions);
          copyFromSelectBox.setEnabled(!newProfileElement.previewProfile && !newProfileElement.disabled);
          elementDisposables.add(profileElement.root.onDidChange((e) => {
            if (e.copyFrom || e.copyFromInfo) {
              copyFromOptions = that.getCopyFromOptions(newProfileElement);
              render(newProfileElement, copyFromOptions);
            }
            if (e.preview || e.disabled) {
              copyFromSelectBox.setEnabled(!newProfileElement.previewProfile && !newProfileElement.disabled);
            }
          }));
          elementDisposables.add(copyFromSelectBox.onDidSelect((option) => {
            newProfileElement.copyFrom = copyFromOptions[option.index].source;
          }));
        }
      },
      disposables,
      elementDisposables
    };
  }
  setTemplates(templates) {
    this.templates = templates;
  }
  getCopyFromOptions(profileElement) {
    const copyFromOptions = [];
    copyFromOptions.push({ text: localize("empty profile", "None") });
    for (const [copyFromTemplate, name] of profileElement.copyFromTemplates) {
      if (!this.templates.some((template) => this.uriIdentityService.extUri.isEqual(URI.parse(template.url), copyFromTemplate))) {
        copyFromOptions.push({ text: `${name} (${basename(copyFromTemplate)})`, id: copyFromTemplate.toString(), source: copyFromTemplate });
      }
    }
    if (this.templates.length) {
      copyFromOptions.push({ ...SeparatorSelectOption, decoratorRight: localize("from templates", "Profile Templates") });
      for (const template of this.templates) {
        copyFromOptions.push({ text: template.name, id: template.url, source: URI.parse(template.url) });
      }
    }
    copyFromOptions.push({ ...SeparatorSelectOption, decoratorRight: localize("from existing profiles", "Existing Profiles") });
    for (const profile of this.userDataProfilesService.profiles) {
      if (!profile.isInternal) {
        copyFromOptions.push({ text: profile.name, id: profile.id, source: profile });
      }
    }
    return copyFromOptions;
  }
};
CopyFromProfileRenderer = __decorateClass([
  __decorateParam(0, IUserDataProfilesService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, IContextViewService)
], CopyFromProfileRenderer);
let ContentsProfileRenderer = class extends ProfilePropertyRenderer {
  constructor(userDataProfilesService, contextMenuService, instantiationService) {
    super();
    this.userDataProfilesService = userDataProfilesService;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this.templateId = "contents";
    this._onDidChangeContentHeight = this._register(new Emitter());
    this.onDidChangeContentHeight = this._onDidChangeContentHeight.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    let profileElement;
    const configureRowContainer = append(parent, $(".profile-row-container"));
    append(configureRowContainer, $(".profile-label-element", void 0, localize("contents", "Contents")));
    const contentsDescriptionElement = append(configureRowContainer, $(".profile-description-element"));
    const contentsTreeHeader = append(configureRowContainer, $(".profile-content-tree-header"));
    const optionsLabel = $(".options-header", void 0, $("span", void 0, localize("options", "Source")));
    append(
      contentsTreeHeader,
      $(""),
      $("", void 0, localize("contents", "Contents")),
      optionsLabel,
      $("")
    );
    const delegate = new ProfileContentTreeElementDelegate();
    const profilesContentTree = this.profilesContentTree = disposables.add(this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "ProfileEditor-ContentsTree",
      append(configureRowContainer, $(".profile-content-tree.file-icon-themable-tree.show-file-icons")),
      delegate,
      [
        this.instantiationService.createInstance(ExistingProfileResourceTreeRenderer),
        this.instantiationService.createInstance(NewProfileResourceTreeRenderer),
        this.instantiationService.createInstance(ProfileResourceChildTreeItemRenderer)
      ],
      this.instantiationService.createInstance(ProfileResourceTreeDataSource),
      {
        multipleSelectionSupport: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel(element) {
            if ((element?.element).resourceType) {
              return (element?.element).resourceType;
            }
            if ((element?.element).label) {
              return (element?.element).label;
            }
            return "";
          },
          getWidgetAriaLabel() {
            return "";
          }
        },
        identityProvider: {
          getId(element) {
            if (element?.element.handle) {
              return element.element.handle;
            }
            return "";
          }
        },
        expandOnlyOnTwistieClick: true,
        renderIndentGuides: RenderIndentGuides.None,
        enableStickyScroll: false,
        openOnSingleClick: false,
        alwaysConsumeMouseWheel: false
      }
    ));
    this.profilesContentTree.style(listStyles);
    disposables.add(toDisposable(() => this.profilesContentTree = void 0));
    disposables.add(this.profilesContentTree.onDidChangeContentHeight((height) => {
      this.profilesContentTree?.layout(height);
      if (profileElement) {
        this._onDidChangeContentHeight.fire(profileElement);
      }
    }));
    disposables.add(this.profilesContentTree.onDidChangeSelection(((e) => {
      if (profileElement) {
        this._onDidChangeSelection.fire({ element: profileElement, selected: !!e.elements.length });
      }
    })));
    disposables.add(this.profilesContentTree.onDidOpen(async (e) => {
      if (!e.browserEvent) {
        return;
      }
      if (e.element?.element.openAction) {
        await e.element.element.openAction.run();
      }
    }));
    disposables.add(this.profilesContentTree.onContextMenu(async (e) => {
      if (!e.element?.element.actions?.contextMenu?.length) {
        return;
      }
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => e.element?.element?.actions?.contextMenu ?? [],
        getActionsContext: () => e.element
      });
    }));
    const updateDescription = (element) => {
      clearNode(contentsDescriptionElement);
      const markdown = new MarkdownString();
      if (element.root instanceof UserDataProfileElement && element.root.profile.isDefault) {
        markdown.appendMarkdown(localize("default profile contents description", "Browse contents of this profile\n"));
      } else {
        markdown.appendMarkdown(localize("contents source description", "Configure source of contents for this profile\n"));
        if (element.root instanceof NewProfileElement) {
          const copyFromName = element.root.getCopyFromName();
          const optionName = copyFromName === this.userDataProfilesService.defaultProfile.name ? localize("copy from default", "{0} (Copy)", copyFromName) : copyFromName;
          if (optionName) {
            markdown.appendMarkdown(localize("copy info", "- *{0}:* Copy contents from the {1} profile\n", optionName, copyFromName));
          }
          markdown.appendMarkdown(localize("default info", "- *Default:* Use contents from the Default profile\n")).appendMarkdown(localize("none info", "- *None:* Create empty contents\n"));
        }
      }
      append(contentsDescriptionElement, elementDisposables.add(renderMarkdown(markdown)).element);
    };
    const that = this;
    return {
      set element(element) {
        profileElement = element;
        updateDescription(element);
        if (element.root instanceof NewProfileElement) {
          contentsTreeHeader.classList.remove("default-profile");
        } else if (element.root instanceof UserDataProfileElement) {
          contentsTreeHeader.classList.toggle("default-profile", element.root.profile.isDefault);
        }
        profilesContentTree.setInput(profileElement.root);
        elementDisposables.add(profileElement.root.onDidChange((e) => {
          if (e.copyFrom || e.copyFlags || e.flags || e.extensions || e.snippets || e.preview) {
            profilesContentTree.updateChildren(element.root);
          }
          if (e.copyFromInfo) {
            updateDescription(element);
            that._onDidChangeContentHeight.fire(element);
          }
        }));
      },
      disposables,
      elementDisposables
    };
  }
  clearSelection() {
    if (this.profilesContentTree) {
      this.profilesContentTree.setSelection([]);
      this.profilesContentTree.setFocus([]);
    }
  }
};
ContentsProfileRenderer = __decorateClass([
  __decorateParam(0, IUserDataProfilesService),
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IInstantiationService)
], ContentsProfileRenderer);
let ProfileWorkspacesRenderer = class extends ProfilePropertyRenderer {
  constructor(labelService, uriIdentityService, fileDialogService, instantiationService) {
    super();
    this.labelService = labelService;
    this.uriIdentityService = uriIdentityService;
    this.fileDialogService = fileDialogService;
    this.instantiationService = instantiationService;
    this.templateId = "workspaces";
    this._onDidChangeContentHeight = this._register(new Emitter());
    this.onDidChangeContentHeight = this._onDidChangeContentHeight.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    let profileElement;
    const profileWorkspacesRowContainer = append(parent, $(".profile-row-container"));
    append(profileWorkspacesRowContainer, $(".profile-label-element", void 0, localize("folders_workspaces", "Folders & Workspaces")));
    const profileWorkspacesDescriptionElement = append(profileWorkspacesRowContainer, $(".profile-description-element"));
    const workspacesTableContainer = append(profileWorkspacesRowContainer, $(".profile-associations-table"));
    const table = this.workspacesTable = disposables.add(this.instantiationService.createInstance(
      WorkbenchTable,
      "ProfileEditor-AssociationsTable",
      workspacesTableContainer,
      new class {
        constructor() {
          this.headerRowHeight = 30;
        }
        getHeight() {
          return 24;
        }
      }(),
      [
        {
          label: "",
          tooltip: "",
          weight: 1,
          minimumWidth: 30,
          maximumWidth: 30,
          templateId: WorkspaceUriEmptyColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("hostColumnLabel", "Host"),
          tooltip: "",
          weight: 2,
          templateId: WorkspaceUriHostColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("pathColumnLabel", "Path"),
          tooltip: "",
          weight: 7,
          templateId: WorkspaceUriPathColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: "",
          tooltip: "",
          weight: 1,
          minimumWidth: 84,
          maximumWidth: 84,
          templateId: WorkspaceUriActionsColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        }
      ],
      [
        new WorkspaceUriEmptyColumnRenderer(),
        this.instantiationService.createInstance(WorkspaceUriHostColumnRenderer),
        this.instantiationService.createInstance(WorkspaceUriPathColumnRenderer),
        this.instantiationService.createInstance(WorkspaceUriActionsColumnRenderer)
      ],
      {
        horizontalScrolling: false,
        alwaysConsumeMouseWheel: false,
        openOnSingleClick: false,
        multipleSelectionSupport: false,
        accessibilityProvider: {
          getAriaLabel: (item) => {
            const hostLabel = getHostLabel(this.labelService, item.workspace);
            if (hostLabel === void 0 || hostLabel.length === 0) {
              return localize("trustedFolderAriaLabel", "{0}, trusted", this.labelService.getUriLabel(item.workspace));
            }
            return localize("trustedFolderWithHostAriaLabel", "{0} on {1}, trusted", this.labelService.getUriLabel(item.workspace), hostLabel);
          },
          getWidgetAriaLabel: () => localize("trustedFoldersAndWorkspaces", "Trusted Folders & Workspaces")
        },
        identityProvider: {
          getId(element) {
            return element.workspace.toString();
          }
        }
      }
    ));
    this.workspacesTable.style(listStyles);
    disposables.add(toDisposable(() => this.workspacesTable = void 0));
    disposables.add(this.workspacesTable.onDidChangeSelection(((e) => {
      if (profileElement) {
        this._onDidChangeSelection.fire({ element: profileElement, selected: !!e.elements.length });
      }
    })));
    const addButtonBarElement = append(profileWorkspacesRowContainer, $(".profile-workspaces-button-container"));
    const buttonBar = disposables.add(new ButtonBar(addButtonBarElement));
    const addButton = this._register(buttonBar.addButton({ title: localize("addButton", "Add Folder"), ...defaultButtonStyles }));
    addButton.label = localize("addButton", "Add Folder");
    disposables.add(addButton.onDidClick(async () => {
      const uris = await this.fileDialogService.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: true,
        openLabel: localize("addFolder", "Add Folder"),
        title: localize("addFolderTitle", "Select Folders To Add")
      });
      if (uris) {
        if (profileElement?.root instanceof UserDataProfileElement) {
          profileElement.root.updateWorkspaces(uris, []);
        }
      }
    }));
    disposables.add(table.onDidOpen((item) => {
      if (item?.element) {
        item.element.profileElement.openWorkspace(item.element.workspace);
      }
    }));
    const updateTable = () => {
      if (profileElement?.root instanceof UserDataProfileElement && profileElement.root.workspaces?.length) {
        profileWorkspacesDescriptionElement.textContent = localize("folders_workspaces_description", "Following folders and workspaces are using this profile");
        workspacesTableContainer.classList.remove("hide");
        table.splice(
          0,
          table.length,
          profileElement.root.workspaces.map((workspace) => ({ workspace, profileElement: profileElement.root })).sort((a, b) => this.uriIdentityService.extUri.compare(a.workspace, b.workspace))
        );
        this.layout();
      } else {
        profileWorkspacesDescriptionElement.textContent = localize("no_folder_description", "No folders or workspaces are using this profile");
        workspacesTableContainer.classList.add("hide");
      }
    };
    const that = this;
    return {
      set element(element) {
        profileElement = element;
        if (element.root instanceof UserDataProfileElement) {
          updateTable();
        }
        elementDisposables.add(profileElement.root.onDidChange((e) => {
          if (profileElement && e.workspaces) {
            updateTable();
            that._onDidChangeContentHeight.fire(profileElement);
          }
        }));
      },
      disposables,
      elementDisposables
    };
  }
  layout() {
    if (this.workspacesTable) {
      this.workspacesTable.layout(this.workspacesTable.length * 24 + 30, void 0);
    }
  }
  clearSelection() {
    if (this.workspacesTable) {
      this.workspacesTable.setSelection([]);
      this.workspacesTable.setFocus([]);
    }
  }
};
ProfileWorkspacesRenderer = __decorateClass([
  __decorateParam(0, ILabelService),
  __decorateParam(1, IUriIdentityService),
  __decorateParam(2, IFileDialogService),
  __decorateParam(3, IInstantiationService)
], ProfileWorkspacesRenderer);
let ExistingProfileResourceTreeRenderer = class extends AbstractProfileResourceTreeRenderer {
  constructor(instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.templateId = ExistingProfileResourceTreeRenderer.TEMPLATE_ID;
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const container = append(parent, $(".profile-tree-item-container.existing-profile-resource-type-container"));
    const label = append(container, $(".profile-resource-type-label"));
    const radio = disposables.add(new Radio({ items: [] }));
    append(append(container, $(".profile-resource-options-container")), radio.domNode);
    const actionsContainer = append(container, $(".profile-resource-actions-container"));
    const actionBar = disposables.add(this.instantiationService.createInstance(
      WorkbenchToolBar,
      actionsContainer,
      {
        hoverDelegate: disposables.add(createInstantHoverDelegate()),
        highlightToggledItems: true
      }
    ));
    return { label, radio, actionBar, disposables, elementDisposables: disposables.add(new DisposableStore()) };
  }
  renderElement({ element: profileResourceTreeElement }, index, templateData) {
    templateData.elementDisposables.clear();
    const { element, root } = profileResourceTreeElement;
    if (!(root instanceof UserDataProfileElement)) {
      throw new Error("ExistingProfileResourceTreeRenderer can only render existing profile element");
    }
    if (isString(element) || !isProfileResourceTypeElement(element)) {
      throw new Error("Invalid profile resource element");
    }
    const updateRadioItems = () => {
      templateData.radio.setItems([
        {
          text: localize("default", "Default"),
          tooltip: localize("default description", "Use {0} from the Default profile", resourceTypeTitle),
          isActive: root.getFlag(element.resourceType)
        },
        {
          text: root.name,
          tooltip: localize("current description", "Use {0} from the {1} profile", resourceTypeTitle, root.name),
          isActive: !root.getFlag(element.resourceType)
        }
      ]);
    };
    const resourceTypeTitle = this.getResourceTypeTitle(element.resourceType);
    templateData.label.textContent = resourceTypeTitle;
    if (root instanceof UserDataProfileElement && root.profile.isDefault) {
      templateData.radio.domNode.classList.add("hide");
    } else {
      templateData.radio.domNode.classList.remove("hide");
      updateRadioItems();
      templateData.elementDisposables.add(root.onDidChange((e) => {
        if (e.name) {
          updateRadioItems();
        }
      }));
      templateData.elementDisposables.add(templateData.radio.onDidSelect((index2) => root.setFlag(element.resourceType, index2 === 0)));
    }
    const actions = [];
    if (element.openAction) {
      actions.push(element.openAction);
    }
    if (element.actions?.primary) {
      actions.push(...element.actions.primary);
    }
    templateData.actionBar.setActions(actions);
  }
};
ExistingProfileResourceTreeRenderer.TEMPLATE_ID = "ExistingProfileResourceTemplate";
ExistingProfileResourceTreeRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], ExistingProfileResourceTreeRenderer);
let NewProfileResourceTreeRenderer = class extends AbstractProfileResourceTreeRenderer {
  constructor(userDataProfilesService, instantiationService) {
    super();
    this.userDataProfilesService = userDataProfilesService;
    this.instantiationService = instantiationService;
    this.templateId = NewProfileResourceTreeRenderer.TEMPLATE_ID;
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const container = append(parent, $(".profile-tree-item-container.new-profile-resource-type-container"));
    const labelContainer = append(container, $(".profile-resource-type-label-container"));
    const label = append(labelContainer, $("span.profile-resource-type-label"));
    const radio = disposables.add(new Radio({ items: [] }));
    append(append(container, $(".profile-resource-options-container")), radio.domNode);
    const actionsContainer = append(container, $(".profile-resource-actions-container"));
    const actionBar = disposables.add(this.instantiationService.createInstance(
      WorkbenchToolBar,
      actionsContainer,
      {
        hoverDelegate: disposables.add(createInstantHoverDelegate()),
        highlightToggledItems: true
      }
    ));
    return { label, radio, actionBar, disposables, elementDisposables: disposables.add(new DisposableStore()) };
  }
  renderElement({ element: profileResourceTreeElement }, index, templateData) {
    templateData.elementDisposables.clear();
    const { element, root } = profileResourceTreeElement;
    if (!(root instanceof NewProfileElement)) {
      throw new Error("NewProfileResourceTreeRenderer can only render new profile element");
    }
    if (isString(element) || !isProfileResourceTypeElement(element)) {
      throw new Error("Invalid profile resource element");
    }
    const resourceTypeTitle = this.getResourceTypeTitle(element.resourceType);
    templateData.label.textContent = resourceTypeTitle;
    const renderRadioItems = () => {
      const options = [
        {
          text: localize("default", "Default"),
          tooltip: localize("default description", "Use {0} from the Default profile", resourceTypeTitle)
        },
        {
          text: localize("none", "None"),
          tooltip: localize("none description", "Create empty {0}", resourceTypeTitle)
        }
      ];
      const copyFromName = root.getCopyFromName();
      const name = copyFromName === this.userDataProfilesService.defaultProfile.name ? localize("copy from default", "{0} (Copy)", copyFromName) : copyFromName;
      if (root.copyFrom && name) {
        templateData.radio.setItems([
          {
            text: name,
            tooltip: name ? localize("copy from profile description", "Copy {0} from the {1} profile", resourceTypeTitle, name) : localize("copy description", "Copy")
          },
          ...options
        ]);
        templateData.radio.setActiveItem(root.getCopyFlag(element.resourceType) ? 0 : root.getFlag(element.resourceType) ? 1 : 2);
      } else {
        templateData.radio.setItems(options);
        templateData.radio.setActiveItem(root.getFlag(element.resourceType) ? 0 : 1);
      }
    };
    if (root.copyFrom) {
      templateData.elementDisposables.add(templateData.radio.onDidSelect((index2) => {
        root.setFlag(element.resourceType, index2 === 1);
        root.setCopyFlag(element.resourceType, index2 === 0);
      }));
    } else {
      templateData.elementDisposables.add(templateData.radio.onDidSelect((index2) => {
        root.setFlag(element.resourceType, index2 === 0);
      }));
    }
    renderRadioItems();
    templateData.radio.setEnabled(!root.disabled && !root.previewProfile);
    templateData.elementDisposables.add(root.onDidChange((e) => {
      if (e.disabled || e.preview) {
        templateData.radio.setEnabled(!root.disabled && !root.previewProfile);
      }
      if (e.copyFrom || e.copyFromInfo) {
        renderRadioItems();
      }
    }));
    const actions = [];
    if (element.openAction) {
      actions.push(element.openAction);
    }
    if (element.actions?.primary) {
      actions.push(...element.actions.primary);
    }
    templateData.actionBar.setActions(actions);
  }
};
NewProfileResourceTreeRenderer.TEMPLATE_ID = "NewProfileResourceTemplate";
NewProfileResourceTreeRenderer = __decorateClass([
  __decorateParam(0, IUserDataProfilesService),
  __decorateParam(1, IInstantiationService)
], NewProfileResourceTreeRenderer);
let ProfileResourceChildTreeItemRenderer = class extends AbstractProfileResourceTreeRenderer {
  constructor(instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.templateId = ProfileResourceChildTreeItemRenderer.TEMPLATE_ID;
    this.labels = instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER);
    this.hoverDelegate = this._register(instantiationService.createInstance(WorkbenchHoverDelegate, "mouse", void 0, {}));
  }
  renderTemplate(parent) {
    const disposables = new DisposableStore();
    const container = append(parent, $(".profile-tree-item-container.profile-resource-child-container"));
    const checkbox = disposables.add(new Checkbox("", false, defaultCheckboxStyles));
    append(container, checkbox.domNode);
    const resourceLabel = disposables.add(this.labels.create(container, { hoverDelegate: this.hoverDelegate }));
    const actionsContainer = append(container, $(".profile-resource-actions-container"));
    const actionBar = disposables.add(this.instantiationService.createInstance(
      WorkbenchToolBar,
      actionsContainer,
      {
        hoverDelegate: disposables.add(createInstantHoverDelegate()),
        highlightToggledItems: true
      }
    ));
    return { checkbox, resourceLabel, actionBar, disposables, elementDisposables: disposables.add(new DisposableStore()) };
  }
  renderElement({ element: profileResourceTreeElement }, index, templateData) {
    templateData.elementDisposables.clear();
    const { element } = profileResourceTreeElement;
    if (isString(element) || !isProfileResourceChildElement(element)) {
      throw new Error("Invalid profile resource element");
    }
    if (element.checkbox) {
      templateData.checkbox.domNode.setAttribute("tabindex", "0");
      templateData.checkbox.domNode.classList.remove("hide");
      templateData.checkbox.checked = element.checkbox.isChecked;
      templateData.checkbox.domNode.ariaLabel = element.checkbox.accessibilityInformation?.label ?? "";
      if (element.checkbox.accessibilityInformation?.role) {
        templateData.checkbox.domNode.role = element.checkbox.accessibilityInformation.role;
      }
    } else {
      templateData.checkbox.domNode.removeAttribute("tabindex");
      templateData.checkbox.domNode.classList.add("hide");
    }
    templateData.resourceLabel.setResource(
      {
        name: element.resource ? basename(element.resource) : element.label,
        description: element.description,
        resource: element.resource
      },
      {
        forceLabel: true,
        icon: element.icon,
        hideIcon: !element.resource && !element.icon
      }
    );
    const actions = [];
    if (element.openAction) {
      actions.push(element.openAction);
    }
    if (element.actions?.primary) {
      actions.push(...element.actions.primary);
    }
    templateData.actionBar.setActions(actions);
  }
};
ProfileResourceChildTreeItemRenderer.TEMPLATE_ID = "ProfileResourceChildTreeItemTemplate";
ProfileResourceChildTreeItemRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], ProfileResourceChildTreeItemRenderer);
const _WorkspaceUriEmptyColumnRenderer = class _WorkspaceUriEmptyColumnRenderer {
  constructor() {
    this.templateId = _WorkspaceUriEmptyColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    return {};
  }
  renderElement(item, index, templateData) {
  }
  disposeTemplate() {
  }
};
_WorkspaceUriEmptyColumnRenderer.TEMPLATE_ID = "empty";
let WorkspaceUriEmptyColumnRenderer = _WorkspaceUriEmptyColumnRenderer;
let WorkspaceUriHostColumnRenderer = class {
  constructor(uriIdentityService, labelService) {
    this.uriIdentityService = uriIdentityService;
    this.labelService = labelService;
    this.templateId = WorkspaceUriHostColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const renderDisposables = disposables.add(new DisposableStore());
    const element = container.appendChild($(".host"));
    const hostContainer = element.appendChild($("div.host-label"));
    const buttonBarContainer = element.appendChild($("div.button-bar"));
    return {
      element,
      hostContainer,
      buttonBarContainer,
      disposables,
      renderDisposables
    };
  }
  renderElement(item, index, templateData) {
    templateData.renderDisposables.clear();
    templateData.renderDisposables.add({ dispose: () => {
      clearNode(templateData.buttonBarContainer);
    } });
    templateData.hostContainer.innerText = getHostLabel(this.labelService, item.workspace);
    templateData.element.classList.toggle("current-workspace", this.uriIdentityService.extUri.isEqual(item.workspace, item.profileElement.getCurrentWorkspace()));
    templateData.hostContainer.style.display = "";
    templateData.buttonBarContainer.style.display = "none";
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
WorkspaceUriHostColumnRenderer.TEMPLATE_ID = "host";
WorkspaceUriHostColumnRenderer = __decorateClass([
  __decorateParam(0, IUriIdentityService),
  __decorateParam(1, ILabelService)
], WorkspaceUriHostColumnRenderer);
let WorkspaceUriPathColumnRenderer = class {
  constructor(uriIdentityService, hoverService) {
    this.uriIdentityService = uriIdentityService;
    this.hoverService = hoverService;
    this.templateId = WorkspaceUriPathColumnRenderer.TEMPLATE_ID;
    this.hoverDelegate = getDefaultHoverDelegate("mouse");
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const element = container.appendChild($(".path"));
    const pathLabel = element.appendChild($("div.path-label"));
    const pathHover = disposables.add(this.hoverService.setupManagedHover(this.hoverDelegate, pathLabel, ""));
    const renderDisposables = disposables.add(new DisposableStore());
    return {
      element,
      pathLabel,
      pathHover,
      disposables,
      renderDisposables
    };
  }
  renderElement(item, index, templateData) {
    templateData.renderDisposables.clear();
    const stringValue = this.formatPath(item.workspace);
    templateData.pathLabel.innerText = stringValue;
    templateData.element.classList.toggle("current-workspace", this.uriIdentityService.extUri.isEqual(item.workspace, item.profileElement.getCurrentWorkspace()));
    templateData.pathHover.update(stringValue);
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
    templateData.renderDisposables.dispose();
  }
  formatPath(uri) {
    if (uri.scheme === Schemas.file) {
      return normalizeDriveLetter(uri.fsPath);
    }
    if (uri.path.startsWith(posix.sep)) {
      const pathWithoutLeadingSeparator = uri.path.substring(1);
      const isWindowsPath = hasDriveLetter(pathWithoutLeadingSeparator, true);
      if (isWindowsPath) {
        return normalizeDriveLetter(win32.normalize(pathWithoutLeadingSeparator), true);
      }
    }
    return uri.path;
  }
};
WorkspaceUriPathColumnRenderer.TEMPLATE_ID = "path";
WorkspaceUriPathColumnRenderer = __decorateClass([
  __decorateParam(0, IUriIdentityService),
  __decorateParam(1, IHoverService)
], WorkspaceUriPathColumnRenderer);
let ChangeProfileAction = class {
  constructor(item, userDataProfilesService, uriIdentityService, environmentService) {
    this.item = item;
    this.userDataProfilesService = userDataProfilesService;
    this.id = "changeProfile";
    this.label = "Change Profile";
    this.class = ThemeIcon.asClassName(editIcon);
    this.tooltip = localize("change profile", "Change Profile");
    this.checked = false;
    this.enabled = !uriIdentityService.extUri.isEqual(item.workspace, environmentService.agentSessionsWorkspace);
  }
  run() {
  }
  getSwitchProfileActions() {
    return this.userDataProfilesService.profiles.filter((profile) => !profile.isInternal).sort((a, b) => a.isDefault ? -1 : b.isDefault ? 1 : a.name.localeCompare(b.name)).map((profile) => ({
      id: `switchProfileTo${profile.id}`,
      label: profile.name,
      class: void 0,
      enabled: true,
      checked: profile.id === this.item.profileElement.profile.id,
      tooltip: "",
      run: () => {
        if (profile.id === this.item.profileElement.profile.id) {
          return;
        }
        this.userDataProfilesService.updateProfile(profile, { workspaces: [...profile.workspaces ?? [], this.item.workspace] });
      }
    }));
  }
};
ChangeProfileAction = __decorateClass([
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, IEnvironmentService)
], ChangeProfileAction);
let WorkspaceUriActionsColumnRenderer = class {
  constructor(userDataProfilesService, userDataProfileManagementService, contextMenuService, uriIdentityService, environmentService) {
    this.userDataProfilesService = userDataProfilesService;
    this.userDataProfileManagementService = userDataProfileManagementService;
    this.contextMenuService = contextMenuService;
    this.uriIdentityService = uriIdentityService;
    this.environmentService = environmentService;
    this.templateId = WorkspaceUriActionsColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const element = container.appendChild($(".profile-workspaces-actions-container"));
    const hoverDelegate = disposables.add(createInstantHoverDelegate());
    const actionBar = disposables.add(new ActionBar(element, {
      hoverDelegate,
      actionViewItemProvider: (action) => {
        if (action instanceof ChangeProfileAction) {
          return new DropdownMenuActionViewItem(action, { getActions: () => action.getSwitchProfileActions() }, this.contextMenuService, {
            classNames: action.class,
            hoverDelegate
          });
        }
        return void 0;
      }
    }));
    return { actionBar, disposables };
  }
  renderElement(item, index, templateData) {
    templateData.actionBar.clear();
    const actions = [];
    actions.push(this.createOpenAction(item));
    actions.push(new ChangeProfileAction(item, this.userDataProfilesService, this.uriIdentityService, this.environmentService));
    actions.push(this.createDeleteAction(item));
    templateData.actionBar.push(actions, { icon: true });
  }
  createOpenAction(item) {
    return {
      label: "",
      class: ThemeIcon.asClassName(Codicon.window),
      enabled: !this.uriIdentityService.extUri.isEqual(item.workspace, item.profileElement.getCurrentWorkspace()),
      id: "openWorkspace",
      tooltip: localize("open", "Open in New Window"),
      run: () => item.profileElement.openWorkspace(item.workspace)
    };
  }
  createDeleteAction(item) {
    const isAgentSessionsWorkspace = this.uriIdentityService.extUri.isEqual(item.workspace, this.environmentService.agentSessionsWorkspace);
    return {
      label: "",
      class: ThemeIcon.asClassName(removeIcon),
      enabled: this.userDataProfileManagementService.getDefaultProfileToUse().id !== item.profileElement.profile.id && !isAgentSessionsWorkspace,
      id: "deleteTrustedUri",
      tooltip: localize("deleteTrustedUri", "Delete Path"),
      run: () => item.profileElement.updateWorkspaces([], [item.workspace])
    };
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
WorkspaceUriActionsColumnRenderer.TEMPLATE_ID = "actions";
WorkspaceUriActionsColumnRenderer = __decorateClass([
  __decorateParam(0, IUserDataProfilesService),
  __decorateParam(1, IUserDataProfileManagementService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, IEnvironmentService)
], WorkspaceUriActionsColumnRenderer);
function getHostLabel(labelService, workspaceUri) {
  return workspaceUri.authority ? labelService.getHostLabel(workspaceUri.scheme, workspaceUri.authority) : localize("localAuthority", "Local");
}
let UserDataProfilesEditorInput = class extends EditorInput {
  constructor(instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.resource = void 0;
    this._dirty = false;
    this.model = UserDataProfilesEditorModel.getInstance(this.instantiationService);
    this._register(this.model.onDidChange((e) => this.dirty = this.model.profiles.some((profile) => profile instanceof NewProfileElement)));
  }
  get dirty() {
    return this._dirty;
  }
  set dirty(dirty) {
    if (this._dirty !== dirty) {
      this._dirty = dirty;
      this._onDidChangeDirty.fire();
    }
  }
  get capabilities() {
    return EditorInputCapabilities.RequiresModal;
  }
  get typeId() {
    return UserDataProfilesEditorInput.ID;
  }
  getName() {
    return localize("userDataProfiles", "Profiles");
  }
  getIcon() {
    return defaultUserDataProfileIcon;
  }
  async resolve() {
    await this.model.resolve();
    return this.model;
  }
  isDirty() {
    return this.dirty;
  }
  async save() {
    await this.model.saveNewProfile();
    return this;
  }
  async revert() {
    this.model.revert();
  }
  matches(otherInput) {
    return otherInput instanceof UserDataProfilesEditorInput;
  }
  dispose() {
    for (const profile of this.model.profiles) {
      if (profile instanceof UserDataProfileElement) {
        profile.reset();
      }
    }
    super.dispose();
  }
};
UserDataProfilesEditorInput.ID = "workbench.input.userDataProfiles";
UserDataProfilesEditorInput = __decorateClass([
  __decorateParam(0, IInstantiationService)
], UserDataProfilesEditorInput);
class UserDataProfilesEditorInputSerializer {
  canSerialize(editorInput) {
    return true;
  }
  serialize(editorInput) {
    return "";
  }
  deserialize(instantiationService) {
    return instantiationService.createInstance(UserDataProfilesEditorInput);
  }
}
export {
  UserDataProfilesEditor,
  UserDataProfilesEditorInput,
  UserDataProfilesEditorInputSerializer,
  profilesSashBorder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3VzZXJEYXRhUHJvZmlsZS9icm93c2VyL3VzZXJEYXRhUHJvZmlsZXNFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvdXNlckRhdGFQcm9maWxlc0VkaXRvci5jc3MnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhcHBlbmQsIGNsZWFyTm9kZSwgRGltZW5zaW9uLCBFdmVudEhlbHBlciwgRXZlbnRUeXBlLCBJRG9tUG9zaXRpb24sIHRyYWNrRm9jdXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgSUFjdGlvbkNoYW5nZUV2ZW50LCBTZXBhcmF0b3IsIFN1Ym1lbnVBY3Rpb24sIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlLCBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIFByb2ZpbGVSZXNvdXJjZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFuZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgSUVkaXRvck9wZW5Db250ZXh0LCBJRWRpdG9yU2VyaWFsaXplciwgSVVudHlwZWRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzRWRpdG9yIH0gZnJvbSAnLi4vY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdFVzZXJEYXRhUHJvZmlsZUljb24sIElQcm9maWxlVGVtcGxhdGVJbmZvLCBJVXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UsIElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLCBQUk9GSUxFX0ZJTFRFUiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IE9yaWVudGF0aW9uLCBTaXppbmcsIFNwbGl0VmlldyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zcGxpdHZpZXcvc3BsaXR2aWV3LmpzJztcbmltcG9ydCB7IEJ1dHRvbiwgQnV0dG9uQmFyLCBCdXR0b25XaXRoRHJvcGRvd24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzLCBkZWZhdWx0Q2hlY2tib3hTdHlsZXMsIGRlZmF1bHRJbnB1dEJveFN0eWxlcywgZGVmYXVsdFNlbGVjdEJveFN0eWxlcywgZ2V0SW5wdXRCb3hTdHlsZSwgZ2V0TGlzdFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBlZGl0b3JCYWNrZ3JvdW5kLCBmb3JlZ3JvdW5kLCByZWdpc3RlckNvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUEFORUxfQk9SREVSIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWUsIFdvcmtiZW5jaExpc3QsIFdvcmtiZW5jaFRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENhY2hlZExpc3RWaXJ0dWFsRGVsZWdhdGUsIElMaXN0UmVuZGVyZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJQXN5bmNEYXRhU291cmNlLCBJVHJlZU5vZGUsIElUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJbnB1dEJveCwgTWVzc2FnZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgQ2hlY2tib3ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0lDT04sIElDT05TIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGVJY29ucy5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hJY29uU2VsZWN0Qm94IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2Jyb3dzZXIvaWNvblNlbGVjdEJveC5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSwgV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJSG92ZXJXaWRnZXQsIElNYW5hZ2VkSG92ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSVNlbGVjdE9wdGlvbkl0ZW0sIFNlbGVjdEJveCwgU2VwYXJhdG9yU2VsZWN0T3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NlbGVjdEJveC9zZWxlY3RCb3guanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcsIGlzVW5kZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgUmVuZGVySW5kZW50R3VpZGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYWJzdHJhY3RUcmVlLmpzJztcbmltcG9ydCB7IERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUiwgSVJlc291cmNlTGFiZWwsIFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgSUhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZS5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCwgaXNQcm9maWxlUmVzb3VyY2VDaGlsZEVsZW1lbnQsIGlzUHJvZmlsZVJlc291cmNlVHlwZUVsZW1lbnQsIElQcm9maWxlQ2hpbGRFbGVtZW50LCBJUHJvZmlsZVJlc291cmNlVHlwZUNoaWxkRWxlbWVudCwgSVByb2ZpbGVSZXNvdXJjZVR5cGVFbGVtZW50LCBOZXdQcm9maWxlRWxlbWVudCwgVXNlckRhdGFQcm9maWxlRWxlbWVudCwgVXNlckRhdGFQcm9maWxlc0VkaXRvck1vZGVsIH0gZnJvbSAnLi91c2VyRGF0YVByb2ZpbGVzRWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IGNyZWF0ZUluc3RhbnRIb3ZlckRlbGVnYXRlLCBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgUmFkaW8gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcmFkaW8vcmFkaW8uanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBzZXR0aW5nc1RleHRJbnB1dEJvcmRlciB9IGZyb20gJy4uLy4uL3ByZWZlcmVuY2VzL2NvbW1vbi9zZXR0aW5nc0VkaXRvckNvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgcmVuZGVyTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElUYWJsZVJlbmRlcmVyLCBJVGFibGVWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdGFibGUvdGFibGUuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBwb3NpeCwgd2luMzIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGhhc0RyaXZlTGV0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXh0cGF0aC5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVEcml2ZUxldHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2Ryb3Bkb3duL2Ryb3Bkb3duQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5cbmNvbnN0IGVkaXRJY29uID0gcmVnaXN0ZXJJY29uKCdwcm9maWxlcy1lZGl0b3ItZWRpdC1mb2xkZXInLCBDb2RpY29uLmVkaXQsIGxvY2FsaXplKCdlZGl0SWNvbicsICdJY29uIGZvciB0aGUgZWRpdCBmb2xkZXIgaWNvbiBpbiB0aGUgcHJvZmlsZXMgZWRpdG9yLicpKTtcbmNvbnN0IHJlbW92ZUljb24gPSByZWdpc3Rlckljb24oJ3Byb2ZpbGVzLWVkaXRvci1yZW1vdmUtZm9sZGVyJywgQ29kaWNvbi5jbG9zZSwgbG9jYWxpemUoJ3JlbW92ZUljb24nLCAnSWNvbiBmb3IgdGhlIHJlbW92ZSBmb2xkZXIgaWNvbiBpbiB0aGUgcHJvZmlsZXMgZWRpdG9yLicpKTtcblxuZXhwb3J0IGNvbnN0IHByb2ZpbGVzU2FzaEJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ3Byb2ZpbGVzLnNhc2hCb3JkZXInLCBQQU5FTF9CT1JERVIsIGxvY2FsaXplKCdwcm9maWxlc1Nhc2hCb3JkZXInLCBcIlRoZSBjb2xvciBvZiB0aGUgUHJvZmlsZXMgZWRpdG9yIHNwbGl0dmlldyBzYXNoIGJvcmRlci5cIikpO1xuXG5jb25zdCBsaXN0U3R5bGVzID0gZ2V0TGlzdFN0eWxlcyh7XG5cdGxpc3RBY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRsaXN0QWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZDogZm9yZWdyb3VuZCxcblx0bGlzdEZvY3VzQW5kU2VsZWN0aW9uQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0bGlzdEZvY3VzQW5kU2VsZWN0aW9uRm9yZWdyb3VuZDogZm9yZWdyb3VuZCxcblx0bGlzdEZvY3VzQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0bGlzdEZvY3VzRm9yZWdyb3VuZDogZm9yZWdyb3VuZCxcblx0bGlzdEhvdmVyRm9yZWdyb3VuZDogZm9yZWdyb3VuZCxcblx0bGlzdEhvdmVyQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0bGlzdEhvdmVyT3V0bGluZTogZWRpdG9yQmFja2dyb3VuZCxcblx0bGlzdEZvY3VzT3V0bGluZTogZWRpdG9yQmFja2dyb3VuZCxcblx0bGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0bGlzdEluYWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZDogZm9yZWdyb3VuZCxcblx0bGlzdEluYWN0aXZlRm9jdXNCYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRsaXN0SW5hY3RpdmVGb2N1c091dGxpbmU6IGVkaXRvckJhY2tncm91bmQsXG5cdHRyZWVJbmRlbnRHdWlkZXNTdHJva2U6IHVuZGVmaW5lZCxcblx0dHJlZUluYWN0aXZlSW5kZW50R3VpZGVzU3Ryb2tlOiB1bmRlZmluZWQsXG5cdHRhYmxlT2RkUm93c0JhY2tncm91bmRDb2xvcjogZWRpdG9yQmFja2dyb3VuZCxcbn0pO1xuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFQcm9maWxlc0VkaXRvciBleHRlbmRzIEVkaXRvclBhbmUgaW1wbGVtZW50cyBJVXNlckRhdGFQcm9maWxlc0VkaXRvciB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEOiBzdHJpbmcgPSAnd29ya2JlbmNoLmVkaXRvci51c2VyRGF0YVByb2ZpbGVzJztcblxuXHRwcml2YXRlIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3BsaXRWaWV3OiBTcGxpdFZpZXc8bnVtYmVyPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwcm9maWxlc0xpc3Q6IFdvcmtiZW5jaExpc3Q8QWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50PiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwcm9maWxlV2lkZ2V0OiBQcm9maWxlV2lkZ2V0IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgbW9kZWw6IFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JNb2RlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0ZW1wbGF0ZXM6IHJlYWRvbmx5IElQcm9maWxlVGVtcGxhdGVJbmZvW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRncm91cDogSUVkaXRvckdyb3VwLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihVc2VyRGF0YVByb2ZpbGVzRWRpdG9yLklELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdH1cblxuXHRsYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24sIHBvc2l0aW9uPzogSURvbVBvc2l0aW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY29udGFpbmVyICYmIHRoaXMuc3BsaXRWaWV3KSB7XG5cdFx0XHRjb25zdCBoZWlnaHQgPSBkaW1lbnNpb24uaGVpZ2h0IC0gMjA7XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5sYXlvdXQodGhpcy5jb250YWluZXI/LmNsaWVudFdpZHRoLCBoZWlnaHQpO1xuXHRcdFx0dGhpcy5zcGxpdFZpZXcuZWwuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy5wcm9maWxlcy1lZGl0b3InKSk7XG5cblx0XHRjb25zdCBzaWRlYmFyVmlldyA9IGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLnNpZGViYXItdmlldycpKTtcblx0XHRjb25zdCBzaWRlYmFyQ29udGFpbmVyID0gYXBwZW5kKHNpZGViYXJWaWV3LCAkKCcuc2lkZWJhci1jb250YWluZXInKSk7XG5cblx0XHRjb25zdCBjb250ZW50c1ZpZXcgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJy5jb250ZW50cy12aWV3JykpO1xuXHRcdGNvbnN0IGNvbnRlbnRzQ29udGFpbmVyID0gYXBwZW5kKGNvbnRlbnRzVmlldywgJCgnLmNvbnRlbnRzLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLnByb2ZpbGVXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb2ZpbGVXaWRnZXQsIGNvbnRlbnRzQ29udGFpbmVyKSk7XG5cblx0XHR0aGlzLnNwbGl0VmlldyA9IG5ldyBTcGxpdFZpZXcodGhpcy5jb250YWluZXIsIHtcblx0XHRcdG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5IT1JJWk9OVEFMLFxuXHRcdFx0cHJvcG9ydGlvbmFsTGF5b3V0OiB0cnVlXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlbmRlclNpZGViYXIoc2lkZWJhckNvbnRhaW5lcik7XG5cdFx0dGhpcy5zcGxpdFZpZXcuYWRkVmlldyh7XG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdGVsZW1lbnQ6IHNpZGViYXJWaWV3LFxuXHRcdFx0bWluaW11bVNpemU6IDIwMCxcblx0XHRcdG1heGltdW1TaXplOiAzNTAsXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aCwgXywgaGVpZ2h0KSA9PiB7XG5cdFx0XHRcdHNpZGViYXJWaWV3LnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRcdFx0XHRpZiAoaGVpZ2h0ICYmIHRoaXMucHJvZmlsZXNMaXN0KSB7XG5cdFx0XHRcdFx0Y29uc3QgbGlzdEhlaWdodCA9IGhlaWdodCAtIDQwIC8qIG5ldyBwcm9maWxlIGJ1dHRvbiAqLyAtIDE1IC8qIG1hcmdpblRvcCAqLztcblx0XHRcdFx0XHR0aGlzLnByb2ZpbGVzTGlzdC5nZXRIVE1MRWxlbWVudCgpLnN0eWxlLmhlaWdodCA9IGAke2xpc3RIZWlnaHR9cHhgO1xuXHRcdFx0XHRcdHRoaXMucHJvZmlsZXNMaXN0LmxheW91dChsaXN0SGVpZ2h0LCB3aWR0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCAzMDAsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0dGhpcy5zcGxpdFZpZXcuYWRkVmlldyh7XG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdGVsZW1lbnQ6IGNvbnRlbnRzVmlldyxcblx0XHRcdG1pbmltdW1TaXplOiA1NTAsXG5cdFx0XHRtYXhpbXVtU2l6ZTogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLFxuXHRcdFx0bGF5b3V0OiAod2lkdGgsIF8sIGhlaWdodCkgPT4ge1xuXHRcdFx0XHRjb250ZW50c1ZpZXcuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdFx0XHRcdGlmIChoZWlnaHQpIHtcblx0XHRcdFx0XHR0aGlzLnByb2ZpbGVXaWRnZXQ/LmxheW91dChuZXcgRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sIFNpemluZy5EaXN0cmlidXRlLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgYm9yZGVyQ29sb3IgPSB0aGlzLnRoZW1lLmdldENvbG9yKHByb2ZpbGVzU2FzaEJvcmRlcikhO1xuXHRcdHRoaXMuc3BsaXRWaWV3Py5zdHlsZSh7IHNlcGFyYXRvckJvcmRlcjogYm9yZGVyQ29sb3IgfSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclNpZGViYXIocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIHJlbmRlciBOZXcgUHJvZmlsZSBCdXR0b25cblx0XHR0aGlzLnJlbmRlck5ld1Byb2ZpbGVCdXR0b24oYXBwZW5kKHBhcmVudCwgJCgnLm5ldy1wcm9maWxlLWJ1dHRvbicpKSk7XG5cblx0XHQvLyByZW5kZXIgcHJvZmlsZXMgbGlzdFxuXHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9maWxlRWxlbWVudFJlbmRlcmVyKTtcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBQcm9maWxlRWxlbWVudERlbGVnYXRlKCk7XG5cdFx0dGhpcy5wcm9maWxlc0xpc3QgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaExpc3Q8QWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50PiwgJ1Byb2ZpbGVzTGlzdCcsXG5cdFx0XHRhcHBlbmQocGFyZW50LCAkKCcucHJvZmlsZXMtbGlzdCcpKSxcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0W3JlbmRlcmVyXSxcblx0XHRcdHtcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWwocHJvZmlsZUVsZW1lbnQ6IEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCB8IG51bGwpOiBzdHJpbmcge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHByb2ZpbGVFbGVtZW50Py5uYW1lID8/ICcnO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb2ZpbGVzJywgXCJQcm9maWxlc1wiKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9wZW5PblNpbmdsZUNsaWNrOiB0cnVlLFxuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0SWQoZSkge1xuXHRcdFx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlLnByb2ZpbGUuaWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gZS5uYW1lO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJOZXdQcm9maWxlQnV0dG9uKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBidXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uV2l0aERyb3Bkb3duKHBhcmVudCwge1xuXHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0XHRcdFx0aWYgKHRoaXMudGVtcGxhdGVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTdWJtZW51QWN0aW9uKCdmcm9tLnRlbXBsYXRlJywgbG9jYWxpemUoJ2Zyb20gdGVtcGxhdGUnLCBcIkZyb20gVGVtcGxhdGVcIiksIHRoaXMuZ2V0Q3JlYXRlRnJvbVRlbXBsYXRlQWN0aW9ucygpKSk7XG5cdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdGlkOiAnaW1wb3J0UHJvZmlsZScsXG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2ltcG9ydFByb2ZpbGUnLCBcIkltcG9ydCBQcm9maWxlLi4uXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmltcG9ydFByb2ZpbGUoKVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRyZXR1cm4gYWN0aW9ucztcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFkZFByaW1hcnlBY3Rpb25Ub0Ryb3Bkb3duOiBmYWxzZSxcblx0XHRcdGNvbnRleHRNZW51UHJvdmlkZXI6IHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlc1xuXHRcdH0pKTtcblx0XHRidXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnbmV3UHJvZmlsZScsIFwiTmV3IFByb2ZpbGVcIik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYnV0dG9uLm9uRGlkQ2xpY2soZSA9PiB0aGlzLmNyZWF0ZU5ld1Byb2ZpbGUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDcmVhdGVGcm9tVGVtcGxhdGVBY3Rpb25zKCk6IElBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMudGVtcGxhdGVzLm1hcCh0ZW1wbGF0ZSA9PlxuXHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRpZDogYHRlbXBsYXRlOiR7dGVtcGxhdGUudXJsfWAsXG5cdFx0XHRcdGxhYmVsOiB0ZW1wbGF0ZS5uYW1lLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuY3JlYXRlTmV3UHJvZmlsZShVUkkucGFyc2UodGVtcGxhdGUudXJsKSlcblx0XHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucHJvZmlsZXNMaXN0KSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnByb2ZpbGVzTGlzdC5vbkRpZENoYW5nZVNlbGVjdGlvbihlID0+IHtcblx0XHRcdFx0Y29uc3QgW2VsZW1lbnRdID0gZS5lbGVtZW50cztcblx0XHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdFx0XHR0aGlzLnByb2ZpbGVXaWRnZXQ/LnJlbmRlcihlbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wcm9maWxlc0xpc3Qub25Db250ZXh0TWVudShlID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0XHRcdGlmICghZS5lbGVtZW50KSB7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKC4uLnRoaXMuZ2V0VHJlZUNvbnRleHRNZW51QWN0aW9ucygpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5lbGVtZW50IGluc3RhbmNlb2YgQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKC4uLmUuZWxlbWVudC5hY3Rpb25zWzFdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRcdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gZS5lbGVtZW50XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucHJvZmlsZXNMaXN0Lm9uTW91c2VEYmxDbGljayhlID0+IHtcblx0XHRcdFx0aWYgKCFlLmVsZW1lbnQpIHtcblx0XHRcdFx0XHR0aGlzLmNyZWF0ZU5ld1Byb2ZpbGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0VHJlZUNvbnRleHRNZW51QWN0aW9ucygpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRpZDogJ25ld1Byb2ZpbGUnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCduZXdQcm9maWxlJywgXCJOZXcgUHJvZmlsZVwiKSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jcmVhdGVOZXdQcm9maWxlKClcblx0XHR9KSk7XG5cdFx0Y29uc3QgdGVtcGxhdGVBY3Rpb25zID0gdGhpcy5nZXRDcmVhdGVGcm9tVGVtcGxhdGVBY3Rpb25zKCk7XG5cdFx0aWYgKHRlbXBsYXRlQWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdGFjdGlvbnMucHVzaChuZXcgU3VibWVudUFjdGlvbignZnJvbS50ZW1wbGF0ZScsIGxvY2FsaXplKCduZXcgZnJvbSB0ZW1wbGF0ZScsIFwiTmV3IFByb2ZpbGUgRnJvbSBUZW1wbGF0ZVwiKSwgdGVtcGxhdGVBY3Rpb25zKSk7XG5cdFx0fVxuXHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRpZDogJ2ltcG9ydFByb2ZpbGUnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdpbXBvcnRQcm9maWxlJywgXCJJbXBvcnQgUHJvZmlsZS4uLlwiKSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5pbXBvcnRQcm9maWxlKClcblx0XHR9KSk7XG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGltcG9ydFByb2ZpbGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKCkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlUXVpY2tQaWNrSXRlbXMgPSAodmFsdWU/OiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IHF1aWNrUGlja0l0ZW1zOiBJUXVpY2tQaWNrSXRlbVtdID0gW107XG5cdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0cXVpY2tQaWNrSXRlbXMucHVzaCh7IGxhYmVsOiBxdWlja1BpY2sudmFsdWUsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW1wb3J0IGZyb20gdXJsJywgXCJJbXBvcnQgZnJvbSBVUkxcIikgfSk7XG5cdFx0XHR9XG5cdFx0XHRxdWlja1BpY2tJdGVtcy5wdXNoKHsgbGFiZWw6IGxvY2FsaXplKCdpbXBvcnQgZnJvbSBmaWxlJywgXCJTZWxlY3QgRmlsZS4uLlwiKSB9KTtcblx0XHRcdHF1aWNrUGljay5pdGVtcyA9IHF1aWNrUGlja0l0ZW1zO1xuXHRcdH07XG5cblx0XHRxdWlja1BpY2sudGl0bGUgPSBsb2NhbGl6ZSgnaW1wb3J0IHByb2ZpbGUgcXVpY2sgcGljayB0aXRsZScsIFwiSW1wb3J0IGZyb20gUHJvZmlsZSBUZW1wbGF0ZS4uLlwiKTtcblx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnaW1wb3J0IHByb2ZpbGUgcGxhY2Vob2xkZXInLCBcIlByb3ZpZGUgUHJvZmlsZSBUZW1wbGF0ZSBVUkxcIik7XG5cdFx0cXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkQ2hhbmdlVmFsdWUodXBkYXRlUXVpY2tQaWNrSXRlbXMpKTtcblx0XHR1cGRhdGVRdWlja1BpY2tJdGVtcygpO1xuXHRcdHF1aWNrUGljay5tYXRjaE9uTGFiZWwgPSBmYWxzZTtcblx0XHRxdWlja1BpY2subWF0Y2hPbkRlc2NyaXB0aW9uID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdChhc3luYyAoKSA9PiB7XG5cdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtID0gcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRpZiAoIXNlbGVjdGVkSXRlbSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cmwgPSBzZWxlY3RlZEl0ZW0ubGFiZWwgPT09IHF1aWNrUGljay52YWx1ZSA/IFVSSS5wYXJzZShxdWlja1BpY2sudmFsdWUpIDogYXdhaXQgdGhpcy5nZXRQcm9maWxlVXJpRnJvbUZpbGVTeXN0ZW0oKTtcblx0XHRcdGlmICh1cmwpIHtcblx0XHRcdFx0dGhpcy5jcmVhdGVOZXdQcm9maWxlKHVybCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXHRcdHF1aWNrUGljay5zaG93KCk7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVOZXdQcm9maWxlKGNvcHlGcm9tPzogVVJJIHwgSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMubW9kZWw/LmNyZWF0ZU5ld1Byb2ZpbGUoY29weUZyb20pO1xuXHR9XG5cblx0c2VsZWN0UHJvZmlsZShwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLm1vZGVsPy5wcm9maWxlcy5maW5kSW5kZXgocCA9PiBwIGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCAmJiBwLnByb2ZpbGUuaWQgPT09IHByb2ZpbGUuaWQpO1xuXHRcdGlmIChpbmRleCAhPT0gdW5kZWZpbmVkICYmIGluZGV4ID49IDApIHtcblx0XHRcdHRoaXMucHJvZmlsZXNMaXN0Py5zZXRTZWxlY3Rpb24oW2luZGV4XSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRQcm9maWxlVXJpRnJvbUZpbGVTeXN0ZW0oKTogUHJvbWlzZTxVUkkgfCBudWxsPiB7XG5cdFx0Y29uc3QgcHJvZmlsZUxvY2F0aW9uID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRjYW5TZWxlY3RGb2xkZXJzOiBmYWxzZSxcblx0XHRcdGNhblNlbGVjdEZpbGVzOiB0cnVlLFxuXHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0XHRmaWx0ZXJzOiBQUk9GSUxFX0ZJTFRFUixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnaW1wb3J0IHByb2ZpbGUgZGlhbG9nJywgXCJTZWxlY3QgUHJvZmlsZSBUZW1wbGF0ZSBGaWxlXCIpLFxuXHRcdH0pO1xuXHRcdGlmICghcHJvZmlsZUxvY2F0aW9uKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHByb2ZpbGVMb2NhdGlvblswXTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNldElucHV0KGlucHV0OiBVc2VyRGF0YVByb2ZpbGVzRWRpdG9ySW5wdXQsIG9wdGlvbnM6IElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0dGhpcy5tb2RlbCA9IGF3YWl0IGlucHV0LnJlc29sdmUoKTtcblx0XHR0aGlzLm1vZGVsLmdldFRlbXBsYXRlcygpLnRoZW4odGVtcGxhdGVzID0+IHtcblx0XHRcdHRoaXMudGVtcGxhdGVzID0gdGVtcGxhdGVzO1xuXHRcdFx0aWYgKHRoaXMucHJvZmlsZVdpZGdldCkge1xuXHRcdFx0XHR0aGlzLnByb2ZpbGVXaWRnZXQudGVtcGxhdGVzID0gdGVtcGxhdGVzO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMudXBkYXRlUHJvZmlsZXNMaXN0KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbC5vbkRpZENoYW5nZShlbGVtZW50ID0+XG5cdFx0XHR0aGlzLnVwZGF0ZVByb2ZpbGVzTGlzdChlbGVtZW50KSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHR0aGlzLnByb2ZpbGVzTGlzdD8uZG9tRm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUHJvZmlsZXNMaXN0KGVsZW1lbnRUb1NlbGVjdD86IEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5tb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjdXJyZW50U2VsZWN0aW9uSW5kZXggPSB0aGlzLnByb2ZpbGVzTGlzdD8uZ2V0U2VsZWN0aW9uKCk/LlswXTtcblx0XHRjb25zdCBjdXJyZW50U2VsZWN0aW9uID0gY3VycmVudFNlbGVjdGlvbkluZGV4ICE9PSB1bmRlZmluZWQgPyB0aGlzLnByb2ZpbGVzTGlzdD8uZWxlbWVudChjdXJyZW50U2VsZWN0aW9uSW5kZXgpIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMucHJvZmlsZXNMaXN0Py5zcGxpY2UoMCwgdGhpcy5wcm9maWxlc0xpc3QubGVuZ3RoLCB0aGlzLm1vZGVsLnByb2ZpbGVzKTtcblxuXHRcdGlmIChlbGVtZW50VG9TZWxlY3QpIHtcblx0XHRcdHRoaXMucHJvZmlsZXNMaXN0Py5zZXRTZWxlY3Rpb24oW3RoaXMubW9kZWwucHJvZmlsZXMuaW5kZXhPZihlbGVtZW50VG9TZWxlY3QpXSk7XG5cdFx0fSBlbHNlIGlmIChjdXJyZW50U2VsZWN0aW9uKSB7XG5cdFx0XHRpZiAoIXRoaXMubW9kZWwucHJvZmlsZXMuaW5jbHVkZXMoY3VycmVudFNlbGVjdGlvbikpIHtcblx0XHRcdFx0Y29uc3QgZWxlbWVudFRvU2VsZWN0ID0gdGhpcy5tb2RlbC5wcm9maWxlcy5maW5kKHByb2ZpbGUgPT4gcHJvZmlsZS5uYW1lID09PSBjdXJyZW50U2VsZWN0aW9uLm5hbWUpID8/IHRoaXMubW9kZWwucHJvZmlsZXNbMF07XG5cdFx0XHRcdGlmIChlbGVtZW50VG9TZWxlY3QpIHtcblx0XHRcdFx0XHR0aGlzLnByb2ZpbGVzTGlzdD8uc2V0U2VsZWN0aW9uKFt0aGlzLm1vZGVsLnByb2ZpbGVzLmluZGV4T2YoZWxlbWVudFRvU2VsZWN0KV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGVsZW1lbnRUb1NlbGVjdCA9IHRoaXMubW9kZWwucHJvZmlsZXMuZmluZChwcm9maWxlID0+IHByb2ZpbGUuYWN0aXZlKSA/PyB0aGlzLm1vZGVsLnByb2ZpbGVzWzBdO1xuXHRcdFx0aWYgKGVsZW1lbnRUb1NlbGVjdCkge1xuXHRcdFx0XHR0aGlzLnByb2ZpbGVzTGlzdD8uc2V0U2VsZWN0aW9uKFt0aGlzLm1vZGVsLnByb2ZpbGVzLmluZGV4T2YoZWxlbWVudFRvU2VsZWN0KV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG59XG5cbmludGVyZmFjZSBJUHJvZmlsZUVsZW1lbnRUZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBpY29uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgbGFiZWw6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkaXJ0eTogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgUHJvZmlsZUVsZW1lbnREZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudD4ge1xuXHRnZXRIZWlnaHQoZWxlbWVudDogQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50KSB7XG5cdFx0cmV0dXJuIDIyO1xuXHR9XG5cdGdldFRlbXBsYXRlSWQoKSB7IHJldHVybiAncHJvZmlsZUxpc3RFbGVtZW50JzsgfVxufVxuXG5jbGFzcyBQcm9maWxlRWxlbWVudFJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQsIElQcm9maWxlRWxlbWVudFRlbXBsYXRlRGF0YT4ge1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSAncHJvZmlsZUxpc3RFbGVtZW50JztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVByb2ZpbGVFbGVtZW50VGVtcGxhdGVEYXRhIHtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdwcm9maWxlLWxpc3QtaXRlbScpO1xuXHRcdGNvbnN0IGljb24gPSBhcHBlbmQoY29udGFpbmVyLCAkKCcucHJvZmlsZS1saXN0LWl0ZW0taWNvbicpKTtcblx0XHRjb25zdCBsYWJlbCA9IGFwcGVuZChjb250YWluZXIsICQoJy5wcm9maWxlLWxpc3QtaXRlbS1sYWJlbCcpKTtcblx0XHRjb25zdCBkaXJ0eSA9IGFwcGVuZChjb250YWluZXIsICQoYHNwYW4ke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKENvZGljb24uY2lyY2xlRmlsbGVkKX1gKSk7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBhcHBlbmQoY29udGFpbmVyLCAkKCcucHJvZmlsZS1saXN0LWl0ZW0tZGVzY3JpcHRpb24nKSk7XG5cdFx0YXBwZW5kKGRlc2NyaXB0aW9uLCAkKGBzcGFuJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihDb2RpY29uLmNoZWNrKX1gKSwgJCgnc3BhbicsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2FjdGl2ZVByb2ZpbGUnLCBcIkFjdGl2ZVwiKSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5wcm9maWxlLXRyZWUtaXRlbS1hY3Rpb25zLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hUb29sQmFyLFxuXHRcdFx0YWN0aW9uc0NvbnRhaW5lcixcblx0XHRcdHtcblx0XHRcdFx0aG92ZXJEZWxlZ2F0ZTogZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZUluc3RhbnRIb3ZlckRlbGVnYXRlKCkpLFxuXHRcdFx0XHRoaWdobGlnaHRUb2dnbGVkSXRlbXM6IHRydWVcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdHJldHVybiB7IGxhYmVsLCBpY29uLCBkaXJ0eSwgZGVzY3JpcHRpb24sIGFjdGlvbkJhciwgZGlzcG9zYWJsZXMsIGVsZW1lbnREaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVByb2ZpbGVFbGVtZW50VGVtcGxhdGVEYXRhKSB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC50ZXh0Q29udGVudCA9IGVsZW1lbnQubmFtZTtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuY2xhc3NMaXN0LnRvZ2dsZSgnbmV3LXByb2ZpbGUnLCBlbGVtZW50IGluc3RhbmNlb2YgTmV3UHJvZmlsZUVsZW1lbnQpO1xuXHRcdHRlbXBsYXRlRGF0YS5pY29uLmNsYXNzTmFtZSA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShlbGVtZW50Lmljb24gPyBUaGVtZUljb24uZnJvbUlkKGVsZW1lbnQuaWNvbikgOiBERUZBVUxUX0lDT04pO1xuXHRcdHRlbXBsYXRlRGF0YS5kaXJ0eS5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlJywgIShlbGVtZW50IGluc3RhbmNlb2YgTmV3UHJvZmlsZUVsZW1lbnQpKTtcblx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24uY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZScsICFlbGVtZW50LmFjdGl2ZSk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoZWxlbWVudC5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLm5hbWUpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnRleHRDb250ZW50ID0gZWxlbWVudC5uYW1lO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuaWNvbikge1xuXHRcdFx0XHRpZiAoZWxlbWVudC5pY29uKSB7XG5cdFx0XHRcdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKFRoZW1lSWNvbi5mcm9tSWQoZWxlbWVudC5pY29uKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gJ2hpZGUnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hY3RpdmUpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmRlc2NyaXB0aW9uLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGUnLCAhZWxlbWVudC5hY3RpdmUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBzZXRBY3Rpb25zID0gKCkgPT4gdGVtcGxhdGVEYXRhLmFjdGlvbkJhci5zZXRBY3Rpb25zKGVsZW1lbnQuYWN0aW9uc1swXS5maWx0ZXIoYSA9PiBhLmVuYWJsZWQpLCBlbGVtZW50LmFjdGlvbnNbMV0uZmlsdGVyKGEgPT4gYS5lbmFibGVkKSk7XG5cdFx0c2V0QWN0aW9ucygpO1xuXHRcdGNvbnN0IGV2ZW50czogRXZlbnQ8SUFjdGlvbkNoYW5nZUV2ZW50PltdID0gW107XG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgZWxlbWVudC5hY3Rpb25zLmZsYXQoKSkge1xuXHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIEFjdGlvbikge1xuXHRcdFx0XHRldmVudHMucHVzaChhY3Rpb24ub25EaWRDaGFuZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChFdmVudC5hbnkoLi4uZXZlbnRzKShlID0+IHtcblx0XHRcdGlmIChlLmVuYWJsZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRzZXRBY3Rpb25zKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVByb2ZpbGVFbGVtZW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVByb2ZpbGVFbGVtZW50VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBQcm9maWxlV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm9maWxlVGl0bGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGJ1aWx0SW5MYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvZmlsZVRyZWVDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGJ1dHRvbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm9maWxlVHJlZTogV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQsIFByb2ZpbGVUcmVlRWxlbWVudD47XG5cdHByaXZhdGUgcmVhZG9ubHkgY29weUZyb21Qcm9maWxlUmVuZGVyZXI6IENvcHlGcm9tUHJvZmlsZVJlbmRlcmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9maWxlRWxlbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTx7IGVsZW1lbnQ6IEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCB9ICYgSURpc3Bvc2FibGU+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0UGFydGljaXBhbnRzOiB7IGxheW91dDogKCkgPT4gdm9pZCB9W10gPSBbXTtcblxuXHRwdWJsaWMgc2V0IHRlbXBsYXRlcyh0ZW1wbGF0ZXM6IHJlYWRvbmx5IElQcm9maWxlVGVtcGxhdGVJbmZvW10pIHtcblx0XHR0aGlzLmNvcHlGcm9tUHJvZmlsZVJlbmRlcmVyLnNldFRlbXBsYXRlcyh0ZW1wbGF0ZXMpO1xuXHRcdHRoaXMucHJvZmlsZVRyZWUucmVyZW5kZXIoKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0QElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JQcm9ncmVzc1NlcnZpY2U6IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBoZWFkZXIgPSBhcHBlbmQocGFyZW50LCAkKCcucHJvZmlsZS1oZWFkZXInKSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBhcHBlbmQoaGVhZGVyLCAkKCcucHJvZmlsZS10aXRsZS1jb250YWluZXInKSk7XG5cdFx0dGhpcy5wcm9maWxlVGl0bGUgPSBhcHBlbmQodGl0bGUsICQoJy5wcm9maWxlLXRpdGxlJykpO1xuXHRcdHRoaXMuYnVpbHRJbkxhYmVsID0gYXBwZW5kKHRpdGxlLCAkKCcucHJvZmlsZS1idWlsdC1pbi1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2J1aWx0SW4nLCBcIkJ1aWx0LWluXCIpKSk7XG5cdFx0dGhpcy5idWlsdEluTGFiZWwuY2xhc3NMaXN0LmFkZCgnaGlkZScpO1xuXG5cdFx0Y29uc3QgYm9keSA9IGFwcGVuZChwYXJlbnQsICQoJy5wcm9maWxlLWJvZHknKSk7XG5cblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBQcm9maWxlVHJlZURlbGVnYXRlKCk7XG5cdFx0Y29uc3QgY29udGVudHNSZW5kZXJlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29udGVudHNQcm9maWxlUmVuZGVyZXIpKTtcblx0XHRjb25zdCBhc3NvY2lhdGlvbnNSZW5kZXJlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvZmlsZVdvcmtzcGFjZXNSZW5kZXJlcikpO1xuXHRcdHRoaXMubGF5b3V0UGFydGljaXBhbnRzLnB1c2goYXNzb2NpYXRpb25zUmVuZGVyZXIpO1xuXHRcdHRoaXMuY29weUZyb21Qcm9maWxlUmVuZGVyZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvcHlGcm9tUHJvZmlsZVJlbmRlcmVyKSk7XG5cdFx0dGhpcy5wcm9maWxlVHJlZUNvbnRhaW5lciA9IGFwcGVuZChib2R5LCAkKCcucHJvZmlsZS10cmVlJykpO1xuXHRcdHRoaXMucHJvZmlsZVRyZWUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8QWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50LCBQcm9maWxlVHJlZUVsZW1lbnQ+LFxuXHRcdFx0J1Byb2ZpbGVFZGl0b3ItVHJlZScsXG5cdFx0XHR0aGlzLnByb2ZpbGVUcmVlQ29udGFpbmVyLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRbXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvZmlsZU5hbWVSZW5kZXJlcikpLFxuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb2ZpbGVJY29uUmVuZGVyZXIpKSxcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VGb3JDdXJyZW50V2luZG93UHJvcGVydHlSZW5kZXJlcikpLFxuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZUFzRGVmYXVsdFByb2ZpbGVSZW5kZXJlcikpLFxuXHRcdFx0XHR0aGlzLmNvcHlGcm9tUHJvZmlsZVJlbmRlcmVyLFxuXHRcdFx0XHRjb250ZW50c1JlbmRlcmVyLFxuXHRcdFx0XHRhc3NvY2lhdGlvbnNSZW5kZXJlcixcblx0XHRcdF0sXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb2ZpbGVUcmVlRGF0YVNvdXJjZSksXG5cdFx0XHR7XG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWwoZWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50IHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudD8uZWxlbWVudCA/PyAnJztcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdFx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZChlbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5lbGVtZW50O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrOiB0cnVlLFxuXHRcdFx0XHRyZW5kZXJJbmRlbnRHdWlkZXM6IFJlbmRlckluZGVudEd1aWRlcy5Ob25lLFxuXHRcdFx0XHRlbmFibGVTdGlja3lTY3JvbGw6IGZhbHNlLFxuXHRcdFx0XHRvcGVuT25TaW5nbGVDbGljazogZmFsc2UsXG5cdFx0XHRcdHNldFJvd0xpbmVIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRzdXBwb3J0RHluYW1pY0hlaWdodHM6IHRydWUsXG5cdFx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiBmYWxzZSxcblx0XHRcdH0pKTtcblxuXHRcdHRoaXMucHJvZmlsZVRyZWUuc3R5bGUobGlzdFN0eWxlcyk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb250ZW50c1JlbmRlcmVyLm9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCgoZSkgPT4gdGhpcy5wcm9maWxlVHJlZS51cGRhdGVFbGVtZW50SGVpZ2h0KGUsIHVuZGVmaW5lZCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihhc3NvY2lhdGlvbnNSZW5kZXJlci5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoKGUpID0+IHRoaXMucHJvZmlsZVRyZWUudXBkYXRlRWxlbWVudEhlaWdodChlLCB1bmRlZmluZWQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29udGVudHNSZW5kZXJlci5vbkRpZENoYW5nZVNlbGVjdGlvbigoZSkgPT4ge1xuXHRcdFx0aWYgKGUuc2VsZWN0ZWQpIHtcblx0XHRcdFx0dGhpcy5wcm9maWxlVHJlZS5zZXRGb2N1cyhbXSk7XG5cdFx0XHRcdHRoaXMucHJvZmlsZVRyZWUuc2V0U2VsZWN0aW9uKFtdKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnByb2ZpbGVUcmVlLm9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCgoZSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnByb2ZpbGVUcmVlLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5lbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0Y29udGVudHNSZW5kZXJlci5jbGVhclNlbGVjdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuYnV0dG9uQ29udGFpbmVyID0gYXBwZW5kKGJvZHksICQoJy5wcm9maWxlLXJvdy1jb250YWluZXIucHJvZmlsZS1idXR0b24tY29udGFpbmVyJykpO1xuXHR9XG5cblx0cHJpdmF0ZSBkaW1lbnNpb246IERpbWVuc2lvbiB8IHVuZGVmaW5lZDtcblx0bGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cdFx0Y29uc3QgdHJlZUNvbnRlbnRIZWlnaHQgPSB0aGlzLnByb2ZpbGVUcmVlLmNvbnRlbnRIZWlnaHQ7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gTWF0aC5taW4odHJlZUNvbnRlbnRIZWlnaHQsIGRpbWVuc2lvbi5oZWlnaHQgLSAodGhpcy5fcHJvZmlsZUVsZW1lbnQudmFsdWU/LmVsZW1lbnQgaW5zdGFuY2VvZiBOZXdQcm9maWxlRWxlbWVudCA/IDExNiA6IDU0KSk7XG5cdFx0dGhpcy5wcm9maWxlVHJlZUNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHRcdHRoaXMucHJvZmlsZVRyZWUubGF5b3V0KGhlaWdodCwgZGltZW5zaW9uLndpZHRoKTtcblx0XHRmb3IgKGNvbnN0IHBhcnRpY2lwYW50IG9mIHRoaXMubGF5b3V0UGFydGljaXBhbnRzKSB7XG5cdFx0XHRwYXJ0aWNpcGFudC5sYXlvdXQoKTtcblx0XHR9XG5cdH1cblxuXHRyZW5kZXIocHJvZmlsZUVsZW1lbnQ6IEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wcm9maWxlRWxlbWVudC52YWx1ZT8uZWxlbWVudCA9PT0gcHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcHJvZmlsZUVsZW1lbnQudmFsdWU/LmVsZW1lbnQgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHR0aGlzLl9wcm9maWxlRWxlbWVudC52YWx1ZS5lbGVtZW50LnJlc2V0KCk7XG5cdFx0fVxuXHRcdHRoaXMucHJvZmlsZVRyZWUuc2V0SW5wdXQocHJvZmlsZUVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fcHJvZmlsZUVsZW1lbnQudmFsdWUgPSB7IGVsZW1lbnQ6IHByb2ZpbGVFbGVtZW50LCBkaXNwb3NlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkgfTtcblxuXHRcdHRoaXMucHJvZmlsZVRpdGxlLnRleHRDb250ZW50ID0gcHJvZmlsZUVsZW1lbnQubmFtZTtcblx0XHR0aGlzLmJ1aWx0SW5MYWJlbC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlJywgIShwcm9maWxlRWxlbWVudCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQgJiYgcHJvZmlsZUVsZW1lbnQucHJvZmlsZS5pc0RlZmF1bHQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvZmlsZUVsZW1lbnQub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5uYW1lKSB7XG5cdFx0XHRcdHRoaXMucHJvZmlsZVRpdGxlLnRleHRDb250ZW50ID0gcHJvZmlsZUVsZW1lbnQubmFtZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBbcHJpbWFyeVRpdGxlQnV0dG9ucywgc2Vjb25kYXR5VGl0bGVCdXR0b25zXSA9IHByb2ZpbGVFbGVtZW50LnRpdGxlQnV0dG9ucztcblx0XHRpZiAocHJpbWFyeVRpdGxlQnV0dG9ucz8ubGVuZ3RoIHx8IHNlY29uZGF0eVRpdGxlQnV0dG9ucz8ubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmJ1dHRvbkNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdoaWRlJyk7XG5cblx0XHRcdGlmIChzZWNvbmRhdHlUaXRsZUJ1dHRvbnM/Lmxlbmd0aCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBzZWNvbmRhdHlUaXRsZUJ1dHRvbnMpIHtcblx0XHRcdFx0XHRjb25zdCBidXR0b24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbih0aGlzLmJ1dHRvbkNvbnRhaW5lciwge1xuXHRcdFx0XHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlcyxcblx0XHRcdFx0XHRcdHNlY29uZGFyeTogdHJ1ZVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRidXR0b24ubGFiZWwgPSBhY3Rpb24ubGFiZWw7XG5cdFx0XHRcdFx0YnV0dG9uLmVuYWJsZWQgPSBhY3Rpb24uZW5hYmxlZDtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5lZGl0b3JQcm9ncmVzc1NlcnZpY2Uuc2hvd1doaWxlKGFjdGlvbi5ydW4oKSkpKTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWN0aW9uLm9uRGlkQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIWlzVW5kZWZpbmVkKGUuZW5hYmxlZCkpIHtcblx0XHRcdFx0XHRcdFx0YnV0dG9uLmVuYWJsZWQgPSBhY3Rpb24uZW5hYmxlZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICghaXNVbmRlZmluZWQoZS5sYWJlbCkpIHtcblx0XHRcdFx0XHRcdFx0YnV0dG9uLmxhYmVsID0gYWN0aW9uLmxhYmVsO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAocHJpbWFyeVRpdGxlQnV0dG9ucz8ubGVuZ3RoKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIHByaW1hcnlUaXRsZUJ1dHRvbnMpIHtcblx0XHRcdFx0XHRjb25zdCBidXR0b24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbih0aGlzLmJ1dHRvbkNvbnRhaW5lciwge1xuXHRcdFx0XHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlc1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRidXR0b24ubGFiZWwgPSBhY3Rpb24ubGFiZWw7XG5cdFx0XHRcdFx0YnV0dG9uLmVuYWJsZWQgPSBhY3Rpb24uZW5hYmxlZDtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5lZGl0b3JQcm9ncmVzc1NlcnZpY2Uuc2hvd1doaWxlKGFjdGlvbi5ydW4oKSkpKTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWN0aW9uLm9uRGlkQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIWlzVW5kZWZpbmVkKGUuZW5hYmxlZCkpIHtcblx0XHRcdFx0XHRcdFx0YnV0dG9uLmVuYWJsZWQgPSBhY3Rpb24uZW5hYmxlZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICghaXNVbmRlZmluZWQoZS5sYWJlbCkpIHtcblx0XHRcdFx0XHRcdFx0YnV0dG9uLmxhYmVsID0gYWN0aW9uLmxhYmVsO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocHJvZmlsZUVsZW1lbnQub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZS5tZXNzYWdlKSB7XG5cdFx0XHRcdFx0XHRcdGJ1dHRvbi5zZXRUaXRsZShwcm9maWxlRWxlbWVudC5tZXNzYWdlID8/IGFjdGlvbi5sYWJlbCk7XG5cdFx0XHRcdFx0XHRcdGJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2Vycm9yJywgISFwcm9maWxlRWxlbWVudC5tZXNzYWdlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmJ1dHRvbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRlJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHByb2ZpbGVFbGVtZW50IGluc3RhbmNlb2YgTmV3UHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdHRoaXMucHJvZmlsZVRyZWUuZm9jdXNGaXJzdCgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdH1cblx0fVxuXG59XG5cbnR5cGUgUHJvZmlsZVByb3BlcnR5ID0gJ25hbWUnIHwgJ2ljb24nIHwgJ2NvcHlGcm9tJyB8ICd1c2VGb3JDdXJyZW50JyB8ICd1c2VBc0RlZmF1bHQnIHwgJ2NvbnRlbnRzJyB8ICd3b3Jrc3BhY2VzJztcblxuaW50ZXJmYWNlIFByb2ZpbGVUcmVlRWxlbWVudCB7XG5cdGVsZW1lbnQ6IFByb2ZpbGVQcm9wZXJ0eTtcblx0cm9vdDogQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50O1xufVxuXG5jbGFzcyBQcm9maWxlVHJlZURlbGVnYXRlIGV4dGVuZHMgQ2FjaGVkTGlzdFZpcnR1YWxEZWxlZ2F0ZTxQcm9maWxlVHJlZUVsZW1lbnQ+IHtcblxuXHRnZXRUZW1wbGF0ZUlkKHsgZWxlbWVudCB9OiBQcm9maWxlVHJlZUVsZW1lbnQpIHtcblx0XHRyZXR1cm4gZWxlbWVudDtcblx0fVxuXG5cdGhhc0R5bmFtaWNIZWlnaHQoeyBlbGVtZW50IH06IFByb2ZpbGVUcmVlRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBlbGVtZW50ID09PSAnY29udGVudHMnIHx8IGVsZW1lbnQgPT09ICd3b3Jrc3BhY2VzJztcblx0fVxuXG5cdHByb3RlY3RlZCBlc3RpbWF0ZUhlaWdodCh7IGVsZW1lbnQsIHJvb3QgfTogUHJvZmlsZVRyZWVFbGVtZW50KTogbnVtYmVyIHtcblx0XHRzd2l0Y2ggKGVsZW1lbnQpIHtcblx0XHRcdGNhc2UgJ25hbWUnOlxuXHRcdFx0XHRyZXR1cm4gNzI7XG5cdFx0XHRjYXNlICdpY29uJzpcblx0XHRcdFx0cmV0dXJuIDY4O1xuXHRcdFx0Y2FzZSAnY29weUZyb20nOlxuXHRcdFx0XHRyZXR1cm4gOTA7XG5cdFx0XHRjYXNlICd1c2VGb3JDdXJyZW50Jzpcblx0XHRcdGNhc2UgJ3VzZUFzRGVmYXVsdCc6XG5cdFx0XHRcdHJldHVybiA2ODtcblx0XHRcdGNhc2UgJ2NvbnRlbnRzJzpcblx0XHRcdFx0cmV0dXJuIDI1ODtcblx0XHRcdGNhc2UgJ3dvcmtzcGFjZXMnOlxuXHRcdFx0XHRyZXR1cm4gKHJvb3Qud29ya3NwYWNlcyA/IChyb290LndvcmtzcGFjZXMubGVuZ3RoICogMjQpICsgMzAgOiAwKSArIDExMjtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgUHJvZmlsZVRyZWVEYXRhU291cmNlIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQsIFByb2ZpbGVUcmVlRWxlbWVudD4ge1xuXG5cdGhhc0NoaWxkcmVuKGVsZW1lbnQ6IEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCB8IFByb2ZpbGVUcmVlRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBlbGVtZW50IGluc3RhbmNlb2YgQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50O1xuXHR9XG5cblx0YXN5bmMgZ2V0Q2hpbGRyZW4oZWxlbWVudDogQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50IHwgUHJvZmlsZVRyZWVFbGVtZW50KTogUHJvbWlzZTxQcm9maWxlVHJlZUVsZW1lbnRbXT4ge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRjb25zdCBjaGlsZHJlbjogUHJvZmlsZVRyZWVFbGVtZW50W10gPSBbXTtcblx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgTmV3UHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaCh7IGVsZW1lbnQ6ICduYW1lJywgcm9vdDogZWxlbWVudCB9KTtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaCh7IGVsZW1lbnQ6ICdpY29uJywgcm9vdDogZWxlbWVudCB9KTtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaCh7IGVsZW1lbnQ6ICdjb3B5RnJvbScsIHJvb3Q6IGVsZW1lbnQgfSk7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2goeyBlbGVtZW50OiAnY29udGVudHMnLCByb290OiBlbGVtZW50IH0pO1xuXHRcdFx0fSBlbHNlIGlmIChlbGVtZW50IGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0XHRpZiAoIWVsZW1lbnQucHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKHsgZWxlbWVudDogJ25hbWUnLCByb290OiBlbGVtZW50IH0pO1xuXHRcdFx0XHRcdGNoaWxkcmVuLnB1c2goeyBlbGVtZW50OiAnaWNvbicsIHJvb3Q6IGVsZW1lbnQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2hpbGRyZW4ucHVzaCh7IGVsZW1lbnQ6ICd1c2VBc0RlZmF1bHQnLCByb290OiBlbGVtZW50IH0pO1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKHsgZWxlbWVudDogJ2NvbnRlbnRzJywgcm9vdDogZWxlbWVudCB9KTtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaCh7IGVsZW1lbnQ6ICd3b3Jrc3BhY2VzJywgcm9vdDogZWxlbWVudCB9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjaGlsZHJlbjtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG59XG5cbmludGVyZmFjZSBQcm9maWxlQ29udGVudFRyZWVFbGVtZW50IHtcblx0ZWxlbWVudDogSVByb2ZpbGVDaGlsZEVsZW1lbnQ7XG5cdHJvb3Q6IEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudDtcbn1cblxuY2xhc3MgUHJvZmlsZUNvbnRlbnRUcmVlRWxlbWVudERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8UHJvZmlsZUNvbnRlbnRUcmVlRWxlbWVudD4ge1xuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogUHJvZmlsZUNvbnRlbnRUcmVlRWxlbWVudCkge1xuXHRcdGlmICghKDxJUHJvZmlsZVJlc291cmNlVHlwZUVsZW1lbnQ+ZWxlbWVudC5lbGVtZW50KS5yZXNvdXJjZVR5cGUpIHtcblx0XHRcdHJldHVybiBQcm9maWxlUmVzb3VyY2VDaGlsZFRyZWVJdGVtUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50LnJvb3QgaW5zdGFuY2VvZiBOZXdQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIE5ld1Byb2ZpbGVSZXNvdXJjZVRyZWVSZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9XG5cdFx0cmV0dXJuIEV4aXN0aW5nUHJvZmlsZVJlc291cmNlVHJlZVJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHR9XG5cblx0Z2V0SGVpZ2h0KGVsZW1lbnQ6IFByb2ZpbGVDb250ZW50VHJlZUVsZW1lbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiAyNDtcblx0fVxufVxuXG5jbGFzcyBQcm9maWxlUmVzb3VyY2VUcmVlRGF0YVNvdXJjZSBpbXBsZW1lbnRzIElBc3luY0RhdGFTb3VyY2U8QWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50LCBQcm9maWxlQ29udGVudFRyZWVFbGVtZW50PiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JQcm9ncmVzc1NlcnZpY2U6IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0aGFzQ2hpbGRyZW4oZWxlbWVudDogQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50IHwgUHJvZmlsZUNvbnRlbnRUcmVlRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCg8SVByb2ZpbGVSZXNvdXJjZVR5cGVFbGVtZW50PmVsZW1lbnQuZWxlbWVudCkucmVzb3VyY2VUeXBlKSB7XG5cdFx0XHRpZiAoKDxJUHJvZmlsZVJlc291cmNlVHlwZUVsZW1lbnQ+ZWxlbWVudC5lbGVtZW50KS5yZXNvdXJjZVR5cGUgIT09IFByb2ZpbGVSZXNvdXJjZVR5cGUuRXh0ZW5zaW9ucyAmJiAoPElQcm9maWxlUmVzb3VyY2VUeXBlRWxlbWVudD5lbGVtZW50LmVsZW1lbnQpLnJlc291cmNlVHlwZSAhPT0gUHJvZmlsZVJlc291cmNlVHlwZS5TbmlwcGV0cykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZWxlbWVudC5yb290IGluc3RhbmNlb2YgTmV3UHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VUeXBlID0gKDxJUHJvZmlsZVJlc291cmNlVHlwZUVsZW1lbnQ+ZWxlbWVudC5lbGVtZW50KS5yZXNvdXJjZVR5cGU7XG5cdFx0XHRcdGlmIChlbGVtZW50LnJvb3QuZ2V0RmxhZyhyZXNvdXJjZVR5cGUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFlbGVtZW50LnJvb3QuaGFzUmVzb3VyY2UocmVzb3VyY2VUeXBlKSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZWxlbWVudC5yb290LmNvcHlGcm9tID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFlbGVtZW50LnJvb3QuZ2V0Q29weUZsYWcocmVzb3VyY2VUeXBlKSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGFzeW5jIGdldENoaWxkcmVuKGVsZW1lbnQ6IEFic3RyYWN0VXNlckRhdGFQcm9maWxlRWxlbWVudCB8IFByb2ZpbGVDb250ZW50VHJlZUVsZW1lbnQpOiBQcm9taXNlPFByb2ZpbGVDb250ZW50VHJlZUVsZW1lbnRbXT4ge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRjb25zdCBjaGlsZHJlbiA9IGF3YWl0IGVsZW1lbnQuZ2V0Q2hpbGRyZW4oKTtcblx0XHRcdHJldHVybiBjaGlsZHJlbi5tYXAoZSA9PiAoeyBlbGVtZW50OiBlLCByb290OiBlbGVtZW50IH0pKTtcblx0XHR9XG5cdFx0aWYgKCg8SVByb2ZpbGVSZXNvdXJjZVR5cGVFbGVtZW50PmVsZW1lbnQuZWxlbWVudCkucmVzb3VyY2VUeXBlKSB7XG5cdFx0XHRjb25zdCBwcm9ncmVzc1J1bm5lciA9IHRoaXMuZWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLnNob3codHJ1ZSwgNTAwKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCBlbGVtZW50LnJvb3QuZ2V0Q2hpbGRyZW4oKDxJUHJvZmlsZVJlc291cmNlVHlwZUVsZW1lbnQ+ZWxlbWVudC5lbGVtZW50KS5yZXNvdXJjZVR5cGUpO1xuXHRcdFx0XHRyZXR1cm4gZXh0ZW5zaW9ucy5tYXAoZSA9PiAoeyBlbGVtZW50OiBlLCByb290OiBlbGVtZW50LnJvb3QgfSkpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cHJvZ3Jlc3NSdW5uZXIuZG9uZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cbn1cblxuaW50ZXJmYWNlIElQcm9maWxlUmVuZGVyZXJUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5pbnRlcmZhY2UgSUV4aXN0aW5nUHJvZmlsZVJlc291cmNlVGVtcGxhdGVEYXRhIGV4dGVuZHMgSVByb2ZpbGVSZW5kZXJlclRlbXBsYXRlIHtcblx0cmVhZG9ubHkgbGFiZWw6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSByYWRpbzogUmFkaW87XG5cdHJlYWRvbmx5IGFjdGlvbkJhcjogV29ya2JlbmNoVG9vbEJhcjtcbn1cblxuaW50ZXJmYWNlIElOZXdQcm9maWxlUmVzb3VyY2VUZW1wbGF0ZURhdGEgZXh0ZW5kcyBJUHJvZmlsZVJlbmRlcmVyVGVtcGxhdGUge1xuXHRyZWFkb25seSBsYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHJhZGlvOiBSYWRpbztcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBXb3JrYmVuY2hUb29sQmFyO1xufVxuXG5pbnRlcmZhY2UgSVByb2ZpbGVSZXNvdXJjZUNoaWxkVHJlZUl0ZW1UZW1wbGF0ZURhdGEgZXh0ZW5kcyBJUHJvZmlsZVJlbmRlcmVyVGVtcGxhdGUge1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IFdvcmtiZW5jaFRvb2xCYXI7XG5cdHJlYWRvbmx5IGNoZWNrYm94OiBDaGVja2JveDtcblx0cmVhZG9ubHkgcmVzb3VyY2VMYWJlbDogSVJlc291cmNlTGFiZWw7XG59XG5cbmludGVyZmFjZSBJUHJvZmlsZVByb3BlcnR5UmVuZGVyZXJUZW1wbGF0ZSBleHRlbmRzIElQcm9maWxlUmVuZGVyZXJUZW1wbGF0ZSB7XG5cdGVsZW1lbnQ6IFByb2ZpbGVUcmVlRWxlbWVudDtcbn1cblxuY2xhc3MgQWJzdHJhY3RQcm9maWxlUmVzb3VyY2VUcmVlUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcm90ZWN0ZWQgZ2V0UmVzb3VyY2VUeXBlVGl0bGUocmVzb3VyY2VUeXBlOiBQcm9maWxlUmVzb3VyY2VUeXBlKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKHJlc291cmNlVHlwZSkge1xuXHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLlNldHRpbmdzOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NldHRpbmdzJywgXCJTZXR0aW5nc1wiKTtcblx0XHRcdGNhc2UgUHJvZmlsZVJlc291cmNlVHlwZS5LZXliaW5kaW5nczpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdrZXliaW5kaW5ncycsIFwiS2V5Ym9hcmQgU2hvcnRjdXRzXCIpO1xuXHRcdFx0Y2FzZSBQcm9maWxlUmVzb3VyY2VUeXBlLlNuaXBwZXRzOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NuaXBwZXRzJywgXCJTbmlwcGV0c1wiKTtcblx0XHRcdGNhc2UgUHJvZmlsZVJlc291cmNlVHlwZS5UYXNrczpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0YXNrcycsIFwiVGFza3NcIik7XG5cdFx0XHRjYXNlIFByb2ZpbGVSZXNvdXJjZVR5cGUuTWNwOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21jcCcsIFwiTUNQIFNlcnZlcnNcIik7XG5cdFx0XHRjYXNlIFByb2ZpbGVSZXNvdXJjZVR5cGUuRXh0ZW5zaW9uczpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdleHRlbnNpb25zJywgXCJFeHRlbnNpb25zXCIpO1xuXHRcdH1cblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8UHJvZmlsZUNvbnRlbnRUcmVlRWxlbWVudCB8IFByb2ZpbGVUcmVlRWxlbWVudCwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVByb2ZpbGVSZW5kZXJlclRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVByb2ZpbGVSZW5kZXJlclRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBQcm9maWxlUHJvcGVydHlSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0UHJvZmlsZVJlc291cmNlVHJlZVJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxQcm9maWxlVHJlZUVsZW1lbnQsIHZvaWQsIElQcm9maWxlUHJvcGVydHlSZW5kZXJlclRlbXBsYXRlPiB7XG5cblx0YWJzdHJhY3QgdGVtcGxhdGVJZDogUHJvZmlsZVByb3BlcnR5O1xuXHRhYnN0cmFjdCByZW5kZXJUZW1wbGF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSVByb2ZpbGVQcm9wZXJ0eVJlbmRlcmVyVGVtcGxhdGU7XG5cblx0cmVuZGVyRWxlbWVudCh7IGVsZW1lbnQgfTogSVRyZWVOb2RlPFByb2ZpbGVUcmVlRWxlbWVudCwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVByb2ZpbGVQcm9wZXJ0eVJlbmRlcmVyVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnQgPSBlbGVtZW50O1xuXHR9XG5cbn1cblxuY2xhc3MgUHJvZmlsZU5hbWVSZW5kZXJlciBleHRlbmRzIFByb2ZpbGVQcm9wZXJ0eVJlbmRlcmVyIHtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBQcm9maWxlUHJvcGVydHkgPSAnbmFtZSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSVByb2ZpbGVQcm9wZXJ0eVJlbmRlcmVyVGVtcGxhdGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGxldCBwcm9maWxlRWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgbmFtZUNvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy5wcm9maWxlLXJvdy1jb250YWluZXInKSk7XG5cdFx0YXBwZW5kKG5hbWVDb250YWluZXIsICQoJy5wcm9maWxlLWxhYmVsLWVsZW1lbnQnLCB1bmRlZmluZWQsIGxvY2FsaXplKCduYW1lJywgXCJOYW1lXCIpKSk7XG5cdFx0Y29uc3QgbmFtZUlucHV0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbnB1dEJveChcblx0XHRcdG5hbWVDb250YWluZXIsXG5cdFx0XHR0aGlzLmNvbnRleHRWaWV3U2VydmljZSxcblx0XHRcdHtcblx0XHRcdFx0aW5wdXRCb3hTdHlsZXM6IGdldElucHV0Qm94U3R5bGUoe1xuXHRcdFx0XHRcdGlucHV0Qm9yZGVyOiBzZXR0aW5nc1RleHRJbnB1dEJvcmRlclxuXHRcdFx0XHR9KSxcblx0XHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgncHJvZmlsZU5hbWUnLCBcIlByb2ZpbGUgTmFtZVwiKSxcblx0XHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdwcm9maWxlTmFtZScsIFwiUHJvZmlsZSBOYW1lXCIpLFxuXHRcdFx0XHR2YWxpZGF0aW9uT3B0aW9uczoge1xuXHRcdFx0XHRcdHZhbGlkYXRpb246ICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplKCduYW1lIHJlcXVpcmVkJywgXCJQcm9maWxlIG5hbWUgaXMgcmVxdWlyZWQgYW5kIG11c3QgYmUgYSBub24tZW1wdHkgdmFsdWUuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VUeXBlLldBUk5JTkdcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChwcm9maWxlRWxlbWVudD8ucm9vdC5kaXNhYmxlZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICghcHJvZmlsZUVsZW1lbnQ/LnJvb3Quc2hvdWxkVmFsaWRhdGVOYW1lKCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBpbml0aWFsTmFtZSA9IHByb2ZpbGVFbGVtZW50Py5yb290LmdldEluaXRpYWxOYW1lKCk7XG5cdFx0XHRcdFx0XHR2YWx1ZSA9IHZhbHVlLnRyaW0oKTtcblx0XHRcdFx0XHRcdGlmIChpbml0aWFsTmFtZSAhPT0gdmFsdWUgJiYgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5zb21lKHAgPT4gIXAuaXNJbnRlcm5hbCAmJiBwLm5hbWUgPT09IHZhbHVlKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplKCdwcm9maWxlRXhpc3RzJywgXCJQcm9maWxlIHdpdGggbmFtZSB7MH0gYWxyZWFkeSBleGlzdHMuXCIsIHZhbHVlKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlVHlwZS5XQVJOSU5HXG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobmFtZUlucHV0Lm9uRGlkQ2hhbmdlKHZhbHVlID0+IHtcblx0XHRcdGlmIChwcm9maWxlRWxlbWVudCAmJiB2YWx1ZSkge1xuXHRcdFx0XHRwcm9maWxlRWxlbWVudC5yb290Lm5hbWUgPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3QgZm9jdXNUcmFja2VyID0gZGlzcG9zYWJsZXMuYWRkKHRyYWNrRm9jdXMobmFtZUlucHV0LmlucHV0RWxlbWVudCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHtcblx0XHRcdGlmIChwcm9maWxlRWxlbWVudCAmJiAhbmFtZUlucHV0LnZhbHVlKSB7XG5cdFx0XHRcdG5hbWVJbnB1dC52YWx1ZSA9IHByb2ZpbGVFbGVtZW50LnJvb3QubmFtZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCByZW5kZXJOYW1lID0gKHByb2ZpbGVFbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQpID0+IHtcblx0XHRcdG5hbWVJbnB1dC52YWx1ZSA9IHByb2ZpbGVFbGVtZW50LnJvb3QubmFtZTtcblx0XHRcdG5hbWVJbnB1dC52YWxpZGF0ZSgpO1xuXHRcdFx0Y29uc3QgaXNTeXN0ZW1Qcm9maWxlID0gcHJvZmlsZUVsZW1lbnQucm9vdCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQgJiYgKHByb2ZpbGVFbGVtZW50LnJvb3QucHJvZmlsZS5pc0RlZmF1bHQpO1xuXHRcdFx0aWYgKHByb2ZpbGVFbGVtZW50LnJvb3QuZGlzYWJsZWQgfHwgaXNTeXN0ZW1Qcm9maWxlKSB7XG5cdFx0XHRcdG5hbWVJbnB1dC5kaXNhYmxlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuYW1lSW5wdXQuZW5hYmxlKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNTeXN0ZW1Qcm9maWxlKSB7XG5cdFx0XHRcdG5hbWVJbnB1dC5zZXRUb29sdGlwKGxvY2FsaXplKCdkZWZhdWx0UHJvZmlsZU5hbWUnLCBcIk5hbWUgY2Fubm90IGJlIGNoYW5nZWQgZm9yIHRoZSBidWlsdCBpbiBwcm9maWxlc1wiKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuYW1lSW5wdXQuc2V0VG9vbHRpcChsb2NhbGl6ZSgncHJvZmlsZU5hbWUnLCBcIlByb2ZpbGUgTmFtZVwiKSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRzZXQgZWxlbWVudChlbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQpIHtcblx0XHRcdFx0cHJvZmlsZUVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdFx0XHRyZW5kZXJOYW1lKHByb2ZpbGVFbGVtZW50KTtcblx0XHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzLmFkZChwcm9maWxlRWxlbWVudC5yb290Lm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlLm5hbWUgfHwgZS5kaXNhYmxlZCkge1xuXHRcdFx0XHRcdFx0cmVuZGVyTmFtZShlbGVtZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGUucHJvZmlsZSkge1xuXHRcdFx0XHRcdFx0bmFtZUlucHV0LnZhbGlkYXRlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cbn1cblxuY2xhc3MgUHJvZmlsZUljb25SZW5kZXJlciBleHRlbmRzIFByb2ZpbGVQcm9wZXJ0eVJlbmRlcmVyIHtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBQcm9maWxlUHJvcGVydHkgPSAnaWNvbic7XG5cdHByaXZhdGUgcmVhZG9ubHkgaG92ZXJEZWxlZ2F0ZTogSUhvdmVyRGVsZWdhdGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5ob3ZlckRlbGVnYXRlID0gZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKTtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiBJUHJvZmlsZVByb3BlcnR5UmVuZGVyZXJUZW1wbGF0ZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0bGV0IHByb2ZpbGVFbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBpY29uQ29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLnByb2ZpbGUtcm93LWNvbnRhaW5lcicpKTtcblx0XHRhcHBlbmQoaWNvbkNvbnRhaW5lciwgJCgnLnByb2ZpbGUtbGFiZWwtZWxlbWVudCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2ljb24tbGFiZWwnLCBcIkljb25cIikpKTtcblx0XHRjb25zdCBpY29uVmFsdWVDb250YWluZXIgPSBhcHBlbmQoaWNvbkNvbnRhaW5lciwgJCgnLnByb2ZpbGUtaWNvbi1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgaWNvbkVsZW1lbnQgPSBhcHBlbmQoaWNvblZhbHVlQ29udGFpbmVyLCAkKGAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKERFRkFVTFRfSUNPTil9YCwgeyAndGFiaW5kZXgnOiAnMCcsICdyb2xlJzogJ2J1dHRvbicsICdhcmlhLWxhYmVsJzogbG9jYWxpemUoJ2ljb24nLCBcIlByb2ZpbGUgSWNvblwiKSB9KSk7XG5cdFx0Y29uc3QgaWNvbkhvdmVyID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKHRoaXMuaG92ZXJEZWxlZ2F0ZSwgaWNvbkVsZW1lbnQsICcnKSk7XG5cblx0XHRjb25zdCBpY29uU2VsZWN0Qm94ID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoSWNvblNlbGVjdEJveCwgeyBpY29uczogSUNPTlMsIGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSkpO1xuXHRcdGxldCBob3ZlcldpZGdldDogSUhvdmVyV2lkZ2V0IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHNob3dJY29uU2VsZWN0Qm94ID0gKCkgPT4ge1xuXHRcdFx0aWYgKHByb2ZpbGVFbGVtZW50Py5yb290IGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCAmJiBwcm9maWxlRWxlbWVudC5yb290LnByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChwcm9maWxlRWxlbWVudD8ucm9vdC5kaXNhYmxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJvZmlsZUVsZW1lbnQ/LnJvb3QgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50ICYmIHByb2ZpbGVFbGVtZW50LnJvb3QucHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWNvblNlbGVjdEJveC5jbGVhcklucHV0KCk7XG5cdFx0XHRob3ZlcldpZGdldCA9IHRoaXMuaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0XHRjb250ZW50OiBpY29uU2VsZWN0Qm94LmRvbU5vZGUsXG5cdFx0XHRcdHRhcmdldDogaWNvbkVsZW1lbnQsXG5cdFx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdFx0aG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5CRUxPVyxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVyc2lzdGVuY2U6IHtcblx0XHRcdFx0XHRzdGlja3k6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFwcGVhcmFuY2U6IHtcblx0XHRcdFx0XHRzaG93UG9pbnRlcjogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHRydWUpO1xuXG5cdFx0XHRpZiAoaG92ZXJXaWRnZXQpIHtcblx0XHRcdFx0aWNvblNlbGVjdEJveC5sYXlvdXQobmV3IERpbWVuc2lvbig0ODYsIDI5MikpO1xuXHRcdFx0XHRpY29uU2VsZWN0Qm94LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGljb25FbGVtZW50LCBFdmVudFR5cGUuQ0xJQ0ssIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0c2hvd0ljb25TZWxlY3RCb3goKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpY29uRWxlbWVudCwgRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZXZlbnQsIHRydWUpO1xuXHRcdFx0XHRzaG93SWNvblNlbGVjdEJveCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGljb25TZWxlY3RCb3guZG9tTm9kZSwgRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZXZlbnQsIHRydWUpO1xuXHRcdFx0XHRob3ZlcldpZGdldD8uZGlzcG9zZSgpO1xuXHRcdFx0XHRpY29uRWxlbWVudC5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaWNvblNlbGVjdEJveC5vbkRpZFNlbGVjdChzZWxlY3RlZEljb24gPT4ge1xuXHRcdFx0aG92ZXJXaWRnZXQ/LmRpc3Bvc2UoKTtcblx0XHRcdGljb25FbGVtZW50LmZvY3VzKCk7XG5cdFx0XHRpZiAocHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdFx0cHJvZmlsZUVsZW1lbnQucm9vdC5pY29uID0gc2VsZWN0ZWRJY29uLmlkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGFwcGVuZChpY29uVmFsdWVDb250YWluZXIsICQoJy5wcm9maWxlLWRlc2NyaXB0aW9uLWVsZW1lbnQnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdpY29uLWRlc2NyaXB0aW9uJywgXCJQcm9maWxlIGljb24gdG8gYmUgc2hvd24gaW4gdGhlIGFjdGl2aXR5IGJhclwiKSkpO1xuXG5cdFx0Y29uc3QgcmVuZGVySWNvbiA9IChwcm9maWxlRWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50KSA9PiB7XG5cdFx0XHRpZiAocHJvZmlsZUVsZW1lbnQ/LnJvb3QgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50ICYmIHByb2ZpbGVFbGVtZW50LnJvb3QucHJvZmlsZS5pc0RlZmF1bHQpIHtcblx0XHRcdFx0aWNvblZhbHVlQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0XHRcdGljb25Ib3Zlci51cGRhdGUobG9jYWxpemUoJ2RlZmF1bHRQcm9maWxlSWNvbicsIFwiSWNvbiBjYW5ub3QgYmUgY2hhbmdlZCBmb3IgdGhlIGRlZmF1bHQgcHJvZmlsZVwiKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpY29uSG92ZXIudXBkYXRlKGxvY2FsaXplKCdjaGFuZ2VJY29uJywgXCJDbGljayB0byBjaGFuZ2UgaWNvblwiKSk7XG5cdFx0XHRcdGljb25WYWx1ZUNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdkaXNhYmxlZCcpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByb2ZpbGVFbGVtZW50LnJvb3QuaWNvbikge1xuXHRcdFx0XHRpY29uRWxlbWVudC5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoVGhlbWVJY29uLmZyb21JZChwcm9maWxlRWxlbWVudC5yb290Lmljb24pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGljb25FbGVtZW50LmNsYXNzTmFtZSA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShUaGVtZUljb24uZnJvbUlkKERFRkFVTFRfSUNPTi5pZCkpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c2V0IGVsZW1lbnQoZWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50KSB7XG5cdFx0XHRcdHByb2ZpbGVFbGVtZW50ID0gZWxlbWVudDtcblx0XHRcdFx0cmVuZGVySWNvbihwcm9maWxlRWxlbWVudCk7XG5cdFx0XHRcdGVsZW1lbnREaXNwb3NhYmxlcy5hZGQocHJvZmlsZUVsZW1lbnQucm9vdC5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5pY29uKSB7XG5cdFx0XHRcdFx0XHRyZW5kZXJJY29uKGVsZW1lbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBVc2VGb3JDdXJyZW50V2luZG93UHJvcGVydHlSZW5kZXJlciBleHRlbmRzIFByb2ZpbGVQcm9wZXJ0eVJlbmRlcmVyIHtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBQcm9maWxlUHJvcGVydHkgPSAndXNlRm9yQ3VycmVudCc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSVByb2ZpbGVQcm9wZXJ0eVJlbmRlcmVyVGVtcGxhdGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGxldCBwcm9maWxlRWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgdXNlRm9yQ3VycmVudFdpbmRvd0NvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy5wcm9maWxlLXJvdy1jb250YWluZXInKSk7XG5cdFx0YXBwZW5kKHVzZUZvckN1cnJlbnRXaW5kb3dDb250YWluZXIsICQoJy5wcm9maWxlLWxhYmVsLWVsZW1lbnQnLCB1bmRlZmluZWQsIGxvY2FsaXplKCd1c2UgZm9yIGN1cnJlbiB3aW5kb3cnLCBcIlVzZSBmb3IgQ3VycmVudCBXaW5kb3dcIikpKTtcblx0XHRjb25zdCB1c2VGb3JDdXJyZW50V2luZG93VmFsdWVDb250YWluZXIgPSBhcHBlbmQodXNlRm9yQ3VycmVudFdpbmRvd0NvbnRhaW5lciwgJCgnLnByb2ZpbGUtdXNlLWZvci1jdXJyZW50LWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCB1c2VGb3JDdXJyZW50V2luZG93VGl0bGUgPSBsb2NhbGl6ZSgnZW5hYmxlIGZvciBjdXJyZW50IHdpbmRvdycsIFwiVXNlIHRoaXMgcHJvZmlsZSBmb3IgdGhlIGN1cnJlbnQgd2luZG93XCIpO1xuXHRcdGNvbnN0IHVzZUZvckN1cnJlbnRXaW5kb3dDaGVja2JveCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hlY2tib3godXNlRm9yQ3VycmVudFdpbmRvd1RpdGxlLCBmYWxzZSwgZGVmYXVsdENoZWNrYm94U3R5bGVzKSk7XG5cdFx0YXBwZW5kKHVzZUZvckN1cnJlbnRXaW5kb3dWYWx1ZUNvbnRhaW5lciwgdXNlRm9yQ3VycmVudFdpbmRvd0NoZWNrYm94LmRvbU5vZGUpO1xuXHRcdGNvbnN0IHVzZUZvckN1cnJlbnRXaW5kb3dMYWJlbCA9IGFwcGVuZCh1c2VGb3JDdXJyZW50V2luZG93VmFsdWVDb250YWluZXIsICQoJy5wcm9maWxlLWRlc2NyaXB0aW9uLWVsZW1lbnQnLCB1bmRlZmluZWQsIHVzZUZvckN1cnJlbnRXaW5kb3dUaXRsZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh1c2VGb3JDdXJyZW50V2luZG93Q2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHByb2ZpbGVFbGVtZW50Py5yb290IGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0XHRwcm9maWxlRWxlbWVudC5yb290LnRvZ2dsZUN1cnJlbnRXaW5kb3dQcm9maWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodXNlRm9yQ3VycmVudFdpbmRvd0xhYmVsLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdGlmIChwcm9maWxlRWxlbWVudD8ucm9vdCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdFx0cHJvZmlsZUVsZW1lbnQucm9vdC50b2dnbGVDdXJyZW50V2luZG93UHJvZmlsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlbmRlclVzZUN1cnJlbnRQcm9maWxlID0gKHByb2ZpbGVFbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQpID0+IHtcblx0XHRcdHVzZUZvckN1cnJlbnRXaW5kb3dDaGVja2JveC5jaGVja2VkID0gcHJvZmlsZUVsZW1lbnQucm9vdCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQgJiYgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmlkID09PSBwcm9maWxlRWxlbWVudC5yb290LnByb2ZpbGUuaWQ7XG5cdFx0XHRpZiAodXNlRm9yQ3VycmVudFdpbmRvd0NoZWNrYm94LmNoZWNrZWQgJiYgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0XHR1c2VGb3JDdXJyZW50V2luZG93Q2hlY2tib3guZGlzYWJsZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dXNlRm9yQ3VycmVudFdpbmRvd0NoZWNrYm94LmVuYWJsZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2V0IGVsZW1lbnQoZWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50KSB7XG5cdFx0XHRcdHByb2ZpbGVFbGVtZW50ID0gZWxlbWVudDtcblx0XHRcdFx0cmVuZGVyVXNlQ3VycmVudFByb2ZpbGUocHJvZmlsZUVsZW1lbnQpO1xuXHRcdFx0XHRlbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoYXQudXNlckRhdGFQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUN1cnJlbnRQcm9maWxlKGUgPT4ge1xuXHRcdFx0XHRcdHJlbmRlclVzZUN1cnJlbnRQcm9maWxlKGVsZW1lbnQpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIFVzZUFzRGVmYXVsdFByb2ZpbGVSZW5kZXJlciBleHRlbmRzIFByb2ZpbGVQcm9wZXJ0eVJlbmRlcmVyIHtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBQcm9maWxlUHJvcGVydHkgPSAndXNlQXNEZWZhdWx0JztcblxuXHRyZW5kZXJUZW1wbGF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSVByb2ZpbGVQcm9wZXJ0eVJlbmRlcmVyVGVtcGxhdGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGxldCBwcm9maWxlRWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgdXNlQXNEZWZhdWx0UHJvZmlsZUNvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy5wcm9maWxlLXJvdy1jb250YWluZXInKSk7XG5cdFx0YXBwZW5kKHVzZUFzRGVmYXVsdFByb2ZpbGVDb250YWluZXIsICQoJy5wcm9maWxlLWxhYmVsLWVsZW1lbnQnLCB1bmRlZmluZWQsIGxvY2FsaXplKCd1c2UgZm9yIG5ldyB3aW5kb3dzJywgXCJVc2UgZm9yIE5ldyBXaW5kb3dzXCIpKSk7XG5cdFx0Y29uc3QgdXNlQXNEZWZhdWx0UHJvZmlsZVZhbHVlQ29udGFpbmVyID0gYXBwZW5kKHVzZUFzRGVmYXVsdFByb2ZpbGVDb250YWluZXIsICQoJy5wcm9maWxlLXVzZS1hcy1kZWZhdWx0LWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCB1c2VBc0RlZmF1bHRQcm9maWxlVGl0bGUgPSBsb2NhbGl6ZSgnZW5hYmxlIGZvciBuZXcgd2luZG93cycsIFwiVXNlIHRoaXMgcHJvZmlsZSBhcyB0aGUgZGVmYXVsdCBmb3IgbmV3IHdpbmRvd3NcIik7XG5cdFx0Y29uc3QgdXNlQXNEZWZhdWx0UHJvZmlsZUNoZWNrYm94ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGVja2JveCh1c2VBc0RlZmF1bHRQcm9maWxlVGl0bGUsIGZhbHNlLCBkZWZhdWx0Q2hlY2tib3hTdHlsZXMpKTtcblx0XHRhcHBlbmQodXNlQXNEZWZhdWx0UHJvZmlsZVZhbHVlQ29udGFpbmVyLCB1c2VBc0RlZmF1bHRQcm9maWxlQ2hlY2tib3guZG9tTm9kZSk7XG5cdFx0Y29uc3QgdXNlQXNEZWZhdWx0UHJvZmlsZUxhYmVsID0gYXBwZW5kKHVzZUFzRGVmYXVsdFByb2ZpbGVWYWx1ZUNvbnRhaW5lciwgJCgnLnByb2ZpbGUtZGVzY3JpcHRpb24tZWxlbWVudCcsIHVuZGVmaW5lZCwgdXNlQXNEZWZhdWx0UHJvZmlsZVRpdGxlKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHVzZUFzRGVmYXVsdFByb2ZpbGVDaGVja2JveC5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAocHJvZmlsZUVsZW1lbnQ/LnJvb3QgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdHByb2ZpbGVFbGVtZW50LnJvb3QudG9nZ2xlTmV3V2luZG93UHJvZmlsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHVzZUFzRGVmYXVsdFByb2ZpbGVMYWJlbCwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHRpZiAocHJvZmlsZUVsZW1lbnQ/LnJvb3QgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdHByb2ZpbGVFbGVtZW50LnJvb3QudG9nZ2xlTmV3V2luZG93UHJvZmlsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlbmRlclVzZUFzRGVmYXVsdCA9IChwcm9maWxlRWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50KSA9PiB7XG5cdFx0XHR1c2VBc0RlZmF1bHRQcm9maWxlQ2hlY2tib3guY2hlY2tlZCA9IHByb2ZpbGVFbGVtZW50LnJvb3QgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50ICYmIHByb2ZpbGVFbGVtZW50LnJvb3QuaXNOZXdXaW5kb3dQcm9maWxlO1xuXHRcdH07XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c2V0IGVsZW1lbnQoZWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50KSB7XG5cdFx0XHRcdHByb2ZpbGVFbGVtZW50ID0gZWxlbWVudDtcblx0XHRcdFx0cmVuZGVyVXNlQXNEZWZhdWx0KHByb2ZpbGVFbGVtZW50KTtcblx0XHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzLmFkZChwcm9maWxlRWxlbWVudC5yb290Lm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlLm5ld1dpbmRvd1Byb2ZpbGUpIHtcblx0XHRcdFx0XHRcdHJlbmRlclVzZUFzRGVmYXVsdChlbGVtZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgQ29weUZyb21Qcm9maWxlUmVuZGVyZXIgZXh0ZW5kcyBQcm9maWxlUHJvcGVydHlSZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogUHJvZmlsZVByb3BlcnR5ID0gJ2NvcHlGcm9tJztcblxuXHRwcml2YXRlIHRlbXBsYXRlczogcmVhZG9ubHkgSVByb2ZpbGVUZW1wbGF0ZUluZm9bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IElQcm9maWxlUHJvcGVydHlSZW5kZXJlclRlbXBsYXRlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRsZXQgcHJvZmlsZUVsZW1lbnQ6IFByb2ZpbGVUcmVlRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGNvcHlGcm9tQ29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLnByb2ZpbGUtcm93LWNvbnRhaW5lci5wcm9maWxlLWNvcHktZnJvbS1jb250YWluZXInKSk7XG5cdFx0YXBwZW5kKGNvcHlGcm9tQ29udGFpbmVyLCAkKCcucHJvZmlsZS1sYWJlbC1lbGVtZW50JywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY3JlYXRlIGZyb20nLCBcIkNvcHkgZnJvbVwiKSkpO1xuXHRcdGFwcGVuZChjb3B5RnJvbUNvbnRhaW5lciwgJCgnLnByb2ZpbGUtZGVzY3JpcHRpb24tZWxlbWVudCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NvcHkgZnJvbSBkZXNjcmlwdGlvbicsIFwiU2VsZWN0IHRoZSBwcm9maWxlIHNvdXJjZSBmcm9tIHdoaWNoIHlvdSB3YW50IHRvIGNvcHkgY29udGVudHNcIikpKTtcblx0XHRjb25zdCBjb3B5RnJvbVNlbGVjdEJveCA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlbGVjdEJveCxcblx0XHRcdFtdLFxuXHRcdFx0MCxcblx0XHRcdHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdFx0ZGVmYXVsdFNlbGVjdEJveFN0eWxlcyxcblx0XHRcdHtcblx0XHRcdFx0dXNlQ3VzdG9tRHJhd246IHRydWUsXG5cdFx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2NvcHkgcHJvZmlsZSBmcm9tJywgXCJDb3B5IHByb2ZpbGUgZnJvbVwiKSxcblx0XHRcdH1cblx0XHQpKTtcblx0XHRjb3B5RnJvbVNlbGVjdEJveC5yZW5kZXIoYXBwZW5kKGNvcHlGcm9tQ29udGFpbmVyLCAkKCcucHJvZmlsZS1zZWxlY3QtY29udGFpbmVyJykpKTtcblxuXHRcdGNvbnN0IHJlbmRlciA9IChwcm9maWxlRWxlbWVudDogTmV3UHJvZmlsZUVsZW1lbnQsIGNvcHlGcm9tT3B0aW9uczogKElTZWxlY3RPcHRpb25JdGVtICYgeyBpZD86IHN0cmluZzsgc291cmNlPzogSVVzZXJEYXRhUHJvZmlsZSB8IFVSSSB9KVtdKSA9PiB7XG5cdFx0XHRjb3B5RnJvbVNlbGVjdEJveC5zZXRPcHRpb25zKGNvcHlGcm9tT3B0aW9ucyk7XG5cdFx0XHRjb25zdCBpZCA9IHByb2ZpbGVFbGVtZW50LmNvcHlGcm9tIGluc3RhbmNlb2YgVVJJID8gcHJvZmlsZUVsZW1lbnQuY29weUZyb20udG9TdHJpbmcoKSA6IHByb2ZpbGVFbGVtZW50LmNvcHlGcm9tPy5pZDtcblx0XHRcdGNvbnN0IGluZGV4ID0gaWRcblx0XHRcdFx0PyBjb3B5RnJvbU9wdGlvbnMuZmluZEluZGV4KG9wdGlvbiA9PiBvcHRpb24uaWQgPT09IGlkKVxuXHRcdFx0XHQ6IDA7XG5cdFx0XHRjb3B5RnJvbVNlbGVjdEJveC5zZWxlY3QoaW5kZXgpO1xuXHRcdH07XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2V0IGVsZW1lbnQoZWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50KSB7XG5cdFx0XHRcdHByb2ZpbGVFbGVtZW50ID0gZWxlbWVudDtcblx0XHRcdFx0aWYgKHByb2ZpbGVFbGVtZW50LnJvb3QgaW5zdGFuY2VvZiBOZXdQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0XHRcdGNvbnN0IG5ld1Byb2ZpbGVFbGVtZW50ID0gcHJvZmlsZUVsZW1lbnQucm9vdDtcblx0XHRcdFx0XHRsZXQgY29weUZyb21PcHRpb25zID0gdGhhdC5nZXRDb3B5RnJvbU9wdGlvbnMobmV3UHJvZmlsZUVsZW1lbnQpO1xuXHRcdFx0XHRcdHJlbmRlcihuZXdQcm9maWxlRWxlbWVudCwgY29weUZyb21PcHRpb25zKTtcblx0XHRcdFx0XHRjb3B5RnJvbVNlbGVjdEJveC5zZXRFbmFibGVkKCFuZXdQcm9maWxlRWxlbWVudC5wcmV2aWV3UHJvZmlsZSAmJiAhbmV3UHJvZmlsZUVsZW1lbnQuZGlzYWJsZWQpO1xuXHRcdFx0XHRcdGVsZW1lbnREaXNwb3NhYmxlcy5hZGQocHJvZmlsZUVsZW1lbnQucm9vdC5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdFx0XHRcdGlmIChlLmNvcHlGcm9tIHx8IGUuY29weUZyb21JbmZvKSB7XG5cdFx0XHRcdFx0XHRcdGNvcHlGcm9tT3B0aW9ucyA9IHRoYXQuZ2V0Q29weUZyb21PcHRpb25zKG5ld1Byb2ZpbGVFbGVtZW50KTtcblx0XHRcdFx0XHRcdFx0cmVuZGVyKG5ld1Byb2ZpbGVFbGVtZW50LCBjb3B5RnJvbU9wdGlvbnMpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGUucHJldmlldyB8fCBlLmRpc2FibGVkKSB7XG5cdFx0XHRcdFx0XHRcdGNvcHlGcm9tU2VsZWN0Qm94LnNldEVuYWJsZWQoIW5ld1Byb2ZpbGVFbGVtZW50LnByZXZpZXdQcm9maWxlICYmICFuZXdQcm9maWxlRWxlbWVudC5kaXNhYmxlZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGVsZW1lbnREaXNwb3NhYmxlcy5hZGQoY29weUZyb21TZWxlY3RCb3gub25EaWRTZWxlY3Qob3B0aW9uID0+IHtcblx0XHRcdFx0XHRcdG5ld1Byb2ZpbGVFbGVtZW50LmNvcHlGcm9tID0gY29weUZyb21PcHRpb25zW29wdGlvbi5pbmRleF0uc291cmNlO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdHNldFRlbXBsYXRlcyh0ZW1wbGF0ZXM6IHJlYWRvbmx5IElQcm9maWxlVGVtcGxhdGVJbmZvW10pOiB2b2lkIHtcblx0XHR0aGlzLnRlbXBsYXRlcyA9IHRlbXBsYXRlcztcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29weUZyb21PcHRpb25zKHByb2ZpbGVFbGVtZW50OiBOZXdQcm9maWxlRWxlbWVudCk6IChJU2VsZWN0T3B0aW9uSXRlbSAmIHsgaWQ/OiBzdHJpbmc7IHNvdXJjZT86IElVc2VyRGF0YVByb2ZpbGUgfCBVUkkgfSlbXSB7XG5cdFx0Y29uc3QgY29weUZyb21PcHRpb25zOiAoSVNlbGVjdE9wdGlvbkl0ZW0gJiB7IGlkPzogc3RyaW5nOyBzb3VyY2U/OiBJVXNlckRhdGFQcm9maWxlIHwgVVJJIH0pW10gPSBbXTtcblxuXHRcdGNvcHlGcm9tT3B0aW9ucy5wdXNoKHsgdGV4dDogbG9jYWxpemUoJ2VtcHR5IHByb2ZpbGUnLCBcIk5vbmVcIikgfSk7XG5cdFx0Zm9yIChjb25zdCBbY29weUZyb21UZW1wbGF0ZSwgbmFtZV0gb2YgcHJvZmlsZUVsZW1lbnQuY29weUZyb21UZW1wbGF0ZXMpIHtcblx0XHRcdGlmICghdGhpcy50ZW1wbGF0ZXMuc29tZSh0ZW1wbGF0ZSA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChVUkkucGFyc2UodGVtcGxhdGUudXJsKSwgY29weUZyb21UZW1wbGF0ZSkpKSB7XG5cdFx0XHRcdGNvcHlGcm9tT3B0aW9ucy5wdXNoKHsgdGV4dDogYCR7bmFtZX0gKCR7YmFzZW5hbWUoY29weUZyb21UZW1wbGF0ZSl9KWAsIGlkOiBjb3B5RnJvbVRlbXBsYXRlLnRvU3RyaW5nKCksIHNvdXJjZTogY29weUZyb21UZW1wbGF0ZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy50ZW1wbGF0ZXMubGVuZ3RoKSB7XG5cdFx0XHRjb3B5RnJvbU9wdGlvbnMucHVzaCh7IC4uLlNlcGFyYXRvclNlbGVjdE9wdGlvbiwgZGVjb3JhdG9yUmlnaHQ6IGxvY2FsaXplKCdmcm9tIHRlbXBsYXRlcycsIFwiUHJvZmlsZSBUZW1wbGF0ZXNcIikgfSk7XG5cdFx0XHRmb3IgKGNvbnN0IHRlbXBsYXRlIG9mIHRoaXMudGVtcGxhdGVzKSB7XG5cdFx0XHRcdGNvcHlGcm9tT3B0aW9ucy5wdXNoKHsgdGV4dDogdGVtcGxhdGUubmFtZSwgaWQ6IHRlbXBsYXRlLnVybCwgc291cmNlOiBVUkkucGFyc2UodGVtcGxhdGUudXJsKSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29weUZyb21PcHRpb25zLnB1c2goeyAuLi5TZXBhcmF0b3JTZWxlY3RPcHRpb24sIGRlY29yYXRvclJpZ2h0OiBsb2NhbGl6ZSgnZnJvbSBleGlzdGluZyBwcm9maWxlcycsIFwiRXhpc3RpbmcgUHJvZmlsZXNcIikgfSk7XG5cdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMpIHtcblx0XHRcdGlmICghcHJvZmlsZS5pc0ludGVybmFsKSB7XG5cdFx0XHRcdGNvcHlGcm9tT3B0aW9ucy5wdXNoKHsgdGV4dDogcHJvZmlsZS5uYW1lLCBpZDogcHJvZmlsZS5pZCwgc291cmNlOiBwcm9maWxlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY29weUZyb21PcHRpb25zO1xuXHR9XG59XG5cbmNsYXNzIENvbnRlbnRzUHJvZmlsZVJlbmRlcmVyIGV4dGVuZHMgUHJvZmlsZVByb3BlcnR5UmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IFByb2ZpbGVQcm9wZXJ0eSA9ICdjb250ZW50cyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UHJvZmlsZVRyZWVFbGVtZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBlbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQ7IHNlbGVjdGVkOiBib29sZWFuIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcHJvZmlsZXNDb250ZW50VHJlZTogV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxBYnN0cmFjdFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQsIFByb2ZpbGVDb250ZW50VHJlZUVsZW1lbnQ+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IElQcm9maWxlUHJvcGVydHlSZW5kZXJlclRlbXBsYXRlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRsZXQgcHJvZmlsZUVsZW1lbnQ6IFByb2ZpbGVUcmVlRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyZVJvd0NvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy5wcm9maWxlLXJvdy1jb250YWluZXInKSk7XG5cdFx0YXBwZW5kKGNvbmZpZ3VyZVJvd0NvbnRhaW5lciwgJCgnLnByb2ZpbGUtbGFiZWwtZWxlbWVudCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NvbnRlbnRzJywgXCJDb250ZW50c1wiKSkpO1xuXHRcdGNvbnN0IGNvbnRlbnRzRGVzY3JpcHRpb25FbGVtZW50ID0gYXBwZW5kKGNvbmZpZ3VyZVJvd0NvbnRhaW5lciwgJCgnLnByb2ZpbGUtZGVzY3JpcHRpb24tZWxlbWVudCcpKTtcblx0XHRjb25zdCBjb250ZW50c1RyZWVIZWFkZXIgPSBhcHBlbmQoY29uZmlndXJlUm93Q29udGFpbmVyLCAkKCcucHJvZmlsZS1jb250ZW50LXRyZWUtaGVhZGVyJykpO1xuXHRcdGNvbnN0IG9wdGlvbnNMYWJlbCA9ICQoJy5vcHRpb25zLWhlYWRlcicsIHVuZGVmaW5lZCwgJCgnc3BhbicsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ29wdGlvbnMnLCBcIlNvdXJjZVwiKSkpO1xuXHRcdGFwcGVuZChjb250ZW50c1RyZWVIZWFkZXIsXG5cdFx0XHQkKCcnKSxcblx0XHRcdCQoJycsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NvbnRlbnRzJywgXCJDb250ZW50c1wiKSksXG5cdFx0XHRvcHRpb25zTGFiZWwsXG5cdFx0XHQkKCcnKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgZGVsZWdhdGUgPSBuZXcgUHJvZmlsZUNvbnRlbnRUcmVlRWxlbWVudERlbGVnYXRlKCk7XG5cdFx0Y29uc3QgcHJvZmlsZXNDb250ZW50VHJlZSA9IHRoaXMucHJvZmlsZXNDb250ZW50VHJlZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8QWJzdHJhY3RVc2VyRGF0YVByb2ZpbGVFbGVtZW50LCBQcm9maWxlQ29udGVudFRyZWVFbGVtZW50Pixcblx0XHRcdCdQcm9maWxlRWRpdG9yLUNvbnRlbnRzVHJlZScsXG5cdFx0XHRhcHBlbmQoY29uZmlndXJlUm93Q29udGFpbmVyLCAkKCcucHJvZmlsZS1jb250ZW50LXRyZWUuZmlsZS1pY29uLXRoZW1hYmxlLXRyZWUuc2hvdy1maWxlLWljb25zJykpLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRbXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXhpc3RpbmdQcm9maWxlUmVzb3VyY2VUcmVlUmVuZGVyZXIpLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ld1Byb2ZpbGVSZXNvdXJjZVRyZWVSZW5kZXJlciksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvZmlsZVJlc291cmNlQ2hpbGRUcmVlSXRlbVJlbmRlcmVyKSxcblx0XHRcdF0sXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb2ZpbGVSZXNvdXJjZVRyZWVEYXRhU291cmNlKSxcblx0XHRcdHtcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEFyaWFMYWJlbChlbGVtZW50OiBQcm9maWxlQ29udGVudFRyZWVFbGVtZW50IHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0XHRpZiAoKDxJUHJvZmlsZVJlc291cmNlVHlwZUVsZW1lbnQ+ZWxlbWVudD8uZWxlbWVudCkucmVzb3VyY2VUeXBlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiAoPElQcm9maWxlUmVzb3VyY2VUeXBlRWxlbWVudD5lbGVtZW50Py5lbGVtZW50KS5yZXNvdXJjZVR5cGU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoKDxJUHJvZmlsZVJlc291cmNlVHlwZUNoaWxkRWxlbWVudD5lbGVtZW50Py5lbGVtZW50KS5sYWJlbCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gKDxJUHJvZmlsZVJlc291cmNlVHlwZUNoaWxkRWxlbWVudD5lbGVtZW50Py5lbGVtZW50KS5sYWJlbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiAnJztcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdFx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZChlbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudD8uZWxlbWVudC5oYW5kbGUpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuZWxlbWVudC5oYW5kbGU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s6IHRydWUsXG5cdFx0XHRcdHJlbmRlckluZGVudEd1aWRlczogUmVuZGVySW5kZW50R3VpZGVzLk5vbmUsXG5cdFx0XHRcdGVuYWJsZVN0aWNreVNjcm9sbDogZmFsc2UsXG5cdFx0XHRcdG9wZW5PblNpbmdsZUNsaWNrOiBmYWxzZSxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdFx0fSkpO1xuXG5cdFx0dGhpcy5wcm9maWxlc0NvbnRlbnRUcmVlLnN0eWxlKGxpc3RTdHlsZXMpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLnByb2ZpbGVzQ29udGVudFRyZWUgPSB1bmRlZmluZWQpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnByb2ZpbGVzQ29udGVudFRyZWUub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KGhlaWdodCA9PiB7XG5cdFx0XHR0aGlzLnByb2ZpbGVzQ29udGVudFRyZWU/LmxheW91dChoZWlnaHQpO1xuXHRcdFx0aWYgKHByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudEhlaWdodC5maXJlKHByb2ZpbGVFbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5wcm9maWxlc0NvbnRlbnRUcmVlLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKChlID0+IHtcblx0XHRcdGlmIChwcm9maWxlRWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKHsgZWxlbWVudDogcHJvZmlsZUVsZW1lbnQsIHNlbGVjdGVkOiAhIWUuZWxlbWVudHMubGVuZ3RoIH0pO1xuXHRcdFx0fVxuXHRcdH0pKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5wcm9maWxlc0NvbnRlbnRUcmVlLm9uRGlkT3Blbihhc3luYyAoZSkgPT4ge1xuXHRcdFx0aWYgKCFlLmJyb3dzZXJFdmVudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5lbGVtZW50Py5lbGVtZW50Lm9wZW5BY3Rpb24pIHtcblx0XHRcdFx0YXdhaXQgZS5lbGVtZW50LmVsZW1lbnQub3BlbkFjdGlvbi5ydW4oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5wcm9maWxlc0NvbnRlbnRUcmVlLm9uQ29udGV4dE1lbnUoYXN5bmMgKGUpID0+IHtcblx0XHRcdGlmICghZS5lbGVtZW50Py5lbGVtZW50LmFjdGlvbnM/LmNvbnRleHRNZW51Py5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gZS5lbGVtZW50Py5lbGVtZW50Py5hY3Rpb25zPy5jb250ZXh0TWVudSA/PyBbXSxcblx0XHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IGUuZWxlbWVudFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlRGVzY3JpcHRpb24gPSAoZWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50KSA9PiB7XG5cdFx0XHRjbGVhck5vZGUoY29udGVudHNEZXNjcmlwdGlvbkVsZW1lbnQpO1xuXG5cdFx0XHRjb25zdCBtYXJrZG93biA9IG5ldyBNYXJrZG93blN0cmluZygpO1xuXHRcdFx0aWYgKGVsZW1lbnQucm9vdCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQgJiYgZWxlbWVudC5yb290LnByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdkZWZhdWx0IHByb2ZpbGUgY29udGVudHMgZGVzY3JpcHRpb24nLCBcIkJyb3dzZSBjb250ZW50cyBvZiB0aGlzIHByb2ZpbGVcXG5cIikpO1xuXHRcdFx0fVxuXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ2NvbnRlbnRzIHNvdXJjZSBkZXNjcmlwdGlvbicsIFwiQ29uZmlndXJlIHNvdXJjZSBvZiBjb250ZW50cyBmb3IgdGhpcyBwcm9maWxlXFxuXCIpKTtcblx0XHRcdFx0aWYgKGVsZW1lbnQucm9vdCBpbnN0YW5jZW9mIE5ld1Byb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdFx0Y29uc3QgY29weUZyb21OYW1lID0gZWxlbWVudC5yb290LmdldENvcHlGcm9tTmFtZSgpO1xuXHRcdFx0XHRcdGNvbnN0IG9wdGlvbk5hbWUgPSBjb3B5RnJvbU5hbWUgPT09IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUubmFtZVxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY29weSBmcm9tIGRlZmF1bHQnLCBcInswfSAoQ29weSlcIiwgY29weUZyb21OYW1lKVxuXHRcdFx0XHRcdFx0OiBjb3B5RnJvbU5hbWU7XG5cdFx0XHRcdFx0aWYgKG9wdGlvbk5hbWUpIHtcblx0XHRcdFx0XHRcdG1hcmtkb3duXG5cdFx0XHRcdFx0XHRcdC5hcHBlbmRNYXJrZG93bihsb2NhbGl6ZSgnY29weSBpbmZvJywgXCItICp7MH06KiBDb3B5IGNvbnRlbnRzIGZyb20gdGhlIHsxfSBwcm9maWxlXFxuXCIsIG9wdGlvbk5hbWUsIGNvcHlGcm9tTmFtZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRtYXJrZG93blxuXHRcdFx0XHRcdFx0LmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdkZWZhdWx0IGluZm8nLCBcIi0gKkRlZmF1bHQ6KiBVc2UgY29udGVudHMgZnJvbSB0aGUgRGVmYXVsdCBwcm9maWxlXFxuXCIpKVxuXHRcdFx0XHRcdFx0LmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdub25lIGluZm8nLCBcIi0gKk5vbmU6KiBDcmVhdGUgZW1wdHkgY29udGVudHNcXG5cIikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGFwcGVuZChjb250ZW50c0Rlc2NyaXB0aW9uRWxlbWVudCwgZWxlbWVudERpc3Bvc2FibGVzLmFkZChyZW5kZXJNYXJrZG93bihtYXJrZG93bikpLmVsZW1lbnQpO1xuXHRcdH07XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2V0IGVsZW1lbnQoZWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50KSB7XG5cdFx0XHRcdHByb2ZpbGVFbGVtZW50ID0gZWxlbWVudDtcblx0XHRcdFx0dXBkYXRlRGVzY3JpcHRpb24oZWxlbWVudCk7XG5cdFx0XHRcdGlmIChlbGVtZW50LnJvb3QgaW5zdGFuY2VvZiBOZXdQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0XHRcdGNvbnRlbnRzVHJlZUhlYWRlci5jbGFzc0xpc3QucmVtb3ZlKCdkZWZhdWx0LXByb2ZpbGUnKTtcblx0XHRcdFx0fSBlbHNlIGlmIChlbGVtZW50LnJvb3QgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50KSB7XG5cdFx0XHRcdFx0Y29udGVudHNUcmVlSGVhZGVyLmNsYXNzTGlzdC50b2dnbGUoJ2RlZmF1bHQtcHJvZmlsZScsIGVsZW1lbnQucm9vdC5wcm9maWxlLmlzRGVmYXVsdCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cHJvZmlsZXNDb250ZW50VHJlZS5zZXRJbnB1dChwcm9maWxlRWxlbWVudC5yb290KTtcblx0XHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzLmFkZChwcm9maWxlRWxlbWVudC5yb290Lm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlLmNvcHlGcm9tIHx8IGUuY29weUZsYWdzIHx8IGUuZmxhZ3MgfHwgZS5leHRlbnNpb25zIHx8IGUuc25pcHBldHMgfHwgZS5wcmV2aWV3KSB7XG5cdFx0XHRcdFx0XHRwcm9maWxlc0NvbnRlbnRUcmVlLnVwZGF0ZUNoaWxkcmVuKGVsZW1lbnQucm9vdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlLmNvcHlGcm9tSW5mbykge1xuXHRcdFx0XHRcdFx0dXBkYXRlRGVzY3JpcHRpb24oZWxlbWVudCk7XG5cdFx0XHRcdFx0XHR0aGF0Ll9vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQuZmlyZShlbGVtZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRjbGVhclNlbGVjdGlvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wcm9maWxlc0NvbnRlbnRUcmVlKSB7XG5cdFx0XHR0aGlzLnByb2ZpbGVzQ29udGVudFRyZWUuc2V0U2VsZWN0aW9uKFtdKTtcblx0XHRcdHRoaXMucHJvZmlsZXNDb250ZW50VHJlZS5zZXRGb2N1cyhbXSk7XG5cdFx0fVxuXHR9XG59XG5cbmludGVyZmFjZSBXb3Jrc3BhY2VUYWJsZUVsZW1lbnQge1xuXHRyZWFkb25seSB3b3Jrc3BhY2U6IFVSSTtcblx0cmVhZG9ubHkgcHJvZmlsZUVsZW1lbnQ6IFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQ7XG59XG5cbmNsYXNzIFByb2ZpbGVXb3Jrc3BhY2VzUmVuZGVyZXIgZXh0ZW5kcyBQcm9maWxlUHJvcGVydHlSZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogUHJvZmlsZVByb3BlcnR5ID0gJ3dvcmtzcGFjZXMnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudEhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFByb2ZpbGVUcmVlRWxlbWVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCA9IHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudEhlaWdodC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgZWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50OyBzZWxlY3RlZDogYm9vbGVhbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZWxlY3Rpb24gPSB0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHdvcmtzcGFjZXNUYWJsZTogV29ya2JlbmNoVGFibGU8V29ya3NwYWNlVGFibGVFbGVtZW50PiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiBJUHJvZmlsZVByb3BlcnR5UmVuZGVyZXJUZW1wbGF0ZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0bGV0IHByb2ZpbGVFbGVtZW50OiBQcm9maWxlVHJlZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBwcm9maWxlV29ya3NwYWNlc1Jvd0NvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy5wcm9maWxlLXJvdy1jb250YWluZXInKSk7XG5cdFx0YXBwZW5kKHByb2ZpbGVXb3Jrc3BhY2VzUm93Q29udGFpbmVyLCAkKCcucHJvZmlsZS1sYWJlbC1lbGVtZW50JywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnZm9sZGVyc193b3Jrc3BhY2VzJywgXCJGb2xkZXJzICYgV29ya3NwYWNlc1wiKSkpO1xuXHRcdGNvbnN0IHByb2ZpbGVXb3Jrc3BhY2VzRGVzY3JpcHRpb25FbGVtZW50ID0gYXBwZW5kKHByb2ZpbGVXb3Jrc3BhY2VzUm93Q29udGFpbmVyLCAkKCcucHJvZmlsZS1kZXNjcmlwdGlvbi1lbGVtZW50JykpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlc1RhYmxlQ29udGFpbmVyID0gYXBwZW5kKHByb2ZpbGVXb3Jrc3BhY2VzUm93Q29udGFpbmVyLCAkKCcucHJvZmlsZS1hc3NvY2lhdGlvbnMtdGFibGUnKSk7XG5cdFx0Y29uc3QgdGFibGUgPSB0aGlzLndvcmtzcGFjZXNUYWJsZSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRhYmxlPFdvcmtzcGFjZVRhYmxlRWxlbWVudD4sXG5cdFx0XHQnUHJvZmlsZUVkaXRvci1Bc3NvY2lhdGlvbnNUYWJsZScsXG5cdFx0XHR3b3Jrc3BhY2VzVGFibGVDb250YWluZXIsXG5cdFx0XHRuZXcgY2xhc3MgaW1wbGVtZW50cyBJVGFibGVWaXJ0dWFsRGVsZWdhdGU8VVJJPiB7XG5cdFx0XHRcdHJlYWRvbmx5IGhlYWRlclJvd0hlaWdodCA9IDMwO1xuXHRcdFx0XHRnZXRIZWlnaHQoKSB7IHJldHVybiAyNDsgfVxuXHRcdFx0fSxcblx0XHRcdFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiAnJyxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDEsXG5cdFx0XHRcdFx0bWluaW11bVdpZHRoOiAzMCxcblx0XHRcdFx0XHRtYXhpbXVtV2lkdGg6IDMwLFxuXHRcdFx0XHRcdHRlbXBsYXRlSWQ6IFdvcmtzcGFjZVVyaUVtcHR5Q29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0cHJvamVjdChyb3c6IFdvcmtzcGFjZVRhYmxlRWxlbWVudCk6IFdvcmtzcGFjZVRhYmxlRWxlbWVudCB7IHJldHVybiByb3c7IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2hvc3RDb2x1bW5MYWJlbCcsIFwiSG9zdFwiKSxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDIsXG5cdFx0XHRcdFx0dGVtcGxhdGVJZDogV29ya3NwYWNlVXJpSG9zdENvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRcdHByb2plY3Qocm93OiBXb3Jrc3BhY2VUYWJsZUVsZW1lbnQpOiBXb3Jrc3BhY2VUYWJsZUVsZW1lbnQgeyByZXR1cm4gcm93OyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwYXRoQ29sdW1uTGFiZWwnLCBcIlBhdGhcIiksXG5cdFx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdFx0d2VpZ2h0OiA3LFxuXHRcdFx0XHRcdHRlbXBsYXRlSWQ6IFdvcmtzcGFjZVVyaVBhdGhDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRCxcblx0XHRcdFx0XHRwcm9qZWN0KHJvdzogV29ya3NwYWNlVGFibGVFbGVtZW50KTogV29ya3NwYWNlVGFibGVFbGVtZW50IHsgcmV0dXJuIHJvdzsgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6ICcnLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRcdHdlaWdodDogMSxcblx0XHRcdFx0XHRtaW5pbXVtV2lkdGg6IDg0LFxuXHRcdFx0XHRcdG1heGltdW1XaWR0aDogODQsXG5cdFx0XHRcdFx0dGVtcGxhdGVJZDogV29ya3NwYWNlVXJpQWN0aW9uc0NvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRcdHByb2plY3Qocm93OiBXb3Jrc3BhY2VUYWJsZUVsZW1lbnQpOiBXb3Jrc3BhY2VUYWJsZUVsZW1lbnQgeyByZXR1cm4gcm93OyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgV29ya3NwYWNlVXJpRW1wdHlDb2x1bW5SZW5kZXJlcigpLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtzcGFjZVVyaUhvc3RDb2x1bW5SZW5kZXJlciksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya3NwYWNlVXJpUGF0aENvbHVtblJlbmRlcmVyKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3Jrc3BhY2VVcmlBY3Rpb25zQ29sdW1uUmVuZGVyZXIpLFxuXHRcdFx0XSxcblx0XHRcdHtcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiBmYWxzZSxcblx0XHRcdFx0b3Blbk9uU2luZ2xlQ2xpY2s6IGZhbHNlLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWw6IChpdGVtOiBXb3Jrc3BhY2VUYWJsZUVsZW1lbnQpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGhvc3RMYWJlbCA9IGdldEhvc3RMYWJlbCh0aGlzLmxhYmVsU2VydmljZSwgaXRlbS53b3Jrc3BhY2UpO1xuXHRcdFx0XHRcdFx0aWYgKGhvc3RMYWJlbCA9PT0gdW5kZWZpbmVkIHx8IGhvc3RMYWJlbC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0cnVzdGVkRm9sZGVyQXJpYUxhYmVsJywgXCJ7MH0sIHRydXN0ZWRcIiwgdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoaXRlbS53b3Jrc3BhY2UpKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0cnVzdGVkRm9sZGVyV2l0aEhvc3RBcmlhTGFiZWwnLCBcInswfSBvbiB7MX0sIHRydXN0ZWRcIiwgdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoaXRlbS53b3Jrc3BhY2UpLCBob3N0TGFiZWwpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsOiAoKSA9PiBsb2NhbGl6ZSgndHJ1c3RlZEZvbGRlcnNBbmRXb3Jrc3BhY2VzJywgXCJUcnVzdGVkIEZvbGRlcnMgJiBXb3Jrc3BhY2VzXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZChlbGVtZW50OiBXb3Jrc3BhY2VUYWJsZUVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LndvcmtzcGFjZS50b1N0cmluZygpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR0aGlzLndvcmtzcGFjZXNUYWJsZS5zdHlsZShsaXN0U3R5bGVzKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMud29ya3NwYWNlc1RhYmxlID0gdW5kZWZpbmVkKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMud29ya3NwYWNlc1RhYmxlLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKChlID0+IHtcblx0XHRcdGlmIChwcm9maWxlRWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKHsgZWxlbWVudDogcHJvZmlsZUVsZW1lbnQsIHNlbGVjdGVkOiAhIWUuZWxlbWVudHMubGVuZ3RoIH0pO1xuXHRcdFx0fVxuXHRcdH0pKSk7XG5cblx0XHRjb25zdCBhZGRCdXR0b25CYXJFbGVtZW50ID0gYXBwZW5kKHByb2ZpbGVXb3Jrc3BhY2VzUm93Q29udGFpbmVyLCAkKCcucHJvZmlsZS13b3Jrc3BhY2VzLWJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgYnV0dG9uQmFyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b25CYXIoYWRkQnV0dG9uQmFyRWxlbWVudCkpO1xuXHRcdGNvbnN0IGFkZEJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKGJ1dHRvbkJhci5hZGRCdXR0b24oeyB0aXRsZTogbG9jYWxpemUoJ2FkZEJ1dHRvbicsIFwiQWRkIEZvbGRlclwiKSwgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcyB9KSk7XG5cdFx0YWRkQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2FkZEJ1dHRvbicsIFwiQWRkIEZvbGRlclwiKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGRCdXR0b24ub25EaWRDbGljayhhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmlzID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRcdGNhblNlbGVjdEZpbGVzOiBmYWxzZSxcblx0XHRcdFx0Y2FuU2VsZWN0Rm9sZGVyczogdHJ1ZSxcblx0XHRcdFx0Y2FuU2VsZWN0TWFueTogdHJ1ZSxcblx0XHRcdFx0b3BlbkxhYmVsOiBsb2NhbGl6ZSgnYWRkRm9sZGVyJywgXCJBZGQgRm9sZGVyXCIpLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FkZEZvbGRlclRpdGxlJywgXCJTZWxlY3QgRm9sZGVycyBUbyBBZGRcIilcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHVyaXMpIHtcblx0XHRcdFx0aWYgKHByb2ZpbGVFbGVtZW50Py5yb290IGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0XHRcdHByb2ZpbGVFbGVtZW50LnJvb3QudXBkYXRlV29ya3NwYWNlcyh1cmlzLCBbXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodGFibGUub25EaWRPcGVuKGl0ZW0gPT4ge1xuXHRcdFx0aWYgKGl0ZW0/LmVsZW1lbnQpIHtcblx0XHRcdFx0aXRlbS5lbGVtZW50LnByb2ZpbGVFbGVtZW50Lm9wZW5Xb3Jrc3BhY2UoaXRlbS5lbGVtZW50LndvcmtzcGFjZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlVGFibGUgPSAoKSA9PiB7XG5cdFx0XHRpZiAocHJvZmlsZUVsZW1lbnQ/LnJvb3QgaW5zdGFuY2VvZiBVc2VyRGF0YVByb2ZpbGVFbGVtZW50ICYmIHByb2ZpbGVFbGVtZW50LnJvb3Qud29ya3NwYWNlcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdHByb2ZpbGVXb3Jrc3BhY2VzRGVzY3JpcHRpb25FbGVtZW50LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2ZvbGRlcnNfd29ya3NwYWNlc19kZXNjcmlwdGlvbicsIFwiRm9sbG93aW5nIGZvbGRlcnMgYW5kIHdvcmtzcGFjZXMgYXJlIHVzaW5nIHRoaXMgcHJvZmlsZVwiKTtcblx0XHRcdFx0d29ya3NwYWNlc1RhYmxlQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGUnKTtcblx0XHRcdFx0dGFibGUuc3BsaWNlKDAsIHRhYmxlLmxlbmd0aCwgcHJvZmlsZUVsZW1lbnQucm9vdC53b3Jrc3BhY2VzXG5cdFx0XHRcdFx0Lm1hcCh3b3Jrc3BhY2UgPT4gKHsgd29ya3NwYWNlLCBwcm9maWxlRWxlbWVudDogPFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQ+cHJvZmlsZUVsZW1lbnQhLnJvb3QgfSkpXG5cdFx0XHRcdFx0LnNvcnQoKGEsIGIpID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5jb21wYXJlKGEud29ya3NwYWNlLCBiLndvcmtzcGFjZSkpXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHRoaXMubGF5b3V0KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwcm9maWxlV29ya3NwYWNlc0Rlc2NyaXB0aW9uRWxlbWVudC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdub19mb2xkZXJfZGVzY3JpcHRpb24nLCBcIk5vIGZvbGRlcnMgb3Igd29ya3NwYWNlcyBhcmUgdXNpbmcgdGhpcyBwcm9maWxlXCIpO1xuXHRcdFx0XHR3b3Jrc3BhY2VzVGFibGVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGlkZScpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2V0IGVsZW1lbnQoZWxlbWVudDogUHJvZmlsZVRyZWVFbGVtZW50KSB7XG5cdFx0XHRcdHByb2ZpbGVFbGVtZW50ID0gZWxlbWVudDtcblx0XHRcdFx0aWYgKGVsZW1lbnQucm9vdCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQpIHtcblx0XHRcdFx0XHR1cGRhdGVUYWJsZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsZW1lbnREaXNwb3NhYmxlcy5hZGQocHJvZmlsZUVsZW1lbnQucm9vdC5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdFx0XHRpZiAocHJvZmlsZUVsZW1lbnQgJiYgZS53b3Jrc3BhY2VzKSB7XG5cdFx0XHRcdFx0XHR1cGRhdGVUYWJsZSgpO1xuXHRcdFx0XHRcdFx0dGhhdC5fb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0LmZpcmUocHJvZmlsZUVsZW1lbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdGxheW91dCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy53b3Jrc3BhY2VzVGFibGUpIHtcblx0XHRcdHRoaXMud29ya3NwYWNlc1RhYmxlLmxheW91dCgodGhpcy53b3Jrc3BhY2VzVGFibGUubGVuZ3RoICogMjQpICsgMzAsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXJTZWxlY3Rpb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlc1RhYmxlKSB7XG5cdFx0XHR0aGlzLndvcmtzcGFjZXNUYWJsZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdFx0dGhpcy53b3Jrc3BhY2VzVGFibGUuc2V0Rm9jdXMoW10pO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBFeGlzdGluZ1Byb2ZpbGVSZXNvdXJjZVRyZWVSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0UHJvZmlsZVJlc291cmNlVHJlZVJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxQcm9maWxlQ29udGVudFRyZWVFbGVtZW50LCB2b2lkLCBJRXhpc3RpbmdQcm9maWxlUmVzb3VyY2VUZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnRXhpc3RpbmdQcm9maWxlUmVzb3VyY2VUZW1wbGF0ZSc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IEV4aXN0aW5nUHJvZmlsZVJlc291cmNlVHJlZVJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IElFeGlzdGluZ1Byb2ZpbGVSZXNvdXJjZVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLnByb2ZpbGUtdHJlZS1pdGVtLWNvbnRhaW5lci5leGlzdGluZy1wcm9maWxlLXJlc291cmNlLXR5cGUtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLnByb2ZpbGUtcmVzb3VyY2UtdHlwZS1sYWJlbCcpKTtcblxuXHRcdGNvbnN0IHJhZGlvID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBSYWRpbyh7IGl0ZW1zOiBbXSB9KSk7XG5cdFx0YXBwZW5kKGFwcGVuZChjb250YWluZXIsICQoJy5wcm9maWxlLXJlc291cmNlLW9wdGlvbnMtY29udGFpbmVyJykpLCByYWRpby5kb21Ob2RlKTtcblxuXHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcucHJvZmlsZS1yZXNvdXJjZS1hY3Rpb25zLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hUb29sQmFyLFxuXHRcdFx0YWN0aW9uc0NvbnRhaW5lcixcblx0XHRcdHtcblx0XHRcdFx0aG92ZXJEZWxlZ2F0ZTogZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZUluc3RhbnRIb3ZlckRlbGVnYXRlKCkpLFxuXHRcdFx0XHRoaWdobGlnaHRUb2dnbGVkSXRlbXM6IHRydWVcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdHJldHVybiB7IGxhYmVsLCByYWRpbywgYWN0aW9uQmFyLCBkaXNwb3NhYmxlcywgZWxlbWVudERpc3Bvc2FibGVzOiBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudCh7IGVsZW1lbnQ6IHByb2ZpbGVSZXNvdXJjZVRyZWVFbGVtZW50IH06IElUcmVlTm9kZTxQcm9maWxlQ29udGVudFRyZWVFbGVtZW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRXhpc3RpbmdQcm9maWxlUmVzb3VyY2VUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Y29uc3QgeyBlbGVtZW50LCByb290IH0gPSBwcm9maWxlUmVzb3VyY2VUcmVlRWxlbWVudDtcblx0XHRpZiAoIShyb290IGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRXhpc3RpbmdQcm9maWxlUmVzb3VyY2VUcmVlUmVuZGVyZXIgY2FuIG9ubHkgcmVuZGVyIGV4aXN0aW5nIHByb2ZpbGUgZWxlbWVudCcpO1xuXHRcdH1cblx0XHRpZiAoaXNTdHJpbmcoZWxlbWVudCkgfHwgIWlzUHJvZmlsZVJlc291cmNlVHlwZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBwcm9maWxlIHJlc291cmNlIGVsZW1lbnQnKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cGRhdGVSYWRpb0l0ZW1zID0gKCkgPT4ge1xuXHRcdFx0dGVtcGxhdGVEYXRhLnJhZGlvLnNldEl0ZW1zKFt7XG5cdFx0XHRcdHRleHQ6IGxvY2FsaXplKCdkZWZhdWx0JywgXCJEZWZhdWx0XCIpLFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZGVmYXVsdCBkZXNjcmlwdGlvbicsIFwiVXNlIHswfSBmcm9tIHRoZSBEZWZhdWx0IHByb2ZpbGVcIiwgcmVzb3VyY2VUeXBlVGl0bGUpLFxuXHRcdFx0XHRpc0FjdGl2ZTogcm9vdC5nZXRGbGFnKGVsZW1lbnQucmVzb3VyY2VUeXBlKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dGV4dDogcm9vdC5uYW1lLFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnY3VycmVudCBkZXNjcmlwdGlvbicsIFwiVXNlIHswfSBmcm9tIHRoZSB7MX0gcHJvZmlsZVwiLCByZXNvdXJjZVR5cGVUaXRsZSwgcm9vdC5uYW1lKSxcblx0XHRcdFx0aXNBY3RpdmU6ICFyb290LmdldEZsYWcoZWxlbWVudC5yZXNvdXJjZVR5cGUpXG5cdFx0XHR9XSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc291cmNlVHlwZVRpdGxlID0gdGhpcy5nZXRSZXNvdXJjZVR5cGVUaXRsZShlbGVtZW50LnJlc291cmNlVHlwZSk7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnRleHRDb250ZW50ID0gcmVzb3VyY2VUeXBlVGl0bGU7XG5cblx0XHRpZiAocm9vdCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZUVsZW1lbnQgJiYgcm9vdC5wcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLnJhZGlvLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnaGlkZScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEucmFkaW8uZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRlJyk7XG5cdFx0XHR1cGRhdGVSYWRpb0l0ZW1zKCk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChyb290Lm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5uYW1lKSB7XG5cdFx0XHRcdFx0dXBkYXRlUmFkaW9JdGVtcygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0ZW1wbGF0ZURhdGEucmFkaW8ub25EaWRTZWxlY3QoKGluZGV4KSA9PiByb290LnNldEZsYWcoZWxlbWVudC5yZXNvdXJjZVR5cGUsIGluZGV4ID09PSAwKSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGlmIChlbGVtZW50Lm9wZW5BY3Rpb24pIHtcblx0XHRcdGFjdGlvbnMucHVzaChlbGVtZW50Lm9wZW5BY3Rpb24pO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudC5hY3Rpb25zPy5wcmltYXJ5KSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goLi4uZWxlbWVudC5hY3Rpb25zLnByaW1hcnkpO1xuXHRcdH1cblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnNldEFjdGlvbnMoYWN0aW9ucyk7XG5cdH1cblxufVxuXG5jbGFzcyBOZXdQcm9maWxlUmVzb3VyY2VUcmVlUmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdFByb2ZpbGVSZXNvdXJjZVRyZWVSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8UHJvZmlsZUNvbnRlbnRUcmVlRWxlbWVudCwgdm9pZCwgSU5ld1Byb2ZpbGVSZXNvdXJjZVRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdOZXdQcm9maWxlUmVzb3VyY2VUZW1wbGF0ZSc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IE5ld1Byb2ZpbGVSZXNvdXJjZVRyZWVSZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiBJTmV3UHJvZmlsZVJlc291cmNlVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBhcHBlbmQocGFyZW50LCAkKCcucHJvZmlsZS10cmVlLWl0ZW0tY29udGFpbmVyLm5ldy1wcm9maWxlLXJlc291cmNlLXR5cGUtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGxhYmVsQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLnByb2ZpbGUtcmVzb3VyY2UtdHlwZS1sYWJlbC1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBhcHBlbmQobGFiZWxDb250YWluZXIsICQoJ3NwYW4ucHJvZmlsZS1yZXNvdXJjZS10eXBlLWxhYmVsJykpO1xuXG5cdFx0Y29uc3QgcmFkaW8gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFJhZGlvKHsgaXRlbXM6IFtdIH0pKTtcblx0XHRhcHBlbmQoYXBwZW5kKGNvbnRhaW5lciwgJCgnLnByb2ZpbGUtcmVzb3VyY2Utb3B0aW9ucy1jb250YWluZXInKSksIHJhZGlvLmRvbU5vZGUpO1xuXG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5wcm9maWxlLXJlc291cmNlLWFjdGlvbnMtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRvb2xCYXIsXG5cdFx0XHRhY3Rpb25zQ29udGFpbmVyLFxuXHRcdFx0e1xuXHRcdFx0XHRob3ZlckRlbGVnYXRlOiBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUoKSksXG5cdFx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogdHJ1ZVxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0cmV0dXJuIHsgbGFiZWwsIHJhZGlvLCBhY3Rpb25CYXIsIGRpc3Bvc2FibGVzLCBlbGVtZW50RGlzcG9zYWJsZXM6IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KHsgZWxlbWVudDogcHJvZmlsZVJlc291cmNlVHJlZUVsZW1lbnQgfTogSVRyZWVOb2RlPFByb2ZpbGVDb250ZW50VHJlZUVsZW1lbnQsIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElOZXdQcm9maWxlUmVzb3VyY2VUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Y29uc3QgeyBlbGVtZW50LCByb290IH0gPSBwcm9maWxlUmVzb3VyY2VUcmVlRWxlbWVudDtcblx0XHRpZiAoIShyb290IGluc3RhbmNlb2YgTmV3UHJvZmlsZUVsZW1lbnQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05ld1Byb2ZpbGVSZXNvdXJjZVRyZWVSZW5kZXJlciBjYW4gb25seSByZW5kZXIgbmV3IHByb2ZpbGUgZWxlbWVudCcpO1xuXHRcdH1cblx0XHRpZiAoaXNTdHJpbmcoZWxlbWVudCkgfHwgIWlzUHJvZmlsZVJlc291cmNlVHlwZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBwcm9maWxlIHJlc291cmNlIGVsZW1lbnQnKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvdXJjZVR5cGVUaXRsZSA9IHRoaXMuZ2V0UmVzb3VyY2VUeXBlVGl0bGUoZWxlbWVudC5yZXNvdXJjZVR5cGUpO1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC50ZXh0Q29udGVudCA9IHJlc291cmNlVHlwZVRpdGxlO1xuXG5cdFx0Y29uc3QgcmVuZGVyUmFkaW9JdGVtcyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IG9wdGlvbnMgPSBbe1xuXHRcdFx0XHR0ZXh0OiBsb2NhbGl6ZSgnZGVmYXVsdCcsIFwiRGVmYXVsdFwiKSxcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2RlZmF1bHQgZGVzY3JpcHRpb24nLCBcIlVzZSB7MH0gZnJvbSB0aGUgRGVmYXVsdCBwcm9maWxlXCIsIHJlc291cmNlVHlwZVRpdGxlKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHRleHQ6IGxvY2FsaXplKCdub25lJywgXCJOb25lXCIpLFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnbm9uZSBkZXNjcmlwdGlvbicsIFwiQ3JlYXRlIGVtcHR5IHswfVwiLCByZXNvdXJjZVR5cGVUaXRsZSlcblx0XHRcdH1dO1xuXHRcdFx0Y29uc3QgY29weUZyb21OYW1lID0gcm9vdC5nZXRDb3B5RnJvbU5hbWUoKTtcblx0XHRcdGNvbnN0IG5hbWUgPSBjb3B5RnJvbU5hbWUgPT09IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUubmFtZVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjb3B5IGZyb20gZGVmYXVsdCcsIFwiezB9IChDb3B5KVwiLCBjb3B5RnJvbU5hbWUpXG5cdFx0XHRcdDogY29weUZyb21OYW1lO1xuXHRcdFx0aWYgKHJvb3QuY29weUZyb20gJiYgbmFtZSkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEucmFkaW8uc2V0SXRlbXMoW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHRleHQ6IG5hbWUsXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBuYW1lID8gbG9jYWxpemUoJ2NvcHkgZnJvbSBwcm9maWxlIGRlc2NyaXB0aW9uJywgXCJDb3B5IHswfSBmcm9tIHRoZSB7MX0gcHJvZmlsZVwiLCByZXNvdXJjZVR5cGVUaXRsZSwgbmFtZSkgOiBsb2NhbGl6ZSgnY29weSBkZXNjcmlwdGlvbicsIFwiQ29weVwiKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdC4uLm9wdGlvbnNcblx0XHRcdFx0XSk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5yYWRpby5zZXRBY3RpdmVJdGVtKHJvb3QuZ2V0Q29weUZsYWcoZWxlbWVudC5yZXNvdXJjZVR5cGUpID8gMCA6IHJvb3QuZ2V0RmxhZyhlbGVtZW50LnJlc291cmNlVHlwZSkgPyAxIDogMik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEucmFkaW8uc2V0SXRlbXMob3B0aW9ucyk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5yYWRpby5zZXRBY3RpdmVJdGVtKHJvb3QuZ2V0RmxhZyhlbGVtZW50LnJlc291cmNlVHlwZSkgPyAwIDogMSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGlmIChyb290LmNvcHlGcm9tKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0ZW1wbGF0ZURhdGEucmFkaW8ub25EaWRTZWxlY3QoaW5kZXggPT4ge1xuXHRcdFx0XHRyb290LnNldEZsYWcoZWxlbWVudC5yZXNvdXJjZVR5cGUsIGluZGV4ID09PSAxKTtcblx0XHRcdFx0cm9vdC5zZXRDb3B5RmxhZyhlbGVtZW50LnJlc291cmNlVHlwZSwgaW5kZXggPT09IDApO1xuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0ZW1wbGF0ZURhdGEucmFkaW8ub25EaWRTZWxlY3QoaW5kZXggPT4ge1xuXHRcdFx0XHRyb290LnNldEZsYWcoZWxlbWVudC5yZXNvdXJjZVR5cGUsIGluZGV4ID09PSAwKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRyZW5kZXJSYWRpb0l0ZW1zKCk7XG5cdFx0dGVtcGxhdGVEYXRhLnJhZGlvLnNldEVuYWJsZWQoIXJvb3QuZGlzYWJsZWQgJiYgIXJvb3QucHJldmlld1Byb2ZpbGUpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHJvb3Qub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5kaXNhYmxlZCB8fCBlLnByZXZpZXcpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnJhZGlvLnNldEVuYWJsZWQoIXJvb3QuZGlzYWJsZWQgJiYgIXJvb3QucHJldmlld1Byb2ZpbGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuY29weUZyb20gfHwgZS5jb3B5RnJvbUluZm8pIHtcblx0XHRcdFx0cmVuZGVyUmFkaW9JdGVtcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRpZiAoZWxlbWVudC5vcGVuQWN0aW9uKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goZWxlbWVudC5vcGVuQWN0aW9uKTtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQuYWN0aW9ucz8ucHJpbWFyeSkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKC4uLmVsZW1lbnQuYWN0aW9ucy5wcmltYXJ5KTtcblx0XHR9XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5zZXRBY3Rpb25zKGFjdGlvbnMpO1xuXHR9XG59XG5cbmNsYXNzIFByb2ZpbGVSZXNvdXJjZUNoaWxkVHJlZUl0ZW1SZW5kZXJlciBleHRlbmRzIEFic3RyYWN0UHJvZmlsZVJlc291cmNlVHJlZVJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxQcm9maWxlQ29udGVudFRyZWVFbGVtZW50LCB2b2lkLCBJUHJvZmlsZVJlc291cmNlQ2hpbGRUcmVlSXRlbVRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdQcm9maWxlUmVzb3VyY2VDaGlsZFRyZWVJdGVtVGVtcGxhdGUnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBQcm9maWxlUmVzb3VyY2VDaGlsZFRyZWVJdGVtUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbGFiZWxzOiBSZXNvdXJjZUxhYmVscztcblx0cHJpdmF0ZSByZWFkb25seSBob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmxhYmVscyA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCBERUZBVUxUX0xBQkVMU19DT05UQUlORVIpO1xuXHRcdHRoaXMuaG92ZXJEZWxlZ2F0ZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUsICdtb3VzZScsIHVuZGVmaW5lZCwge30pKTtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiBJUHJvZmlsZVJlc291cmNlQ2hpbGRUcmVlSXRlbVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLnByb2ZpbGUtdHJlZS1pdGVtLWNvbnRhaW5lci5wcm9maWxlLXJlc291cmNlLWNoaWxkLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBjaGVja2JveCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hlY2tib3goJycsIGZhbHNlLCBkZWZhdWx0Q2hlY2tib3hTdHlsZXMpKTtcblx0XHRhcHBlbmQoY29udGFpbmVyLCBjaGVja2JveC5kb21Ob2RlKTtcblx0XHRjb25zdCByZXNvdXJjZUxhYmVsID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMubGFiZWxzLmNyZWF0ZShjb250YWluZXIsIHsgaG92ZXJEZWxlZ2F0ZTogdGhpcy5ob3ZlckRlbGVnYXRlIH0pKTtcblxuXHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcucHJvZmlsZS1yZXNvdXJjZS1hY3Rpb25zLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hUb29sQmFyLFxuXHRcdFx0YWN0aW9uc0NvbnRhaW5lcixcblx0XHRcdHtcblx0XHRcdFx0aG92ZXJEZWxlZ2F0ZTogZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZUluc3RhbnRIb3ZlckRlbGVnYXRlKCkpLFxuXHRcdFx0XHRoaWdobGlnaHRUb2dnbGVkSXRlbXM6IHRydWVcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdHJldHVybiB7IGNoZWNrYm94LCByZXNvdXJjZUxhYmVsLCBhY3Rpb25CYXIsIGRpc3Bvc2FibGVzLCBlbGVtZW50RGlzcG9zYWJsZXM6IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KHsgZWxlbWVudDogcHJvZmlsZVJlc291cmNlVHJlZUVsZW1lbnQgfTogSVRyZWVOb2RlPFByb2ZpbGVDb250ZW50VHJlZUVsZW1lbnQsIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElQcm9maWxlUmVzb3VyY2VDaGlsZFRyZWVJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGNvbnN0IHsgZWxlbWVudCB9ID0gcHJvZmlsZVJlc291cmNlVHJlZUVsZW1lbnQ7XG5cblx0XHRpZiAoaXNTdHJpbmcoZWxlbWVudCkgfHwgIWlzUHJvZmlsZVJlc291cmNlQ2hpbGRFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgcHJvZmlsZSByZXNvdXJjZSBlbGVtZW50Jyk7XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQuY2hlY2tib3gpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5jaGVja2JveC5kb21Ob2RlLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNoZWNrYm94LmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZScpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNoZWNrYm94LmNoZWNrZWQgPSBlbGVtZW50LmNoZWNrYm94LmlzQ2hlY2tlZDtcblx0XHRcdHRlbXBsYXRlRGF0YS5jaGVja2JveC5kb21Ob2RlLmFyaWFMYWJlbCA9IGVsZW1lbnQuY2hlY2tib3guYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uPy5sYWJlbCA/PyAnJztcblx0XHRcdGlmIChlbGVtZW50LmNoZWNrYm94LmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbj8ucm9sZSkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuY2hlY2tib3guZG9tTm9kZS5yb2xlID0gZWxlbWVudC5jaGVja2JveC5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24ucm9sZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNoZWNrYm94LmRvbU5vZGUucmVtb3ZlQXR0cmlidXRlKCd0YWJpbmRleCcpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNoZWNrYm94LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnaGlkZScpO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5yZXNvdXJjZUxhYmVsLnNldFJlc291cmNlKFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBlbGVtZW50LnJlc291cmNlID8gYmFzZW5hbWUoZWxlbWVudC5yZXNvdXJjZSkgOiBlbGVtZW50LmxhYmVsLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZWxlbWVudC5kZXNjcmlwdGlvbixcblx0XHRcdFx0cmVzb3VyY2U6IGVsZW1lbnQucmVzb3VyY2Vcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGZvcmNlTGFiZWw6IHRydWUsXG5cdFx0XHRcdGljb246IGVsZW1lbnQuaWNvbixcblx0XHRcdFx0aGlkZUljb246ICFlbGVtZW50LnJlc291cmNlICYmICFlbGVtZW50Lmljb24sXG5cdFx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRpZiAoZWxlbWVudC5vcGVuQWN0aW9uKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goZWxlbWVudC5vcGVuQWN0aW9uKTtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQuYWN0aW9ucz8ucHJpbWFyeSkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKC4uLmVsZW1lbnQuYWN0aW9ucy5wcmltYXJ5KTtcblx0XHR9XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5zZXRBY3Rpb25zKGFjdGlvbnMpO1xuXHR9XG5cbn1cblxuY2xhc3MgV29ya3NwYWNlVXJpRW1wdHlDb2x1bW5SZW5kZXJlciBpbXBsZW1lbnRzIElUYWJsZVJlbmRlcmVyPFdvcmtzcGFjZVRhYmxlRWxlbWVudCwge30+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2VtcHR5JztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBXb3Jrc3BhY2VVcmlFbXB0eUNvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB7fSB7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChpdGVtOiBXb3Jrc3BhY2VUYWJsZUVsZW1lbnQsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YToge30pOiB2b2lkIHtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSgpOiB2b2lkIHtcblx0fVxuXG59XG5cbmludGVyZmFjZSBJV29ya3NwYWNlVXJpSG9zdENvbHVtblRlbXBsYXRlRGF0YSB7XG5cdGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRob3N0Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0YnV0dG9uQmFyQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVuZGVyRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgV29ya3NwYWNlVXJpSG9zdENvbHVtblJlbmRlcmVyIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8V29ya3NwYWNlVGFibGVFbGVtZW50LCBJV29ya3NwYWNlVXJpSG9zdENvbHVtblRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnaG9zdCc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gV29ya3NwYWNlVXJpSG9zdENvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJV29ya3NwYWNlVXJpSG9zdENvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcmVuZGVyRGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdGNvbnN0IGVsZW1lbnQgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnLmhvc3QnKSk7XG5cdFx0Y29uc3QgaG9zdENvbnRhaW5lciA9IGVsZW1lbnQuYXBwZW5kQ2hpbGQoJCgnZGl2Lmhvc3QtbGFiZWwnKSk7XG5cdFx0Y29uc3QgYnV0dG9uQmFyQ29udGFpbmVyID0gZWxlbWVudC5hcHBlbmRDaGlsZCgkKCdkaXYuYnV0dG9uLWJhcicpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRlbGVtZW50LFxuXHRcdFx0aG9zdENvbnRhaW5lcixcblx0XHRcdGJ1dHRvbkJhckNvbnRhaW5lcixcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0cmVuZGVyRGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChpdGVtOiBXb3Jrc3BhY2VUYWJsZUVsZW1lbnQsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVdvcmtzcGFjZVVyaUhvc3RDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEucmVuZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0ZW1wbGF0ZURhdGEucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4geyBjbGVhck5vZGUodGVtcGxhdGVEYXRhLmJ1dHRvbkJhckNvbnRhaW5lcik7IH0gfSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEuaG9zdENvbnRhaW5lci5pbm5lclRleHQgPSBnZXRIb3N0TGFiZWwodGhpcy5sYWJlbFNlcnZpY2UsIGl0ZW0ud29ya3NwYWNlKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdjdXJyZW50LXdvcmtzcGFjZScsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGl0ZW0ud29ya3NwYWNlLCBpdGVtLnByb2ZpbGVFbGVtZW50LmdldEN1cnJlbnRXb3Jrc3BhY2UoKSkpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmhvc3RDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdHRlbXBsYXRlRGF0YS5idXR0b25CYXJDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElXb3Jrc3BhY2VVcmlIb3N0Q29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG59XG5cbmludGVyZmFjZSBJV29ya3NwYWNlVXJpUGF0aENvbHVtblRlbXBsYXRlRGF0YSB7XG5cdGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwYXRoTGFiZWw6IEhUTUxFbGVtZW50O1xuXHRwYXRoSG92ZXI6IElNYW5hZ2VkSG92ZXI7XG5cdHJlbmRlckRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmNsYXNzIFdvcmtzcGFjZVVyaVBhdGhDb2x1bW5SZW5kZXJlciBpbXBsZW1lbnRzIElUYWJsZVJlbmRlcmVyPFdvcmtzcGFjZVRhYmxlRWxlbWVudCwgSVdvcmtzcGFjZVVyaVBhdGhDb2x1bW5UZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ3BhdGgnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IFdvcmtzcGFjZVVyaVBhdGhDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmhvdmVyRGVsZWdhdGUgPSBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKTtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJV29ya3NwYWNlVXJpUGF0aENvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCcucGF0aCcpKTtcblx0XHRjb25zdCBwYXRoTGFiZWwgPSBlbGVtZW50LmFwcGVuZENoaWxkKCQoJ2Rpdi5wYXRoLWxhYmVsJykpO1xuXHRcdGNvbnN0IHBhdGhIb3ZlciA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcih0aGlzLmhvdmVyRGVsZWdhdGUsIHBhdGhMYWJlbCwgJycpKTtcblx0XHRjb25zdCByZW5kZXJEaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVsZW1lbnQsXG5cdFx0XHRwYXRoTGFiZWwsXG5cdFx0XHRwYXRoSG92ZXIsXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdHJlbmRlckRpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoaXRlbTogV29ya3NwYWNlVGFibGVFbGVtZW50LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElXb3Jrc3BhY2VVcmlQYXRoQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnJlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Y29uc3Qgc3RyaW5nVmFsdWUgPSB0aGlzLmZvcm1hdFBhdGgoaXRlbS53b3Jrc3BhY2UpO1xuXHRcdHRlbXBsYXRlRGF0YS5wYXRoTGFiZWwuaW5uZXJUZXh0ID0gc3RyaW5nVmFsdWU7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnY3VycmVudC13b3Jrc3BhY2UnLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChpdGVtLndvcmtzcGFjZSwgaXRlbS5wcm9maWxlRWxlbWVudC5nZXRDdXJyZW50V29ya3NwYWNlKCkpKTtcblx0XHR0ZW1wbGF0ZURhdGEucGF0aEhvdmVyLnVwZGF0ZShzdHJpbmdWYWx1ZSk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJV29ya3NwYWNlVXJpUGF0aENvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLnJlbmRlckRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgZm9ybWF0UGF0aCh1cmk6IFVSSSk6IHN0cmluZyB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0cmV0dXJuIG5vcm1hbGl6ZURyaXZlTGV0dGVyKHVyaS5mc1BhdGgpO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBwYXRoIGlzIG5vdCBhIGZpbGUgdXJpLCBidXQgcG9pbnRzIHRvIGEgd2luZG93cyByZW1vdGUsIHdlIHNob3VsZCBjcmVhdGUgd2luZG93cyBmcyBwYXRoXG5cdFx0Ly8gZS5nLiAvYzovdXNlci9kaXJlY3RvcnkgPT4gQzpcXHVzZXJcXGRpcmVjdG9yeVxuXHRcdGlmICh1cmkucGF0aC5zdGFydHNXaXRoKHBvc2l4LnNlcCkpIHtcblx0XHRcdGNvbnN0IHBhdGhXaXRob3V0TGVhZGluZ1NlcGFyYXRvciA9IHVyaS5wYXRoLnN1YnN0cmluZygxKTtcblx0XHRcdGNvbnN0IGlzV2luZG93c1BhdGggPSBoYXNEcml2ZUxldHRlcihwYXRoV2l0aG91dExlYWRpbmdTZXBhcmF0b3IsIHRydWUpO1xuXHRcdFx0aWYgKGlzV2luZG93c1BhdGgpIHtcblx0XHRcdFx0cmV0dXJuIG5vcm1hbGl6ZURyaXZlTGV0dGVyKHdpbjMyLm5vcm1hbGl6ZShwYXRoV2l0aG91dExlYWRpbmdTZXBhcmF0b3IpLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdXJpLnBhdGg7XG5cdH1cblxufVxuXG5pbnRlcmZhY2UgSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgQ2hhbmdlUHJvZmlsZUFjdGlvbiBpbXBsZW1lbnRzIElBY3Rpb24ge1xuXG5cdHJlYWRvbmx5IGlkID0gJ2NoYW5nZVByb2ZpbGUnO1xuXHRyZWFkb25seSBsYWJlbCA9ICdDaGFuZ2UgUHJvZmlsZSc7XG5cdHJlYWRvbmx5IGNsYXNzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGVkaXRJY29uKTtcblx0cmVhZG9ubHkgZW5hYmxlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgdG9vbHRpcCA9IGxvY2FsaXplKCdjaGFuZ2UgcHJvZmlsZScsIFwiQ2hhbmdlIFByb2ZpbGVcIik7XG5cdHJlYWRvbmx5IGNoZWNrZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGl0ZW06IFdvcmtzcGFjZVRhYmxlRWxlbWVudCxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmVuYWJsZWQgPSAhdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGl0ZW0ud29ya3NwYWNlLCBlbnZpcm9ubWVudFNlcnZpY2UuYWdlbnRTZXNzaW9uc1dvcmtzcGFjZSk7XG5cdH1cblxuXHRydW4oKTogdm9pZCB7IH1cblxuXHRnZXRTd2l0Y2hQcm9maWxlQWN0aW9ucygpOiBJQWN0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzXG5cdFx0XHQuZmlsdGVyKHByb2ZpbGUgPT4gIXByb2ZpbGUuaXNJbnRlcm5hbClcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLmlzRGVmYXVsdCA/IC0xIDogYi5pc0RlZmF1bHQgPyAxIDogYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKSlcblx0XHRcdC5tYXA8SUFjdGlvbj4ocHJvZmlsZSA9PiAoe1xuXHRcdFx0XHRpZDogYHN3aXRjaFByb2ZpbGVUbyR7cHJvZmlsZS5pZH1gLFxuXHRcdFx0XHRsYWJlbDogcHJvZmlsZS5uYW1lLFxuXHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRjaGVja2VkOiBwcm9maWxlLmlkID09PSB0aGlzLml0ZW0ucHJvZmlsZUVsZW1lbnQucHJvZmlsZS5pZCxcblx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChwcm9maWxlLmlkID09PSB0aGlzLml0ZW0ucHJvZmlsZUVsZW1lbnQucHJvZmlsZS5pZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnVwZGF0ZVByb2ZpbGUocHJvZmlsZSwgeyB3b3Jrc3BhY2VzOiBbLi4uKHByb2ZpbGUud29ya3NwYWNlcyA/PyBbXSksIHRoaXMuaXRlbS53b3Jrc3BhY2VdIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdH1cbn1cblxuY2xhc3MgV29ya3NwYWNlVXJpQWN0aW9uc0NvbHVtblJlbmRlcmVyIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8V29ya3NwYWNlVGFibGVFbGVtZW50LCBJQWN0aW9uc0NvbHVtblRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdhY3Rpb25zJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBXb3Jrc3BhY2VVcmlBY3Rpb25zQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50ID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy5wcm9maWxlLXdvcmtzcGFjZXMtYWN0aW9ucy1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgaG92ZXJEZWxlZ2F0ZSA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSgpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbkJhcihlbGVtZW50LCB7XG5cdFx0XHRob3ZlckRlbGVnYXRlLFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbikgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgQ2hhbmdlUHJvZmlsZUFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0oYWN0aW9uLCB7IGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbi5nZXRTd2l0Y2hQcm9maWxlQWN0aW9ucygpIH0sIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCB7XG5cdFx0XHRcdFx0XHRjbGFzc05hbWVzOiBhY3Rpb24uY2xhc3MsXG5cdFx0XHRcdFx0XHRob3ZlckRlbGVnYXRlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHJldHVybiB7IGFjdGlvbkJhciwgZGlzcG9zYWJsZXMgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoaXRlbTogV29ya3NwYWNlVGFibGVFbGVtZW50LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGFjdGlvbnMucHVzaCh0aGlzLmNyZWF0ZU9wZW5BY3Rpb24oaXRlbSkpO1xuXHRcdGFjdGlvbnMucHVzaChuZXcgQ2hhbmdlUHJvZmlsZUFjdGlvbihpdGVtLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UpKTtcblx0XHRhY3Rpb25zLnB1c2godGhpcy5jcmVhdGVEZWxldGVBY3Rpb24oaXRlbSkpO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIucHVzaChhY3Rpb25zLCB7IGljb246IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU9wZW5BY3Rpb24oaXRlbTogV29ya3NwYWNlVGFibGVFbGVtZW50KTogSUFjdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiAnJyxcblx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi53aW5kb3cpLFxuXHRcdFx0ZW5hYmxlZDogIXRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGl0ZW0ud29ya3NwYWNlLCBpdGVtLnByb2ZpbGVFbGVtZW50LmdldEN1cnJlbnRXb3Jrc3BhY2UoKSksXG5cdFx0XHRpZDogJ29wZW5Xb3Jrc3BhY2UnLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ29wZW4nLCBcIk9wZW4gaW4gTmV3IFdpbmRvd1wiKSxcblx0XHRcdHJ1bjogKCkgPT4gaXRlbS5wcm9maWxlRWxlbWVudC5vcGVuV29ya3NwYWNlKGl0ZW0ud29ya3NwYWNlKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZURlbGV0ZUFjdGlvbihpdGVtOiBXb3Jrc3BhY2VUYWJsZUVsZW1lbnQpOiBJQWN0aW9uIHtcblx0XHRjb25zdCBpc0FnZW50U2Vzc2lvbnNXb3Jrc3BhY2UgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChpdGVtLndvcmtzcGFjZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYWdlbnRTZXNzaW9uc1dvcmtzcGFjZSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiAnJyxcblx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUocmVtb3ZlSWNvbiksXG5cdFx0XHRlbmFibGVkOiB0aGlzLnVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLmdldERlZmF1bHRQcm9maWxlVG9Vc2UoKS5pZCAhPT0gaXRlbS5wcm9maWxlRWxlbWVudC5wcm9maWxlLmlkICYmICFpc0FnZW50U2Vzc2lvbnNXb3Jrc3BhY2UsXG5cdFx0XHRpZDogJ2RlbGV0ZVRydXN0ZWRVcmknLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2RlbGV0ZVRydXN0ZWRVcmknLCBcIkRlbGV0ZSBQYXRoXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiBpdGVtLnByb2ZpbGVFbGVtZW50LnVwZGF0ZVdvcmtzcGFjZXMoW10sIFtpdGVtLndvcmtzcGFjZV0pXG5cdFx0fTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG59XG5cbmZ1bmN0aW9uIGdldEhvc3RMYWJlbChsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsIHdvcmtzcGFjZVVyaTogVVJJKTogc3RyaW5nIHtcblx0cmV0dXJuIHdvcmtzcGFjZVVyaS5hdXRob3JpdHkgPyBsYWJlbFNlcnZpY2UuZ2V0SG9zdExhYmVsKHdvcmtzcGFjZVVyaS5zY2hlbWUsIHdvcmtzcGFjZVVyaS5hdXRob3JpdHkpIDogbG9jYWxpemUoJ2xvY2FsQXV0aG9yaXR5JywgXCJMb2NhbFwiKTtcbn1cblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JJbnB1dCBleHRlbmRzIEVkaXRvcklucHV0IHtcblx0c3RhdGljIHJlYWRvbmx5IElEOiBzdHJpbmcgPSAnd29ya2JlbmNoLmlucHV0LnVzZXJEYXRhUHJvZmlsZXMnO1xuXHRyZWFkb25seSByZXNvdXJjZSA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsOiBVc2VyRGF0YVByb2ZpbGVzRWRpdG9yTW9kZWw7XG5cblx0cHJpdmF0ZSBfZGlydHk6IGJvb2xlYW4gPSBmYWxzZTtcblx0Z2V0IGRpcnR5KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fZGlydHk7IH1cblx0c2V0IGRpcnR5KGRpcnR5OiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX2RpcnR5ICE9PSBkaXJ0eSkge1xuXHRcdFx0dGhpcy5fZGlydHkgPSBkaXJ0eTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGdldCBjYXBhYmlsaXRpZXMoKTogRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMge1xuXHRcdHJldHVybiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5SZXF1aXJlc01vZGFsO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5tb2RlbCA9IFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JNb2RlbC5nZXRJbnN0YW5jZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlKGUgPT4gdGhpcy5kaXJ0eSA9IHRoaXMubW9kZWwucHJvZmlsZXMuc29tZShwcm9maWxlID0+IHByb2ZpbGUgaW5zdGFuY2VvZiBOZXdQcm9maWxlRWxlbWVudCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCB0eXBlSWQoKTogc3RyaW5nIHsgcmV0dXJuIFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JJbnB1dC5JRDsgfVxuXHRvdmVycmlkZSBnZXROYW1lKCk6IHN0cmluZyB7IHJldHVybiBsb2NhbGl6ZSgndXNlckRhdGFQcm9maWxlcycsIFwiUHJvZmlsZXNcIik7IH1cblx0b3ZlcnJpZGUgZ2V0SWNvbigpOiBUaGVtZUljb24gfCB1bmRlZmluZWQgeyByZXR1cm4gZGVmYXVsdFVzZXJEYXRhUHJvZmlsZUljb247IH1cblxuXHRvdmVycmlkZSBhc3luYyByZXNvbHZlKCk6IFByb21pc2U8VXNlckRhdGFQcm9maWxlc0VkaXRvck1vZGVsPiB7XG5cdFx0YXdhaXQgdGhpcy5tb2RlbC5yZXNvbHZlKCk7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWw7XG5cdH1cblxuXHRvdmVycmlkZSBpc0RpcnR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRpcnR5O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2F2ZSgpOiBQcm9taXNlPEVkaXRvcklucHV0PiB7XG5cdFx0YXdhaXQgdGhpcy5tb2RlbC5zYXZlTmV3UHJvZmlsZSgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmV2ZXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubW9kZWwucmV2ZXJ0KCk7XG5cdH1cblxuXHRvdmVycmlkZSBtYXRjaGVzKG90aGVySW5wdXQ6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCk6IGJvb2xlYW4geyByZXR1cm4gb3RoZXJJbnB1dCBpbnN0YW5jZW9mIFVzZXJEYXRhUHJvZmlsZXNFZGl0b3JJbnB1dDsgfVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHRoaXMubW9kZWwucHJvZmlsZXMpIHtcblx0XHRcdGlmIChwcm9maWxlIGluc3RhbmNlb2YgVXNlckRhdGFQcm9maWxlRWxlbWVudCkge1xuXHRcdFx0XHRwcm9maWxlLnJlc2V0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFQcm9maWxlc0VkaXRvcklucHV0U2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblx0Y2FuU2VyaWFsaXplKGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRzZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0KTogc3RyaW5nIHsgcmV0dXJuICcnOyB9XG5cdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBFZGl0b3JJbnB1dCB7IHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVByb2ZpbGVzRWRpdG9ySW5wdXQpOyB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLEdBQUcsdUJBQXVCLFFBQVEsV0FBVyxXQUFXLGFBQWEsV0FBeUIsa0JBQWtCO0FBQ3pILFNBQVMsUUFBcUMsV0FBVyxlQUFlLGdCQUFnQjtBQUN4RixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQiwyQkFBMkI7QUFDekQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBMkIsMEJBQTBCLDJCQUEyQjtBQUNoRixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLCtCQUEyRjtBQUNwRyxTQUFTLG1CQUFtQjtBQUc1QixTQUFTLDRCQUFrRCxtQ0FBbUMseUJBQXlCLHNCQUFzQjtBQUM3SSxTQUFTLGFBQWEsUUFBUSxpQkFBaUI7QUFDL0MsU0FBUyxRQUFRLFdBQVcsMEJBQTBCO0FBQ3RELFNBQVMscUJBQXFCLHVCQUF1Qix1QkFBdUIsd0JBQXdCLGtCQUFrQixxQkFBcUI7QUFDM0ksU0FBUyxrQkFBa0IsWUFBWSxxQkFBcUI7QUFDNUQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx3QkFBd0IsZUFBZSxzQkFBc0I7QUFD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QTZCO0FBQzNDLFVBQU0sS0FBSyxNQUFNLGVBQWU7QUFDaEMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWUsU0FBd0I7QUFDdEMsU0FBSyxNQUFNLE9BQU87QUFBQSxFQUNuQjtBQUFBLEVBRVMsUUFBUSxZQUF3RDtBQUFFLFdBQU8sc0JBQXNCO0FBQUEsRUFBNkI7QUFBQSxFQUU1SCxVQUFnQjtBQUN4QixlQUFXLFdBQVcsS0FBSyxNQUFNLFVBQVU7QUFDMUMsVUFBSSxtQkFBbUIsd0JBQXdCO0FBQzlDLGdCQUFRLE1BQU07QUFBQSxNQUNmO0FBQUEsSUFDRDtBQUNBLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFDRDtBQTNEYSw0QkFDSSxLQUFhO0FBRGpCLDhCQUFOO0FBQUEsRUFvQko7QUFBQSxHQXBCVTtBQTZETixNQUFNLHNDQUFtRTtBQUFBLEVBQy9FLGFBQWEsYUFBbUM7QUFBRSxXQUFPO0FBQUEsRUFBTTtBQUFBLEVBQy9ELFVBQVUsYUFBa0M7QUFBRSxXQUFPO0FBQUEsRUFBSTtBQUFBLEVBQ3pELFlBQVksc0JBQTBEO0FBQUUsV0FBTyxxQkFBcUIsZUFBZSwyQkFBMkI7QUFBQSxFQUFHO0FBQ2xKOyIsCiAgIm5hbWVzIjogWyJlbGVtZW50VG9TZWxlY3QiLCAicHJvZmlsZUVsZW1lbnQiLCAiaW5kZXgiXQp9Cg==
