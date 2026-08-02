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
import { localize } from "../../../../nls.js";
import { GroupActivationReason, GroupLocation, GroupsOrder, IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableMap, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { MainEditorPart } from "./editorPart.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { distinct } from "../../../../base/common/arrays.js";
import { AuxiliaryEditorPart } from "./auxiliaryEditorPart.js";
import { ModalEditorPart } from "./modalEditorPart.js";
import { MultiWindowParts } from "../../part.js";
import { DeferredPromise } from "../../../../base/common/async.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IAuxiliaryWindowService } from "../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { getActiveElement, isAncestor, isHTMLElement } from "../../../../base/browser/dom.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IStatusbarService } from "../../../services/statusbar/browser/statusbar.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { EditorPartModalVisibleContext } from "../../../common/contextkeys.js";
let EditorParts = class extends MultiWindowParts {
  constructor(instantiationService, storageService, themeService, auxiliaryWindowService, contextKeyService) {
    super("workbench.editorParts", themeService, storageService);
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.auxiliaryWindowService = auxiliaryWindowService;
    this.contextKeyService = contextKeyService;
    //#region Scoped Instantiation Services
    this.mapPartToInstantiationService = /* @__PURE__ */ new Map();
    //#endregion
    //#region Auxiliary Editor Parts
    this._onDidCreateAuxiliaryEditorPart = this._register(new Emitter());
    this.onDidCreateAuxiliaryEditorPart = this._onDidCreateAuxiliaryEditorPart.event;
    this.modalEditorMaximized = false;
    this.workspaceMemento = this.getMemento(StorageScope.WORKSPACE, StorageTarget.USER);
    this.profileMemento = this.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
    this._isReady = false;
    this.whenReadyPromise = new DeferredPromise();
    this.whenReady = this.whenReadyPromise.p;
    this.whenRestoredPromise = new DeferredPromise();
    this.whenRestored = this.whenRestoredPromise.p;
    //#endregion
    //#region Events
    this._onDidActiveGroupChange = this._register(new Emitter());
    this.onDidChangeActiveGroup = this._onDidActiveGroupChange.event;
    this._onDidAddGroup = this._register(new Emitter());
    this.onDidAddGroup = this._onDidAddGroup.event;
    this._onDidRemoveGroup = this._register(new Emitter());
    this.onDidRemoveGroup = this._onDidRemoveGroup.event;
    this._onDidMoveGroup = this._register(new Emitter());
    this.onDidMoveGroup = this._onDidMoveGroup.event;
    this._onDidActivateGroup = this._register(new Emitter());
    this.onDidActivateGroup = this._onDidActivateGroup.event;
    this._onDidChangeGroupIndex = this._register(new Emitter());
    this.onDidChangeGroupIndex = this._onDidChangeGroupIndex.event;
    this._onDidChangeGroupLocked = this._register(new Emitter());
    this.onDidChangeGroupLocked = this._onDidChangeGroupLocked.event;
    this._onDidChangeGroupMaximized = this._register(new Emitter());
    this.onDidChangeGroupMaximized = this._onDidChangeGroupMaximized.event;
    //#endregion
    //#region Editor Group Context Key Handling
    this.globalContextKeys = /* @__PURE__ */ new Map();
    this.scopedContextKeys = /* @__PURE__ */ new Map();
    this.contextKeyProviders = /* @__PURE__ */ new Map();
    this.registeredContextKeys = /* @__PURE__ */ new Map();
    this.contextKeyProviderDisposables = this._register(new DisposableMap());
    this.modalEditorVisibleContext = EditorPartModalVisibleContext.bindTo(this.contextKeyService);
    this.editorWorkingSets = (() => {
      const workingSetsRaw = this.storageService.get(EditorParts.EDITOR_WORKING_SETS_STORAGE_KEY, StorageScope.WORKSPACE);
      if (workingSetsRaw) {
        return JSON.parse(workingSetsRaw);
      }
      return [];
    })();
    const modalState = this.profileMemento[EditorParts.MODAL_EDITOR_STATE_STORAGE_KEY];
    if (modalState) {
      this.modalEditorMaximized = modalState.maximized;
      this.modalEditorSize = modalState.size;
      this.modalEditorPosition = modalState.position;
      this.modalEditorSidebarWidth = modalState.sidebarWidth;
      this.modalEditorSidebarHidden = modalState.sidebarHidden;
    }
    this.mainPart = this._register(this.createMainEditorPart());
    this._register(this.registerPart(this.mainPart));
    this.mostRecentActiveParts = [this.mainPart];
    this.restoreParts();
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.onDidChangeMementoValue(StorageScope.WORKSPACE, this._store)((e) => this.onDidChangeMementoState(e)));
    this.whenReady.then(() => this.registerGroupsContextKeyListeners());
  }
  createMainEditorPart() {
    return this.instantiationService.createInstance(MainEditorPart, this);
  }
  getScopedInstantiationService(part) {
    if (part === this.mainPart) {
      let mainPartInstantiationService = this.mapPartToInstantiationService.get(part.windowId);
      if (!mainPartInstantiationService) {
        mainPartInstantiationService = this.instantiationService.invokeFunction((accessor) => {
          const editorService = accessor.get(IEditorService);
          const statusbarService = accessor.get(IStatusbarService);
          const mainPartInstantiationService2 = this._register(this.mainPart.scopedInstantiationService.createChild(new ServiceCollection(
            [IEditorService, editorService.createScoped(this.mainPart, this._store)],
            [IStatusbarService, statusbarService.createScoped(statusbarService, this._store)]
          )));
          this.mapPartToInstantiationService.set(part.windowId, mainPartInstantiationService2);
          return mainPartInstantiationService2;
        });
      }
      return mainPartInstantiationService;
    }
    if (part === this.modalEditorPart && this.modalPartInstantiationService) {
      return this.modalPartInstantiationService;
    }
    return this.mapPartToInstantiationService.get(part.windowId) ?? this.instantiationService;
  }
  async createAuxiliaryEditorPart(options) {
    const { part, instantiationService, disposables } = await this.instantiationService.createInstance(AuxiliaryEditorPart, this).create(this.getGroupsLabel(this._parts.size), options);
    this.mapPartToInstantiationService.set(part.windowId, instantiationService);
    disposables.add(toDisposable(() => this.mapPartToInstantiationService.delete(part.windowId)));
    this._onDidAddGroup.fire(part.activeGroup);
    this._onDidCreateAuxiliaryEditorPart.fire(part);
    return part;
  }
  get activeModalEditorPart() {
    return this.modalEditorPart;
  }
  async createModalEditorPart(options) {
    if (this.modalEditorPart) {
      this.modalEditorPart.updateOptions(options);
      return this.modalEditorPart;
    }
    if (this.modalEditorPartCreatePromise) {
      const part = await this.modalEditorPartCreatePromise;
      part.updateOptions(options);
      return part;
    }
    const createPromise = this.doCreateModalEditorPart(options).finally(() => {
      this.modalEditorPartCreatePromise = void 0;
    });
    this.modalEditorPartCreatePromise = createPromise;
    return createPromise;
  }
  async doCreateModalEditorPart(options) {
    this.modalEditorVisibleContext.set(true);
    let result;
    try {
      result = await this.instantiationService.createInstance(ModalEditorPart, this).create({
        ...options,
        maximized: options?.maximized ?? this.modalEditorMaximized,
        size: options?.size ?? this.modalEditorSize,
        position: options?.position ?? this.modalEditorPosition,
        sidebar: options?.sidebar ? {
          ...options.sidebar,
          sidebarWidth: options.sidebar.sidebarWidth ?? this.modalEditorSidebarWidth,
          sidebarHidden: options.sidebar.sidebarHidden ?? this.modalEditorSidebarHidden
        } : void 0
      });
    } catch (error) {
      this.modalEditorVisibleContext.set(false);
      throw error;
    }
    const { part, instantiationService, disposables } = result;
    this.modalEditorPart = part;
    this.modalPartInstantiationService = instantiationService;
    disposables.add(toDisposable(() => {
      this.modalEditorMaximized = part.maximized;
      this.modalEditorSize = part.size;
      this.modalEditorPosition = part.position;
      if (part.hasSidebar) {
        this.modalEditorSidebarWidth = part.sidebarWidth;
        this.modalEditorSidebarHidden = part.sidebarHidden || void 0;
      }
      this.modalPartInstantiationService = void 0;
      this.modalEditorPart = void 0;
      this.modalEditorVisibleContext.set(false);
    }));
    this._onDidAddGroup.fire(part.activeGroup);
    return part;
  }
  //#endregion
  //#region Registration
  registerPart(part) {
    const disposables = this._register(new DisposableStore());
    disposables.add(super.registerPart(part));
    this.registerEditorPartListeners(part, disposables);
    return disposables;
  }
  unregisterPart(part) {
    super.unregisterPart(part);
    this.parts.forEach((part2, index) => {
      if (part2 === this.mainPart) {
        return;
      }
      part2.notifyGroupsLabelChange(this.getGroupsLabel(index));
    });
  }
  registerEditorPartListeners(part, disposables) {
    disposables.add(part.onDidFocus(() => {
      this.doUpdateMostRecentActive(part, true);
      if (this._parts.size > 1) {
        this._onDidActiveGroupChange.fire(this.activeGroup);
      }
    }));
    disposables.add(toDisposable(() => {
      this.doUpdateMostRecentActive(part);
      if (part.windowId !== mainWindow.vscodeWindowId) {
        this._onDidActiveGroupChange.fire(this.activeGroup);
      }
    }));
    disposables.add(part.onDidChangeActiveGroup((group) => this._onDidActiveGroupChange.fire(group)));
    disposables.add(part.onDidAddGroup((group) => this._onDidAddGroup.fire(group)));
    disposables.add(part.onDidRemoveGroup((group) => this._onDidRemoveGroup.fire(group)));
    disposables.add(part.onDidMoveGroup((group) => this._onDidMoveGroup.fire(group)));
    disposables.add(part.onDidActivateGroup((e) => {
      if (e.reason === GroupActivationReason.PART_CLOSE) {
        this.doUpdateMostRecentActive(part, true);
      }
      this._onDidActivateGroup.fire(e);
    }));
    disposables.add(part.onDidChangeGroupMaximized((maximized) => this._onDidChangeGroupMaximized.fire(maximized)));
    disposables.add(part.onDidChangeGroupIndex((group) => this._onDidChangeGroupIndex.fire(group)));
    disposables.add(part.onDidChangeGroupLocked((group) => this._onDidChangeGroupLocked.fire(group)));
  }
  doUpdateMostRecentActive(part, makeMostRecentlyActive) {
    const index = this.mostRecentActiveParts.indexOf(part);
    if (index !== -1) {
      this.mostRecentActiveParts.splice(index, 1);
    }
    if (makeMostRecentlyActive) {
      this.mostRecentActiveParts.unshift(part);
    }
  }
  getGroupsLabel(index) {
    return localize("groupLabel", "Window {0}", index + 1);
  }
  //#endregion
  //#region Helpers
  getPartByDocument(document) {
    const mruParts = this.mostRecentActiveParts;
    const mruDocumentParts = mruParts.filter((part) => part.element?.ownerDocument === document);
    if (mruDocumentParts.length > 1) {
      const activeElement = getActiveElement();
      for (const part of mruDocumentParts) {
        const container = part.getContainer();
        if (container && isAncestor(activeElement, container)) {
          return part;
        }
      }
      return mruDocumentParts[0];
    }
    return super.getPartByDocument(document);
  }
  getPart(groupOrElement) {
    if (this._parts.size > 1) {
      if (isHTMLElement(groupOrElement)) {
        const element = groupOrElement;
        return this.getPartByDocument(element.ownerDocument);
      } else {
        const group = groupOrElement;
        let id;
        if (typeof group === "number") {
          id = group;
        } else {
          id = group.id;
        }
        for (const part of this._parts) {
          if (part.hasGroup(id)) {
            return part;
          }
        }
      }
    }
    return this.mainPart;
  }
  get isReady() {
    return this._isReady;
  }
  async restoreParts() {
    await this.mainPart.whenReady;
    if (this.mainPart.willRestoreState) {
      const state = this.loadState();
      if (state) {
        await this.restoreState(state);
      }
    }
    const mostRecentActivePart = this.mostRecentActiveParts.at(0);
    mostRecentActivePart?.activeGroup.focus();
    this._isReady = true;
    this.whenReadyPromise.complete();
    await Promise.allSettled(this.parts.map((part) => part.whenRestored));
    this.whenRestoredPromise.complete();
  }
  loadState() {
    return this.workspaceMemento[EditorParts.EDITOR_PARTS_UI_STATE_STORAGE_KEY];
  }
  saveState() {
    const state = this.createState();
    if (state.auxiliary.length === 0) {
      delete this.workspaceMemento[EditorParts.EDITOR_PARTS_UI_STATE_STORAGE_KEY];
    } else {
      this.workspaceMemento[EditorParts.EDITOR_PARTS_UI_STATE_STORAGE_KEY] = state;
    }
    this.saveModalState();
  }
  saveModalState() {
    if (this.modalEditorPart) {
      this.modalEditorMaximized = this.modalEditorPart.maximized;
      this.modalEditorSize = this.modalEditorPart.size;
      this.modalEditorPosition = this.modalEditorPart.position;
      if (this.modalEditorPart.hasSidebar) {
        this.modalEditorSidebarWidth = this.modalEditorPart.sidebarWidth;
        this.modalEditorSidebarHidden = this.modalEditorPart.sidebarHidden || void 0;
      }
    }
    if (this.modalEditorMaximized || this.modalEditorSize || this.modalEditorPosition || this.modalEditorSidebarWidth || this.modalEditorSidebarHidden) {
      this.profileMemento[EditorParts.MODAL_EDITOR_STATE_STORAGE_KEY] = {
        maximized: this.modalEditorMaximized,
        size: this.modalEditorSize ? { width: this.modalEditorSize.width, height: this.modalEditorSize.height } : void 0,
        position: this.modalEditorPosition,
        sidebarWidth: this.modalEditorSidebarWidth,
        sidebarHidden: this.modalEditorSidebarHidden
      };
    } else {
      delete this.profileMemento[EditorParts.MODAL_EDITOR_STATE_STORAGE_KEY];
    }
  }
  createState() {
    return {
      auxiliary: this.parts.map((part) => ({ part, auxiliaryWindow: this.auxiliaryWindowService.getWindow(part.windowId) })).filter(({ auxiliaryWindow }) => auxiliaryWindow !== void 0).map(({ part, auxiliaryWindow }) => ({
        state: part.createState(),
        ...auxiliaryWindow.createState()
      })),
      mru: this.mostRecentActiveParts.map((part) => this.parts.indexOf(part))
    };
  }
  async restoreState(state) {
    if (state.auxiliary.length) {
      const auxiliaryEditorPartPromises = [];
      for (const auxiliaryEditorPartState of state.auxiliary) {
        auxiliaryEditorPartPromises.push(this.createAuxiliaryEditorPart(auxiliaryEditorPartState));
      }
      await Promise.allSettled(auxiliaryEditorPartPromises);
      if (state.mru.length === this.parts.length) {
        this.mostRecentActiveParts = state.mru.map((index) => this.parts[index]);
      } else {
        this.mostRecentActiveParts = [...this.parts];
      }
      await Promise.allSettled(this.parts.map((part) => part.whenReady));
    }
  }
  get hasRestorableState() {
    return this.parts.some((part) => part.hasRestorableState);
  }
  onDidChangeMementoState(e) {
    if (e.external && e.scope === StorageScope.WORKSPACE) {
      this.reloadMemento(e.scope);
      const state = this.loadState();
      if (state) {
        this.applyState(state);
      }
    }
  }
  async applyState(state) {
    for (const part of this.parts) {
      if (part === this.mainPart) {
        continue;
      }
      for (const group of part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
        await group.closeAllEditors({ excludeConfirming: true });
      }
      const closed = part.close();
      if (!closed) {
        return false;
      }
    }
    if (state !== "empty") {
      await this.restoreState(state);
    }
    return true;
  }
  saveWorkingSet(name) {
    const workingSet = {
      id: generateUuid(),
      name,
      main: this.mainPart.createState(),
      auxiliary: this.createState()
    };
    this.editorWorkingSets.push(workingSet);
    this.saveWorkingSets();
    return {
      id: workingSet.id,
      name: workingSet.name
    };
  }
  getWorkingSets() {
    return this.editorWorkingSets.map((workingSet) => ({ id: workingSet.id, name: workingSet.name }));
  }
  deleteWorkingSet(workingSet) {
    const index = this.indexOfWorkingSet(workingSet);
    if (typeof index === "number") {
      this.editorWorkingSets.splice(index, 1);
      this.saveWorkingSets();
    }
  }
  async applyWorkingSet(workingSet, options) {
    let workingSetState;
    if (workingSet === "empty") {
      workingSetState = "empty";
    } else {
      workingSetState = this.editorWorkingSets[this.indexOfWorkingSet(workingSet) ?? -1];
    }
    if (!workingSetState) {
      return false;
    }
    const applied = await this.applyState(workingSetState === "empty" ? workingSetState : workingSetState.auxiliary);
    if (!applied) {
      return false;
    }
    await this.mainPart.applyState(workingSetState === "empty" ? workingSetState : workingSetState.main, options);
    if (!options?.preserveFocus) {
      const mostRecentActivePart = this.mostRecentActiveParts.at(0);
      if (mostRecentActivePart) {
        await mostRecentActivePart.whenReady;
        mostRecentActivePart.activeGroup.focus();
      }
    }
    return true;
  }
  indexOfWorkingSet(workingSet) {
    for (let i = 0; i < this.editorWorkingSets.length; i++) {
      if (this.editorWorkingSets[i].id === workingSet.id) {
        return i;
      }
    }
    return void 0;
  }
  saveWorkingSets() {
    this.storageService.store(EditorParts.EDITOR_WORKING_SETS_STORAGE_KEY, JSON.stringify(this.editorWorkingSets), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  //#endregion
  //#region Group Management
  get activeGroup() {
    return this.activePart.activeGroup;
  }
  get sideGroup() {
    return this.activePart.sideGroup;
  }
  get groups() {
    return this.getGroups();
  }
  get count() {
    return this.groups.length;
  }
  getGroups(order = GroupsOrder.CREATION_TIME) {
    if (this._parts.size > 1) {
      let parts;
      switch (order) {
        case GroupsOrder.GRID_APPEARANCE:
        // we currently do not have a way to compute by appearance over multiple windows
        case GroupsOrder.CREATION_TIME:
          parts = this.parts;
          break;
        case GroupsOrder.MOST_RECENTLY_ACTIVE:
          parts = distinct([...this.mostRecentActiveParts, ...this.parts]);
          break;
      }
      return parts.flatMap((part) => part.getGroups(order));
    }
    return this.mainPart.getGroups(order);
  }
  getGroup(identifier) {
    if (this._parts.size > 1) {
      for (const part of this._parts) {
        const group = part.getGroup(identifier);
        if (group) {
          return group;
        }
      }
    }
    return this.mainPart.getGroup(identifier);
  }
  assertGroupView(group) {
    let groupView;
    if (typeof group === "number") {
      groupView = this.getGroup(group);
    } else {
      groupView = group;
    }
    if (!groupView) {
      throw new Error("Invalid editor group provided!");
    }
    return groupView;
  }
  activateGroup(group) {
    return this.getPart(group).activateGroup(group);
  }
  getSize(group) {
    return this.getPart(group).getSize(group);
  }
  setSize(group, size) {
    this.getPart(group).setSize(group, size);
  }
  arrangeGroups(arrangement, group = this.activePart.activeGroup) {
    this.getPart(group).arrangeGroups(arrangement, group);
  }
  toggleMaximizeGroup(group = this.activePart.activeGroup) {
    this.getPart(group).toggleMaximizeGroup(group);
  }
  toggleExpandGroup(group = this.activePart.activeGroup) {
    this.getPart(group).toggleExpandGroup(group);
  }
  restoreGroup(group) {
    return this.getPart(group).restoreGroup(group);
  }
  applyLayout(layout) {
    this.activePart.applyLayout(layout);
  }
  getLayout() {
    return this.activePart.getLayout();
  }
  get orientation() {
    return this.activePart.orientation;
  }
  setGroupOrientation(orientation) {
    this.activePart.setGroupOrientation(orientation);
  }
  findGroup(scope, source = this.activeGroup, wrap) {
    const sourcePart = this.getPart(source);
    if (this._parts.size > 1) {
      const groups = this.getGroups(GroupsOrder.GRID_APPEARANCE);
      if (scope.location === GroupLocation.FIRST || scope.location === GroupLocation.LAST) {
        return scope.location === GroupLocation.FIRST ? groups[0] : groups[groups.length - 1];
      }
      const group = sourcePart.findGroup(scope, source, false);
      if (group) {
        return group;
      }
      if (scope.location === GroupLocation.NEXT || scope.location === GroupLocation.PREVIOUS) {
        const sourceGroup = this.assertGroupView(source);
        const index = groups.indexOf(sourceGroup);
        if (scope.location === GroupLocation.NEXT) {
          let nextGroup = groups[index + 1];
          if (!nextGroup && wrap) {
            nextGroup = groups[0];
          }
          return nextGroup;
        } else {
          let previousGroup = groups[index - 1];
          if (!previousGroup && wrap) {
            previousGroup = groups[groups.length - 1];
          }
          return previousGroup;
        }
      }
    }
    return sourcePart.findGroup(scope, source, wrap);
  }
  addGroup(location, direction) {
    return this.getPart(location).addGroup(location, direction);
  }
  removeGroup(group) {
    this.getPart(group).removeGroup(group);
  }
  moveGroup(group, location, direction) {
    return this.getPart(group).moveGroup(group, location, direction);
  }
  mergeGroup(group, target, options) {
    return this.getPart(group).mergeGroup(group, target, options);
  }
  mergeAllGroups(target, options) {
    return this.activePart.mergeAllGroups(target, options);
  }
  copyGroup(group, location, direction) {
    return this.getPart(group).copyGroup(group, location, direction);
  }
  createEditorDropTarget(container, delegate) {
    return this.getPart(container).createEditorDropTarget(container, delegate);
  }
  registerGroupsContextKeyListeners() {
    this._register(this.onDidChangeActiveGroup(() => this.updateGlobalContextKeys()));
    this.groups.forEach((group) => this.registerGroupContextKeyProvidersListeners(group));
    this._register(this.onDidAddGroup((group) => this.registerGroupContextKeyProvidersListeners(group)));
    this._register(this.onDidRemoveGroup((group) => {
      this.scopedContextKeys.delete(group.id);
      this.registeredContextKeys.delete(group.id);
      this.contextKeyProviderDisposables.deleteAndDispose(group.id);
    }));
  }
  updateGlobalContextKeys() {
    const activeGroupScopedContextKeys = this.scopedContextKeys.get(this.activeGroup.id);
    if (!activeGroupScopedContextKeys) {
      return;
    }
    for (const [key, globalContextKey] of this.globalContextKeys) {
      const scopedContextKey = activeGroupScopedContextKeys.get(key);
      if (scopedContextKey) {
        globalContextKey.set(scopedContextKey.get());
      } else {
        globalContextKey.reset();
      }
    }
  }
  bind(contextKey, group) {
    let globalContextKey = this.globalContextKeys.get(contextKey.key);
    if (!globalContextKey) {
      globalContextKey = contextKey.bindTo(this.contextKeyService);
      this.globalContextKeys.set(contextKey.key, globalContextKey);
    }
    let groupScopedContextKeys = this.scopedContextKeys.get(group.id);
    if (!groupScopedContextKeys) {
      groupScopedContextKeys = /* @__PURE__ */ new Map();
      this.scopedContextKeys.set(group.id, groupScopedContextKeys);
    }
    let scopedContextKey = groupScopedContextKeys.get(contextKey.key);
    if (!scopedContextKey) {
      scopedContextKey = contextKey.bindTo(group.scopedContextKeyService);
      groupScopedContextKeys.set(contextKey.key, scopedContextKey);
    }
    const that = this;
    return {
      get() {
        return scopedContextKey.get();
      },
      set(value) {
        if (that.activeGroup === group) {
          globalContextKey.set(value);
        }
        scopedContextKey.set(value);
      },
      reset() {
        if (that.activeGroup === group) {
          globalContextKey.reset();
        }
        scopedContextKey.reset();
      }
    };
  }
  registerContextKeyProvider(provider) {
    if (this.contextKeyProviders.has(provider.contextKey.key) || this.globalContextKeys.has(provider.contextKey.key)) {
      throw new Error(`A context key provider for key ${provider.contextKey.key} already exists.`);
    }
    this.contextKeyProviders.set(provider.contextKey.key, provider);
    const setContextKeyForGroups = () => {
      for (const group of this.groups) {
        this.updateRegisteredContextKey(group, provider);
      }
    };
    setContextKeyForGroups();
    const onDidChange = provider.onDidChange?.(() => setContextKeyForGroups());
    return toDisposable(() => {
      onDidChange?.dispose();
      this.globalContextKeys.delete(provider.contextKey.key);
      this.scopedContextKeys.forEach((scopedContextKeys) => scopedContextKeys.delete(provider.contextKey.key));
      this.contextKeyProviders.delete(provider.contextKey.key);
      this.registeredContextKeys.forEach((registeredContextKeys) => registeredContextKeys.delete(provider.contextKey.key));
    });
  }
  registerGroupContextKeyProvidersListeners(group) {
    const disposable = group.onDidActiveEditorChange(() => {
      for (const contextKeyProvider of this.contextKeyProviders.values()) {
        this.updateRegisteredContextKey(group, contextKeyProvider);
      }
    });
    this.contextKeyProviderDisposables.set(group.id, disposable);
  }
  updateRegisteredContextKey(group, provider) {
    let groupRegisteredContextKeys = this.registeredContextKeys.get(group.id);
    if (!groupRegisteredContextKeys) {
      groupRegisteredContextKeys = /* @__PURE__ */ new Map();
      this.registeredContextKeys.set(group.id, groupRegisteredContextKeys);
    }
    let scopedRegisteredContextKey = groupRegisteredContextKeys.get(provider.contextKey.key);
    if (!scopedRegisteredContextKey) {
      scopedRegisteredContextKey = this.bind(provider.contextKey, group);
      groupRegisteredContextKeys.set(provider.contextKey.key, scopedRegisteredContextKey);
    }
    scopedRegisteredContextKey.set(provider.getGroupContextKeyValue(group));
  }
  //#endregion
  //#region Main Editor Part Only
  get partOptions() {
    return this.mainPart.partOptions;
  }
  get onDidChangeEditorPartOptions() {
    return this.mainPart.onDidChangeEditorPartOptions;
  }
  enforcePartOptions(options) {
    return this.mainPart.enforcePartOptions(options);
  }
  //#endregion
};
//#endregion
//#region Lifecycle / State
EditorParts.EDITOR_PARTS_UI_STATE_STORAGE_KEY = "editorparts.state";
EditorParts.MODAL_EDITOR_STATE_STORAGE_KEY = "editorparts.modalState";
//#endregion
//#region Working Sets
EditorParts.EDITOR_WORKING_SETS_STORAGE_KEY = "editor.workingSets";
EditorParts = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IAuxiliaryWindowService),
  __decorateParam(4, IContextKeyService)
], EditorParts);
registerSingleton(IEditorGroupsService, EditorParts, InstantiationType.Eager);
export {
  EditorParts
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYXJ0cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEVkaXRvckdyb3VwTGF5b3V0LCBHcm91cEFjdGl2YXRpb25SZWFzb24sIEdyb3VwRGlyZWN0aW9uLCBHcm91cExvY2F0aW9uLCBHcm91cE9yaWVudGF0aW9uLCBHcm91cHNBcnJhbmdlbWVudCwgR3JvdXBzT3JkZXIsIElBdXhpbGlhcnlFZGl0b3JQYXJ0LCBJRWRpdG9yR3JvdXBDb250ZXh0S2V5UHJvdmlkZXIsIElFZGl0b3JEcm9wVGFyZ2V0RGVsZWdhdGUsIElFZGl0b3JHcm91cHNTZXJ2aWNlLCBJRWRpdG9yU2lkZUdyb3VwLCBJRWRpdG9yV29ya2luZ1NldCwgSUZpbmRHcm91cFNjb3BlLCBJTWVyZ2VHcm91cE9wdGlvbnMsIElFZGl0b3JXb3JraW5nU2V0T3B0aW9ucywgSUVkaXRvclBhcnQsIElNb2RhbEVkaXRvclBhcnQsIElFZGl0b3JHcm91cEFjdGl2YXRpb25FdmVudCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEdyb3VwSWRlbnRpZmllciwgSUVkaXRvclBhcnRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYXJ0LCBJRWRpdG9yUGFydFVJU3RhdGUsIE1haW5FZGl0b3JQYXJ0IH0gZnJvbSAnLi9lZGl0b3JQYXJ0LmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cFZpZXcsIElFZGl0b3JQYXJ0c1ZpZXcgfSBmcm9tICcuL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQXV4aWxpYXJ5RWRpdG9yUGFydCwgSUF1eGlsaWFyeUVkaXRvclBhcnRPcGVuT3B0aW9ucyB9IGZyb20gJy4vYXV4aWxpYXJ5RWRpdG9yUGFydC5qcyc7XG5pbXBvcnQgeyBNb2RhbEVkaXRvclBhcnQgfSBmcm9tICcuL21vZGFsRWRpdG9yUGFydC5qcyc7XG5pbXBvcnQgeyBNdWx0aVdpbmRvd1BhcnRzIH0gZnJvbSAnLi4vLi4vcGFydC5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIElTdG9yYWdlVmFsdWVDaGFuZ2VFdmVudCwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV4aWxpYXJ5V2luZG93T3Blbk9wdGlvbnMsIElBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV4aWxpYXJ5V2luZG93L2Jyb3dzZXIvYXV4aWxpYXJ5V2luZG93U2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlWYWx1ZSwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aXZlRWxlbWVudCwgSURpbWVuc2lvbiwgaXNBbmNlc3RvciwgaXNIVE1MRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEZWVwUGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElTdGF0dXNiYXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IElNb2RhbEVkaXRvclBhcnRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFydE1vZGFsVmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuXG5pbnRlcmZhY2UgSUVkaXRvclBhcnRzVUlTdGF0ZSB7XG5cdHJlYWRvbmx5IGF1eGlsaWFyeTogSUF1eGlsaWFyeUVkaXRvclBhcnRTdGF0ZVtdO1xuXHRyZWFkb25seSBtcnU6IG51bWJlcltdO1xuXHQvLyBtYWluIHN0YXRlIGlzIG1hbmFnZWQgYnkgdGhlIG1haW4gcGFydFxufVxuXG5pbnRlcmZhY2UgSUF1eGlsaWFyeUVkaXRvclBhcnRTdGF0ZSBleHRlbmRzIElBdXhpbGlhcnlXaW5kb3dPcGVuT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHN0YXRlOiBJRWRpdG9yUGFydFVJU3RhdGU7XG59XG5cbmludGVyZmFjZSBJRWRpdG9yV29ya2luZ1NldFN0YXRlIGV4dGVuZHMgSUVkaXRvcldvcmtpbmdTZXQge1xuXHRyZWFkb25seSBtYWluOiBJRWRpdG9yUGFydFVJU3RhdGU7XG5cdHJlYWRvbmx5IGF1eGlsaWFyeTogSUVkaXRvclBhcnRzVUlTdGF0ZTtcbn1cblxuaW50ZXJmYWNlIElNb2RhbEVkaXRvclBhcnRTdGF0ZSB7XG5cdHJlYWRvbmx5IG1heGltaXplZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2l6ZT86IHsgcmVhZG9ubHkgd2lkdGg6IG51bWJlcjsgcmVhZG9ubHkgaGVpZ2h0OiBudW1iZXIgfTtcblx0cmVhZG9ubHkgcG9zaXRpb24/OiB7IHJlYWRvbmx5IGxlZnQ6IG51bWJlcjsgcmVhZG9ubHkgdG9wOiBudW1iZXIgfTtcblx0cmVhZG9ubHkgc2lkZWJhcldpZHRoPzogbnVtYmVyO1xuXHRyZWFkb25seSBzaWRlYmFySGlkZGVuPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElFZGl0b3JQYXJ0c01lbWVudG8ge1xuXHQnZWRpdG9ycGFydHMuc3RhdGUnPzogSUVkaXRvclBhcnRzVUlTdGF0ZTtcblx0J2VkaXRvcnBhcnRzLm1vZGFsU3RhdGUnPzogSU1vZGFsRWRpdG9yUGFydFN0YXRlO1xufVxuXG5leHBvcnQgY2xhc3MgRWRpdG9yUGFydHMgZXh0ZW5kcyBNdWx0aVdpbmRvd1BhcnRzPEVkaXRvclBhcnQsIElFZGl0b3JQYXJ0c01lbWVudG8+IGltcGxlbWVudHMgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIElFZGl0b3JQYXJ0c1ZpZXcge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG1haW5QYXJ0OiBNYWluRWRpdG9yUGFydDtcblx0cHJpdmF0ZSByZWFkb25seSBtb2RhbEVkaXRvclZpc2libGVDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHQvLyBNb3N0IHJlY2VudGx5IGFjdGl2ZSBwYXJ0cyBhY3Jvc3MgYWxsIHdpbmRvd3MuIE11bHRpcGxlIHBhcnRzIGNhblxuXHQvLyBzaGFyZSB0aGUgc2FtZSB3aW5kb3cgKGUuZy4gbWFpbiBwYXJ0IGFuZCBtb2RhbCBwYXJ0IGJvdGggbGl2ZSBpblxuXHQvLyB0aGUgbWFpbiB3aW5kb3cpIHNvIHRoaXMgbGlzdCBhbHNvIGFjdHMgYXMgYSBwZXItd2luZG93IE1SVSB3aGVuXG5cdC8vIGZpbHRlcmVkIGJ5IGRvY3VtZW50LiBTZWUgYGdldE1vc3RSZWNlbnRseUFjdGl2ZVBhcnRCeURvY3VtZW50YC5cblx0cHJpdmF0ZSBtb3N0UmVjZW50QWN0aXZlUGFydHM6IEVkaXRvclBhcnRbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUF1eGlsaWFyeVdpbmRvd1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXhpbGlhcnlXaW5kb3dTZXJ2aWNlOiBJQXV4aWxpYXJ5V2luZG93U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcignd29ya2JlbmNoLmVkaXRvclBhcnRzJywgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5tb2RhbEVkaXRvclZpc2libGVDb250ZXh0ID0gRWRpdG9yUGFydE1vZGFsVmlzaWJsZUNvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5lZGl0b3JXb3JraW5nU2V0cyA9ICgoKSA9PiB7XG5cdFx0XHRjb25zdCB3b3JraW5nU2V0c1JhdyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEVkaXRvclBhcnRzLkVESVRPUl9XT1JLSU5HX1NFVFNfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0aWYgKHdvcmtpbmdTZXRzUmF3KSB7XG5cdFx0XHRcdHJldHVybiBKU09OLnBhcnNlKHdvcmtpbmdTZXRzUmF3KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH0pKCk7XG5cblx0XHRjb25zdCBtb2RhbFN0YXRlID0gdGhpcy5wcm9maWxlTWVtZW50b1tFZGl0b3JQYXJ0cy5NT0RBTF9FRElUT1JfU1RBVEVfU1RPUkFHRV9LRVldO1xuXHRcdGlmIChtb2RhbFN0YXRlKSB7XG5cdFx0XHR0aGlzLm1vZGFsRWRpdG9yTWF4aW1pemVkID0gbW9kYWxTdGF0ZS5tYXhpbWl6ZWQ7XG5cdFx0XHR0aGlzLm1vZGFsRWRpdG9yU2l6ZSA9IG1vZGFsU3RhdGUuc2l6ZTtcblx0XHRcdHRoaXMubW9kYWxFZGl0b3JQb3NpdGlvbiA9IG1vZGFsU3RhdGUucG9zaXRpb247XG5cdFx0XHR0aGlzLm1vZGFsRWRpdG9yU2lkZWJhcldpZHRoID0gbW9kYWxTdGF0ZS5zaWRlYmFyV2lkdGg7XG5cdFx0XHR0aGlzLm1vZGFsRWRpdG9yU2lkZWJhckhpZGRlbiA9IG1vZGFsU3RhdGUuc2lkZWJhckhpZGRlbjtcblx0XHR9XG5cblx0XHR0aGlzLm1haW5QYXJ0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jcmVhdGVNYWluRWRpdG9yUGFydCgpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlZ2lzdGVyUGFydCh0aGlzLm1haW5QYXJ0KSk7XG5cblx0XHR0aGlzLm1vc3RSZWNlbnRBY3RpdmVQYXJ0cyA9IFt0aGlzLm1haW5QYXJ0XTtcblxuXHRcdHRoaXMucmVzdG9yZVBhcnRzKCk7XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlTWVtZW50b1ZhbHVlKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIHRoaXMuX3N0b3JlKShlID0+IHRoaXMub25EaWRDaGFuZ2VNZW1lbnRvU3RhdGUoZSkpKTtcblx0XHR0aGlzLndoZW5SZWFkeS50aGVuKCgpID0+IHRoaXMucmVnaXN0ZXJHcm91cHNDb250ZXh0S2V5TGlzdGVuZXJzKCkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZU1haW5FZGl0b3JQYXJ0KCk6IE1haW5FZGl0b3JQYXJ0IHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYWluRWRpdG9yUGFydCwgdGhpcyk7XG5cdH1cblxuXHQvLyNyZWdpb24gU2NvcGVkIEluc3RhbnRpYXRpb24gU2VydmljZXNcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1hcFBhcnRUb0luc3RhbnRpYXRpb25TZXJ2aWNlID0gbmV3IE1hcDxudW1iZXIgLyogd2luZG93IElEICovLCBJSW5zdGFudGlhdGlvblNlcnZpY2U+KCk7XG5cdHByaXZhdGUgbW9kYWxQYXJ0SW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSB8IHVuZGVmaW5lZDtcblxuXHRnZXRTY29wZWRJbnN0YW50aWF0aW9uU2VydmljZShwYXJ0OiBJRWRpdG9yUGFydCk6IElJbnN0YW50aWF0aW9uU2VydmljZSB7XG5cblx0XHQvLyBNYWluIFBhcnRcblx0XHRpZiAocGFydCA9PT0gdGhpcy5tYWluUGFydCkge1xuXHRcdFx0bGV0IG1haW5QYXJ0SW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLm1hcFBhcnRUb0luc3RhbnRpYXRpb25TZXJ2aWNlLmdldChwYXJ0LndpbmRvd0lkKTtcblx0XHRcdGlmICghbWFpblBhcnRJbnN0YW50aWF0aW9uU2VydmljZSkge1xuXHRcdFx0XHRtYWluUGFydEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdHVzYmFyU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RhdHVzYmFyU2VydmljZSk7XG5cblx0XHRcdFx0XHRjb25zdCBtYWluUGFydEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tYWluUGFydC5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRcdFx0XHRbSUVkaXRvclNlcnZpY2UsIGVkaXRvclNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMubWFpblBhcnQsIHRoaXMuX3N0b3JlKV0sXG5cdFx0XHRcdFx0XHRbSVN0YXR1c2JhclNlcnZpY2UsIHN0YXR1c2JhclNlcnZpY2UuY3JlYXRlU2NvcGVkKHN0YXR1c2JhclNlcnZpY2UsIHRoaXMuX3N0b3JlKV1cblx0XHRcdFx0XHQpKSk7XG5cdFx0XHRcdFx0dGhpcy5tYXBQYXJ0VG9JbnN0YW50aWF0aW9uU2VydmljZS5zZXQocGFydC53aW5kb3dJZCwgbWFpblBhcnRJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gbWFpblBhcnRJbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBtYWluUGFydEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdH1cblxuXHRcdC8vIE1vZGFsIFBhcnQgKGlmIG9wZW5lZClcblx0XHRpZiAocGFydCA9PT0gdGhpcy5tb2RhbEVkaXRvclBhcnQgJiYgdGhpcy5tb2RhbFBhcnRJbnN0YW50aWF0aW9uU2VydmljZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMubW9kYWxQYXJ0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMubWFwUGFydFRvSW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KHBhcnQud2luZG93SWQpID8/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gQXV4aWxpYXJ5IEVkaXRvciBQYXJ0c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ3JlYXRlQXV4aWxpYXJ5RWRpdG9yUGFydCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElBdXhpbGlhcnlFZGl0b3JQYXJ0PigpKTtcblx0cmVhZG9ubHkgb25EaWRDcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0ID0gdGhpcy5fb25EaWRDcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0LmV2ZW50O1xuXG5cdGFzeW5jIGNyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnQob3B0aW9ucz86IElBdXhpbGlhcnlFZGl0b3JQYXJ0T3Blbk9wdGlvbnMpOiBQcm9taXNlPElBdXhpbGlhcnlFZGl0b3JQYXJ0PiB7XG5cdFx0Y29uc3QgeyBwYXJ0LCBpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMgfSA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQXV4aWxpYXJ5RWRpdG9yUGFydCwgdGhpcykuY3JlYXRlKHRoaXMuZ2V0R3JvdXBzTGFiZWwodGhpcy5fcGFydHMuc2l6ZSksIG9wdGlvbnMpO1xuXG5cdFx0Ly8gS2VlcCBpbnN0YW50aWF0aW9uIHNlcnZpY2Vcblx0XHR0aGlzLm1hcFBhcnRUb0luc3RhbnRpYXRpb25TZXJ2aWNlLnNldChwYXJ0LndpbmRvd0lkLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLm1hcFBhcnRUb0luc3RhbnRpYXRpb25TZXJ2aWNlLmRlbGV0ZShwYXJ0LndpbmRvd0lkKSkpO1xuXG5cdFx0Ly8gRXZlbnRzXG5cdFx0dGhpcy5fb25EaWRBZGRHcm91cC5maXJlKHBhcnQuYWN0aXZlR3JvdXApO1xuXG5cdFx0dGhpcy5fb25EaWRDcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0LmZpcmUocGFydCk7XG5cblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBNb2RhbCBFZGl0b3IgUGFydFxuXG5cdHByaXZhdGUgbW9kYWxFZGl0b3JQYXJ0OiBJTW9kYWxFZGl0b3JQYXJ0IHwgdW5kZWZpbmVkO1xuXHRnZXQgYWN0aXZlTW9kYWxFZGl0b3JQYXJ0KCk6IElNb2RhbEVkaXRvclBhcnQgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5tb2RhbEVkaXRvclBhcnQ7IH1cblxuXHRwcml2YXRlIG1vZGFsRWRpdG9yTWF4aW1pemVkID0gZmFsc2U7XG5cdHByaXZhdGUgbW9kYWxFZGl0b3JTaXplOiBJRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1vZGFsRWRpdG9yUG9zaXRpb246IHsgcmVhZG9ubHkgbGVmdDogbnVtYmVyOyByZWFkb25seSB0b3A6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1vZGFsRWRpdG9yU2lkZWJhcldpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbW9kYWxFZGl0b3JTaWRlYmFySGlkZGVuOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdC8vIFRyYWNrcyBhbiBpbi1mbGlnaHQgY3JlYXRpb24gc28gY29uY3VycmVudCBjYWxsZXJzIGF3YWl0IGFuZCByZXVzZSB0aGVcblx0Ly8gc2FtZSBzaW5nbGV0b24gaW5zdGFuY2UgaW5zdGVhZCBvZiBlYWNoIHJhY2luZyB0byBjcmVhdGUgdGhlaXIgb3duLlxuXHRwcml2YXRlIG1vZGFsRWRpdG9yUGFydENyZWF0ZVByb21pc2U6IFByb21pc2U8SU1vZGFsRWRpdG9yUGFydD4gfCB1bmRlZmluZWQ7XG5cblx0YXN5bmMgY3JlYXRlTW9kYWxFZGl0b3JQYXJ0KG9wdGlvbnM/OiBJTW9kYWxFZGl0b3JQYXJ0T3B0aW9ucyk6IFByb21pc2U8SU1vZGFsRWRpdG9yUGFydD4ge1xuXG5cdFx0Ly8gUmV1c2UgZXhpc3RpbmcgbW9kYWwgZWRpdG9yIHBhcnQgaWYgaXQgZXhpc3RzXG5cdFx0aWYgKHRoaXMubW9kYWxFZGl0b3JQYXJ0KSB7XG5cdFx0XHR0aGlzLm1vZGFsRWRpdG9yUGFydC51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5tb2RhbEVkaXRvclBhcnQ7XG5cdFx0fVxuXG5cdFx0Ly8gQW5vdGhlciBjcmVhdGlvbiBpcyBhbHJlYWR5IGluIGZsaWdodDogYXdhaXQgaXQgaW5zdGVhZCBvZiBzdGFydGluZ1xuXHRcdC8vIGEgc2Vjb25kIG9uZSwgdGhlbiBhcHBseSB0aGlzIGNhbGwncyBvcHRpb25zIHRvIHRoZSBzaGFyZWQgaW5zdGFuY2Vcblx0XHRpZiAodGhpcy5tb2RhbEVkaXRvclBhcnRDcmVhdGVQcm9taXNlKSB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gYXdhaXQgdGhpcy5tb2RhbEVkaXRvclBhcnRDcmVhdGVQcm9taXNlO1xuXHRcdFx0cGFydC51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXG5cdFx0XHRyZXR1cm4gcGFydDtcblx0XHR9XG5cblx0XHRjb25zdCBjcmVhdGVQcm9taXNlID0gdGhpcy5kb0NyZWF0ZU1vZGFsRWRpdG9yUGFydChvcHRpb25zKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHRoaXMubW9kYWxFZGl0b3JQYXJ0Q3JlYXRlUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHR9KTtcblx0XHR0aGlzLm1vZGFsRWRpdG9yUGFydENyZWF0ZVByb21pc2UgPSBjcmVhdGVQcm9taXNlO1xuXG5cdFx0cmV0dXJuIGNyZWF0ZVByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvQ3JlYXRlTW9kYWxFZGl0b3JQYXJ0KG9wdGlvbnM6IElNb2RhbEVkaXRvclBhcnRPcHRpb25zIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJTW9kYWxFZGl0b3JQYXJ0PiB7XG5cdFx0dGhpcy5tb2RhbEVkaXRvclZpc2libGVDb250ZXh0LnNldCh0cnVlKTtcblx0XHRsZXQgcmVzdWx0O1xuXHRcdHRyeSB7XG5cdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vZGFsRWRpdG9yUGFydCwgdGhpcykuY3JlYXRlKHtcblx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0bWF4aW1pemVkOiBvcHRpb25zPy5tYXhpbWl6ZWQgPz8gdGhpcy5tb2RhbEVkaXRvck1heGltaXplZCxcblx0XHRcdFx0c2l6ZTogb3B0aW9ucz8uc2l6ZSA/PyB0aGlzLm1vZGFsRWRpdG9yU2l6ZSxcblx0XHRcdFx0cG9zaXRpb246IG9wdGlvbnM/LnBvc2l0aW9uID8/IHRoaXMubW9kYWxFZGl0b3JQb3NpdGlvbixcblx0XHRcdFx0c2lkZWJhcjogb3B0aW9ucz8uc2lkZWJhciA/IHtcblx0XHRcdFx0XHQuLi5vcHRpb25zLnNpZGViYXIsXG5cdFx0XHRcdFx0c2lkZWJhcldpZHRoOiBvcHRpb25zLnNpZGViYXIuc2lkZWJhcldpZHRoID8/IHRoaXMubW9kYWxFZGl0b3JTaWRlYmFyV2lkdGgsXG5cdFx0XHRcdFx0c2lkZWJhckhpZGRlbjogb3B0aW9ucy5zaWRlYmFyLnNpZGViYXJIaWRkZW4gPz8gdGhpcy5tb2RhbEVkaXRvclNpZGViYXJIaWRkZW5cblx0XHRcdFx0fSA6IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubW9kYWxFZGl0b3JWaXNpYmxlQ29udGV4dC5zZXQoZmFsc2UpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHRcdGNvbnN0IHsgcGFydCwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGRpc3Bvc2FibGVzIH0gPSByZXN1bHQ7XG5cblx0XHQvLyBLZWVwIGluc3RhbnRpYXRpb24gc2VydmljZSBhbmQgcmVmZXJlbmNlIHRvIHJldXNlXG5cdFx0dGhpcy5tb2RhbEVkaXRvclBhcnQgPSBwYXJ0O1xuXHRcdHRoaXMubW9kYWxQYXJ0SW5zdGFudGlhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRcdC8vIFJlbWVtYmVyIHN0YXRlIG9uIGRpc3Bvc2UgdG8gcmVzdG9yZSB3aGVuIG9wZW5pbmcgbmV4dCB0aW1lXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLm1vZGFsRWRpdG9yTWF4aW1pemVkID0gcGFydC5tYXhpbWl6ZWQ7XG5cdFx0XHR0aGlzLm1vZGFsRWRpdG9yU2l6ZSA9IHBhcnQuc2l6ZTtcblx0XHRcdHRoaXMubW9kYWxFZGl0b3JQb3NpdGlvbiA9IHBhcnQucG9zaXRpb247XG5cdFx0XHRpZiAocGFydC5oYXNTaWRlYmFyKSB7XG5cdFx0XHRcdHRoaXMubW9kYWxFZGl0b3JTaWRlYmFyV2lkdGggPSBwYXJ0LnNpZGViYXJXaWR0aDtcblx0XHRcdFx0dGhpcy5tb2RhbEVkaXRvclNpZGViYXJIaWRkZW4gPSBwYXJ0LnNpZGViYXJIaWRkZW4gfHwgdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLm1vZGFsUGFydEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5tb2RhbEVkaXRvclBhcnQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLm1vZGFsRWRpdG9yVmlzaWJsZUNvbnRleHQuc2V0KGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBFdmVudHNcblx0XHR0aGlzLl9vbkRpZEFkZEdyb3VwLmZpcmUocGFydC5hY3RpdmVHcm91cCk7XG5cblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBSZWdpc3RyYXRpb25cblxuXHRvdmVycmlkZSByZWdpc3RlclBhcnQocGFydDogRWRpdG9yUGFydCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN1cGVyLnJlZ2lzdGVyUGFydChwYXJ0KSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRWRpdG9yUGFydExpc3RlbmVycyhwYXJ0LCBkaXNwb3NhYmxlcyk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdW5yZWdpc3RlclBhcnQocGFydDogRWRpdG9yUGFydCk6IHZvaWQge1xuXHRcdHN1cGVyLnVucmVnaXN0ZXJQYXJ0KHBhcnQpO1xuXG5cdFx0Ly8gTm90aWZ5IGFsbCBwYXJ0cyBhYm91dCBhIGdyb3VwcyBsYWJlbCBjaGFuZ2Vcblx0XHQvLyBnaXZlbiBpdCBpcyBjb21wdXRlZCBiYXNlZCBvbiB0aGUgaW5kZXhcblxuXHRcdHRoaXMucGFydHMuZm9yRWFjaCgocGFydCwgaW5kZXgpID0+IHtcblx0XHRcdGlmIChwYXJ0ID09PSB0aGlzLm1haW5QYXJ0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cGFydC5ub3RpZnlHcm91cHNMYWJlbENoYW5nZSh0aGlzLmdldEdyb3Vwc0xhYmVsKGluZGV4KSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRWRpdG9yUGFydExpc3RlbmVycyhwYXJ0OiBFZGl0b3JQYXJ0LCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBhcnQub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLmRvVXBkYXRlTW9zdFJlY2VudEFjdGl2ZShwYXJ0LCB0cnVlKTtcblxuXHRcdFx0aWYgKHRoaXMuX3BhcnRzLnNpemUgPiAxKSB7XG5cdFx0XHRcdC8vIEVpdGhlciBtYWluIG9yIGF1eGlsaWFyeSBlZGl0b3IgcGFydCBnb3QgZm9jdXNcblx0XHRcdFx0Ly8gd2hpY2ggd2UgaGF2ZSB0byB0cmVhdCBhcyBhIGdyb3VwIGNoYW5nZSBldmVudC5cblx0XHRcdFx0dGhpcy5fb25EaWRBY3RpdmVHcm91cENoYW5nZS5maXJlKHRoaXMuYWN0aXZlR3JvdXApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuZG9VcGRhdGVNb3N0UmVjZW50QWN0aXZlKHBhcnQpO1xuXG5cdFx0XHRpZiAocGFydC53aW5kb3dJZCAhPT0gbWFpbldpbmRvdy52c2NvZGVXaW5kb3dJZCkge1xuXHRcdFx0XHQvLyBBbiBhdXhpbGlhcnkgZWRpdG9yIHBhcnQgaXMgY2xvc2luZyB3aGljaCB3ZSBoYXZlXG5cdFx0XHRcdC8vIHRvIHRyZWF0IGFzIGdyb3VwIGNoYW5nZSBldmVudCBmb3IgdGhlIG5leHQgZWRpdG9yXG5cdFx0XHRcdC8vIHBhcnQgdGhhdCBiZWNvbWVzIGFjdGl2ZS5cblx0XHRcdFx0Ly8gUmVmczogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI1NzA1OFxuXHRcdFx0XHR0aGlzLl9vbkRpZEFjdGl2ZUdyb3VwQ2hhbmdlLmZpcmUodGhpcy5hY3RpdmVHcm91cCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBhcnQub25EaWRDaGFuZ2VBY3RpdmVHcm91cChncm91cCA9PiB0aGlzLl9vbkRpZEFjdGl2ZUdyb3VwQ2hhbmdlLmZpcmUoZ3JvdXApKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBhcnQub25EaWRBZGRHcm91cChncm91cCA9PiB0aGlzLl9vbkRpZEFkZEdyb3VwLmZpcmUoZ3JvdXApKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBhcnQub25EaWRSZW1vdmVHcm91cChncm91cCA9PiB0aGlzLl9vbkRpZFJlbW92ZUdyb3VwLmZpcmUoZ3JvdXApKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBhcnQub25EaWRNb3ZlR3JvdXAoZ3JvdXAgPT4gdGhpcy5fb25EaWRNb3ZlR3JvdXAuZmlyZShncm91cCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydC5vbkRpZEFjdGl2YXRlR3JvdXAoZSA9PiB7XG5cdFx0XHQvLyBBIHBhcnQtY2xvc2UgYWN0aXZhdGlvbiBtZWFucyBhIG1vZGFsIG9yIGF1eGlsaWFyeSBlZGl0b3IgcGFydCBpc1xuXHRcdFx0Ly8gY2xvc2luZyBhbmQgYW5vdGhlciBwYXJ0IGlzIGJlaW5nIG1hZGUgdGhlIGFjdGl2ZSBvbmUuIFVwZGF0ZSBvdXJcblx0XHRcdC8vIE1SVSBlYWdlcmx5IGhlcmUgc28gdGhhdCBkb3duc3RyZWFtIHF1ZXJpZXMgZHVyaW5nIHRoZSBjbG9zZSBmbG93XG5cdFx0XHQvLyAoZS5nLiBgZ2V0UGFydEJ5RG9jdW1lbnRgIHRyaWdnZXJlZCBieSBgb25EaWRSZW1vdmVHcm91cGAgZnJvbSB0aGVcblx0XHRcdC8vIGNsb3NpbmcgcGFydCkgc2VlIHRoZSBuZXcgYWN0aXZlIHBhcnQgaW5zdGVhZCBvZiB0aGUgY2xvc2luZyBvbmVcblx0XHRcdC8vIHdoaWNoIGhhcyBub3QgeWV0IGJlZW4gdW5yZWdpc3RlcmVkLlxuXHRcdFx0aWYgKGUucmVhc29uID09PSBHcm91cEFjdGl2YXRpb25SZWFzb24uUEFSVF9DTE9TRSkge1xuXHRcdFx0XHR0aGlzLmRvVXBkYXRlTW9zdFJlY2VudEFjdGl2ZShwYXJ0LCB0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb25EaWRBY3RpdmF0ZUdyb3VwLmZpcmUoZSk7XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwYXJ0Lm9uRGlkQ2hhbmdlR3JvdXBNYXhpbWl6ZWQobWF4aW1pemVkID0+IHRoaXMuX29uRGlkQ2hhbmdlR3JvdXBNYXhpbWl6ZWQuZmlyZShtYXhpbWl6ZWQpKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydC5vbkRpZENoYW5nZUdyb3VwSW5kZXgoZ3JvdXAgPT4gdGhpcy5fb25EaWRDaGFuZ2VHcm91cEluZGV4LmZpcmUoZ3JvdXApKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBhcnQub25EaWRDaGFuZ2VHcm91cExvY2tlZChncm91cCA9PiB0aGlzLl9vbkRpZENoYW5nZUdyb3VwTG9ja2VkLmZpcmUoZ3JvdXApKSk7XG5cdH1cblxuXHRwcml2YXRlIGRvVXBkYXRlTW9zdFJlY2VudEFjdGl2ZShwYXJ0OiBFZGl0b3JQYXJ0LCBtYWtlTW9zdFJlY2VudGx5QWN0aXZlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5tb3N0UmVjZW50QWN0aXZlUGFydHMuaW5kZXhPZihwYXJ0KTtcblxuXHRcdC8vIFJlbW92ZSBmcm9tIE1SVSBsaXN0XG5cdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0dGhpcy5tb3N0UmVjZW50QWN0aXZlUGFydHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHR9XG5cblx0XHQvLyBBZGQgdG8gZnJvbnQgYXMgbmVlZGVkXG5cdFx0aWYgKG1ha2VNb3N0UmVjZW50bHlBY3RpdmUpIHtcblx0XHRcdHRoaXMubW9zdFJlY2VudEFjdGl2ZVBhcnRzLnVuc2hpZnQocGFydCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRHcm91cHNMYWJlbChpbmRleDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2dyb3VwTGFiZWwnLCBcIldpbmRvdyB7MH1cIiwgaW5kZXggKyAxKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBIZWxwZXJzXG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFBhcnRCeURvY3VtZW50KGRvY3VtZW50OiBEb2N1bWVudCk6IEVkaXRvclBhcnQge1xuXHRcdC8vIE11bHRpcGxlIGVkaXRvciBwYXJ0cyBjYW4gc2hhcmUgdGhlIHNhbWUgZG9jdW1lbnQgYmVjYXVzZVxuXHRcdC8vIHRoZSBtYWluIHBhcnQgYW5kIGEgbW9kYWwgcGFydCBib3RoIGxpdmUgaW4gdGhlIG1haW4gd2luZG93LlxuXG5cdFx0Y29uc3QgbXJ1UGFydHMgPSB0aGlzLm1vc3RSZWNlbnRBY3RpdmVQYXJ0cztcblx0XHRjb25zdCBtcnVEb2N1bWVudFBhcnRzID0gbXJ1UGFydHMuZmlsdGVyKHBhcnQgPT4gcGFydC5lbGVtZW50Py5vd25lckRvY3VtZW50ID09PSBkb2N1bWVudCk7XG5cdFx0aWYgKG1ydURvY3VtZW50UGFydHMubGVuZ3RoID4gMSkge1xuXHRcdFx0Ly8gRmlyc3QgdHJ5IHRvIGZpbmQgdGhlIHBhcnQgdGhhdCBoYXMgdGhlIGN1cnJlbnRseSBmb2N1c2VkIGVsZW1lbnQsIHdoaWNoIGlzIHRoZSBtb3N0IGxpa2VseSBjYW5kaWRhdGUgdG8gYmUgdGhlIGFjdGl2ZSBwYXJ0IGZvciB0aGF0IGRvY3VtZW50LlxuXHRcdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IGdldEFjdGl2ZUVsZW1lbnQoKTtcblx0XHRcdGZvciAoY29uc3QgcGFydCBvZiBtcnVEb2N1bWVudFBhcnRzKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IHBhcnQuZ2V0Q29udGFpbmVyKCk7XG5cdFx0XHRcdGlmIChjb250YWluZXIgJiYgaXNBbmNlc3RvcihhY3RpdmVFbGVtZW50LCBjb250YWluZXIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gUGljayB0aGUgcGFydCB0aGF0IHdhcyBzZXQgYWN0aXZlIGxhc3QgZm9yIHRoYXQgZG9jdW1lbnRcblx0XHRcdHJldHVybiBtcnVEb2N1bWVudFBhcnRzWzBdO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5nZXRQYXJ0QnlEb2N1bWVudChkb2N1bWVudCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRQYXJ0KGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyKTogRWRpdG9yUGFydDtcblx0b3ZlcnJpZGUgZ2V0UGFydChlbGVtZW50OiBIVE1MRWxlbWVudCk6IEVkaXRvclBhcnQ7XG5cdG92ZXJyaWRlIGdldFBhcnQoZ3JvdXBPckVsZW1lbnQ6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIgfCBIVE1MRWxlbWVudCk6IEVkaXRvclBhcnQge1xuXHRcdGlmICh0aGlzLl9wYXJ0cy5zaXplID4gMSkge1xuXHRcdFx0aWYgKGlzSFRNTEVsZW1lbnQoZ3JvdXBPckVsZW1lbnQpKSB7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBncm91cE9yRWxlbWVudDtcblxuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRQYXJ0QnlEb2N1bWVudChlbGVtZW50Lm93bmVyRG9jdW1lbnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZ3JvdXAgPSBncm91cE9yRWxlbWVudDtcblxuXHRcdFx0XHRsZXQgaWQ6IEdyb3VwSWRlbnRpZmllcjtcblx0XHRcdFx0aWYgKHR5cGVvZiBncm91cCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRpZCA9IGdyb3VwO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlkID0gZ3JvdXAuaWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5fcGFydHMpIHtcblx0XHRcdFx0XHRpZiAocGFydC5oYXNHcm91cChpZCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm1haW5QYXJ0O1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIExpZmVjeWNsZSAvIFN0YXRlXG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRURJVE9SX1BBUlRTX1VJX1NUQVRFX1NUT1JBR0VfS0VZID0gJ2VkaXRvcnBhcnRzLnN0YXRlJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTU9EQUxfRURJVE9SX1NUQVRFX1NUT1JBR0VfS0VZID0gJ2VkaXRvcnBhcnRzLm1vZGFsU3RhdGUnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlTWVtZW50byA9IHRoaXMuZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb2ZpbGVNZW1lbnRvID0gdGhpcy5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdHByaXZhdGUgX2lzUmVhZHkgPSBmYWxzZTtcblx0Z2V0IGlzUmVhZHkoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9pc1JlYWR5OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSB3aGVuUmVhZHlQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRyZWFkb25seSB3aGVuUmVhZHkgPSB0aGlzLndoZW5SZWFkeVByb21pc2UucDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHdoZW5SZXN0b3JlZFByb21pc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IHdoZW5SZXN0b3JlZCA9IHRoaXMud2hlblJlc3RvcmVkUHJvbWlzZS5wO1xuXG5cdHByaXZhdGUgYXN5bmMgcmVzdG9yZVBhcnRzKCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gSm9pbiBvbiB0aGUgbWFpbiBwYXJ0IGJlaW5nIHJlYWR5IHRvIHBpY2tcblx0XHQvLyB0aGUgcmlnaHQgbW9tZW50IHRvIGJlZ2luIHJlc3RvcmluZy5cblx0XHQvLyBUaGUgbWFpbiBwYXJ0IGlzIGF1dG9tYXRpY2FsbHkgYmVpbmcgY3JlYXRlZFxuXHRcdC8vIGFzIHBhcnQgb2YgdGhlIG92ZXJhbGwgc3RhcnR1cCBwcm9jZXNzLlxuXHRcdGF3YWl0IHRoaXMubWFpblBhcnQud2hlblJlYWR5O1xuXG5cdFx0Ly8gT25seSBhdHRlbXB0IHRvIHJlc3RvcmUgYXV4aWxpYXJ5IGVkaXRvciBwYXJ0c1xuXHRcdC8vIHdoZW4gdGhlIG1haW4gcGFydCBkaWQgcmVzdG9yZS4gSXQgaXMgcG9zc2libGVcblx0XHQvLyB0aGF0IHJlc3RvcmluZyB3YXMgbm90IGF0dGVtcHRlZCBiZWNhdXNlIHNwZWNpZmljXG5cdFx0Ly8gZWRpdG9ycyB3ZXJlIG9wZW5lZC5cblx0XHRpZiAodGhpcy5tYWluUGFydC53aWxsUmVzdG9yZVN0YXRlKSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMubG9hZFN0YXRlKCk7XG5cdFx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5yZXN0b3JlU3RhdGUoc3RhdGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1vc3RSZWNlbnRBY3RpdmVQYXJ0ID0gdGhpcy5tb3N0UmVjZW50QWN0aXZlUGFydHMuYXQoMCk7XG5cdFx0bW9zdFJlY2VudEFjdGl2ZVBhcnQ/LmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cblx0XHR0aGlzLl9pc1JlYWR5ID0gdHJ1ZTtcblx0XHR0aGlzLndoZW5SZWFkeVByb21pc2UuY29tcGxldGUoKTtcblxuXHRcdC8vIEF3YWl0IHJlc3RvcmVkXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHRoaXMucGFydHMubWFwKHBhcnQgPT4gcGFydC53aGVuUmVzdG9yZWQpKTtcblx0XHR0aGlzLndoZW5SZXN0b3JlZFByb21pc2UuY29tcGxldGUoKTtcblx0fVxuXG5cdHByaXZhdGUgbG9hZFN0YXRlKCk6IElFZGl0b3JQYXJ0c1VJU3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZU1lbWVudG9bRWRpdG9yUGFydHMuRURJVE9SX1BBUlRTX1VJX1NUQVRFX1NUT1JBR0VfS0VZXTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmNyZWF0ZVN0YXRlKCk7XG5cdFx0aWYgKHN0YXRlLmF1eGlsaWFyeS5sZW5ndGggPT09IDApIHtcblx0XHRcdGRlbGV0ZSB0aGlzLndvcmtzcGFjZU1lbWVudG9bRWRpdG9yUGFydHMuRURJVE9SX1BBUlRTX1VJX1NUQVRFX1NUT1JBR0VfS0VZXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy53b3Jrc3BhY2VNZW1lbnRvW0VkaXRvclBhcnRzLkVESVRPUl9QQVJUU19VSV9TVEFURV9TVE9SQUdFX0tFWV0gPSBzdGF0ZTtcblx0XHR9XG5cblx0XHR0aGlzLnNhdmVNb2RhbFN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVNb2RhbFN0YXRlKCk6IHZvaWQge1xuXG5cdFx0Ly8gQWxzbyBjYXB0dXJlIHN0YXRlIGZyb20gYW55IGN1cnJlbnRseSBvcGVuIG1vZGFsIGVkaXRvciBwYXJ0XG5cdFx0aWYgKHRoaXMubW9kYWxFZGl0b3JQYXJ0KSB7XG5cdFx0XHR0aGlzLm1vZGFsRWRpdG9yTWF4aW1pemVkID0gdGhpcy5tb2RhbEVkaXRvclBhcnQubWF4aW1pemVkO1xuXHRcdFx0dGhpcy5tb2RhbEVkaXRvclNpemUgPSB0aGlzLm1vZGFsRWRpdG9yUGFydC5zaXplO1xuXHRcdFx0dGhpcy5tb2RhbEVkaXRvclBvc2l0aW9uID0gdGhpcy5tb2RhbEVkaXRvclBhcnQucG9zaXRpb247XG5cdFx0XHRpZiAodGhpcy5tb2RhbEVkaXRvclBhcnQuaGFzU2lkZWJhcikge1xuXHRcdFx0XHR0aGlzLm1vZGFsRWRpdG9yU2lkZWJhcldpZHRoID0gdGhpcy5tb2RhbEVkaXRvclBhcnQuc2lkZWJhcldpZHRoO1xuXHRcdFx0XHR0aGlzLm1vZGFsRWRpdG9yU2lkZWJhckhpZGRlbiA9IHRoaXMubW9kYWxFZGl0b3JQYXJ0LnNpZGViYXJIaWRkZW4gfHwgdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE9ubHkgcGVyc2lzdCB3aGVuIHRoZXJlIGlzIG1lYW5pbmdmdWwgc3RhdGUgdG8gcmVzdG9yZS5cblx0XHQvLyBXaGVuIGFsbCB2YWx1ZXMgYXJlIGF0IHRoZWlyIGRlZmF1bHRzIChub3QgbWF4aW1pemVkLCBub1xuXHRcdC8vIGN1c3RvbSBzaXplIG9yIHBvc2l0aW9uKSwgd2UgZGVsZXRlIHRoZSBrZXkgdG8gYXZvaWRcblx0XHQvLyBzdG9yaW5nIHVubmVjZXNzYXJ5IGRhdGEuXG5cdFx0aWYgKHRoaXMubW9kYWxFZGl0b3JNYXhpbWl6ZWQgfHwgdGhpcy5tb2RhbEVkaXRvclNpemUgfHwgdGhpcy5tb2RhbEVkaXRvclBvc2l0aW9uIHx8IHRoaXMubW9kYWxFZGl0b3JTaWRlYmFyV2lkdGggfHwgdGhpcy5tb2RhbEVkaXRvclNpZGViYXJIaWRkZW4pIHtcblx0XHRcdHRoaXMucHJvZmlsZU1lbWVudG9bRWRpdG9yUGFydHMuTU9EQUxfRURJVE9SX1NUQVRFX1NUT1JBR0VfS0VZXSA9IHtcblx0XHRcdFx0bWF4aW1pemVkOiB0aGlzLm1vZGFsRWRpdG9yTWF4aW1pemVkLFxuXHRcdFx0XHRzaXplOiB0aGlzLm1vZGFsRWRpdG9yU2l6ZSA/IHsgd2lkdGg6IHRoaXMubW9kYWxFZGl0b3JTaXplLndpZHRoLCBoZWlnaHQ6IHRoaXMubW9kYWxFZGl0b3JTaXplLmhlaWdodCB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwb3NpdGlvbjogdGhpcy5tb2RhbEVkaXRvclBvc2l0aW9uLFxuXHRcdFx0XHRzaWRlYmFyV2lkdGg6IHRoaXMubW9kYWxFZGl0b3JTaWRlYmFyV2lkdGgsXG5cdFx0XHRcdHNpZGViYXJIaWRkZW46IHRoaXMubW9kYWxFZGl0b3JTaWRlYmFySGlkZGVuLFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGVsZXRlIHRoaXMucHJvZmlsZU1lbWVudG9bRWRpdG9yUGFydHMuTU9EQUxfRURJVE9SX1NUQVRFX1NUT1JBR0VfS0VZXTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVN0YXRlKCk6IElFZGl0b3JQYXJ0c1VJU3RhdGUge1xuXHRcdHJldHVybiB7XG5cdFx0XHRhdXhpbGlhcnk6IHRoaXMucGFydHNcblx0XHRcdFx0Lm1hcChwYXJ0ID0+ICh7IHBhcnQsIGF1eGlsaWFyeVdpbmRvdzogdGhpcy5hdXhpbGlhcnlXaW5kb3dTZXJ2aWNlLmdldFdpbmRvdyhwYXJ0LndpbmRvd0lkKSB9KSlcblx0XHRcdFx0LmZpbHRlcigoeyBhdXhpbGlhcnlXaW5kb3cgfSkgPT4gYXV4aWxpYXJ5V2luZG93ICE9PSB1bmRlZmluZWQpXG5cdFx0XHRcdC5tYXAoKHsgcGFydCwgYXV4aWxpYXJ5V2luZG93IH0pID0+ICh7XG5cdFx0XHRcdFx0c3RhdGU6IHBhcnQuY3JlYXRlU3RhdGUoKSxcblx0XHRcdFx0XHQuLi5hdXhpbGlhcnlXaW5kb3chLmNyZWF0ZVN0YXRlKClcblx0XHRcdFx0fSkpLFxuXHRcdFx0bXJ1OiB0aGlzLm1vc3RSZWNlbnRBY3RpdmVQYXJ0cy5tYXAocGFydCA9PiB0aGlzLnBhcnRzLmluZGV4T2YocGFydCkpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzdG9yZVN0YXRlKHN0YXRlOiBJRWRpdG9yUGFydHNVSVN0YXRlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHN0YXRlLmF1eGlsaWFyeS5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGF1eGlsaWFyeUVkaXRvclBhcnRQcm9taXNlczogUHJvbWlzZTxJQXV4aWxpYXJ5RWRpdG9yUGFydD5bXSA9IFtdO1xuXG5cdFx0XHQvLyBDcmVhdGUgYXV4aWxpYXJ5IGVkaXRvciBwYXJ0c1xuXHRcdFx0Zm9yIChjb25zdCBhdXhpbGlhcnlFZGl0b3JQYXJ0U3RhdGUgb2Ygc3RhdGUuYXV4aWxpYXJ5KSB7XG5cdFx0XHRcdGF1eGlsaWFyeUVkaXRvclBhcnRQcm9taXNlcy5wdXNoKHRoaXMuY3JlYXRlQXV4aWxpYXJ5RWRpdG9yUGFydChhdXhpbGlhcnlFZGl0b3JQYXJ0U3RhdGUpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQXdhaXQgY3JlYXRpb25cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChhdXhpbGlhcnlFZGl0b3JQYXJ0UHJvbWlzZXMpO1xuXG5cdFx0XHQvLyBVcGRhdGUgTVJVIGxpc3Rcblx0XHRcdGlmIChzdGF0ZS5tcnUubGVuZ3RoID09PSB0aGlzLnBhcnRzLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLm1vc3RSZWNlbnRBY3RpdmVQYXJ0cyA9IHN0YXRlLm1ydS5tYXAoaW5kZXggPT4gdGhpcy5wYXJ0c1tpbmRleF0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5tb3N0UmVjZW50QWN0aXZlUGFydHMgPSBbLi4udGhpcy5wYXJ0c107XG5cdFx0XHR9XG5cblx0XHRcdC8vIEF3YWl0IHJlYWR5XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQodGhpcy5wYXJ0cy5tYXAocGFydCA9PiBwYXJ0LndoZW5SZWFkeSkpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBoYXNSZXN0b3JhYmxlU3RhdGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucGFydHMuc29tZShwYXJ0ID0+IHBhcnQuaGFzUmVzdG9yYWJsZVN0YXRlKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VNZW1lbnRvU3RhdGUoZTogSVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGUuZXh0ZXJuYWwgJiYgZS5zY29wZSA9PT0gU3RvcmFnZVNjb3BlLldPUktTUEFDRSkge1xuXHRcdFx0dGhpcy5yZWxvYWRNZW1lbnRvKGUuc2NvcGUpO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMubG9hZFN0YXRlKCk7XG5cdFx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdFx0dGhpcy5hcHBseVN0YXRlKHN0YXRlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFwcGx5U3RhdGUoc3RhdGU6IElFZGl0b3JQYXJ0c1VJU3RhdGUgfCAnZW1wdHknKTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHQvLyBCZWZvcmUgY2xvc2luZyB3aW5kb3dzLCB0cnkgdG8gY2xvc2UgYXMgbWFueSBlZGl0b3JzIGFzXG5cdFx0Ly8gcG9zc2libGUsIGJ1dCBza2lwIG92ZXIgdGhvc2UgdGhhdCB3b3VsZCB0cmlnZ2VyIGEgZGlhbG9nXG5cdFx0Ly8gKGZvciBleGFtcGxlIHdoZW4gYmVpbmcgZGlydHkpLiBUaGlzIGlzIHRvIGJlIGFibGUgdG8gaGF2ZVxuXHRcdC8vIHRoZW0gbWVyZ2UgaW50byB0aGUgbWFpbiBwYXJ0LlxuXG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHRoaXMucGFydHMpIHtcblx0XHRcdGlmIChwYXJ0ID09PSB0aGlzLm1haW5QYXJ0KSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBtYWluIHBhcnQgdGFrZXMgY2FyZSBvbiBpdHMgb3duXG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgcGFydC5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpKSB7XG5cdFx0XHRcdGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycyh7IGV4Y2x1ZGVDb25maXJtaW5nOiB0cnVlIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjbG9zZWQgPSAocGFydCBhcyB1bmtub3duIGFzIElBdXhpbGlhcnlFZGl0b3JQYXJ0KS5jbG9zZSgpOyAvLyB3aWxsIG1vdmUgcmVtYWluaW5nIGVkaXRvcnMgdG8gbWFpbiBwYXJ0XG5cdFx0XHRpZiAoIWNsb3NlZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIHRoaXMgaW5kaWNhdGVzIHRoYXQgY2xvc2luZyB3YXMgdmV0b2VkXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVzdG9yZSBhdXhpbGlhcnkgc3RhdGUgdW5sZXNzIHdlIGFyZSBpbiBhbiBlbXB0eSBzdGF0ZVxuXHRcdGlmIChzdGF0ZSAhPT0gJ2VtcHR5Jykge1xuXHRcdFx0YXdhaXQgdGhpcy5yZXN0b3JlU3RhdGUoc3RhdGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFdvcmtpbmcgU2V0c1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVESVRPUl9XT1JLSU5HX1NFVFNfU1RPUkFHRV9LRVkgPSAnZWRpdG9yLndvcmtpbmdTZXRzJztcblxuXHRwcml2YXRlIGVkaXRvcldvcmtpbmdTZXRzOiBJRWRpdG9yV29ya2luZ1NldFN0YXRlW107XG5cblx0c2F2ZVdvcmtpbmdTZXQobmFtZTogc3RyaW5nKTogSUVkaXRvcldvcmtpbmdTZXQge1xuXHRcdGNvbnN0IHdvcmtpbmdTZXQ6IElFZGl0b3JXb3JraW5nU2V0U3RhdGUgPSB7XG5cdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRuYW1lLFxuXHRcdFx0bWFpbjogdGhpcy5tYWluUGFydC5jcmVhdGVTdGF0ZSgpLFxuXHRcdFx0YXV4aWxpYXJ5OiB0aGlzLmNyZWF0ZVN0YXRlKClcblx0XHR9O1xuXG5cdFx0dGhpcy5lZGl0b3JXb3JraW5nU2V0cy5wdXNoKHdvcmtpbmdTZXQpO1xuXG5cdFx0dGhpcy5zYXZlV29ya2luZ1NldHMoKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogd29ya2luZ1NldC5pZCxcblx0XHRcdG5hbWU6IHdvcmtpbmdTZXQubmFtZVxuXHRcdH07XG5cdH1cblxuXHRnZXRXb3JraW5nU2V0cygpOiBJRWRpdG9yV29ya2luZ1NldFtdIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JXb3JraW5nU2V0cy5tYXAod29ya2luZ1NldCA9PiAoeyBpZDogd29ya2luZ1NldC5pZCwgbmFtZTogd29ya2luZ1NldC5uYW1lIH0pKTtcblx0fVxuXG5cdGRlbGV0ZVdvcmtpbmdTZXQod29ya2luZ1NldDogSUVkaXRvcldvcmtpbmdTZXQpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuaW5kZXhPZldvcmtpbmdTZXQod29ya2luZ1NldCk7XG5cdFx0aWYgKHR5cGVvZiBpbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMuZWRpdG9yV29ya2luZ1NldHMuc3BsaWNlKGluZGV4LCAxKTtcblxuXHRcdFx0dGhpcy5zYXZlV29ya2luZ1NldHMoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBhcHBseVdvcmtpbmdTZXQod29ya2luZ1NldDogSUVkaXRvcldvcmtpbmdTZXQgfCAnZW1wdHknLCBvcHRpb25zPzogSUVkaXRvcldvcmtpbmdTZXRPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0bGV0IHdvcmtpbmdTZXRTdGF0ZTogSUVkaXRvcldvcmtpbmdTZXRTdGF0ZSB8ICdlbXB0eScgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHdvcmtpbmdTZXQgPT09ICdlbXB0eScpIHtcblx0XHRcdHdvcmtpbmdTZXRTdGF0ZSA9ICdlbXB0eSc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHdvcmtpbmdTZXRTdGF0ZSA9IHRoaXMuZWRpdG9yV29ya2luZ1NldHNbdGhpcy5pbmRleE9mV29ya2luZ1NldCh3b3JraW5nU2V0KSA/PyAtMV07XG5cdFx0fVxuXG5cdFx0aWYgKCF3b3JraW5nU2V0U3RhdGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBBcHBseSBzdGF0ZTogYmVnaW4gd2l0aCBhdXhpbGlhcnkgd2luZG93cyBmaXJzdCBiZWNhdXNlIGl0IGhlbHBzIHRvIGtlZXBcblx0XHQvLyBlZGl0b3JzIGFyb3VuZCB0aGF0IG5lZWQgY29uZmlybWF0aW9uIGJ5IG1vdmluZyB0aGVtIGludG8gdGhlIG1haW4gcGFydC5cblx0XHQvLyBBbHNvLCBpbiByYXJlIGNhc2VzLCB0aGUgYXV4aWxpYXJ5IHBhcnQgbWF5IG5vdCBiZSBhYmxlIHRvIGFwcGx5IHRoZSBzdGF0ZVxuXHRcdC8vIGZvciBjZXJ0YWluIGVkaXRvcnMgdGhhdCBjYW5ub3QgbW92ZSB0byB0aGUgbWFpbiBwYXJ0LlxuXHRcdGNvbnN0IGFwcGxpZWQgPSBhd2FpdCB0aGlzLmFwcGx5U3RhdGUod29ya2luZ1NldFN0YXRlID09PSAnZW1wdHknID8gd29ya2luZ1NldFN0YXRlIDogd29ya2luZ1NldFN0YXRlLmF1eGlsaWFyeSk7XG5cdFx0aWYgKCFhcHBsaWVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMubWFpblBhcnQuYXBwbHlTdGF0ZSh3b3JraW5nU2V0U3RhdGUgPT09ICdlbXB0eScgPyB3b3JraW5nU2V0U3RhdGUgOiB3b3JraW5nU2V0U3RhdGUubWFpbiwgb3B0aW9ucyk7XG5cblx0XHQvLyBSZXN0b3JlIEZvY3VzIHVubGVzcyBpbnN0cnVjdGVkIG90aGVyd2lzZVxuXHRcdGlmICghb3B0aW9ucz8ucHJlc2VydmVGb2N1cykge1xuXHRcdFx0Y29uc3QgbW9zdFJlY2VudEFjdGl2ZVBhcnQgPSB0aGlzLm1vc3RSZWNlbnRBY3RpdmVQYXJ0cy5hdCgwKTtcblx0XHRcdGlmIChtb3N0UmVjZW50QWN0aXZlUGFydCkge1xuXHRcdFx0XHRhd2FpdCBtb3N0UmVjZW50QWN0aXZlUGFydC53aGVuUmVhZHk7XG5cdFx0XHRcdG1vc3RSZWNlbnRBY3RpdmVQYXJ0LmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGluZGV4T2ZXb3JraW5nU2V0KHdvcmtpbmdTZXQ6IElFZGl0b3JXb3JraW5nU2V0KTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuZWRpdG9yV29ya2luZ1NldHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmICh0aGlzLmVkaXRvcldvcmtpbmdTZXRzW2ldLmlkID09PSB3b3JraW5nU2V0LmlkKSB7XG5cdFx0XHRcdHJldHVybiBpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVXb3JraW5nU2V0cygpOiB2b2lkIHtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEVkaXRvclBhcnRzLkVESVRPUl9XT1JLSU5HX1NFVFNfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KHRoaXMuZWRpdG9yV29ya2luZ1NldHMpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEV2ZW50c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWN0aXZlR3JvdXBDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRWRpdG9yR3JvdXBWaWV3PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVHcm91cCA9IHRoaXMuX29uRGlkQWN0aXZlR3JvdXBDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBZGRHcm91cCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JHcm91cFZpZXc+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFkZEdyb3VwID0gdGhpcy5fb25EaWRBZGRHcm91cC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZUdyb3VwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvckdyb3VwVmlldz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlR3JvdXAgPSB0aGlzLl9vbkRpZFJlbW92ZUdyb3VwLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTW92ZUdyb3VwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvckdyb3VwVmlldz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTW92ZUdyb3VwID0gdGhpcy5fb25EaWRNb3ZlR3JvdXAuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBY3RpdmF0ZUdyb3VwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvckdyb3VwQWN0aXZhdGlvbkV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRBY3RpdmF0ZUdyb3VwID0gdGhpcy5fb25EaWRBY3RpdmF0ZUdyb3VwLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlR3JvdXBJbmRleCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JHcm91cFZpZXc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUdyb3VwSW5kZXggPSB0aGlzLl9vbkRpZENoYW5nZUdyb3VwSW5kZXguZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VHcm91cExvY2tlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JHcm91cFZpZXc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUdyb3VwTG9ja2VkID0gdGhpcy5fb25EaWRDaGFuZ2VHcm91cExvY2tlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUdyb3VwTWF4aW1pemVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlR3JvdXBNYXhpbWl6ZWQgPSB0aGlzLl9vbkRpZENoYW5nZUdyb3VwTWF4aW1pemVkLmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBHcm91cCBNYW5hZ2VtZW50XG5cblx0Z2V0IGFjdGl2ZUdyb3VwKCk6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdHJldHVybiB0aGlzLmFjdGl2ZVBhcnQuYWN0aXZlR3JvdXA7XG5cdH1cblxuXHRnZXQgc2lkZUdyb3VwKCk6IElFZGl0b3JTaWRlR3JvdXAge1xuXHRcdHJldHVybiB0aGlzLmFjdGl2ZVBhcnQuc2lkZUdyb3VwO1xuXHR9XG5cblx0Z2V0IGdyb3VwcygpOiBJRWRpdG9yR3JvdXBWaWV3W10ge1xuXHRcdHJldHVybiB0aGlzLmdldEdyb3VwcygpO1xuXHR9XG5cblx0Z2V0IGNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuZ3JvdXBzLmxlbmd0aDtcblx0fVxuXG5cdGdldEdyb3VwcyhvcmRlciA9IEdyb3Vwc09yZGVyLkNSRUFUSU9OX1RJTUUpOiBJRWRpdG9yR3JvdXBWaWV3W10ge1xuXHRcdGlmICh0aGlzLl9wYXJ0cy5zaXplID4gMSkge1xuXHRcdFx0bGV0IHBhcnRzOiBFZGl0b3JQYXJ0W107XG5cdFx0XHRzd2l0Y2ggKG9yZGVyKSB7XG5cdFx0XHRcdGNhc2UgR3JvdXBzT3JkZXIuR1JJRF9BUFBFQVJBTkNFOiAvLyB3ZSBjdXJyZW50bHkgZG8gbm90IGhhdmUgYSB3YXkgdG8gY29tcHV0ZSBieSBhcHBlYXJhbmNlIG92ZXIgbXVsdGlwbGUgd2luZG93c1xuXHRcdFx0XHRjYXNlIEdyb3Vwc09yZGVyLkNSRUFUSU9OX1RJTUU6XG5cdFx0XHRcdFx0cGFydHMgPSB0aGlzLnBhcnRzO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFOlxuXHRcdFx0XHRcdHBhcnRzID0gZGlzdGluY3QoWy4uLnRoaXMubW9zdFJlY2VudEFjdGl2ZVBhcnRzLCAuLi50aGlzLnBhcnRzXSk7IC8vIGFsd2F5cyBlbnN1cmUgYWxsIHBhcnRzIGFyZSBpbmNsdWRlZFxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcGFydHMuZmxhdE1hcChwYXJ0ID0+IHBhcnQuZ2V0R3JvdXBzKG9yZGVyKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMubWFpblBhcnQuZ2V0R3JvdXBzKG9yZGVyKTtcblx0fVxuXG5cdGdldEdyb3VwKGlkZW50aWZpZXI6IEdyb3VwSWRlbnRpZmllcik6IElFZGl0b3JHcm91cFZpZXcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9wYXJ0cy5zaXplID4gMSkge1xuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHRoaXMuX3BhcnRzKSB7XG5cdFx0XHRcdGNvbnN0IGdyb3VwID0gcGFydC5nZXRHcm91cChpZGVudGlmaWVyKTtcblx0XHRcdFx0aWYgKGdyb3VwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGdyb3VwO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMubWFpblBhcnQuZ2V0R3JvdXAoaWRlbnRpZmllcik7XG5cdH1cblxuXHRwcml2YXRlIGFzc2VydEdyb3VwVmlldyhncm91cDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllcik6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdGxldCBncm91cFZpZXc6IElFZGl0b3JHcm91cFZpZXcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHR5cGVvZiBncm91cCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGdyb3VwVmlldyA9IHRoaXMuZ2V0R3JvdXAoZ3JvdXApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRncm91cFZpZXcgPSBncm91cDtcblx0XHR9XG5cblx0XHRpZiAoIWdyb3VwVmlldykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGVkaXRvciBncm91cCBwcm92aWRlZCEnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZ3JvdXBWaWV3O1xuXHR9XG5cblx0YWN0aXZhdGVHcm91cChncm91cDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllcik6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdHJldHVybiB0aGlzLmdldFBhcnQoZ3JvdXApLmFjdGl2YXRlR3JvdXAoZ3JvdXApO1xuXHR9XG5cblx0Z2V0U2l6ZShncm91cDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllcik6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGFydChncm91cCkuZ2V0U2l6ZShncm91cCk7XG5cdH1cblxuXHRzZXRTaXplKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCBzaXplOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHR0aGlzLmdldFBhcnQoZ3JvdXApLnNldFNpemUoZ3JvdXAsIHNpemUpO1xuXHR9XG5cblx0YXJyYW5nZUdyb3VwcyhhcnJhbmdlbWVudDogR3JvdXBzQXJyYW5nZW1lbnQsIGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyID0gdGhpcy5hY3RpdmVQYXJ0LmFjdGl2ZUdyb3VwKTogdm9pZCB7XG5cdFx0dGhpcy5nZXRQYXJ0KGdyb3VwKS5hcnJhbmdlR3JvdXBzKGFycmFuZ2VtZW50LCBncm91cCk7XG5cdH1cblxuXHR0b2dnbGVNYXhpbWl6ZUdyb3VwKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyID0gdGhpcy5hY3RpdmVQYXJ0LmFjdGl2ZUdyb3VwKTogdm9pZCB7XG5cdFx0dGhpcy5nZXRQYXJ0KGdyb3VwKS50b2dnbGVNYXhpbWl6ZUdyb3VwKGdyb3VwKTtcblx0fVxuXG5cdHRvZ2dsZUV4cGFuZEdyb3VwKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyID0gdGhpcy5hY3RpdmVQYXJ0LmFjdGl2ZUdyb3VwKTogdm9pZCB7XG5cdFx0dGhpcy5nZXRQYXJ0KGdyb3VwKS50b2dnbGVFeHBhbmRHcm91cChncm91cCk7XG5cdH1cblxuXHRyZXN0b3JlR3JvdXAoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIpOiBJRWRpdG9yR3JvdXBWaWV3IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRQYXJ0KGdyb3VwKS5yZXN0b3JlR3JvdXAoZ3JvdXApO1xuXHR9XG5cblx0YXBwbHlMYXlvdXQobGF5b3V0OiBFZGl0b3JHcm91cExheW91dCk6IHZvaWQge1xuXHRcdHRoaXMuYWN0aXZlUGFydC5hcHBseUxheW91dChsYXlvdXQpO1xuXHR9XG5cblx0Z2V0TGF5b3V0KCk6IEVkaXRvckdyb3VwTGF5b3V0IHtcblx0XHRyZXR1cm4gdGhpcy5hY3RpdmVQYXJ0LmdldExheW91dCgpO1xuXHR9XG5cblx0Z2V0IG9yaWVudGF0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmFjdGl2ZVBhcnQub3JpZW50YXRpb247XG5cdH1cblxuXHRzZXRHcm91cE9yaWVudGF0aW9uKG9yaWVudGF0aW9uOiBHcm91cE9yaWVudGF0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5hY3RpdmVQYXJ0LnNldEdyb3VwT3JpZW50YXRpb24ob3JpZW50YXRpb24pO1xuXHR9XG5cblx0ZmluZEdyb3VwKHNjb3BlOiBJRmluZEdyb3VwU2NvcGUsIHNvdXJjZTogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciA9IHRoaXMuYWN0aXZlR3JvdXAsIHdyYXA/OiBib29sZWFuKTogSUVkaXRvckdyb3VwVmlldyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc291cmNlUGFydCA9IHRoaXMuZ2V0UGFydChzb3VyY2UpO1xuXHRcdGlmICh0aGlzLl9wYXJ0cy5zaXplID4gMSkge1xuXHRcdFx0Y29uc3QgZ3JvdXBzID0gdGhpcy5nZXRHcm91cHMoR3JvdXBzT3JkZXIuR1JJRF9BUFBFQVJBTkNFKTtcblxuXHRcdFx0Ly8gRW5zdXJlIHRoYXQgRklSU1QvTEFTVCBkaXNwYXRjaGVzIGdsb2JhbGx5IG92ZXIgYWxsIHBhcnRzXG5cdFx0XHRpZiAoc2NvcGUubG9jYXRpb24gPT09IEdyb3VwTG9jYXRpb24uRklSU1QgfHwgc2NvcGUubG9jYXRpb24gPT09IEdyb3VwTG9jYXRpb24uTEFTVCkge1xuXHRcdFx0XHRyZXR1cm4gc2NvcGUubG9jYXRpb24gPT09IEdyb3VwTG9jYXRpb24uRklSU1QgPyBncm91cHNbMF0gOiBncm91cHNbZ3JvdXBzLmxlbmd0aCAtIDFdO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUcnkgdG8gZmluZCBpbiB0YXJnZXQgcGFydCBmaXJzdCB3aXRob3V0IHdyYXBwaW5nXG5cdFx0XHRjb25zdCBncm91cCA9IHNvdXJjZVBhcnQuZmluZEdyb3VwKHNjb3BlLCBzb3VyY2UsIGZhbHNlKTtcblx0XHRcdGlmIChncm91cCkge1xuXHRcdFx0XHRyZXR1cm4gZ3JvdXA7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEVuc3VyZSB0aGF0IE5FWFQvUFJFVklPVVMgZGlzcGF0Y2hlcyBnbG9iYWxseSBvdmVyIGFsbCBwYXJ0c1xuXHRcdFx0aWYgKHNjb3BlLmxvY2F0aW9uID09PSBHcm91cExvY2F0aW9uLk5FWFQgfHwgc2NvcGUubG9jYXRpb24gPT09IEdyb3VwTG9jYXRpb24uUFJFVklPVVMpIHtcblx0XHRcdFx0Y29uc3Qgc291cmNlR3JvdXAgPSB0aGlzLmFzc2VydEdyb3VwVmlldyhzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IGdyb3Vwcy5pbmRleE9mKHNvdXJjZUdyb3VwKTtcblxuXHRcdFx0XHRpZiAoc2NvcGUubG9jYXRpb24gPT09IEdyb3VwTG9jYXRpb24uTkVYVCkge1xuXHRcdFx0XHRcdGxldCBuZXh0R3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCB1bmRlZmluZWQgPSBncm91cHNbaW5kZXggKyAxXTtcblx0XHRcdFx0XHRpZiAoIW5leHRHcm91cCAmJiB3cmFwKSB7XG5cdFx0XHRcdFx0XHRuZXh0R3JvdXAgPSBncm91cHNbMF07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIG5leHRHcm91cDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsZXQgcHJldmlvdXNHcm91cDogSUVkaXRvckdyb3VwVmlldyB8IHVuZGVmaW5lZCA9IGdyb3Vwc1tpbmRleCAtIDFdO1xuXHRcdFx0XHRcdGlmICghcHJldmlvdXNHcm91cCAmJiB3cmFwKSB7XG5cdFx0XHRcdFx0XHRwcmV2aW91c0dyb3VwID0gZ3JvdXBzW2dyb3Vwcy5sZW5ndGggLSAxXTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gcHJldmlvdXNHcm91cDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBzb3VyY2VQYXJ0LmZpbmRHcm91cChzY29wZSwgc291cmNlLCB3cmFwKTtcblx0fVxuXG5cdGFkZEdyb3VwKGxvY2F0aW9uOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCBkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uKTogSUVkaXRvckdyb3VwVmlldyB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGFydChsb2NhdGlvbikuYWRkR3JvdXAobG9jYXRpb24sIGRpcmVjdGlvbik7XG5cdH1cblxuXHRyZW1vdmVHcm91cChncm91cDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllcik6IHZvaWQge1xuXHRcdHRoaXMuZ2V0UGFydChncm91cCkucmVtb3ZlR3JvdXAoZ3JvdXApO1xuXHR9XG5cblx0bW92ZUdyb3VwKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCBsb2NhdGlvbjogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbik6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdHJldHVybiB0aGlzLmdldFBhcnQoZ3JvdXApLm1vdmVHcm91cChncm91cCwgbG9jYXRpb24sIGRpcmVjdGlvbik7XG5cdH1cblxuXHRtZXJnZUdyb3VwKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCB0YXJnZXQ6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJTWVyZ2VHcm91cE9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRQYXJ0KGdyb3VwKS5tZXJnZUdyb3VwKGdyb3VwLCB0YXJnZXQsIG9wdGlvbnMpO1xuXHR9XG5cblx0bWVyZ2VBbGxHcm91cHModGFyZ2V0OiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSU1lcmdlR3JvdXBPcHRpb25zKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aXZlUGFydC5tZXJnZUFsbEdyb3Vwcyh0YXJnZXQsIG9wdGlvbnMpO1xuXHR9XG5cblx0Y29weUdyb3VwKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCBsb2NhdGlvbjogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbik6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdHJldHVybiB0aGlzLmdldFBhcnQoZ3JvdXApLmNvcHlHcm91cChncm91cCwgbG9jYXRpb24sIGRpcmVjdGlvbik7XG5cdH1cblxuXHRjcmVhdGVFZGl0b3JEcm9wVGFyZ2V0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGRlbGVnYXRlOiBJRWRpdG9yRHJvcFRhcmdldERlbGVnYXRlKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLmdldFBhcnQoY29udGFpbmVyKS5jcmVhdGVFZGl0b3JEcm9wVGFyZ2V0KGNvbnRhaW5lciwgZGVsZWdhdGUpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEVkaXRvciBHcm91cCBDb250ZXh0IEtleSBIYW5kbGluZ1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZ2xvYmFsQ29udGV4dEtleXMgPSBuZXcgTWFwPHN0cmluZywgSUNvbnRleHRLZXk8Q29udGV4dEtleVZhbHVlPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBzY29wZWRDb250ZXh0S2V5cyA9IG5ldyBNYXA8R3JvdXBJZGVudGlmaWVyLCBNYXA8c3RyaW5nLCBJQ29udGV4dEtleTxDb250ZXh0S2V5VmFsdWU+Pj4oKTtcblxuXHRwcml2YXRlIHJlZ2lzdGVyR3JvdXBzQ29udGV4dEtleUxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQWN0aXZlR3JvdXAoKCkgPT4gdGhpcy51cGRhdGVHbG9iYWxDb250ZXh0S2V5cygpKSk7XG5cdFx0dGhpcy5ncm91cHMuZm9yRWFjaChncm91cCA9PiB0aGlzLnJlZ2lzdGVyR3JvdXBDb250ZXh0S2V5UHJvdmlkZXJzTGlzdGVuZXJzKGdyb3VwKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZEFkZEdyb3VwKGdyb3VwID0+IHRoaXMucmVnaXN0ZXJHcm91cENvbnRleHRLZXlQcm92aWRlcnNMaXN0ZW5lcnMoZ3JvdXApKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZFJlbW92ZUdyb3VwKGdyb3VwID0+IHtcblx0XHRcdHRoaXMuc2NvcGVkQ29udGV4dEtleXMuZGVsZXRlKGdyb3VwLmlkKTtcblx0XHRcdHRoaXMucmVnaXN0ZXJlZENvbnRleHRLZXlzLmRlbGV0ZShncm91cC5pZCk7XG5cdFx0XHR0aGlzLmNvbnRleHRLZXlQcm92aWRlckRpc3Bvc2FibGVzLmRlbGV0ZUFuZERpc3Bvc2UoZ3JvdXAuaWQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlR2xvYmFsQ29udGV4dEtleXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlR3JvdXBTY29wZWRDb250ZXh0S2V5cyA9IHRoaXMuc2NvcGVkQ29udGV4dEtleXMuZ2V0KHRoaXMuYWN0aXZlR3JvdXAuaWQpO1xuXHRcdGlmICghYWN0aXZlR3JvdXBTY29wZWRDb250ZXh0S2V5cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW2tleSwgZ2xvYmFsQ29udGV4dEtleV0gb2YgdGhpcy5nbG9iYWxDb250ZXh0S2V5cykge1xuXHRcdFx0Y29uc3Qgc2NvcGVkQ29udGV4dEtleSA9IGFjdGl2ZUdyb3VwU2NvcGVkQ29udGV4dEtleXMuZ2V0KGtleSk7XG5cdFx0XHRpZiAoc2NvcGVkQ29udGV4dEtleSkge1xuXHRcdFx0XHRnbG9iYWxDb250ZXh0S2V5LnNldChzY29wZWRDb250ZXh0S2V5LmdldCgpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGdsb2JhbENvbnRleHRLZXkucmVzZXQoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRiaW5kPFQgZXh0ZW5kcyBDb250ZXh0S2V5VmFsdWU+KGNvbnRleHRLZXk6IFJhd0NvbnRleHRLZXk8VD4sIGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3KTogSUNvbnRleHRLZXk8VD4ge1xuXG5cdFx0Ly8gRW5zdXJlIHdlIG9ubHkgYmluZCB0byB0aGUgc2FtZSBjb250ZXh0IGtleSBvbmNlIGdsb2JhbHlcblx0XHRsZXQgZ2xvYmFsQ29udGV4dEtleSA9IHRoaXMuZ2xvYmFsQ29udGV4dEtleXMuZ2V0KGNvbnRleHRLZXkua2V5KTtcblx0XHRpZiAoIWdsb2JhbENvbnRleHRLZXkpIHtcblx0XHRcdGdsb2JhbENvbnRleHRLZXkgPSBjb250ZXh0S2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdHRoaXMuZ2xvYmFsQ29udGV4dEtleXMuc2V0KGNvbnRleHRLZXkua2V5LCBnbG9iYWxDb250ZXh0S2V5KTtcblx0XHR9XG5cblx0XHQvLyBFbnN1cmUgd2Ugb25seSBiaW5kIHRvIHRoZSBzYW1lIGNvbnRleHQga2V5IG9uY2UgcGVyIGdyb3VwXG5cdFx0bGV0IGdyb3VwU2NvcGVkQ29udGV4dEtleXMgPSB0aGlzLnNjb3BlZENvbnRleHRLZXlzLmdldChncm91cC5pZCk7XG5cdFx0aWYgKCFncm91cFNjb3BlZENvbnRleHRLZXlzKSB7XG5cdFx0XHRncm91cFNjb3BlZENvbnRleHRLZXlzID0gbmV3IE1hcDxzdHJpbmcsIElDb250ZXh0S2V5PENvbnRleHRLZXlWYWx1ZT4+KCk7XG5cdFx0XHR0aGlzLnNjb3BlZENvbnRleHRLZXlzLnNldChncm91cC5pZCwgZ3JvdXBTY29wZWRDb250ZXh0S2V5cyk7XG5cdFx0fVxuXHRcdGxldCBzY29wZWRDb250ZXh0S2V5ID0gZ3JvdXBTY29wZWRDb250ZXh0S2V5cy5nZXQoY29udGV4dEtleS5rZXkpO1xuXHRcdGlmICghc2NvcGVkQ29udGV4dEtleSkge1xuXHRcdFx0c2NvcGVkQ29udGV4dEtleSA9IGNvbnRleHRLZXkuYmluZFRvKGdyb3VwLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGdyb3VwU2NvcGVkQ29udGV4dEtleXMuc2V0KGNvbnRleHRLZXkua2V5LCBzY29wZWRDb250ZXh0S2V5KTtcblx0XHR9XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0KCk6IFQgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gc2NvcGVkQ29udGV4dEtleS5nZXQoKSBhcyBUIHwgdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdHNldCh2YWx1ZTogVCk6IHZvaWQge1xuXHRcdFx0XHRpZiAodGhhdC5hY3RpdmVHcm91cCA9PT0gZ3JvdXApIHtcblx0XHRcdFx0XHRnbG9iYWxDb250ZXh0S2V5LnNldCh2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2NvcGVkQ29udGV4dEtleS5zZXQodmFsdWUpO1xuXHRcdFx0fSxcblx0XHRcdHJlc2V0KCk6IHZvaWQge1xuXHRcdFx0XHRpZiAodGhhdC5hY3RpdmVHcm91cCA9PT0gZ3JvdXApIHtcblx0XHRcdFx0XHRnbG9iYWxDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2NvcGVkQ29udGV4dEtleS5yZXNldCgpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5UHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIElFZGl0b3JHcm91cENvbnRleHRLZXlQcm92aWRlcjxDb250ZXh0S2V5VmFsdWU+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlZ2lzdGVyZWRDb250ZXh0S2V5cyA9IG5ldyBNYXA8R3JvdXBJZGVudGlmaWVyLCBNYXA8c3RyaW5nLCBJQ29udGV4dEtleT4+KCk7XG5cblx0cmVnaXN0ZXJDb250ZXh0S2V5UHJvdmlkZXI8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZT4ocHJvdmlkZXI6IElFZGl0b3JHcm91cENvbnRleHRLZXlQcm92aWRlcjxUPik6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5jb250ZXh0S2V5UHJvdmlkZXJzLmhhcyhwcm92aWRlci5jb250ZXh0S2V5LmtleSkgfHwgdGhpcy5nbG9iYWxDb250ZXh0S2V5cy5oYXMocHJvdmlkZXIuY29udGV4dEtleS5rZXkpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEEgY29udGV4dCBrZXkgcHJvdmlkZXIgZm9yIGtleSAke3Byb3ZpZGVyLmNvbnRleHRLZXkua2V5fSBhbHJlYWR5IGV4aXN0cy5gKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRleHRLZXlQcm92aWRlcnMuc2V0KHByb3ZpZGVyLmNvbnRleHRLZXkua2V5LCBwcm92aWRlcik7XG5cblx0XHRjb25zdCBzZXRDb250ZXh0S2V5Rm9yR3JvdXBzID0gKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmdyb3Vwcykge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVJlZ2lzdGVyZWRDb250ZXh0S2V5KGdyb3VwLCBwcm92aWRlcik7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIFJ1biBpbml0aWFsbHkgYW5kIG9uIGNoYW5nZVxuXHRcdHNldENvbnRleHRLZXlGb3JHcm91cHMoKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZSA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlPy4oKCkgPT4gc2V0Q29udGV4dEtleUZvckdyb3VwcygpKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0b25EaWRDaGFuZ2U/LmRpc3Bvc2UoKTtcblxuXHRcdFx0dGhpcy5nbG9iYWxDb250ZXh0S2V5cy5kZWxldGUocHJvdmlkZXIuY29udGV4dEtleS5rZXkpO1xuXHRcdFx0dGhpcy5zY29wZWRDb250ZXh0S2V5cy5mb3JFYWNoKHNjb3BlZENvbnRleHRLZXlzID0+IHNjb3BlZENvbnRleHRLZXlzLmRlbGV0ZShwcm92aWRlci5jb250ZXh0S2V5LmtleSkpO1xuXG5cdFx0XHR0aGlzLmNvbnRleHRLZXlQcm92aWRlcnMuZGVsZXRlKHByb3ZpZGVyLmNvbnRleHRLZXkua2V5KTtcblx0XHRcdHRoaXMucmVnaXN0ZXJlZENvbnRleHRLZXlzLmZvckVhY2gocmVnaXN0ZXJlZENvbnRleHRLZXlzID0+IHJlZ2lzdGVyZWRDb250ZXh0S2V5cy5kZWxldGUocHJvdmlkZXIuY29udGV4dEtleS5rZXkpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVByb3ZpZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxHcm91cElkZW50aWZpZXIsIElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSByZWdpc3Rlckdyb3VwQ29udGV4dEtleVByb3ZpZGVyc0xpc3RlbmVycyhncm91cDogSUVkaXRvckdyb3VwVmlldyk6IHZvaWQge1xuXG5cdFx0Ly8gVXBkYXRlIGNvbnRleHQga2V5cyBmcm9tIHByb3ZpZGVycyBmb3IgdGhlIGdyb3VwIHdoZW4gaXRzIGFjdGl2ZSBlZGl0b3IgY2hhbmdlc1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBncm91cC5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGNvbnRleHRLZXlQcm92aWRlciBvZiB0aGlzLmNvbnRleHRLZXlQcm92aWRlcnMudmFsdWVzKCkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVSZWdpc3RlcmVkQ29udGV4dEtleShncm91cCwgY29udGV4dEtleVByb3ZpZGVyKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuY29udGV4dEtleVByb3ZpZGVyRGlzcG9zYWJsZXMuc2V0KGdyb3VwLmlkLCBkaXNwb3NhYmxlKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUmVnaXN0ZXJlZENvbnRleHRLZXk8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZT4oZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcsIHByb3ZpZGVyOiBJRWRpdG9yR3JvdXBDb250ZXh0S2V5UHJvdmlkZXI8VD4pOiB2b2lkIHtcblxuXHRcdC8vIEdldCB0aGUgZ3JvdXAgc2NvcGVkIGNvbnRleHQga2V5cyBmb3IgdGhlIHByb3ZpZGVyXG5cdFx0Ly8gSWYgdGhlIHByb3ZpZGVycyBjb250ZXh0IGtleSBoYXMgbm90IHlldCBiZWVuIGJvdW5kXG5cdFx0Ly8gdG8gdGhlIGdyb3VwLCBkbyBzbyBub3cuXG5cblx0XHRsZXQgZ3JvdXBSZWdpc3RlcmVkQ29udGV4dEtleXMgPSB0aGlzLnJlZ2lzdGVyZWRDb250ZXh0S2V5cy5nZXQoZ3JvdXAuaWQpO1xuXHRcdGlmICghZ3JvdXBSZWdpc3RlcmVkQ29udGV4dEtleXMpIHtcblx0XHRcdGdyb3VwUmVnaXN0ZXJlZENvbnRleHRLZXlzID0gbmV3IE1hcDxzdHJpbmcsIElDb250ZXh0S2V5PigpO1xuXHRcdFx0dGhpcy5yZWdpc3RlcmVkQ29udGV4dEtleXMuc2V0KGdyb3VwLmlkLCBncm91cFJlZ2lzdGVyZWRDb250ZXh0S2V5cyk7XG5cdFx0fVxuXG5cdFx0bGV0IHNjb3BlZFJlZ2lzdGVyZWRDb250ZXh0S2V5ID0gZ3JvdXBSZWdpc3RlcmVkQ29udGV4dEtleXMuZ2V0KHByb3ZpZGVyLmNvbnRleHRLZXkua2V5KTtcblx0XHRpZiAoIXNjb3BlZFJlZ2lzdGVyZWRDb250ZXh0S2V5KSB7XG5cdFx0XHRzY29wZWRSZWdpc3RlcmVkQ29udGV4dEtleSA9IHRoaXMuYmluZChwcm92aWRlci5jb250ZXh0S2V5LCBncm91cCk7XG5cdFx0XHRncm91cFJlZ2lzdGVyZWRDb250ZXh0S2V5cy5zZXQocHJvdmlkZXIuY29udGV4dEtleS5rZXksIHNjb3BlZFJlZ2lzdGVyZWRDb250ZXh0S2V5KTtcblx0XHR9XG5cblx0XHQvLyBTZXQgdGhlIGNvbnRleHQga2V5IHZhbHVlIGZvciB0aGUgZ3JvdXAgY29udGV4dFxuXHRcdHNjb3BlZFJlZ2lzdGVyZWRDb250ZXh0S2V5LnNldChwcm92aWRlci5nZXRHcm91cENvbnRleHRLZXlWYWx1ZShncm91cCkpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIE1haW4gRWRpdG9yIFBhcnQgT25seVxuXG5cdGdldCBwYXJ0T3B0aW9ucygpIHsgcmV0dXJuIHRoaXMubWFpblBhcnQucGFydE9wdGlvbnM7IH1cblx0Z2V0IG9uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnMoKSB7IHJldHVybiB0aGlzLm1haW5QYXJ0Lm9uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnM7IH1cblxuXHRlbmZvcmNlUGFydE9wdGlvbnMob3B0aW9uczogRGVlcFBhcnRpYWw8SUVkaXRvclBhcnRPcHRpb25zPik6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5tYWluUGFydC5lbmZvcmNlUGFydE9wdGlvbnMob3B0aW9ucyk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUVkaXRvckdyb3Vwc1NlcnZpY2UsIEVkaXRvclBhcnRzLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTRCLHVCQUF1QyxlQUFvRCxhQUE4Riw0QkFBNEw7QUFDalosU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZSxpQkFBOEIsb0JBQW9CO0FBRTFFLFNBQXlDLHNCQUFzQjtBQUUvRCxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBNEQ7QUFDckUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBMkMsY0FBYyxxQkFBcUI7QUFDdkYsU0FBUyxxQkFBcUI7QUFDOUIsU0FBc0MsK0JBQStCO0FBQ3JFLFNBQVMsb0JBQW9CO0FBQzdCLFNBQXVDLDBCQUF5QztBQUNoRixTQUFTLGtCQUE4QixZQUFZLHFCQUFxQjtBQUN4RSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLHFDQUFxQztBQThCdkMsSUFBTSxjQUFOLGNBQTBCLGlCQUFvRztBQUFBLEVBYXBJLFlBQzJD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QTJCLElBQUksU0FBUyx3QkFBd0IsS0FBSyxDQUFDO0FBQUEsRUFDdkU7QUFBQTtBQUFBO0FBQUEsRUFNQSxJQUFJLGNBQWM7QUFBRSxXQUFPLEtBQUssU0FBUztBQUFBLEVBQWE7QUFBQSxFQUN0RCxJQUFJLCtCQUErQjtBQUFFLFdBQU8sS0FBSyxTQUFTO0FBQUEsRUFBOEI7QUFBQSxFQUV4RixtQkFBbUIsU0FBdUQ7QUFDekUsV0FBTyxLQUFLLFNBQVMsbUJBQW1CLE9BQU87QUFBQSxFQUNoRDtBQUFBO0FBR0Q7QUFBQTtBQUFBO0FBbDlCYSxZQXFXWSxvQ0FBb0M7QUFyV2hELFlBc1dZLGlDQUFpQztBQUFBO0FBQUE7QUF0VzdDLFlBcWhCWSxrQ0FBa0M7QUFyaEI5QyxjQUFOO0FBQUEsRUFjSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWxCVTtBQW85QmIsa0JBQWtCLHNCQUFzQixhQUFhLGtCQUFrQixLQUFLOyIsCiAgIm5hbWVzIjogWyJtYWluUGFydEluc3RhbnRpYXRpb25TZXJ2aWNlIiwgInBhcnQiXQp9Cg==
