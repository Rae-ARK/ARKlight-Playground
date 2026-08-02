import { Promises, RunOnceScheduler, runWhenGlobalIdle } from "../../../base/common/async.js";
import { Emitter, Event, PauseableEmitter } from "../../../base/common/event.js";
import { Disposable, dispose, MutableDisposable } from "../../../base/common/lifecycle.js";
import { mark } from "../../../base/common/performance.js";
import { isUndefinedOrNull } from "../../../base/common/types.js";
import { InMemoryStorageDatabase, Storage, StorageHint } from "../../../base/parts/storage/common/storage.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { isUserDataProfile } from "../../userDataProfile/common/userDataProfile.js";
const IS_NEW_KEY = "__$__isNewStorageMarker";
const TARGET_KEY = "__$__targetStorageMarker";
const IStorageService = createDecorator("storageService");
var WillSaveStateReason = /* @__PURE__ */ ((WillSaveStateReason2) => {
  WillSaveStateReason2[WillSaveStateReason2["NONE"] = 0] = "NONE";
  WillSaveStateReason2[WillSaveStateReason2["SHUTDOWN"] = 1] = "SHUTDOWN";
  return WillSaveStateReason2;
})(WillSaveStateReason || {});
var StorageScope = /* @__PURE__ */ ((StorageScope2) => {
  StorageScope2[StorageScope2["APPLICATION_SHARED"] = -2] = "APPLICATION_SHARED";
  StorageScope2[StorageScope2["APPLICATION"] = -1] = "APPLICATION";
  StorageScope2[StorageScope2["PROFILE"] = 0] = "PROFILE";
  StorageScope2[StorageScope2["WORKSPACE"] = 1] = "WORKSPACE";
  return StorageScope2;
})(StorageScope || {});
var StorageTarget = /* @__PURE__ */ ((StorageTarget2) => {
  StorageTarget2[StorageTarget2["USER"] = 0] = "USER";
  StorageTarget2[StorageTarget2["MACHINE"] = 1] = "MACHINE";
  return StorageTarget2;
})(StorageTarget || {});
function loadKeyTargets(storage) {
  const keysRaw = storage.get(TARGET_KEY);
  if (keysRaw) {
    try {
      return JSON.parse(keysRaw);
    } catch (error) {
    }
  }
  return /* @__PURE__ */ Object.create(null);
}
const _AbstractStorageService = class _AbstractStorageService extends Disposable {
  constructor(options = { flushInterval: _AbstractStorageService.DEFAULT_FLUSH_INTERVAL }) {
    super();
    // every minute
    this._onDidChangeValue = this._register(new PauseableEmitter());
    this._onDidChangeTarget = this._register(new PauseableEmitter());
    this.onDidChangeTarget = this._onDidChangeTarget.event;
    this._onWillSaveState = this._register(new Emitter());
    this.onWillSaveState = this._onWillSaveState.event;
    this.runFlushWhenIdle = this._register(new MutableDisposable());
    this._workspaceKeyTargets = void 0;
    this._profileKeyTargets = void 0;
    this._applicationKeyTargets = void 0;
    this._applicationSharedKeyTargets = void 0;
    this.flushWhenIdleScheduler = this._register(new RunOnceScheduler(() => this.doFlushWhenIdle(), options.flushInterval));
  }
  onDidChangeValue(scope, key, disposable) {
    return Event.filter(this._onDidChangeValue.event, (e) => e.scope === scope && (key === void 0 || e.key === key), disposable);
  }
  doFlushWhenIdle() {
    this.runFlushWhenIdle.value = runWhenGlobalIdle(() => {
      if (this.shouldFlushWhenIdle()) {
        this.flush();
      }
      this.flushWhenIdleScheduler.schedule();
    });
  }
  shouldFlushWhenIdle() {
    return true;
  }
  stopFlushWhenIdle() {
    dispose([this.runFlushWhenIdle, this.flushWhenIdleScheduler]);
  }
  initialize() {
    if (!this.initializationPromise) {
      this.initializationPromise = (async () => {
        mark("code/willInitStorage");
        try {
          await this.doInitialize();
        } finally {
          mark("code/didInitStorage");
        }
        this.flushWhenIdleScheduler.schedule();
      })();
    }
    return this.initializationPromise;
  }
  emitDidChangeValue(scope, event) {
    const { key, external } = event;
    if (key === TARGET_KEY) {
      switch (scope) {
        case -2 /* APPLICATION_SHARED */:
          this._applicationSharedKeyTargets = void 0;
          break;
        case -1 /* APPLICATION */:
          this._applicationKeyTargets = void 0;
          break;
        case 0 /* PROFILE */:
          this._profileKeyTargets = void 0;
          break;
        case 1 /* WORKSPACE */:
          this._workspaceKeyTargets = void 0;
          break;
      }
      this._onDidChangeTarget.fire({ scope });
    } else {
      this._onDidChangeValue.fire({ scope, key, target: this.getKeyTargets(scope)[key], external });
    }
  }
  emitWillSaveState(reason) {
    this._onWillSaveState.fire({ reason });
  }
  get(key, scope, fallbackValue) {
    return this.getStorage(scope)?.get(key, fallbackValue);
  }
  getBoolean(key, scope, fallbackValue) {
    return this.getStorage(scope)?.getBoolean(key, fallbackValue);
  }
  getNumber(key, scope, fallbackValue) {
    return this.getStorage(scope)?.getNumber(key, fallbackValue);
  }
  getObject(key, scope, fallbackValue) {
    return this.getStorage(scope)?.getObject(key, fallbackValue);
  }
  storeAll(entries, external) {
    this.withPausedEmitters(() => {
      for (const entry of entries) {
        this.store(entry.key, entry.value, entry.scope, entry.target, external);
      }
    });
  }
  store(key, value, scope, target, external = false) {
    if (isUndefinedOrNull(value)) {
      this.remove(key, scope, external);
      return;
    }
    this.withPausedEmitters(() => {
      this.updateKeyTarget(key, scope, target);
      this.getStorage(scope)?.set(key, value, external);
    });
  }
  remove(key, scope, external = false) {
    this.withPausedEmitters(() => {
      this.updateKeyTarget(key, scope, void 0);
      this.getStorage(scope)?.delete(key, external);
    });
  }
  withPausedEmitters(fn) {
    this._onDidChangeValue.pause();
    this._onDidChangeTarget.pause();
    try {
      fn();
    } finally {
      this._onDidChangeValue.resume();
      this._onDidChangeTarget.resume();
    }
  }
  keys(scope, target) {
    const keys = [];
    const keyTargets = this.getKeyTargets(scope);
    for (const key of Object.keys(keyTargets)) {
      const keyTarget = keyTargets[key];
      if (keyTarget === target) {
        keys.push(key);
      }
    }
    return keys;
  }
  updateKeyTarget(key, scope, target, external = false) {
    const keyTargets = this.getKeyTargets(scope);
    if (typeof target === "number") {
      if (keyTargets[key] !== target) {
        keyTargets[key] = target;
        this.getStorage(scope)?.set(TARGET_KEY, JSON.stringify(keyTargets), external);
      }
    } else {
      if (typeof keyTargets[key] === "number") {
        delete keyTargets[key];
        this.getStorage(scope)?.set(TARGET_KEY, JSON.stringify(keyTargets), external);
      }
    }
  }
  get workspaceKeyTargets() {
    if (!this._workspaceKeyTargets) {
      this._workspaceKeyTargets = this.loadKeyTargets(1 /* WORKSPACE */);
    }
    return this._workspaceKeyTargets;
  }
  get profileKeyTargets() {
    if (!this._profileKeyTargets) {
      this._profileKeyTargets = this.loadKeyTargets(0 /* PROFILE */);
    }
    return this._profileKeyTargets;
  }
  get applicationKeyTargets() {
    if (!this._applicationKeyTargets) {
      this._applicationKeyTargets = this.loadKeyTargets(-1 /* APPLICATION */);
    }
    return this._applicationKeyTargets;
  }
  get applicationSharedKeyTargets() {
    if (!this._applicationSharedKeyTargets) {
      this._applicationSharedKeyTargets = this.loadKeyTargets(-2 /* APPLICATION_SHARED */);
    }
    return this._applicationSharedKeyTargets;
  }
  getKeyTargets(scope) {
    switch (scope) {
      case -2 /* APPLICATION_SHARED */:
        return this.applicationSharedKeyTargets;
      case -1 /* APPLICATION */:
        return this.applicationKeyTargets;
      case 0 /* PROFILE */:
        return this.profileKeyTargets;
      default:
        return this.workspaceKeyTargets;
    }
  }
  loadKeyTargets(scope) {
    const storage = this.getStorage(scope);
    return storage ? loadKeyTargets(storage) : /* @__PURE__ */ Object.create(null);
  }
  isNew(scope) {
    return this.getBoolean(IS_NEW_KEY, scope) === true;
  }
  async flush(reason = 0 /* NONE */) {
    this._onWillSaveState.fire({ reason });
    const applicationStorage = this.getStorage(-1 /* APPLICATION */);
    const applicationSharedStorage = this.getStorage(-2 /* APPLICATION_SHARED */);
    const profileStorage = this.getStorage(0 /* PROFILE */);
    const workspaceStorage = this.getStorage(1 /* WORKSPACE */);
    switch (reason) {
      // Unspecific reason: just wait when data is flushed
      case 0 /* NONE */:
        await Promises.settled([
          applicationStorage?.whenFlushed() ?? Promise.resolve(),
          applicationSharedStorage?.whenFlushed() ?? Promise.resolve(),
          profileStorage?.whenFlushed() ?? Promise.resolve(),
          workspaceStorage?.whenFlushed() ?? Promise.resolve()
        ]);
        break;
      // Shutdown: we want to flush as soon as possible
      // and not hit any delays that might be there
      case 1 /* SHUTDOWN */:
        await Promises.settled([
          applicationStorage?.flush(0) ?? Promise.resolve(),
          applicationSharedStorage?.flush(0) ?? Promise.resolve(),
          profileStorage?.flush(0) ?? Promise.resolve(),
          workspaceStorage?.flush(0) ?? Promise.resolve()
        ]);
        break;
    }
  }
  async log() {
    const applicationItems = this.getStorage(-1 /* APPLICATION */)?.items ?? /* @__PURE__ */ new Map();
    const applicationSharedItems = this.getStorage(-2 /* APPLICATION_SHARED */)?.items ?? /* @__PURE__ */ new Map();
    const profileItems = this.getStorage(0 /* PROFILE */)?.items ?? /* @__PURE__ */ new Map();
    const workspaceItems = this.getStorage(1 /* WORKSPACE */)?.items ?? /* @__PURE__ */ new Map();
    return logStorage(
      applicationItems,
      applicationSharedItems,
      profileItems,
      workspaceItems,
      this.getLogDetails(-1 /* APPLICATION */) ?? "",
      this.getLogDetails(-2 /* APPLICATION_SHARED */) ?? "",
      this.getLogDetails(0 /* PROFILE */) ?? "",
      this.getLogDetails(1 /* WORKSPACE */) ?? ""
    );
  }
  async optimize(scope) {
    await this.flush();
    return this.getStorage(scope)?.optimize();
  }
  async switch(to, preserveData) {
    this.emitWillSaveState(0 /* NONE */);
    if (isUserDataProfile(to)) {
      return this.switchToProfile(to, preserveData);
    }
    return this.switchToWorkspace(to, preserveData);
  }
  canSwitchProfile(from, to) {
    if (from.id === to.id) {
      return false;
    }
    if (isProfileUsingDefaultStorage(to) && isProfileUsingDefaultStorage(from)) {
      return false;
    }
    return true;
  }
  switchData(oldStorage, newStorage, scope) {
    this.withPausedEmitters(() => {
      const handledkeys = /* @__PURE__ */ new Set();
      for (const [key, oldValue] of oldStorage) {
        handledkeys.add(key);
        const newValue = newStorage.get(key);
        if (newValue !== oldValue) {
          this.emitDidChangeValue(scope, { key, external: true });
        }
      }
      for (const [key] of newStorage.items) {
        if (!handledkeys.has(key)) {
          this.emitDidChangeValue(scope, { key, external: true });
        }
      }
    });
  }
};
_AbstractStorageService.DEFAULT_FLUSH_INTERVAL = 60 * 1e3;
let AbstractStorageService = _AbstractStorageService;
function isProfileUsingDefaultStorage(profile) {
  return profile.isDefault || !!profile.useDefaultFlags?.globalState;
}
class InMemoryStorageService extends AbstractStorageService {
  constructor() {
    super();
    this.applicationStorage = this._register(new Storage(new InMemoryStorageDatabase(), { hint: StorageHint.STORAGE_IN_MEMORY }));
    this.applicationSharedStorage = this._register(new Storage(new InMemoryStorageDatabase(), { hint: StorageHint.STORAGE_IN_MEMORY }));
    this.profileStorage = this._register(new Storage(new InMemoryStorageDatabase(), { hint: StorageHint.STORAGE_IN_MEMORY }));
    this.workspaceStorage = this._register(new Storage(new InMemoryStorageDatabase(), { hint: StorageHint.STORAGE_IN_MEMORY }));
    this._register(this.workspaceStorage.onDidChangeStorage((e) => this.emitDidChangeValue(1 /* WORKSPACE */, e)));
    this._register(this.profileStorage.onDidChangeStorage((e) => this.emitDidChangeValue(0 /* PROFILE */, e)));
    this._register(this.applicationStorage.onDidChangeStorage((e) => this.emitDidChangeValue(-1 /* APPLICATION */, e)));
    this._register(this.applicationSharedStorage.onDidChangeStorage((e) => this.emitDidChangeValue(-2 /* APPLICATION_SHARED */, e)));
  }
  getStorage(scope) {
    switch (scope) {
      case -2 /* APPLICATION_SHARED */:
        return this.applicationSharedStorage;
      case -1 /* APPLICATION */:
        return this.applicationStorage;
      case 0 /* PROFILE */:
        return this.profileStorage;
      default:
        return this.workspaceStorage;
    }
  }
  getLogDetails(scope) {
    switch (scope) {
      case -2 /* APPLICATION_SHARED */:
        return "inMemory (application-shared)";
      case -1 /* APPLICATION */:
        return "inMemory (application)";
      case 0 /* PROFILE */:
        return "inMemory (profile)";
      default:
        return "inMemory (workspace)";
    }
  }
  async doInitialize() {
  }
  async switchToProfile() {
  }
  async switchToWorkspace() {
  }
  shouldFlushWhenIdle() {
    return false;
  }
  hasScope(scope) {
    return false;
  }
}
async function logStorage(application, applicationShared, profile, workspace, applicationPath, applicationSharedPath, profilePath, workspacePath) {
  const safeParse = (value) => {
    try {
      return JSON.parse(value);
    } catch (error) {
      return value;
    }
  };
  const applicationItems = /* @__PURE__ */ new Map();
  const applicationItemsParsed = /* @__PURE__ */ new Map();
  application.forEach((value, key) => {
    applicationItems.set(key, value);
    applicationItemsParsed.set(key, safeParse(value));
  });
  const applicationSharedItems = /* @__PURE__ */ new Map();
  const applicationSharedItemsParsed = /* @__PURE__ */ new Map();
  applicationShared.forEach((value, key) => {
    applicationSharedItems.set(key, value);
    applicationSharedItemsParsed.set(key, safeParse(value));
  });
  const profileItems = /* @__PURE__ */ new Map();
  const profileItemsParsed = /* @__PURE__ */ new Map();
  profile.forEach((value, key) => {
    profileItems.set(key, value);
    profileItemsParsed.set(key, safeParse(value));
  });
  const workspaceItems = /* @__PURE__ */ new Map();
  const workspaceItemsParsed = /* @__PURE__ */ new Map();
  workspace.forEach((value, key) => {
    workspaceItems.set(key, value);
    workspaceItemsParsed.set(key, safeParse(value));
  });
  if (applicationPath !== profilePath) {
    console.group(`Storage: Application (path: ${applicationPath})`);
  } else {
    console.group(`Storage: Application & Profile (path: ${applicationPath}, default profile)`);
  }
  const applicationValues = [];
  applicationItems.forEach((value, key) => {
    applicationValues.push({ key, value });
  });
  console.table(applicationValues);
  console.groupEnd();
  console.log(applicationItemsParsed);
  console.group(`Storage: Application Shared (path: ${applicationSharedPath})`);
  const applicationSharedValues = [];
  applicationSharedItems.forEach((value, key) => {
    applicationSharedValues.push({ key, value });
  });
  console.table(applicationSharedValues);
  console.groupEnd();
  console.log(applicationSharedItemsParsed);
  if (applicationPath !== profilePath) {
    console.group(`Storage: Profile (path: ${profilePath}, profile specific)`);
    const profileValues = [];
    profileItems.forEach((value, key) => {
      profileValues.push({ key, value });
    });
    console.table(profileValues);
    console.groupEnd();
    console.log(profileItemsParsed);
  }
  console.group(`Storage: Workspace (path: ${workspacePath})`);
  const workspaceValues = [];
  workspaceItems.forEach((value, key) => {
    workspaceValues.push({ key, value });
  });
  console.table(workspaceValues);
  console.groupEnd();
  console.log(workspaceItemsParsed);
}
export {
  AbstractStorageService,
  IS_NEW_KEY,
  IStorageService,
  InMemoryStorageService,
  StorageScope,
  StorageTarget,
  TARGET_KEY,
  WillSaveStateReason,
  isProfileUsingDefaultStorage,
  loadKeyTargets,
  logStorage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBQcm9taXNlcywgUnVuT25jZVNjaGVkdWxlciwgcnVuV2hlbkdsb2JhbElkbGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCwgUGF1c2VhYmxlRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbWFyayB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IGlzVW5kZWZpbmVkT3JOdWxsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlRGF0YWJhc2UsIElTdG9yYWdlLCBJU3RvcmFnZUNoYW5nZUV2ZW50LCBTdG9yYWdlLCBTdG9yYWdlSGludCwgU3RvcmFnZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgaXNVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVByb2ZpbGUgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJQW55V29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IElTX05FV19LRVkgPSAnX18kX19pc05ld1N0b3JhZ2VNYXJrZXInO1xuZXhwb3J0IGNvbnN0IFRBUkdFVF9LRVkgPSAnX18kX190YXJnZXRTdG9yYWdlTWFya2VyJztcblxuZXhwb3J0IGNvbnN0IElTdG9yYWdlU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJU3RvcmFnZVNlcnZpY2U+KCdzdG9yYWdlU2VydmljZScpO1xuXG5leHBvcnQgZW51bSBXaWxsU2F2ZVN0YXRlUmVhc29uIHtcblxuXHQvKipcblx0ICogTm8gc3BlY2lmaWMgcmVhc29uIHRvIHNhdmUgc3RhdGUuXG5cdCAqL1xuXHROT05FLFxuXG5cdC8qKlxuXHQgKiBBIGhpbnQgdGhhdCB0aGUgd29ya2JlbmNoIGlzIGFib3V0IHRvIHNodXRkb3duLlxuXHQgKi9cblx0U0hVVERPV05cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV2lsbFNhdmVTdGF0ZUV2ZW50IHtcblx0cmVhZG9ubHkgcmVhc29uOiBXaWxsU2F2ZVN0YXRlUmVhc29uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdG9yYWdlRW50cnkge1xuXHRyZWFkb25seSBrZXk6IHN0cmluZztcblx0cmVhZG9ubHkgdmFsdWU6IFN0b3JhZ2VWYWx1ZTtcblx0cmVhZG9ubHkgc2NvcGU6IFN0b3JhZ2VTY29wZTtcblx0cmVhZG9ubHkgdGFyZ2V0OiBTdG9yYWdlVGFyZ2V0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3Jrc3BhY2VTdG9yYWdlVmFsdWVDaGFuZ2VFdmVudCBleHRlbmRzIElTdG9yYWdlVmFsdWVDaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IHNjb3BlOiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQcm9maWxlU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQgZXh0ZW5kcyBJU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQge1xuXHRyZWFkb25seSBzY29wZTogU3RvcmFnZVNjb3BlLlBST0ZJTEU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFwcGxpY2F0aW9uU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQgZXh0ZW5kcyBJU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQge1xuXHRyZWFkb25seSBzY29wZTogU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50IGV4dGVuZHMgSVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50IHtcblx0cmVhZG9ubHkgc2NvcGU6IFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTl9TSEFSRUQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0b3JhZ2VTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEVtaXR0ZWQgd2hlbmV2ZXIgZGF0YSBpcyB1cGRhdGVkIG9yIGRlbGV0ZWQgb24gdGhlIGdpdmVuXG5cdCAqIHNjb3BlIGFuZCBvcHRpb25hbCBrZXkuXG5cdCAqXG5cdCAqIEBwYXJhbSBzY29wZSB0aGUgYFN0b3JhZ2VTY29wZWAgdG8gbGlzdGVuIHRvIGNoYW5nZXNcblx0ICogQHBhcmFtIGtleSB0aGUgb3B0aW9uYWwga2V5IHRvIGZpbHRlciBmb3Igb3IgYWxsIGtleXMgb2Zcblx0ICogdGhlIHNjb3BlIGlmIGB1bmRlZmluZWRgXG5cdCAqL1xuXHRvbkRpZENoYW5nZVZhbHVlKHNjb3BlOiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8SVdvcmtzcGFjZVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50Pjtcblx0b25EaWRDaGFuZ2VWYWx1ZShzY29wZTogU3RvcmFnZVNjb3BlLlBST0ZJTEUsIGtleTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxJUHJvZmlsZVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50Pjtcblx0b25EaWRDaGFuZ2VWYWx1ZShzY29wZTogU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8SUFwcGxpY2F0aW9uU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ+O1xuXHRvbkRpZENoYW5nZVZhbHVlKHNjb3BlOiBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVELCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8SUFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ+O1xuXHRvbkRpZENoYW5nZVZhbHVlKHNjb3BlOiBTdG9yYWdlU2NvcGUsIGtleTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxJU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ+O1xuXG5cdC8qKlxuXHQgKiBFbWl0dGVkIHdoZW5ldmVyIHRhcmdldCBvZiBhIHN0b3JhZ2UgZW50cnkgY2hhbmdlcy5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVGFyZ2V0OiBFdmVudDxJU3RvcmFnZVRhcmdldENoYW5nZUV2ZW50PjtcblxuXHQvKipcblx0ICogRW1pdHRlZCB3aGVuIHRoZSBzdG9yYWdlIGlzIGFib3V0IHRvIHBlcnNpc3QuIFRoaXMgaXMgdGhlIHJpZ2h0IHRpbWVcblx0ICogdG8gcGVyc2lzdCBkYXRhIHRvIGVuc3VyZSBpdCBpcyBzdG9yZWQgYmVmb3JlIHRoZSBhcHBsaWNhdGlvbiBzaHV0c1xuXHQgKiBkb3duLlxuXHQgKlxuXHQgKiBUaGUgd2lsbCBzYXZlIHN0YXRlIGV2ZW50IGFsbG93cyB0byBvcHRpb25hbGx5IGFzayBmb3IgdGhlIHJlYXNvbiBvZlxuXHQgKiBzYXZpbmcgdGhlIHN0YXRlLCBlLmcuIHRvIGZpbmQgb3V0IGlmIHRoZSBzdGF0ZSBpcyBzYXZlZCBkdWUgdG8gYVxuXHQgKiBzaHV0ZG93bi5cblx0ICpcblx0ICogTm90ZTogdGhpcyBldmVudCBtYXkgYmUgZmlyZWQgbWFueSB0aW1lcywgbm90IG9ubHkgb24gc2h1dGRvd24gdG8gcHJldmVudFxuXHQgKiBsb3NzIG9mIHN0YXRlIGluIHNpdHVhdGlvbnMgd2hlcmUgdGhlIHNodXRkb3duIGlzIG5vdCBzdWZmaWNpZW50IHRvXG5cdCAqIHBlcnNpc3QgdGhlIGRhdGEgcHJvcGVybHkuXG5cdCAqL1xuXHRyZWFkb25seSBvbldpbGxTYXZlU3RhdGU6IEV2ZW50PElXaWxsU2F2ZVN0YXRlRXZlbnQ+O1xuXG5cdC8qKlxuXHQgKiBSZXRyaWV2ZSBhbiBlbGVtZW50IHN0b3JlZCB3aXRoIHRoZSBnaXZlbiBrZXkgZnJvbSBzdG9yYWdlLiBVc2Vcblx0ICogdGhlIHByb3ZpZGVkIGBkZWZhdWx0VmFsdWVgIGlmIHRoZSBlbGVtZW50IGlzIGBudWxsYCBvciBgdW5kZWZpbmVkYC5cblx0ICpcblx0ICogQHBhcmFtIHNjb3BlIGFsbG93cyB0byBkZWZpbmUgdGhlIHNjb3BlIG9mIHRoZSBzdG9yYWdlIG9wZXJhdGlvblxuXHQgKiB0byBlaXRoZXIgdGhlIGN1cnJlbnQgd29ya3NwYWNlIG9ubHksIGFsbCB3b3Jrc3BhY2VzIG9yIGFsbCBwcm9maWxlcy5cblx0ICovXG5cdGdldChrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZTogc3RyaW5nKTogc3RyaW5nO1xuXHRnZXQoa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU/OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFJldHJpZXZlIGFuIGVsZW1lbnQgc3RvcmVkIHdpdGggdGhlIGdpdmVuIGtleSBmcm9tIHN0b3JhZ2UuIFVzZVxuXHQgKiB0aGUgcHJvdmlkZWQgYGRlZmF1bHRWYWx1ZWAgaWYgdGhlIGVsZW1lbnQgaXMgYG51bGxgIG9yIGB1bmRlZmluZWRgLlxuXHQgKiBUaGUgZWxlbWVudCB3aWxsIGJlIGNvbnZlcnRlZCB0byBhIGBib29sZWFuYC5cblx0ICpcblx0ICogQHBhcmFtIHNjb3BlIGFsbG93cyB0byBkZWZpbmUgdGhlIHNjb3BlIG9mIHRoZSBzdG9yYWdlIG9wZXJhdGlvblxuXHQgKiB0byBlaXRoZXIgdGhlIGN1cnJlbnQgd29ya3NwYWNlIG9ubHksIGFsbCB3b3Jrc3BhY2VzIG9yIGFsbCBwcm9maWxlcy5cblx0ICovXG5cdGdldEJvb2xlYW4oa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU6IGJvb2xlYW4pOiBib29sZWFuO1xuXHRnZXRCb29sZWFuKGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlPzogYm9vbGVhbik6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFJldHJpZXZlIGFuIGVsZW1lbnQgc3RvcmVkIHdpdGggdGhlIGdpdmVuIGtleSBmcm9tIHN0b3JhZ2UuIFVzZVxuXHQgKiB0aGUgcHJvdmlkZWQgYGRlZmF1bHRWYWx1ZWAgaWYgdGhlIGVsZW1lbnQgaXMgYG51bGxgIG9yIGB1bmRlZmluZWRgLlxuXHQgKiBUaGUgZWxlbWVudCB3aWxsIGJlIGNvbnZlcnRlZCB0byBhIGBudW1iZXJgIHVzaW5nIGBwYXJzZUludGAgd2l0aCBhXG5cdCAqIGJhc2Ugb2YgYDEwYC5cblx0ICpcblx0ICogQHBhcmFtIHNjb3BlIGFsbG93cyB0byBkZWZpbmUgdGhlIHNjb3BlIG9mIHRoZSBzdG9yYWdlIG9wZXJhdGlvblxuXHQgKiB0byBlaXRoZXIgdGhlIGN1cnJlbnQgd29ya3NwYWNlIG9ubHksIGFsbCB3b3Jrc3BhY2VzIG9yIGFsbCBwcm9maWxlcy5cblx0ICovXG5cdGdldE51bWJlcihrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZTogbnVtYmVyKTogbnVtYmVyO1xuXHRnZXROdW1iZXIoa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU/OiBudW1iZXIpOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFJldHJpZXZlIGFuIGVsZW1lbnQgc3RvcmVkIHdpdGggdGhlIGdpdmVuIGtleSBmcm9tIHN0b3JhZ2UuIFVzZVxuXHQgKiB0aGUgcHJvdmlkZWQgYGRlZmF1bHRWYWx1ZWAgaWYgdGhlIGVsZW1lbnQgaXMgYG51bGxgIG9yIGB1bmRlZmluZWRgLlxuXHQgKiBUaGUgZWxlbWVudCB3aWxsIGJlIGNvbnZlcnRlZCB0byBhIGBvYmplY3RgIHVzaW5nIGBKU09OLnBhcnNlYC5cblx0ICpcblx0ICogQHBhcmFtIHNjb3BlIGFsbG93cyB0byBkZWZpbmUgdGhlIHNjb3BlIG9mIHRoZSBzdG9yYWdlIG9wZXJhdGlvblxuXHQgKiB0byBlaXRoZXIgdGhlIGN1cnJlbnQgd29ya3NwYWNlIG9ubHksIGFsbCB3b3Jrc3BhY2VzIG9yIGFsbCBwcm9maWxlcy5cblx0ICovXG5cdGdldE9iamVjdDxUIGV4dGVuZHMgb2JqZWN0PihrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZTogVCk6IFQ7XG5cdGdldE9iamVjdDxUIGV4dGVuZHMgb2JqZWN0PihrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZT86IFQpOiBUIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBTdG9yZSBhIHZhbHVlIHVuZGVyIHRoZSBnaXZlbiBrZXkgdG8gc3RvcmFnZS4gVGhlIHZhbHVlIHdpbGwgYmVcblx0ICogY29udmVydGVkIHRvIGEgYHN0cmluZ2AuIFN0b3JpbmcgZWl0aGVyIGB1bmRlZmluZWRgIG9yIGBudWxsYCB3aWxsXG5cdCAqIHJlbW92ZSB0aGUgZW50cnkgdW5kZXIgdGhlIGtleS5cblx0ICpcblx0ICogQHBhcmFtIHNjb3BlIGFsbG93cyB0byBkZWZpbmUgdGhlIHNjb3BlIG9mIHRoZSBzdG9yYWdlIG9wZXJhdGlvblxuXHQgKiB0byBlaXRoZXIgdGhlIGN1cnJlbnQgd29ya3NwYWNlIG9ubHksIGFsbCB3b3Jrc3BhY2VzIG9yIGFsbCBwcm9maWxlcy5cblx0ICpcblx0ICogQHBhcmFtIHRhcmdldCBhbGxvd3MgdG8gZGVmaW5lIHRoZSB0YXJnZXQgb2YgdGhlIHN0b3JhZ2Ugb3BlcmF0aW9uXG5cdCAqIHRvIGVpdGhlciB0aGUgY3VycmVudCBtYWNoaW5lIG9yIHVzZXIuXG5cdCAqL1xuXHRzdG9yZShrZXk6IHN0cmluZywgdmFsdWU6IFN0b3JhZ2VWYWx1ZSwgc2NvcGU6IFN0b3JhZ2VTY29wZSwgdGFyZ2V0OiBTdG9yYWdlVGFyZ2V0KTogdm9pZDtcblxuXHQvKipcblx0ICogQWxsb3dzIHRvIHN0b3JlIG11bHRpcGxlIHZhbHVlcyBpbiBhIGJ1bGsgb3BlcmF0aW9uLiBFdmVudHMgd2lsbCBvbmx5XG5cdCAqIGJlIGVtaXR0ZWQgd2hlbiBhbGwgdmFsdWVzIGhhdmUgYmVlbiBzdG9yZWQuXG5cdCAqXG5cdCAqIEBwYXJhbSBleHRlcm5hbCBhIGhpbnQgdG8gaW5kaWNhdGUgdGhlIHNvdXJjZSBvZiB0aGUgb3BlcmF0aW9uIGlzIGV4dGVybmFsLFxuXHQgKiBzdWNoIGFzIHNldHRpbmdzIHN5bmMgb3IgcHJvZmlsZSBjaGFuZ2VzLlxuXHQgKi9cblx0c3RvcmVBbGwoZW50cmllczogQXJyYXk8SVN0b3JhZ2VFbnRyeT4sIGV4dGVybmFsOiBib29sZWFuKTogdm9pZDtcblxuXHQvKipcblx0ICogRGVsZXRlIGFuIGVsZW1lbnQgc3RvcmVkIHVuZGVyIHRoZSBwcm92aWRlZCBrZXkgZnJvbSBzdG9yYWdlLlxuXHQgKlxuXHQgKiBUaGUgc2NvcGUgYXJndW1lbnQgYWxsb3dzIHRvIGRlZmluZSB0aGUgc2NvcGUgb2YgdGhlIHN0b3JhZ2Vcblx0ICogb3BlcmF0aW9uIHRvIGVpdGhlciB0aGUgY3VycmVudCB3b3Jrc3BhY2Ugb25seSwgYWxsIHdvcmtzcGFjZXNcblx0ICogb3IgYWxsIHByb2ZpbGVzLlxuXHQgKi9cblx0cmVtb3ZlKGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlKTogdm9pZDtcblxuXHQvKipcblx0ICogUmV0dXJucyBhbGwgdGhlIGtleXMgdXNlZCBpbiB0aGUgc3RvcmFnZSBmb3IgdGhlIHByb3ZpZGVkIGBzY29wZWBcblx0ICogYW5kIGB0YXJnZXRgLlxuXHQgKlxuXHQgKiBOb3RlOiB0aGlzIHdpbGwgTk9UIHJldHVybiBhbGwga2V5cyBzdG9yZWQgaW4gdGhlIHN0b3JhZ2UgbGF5ZXIuXG5cdCAqIFNvbWUga2V5cyBtYXkgbm90IGhhdmUgYW4gYXNzb2NpYXRlZCBgU3RvcmFnZVRhcmdldGAgYW5kIHRodXNcblx0ICogd2lsbCBiZSBleGNsdWRlZCBmcm9tIHRoZSByZXN1bHRzLlxuXHQgKlxuXHQgKiBAcGFyYW0gc2NvcGUgYWxsb3dzIHRvIGRlZmluZSB0aGUgc2NvcGUgZm9yIHRoZSBrZXlzXG5cdCAqIHRvIGVpdGhlciB0aGUgY3VycmVudCB3b3Jrc3BhY2Ugb25seSwgYWxsIHdvcmtzcGFjZXMgb3IgYWxsIHByb2ZpbGVzLlxuXHQgKlxuXHQgKiBAcGFyYW0gdGFyZ2V0IGFsbG93cyB0byBkZWZpbmUgdGhlIHRhcmdldCBmb3IgdGhlIGtleXNcblx0ICogdG8gZWl0aGVyIHRoZSBjdXJyZW50IG1hY2hpbmUgb3IgdXNlci5cblx0ICovXG5cdGtleXMoc2NvcGU6IFN0b3JhZ2VTY29wZSwgdGFyZ2V0OiBTdG9yYWdlVGFyZ2V0KTogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIExvZyB0aGUgY29udGVudHMgb2YgdGhlIHN0b3JhZ2UgdG8gdGhlIGNvbnNvbGUuXG5cdCAqL1xuXHRsb2coKTogdm9pZDtcblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSBzdG9yYWdlIHNlcnZpY2UgaGFuZGxlcyB0aGUgcHJvdmlkZWQgc2NvcGUuXG5cdCAqL1xuXHRoYXNTY29wZShzY29wZTogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJVXNlckRhdGFQcm9maWxlKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogU3dpdGNoIHN0b3JhZ2UgdG8gYW5vdGhlciB3b3Jrc3BhY2Ugb3IgcHJvZmlsZS4gT3B0aW9uYWxseSBwcmVzZXJ2ZSB0aGVcblx0ICogY3VycmVudCBkYXRhIHRvIHRoZSBuZXcgc3RvcmFnZS5cblx0ICovXG5cdHN3aXRjaCh0bzogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJVXNlckRhdGFQcm9maWxlLCBwcmVzZXJ2ZURhdGE6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBzdG9yYWdlIGZvciB0aGUgZ2l2ZW4gc2NvcGUgd2FzIGNyZWF0ZWQgZHVyaW5nIHRoaXMgc2Vzc2lvbiBvclxuXHQgKiBleGlzdGVkIGJlZm9yZS5cblx0ICovXG5cdGlzTmV3KHNjb3BlOiBTdG9yYWdlU2NvcGUpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBBdHRlbXB0cyB0byByZWR1Y2UgdGhlIERCIHNpemUgdmlhIG9wdGltaXphdGlvbiBjb21tYW5kcyBpZiBzdXBwb3J0ZWQuXG5cdCAqL1xuXHRvcHRpbWl6ZShzY29wZTogU3RvcmFnZVNjb3BlKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogQWxsb3dzIHRvIGZsdXNoIHN0YXRlLCBlLmcuIGluIGNhc2VzIHdoZXJlIGEgc2h1dGRvd24gaXNcblx0ICogaW1taW5lbnQuIFRoaXMgd2lsbCBzZW5kIG91dCB0aGUgYG9uV2lsbFNhdmVTdGF0ZWAgdG8gYXNrXG5cdCAqIGV2ZXJ5b25lIGZvciBsYXRlc3Qgc3RhdGUuXG5cdCAqXG5cdCAqIEByZXR1cm5zIGEgYFByb21pc2VgIHRoYXQgY2FuIGJlIGF3YWl0ZWQgb24gd2hlbiBhbGwgdXBkYXRlc1xuXHQgKiB0byB0aGUgdW5kZXJseWluZyBzdG9yYWdlIGhhdmUgYmVlbiBmbHVzaGVkLlxuXHQgKi9cblx0Zmx1c2gocmVhc29uPzogV2lsbFNhdmVTdGF0ZVJlYXNvbik6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFN0b3JhZ2VTY29wZSB7XG5cblx0LyoqXG5cdCAqIFRoZSBzdG9yZWQgZGF0YSB3aWxsIGJlIHNjb3BlZCB0byBhbGwgd29ya3NwYWNlcyBhY3Jvc3MgYWxsIHByb2ZpbGVzXG5cdCAqIGFuZCBzaGFyZWQgYWNyb3NzIFZTIENvZGUgYW5kIFNlc3Npb25zIGFwcC5cblx0ICovXG5cdEFQUExJQ0FUSU9OX1NIQVJFRCA9IC0yLFxuXG5cdC8qKlxuXHQgKiBUaGUgc3RvcmVkIGRhdGEgd2lsbCBiZSBzY29wZWQgdG8gYWxsIHdvcmtzcGFjZXMgYWNyb3NzIGFsbCBwcm9maWxlcy5cblx0ICovXG5cdEFQUExJQ0FUSU9OID0gLTEsXG5cblx0LyoqXG5cdCAqIFRoZSBzdG9yZWQgZGF0YSB3aWxsIGJlIHNjb3BlZCB0byBhbGwgd29ya3NwYWNlcyBvZiB0aGUgc2FtZSBwcm9maWxlLlxuXHQgKi9cblx0UFJPRklMRSA9IDAsXG5cblx0LyoqXG5cdCAqIFRoZSBzdG9yZWQgZGF0YSB3aWxsIGJlIHNjb3BlZCB0byB0aGUgY3VycmVudCB3b3Jrc3BhY2UuXG5cdCAqL1xuXHRXT1JLU1BBQ0UgPSAxXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFN0b3JhZ2VUYXJnZXQge1xuXG5cdC8qKlxuXHQgKiBUaGUgc3RvcmVkIGRhdGEgaXMgdXNlciBzcGVjaWZpYyBhbmQgYXBwbGllcyBhY3Jvc3MgbWFjaGluZXMuXG5cdCAqL1xuXHRVU0VSLFxuXG5cdC8qKlxuXHQgKiBUaGUgc3RvcmVkIGRhdGEgaXMgbWFjaGluZSBzcGVjaWZpYy5cblx0ICovXG5cdE1BQ0hJTkVcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQge1xuXG5cdC8qKlxuXHQgKiBUaGUgc2NvcGUgZm9yIHRoZSBzdG9yYWdlIGVudHJ5IHRoYXQgY2hhbmdlZFxuXHQgKiBvciB3YXMgcmVtb3ZlZC5cblx0ICovXG5cdHJlYWRvbmx5IHNjb3BlOiBTdG9yYWdlU2NvcGU7XG5cblx0LyoqXG5cdCAqIFRoZSBga2V5YCBvZiB0aGUgc3RvcmFnZSBlbnRyeSB0aGF0IHdhcyBjaGFuZ2VkXG5cdCAqIG9yIHdhcyByZW1vdmVkLlxuXHQgKi9cblx0cmVhZG9ubHkga2V5OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBgdGFyZ2V0YCBjYW4gYmUgYHVuZGVmaW5lZGAgaWYgYSBrZXkgaXMgYmVpbmdcblx0ICogcmVtb3ZlZC5cblx0ICovXG5cdHJlYWRvbmx5IHRhcmdldDogU3RvcmFnZVRhcmdldCB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogQSBoaW50IGhvdyB0aGUgc3RvcmFnZSBjaGFuZ2UgZXZlbnQgd2FzIHRyaWdnZXJlZC4gSWZcblx0ICogYHRydWVgLCB0aGUgc3RvcmFnZSBjaGFuZ2Ugd2FzIHRyaWdnZXJlZCBieSBhbiBleHRlcm5hbFxuXHQgKiBzb3VyY2UsIHN1Y2ggYXM6XG5cdCAqIC0gYW5vdGhlciBwcm9jZXNzIChmb3IgZXhhbXBsZSBhbm90aGVyIHdpbmRvdylcblx0ICogLSBvcGVyYXRpb25zIHN1Y2ggYXMgc2V0dGluZ3Mgc3luYyBvciBwcm9maWxlcyBjaGFuZ2Vcblx0ICovXG5cdHJlYWRvbmx5IGV4dGVybmFsPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3RvcmFnZVRhcmdldENoYW5nZUV2ZW50IHtcblxuXHQvKipcblx0ICogVGhlIHNjb3BlIGZvciB0aGUgdGFyZ2V0IHRoYXQgY2hhbmdlZC4gTGlzdGVuZXJzXG5cdCAqIHNob3VsZCB1c2UgYGtleXMoc2NvcGUsIHRhcmdldClgIHRvIGdldCBhbiB1cGRhdGVkXG5cdCAqIGxpc3Qgb2Yga2V5cyBmb3IgdGhlIGdpdmVuIGBzY29wZWAgYW5kIGB0YXJnZXRgLlxuXHQgKi9cblx0cmVhZG9ubHkgc2NvcGU6IFN0b3JhZ2VTY29wZTtcbn1cblxuaW50ZXJmYWNlIElLZXlUYXJnZXRzIHtcblx0W2tleTogc3RyaW5nXTogU3RvcmFnZVRhcmdldDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3RvcmFnZVNlcnZpY2VPcHRpb25zIHtcblx0cmVhZG9ubHkgZmx1c2hJbnRlcnZhbDogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9hZEtleVRhcmdldHMoc3RvcmFnZTogSVN0b3JhZ2UpOiBJS2V5VGFyZ2V0cyB7XG5cdGNvbnN0IGtleXNSYXcgPSBzdG9yYWdlLmdldChUQVJHRVRfS0VZKTtcblx0aWYgKGtleXNSYXcpIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIEpTT04ucGFyc2Uoa2V5c1Jhdyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIEZhaWwgZ3JhY2VmdWxseVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBPYmplY3QuY3JlYXRlKG51bGwpO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RTdG9yYWdlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU3RvcmFnZVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc3RhdGljIERFRkFVTFRfRkxVU0hfSU5URVJWQUwgPSA2MCAqIDEwMDA7IC8vIGV2ZXJ5IG1pbnV0ZVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmFsdWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgUGF1c2VhYmxlRW1pdHRlcjxJU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVGFyZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFBhdXNlYWJsZUVtaXR0ZXI8SVN0b3JhZ2VUYXJnZXRDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVGFyZ2V0ID0gdGhpcy5fb25EaWRDaGFuZ2VUYXJnZXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsU2F2ZVN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdpbGxTYXZlU3RhdGVFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbFNhdmVTdGF0ZSA9IHRoaXMuX29uV2lsbFNhdmVTdGF0ZS5ldmVudDtcblxuXHRwcml2YXRlIGluaXRpYWxpemF0aW9uUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGZsdXNoV2hlbklkbGVTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgcnVuRmx1c2hXaGVuSWRsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBJU3RvcmFnZVNlcnZpY2VPcHRpb25zID0geyBmbHVzaEludGVydmFsOiBBYnN0cmFjdFN0b3JhZ2VTZXJ2aWNlLkRFRkFVTFRfRkxVU0hfSU5URVJWQUwgfSkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmZsdXNoV2hlbklkbGVTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLmRvRmx1c2hXaGVuSWRsZSgpLCBvcHRpb25zLmZsdXNoSW50ZXJ2YWwpKTtcblx0fVxuXG5cdG9uRGlkQ2hhbmdlVmFsdWUoc2NvcGU6IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIGtleTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxJV29ya3NwYWNlU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ+O1xuXHRvbkRpZENoYW5nZVZhbHVlKHNjb3BlOiBTdG9yYWdlU2NvcGUuUFJPRklMRSwga2V5OiBzdHJpbmcgfCB1bmRlZmluZWQsIGRpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PElQcm9maWxlU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ+O1xuXHRvbkRpZENoYW5nZVZhbHVlKHNjb3BlOiBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGtleTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxJQXBwbGljYXRpb25TdG9yYWdlVmFsdWVDaGFuZ2VFdmVudD47XG5cdG9uRGlkQ2hhbmdlVmFsdWUoc2NvcGU6IFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTl9TSEFSRUQsIGtleTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxJQXBwbGljYXRpb25TaGFyZWRTdG9yYWdlVmFsdWVDaGFuZ2VFdmVudD47XG5cdG9uRGlkQ2hhbmdlVmFsdWUoc2NvcGU6IFN0b3JhZ2VTY29wZSwga2V5OiBzdHJpbmcgfCB1bmRlZmluZWQsIGRpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PElTdG9yYWdlVmFsdWVDaGFuZ2VFdmVudD4ge1xuXHRcdHJldHVybiBFdmVudC5maWx0ZXIodGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5ldmVudCwgZSA9PiBlLnNjb3BlID09PSBzY29wZSAmJiAoa2V5ID09PSB1bmRlZmluZWQgfHwgZS5rZXkgPT09IGtleSksIGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0ZsdXNoV2hlbklkbGUoKTogdm9pZCB7XG5cdFx0dGhpcy5ydW5GbHVzaFdoZW5JZGxlLnZhbHVlID0gcnVuV2hlbkdsb2JhbElkbGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuc2hvdWxkRmx1c2hXaGVuSWRsZSgpKSB7XG5cdFx0XHRcdHRoaXMuZmx1c2goKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gcmVwZWF0XG5cdFx0XHR0aGlzLmZsdXNoV2hlbklkbGVTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBzaG91bGRGbHVzaFdoZW5JZGxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIHN0b3BGbHVzaFdoZW5JZGxlKCk6IHZvaWQge1xuXHRcdGRpc3Bvc2UoW3RoaXMucnVuRmx1c2hXaGVuSWRsZSwgdGhpcy5mbHVzaFdoZW5JZGxlU2NoZWR1bGVyXSk7XG5cdH1cblxuXHRpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pbml0aWFsaXphdGlvblByb21pc2UpIHtcblx0XHRcdHRoaXMuaW5pdGlhbGl6YXRpb25Qcm9taXNlID0gKGFzeW5jICgpID0+IHtcblxuXHRcdFx0XHQvLyBJbml0IGFsbCBzdG9yYWdlIGxvY2F0aW9uc1xuXHRcdFx0XHRtYXJrKCdjb2RlL3dpbGxJbml0U3RvcmFnZScpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZG9Jbml0aWFsaXplKCk7IC8vIEFzayBzdWJjbGFzc2VzIHRvIGluaXRpYWxpemUgc3RvcmFnZVxuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdG1hcmsoJ2NvZGUvZGlkSW5pdFN0b3JhZ2UnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE9uIHNvbWUgT1Mgd2UgZG8gbm90IGdldCBlbm91Z2ggdGltZSB0byBwZXJzaXN0IHN0YXRlIG9uIHNodXRkb3duIChlLmcuIHdoZW5cblx0XHRcdFx0Ly8gV2luZG93cyByZXN0YXJ0cyBhZnRlciBhcHBseWluZyB1cGRhdGVzKS4gSW4gb3RoZXIgY2FzZXMsIFZTQ29kZSBtaWdodCBjcmFzaCxcblx0XHRcdFx0Ly8gc28gd2UgcGVyaW9kaWNhbGx5IHNhdmUgc3RhdGUgdG8gcmVkdWNlIHRoZSBjaGFuY2Ugb2YgbG9vc2luZyBhbnkgc3RhdGUuXG5cdFx0XHRcdC8vIEluIHRoZSBicm93c2VyIHdlIGRvIG5vdCBoYXZlIHN1cHBvcnQgZm9yIGxvbmcgcnVubmluZyB1bmxvYWQgc2VxdWVuY2VzLiBBcyBzdWNoLFxuXHRcdFx0XHQvLyB3ZSBjYW5ub3QgYXNrIGZvciBzYXZpbmcgc3RhdGUgaW4gdGhhdCBtb21lbnQsIGJlY2F1c2UgdGhhdCB3b3VsZCByZXN1bHQgaW4gYVxuXHRcdFx0XHQvLyBsb25nIHJ1bm5pbmcgb3BlcmF0aW9uLlxuXHRcdFx0XHQvLyBJbnN0ZWFkLCBwZXJpb2RpY2FsbHkgYXNrIGN1c3RvbWVycyB0byBzYXZlIHNhdmUuIFRoZSBsaWJyYXJ5IHdpbGwgYmUgY2xldmVyIGVub3VnaFxuXHRcdFx0XHQvLyB0byBvbmx5IHNhdmUgc3RhdGUgdGhhdCBoYXMgYWN0dWFsbHkgY2hhbmdlZC5cblx0XHRcdFx0dGhpcy5mbHVzaFdoZW5JZGxlU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9KSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmluaXRpYWxpemF0aW9uUHJvbWlzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBlbWl0RGlkQ2hhbmdlVmFsdWUoc2NvcGU6IFN0b3JhZ2VTY29wZSwgZXZlbnQ6IElTdG9yYWdlQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCB7IGtleSwgZXh0ZXJuYWwgfSA9IGV2ZW50O1xuXG5cdFx0Ly8gU3BlY2lhbGx5IGhhbmRsZSBgVEFSR0VUX0tFWWBcblx0XHRpZiAoa2V5ID09PSBUQVJHRVRfS0VZKSB7XG5cblx0XHRcdC8vIENsZWFyIG91ciBjYWNoZWQgdmVyc2lvbiB3aGljaCBpcyBub3cgb3V0IG9mIGRhdGVcblx0XHRcdHN3aXRjaCAoc2NvcGUpIHtcblx0XHRcdFx0Y2FzZSBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVEOlxuXHRcdFx0XHRcdHRoaXMuX2FwcGxpY2F0aW9uU2hhcmVkS2V5VGFyZ2V0cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT046XG5cdFx0XHRcdFx0dGhpcy5fYXBwbGljYXRpb25LZXlUYXJnZXRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFN0b3JhZ2VTY29wZS5QUk9GSUxFOlxuXHRcdFx0XHRcdHRoaXMuX3Byb2ZpbGVLZXlUYXJnZXRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0U6XG5cdFx0XHRcdFx0dGhpcy5fd29ya3NwYWNlS2V5VGFyZ2V0cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW1pdCBhcyBgZGlkQ2hhbmdlVGFyZ2V0YCBldmVudFxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VUYXJnZXQuZmlyZSh7IHNjb3BlIH0pO1xuXHRcdH1cblxuXHRcdC8vIEVtaXQgYW55IG90aGVyIGtleSB0byBvdXRzaWRlXG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZhbHVlLmZpcmUoeyBzY29wZSwga2V5LCB0YXJnZXQ6IHRoaXMuZ2V0S2V5VGFyZ2V0cyhzY29wZSlba2V5XSwgZXh0ZXJuYWwgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGVtaXRXaWxsU2F2ZVN0YXRlKHJlYXNvbjogV2lsbFNhdmVTdGF0ZVJlYXNvbik6IHZvaWQge1xuXHRcdHRoaXMuX29uV2lsbFNhdmVTdGF0ZS5maXJlKHsgcmVhc29uIH0pO1xuXHR9XG5cblx0Z2V0KGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlOiBzdHJpbmcpOiBzdHJpbmc7XG5cdGdldChrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0KGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlPzogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTdG9yYWdlKHNjb3BlKT8uZ2V0KGtleSwgZmFsbGJhY2tWYWx1ZSk7XG5cdH1cblxuXHRnZXRCb29sZWFuKGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlOiBib29sZWFuKTogYm9vbGVhbjtcblx0Z2V0Qm9vbGVhbihrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSk6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdGdldEJvb2xlYW4oa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU/OiBib29sZWFuKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RvcmFnZShzY29wZSk/LmdldEJvb2xlYW4oa2V5LCBmYWxsYmFja1ZhbHVlKTtcblx0fVxuXG5cdGdldE51bWJlcihrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZTogbnVtYmVyKTogbnVtYmVyO1xuXHRnZXROdW1iZXIoa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUpOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGdldE51bWJlcihrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZT86IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RvcmFnZShzY29wZSk/LmdldE51bWJlcihrZXksIGZhbGxiYWNrVmFsdWUpO1xuXHR9XG5cblx0Z2V0T2JqZWN0KGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlOiBvYmplY3QpOiBvYmplY3Q7XG5cdGdldE9iamVjdChrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSk6IG9iamVjdCB8IHVuZGVmaW5lZDtcblx0Z2V0T2JqZWN0KGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlPzogb2JqZWN0KTogb2JqZWN0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTdG9yYWdlKHNjb3BlKT8uZ2V0T2JqZWN0KGtleSwgZmFsbGJhY2tWYWx1ZSk7XG5cdH1cblxuXHRzdG9yZUFsbChlbnRyaWVzOiBBcnJheTxJU3RvcmFnZUVudHJ5PiwgZXh0ZXJuYWw6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLndpdGhQYXVzZWRFbWl0dGVycygoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdFx0dGhpcy5zdG9yZShlbnRyeS5rZXksIGVudHJ5LnZhbHVlLCBlbnRyeS5zY29wZSwgZW50cnkudGFyZ2V0LCBleHRlcm5hbCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRzdG9yZShrZXk6IHN0cmluZywgdmFsdWU6IFN0b3JhZ2VWYWx1ZSwgc2NvcGU6IFN0b3JhZ2VTY29wZSwgdGFyZ2V0OiBTdG9yYWdlVGFyZ2V0LCBleHRlcm5hbCA9IGZhbHNlKTogdm9pZCB7XG5cblx0XHQvLyBXZSByZW1vdmUgdGhlIGtleSBmb3IgdW5kZWZpbmVkL251bGwgdmFsdWVzXG5cdFx0aWYgKGlzVW5kZWZpbmVkT3JOdWxsKHZhbHVlKSkge1xuXHRcdFx0dGhpcy5yZW1vdmUoa2V5LCBzY29wZSwgZXh0ZXJuYWwpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBvdXIgZGF0YXN0cnVjdHVyZXMgYnV0IHNlbmQgZXZlbnRzIG9ubHkgYWZ0ZXJcblx0XHR0aGlzLndpdGhQYXVzZWRFbWl0dGVycygoKSA9PiB7XG5cblx0XHRcdC8vIFVwZGF0ZSBrZXktdGFyZ2V0IG1hcFxuXHRcdFx0dGhpcy51cGRhdGVLZXlUYXJnZXQoa2V5LCBzY29wZSwgdGFyZ2V0KTtcblxuXHRcdFx0Ly8gU3RvcmUgYWN0dWFsIHZhbHVlXG5cdFx0XHR0aGlzLmdldFN0b3JhZ2Uoc2NvcGUpPy5zZXQoa2V5LCB2YWx1ZSwgZXh0ZXJuYWwpO1xuXHRcdH0pO1xuXHR9XG5cblx0cmVtb3ZlKGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBleHRlcm5hbCA9IGZhbHNlKTogdm9pZCB7XG5cblx0XHQvLyBVcGRhdGUgb3VyIGRhdGFzdHJ1Y3R1cmVzIGJ1dCBzZW5kIGV2ZW50cyBvbmx5IGFmdGVyXG5cdFx0dGhpcy53aXRoUGF1c2VkRW1pdHRlcnMoKCkgPT4ge1xuXG5cdFx0XHQvLyBVcGRhdGUga2V5LXRhcmdldCBtYXBcblx0XHRcdHRoaXMudXBkYXRlS2V5VGFyZ2V0KGtleSwgc2NvcGUsIHVuZGVmaW5lZCk7XG5cblx0XHRcdC8vIFJlbW92ZSBhY3R1YWwga2V5XG5cdFx0XHR0aGlzLmdldFN0b3JhZ2Uoc2NvcGUpPy5kZWxldGUoa2V5LCBleHRlcm5hbCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHdpdGhQYXVzZWRFbWl0dGVycyhmbjogRnVuY3Rpb24pOiB2b2lkIHtcblxuXHRcdC8vIFBhdXNlIGVtaXR0ZXJzXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5wYXVzZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVGFyZ2V0LnBhdXNlKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0Zm4oKTtcblx0XHR9IGZpbmFsbHkge1xuXG5cdFx0XHQvLyBSZXN1bWUgZW1pdHRlcnNcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmFsdWUucmVzdW1lKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRhcmdldC5yZXN1bWUoKTtcblx0XHR9XG5cdH1cblxuXHRrZXlzKHNjb3BlOiBTdG9yYWdlU2NvcGUsIHRhcmdldDogU3RvcmFnZVRhcmdldCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBrZXlzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Y29uc3Qga2V5VGFyZ2V0cyA9IHRoaXMuZ2V0S2V5VGFyZ2V0cyhzY29wZSk7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoa2V5VGFyZ2V0cykpIHtcblx0XHRcdGNvbnN0IGtleVRhcmdldCA9IGtleVRhcmdldHNba2V5XTtcblx0XHRcdGlmIChrZXlUYXJnZXQgPT09IHRhcmdldCkge1xuXHRcdFx0XHRrZXlzLnB1c2goa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ga2V5cztcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlS2V5VGFyZ2V0KGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCB0YXJnZXQ6IFN0b3JhZ2VUYXJnZXQgfCB1bmRlZmluZWQsIGV4dGVybmFsID0gZmFsc2UpOiB2b2lkIHtcblxuXHRcdC8vIEFkZFxuXHRcdGNvbnN0IGtleVRhcmdldHMgPSB0aGlzLmdldEtleVRhcmdldHMoc2NvcGUpO1xuXHRcdGlmICh0eXBlb2YgdGFyZ2V0ID09PSAnbnVtYmVyJykge1xuXHRcdFx0aWYgKGtleVRhcmdldHNba2V5XSAhPT0gdGFyZ2V0KSB7XG5cdFx0XHRcdGtleVRhcmdldHNba2V5XSA9IHRhcmdldDtcblx0XHRcdFx0dGhpcy5nZXRTdG9yYWdlKHNjb3BlKT8uc2V0KFRBUkdFVF9LRVksIEpTT04uc3RyaW5naWZ5KGtleVRhcmdldHMpLCBleHRlcm5hbCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlXG5cdFx0ZWxzZSB7XG5cdFx0XHRpZiAodHlwZW9mIGtleVRhcmdldHNba2V5XSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0ZGVsZXRlIGtleVRhcmdldHNba2V5XTtcblx0XHRcdFx0dGhpcy5nZXRTdG9yYWdlKHNjb3BlKT8uc2V0KFRBUkdFVF9LRVksIEpTT04uc3RyaW5naWZ5KGtleVRhcmdldHMpLCBleHRlcm5hbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfd29ya3NwYWNlS2V5VGFyZ2V0czogSUtleVRhcmdldHMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IHdvcmtzcGFjZUtleVRhcmdldHMoKTogSUtleVRhcmdldHMge1xuXHRcdGlmICghdGhpcy5fd29ya3NwYWNlS2V5VGFyZ2V0cykge1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlS2V5VGFyZ2V0cyA9IHRoaXMubG9hZEtleVRhcmdldHMoU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtzcGFjZUtleVRhcmdldHM7XG5cdH1cblxuXHRwcml2YXRlIF9wcm9maWxlS2V5VGFyZ2V0czogSUtleVRhcmdldHMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IHByb2ZpbGVLZXlUYXJnZXRzKCk6IElLZXlUYXJnZXRzIHtcblx0XHRpZiAoIXRoaXMuX3Byb2ZpbGVLZXlUYXJnZXRzKSB7XG5cdFx0XHR0aGlzLl9wcm9maWxlS2V5VGFyZ2V0cyA9IHRoaXMubG9hZEtleVRhcmdldHMoU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9wcm9maWxlS2V5VGFyZ2V0cztcblx0fVxuXG5cdHByaXZhdGUgX2FwcGxpY2F0aW9uS2V5VGFyZ2V0czogSUtleVRhcmdldHMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IGFwcGxpY2F0aW9uS2V5VGFyZ2V0cygpOiBJS2V5VGFyZ2V0cyB7XG5cdFx0aWYgKCF0aGlzLl9hcHBsaWNhdGlvbktleVRhcmdldHMpIHtcblx0XHRcdHRoaXMuX2FwcGxpY2F0aW9uS2V5VGFyZ2V0cyA9IHRoaXMubG9hZEtleVRhcmdldHMoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fYXBwbGljYXRpb25LZXlUYXJnZXRzO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbGljYXRpb25TaGFyZWRLZXlUYXJnZXRzOiBJS2V5VGFyZ2V0cyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgYXBwbGljYXRpb25TaGFyZWRLZXlUYXJnZXRzKCk6IElLZXlUYXJnZXRzIHtcblx0XHRpZiAoIXRoaXMuX2FwcGxpY2F0aW9uU2hhcmVkS2V5VGFyZ2V0cykge1xuXHRcdFx0dGhpcy5fYXBwbGljYXRpb25TaGFyZWRLZXlUYXJnZXRzID0gdGhpcy5sb2FkS2V5VGFyZ2V0cyhTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVEKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fYXBwbGljYXRpb25TaGFyZWRLZXlUYXJnZXRzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRLZXlUYXJnZXRzKHNjb3BlOiBTdG9yYWdlU2NvcGUpOiBJS2V5VGFyZ2V0cyB7XG5cdFx0c3dpdGNoIChzY29wZSkge1xuXHRcdFx0Y2FzZSBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVEOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5hcHBsaWNhdGlvblNoYXJlZEtleVRhcmdldHM7XG5cdFx0XHRjYXNlIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTjpcblx0XHRcdFx0cmV0dXJuIHRoaXMuYXBwbGljYXRpb25LZXlUYXJnZXRzO1xuXHRcdFx0Y2FzZSBTdG9yYWdlU2NvcGUuUFJPRklMRTpcblx0XHRcdFx0cmV0dXJuIHRoaXMucHJvZmlsZUtleVRhcmdldHM7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VLZXlUYXJnZXRzO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbG9hZEtleVRhcmdldHMoc2NvcGU6IFN0b3JhZ2VTY29wZSk6IHsgW2tleTogc3RyaW5nXTogU3RvcmFnZVRhcmdldCB9IHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGhpcy5nZXRTdG9yYWdlKHNjb3BlKTtcblxuXHRcdHJldHVybiBzdG9yYWdlID8gbG9hZEtleVRhcmdldHMoc3RvcmFnZSkgOiBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHR9XG5cblx0aXNOZXcoc2NvcGU6IFN0b3JhZ2VTY29wZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmdldEJvb2xlYW4oSVNfTkVXX0tFWSwgc2NvcGUpID09PSB0cnVlO1xuXHR9XG5cblx0YXN5bmMgZmx1c2gocmVhc29uID0gV2lsbFNhdmVTdGF0ZVJlYXNvbi5OT05FKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBTaWduYWwgZXZlbnQgdG8gY29sbGVjdCBjaGFuZ2VzXG5cdFx0dGhpcy5fb25XaWxsU2F2ZVN0YXRlLmZpcmUoeyByZWFzb24gfSk7XG5cblx0XHRjb25zdCBhcHBsaWNhdGlvblN0b3JhZ2UgPSB0aGlzLmdldFN0b3JhZ2UoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRjb25zdCBhcHBsaWNhdGlvblNoYXJlZFN0b3JhZ2UgPSB0aGlzLmdldFN0b3JhZ2UoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRCk7XG5cdFx0Y29uc3QgcHJvZmlsZVN0b3JhZ2UgPSB0aGlzLmdldFN0b3JhZ2UoU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVN0b3JhZ2UgPSB0aGlzLmdldFN0b3JhZ2UoU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cblx0XHRzd2l0Y2ggKHJlYXNvbikge1xuXG5cdFx0XHQvLyBVbnNwZWNpZmljIHJlYXNvbjoganVzdCB3YWl0IHdoZW4gZGF0YSBpcyBmbHVzaGVkXG5cdFx0XHRjYXNlIFdpbGxTYXZlU3RhdGVSZWFzb24uTk9ORTpcblx0XHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChbXG5cdFx0XHRcdFx0YXBwbGljYXRpb25TdG9yYWdlPy53aGVuRmx1c2hlZCgpID8/IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0XHRcdGFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZT8ud2hlbkZsdXNoZWQoKSA/PyBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdFx0XHRwcm9maWxlU3RvcmFnZT8ud2hlbkZsdXNoZWQoKSA/PyBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdFx0XHR3b3Jrc3BhY2VTdG9yYWdlPy53aGVuRmx1c2hlZCgpID8/IFByb21pc2UucmVzb2x2ZSgpXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Ly8gU2h1dGRvd246IHdlIHdhbnQgdG8gZmx1c2ggYXMgc29vbiBhcyBwb3NzaWJsZVxuXHRcdFx0Ly8gYW5kIG5vdCBoaXQgYW55IGRlbGF5cyB0aGF0IG1pZ2h0IGJlIHRoZXJlXG5cdFx0XHRjYXNlIFdpbGxTYXZlU3RhdGVSZWFzb24uU0hVVERPV046XG5cdFx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoW1xuXHRcdFx0XHRcdGFwcGxpY2F0aW9uU3RvcmFnZT8uZmx1c2goMCkgPz8gUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0XHRcdFx0YXBwbGljYXRpb25TaGFyZWRTdG9yYWdlPy5mbHVzaCgwKSA/PyBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdFx0XHRwcm9maWxlU3RvcmFnZT8uZmx1c2goMCkgPz8gUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0XHRcdFx0d29ya3NwYWNlU3RvcmFnZT8uZmx1c2goMCkgPz8gUHJvbWlzZS5yZXNvbHZlKClcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGxvZygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhcHBsaWNhdGlvbkl0ZW1zID0gdGhpcy5nZXRTdG9yYWdlKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik/Lml0ZW1zID8/IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgYXBwbGljYXRpb25TaGFyZWRJdGVtcyA9IHRoaXMuZ2V0U3RvcmFnZShTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVEKT8uaXRlbXMgPz8gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRjb25zdCBwcm9maWxlSXRlbXMgPSB0aGlzLmdldFN0b3JhZ2UoU3RvcmFnZVNjb3BlLlBST0ZJTEUpPy5pdGVtcyA/PyBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUl0ZW1zID0gdGhpcy5nZXRTdG9yYWdlKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpPy5pdGVtcyA/PyBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdFx0cmV0dXJuIGxvZ1N0b3JhZ2UoXG5cdFx0XHRhcHBsaWNhdGlvbkl0ZW1zLFxuXHRcdFx0YXBwbGljYXRpb25TaGFyZWRJdGVtcyxcblx0XHRcdHByb2ZpbGVJdGVtcyxcblx0XHRcdHdvcmtzcGFjZUl0ZW1zLFxuXHRcdFx0dGhpcy5nZXRMb2dEZXRhaWxzKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikgPz8gJycsXG5cdFx0XHR0aGlzLmdldExvZ0RldGFpbHMoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRCkgPz8gJycsXG5cdFx0XHR0aGlzLmdldExvZ0RldGFpbHMoU3RvcmFnZVNjb3BlLlBST0ZJTEUpID8/ICcnLFxuXHRcdFx0dGhpcy5nZXRMb2dEZXRhaWxzKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpID8/ICcnXG5cdFx0KTtcblx0fVxuXG5cdGFzeW5jIG9wdGltaXplKHNjb3BlOiBTdG9yYWdlU2NvcGUpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIEF3YWl0IHBlbmRpbmcgZGF0YSB0byBiZSBmbHVzaGVkIHRvIHRoZSBEQlxuXHRcdC8vIGJlZm9yZSBhdHRlbXB0aW5nIHRvIG9wdGltaXplIHRoZSBEQlxuXHRcdGF3YWl0IHRoaXMuZmx1c2goKTtcblxuXHRcdHJldHVybiB0aGlzLmdldFN0b3JhZ2Uoc2NvcGUpPy5vcHRpbWl6ZSgpO1xuXHR9XG5cblx0YXN5bmMgc3dpdGNoKHRvOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciB8IElVc2VyRGF0YVByb2ZpbGUsIHByZXNlcnZlRGF0YTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gU2lnbmFsIGFzIGV2ZW50IHNvIHRoYXQgY2xpZW50cyBjYW4gc3RvcmUgZGF0YSBiZWZvcmUgd2Ugc3dpdGNoXG5cdFx0dGhpcy5lbWl0V2lsbFNhdmVTdGF0ZShXaWxsU2F2ZVN0YXRlUmVhc29uLk5PTkUpO1xuXG5cdFx0aWYgKGlzVXNlckRhdGFQcm9maWxlKHRvKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc3dpdGNoVG9Qcm9maWxlKHRvLCBwcmVzZXJ2ZURhdGEpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnN3aXRjaFRvV29ya3NwYWNlKHRvLCBwcmVzZXJ2ZURhdGEpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNhblN3aXRjaFByb2ZpbGUoZnJvbTogSVVzZXJEYXRhUHJvZmlsZSwgdG86IElVc2VyRGF0YVByb2ZpbGUpOiBib29sZWFuIHtcblx0XHRpZiAoZnJvbS5pZCA9PT0gdG8uaWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gYm90aCBwcm9maWxlcyBhcmUgc2FtZVxuXHRcdH1cblxuXHRcdGlmIChpc1Byb2ZpbGVVc2luZ0RlZmF1bHRTdG9yYWdlKHRvKSAmJiBpc1Byb2ZpbGVVc2luZ0RlZmF1bHRTdG9yYWdlKGZyb20pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGJvdGggcHJvZmlsZXMgYXJlIHVzaW5nIGRlZmF1bHRcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBzd2l0Y2hEYXRhKG9sZFN0b3JhZ2U6IE1hcDxzdHJpbmcsIHN0cmluZz4sIG5ld1N0b3JhZ2U6IElTdG9yYWdlLCBzY29wZTogU3RvcmFnZVNjb3BlKTogdm9pZCB7XG5cdFx0dGhpcy53aXRoUGF1c2VkRW1pdHRlcnMoKCkgPT4ge1xuXHRcdFx0Ly8gU2lnbmFsIHN0b3JhZ2Uga2V5cyB0aGF0IGhhdmUgY2hhbmdlZFxuXHRcdFx0Y29uc3QgaGFuZGxlZGtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgb2xkVmFsdWVdIG9mIG9sZFN0b3JhZ2UpIHtcblx0XHRcdFx0aGFuZGxlZGtleXMuYWRkKGtleSk7XG5cblx0XHRcdFx0Y29uc3QgbmV3VmFsdWUgPSBuZXdTdG9yYWdlLmdldChrZXkpO1xuXHRcdFx0XHRpZiAobmV3VmFsdWUgIT09IG9sZFZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5lbWl0RGlkQ2hhbmdlVmFsdWUoc2NvcGUsIHsga2V5LCBleHRlcm5hbDogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IFtrZXldIG9mIG5ld1N0b3JhZ2UuaXRlbXMpIHtcblx0XHRcdFx0aWYgKCFoYW5kbGVka2V5cy5oYXMoa2V5KSkge1xuXHRcdFx0XHRcdHRoaXMuZW1pdERpZENoYW5nZVZhbHVlKHNjb3BlLCB7IGtleSwgZXh0ZXJuYWw6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8vIC0tLSBhYnN0cmFjdFxuXG5cdGFic3RyYWN0IGhhc1Njb3BlKHNjb3BlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciB8IElVc2VyRGF0YVByb2ZpbGUpOiBib29sZWFuO1xuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBkb0luaXRpYWxpemUoKTogUHJvbWlzZTx2b2lkPjtcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0U3RvcmFnZShzY29wZTogU3RvcmFnZVNjb3BlKTogSVN0b3JhZ2UgfCB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldExvZ0RldGFpbHMoc2NvcGU6IFN0b3JhZ2VTY29wZSk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3Qgc3dpdGNoVG9Qcm9maWxlKHRvUHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSwgcHJlc2VydmVEYXRhOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IHN3aXRjaFRvV29ya3NwYWNlKHRvV29ya3NwYWNlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciB8IElVc2VyRGF0YVByb2ZpbGUsIHByZXNlcnZlRGF0YTogYm9vbGVhbik6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1Byb2ZpbGVVc2luZ0RlZmF1bHRTdG9yYWdlKHByb2ZpbGU6IElVc2VyRGF0YVByb2ZpbGUpOiBib29sZWFuIHtcblx0cmV0dXJuIHByb2ZpbGUuaXNEZWZhdWx0IHx8ICEhcHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M/Lmdsb2JhbFN0YXRlO1xufVxuXG5leHBvcnQgY2xhc3MgSW5NZW1vcnlTdG9yYWdlU2VydmljZSBleHRlbmRzIEFic3RyYWN0U3RvcmFnZVNlcnZpY2Uge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYXBwbGljYXRpb25TdG9yYWdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFN0b3JhZ2UobmV3IEluTWVtb3J5U3RvcmFnZURhdGFiYXNlKCksIHsgaGludDogU3RvcmFnZUhpbnQuU1RPUkFHRV9JTl9NRU1PUlkgfSkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTdG9yYWdlKG5ldyBJbk1lbW9yeVN0b3JhZ2VEYXRhYmFzZSgpLCB7IGhpbnQ6IFN0b3JhZ2VIaW50LlNUT1JBR0VfSU5fTUVNT1JZIH0pKTtcblx0cHJpdmF0ZSByZWFkb25seSBwcm9maWxlU3RvcmFnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTdG9yYWdlKG5ldyBJbk1lbW9yeVN0b3JhZ2VEYXRhYmFzZSgpLCB7IGhpbnQ6IFN0b3JhZ2VIaW50LlNUT1JBR0VfSU5fTUVNT1JZIH0pKTtcblx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VTdG9yYWdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFN0b3JhZ2UobmV3IEluTWVtb3J5U3RvcmFnZURhdGFiYXNlKCksIHsgaGludDogU3RvcmFnZUhpbnQuU1RPUkFHRV9JTl9NRU1PUlkgfSkpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZVN0b3JhZ2Uub25EaWRDaGFuZ2VTdG9yYWdlKGUgPT4gdGhpcy5lbWl0RGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnByb2ZpbGVTdG9yYWdlLm9uRGlkQ2hhbmdlU3RvcmFnZShlID0+IHRoaXMuZW1pdERpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXBwbGljYXRpb25TdG9yYWdlLm9uRGlkQ2hhbmdlU3RvcmFnZShlID0+IHRoaXMuZW1pdERpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZS5vbkRpZENoYW5nZVN0b3JhZ2UoZSA9PiB0aGlzLmVtaXREaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVELCBlKSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFN0b3JhZ2Uoc2NvcGU6IFN0b3JhZ2VTY29wZSk6IElTdG9yYWdlIHtcblx0XHRzd2l0Y2ggKHNjb3BlKSB7XG5cdFx0XHRjYXNlIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTl9TSEFSRUQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLmFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZTtcblx0XHRcdGNhc2UgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5hcHBsaWNhdGlvblN0b3JhZ2U7XG5cdFx0XHRjYXNlIFN0b3JhZ2VTY29wZS5QUk9GSUxFOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5wcm9maWxlU3RvcmFnZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLndvcmtzcGFjZVN0b3JhZ2U7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGdldExvZ0RldGFpbHMoc2NvcGU6IFN0b3JhZ2VTY29wZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoIChzY29wZSkge1xuXHRcdFx0Y2FzZSBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVEOlxuXHRcdFx0XHRyZXR1cm4gJ2luTWVtb3J5IChhcHBsaWNhdGlvbi1zaGFyZWQpJztcblx0XHRcdGNhc2UgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OOlxuXHRcdFx0XHRyZXR1cm4gJ2luTWVtb3J5IChhcHBsaWNhdGlvbiknO1xuXHRcdFx0Y2FzZSBTdG9yYWdlU2NvcGUuUFJPRklMRTpcblx0XHRcdFx0cmV0dXJuICdpbk1lbW9yeSAocHJvZmlsZSknO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuICdpbk1lbW9yeSAod29ya3NwYWNlKSc7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGRvSW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdHByb3RlY3RlZCBhc3luYyBzd2l0Y2hUb1Byb2ZpbGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gbm8tb3Agd2hlbiBpbi1tZW1vcnlcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBzd2l0Y2hUb1dvcmtzcGFjZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBuby1vcCB3aGVuIGluLW1lbW9yeVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNob3VsZEZsdXNoV2hlbklkbGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aGFzU2NvcGUoc2NvcGU6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyIHwgSVVzZXJEYXRhUHJvZmlsZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9nU3RvcmFnZShhcHBsaWNhdGlvbjogTWFwPHN0cmluZywgc3RyaW5nPiwgYXBwbGljYXRpb25TaGFyZWQ6IE1hcDxzdHJpbmcsIHN0cmluZz4sIHByb2ZpbGU6IE1hcDxzdHJpbmcsIHN0cmluZz4sIHdvcmtzcGFjZTogTWFwPHN0cmluZywgc3RyaW5nPiwgYXBwbGljYXRpb25QYXRoOiBzdHJpbmcsIGFwcGxpY2F0aW9uU2hhcmVkUGF0aDogc3RyaW5nLCBwcm9maWxlUGF0aDogc3RyaW5nLCB3b3Jrc3BhY2VQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3Qgc2FmZVBhcnNlID0gKHZhbHVlOiBzdHJpbmcpID0+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIEpTT04ucGFyc2UodmFsdWUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXHR9O1xuXG5cdGNvbnN0IGFwcGxpY2F0aW9uSXRlbXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRjb25zdCBhcHBsaWNhdGlvbkl0ZW1zUGFyc2VkID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0YXBwbGljYXRpb24uZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuXHRcdGFwcGxpY2F0aW9uSXRlbXMuc2V0KGtleSwgdmFsdWUpO1xuXHRcdGFwcGxpY2F0aW9uSXRlbXNQYXJzZWQuc2V0KGtleSwgc2FmZVBhcnNlKHZhbHVlKSk7XG5cdH0pO1xuXG5cdGNvbnN0IGFwcGxpY2F0aW9uU2hhcmVkSXRlbXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRjb25zdCBhcHBsaWNhdGlvblNoYXJlZEl0ZW1zUGFyc2VkID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0YXBwbGljYXRpb25TaGFyZWQuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuXHRcdGFwcGxpY2F0aW9uU2hhcmVkSXRlbXMuc2V0KGtleSwgdmFsdWUpO1xuXHRcdGFwcGxpY2F0aW9uU2hhcmVkSXRlbXNQYXJzZWQuc2V0KGtleSwgc2FmZVBhcnNlKHZhbHVlKSk7XG5cdH0pO1xuXG5cdGNvbnN0IHByb2ZpbGVJdGVtcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdGNvbnN0IHByb2ZpbGVJdGVtc1BhcnNlZCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdHByb2ZpbGUuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuXHRcdHByb2ZpbGVJdGVtcy5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0cHJvZmlsZUl0ZW1zUGFyc2VkLnNldChrZXksIHNhZmVQYXJzZSh2YWx1ZSkpO1xuXHR9KTtcblxuXHRjb25zdCB3b3Jrc3BhY2VJdGVtcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdGNvbnN0IHdvcmtzcGFjZUl0ZW1zUGFyc2VkID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0d29ya3NwYWNlLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcblx0XHR3b3Jrc3BhY2VJdGVtcy5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0d29ya3NwYWNlSXRlbXNQYXJzZWQuc2V0KGtleSwgc2FmZVBhcnNlKHZhbHVlKSk7XG5cdH0pO1xuXG5cdGlmIChhcHBsaWNhdGlvblBhdGggIT09IHByb2ZpbGVQYXRoKSB7XG5cdFx0Y29uc29sZS5ncm91cChgU3RvcmFnZTogQXBwbGljYXRpb24gKHBhdGg6ICR7YXBwbGljYXRpb25QYXRofSlgKTtcblx0fSBlbHNlIHtcblx0XHRjb25zb2xlLmdyb3VwKGBTdG9yYWdlOiBBcHBsaWNhdGlvbiAmIFByb2ZpbGUgKHBhdGg6ICR7YXBwbGljYXRpb25QYXRofSwgZGVmYXVsdCBwcm9maWxlKWApO1xuXHR9XG5cdGNvbnN0IGFwcGxpY2F0aW9uVmFsdWVzOiB7IGtleTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSA9IFtdO1xuXHRhcHBsaWNhdGlvbkl0ZW1zLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcblx0XHRhcHBsaWNhdGlvblZhbHVlcy5wdXNoKHsga2V5LCB2YWx1ZSB9KTtcblx0fSk7XG5cdGNvbnNvbGUudGFibGUoYXBwbGljYXRpb25WYWx1ZXMpO1xuXHRjb25zb2xlLmdyb3VwRW5kKCk7XG5cblx0Y29uc29sZS5sb2coYXBwbGljYXRpb25JdGVtc1BhcnNlZCk7XG5cblx0Y29uc29sZS5ncm91cChgU3RvcmFnZTogQXBwbGljYXRpb24gU2hhcmVkIChwYXRoOiAke2FwcGxpY2F0aW9uU2hhcmVkUGF0aH0pYCk7XG5cdGNvbnN0IGFwcGxpY2F0aW9uU2hhcmVkVmFsdWVzOiB7IGtleTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSA9IFtdO1xuXHRhcHBsaWNhdGlvblNoYXJlZEl0ZW1zLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcblx0XHRhcHBsaWNhdGlvblNoYXJlZFZhbHVlcy5wdXNoKHsga2V5LCB2YWx1ZSB9KTtcblx0fSk7XG5cdGNvbnNvbGUudGFibGUoYXBwbGljYXRpb25TaGFyZWRWYWx1ZXMpO1xuXHRjb25zb2xlLmdyb3VwRW5kKCk7XG5cblx0Y29uc29sZS5sb2coYXBwbGljYXRpb25TaGFyZWRJdGVtc1BhcnNlZCk7XG5cblx0aWYgKGFwcGxpY2F0aW9uUGF0aCAhPT0gcHJvZmlsZVBhdGgpIHtcblx0XHRjb25zb2xlLmdyb3VwKGBTdG9yYWdlOiBQcm9maWxlIChwYXRoOiAke3Byb2ZpbGVQYXRofSwgcHJvZmlsZSBzcGVjaWZpYylgKTtcblx0XHRjb25zdCBwcm9maWxlVmFsdWVzOiB7IGtleTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdHByb2ZpbGVJdGVtcy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0XHRwcm9maWxlVmFsdWVzLnB1c2goeyBrZXksIHZhbHVlIH0pO1xuXHRcdH0pO1xuXHRcdGNvbnNvbGUudGFibGUocHJvZmlsZVZhbHVlcyk7XG5cdFx0Y29uc29sZS5ncm91cEVuZCgpO1xuXG5cdFx0Y29uc29sZS5sb2cocHJvZmlsZUl0ZW1zUGFyc2VkKTtcblx0fVxuXG5cdGNvbnNvbGUuZ3JvdXAoYFN0b3JhZ2U6IFdvcmtzcGFjZSAocGF0aDogJHt3b3Jrc3BhY2VQYXRofSlgKTtcblx0Y29uc3Qgd29ya3NwYWNlVmFsdWVzOiB7IGtleTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSA9IFtdO1xuXHR3b3Jrc3BhY2VJdGVtcy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0d29ya3NwYWNlVmFsdWVzLnB1c2goeyBrZXksIHZhbHVlIH0pO1xuXHR9KTtcblx0Y29uc29sZS50YWJsZSh3b3Jrc3BhY2VWYWx1ZXMpO1xuXHRjb25zb2xlLmdyb3VwRW5kKCk7XG5cblx0Y29uc29sZS5sb2cod29ya3NwYWNlSXRlbXNQYXJzZWQpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxVQUFVLGtCQUFrQix5QkFBeUI7QUFDOUQsU0FBUyxTQUFTLE9BQU8sd0JBQXdCO0FBQ2pELFNBQVMsWUFBNkIsU0FBUyx5QkFBeUI7QUFDeEUsU0FBUyxZQUFZO0FBQ3JCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXdELFNBQVMsbUJBQWlDO0FBQzNHLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQTJDO0FBRzdDLE1BQU0sYUFBYTtBQUNuQixNQUFNLGFBQWE7QUFFbkIsTUFBTSxrQkFBa0IsZ0JBQWlDLGdCQUFnQjtBQUV6RSxJQUFLLHNCQUFMLGtCQUFLQSx5QkFBTDtBQUtOLEVBQUFB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
