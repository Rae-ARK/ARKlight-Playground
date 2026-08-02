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
import { diffSets } from "../../../base/common/collections.js";
import { Emitter } from "../../../base/common/event.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { MainContext, TabInputKind, TabModelOperationKind } from "./extHost.protocol.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import * as typeConverters from "./extHostTypeConverters.js";
import { ChatEditorTabInput, CustomEditorTabInput, InteractiveWindowInput, NotebookDiffEditorTabInput, NotebookEditorTabInput, TerminalEditorTabInput, TextDiffTabInput, TextMergeTabInput, TextTabInput, WebviewEditorTabInput, TextMultiDiffTabInput } from "./extHostTypes.js";
const IExtHostEditorTabs = createDecorator("IExtHostEditorTabs");
class ExtHostEditorTab {
  constructor(dto, parentGroup, activeTabIdGetter) {
    this._activeTabIdGetter = activeTabIdGetter;
    this._parentGroup = parentGroup;
    this.acceptDtoUpdate(dto);
  }
  get apiObject() {
    if (!this._apiObject) {
      const that = this;
      const obj = {
        get isActive() {
          return that._dto.id === that._activeTabIdGetter();
        },
        get label() {
          return that._dto.label;
        },
        get input() {
          return that._input;
        },
        get isDirty() {
          return that._dto.isDirty;
        },
        get isPinned() {
          return that._dto.isPinned;
        },
        get isPreview() {
          return that._dto.isPreview;
        },
        get group() {
          return that._parentGroup.apiObject;
        }
      };
      this._apiObject = Object.freeze(obj);
    }
    return this._apiObject;
  }
  get tabId() {
    return this._dto.id;
  }
  acceptDtoUpdate(dto) {
    this._dto = dto;
    this._input = this._initInput();
  }
  _initInput() {
    switch (this._dto.input.kind) {
      case TabInputKind.TextInput:
        return new TextTabInput(URI.revive(this._dto.input.uri));
      case TabInputKind.TextDiffInput:
        return new TextDiffTabInput(URI.revive(this._dto.input.original), URI.revive(this._dto.input.modified));
      case TabInputKind.TextMergeInput:
        return new TextMergeTabInput(URI.revive(this._dto.input.base), URI.revive(this._dto.input.input1), URI.revive(this._dto.input.input2), URI.revive(this._dto.input.result));
      case TabInputKind.CustomEditorInput:
        return new CustomEditorTabInput(URI.revive(this._dto.input.uri), this._dto.input.viewType);
      case TabInputKind.WebviewEditorInput:
        return new WebviewEditorTabInput(this._dto.input.viewType);
      case TabInputKind.NotebookInput:
        return new NotebookEditorTabInput(URI.revive(this._dto.input.uri), this._dto.input.notebookType);
      case TabInputKind.NotebookDiffInput:
        return new NotebookDiffEditorTabInput(URI.revive(this._dto.input.original), URI.revive(this._dto.input.modified), this._dto.input.notebookType);
      case TabInputKind.TerminalEditorInput:
        return new TerminalEditorTabInput();
      case TabInputKind.InteractiveEditorInput:
        return new InteractiveWindowInput(URI.revive(this._dto.input.uri), URI.revive(this._dto.input.inputBoxUri));
      case TabInputKind.ChatEditorInput:
        return new ChatEditorTabInput();
      case TabInputKind.MultiDiffEditorInput:
        return new TextMultiDiffTabInput(this._dto.input.diffEditors.map((diff) => new TextDiffTabInput(URI.revive(diff.original), URI.revive(diff.modified))));
      default:
        return void 0;
    }
  }
}
class ExtHostEditorTabGroup {
  constructor(dto, activeGroupIdGetter) {
    this._tabs = [];
    this._activeTabId = "";
    this._dto = dto;
    this._activeGroupIdGetter = activeGroupIdGetter;
    this._reconcileTabs(dto);
  }
  get apiObject() {
    if (!this._apiObject) {
      const that = this;
      const obj = {
        get isActive() {
          return that._dto.groupId === that._activeGroupIdGetter();
        },
        get viewColumn() {
          return typeConverters.ViewColumn.to(that._dto.viewColumn);
        },
        get activeTab() {
          return that._tabs.find((tab) => tab.tabId === that._activeTabId)?.apiObject;
        },
        get tabs() {
          return Object.freeze(that._tabs.map((tab) => tab.apiObject));
        }
      };
      this._apiObject = Object.freeze(obj);
    }
    return this._apiObject;
  }
  get groupId() {
    return this._dto.groupId;
  }
  get tabs() {
    return this._tabs;
  }
  acceptGroupDtoUpdate(dto) {
    this._dto = dto;
  }
  /**
   * Accepts a full group dto during a complete tab-model resync, reusing the
   * existing {@link ExtHostEditorTab} instances for tabs that still exist so
   * their (and this group's) frozen `apiObject` keeps a stable identity.
   * Extensions routinely key `Map`/`WeakMap`/`Set` collections by these
   * objects, so recreating them on every resync would break those lookups and
   * leak whatever they retain.
   */
  acceptModelUpdate(dto) {
    this._dto = dto;
    this._reconcileTabs(dto);
  }
  _reconcileTabs(dto) {
    const existingTabsById = /* @__PURE__ */ new Map();
    for (const tab of this._tabs) {
      existingTabsById.set(tab.tabId, tab);
    }
    this._activeTabId = "";
    this._tabs = dto.tabs.map((tabDto) => {
      if (tabDto.isActive) {
        this._activeTabId = tabDto.id;
      }
      const existing = existingTabsById.get(tabDto.id);
      if (existing) {
        existing.acceptDtoUpdate(tabDto);
        return existing;
      }
      return new ExtHostEditorTab(tabDto, this, () => this.activeTabId());
    });
  }
  acceptTabOperation(operation) {
    if (operation.kind === TabModelOperationKind.TAB_OPEN) {
      const tab2 = new ExtHostEditorTab(operation.tabDto, this, () => this.activeTabId());
      this._tabs.splice(operation.index, 0, tab2);
      if (operation.tabDto.isActive) {
        this._activeTabId = tab2.tabId;
      }
      return tab2;
    } else if (operation.kind === TabModelOperationKind.TAB_CLOSE) {
      const tab2 = this._tabs.splice(operation.index, 1)[0];
      if (!tab2) {
        throw new Error(`Tab close updated received for index ${operation.index} which does not exist`);
      }
      if (tab2.tabId === this._activeTabId) {
        this._activeTabId = "";
      }
      return tab2;
    } else if (operation.kind === TabModelOperationKind.TAB_MOVE) {
      if (operation.oldIndex === void 0) {
        throw new Error("Invalid old index on move IPC");
      }
      const tab2 = this._tabs.splice(operation.oldIndex, 1)[0];
      if (!tab2) {
        throw new Error(`Tab move updated received for index ${operation.oldIndex} which does not exist`);
      }
      this._tabs.splice(operation.index, 0, tab2);
      return tab2;
    }
    const tab = this._tabs.find((extHostTab) => extHostTab.tabId === operation.tabDto.id);
    if (!tab) {
      throw new Error("INVALID tab");
    }
    if (operation.tabDto.isActive) {
      this._activeTabId = operation.tabDto.id;
    } else if (this._activeTabId === operation.tabDto.id && !operation.tabDto.isActive) {
      this._activeTabId = "";
    }
    tab.acceptDtoUpdate(operation.tabDto);
    return tab;
  }
  // Not a getter since it must be a function to be used as a callback for the tabs
  activeTabId() {
    return this._activeTabId;
  }
}
let ExtHostEditorTabs = class {
  constructor(extHostRpc) {
    this._onDidChangeTabs = new Emitter();
    this._onDidChangeTabGroups = new Emitter();
    this._extHostTabGroups = [];
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadEditorTabs);
  }
  get tabGroups() {
    if (!this._apiObject) {
      const that = this;
      const obj = {
        // never changes -> simple value
        onDidChangeTabGroups: that._onDidChangeTabGroups.event,
        onDidChangeTabs: that._onDidChangeTabs.event,
        // dynamic -> getters
        get all() {
          return Object.freeze(that._extHostTabGroups.map((group) => group.apiObject));
        },
        get activeTabGroup() {
          const activeTabGroupId = that._activeGroupId;
          const activeTabGroup = assertReturnsDefined(that._extHostTabGroups.find((candidate) => candidate.groupId === activeTabGroupId)?.apiObject);
          return activeTabGroup;
        },
        close: async (tabOrTabGroup, preserveFocus) => {
          const tabsOrTabGroups = Array.isArray(tabOrTabGroup) ? tabOrTabGroup : [tabOrTabGroup];
          if (!tabsOrTabGroups.length) {
            return true;
          }
          if (isTabGroup(tabsOrTabGroups[0])) {
            return this._closeGroups(tabsOrTabGroups, preserveFocus);
          } else {
            return this._closeTabs(tabsOrTabGroups, preserveFocus);
          }
        }
        // move: async (tab: vscode.Tab, viewColumn: ViewColumn, index: number, preserveFocus?: boolean) => {
        // 	const extHostTab = this._findExtHostTabFromApi(tab);
        // 	if (!extHostTab) {
        // 		throw new Error('Invalid tab');
        // 	}
        // 	this._proxy.$moveTab(extHostTab.tabId, index, typeConverters.ViewColumn.from(viewColumn), preserveFocus);
        // 	return;
        // }
      };
      this._apiObject = Object.freeze(obj);
    }
    return this._apiObject;
  }
  $acceptEditorTabModel(tabGroups) {
    const groupIdsBefore = new Set(this._extHostTabGroups.map((group) => group.groupId));
    const groupIdsAfter = new Set(tabGroups.map((dto) => dto.groupId));
    const diff = diffSets(groupIdsBefore, groupIdsAfter);
    const closed = this._extHostTabGroups.filter((group) => diff.removed.includes(group.groupId)).map((group) => group.apiObject);
    const opened = [];
    const changed = [];
    const existingGroupsById = /* @__PURE__ */ new Map();
    for (const group of this._extHostTabGroups) {
      existingGroupsById.set(group.groupId, group);
    }
    this._extHostTabGroups = tabGroups.map((tabGroup) => {
      const existing = existingGroupsById.get(tabGroup.groupId);
      if (existing) {
        existing.acceptModelUpdate(tabGroup);
        changed.push(existing.apiObject);
        return existing;
      }
      const group = new ExtHostEditorTabGroup(tabGroup, () => this._activeGroupId);
      opened.push(group.apiObject);
      return group;
    });
    const activeTabGroupId = assertReturnsDefined(tabGroups.find((group) => group.isActive === true)?.groupId);
    if (activeTabGroupId !== void 0 && this._activeGroupId !== activeTabGroupId) {
      this._activeGroupId = activeTabGroupId;
    }
    this._onDidChangeTabGroups.fire(Object.freeze({ opened, closed, changed }));
  }
  $acceptTabGroupUpdate(groupDto) {
    const group = this._extHostTabGroups.find((group2) => group2.groupId === groupDto.groupId);
    if (!group) {
      throw new Error("Update Group IPC call received before group creation.");
    }
    group.acceptGroupDtoUpdate(groupDto);
    if (groupDto.isActive) {
      this._activeGroupId = groupDto.groupId;
    }
    this._onDidChangeTabGroups.fire(Object.freeze({ changed: [group.apiObject], opened: [], closed: [] }));
  }
  $acceptTabOperation(operation) {
    const group = this._extHostTabGroups.find((group2) => group2.groupId === operation.groupId);
    if (!group) {
      throw new Error("Update Tabs IPC call received before group creation.");
    }
    const tab = group.acceptTabOperation(operation);
    switch (operation.kind) {
      case TabModelOperationKind.TAB_OPEN:
        this._onDidChangeTabs.fire(Object.freeze({
          opened: [tab.apiObject],
          closed: [],
          changed: []
        }));
        return;
      case TabModelOperationKind.TAB_CLOSE:
        this._onDidChangeTabs.fire(Object.freeze({
          opened: [],
          closed: [tab.apiObject],
          changed: []
        }));
        return;
      case TabModelOperationKind.TAB_MOVE:
      case TabModelOperationKind.TAB_UPDATE:
        this._onDidChangeTabs.fire(Object.freeze({
          opened: [],
          closed: [],
          changed: [tab.apiObject]
        }));
        return;
    }
  }
  _findExtHostTabFromApi(apiTab) {
    for (const group of this._extHostTabGroups) {
      for (const tab of group.tabs) {
        if (tab.apiObject === apiTab) {
          return tab;
        }
      }
    }
    return;
  }
  _findExtHostTabGroupFromApi(apiTabGroup) {
    return this._extHostTabGroups.find((candidate) => candidate.apiObject === apiTabGroup);
  }
  async _closeTabs(tabs, preserveFocus) {
    const extHostTabIds = [];
    for (const tab of tabs) {
      const extHostTab = this._findExtHostTabFromApi(tab);
      if (!extHostTab) {
        throw new Error("Tab close: Invalid tab not found!");
      }
      extHostTabIds.push(extHostTab.tabId);
    }
    return this._proxy.$closeTab(extHostTabIds, preserveFocus);
  }
  async _closeGroups(groups, preserverFoucs) {
    const extHostGroupIds = [];
    for (const group of groups) {
      const extHostGroup = this._findExtHostTabGroupFromApi(group);
      if (!extHostGroup) {
        throw new Error("Group close: Invalid group not found!");
      }
      extHostGroupIds.push(extHostGroup.groupId);
    }
    return this._proxy.$closeGroup(extHostGroupIds, preserverFoucs);
  }
};
ExtHostEditorTabs = __decorateClass([
  __decorateParam(0, IExtHostRpcService)
], ExtHostEditorTabs);
function isTabGroup(obj) {
  const tabGroup = obj;
  if (tabGroup.tabs !== void 0) {
    return true;
  }
  return false;
}
export {
  ExtHostEditorTabs,
  IExtHostEditorTabs
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RFZGl0b3JUYWJzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlmZlNldHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yVGFiRHRvLCBJRWRpdG9yVGFiR3JvdXBEdG8sIElFeHRIb3N0RWRpdG9yVGFic1NoYXBlLCBNYWluQ29udGV4dCwgTWFpblRocmVhZEVkaXRvclRhYnNTaGFwZSwgVGFiSW5wdXRLaW5kLCBUYWJNb2RlbE9wZXJhdGlvbktpbmQsIFRhYk9wZXJhdGlvbiB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RScGNTZXJ2aWNlLmpzJztcbmltcG9ydCAqIGFzIHR5cGVDb252ZXJ0ZXJzIGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IENoYXRFZGl0b3JUYWJJbnB1dCwgQ3VzdG9tRWRpdG9yVGFiSW5wdXQsIEludGVyYWN0aXZlV2luZG93SW5wdXQsIE5vdGVib29rRGlmZkVkaXRvclRhYklucHV0LCBOb3RlYm9va0VkaXRvclRhYklucHV0LCBUZXJtaW5hbEVkaXRvclRhYklucHV0LCBUZXh0RGlmZlRhYklucHV0LCBUZXh0TWVyZ2VUYWJJbnB1dCwgVGV4dFRhYklucHV0LCBXZWJ2aWV3RWRpdG9yVGFiSW5wdXQsIFRleHRNdWx0aURpZmZUYWJJbnB1dCB9IGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dEhvc3RFZGl0b3JUYWJzIGV4dGVuZHMgSUV4dEhvc3RFZGl0b3JUYWJzU2hhcGUge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHRhYkdyb3VwczogdnNjb2RlLlRhYkdyb3Vwcztcbn1cblxuZXhwb3J0IGNvbnN0IElFeHRIb3N0RWRpdG9yVGFicyA9IGNyZWF0ZURlY29yYXRvcjxJRXh0SG9zdEVkaXRvclRhYnM+KCdJRXh0SG9zdEVkaXRvclRhYnMnKTtcblxudHlwZSBBbnlUYWJJbnB1dCA9IFRleHRUYWJJbnB1dCB8IFRleHREaWZmVGFiSW5wdXQgfCBUZXh0TXVsdGlEaWZmVGFiSW5wdXQgfCBDdXN0b21FZGl0b3JUYWJJbnB1dCB8IE5vdGVib29rRWRpdG9yVGFiSW5wdXQgfCBOb3RlYm9va0RpZmZFZGl0b3JUYWJJbnB1dCB8IFdlYnZpZXdFZGl0b3JUYWJJbnB1dCB8IFRlcm1pbmFsRWRpdG9yVGFiSW5wdXQgfCBJbnRlcmFjdGl2ZVdpbmRvd0lucHV0IHwgQ2hhdEVkaXRvclRhYklucHV0O1xuXG5jbGFzcyBFeHRIb3N0RWRpdG9yVGFiIHtcblx0cHJpdmF0ZSBfYXBpT2JqZWN0OiB2c2NvZGUuVGFiIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kdG8hOiBJRWRpdG9yVGFiRHRvO1xuXHRwcml2YXRlIF9pbnB1dDogQW55VGFiSW5wdXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3BhcmVudEdyb3VwOiBFeHRIb3N0RWRpdG9yVGFiR3JvdXA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVRhYklkR2V0dGVyOiAoKSA9PiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IoZHRvOiBJRWRpdG9yVGFiRHRvLCBwYXJlbnRHcm91cDogRXh0SG9zdEVkaXRvclRhYkdyb3VwLCBhY3RpdmVUYWJJZEdldHRlcjogKCkgPT4gc3RyaW5nKSB7XG5cdFx0dGhpcy5fYWN0aXZlVGFiSWRHZXR0ZXIgPSBhY3RpdmVUYWJJZEdldHRlcjtcblx0XHR0aGlzLl9wYXJlbnRHcm91cCA9IHBhcmVudEdyb3VwO1xuXHRcdHRoaXMuYWNjZXB0RHRvVXBkYXRlKGR0byk7XG5cdH1cblxuXHRnZXQgYXBpT2JqZWN0KCk6IHZzY29kZS5UYWIge1xuXHRcdGlmICghdGhpcy5fYXBpT2JqZWN0KSB7XG5cdFx0XHQvLyBEb24ndCB3YW50IHRvIGxvc2UgcmVmZXJlbmNlIHRvIHBhcmVudCBgdGhpc2AgaW4gdGhlIGdldHRlcnNcblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0Y29uc3Qgb2JqOiB2c2NvZGUuVGFiID0ge1xuXHRcdFx0XHRnZXQgaXNBY3RpdmUoKSB7XG5cdFx0XHRcdFx0Ly8gV2UgdXNlIGEgZ2V0dGVyIGZ1bmN0aW9uIGhlcmUgdG8gYWx3YXlzIGVuc3VyZSBhdCBtb3N0IDEgYWN0aXZlIHRhYiBwZXIgZ3JvdXAgYW5kIHByZXZlbnQgaXRlcmF0aW9uIGZvciBiZWluZyByZXF1aXJlZFxuXHRcdFx0XHRcdHJldHVybiB0aGF0Ll9kdG8uaWQgPT09IHRoYXQuX2FjdGl2ZVRhYklkR2V0dGVyKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldCBsYWJlbCgpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhhdC5fZHRvLmxhYmVsO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgaW5wdXQoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoYXQuX2lucHV0O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgaXNEaXJ0eSgpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhhdC5fZHRvLmlzRGlydHk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldCBpc1Bpbm5lZCgpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhhdC5fZHRvLmlzUGlubmVkO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgaXNQcmV2aWV3KCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGF0Ll9kdG8uaXNQcmV2aWV3O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgZ3JvdXAoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoYXQuX3BhcmVudEdyb3VwLmFwaU9iamVjdDtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX2FwaU9iamVjdCA9IE9iamVjdC5mcmVlemU8dnNjb2RlLlRhYj4ob2JqKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2FwaU9iamVjdDtcblx0fVxuXG5cdGdldCB0YWJJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9kdG8uaWQ7XG5cdH1cblxuXHRhY2NlcHREdG9VcGRhdGUoZHRvOiBJRWRpdG9yVGFiRHRvKSB7XG5cdFx0dGhpcy5fZHRvID0gZHRvO1xuXHRcdHRoaXMuX2lucHV0ID0gdGhpcy5faW5pdElucHV0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9pbml0SW5wdXQoKSB7XG5cdFx0c3dpdGNoICh0aGlzLl9kdG8uaW5wdXQua2luZCkge1xuXHRcdFx0Y2FzZSBUYWJJbnB1dEtpbmQuVGV4dElucHV0OlxuXHRcdFx0XHRyZXR1cm4gbmV3IFRleHRUYWJJbnB1dChVUkkucmV2aXZlKHRoaXMuX2R0by5pbnB1dC51cmkpKTtcblx0XHRcdGNhc2UgVGFiSW5wdXRLaW5kLlRleHREaWZmSW5wdXQ6XG5cdFx0XHRcdHJldHVybiBuZXcgVGV4dERpZmZUYWJJbnB1dChVUkkucmV2aXZlKHRoaXMuX2R0by5pbnB1dC5vcmlnaW5hbCksIFVSSS5yZXZpdmUodGhpcy5fZHRvLmlucHV0Lm1vZGlmaWVkKSk7XG5cdFx0XHRjYXNlIFRhYklucHV0S2luZC5UZXh0TWVyZ2VJbnB1dDpcblx0XHRcdFx0cmV0dXJuIG5ldyBUZXh0TWVyZ2VUYWJJbnB1dChVUkkucmV2aXZlKHRoaXMuX2R0by5pbnB1dC5iYXNlKSwgVVJJLnJldml2ZSh0aGlzLl9kdG8uaW5wdXQuaW5wdXQxKSwgVVJJLnJldml2ZSh0aGlzLl9kdG8uaW5wdXQuaW5wdXQyKSwgVVJJLnJldml2ZSh0aGlzLl9kdG8uaW5wdXQucmVzdWx0KSk7XG5cdFx0XHRjYXNlIFRhYklucHV0S2luZC5DdXN0b21FZGl0b3JJbnB1dDpcblx0XHRcdFx0cmV0dXJuIG5ldyBDdXN0b21FZGl0b3JUYWJJbnB1dChVUkkucmV2aXZlKHRoaXMuX2R0by5pbnB1dC51cmkpLCB0aGlzLl9kdG8uaW5wdXQudmlld1R5cGUpO1xuXHRcdFx0Y2FzZSBUYWJJbnB1dEtpbmQuV2Vidmlld0VkaXRvcklucHV0OlxuXHRcdFx0XHRyZXR1cm4gbmV3IFdlYnZpZXdFZGl0b3JUYWJJbnB1dCh0aGlzLl9kdG8uaW5wdXQudmlld1R5cGUpO1xuXHRcdFx0Y2FzZSBUYWJJbnB1dEtpbmQuTm90ZWJvb2tJbnB1dDpcblx0XHRcdFx0cmV0dXJuIG5ldyBOb3RlYm9va0VkaXRvclRhYklucHV0KFVSSS5yZXZpdmUodGhpcy5fZHRvLmlucHV0LnVyaSksIHRoaXMuX2R0by5pbnB1dC5ub3RlYm9va1R5cGUpO1xuXHRcdFx0Y2FzZSBUYWJJbnB1dEtpbmQuTm90ZWJvb2tEaWZmSW5wdXQ6XG5cdFx0XHRcdHJldHVybiBuZXcgTm90ZWJvb2tEaWZmRWRpdG9yVGFiSW5wdXQoVVJJLnJldml2ZSh0aGlzLl9kdG8uaW5wdXQub3JpZ2luYWwpLCBVUkkucmV2aXZlKHRoaXMuX2R0by5pbnB1dC5tb2RpZmllZCksIHRoaXMuX2R0by5pbnB1dC5ub3RlYm9va1R5cGUpO1xuXHRcdFx0Y2FzZSBUYWJJbnB1dEtpbmQuVGVybWluYWxFZGl0b3JJbnB1dDpcblx0XHRcdFx0cmV0dXJuIG5ldyBUZXJtaW5hbEVkaXRvclRhYklucHV0KCk7XG5cdFx0XHRjYXNlIFRhYklucHV0S2luZC5JbnRlcmFjdGl2ZUVkaXRvcklucHV0OlxuXHRcdFx0XHRyZXR1cm4gbmV3IEludGVyYWN0aXZlV2luZG93SW5wdXQoVVJJLnJldml2ZSh0aGlzLl9kdG8uaW5wdXQudXJpKSwgVVJJLnJldml2ZSh0aGlzLl9kdG8uaW5wdXQuaW5wdXRCb3hVcmkpKTtcblx0XHRcdGNhc2UgVGFiSW5wdXRLaW5kLkNoYXRFZGl0b3JJbnB1dDpcblx0XHRcdFx0cmV0dXJuIG5ldyBDaGF0RWRpdG9yVGFiSW5wdXQoKTtcblx0XHRcdGNhc2UgVGFiSW5wdXRLaW5kLk11bHRpRGlmZkVkaXRvcklucHV0OlxuXHRcdFx0XHRyZXR1cm4gbmV3IFRleHRNdWx0aURpZmZUYWJJbnB1dCh0aGlzLl9kdG8uaW5wdXQuZGlmZkVkaXRvcnMubWFwKGRpZmYgPT4gbmV3IFRleHREaWZmVGFiSW5wdXQoVVJJLnJldml2ZShkaWZmLm9yaWdpbmFsKSwgVVJJLnJldml2ZShkaWZmLm1vZGlmaWVkKSkpKTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEV4dEhvc3RFZGl0b3JUYWJHcm91cCB7XG5cblx0cHJpdmF0ZSBfYXBpT2JqZWN0OiB2c2NvZGUuVGFiR3JvdXAgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2R0bzogSUVkaXRvclRhYkdyb3VwRHRvO1xuXHRwcml2YXRlIF90YWJzOiBFeHRIb3N0RWRpdG9yVGFiW10gPSBbXTtcblx0cHJpdmF0ZSBfYWN0aXZlVGFiSWQ6IHN0cmluZyA9ICcnO1xuXHRwcml2YXRlIF9hY3RpdmVHcm91cElkR2V0dGVyOiAoKSA9PiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoZHRvOiBJRWRpdG9yVGFiR3JvdXBEdG8sIGFjdGl2ZUdyb3VwSWRHZXR0ZXI6ICgpID0+IG51bWJlciB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2R0byA9IGR0bztcblx0XHR0aGlzLl9hY3RpdmVHcm91cElkR2V0dGVyID0gYWN0aXZlR3JvdXBJZEdldHRlcjtcblx0XHQvLyBDb25zdHJ1Y3QgYWxsIHRhYnMgZnJvbSB0aGUgZ2l2ZW4gZHRvXG5cdFx0dGhpcy5fcmVjb25jaWxlVGFicyhkdG8pO1xuXHR9XG5cblx0Z2V0IGFwaU9iamVjdCgpOiB2c2NvZGUuVGFiR3JvdXAge1xuXHRcdGlmICghdGhpcy5fYXBpT2JqZWN0KSB7XG5cdFx0XHQvLyBEb24ndCB3YW50IHRvIGxvc2UgcmVmZXJlbmNlIHRvIHBhcmVudCBgdGhpc2AgaW4gdGhlIGdldHRlcnNcblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0Y29uc3Qgb2JqOiB2c2NvZGUuVGFiR3JvdXAgPSB7XG5cdFx0XHRcdGdldCBpc0FjdGl2ZSgpIHtcblx0XHRcdFx0XHQvLyBXZSB1c2UgYSBnZXR0ZXIgZnVuY3Rpb24gaGVyZSB0byBhbHdheXMgZW5zdXJlIGF0IG1vc3QgMSBhY3RpdmUgZ3JvdXAgYW5kIHByZXZlbnQgaXRlcmF0aW9uIGZvciBiZWluZyByZXF1aXJlZFxuXHRcdFx0XHRcdHJldHVybiB0aGF0Ll9kdG8uZ3JvdXBJZCA9PT0gdGhhdC5fYWN0aXZlR3JvdXBJZEdldHRlcigpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgdmlld0NvbHVtbigpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHlwZUNvbnZlcnRlcnMuVmlld0NvbHVtbi50byh0aGF0Ll9kdG8udmlld0NvbHVtbik7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldCBhY3RpdmVUYWIoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoYXQuX3RhYnMuZmluZCh0YWIgPT4gdGFiLnRhYklkID09PSB0aGF0Ll9hY3RpdmVUYWJJZCk/LmFwaU9iamVjdDtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0IHRhYnMoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIE9iamVjdC5mcmVlemUodGhhdC5fdGFicy5tYXAodGFiID0+IHRhYi5hcGlPYmplY3QpKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX2FwaU9iamVjdCA9IE9iamVjdC5mcmVlemU8dnNjb2RlLlRhYkdyb3VwPihvYmopO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYXBpT2JqZWN0O1xuXHR9XG5cblx0Z2V0IGdyb3VwSWQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fZHRvLmdyb3VwSWQ7XG5cdH1cblxuXHRnZXQgdGFicygpOiBFeHRIb3N0RWRpdG9yVGFiW10ge1xuXHRcdHJldHVybiB0aGlzLl90YWJzO1xuXHR9XG5cblx0YWNjZXB0R3JvdXBEdG9VcGRhdGUoZHRvOiBJRWRpdG9yVGFiR3JvdXBEdG8pIHtcblx0XHR0aGlzLl9kdG8gPSBkdG87XG5cdH1cblxuXHQvKipcblx0ICogQWNjZXB0cyBhIGZ1bGwgZ3JvdXAgZHRvIGR1cmluZyBhIGNvbXBsZXRlIHRhYi1tb2RlbCByZXN5bmMsIHJldXNpbmcgdGhlXG5cdCAqIGV4aXN0aW5nIHtAbGluayBFeHRIb3N0RWRpdG9yVGFifSBpbnN0YW5jZXMgZm9yIHRhYnMgdGhhdCBzdGlsbCBleGlzdCBzb1xuXHQgKiB0aGVpciAoYW5kIHRoaXMgZ3JvdXAncykgZnJvemVuIGBhcGlPYmplY3RgIGtlZXBzIGEgc3RhYmxlIGlkZW50aXR5LlxuXHQgKiBFeHRlbnNpb25zIHJvdXRpbmVseSBrZXkgYE1hcGAvYFdlYWtNYXBgL2BTZXRgIGNvbGxlY3Rpb25zIGJ5IHRoZXNlXG5cdCAqIG9iamVjdHMsIHNvIHJlY3JlYXRpbmcgdGhlbSBvbiBldmVyeSByZXN5bmMgd291bGQgYnJlYWsgdGhvc2UgbG9va3VwcyBhbmRcblx0ICogbGVhayB3aGF0ZXZlciB0aGV5IHJldGFpbi5cblx0ICovXG5cdGFjY2VwdE1vZGVsVXBkYXRlKGR0bzogSUVkaXRvclRhYkdyb3VwRHRvKSB7XG5cdFx0dGhpcy5fZHRvID0gZHRvO1xuXHRcdHRoaXMuX3JlY29uY2lsZVRhYnMoZHRvKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlY29uY2lsZVRhYnMoZHRvOiBJRWRpdG9yVGFiR3JvdXBEdG8pIHtcblx0XHRjb25zdCBleGlzdGluZ1RhYnNCeUlkID0gbmV3IE1hcDxzdHJpbmcsIEV4dEhvc3RFZGl0b3JUYWI+KCk7XG5cdFx0Zm9yIChjb25zdCB0YWIgb2YgdGhpcy5fdGFicykge1xuXHRcdFx0ZXhpc3RpbmdUYWJzQnlJZC5zZXQodGFiLnRhYklkLCB0YWIpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2FjdGl2ZVRhYklkID0gJyc7XG5cdFx0dGhpcy5fdGFicyA9IGR0by50YWJzLm1hcCh0YWJEdG8gPT4ge1xuXHRcdFx0aWYgKHRhYkR0by5pc0FjdGl2ZSkge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVUYWJJZCA9IHRhYkR0by5pZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gZXhpc3RpbmdUYWJzQnlJZC5nZXQodGFiRHRvLmlkKTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRleGlzdGluZy5hY2NlcHREdG9VcGRhdGUodGFiRHRvKTtcblx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBFeHRIb3N0RWRpdG9yVGFiKHRhYkR0bywgdGhpcywgKCkgPT4gdGhpcy5hY3RpdmVUYWJJZCgpKTtcblx0XHR9KTtcblx0fVxuXG5cdGFjY2VwdFRhYk9wZXJhdGlvbihvcGVyYXRpb246IFRhYk9wZXJhdGlvbik6IEV4dEhvc3RFZGl0b3JUYWIge1xuXHRcdC8vIEluIHRoZSBvcGVuIGNhc2Ugd2UgYWRkIHRoZSB0YWIgdG8gdGhlIGdyb3VwXG5cdFx0aWYgKG9wZXJhdGlvbi5raW5kID09PSBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX09QRU4pIHtcblx0XHRcdGNvbnN0IHRhYiA9IG5ldyBFeHRIb3N0RWRpdG9yVGFiKG9wZXJhdGlvbi50YWJEdG8sIHRoaXMsICgpID0+IHRoaXMuYWN0aXZlVGFiSWQoKSk7XG5cdFx0XHQvLyBJbnNlcnQgdGFiIGF0IGVkaXRvciBpbmRleFxuXHRcdFx0dGhpcy5fdGFicy5zcGxpY2Uob3BlcmF0aW9uLmluZGV4LCAwLCB0YWIpO1xuXHRcdFx0aWYgKG9wZXJhdGlvbi50YWJEdG8uaXNBY3RpdmUpIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlVGFiSWQgPSB0YWIudGFiSWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGFiO1xuXHRcdH0gZWxzZSBpZiAob3BlcmF0aW9uLmtpbmQgPT09IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfQ0xPU0UpIHtcblx0XHRcdGNvbnN0IHRhYiA9IHRoaXMuX3RhYnMuc3BsaWNlKG9wZXJhdGlvbi5pbmRleCwgMSlbMF07XG5cdFx0XHRpZiAoIXRhYikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRhYiBjbG9zZSB1cGRhdGVkIHJlY2VpdmVkIGZvciBpbmRleCAke29wZXJhdGlvbi5pbmRleH0gd2hpY2ggZG9lcyBub3QgZXhpc3RgKTtcblx0XHRcdH1cblx0XHRcdGlmICh0YWIudGFiSWQgPT09IHRoaXMuX2FjdGl2ZVRhYklkKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVRhYklkID0gJyc7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGFiO1xuXHRcdH0gZWxzZSBpZiAob3BlcmF0aW9uLmtpbmQgPT09IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfTU9WRSkge1xuXHRcdFx0aWYgKG9wZXJhdGlvbi5vbGRJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBvbGQgaW5kZXggb24gbW92ZSBJUEMnKTtcblx0XHRcdH1cblx0XHRcdC8vIFNwbGljZSB0byByZW1vdmUgYXQgb2xkIGluZGV4IGFuZCBpbnNlcnQgYXQgbmV3IGluZGV4ID09PSBtb3ZpbmcgdGhlIHRhYlxuXHRcdFx0Y29uc3QgdGFiID0gdGhpcy5fdGFicy5zcGxpY2Uob3BlcmF0aW9uLm9sZEluZGV4LCAxKVswXTtcblx0XHRcdGlmICghdGFiKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVGFiIG1vdmUgdXBkYXRlZCByZWNlaXZlZCBmb3IgaW5kZXggJHtvcGVyYXRpb24ub2xkSW5kZXh9IHdoaWNoIGRvZXMgbm90IGV4aXN0YCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl90YWJzLnNwbGljZShvcGVyYXRpb24uaW5kZXgsIDAsIHRhYik7XG5cdFx0XHRyZXR1cm4gdGFiO1xuXHRcdH1cblx0XHRjb25zdCB0YWIgPSB0aGlzLl90YWJzLmZpbmQoZXh0SG9zdFRhYiA9PiBleHRIb3N0VGFiLnRhYklkID09PSBvcGVyYXRpb24udGFiRHRvLmlkKTtcblx0XHRpZiAoIXRhYikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJTlZBTElEIHRhYicpO1xuXHRcdH1cblx0XHRpZiAob3BlcmF0aW9uLnRhYkR0by5pc0FjdGl2ZSkge1xuXHRcdFx0dGhpcy5fYWN0aXZlVGFiSWQgPSBvcGVyYXRpb24udGFiRHRvLmlkO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fYWN0aXZlVGFiSWQgPT09IG9wZXJhdGlvbi50YWJEdG8uaWQgJiYgIW9wZXJhdGlvbi50YWJEdG8uaXNBY3RpdmUpIHtcblx0XHRcdC8vIEV2ZW50cyBhcmVuJ3QgZ3VhcmFudGVlZCB0byBiZSBpbiBvcmRlciBzbyBpZiB3ZSByZWNlaXZlIGEgZHRvIHRoYXQgbWF0Y2hlcyB0aGUgYWN0aXZlIHRhYiBpZFxuXHRcdFx0Ly8gYnV0IGlzbid0IGFjdGl2ZSB3ZSBtYXJrIHRoZSBhY3RpdmUgdGFiIGlkIGFzIGVtcHR5LiBUaGlzIHByZXZlbnQgb25EaWRBY3RpdmVUYWJDaGFuZ2UgZnJvbVxuXHRcdFx0Ly8gZmlyaW5nIGluY29ycmVjdGx5XG5cdFx0XHR0aGlzLl9hY3RpdmVUYWJJZCA9ICcnO1xuXHRcdH1cblx0XHR0YWIuYWNjZXB0RHRvVXBkYXRlKG9wZXJhdGlvbi50YWJEdG8pO1xuXHRcdHJldHVybiB0YWI7XG5cdH1cblxuXHQvLyBOb3QgYSBnZXR0ZXIgc2luY2UgaXQgbXVzdCBiZSBhIGZ1bmN0aW9uIHRvIGJlIHVzZWQgYXMgYSBjYWxsYmFjayBmb3IgdGhlIHRhYnNcblx0YWN0aXZlVGFiSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlVGFiSWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RFZGl0b3JUYWJzIGltcGxlbWVudHMgSUV4dEhvc3RFZGl0b3JUYWJzIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRhYnMgPSBuZXcgRW1pdHRlcjx2c2NvZGUuVGFiQ2hhbmdlRXZlbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVGFiR3JvdXBzID0gbmV3IEVtaXR0ZXI8dnNjb2RlLlRhYkdyb3VwQ2hhbmdlRXZlbnQ+KCk7XG5cblx0Ly8gSGF2ZSB0byB1c2UgISBiZWNhdXNlIHRoaXMgZ2V0cyBpbml0aWFsaXplZCB2aWEgYW4gUlBDIHByb3h5XG5cdHByaXZhdGUgX2FjdGl2ZUdyb3VwSWQhOiBudW1iZXI7XG5cblx0cHJpdmF0ZSBfZXh0SG9zdFRhYkdyb3VwczogRXh0SG9zdEVkaXRvclRhYkdyb3VwW10gPSBbXTtcblxuXHRwcml2YXRlIF9hcGlPYmplY3Q6IHZzY29kZS5UYWJHcm91cHMgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoQElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2UpIHtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RScGMuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZEVkaXRvclRhYnMpO1xuXHR9XG5cblx0Z2V0IHRhYkdyb3VwcygpOiB2c2NvZGUuVGFiR3JvdXBzIHtcblx0XHRpZiAoIXRoaXMuX2FwaU9iamVjdCkge1xuXHRcdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0XHRjb25zdCBvYmo6IHZzY29kZS5UYWJHcm91cHMgPSB7XG5cdFx0XHRcdC8vIG5ldmVyIGNoYW5nZXMgLT4gc2ltcGxlIHZhbHVlXG5cdFx0XHRcdG9uRGlkQ2hhbmdlVGFiR3JvdXBzOiB0aGF0Ll9vbkRpZENoYW5nZVRhYkdyb3Vwcy5ldmVudCxcblx0XHRcdFx0b25EaWRDaGFuZ2VUYWJzOiB0aGF0Ll9vbkRpZENoYW5nZVRhYnMuZXZlbnQsXG5cdFx0XHRcdC8vIGR5bmFtaWMgLT4gZ2V0dGVyc1xuXHRcdFx0XHRnZXQgYWxsKCkge1xuXHRcdFx0XHRcdHJldHVybiBPYmplY3QuZnJlZXplKHRoYXQuX2V4dEhvc3RUYWJHcm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmFwaU9iamVjdCkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgYWN0aXZlVGFiR3JvdXAoKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aXZlVGFiR3JvdXBJZCA9IHRoYXQuX2FjdGl2ZUdyb3VwSWQ7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aXZlVGFiR3JvdXAgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGF0Ll9leHRIb3N0VGFiR3JvdXBzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5ncm91cElkID09PSBhY3RpdmVUYWJHcm91cElkKT8uYXBpT2JqZWN0KTtcblx0XHRcdFx0XHRyZXR1cm4gYWN0aXZlVGFiR3JvdXA7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNsb3NlOiBhc3luYyAodGFiT3JUYWJHcm91cDogdnNjb2RlLlRhYiB8IHJlYWRvbmx5IHZzY29kZS5UYWJbXSB8IHZzY29kZS5UYWJHcm91cCB8IHJlYWRvbmx5IHZzY29kZS5UYWJHcm91cFtdLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRhYnNPclRhYkdyb3VwcyA9IEFycmF5LmlzQXJyYXkodGFiT3JUYWJHcm91cCkgPyB0YWJPclRhYkdyb3VwIDogW3RhYk9yVGFiR3JvdXBdO1xuXHRcdFx0XHRcdGlmICghdGFic09yVGFiR3JvdXBzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIENoZWNrIHdoaWNoIHR5cGUgd2FzIHBhc3NlZCBpbiBhbmQgY2FsbCB0aGUgYXBwcm9wcmlhdGUgY2xvc2Vcblx0XHRcdFx0XHQvLyBDYXN0aW5nIGlzIG5lZWRlZCBhcyB0eXBlc2NyaXB0IGRvZXNuJ3Qgc2VlbSB0byBpbmZlciBlbm91Z2ggZnJvbSB0aGlzXG5cdFx0XHRcdFx0aWYgKGlzVGFiR3JvdXAodGFic09yVGFiR3JvdXBzWzBdKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2Nsb3NlR3JvdXBzKHRhYnNPclRhYkdyb3VwcyBhcyB2c2NvZGUuVGFiR3JvdXBbXSwgcHJlc2VydmVGb2N1cyk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl9jbG9zZVRhYnModGFic09yVGFiR3JvdXBzIGFzIHZzY29kZS5UYWJbXSwgcHJlc2VydmVGb2N1cyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBtb3ZlOiBhc3luYyAodGFiOiB2c2NvZGUuVGFiLCB2aWV3Q29sdW1uOiBWaWV3Q29sdW1uLCBpbmRleDogbnVtYmVyLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHQvLyBcdGNvbnN0IGV4dEhvc3RUYWIgPSB0aGlzLl9maW5kRXh0SG9zdFRhYkZyb21BcGkodGFiKTtcblx0XHRcdFx0Ly8gXHRpZiAoIWV4dEhvc3RUYWIpIHtcblx0XHRcdFx0Ly8gXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0YWInKTtcblx0XHRcdFx0Ly8gXHR9XG5cdFx0XHRcdC8vIFx0dGhpcy5fcHJveHkuJG1vdmVUYWIoZXh0SG9zdFRhYi50YWJJZCwgaW5kZXgsIHR5cGVDb252ZXJ0ZXJzLlZpZXdDb2x1bW4uZnJvbSh2aWV3Q29sdW1uKSwgcHJlc2VydmVGb2N1cyk7XG5cdFx0XHRcdC8vIFx0cmV0dXJuO1xuXHRcdFx0XHQvLyB9XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fYXBpT2JqZWN0ID0gT2JqZWN0LmZyZWV6ZShvYmopO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYXBpT2JqZWN0O1xuXHR9XG5cblx0JGFjY2VwdEVkaXRvclRhYk1vZGVsKHRhYkdyb3VwczogSUVkaXRvclRhYkdyb3VwRHRvW10pOiB2b2lkIHtcblxuXHRcdGNvbnN0IGdyb3VwSWRzQmVmb3JlID0gbmV3IFNldCh0aGlzLl9leHRIb3N0VGFiR3JvdXBzLm1hcChncm91cCA9PiBncm91cC5ncm91cElkKSk7XG5cdFx0Y29uc3QgZ3JvdXBJZHNBZnRlciA9IG5ldyBTZXQodGFiR3JvdXBzLm1hcChkdG8gPT4gZHRvLmdyb3VwSWQpKTtcblx0XHRjb25zdCBkaWZmID0gZGlmZlNldHMoZ3JvdXBJZHNCZWZvcmUsIGdyb3VwSWRzQWZ0ZXIpO1xuXG5cdFx0Y29uc3QgY2xvc2VkOiB2c2NvZGUuVGFiR3JvdXBbXSA9IHRoaXMuX2V4dEhvc3RUYWJHcm91cHMuZmlsdGVyKGdyb3VwID0+IGRpZmYucmVtb3ZlZC5pbmNsdWRlcyhncm91cC5ncm91cElkKSkubWFwKGdyb3VwID0+IGdyb3VwLmFwaU9iamVjdCk7XG5cdFx0Y29uc3Qgb3BlbmVkOiB2c2NvZGUuVGFiR3JvdXBbXSA9IFtdO1xuXHRcdGNvbnN0IGNoYW5nZWQ6IHZzY29kZS5UYWJHcm91cFtdID0gW107XG5cblx0XHQvLyBSZXVzZSB0aGUgZXhpc3RpbmcgZ3JvdXAgaW5zdGFuY2VzIGZvciBncm91cHMgdGhhdCBzdGlsbCBleGlzdCBzbyB0aGF0XG5cdFx0Ly8gdGhlIGB2c2NvZGUuVGFiR3JvdXBgIChhbmQgbmVzdGVkIGB2c2NvZGUuVGFiYCkgb2JqZWN0cyBrZWVwIGEgc3RhYmxlXG5cdFx0Ly8gaWRlbnRpdHkgYWNyb3NzIGEgZnVsbCBtb2RlbCByZXN5bmMsIG1hdGNoaW5nIHRoZSBncmFudWxhciB1cGRhdGVcblx0XHQvLyBwYXRocy4gV2l0aG91dCB0aGlzLCBldmVyeSByZXN5bmMgKGUuZy4gb3BlbmluZy9jbG9zaW5nIGFuIGVkaXRvclxuXHRcdC8vIGdyb3VwKSBoYW5kcyBleHRlbnNpb25zIGJyYW5kLW5ldyBvYmplY3RzLCBzaWxlbnRseSBicmVha2luZyBhbmRcblx0XHQvLyBsZWFraW5nIGFueSBgTWFwYC9gV2Vha01hcGAvYFNldGAga2V5ZWQgYnkgdGFiIGdyb3VwcyBvciB0YWJzLlxuXHRcdGNvbnN0IGV4aXN0aW5nR3JvdXBzQnlJZCA9IG5ldyBNYXA8bnVtYmVyLCBFeHRIb3N0RWRpdG9yVGFiR3JvdXA+KCk7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLl9leHRIb3N0VGFiR3JvdXBzKSB7XG5cdFx0XHRleGlzdGluZ0dyb3Vwc0J5SWQuc2V0KGdyb3VwLmdyb3VwSWQsIGdyb3VwKTtcblx0XHR9XG5cblx0XHR0aGlzLl9leHRIb3N0VGFiR3JvdXBzID0gdGFiR3JvdXBzLm1hcCh0YWJHcm91cCA9PiB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IGV4aXN0aW5nR3JvdXBzQnlJZC5nZXQodGFiR3JvdXAuZ3JvdXBJZCk7XG5cdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0ZXhpc3RpbmcuYWNjZXB0TW9kZWxVcGRhdGUodGFiR3JvdXApO1xuXHRcdFx0XHRjaGFuZ2VkLnB1c2goZXhpc3RpbmcuYXBpT2JqZWN0KTtcblx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZ3JvdXAgPSBuZXcgRXh0SG9zdEVkaXRvclRhYkdyb3VwKHRhYkdyb3VwLCAoKSA9PiB0aGlzLl9hY3RpdmVHcm91cElkKTtcblx0XHRcdG9wZW5lZC5wdXNoKGdyb3VwLmFwaU9iamVjdCk7XG5cdFx0XHRyZXR1cm4gZ3JvdXA7XG5cdFx0fSk7XG5cblx0XHQvLyBTZXQgdGhlIGFjdGl2ZSB0YWIgZ3JvdXAgaWRcblx0XHRjb25zdCBhY3RpdmVUYWJHcm91cElkID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGFiR3JvdXBzLmZpbmQoZ3JvdXAgPT4gZ3JvdXAuaXNBY3RpdmUgPT09IHRydWUpPy5ncm91cElkKTtcblx0XHRpZiAoYWN0aXZlVGFiR3JvdXBJZCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX2FjdGl2ZUdyb3VwSWQgIT09IGFjdGl2ZVRhYkdyb3VwSWQpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUdyb3VwSWQgPSBhY3RpdmVUYWJHcm91cElkO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZVRhYkdyb3Vwcy5maXJlKE9iamVjdC5mcmVlemUoeyBvcGVuZWQsIGNsb3NlZCwgY2hhbmdlZCB9KSk7XG5cdH1cblxuXHQkYWNjZXB0VGFiR3JvdXBVcGRhdGUoZ3JvdXBEdG86IElFZGl0b3JUYWJHcm91cER0bykge1xuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fZXh0SG9zdFRhYkdyb3Vwcy5maW5kKGdyb3VwID0+IGdyb3VwLmdyb3VwSWQgPT09IGdyb3VwRHRvLmdyb3VwSWQpO1xuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVXBkYXRlIEdyb3VwIElQQyBjYWxsIHJlY2VpdmVkIGJlZm9yZSBncm91cCBjcmVhdGlvbi4nKTtcblx0XHR9XG5cdFx0Z3JvdXAuYWNjZXB0R3JvdXBEdG9VcGRhdGUoZ3JvdXBEdG8pO1xuXHRcdGlmIChncm91cER0by5pc0FjdGl2ZSkge1xuXHRcdFx0dGhpcy5fYWN0aXZlR3JvdXBJZCA9IGdyb3VwRHRvLmdyb3VwSWQ7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVGFiR3JvdXBzLmZpcmUoT2JqZWN0LmZyZWV6ZSh7IGNoYW5nZWQ6IFtncm91cC5hcGlPYmplY3RdLCBvcGVuZWQ6IFtdLCBjbG9zZWQ6IFtdIH0pKTtcblx0fVxuXG5cdCRhY2NlcHRUYWJPcGVyYXRpb24ob3BlcmF0aW9uOiBUYWJPcGVyYXRpb24pIHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuX2V4dEhvc3RUYWJHcm91cHMuZmluZChncm91cCA9PiBncm91cC5ncm91cElkID09PSBvcGVyYXRpb24uZ3JvdXBJZCk7XG5cdFx0aWYgKCFncm91cCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVcGRhdGUgVGFicyBJUEMgY2FsbCByZWNlaXZlZCBiZWZvcmUgZ3JvdXAgY3JlYXRpb24uJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHRhYiA9IGdyb3VwLmFjY2VwdFRhYk9wZXJhdGlvbihvcGVyYXRpb24pO1xuXG5cdFx0Ly8gQ29uc3RydWN0IHRoZSB0YWIgY2hhbmdlIGV2ZW50IGJhc2VkIG9uIHRoZSBvcGVyYXRpb25cblx0XHRzd2l0Y2ggKG9wZXJhdGlvbi5raW5kKSB7XG5cdFx0XHRjYXNlIFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfT1BFTjpcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VUYWJzLmZpcmUoT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRcdFx0b3BlbmVkOiBbdGFiLmFwaU9iamVjdF0sXG5cdFx0XHRcdFx0Y2xvc2VkOiBbXSxcblx0XHRcdFx0XHRjaGFuZ2VkOiBbXVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdGNhc2UgVGFiTW9kZWxPcGVyYXRpb25LaW5kLlRBQl9DTE9TRTpcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VUYWJzLmZpcmUoT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRcdFx0b3BlbmVkOiBbXSxcblx0XHRcdFx0XHRjbG9zZWQ6IFt0YWIuYXBpT2JqZWN0XSxcblx0XHRcdFx0XHRjaGFuZ2VkOiBbXVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdGNhc2UgVGFiTW9kZWxPcGVyYXRpb25LaW5kLlRBQl9NT1ZFOlxuXHRcdFx0Y2FzZSBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX1VQREFURTpcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VUYWJzLmZpcmUoT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRcdFx0b3BlbmVkOiBbXSxcblx0XHRcdFx0XHRjbG9zZWQ6IFtdLFxuXHRcdFx0XHRcdGNoYW5nZWQ6IFt0YWIuYXBpT2JqZWN0XVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9maW5kRXh0SG9zdFRhYkZyb21BcGkoYXBpVGFiOiB2c2NvZGUuVGFiKTogRXh0SG9zdEVkaXRvclRhYiB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLl9leHRIb3N0VGFiR3JvdXBzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHRhYiBvZiBncm91cC50YWJzKSB7XG5cdFx0XHRcdGlmICh0YWIuYXBpT2JqZWN0ID09PSBhcGlUYWIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGFiO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRFeHRIb3N0VGFiR3JvdXBGcm9tQXBpKGFwaVRhYkdyb3VwOiB2c2NvZGUuVGFiR3JvdXApOiBFeHRIb3N0RWRpdG9yVGFiR3JvdXAgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9leHRIb3N0VGFiR3JvdXBzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5hcGlPYmplY3QgPT09IGFwaVRhYkdyb3VwKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Nsb3NlVGFicyh0YWJzOiB2c2NvZGUuVGFiW10sIHByZXNlcnZlRm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZXh0SG9zdFRhYklkczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHRhYiBvZiB0YWJzKSB7XG5cdFx0XHRjb25zdCBleHRIb3N0VGFiID0gdGhpcy5fZmluZEV4dEhvc3RUYWJGcm9tQXBpKHRhYik7XG5cdFx0XHRpZiAoIWV4dEhvc3RUYWIpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUYWIgY2xvc2U6IEludmFsaWQgdGFiIG5vdCBmb3VuZCEnKTtcblx0XHRcdH1cblx0XHRcdGV4dEhvc3RUYWJJZHMucHVzaChleHRIb3N0VGFiLnRhYklkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRjbG9zZVRhYihleHRIb3N0VGFiSWRzLCBwcmVzZXJ2ZUZvY3VzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Nsb3NlR3JvdXBzKGdyb3VwczogdnNjb2RlLlRhYkdyb3VwW10sIHByZXNlcnZlckZvdWNzPzogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGV4dEhvc3RHcm91cElkczogbnVtYmVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuXHRcdFx0Y29uc3QgZXh0SG9zdEdyb3VwID0gdGhpcy5fZmluZEV4dEhvc3RUYWJHcm91cEZyb21BcGkoZ3JvdXApO1xuXHRcdFx0aWYgKCFleHRIb3N0R3JvdXApIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdHcm91cCBjbG9zZTogSW52YWxpZCBncm91cCBub3QgZm91bmQhJyk7XG5cdFx0XHR9XG5cdFx0XHRleHRIb3N0R3JvdXBJZHMucHVzaChleHRIb3N0R3JvdXAuZ3JvdXBJZCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kY2xvc2VHcm91cChleHRIb3N0R3JvdXBJZHMsIHByZXNlcnZlckZvdWNzKTtcblx0fVxufVxuXG4vLyNyZWdpb24gVXRpbHNcbmZ1bmN0aW9uIGlzVGFiR3JvdXAob2JqOiB1bmtub3duKTogb2JqIGlzIHZzY29kZS5UYWJHcm91cCB7XG5cdGNvbnN0IHRhYkdyb3VwID0gb2JqIGFzIHZzY29kZS5UYWJHcm91cDtcblx0aWYgKHRhYkdyb3VwLnRhYnMgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXFFLGFBQXdDLGNBQWMsNkJBQTJDO0FBQ3RLLFNBQVMsMEJBQTBCO0FBQ25DLFlBQVksb0JBQW9CO0FBQ2hDLFNBQVMsb0JBQW9CLHNCQUFzQix3QkFBd0IsNEJBQTRCLHdCQUF3Qix3QkFBd0Isa0JBQWtCLG1CQUFtQixjQUFjLHVCQUF1Qiw2QkFBNkI7QUFRdlAsTUFBTSxxQkFBcUIsZ0JBQW9DLG9CQUFvQjtBQUkxRixNQUFNLGlCQUFpQjtBQUFBLEVBT3RCLFlBQVksS0FBb0IsYUFBb0MsbUJBQWlDO0FBQ3BHLFNBQUsscUJBQXFCO0FBQzFCLFNBQUssZUFBZTtBQUNwQixTQUFLLGdCQUFnQixHQUFHO0FBQUEsRUFDekI7QUFBQSxFQUVBLElBQUksWUFBd0I7QUFDM0IsUUFBSSxDQUFDLEtBQUssWUFBWTtBQUVyQixZQUFNLE9BQU87QUFDYixZQUFNLE1BQWtCO0FBQUEsUUFDdkIsSUFBSSxXQUFXO0FBRWQsaUJBQU8sS0FBSyxLQUFLLE9BQU8sS0FBSyxtQkFBbUI7QUFBQSxRQUNqRDtBQUFBLFFBQ0EsSUFBSSxRQUFRO0FBQ1gsaUJBQU8sS0FB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
