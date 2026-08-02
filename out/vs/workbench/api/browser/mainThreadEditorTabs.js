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
import { Event } from "../../../base/common/event.js";
import { DisposableMap, DisposableStore } from "../../../base/common/lifecycle.js";
import { isEqual } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ExtHostContext, MainContext, TabInputKind, TabModelOperationKind } from "../common/extHost.protocol.js";
import { EditorResourceAccessor, GroupModelChangeKind, SideBySideEditor } from "../../common/editor.js";
import { DiffEditorInput } from "../../common/editor/diffEditorInput.js";
import { isGroupEditorMoveEvent } from "../../common/editor/editorGroupModel.js";
import { SideBySideEditorInput } from "../../common/editor/sideBySideEditorInput.js";
import { AbstractTextResourceEditorInput } from "../../common/editor/textResourceEditorInput.js";
import { ChatEditorInput } from "../../contrib/chat/browser/widgetHosts/editor/chatEditorInput.js";
import { CustomEditorInput } from "../../contrib/customEditor/browser/customEditorInput.js";
import { InteractiveEditorInput } from "../../contrib/interactive/browser/interactiveEditorInput.js";
import { MergeEditorInput } from "../../contrib/mergeEditor/browser/mergeEditorInput.js";
import { MultiDiffEditorInput } from "../../contrib/multiDiffEditor/browser/multiDiffEditorInput.js";
import { NotebookEditorInput } from "../../contrib/notebook/common/notebookEditorInput.js";
import { TerminalEditorInput } from "../../contrib/terminal/browser/terminalEditorInput.js";
import { WebviewInput } from "../../contrib/webviewPanel/browser/webviewEditorInput.js";
import { columnToEditorGroup, editorGroupToColumn } from "../../services/editor/common/editorGroupColumn.js";
import { GroupDirection, IEditorGroupsService, preferredSideBySideGroupDirection } from "../../services/editor/common/editorGroupsService.js";
import { IEditorService, SIDE_GROUP } from "../../services/editor/common/editorService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
let MainThreadEditorTabs = class {
  constructor(extHostContext, _editorGroupsService, _configurationService, _logService, editorService) {
    this._editorGroupsService = _editorGroupsService;
    this._configurationService = _configurationService;
    this._logService = _logService;
    this._dispoables = new DisposableStore();
    // List of all groups and their corresponding tabs, this is **the** model
    this._tabGroupModel = [];
    // Lookup table for finding group by id
    this._groupLookup = /* @__PURE__ */ new Map();
    // Lookup table for finding tab by id
    this._tabInfoLookup = /* @__PURE__ */ new Map();
    // Tracks the currently open MultiDiffEditorInputs to listen to resource changes
    this._multiDiffEditorInputListeners = new DisposableMap();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostEditorTabs);
    this._dispoables.add(editorService.onDidEditorsChange((event) => {
      try {
        this._updateTabsModel(event);
      } catch {
        this._logService.error("Failed to update model, rebuilding");
        this._createTabsModel();
      }
    }));
    this._dispoables.add(this._multiDiffEditorInputListeners);
    this._dispoables.add(this._editorGroupsService.onDidAddGroup(() => this._createTabsModel()));
    this._dispoables.add(this._editorGroupsService.onDidRemoveGroup(() => this._createTabsModel()));
    this._editorGroupsService.whenReady.then(() => this._createTabsModel());
  }
  dispose() {
    this._groupLookup.clear();
    this._tabInfoLookup.clear();
    this._dispoables.dispose();
  }
  /**
   * Creates a tab object with the correct properties
   * @param editor The editor input represented by the tab
   * @param group The group the tab is in
   * @returns A tab object
   */
  _buildTabObject(group, editor, editorIndex) {
    const editorId = editor.editorId;
    const tab = {
      id: this._generateTabId(editor, group.id),
      label: editor.getName(),
      editorId,
      input: this._editorInputToDto(editor),
      isPinned: group.isSticky(editorIndex),
      isPreview: !group.isPinned(editorIndex),
      isActive: group.isActive(editor),
      isDirty: editor.isDirty()
    };
    return tab;
  }
  _editorInputToDto(editor) {
    if (editor instanceof MergeEditorInput) {
      return {
        kind: TabInputKind.TextMergeInput,
        base: editor.base,
        input1: editor.input1.uri,
        input2: editor.input2.uri,
        result: editor.resource
      };
    }
    if (editor instanceof AbstractTextResourceEditorInput) {
      return {
        kind: TabInputKind.TextInput,
        uri: editor.resource
      };
    }
    if (editor instanceof SideBySideEditorInput && !(editor instanceof DiffEditorInput)) {
      const primaryResource = editor.primary.resource;
      const secondaryResource = editor.secondary.resource;
      if (editor.primary instanceof AbstractTextResourceEditorInput && editor.secondary instanceof AbstractTextResourceEditorInput && isEqual(primaryResource, secondaryResource) && primaryResource && secondaryResource) {
        return {
          kind: TabInputKind.TextInput,
          uri: primaryResource
        };
      }
      return { kind: TabInputKind.UnknownInput };
    }
    if (editor instanceof NotebookEditorInput) {
      return {
        kind: TabInputKind.NotebookInput,
        notebookType: editor.viewType,
        uri: editor.resource
      };
    }
    if (editor instanceof CustomEditorInput) {
      return {
        kind: TabInputKind.CustomEditorInput,
        viewType: editor.viewType,
        uri: editor.resource
      };
    }
    if (editor instanceof WebviewInput) {
      return {
        kind: TabInputKind.WebviewEditorInput,
        viewType: editor.viewType
      };
    }
    if (editor instanceof TerminalEditorInput) {
      return {
        kind: TabInputKind.TerminalEditorInput
      };
    }
    if (editor instanceof DiffEditorInput) {
      if (editor.modified instanceof AbstractTextResourceEditorInput && editor.original instanceof AbstractTextResourceEditorInput) {
        return {
          kind: TabInputKind.TextDiffInput,
          modified: editor.modified.resource,
          original: editor.original.resource
        };
      }
      if (editor.modified instanceof NotebookEditorInput && editor.original instanceof NotebookEditorInput) {
        return {
          kind: TabInputKind.NotebookDiffInput,
          notebookType: editor.original.viewType,
          modified: editor.modified.resource,
          original: editor.original.resource
        };
      }
    }
    if (editor instanceof InteractiveEditorInput) {
      return {
        kind: TabInputKind.InteractiveEditorInput,
        uri: editor.resource,
        inputBoxUri: editor.inputResource
      };
    }
    if (editor instanceof ChatEditorInput) {
      return {
        kind: TabInputKind.ChatEditorInput
      };
    }
    if (editor instanceof MultiDiffEditorInput) {
      const diffEditors = [];
      for (const resource of editor?.resources.get() ?? []) {
        if (resource.originalUri && resource.modifiedUri) {
          diffEditors.push({
            kind: TabInputKind.TextDiffInput,
            original: resource.originalUri,
            modified: resource.modifiedUri
          });
        }
      }
      return {
        kind: TabInputKind.MultiDiffEditorInput,
        diffEditors
      };
    }
    return { kind: TabInputKind.UnknownInput };
  }
  /**
   * Generates a unique id for a tab
   * @param editor The editor input
   * @param groupId The group id
   * @returns A unique identifier for a specific tab
   */
  _generateTabId(editor, groupId) {
    let resourceString;
    const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.BOTH });
    if (resource instanceof URI) {
      resourceString = resource.toString();
    } else {
      resourceString = `${resource?.primary?.toString()}-${resource?.secondary?.toString()}`;
    }
    return `${groupId}~${editor.editorId}-${editor.typeId}-${resourceString} `;
  }
  /**
   * Called whenever a group activates, updates the model by marking the group as active an notifies the extension host
   */
  _onDidGroupActivate() {
    const activeGroupId = this._editorGroupsService.activeGroup.id;
    const activeGroup = this._groupLookup.get(activeGroupId);
    if (activeGroup) {
      activeGroup.isActive = true;
      this._proxy.$acceptTabGroupUpdate(activeGroup);
    }
  }
  /**
   * Called when the tab label changes
   * @param groupId The id of the group the tab exists in
   * @param editorInput The editor input represented by the tab
   */
  _onDidTabLabelChange(groupId, editorInput, editorIndex) {
    const tabId = this._generateTabId(editorInput, groupId);
    const tabInfo = this._tabInfoLookup.get(tabId);
    if (tabInfo) {
      tabInfo.tab.label = editorInput.getName();
      this._proxy.$acceptTabOperation({
        groupId,
        index: editorIndex,
        tabDto: tabInfo.tab,
        kind: TabModelOperationKind.TAB_UPDATE
      });
    } else {
      this._logService.error("Invalid model for label change, rebuilding");
      this._createTabsModel();
    }
  }
  /**
   * Called when a new tab is opened
   * @param groupId The id of the group the tab is being created in
   * @param editorInput The editor input being opened
   * @param editorIndex The index of the editor within that group
   */
  _onDidTabOpen(groupId, editorInput, editorIndex) {
    const group = this._editorGroupsService.getGroup(groupId);
    const groupInModel = this._groupLookup.get(groupId) !== void 0;
    if (!group || !groupInModel) {
      this._createTabsModel();
      return;
    }
    const tabs = this._groupLookup.get(groupId)?.tabs;
    if (!tabs) {
      return;
    }
    const tabObject = this._buildTabObject(group, editorInput, editorIndex);
    tabs.splice(editorIndex, 0, tabObject);
    const tabId = this._generateTabId(editorInput, groupId);
    this._tabInfoLookup.set(tabId, { group, editorInput, tab: tabObject });
    if (editorInput instanceof MultiDiffEditorInput) {
      this._multiDiffEditorInputListeners.set(editorInput, Event.fromObservableLight(editorInput.resources)(() => {
        const tabInfo = this._tabInfoLookup.get(tabId);
        if (!tabInfo) {
          return;
        }
        tabInfo.tab = this._buildTabObject(group, editorInput, editorIndex);
        this._proxy.$acceptTabOperation({
          groupId,
          index: editorIndex,
          tabDto: tabInfo.tab,
          kind: TabModelOperationKind.TAB_UPDATE
        });
      }));
    }
    this._proxy.$acceptTabOperation({
      groupId,
      index: editorIndex,
      tabDto: tabObject,
      kind: TabModelOperationKind.TAB_OPEN
    });
  }
  /**
   * Called when a tab is closed
   * @param groupId The id of the group the tab is being removed from
   * @param editorIndex The index of the editor within that group
   */
  _onDidTabClose(groupId, editorIndex) {
    const group = this._editorGroupsService.getGroup(groupId);
    const tabs = this._groupLookup.get(groupId)?.tabs;
    if (!group || !tabs) {
      this._createTabsModel();
      return;
    }
    const removedTab = tabs.splice(editorIndex, 1);
    if (removedTab.length === 0) {
      return;
    }
    this._tabInfoLookup.delete(removedTab[0]?.id ?? "");
    if (removedTab[0]?.input instanceof MultiDiffEditorInput) {
      this._multiDiffEditorInputListeners.deleteAndDispose(removedTab[0]?.input);
    }
    this._proxy.$acceptTabOperation({
      groupId,
      index: editorIndex,
      tabDto: removedTab[0],
      kind: TabModelOperationKind.TAB_CLOSE
    });
  }
  /**
   * Called when the active tab changes
   * @param groupId The id of the group the tab is contained in
   * @param editorIndex The index of the tab
   */
  _onDidTabActiveChange(groupId, editorIndex) {
    const tabs = this._groupLookup.get(groupId)?.tabs;
    if (!tabs) {
      return;
    }
    const activeTab = tabs[editorIndex];
    activeTab.isActive = true;
    this._proxy.$acceptTabOperation({
      groupId,
      index: editorIndex,
      tabDto: activeTab,
      kind: TabModelOperationKind.TAB_UPDATE
    });
  }
  /**
   * Called when the dirty indicator on the tab changes
   * @param groupId The id of the group the tab is in
   * @param editorIndex The index of the tab
   * @param editor The editor input represented by the tab
   */
  _onDidTabDirty(groupId, editorIndex, editor) {
    const tabId = this._generateTabId(editor, groupId);
    const tabInfo = this._tabInfoLookup.get(tabId);
    if (!tabInfo) {
      this._logService.error("Invalid model for dirty change, rebuilding");
      this._createTabsModel();
      return;
    }
    tabInfo.tab.isDirty = editor.isDirty();
    this._proxy.$acceptTabOperation({
      groupId,
      index: editorIndex,
      tabDto: tabInfo.tab,
      kind: TabModelOperationKind.TAB_UPDATE
    });
  }
  /**
   * Called when the tab is pinned/unpinned
   * @param groupId The id of the group the tab is in
   * @param editorIndex The index of the tab
   * @param editor The editor input represented by the tab
   */
  _onDidTabPinChange(groupId, editorIndex, editor) {
    const tabId = this._generateTabId(editor, groupId);
    const tabInfo = this._tabInfoLookup.get(tabId);
    const group = tabInfo?.group;
    const tab = tabInfo?.tab;
    if (!group || !tab) {
      this._logService.error("Invalid model for sticky change, rebuilding");
      this._createTabsModel();
      return;
    }
    tab.isPinned = group.isSticky(editorIndex);
    this._proxy.$acceptTabOperation({
      groupId,
      index: editorIndex,
      tabDto: tab,
      kind: TabModelOperationKind.TAB_UPDATE
    });
  }
  /**
  * Called when the tab is preview / unpreviewed
  * @param groupId The id of the group the tab is in
  * @param editorIndex The index of the tab
  * @param editor The editor input represented by the tab
  */
  _onDidTabPreviewChange(groupId, editorIndex, editor) {
    const tabId = this._generateTabId(editor, groupId);
    const tabInfo = this._tabInfoLookup.get(tabId);
    const group = tabInfo?.group;
    const tab = tabInfo?.tab;
    if (!group || !tab) {
      this._logService.error("Invalid model for sticky change, rebuilding");
      this._createTabsModel();
      return;
    }
    tab.isPreview = !group.isPinned(editorIndex);
    this._proxy.$acceptTabOperation({
      kind: TabModelOperationKind.TAB_UPDATE,
      groupId,
      tabDto: tab,
      index: editorIndex
    });
  }
  _onDidTabMove(groupId, editorIndex, oldEditorIndex, editor) {
    const tabs = this._groupLookup.get(groupId)?.tabs;
    if (!tabs) {
      this._logService.error("Invalid model for move change, rebuilding");
      this._createTabsModel();
      return;
    }
    const removedTab = tabs.splice(oldEditorIndex, 1);
    if (removedTab.length === 0) {
      return;
    }
    tabs.splice(editorIndex, 0, removedTab[0]);
    this._proxy.$acceptTabOperation({
      kind: TabModelOperationKind.TAB_MOVE,
      groupId,
      tabDto: removedTab[0],
      index: editorIndex,
      oldIndex: oldEditorIndex
    });
  }
  /**
   * Builds the model from scratch based on the current state of the editor service.
   */
  _createTabsModel() {
    if (this._editorGroupsService.groups.length === 0) {
      return;
    }
    this._tabGroupModel = [];
    this._groupLookup.clear();
    this._tabInfoLookup.clear();
    let tabs = [];
    for (const group of this._editorGroupsService.groups) {
      const currentTabGroupModel = {
        groupId: group.id,
        isActive: group.id === this._editorGroupsService.activeGroup.id,
        viewColumn: editorGroupToColumn(this._editorGroupsService, group),
        tabs: []
      };
      group.editors.forEach((editor, editorIndex) => {
        const tab = this._buildTabObject(group, editor, editorIndex);
        tabs.push(tab);
        this._tabInfoLookup.set(this._generateTabId(editor, group.id), {
          group,
          tab,
          editorInput: editor
        });
      });
      currentTabGroupModel.tabs = tabs;
      this._tabGroupModel.push(currentTabGroupModel);
      this._groupLookup.set(group.id, currentTabGroupModel);
      tabs = [];
    }
    this._proxy.$acceptEditorTabModel(this._tabGroupModel);
  }
  /**
   * The main handler for the tab events
   * @param events The list of events to process
   */
  _updateTabsModel(changeEvent) {
    const event = changeEvent.event;
    const groupId = changeEvent.groupId;
    switch (event.kind) {
      case GroupModelChangeKind.GROUP_ACTIVE:
        if (groupId === this._editorGroupsService.activeGroup.id) {
          this._onDidGroupActivate();
          break;
        } else {
          return;
        }
      case GroupModelChangeKind.EDITOR_LABEL:
        if (event.editor !== void 0 && event.editorIndex !== void 0) {
          this._onDidTabLabelChange(groupId, event.editor, event.editorIndex);
          break;
        }
      case GroupModelChangeKind.EDITOR_OPEN:
        if (event.editor !== void 0 && event.editorIndex !== void 0) {
          this._onDidTabOpen(groupId, event.editor, event.editorIndex);
          break;
        }
      case GroupModelChangeKind.EDITOR_CLOSE:
        if (event.editorIndex !== void 0) {
          this._onDidTabClose(groupId, event.editorIndex);
          break;
        }
      case GroupModelChangeKind.EDITOR_ACTIVE:
        if (event.editorIndex !== void 0) {
          this._onDidTabActiveChange(groupId, event.editorIndex);
          break;
        }
      case GroupModelChangeKind.EDITOR_DIRTY:
        if (event.editorIndex !== void 0 && event.editor !== void 0) {
          this._onDidTabDirty(groupId, event.editorIndex, event.editor);
          break;
        }
      case GroupModelChangeKind.EDITOR_STICKY:
        if (event.editorIndex !== void 0 && event.editor !== void 0) {
          this._onDidTabPinChange(groupId, event.editorIndex, event.editor);
          break;
        }
      case GroupModelChangeKind.EDITOR_PIN:
        if (event.editorIndex !== void 0 && event.editor !== void 0) {
          this._onDidTabPreviewChange(groupId, event.editorIndex, event.editor);
          break;
        }
      case GroupModelChangeKind.EDITOR_TRANSIENT:
        break;
      case GroupModelChangeKind.EDITORS_SELECTION:
        break;
      case GroupModelChangeKind.EDITOR_MOVE:
        if (isGroupEditorMoveEvent(event) && event.editor && event.editorIndex !== void 0 && event.oldEditorIndex !== void 0) {
          this._onDidTabMove(groupId, event.editorIndex, event.oldEditorIndex, event.editor);
          break;
        }
      default:
        this._createTabsModel();
    }
  }
  //#region Messages received from Ext Host
  $moveTab(tabId, index, viewColumn, preserveFocus) {
    const groupId = columnToEditorGroup(this._editorGroupsService, this._configurationService, viewColumn);
    const tabInfo = this._tabInfoLookup.get(tabId);
    const tab = tabInfo?.tab;
    if (!tab) {
      throw new Error(`Attempted to close tab with id ${tabId} which does not exist`);
    }
    let targetGroup;
    const sourceGroup = this._editorGroupsService.getGroup(tabInfo.group.id);
    if (!sourceGroup) {
      return;
    }
    if (this._groupLookup.get(groupId) === void 0) {
      let direction = GroupDirection.RIGHT;
      if (viewColumn === SIDE_GROUP) {
        direction = preferredSideBySideGroupDirection(this._configurationService);
      }
      targetGroup = this._editorGroupsService.addGroup(this._editorGroupsService.groups[this._editorGroupsService.groups.length - 1], direction);
    } else {
      targetGroup = this._editorGroupsService.getGroup(groupId);
    }
    if (!targetGroup) {
      return;
    }
    if (index < 0 || index > targetGroup.editors.length) {
      index = targetGroup.editors.length;
    }
    const editorInput = tabInfo?.editorInput;
    if (!editorInput) {
      return;
    }
    sourceGroup.moveEditor(editorInput, targetGroup, { index, preserveFocus });
    return;
  }
  async $closeTab(tabIds, preserveFocus) {
    const groups = /* @__PURE__ */ new Map();
    for (const tabId of tabIds) {
      const tabInfo = this._tabInfoLookup.get(tabId);
      const tab = tabInfo?.tab;
      const group = tabInfo?.group;
      const editorTab = tabInfo?.editorInput;
      if (!group || !tab || !tabInfo || !editorTab) {
        continue;
      }
      const groupEditors = groups.get(group);
      if (!groupEditors) {
        groups.set(group, [editorTab]);
      } else {
        groupEditors.push(editorTab);
      }
    }
    const results = [];
    for (const [group, editors] of groups) {
      results.push(await group.closeEditors(editors, { preserveFocus }));
    }
    return results.every((result) => result);
  }
  async $closeGroup(groupIds, preserveFocus) {
    const groupCloseResults = [];
    for (const groupId of groupIds) {
      const group = this._editorGroupsService.getGroup(groupId);
      if (group) {
        groupCloseResults.push(await group.closeAllEditors());
        if (group.count === 0 && this._editorGroupsService.getGroup(group.id)) {
          this._editorGroupsService.removeGroup(group);
        }
      }
    }
    return groupCloseResults.every((result) => result);
  }
  //#endregion
};
MainThreadEditorTabs = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadEditorTabs),
  __decorateParam(1, IEditorGroupsService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IEditorService)
], MainThreadEditorTabs);
export {
  MainThreadEditorTabs
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkRWRpdG9yVGFicy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBbnlJbnB1dER0bywgRXh0SG9zdENvbnRleHQsIElFZGl0b3JUYWJEdG8sIElFZGl0b3JUYWJHcm91cER0bywgSUV4dEhvc3RFZGl0b3JUYWJzU2hhcGUsIE1haW5Db250ZXh0LCBNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlLCBUYWJJbnB1dEtpbmQsIFRhYk1vZGVsT3BlcmF0aW9uS2luZCwgVGV4dERpZmZJbnB1dER0byB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IsIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLCBTaWRlQnlTaWRlRWRpdG9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yL2RpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBpc0dyb3VwRWRpdG9yTW92ZUV2ZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JHcm91cE1vZGVsLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFRleHRSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvci90ZXh0UmVzb3VyY2VFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXRIb3N0cy9lZGl0b3IvY2hhdEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEN1c3RvbUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9jdXN0b21FZGl0b3IvYnJvd3Nlci9jdXN0b21FZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJbnRlcmFjdGl2ZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9pbnRlcmFjdGl2ZS9icm93c2VyL2ludGVyYWN0aXZlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgTWVyZ2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbWVyZ2VFZGl0b3IvYnJvd3Nlci9tZXJnZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9tdWx0aURpZmZFZGl0b3IvYnJvd3Nlci9tdWx0aURpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0VkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29udHJpYi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgV2Vidmlld0lucHV0IH0gZnJvbSAnLi4vLi4vY29udHJpYi93ZWJ2aWV3UGFuZWwvYnJvd3Nlci93ZWJ2aWV3RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgY29sdW1uVG9FZGl0b3JHcm91cCwgRWRpdG9yR3JvdXBDb2x1bW4sIGVkaXRvckdyb3VwVG9Db2x1bW4gfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3VwQ29sdW1uLmpzJztcbmltcG9ydCB7IEdyb3VwRGlyZWN0aW9uLCBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlLCBwcmVmZXJyZWRTaWRlQnlTaWRlR3JvdXBEaXJlY3Rpb24gfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvcnNDaGFuZ2VFdmVudCwgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuXG5pbnRlcmZhY2UgVGFiSW5mbyB7XG5cdHRhYjogSUVkaXRvclRhYkR0bztcblx0Z3JvdXA6IElFZGl0b3JHcm91cDtcblx0ZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0O1xufVxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRFZGl0b3JUYWJzKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRFZGl0b3JUYWJzIGltcGxlbWVudHMgTWFpblRocmVhZEVkaXRvclRhYnNTaGFwZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9hYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IElFeHRIb3N0RWRpdG9yVGFic1NoYXBlO1xuXHQvLyBMaXN0IG9mIGFsbCBncm91cHMgYW5kIHRoZWlyIGNvcnJlc3BvbmRpbmcgdGFicywgdGhpcyBpcyAqKnRoZSoqIG1vZGVsXG5cdHByaXZhdGUgX3RhYkdyb3VwTW9kZWw6IElFZGl0b3JUYWJHcm91cER0b1tdID0gW107XG5cdC8vIExvb2t1cCB0YWJsZSBmb3IgZmluZGluZyBncm91cCBieSBpZFxuXHRwcml2YXRlIHJlYWRvbmx5IF9ncm91cExvb2t1cDogTWFwPG51bWJlciwgSUVkaXRvclRhYkdyb3VwRHRvPiA9IG5ldyBNYXAoKTtcblx0Ly8gTG9va3VwIHRhYmxlIGZvciBmaW5kaW5nIHRhYiBieSBpZFxuXHRwcml2YXRlIHJlYWRvbmx5IF90YWJJbmZvTG9va3VwOiBNYXA8c3RyaW5nLCBUYWJJbmZvPiA9IG5ldyBNYXAoKTtcblx0Ly8gVHJhY2tzIHRoZSBjdXJyZW50bHkgb3BlbiBNdWx0aURpZmZFZGl0b3JJbnB1dHMgdG8gbGlzdGVuIHRvIHJlc291cmNlIGNoYW5nZXNcblx0cHJpdmF0ZSByZWFkb25seSBfbXVsdGlEaWZmRWRpdG9ySW5wdXRMaXN0ZW5lcnM6IERpc3Bvc2FibGVNYXA8TXVsdGlEaWZmRWRpdG9ySW5wdXQ+ID0gbmV3IERpc3Bvc2FibGVNYXAoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JHcm91cHNTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZVxuXHQpIHtcblxuXHRcdHRoaXMuX3Byb3h5ID0gZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoRXh0SG9zdENvbnRleHQuRXh0SG9zdEVkaXRvclRhYnMpO1xuXG5cdFx0Ly8gTWFpbiBsaXN0ZW5lciB3aGljaCByZXNwb25kcyB0byBldmVudHMgZnJvbSB0aGUgZWRpdG9yIHNlcnZpY2Vcblx0XHR0aGlzLl9kaXNwb2FibGVzLmFkZChlZGl0b3JTZXJ2aWNlLm9uRGlkRWRpdG9yc0NoYW5nZSgoZXZlbnQpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVRhYnNNb2RlbChldmVudCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIHVwZGF0ZSBtb2RlbCwgcmVidWlsZGluZycpO1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVUYWJzTW9kZWwoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kaXNwb2FibGVzLmFkZCh0aGlzLl9tdWx0aURpZmZFZGl0b3JJbnB1dExpc3RlbmVycyk7XG5cblx0XHQvLyBTdHJ1Y3R1cmFsIGdyb3VwIGNoYW5nZXMgKGFkZCwgcmVtb3ZlLCBtb3ZlLCBldGMpIGFyZSBkaWZmaWN1bHQgdG8gcGF0Y2guXG5cdFx0Ly8gU2luY2UgdGhleSBoYXBwZW4gaW5mcmVxdWVudGx5IHdlIGp1c3QgcmVidWlsZCB0aGUgZW50aXJlIG1vZGVsXG5cdFx0dGhpcy5fZGlzcG9hYmxlcy5hZGQodGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5vbkRpZEFkZEdyb3VwKCgpID0+IHRoaXMuX2NyZWF0ZVRhYnNNb2RlbCgpKSk7XG5cdFx0dGhpcy5fZGlzcG9hYmxlcy5hZGQodGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5vbkRpZFJlbW92ZUdyb3VwKCgpID0+IHRoaXMuX2NyZWF0ZVRhYnNNb2RlbCgpKSk7XG5cblx0XHQvLyBPbmNlIGV2ZXJ5dGhpbmcgaXMgcmVhZCBnbyBhaGVhZCBhbmQgaW5pdGlhbGl6ZSB0aGUgbW9kZWxcblx0XHR0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLndoZW5SZWFkeS50aGVuKCgpID0+IHRoaXMuX2NyZWF0ZVRhYnNNb2RlbCgpKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZ3JvdXBMb29rdXAuY2xlYXIoKTtcblx0XHR0aGlzLl90YWJJbmZvTG9va3VwLmNsZWFyKCk7XG5cdFx0dGhpcy5fZGlzcG9hYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIHRhYiBvYmplY3Qgd2l0aCB0aGUgY29ycmVjdCBwcm9wZXJ0aWVzXG5cdCAqIEBwYXJhbSBlZGl0b3IgVGhlIGVkaXRvciBpbnB1dCByZXByZXNlbnRlZCBieSB0aGUgdGFiXG5cdCAqIEBwYXJhbSBncm91cCBUaGUgZ3JvdXAgdGhlIHRhYiBpcyBpblxuXHQgKiBAcmV0dXJucyBBIHRhYiBvYmplY3Rcblx0ICovXG5cdHByaXZhdGUgX2J1aWxkVGFiT2JqZWN0KGdyb3VwOiBJRWRpdG9yR3JvdXAsIGVkaXRvcjogRWRpdG9ySW5wdXQsIGVkaXRvckluZGV4OiBudW1iZXIpOiBJRWRpdG9yVGFiRHRvIHtcblx0XHRjb25zdCBlZGl0b3JJZCA9IGVkaXRvci5lZGl0b3JJZDtcblx0XHRjb25zdCB0YWI6IElFZGl0b3JUYWJEdG8gPSB7XG5cdFx0XHRpZDogdGhpcy5fZ2VuZXJhdGVUYWJJZChlZGl0b3IsIGdyb3VwLmlkKSxcblx0XHRcdGxhYmVsOiBlZGl0b3IuZ2V0TmFtZSgpLFxuXHRcdFx0ZWRpdG9ySWQsXG5cdFx0XHRpbnB1dDogdGhpcy5fZWRpdG9ySW5wdXRUb0R0byhlZGl0b3IpLFxuXHRcdFx0aXNQaW5uZWQ6IGdyb3VwLmlzU3RpY2t5KGVkaXRvckluZGV4KSxcblx0XHRcdGlzUHJldmlldzogIWdyb3VwLmlzUGlubmVkKGVkaXRvckluZGV4KSxcblx0XHRcdGlzQWN0aXZlOiBncm91cC5pc0FjdGl2ZShlZGl0b3IpLFxuXHRcdFx0aXNEaXJ0eTogZWRpdG9yLmlzRGlydHkoKVxuXHRcdH07XG5cdFx0cmV0dXJuIHRhYjtcblx0fVxuXG5cdHByaXZhdGUgX2VkaXRvcklucHV0VG9EdG8oZWRpdG9yOiBFZGl0b3JJbnB1dCk6IEFueUlucHV0RHRvIHtcblxuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBNZXJnZUVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiBUYWJJbnB1dEtpbmQuVGV4dE1lcmdlSW5wdXQsXG5cdFx0XHRcdGJhc2U6IGVkaXRvci5iYXNlLFxuXHRcdFx0XHRpbnB1dDE6IGVkaXRvci5pbnB1dDEudXJpLFxuXHRcdFx0XHRpbnB1dDI6IGVkaXRvci5pbnB1dDIudXJpLFxuXHRcdFx0XHRyZXN1bHQ6IGVkaXRvci5yZXNvdXJjZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgQWJzdHJhY3RUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogVGFiSW5wdXRLaW5kLlRleHRJbnB1dCxcblx0XHRcdFx0dXJpOiBlZGl0b3IucmVzb3VyY2Vcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIFNpZGVCeVNpZGVFZGl0b3JJbnB1dCAmJiAhKGVkaXRvciBpbnN0YW5jZW9mIERpZmZFZGl0b3JJbnB1dCkpIHtcblx0XHRcdGNvbnN0IHByaW1hcnlSZXNvdXJjZSA9IGVkaXRvci5wcmltYXJ5LnJlc291cmNlO1xuXHRcdFx0Y29uc3Qgc2Vjb25kYXJ5UmVzb3VyY2UgPSBlZGl0b3Iuc2Vjb25kYXJ5LnJlc291cmNlO1xuXHRcdFx0Ly8gSWYgc2lkZSBieSBzaWRlIGVkaXRvciB3aXRoIHNhbWUgcmVzb3VyY2Ugb24gYm90aCBzaWRlcyB0cmVhdCBpdCBhcyBhIHNpbmd1bGFyIHRhYiBraW5kXG5cdFx0XHRpZiAoZWRpdG9yLnByaW1hcnkgaW5zdGFuY2VvZiBBYnN0cmFjdFRleHRSZXNvdXJjZUVkaXRvcklucHV0XG5cdFx0XHRcdCYmIGVkaXRvci5zZWNvbmRhcnkgaW5zdGFuY2VvZiBBYnN0cmFjdFRleHRSZXNvdXJjZUVkaXRvcklucHV0XG5cdFx0XHRcdCYmIGlzRXF1YWwocHJpbWFyeVJlc291cmNlLCBzZWNvbmRhcnlSZXNvdXJjZSlcblx0XHRcdFx0JiYgcHJpbWFyeVJlc291cmNlXG5cdFx0XHRcdCYmIHNlY29uZGFyeVJlc291cmNlXG5cdFx0XHQpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRraW5kOiBUYWJJbnB1dEtpbmQuVGV4dElucHV0LFxuXHRcdFx0XHRcdHVyaTogcHJpbWFyeVJlc291cmNlXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBraW5kOiBUYWJJbnB1dEtpbmQuVW5rbm93bklucHV0IH07XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIE5vdGVib29rRWRpdG9ySW5wdXQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6IFRhYklucHV0S2luZC5Ob3RlYm9va0lucHV0LFxuXHRcdFx0XHRub3RlYm9va1R5cGU6IGVkaXRvci52aWV3VHlwZSxcblx0XHRcdFx0dXJpOiBlZGl0b3IucmVzb3VyY2Vcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiBUYWJJbnB1dEtpbmQuQ3VzdG9tRWRpdG9ySW5wdXQsXG5cdFx0XHRcdHZpZXdUeXBlOiBlZGl0b3Iudmlld1R5cGUsXG5cdFx0XHRcdHVyaTogZWRpdG9yLnJlc291cmNlLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgV2Vidmlld0lucHV0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiBUYWJJbnB1dEtpbmQuV2Vidmlld0VkaXRvcklucHV0LFxuXHRcdFx0XHR2aWV3VHlwZTogZWRpdG9yLnZpZXdUeXBlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBUZXJtaW5hbEVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiBUYWJJbnB1dEtpbmQuVGVybWluYWxFZGl0b3JJbnB1dFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHRpZiAoZWRpdG9yLm1vZGlmaWVkIGluc3RhbmNlb2YgQWJzdHJhY3RUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCAmJiBlZGl0b3Iub3JpZ2luYWwgaW5zdGFuY2VvZiBBYnN0cmFjdFRleHRSZXNvdXJjZUVkaXRvcklucHV0KSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0a2luZDogVGFiSW5wdXRLaW5kLlRleHREaWZmSW5wdXQsXG5cdFx0XHRcdFx0bW9kaWZpZWQ6IGVkaXRvci5tb2RpZmllZC5yZXNvdXJjZSxcblx0XHRcdFx0XHRvcmlnaW5hbDogZWRpdG9yLm9yaWdpbmFsLnJlc291cmNlXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZWRpdG9yLm1vZGlmaWVkIGluc3RhbmNlb2YgTm90ZWJvb2tFZGl0b3JJbnB1dCAmJiBlZGl0b3Iub3JpZ2luYWwgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvcklucHV0KSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0a2luZDogVGFiSW5wdXRLaW5kLk5vdGVib29rRGlmZklucHV0LFxuXHRcdFx0XHRcdG5vdGVib29rVHlwZTogZWRpdG9yLm9yaWdpbmFsLnZpZXdUeXBlLFxuXHRcdFx0XHRcdG1vZGlmaWVkOiBlZGl0b3IubW9kaWZpZWQucmVzb3VyY2UsXG5cdFx0XHRcdFx0b3JpZ2luYWw6IGVkaXRvci5vcmlnaW5hbC5yZXNvdXJjZVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBJbnRlcmFjdGl2ZUVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiBUYWJJbnB1dEtpbmQuSW50ZXJhY3RpdmVFZGl0b3JJbnB1dCxcblx0XHRcdFx0dXJpOiBlZGl0b3IucmVzb3VyY2UsXG5cdFx0XHRcdGlucHV0Qm94VXJpOiBlZGl0b3IuaW5wdXRSZXNvdXJjZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgQ2hhdEVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiBUYWJJbnB1dEtpbmQuQ2hhdEVkaXRvcklucHV0LFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgTXVsdGlEaWZmRWRpdG9ySW5wdXQpIHtcblx0XHRcdGNvbnN0IGRpZmZFZGl0b3JzOiBUZXh0RGlmZklucHV0RHRvW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgKGVkaXRvcj8ucmVzb3VyY2VzLmdldCgpID8/IFtdKSkge1xuXHRcdFx0XHRpZiAocmVzb3VyY2Uub3JpZ2luYWxVcmkgJiYgcmVzb3VyY2UubW9kaWZpZWRVcmkpIHtcblx0XHRcdFx0XHRkaWZmRWRpdG9ycy5wdXNoKHtcblx0XHRcdFx0XHRcdGtpbmQ6IFRhYklucHV0S2luZC5UZXh0RGlmZklucHV0LFxuXHRcdFx0XHRcdFx0b3JpZ2luYWw6IHJlc291cmNlLm9yaWdpbmFsVXJpLFxuXHRcdFx0XHRcdFx0bW9kaWZpZWQ6IHJlc291cmNlLm1vZGlmaWVkVXJpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogVGFiSW5wdXRLaW5kLk11bHRpRGlmZkVkaXRvcklucHV0LFxuXHRcdFx0XHRkaWZmRWRpdG9yc1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBraW5kOiBUYWJJbnB1dEtpbmQuVW5rbm93bklucHV0IH07XG5cdH1cblxuXHQvKipcblx0ICogR2VuZXJhdGVzIGEgdW5pcXVlIGlkIGZvciBhIHRhYlxuXHQgKiBAcGFyYW0gZWRpdG9yIFRoZSBlZGl0b3IgaW5wdXRcblx0ICogQHBhcmFtIGdyb3VwSWQgVGhlIGdyb3VwIGlkXG5cdCAqIEByZXR1cm5zIEEgdW5pcXVlIGlkZW50aWZpZXIgZm9yIGEgc3BlY2lmaWMgdGFiXG5cdCAqL1xuXHRwcml2YXRlIF9nZW5lcmF0ZVRhYklkKGVkaXRvcjogRWRpdG9ySW5wdXQsIGdyb3VwSWQ6IG51bWJlcikge1xuXHRcdGxldCByZXNvdXJjZVN0cmluZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdC8vIFByb3Blcmx5IGdldCB0aGUgcmVzb3VyY2UgYW5kIGFjY291bnQgZm9yIHNpZGUgYnkgc2lkZSBlZGl0b3JzXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaShlZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQk9USCB9KTtcblx0XHRpZiAocmVzb3VyY2UgaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdHJlc291cmNlU3RyaW5nID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzb3VyY2VTdHJpbmcgPSBgJHtyZXNvdXJjZT8ucHJpbWFyeT8udG9TdHJpbmcoKX0tJHtyZXNvdXJjZT8uc2Vjb25kYXJ5Py50b1N0cmluZygpfWA7XG5cdFx0fVxuXHRcdHJldHVybiBgJHtncm91cElkfX4ke2VkaXRvci5lZGl0b3JJZH0tJHtlZGl0b3IudHlwZUlkfS0ke3Jlc291cmNlU3RyaW5nfSBgO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuZXZlciBhIGdyb3VwIGFjdGl2YXRlcywgdXBkYXRlcyB0aGUgbW9kZWwgYnkgbWFya2luZyB0aGUgZ3JvdXAgYXMgYWN0aXZlIGFuIG5vdGlmaWVzIHRoZSBleHRlbnNpb24gaG9zdFxuXHQgKi9cblx0cHJpdmF0ZSBfb25EaWRHcm91cEFjdGl2YXRlKCkge1xuXHRcdGNvbnN0IGFjdGl2ZUdyb3VwSWQgPSB0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLmFjdGl2ZUdyb3VwLmlkO1xuXHRcdGNvbnN0IGFjdGl2ZUdyb3VwID0gdGhpcy5fZ3JvdXBMb29rdXAuZ2V0KGFjdGl2ZUdyb3VwSWQpO1xuXHRcdGlmIChhY3RpdmVHcm91cCkge1xuXHRcdFx0Ly8gT2sgbm90IHRvIGxvb3AgYXMgZXh0aG9zdCBhY2NlcHRzIGxhc3QgYWN0aXZlIGdyb3VwXG5cdFx0XHRhY3RpdmVHcm91cC5pc0FjdGl2ZSA9IHRydWU7XG5cdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0VGFiR3JvdXBVcGRhdGUoYWN0aXZlR3JvdXApO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgd2hlbiB0aGUgdGFiIGxhYmVsIGNoYW5nZXNcblx0ICogQHBhcmFtIGdyb3VwSWQgVGhlIGlkIG9mIHRoZSBncm91cCB0aGUgdGFiIGV4aXN0cyBpblxuXHQgKiBAcGFyYW0gZWRpdG9ySW5wdXQgVGhlIGVkaXRvciBpbnB1dCByZXByZXNlbnRlZCBieSB0aGUgdGFiXG5cdCAqL1xuXHRwcml2YXRlIF9vbkRpZFRhYkxhYmVsQ2hhbmdlKGdyb3VwSWQ6IG51bWJlciwgZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0LCBlZGl0b3JJbmRleDogbnVtYmVyKSB7XG5cdFx0Y29uc3QgdGFiSWQgPSB0aGlzLl9nZW5lcmF0ZVRhYklkKGVkaXRvcklucHV0LCBncm91cElkKTtcblx0XHRjb25zdCB0YWJJbmZvID0gdGhpcy5fdGFiSW5mb0xvb2t1cC5nZXQodGFiSWQpO1xuXHRcdC8vIElmIHRhYiBpcyBmb3VuZCBwYXRjaCwgZWxzZSByZWJ1aWxkXG5cdFx0aWYgKHRhYkluZm8pIHtcblx0XHRcdHRhYkluZm8udGFiLmxhYmVsID0gZWRpdG9ySW5wdXQuZ2V0TmFtZSgpO1xuXHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdFRhYk9wZXJhdGlvbih7XG5cdFx0XHRcdGdyb3VwSWQsXG5cdFx0XHRcdGluZGV4OiBlZGl0b3JJbmRleCxcblx0XHRcdFx0dGFiRHRvOiB0YWJJbmZvLnRhYixcblx0XHRcdFx0a2luZDogVGFiTW9kZWxPcGVyYXRpb25LaW5kLlRBQl9VUERBVEVcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdJbnZhbGlkIG1vZGVsIGZvciBsYWJlbCBjaGFuZ2UsIHJlYnVpbGRpbmcnKTtcblx0XHRcdHRoaXMuX2NyZWF0ZVRhYnNNb2RlbCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgd2hlbiBhIG5ldyB0YWIgaXMgb3BlbmVkXG5cdCAqIEBwYXJhbSBncm91cElkIFRoZSBpZCBvZiB0aGUgZ3JvdXAgdGhlIHRhYiBpcyBiZWluZyBjcmVhdGVkIGluXG5cdCAqIEBwYXJhbSBlZGl0b3JJbnB1dCBUaGUgZWRpdG9yIGlucHV0IGJlaW5nIG9wZW5lZFxuXHQgKiBAcGFyYW0gZWRpdG9ySW5kZXggVGhlIGluZGV4IG9mIHRoZSBlZGl0b3Igd2l0aGluIHRoYXQgZ3JvdXBcblx0ICovXG5cdHByaXZhdGUgX29uRGlkVGFiT3Blbihncm91cElkOiBudW1iZXIsIGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCwgZWRpdG9ySW5kZXg6IG51bWJlcikge1xuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5nZXRHcm91cChncm91cElkKTtcblx0XHQvLyBFdmVuIGlmIHRoZSBlZGl0b3Igc2VydmljZSBrbm93cyBhYm91dCB0aGUgZ3JvdXAgdGhlIGdyb3VwIG1pZ2h0IG5vdCBleGlzdCB5ZXQgaW4gb3VyIG1vZGVsXG5cdFx0Y29uc3QgZ3JvdXBJbk1vZGVsID0gdGhpcy5fZ3JvdXBMb29rdXAuZ2V0KGdyb3VwSWQpICE9PSB1bmRlZmluZWQ7XG5cdFx0Ly8gTWVhbnMgYSBuZXcgZ3JvdXAgd2FzIGxpa2VseSBjcmVhdGVkIHNvIHdlIHJlYnVpbGQgdGhlIG1vZGVsXG5cdFx0aWYgKCFncm91cCB8fCAhZ3JvdXBJbk1vZGVsKSB7XG5cdFx0XHR0aGlzLl9jcmVhdGVUYWJzTW9kZWwoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGFicyA9IHRoaXMuX2dyb3VwTG9va3VwLmdldChncm91cElkKT8udGFicztcblx0XHRpZiAoIXRhYnMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gU3BsaWNlIHRhYiBpbnRvIGdyb3VwIGF0IGluZGV4IGVkaXRvckluZGV4XG5cdFx0Y29uc3QgdGFiT2JqZWN0ID0gdGhpcy5fYnVpbGRUYWJPYmplY3QoZ3JvdXAsIGVkaXRvcklucHV0LCBlZGl0b3JJbmRleCk7XG5cdFx0dGFicy5zcGxpY2UoZWRpdG9ySW5kZXgsIDAsIHRhYk9iamVjdCk7XG5cdFx0Ly8gVXBkYXRlIGxvb2t1cFxuXHRcdGNvbnN0IHRhYklkID0gdGhpcy5fZ2VuZXJhdGVUYWJJZChlZGl0b3JJbnB1dCwgZ3JvdXBJZCk7XG5cdFx0dGhpcy5fdGFiSW5mb0xvb2t1cC5zZXQodGFiSWQsIHsgZ3JvdXAsIGVkaXRvcklucHV0LCB0YWI6IHRhYk9iamVjdCB9KTtcblxuXHRcdGlmIChlZGl0b3JJbnB1dCBpbnN0YW5jZW9mIE11bHRpRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHR0aGlzLl9tdWx0aURpZmZFZGl0b3JJbnB1dExpc3RlbmVycy5zZXQoZWRpdG9ySW5wdXQsIEV2ZW50LmZyb21PYnNlcnZhYmxlTGlnaHQoZWRpdG9ySW5wdXQucmVzb3VyY2VzKSgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhYkluZm8gPSB0aGlzLl90YWJJbmZvTG9va3VwLmdldCh0YWJJZCk7XG5cdFx0XHRcdGlmICghdGFiSW5mbykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0YWJJbmZvLnRhYiA9IHRoaXMuX2J1aWxkVGFiT2JqZWN0KGdyb3VwLCBlZGl0b3JJbnB1dCwgZWRpdG9ySW5kZXgpO1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdFx0XHRncm91cElkLFxuXHRcdFx0XHRcdGluZGV4OiBlZGl0b3JJbmRleCxcblx0XHRcdFx0XHR0YWJEdG86IHRhYkluZm8udGFiLFxuXHRcdFx0XHRcdGtpbmQ6IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfVVBEQVRFXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRUYWJPcGVyYXRpb24oe1xuXHRcdFx0Z3JvdXBJZCxcblx0XHRcdGluZGV4OiBlZGl0b3JJbmRleCxcblx0XHRcdHRhYkR0bzogdGFiT2JqZWN0LFxuXHRcdFx0a2luZDogVGFiTW9kZWxPcGVyYXRpb25LaW5kLlRBQl9PUEVOXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIHdoZW4gYSB0YWIgaXMgY2xvc2VkXG5cdCAqIEBwYXJhbSBncm91cElkIFRoZSBpZCBvZiB0aGUgZ3JvdXAgdGhlIHRhYiBpcyBiZWluZyByZW1vdmVkIGZyb21cblx0ICogQHBhcmFtIGVkaXRvckluZGV4IFRoZSBpbmRleCBvZiB0aGUgZWRpdG9yIHdpdGhpbiB0aGF0IGdyb3VwXG5cdCAqL1xuXHRwcml2YXRlIF9vbkRpZFRhYkNsb3NlKGdyb3VwSWQ6IG51bWJlciwgZWRpdG9ySW5kZXg6IG51bWJlcikge1xuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5nZXRHcm91cChncm91cElkKTtcblx0XHRjb25zdCB0YWJzID0gdGhpcy5fZ3JvdXBMb29rdXAuZ2V0KGdyb3VwSWQpPy50YWJzO1xuXHRcdC8vIFNvbWV0aGluZyBpcyB3cm9uZyB3aXRoIHRoZSBtb2RlbCBzdGF0ZSBzbyB3ZSByZWJ1aWxkXG5cdFx0aWYgKCFncm91cCB8fCAhdGFicykge1xuXHRcdFx0dGhpcy5fY3JlYXRlVGFic01vZGVsKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFNwbGljZSB0YWIgaW50byBncm91cCBhdCBpbmRleCBlZGl0b3JJbmRleFxuXHRcdGNvbnN0IHJlbW92ZWRUYWIgPSB0YWJzLnNwbGljZShlZGl0b3JJbmRleCwgMSk7XG5cblx0XHQvLyBJbmRleCBtdXN0IG5vIGxvbmdlciBiZSB2YWxpZCBzbyB3ZSByZXR1cm4gcHJlbWF0dXJlbHlcblx0XHRpZiAocmVtb3ZlZFRhYi5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgbG9va3VwXG5cdFx0dGhpcy5fdGFiSW5mb0xvb2t1cC5kZWxldGUocmVtb3ZlZFRhYlswXT8uaWQgPz8gJycpO1xuXG5cdFx0aWYgKHJlbW92ZWRUYWJbMF0/LmlucHV0IGluc3RhbmNlb2YgTXVsdGlEaWZmRWRpdG9ySW5wdXQpIHtcblx0XHRcdHRoaXMuX211bHRpRGlmZkVkaXRvcklucHV0TGlzdGVuZXJzLmRlbGV0ZUFuZERpc3Bvc2UocmVtb3ZlZFRhYlswXT8uaW5wdXQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRUYWJPcGVyYXRpb24oe1xuXHRcdFx0Z3JvdXBJZCxcblx0XHRcdGluZGV4OiBlZGl0b3JJbmRleCxcblx0XHRcdHRhYkR0bzogcmVtb3ZlZFRhYlswXSxcblx0XHRcdGtpbmQ6IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfQ0xPU0Vcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgd2hlbiB0aGUgYWN0aXZlIHRhYiBjaGFuZ2VzXG5cdCAqIEBwYXJhbSBncm91cElkIFRoZSBpZCBvZiB0aGUgZ3JvdXAgdGhlIHRhYiBpcyBjb250YWluZWQgaW5cblx0ICogQHBhcmFtIGVkaXRvckluZGV4IFRoZSBpbmRleCBvZiB0aGUgdGFiXG5cdCAqL1xuXHRwcml2YXRlIF9vbkRpZFRhYkFjdGl2ZUNoYW5nZShncm91cElkOiBudW1iZXIsIGVkaXRvckluZGV4OiBudW1iZXIpIHtcblx0XHQvLyBUT0RPIEBscmFtb3MxNSB1c2UgdGhlIHRhYiBsb29rdXAgaGVyZSBpZiBwb3NzaWJsZS4gRG8gd2UgaGF2ZSBhbiBlZGl0b3IgaW5wdXQ/IVxuXHRcdGNvbnN0IHRhYnMgPSB0aGlzLl9ncm91cExvb2t1cC5nZXQoZ3JvdXBJZCk/LnRhYnM7XG5cdFx0aWYgKCF0YWJzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2ZVRhYiA9IHRhYnNbZWRpdG9ySW5kZXhdO1xuXHRcdC8vIE5vIG5lZWQgdG8gbG9vcCBvdmVyIGFzIHRoZSBleHRob3N0IHVzZXMgdGhlIG1vc3QgcmVjZW50bHkgbWFya2VkIGFjdGl2ZSB0YWJcblx0XHRhY3RpdmVUYWIuaXNBY3RpdmUgPSB0cnVlO1xuXHRcdC8vIFNlbmQgRFRPIHVwZGF0ZSB0byB0aGUgZXh0aG9zdFxuXHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRUYWJPcGVyYXRpb24oe1xuXHRcdFx0Z3JvdXBJZCxcblx0XHRcdGluZGV4OiBlZGl0b3JJbmRleCxcblx0XHRcdHRhYkR0bzogYWN0aXZlVGFiLFxuXHRcdFx0a2luZDogVGFiTW9kZWxPcGVyYXRpb25LaW5kLlRBQl9VUERBVEVcblx0XHR9KTtcblxuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIHRoZSBkaXJ0eSBpbmRpY2F0b3Igb24gdGhlIHRhYiBjaGFuZ2VzXG5cdCAqIEBwYXJhbSBncm91cElkIFRoZSBpZCBvZiB0aGUgZ3JvdXAgdGhlIHRhYiBpcyBpblxuXHQgKiBAcGFyYW0gZWRpdG9ySW5kZXggVGhlIGluZGV4IG9mIHRoZSB0YWJcblx0ICogQHBhcmFtIGVkaXRvciBUaGUgZWRpdG9yIGlucHV0IHJlcHJlc2VudGVkIGJ5IHRoZSB0YWJcblx0ICovXG5cdHByaXZhdGUgX29uRGlkVGFiRGlydHkoZ3JvdXBJZDogbnVtYmVyLCBlZGl0b3JJbmRleDogbnVtYmVyLCBlZGl0b3I6IEVkaXRvcklucHV0KSB7XG5cdFx0Y29uc3QgdGFiSWQgPSB0aGlzLl9nZW5lcmF0ZVRhYklkKGVkaXRvciwgZ3JvdXBJZCk7XG5cdFx0Y29uc3QgdGFiSW5mbyA9IHRoaXMuX3RhYkluZm9Mb29rdXAuZ2V0KHRhYklkKTtcblx0XHQvLyBTb21ldGhpbmcgd3Jvbmcgd2l0aCB0aGUgbW9kZWwgc3RhdGUgc28gd2UgcmVidWlsZFxuXHRcdGlmICghdGFiSW5mbykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignSW52YWxpZCBtb2RlbCBmb3IgZGlydHkgY2hhbmdlLCByZWJ1aWxkaW5nJyk7XG5cdFx0XHR0aGlzLl9jcmVhdGVUYWJzTW9kZWwoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGFiSW5mby50YWIuaXNEaXJ0eSA9IGVkaXRvci5pc0RpcnR5KCk7XG5cdFx0dGhpcy5fcHJveHkuJGFjY2VwdFRhYk9wZXJhdGlvbih7XG5cdFx0XHRncm91cElkLFxuXHRcdFx0aW5kZXg6IGVkaXRvckluZGV4LFxuXHRcdFx0dGFiRHRvOiB0YWJJbmZvLnRhYixcblx0XHRcdGtpbmQ6IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfVVBEQVRFXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIHdoZW4gdGhlIHRhYiBpcyBwaW5uZWQvdW5waW5uZWRcblx0ICogQHBhcmFtIGdyb3VwSWQgVGhlIGlkIG9mIHRoZSBncm91cCB0aGUgdGFiIGlzIGluXG5cdCAqIEBwYXJhbSBlZGl0b3JJbmRleCBUaGUgaW5kZXggb2YgdGhlIHRhYlxuXHQgKiBAcGFyYW0gZWRpdG9yIFRoZSBlZGl0b3IgaW5wdXQgcmVwcmVzZW50ZWQgYnkgdGhlIHRhYlxuXHQgKi9cblx0cHJpdmF0ZSBfb25EaWRUYWJQaW5DaGFuZ2UoZ3JvdXBJZDogbnVtYmVyLCBlZGl0b3JJbmRleDogbnVtYmVyLCBlZGl0b3I6IEVkaXRvcklucHV0KSB7XG5cdFx0Y29uc3QgdGFiSWQgPSB0aGlzLl9nZW5lcmF0ZVRhYklkKGVkaXRvciwgZ3JvdXBJZCk7XG5cdFx0Y29uc3QgdGFiSW5mbyA9IHRoaXMuX3RhYkluZm9Mb29rdXAuZ2V0KHRhYklkKTtcblx0XHRjb25zdCBncm91cCA9IHRhYkluZm8/Lmdyb3VwO1xuXHRcdGNvbnN0IHRhYiA9IHRhYkluZm8/LnRhYjtcblx0XHQvLyBTb21ldGhpbmcgd3Jvbmcgd2l0aCB0aGUgbW9kZWwgc3RhdGUgc28gd2UgcmVidWlsZFxuXHRcdGlmICghZ3JvdXAgfHwgIXRhYikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignSW52YWxpZCBtb2RlbCBmb3Igc3RpY2t5IGNoYW5nZSwgcmVidWlsZGluZycpO1xuXHRcdFx0dGhpcy5fY3JlYXRlVGFic01vZGVsKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFdoZXRoZXIgb3Igbm90IHRoZSB0YWIgaGFzIHRoZSBwaW4gaWNvbiAoaW50ZXJuYWxseSBpdCdzIGNhbGxlZCBzdGlja3kpXG5cdFx0dGFiLmlzUGlubmVkID0gZ3JvdXAuaXNTdGlja3koZWRpdG9ySW5kZXgpO1xuXHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRUYWJPcGVyYXRpb24oe1xuXHRcdFx0Z3JvdXBJZCxcblx0XHRcdGluZGV4OiBlZGl0b3JJbmRleCxcblx0XHRcdHRhYkR0bzogdGFiLFxuXHRcdFx0a2luZDogVGFiTW9kZWxPcGVyYXRpb25LaW5kLlRBQl9VUERBVEVcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuICogQ2FsbGVkIHdoZW4gdGhlIHRhYiBpcyBwcmV2aWV3IC8gdW5wcmV2aWV3ZWRcbiAqIEBwYXJhbSBncm91cElkIFRoZSBpZCBvZiB0aGUgZ3JvdXAgdGhlIHRhYiBpcyBpblxuICogQHBhcmFtIGVkaXRvckluZGV4IFRoZSBpbmRleCBvZiB0aGUgdGFiXG4gKiBAcGFyYW0gZWRpdG9yIFRoZSBlZGl0b3IgaW5wdXQgcmVwcmVzZW50ZWQgYnkgdGhlIHRhYlxuICovXG5cdHByaXZhdGUgX29uRGlkVGFiUHJldmlld0NoYW5nZShncm91cElkOiBudW1iZXIsIGVkaXRvckluZGV4OiBudW1iZXIsIGVkaXRvcjogRWRpdG9ySW5wdXQpIHtcblx0XHRjb25zdCB0YWJJZCA9IHRoaXMuX2dlbmVyYXRlVGFiSWQoZWRpdG9yLCBncm91cElkKTtcblx0XHRjb25zdCB0YWJJbmZvID0gdGhpcy5fdGFiSW5mb0xvb2t1cC5nZXQodGFiSWQpO1xuXHRcdGNvbnN0IGdyb3VwID0gdGFiSW5mbz8uZ3JvdXA7XG5cdFx0Y29uc3QgdGFiID0gdGFiSW5mbz8udGFiO1xuXHRcdC8vIFNvbWV0aGluZyB3cm9uZyB3aXRoIHRoZSBtb2RlbCBzdGF0ZSBzbyB3ZSByZWJ1aWxkXG5cdFx0aWYgKCFncm91cCB8fCAhdGFiKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdJbnZhbGlkIG1vZGVsIGZvciBzdGlja3kgY2hhbmdlLCByZWJ1aWxkaW5nJyk7XG5cdFx0XHR0aGlzLl9jcmVhdGVUYWJzTW9kZWwoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gV2hldGhlciBvciBub3QgdGhlIHRhYiBoYXMgdGhlIHBpbiBpY29uIChpbnRlcm5hbGx5IGl0J3MgY2FsbGVkIHBpbm5lZClcblx0XHR0YWIuaXNQcmV2aWV3ID0gIWdyb3VwLmlzUGlubmVkKGVkaXRvckluZGV4KTtcblx0XHR0aGlzLl9wcm94eS4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdGtpbmQ6IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfVVBEQVRFLFxuXHRcdFx0Z3JvdXBJZCxcblx0XHRcdHRhYkR0bzogdGFiLFxuXHRcdFx0aW5kZXg6IGVkaXRvckluZGV4XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZFRhYk1vdmUoZ3JvdXBJZDogbnVtYmVyLCBlZGl0b3JJbmRleDogbnVtYmVyLCBvbGRFZGl0b3JJbmRleDogbnVtYmVyLCBlZGl0b3I6IEVkaXRvcklucHV0KSB7XG5cdFx0Y29uc3QgdGFicyA9IHRoaXMuX2dyb3VwTG9va3VwLmdldChncm91cElkKT8udGFicztcblx0XHQvLyBTb21ldGhpbmcgd3Jvbmcgd2l0aCB0aGUgbW9kZWwgc3RhdGUgc28gd2UgcmVidWlsZFxuXHRcdGlmICghdGFicykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignSW52YWxpZCBtb2RlbCBmb3IgbW92ZSBjaGFuZ2UsIHJlYnVpbGRpbmcnKTtcblx0XHRcdHRoaXMuX2NyZWF0ZVRhYnNNb2RlbCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE1vdmUgdGFiIGZyb20gb2xkIGluZGV4IHRvIG5ldyBpbmRleFxuXHRcdGNvbnN0IHJlbW92ZWRUYWIgPSB0YWJzLnNwbGljZShvbGRFZGl0b3JJbmRleCwgMSk7XG5cdFx0aWYgKHJlbW92ZWRUYWIubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRhYnMuc3BsaWNlKGVkaXRvckluZGV4LCAwLCByZW1vdmVkVGFiWzBdKTtcblxuXHRcdC8vIE5vdGlmeSBleHRob3N0IG9mIG1vdmVcblx0XHR0aGlzLl9wcm94eS4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdGtpbmQ6IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfTU9WRSxcblx0XHRcdGdyb3VwSWQsXG5cdFx0XHR0YWJEdG86IHJlbW92ZWRUYWJbMF0sXG5cdFx0XHRpbmRleDogZWRpdG9ySW5kZXgsXG5cdFx0XHRvbGRJbmRleDogb2xkRWRpdG9ySW5kZXhcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZHMgdGhlIG1vZGVsIGZyb20gc2NyYXRjaCBiYXNlZCBvbiB0aGUgY3VycmVudCBzdGF0ZSBvZiB0aGUgZWRpdG9yIHNlcnZpY2UuXG5cdCAqL1xuXHRwcml2YXRlIF9jcmVhdGVUYWJzTW9kZWwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuZ3JvdXBzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuOyAvLyBza2lwIHRoaXMgaW52YWxpZCBzdGF0ZSwgaXQgbWF5IGhhcHBlbiB3aGVuIHRoZSBlbnRpcmUgZWRpdG9yIGFyZWEgaXMgdHJhbnNpdGlvbmluZyB0byBvdGhlciBzdGF0ZSAoXCJlZGl0b3Igd29ya2luZyBzZXRzXCIpXG5cdFx0fVxuXG5cdFx0dGhpcy5fdGFiR3JvdXBNb2RlbCA9IFtdO1xuXHRcdHRoaXMuX2dyb3VwTG9va3VwLmNsZWFyKCk7XG5cdFx0dGhpcy5fdGFiSW5mb0xvb2t1cC5jbGVhcigpO1xuXHRcdGxldCB0YWJzOiBJRWRpdG9yVGFiRHRvW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuZ3JvdXBzKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50VGFiR3JvdXBNb2RlbDogSUVkaXRvclRhYkdyb3VwRHRvID0ge1xuXHRcdFx0XHRncm91cElkOiBncm91cC5pZCxcblx0XHRcdFx0aXNBY3RpdmU6IGdyb3VwLmlkID09PSB0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLmFjdGl2ZUdyb3VwLmlkLFxuXHRcdFx0XHR2aWV3Q29sdW1uOiBlZGl0b3JHcm91cFRvQ29sdW1uKHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UsIGdyb3VwKSxcblx0XHRcdFx0dGFiczogW11cblx0XHRcdH07XG5cdFx0XHRncm91cC5lZGl0b3JzLmZvckVhY2goKGVkaXRvciwgZWRpdG9ySW5kZXgpID0+IHtcblx0XHRcdFx0Y29uc3QgdGFiID0gdGhpcy5fYnVpbGRUYWJPYmplY3QoZ3JvdXAsIGVkaXRvciwgZWRpdG9ySW5kZXgpO1xuXHRcdFx0XHR0YWJzLnB1c2godGFiKTtcblx0XHRcdFx0Ly8gQWRkIGluZm9ybWF0aW9uIGFib3V0IHRoZSB0YWIgdG8gdGhlIGxvb2t1cFxuXHRcdFx0XHR0aGlzLl90YWJJbmZvTG9va3VwLnNldCh0aGlzLl9nZW5lcmF0ZVRhYklkKGVkaXRvciwgZ3JvdXAuaWQpLCB7XG5cdFx0XHRcdFx0Z3JvdXAsXG5cdFx0XHRcdFx0dGFiLFxuXHRcdFx0XHRcdGVkaXRvcklucHV0OiBlZGl0b3Jcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHRcdGN1cnJlbnRUYWJHcm91cE1vZGVsLnRhYnMgPSB0YWJzO1xuXHRcdFx0dGhpcy5fdGFiR3JvdXBNb2RlbC5wdXNoKGN1cnJlbnRUYWJHcm91cE1vZGVsKTtcblx0XHRcdHRoaXMuX2dyb3VwTG9va3VwLnNldChncm91cC5pZCwgY3VycmVudFRhYkdyb3VwTW9kZWwpO1xuXHRcdFx0dGFicyA9IFtdO1xuXHRcdH1cblx0XHQvLyBub3RpZnkgdGhlIGV4dCBob3N0IG9mIHRoZSBuZXcgbW9kZWxcblx0XHR0aGlzLl9wcm94eS4kYWNjZXB0RWRpdG9yVGFiTW9kZWwodGhpcy5fdGFiR3JvdXBNb2RlbCk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIG1haW4gaGFuZGxlciBmb3IgdGhlIHRhYiBldmVudHNcblx0ICogQHBhcmFtIGV2ZW50cyBUaGUgbGlzdCBvZiBldmVudHMgdG8gcHJvY2Vzc1xuXHQgKi9cblx0cHJpdmF0ZSBfdXBkYXRlVGFic01vZGVsKGNoYW5nZUV2ZW50OiBJRWRpdG9yc0NoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZXZlbnQgPSBjaGFuZ2VFdmVudC5ldmVudDtcblx0XHRjb25zdCBncm91cElkID0gY2hhbmdlRXZlbnQuZ3JvdXBJZDtcblx0XHRzd2l0Y2ggKGV2ZW50LmtpbmQpIHtcblx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfQUNUSVZFOlxuXHRcdFx0XHRpZiAoZ3JvdXBJZCA9PT0gdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5hY3RpdmVHcm91cC5pZCkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkR3JvdXBBY3RpdmF0ZSgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfTEFCRUw6XG5cdFx0XHRcdGlmIChldmVudC5lZGl0b3IgIT09IHVuZGVmaW5lZCAmJiBldmVudC5lZGl0b3JJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRUYWJMYWJlbENoYW5nZShncm91cElkLCBldmVudC5lZGl0b3IsIGV2ZW50LmVkaXRvckluZGV4KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfT1BFTjpcblx0XHRcdFx0aWYgKGV2ZW50LmVkaXRvciAhPT0gdW5kZWZpbmVkICYmIGV2ZW50LmVkaXRvckluZGV4ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFRhYk9wZW4oZ3JvdXBJZCwgZXZlbnQuZWRpdG9yLCBldmVudC5lZGl0b3JJbmRleCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0NMT1NFOlxuXHRcdFx0XHRpZiAoZXZlbnQuZWRpdG9ySW5kZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkVGFiQ2xvc2UoZ3JvdXBJZCwgZXZlbnQuZWRpdG9ySW5kZXgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9BQ1RJVkU6XG5cdFx0XHRcdGlmIChldmVudC5lZGl0b3JJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRUYWJBY3RpdmVDaGFuZ2UoZ3JvdXBJZCwgZXZlbnQuZWRpdG9ySW5kZXgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9ESVJUWTpcblx0XHRcdFx0aWYgKGV2ZW50LmVkaXRvckluZGV4ICE9PSB1bmRlZmluZWQgJiYgZXZlbnQuZWRpdG9yICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFRhYkRpcnR5KGdyb3VwSWQsIGV2ZW50LmVkaXRvckluZGV4LCBldmVudC5lZGl0b3IpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9TVElDS1k6XG5cdFx0XHRcdGlmIChldmVudC5lZGl0b3JJbmRleCAhPT0gdW5kZWZpbmVkICYmIGV2ZW50LmVkaXRvciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRUYWJQaW5DaGFuZ2UoZ3JvdXBJZCwgZXZlbnQuZWRpdG9ySW5kZXgsIGV2ZW50LmVkaXRvcik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX1BJTjpcblx0XHRcdFx0aWYgKGV2ZW50LmVkaXRvckluZGV4ICE9PSB1bmRlZmluZWQgJiYgZXZlbnQuZWRpdG9yICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFRhYlByZXZpZXdDaGFuZ2UoZ3JvdXBJZCwgZXZlbnQuZWRpdG9ySW5kZXgsIGV2ZW50LmVkaXRvcik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX1RSQU5TSUVOVDpcblx0XHRcdFx0Ly8gQ3VycmVudGx5IG5vdCBleHBvc2VkIGluIHRoZSBBUElcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUlNfU0VMRUNUSU9OOlxuXHRcdFx0XHQvLyBNdWx0aS1zZWxlY3Qgc3RhdGUgb2YgZWRpdG9ycyBpcyB3b3JrYmVuY2gtaW50ZXJuYWwgYW5kIG5vdCBleHBvc2VkIGluIHRoZSB0YWJzIEFQSS5cblx0XHRcdFx0Ly8gVHJlYXQgYXMgbm8tb3Agc28gd2UgZG8gbm90IHJlYnVpbGQgdGhlIGVudGlyZSBtb2RlbCAod2hpY2ggd291bGQgaW52YWxpZGF0ZVxuXHRcdFx0XHQvLyBhbnkgYHZzY29kZS5UYWJgIHJlZmVyZW5jZXMgdGhlIGV4dGVuc2lvbiBpcyBjdXJyZW50bHkgaG9sZGluZykuXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfTU9WRTpcblx0XHRcdFx0aWYgKGlzR3JvdXBFZGl0b3JNb3ZlRXZlbnQoZXZlbnQpICYmIGV2ZW50LmVkaXRvciAmJiBldmVudC5lZGl0b3JJbmRleCAhPT0gdW5kZWZpbmVkICYmIGV2ZW50Lm9sZEVkaXRvckluZGV4ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFRhYk1vdmUoZ3JvdXBJZCwgZXZlbnQuZWRpdG9ySW5kZXgsIGV2ZW50Lm9sZEVkaXRvckluZGV4LCBldmVudC5lZGl0b3IpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHQvLyBJZiBpdCdzIG5vdCBhbiBvcHRpbWl6ZWQgY2FzZSB3ZSByZWJ1aWxkIHRoZSB0YWJzIG1vZGVsIGZyb20gc2NyYXRjaFxuXHRcdFx0XHR0aGlzLl9jcmVhdGVUYWJzTW9kZWwoKTtcblx0XHR9XG5cdH1cblx0Ly8jcmVnaW9uIE1lc3NhZ2VzIHJlY2VpdmVkIGZyb20gRXh0IEhvc3Rcblx0JG1vdmVUYWIodGFiSWQ6IHN0cmluZywgaW5kZXg6IG51bWJlciwgdmlld0NvbHVtbjogRWRpdG9yR3JvdXBDb2x1bW4sIHByZXNlcnZlRm9jdXM/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgZ3JvdXBJZCA9IGNvbHVtblRvRWRpdG9yR3JvdXAodGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHZpZXdDb2x1bW4pO1xuXHRcdGNvbnN0IHRhYkluZm8gPSB0aGlzLl90YWJJbmZvTG9va3VwLmdldCh0YWJJZCk7XG5cdFx0Y29uc3QgdGFiID0gdGFiSW5mbz8udGFiO1xuXHRcdGlmICghdGFiKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEF0dGVtcHRlZCB0byBjbG9zZSB0YWIgd2l0aCBpZCAke3RhYklkfSB3aGljaCBkb2VzIG5vdCBleGlzdGApO1xuXHRcdH1cblx0XHRsZXQgdGFyZ2V0R3JvdXA6IElFZGl0b3JHcm91cCB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzb3VyY2VHcm91cCA9IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXAodGFiSW5mby5ncm91cC5pZCk7XG5cdFx0aWYgKCFzb3VyY2VHcm91cCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBJZiBncm91cCBpbmRleCBpcyBvdXQgb2YgYm91bmRzIHRoZW4gd2UgbWFrZSBhIG5ldyBvbmUgdGhhdCdzIHRvIHRoZSByaWdodCBvZiB0aGUgbGFzdCBncm91cFxuXHRcdGlmICh0aGlzLl9ncm91cExvb2t1cC5nZXQoZ3JvdXBJZCkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0bGV0IGRpcmVjdGlvbiA9IEdyb3VwRGlyZWN0aW9uLlJJR0hUO1xuXHRcdFx0Ly8gTWFrZSBzdXJlIHdlIHJlc3BlY3QgdGhlIHVzZXIncyBwcmVmZXJyZWQgc2lkZSBkaXJlY3Rpb25cblx0XHRcdGlmICh2aWV3Q29sdW1uID09PSBTSURFX0dST1VQKSB7XG5cdFx0XHRcdGRpcmVjdGlvbiA9IHByZWZlcnJlZFNpZGVCeVNpZGVHcm91cERpcmVjdGlvbih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHR9XG5cdFx0XHR0YXJnZXRHcm91cCA9IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuYWRkR3JvdXAodGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5ncm91cHNbdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5ncm91cHMubGVuZ3RoIC0gMV0sIGRpcmVjdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRhcmdldEdyb3VwID0gdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5nZXRHcm91cChncm91cElkKTtcblx0XHR9XG5cdFx0aWYgKCF0YXJnZXRHcm91cCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNpbWlsYXIgbG9naWMgdG8gaWYgaW5kZXggaXMgb3V0IG9mIGJvdW5kcyB3ZSBwbGFjZSBpdCBhdCB0aGUgZW5kXG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+IHRhcmdldEdyb3VwLmVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRpbmRleCA9IHRhcmdldEdyb3VwLmVkaXRvcnMubGVuZ3RoO1xuXHRcdH1cblx0XHQvLyBGaW5kIHRoZSBjb3JyZWN0IEVkaXRvcklucHV0IHVzaW5nIHRoZSB0YWIgaW5mb1xuXHRcdGNvbnN0IGVkaXRvcklucHV0ID0gdGFiSW5mbz8uZWRpdG9ySW5wdXQ7XG5cdFx0aWYgKCFlZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBNb3ZlIHRoZSBlZGl0b3IgdG8gdGhlIHRhcmdldCBncm91cFxuXHRcdHNvdXJjZUdyb3VwLm1vdmVFZGl0b3IoZWRpdG9ySW5wdXQsIHRhcmdldEdyb3VwLCB7IGluZGV4LCBwcmVzZXJ2ZUZvY3VzIH0pO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGFzeW5jICRjbG9zZVRhYih0YWJJZHM6IHN0cmluZ1tdLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGdyb3VwczogTWFwPElFZGl0b3JHcm91cCwgRWRpdG9ySW5wdXRbXT4gPSBuZXcgTWFwKCk7XG5cdFx0Zm9yIChjb25zdCB0YWJJZCBvZiB0YWJJZHMpIHtcblx0XHRcdGNvbnN0IHRhYkluZm8gPSB0aGlzLl90YWJJbmZvTG9va3VwLmdldCh0YWJJZCk7XG5cdFx0XHRjb25zdCB0YWIgPSB0YWJJbmZvPy50YWI7XG5cdFx0XHRjb25zdCBncm91cCA9IHRhYkluZm8/Lmdyb3VwO1xuXHRcdFx0Y29uc3QgZWRpdG9yVGFiID0gdGFiSW5mbz8uZWRpdG9ySW5wdXQ7XG5cdFx0XHQvLyBJZiBub3QgZm91bmQgc2tpcFxuXHRcdFx0aWYgKCFncm91cCB8fCAhdGFiIHx8ICF0YWJJbmZvIHx8ICFlZGl0b3JUYWIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBncm91cEVkaXRvcnMgPSBncm91cHMuZ2V0KGdyb3VwKTtcblx0XHRcdGlmICghZ3JvdXBFZGl0b3JzKSB7XG5cdFx0XHRcdGdyb3Vwcy5zZXQoZ3JvdXAsIFtlZGl0b3JUYWJdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGdyb3VwRWRpdG9ycy5wdXNoKGVkaXRvclRhYik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIExvb3Agb3ZlciBrZXlzIG9mIHRoZSBncm91cHMgbWFwIGFuZCBjYWxsIGNsb3NlRWRpdG9yc1xuXHRcdGNvbnN0IHJlc3VsdHM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2dyb3VwLCBlZGl0b3JzXSBvZiBncm91cHMpIHtcblx0XHRcdHJlc3VsdHMucHVzaChhd2FpdCBncm91cC5jbG9zZUVkaXRvcnMoZWRpdG9ycywgeyBwcmVzZXJ2ZUZvY3VzIH0pKTtcblx0XHR9XG5cdFx0Ly8gVE9ETyBAanJpZWtlbiBUaGlzIGlzbid0IHF1aXRlIHJpZ2h0IGhvdyBjYW4gd2Ugc2F5IHRydWUgZm9yIHNvbWUgYnV0IG5vdCBvdGhlcnM/XG5cdFx0cmV0dXJuIHJlc3VsdHMuZXZlcnkocmVzdWx0ID0+IHJlc3VsdCk7XG5cdH1cblxuXHRhc3luYyAkY2xvc2VHcm91cChncm91cElkczogbnVtYmVyW10sIHByZXNlcnZlRm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZ3JvdXBDbG9zZVJlc3VsdHM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZ3JvdXBJZCBvZiBncm91cElkcykge1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLmdldEdyb3VwKGdyb3VwSWQpO1xuXHRcdFx0aWYgKGdyb3VwKSB7XG5cdFx0XHRcdGdyb3VwQ2xvc2VSZXN1bHRzLnB1c2goYXdhaXQgZ3JvdXAuY2xvc2VBbGxFZGl0b3JzKCkpO1xuXHRcdFx0XHQvLyBNYWtlIHN1cmUgZ3JvdXAgaXMgZW1wdHkgYnV0IHN0aWxsIHRoZXJlIGJlZm9yZSByZW1vdmluZyBpdFxuXHRcdFx0XHRpZiAoZ3JvdXAuY291bnQgPT09IDAgJiYgdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5nZXRHcm91cChncm91cC5pZCkpIHtcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLnJlbW92ZUdyb3VwKGdyb3VwKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZ3JvdXBDbG9zZVJlc3VsdHMuZXZlcnkocmVzdWx0ID0+IHJlc3VsdCk7XG5cdH1cblx0Ly8jZW5kcmVnaW9uXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWUsdUJBQXVCO0FBQy9DLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBc0IsZ0JBQTRFLGFBQXdDLGNBQWMsNkJBQStDO0FBQ3ZNLFNBQVMsd0JBQXdCLHNCQUFzQix3QkFBd0I7QUFDL0UsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw4QkFBOEI7QUFFdkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBd0MsMkJBQTJCO0FBQzVFLFNBQVMsZ0JBQThCLHNCQUFzQix5Q0FBeUM7QUFDdEcsU0FBOEIsZ0JBQWdCLGtCQUFrQjtBQUNoRSxTQUFTLDRCQUE2QztBQVEvQyxJQUFNLHVCQUFOLE1BQWdFO0FBQUEsRUFhdEUsWUFDQyxnQkFDdUMsc0JBQ0MsdUJBQ1YsYUFDZCxlQUNmO0FBSnNDO0FBQ0M7QUFDVjtBQWYvQixTQUFpQixjQUFjLElBQUksZ0JBQWdCO0FBR25EO0FBQUEsU0FBUSxpQkFBdUMsQ0FBQztBQUVoRDtBQUFBLFNBQWlCLGVBQWdELG9CQUFJLElBQUk7QUFFekU7QUFBQSxTQUFpQixpQkFBdUMsb0JBQUksSUFBSTtBQUVoRTtBQUFBLFNBQWlCLGlDQUFzRSxJQUFJLGNBQWM7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
