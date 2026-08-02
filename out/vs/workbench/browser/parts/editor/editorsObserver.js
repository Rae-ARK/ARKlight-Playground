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
import { EditorExtensions, EditorsOrder, GroupModelChangeKind, EditorInputCapabilities } from "../../../common/editor.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { dispose, Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { IEditorGroupsService, GroupsOrder } from "../../../services/editor/common/editorGroupsService.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { LinkedMap, Touch, ResourceMap } from "../../../../base/common/map.js";
import { equals } from "../../../../base/common/objects.js";
let EditorsObserver = class extends Disposable {
  constructor(editorGroupsContainer, editorGroupService, storageService) {
    super();
    this.editorGroupService = editorGroupService;
    this.storageService = storageService;
    this.keyMap = /* @__PURE__ */ new Map();
    this.mostRecentEditorsMap = new LinkedMap();
    this.editorsPerResourceCounter = new ResourceMap();
    this._onDidMostRecentlyActiveEditorsChange = this._register(new Emitter());
    this.onDidMostRecentlyActiveEditorsChange = this._onDidMostRecentlyActiveEditorsChange.event;
    this.editorGroupsContainer = editorGroupsContainer ?? editorGroupService;
    this.isScoped = !!editorGroupsContainer;
    this.registerListeners();
    this.loadState();
  }
  get count() {
    return this.mostRecentEditorsMap.size;
  }
  get editors() {
    return [...this.mostRecentEditorsMap.values()];
  }
  hasEditor(editor) {
    const editors = this.editorsPerResourceCounter.get(editor.resource);
    return editors?.has(this.toIdentifier(editor)) ?? false;
  }
  hasEditors(resource) {
    return this.editorsPerResourceCounter.has(resource);
  }
  toIdentifier(arg1, editorId) {
    if (typeof arg1 !== "string") {
      return this.toIdentifier(arg1.typeId, arg1.editorId);
    }
    if (editorId) {
      return `${arg1}/${editorId}`;
    }
    return arg1;
  }
  registerListeners() {
    this._register(this.editorGroupsContainer.onDidAddGroup((group) => this.onGroupAdded(group)));
    this._register(this.editorGroupService.onDidChangeEditorPartOptions((e) => this.onDidChangeEditorPartOptions(e)));
    this._register(this.storageService.onWillSaveState(() => this.saveState()));
  }
  onGroupAdded(group) {
    const groupEditorsMru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
    for (let i = groupEditorsMru.length - 1; i >= 0; i--) {
      this.addMostRecentEditor(
        group,
        groupEditorsMru[i],
        false,
        true
        /* is new */
      );
    }
    if (this.editorGroupsContainer.activeGroup === group && group.activeEditor) {
      this.addMostRecentEditor(
        group,
        group.activeEditor,
        true,
        false
        /* already added before */
      );
    }
    this.registerGroupListeners(group);
  }
  registerGroupListeners(group) {
    const groupDisposables = new DisposableStore();
    groupDisposables.add(group.onDidModelChange((e) => {
      switch (e.kind) {
        // Group gets active: put active editor as most recent
        case GroupModelChangeKind.GROUP_ACTIVE: {
          if (this.editorGroupsContainer.activeGroup === group && group.activeEditor) {
            this.addMostRecentEditor(
              group,
              group.activeEditor,
              true,
              false
              /* editor already opened */
            );
          }
          break;
        }
        // Editor opens: put it as second most recent
        //
        // Also check for maximum allowed number of editors and
        // start to close oldest ones if needed.
        case GroupModelChangeKind.EDITOR_OPEN: {
          if (e.editor) {
            this.addMostRecentEditor(
              group,
              e.editor,
              false,
              true
              /* is new */
            );
            this.ensureOpenedEditorsLimit({ groupId: group.id, editor: e.editor }, group.id);
          }
          break;
        }
      }
    }));
    groupDisposables.add(group.onDidCloseEditor((e) => {
      this.removeMostRecentEditor(group, e.editor);
    }));
    groupDisposables.add(group.onDidActiveEditorChange((e) => {
      if (e.editor) {
        this.addMostRecentEditor(
          group,
          e.editor,
          this.editorGroupsContainer.activeGroup === group,
          false
          /* editor already opened */
        );
      }
    }));
    Event.once(group.onWillDispose)(() => dispose(groupDisposables));
  }
  onDidChangeEditorPartOptions(event) {
    if (!equals(event.newPartOptions.limit, event.oldPartOptions.limit)) {
      const activeGroup = this.editorGroupsContainer.activeGroup;
      let exclude = void 0;
      if (activeGroup.activeEditor) {
        exclude = { editor: activeGroup.activeEditor, groupId: activeGroup.id };
      }
      this.ensureOpenedEditorsLimit(exclude);
    }
  }
  addMostRecentEditor(group, editor, isActive, isNew) {
    const key = this.ensureKey(group, editor);
    const mostRecentEditor = this.mostRecentEditorsMap.first;
    if (isActive || !mostRecentEditor) {
      this.mostRecentEditorsMap.set(key, key, mostRecentEditor ? Touch.AsOld : void 0);
    } else {
      this.mostRecentEditorsMap.set(
        key,
        key,
        Touch.AsOld
        /* make first */
      );
      this.mostRecentEditorsMap.set(
        mostRecentEditor,
        mostRecentEditor,
        Touch.AsOld
        /* make first */
      );
    }
    if (isNew) {
      this.updateEditorResourcesMap(editor, true);
    }
    this._onDidMostRecentlyActiveEditorsChange.fire();
  }
  updateEditorResourcesMap(editor, add) {
    let resource = void 0;
    let typeId = void 0;
    let editorId = void 0;
    if (editor instanceof SideBySideEditorInput) {
      resource = editor.primary.resource;
      typeId = editor.primary.typeId;
      editorId = editor.primary.editorId;
    } else {
      resource = editor.resource;
      typeId = editor.typeId;
      editorId = editor.editorId;
    }
    if (!resource) {
      return;
    }
    const identifier = this.toIdentifier(typeId, editorId);
    if (add) {
      let editorsPerResource = this.editorsPerResourceCounter.get(resource);
      if (!editorsPerResource) {
        editorsPerResource = /* @__PURE__ */ new Map();
        this.editorsPerResourceCounter.set(resource, editorsPerResource);
      }
      editorsPerResource.set(identifier, (editorsPerResource.get(identifier) ?? 0) + 1);
    } else {
      const editorsPerResource = this.editorsPerResourceCounter.get(resource);
      if (editorsPerResource) {
        const counter = editorsPerResource.get(identifier) ?? 0;
        if (counter > 1) {
          editorsPerResource.set(identifier, counter - 1);
        } else {
          editorsPerResource.delete(identifier);
          if (editorsPerResource.size === 0) {
            this.editorsPerResourceCounter.delete(resource);
          }
        }
      }
    }
  }
  removeMostRecentEditor(group, editor) {
    this.updateEditorResourcesMap(editor, false);
    const key = this.findKey(group, editor);
    if (key) {
      this.mostRecentEditorsMap.delete(key);
      const map = this.keyMap.get(group.id);
      if (map?.delete(key.editor) && map.size === 0) {
        this.keyMap.delete(group.id);
      }
      this._onDidMostRecentlyActiveEditorsChange.fire();
    }
  }
  findKey(group, editor) {
    const groupMap = this.keyMap.get(group.id);
    if (!groupMap) {
      return void 0;
    }
    return groupMap.get(editor);
  }
  ensureKey(group, editor) {
    let groupMap = this.keyMap.get(group.id);
    if (!groupMap) {
      groupMap = /* @__PURE__ */ new Map();
      this.keyMap.set(group.id, groupMap);
    }
    let key = groupMap.get(editor);
    if (!key) {
      key = { groupId: group.id, editor };
      groupMap.set(editor, key);
    }
    return key;
  }
  async ensureOpenedEditorsLimit(exclude, groupId) {
    if (!this.editorGroupService.partOptions.limit?.enabled || typeof this.editorGroupService.partOptions.limit.value !== "number" || this.editorGroupService.partOptions.limit.value <= 0) {
      return;
    }
    const limit = this.editorGroupService.partOptions.limit.value;
    if (this.editorGroupService.partOptions.limit?.perEditorGroup) {
      if (typeof groupId === "number") {
        const group = this.editorGroupsContainer.getGroup(groupId);
        if (group) {
          await this.doEnsureOpenedEditorsLimit(limit, group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).map((editor) => ({ editor, groupId })), exclude);
        }
      } else {
        for (const group of this.editorGroupsContainer.groups) {
          await this.ensureOpenedEditorsLimit(exclude, group.id);
        }
      }
    } else {
      await this.doEnsureOpenedEditorsLimit(limit, [...this.mostRecentEditorsMap.values()], exclude);
    }
  }
  async doEnsureOpenedEditorsLimit(limit, mostRecentEditors, exclude) {
    const mostRecentEditorsCountingForLimit = mostRecentEditors.filter(({ editor }) => {
      if (editor.hasCapability(EditorInputCapabilities.ExcludeFromEditorLimit)) {
        return false;
      }
      if (this.editorGroupService.partOptions.limit?.excludeDirty && (editor.isDirty() && !editor.isSaving() || editor.hasCapability(EditorInputCapabilities.Scratchpad))) {
        return false;
      }
      return true;
    });
    if (limit >= mostRecentEditorsCountingForLimit.length) {
      return;
    }
    const leastRecentlyClosableEditors = mostRecentEditorsCountingForLimit.reverse().filter(({ editor, groupId }) => {
      if (editor.isDirty() && !editor.isSaving() || editor.hasCapability(EditorInputCapabilities.Scratchpad)) {
        return false;
      }
      if (exclude && editor === exclude.editor && groupId === exclude.groupId) {
        return false;
      }
      if (this.editorGroupsContainer.getGroup(groupId)?.isSticky(editor)) {
        return false;
      }
      return true;
    });
    let editorsToCloseCount = mostRecentEditorsCountingForLimit.length - limit;
    const mapGroupToEditorsToClose = /* @__PURE__ */ new Map();
    for (const { groupId, editor } of leastRecentlyClosableEditors) {
      let editorsInGroupToClose = mapGroupToEditorsToClose.get(groupId);
      if (!editorsInGroupToClose) {
        editorsInGroupToClose = [];
        mapGroupToEditorsToClose.set(groupId, editorsInGroupToClose);
      }
      editorsInGroupToClose.push(editor);
      editorsToCloseCount--;
      if (editorsToCloseCount === 0) {
        break;
      }
    }
    for (const [groupId, editors] of mapGroupToEditorsToClose) {
      const group = this.editorGroupsContainer.getGroup(groupId);
      if (group) {
        await group.closeEditors(editors, { preserveFocus: true });
      }
    }
  }
  saveState() {
    if (this.isScoped) {
      return;
    }
    if (this.mostRecentEditorsMap.isEmpty()) {
      this.storageService.remove(EditorsObserver.STORAGE_KEY, StorageScope.WORKSPACE);
    } else {
      this.storageService.store(EditorsObserver.STORAGE_KEY, JSON.stringify(this.serialize()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
  }
  serialize() {
    const registry = Registry.as(EditorExtensions.EditorFactory);
    const entries = [...this.mostRecentEditorsMap.values()];
    const mapGroupToSerializableEditorsOfGroup = /* @__PURE__ */ new Map();
    return {
      entries: coalesce(entries.map(({ editor, groupId }) => {
        const group = this.editorGroupsContainer.getGroup(groupId);
        if (!group) {
          return void 0;
        }
        let serializableEditorsOfGroup = mapGroupToSerializableEditorsOfGroup.get(group);
        if (!serializableEditorsOfGroup) {
          serializableEditorsOfGroup = group.getEditors(EditorsOrder.SEQUENTIAL).filter((editor2) => {
            const editorSerializer = registry.getEditorSerializer(editor2);
            return editorSerializer?.canSerialize(editor2);
          });
          mapGroupToSerializableEditorsOfGroup.set(group, serializableEditorsOfGroup);
        }
        const index = serializableEditorsOfGroup.indexOf(editor);
        if (index === -1) {
          return void 0;
        }
        return { groupId, index };
      }))
    };
  }
  async loadState() {
    if (this.editorGroupsContainer === this.editorGroupService.mainPart || this.editorGroupsContainer === this.editorGroupService) {
      await this.editorGroupService.whenReady;
    }
    let hasRestorableState = false;
    if (!this.isScoped) {
      const serialized = this.storageService.get(EditorsObserver.STORAGE_KEY, StorageScope.WORKSPACE);
      if (serialized) {
        hasRestorableState = true;
        this.deserialize(JSON.parse(serialized));
      }
    }
    if (!hasRestorableState) {
      const groups = this.editorGroupsContainer.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
      for (let i = groups.length - 1; i >= 0; i--) {
        const group = groups[i];
        const groupEditorsMru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
        for (let i2 = groupEditorsMru.length - 1; i2 >= 0; i2--) {
          this.addMostRecentEditor(
            group,
            groupEditorsMru[i2],
            true,
            true
            /* is new */
          );
        }
      }
    }
    for (const group of this.editorGroupsContainer.groups) {
      this.registerGroupListeners(group);
    }
  }
  deserialize(serialized) {
    const mapValues = [];
    for (const { groupId, index } of serialized.entries) {
      const group = this.editorGroupsContainer.getGroup(groupId);
      if (!group) {
        continue;
      }
      const editor = group.getEditorByIndex(index);
      if (!editor) {
        continue;
      }
      const editorIdentifier = this.ensureKey(group, editor);
      mapValues.push([editorIdentifier, editorIdentifier]);
      this.updateEditorResourcesMap(editor, true);
    }
    this.mostRecentEditorsMap.fromJSON(mapValues);
  }
};
EditorsObserver.STORAGE_KEY = "editors.mru";
EditorsObserver = __decorateClass([
  __decorateParam(1, IEditorGroupsService),
  __decorateParam(2, IStorageService)
], EditorsObserver);
export {
  EditorsObserver
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JzT2JzZXJ2ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5LCBJRWRpdG9ySWRlbnRpZmllciwgR3JvdXBJZGVudGlmaWVyLCBFZGl0b3JFeHRlbnNpb25zLCBJRWRpdG9yUGFydE9wdGlvbnNDaGFuZ2VFdmVudCwgRWRpdG9yc09yZGVyLCBHcm91cE1vZGVsQ2hhbmdlS2luZCwgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBkaXNwb3NlLCBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIElFZGl0b3JHcm91cCwgR3JvdXBzT3JkZXIsIElFZGl0b3JHcm91cHNDb250YWluZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgTGlua2VkTWFwLCBUb3VjaCwgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VFZGl0b3JJbnB1dElkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRFZGl0b3JzTGlzdCB7XG5cdGVudHJpZXM6IElTZXJpYWxpemVkRWRpdG9ySWRlbnRpZmllcltdO1xufVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRFZGl0b3JJZGVudGlmaWVyIHtcblx0Z3JvdXBJZDogR3JvdXBJZGVudGlmaWVyO1xuXHRpbmRleDogbnVtYmVyO1xufVxuXG4vKipcbiAqIEEgb2JzZXJ2ZXIgb2Ygb3BlbmVkIGVkaXRvcnMgYWNyb3NzIGFsbCBlZGl0b3IgZ3JvdXBzIGJ5IG1vc3QgcmVjZW50bHkgdXNlZC5cbiAqIFJ1bGVzOlxuICogLSB0aGUgbGFzdCBlZGl0b3IgaW4gdGhlIGxpc3QgaXMgdGhlIG9uZSBtb3N0IHJlY2VudGx5IGFjdGl2YXRlZFxuICogLSB0aGUgZmlyc3QgZWRpdG9yIGluIHRoZSBsaXN0IGlzIHRoZSBvbmUgdGhhdCB3YXMgYWN0aXZhdGVkIHRoZSBsb25nZXN0IHRpbWUgYWdvXG4gKiAtIGFuIGVkaXRvciB0aGF0IG9wZW5zIGluYWN0aXZlIHdpbGwgYmUgcGxhY2VkIGJlaGluZCB0aGUgY3VycmVudGx5IGFjdGl2ZSBlZGl0b3JcbiAqXG4gKiBUaGUgb2JzZXJ2ZXIgbWF5IHN0YXJ0IHRvIGNsb3NlIGVkaXRvcnMgYmFzZWQgb24gdGhlIHdvcmtiZW5jaC5lZGl0b3IubGltaXQgc2V0dGluZy5cbiAqL1xuZXhwb3J0IGNsYXNzIEVkaXRvcnNPYnNlcnZlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNUT1JBR0VfS0VZID0gJ2VkaXRvcnMubXJ1JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGtleU1hcCA9IG5ldyBNYXA8R3JvdXBJZGVudGlmaWVyLCBNYXA8RWRpdG9ySW5wdXQsIElFZGl0b3JJZGVudGlmaWVyPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBtb3N0UmVjZW50RWRpdG9yc01hcCA9IG5ldyBMaW5rZWRNYXA8SUVkaXRvcklkZW50aWZpZXIsIElFZGl0b3JJZGVudGlmaWVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcnNQZXJSZXNvdXJjZUNvdW50ZXIgPSBuZXcgUmVzb3VyY2VNYXA8TWFwPHN0cmluZyAvKiB0eXBlSWQvZWRpdG9ySWQgKi8sIG51bWJlciAvKiBjb3VudGVyICovPj4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE1vc3RSZWNlbnRseUFjdGl2ZUVkaXRvcnNDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRNb3N0UmVjZW50bHlBY3RpdmVFZGl0b3JzQ2hhbmdlID0gdGhpcy5fb25EaWRNb3N0UmVjZW50bHlBY3RpdmVFZGl0b3JzQ2hhbmdlLmV2ZW50O1xuXG5cdGdldCBjb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm1vc3RSZWNlbnRFZGl0b3JzTWFwLnNpemU7XG5cdH1cblxuXHRnZXQgZWRpdG9ycygpOiBJRWRpdG9ySWRlbnRpZmllcltdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMubW9zdFJlY2VudEVkaXRvcnNNYXAudmFsdWVzKCldO1xuXHR9XG5cblx0aGFzRWRpdG9yKGVkaXRvcjogSVJlc291cmNlRWRpdG9ySW5wdXRJZGVudGlmaWVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZWRpdG9ycyA9IHRoaXMuZWRpdG9yc1BlclJlc291cmNlQ291bnRlci5nZXQoZWRpdG9yLnJlc291cmNlKTtcblxuXHRcdHJldHVybiBlZGl0b3JzPy5oYXModGhpcy50b0lkZW50aWZpZXIoZWRpdG9yKSkgPz8gZmFsc2U7XG5cdH1cblxuXHRoYXNFZGl0b3JzKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JzUGVyUmVzb3VyY2VDb3VudGVyLmhhcyhyZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIHRvSWRlbnRpZmllcih0eXBlSWQ6IHN0cmluZywgZWRpdG9ySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZztcblx0cHJpdmF0ZSB0b0lkZW50aWZpZXIoZWRpdG9yOiBJUmVzb3VyY2VFZGl0b3JJbnB1dElkZW50aWZpZXIpOiBzdHJpbmc7XG5cdHByaXZhdGUgdG9JZGVudGlmaWVyKGFyZzE6IHN0cmluZyB8IElSZXNvdXJjZUVkaXRvcklucHV0SWRlbnRpZmllciwgZWRpdG9ySWQ/OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdGlmICh0eXBlb2YgYXJnMSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB0aGlzLnRvSWRlbnRpZmllcihhcmcxLnR5cGVJZCwgYXJnMS5lZGl0b3JJZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvcklkKSB7XG5cdFx0XHRyZXR1cm4gYCR7YXJnMX0vJHtlZGl0b3JJZH1gO1xuXHRcdH1cblxuXHRcdHJldHVybiBhcmcxO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cHNDb250YWluZXI6IElFZGl0b3JHcm91cHNDb250YWluZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgaXNTY29wZWQ6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yR3JvdXBzQ29udGFpbmVyOiBJRWRpdG9yR3JvdXBzQ29udGFpbmVyIHwgdW5kZWZpbmVkLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyID0gZWRpdG9yR3JvdXBzQ29udGFpbmVyID8/IGVkaXRvckdyb3VwU2VydmljZTtcblx0XHR0aGlzLmlzU2NvcGVkID0gISFlZGl0b3JHcm91cHNDb250YWluZXI7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdFx0dGhpcy5sb2FkU3RhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIub25EaWRBZGRHcm91cChncm91cCA9PiB0aGlzLm9uR3JvdXBBZGRlZChncm91cCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3VwU2VydmljZS5vbkRpZENoYW5nZUVkaXRvclBhcnRPcHRpb25zKGUgPT4gdGhpcy5vbkRpZENoYW5nZUVkaXRvclBhcnRPcHRpb25zKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4gdGhpcy5zYXZlU3RhdGUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkdyb3VwQWRkZWQoZ3JvdXA6IElFZGl0b3JHcm91cCk6IHZvaWQge1xuXG5cdFx0Ly8gTWFrZSBzdXJlIHRvIGFkZCBhbnkgYWxyZWFkeSBleGlzdGluZyBlZGl0b3Jcblx0XHQvLyBvZiB0aGUgbmV3IGdyb3VwIGludG8gb3VyIGxpc3QgaW4gTFJVIG9yZGVyXG5cdFx0Y29uc3QgZ3JvdXBFZGl0b3JzTXJ1ID0gZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpO1xuXHRcdGZvciAobGV0IGkgPSBncm91cEVkaXRvcnNNcnUubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdHRoaXMuYWRkTW9zdFJlY2VudEVkaXRvcihncm91cCwgZ3JvdXBFZGl0b3JzTXJ1W2ldLCBmYWxzZSAvKiBpcyBub3QgYWN0aXZlICovLCB0cnVlIC8qIGlzIG5ldyAqLyk7XG5cdFx0fVxuXG5cdFx0Ly8gTWFrZSBzdXJlIHRoYXQgYWN0aXZlIGVkaXRvciBpcyBwdXQgYXMgZmlyc3QgaWYgZ3JvdXAgaXMgYWN0aXZlXG5cdFx0aWYgKHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmFjdGl2ZUdyb3VwID09PSBncm91cCAmJiBncm91cC5hY3RpdmVFZGl0b3IpIHtcblx0XHRcdHRoaXMuYWRkTW9zdFJlY2VudEVkaXRvcihncm91cCwgZ3JvdXAuYWN0aXZlRWRpdG9yLCB0cnVlIC8qIGlzIGFjdGl2ZSAqLywgZmFsc2UgLyogYWxyZWFkeSBhZGRlZCBiZWZvcmUgKi8pO1xuXHRcdH1cblxuXHRcdC8vIEdyb3VwIExpc3RlbmVyc1xuXHRcdHRoaXMucmVnaXN0ZXJHcm91cExpc3RlbmVycyhncm91cCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyR3JvdXBMaXN0ZW5lcnMoZ3JvdXA6IElFZGl0b3JHcm91cCk6IHZvaWQge1xuXHRcdGNvbnN0IGdyb3VwRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Z3JvdXBEaXNwb3NhYmxlcy5hZGQoZ3JvdXAub25EaWRNb2RlbENoYW5nZShlID0+IHtcblx0XHRcdHN3aXRjaCAoZS5raW5kKSB7XG5cblx0XHRcdFx0Ly8gR3JvdXAgZ2V0cyBhY3RpdmU6IHB1dCBhY3RpdmUgZWRpdG9yIGFzIG1vc3QgcmVjZW50XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfQUNUSVZFOiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmFjdGl2ZUdyb3VwID09PSBncm91cCAmJiBncm91cC5hY3RpdmVFZGl0b3IpIHtcblx0XHRcdFx0XHRcdHRoaXMuYWRkTW9zdFJlY2VudEVkaXRvcihncm91cCwgZ3JvdXAuYWN0aXZlRWRpdG9yLCB0cnVlIC8qIGlzIGFjdGl2ZSAqLywgZmFsc2UgLyogZWRpdG9yIGFscmVhZHkgb3BlbmVkICovKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEVkaXRvciBvcGVuczogcHV0IGl0IGFzIHNlY29uZCBtb3N0IHJlY2VudFxuXHRcdFx0XHQvL1xuXHRcdFx0XHQvLyBBbHNvIGNoZWNrIGZvciBtYXhpbXVtIGFsbG93ZWQgbnVtYmVyIG9mIGVkaXRvcnMgYW5kXG5cdFx0XHRcdC8vIHN0YXJ0IHRvIGNsb3NlIG9sZGVzdCBvbmVzIGlmIG5lZWRlZC5cblx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfT1BFTjoge1xuXHRcdFx0XHRcdGlmIChlLmVkaXRvcikge1xuXHRcdFx0XHRcdFx0dGhpcy5hZGRNb3N0UmVjZW50RWRpdG9yKGdyb3VwLCBlLmVkaXRvciwgZmFsc2UgLyogaXMgbm90IGFjdGl2ZSAqLywgdHJ1ZSAvKiBpcyBuZXcgKi8pO1xuXHRcdFx0XHRcdFx0dGhpcy5lbnN1cmVPcGVuZWRFZGl0b3JzTGltaXQoeyBncm91cElkOiBncm91cC5pZCwgZWRpdG9yOiBlLmVkaXRvciB9LCBncm91cC5pZCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBFZGl0b3IgY2xvc2VzOiByZW1vdmUgZnJvbSByZWNlbnRseSBvcGVuZWRcblx0XHRncm91cERpc3Bvc2FibGVzLmFkZChncm91cC5vbkRpZENsb3NlRWRpdG9yKGUgPT4ge1xuXHRcdFx0dGhpcy5yZW1vdmVNb3N0UmVjZW50RWRpdG9yKGdyb3VwLCBlLmVkaXRvcik7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRWRpdG9yIGdldHMgYWN0aXZlOiBwdXQgYWN0aXZlIGVkaXRvciBhcyBtb3N0IHJlY2VudFxuXHRcdC8vIGlmIGdyb3VwIGlzIGFjdGl2ZSwgb3RoZXJ3aXNlIHNlY29uZCBtb3N0IHJlY2VudFxuXHRcdGdyb3VwRGlzcG9zYWJsZXMuYWRkKGdyb3VwLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuZWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMuYWRkTW9zdFJlY2VudEVkaXRvcihncm91cCwgZS5lZGl0b3IsIHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmFjdGl2ZUdyb3VwID09PSBncm91cCwgZmFsc2UgLyogZWRpdG9yIGFscmVhZHkgb3BlbmVkICovKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gY2xlYW51cCBvbiBkaXNwb3NlXG5cdFx0RXZlbnQub25jZShncm91cC5vbldpbGxEaXNwb3NlKSgoKSA9PiBkaXNwb3NlKGdyb3VwRGlzcG9zYWJsZXMpKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VFZGl0b3JQYXJ0T3B0aW9ucyhldmVudDogSUVkaXRvclBhcnRPcHRpb25zQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIWVxdWFscyhldmVudC5uZXdQYXJ0T3B0aW9ucy5saW1pdCwgZXZlbnQub2xkUGFydE9wdGlvbnMubGltaXQpKSB7XG5cdFx0XHRjb25zdCBhY3RpdmVHcm91cCA9IHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmFjdGl2ZUdyb3VwO1xuXHRcdFx0bGV0IGV4Y2x1ZGU6IElFZGl0b3JJZGVudGlmaWVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRleGNsdWRlID0geyBlZGl0b3I6IGFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvciwgZ3JvdXBJZDogYWN0aXZlR3JvdXAuaWQgfTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5lbnN1cmVPcGVuZWRFZGl0b3JzTGltaXQoZXhjbHVkZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhZGRNb3N0UmVjZW50RWRpdG9yKGdyb3VwOiBJRWRpdG9yR3JvdXAsIGVkaXRvcjogRWRpdG9ySW5wdXQsIGlzQWN0aXZlOiBib29sZWFuLCBpc05ldzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuZW5zdXJlS2V5KGdyb3VwLCBlZGl0b3IpO1xuXHRcdGNvbnN0IG1vc3RSZWNlbnRFZGl0b3IgPSB0aGlzLm1vc3RSZWNlbnRFZGl0b3JzTWFwLmZpcnN0O1xuXG5cdFx0Ly8gQWN0aXZlIG9yIGZpcnN0IGVudHJ5OiBhZGQgdG8gZW5kIG9mIG1hcFxuXHRcdGlmIChpc0FjdGl2ZSB8fCAhbW9zdFJlY2VudEVkaXRvcikge1xuXHRcdFx0dGhpcy5tb3N0UmVjZW50RWRpdG9yc01hcC5zZXQoa2V5LCBrZXksIG1vc3RSZWNlbnRFZGl0b3IgPyBUb3VjaC5Bc09sZCAvKiBtYWtlIGZpcnN0ICovIDogdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2U6IGluc2VydCBiZWZvcmUgbW9zdCByZWNlbnRcblx0XHRlbHNlIHtcblx0XHRcdC8vIHdlIGhhdmUgbW9zdCByZWNlbnQgZWRpdG9ycy4gYXMgc3VjaCB3ZVxuXHRcdFx0Ly8gcHV0IHRoaXMgbmV3bHkgb3BlbmVkIGVkaXRvciByaWdodCBiZWZvcmVcblx0XHRcdC8vIHRoZSBjdXJyZW50IG1vc3QgcmVjZW50IG9uZSBiZWNhdXNlIGl0IGNhbm5vdFxuXHRcdFx0Ly8gYmUgdGhlIG1vc3QgcmVjZW50bHkgYWN0aXZlIG9uZSB1bmxlc3Ncblx0XHRcdC8vIGl0IGJlY29tZXMgYWN0aXZlLiBidXQgaXQgaXMgc3RpbGwgbW9yZVxuXHRcdFx0Ly8gYWN0aXZlIHRoZW4gYW55IG90aGVyIGVkaXRvciBpbiB0aGUgbGlzdC5cblx0XHRcdHRoaXMubW9zdFJlY2VudEVkaXRvcnNNYXAuc2V0KGtleSwga2V5LCBUb3VjaC5Bc09sZCAvKiBtYWtlIGZpcnN0ICovKTtcblx0XHRcdHRoaXMubW9zdFJlY2VudEVkaXRvcnNNYXAuc2V0KG1vc3RSZWNlbnRFZGl0b3IsIG1vc3RSZWNlbnRFZGl0b3IsIFRvdWNoLkFzT2xkIC8qIG1ha2UgZmlyc3QgKi8pO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBpbiByZXNvdXJjZSBtYXAgaWYgdGhpcyBpcyBhIG5ldyBlZGl0b3Jcblx0XHRpZiAoaXNOZXcpIHtcblx0XHRcdHRoaXMudXBkYXRlRWRpdG9yUmVzb3VyY2VzTWFwKGVkaXRvciwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbkRpZE1vc3RSZWNlbnRseUFjdGl2ZUVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFZGl0b3JSZXNvdXJjZXNNYXAoZWRpdG9yOiBFZGl0b3JJbnB1dCwgYWRkOiBib29sZWFuKTogdm9pZCB7XG5cblx0XHQvLyBEaXN0aWxsIHRoZSBlZGl0b3IgcmVzb3VyY2UgYW5kIHR5cGUgaWQgd2l0aCBzdXBwb3J0XG5cdFx0Ly8gZm9yIHNpZGUgYnkgc2lkZSBlZGl0b3IncyBwcmltYXJ5IHNpZGUgdG9vLlxuXHRcdGxldCByZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCB0eXBlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgZWRpdG9ySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXNvdXJjZSA9IGVkaXRvci5wcmltYXJ5LnJlc291cmNlO1xuXHRcdFx0dHlwZUlkID0gZWRpdG9yLnByaW1hcnkudHlwZUlkO1xuXHRcdFx0ZWRpdG9ySWQgPSBlZGl0b3IucHJpbWFyeS5lZGl0b3JJZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzb3VyY2UgPSBlZGl0b3IucmVzb3VyY2U7XG5cdFx0XHR0eXBlSWQgPSBlZGl0b3IudHlwZUlkO1xuXHRcdFx0ZWRpdG9ySWQgPSBlZGl0b3IuZWRpdG9ySWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuOyAvLyByZXF1aXJlIGEgcmVzb3VyY2Vcblx0XHR9XG5cblx0XHRjb25zdCBpZGVudGlmaWVyID0gdGhpcy50b0lkZW50aWZpZXIodHlwZUlkLCBlZGl0b3JJZCk7XG5cblx0XHQvLyBBZGQgZW50cnlcblx0XHRpZiAoYWRkKSB7XG5cdFx0XHRsZXQgZWRpdG9yc1BlclJlc291cmNlID0gdGhpcy5lZGl0b3JzUGVyUmVzb3VyY2VDb3VudGVyLmdldChyZXNvdXJjZSk7XG5cdFx0XHRpZiAoIWVkaXRvcnNQZXJSZXNvdXJjZSkge1xuXHRcdFx0XHRlZGl0b3JzUGVyUmVzb3VyY2UgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdFx0XHR0aGlzLmVkaXRvcnNQZXJSZXNvdXJjZUNvdW50ZXIuc2V0KHJlc291cmNlLCBlZGl0b3JzUGVyUmVzb3VyY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRlZGl0b3JzUGVyUmVzb3VyY2Uuc2V0KGlkZW50aWZpZXIsIChlZGl0b3JzUGVyUmVzb3VyY2UuZ2V0KGlkZW50aWZpZXIpID8/IDApICsgMSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIGVudHJ5XG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCBlZGl0b3JzUGVyUmVzb3VyY2UgPSB0aGlzLmVkaXRvcnNQZXJSZXNvdXJjZUNvdW50ZXIuZ2V0KHJlc291cmNlKTtcblx0XHRcdGlmIChlZGl0b3JzUGVyUmVzb3VyY2UpIHtcblx0XHRcdFx0Y29uc3QgY291bnRlciA9IGVkaXRvcnNQZXJSZXNvdXJjZS5nZXQoaWRlbnRpZmllcikgPz8gMDtcblx0XHRcdFx0aWYgKGNvdW50ZXIgPiAxKSB7XG5cdFx0XHRcdFx0ZWRpdG9yc1BlclJlc291cmNlLnNldChpZGVudGlmaWVyLCBjb3VudGVyIC0gMSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZWRpdG9yc1BlclJlc291cmNlLmRlbGV0ZShpZGVudGlmaWVyKTtcblxuXHRcdFx0XHRcdGlmIChlZGl0b3JzUGVyUmVzb3VyY2Uuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0dGhpcy5lZGl0b3JzUGVyUmVzb3VyY2VDb3VudGVyLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVNb3N0UmVjZW50RWRpdG9yKGdyb3VwOiBJRWRpdG9yR3JvdXAsIGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkIHtcblxuXHRcdC8vIFVwZGF0ZSBpbiByZXNvdXJjZSBtYXBcblx0XHR0aGlzLnVwZGF0ZUVkaXRvclJlc291cmNlc01hcChlZGl0b3IsIGZhbHNlKTtcblxuXHRcdC8vIFVwZGF0ZSBpbiBNUlUgbGlzdFxuXHRcdGNvbnN0IGtleSA9IHRoaXMuZmluZEtleShncm91cCwgZWRpdG9yKTtcblx0XHRpZiAoa2V5KSB7XG5cblx0XHRcdC8vIFJlbW92ZSBmcm9tIG1vc3QgcmVjZW50IGVkaXRvcnNcblx0XHRcdHRoaXMubW9zdFJlY2VudEVkaXRvcnNNYXAuZGVsZXRlKGtleSk7XG5cblx0XHRcdC8vIFJlbW92ZSBmcm9tIGtleSBtYXBcblx0XHRcdGNvbnN0IG1hcCA9IHRoaXMua2V5TWFwLmdldChncm91cC5pZCk7XG5cdFx0XHRpZiAobWFwPy5kZWxldGUoa2V5LmVkaXRvcikgJiYgbWFwLnNpemUgPT09IDApIHtcblx0XHRcdFx0dGhpcy5rZXlNYXAuZGVsZXRlKGdyb3VwLmlkKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRXZlbnRcblx0XHRcdHRoaXMuX29uRGlkTW9zdFJlY2VudGx5QWN0aXZlRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmaW5kS2V5KGdyb3VwOiBJRWRpdG9yR3JvdXAsIGVkaXRvcjogRWRpdG9ySW5wdXQpOiBJRWRpdG9ySWRlbnRpZmllciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZ3JvdXBNYXAgPSB0aGlzLmtleU1hcC5nZXQoZ3JvdXAuaWQpO1xuXHRcdGlmICghZ3JvdXBNYXApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGdyb3VwTWFwLmdldChlZGl0b3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBlbnN1cmVLZXkoZ3JvdXA6IElFZGl0b3JHcm91cCwgZWRpdG9yOiBFZGl0b3JJbnB1dCk6IElFZGl0b3JJZGVudGlmaWVyIHtcblx0XHRsZXQgZ3JvdXBNYXAgPSB0aGlzLmtleU1hcC5nZXQoZ3JvdXAuaWQpO1xuXHRcdGlmICghZ3JvdXBNYXApIHtcblx0XHRcdGdyb3VwTWFwID0gbmV3IE1hcCgpO1xuXG5cdFx0XHR0aGlzLmtleU1hcC5zZXQoZ3JvdXAuaWQsIGdyb3VwTWFwKTtcblx0XHR9XG5cblx0XHRsZXQga2V5ID0gZ3JvdXBNYXAuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFrZXkpIHtcblx0XHRcdGtleSA9IHsgZ3JvdXBJZDogZ3JvdXAuaWQsIGVkaXRvciB9O1xuXHRcdFx0Z3JvdXBNYXAuc2V0KGVkaXRvciwga2V5KTtcblx0XHR9XG5cblx0XHRyZXR1cm4ga2V5O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBlbnN1cmVPcGVuZWRFZGl0b3JzTGltaXQoZXhjbHVkZTogSUVkaXRvcklkZW50aWZpZXIgfCB1bmRlZmluZWQsIGdyb3VwSWQ/OiBHcm91cElkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoXG5cdFx0XHQhdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UucGFydE9wdGlvbnMubGltaXQ/LmVuYWJsZWQgfHxcblx0XHRcdHR5cGVvZiB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5wYXJ0T3B0aW9ucy5saW1pdC52YWx1ZSAhPT0gJ251bWJlcicgfHxcblx0XHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLnBhcnRPcHRpb25zLmxpbWl0LnZhbHVlIDw9IDBcblx0XHQpIHtcblx0XHRcdHJldHVybjsgLy8gcmV0dXJuIGVhcmx5IGlmIG5vdCBlbmFibGVkIG9yIGludmFsaWRcblx0XHR9XG5cblx0XHRjb25zdCBsaW1pdCA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLnBhcnRPcHRpb25zLmxpbWl0LnZhbHVlO1xuXG5cdFx0Ly8gSW4gZWRpdG9yIGdyb3VwXG5cdFx0aWYgKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLnBhcnRPcHRpb25zLmxpbWl0Py5wZXJFZGl0b3JHcm91cCkge1xuXG5cdFx0XHQvLyBGb3Igc3BlY2lmaWMgZWRpdG9yIGdyb3Vwc1xuXHRcdFx0aWYgKHR5cGVvZiBncm91cElkID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRjb25zdCBncm91cCA9IHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmdldEdyb3VwKGdyb3VwSWQpO1xuXHRcdFx0XHRpZiAoZ3JvdXApIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmRvRW5zdXJlT3BlbmVkRWRpdG9yc0xpbWl0KGxpbWl0LCBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubWFwKGVkaXRvciA9PiAoeyBlZGl0b3IsIGdyb3VwSWQgfSkpLCBleGNsdWRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBGb3IgYWxsIGVkaXRvciBncm91cHNcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmdyb3Vwcykge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZW5zdXJlT3BlbmVkRWRpdG9yc0xpbWl0KGV4Y2x1ZGUsIGdyb3VwLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFjcm9zcyBhbGwgZWRpdG9yIGdyb3Vwc1xuXHRcdGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5kb0Vuc3VyZU9wZW5lZEVkaXRvcnNMaW1pdChsaW1pdCwgWy4uLnRoaXMubW9zdFJlY2VudEVkaXRvcnNNYXAudmFsdWVzKCldLCBleGNsdWRlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvRW5zdXJlT3BlbmVkRWRpdG9yc0xpbWl0KGxpbWl0OiBudW1iZXIsIG1vc3RSZWNlbnRFZGl0b3JzOiBJRWRpdG9ySWRlbnRpZmllcltdLCBleGNsdWRlPzogSUVkaXRvcklkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIEVkaXRvcnMgdGhhdCBvcHQgb3V0IG9mIHRoZSBsaW1pdCAoZS5nLiB0aGUgQWdlbnRzIHdpbmRvdydzIG1hbmFnZWRcblx0XHQvLyBkb2NrZWQgdGFicykgbmV2ZXIgY291bnQgdG93YXJkcyBpdCBhbmQgYXJlIG5ldmVyIGF1dG8tY2xvc2VkLlxuXHRcdGNvbnN0IG1vc3RSZWNlbnRFZGl0b3JzQ291bnRpbmdGb3JMaW1pdCA9IG1vc3RSZWNlbnRFZGl0b3JzLmZpbHRlcigoeyBlZGl0b3IgfSkgPT4ge1xuXHRcdFx0aWYgKGVkaXRvci5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLkV4Y2x1ZGVGcm9tRWRpdG9yTGltaXQpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2hlY2sgZm9yIGBleGNsdWRlRGlydHlgIHNldHRpbmcgYW5kIGFwcGx5IGl0IGJ5IGV4Y2x1ZGluZ1xuXHRcdFx0Ly8gYW55IHJlY2VudCBlZGl0b3IgdGhhdCBpcyBkaXJ0eSBmcm9tIHRoZSBvcGVuZWQgZWRpdG9ycyBsaW1pdFxuXHRcdFx0aWYgKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLnBhcnRPcHRpb25zLmxpbWl0Py5leGNsdWRlRGlydHkgJiYgKChlZGl0b3IuaXNEaXJ0eSgpICYmICFlZGl0b3IuaXNTYXZpbmcoKSkgfHwgZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuU2NyYXRjaHBhZCkpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gbm90IGRpcnR5IGVkaXRvcnMgKHVubGVzcyBpbiB0aGUgcHJvY2VzcyBvZiBzYXZpbmcpIG9yIHNjcmF0Y2hwYWRzXG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0aWYgKGxpbWl0ID49IG1vc3RSZWNlbnRFZGl0b3JzQ291bnRpbmdGb3JMaW1pdC5sZW5ndGgpIHtcblx0XHRcdHJldHVybjsgLy8gb25seSBpZiBvcGVuZWQgZWRpdG9ycyBleGNlZWQgc2V0dGluZyBhbmQgaXMgdmFsaWQgYW5kIGVuYWJsZWRcblx0XHR9XG5cblx0XHQvLyBFeHRyYWN0IGxlYXN0IHJlY2VudGx5IHVzZWQgZWRpdG9ycyB0aGF0IGNhbiBiZSBjbG9zZWRcblx0XHRjb25zdCBsZWFzdFJlY2VudGx5Q2xvc2FibGVFZGl0b3JzID0gbW9zdFJlY2VudEVkaXRvcnNDb3VudGluZ0ZvckxpbWl0LnJldmVyc2UoKS5maWx0ZXIoKHsgZWRpdG9yLCBncm91cElkIH0pID0+IHtcblx0XHRcdGlmICgoZWRpdG9yLmlzRGlydHkoKSAmJiAhZWRpdG9yLmlzU2F2aW5nKCkpIHx8IGVkaXRvci5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlNjcmF0Y2hwYWQpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gbm90IGRpcnR5IGVkaXRvcnMgKHVubGVzcyBpbiB0aGUgcHJvY2VzcyBvZiBzYXZpbmcpIG9yIHNjcmF0Y2hwYWRzXG5cdFx0XHR9XG5cblx0XHRcdGlmIChleGNsdWRlICYmIGVkaXRvciA9PT0gZXhjbHVkZS5lZGl0b3IgJiYgZ3JvdXBJZCA9PT0gZXhjbHVkZS5ncm91cElkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gbmV2ZXIgdGhlIGVkaXRvciB0aGF0IHNob3VsZCBiZSBleGNsdWRlZFxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ2V0R3JvdXAoZ3JvdXBJZCk/LmlzU3RpY2t5KGVkaXRvcikpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBuZXZlciBzdGlja3kgZWRpdG9yc1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdC8vIENsb3NlIGVkaXRvcnMgdW50aWwgd2UgcmVhY2hlZCB0aGUgbGltaXQgYWdhaW5cblx0XHRsZXQgZWRpdG9yc1RvQ2xvc2VDb3VudCA9IG1vc3RSZWNlbnRFZGl0b3JzQ291bnRpbmdGb3JMaW1pdC5sZW5ndGggLSBsaW1pdDtcblx0XHRjb25zdCBtYXBHcm91cFRvRWRpdG9yc1RvQ2xvc2UgPSBuZXcgTWFwPEdyb3VwSWRlbnRpZmllciwgRWRpdG9ySW5wdXRbXT4oKTtcblx0XHRmb3IgKGNvbnN0IHsgZ3JvdXBJZCwgZWRpdG9yIH0gb2YgbGVhc3RSZWNlbnRseUNsb3NhYmxlRWRpdG9ycykge1xuXHRcdFx0bGV0IGVkaXRvcnNJbkdyb3VwVG9DbG9zZSA9IG1hcEdyb3VwVG9FZGl0b3JzVG9DbG9zZS5nZXQoZ3JvdXBJZCk7XG5cdFx0XHRpZiAoIWVkaXRvcnNJbkdyb3VwVG9DbG9zZSkge1xuXHRcdFx0XHRlZGl0b3JzSW5Hcm91cFRvQ2xvc2UgPSBbXTtcblx0XHRcdFx0bWFwR3JvdXBUb0VkaXRvcnNUb0Nsb3NlLnNldChncm91cElkLCBlZGl0b3JzSW5Hcm91cFRvQ2xvc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRlZGl0b3JzSW5Hcm91cFRvQ2xvc2UucHVzaChlZGl0b3IpO1xuXHRcdFx0ZWRpdG9yc1RvQ2xvc2VDb3VudC0tO1xuXG5cdFx0XHRpZiAoZWRpdG9yc1RvQ2xvc2VDb3VudCA9PT0gMCkge1xuXHRcdFx0XHRicmVhazsgLy8gbGltaXQgcmVhY2hlZFxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW2dyb3VwSWQsIGVkaXRvcnNdIG9mIG1hcEdyb3VwVG9FZGl0b3JzVG9DbG9zZSkge1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5nZXRHcm91cChncm91cElkKTtcblx0XHRcdGlmIChncm91cCkge1xuXHRcdFx0XHRhd2FpdCBncm91cC5jbG9zZUVkaXRvcnMoZWRpdG9ycywgeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2F2ZVN0YXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzU2NvcGVkKSB7XG5cdFx0XHRyZXR1cm47IC8vIGRvIG5vdCBwZXJzaXN0IHN0YXRlIHdoZW4gc2NvcGVkXG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubW9zdFJlY2VudEVkaXRvcnNNYXAuaXNFbXB0eSgpKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShFZGl0b3JzT2JzZXJ2ZXIuU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEVkaXRvcnNPYnNlcnZlci5TVE9SQUdFX0tFWSwgSlNPTi5zdHJpbmdpZnkodGhpcy5zZXJpYWxpemUoKSksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXJpYWxpemUoKTogSVNlcmlhbGl6ZWRFZGl0b3JzTGlzdCB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpO1xuXG5cdFx0Y29uc3QgZW50cmllcyA9IFsuLi50aGlzLm1vc3RSZWNlbnRFZGl0b3JzTWFwLnZhbHVlcygpXTtcblx0XHRjb25zdCBtYXBHcm91cFRvU2VyaWFsaXphYmxlRWRpdG9yc09mR3JvdXAgPSBuZXcgTWFwPElFZGl0b3JHcm91cCwgRWRpdG9ySW5wdXRbXT4oKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRlbnRyaWVzOiBjb2FsZXNjZShlbnRyaWVzLm1hcCgoeyBlZGl0b3IsIGdyb3VwSWQgfSkgPT4ge1xuXG5cdFx0XHRcdC8vIEZpbmQgZ3JvdXAgZm9yIGVudHJ5XG5cdFx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ2V0R3JvdXAoZ3JvdXBJZCk7XG5cdFx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRmluZCBzZXJpYWxpemFibGUgZWRpdG9ycyBvZiBncm91cFxuXHRcdFx0XHRsZXQgc2VyaWFsaXphYmxlRWRpdG9yc09mR3JvdXAgPSBtYXBHcm91cFRvU2VyaWFsaXphYmxlRWRpdG9yc09mR3JvdXAuZ2V0KGdyb3VwKTtcblx0XHRcdFx0aWYgKCFzZXJpYWxpemFibGVFZGl0b3JzT2ZHcm91cCkge1xuXHRcdFx0XHRcdHNlcmlhbGl6YWJsZUVkaXRvcnNPZkdyb3VwID0gZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkuZmlsdGVyKGVkaXRvciA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBlZGl0b3JTZXJpYWxpemVyID0gcmVnaXN0cnkuZ2V0RWRpdG9yU2VyaWFsaXplcihlZGl0b3IpO1xuXG5cdFx0XHRcdFx0XHRyZXR1cm4gZWRpdG9yU2VyaWFsaXplcj8uY2FuU2VyaWFsaXplKGVkaXRvcik7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0bWFwR3JvdXBUb1NlcmlhbGl6YWJsZUVkaXRvcnNPZkdyb3VwLnNldChncm91cCwgc2VyaWFsaXphYmxlRWRpdG9yc09mR3JvdXApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gT25seSBzdG9yZSB0aGUgaW5kZXggb2YgdGhlIGVkaXRvciBvZiB0aGF0IGdyb3VwXG5cdFx0XHRcdC8vIHdoaWNoIGNhbiBiZSB1bmRlZmluZWQgaWYgdGhlIGVkaXRvciBpcyBub3Qgc2VyaWFsaXphYmxlXG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gc2VyaWFsaXphYmxlRWRpdG9yc09mR3JvdXAuaW5kZXhPZihlZGl0b3IpO1xuXHRcdFx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7IGdyb3VwSWQsIGluZGV4IH07XG5cdFx0XHR9KSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsb2FkU3RhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyID09PSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5tYWluUGFydCB8fCB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lciA9PT0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UpIHtcblx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLndoZW5SZWFkeTtcblx0XHR9XG5cblx0XHQvLyBQcmV2aW91cyBzdGF0ZTogTG9hZCBlZGl0b3JzIG1hcCBmcm9tIHBlcnNpc3RlZCBzdGF0ZVxuXHRcdC8vIHVubGVzcyB3ZSBhcmUgcnVubmluZyBpbiBzY29wZWQgbW9kZVxuXHRcdGxldCBoYXNSZXN0b3JhYmxlU3RhdGUgPSBmYWxzZTtcblx0XHRpZiAoIXRoaXMuaXNTY29wZWQpIHtcblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChFZGl0b3JzT2JzZXJ2ZXIuU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0aWYgKHNlcmlhbGl6ZWQpIHtcblx0XHRcdFx0aGFzUmVzdG9yYWJsZVN0YXRlID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5kZXNlcmlhbGl6ZShKU09OLnBhcnNlKHNlcmlhbGl6ZWQpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBObyBwcmV2aW91cyBzdGF0ZTogYmVzdCB3ZSBjYW4gZG8gaXMgYWRkIGVhY2ggZWRpdG9yXG5cdFx0Ly8gZnJvbSBvbGRlc3QgdG8gbW9zdCByZWNlbnRseSB1c2VkIGVkaXRvciBncm91cFxuXHRcdGlmICghaGFzUmVzdG9yYWJsZVN0YXRlKSB7XG5cdFx0XHRjb25zdCBncm91cHMgPSB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IGdyb3Vwcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRjb25zdCBncm91cCA9IGdyb3Vwc1tpXTtcblx0XHRcdFx0Y29uc3QgZ3JvdXBFZGl0b3JzTXJ1ID0gZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gZ3JvdXBFZGl0b3JzTXJ1Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdFx0dGhpcy5hZGRNb3N0UmVjZW50RWRpdG9yKGdyb3VwLCBncm91cEVkaXRvcnNNcnVbaV0sIHRydWUgLyogZW5mb3JjZSBhcyBhY3RpdmUgdG8gcHJlc2VydmUgb3JkZXIgKi8sIHRydWUgLyogaXMgbmV3ICovKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEVuc3VyZSB3ZSBsaXN0ZW4gb24gZ3JvdXAgY2hhbmdlcyBmb3IgdGhvc2UgdGhhdCBleGlzdCBvbiBzdGFydHVwXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5ncm91cHMpIHtcblx0XHRcdHRoaXMucmVnaXN0ZXJHcm91cExpc3RlbmVycyhncm91cCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkZXNlcmlhbGl6ZShzZXJpYWxpemVkOiBJU2VyaWFsaXplZEVkaXRvcnNMaXN0KTogdm9pZCB7XG5cdFx0Y29uc3QgbWFwVmFsdWVzOiBbSUVkaXRvcklkZW50aWZpZXIsIElFZGl0b3JJZGVudGlmaWVyXVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHsgZ3JvdXBJZCwgaW5kZXggfSBvZiBzZXJpYWxpemVkLmVudHJpZXMpIHtcblxuXHRcdFx0Ly8gRmluZCBncm91cCBmb3IgZW50cnlcblx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ2V0R3JvdXAoZ3JvdXBJZCk7XG5cdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGaW5kIGVkaXRvciBmb3IgZW50cnlcblx0XHRcdGNvbnN0IGVkaXRvciA9IGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoaW5kZXgpO1xuXHRcdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1ha2Ugc3VyZSBrZXkgaXMgcmVnaXN0ZXJlZCBhcyB3ZWxsXG5cdFx0XHRjb25zdCBlZGl0b3JJZGVudGlmaWVyID0gdGhpcy5lbnN1cmVLZXkoZ3JvdXAsIGVkaXRvcik7XG5cdFx0XHRtYXBWYWx1ZXMucHVzaChbZWRpdG9ySWRlbnRpZmllciwgZWRpdG9ySWRlbnRpZmllcl0pO1xuXG5cdFx0XHQvLyBVcGRhdGUgaW4gcmVzb3VyY2UgbWFwXG5cdFx0XHR0aGlzLnVwZGF0ZUVkaXRvclJlc291cmNlc01hcChlZGl0b3IsIHRydWUpO1xuXHRcdH1cblxuXHRcdC8vIEZpbGwgbWFwIHdpdGggZGVzZXJpYWxpemVkIHZhbHVlc1xuXHRcdHRoaXMubW9zdFJlY2VudEVkaXRvcnNNYXAuZnJvbUpTT04obWFwVmFsdWVzKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFxRSxrQkFBaUQsY0FBYyxzQkFBc0IsK0JBQStCO0FBRXpMLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsU0FBUyxZQUFZLHVCQUF1QjtBQUNyRCxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFTLHNCQUFvQyxtQkFBMkM7QUFDeEYsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXLE9BQU8sbUJBQW1CO0FBQzlDLFNBQVMsY0FBYztBQXNCaEIsSUFBTSxrQkFBTixjQUE4QixXQUFXO0FBQUEsRUE4Qy9DLFlBQ0MsdUJBQzhCLG9CQUNJLGdCQUNqQztBQUNELFVBQU07QUFId0I7QUFDSTtBQTdDbkMsU0FBaUIsU0FBUyxvQkFBSSxJQUEwRDtBQUN4RixTQUFpQix1QkFBdUIsSUFBSSxVQUFnRDtBQUM1RixTQUFpQiw0QkFBNEIsSUFBSSxZQUFx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LHFCQUFxQjtBQUN6QixRQUFJLENBQUMsS0FBSyxVQUFVO0FBQ25CLFlBQU0sYUFBYSxLQUFLLGVBQWUsSUFBSSxnQkFBZ0IsYUFBYSxhQUFhLFNBQVM7QUFDOUYsVUFBSSxZQUFZO0FBQ2YsNkJBQXFCO0FBQ3JCLGFBQUssWUFBWSxLQUFLLE1BQU0sVUFBVSxDQUFDO0FBQUEsTUFDeEM7QUFBQSxJQUNEO0FBSUEsUUFBSSxDQUFDLG9CQUFvQjtBQUN4QixZQUFNLFNBQVMsS0FBSyxzQkFBc0IsVUFBVSxZQUFZLG9CQUFvQjtBQUNwRixlQUFTLElBQUksT0FBTyxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDNUMsY0FBTSxRQUFRLE9BQU8sQ0FBQztBQUN0QixjQUFNLGtCQUFrQixNQUFNLFdBQVcsYUFBYSxvQkFBb0I7QUFDMUUsaUJBQVNDLEtBQUksZ0JBQWdCLFNBQVMsR0FBR0EsTUFBSyxHQUFHQSxNQUFLO0FBQ3JELGVBQUs7QUFBQSxZQUFvQjtBQUFBLFlBQU8sZ0JBQWdCQSxFQUFDO0FBQUEsWUFBRztBQUFBLFlBQWdEO0FBQUE7QUFBQSxVQUFpQjtBQUFBLFFBQ3RIO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxlQUFXLFNBQVMsS0FBSyxzQkFBc0IsUUFBUTtBQUN0RCxXQUFLLHVCQUF1QixLQUFLO0FBQUEsSUFDbEM7QUFBQSxFQUNEO0FBQUEsRUFFUSxZQUFZLFlBQTBDO0FBQzdELFVBQU0sWUFBc0QsQ0FBQztBQUU3RCxlQUFXLEVBQUUsU0FBUyxNQUFNLEtBQUssV0FBVyxTQUFTO0FBR3BELFlBQU0sUUFBUSxLQUFLLHNCQUFzQixTQUFTLE9BQU87QUFDekQsVUFBSSxDQUFDLE9BQU87QUFDWDtBQUFBLE1BQ0Q7QUFHQSxZQUFNLFNBQVMsTUFBTSxpQkFBaUIsS0FBSztBQUMzQyxVQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsTUFDRDtBQUdBLFlBQU0sbUJBQW1CLEtBQUssVUFBVSxPQUFPLE1BQU07QUFDckQsZ0JBQVUsS0FBSyxDQUFDLGtCQUFrQixnQkFBZ0IsQ0FBQztBQUduRCxXQUFLLHlCQUF5QixRQUFRLElBQUk7QUFBQSxJQUMzQztBQUdBLFNBQUsscUJBQXFCLFNBQVMsU0FBUztBQUFBLEVBQzdDO0FBQ0Q7QUF2ZWEsZ0JBRVksY0FBYztBQUYxQixrQkFBTjtBQUFBLEVBZ0RKO0FBQUEsRUFDQTtBQUFBLEdBakRVOyIsCiAgIm5hbWVzIjogWyJlZGl0b3IiLCAiaSJdCn0K
