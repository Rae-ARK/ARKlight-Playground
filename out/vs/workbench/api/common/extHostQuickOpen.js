import { CancellationToken } from "../../../base/common/cancellation.js";
import { Emitter } from "../../../base/common/event.js";
import { dispose } from "../../../base/common/lifecycle.js";
import { MainContext } from "./extHost.protocol.js";
import { QuickInputButtons, QuickPickItemKind, InputBoxValidationSeverity } from "./extHostTypes.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { coalesce } from "../../../base/common/arrays.js";
import Severity from "../../../base/common/severity.js";
import { checkProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { IconPath, MarkdownString } from "./extHostTypeConverters.js";
function createExtHostQuickOpen(mainContext, workspace, commands) {
  const proxy = mainContext.getProxy(MainContext.MainThreadQuickOpen);
  class ExtHostQuickOpenImpl {
    constructor(workspace2, commands2) {
      this._sessions = /* @__PURE__ */ new Map();
      this._instances = 0;
      this._workspace = workspace2;
      this._commands = commands2;
    }
    showQuickPick(extension, itemsOrItemsPromise, options, token = CancellationToken.None) {
      this._onDidSelectItem = void 0;
      const itemsPromise = Promise.resolve(itemsOrItemsPromise);
      const instance = ++this._instances;
      const quickPickWidget = proxy.$show(instance, {
        title: options?.title,
        placeHolder: options?.placeHolder,
        prompt: options?.prompt,
        matchOnDescription: options?.matchOnDescription,
        matchOnDetail: options?.matchOnDetail,
        ignoreFocusLost: options?.ignoreFocusOut,
        canPickMany: options?.canPickMany
      }, token);
      const widgetClosedMarker = {};
      const widgetClosedPromise = quickPickWidget.then(() => widgetClosedMarker);
      return Promise.race([widgetClosedPromise, itemsPromise]).then((result) => {
        if (result === widgetClosedMarker) {
          return void 0;
        }
        return itemsPromise.then((items) => {
          const pickItems = [];
          for (let handle = 0; handle < items.length; handle++) {
            const item = items[handle];
            if (typeof item === "string") {
              pickItems.push({ label: item, handle });
            } else if (item.kind === QuickPickItemKind.Separator) {
              pickItems.push({ type: "separator", label: item.label });
            } else {
              if (item.tooltip) {
                checkProposedApiEnabled(extension, "quickPickItemTooltip");
              }
              pickItems.push({
                label: item.label,
                iconPathDto: IconPath.from(item.iconPath),
                description: item.description,
                detail: item.detail,
                picked: item.picked,
                alwaysShow: item.alwaysShow,
                tooltip: MarkdownString.fromStrict(item.tooltip),
                resourceUri: item.resourceUri,
                handle
              });
            }
          }
          if (options && typeof options.onDidSelectItem === "function") {
            this._onDidSelectItem = (handle) => {
              options.onDidSelectItem(items[handle]);
            };
          }
          proxy.$setItems(instance, pickItems);
          return quickPickWidget.then((handle) => {
            if (typeof handle === "number") {
              return items[handle];
            } else if (Array.isArray(handle)) {
              return handle.map((h) => items[h]);
            }
            return void 0;
          });
        });
      }).then(void 0, (err) => {
        if (isCancellationError(err)) {
          return void 0;
        }
        proxy.$setError(instance, err);
        return Promise.reject(err);
      });
    }
    $onItemSelected(handle) {
      this._onDidSelectItem?.(handle);
    }
    // ---- input
    showInput(options, token = CancellationToken.None) {
      this._validateInput = options?.validateInput;
      return proxy.$input(options, typeof this._validateInput === "function", token).then(void 0, (err) => {
        if (isCancellationError(err)) {
          return void 0;
        }
        return Promise.reject(err);
      });
    }
    async $validateInput(input) {
      if (!this._validateInput) {
        return;
      }
      const result = await this._validateInput(input);
      if (!result || typeof result === "string") {
        return result;
      }
      let severity;
      switch (result.severity) {
        case InputBoxValidationSeverity.Info:
          severity = Severity.Info;
          break;
        case InputBoxValidationSeverity.Warning:
          severity = Severity.Warning;
          break;
        case InputBoxValidationSeverity.Error:
          severity = Severity.Error;
          break;
        default:
          severity = result.message ? Severity.Error : Severity.Ignore;
          break;
      }
      return {
        content: result.message,
        severity
      };
    }
    // ---- workspace folder picker
    async showWorkspaceFolderPick(options, token = CancellationToken.None) {
      const selectedFolder = await this._commands.executeCommand("_workbench.pickWorkspaceFolder", [options]);
      if (!selectedFolder) {
        return void 0;
      }
      const workspaceFolders = await this._workspace.getWorkspaceFolders2();
      if (!workspaceFolders) {
        return void 0;
      }
      return workspaceFolders.find((folder) => folder.uri.toString() === selectedFolder.uri.toString());
    }
    // ---- QuickInput
    createQuickPick(extension) {
      const session = new ExtHostQuickPick(extension, () => this._sessions.delete(session._id));
      this._sessions.set(session._id, session);
      return session;
    }
    createInputBox(extension) {
      const session = new ExtHostInputBox(extension, () => this._sessions.delete(session._id));
      this._sessions.set(session._id, session);
      return session;
    }
    $onDidChangeValue(sessionId, value) {
      const session = this._sessions.get(sessionId);
      session?._fireDidChangeValue(value);
    }
    $onDidAccept(sessionId) {
      const session = this._sessions.get(sessionId);
      session?._fireDidAccept();
    }
    $onDidChangeActive(sessionId, handles) {
      const session = this._sessions.get(sessionId);
      if (session instanceof ExtHostQuickPick) {
        session._fireDidChangeActive(handles);
      }
    }
    $onDidChangeSelection(sessionId, handles) {
      const session = this._sessions.get(sessionId);
      if (session instanceof ExtHostQuickPick) {
        session._fireDidChangeSelection(handles);
      }
    }
    $onDidTriggerButton(sessionId, handle, checked) {
      const session = this._sessions.get(sessionId);
      session?._fireDidTriggerButton(handle, checked);
    }
    $onDidTriggerItemButton(sessionId, itemHandle, buttonHandle, checked) {
      const session = this._sessions.get(sessionId);
      if (session instanceof ExtHostQuickPick) {
        session._fireDidTriggerItemButton(itemHandle, buttonHandle, checked);
      }
    }
    $onDidHide(sessionId) {
      const session = this._sessions.get(sessionId);
      session?._fireDidHide();
    }
  }
  class ExtHostQuickInput {
    constructor(_extension, _onDidDispose) {
      this._extension = _extension;
      this._onDidDispose = _onDidDispose;
      this._id = ExtHostQuickPick._nextId++;
      this._visible = false;
      this._expectingHide = false;
      this._enabled = true;
      this._busy = false;
      this._ignoreFocusOut = true;
      this._value = "";
      this._valueSelection = void 0;
      this._buttons = [];
      this._handlesToButtons = /* @__PURE__ */ new Map();
      this._onDidAcceptEmitter = new Emitter();
      this._onDidChangeValueEmitter = new Emitter();
      this._onDidTriggerButtonEmitter = new Emitter();
      this._onDidHideEmitter = new Emitter();
      this._pendingUpdate = { id: this._id };
      this._disposed = false;
      this._disposables = [
        this._onDidTriggerButtonEmitter,
        this._onDidHideEmitter,
        this._onDidAcceptEmitter,
        this._onDidChangeValueEmitter
      ];
      this.onDidChangeValue = this._onDidChangeValueEmitter.event;
      this.onDidAccept = this._onDidAcceptEmitter.event;
      this.onDidTriggerButton = this._onDidTriggerButtonEmitter.event;
      this.onDidHide = this._onDidHideEmitter.event;
    }
    get title() {
      return this._title;
    }
    set title(title) {
      this._title = title;
      this.update({ title });
    }
    get step() {
      return this._steps;
    }
    set step(step) {
      this._steps = step;
      this.update({ step });
    }
    get totalSteps() {
      return this._totalSteps;
    }
    set totalSteps(totalSteps) {
      this._totalSteps = totalSteps;
      this.update({ totalSteps });
    }
    get enabled() {
      return this._enabled;
    }
    set enabled(enabled) {
      this._enabled = enabled;
      this.update({ enabled });
    }
    get busy() {
      return this._busy;
    }
    set busy(busy) {
      this._busy = busy;
      this.update({ busy });
    }
    get ignoreFocusOut() {
      return this._ignoreFocusOut;
    }
    set ignoreFocusOut(ignoreFocusOut) {
      this._ignoreFocusOut = ignoreFocusOut;
      this.update({ ignoreFocusOut });
    }
    get value() {
      return this._value;
    }
    set value(value) {
      this._value = value;
      this.update({ value });
    }
    get valueSelection() {
      return this._valueSelection;
    }
    set valueSelection(valueSelection) {
      this._valueSelection = valueSelection;
      this.update({ valueSelection });
    }
    get placeholder() {
      return this._placeholder;
    }
    set placeholder(placeholder) {
      this._placeholder = placeholder;
      this.update({ placeholder });
    }
    get buttons() {
      return this._buttons;
    }
    set buttons(buttons) {
      this._buttons = buttons.slice();
      this._handlesToButtons.clear();
      buttons.forEach((button, i) => {
        const handle = button === QuickInputButtons.Back ? -1 : i;
        this._handlesToButtons.set(handle, button);
      });
      this.update({
        buttons: buttons.map((button, i) => {
          return {
            iconPathDto: IconPath.from(button.iconPath),
            tooltip: button.tooltip,
            handle: button === QuickInputButtons.Back ? -1 : i,
            location: typeof button.location === "number" ? button.location : void 0,
            toggle: typeof button.toggle === "object" && typeof button.toggle.checked === "boolean" ? { checked: button.toggle.checked } : void 0
          };
        })
      });
    }
    show() {
      this._visible = true;
      this._expectingHide = true;
      this.update({ visible: true });
    }
    hide() {
      this._visible = false;
      this.update({ visible: false });
    }
    _fireDidAccept() {
      this._onDidAcceptEmitter.fire();
    }
    _fireDidChangeValue(value) {
      this._value = value;
      this._onDidChangeValueEmitter.fire(value);
    }
    _fireDidTriggerButton(handle, checked) {
      const button = this._handlesToButtons.get(handle);
      if (button) {
        if (checked !== void 0 && button.toggle) {
          button.toggle.checked = checked;
        }
        this._onDidTriggerButtonEmitter.fire(button);
      }
    }
    _fireDidHide() {
      if (this._expectingHide) {
        this._expectingHide = this._visible;
        this._onDidHideEmitter.fire();
      }
    }
    dispose() {
      if (this._disposed) {
        return;
      }
      this._disposed = true;
      this._fireDidHide();
      this._disposables = dispose(this._disposables);
      if (this._updateTimeout) {
        clearTimeout(this._updateTimeout);
        this._updateTimeout = void 0;
      }
      this._onDidDispose();
      proxy.$dispose(this._id);
    }
    update(properties) {
      if (this._disposed) {
        return;
      }
      for (const key of Object.keys(properties)) {
        const value = properties[key];
        this._pendingUpdate[key] = value === void 0 ? null : value;
      }
      if ("visible" in this._pendingUpdate) {
        if (this._updateTimeout) {
          clearTimeout(this._updateTimeout);
          this._updateTimeout = void 0;
        }
        this.dispatchUpdate();
      } else if (this._visible && !this._updateTimeout) {
        this._updateTimeout = setTimeout(() => {
          this._updateTimeout = void 0;
          this.dispatchUpdate();
        }, 0);
      }
    }
    dispatchUpdate() {
      proxy.$createOrUpdate(this._pendingUpdate);
      this._pendingUpdate = { id: this._id };
    }
  }
  ExtHostQuickInput._nextId = 1;
  class ExtHostQuickPick extends ExtHostQuickInput {
    constructor(extension, onDispose) {
      super(extension, onDispose);
      this._items = [];
      this._handlesToItems = /* @__PURE__ */ new Map();
      this._itemsToHandles = /* @__PURE__ */ new Map();
      this._canSelectMany = false;
      this._matchOnDescription = true;
      this._matchOnDetail = true;
      this._sortByLabel = true;
      this._keepScrollPosition = false;
      this._activeItems = [];
      this._onDidChangeActiveEmitter = new Emitter();
      this._selectedItems = [];
      this._onDidChangeSelectionEmitter = new Emitter();
      this._onDidTriggerItemButtonEmitter = new Emitter();
      this.onDidChangeActive = this._onDidChangeActiveEmitter.event;
      this.onDidChangeSelection = this._onDidChangeSelectionEmitter.event;
      this.onDidTriggerItemButton = this._onDidTriggerItemButtonEmitter.event;
      this._disposables.push(
        this._onDidChangeActiveEmitter,
        this._onDidChangeSelectionEmitter,
        this._onDidTriggerItemButtonEmitter
      );
      this.update({ type: "quickPick" });
    }
    get items() {
      return this._items;
    }
    set items(items) {
      this._items = items.slice();
      this._handlesToItems.clear();
      this._itemsToHandles.clear();
      items.forEach((item, i) => {
        this._handlesToItems.set(i, item);
        this._itemsToHandles.set(item, i);
      });
      const pickItems = [];
      for (let handle = 0; handle < items.length; handle++) {
        const item = items[handle];
        if (item.kind === QuickPickItemKind.Separator) {
          pickItems.push({ type: "separator", label: item.label });
        } else {
          if (item.tooltip) {
            checkProposedApiEnabled(this._extension, "quickPickItemTooltip");
          }
          pickItems.push({
            handle,
            label: item.label,
            iconPathDto: IconPath.from(item.iconPath),
            description: item.description,
            detail: item.detail,
            picked: item.picked,
            alwaysShow: item.alwaysShow,
            tooltip: MarkdownString.fromStrict(item.tooltip),
            resourceUri: item.resourceUri,
            buttons: item.buttons?.map((button, i) => {
              return {
                iconPathDto: IconPath.from(button.iconPath),
                tooltip: button.tooltip,
                handle: i,
                toggle: typeof button.toggle === "object" && typeof button.toggle.checked === "boolean" ? { checked: button.toggle.checked } : void 0
              };
            })
          });
        }
      }
      this.update({
        items: pickItems
      });
    }
    get canSelectMany() {
      return this._canSelectMany;
    }
    set canSelectMany(canSelectMany) {
      this._canSelectMany = canSelectMany;
      this.update({ canSelectMany });
    }
    get matchOnDescription() {
      return this._matchOnDescription;
    }
    set matchOnDescription(matchOnDescription) {
      this._matchOnDescription = matchOnDescription;
      this.update({ matchOnDescription });
    }
    get matchOnDetail() {
      return this._matchOnDetail;
    }
    set matchOnDetail(matchOnDetail) {
      this._matchOnDetail = matchOnDetail;
      this.update({ matchOnDetail });
    }
    get sortByLabel() {
      return this._sortByLabel;
    }
    set sortByLabel(sortByLabel) {
      this._sortByLabel = sortByLabel;
      this.update({ sortByLabel });
    }
    get keepScrollPosition() {
      return this._keepScrollPosition;
    }
    set keepScrollPosition(keepScrollPosition) {
      this._keepScrollPosition = keepScrollPosition;
      this.update({ keepScrollPosition });
    }
    get prompt() {
      return this._prompt;
    }
    set prompt(prompt) {
      this._prompt = prompt;
      this.update({ prompt });
    }
    get activeItems() {
      return this._activeItems;
    }
    set activeItems(activeItems) {
      this._activeItems = activeItems.filter((item) => this._itemsToHandles.has(item));
      this.update({ activeItems: this._activeItems.map((item) => this._itemsToHandles.get(item)) });
    }
    get selectedItems() {
      return this._selectedItems;
    }
    set selectedItems(selectedItems) {
      this._selectedItems = selectedItems.filter((item) => this._itemsToHandles.has(item));
      this.update({ selectedItems: this._selectedItems.map((item) => this._itemsToHandles.get(item)) });
    }
    _fireDidChangeActive(handles) {
      const items = coalesce(handles.map((handle) => this._handlesToItems.get(handle)));
      this._activeItems = items;
      this._onDidChangeActiveEmitter.fire(items);
    }
    _fireDidChangeSelection(handles) {
      const items = coalesce(handles.map((handle) => this._handlesToItems.get(handle)));
      this._selectedItems = items;
      this._onDidChangeSelectionEmitter.fire(items);
    }
    _fireDidTriggerItemButton(itemHandle, buttonHandle, checked) {
      const item = this._handlesToItems.get(itemHandle);
      if (!item || !item.buttons || !item.buttons.length) {
        return;
      }
      const button = item.buttons[buttonHandle];
      if (button) {
        if (checked !== void 0 && button.toggle) {
          button.toggle.checked = checked;
        }
        this._onDidTriggerItemButtonEmitter.fire({
          button,
          item
        });
      }
    }
  }
  class ExtHostInputBox extends ExtHostQuickInput {
    constructor(extension, onDispose) {
      super(extension, onDispose);
      this._password = false;
      this.update({ type: "inputBox" });
    }
    get password() {
      return this._password;
    }
    set password(password) {
      this._password = password;
      this.update({ password });
    }
    get prompt() {
      return this._prompt;
    }
    set prompt(prompt) {
      this._prompt = prompt;
      this.update({ prompt });
    }
    get validationMessage() {
      return this._validationMessage;
    }
    set validationMessage(validationMessage) {
      this._validationMessage = validationMessage;
      if (!validationMessage) {
        this.update({ validationMessage: void 0, severity: Severity.Ignore });
      } else if (typeof validationMessage === "string") {
        this.update({ validationMessage, severity: Severity.Error });
      } else {
        this.update({ validationMessage: validationMessage.message, severity: validationMessage.severity ?? Severity.Error });
      }
    }
  }
  return new ExtHostQuickOpenImpl(workspace, commands);
}
export {
  createExtHostQuickOpen
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RRdWlja09wZW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZGlzcG9zZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RXb3Jrc3BhY2VQcm92aWRlciB9IGZyb20gJy4vZXh0SG9zdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJbnB1dEJveCwgSW5wdXRCb3hPcHRpb25zLCBJbnB1dEJveFZhbGlkYXRpb25NZXNzYWdlLCBRdWlja0lucHV0LCBRdWlja0lucHV0QnV0dG9uLCBRdWlja1BpY2ssIFF1aWNrUGlja0l0ZW0sIFF1aWNrUGlja0l0ZW1CdXR0b25FdmVudCwgUXVpY2tQaWNrT3B0aW9ucywgV29ya3NwYWNlRm9sZGVyLCBXb3Jrc3BhY2VGb2xkZXJQaWNrT3B0aW9ucyB9IGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBFeHRIb3N0UXVpY2tPcGVuU2hhcGUsIElNYWluQ29udGV4dCwgTWFpbkNvbnRleHQsIFRyYW5zZmVyUXVpY2tJbnB1dCwgVHJhbnNmZXJRdWlja0lucHV0QnV0dG9uLCBUcmFuc2ZlclF1aWNrUGlja0l0ZW1PclNlcGFyYXRvciB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBRdWlja0lucHV0QnV0dG9ucywgUXVpY2tQaWNrSXRlbUtpbmQsIElucHV0Qm94VmFsaWRhdGlvblNldmVyaXR5IH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSWNvblBhdGgsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuXG5leHBvcnQgdHlwZSBJdGVtID0gc3RyaW5nIHwgUXVpY2tQaWNrSXRlbTtcblxuZXhwb3J0IGludGVyZmFjZSBFeHRIb3N0UXVpY2tPcGVuIHtcblx0c2hvd1F1aWNrUGljayhleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaXRlbXNPckl0ZW1zUHJvbWlzZTogUXVpY2tQaWNrSXRlbVtdIHwgUHJvbWlzZTxRdWlja1BpY2tJdGVtW10+LCBvcHRpb25zOiBRdWlja1BpY2tPcHRpb25zICYgeyBjYW5QaWNrTWFueTogdHJ1ZSB9LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxRdWlja1BpY2tJdGVtW10gfCB1bmRlZmluZWQ+O1xuXHRzaG93UXVpY2tQaWNrKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpdGVtc09ySXRlbXNQcm9taXNlOiBzdHJpbmdbXSB8IFByb21pc2U8c3RyaW5nW10+LCBvcHRpb25zPzogUXVpY2tQaWNrT3B0aW9ucywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0c2hvd1F1aWNrUGljayhleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaXRlbXNPckl0ZW1zUHJvbWlzZTogUXVpY2tQaWNrSXRlbVtdIHwgUHJvbWlzZTxRdWlja1BpY2tJdGVtW10+LCBvcHRpb25zPzogUXVpY2tQaWNrT3B0aW9ucywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZD47XG5cdHNob3dRdWlja1BpY2soZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGl0ZW1zT3JJdGVtc1Byb21pc2U6IEl0ZW1bXSB8IFByb21pc2U8SXRlbVtdPiwgb3B0aW9ucz86IFF1aWNrUGlja09wdGlvbnMsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEl0ZW0gfCBJdGVtW10gfCB1bmRlZmluZWQ+O1xuXG5cdHNob3dJbnB1dChvcHRpb25zPzogSW5wdXRCb3hPcHRpb25zLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXG5cdHNob3dXb3Jrc3BhY2VGb2xkZXJQaWNrKG9wdGlvbnM/OiBXb3Jrc3BhY2VGb2xkZXJQaWNrT3B0aW9ucywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8V29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkPjtcblxuXHRjcmVhdGVRdWlja1BpY2s8VCBleHRlbmRzIFF1aWNrUGlja0l0ZW0+KGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogUXVpY2tQaWNrPFQ+O1xuXG5cdGNyZWF0ZUlucHV0Qm94KGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogSW5wdXRCb3g7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVFeHRIb3N0UXVpY2tPcGVuKG1haW5Db250ZXh0OiBJTWFpbkNvbnRleHQsIHdvcmtzcGFjZTogSUV4dEhvc3RXb3Jrc3BhY2VQcm92aWRlciwgY29tbWFuZHM6IEV4dEhvc3RDb21tYW5kcyk6IEV4dEhvc3RRdWlja09wZW5TaGFwZSAmIEV4dEhvc3RRdWlja09wZW4ge1xuXHRjb25zdCBwcm94eSA9IG1haW5Db250ZXh0LmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRRdWlja09wZW4pO1xuXG5cdGNsYXNzIEV4dEhvc3RRdWlja09wZW5JbXBsIGltcGxlbWVudHMgRXh0SG9zdFF1aWNrT3BlblNoYXBlIHtcblxuXHRcdHByaXZhdGUgX3dvcmtzcGFjZTogSUV4dEhvc3RXb3Jrc3BhY2VQcm92aWRlcjtcblx0XHRwcml2YXRlIF9jb21tYW5kczogRXh0SG9zdENvbW1hbmRzO1xuXG5cdFx0cHJpdmF0ZSBfb25EaWRTZWxlY3RJdGVtPzogKGhhbmRsZTogbnVtYmVyKSA9PiB2b2lkO1xuXHRcdHByaXZhdGUgX3ZhbGlkYXRlSW5wdXQ/OiAoaW5wdXQ6IHN0cmluZykgPT4gc3RyaW5nIHwgSW5wdXRCb3hWYWxpZGF0aW9uTWVzc2FnZSB8IHVuZGVmaW5lZCB8IG51bGwgfCBUaGVuYWJsZTxzdHJpbmcgfCBJbnB1dEJveFZhbGlkYXRpb25NZXNzYWdlIHwgdW5kZWZpbmVkIHwgbnVsbD47XG5cblx0XHRwcml2YXRlIF9zZXNzaW9ucyA9IG5ldyBNYXA8bnVtYmVyLCBFeHRIb3N0UXVpY2tJbnB1dD4oKTtcblxuXHRcdHByaXZhdGUgX2luc3RhbmNlcyA9IDA7XG5cblx0XHRjb25zdHJ1Y3Rvcih3b3Jrc3BhY2U6IElFeHRIb3N0V29ya3NwYWNlUHJvdmlkZXIsIGNvbW1hbmRzOiBFeHRIb3N0Q29tbWFuZHMpIHtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZSA9IHdvcmtzcGFjZTtcblx0XHRcdHRoaXMuX2NvbW1hbmRzID0gY29tbWFuZHM7XG5cdFx0fVxuXG5cdFx0c2hvd1F1aWNrUGljayhleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaXRlbXNPckl0ZW1zUHJvbWlzZTogUXVpY2tQaWNrSXRlbVtdIHwgUHJvbWlzZTxRdWlja1BpY2tJdGVtW10+LCBvcHRpb25zOiBRdWlja1BpY2tPcHRpb25zICYgeyBjYW5QaWNrTWFueTogdHJ1ZSB9LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxRdWlja1BpY2tJdGVtW10gfCB1bmRlZmluZWQ+O1xuXHRcdHNob3dRdWlja1BpY2soZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGl0ZW1zT3JJdGVtc1Byb21pc2U6IHN0cmluZ1tdIHwgUHJvbWlzZTxzdHJpbmdbXT4sIG9wdGlvbnM/OiBRdWlja1BpY2tPcHRpb25zLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRcdHNob3dRdWlja1BpY2soZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGl0ZW1zT3JJdGVtc1Byb21pc2U6IFF1aWNrUGlja0l0ZW1bXSB8IFByb21pc2U8UXVpY2tQaWNrSXRlbVtdPiwgb3B0aW9ucz86IFF1aWNrUGlja09wdGlvbnMsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFF1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ+O1xuXHRcdHNob3dRdWlja1BpY2soZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGl0ZW1zT3JJdGVtc1Byb21pc2U6IEl0ZW1bXSB8IFByb21pc2U8SXRlbVtdPiwgb3B0aW9ucz86IFF1aWNrUGlja09wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPEl0ZW0gfCBJdGVtW10gfCB1bmRlZmluZWQ+IHtcblx0XHRcdC8vIGNsZWFyIHN0YXRlIGZyb20gbGFzdCBpbnZvY2F0aW9uXG5cdFx0XHR0aGlzLl9vbkRpZFNlbGVjdEl0ZW0gPSB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGl0ZW1zUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShpdGVtc09ySXRlbXNQcm9taXNlKTtcblxuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSArK3RoaXMuX2luc3RhbmNlcztcblxuXHRcdFx0Y29uc3QgcXVpY2tQaWNrV2lkZ2V0ID0gcHJveHkuJHNob3coaW5zdGFuY2UsIHtcblx0XHRcdFx0dGl0bGU6IG9wdGlvbnM/LnRpdGxlLFxuXHRcdFx0XHRwbGFjZUhvbGRlcjogb3B0aW9ucz8ucGxhY2VIb2xkZXIsXG5cdFx0XHRcdHByb21wdDogb3B0aW9ucz8ucHJvbXB0LFxuXHRcdFx0XHRtYXRjaE9uRGVzY3JpcHRpb246IG9wdGlvbnM/Lm1hdGNoT25EZXNjcmlwdGlvbixcblx0XHRcdFx0bWF0Y2hPbkRldGFpbDogb3B0aW9ucz8ubWF0Y2hPbkRldGFpbCxcblx0XHRcdFx0aWdub3JlRm9jdXNMb3N0OiBvcHRpb25zPy5pZ25vcmVGb2N1c091dCxcblx0XHRcdFx0Y2FuUGlja01hbnk6IG9wdGlvbnM/LmNhblBpY2tNYW55LFxuXHRcdFx0fSwgdG9rZW4pO1xuXG5cdFx0XHRjb25zdCB3aWRnZXRDbG9zZWRNYXJrZXIgPSB7fTtcblx0XHRcdGNvbnN0IHdpZGdldENsb3NlZFByb21pc2UgPSBxdWlja1BpY2tXaWRnZXQudGhlbigoKSA9PiB3aWRnZXRDbG9zZWRNYXJrZXIpO1xuXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yYWNlKFt3aWRnZXRDbG9zZWRQcm9taXNlLCBpdGVtc1Byb21pc2VdKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdGlmIChyZXN1bHQgPT09IHdpZGdldENsb3NlZE1hcmtlcikge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gaXRlbXNQcm9taXNlLnRoZW4oaXRlbXMgPT4ge1xuXG5cdFx0XHRcdFx0Y29uc3QgcGlja0l0ZW1zOiBUcmFuc2ZlclF1aWNrUGlja0l0ZW1PclNlcGFyYXRvcltdID0gW107XG5cdFx0XHRcdFx0Zm9yIChsZXQgaGFuZGxlID0gMDsgaGFuZGxlIDwgaXRlbXMubGVuZ3RoOyBoYW5kbGUrKykge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbSA9IGl0ZW1zW2hhbmRsZV07XG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIGl0ZW0gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdHBpY2tJdGVtcy5wdXNoKHsgbGFiZWw6IGl0ZW0sIGhhbmRsZSB9KTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaXRlbS5raW5kID09PSBRdWlja1BpY2tJdGVtS2luZC5TZXBhcmF0b3IpIHtcblx0XHRcdFx0XHRcdFx0cGlja0l0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGl0ZW0ubGFiZWwgfSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRpZiAoaXRlbS50b29sdGlwKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAncXVpY2tQaWNrSXRlbVRvb2x0aXAnKTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdHBpY2tJdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogaXRlbS5sYWJlbCxcblx0XHRcdFx0XHRcdFx0XHRpY29uUGF0aER0bzogSWNvblBhdGguZnJvbShpdGVtLmljb25QYXRoKSxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogaXRlbS5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdFx0XHRkZXRhaWw6IGl0ZW0uZGV0YWlsLFxuXHRcdFx0XHRcdFx0XHRcdHBpY2tlZDogaXRlbS5waWNrZWQsXG5cdFx0XHRcdFx0XHRcdFx0YWx3YXlzU2hvdzogaXRlbS5hbHdheXNTaG93LFxuXHRcdFx0XHRcdFx0XHRcdHRvb2x0aXA6IE1hcmtkb3duU3RyaW5nLmZyb21TdHJpY3QoaXRlbS50b29sdGlwKSxcblx0XHRcdFx0XHRcdFx0XHRyZXNvdXJjZVVyaTogaXRlbS5yZXNvdXJjZVVyaSxcblx0XHRcdFx0XHRcdFx0XHRoYW5kbGVcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gaGFuZGxlIHNlbGVjdGlvbiBjaGFuZ2VzXG5cdFx0XHRcdFx0aWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMub25EaWRTZWxlY3RJdGVtID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZFNlbGVjdEl0ZW0gPSAoaGFuZGxlKSA9PiB7XG5cdFx0XHRcdFx0XHRcdG9wdGlvbnMub25EaWRTZWxlY3RJdGVtIShpdGVtc1toYW5kbGVdKTtcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gc2hvdyBpdGVtc1xuXHRcdFx0XHRcdHByb3h5LiRzZXRJdGVtcyhpbnN0YW5jZSwgcGlja0l0ZW1zKTtcblxuXHRcdFx0XHRcdHJldHVybiBxdWlja1BpY2tXaWRnZXQudGhlbihoYW5kbGUgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBoYW5kbGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBpdGVtc1toYW5kbGVdO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGhhbmRsZSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGhhbmRsZS5tYXAoaCA9PiBpdGVtc1toXSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pLnRoZW4odW5kZWZpbmVkLCBlcnIgPT4ge1xuXHRcdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByb3h5LiRzZXRFcnJvcihpbnN0YW5jZSwgZXJyKTtcblxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdCRvbkl0ZW1TZWxlY3RlZChoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdFx0dGhpcy5fb25EaWRTZWxlY3RJdGVtPy4oaGFuZGxlKTtcblx0XHR9XG5cblx0XHQvLyAtLS0tIGlucHV0XG5cblx0XHRzaG93SW5wdXQob3B0aW9ucz86IElucHV0Qm94T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cblx0XHRcdC8vIGdsb2JhbCB2YWxpZGF0ZSBmbiB1c2VkIGluIGNhbGxiYWNrIGJlbG93XG5cdFx0XHR0aGlzLl92YWxpZGF0ZUlucHV0ID0gb3B0aW9ucz8udmFsaWRhdGVJbnB1dDtcblxuXHRcdFx0cmV0dXJuIHByb3h5LiRpbnB1dChvcHRpb25zLCB0eXBlb2YgdGhpcy5fdmFsaWRhdGVJbnB1dCA9PT0gJ2Z1bmN0aW9uJywgdG9rZW4pXG5cdFx0XHRcdC50aGVuKHVuZGVmaW5lZCwgZXJyID0+IHtcblx0XHRcdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xuXHRcdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyAkdmFsaWRhdGVJbnB1dChpbnB1dDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB7IGNvbnRlbnQ6IHN0cmluZzsgc2V2ZXJpdHk6IFNldmVyaXR5IH0gfCBudWxsIHwgdW5kZWZpbmVkPiB7XG5cdFx0XHRpZiAoIXRoaXMuX3ZhbGlkYXRlSW5wdXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl92YWxpZGF0ZUlucHV0KGlucHV0KTtcblx0XHRcdGlmICghcmVzdWx0IHx8IHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBzZXZlcml0eTogU2V2ZXJpdHk7XG5cdFx0XHRzd2l0Y2ggKHJlc3VsdC5zZXZlcml0eSkge1xuXHRcdFx0XHRjYXNlIElucHV0Qm94VmFsaWRhdGlvblNldmVyaXR5LkluZm86XG5cdFx0XHRcdFx0c2V2ZXJpdHkgPSBTZXZlcml0eS5JbmZvO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIElucHV0Qm94VmFsaWRhdGlvblNldmVyaXR5Lldhcm5pbmc6XG5cdFx0XHRcdFx0c2V2ZXJpdHkgPSBTZXZlcml0eS5XYXJuaW5nO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIElucHV0Qm94VmFsaWRhdGlvblNldmVyaXR5LkVycm9yOlxuXHRcdFx0XHRcdHNldmVyaXR5ID0gU2V2ZXJpdHkuRXJyb3I7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0c2V2ZXJpdHkgPSByZXN1bHQubWVzc2FnZSA/IFNldmVyaXR5LkVycm9yIDogU2V2ZXJpdHkuSWdub3JlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiByZXN1bHQubWVzc2FnZSxcblx0XHRcdFx0c2V2ZXJpdHlcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gLS0tLSB3b3Jrc3BhY2UgZm9sZGVyIHBpY2tlclxuXG5cdFx0YXN5bmMgc2hvd1dvcmtzcGFjZUZvbGRlclBpY2sob3B0aW9ucz86IFdvcmtzcGFjZUZvbGRlclBpY2tPcHRpb25zLCB0b2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPFdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRGb2xkZXIgPSBhd2FpdCB0aGlzLl9jb21tYW5kcy5leGVjdXRlQ29tbWFuZDxXb3Jrc3BhY2VGb2xkZXI+KCdfd29ya2JlbmNoLnBpY2tXb3Jrc3BhY2VGb2xkZXInLCBbb3B0aW9uc10pO1xuXHRcdFx0aWYgKCFzZWxlY3RlZEZvbGRlcikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IGF3YWl0IHRoaXMuX3dvcmtzcGFjZS5nZXRXb3Jrc3BhY2VGb2xkZXJzMigpO1xuXHRcdFx0aWYgKCF3b3Jrc3BhY2VGb2xkZXJzKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gd29ya3NwYWNlRm9sZGVycy5maW5kKGZvbGRlciA9PiBmb2xkZXIudXJpLnRvU3RyaW5nKCkgPT09IHNlbGVjdGVkRm9sZGVyLnVyaS50b1N0cmluZygpKTtcblx0XHR9XG5cblx0XHQvLyAtLS0tIFF1aWNrSW5wdXRcblxuXHRcdGNyZWF0ZVF1aWNrUGljazxUIGV4dGVuZHMgUXVpY2tQaWNrSXRlbT4oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBRdWlja1BpY2s8VD4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbjogRXh0SG9zdFF1aWNrUGljazxUPiA9IG5ldyBFeHRIb3N0UXVpY2tQaWNrKGV4dGVuc2lvbiwgKCkgPT4gdGhpcy5fc2Vzc2lvbnMuZGVsZXRlKHNlc3Npb24uX2lkKSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9ucy5zZXQoc2Vzc2lvbi5faWQsIHNlc3Npb24pO1xuXHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0fVxuXG5cdFx0Y3JlYXRlSW5wdXRCb3goZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBJbnB1dEJveCB7XG5cdFx0XHRjb25zdCBzZXNzaW9uOiBFeHRIb3N0SW5wdXRCb3ggPSBuZXcgRXh0SG9zdElucHV0Qm94KGV4dGVuc2lvbiwgKCkgPT4gdGhpcy5fc2Vzc2lvbnMuZGVsZXRlKHNlc3Npb24uX2lkKSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9ucy5zZXQoc2Vzc2lvbi5faWQsIHNlc3Npb24pO1xuXHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0fVxuXG5cdFx0JG9uRGlkQ2hhbmdlVmFsdWUoc2Vzc2lvbklkOiBudW1iZXIsIHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRcdHNlc3Npb24/Ll9maXJlRGlkQ2hhbmdlVmFsdWUodmFsdWUpO1xuXHRcdH1cblxuXHRcdCRvbkRpZEFjY2VwdChzZXNzaW9uSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdFx0c2Vzc2lvbj8uX2ZpcmVEaWRBY2NlcHQoKTtcblx0XHR9XG5cblx0XHQkb25EaWRDaGFuZ2VBY3RpdmUoc2Vzc2lvbklkOiBudW1iZXIsIGhhbmRsZXM6IG51bWJlcltdKTogdm9pZCB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0XHRpZiAoc2Vzc2lvbiBpbnN0YW5jZW9mIEV4dEhvc3RRdWlja1BpY2spIHtcblx0XHRcdFx0c2Vzc2lvbi5fZmlyZURpZENoYW5nZUFjdGl2ZShoYW5kbGVzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQkb25EaWRDaGFuZ2VTZWxlY3Rpb24oc2Vzc2lvbklkOiBudW1iZXIsIGhhbmRsZXM6IG51bWJlcltdKTogdm9pZCB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0XHRpZiAoc2Vzc2lvbiBpbnN0YW5jZW9mIEV4dEhvc3RRdWlja1BpY2spIHtcblx0XHRcdFx0c2Vzc2lvbi5fZmlyZURpZENoYW5nZVNlbGVjdGlvbihoYW5kbGVzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQkb25EaWRUcmlnZ2VyQnV0dG9uKHNlc3Npb25JZDogbnVtYmVyLCBoYW5kbGU6IG51bWJlciwgY2hlY2tlZD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRcdHNlc3Npb24/Ll9maXJlRGlkVHJpZ2dlckJ1dHRvbihoYW5kbGUsIGNoZWNrZWQpO1xuXHRcdH1cblxuXHRcdCRvbkRpZFRyaWdnZXJJdGVtQnV0dG9uKHNlc3Npb25JZDogbnVtYmVyLCBpdGVtSGFuZGxlOiBudW1iZXIsIGJ1dHRvbkhhbmRsZTogbnVtYmVyLCBjaGVja2VkPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdFx0aWYgKHNlc3Npb24gaW5zdGFuY2VvZiBFeHRIb3N0UXVpY2tQaWNrKSB7XG5cdFx0XHRcdHNlc3Npb24uX2ZpcmVEaWRUcmlnZ2VySXRlbUJ1dHRvbihpdGVtSGFuZGxlLCBidXR0b25IYW5kbGUsIGNoZWNrZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdCRvbkRpZEhpZGUoc2Vzc2lvbklkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRcdHNlc3Npb24/Ll9maXJlRGlkSGlkZSgpO1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIEV4dEhvc3RRdWlja0lucHV0IGltcGxlbWVudHMgUXVpY2tJbnB1dCB7XG5cblx0XHRwcml2YXRlIHN0YXRpYyBfbmV4dElkID0gMTtcblx0XHRfaWQgPSBFeHRIb3N0UXVpY2tQaWNrLl9uZXh0SWQrKztcblxuXHRcdHByaXZhdGUgX3RpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0cHJpdmF0ZSBfc3RlcHM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRwcml2YXRlIF90b3RhbFN0ZXBzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0cHJpdmF0ZSBfdmlzaWJsZSA9IGZhbHNlO1xuXHRcdHByaXZhdGUgX2V4cGVjdGluZ0hpZGUgPSBmYWxzZTtcblx0XHRwcml2YXRlIF9lbmFibGVkID0gdHJ1ZTtcblx0XHRwcml2YXRlIF9idXN5ID0gZmFsc2U7XG5cdFx0cHJpdmF0ZSBfaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdHByaXZhdGUgX3ZhbHVlID0gJyc7XG5cdFx0cHJpdmF0ZSBfdmFsdWVTZWxlY3Rpb246IHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0cHJpdmF0ZSBfcGxhY2Vob2xkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRwcml2YXRlIF9idXR0b25zOiBRdWlja0lucHV0QnV0dG9uW10gPSBbXTtcblx0XHRwcml2YXRlIF9oYW5kbGVzVG9CdXR0b25zID0gbmV3IE1hcDxudW1iZXIsIFF1aWNrSW5wdXRCdXR0b24+KCk7XG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBY2NlcHRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZhbHVlRW1pdHRlciA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRyaWdnZXJCdXR0b25FbWl0dGVyID0gbmV3IEVtaXR0ZXI8UXVpY2tJbnB1dEJ1dHRvbj4oKTtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEhpZGVFbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRwcml2YXRlIF91cGRhdGVUaW1lb3V0OiBUaW1lb3V0IHwgdW5kZWZpbmVkO1xuXHRcdHByaXZhdGUgX3BlbmRpbmdVcGRhdGU6IFRyYW5zZmVyUXVpY2tJbnB1dCA9IHsgaWQ6IHRoaXMuX2lkIH07XG5cblx0XHRwcml2YXRlIF9kaXNwb3NlZCA9IGZhbHNlO1xuXHRcdHByb3RlY3RlZCBfZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXG5cdFx0XHR0aGlzLl9vbkRpZFRyaWdnZXJCdXR0b25FbWl0dGVyLFxuXHRcdFx0dGhpcy5fb25EaWRIaWRlRW1pdHRlcixcblx0XHRcdHRoaXMuX29uRGlkQWNjZXB0RW1pdHRlcixcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmFsdWVFbWl0dGVyXG5cdFx0XTtcblxuXHRcdGNvbnN0cnVjdG9yKHByb3RlY3RlZCBfZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHByaXZhdGUgX29uRGlkRGlzcG9zZTogKCkgPT4gdm9pZCkge1xuXHRcdH1cblxuXHRcdGdldCB0aXRsZSgpIHtcblx0XHRcdHJldHVybiB0aGlzLl90aXRsZTtcblx0XHR9XG5cblx0XHRzZXQgdGl0bGUodGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fdGl0bGUgPSB0aXRsZTtcblx0XHRcdHRoaXMudXBkYXRlKHsgdGl0bGUgfSk7XG5cdFx0fVxuXG5cdFx0Z2V0IHN0ZXAoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc3RlcHM7XG5cdFx0fVxuXG5cdFx0c2V0IHN0ZXAoc3RlcDogbnVtYmVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9zdGVwcyA9IHN0ZXA7XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IHN0ZXAgfSk7XG5cdFx0fVxuXG5cdFx0Z2V0IHRvdGFsU3RlcHMoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG90YWxTdGVwcztcblx0XHR9XG5cblx0XHRzZXQgdG90YWxTdGVwcyh0b3RhbFN0ZXBzOiBudW1iZXIgfCB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3RvdGFsU3RlcHMgPSB0b3RhbFN0ZXBzO1xuXHRcdFx0dGhpcy51cGRhdGUoeyB0b3RhbFN0ZXBzIH0pO1xuXHRcdH1cblxuXHRcdGdldCBlbmFibGVkKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2VuYWJsZWQ7XG5cdFx0fVxuXG5cdFx0c2V0IGVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbikge1xuXHRcdFx0dGhpcy5fZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IGVuYWJsZWQgfSk7XG5cdFx0fVxuXG5cdFx0Z2V0IGJ1c3koKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYnVzeTtcblx0XHR9XG5cblx0XHRzZXQgYnVzeShidXN5OiBib29sZWFuKSB7XG5cdFx0XHR0aGlzLl9idXN5ID0gYnVzeTtcblx0XHRcdHRoaXMudXBkYXRlKHsgYnVzeSB9KTtcblx0XHR9XG5cblx0XHRnZXQgaWdub3JlRm9jdXNPdXQoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faWdub3JlRm9jdXNPdXQ7XG5cdFx0fVxuXG5cdFx0c2V0IGlnbm9yZUZvY3VzT3V0KGlnbm9yZUZvY3VzT3V0OiBib29sZWFuKSB7XG5cdFx0XHR0aGlzLl9pZ25vcmVGb2N1c091dCA9IGlnbm9yZUZvY3VzT3V0O1xuXHRcdFx0dGhpcy51cGRhdGUoeyBpZ25vcmVGb2N1c091dCB9KTtcblx0XHR9XG5cblx0XHRnZXQgdmFsdWUoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdmFsdWU7XG5cdFx0fVxuXG5cdFx0c2V0IHZhbHVlKHZhbHVlOiBzdHJpbmcpIHtcblx0XHRcdHRoaXMuX3ZhbHVlID0gdmFsdWU7XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IHZhbHVlIH0pO1xuXHRcdH1cblxuXHRcdGdldCB2YWx1ZVNlbGVjdGlvbigpIHtcblx0XHRcdHJldHVybiB0aGlzLl92YWx1ZVNlbGVjdGlvbjtcblx0XHR9XG5cblx0XHRzZXQgdmFsdWVTZWxlY3Rpb24odmFsdWVTZWxlY3Rpb246IHJlYWRvbmx5IFtudW1iZXIsIG51bWJlcl0gfCB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3ZhbHVlU2VsZWN0aW9uID0gdmFsdWVTZWxlY3Rpb247XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IHZhbHVlU2VsZWN0aW9uIH0pO1xuXHRcdH1cblxuXHRcdGdldCBwbGFjZWhvbGRlcigpIHtcblx0XHRcdHJldHVybiB0aGlzLl9wbGFjZWhvbGRlcjtcblx0XHR9XG5cblx0XHRzZXQgcGxhY2Vob2xkZXIocGxhY2Vob2xkZXI6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fcGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlcjtcblx0XHRcdHRoaXMudXBkYXRlKHsgcGxhY2Vob2xkZXIgfSk7XG5cdFx0fVxuXG5cdFx0b25EaWRDaGFuZ2VWYWx1ZSA9IHRoaXMuX29uRGlkQ2hhbmdlVmFsdWVFbWl0dGVyLmV2ZW50O1xuXG5cdFx0b25EaWRBY2NlcHQgPSB0aGlzLl9vbkRpZEFjY2VwdEVtaXR0ZXIuZXZlbnQ7XG5cblx0XHRnZXQgYnV0dG9ucygpIHtcblx0XHRcdHJldHVybiB0aGlzLl9idXR0b25zO1xuXHRcdH1cblxuXHRcdHNldCBidXR0b25zKGJ1dHRvbnM6IFF1aWNrSW5wdXRCdXR0b25bXSkge1xuXHRcdFx0dGhpcy5fYnV0dG9ucyA9IGJ1dHRvbnMuc2xpY2UoKTtcblx0XHRcdHRoaXMuX2hhbmRsZXNUb0J1dHRvbnMuY2xlYXIoKTtcblx0XHRcdGJ1dHRvbnMuZm9yRWFjaCgoYnV0dG9uLCBpKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZSA9IGJ1dHRvbiA9PT0gUXVpY2tJbnB1dEJ1dHRvbnMuQmFjayA/IC0xIDogaTtcblx0XHRcdFx0dGhpcy5faGFuZGxlc1RvQnV0dG9ucy5zZXQoaGFuZGxlLCBidXR0b24pO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLnVwZGF0ZSh7XG5cdFx0XHRcdGJ1dHRvbnM6IGJ1dHRvbnMubWFwPFRyYW5zZmVyUXVpY2tJbnB1dEJ1dHRvbj4oKGJ1dHRvbiwgaSkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRpY29uUGF0aER0bzogSWNvblBhdGguZnJvbShidXR0b24uaWNvblBhdGgpLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogYnV0dG9uLnRvb2x0aXAsXG5cdFx0XHRcdFx0XHRoYW5kbGU6IGJ1dHRvbiA9PT0gUXVpY2tJbnB1dEJ1dHRvbnMuQmFjayA/IC0xIDogaSxcblx0XHRcdFx0XHRcdGxvY2F0aW9uOiB0eXBlb2YgYnV0dG9uLmxvY2F0aW9uID09PSAnbnVtYmVyJyA/IGJ1dHRvbi5sb2NhdGlvbiA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHRvZ2dsZTogdHlwZW9mIGJ1dHRvbi50b2dnbGUgPT09ICdvYmplY3QnICYmIHR5cGVvZiBidXR0b24udG9nZ2xlLmNoZWNrZWQgPT09ICdib29sZWFuJyA/IHsgY2hlY2tlZDogYnV0dG9uLnRvZ2dsZS5jaGVja2VkIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdG9uRGlkVHJpZ2dlckJ1dHRvbiA9IHRoaXMuX29uRGlkVHJpZ2dlckJ1dHRvbkVtaXR0ZXIuZXZlbnQ7XG5cblx0XHRzaG93KCk6IHZvaWQge1xuXHRcdFx0dGhpcy5fdmlzaWJsZSA9IHRydWU7XG5cdFx0XHR0aGlzLl9leHBlY3RpbmdIaWRlID0gdHJ1ZTtcblx0XHRcdHRoaXMudXBkYXRlKHsgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHRoaWRlKCk6IHZvaWQge1xuXHRcdFx0dGhpcy5fdmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy51cGRhdGUoeyB2aXNpYmxlOiBmYWxzZSB9KTtcblx0XHR9XG5cblx0XHRvbkRpZEhpZGUgPSB0aGlzLl9vbkRpZEhpZGVFbWl0dGVyLmV2ZW50O1xuXG5cdFx0X2ZpcmVEaWRBY2NlcHQoKSB7XG5cdFx0XHR0aGlzLl9vbkRpZEFjY2VwdEVtaXR0ZXIuZmlyZSgpO1xuXHRcdH1cblxuXHRcdF9maXJlRGlkQ2hhbmdlVmFsdWUodmFsdWU6IHN0cmluZykge1xuXHRcdFx0dGhpcy5fdmFsdWUgPSB2YWx1ZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmFsdWVFbWl0dGVyLmZpcmUodmFsdWUpO1xuXHRcdH1cblxuXHRcdF9maXJlRGlkVHJpZ2dlckJ1dHRvbihoYW5kbGU6IG51bWJlciwgY2hlY2tlZD86IGJvb2xlYW4pIHtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuX2hhbmRsZXNUb0J1dHRvbnMuZ2V0KGhhbmRsZSk7XG5cdFx0XHRpZiAoYnV0dG9uKSB7XG5cdFx0XHRcdGlmIChjaGVja2VkICE9PSB1bmRlZmluZWQgJiYgYnV0dG9uLnRvZ2dsZSkge1xuXHRcdFx0XHRcdGJ1dHRvbi50b2dnbGUuY2hlY2tlZCA9IGNoZWNrZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fb25EaWRUcmlnZ2VyQnV0dG9uRW1pdHRlci5maXJlKGJ1dHRvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0X2ZpcmVEaWRIaWRlKCkge1xuXHRcdFx0aWYgKHRoaXMuX2V4cGVjdGluZ0hpZGUpIHtcblx0XHRcdFx0Ly8gaWYgdGhpcy5fdmlzaWJsZSBpcyB0cnVlLCBpdCBtZWFucyB0aGF0IC5zaG93KCkgd2FzIGNhbGxlZCBiZXR3ZWVuXG5cdFx0XHRcdC8vIC5oaWRlKCkgYW5kIC5vbkRpZEhpZGUuIFRvIGVuc3VyZSB0aGUgY29ycmVjdCBudW1iZXIgb2Ygb25EaWRIaWRlIGV2ZW50c1xuXHRcdFx0XHQvLyBhcmUgZW1pdHRlZCwgd2Ugc2V0IHRoaXMuX2V4cGVjdGluZ0hpZGUgdG8gdGhpcyB2YWx1ZSBzbyB0aGF0XG5cdFx0XHRcdC8vIHRoZSBuZXh0IHRpbWUgLmhpZGUoKSBpcyBjYWxsZWQsIHdlIGNhbiBlbWl0IHRoZSBldmVudCBhZ2Fpbi5cblx0XHRcdFx0Ly8gRXhhbXBsZTpcblx0XHRcdFx0Ly8gLnNob3coKSAtPiAuaGlkZSgpIC0+IC5zaG93KCkgLT4gLmhpZGUoKSBzaG91bGQgZW1pdCAyIG9uRGlkSGlkZSBldmVudHMuXG5cdFx0XHRcdC8vIC5zaG93KCkgLT4gLmhpZGUoKSAtPiAuaGlkZSgpIHNob3VsZCBlbWl0IDEgb25EaWRIaWRlIGV2ZW50LlxuXHRcdFx0XHQvLyBGaXhlcyAjMTM1NzQ3XG5cdFx0XHRcdHRoaXMuX2V4cGVjdGluZ0hpZGUgPSB0aGlzLl92aXNpYmxlO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEhpZGVFbWl0dGVyLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2ZpcmVEaWRIaWRlKCk7XG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlcyA9IGRpc3Bvc2UodGhpcy5fZGlzcG9zYWJsZXMpO1xuXHRcdFx0aWYgKHRoaXMuX3VwZGF0ZVRpbWVvdXQpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3VwZGF0ZVRpbWVvdXQpO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWREaXNwb3NlKCk7XG5cdFx0XHRwcm94eS4kZGlzcG9zZSh0aGlzLl9pZCk7XG5cdFx0fVxuXG5cdFx0cHJvdGVjdGVkIHVwZGF0ZShwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHZvaWQge1xuXHRcdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHByb3BlcnRpZXMpKSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gcHJvcGVydGllc1trZXldO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nVXBkYXRlW2tleV0gPSB2YWx1ZSA9PT0gdW5kZWZpbmVkID8gbnVsbCA6IHZhbHVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoJ3Zpc2libGUnIGluIHRoaXMuX3BlbmRpbmdVcGRhdGUpIHtcblx0XHRcdFx0aWYgKHRoaXMuX3VwZGF0ZVRpbWVvdXQpIHtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fdXBkYXRlVGltZW91dCk7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmRpc3BhdGNoVXBkYXRlKCk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX3Zpc2libGUgJiYgIXRoaXMuX3VwZGF0ZVRpbWVvdXQpIHtcblx0XHRcdFx0Ly8gRGVmZXIgdGhlIHVwZGF0ZSBzbyB0aGF0IG11bHRpcGxlIGNoYW5nZXMgdG8gc2V0dGVycyBkb24ndCBjYXVzZSBhIHJlZHJhdyBlYWNoXG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuZGlzcGF0Y2hVcGRhdGUoKTtcblx0XHRcdFx0fSwgMCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBkaXNwYXRjaFVwZGF0ZSgpIHtcblx0XHRcdHByb3h5LiRjcmVhdGVPclVwZGF0ZSh0aGlzLl9wZW5kaW5nVXBkYXRlKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdVcGRhdGUgPSB7IGlkOiB0aGlzLl9pZCB9O1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIEV4dEhvc3RRdWlja1BpY2s8VCBleHRlbmRzIFF1aWNrUGlja0l0ZW0+IGV4dGVuZHMgRXh0SG9zdFF1aWNrSW5wdXQgaW1wbGVtZW50cyBRdWlja1BpY2s8VD4ge1xuXG5cdFx0cHJpdmF0ZSBfaXRlbXM6IFRbXSA9IFtdO1xuXHRcdHByaXZhdGUgX2hhbmRsZXNUb0l0ZW1zID0gbmV3IE1hcDxudW1iZXIsIFQ+KCk7XG5cdFx0cHJpdmF0ZSBfaXRlbXNUb0hhbmRsZXMgPSBuZXcgTWFwPFQsIG51bWJlcj4oKTtcblx0XHRwcml2YXRlIF9jYW5TZWxlY3RNYW55ID0gZmFsc2U7XG5cdFx0cHJpdmF0ZSBfbWF0Y2hPbkRlc2NyaXB0aW9uID0gdHJ1ZTtcblx0XHRwcml2YXRlIF9tYXRjaE9uRGV0YWlsID0gdHJ1ZTtcblx0XHRwcml2YXRlIF9zb3J0QnlMYWJlbCA9IHRydWU7XG5cdFx0cHJpdmF0ZSBfa2VlcFNjcm9sbFBvc2l0aW9uID0gZmFsc2U7XG5cdFx0cHJpdmF0ZSBfYWN0aXZlSXRlbXM6IFRbXSA9IFtdO1xuXHRcdHByaXZhdGUgX3Byb21wdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlRW1pdHRlciA9IG5ldyBFbWl0dGVyPFRbXT4oKTtcblx0XHRwcml2YXRlIF9zZWxlY3RlZEl0ZW1zOiBUW10gPSBbXTtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlbGVjdGlvbkVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxUW10+KCk7XG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRUcmlnZ2VySXRlbUJ1dHRvbkVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxRdWlja1BpY2tJdGVtQnV0dG9uRXZlbnQ8VD4+KCk7XG5cblx0XHRjb25zdHJ1Y3RvcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgb25EaXNwb3NlOiAoKSA9PiB2b2lkKSB7XG5cdFx0XHRzdXBlcihleHRlbnNpb24sIG9uRGlzcG9zZSk7XG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlcy5wdXNoKFxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUVtaXR0ZXIsXG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uRW1pdHRlcixcblx0XHRcdFx0dGhpcy5fb25EaWRUcmlnZ2VySXRlbUJ1dHRvbkVtaXR0ZXJcblx0XHRcdCk7XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IHR5cGU6ICdxdWlja1BpY2snIH0pO1xuXHRcdH1cblxuXHRcdGdldCBpdGVtcygpIHtcblx0XHRcdHJldHVybiB0aGlzLl9pdGVtcztcblx0XHR9XG5cblx0XHRzZXQgaXRlbXMoaXRlbXM6IFRbXSkge1xuXHRcdFx0dGhpcy5faXRlbXMgPSBpdGVtcy5zbGljZSgpO1xuXHRcdFx0dGhpcy5faGFuZGxlc1RvSXRlbXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2l0ZW1zVG9IYW5kbGVzLmNsZWFyKCk7XG5cdFx0XHRpdGVtcy5mb3JFYWNoKChpdGVtLCBpKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZXNUb0l0ZW1zLnNldChpLCBpdGVtKTtcblx0XHRcdFx0dGhpcy5faXRlbXNUb0hhbmRsZXMuc2V0KGl0ZW0sIGkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHBpY2tJdGVtczogVHJhbnNmZXJRdWlja1BpY2tJdGVtT3JTZXBhcmF0b3JbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaGFuZGxlID0gMDsgaGFuZGxlIDwgaXRlbXMubGVuZ3RoOyBoYW5kbGUrKykge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gaXRlbXNbaGFuZGxlXTtcblx0XHRcdFx0aWYgKGl0ZW0ua2luZCA9PT0gUXVpY2tQaWNrSXRlbUtpbmQuU2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0cGlja0l0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGl0ZW0ubGFiZWwgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKGl0ZW0udG9vbHRpcCkge1xuXHRcdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAncXVpY2tQaWNrSXRlbVRvb2x0aXAnKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRwaWNrSXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHRoYW5kbGUsXG5cdFx0XHRcdFx0XHRsYWJlbDogaXRlbS5sYWJlbCxcblx0XHRcdFx0XHRcdGljb25QYXRoRHRvOiBJY29uUGF0aC5mcm9tKGl0ZW0uaWNvblBhdGgpLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGl0ZW0uZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRkZXRhaWw6IGl0ZW0uZGV0YWlsLFxuXHRcdFx0XHRcdFx0cGlja2VkOiBpdGVtLnBpY2tlZCxcblx0XHRcdFx0XHRcdGFsd2F5c1Nob3c6IGl0ZW0uYWx3YXlzU2hvdyxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IE1hcmtkb3duU3RyaW5nLmZyb21TdHJpY3QoaXRlbS50b29sdGlwKSxcblx0XHRcdFx0XHRcdHJlc291cmNlVXJpOiBpdGVtLnJlc291cmNlVXJpLFxuXHRcdFx0XHRcdFx0YnV0dG9uczogaXRlbS5idXR0b25zPy5tYXA8VHJhbnNmZXJRdWlja0lucHV0QnV0dG9uPigoYnV0dG9uLCBpKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdFx0aWNvblBhdGhEdG86IEljb25QYXRoLmZyb20oYnV0dG9uLmljb25QYXRoKSxcblx0XHRcdFx0XHRcdFx0XHR0b29sdGlwOiBidXR0b24udG9vbHRpcCxcblx0XHRcdFx0XHRcdFx0XHRoYW5kbGU6IGksXG5cdFx0XHRcdFx0XHRcdFx0dG9nZ2xlOlxuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZW9mIGJ1dHRvbi50b2dnbGUgPT09ICdvYmplY3QnICYmIHR5cGVvZiBidXR0b24udG9nZ2xlLmNoZWNrZWQgPT09ICdib29sZWFuJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQ/IHsgY2hlY2tlZDogYnV0dG9uLnRvZ2dsZS5jaGVja2VkIH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnVwZGF0ZSh7XG5cdFx0XHRcdGl0ZW1zOiBwaWNrSXRlbXMsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRnZXQgY2FuU2VsZWN0TWFueSgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jYW5TZWxlY3RNYW55O1xuXHRcdH1cblxuXHRcdHNldCBjYW5TZWxlY3RNYW55KGNhblNlbGVjdE1hbnk6IGJvb2xlYW4pIHtcblx0XHRcdHRoaXMuX2NhblNlbGVjdE1hbnkgPSBjYW5TZWxlY3RNYW55O1xuXHRcdFx0dGhpcy51cGRhdGUoeyBjYW5TZWxlY3RNYW55IH0pO1xuXHRcdH1cblxuXHRcdGdldCBtYXRjaE9uRGVzY3JpcHRpb24oKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbWF0Y2hPbkRlc2NyaXB0aW9uO1xuXHRcdH1cblxuXHRcdHNldCBtYXRjaE9uRGVzY3JpcHRpb24obWF0Y2hPbkRlc2NyaXB0aW9uOiBib29sZWFuKSB7XG5cdFx0XHR0aGlzLl9tYXRjaE9uRGVzY3JpcHRpb24gPSBtYXRjaE9uRGVzY3JpcHRpb247XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IG1hdGNoT25EZXNjcmlwdGlvbiB9KTtcblx0XHR9XG5cblx0XHRnZXQgbWF0Y2hPbkRldGFpbCgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9tYXRjaE9uRGV0YWlsO1xuXHRcdH1cblxuXHRcdHNldCBtYXRjaE9uRGV0YWlsKG1hdGNoT25EZXRhaWw6IGJvb2xlYW4pIHtcblx0XHRcdHRoaXMuX21hdGNoT25EZXRhaWwgPSBtYXRjaE9uRGV0YWlsO1xuXHRcdFx0dGhpcy51cGRhdGUoeyBtYXRjaE9uRGV0YWlsIH0pO1xuXHRcdH1cblxuXHRcdGdldCBzb3J0QnlMYWJlbCgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zb3J0QnlMYWJlbDtcblx0XHR9XG5cblx0XHRzZXQgc29ydEJ5TGFiZWwoc29ydEJ5TGFiZWw6IGJvb2xlYW4pIHtcblx0XHRcdHRoaXMuX3NvcnRCeUxhYmVsID0gc29ydEJ5TGFiZWw7XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IHNvcnRCeUxhYmVsIH0pO1xuXHRcdH1cblxuXHRcdGdldCBrZWVwU2Nyb2xsUG9zaXRpb24oKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fa2VlcFNjcm9sbFBvc2l0aW9uO1xuXHRcdH1cblxuXHRcdHNldCBrZWVwU2Nyb2xsUG9zaXRpb24oa2VlcFNjcm9sbFBvc2l0aW9uOiBib29sZWFuKSB7XG5cdFx0XHR0aGlzLl9rZWVwU2Nyb2xsUG9zaXRpb24gPSBrZWVwU2Nyb2xsUG9zaXRpb247XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IGtlZXBTY3JvbGxQb3NpdGlvbiB9KTtcblx0XHR9XG5cblx0XHRnZXQgcHJvbXB0KCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Byb21wdDtcblx0XHR9XG5cblx0XHRzZXQgcHJvbXB0KHByb21wdDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9wcm9tcHQgPSBwcm9tcHQ7XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IHByb21wdCB9KTtcblx0XHR9XG5cblx0XHRnZXQgYWN0aXZlSXRlbXMoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlSXRlbXM7XG5cdFx0fVxuXG5cdFx0c2V0IGFjdGl2ZUl0ZW1zKGFjdGl2ZUl0ZW1zOiBUW10pIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUl0ZW1zID0gYWN0aXZlSXRlbXMuZmlsdGVyKGl0ZW0gPT4gdGhpcy5faXRlbXNUb0hhbmRsZXMuaGFzKGl0ZW0pKTtcblx0XHRcdHRoaXMudXBkYXRlKHsgYWN0aXZlSXRlbXM6IHRoaXMuX2FjdGl2ZUl0ZW1zLm1hcChpdGVtID0+IHRoaXMuX2l0ZW1zVG9IYW5kbGVzLmdldChpdGVtKSkgfSk7XG5cdFx0fVxuXG5cdFx0b25EaWRDaGFuZ2VBY3RpdmUgPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUVtaXR0ZXIuZXZlbnQ7XG5cblx0XHRnZXQgc2VsZWN0ZWRJdGVtcygpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zZWxlY3RlZEl0ZW1zO1xuXHRcdH1cblxuXHRcdHNldCBzZWxlY3RlZEl0ZW1zKHNlbGVjdGVkSXRlbXM6IFRbXSkge1xuXHRcdFx0dGhpcy5fc2VsZWN0ZWRJdGVtcyA9IHNlbGVjdGVkSXRlbXMuZmlsdGVyKGl0ZW0gPT4gdGhpcy5faXRlbXNUb0hhbmRsZXMuaGFzKGl0ZW0pKTtcblx0XHRcdHRoaXMudXBkYXRlKHsgc2VsZWN0ZWRJdGVtczogdGhpcy5fc2VsZWN0ZWRJdGVtcy5tYXAoaXRlbSA9PiB0aGlzLl9pdGVtc1RvSGFuZGxlcy5nZXQoaXRlbSkpIH0pO1xuXHRcdH1cblxuXHRcdG9uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb25FbWl0dGVyLmV2ZW50O1xuXG5cdFx0X2ZpcmVEaWRDaGFuZ2VBY3RpdmUoaGFuZGxlczogbnVtYmVyW10pIHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gY29hbGVzY2UoaGFuZGxlcy5tYXAoaGFuZGxlID0+IHRoaXMuX2hhbmRsZXNUb0l0ZW1zLmdldChoYW5kbGUpKSk7XG5cdFx0XHR0aGlzLl9hY3RpdmVJdGVtcyA9IGl0ZW1zO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVFbWl0dGVyLmZpcmUoaXRlbXMpO1xuXHRcdH1cblxuXHRcdF9maXJlRGlkQ2hhbmdlU2VsZWN0aW9uKGhhbmRsZXM6IG51bWJlcltdKSB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGNvYWxlc2NlKGhhbmRsZXMubWFwKGhhbmRsZSA9PiB0aGlzLl9oYW5kbGVzVG9JdGVtcy5nZXQoaGFuZGxlKSkpO1xuXHRcdFx0dGhpcy5fc2VsZWN0ZWRJdGVtcyA9IGl0ZW1zO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb25FbWl0dGVyLmZpcmUoaXRlbXMpO1xuXHRcdH1cblxuXHRcdG9uRGlkVHJpZ2dlckl0ZW1CdXR0b24gPSB0aGlzLl9vbkRpZFRyaWdnZXJJdGVtQnV0dG9uRW1pdHRlci5ldmVudDtcblxuXHRcdF9maXJlRGlkVHJpZ2dlckl0ZW1CdXR0b24oaXRlbUhhbmRsZTogbnVtYmVyLCBidXR0b25IYW5kbGU6IG51bWJlciwgY2hlY2tlZD86IGJvb2xlYW4pIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9oYW5kbGVzVG9JdGVtcy5nZXQoaXRlbUhhbmRsZSkhO1xuXHRcdFx0aWYgKCFpdGVtIHx8ICFpdGVtLmJ1dHRvbnMgfHwgIWl0ZW0uYnV0dG9ucy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYnV0dG9uID0gaXRlbS5idXR0b25zW2J1dHRvbkhhbmRsZV07XG5cdFx0XHRpZiAoYnV0dG9uKSB7XG5cdFx0XHRcdGlmIChjaGVja2VkICE9PSB1bmRlZmluZWQgJiYgYnV0dG9uLnRvZ2dsZSkge1xuXHRcdFx0XHRcdGJ1dHRvbi50b2dnbGUuY2hlY2tlZCA9IGNoZWNrZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fb25EaWRUcmlnZ2VySXRlbUJ1dHRvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdFx0YnV0dG9uLFxuXHRcdFx0XHRcdGl0ZW1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgRXh0SG9zdElucHV0Qm94IGV4dGVuZHMgRXh0SG9zdFF1aWNrSW5wdXQgaW1wbGVtZW50cyBJbnB1dEJveCB7XG5cblx0XHRwcml2YXRlIF9wYXNzd29yZCA9IGZhbHNlO1xuXHRcdHByaXZhdGUgX3Byb21wdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHByaXZhdGUgX3ZhbGlkYXRpb25NZXNzYWdlOiBzdHJpbmcgfCBJbnB1dEJveFZhbGlkYXRpb25NZXNzYWdlIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3RydWN0b3IoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIG9uRGlzcG9zZTogKCkgPT4gdm9pZCkge1xuXHRcdFx0c3VwZXIoZXh0ZW5zaW9uLCBvbkRpc3Bvc2UpO1xuXHRcdFx0dGhpcy51cGRhdGUoeyB0eXBlOiAnaW5wdXRCb3gnIH0pO1xuXHRcdH1cblxuXHRcdGdldCBwYXNzd29yZCgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9wYXNzd29yZDtcblx0XHR9XG5cblx0XHRzZXQgcGFzc3dvcmQocGFzc3dvcmQ6IGJvb2xlYW4pIHtcblx0XHRcdHRoaXMuX3Bhc3N3b3JkID0gcGFzc3dvcmQ7XG5cdFx0XHR0aGlzLnVwZGF0ZSh7IHBhc3N3b3JkIH0pO1xuXHRcdH1cblxuXHRcdGdldCBwcm9tcHQoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcHJvbXB0O1xuXHRcdH1cblxuXHRcdHNldCBwcm9tcHQocHJvbXB0OiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3Byb21wdCA9IHByb21wdDtcblx0XHRcdHRoaXMudXBkYXRlKHsgcHJvbXB0IH0pO1xuXHRcdH1cblxuXHRcdGdldCB2YWxpZGF0aW9uTWVzc2FnZSgpIHtcblx0XHRcdHJldHVybiB0aGlzLl92YWxpZGF0aW9uTWVzc2FnZTtcblx0XHR9XG5cblx0XHRzZXQgdmFsaWRhdGlvbk1lc3NhZ2UodmFsaWRhdGlvbk1lc3NhZ2U6IHN0cmluZyB8IElucHV0Qm94VmFsaWRhdGlvbk1lc3NhZ2UgfCB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3ZhbGlkYXRpb25NZXNzYWdlID0gdmFsaWRhdGlvbk1lc3NhZ2U7XG5cdFx0XHRpZiAoIXZhbGlkYXRpb25NZXNzYWdlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKHsgdmFsaWRhdGlvbk1lc3NhZ2U6IHVuZGVmaW5lZCwgc2V2ZXJpdHk6IFNldmVyaXR5Lklnbm9yZSB9KTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHZhbGlkYXRpb25NZXNzYWdlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZSh7IHZhbGlkYXRpb25NZXNzYWdlLCBzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZSh7IHZhbGlkYXRpb25NZXNzYWdlOiB2YWxpZGF0aW9uTWVzc2FnZS5tZXNzYWdlLCBzZXZlcml0eTogdmFsaWRhdGlvbk1lc3NhZ2Uuc2V2ZXJpdHkgPz8gU2V2ZXJpdHkuRXJyb3IgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG5ldyBFeHRIb3N0UXVpY2tPcGVuSW1wbCh3b3Jrc3BhY2UsIGNvbW1hbmRzKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQTRCO0FBSXJDLFNBQThDLG1CQUFtRztBQUNqSixTQUFTLG1CQUFtQixtQkFBbUIsa0NBQWtDO0FBQ2pGLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsZ0JBQWdCO0FBQ3pCLE9BQU8sY0FBYztBQUNyQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLFVBQVUsc0JBQXNCO0FBbUJsQyxTQUFTLHVCQUF1QixhQUEyQixXQUFzQyxVQUFxRTtBQUM1SyxRQUFNLFFBQVEsWUFBWSxTQUFTLFlBQVksbUJBQW1CO0FBQUEsRUFFbEUsTUFBTSxxQkFBc0Q7QUFBQSxJQVkzRCxZQUFZQSxZQUFzQ0MsV0FBMkI7QUFKN0UsV0FBUSxZQUFZLG9CQUFJLElBQStCO0FBRXZELFdBQVEsYUFBYTtBQUdwQixXQUFLLGFBQWFEO0FBQ2xCLFdBQUssWUFBWUM7QUFBQSxJQUNsQjtBQUFBLElBS0EsY0FBYyxXQUFrQyxxQkFBK0MsU0FBNEIsUUFBMkIsa0JBQWtCLE1BQTBDO0FBRWpOLFdBQUssbUJBQW1CO0FBRXhCLFlBQU0sZUFBZSxRQUFRLFFBQVEsbUJBQW1CO0FB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SyxRQUFRLFFBQVE7QUFDbkQ7QUFBQSxNQUNEO0FBQ0EsWUFBTSxTQUFTLEtBQUssUUFBUSxZQUFZO0FBQ3hDLFVBQUksUUFBUTtBQUNYLFlBQUksWUFBWSxVQUFhLE9BQU8sUUFBUTtBQUMzQyxpQkFBTyxPQUFPLFVBQVU7QUFBQSxRQUN6QjtBQUNBLGFBQUssK0JBQStCLEtBQUs7QUFBQSxVQUN4QztBQUFBLFVBQ0E7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sd0JBQXdCLGtCQUFzQztBQUFBLElBTW5FLFlBQVksV0FBa0MsV0FBdUI7QUFDcEUsWUFBTSxXQUFXLFNBQVM7QUFMM0IsV0FBUSxZQUFZO0FBTW5CLFdBQUssT0FBTyxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQUEsSUFDakM7QUFBQSxJQUVBLElBQUksV0FBVztBQUNkLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFBQSxJQUVBLElBQUksU0FBUyxVQUFtQjtBQUMvQixXQUFLLFlBQVk7QUFDakIsV0FBSyxPQUFPLEVBQUUsU0FBUyxDQUFDO0FBQUEsSUFDekI7QUFBQSxJQUVBLElBQUksU0FBUztBQUNaLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFBQSxJQUVBLElBQUksT0FBTyxRQUE0QjtBQUN0QyxXQUFLLFVBQVU7QUFDZixXQUFLLE9BQU8sRUFBRSxPQUFPLENBQUM7QUFBQSxJQUN2QjtBQUFBLElBRUEsSUFBSSxvQkFBb0I7QUFDdkIsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUFBLElBRUEsSUFBSSxrQkFBa0IsbUJBQW1FO0FBQ3hGLFdBQUsscUJBQXFCO0FBQzFCLFVBQUksQ0FBQyxtQkFBbUI7QUFDdkIsYUFBSyxPQUFPLEVBQUUsbUJBQW1CLFFBQVcsVUFBVSxTQUFTLE9BQU8sQ0FBQztBQUFBLE1BQ3hFLFdBQVcsT0FBTyxzQkFBc0IsVUFBVTtBQUNqRCxhQUFLLE9BQU8sRUFBRSxtQkFBbUIsVUFBVSxTQUFTLE1BQU0sQ0FBQztBQUFBLE1BQzVELE9BQU87QUFDTixhQUFLLE9BQU8sRUFBRSxtQkFBbUIsa0JBQWtCLFNBQVMsVUFBVSxrQkFBa0IsWUFBWSxTQUFTLE1BQU0sQ0FBQztBQUFBLE1BQ3JIO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxTQUFPLElBQUkscUJBQXFCLFdBQVcsUUFBUTtBQUNwRDsiLAogICJuYW1lcyI6IFsid29ya3NwYWNlIiwgImNvbW1hbmRzIl0KfQo=
