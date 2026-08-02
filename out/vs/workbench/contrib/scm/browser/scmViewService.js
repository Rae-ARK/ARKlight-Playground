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
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { ISCMViewService, ISCMService, ISCMRepositorySortKey, ISCMRepositorySelectionMode } from "../common/scm.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { SCMMenus } from "./menus.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { debounce } from "../../../../base/common/decorators.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { compareFileNames, comparePaths } from "../../../../base/common/comparers.js";
import { basename } from "../../../../base/common/resources.js";
import { binarySearch } from "../../../../base/common/arrays.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { autorun, derived, derivedObservableWithCache, derivedOpts, latestChangedValue, observableFromEventOpts, observableValue, runOnChange } from "../../../../base/common/observable.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { EditorResourceAccessor } from "../../../common/editor.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { getSCMRepositoryIcon } from "./util.js";
function getProviderStorageKey(provider) {
  return `${provider.providerId}:${provider.label}${provider.rootUri ? `:${provider.rootUri.toString()}` : ""}`;
}
function getRepositoryName(workspaceContextService, repository) {
  if (!repository.provider.rootUri) {
    return repository.provider.label;
  }
  const folder = workspaceContextService.getWorkspaceFolder(repository.provider.rootUri);
  return folder?.uri.toString() === repository.provider.rootUri.toString() ? folder.name : basename(repository.provider.rootUri);
}
const RepositoryContextKeys = {
  RepositorySortKey: new RawContextKey("scmRepositorySortKey", ISCMRepositorySortKey.DiscoveryTime),
  RepositorySelectionMode: new RawContextKey("scmRepositorySelectionMode", ISCMRepositorySelectionMode.Single)
};
let RepositoryPicker = class {
  constructor(_placeHolder, _autoQuickItemDescription, _quickInputService, _scmViewService) {
    this._placeHolder = _placeHolder;
    this._autoQuickItemDescription = _autoQuickItemDescription;
    this._quickInputService = _quickInputService;
    this._scmViewService = _scmViewService;
    this._autoQuickPickItem = {
      label: localize("auto", "Auto"),
      description: this._autoQuickItemDescription,
      repository: "auto"
    };
  }
  async pickRepository() {
    const picks = [
      this._autoQuickPickItem,
      { type: "separator" }
    ];
    const activeRepository = this._scmViewService.activeRepository.get();
    const repository = activeRepository?.repository;
    const pinned = activeRepository?.pinned === true;
    picks.push(...this._scmViewService.repositories.map((r) => {
      const icon = getSCMRepositoryIcon(activeRepository, r);
      return {
        label: r.provider.name,
        description: r.provider.rootUri?.fsPath,
        iconClass: ThemeIcon.asClassName(icon),
        repository: r
      };
    }));
    const activeItem = pinned ? picks.find((p) => p.type !== "separator" && p.repository === repository) : this._autoQuickPickItem;
    return this._quickInputService.pick(picks, { placeHolder: this._placeHolder, activeItem });
  }
};
RepositoryPicker = __decorateClass([
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, ISCMViewService)
], RepositoryPicker);
let SCMViewService = class {
  constructor(scmService, contextKeyService, editorService, extensionService, instantiationService, configurationService, storageService, workspaceContextService) {
    this.scmService = scmService;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.storageService = storageService;
    this.workspaceContextService = workspaceContextService;
    this.didSelectRepository = false;
    this.disposables = new DisposableStore();
    this._repositories = [];
    this.didFinishLoadingRepositories = observableValue(this, false);
    this._onDidChangeRepositories = new Emitter();
    this.onDidChangeRepositories = this._onDidChangeRepositories.event;
    this._onDidSetVisibleRepositories = new Emitter();
    this.onDidChangeVisibleRepositories = Event.any(
      this._onDidSetVisibleRepositories.event,
      Event.debounce(
        this._onDidChangeRepositories.event,
        (last, e) => {
          if (!last) {
            return e;
          }
          const added = new Set(last.added);
          const removed = new Set(last.removed);
          for (const repository of e.added) {
            if (!removed.delete(repository)) {
              added.add(repository);
            }
          }
          for (const repository of e.removed) {
            if (!added.delete(repository)) {
              removed.add(repository);
            }
          }
          return { added, removed };
        },
        0,
        void 0,
        void 0,
        void 0,
        this.disposables
      )
    );
    this._onDidFocusRepository = new Emitter();
    this.onDidFocusRepository = this._onDidFocusRepository.event;
    this.menus = instantiationService.createInstance(SCMMenus);
    const explorerEnabledConfig = observableConfigValue("scm.repositories.explorer", false, this.configurationService);
    this.graphShowIncomingChangesConfig = observableConfigValue("scm.graph.showIncomingChanges", true, this.configurationService);
    this.graphShowOutgoingChangesConfig = observableConfigValue("scm.graph.showOutgoingChanges", true, this.configurationService);
    this.selectionModeConfig = observableConfigValue("scm.repositories.selectionMode", ISCMRepositorySelectionMode.Multiple, this.configurationService);
    this.explorerEnabledConfig = derived((reader) => {
      return explorerEnabledConfig.read(reader) === true && this.selectionModeConfig.read(reader) === ISCMRepositorySelectionMode.Single;
    });
    try {
      this.previousState = JSON.parse(storageService.get("scm:view:visibleRepositories", StorageScope.WORKSPACE, ""));
      if (this.previousState && this.previousState.visible.length > 1 && this.selectionModeConfig.get() === ISCMRepositorySelectionMode.Single) {
        this.previousState = {
          ...this.previousState,
          visible: [this.previousState.visible[0]]
        };
      }
    } catch {
    }
    this._focusedRepositoryObs = observableFromEventOpts(
      {
        owner: this,
        equalsFn: () => false
      },
      this.onDidFocusRepository,
      () => this.focusedRepository
    );
    this._activeEditorObs = observableFromEventOpts({
      owner: this,
      equalsFn: () => false
    }, this.editorService.onDidActiveEditorChange, () => this.editorService.activeEditor);
    this._activeEditorRepositoryObs = derivedObservableWithCache(
      this,
      (reader, lastValue) => {
        const activeEditor = this._activeEditorObs.read(reader);
        const activeResource = EditorResourceAccessor.getOriginalUri(activeEditor);
        if (!activeResource) {
          return lastValue;
        }
        const repository = this.scmService.getRepository(activeResource);
        if (!repository) {
          return lastValue;
        }
        return Object.create(repository);
      }
    );
    this._activeRepositoryPinnedObs = observableValue(this, void 0);
    this._activeRepositoryObs = latestChangedValue(this, [this._activeEditorRepositoryObs, this._focusedRepositoryObs]);
    this.activeRepository = derivedOpts({
      owner: this,
      equalsFn: (r1, r2) => r1?.repository.id === r2?.repository.id && r1?.pinned === r2?.pinned
    }, (reader) => {
      const activeRepository = this._activeRepositoryObs.read(reader);
      const activeRepositoryPinned = this._activeRepositoryPinnedObs.read(reader);
      const repository = activeRepositoryPinned ?? activeRepository;
      const pinned = !!activeRepositoryPinned;
      return repository ? { repository, pinned } : void 0;
    });
    this.disposables.add(runOnChange(this.selectionModeConfig, (selectionMode) => {
      if (selectionMode === ISCMRepositorySelectionMode.Single && this.visibleRepositories.length > 1) {
        const repository = this.visibleRepositories[0];
        this.visibleRepositories = [repository];
      } else if (selectionMode === ISCMRepositorySelectionMode.Multiple && this.repositories.length > 1) {
        this.visibleRepositories = this.repositories;
      }
    }));
    this._repositoriesSortKey = this.previousState?.sortKey ?? this.getViewSortOrder();
    this._sortKeyContextKey = RepositoryContextKeys.RepositorySortKey.bindTo(contextKeyService);
    this._sortKeyContextKey.set(this._repositoriesSortKey);
    this._selectionModelContextKey = RepositoryContextKeys.RepositorySelectionMode.bindTo(contextKeyService);
    this.disposables.add(autorun((reader) => {
      const selectionMode = this.selectionModeConfig.read(reader);
      this._selectionModelContextKey.set(selectionMode);
    }));
    scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);
    scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.disposables);
    for (const repository of scmService.repositories) {
      this.onDidAddRepository(repository);
    }
    storageService.onWillSaveState(this.onWillSaveState, this, this.disposables);
    extensionService.onWillStop(() => {
      this.onWillSaveState();
      this.didFinishLoadingRepositories.set(false, void 0);
    }, this, this.disposables);
  }
  get repositories() {
    return this._repositories.filter((r) => r.repository.provider.isHidden !== true).map((r) => r.repository);
  }
  get visibleRepositories() {
    if (this._repositoriesSortKey === ISCMRepositorySortKey.DiscoveryTime) {
      return this._repositories.filter((r) => r.repository.provider.isHidden !== true && r.selectionIndex !== -1).sort((r1, r2) => r1.selectionIndex - r2.selectionIndex).map((r) => r.repository);
    }
    return this._repositories.filter((r) => r.repository.provider.isHidden !== true && r.selectionIndex !== -1).map((r) => r.repository);
  }
  set visibleRepositories(visibleRepositories) {
    const set = new Set(visibleRepositories);
    const added = /* @__PURE__ */ new Set();
    const removed = /* @__PURE__ */ new Set();
    for (const repositoryView of this._repositories) {
      if (!set.has(repositoryView.repository) && repositoryView.selectionIndex !== -1) {
        repositoryView.selectionIndex = -1;
        removed.add(repositoryView.repository);
      }
      if (set.has(repositoryView.repository)) {
        if (repositoryView.selectionIndex === -1) {
          added.add(repositoryView.repository);
        }
        repositoryView.selectionIndex = visibleRepositories.indexOf(repositoryView.repository);
      }
    }
    if (added.size === 0 && removed.size === 0) {
      return;
    }
    this._onDidSetVisibleRepositories.fire({ added, removed });
    if (this._repositories.find((r) => r.focused && r.selectionIndex === -1)) {
      this.focus(this._repositories.find((r) => r.selectionIndex !== -1)?.repository);
    }
  }
  get focusedRepository() {
    return this._repositories.find((r) => r.focused)?.repository;
  }
  onDidAddRepository(repository) {
    if (!this.didFinishLoadingRepositories.get()) {
      this.eventuallyFinishLoading();
    }
    const repositoryView = {
      repository,
      discoveryTime: Date.now(),
      focused: false,
      selectionIndex: -1
    };
    let removed = Iterable.empty();
    if (this.previousState && !this.didFinishLoadingRepositories.get()) {
      const index = this.previousState.all.indexOf(getProviderStorageKey(repository.provider));
      if (index === -1) {
        const added = [];
        this.insertRepositoryView(this._repositories, repositoryView);
        if (this.selectionModeConfig.get() === ISCMRepositorySelectionMode.Multiple || !this._repositories.find((r) => r.selectionIndex !== -1)) {
          this._repositories.forEach((repositoryView2, index2) => {
            if (repositoryView2.selectionIndex === -1) {
              added.push(repositoryView2.repository);
            }
            repositoryView2.selectionIndex = index2;
          });
          this._onDidChangeRepositories.fire({ added, removed: Iterable.empty() });
        }
        this.didSelectRepository = false;
        return;
      }
      if (this.previousState.visible.indexOf(index) === -1) {
        if (this.didSelectRepository) {
          this.insertRepositoryView(this._repositories, repositoryView);
          this._onDidChangeRepositories.fire({ added: Iterable.empty(), removed: Iterable.empty() });
          return;
        }
      } else {
        if (!this.didSelectRepository) {
          removed = [...this.visibleRepositories];
          this._repositories.forEach((r) => {
            r.focused = false;
            r.selectionIndex = -1;
          });
          this.didSelectRepository = true;
        }
      }
    }
    if (this.selectionModeConfig.get() === ISCMRepositorySelectionMode.Multiple || !this._repositories.find((r) => r.selectionIndex !== -1)) {
      const maxSelectionIndex = this.getMaxSelectionIndex();
      this.insertRepositoryView(this._repositories, { ...repositoryView, selectionIndex: maxSelectionIndex + 1 });
      this._onDidChangeRepositories.fire({ added: [repositoryView.repository], removed });
    } else {
      this.insertRepositoryView(this._repositories, repositoryView);
      this._onDidChangeRepositories.fire({ added: Iterable.empty(), removed });
    }
    if (!this._repositories.find((r) => r.focused)) {
      this.focus(repository);
    }
  }
  onDidRemoveRepository(repository) {
    if (!this.didFinishLoadingRepositories.get()) {
      this.eventuallyFinishLoading();
    }
    const repositoriesIndex = this._repositories.findIndex((r) => r.repository === repository);
    if (repositoriesIndex === -1) {
      return;
    }
    let added = Iterable.empty();
    const removed = this._repositories.splice(repositoriesIndex, 1);
    if (this._repositories.length > 0 && this.visibleRepositories.length === 0) {
      this._repositories[0].selectionIndex = 0;
      added = [this._repositories[0].repository];
    }
    this._onDidChangeRepositories.fire({ added, removed: removed.map((r) => r.repository) });
    if (removed.length === 1 && removed[0].focused && this.visibleRepositories.length > 0) {
      this.focus(this.visibleRepositories[0]);
    }
    if (removed.length === 1 && this._repositories.length === 0) {
      this._onDidFocusRepository.fire(void 0);
    }
    if (removed.length === 1 && removed[0].repository === this._activeRepositoryPinnedObs.get()) {
      this._activeRepositoryPinnedObs.set(void 0, void 0);
    }
  }
  isVisible(repository) {
    return this._repositories.find((r) => r.repository === repository)?.selectionIndex !== -1;
  }
  toggleVisibility(repository, visible) {
    if (typeof visible === "undefined") {
      visible = !this.isVisible(repository);
    } else if (this.isVisible(repository) === visible) {
      return;
    }
    if (visible) {
      if (this.selectionModeConfig.get() === ISCMRepositorySelectionMode.Single) {
        this.visibleRepositories = [repository];
      } else if (this.selectionModeConfig.get() === ISCMRepositorySelectionMode.Multiple) {
        this.visibleRepositories = [...this.visibleRepositories, repository];
      }
    } else {
      const index = this.visibleRepositories.indexOf(repository);
      if (index > -1) {
        this.visibleRepositories = [
          ...this.visibleRepositories.slice(0, index),
          ...this.visibleRepositories.slice(index + 1)
        ];
      }
    }
  }
  toggleSortKey(sortKey) {
    this._repositoriesSortKey = sortKey;
    this._sortKeyContextKey.set(this._repositoriesSortKey);
    this._repositories.sort(this.compareRepositories.bind(this));
    this._onDidChangeRepositories.fire({ added: Iterable.empty(), removed: Iterable.empty() });
  }
  toggleSelectionMode(selectionMode) {
    this.configurationService.updateValue("scm.repositories.selectionMode", selectionMode);
  }
  focus(repository) {
    if (repository && !this.isVisible(repository)) {
      return;
    }
    this._repositories.forEach((r) => r.focused = r.repository === repository);
    if (this._repositories.find((r) => r.focused)) {
      this._onDidFocusRepository.fire(repository);
    }
  }
  pinActiveRepository(repository) {
    this._activeRepositoryPinnedObs.set(repository, void 0);
  }
  compareRepositories(op1, op2) {
    if (this._repositoriesSortKey === ISCMRepositorySortKey.DiscoveryTime) {
      return op1.discoveryTime - op2.discoveryTime;
    }
    if (this._repositoriesSortKey === "path" && op1.repository.provider.rootUri && op2.repository.provider.rootUri) {
      return comparePaths(op1.repository.provider.rootUri.fsPath, op2.repository.provider.rootUri.fsPath);
    }
    const name1 = getRepositoryName(this.workspaceContextService, op1.repository);
    const name2 = getRepositoryName(this.workspaceContextService, op2.repository);
    const nameComparison = compareFileNames(name1, name2);
    if (nameComparison === 0 && op1.repository.provider.rootUri && op2.repository.provider.rootUri) {
      return comparePaths(op1.repository.provider.rootUri.fsPath, op2.repository.provider.rootUri.fsPath);
    }
    return nameComparison;
  }
  getMaxSelectionIndex() {
    return this._repositories.length === 0 ? -1 : Math.max(...this._repositories.map((r) => r.selectionIndex));
  }
  getViewSortOrder() {
    const sortOder = this.configurationService.getValue("scm.repositories.sortOrder");
    switch (sortOder) {
      case "discovery time":
        return ISCMRepositorySortKey.DiscoveryTime;
      case "name":
        return ISCMRepositorySortKey.Name;
      case "path":
        return ISCMRepositorySortKey.Path;
      default:
        return ISCMRepositorySortKey.DiscoveryTime;
    }
  }
  insertRepositoryView(repositories, repositoryView) {
    const index = binarySearch(repositories, repositoryView, this.compareRepositories.bind(this));
    repositories.splice(index < 0 ? ~index : index, 0, repositoryView);
  }
  onWillSaveState() {
    if (!this.didFinishLoadingRepositories.get()) {
      return;
    }
    const all = this.repositories.map((r) => getProviderStorageKey(r.provider));
    const visible = this.visibleRepositories.map((r) => all.indexOf(getProviderStorageKey(r.provider)));
    this.previousState = { all, visible, sortKey: this._repositoriesSortKey };
    this.storageService.store("scm:view:visibleRepositories", JSON.stringify(this.previousState), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  eventuallyFinishLoading() {
    this.finishLoading();
  }
  finishLoading() {
    if (this.didFinishLoadingRepositories.get()) {
      return;
    }
    this.didFinishLoadingRepositories.set(true, void 0);
  }
  dispose() {
    this.disposables.dispose();
    this._onDidFocusRepository.dispose();
    this._onDidChangeRepositories.dispose();
    this._onDidSetVisibleRepositories.dispose();
  }
};
__decorateClass([
  debounce(5e3)
], SCMViewService.prototype, "eventuallyFinishLoading", 1);
SCMViewService = __decorateClass([
  __decorateParam(0, ISCMService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IWorkspaceContextService)
], SCMViewService);
export {
  RepositoryContextKeys,
  RepositoryPicker,
  SCMViewService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9icm93c2VyL3NjbVZpZXdTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVNDTVZpZXdTZXJ2aWNlLCBJU0NNUmVwb3NpdG9yeSwgSVNDTVNlcnZpY2UsIElTQ01WaWV3VmlzaWJsZVJlcG9zaXRvcnlDaGFuZ2VFdmVudCwgSVNDTU1lbnVzLCBJU0NNUHJvdmlkZXIsIElTQ01SZXBvc2l0b3J5U29ydEtleSwgSVNDTVJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlIH0gZnJvbSAnLi4vY29tbW9uL3NjbS5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU0NNTWVudXMgfSBmcm9tICcuL21lbnVzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBkZWJvdW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgY29tcGFyZUZpbGVOYW1lcywgY29tcGFyZVBhdGhzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29tcGFyZXJzLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGJpbmFyeVNlYXJjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZSwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBsYXRlc3RDaGFuZ2VkVmFsdWUsIG9ic2VydmFibGVGcm9tRXZlbnRPcHRzLCBvYnNlcnZhYmxlVmFsdWUsIHJ1bk9uQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IGdldFNDTVJlcG9zaXRvcnlJY29uIH0gZnJvbSAnLi91dGlsLmpzJztcblxuZnVuY3Rpb24gZ2V0UHJvdmlkZXJTdG9yYWdlS2V5KHByb3ZpZGVyOiBJU0NNUHJvdmlkZXIpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7cHJvdmlkZXIucHJvdmlkZXJJZH06JHtwcm92aWRlci5sYWJlbH0ke3Byb3ZpZGVyLnJvb3RVcmkgPyBgOiR7cHJvdmlkZXIucm9vdFVyaS50b1N0cmluZygpfWAgOiAnJ31gO1xufVxuXG5mdW5jdGlvbiBnZXRSZXBvc2l0b3J5TmFtZSh3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCByZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSk6IHN0cmluZyB7XG5cdGlmICghcmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpKSB7XG5cdFx0cmV0dXJuIHJlcG9zaXRvcnkucHJvdmlkZXIubGFiZWw7XG5cdH1cblxuXHRjb25zdCBmb2xkZXIgPSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIocmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpKTtcblx0cmV0dXJuIGZvbGRlcj8udXJpLnRvU3RyaW5nKCkgPT09IHJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaS50b1N0cmluZygpID8gZm9sZGVyLm5hbWUgOiBiYXNlbmFtZShyZXBvc2l0b3J5LnByb3ZpZGVyLnJvb3RVcmkpO1xufVxuXG5leHBvcnQgY29uc3QgUmVwb3NpdG9yeUNvbnRleHRLZXlzID0ge1xuXHRSZXBvc2l0b3J5U29ydEtleTogbmV3IFJhd0NvbnRleHRLZXk8SVNDTVJlcG9zaXRvcnlTb3J0S2V5Pignc2NtUmVwb3NpdG9yeVNvcnRLZXknLCBJU0NNUmVwb3NpdG9yeVNvcnRLZXkuRGlzY292ZXJ5VGltZSksXG5cdFJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlOiBuZXcgUmF3Q29udGV4dEtleTxJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGU+KCdzY21SZXBvc2l0b3J5U2VsZWN0aW9uTW9kZScsIElTQ01SZXBvc2l0b3J5U2VsZWN0aW9uTW9kZS5TaW5nbGUpLFxufTtcblxuZXhwb3J0IHR5cGUgUmVwb3NpdG9yeVF1aWNrUGlja0l0ZW0gPSBJUXVpY2tQaWNrSXRlbSAmIHsgcmVwb3NpdG9yeTogJ2F1dG8nIHwgSVNDTVJlcG9zaXRvcnkgfTtcblxuZXhwb3J0IGNsYXNzIFJlcG9zaXRvcnlQaWNrZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXRvUXVpY2tQaWNrSXRlbTogUmVwb3NpdG9yeVF1aWNrUGlja0l0ZW07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcGxhY2VIb2xkZXI6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hdXRvUXVpY2tJdGVtRGVzY3JpcHRpb246IHN0cmluZyxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElTQ01WaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zY21WaWV3U2VydmljZTogSVNDTVZpZXdTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2F1dG9RdWlja1BpY2tJdGVtID0ge1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhdXRvJywgXCJBdXRvXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuX2F1dG9RdWlja0l0ZW1EZXNjcmlwdGlvbixcblx0XHRcdHJlcG9zaXRvcnk6ICdhdXRvJ1xuXHRcdH0gc2F0aXNmaWVzIFJlcG9zaXRvcnlRdWlja1BpY2tJdGVtO1xuXHR9XG5cblx0YXN5bmMgcGlja1JlcG9zaXRvcnkoKTogUHJvbWlzZTxSZXBvc2l0b3J5UXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBpY2tzOiAoUmVwb3NpdG9yeVF1aWNrUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0gW1xuXHRcdFx0dGhpcy5fYXV0b1F1aWNrUGlja0l0ZW0sXG5cdFx0XHR7IHR5cGU6ICdzZXBhcmF0b3InIH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0aXZlUmVwb3NpdG9yeSA9IHRoaXMuX3NjbVZpZXdTZXJ2aWNlLmFjdGl2ZVJlcG9zaXRvcnkuZ2V0KCk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IGFjdGl2ZVJlcG9zaXRvcnk/LnJlcG9zaXRvcnk7XG5cdFx0Y29uc3QgcGlubmVkID0gYWN0aXZlUmVwb3NpdG9yeT8ucGlubmVkID09PSB0cnVlO1xuXG5cdFx0cGlja3MucHVzaCguLi50aGlzLl9zY21WaWV3U2VydmljZS5yZXBvc2l0b3JpZXMubWFwKHIgPT4ge1xuXHRcdFx0Y29uc3QgaWNvbiA9IGdldFNDTVJlcG9zaXRvcnlJY29uKGFjdGl2ZVJlcG9zaXRvcnksIHIpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogci5wcm92aWRlci5uYW1lLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogci5wcm92aWRlci5yb290VXJpPy5mc1BhdGgsXG5cdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pLFxuXHRcdFx0XHRyZXBvc2l0b3J5OiByXG5cdFx0XHR9O1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGFjdGl2ZUl0ZW0gPSBwaW5uZWRcblx0XHRcdD8gcGlja3MuZmluZChwID0+IHAudHlwZSAhPT0gJ3NlcGFyYXRvcicgJiYgcC5yZXBvc2l0b3J5ID09PSByZXBvc2l0b3J5KSBhcyBSZXBvc2l0b3J5UXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZFxuXHRcdFx0OiB0aGlzLl9hdXRvUXVpY2tQaWNrSXRlbTtcblxuXHRcdHJldHVybiB0aGlzLl9xdWlja0lucHV0U2VydmljZS5waWNrKHBpY2tzLCB7IHBsYWNlSG9sZGVyOiB0aGlzLl9wbGFjZUhvbGRlciwgYWN0aXZlSXRlbSB9KTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVNDTVJlcG9zaXRvcnlWaWV3IHtcblx0cmVhZG9ubHkgcmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnk7XG5cdHJlYWRvbmx5IGRpc2NvdmVyeVRpbWU6IG51bWJlcjtcblx0Zm9jdXNlZDogYm9vbGVhbjtcblx0c2VsZWN0aW9uSW5kZXg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU0NNVmlld1NlcnZpY2VTdGF0ZSB7XG5cdHJlYWRvbmx5IGFsbDogc3RyaW5nW107XG5cdHJlYWRvbmx5IHZpc2libGU6IG51bWJlcltdO1xuXHRyZWFkb25seSBzb3J0S2V5OiBJU0NNUmVwb3NpdG9yeVNvcnRLZXk7XG59XG5cbmV4cG9ydCBjbGFzcyBTQ01WaWV3U2VydmljZSBpbXBsZW1lbnRzIElTQ01WaWV3U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgbWVudXM6IElTQ01NZW51cztcblx0cmVhZG9ubHkgZXhwbG9yZXJFbmFibGVkQ29uZmlnOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgc2VsZWN0aW9uTW9kZUNvbmZpZzogSU9ic2VydmFibGU8SVNDTVJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlPjtcblx0cmVhZG9ubHkgZ3JhcGhTaG93SW5jb21pbmdDaGFuZ2VzQ29uZmlnOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgZ3JhcGhTaG93T3V0Z29pbmdDaGFuZ2VzQ29uZmlnOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRwcml2YXRlIGRpZFNlbGVjdFJlcG9zaXRvcnk6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBwcmV2aW91c1N0YXRlOiBJU0NNVmlld1NlcnZpY2VTdGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIF9yZXBvc2l0b3JpZXM6IElTQ01SZXBvc2l0b3J5Vmlld1tdID0gW107XG5cblx0Z2V0IHJlcG9zaXRvcmllcygpOiBJU0NNUmVwb3NpdG9yeVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVwb3NpdG9yaWVzXG5cdFx0XHQuZmlsdGVyKHIgPT4gci5yZXBvc2l0b3J5LnByb3ZpZGVyLmlzSGlkZGVuICE9PSB0cnVlKVxuXHRcdFx0Lm1hcChyID0+IHIucmVwb3NpdG9yeSk7XG5cdH1cblxuXHRyZWFkb25seSBkaWRGaW5pc2hMb2FkaW5nUmVwb3NpdG9yaWVzID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KHRoaXMsIGZhbHNlKTtcblxuXHRnZXQgdmlzaWJsZVJlcG9zaXRvcmllcygpOiBJU0NNUmVwb3NpdG9yeVtdIHtcblx0XHQvLyBJbiBvcmRlciB0byBtYXRjaCB0aGUgbGVnYWN5IGJlaGF2aW91ciwgd2hlbiB0aGUgcmVwb3NpdG9yaWVzIGFyZSBzb3J0ZWQgYnkgZGlzY292ZXJ5IHRpbWUsXG5cdFx0Ly8gdGhlIHZpc2libGUgcmVwb3NpdG9yaWVzIGFyZSBzb3J0ZWQgYnkgdGhlIHNlbGVjdGlvbiBpbmRleCBpbnN0ZWFkIG9mIHRoZSBkaXNjb3ZlcnkgdGltZS5cblx0XHRpZiAodGhpcy5fcmVwb3NpdG9yaWVzU29ydEtleSA9PT0gSVNDTVJlcG9zaXRvcnlTb3J0S2V5LkRpc2NvdmVyeVRpbWUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZXBvc2l0b3JpZXNcblx0XHRcdFx0LmZpbHRlcihyID0+IHIucmVwb3NpdG9yeS5wcm92aWRlci5pc0hpZGRlbiAhPT0gdHJ1ZSAmJiByLnNlbGVjdGlvbkluZGV4ICE9PSAtMSlcblx0XHRcdFx0LnNvcnQoKHIxLCByMikgPT4gcjEuc2VsZWN0aW9uSW5kZXggLSByMi5zZWxlY3Rpb25JbmRleClcblx0XHRcdFx0Lm1hcChyID0+IHIucmVwb3NpdG9yeSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3JlcG9zaXRvcmllc1xuXHRcdFx0LmZpbHRlcihyID0+IHIucmVwb3NpdG9yeS5wcm92aWRlci5pc0hpZGRlbiAhPT0gdHJ1ZSAmJiByLnNlbGVjdGlvbkluZGV4ICE9PSAtMSlcblx0XHRcdC5tYXAociA9PiByLnJlcG9zaXRvcnkpO1xuXHR9XG5cblx0c2V0IHZpc2libGVSZXBvc2l0b3JpZXModmlzaWJsZVJlcG9zaXRvcmllczogSVNDTVJlcG9zaXRvcnlbXSkge1xuXHRcdGNvbnN0IHNldCA9IG5ldyBTZXQodmlzaWJsZVJlcG9zaXRvcmllcyk7XG5cdFx0Y29uc3QgYWRkZWQgPSBuZXcgU2V0PElTQ01SZXBvc2l0b3J5PigpO1xuXHRcdGNvbnN0IHJlbW92ZWQgPSBuZXcgU2V0PElTQ01SZXBvc2l0b3J5PigpO1xuXG5cdFx0Zm9yIChjb25zdCByZXBvc2l0b3J5VmlldyBvZiB0aGlzLl9yZXBvc2l0b3JpZXMpIHtcblx0XHRcdC8vIFNlbGVjdGVkIC0+ICFTZWxlY3RlZFxuXHRcdFx0aWYgKCFzZXQuaGFzKHJlcG9zaXRvcnlWaWV3LnJlcG9zaXRvcnkpICYmIHJlcG9zaXRvcnlWaWV3LnNlbGVjdGlvbkluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRyZXBvc2l0b3J5Vmlldy5zZWxlY3Rpb25JbmRleCA9IC0xO1xuXHRcdFx0XHRyZW1vdmVkLmFkZChyZXBvc2l0b3J5Vmlldy5yZXBvc2l0b3J5KTtcblx0XHRcdH1cblx0XHRcdC8vIFNlbGVjdGVkIHwgIVNlbGVjdGVkIC0+IFNlbGVjdGVkXG5cdFx0XHRpZiAoc2V0LmhhcyhyZXBvc2l0b3J5Vmlldy5yZXBvc2l0b3J5KSkge1xuXHRcdFx0XHRpZiAocmVwb3NpdG9yeVZpZXcuc2VsZWN0aW9uSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0YWRkZWQuYWRkKHJlcG9zaXRvcnlWaWV3LnJlcG9zaXRvcnkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlcG9zaXRvcnlWaWV3LnNlbGVjdGlvbkluZGV4ID0gdmlzaWJsZVJlcG9zaXRvcmllcy5pbmRleE9mKHJlcG9zaXRvcnlWaWV3LnJlcG9zaXRvcnkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChhZGRlZC5zaXplID09PSAwICYmIHJlbW92ZWQuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkU2V0VmlzaWJsZVJlcG9zaXRvcmllcy5maXJlKHsgYWRkZWQsIHJlbW92ZWQgfSk7XG5cblx0XHQvLyBVcGRhdGUgZm9jdXMgaWYgdGhlIGZvY3VzZWQgcmVwb3NpdG9yeSBpcyBub3QgdmlzaWJsZSBhbnltb3JlXG5cdFx0aWYgKHRoaXMuX3JlcG9zaXRvcmllcy5maW5kKHIgPT4gci5mb2N1c2VkICYmIHIuc2VsZWN0aW9uSW5kZXggPT09IC0xKSkge1xuXHRcdFx0dGhpcy5mb2N1cyh0aGlzLl9yZXBvc2l0b3JpZXMuZmluZChyID0+IHIuc2VsZWN0aW9uSW5kZXggIT09IC0xKT8ucmVwb3NpdG9yeSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VSZXBvc2l0b3JpZXMgPSBuZXcgRW1pdHRlcjxJU0NNVmlld1Zpc2libGVSZXBvc2l0b3J5Q2hhbmdlRXZlbnQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVwb3NpdG9yaWVzID0gdGhpcy5fb25EaWRDaGFuZ2VSZXBvc2l0b3JpZXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRTZXRWaXNpYmxlUmVwb3NpdG9yaWVzID0gbmV3IEVtaXR0ZXI8SVNDTVZpZXdWaXNpYmxlUmVwb3NpdG9yeUNoYW5nZUV2ZW50PigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2libGVSZXBvc2l0b3JpZXMgPSBFdmVudC5hbnkoXG5cdFx0dGhpcy5fb25EaWRTZXRWaXNpYmxlUmVwb3NpdG9yaWVzLmV2ZW50LFxuXHRcdEV2ZW50LmRlYm91bmNlKFxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSZXBvc2l0b3JpZXMuZXZlbnQsXG5cdFx0XHQobGFzdCwgZSkgPT4ge1xuXHRcdFx0XHRpZiAoIWxhc3QpIHtcblx0XHRcdFx0XHRyZXR1cm4gZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGFkZGVkID0gbmV3IFNldChsYXN0LmFkZGVkKTtcblx0XHRcdFx0Y29uc3QgcmVtb3ZlZCA9IG5ldyBTZXQobGFzdC5yZW1vdmVkKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgZS5hZGRlZCkge1xuXHRcdFx0XHRcdGlmICghcmVtb3ZlZC5kZWxldGUocmVwb3NpdG9yeSkpIHtcblx0XHRcdFx0XHRcdGFkZGVkLmFkZChyZXBvc2l0b3J5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCByZXBvc2l0b3J5IG9mIGUucmVtb3ZlZCkge1xuXHRcdFx0XHRcdGlmICghYWRkZWQuZGVsZXRlKHJlcG9zaXRvcnkpKSB7XG5cdFx0XHRcdFx0XHRyZW1vdmVkLmFkZChyZXBvc2l0b3J5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4geyBhZGRlZCwgcmVtb3ZlZCB9O1xuXHRcdFx0fSwgMCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5kaXNwb3NhYmxlcylcblx0KTtcblxuXHRnZXQgZm9jdXNlZFJlcG9zaXRvcnkoKTogSVNDTVJlcG9zaXRvcnkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZXBvc2l0b3JpZXMuZmluZChyID0+IHIuZm9jdXNlZCk/LnJlcG9zaXRvcnk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZEZvY3VzUmVwb3NpdG9yeSA9IG5ldyBFbWl0dGVyPElTQ01SZXBvc2l0b3J5IHwgdW5kZWZpbmVkPigpO1xuXHRyZWFkb25seSBvbkRpZEZvY3VzUmVwb3NpdG9yeSA9IHRoaXMuX29uRGlkRm9jdXNSZXBvc2l0b3J5LmV2ZW50O1xuXG5cdHJlYWRvbmx5IGFjdGl2ZVJlcG9zaXRvcnk6IElPYnNlcnZhYmxlPHsgcmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnk7IHBpbm5lZDogYm9vbGVhbiB9IHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlRWRpdG9yT2JzOiBJT2JzZXJ2YWJsZTxFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUVkaXRvclJlcG9zaXRvcnlPYnM6IElPYnNlcnZhYmxlPElTQ01SZXBvc2l0b3J5IHwgdW5kZWZpbmVkPjtcblxuXHQvKipcblx0KiBUaGUgZm9jdXNlZCByZXBvc2l0b3J5IHRha2VzIHByZWNlZGVuY2Ugb3ZlciB0aGUgYWN0aXZlIGVkaXRvciByZXBvc2l0b3J5IHdoZW4gdGhlIG9ic2VydmFibGVcblx0KiB2YWx1ZXMgYXJlIHVwZGF0ZWQgaW4gdGhlIHNhbWUgdHJhbnNhY3Rpb24gKG9yIGR1cmluZyB0aGUgaW5pdGlhbCByZWFkIG9mIHRoZSBvYnNlcnZhYmxlIHZhbHVlKS5cblx0Ki9cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlUmVwb3NpdG9yeU9iczogSU9ic2VydmFibGU8SVNDTVJlcG9zaXRvcnkgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVSZXBvc2l0b3J5UGlubmVkT2JzOiBJU2V0dGFibGVPYnNlcnZhYmxlPElTQ01SZXBvc2l0b3J5IHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZm9jdXNlZFJlcG9zaXRvcnlPYnM6IElPYnNlcnZhYmxlPElTQ01SZXBvc2l0b3J5IHwgdW5kZWZpbmVkPjtcblxuXHRwcml2YXRlIF9yZXBvc2l0b3JpZXNTb3J0S2V5OiBJU0NNUmVwb3NpdG9yeVNvcnRLZXk7XG5cdHByaXZhdGUgX3NvcnRLZXlDb250ZXh0S2V5OiBJQ29udGV4dEtleTxJU0NNUmVwb3NpdG9yeVNvcnRLZXk+O1xuXG5cdHByaXZhdGUgX3NlbGVjdGlvbk1vZGVsQ29udGV4dEtleTogSUNvbnRleHRLZXk8SVNDTVJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVNDTVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzY21TZXJ2aWNlOiBJU0NNU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZVxuXHQpIHtcblx0XHR0aGlzLm1lbnVzID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU0NNTWVudXMpO1xuXG5cdFx0Y29uc3QgZXhwbG9yZXJFbmFibGVkQ29uZmlnID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlPGJvb2xlYW4+KCdzY20ucmVwb3NpdG9yaWVzLmV4cGxvcmVyJywgZmFsc2UsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuZ3JhcGhTaG93SW5jb21pbmdDaGFuZ2VzQ29uZmlnID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlPGJvb2xlYW4+KCdzY20uZ3JhcGguc2hvd0luY29taW5nQ2hhbmdlcycsIHRydWUsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuZ3JhcGhTaG93T3V0Z29pbmdDaGFuZ2VzQ29uZmlnID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlPGJvb2xlYW4+KCdzY20uZ3JhcGguc2hvd091dGdvaW5nQ2hhbmdlcycsIHRydWUsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuc2VsZWN0aW9uTW9kZUNvbmZpZyA9IG9ic2VydmFibGVDb25maWdWYWx1ZTxJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGU+KCdzY20ucmVwb3NpdG9yaWVzLnNlbGVjdGlvbk1vZGUnLCBJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGUuTXVsdGlwbGUsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuZXhwbG9yZXJFbmFibGVkQ29uZmlnID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIGV4cGxvcmVyRW5hYmxlZENvbmZpZy5yZWFkKHJlYWRlcikgPT09IHRydWUgJiYgdGhpcy5zZWxlY3Rpb25Nb2RlQ29uZmlnLnJlYWQocmVhZGVyKSA9PT0gSVNDTVJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlLlNpbmdsZTtcblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnByZXZpb3VzU3RhdGUgPSBKU09OLnBhcnNlKHN0b3JhZ2VTZXJ2aWNlLmdldCgnc2NtOnZpZXc6dmlzaWJsZVJlcG9zaXRvcmllcycsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsICcnKSk7XG5cblx0XHRcdC8vIElmIHByZXZpb3VzbHkgdGhlcmUgd2VyZSBtdWx0aXBsZSB2aXNpYmxlIHJlcG9zaXRvcmllcyBidXQgdGhlXG5cdFx0XHQvLyB2aWV3IG1vZGUgaXMgYHNpbmdsZWAsIG9ubHkgcmVzdG9yZSB0aGUgZmlyc3QgdmlzaWJsZSByZXBvc2l0b3J5LlxuXHRcdFx0aWYgKHRoaXMucHJldmlvdXNTdGF0ZSAmJiB0aGlzLnByZXZpb3VzU3RhdGUudmlzaWJsZS5sZW5ndGggPiAxICYmIHRoaXMuc2VsZWN0aW9uTW9kZUNvbmZpZy5nZXQoKSA9PT0gSVNDTVJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlLlNpbmdsZSkge1xuXHRcdFx0XHR0aGlzLnByZXZpb3VzU3RhdGUgPSB7XG5cdFx0XHRcdFx0Li4udGhpcy5wcmV2aW91c1N0YXRlLFxuXHRcdFx0XHRcdHZpc2libGU6IFt0aGlzLnByZXZpb3VzU3RhdGUudmlzaWJsZVswXV1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIG5vb3Bcblx0XHR9XG5cblx0XHR0aGlzLl9mb2N1c2VkUmVwb3NpdG9yeU9icyA9IG9ic2VydmFibGVGcm9tRXZlbnRPcHRzPElTQ01SZXBvc2l0b3J5IHwgdW5kZWZpbmVkPihcblx0XHRcdHtcblx0XHRcdFx0b3duZXI6IHRoaXMsXG5cdFx0XHRcdGVxdWFsc0ZuOiAoKSA9PiBmYWxzZVxuXHRcdFx0fSwgdGhpcy5vbkRpZEZvY3VzUmVwb3NpdG9yeSwgKCkgPT4gdGhpcy5mb2N1c2VkUmVwb3NpdG9yeSk7XG5cblx0XHR0aGlzLl9hY3RpdmVFZGl0b3JPYnMgPSBvYnNlcnZhYmxlRnJvbUV2ZW50T3B0cyh7XG5cdFx0XHRvd25lcjogdGhpcyxcblx0XHRcdGVxdWFsc0ZuOiAoKSA9PiBmYWxzZVxuXHRcdH0sIHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSwgKCkgPT4gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcik7XG5cblx0XHR0aGlzLl9hY3RpdmVFZGl0b3JSZXBvc2l0b3J5T2JzID0gZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGU8SVNDTVJlcG9zaXRvcnkgfCB1bmRlZmluZWQ+KHRoaXMsXG5cdFx0XHQocmVhZGVyLCBsYXN0VmFsdWUpID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gdGhpcy5fYWN0aXZlRWRpdG9yT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgYWN0aXZlUmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGFjdGl2ZUVkaXRvcik7XG5cdFx0XHRcdGlmICghYWN0aXZlUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gbGFzdFZhbHVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuc2NtU2VydmljZS5nZXRSZXBvc2l0b3J5KGFjdGl2ZVJlc291cmNlKTtcblx0XHRcdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxhc3RWYWx1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBPYmplY3QuY3JlYXRlKHJlcG9zaXRvcnkpO1xuXHRcdFx0fSk7XG5cblx0XHR0aGlzLl9hY3RpdmVSZXBvc2l0b3J5UGlubmVkT2JzID0gb2JzZXJ2YWJsZVZhbHVlPElTQ01SZXBvc2l0b3J5IHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2FjdGl2ZVJlcG9zaXRvcnlPYnMgPSBsYXRlc3RDaGFuZ2VkVmFsdWUodGhpcywgW3RoaXMuX2FjdGl2ZUVkaXRvclJlcG9zaXRvcnlPYnMsIHRoaXMuX2ZvY3VzZWRSZXBvc2l0b3J5T2JzXSk7XG5cblx0XHR0aGlzLmFjdGl2ZVJlcG9zaXRvcnkgPSBkZXJpdmVkT3B0czx7IHJlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5OyBwaW5uZWQ6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZD4oe1xuXHRcdFx0b3duZXI6IHRoaXMsXG5cdFx0XHRlcXVhbHNGbjogKHIxLCByMikgPT4gcjE/LnJlcG9zaXRvcnkuaWQgPT09IHIyPy5yZXBvc2l0b3J5LmlkICYmIHIxPy5waW5uZWQgPT09IHIyPy5waW5uZWRcblx0XHR9LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlUmVwb3NpdG9yeSA9IHRoaXMuX2FjdGl2ZVJlcG9zaXRvcnlPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYWN0aXZlUmVwb3NpdG9yeVBpbm5lZCA9IHRoaXMuX2FjdGl2ZVJlcG9zaXRvcnlQaW5uZWRPYnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCByZXBvc2l0b3J5ID0gYWN0aXZlUmVwb3NpdG9yeVBpbm5lZCA/PyBhY3RpdmVSZXBvc2l0b3J5O1xuXHRcdFx0Y29uc3QgcGlubmVkID0gISFhY3RpdmVSZXBvc2l0b3J5UGlubmVkO1xuXG5cdFx0XHRyZXR1cm4gcmVwb3NpdG9yeSA/IHsgcmVwb3NpdG9yeSwgcGlubmVkIH0gOiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChydW5PbkNoYW5nZSh0aGlzLnNlbGVjdGlvbk1vZGVDb25maWcsIHNlbGVjdGlvbk1vZGUgPT4ge1xuXHRcdFx0aWYgKHNlbGVjdGlvbk1vZGUgPT09IElTQ01SZXBvc2l0b3J5U2VsZWN0aW9uTW9kZS5TaW5nbGUgJiYgdGhpcy52aXNpYmxlUmVwb3NpdG9yaWVzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMudmlzaWJsZVJlcG9zaXRvcmllc1swXTtcblx0XHRcdFx0dGhpcy52aXNpYmxlUmVwb3NpdG9yaWVzID0gW3JlcG9zaXRvcnldO1xuXHRcdFx0fSBlbHNlIGlmIChzZWxlY3Rpb25Nb2RlID09PSBJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGUuTXVsdGlwbGUgJiYgdGhpcy5yZXBvc2l0b3JpZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHR0aGlzLnZpc2libGVSZXBvc2l0b3JpZXMgPSB0aGlzLnJlcG9zaXRvcmllcztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZXBvc2l0b3JpZXNTb3J0S2V5ID0gdGhpcy5wcmV2aW91c1N0YXRlPy5zb3J0S2V5ID8/IHRoaXMuZ2V0Vmlld1NvcnRPcmRlcigpO1xuXHRcdHRoaXMuX3NvcnRLZXlDb250ZXh0S2V5ID0gUmVwb3NpdG9yeUNvbnRleHRLZXlzLlJlcG9zaXRvcnlTb3J0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fc29ydEtleUNvbnRleHRLZXkuc2V0KHRoaXMuX3JlcG9zaXRvcmllc1NvcnRLZXkpO1xuXG5cdFx0dGhpcy5fc2VsZWN0aW9uTW9kZWxDb250ZXh0S2V5ID0gUmVwb3NpdG9yeUNvbnRleHRLZXlzLlJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uTW9kZSA9IHRoaXMuc2VsZWN0aW9uTW9kZUNvbmZpZy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9zZWxlY3Rpb25Nb2RlbENvbnRleHRLZXkuc2V0KHNlbGVjdGlvbk1vZGUpO1xuXHRcdH0pKTtcblxuXHRcdHNjbVNlcnZpY2Uub25EaWRBZGRSZXBvc2l0b3J5KHRoaXMub25EaWRBZGRSZXBvc2l0b3J5LCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHRzY21TZXJ2aWNlLm9uRGlkUmVtb3ZlUmVwb3NpdG9yeSh0aGlzLm9uRGlkUmVtb3ZlUmVwb3NpdG9yeSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cblx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2Ygc2NtU2VydmljZS5yZXBvc2l0b3JpZXMpIHtcblx0XHRcdHRoaXMub25EaWRBZGRSZXBvc2l0b3J5KHJlcG9zaXRvcnkpO1xuXHRcdH1cblxuXHRcdHN0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZSh0aGlzLm9uV2lsbFNhdmVTdGF0ZSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cblx0XHQvLyBNYWludGFpbiByZXBvc2l0b3J5IHNlbGVjdGlvbiB3aGVuIHRoZSBleHRlbnNpb24gaG9zdCByZXN0YXJ0cy5cblx0XHQvLyBFeHRlbnNpb24gaG9zdCBpcyByZXN0YXJ0ZWQgYWZ0ZXIgaW5zdGFsbGluZyBhbiBleHRlbnNpb24gdXBkYXRlXG5cdFx0Ly8gb3IgZHVyaW5nIGEgcHJvZmlsZSBzd2l0Y2guXG5cdFx0ZXh0ZW5zaW9uU2VydmljZS5vbldpbGxTdG9wKCgpID0+IHtcblx0XHRcdHRoaXMub25XaWxsU2F2ZVN0YXRlKCk7XG5cdFx0XHR0aGlzLmRpZEZpbmlzaExvYWRpbmdSZXBvc2l0b3JpZXMuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdH0sIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZEFkZFJlcG9zaXRvcnkocmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnkpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZGlkRmluaXNoTG9hZGluZ1JlcG9zaXRvcmllcy5nZXQoKSkge1xuXHRcdFx0dGhpcy5ldmVudHVhbGx5RmluaXNoTG9hZGluZygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcG9zaXRvcnlWaWV3ID0ge1xuXHRcdFx0cmVwb3NpdG9yeSwgZGlzY292ZXJ5VGltZTogRGF0ZS5ub3coKSwgZm9jdXNlZDogZmFsc2UsIHNlbGVjdGlvbkluZGV4OiAtMVxuXHRcdH0gc2F0aXNmaWVzIElTQ01SZXBvc2l0b3J5VmlldztcblxuXHRcdGxldCByZW1vdmVkOiBJdGVyYWJsZTxJU0NNUmVwb3NpdG9yeT4gPSBJdGVyYWJsZS5lbXB0eSgpO1xuXG5cdFx0aWYgKHRoaXMucHJldmlvdXNTdGF0ZSAmJiAhdGhpcy5kaWRGaW5pc2hMb2FkaW5nUmVwb3NpdG9yaWVzLmdldCgpKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMucHJldmlvdXNTdGF0ZS5hbGwuaW5kZXhPZihnZXRQcm92aWRlclN0b3JhZ2VLZXkocmVwb3NpdG9yeS5wcm92aWRlcikpO1xuXG5cdFx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdC8vIFRoaXMgcmVwb3NpdG9yeSBpcyBub3QgcGFydCBvZiB0aGUgcHJldmlvdXMgc3RhdGUgd2hpY2ggbWVhbnMgdGhhdCBpdFxuXHRcdFx0XHQvLyB3YXMgZWl0aGVyIG1hbnVhbGx5IGNsb3NlZCBpbiB0aGUgcHJldmlvdXMgc2Vzc2lvbiwgb3IgdGhlIHJlcG9zaXRvcnlcblx0XHRcdFx0Ly8gd2FzIGFkZGVkIGFmdGVyIHRoZSBwcmV2aW91cyBzZXNzaW9uLiBJbiB0aGlzIGNhc2UsIHdlIHNob3VsZCBzZWxlY3Rcblx0XHRcdFx0Ly8gYWxsIG9mIHRoZSByZXBvc2l0b3JpZXMuXG5cdFx0XHRcdGNvbnN0IGFkZGVkOiBJU0NNUmVwb3NpdG9yeVtdID0gW107XG5cblx0XHRcdFx0dGhpcy5pbnNlcnRSZXBvc2l0b3J5Vmlldyh0aGlzLl9yZXBvc2l0b3JpZXMsIHJlcG9zaXRvcnlWaWV3KTtcblxuXHRcdFx0XHRpZiAodGhpcy5zZWxlY3Rpb25Nb2RlQ29uZmlnLmdldCgpID09PSBJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGUuTXVsdGlwbGUgfHwgIXRoaXMuX3JlcG9zaXRvcmllcy5maW5kKHIgPT4gci5zZWxlY3Rpb25JbmRleCAhPT0gLTEpKSB7XG5cdFx0XHRcdFx0Ly8gTXVsdGlwbGUgc2VsZWN0aW9uIG1vZGUgb3Igc2luZ2xlIHNlbGVjdGlvbiBtb2RlIChzZWxlY3QgZmlyc3QgcmVwb3NpdG9yeSlcblx0XHRcdFx0XHR0aGlzLl9yZXBvc2l0b3JpZXMuZm9yRWFjaCgocmVwb3NpdG9yeVZpZXcsIGluZGV4KSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAocmVwb3NpdG9yeVZpZXcuc2VsZWN0aW9uSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRcdGFkZGVkLnB1c2gocmVwb3NpdG9yeVZpZXcucmVwb3NpdG9yeSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXBvc2l0b3J5Vmlldy5zZWxlY3Rpb25JbmRleCA9IGluZGV4O1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSZXBvc2l0b3JpZXMuZmlyZSh7IGFkZGVkLCByZW1vdmVkOiBJdGVyYWJsZS5lbXB0eSgpIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5kaWRTZWxlY3RSZXBvc2l0b3J5ID0gZmFsc2U7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMucHJldmlvdXNTdGF0ZS52aXNpYmxlLmluZGV4T2YoaW5kZXgpID09PSAtMSkge1xuXHRcdFx0XHQvLyBFeHBsaWNpdCBzZWxlY3Rpb24gc3RhcnRlZFxuXHRcdFx0XHRpZiAodGhpcy5kaWRTZWxlY3RSZXBvc2l0b3J5KSB7XG5cdFx0XHRcdFx0dGhpcy5pbnNlcnRSZXBvc2l0b3J5Vmlldyh0aGlzLl9yZXBvc2l0b3JpZXMsIHJlcG9zaXRvcnlWaWV3KTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVJlcG9zaXRvcmllcy5maXJlKHsgYWRkZWQ6IEl0ZXJhYmxlLmVtcHR5KCksIHJlbW92ZWQ6IEl0ZXJhYmxlLmVtcHR5KCkgfSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBGaXJzdCB2aXNpYmxlIHJlcG9zaXRvcnlcblx0XHRcdFx0aWYgKCF0aGlzLmRpZFNlbGVjdFJlcG9zaXRvcnkpIHtcblx0XHRcdFx0XHRyZW1vdmVkID0gWy4uLnRoaXMudmlzaWJsZVJlcG9zaXRvcmllc107XG5cdFx0XHRcdFx0dGhpcy5fcmVwb3NpdG9yaWVzLmZvckVhY2gociA9PiB7XG5cdFx0XHRcdFx0XHRyLmZvY3VzZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdHIuc2VsZWN0aW9uSW5kZXggPSAtMTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdHRoaXMuZGlkU2VsZWN0UmVwb3NpdG9yeSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5zZWxlY3Rpb25Nb2RlQ29uZmlnLmdldCgpID09PSBJU0NNUmVwb3NpdG9yeVNlbGVjdGlvbk1vZGUuTXVsdGlwbGUgfHwgIXRoaXMuX3JlcG9zaXRvcmllcy5maW5kKHIgPT4gci5zZWxlY3Rpb25JbmRleCAhPT0gLTEpKSB7XG5cdFx0XHQvLyBNdWx0aXBsZSBzZWxlY3Rpb24gbW9kZSBvciBzaW5nbGUgc2VsZWN0aW9uIG1vZGUgKHNlbGVjdCBmaXJzdCByZXBvc2l0b3J5KVxuXHRcdFx0Y29uc3QgbWF4U2VsZWN0aW9uSW5kZXggPSB0aGlzLmdldE1heFNlbGVjdGlvbkluZGV4KCk7XG5cdFx0XHR0aGlzLmluc2VydFJlcG9zaXRvcnlWaWV3KHRoaXMuX3JlcG9zaXRvcmllcywgeyAuLi5yZXBvc2l0b3J5Vmlldywgc2VsZWN0aW9uSW5kZXg6IG1heFNlbGVjdGlvbkluZGV4ICsgMSB9KTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVwb3NpdG9yaWVzLmZpcmUoeyBhZGRlZDogW3JlcG9zaXRvcnlWaWV3LnJlcG9zaXRvcnldLCByZW1vdmVkIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBTaW5nbGUgc2VsZWN0aW9uIG1vZGUgKGFkZCBzdWJzZXF1ZW50IHJlcG9zaXRvcnkpXG5cdFx0XHR0aGlzLmluc2VydFJlcG9zaXRvcnlWaWV3KHRoaXMuX3JlcG9zaXRvcmllcywgcmVwb3NpdG9yeVZpZXcpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSZXBvc2l0b3JpZXMuZmlyZSh7IGFkZGVkOiBJdGVyYWJsZS5lbXB0eSgpLCByZW1vdmVkIH0pO1xuXHRcdH1cblxuXHRcdC8vIEZvY3VzIHJlcG9zaXRvcnkgaWYgbm90aGluZyBpcyBmb2N1c2VkXG5cdFx0aWYgKCF0aGlzLl9yZXBvc2l0b3JpZXMuZmluZChyID0+IHIuZm9jdXNlZCkpIHtcblx0XHRcdHRoaXMuZm9jdXMocmVwb3NpdG9yeSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFJlbW92ZVJlcG9zaXRvcnkocmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnkpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZGlkRmluaXNoTG9hZGluZ1JlcG9zaXRvcmllcy5nZXQoKSkge1xuXHRcdFx0dGhpcy5ldmVudHVhbGx5RmluaXNoTG9hZGluZygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcG9zaXRvcmllc0luZGV4ID0gdGhpcy5fcmVwb3NpdG9yaWVzLmZpbmRJbmRleChyID0+IHIucmVwb3NpdG9yeSA9PT0gcmVwb3NpdG9yeSk7XG5cblx0XHRpZiAocmVwb3NpdG9yaWVzSW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGFkZGVkOiBJdGVyYWJsZTxJU0NNUmVwb3NpdG9yeT4gPSBJdGVyYWJsZS5lbXB0eSgpO1xuXHRcdGNvbnN0IHJlbW92ZWQgPSB0aGlzLl9yZXBvc2l0b3JpZXMuc3BsaWNlKHJlcG9zaXRvcmllc0luZGV4LCAxKTtcblxuXHRcdGlmICh0aGlzLl9yZXBvc2l0b3JpZXMubGVuZ3RoID4gMCAmJiB0aGlzLnZpc2libGVSZXBvc2l0b3JpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9yZXBvc2l0b3JpZXNbMF0uc2VsZWN0aW9uSW5kZXggPSAwO1xuXHRcdFx0YWRkZWQgPSBbdGhpcy5fcmVwb3NpdG9yaWVzWzBdLnJlcG9zaXRvcnldO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVwb3NpdG9yaWVzLmZpcmUoeyBhZGRlZCwgcmVtb3ZlZDogcmVtb3ZlZC5tYXAociA9PiByLnJlcG9zaXRvcnkpIH0pO1xuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIGZvY3VzZWQgcmVwb3NpdG9yeSB3YXMgcmVtb3ZlZFxuXHRcdGlmIChyZW1vdmVkLmxlbmd0aCA9PT0gMSAmJiByZW1vdmVkWzBdLmZvY3VzZWQgJiYgdGhpcy52aXNpYmxlUmVwb3NpdG9yaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuZm9jdXModGhpcy52aXNpYmxlUmVwb3NpdG9yaWVzWzBdKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiB0aGUgbGFzdCByZXBvc2l0b3J5IHdhcyByZW1vdmVkXG5cdFx0aWYgKHJlbW92ZWQubGVuZ3RoID09PSAxICYmIHRoaXMuX3JlcG9zaXRvcmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX29uRGlkRm9jdXNSZXBvc2l0b3J5LmZpcmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiB0aGUgcGlubmVkIHJlcG9zaXRvcnkgd2FzIHJlbW92ZWRcblx0XHRpZiAocmVtb3ZlZC5sZW5ndGggPT09IDEgJiYgcmVtb3ZlZFswXS5yZXBvc2l0b3J5ID09PSB0aGlzLl9hY3RpdmVSZXBvc2l0b3J5UGlubmVkT2JzLmdldCgpKSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVSZXBvc2l0b3J5UGlubmVkT2JzLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0aXNWaXNpYmxlKHJlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcG9zaXRvcmllcy5maW5kKHIgPT4gci5yZXBvc2l0b3J5ID09PSByZXBvc2l0b3J5KT8uc2VsZWN0aW9uSW5kZXggIT09IC0xO1xuXHR9XG5cblx0dG9nZ2xlVmlzaWJpbGl0eShyZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSwgdmlzaWJsZT86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIHZpc2libGUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR2aXNpYmxlID0gIXRoaXMuaXNWaXNpYmxlKHJlcG9zaXRvcnkpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5pc1Zpc2libGUocmVwb3NpdG9yeSkgPT09IHZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0aWYgKHRoaXMuc2VsZWN0aW9uTW9kZUNvbmZpZy5nZXQoKSA9PT0gSVNDTVJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlLlNpbmdsZSkge1xuXHRcdFx0XHR0aGlzLnZpc2libGVSZXBvc2l0b3JpZXMgPSBbcmVwb3NpdG9yeV07XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuc2VsZWN0aW9uTW9kZUNvbmZpZy5nZXQoKSA9PT0gSVNDTVJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlLk11bHRpcGxlKSB7XG5cdFx0XHRcdHRoaXMudmlzaWJsZVJlcG9zaXRvcmllcyA9IFsuLi50aGlzLnZpc2libGVSZXBvc2l0b3JpZXMsIHJlcG9zaXRvcnldO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMudmlzaWJsZVJlcG9zaXRvcmllcy5pbmRleE9mKHJlcG9zaXRvcnkpO1xuXG5cdFx0XHRpZiAoaW5kZXggPiAtMSkge1xuXHRcdFx0XHR0aGlzLnZpc2libGVSZXBvc2l0b3JpZXMgPSBbXG5cdFx0XHRcdFx0Li4udGhpcy52aXNpYmxlUmVwb3NpdG9yaWVzLnNsaWNlKDAsIGluZGV4KSxcblx0XHRcdFx0XHQuLi50aGlzLnZpc2libGVSZXBvc2l0b3JpZXMuc2xpY2UoaW5kZXggKyAxKVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHRvZ2dsZVNvcnRLZXkoc29ydEtleTogSVNDTVJlcG9zaXRvcnlTb3J0S2V5KTogdm9pZCB7XG5cdFx0dGhpcy5fcmVwb3NpdG9yaWVzU29ydEtleSA9IHNvcnRLZXk7XG5cdFx0dGhpcy5fc29ydEtleUNvbnRleHRLZXkuc2V0KHRoaXMuX3JlcG9zaXRvcmllc1NvcnRLZXkpO1xuXHRcdHRoaXMuX3JlcG9zaXRvcmllcy5zb3J0KHRoaXMuY29tcGFyZVJlcG9zaXRvcmllcy5iaW5kKHRoaXMpKTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVwb3NpdG9yaWVzLmZpcmUoeyBhZGRlZDogSXRlcmFibGUuZW1wdHkoKSwgcmVtb3ZlZDogSXRlcmFibGUuZW1wdHkoKSB9KTtcblx0fVxuXG5cdHRvZ2dsZVNlbGVjdGlvbk1vZGUoc2VsZWN0aW9uTW9kZTogJ211bHRpcGxlJyB8ICdzaW5nbGUnKTogdm9pZCB7XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnc2NtLnJlcG9zaXRvcmllcy5zZWxlY3Rpb25Nb2RlJywgc2VsZWN0aW9uTW9kZSk7XG5cdH1cblxuXHRmb2N1cyhyZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChyZXBvc2l0b3J5ICYmICF0aGlzLmlzVmlzaWJsZShyZXBvc2l0b3J5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlcG9zaXRvcmllcy5mb3JFYWNoKHIgPT4gci5mb2N1c2VkID0gci5yZXBvc2l0b3J5ID09PSByZXBvc2l0b3J5KTtcblxuXHRcdGlmICh0aGlzLl9yZXBvc2l0b3JpZXMuZmluZChyID0+IHIuZm9jdXNlZCkpIHtcblx0XHRcdHRoaXMuX29uRGlkRm9jdXNSZXBvc2l0b3J5LmZpcmUocmVwb3NpdG9yeSk7XG5cdFx0fVxuXHR9XG5cblx0cGluQWN0aXZlUmVwb3NpdG9yeShyZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2ZVJlcG9zaXRvcnlQaW5uZWRPYnMuc2V0KHJlcG9zaXRvcnksIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbXBhcmVSZXBvc2l0b3JpZXMob3AxOiBJU0NNUmVwb3NpdG9yeVZpZXcsIG9wMjogSVNDTVJlcG9zaXRvcnlWaWV3KTogbnVtYmVyIHtcblx0XHQvLyBTb3J0IGJ5IGRpc2NvdmVyeSB0aW1lXG5cdFx0aWYgKHRoaXMuX3JlcG9zaXRvcmllc1NvcnRLZXkgPT09IElTQ01SZXBvc2l0b3J5U29ydEtleS5EaXNjb3ZlcnlUaW1lKSB7XG5cdFx0XHRyZXR1cm4gb3AxLmRpc2NvdmVyeVRpbWUgLSBvcDIuZGlzY292ZXJ5VGltZTtcblx0XHR9XG5cblx0XHQvLyBTb3J0IGJ5IHBhdGhcblx0XHRpZiAodGhpcy5fcmVwb3NpdG9yaWVzU29ydEtleSA9PT0gJ3BhdGgnICYmIG9wMS5yZXBvc2l0b3J5LnByb3ZpZGVyLnJvb3RVcmkgJiYgb3AyLnJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaSkge1xuXHRcdFx0cmV0dXJuIGNvbXBhcmVQYXRocyhvcDEucmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpLmZzUGF0aCwgb3AyLnJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaS5mc1BhdGgpO1xuXHRcdH1cblxuXHRcdC8vIFNvcnQgYnkgbmFtZSwgcGF0aFxuXHRcdGNvbnN0IG5hbWUxID0gZ2V0UmVwb3NpdG9yeU5hbWUodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZSwgb3AxLnJlcG9zaXRvcnkpO1xuXHRcdGNvbnN0IG5hbWUyID0gZ2V0UmVwb3NpdG9yeU5hbWUodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZSwgb3AyLnJlcG9zaXRvcnkpO1xuXG5cdFx0Y29uc3QgbmFtZUNvbXBhcmlzb24gPSBjb21wYXJlRmlsZU5hbWVzKG5hbWUxLCBuYW1lMik7XG5cdFx0aWYgKG5hbWVDb21wYXJpc29uID09PSAwICYmIG9wMS5yZXBvc2l0b3J5LnByb3ZpZGVyLnJvb3RVcmkgJiYgb3AyLnJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaSkge1xuXHRcdFx0cmV0dXJuIGNvbXBhcmVQYXRocyhvcDEucmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpLmZzUGF0aCwgb3AyLnJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaS5mc1BhdGgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuYW1lQ29tcGFyaXNvbjtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWF4U2VsZWN0aW9uSW5kZXgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVwb3NpdG9yaWVzLmxlbmd0aCA9PT0gMCA/IC0xIDpcblx0XHRcdE1hdGgubWF4KC4uLnRoaXMuX3JlcG9zaXRvcmllcy5tYXAociA9PiByLnNlbGVjdGlvbkluZGV4KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFZpZXdTb3J0T3JkZXIoKTogSVNDTVJlcG9zaXRvcnlTb3J0S2V5IHtcblx0XHRjb25zdCBzb3J0T2RlciA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J2Rpc2NvdmVyeSB0aW1lJyB8ICduYW1lJyB8ICdwYXRoJz4oJ3NjbS5yZXBvc2l0b3JpZXMuc29ydE9yZGVyJyk7XG5cdFx0c3dpdGNoIChzb3J0T2Rlcikge1xuXHRcdFx0Y2FzZSAnZGlzY292ZXJ5IHRpbWUnOlxuXHRcdFx0XHRyZXR1cm4gSVNDTVJlcG9zaXRvcnlTb3J0S2V5LkRpc2NvdmVyeVRpbWU7XG5cdFx0XHRjYXNlICduYW1lJzpcblx0XHRcdFx0cmV0dXJuIElTQ01SZXBvc2l0b3J5U29ydEtleS5OYW1lO1xuXHRcdFx0Y2FzZSAncGF0aCc6XG5cdFx0XHRcdHJldHVybiBJU0NNUmVwb3NpdG9yeVNvcnRLZXkuUGF0aDtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBJU0NNUmVwb3NpdG9yeVNvcnRLZXkuRGlzY292ZXJ5VGltZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluc2VydFJlcG9zaXRvcnlWaWV3KHJlcG9zaXRvcmllczogSVNDTVJlcG9zaXRvcnlWaWV3W10sIHJlcG9zaXRvcnlWaWV3OiBJU0NNUmVwb3NpdG9yeVZpZXcpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IGJpbmFyeVNlYXJjaChyZXBvc2l0b3JpZXMsIHJlcG9zaXRvcnlWaWV3LCB0aGlzLmNvbXBhcmVSZXBvc2l0b3JpZXMuYmluZCh0aGlzKSk7XG5cdFx0cmVwb3NpdG9yaWVzLnNwbGljZShpbmRleCA8IDAgPyB+aW5kZXggOiBpbmRleCwgMCwgcmVwb3NpdG9yeVZpZXcpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbldpbGxTYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmRpZEZpbmlzaExvYWRpbmdSZXBvc2l0b3JpZXMuZ2V0KCkpIHtcblx0XHRcdC8vIERvbid0IHJlbWVtYmVyIHN0YXRlLCBpZiB0aGUgd29ya2JlbmNoIGRpZG4ndCByZWFsbHkgZmluaXNoIGxvYWRpbmdcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhbGwgPSB0aGlzLnJlcG9zaXRvcmllcy5tYXAociA9PiBnZXRQcm92aWRlclN0b3JhZ2VLZXkoci5wcm92aWRlcikpO1xuXHRcdGNvbnN0IHZpc2libGUgPSB0aGlzLnZpc2libGVSZXBvc2l0b3JpZXMubWFwKHIgPT4gYWxsLmluZGV4T2YoZ2V0UHJvdmlkZXJTdG9yYWdlS2V5KHIucHJvdmlkZXIpKSk7XG5cdFx0dGhpcy5wcmV2aW91c1N0YXRlID0geyBhbGwsIHZpc2libGUsIHNvcnRLZXk6IHRoaXMuX3JlcG9zaXRvcmllc1NvcnRLZXkgfSBzYXRpc2ZpZXMgSVNDTVZpZXdTZXJ2aWNlU3RhdGU7XG5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdzY206dmlldzp2aXNpYmxlUmVwb3NpdG9yaWVzJywgSlNPTi5zdHJpbmdpZnkodGhpcy5wcmV2aW91c1N0YXRlKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdEBkZWJvdW5jZSg1MDAwKVxuXHRwcml2YXRlIGV2ZW50dWFsbHlGaW5pc2hMb2FkaW5nKCk6IHZvaWQge1xuXHRcdHRoaXMuZmluaXNoTG9hZGluZygpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5pc2hMb2FkaW5nKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRpZEZpbmlzaExvYWRpbmdSZXBvc2l0b3JpZXMuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmRpZEZpbmlzaExvYWRpbmdSZXBvc2l0b3JpZXMuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkRm9jdXNSZXBvc2l0b3J5LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVJlcG9zaXRvcmllcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRTZXRWaXNpYmxlUmVwb3NpdG9yaWVzLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7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
