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
import { $, append, clearNode } from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { fromNow } from "../../../../base/common/date.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import * as nls from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { ExtensionIdentifierMap } from "../../../../platform/extensions/common/extensions.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { Extensions, IExtensionFeaturesManagementService } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { EnablementState } from "../../../services/extensionManagement/common/extensionManagement.js";
import { LocalWebWorkerRunningLocation } from "../../../services/extensions/common/extensionRunningLocation.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IExtensionsWorkbenchService } from "../common/extensions.js";
import { RuntimeExtensionsInput } from "../common/runtimeExtensionsInput.js";
import { errorIcon, warningIcon } from "./extensionsIcons.js";
import { ExtensionIconWidget } from "./extensionsWidgets.js";
import "./media/runtimeExtensionsEditor.css";
let AbstractRuntimeExtensionsEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, contextKeyService, _extensionsWorkbenchService, _extensionService, _notificationService, _contextMenuService, _instantiationService, storageService, _labelService, _environmentService, _clipboardService, _extensionFeaturesManagementService, _hoverService, _menuService) {
    super(AbstractRuntimeExtensionsEditor.ID, group, telemetryService, themeService, storageService);
    this.contextKeyService = contextKeyService;
    this._extensionsWorkbenchService = _extensionsWorkbenchService;
    this._extensionService = _extensionService;
    this._notificationService = _notificationService;
    this._contextMenuService = _contextMenuService;
    this._instantiationService = _instantiationService;
    this._labelService = _labelService;
    this._environmentService = _environmentService;
    this._clipboardService = _clipboardService;
    this._extensionFeaturesManagementService = _extensionFeaturesManagementService;
    this._hoverService = _hoverService;
    this._menuService = _menuService;
    this._list = null;
    this._elements = null;
    this._updateSoon = this._register(new RunOnceScheduler(() => this._updateExtensions(), 200));
    this._register(this._extensionService.onDidChangeExtensionsStatus(() => this._updateSoon.schedule()));
    this._register(this._extensionFeaturesManagementService.onDidChangeAccessData(() => this._updateSoon.schedule()));
    this._updateExtensions();
  }
  async _updateExtensions() {
    this._elements = await this._resolveExtensions();
    this._list?.splice(0, this._list.length, this._elements);
  }
  async _resolveExtensions() {
    await this._extensionService.whenInstalledExtensionsRegistered();
    const extensionsDescriptions = this._extensionService.extensions.filter((extension) => {
      return Boolean(extension.main) || Boolean(extension.browser);
    });
    const marketplaceMap = new ExtensionIdentifierMap();
    const marketPlaceExtensions = await this._extensionsWorkbenchService.queryLocal();
    for (const extension of marketPlaceExtensions) {
      marketplaceMap.set(extension.identifier.id, extension);
    }
    const statusMap = this._extensionService.getExtensionsStatus();
    const segments = new ExtensionIdentifierMap();
    const profileInfo = this._getProfileInfo();
    if (profileInfo) {
      let currentStartTime = profileInfo.startTime;
      for (let i = 0, len = profileInfo.deltas.length; i < len; i++) {
        const id = profileInfo.ids[i];
        const delta = profileInfo.deltas[i];
        let extensionSegments = segments.get(id);
        if (!extensionSegments) {
          extensionSegments = [];
          segments.set(id, extensionSegments);
        }
        extensionSegments.push(currentStartTime);
        currentStartTime = currentStartTime + delta;
        extensionSegments.push(currentStartTime);
      }
    }
    let result = [];
    for (let i = 0, len = extensionsDescriptions.length; i < len; i++) {
      const extensionDescription = extensionsDescriptions[i];
      let extProfileInfo = null;
      if (profileInfo) {
        const extensionSegments = segments.get(extensionDescription.identifier) || [];
        let extensionTotalTime = 0;
        for (let j = 0, lenJ = extensionSegments.length / 2; j < lenJ; j++) {
          const startTime = extensionSegments[2 * j];
          const endTime = extensionSegments[2 * j + 1];
          extensionTotalTime += endTime - startTime;
        }
        extProfileInfo = {
          segments: extensionSegments,
          totalTime: extensionTotalTime
        };
      }
      result[i] = {
        originalIndex: i,
        description: extensionDescription,
        marketplaceInfo: marketplaceMap.get(extensionDescription.identifier),
        status: statusMap[extensionDescription.identifier.value],
        profileInfo: extProfileInfo || void 0,
        unresponsiveProfile: this._getUnresponsiveProfile(extensionDescription.identifier)
      };
    }
    result = result.filter((element) => element.status.activationStarted);
    const isUnresponsive = (extension) => extension.unresponsiveProfile === profileInfo;
    const profileTime = (extension) => extension.profileInfo?.totalTime ?? 0;
    const activationTime = (extension) => (extension.status.activationTimes?.codeLoadingTime ?? 0) + (extension.status.activationTimes?.activateCallTime ?? 0);
    result = result.sort((a, b) => {
      if (isUnresponsive(a) || isUnresponsive(b)) {
        return +isUnresponsive(b) - +isUnresponsive(a);
      } else if (profileTime(a) || profileTime(b)) {
        return profileTime(b) - profileTime(a);
      } else if (activationTime(a) || activationTime(b)) {
        return activationTime(b) - activationTime(a);
      }
      return a.originalIndex - b.originalIndex;
    });
    return result;
  }
  createEditor(parent) {
    parent.classList.add("runtime-extensions-editor");
    const TEMPLATE_ID = "runtimeExtensionElementTemplate";
    const delegate = new class {
      getHeight(element) {
        return 70;
      }
      getTemplateId(element) {
        return TEMPLATE_ID;
      }
    }();
    const renderer = {
      templateId: TEMPLATE_ID,
      renderTemplate: (root) => {
        const element = append(root, $(".extension"));
        const iconContainer = append(element, $(".icon-container"));
        const extensionIconWidget = this._instantiationService.createInstance(ExtensionIconWidget, iconContainer);
        const desc = append(element, $("div.desc"));
        const headerContainer = append(desc, $(".header-container"));
        const header = append(headerContainer, $(".header"));
        const name = append(header, $("div.name"));
        const version = append(header, $("span.version"));
        const msgContainer = append(desc, $("div.msg"));
        const actionbar = new ActionBar(desc);
        const listener = actionbar.onDidRun(({ error }) => error && this._notificationService.error(error));
        const timeContainer = append(element, $(".time"));
        const activationTime = append(timeContainer, $("div.activation-time"));
        const profileTime = append(timeContainer, $("div.profile-time"));
        const disposables = [extensionIconWidget, actionbar, listener];
        return {
          root,
          element,
          name,
          version,
          actionbar,
          activationTime,
          profileTime,
          msgContainer,
          set extension(extension) {
            extensionIconWidget.extension = extension || null;
          },
          disposables,
          elementDisposables: []
        };
      },
      renderElement: (element, index, data) => {
        data.elementDisposables = dispose(data.elementDisposables);
        data.extension = element.marketplaceInfo;
        data.root.classList.toggle("odd", index % 2 === 1);
        data.name.textContent = (element.marketplaceInfo?.displayName || element.description.identifier.value).substr(0, 50);
        data.version.textContent = element.description.version;
        const activationTimes = element.status.activationTimes;
        if (activationTimes) {
          const syncTime = activationTimes.codeLoadingTime + activationTimes.activateCallTime;
          data.activationTime.textContent = activationTimes.activationReason.startup ? `Startup Activation: ${syncTime}ms` : `Activation: ${syncTime}ms`;
        } else {
          data.activationTime.textContent = `Activating...`;
        }
        data.actionbar.clear();
        const slowExtensionAction = this._createSlowExtensionAction(element);
        if (slowExtensionAction) {
          data.actionbar.push(slowExtensionAction, { icon: false, label: true });
        }
        if (isNonEmptyArray(element.status.runtimeErrors)) {
          const reportExtensionIssueAction = this._createReportExtensionIssueAction(element);
          if (reportExtensionIssueAction) {
            data.actionbar.push(reportExtensionIssueAction, { icon: false, label: true });
          }
        }
        let title;
        if (activationTimes) {
          const activationId = activationTimes.activationReason.extensionId.value;
          const activationEvent = activationTimes.activationReason.activationEvent;
          if (activationEvent === "*") {
            title = nls.localize({
              key: "starActivation",
              comment: [
                "{0} will be an extension identifier"
              ]
            }, "Activated by {0} on start-up", activationId);
          } else if (/^workspaceContains:/.test(activationEvent)) {
            const fileNameOrGlob = activationEvent.substr("workspaceContains:".length);
            if (fileNameOrGlob.indexOf("*") >= 0 || fileNameOrGlob.indexOf("?") >= 0) {
              title = nls.localize({
                key: "workspaceContainsGlobActivation",
                comment: [
                  "{0} will be a glob pattern",
                  "{1} will be an extension identifier"
                ]
              }, "Activated by {1} because a file matching {0} exists in your workspace", fileNameOrGlob, activationId);
            } else {
              title = nls.localize({
                key: "workspaceContainsFileActivation",
                comment: [
                  "{0} will be a file name",
                  "{1} will be an extension identifier"
                ]
              }, "Activated by {1} because file {0} exists in your workspace", fileNameOrGlob, activationId);
            }
          } else if (/^workspaceContainsTimeout:/.test(activationEvent)) {
            const glob = activationEvent.substr("workspaceContainsTimeout:".length);
            title = nls.localize({
              key: "workspaceContainsTimeout",
              comment: [
                "{0} will be a glob pattern",
                "{1} will be an extension identifier"
              ]
            }, "Activated by {1} because searching for {0} took too long", glob, activationId);
          } else if (activationEvent === "onStartupFinished") {
            title = nls.localize({
              key: "startupFinishedActivation",
              comment: [
                "This refers to an extension. {0} will be an activation event."
              ]
            }, "Activated by {0} after start-up finished", activationId);
          } else if (/^onLanguage:/.test(activationEvent)) {
            const language = activationEvent.substr("onLanguage:".length);
            title = nls.localize("languageActivation", "Activated by {1} because you opened a {0} file", language, activationId);
          } else {
            title = nls.localize({
              key: "workspaceGenericActivation",
              comment: [
                "{0} will be an activation event, like e.g. 'language:typescript', 'debug', etc.",
                "{1} will be an extension identifier"
              ]
            }, "Activated by {1} on {0}", activationEvent, activationId);
          }
        } else {
          title = nls.localize("extensionActivating", "Extension is activating...");
        }
        data.elementDisposables.push(this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.activationTime, title));
        clearNode(data.msgContainer);
        if (this._getUnresponsiveProfile(element.description.identifier)) {
          const el = $("span", void 0, ...renderLabelWithIcons(` $(alert) Unresponsive`));
          const extensionHostFreezTitle = nls.localize("unresponsive.title", "Extension has caused the extension host to freeze.");
          data.elementDisposables.push(this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), el, extensionHostFreezTitle));
          data.msgContainer.appendChild(el);
        }
        if (isNonEmptyArray(element.status.runtimeErrors)) {
          const el = $("span", void 0, ...renderLabelWithIcons(`$(bug) ${nls.localize("errors", "{0} uncaught errors", element.status.runtimeErrors.length)}`));
          data.msgContainer.appendChild(el);
        }
        if (element.status.messages && element.status.messages.length > 0) {
          const el = $("span", void 0, ...renderLabelWithIcons(`$(alert) ${element.status.messages[0].message}`));
          data.msgContainer.appendChild(el);
        }
        let extraLabel = null;
        if (element.status.runningLocation && element.status.runningLocation.equals(new LocalWebWorkerRunningLocation(0))) {
          extraLabel = `$(globe) web worker`;
        } else if (element.description.extensionLocation.scheme === Schemas.vscodeRemote) {
          const hostLabel = this._labelService.getHostLabel(Schemas.vscodeRemote, this._environmentService.remoteAuthority);
          if (hostLabel) {
            extraLabel = `$(remote) ${hostLabel}`;
          } else {
            extraLabel = `$(remote) ${element.description.extensionLocation.authority}`;
          }
        } else if (element.status.runningLocation && element.status.runningLocation.affinity > 0) {
          extraLabel = element.status.runningLocation instanceof LocalWebWorkerRunningLocation ? `$(globe) web worker ${element.status.runningLocation.affinity + 1}` : `$(server-process) local process ${element.status.runningLocation.affinity + 1}`;
        }
        if (extraLabel) {
          const el = $("span", void 0, ...renderLabelWithIcons(extraLabel));
          data.msgContainer.appendChild(el);
        }
        const features = Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures();
        for (const feature of features) {
          const accessData = this._extensionFeaturesManagementService.getAccessData(element.description.identifier, feature.id);
          if (accessData) {
            const status = accessData?.current?.status;
            if (status) {
              data.msgContainer.appendChild($("span", void 0, `${feature.label}: `));
              data.msgContainer.appendChild($("span", void 0, ...renderLabelWithIcons(`$(${status.severity === Severity.Error ? errorIcon.id : warningIcon.id}) ${status.message}`)));
            }
            if (accessData?.accessTimes.length > 0) {
              const element2 = $("span", void 0, `${nls.localize("requests count", "{0} Usage: {1} Requests", feature.label, accessData.accessTimes.length)}${accessData.current ? nls.localize("session requests count", ", {0} Requests (Session)", accessData.current.accessTimes.length) : ""}`);
              if (accessData.current) {
                const title2 = nls.localize("requests count title", "Last request was {0}.", fromNow(accessData.current.lastAccessed, true, true));
                data.elementDisposables.push(this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), element2, title2));
              }
              data.msgContainer.appendChild(element2);
            }
          }
        }
        if (element.profileInfo) {
          data.profileTime.textContent = `Profile: ${(element.profileInfo.totalTime / 1e3).toFixed(2)}ms`;
        } else {
          data.profileTime.textContent = "";
        }
      },
      disposeTemplate: (data) => {
        data.disposables = dispose(data.disposables);
        data.elementDisposables = dispose(data.elementDisposables);
      }
    };
    this._list = this._register(this._instantiationService.createInstance(
      WorkbenchList,
      "RuntimeExtensions",
      parent,
      delegate,
      [renderer],
      {
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        horizontalScrolling: false,
        overrideStyles: {
          listBackground: editorBackground
        },
        accessibilityProvider: new class {
          getWidgetAriaLabel() {
            return nls.localize("runtimeExtensions", "Runtime Extensions");
          }
          getAriaLabel(element) {
            return element.description.name;
          }
        }()
      }
    ));
    this._list.splice(0, this._list.length, this._elements || void 0);
    this._register(this._list.onContextMenu((e) => {
      if (!e.element) {
        return;
      }
      const actions = [];
      actions.push(new Action(
        "runtimeExtensionsEditor.action.copyId",
        nls.localize("copy id", "Copy id ({0})", e.element.description.identifier.value),
        void 0,
        true,
        () => {
          this._clipboardService.writeText(e.element.description.identifier.value);
        }
      ));
      const reportExtensionIssueAction = this._createReportExtensionIssueAction(e.element);
      if (reportExtensionIssueAction) {
        actions.push(reportExtensionIssueAction);
      }
      actions.push(new Separator());
      if (e.element.marketplaceInfo) {
        actions.push(new Action("runtimeExtensionsEditor.action.disableWorkspace", nls.localize("disable workspace", "Disable (Workspace)"), void 0, true, () => this._extensionsWorkbenchService.setEnablement(e.element.marketplaceInfo, EnablementState.DisabledWorkspace)));
        actions.push(new Action("runtimeExtensionsEditor.action.disable", nls.localize("disable", "Disable"), void 0, true, () => this._extensionsWorkbenchService.setEnablement(e.element.marketplaceInfo, EnablementState.DisabledGlobally)));
      }
      actions.push(new Separator());
      const menuActions = this._menuService.getMenuActions(MenuId.ExtensionEditorContextMenu, this.contextKeyService);
      actions.push(...getContextMenuActions(menuActions).secondary);
      this._contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => actions
      });
    }));
  }
  layout(dimension) {
    this._list?.layout(dimension.height);
  }
};
AbstractRuntimeExtensionsEditor.ID = "workbench.editor.runtimeExtensions";
AbstractRuntimeExtensionsEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IExtensionsWorkbenchService),
  __decorateParam(5, IExtensionService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, ILabelService),
  __decorateParam(11, IWorkbenchEnvironmentService),
  __decorateParam(12, IClipboardService),
  __decorateParam(13, IExtensionFeaturesManagementService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, IMenuService)
], AbstractRuntimeExtensionsEditor);
class ShowRuntimeExtensionsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.showRuntimeExtensions",
      title: nls.localize2("showRuntimeExtensions", "Show Running Extensions"),
      category: Categories.Developer,
      f1: true,
      menu: {
        id: MenuId.ViewContainerTitle,
        when: ContextKeyExpr.equals("viewContainer", "workbench.view.extensions"),
        group: "2_enablement",
        order: 3
      }
    });
  }
  async run(accessor) {
    await accessor.get(IEditorService).openEditor(RuntimeExtensionsInput.instance, { pinned: true });
  }
}
export {
  AbstractRuntimeExtensionsEditor,
  ShowRuntimeExtensionsAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9hYnN0cmFjdFJ1bnRpbWVFeHRlbnNpb25zRWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgRGltZW5zaW9uLCBhcHBlbmQsIGNsZWFyTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSUxpc3RSZW5kZXJlciwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24sIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgaXNOb25FbXB0eUFycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBmcm9tTm93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgZ2V0Q29udGV4dE1lbnVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBFeHRlbnNpb25JZGVudGlmaWVyTWFwLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBlZGl0b3JCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLCBJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzLmpzJztcbmltcG9ydCB7IEVuYWJsZW1lbnRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgTG9jYWxXZWJXb3JrZXJSdW5uaW5nTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25SdW5uaW5nTG9jYXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkhvc3RQcm9maWxlLCBJRXh0ZW5zaW9uU2VydmljZSwgSUV4dGVuc2lvbnNTdGF0dXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb24sIElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFJ1bnRpbWVFeHRlbnNpb25zSW5wdXQgfSBmcm9tICcuLi9jb21tb24vcnVudGltZUV4dGVuc2lvbnNJbnB1dC5qcyc7XG5pbXBvcnQgeyBlcnJvckljb24sIHdhcm5pbmdJY29uIH0gZnJvbSAnLi9leHRlbnNpb25zSWNvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWNvbldpZGdldCB9IGZyb20gJy4vZXh0ZW5zaW9uc1dpZGdldHMuanMnO1xuaW1wb3J0ICcuL21lZGlhL3J1bnRpbWVFeHRlbnNpb25zRWRpdG9yLmNzcyc7XG5cbmludGVyZmFjZSBJRXh0ZW5zaW9uUHJvZmlsZUluZm9ybWF0aW9uIHtcblx0LyoqXG5cdCAqIHNlZ21lbnQgd2hlbiB0aGUgZXh0ZW5zaW9uIHdhcyBydW5uaW5nLlxuXHQgKiAyKmkgPSBzZWdtZW50IHN0YXJ0IHRpbWVcblx0ICogMippKzEgPSBzZWdtZW50IGVuZCB0aW1lXG5cdCAqL1xuXHRzZWdtZW50czogbnVtYmVyW107XG5cdC8qKlxuXHQgKiB0b3RhbCB0aW1lIHdoZW4gdGhlIGV4dGVuc2lvbiB3YXMgcnVubmluZy5cblx0ICogKHN1bSBvZiBhbGwgc2VnbWVudCBsZW5ndGhzKS5cblx0ICovXG5cdHRvdGFsVGltZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSdW50aW1lRXh0ZW5zaW9uIHtcblx0b3JpZ2luYWxJbmRleDogbnVtYmVyO1xuXHRkZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXHRtYXJrZXRwbGFjZUluZm86IElFeHRlbnNpb24gfCB1bmRlZmluZWQ7XG5cdHN0YXR1czogSUV4dGVuc2lvbnNTdGF0dXM7XG5cdHByb2ZpbGVJbmZvPzogSUV4dGVuc2lvblByb2ZpbGVJbmZvcm1hdGlvbjtcblx0dW5yZXNwb25zaXZlUHJvZmlsZT86IElFeHRlbnNpb25Ib3N0UHJvZmlsZTtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0UnVudGltZUV4dGVuc2lvbnNFZGl0b3IgZXh0ZW5kcyBFZGl0b3JQYW5lIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEOiBzdHJpbmcgPSAnd29ya2JlbmNoLmVkaXRvci5ydW50aW1lRXh0ZW5zaW9ucyc7XG5cblx0cHJpdmF0ZSBfbGlzdDogV29ya2JlbmNoTGlzdDxJUnVudGltZUV4dGVuc2lvbj4gfCBudWxsO1xuXHRwcml2YXRlIF9lbGVtZW50czogSVJ1bnRpbWVFeHRlbnNpb25bXSB8IG51bGw7XG5cdHByaXZhdGUgX3VwZGF0ZVNvb246IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Z3JvdXA6IElFZGl0b3JHcm91cCxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKEFic3RyYWN0UnVudGltZUV4dGVuc2lvbnNFZGl0b3IuSUQsIGdyb3VwLCB0ZWxlbWV0cnlTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2xpc3QgPSBudWxsO1xuXHRcdHRoaXMuX2VsZW1lbnRzID0gbnVsbDtcblx0XHR0aGlzLl91cGRhdGVTb29uID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fdXBkYXRlRXh0ZW5zaW9ucygpLCAyMDApKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zU3RhdHVzKCgpID0+IHRoaXMuX3VwZGF0ZVNvb24uc2NoZWR1bGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2V4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VBY2Nlc3NEYXRhKCgpID0+IHRoaXMuX3VwZGF0ZVNvb24uc2NoZWR1bGUoKSkpO1xuXHRcdHRoaXMuX3VwZGF0ZUV4dGVuc2lvbnMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfdXBkYXRlRXh0ZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9lbGVtZW50cyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVFeHRlbnNpb25zKCk7XG5cdFx0dGhpcy5fbGlzdD8uc3BsaWNlKDAsIHRoaXMuX2xpc3QubGVuZ3RoLCB0aGlzLl9lbGVtZW50cyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlRXh0ZW5zaW9ucygpOiBQcm9taXNlPElSdW50aW1lRXh0ZW5zaW9uW10+IHtcblx0XHQvLyBXZSBvbmx5IGRlYWwgd2l0aCBleHRlbnNpb25zIHdpdGggc291cmNlIGNvZGUhXG5cdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRjb25zdCBleHRlbnNpb25zRGVzY3JpcHRpb25zID0gdGhpcy5fZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLmZpbHRlcigoZXh0ZW5zaW9uKSA9PiB7XG5cdFx0XHRyZXR1cm4gQm9vbGVhbihleHRlbnNpb24ubWFpbikgfHwgQm9vbGVhbihleHRlbnNpb24uYnJvd3Nlcik7XG5cdFx0fSk7XG5cdFx0Y29uc3QgbWFya2V0cGxhY2VNYXAgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxJRXh0ZW5zaW9uPigpO1xuXHRcdGNvbnN0IG1hcmtldFBsYWNlRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuX2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5TG9jYWwoKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBtYXJrZXRQbGFjZUV4dGVuc2lvbnMpIHtcblx0XHRcdG1hcmtldHBsYWNlTWFwLnNldChleHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0dXNNYXAgPSB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbnNTdGF0dXMoKTtcblxuXHRcdC8vIGdyb3VwIHByb2ZpbGUgc2VnbWVudHMgYnkgZXh0ZW5zaW9uXG5cdFx0Y29uc3Qgc2VnbWVudHMgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxudW1iZXJbXT4oKTtcblxuXHRcdGNvbnN0IHByb2ZpbGVJbmZvID0gdGhpcy5fZ2V0UHJvZmlsZUluZm8oKTtcblx0XHRpZiAocHJvZmlsZUluZm8pIHtcblx0XHRcdGxldCBjdXJyZW50U3RhcnRUaW1lID0gcHJvZmlsZUluZm8uc3RhcnRUaW1lO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHByb2ZpbGVJbmZvLmRlbHRhcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBpZCA9IHByb2ZpbGVJbmZvLmlkc1tpXTtcblx0XHRcdFx0Y29uc3QgZGVsdGEgPSBwcm9maWxlSW5mby5kZWx0YXNbaV07XG5cblx0XHRcdFx0bGV0IGV4dGVuc2lvblNlZ21lbnRzID0gc2VnbWVudHMuZ2V0KGlkKTtcblx0XHRcdFx0aWYgKCFleHRlbnNpb25TZWdtZW50cykge1xuXHRcdFx0XHRcdGV4dGVuc2lvblNlZ21lbnRzID0gW107XG5cdFx0XHRcdFx0c2VnbWVudHMuc2V0KGlkLCBleHRlbnNpb25TZWdtZW50cyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRleHRlbnNpb25TZWdtZW50cy5wdXNoKGN1cnJlbnRTdGFydFRpbWUpO1xuXHRcdFx0XHRjdXJyZW50U3RhcnRUaW1lID0gY3VycmVudFN0YXJ0VGltZSArIGRlbHRhO1xuXHRcdFx0XHRleHRlbnNpb25TZWdtZW50cy5wdXNoKGN1cnJlbnRTdGFydFRpbWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCByZXN1bHQ6IElSdW50aW1lRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gZXh0ZW5zaW9uc0Rlc2NyaXB0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uRGVzY3JpcHRpb24gPSBleHRlbnNpb25zRGVzY3JpcHRpb25zW2ldO1xuXG5cdFx0XHRsZXQgZXh0UHJvZmlsZUluZm86IElFeHRlbnNpb25Qcm9maWxlSW5mb3JtYXRpb24gfCBudWxsID0gbnVsbDtcblx0XHRcdGlmIChwcm9maWxlSW5mbykge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25TZWdtZW50cyA9IHNlZ21lbnRzLmdldChleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyKSB8fCBbXTtcblx0XHRcdFx0bGV0IGV4dGVuc2lvblRvdGFsVGltZSA9IDA7XG5cdFx0XHRcdGZvciAobGV0IGogPSAwLCBsZW5KID0gZXh0ZW5zaW9uU2VnbWVudHMubGVuZ3RoIC8gMjsgaiA8IGxlbko7IGorKykge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXJ0VGltZSA9IGV4dGVuc2lvblNlZ21lbnRzWzIgKiBqXTtcblx0XHRcdFx0XHRjb25zdCBlbmRUaW1lID0gZXh0ZW5zaW9uU2VnbWVudHNbMiAqIGogKyAxXTtcblx0XHRcdFx0XHRleHRlbnNpb25Ub3RhbFRpbWUgKz0gKGVuZFRpbWUgLSBzdGFydFRpbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGV4dFByb2ZpbGVJbmZvID0ge1xuXHRcdFx0XHRcdHNlZ21lbnRzOiBleHRlbnNpb25TZWdtZW50cyxcblx0XHRcdFx0XHR0b3RhbFRpbWU6IGV4dGVuc2lvblRvdGFsVGltZVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHRbaV0gPSB7XG5cdFx0XHRcdG9yaWdpbmFsSW5kZXg6IGksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdFx0bWFya2V0cGxhY2VJbmZvOiBtYXJrZXRwbGFjZU1hcC5nZXQoZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllciksXG5cdFx0XHRcdHN0YXR1czogc3RhdHVzTWFwW2V4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWVdLFxuXHRcdFx0XHRwcm9maWxlSW5mbzogZXh0UHJvZmlsZUluZm8gfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHR1bnJlc3BvbnNpdmVQcm9maWxlOiB0aGlzLl9nZXRVbnJlc3BvbnNpdmVQcm9maWxlKGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIpXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJlc3VsdCA9IHJlc3VsdC5maWx0ZXIoZWxlbWVudCA9PiBlbGVtZW50LnN0YXR1cy5hY3RpdmF0aW9uU3RhcnRlZCk7XG5cblx0XHQvLyBidWJibGUgdXAgZXh0ZW5zaW9ucyB0aGF0IGhhdmUgY2F1c2VkIHNsb3duZXNzXG5cblx0XHRjb25zdCBpc1VucmVzcG9uc2l2ZSA9IChleHRlbnNpb246IElSdW50aW1lRXh0ZW5zaW9uKTogYm9vbGVhbiA9PlxuXHRcdFx0ZXh0ZW5zaW9uLnVucmVzcG9uc2l2ZVByb2ZpbGUgPT09IHByb2ZpbGVJbmZvO1xuXG5cdFx0Y29uc3QgcHJvZmlsZVRpbWUgPSAoZXh0ZW5zaW9uOiBJUnVudGltZUV4dGVuc2lvbik6IG51bWJlciA9PlxuXHRcdFx0ZXh0ZW5zaW9uLnByb2ZpbGVJbmZvPy50b3RhbFRpbWUgPz8gMDtcblxuXHRcdGNvbnN0IGFjdGl2YXRpb25UaW1lID0gKGV4dGVuc2lvbjogSVJ1bnRpbWVFeHRlbnNpb24pOiBudW1iZXIgPT5cblx0XHRcdChleHRlbnNpb24uc3RhdHVzLmFjdGl2YXRpb25UaW1lcz8uY29kZUxvYWRpbmdUaW1lID8/IDApICtcblx0XHRcdChleHRlbnNpb24uc3RhdHVzLmFjdGl2YXRpb25UaW1lcz8uYWN0aXZhdGVDYWxsVGltZSA/PyAwKTtcblxuXHRcdHJlc3VsdCA9IHJlc3VsdC5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAoaXNVbnJlc3BvbnNpdmUoYSkgfHwgaXNVbnJlc3BvbnNpdmUoYikpIHtcblx0XHRcdFx0cmV0dXJuICtpc1VucmVzcG9uc2l2ZShiKSAtICtpc1VucmVzcG9uc2l2ZShhKTtcblx0XHRcdH0gZWxzZSBpZiAocHJvZmlsZVRpbWUoYSkgfHwgcHJvZmlsZVRpbWUoYikpIHtcblx0XHRcdFx0cmV0dXJuIHByb2ZpbGVUaW1lKGIpIC0gcHJvZmlsZVRpbWUoYSk7XG5cdFx0XHR9IGVsc2UgaWYgKGFjdGl2YXRpb25UaW1lKGEpIHx8IGFjdGl2YXRpb25UaW1lKGIpKSB7XG5cdFx0XHRcdHJldHVybiBhY3RpdmF0aW9uVGltZShiKSAtIGFjdGl2YXRpb25UaW1lKGEpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGEub3JpZ2luYWxJbmRleCAtIGIub3JpZ2luYWxJbmRleDtcblx0XHR9KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRwYXJlbnQuY2xhc3NMaXN0LmFkZCgncnVudGltZS1leHRlbnNpb25zLWVkaXRvcicpO1xuXG5cdFx0Y29uc3QgVEVNUExBVEVfSUQgPSAncnVudGltZUV4dGVuc2lvbkVsZW1lbnRUZW1wbGF0ZSc7XG5cblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPElSdW50aW1lRXh0ZW5zaW9uPiB7XG5cdFx0XHRnZXRIZWlnaHQoZWxlbWVudDogSVJ1bnRpbWVFeHRlbnNpb24pOiBudW1iZXIge1xuXHRcdFx0XHRyZXR1cm4gNzA7XG5cdFx0XHR9XG5cdFx0XHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IElSdW50aW1lRXh0ZW5zaW9uKTogc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuIFRFTVBMQVRFX0lEO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpbnRlcmZhY2UgSVJ1bnRpbWVFeHRlbnNpb25UZW1wbGF0ZURhdGEge1xuXHRcdFx0cm9vdDogSFRNTEVsZW1lbnQ7XG5cdFx0XHRlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0XHRcdG5hbWU6IEhUTUxFbGVtZW50O1xuXHRcdFx0dmVyc2lvbjogSFRNTEVsZW1lbnQ7XG5cdFx0XHRtc2dDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRcdFx0YWN0aW9uYmFyOiBBY3Rpb25CYXI7XG5cdFx0XHRhY3RpdmF0aW9uVGltZTogSFRNTEVsZW1lbnQ7XG5cdFx0XHRwcm9maWxlVGltZTogSFRNTEVsZW1lbnQ7XG5cdFx0XHRkaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXTtcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXTtcblx0XHRcdGV4dGVuc2lvbjogSUV4dGVuc2lvbiB8IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZW5kZXJlcjogSUxpc3RSZW5kZXJlcjxJUnVudGltZUV4dGVuc2lvbiwgSVJ1bnRpbWVFeHRlbnNpb25UZW1wbGF0ZURhdGE+ID0ge1xuXHRcdFx0dGVtcGxhdGVJZDogVEVNUExBVEVfSUQsXG5cdFx0XHRyZW5kZXJUZW1wbGF0ZTogKHJvb3Q6IEhUTUxFbGVtZW50KTogSVJ1bnRpbWVFeHRlbnNpb25UZW1wbGF0ZURhdGEgPT4ge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gYXBwZW5kKHJvb3QsICQoJy5leHRlbnNpb24nKSk7XG5cdFx0XHRcdGNvbnN0IGljb25Db250YWluZXIgPSBhcHBlbmQoZWxlbWVudCwgJCgnLmljb24tY29udGFpbmVyJykpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25JY29uV2lkZ2V0ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uSWNvbldpZGdldCwgaWNvbkNvbnRhaW5lcik7XG5cblx0XHRcdFx0Y29uc3QgZGVzYyA9IGFwcGVuZChlbGVtZW50LCAkKCdkaXYuZGVzYycpKTtcblx0XHRcdFx0Y29uc3QgaGVhZGVyQ29udGFpbmVyID0gYXBwZW5kKGRlc2MsICQoJy5oZWFkZXItY29udGFpbmVyJykpO1xuXHRcdFx0XHRjb25zdCBoZWFkZXIgPSBhcHBlbmQoaGVhZGVyQ29udGFpbmVyLCAkKCcuaGVhZGVyJykpO1xuXHRcdFx0XHRjb25zdCBuYW1lID0gYXBwZW5kKGhlYWRlciwgJCgnZGl2Lm5hbWUnKSk7XG5cdFx0XHRcdGNvbnN0IHZlcnNpb24gPSBhcHBlbmQoaGVhZGVyLCAkKCdzcGFuLnZlcnNpb24nKSk7XG5cblx0XHRcdFx0Y29uc3QgbXNnQ29udGFpbmVyID0gYXBwZW5kKGRlc2MsICQoJ2Rpdi5tc2cnKSk7XG5cblx0XHRcdFx0Y29uc3QgYWN0aW9uYmFyID0gbmV3IEFjdGlvbkJhcihkZXNjKTtcblx0XHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBhY3Rpb25iYXIub25EaWRSdW4oKHsgZXJyb3IgfSkgPT4gZXJyb3IgJiYgdGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvcikpO1xuXG5cdFx0XHRcdGNvbnN0IHRpbWVDb250YWluZXIgPSBhcHBlbmQoZWxlbWVudCwgJCgnLnRpbWUnKSk7XG5cdFx0XHRcdGNvbnN0IGFjdGl2YXRpb25UaW1lID0gYXBwZW5kKHRpbWVDb250YWluZXIsICQoJ2Rpdi5hY3RpdmF0aW9uLXRpbWUnKSk7XG5cdFx0XHRcdGNvbnN0IHByb2ZpbGVUaW1lID0gYXBwZW5kKHRpbWVDb250YWluZXIsICQoJ2Rpdi5wcm9maWxlLXRpbWUnKSk7XG5cblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBbZXh0ZW5zaW9uSWNvbldpZGdldCwgYWN0aW9uYmFyLCBsaXN0ZW5lcl07XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRyb290LFxuXHRcdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdFx0bmFtZSxcblx0XHRcdFx0XHR2ZXJzaW9uLFxuXHRcdFx0XHRcdGFjdGlvbmJhcixcblx0XHRcdFx0XHRhY3RpdmF0aW9uVGltZSxcblx0XHRcdFx0XHRwcm9maWxlVGltZSxcblx0XHRcdFx0XHRtc2dDb250YWluZXIsXG5cdFx0XHRcdFx0c2V0IGV4dGVuc2lvbihleHRlbnNpb246IElFeHRlbnNpb24gfCB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbkljb25XaWRnZXQuZXh0ZW5zaW9uID0gZXh0ZW5zaW9uIHx8IG51bGw7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdFx0XHRlbGVtZW50RGlzcG9zYWJsZXM6IFtdLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblxuXHRcdFx0cmVuZGVyRWxlbWVudDogKGVsZW1lbnQ6IElSdW50aW1lRXh0ZW5zaW9uLCBpbmRleDogbnVtYmVyLCBkYXRhOiBJUnVudGltZUV4dGVuc2lvblRlbXBsYXRlRGF0YSk6IHZvaWQgPT4ge1xuXG5cdFx0XHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzID0gZGlzcG9zZShkYXRhLmVsZW1lbnREaXNwb3NhYmxlcyk7XG5cdFx0XHRcdGRhdGEuZXh0ZW5zaW9uID0gZWxlbWVudC5tYXJrZXRwbGFjZUluZm87XG5cblx0XHRcdFx0ZGF0YS5yb290LmNsYXNzTGlzdC50b2dnbGUoJ29kZCcsIGluZGV4ICUgMiA9PT0gMSk7XG5cblx0XHRcdFx0ZGF0YS5uYW1lLnRleHRDb250ZW50ID0gKGVsZW1lbnQubWFya2V0cGxhY2VJbmZvPy5kaXNwbGF5TmFtZSB8fCBlbGVtZW50LmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUpLnN1YnN0cigwLCA1MCk7XG5cdFx0XHRcdGRhdGEudmVyc2lvbi50ZXh0Q29udGVudCA9IGVsZW1lbnQuZGVzY3JpcHRpb24udmVyc2lvbjtcblxuXHRcdFx0XHRjb25zdCBhY3RpdmF0aW9uVGltZXMgPSBlbGVtZW50LnN0YXR1cy5hY3RpdmF0aW9uVGltZXM7XG5cdFx0XHRcdGlmIChhY3RpdmF0aW9uVGltZXMpIHtcblx0XHRcdFx0XHRjb25zdCBzeW5jVGltZSA9IGFjdGl2YXRpb25UaW1lcy5jb2RlTG9hZGluZ1RpbWUgKyBhY3RpdmF0aW9uVGltZXMuYWN0aXZhdGVDYWxsVGltZTtcblx0XHRcdFx0XHRkYXRhLmFjdGl2YXRpb25UaW1lLnRleHRDb250ZW50ID0gYWN0aXZhdGlvblRpbWVzLmFjdGl2YXRpb25SZWFzb24uc3RhcnR1cCA/IGBTdGFydHVwIEFjdGl2YXRpb246ICR7c3luY1RpbWV9bXNgIDogYEFjdGl2YXRpb246ICR7c3luY1RpbWV9bXNgO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRhdGEuYWN0aXZhdGlvblRpbWUudGV4dENvbnRlbnQgPSBgQWN0aXZhdGluZy4uLmA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkYXRhLmFjdGlvbmJhci5jbGVhcigpO1xuXHRcdFx0XHRjb25zdCBzbG93RXh0ZW5zaW9uQWN0aW9uID0gdGhpcy5fY3JlYXRlU2xvd0V4dGVuc2lvbkFjdGlvbihlbGVtZW50KTtcblx0XHRcdFx0aWYgKHNsb3dFeHRlbnNpb25BY3Rpb24pIHtcblx0XHRcdFx0XHRkYXRhLmFjdGlvbmJhci5wdXNoKHNsb3dFeHRlbnNpb25BY3Rpb24sIHsgaWNvbjogZmFsc2UsIGxhYmVsOiB0cnVlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpc05vbkVtcHR5QXJyYXkoZWxlbWVudC5zdGF0dXMucnVudGltZUVycm9ycykpIHtcblx0XHRcdFx0XHRjb25zdCByZXBvcnRFeHRlbnNpb25Jc3N1ZUFjdGlvbiA9IHRoaXMuX2NyZWF0ZVJlcG9ydEV4dGVuc2lvbklzc3VlQWN0aW9uKGVsZW1lbnQpO1xuXHRcdFx0XHRcdGlmIChyZXBvcnRFeHRlbnNpb25Jc3N1ZUFjdGlvbikge1xuXHRcdFx0XHRcdFx0ZGF0YS5hY3Rpb25iYXIucHVzaChyZXBvcnRFeHRlbnNpb25Jc3N1ZUFjdGlvbiwgeyBpY29uOiBmYWxzZSwgbGFiZWw6IHRydWUgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IHRpdGxlOiBzdHJpbmc7XG5cdFx0XHRcdGlmIChhY3RpdmF0aW9uVGltZXMpIHtcblx0XHRcdFx0XHRjb25zdCBhY3RpdmF0aW9uSWQgPSBhY3RpdmF0aW9uVGltZXMuYWN0aXZhdGlvblJlYXNvbi5leHRlbnNpb25JZC52YWx1ZTtcblx0XHRcdFx0XHRjb25zdCBhY3RpdmF0aW9uRXZlbnQgPSBhY3RpdmF0aW9uVGltZXMuYWN0aXZhdGlvblJlYXNvbi5hY3RpdmF0aW9uRXZlbnQ7XG5cdFx0XHRcdFx0aWYgKGFjdGl2YXRpb25FdmVudCA9PT0gJyonKSB7XG5cdFx0XHRcdFx0XHR0aXRsZSA9IG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdFx0XHRcdGtleTogJ3N0YXJBY3RpdmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdFx0XHRcdCd7MH0gd2lsbCBiZSBhbiBleHRlbnNpb24gaWRlbnRpZmllcidcblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fSwgXCJBY3RpdmF0ZWQgYnkgezB9IG9uIHN0YXJ0LXVwXCIsIGFjdGl2YXRpb25JZCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICgvXndvcmtzcGFjZUNvbnRhaW5zOi8udGVzdChhY3RpdmF0aW9uRXZlbnQpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBmaWxlTmFtZU9yR2xvYiA9IGFjdGl2YXRpb25FdmVudC5zdWJzdHIoJ3dvcmtzcGFjZUNvbnRhaW5zOicubGVuZ3RoKTtcblx0XHRcdFx0XHRcdGlmIChmaWxlTmFtZU9yR2xvYi5pbmRleE9mKCcqJykgPj0gMCB8fCBmaWxlTmFtZU9yR2xvYi5pbmRleE9mKCc/JykgPj0gMCkge1xuXHRcdFx0XHRcdFx0XHR0aXRsZSA9IG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdFx0XHRcdFx0a2V5OiAnd29ya3NwYWNlQ29udGFpbnNHbG9iQWN0aXZhdGlvbicsXG5cdFx0XHRcdFx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdFx0XHRcdFx0J3swfSB3aWxsIGJlIGEgZ2xvYiBwYXR0ZXJuJyxcblx0XHRcdFx0XHRcdFx0XHRcdCd7MX0gd2lsbCBiZSBhbiBleHRlbnNpb24gaWRlbnRpZmllcidcblx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdH0sIFwiQWN0aXZhdGVkIGJ5IHsxfSBiZWNhdXNlIGEgZmlsZSBtYXRjaGluZyB7MH0gZXhpc3RzIGluIHlvdXIgd29ya3NwYWNlXCIsIGZpbGVOYW1lT3JHbG9iLCBhY3RpdmF0aW9uSWQpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGl0bGUgPSBubHMubG9jYWxpemUoe1xuXHRcdFx0XHRcdFx0XHRcdGtleTogJ3dvcmtzcGFjZUNvbnRhaW5zRmlsZUFjdGl2YXRpb24nLFxuXHRcdFx0XHRcdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHRcdFx0XHRcdCd7MH0gd2lsbCBiZSBhIGZpbGUgbmFtZScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnezF9IHdpbGwgYmUgYW4gZXh0ZW5zaW9uIGlkZW50aWZpZXInXG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9LCBcIkFjdGl2YXRlZCBieSB7MX0gYmVjYXVzZSBmaWxlIHswfSBleGlzdHMgaW4geW91ciB3b3Jrc3BhY2VcIiwgZmlsZU5hbWVPckdsb2IsIGFjdGl2YXRpb25JZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmICgvXndvcmtzcGFjZUNvbnRhaW5zVGltZW91dDovLnRlc3QoYWN0aXZhdGlvbkV2ZW50KSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZ2xvYiA9IGFjdGl2YXRpb25FdmVudC5zdWJzdHIoJ3dvcmtzcGFjZUNvbnRhaW5zVGltZW91dDonLmxlbmd0aCk7XG5cdFx0XHRcdFx0XHR0aXRsZSA9IG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdFx0XHRcdGtleTogJ3dvcmtzcGFjZUNvbnRhaW5zVGltZW91dCcsXG5cdFx0XHRcdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHRcdFx0XHQnezB9IHdpbGwgYmUgYSBnbG9iIHBhdHRlcm4nLFxuXHRcdFx0XHRcdFx0XHRcdCd7MX0gd2lsbCBiZSBhbiBleHRlbnNpb24gaWRlbnRpZmllcidcblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fSwgXCJBY3RpdmF0ZWQgYnkgezF9IGJlY2F1c2Ugc2VhcmNoaW5nIGZvciB7MH0gdG9vayB0b28gbG9uZ1wiLCBnbG9iLCBhY3RpdmF0aW9uSWQpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoYWN0aXZhdGlvbkV2ZW50ID09PSAnb25TdGFydHVwRmluaXNoZWQnKSB7XG5cdFx0XHRcdFx0XHR0aXRsZSA9IG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdFx0XHRcdGtleTogJ3N0YXJ0dXBGaW5pc2hlZEFjdGl2YXRpb24nLFxuXHRcdFx0XHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0XHRcdFx0J1RoaXMgcmVmZXJzIHRvIGFuIGV4dGVuc2lvbi4gezB9IHdpbGwgYmUgYW4gYWN0aXZhdGlvbiBldmVudC4nXG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH0sIFwiQWN0aXZhdGVkIGJ5IHswfSBhZnRlciBzdGFydC11cCBmaW5pc2hlZFwiLCBhY3RpdmF0aW9uSWQpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoL15vbkxhbmd1YWdlOi8udGVzdChhY3RpdmF0aW9uRXZlbnQpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsYW5ndWFnZSA9IGFjdGl2YXRpb25FdmVudC5zdWJzdHIoJ29uTGFuZ3VhZ2U6Jy5sZW5ndGgpO1xuXHRcdFx0XHRcdFx0dGl0bGUgPSBubHMubG9jYWxpemUoJ2xhbmd1YWdlQWN0aXZhdGlvbicsIFwiQWN0aXZhdGVkIGJ5IHsxfSBiZWNhdXNlIHlvdSBvcGVuZWQgYSB7MH0gZmlsZVwiLCBsYW5ndWFnZSwgYWN0aXZhdGlvbklkKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGl0bGUgPSBubHMubG9jYWxpemUoe1xuXHRcdFx0XHRcdFx0XHRrZXk6ICd3b3Jrc3BhY2VHZW5lcmljQWN0aXZhdGlvbicsXG5cdFx0XHRcdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHRcdFx0XHQnezB9IHdpbGwgYmUgYW4gYWN0aXZhdGlvbiBldmVudCwgbGlrZSBlLmcuIFxcJ2xhbmd1YWdlOnR5cGVzY3JpcHRcXCcsIFxcJ2RlYnVnXFwnLCBldGMuJyxcblx0XHRcdFx0XHRcdFx0XHQnezF9IHdpbGwgYmUgYW4gZXh0ZW5zaW9uIGlkZW50aWZpZXInXG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH0sIFwiQWN0aXZhdGVkIGJ5IHsxfSBvbiB7MH1cIiwgYWN0aXZhdGlvbkV2ZW50LCBhY3RpdmF0aW9uSWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aXRsZSA9IG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uQWN0aXZhdGluZycsIFwiRXh0ZW5zaW9uIGlzIGFjdGl2YXRpbmcuLi5cIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMucHVzaCh0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGRhdGEuYWN0aXZhdGlvblRpbWUsIHRpdGxlKSk7XG5cblx0XHRcdFx0Y2xlYXJOb2RlKGRhdGEubXNnQ29udGFpbmVyKTtcblxuXHRcdFx0XHRpZiAodGhpcy5fZ2V0VW5yZXNwb25zaXZlUHJvZmlsZShlbGVtZW50LmRlc2NyaXB0aW9uLmlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdFx0Y29uc3QgZWwgPSAkKCdzcGFuJywgdW5kZWZpbmVkLCAuLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhgICQoYWxlcnQpIFVucmVzcG9uc2l2ZWApKTtcblx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25Ib3N0RnJlZXpUaXRsZSA9IG5scy5sb2NhbGl6ZSgndW5yZXNwb25zaXZlLnRpdGxlJywgXCJFeHRlbnNpb24gaGFzIGNhdXNlZCB0aGUgZXh0ZW5zaW9uIGhvc3QgdG8gZnJlZXplLlwiKTtcblx0XHRcdFx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5wdXNoKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZWwsIGV4dGVuc2lvbkhvc3RGcmVlelRpdGxlKSk7XG5cblx0XHRcdFx0XHRkYXRhLm1zZ0NvbnRhaW5lci5hcHBlbmRDaGlsZChlbCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNOb25FbXB0eUFycmF5KGVsZW1lbnQuc3RhdHVzLnJ1bnRpbWVFcnJvcnMpKSB7XG5cdFx0XHRcdFx0Y29uc3QgZWwgPSAkKCdzcGFuJywgdW5kZWZpbmVkLCAuLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhgJChidWcpICR7bmxzLmxvY2FsaXplKCdlcnJvcnMnLCBcInswfSB1bmNhdWdodCBlcnJvcnNcIiwgZWxlbWVudC5zdGF0dXMucnVudGltZUVycm9ycy5sZW5ndGgpfWApKTtcblx0XHRcdFx0XHRkYXRhLm1zZ0NvbnRhaW5lci5hcHBlbmRDaGlsZChlbCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZWxlbWVudC5zdGF0dXMubWVzc2FnZXMgJiYgZWxlbWVudC5zdGF0dXMubWVzc2FnZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGVsID0gJCgnc3BhbicsIHVuZGVmaW5lZCwgLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoYCQoYWxlcnQpICR7ZWxlbWVudC5zdGF0dXMubWVzc2FnZXNbMF0ubWVzc2FnZX1gKSk7XG5cdFx0XHRcdFx0ZGF0YS5tc2dDb250YWluZXIuYXBwZW5kQ2hpbGQoZWwpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGV4dHJhTGFiZWw6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdFx0XHRpZiAoZWxlbWVudC5zdGF0dXMucnVubmluZ0xvY2F0aW9uICYmIGVsZW1lbnQuc3RhdHVzLnJ1bm5pbmdMb2NhdGlvbi5lcXVhbHMobmV3IExvY2FsV2ViV29ya2VyUnVubmluZ0xvY2F0aW9uKDApKSkge1xuXHRcdFx0XHRcdGV4dHJhTGFiZWwgPSBgJChnbG9iZSkgd2ViIHdvcmtlcmA7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudC5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbi5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlKSB7XG5cdFx0XHRcdFx0Y29uc3QgaG9zdExhYmVsID0gdGhpcy5fbGFiZWxTZXJ2aWNlLmdldEhvc3RMYWJlbChTY2hlbWFzLnZzY29kZVJlbW90ZSwgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSk7XG5cdFx0XHRcdFx0aWYgKGhvc3RMYWJlbCkge1xuXHRcdFx0XHRcdFx0ZXh0cmFMYWJlbCA9IGAkKHJlbW90ZSkgJHtob3N0TGFiZWx9YDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZXh0cmFMYWJlbCA9IGAkKHJlbW90ZSkgJHtlbGVtZW50LmRlc2NyaXB0aW9uLmV4dGVuc2lvbkxvY2F0aW9uLmF1dGhvcml0eX1gO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChlbGVtZW50LnN0YXR1cy5ydW5uaW5nTG9jYXRpb24gJiYgZWxlbWVudC5zdGF0dXMucnVubmluZ0xvY2F0aW9uLmFmZmluaXR5ID4gMCkge1xuXHRcdFx0XHRcdGV4dHJhTGFiZWwgPSBlbGVtZW50LnN0YXR1cy5ydW5uaW5nTG9jYXRpb24gaW5zdGFuY2VvZiBMb2NhbFdlYldvcmtlclJ1bm5pbmdMb2NhdGlvblxuXHRcdFx0XHRcdFx0PyBgJChnbG9iZSkgd2ViIHdvcmtlciAke2VsZW1lbnQuc3RhdHVzLnJ1bm5pbmdMb2NhdGlvbi5hZmZpbml0eSArIDF9YFxuXHRcdFx0XHRcdFx0OiBgJChzZXJ2ZXItcHJvY2VzcykgbG9jYWwgcHJvY2VzcyAke2VsZW1lbnQuc3RhdHVzLnJ1bm5pbmdMb2NhdGlvbi5hZmZpbml0eSArIDF9YDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChleHRyYUxhYmVsKSB7XG5cdFx0XHRcdFx0Y29uc3QgZWwgPSAkKCdzcGFuJywgdW5kZWZpbmVkLCAuLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhleHRyYUxhYmVsKSk7XG5cdFx0XHRcdFx0ZGF0YS5tc2dDb250YWluZXIuYXBwZW5kQ2hpbGQoZWwpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZmVhdHVyZXMgPSBSZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5nZXRFeHRlbnNpb25GZWF0dXJlcygpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGZlYXR1cmUgb2YgZmVhdHVyZXMpIHtcblx0XHRcdFx0XHRjb25zdCBhY2Nlc3NEYXRhID0gdGhpcy5fZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZS5nZXRBY2Nlc3NEYXRhKGVsZW1lbnQuZGVzY3JpcHRpb24uaWRlbnRpZmllciwgZmVhdHVyZS5pZCk7XG5cdFx0XHRcdFx0aWYgKGFjY2Vzc0RhdGEpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHN0YXR1cyA9IGFjY2Vzc0RhdGE/LmN1cnJlbnQ/LnN0YXR1cztcblx0XHRcdFx0XHRcdGlmIChzdGF0dXMpIHtcblx0XHRcdFx0XHRcdFx0ZGF0YS5tc2dDb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnc3BhbicsIHVuZGVmaW5lZCwgYCR7ZmVhdHVyZS5sYWJlbH06IGApKTtcblx0XHRcdFx0XHRcdFx0ZGF0YS5tc2dDb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnc3BhbicsIHVuZGVmaW5lZCwgLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoYCQoJHtzdGF0dXMuc2V2ZXJpdHkgPT09IFNldmVyaXR5LkVycm9yID8gZXJyb3JJY29uLmlkIDogd2FybmluZ0ljb24uaWR9KSAke3N0YXR1cy5tZXNzYWdlfWApKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoYWNjZXNzRGF0YT8uYWNjZXNzVGltZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBlbGVtZW50ID0gJCgnc3BhbicsIHVuZGVmaW5lZCwgYCR7bmxzLmxvY2FsaXplKCdyZXF1ZXN0cyBjb3VudCcsIFwiezB9IFVzYWdlOiB7MX0gUmVxdWVzdHNcIiwgZmVhdHVyZS5sYWJlbCwgYWNjZXNzRGF0YS5hY2Nlc3NUaW1lcy5sZW5ndGgpfSR7YWNjZXNzRGF0YS5jdXJyZW50ID8gbmxzLmxvY2FsaXplKCdzZXNzaW9uIHJlcXVlc3RzIGNvdW50JywgXCIsIHswfSBSZXF1ZXN0cyAoU2Vzc2lvbilcIiwgYWNjZXNzRGF0YS5jdXJyZW50LmFjY2Vzc1RpbWVzLmxlbmd0aCkgOiAnJ31gKTtcblx0XHRcdFx0XHRcdFx0aWYgKGFjY2Vzc0RhdGEuY3VycmVudCkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHRpdGxlID0gbmxzLmxvY2FsaXplKCdyZXF1ZXN0cyBjb3VudCB0aXRsZScsIFwiTGFzdCByZXF1ZXN0IHdhcyB7MH0uXCIsIGZyb21Ob3coYWNjZXNzRGF0YS5jdXJyZW50Lmxhc3RBY2Nlc3NlZCwgdHJ1ZSwgdHJ1ZSkpO1xuXHRcdFx0XHRcdFx0XHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLnB1c2godGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBlbGVtZW50LCB0aXRsZSkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0ZGF0YS5tc2dDb250YWluZXIuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGVsZW1lbnQucHJvZmlsZUluZm8pIHtcblx0XHRcdFx0XHRkYXRhLnByb2ZpbGVUaW1lLnRleHRDb250ZW50ID0gYFByb2ZpbGU6ICR7KGVsZW1lbnQucHJvZmlsZUluZm8udG90YWxUaW1lIC8gMTAwMCkudG9GaXhlZCgyKX1tc2A7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGF0YS5wcm9maWxlVGltZS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0XHR9XG5cblx0XHRcdH0sXG5cblx0XHRcdGRpc3Bvc2VUZW1wbGF0ZTogKGRhdGE6IElSdW50aW1lRXh0ZW5zaW9uVGVtcGxhdGVEYXRhKTogdm9pZCA9PiB7XG5cdFx0XHRcdGRhdGEuZGlzcG9zYWJsZXMgPSBkaXNwb3NlKGRhdGEuZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcyA9IGRpc3Bvc2UoZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLl9saXN0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoTGlzdDxJUnVudGltZUV4dGVuc2lvbj4sXG5cdFx0XHQnUnVudGltZUV4dGVuc2lvbnMnLFxuXHRcdFx0cGFyZW50LCBkZWxlZ2F0ZSwgW3JlbmRlcmVyXSwge1xuXHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdHNldFJvd0xpbmVIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRvdmVycmlkZVN0eWxlczoge1xuXHRcdFx0XHRsaXN0QmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZFxuXHRcdFx0fSxcblx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IGNsYXNzIGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8SVJ1bnRpbWVFeHRlbnNpb24+IHtcblx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncnVudGltZUV4dGVuc2lvbnMnLCBcIlJ1bnRpbWUgRXh0ZW5zaW9uc1wiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRnZXRBcmlhTGFiZWwoZWxlbWVudDogSVJ1bnRpbWVFeHRlbnNpb24pOiBzdHJpbmcgfCBudWxsIHtcblx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5kZXNjcmlwdGlvbi5uYW1lO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fbGlzdC5zcGxpY2UoMCwgdGhpcy5fbGlzdC5sZW5ndGgsIHRoaXMuX2VsZW1lbnRzIHx8IHVuZGVmaW5lZCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0Lm9uQ29udGV4dE1lbnUoKGUpID0+IHtcblx0XHRcdGlmICghZS5lbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cblx0XHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKFxuXHRcdFx0XHQncnVudGltZUV4dGVuc2lvbnNFZGl0b3IuYWN0aW9uLmNvcHlJZCcsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY29weSBpZCcsIFwiQ29weSBpZCAoezB9KVwiLCBlLmVsZW1lbnQuZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2NsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGUuZWxlbWVudCEuZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCByZXBvcnRFeHRlbnNpb25Jc3N1ZUFjdGlvbiA9IHRoaXMuX2NyZWF0ZVJlcG9ydEV4dGVuc2lvbklzc3VlQWN0aW9uKGUuZWxlbWVudCk7XG5cdFx0XHRpZiAocmVwb3J0RXh0ZW5zaW9uSXNzdWVBY3Rpb24pIHtcblx0XHRcdFx0YWN0aW9ucy5wdXNoKHJlcG9ydEV4dGVuc2lvbklzc3VlQWN0aW9uKTtcblx0XHRcdH1cblx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXG5cdFx0XHRpZiAoZS5lbGVtZW50Lm1hcmtldHBsYWNlSW5mbykge1xuXHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IEFjdGlvbigncnVudGltZUV4dGVuc2lvbnNFZGl0b3IuYWN0aW9uLmRpc2FibGVXb3Jrc3BhY2UnLCBubHMubG9jYWxpemUoJ2Rpc2FibGUgd29ya3NwYWNlJywgXCJEaXNhYmxlIChXb3Jrc3BhY2UpXCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHRoaXMuX2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnNldEVuYWJsZW1lbnQoZS5lbGVtZW50IS5tYXJrZXRwbGFjZUluZm8hLCBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2UpKSk7XG5cdFx0XHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKCdydW50aW1lRXh0ZW5zaW9uc0VkaXRvci5hY3Rpb24uZGlzYWJsZScsIG5scy5sb2NhbGl6ZSgnZGlzYWJsZScsIFwiRGlzYWJsZVwiKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0aGlzLl9leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5zZXRFbmFibGVtZW50KGUuZWxlbWVudCEubWFya2V0cGxhY2VJbmZvISwgRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkR2xvYmFsbHkpKSk7XG5cdFx0XHR9XG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblxuXHRcdFx0Y29uc3QgbWVudUFjdGlvbnMgPSB0aGlzLl9tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuRXh0ZW5zaW9uRWRpdG9yQ29udGV4dE1lbnUsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0YWN0aW9ucy5wdXNoKC4uLmdldENvbnRleHRNZW51QWN0aW9ucyhtZW51QWN0aW9ucywpLnNlY29uZGFyeSk7XG5cblx0XHRcdHRoaXMuX2NvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgbGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fbGlzdD8ubGF5b3V0KGRpbWVuc2lvbi5oZWlnaHQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9nZXRQcm9maWxlSW5mbygpOiBJRXh0ZW5zaW9uSG9zdFByb2ZpbGUgfCBudWxsO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2dldFVucmVzcG9uc2l2ZVByb2ZpbGUoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIpOiBJRXh0ZW5zaW9uSG9zdFByb2ZpbGUgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfY3JlYXRlU2xvd0V4dGVuc2lvbkFjdGlvbihlbGVtZW50OiBJUnVudGltZUV4dGVuc2lvbik6IEFjdGlvbiB8IG51bGw7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfY3JlYXRlUmVwb3J0RXh0ZW5zaW9uSXNzdWVBY3Rpb24oZWxlbWVudDogSVJ1bnRpbWVFeHRlbnNpb24pOiBBY3Rpb24gfCBudWxsO1xufVxuXG5leHBvcnQgY2xhc3MgU2hvd1J1bnRpbWVFeHRlbnNpb25zQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnNob3dSdW50aW1lRXh0ZW5zaW9ucycsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignc2hvd1J1bnRpbWVFeHRlbnNpb25zJywgXCJTaG93IFJ1bm5pbmcgRXh0ZW5zaW9uc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdDb250YWluZXJUaXRsZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyJywgJ3dvcmtiZW5jaC52aWV3LmV4dGVuc2lvbnMnKSxcblx0XHRcdFx0Z3JvdXA6ICcyX2VuYWJsZW1lbnQnLFxuXHRcdFx0XHRvcmRlcjogM1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5vcGVuRWRpdG9yKFJ1bnRpbWVFeHRlbnNpb25zSW5wdXQuaW5zdGFuY2UsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsR0FBYyxRQUFRLGlCQUFpQjtBQUNoRCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDRCQUE0QjtBQUdyQyxTQUFTLFFBQWlCLGlCQUFpQjtBQUMzQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWU7QUFDeEIsU0FBc0IsZUFBZTtBQUNyQyxTQUFTLGVBQWU7QUFDeEIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsU0FBUyxjQUFjLGNBQWM7QUFDOUMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQ25ELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQThCLDhCQUFxRDtBQUNuRixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUErQztBQUN4RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQixnQkFBZ0I7QUFDL0MsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxZQUFZLDJDQUF1RTtBQUM1RixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFnQyx5QkFBNEM7QUFDNUUsU0FBcUIsbUNBQW1DO0FBQ3hELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsV0FBVyxtQkFBbUI7QUFDdkMsU0FBUywyQkFBMkI7QUFDcEMsT0FB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QUFDO0FBRTVCLFVBQUksRUFBRSxRQUFRLGlCQUFpQjtBQUM5QixnQkFBUSxLQUFLLElBQUksT0FBTyxtREFBbUQsSUFBSSxTQUFTLHFCQUFxQixxQkFBcUIsR0FBRyxRQUFXLE1BQU0sTUFBTSxLQUFLLDRCQUE0QixjQUFjLEVBQUUsUUFBUyxpQkFBa0IsZ0JBQWdCLGlCQUFpQixDQUFDLENBQUM7QUFDM1EsZ0JBQVEsS0FBSyxJQUFJLE9BQU8sMENBQTBDLElBQUksU0FBUyxXQUFXLFNBQVMsR0FBRyxRQUFXLE1BQU0sTUFBTSxLQUFLLDRCQUE0QixjQUFjLEVBQUUsUUFBUyxpQkFBa0IsZ0JBQWdCLGdCQUFnQixDQUFDLENBQUM7QUFBQSxNQUM1TztBQUNBLGNBQVEsS0FBSyxJQUFJLFVBQVUsQ0FBQztBQUU1QixZQUFNLGNBQWMsS0FBSyxhQUFhLGVBQWUsT0FBTyw0QkFBNEIsS0FBSyxpQkFBaUI7QUFDOUcsY0FBUSxLQUFLLEdBQUcsc0JBQXNCLFdBQVksRUFBRSxTQUFTO0FBRTdELFdBQUssb0JBQW9CLGdCQUFnQjtBQUFBLFFBQ3hDLFdBQVcsTUFBTSxFQUFFO0FBQUEsUUFDbkIsWUFBWSxNQUFNO0FBQUEsTUFDbkIsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRU8sT0FBTyxXQUE0QjtBQUN6QyxTQUFLLE9BQU8sT0FBTyxVQUFVLE1BQU07QUFBQSxFQUNwQztBQU1EO0FBemJzQixnQ0FFRSxLQUFhO0FBRmYsa0NBQWY7QUFBQSxFQVVKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXhCbUI7QUEyYmYsTUFBTSxvQ0FBb0MsUUFBUTtBQUFBLEVBRXhELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLElBQUksVUFBVSx5QkFBeUIseUJBQXlCO0FBQUEsTUFDdkUsVUFBVSxXQUFXO0FBQUEsTUFDckIsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLFFBQ0wsSUFBSSxPQUFPO0FBQUEsUUFDWCxNQUFNLGVBQWUsT0FBTyxpQkFBaUIsMkJBQTJCO0FBQUEsUUFDeEUsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBMkM7QUFDcEQsVUFBTSxTQUFTLElBQUksY0FBYyxFQUFFLFdBQVcsdUJBQXVCLFVBQVUsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUFBLEVBQ2hHO0FBQ0Q7IiwKICAibmFtZXMiOiBbImVsZW1lbnQiLCAidGl0bGUiXQp9Cg==
