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
import "./media/sessionFilesWidget.css";
import * as dom from "../../../../base/browser/dom.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Gesture, EventType as TouchEventType } from "../../../../base/browser/touch.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { toAction } from "../../../../base/common/actions.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { basename } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { FileKind, IFileService } from "../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../../workbench/browser/labels.js";
import { createFileIconThemableTreeContainerScope } from "../../../../workbench/contrib/files/browser/views/explorerView.js";
import { ACTIVE_GROUP, IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { SessionFileOperation } from "../../../services/sessions/common/session.js";
const $ = dom.$;
const _SessionFileListDelegate = class _SessionFileListDelegate {
  getHeight(_element) {
    return _SessionFileListDelegate.ITEM_HEIGHT;
  }
  getTemplateId(_element) {
    return SessionFileListRenderer.TEMPLATE_ID;
  }
};
_SessionFileListDelegate.ITEM_HEIGHT = 22;
let SessionFileListDelegate = _SessionFileListDelegate;
let SessionFileListRenderer = class {
  constructor(_labels, _onOpenFile, _labelService, _instantiationService) {
    this._labels = _labels;
    this._onOpenFile = _onOpenFile;
    this._labelService = _labelService;
    this._instantiationService = _instantiationService;
    this.templateId = SessionFileListRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const row = dom.append(container, $(".session-files-widget-file"));
    const label = templateDisposables.add(this._labels.create(row));
    const actionBarContainer = $(".chat-collapsible-list-action-bar");
    const toolbar = templateDisposables.add(this._instantiationService.createInstance(WorkbenchToolBar, actionBarContainer, void 0));
    label.element.appendChild(actionBarContainer);
    return { label, toolbar, templateDisposables };
  }
  renderElement(element, _index, templateData) {
    templateData.label.setResource({
      resource: element.uri,
      name: basename(element.uri)
    }, {
      fileKind: FileKind.FILE,
      fileDecorations: void 0,
      strikethrough: element.operation === SessionFileOperation.Deleted,
      title: getSessionFileTitle(element, this._labelService)
    });
    templateData.toolbar.setActions([toAction({
      id: "sessionFiles.openFile",
      label: localize("sessionFiles.openFileAction", "Open File"),
      class: ThemeIcon.asClassName(Codicon.goToFile),
      run: () => this._onOpenFile(element)
    })]);
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
SessionFileListRenderer.TEMPLATE_ID = "sessionFile";
SessionFileListRenderer = __decorateClass([
  __decorateParam(2, ILabelService),
  __decorateParam(3, IInstantiationService)
], SessionFileListRenderer);
let SessionFilesWidget = class extends Disposable {
  constructor(container, _instantiationService, _labelService, _editorService, _hoverService, _fileService, _themeService) {
    super();
    this._instantiationService = _instantiationService;
    this._labelService = _labelService;
    this._editorService = _editorService;
    this._hoverService = _hoverService;
    this._fileService = _fileService;
    this._themeService = _themeService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._onDidToggleCollapsed = this._register(new Emitter());
    this.onDidToggleCollapsed = this._onDidToggleCollapsed.event;
    this._fileCount = 0;
    this._collapsed = false;
    this._labels = this._register(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
    this._domNode = dom.append(container, $(".session-files-widget"));
    this._domNode.style.display = "none";
    this._register(createFileIconThemableTreeContainerScope(this._domNode, this._themeService));
    this._headerNode = dom.append(this._domNode, $(".session-files-widget-header"));
    this._titleNode = dom.append(this._headerNode, $(".session-files-widget-title"));
    this._titleLabelNode = dom.append(this._titleNode, $(".session-files-widget-title-label"));
    this._titleLabelNode.textContent = localize("sessionFiles.label", "Other Files");
    this._countNode = dom.append(this._headerNode, $(".session-files-widget-count.hidden"));
    this._chevronNode = dom.append(this._headerNode, $(".group-chevron"));
    this._chevronNode.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));
    this._headerNode.setAttribute("role", "button");
    this._headerNode.setAttribute("aria-label", localize("sessionFiles.toggle", "Toggle Other Files"));
    this._headerNode.setAttribute("aria-expanded", "true");
    this._headerNode.tabIndex = 0;
    this._register(this._hoverService.setupManagedHover(
      getDefaultHoverDelegate("mouse"),
      this._headerNode,
      localize("sessionFiles.hover", "Files created, edited, or deleted outside the workspace during this session. These files are not part of the workspace and won't be committed.")
    ));
    this._register(Gesture.addTarget(this._headerNode));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._register(dom.addDisposableListener(this._headerNode, eventType, () => {
        this._toggleCollapsed();
      }));
    }
    this._register(dom.addDisposableListener(this._headerNode, dom.EventType.KEY_DOWN, (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target === this._headerNode) {
        e.preventDefault();
        this._toggleCollapsed();
      }
    }));
    const bodyId = "session-files-widget-body";
    this._bodyNode = dom.append(this._domNode, $(`.${bodyId}`));
    this._bodyNode.id = bodyId;
    this._headerNode.setAttribute("aria-controls", bodyId);
    const listContainer = $(".session-files-widget-list");
    this._list = this._register(this._instantiationService.createInstance(
      WorkbenchList,
      "SessionFilesWidget",
      listContainer,
      new SessionFileListDelegate(),
      [this._instantiationService.createInstance(SessionFileListRenderer, this._labels, (file) => this._openFilePlain(file))],
      {
        multipleSelectionSupport: false,
        openOnSingleClick: true,
        accessibilityProvider: {
          getWidgetAriaLabel: () => localize("sessionFiles.listAriaLabel", "Other Files"),
          getAriaLabel: (item) => localize("sessionFiles.fileAriaLabel", "{0}, {1}", basename(item.uri), getSessionFileOperationLabel(item.operation))
        },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (item) => basename(item.uri)
        }
      }
    ));
    this._bodyNode.appendChild(listContainer);
    this._register(this._list.onDidOpen((e) => {
      if (e.element) {
        void this._openFile(e.element, !!e.editorOptions?.preserveFocus, !!e.editorOptions?.pinned);
      }
    }));
  }
  get element() {
    return this._domNode;
  }
  /** The full content height the widget would like (header + all files). */
  get desiredHeight() {
    if (this._fileCount === 0) {
      return 0;
    }
    if (this._collapsed) {
      return SessionFilesWidget.HEADER_HEIGHT;
    }
    return SessionFilesWidget.HEADER_HEIGHT + this._fileCount * SessionFileListDelegate.ITEM_HEIGHT;
  }
  /** Whether the widget is currently visible (has files to show). */
  get visible() {
    return this._fileCount > 0;
  }
  /** Whether the body is collapsed (header-only). */
  get collapsed() {
    return this._collapsed;
  }
  setInput(input) {
    return autorun((reader) => {
      const files = input.sessionFilesObs.read(reader);
      const oldCount = this._fileCount;
      this._fileCount = files.length;
      if (files.length === 0) {
        this._setCollapsed(false);
        this._renderBody([]);
        this._domNode.style.display = "none";
        if (oldCount !== 0) {
          this._onDidChangeHeight.fire();
        }
        return;
      }
      this._domNode.style.display = "";
      this._renderBody(files);
      this._renderCount();
      if (this._fileCount !== oldCount) {
        this._onDidChangeHeight.fire();
      }
    });
  }
  /**
   * Layout the widget body list to the given height.
   * Called by the parent view after computing available space.
   */
  layout(height) {
    if (this._collapsed) {
      this._bodyNode.style.display = "none";
      return;
    }
    this._bodyNode.style.display = "";
    this._list.layout(height);
  }
  _toggleCollapsed() {
    this._setCollapsed(!this._collapsed);
    this._onDidToggleCollapsed.fire(this._collapsed);
    this._onDidChangeHeight.fire();
  }
  /**
   * Expand the body if it is currently collapsed, notifying listeners so the
   * parent pane restores its size. No-op when already expanded.
   */
  expand() {
    if (!this._collapsed) {
      return;
    }
    this._setCollapsed(false);
    this._onDidToggleCollapsed.fire(false);
    this._onDidChangeHeight.fire();
  }
  /**
   * Move keyboard focus into the files list. Falls back to the header when the
   * body is collapsed or there is nothing to focus.
   */
  focus() {
    if (this._collapsed || this._fileCount === 0) {
      this._headerNode.focus();
      return;
    }
    this._list.domFocus();
    if (this._list.length > 0 && this._list.getFocus().length === 0) {
      this._list.setFocus([0]);
    }
  }
  _setCollapsed(collapsed) {
    this._collapsed = collapsed;
    this._updateChevron();
    this._headerNode.classList.toggle("collapsed", collapsed);
    this._headerNode.setAttribute("aria-expanded", String(!collapsed));
    this._renderCount();
  }
  /** Show the file count in the header only while collapsed. */
  _renderCount() {
    this._countNode.textContent = this._fileCount > 0 ? `${this._fileCount}` : "";
    this._countNode.classList.toggle("hidden", !this._collapsed || this._fileCount === 0);
  }
  _updateChevron() {
    this._chevronNode.className = "group-chevron";
    this._chevronNode.classList.add(
      ...ThemeIcon.asClassNameArray(
        this._collapsed ? Codicon.chevronRight : Codicon.chevronDown
      )
    );
  }
  _renderBody(files) {
    this._list.splice(0, this._list.length, files);
  }
  async _openFile(file, preserveFocus, pinned) {
    if (file.operation === SessionFileOperation.Modified && file.originalUri && await this._hasContent(file.originalUri)) {
      await this._editorService.openEditor({
        original: { resource: file.originalUri },
        modified: { resource: file.uri },
        label: getDiffEditorLabel(file.uri, this._labelService),
        options: { preserveFocus, pinned }
      }, ACTIVE_GROUP);
      return;
    }
    await this._editorService.openEditor({
      resource: file.uri,
      options: { preserveFocus, pinned }
    }, ACTIVE_GROUP);
  }
  async _hasContent(resource) {
    try {
      const content = await this._fileService.readFile(resource);
      return content.value.byteLength > 0;
    } catch {
      return false;
    }
  }
  /** Open the file in a normal editor, ignoring the pre-session diff. */
  _openFilePlain(file) {
    void this._editorService.openEditor({ resource: file.uri }, ACTIVE_GROUP);
  }
};
SessionFilesWidget.HEADER_HEIGHT = 34;
// 6px header margin-top + 8px header padding + 20px header min-height
SessionFilesWidget.MIN_BODY_HEIGHT = 3 * SessionFileListDelegate.ITEM_HEIGHT + 2;
SessionFilesWidget.PREFERRED_BODY_HEIGHT = 4 * SessionFileListDelegate.ITEM_HEIGHT;
SessionFilesWidget.MAX_BODY_HEIGHT = 240;
SessionFilesWidget = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IThemeService)
], SessionFilesWidget);
function getSessionFileOperationLabel(operation) {
  switch (operation) {
    case SessionFileOperation.Created:
      return localize("sessionFiles.created", "Created");
    case SessionFileOperation.Modified:
      return localize("sessionFiles.modified", "Modified");
    case SessionFileOperation.Deleted:
      return localize("sessionFiles.deleted", "Deleted");
  }
}
function getSessionFileTitle(file, labelService) {
  const path = labelService.getUriLabel(file.uri);
  return localize("sessionFiles.title", "{0} ({1})", path, getSessionFileOperationLabel(file.operation));
}
function getDiffEditorLabel(uri, labelService) {
  return localize("sessionFiles.diffLabel", "{0} (Session Changes)", basename(uri) || labelService.getUriLabel(uri));
}
export {
  SessionFilesWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhbmdlcy9icm93c2VyL3Nlc3Npb25GaWxlc1dpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9zZXNzaW9uRmlsZXNXaWRnZXQuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElMaXN0UmVuZGVyZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBHZXN0dXJlLCBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0xBQkVMU19DT05UQUlORVIsIElSZXNvdXJjZUxhYmVsLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVGaWxlSWNvblRoZW1hYmxlVHJlZUNvbnRhaW5lclNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvZmlsZXMvYnJvd3Nlci92aWV3cy9leHBsb3JlclZpZXcuanMnO1xuaW1wb3J0IHsgQUNUSVZFX0dST1VQLCBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25GaWxlLCBTZXNzaW9uRmlsZU9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG4vKiogTWluaW1hbCBpbnB1dCBjb250cmFjdCBmb3Ige0BsaW5rIFNlc3Npb25GaWxlc1dpZGdldC5zZXRJbnB1dH0uICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uRmlsZXNJbnB1dCB7XG5cdHJlYWRvbmx5IHNlc3Npb25GaWxlc09iczogSU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25GaWxlW10+O1xufVxuXG5jbGFzcyBTZXNzaW9uRmlsZUxpc3REZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPElTZXNzaW9uRmlsZT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSVRFTV9IRUlHSFQgPSAyMjtcblxuXHRnZXRIZWlnaHQoX2VsZW1lbnQ6IElTZXNzaW9uRmlsZSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIFNlc3Npb25GaWxlTGlzdERlbGVnYXRlLklURU1fSEVJR0hUO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChfZWxlbWVudDogSVNlc3Npb25GaWxlKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gU2Vzc2lvbkZpbGVMaXN0UmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElTZXNzaW9uRmlsZVRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcblx0cmVhZG9ubHkgdG9vbGJhcjogV29ya2JlbmNoVG9vbEJhcjtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5jbGFzcyBTZXNzaW9uRmlsZUxpc3RSZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8SVNlc3Npb25GaWxlLCBJU2Vzc2lvbkZpbGVUZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ3Nlc3Npb25GaWxlJztcblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IFNlc3Npb25GaWxlTGlzdFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25PcGVuRmlsZTogKGZpbGU6IElTZXNzaW9uRmlsZSkgPT4gdm9pZCxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2Vzc2lvbkZpbGVUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IHRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgcm93ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5zZXNzaW9uLWZpbGVzLXdpZGdldC1maWxlJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5fbGFiZWxzLmNyZWF0ZShyb3cpKTtcblxuXHRcdGNvbnN0IGFjdGlvbkJhckNvbnRhaW5lciA9ICQoJy5jaGF0LWNvbGxhcHNpYmxlLWxpc3QtYWN0aW9uLWJhcicpO1xuXHRcdGNvbnN0IHRvb2xiYXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hUb29sQmFyLCBhY3Rpb25CYXJDb250YWluZXIsIHVuZGVmaW5lZCkpO1xuXHRcdGxhYmVsLmVsZW1lbnQuYXBwZW5kQ2hpbGQoYWN0aW9uQmFyQ29udGFpbmVyKTtcblxuXHRcdHJldHVybiB7IGxhYmVsLCB0b29sYmFyLCB0ZW1wbGF0ZURpc3Bvc2FibGVzIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElTZXNzaW9uRmlsZSwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVNlc3Npb25GaWxlVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldFJlc291cmNlKHtcblx0XHRcdHJlc291cmNlOiBlbGVtZW50LnVyaSxcblx0XHRcdG5hbWU6IGJhc2VuYW1lKGVsZW1lbnQudXJpKSxcblx0XHR9LCB7XG5cdFx0XHRmaWxlS2luZDogRmlsZUtpbmQuRklMRSxcblx0XHRcdGZpbGVEZWNvcmF0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0c3RyaWtldGhyb3VnaDogZWxlbWVudC5vcGVyYXRpb24gPT09IFNlc3Npb25GaWxlT3BlcmF0aW9uLkRlbGV0ZWQsXG5cdFx0XHR0aXRsZTogZ2V0U2Vzc2lvbkZpbGVUaXRsZShlbGVtZW50LCB0aGlzLl9sYWJlbFNlcnZpY2UpLFxuXHRcdH0pO1xuXG5cdFx0dGVtcGxhdGVEYXRhLnRvb2xiYXIuc2V0QWN0aW9ucyhbdG9BY3Rpb24oe1xuXHRcdFx0aWQ6ICdzZXNzaW9uRmlsZXMub3BlbkZpbGUnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzZXNzaW9uRmlsZXMub3BlbkZpbGVBY3Rpb24nLCBcIk9wZW4gRmlsZVwiKSxcblx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5nb1RvRmlsZSksXG5cdFx0XHRydW46ICgpID0+IHRoaXMuX29uT3BlbkZpbGUoZWxlbWVudCksXG5cdFx0fSldKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElTZXNzaW9uRmlsZVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIEEgd2lkZ2V0IHRoYXQgbGlzdHMgdGhlIGZpbGVzIGNyZWF0ZWQsIGVkaXRlZCBvciBkZWxldGVkICoqb3V0c2lkZSoqIHRoZVxuICogc2Vzc2lvbiB3b3Jrc3BhY2UgZHVyaW5nIHRoZSBzZXNzaW9uLiBSZW5kZXJlZCBiZXR3ZWVuIHRoZSBjaGFuZ2VzIHRyZWUgYW5kXG4gKiB0aGUgQ0kgY2hlY2tzIHdpZGdldCBpbiB0aGUgY2hhbmdlcyB2aWV3IGFzIGEgcmVzaXphYmxlIFNwbGl0VmlldyBwYW5lLlxuICpcbiAqIFRoZSBjb2xsYXBzZS9yZXNpemUgYmVoYXZpb3VyIG1pcnJvcnMge0BsaW5rIENJU3RhdHVzV2lkZ2V0fS5cbiAqL1xuZXhwb3J0IGNsYXNzIFNlc3Npb25GaWxlc1dpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyByZWFkb25seSBIRUFERVJfSEVJR0hUID0gMzQ7IC8vIDZweCBoZWFkZXIgbWFyZ2luLXRvcCArIDhweCBoZWFkZXIgcGFkZGluZyArIDIwcHggaGVhZGVyIG1pbi1oZWlnaHRcblx0c3RhdGljIHJlYWRvbmx5IE1JTl9CT0RZX0hFSUdIVCA9IDMgKiBTZXNzaW9uRmlsZUxpc3REZWxlZ2F0ZS5JVEVNX0hFSUdIVCArIDI7XG5cdHN0YXRpYyByZWFkb25seSBQUkVGRVJSRURfQk9EWV9IRUlHSFQgPSA0ICogU2Vzc2lvbkZpbGVMaXN0RGVsZWdhdGUuSVRFTV9IRUlHSFQ7XG5cdHN0YXRpYyByZWFkb25seSBNQVhfQk9EWV9IRUlHSFQgPSAyNDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hlYWRlck5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZUxhYmVsTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvdW50Tm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoZXZyb25Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfYm9keU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saXN0OiBXb3JrYmVuY2hMaXN0PElTZXNzaW9uRmlsZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsczogUmVzb3VyY2VMYWJlbHM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRvZ2dsZUNvbGxhcHNlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZFRvZ2dsZUNvbGxhcHNlZCA9IHRoaXMuX29uRGlkVG9nZ2xlQ29sbGFwc2VkLmV2ZW50O1xuXG5cdHByaXZhdGUgX2ZpbGVDb3VudCA9IDA7XG5cdHByaXZhdGUgX2NvbGxhcHNlZCA9IGZhbHNlO1xuXG5cdGdldCBlbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdC8qKiBUaGUgZnVsbCBjb250ZW50IGhlaWdodCB0aGUgd2lkZ2V0IHdvdWxkIGxpa2UgKGhlYWRlciArIGFsbCBmaWxlcykuICovXG5cdGdldCBkZXNpcmVkSGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX2ZpbGVDb3VudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb2xsYXBzZWQpIHtcblx0XHRcdHJldHVybiBTZXNzaW9uRmlsZXNXaWRnZXQuSEVBREVSX0hFSUdIVDtcblx0XHR9XG5cdFx0cmV0dXJuIFNlc3Npb25GaWxlc1dpZGdldC5IRUFERVJfSEVJR0hUICsgdGhpcy5fZmlsZUNvdW50ICogU2Vzc2lvbkZpbGVMaXN0RGVsZWdhdGUuSVRFTV9IRUlHSFQ7XG5cdH1cblxuXHQvKiogV2hldGhlciB0aGUgd2lkZ2V0IGlzIGN1cnJlbnRseSB2aXNpYmxlIChoYXMgZmlsZXMgdG8gc2hvdykuICovXG5cdGdldCB2aXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9maWxlQ291bnQgPiAwO1xuXHR9XG5cblx0LyoqIFdoZXRoZXIgdGhlIGJvZHkgaXMgY29sbGFwc2VkIChoZWFkZXItb25seSkuICovXG5cdGdldCBjb2xsYXBzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbGxhcHNlZDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbGFiZWxzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUikpO1xuXG5cdFx0dGhpcy5fZG9tTm9kZSA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2Vzc2lvbi1maWxlcy13aWRnZXQnKSk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0Ly8gRW5hYmxlIGZpbGUgaWNvbnMgZnJvbSB0aGUgYWN0aXZlIGZpbGUgaWNvbiB0aGVtZSBmb3IgdGhlIHJlc291cmNlXG5cdFx0Ly8gbGFiZWxzIHJlbmRlcmVkIGluIHRoaXMgd2lkZ2V0J3MgbGlzdC5cblx0XHR0aGlzLl9yZWdpc3RlcihjcmVhdGVGaWxlSWNvblRoZW1hYmxlVHJlZUNvbnRhaW5lclNjb3BlKHRoaXMuX2RvbU5vZGUsIHRoaXMuX3RoZW1lU2VydmljZSkpO1xuXG5cdFx0Ly8gSGVhZGVyIChhbHdheXMgdmlzaWJsZSwgY2xpY2sgdG8gY29sbGFwc2UvZXhwYW5kKVxuXHRcdHRoaXMuX2hlYWRlck5vZGUgPSBkb20uYXBwZW5kKHRoaXMuX2RvbU5vZGUsICQoJy5zZXNzaW9uLWZpbGVzLXdpZGdldC1oZWFkZXInKSk7XG5cdFx0dGhpcy5fdGl0bGVOb2RlID0gZG9tLmFwcGVuZCh0aGlzLl9oZWFkZXJOb2RlLCAkKCcuc2Vzc2lvbi1maWxlcy13aWRnZXQtdGl0bGUnKSk7XG5cdFx0dGhpcy5fdGl0bGVMYWJlbE5vZGUgPSBkb20uYXBwZW5kKHRoaXMuX3RpdGxlTm9kZSwgJCgnLnNlc3Npb24tZmlsZXMtd2lkZ2V0LXRpdGxlLWxhYmVsJykpO1xuXHRcdHRoaXMuX3RpdGxlTGFiZWxOb2RlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3Nlc3Npb25GaWxlcy5sYWJlbCcsIFwiT3RoZXIgRmlsZXNcIik7XG5cdFx0Ly8gRmlsZSBjb3VudCBzaG93biBpbiB0aGUgaGVhZGVyIG9ubHkgd2hpbGUgY29sbGFwc2VkIChtaXJyb3JzIHRoZVxuXHRcdC8vIGN1c3RvbWl6YXRpb25zIHNlY3Rpb24gaW4gdGhlIHNlc3Npb25zIHZpZXcpLlxuXHRcdHRoaXMuX2NvdW50Tm9kZSA9IGRvbS5hcHBlbmQodGhpcy5faGVhZGVyTm9kZSwgJCgnLnNlc3Npb24tZmlsZXMtd2lkZ2V0LWNvdW50LmhpZGRlbicpKTtcblx0XHR0aGlzLl9jaGV2cm9uTm9kZSA9IGRvbS5hcHBlbmQodGhpcy5faGVhZGVyTm9kZSwgJCgnLmdyb3VwLWNoZXZyb24nKSk7XG5cdFx0dGhpcy5fY2hldnJvbk5vZGUuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmNoZXZyb25Eb3duKSk7XG5cblx0XHR0aGlzLl9oZWFkZXJOb2RlLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHR0aGlzLl9oZWFkZXJOb2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdzZXNzaW9uRmlsZXMudG9nZ2xlJywgXCJUb2dnbGUgT3RoZXIgRmlsZXNcIikpO1xuXHRcdHRoaXMuX2hlYWRlck5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ3RydWUnKTtcblx0XHR0aGlzLl9oZWFkZXJOb2RlLnRhYkluZGV4ID0gMDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihcblx0XHRcdGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLFxuXHRcdFx0dGhpcy5faGVhZGVyTm9kZSxcblx0XHRcdGxvY2FsaXplKCdzZXNzaW9uRmlsZXMuaG92ZXInLCBcIkZpbGVzIGNyZWF0ZWQsIGVkaXRlZCwgb3IgZGVsZXRlZCBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UgZHVyaW5nIHRoaXMgc2Vzc2lvbi4gVGhlc2UgZmlsZXMgYXJlIG5vdCBwYXJ0IG9mIHRoZSB3b3Jrc3BhY2UgYW5kIHdvbid0IGJlIGNvbW1pdHRlZC5cIiksXG5cdFx0KSk7XG5cblx0XHQvLyBSZWdpc3RlciB0aGUgZ2VzdHVyZSB0YXJnZXQgc28gdGhlIHRvZ2dsZSB3b3JrcyBvbiB0b3VjaCBwbGF0Zm9ybXNcblx0XHQvLyAobm90YWJseSBpT1MpIGluIHRoZSBTZXNzaW9ucyB3aW5kb3csIHRoZW4gaGFuZGxlIGJvdGggbW91c2UgY2xpY2sgYW5kXG5cdFx0Ly8gdG91Y2ggdGFwLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKEdlc3R1cmUuYWRkVGFyZ2V0KHRoaXMuX2hlYWRlck5vZGUpKTtcblx0XHRmb3IgKGNvbnN0IGV2ZW50VHlwZSBvZiBbZG9tLkV2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9oZWFkZXJOb2RlLCBldmVudFR5cGUsICgpID0+IHtcblx0XHRcdFx0dGhpcy5fdG9nZ2xlQ29sbGFwc2VkKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5faGVhZGVyTm9kZSwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRpZiAoKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpICYmIGUudGFyZ2V0ID09PSB0aGlzLl9oZWFkZXJOb2RlKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0dGhpcy5fdG9nZ2xlQ29sbGFwc2VkKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQm9keSAobGlzdCBvZiBmaWxlcylcblx0XHRjb25zdCBib2R5SWQgPSAnc2Vzc2lvbi1maWxlcy13aWRnZXQtYm9keSc7XG5cdFx0dGhpcy5fYm9keU5vZGUgPSBkb20uYXBwZW5kKHRoaXMuX2RvbU5vZGUsICQoYC4ke2JvZHlJZH1gKSk7XG5cdFx0dGhpcy5fYm9keU5vZGUuaWQgPSBib2R5SWQ7XG5cdFx0dGhpcy5faGVhZGVyTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtY29udHJvbHMnLCBib2R5SWQpO1xuXG5cdFx0Y29uc3QgbGlzdENvbnRhaW5lciA9ICQoJy5zZXNzaW9uLWZpbGVzLXdpZGdldC1saXN0Jyk7XG5cdFx0dGhpcy5fbGlzdCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoTGlzdDxJU2Vzc2lvbkZpbGU+LFxuXHRcdFx0J1Nlc3Npb25GaWxlc1dpZGdldCcsXG5cdFx0XHRsaXN0Q29udGFpbmVyLFxuXHRcdFx0bmV3IFNlc3Npb25GaWxlTGlzdERlbGVnYXRlKCksXG5cdFx0XHRbdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkZpbGVMaXN0UmVuZGVyZXIsIHRoaXMuX2xhYmVscywgKGZpbGU6IElTZXNzaW9uRmlsZSkgPT4gdGhpcy5fb3BlbkZpbGVQbGFpbihmaWxlKSldLFxuXHRcdFx0e1xuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRvcGVuT25TaW5nbGVDbGljazogdHJ1ZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsOiAoKSA9PiBsb2NhbGl6ZSgnc2Vzc2lvbkZpbGVzLmxpc3RBcmlhTGFiZWwnLCBcIk90aGVyIEZpbGVzXCIpLFxuXHRcdFx0XHRcdGdldEFyaWFMYWJlbDogaXRlbSA9PiBsb2NhbGl6ZSgnc2Vzc2lvbkZpbGVzLmZpbGVBcmlhTGFiZWwnLCBcInswfSwgezF9XCIsIGJhc2VuYW1lKGl0ZW0udXJpKSwgZ2V0U2Vzc2lvbkZpbGVPcGVyYXRpb25MYWJlbChpdGVtLm9wZXJhdGlvbikpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWw6IGl0ZW0gPT4gYmFzZW5hbWUoaXRlbS51cmkpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHQpKTtcblx0XHR0aGlzLl9ib2R5Tm9kZS5hcHBlbmRDaGlsZChsaXN0Q29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3Qub25EaWRPcGVuKGUgPT4ge1xuXHRcdFx0aWYgKGUuZWxlbWVudCkge1xuXHRcdFx0XHR2b2lkIHRoaXMuX29wZW5GaWxlKGUuZWxlbWVudCwgISFlLmVkaXRvck9wdGlvbnM/LnByZXNlcnZlRm9jdXMsICEhZS5lZGl0b3JPcHRpb25zPy5waW5uZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHNldElucHV0KGlucHV0OiBJU2Vzc2lvbkZpbGVzSW5wdXQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGZpbGVzID0gaW5wdXQuc2Vzc2lvbkZpbGVzT2JzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3Qgb2xkQ291bnQgPSB0aGlzLl9maWxlQ291bnQ7XG5cdFx0XHR0aGlzLl9maWxlQ291bnQgPSBmaWxlcy5sZW5ndGg7XG5cblx0XHRcdGlmIChmaWxlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5fc2V0Q29sbGFwc2VkKGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fcmVuZGVyQm9keShbXSk7XG5cdFx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0aWYgKG9sZENvdW50ICE9PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR0aGlzLl9yZW5kZXJCb2R5KGZpbGVzKTtcblx0XHRcdHRoaXMuX3JlbmRlckNvdW50KCk7XG5cblx0XHRcdGlmICh0aGlzLl9maWxlQ291bnQgIT09IG9sZENvdW50KSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMYXlvdXQgdGhlIHdpZGdldCBib2R5IGxpc3QgdG8gdGhlIGdpdmVuIGhlaWdodC5cblx0ICogQ2FsbGVkIGJ5IHRoZSBwYXJlbnQgdmlldyBhZnRlciBjb21wdXRpbmcgYXZhaWxhYmxlIHNwYWNlLlxuXHQgKi9cblx0bGF5b3V0KGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbGxhcHNlZCkge1xuXHRcdFx0dGhpcy5fYm9keU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYm9keU5vZGUuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdHRoaXMuX2xpc3QubGF5b3V0KGhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIF90b2dnbGVDb2xsYXBzZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0Q29sbGFwc2VkKCF0aGlzLl9jb2xsYXBzZWQpO1xuXHRcdHRoaXMuX29uRGlkVG9nZ2xlQ29sbGFwc2VkLmZpcmUodGhpcy5fY29sbGFwc2VkKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogRXhwYW5kIHRoZSBib2R5IGlmIGl0IGlzIGN1cnJlbnRseSBjb2xsYXBzZWQsIG5vdGlmeWluZyBsaXN0ZW5lcnMgc28gdGhlXG5cdCAqIHBhcmVudCBwYW5lIHJlc3RvcmVzIGl0cyBzaXplLiBOby1vcCB3aGVuIGFscmVhZHkgZXhwYW5kZWQuXG5cdCAqL1xuXHRleHBhbmQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb2xsYXBzZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2V0Q29sbGFwc2VkKGZhbHNlKTtcblx0XHR0aGlzLl9vbkRpZFRvZ2dsZUNvbGxhcHNlZC5maXJlKGZhbHNlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogTW92ZSBrZXlib2FyZCBmb2N1cyBpbnRvIHRoZSBmaWxlcyBsaXN0LiBGYWxscyBiYWNrIHRvIHRoZSBoZWFkZXIgd2hlbiB0aGVcblx0ICogYm9keSBpcyBjb2xsYXBzZWQgb3IgdGhlcmUgaXMgbm90aGluZyB0byBmb2N1cy5cblx0ICovXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb2xsYXBzZWQgfHwgdGhpcy5fZmlsZUNvdW50ID09PSAwKSB7XG5cdFx0XHR0aGlzLl9oZWFkZXJOb2RlLmZvY3VzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xpc3QuZG9tRm9jdXMoKTtcblx0XHRpZiAodGhpcy5fbGlzdC5sZW5ndGggPiAwICYmIHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXMoWzBdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDb2xsYXBzZWQoY29sbGFwc2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fY29sbGFwc2VkID0gY29sbGFwc2VkO1xuXHRcdHRoaXMuX3VwZGF0ZUNoZXZyb24oKTtcblx0XHR0aGlzLl9oZWFkZXJOb2RlLmNsYXNzTGlzdC50b2dnbGUoJ2NvbGxhcHNlZCcsIGNvbGxhcHNlZCk7XG5cdFx0dGhpcy5faGVhZGVyTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcoIWNvbGxhcHNlZCkpO1xuXHRcdHRoaXMuX3JlbmRlckNvdW50KCk7XG5cdH1cblxuXHQvKiogU2hvdyB0aGUgZmlsZSBjb3VudCBpbiB0aGUgaGVhZGVyIG9ubHkgd2hpbGUgY29sbGFwc2VkLiAqL1xuXHRwcml2YXRlIF9yZW5kZXJDb3VudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb3VudE5vZGUudGV4dENvbnRlbnQgPSB0aGlzLl9maWxlQ291bnQgPiAwID8gYCR7dGhpcy5fZmlsZUNvdW50fWAgOiAnJztcblx0XHR0aGlzLl9jb3VudE5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIXRoaXMuX2NvbGxhcHNlZCB8fCB0aGlzLl9maWxlQ291bnQgPT09IDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ2hldnJvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGV2cm9uTm9kZS5jbGFzc05hbWUgPSAnZ3JvdXAtY2hldnJvbic7XG5cdFx0dGhpcy5fY2hldnJvbk5vZGUuY2xhc3NMaXN0LmFkZChcblx0XHRcdC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KFxuXHRcdFx0XHR0aGlzLl9jb2xsYXBzZWQgPyBDb2RpY29uLmNoZXZyb25SaWdodCA6IENvZGljb24uY2hldnJvbkRvd25cblx0XHRcdClcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyQm9keShmaWxlczogcmVhZG9ubHkgSVNlc3Npb25GaWxlW10pOiB2b2lkIHtcblx0XHR0aGlzLl9saXN0LnNwbGljZSgwLCB0aGlzLl9saXN0Lmxlbmd0aCwgZmlsZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb3BlbkZpbGUoZmlsZTogSVNlc3Npb25GaWxlLCBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuLCBwaW5uZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBDcmVhdGVkIGFuZCBkZWxldGVkIGZpbGVzIG9wZW4gbm9ybWFsbHk7IG1vZGlmaWVkIGZpbGVzIG9wZW4gYSBkaWZmXG5cdFx0Ly8gYWdhaW5zdCB0aGVpciBwcmUtc2Vzc2lvbiBjb250ZW50IHdoZW4gaXQgaXMgYXZhaWxhYmxlIGFuZCBub24tZW1wdHkuXG5cdFx0aWYgKGZpbGUub3BlcmF0aW9uID09PSBTZXNzaW9uRmlsZU9wZXJhdGlvbi5Nb2RpZmllZCAmJiBmaWxlLm9yaWdpbmFsVXJpICYmIGF3YWl0IHRoaXMuX2hhc0NvbnRlbnQoZmlsZS5vcmlnaW5hbFVyaSkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBmaWxlLm9yaWdpbmFsVXJpIH0sXG5cdFx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBmaWxlLnVyaSB9LFxuXHRcdFx0XHRsYWJlbDogZ2V0RGlmZkVkaXRvckxhYmVsKGZpbGUudXJpLCB0aGlzLl9sYWJlbFNlcnZpY2UpLFxuXHRcdFx0XHRvcHRpb25zOiB7IHByZXNlcnZlRm9jdXMsIHBpbm5lZCB9LFxuXHRcdFx0fSwgQUNUSVZFX0dST1VQKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IGZpbGUudXJpLFxuXHRcdFx0b3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzLCBwaW5uZWQgfSxcblx0XHR9LCBBQ1RJVkVfR1JPVVApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFzQ29udGVudChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm4gY29udGVudC52YWx1ZS5ieXRlTGVuZ3RoID4gMDtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHQvKiogT3BlbiB0aGUgZmlsZSBpbiBhIG5vcm1hbCBlZGl0b3IsIGlnbm9yaW5nIHRoZSBwcmUtc2Vzc2lvbiBkaWZmLiAqL1xuXHRwcml2YXRlIF9vcGVuRmlsZVBsYWluKGZpbGU6IElTZXNzaW9uRmlsZSk6IHZvaWQge1xuXHRcdHZvaWQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IGZpbGUudXJpIH0sIEFDVElWRV9HUk9VUCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0U2Vzc2lvbkZpbGVPcGVyYXRpb25MYWJlbChvcGVyYXRpb246IFNlc3Npb25GaWxlT3BlcmF0aW9uKTogc3RyaW5nIHtcblx0c3dpdGNoIChvcGVyYXRpb24pIHtcblx0XHRjYXNlIFNlc3Npb25GaWxlT3BlcmF0aW9uLkNyZWF0ZWQ6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Nlc3Npb25GaWxlcy5jcmVhdGVkJywgXCJDcmVhdGVkXCIpO1xuXHRcdGNhc2UgU2Vzc2lvbkZpbGVPcGVyYXRpb24uTW9kaWZpZWQ6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Nlc3Npb25GaWxlcy5tb2RpZmllZCcsIFwiTW9kaWZpZWRcIik7XG5cdFx0Y2FzZSBTZXNzaW9uRmlsZU9wZXJhdGlvbi5EZWxldGVkOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzZXNzaW9uRmlsZXMuZGVsZXRlZCcsIFwiRGVsZXRlZFwiKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRTZXNzaW9uRmlsZVRpdGxlKGZpbGU6IElTZXNzaW9uRmlsZSwgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlKTogc3RyaW5nIHtcblx0Y29uc3QgcGF0aCA9IGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChmaWxlLnVyaSk7XG5cdHJldHVybiBsb2NhbGl6ZSgnc2Vzc2lvbkZpbGVzLnRpdGxlJywgXCJ7MH0gKHsxfSlcIiwgcGF0aCwgZ2V0U2Vzc2lvbkZpbGVPcGVyYXRpb25MYWJlbChmaWxlLm9wZXJhdGlvbikpO1xufVxuXG5mdW5jdGlvbiBnZXREaWZmRWRpdG9yTGFiZWwodXJpOiBVUkksIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSk6IHN0cmluZyB7XG5cdHJldHVybiBsb2NhbGl6ZSgnc2Vzc2lvbkZpbGVzLmRpZmZMYWJlbCcsIFwiezB9IChTZXNzaW9uIENoYW5nZXMpXCIsIGJhc2VuYW1lKHVyaSkgfHwgbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHVyaSkpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsU0FBUyxhQUFhLHNCQUFzQjtBQUNyRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7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
