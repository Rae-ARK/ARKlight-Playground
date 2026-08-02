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
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue, transaction } from "../../../../base/common/observable.js";
import { joinPath, dirname, isEqual } from "../../../../base/common/resources.js";
import { parse } from "../../../../base/common/jsonc.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IJSONEditingService } from "../../../../workbench/services/configuration/common/jsonEditing.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IPreferencesService } from "../../../../workbench/services/preferences/common/preferences.js";
import { ISessionTaskRunnerRegistry } from "./sessionTaskRunner.js";
const ISessionsTasksService = createDecorator("sessionsTasksService");
let SessionsTasksService = class extends Disposable {
  constructor(_fileService, _jsonEditingService, _preferencesService, _taskRunnerRegistry, _storageService) {
    super();
    this._fileService = _fileService;
    this._jsonEditingService = _jsonEditingService;
    this._preferencesService = _preferencesService;
    this._taskRunnerRegistry = _taskRunnerRegistry;
    this._storageService = _storageService;
    this._onDidRunTask = this._register(new Emitter());
    this.onDidRunTask = this._onDidRunTask.event;
    this._sessionTasks = observableValue(this, []);
    this._fileWatcher = this._register(new MutableDisposable());
    this._pinnedTaskObservables = /* @__PURE__ */ new Map();
    this._browserUrlObservables = /* @__PURE__ */ new Map();
    this._pinnedBrowserObservables = /* @__PURE__ */ new Map();
    this._pinnedTaskLabels = this._loadPinnedTaskLabels();
    this._browserUrls = this._loadBrowserUrls();
    this._pinnedBrowsers = this._loadPinnedBrowsers();
  }
  getSessionTasks(session) {
    const folder = this._getSessionFolder(session);
    this._ensureFileWatch(folder);
    if (!isEqual(this._lastRefreshedFolder, folder)) {
      this._lastRefreshedFolder = folder;
      this._refreshSessionTasks(folder);
    }
    return this._sessionTasks;
  }
  async getSessionTasksOnce(session) {
    return this._readTasksFromBothTargets(session, (t) => !!t.inAgents);
  }
  async getAllTasks(session) {
    return this._readTasksFromBothTargets(session, () => true);
  }
  async getNonSessionTasks(session) {
    return this._readTasksFromBothTargets(session, (t) => !t.inAgents);
  }
  /**
   * Reads tasks from both workspace and user `tasks.json` for a session,
   * filtering each entry through `predicate` (in addition to the supported-type
   * check) and tagging it with its storage target.
   */
  async _readTasksFromBothTargets(session, predicate) {
    const result = [];
    const targets = ["workspace", "user"];
    for (const target of targets) {
      const uri = this._getTasksJsonUri(session, target);
      if (!uri) {
        continue;
      }
      const json = await this._readTasksJson(uri);
      for (const task of json.tasks ?? []) {
        if (predicate(task) && this._isSupportedTask(task)) {
          result.push({ task, target });
        }
      }
    }
    return result;
  }
  async addTaskToSessions(task, session, target, options) {
    const tasksJsonUri = this._getTasksJsonUri(session, target);
    if (!tasksJsonUri) {
      return;
    }
    const tasksJson = await this._readTasksJson(tasksJsonUri);
    const tasks = tasksJson.tasks ?? [];
    const index = tasks.findIndex((t) => t.label === task.label);
    if (index === -1) {
      return;
    }
    const edits = [
      { path: ["tasks", index, "inAgents"], value: true }
    ];
    if (options) {
      edits.push({
        path: ["tasks", index, "runOptions"],
        value: options.runOn && options.runOn !== "default" ? { runOn: options.runOn } : void 0
      });
    }
    await this._jsonEditingService.write(tasksJsonUri, edits, true);
  }
  async createAndAddTask(label, command, session, target, options) {
    const tasksJsonUri = this._getTasksJsonUri(session, target);
    if (!tasksJsonUri) {
      return void 0;
    }
    const tasksJson = await this._readTasksJson(tasksJsonUri);
    const tasks = tasksJson.tasks ?? [];
    const resolvedLabel = label?.trim() || command;
    const newTask = {
      label: resolvedLabel,
      type: "shell",
      command,
      inAgents: true,
      ...options?.runOn && options.runOn !== "default" ? { runOptions: { runOn: options.runOn } } : {}
    };
    await this._jsonEditingService.write(tasksJsonUri, [
      { path: ["version"], value: tasksJson.version ?? "2.0.0" },
      { path: ["tasks"], value: [...tasks, newTask] }
    ], true);
    return newTask;
  }
  async updateTask(originalTaskLabel, updatedTask, session, currentTarget, newTarget) {
    const currentTasksJsonUri = this._getTasksJsonUri(session, currentTarget);
    const newTasksJsonUri = this._getTasksJsonUri(session, newTarget);
    if (!currentTasksJsonUri || !newTasksJsonUri) {
      return;
    }
    const currentTasksJson = await this._readTasksJson(currentTasksJsonUri);
    const currentTasks = currentTasksJson.tasks ?? [];
    const currentIndex = currentTasks.findIndex((task) => task.label === originalTaskLabel);
    if (currentIndex === -1) {
      return;
    }
    if (currentTasksJsonUri.toString() === newTasksJsonUri.toString()) {
      const updatedTasks = currentTasks.map((task, i) => i === currentIndex ? updatedTask : task);
      await this._jsonEditingService.write(currentTasksJsonUri, [
        { path: ["tasks"], value: updatedTasks }
      ], true);
    } else {
      const newTasksJson = await this._readTasksJson(newTasksJsonUri);
      const newTasks = newTasksJson.tasks ?? [];
      await this._jsonEditingService.write(currentTasksJsonUri, [
        { path: ["tasks"], value: currentTasks.filter((_, taskIndex) => taskIndex !== currentIndex) }
      ], true);
      await this._jsonEditingService.write(newTasksJsonUri, [
        { path: ["version"], value: newTasksJson.version ?? "2.0.0" },
        { path: ["tasks"], value: [...newTasks, updatedTask] }
      ], true);
    }
    const repoUri = this._getSessionRepo(session)?.root;
    if (repoUri) {
      const key = repoUri.toString();
      if (this._pinnedTaskLabels.get(key) === originalTaskLabel) {
        this._setPinnedTaskLabelForKey(key, updatedTask.label);
      }
    }
  }
  async removeTask(taskLabel, session, target) {
    const tasksJsonUri = this._getTasksJsonUri(session, target);
    if (!tasksJsonUri) {
      return;
    }
    const tasksJson = await this._readTasksJson(tasksJsonUri);
    const tasks = tasksJson.tasks ?? [];
    const index = tasks.findIndex((t) => t.label === taskLabel);
    if (index === -1) {
      return;
    }
    await this._jsonEditingService.write(tasksJsonUri, [
      { path: ["tasks"], value: tasks.filter((_, taskIndex) => taskIndex !== index) }
    ], true);
    const repoUri = this._getSessionRepo(session)?.root;
    if (repoUri) {
      const key = repoUri.toString();
      if (this._pinnedTaskLabels.get(key) === taskLabel) {
        this._setPinnedTaskLabelForKey(key, void 0);
      }
    }
  }
  async runTask(task, session) {
    const runner = this._taskRunnerRegistry.getRunner(session);
    if (!runner) {
      return void 0;
    }
    const handle = await runner.runTask(task, session);
    this._onDidRunTask.fire({ task, session });
    return handle;
  }
  getPinnedTaskLabel(repository) {
    if (!repository) {
      return observableValue("pinnedTaskLabel", void 0);
    }
    const key = repository.toString();
    let obs = this._pinnedTaskObservables.get(key);
    if (!obs) {
      obs = observableValue("pinnedTaskLabel", this._pinnedTaskLabels.get(key));
      this._pinnedTaskObservables.set(key, obs);
    }
    return obs;
  }
  setPinnedTaskLabel(repository, taskLabel) {
    if (!repository) {
      return;
    }
    const key = repository.toString();
    this._setPinnedTaskLabelForKey(key, taskLabel);
    if (taskLabel !== void 0) {
      this._setPinnedBrowserForKey(key, false);
    }
  }
  getBrowserUrl(repository) {
    if (!repository) {
      return observableValue("browserUrl", void 0);
    }
    const key = repository.toString();
    let obs = this._browserUrlObservables.get(key);
    if (!obs) {
      obs = observableValue("browserUrl", this._browserUrls.get(key));
      this._browserUrlObservables.set(key, obs);
    }
    return obs;
  }
  setBrowserUrl(repository, url) {
    if (!repository) {
      return;
    }
    const key = repository.toString();
    const trimmed = url?.trim();
    if (!trimmed) {
      this._browserUrls.delete(key);
    } else {
      this._browserUrls.set(key, trimmed);
    }
    this._saveBrowserUrls();
    const obs = this._browserUrlObservables.get(key);
    if (obs) {
      transaction((tx) => obs.set(trimmed || void 0, tx));
    }
  }
  getPinnedBrowser(repository) {
    if (!repository) {
      return observableValue("pinnedBrowser", false);
    }
    const key = repository.toString();
    let obs = this._pinnedBrowserObservables.get(key);
    if (!obs) {
      obs = observableValue("pinnedBrowser", this._pinnedBrowsers.has(key));
      this._pinnedBrowserObservables.set(key, obs);
    }
    return obs;
  }
  setPinnedBrowser(repository, pinned) {
    if (!repository) {
      return;
    }
    const key = repository.toString();
    this._setPinnedBrowserForKey(key, pinned);
    if (pinned) {
      this._setPinnedTaskLabelForKey(key, void 0);
    }
  }
  // --- private helpers ---
  _getSessionRepo(session) {
    return session.workspace.get()?.folders[0];
  }
  _getSessionFolder(session) {
    const repo = this._getSessionRepo(session);
    return repo?.workingDirectory ?? repo?.root;
  }
  _getTasksJsonUri(session, target) {
    if (target === "workspace") {
      return this._getWorkspaceTasksJsonUri(this._getSessionFolder(session));
    }
    return this._getUserTasksJsonUri();
  }
  _getWorkspaceTasksJsonUri(folder) {
    return folder?.path ? joinPath(folder, ".vscode", "tasks.json") : void 0;
  }
  _getUserTasksJsonUri() {
    const userSettingsResource = this._preferencesService.userSettingsResource;
    if (!userSettingsResource.path) {
      return void 0;
    }
    const userSettingsFolder = dirname(userSettingsResource);
    return userSettingsFolder.path ? joinPath(userSettingsFolder, "tasks.json") : void 0;
  }
  async _readTasksJson(uri) {
    try {
      const content = await this._fileService.readFile(uri);
      return parse(content.value.toString());
    } catch {
      return {};
    }
  }
  _isSupportedTask(task) {
    return !!task.label;
  }
  _ensureFileWatch(folder) {
    const tasksUri = this._getWorkspaceTasksJsonUri(folder);
    if (!tasksUri) {
      this._watchedResource = void 0;
      this._fileWatcher.clear();
      return;
    }
    if (this._watchedResource && this._watchedResource.toString() === tasksUri.toString()) {
      return;
    }
    this._watchedResource = tasksUri;
    const disposables = new DisposableStore();
    disposables.add(this._fileService.watch(tasksUri));
    const userUri = this._getUserTasksJsonUri();
    if (userUri) {
      disposables.add(this._fileService.watch(userUri));
    }
    disposables.add(this._fileService.onDidFilesChange((e) => {
      if (e.affects(tasksUri) || userUri && e.affects(userUri)) {
        this._refreshSessionTasks(folder);
      }
    }));
    this._fileWatcher.value = disposables;
  }
  async _refreshSessionTasks(folder) {
    if (!folder) {
      transaction((tx) => this._sessionTasks.set([], tx));
      return;
    }
    const tasksUri = this._getWorkspaceTasksJsonUri(folder);
    const tasksJson = tasksUri ? await this._readTasksJson(tasksUri) : {};
    const sessionTasks = (tasksJson.tasks ?? []).filter((t) => t.inAgents && this._isSupportedTask(t)).map((t) => ({ task: t, target: "workspace" }));
    const userUri = this._getUserTasksJsonUri();
    const userJson = userUri ? await this._readTasksJson(userUri) : {};
    const userSessionTasks = (userJson.tasks ?? []).filter((t) => t.inAgents && this._isSupportedTask(t)).map((t) => ({ task: t, target: "user" }));
    transaction((tx) => this._sessionTasks.set([...sessionTasks, ...userSessionTasks], tx));
  }
  _loadPinnedTaskLabels() {
    const raw = this._storageService.get(SessionsTasksService._PINNED_TASK_LABELS_KEY, StorageScope.APPLICATION);
    if (raw) {
      try {
        return new Map(Object.entries(JSON.parse(raw)));
      } catch {
      }
    }
    return /* @__PURE__ */ new Map();
  }
  _savePinnedTaskLabels() {
    this._storageService.store(
      SessionsTasksService._PINNED_TASK_LABELS_KEY,
      JSON.stringify(Object.fromEntries(this._pinnedTaskLabels)),
      StorageScope.APPLICATION,
      StorageTarget.USER
    );
  }
  _setPinnedTaskLabelForKey(key, taskLabel) {
    if (taskLabel === void 0) {
      this._pinnedTaskLabels.delete(key);
    } else {
      this._pinnedTaskLabels.set(key, taskLabel);
    }
    this._savePinnedTaskLabels();
    const obs = this._pinnedTaskObservables.get(key);
    if (obs) {
      transaction((tx) => obs.set(taskLabel, tx));
    }
  }
  _loadBrowserUrls() {
    const raw = this._storageService.get(SessionsTasksService._BROWSER_URLS_KEY, StorageScope.APPLICATION);
    if (raw) {
      try {
        return new Map(Object.entries(JSON.parse(raw)));
      } catch {
      }
    }
    return /* @__PURE__ */ new Map();
  }
  _saveBrowserUrls() {
    this._storageService.store(
      SessionsTasksService._BROWSER_URLS_KEY,
      JSON.stringify(Object.fromEntries(this._browserUrls)),
      StorageScope.APPLICATION,
      StorageTarget.USER
    );
  }
  _loadPinnedBrowsers() {
    const raw = this._storageService.get(SessionsTasksService._PINNED_BROWSERS_KEY, StorageScope.APPLICATION);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          return new Set(arr);
        }
      } catch {
      }
    }
    return /* @__PURE__ */ new Set();
  }
  _savePinnedBrowsers() {
    this._storageService.store(
      SessionsTasksService._PINNED_BROWSERS_KEY,
      JSON.stringify([...this._pinnedBrowsers]),
      StorageScope.APPLICATION,
      StorageTarget.USER
    );
  }
  _setPinnedBrowserForKey(key, pinned) {
    if (pinned) {
      this._pinnedBrowsers.add(key);
    } else {
      this._pinnedBrowsers.delete(key);
    }
    this._savePinnedBrowsers();
    const obs = this._pinnedBrowserObservables.get(key);
    if (obs) {
      transaction((tx) => obs.set(pinned, tx));
    }
  }
};
SessionsTasksService._PINNED_TASK_LABELS_KEY = "agentSessions.pinnedTaskLabels";
SessionsTasksService._BROWSER_URLS_KEY = "agentSessions.browserUrls";
SessionsTasksService._PINNED_BROWSERS_KEY = "agentSessions.pinnedBrowsers";
SessionsTasksService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IJSONEditingService),
  __decorateParam(2, IPreferencesService),
  __decorateParam(3, ISessionTaskRunnerRegistry),
  __decorateParam(4, IStorageService)
], SessionsTasksService);
export {
  ISessionsTasksService,
  SessionsTasksService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3Nlc3Npb25zVGFza3NTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgam9pblBhdGgsIGRpcm5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uYy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJSlNPTkVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2pzb25FZGl0aW5nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvdGFza3MvY29tbW9uL3Rhc2tDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElTZXNzaW9uVGFza1J1bm5lclJlZ2lzdHJ5IH0gZnJvbSAnLi9zZXNzaW9uVGFza1J1bm5lci5qcyc7XG5cbmV4cG9ydCB0eXBlIFRhc2tTdG9yYWdlVGFyZ2V0ID0gJ3VzZXInIHwgJ3dvcmtzcGFjZSc7XG50eXBlIFRhc2tSdW5Pbk9wdGlvbiA9ICdkZWZhdWx0JyB8ICdmb2xkZXJPcGVuJyB8ICd3b3JrdHJlZUNyZWF0ZWQnO1xuXG5pbnRlcmZhY2UgSVRhc2tSdW5PcHRpb25zIHtcblx0cmVhZG9ubHkgcnVuT24/OiBUYXNrUnVuT25PcHRpb247XG59XG5cbi8qKlxuICogU2hhcGUgb2YgYSBzaW5nbGUgdGFzayBlbnRyeSBpbnNpZGUgdGFza3MuanNvbi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGFza0VudHJ5IHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgdGFzaz86IENvbW1hbmRTdHJpbmc7XG5cdHJlYWRvbmx5IHNjcmlwdD86IHN0cmluZztcblx0cmVhZG9ubHkgdHlwZT86IHN0cmluZztcblx0cmVhZG9ubHkgY29tbWFuZD86IHN0cmluZztcblx0cmVhZG9ubHkgYXJncz86IENvbW1hbmRTdHJpbmdbXTtcblx0cmVhZG9ubHkgaW5BZ2VudHM/OiBib29sZWFuO1xuXHRyZWFkb25seSBydW5PcHRpb25zPzogSVRhc2tSdW5PcHRpb25zO1xuXHRyZWFkb25seSB3aW5kb3dzPzogeyBjb21tYW5kPzogc3RyaW5nOyBhcmdzPzogQ29tbWFuZFN0cmluZ1tdIH07XG5cdHJlYWRvbmx5IG9zeD86IHsgY29tbWFuZD86IHN0cmluZzsgYXJncz86IENvbW1hbmRTdHJpbmdbXSB9O1xuXHRyZWFkb25seSBsaW51eD86IHsgY29tbWFuZD86IHN0cmluZzsgYXJncz86IENvbW1hbmRTdHJpbmdbXSB9O1xuXHRyZWFkb25seSBkZXBlbmRzT24/OiBzdHJpbmcgfCByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgZGVwZW5kc09yZGVyPzogJ3NlcXVlbmNlJyB8ICdwYXJhbGxlbCc7XG5cdHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IHVua25vd247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vblNlc3Npb25UYXNrRW50cnkge1xuXHRyZWFkb25seSB0YXNrOiBJVGFza0VudHJ5O1xuXHRyZWFkb25seSB0YXJnZXQ6IFRhc2tTdG9yYWdlVGFyZ2V0O1xufVxuXG4vKipcbiAqIEEgc2Vzc2lvbiB0YXNrIHRvZ2V0aGVyIHdpdGggdGhlIHN0b3JhZ2UgdGFyZ2V0IGl0IHdhcyBsb2FkZWQgZnJvbS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvblRhc2tXaXRoVGFyZ2V0IHtcblx0cmVhZG9ubHkgdGFzazogSVRhc2tFbnRyeTtcblx0cmVhZG9ubHkgdGFyZ2V0OiBUYXNrU3RvcmFnZVRhcmdldDtcbn1cblxuLyoqXG4gKiBQYXlsb2FkIGZpcmVkIGJ5IHtAbGluayBJU2Vzc2lvbnNUYXNrc1NlcnZpY2Uub25EaWRSdW5UYXNrfSBhZnRlciBhXG4gKiBzZXNzaW9uIHRhc2sgaGFzIGJlZW4gc3VjY2Vzc2Z1bGx5IGRpc3BhdGNoZWQgdG8gaXRzIHJ1bm5lci5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvblRhc2tSdW5FdmVudCB7XG5cdHJlYWRvbmx5IHRhc2s6IElUYXNrRW50cnk7XG5cdHJlYWRvbmx5IHNlc3Npb246IElTZXNzaW9uO1xufVxuXG5pbnRlcmZhY2UgSVRhc2tzSnNvbiB7XG5cdHZlcnNpb24/OiBzdHJpbmc7XG5cdHRhc2tzPzogSVRhc2tFbnRyeVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uc1Rhc2tzU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogRmlyZXMgYWZ0ZXIgYSBzZXNzaW9uIHRhc2sgaGFzIGJlZW4gc3VjY2Vzc2Z1bGx5IGRpc3BhdGNoZWQgdG8gaXRzXG5cdCAqIHJ1bm5lciB2aWEge0BsaW5rIHJ1blRhc2t9LiBEb2VzIG5vdCBmaXJlIHdoZW4gdGhlIHRhc2sgdGhyb3dzIG9yIHdoZW5cblx0ICogbm8gcnVubmVyIGlzIHJlZ2lzdGVyZWQgZm9yIHRoZSBzZXNzaW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRSdW5UYXNrOiBFdmVudDxJU2Vzc2lvblRhc2tSdW5FdmVudD47XG5cblx0LyoqXG5cdCAqIE9ic2VydmFibGUgbGlzdCBvZiB0YXNrcyB3aXRoIGBpbkFnZW50czogdHJ1ZWAsIGF1dG9tYXRpY2FsbHlcblx0ICogdXBkYXRlZCB3aGVuIHRoZSB0YXNrcy5qc29uIGZpbGUgY2hhbmdlcy4gRWFjaCBlbnRyeSBpbmNsdWRlcyB0aGVcblx0ICogc3RvcmFnZSB0YXJnZXQgdGhlIHRhc2sgd2FzIGxvYWRlZCBmcm9tLlxuXHQgKlxuXHQgKiAqKk5vdGU6KiogVGhpcyBvYnNlcnZhYmxlIGlzIHNoYXJlZCBhY3Jvc3MgYWxsIHNlc3Npb25zIFx1MjAxNCByZXBlYXRlZFxuXHQgKiBjYWxscyB3aXRoIGRpZmZlcmVudCBzZXNzaW9ucyBvdmVyd3JpdGUgaXQgd2l0aCB0aGUgbW9zdCByZWNlbnRseVxuXHQgKiByZXF1ZXN0ZWQgc2Vzc2lvbidzIHRhc2tzLiBJdCBpcyBpbnRlbmRlZCBmb3IgYSBzaW5nbGUgZm9sbG93ZXJcblx0ICogKGUuZy4gdGhlIHRvb2xiYXIgdHJhY2tpbmcgdGhlIGFjdGl2ZSBzZXNzaW9uKS4gQ29uc3VtZXJzIHRoYXQgbmVlZFxuXHQgKiBhIG9uZS10aW1lIHNuYXBzaG90IGZvciBhIHNwZWNpZmljIHNlc3Npb24gc2hvdWxkIHVzZVxuXHQgKiB7QGxpbmsgZ2V0U2Vzc2lvblRhc2tzT25jZX0gaW5zdGVhZC5cblx0ICovXG5cdGdldFNlc3Npb25UYXNrcyhzZXNzaW9uOiBJU2Vzc2lvbik6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uVGFza1dpdGhUYXJnZXRbXT47XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYSBvbmUtc2hvdCBzbmFwc2hvdCBvZiB0aGUgc2Vzc2lvbiB0YXNrcyAod2l0aCBgaW5BZ2VudHM6IHRydWVgKVxuXHQgKiBmb3IgdGhlIGdpdmVuIHNlc3Npb24sIHJlYWRpbmcgZnJvbSBib3RoIHdvcmtzcGFjZSBhbmQgdXNlciBgdGFza3MuanNvbmAuXG5cdCAqXG5cdCAqIFVubGlrZSB7QGxpbmsgZ2V0U2Vzc2lvblRhc2tzfSwgdGhpcyBtZXRob2QgZG9lcyBOT1QgdG91Y2ggdGhlIHNoYXJlZFxuXHQgKiBgX3Nlc3Npb25UYXNrc2Agb2JzZXJ2YWJsZSwgc28gaXQgaXMgc2FmZSB0byBjYWxsIGNvbmN1cnJlbnRseSBmb3Jcblx0ICogbXVsdGlwbGUgc2Vzc2lvbnMuXG5cdCAqL1xuXHRnZXRTZXNzaW9uVGFza3NPbmNlKHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTxyZWFkb25seSBJU2Vzc2lvblRhc2tXaXRoVGFyZ2V0W10+O1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgb25lLXNob3Qgc25hcHNob3Qgb2YgKiphbGwqKiB0YXNrcyAod2l0aCBvciB3aXRob3V0XG5cdCAqIGBpbkFnZW50c2ApIGRlY2xhcmVkIGZvciB0aGUgZ2l2ZW4gc2Vzc2lvbiwgcmVhZGluZyBmcm9tIGJvdGggd29ya3NwYWNlXG5cdCAqIGFuZCB1c2VyIGB0YXNrcy5qc29uYC4gVXNlZCBieSB0aGUgYWdlbnQtaG9zdCBydW5uZXIgdG8gbG9vayB1cFxuXHQgKiBkZXBlbmRlbmN5IHRhc2tzIHJlZmVyZW5jZWQgdmlhIGBkZXBlbmRzT25gLlxuXHQgKi9cblx0Z2V0QWxsVGFza3Moc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPHJlYWRvbmx5IElTZXNzaW9uVGFza1dpdGhUYXJnZXRbXT47XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGFza3MgdGhhdCBkbyBOT1QgaGF2ZSBgaW5BZ2VudHM6IHRydWVgIFx1MjAxNCB1c2VkIGFzXG5cdCAqIHN1Z2dlc3Rpb25zIGluIHRoZSBcIkFkZCBSdW4gQWN0aW9uXCIgcGlja2VyLlxuXHQgKi9cblx0Z2V0Tm9uU2Vzc2lvblRhc2tzKHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTxyZWFkb25seSBJTm9uU2Vzc2lvblRhc2tFbnRyeVtdPjtcblxuXHQvKipcblx0ICogU2V0cyBgaW5BZ2VudHM6IHRydWVgIG9uIGFuIGV4aXN0aW5nIHRhc2sgKGlkZW50aWZpZWQgYnkgbGFiZWwpLFxuXHQgKiB1cGRhdGluZyBpdCBpbiBwbGFjZSBpbiBpdHMgdGFza3MuanNvbi5cblx0ICovXG5cdGFkZFRhc2tUb1Nlc3Npb25zKHRhc2s6IElUYXNrRW50cnksIHNlc3Npb246IElTZXNzaW9uLCB0YXJnZXQ6IFRhc2tTdG9yYWdlVGFyZ2V0LCBvcHRpb25zPzogSVRhc2tSdW5PcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyBzaGVsbCB0YXNrIHdpdGggYGluQWdlbnRzOiB0cnVlYCBhbmQgd3JpdGVzIGl0IHRvXG5cdCAqIHRoZSBhcHByb3ByaWF0ZSB0YXNrcy5qc29uICh1c2VyIG9yIHdvcmtzcGFjZSkuXG5cdCAqL1xuXHRjcmVhdGVBbmRBZGRUYXNrKGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNvbW1hbmQ6IHN0cmluZywgc2Vzc2lvbjogSVNlc3Npb24sIHRhcmdldDogVGFza1N0b3JhZ2VUYXJnZXQsIG9wdGlvbnM/OiBJVGFza1J1bk9wdGlvbnMpOiBQcm9taXNlPElUYXNrRW50cnkgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIGFuIGV4aXN0aW5nIHRhc2sgZW50cnksIG9wdGlvbmFsbHkgbW92aW5nIGl0IGJldHdlZW4gdXNlciBhbmRcblx0ICogd29ya3NwYWNlIHN0b3JhZ2UuXG5cdCAqL1xuXHR1cGRhdGVUYXNrKG9yaWdpbmFsVGFza0xhYmVsOiBzdHJpbmcsIHVwZGF0ZWRUYXNrOiBJVGFza0VudHJ5LCBzZXNzaW9uOiBJU2Vzc2lvbiwgY3VycmVudFRhcmdldDogVGFza1N0b3JhZ2VUYXJnZXQsIG5ld1RhcmdldDogVGFza1N0b3JhZ2VUYXJnZXQpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBSZW1vdmVzIGFuIGV4aXN0aW5nIHRhc2sgZW50cnkgZnJvbSBpdHMgdGFza3MuanNvbi5cblx0ICovXG5cdHJlbW92ZVRhc2sodGFza0xhYmVsOiBzdHJpbmcsIHNlc3Npb246IElTZXNzaW9uLCB0YXJnZXQ6IFRhc2tTdG9yYWdlVGFyZ2V0KTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogUnVucyBhIHRhc2sgdmlhIHRoZSB0YXNrIHNlcnZpY2UsIGxvb2tpbmcgaXQgdXAgYnkgbGFiZWwgaW4gdGhlXG5cdCAqIHdvcmtzcGFjZSBmb2xkZXIgY29ycmVzcG9uZGluZyB0byB0aGUgc2Vzc2lvbiB3b3JrdHJlZS5cblx0ICpcblx0ICogTWF5IHJlc29sdmUgdG8gYW4ge0BsaW5rIElEaXNwb3NhYmxlfSB0aGF0IHN0b3BzIHRoZSBsYXVuY2hlZCB0YXNrOyBzZWVcblx0ICoge0BsaW5rIElTZXNzaW9uVGFza1J1bm5lci5ydW5UYXNrfS5cblx0ICovXG5cdHJ1blRhc2sodGFzazogSVRhc2tFbnRyeSwgc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkPjtcblxuXHQvKipcblx0ICogT2JzZXJ2YWJsZSBsYWJlbCBvZiB0aGUgcGlubmVkIHRhc2sgZm9yIHRoZSBnaXZlbiByZXBvc2l0b3J5LlxuXHQgKi9cblx0Z2V0UGlubmVkVGFza0xhYmVsKHJlcG9zaXRvcnk6IFVSSSB8IHVuZGVmaW5lZCk6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIFNldHMgb3IgY2xlYXJzIHRoZSBwaW5uZWQgdGFzayBmb3IgdGhlIGdpdmVuIHJlcG9zaXRvcnkuXG5cdCAqL1xuXHRzZXRQaW5uZWRUYXNrTGFiZWwocmVwb3NpdG9yeTogVVJJIHwgdW5kZWZpbmVkLCB0YXNrTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIE9ic2VydmFibGUgVVJMIGNvbmZpZ3VyZWQgZm9yIHRoZSBpbnRlZ3JhdGVkIGJyb3dzZXIgYWN0aW9uIGZvciB0aGUgZ2l2ZW4gcmVwb3NpdG9yeS5cblx0ICovXG5cdGdldEJyb3dzZXJVcmwocmVwb3NpdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblxuXHQvKipcblx0ICogU2V0cyBvciBjbGVhcnMgdGhlIGNvbmZpZ3VyZWQgYnJvd3NlciBVUkwgZm9yIHRoZSBnaXZlbiByZXBvc2l0b3J5LlxuXHQgKi9cblx0c2V0QnJvd3NlclVybChyZXBvc2l0b3J5OiBVUkkgfCB1bmRlZmluZWQsIHVybDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZDtcblxuXHQvKipcblx0ICogT2JzZXJ2YWJsZSBpbmRpY2F0aW5nIHdoZXRoZXIgdGhlIGludGVncmF0ZWQgYnJvd3NlciBhY3Rpb24gaXMgcGlubmVkIGFzIHRoZSBwcmltYXJ5IGFjdGlvbiBmb3IgdGhlIGdpdmVuIHJlcG9zaXRvcnkuXG5cdCAqL1xuXHRnZXRQaW5uZWRCcm93c2VyKHJlcG9zaXRvcnk6IFVSSSB8IHVuZGVmaW5lZCk6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdC8qKlxuXHQgKiBTZXRzIG9yIGNsZWFycyB3aGV0aGVyIHRoZSBpbnRlZ3JhdGVkIGJyb3dzZXIgYWN0aW9uIGlzIHBpbm5lZCBhcyB0aGUgcHJpbWFyeSBhY3Rpb24gZm9yIHRoZSBnaXZlbiByZXBvc2l0b3J5LlxuXHQgKiBQaW5uaW5nIHRoZSBicm93c2VyIGNsZWFycyBhbnkgcGlubmVkIHRhc2s7IHBpbm5pbmcgYSB0YXNrIGNsZWFycyB0aGUgcGlubmVkIGJyb3dzZXIuXG5cdCAqL1xuXHRzZXRQaW5uZWRCcm93c2VyKHJlcG9zaXRvcnk6IFVSSSB8IHVuZGVmaW5lZCwgcGlubmVkOiBib29sZWFuKTogdm9pZDtcbn1cblxuZXhwb3J0IGNvbnN0IElTZXNzaW9uc1Rhc2tzU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJU2Vzc2lvbnNUYXNrc1NlcnZpY2U+KCdzZXNzaW9uc1Rhc2tzU2VydmljZScpO1xuXG5leHBvcnQgY2xhc3MgU2Vzc2lvbnNUYXNrc1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNlc3Npb25zVGFza3NTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfUElOTkVEX1RBU0tfTEFCRUxTX0tFWSA9ICdhZ2VudFNlc3Npb25zLnBpbm5lZFRhc2tMYWJlbHMnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQlJPV1NFUl9VUkxTX0tFWSA9ICdhZ2VudFNlc3Npb25zLmJyb3dzZXJVcmxzJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX1BJTk5FRF9CUk9XU0VSU19LRVkgPSAnYWdlbnRTZXNzaW9ucy5waW5uZWRCcm93c2Vycyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSdW5UYXNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlc3Npb25UYXNrUnVuRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJ1blRhc2sgPSB0aGlzLl9vbkRpZFJ1blRhc2suZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblRhc2tzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElTZXNzaW9uVGFza1dpdGhUYXJnZXRbXT4odGhpcywgW10pO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maWxlV2F0Y2hlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGlubmVkVGFza0xhYmVsczogTWFwPHN0cmluZywgc3RyaW5nPjtcblx0cHJpdmF0ZSByZWFkb25seSBfcGlubmVkVGFza09ic2VydmFibGVzID0gbmV3IE1hcDxzdHJpbmcsIFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+Pj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYnJvd3NlclVybHM6IE1hcDxzdHJpbmcsIHN0cmluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Jyb3dzZXJVcmxPYnNlcnZhYmxlcyA9IG5ldyBNYXA8c3RyaW5nLCBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPj4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Bpbm5lZEJyb3dzZXJzOiBTZXQ8c3RyaW5nPjtcblx0cHJpdmF0ZSByZWFkb25seSBfcGlubmVkQnJvd3Nlck9ic2VydmFibGVzID0gbmV3IE1hcDxzdHJpbmcsIFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxib29sZWFuPj4+KCk7XG5cblx0cHJpdmF0ZSBfd2F0Y2hlZFJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RSZWZyZXNoZWRGb2xkZXI6IFVSSSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElKU09ORWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfanNvbkVkaXRpbmdTZXJ2aWNlOiBJSlNPTkVkaXRpbmdTZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3ByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASVNlc3Npb25UYXNrUnVubmVyUmVnaXN0cnkgcHJpdmF0ZSByZWFkb25seSBfdGFza1J1bm5lclJlZ2lzdHJ5OiBJU2Vzc2lvblRhc2tSdW5uZXJSZWdpc3RyeSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcGlubmVkVGFza0xhYmVscyA9IHRoaXMuX2xvYWRQaW5uZWRUYXNrTGFiZWxzKCk7XG5cdFx0dGhpcy5fYnJvd3NlclVybHMgPSB0aGlzLl9sb2FkQnJvd3NlclVybHMoKTtcblx0XHR0aGlzLl9waW5uZWRCcm93c2VycyA9IHRoaXMuX2xvYWRQaW5uZWRCcm93c2VycygpO1xuXHR9XG5cblx0Z2V0U2Vzc2lvblRhc2tzKHNlc3Npb246IElTZXNzaW9uKTogSU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25UYXNrV2l0aFRhcmdldFtdPiB7XG5cdFx0Y29uc3QgZm9sZGVyID0gdGhpcy5fZ2V0U2Vzc2lvbkZvbGRlcihzZXNzaW9uKTtcblx0XHR0aGlzLl9lbnN1cmVGaWxlV2F0Y2goZm9sZGVyKTtcblx0XHQvLyBUcmlnZ2VyIGluaXRpYWwgcmVhZCBvbmx5IHdoZW4gdGhlIGZvbGRlciBjaGFuZ2VzOyB0aGUgZmlsZSB3YXRjaGVyIGhhbmRsZXMgc3Vic2VxdWVudCB1cGRhdGVzXG5cdFx0aWYgKCFpc0VxdWFsKHRoaXMuX2xhc3RSZWZyZXNoZWRGb2xkZXIsIGZvbGRlcikpIHtcblx0XHRcdHRoaXMuX2xhc3RSZWZyZXNoZWRGb2xkZXIgPSBmb2xkZXI7XG5cdFx0XHR0aGlzLl9yZWZyZXNoU2Vzc2lvblRhc2tzKGZvbGRlcik7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uVGFza3M7XG5cdH1cblxuXHRhc3luYyBnZXRTZXNzaW9uVGFza3NPbmNlKHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTxyZWFkb25seSBJU2Vzc2lvblRhc2tXaXRoVGFyZ2V0W10+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVhZFRhc2tzRnJvbUJvdGhUYXJnZXRzKHNlc3Npb24sIHQgPT4gISF0LmluQWdlbnRzKTtcblx0fVxuXG5cdGFzeW5jIGdldEFsbFRhc2tzKHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTxyZWFkb25seSBJU2Vzc2lvblRhc2tXaXRoVGFyZ2V0W10+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVhZFRhc2tzRnJvbUJvdGhUYXJnZXRzKHNlc3Npb24sICgpID0+IHRydWUpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Tm9uU2Vzc2lvblRhc2tzKHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTxyZWFkb25seSBJTm9uU2Vzc2lvblRhc2tFbnRyeVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlYWRUYXNrc0Zyb21Cb3RoVGFyZ2V0cyhzZXNzaW9uLCB0ID0+ICF0LmluQWdlbnRzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyB0YXNrcyBmcm9tIGJvdGggd29ya3NwYWNlIGFuZCB1c2VyIGB0YXNrcy5qc29uYCBmb3IgYSBzZXNzaW9uLFxuXHQgKiBmaWx0ZXJpbmcgZWFjaCBlbnRyeSB0aHJvdWdoIGBwcmVkaWNhdGVgIChpbiBhZGRpdGlvbiB0byB0aGUgc3VwcG9ydGVkLXR5cGVcblx0ICogY2hlY2spIGFuZCB0YWdnaW5nIGl0IHdpdGggaXRzIHN0b3JhZ2UgdGFyZ2V0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVhZFRhc2tzRnJvbUJvdGhUYXJnZXRzKHNlc3Npb246IElTZXNzaW9uLCBwcmVkaWNhdGU6ICh0YXNrOiBJVGFza0VudHJ5KSA9PiBib29sZWFuKTogUHJvbWlzZTxJU2Vzc2lvblRhc2tXaXRoVGFyZ2V0W10+IHtcblx0XHRjb25zdCByZXN1bHQ6IElTZXNzaW9uVGFza1dpdGhUYXJnZXRbXSA9IFtdO1xuXHRcdGNvbnN0IHRhcmdldHM6IFRhc2tTdG9yYWdlVGFyZ2V0W10gPSBbJ3dvcmtzcGFjZScsICd1c2VyJ107XG5cdFx0Zm9yIChjb25zdCB0YXJnZXQgb2YgdGFyZ2V0cykge1xuXHRcdFx0Y29uc3QgdXJpID0gdGhpcy5fZ2V0VGFza3NKc29uVXJpKHNlc3Npb24sIHRhcmdldCk7XG5cdFx0XHRpZiAoIXVyaSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGpzb24gPSBhd2FpdCB0aGlzLl9yZWFkVGFza3NKc29uKHVyaSk7XG5cdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YganNvbi50YXNrcyA/PyBbXSkge1xuXHRcdFx0XHRpZiAocHJlZGljYXRlKHRhc2spICYmIHRoaXMuX2lzU3VwcG9ydGVkVGFzayh0YXNrKSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHsgdGFzaywgdGFyZ2V0IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBhZGRUYXNrVG9TZXNzaW9ucyh0YXNrOiBJVGFza0VudHJ5LCBzZXNzaW9uOiBJU2Vzc2lvbiwgdGFyZ2V0OiBUYXNrU3RvcmFnZVRhcmdldCwgb3B0aW9ucz86IElUYXNrUnVuT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRhc2tzSnNvblVyaSA9IHRoaXMuX2dldFRhc2tzSnNvblVyaShzZXNzaW9uLCB0YXJnZXQpO1xuXHRcdGlmICghdGFza3NKc29uVXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFza3NKc29uID0gYXdhaXQgdGhpcy5fcmVhZFRhc2tzSnNvbih0YXNrc0pzb25VcmkpO1xuXHRcdGNvbnN0IHRhc2tzID0gdGFza3NKc29uLnRhc2tzID8/IFtdO1xuXHRcdGNvbnN0IGluZGV4ID0gdGFza3MuZmluZEluZGV4KHQgPT4gdC5sYWJlbCA9PT0gdGFzay5sYWJlbCk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRzOiB7IHBhdGg6IChzdHJpbmcgfCBudW1iZXIpW107IHZhbHVlOiB1bmtub3duIH1bXSA9IFtcblx0XHRcdHsgcGF0aDogWyd0YXNrcycsIGluZGV4LCAnaW5BZ2VudHMnXSwgdmFsdWU6IHRydWUgfSxcblx0XHRdO1xuXG5cdFx0aWYgKG9wdGlvbnMpIHtcblx0XHRcdGVkaXRzLnB1c2goe1xuXHRcdFx0XHRwYXRoOiBbJ3Rhc2tzJywgaW5kZXgsICdydW5PcHRpb25zJ10sXG5cdFx0XHRcdHZhbHVlOiBvcHRpb25zLnJ1bk9uICYmIG9wdGlvbnMucnVuT24gIT09ICdkZWZhdWx0JyA/IHsgcnVuT246IG9wdGlvbnMucnVuT24gfSA6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX2pzb25FZGl0aW5nU2VydmljZS53cml0ZSh0YXNrc0pzb25VcmksIGVkaXRzLCB0cnVlKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZUFuZEFkZFRhc2sobGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgY29tbWFuZDogc3RyaW5nLCBzZXNzaW9uOiBJU2Vzc2lvbiwgdGFyZ2V0OiBUYXNrU3RvcmFnZVRhcmdldCwgb3B0aW9ucz86IElUYXNrUnVuT3B0aW9ucyk6IFByb21pc2U8SVRhc2tFbnRyeSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRhc2tzSnNvblVyaSA9IHRoaXMuX2dldFRhc2tzSnNvblVyaShzZXNzaW9uLCB0YXJnZXQpO1xuXHRcdGlmICghdGFza3NKc29uVXJpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhc2tzSnNvbiA9IGF3YWl0IHRoaXMuX3JlYWRUYXNrc0pzb24odGFza3NKc29uVXJpKTtcblx0XHRjb25zdCB0YXNrcyA9IHRhc2tzSnNvbi50YXNrcyA/PyBbXTtcblx0XHRjb25zdCByZXNvbHZlZExhYmVsID0gbGFiZWw/LnRyaW0oKSB8fCBjb21tYW5kO1xuXHRcdGNvbnN0IG5ld1Rhc2s6IElUYXNrRW50cnkgPSB7XG5cdFx0XHRsYWJlbDogcmVzb2x2ZWRMYWJlbCxcblx0XHRcdHR5cGU6ICdzaGVsbCcsXG5cdFx0XHRjb21tYW5kLFxuXHRcdFx0aW5BZ2VudHM6IHRydWUsXG5cdFx0XHQuLi4ob3B0aW9ucz8ucnVuT24gJiYgb3B0aW9ucy5ydW5PbiAhPT0gJ2RlZmF1bHQnID8geyBydW5PcHRpb25zOiB7IHJ1bk9uOiBvcHRpb25zLnJ1bk9uIH0gfSA6IHt9KSxcblx0XHR9O1xuXG5cdFx0YXdhaXQgdGhpcy5fanNvbkVkaXRpbmdTZXJ2aWNlLndyaXRlKHRhc2tzSnNvblVyaSwgW1xuXHRcdFx0eyBwYXRoOiBbJ3ZlcnNpb24nXSwgdmFsdWU6IHRhc2tzSnNvbi52ZXJzaW9uID8/ICcyLjAuMCcgfSxcblx0XHRcdHsgcGF0aDogWyd0YXNrcyddLCB2YWx1ZTogWy4uLnRhc2tzLCBuZXdUYXNrXSB9XG5cdFx0XSwgdHJ1ZSk7XG5cblx0XHRyZXR1cm4gbmV3VGFzaztcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVRhc2sob3JpZ2luYWxUYXNrTGFiZWw6IHN0cmluZywgdXBkYXRlZFRhc2s6IElUYXNrRW50cnksIHNlc3Npb246IElTZXNzaW9uLCBjdXJyZW50VGFyZ2V0OiBUYXNrU3RvcmFnZVRhcmdldCwgbmV3VGFyZ2V0OiBUYXNrU3RvcmFnZVRhcmdldCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN1cnJlbnRUYXNrc0pzb25VcmkgPSB0aGlzLl9nZXRUYXNrc0pzb25Vcmkoc2Vzc2lvbiwgY3VycmVudFRhcmdldCk7XG5cdFx0Y29uc3QgbmV3VGFza3NKc29uVXJpID0gdGhpcy5fZ2V0VGFza3NKc29uVXJpKHNlc3Npb24sIG5ld1RhcmdldCk7XG5cdFx0aWYgKCFjdXJyZW50VGFza3NKc29uVXJpIHx8ICFuZXdUYXNrc0pzb25VcmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50VGFza3NKc29uID0gYXdhaXQgdGhpcy5fcmVhZFRhc2tzSnNvbihjdXJyZW50VGFza3NKc29uVXJpKTtcblx0XHRjb25zdCBjdXJyZW50VGFza3MgPSBjdXJyZW50VGFza3NKc29uLnRhc2tzID8/IFtdO1xuXHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IGN1cnJlbnRUYXNrcy5maW5kSW5kZXgodGFzayA9PiB0YXNrLmxhYmVsID09PSBvcmlnaW5hbFRhc2tMYWJlbCk7XG5cdFx0aWYgKGN1cnJlbnRJbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoY3VycmVudFRhc2tzSnNvblVyaS50b1N0cmluZygpID09PSBuZXdUYXNrc0pzb25VcmkudG9TdHJpbmcoKSkge1xuXHRcdFx0Y29uc3QgdXBkYXRlZFRhc2tzID0gY3VycmVudFRhc2tzLm1hcCgodGFzaywgaSkgPT4gaSA9PT0gY3VycmVudEluZGV4ID8gdXBkYXRlZFRhc2sgOiB0YXNrKTtcblx0XHRcdGF3YWl0IHRoaXMuX2pzb25FZGl0aW5nU2VydmljZS53cml0ZShjdXJyZW50VGFza3NKc29uVXJpLCBbXG5cdFx0XHRcdHsgcGF0aDogWyd0YXNrcyddLCB2YWx1ZTogdXBkYXRlZFRhc2tzIH0sXG5cdFx0XHRdLCB0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbmV3VGFza3NKc29uID0gYXdhaXQgdGhpcy5fcmVhZFRhc2tzSnNvbihuZXdUYXNrc0pzb25VcmkpO1xuXHRcdFx0Y29uc3QgbmV3VGFza3MgPSBuZXdUYXNrc0pzb24udGFza3MgPz8gW107XG5cblx0XHRcdGF3YWl0IHRoaXMuX2pzb25FZGl0aW5nU2VydmljZS53cml0ZShjdXJyZW50VGFza3NKc29uVXJpLCBbXG5cdFx0XHRcdHsgcGF0aDogWyd0YXNrcyddLCB2YWx1ZTogY3VycmVudFRhc2tzLmZpbHRlcigoXywgdGFza0luZGV4KSA9PiB0YXNrSW5kZXggIT09IGN1cnJlbnRJbmRleCkgfSxcblx0XHRcdF0sIHRydWUpO1xuXG5cdFx0XHRhd2FpdCB0aGlzLl9qc29uRWRpdGluZ1NlcnZpY2Uud3JpdGUobmV3VGFza3NKc29uVXJpLCBbXG5cdFx0XHRcdHsgcGF0aDogWyd2ZXJzaW9uJ10sIHZhbHVlOiBuZXdUYXNrc0pzb24udmVyc2lvbiA/PyAnMi4wLjAnIH0sXG5cdFx0XHRcdHsgcGF0aDogWyd0YXNrcyddLCB2YWx1ZTogWy4uLm5ld1Rhc2tzLCB1cGRhdGVkVGFza10gfSxcblx0XHRcdF0sIHRydWUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcG9VcmkgPSB0aGlzLl9nZXRTZXNzaW9uUmVwbyhzZXNzaW9uKT8ucm9vdDtcblx0XHRpZiAocmVwb1VyaSkge1xuXHRcdFx0Y29uc3Qga2V5ID0gcmVwb1VyaS50b1N0cmluZygpO1xuXHRcdFx0aWYgKHRoaXMuX3Bpbm5lZFRhc2tMYWJlbHMuZ2V0KGtleSkgPT09IG9yaWdpbmFsVGFza0xhYmVsKSB7XG5cdFx0XHRcdHRoaXMuX3NldFBpbm5lZFRhc2tMYWJlbEZvcktleShrZXksIHVwZGF0ZWRUYXNrLmxhYmVsKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyByZW1vdmVUYXNrKHRhc2tMYWJlbDogc3RyaW5nLCBzZXNzaW9uOiBJU2Vzc2lvbiwgdGFyZ2V0OiBUYXNrU3RvcmFnZVRhcmdldCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRhc2tzSnNvblVyaSA9IHRoaXMuX2dldFRhc2tzSnNvblVyaShzZXNzaW9uLCB0YXJnZXQpO1xuXHRcdGlmICghdGFza3NKc29uVXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFza3NKc29uID0gYXdhaXQgdGhpcy5fcmVhZFRhc2tzSnNvbih0YXNrc0pzb25VcmkpO1xuXHRcdGNvbnN0IHRhc2tzID0gdGFza3NKc29uLnRhc2tzID8/IFtdO1xuXHRcdGNvbnN0IGluZGV4ID0gdGFza3MuZmluZEluZGV4KHQgPT4gdC5sYWJlbCA9PT0gdGFza0xhYmVsKTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fanNvbkVkaXRpbmdTZXJ2aWNlLndyaXRlKHRhc2tzSnNvblVyaSwgW1xuXHRcdFx0eyBwYXRoOiBbJ3Rhc2tzJ10sIHZhbHVlOiB0YXNrcy5maWx0ZXIoKF8sIHRhc2tJbmRleCkgPT4gdGFza0luZGV4ICE9PSBpbmRleCkgfSxcblx0XHRdLCB0cnVlKTtcblxuXHRcdGNvbnN0IHJlcG9VcmkgPSB0aGlzLl9nZXRTZXNzaW9uUmVwbyhzZXNzaW9uKT8ucm9vdDtcblx0XHRpZiAocmVwb1VyaSkge1xuXHRcdFx0Y29uc3Qga2V5ID0gcmVwb1VyaS50b1N0cmluZygpO1xuXHRcdFx0aWYgKHRoaXMuX3Bpbm5lZFRhc2tMYWJlbHMuZ2V0KGtleSkgPT09IHRhc2tMYWJlbCkge1xuXHRcdFx0XHR0aGlzLl9zZXRQaW5uZWRUYXNrTGFiZWxGb3JLZXkoa2V5LCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJ1blRhc2sodGFzazogSVRhc2tFbnRyeSwgc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcnVubmVyID0gdGhpcy5fdGFza1J1bm5lclJlZ2lzdHJ5LmdldFJ1bm5lcihzZXNzaW9uKTtcblx0XHRpZiAoIXJ1bm5lcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgcnVubmVyLnJ1blRhc2sodGFzaywgc2Vzc2lvbik7XG5cdFx0dGhpcy5fb25EaWRSdW5UYXNrLmZpcmUoeyB0YXNrLCBzZXNzaW9uIH0pO1xuXHRcdHJldHVybiBoYW5kbGU7XG5cdH1cblxuXHRnZXRQaW5uZWRUYXNrTGFiZWwocmVwb3NpdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm4gb2JzZXJ2YWJsZVZhbHVlKCdwaW5uZWRUYXNrTGFiZWwnLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtleSA9IHJlcG9zaXRvcnkudG9TdHJpbmcoKTtcblx0XHRsZXQgb2JzID0gdGhpcy5fcGlubmVkVGFza09ic2VydmFibGVzLmdldChrZXkpO1xuXHRcdGlmICghb2JzKSB7XG5cdFx0XHRvYnMgPSBvYnNlcnZhYmxlVmFsdWUoJ3Bpbm5lZFRhc2tMYWJlbCcsIHRoaXMuX3Bpbm5lZFRhc2tMYWJlbHMuZ2V0KGtleSkpO1xuXHRcdFx0dGhpcy5fcGlubmVkVGFza09ic2VydmFibGVzLnNldChrZXksIG9icyk7XG5cdFx0fVxuXHRcdHJldHVybiBvYnM7XG5cdH1cblxuXHRzZXRQaW5uZWRUYXNrTGFiZWwocmVwb3NpdG9yeTogVVJJIHwgdW5kZWZpbmVkLCB0YXNrTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtleSA9IHJlcG9zaXRvcnkudG9TdHJpbmcoKTtcblx0XHR0aGlzLl9zZXRQaW5uZWRUYXNrTGFiZWxGb3JLZXkoa2V5LCB0YXNrTGFiZWwpO1xuXHRcdGlmICh0YXNrTGFiZWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fc2V0UGlubmVkQnJvd3NlckZvcktleShrZXksIGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRnZXRCcm93c2VyVXJsKHJlcG9zaXRvcnk6IFVSSSB8IHVuZGVmaW5lZCk6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuIG9ic2VydmFibGVWYWx1ZSgnYnJvd3NlclVybCcsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5ID0gcmVwb3NpdG9yeS50b1N0cmluZygpO1xuXHRcdGxldCBvYnMgPSB0aGlzLl9icm93c2VyVXJsT2JzZXJ2YWJsZXMuZ2V0KGtleSk7XG5cdFx0aWYgKCFvYnMpIHtcblx0XHRcdG9icyA9IG9ic2VydmFibGVWYWx1ZSgnYnJvd3NlclVybCcsIHRoaXMuX2Jyb3dzZXJVcmxzLmdldChrZXkpKTtcblx0XHRcdHRoaXMuX2Jyb3dzZXJVcmxPYnNlcnZhYmxlcy5zZXQoa2V5LCBvYnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gb2JzO1xuXHR9XG5cblx0c2V0QnJvd3NlclVybChyZXBvc2l0b3J5OiBVUkkgfCB1bmRlZmluZWQsIHVybDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5ID0gcmVwb3NpdG9yeS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHRyaW1tZWQgPSB1cmw/LnRyaW0oKTtcblx0XHRpZiAoIXRyaW1tZWQpIHtcblx0XHRcdHRoaXMuX2Jyb3dzZXJVcmxzLmRlbGV0ZShrZXkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9icm93c2VyVXJscy5zZXQoa2V5LCB0cmltbWVkKTtcblx0XHR9XG5cblx0XHR0aGlzLl9zYXZlQnJvd3NlclVybHMoKTtcblxuXHRcdGNvbnN0IG9icyA9IHRoaXMuX2Jyb3dzZXJVcmxPYnNlcnZhYmxlcy5nZXQoa2V5KTtcblx0XHRpZiAob2JzKSB7XG5cdFx0XHR0cmFuc2FjdGlvbih0eCA9PiBvYnMuc2V0KHRyaW1tZWQgfHwgdW5kZWZpbmVkLCB0eCkpO1xuXHRcdH1cblx0fVxuXG5cdGdldFBpbm5lZEJyb3dzZXIocmVwb3NpdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogSU9ic2VydmFibGU8Ym9vbGVhbj4ge1xuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuIG9ic2VydmFibGVWYWx1ZSgncGlubmVkQnJvd3NlcicsIGZhbHNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBrZXkgPSByZXBvc2l0b3J5LnRvU3RyaW5nKCk7XG5cdFx0bGV0IG9icyA9IHRoaXMuX3Bpbm5lZEJyb3dzZXJPYnNlcnZhYmxlcy5nZXQoa2V5KTtcblx0XHRpZiAoIW9icykge1xuXHRcdFx0b2JzID0gb2JzZXJ2YWJsZVZhbHVlKCdwaW5uZWRCcm93c2VyJywgdGhpcy5fcGlubmVkQnJvd3NlcnMuaGFzKGtleSkpO1xuXHRcdFx0dGhpcy5fcGlubmVkQnJvd3Nlck9ic2VydmFibGVzLnNldChrZXksIG9icyk7XG5cdFx0fVxuXHRcdHJldHVybiBvYnM7XG5cdH1cblxuXHRzZXRQaW5uZWRCcm93c2VyKHJlcG9zaXRvcnk6IFVSSSB8IHVuZGVmaW5lZCwgcGlubmVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5ID0gcmVwb3NpdG9yeS50b1N0cmluZygpO1xuXHRcdHRoaXMuX3NldFBpbm5lZEJyb3dzZXJGb3JLZXkoa2V5LCBwaW5uZWQpO1xuXHRcdGlmIChwaW5uZWQpIHtcblx0XHRcdHRoaXMuX3NldFBpbm5lZFRhc2tMYWJlbEZvcktleShrZXksIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIHByaXZhdGUgaGVscGVycyAtLS1cblxuXHRwcml2YXRlIF9nZXRTZXNzaW9uUmVwbyhzZXNzaW9uOiBJU2Vzc2lvbikge1xuXHRcdHJldHVybiBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKT8uZm9sZGVyc1swXTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNlc3Npb25Gb2xkZXIoc2Vzc2lvbjogSVNlc3Npb24pOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlcG8gPSB0aGlzLl9nZXRTZXNzaW9uUmVwbyhzZXNzaW9uKTtcblx0XHRyZXR1cm4gcmVwbz8ud29ya2luZ0RpcmVjdG9yeSA/PyByZXBvPy5yb290O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGFza3NKc29uVXJpKHNlc3Npb246IElTZXNzaW9uLCB0YXJnZXQ6IFRhc2tTdG9yYWdlVGFyZ2V0KTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGFyZ2V0ID09PSAnd29ya3NwYWNlJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldFdvcmtzcGFjZVRhc2tzSnNvblVyaSh0aGlzLl9nZXRTZXNzaW9uRm9sZGVyKHNlc3Npb24pKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2dldFVzZXJUYXNrc0pzb25VcmkoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFdvcmtzcGFjZVRhc2tzSnNvblVyaShmb2xkZXI6IFVSSSB8IHVuZGVmaW5lZCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGZvbGRlcj8ucGF0aCA/IGpvaW5QYXRoKGZvbGRlciwgJy52c2NvZGUnLCAndGFza3MuanNvbicpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VXNlclRhc2tzSnNvblVyaSgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHVzZXJTZXR0aW5nc1Jlc291cmNlID0gdGhpcy5fcHJlZmVyZW5jZXNTZXJ2aWNlLnVzZXJTZXR0aW5nc1Jlc291cmNlO1xuXHRcdGlmICghdXNlclNldHRpbmdzUmVzb3VyY2UucGF0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB1c2VyU2V0dGluZ3NGb2xkZXIgPSBkaXJuYW1lKHVzZXJTZXR0aW5nc1Jlc291cmNlKTtcblx0XHRyZXR1cm4gdXNlclNldHRpbmdzRm9sZGVyLnBhdGggPyBqb2luUGF0aCh1c2VyU2V0dGluZ3NGb2xkZXIsICd0YXNrcy5qc29uJykgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkVGFza3NKc29uKHVyaTogVVJJKTogUHJvbWlzZTxJVGFza3NKc29uPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZSh1cmkpO1xuXHRcdFx0cmV0dXJuIHBhcnNlPElUYXNrc0pzb24+KGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaXNTdXBwb3J0ZWRUYXNrKHRhc2s6IElUYXNrRW50cnkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0YXNrLmxhYmVsO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlRmlsZVdhdGNoKGZvbGRlcjogVVJJIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFza3NVcmkgPSB0aGlzLl9nZXRXb3Jrc3BhY2VUYXNrc0pzb25VcmkoZm9sZGVyKTtcblx0XHRpZiAoIXRhc2tzVXJpKSB7XG5cdFx0XHR0aGlzLl93YXRjaGVkUmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9maWxlV2F0Y2hlci5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl93YXRjaGVkUmVzb3VyY2UgJiYgdGhpcy5fd2F0Y2hlZFJlc291cmNlLnRvU3RyaW5nKCkgPT09IHRhc2tzVXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fd2F0Y2hlZFJlc291cmNlID0gdGFza3NVcmk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIFdhdGNoIHdvcmtzcGFjZSB0YXNrcy5qc29uXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2ZpbGVTZXJ2aWNlLndhdGNoKHRhc2tzVXJpKSk7XG5cblx0XHQvLyBBbHNvIHdhdGNoIHVzZXItbGV2ZWwgdGFza3MuanNvbiBzbyB0aGF0IHVzZXIgc2Vzc2lvbiB0YXNrcyBjaGFuZ2VzIHJlZnJlc2ggdGhlIG9ic2VydmFibGVcblx0XHRjb25zdCB1c2VyVXJpID0gdGhpcy5fZ2V0VXNlclRhc2tzSnNvblVyaSgpO1xuXHRcdGlmICh1c2VyVXJpKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fZmlsZVNlcnZpY2Uud2F0Y2godXNlclVyaSkpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0cyh0YXNrc1VyaSkgfHwgKHVzZXJVcmkgJiYgZS5hZmZlY3RzKHVzZXJVcmkpKSkge1xuXHRcdFx0XHR0aGlzLl9yZWZyZXNoU2Vzc2lvblRhc2tzKGZvbGRlcik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZmlsZVdhdGNoZXIudmFsdWUgPSBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlZnJlc2hTZXNzaW9uVGFza3MoZm9sZGVyOiBVUkkgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWZvbGRlcikge1xuXHRcdFx0dHJhbnNhY3Rpb24odHggPT4gdGhpcy5fc2Vzc2lvblRhc2tzLnNldChbXSwgdHgpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0YXNrc1VyaSA9IHRoaXMuX2dldFdvcmtzcGFjZVRhc2tzSnNvblVyaShmb2xkZXIpO1xuXHRcdGNvbnN0IHRhc2tzSnNvbiA9IHRhc2tzVXJpID8gYXdhaXQgdGhpcy5fcmVhZFRhc2tzSnNvbih0YXNrc1VyaSkgOiB7fTtcblx0XHRjb25zdCBzZXNzaW9uVGFza3M6IElTZXNzaW9uVGFza1dpdGhUYXJnZXRbXSA9ICh0YXNrc0pzb24udGFza3MgPz8gW10pXG5cdFx0XHQuZmlsdGVyKHQgPT4gdC5pbkFnZW50cyAmJiB0aGlzLl9pc1N1cHBvcnRlZFRhc2sodCkpXG5cdFx0XHQubWFwKHQgPT4gKHsgdGFzazogdCwgdGFyZ2V0OiAnd29ya3NwYWNlJyBhcyBUYXNrU3RvcmFnZVRhcmdldCB9KSk7XG5cblx0XHQvLyBBbHNvIGluY2x1ZGUgdXNlci1sZXZlbCBzZXNzaW9uIHRhc2tzXG5cdFx0Y29uc3QgdXNlclVyaSA9IHRoaXMuX2dldFVzZXJUYXNrc0pzb25VcmkoKTtcblx0XHRjb25zdCB1c2VySnNvbiA9IHVzZXJVcmkgPyBhd2FpdCB0aGlzLl9yZWFkVGFza3NKc29uKHVzZXJVcmkpIDoge307XG5cdFx0Y29uc3QgdXNlclNlc3Npb25UYXNrczogSVNlc3Npb25UYXNrV2l0aFRhcmdldFtdID0gKHVzZXJKc29uLnRhc2tzID8/IFtdKVxuXHRcdFx0LmZpbHRlcih0ID0+IHQuaW5BZ2VudHMgJiYgdGhpcy5faXNTdXBwb3J0ZWRUYXNrKHQpKVxuXHRcdFx0Lm1hcCh0ID0+ICh7IHRhc2s6IHQsIHRhcmdldDogJ3VzZXInIGFzIFRhc2tTdG9yYWdlVGFyZ2V0IH0pKTtcblxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHRoaXMuX3Nlc3Npb25UYXNrcy5zZXQoWy4uLnNlc3Npb25UYXNrcywgLi4udXNlclNlc3Npb25UYXNrc10sIHR4KSk7XG5cdH1cblxuXHRwcml2YXRlIF9sb2FkUGlubmVkVGFza0xhYmVscygpOiBNYXA8c3RyaW5nLCBzdHJpbmc+IHtcblx0XHRjb25zdCByYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoU2Vzc2lvbnNUYXNrc1NlcnZpY2UuX1BJTk5FRF9UQVNLX0xBQkVMU19LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKHJhdykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBNYXAoT2JqZWN0LmVudHJpZXMoSlNPTi5wYXJzZShyYXcpKSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gaWdub3JlIGNvcnJ1cHQgZGF0YVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbmV3IE1hcCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2F2ZVBpbm5lZFRhc2tMYWJlbHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoXG5cdFx0XHRTZXNzaW9uc1Rhc2tzU2VydmljZS5fUElOTkVEX1RBU0tfTEFCRUxTX0tFWSxcblx0XHRcdEpTT04uc3RyaW5naWZ5KE9iamVjdC5mcm9tRW50cmllcyh0aGlzLl9waW5uZWRUYXNrTGFiZWxzKSksXG5cdFx0XHRTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRTdG9yYWdlVGFyZ2V0LlVTRVJcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0UGlubmVkVGFza0xhYmVsRm9yS2V5KGtleTogc3RyaW5nLCB0YXNrTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0YXNrTGFiZWwgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fcGlubmVkVGFza0xhYmVscy5kZWxldGUoa2V5KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcGlubmVkVGFza0xhYmVscy5zZXQoa2V5LCB0YXNrTGFiZWwpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NhdmVQaW5uZWRUYXNrTGFiZWxzKCk7XG5cblx0XHRjb25zdCBvYnMgPSB0aGlzLl9waW5uZWRUYXNrT2JzZXJ2YWJsZXMuZ2V0KGtleSk7XG5cdFx0aWYgKG9icykge1xuXHRcdFx0dHJhbnNhY3Rpb24odHggPT4gb2JzLnNldCh0YXNrTGFiZWwsIHR4KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbG9hZEJyb3dzZXJVcmxzKCk6IE1hcDxzdHJpbmcsIHN0cmluZz4ge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChTZXNzaW9uc1Rhc2tzU2VydmljZS5fQlJPV1NFUl9VUkxTX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRpZiAocmF3KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IE1hcChPYmplY3QuZW50cmllcyhKU09OLnBhcnNlKHJhdykpKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgY29ycnVwdCBkYXRhXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgTWFwKCk7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlQnJvd3NlclVybHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoXG5cdFx0XHRTZXNzaW9uc1Rhc2tzU2VydmljZS5fQlJPV1NFUl9VUkxTX0tFWSxcblx0XHRcdEpTT04uc3RyaW5naWZ5KE9iamVjdC5mcm9tRW50cmllcyh0aGlzLl9icm93c2VyVXJscykpLFxuXHRcdFx0U3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0U3RvcmFnZVRhcmdldC5VU0VSXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX2xvYWRQaW5uZWRCcm93c2VycygpOiBTZXQ8c3RyaW5nPiB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KFNlc3Npb25zVGFza3NTZXJ2aWNlLl9QSU5ORURfQlJPV1NFUlNfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmIChyYXcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGFyciA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoYXJyKSkge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgU2V0KGFycik7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgY29ycnVwdCBkYXRhXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgU2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlUGlubmVkQnJvd3NlcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoXG5cdFx0XHRTZXNzaW9uc1Rhc2tzU2VydmljZS5fUElOTkVEX0JST1dTRVJTX0tFWSxcblx0XHRcdEpTT04uc3RyaW5naWZ5KFsuLi50aGlzLl9waW5uZWRCcm93c2Vyc10pLFxuXHRcdFx0U3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0U3RvcmFnZVRhcmdldC5VU0VSXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFBpbm5lZEJyb3dzZXJGb3JLZXkoa2V5OiBzdHJpbmcsIHBpbm5lZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChwaW5uZWQpIHtcblx0XHRcdHRoaXMuX3Bpbm5lZEJyb3dzZXJzLmFkZChrZXkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9waW5uZWRCcm93c2Vycy5kZWxldGUoa2V5KTtcblx0XHR9XG5cblx0XHR0aGlzLl9zYXZlUGlubmVkQnJvd3NlcnMoKTtcblxuXHRcdGNvbnN0IG9icyA9IHRoaXMuX3Bpbm5lZEJyb3dzZXJPYnNlcnZhYmxlcy5nZXQoa2V5KTtcblx0XHRpZiAob2JzKSB7XG5cdFx0XHR0cmFuc2FjdGlvbih0eCA9PiBvYnMuc2V0KHBpbm5lZCwgdHgpKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksaUJBQThCLHlCQUF5QjtBQUM1RSxTQUFzQixpQkFBaUIsbUJBQW1CO0FBQzFELFNBQVMsVUFBVSxTQUFTLGVBQWU7QUFDM0MsU0FBUyxhQUFhO0FBRXRCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsa0NBQWtDO0FBd0twQyxNQUFNLHdCQUF3QixnQkFBdUMsc0JBQXNCO0FBRTNGLElBQU0sdUJBQU4sY0FBbUMsV0FBNEM7QUFBQSxFQXVCckYsWUFDZ0MsY0FDTyxxQkFDQSxxQkFDTyxxQkFDWCxpQkFDakM7QUFDRCxVQUFNO0FBTnlCO0FBQ087QUFDQTtBQUNPO0FBQ1g7QUFwQm5DLFNBQWlCLGdCQUFnQixLQUFLLFVBQVUsSUFBSSxRQUE4QixDQUFDO0FBQ25GLFNBQVMsZUFBZSxLQUFLLGNBQWM7QUFFM0MsU0FBaUIsZ0JBQWdCLGdCQUFtRCxNQUFNLENBQUMsQ0FBQztBQUM1RixTQUFpQixlQUFlLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBRXRFLFNBQWlCLHlCQUF5QixvQkFBSSxJQUFvRTtBQUVsSCxTQUFpQix5QkFBeUIsb0JBQUksSUFBb0U7QUFFbEgsU0FBaUIsNEJBQTRCLG9CQUFJLElBQXlEO0FBYXpHLFNBQUssb0JBQW9CLEtBQUssc0JBQXNCO0FBQ3BELFNBQUssZUFBZSxLQUFLLGlCQUFpQjtBQUMxQyxTQUFLLGtCQUFrQixLQUFLLG9CQUFvQjtBQUFBLEVBQ2pEO0FBQUEsRUFFQSxnQkFBZ0IsU0FBbUU7QUFDbEYsVUFBTSxTQUFTLEtBQUssa0JB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
