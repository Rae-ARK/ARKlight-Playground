var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var _proxy;
import { URI } from "../../../base/common/uri.js";
import { Event, Emitter } from "../../../base/common/event.js";
import { debounce } from "../../../base/common/decorators.js";
import { DisposableMap, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { asPromise } from "../../../base/common/async.js";
import { MainContext } from "./extHost.protocol.js";
import { sortedDiff, equals } from "../../../base/common/arrays.js";
import { comparePaths } from "../../../base/common/comparers.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ExtensionIdentifierMap } from "../../../platform/extensions/common/extensions.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { MarkdownString, SourceControlInputBoxValidationType } from "./extHostTypeConverters.js";
import { checkProposedApiEnabled, isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { Schemas } from "../../../base/common/network.js";
import { isLinux } from "../../../base/common/platform.js";
import { structuralEquals } from "../../../base/common/equals.js";
import { Iterable } from "../../../base/common/iterator.js";
function isUri(thing) {
  return thing instanceof URI;
}
function uriEquals(a, b) {
  if (a.scheme === Schemas.file && b.scheme === Schemas.file && isLinux) {
    return a.toString() === b.toString();
  }
  return a.toString().toLowerCase() === b.toString().toLowerCase();
}
function getIconResource(decorations) {
  if (!decorations) {
    return void 0;
  } else if (typeof decorations.iconPath === "string") {
    return URI.file(decorations.iconPath);
  } else if (URI.isUri(decorations.iconPath)) {
    return decorations.iconPath;
  } else if (ThemeIcon.isThemeIcon(decorations.iconPath)) {
    return decorations.iconPath;
  } else {
    return void 0;
  }
}
function getHistoryItemIconDto(icon) {
  if (!icon) {
    return void 0;
  } else if (URI.isUri(icon)) {
    return icon;
  } else if (ThemeIcon.isThemeIcon(icon)) {
    return icon;
  } else {
    const iconDto = icon;
    return { light: iconDto.light, dark: iconDto.dark };
  }
}
function toSCMHistoryItemDto(historyItem) {
  const authorIcon = getHistoryItemIconDto(historyItem.authorIcon);
  const tooltip = Array.isArray(historyItem.tooltip) ? MarkdownString.fromMany(historyItem.tooltip) : historyItem.tooltip ? MarkdownString.from(historyItem.tooltip) : void 0;
  const references = historyItem.references?.map((r) => ({
    ...r,
    icon: getHistoryItemIconDto(r.icon)
  }));
  return { ...historyItem, authorIcon, references, tooltip };
}
function toSCMHistoryItemRefDto(historyItemRef) {
  return historyItemRef ? { ...historyItemRef, icon: getHistoryItemIconDto(historyItemRef.icon) } : void 0;
}
function compareResourceThemableDecorations(a, b) {
  if (!a.iconPath && !b.iconPath) {
    return 0;
  } else if (!a.iconPath) {
    return -1;
  } else if (!b.iconPath) {
    return 1;
  }
  const aPath = typeof a.iconPath === "string" ? a.iconPath : URI.isUri(a.iconPath) ? a.iconPath.fsPath : a.iconPath.id;
  const bPath = typeof b.iconPath === "string" ? b.iconPath : URI.isUri(b.iconPath) ? b.iconPath.fsPath : b.iconPath.id;
  return comparePaths(aPath, bPath);
}
function compareResourceStatesDecorations(a, b) {
  let result = 0;
  if (a.strikeThrough !== b.strikeThrough) {
    return a.strikeThrough ? 1 : -1;
  }
  if (a.faded !== b.faded) {
    return a.faded ? 1 : -1;
  }
  if (a.tooltip !== b.tooltip) {
    return (a.tooltip || "").localeCompare(b.tooltip || "");
  }
  result = compareResourceThemableDecorations(a, b);
  if (result !== 0) {
    return result;
  }
  if (a.light && b.light) {
    result = compareResourceThemableDecorations(a.light, b.light);
  } else if (a.light) {
    return 1;
  } else if (b.light) {
    return -1;
  }
  if (result !== 0) {
    return result;
  }
  if (a.dark && b.dark) {
    result = compareResourceThemableDecorations(a.dark, b.dark);
  } else if (a.dark) {
    return 1;
  } else if (b.dark) {
    return -1;
  }
  return result;
}
function compareCommands(a, b) {
  if (a.command !== b.command) {
    return a.command < b.command ? -1 : 1;
  }
  if (a.title !== b.title) {
    return a.title < b.title ? -1 : 1;
  }
  if (a.tooltip !== b.tooltip) {
    if (a.tooltip !== void 0 && b.tooltip !== void 0) {
      return a.tooltip < b.tooltip ? -1 : 1;
    } else if (a.tooltip !== void 0) {
      return 1;
    } else if (b.tooltip !== void 0) {
      return -1;
    }
  }
  if (a.arguments === b.arguments) {
    return 0;
  } else if (!a.arguments) {
    return -1;
  } else if (!b.arguments) {
    return 1;
  } else if (a.arguments.length !== b.arguments.length) {
    return a.arguments.length - b.arguments.length;
  }
  for (let i = 0; i < a.arguments.length; i++) {
    const aArg = a.arguments[i];
    const bArg = b.arguments[i];
    if (aArg === bArg) {
      continue;
    }
    if (isUri(aArg) && isUri(bArg) && uriEquals(aArg, bArg)) {
      continue;
    }
    return aArg < bArg ? -1 : 1;
  }
  return 0;
}
function compareResourceStates(a, b) {
  let result = comparePaths(a.resourceUri.fsPath, b.resourceUri.fsPath, true);
  if (result !== 0) {
    return result;
  }
  if (a.command && b.command) {
    result = compareCommands(a.command, b.command);
  } else if (a.command) {
    return 1;
  } else if (b.command) {
    return -1;
  }
  if (result !== 0) {
    return result;
  }
  if (a.decorations && b.decorations) {
    result = compareResourceStatesDecorations(a.decorations, b.decorations);
  } else if (a.decorations) {
    return 1;
  } else if (b.decorations) {
    return -1;
  }
  if (result !== 0) {
    return result;
  }
  if (a.multiFileDiffEditorModifiedUri && b.multiFileDiffEditorModifiedUri) {
    result = comparePaths(a.multiFileDiffEditorModifiedUri.fsPath, b.multiFileDiffEditorModifiedUri.fsPath, true);
  } else if (a.multiFileDiffEditorModifiedUri) {
    return 1;
  } else if (b.multiFileDiffEditorModifiedUri) {
    return -1;
  }
  if (result !== 0) {
    return result;
  }
  if (a.multiDiffEditorOriginalUri && b.multiDiffEditorOriginalUri) {
    result = comparePaths(a.multiDiffEditorOriginalUri.fsPath, b.multiDiffEditorOriginalUri.fsPath, true);
  } else if (a.multiDiffEditorOriginalUri) {
    return 1;
  } else if (b.multiDiffEditorOriginalUri) {
    return -1;
  }
  return result;
}
function compareArgs(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
function commandEquals(a, b) {
  return a.command === b.command && a.title === b.title && a.tooltip === b.tooltip && (a.arguments && b.arguments ? compareArgs(a.arguments, b.arguments) : a.arguments === b.arguments);
}
function commandListEquals(a, b) {
  return equals(a, b, commandEquals);
}
class ExtHostSCMInputBox {
  constructor(_extension, _extHostDocuments, proxy, _sourceControlHandle, _documentUri) {
    this._extension = _extension;
    this._sourceControlHandle = _sourceControlHandle;
    this._documentUri = _documentUri;
    this._value = "";
    this._onDidChange = new Emitter();
    this._placeholder = "";
    this._enabled = true;
    this._visible = true;
    this.#extHostDocuments = _extHostDocuments;
    this.#proxy = proxy;
  }
  #proxy;
  #extHostDocuments;
  get value() {
    return this._value;
  }
  set value(value) {
    value = value ?? "";
    this.#proxy.$setInputBoxValue(this._sourceControlHandle, value);
    this.updateValue(value);
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  get placeholder() {
    return this._placeholder;
  }
  set placeholder(placeholder) {
    this.#proxy.$setInputBoxPlaceholder(this._sourceControlHandle, placeholder);
    this._placeholder = placeholder;
  }
  get validateInput() {
    checkProposedApiEnabled(this._extension, "scmValidation");
    return this._validateInput;
  }
  set validateInput(fn) {
    checkProposedApiEnabled(this._extension, "scmValidation");
    if (fn && typeof fn !== "function") {
      throw new Error(`[${this._extension.identifier.value}]: Invalid SCM input box validation function`);
    }
    this._validateInput = fn;
    this.#proxy.$setValidationProviderIsEnabled(this._sourceControlHandle, !!fn);
  }
  get enabled() {
    return this._enabled;
  }
  set enabled(enabled) {
    enabled = !!enabled;
    if (this._enabled === enabled) {
      return;
    }
    this._enabled = enabled;
    this.#proxy.$setInputBoxEnablement(this._sourceControlHandle, enabled);
  }
  get visible() {
    return this._visible;
  }
  set visible(visible) {
    visible = !!visible;
    if (this._visible === visible) {
      return;
    }
    this._visible = visible;
    this.#proxy.$setInputBoxVisibility(this._sourceControlHandle, visible);
  }
  get document() {
    checkProposedApiEnabled(this._extension, "scmTextDocument");
    return this.#extHostDocuments.getDocument(this._documentUri);
  }
  showValidationMessage(message, type) {
    checkProposedApiEnabled(this._extension, "scmValidation");
    this.#proxy.$showValidationMessage(this._sourceControlHandle, message, SourceControlInputBoxValidationType.from(type));
  }
  $onInputBoxValueChange(value) {
    this.updateValue(value);
  }
  updateValue(value) {
    this._value = value;
    this._onDidChange.fire(value);
  }
}
const _ExtHostSourceControlResourceGroup = class _ExtHostSourceControlResourceGroup {
  constructor(_proxy2, _commands, _sourceControlHandle, _id, _label, multiDiffEditorEnableViewChanges, _extension) {
    this._proxy = _proxy2;
    this._commands = _commands;
    this._sourceControlHandle = _sourceControlHandle;
    this._id = _id;
    this._label = _label;
    this.multiDiffEditorEnableViewChanges = multiDiffEditorEnableViewChanges;
    this._extension = _extension;
    this._resourceHandlePool = 0;
    this._resourceStates = [];
    this._resourceStatesMap = /* @__PURE__ */ new Map();
    this._resourceStatesCommandsMap = /* @__PURE__ */ new Map();
    this._resourceStatesDisposablesMap = /* @__PURE__ */ new Map();
    this._onDidUpdateResourceStates = new Emitter();
    this.onDidUpdateResourceStates = this._onDidUpdateResourceStates.event;
    this._disposed = false;
    this._onDidDispose = new Emitter();
    this.onDidDispose = this._onDidDispose.event;
    this._handlesSnapshot = [];
    this._resourceSnapshot = [];
    this._contextValue = void 0;
    this._hideWhenEmpty = void 0;
    this.handle = _ExtHostSourceControlResourceGroup._handlePool++;
  }
  get disposed() {
    return this._disposed;
  }
  get id() {
    return this._id;
  }
  get label() {
    return this._label;
  }
  set label(label) {
    this._label = label;
    this._proxy.$updateGroupLabel(this._sourceControlHandle, this.handle, label);
  }
  get contextValue() {
    return this._contextValue;
  }
  set contextValue(contextValue) {
    this._contextValue = contextValue;
    this._proxy.$updateGroup(this._sourceControlHandle, this.handle, this.features);
  }
  get hideWhenEmpty() {
    return this._hideWhenEmpty;
  }
  set hideWhenEmpty(hideWhenEmpty) {
    this._hideWhenEmpty = hideWhenEmpty;
    this._proxy.$updateGroup(this._sourceControlHandle, this.handle, this.features);
  }
  get features() {
    return {
      contextValue: this.contextValue,
      hideWhenEmpty: this.hideWhenEmpty
    };
  }
  get resourceStates() {
    return [...this._resourceStates];
  }
  set resourceStates(resources) {
    this._resourceStates = [...resources];
    this._onDidUpdateResourceStates.fire();
  }
  getResourceState(handle) {
    return this._resourceStatesMap.get(handle);
  }
  $executeResourceCommand(handle, preserveFocus) {
    const command = this._resourceStatesCommandsMap.get(handle);
    if (!command) {
      return Promise.resolve(void 0);
    }
    return asPromise(() => this._commands.executeCommand(command.command, ...command.arguments || [], preserveFocus));
  }
  _takeResourceStateSnapshot() {
    const snapshot = [...this._resourceStates].sort(compareResourceStates);
    const diffs = sortedDiff(this._resourceSnapshot, snapshot, compareResourceStates);
    const splices = diffs.map((diff) => {
      const toInsert = diff.toInsert.map((r) => {
        const handle = this._resourceHandlePool++;
        this._resourceStatesMap.set(handle, r);
        const sourceUri = r.resourceUri;
        let command;
        if (r.command) {
          if (r.command.command === "vscode.open" || r.command.command === "vscode.diff" || r.command.command === "vscode.changes") {
            const disposables = new DisposableStore();
            command = this._commands.converter.toInternal(r.command, disposables);
            this._resourceStatesDisposablesMap.set(handle, disposables);
          } else {
            this._resourceStatesCommandsMap.set(handle, r.command);
          }
        }
        const hasScmMultiDiffEditorProposalEnabled = isProposedApiEnabled(this._extension, "scmMultiDiffEditor");
        const multiFileDiffEditorOriginalUri = hasScmMultiDiffEditorProposalEnabled ? r.multiDiffEditorOriginalUri : void 0;
        const multiFileDiffEditorModifiedUri = hasScmMultiDiffEditorProposalEnabled ? r.multiFileDiffEditorModifiedUri : void 0;
        const icon = getIconResource(r.decorations);
        const lightIcon = r.decorations && getIconResource(r.decorations.light) || icon;
        const darkIcon = r.decorations && getIconResource(r.decorations.dark) || icon;
        const icons = [lightIcon, darkIcon];
        const tooltip = r.decorations && r.decorations.tooltip || "";
        const strikeThrough = r.decorations && !!r.decorations.strikeThrough;
        const faded = r.decorations && !!r.decorations.faded;
        const contextValue = r.contextValue || "";
        const rawResource = [handle, sourceUri, icons, tooltip, strikeThrough, faded, contextValue, command, multiFileDiffEditorOriginalUri, multiFileDiffEditorModifiedUri];
        return { rawResource, handle };
      });
      return { start: diff.start, deleteCount: diff.deleteCount, toInsert };
    });
    const rawResourceSplices = splices.map(({ start, deleteCount, toInsert }) => [start, deleteCount, toInsert.map((i) => i.rawResource)]);
    const reverseSplices = splices.reverse();
    for (const { start, deleteCount, toInsert } of reverseSplices) {
      const handles = toInsert.map((i) => i.handle);
      const handlesToDelete = this._handlesSnapshot.splice(start, deleteCount, ...handles);
      for (const handle of handlesToDelete) {
        this._resourceStatesMap.delete(handle);
        this._resourceStatesCommandsMap.delete(handle);
        this._resourceStatesDisposablesMap.get(handle)?.dispose();
        this._resourceStatesDisposablesMap.delete(handle);
      }
    }
    this._resourceSnapshot = snapshot;
    return rawResourceSplices;
  }
  dispose() {
    this._disposed = true;
    this._onDidDispose.fire();
    this._onDidUpdateResourceStates.dispose();
    this._onDidDispose.dispose();
  }
};
_ExtHostSourceControlResourceGroup._handlePool = 0;
let ExtHostSourceControlResourceGroup = _ExtHostSourceControlResourceGroup;
const _ExtHostSourceControl = class _ExtHostSourceControl {
  constructor(_extension, _extHostDocuments, proxy, _commands, _id, _label, _rootUri, _iconPath, _isHidden, _parent) {
    this._extension = _extension;
    this._commands = _commands;
    this._id = _id;
    this._label = _label;
    this._rootUri = _rootUri;
    this._onDidDispose = new Emitter();
    this.onDidDispose = this._onDidDispose.event;
    __privateAdd(this, _proxy);
    this._groups = /* @__PURE__ */ new Map();
    this._contextValue = void 0;
    this._count = void 0;
    this._quickDiffProvider = void 0;
    this._secondaryQuickDiffProvider = void 0;
    this._historyProviderDisposable = new MutableDisposable();
    this._artifactProviderDisposable = new MutableDisposable();
    this._commitTemplate = void 0;
    this._acceptInputDisposables = new MutableDisposable();
    this._acceptInputCommand = void 0;
    // We know what we're doing here:
    // eslint-disable-next-line local/code-no-potentially-unsafe-disposables
    this._actionButtonDisposables = new DisposableStore();
    // We know what we're doing here:
    // eslint-disable-next-line local/code-no-potentially-unsafe-disposables
    this._statusBarDisposables = new DisposableStore();
    this._statusBarCommands = void 0;
    this._selected = false;
    this._onDidChangeSelection = new Emitter();
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._artifactCommandsDisposables = new DisposableMap();
    this.handle = _ExtHostSourceControl._handlePool++;
    this.createdResourceGroups = /* @__PURE__ */ new Map();
    this.updatedResourceGroups = /* @__PURE__ */ new Set();
    __privateSet(this, _proxy, proxy);
    const inputBoxDocumentUri = URI.from({
      scheme: Schemas.vscodeSourceControl,
      path: `${_id}/scm${this.handle}/input`,
      query: _rootUri ? `rootUri=${encodeURIComponent(_rootUri.toString())}` : void 0
    });
    this._inputBox = new ExtHostSCMInputBox(_extension, _extHostDocuments, __privateGet(this, _proxy), this.handle, inputBoxDocumentUri);
    __privateGet(this, _proxy).$registerSourceControl(this.handle, _parent?.handle, _id, _label, _rootUri, getHistoryItemIconDto(_iconPath), _isHidden, inputBoxDocumentUri);
    this.onDidDisposeParent = _parent ? _parent.onDidDispose : Event.None;
  }
  get id() {
    return this._id;
  }
  get label() {
    return this._label;
  }
  get rootUri() {
    return this._rootUri;
  }
  get contextValue() {
    checkProposedApiEnabled(this._extension, "scmProviderOptions");
    return this._contextValue;
  }
  set contextValue(contextValue) {
    checkProposedApiEnabled(this._extension, "scmProviderOptions");
    if (this._contextValue === contextValue) {
      return;
    }
    this._contextValue = contextValue;
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { contextValue });
  }
  get inputBox() {
    return this._inputBox;
  }
  get count() {
    return this._count;
  }
  set count(count) {
    if (this._count === count) {
      return;
    }
    this._count = count;
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { count });
  }
  get quickDiffProvider() {
    return this._quickDiffProvider;
  }
  set quickDiffProvider(quickDiffProvider) {
    this._quickDiffProvider = quickDiffProvider;
    let quickDiffLabel = void 0;
    if (isProposedApiEnabled(this._extension, "quickDiffProvider")) {
      quickDiffLabel = quickDiffProvider?.label;
    }
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { hasQuickDiffProvider: !!quickDiffProvider, quickDiffLabel });
  }
  get secondaryQuickDiffProvider() {
    checkProposedApiEnabled(this._extension, "quickDiffProvider");
    return this._secondaryQuickDiffProvider;
  }
  set secondaryQuickDiffProvider(secondaryQuickDiffProvider) {
    checkProposedApiEnabled(this._extension, "quickDiffProvider");
    this._secondaryQuickDiffProvider = secondaryQuickDiffProvider;
    const secondaryQuickDiffLabel = secondaryQuickDiffProvider?.label;
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { hasSecondaryQuickDiffProvider: !!secondaryQuickDiffProvider, secondaryQuickDiffLabel });
  }
  get historyProvider() {
    checkProposedApiEnabled(this._extension, "scmHistoryProvider");
    return this._historyProvider;
  }
  set historyProvider(historyProvider) {
    checkProposedApiEnabled(this._extension, "scmHistoryProvider");
    this._historyProvider = historyProvider;
    this._historyProviderDisposable.value = new DisposableStore();
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { hasHistoryProvider: !!historyProvider });
    if (historyProvider) {
      this._historyProviderDisposable.value.add(historyProvider.onDidChangeCurrentHistoryItemRefs(() => {
        const historyItemRef = toSCMHistoryItemRefDto(historyProvider?.currentHistoryItemRef);
        const historyItemRemoteRef = toSCMHistoryItemRefDto(historyProvider?.currentHistoryItemRemoteRef);
        const historyItemBaseRef = toSCMHistoryItemRefDto(historyProvider?.currentHistoryItemBaseRef);
        __privateGet(this, _proxy).$onDidChangeHistoryProviderCurrentHistoryItemRefs(this.handle, historyItemRef, historyItemRemoteRef, historyItemBaseRef);
      }));
      this._historyProviderDisposable.value.add(historyProvider.onDidChangeHistoryItemRefs((e) => {
        if (e.added.length === 0 && e.modified.length === 0 && e.removed.length === 0) {
          return;
        }
        const added = e.added.map((ref) => ({ ...ref, icon: getHistoryItemIconDto(ref.icon) }));
        const modified = e.modified.map((ref) => ({ ...ref, icon: getHistoryItemIconDto(ref.icon) }));
        const removed = e.removed.map((ref) => ({ ...ref, icon: getHistoryItemIconDto(ref.icon) }));
        __privateGet(this, _proxy).$onDidChangeHistoryProviderHistoryItemRefs(this.handle, { added, modified, removed, silent: e.silent });
      }));
    }
  }
  get artifactProvider() {
    checkProposedApiEnabled(this._extension, "scmArtifactProvider");
    return this._artifactProvider;
  }
  set artifactProvider(artifactProvider) {
    checkProposedApiEnabled(this._extension, "scmArtifactProvider");
    this._artifactProvider = artifactProvider;
    this._artifactProviderDisposable.value = new DisposableStore();
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { hasArtifactProvider: !!artifactProvider });
    if (artifactProvider) {
      this._artifactProviderDisposable.value.add(artifactProvider.onDidChangeArtifacts((groups) => {
        if (groups.length !== 0) {
          __privateGet(this, _proxy).$onDidChangeArtifacts(this.handle, groups);
        }
      }));
    }
  }
  get commitTemplate() {
    return this._commitTemplate;
  }
  set commitTemplate(commitTemplate) {
    if (commitTemplate === this._commitTemplate) {
      return;
    }
    this._commitTemplate = commitTemplate;
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { commitTemplate });
  }
  get acceptInputCommand() {
    return this._acceptInputCommand;
  }
  set acceptInputCommand(acceptInputCommand) {
    this._acceptInputDisposables.value = new DisposableStore();
    this._acceptInputCommand = acceptInputCommand;
    const internal = this._commands.converter.toInternal(acceptInputCommand, this._acceptInputDisposables.value);
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { acceptInputCommand: internal });
  }
  get actionButton() {
    checkProposedApiEnabled(this._extension, "scmActionButton");
    return this._actionButton;
  }
  set actionButton(actionButton) {
    checkProposedApiEnabled(this._extension, "scmActionButton");
    if (structuralEquals(this._actionButton, actionButton)) {
      return;
    }
    const oldActionButtonDisposables = this._actionButtonDisposables;
    this._actionButtonDisposables = new DisposableStore();
    this._actionButton = actionButton;
    const actionButtonDto = actionButton !== void 0 ? {
      command: {
        ...this._commands.converter.toInternal(actionButton.command, this._actionButtonDisposables),
        shortTitle: actionButton.command.shortTitle
      },
      secondaryCommands: actionButton.secondaryCommands?.map((commandGroup) => {
        return commandGroup.map((command) => this._commands.converter.toInternal(command, this._actionButtonDisposables));
      }),
      enabled: actionButton.enabled
    } : null;
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { actionButton: actionButtonDto }).finally(() => oldActionButtonDisposables.dispose());
  }
  get statusBarCommands() {
    return this._statusBarCommands;
  }
  set statusBarCommands(statusBarCommands) {
    if (this._statusBarCommands && statusBarCommands && commandListEquals(this._statusBarCommands, statusBarCommands)) {
      return;
    }
    const oldStatusBarDisposables = this._statusBarDisposables;
    this._statusBarDisposables = new DisposableStore();
    this._statusBarCommands = statusBarCommands;
    const internal = (statusBarCommands || []).map((c) => this._commands.converter.toInternal(c, this._statusBarDisposables));
    __privateGet(this, _proxy).$updateSourceControl(this.handle, { statusBarCommands: internal }).finally(() => oldStatusBarDisposables.dispose());
  }
  get selected() {
    return this._selected;
  }
  createResourceGroup(id, label, options) {
    const multiDiffEditorEnableViewChanges = isProposedApiEnabled(this._extension, "scmMultiDiffEditor") && options?.multiDiffEditorEnableViewChanges === true;
    const group = new ExtHostSourceControlResourceGroup(__privateGet(this, _proxy), this._commands, this.handle, id, label, multiDiffEditorEnableViewChanges, this._extension);
    const disposable = Event.once(group.onDidDispose)(() => this.createdResourceGroups.delete(group));
    this.createdResourceGroups.set(group, disposable);
    this.eventuallyAddResourceGroups();
    return group;
  }
  eventuallyAddResourceGroups() {
    const groups = [];
    const splices = [];
    for (const [group, disposable] of this.createdResourceGroups) {
      disposable.dispose();
      const updateListener = group.onDidUpdateResourceStates(() => {
        this.updatedResourceGroups.add(group);
        this.eventuallyUpdateResourceStates();
      });
      Event.once(group.onDidDispose)(() => {
        this.updatedResourceGroups.delete(group);
        updateListener.dispose();
        this._groups.delete(group.handle);
        __privateGet(this, _proxy).$unregisterGroup(this.handle, group.handle);
      });
      groups.push([group.handle, group.id, group.label, group.features, group.multiDiffEditorEnableViewChanges]);
      const snapshot = group._takeResourceStateSnapshot();
      if (snapshot.length > 0) {
        splices.push([group.handle, snapshot]);
      }
      this._groups.set(group.handle, group);
    }
    __privateGet(this, _proxy).$registerGroups(this.handle, groups, splices);
    this.createdResourceGroups.clear();
  }
  eventuallyUpdateResourceStates() {
    const splices = [];
    this.updatedResourceGroups.forEach((group) => {
      const snapshot = group._takeResourceStateSnapshot();
      if (snapshot.length === 0) {
        return;
      }
      splices.push([group.handle, snapshot]);
    });
    if (splices.length > 0) {
      __privateGet(this, _proxy).$spliceResourceStates(this.handle, splices);
    }
    this.updatedResourceGroups.clear();
  }
  getResourceGroup(handle) {
    return this._groups.get(handle);
  }
  setSelectionState(selected) {
    this._selected = selected;
    this._onDidChangeSelection.fire(selected);
  }
  async provideArtifacts(group, token) {
    const commandsDisposables = new DisposableStore();
    const artifacts = await this.artifactProvider?.provideArtifacts(group, token);
    const artifactsDto = artifacts?.map((artifact) => ({
      ...artifact,
      icon: getHistoryItemIconDto(artifact.icon),
      command: artifact.command ? this._commands.converter.toInternal(artifact.command, commandsDisposables) : void 0
    }));
    this._artifactCommandsDisposables.get(group)?.dispose();
    this._artifactCommandsDisposables.set(group, commandsDisposables);
    return artifactsDto;
  }
  dispose() {
    this._acceptInputDisposables.dispose();
    this._actionButtonDisposables.dispose();
    this._statusBarDisposables.dispose();
    this._historyProviderDisposable.dispose();
    this._artifactProviderDisposable.dispose();
    this._artifactCommandsDisposables.dispose();
    this._groups.forEach((group) => group.dispose());
    __privateGet(this, _proxy).$unregisterSourceControl(this.handle);
    this._onDidChangeSelection.dispose();
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
  }
};
_proxy = new WeakMap();
_ExtHostSourceControl._handlePool = 0;
__decorateClass([
  debounce(100)
], _ExtHostSourceControl.prototype, "eventuallyAddResourceGroups", 1);
__decorateClass([
  debounce(100)
], _ExtHostSourceControl.prototype, "eventuallyUpdateResourceStates", 1);
let ExtHostSourceControl = _ExtHostSourceControl;
let ExtHostSCM = class {
  constructor(mainContext, _commands, _extHostDocuments, logService) {
    this._commands = _commands;
    this._extHostDocuments = _extHostDocuments;
    this.logService = logService;
    this._sourceControls = /* @__PURE__ */ new Map();
    this._sourceControlsByExtension = new ExtensionIdentifierMap();
    this._onDidChangeActiveProvider = new Emitter();
    this._proxy = mainContext.getProxy(MainContext.MainThreadSCM);
    this._telemetry = mainContext.getProxy(MainContext.MainThreadTelemetry);
    _commands.registerArgumentProcessor({
      processArgument: (arg) => {
        if (arg && arg.$mid === MarshalledId.ScmResource) {
          const sourceControl = this._sourceControls.get(arg.sourceControlHandle);
          if (!sourceControl) {
            return arg;
          }
          const group = sourceControl.getResourceGroup(arg.groupHandle);
          if (!group) {
            return arg;
          }
          return group.getResourceState(arg.handle);
        } else if (arg && arg.$mid === MarshalledId.ScmResourceGroup) {
          const sourceControl = this._sourceControls.get(arg.sourceControlHandle);
          if (!sourceControl) {
            return arg;
          }
          return sourceControl.getResourceGroup(arg.groupHandle);
        } else if (arg && arg.$mid === MarshalledId.ScmProvider) {
          const sourceControl = this._sourceControls.get(arg.handle);
          if (!sourceControl) {
            return arg;
          }
          return sourceControl;
        }
        return arg;
      }
    });
  }
  get onDidChangeActiveProvider() {
    return this._onDidChangeActiveProvider.event;
  }
  createSourceControl(extension, id, label, rootUri, iconPath, isHidden, parent) {
    this.logService.trace("ExtHostSCM#createSourceControl", extension.identifier.value, id, label, rootUri);
    this._telemetry.$publicLog2("api/scm/createSourceControl", {
      extensionId: extension.identifier.value
    });
    const parentSourceControl = parent ? Iterable.find(this._sourceControls.values(), (s) => s === parent) : void 0;
    const sourceControl = new ExtHostSourceControl(extension, this._extHostDocuments, this._proxy, this._commands, id, label, rootUri, iconPath, isHidden, parentSourceControl);
    this._sourceControls.set(sourceControl.handle, sourceControl);
    const sourceControls = this._sourceControlsByExtension.get(extension.identifier) || [];
    sourceControls.push(sourceControl);
    this._sourceControlsByExtension.set(extension.identifier, sourceControls);
    Event.once(sourceControl.onDidDispose)(() => {
      this.logService.trace("ExtHostSCM#disposeSourceControl", extension.identifier.value, id, label, rootUri);
      this._sourceControls.delete(sourceControl.handle);
      const sourceControls2 = this._sourceControlsByExtension.get(extension.identifier);
      if (sourceControls2) {
        const index = sourceControls2.indexOf(sourceControl);
        if (index !== -1) {
          sourceControls2.splice(index, 1);
        }
        if (sourceControls2.length === 0) {
          this._sourceControlsByExtension.delete(extension.identifier);
        }
      }
    });
    return sourceControl;
  }
  // Deprecated
  getLastInputBox(extension) {
    this.logService.trace("ExtHostSCM#getLastInputBox", extension.identifier.value);
    const sourceControls = this._sourceControlsByExtension.get(extension.identifier);
    const sourceControl = sourceControls && sourceControls[sourceControls.length - 1];
    return sourceControl && sourceControl.inputBox;
  }
  $provideOriginalResource(sourceControlHandle, uriComponents, token) {
    const uri = URI.revive(uriComponents);
    this.logService.trace("ExtHostSCM#$provideOriginalResource", sourceControlHandle, uri.toString());
    const sourceControl = this._sourceControls.get(sourceControlHandle);
    if (!sourceControl || !sourceControl.quickDiffProvider || !sourceControl.quickDiffProvider.provideOriginalResource) {
      return Promise.resolve(null);
    }
    return asPromise(() => sourceControl.quickDiffProvider.provideOriginalResource(uri, token)).then((r) => r || null);
  }
  $provideSecondaryOriginalResource(sourceControlHandle, uriComponents, token) {
    const uri = URI.revive(uriComponents);
    this.logService.trace("ExtHostSCM#$provideSecondaryOriginalResource", sourceControlHandle, uri.toString());
    const sourceControl = this._sourceControls.get(sourceControlHandle);
    if (!sourceControl || !sourceControl.secondaryQuickDiffProvider || !sourceControl.secondaryQuickDiffProvider.provideOriginalResource) {
      return Promise.resolve(null);
    }
    return asPromise(() => sourceControl.secondaryQuickDiffProvider.provideOriginalResource(uri, token)).then((r) => r || null);
  }
  $onInputBoxValueChange(sourceControlHandle, value) {
    this.logService.trace("ExtHostSCM#$onInputBoxValueChange", sourceControlHandle);
    const sourceControl = this._sourceControls.get(sourceControlHandle);
    if (!sourceControl) {
      return Promise.resolve(void 0);
    }
    sourceControl.inputBox.$onInputBoxValueChange(value);
    return Promise.resolve(void 0);
  }
  $executeResourceCommand(sourceControlHandle, groupHandle, handle, preserveFocus) {
    this.logService.trace("ExtHostSCM#$executeResourceCommand", sourceControlHandle, groupHandle, handle);
    const sourceControl = this._sourceControls.get(sourceControlHandle);
    if (!sourceControl) {
      return Promise.resolve(void 0);
    }
    const group = sourceControl.getResourceGroup(groupHandle);
    if (!group) {
      return Promise.resolve(void 0);
    }
    return group.$executeResourceCommand(handle, preserveFocus);
  }
  $validateInput(sourceControlHandle, value, cursorPosition) {
    this.logService.trace("ExtHostSCM#$validateInput", sourceControlHandle);
    const sourceControl = this._sourceControls.get(sourceControlHandle);
    if (!sourceControl) {
      return Promise.resolve(void 0);
    }
    if (!sourceControl.inputBox.validateInput) {
      return Promise.resolve(void 0);
    }
    return asPromise(() => sourceControl.inputBox.validateInput(value, cursorPosition)).then((result) => {
      if (!result) {
        return Promise.resolve(void 0);
      }
      const message = MarkdownString.fromStrict(result.message);
      if (!message) {
        return Promise.resolve(void 0);
      }
      return Promise.resolve([message, result.type]);
    });
  }
  $setSelectedSourceControl(selectedSourceControlHandle) {
    this.logService.trace("ExtHostSCM#$setSelectedSourceControl", selectedSourceControlHandle);
    if (this._selectedSourceControlHandle === selectedSourceControlHandle) {
      return Promise.resolve(void 0);
    }
    if (selectedSourceControlHandle !== void 0) {
      this._sourceControls.get(selectedSourceControlHandle)?.setSelectionState(true);
    }
    if (this._selectedSourceControlHandle !== void 0) {
      this._sourceControls.get(this._selectedSourceControlHandle)?.setSelectionState(false);
    }
    this._selectedSourceControlHandle = selectedSourceControlHandle;
    return Promise.resolve(void 0);
  }
  async $resolveHistoryItem(sourceControlHandle, historyItemId, token) {
    try {
      const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
      const historyItem = await historyProvider?.resolveHistoryItem(historyItemId, token);
      return historyItem ? toSCMHistoryItemDto(historyItem) : void 0;
    } catch (err) {
      this.logService.error("ExtHostSCM#$resolveHistoryItem", err);
      return void 0;
    }
  }
  async $resolveHistoryItemChatContext(sourceControlHandle, historyItemId, token) {
    try {
      const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
      const chatContext = await historyProvider?.resolveHistoryItemChatContext(historyItemId, token);
      return chatContext ?? void 0;
    } catch (err) {
      this.logService.error("ExtHostSCM#$resolveHistoryItemChatContext", err);
      return void 0;
    }
  }
  async $resolveHistoryItemChangeRangeChatContext(sourceControlHandle, historyItemId, historyItemParentId, path, token) {
    try {
      const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
      const chatContext = await historyProvider?.resolveHistoryItemChangeRangeChatContext?.(historyItemId, historyItemParentId, path, token);
      return chatContext ?? void 0;
    } catch (err) {
      this.logService.error("ExtHostSCM#$resolveHistoryItemChangeRangeChatContext", err);
      return void 0;
    }
  }
  async $resolveHistoryItemRefsCommonAncestor(sourceControlHandle, historyItemRefs, token) {
    try {
      const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
      const ancestor = await historyProvider?.resolveHistoryItemRefsCommonAncestor(historyItemRefs, token);
      return ancestor ?? void 0;
    } catch (err) {
      this.logService.error("ExtHostSCM#$resolveHistoryItemRefsCommonAncestor", err);
      return void 0;
    }
  }
  async $provideHistoryItemRefs(sourceControlHandle, historyItemRefs, token) {
    try {
      const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
      const refs = await historyProvider?.provideHistoryItemRefs(historyItemRefs, token);
      return refs?.map((ref) => ({ ...ref, icon: getHistoryItemIconDto(ref.icon) })) ?? void 0;
    } catch (err) {
      this.logService.error("ExtHostSCM#$provideHistoryItemRefs", err);
      return void 0;
    }
  }
  async $provideHistoryItems(sourceControlHandle, options, token) {
    try {
      const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
      const historyItems = await historyProvider?.provideHistoryItems(options, token);
      return historyItems?.map((item) => toSCMHistoryItemDto(item)) ?? void 0;
    } catch (err) {
      this.logService.error("ExtHostSCM#$provideHistoryItems", err);
      return void 0;
    }
  }
  async $provideHistoryItemChanges(sourceControlHandle, historyItemId, historyItemParentId, token) {
    try {
      const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
      const changes = await historyProvider?.provideHistoryItemChanges(historyItemId, historyItemParentId, token);
      return changes ?? void 0;
    } catch (err) {
      this.logService.error("ExtHostSCM#$provideHistoryItemChanges", err);
      return void 0;
    }
  }
  async $provideArtifactGroups(sourceControlHandle, token) {
    try {
      const artifactProvider = this._sourceControls.get(sourceControlHandle)?.artifactProvider;
      const groups = await artifactProvider?.provideArtifactGroups(token);
      return groups?.map((group) => ({
        ...group,
        icon: getHistoryItemIconDto(group.icon)
      }));
    } catch (err) {
      this.logService.error("ExtHostSCM#$provideArtifactGroups", err);
      return void 0;
    }
  }
  async $provideArtifacts(sourceControlHandle, group, token) {
    try {
      const sourceControl = this._sourceControls.get(sourceControlHandle);
      return sourceControl?.provideArtifacts(group, token);
    } catch (err) {
      this.logService.error("ExtHostSCM#$provideArtifacts", err);
      return void 0;
    }
  }
};
ExtHostSCM = __decorateClass([
  __decorateParam(3, ILogService)
], ExtHostSCM);
export {
  ExtHostSCM,
  ExtHostSCMInputBox
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RTQ00udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBkZWJvdW5jZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXNQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRTQ01TaGFwZSwgU0NNUmF3UmVzb3VyY2UsIFNDTVJhd1Jlc291cmNlU3BsaWNlLCBTQ01SYXdSZXNvdXJjZVNwbGljZXMsIElNYWluQ29udGV4dCwgRXh0SG9zdFNDTVNoYXBlLCBJQ29tbWFuZER0bywgTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlLCBTQ01Hcm91cEZlYXR1cmVzLCBTQ01IaXN0b3J5SXRlbUR0bywgU0NNSGlzdG9yeUl0ZW1DaGFuZ2VEdG8sIFNDTUhpc3RvcnlJdGVtUmVmRHRvLCBTQ01BY3Rpb25CdXR0b25EdG8sIFNDTUFydGlmYWN0R3JvdXBEdG8sIFNDTUFydGlmYWN0RHRvIH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IHNvcnRlZERpZmYsIGVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBjb21wYXJlUGF0aHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb21wYXJlcnMuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IElTcGxpY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXF1ZW5jZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXJNYXAsIElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nLCBTb3VyY2VDb250cm9sSW5wdXRCb3hWYWxpZGF0aW9uVHlwZSB9IGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkLCBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50cyB9IGZyb20gJy4vZXh0SG9zdERvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgc3RydWN0dXJhbEVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2VxdWFscy5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcblxudHlwZSBQcm92aWRlckhhbmRsZSA9IG51bWJlcjtcbnR5cGUgR3JvdXBIYW5kbGUgPSBudW1iZXI7XG50eXBlIFJlc291cmNlU3RhdGVIYW5kbGUgPSBudW1iZXI7XG5cbmZ1bmN0aW9uIGlzVXJpKHRoaW5nOiBhbnkpOiB0aGluZyBpcyB2c2NvZGUuVXJpIHtcblx0cmV0dXJuIHRoaW5nIGluc3RhbmNlb2YgVVJJO1xufVxuXG5mdW5jdGlvbiB1cmlFcXVhbHMoYTogdnNjb2RlLlVyaSwgYjogdnNjb2RlLlVyaSk6IGJvb2xlYW4ge1xuXHRpZiAoYS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSAmJiBiLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlICYmIGlzTGludXgpIHtcblx0XHRyZXR1cm4gYS50b1N0cmluZygpID09PSBiLnRvU3RyaW5nKCk7XG5cdH1cblxuXHRyZXR1cm4gYS50b1N0cmluZygpLnRvTG93ZXJDYXNlKCkgPT09IGIudG9TdHJpbmcoKS50b0xvd2VyQ2FzZSgpO1xufVxuXG5mdW5jdGlvbiBnZXRJY29uUmVzb3VyY2UoZGVjb3JhdGlvbnM/OiB2c2NvZGUuU291cmNlQ29udHJvbFJlc291cmNlVGhlbWFibGVEZWNvcmF0aW9ucyk6IFVyaUNvbXBvbmVudHMgfCBUaGVtZUljb24gfCB1bmRlZmluZWQge1xuXHRpZiAoIWRlY29yYXRpb25zKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fSBlbHNlIGlmICh0eXBlb2YgZGVjb3JhdGlvbnMuaWNvblBhdGggPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIFVSSS5maWxlKGRlY29yYXRpb25zLmljb25QYXRoKTtcblx0fSBlbHNlIGlmIChVUkkuaXNVcmkoZGVjb3JhdGlvbnMuaWNvblBhdGgpKSB7XG5cdFx0cmV0dXJuIGRlY29yYXRpb25zLmljb25QYXRoO1xuXHR9IGVsc2UgaWYgKFRoZW1lSWNvbi5pc1RoZW1lSWNvbihkZWNvcmF0aW9ucy5pY29uUGF0aCkpIHtcblx0XHRyZXR1cm4gZGVjb3JhdGlvbnMuaWNvblBhdGg7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRIaXN0b3J5SXRlbUljb25EdG8oaWNvbjogdnNjb2RlLlVyaSB8IHsgbGlnaHQ6IHZzY29kZS5Vcmk7IGRhcms6IHZzY29kZS5VcmkgfSB8IHZzY29kZS5UaGVtZUljb24gfCB1bmRlZmluZWQpOiBVcmlDb21wb25lbnRzIHwgeyBsaWdodDogVXJpQ29tcG9uZW50czsgZGFyazogVXJpQ29tcG9uZW50cyB9IHwgVGhlbWVJY29uIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFpY29uKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fSBlbHNlIGlmIChVUkkuaXNVcmkoaWNvbikpIHtcblx0XHRyZXR1cm4gaWNvbjtcblx0fSBlbHNlIGlmIChUaGVtZUljb24uaXNUaGVtZUljb24oaWNvbikpIHtcblx0XHRyZXR1cm4gaWNvbjtcblx0fSBlbHNlIHtcblx0XHRjb25zdCBpY29uRHRvID0gaWNvbiBhcyB7IGxpZ2h0OiBVUkk7IGRhcms6IFVSSSB9O1xuXHRcdHJldHVybiB7IGxpZ2h0OiBpY29uRHRvLmxpZ2h0LCBkYXJrOiBpY29uRHRvLmRhcmsgfTtcblx0fVxufVxuXG5mdW5jdGlvbiB0b1NDTUhpc3RvcnlJdGVtRHRvKGhpc3RvcnlJdGVtOiB2c2NvZGUuU291cmNlQ29udHJvbEhpc3RvcnlJdGVtKTogU0NNSGlzdG9yeUl0ZW1EdG8ge1xuXHRjb25zdCBhdXRob3JJY29uID0gZ2V0SGlzdG9yeUl0ZW1JY29uRHRvKGhpc3RvcnlJdGVtLmF1dGhvckljb24pO1xuXHRjb25zdCB0b29sdGlwID0gQXJyYXkuaXNBcnJheShoaXN0b3J5SXRlbS50b29sdGlwKVxuXHRcdD8gTWFya2Rvd25TdHJpbmcuZnJvbU1hbnkoaGlzdG9yeUl0ZW0udG9vbHRpcClcblx0XHQ6IGhpc3RvcnlJdGVtLnRvb2x0aXAgPyBNYXJrZG93blN0cmluZy5mcm9tKGhpc3RvcnlJdGVtLnRvb2x0aXApIDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0IHJlZmVyZW5jZXMgPSBoaXN0b3J5SXRlbS5yZWZlcmVuY2VzPy5tYXAociA9PiAoe1xuXHRcdC4uLnIsIGljb246IGdldEhpc3RvcnlJdGVtSWNvbkR0byhyLmljb24pXG5cdH0pKTtcblxuXHRyZXR1cm4geyAuLi5oaXN0b3J5SXRlbSwgYXV0aG9ySWNvbiwgcmVmZXJlbmNlcywgdG9vbHRpcCB9O1xufVxuXG5mdW5jdGlvbiB0b1NDTUhpc3RvcnlJdGVtUmVmRHRvKGhpc3RvcnlJdGVtUmVmPzogdnNjb2RlLlNvdXJjZUNvbnRyb2xIaXN0b3J5SXRlbVJlZik6IFNDTUhpc3RvcnlJdGVtUmVmRHRvIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGhpc3RvcnlJdGVtUmVmID8geyAuLi5oaXN0b3J5SXRlbVJlZiwgaWNvbjogZ2V0SGlzdG9yeUl0ZW1JY29uRHRvKGhpc3RvcnlJdGVtUmVmLmljb24pIH0gOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVSZXNvdXJjZVRoZW1hYmxlRGVjb3JhdGlvbnMoYTogdnNjb2RlLlNvdXJjZUNvbnRyb2xSZXNvdXJjZVRoZW1hYmxlRGVjb3JhdGlvbnMsIGI6IHZzY29kZS5Tb3VyY2VDb250cm9sUmVzb3VyY2VUaGVtYWJsZURlY29yYXRpb25zKTogbnVtYmVyIHtcblx0aWYgKCFhLmljb25QYXRoICYmICFiLmljb25QYXRoKSB7XG5cdFx0cmV0dXJuIDA7XG5cdH0gZWxzZSBpZiAoIWEuaWNvblBhdGgpIHtcblx0XHRyZXR1cm4gLTE7XG5cdH0gZWxzZSBpZiAoIWIuaWNvblBhdGgpIHtcblx0XHRyZXR1cm4gMTtcblx0fVxuXG5cdGNvbnN0IGFQYXRoID0gdHlwZW9mIGEuaWNvblBhdGggPT09ICdzdHJpbmcnID8gYS5pY29uUGF0aCA6IFVSSS5pc1VyaShhLmljb25QYXRoKSA/IGEuaWNvblBhdGguZnNQYXRoIDogKGEuaWNvblBhdGggYXMgdnNjb2RlLlRoZW1lSWNvbikuaWQ7XG5cdGNvbnN0IGJQYXRoID0gdHlwZW9mIGIuaWNvblBhdGggPT09ICdzdHJpbmcnID8gYi5pY29uUGF0aCA6IFVSSS5pc1VyaShiLmljb25QYXRoKSA/IGIuaWNvblBhdGguZnNQYXRoIDogKGIuaWNvblBhdGggYXMgdnNjb2RlLlRoZW1lSWNvbikuaWQ7XG5cdHJldHVybiBjb21wYXJlUGF0aHMoYVBhdGgsIGJQYXRoKTtcbn1cblxuZnVuY3Rpb24gY29tcGFyZVJlc291cmNlU3RhdGVzRGVjb3JhdGlvbnMoYTogdnNjb2RlLlNvdXJjZUNvbnRyb2xSZXNvdXJjZURlY29yYXRpb25zLCBiOiB2c2NvZGUuU291cmNlQ29udHJvbFJlc291cmNlRGVjb3JhdGlvbnMpOiBudW1iZXIge1xuXHRsZXQgcmVzdWx0ID0gMDtcblxuXHRpZiAoYS5zdHJpa2VUaHJvdWdoICE9PSBiLnN0cmlrZVRocm91Z2gpIHtcblx0XHRyZXR1cm4gYS5zdHJpa2VUaHJvdWdoID8gMSA6IC0xO1xuXHR9XG5cblx0aWYgKGEuZmFkZWQgIT09IGIuZmFkZWQpIHtcblx0XHRyZXR1cm4gYS5mYWRlZCA/IDEgOiAtMTtcblx0fVxuXG5cdGlmIChhLnRvb2x0aXAgIT09IGIudG9vbHRpcCkge1xuXHRcdHJldHVybiAoYS50b29sdGlwIHx8ICcnKS5sb2NhbGVDb21wYXJlKGIudG9vbHRpcCB8fCAnJyk7XG5cdH1cblxuXHRyZXN1bHQgPSBjb21wYXJlUmVzb3VyY2VUaGVtYWJsZURlY29yYXRpb25zKGEsIGIpO1xuXG5cdGlmIChyZXN1bHQgIT09IDApIHtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0aWYgKGEubGlnaHQgJiYgYi5saWdodCkge1xuXHRcdHJlc3VsdCA9IGNvbXBhcmVSZXNvdXJjZVRoZW1hYmxlRGVjb3JhdGlvbnMoYS5saWdodCwgYi5saWdodCk7XG5cdH0gZWxzZSBpZiAoYS5saWdodCkge1xuXHRcdHJldHVybiAxO1xuXHR9IGVsc2UgaWYgKGIubGlnaHQpIHtcblx0XHRyZXR1cm4gLTE7XG5cdH1cblxuXHRpZiAocmVzdWx0ICE9PSAwKSB7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGlmIChhLmRhcmsgJiYgYi5kYXJrKSB7XG5cdFx0cmVzdWx0ID0gY29tcGFyZVJlc291cmNlVGhlbWFibGVEZWNvcmF0aW9ucyhhLmRhcmssIGIuZGFyayk7XG5cdH0gZWxzZSBpZiAoYS5kYXJrKSB7XG5cdFx0cmV0dXJuIDE7XG5cdH0gZWxzZSBpZiAoYi5kYXJrKSB7XG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gY29tcGFyZUNvbW1hbmRzKGE6IHZzY29kZS5Db21tYW5kLCBiOiB2c2NvZGUuQ29tbWFuZCk6IG51bWJlciB7XG5cdGlmIChhLmNvbW1hbmQgIT09IGIuY29tbWFuZCkge1xuXHRcdHJldHVybiBhLmNvbW1hbmQgPCBiLmNvbW1hbmQgPyAtMSA6IDE7XG5cdH1cblxuXHRpZiAoYS50aXRsZSAhPT0gYi50aXRsZSkge1xuXHRcdHJldHVybiBhLnRpdGxlIDwgYi50aXRsZSA/IC0xIDogMTtcblx0fVxuXG5cdGlmIChhLnRvb2x0aXAgIT09IGIudG9vbHRpcCkge1xuXHRcdGlmIChhLnRvb2x0aXAgIT09IHVuZGVmaW5lZCAmJiBiLnRvb2x0aXAgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGEudG9vbHRpcCA8IGIudG9vbHRpcCA/IC0xIDogMTtcblx0XHR9IGVsc2UgaWYgKGEudG9vbHRpcCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9IGVsc2UgaWYgKGIudG9vbHRpcCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHR9XG5cblx0aWYgKGEuYXJndW1lbnRzID09PSBiLmFyZ3VtZW50cykge1xuXHRcdHJldHVybiAwO1xuXHR9IGVsc2UgaWYgKCFhLmFyZ3VtZW50cykge1xuXHRcdHJldHVybiAtMTtcblx0fSBlbHNlIGlmICghYi5hcmd1bWVudHMpIHtcblx0XHRyZXR1cm4gMTtcblx0fSBlbHNlIGlmIChhLmFyZ3VtZW50cy5sZW5ndGggIT09IGIuYXJndW1lbnRzLmxlbmd0aCkge1xuXHRcdHJldHVybiBhLmFyZ3VtZW50cy5sZW5ndGggLSBiLmFyZ3VtZW50cy5sZW5ndGg7XG5cdH1cblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IGEuYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgYUFyZyA9IGEuYXJndW1lbnRzW2ldO1xuXHRcdGNvbnN0IGJBcmcgPSBiLmFyZ3VtZW50c1tpXTtcblxuXHRcdGlmIChhQXJnID09PSBiQXJnKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAoaXNVcmkoYUFyZykgJiYgaXNVcmkoYkFyZykgJiYgdXJpRXF1YWxzKGFBcmcsIGJBcmcpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYUFyZyA8IGJBcmcgPyAtMSA6IDE7XG5cdH1cblxuXHRyZXR1cm4gMDtcbn1cblxuZnVuY3Rpb24gY29tcGFyZVJlc291cmNlU3RhdGVzKGE6IHZzY29kZS5Tb3VyY2VDb250cm9sUmVzb3VyY2VTdGF0ZSwgYjogdnNjb2RlLlNvdXJjZUNvbnRyb2xSZXNvdXJjZVN0YXRlKTogbnVtYmVyIHtcblx0bGV0IHJlc3VsdCA9IGNvbXBhcmVQYXRocyhhLnJlc291cmNlVXJpLmZzUGF0aCwgYi5yZXNvdXJjZVVyaS5mc1BhdGgsIHRydWUpO1xuXG5cdGlmIChyZXN1bHQgIT09IDApIHtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0aWYgKGEuY29tbWFuZCAmJiBiLmNvbW1hbmQpIHtcblx0XHRyZXN1bHQgPSBjb21wYXJlQ29tbWFuZHMoYS5jb21tYW5kLCBiLmNvbW1hbmQpO1xuXHR9IGVsc2UgaWYgKGEuY29tbWFuZCkge1xuXHRcdHJldHVybiAxO1xuXHR9IGVsc2UgaWYgKGIuY29tbWFuZCkge1xuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cdGlmIChyZXN1bHQgIT09IDApIHtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0aWYgKGEuZGVjb3JhdGlvbnMgJiYgYi5kZWNvcmF0aW9ucykge1xuXHRcdHJlc3VsdCA9IGNvbXBhcmVSZXNvdXJjZVN0YXRlc0RlY29yYXRpb25zKGEuZGVjb3JhdGlvbnMsIGIuZGVjb3JhdGlvbnMpO1xuXHR9IGVsc2UgaWYgKGEuZGVjb3JhdGlvbnMpIHtcblx0XHRyZXR1cm4gMTtcblx0fSBlbHNlIGlmIChiLmRlY29yYXRpb25zKSB7XG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblx0aWYgKHJlc3VsdCAhPT0gMCkge1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRpZiAoYS5tdWx0aUZpbGVEaWZmRWRpdG9yTW9kaWZpZWRVcmkgJiYgYi5tdWx0aUZpbGVEaWZmRWRpdG9yTW9kaWZpZWRVcmkpIHtcblx0XHRyZXN1bHQgPSBjb21wYXJlUGF0aHMoYS5tdWx0aUZpbGVEaWZmRWRpdG9yTW9kaWZpZWRVcmkuZnNQYXRoLCBiLm11bHRpRmlsZURpZmZFZGl0b3JNb2RpZmllZFVyaS5mc1BhdGgsIHRydWUpO1xuXHR9IGVsc2UgaWYgKGEubXVsdGlGaWxlRGlmZkVkaXRvck1vZGlmaWVkVXJpKSB7XG5cdFx0cmV0dXJuIDE7XG5cdH0gZWxzZSBpZiAoYi5tdWx0aUZpbGVEaWZmRWRpdG9yTW9kaWZpZWRVcmkpIHtcblx0XHRyZXR1cm4gLTE7XG5cdH1cblxuXHRpZiAocmVzdWx0ICE9PSAwKSB7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGlmIChhLm11bHRpRGlmZkVkaXRvck9yaWdpbmFsVXJpICYmIGIubXVsdGlEaWZmRWRpdG9yT3JpZ2luYWxVcmkpIHtcblx0XHRyZXN1bHQgPSBjb21wYXJlUGF0aHMoYS5tdWx0aURpZmZFZGl0b3JPcmlnaW5hbFVyaS5mc1BhdGgsIGIubXVsdGlEaWZmRWRpdG9yT3JpZ2luYWxVcmkuZnNQYXRoLCB0cnVlKTtcblx0fSBlbHNlIGlmIChhLm11bHRpRGlmZkVkaXRvck9yaWdpbmFsVXJpKSB7XG5cdFx0cmV0dXJuIDE7XG5cdH0gZWxzZSBpZiAoYi5tdWx0aURpZmZFZGl0b3JPcmlnaW5hbFVyaSkge1xuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVBcmdzKGE6IGFueVtdLCBiOiBhbnlbXSk6IGJvb2xlYW4ge1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcblx0XHRpZiAoYVtpXSAhPT0gYltpXSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBjb21tYW5kRXF1YWxzKGE6IHZzY29kZS5Db21tYW5kLCBiOiB2c2NvZGUuQ29tbWFuZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYS5jb21tYW5kID09PSBiLmNvbW1hbmRcblx0XHQmJiBhLnRpdGxlID09PSBiLnRpdGxlXG5cdFx0JiYgYS50b29sdGlwID09PSBiLnRvb2x0aXBcblx0XHQmJiAoYS5hcmd1bWVudHMgJiYgYi5hcmd1bWVudHMgPyBjb21wYXJlQXJncyhhLmFyZ3VtZW50cywgYi5hcmd1bWVudHMpIDogYS5hcmd1bWVudHMgPT09IGIuYXJndW1lbnRzKTtcbn1cblxuZnVuY3Rpb24gY29tbWFuZExpc3RFcXVhbHMoYTogcmVhZG9ubHkgdnNjb2RlLkNvbW1hbmRbXSwgYjogcmVhZG9ubHkgdnNjb2RlLkNvbW1hbmRbXSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZXF1YWxzKGEsIGIsIGNvbW1hbmRFcXVhbHMpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElWYWxpZGF0ZUlucHV0IHtcblx0KHZhbHVlOiBzdHJpbmcsIGN1cnNvclBvc2l0aW9uOiBudW1iZXIpOiB2c2NvZGUuUHJvdmlkZXJSZXN1bHQ8dnNjb2RlLlNvdXJjZUNvbnRyb2xJbnB1dEJveFZhbGlkYXRpb24gfCB1bmRlZmluZWQgfCBudWxsPjtcbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RTQ01JbnB1dEJveCBpbXBsZW1lbnRzIHZzY29kZS5Tb3VyY2VDb250cm9sSW5wdXRCb3gge1xuXG5cdCNwcm94eTogTWFpblRocmVhZFNDTVNoYXBlO1xuXHQjZXh0SG9zdERvY3VtZW50czogRXh0SG9zdERvY3VtZW50cztcblxuXHRwcml2YXRlIF92YWx1ZTogc3RyaW5nID0gJyc7XG5cblx0Z2V0IHZhbHVlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbHVlO1xuXHR9XG5cblx0c2V0IHZhbHVlKHZhbHVlOiBzdHJpbmcpIHtcblx0XHR2YWx1ZSA9IHZhbHVlID8/ICcnO1xuXHRcdHRoaXMuI3Byb3h5LiRzZXRJbnB1dEJveFZhbHVlKHRoaXMuX3NvdXJjZUNvbnRyb2xIYW5kbGUsIHZhbHVlKTtcblx0XHR0aGlzLnVwZGF0ZVZhbHVlKHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXG5cdGdldCBvbkRpZENoYW5nZSgpOiBFdmVudDxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cdH1cblxuXHRwcml2YXRlIF9wbGFjZWhvbGRlcjogc3RyaW5nID0gJyc7XG5cblx0Z2V0IHBsYWNlaG9sZGVyKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3BsYWNlaG9sZGVyO1xuXHR9XG5cblx0c2V0IHBsYWNlaG9sZGVyKHBsYWNlaG9sZGVyOiBzdHJpbmcpIHtcblx0XHR0aGlzLiNwcm94eS4kc2V0SW5wdXRCb3hQbGFjZWhvbGRlcih0aGlzLl9zb3VyY2VDb250cm9sSGFuZGxlLCBwbGFjZWhvbGRlcik7XG5cdFx0dGhpcy5fcGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlcjtcblx0fVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlSW5wdXQ6IElWYWxpZGF0ZUlucHV0IHwgdW5kZWZpbmVkO1xuXG5cdGdldCB2YWxpZGF0ZUlucHV0KCk6IElWYWxpZGF0ZUlucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdzY21WYWxpZGF0aW9uJyk7XG5cblx0XHRyZXR1cm4gdGhpcy5fdmFsaWRhdGVJbnB1dDtcblx0fVxuXG5cdHNldCB2YWxpZGF0ZUlucHV0KGZuOiBJVmFsaWRhdGVJbnB1dCB8IHVuZGVmaW5lZCkge1xuXHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ3NjbVZhbGlkYXRpb24nKTtcblxuXHRcdGlmIChmbiAmJiB0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgWyR7dGhpcy5fZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9XTogSW52YWxpZCBTQ00gaW5wdXQgYm94IHZhbGlkYXRpb24gZnVuY3Rpb25gKTtcblx0XHR9XG5cblx0XHR0aGlzLl92YWxpZGF0ZUlucHV0ID0gZm47XG5cdFx0dGhpcy4jcHJveHkuJHNldFZhbGlkYXRpb25Qcm92aWRlcklzRW5hYmxlZCh0aGlzLl9zb3VyY2VDb250cm9sSGFuZGxlLCAhIWZuKTtcblx0fVxuXG5cdHByaXZhdGUgX2VuYWJsZWQ6IGJvb2xlYW4gPSB0cnVlO1xuXG5cdGdldCBlbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9lbmFibGVkO1xuXHR9XG5cblx0c2V0IGVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbikge1xuXHRcdGVuYWJsZWQgPSAhIWVuYWJsZWQ7XG5cblx0XHRpZiAodGhpcy5fZW5hYmxlZCA9PT0gZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2VuYWJsZWQgPSBlbmFibGVkO1xuXHRcdHRoaXMuI3Byb3h5LiRzZXRJbnB1dEJveEVuYWJsZW1lbnQodGhpcy5fc291cmNlQ29udHJvbEhhbmRsZSwgZW5hYmxlZCk7XG5cdH1cblxuXHRwcml2YXRlIF92aXNpYmxlOiBib29sZWFuID0gdHJ1ZTtcblxuXHRnZXQgdmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlzaWJsZTtcblx0fVxuXG5cdHNldCB2aXNpYmxlKHZpc2libGU6IGJvb2xlYW4pIHtcblx0XHR2aXNpYmxlID0gISF2aXNpYmxlO1xuXG5cdFx0aWYgKHRoaXMuX3Zpc2libGUgPT09IHZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl92aXNpYmxlID0gdmlzaWJsZTtcblx0XHR0aGlzLiNwcm94eS4kc2V0SW5wdXRCb3hWaXNpYmlsaXR5KHRoaXMuX3NvdXJjZUNvbnRyb2xIYW5kbGUsIHZpc2libGUpO1xuXHR9XG5cblx0Z2V0IGRvY3VtZW50KCk6IHZzY29kZS5UZXh0RG9jdW1lbnQge1xuXHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ3NjbVRleHREb2N1bWVudCcpO1xuXG5cdFx0cmV0dXJuIHRoaXMuI2V4dEhvc3REb2N1bWVudHMuZ2V0RG9jdW1lbnQodGhpcy5fZG9jdW1lbnRVcmkpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBfZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIF9leHRIb3N0RG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLCBwcm94eTogTWFpblRocmVhZFNDTVNoYXBlLCBwcml2YXRlIF9zb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIHByaXZhdGUgX2RvY3VtZW50VXJpOiBVUkkpIHtcblx0XHR0aGlzLiNleHRIb3N0RG9jdW1lbnRzID0gX2V4dEhvc3REb2N1bWVudHM7XG5cdFx0dGhpcy4jcHJveHkgPSBwcm94eTtcblx0fVxuXG5cdHNob3dWYWxpZGF0aW9uTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcsIHR5cGU6IHZzY29kZS5Tb3VyY2VDb250cm9sSW5wdXRCb3hWYWxpZGF0aW9uVHlwZSkge1xuXHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ3NjbVZhbGlkYXRpb24nKTtcblx0XHR0aGlzLiNwcm94eS4kc2hvd1ZhbGlkYXRpb25NZXNzYWdlKHRoaXMuX3NvdXJjZUNvbnRyb2xIYW5kbGUsIG1lc3NhZ2UsIFNvdXJjZUNvbnRyb2xJbnB1dEJveFZhbGlkYXRpb25UeXBlLmZyb20odHlwZSkpO1xuXHR9XG5cblx0JG9uSW5wdXRCb3hWYWx1ZUNoYW5nZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVWYWx1ZSh2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVZhbHVlKHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodmFsdWUpO1xuXHR9XG59XG5cbmNsYXNzIEV4dEhvc3RTb3VyY2VDb250cm9sUmVzb3VyY2VHcm91cCBpbXBsZW1lbnRzIHZzY29kZS5Tb3VyY2VDb250cm9sUmVzb3VyY2VHcm91cCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2hhbmRsZVBvb2w6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX3Jlc291cmNlSGFuZGxlUG9vbDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfcmVzb3VyY2VTdGF0ZXM6IHZzY29kZS5Tb3VyY2VDb250cm9sUmVzb3VyY2VTdGF0ZVtdID0gW107XG5cblx0cHJpdmF0ZSBfcmVzb3VyY2VTdGF0ZXNNYXAgPSBuZXcgTWFwPFJlc291cmNlU3RhdGVIYW5kbGUsIHZzY29kZS5Tb3VyY2VDb250cm9sUmVzb3VyY2VTdGF0ZT4oKTtcblx0cHJpdmF0ZSBfcmVzb3VyY2VTdGF0ZXNDb21tYW5kc01hcCA9IG5ldyBNYXA8UmVzb3VyY2VTdGF0ZUhhbmRsZSwgdnNjb2RlLkNvbW1hbmQ+KCk7XG5cdHByaXZhdGUgX3Jlc291cmNlU3RhdGVzRGlzcG9zYWJsZXNNYXAgPSBuZXcgTWFwPFJlc291cmNlU3RhdGVIYW5kbGUsIElEaXNwb3NhYmxlPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVXBkYXRlUmVzb3VyY2VTdGF0ZXMgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZVJlc291cmNlU3RhdGVzID0gdGhpcy5fb25EaWRVcGRhdGVSZXNvdXJjZVN0YXRlcy5ldmVudDtcblxuXHRwcml2YXRlIF9kaXNwb3NlZCA9IGZhbHNlO1xuXHRnZXQgZGlzcG9zZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9kaXNwb3NlZDsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZERpc3Bvc2UgPSB0aGlzLl9vbkRpZERpc3Bvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfaGFuZGxlc1NuYXBzaG90OiBudW1iZXJbXSA9IFtdO1xuXHRwcml2YXRlIF9yZXNvdXJjZVNuYXBzaG90OiB2c2NvZGUuU291cmNlQ29udHJvbFJlc291cmNlU3RhdGVbXSA9IFtdO1xuXG5cdGdldCBpZCgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5faWQ7IH1cblxuXHRnZXQgbGFiZWwoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX2xhYmVsOyB9XG5cdHNldCBsYWJlbChsYWJlbDogc3RyaW5nKSB7XG5cdFx0dGhpcy5fbGFiZWwgPSBsYWJlbDtcblx0XHR0aGlzLl9wcm94eS4kdXBkYXRlR3JvdXBMYWJlbCh0aGlzLl9zb3VyY2VDb250cm9sSGFuZGxlLCB0aGlzLmhhbmRsZSwgbGFiZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29udGV4dFZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGdldCBjb250ZXh0VmFsdWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dFZhbHVlO1xuXHR9XG5cdHNldCBjb250ZXh0VmFsdWUoY29udGV4dFZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9jb250ZXh0VmFsdWUgPSBjb250ZXh0VmFsdWU7XG5cdFx0dGhpcy5fcHJveHkuJHVwZGF0ZUdyb3VwKHRoaXMuX3NvdXJjZUNvbnRyb2xIYW5kbGUsIHRoaXMuaGFuZGxlLCB0aGlzLmZlYXR1cmVzKTtcblx0fVxuXG5cdHByaXZhdGUgX2hpZGVXaGVuRW1wdHk6IGJvb2xlYW4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGdldCBoaWRlV2hlbkVtcHR5KCk6IGJvb2xlYW4gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5faGlkZVdoZW5FbXB0eTsgfVxuXHRzZXQgaGlkZVdoZW5FbXB0eShoaWRlV2hlbkVtcHR5OiBib29sZWFuIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5faGlkZVdoZW5FbXB0eSA9IGhpZGVXaGVuRW1wdHk7XG5cdFx0dGhpcy5fcHJveHkuJHVwZGF0ZUdyb3VwKHRoaXMuX3NvdXJjZUNvbnRyb2xIYW5kbGUsIHRoaXMuaGFuZGxlLCB0aGlzLmZlYXR1cmVzKTtcblx0fVxuXG5cdGdldCBmZWF0dXJlcygpOiBTQ01Hcm91cEZlYXR1cmVzIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGV4dFZhbHVlOiB0aGlzLmNvbnRleHRWYWx1ZSxcblx0XHRcdGhpZGVXaGVuRW1wdHk6IHRoaXMuaGlkZVdoZW5FbXB0eVxuXHRcdH07XG5cdH1cblxuXHRnZXQgcmVzb3VyY2VTdGF0ZXMoKTogdnNjb2RlLlNvdXJjZUNvbnRyb2xSZXNvdXJjZVN0YXRlW10geyByZXR1cm4gWy4uLnRoaXMuX3Jlc291cmNlU3RhdGVzXTsgfVxuXHRzZXQgcmVzb3VyY2VTdGF0ZXMocmVzb3VyY2VzOiB2c2NvZGUuU291cmNlQ29udHJvbFJlc291cmNlU3RhdGVbXSkge1xuXHRcdHRoaXMuX3Jlc291cmNlU3RhdGVzID0gWy4uLnJlc291cmNlc107XG5cdFx0dGhpcy5fb25EaWRVcGRhdGVSZXNvdXJjZVN0YXRlcy5maXJlKCk7XG5cdH1cblxuXHRyZWFkb25seSBoYW5kbGUgPSBFeHRIb3N0U291cmNlQ29udHJvbFJlc291cmNlR3JvdXAuX2hhbmRsZVBvb2wrKztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9wcm94eTogTWFpblRocmVhZFNDTVNoYXBlLFxuXHRcdHByaXZhdGUgX2NvbW1hbmRzOiBFeHRIb3N0Q29tbWFuZHMsXG5cdFx0cHJpdmF0ZSBfc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLFxuXHRcdHByaXZhdGUgX2lkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBfbGFiZWw6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbXVsdGlEaWZmRWRpdG9yRW5hYmxlVmlld0NoYW5nZXM6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdCkgeyB9XG5cblx0Z2V0UmVzb3VyY2VTdGF0ZShoYW5kbGU6IG51bWJlcik6IHZzY29kZS5Tb3VyY2VDb250cm9sUmVzb3VyY2VTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc291cmNlU3RhdGVzTWFwLmdldChoYW5kbGUpO1xuXHR9XG5cblx0JGV4ZWN1dGVSZXNvdXJjZUNvbW1hbmQoaGFuZGxlOiBudW1iZXIsIHByZXNlcnZlRm9jdXM6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb21tYW5kID0gdGhpcy5fcmVzb3VyY2VTdGF0ZXNDb21tYW5kc01hcC5nZXQoaGFuZGxlKTtcblxuXHRcdGlmICghY29tbWFuZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhc1Byb21pc2UoKCkgPT4gdGhpcy5fY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZC5jb21tYW5kLCAuLi4oY29tbWFuZC5hcmd1bWVudHMgfHwgW10pLCBwcmVzZXJ2ZUZvY3VzKSk7XG5cdH1cblxuXHRfdGFrZVJlc291cmNlU3RhdGVTbmFwc2hvdCgpOiBTQ01SYXdSZXNvdXJjZVNwbGljZVtdIHtcblx0XHRjb25zdCBzbmFwc2hvdCA9IFsuLi50aGlzLl9yZXNvdXJjZVN0YXRlc10uc29ydChjb21wYXJlUmVzb3VyY2VTdGF0ZXMpO1xuXHRcdGNvbnN0IGRpZmZzID0gc29ydGVkRGlmZih0aGlzLl9yZXNvdXJjZVNuYXBzaG90LCBzbmFwc2hvdCwgY29tcGFyZVJlc291cmNlU3RhdGVzKTtcblxuXHRcdGNvbnN0IHNwbGljZXMgPSBkaWZmcy5tYXA8SVNwbGljZTx7IHJhd1Jlc291cmNlOiBTQ01SYXdSZXNvdXJjZTsgaGFuZGxlOiBudW1iZXIgfT4+KGRpZmYgPT4ge1xuXHRcdFx0Y29uc3QgdG9JbnNlcnQgPSBkaWZmLnRvSW5zZXJ0Lm1hcChyID0+IHtcblx0XHRcdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fcmVzb3VyY2VIYW5kbGVQb29sKys7XG5cdFx0XHRcdHRoaXMuX3Jlc291cmNlU3RhdGVzTWFwLnNldChoYW5kbGUsIHIpO1xuXG5cdFx0XHRcdGNvbnN0IHNvdXJjZVVyaSA9IHIucmVzb3VyY2VVcmk7XG5cblx0XHRcdFx0bGV0IGNvbW1hbmQ6IElDb21tYW5kRHRvIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoci5jb21tYW5kKSB7XG5cdFx0XHRcdFx0aWYgKHIuY29tbWFuZC5jb21tYW5kID09PSAndnNjb2RlLm9wZW4nIHx8IHIuY29tbWFuZC5jb21tYW5kID09PSAndnNjb2RlLmRpZmYnIHx8IHIuY29tbWFuZC5jb21tYW5kID09PSAndnNjb2RlLmNoYW5nZXMnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0XHRcdGNvbW1hbmQgPSB0aGlzLl9jb21tYW5kcy5jb252ZXJ0ZXIudG9JbnRlcm5hbChyLmNvbW1hbmQsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHRcdHRoaXMuX3Jlc291cmNlU3RhdGVzRGlzcG9zYWJsZXNNYXAuc2V0KGhhbmRsZSwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZXNvdXJjZVN0YXRlc0NvbW1hbmRzTWFwLnNldChoYW5kbGUsIHIuY29tbWFuZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaGFzU2NtTXVsdGlEaWZmRWRpdG9yUHJvcG9zYWxFbmFibGVkID0gaXNQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAnc2NtTXVsdGlEaWZmRWRpdG9yJyk7XG5cdFx0XHRcdGNvbnN0IG11bHRpRmlsZURpZmZFZGl0b3JPcmlnaW5hbFVyaSA9IGhhc1NjbU11bHRpRGlmZkVkaXRvclByb3Bvc2FsRW5hYmxlZCA/IHIubXVsdGlEaWZmRWRpdG9yT3JpZ2luYWxVcmkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IG11bHRpRmlsZURpZmZFZGl0b3JNb2RpZmllZFVyaSA9IGhhc1NjbU11bHRpRGlmZkVkaXRvclByb3Bvc2FsRW5hYmxlZCA/IHIubXVsdGlGaWxlRGlmZkVkaXRvck1vZGlmaWVkVXJpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdGNvbnN0IGljb24gPSBnZXRJY29uUmVzb3VyY2Uoci5kZWNvcmF0aW9ucyk7XG5cdFx0XHRcdGNvbnN0IGxpZ2h0SWNvbiA9IHIuZGVjb3JhdGlvbnMgJiYgZ2V0SWNvblJlc291cmNlKHIuZGVjb3JhdGlvbnMubGlnaHQpIHx8IGljb247XG5cdFx0XHRcdGNvbnN0IGRhcmtJY29uID0gci5kZWNvcmF0aW9ucyAmJiBnZXRJY29uUmVzb3VyY2Uoci5kZWNvcmF0aW9ucy5kYXJrKSB8fCBpY29uO1xuXHRcdFx0XHRjb25zdCBpY29uczogU0NNUmF3UmVzb3VyY2VbMl0gPSBbbGlnaHRJY29uLCBkYXJrSWNvbl07XG5cblx0XHRcdFx0Y29uc3QgdG9vbHRpcCA9IChyLmRlY29yYXRpb25zICYmIHIuZGVjb3JhdGlvbnMudG9vbHRpcCkgfHwgJyc7XG5cdFx0XHRcdGNvbnN0IHN0cmlrZVRocm91Z2ggPSByLmRlY29yYXRpb25zICYmICEhci5kZWNvcmF0aW9ucy5zdHJpa2VUaHJvdWdoO1xuXHRcdFx0XHRjb25zdCBmYWRlZCA9IHIuZGVjb3JhdGlvbnMgJiYgISFyLmRlY29yYXRpb25zLmZhZGVkO1xuXHRcdFx0XHRjb25zdCBjb250ZXh0VmFsdWUgPSByLmNvbnRleHRWYWx1ZSB8fCAnJztcblxuXHRcdFx0XHRjb25zdCByYXdSZXNvdXJjZSA9IFtoYW5kbGUsIHNvdXJjZVVyaSwgaWNvbnMsIHRvb2x0aXAsIHN0cmlrZVRocm91Z2gsIGZhZGVkLCBjb250ZXh0VmFsdWUsIGNvbW1hbmQsIG11bHRpRmlsZURpZmZFZGl0b3JPcmlnaW5hbFVyaSwgbXVsdGlGaWxlRGlmZkVkaXRvck1vZGlmaWVkVXJpXSBhcyBTQ01SYXdSZXNvdXJjZTtcblxuXHRcdFx0XHRyZXR1cm4geyByYXdSZXNvdXJjZSwgaGFuZGxlIH07XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIHsgc3RhcnQ6IGRpZmYuc3RhcnQsIGRlbGV0ZUNvdW50OiBkaWZmLmRlbGV0ZUNvdW50LCB0b0luc2VydCB9O1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmF3UmVzb3VyY2VTcGxpY2VzID0gc3BsaWNlc1xuXHRcdFx0Lm1hcCgoeyBzdGFydCwgZGVsZXRlQ291bnQsIHRvSW5zZXJ0IH0pID0+IFtzdGFydCwgZGVsZXRlQ291bnQsIHRvSW5zZXJ0Lm1hcChpID0+IGkucmF3UmVzb3VyY2UpXSBhcyBTQ01SYXdSZXNvdXJjZVNwbGljZSk7XG5cblx0XHRjb25zdCByZXZlcnNlU3BsaWNlcyA9IHNwbGljZXMucmV2ZXJzZSgpO1xuXG5cdFx0Zm9yIChjb25zdCB7IHN0YXJ0LCBkZWxldGVDb3VudCwgdG9JbnNlcnQgfSBvZiByZXZlcnNlU3BsaWNlcykge1xuXHRcdFx0Y29uc3QgaGFuZGxlcyA9IHRvSW5zZXJ0Lm1hcChpID0+IGkuaGFuZGxlKTtcblx0XHRcdGNvbnN0IGhhbmRsZXNUb0RlbGV0ZSA9IHRoaXMuX2hhbmRsZXNTbmFwc2hvdC5zcGxpY2Uoc3RhcnQsIGRlbGV0ZUNvdW50LCAuLi5oYW5kbGVzKTtcblxuXHRcdFx0Zm9yIChjb25zdCBoYW5kbGUgb2YgaGFuZGxlc1RvRGVsZXRlKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc291cmNlU3RhdGVzTWFwLmRlbGV0ZShoYW5kbGUpO1xuXHRcdFx0XHR0aGlzLl9yZXNvdXJjZVN0YXRlc0NvbW1hbmRzTWFwLmRlbGV0ZShoYW5kbGUpO1xuXHRcdFx0XHR0aGlzLl9yZXNvdXJjZVN0YXRlc0Rpc3Bvc2FibGVzTWFwLmdldChoYW5kbGUpPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX3Jlc291cmNlU3RhdGVzRGlzcG9zYWJsZXNNYXAuZGVsZXRlKGhhbmRsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVzb3VyY2VTbmFwc2hvdCA9IHNuYXBzaG90O1xuXHRcdHJldHVybiByYXdSZXNvdXJjZVNwbGljZXM7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9vbkRpZERpc3Bvc2UuZmlyZSgpO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlUmVzb3VyY2VTdGF0ZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkRGlzcG9zZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgRXh0SG9zdFNvdXJjZUNvbnRyb2wgaW1wbGVtZW50cyB2c2NvZGUuU291cmNlQ29udHJvbCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2hhbmRsZVBvb2w6IG51bWJlciA9IDA7XG5cblx0cmVhZG9ubHkgb25EaWREaXNwb3NlUGFyZW50OiBFdmVudDx2b2lkPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZERpc3Bvc2UgPSB0aGlzLl9vbkRpZERpc3Bvc2UuZXZlbnQ7XG5cblxuXHQjcHJveHk6IE1haW5UaHJlYWRTQ01TaGFwZTtcblxuXHRwcml2YXRlIF9ncm91cHM6IE1hcDxHcm91cEhhbmRsZSwgRXh0SG9zdFNvdXJjZUNvbnRyb2xSZXNvdXJjZUdyb3VwPiA9IG5ldyBNYXA8R3JvdXBIYW5kbGUsIEV4dEhvc3RTb3VyY2VDb250cm9sUmVzb3VyY2VHcm91cD4oKTtcblxuXHRnZXQgaWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5faWQ7XG5cdH1cblxuXHRnZXQgbGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFiZWw7XG5cdH1cblxuXHRnZXQgcm9vdFVyaSgpOiB2c2NvZGUuVXJpIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcm9vdFVyaTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnRleHRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGdldCBjb250ZXh0VmFsdWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdzY21Qcm92aWRlck9wdGlvbnMnKTtcblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dFZhbHVlO1xuXHR9XG5cblx0c2V0IGNvbnRleHRWYWx1ZShjb250ZXh0VmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ3NjbVByb3ZpZGVyT3B0aW9ucycpO1xuXG5cdFx0aWYgKHRoaXMuX2NvbnRleHRWYWx1ZSA9PT0gY29udGV4dFZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29udGV4dFZhbHVlID0gY29udGV4dFZhbHVlO1xuXHRcdHRoaXMuI3Byb3h5LiR1cGRhdGVTb3VyY2VDb250cm9sKHRoaXMuaGFuZGxlLCB7IGNvbnRleHRWYWx1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2lucHV0Qm94OiBFeHRIb3N0U0NNSW5wdXRCb3g7XG5cdGdldCBpbnB1dEJveCgpOiBFeHRIb3N0U0NNSW5wdXRCb3ggeyByZXR1cm4gdGhpcy5faW5wdXRCb3g7IH1cblxuXHRwcml2YXRlIF9jb3VudDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGdldCBjb3VudCgpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb3VudDtcblx0fVxuXG5cdHNldCBjb3VudChjb3VudDogbnVtYmVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuX2NvdW50ID09PSBjb3VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvdW50ID0gY291bnQ7XG5cdFx0dGhpcy4jcHJveHkuJHVwZGF0ZVNvdXJjZUNvbnRyb2wodGhpcy5oYW5kbGUsIHsgY291bnQgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9xdWlja0RpZmZQcm92aWRlcjogdnNjb2RlLlF1aWNrRGlmZlByb3ZpZGVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGdldCBxdWlja0RpZmZQcm92aWRlcigpOiB2c2NvZGUuUXVpY2tEaWZmUHJvdmlkZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9xdWlja0RpZmZQcm92aWRlcjtcblx0fVxuXG5cdHNldCBxdWlja0RpZmZQcm92aWRlcihxdWlja0RpZmZQcm92aWRlcjogdnNjb2RlLlF1aWNrRGlmZlByb3ZpZGVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fcXVpY2tEaWZmUHJvdmlkZXIgPSBxdWlja0RpZmZQcm92aWRlcjtcblx0XHRsZXQgcXVpY2tEaWZmTGFiZWwgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGlzUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ3F1aWNrRGlmZlByb3ZpZGVyJykpIHtcblx0XHRcdHF1aWNrRGlmZkxhYmVsID0gcXVpY2tEaWZmUHJvdmlkZXI/LmxhYmVsO1xuXHRcdH1cblx0XHR0aGlzLiNwcm94eS4kdXBkYXRlU291cmNlQ29udHJvbCh0aGlzLmhhbmRsZSwgeyBoYXNRdWlja0RpZmZQcm92aWRlcjogISFxdWlja0RpZmZQcm92aWRlciwgcXVpY2tEaWZmTGFiZWwgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZWNvbmRhcnlRdWlja0RpZmZQcm92aWRlcjogdnNjb2RlLlF1aWNrRGlmZlByb3ZpZGVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGdldCBzZWNvbmRhcnlRdWlja0RpZmZQcm92aWRlcigpOiB2c2NvZGUuUXVpY2tEaWZmUHJvdmlkZXIgfCB1bmRlZmluZWQge1xuXHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ3F1aWNrRGlmZlByb3ZpZGVyJyk7XG5cdFx0cmV0dXJuIHRoaXMuX3NlY29uZGFyeVF1aWNrRGlmZlByb3ZpZGVyO1xuXHR9XG5cblx0c2V0IHNlY29uZGFyeVF1aWNrRGlmZlByb3ZpZGVyKHNlY29uZGFyeVF1aWNrRGlmZlByb3ZpZGVyOiB2c2NvZGUuUXVpY2tEaWZmUHJvdmlkZXIgfCB1bmRlZmluZWQpIHtcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdxdWlja0RpZmZQcm92aWRlcicpO1xuXG5cdFx0dGhpcy5fc2Vjb25kYXJ5UXVpY2tEaWZmUHJvdmlkZXIgPSBzZWNvbmRhcnlRdWlja0RpZmZQcm92aWRlcjtcblx0XHRjb25zdCBzZWNvbmRhcnlRdWlja0RpZmZMYWJlbCA9IHNlY29uZGFyeVF1aWNrRGlmZlByb3ZpZGVyPy5sYWJlbDtcblx0XHR0aGlzLiNwcm94eS4kdXBkYXRlU291cmNlQ29udHJvbCh0aGlzLmhhbmRsZSwgeyBoYXNTZWNvbmRhcnlRdWlja0RpZmZQcm92aWRlcjogISFzZWNvbmRhcnlRdWlja0RpZmZQcm92aWRlciwgc2Vjb25kYXJ5UXVpY2tEaWZmTGFiZWwgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9oaXN0b3J5UHJvdmlkZXI6IHZzY29kZS5Tb3VyY2VDb250cm9sSGlzdG9yeVByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oaXN0b3J5UHJvdmlkZXJEaXNwb3NhYmxlID0gbmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKTtcblxuXHRnZXQgaGlzdG9yeVByb3ZpZGVyKCk6IHZzY29kZS5Tb3VyY2VDb250cm9sSGlzdG9yeVByb3ZpZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdzY21IaXN0b3J5UHJvdmlkZXInKTtcblx0XHRyZXR1cm4gdGhpcy5faGlzdG9yeVByb3ZpZGVyO1xuXHR9XG5cblx0c2V0IGhpc3RvcnlQcm92aWRlcihoaXN0b3J5UHJvdmlkZXI6IHZzY29kZS5Tb3VyY2VDb250cm9sSGlzdG9yeVByb3ZpZGVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAnc2NtSGlzdG9yeVByb3ZpZGVyJyk7XG5cblx0XHR0aGlzLl9oaXN0b3J5UHJvdmlkZXIgPSBoaXN0b3J5UHJvdmlkZXI7XG5cdFx0dGhpcy5faGlzdG9yeVByb3ZpZGVyRGlzcG9zYWJsZS52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdHRoaXMuI3Byb3h5LiR1cGRhdGVTb3VyY2VDb250cm9sKHRoaXMuaGFuZGxlLCB7IGhhc0hpc3RvcnlQcm92aWRlcjogISFoaXN0b3J5UHJvdmlkZXIgfSk7XG5cblx0XHRpZiAoaGlzdG9yeVByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9oaXN0b3J5UHJvdmlkZXJEaXNwb3NhYmxlLnZhbHVlLmFkZChoaXN0b3J5UHJvdmlkZXIub25EaWRDaGFuZ2VDdXJyZW50SGlzdG9yeUl0ZW1SZWZzKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWYgPSB0b1NDTUhpc3RvcnlJdGVtUmVmRHRvKGhpc3RvcnlQcm92aWRlcj8uY3VycmVudEhpc3RvcnlJdGVtUmVmKTtcblx0XHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZW1vdGVSZWYgPSB0b1NDTUhpc3RvcnlJdGVtUmVmRHRvKGhpc3RvcnlQcm92aWRlcj8uY3VycmVudEhpc3RvcnlJdGVtUmVtb3RlUmVmKTtcblx0XHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1CYXNlUmVmID0gdG9TQ01IaXN0b3J5SXRlbVJlZkR0byhoaXN0b3J5UHJvdmlkZXI/LmN1cnJlbnRIaXN0b3J5SXRlbUJhc2VSZWYpO1xuXG5cdFx0XHRcdHRoaXMuI3Byb3h5LiRvbkRpZENoYW5nZUhpc3RvcnlQcm92aWRlckN1cnJlbnRIaXN0b3J5SXRlbVJlZnModGhpcy5oYW5kbGUsIGhpc3RvcnlJdGVtUmVmLCBoaXN0b3J5SXRlbVJlbW90ZVJlZiwgaGlzdG9yeUl0ZW1CYXNlUmVmKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX2hpc3RvcnlQcm92aWRlckRpc3Bvc2FibGUudmFsdWUuYWRkKGhpc3RvcnlQcm92aWRlci5vbkRpZENoYW5nZUhpc3RvcnlJdGVtUmVmcygoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5hZGRlZC5sZW5ndGggPT09IDAgJiYgZS5tb2RpZmllZC5sZW5ndGggPT09IDAgJiYgZS5yZW1vdmVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGFkZGVkID0gZS5hZGRlZC5tYXAocmVmID0+ICh7IC4uLnJlZiwgaWNvbjogZ2V0SGlzdG9yeUl0ZW1JY29uRHRvKHJlZi5pY29uKSB9KSk7XG5cdFx0XHRcdGNvbnN0IG1vZGlmaWVkID0gZS5tb2RpZmllZC5tYXAocmVmID0+ICh7IC4uLnJlZiwgaWNvbjogZ2V0SGlzdG9yeUl0ZW1JY29uRHRvKHJlZi5pY29uKSB9KSk7XG5cdFx0XHRcdGNvbnN0IHJlbW92ZWQgPSBlLnJlbW92ZWQubWFwKHJlZiA9PiAoeyAuLi5yZWYsIGljb246IGdldEhpc3RvcnlJdGVtSWNvbkR0byhyZWYuaWNvbikgfSkpO1xuXG5cdFx0XHRcdHRoaXMuI3Byb3h5LiRvbkRpZENoYW5nZUhpc3RvcnlQcm92aWRlckhpc3RvcnlJdGVtUmVmcyh0aGlzLmhhbmRsZSwgeyBhZGRlZCwgbW9kaWZpZWQsIHJlbW92ZWQsIHNpbGVudDogZS5zaWxlbnQgfSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXJ0aWZhY3RQcm92aWRlcjogdnNjb2RlLlNvdXJjZUNvbnRyb2xBcnRpZmFjdFByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hcnRpZmFjdFByb3ZpZGVyRGlzcG9zYWJsZSA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCk7XG5cblx0Z2V0IGFydGlmYWN0UHJvdmlkZXIoKTogdnNjb2RlLlNvdXJjZUNvbnRyb2xBcnRpZmFjdFByb3ZpZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdzY21BcnRpZmFjdFByb3ZpZGVyJyk7XG5cdFx0cmV0dXJuIHRoaXMuX2FydGlmYWN0UHJvdmlkZXI7XG5cdH1cblxuXHRzZXQgYXJ0aWZhY3RQcm92aWRlcihhcnRpZmFjdFByb3ZpZGVyOiB2c2NvZGUuU291cmNlQ29udHJvbEFydGlmYWN0UHJvdmlkZXIgfCB1bmRlZmluZWQpIHtcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdzY21BcnRpZmFjdFByb3ZpZGVyJyk7XG5cblx0XHR0aGlzLl9hcnRpZmFjdFByb3ZpZGVyID0gYXJ0aWZhY3RQcm92aWRlcjtcblx0XHR0aGlzLl9hcnRpZmFjdFByb3ZpZGVyRGlzcG9zYWJsZS52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdHRoaXMuI3Byb3h5LiR1cGRhdGVTb3VyY2VDb250cm9sKHRoaXMuaGFuZGxlLCB7IGhhc0FydGlmYWN0UHJvdmlkZXI6ICEhYXJ0aWZhY3RQcm92aWRlciB9KTtcblxuXHRcdGlmIChhcnRpZmFjdFByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9hcnRpZmFjdFByb3ZpZGVyRGlzcG9zYWJsZS52YWx1ZS5hZGQoYXJ0aWZhY3RQcm92aWRlci5vbkRpZENoYW5nZUFydGlmYWN0cygoZ3JvdXBzOiBzdHJpbmdbXSkgPT4ge1xuXHRcdFx0XHRpZiAoZ3JvdXBzLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuI3Byb3h5LiRvbkRpZENoYW5nZUFydGlmYWN0cyh0aGlzLmhhbmRsZSwgZ3JvdXBzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NvbW1pdFRlbXBsYXRlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Z2V0IGNvbW1pdFRlbXBsYXRlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbW1pdFRlbXBsYXRlO1xuXHR9XG5cblx0c2V0IGNvbW1pdFRlbXBsYXRlKGNvbW1pdFRlbXBsYXRlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoY29tbWl0VGVtcGxhdGUgPT09IHRoaXMuX2NvbW1pdFRlbXBsYXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29tbWl0VGVtcGxhdGUgPSBjb21taXRUZW1wbGF0ZTtcblx0XHR0aGlzLiNwcm94eS4kdXBkYXRlU291cmNlQ29udHJvbCh0aGlzLmhhbmRsZSwgeyBjb21taXRUZW1wbGF0ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjY2VwdElucHV0RGlzcG9zYWJsZXMgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpO1xuXHRwcml2YXRlIF9hY2NlcHRJbnB1dENvbW1hbmQ6IHZzY29kZS5Db21tYW5kIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGdldCBhY2NlcHRJbnB1dENvbW1hbmQoKTogdnNjb2RlLkNvbW1hbmQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hY2NlcHRJbnB1dENvbW1hbmQ7XG5cdH1cblxuXHRzZXQgYWNjZXB0SW5wdXRDb21tYW5kKGFjY2VwdElucHV0Q29tbWFuZDogdnNjb2RlLkNvbW1hbmQgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9hY2NlcHRJbnB1dERpc3Bvc2FibGVzLnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0dGhpcy5fYWNjZXB0SW5wdXRDb21tYW5kID0gYWNjZXB0SW5wdXRDb21tYW5kO1xuXG5cdFx0Y29uc3QgaW50ZXJuYWwgPSB0aGlzLl9jb21tYW5kcy5jb252ZXJ0ZXIudG9JbnRlcm5hbChhY2NlcHRJbnB1dENvbW1hbmQsIHRoaXMuX2FjY2VwdElucHV0RGlzcG9zYWJsZXMudmFsdWUpO1xuXHRcdHRoaXMuI3Byb3h5LiR1cGRhdGVTb3VyY2VDb250cm9sKHRoaXMuaGFuZGxlLCB7IGFjY2VwdElucHV0Q29tbWFuZDogaW50ZXJuYWwgfSk7XG5cdH1cblxuXHQvLyBXZSBrbm93IHdoYXQgd2UncmUgZG9pbmcgaGVyZTpcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tcG90ZW50aWFsbHktdW5zYWZlLWRpc3Bvc2FibGVzXG5cdHByaXZhdGUgX2FjdGlvbkJ1dHRvbkRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIF9hY3Rpb25CdXR0b246IHZzY29kZS5Tb3VyY2VDb250cm9sQWN0aW9uQnV0dG9uIHwgdW5kZWZpbmVkO1xuXHRnZXQgYWN0aW9uQnV0dG9uKCk6IHZzY29kZS5Tb3VyY2VDb250cm9sQWN0aW9uQnV0dG9uIHwgdW5kZWZpbmVkIHtcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdzY21BY3Rpb25CdXR0b24nKTtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uQnV0dG9uO1xuXHR9XG5cblx0c2V0IGFjdGlvbkJ1dHRvbihhY3Rpb25CdXR0b246IHZzY29kZS5Tb3VyY2VDb250cm9sQWN0aW9uQnV0dG9uIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAnc2NtQWN0aW9uQnV0dG9uJyk7XG5cblx0XHQvLyBXZSBoYXZlIHRvIGRvIHRoaXMgY2hlY2sgYmVmb3JlIGNvbnZlcnRpbmcgdGhlIGNvbW1hbmQgdG8gaXQncyBpbnRlcm5hbFxuXHRcdC8vIHJlcHJlc2VudGF0aW9uIHNpbmNlIHRoYXQgd291bGQgYWx3YXlzIGNyZWF0ZSBhIGNvbW1hbmQgd2l0aCBhIHVuaXF1ZVxuXHRcdC8vIGlkZW50aWZpZXJcblx0XHRpZiAoc3RydWN0dXJhbEVxdWFscyh0aGlzLl9hY3Rpb25CdXR0b24sIGFjdGlvbkJ1dHRvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJbiBvcmRlciB0byBwcmV2ZW50IGRpc3Bvc2luZyB0aGUgYWN0aW9uIGJ1dHRvbiBjb21tYW5kIHRoYXQgYXJlIHN0aWxsIHJlbmRlcmVkIGluIHRoZSBVSVxuXHRcdC8vIHVudGlsIHRoZSBuZXh0IFVJIHVwZGF0ZSwgd2UgZW5zdXJlIHRvIGRpc3Bvc2UgdGhlbSBhZnRlciB0aGUgdXBkYXRlIGhhcyBiZWVuIGNvbXBsZXRlZC5cblx0XHRjb25zdCBvbGRBY3Rpb25CdXR0b25EaXNwb3NhYmxlcyA9IHRoaXMuX2FjdGlvbkJ1dHRvbkRpc3Bvc2FibGVzO1xuXHRcdHRoaXMuX2FjdGlvbkJ1dHRvbkRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0dGhpcy5fYWN0aW9uQnV0dG9uID0gYWN0aW9uQnV0dG9uO1xuXG5cdFx0Y29uc3QgYWN0aW9uQnV0dG9uRHRvID0gYWN0aW9uQnV0dG9uICE9PSB1bmRlZmluZWQgP1xuXHRcdFx0e1xuXHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0Li4udGhpcy5fY29tbWFuZHMuY29udmVydGVyLnRvSW50ZXJuYWwoYWN0aW9uQnV0dG9uLmNvbW1hbmQsIHRoaXMuX2FjdGlvbkJ1dHRvbkRpc3Bvc2FibGVzKSxcblx0XHRcdFx0XHRzaG9ydFRpdGxlOiBhY3Rpb25CdXR0b24uY29tbWFuZC5zaG9ydFRpdGxlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNlY29uZGFyeUNvbW1hbmRzOiBhY3Rpb25CdXR0b24uc2Vjb25kYXJ5Q29tbWFuZHM/Lm1hcChjb21tYW5kR3JvdXAgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBjb21tYW5kR3JvdXAubWFwKGNvbW1hbmQgPT4gdGhpcy5fY29tbWFuZHMuY29udmVydGVyLnRvSW50ZXJuYWwoY29tbWFuZCwgdGhpcy5fYWN0aW9uQnV0dG9uRGlzcG9zYWJsZXMpKTtcblx0XHRcdFx0fSksXG5cdFx0XHRcdGVuYWJsZWQ6IGFjdGlvbkJ1dHRvbi5lbmFibGVkXG5cdFx0XHR9IHNhdGlzZmllcyBTQ01BY3Rpb25CdXR0b25EdG8gOiBudWxsO1xuXG5cdFx0dGhpcy4jcHJveHkuJHVwZGF0ZVNvdXJjZUNvbnRyb2wodGhpcy5oYW5kbGUsIHsgYWN0aW9uQnV0dG9uOiBhY3Rpb25CdXR0b25EdG8gfSlcblx0XHRcdC5maW5hbGx5KCgpID0+IG9sZEFjdGlvbkJ1dHRvbkRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cdH1cblxuXHQvLyBXZSBrbm93IHdoYXQgd2UncmUgZG9pbmcgaGVyZTpcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tcG90ZW50aWFsbHktdW5zYWZlLWRpc3Bvc2FibGVzXG5cdHByaXZhdGUgX3N0YXR1c0JhckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIF9zdGF0dXNCYXJDb21tYW5kczogdnNjb2RlLkNvbW1hbmRbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRnZXQgc3RhdHVzQmFyQ29tbWFuZHMoKTogdnNjb2RlLkNvbW1hbmRbXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXR1c0JhckNvbW1hbmRzO1xuXHR9XG5cblx0c2V0IHN0YXR1c0JhckNvbW1hbmRzKHN0YXR1c0JhckNvbW1hbmRzOiB2c2NvZGUuQ29tbWFuZFtdIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuX3N0YXR1c0JhckNvbW1hbmRzICYmIHN0YXR1c0JhckNvbW1hbmRzICYmIGNvbW1hbmRMaXN0RXF1YWxzKHRoaXMuX3N0YXR1c0JhckNvbW1hbmRzLCBzdGF0dXNCYXJDb21tYW5kcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJbiBvcmRlciB0byBwcmV2ZW50IGRpc3Bvc2luZyBzdGF0dXMgYmFyIGNvbW1hbmRzIHRoYXQgYXJlIHN0aWxsIHJlbmRlcmVkIGluIHRoZSBVSVxuXHRcdC8vIHVudGlsIHRoZSBuZXh0IFVJIHVwZGF0ZSwgd2UgZW5zdXJlIHRvIGRpc3Bvc2UgdGhlbSBhZnRlciB0aGUgdXBkYXRlIGhhcyBiZWVuIGNvbXBsZXRlZC5cblx0XHRjb25zdCBvbGRTdGF0dXNCYXJEaXNwb3NhYmxlcyA9IHRoaXMuX3N0YXR1c0JhckRpc3Bvc2FibGVzO1xuXHRcdHRoaXMuX3N0YXR1c0JhckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0dGhpcy5fc3RhdHVzQmFyQ29tbWFuZHMgPSBzdGF0dXNCYXJDb21tYW5kcztcblxuXHRcdGNvbnN0IGludGVybmFsID0gKHN0YXR1c0JhckNvbW1hbmRzIHx8IFtdKS5tYXAoYyA9PiB0aGlzLl9jb21tYW5kcy5jb252ZXJ0ZXIudG9JbnRlcm5hbChjLCB0aGlzLl9zdGF0dXNCYXJEaXNwb3NhYmxlcykpIGFzIElDb21tYW5kRHRvW107XG5cblx0XHR0aGlzLiNwcm94eS4kdXBkYXRlU291cmNlQ29udHJvbCh0aGlzLmhhbmRsZSwgeyBzdGF0dXNCYXJDb21tYW5kczogaW50ZXJuYWwgfSlcblx0XHRcdC5maW5hbGx5KCgpID0+IG9sZFN0YXR1c0JhckRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZWxlY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGdldCBzZWxlY3RlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VsZWN0ZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlbGVjdGlvbiA9IG5ldyBFbWl0dGVyPGJvb2xlYW4+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYXJ0aWZhY3RDb21tYW5kc0Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nIC8qIGFydGlmYWN0IGdyb3VwICovLCBEaXNwb3NhYmxlU3RvcmU+KCk7XG5cblx0cmVhZG9ubHkgaGFuZGxlOiBudW1iZXIgPSBFeHRIb3N0U291cmNlQ29udHJvbC5faGFuZGxlUG9vbCsrO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdF9leHRIb3N0RG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByb3h5OiBNYWluVGhyZWFkU0NNU2hhcGUsXG5cdFx0cHJpdmF0ZSBfY29tbWFuZHM6IEV4dEhvc3RDb21tYW5kcyxcblx0XHRwcml2YXRlIF9pZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgX2xhYmVsOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBfcm9vdFVyaT86IHZzY29kZS5VcmksXG5cdFx0X2ljb25QYXRoPzogdnNjb2RlLkljb25QYXRoLFxuXHRcdF9pc0hpZGRlbj86IGJvb2xlYW4sXG5cdFx0X3BhcmVudD86IEV4dEhvc3RTb3VyY2VDb250cm9sXG5cdCkge1xuXHRcdHRoaXMuI3Byb3h5ID0gcHJveHk7XG5cblx0XHRjb25zdCBpbnB1dEJveERvY3VtZW50VXJpID0gVVJJLmZyb20oe1xuXHRcdFx0c2NoZW1lOiBTY2hlbWFzLnZzY29kZVNvdXJjZUNvbnRyb2wsXG5cdFx0XHRwYXRoOiBgJHtfaWR9L3NjbSR7dGhpcy5oYW5kbGV9L2lucHV0YCxcblx0XHRcdHF1ZXJ5OiBfcm9vdFVyaSA/IGByb290VXJpPSR7ZW5jb2RlVVJJQ29tcG9uZW50KF9yb290VXJpLnRvU3RyaW5nKCkpfWAgOiB1bmRlZmluZWRcblx0XHR9KTtcblxuXHRcdHRoaXMuX2lucHV0Qm94ID0gbmV3IEV4dEhvc3RTQ01JbnB1dEJveChfZXh0ZW5zaW9uLCBfZXh0SG9zdERvY3VtZW50cywgdGhpcy4jcHJveHksIHRoaXMuaGFuZGxlLCBpbnB1dEJveERvY3VtZW50VXJpKTtcblx0XHR0aGlzLiNwcm94eS4kcmVnaXN0ZXJTb3VyY2VDb250cm9sKHRoaXMuaGFuZGxlLCBfcGFyZW50Py5oYW5kbGUsIF9pZCwgX2xhYmVsLCBfcm9vdFVyaSwgZ2V0SGlzdG9yeUl0ZW1JY29uRHRvKF9pY29uUGF0aCksIF9pc0hpZGRlbiwgaW5wdXRCb3hEb2N1bWVudFVyaSk7XG5cblx0XHR0aGlzLm9uRGlkRGlzcG9zZVBhcmVudCA9IF9wYXJlbnQgPyBfcGFyZW50Lm9uRGlkRGlzcG9zZSA6IEV2ZW50Lk5vbmU7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZWRSZXNvdXJjZUdyb3VwcyA9IG5ldyBNYXA8RXh0SG9zdFNvdXJjZUNvbnRyb2xSZXNvdXJjZUdyb3VwLCBJRGlzcG9zYWJsZT4oKTtcblx0cHJpdmF0ZSB1cGRhdGVkUmVzb3VyY2VHcm91cHMgPSBuZXcgU2V0PEV4dEhvc3RTb3VyY2VDb250cm9sUmVzb3VyY2VHcm91cD4oKTtcblxuXHRjcmVhdGVSZXNvdXJjZUdyb3VwKGlkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIG9wdGlvbnM/OiB7IG11bHRpRGlmZkVkaXRvckVuYWJsZVZpZXdDaGFuZ2VzPzogYm9vbGVhbiB9KTogRXh0SG9zdFNvdXJjZUNvbnRyb2xSZXNvdXJjZUdyb3VwIHtcblx0XHRjb25zdCBtdWx0aURpZmZFZGl0b3JFbmFibGVWaWV3Q2hhbmdlcyA9IGlzUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ3NjbU11bHRpRGlmZkVkaXRvcicpICYmIG9wdGlvbnM/Lm11bHRpRGlmZkVkaXRvckVuYWJsZVZpZXdDaGFuZ2VzID09PSB0cnVlO1xuXHRcdGNvbnN0IGdyb3VwID0gbmV3IEV4dEhvc3RTb3VyY2VDb250cm9sUmVzb3VyY2VHcm91cCh0aGlzLiNwcm94eSwgdGhpcy5fY29tbWFuZHMsIHRoaXMuaGFuZGxlLCBpZCwgbGFiZWwsIG11bHRpRGlmZkVkaXRvckVuYWJsZVZpZXdDaGFuZ2VzLCB0aGlzLl9leHRlbnNpb24pO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBFdmVudC5vbmNlKGdyb3VwLm9uRGlkRGlzcG9zZSkoKCkgPT4gdGhpcy5jcmVhdGVkUmVzb3VyY2VHcm91cHMuZGVsZXRlKGdyb3VwKSk7XG5cdFx0dGhpcy5jcmVhdGVkUmVzb3VyY2VHcm91cHMuc2V0KGdyb3VwLCBkaXNwb3NhYmxlKTtcblx0XHR0aGlzLmV2ZW50dWFsbHlBZGRSZXNvdXJjZUdyb3VwcygpO1xuXHRcdHJldHVybiBncm91cDtcblx0fVxuXG5cdEBkZWJvdW5jZSgxMDApXG5cdGV2ZW50dWFsbHlBZGRSZXNvdXJjZUdyb3VwcygpOiB2b2lkIHtcblx0XHRjb25zdCBncm91cHM6IFtudW1iZXIgLypoYW5kbGUqLywgc3RyaW5nIC8qaWQqLywgc3RyaW5nIC8qbGFiZWwqLywgU0NNR3JvdXBGZWF0dXJlcywgLyptdWx0aURpZmZFZGl0b3JFbmFibGVWaWV3Q2hhbmdlcyovIGJvb2xlYW5dW10gPSBbXTtcblx0XHRjb25zdCBzcGxpY2VzOiBTQ01SYXdSZXNvdXJjZVNwbGljZXNbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBbZ3JvdXAsIGRpc3Bvc2FibGVdIG9mIHRoaXMuY3JlYXRlZFJlc291cmNlR3JvdXBzKSB7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblxuXHRcdFx0Y29uc3QgdXBkYXRlTGlzdGVuZXIgPSBncm91cC5vbkRpZFVwZGF0ZVJlc291cmNlU3RhdGVzKCgpID0+IHtcblx0XHRcdFx0dGhpcy51cGRhdGVkUmVzb3VyY2VHcm91cHMuYWRkKGdyb3VwKTtcblx0XHRcdFx0dGhpcy5ldmVudHVhbGx5VXBkYXRlUmVzb3VyY2VTdGF0ZXMoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRFdmVudC5vbmNlKGdyb3VwLm9uRGlkRGlzcG9zZSkoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZWRSZXNvdXJjZUdyb3Vwcy5kZWxldGUoZ3JvdXApO1xuXHRcdFx0XHR1cGRhdGVMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX2dyb3Vwcy5kZWxldGUoZ3JvdXAuaGFuZGxlKTtcblx0XHRcdFx0dGhpcy4jcHJveHkuJHVucmVnaXN0ZXJHcm91cCh0aGlzLmhhbmRsZSwgZ3JvdXAuaGFuZGxlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRncm91cHMucHVzaChbZ3JvdXAuaGFuZGxlLCBncm91cC5pZCwgZ3JvdXAubGFiZWwsIGdyb3VwLmZlYXR1cmVzLCBncm91cC5tdWx0aURpZmZFZGl0b3JFbmFibGVWaWV3Q2hhbmdlc10pO1xuXG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IGdyb3VwLl90YWtlUmVzb3VyY2VTdGF0ZVNuYXBzaG90KCk7XG5cblx0XHRcdGlmIChzbmFwc2hvdC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHNwbGljZXMucHVzaChbZ3JvdXAuaGFuZGxlLCBzbmFwc2hvdF0pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9ncm91cHMuc2V0KGdyb3VwLmhhbmRsZSwgZ3JvdXApO1xuXHRcdH1cblxuXHRcdHRoaXMuI3Byb3h5LiRyZWdpc3Rlckdyb3Vwcyh0aGlzLmhhbmRsZSwgZ3JvdXBzLCBzcGxpY2VzKTtcblx0XHR0aGlzLmNyZWF0ZWRSZXNvdXJjZUdyb3Vwcy5jbGVhcigpO1xuXHR9XG5cblx0QGRlYm91bmNlKDEwMClcblx0ZXZlbnR1YWxseVVwZGF0ZVJlc291cmNlU3RhdGVzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNwbGljZXM6IFNDTVJhd1Jlc291cmNlU3BsaWNlc1tdID0gW107XG5cblx0XHR0aGlzLnVwZGF0ZWRSZXNvdXJjZUdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IHtcblx0XHRcdGNvbnN0IHNuYXBzaG90ID0gZ3JvdXAuX3Rha2VSZXNvdXJjZVN0YXRlU25hcHNob3QoKTtcblxuXHRcdFx0aWYgKHNuYXBzaG90Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHNwbGljZXMucHVzaChbZ3JvdXAuaGFuZGxlLCBzbmFwc2hvdF0pO1xuXHRcdH0pO1xuXG5cdFx0aWYgKHNwbGljZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy4jcHJveHkuJHNwbGljZVJlc291cmNlU3RhdGVzKHRoaXMuaGFuZGxlLCBzcGxpY2VzKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZWRSZXNvdXJjZUdyb3Vwcy5jbGVhcigpO1xuXHR9XG5cblx0Z2V0UmVzb3VyY2VHcm91cChoYW5kbGU6IEdyb3VwSGFuZGxlKTogRXh0SG9zdFNvdXJjZUNvbnRyb2xSZXNvdXJjZUdyb3VwIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZ3JvdXBzLmdldChoYW5kbGUpO1xuXHR9XG5cblx0c2V0U2VsZWN0aW9uU3RhdGUoc2VsZWN0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9zZWxlY3RlZCA9IHNlbGVjdGVkO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoc2VsZWN0ZWQpO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUFydGlmYWN0cyhncm91cDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFNDTUFydGlmYWN0RHRvW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb21tYW5kc0Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGFydGlmYWN0cyA9IGF3YWl0IHRoaXMuYXJ0aWZhY3RQcm92aWRlcj8ucHJvdmlkZUFydGlmYWN0cyhncm91cCwgdG9rZW4pO1xuXHRcdGNvbnN0IGFydGlmYWN0c0R0byA9IGFydGlmYWN0cz8ubWFwKGFydGlmYWN0ID0+ICh7XG5cdFx0XHQuLi5hcnRpZmFjdCxcblx0XHRcdGljb246IGdldEhpc3RvcnlJdGVtSWNvbkR0byhhcnRpZmFjdC5pY29uKSxcblx0XHRcdGNvbW1hbmQ6IGFydGlmYWN0LmNvbW1hbmQgPyB0aGlzLl9jb21tYW5kcy5jb252ZXJ0ZXIudG9JbnRlcm5hbChhcnRpZmFjdC5jb21tYW5kLCBjb21tYW5kc0Rpc3Bvc2FibGVzKSA6IHVuZGVmaW5lZFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2FydGlmYWN0Q29tbWFuZHNEaXNwb3NhYmxlcy5nZXQoZ3JvdXApPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fYXJ0aWZhY3RDb21tYW5kc0Rpc3Bvc2FibGVzLnNldChncm91cCwgY29tbWFuZHNEaXNwb3NhYmxlcyk7XG5cblx0XHRyZXR1cm4gYXJ0aWZhY3RzRHRvO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9hY2NlcHRJbnB1dERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9hY3Rpb25CdXR0b25EaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc3RhdHVzQmFyRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2hpc3RvcnlQcm92aWRlckRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2FydGlmYWN0UHJvdmlkZXJEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9hcnRpZmFjdENvbW1hbmRzRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5fZ3JvdXBzLmZvckVhY2goZ3JvdXAgPT4gZ3JvdXAuZGlzcG9zZSgpKTtcblx0XHR0aGlzLiNwcm94eS4kdW5yZWdpc3RlclNvdXJjZUNvbnRyb2wodGhpcy5oYW5kbGUpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkRGlzcG9zZS5maXJlKCk7XG5cdFx0dGhpcy5fb25EaWREaXNwb3NlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdFNDTSBpbXBsZW1lbnRzIEV4dEhvc3RTQ01TaGFwZSB7XG5cblx0cHJpdmF0ZSBfcHJveHk6IE1haW5UaHJlYWRTQ01TaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5OiBNYWluVGhyZWFkVGVsZW1ldHJ5U2hhcGU7XG5cdHByaXZhdGUgX3NvdXJjZUNvbnRyb2xzOiBNYXA8UHJvdmlkZXJIYW5kbGUsIEV4dEhvc3RTb3VyY2VDb250cm9sPiA9IG5ldyBNYXA8UHJvdmlkZXJIYW5kbGUsIEV4dEhvc3RTb3VyY2VDb250cm9sPigpO1xuXHRwcml2YXRlIF9zb3VyY2VDb250cm9sc0J5RXh0ZW5zaW9uOiBFeHRlbnNpb25JZGVudGlmaWVyTWFwPEV4dEhvc3RTb3VyY2VDb250cm9sW10+ID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8RXh0SG9zdFNvdXJjZUNvbnRyb2xbXT4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZVByb3ZpZGVyID0gbmV3IEVtaXR0ZXI8dnNjb2RlLlNvdXJjZUNvbnRyb2w+KCk7XG5cdGdldCBvbkRpZENoYW5nZUFjdGl2ZVByb3ZpZGVyKCk6IEV2ZW50PHZzY29kZS5Tb3VyY2VDb250cm9sPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZVByb3ZpZGVyLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSBfc2VsZWN0ZWRTb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bWFpbkNvbnRleHQ6IElNYWluQ29udGV4dCxcblx0XHRwcml2YXRlIF9jb21tYW5kczogRXh0SG9zdENvbW1hbmRzLFxuXHRcdHByaXZhdGUgX2V4dEhvc3REb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBtYWluQ29udGV4dC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkU0NNKTtcblx0XHR0aGlzLl90ZWxlbWV0cnkgPSBtYWluQ29udGV4dC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkVGVsZW1ldHJ5KTtcblxuXHRcdF9jb21tYW5kcy5yZWdpc3RlckFyZ3VtZW50UHJvY2Vzc29yKHtcblx0XHRcdHByb2Nlc3NBcmd1bWVudDogYXJnID0+IHtcblx0XHRcdFx0aWYgKGFyZyAmJiBhcmcuJG1pZCA9PT0gTWFyc2hhbGxlZElkLlNjbVJlc291cmNlKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc291cmNlQ29udHJvbCA9IHRoaXMuX3NvdXJjZUNvbnRyb2xzLmdldChhcmcuc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRcdFx0XHRpZiAoIXNvdXJjZUNvbnRyb2wpIHtcblx0XHRcdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgZ3JvdXAgPSBzb3VyY2VDb250cm9sLmdldFJlc291cmNlR3JvdXAoYXJnLmdyb3VwSGFuZGxlKTtcblxuXHRcdFx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGdyb3VwLmdldFJlc291cmNlU3RhdGUoYXJnLmhhbmRsZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYXJnICYmIGFyZy4kbWlkID09PSBNYXJzaGFsbGVkSWQuU2NtUmVzb3VyY2VHcm91cCkge1xuXHRcdFx0XHRcdGNvbnN0IHNvdXJjZUNvbnRyb2wgPSB0aGlzLl9zb3VyY2VDb250cm9scy5nZXQoYXJnLnNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXG5cdFx0XHRcdFx0aWYgKCFzb3VyY2VDb250cm9sKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYXJnO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBzb3VyY2VDb250cm9sLmdldFJlc291cmNlR3JvdXAoYXJnLmdyb3VwSGFuZGxlKTtcblx0XHRcdFx0fSBlbHNlIGlmIChhcmcgJiYgYXJnLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5TY21Qcm92aWRlcikge1xuXHRcdFx0XHRcdGNvbnN0IHNvdXJjZUNvbnRyb2wgPSB0aGlzLl9zb3VyY2VDb250cm9scy5nZXQoYXJnLmhhbmRsZSk7XG5cblx0XHRcdFx0XHRpZiAoIXNvdXJjZUNvbnRyb2wpIHtcblx0XHRcdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHNvdXJjZUNvbnRyb2w7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gYXJnO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Y3JlYXRlU291cmNlQ29udHJvbChleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgcm9vdFVyaTogdnNjb2RlLlVyaSB8IHVuZGVmaW5lZCwgaWNvblBhdGg6IHZzY29kZS5JY29uUGF0aCB8IHVuZGVmaW5lZCwgaXNIaWRkZW46IGJvb2xlYW4gfCB1bmRlZmluZWQsIHBhcmVudDogdnNjb2RlLlNvdXJjZUNvbnRyb2wgfCB1bmRlZmluZWQpOiB2c2NvZGUuU291cmNlQ29udHJvbCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdFeHRIb3N0U0NNI2NyZWF0ZVNvdXJjZUNvbnRyb2wnLCBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSwgaWQsIGxhYmVsLCByb290VXJpKTtcblxuXHRcdHR5cGUgVEV2ZW50ID0geyBleHRlbnNpb25JZDogc3RyaW5nIH07XG5cdFx0dHlwZSBUTWV0YSA9IHtcblx0XHRcdG93bmVyOiAnam9hb21vcmVubyc7XG5cdFx0XHRleHRlbnNpb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBJRCBvZiB0aGUgZXh0ZW5zaW9uIGNvbnRyaWJ1dGluZyB0byB0aGUgU291cmNlIENvbnRyb2wgQVBJLicgfTtcblx0XHRcdGNvbW1lbnQ6ICdUaGlzIGlzIHVzZWQgdG8ga25vdyB3aGF0IGV4dGVuc2lvbnMgY29udHJpYnV0ZSB0byB0aGUgU291cmNlIENvbnRyb2wgQVBJLic7XG5cdFx0fTtcblx0XHR0aGlzLl90ZWxlbWV0cnkuJHB1YmxpY0xvZzI8VEV2ZW50LCBUTWV0YT4oJ2FwaS9zY20vY3JlYXRlU291cmNlQ29udHJvbCcsIHtcblx0XHRcdGV4dGVuc2lvbklkOiBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHBhcmVudFNvdXJjZUNvbnRyb2wgPSBwYXJlbnQgPyBJdGVyYWJsZS5maW5kKHRoaXMuX3NvdXJjZUNvbnRyb2xzLnZhbHVlcygpLCBzID0+IHMgPT09IHBhcmVudCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc291cmNlQ29udHJvbCA9IG5ldyBFeHRIb3N0U291cmNlQ29udHJvbChleHRlbnNpb24sIHRoaXMuX2V4dEhvc3REb2N1bWVudHMsIHRoaXMuX3Byb3h5LCB0aGlzLl9jb21tYW5kcywgaWQsIGxhYmVsLCByb290VXJpLCBpY29uUGF0aCwgaXNIaWRkZW4sIHBhcmVudFNvdXJjZUNvbnRyb2wpO1xuXHRcdHRoaXMuX3NvdXJjZUNvbnRyb2xzLnNldChzb3VyY2VDb250cm9sLmhhbmRsZSwgc291cmNlQ29udHJvbCk7XG5cblx0XHRjb25zdCBzb3VyY2VDb250cm9scyA9IHRoaXMuX3NvdXJjZUNvbnRyb2xzQnlFeHRlbnNpb24uZ2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyKSB8fCBbXTtcblx0XHRzb3VyY2VDb250cm9scy5wdXNoKHNvdXJjZUNvbnRyb2wpO1xuXHRcdHRoaXMuX3NvdXJjZUNvbnRyb2xzQnlFeHRlbnNpb24uc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLCBzb3VyY2VDb250cm9scyk7XG5cblx0XHRFdmVudC5vbmNlKHNvdXJjZUNvbnRyb2wub25EaWREaXNwb3NlKSgoKSA9PiB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dEhvc3RTQ00jZGlzcG9zZVNvdXJjZUNvbnRyb2wnLCBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSwgaWQsIGxhYmVsLCByb290VXJpKTtcblxuXHRcdFx0dGhpcy5fc291cmNlQ29udHJvbHMuZGVsZXRlKHNvdXJjZUNvbnRyb2wuaGFuZGxlKTtcblxuXHRcdFx0Y29uc3Qgc291cmNlQ29udHJvbHMgPSB0aGlzLl9zb3VyY2VDb250cm9sc0J5RXh0ZW5zaW9uLmdldChleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHRpZiAoc291cmNlQ29udHJvbHMpIHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSBzb3VyY2VDb250cm9scy5pbmRleE9mKHNvdXJjZUNvbnRyb2wpO1xuXHRcdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0c291cmNlQ29udHJvbHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzb3VyY2VDb250cm9scy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9zb3VyY2VDb250cm9sc0J5RXh0ZW5zaW9uLmRlbGV0ZShleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiBzb3VyY2VDb250cm9sO1xuXHR9XG5cblx0Ly8gRGVwcmVjYXRlZFxuXHRnZXRMYXN0SW5wdXRCb3goZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBFeHRIb3N0U0NNSW5wdXRCb3ggfCB1bmRlZmluZWQge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0SG9zdFNDTSNnZXRMYXN0SW5wdXRCb3gnLCBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cblx0XHRjb25zdCBzb3VyY2VDb250cm9scyA9IHRoaXMuX3NvdXJjZUNvbnRyb2xzQnlFeHRlbnNpb24uZ2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRjb25zdCBzb3VyY2VDb250cm9sID0gc291cmNlQ29udHJvbHMgJiYgc291cmNlQ29udHJvbHNbc291cmNlQ29udHJvbHMubGVuZ3RoIC0gMV07XG5cdFx0cmV0dXJuIHNvdXJjZUNvbnRyb2wgJiYgc291cmNlQ29udHJvbC5pbnB1dEJveDtcblx0fVxuXG5cdCRwcm92aWRlT3JpZ2luYWxSZXNvdXJjZShzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIHVyaUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VXJpQ29tcG9uZW50cyB8IG51bGw+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucmV2aXZlKHVyaUNvbXBvbmVudHMpO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0SG9zdFNDTSMkcHJvdmlkZU9yaWdpbmFsUmVzb3VyY2UnLCBzb3VyY2VDb250cm9sSGFuZGxlLCB1cmkudG9TdHJpbmcoKSk7XG5cblx0XHRjb25zdCBzb3VyY2VDb250cm9sID0gdGhpcy5fc291cmNlQ29udHJvbHMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXG5cdFx0aWYgKCFzb3VyY2VDb250cm9sIHx8ICFzb3VyY2VDb250cm9sLnF1aWNrRGlmZlByb3ZpZGVyIHx8ICFzb3VyY2VDb250cm9sLnF1aWNrRGlmZlByb3ZpZGVyLnByb3ZpZGVPcmlnaW5hbFJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhc1Byb21pc2UoKCkgPT4gc291cmNlQ29udHJvbC5xdWlja0RpZmZQcm92aWRlciEucHJvdmlkZU9yaWdpbmFsUmVzb3VyY2UhKHVyaSwgdG9rZW4pKVxuXHRcdFx0LnRoZW48VXJpQ29tcG9uZW50cyB8IG51bGw+KHIgPT4gciB8fCBudWxsKTtcblx0fVxuXG5cdCRwcm92aWRlU2Vjb25kYXJ5T3JpZ2luYWxSZXNvdXJjZShzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIHVyaUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VXJpQ29tcG9uZW50cyB8IG51bGw+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucmV2aXZlKHVyaUNvbXBvbmVudHMpO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0SG9zdFNDTSMkcHJvdmlkZVNlY29uZGFyeU9yaWdpbmFsUmVzb3VyY2UnLCBzb3VyY2VDb250cm9sSGFuZGxlLCB1cmkudG9TdHJpbmcoKSk7XG5cblx0XHRjb25zdCBzb3VyY2VDb250cm9sID0gdGhpcy5fc291cmNlQ29udHJvbHMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXG5cdFx0aWYgKCFzb3VyY2VDb250cm9sIHx8ICFzb3VyY2VDb250cm9sLnNlY29uZGFyeVF1aWNrRGlmZlByb3ZpZGVyIHx8ICFzb3VyY2VDb250cm9sLnNlY29uZGFyeVF1aWNrRGlmZlByb3ZpZGVyLnByb3ZpZGVPcmlnaW5hbFJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhc1Byb21pc2UoKCkgPT4gc291cmNlQ29udHJvbC5zZWNvbmRhcnlRdWlja0RpZmZQcm92aWRlciEucHJvdmlkZU9yaWdpbmFsUmVzb3VyY2UhKHVyaSwgdG9rZW4pKVxuXHRcdFx0LnRoZW48VXJpQ29tcG9uZW50cyB8IG51bGw+KHIgPT4gciB8fCBudWxsKTtcblx0fVxuXG5cdCRvbklucHV0Qm94VmFsdWVDaGFuZ2Uoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdFeHRIb3N0U0NNIyRvbklucHV0Qm94VmFsdWVDaGFuZ2UnLCBzb3VyY2VDb250cm9sSGFuZGxlKTtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRyb2wgPSB0aGlzLl9zb3VyY2VDb250cm9scy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRpZiAoIXNvdXJjZUNvbnRyb2wpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRzb3VyY2VDb250cm9sLmlucHV0Qm94LiRvbklucHV0Qm94VmFsdWVDaGFuZ2UodmFsdWUpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdCRleGVjdXRlUmVzb3VyY2VDb21tYW5kKHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgZ3JvdXBIYW5kbGU6IG51bWJlciwgaGFuZGxlOiBudW1iZXIsIHByZXNlcnZlRm9jdXM6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dEhvc3RTQ00jJGV4ZWN1dGVSZXNvdXJjZUNvbW1hbmQnLCBzb3VyY2VDb250cm9sSGFuZGxlLCBncm91cEhhbmRsZSwgaGFuZGxlKTtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRyb2wgPSB0aGlzLl9zb3VyY2VDb250cm9scy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRpZiAoIXNvdXJjZUNvbnRyb2wpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRjb25zdCBncm91cCA9IHNvdXJjZUNvbnRyb2wuZ2V0UmVzb3VyY2VHcm91cChncm91cEhhbmRsZSk7XG5cblx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGdyb3VwLiRleGVjdXRlUmVzb3VyY2VDb21tYW5kKGhhbmRsZSwgcHJlc2VydmVGb2N1cyk7XG5cdH1cblxuXHQkdmFsaWRhdGVJbnB1dChzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIHZhbHVlOiBzdHJpbmcsIGN1cnNvclBvc2l0aW9uOiBudW1iZXIpOiBQcm9taXNlPFtzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcsIG51bWJlcl0gfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0V4dEhvc3RTQ00jJHZhbGlkYXRlSW5wdXQnLCBzb3VyY2VDb250cm9sSGFuZGxlKTtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRyb2wgPSB0aGlzLl9zb3VyY2VDb250cm9scy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRpZiAoIXNvdXJjZUNvbnRyb2wpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRpZiAoIXNvdXJjZUNvbnRyb2wuaW5wdXRCb3gudmFsaWRhdGVJbnB1dCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhc1Byb21pc2UoKCkgPT4gc291cmNlQ29udHJvbC5pbnB1dEJveC52YWxpZGF0ZUlucHV0ISh2YWx1ZSwgY3Vyc29yUG9zaXRpb24pKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBNYXJrZG93blN0cmluZy5mcm9tU3RyaWN0KHJlc3VsdC5tZXNzYWdlKTtcblx0XHRcdGlmICghbWVzc2FnZSkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmU8W3N0cmluZyB8IElNYXJrZG93blN0cmluZywgbnVtYmVyXT4oW21lc3NhZ2UsIHJlc3VsdC50eXBlXSk7XG5cdFx0fSk7XG5cdH1cblxuXHQkc2V0U2VsZWN0ZWRTb3VyY2VDb250cm9sKHNlbGVjdGVkU291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdFeHRIb3N0U0NNIyRzZXRTZWxlY3RlZFNvdXJjZUNvbnRyb2wnLCBzZWxlY3RlZFNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXHRcdGlmICh0aGlzLl9zZWxlY3RlZFNvdXJjZUNvbnRyb2xIYW5kbGUgPT09IHNlbGVjdGVkU291cmNlQ29udHJvbEhhbmRsZSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGlmIChzZWxlY3RlZFNvdXJjZUNvbnRyb2xIYW5kbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fc291cmNlQ29udHJvbHMuZ2V0KHNlbGVjdGVkU291cmNlQ29udHJvbEhhbmRsZSk/LnNldFNlbGVjdGlvblN0YXRlKHRydWUpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zZWxlY3RlZFNvdXJjZUNvbnRyb2xIYW5kbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fc291cmNlQ29udHJvbHMuZ2V0KHRoaXMuX3NlbGVjdGVkU291cmNlQ29udHJvbEhhbmRsZSk/LnNldFNlbGVjdGlvblN0YXRlKGZhbHNlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9zZWxlY3RlZFNvdXJjZUNvbnRyb2xIYW5kbGUgPSBzZWxlY3RlZFNvdXJjZUNvbnRyb2xIYW5kbGU7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0YXN5bmMgJHJlc29sdmVIaXN0b3J5SXRlbShzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIGhpc3RvcnlJdGVtSWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxTQ01IaXN0b3J5SXRlbUR0byB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBoaXN0b3J5UHJvdmlkZXIgPSB0aGlzLl9zb3VyY2VDb250cm9scy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/Lmhpc3RvcnlQcm92aWRlcjtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtID0gYXdhaXQgaGlzdG9yeVByb3ZpZGVyPy5yZXNvbHZlSGlzdG9yeUl0ZW0oaGlzdG9yeUl0ZW1JZCwgdG9rZW4pO1xuXG5cdFx0XHRyZXR1cm4gaGlzdG9yeUl0ZW0gPyB0b1NDTUhpc3RvcnlJdGVtRHRvKGhpc3RvcnlJdGVtKSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFeHRIb3N0U0NNIyRyZXNvbHZlSGlzdG9yeUl0ZW0nLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkcmVzb2x2ZUhpc3RvcnlJdGVtQ2hhdENvbnRleHQoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCBoaXN0b3J5SXRlbUlkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IHRoaXMuX3NvdXJjZUNvbnRyb2xzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKT8uaGlzdG9yeVByb3ZpZGVyO1xuXHRcdFx0Y29uc3QgY2hhdENvbnRleHQgPSBhd2FpdCBoaXN0b3J5UHJvdmlkZXI/LnJlc29sdmVIaXN0b3J5SXRlbUNoYXRDb250ZXh0KGhpc3RvcnlJdGVtSWQsIHRva2VuKTtcblxuXHRcdFx0cmV0dXJuIGNoYXRDb250ZXh0ID8/IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFeHRIb3N0U0NNIyRyZXNvbHZlSGlzdG9yeUl0ZW1DaGF0Q29udGV4dCcsIGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jICRyZXNvbHZlSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZUNoYXRDb250ZXh0KHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgaGlzdG9yeUl0ZW1JZDogc3RyaW5nLCBoaXN0b3J5SXRlbVBhcmVudElkOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gdGhpcy5fc291cmNlQ29udHJvbHMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy5oaXN0b3J5UHJvdmlkZXI7XG5cdFx0XHRjb25zdCBjaGF0Q29udGV4dCA9IGF3YWl0IGhpc3RvcnlQcm92aWRlcj8ucmVzb2x2ZUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VDaGF0Q29udGV4dD8uKGhpc3RvcnlJdGVtSWQsIGhpc3RvcnlJdGVtUGFyZW50SWQsIHBhdGgsIHRva2VuKTtcblxuXHRcdFx0cmV0dXJuIGNoYXRDb250ZXh0ID8/IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFeHRIb3N0U0NNIyRyZXNvbHZlSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZUNoYXRDb250ZXh0JywgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJHJlc29sdmVIaXN0b3J5SXRlbVJlZnNDb21tb25BbmNlc3Rvcihzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIGhpc3RvcnlJdGVtUmVmczogc3RyaW5nW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IHRoaXMuX3NvdXJjZUNvbnRyb2xzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKT8uaGlzdG9yeVByb3ZpZGVyO1xuXHRcdFx0Y29uc3QgYW5jZXN0b3IgPSBhd2FpdCBoaXN0b3J5UHJvdmlkZXI/LnJlc29sdmVIaXN0b3J5SXRlbVJlZnNDb21tb25BbmNlc3RvcihoaXN0b3J5SXRlbVJlZnMsIHRva2VuKTtcblxuXHRcdFx0cmV0dXJuIGFuY2VzdG9yID8/IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFeHRIb3N0U0NNIyRyZXNvbHZlSGlzdG9yeUl0ZW1SZWZzQ29tbW9uQW5jZXN0b3InLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUhpc3RvcnlJdGVtUmVmcyhzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIGhpc3RvcnlJdGVtUmVmczogc3RyaW5nW10gfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8U0NNSGlzdG9yeUl0ZW1SZWZEdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBoaXN0b3J5UHJvdmlkZXIgPSB0aGlzLl9zb3VyY2VDb250cm9scy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/Lmhpc3RvcnlQcm92aWRlcjtcblx0XHRcdGNvbnN0IHJlZnMgPSBhd2FpdCBoaXN0b3J5UHJvdmlkZXI/LnByb3ZpZGVIaXN0b3J5SXRlbVJlZnMoaGlzdG9yeUl0ZW1SZWZzLCB0b2tlbik7XG5cblx0XHRcdHJldHVybiByZWZzPy5tYXAocmVmID0+ICh7IC4uLnJlZiwgaWNvbjogZ2V0SGlzdG9yeUl0ZW1JY29uRHRvKHJlZi5pY29uKSB9KSkgPz8gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0V4dEhvc3RTQ00jJHByb3ZpZGVIaXN0b3J5SXRlbVJlZnMnLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUhpc3RvcnlJdGVtcyhzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIG9wdGlvbnM6IHZzY29kZS5Tb3VyY2VDb250cm9sSGlzdG9yeU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8U0NNSGlzdG9yeUl0ZW1EdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBoaXN0b3J5UHJvdmlkZXIgPSB0aGlzLl9zb3VyY2VDb250cm9scy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/Lmhpc3RvcnlQcm92aWRlcjtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtcyA9IGF3YWl0IGhpc3RvcnlQcm92aWRlcj8ucHJvdmlkZUhpc3RvcnlJdGVtcyhvcHRpb25zLCB0b2tlbik7XG5cblx0XHRcdHJldHVybiBoaXN0b3J5SXRlbXM/Lm1hcChpdGVtID0+IHRvU0NNSGlzdG9yeUl0ZW1EdG8oaXRlbSkpID8/IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFeHRIb3N0U0NNIyRwcm92aWRlSGlzdG9yeUl0ZW1zJywgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVIaXN0b3J5SXRlbUNoYW5nZXMoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCBoaXN0b3J5SXRlbUlkOiBzdHJpbmcsIGhpc3RvcnlJdGVtUGFyZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxTQ01IaXN0b3J5SXRlbUNoYW5nZUR0b1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IHRoaXMuX3NvdXJjZUNvbnRyb2xzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKT8uaGlzdG9yeVByb3ZpZGVyO1xuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IGF3YWl0IGhpc3RvcnlQcm92aWRlcj8ucHJvdmlkZUhpc3RvcnlJdGVtQ2hhbmdlcyhoaXN0b3J5SXRlbUlkLCBoaXN0b3J5SXRlbVBhcmVudElkLCB0b2tlbik7XG5cblx0XHRcdHJldHVybiBjaGFuZ2VzID8/IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFeHRIb3N0U0NNIyRwcm92aWRlSGlzdG9yeUl0ZW1DaGFuZ2VzJywgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVBcnRpZmFjdEdyb3Vwcyhzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8U0NNQXJ0aWZhY3RHcm91cER0b1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFydGlmYWN0UHJvdmlkZXIgPSB0aGlzLl9zb3VyY2VDb250cm9scy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/LmFydGlmYWN0UHJvdmlkZXI7XG5cdFx0XHRjb25zdCBncm91cHMgPSBhd2FpdCBhcnRpZmFjdFByb3ZpZGVyPy5wcm92aWRlQXJ0aWZhY3RHcm91cHModG9rZW4pO1xuXG5cdFx0XHRyZXR1cm4gZ3JvdXBzPy5tYXAoZ3JvdXAgPT4gKHtcblx0XHRcdFx0Li4uZ3JvdXAsXG5cdFx0XHRcdGljb246IGdldEhpc3RvcnlJdGVtSWNvbkR0byhncm91cC5pY29uKVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0V4dEhvc3RTQ00jJHByb3ZpZGVBcnRpZmFjdEdyb3VwcycsIGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jICRwcm92aWRlQXJ0aWZhY3RzKHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgZ3JvdXA6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxTQ01BcnRpZmFjdER0b1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNvdXJjZUNvbnRyb2wgPSB0aGlzLl9zb3VyY2VDb250cm9scy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk7XG5cdFx0XHRyZXR1cm4gc291cmNlQ29udHJvbD8ucHJvdmlkZUFydGlmYWN0cyhncm91cCwgdG9rZW4pO1xuXHRcdH1cblx0XHRjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0V4dEhvc3RTQ00jJHByb3ZpZGVBcnRpZmFjdHMnLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBS0EsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWUsaUJBQThCLHlCQUF5QjtBQUMvRSxTQUFTLGlCQUFpQjtBQUUxQixTQUFTLG1CQUF1VDtBQUNoVSxTQUFTLFlBQVksY0FBYztBQUNuQyxTQUFTLG9CQUFvQjtBQUc3QixTQUFTLG1CQUFtQjtBQUU1QixTQUFTLDhCQUFxRDtBQUM5RCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlCQUFpQjtBQUUxQixTQUFTLGdCQUFnQiwyQ0FBMkM7QUFDcEUsU0FBUyx5QkFBeUIsNEJBQTRCO0FBRTlELFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFNekIsU0FBUyxNQUFNLE9BQWlDO0FBQy9DLFNBQU8saUJBQWlCO0FBQ3pCO0FBRUEsU0FBUyxVQUFVLEdBQWUsR0FBd0I7QUFDekQsTUFBSSxFQUFFLFdBQVcsUUFBUSxRQUFR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LFNBQTZDLE9BQW9FO0FBQ3hLLFFBQUk7QUFDSCxZQUFNLGtCQUFrQixLQUFLLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQ3ZFLFlBQU0sZUFBZSxNQUFNLGlCQUFpQixvQkFBb0IsU0FBUyxLQUFLO0FBRTlFLGFBQU8sY0FBYyxJQUFJLFVBQVEsb0JBQW9CLElBQUksQ0FBQyxLQUFLO0FBQUEsSUFDaEUsU0FDTyxLQUFLO0FBQ1gsV0FBSyxXQUFXLE1BQU0sbUNBQW1DLEdBQUc7QUFDNUQsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLDJCQUEyQixxQkFBNkIsZUFBdUIscUJBQXlDLE9BQTBFO0FBQ3ZNLFFBQUk7QUFDSCxZQUFNLGtCQUFrQixLQUFLLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQ3ZFLFlBQU0sVUFBVSxNQUFNLGlCQUFpQiwwQkFBMEIsZUFBZSxxQkFBcUIsS0FBSztBQUUxRyxhQUFPLFdBQVc7QUFBQSxJQUNuQixTQUNPLEtBQUs7QUFDWCxXQUFLLFdBQVcsTUFBTSx5Q0FBeUMsR0FBRztBQUNsRSxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sdUJBQXVCLHFCQUE2QixPQUFzRTtBQUMvSCxRQUFJO0FBQ0gsWUFBTSxtQkFBbUIsS0FBSyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUN4RSxZQUFNLFNBQVMsTUFBTSxrQkFBa0Isc0JBQXNCLEtBQUs7QUFFbEUsYUFBTyxRQUFRLElBQUksWUFBVTtBQUFBLFFBQzVCLEdBQUc7QUFBQSxRQUNILE1BQU0sc0JBQXNCLE1BQU0sSUFBSTtBQUFBLE1BQ3ZDLEVBQUU7QUFBQSxJQUNILFNBQ08sS0FBSztBQUNYLFdBQUssV0FBVyxNQUFNLHFDQUFxQyxHQUFHO0FBQzlELGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxrQkFBa0IscUJBQTZCLE9BQWUsT0FBaUU7QUFDcEksUUFBSTtBQUNILFlBQU0sZ0JBQWdCLEtBQUssZ0JBQWdCLElBQUksbUJBQW1CO0FBQ2xFLGFBQU8sZUFBZSxpQkFBaUIsT0FBTyxLQUFLO0FBQUEsSUFDcEQsU0FDTyxLQUFLO0FBQ1gsV0FBSyxXQUFXLE1BQU0sZ0NBQWdDLEdBQUc7QUFDekQsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0Q7QUE1VWEsYUFBTjtBQUFBLEVBZ0JKO0FBQUEsR0FoQlU7IiwKICAibmFtZXMiOiBbIl9wcm94eSIsICJzb3VyY2VDb250cm9scyJdCn0K
