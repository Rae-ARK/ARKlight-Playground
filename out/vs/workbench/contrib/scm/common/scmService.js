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
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { SCMInputChangeReason } from "./scm.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { HistoryNavigator2 } from "../../../../base/common/history.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { URI } from "../../../../base/common/uri.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { Schemas } from "../../../../base/common/network.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { runOnChange } from "../../../../base/common/observable.js";
class SCMInput extends Disposable {
  constructor(repository, history) {
    super();
    this.repository = repository;
    this.history = history;
    this._value = "";
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._placeholder = "";
    this._onDidChangePlaceholder = this._register(new Emitter());
    this.onDidChangePlaceholder = this._onDidChangePlaceholder.event;
    this._enabled = true;
    this._onDidChangeEnablement = this._register(new Emitter());
    this.onDidChangeEnablement = this._onDidChangeEnablement.event;
    this._visible = true;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._onDidChangeFocus = this._register(new Emitter());
    this.onDidChangeFocus = this._onDidChangeFocus.event;
    this._onDidChangeValidationMessage = this._register(new Emitter());
    this.onDidChangeValidationMessage = this._onDidChangeValidationMessage.event;
    this._onDidClearValidation = this._register(new Emitter());
    this.onDidClearValidation = this._onDidClearValidation.event;
    this._validateInput = () => Promise.resolve(void 0);
    this._onDidChangeValidateInput = this._register(new Emitter());
    this.onDidChangeValidateInput = this._onDidChangeValidateInput.event;
    this.didChangeHistory = false;
    if (this.repository.provider.rootUri) {
      this.historyNavigator = history.getHistory(this.repository.provider.label, this.repository.provider.rootUri);
      this._register(this.history.onWillSaveHistory((event) => {
        if (this.historyNavigator.isAtEnd()) {
          this.saveValue();
        }
        if (this.didChangeHistory) {
          event.historyDidIndeedChange();
        }
        this.didChangeHistory = false;
      }));
    } else {
      this.historyNavigator = new HistoryNavigator2([""], 100);
    }
    this._value = this.historyNavigator.current();
  }
  get value() {
    return this._value;
  }
  get placeholder() {
    return this._placeholder;
  }
  set placeholder(placeholder) {
    this._placeholder = placeholder;
    this._onDidChangePlaceholder.fire(placeholder);
  }
  get enabled() {
    return this._enabled;
  }
  set enabled(enabled) {
    this._enabled = enabled;
    this._onDidChangeEnablement.fire(enabled);
  }
  get visible() {
    return this._visible;
  }
  set visible(visible) {
    this._visible = visible;
    this._onDidChangeVisibility.fire(visible);
  }
  setFocus() {
    this._onDidChangeFocus.fire();
  }
  showValidationMessage(message, type) {
    this._onDidChangeValidationMessage.fire({ message, type });
  }
  clearValidation() {
    this._onDidClearValidation.fire();
  }
  get validateInput() {
    return this._validateInput;
  }
  set validateInput(validateInput) {
    this._validateInput = validateInput;
    this._onDidChangeValidateInput.fire();
  }
  setValue(value, transient, reason) {
    if (value === this._value) {
      return;
    }
    if (!transient) {
      this.historyNavigator.replaceLast(this._value);
      this.historyNavigator.add(value);
      this.didChangeHistory = true;
    }
    this._value = value;
    this._onDidChange.fire({ value, reason });
  }
  showNextHistoryValue() {
    if (this.historyNavigator.isAtEnd()) {
      return;
    } else if (!this.historyNavigator.has(this.value)) {
      this.saveValue();
      this.historyNavigator.resetCursor();
    }
    const value = this.historyNavigator.next();
    this.setValue(value, true, SCMInputChangeReason.HistoryNext);
  }
  showPreviousHistoryValue() {
    if (this.historyNavigator.isAtEnd()) {
      this.saveValue();
    } else if (!this.historyNavigator.has(this._value)) {
      this.saveValue();
      this.historyNavigator.resetCursor();
    }
    const value = this.historyNavigator.previous();
    this.setValue(value, true, SCMInputChangeReason.HistoryPrevious);
  }
  saveValue() {
    const oldValue = this.historyNavigator.replaceLast(this._value);
    this.didChangeHistory = this.didChangeHistory || oldValue !== this._value;
  }
}
class SCMRepository {
  constructor(id, provider, disposables, inputHistory) {
    this.id = id;
    this.provider = provider;
    this.disposables = disposables;
    this._selected = false;
    this._onDidChangeSelection = new Emitter();
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this.input = new SCMInput(this, inputHistory);
  }
  get selected() {
    return this._selected;
  }
  setSelected(selected) {
    if (this._selected === selected) {
      return;
    }
    this._selected = selected;
    this._onDidChangeSelection.fire(selected);
  }
  dispose() {
    this.disposables.dispose();
    this._onDidChangeSelection.dispose();
    this.input.dispose();
    this.provider.dispose();
  }
}
class WillSaveHistoryEvent {
  constructor() {
    this._didChangeHistory = false;
  }
  get didChangeHistory() {
    return this._didChangeHistory;
  }
  historyDidIndeedChange() {
    this._didChangeHistory = true;
  }
}
let SCMInputHistory = class {
  constructor(storageService, workspaceContextService) {
    this.storageService = storageService;
    this.workspaceContextService = workspaceContextService;
    this.disposables = new DisposableStore();
    this.histories = /* @__PURE__ */ new Map();
    this._onWillSaveHistory = this.disposables.add(new Emitter());
    this.onWillSaveHistory = this._onWillSaveHistory.event;
    this.histories = /* @__PURE__ */ new Map();
    const entries = this.storageService.getObject("scm.history", StorageScope.WORKSPACE, []);
    for (const [providerLabel, rootUri, history] of entries) {
      let providerHistories = this.histories.get(providerLabel);
      if (!providerHistories) {
        providerHistories = new ResourceMap();
        this.histories.set(providerLabel, providerHistories);
      }
      providerHistories.set(rootUri, new HistoryNavigator2(history, 100));
    }
    if (this.migrateStorage()) {
      this.saveToStorage();
    }
    this.disposables.add(this.storageService.onDidChangeValue(StorageScope.WORKSPACE, "scm.history", this.disposables)((e) => {
      if (e.external && e.key === "scm.history") {
        const raw = this.storageService.getObject("scm.history", StorageScope.WORKSPACE, []);
        for (const [providerLabel, uri, rawHistory] of raw) {
          const history = this.getHistory(providerLabel, uri);
          for (const value of Iterable.reverse(rawHistory)) {
            history.prepend(value);
          }
        }
      }
    }));
    this.disposables.add(this.storageService.onWillSaveState((_) => {
      const event = new WillSaveHistoryEvent();
      this._onWillSaveHistory.fire(event);
      if (event.didChangeHistory) {
        this.saveToStorage();
      }
    }));
  }
  saveToStorage() {
    const raw = [];
    for (const [providerLabel, providerHistories] of this.histories) {
      for (const [rootUri, history] of providerHistories) {
        if (!(history.size === 1 && history.current() === "")) {
          raw.push([providerLabel, rootUri, [...history]]);
        }
      }
    }
    this.storageService.store("scm.history", raw, StorageScope.WORKSPACE, StorageTarget.USER);
  }
  getHistory(providerLabel, rootUri) {
    let providerHistories = this.histories.get(providerLabel);
    if (!providerHistories) {
      providerHistories = new ResourceMap();
      this.histories.set(providerLabel, providerHistories);
    }
    let history = providerHistories.get(rootUri);
    if (!history) {
      history = new HistoryNavigator2([""], 100);
      providerHistories.set(rootUri, history);
    }
    return history;
  }
  // Migrates from Application scope storage to Workspace scope.
  // TODO@joaomoreno: Change from January 2024 onwards such that the only code is to remove all `scm/input:` storage keys
  migrateStorage() {
    let didSomethingChange = false;
    const machineKeys = Iterable.filter(this.storageService.keys(StorageScope.APPLICATION, StorageTarget.MACHINE), (key) => key.startsWith("scm/input:"));
    for (const key of machineKeys) {
      try {
        const legacyHistory = JSON.parse(this.storageService.get(key, StorageScope.APPLICATION, ""));
        const match = /^scm\/input:([^:]+):(.+)$/.exec(key);
        if (!match || !Array.isArray(legacyHistory?.history) || !Number.isInteger(legacyHistory?.timestamp)) {
          this.storageService.remove(key, StorageScope.APPLICATION);
          continue;
        }
        const [, providerLabel, rootPath] = match;
        const rootUri = URI.file(rootPath);
        if (this.workspaceContextService.getWorkspaceFolder(rootUri)) {
          const history = this.getHistory(providerLabel, rootUri);
          for (const entry of Iterable.reverse(legacyHistory.history)) {
            history.prepend(entry);
          }
          didSomethingChange = true;
          this.storageService.remove(key, StorageScope.APPLICATION);
        }
      } catch {
        this.storageService.remove(key, StorageScope.APPLICATION);
      }
    }
    return didSomethingChange;
  }
  dispose() {
    this.disposables.dispose();
  }
};
SCMInputHistory = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IWorkspaceContextService)
], SCMInputHistory);
let SCMService = class {
  constructor(logService, workspaceContextService, contextKeyService, storageService, uriIdentityService) {
    this.logService = logService;
    this.uriIdentityService = uriIdentityService;
    this._repositories = /* @__PURE__ */ new Map();
    this._onDidAddProvider = new Emitter();
    this.onDidAddRepository = this._onDidAddProvider.event;
    this._onDidRemoveProvider = new Emitter();
    this.onDidRemoveRepository = this._onDidRemoveProvider.event;
    this.inputHistory = new SCMInputHistory(storageService, workspaceContextService);
    this.providerCount = contextKeyService.createKey("scm.providerCount", 0);
    this.historyProviderCount = contextKeyService.createKey("scm.historyProviderCount", 0);
  }
  // used in tests
  get repositories() {
    return this._repositories.values();
  }
  get repositoryCount() {
    return this._repositories.size;
  }
  registerSCMProvider(provider) {
    this.logService.trace("SCMService#registerSCMProvider");
    if (this._repositories.has(provider.id)) {
      throw new Error(`SCM Provider ${provider.id} already exists.`);
    }
    const disposables = new DisposableStore();
    const historyProviderCount = () => {
      return Array.from(this._repositories.values()).filter((r) => !!r.provider.historyProvider.get()).length;
    };
    disposables.add(toDisposable(() => {
      this._repositories.delete(provider.id);
      this._onDidRemoveProvider.fire(repository);
      this.providerCount.set(this._repositories.size);
      this.historyProviderCount.set(historyProviderCount());
    }));
    const repository = new SCMRepository(provider.id, provider, disposables, this.inputHistory);
    this._repositories.set(provider.id, repository);
    disposables.add(runOnChange(provider.historyProvider, () => {
      this.historyProviderCount.set(historyProviderCount());
    }));
    this.providerCount.set(this._repositories.size);
    this.historyProviderCount.set(historyProviderCount());
    this._onDidAddProvider.fire(repository);
    return repository;
  }
  getRepository(idOrResource) {
    if (typeof idOrResource === "string") {
      return this._repositories.get(idOrResource);
    }
    if (idOrResource.scheme !== Schemas.file && idOrResource.scheme !== Schemas.vscodeRemote) {
      return void 0;
    }
    let bestRepository = void 0;
    let bestMatchLength = Number.POSITIVE_INFINITY;
    for (const repository of this.repositories) {
      if (repository.provider.isHidden === true) {
        continue;
      }
      const root = repository.provider.rootUri;
      if (!root) {
        continue;
      }
      const path = this.uriIdentityService.extUri.relativePath(root, idOrResource);
      if (path && !/^\.\./.test(path) && path.length < bestMatchLength) {
        bestRepository = repository;
        bestMatchLength = path.length;
      }
    }
    return bestRepository;
  }
};
SCMService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IUriIdentityService)
], SCMService);
export {
  SCMService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9jb21tb24vc2NtU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElTQ01TZXJ2aWNlLCBJU0NNUHJvdmlkZXIsIElTQ01JbnB1dCwgSVNDTVJlcG9zaXRvcnksIElJbnB1dFZhbGlkYXRvciwgSVNDTUlucHV0Q2hhbmdlRXZlbnQsIFNDTUlucHV0Q2hhbmdlUmVhc29uLCBJbnB1dFZhbGlkYXRpb25UeXBlLCBJSW5wdXRWYWxpZGF0aW9uIH0gZnJvbSAnLi9zY20uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSGlzdG9yeU5hdmlnYXRvcjIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgcnVuT25DaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcblxuY2xhc3MgU0NNSW5wdXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNDTUlucHV0IHtcblxuXHRwcml2YXRlIF92YWx1ZSA9ICcnO1xuXG5cdGdldCB2YWx1ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl92YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNDTUlucHV0Q2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8SVNDTUlucHV0Q2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfcGxhY2Vob2xkZXIgPSAnJztcblxuXHRnZXQgcGxhY2Vob2xkZXIoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fcGxhY2Vob2xkZXI7XG5cdH1cblxuXHRzZXQgcGxhY2Vob2xkZXIocGxhY2Vob2xkZXI6IHN0cmluZykge1xuXHRcdHRoaXMuX3BsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQbGFjZWhvbGRlci5maXJlKHBsYWNlaG9sZGVyKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUGxhY2Vob2xkZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVBsYWNlaG9sZGVyOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRDaGFuZ2VQbGFjZWhvbGRlci5ldmVudDtcblxuXHRwcml2YXRlIF9lbmFibGVkID0gdHJ1ZTtcblxuXHRnZXQgZW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5hYmxlZDtcblx0fVxuXG5cdHNldCBlbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9lbmFibGVkID0gZW5hYmxlZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUVuYWJsZW1lbnQuZmlyZShlbmFibGVkKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRW5hYmxlbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUVuYWJsZW1lbnQ6IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5fb25EaWRDaGFuZ2VFbmFibGVtZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgX3Zpc2libGUgPSB0cnVlO1xuXG5cdGdldCB2aXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl92aXNpYmxlO1xuXHR9XG5cblx0c2V0IHZpc2libGUodmlzaWJsZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX3Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKHZpc2libGUpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRXZlbnQ8Ym9vbGVhbj4gPSB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZXZlbnQ7XG5cblx0c2V0Rm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VGb2N1cy5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRm9jdXM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VGb2N1cy5ldmVudDtcblxuXHRzaG93VmFsaWRhdGlvbk1lc3NhZ2UobWVzc2FnZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nLCB0eXBlOiBJbnB1dFZhbGlkYXRpb25UeXBlKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWYWxpZGF0aW9uTWVzc2FnZS5maXJlKHsgbWVzc2FnZTogbWVzc2FnZSwgdHlwZTogdHlwZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmFsaWRhdGlvbk1lc3NhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJSW5wdXRWYWxpZGF0aW9uPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWYWxpZGF0aW9uTWVzc2FnZTogRXZlbnQ8SUlucHV0VmFsaWRhdGlvbj4gPSB0aGlzLl9vbkRpZENoYW5nZVZhbGlkYXRpb25NZXNzYWdlLmV2ZW50O1xuXG5cdGNsZWFyVmFsaWRhdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENsZWFyVmFsaWRhdGlvbi5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsZWFyVmFsaWRhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsZWFyVmFsaWRhdGlvbjogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENsZWFyVmFsaWRhdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIF92YWxpZGF0ZUlucHV0OiBJSW5wdXRWYWxpZGF0b3IgPSAoKSA9PiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRnZXQgdmFsaWRhdGVJbnB1dCgpOiBJSW5wdXRWYWxpZGF0b3Ige1xuXHRcdHJldHVybiB0aGlzLl92YWxpZGF0ZUlucHV0O1xuXHR9XG5cblx0c2V0IHZhbGlkYXRlSW5wdXQodmFsaWRhdGVJbnB1dDogSUlucHV0VmFsaWRhdG9yKSB7XG5cdFx0dGhpcy5fdmFsaWRhdGVJbnB1dCA9IHZhbGlkYXRlSW5wdXQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWYWxpZGF0ZUlucHV0LmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmFsaWRhdGVJbnB1dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZhbGlkYXRlSW5wdXQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VWYWxpZGF0ZUlucHV0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaGlzdG9yeU5hdmlnYXRvcjogSGlzdG9yeU5hdmlnYXRvcjI8c3RyaW5nPjtcblx0cHJpdmF0ZSBkaWRDaGFuZ2VIaXN0b3J5OiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBoaXN0b3J5OiBTQ01JbnB1dEhpc3Rvcnlcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmICh0aGlzLnJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaSkge1xuXHRcdFx0dGhpcy5oaXN0b3J5TmF2aWdhdG9yID0gaGlzdG9yeS5nZXRIaXN0b3J5KHRoaXMucmVwb3NpdG9yeS5wcm92aWRlci5sYWJlbCwgdGhpcy5yZXBvc2l0b3J5LnByb3ZpZGVyLnJvb3RVcmkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5oaXN0b3J5Lm9uV2lsbFNhdmVIaXN0b3J5KGV2ZW50ID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuaGlzdG9yeU5hdmlnYXRvci5pc0F0RW5kKCkpIHtcblx0XHRcdFx0XHR0aGlzLnNhdmVWYWx1ZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuZGlkQ2hhbmdlSGlzdG9yeSkge1xuXHRcdFx0XHRcdGV2ZW50Lmhpc3RvcnlEaWRJbmRlZWRDaGFuZ2UoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuZGlkQ2hhbmdlSGlzdG9yeSA9IGZhbHNlO1xuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7IC8vIGluIG1lbW9yeSBvbmx5XG5cdFx0XHR0aGlzLmhpc3RvcnlOYXZpZ2F0b3IgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcjIoWycnXSwgMTAwKTtcblx0XHR9XG5cblx0XHR0aGlzLl92YWx1ZSA9IHRoaXMuaGlzdG9yeU5hdmlnYXRvci5jdXJyZW50KCk7XG5cdH1cblxuXHRzZXRWYWx1ZSh2YWx1ZTogc3RyaW5nLCB0cmFuc2llbnQ6IGJvb2xlYW4sIHJlYXNvbj86IFNDTUlucHV0Q2hhbmdlUmVhc29uKSB7XG5cdFx0aWYgKHZhbHVlID09PSB0aGlzLl92YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdHJhbnNpZW50KSB7XG5cdFx0XHR0aGlzLmhpc3RvcnlOYXZpZ2F0b3IucmVwbGFjZUxhc3QodGhpcy5fdmFsdWUpO1xuXHRcdFx0dGhpcy5oaXN0b3J5TmF2aWdhdG9yLmFkZCh2YWx1ZSk7XG5cdFx0XHR0aGlzLmRpZENoYW5nZUhpc3RvcnkgPSB0cnVlO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ZhbHVlID0gdmFsdWU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IHZhbHVlLCByZWFzb24gfSk7XG5cdH1cblxuXHRzaG93TmV4dEhpc3RvcnlWYWx1ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oaXN0b3J5TmF2aWdhdG9yLmlzQXRFbmQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMuaGlzdG9yeU5hdmlnYXRvci5oYXModGhpcy52YWx1ZSkpIHtcblx0XHRcdHRoaXMuc2F2ZVZhbHVlKCk7XG5cdFx0XHR0aGlzLmhpc3RvcnlOYXZpZ2F0b3IucmVzZXRDdXJzb3IoKTtcblx0XHR9XG5cblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuaGlzdG9yeU5hdmlnYXRvci5uZXh0KCk7XG5cdFx0dGhpcy5zZXRWYWx1ZSh2YWx1ZSwgdHJ1ZSwgU0NNSW5wdXRDaGFuZ2VSZWFzb24uSGlzdG9yeU5leHQpO1xuXHR9XG5cblx0c2hvd1ByZXZpb3VzSGlzdG9yeVZhbHVlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmhpc3RvcnlOYXZpZ2F0b3IuaXNBdEVuZCgpKSB7XG5cdFx0XHR0aGlzLnNhdmVWYWx1ZSgpO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMuaGlzdG9yeU5hdmlnYXRvci5oYXModGhpcy5fdmFsdWUpKSB7XG5cdFx0XHR0aGlzLnNhdmVWYWx1ZSgpO1xuXHRcdFx0dGhpcy5oaXN0b3J5TmF2aWdhdG9yLnJlc2V0Q3Vyc29yKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLmhpc3RvcnlOYXZpZ2F0b3IucHJldmlvdXMoKTtcblx0XHR0aGlzLnNldFZhbHVlKHZhbHVlLCB0cnVlLCBTQ01JbnB1dENoYW5nZVJlYXNvbi5IaXN0b3J5UHJldmlvdXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBzYXZlVmFsdWUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2xkVmFsdWUgPSB0aGlzLmhpc3RvcnlOYXZpZ2F0b3IucmVwbGFjZUxhc3QodGhpcy5fdmFsdWUpO1xuXHRcdHRoaXMuZGlkQ2hhbmdlSGlzdG9yeSA9IHRoaXMuZGlkQ2hhbmdlSGlzdG9yeSB8fCAob2xkVmFsdWUgIT09IHRoaXMuX3ZhbHVlKTtcblx0fVxufVxuXG5jbGFzcyBTQ01SZXBvc2l0b3J5IGltcGxlbWVudHMgSVNDTVJlcG9zaXRvcnkge1xuXG5cdHByaXZhdGUgX3NlbGVjdGVkID0gZmFsc2U7XG5cdGdldCBzZWxlY3RlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VsZWN0ZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlbGVjdGlvbiA9IG5ldyBFbWl0dGVyPGJvb2xlYW4+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VsZWN0aW9uOiBFdmVudDxib29sZWFuPiA9IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmV2ZW50O1xuXG5cdHJlYWRvbmx5IGlucHV0OiBJU0NNSW5wdXQgJiBJRGlzcG9zYWJsZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgaWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHJvdmlkZXI6IElTQ01Qcm92aWRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsXG5cdFx0aW5wdXRIaXN0b3J5OiBTQ01JbnB1dEhpc3Rvcnlcblx0KSB7XG5cdFx0dGhpcy5pbnB1dCA9IG5ldyBTQ01JbnB1dCh0aGlzLCBpbnB1dEhpc3RvcnkpO1xuXHR9XG5cblx0c2V0U2VsZWN0ZWQoc2VsZWN0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2VsZWN0ZWQgPT09IHNlbGVjdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VsZWN0ZWQgPSBzZWxlY3RlZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKHNlbGVjdGVkKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZGlzcG9zZSgpO1xuXHRcdHRoaXMuaW5wdXQuZGlzcG9zZSgpO1xuXHRcdHRoaXMucHJvdmlkZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIFdpbGxTYXZlSGlzdG9yeUV2ZW50IHtcblx0cHJpdmF0ZSBfZGlkQ2hhbmdlSGlzdG9yeSA9IGZhbHNlO1xuXHRnZXQgZGlkQ2hhbmdlSGlzdG9yeSgpIHsgcmV0dXJuIHRoaXMuX2RpZENoYW5nZUhpc3Rvcnk7IH1cblx0aGlzdG9yeURpZEluZGVlZENoYW5nZSgpIHsgdGhpcy5fZGlkQ2hhbmdlSGlzdG9yeSA9IHRydWU7IH1cbn1cblxuY2xhc3MgU0NNSW5wdXRIaXN0b3J5IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGhpc3RvcmllcyA9IG5ldyBNYXA8c3RyaW5nLCBSZXNvdXJjZU1hcDxIaXN0b3J5TmF2aWdhdG9yMjxzdHJpbmc+Pj4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxTYXZlSGlzdG9yeSA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPFdpbGxTYXZlSGlzdG9yeUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25XaWxsU2F2ZUhpc3RvcnkgPSB0aGlzLl9vbldpbGxTYXZlSGlzdG9yeS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5oaXN0b3JpZXMgPSBuZXcgTWFwKCk7XG5cblx0XHRjb25zdCBlbnRyaWVzID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRPYmplY3Q8W3N0cmluZywgVVJJLCBzdHJpbmdbXV1bXT4oJ3NjbS5oaXN0b3J5JywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgW10pO1xuXG5cdFx0Zm9yIChjb25zdCBbcHJvdmlkZXJMYWJlbCwgcm9vdFVyaSwgaGlzdG9yeV0gb2YgZW50cmllcykge1xuXHRcdFx0bGV0IHByb3ZpZGVySGlzdG9yaWVzID0gdGhpcy5oaXN0b3JpZXMuZ2V0KHByb3ZpZGVyTGFiZWwpO1xuXG5cdFx0XHRpZiAoIXByb3ZpZGVySGlzdG9yaWVzKSB7XG5cdFx0XHRcdHByb3ZpZGVySGlzdG9yaWVzID0gbmV3IFJlc291cmNlTWFwKCk7XG5cdFx0XHRcdHRoaXMuaGlzdG9yaWVzLnNldChwcm92aWRlckxhYmVsLCBwcm92aWRlckhpc3Rvcmllcyk7XG5cdFx0XHR9XG5cblx0XHRcdHByb3ZpZGVySGlzdG9yaWVzLnNldChyb290VXJpLCBuZXcgSGlzdG9yeU5hdmlnYXRvcjIoaGlzdG9yeSwgMTAwKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubWlncmF0ZVN0b3JhZ2UoKSkge1xuXHRcdFx0dGhpcy5zYXZlVG9TdG9yYWdlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsICdzY20uaGlzdG9yeScsIHRoaXMuZGlzcG9zYWJsZXMpKGUgPT4ge1xuXHRcdFx0aWYgKGUuZXh0ZXJuYWwgJiYgZS5rZXkgPT09ICdzY20uaGlzdG9yeScpIHtcblx0XHRcdFx0Y29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRPYmplY3Q8W3N0cmluZywgVVJJLCBzdHJpbmdbXV1bXT4oJ3NjbS5oaXN0b3J5JywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgW10pO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgW3Byb3ZpZGVyTGFiZWwsIHVyaSwgcmF3SGlzdG9yeV0gb2YgcmF3KSB7XG5cdFx0XHRcdFx0Y29uc3QgaGlzdG9yeSA9IHRoaXMuZ2V0SGlzdG9yeShwcm92aWRlckxhYmVsLCB1cmkpO1xuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiBJdGVyYWJsZS5yZXZlcnNlKHJhd0hpc3RvcnkpKSB7XG5cdFx0XHRcdFx0XHRoaXN0b3J5LnByZXBlbmQodmFsdWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKF8gPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgV2lsbFNhdmVIaXN0b3J5RXZlbnQoKTtcblx0XHRcdHRoaXMuX29uV2lsbFNhdmVIaXN0b3J5LmZpcmUoZXZlbnQpO1xuXG5cdFx0XHRpZiAoZXZlbnQuZGlkQ2hhbmdlSGlzdG9yeSkge1xuXHRcdFx0XHR0aGlzLnNhdmVUb1N0b3JhZ2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVUb1N0b3JhZ2UoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3OiBbc3RyaW5nLCBVUkksIHN0cmluZ1tdXVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IFtwcm92aWRlckxhYmVsLCBwcm92aWRlckhpc3Rvcmllc10gb2YgdGhpcy5oaXN0b3JpZXMpIHtcblx0XHRcdGZvciAoY29uc3QgW3Jvb3RVcmksIGhpc3RvcnldIG9mIHByb3ZpZGVySGlzdG9yaWVzKSB7XG5cdFx0XHRcdGlmICghKGhpc3Rvcnkuc2l6ZSA9PT0gMSAmJiBoaXN0b3J5LmN1cnJlbnQoKSA9PT0gJycpKSB7XG5cdFx0XHRcdFx0cmF3LnB1c2goW3Byb3ZpZGVyTGFiZWwsIHJvb3RVcmksIFsuLi5oaXN0b3J5XV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSgnc2NtLmhpc3RvcnknLCByYXcsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRnZXRIaXN0b3J5KHByb3ZpZGVyTGFiZWw6IHN0cmluZywgcm9vdFVyaTogVVJJKTogSGlzdG9yeU5hdmlnYXRvcjI8c3RyaW5nPiB7XG5cdFx0bGV0IHByb3ZpZGVySGlzdG9yaWVzID0gdGhpcy5oaXN0b3JpZXMuZ2V0KHByb3ZpZGVyTGFiZWwpO1xuXG5cdFx0aWYgKCFwcm92aWRlckhpc3Rvcmllcykge1xuXHRcdFx0cHJvdmlkZXJIaXN0b3JpZXMgPSBuZXcgUmVzb3VyY2VNYXAoKTtcblx0XHRcdHRoaXMuaGlzdG9yaWVzLnNldChwcm92aWRlckxhYmVsLCBwcm92aWRlckhpc3Rvcmllcyk7XG5cdFx0fVxuXG5cdFx0bGV0IGhpc3RvcnkgPSBwcm92aWRlckhpc3Rvcmllcy5nZXQocm9vdFVyaSk7XG5cblx0XHRpZiAoIWhpc3RvcnkpIHtcblx0XHRcdGhpc3RvcnkgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcjIoWycnXSwgMTAwKTtcblx0XHRcdHByb3ZpZGVySGlzdG9yaWVzLnNldChyb290VXJpLCBoaXN0b3J5KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaGlzdG9yeTtcblx0fVxuXG5cdC8vIE1pZ3JhdGVzIGZyb20gQXBwbGljYXRpb24gc2NvcGUgc3RvcmFnZSB0byBXb3Jrc3BhY2Ugc2NvcGUuXG5cdC8vIFRPRE9Aam9hb21vcmVubzogQ2hhbmdlIGZyb20gSmFudWFyeSAyMDI0IG9ud2FyZHMgc3VjaCB0aGF0IHRoZSBvbmx5IGNvZGUgaXMgdG8gcmVtb3ZlIGFsbCBgc2NtL2lucHV0OmAgc3RvcmFnZSBrZXlzXG5cdHByaXZhdGUgbWlncmF0ZVN0b3JhZ2UoKTogYm9vbGVhbiB7XG5cdFx0bGV0IGRpZFNvbWV0aGluZ0NoYW5nZSA9IGZhbHNlO1xuXHRcdGNvbnN0IG1hY2hpbmVLZXlzID0gSXRlcmFibGUuZmlsdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uua2V5cyhTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSksIGtleSA9PiBrZXkuc3RhcnRzV2l0aCgnc2NtL2lucHV0OicpKTtcblxuXHRcdGZvciAoY29uc3Qga2V5IG9mIG1hY2hpbmVLZXlzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBsZWdhY3lIaXN0b3J5ID0gSlNPTi5wYXJzZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChrZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgJycpKTtcblx0XHRcdFx0Y29uc3QgbWF0Y2ggPSAvXnNjbVxcL2lucHV0OihbXjpdKyk6KC4rKSQvLmV4ZWMoa2V5KTtcblxuXHRcdFx0XHRpZiAoIW1hdGNoIHx8ICFBcnJheS5pc0FycmF5KGxlZ2FjeUhpc3Rvcnk/Lmhpc3RvcnkpIHx8ICFOdW1iZXIuaXNJbnRlZ2VyKGxlZ2FjeUhpc3Rvcnk/LnRpbWVzdGFtcCkpIHtcblx0XHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShrZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBbLCBwcm92aWRlckxhYmVsLCByb290UGF0aF0gPSBtYXRjaDtcblx0XHRcdFx0Y29uc3Qgcm9vdFVyaSA9IFVSSS5maWxlKHJvb3RQYXRoKTtcblxuXHRcdFx0XHRpZiAodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIocm9vdFVyaSkpIHtcblx0XHRcdFx0XHRjb25zdCBoaXN0b3J5ID0gdGhpcy5nZXRIaXN0b3J5KHByb3ZpZGVyTGFiZWwsIHJvb3RVcmkpO1xuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBJdGVyYWJsZS5yZXZlcnNlKGxlZ2FjeUhpc3RvcnkuaGlzdG9yeSBhcyBzdHJpbmdbXSkpIHtcblx0XHRcdFx0XHRcdGhpc3RvcnkucHJlcGVuZChlbnRyeSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0ZGlkU29tZXRoaW5nQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShrZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShrZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRpZFNvbWV0aGluZ0NoYW5nZTtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgU0NNU2VydmljZSBpbXBsZW1lbnRzIElTQ01TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRfcmVwb3NpdG9yaWVzID0gbmV3IE1hcDxzdHJpbmcsIElTQ01SZXBvc2l0b3J5PigpOyAgLy8gdXNlZCBpbiB0ZXN0c1xuXHRnZXQgcmVwb3NpdG9yaWVzKCk6IEl0ZXJhYmxlPElTQ01SZXBvc2l0b3J5PiB7IHJldHVybiB0aGlzLl9yZXBvc2l0b3JpZXMudmFsdWVzKCk7IH1cblx0Z2V0IHJlcG9zaXRvcnlDb3VudCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fcmVwb3NpdG9yaWVzLnNpemU7IH1cblxuXHRwcml2YXRlIGlucHV0SGlzdG9yeTogU0NNSW5wdXRIaXN0b3J5O1xuXHRwcml2YXRlIHByb3ZpZGVyQ291bnQ6IElDb250ZXh0S2V5PG51bWJlcj47XG5cdHByaXZhdGUgaGlzdG9yeVByb3ZpZGVyQ291bnQ6IElDb250ZXh0S2V5PG51bWJlcj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBZGRQcm92aWRlciA9IG5ldyBFbWl0dGVyPElTQ01SZXBvc2l0b3J5PigpO1xuXHRyZWFkb25seSBvbkRpZEFkZFJlcG9zaXRvcnk6IEV2ZW50PElTQ01SZXBvc2l0b3J5PiA9IHRoaXMuX29uRGlkQWRkUHJvdmlkZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW1vdmVQcm92aWRlciA9IG5ldyBFbWl0dGVyPElTQ01SZXBvc2l0b3J5PigpO1xuXHRyZWFkb25seSBvbkRpZFJlbW92ZVJlcG9zaXRvcnk6IEV2ZW50PElTQ01SZXBvc2l0b3J5PiA9IHRoaXMuX29uRGlkUmVtb3ZlUHJvdmlkZXIuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5pbnB1dEhpc3RvcnkgPSBuZXcgU0NNSW5wdXRIaXN0b3J5KHN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cblx0XHR0aGlzLnByb3ZpZGVyQ291bnQgPSBjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoJ3NjbS5wcm92aWRlckNvdW50JywgMCk7XG5cdFx0dGhpcy5oaXN0b3J5UHJvdmlkZXJDb3VudCA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleSgnc2NtLmhpc3RvcnlQcm92aWRlckNvdW50JywgMCk7XG5cdH1cblxuXHRyZWdpc3RlclNDTVByb3ZpZGVyKHByb3ZpZGVyOiBJU0NNUHJvdmlkZXIpOiBJU0NNUmVwb3NpdG9yeSB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdTQ01TZXJ2aWNlI3JlZ2lzdGVyU0NNUHJvdmlkZXInKTtcblxuXHRcdGlmICh0aGlzLl9yZXBvc2l0b3JpZXMuaGFzKHByb3ZpZGVyLmlkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTQ00gUHJvdmlkZXIgJHtwcm92aWRlci5pZH0gYWxyZWFkeSBleGlzdHMuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBoaXN0b3J5UHJvdmlkZXJDb3VudCA9ICgpID0+IHtcblx0XHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX3JlcG9zaXRvcmllcy52YWx1ZXMoKSlcblx0XHRcdFx0LmZpbHRlcihyID0+ICEhci5wcm92aWRlci5oaXN0b3J5UHJvdmlkZXIuZ2V0KCkpLmxlbmd0aDtcblx0XHR9O1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZXBvc2l0b3JpZXMuZGVsZXRlKHByb3ZpZGVyLmlkKTtcblx0XHRcdHRoaXMuX29uRGlkUmVtb3ZlUHJvdmlkZXIuZmlyZShyZXBvc2l0b3J5KTtcblxuXHRcdFx0dGhpcy5wcm92aWRlckNvdW50LnNldCh0aGlzLl9yZXBvc2l0b3JpZXMuc2l6ZSk7XG5cdFx0XHR0aGlzLmhpc3RvcnlQcm92aWRlckNvdW50LnNldChoaXN0b3J5UHJvdmlkZXJDb3VudCgpKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCByZXBvc2l0b3J5ID0gbmV3IFNDTVJlcG9zaXRvcnkocHJvdmlkZXIuaWQsIHByb3ZpZGVyLCBkaXNwb3NhYmxlcywgdGhpcy5pbnB1dEhpc3RvcnkpO1xuXHRcdHRoaXMuX3JlcG9zaXRvcmllcy5zZXQocHJvdmlkZXIuaWQsIHJlcG9zaXRvcnkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJ1bk9uQ2hhbmdlKHByb3ZpZGVyLmhpc3RvcnlQcm92aWRlciwgKCkgPT4ge1xuXHRcdFx0dGhpcy5oaXN0b3J5UHJvdmlkZXJDb3VudC5zZXQoaGlzdG9yeVByb3ZpZGVyQ291bnQoKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5wcm92aWRlckNvdW50LnNldCh0aGlzLl9yZXBvc2l0b3JpZXMuc2l6ZSk7XG5cdFx0dGhpcy5oaXN0b3J5UHJvdmlkZXJDb3VudC5zZXQoaGlzdG9yeVByb3ZpZGVyQ291bnQoKSk7XG5cblx0XHR0aGlzLl9vbkRpZEFkZFByb3ZpZGVyLmZpcmUocmVwb3NpdG9yeSk7XG5cblx0XHRyZXR1cm4gcmVwb3NpdG9yeTtcblx0fVxuXG5cdGdldFJlcG9zaXRvcnkoaWQ6IHN0cmluZyk6IElTQ01SZXBvc2l0b3J5IHwgdW5kZWZpbmVkO1xuXHRnZXRSZXBvc2l0b3J5KHJlc291cmNlOiBVUkkpOiBJU0NNUmVwb3NpdG9yeSB8IHVuZGVmaW5lZDtcblx0Z2V0UmVwb3NpdG9yeShpZE9yUmVzb3VyY2U6IHN0cmluZyB8IFVSSSk6IElTQ01SZXBvc2l0b3J5IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodHlwZW9mIGlkT3JSZXNvdXJjZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZXBvc2l0b3JpZXMuZ2V0KGlkT3JSZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlkT3JSZXNvdXJjZS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSAmJlxuXHRcdFx0aWRPclJlc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVSZW1vdGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IGJlc3RSZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgYmVzdE1hdGNoTGVuZ3RoID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXG5cdFx0Zm9yIChjb25zdCByZXBvc2l0b3J5IG9mIHRoaXMucmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRpZiAocmVwb3NpdG9yeS5wcm92aWRlci5pc0hpZGRlbiA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgcm9vdCA9IHJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaTtcblxuXHRcdFx0aWYgKCFyb290KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwYXRoID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLnJlbGF0aXZlUGF0aChyb290LCBpZE9yUmVzb3VyY2UpO1xuXG5cdFx0XHRpZiAocGF0aCAmJiAhL15cXC5cXC4vLnRlc3QocGF0aCkgJiYgcGF0aC5sZW5ndGggPCBiZXN0TWF0Y2hMZW5ndGgpIHtcblx0XHRcdFx0YmVzdFJlcG9zaXRvcnkgPSByZXBvc2l0b3J5O1xuXHRcdFx0XHRiZXN0TWF0Y2hMZW5ndGggPSBwYXRoLmxlbmd0aDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gYmVzdFJlcG9zaXRvcnk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBZ0IsZUFBZTtBQUMvQixTQUFzRyw0QkFBbUU7QUFDekssU0FBUyxtQkFBbUI7QUFDNUIsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGVBQWU7QUFDeEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQkFBbUI7QUFFNUIsTUFBTSxpQkFBaUIsV0FBZ0M7QUFBQSxFQTJGdEQsWUFDVSxZQUNRLFNBQ2hCO0FBQ0QsVUFBTTtBQUhHO0FBQ1E7QUEzRmxCLFNBQVEsU0FBUztBQU1qQixTQUFpQixlQUFlLEtBQUssVUFBVSxJQUFJLFFBQThCLENBQUM7QUFDbEYsU0FBUyxjQUEyQyxLQUFLLGFBQWE7QUFFdEUsU0FBUSxlQUFlO0FBV3ZCLFNBQWlCLDBCQUEwQixLQUFLLFVBQVUsSUFBSSxRQUFnQixDQUFDO0FBQy9FLFNBQVMseUJBQXdDLEtBQUssd0JBQXdCO0FBRTlFLFNBQVEsV0FBVztBQVduQixTQUFpQix5QkFBeUIsS0FBSyxVQUFVLElBQUksUUFBaUIsQ0FBQztBQUMvRSxTQUFTLHdCQUF3QyxLQUFLLHVCQUF1QjtBQUU3RSxTQUFRLFdBQVc7QUFXbkIsU0FBaUIseUJBQXlCLEtBQUssVUFBVSxJQUFJLFFBQWlCLENBQUM7QUFDL0UsU0FBUyx3QkFBd0MsS0FBSyx1QkFBdUI7QUFNN0UsU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUN2RSxTQUFTLG1CQUFnQyxLQUFLLGtCQUFrQjtBQU1oRSxTQUFpQixn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Q2xDLFdBQUssY0FBYyxPQUFPLFNBQVMsRUFBRTtBQUNyQyxXQUFLLHFCQUFxQixLQUFLLFVBQVU7QUFFekMsV0FBSyxjQUFjLElBQUksS0FBSyxjQUFjLElBQUk7QUFDOUMsV0FBSyxxQkFBcUIsSUFBSSxxQkFBcUIsQ0FBQztBQUFBLElBQ3JELENBQUMsQ0FBQztBQUVGLFVBQU0sYUFBYSxJQUFJLGNBQWMsU0FBUyxJQUFJLFVBQVUsYUFBYSxLQUFLLFlBQVk7QUFDMUYsU0FBSyxjQUFjLElBQUksU0FBUyxJQUFJLFVBQVU7QUFFOUMsZ0JBQVksSUFBSSxZQUFZLFNBQVMsaUJBQWlCLE1BQU07QUFDM0QsV0FBSyxxQkFBcUIsSUFBSSxxQkFBcUIsQ0FBQztBQUFBLElBQ3JELENBQUMsQ0FBQztBQUVGLFNBQUssY0FBYyxJQUFJLEtBQUssY0FBYyxJQUFJO0FBQzlDLFNBQUsscUJBQXFCLElBQUkscUJBQXFCLENBQUM7QUFFcEQsU0FBSyxrQkFBa0IsS0FBSyxVQUFVO0FBRXRDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFJQSxjQUFjLGNBQXdEO0FBQ3JFLFFBQUksT0FBTyxpQkFBaUIsVUFBVTtBQUNyQyxhQUFPLEtBQUssY0FBYyxJQUFJLFlBQVk7QUFBQSxJQUMzQztBQUVBLFFBQUksYUFBYSxXQUFXLFFBQVEsUUFDbkMsYUFBYSxXQUFXLFFBQVEsY0FBYztBQUM5QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksaUJBQTZDO0FBQ2pELFFBQUksa0JBQWtCLE9BQU87QUFFN0IsZUFBVyxjQUFjLEtBQUssY0FBYztBQUMzQyxVQUFJLFdBQVcsU0FBUyxhQUFhLE1BQU07QUFDMUM7QUFBQSxNQUNEO0FBRUEsWUFBTSxPQUFPLFdBQVcsU0FBUztBQUVqQyxVQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsTUFDRDtBQUVBLFlBQU0sT0FBTyxLQUFLLG1CQUFtQixPQUFPLGFBQWEsTUFBTSxZQUFZO0FBRTNFLFVBQUksUUFBUSxDQUFDLFFBQVEsS0FBSyxJQUFJLEtBQUssS0FBSyxTQUFTLGlCQUFpQjtBQUNqRSx5QkFBaUI7QUFDakIsMEJBQWtCLEtBQUs7QUFBQSxNQUN4QjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBeEdhLGFBQU47QUFBQSxFQW1CSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXZCVTsiLAogICJuYW1lcyI6IFtdCn0K
