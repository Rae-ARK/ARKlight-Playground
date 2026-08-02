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
import { BroadcastDataChannel } from "../../../../base/browser/broadcast.js";
import { isSafari } from "../../../../base/browser/browser.js";
import { getActiveWindow } from "../../../../base/browser/dom.js";
import { IndexedDB } from "../../../../base/browser/indexedDB.js";
import { DeferredPromise, Promises } from "../../../../base/common/async.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { InMemoryStorageDatabase, isStorageItemsChangeEvent, Storage } from "../../../../base/parts/storage/common/storage.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { AbstractStorageService, isProfileUsingDefaultStorage, IS_NEW_KEY, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { isUserDataProfile } from "../../../../platform/userDataProfile/common/userDataProfile.js";
let BrowserStorageService = class extends AbstractStorageService {
  constructor(workspace, userDataProfileService, logService) {
    super({ flushInterval: BrowserStorageService.BROWSER_DEFAULT_FLUSH_INTERVAL });
    this.workspace = workspace;
    this.userDataProfileService = userDataProfileService;
    this.logService = logService;
    this.applicationStoragePromise = new DeferredPromise();
    this.profileStorageDisposables = this._register(new DisposableStore());
    this.profileStorageProfile = this.userDataProfileService.currentProfile;
    this.registerListeners();
  }
  get hasPendingUpdate() {
    return Boolean(
      this.applicationStorageDatabase?.hasPendingUpdate || this.applicationSharedStorageDatabase?.hasPendingUpdate || this.profileStorageDatabase?.hasPendingUpdate || this.workspaceStorageDatabase?.hasPendingUpdate
    );
  }
  async getApplicationStorageValue(key) {
    return (await this.applicationStoragePromise.p).indexedDb.getValue(key);
  }
  async compareAndSwapApplicationStorage(key, expectedValue, newValue) {
    return (await this.applicationStoragePromise.p).indexedDb.compareAndSwap(key, expectedValue, newValue);
  }
  registerListeners() {
    this._register(this.userDataProfileService.onDidChangeCurrentProfile((e) => e.join(this.switchToProfile(e.profile))));
  }
  async doInitialize() {
    await Promises.settled([
      this.createApplicationStorage(),
      this.createApplicationSharedStorage(),
      this.createProfileStorage(this.profileStorageProfile),
      this.createWorkspaceStorage()
    ]);
  }
  async createApplicationStorage() {
    const applicationStorageIndexedDB = await IndexedDBStorageDatabase.createApplicationStorage(this.logService);
    this.applicationStorageDatabase = this._register(applicationStorageIndexedDB);
    this.applicationStorage = this._register(new Storage(this.applicationStorageDatabase));
    this._register(this.applicationStorage.onDidChangeStorage((e) => this.emitDidChangeValue(StorageScope.APPLICATION, e)));
    await this.applicationStorage.init();
    this.updateIsNew(this.applicationStorage);
    this.applicationStoragePromise.complete({ indexedDb: applicationStorageIndexedDB, storage: this.applicationStorage });
  }
  async createApplicationSharedStorage() {
    const applicationSharedStorageIndexedDB = await IndexedDBStorageDatabase.createApplicationSharedStorage(this.logService);
    this.applicationSharedStorageDatabase = this._register(applicationSharedStorageIndexedDB);
    this.applicationSharedStorage = this._register(new Storage(this.applicationSharedStorageDatabase));
    this._register(this.applicationSharedStorage.onDidChangeStorage((e) => this.emitDidChangeValue(StorageScope.APPLICATION_SHARED, e)));
    await this.applicationSharedStorage.init();
    this.updateIsNew(this.applicationSharedStorage);
  }
  async createProfileStorage(profile) {
    this.profileStorageDisposables.clear();
    this.profileStorageProfile = profile;
    if (isProfileUsingDefaultStorage(this.profileStorageProfile)) {
      const { indexedDb: applicationStorageIndexedDB, storage: applicationStorage } = await this.applicationStoragePromise.p;
      this.profileStorageDatabase = applicationStorageIndexedDB;
      this.profileStorage = applicationStorage;
      this.profileStorageDisposables.add(this.profileStorage.onDidChangeStorage((e) => this.emitDidChangeValue(StorageScope.PROFILE, e)));
    } else {
      const profileStorageIndexedDB = await IndexedDBStorageDatabase.createProfileStorage(this.profileStorageProfile, this.logService);
      this.profileStorageDatabase = this.profileStorageDisposables.add(profileStorageIndexedDB);
      this.profileStorage = this.profileStorageDisposables.add(new Storage(this.profileStorageDatabase));
      this.profileStorageDisposables.add(this.profileStorage.onDidChangeStorage((e) => this.emitDidChangeValue(StorageScope.PROFILE, e)));
      await this.profileStorage.init();
      this.updateIsNew(this.profileStorage);
    }
  }
  async createWorkspaceStorage() {
    const workspaceStorageIndexedDB = await IndexedDBStorageDatabase.createWorkspaceStorage(this.workspace.id, this.logService);
    this.workspaceStorageDatabase = this._register(workspaceStorageIndexedDB);
    this.workspaceStorage = this._register(new Storage(this.workspaceStorageDatabase));
    this._register(this.workspaceStorage.onDidChangeStorage((e) => this.emitDidChangeValue(StorageScope.WORKSPACE, e)));
    await this.workspaceStorage.init();
    this.updateIsNew(this.workspaceStorage);
  }
  updateIsNew(storage) {
    const firstOpen = storage.getBoolean(IS_NEW_KEY);
    if (firstOpen === void 0) {
      storage.set(IS_NEW_KEY, true);
    } else if (firstOpen) {
      storage.set(IS_NEW_KEY, false);
    }
  }
  getStorage(scope) {
    switch (scope) {
      case StorageScope.APPLICATION_SHARED:
        return this.applicationSharedStorage;
      case StorageScope.APPLICATION:
        return this.applicationStorage;
      case StorageScope.PROFILE:
        return this.profileStorage;
      default:
        return this.workspaceStorage;
    }
  }
  getLogDetails(scope) {
    switch (scope) {
      case StorageScope.APPLICATION_SHARED:
        return this.applicationSharedStorageDatabase?.name;
      case StorageScope.APPLICATION:
        return this.applicationStorageDatabase?.name;
      case StorageScope.PROFILE:
        return this.profileStorageDatabase?.name;
      default:
        return this.workspaceStorageDatabase?.name;
    }
  }
  async switchToProfile(toProfile) {
    if (!this.canSwitchProfile(this.profileStorageProfile, toProfile)) {
      return;
    }
    const oldProfileStorage = assertReturnsDefined(this.profileStorage);
    const oldItems = oldProfileStorage.items;
    if (oldProfileStorage !== this.applicationStorage) {
      await oldProfileStorage.close();
    }
    await this.createProfileStorage(toProfile);
    this.switchData(oldItems, assertReturnsDefined(this.profileStorage), StorageScope.PROFILE);
  }
  async switchToWorkspace(toWorkspace, preserveData) {
    throw new Error("Migrating storage is currently unsupported in Web");
  }
  shouldFlushWhenIdle() {
    return getActiveWindow().document.hasFocus() && !this.hasPendingUpdate;
  }
  close() {
    if (isSafari) {
      this.applicationStorage?.close();
      this.applicationSharedStorageDatabase?.close();
      this.profileStorageDatabase?.close();
      this.workspaceStorageDatabase?.close();
    }
    this.dispose();
  }
  async clear() {
    for (const scope of [StorageScope.APPLICATION, StorageScope.APPLICATION_SHARED, StorageScope.PROFILE, StorageScope.WORKSPACE]) {
      for (const target of [StorageTarget.USER, StorageTarget.MACHINE]) {
        for (const key of this.keys(scope, target)) {
          this.remove(key, scope);
        }
      }
      await this.getStorage(scope)?.whenFlushed();
    }
    await Promises.settled([
      this.applicationStorageDatabase?.clear() ?? Promise.resolve(),
      this.applicationSharedStorageDatabase?.clear() ?? Promise.resolve(),
      this.profileStorageDatabase?.clear() ?? Promise.resolve(),
      this.workspaceStorageDatabase?.clear() ?? Promise.resolve()
    ]);
  }
  hasScope(scope) {
    if (isUserDataProfile(scope)) {
      return this.profileStorageProfile.id === scope.id;
    }
    return this.workspace.id === scope.id;
  }
};
BrowserStorageService.BROWSER_DEFAULT_FLUSH_INTERVAL = 5 * 1e3;
BrowserStorageService = __decorateClass([
  __decorateParam(2, ILogService)
], BrowserStorageService);
class InMemoryIndexedDBStorageDatabase extends InMemoryStorageDatabase {
  constructor() {
    super(...arguments);
    this.hasPendingUpdate = false;
    this.name = "in-memory-indexedb-storage";
  }
  async getValue(key) {
    return (await this.getItems()).get(key);
  }
  async compareAndSwap(key, expectedValue, newValue) {
    const items = await this.getItems();
    const currentValue = items.get(key);
    if (currentValue !== expectedValue) {
      return { swapped: false, currentValue };
    }
    await this.updateItems({ insert: /* @__PURE__ */ new Map([[key, newValue]]) });
    return { swapped: true, currentValue: newValue };
  }
  async clear() {
    (await this.getItems()).clear();
  }
  dispose() {
  }
}
const _IndexedDBStorageDatabase = class _IndexedDBStorageDatabase extends Disposable {
  constructor(options, logService) {
    super();
    this.logService = logService;
    this._onDidChangeItemsExternal = this._register(new Emitter());
    this.onDidChangeItemsExternal = this._onDidChangeItemsExternal.event;
    this.pendingUpdate = void 0;
    this.name = `${_IndexedDBStorageDatabase.STORAGE_DATABASE_PREFIX}${options.id}`;
    this.broadcastChannel = options.broadcastChanges ? this._register(new BroadcastDataChannel(this.name)) : void 0;
    this.whenConnected = this.connect();
    this.registerListeners();
  }
  static async createApplicationStorage(logService) {
    return _IndexedDBStorageDatabase.create({ id: "global", broadcastChanges: true }, logService);
  }
  static async createApplicationSharedStorage(logService) {
    return _IndexedDBStorageDatabase.create({ id: "global-shared", broadcastChanges: true }, logService);
  }
  static async createProfileStorage(profile, logService) {
    return _IndexedDBStorageDatabase.create({ id: `global-${profile.id}`, broadcastChanges: true }, logService);
  }
  static async createWorkspaceStorage(workspaceId, logService) {
    return _IndexedDBStorageDatabase.create({ id: workspaceId }, logService);
  }
  static async create(options, logService) {
    try {
      const database = new _IndexedDBStorageDatabase(options, logService);
      await database.whenConnected;
      return database;
    } catch (error) {
      logService.error(`[IndexedDB Storage ${options.id}] create(): ${toErrorMessage(error, true)}`);
      return new InMemoryIndexedDBStorageDatabase();
    }
  }
  get hasPendingUpdate() {
    return !!this.pendingUpdate;
  }
  registerListeners() {
    if (this.broadcastChannel) {
      this._register(this.broadcastChannel.onDidReceiveData((data) => {
        if (isStorageItemsChangeEvent(data)) {
          this._onDidChangeItemsExternal.fire(data);
        }
      }));
    }
  }
  async connect() {
    try {
      return await IndexedDB.create(this.name, void 0, [_IndexedDBStorageDatabase.STORAGE_OBJECT_STORE]);
    } catch (error) {
      this.logService.error(`[IndexedDB Storage ${this.name}] connect() error: ${toErrorMessage(error)}`);
      throw error;
    }
  }
  async getItems() {
    const db = await this.whenConnected;
    function isValid(value) {
      return typeof value === "string";
    }
    return db.getKeyValues(_IndexedDBStorageDatabase.STORAGE_OBJECT_STORE, isValid);
  }
  async getValue(key) {
    const db = await this.whenConnected;
    const value = await db.runInTransaction(_IndexedDBStorageDatabase.STORAGE_OBJECT_STORE, "readonly", (objectStore) => objectStore.get(key));
    return typeof value === "string" ? value : void 0;
  }
  async updateItems(request) {
    let didUpdate = false;
    this.pendingUpdate = this.doUpdateItems(request);
    try {
      didUpdate = await this.pendingUpdate;
    } finally {
      this.pendingUpdate = void 0;
    }
    if (this.broadcastChannel && didUpdate) {
      const event = {
        changed: request.insert,
        deleted: request.delete
      };
      this.broadcastChannel.postData(event);
    }
  }
  async compareAndSwap(key, expectedValue, newValue) {
    const db = await this.whenConnected;
    const result = await db.compareAndSwap(
      _IndexedDBStorageDatabase.STORAGE_OBJECT_STORE,
      key,
      expectedValue,
      newValue,
      (value) => typeof value === "string"
    );
    if (result.swapped) {
      const event = { changed: /* @__PURE__ */ new Map([[key, newValue]]) };
      this._onDidChangeItemsExternal.fire(event);
      this.broadcastChannel?.postData(event);
    }
    return result;
  }
  async doUpdateItems(request) {
    const toInsert = request.insert;
    const toDelete = request.delete;
    if (!toInsert && !toDelete || toInsert?.size === 0 && toDelete?.size === 0) {
      return false;
    }
    const db = await this.whenConnected;
    await db.runInTransaction(_IndexedDBStorageDatabase.STORAGE_OBJECT_STORE, "readwrite", (objectStore) => {
      const requests = [];
      if (toInsert) {
        for (const [key, value] of toInsert) {
          requests.push(objectStore.put(value, key));
        }
      }
      if (toDelete) {
        for (const key of toDelete) {
          requests.push(objectStore.delete(key));
        }
      }
      return requests;
    });
    return true;
  }
  async optimize() {
  }
  async close() {
    const db = await this.whenConnected;
    await this.pendingUpdate;
    return db.close();
  }
  async clear() {
    const db = await this.whenConnected;
    await db.runInTransaction(_IndexedDBStorageDatabase.STORAGE_OBJECT_STORE, "readwrite", (objectStore) => objectStore.clear());
  }
};
_IndexedDBStorageDatabase.STORAGE_DATABASE_PREFIX = "vscode-web-state-db-";
_IndexedDBStorageDatabase.STORAGE_OBJECT_STORE = "ItemTable";
let IndexedDBStorageDatabase = _IndexedDBStorageDatabase;
export {
  BrowserStorageService,
  IndexedDBStorageDatabase
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zdG9yYWdlL2Jyb3dzZXIvc3RvcmFnZVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBCcm9hZGNhc3REYXRhQ2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm9hZGNhc3QuanMnO1xuaW1wb3J0IHsgaXNTYWZhcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvYnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEluZGV4ZWREQiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9pbmRleGVkREIuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlRGF0YWJhc2UsIGlzU3RvcmFnZUl0ZW1zQ2hhbmdlRXZlbnQsIElTdG9yYWdlLCBJU3RvcmFnZURhdGFiYXNlLCBJU3RvcmFnZUl0ZW1zQ2hhbmdlRXZlbnQsIElVcGRhdGVSZXF1ZXN0LCBTdG9yYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RTdG9yYWdlU2VydmljZSwgaXNQcm9maWxlVXNpbmdEZWZhdWx0U3RvcmFnZSwgSVNfTkVXX0tFWSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBpc1VzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhUHJvZmlsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyU3RvcmFnZVNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdFN0b3JhZ2VTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHN0YXRpYyBCUk9XU0VSX0RFRkFVTFRfRkxVU0hfSU5URVJWQUwgPSA1ICogMTAwMDsgLy8gZXZlcnkgNXMgYmVjYXVzZSBhc3luYyBvcGVyYXRpb25zIGFyZSBub3QgcGVybWl0dGVkIG9uIHNodXRkb3duXG5cblx0cHJpdmF0ZSBhcHBsaWNhdGlvblN0b3JhZ2U6IElTdG9yYWdlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFwcGxpY2F0aW9uU3RvcmFnZURhdGFiYXNlOiBJSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFwcGxpY2F0aW9uU3RvcmFnZVByb21pc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHsgaW5kZXhlZERiOiBJSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlOyBzdG9yYWdlOiBJU3RvcmFnZSB9PigpO1xuXG5cdHByaXZhdGUgYXBwbGljYXRpb25TaGFyZWRTdG9yYWdlOiBJU3RvcmFnZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2VEYXRhYmFzZTogSUluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHByb2ZpbGVTdG9yYWdlOiBJU3RvcmFnZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwcm9maWxlU3RvcmFnZURhdGFiYXNlOiBJSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHByb2ZpbGVTdG9yYWdlUHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZTtcblx0cHJpdmF0ZSByZWFkb25seSBwcm9maWxlU3RvcmFnZURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRwcml2YXRlIHdvcmtzcGFjZVN0b3JhZ2U6IElTdG9yYWdlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHdvcmtzcGFjZVN0b3JhZ2VEYXRhYmFzZTogSUluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZSB8IHVuZGVmaW5lZDtcblxuXHRnZXQgaGFzUGVuZGluZ1VwZGF0ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gQm9vbGVhbihcblx0XHRcdHRoaXMuYXBwbGljYXRpb25TdG9yYWdlRGF0YWJhc2U/Lmhhc1BlbmRpbmdVcGRhdGUgfHxcblx0XHRcdHRoaXMuYXBwbGljYXRpb25TaGFyZWRTdG9yYWdlRGF0YWJhc2U/Lmhhc1BlbmRpbmdVcGRhdGUgfHxcblx0XHRcdHRoaXMucHJvZmlsZVN0b3JhZ2VEYXRhYmFzZT8uaGFzUGVuZGluZ1VwZGF0ZSB8fFxuXHRcdFx0dGhpcy53b3Jrc3BhY2VTdG9yYWdlRGF0YWJhc2U/Lmhhc1BlbmRpbmdVcGRhdGVcblx0XHQpO1xuXHR9XG5cblx0YXN5bmMgZ2V0QXBwbGljYXRpb25TdG9yYWdlVmFsdWUoa2V5OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5hcHBsaWNhdGlvblN0b3JhZ2VQcm9taXNlLnApLmluZGV4ZWREYi5nZXRWYWx1ZShrZXkpO1xuXHR9XG5cblx0YXN5bmMgY29tcGFyZUFuZFN3YXBBcHBsaWNhdGlvblN0b3JhZ2Uoa2V5OiBzdHJpbmcsIGV4cGVjdGVkVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgbmV3VmFsdWU6IHN0cmluZyk6IFByb21pc2U8eyByZWFkb25seSBzd2FwcGVkOiBib29sZWFuOyByZWFkb25seSBjdXJyZW50VmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0cmV0dXJuIChhd2FpdCB0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZVByb21pc2UucCkuaW5kZXhlZERiLmNvbXBhcmVBbmRTd2FwKGtleSwgZXhwZWN0ZWRWYWx1ZSwgbmV3VmFsdWUpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2U6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHsgZmx1c2hJbnRlcnZhbDogQnJvd3NlclN0b3JhZ2VTZXJ2aWNlLkJST1dTRVJfREVGQVVMVF9GTFVTSF9JTlRFUlZBTCB9KTtcblxuXHRcdHRoaXMucHJvZmlsZVN0b3JhZ2VQcm9maWxlID0gdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VDdXJyZW50UHJvZmlsZShlID0+IGUuam9pbih0aGlzLnN3aXRjaFRvUHJvZmlsZShlLnByb2ZpbGUpKSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGRvSW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIEluaXQgc3RvcmFnZXNcblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKFtcblx0XHRcdHRoaXMuY3JlYXRlQXBwbGljYXRpb25TdG9yYWdlKCksXG5cdFx0XHR0aGlzLmNyZWF0ZUFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZSgpLFxuXHRcdFx0dGhpcy5jcmVhdGVQcm9maWxlU3RvcmFnZSh0aGlzLnByb2ZpbGVTdG9yYWdlUHJvZmlsZSksXG5cdFx0XHR0aGlzLmNyZWF0ZVdvcmtzcGFjZVN0b3JhZ2UoKVxuXHRcdF0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVBcHBsaWNhdGlvblN0b3JhZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYXBwbGljYXRpb25TdG9yYWdlSW5kZXhlZERCID0gYXdhaXQgSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLmNyZWF0ZUFwcGxpY2F0aW9uU3RvcmFnZSh0aGlzLmxvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5hcHBsaWNhdGlvblN0b3JhZ2VEYXRhYmFzZSA9IHRoaXMuX3JlZ2lzdGVyKGFwcGxpY2F0aW9uU3RvcmFnZUluZGV4ZWREQik7XG5cdFx0dGhpcy5hcHBsaWNhdGlvblN0b3JhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgU3RvcmFnZSh0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZURhdGFiYXNlKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZS5vbkRpZENoYW5nZVN0b3JhZ2UoZSA9PiB0aGlzLmVtaXREaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGUpKSk7XG5cblx0XHRhd2FpdCB0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZS5pbml0KCk7XG5cblx0XHR0aGlzLnVwZGF0ZUlzTmV3KHRoaXMuYXBwbGljYXRpb25TdG9yYWdlKTtcblxuXHRcdHRoaXMuYXBwbGljYXRpb25TdG9yYWdlUHJvbWlzZS5jb21wbGV0ZSh7IGluZGV4ZWREYjogYXBwbGljYXRpb25TdG9yYWdlSW5kZXhlZERCLCBzdG9yYWdlOiB0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlQXBwbGljYXRpb25TaGFyZWRTdG9yYWdlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZUluZGV4ZWREQiA9IGF3YWl0IEluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZS5jcmVhdGVBcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2UodGhpcy5sb2dTZXJ2aWNlKTtcblxuXHRcdHRoaXMuYXBwbGljYXRpb25TaGFyZWRTdG9yYWdlRGF0YWJhc2UgPSB0aGlzLl9yZWdpc3RlcihhcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2VJbmRleGVkREIpO1xuXHRcdHRoaXMuYXBwbGljYXRpb25TaGFyZWRTdG9yYWdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFN0b3JhZ2UodGhpcy5hcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2VEYXRhYmFzZSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2Uub25EaWRDaGFuZ2VTdG9yYWdlKGUgPT4gdGhpcy5lbWl0RGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRCwgZSkpKTtcblxuXHRcdGF3YWl0IHRoaXMuYXBwbGljYXRpb25TaGFyZWRTdG9yYWdlLmluaXQoKTtcblxuXHRcdHRoaXMudXBkYXRlSXNOZXcodGhpcy5hcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVQcm9maWxlU3RvcmFnZShwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBGaXJzdCBjbGVhciBhbnkgcHJldmlvdXNseSBhc3NvY2lhdGVkIGRpc3Bvc2FibGVzXG5cdFx0dGhpcy5wcm9maWxlU3RvcmFnZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHQvLyBSZW1lbWJlciBwcm9maWxlIGFzc29jaWF0ZWQgdG8gcHJvZmlsZSBzdG9yYWdlXG5cdFx0dGhpcy5wcm9maWxlU3RvcmFnZVByb2ZpbGUgPSBwcm9maWxlO1xuXG5cdFx0aWYgKGlzUHJvZmlsZVVzaW5nRGVmYXVsdFN0b3JhZ2UodGhpcy5wcm9maWxlU3RvcmFnZVByb2ZpbGUpKSB7XG5cblx0XHRcdC8vIElmIHdlIGFyZSB1c2luZyBkZWZhdWx0IHByb2ZpbGUgc3RvcmFnZSwgdGhlIHByb2ZpbGUgc3RvcmFnZSBpc1xuXHRcdFx0Ly8gYWN0dWFsbHkgdGhlIHNhbWUgYXMgYXBwbGljYXRpb24gc3RvcmFnZS4gQXMgc3VjaCB3ZVxuXHRcdFx0Ly8gYXZvaWQgY3JlYXRpbmcgdGhlIHN0b3JhZ2UgbGlicmFyeSBhIHNlY29uZCB0aW1lIG9uXG5cdFx0XHQvLyB0aGUgc2FtZSBEQi5cblxuXHRcdFx0Y29uc3QgeyBpbmRleGVkRGI6IGFwcGxpY2F0aW9uU3RvcmFnZUluZGV4ZWREQiwgc3RvcmFnZTogYXBwbGljYXRpb25TdG9yYWdlIH0gPSBhd2FpdCB0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZVByb21pc2UucDtcblxuXHRcdFx0dGhpcy5wcm9maWxlU3RvcmFnZURhdGFiYXNlID0gYXBwbGljYXRpb25TdG9yYWdlSW5kZXhlZERCO1xuXHRcdFx0dGhpcy5wcm9maWxlU3RvcmFnZSA9IGFwcGxpY2F0aW9uU3RvcmFnZTtcblxuXHRcdFx0dGhpcy5wcm9maWxlU3RvcmFnZURpc3Bvc2FibGVzLmFkZCh0aGlzLnByb2ZpbGVTdG9yYWdlLm9uRGlkQ2hhbmdlU3RvcmFnZShlID0+IHRoaXMuZW1pdERpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBlKSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwcm9maWxlU3RvcmFnZUluZGV4ZWREQiA9IGF3YWl0IEluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZS5jcmVhdGVQcm9maWxlU3RvcmFnZSh0aGlzLnByb2ZpbGVTdG9yYWdlUHJvZmlsZSwgdGhpcy5sb2dTZXJ2aWNlKTtcblxuXHRcdFx0dGhpcy5wcm9maWxlU3RvcmFnZURhdGFiYXNlID0gdGhpcy5wcm9maWxlU3RvcmFnZURpc3Bvc2FibGVzLmFkZChwcm9maWxlU3RvcmFnZUluZGV4ZWREQik7XG5cdFx0XHR0aGlzLnByb2ZpbGVTdG9yYWdlID0gdGhpcy5wcm9maWxlU3RvcmFnZURpc3Bvc2FibGVzLmFkZChuZXcgU3RvcmFnZSh0aGlzLnByb2ZpbGVTdG9yYWdlRGF0YWJhc2UpKTtcblxuXHRcdFx0dGhpcy5wcm9maWxlU3RvcmFnZURpc3Bvc2FibGVzLmFkZCh0aGlzLnByb2ZpbGVTdG9yYWdlLm9uRGlkQ2hhbmdlU3RvcmFnZShlID0+IHRoaXMuZW1pdERpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBlKSkpO1xuXG5cdFx0XHRhd2FpdCB0aGlzLnByb2ZpbGVTdG9yYWdlLmluaXQoKTtcblxuXHRcdFx0dGhpcy51cGRhdGVJc05ldyh0aGlzLnByb2ZpbGVTdG9yYWdlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZVdvcmtzcGFjZVN0b3JhZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlU3RvcmFnZUluZGV4ZWREQiA9IGF3YWl0IEluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZS5jcmVhdGVXb3Jrc3BhY2VTdG9yYWdlKHRoaXMud29ya3NwYWNlLmlkLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy53b3Jrc3BhY2VTdG9yYWdlRGF0YWJhc2UgPSB0aGlzLl9yZWdpc3Rlcih3b3Jrc3BhY2VTdG9yYWdlSW5kZXhlZERCKTtcblx0XHR0aGlzLndvcmtzcGFjZVN0b3JhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgU3RvcmFnZSh0aGlzLndvcmtzcGFjZVN0b3JhZ2VEYXRhYmFzZSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VTdG9yYWdlLm9uRGlkQ2hhbmdlU3RvcmFnZShlID0+IHRoaXMuZW1pdERpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIGUpKSk7XG5cblx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVN0b3JhZ2UuaW5pdCgpO1xuXG5cdFx0dGhpcy51cGRhdGVJc05ldyh0aGlzLndvcmtzcGFjZVN0b3JhZ2UpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJc05ldyhzdG9yYWdlOiBJU3RvcmFnZSk6IHZvaWQge1xuXHRcdGNvbnN0IGZpcnN0T3BlbiA9IHN0b3JhZ2UuZ2V0Qm9vbGVhbihJU19ORVdfS0VZKTtcblx0XHRpZiAoZmlyc3RPcGVuID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHN0b3JhZ2Uuc2V0KElTX05FV19LRVksIHRydWUpO1xuXHRcdH0gZWxzZSBpZiAoZmlyc3RPcGVuKSB7XG5cdFx0XHRzdG9yYWdlLnNldChJU19ORVdfS0VZLCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGdldFN0b3JhZ2Uoc2NvcGU6IFN0b3JhZ2VTY29wZSk6IElTdG9yYWdlIHwgdW5kZWZpbmVkIHtcblx0XHRzd2l0Y2ggKHNjb3BlKSB7XG5cdFx0XHRjYXNlIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTl9TSEFSRUQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLmFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZTtcblx0XHRcdGNhc2UgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5hcHBsaWNhdGlvblN0b3JhZ2U7XG5cdFx0XHRjYXNlIFN0b3JhZ2VTY29wZS5QUk9GSUxFOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5wcm9maWxlU3RvcmFnZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLndvcmtzcGFjZVN0b3JhZ2U7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGdldExvZ0RldGFpbHMoc2NvcGU6IFN0b3JhZ2VTY29wZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoIChzY29wZSkge1xuXHRcdFx0Y2FzZSBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVEOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5hcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2VEYXRhYmFzZT8ubmFtZTtcblx0XHRcdGNhc2UgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5hcHBsaWNhdGlvblN0b3JhZ2VEYXRhYmFzZT8ubmFtZTtcblx0XHRcdGNhc2UgU3RvcmFnZVNjb3BlLlBST0ZJTEU6XG5cdFx0XHRcdHJldHVybiB0aGlzLnByb2ZpbGVTdG9yYWdlRGF0YWJhc2U/Lm5hbWU7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VTdG9yYWdlRGF0YWJhc2U/Lm5hbWU7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHN3aXRjaFRvUHJvZmlsZSh0b1Byb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuY2FuU3dpdGNoUHJvZmlsZSh0aGlzLnByb2ZpbGVTdG9yYWdlUHJvZmlsZSwgdG9Qcm9maWxlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9sZFByb2ZpbGVTdG9yYWdlID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5wcm9maWxlU3RvcmFnZSk7XG5cdFx0Y29uc3Qgb2xkSXRlbXMgPSBvbGRQcm9maWxlU3RvcmFnZS5pdGVtcztcblxuXHRcdC8vIENsb3NlIG9sZCBwcm9maWxlIHN0b3JhZ2UgYnV0IG9ubHkgaWYgdGhpcyBpc1xuXHRcdC8vIGRpZmZlcmVudCBmcm9tIGFwcGxpY2F0aW9uIHN0b3JhZ2UhXG5cdFx0aWYgKG9sZFByb2ZpbGVTdG9yYWdlICE9PSB0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZSkge1xuXHRcdFx0YXdhaXQgb2xkUHJvZmlsZVN0b3JhZ2UuY2xvc2UoKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgbmV3IHByb2ZpbGUgc3RvcmFnZSAmIGluaXRcblx0XHRhd2FpdCB0aGlzLmNyZWF0ZVByb2ZpbGVTdG9yYWdlKHRvUHJvZmlsZSk7XG5cblx0XHQvLyBIYW5kbGUgZGF0YSBzd2l0Y2ggYW5kIGV2ZW50aW5nXG5cdFx0dGhpcy5zd2l0Y2hEYXRhKG9sZEl0ZW1zLCBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLnByb2ZpbGVTdG9yYWdlKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHN3aXRjaFRvV29ya3NwYWNlKHRvV29ya3NwYWNlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciwgcHJlc2VydmVEYXRhOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNaWdyYXRpbmcgc3RvcmFnZSBpcyBjdXJyZW50bHkgdW5zdXBwb3J0ZWQgaW4gV2ViJyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2hvdWxkRmx1c2hXaGVuSWRsZSgpOiBib29sZWFuIHtcblx0XHQvLyB0aGlzIGZsdXNoKCkgd2lsbCBwb3RlbnRpYWxseSBjYXVzZSBuZXcgc3RhdGUgdG8gYmUgc3RvcmVkXG5cdFx0Ly8gc2luY2UgbmV3IHN0YXRlIHdpbGwgb25seSBiZSBjcmVhdGVkIHdoaWxlIHRoZSBkb2N1bWVudFxuXHRcdC8vIGhhcyBmb2N1cywgb25lIG9wdGltaXphdGlvbiBpcyB0byBub3QgcnVuIHRoaXMgd2hlbiB0aGVcblx0XHQvLyBkb2N1bWVudCBoYXMgbm8gZm9jdXMsIGFzc3VtaW5nIHRoYXQgc3RhdGUgaGFzIG5vdCBjaGFuZ2VkXG5cdFx0Ly9cblx0XHQvLyBhbm90aGVyIG9wdGltaXphdGlvbiBpcyB0byBub3QgY29sbGVjdCBtb3JlIHN0YXRlIGlmIHdlXG5cdFx0Ly8gaGF2ZSBhIHBlbmRpbmcgdXBkYXRlIGFscmVhZHkgcnVubmluZyB3aGljaCBpbmRpY2F0ZXNcblx0XHQvLyB0aGF0IHRoZSBjb25uZWN0aW9uIGlzIGVpdGhlciBzbG93IG9yIGRpc2Nvbm5lY3RlZCBhbmRcblx0XHQvLyB0aHVzIHVuaGVhbHRoeS5cblx0XHRyZXR1cm4gZ2V0QWN0aXZlV2luZG93KCkuZG9jdW1lbnQuaGFzRm9jdXMoKSAmJiAhdGhpcy5oYXNQZW5kaW5nVXBkYXRlO1xuXHR9XG5cblx0Y2xvc2UoKTogdm9pZCB7XG5cblx0XHQvLyBTYWZhcmk6IHRoZXJlIGlzIGFuIGlzc3VlIHdoZXJlIHRoZSBwYWdlIGNhbiBoYW5nIG9uIGxvYWQgd2hlblxuXHRcdC8vIGEgcHJldmlvdXMgc2Vzc2lvbiBoYXMga2VwdCBJbmRleGVkREIgdHJhbnNhY3Rpb25zIHJ1bm5pbmcuXG5cdFx0Ly8gVGhlIG9ubHkgZml4IHNlZW1zIHRvIGJlIHRvIGNhbmNlbCBhbnkgcGVuZGluZyB0cmFuc2FjdGlvbnNcblx0XHQvLyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzNjI5NSlcblx0XHQvL1xuXHRcdC8vIE9uIGFsbCBvdGhlciBicm93c2Vycywgd2Uga2VlcCB0aGUgZGF0YWJhc2VzIG9wZW5lZCBiZWNhdXNlXG5cdFx0Ly8gd2UgZXhwZWN0IGRhdGEgdG8gYmUgd3JpdHRlbiB3aGVuIHRoZSB1bmxvYWQgaGFwcGVucy5cblx0XHRpZiAoaXNTYWZhcmkpIHtcblx0XHRcdHRoaXMuYXBwbGljYXRpb25TdG9yYWdlPy5jbG9zZSgpO1xuXHRcdFx0dGhpcy5hcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2VEYXRhYmFzZT8uY2xvc2UoKTtcblx0XHRcdHRoaXMucHJvZmlsZVN0b3JhZ2VEYXRhYmFzZT8uY2xvc2UoKTtcblx0XHRcdHRoaXMud29ya3NwYWNlU3RvcmFnZURhdGFiYXNlPy5jbG9zZSgpO1xuXHRcdH1cblxuXHRcdC8vIEFsd2F5cyBkaXNwb3NlIHRvIGVuc3VyZSB0aGF0IG5vIHRpbWVvdXRzIG9yIGNhbGxiYWNrc1xuXHRcdC8vIGdldCB0cmlnZ2VyZWQgaW4gdGhpcyBwaGFzZS5cblx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGFzeW5jIGNsZWFyKCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gQ2xlYXIga2V5L3ZhbHVlc1xuXHRcdGZvciAoY29uc3Qgc2NvcGUgb2YgW1N0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRCwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0VdKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHRhcmdldCBvZiBbU3RvcmFnZVRhcmdldC5VU0VSLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkVdKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIHRoaXMua2V5cyhzY29wZSwgdGFyZ2V0KSkge1xuXHRcdFx0XHRcdHRoaXMucmVtb3ZlKGtleSwgc2NvcGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoaXMuZ2V0U3RvcmFnZShzY29wZSk/LndoZW5GbHVzaGVkKCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgZGF0YWJhc2VzXG5cdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChbXG5cdFx0XHR0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZURhdGFiYXNlPy5jbGVhcigpID8/IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0dGhpcy5hcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2VEYXRhYmFzZT8uY2xlYXIoKSA/PyBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdHRoaXMucHJvZmlsZVN0b3JhZ2VEYXRhYmFzZT8uY2xlYXIoKSA/PyBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdHRoaXMud29ya3NwYWNlU3RvcmFnZURhdGFiYXNlPy5jbGVhcigpID8/IFByb21pc2UucmVzb2x2ZSgpXG5cdFx0XSk7XG5cdH1cblxuXHRoYXNTY29wZShzY29wZTogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJVXNlckRhdGFQcm9maWxlKTogYm9vbGVhbiB7XG5cdFx0aWYgKGlzVXNlckRhdGFQcm9maWxlKHNjb3BlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucHJvZmlsZVN0b3JhZ2VQcm9maWxlLmlkID09PSBzY29wZS5pZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2UuaWQgPT09IHNjb3BlLmlkO1xuXHR9XG59XG5cbmludGVyZmFjZSBJSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlIGV4dGVuZHMgSVN0b3JhZ2VEYXRhYmFzZSwgSURpc3Bvc2FibGUge1xuXG5cdC8qKlxuXHQgKiBOYW1lIG9mIHRoZSBkYXRhYmFzZS5cblx0ICovXG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblxuXHQvKipcblx0ICogV2hldGhlciBhbiB1cGRhdGUgaW4gdGhlIERCIGlzIGN1cnJlbnRseSBwZW5kaW5nXG5cdCAqIChlaXRoZXIgdXBkYXRlIG9yIGRlbGV0ZSBvcGVyYXRpb24pLlxuXHQgKi9cblx0cmVhZG9ubHkgaGFzUGVuZGluZ1VwZGF0ZTogYm9vbGVhbjtcblxuXHRnZXRWYWx1ZShrZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0Y29tcGFyZUFuZFN3YXAoa2V5OiBzdHJpbmcsIGV4cGVjdGVkVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgbmV3VmFsdWU6IHN0cmluZyk6IFByb21pc2U8eyByZWFkb25seSBzd2FwcGVkOiBib29sZWFuOyByZWFkb25seSBjdXJyZW50VmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCB9PjtcblxuXHQvKipcblx0ICogRm9yIHRlc3Rpbmcgb25seS5cblx0ICovXG5cdGNsZWFyKCk6IFByb21pc2U8dm9pZD47XG59XG5cbmNsYXNzIEluTWVtb3J5SW5kZXhlZERCU3RvcmFnZURhdGFiYXNlIGV4dGVuZHMgSW5NZW1vcnlTdG9yYWdlRGF0YWJhc2UgaW1wbGVtZW50cyBJSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlIHtcblxuXHRyZWFkb25seSBoYXNQZW5kaW5nVXBkYXRlID0gZmFsc2U7XG5cdHJlYWRvbmx5IG5hbWUgPSAnaW4tbWVtb3J5LWluZGV4ZWRiLXN0b3JhZ2UnO1xuXG5cdGFzeW5jIGdldFZhbHVlKGtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuZ2V0SXRlbXMoKSkuZ2V0KGtleSk7XG5cdH1cblxuXHRhc3luYyBjb21wYXJlQW5kU3dhcChrZXk6IHN0cmluZywgZXhwZWN0ZWRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBuZXdWYWx1ZTogc3RyaW5nKTogUHJvbWlzZTx7IHJlYWRvbmx5IHN3YXBwZWQ6IGJvb2xlYW47IHJlYWRvbmx5IGN1cnJlbnRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHRoaXMuZ2V0SXRlbXMoKTtcblx0XHRjb25zdCBjdXJyZW50VmFsdWUgPSBpdGVtcy5nZXQoa2V5KTtcblx0XHRpZiAoY3VycmVudFZhbHVlICE9PSBleHBlY3RlZFZhbHVlKSB7XG5cdFx0XHRyZXR1cm4geyBzd2FwcGVkOiBmYWxzZSwgY3VycmVudFZhbHVlIH07XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy51cGRhdGVJdGVtcyh7IGluc2VydDogbmV3IE1hcChbW2tleSwgbmV3VmFsdWVdXSkgfSk7XG5cdFx0cmV0dXJuIHsgc3dhcHBlZDogdHJ1ZSwgY3VycmVudFZhbHVlOiBuZXdWYWx1ZSB9O1xuXHR9XG5cblx0YXN5bmMgY2xlYXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0KGF3YWl0IHRoaXMuZ2V0SXRlbXMoKSkuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Ly8gTm8tb3Bcblx0fVxufVxuXG5pbnRlcmZhY2UgSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlT3B0aW9ucyB7XG5cdGlkOiBzdHJpbmc7XG5cdGJyb2FkY2FzdENoYW5nZXM/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElJbmRleGVkREJTdG9yYWdlRGF0YWJhc2Uge1xuXG5cdHN0YXRpYyBhc3luYyBjcmVhdGVBcHBsaWNhdGlvblN0b3JhZ2UobG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiBQcm9taXNlPElJbmRleGVkREJTdG9yYWdlRGF0YWJhc2U+IHtcblx0XHRyZXR1cm4gSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLmNyZWF0ZSh7IGlkOiAnZ2xvYmFsJywgYnJvYWRjYXN0Q2hhbmdlczogdHJ1ZSB9LCBsb2dTZXJ2aWNlKTtcblx0fVxuXG5cdHN0YXRpYyBhc3luYyBjcmVhdGVBcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2UobG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiBQcm9taXNlPElJbmRleGVkREJTdG9yYWdlRGF0YWJhc2U+IHtcblx0XHRyZXR1cm4gSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLmNyZWF0ZSh7IGlkOiAnZ2xvYmFsLXNoYXJlZCcsIGJyb2FkY2FzdENoYW5nZXM6IHRydWUgfSwgbG9nU2VydmljZSk7XG5cdH1cblxuXHRzdGF0aWMgYXN5bmMgY3JlYXRlUHJvZmlsZVN0b3JhZ2UocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiBQcm9taXNlPElJbmRleGVkREJTdG9yYWdlRGF0YWJhc2U+IHtcblx0XHRyZXR1cm4gSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLmNyZWF0ZSh7IGlkOiBgZ2xvYmFsLSR7cHJvZmlsZS5pZH1gLCBicm9hZGNhc3RDaGFuZ2VzOiB0cnVlIH0sIGxvZ1NlcnZpY2UpO1xuXHR9XG5cblx0c3RhdGljIGFzeW5jIGNyZWF0ZVdvcmtzcGFjZVN0b3JhZ2Uod29ya3NwYWNlSWQ6IHN0cmluZywgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiBQcm9taXNlPElJbmRleGVkREJTdG9yYWdlRGF0YWJhc2U+IHtcblx0XHRyZXR1cm4gSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLmNyZWF0ZSh7IGlkOiB3b3Jrc3BhY2VJZCB9LCBsb2dTZXJ2aWNlKTtcblx0fVxuXG5cdHN0YXRpYyBhc3luYyBjcmVhdGUob3B0aW9uczogSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlT3B0aW9ucywgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiBQcm9taXNlPElJbmRleGVkREJTdG9yYWdlRGF0YWJhc2U+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGF0YWJhc2UgPSBuZXcgSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlKG9wdGlvbnMsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0YXdhaXQgZGF0YWJhc2Uud2hlbkNvbm5lY3RlZDtcblxuXHRcdFx0cmV0dXJuIGRhdGFiYXNlO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRsb2dTZXJ2aWNlLmVycm9yKGBbSW5kZXhlZERCIFN0b3JhZ2UgJHtvcHRpb25zLmlkfV0gY3JlYXRlKCk6ICR7dG9FcnJvck1lc3NhZ2UoZXJyb3IsIHRydWUpfWApO1xuXG5cdFx0XHRyZXR1cm4gbmV3IEluTWVtb3J5SW5kZXhlZERCU3RvcmFnZURhdGFiYXNlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU1RPUkFHRV9EQVRBQkFTRV9QUkVGSVggPSAndnNjb2RlLXdlYi1zdGF0ZS1kYi0nO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTVE9SQUdFX09CSkVDVF9TVE9SRSA9ICdJdGVtVGFibGUnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSXRlbXNFeHRlcm5hbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTdG9yYWdlSXRlbXNDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSXRlbXNFeHRlcm5hbCA9IHRoaXMuX29uRGlkQ2hhbmdlSXRlbXNFeHRlcm5hbC5ldmVudDtcblxuXHRwcml2YXRlIGJyb2FkY2FzdENoYW5uZWw6IEJyb2FkY2FzdERhdGFDaGFubmVsPElTdG9yYWdlSXRlbXNDaGFuZ2VFdmVudD4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBwZW5kaW5nVXBkYXRlOiBQcm9taXNlPGJvb2xlYW4+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRnZXQgaGFzUGVuZGluZ1VwZGF0ZSgpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy5wZW5kaW5nVXBkYXRlOyB9XG5cblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IHdoZW5Db25uZWN0ZWQ6IFByb21pc2U8SW5kZXhlZERCPjtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IEluZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZU9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5uYW1lID0gYCR7SW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLlNUT1JBR0VfREFUQUJBU0VfUFJFRklYfSR7b3B0aW9ucy5pZH1gO1xuXHRcdHRoaXMuYnJvYWRjYXN0Q2hhbm5lbCA9IG9wdGlvbnMuYnJvYWRjYXN0Q2hhbmdlcyA/IHRoaXMuX3JlZ2lzdGVyKG5ldyBCcm9hZGNhc3REYXRhQ2hhbm5lbDxJU3RvcmFnZUl0ZW1zQ2hhbmdlRXZlbnQ+KHRoaXMubmFtZSkpIDogdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy53aGVuQ29ubmVjdGVkID0gdGhpcy5jb25uZWN0KCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIHN0b3JhZ2UgY2hhbmdlIGV2ZW50cyBmcm9tIG90aGVyXG5cdFx0Ly8gd2luZG93cy90YWJzIHZpYSBgQnJvYWRjYXN0Q2hhbm5lbGAgbWVjaGFuaXNtcy5cblx0XHRpZiAodGhpcy5icm9hZGNhc3RDaGFubmVsKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmJyb2FkY2FzdENoYW5uZWwub25EaWRSZWNlaXZlRGF0YShkYXRhID0+IHtcblx0XHRcdFx0aWYgKGlzU3RvcmFnZUl0ZW1zQ2hhbmdlRXZlbnQoZGF0YSkpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1zRXh0ZXJuYWwuZmlyZShkYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29ubmVjdCgpOiBQcm9taXNlPEluZGV4ZWREQj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgSW5kZXhlZERCLmNyZWF0ZSh0aGlzLm5hbWUsIHVuZGVmaW5lZCwgW0luZGV4ZWREQlN0b3JhZ2VEYXRhYmFzZS5TVE9SQUdFX09CSkVDVF9TVE9SRV0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtJbmRleGVkREIgU3RvcmFnZSAke3RoaXMubmFtZX1dIGNvbm5lY3QoKSBlcnJvcjogJHt0b0Vycm9yTWVzc2FnZShlcnJvcil9YCk7XG5cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldEl0ZW1zKCk6IFByb21pc2U8TWFwPHN0cmluZywgc3RyaW5nPj4ge1xuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy53aGVuQ29ubmVjdGVkO1xuXG5cdFx0ZnVuY3Rpb24gaXNWYWxpZCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJztcblx0XHR9XG5cblx0XHRyZXR1cm4gZGIuZ2V0S2V5VmFsdWVzPHN0cmluZz4oSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLlNUT1JBR0VfT0JKRUNUX1NUT1JFLCBpc1ZhbGlkKTtcblx0fVxuXG5cdGFzeW5jIGdldFZhbHVlKGtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMud2hlbkNvbm5lY3RlZDtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGRiLnJ1bkluVHJhbnNhY3Rpb24oSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLlNUT1JBR0VfT0JKRUNUX1NUT1JFLCAncmVhZG9ubHknLCBvYmplY3RTdG9yZSA9PiBvYmplY3RTdG9yZS5nZXQoa2V5KSk7XG5cdFx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyB2YWx1ZSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUl0ZW1zKHJlcXVlc3Q6IElVcGRhdGVSZXF1ZXN0KTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBSdW4gdGhlIHVwZGF0ZVxuXHRcdGxldCBkaWRVcGRhdGUgPSBmYWxzZTtcblx0XHR0aGlzLnBlbmRpbmdVcGRhdGUgPSB0aGlzLmRvVXBkYXRlSXRlbXMocmVxdWVzdCk7XG5cdFx0dHJ5IHtcblx0XHRcdGRpZFVwZGF0ZSA9IGF3YWl0IHRoaXMucGVuZGluZ1VwZGF0ZTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5wZW5kaW5nVXBkYXRlID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEJyb2FkY2FzdCBjaGFuZ2VzIHRvIG90aGVyIHdpbmRvd3MvdGFicyBpZiBlbmFibGVkXG5cdFx0Ly8gYW5kIG9ubHkgaWYgd2UgYWN0dWFsbHkgZGlkIHVwZGF0ZSBzdG9yYWdlIGl0ZW1zLlxuXHRcdGlmICh0aGlzLmJyb2FkY2FzdENoYW5uZWwgJiYgZGlkVXBkYXRlKSB7XG5cdFx0XHRjb25zdCBldmVudDogSVN0b3JhZ2VJdGVtc0NoYW5nZUV2ZW50ID0ge1xuXHRcdFx0XHRjaGFuZ2VkOiByZXF1ZXN0Lmluc2VydCxcblx0XHRcdFx0ZGVsZXRlZDogcmVxdWVzdC5kZWxldGVcblx0XHRcdH07XG5cblx0XHRcdHRoaXMuYnJvYWRjYXN0Q2hhbm5lbC5wb3N0RGF0YShldmVudCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY29tcGFyZUFuZFN3YXAoa2V5OiBzdHJpbmcsIGV4cGVjdGVkVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgbmV3VmFsdWU6IHN0cmluZyk6IFByb21pc2U8eyByZWFkb25seSBzd2FwcGVkOiBib29sZWFuOyByZWFkb25seSBjdXJyZW50VmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLndoZW5Db25uZWN0ZWQ7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZGIuY29tcGFyZUFuZFN3YXAoXG5cdFx0XHRJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuU1RPUkFHRV9PQkpFQ1RfU1RPUkUsXG5cdFx0XHRrZXksXG5cdFx0XHRleHBlY3RlZFZhbHVlLFxuXHRcdFx0bmV3VmFsdWUsXG5cdFx0XHQodmFsdWUpOiB2YWx1ZSBpcyBzdHJpbmcgPT4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyxcblx0XHQpO1xuXHRcdGlmIChyZXN1bHQuc3dhcHBlZCkge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSB7IGNoYW5nZWQ6IG5ldyBNYXAoW1trZXksIG5ld1ZhbHVlXV0pIH07XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1zRXh0ZXJuYWwuZmlyZShldmVudCk7XG5cdFx0XHR0aGlzLmJyb2FkY2FzdENoYW5uZWw/LnBvc3REYXRhKGV2ZW50KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9VcGRhdGVJdGVtcyhyZXF1ZXN0OiBJVXBkYXRlUmVxdWVzdCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Ly8gUmV0dXJuIGVhcmx5IGlmIHRoZSByZXF1ZXN0IGlzIGVtcHR5XG5cdFx0Y29uc3QgdG9JbnNlcnQgPSByZXF1ZXN0Lmluc2VydDtcblx0XHRjb25zdCB0b0RlbGV0ZSA9IHJlcXVlc3QuZGVsZXRlO1xuXHRcdGlmICgoIXRvSW5zZXJ0ICYmICF0b0RlbGV0ZSkgfHwgKHRvSW5zZXJ0Py5zaXplID09PSAwICYmIHRvRGVsZXRlPy5zaXplID09PSAwKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy53aGVuQ29ubmVjdGVkO1xuXG5cdFx0Ly8gVXBkYXRlIGBJdGVtVGFibGVgIHdpdGggaW5zZXJ0cyBhbmQvb3IgZGVsZXRlc1xuXHRcdGF3YWl0IGRiLnJ1bkluVHJhbnNhY3Rpb24oSW5kZXhlZERCU3RvcmFnZURhdGFiYXNlLlNUT1JBR0VfT0JKRUNUX1NUT1JFLCAncmVhZHdyaXRlJywgb2JqZWN0U3RvcmUgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdHM6IElEQlJlcXVlc3RbXSA9IFtdO1xuXG5cdFx0XHQvLyBJbnNlcnRzXG5cdFx0XHRpZiAodG9JbnNlcnQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgdG9JbnNlcnQpIHtcblx0XHRcdFx0XHRyZXF1ZXN0cy5wdXNoKG9iamVjdFN0b3JlLnB1dCh2YWx1ZSwga2V5KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gRGVsZXRlc1xuXHRcdFx0aWYgKHRvRGVsZXRlKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIHRvRGVsZXRlKSB7XG5cdFx0XHRcdFx0cmVxdWVzdHMucHVzaChvYmplY3RTdG9yZS5kZWxldGUoa2V5KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlcXVlc3RzO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyBvcHRpbWl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBub3Qgc3Vwb3J0ZWQgaW4gSW5kZXhlZERCXG5cdH1cblxuXHRhc3luYyBjbG9zZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMud2hlbkNvbm5lY3RlZDtcblxuXHRcdC8vIFdhaXQgZm9yIHBlbmRpbmcgdXBkYXRlcyB0byBoYXZpbmcgZmluaXNoZWRcblx0XHRhd2FpdCB0aGlzLnBlbmRpbmdVcGRhdGU7XG5cblx0XHQvLyBGaW5hbGx5LCBjbG9zZSBJbmRleGVkREJcblx0XHRyZXR1cm4gZGIuY2xvc2UoKTtcblx0fVxuXG5cdGFzeW5jIGNsZWFyKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy53aGVuQ29ubmVjdGVkO1xuXG5cdFx0YXdhaXQgZGIucnVuSW5UcmFuc2FjdGlvbihJbmRleGVkREJTdG9yYWdlRGF0YWJhc2UuU1RPUkFHRV9PQkpFQ1RfU1RPUkUsICdyZWFkd3JpdGUnLCBvYmplY3RTdG9yZSA9PiBvYmplY3RTdG9yZS5jbGVhcigpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGlCQUFpQixnQkFBZ0I7QUFDMUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUIsMkJBQWlHLGVBQWU7QUFDbEosU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx3QkFBd0IsOEJBQThCLFlBQVksY0FBYyxxQkFBcUI7QUFDOUcsU0FBUyx5QkFBMkM7QUFJN0MsSUFBTSx3QkFBTixjQUFvQyx1QkFBdUI7QUFBQSxFQW9DakUsWUFDa0IsV0FDQSx3QkFDYSxZQUM3QjtBQUNELFVBQU0sRUFBRSxlQUFlLHNCQUFzQiwrQkFBK0IsQ0FBQztBQUo1RDtBQUNBO0FBQ2E7QUFqQy9CLFNBQWlCLDRCQUE0QixJQUFJLGdCQUE2RTtBQVE5SCxTQUFpQiw0QkFBNEIsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUE2QmhGLFNBQUssd0JBQXdCLEtBQUssdUJBQXVCO0FBRXpELFNBQUssa0JBQWtCO0FBQUEsRUFDeEI7QUFBQSxFQTNCQSxJQUFJLG1CQUE0QjtBQUMvQixXQUFPO0FBQUEsTUFDTixLQUFLLDRCQUE0QixvQkFDakMsS0FBSyxrQ0FBa0Msb0JBQ3ZDLEtBQUssd0JBQXdCLG9CQUM3QixLQUFLLDBC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
