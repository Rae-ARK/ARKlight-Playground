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
import "./media/languageStatus.css";
import * as dom from "../../../../base/browser/dom.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Disposable, DisposableStore, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import Severity from "../../../../base/common/severity.js";
import { getCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { localize, localize2 } from "../../../../nls.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ILanguageStatusService } from "../../../services/languageStatus/common/languageStatusService.js";
import { IStatusbarService, ShowTooltipCommand, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
import { parseLinkedText } from "../../../../base/common/linkedText.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Action } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { equals } from "../../../../base/common/arrays.js";
import { URI } from "../../../../base/common/uri.js";
import { Action2 } from "../../../../platform/actions/common/actions.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IHoverService, nativeHoverDelegate } from "../../../../platform/hover/browser/hover.js";
import { Event } from "../../../../base/common/event.js";
import { joinStrings } from "../../../../base/common/strings.js";
class LanguageStatusViewModel {
  constructor(combined, dedicated) {
    this.combined = combined;
    this.dedicated = dedicated;
  }
  isEqual(other) {
    return equals(this.combined, other.combined) && equals(this.dedicated, other.dedicated);
  }
}
let StoredCounter = class {
  constructor(_storageService, _key) {
    this._storageService = _storageService;
    this._key = _key;
  }
  get value() {
    return this._storageService.getNumber(this._key, StorageScope.PROFILE, 0);
  }
  increment() {
    const n = this.value + 1;
    this._storageService.store(this._key, n, StorageScope.PROFILE, StorageTarget.MACHINE);
    return n;
  }
};
StoredCounter = __decorateClass([
  __decorateParam(0, IStorageService)
], StoredCounter);
let LanguageStatusContribution = class extends Disposable {
  constructor(editorGroupService) {
    super();
    this.editorGroupService = editorGroupService;
    for (const part of editorGroupService.parts) {
      this.createLanguageStatus(part);
    }
    this._register(editorGroupService.onDidCreateAuxiliaryEditorPart((part) => this.createLanguageStatus(part)));
  }
  createLanguageStatus(part) {
    const disposables = new DisposableStore();
    Event.once(part.onWillDispose)(() => disposables.dispose());
    const scopedInstantiationService = this.editorGroupService.getScopedInstantiationService(part);
    disposables.add(scopedInstantiationService.createInstance(LanguageStatus));
  }
};
LanguageStatusContribution.Id = "status.languageStatus";
LanguageStatusContribution = __decorateClass([
  __decorateParam(0, IEditorGroupsService)
], LanguageStatusContribution);
let LanguageStatus = class {
  constructor(_languageStatusService, _statusBarService, _editorService, _hoverService, _openerService, _storageService) {
    this._languageStatusService = _languageStatusService;
    this._statusBarService = _statusBarService;
    this._editorService = _editorService;
    this._hoverService = _hoverService;
    this._openerService = _openerService;
    this._storageService = _storageService;
    this._disposables = new DisposableStore();
    this._dedicated = /* @__PURE__ */ new Set();
    this._dedicatedEntries = /* @__PURE__ */ new Map();
    this._renderDisposables = new DisposableStore();
    this._combinedEntryTooltip = document.createElement("div");
    _storageService.onDidChangeValue(StorageScope.PROFILE, LanguageStatus._keyDedicatedItems, this._disposables)(this._handleStorageChange, this, this._disposables);
    this._restoreState();
    this._interactionCounter = new StoredCounter(_storageService, "languageStatus.interactCount");
    _languageStatusService.onDidChange(this._update, this, this._disposables);
    _editorService.onDidActiveEditorChange(this._update, this, this._disposables);
    this._update();
    _statusBarService.onDidChangeEntryVisibility((e) => {
      if (!e.visible && this._dedicated.has(e.id)) {
        this._dedicated.delete(e.id);
        this._update();
        this._storeState();
      }
    }, void 0, this._disposables);
  }
  dispose() {
    this._disposables.dispose();
    this._combinedEntry?.dispose();
    dispose(this._dedicatedEntries.values());
    this._renderDisposables.dispose();
  }
  // --- persisting dedicated items
  _handleStorageChange() {
    this._restoreState();
    this._update();
  }
  _restoreState() {
    const raw = this._storageService.get(LanguageStatus._keyDedicatedItems, StorageScope.PROFILE, "[]");
    try {
      const ids = JSON.parse(raw);
      this._dedicated = new Set(ids);
    } catch {
      this._dedicated.clear();
    }
  }
  _storeState() {
    if (this._dedicated.size === 0) {
      this._storageService.remove(LanguageStatus._keyDedicatedItems, StorageScope.PROFILE);
    } else {
      const raw = JSON.stringify(Array.from(this._dedicated.keys()));
      this._storageService.store(LanguageStatus._keyDedicatedItems, raw, StorageScope.PROFILE, StorageTarget.USER);
    }
  }
  // --- language status model and UI
  _createViewModel(editor) {
    if (!editor?.hasModel()) {
      return new LanguageStatusViewModel([], []);
    }
    const all = this._languageStatusService.getLanguageStatus(editor.getModel());
    const combined = [];
    const dedicated = [];
    for (const item of all) {
      if (this._dedicated.has(item.id)) {
        dedicated.push(item);
      }
      combined.push(item);
    }
    return new LanguageStatusViewModel(combined, dedicated);
  }
  _update() {
    const editor = getCodeEditor(this._editorService.activeTextEditorControl);
    const model = this._createViewModel(editor);
    if (this._model?.isEqual(model)) {
      return;
    }
    this._renderDisposables.clear();
    this._model = model;
    editor?.onDidChangeModelLanguage(this._update, this, this._renderDisposables);
    if (model.combined.length === 0) {
      this._combinedEntry?.dispose();
      this._combinedEntry = void 0;
    } else {
      const [first] = model.combined;
      const showSeverity = first.severity >= Severity.Warning;
      const text = LanguageStatus._severityToComboCodicon(first.severity);
      let isOneBusy = false;
      const ariaLabels = [];
      for (const status of model.combined) {
        const isPinned = model.dedicated.includes(status);
        this._renderStatus(this._combinedEntryTooltip, status, showSeverity, isPinned, this._renderDisposables);
        ariaLabels.push(LanguageStatus._accessibilityInformation(status).label);
        isOneBusy = isOneBusy || !isPinned && status.busy;
      }
      const props = {
        name: localize("langStatus.name", "Editor Language Status"),
        ariaLabel: localize("langStatus.aria", "Editor Language Status: {0}", ariaLabels.join(", next: ")),
        tooltip: this._combinedEntryTooltip,
        command: ShowTooltipCommand,
        text: isOneBusy ? "$(loading~spin)" : text
      };
      if (!this._combinedEntry) {
        this._combinedEntry = this._statusBarService.addEntry(props, LanguageStatus._id, StatusbarAlignment.RIGHT, { location: { id: "status.editor.mode", priority: 100.1 }, alignment: StatusbarAlignment.LEFT, compact: true });
      } else {
        this._combinedEntry.update(props);
      }
      const userHasInteractedWithStatus = this._interactionCounter.value >= 3;
      const targetWindow = dom.getWindow(editor?.getContainerDomNode());
      const node = targetWindow.document.querySelector(".monaco-workbench .statusbar DIV#status\\.languageStatus A>SPAN.codicon");
      const container = targetWindow.document.querySelector(".monaco-workbench .statusbar DIV#status\\.languageStatus");
      if (dom.isHTMLElement(node) && container) {
        const _wiggle = "wiggle";
        const _flash = "flash";
        if (!isOneBusy) {
          node.classList.toggle(_wiggle, showSeverity || !userHasInteractedWithStatus);
          this._renderDisposables.add(dom.addDisposableListener(node, "animationend", (_e) => node.classList.remove(_wiggle)));
          container.classList.toggle(_flash, showSeverity);
          this._renderDisposables.add(dom.addDisposableListener(container, "animationend", (_e) => container.classList.remove(_flash)));
        } else {
          node.classList.remove(_wiggle);
          container.classList.remove(_flash);
        }
      }
      if (!userHasInteractedWithStatus) {
        const hoverTarget = targetWindow.document.querySelector(".monaco-workbench .context-view");
        if (dom.isHTMLElement(hoverTarget)) {
          const observer = new MutationObserver(() => {
            if (targetWindow.document.contains(this._combinedEntryTooltip)) {
              this._interactionCounter.increment();
              observer.disconnect();
            }
          });
          observer.observe(hoverTarget, { childList: true, subtree: true });
          this._renderDisposables.add(toDisposable(() => observer.disconnect()));
        }
      }
    }
    const newDedicatedEntries = /* @__PURE__ */ new Map();
    for (const status of model.dedicated) {
      const props = LanguageStatus._asStatusbarEntry(status);
      let entry = newDedicatedEntries.get(status.id) ?? this._dedicatedEntries.get(status.id);
      if (!entry) {
        entry = this._statusBarService.addEntry(props, status.id, StatusbarAlignment.RIGHT, { location: { id: "status.editor.mode", priority: 100.1 }, alignment: StatusbarAlignment.RIGHT });
      } else {
        entry.update(props);
        this._dedicatedEntries.delete(status.id);
      }
      newDedicatedEntries.set(status.id, entry);
    }
    dispose(this._dedicatedEntries.values());
    this._dedicatedEntries = newDedicatedEntries;
  }
  _renderStatus(container, status, showSeverity, isPinned, store) {
    const parent = document.createElement("div");
    parent.classList.add("hover-language-status");
    container.appendChild(parent);
    store.add(toDisposable(() => parent.remove()));
    const severity = document.createElement("div");
    severity.classList.add("severity", `sev${status.severity}`);
    severity.classList.toggle("show", showSeverity);
    const severityText = LanguageStatus._severityToSingleCodicon(status.severity);
    dom.append(severity, ...renderLabelWithIcons(severityText));
    parent.appendChild(severity);
    const element = document.createElement("div");
    element.classList.add("element");
    parent.appendChild(element);
    const left = document.createElement("div");
    left.classList.add("left");
    element.appendChild(left);
    const label = typeof status.label === "string" ? status.label : status.label.value;
    dom.append(left, ...renderLabelWithIcons(computeText(label, status.busy)));
    this._renderTextPlus(left, status.detail, store);
    const right = document.createElement("div");
    right.classList.add("right");
    element.appendChild(right);
    const { command } = status;
    if (command) {
      store.add(new Link(right, {
        label: command.title,
        title: command.tooltip,
        href: URI.from({
          scheme: "command",
          path: command.id,
          query: command.arguments && JSON.stringify(command.arguments)
        }).toString()
      }, { hoverDelegate: nativeHoverDelegate }, this._hoverService, this._openerService));
    }
    const actionBar = new ActionBar(right, { hoverDelegate: nativeHoverDelegate });
    const actionLabel = isPinned ? localize("unpin", "Remove from Status Bar") : localize("pin", "Add to Status Bar");
    actionBar.setAriaLabel(actionLabel);
    store.add(actionBar);
    let action;
    if (!isPinned) {
      action = new Action("pin", actionLabel, ThemeIcon.asClassName(Codicon.pin), true, () => {
        this._dedicated.add(status.id);
        this._statusBarService.updateEntryVisibility(status.id, true);
        this._update();
        this._storeState();
      });
    } else {
      action = new Action("unpin", actionLabel, ThemeIcon.asClassName(Codicon.pinned), true, () => {
        this._dedicated.delete(status.id);
        this._statusBarService.updateEntryVisibility(status.id, false);
        this._update();
        this._storeState();
      });
    }
    actionBar.push(action, { icon: true, label: false });
    store.add(action);
    return parent;
  }
  static _severityToComboCodicon(sev) {
    switch (sev) {
      case Severity.Error:
        return "$(bracket-error)";
      case Severity.Warning:
        return "$(bracket-dot)";
      default:
        return "$(bracket)";
    }
  }
  static _severityToSingleCodicon(sev) {
    switch (sev) {
      case Severity.Error:
        return "$(error)";
      case Severity.Warning:
        return "$(info)";
      default:
        return "$(check)";
    }
  }
  _renderTextPlus(target, text, store) {
    let didRenderSeparator = false;
    for (const node of parseLinkedText(text).nodes) {
      if (!didRenderSeparator) {
        dom.append(target, dom.$("span.separator"));
        didRenderSeparator = true;
      }
      if (typeof node === "string") {
        const parts = renderLabelWithIcons(node);
        dom.append(target, ...parts);
      } else {
        store.add(new Link(target, node, void 0, this._hoverService, this._openerService));
      }
    }
  }
  static _accessibilityInformation(status) {
    if (status.accessibilityInfo) {
      return status.accessibilityInfo;
    }
    const textValue = typeof status.label === "string" ? status.label : status.label.value;
    if (status.detail) {
      return { label: localize("aria.1", "{0}, {1}", textValue, status.detail) };
    } else {
      return { label: localize("aria.2", "{0}", textValue) };
    }
  }
  // ---
  static _asStatusbarEntry(item) {
    let kind;
    if (item.severity === Severity.Warning) {
      kind = "warning";
    } else if (item.severity === Severity.Error) {
      kind = "error";
    }
    const textValue = typeof item.label === "string" ? item.label : item.label.shortValue;
    return {
      name: localize("name.pattern", "{0} (Language Status)", item.name),
      text: computeText(textValue, item.busy),
      ariaLabel: LanguageStatus._accessibilityInformation(item).label,
      role: item.accessibilityInfo?.role,
      tooltip: item.command?.tooltip || new MarkdownString(item.detail, { isTrusted: true, supportThemeIcons: true }),
      kind,
      command: item.command
    };
  }
};
LanguageStatus._id = "status.languageStatus";
LanguageStatus._keyDedicatedItems = "languageStatus.dedicated";
LanguageStatus = __decorateClass([
  __decorateParam(0, ILanguageStatusService),
  __decorateParam(1, IStatusbarService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IStorageService)
], LanguageStatus);
class ResetAction extends Action2 {
  constructor() {
    super({
      id: "editor.inlayHints.Reset",
      title: localize2("reset", "Reset Language Status Interaction Counter"),
      category: Categories.View,
      f1: true
    });
  }
  run(accessor) {
    accessor.get(IStorageService).remove("languageStatus.interactCount", StorageScope.PROFILE);
  }
}
function computeText(text, loading) {
  return joinStrings([text !== "" && text, loading && "$(loading~spin)"], "\xA0\xA0");
}
export {
  LanguageStatusContribution,
  ResetAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2xhbmd1YWdlU3RhdHVzL2Jyb3dzZXIvbGFuZ3VhZ2VTdGF0dXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvbGFuZ3VhZ2VTdGF0dXMuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBnZXRDb2RlRWRpdG9yLCBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVN0YXR1cywgSUxhbmd1YWdlU3RhdHVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xhbmd1YWdlU3RhdHVzL2NvbW1vbi9sYW5ndWFnZVN0YXR1c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhckVudHJ5LCBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciwgSVN0YXR1c2JhclNlcnZpY2UsIFNob3dUb29sdGlwQ29tbWFuZCwgU3RhdHVzYmFyQWxpZ25tZW50LCBTdGF0dXNiYXJFbnRyeUtpbmQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zdGF0dXNiYXIvYnJvd3Nlci9zdGF0dXNiYXIuanMnO1xuaW1wb3J0IHsgcGFyc2VMaW5rZWRUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkVGV4dC5qcyc7XG5pbXBvcnQgeyBMaW5rIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2Jyb3dzZXIvbGluay5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSwgSUVkaXRvclBhcnQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSwgbmF0aXZlSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBqb2luU3RyaW5ncyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuXG5jbGFzcyBMYW5ndWFnZVN0YXR1c1ZpZXdNb2RlbCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY29tYmluZWQ6IHJlYWRvbmx5IElMYW5ndWFnZVN0YXR1c1tdLFxuXHRcdHJlYWRvbmx5IGRlZGljYXRlZDogcmVhZG9ubHkgSUxhbmd1YWdlU3RhdHVzW11cblx0KSB7IH1cblxuXHRpc0VxdWFsKG90aGVyOiBMYW5ndWFnZVN0YXR1c1ZpZXdNb2RlbCkge1xuXHRcdHJldHVybiBlcXVhbHModGhpcy5jb21iaW5lZCwgb3RoZXIuY29tYmluZWQpICYmIGVxdWFscyh0aGlzLmRlZGljYXRlZCwgb3RoZXIuZGVkaWNhdGVkKTtcblx0fVxufVxuXG5jbGFzcyBTdG9yZWRDb3VudGVyIHtcblxuXHRjb25zdHJ1Y3RvcihASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsIHByaXZhdGUgcmVhZG9ubHkgX2tleTogc3RyaW5nKSB7IH1cblxuXHRnZXQgdmFsdWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldE51bWJlcih0aGlzLl9rZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAwKTtcblx0fVxuXG5cdGluY3JlbWVudCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IG4gPSB0aGlzLnZhbHVlICsgMTtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZSh0aGlzLl9rZXksIG4sIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdHJldHVybiBuO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBMYW5ndWFnZVN0YXR1c0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSWQgPSAnc3RhdHVzLmxhbmd1YWdlU3RhdHVzJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGVkaXRvckdyb3VwU2VydmljZS5wYXJ0cykge1xuXHRcdFx0dGhpcy5jcmVhdGVMYW5ndWFnZVN0YXR1cyhwYXJ0KTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3JHcm91cFNlcnZpY2Uub25EaWRDcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0KHBhcnQgPT4gdGhpcy5jcmVhdGVMYW5ndWFnZVN0YXR1cyhwYXJ0KSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVMYW5ndWFnZVN0YXR1cyhwYXJ0OiBJRWRpdG9yUGFydCk6IHZvaWQge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdEV2ZW50Lm9uY2UocGFydC5vbldpbGxEaXNwb3NlKSgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpO1xuXG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRTY29wZWRJbnN0YW50aWF0aW9uU2VydmljZShwYXJ0KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGFuZ3VhZ2VTdGF0dXMpKTtcblx0fVxufVxuXG5jbGFzcyBMYW5ndWFnZVN0YXR1cyB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2lkID0gJ3N0YXR1cy5sYW5ndWFnZVN0YXR1cyc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2tleURlZGljYXRlZEl0ZW1zID0gJ2xhbmd1YWdlU3RhdHVzLmRlZGljYXRlZCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ludGVyYWN0aW9uQ291bnRlcjogU3RvcmVkQ291bnRlcjtcblxuXHRwcml2YXRlIF9kZWRpY2F0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIF9tb2RlbD86IExhbmd1YWdlU3RhdHVzVmlld01vZGVsO1xuXHRwcml2YXRlIF9jb21iaW5lZEVudHJ5PzogSVN0YXR1c2JhckVudHJ5QWNjZXNzb3I7XG5cdHByaXZhdGUgX2RlZGljYXRlZEVudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgSVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbWJpbmVkRW50cnlUb29sdGlwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZVN0YXR1c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTdGF0dXNTZXJ2aWNlOiBJTGFuZ3VhZ2VTdGF0dXNTZXJ2aWNlLFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXNCYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdF9zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBMYW5ndWFnZVN0YXR1cy5fa2V5RGVkaWNhdGVkSXRlbXMsIHRoaXMuX2Rpc3Bvc2FibGVzKSh0aGlzLl9oYW5kbGVTdG9yYWdlQ2hhbmdlLCB0aGlzLCB0aGlzLl9kaXNwb3NhYmxlcyk7XG5cdFx0dGhpcy5fcmVzdG9yZVN0YXRlKCk7XG5cdFx0dGhpcy5faW50ZXJhY3Rpb25Db3VudGVyID0gbmV3IFN0b3JlZENvdW50ZXIoX3N0b3JhZ2VTZXJ2aWNlLCAnbGFuZ3VhZ2VTdGF0dXMuaW50ZXJhY3RDb3VudCcpO1xuXG5cdFx0X2xhbmd1YWdlU3RhdHVzU2VydmljZS5vbkRpZENoYW5nZSh0aGlzLl91cGRhdGUsIHRoaXMsIHRoaXMuX2Rpc3Bvc2FibGVzKTtcblx0XHRfZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSh0aGlzLl91cGRhdGUsIHRoaXMsIHRoaXMuX2Rpc3Bvc2FibGVzKTtcblx0XHR0aGlzLl91cGRhdGUoKTtcblxuXHRcdF9zdGF0dXNCYXJTZXJ2aWNlLm9uRGlkQ2hhbmdlRW50cnlWaXNpYmlsaXR5KGUgPT4ge1xuXHRcdFx0aWYgKCFlLnZpc2libGUgJiYgdGhpcy5fZGVkaWNhdGVkLmhhcyhlLmlkKSkge1xuXHRcdFx0XHR0aGlzLl9kZWRpY2F0ZWQuZGVsZXRlKGUuaWQpO1xuXHRcdFx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHRcdFx0dGhpcy5fc3RvcmVTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0sIHVuZGVmaW5lZCwgdGhpcy5fZGlzcG9zYWJsZXMpO1xuXG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jb21iaW5lZEVudHJ5Py5kaXNwb3NlKCk7XG5cdFx0ZGlzcG9zZSh0aGlzLl9kZWRpY2F0ZWRFbnRyaWVzLnZhbHVlcygpKTtcblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHQvLyAtLS0gcGVyc2lzdGluZyBkZWRpY2F0ZWQgaXRlbXNcblxuXHRwcml2YXRlIF9oYW5kbGVTdG9yYWdlQ2hhbmdlKCkge1xuXHRcdHRoaXMuX3Jlc3RvcmVTdGF0ZSgpO1xuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzdG9yZVN0YXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChMYW5ndWFnZVN0YXR1cy5fa2V5RGVkaWNhdGVkSXRlbXMsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAnW10nKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaWRzID0gPHN0cmluZ1tdPkpTT04ucGFyc2UocmF3KTtcblx0XHRcdHRoaXMuX2RlZGljYXRlZCA9IG5ldyBTZXQoaWRzKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRoaXMuX2RlZGljYXRlZC5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N0b3JlU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2RlZGljYXRlZC5zaXplID09PSAwKSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoTGFuZ3VhZ2VTdGF0dXMuX2tleURlZGljYXRlZEl0ZW1zLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJhdyA9IEpTT04uc3RyaW5naWZ5KEFycmF5LmZyb20odGhpcy5fZGVkaWNhdGVkLmtleXMoKSkpO1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoTGFuZ3VhZ2VTdGF0dXMuX2tleURlZGljYXRlZEl0ZW1zLCByYXcsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBsYW5ndWFnZSBzdGF0dXMgbW9kZWwgYW5kIFVJXG5cblx0cHJpdmF0ZSBfY3JlYXRlVmlld01vZGVsKGVkaXRvcjogSUNvZGVFZGl0b3IgfCBudWxsKTogTGFuZ3VhZ2VTdGF0dXNWaWV3TW9kZWwge1xuXHRcdGlmICghZWRpdG9yPy5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gbmV3IExhbmd1YWdlU3RhdHVzVmlld01vZGVsKFtdLCBbXSk7XG5cdFx0fVxuXHRcdGNvbnN0IGFsbCA9IHRoaXMuX2xhbmd1YWdlU3RhdHVzU2VydmljZS5nZXRMYW5ndWFnZVN0YXR1cyhlZGl0b3IuZ2V0TW9kZWwoKSk7XG5cdFx0Y29uc3QgY29tYmluZWQ6IElMYW5ndWFnZVN0YXR1c1tdID0gW107XG5cdFx0Y29uc3QgZGVkaWNhdGVkOiBJTGFuZ3VhZ2VTdGF0dXNbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBhbGwpIHtcblx0XHRcdGlmICh0aGlzLl9kZWRpY2F0ZWQuaGFzKGl0ZW0uaWQpKSB7XG5cdFx0XHRcdGRlZGljYXRlZC5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXHRcdFx0Y29tYmluZWQucHVzaChpdGVtKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBMYW5ndWFnZVN0YXR1c1ZpZXdNb2RlbChjb21iaW5lZCwgZGVkaWNhdGVkKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0b3IgPSBnZXRDb2RlRWRpdG9yKHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fY3JlYXRlVmlld01vZGVsKGVkaXRvcik7XG5cblx0XHRpZiAodGhpcy5fbW9kZWw/LmlzRXF1YWwobW9kZWwpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHR0aGlzLl9tb2RlbCA9IG1vZGVsO1xuXG5cdFx0Ly8gdXBkYXRlIHdoZW4gZWRpdG9yIGxhbmd1YWdlIGNoYW5nZXNcblx0XHRlZGl0b3I/Lm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZSh0aGlzLl91cGRhdGUsIHRoaXMsIHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzKTtcblxuXHRcdC8vIGNvbWJpbmVkIHN0YXR1cyBiYXIgaXRlbSBpcyBhIHNpbmdsZSBpdGVtIHdoaWNoIGhvdmVyIHNob3dzXG5cdFx0Ly8gZWFjaCBzdGF0dXMgaXRlbVxuXHRcdGlmIChtb2RlbC5jb21iaW5lZC5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIG5vdGhpbmdcblx0XHRcdHRoaXMuX2NvbWJpbmVkRW50cnk/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2NvbWJpbmVkRW50cnkgPSB1bmRlZmluZWQ7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgW2ZpcnN0XSA9IG1vZGVsLmNvbWJpbmVkO1xuXHRcdFx0Y29uc3Qgc2hvd1NldmVyaXR5ID0gZmlyc3Quc2V2ZXJpdHkgPj0gU2V2ZXJpdHkuV2FybmluZztcblx0XHRcdGNvbnN0IHRleHQgPSBMYW5ndWFnZVN0YXR1cy5fc2V2ZXJpdHlUb0NvbWJvQ29kaWNvbihmaXJzdC5zZXZlcml0eSk7XG5cblx0XHRcdGxldCBpc09uZUJ1c3kgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGFyaWFMYWJlbHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHN0YXR1cyBvZiBtb2RlbC5jb21iaW5lZCkge1xuXHRcdFx0XHRjb25zdCBpc1Bpbm5lZCA9IG1vZGVsLmRlZGljYXRlZC5pbmNsdWRlcyhzdGF0dXMpO1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJTdGF0dXModGhpcy5fY29tYmluZWRFbnRyeVRvb2x0aXAsIHN0YXR1cywgc2hvd1NldmVyaXR5LCBpc1Bpbm5lZCwgdGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRhcmlhTGFiZWxzLnB1c2goTGFuZ3VhZ2VTdGF0dXMuX2FjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbihzdGF0dXMpLmxhYmVsKTtcblx0XHRcdFx0aXNPbmVCdXN5ID0gaXNPbmVCdXN5IHx8ICghaXNQaW5uZWQgJiYgc3RhdHVzLmJ1c3kpOyAvLyB1bnBpbm5lZCBpdGVtcyBjb250cmlidXRlIHRvIHRoZSBidXN5LWluZGljYXRvciBvZiB0aGUgY29tcG9zaXRlIHN0YXR1cyBpdGVtXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByb3BzOiBJU3RhdHVzYmFyRW50cnkgPSB7XG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdsYW5nU3RhdHVzLm5hbWUnLCBcIkVkaXRvciBMYW5ndWFnZSBTdGF0dXNcIiksXG5cdFx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2xhbmdTdGF0dXMuYXJpYScsIFwiRWRpdG9yIExhbmd1YWdlIFN0YXR1czogezB9XCIsIGFyaWFMYWJlbHMuam9pbignLCBuZXh0OiAnKSksXG5cdFx0XHRcdHRvb2x0aXA6IHRoaXMuX2NvbWJpbmVkRW50cnlUb29sdGlwLFxuXHRcdFx0XHRjb21tYW5kOiBTaG93VG9vbHRpcENvbW1hbmQsXG5cdFx0XHRcdHRleHQ6IGlzT25lQnVzeSA/ICckKGxvYWRpbmd+c3BpbiknIDogdGV4dCxcblx0XHRcdH07XG5cdFx0XHRpZiAoIXRoaXMuX2NvbWJpbmVkRW50cnkpIHtcblx0XHRcdFx0dGhpcy5fY29tYmluZWRFbnRyeSA9IHRoaXMuX3N0YXR1c0JhclNlcnZpY2UuYWRkRW50cnkocHJvcHMsIExhbmd1YWdlU3RhdHVzLl9pZCwgU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hULCB7IGxvY2F0aW9uOiB7IGlkOiAnc3RhdHVzLmVkaXRvci5tb2RlJywgcHJpb3JpdHk6IDEwMC4xIH0sIGFsaWdubWVudDogU3RhdHVzYmFyQWxpZ25tZW50LkxFRlQsIGNvbXBhY3Q6IHRydWUgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9jb21iaW5lZEVudHJ5LnVwZGF0ZShwcm9wcyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGFuaW1hdGUgdGhlIHN0YXR1cyBiYXIgaWNvbiB3aGVuZXZlciBsYW5ndWFnZSBzdGF0dXMgY2hhbmdlcywgcmVwZWF0IGFuaW1hdGlvblxuXHRcdFx0Ly8gd2hlbiBzZXZlcml0eSBpcyB3YXJuaW5nIG9yIGVycm9yLCBkb24ndCBzaG93IGFuaW1hdGlvbiB3aGVuIHNob3dpbmcgcHJvZ3Jlc3MvYnVzeVxuXHRcdFx0Y29uc3QgdXNlckhhc0ludGVyYWN0ZWRXaXRoU3RhdHVzID0gdGhpcy5faW50ZXJhY3Rpb25Db3VudGVyLnZhbHVlID49IDM7XG5cdFx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBkb20uZ2V0V2luZG93KGVkaXRvcj8uZ2V0Q29udGFpbmVyRG9tTm9kZSgpKTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3Qgbm9kZSA9IHRhcmdldFdpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLXdvcmtiZW5jaCAuc3RhdHVzYmFyIERJViNzdGF0dXNcXFxcLmxhbmd1YWdlU3RhdHVzIEE+U1BBTi5jb2RpY29uJyk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IHRhcmdldFdpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLXdvcmtiZW5jaCAuc3RhdHVzYmFyIERJViNzdGF0dXNcXFxcLmxhbmd1YWdlU3RhdHVzJyk7XG5cdFx0XHRpZiAoZG9tLmlzSFRNTEVsZW1lbnQobm9kZSkgJiYgY29udGFpbmVyKSB7XG5cdFx0XHRcdGNvbnN0IF93aWdnbGUgPSAnd2lnZ2xlJztcblx0XHRcdFx0Y29uc3QgX2ZsYXNoID0gJ2ZsYXNoJztcblx0XHRcdFx0aWYgKCFpc09uZUJ1c3kpIHtcblx0XHRcdFx0XHQvLyB3aWdnbGUgaWNvbiB3aGVuIHNldmVyZSBvciBcIm5ld1wiXG5cdFx0XHRcdFx0bm9kZS5jbGFzc0xpc3QudG9nZ2xlKF93aWdnbGUsIHNob3dTZXZlcml0eSB8fCAhdXNlckhhc0ludGVyYWN0ZWRXaXRoU3RhdHVzKTtcblx0XHRcdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihub2RlLCAnYW5pbWF0aW9uZW5kJywgX2UgPT4gbm9kZS5jbGFzc0xpc3QucmVtb3ZlKF93aWdnbGUpKSk7XG5cdFx0XHRcdFx0Ly8gZmxhc2ggYmFja2dyb3VuZCB3aGVuIHNldmVyZVxuXHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKF9mbGFzaCwgc2hvd1NldmVyaXR5KTtcblx0XHRcdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsICdhbmltYXRpb25lbmQnLCBfZSA9PiBjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShfZmxhc2gpKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bm9kZS5jbGFzc0xpc3QucmVtb3ZlKF93aWdnbGUpO1xuXHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKF9mbGFzaCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gdHJhY2sgd2hlbiB0aGUgaG92ZXIgc2hvd3MgKHRoaXMgaXMgYXV0b21hZ2ljIGFuZCBET00gbXV0YXRpb24gc3B5aW5nIGlzIG5lZWRlZC4uLilcblx0XHRcdC8vICB1c2UgdGhhdCBhcyBzaWduYWwgdGhhdCB0aGUgdXNlciBoYXMgaW50ZXJhY3RlZC9sZWFybmVkIGxhbmd1YWdlIHN0YXR1cyBpdGVtcyB3b3JrXG5cdFx0XHRpZiAoIXVzZXJIYXNJbnRlcmFjdGVkV2l0aFN0YXR1cykge1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0Y29uc3QgaG92ZXJUYXJnZXQgPSB0YXJnZXRXaW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm1vbmFjby13b3JrYmVuY2ggLmNvbnRleHQtdmlldycpO1xuXHRcdFx0XHRpZiAoZG9tLmlzSFRNTEVsZW1lbnQoaG92ZXJUYXJnZXQpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodGFyZ2V0V2luZG93LmRvY3VtZW50LmNvbnRhaW5zKHRoaXMuX2NvbWJpbmVkRW50cnlUb29sdGlwKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9pbnRlcmFjdGlvbkNvdW50ZXIuaW5jcmVtZW50KCk7XG5cdFx0XHRcdFx0XHRcdG9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRvYnNlcnZlci5vYnNlcnZlKGhvdmVyVGFyZ2V0LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcblx0XHRcdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG9ic2VydmVyLmRpc2Nvbm5lY3QoKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gZGVkaWNhdGVkIHN0YXR1cyBiYXIgaXRlbXMgYXJlIHNob3dzIGFzLWlzIGluIHRoZSBzdGF0dXMgYmFyXG5cdFx0Y29uc3QgbmV3RGVkaWNhdGVkRW50cmllcyA9IG5ldyBNYXA8c3RyaW5nLCBJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcj4oKTtcblx0XHRmb3IgKGNvbnN0IHN0YXR1cyBvZiBtb2RlbC5kZWRpY2F0ZWQpIHtcblx0XHRcdGNvbnN0IHByb3BzID0gTGFuZ3VhZ2VTdGF0dXMuX2FzU3RhdHVzYmFyRW50cnkoc3RhdHVzKTtcblxuXHRcdFx0Ly8gRmlyc3QgY2hlY2sgaWYgd2UgYWxyZWFkeSBwcm9jZXNzZWQgYSBzdGF0dXMgd2l0aCB0aGlzIGlkIGluIHRoZSBjdXJyZW50IHVwZGF0ZVxuXHRcdFx0Ly8gKGNhbiBoYXBwZW4gd2hlbiBkdXBsaWNhdGUgc3RhdHVzIGlkcyBleGlzdCBtb21lbnRhcmlseSBkdXJpbmcgc3RhdHVzIHVwZGF0ZXMpLlxuXHRcdFx0Ly8gQWxzbyBjaGVjayB0aGUgcHJldmlvdXMgZW50cmllcyBtYXAgZm9yIGFuIGV4aXN0aW5nIGFjY2Vzc29yIHRvIHJldXNlLlxuXHRcdFx0bGV0IGVudHJ5ID0gbmV3RGVkaWNhdGVkRW50cmllcy5nZXQoc3RhdHVzLmlkKSA/PyB0aGlzLl9kZWRpY2F0ZWRFbnRyaWVzLmdldChzdGF0dXMuaWQpO1xuXHRcdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0XHRlbnRyeSA9IHRoaXMuX3N0YXR1c0JhclNlcnZpY2UuYWRkRW50cnkocHJvcHMsIHN0YXR1cy5pZCwgU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hULCB7IGxvY2F0aW9uOiB7IGlkOiAnc3RhdHVzLmVkaXRvci5tb2RlJywgcHJpb3JpdHk6IDEwMC4xIH0sIGFsaWdubWVudDogU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hUIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZW50cnkudXBkYXRlKHByb3BzKTtcblx0XHRcdFx0dGhpcy5fZGVkaWNhdGVkRW50cmllcy5kZWxldGUoc3RhdHVzLmlkKTtcblx0XHRcdH1cblx0XHRcdG5ld0RlZGljYXRlZEVudHJpZXMuc2V0KHN0YXR1cy5pZCwgZW50cnkpO1xuXHRcdH1cblx0XHRkaXNwb3NlKHRoaXMuX2RlZGljYXRlZEVudHJpZXMudmFsdWVzKCkpO1xuXHRcdHRoaXMuX2RlZGljYXRlZEVudHJpZXMgPSBuZXdEZWRpY2F0ZWRFbnRyaWVzO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyU3RhdHVzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHN0YXR1czogSUxhbmd1YWdlU3RhdHVzLCBzaG93U2V2ZXJpdHk6IGJvb2xlYW4sIGlzUGlubmVkOiBib29sZWFuLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogSFRNTEVsZW1lbnQge1xuXG5cdFx0Y29uc3QgcGFyZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0cGFyZW50LmNsYXNzTGlzdC5hZGQoJ2hvdmVyLWxhbmd1YWdlLXN0YXR1cycpO1xuXG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHBhcmVudCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJlbnQucmVtb3ZlKCkpKTtcblxuXHRcdGNvbnN0IHNldmVyaXR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0c2V2ZXJpdHkuY2xhc3NMaXN0LmFkZCgnc2V2ZXJpdHknLCBgc2V2JHtzdGF0dXMuc2V2ZXJpdHl9YCk7XG5cdFx0c2V2ZXJpdHkuY2xhc3NMaXN0LnRvZ2dsZSgnc2hvdycsIHNob3dTZXZlcml0eSk7XG5cdFx0Y29uc3Qgc2V2ZXJpdHlUZXh0ID0gTGFuZ3VhZ2VTdGF0dXMuX3NldmVyaXR5VG9TaW5nbGVDb2RpY29uKHN0YXR1cy5zZXZlcml0eSk7XG5cdFx0ZG9tLmFwcGVuZChzZXZlcml0eSwgLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoc2V2ZXJpdHlUZXh0KSk7XG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKHNldmVyaXR5KTtcblxuXHRcdGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2VsZW1lbnQnKTtcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG5cblx0XHRjb25zdCBsZWZ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0bGVmdC5jbGFzc0xpc3QuYWRkKCdsZWZ0Jyk7XG5cdFx0ZWxlbWVudC5hcHBlbmRDaGlsZChsZWZ0KTtcblxuXHRcdGNvbnN0IGxhYmVsID0gdHlwZW9mIHN0YXR1cy5sYWJlbCA9PT0gJ3N0cmluZycgPyBzdGF0dXMubGFiZWwgOiBzdGF0dXMubGFiZWwudmFsdWU7XG5cdFx0ZG9tLmFwcGVuZChsZWZ0LCAuLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhjb21wdXRlVGV4dChsYWJlbCwgc3RhdHVzLmJ1c3kpKSk7XG5cblx0XHR0aGlzLl9yZW5kZXJUZXh0UGx1cyhsZWZ0LCBzdGF0dXMuZGV0YWlsLCBzdG9yZSk7XG5cblx0XHRjb25zdCByaWdodCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHJpZ2h0LmNsYXNzTGlzdC5hZGQoJ3JpZ2h0Jyk7XG5cdFx0ZWxlbWVudC5hcHBlbmRDaGlsZChyaWdodCk7XG5cblx0XHQvLyAtLSBjb21tYW5kIChpZiBhdmFpbGFibGUpXG5cdFx0Y29uc3QgeyBjb21tYW5kIH0gPSBzdGF0dXM7XG5cdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdHN0b3JlLmFkZChuZXcgTGluayhyaWdodCwge1xuXHRcdFx0XHRsYWJlbDogY29tbWFuZC50aXRsZSxcblx0XHRcdFx0dGl0bGU6IGNvbW1hbmQudG9vbHRpcCxcblx0XHRcdFx0aHJlZjogVVJJLmZyb20oe1xuXHRcdFx0XHRcdHNjaGVtZTogJ2NvbW1hbmQnLCBwYXRoOiBjb21tYW5kLmlkLCBxdWVyeTogY29tbWFuZC5hcmd1bWVudHMgJiYgSlNPTi5zdHJpbmdpZnkoY29tbWFuZC5hcmd1bWVudHMpXG5cdFx0XHRcdH0pLnRvU3RyaW5nKClcblx0XHRcdH0sIHsgaG92ZXJEZWxlZ2F0ZTogbmF0aXZlSG92ZXJEZWxlZ2F0ZSB9LCB0aGlzLl9ob3ZlclNlcnZpY2UsIHRoaXMuX29wZW5lclNlcnZpY2UpKTtcblx0XHR9XG5cblx0XHQvLyAtLSBwaW5cblx0XHRjb25zdCBhY3Rpb25CYXIgPSBuZXcgQWN0aW9uQmFyKHJpZ2h0LCB7IGhvdmVyRGVsZWdhdGU6IG5hdGl2ZUhvdmVyRGVsZWdhdGUgfSk7XG5cdFx0Y29uc3QgYWN0aW9uTGFiZWw6IHN0cmluZyA9IGlzUGlubmVkID8gbG9jYWxpemUoJ3VucGluJywgXCJSZW1vdmUgZnJvbSBTdGF0dXMgQmFyXCIpIDogbG9jYWxpemUoJ3BpbicsIFwiQWRkIHRvIFN0YXR1cyBCYXJcIik7XG5cdFx0YWN0aW9uQmFyLnNldEFyaWFMYWJlbChhY3Rpb25MYWJlbCk7XG5cdFx0c3RvcmUuYWRkKGFjdGlvbkJhcik7XG5cdFx0bGV0IGFjdGlvbjogQWN0aW9uO1xuXHRcdGlmICghaXNQaW5uZWQpIHtcblx0XHRcdGFjdGlvbiA9IG5ldyBBY3Rpb24oJ3BpbicsIGFjdGlvbkxhYmVsLCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5waW4pLCB0cnVlLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2RlZGljYXRlZC5hZGQoc3RhdHVzLmlkKTtcblx0XHRcdFx0dGhpcy5fc3RhdHVzQmFyU2VydmljZS51cGRhdGVFbnRyeVZpc2liaWxpdHkoc3RhdHVzLmlkLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0XHRcdHRoaXMuX3N0b3JlU3RhdGUoKTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhY3Rpb24gPSBuZXcgQWN0aW9uKCd1bnBpbicsIGFjdGlvbkxhYmVsLCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5waW5uZWQpLCB0cnVlLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2RlZGljYXRlZC5kZWxldGUoc3RhdHVzLmlkKTtcblx0XHRcdFx0dGhpcy5fc3RhdHVzQmFyU2VydmljZS51cGRhdGVFbnRyeVZpc2liaWxpdHkoc3RhdHVzLmlkLCBmYWxzZSk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdFx0XHR0aGlzLl9zdG9yZVN0YXRlKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YWN0aW9uQmFyLnB1c2goYWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHRzdG9yZS5hZGQoYWN0aW9uKTtcblxuXHRcdHJldHVybiBwYXJlbnQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc2V2ZXJpdHlUb0NvbWJvQ29kaWNvbihzZXY6IFNldmVyaXR5KTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKHNldikge1xuXHRcdFx0Y2FzZSBTZXZlcml0eS5FcnJvcjogcmV0dXJuICckKGJyYWNrZXQtZXJyb3IpJztcblx0XHRcdGNhc2UgU2V2ZXJpdHkuV2FybmluZzogcmV0dXJuICckKGJyYWNrZXQtZG90KSc7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gJyQoYnJhY2tldCknO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9zZXZlcml0eVRvU2luZ2xlQ29kaWNvbihzZXY6IFNldmVyaXR5KTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKHNldikge1xuXHRcdFx0Y2FzZSBTZXZlcml0eS5FcnJvcjogcmV0dXJuICckKGVycm9yKSc7XG5cdFx0XHRjYXNlIFNldmVyaXR5Lldhcm5pbmc6IHJldHVybiAnJChpbmZvKSc7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gJyQoY2hlY2spJztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJUZXh0UGx1cyh0YXJnZXQ6IEhUTUxFbGVtZW50LCB0ZXh0OiBzdHJpbmcsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRsZXQgZGlkUmVuZGVyU2VwYXJhdG9yID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIHBhcnNlTGlua2VkVGV4dCh0ZXh0KS5ub2Rlcykge1xuXHRcdFx0aWYgKCFkaWRSZW5kZXJTZXBhcmF0b3IpIHtcblx0XHRcdFx0ZG9tLmFwcGVuZCh0YXJnZXQsIGRvbS4kKCdzcGFuLnNlcGFyYXRvcicpKTtcblx0XHRcdFx0ZGlkUmVuZGVyU2VwYXJhdG9yID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2Ygbm9kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29uc3QgcGFydHMgPSByZW5kZXJMYWJlbFdpdGhJY29ucyhub2RlKTtcblx0XHRcdFx0ZG9tLmFwcGVuZCh0YXJnZXQsIC4uLnBhcnRzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHN0b3JlLmFkZChuZXcgTGluayh0YXJnZXQsIG5vZGUsIHVuZGVmaW5lZCwgdGhpcy5faG92ZXJTZXJ2aWNlLCB0aGlzLl9vcGVuZXJTZXJ2aWNlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2FjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbihzdGF0dXM6IElMYW5ndWFnZVN0YXR1cyk6IElBY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24ge1xuXHRcdGlmIChzdGF0dXMuYWNjZXNzaWJpbGl0eUluZm8pIHtcblx0XHRcdHJldHVybiBzdGF0dXMuYWNjZXNzaWJpbGl0eUluZm87XG5cdFx0fVxuXHRcdGNvbnN0IHRleHRWYWx1ZSA9IHR5cGVvZiBzdGF0dXMubGFiZWwgPT09ICdzdHJpbmcnID8gc3RhdHVzLmxhYmVsIDogc3RhdHVzLmxhYmVsLnZhbHVlO1xuXHRcdGlmIChzdGF0dXMuZGV0YWlsKSB7XG5cdFx0XHRyZXR1cm4geyBsYWJlbDogbG9jYWxpemUoJ2FyaWEuMScsICd7MH0sIHsxfScsIHRleHRWYWx1ZSwgc3RhdHVzLmRldGFpbCkgfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHsgbGFiZWw6IGxvY2FsaXplKCdhcmlhLjInLCAnezB9JywgdGV4dFZhbHVlKSB9O1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLVxuXG5cdHByaXZhdGUgc3RhdGljIF9hc1N0YXR1c2JhckVudHJ5KGl0ZW06IElMYW5ndWFnZVN0YXR1cyk6IElTdGF0dXNiYXJFbnRyeSB7XG5cblx0XHRsZXQga2luZDogU3RhdHVzYmFyRW50cnlLaW5kIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChpdGVtLnNldmVyaXR5ID09PSBTZXZlcml0eS5XYXJuaW5nKSB7XG5cdFx0XHRraW5kID0gJ3dhcm5pbmcnO1xuXHRcdH0gZWxzZSBpZiAoaXRlbS5zZXZlcml0eSA9PT0gU2V2ZXJpdHkuRXJyb3IpIHtcblx0XHRcdGtpbmQgPSAnZXJyb3InO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHRWYWx1ZSA9IHR5cGVvZiBpdGVtLmxhYmVsID09PSAnc3RyaW5nJyA/IGl0ZW0ubGFiZWwgOiBpdGVtLmxhYmVsLnNob3J0VmFsdWU7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogbG9jYWxpemUoJ25hbWUucGF0dGVybicsICd7MH0gKExhbmd1YWdlIFN0YXR1cyknLCBpdGVtLm5hbWUpLFxuXHRcdFx0dGV4dDogY29tcHV0ZVRleHQodGV4dFZhbHVlLCBpdGVtLmJ1c3kpLFxuXHRcdFx0YXJpYUxhYmVsOiBMYW5ndWFnZVN0YXR1cy5fYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uKGl0ZW0pLmxhYmVsLFxuXHRcdFx0cm9sZTogaXRlbS5hY2Nlc3NpYmlsaXR5SW5mbz8ucm9sZSxcblx0XHRcdHRvb2x0aXA6IGl0ZW0uY29tbWFuZD8udG9vbHRpcCB8fCBuZXcgTWFya2Rvd25TdHJpbmcoaXRlbS5kZXRhaWwsIHsgaXNUcnVzdGVkOiB0cnVlLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KSxcblx0XHRcdGtpbmQsXG5cdFx0XHRjb21tYW5kOiBpdGVtLmNvbW1hbmRcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXNldEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmlubGF5SGludHMuUmVzZXQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVzZXQnLCBcIlJlc2V0IExhbmd1YWdlIFN0YXR1cyBJbnRlcmFjdGlvbiBDb3VudGVyXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKS5yZW1vdmUoJ2xhbmd1YWdlU3RhdHVzLmludGVyYWN0Q291bnQnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY29tcHV0ZVRleHQodGV4dDogc3RyaW5nLCBsb2FkaW5nOiBib29sZWFuKTogc3RyaW5nIHtcblx0cmV0dXJuIGpvaW5TdHJpbmdzKFt0ZXh0ICE9PSAnJyAmJiB0ZXh0LCBsb2FkaW5nICYmICckKGxvYWRpbmd+c3BpbiknXSwgJ1xcdTAwQTBcXHUwMEEwJyk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxZQUFZLGlCQUFpQixTQUFTLG9CQUFvQjtBQUNuRSxPQUFPLGNBQWM7QUFDckIsU0FBUyxxQkFBa0M7QUFDM0MsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGlCQUFpQjtBQUUxQixTQUFTLHNCQUFzQjtBQUMvQixTQUEwQiw4QkFBOEI7QUFDeEQsU0FBbUQsbUJBQW1CLG9CQUFvQiwwQkFBOEM7QUFDeEksU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsY0FBYztBQUN2QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxjQUFjO0FB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
