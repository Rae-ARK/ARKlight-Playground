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
import { $, addDisposableListener, addStandardDisposableListener, append, clearNode, EventHelper, EventType, isAncestorOfActiveElement } from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { ButtonBar } from "../../../../base/browser/ui/button/button.js";
import { InputBox, MessageType } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Action } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { debounce } from "../../../../base/common/decorators.js";
import { Emitter } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { normalizeDriveLetter } from "../../../../base/common/labels.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { parseLinkedText } from "../../../../base/common/linkedText.js";
import { Schemas } from "../../../../base/common/network.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { ConfigurationScope, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchTable } from "../../../../platform/list/browser/listService.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { isVirtualResource, isVirtualWorkspace } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { asCssVariable, buttonBackground, buttonSecondaryBackground, editorErrorForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { debugIconStartForeground } from "../../debug/browser/debugColors.js";
import { IExtensionsWorkbenchService, LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID } from "../../extensions/common/extensions.js";
import { APPLICATION_SCOPES, IWorkbenchConfigurationService } from "../../../services/configuration/common/configuration.js";
import { IExtensionManifestPropertiesService } from "../../../services/extensions/common/extensionManifestPropertiesService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { getExtensionDependencies } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { EnablementState, IWorkbenchExtensionEnablementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { posix, win32 } from "../../../../base/common/path.js";
import { hasDriveLetter, toSlashes } from "../../../../base/common/extpath.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { defaultButtonStyles, defaultInputBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
const shieldIcon = registerIcon("workspace-trust-banner", Codicon.shield, localize("shieldIcon", "Icon for workspace trust ion the banner."));
const checkListIcon = registerIcon("workspace-trust-editor-check", Codicon.check, localize("checkListIcon", "Icon for the checkmark in the workspace trust editor."));
const xListIcon = registerIcon("workspace-trust-editor-cross", Codicon.x, localize("xListIcon", "Icon for the cross in the workspace trust editor."));
const folderPickerIcon = registerIcon("workspace-trust-editor-folder-picker", Codicon.folder, localize("folderPickerIcon", "Icon for the pick folder icon in the workspace trust editor."));
const editIcon = registerIcon("workspace-trust-editor-edit-folder", Codicon.edit, localize("editIcon", "Icon for the edit folder icon in the workspace trust editor."));
const removeIcon = registerIcon("workspace-trust-editor-remove-folder", Codicon.close, localize("removeIcon", "Icon for the remove folder icon in the workspace trust editor."));
let WorkspaceTrustedUrisTable = class extends Disposable {
  constructor(container, instantiationService, workspaceService, workspaceTrustManagementService, uriService, labelService, fileDialogService) {
    super();
    this.container = container;
    this.instantiationService = instantiationService;
    this.workspaceService = workspaceService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.uriService = uriService;
    this.labelService = labelService;
    this.fileDialogService = fileDialogService;
    this._onDidAcceptEdit = this._register(new Emitter());
    this.onDidAcceptEdit = this._onDidAcceptEdit.event;
    this._onDidRejectEdit = this._register(new Emitter());
    this.onDidRejectEdit = this._onDidRejectEdit.event;
    this._onEdit = this._register(new Emitter());
    this.onEdit = this._onEdit.event;
    this._onDelete = this._register(new Emitter());
    this.onDelete = this._onDelete.event;
    this.descriptionElement = container.appendChild($(".workspace-trusted-folders-description"));
    const tableElement = container.appendChild($(".trusted-uris-table"));
    const addButtonBarElement = container.appendChild($(".trusted-uris-button-bar"));
    this.table = this.instantiationService.createInstance(
      WorkbenchTable,
      "WorkspaceTrust",
      tableElement,
      new TrustedUriTableVirtualDelegate(),
      [
        {
          label: localize("hostColumnLabel", "Host"),
          tooltip: "",
          weight: 1,
          templateId: TrustedUriHostColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("pathColumnLabel", "Path"),
          tooltip: "",
          weight: 8,
          templateId: TrustedUriPathColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: "",
          tooltip: "",
          weight: 1,
          minimumWidth: 75,
          maximumWidth: 75,
          templateId: TrustedUriActionsColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        }
      ],
      [
        this.instantiationService.createInstance(TrustedUriHostColumnRenderer),
        this.instantiationService.createInstance(TrustedUriPathColumnRenderer, this),
        this.instantiationService.createInstance(TrustedUriActionsColumnRenderer, this, this.currentWorkspaceUri)
      ],
      {
        horizontalScrolling: false,
        alwaysConsumeMouseWheel: false,
        openOnSingleClick: false,
        multipleSelectionSupport: false,
        accessibilityProvider: {
          getAriaLabel: (item) => {
            const hostLabel = getHostLabel(this.labelService, item);
            if (hostLabel === void 0 || hostLabel.length === 0) {
              return localize("trustedFolderAriaLabel", "{0}, trusted", this.labelService.getUriLabel(item.uri));
            }
            return localize("trustedFolderWithHostAriaLabel", "{0} on {1}, trusted", this.labelService.getUriLabel(item.uri), hostLabel);
          },
          getWidgetAriaLabel: () => localize("trustedFoldersAndWorkspaces", "Trusted Folders & Workspaces")
        },
        identityProvider: {
          getId(element) {
            return element.uri.toString();
          }
        }
      }
    );
    this._register(this.table.onDidOpen((item) => {
      if (item && item.element && !item.browserEvent?.defaultPrevented) {
        this.edit(item.element, true);
      }
    }));
    const buttonBar = this._register(new ButtonBar(addButtonBarElement));
    const addButton = this._register(buttonBar.addButton({ title: localize("addButton", "Add Folder"), ...defaultButtonStyles }));
    addButton.label = localize("addButton", "Add Folder");
    this._register(addButton.onDidClick(async () => {
      const uri = await this.fileDialogService.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: this.currentWorkspaceUri,
        openLabel: localize("trustUri", "Trust Folder"),
        title: localize("selectTrustedUri", "Select Folder To Trust")
      });
      if (uri) {
        this.workspaceTrustManagementService.setUrisTrust(uri, true);
      }
    }));
    this._register(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => {
      this.updateTable();
    }));
  }
  getIndexOfTrustedUriEntry(item) {
    const index = this.trustedUriEntries.indexOf(item);
    if (index === -1) {
      for (let i = 0; i < this.trustedUriEntries.length; i++) {
        if (this.trustedUriEntries[i].uri === item.uri) {
          return i;
        }
      }
    }
    return index;
  }
  selectTrustedUriEntry(item, focus = true) {
    const index = this.getIndexOfTrustedUriEntry(item);
    if (index !== -1) {
      if (focus) {
        this.table.domFocus();
        this.table.setFocus([index]);
      }
      this.table.setSelection([index]);
    }
  }
  get currentWorkspaceUri() {
    return this.workspaceService.getWorkspace().folders[0]?.uri || URI.file("/");
  }
  get trustedUriEntries() {
    const currentWorkspace = this.workspaceService.getWorkspace();
    const currentWorkspaceUris = currentWorkspace.folders.map((folder) => folder.uri);
    if (currentWorkspace.configuration) {
      currentWorkspaceUris.push(currentWorkspace.configuration);
    }
    const entries = this.workspaceTrustManagementService.getTrustedUris().map((uri) => {
      let relatedToCurrentWorkspace = false;
      for (const workspaceUri of currentWorkspaceUris) {
        relatedToCurrentWorkspace = relatedToCurrentWorkspace || this.uriService.extUri.isEqualOrParent(workspaceUri, uri);
      }
      return {
        uri,
        parentOfWorkspaceItem: relatedToCurrentWorkspace
      };
    });
    const sortedEntries = entries.sort((a, b) => {
      if (a.uri.scheme !== b.uri.scheme) {
        if (a.uri.scheme === Schemas.file) {
          return -1;
        }
        if (b.uri.scheme === Schemas.file) {
          return 1;
        }
      }
      const aIsWorkspace = a.uri.path.endsWith(".code-workspace");
      const bIsWorkspace = b.uri.path.endsWith(".code-workspace");
      if (aIsWorkspace !== bIsWorkspace) {
        if (aIsWorkspace) {
          return 1;
        }
        if (bIsWorkspace) {
          return -1;
        }
      }
      return a.uri.fsPath.localeCompare(b.uri.fsPath);
    });
    return sortedEntries;
  }
  layout() {
    this.table.layout(this.trustedUriEntries.length * TrustedUriTableVirtualDelegate.ROW_HEIGHT + TrustedUriTableVirtualDelegate.HEADER_ROW_HEIGHT, void 0);
  }
  updateTable() {
    const entries = this.trustedUriEntries;
    this.container.classList.toggle("empty", entries.length === 0);
    this.descriptionElement.innerText = entries.length ? localize("trustedFoldersDescription", "You trust the following folders, their subfolders, and workspace files.") : localize("noTrustedFoldersDescriptions", "You haven't trusted any folders or workspace files yet.");
    this.table.splice(0, Number.POSITIVE_INFINITY, this.trustedUriEntries);
    this.layout();
  }
  validateUri(path, item) {
    if (!item) {
      return null;
    }
    if (item.uri.scheme === "vscode-vfs") {
      const segments = path.split(posix.sep).filter((s) => s.length);
      if (segments.length === 0 && path.startsWith(posix.sep)) {
        return {
          type: MessageType.WARNING,
          content: localize({ key: "trustAll", comment: ["The {0} will be a host name where repositories are hosted."] }, "You will trust all repositories on {0}.", getHostLabel(this.labelService, item))
        };
      }
      if (segments.length === 1) {
        return {
          type: MessageType.WARNING,
          content: localize({ key: "trustOrg", comment: ["The {0} will be an organization or user name.", "The {1} will be a host name where repositories are hosted."] }, "You will trust all repositories and forks under '{0}' on {1}.", segments[0], getHostLabel(this.labelService, item))
        };
      }
      if (segments.length > 2) {
        return {
          type: MessageType.ERROR,
          content: localize("invalidTrust", "You cannot trust individual folders within a repository.", path)
        };
      }
    }
    return null;
  }
  acceptEdit(item, uri) {
    const trustedFolders = this.workspaceTrustManagementService.getTrustedUris();
    const index = trustedFolders.findIndex((u) => this.uriService.extUri.isEqual(u, item.uri));
    if (index >= trustedFolders.length || index === -1) {
      trustedFolders.push(uri);
    } else {
      trustedFolders[index] = uri;
    }
    this.workspaceTrustManagementService.setTrustedUris(trustedFolders);
    this._onDidAcceptEdit.fire(item);
  }
  rejectEdit(item) {
    this._onDidRejectEdit.fire(item);
  }
  async delete(item) {
    this.table.focusNext();
    await this.workspaceTrustManagementService.setUrisTrust([item.uri], false);
    if (this.table.getFocus().length === 0) {
      this.table.focusLast();
    }
    this._onDelete.fire(item);
    this.table.domFocus();
  }
  async edit(item, usePickerIfPossible) {
    const canUseOpenDialog = item.uri.scheme === Schemas.file || item.uri.scheme === this.currentWorkspaceUri.scheme && this.uriService.extUri.isEqualAuthority(this.currentWorkspaceUri.authority, item.uri.authority) && !isVirtualResource(item.uri);
    if (canUseOpenDialog && usePickerIfPossible) {
      const uri = await this.fileDialogService.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: item.uri,
        openLabel: localize("trustUri", "Trust Folder"),
        title: localize("selectTrustedUri", "Select Folder To Trust")
      });
      if (uri) {
        this.acceptEdit(item, uri[0]);
      } else {
        this.rejectEdit(item);
      }
    } else {
      this.selectTrustedUriEntry(item);
      this._onEdit.fire(item);
    }
  }
};
WorkspaceTrustedUrisTable = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IWorkspaceTrustManagementService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, IFileDialogService)
], WorkspaceTrustedUrisTable);
const _TrustedUriTableVirtualDelegate = class _TrustedUriTableVirtualDelegate {
  constructor() {
    this.headerRowHeight = _TrustedUriTableVirtualDelegate.HEADER_ROW_HEIGHT;
  }
  getHeight(item) {
    return _TrustedUriTableVirtualDelegate.ROW_HEIGHT;
  }
};
_TrustedUriTableVirtualDelegate.HEADER_ROW_HEIGHT = 30;
_TrustedUriTableVirtualDelegate.ROW_HEIGHT = 24;
let TrustedUriTableVirtualDelegate = _TrustedUriTableVirtualDelegate;
let TrustedUriActionsColumnRenderer = class {
  constructor(table, currentWorkspaceUri, uriService) {
    this.table = table;
    this.currentWorkspaceUri = currentWorkspaceUri;
    this.uriService = uriService;
    this.templateId = TrustedUriActionsColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = container.appendChild($(".actions"));
    const actionBar = new ActionBar(element);
    return { actionBar };
  }
  renderElement(item, index, templateData) {
    templateData.actionBar.clear();
    const canUseOpenDialog = item.uri.scheme === Schemas.file || item.uri.scheme === this.currentWorkspaceUri.scheme && this.uriService.extUri.isEqualAuthority(this.currentWorkspaceUri.authority, item.uri.authority) && !isVirtualResource(item.uri);
    const actions = [];
    if (canUseOpenDialog) {
      actions.push(this.createPickerAction(item));
    }
    actions.push(this.createEditAction(item));
    actions.push(this.createDeleteAction(item));
    templateData.actionBar.push(actions, { icon: true });
  }
  createEditAction(item) {
    return {
      label: "",
      class: ThemeIcon.asClassName(editIcon),
      enabled: true,
      id: "editTrustedUri",
      tooltip: localize("editTrustedUri", "Edit Path"),
      run: () => {
        this.table.edit(item, false);
      }
    };
  }
  createPickerAction(item) {
    return {
      label: "",
      class: ThemeIcon.asClassName(folderPickerIcon),
      enabled: true,
      id: "pickerTrustedUri",
      tooltip: localize("pickerTrustedUri", "Open File Picker"),
      run: () => {
        this.table.edit(item, true);
      }
    };
  }
  createDeleteAction(item) {
    return {
      label: "",
      class: ThemeIcon.asClassName(removeIcon),
      enabled: true,
      id: "deleteTrustedUri",
      tooltip: localize("deleteTrustedUri", "Delete Path"),
      run: async () => {
        await this.table.delete(item);
      }
    };
  }
  disposeTemplate(templateData) {
    templateData.actionBar.dispose();
  }
};
TrustedUriActionsColumnRenderer.TEMPLATE_ID = "actions";
TrustedUriActionsColumnRenderer = __decorateClass([
  __decorateParam(2, IUriIdentityService)
], TrustedUriActionsColumnRenderer);
let TrustedUriPathColumnRenderer = class {
  constructor(table, contextViewService) {
    this.table = table;
    this.contextViewService = contextViewService;
    this.templateId = TrustedUriPathColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = container.appendChild($(".path"));
    const pathLabel = element.appendChild($("div.path-label"));
    const pathInput = new InputBox(element, this.contextViewService, {
      validationOptions: {
        validation: (value) => this.table.validateUri(value, this.currentItem)
      },
      inputBoxStyles: defaultInputBoxStyles
    });
    const disposables = new DisposableStore();
    const renderDisposables = disposables.add(new DisposableStore());
    return {
      element,
      pathLabel,
      pathInput,
      disposables,
      renderDisposables
    };
  }
  renderElement(item, index, templateData) {
    templateData.renderDisposables.clear();
    this.currentItem = item;
    templateData.renderDisposables.add(this.table.onEdit(async (e) => {
      if (item === e) {
        templateData.element.classList.add("input-mode");
        templateData.pathInput.focus();
        templateData.pathInput.select();
        templateData.element.parentElement.style.paddingLeft = "0px";
      }
    }));
    templateData.renderDisposables.add(addDisposableListener(templateData.pathInput.element, EventType.DBLCLICK, (e) => {
      EventHelper.stop(e);
    }));
    const hideInputBox = () => {
      templateData.element.classList.remove("input-mode");
      templateData.element.parentElement.style.paddingLeft = "5px";
    };
    const accept = () => {
      hideInputBox();
      const pathToUse = templateData.pathInput.value;
      const uri = hasDriveLetter(pathToUse) ? item.uri.with({ path: posix.sep + toSlashes(pathToUse) }) : item.uri.with({ path: pathToUse });
      templateData.pathLabel.innerText = this.formatPath(uri);
      if (uri) {
        this.table.acceptEdit(item, uri);
      }
    };
    const reject = () => {
      hideInputBox();
      templateData.pathInput.value = stringValue;
      this.table.rejectEdit(item);
    };
    templateData.renderDisposables.add(addStandardDisposableListener(templateData.pathInput.inputElement, EventType.KEY_DOWN, (e) => {
      let handled = false;
      if (e.equals(KeyCode.Enter)) {
        accept();
        handled = true;
      } else if (e.equals(KeyCode.Escape)) {
        reject();
        handled = true;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    }));
    templateData.renderDisposables.add(addDisposableListener(templateData.pathInput.inputElement, EventType.BLUR, () => {
      reject();
    }));
    const stringValue = this.formatPath(item.uri);
    templateData.pathInput.value = stringValue;
    templateData.pathLabel.innerText = stringValue;
    templateData.element.classList.toggle("current-workspace-parent", item.parentOfWorkspaceItem);
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
TrustedUriPathColumnRenderer.TEMPLATE_ID = "path";
TrustedUriPathColumnRenderer = __decorateClass([
  __decorateParam(1, IContextViewService)
], TrustedUriPathColumnRenderer);
function getHostLabel(labelService, item) {
  return item.uri.authority ? labelService.getHostLabel(item.uri.scheme, item.uri.authority) : localize("localAuthority", "Local");
}
let TrustedUriHostColumnRenderer = class {
  constructor(labelService) {
    this.labelService = labelService;
    this.templateId = TrustedUriHostColumnRenderer.TEMPLATE_ID;
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
    templateData.hostContainer.innerText = getHostLabel(this.labelService, item);
    templateData.element.classList.toggle("current-workspace-parent", item.parentOfWorkspaceItem);
    templateData.hostContainer.style.display = "";
    templateData.buttonBarContainer.style.display = "none";
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
TrustedUriHostColumnRenderer.TEMPLATE_ID = "host";
TrustedUriHostColumnRenderer = __decorateClass([
  __decorateParam(0, ILabelService)
], TrustedUriHostColumnRenderer);
let WorkspaceTrustEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, workspaceService, extensionWorkbenchService, extensionManifestPropertiesService, instantiationService, workspaceTrustManagementService, configurationService, extensionEnablementService, productService, keybindingService) {
    super(WorkspaceTrustEditor.ID, group, telemetryService, themeService, storageService);
    this.workspaceService = workspaceService;
    this.extensionWorkbenchService = extensionWorkbenchService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.instantiationService = instantiationService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.configurationService = configurationService;
    this.extensionEnablementService = extensionEnablementService;
    this.productService = productService;
    this.keybindingService = keybindingService;
    this.rendering = false;
    this.rerenderDisposables = this._register(new DisposableStore());
    this.layoutParticipants = [];
  }
  createEditor(parent) {
    this.rootElement = append(parent, $(".workspace-trust-editor", { tabindex: "0" }));
    this.createHeaderElement(this.rootElement);
    const scrollableContent = $(".workspace-trust-editor-body");
    this.bodyScrollBar = this._register(new DomScrollableElement(scrollableContent, {
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Auto
    }));
    append(this.rootElement, this.bodyScrollBar.getDomNode());
    this.createAffectedFeaturesElement(scrollableContent);
    this.createConfigurationElement(scrollableContent);
    this.rootElement.style.setProperty("--workspace-trust-selected-color", asCssVariable(buttonBackground));
    this.rootElement.style.setProperty("--workspace-trust-unselected-color", asCssVariable(buttonSecondaryBackground));
    this.rootElement.style.setProperty("--workspace-trust-check-color", asCssVariable(debugIconStartForeground));
    this.rootElement.style.setProperty("--workspace-trust-x-color", asCssVariable(editorErrorForeground));
    this._register(addDisposableListener(this.rootElement, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.UpArrow) || event.equals(KeyCode.DownArrow)) {
        const navOrder = [this.headerContainer, this.trustedContainer, this.untrustedContainer, this.configurationContainer];
        const currentIndex = navOrder.findIndex((element) => {
          return isAncestorOfActiveElement(element);
        });
        let newIndex = currentIndex;
        if (event.equals(KeyCode.DownArrow)) {
          newIndex++;
        } else if (event.equals(KeyCode.UpArrow)) {
          newIndex = Math.max(0, newIndex);
          newIndex--;
        }
        newIndex += navOrder.length;
        newIndex %= navOrder.length;
        navOrder[newIndex].focus();
      } else if (event.equals(KeyCode.Escape)) {
        this.rootElement.focus();
      } else if (event.equals(KeyMod.CtrlCmd | KeyCode.Enter)) {
        if (this.workspaceTrustManagementService.canSetWorkspaceTrust()) {
          this.workspaceTrustManagementService.setWorkspaceTrust(!this.workspaceTrustManagementService.isWorkspaceTrusted());
        }
      }
    }));
  }
  focus() {
    super.focus();
    this.rootElement.focus();
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    if (token.isCancellationRequested) {
      return;
    }
    await this.workspaceTrustManagementService.workspaceTrustInitialized;
    this.registerListeners();
    await this.render();
  }
  registerListeners() {
    this._register(this.extensionWorkbenchService.onChange(() => this.render()));
    this._register(this.configurationService.onDidChangeRestrictedSettings(() => this.render()));
    this._register(this.workspaceTrustManagementService.onDidChangeTrust(() => this.render()));
    this._register(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => this.render()));
  }
  getHeaderContainerClass(trusted) {
    if (trusted) {
      return "workspace-trust-header workspace-trust-trusted";
    }
    return "workspace-trust-header workspace-trust-untrusted";
  }
  getHeaderTitleText(trusted) {
    if (trusted) {
      if (this.workspaceTrustManagementService.isWorkspaceTrustForced()) {
        return localize("trustedUnsettableWindow", "This window is trusted");
      }
      switch (this.workspaceService.getWorkbenchState()) {
        case WorkbenchState.EMPTY:
          return localize("trustedHeaderWindow", "You trust this window");
        case WorkbenchState.FOLDER:
          return localize("trustedHeaderFolder", "You trust this folder");
        case WorkbenchState.WORKSPACE:
          return localize("trustedHeaderWorkspace", "You trust this workspace");
      }
    }
    return localize("untrustedHeader", "You are in Restricted Mode");
  }
  getHeaderTitleIconClassNames(trusted) {
    return ThemeIcon.asClassNameArray(shieldIcon);
  }
  getFeaturesHeaderText(trusted) {
    let title = "";
    let subTitle = "";
    switch (this.workspaceService.getWorkbenchState()) {
      case WorkbenchState.EMPTY: {
        title = trusted ? localize("trustedWindow", "In a Trusted Window") : localize("untrustedWorkspace", "In Restricted Mode");
        subTitle = trusted ? localize("trustedWindowSubtitle", "You trust the authors of the files in the current window. All features are enabled:") : localize("untrustedWindowSubtitle", "You do not trust the authors of the files in the current window. The following features are disabled:");
        break;
      }
      case WorkbenchState.FOLDER: {
        title = trusted ? localize("trustedFolder", "In a Trusted Folder") : localize("untrustedWorkspace", "In Restricted Mode");
        subTitle = trusted ? localize("trustedFolderSubtitle", "You trust the authors of the files in the current folder. All features are enabled:") : localize("untrustedFolderSubtitle", "You do not trust the authors of the files in the current folder. The following features are disabled:");
        break;
      }
      case WorkbenchState.WORKSPACE: {
        title = trusted ? localize("trustedWorkspace", "In a Trusted Workspace") : localize("untrustedWorkspace", "In Restricted Mode");
        subTitle = trusted ? localize("trustedWorkspaceSubtitle", "You trust the authors of the files in the current workspace. All features are enabled:") : localize("untrustedWorkspaceSubtitle", "You do not trust the authors of the files in the current workspace. The following features are disabled:");
        break;
      }
    }
    return [title, subTitle];
  }
  async render() {
    if (this._store.isDisposed) {
      return;
    }
    if (this.rendering) {
      return;
    }
    this.rendering = true;
    this.rerenderDisposables.clear();
    const isWorkspaceTrusted = this.workspaceTrustManagementService.isWorkspaceTrusted();
    this.rootElement.classList.toggle("trusted", isWorkspaceTrusted);
    this.rootElement.classList.toggle("untrusted", !isWorkspaceTrusted);
    this.headerTitleText.innerText = this.getHeaderTitleText(isWorkspaceTrusted);
    this.headerTitleIcon.className = "workspace-trust-title-icon";
    this.headerTitleIcon.classList.add(...this.getHeaderTitleIconClassNames(isWorkspaceTrusted));
    this.headerDescription.innerText = "";
    const headerDescriptionText = append(this.headerDescription, $("div"));
    headerDescriptionText.innerText = isWorkspaceTrusted ? localize("trustedDescription", "All features are enabled because trust has been granted to the workspace.") : localize("untrustedDescription", "{0} is in a restricted mode intended for safe code browsing.", this.productService.nameShort);
    const headerDescriptionActions = append(this.headerDescription, $("div"));
    const headerDescriptionActionsText = localize({ key: "workspaceTrustEditorHeaderActions", comment: ["Please ensure the markdown link syntax is not broken up with whitespace [text block](link block)"] }, "[Configure your settings]({0}) or [learn more](https://aka.ms/vscode-workspace-trust).", `command:workbench.trust.configure`);
    for (const node of parseLinkedText(headerDescriptionActionsText).nodes) {
      if (typeof node === "string") {
        append(headerDescriptionActions, document.createTextNode(node));
      } else {
        this.rerenderDisposables.add(this.instantiationService.createInstance(Link, headerDescriptionActions, { ...node, tabIndex: -1 }, {}));
      }
    }
    this.headerContainer.className = this.getHeaderContainerClass(isWorkspaceTrusted);
    this.rootElement.setAttribute("aria-label", `${localize("root element label", "Manage Workspace Trust")}:  ${this.headerContainer.innerText}`);
    const restrictedSettings = this.configurationService.restrictedSettings;
    const configurationRegistry = Registry.as(Extensions.Configuration);
    const settingsRequiringTrustedWorkspaceCount = restrictedSettings.default.filter((key) => {
      const property = configurationRegistry.getConfigurationProperties()[key];
      if (property.scope && (APPLICATION_SCOPES.includes(property.scope) || property.scope === ConfigurationScope.MACHINE)) {
        return false;
      }
      if (property.deprecationMessage || property.markdownDeprecationMessage) {
        if (restrictedSettings.workspace?.includes(key)) {
          return true;
        }
        if (restrictedSettings.workspaceFolder) {
          for (const workspaceFolderSettings of restrictedSettings.workspaceFolder.values()) {
            if (workspaceFolderSettings.includes(key)) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    }).length;
    this.renderAffectedFeatures(settingsRequiringTrustedWorkspaceCount, this.getExtensionCount());
    this.workspaceTrustedUrisTable.updateTable();
    this.bodyScrollBar.getDomNode().style.height = `calc(100% - ${this.headerContainer.clientHeight}px)`;
    this.bodyScrollBar.scanDomNode();
    this.rendering = false;
  }
  getExtensionCount() {
    const set = /* @__PURE__ */ new Set();
    const inVirtualWorkspace = isVirtualWorkspace(this.workspaceService.getWorkspace());
    const localExtensions = this.extensionWorkbenchService.local.filter((ext) => ext.local).map((ext) => ext.local);
    for (const extension of localExtensions) {
      const enablementState = this.extensionEnablementService.getEnablementState(extension);
      if (enablementState !== EnablementState.EnabledGlobally && enablementState !== EnablementState.EnabledWorkspace && enablementState !== EnablementState.DisabledByTrustRequirement && enablementState !== EnablementState.DisabledByExtensionDependency) {
        continue;
      }
      if (inVirtualWorkspace && this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(extension.manifest) === false) {
        continue;
      }
      if (this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(extension.manifest) !== true) {
        set.add(extension.identifier.id);
        continue;
      }
      const dependencies = getExtensionDependencies(localExtensions, extension);
      if (dependencies.some((ext) => this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(ext.manifest) === false)) {
        set.add(extension.identifier.id);
      }
    }
    return set.size;
  }
  createHeaderElement(parent) {
    this.headerContainer = append(parent, $(".workspace-trust-header", { tabIndex: "0" }));
    this.headerTitleContainer = append(this.headerContainer, $(".workspace-trust-title"));
    this.headerTitleIcon = append(this.headerTitleContainer, $(".workspace-trust-title-icon"));
    this.headerTitleText = append(this.headerTitleContainer, $(".workspace-trust-title-text"));
    this.headerDescription = append(this.headerContainer, $(".workspace-trust-description"));
  }
  createConfigurationElement(parent) {
    this.configurationContainer = append(parent, $(".workspace-trust-settings", { tabIndex: "0" }));
    const configurationTitle = append(this.configurationContainer, $(".workspace-trusted-folders-title"));
    configurationTitle.innerText = localize("trustedFoldersAndWorkspaces", "Trusted Folders & Workspaces");
    this.workspaceTrustedUrisTable = this._register(this.instantiationService.createInstance(WorkspaceTrustedUrisTable, this.configurationContainer));
  }
  createAffectedFeaturesElement(parent) {
    this.affectedFeaturesContainer = append(parent, $(".workspace-trust-features"));
    this.trustedContainer = append(this.affectedFeaturesContainer, $(".workspace-trust-limitations.trusted", { tabIndex: "0" }));
    this.untrustedContainer = append(this.affectedFeaturesContainer, $(".workspace-trust-limitations.untrusted", { tabIndex: "0" }));
  }
  async renderAffectedFeatures(numSettings, numExtensions) {
    clearNode(this.trustedContainer);
    clearNode(this.untrustedContainer);
    const [trustedTitle, trustedSubTitle] = this.getFeaturesHeaderText(true);
    this.renderLimitationsHeaderElement(this.trustedContainer, trustedTitle, trustedSubTitle);
    const trustedContainerItems = this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY ? [
      localize("trustedTasks", "Tasks are allowed to run"),
      localize("trustedDebugging", "Debugging is enabled"),
      localize("trustedExtensions", "All enabled extensions are activated")
    ] : [
      localize("trustedTasks", "Tasks are allowed to run"),
      localize("trustedDebugging", "Debugging is enabled"),
      localize("trustedSettings", "All workspace settings are applied"),
      localize("trustedExtensions", "All enabled extensions are activated")
    ];
    this.renderLimitationsListElement(this.trustedContainer, trustedContainerItems, ThemeIcon.asClassNameArray(checkListIcon));
    const [untrustedTitle, untrustedSubTitle] = this.getFeaturesHeaderText(false);
    this.renderLimitationsHeaderElement(this.untrustedContainer, untrustedTitle, untrustedSubTitle);
    const untrustedContainerItems = this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY ? [
      localize("untrustedTasks", "Tasks are not allowed to run"),
      localize("untrustedDebugging", "Debugging is disabled"),
      fixBadLocalizedLinks(localize({ key: "untrustedExtensions", comment: ["Please ensure the markdown link syntax is not broken up with whitespace [text block](link block)"] }, "[{0} extensions]({1}) are disabled or have limited functionality", numExtensions, `command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`))
    ] : [
      localize("untrustedTasks", "Tasks are not allowed to run"),
      localize("untrustedDebugging", "Debugging is disabled"),
      fixBadLocalizedLinks(numSettings ? localize({ key: "untrustedSettings", comment: ["Please ensure the markdown link syntax is not broken up with whitespace [text block](link block)"] }, "[{0} workspace settings]({1}) are not applied", numSettings, "command:settings.filterUntrusted") : localize("no untrustedSettings", "Workspace settings requiring trust are not applied")),
      fixBadLocalizedLinks(localize({ key: "untrustedExtensions", comment: ["Please ensure the markdown link syntax is not broken up with whitespace [text block](link block)"] }, "[{0} extensions]({1}) are disabled or have limited functionality", numExtensions, `command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`))
    ];
    this.renderLimitationsListElement(this.untrustedContainer, untrustedContainerItems, ThemeIcon.asClassNameArray(xListIcon));
    if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      if (this.workspaceTrustManagementService.canSetWorkspaceTrust()) {
        this.addDontTrustButtonToElement(this.untrustedContainer);
      } else {
        this.addTrustedTextToElement(this.untrustedContainer);
      }
    } else {
      if (this.workspaceTrustManagementService.canSetWorkspaceTrust()) {
        this.addTrustButtonToElement(this.trustedContainer);
      }
    }
  }
  createButtonRow(parent, buttonInfo, enabled) {
    const buttonRow = append(parent, $(".workspace-trust-buttons-row"));
    const buttonContainer = append(buttonRow, $(".workspace-trust-buttons"));
    const buttonBar = this.rerenderDisposables.add(new ButtonBar(buttonContainer));
    for (const { action, keybinding } of buttonInfo) {
      const button = buttonBar.addButtonWithDescription(defaultButtonStyles);
      button.label = action.label;
      button.enabled = enabled !== void 0 ? enabled : action.enabled;
      button.description = keybinding.getLabel();
      button.element.ariaLabel = action.label + ", " + localize("keyboardShortcut", "Keyboard Shortcut: {0}", keybinding.getAriaLabel());
      this.rerenderDisposables.add(button.onDidClick((e) => {
        if (e) {
          EventHelper.stop(e, true);
        }
        action.run();
      }));
    }
  }
  addTrustButtonToElement(parent) {
    const trustAction = this.rerenderDisposables.add(new Action("workspace.trust.button.action.grant", localize("trustButton", "Trust"), void 0, true, async () => {
      await this.workspaceTrustManagementService.setWorkspaceTrust(true);
    }));
    const trustActions = [{ action: trustAction, keybinding: this.keybindingService.resolveUserBinding(isMacintosh ? "Cmd+Enter" : "Ctrl+Enter")[0] }];
    this.createButtonRow(parent, trustActions);
  }
  addDontTrustButtonToElement(parent) {
    this.createButtonRow(parent, [{
      action: this.rerenderDisposables.add(new Action("workspace.trust.button.action.deny", localize("dontTrustButton", "Don't Trust"), void 0, true, async () => {
        await this.workspaceTrustManagementService.setWorkspaceTrust(false);
      })),
      keybinding: this.keybindingService.resolveUserBinding(isMacintosh ? "Cmd+Enter" : "Ctrl+Enter")[0]
    }]);
  }
  addTrustedTextToElement(parent) {
    if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
      return;
    }
    const textElement = append(parent, $(".workspace-trust-untrusted-description"));
    if (!this.workspaceTrustManagementService.isWorkspaceTrustForced()) {
      textElement.innerText = this.workspaceService.getWorkbenchState() === WorkbenchState.WORKSPACE ? localize("untrustedWorkspaceReason", "This workspace is trusted via the bolded entries in the trusted folders below.") : localize("untrustedFolderReason", "This folder is trusted via the bolded entries in the trusted folders below.");
    } else {
      textElement.innerText = localize("trustedForcedReason", "This window is trusted by nature of the workspace that is opened.");
    }
  }
  renderLimitationsHeaderElement(parent, headerText, subtitleText) {
    const limitationsHeaderContainer = append(parent, $(".workspace-trust-limitations-header"));
    const titleElement = append(limitationsHeaderContainer, $(".workspace-trust-limitations-title"));
    const textElement = append(titleElement, $(".workspace-trust-limitations-title-text"));
    const subtitleElement = append(limitationsHeaderContainer, $(".workspace-trust-limitations-subtitle"));
    textElement.innerText = headerText;
    subtitleElement.innerText = subtitleText;
  }
  renderLimitationsListElement(parent, limitations, iconClassNames) {
    const listContainer = append(parent, $(".workspace-trust-limitations-list-container"));
    const limitationsList = append(listContainer, $("ul"));
    for (const limitation of limitations) {
      const limitationListItem = append(limitationsList, $("li"));
      const icon = append(limitationListItem, $(".list-item-icon"));
      const text = append(limitationListItem, $(".list-item-text"));
      icon.classList.add(...iconClassNames);
      const linkedText = parseLinkedText(limitation);
      for (const node of linkedText.nodes) {
        if (typeof node === "string") {
          append(text, document.createTextNode(node));
        } else {
          this.rerenderDisposables.add(this.instantiationService.createInstance(Link, text, { ...node, tabIndex: -1 }, {}));
        }
      }
    }
  }
  layout(dimension) {
    if (!this.isVisible()) {
      return;
    }
    this.workspaceTrustedUrisTable.layout();
    this.layoutParticipants.forEach((participant) => {
      participant.layout();
    });
    this.bodyScrollBar.scanDomNode();
  }
};
WorkspaceTrustEditor.ID = "workbench.editor.workspaceTrust";
__decorateClass([
  debounce(100)
], WorkspaceTrustEditor.prototype, "render", 1);
WorkspaceTrustEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, IExtensionsWorkbenchService),
  __decorateParam(6, IExtensionManifestPropertiesService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IWorkspaceTrustManagementService),
  __decorateParam(9, IWorkbenchConfigurationService),
  __decorateParam(10, IWorkbenchExtensionEnablementService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IKeybindingService)
], WorkspaceTrustEditor);
function fixBadLocalizedLinks(badString) {
  const regex = /(.*)\[(.+)\]\s*\((.+)\)(.*)/;
  return badString.replace(regex, "$1[$2]($3)$4");
}
export {
  WorkspaceTrustEditor,
  shieldIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dvcmtzcGFjZS9icm93c2VyL3dvcmtzcGFjZVRydXN0RWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lciwgYXBwZW5kLCBjbGVhck5vZGUsIERpbWVuc2lvbiwgRXZlbnRIZWxwZXIsIEV2ZW50VHlwZSwgaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgQnV0dG9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgSU1lc3NhZ2UsIElucHV0Qm94LCBNZXNzYWdlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgSVRhYmxlUmVuZGVyZXIsIElUYWJsZVZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90YWJsZS90YWJsZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBkZWJvdW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVEcml2ZUxldHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcGFyc2VMaW5rZWRUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkVGV4dC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExpbmsgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvYnJvd3Nlci9saW5rLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGlzVmlydHVhbFJlc291cmNlLCBpc1ZpcnR1YWxXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3ZpcnR1YWxXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUsIGJ1dHRvbkJhY2tncm91bmQsIGJ1dHRvblNlY29uZGFyeUJhY2tncm91bmQsIGVkaXRvckVycm9yRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcGVuQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgZGVidWdJY29uU3RhcnRGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vZGVidWcvYnJvd3Nlci9kZWJ1Z0NvbG9ycy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIExJU1RfV09SS1NQQUNFX1VOU1VQUE9SVEVEX0VYVEVOU0lPTlNfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQVBQTElDQVRJT05fU0NPUEVTLCBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZVRydXN0RWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3Jrc3BhY2VzL2Jyb3dzZXIvd29ya3NwYWNlVHJ1c3RFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGdldEV4dGVuc2lvbkRlcGVuZGVuY2llcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IEVuYWJsZW1lbnRTdGF0ZSwgSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBwb3NpeCwgd2luMzIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGhhc0RyaXZlTGV0dGVyLCB0b1NsYXNoZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcywgZGVmYXVsdElucHV0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3Qgc2hpZWxkSWNvbiA9IHJlZ2lzdGVySWNvbignd29ya3NwYWNlLXRydXN0LWJhbm5lcicsIENvZGljb24uc2hpZWxkLCBsb2NhbGl6ZSgnc2hpZWxkSWNvbicsICdJY29uIGZvciB3b3Jrc3BhY2UgdHJ1c3QgaW9uIHRoZSBiYW5uZXIuJykpO1xuXG5jb25zdCBjaGVja0xpc3RJY29uID0gcmVnaXN0ZXJJY29uKCd3b3Jrc3BhY2UtdHJ1c3QtZWRpdG9yLWNoZWNrJywgQ29kaWNvbi5jaGVjaywgbG9jYWxpemUoJ2NoZWNrTGlzdEljb24nLCAnSWNvbiBmb3IgdGhlIGNoZWNrbWFyayBpbiB0aGUgd29ya3NwYWNlIHRydXN0IGVkaXRvci4nKSk7XG5jb25zdCB4TGlzdEljb24gPSByZWdpc3Rlckljb24oJ3dvcmtzcGFjZS10cnVzdC1lZGl0b3ItY3Jvc3MnLCBDb2RpY29uLngsIGxvY2FsaXplKCd4TGlzdEljb24nLCAnSWNvbiBmb3IgdGhlIGNyb3NzIGluIHRoZSB3b3Jrc3BhY2UgdHJ1c3QgZWRpdG9yLicpKTtcbmNvbnN0IGZvbGRlclBpY2tlckljb24gPSByZWdpc3Rlckljb24oJ3dvcmtzcGFjZS10cnVzdC1lZGl0b3ItZm9sZGVyLXBpY2tlcicsIENvZGljb24uZm9sZGVyLCBsb2NhbGl6ZSgnZm9sZGVyUGlja2VySWNvbicsICdJY29uIGZvciB0aGUgcGljayBmb2xkZXIgaWNvbiBpbiB0aGUgd29ya3NwYWNlIHRydXN0IGVkaXRvci4nKSk7XG5jb25zdCBlZGl0SWNvbiA9IHJlZ2lzdGVySWNvbignd29ya3NwYWNlLXRydXN0LWVkaXRvci1lZGl0LWZvbGRlcicsIENvZGljb24uZWRpdCwgbG9jYWxpemUoJ2VkaXRJY29uJywgJ0ljb24gZm9yIHRoZSBlZGl0IGZvbGRlciBpY29uIGluIHRoZSB3b3Jrc3BhY2UgdHJ1c3QgZWRpdG9yLicpKTtcbmNvbnN0IHJlbW92ZUljb24gPSByZWdpc3Rlckljb24oJ3dvcmtzcGFjZS10cnVzdC1lZGl0b3ItcmVtb3ZlLWZvbGRlcicsIENvZGljb24uY2xvc2UsIGxvY2FsaXplKCdyZW1vdmVJY29uJywgJ0ljb24gZm9yIHRoZSByZW1vdmUgZm9sZGVyIGljb24gaW4gdGhlIHdvcmtzcGFjZSB0cnVzdCBlZGl0b3IuJykpO1xuXG5pbnRlcmZhY2UgSVRydXN0ZWRVcmlJdGVtIHtcblx0cGFyZW50T2ZXb3Jrc3BhY2VJdGVtOiBib29sZWFuO1xuXHR1cmk6IFVSSTtcbn1cblxuY2xhc3MgV29ya3NwYWNlVHJ1c3RlZFVyaXNUYWJsZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFjY2VwdEVkaXQ6IEVtaXR0ZXI8SVRydXN0ZWRVcmlJdGVtPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUcnVzdGVkVXJpSXRlbT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWNjZXB0RWRpdDogRXZlbnQ8SVRydXN0ZWRVcmlJdGVtPiA9IHRoaXMuX29uRGlkQWNjZXB0RWRpdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlamVjdEVkaXQ6IEVtaXR0ZXI8SVRydXN0ZWRVcmlJdGVtPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUcnVzdGVkVXJpSXRlbT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVqZWN0RWRpdDogRXZlbnQ8SVRydXN0ZWRVcmlJdGVtPiA9IHRoaXMuX29uRGlkUmVqZWN0RWRpdC5ldmVudDtcblxuXHRwcml2YXRlIF9vbkVkaXQ6IEVtaXR0ZXI8SVRydXN0ZWRVcmlJdGVtPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUcnVzdGVkVXJpSXRlbT4oKSk7XG5cdHJlYWRvbmx5IG9uRWRpdDogRXZlbnQ8SVRydXN0ZWRVcmlJdGVtPiA9IHRoaXMuX29uRWRpdC5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRlbGV0ZTogRW1pdHRlcjxJVHJ1c3RlZFVyaUl0ZW0+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRydXN0ZWRVcmlJdGVtPigpKTtcblx0cmVhZG9ubHkgb25EZWxldGU6IEV2ZW50PElUcnVzdGVkVXJpSXRlbT4gPSB0aGlzLl9vbkRlbGV0ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHRhYmxlOiBXb3JrYmVuY2hUYWJsZTxJVHJ1c3RlZFVyaUl0ZW0+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGVzY3JpcHRpb25FbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZGVzY3JpcHRpb25FbGVtZW50ID0gY29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy53b3Jrc3BhY2UtdHJ1c3RlZC1mb2xkZXJzLWRlc2NyaXB0aW9uJykpO1xuXHRcdGNvbnN0IHRhYmxlRWxlbWVudCA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCcudHJ1c3RlZC11cmlzLXRhYmxlJykpO1xuXHRcdGNvbnN0IGFkZEJ1dHRvbkJhckVsZW1lbnQgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnLnRydXN0ZWQtdXJpcy1idXR0b24tYmFyJykpO1xuXG5cdFx0dGhpcy50YWJsZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hUYWJsZSxcblx0XHRcdCdXb3Jrc3BhY2VUcnVzdCcsXG5cdFx0XHR0YWJsZUVsZW1lbnQsXG5cdFx0XHRuZXcgVHJ1c3RlZFVyaVRhYmxlVmlydHVhbERlbGVnYXRlKCksXG5cdFx0XHRbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2hvc3RDb2x1bW5MYWJlbCcsIFwiSG9zdFwiKSxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDEsXG5cdFx0XHRcdFx0dGVtcGxhdGVJZDogVHJ1c3RlZFVyaUhvc3RDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRCxcblx0XHRcdFx0XHRwcm9qZWN0KHJvdzogSVRydXN0ZWRVcmlJdGVtKTogSVRydXN0ZWRVcmlJdGVtIHsgcmV0dXJuIHJvdzsgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwYXRoQ29sdW1uTGFiZWwnLCBcIlBhdGhcIiksXG5cdFx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdFx0d2VpZ2h0OiA4LFxuXHRcdFx0XHRcdHRlbXBsYXRlSWQ6IFRydXN0ZWRVcmlQYXRoQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0cHJvamVjdChyb3c6IElUcnVzdGVkVXJpSXRlbSk6IElUcnVzdGVkVXJpSXRlbSB7IHJldHVybiByb3c7IH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiAnJyxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDEsXG5cdFx0XHRcdFx0bWluaW11bVdpZHRoOiA3NSxcblx0XHRcdFx0XHRtYXhpbXVtV2lkdGg6IDc1LFxuXHRcdFx0XHRcdHRlbXBsYXRlSWQ6IFRydXN0ZWRVcmlBY3Rpb25zQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0cHJvamVjdChyb3c6IElUcnVzdGVkVXJpSXRlbSk6IElUcnVzdGVkVXJpSXRlbSB7IHJldHVybiByb3c7IH1cblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJ1c3RlZFVyaUhvc3RDb2x1bW5SZW5kZXJlciksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJ1c3RlZFVyaVBhdGhDb2x1bW5SZW5kZXJlciwgdGhpcyksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJ1c3RlZFVyaUFjdGlvbnNDb2x1bW5SZW5kZXJlciwgdGhpcywgdGhpcy5jdXJyZW50V29ya3NwYWNlVXJpKSxcblx0XHRcdF0sXG5cdFx0XHR7XG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2UsXG5cdFx0XHRcdG9wZW5PblNpbmdsZUNsaWNrOiBmYWxzZSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0QXJpYUxhYmVsOiAoaXRlbTogSVRydXN0ZWRVcmlJdGVtKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBob3N0TGFiZWwgPSBnZXRIb3N0TGFiZWwodGhpcy5sYWJlbFNlcnZpY2UsIGl0ZW0pO1xuXHRcdFx0XHRcdFx0aWYgKGhvc3RMYWJlbCA9PT0gdW5kZWZpbmVkIHx8IGhvc3RMYWJlbC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0cnVzdGVkRm9sZGVyQXJpYUxhYmVsJywgXCJ7MH0sIHRydXN0ZWRcIiwgdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoaXRlbS51cmkpKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0cnVzdGVkRm9sZGVyV2l0aEhvc3RBcmlhTGFiZWwnLCBcInswfSBvbiB7MX0sIHRydXN0ZWRcIiwgdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoaXRlbS51cmkpLCBob3N0TGFiZWwpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsOiAoKSA9PiBsb2NhbGl6ZSgndHJ1c3RlZEZvbGRlcnNBbmRXb3Jrc3BhY2VzJywgXCJUcnVzdGVkIEZvbGRlcnMgJiBXb3Jrc3BhY2VzXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZChlbGVtZW50OiBJVHJ1c3RlZFVyaUl0ZW0pIHtcblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LnVyaS50b1N0cmluZygpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpIGFzIFdvcmtiZW5jaFRhYmxlPElUcnVzdGVkVXJpSXRlbT47XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRhYmxlLm9uRGlkT3BlbihpdGVtID0+IHtcblx0XHRcdC8vIGRlZmF1bHQgcHJldmVudGVkIHdoZW4gaW5wdXQgYm94IGlzIGRvdWJsZSBjbGlja2VkICMxMjUwNTJcblx0XHRcdGlmIChpdGVtICYmIGl0ZW0uZWxlbWVudCAmJiAhaXRlbS5icm93c2VyRXZlbnQ/LmRlZmF1bHRQcmV2ZW50ZWQpIHtcblx0XHRcdFx0dGhpcy5lZGl0KGl0ZW0uZWxlbWVudCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYnV0dG9uQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbkJhcihhZGRCdXR0b25CYXJFbGVtZW50KSk7XG5cdFx0Y29uc3QgYWRkQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIoYnV0dG9uQmFyLmFkZEJ1dHRvbih7IHRpdGxlOiBsb2NhbGl6ZSgnYWRkQnV0dG9uJywgXCJBZGQgRm9sZGVyXCIpLCAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzIH0pKTtcblx0XHRhZGRCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnYWRkQnV0dG9uJywgXCJBZGQgRm9sZGVyXCIpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkQnV0dG9uLm9uRGlkQ2xpY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRcdGNhblNlbGVjdEZpbGVzOiBmYWxzZSxcblx0XHRcdFx0Y2FuU2VsZWN0Rm9sZGVyczogdHJ1ZSxcblx0XHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0XHRcdGRlZmF1bHRVcmk6IHRoaXMuY3VycmVudFdvcmtzcGFjZVVyaSxcblx0XHRcdFx0b3BlbkxhYmVsOiBsb2NhbGl6ZSgndHJ1c3RVcmknLCBcIlRydXN0IEZvbGRlclwiKSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzZWxlY3RUcnVzdGVkVXJpJywgXCJTZWxlY3QgRm9sZGVyIFRvIFRydXN0XCIpXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHVyaSkge1xuXHRcdFx0XHR0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uuc2V0VXJpc1RydXN0KHVyaSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3RlZEZvbGRlcnMoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVUYWJsZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SW5kZXhPZlRydXN0ZWRVcmlFbnRyeShpdGVtOiBJVHJ1c3RlZFVyaUl0ZW0pOiBudW1iZXIge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy50cnVzdGVkVXJpRW50cmllcy5pbmRleE9mKGl0ZW0pO1xuXHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy50cnVzdGVkVXJpRW50cmllcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAodGhpcy50cnVzdGVkVXJpRW50cmllc1tpXS51cmkgPT09IGl0ZW0udXJpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gaW5kZXg7XG5cdH1cblxuXHRwcml2YXRlIHNlbGVjdFRydXN0ZWRVcmlFbnRyeShpdGVtOiBJVHJ1c3RlZFVyaUl0ZW0sIGZvY3VzOiBib29sZWFuID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXRJbmRleE9mVHJ1c3RlZFVyaUVudHJ5KGl0ZW0pO1xuXHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdGlmIChmb2N1cykge1xuXHRcdFx0XHR0aGlzLnRhYmxlLmRvbUZvY3VzKCk7XG5cdFx0XHRcdHRoaXMudGFibGUuc2V0Rm9jdXMoW2luZGV4XSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRhYmxlLnNldFNlbGVjdGlvbihbaW5kZXhdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldCBjdXJyZW50V29ya3NwYWNlVXJpKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdPy51cmkgfHwgVVJJLmZpbGUoJy8nKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IHRydXN0ZWRVcmlFbnRyaWVzKCk6IElUcnVzdGVkVXJpSXRlbVtdIHtcblx0XHRjb25zdCBjdXJyZW50V29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdGNvbnN0IGN1cnJlbnRXb3Jrc3BhY2VVcmlzID0gY3VycmVudFdvcmtzcGFjZS5mb2xkZXJzLm1hcChmb2xkZXIgPT4gZm9sZGVyLnVyaSk7XG5cdFx0aWYgKGN1cnJlbnRXb3Jrc3BhY2UuY29uZmlndXJhdGlvbikge1xuXHRcdFx0Y3VycmVudFdvcmtzcGFjZVVyaXMucHVzaChjdXJyZW50V29ya3NwYWNlLmNvbmZpZ3VyYXRpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJpZXMgPSB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuZ2V0VHJ1c3RlZFVyaXMoKS5tYXAodXJpID0+IHtcblxuXHRcdFx0bGV0IHJlbGF0ZWRUb0N1cnJlbnRXb3Jrc3BhY2UgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3Qgd29ya3NwYWNlVXJpIG9mIGN1cnJlbnRXb3Jrc3BhY2VVcmlzKSB7XG5cdFx0XHRcdHJlbGF0ZWRUb0N1cnJlbnRXb3Jrc3BhY2UgPSByZWxhdGVkVG9DdXJyZW50V29ya3NwYWNlIHx8IHRoaXMudXJpU2VydmljZS5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHdvcmtzcGFjZVVyaSwgdXJpKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRwYXJlbnRPZldvcmtzcGFjZUl0ZW06IHJlbGF0ZWRUb0N1cnJlbnRXb3Jrc3BhY2Vcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHQvLyBTb3J0IGVudHJpZXNcblx0XHRjb25zdCBzb3J0ZWRFbnRyaWVzID0gZW50cmllcy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAoYS51cmkuc2NoZW1lICE9PSBiLnVyaS5zY2hlbWUpIHtcblx0XHRcdFx0aWYgKGEudXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGIudXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYUlzV29ya3NwYWNlID0gYS51cmkucGF0aC5lbmRzV2l0aCgnLmNvZGUtd29ya3NwYWNlJyk7XG5cdFx0XHRjb25zdCBiSXNXb3Jrc3BhY2UgPSBiLnVyaS5wYXRoLmVuZHNXaXRoKCcuY29kZS13b3Jrc3BhY2UnKTtcblxuXHRcdFx0aWYgKGFJc1dvcmtzcGFjZSAhPT0gYklzV29ya3NwYWNlKSB7XG5cdFx0XHRcdGlmIChhSXNXb3Jrc3BhY2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChiSXNXb3Jrc3BhY2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGEudXJpLmZzUGF0aC5sb2NhbGVDb21wYXJlKGIudXJpLmZzUGF0aCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gc29ydGVkRW50cmllcztcblx0fVxuXG5cdGxheW91dCgpOiB2b2lkIHtcblx0XHR0aGlzLnRhYmxlLmxheW91dCgodGhpcy50cnVzdGVkVXJpRW50cmllcy5sZW5ndGggKiBUcnVzdGVkVXJpVGFibGVWaXJ0dWFsRGVsZWdhdGUuUk9XX0hFSUdIVCkgKyBUcnVzdGVkVXJpVGFibGVWaXJ0dWFsRGVsZWdhdGUuSEVBREVSX1JPV19IRUlHSFQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHR1cGRhdGVUYWJsZSgpOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyaWVzID0gdGhpcy50cnVzdGVkVXJpRW50cmllcztcblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdlbXB0eScsIGVudHJpZXMubGVuZ3RoID09PSAwKTtcblxuXHRcdHRoaXMuZGVzY3JpcHRpb25FbGVtZW50LmlubmVyVGV4dCA9IGVudHJpZXMubGVuZ3RoID9cblx0XHRcdGxvY2FsaXplKCd0cnVzdGVkRm9sZGVyc0Rlc2NyaXB0aW9uJywgXCJZb3UgdHJ1c3QgdGhlIGZvbGxvd2luZyBmb2xkZXJzLCB0aGVpciBzdWJmb2xkZXJzLCBhbmQgd29ya3NwYWNlIGZpbGVzLlwiKSA6XG5cdFx0XHRsb2NhbGl6ZSgnbm9UcnVzdGVkRm9sZGVyc0Rlc2NyaXB0aW9ucycsIFwiWW91IGhhdmVuJ3QgdHJ1c3RlZCBhbnkgZm9sZGVycyBvciB3b3Jrc3BhY2UgZmlsZXMgeWV0LlwiKTtcblxuXHRcdHRoaXMudGFibGUuc3BsaWNlKDAsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgdGhpcy50cnVzdGVkVXJpRW50cmllcyk7XG5cdFx0dGhpcy5sYXlvdXQoKTtcblx0fVxuXG5cdHZhbGlkYXRlVXJpKHBhdGg6IHN0cmluZywgaXRlbT86IElUcnVzdGVkVXJpSXRlbSk6IElNZXNzYWdlIHwgbnVsbCB7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoaXRlbS51cmkuc2NoZW1lID09PSAndnNjb2RlLXZmcycpIHtcblx0XHRcdGNvbnN0IHNlZ21lbnRzID0gcGF0aC5zcGxpdChwb3NpeC5zZXApLmZpbHRlcihzID0+IHMubGVuZ3RoKTtcblx0XHRcdGlmIChzZWdtZW50cy5sZW5ndGggPT09IDAgJiYgcGF0aC5zdGFydHNXaXRoKHBvc2l4LnNlcCkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlVHlwZS5XQVJOSU5HLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplKHsga2V5OiAndHJ1c3RBbGwnLCBjb21tZW50OiBbJ1RoZSB7MH0gd2lsbCBiZSBhIGhvc3QgbmFtZSB3aGVyZSByZXBvc2l0b3JpZXMgYXJlIGhvc3RlZC4nXSB9LCBcIllvdSB3aWxsIHRydXN0IGFsbCByZXBvc2l0b3JpZXMgb24gezB9LlwiLCBnZXRIb3N0TGFiZWwodGhpcy5sYWJlbFNlcnZpY2UsIGl0ZW0pKVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2VnbWVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogTWVzc2FnZVR5cGUuV0FSTklORyxcblx0XHRcdFx0XHRjb250ZW50OiBsb2NhbGl6ZSh7IGtleTogJ3RydXN0T3JnJywgY29tbWVudDogWydUaGUgezB9IHdpbGwgYmUgYW4gb3JnYW5pemF0aW9uIG9yIHVzZXIgbmFtZS4nLCAnVGhlIHsxfSB3aWxsIGJlIGEgaG9zdCBuYW1lIHdoZXJlIHJlcG9zaXRvcmllcyBhcmUgaG9zdGVkLiddIH0sIFwiWW91IHdpbGwgdHJ1c3QgYWxsIHJlcG9zaXRvcmllcyBhbmQgZm9ya3MgdW5kZXIgJ3swfScgb24gezF9LlwiLCBzZWdtZW50c1swXSwgZ2V0SG9zdExhYmVsKHRoaXMubGFiZWxTZXJ2aWNlLCBpdGVtKSlcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNlZ21lbnRzLmxlbmd0aCA+IDIpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlVHlwZS5FUlJPUixcblx0XHRcdFx0XHRjb250ZW50OiBsb2NhbGl6ZSgnaW52YWxpZFRydXN0JywgXCJZb3UgY2Fubm90IHRydXN0IGluZGl2aWR1YWwgZm9sZGVycyB3aXRoaW4gYSByZXBvc2l0b3J5LlwiLCBwYXRoKVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0YWNjZXB0RWRpdChpdGVtOiBJVHJ1c3RlZFVyaUl0ZW0sIHVyaTogVVJJKSB7XG5cdFx0Y29uc3QgdHJ1c3RlZEZvbGRlcnMgPSB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuZ2V0VHJ1c3RlZFVyaXMoKTtcblx0XHRjb25zdCBpbmRleCA9IHRydXN0ZWRGb2xkZXJzLmZpbmRJbmRleCh1ID0+IHRoaXMudXJpU2VydmljZS5leHRVcmkuaXNFcXVhbCh1LCBpdGVtLnVyaSkpO1xuXG5cdFx0aWYgKGluZGV4ID49IHRydXN0ZWRGb2xkZXJzLmxlbmd0aCB8fCBpbmRleCA9PT0gLTEpIHtcblx0XHRcdHRydXN0ZWRGb2xkZXJzLnB1c2godXJpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dHJ1c3RlZEZvbGRlcnNbaW5kZXhdID0gdXJpO1xuXHRcdH1cblxuXHRcdHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5zZXRUcnVzdGVkVXJpcyh0cnVzdGVkRm9sZGVycyk7XG5cdFx0dGhpcy5fb25EaWRBY2NlcHRFZGl0LmZpcmUoaXRlbSk7XG5cdH1cblxuXHRyZWplY3RFZGl0KGl0ZW06IElUcnVzdGVkVXJpSXRlbSkge1xuXHRcdHRoaXMuX29uRGlkUmVqZWN0RWRpdC5maXJlKGl0ZW0pO1xuXHR9XG5cblx0YXN5bmMgZGVsZXRlKGl0ZW06IElUcnVzdGVkVXJpSXRlbSkge1xuXHRcdHRoaXMudGFibGUuZm9jdXNOZXh0KCk7XG5cdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLnNldFVyaXNUcnVzdChbaXRlbS51cmldLCBmYWxzZSk7XG5cblx0XHRpZiAodGhpcy50YWJsZS5nZXRGb2N1cygpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy50YWJsZS5mb2N1c0xhc3QoKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EZWxldGUuZmlyZShpdGVtKTtcblx0XHR0aGlzLnRhYmxlLmRvbUZvY3VzKCk7XG5cdH1cblxuXHRhc3luYyBlZGl0KGl0ZW06IElUcnVzdGVkVXJpSXRlbSwgdXNlUGlja2VySWZQb3NzaWJsZT86IGJvb2xlYW4pIHtcblx0XHRjb25zdCBjYW5Vc2VPcGVuRGlhbG9nID0gaXRlbS51cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgfHxcblx0XHRcdChcblx0XHRcdFx0aXRlbS51cmkuc2NoZW1lID09PSB0aGlzLmN1cnJlbnRXb3Jrc3BhY2VVcmkuc2NoZW1lICYmXG5cdFx0XHRcdHRoaXMudXJpU2VydmljZS5leHRVcmkuaXNFcXVhbEF1dGhvcml0eSh0aGlzLmN1cnJlbnRXb3Jrc3BhY2VVcmkuYXV0aG9yaXR5LCBpdGVtLnVyaS5hdXRob3JpdHkpICYmXG5cdFx0XHRcdCFpc1ZpcnR1YWxSZXNvdXJjZShpdGVtLnVyaSlcblx0XHRcdCk7XG5cdFx0aWYgKGNhblVzZU9wZW5EaWFsb2cgJiYgdXNlUGlja2VySWZQb3NzaWJsZSkge1xuXHRcdFx0Y29uc3QgdXJpID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRcdGNhblNlbGVjdEZpbGVzOiBmYWxzZSxcblx0XHRcdFx0Y2FuU2VsZWN0Rm9sZGVyczogdHJ1ZSxcblx0XHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0XHRcdGRlZmF1bHRVcmk6IGl0ZW0udXJpLFxuXHRcdFx0XHRvcGVuTGFiZWw6IGxvY2FsaXplKCd0cnVzdFVyaScsIFwiVHJ1c3QgRm9sZGVyXCIpLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NlbGVjdFRydXN0ZWRVcmknLCBcIlNlbGVjdCBGb2xkZXIgVG8gVHJ1c3RcIilcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAodXJpKSB7XG5cdFx0XHRcdHRoaXMuYWNjZXB0RWRpdChpdGVtLCB1cmlbMF0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5yZWplY3RFZGl0KGl0ZW0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNlbGVjdFRydXN0ZWRVcmlFbnRyeShpdGVtKTtcblx0XHRcdHRoaXMuX29uRWRpdC5maXJlKGl0ZW0pO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBUcnVzdGVkVXJpVGFibGVWaXJ0dWFsRGVsZWdhdGUgaW1wbGVtZW50cyBJVGFibGVWaXJ0dWFsRGVsZWdhdGU8SVRydXN0ZWRVcmlJdGVtPiB7XG5cdHN0YXRpYyByZWFkb25seSBIRUFERVJfUk9XX0hFSUdIVCA9IDMwO1xuXHRzdGF0aWMgcmVhZG9ubHkgUk9XX0hFSUdIVCA9IDI0O1xuXHRyZWFkb25seSBoZWFkZXJSb3dIZWlnaHQgPSBUcnVzdGVkVXJpVGFibGVWaXJ0dWFsRGVsZWdhdGUuSEVBREVSX1JPV19IRUlHSFQ7XG5cdGdldEhlaWdodChpdGVtOiBJVHJ1c3RlZFVyaUl0ZW0pIHtcblx0XHRyZXR1cm4gVHJ1c3RlZFVyaVRhYmxlVmlydHVhbERlbGVnYXRlLlJPV19IRUlHSFQ7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBBY3Rpb25CYXI7XG59XG5cbmNsYXNzIFRydXN0ZWRVcmlBY3Rpb25zQ29sdW1uUmVuZGVyZXIgaW1wbGVtZW50cyBJVGFibGVSZW5kZXJlcjxJVHJ1c3RlZFVyaUl0ZW0sIElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2FjdGlvbnMnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IFRydXN0ZWRVcmlBY3Rpb25zQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0YWJsZTogV29ya3NwYWNlVHJ1c3RlZFVyaXNUYWJsZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGN1cnJlbnRXb3Jrc3BhY2VVcmk6IFVSSSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJQWN0aW9uc0NvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCcuYWN0aW9ucycpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBuZXcgQWN0aW9uQmFyKGVsZW1lbnQpO1xuXHRcdHJldHVybiB7IGFjdGlvbkJhciB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChpdGVtOiBJVHJ1c3RlZFVyaUl0ZW0sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cblx0XHRjb25zdCBjYW5Vc2VPcGVuRGlhbG9nID0gaXRlbS51cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgfHxcblx0XHRcdChcblx0XHRcdFx0aXRlbS51cmkuc2NoZW1lID09PSB0aGlzLmN1cnJlbnRXb3Jrc3BhY2VVcmkuc2NoZW1lICYmXG5cdFx0XHRcdHRoaXMudXJpU2VydmljZS5leHRVcmkuaXNFcXVhbEF1dGhvcml0eSh0aGlzLmN1cnJlbnRXb3Jrc3BhY2VVcmkuYXV0aG9yaXR5LCBpdGVtLnVyaS5hdXRob3JpdHkpICYmXG5cdFx0XHRcdCFpc1ZpcnR1YWxSZXNvdXJjZShpdGVtLnVyaSlcblx0XHRcdCk7XG5cblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRpZiAoY2FuVXNlT3BlbkRpYWxvZykge1xuXHRcdFx0YWN0aW9ucy5wdXNoKHRoaXMuY3JlYXRlUGlja2VyQWN0aW9uKGl0ZW0pKTtcblx0XHR9XG5cdFx0YWN0aW9ucy5wdXNoKHRoaXMuY3JlYXRlRWRpdEFjdGlvbihpdGVtKSk7XG5cdFx0YWN0aW9ucy5wdXNoKHRoaXMuY3JlYXRlRGVsZXRlQWN0aW9uKGl0ZW0pKTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnB1c2goYWN0aW9ucywgeyBpY29uOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVFZGl0QWN0aW9uKGl0ZW06IElUcnVzdGVkVXJpSXRlbSk6IElBY3Rpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogJycsXG5cdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGVkaXRJY29uKSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRpZDogJ2VkaXRUcnVzdGVkVXJpJyxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdlZGl0VHJ1c3RlZFVyaScsIFwiRWRpdCBQYXRoXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMudGFibGUuZWRpdChpdGVtLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUGlja2VyQWN0aW9uKGl0ZW06IElUcnVzdGVkVXJpSXRlbSk6IElBY3Rpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogJycsXG5cdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGZvbGRlclBpY2tlckljb24pLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGlkOiAncGlja2VyVHJ1c3RlZFVyaScsXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgncGlja2VyVHJ1c3RlZFVyaScsIFwiT3BlbiBGaWxlIFBpY2tlclwiKSxcblx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnRhYmxlLmVkaXQoaXRlbSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRGVsZXRlQWN0aW9uKGl0ZW06IElUcnVzdGVkVXJpSXRlbSk6IElBY3Rpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogJycsXG5cdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKHJlbW92ZUljb24pLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGlkOiAnZGVsZXRlVHJ1c3RlZFVyaScsXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZGVsZXRlVHJ1c3RlZFVyaScsIFwiRGVsZXRlIFBhdGhcIiksXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy50YWJsZS5kZWxldGUoaXRlbSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5kaXNwb3NlKCk7XG5cdH1cblxufVxuXG5pbnRlcmZhY2UgSVRydXN0ZWRVcmlQYXRoQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0ZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHBhdGhMYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHBhdGhJbnB1dDogSW5wdXRCb3g7XG5cdHJlbmRlckRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmNsYXNzIFRydXN0ZWRVcmlQYXRoQ29sdW1uUmVuZGVyZXIgaW1wbGVtZW50cyBJVGFibGVSZW5kZXJlcjxJVHJ1c3RlZFVyaUl0ZW0sIElUcnVzdGVkVXJpUGF0aENvbHVtblRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAncGF0aCc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gVHJ1c3RlZFVyaVBhdGhDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblx0cHJpdmF0ZSBjdXJyZW50SXRlbT86IElUcnVzdGVkVXJpSXRlbTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRhYmxlOiBXb3Jrc3BhY2VUcnVzdGVkVXJpc1RhYmxlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlXG5cdCkge1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElUcnVzdGVkVXJpUGF0aENvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCcucGF0aCcpKTtcblx0XHRjb25zdCBwYXRoTGFiZWwgPSBlbGVtZW50LmFwcGVuZENoaWxkKCQoJ2Rpdi5wYXRoLWxhYmVsJykpO1xuXG5cdFx0Y29uc3QgcGF0aElucHV0ID0gbmV3IElucHV0Qm94KGVsZW1lbnQsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0XHR2YWxpZGF0aW9uT3B0aW9uczoge1xuXHRcdFx0XHR2YWxpZGF0aW9uOiB2YWx1ZSA9PiB0aGlzLnRhYmxlLnZhbGlkYXRlVXJpKHZhbHVlLCB0aGlzLmN1cnJlbnRJdGVtKVxuXHRcdFx0fSxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXNcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHJlbmRlckRpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWxlbWVudCxcblx0XHRcdHBhdGhMYWJlbCxcblx0XHRcdHBhdGhJbnB1dCxcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0cmVuZGVyRGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChpdGVtOiBJVHJ1c3RlZFVyaUl0ZW0sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVRydXN0ZWRVcmlQYXRoQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnJlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHR0aGlzLmN1cnJlbnRJdGVtID0gaXRlbTtcblx0XHR0ZW1wbGF0ZURhdGEucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRoaXMudGFibGUub25FZGl0KGFzeW5jIChlKSA9PiB7XG5cdFx0XHRpZiAoaXRlbSA9PT0gZSkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpbnB1dC1tb2RlJyk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5wYXRoSW5wdXQuZm9jdXMoKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnBhdGhJbnB1dC5zZWxlY3QoKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnQucGFyZW50RWxlbWVudCEuc3R5bGUucGFkZGluZ0xlZnQgPSAnMHB4Jztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBzdG9wIGRvdWJsZSBjbGljayBhY3Rpb24gZnJvbSByZS1yZW5kZXJpbmcgdGhlIGVsZW1lbnQgb24gdGhlIHRhYmxlICMxMjUwNTJcblx0XHR0ZW1wbGF0ZURhdGEucmVuZGVyRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0ZW1wbGF0ZURhdGEucGF0aElucHV0LmVsZW1lbnQsIEV2ZW50VHlwZS5EQkxDTElDSywgZSA9PiB7XG5cdFx0XHRFdmVudEhlbHBlci5zdG9wKGUpO1xuXHRcdH0pKTtcblxuXG5cdFx0Y29uc3QgaGlkZUlucHV0Qm94ID0gKCkgPT4ge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnaW5wdXQtbW9kZScpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnQucGFyZW50RWxlbWVudCEuc3R5bGUucGFkZGluZ0xlZnQgPSAnNXB4Jztcblx0XHR9O1xuXG5cdFx0Y29uc3QgYWNjZXB0ID0gKCkgPT4ge1xuXHRcdFx0aGlkZUlucHV0Qm94KCk7XG5cblx0XHRcdGNvbnN0IHBhdGhUb1VzZSA9IHRlbXBsYXRlRGF0YS5wYXRoSW5wdXQudmFsdWU7XG5cdFx0XHRjb25zdCB1cmkgPSBoYXNEcml2ZUxldHRlcihwYXRoVG9Vc2UpID8gaXRlbS51cmkud2l0aCh7IHBhdGg6IHBvc2l4LnNlcCArIHRvU2xhc2hlcyhwYXRoVG9Vc2UpIH0pIDogaXRlbS51cmkud2l0aCh7IHBhdGg6IHBhdGhUb1VzZSB9KTtcblx0XHRcdHRlbXBsYXRlRGF0YS5wYXRoTGFiZWwuaW5uZXJUZXh0ID0gdGhpcy5mb3JtYXRQYXRoKHVyaSk7XG5cblx0XHRcdGlmICh1cmkpIHtcblx0XHRcdFx0dGhpcy50YWJsZS5hY2NlcHRFZGl0KGl0ZW0sIHVyaSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlamVjdCA9ICgpID0+IHtcblx0XHRcdGhpZGVJbnB1dEJveCgpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnBhdGhJbnB1dC52YWx1ZSA9IHN0cmluZ1ZhbHVlO1xuXHRcdFx0dGhpcy50YWJsZS5yZWplY3RFZGl0KGl0ZW0pO1xuXHRcdH07XG5cblx0XHR0ZW1wbGF0ZURhdGEucmVuZGVyRGlzcG9zYWJsZXMuYWRkKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRlbXBsYXRlRGF0YS5wYXRoSW5wdXQuaW5wdXRFbGVtZW50LCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0bGV0IGhhbmRsZWQgPSBmYWxzZTtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHRhY2NlcHQoKTtcblx0XHRcdFx0aGFuZGxlZCA9IHRydWU7XG5cdFx0XHR9IGVsc2UgaWYgKGUuZXF1YWxzKEtleUNvZGUuRXNjYXBlKSkge1xuXHRcdFx0XHRyZWplY3QoKTtcblx0XHRcdFx0aGFuZGxlZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChoYW5kbGVkKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGVtcGxhdGVEYXRhLnJlbmRlckRpc3Bvc2FibGVzLmFkZCgoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRlbXBsYXRlRGF0YS5wYXRoSW5wdXQuaW5wdXRFbGVtZW50LCBFdmVudFR5cGUuQkxVUiwgKCkgPT4ge1xuXHRcdFx0cmVqZWN0KCk7XG5cdFx0fSkpKTtcblxuXHRcdGNvbnN0IHN0cmluZ1ZhbHVlID0gdGhpcy5mb3JtYXRQYXRoKGl0ZW0udXJpKTtcblx0XHR0ZW1wbGF0ZURhdGEucGF0aElucHV0LnZhbHVlID0gc3RyaW5nVmFsdWU7XG5cdFx0dGVtcGxhdGVEYXRhLnBhdGhMYWJlbC5pbm5lclRleHQgPSBzdHJpbmdWYWx1ZTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdjdXJyZW50LXdvcmtzcGFjZS1wYXJlbnQnLCBpdGVtLnBhcmVudE9mV29ya3NwYWNlSXRlbSk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJVHJ1c3RlZFVyaVBhdGhDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5yZW5kZXJEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGZvcm1hdFBhdGgodXJpOiBVUkkpOiBzdHJpbmcge1xuXHRcdGlmICh1cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdHJldHVybiBub3JtYWxpemVEcml2ZUxldHRlcih1cmkuZnNQYXRoKTtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgcGF0aCBpcyBub3QgYSBmaWxlIHVyaSwgYnV0IHBvaW50cyB0byBhIHdpbmRvd3MgcmVtb3RlLCB3ZSBzaG91bGQgY3JlYXRlIHdpbmRvd3MgZnMgcGF0aFxuXHRcdC8vIGUuZy4gL2M6L3VzZXIvZGlyZWN0b3J5ID0+IEM6XFx1c2VyXFxkaXJlY3Rvcnlcblx0XHRpZiAodXJpLnBhdGguc3RhcnRzV2l0aChwb3NpeC5zZXApKSB7XG5cdFx0XHRjb25zdCBwYXRoV2l0aG91dExlYWRpbmdTZXBhcmF0b3IgPSB1cmkucGF0aC5zdWJzdHJpbmcoMSk7XG5cdFx0XHRjb25zdCBpc1dpbmRvd3NQYXRoID0gaGFzRHJpdmVMZXR0ZXIocGF0aFdpdGhvdXRMZWFkaW5nU2VwYXJhdG9yLCB0cnVlKTtcblx0XHRcdGlmIChpc1dpbmRvd3NQYXRoKSB7XG5cdFx0XHRcdHJldHVybiBub3JtYWxpemVEcml2ZUxldHRlcih3aW4zMi5ub3JtYWxpemUocGF0aFdpdGhvdXRMZWFkaW5nU2VwYXJhdG9yKSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVyaS5wYXRoO1xuXHR9XG5cbn1cblxuXG5pbnRlcmZhY2UgSVRydXN0ZWRVcmlIb3N0Q29sdW1uVGVtcGxhdGVEYXRhIHtcblx0ZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdGhvc3RDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRidXR0b25CYXJDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZW5kZXJEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5mdW5jdGlvbiBnZXRIb3N0TGFiZWwobGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLCBpdGVtOiBJVHJ1c3RlZFVyaUl0ZW0pOiBzdHJpbmcge1xuXHRyZXR1cm4gaXRlbS51cmkuYXV0aG9yaXR5ID8gbGFiZWxTZXJ2aWNlLmdldEhvc3RMYWJlbChpdGVtLnVyaS5zY2hlbWUsIGl0ZW0udXJpLmF1dGhvcml0eSkgOiBsb2NhbGl6ZSgnbG9jYWxBdXRob3JpdHknLCBcIkxvY2FsXCIpO1xufVxuXG5jbGFzcyBUcnVzdGVkVXJpSG9zdENvbHVtblJlbmRlcmVyIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8SVRydXN0ZWRVcmlJdGVtLCBJVHJ1c3RlZFVyaUhvc3RDb2x1bW5UZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2hvc3QnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IFRydXN0ZWRVcmlIb3N0Q29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElUcnVzdGVkVXJpSG9zdENvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcmVuZGVyRGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdGNvbnN0IGVsZW1lbnQgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnLmhvc3QnKSk7XG5cdFx0Y29uc3QgaG9zdENvbnRhaW5lciA9IGVsZW1lbnQuYXBwZW5kQ2hpbGQoJCgnZGl2Lmhvc3QtbGFiZWwnKSk7XG5cdFx0Y29uc3QgYnV0dG9uQmFyQ29udGFpbmVyID0gZWxlbWVudC5hcHBlbmRDaGlsZCgkKCdkaXYuYnV0dG9uLWJhcicpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRlbGVtZW50LFxuXHRcdFx0aG9zdENvbnRhaW5lcixcblx0XHRcdGJ1dHRvbkJhckNvbnRhaW5lcixcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0cmVuZGVyRGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChpdGVtOiBJVHJ1c3RlZFVyaUl0ZW0sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVRydXN0ZWRVcmlIb3N0Q29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnJlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGVtcGxhdGVEYXRhLnJlbmRlckRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHsgY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS5idXR0b25CYXJDb250YWluZXIpOyB9IH0pO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmhvc3RDb250YWluZXIuaW5uZXJUZXh0ID0gZ2V0SG9zdExhYmVsKHRoaXMubGFiZWxTZXJ2aWNlLCBpdGVtKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdjdXJyZW50LXdvcmtzcGFjZS1wYXJlbnQnLCBpdGVtLnBhcmVudE9mV29ya3NwYWNlSXRlbSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEuaG9zdENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGVtcGxhdGVEYXRhLmJ1dHRvbkJhckNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVRydXN0ZWRVcmlIb3N0Q29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VUcnVzdEVkaXRvciBleHRlbmRzIEVkaXRvclBhbmUge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICd3b3JrYmVuY2guZWRpdG9yLndvcmtzcGFjZVRydXN0Jztcblx0cHJpdmF0ZSByb290RWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXG5cdC8vIEhlYWRlciBTZWN0aW9uXG5cdHByaXZhdGUgaGVhZGVyQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgaGVhZGVyVGl0bGVDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBoZWFkZXJUaXRsZUljb24hOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBoZWFkZXJUaXRsZVRleHQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBoZWFkZXJEZXNjcmlwdGlvbiE6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgYm9keVNjcm9sbEJhciE6IERvbVNjcm9sbGFibGVFbGVtZW50O1xuXG5cdC8vIEFmZmVjdGVkIEZlYXR1cmVzIFNlY3Rpb25cblx0cHJpdmF0ZSBhZmZlY3RlZEZlYXR1cmVzQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdHJ1c3RlZENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHVudHJ1c3RlZENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXG5cdC8vIFNldHRpbmdzIFNlY3Rpb25cblx0cHJpdmF0ZSBjb25maWd1cmF0aW9uQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgd29ya3NwYWNlVHJ1c3RlZFVyaXNUYWJsZSE6IFdvcmtzcGFjZVRydXN0ZWRVcmlzVGFibGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Z3JvdXA6IElFZGl0b3JHcm91cCxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZTogSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdCkgeyBzdXBlcihXb3Jrc3BhY2VUcnVzdEVkaXRvci5JRCwgZ3JvdXAsIHRlbGVtZXRyeVNlcnZpY2UsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpOyB9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUVkaXRvcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5yb290RWxlbWVudCA9IGFwcGVuZChwYXJlbnQsICQoJy53b3Jrc3BhY2UtdHJ1c3QtZWRpdG9yJywgeyB0YWJpbmRleDogJzAnIH0pKTtcblxuXHRcdHRoaXMuY3JlYXRlSGVhZGVyRWxlbWVudCh0aGlzLnJvb3RFbGVtZW50KTtcblxuXHRcdGNvbnN0IHNjcm9sbGFibGVDb250ZW50ID0gJCgnLndvcmtzcGFjZS10cnVzdC1lZGl0b3ItYm9keScpO1xuXHRcdHRoaXMuYm9keVNjcm9sbEJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudChzY3JvbGxhYmxlQ29udGVudCwge1xuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdH0pKTtcblxuXHRcdGFwcGVuZCh0aGlzLnJvb3RFbGVtZW50LCB0aGlzLmJvZHlTY3JvbGxCYXIuZ2V0RG9tTm9kZSgpKTtcblxuXHRcdHRoaXMuY3JlYXRlQWZmZWN0ZWRGZWF0dXJlc0VsZW1lbnQoc2Nyb2xsYWJsZUNvbnRlbnQpO1xuXHRcdHRoaXMuY3JlYXRlQ29uZmlndXJhdGlvbkVsZW1lbnQoc2Nyb2xsYWJsZUNvbnRlbnQpO1xuXG5cdFx0dGhpcy5yb290RWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS13b3Jrc3BhY2UtdHJ1c3Qtc2VsZWN0ZWQtY29sb3InLCBhc0Nzc1ZhcmlhYmxlKGJ1dHRvbkJhY2tncm91bmQpKTtcblx0XHR0aGlzLnJvb3RFbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLXdvcmtzcGFjZS10cnVzdC11bnNlbGVjdGVkLWNvbG9yJywgYXNDc3NWYXJpYWJsZShidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kKSk7XG5cdFx0dGhpcy5yb290RWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS13b3Jrc3BhY2UtdHJ1c3QtY2hlY2stY29sb3InLCBhc0Nzc1ZhcmlhYmxlKGRlYnVnSWNvblN0YXJ0Rm9yZWdyb3VuZCkpO1xuXHRcdHRoaXMucm9vdEVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0td29ya3NwYWNlLXRydXN0LXgtY29sb3InLCBhc0Nzc1ZhcmlhYmxlKGVkaXRvckVycm9yRm9yZWdyb3VuZCkpO1xuXG5cdFx0Ly8gTmF2aWdhdGUgcGFnZSB3aXRoIGtleWJvYXJkXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMucm9vdEVsZW1lbnQsIEV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5VcEFycm93KSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5Eb3duQXJyb3cpKSB7XG5cdFx0XHRcdGNvbnN0IG5hdk9yZGVyID0gW3RoaXMuaGVhZGVyQ29udGFpbmVyLCB0aGlzLnRydXN0ZWRDb250YWluZXIsIHRoaXMudW50cnVzdGVkQ29udGFpbmVyLCB0aGlzLmNvbmZpZ3VyYXRpb25Db250YWluZXJdO1xuXHRcdFx0XHRjb25zdCBjdXJyZW50SW5kZXggPSBuYXZPcmRlci5maW5kSW5kZXgoZWxlbWVudCA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIGlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQoZWxlbWVudCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGxldCBuZXdJbmRleCA9IGN1cnJlbnRJbmRleDtcblx0XHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkRvd25BcnJvdykpIHtcblx0XHRcdFx0XHRuZXdJbmRleCsrO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLlVwQXJyb3cpKSB7XG5cdFx0XHRcdFx0bmV3SW5kZXggPSBNYXRoLm1heCgwLCBuZXdJbmRleCk7XG5cdFx0XHRcdFx0bmV3SW5kZXgtLTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG5ld0luZGV4ICs9IG5hdk9yZGVyLmxlbmd0aDtcblx0XHRcdFx0bmV3SW5kZXggJT0gbmF2T3JkZXIubGVuZ3RoO1xuXG5cdFx0XHRcdG5hdk9yZGVyW25ld0luZGV4XS5mb2N1cygpO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdHRoaXMucm9vdEVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuZXF1YWxzKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdFx0aWYgKHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5jYW5TZXRXb3Jrc3BhY2VUcnVzdCgpKSB7XG5cdFx0XHRcdFx0dGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLnNldFdvcmtzcGFjZVRydXN0KCF0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKSB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblxuXHRcdHRoaXMucm9vdEVsZW1lbnQuZm9jdXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNldElucHV0KGlucHV0OiBXb3Jrc3BhY2VUcnVzdEVkaXRvcklucHV0LCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7IHJldHVybjsgfVxuXG5cdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLndvcmtzcGFjZVRydXN0SW5pdGlhbGl6ZWQ7XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHRcdGF3YWl0IHRoaXMucmVuZGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5vbkNoYW5nZSgoKSA9PiB0aGlzLnJlbmRlcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZVJlc3RyaWN0ZWRTZXR0aW5ncygoKSA9PiB0aGlzLnJlbmRlcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3QoKCkgPT4gdGhpcy5yZW5kZXIoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVRydXN0ZWRGb2xkZXJzKCgpID0+IHRoaXMucmVuZGVyKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SGVhZGVyQ29udGFpbmVyQ2xhc3ModHJ1c3RlZDogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0aWYgKHRydXN0ZWQpIHtcblx0XHRcdHJldHVybiAnd29ya3NwYWNlLXRydXN0LWhlYWRlciB3b3Jrc3BhY2UtdHJ1c3QtdHJ1c3RlZCc7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICd3b3Jrc3BhY2UtdHJ1c3QtaGVhZGVyIHdvcmtzcGFjZS10cnVzdC11bnRydXN0ZWQnO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRIZWFkZXJUaXRsZVRleHQodHJ1c3RlZDogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0aWYgKHRydXN0ZWQpIHtcblx0XHRcdGlmICh0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdEZvcmNlZCgpKSB7XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndHJ1c3RlZFVuc2V0dGFibGVXaW5kb3cnLCBcIlRoaXMgd2luZG93IGlzIHRydXN0ZWRcIik7XG5cdFx0XHR9XG5cblx0XHRcdHN3aXRjaCAodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkpIHtcblx0XHRcdFx0Y2FzZSBXb3JrYmVuY2hTdGF0ZS5FTVBUWTpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3RydXN0ZWRIZWFkZXJXaW5kb3cnLCBcIllvdSB0cnVzdCB0aGlzIHdpbmRvd1wiKTtcblx0XHRcdFx0Y2FzZSBXb3JrYmVuY2hTdGF0ZS5GT0xERVI6XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0cnVzdGVkSGVhZGVyRm9sZGVyJywgXCJZb3UgdHJ1c3QgdGhpcyBmb2xkZXJcIik7XG5cdFx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndHJ1c3RlZEhlYWRlcldvcmtzcGFjZScsIFwiWW91IHRydXN0IHRoaXMgd29ya3NwYWNlXCIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBsb2NhbGl6ZSgndW50cnVzdGVkSGVhZGVyJywgXCJZb3UgYXJlIGluIFJlc3RyaWN0ZWQgTW9kZVwiKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SGVhZGVyVGl0bGVJY29uQ2xhc3NOYW1lcyh0cnVzdGVkOiBib29sZWFuKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShzaGllbGRJY29uKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RmVhdHVyZXNIZWFkZXJUZXh0KHRydXN0ZWQ6IGJvb2xlYW4pOiBbc3RyaW5nLCBzdHJpbmddIHtcblx0XHRsZXQgdGl0bGU6IHN0cmluZyA9ICcnO1xuXHRcdGxldCBzdWJUaXRsZTogc3RyaW5nID0gJyc7XG5cblx0XHRzd2l0Y2ggKHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpKSB7XG5cdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLkVNUFRZOiB7XG5cdFx0XHRcdHRpdGxlID0gdHJ1c3RlZCA/IGxvY2FsaXplKCd0cnVzdGVkV2luZG93JywgXCJJbiBhIFRydXN0ZWQgV2luZG93XCIpIDogbG9jYWxpemUoJ3VudHJ1c3RlZFdvcmtzcGFjZScsIFwiSW4gUmVzdHJpY3RlZCBNb2RlXCIpO1xuXHRcdFx0XHRzdWJUaXRsZSA9IHRydXN0ZWQgPyBsb2NhbGl6ZSgndHJ1c3RlZFdpbmRvd1N1YnRpdGxlJywgXCJZb3UgdHJ1c3QgdGhlIGF1dGhvcnMgb2YgdGhlIGZpbGVzIGluIHRoZSBjdXJyZW50IHdpbmRvdy4gQWxsIGZlYXR1cmVzIGFyZSBlbmFibGVkOlwiKSA6XG5cdFx0XHRcdFx0bG9jYWxpemUoJ3VudHJ1c3RlZFdpbmRvd1N1YnRpdGxlJywgXCJZb3UgZG8gbm90IHRydXN0IHRoZSBhdXRob3JzIG9mIHRoZSBmaWxlcyBpbiB0aGUgY3VycmVudCB3aW5kb3cuIFRoZSBmb2xsb3dpbmcgZmVhdHVyZXMgYXJlIGRpc2FibGVkOlwiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLkZPTERFUjoge1xuXHRcdFx0XHR0aXRsZSA9IHRydXN0ZWQgPyBsb2NhbGl6ZSgndHJ1c3RlZEZvbGRlcicsIFwiSW4gYSBUcnVzdGVkIEZvbGRlclwiKSA6IGxvY2FsaXplKCd1bnRydXN0ZWRXb3Jrc3BhY2UnLCBcIkluIFJlc3RyaWN0ZWQgTW9kZVwiKTtcblx0XHRcdFx0c3ViVGl0bGUgPSB0cnVzdGVkID8gbG9jYWxpemUoJ3RydXN0ZWRGb2xkZXJTdWJ0aXRsZScsIFwiWW91IHRydXN0IHRoZSBhdXRob3JzIG9mIHRoZSBmaWxlcyBpbiB0aGUgY3VycmVudCBmb2xkZXIuIEFsbCBmZWF0dXJlcyBhcmUgZW5hYmxlZDpcIikgOlxuXHRcdFx0XHRcdGxvY2FsaXplKCd1bnRydXN0ZWRGb2xkZXJTdWJ0aXRsZScsIFwiWW91IGRvIG5vdCB0cnVzdCB0aGUgYXV0aG9ycyBvZiB0aGUgZmlsZXMgaW4gdGhlIGN1cnJlbnQgZm9sZGVyLiBUaGUgZm9sbG93aW5nIGZlYXR1cmVzIGFyZSBkaXNhYmxlZDpcIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0U6IHtcblx0XHRcdFx0dGl0bGUgPSB0cnVzdGVkID8gbG9jYWxpemUoJ3RydXN0ZWRXb3Jrc3BhY2UnLCBcIkluIGEgVHJ1c3RlZCBXb3Jrc3BhY2VcIikgOiBsb2NhbGl6ZSgndW50cnVzdGVkV29ya3NwYWNlJywgXCJJbiBSZXN0cmljdGVkIE1vZGVcIik7XG5cdFx0XHRcdHN1YlRpdGxlID0gdHJ1c3RlZCA/IGxvY2FsaXplKCd0cnVzdGVkV29ya3NwYWNlU3VidGl0bGUnLCBcIllvdSB0cnVzdCB0aGUgYXV0aG9ycyBvZiB0aGUgZmlsZXMgaW4gdGhlIGN1cnJlbnQgd29ya3NwYWNlLiBBbGwgZmVhdHVyZXMgYXJlIGVuYWJsZWQ6XCIpIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSgndW50cnVzdGVkV29ya3NwYWNlU3VidGl0bGUnLCBcIllvdSBkbyBub3QgdHJ1c3QgdGhlIGF1dGhvcnMgb2YgdGhlIGZpbGVzIGluIHRoZSBjdXJyZW50IHdvcmtzcGFjZS4gVGhlIGZvbGxvd2luZyBmZWF0dXJlcyBhcmUgZGlzYWJsZWQ6XCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gW3RpdGxlLCBzdWJUaXRsZV07XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcmluZyA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlcmVuZGVyRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdEBkZWJvdW5jZSgxMDApXG5cdHByaXZhdGUgYXN5bmMgcmVuZGVyKCkge1xuXHRcdC8vIFRoZSBkZWJvdW5jZWQgcmVuZGVyIGNhbiBmaXJlIGFmdGVyIHRoZSBlZGl0b3IgcGFuZSAoYW5kIGl0cyBzY29wZWRcblx0XHQvLyBpbnN0YW50aWF0aW9uIHNlcnZpY2UpIGhhcyBiZWVuIGRpc3Bvc2VkLiBCYWlsIG91dCBzbyB3ZSBuZXZlciBjYWxsXG5cdFx0Ly8gY3JlYXRlSW5zdGFuY2Ugb24gYSBkaXNwb3NlZCBJbnN0YW50aWF0aW9uU2VydmljZS5cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnJlbmRlcmluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyaW5nID0gdHJ1ZTtcblx0XHR0aGlzLnJlcmVuZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGNvbnN0IGlzV29ya3NwYWNlVHJ1c3RlZCA9IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKTtcblx0XHR0aGlzLnJvb3RFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3RydXN0ZWQnLCBpc1dvcmtzcGFjZVRydXN0ZWQpO1xuXHRcdHRoaXMucm9vdEVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgndW50cnVzdGVkJywgIWlzV29ya3NwYWNlVHJ1c3RlZCk7XG5cblx0XHQvLyBIZWFkZXIgU2VjdGlvblxuXHRcdHRoaXMuaGVhZGVyVGl0bGVUZXh0LmlubmVyVGV4dCA9IHRoaXMuZ2V0SGVhZGVyVGl0bGVUZXh0KGlzV29ya3NwYWNlVHJ1c3RlZCk7XG5cdFx0dGhpcy5oZWFkZXJUaXRsZUljb24uY2xhc3NOYW1lID0gJ3dvcmtzcGFjZS10cnVzdC10aXRsZS1pY29uJztcblx0XHR0aGlzLmhlYWRlclRpdGxlSWNvbi5jbGFzc0xpc3QuYWRkKC4uLnRoaXMuZ2V0SGVhZGVyVGl0bGVJY29uQ2xhc3NOYW1lcyhpc1dvcmtzcGFjZVRydXN0ZWQpKTtcblx0XHR0aGlzLmhlYWRlckRlc2NyaXB0aW9uLmlubmVyVGV4dCA9ICcnO1xuXG5cdFx0Y29uc3QgaGVhZGVyRGVzY3JpcHRpb25UZXh0ID0gYXBwZW5kKHRoaXMuaGVhZGVyRGVzY3JpcHRpb24sICQoJ2RpdicpKTtcblx0XHRoZWFkZXJEZXNjcmlwdGlvblRleHQuaW5uZXJUZXh0ID0gaXNXb3Jrc3BhY2VUcnVzdGVkID9cblx0XHRcdGxvY2FsaXplKCd0cnVzdGVkRGVzY3JpcHRpb24nLCBcIkFsbCBmZWF0dXJlcyBhcmUgZW5hYmxlZCBiZWNhdXNlIHRydXN0IGhhcyBiZWVuIGdyYW50ZWQgdG8gdGhlIHdvcmtzcGFjZS5cIikgOlxuXHRcdFx0bG9jYWxpemUoJ3VudHJ1c3RlZERlc2NyaXB0aW9uJywgXCJ7MH0gaXMgaW4gYSByZXN0cmljdGVkIG1vZGUgaW50ZW5kZWQgZm9yIHNhZmUgY29kZSBicm93c2luZy5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lU2hvcnQpO1xuXG5cdFx0Y29uc3QgaGVhZGVyRGVzY3JpcHRpb25BY3Rpb25zID0gYXBwZW5kKHRoaXMuaGVhZGVyRGVzY3JpcHRpb24sICQoJ2RpdicpKTtcblx0XHRjb25zdCBoZWFkZXJEZXNjcmlwdGlvbkFjdGlvbnNUZXh0ID0gbG9jYWxpemUoeyBrZXk6ICd3b3Jrc3BhY2VUcnVzdEVkaXRvckhlYWRlckFjdGlvbnMnLCBjb21tZW50OiBbJ1BsZWFzZSBlbnN1cmUgdGhlIG1hcmtkb3duIGxpbmsgc3ludGF4IGlzIG5vdCBicm9rZW4gdXAgd2l0aCB3aGl0ZXNwYWNlIFt0ZXh0IGJsb2NrXShsaW5rIGJsb2NrKSddIH0sIFwiW0NvbmZpZ3VyZSB5b3VyIHNldHRpbmdzXSh7MH0pIG9yIFtsZWFybiBtb3JlXShodHRwczovL2FrYS5tcy92c2NvZGUtd29ya3NwYWNlLXRydXN0KS5cIiwgYGNvbW1hbmQ6d29ya2JlbmNoLnRydXN0LmNvbmZpZ3VyZWApO1xuXHRcdGZvciAoY29uc3Qgbm9kZSBvZiBwYXJzZUxpbmtlZFRleHQoaGVhZGVyRGVzY3JpcHRpb25BY3Rpb25zVGV4dCkubm9kZXMpIHtcblx0XHRcdGlmICh0eXBlb2Ygbm9kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0YXBwZW5kKGhlYWRlckRlc2NyaXB0aW9uQWN0aW9ucywgZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobm9kZSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5yZXJlbmRlckRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExpbmssIGhlYWRlckRlc2NyaXB0aW9uQWN0aW9ucywgeyAuLi5ub2RlLCB0YWJJbmRleDogLTEgfSwge30pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmhlYWRlckNvbnRhaW5lci5jbGFzc05hbWUgPSB0aGlzLmdldEhlYWRlckNvbnRhaW5lckNsYXNzKGlzV29ya3NwYWNlVHJ1c3RlZCk7XG5cdFx0dGhpcy5yb290RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBgJHtsb2NhbGl6ZSgncm9vdCBlbGVtZW50IGxhYmVsJywgXCJNYW5hZ2UgV29ya3NwYWNlIFRydXN0XCIpfTogICR7dGhpcy5oZWFkZXJDb250YWluZXIuaW5uZXJUZXh0fWApO1xuXG5cdFx0Ly8gU2V0dGluZ3Ncblx0XHRjb25zdCByZXN0cmljdGVkU2V0dGluZ3MgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlc3RyaWN0ZWRTZXR0aW5ncztcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IHNldHRpbmdzUmVxdWlyaW5nVHJ1c3RlZFdvcmtzcGFjZUNvdW50ID0gcmVzdHJpY3RlZFNldHRpbmdzLmRlZmF1bHQuZmlsdGVyKGtleSA9PiB7XG5cdFx0XHRjb25zdCBwcm9wZXJ0eSA9IGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpW2tleV07XG5cblx0XHRcdC8vIGNhbm5vdCBiZSBjb25maWd1cmVkIGluIHdvcmtzcGFjZVxuXHRcdFx0aWYgKHByb3BlcnR5LnNjb3BlICYmIChBUFBMSUNBVElPTl9TQ09QRVMuaW5jbHVkZXMocHJvcGVydHkuc2NvcGUpIHx8IHByb3BlcnR5LnNjb3BlID09PSBDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiBkZXByZWNhdGVkIGluY2x1ZGUgb25seSB0aG9zZSBjb25maWd1cmVkIGluIHRoZSB3b3Jrc3BhY2Vcblx0XHRcdGlmIChwcm9wZXJ0eS5kZXByZWNhdGlvbk1lc3NhZ2UgfHwgcHJvcGVydHkubWFya2Rvd25EZXByZWNhdGlvbk1lc3NhZ2UpIHtcblx0XHRcdFx0aWYgKHJlc3RyaWN0ZWRTZXR0aW5ncy53b3Jrc3BhY2U/LmluY2x1ZGVzKGtleSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmVzdHJpY3RlZFNldHRpbmdzLndvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgd29ya3NwYWNlRm9sZGVyU2V0dGluZ3Mgb2YgcmVzdHJpY3RlZFNldHRpbmdzLndvcmtzcGFjZUZvbGRlci52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdFx0aWYgKHdvcmtzcGFjZUZvbGRlclNldHRpbmdzLmluY2x1ZGVzKGtleSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSkubGVuZ3RoO1xuXG5cdFx0Ly8gRmVhdHVyZXMgTGlzdFxuXHRcdHRoaXMucmVuZGVyQWZmZWN0ZWRGZWF0dXJlcyhzZXR0aW5nc1JlcXVpcmluZ1RydXN0ZWRXb3Jrc3BhY2VDb3VudCwgdGhpcy5nZXRFeHRlbnNpb25Db3VudCgpKTtcblxuXHRcdC8vIENvbmZpZ3VyYXRpb24gVHJlZVxuXHRcdHRoaXMud29ya3NwYWNlVHJ1c3RlZFVyaXNUYWJsZS51cGRhdGVUYWJsZSgpO1xuXG5cdFx0dGhpcy5ib2R5U2Nyb2xsQmFyLmdldERvbU5vZGUoKS5zdHlsZS5oZWlnaHQgPSBgY2FsYygxMDAlIC0gJHt0aGlzLmhlYWRlckNvbnRhaW5lci5jbGllbnRIZWlnaHR9cHgpYDtcblx0XHR0aGlzLmJvZHlTY3JvbGxCYXIuc2NhbkRvbU5vZGUoKTtcblx0XHR0aGlzLnJlbmRlcmluZyA9IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFeHRlbnNpb25Db3VudCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IHNldCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0Y29uc3QgaW5WaXJ0dWFsV29ya3NwYWNlID0gaXNWaXJ0dWFsV29ya3NwYWNlKHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKSk7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gdGhpcy5leHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbHRlcihleHQgPT4gZXh0LmxvY2FsKS5tYXAoZXh0ID0+IGV4dC5sb2NhbCEpO1xuXG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgbG9jYWxFeHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBlbmFibGVtZW50U3RhdGUgPSB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmdldEVuYWJsZW1lbnRTdGF0ZShleHRlbnNpb24pO1xuXHRcdFx0aWYgKGVuYWJsZW1lbnRTdGF0ZSAhPT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSAmJiBlbmFibGVtZW50U3RhdGUgIT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlICYmXG5cdFx0XHRcdGVuYWJsZW1lbnRTdGF0ZSAhPT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlUcnVzdFJlcXVpcmVtZW50ICYmIGVuYWJsZW1lbnRTdGF0ZSAhPT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFeHRlbnNpb25EZXBlbmRlbmN5KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaW5WaXJ0dWFsV29ya3NwYWNlICYmIHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5nZXRFeHRlbnNpb25WaXJ0dWFsV29ya3NwYWNlU3VwcG9ydFR5cGUoZXh0ZW5zaW9uLm1hbmlmZXN0KSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuZ2V0RXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydFR5cGUoZXh0ZW5zaW9uLm1hbmlmZXN0KSAhPT0gdHJ1ZSkge1xuXHRcdFx0XHRzZXQuYWRkKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlcGVuZGVuY2llcyA9IGdldEV4dGVuc2lvbkRlcGVuZGVuY2llcyhsb2NhbEV4dGVuc2lvbnMsIGV4dGVuc2lvbik7XG5cdFx0XHRpZiAoZGVwZW5kZW5jaWVzLnNvbWUoZXh0ID0+IHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5nZXRFeHRlbnNpb25VbnRydXN0ZWRXb3Jrc3BhY2VTdXBwb3J0VHlwZShleHQubWFuaWZlc3QpID09PSBmYWxzZSkpIHtcblx0XHRcdFx0c2V0LmFkZChleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNldC5zaXplO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVIZWFkZXJFbGVtZW50KHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmhlYWRlckNvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy53b3Jrc3BhY2UtdHJ1c3QtaGVhZGVyJywgeyB0YWJJbmRleDogJzAnIH0pKTtcblx0XHR0aGlzLmhlYWRlclRpdGxlQ29udGFpbmVyID0gYXBwZW5kKHRoaXMuaGVhZGVyQ29udGFpbmVyLCAkKCcud29ya3NwYWNlLXRydXN0LXRpdGxlJykpO1xuXHRcdHRoaXMuaGVhZGVyVGl0bGVJY29uID0gYXBwZW5kKHRoaXMuaGVhZGVyVGl0bGVDb250YWluZXIsICQoJy53b3Jrc3BhY2UtdHJ1c3QtdGl0bGUtaWNvbicpKTtcblx0XHR0aGlzLmhlYWRlclRpdGxlVGV4dCA9IGFwcGVuZCh0aGlzLmhlYWRlclRpdGxlQ29udGFpbmVyLCAkKCcud29ya3NwYWNlLXRydXN0LXRpdGxlLXRleHQnKSk7XG5cdFx0dGhpcy5oZWFkZXJEZXNjcmlwdGlvbiA9IGFwcGVuZCh0aGlzLmhlYWRlckNvbnRhaW5lciwgJCgnLndvcmtzcGFjZS10cnVzdC1kZXNjcmlwdGlvbicpKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ29uZmlndXJhdGlvbkVsZW1lbnQocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuY29uZmlndXJhdGlvbkNvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy53b3Jrc3BhY2UtdHJ1c3Qtc2V0dGluZ3MnLCB7IHRhYkluZGV4OiAnMCcgfSkpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25UaXRsZSA9IGFwcGVuZCh0aGlzLmNvbmZpZ3VyYXRpb25Db250YWluZXIsICQoJy53b3Jrc3BhY2UtdHJ1c3RlZC1mb2xkZXJzLXRpdGxlJykpO1xuXHRcdGNvbmZpZ3VyYXRpb25UaXRsZS5pbm5lclRleHQgPSBsb2NhbGl6ZSgndHJ1c3RlZEZvbGRlcnNBbmRXb3Jrc3BhY2VzJywgXCJUcnVzdGVkIEZvbGRlcnMgJiBXb3Jrc3BhY2VzXCIpO1xuXG5cdFx0dGhpcy53b3Jrc3BhY2VUcnVzdGVkVXJpc1RhYmxlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3Jrc3BhY2VUcnVzdGVkVXJpc1RhYmxlLCB0aGlzLmNvbmZpZ3VyYXRpb25Db250YWluZXIpKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQWZmZWN0ZWRGZWF0dXJlc0VsZW1lbnQocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuYWZmZWN0ZWRGZWF0dXJlc0NvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy53b3Jrc3BhY2UtdHJ1c3QtZmVhdHVyZXMnKSk7XG5cdFx0dGhpcy50cnVzdGVkQ29udGFpbmVyID0gYXBwZW5kKHRoaXMuYWZmZWN0ZWRGZWF0dXJlc0NvbnRhaW5lciwgJCgnLndvcmtzcGFjZS10cnVzdC1saW1pdGF0aW9ucy50cnVzdGVkJywgeyB0YWJJbmRleDogJzAnIH0pKTtcblx0XHR0aGlzLnVudHJ1c3RlZENvbnRhaW5lciA9IGFwcGVuZCh0aGlzLmFmZmVjdGVkRmVhdHVyZXNDb250YWluZXIsICQoJy53b3Jrc3BhY2UtdHJ1c3QtbGltaXRhdGlvbnMudW50cnVzdGVkJywgeyB0YWJJbmRleDogJzAnIH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVuZGVyQWZmZWN0ZWRGZWF0dXJlcyhudW1TZXR0aW5nczogbnVtYmVyLCBudW1FeHRlbnNpb25zOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjbGVhck5vZGUodGhpcy50cnVzdGVkQ29udGFpbmVyKTtcblx0XHRjbGVhck5vZGUodGhpcy51bnRydXN0ZWRDb250YWluZXIpO1xuXG5cdFx0Ly8gVHJ1c3RlZCBmZWF0dXJlc1xuXHRcdGNvbnN0IFt0cnVzdGVkVGl0bGUsIHRydXN0ZWRTdWJUaXRsZV0gPSB0aGlzLmdldEZlYXR1cmVzSGVhZGVyVGV4dCh0cnVlKTtcblxuXHRcdHRoaXMucmVuZGVyTGltaXRhdGlvbnNIZWFkZXJFbGVtZW50KHRoaXMudHJ1c3RlZENvbnRhaW5lciwgdHJ1c3RlZFRpdGxlLCB0cnVzdGVkU3ViVGl0bGUpO1xuXHRcdGNvbnN0IHRydXN0ZWRDb250YWluZXJJdGVtcyA9IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSA/XG5cdFx0XHRbXG5cdFx0XHRcdGxvY2FsaXplKCd0cnVzdGVkVGFza3MnLCBcIlRhc2tzIGFyZSBhbGxvd2VkIHRvIHJ1blwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3RydXN0ZWREZWJ1Z2dpbmcnLCBcIkRlYnVnZ2luZyBpcyBlbmFibGVkXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndHJ1c3RlZEV4dGVuc2lvbnMnLCBcIkFsbCBlbmFibGVkIGV4dGVuc2lvbnMgYXJlIGFjdGl2YXRlZFwiKVxuXHRcdFx0XSA6XG5cdFx0XHRbXG5cdFx0XHRcdGxvY2FsaXplKCd0cnVzdGVkVGFza3MnLCBcIlRhc2tzIGFyZSBhbGxvd2VkIHRvIHJ1blwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3RydXN0ZWREZWJ1Z2dpbmcnLCBcIkRlYnVnZ2luZyBpcyBlbmFibGVkXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndHJ1c3RlZFNldHRpbmdzJywgXCJBbGwgd29ya3NwYWNlIHNldHRpbmdzIGFyZSBhcHBsaWVkXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndHJ1c3RlZEV4dGVuc2lvbnMnLCBcIkFsbCBlbmFibGVkIGV4dGVuc2lvbnMgYXJlIGFjdGl2YXRlZFwiKVxuXHRcdFx0XTtcblx0XHR0aGlzLnJlbmRlckxpbWl0YXRpb25zTGlzdEVsZW1lbnQodGhpcy50cnVzdGVkQ29udGFpbmVyLCB0cnVzdGVkQ29udGFpbmVySXRlbXMsIFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGNoZWNrTGlzdEljb24pKTtcblxuXHRcdC8vIFJlc3RyaWN0ZWQgTW9kZSBmZWF0dXJlc1xuXHRcdGNvbnN0IFt1bnRydXN0ZWRUaXRsZSwgdW50cnVzdGVkU3ViVGl0bGVdID0gdGhpcy5nZXRGZWF0dXJlc0hlYWRlclRleHQoZmFsc2UpO1xuXG5cdFx0dGhpcy5yZW5kZXJMaW1pdGF0aW9uc0hlYWRlckVsZW1lbnQodGhpcy51bnRydXN0ZWRDb250YWluZXIsIHVudHJ1c3RlZFRpdGxlLCB1bnRydXN0ZWRTdWJUaXRsZSk7XG5cdFx0Y29uc3QgdW50cnVzdGVkQ29udGFpbmVySXRlbXMgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkgP1xuXHRcdFx0W1xuXHRcdFx0XHRsb2NhbGl6ZSgndW50cnVzdGVkVGFza3MnLCBcIlRhc2tzIGFyZSBub3QgYWxsb3dlZCB0byBydW5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCd1bnRydXN0ZWREZWJ1Z2dpbmcnLCBcIkRlYnVnZ2luZyBpcyBkaXNhYmxlZFwiKSxcblx0XHRcdFx0Zml4QmFkTG9jYWxpemVkTGlua3MobG9jYWxpemUoeyBrZXk6ICd1bnRydXN0ZWRFeHRlbnNpb25zJywgY29tbWVudDogWydQbGVhc2UgZW5zdXJlIHRoZSBtYXJrZG93biBsaW5rIHN5bnRheCBpcyBub3QgYnJva2VuIHVwIHdpdGggd2hpdGVzcGFjZSBbdGV4dCBibG9ja10obGluayBibG9jayknXSB9LCBcIlt7MH0gZXh0ZW5zaW9uc10oezF9KSBhcmUgZGlzYWJsZWQgb3IgaGF2ZSBsaW1pdGVkIGZ1bmN0aW9uYWxpdHlcIiwgbnVtRXh0ZW5zaW9ucywgYGNvbW1hbmQ6JHtMSVNUX1dPUktTUEFDRV9VTlNVUFBPUlRFRF9FWFRFTlNJT05TX0NPTU1BTkRfSUR9YCkpXG5cdFx0XHRdIDpcblx0XHRcdFtcblx0XHRcdFx0bG9jYWxpemUoJ3VudHJ1c3RlZFRhc2tzJywgXCJUYXNrcyBhcmUgbm90IGFsbG93ZWQgdG8gcnVuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndW50cnVzdGVkRGVidWdnaW5nJywgXCJEZWJ1Z2dpbmcgaXMgZGlzYWJsZWRcIiksXG5cdFx0XHRcdGZpeEJhZExvY2FsaXplZExpbmtzKG51bVNldHRpbmdzID8gbG9jYWxpemUoeyBrZXk6ICd1bnRydXN0ZWRTZXR0aW5ncycsIGNvbW1lbnQ6IFsnUGxlYXNlIGVuc3VyZSB0aGUgbWFya2Rvd24gbGluayBzeW50YXggaXMgbm90IGJyb2tlbiB1cCB3aXRoIHdoaXRlc3BhY2UgW3RleHQgYmxvY2tdKGxpbmsgYmxvY2spJ10gfSwgXCJbezB9IHdvcmtzcGFjZSBzZXR0aW5nc10oezF9KSBhcmUgbm90IGFwcGxpZWRcIiwgbnVtU2V0dGluZ3MsICdjb21tYW5kOnNldHRpbmdzLmZpbHRlclVudHJ1c3RlZCcpIDogbG9jYWxpemUoJ25vIHVudHJ1c3RlZFNldHRpbmdzJywgXCJXb3Jrc3BhY2Ugc2V0dGluZ3MgcmVxdWlyaW5nIHRydXN0IGFyZSBub3QgYXBwbGllZFwiKSksXG5cdFx0XHRcdGZpeEJhZExvY2FsaXplZExpbmtzKGxvY2FsaXplKHsga2V5OiAndW50cnVzdGVkRXh0ZW5zaW9ucycsIGNvbW1lbnQ6IFsnUGxlYXNlIGVuc3VyZSB0aGUgbWFya2Rvd24gbGluayBzeW50YXggaXMgbm90IGJyb2tlbiB1cCB3aXRoIHdoaXRlc3BhY2UgW3RleHQgYmxvY2tdKGxpbmsgYmxvY2spJ10gfSwgXCJbezB9IGV4dGVuc2lvbnNdKHsxfSkgYXJlIGRpc2FibGVkIG9yIGhhdmUgbGltaXRlZCBmdW5jdGlvbmFsaXR5XCIsIG51bUV4dGVuc2lvbnMsIGBjb21tYW5kOiR7TElTVF9XT1JLU1BBQ0VfVU5TVVBQT1JURURfRVhURU5TSU9OU19DT01NQU5EX0lEfWApKVxuXHRcdFx0XTtcblx0XHR0aGlzLnJlbmRlckxpbWl0YXRpb25zTGlzdEVsZW1lbnQodGhpcy51bnRydXN0ZWRDb250YWluZXIsIHVudHJ1c3RlZENvbnRhaW5lckl0ZW1zLCBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheSh4TGlzdEljb24pKTtcblxuXHRcdGlmICh0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpIHtcblx0XHRcdGlmICh0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuY2FuU2V0V29ya3NwYWNlVHJ1c3QoKSkge1xuXHRcdFx0XHR0aGlzLmFkZERvbnRUcnVzdEJ1dHRvblRvRWxlbWVudCh0aGlzLnVudHJ1c3RlZENvbnRhaW5lcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmFkZFRydXN0ZWRUZXh0VG9FbGVtZW50KHRoaXMudW50cnVzdGVkQ29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5jYW5TZXRXb3Jrc3BhY2VUcnVzdCgpKSB7XG5cdFx0XHRcdHRoaXMuYWRkVHJ1c3RCdXR0b25Ub0VsZW1lbnQodGhpcy50cnVzdGVkQ29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUJ1dHRvblJvdyhwYXJlbnQ6IEhUTUxFbGVtZW50LCBidXR0b25JbmZvOiB7IGFjdGlvbjogQWN0aW9uOyBrZXliaW5kaW5nOiBSZXNvbHZlZEtleWJpbmRpbmcgfVtdLCBlbmFibGVkPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGJ1dHRvblJvdyA9IGFwcGVuZChwYXJlbnQsICQoJy53b3Jrc3BhY2UtdHJ1c3QtYnV0dG9ucy1yb3cnKSk7XG5cdFx0Y29uc3QgYnV0dG9uQ29udGFpbmVyID0gYXBwZW5kKGJ1dHRvblJvdywgJCgnLndvcmtzcGFjZS10cnVzdC1idXR0b25zJykpO1xuXHRcdGNvbnN0IGJ1dHRvbkJhciA9IHRoaXMucmVyZW5kZXJEaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbkJhcihidXR0b25Db250YWluZXIpKTtcblxuXHRcdGZvciAoY29uc3QgeyBhY3Rpb24sIGtleWJpbmRpbmcgfSBvZiBidXR0b25JbmZvKSB7XG5cdFx0XHRjb25zdCBidXR0b24gPSBidXR0b25CYXIuYWRkQnV0dG9uV2l0aERlc2NyaXB0aW9uKGRlZmF1bHRCdXR0b25TdHlsZXMpO1xuXG5cdFx0XHRidXR0b24ubGFiZWwgPSBhY3Rpb24ubGFiZWw7XG5cdFx0XHRidXR0b24uZW5hYmxlZCA9IGVuYWJsZWQgIT09IHVuZGVmaW5lZCA/IGVuYWJsZWQgOiBhY3Rpb24uZW5hYmxlZDtcblx0XHRcdGJ1dHRvbi5kZXNjcmlwdGlvbiA9IGtleWJpbmRpbmcuZ2V0TGFiZWwoKSE7XG5cdFx0XHRidXR0b24uZWxlbWVudC5hcmlhTGFiZWwgPSBhY3Rpb24ubGFiZWwgKyAnLCAnICsgbG9jYWxpemUoJ2tleWJvYXJkU2hvcnRjdXQnLCBcIktleWJvYXJkIFNob3J0Y3V0OiB7MH1cIiwga2V5YmluZGluZy5nZXRBcmlhTGFiZWwoKSEpO1xuXG5cdFx0XHR0aGlzLnJlcmVuZGVyRGlzcG9zYWJsZXMuYWRkKGJ1dHRvbi5vbkRpZENsaWNrKGUgPT4ge1xuXHRcdFx0XHRpZiAoZSkge1xuXHRcdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhY3Rpb24ucnVuKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhZGRUcnVzdEJ1dHRvblRvRWxlbWVudChwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgdHJ1c3RBY3Rpb24gPSB0aGlzLnJlcmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oJ3dvcmtzcGFjZS50cnVzdC5idXR0b24uYWN0aW9uLmdyYW50JywgbG9jYWxpemUoJ3RydXN0QnV0dG9uJywgXCJUcnVzdFwiKSwgdW5kZWZpbmVkLCB0cnVlLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uuc2V0V29ya3NwYWNlVHJ1c3QodHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdHJ1c3RBY3Rpb25zID0gW3sgYWN0aW9uOiB0cnVzdEFjdGlvbiwga2V5YmluZGluZzogdGhpcy5rZXliaW5kaW5nU2VydmljZS5yZXNvbHZlVXNlckJpbmRpbmcoaXNNYWNpbnRvc2ggPyAnQ21kK0VudGVyJyA6ICdDdHJsK0VudGVyJylbMF0gfV07XG5cblx0XHR0aGlzLmNyZWF0ZUJ1dHRvblJvdyhwYXJlbnQsIHRydXN0QWN0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFkZERvbnRUcnVzdEJ1dHRvblRvRWxlbWVudChwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5jcmVhdGVCdXR0b25Sb3cocGFyZW50LCBbe1xuXHRcdFx0YWN0aW9uOiB0aGlzLnJlcmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oJ3dvcmtzcGFjZS50cnVzdC5idXR0b24uYWN0aW9uLmRlbnknLCBsb2NhbGl6ZSgnZG9udFRydXN0QnV0dG9uJywgXCJEb24ndCBUcnVzdFwiKSwgdW5kZWZpbmVkLCB0cnVlLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5zZXRXb3Jrc3BhY2VUcnVzdChmYWxzZSk7XG5cdFx0XHR9KSksXG5cdFx0XHRrZXliaW5kaW5nOiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLnJlc29sdmVVc2VyQmluZGluZyhpc01hY2ludG9zaCA/ICdDbWQrRW50ZXInIDogJ0N0cmwrRW50ZXInKVswXVxuXHRcdH1dKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkVHJ1c3RlZFRleHRUb0VsZW1lbnQocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0RWxlbWVudCA9IGFwcGVuZChwYXJlbnQsICQoJy53b3Jrc3BhY2UtdHJ1c3QtdW50cnVzdGVkLWRlc2NyaXB0aW9uJykpO1xuXHRcdGlmICghdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RGb3JjZWQoKSkge1xuXHRcdFx0dGV4dEVsZW1lbnQuaW5uZXJUZXh0ID0gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSA/IGxvY2FsaXplKCd1bnRydXN0ZWRXb3Jrc3BhY2VSZWFzb24nLCBcIlRoaXMgd29ya3NwYWNlIGlzIHRydXN0ZWQgdmlhIHRoZSBib2xkZWQgZW50cmllcyBpbiB0aGUgdHJ1c3RlZCBmb2xkZXJzIGJlbG93LlwiKSA6IGxvY2FsaXplKCd1bnRydXN0ZWRGb2xkZXJSZWFzb24nLCBcIlRoaXMgZm9sZGVyIGlzIHRydXN0ZWQgdmlhIHRoZSBib2xkZWQgZW50cmllcyBpbiB0aGUgdHJ1c3RlZCBmb2xkZXJzIGJlbG93LlwiKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGV4dEVsZW1lbnQuaW5uZXJUZXh0ID0gbG9jYWxpemUoJ3RydXN0ZWRGb3JjZWRSZWFzb24nLCBcIlRoaXMgd2luZG93IGlzIHRydXN0ZWQgYnkgbmF0dXJlIG9mIHRoZSB3b3Jrc3BhY2UgdGhhdCBpcyBvcGVuZWQuXCIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTGltaXRhdGlvbnNIZWFkZXJFbGVtZW50KHBhcmVudDogSFRNTEVsZW1lbnQsIGhlYWRlclRleHQ6IHN0cmluZywgc3VidGl0bGVUZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBsaW1pdGF0aW9uc0hlYWRlckNvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy53b3Jrc3BhY2UtdHJ1c3QtbGltaXRhdGlvbnMtaGVhZGVyJykpO1xuXHRcdGNvbnN0IHRpdGxlRWxlbWVudCA9IGFwcGVuZChsaW1pdGF0aW9uc0hlYWRlckNvbnRhaW5lciwgJCgnLndvcmtzcGFjZS10cnVzdC1saW1pdGF0aW9ucy10aXRsZScpKTtcblx0XHRjb25zdCB0ZXh0RWxlbWVudCA9IGFwcGVuZCh0aXRsZUVsZW1lbnQsICQoJy53b3Jrc3BhY2UtdHJ1c3QtbGltaXRhdGlvbnMtdGl0bGUtdGV4dCcpKTtcblx0XHRjb25zdCBzdWJ0aXRsZUVsZW1lbnQgPSBhcHBlbmQobGltaXRhdGlvbnNIZWFkZXJDb250YWluZXIsICQoJy53b3Jrc3BhY2UtdHJ1c3QtbGltaXRhdGlvbnMtc3VidGl0bGUnKSk7XG5cblx0XHR0ZXh0RWxlbWVudC5pbm5lclRleHQgPSBoZWFkZXJUZXh0O1xuXHRcdHN1YnRpdGxlRWxlbWVudC5pbm5lclRleHQgPSBzdWJ0aXRsZVRleHQ7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckxpbWl0YXRpb25zTGlzdEVsZW1lbnQocGFyZW50OiBIVE1MRWxlbWVudCwgbGltaXRhdGlvbnM6IHN0cmluZ1tdLCBpY29uQ2xhc3NOYW1lczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRjb25zdCBsaXN0Q29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLndvcmtzcGFjZS10cnVzdC1saW1pdGF0aW9ucy1saXN0LWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBsaW1pdGF0aW9uc0xpc3QgPSBhcHBlbmQobGlzdENvbnRhaW5lciwgJCgndWwnKSk7XG5cdFx0Zm9yIChjb25zdCBsaW1pdGF0aW9uIG9mIGxpbWl0YXRpb25zKSB7XG5cdFx0XHRjb25zdCBsaW1pdGF0aW9uTGlzdEl0ZW0gPSBhcHBlbmQobGltaXRhdGlvbnNMaXN0LCAkKCdsaScpKTtcblx0XHRcdGNvbnN0IGljb24gPSBhcHBlbmQobGltaXRhdGlvbkxpc3RJdGVtLCAkKCcubGlzdC1pdGVtLWljb24nKSk7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYXBwZW5kKGxpbWl0YXRpb25MaXN0SXRlbSwgJCgnLmxpc3QtaXRlbS10ZXh0JykpO1xuXG5cdFx0XHRpY29uLmNsYXNzTGlzdC5hZGQoLi4uaWNvbkNsYXNzTmFtZXMpO1xuXG5cdFx0XHRjb25zdCBsaW5rZWRUZXh0ID0gcGFyc2VMaW5rZWRUZXh0KGxpbWl0YXRpb24pO1xuXHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIGxpbmtlZFRleHQubm9kZXMpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBub2RlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGFwcGVuZCh0ZXh0LCBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShub2RlKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5yZXJlbmRlckRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExpbmssIHRleHQsIHsgLi4ubm9kZSwgdGFiSW5kZXg6IC0xIH0sIHt9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxheW91dFBhcnRpY2lwYW50czogeyBsYXlvdXQ6ICgpID0+IHZvaWQgfVtdID0gW107XG5cdGxheW91dChkaW1lbnNpb246IERpbWVuc2lvbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMud29ya3NwYWNlVHJ1c3RlZFVyaXNUYWJsZS5sYXlvdXQoKTtcblxuXHRcdHRoaXMubGF5b3V0UGFydGljaXBhbnRzLmZvckVhY2gocGFydGljaXBhbnQgPT4ge1xuXHRcdFx0cGFydGljaXBhbnQubGF5b3V0KCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLmJvZHlTY3JvbGxCYXIuc2NhbkRvbU5vZGUoKTtcblx0fVxufVxuXG4vLyBIaWdobHkgc2NvcGVkIGZpeCBmb3IgIzEyNjYxNFxuZnVuY3Rpb24gZml4QmFkTG9jYWxpemVkTGlua3MoYmFkU3RyaW5nOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCByZWdleCA9IC8oLiopXFxbKC4rKVxcXVxccypcXCgoLispXFwpKC4qKS87IC8vIG1hcmtkb3duIGxpbmsgbWF0Y2ggd2l0aCBzcGFjZXNcblx0cmV0dXJuIGJhZFN0cmluZy5yZXBsYWNlKHJlZ2V4LCAnJDFbJDJdKCQzKSQ0Jyk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsR0FBRyx1QkFBdUIsK0JBQStCLFFBQVEsV0FBc0IsYUFBYSxXQUFXLGlDQUFpQztBQUN6SixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGlCQUFpQjtBQUMxQixTQUFtQixVQUFVLG1CQUFtQjtBQUNoRCxTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLGNBQXVCO0FBRWhDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUFvQixrQkFBMEM7QUFDdkUsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CLDBCQUEwQjtBQUN0RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWUsa0JBQWtCLDJCQUEyQiw2QkFBNkI7QUFDbEcsU0FBUywwQkFBMEIsc0JBQXNCO0FBQ3pELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCLHdEQUF3RDtBQUM5RixTQUFTLG9CQUFvQixzQ0FBc0M7QUFDbkUsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUywyQkFBMkI7QUFHcEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxpQkFBaUIsNENBQTRDO0FBQ3RFLFNBQVMsT0FBTyxhQUFhO0FBQzdCLFNBQVMsZ0JBQWdCLGlCQUFpQjtBQUMxQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywwQkFBMEI7QUFJNUIsTUFBTSxhQUFhLGFBQWEsMEJBQTBCLFFBQVEsUUFBUSxTQUFTLGNBQWMsMENBQTBDLENBQUM7QUFFbkosTUFBTSxnQkFBZ0IsYUFBYSxnQ0FBZ0MsUUFBUSxPQUFPLFNBQVMsaUJBQWlCLHVEQUF1RCxDQUFDO0FBQ3BLLE1BQU0sWUFBWSxhQUFhLGdDQUFnQyxRQUFRLEdBQUcsU0FBUyxhQUFhLG1EQUFtRCxDQUFDO0FBQ3BKLE1BQU0sbUJBQW1CLGFBQWEsd0NBQXdDLFFBQVEsUUFBUSxTQUFTLG9CQUFvQiw4REFBOEQsQ0FBQztBQUMxTCxNQUFNLFdBQVcsYUFBYSxzQ0FBc0MsUUFBUSxNQUFNLFNBQVMsWUFBWSw4REFBOEQsQ0FBQztBQUN0SyxNQUFNLGFBQWEsYUFBYSx3Q0FBd0MsUUFBUSxPQUFPLFNBQVMsY0FBYyxnRUFBZ0UsQ0FBQztBQU8vSyxJQUFNLDRCQUFOLGNBQXdDLFdBQVc7QUFBQSxFQWlCbEQsWUFDa0IsV0FDdUIsc0JBQ0csa0JBQ1EsaUNBQ2IsWUFDTixjQUNLLG1CQUNwQztBQUNELFVBQU07QUFSVztBQUN1QjtBQUNHO0FBQ1E7QUFDYjtBQUNOO0FBQ0s7QUF2QnRDLFNBQWlCLG1CQUE2QyxLQUFLLFVBQVUsSUFBSSxRQUF5QixDQUFDO0FBQzNHLFNBQVMsa0JBQTBDLEtBQUssaUJBQWlCO0FBRXpFLFNBQWlCLG1CQUE2QyxLQUFLLFVBQVUsSUFBSSxRQUF5QixDQUFDO0FBQzNHLFNBQVMsa0JBQTBDLEtBQUssaUJBQWlCO0FBRXpFLFNBQVEsVUFBb0MsS0FBSyxVQUFVLElBQUksUUFBeUIsQ0FBQztBQUN6RixTQUFTLFNBQWlDLEtBQUssUUFBUTtBQUV2RCxTQUFRLFlBQXNDLEtBQUssVUFBVSxJQUFJLFFBQXlCLENBQUM7QUFDM0YsU0FBUyxXQUFtQyxLQUFLLFVBQVU7QUFpQjFELFNBQUsscUJBQXFCLFVBQVUsWUFBWSxFQUFFLHdDQUF3QyxDQUFDO0FBQzNGLFVBQU0sZUFBZSxVQUFVLFlBQVksRUFBRSxxQkFBcUIsQ0FBQztBQUNuRSxVQUFNLHNCQUFzQixVQUFVLFlBQVksRUFBRSwwQkFBMEIsQ0FBQztBQUUvRSxTQUFLLFFBQVEsS0FBSyxxQkFBcUI7QUFBQSxNQUN0QztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxJQUFJLCtCQUErQjtBQUFBLE1BQ25DO0FBQUEsUUFDQztBQUFBLFVBQ0MsT0FBTyxTQUFTLG1CQUFtQixNQUFNO0FBQUEsVUFDekMsU0FBUztBQUFBLFVBQ1QsUUFBUTtBQUFBLFVBQ1IsWUFBWSw2QkFBNkI7QUFBQSxVQUN6QyxRQUFRLEtBQXVDO0FBQUUsbUJBQU87QUFBQSxVQUFLO0FBQUEsUUFDOUQ7QUFBQSxRQUNBO0FBQUEsVUFDQyxPQUFPLFNBQVMsbUJBQW1CLE1BQU07QUFBQSxVQUN6QyxTQUFTO0FBQUEsVUFDVCxRQUFRO0FBQUEsVUFDUixZQUFZLDZCQUE2QjtBQUFBLFVBQ3pDLFFBQVEsS0FBdUM7QUFBRSxtQkFBTztBQUFBLFVBQUs7QUFBQSxRQUM5RDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE9BQU87QUFBQSxVQUNQLFNBQVM7QUFBQSxVQUNULFFBQVE7QUFBQSxVQUNSLGNBQWM7QUFBQSxVQUNkLGNBQWM7QUFBQSxVQUNkLFlBQVksZ0NBQWdDO0FBQUEsVUFDNUMsUUFBUSxLQUF1QztBQUFFLG1CQUFPO0FBQUEsVUFBSztBQUFBLFFBQzlEO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLEtBQUsscUJBQXFCLGVBQWUsNEJBQTRCO0FBQUEsUUFDckUsS0FBSyxxQkFBcUIsZUFBZSw4QkFBOEIsSUFBSTtBQUFBLFFBQzNFLEtBQUsscUJBQXFCLGVBQWUsaUNBQWlDLE1BQU0sS0FBSyxtQkFBbUI7QUFBQSxNQUN6RztBQUFBLE1BQ0E7QUFBQSxRQUNDLHFCQUFxQjtBQUFBLFFBQ3JCLHlCQUF5QjtBQUFBLFFBQ3pCLG1CQUFtQjtBQUFBLFFBQ25CLDBCQUEwQjtBQUFBLFFBQzFCLHVCQUF1QjtBQUFBLFVBQ3RCLGNBQWMsQ0FBQyxTQUEwQjtBQUN4QyxrQkFBTSxZQUFZLGFBQWEsS0FBSyxjQUFjLElBQUk7QUFDdEQsZ0JBQUksY0FBYyxVQUFhLFVBQVUsV0FBVyxHQUFHO0FBQ3RELHFCQUFPLFNBQVMsMEJBQTBCLGdCQUFnQixLQUFLLGFBQWEsWUFBWSxLQUFLLEdBQUcsQ0FBQztBQUFBLFlBQ2xHO0FBRUEsbUJBQU8sU0FBUyxrQ0FBa0MsdUJBQXVCLEtBQUssYUFBYSxZQUFZLEtBQUssR0FBRyxHQUFHLFNBQVM7QUFBQSxVQUM1SDtBQUFBLFVBQ0Esb0JBQW9CLE1BQU0sU0FBUywrQkFBK0IsOEJBQThCO0FBQUEsUUFDakc7QUFBQSxRQUNBLGtCQUFrQjtBQUFBLFVBQ2pCLE1BQU0sU0FBMEI7QUFDL0IsbUJBQU8sUUFBUSxJQUFJLFNBQVM7QUFBQSxVQUM3QjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFNBQUssVUFBVSxLQUFLLE1BQU0sVUFBVSxVQUFRO0FBRTNDLFVBQUksUUFBUSxLQUFLLFdBQVcsQ0FBQyxLQUFLLGNBQWMsa0JBQWtCO0FBQ2pFLGFBQUssS0FBSyxLQUFLLFNBQVMsSUFBSTtBQUFBLE1BQzdCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLFlBQVksS0FBSyxVQUFVLElBQUksVUFBVSxtQkFBbUIsQ0FBQztBQUNuRSxVQUFNLFlBQVksS0FBSyxVQUFVLFVBQVUsVUFBVSxFQUFFLE9BQU8sU0FBUyxhQUFhLFlBQVksR0FBRyxHQUFHLG9CQUFvQixDQUFDLENBQUM7QUFDNUgsY0FBVSxRQUFRLFNBQVMsYUFBYSxZQUFZO0FBRXBELFNBQUssVUFBVSxVQUFVLFdBQVcsWUFBWTtBQUMvQyxZQUFNLE1BQU0sTUFBTSxLQUFLLGtCQUFrQixlQUFlO0FBQUEsUUFDdkQsZ0JBQWdCO0FBQUEsUUFDaEIsa0JBQWtCO0FBQUEsUUFDbEIsZUFBZTtBQUFBLFFBQ2YsWUFBWSxLQUFLO0FBQUEsUUFDakIsV0FBVyxTQUFTLFlBQVksY0FBYztBQUFBLFFBQzlDLE9BQU8sU0FBUyxvQkFBb0Isd0JBQXdCO0FBQUEsTUFDN0QsQ0FBQztBQUVELFVBQUksS0FBSztBQUNSLGFBQUssZ0NBQWdDLGFBQWEsS0FBSyxJQUFJO0FBQUEsTUFDNUQ7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLGdDQUFnQywwQkFBMEIsTUFBTTtBQUNuRixXQUFLLFlBQVk7QUFBQSxJQUNsQixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSwwQkFBMEIsTUFBK0I7QUFDaEUsVUFBTSxRQUFRLEtBQUssa0JBQWtCLFFBQVEsSUFBSTtBQUNqRCxRQUFJLFVBQVUsSUFBSTtBQUNqQixlQUFTLElBQUksR0FBRyxJQUFJLEtBQUssa0JBQWtCLFFBQVEsS0FBSztBQUN2RCxZQUFJLEtBQUssa0JBQWtCLENBQUMsRUFBRSxRQUFRLEtBQUssS0FBSztBQUMvQyxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxzQkFBc0IsTUFBdUIsUUFBaUIsTUFBWTtBQUNqRixVQUFNLFFBQVEsS0FBSywwQkFBMEIsSUFBSTtBQUNqRCxRQUFJLFVBQVUsSUFBSTtBQUNqQixVQUFJLE9BQU87QUFDVixhQUFLLE1BQU0sU0FBUztBQUNwQixhQUFLLE1BQU0sU0FBUyxDQUFDLEtBQUssQ0FBQztBQUFBLE1BQzVCO0FBQ0EsV0FBSyxNQUFNLGFBQWEsQ0FBQyxLQUFLLENBQUM7QUFBQSxJQUNoQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQVksc0JBQTJCO0FBQ3RDLFdBQU8sS0FBSyxpQkFBaUIsYUFBYSxFQUFFLFFBQVEsQ0FBQyxHQUFHLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxFQUM1RTtBQUFBLEVBRUEsSUFBWSxvQkFBdUM7QUFDbEQsVUFBTSxtQkFBbUIsS0FBSyxpQkFBaUIsYUFBYTtBQUM1RCxVQUFNLHVCQUF1QixpQkFBaUIsUUFBUSxJQUFJLFlBQVUsT0FBTyxHQUFHO0FBQzlFLFFBQUksaUJBQWlCLGVBQWU7QUFDbkMsMkJBQXFCLEtBQUssaUJBQWlCLGFBQWE7QUFBQSxJQUN6RDtBQUVBLFVBQU0sVUFBVSxLQUFLLGdDQUFnQyxlQUFlLEVBQUUsSUFBSSxTQUFPO0FBRWhGLFVBQUksNEJBQTRCO0FBQ2hDLGlCQUFXLGdCQUFnQixzQkFBc0I7QUFDaEQsb0NBQTRCLDZCQUE2QixLQUFLLFdBQVcsT0FBTyxnQkFBZ0IsY0FBYyxHQUFHO0FBQUEsTUFDbEg7QUFFQSxhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0EsdUJBQXVCO0FBQUEsTUFDeEI7QUFBQSxJQUNELENBQUM7QUFHRCxVQUFNLGdCQUFnQixRQUFRLEtBQUssQ0FBQyxHQUFHLE1BQU07QUFDNUMsVUFBSSxFQUFFLElBQUksV0FBVyxFQUFFLElBQUksUUFBUTtBQUNsQyxZQUFJLEVBQUUsSUFBSSxXQUFXLFFBQVEsTUFBTTtBQUNsQyxpQkFBTztBQUFBLFFBQ1I7QUFFQSxZQUFJLEVBQUUsSUFBSSxXQUFXLFFBQVEsTUFBTTtBQUNsQyxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBRUEsWUFBTSxlQUFlLEVBQUUsSUFBSSxLQUFLLFNBQVMsaUJBQWlCO0FBQzFELFlBQU0sZUFBZSxFQUFFLElBQUksS0FBSyxTQUFTLGlCQUFpQjtBQUUxRCxVQUFJLGlCQUFpQixjQUFjO0FBQ2xDLFlBQUksY0FBYztBQUNqQixpQkFBTztBQUFBLFFBQ1I7QUFFQSxZQUFJLGNBQWM7QUFDakIsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUVBLGFBQU8sRUFBRSxJQUFJLE9BQU8sY0FBYyxFQUFFLElBQUksTUFBTTtBQUFBLElBQy9DLENBQUM7QUFFRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsU0FBZTtBQUNkLFNBQUssTUFBTSxPQUFRLEtBQUssa0JBQWtCLFNBQVMsK0JBQStCLGFBQWMsK0JBQStCLG1CQUFtQixNQUFTO0FBQUEsRUFDNUo7QUFBQSxFQUVBLGNBQW9CO0FBQ25CLFVBQU0sVUFBVSxLQUFLO0FBQ3JCLFNBQUssVUFBVSxVQUFVLE9BQU8sU0FBUyxRQUFRLFdBQVcsQ0FBQztBQUU3RCxTQUFLLG1CQUFtQixZQUFZLFFBQVEsU0FDM0MsU0FBUyw2QkFBNkIseUVBQXlFLElBQy9HLFNBQVMsZ0NBQWdDLHlEQUF5RDtBQUVuRyxTQUFLLE1BQU0sT0FBTyxHQUFHLE9BQU8sbUJBQW1CLEtBQUssaUJBQWlCO0FBQ3JFLFNBQUssT0FBTztBQUFBLEVBQ2I7QUFBQSxFQUVBLFlBQVksTUFBYyxNQUF5QztBQUNsRSxRQUFJLENBQUMsTUFBTTtBQUNWLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxLQUFLLElBQUksV0FBVyxjQUFjO0FBQ3JDLFlBQU0sV0FBVyxLQUFLLE1BQU0sTUFBTSxHQUFHLEVBQUUsT0FBTyxPQUFLLEVBQUUsTUFBTTtBQUMzRCxVQUFJLFNBQVMsV0FBVyxLQUFLLEtBQUssV0FBVyxNQUFNLEdBQUcsR0FBRztBQUN4RCxlQUFPO0FBQUEsVUFDTixNQUFNLFlBQVk7QUFBQSxVQUNsQixTQUFTLFNBQVMsRUFBRSxLQUFLLFlBQVksU0FBUyxDQUFDLDREQUE0RCxFQUFFLEdBQUcsMkNBQTJDLGFBQWEsS0FBSyxjQUFjLElBQUksQ0FBQztBQUFBLFFBQ2pNO0FBQUEsTUFDRDtBQUVBLFVBQUksU0FBUyxXQUFXLEdBQUc7QUFDMUIsZUFBTztBQUFBLFVBQ04sTUFBTSxZQUFZO0FBQUEsVUFDbEIsU0FBUyxTQUFTLEVBQUUsS0FBSyxZQUFZLFNBQVMsQ0FBQyxpREFBaUQsNERBQTRELEVBQUUsR0FBRyxpRUFBaUUsU0FBUyxDQUFDLEdBQUcsYUFBYSxLQUFLLGNBQWMsSUFBSSxDQUFDO0FBQUEsUUFDclI7QUFBQSxNQUNEO0FBRUEsVUFBSSxTQUFTLFNBQVMsR0FBRztBQUN4QixlQUFPO0FBQUEsVUFDTixNQUFNLFlBQVk7QUFBQSxVQUNsQixTQUFTLFNBQVMsZ0JBQWdCLDREQUE0RCxJQUFJO0FBQUEsUUFDbkc7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxXQUFXLE1BQXVCLEtBQVU7QUFDM0MsVUFBTSxpQkFBaUIsS0FBSyxnQ0FBZ0MsZUFBZTtBQUMzRSxVQUFNLFFBQVEsZUFBZSxVQUFVLE9BQUssS0FBSyxXQUFXLE9BQU8sUUFBUSxHQUFHLEtBQUssR0FBRyxDQUFDO0FBRXZGLFFBQUksU0FBUyxlQUFlLFVBQVUsVUFBVSxJQUFJO0FBQ25ELHFCQUFlLEtBQUssR0FBRztBQUFBLElBQ3hCLE9BQU87QUFDTixxQkFBZSxLQUFLLElBQUk7QUFBQSxJQUN6QjtBQUVBLFNBQUssZ0NBQWdDLGVBQWUsY0FBYztBQUNsRSxTQUFLLGlCQUFpQixLQUFLLElBQUk7QUFBQSxFQUNoQztBQUFBLEVBRUEsV0FBVyxNQUF1QjtBQUNqQyxTQUFLLGlCQUFpQixLQUFLLElBQUk7QUFBQSxFQUNoQztBQUFBLEVBRUEsTUFBTSxPQUFPLE1BQXVCO0FBQ25DLFNBQUssTUFBTSxVQUFVO0FBQ3JCLFVBQU0sS0FBSyxnQ0FBZ0MsYUFBYSxDQUFDLEtBQUssR0FBRyxHQUFHLEtBQUs7QUFFekUsUUFBSSxLQUFLLE1BQU0sU0FBUyxFQUFFLFdBQVcsR0FBRztBQUN2QyxXQUFLLE1BQU0sVUFBVTtBQUFBLElBQ3RCO0FBQ0EsU0FBSyxVQUFVLEtBQUssSUFBSTtBQUN4QixTQUFLLE1BQU0sU0FBUztBQUFBLEVBQ3JCO0FBQUEsRUFFQSxNQUFNLEtBQUssTUFBdUIscUJBQStCO0FBQ2hFLFVBQU0sbUJBQW1CLEtBQUssSUFBSSxXQUFXLFFBQVEsUUFFbkQsS0FBSyxJQUFJLFdBQVcsS0FBSyxvQkFBb0IsVUFDN0MsS0FBSyxXQUFXLE9BQU8saUJBQWlCLEtBQUssb0JBQW9CLFdBQVcsS0FBSyxJQUFJLFNBQVMsS0FDOUYsQ0FBQyxrQkFBa0IsS0FBSyxHQUFHO0FBRTdCLFFBQUksb0JBQW9CLHFCQUFxQjtBQUM1QyxZQUFNLE1BQU0sTUFBTSxLQUFLLGtCQUFrQixlQUFlO0FBQUEsUUFDdkQsZ0JBQWdCO0FBQUEsUUFDaEIsa0JBQWtCO0FBQUEsUUFDbEIsZUFBZTtBQUFBLFFBQ2YsWUFBWSxLQUFLO0FBQUEsUUFDakIsV0FBVyxTQUFTLFlBQVksY0FBYztBQUFBLFFBQzlDLE9BQU8sU0FBUyxvQkFBb0Isd0JBQXdCO0FBQUEsTUFDN0QsQ0FBQztBQUVELFVBQUksS0FBSztBQUNSLGFBQUssV0FBVyxNQUFNLElBQUksQ0FBQyxDQUFDO0FBQUEsTUFDN0IsT0FBTztBQUNOLGFBQUssV0FBVyxJQUFJO0FBQUEsTUFDckI7QUFBQSxJQUNELE9BQU87QUFDTixXQUFLLHNCQUFzQixJQUFJO0FBQy9CLFdBQUssUUFBUSxLQUFLLElBQUk7QUFBQSxJQUN2QjtBQUFBLEVBQ0Q7QUFDRDtBQWpUTSw0QkFBTjtBQUFBLEVBbUJHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXhCRztBQW1UTixNQUFNLGtDQUFOLE1BQU0sZ0NBQWlGO0FBQUEsRUFBdkY7QUFHQyxTQUFTLGtCQUFrQixnQ0FBK0I7QUFBQTtBQUFBLEVBQzFELFVBQVUsTUFBdUI7QUFDaEMsV0FBTyxnQ0FBK0I7QUFBQSxFQUN2QztBQUNEO0FBUE0sZ0NBQ1csb0JBQW9CO0FBRC9CLGdDQUVXLGFBQWE7QUFGOUIsSUFBTSxpQ0FBTjtBQWFBLElBQU0sa0NBQU4sTUFBNkc7QUFBQSxFQU01RyxZQUNrQixPQUNBLHFCQUNxQixZQUFpQztBQUZ0RDtBQUNBO0FBQ3FCO0FBTHZDLFNBQVMsYUFBcUIsZ0NBQWdDO0FBQUEsRUFLWTtBQUFBLEVBRTFFLGVBQWUsV0FBb0Q7QUFDbEUsVUFBTSxVQUFVLFVBQVUsWUFBWSxFQUFFLFVBQVUsQ0FBQztBQUNuRCxVQUFNLFlBQVksSUFBSSxVQUFVLE9BQU87QUFDdkMsV0FBTyxFQUFFLFVBQVU7QUFBQSxFQUNwQjtBQUFBLEVBRUEsY0FBYyxNQUF1QixPQUFlLGNBQWdEO0FBQ25HLGlCQUFhLFVBQVUsTUFBTTtBQUU3QixVQUFNLG1CQUFtQixLQUFLLElBQUksV0FBVyxRQUFRLFFBRW5ELEtBQUssSUFBSSxXQUFXLEtBQUssb0JBQW9CLFVBQzdDLEtBQUssV0FBVyxPQUFPLGlCQUFpQixLQUFLLG9CQUFvQixXQUFXLEtBQUssSUFBSSxTQUFTLEtBQzlGLENBQUMsa0JBQWtCLEtBQUssR0FBRztBQUc3QixVQUFNLFVBQXFCLENBQUM7QUFDNUIsUUFBSSxrQkFBa0I7QUFDckIsY0FBUSxLQUFLLEtBQUssbUJBQW1CLElBQUksQ0FBQztBQUFBLElBQzNDO0FBQ0EsWUFBUSxLQUFLLEtBQUssaUJBQWlCLElBQUksQ0FBQztBQUN4QyxZQUFRLEtBQUssS0FBSyxtQkFBbUIsSUFBSSxDQUFDO0FBQzFDLGlCQUFhLFVBQVUsS0FBSyxTQUFTLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFBQSxFQUNwRDtBQUFBLEVBRVEsaUJBQWlCLE1BQWdDO0FBQ3hELFdBQU87QUFBQSxNQUNOLE9BQU87QUFBQSxNQUNQLE9BQU8sVUFBVSxZQUFZLFFBQVE7QUFBQSxNQUNyQyxTQUFTO0FBQUEsTUFDVCxJQUFJO0FBQUEsTUFDSixTQUFTLFNBQVMsa0JBQWtCLFdBQVc7QUFBQSxNQUMvQyxLQUFLLE1BQU07QUFDVixhQUFLLE1BQU0sS0FBSyxNQUFNLEtBQUs7QUFBQSxNQUM1QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxtQkFBbUIsTUFBZ0M7QUFDMUQsV0FBTztBQUFBLE1BQ04sT0FBTztBQUFBLE1BQ1AsT0FBTyxVQUFVLFlBQVksZ0JBQWdCO0FBQUEsTUFDN0MsU0FBUztBQUFBLE1BQ1QsSUFBSTtBQUFBLE1BQ0osU0FBUyxTQUFTLG9CQUFvQixrQkFBa0I7QUFBQSxNQUN4RCxLQUFLLE1BQU07QUFDVixhQUFLLE1BQU0sS0FBSyxNQUFNLElBQUk7QUFBQSxNQUMzQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxtQkFBbUIsTUFBZ0M7QUFDMUQsV0FBTztBQUFBLE1BQ04sT0FBTztBQUFBLE1BQ1AsT0FBTyxVQUFVLFlBQVksVUFBVTtBQUFBLE1BQ3ZDLFNBQVM7QUFBQSxNQUNULElBQUk7QUFBQSxNQUNKLFNBQVMsU0FBUyxvQkFBb0IsYUFBYTtBQUFBLE1BQ25ELEtBQUssWUFBWTtBQUNoQixjQUFNLEtBQUssTUFBTSxPQUFPLElBQUk7QUFBQSxNQUM3QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxnQkFBZ0IsY0FBZ0Q7QUFDL0QsaUJBQWEsVUFBVSxRQUFRO0FBQUEsRUFDaEM7QUFFRDtBQS9FTSxnQ0FFVyxjQUFjO0FBRnpCLGtDQUFOO0FBQUEsRUFTRztBQUFBLEdBVEc7QUF5Rk4sSUFBTSwrQkFBTixNQUFpSDtBQUFBLEVBTWhILFlBQ2tCLE9BQ3FCLG9CQUNyQztBQUZnQjtBQUNxQjtBQUx2QyxTQUFTLGFBQXFCLDZCQUE2QjtBQUFBLEVBTzNEO0FBQUEsRUFFQSxlQUFlLFdBQTJEO0FBQ3pFLFVBQU0sVUFBVSxVQUFVLFlBQVksRUFBRSxPQUFPLENBQUM7QUFDaEQsVUFBTSxZQUFZLFFBQVEsWUFBWSxFQUFFLGdCQUFnQixDQUFDO0FBRXpELFVBQU0sWUFBWSxJQUFJLFNBQVMsU0FBUyxLQUFLLG9CQUFvQjtBQUFBLE1BQ2hFLG1CQUFtQjtBQUFBLFFBQ2xCLFlBQVksV0FBUyxLQUFLLE1BQU0sWUFBWSxPQUFPLEtBQUssV0FBVztBQUFBLE1BQ3BFO0FBQUEsTUFDQSxnQkFBZ0I7QUFBQSxJQUNqQixDQUFDO0FBRUQsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFVBQU0sb0JBQW9CLFlBQVksSUFBSSxJQUFJLGdCQUFnQixDQUFDO0FBRS9ELFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxjQUFjLE1BQXVCLE9BQWUsY0FBdUQ7QUFDMUcsaUJBQWEsa0JBQWtCLE1BQU07QUFFckMsU0FBSyxjQUFjO0FBQ25CLGlCQUFhLGtCQUFrQixJQUFJLEtBQUssTUFBTSxPQUFPLE9BQU8sTUFBTTtBQUNqRSxVQUFJLFNBQVMsR0FBRztBQUNmLHFCQUFhLFFBQVEsVUFBVSxJQUFJLFlBQVk7QUFDL0MscUJBQWEsVUFBVSxNQUFNO0FBQzdCLHFCQUFhLFVBQVUsT0FBTztBQUM5QixxQkFBYSxRQUFRLGNBQWUsTUFBTSxjQUFjO0FBQUEsTUFDekQ7QUFBQSxJQUNELENBQUMsQ0FBQztBQUdGLGlCQUFhLGtCQUFrQixJQUFJLHNCQUFzQixhQUFhLFVBQVUsU0FBUyxVQUFVLFVBQVUsT0FBSztBQUNqSCxrQkFBWSxLQUFLLENBQUM7QUFBQSxJQUNuQixDQUFDLENBQUM7QUFHRixVQUFNLGVBQWUsTUFBTTtBQUMxQixtQkFBYSxRQUFRLFVBQVUsT0FBTyxZQUFZO0FBQ2xELG1CQUFhLFFBQVEsY0FBZSxNQUFNLGNBQWM7QUFBQSxJQUN6RDtBQUVBLFVBQU0sU0FBUyxNQUFNO0FBQ3BCLG1CQUFhO0FBRWIsWUFBTSxZQUFZLGFBQWEsVUFBVTtBQUN6QyxZQUFNLE1BQU0sZUFBZSxTQUFTLElBQUksS0FBSyxJQUFJLEtBQUssRUFBRSxNQUFNLE1BQU0sTUFBTSxVQUFVLFNBQVMsRUFBRSxDQUFDLElBQUksS0FBSyxJQUFJLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUNySSxtQkFBYSxVQUFVLFlBQVksS0FBSyxXQUFXLEdBQUc7QUFFdEQsVUFBSSxLQUFLO0FBQ1IsYUFBSyxNQUFNLFdBQVcsTUFBTSxHQUFHO0FBQUEsTUFDaEM7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLE1BQU07QUFDcEIsbUJBQWE7QUFDYixtQkFBYSxVQUFVLFFBQVE7QUFDL0IsV0FBSyxNQUFNLFdBQVcsSUFBSTtBQUFBLElBQzNCO0FBRUEsaUJBQWEsa0JBQWtCLElBQUksOEJBQThCLGFBQWEsVUFBVSxjQUFjLFVBQVUsVUFBVSxPQUFLO0FBQzlILFVBQUksVUFBVTtBQUNkLFVBQUksRUFBRSxPQUFPLFFBQVEsS0FBSyxHQUFHO0FBQzVCLGVBQU87QUFDUCxrQkFBVTtBQUFBLE1BQ1gsV0FBVyxFQUFFLE9BQU8sUUFBUSxNQUFNLEdBQUc7QUFDcEMsZUFBTztBQUNQLGtCQUFVO0FBQUEsTUFDWDtBQUVBLFVBQUksU0FBUztBQUNaLFVBQUUsZUFBZTtBQUNqQixVQUFFLGdCQUFnQjtBQUFBLE1BQ25CO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixpQkFBYSxrQkFBa0IsSUFBSyxzQkFBc0IsYUFBYSxVQUFVLGNBQWMsVUFBVSxNQUFNLE1BQU07QUFDcEgsYUFBTztBQUFBLElBQ1IsQ0FBQyxDQUFFO0FBRUgsVUFBTSxjQUFjLEtBQUssV0FBVyxLQUFLLEdBQUc7QUFDNUMsaUJBQWEsVUFBVSxRQUFRO0FBQy9CLGlCQUFhLFVBQVUsWUFBWTtBQUNuQyxpQkFBYSxRQUFRLFVBQVUsT0FBTyw0QkFBNEIsS0FBSyxxQkFBcUI7QUFBQSxFQUM3RjtBQUFBLEVBRUEsZ0JBQWdCLGNBQXVEO0FBQ3RFLGlCQUFhLFlBQVksUUFBUTtBQUNqQyxpQkFBYSxrQkFBa0IsUUFBUTtBQUFBLEVBQ3hDO0FBQUEsRUFFUSxXQUFXLEtBQWtCO0FBQ3BDLFFBQUksSUFBSSxXQUFXLFFBQVEsTUFBTTtBQUNoQyxhQUFPLHFCQUFxQixJQUFJLE1BQU07QUFBQSxJQUN2QztBQUlBLFFBQUksSUFBSSxLQUFLLFdBQVcsTUFBTSxHQUFHLEdBQUc7QUFDbkMsWUFBTSw4QkFBOEIsSUFBSSxLQUFLLFVBQVUsQ0FBQztBQUN4RCxZQUFNLGdCQUFnQixlQUFlLDZCQUE2QixJQUFJO0FBQ3RFLFVBQUksZUFBZTtBQUNsQixlQUFPLHFCQUFxQixNQUFNLFVBQVUsMkJBQTJCLEdBQUcsSUFBSTtBQUFBLE1BQy9FO0FBQUEsSUFDRDtBQUVBLFdBQU8sSUFBSTtBQUFBLEVBQ1o7QUFFRDtBQTdITSw2QkFDVyxjQUFjO0FBRHpCLCtCQUFOO0FBQUEsRUFRRztBQUFBLEdBUkc7QUF3SU4sU0FBUyxhQUFhLGNBQTZCLE1BQStCO0FBQ2pGLFNBQU8sS0FBSyxJQUFJLFlBQVksYUFBYSxhQUFhLEtBQUssSUFBSSxRQUFRLEtBQUssSUFBSSxTQUFTLElBQUksU0FBUyxrQkFBa0IsT0FBTztBQUNoSTtBQUVBLElBQU0sK0JBQU4sTUFBaUg7QUFBQSxFQUtoSCxZQUNpQyxjQUMvQjtBQUQrQjtBQUhqQyxTQUFTLGFBQXFCLDZCQUE2QjtBQUFBLEVBSXZEO0FBQUEsRUFFSixlQUFlLFdBQTJEO0FBQ3pFLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxVQUFNLG9CQUFvQixZQUFZLElBQUksSUFBSSxnQkFBZ0IsQ0FBQztBQUUvRCxVQUFNLFVBQVUsVUFBVSxZQUFZLEVBQUUsT0FBTyxDQUFDO0FBQ2hELFVBQU0sZ0JBQWdCLFFBQVEsWUFBWSxFQUFFLGdCQUFnQixDQUFDO0FBQzdELFVBQU0scUJBQXFCLFFBQVEsWUFBWSxFQUFFLGdCQUFnQixDQUFDO0FBRWxFLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxjQUFjLE1BQXVCLE9BQWUsY0FBdUQ7QUFDMUcsaUJBQWEsa0JBQWtCLE1BQU07QUFDckMsaUJBQWEsa0JBQWtCLElBQUksRUFBRSxTQUFTLE1BQU07QUFBRSxnQkFBVSxhQUFhLGtCQUFrQjtBQUFBLElBQUcsRUFBRSxDQUFDO0FBRXJHLGlCQUFhLGNBQWMsWUFBWSxhQUFhLEtBQUssY0FBYyxJQUFJO0FBQzNFLGlCQUFhLFFBQVEsVUFBVSxPQUFPLDRCQUE0QixLQUFLLHFCQUFxQjtBQUU1RixpQkFBYSxjQUFjLE1BQU0sVUFBVTtBQUMzQyxpQkFBYSxtQkFBbUIsTUFBTSxVQUFVO0FBQUEsRUFDakQ7QUFBQSxFQUVBLGdCQUFnQixjQUF1RDtBQUN0RSxpQkFBYSxZQUFZLFFBQVE7QUFBQSxFQUNsQztBQUVEO0FBekNNLDZCQUNXLGNBQWM7QUFEekIsK0JBQU47QUFBQSxFQU1HO0FBQUEsR0FORztBQTJDQyxJQUFNLHVCQUFOLGNBQW1DLFdBQVc7QUFBQSxFQXNCcEQsWUFDQyxPQUNtQixrQkFDSixjQUNFLGdCQUMwQixrQkFDRywyQkFDUSxvQ0FDZCxzQkFDVyxpQ0FDRixzQkFDTSw0QkFDckIsZ0JBQ0csbUJBQ3BDO0FBQUUsVUFBTSxxQkFBcUIsSUFBSSxPQUFPLGtCQUFrQixjQUFjLGNBQWM7QUFUNUM7QUFDRztBQUNRO0FBQ2Q7QUFDVztBQUNGO0FBQ007QUFDckI7QUFDRztBQTBJdEMsU0FBUSxZQUFZO0FBQ3BCLFNBQWlCLHNCQUF1QyxLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQXFSNUYsU0FBUSxxQkFBK0MsQ0FBQztBQUFBLEVBL1ptQztBQUFBLEVBRWpGLGFBQWEsUUFBMkI7QUFDakQsU0FBSyxjQUFjLE9BQU8sUUFBUSxFQUFFLDJCQUEyQixFQUFFLFVBQVUsSUFBSSxDQUFDLENBQUM7QUFFakYsU0FBSyxvQkFBb0IsS0FBSyxXQUFXO0FBRXpDLFVBQU0sb0JBQW9CLEVBQUUsOEJBQThCO0FBQzFELFNBQUssZ0JBQWdCLEtBQUssVUFBVSxJQUFJLHFCQUFxQixtQkFBbUI7QUFBQSxNQUMvRSxZQUFZLG9CQUFvQjtBQUFBLE1BQ2hDLFVBQVUsb0JBQW9CO0FBQUEsSUFDL0IsQ0FBQyxDQUFDO0FBRUYsV0FBTyxLQUFLLGFBQWEsS0FBSyxjQUFjLFdBQVcsQ0FBQztBQUV4RCxTQUFLLDhCQUE4QixpQkFBaUI7QUFDcEQsU0FBSywyQkFBMkIsaUJBQWlCO0FBRWpELFNBQUssWUFBWSxNQUFNLFlBQVksb0NBQW9DLGNBQWMsZ0JBQWdCLENBQUM7QUFDdEcsU0FBSyxZQUFZLE1BQU0sWUFBWSxzQ0FBc0MsY0FBYyx5QkFBeUIsQ0FBQztBQUNqSCxTQUFLLFlBQVksTUFBTSxZQUFZLGlDQUFpQyxjQUFjLHdCQUF3QixDQUFDO0FBQzNHLFNBQUssWUFBWSxNQUFNLFlBQVksNkJBQTZCLGNBQWMscUJBQXFCLENBQUM7QUFHcEcsU0FBSyxVQUFVLHNCQUFzQixLQUFLLGFBQWEsVUFBVSxVQUFVLE9BQUs7QUFDL0UsWUFBTSxRQUFRLElBQUksc0JBQXNCLENBQUM7QUFFekMsVUFBSSxNQUFNLE9BQU8sUUFBUSxPQUFPLEtBQUssTUFBTSxPQUFPLFFBQVEsU0FBUyxHQUFHO0FBQ3JFLGNBQU0sV0FBVyxDQUFDLEtBQUssaUJBQWlCLEtBQUssa0JBQWtCLEtBQUssb0JBQW9CLEtBQUssc0JBQXNCO0FBQ25ILGNBQU0sZUFBZSxTQUFTLFVBQVUsYUFBVztBQUNsRCxpQkFBTywwQkFBMEIsT0FBTztBQUFBLFFBQ3pDLENBQUM7QUFFRCxZQUFJLFdBQVc7QUFDZixZQUFJLE1BQU0sT0FBTyxRQUFRLFNBQVMsR0FBRztBQUNwQztBQUFBLFFBQ0QsV0FBVyxNQUFNLE9BQU8sUUFBUSxPQUFPLEdBQUc7QUFDekMscUJBQVcsS0FBSyxJQUFJLEdBQUcsUUFBUTtBQUMvQjtBQUFBLFFBQ0Q7QUFFQSxvQkFBWSxTQUFTO0FBQ3JCLG9CQUFZLFNBQVM7QUFFckIsaUJBQVMsUUFBUSxFQUFFLE1BQU07QUFBQSxNQUMxQixXQUFXLE1BQU0sT0FBTyxRQUFRLE1BQU0sR0FBRztBQUN4QyxhQUFLLFlBQVksTUFBTTtBQUFBLE1BQ3hCLFdBQVcsTUFBTSxPQUFPLE9BQU8sVUFBVSxRQUFRLEtBQUssR0FBRztBQUN4RCxZQUFJLEtBQUssZ0NBQWdDLHFCQUFxQixHQUFHO0FBQ2hFLGVBQUssZ0NBQWdDLGtCQUFrQixDQUFDLEtBQUssZ0NBQWdDLG1CQUFtQixDQUFDO0FBQUEsUUFDbEg7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUyxRQUFRO0FBQ2hCLFVBQU0sTUFBTTtBQUVaLFNBQUssWUFBWSxNQUFNO0FBQUEsRUFDeEI7QUFBQSxFQUVBLE1BQWUsU0FBUyxPQUFrQyxTQUFxQyxTQUE2QixPQUF5QztBQUVwSyxVQUFNLE1BQU0sU0FBUyxPQUFPLFNBQVMsU0FBUyxLQUFLO0FBQ25ELFFBQUksTUFBTSx5QkFBeUI7QUFBRTtBQUFBLElBQVE7QUFFN0MsVUFBTSxLQUFLLGdDQUFnQztBQUMzQyxTQUFLLGtCQUFrQjtBQUN2QixVQUFNLEtBQUssT0FBTztBQUFBLEVBQ25CO0FBQUEsRUFFUSxvQkFBMEI7QUFDakMsU0FBSyxVQUFVLEtBQUssMEJBQTBCLFNBQVMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBQzNFLFNBQUssVUFBVSxLQUFLLHFCQUFxQiw4QkFBOEIsTUFBTSxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBQzNGLFNBQUssVUFBVSxLQUFLLGdDQUFnQyxpQkFBaUIsTUFBTSxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBQ3pGLFNBQUssVUFBVSxLQUFLLGdDQUFnQywwQkFBMEIsTUFBTSxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBQUEsRUFDbkc7QUFBQSxFQUVRLHdCQUF3QixTQUEwQjtBQUN6RCxRQUFJLFNBQVM7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxtQkFBbUIsU0FBMEI7QUFDcEQsUUFBSSxTQUFTO0FBQ1osVUFBSSxLQUFLLGdDQUFnQyx1QkFBdUIsR0FBRztBQUNsRSxlQUFPLFNBQVMsMkJBQTJCLHdCQUF3QjtBQUFBLE1BQ3BFO0FBRUEsY0FBUSxLQUFLLGlCQUFpQixrQkFBa0IsR0FBRztBQUFBLFFBQ2xELEtBQUssZUFBZTtBQUNuQixpQkFBTyxTQUFTLHVCQUF1Qix1QkFBdUI7QUFBQSxRQUMvRCxLQUFLLGVBQWU7QUFDbkIsaUJBQU8sU0FBUyx1QkFBdUIsdUJBQXVCO0FBQUEsUUFDL0QsS0FBSyxlQUFlO0FBQ25CLGlCQUFPLFNBQVMsMEJBQTBCLDBCQUEwQjtBQUFBLE1BQ3RFO0FBQUEsSUFDRDtBQUVBLFdBQU8sU0FBUyxtQkFBbUIsNEJBQTRCO0FBQUEsRUFDaEU7QUFBQSxFQUVRLDZCQUE2QixTQUE0QjtBQUNoRSxXQUFPLFVBQVUsaUJBQWlCLFVBQVU7QUFBQSxFQUM3QztBQUFBLEVBRVEsc0JBQXNCLFNBQW9DO0FBQ2pFLFFBQUksUUFBZ0I7QUFDcEIsUUFBSSxXQUFtQjtBQUV2QixZQUFRLEtBQUssaUJBQWlCLGtCQUFrQixHQUFHO0FBQUEsTUFDbEQsS0FBSyxlQUFlLE9BQU87QUFDMUIsZ0JBQVEsVUFBVSxTQUFTLGlCQUFpQixxQkFBcUIsSUFBSSxTQUFTLHNCQUFzQixvQkFBb0I7QUFDeEgsbUJBQVcsVUFBVSxTQUFTLHlCQUF5QixxRkFBcUYsSUFDM0ksU0FBUywyQkFBMkIsdUdBQXVHO0FBQzVJO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxlQUFlLFFBQVE7QUFDM0IsZ0JBQVEsVUFBVSxTQUFTLGlCQUFpQixxQkFBcUIsSUFBSSxTQUFTLHNCQUFzQixvQkFBb0I7QUFDeEgsbUJBQVcsVUFBVSxTQUFTLHlCQUF5QixxRkFBcUYsSUFDM0ksU0FBUywyQkFBMkIsdUdBQXVHO0FBQzVJO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxlQUFlLFdBQVc7QUFDOUIsZ0JBQVEsVUFBVSxTQUFTLG9CQUFvQix3QkFBd0IsSUFBSSxTQUFTLHNCQUFzQixvQkFBb0I7QUFDOUgsbUJBQVcsVUFBVSxTQUFTLDRCQUE0Qix3RkFBd0YsSUFDakosU0FBUyw4QkFBOEIsMEdBQTBHO0FBQ2xKO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPLENBQUMsT0FBTyxRQUFRO0FBQUEsRUFDeEI7QUFBQSxFQUtBLE1BQWMsU0FBUztBQUl0QixRQUFJLEtBQUssT0FBTyxZQUFZO0FBQzNCO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxXQUFXO0FBQ25CO0FBQUEsSUFDRDtBQUVBLFNBQUssWUFBWTtBQUNqQixTQUFLLG9CQUFvQixNQUFNO0FBRS9CLFVBQU0scUJBQXFCLEtBQUssZ0NBQWdDLG1CQUFtQjtBQUNuRixTQUFLLFlBQVksVUFBVSxPQUFPLFdBQVcsa0JBQWtCO0FBQy9ELFNBQUssWUFBWSxVQUFVLE9BQU8sYUFBYSxDQUFDLGtCQUFrQjtBQUdsRSxTQUFLLGdCQUFnQixZQUFZLEtBQUssbUJBQW1CLGtCQUFrQjtBQUMzRSxTQUFLLGdCQUFnQixZQUFZO0FBQ2pDLFNBQUssZ0JBQWdCLFVBQVUsSUFBSSxHQUFHLEtBQUssNkJBQTZCLGtCQUFrQixDQUFDO0FBQzNGLFNBQUssa0JBQWtCLFlBQVk7QUFFbkMsVUFBTSx3QkFBd0IsT0FBTyxLQUFLLG1CQUFtQixFQUFFLEtBQUssQ0FBQztBQUNyRSwwQkFBc0IsWUFBWSxxQkFDakMsU0FBUyxzQkFBc0IsMkVBQTJFLElBQzFHLFNBQVMsd0JBQXdCLGdFQUFnRSxLQUFLLGVBQWUsU0FBUztBQUUvSCxVQUFNLDJCQUEyQixPQUFPLEtBQUssbUJBQW1CLEVBQUUsS0FBSyxDQUFDO0FBQ3hFLFVBQU0sK0JBQStCLFNBQVMsRUFBRSxLQUFLLHFDQUFxQyxTQUFTLENBQUMsa0dBQWtHLEVBQUUsR0FBRywwRkFBMEYsbUNBQW1DO0FBQ3hVLGVBQVcsUUFBUSxnQkFBZ0IsNEJBQTRCLEVBQUUsT0FBTztBQUN2RSxVQUFJLE9BQU8sU0FBUyxVQUFVO0FBQzdCLGVBQU8sMEJBQTBCLFNBQVMsZUFBZSxJQUFJLENBQUM7QUFBQSxNQUMvRCxPQUFPO0FBQ04sYUFBSyxvQkFBb0IsSUFBSSxLQUFLLHFCQUFxQixlQUFlLE1BQU0sMEJBQTBCLEVBQUUsR0FBRyxNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQUEsTUFDckk7QUFBQSxJQUNEO0FBRUEsU0FBSyxnQkFBZ0IsWUFBWSxLQUFLLHdCQUF3QixrQkFBa0I7QUFDaEYsU0FBSyxZQUFZLGFBQWEsY0FBYyxHQUFHLFNBQVMsc0JBQXNCLHdCQUF3QixDQUFDLE1BQU0sS0FBSyxnQkFBZ0IsU0FBUyxFQUFFO0FBRzdJLFVBQU0scUJBQXFCLEtBQUsscUJBQXFCO0FBQ3JELFVBQU0sd0JBQXdCLFNBQVMsR0FBMkIsV0FBVyxhQUFhO0FBQzFGLFVBQU0seUNBQXlDLG1CQUFtQixRQUFRLE9BQU8sU0FBTztBQUN2RixZQUFNLFdBQVcsc0JBQXNCLDJCQUEyQixFQUFFLEdBQUc7QUFHdkUsVUFBSSxTQUFTLFVBQVUsbUJBQW1CLFNBQVMsU0FBUyxLQUFLLEtBQUssU0FBUyxVQUFVLG1CQUFtQixVQUFVO0FBQ3JILGVBQU87QUFBQSxNQUNSO0FBR0EsVUFBSSxTQUFTLHNCQUFzQixTQUFTLDRCQUE0QjtBQUN2RSxZQUFJLG1CQUFtQixXQUFXLFNBQVMsR0FBRyxHQUFHO0FBQ2hELGlCQUFPO0FBQUEsUUFDUjtBQUNBLFlBQUksbUJBQW1CLGlCQUFpQjtBQUN2QyxxQkFBVywyQkFBMkIsbUJBQW1CLGdCQUFnQixPQUFPLEdBQUc7QUFDbEYsZ0JBQUksd0JBQXdCLFNBQVMsR0FBRyxHQUFHO0FBQzFDLHFCQUFPO0FBQUEsWUFDUjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFFQSxhQUFPO0FBQUEsSUFDUixDQUFDLEVBQUU7QUFHSCxTQUFLLHVCQUF1Qix3Q0FBd0MsS0FBSyxrQkFBa0IsQ0FBQztBQUc1RixTQUFLLDBCQUEwQixZQUFZO0FBRTNDLFNBQUssY0FBYyxXQUFXLEVBQUUsTUFBTSxTQUFTLGVBQWUsS0FBSyxnQkFBZ0IsWUFBWTtBQUMvRixTQUFLLGNBQWMsWUFBWTtBQUMvQixTQUFLLFlBQVk7QUFBQSxFQUNsQjtBQUFBLEVBRVEsb0JBQTRCO0FBQ25DLFVBQU0sTUFBTSxvQkFBSSxJQUFZO0FBRTVCLFVBQU0scUJBQXFCLG1CQUFtQixLQUFLLGlCQUFpQixhQUFhLENBQUM7QUFDbEYsVUFBTSxrQkFBa0IsS0FBSywwQkFBMEIsTUFBTSxPQUFPLFNBQU8sSUFBSSxLQUFLLEVBQUUsSUFBSSxTQUFPLElBQUksS0FBTTtBQUUzRyxlQUFXLGFBQWEsaUJBQWlCO0FBQ3hDLFlBQU0sa0JBQWtCLEtBQUssMkJBQTJCLG1CQUFtQixTQUFTO0FBQ3BGLFVBQUksb0JBQW9CLGdCQUFnQixtQkFBbUIsb0JBQW9CLGdCQUFnQixvQkFDOUYsb0JBQW9CLGdCQUFnQiw4QkFBOEIsb0JBQW9CLGdCQUFnQiwrQkFBK0I7QUFDckk7QUFBQSxNQUNEO0FBRUEsVUFBSSxzQkFBc0IsS0FBSyxtQ0FBbUMsd0NBQXdDLFVBQVUsUUFBUSxNQUFNLE9BQU87QUFDeEk7QUFBQSxNQUNEO0FBRUEsVUFBSSxLQUFLLG1DQUFtQywwQ0FBMEMsVUFBVSxRQUFRLE1BQU0sTUFBTTtBQUNuSCxZQUFJLElBQUksVUFBVSxXQUFXLEVBQUU7QUFDL0I7QUFBQSxNQUNEO0FBRUEsWUFBTSxlQUFlLHlCQUF5QixpQkFBaUIsU0FBUztBQUN4RSxVQUFJLGFBQWEsS0FBSyxTQUFPLEtBQUssbUNBQW1DLDBDQUEwQyxJQUFJLFFBQVEsTUFBTSxLQUFLLEdBQUc7QUFDeEksWUFBSSxJQUFJLFVBQVUsV0FBVyxFQUFFO0FBQUEsTUFDaEM7QUFBQSxJQUNEO0FBRUEsV0FBTyxJQUFJO0FBQUEsRUFDWjtBQUFBLEVBRVEsb0JBQW9CLFFBQTJCO0FBQ3RELFNBQUssa0JBQWtCLE9BQU8sUUFBUSxFQUFFLDJCQUEyQixFQUFFLFVBQVUsSUFBSSxDQUFDLENBQUM7QUFDckYsU0FBSyx1QkFBdUIsT0FBTyxLQUFLLGlCQUFpQixFQUFFLHdCQUF3QixDQUFDO0FBQ3BGLFNBQUssa0JBQWtCLE9BQU8sS0FBSyxzQkFBc0IsRUFBRSw2QkFBNkIsQ0FBQztBQUN6RixTQUFLLGtCQUFrQixPQUFPLEtBQUssc0JBQXNCLEVBQUUsNkJBQTZCLENBQUM7QUFDekYsU0FBSyxvQkFBb0IsT0FBTyxLQUFLLGlCQUFpQixFQUFFLDhCQUE4QixDQUFDO0FBQUEsRUFDeEY7QUFBQSxFQUVRLDJCQUEyQixRQUEyQjtBQUM3RCxTQUFLLHlCQUF5QixPQUFPLFFBQVEsRUFBRSw2QkFBNkIsRUFBRSxVQUFVLElBQUksQ0FBQyxDQUFDO0FBQzlGLFVBQU0scUJBQXFCLE9BQU8sS0FBSyx3QkFBd0IsRUFBRSxrQ0FBa0MsQ0FBQztBQUNwRyx1QkFBbUIsWUFBWSxTQUFTLCtCQUErQiw4QkFBOEI7QUFFckcsU0FBSyw0QkFBNEIsS0FBSyxVQUFVLEtBQUsscUJBQXFCLGVBQWUsMkJBQTJCLEtBQUssc0JBQXNCLENBQUM7QUFBQSxFQUNqSjtBQUFBLEVBRVEsOEJBQThCLFFBQTJCO0FBQ2hFLFNBQUssNEJBQTRCLE9BQU8sUUFBUSxFQUFFLDJCQUEyQixDQUFDO0FBQzlFLFNBQUssbUJBQW1CLE9BQU8sS0FBSywyQkFBMkIsRUFBRSx3Q0FBd0MsRUFBRSxVQUFVLElBQUksQ0FBQyxDQUFDO0FBQzNILFNBQUsscUJBQXFCLE9BQU8sS0FBSywyQkFBMkIsRUFBRSwwQ0FBMEMsRUFBRSxVQUFVLElBQUksQ0FBQyxDQUFDO0FBQUEsRUFDaEk7QUFBQSxFQUVBLE1BQWMsdUJBQXVCLGFBQXFCLGVBQXNDO0FBQy9GLGNBQVUsS0FBSyxnQkFBZ0I7QUFDL0IsY0FBVSxLQUFLLGtCQUFrQjtBQUdqQyxVQUFNLENBQUMsY0FBYyxlQUFlLElBQUksS0FBSyxzQkFBc0IsSUFBSTtBQUV2RSxTQUFLLCtCQUErQixLQUFLLGtCQUFrQixjQUFjLGVBQWU7QUFDeEYsVUFBTSx3QkFBd0IsS0FBSyxpQkFBaUIsa0JBQWtCLE1BQU0sZUFBZSxRQUMxRjtBQUFBLE1BQ0MsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQUEsTUFDbkQsU0FBUyxvQkFBb0Isc0JBQXNCO0FBQUEsTUFDbkQsU0FBUyxxQkFBcUIsc0NBQXNDO0FBQUEsSUFDckUsSUFDQTtBQUFBLE1BQ0MsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQUEsTUFDbkQsU0FBUyxvQkFBb0Isc0JBQXNCO0FBQUEsTUFDbkQsU0FBUyxtQkFBbUIsb0NBQW9DO0FBQUEsTUFDaEUsU0FBUyxxQkFBcUIsc0NBQXNDO0FBQUEsSUFDckU7QUFDRCxTQUFLLDZCQUE2QixLQUFLLGtCQUFrQix1QkFBdUIsVUFBVSxpQkFBaUIsYUFBYSxDQUFDO0FBR3pILFVBQU0sQ0FBQyxnQkFBZ0IsaUJBQWlCLElBQUksS0FBSyxzQkFBc0IsS0FBSztBQUU1RSxTQUFLLCtCQUErQixLQUFLLG9CQUFvQixnQkFBZ0IsaUJBQWlCO0FBQzlGLFVBQU0sMEJBQTBCLEtBQUssaUJBQWlCLGtCQUFrQixNQUFNLGVBQWUsUUFDNUY7QUFBQSxNQUNDLFNBQVMsa0JBQWtCLDhCQUE4QjtBQUFBLE1BQ3pELFNBQVMsc0JBQXNCLHVCQUF1QjtBQUFBLE1BQ3RELHFCQUFxQixTQUFTLEVBQUUsS0FBSyx1QkFBdUIsU0FBUyxDQUFDLGtHQUFrRyxFQUFFLEdBQUcsb0VBQW9FLGVBQWUsV0FBVyxnREFBZ0QsRUFBRSxDQUFDO0FBQUEsSUFDL1QsSUFDQTtBQUFBLE1BQ0MsU0FBUyxrQkFBa0IsOEJBQThCO0FBQUEsTUFDekQsU0FBUyxzQkFBc0IsdUJBQXVCO0FBQUEsTUFDdEQscUJBQXFCLGNBQWMsU0FBUyxFQUFFLEtBQUsscUJBQXFCLFNBQVMsQ0FBQyxrR0FBa0csRUFBRSxHQUFHLGlEQUFpRCxhQUFhLGtDQUFrQyxJQUFJLFNBQVMsd0JBQXdCLG9EQUFvRCxDQUFDO0FBQUEsTUFDblgscUJBQXFCLFNBQVMsRUFBRSxLQUFLLHVCQUF1QixTQUFTLENBQUMsa0dBQWtHLEVBQUUsR0FBRyxvRUFBb0UsZUFBZSxXQUFXLGdEQUFnRCxFQUFFLENBQUM7QUFBQSxJQUMvVDtBQUNELFNBQUssNkJBQTZCLEtBQUssb0JBQW9CLHlCQUF5QixVQUFVLGlCQUFpQixTQUFTLENBQUM7QUFFekgsUUFBSSxLQUFLLGdDQUFnQyxtQkFBbUIsR0FBRztBQUM5RCxVQUFJLEtBQUssZ0NBQWdDLHFCQUFxQixHQUFHO0FBQ2hFLGFBQUssNEJBQTRCLEtBQUssa0JBQWtCO0FBQUEsTUFDekQsT0FBTztBQUNOLGFBQUssd0JBQXdCLEtBQUssa0JBQWtCO0FBQUEsTUFDckQ7QUFBQSxJQUNELE9BQU87QUFDTixVQUFJLEtBQUssZ0NBQWdDLHFCQUFxQixHQUFHO0FBQ2hFLGFBQUssd0JBQXdCLEtBQUssZ0JBQWdCO0FBQUEsTUFDbkQ7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0JBQWdCLFFBQXFCLFlBQWtFLFNBQXlCO0FBQ3ZJLFVBQU0sWUFBWSxPQUFPLFFBQVEsRUFBRSw4QkFBOEIsQ0FBQztBQUNsRSxVQUFNLGtCQUFrQixPQUFPLFdBQVcsRUFBRSwwQkFBMEIsQ0FBQztBQUN2RSxVQUFNLFlBQVksS0FBSyxvQkFBb0IsSUFBSSxJQUFJLFVBQVUsZUFBZSxDQUFDO0FBRTdFLGVBQVcsRUFBRSxRQUFRLFdBQVcsS0FBSyxZQUFZO0FBQ2hELFlBQU0sU0FBUyxVQUFVLHlCQUF5QixtQkFBbUI7QUFFckUsYUFBTyxRQUFRLE9BQU87QUFDdEIsYUFBTyxVQUFVLFlBQVksU0FBWSxVQUFVLE9BQU87QUFDMUQsYUFBTyxjQUFjLFdBQVcsU0FBUztBQUN6QyxhQUFPLFFBQVEsWUFBWSxPQUFPLFFBQVEsT0FBTyxTQUFTLG9CQUFvQiwwQkFBMEIsV0FBVyxhQUFhLENBQUU7QUFFbEksV0FBSyxvQkFBb0IsSUFBSSxPQUFPLFdBQVcsT0FBSztBQUNuRCxZQUFJLEdBQUc7QUFDTixzQkFBWSxLQUFLLEdBQUcsSUFBSTtBQUFBLFFBQ3pCO0FBRUEsZUFBTyxJQUFJO0FBQUEsTUFDWixDQUFDLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDRDtBQUFBLEVBRVEsd0JBQXdCLFFBQTJCO0FBQzFELFVBQU0sY0FBYyxLQUFLLG9CQUFvQixJQUFJLElBQUksT0FBTyx1Q0FBdUMsU0FBUyxlQUFlLE9BQU8sR0FBRyxRQUFXLE1BQU0sWUFBWTtBQUNqSyxZQUFNLEtBQUssZ0NBQWdDLGtCQUFrQixJQUFJO0FBQUEsSUFDbEUsQ0FBQyxDQUFDO0FBRUYsVUFBTSxlQUFlLENBQUMsRUFBRSxRQUFRLGFBQWEsWUFBWSxLQUFLLGtCQUFrQixtQkFBbUIsY0FBYyxjQUFjLFlBQVksRUFBRSxDQUFDLEVBQUUsQ0FBQztBQUVqSixTQUFLLGdCQUFnQixRQUFRLFlBQVk7QUFBQSxFQUMxQztBQUFBLEVBRVEsNEJBQTRCLFFBQTJCO0FBQzlELFNBQUssZ0JBQWdCLFFBQVEsQ0FBQztBQUFBLE1BQzdCLFFBQVEsS0FBSyxvQkFBb0IsSUFBSSxJQUFJLE9BQU8sc0NBQXNDLFNBQVMsbUJBQW1CLGFBQWEsR0FBRyxRQUFXLE1BQU0sWUFBWTtBQUM5SixjQUFNLEtBQUssZ0NBQWdDLGtCQUFrQixLQUFLO0FBQUEsTUFDbkUsQ0FBQyxDQUFDO0FBQUEsTUFDRixZQUFZLEtBQUssa0JBQWtCLG1CQUFtQixjQUFjLGNBQWMsWUFBWSxFQUFFLENBQUM7QUFBQSxJQUNsRyxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSx3QkFBd0IsUUFBMkI7QUFDMUQsUUFBSSxLQUFLLGlCQUFpQixrQkFBa0IsTUFBTSxlQUFlLE9BQU87QUFDdkU7QUFBQSxJQUNEO0FBRUEsVUFBTSxjQUFjLE9BQU8sUUFBUSxFQUFFLHdDQUF3QyxDQUFDO0FBQzlFLFFBQUksQ0FBQyxLQUFLLGdDQUFnQyx1QkFBdUIsR0FBRztBQUNuRSxrQkFBWSxZQUFZLEtBQUssaUJBQWlCLGtCQUFrQixNQUFNLGVBQWUsWUFBWSxTQUFTLDRCQUE0QixnRkFBZ0YsSUFBSSxTQUFTLHlCQUF5Qiw2RUFBNkU7QUFBQSxJQUMxVSxPQUFPO0FBQ04sa0JBQVksWUFBWSxTQUFTLHVCQUF1QixtRUFBbUU7QUFBQSxJQUM1SDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLCtCQUErQixRQUFxQixZQUFvQixjQUE0QjtBQUMzRyxVQUFNLDZCQUE2QixPQUFPLFFBQVEsRUFBRSxxQ0FBcUMsQ0FBQztBQUMxRixVQUFNLGVBQWUsT0FBTyw0QkFBNEIsRUFBRSxvQ0FBb0MsQ0FBQztBQUMvRixVQUFNLGNBQWMsT0FBTyxjQUFjLEVBQUUseUNBQXlDLENBQUM7QUFDckYsVUFBTSxrQkFBa0IsT0FBTyw0QkFBNEIsRUFBRSx1Q0FBdUMsQ0FBQztBQUVyRyxnQkFBWSxZQUFZO0FBQ3hCLG9CQUFnQixZQUFZO0FBQUEsRUFDN0I7QUFBQSxFQUVRLDZCQUE2QixRQUFxQixhQUF1QixnQkFBZ0M7QUFDaEgsVUFBTSxnQkFBZ0IsT0FBTyxRQUFRLEVBQUUsNkNBQTZDLENBQUM7QUFDckYsVUFBTSxrQkFBa0IsT0FBTyxlQUFlLEVBQUUsSUFBSSxDQUFDO0FBQ3JELGVBQVcsY0FBYyxhQUFhO0FBQ3JDLFlBQU0scUJBQXFCLE9BQU8saUJBQWlCLEVBQUUsSUFBSSxDQUFDO0FBQzFELFlBQU0sT0FBTyxPQUFPLG9CQUFvQixFQUFFLGlCQUFpQixDQUFDO0FBQzVELFlBQU0sT0FBTyxPQUFPLG9CQUFvQixFQUFFLGlCQUFpQixDQUFDO0FBRTVELFdBQUssVUFBVSxJQUFJLEdBQUcsY0FBYztBQUVwQyxZQUFNLGFBQWEsZ0JBQWdCLFVBQVU7QUFDN0MsaUJBQVcsUUFBUSxXQUFXLE9BQU87QUFDcEMsWUFBSSxPQUFPLFNBQVMsVUFBVTtBQUM3QixpQkFBTyxNQUFNLFNBQVMsZUFBZSxJQUFJLENBQUM7QUFBQSxRQUMzQyxPQUFPO0FBQ04sZUFBSyxvQkFBb0IsSUFBSSxLQUFLLHFCQUFxQixlQUFlLE1BQU0sTUFBTSxFQUFFLEdBQUcsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUFBLFFBQ2pIO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFHQSxPQUFPLFdBQTRCO0FBQ2xDLFFBQUksQ0FBQyxLQUFLLFVBQVUsR0FBRztBQUN0QjtBQUFBLElBQ0Q7QUFFQSxTQUFLLDBCQUEwQixPQUFPO0FBRXRDLFNBQUssbUJBQW1CLFFBQVEsaUJBQWU7QUFDOUMsa0JBQVksT0FBTztBQUFBLElBQ3BCLENBQUM7QUFFRCxTQUFLLGNBQWMsWUFBWTtBQUFBLEVBQ2hDO0FBQ0Q7QUFqZGEscUJBQ0ksS0FBYTtBQStLZjtBQUFBLEVBRGIsU0FBUyxHQUFHO0FBQUEsR0EvS0QscUJBZ0xFO0FBaExGLHVCQUFOO0FBQUEsRUF3Qko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBbkNVO0FBb2RiLFNBQVMscUJBQXFCLFdBQTJCO0FBQ3hELFFBQU0sUUFBUTtBQUNkLFNBQU8sVUFBVSxRQUFRLE9BQU8sY0FBYztBQUMvQzsiLAogICJuYW1lcyI6IFtdCn0K
