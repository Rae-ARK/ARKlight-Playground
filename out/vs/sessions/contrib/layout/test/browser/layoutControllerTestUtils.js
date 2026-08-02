import { Emitter, Event } from "../../../../../base/common/event.js";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../../workbench/common/views.js";
import { IEditorGroupsService } from "../../../../../workbench/services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../../workbench/services/editor/common/editorService.js";
import { IWorkbenchLayoutService, Parts } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { IPaneCompositePartService } from "../../../../../workbench/services/panecomposite/browser/panecomposite.js";
import { IViewsService } from "../../../../../workbench/services/views/common/viewsService.js";
import { EditorInput } from "../../../../../workbench/common/editor/editorInput.js";
import { isResourceEditorInput } from "../../../../../workbench/common/editor.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ChatInteractivity, SessionStatus } from "../../../../services/sessions/common/session.js";
import { ISessionChangesService, SessionChangesService } from "../../../changes/browser/sessionChangesService.js";
import { CHANGES_VIEW_CONTAINER_ID } from "../../../changes/common/changes.js";
import { SESSIONS_FILES_CONTAINER_ID } from "../../../files/browser/files.contribution.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { TestStorageService } from "../../../../../workbench/test/common/workbenchTestServices.js";
import { ILifecycleService } from "../../../../../workbench/services/lifecycle/common/lifecycle.js";
import { IChangesViewService } from "../../../changes/common/changesViewService.js";
function makeChange(filePath) {
  return { uri: URI.file(filePath), insertions: 1, deletions: 0 };
}
class TestStubEditorInput extends EditorInput {
  constructor(_resource, _options) {
    super();
    this._resource = _resource;
    this._options = _options;
  }
  get typeId() {
    return "test.stubEditor";
  }
  get resource() {
    return this._resource;
  }
  isDirty() {
    return this._options?.dirty ?? false;
  }
  toUntyped() {
    return this._options?.nonRestorable ? void 0 : { resource: this._resource };
  }
}
function makeSession(resource, opts) {
  const status = observableValue("status", opts?.status ?? SessionStatus.Completed);
  const chat = {
    resource,
    createdAt: /* @__PURE__ */ new Date(),
    title: observableValue("title", "Test"),
    updatedAt: observableValue("updatedAt", /* @__PURE__ */ new Date()),
    status,
    checkpoints: observableValue("checkpoints", void 0),
    changes: observableValue("changes", opts?.changes ?? []),
    modelId: observableValue("modelId", void 0),
    mode: observableValue("mode", void 0),
    isArchived: observableValue("isArchived", false),
    isRead: observableValue("isRead", true),
    interactivity: observableValue("interactivity", ChatInteractivity.Full),
    lastTurnEnd: observableValue("lastTurnEnd", void 0),
    description: observableValue("description", void 0)
  };
  return {
    sessionId: `test:${resource.toString()}`,
    resource,
    providerId: "test",
    sessionType: "local",
    icon: Codicon.copilot,
    createdAt: chat.createdAt,
    workspace: observableValue("workspace", opts?.workspace ?? {
      uri: URI.file("/repo"),
      label: "test",
      icon: Codicon.repo,
      folders: [{
        root: URI.file("/repo"),
        workingDirectory: URI.file("/repo"),
        name: "repo",
        description: void 0,
        gitRepository: void 0
      }],
      requiresWorkspaceTrust: false,
      isVirtualWorkspace: false
    }),
    title: chat.title,
    updatedAt: chat.updatedAt,
    status: chat.status,
    changesets: constObservable([]),
    changes: chat.changes,
    modelId: chat.modelId,
    mode: chat.mode,
    loading: observableValue("loading", false),
    isArchived: chat.isArchived,
    isRead: chat.isRead,
    lastTurnEnd: chat.lastTurnEnd,
    description: chat.description,
    chats: observableValue("chats", [chat]),
    activeChat: observableValue("activeChat", chat),
    mainChat: constObservable(chat),
    capabilities: constObservable({ supportsMultipleChats: false }),
    isCreated: opts?.isCreated === void 0 ? status.map((status2) => status2 !== SessionStatus.Untitled) : observableValue("isCreated", opts.isCreated),
    sticky: observableValue("sticky", false),
    openChats: observableValue("openChats", [chat]),
    closedChats: constObservable([]),
    lastClosedChat: void 0,
    visibleChatTabs: constObservable([chat]),
    shouldShowChatTabs: constObservable(false),
    isQuickChat: constObservable(opts?.isQuickChat ?? false)
  };
}
function createTestHarness(store, options = {}) {
  const instaService = store.add(new TestInstantiationService());
  const storageService = store.add(new TestStorageService());
  if (options.layoutState) {
    const raw = JSON.stringify(options.layoutState);
    storageService.store("sessions.layoutState", raw, StorageScope.WORKSPACE, 0);
    storageService.store("sessions.singlePane.layoutState", raw, StorageScope.WORKSPACE, 0);
  }
  if (options.newSessionViewState) {
    const raw = JSON.stringify(options.newSessionViewState);
    storageService.store("sessions.newSessionViewState", raw, StorageScope.WORKSPACE, 0);
    storageService.store("sessions.singlePane.newSessionViewState", raw, StorageScope.WORKSPACE, 0);
  }
  if (options.newSessionViewStateRaw !== void 0) {
    storageService.store("sessions.newSessionViewState", options.newSessionViewStateRaw, StorageScope.WORKSPACE, 0);
    storageService.store("sessions.singlePane.newSessionViewState", options.newSessionViewStateRaw, StorageScope.WORKSPACE, 0);
  }
  instaService.stub(IStorageService, storageService);
  const configService = new TestConfigurationService();
  configService.setUserConfiguration("workbench.editor.useModal", options.useModal ?? "all");
  configService.setUserConfiguration("sessions.layout.autoCollapseSessionsSidebar", options.responsiveSidebar ?? true);
  instaService.stub(IConfigurationService, configService);
  const contextKeyService = store.add(new MockContextKeyService());
  instaService.stub(IContextKeyService, contextKeyService);
  const harness = {
    instaService,
    storageService,
    activeSessionObs: observableValue("activeSession", void 0),
    visibleSessionsObs: observableValue("visibleSessions", []),
    onDidChangeSessions: store.add(new Emitter()),
    onDidReplaceSession: store.add(new Emitter()),
    onDidChangePartVisibility: store.add(new Emitter()),
    onDidRevealSidePane: store.add(new Emitter()),
    onDidChangeEditorMaximized: store.add(new Emitter()),
    onDidActiveEditorChange: store.add(new Emitter()),
    onWillOpenEditor: store.add(new Emitter()),
    onDidCloseEditor: store.add(new Emitter()),
    onDidEditorsChange: store.add(new Emitter()),
    onDidLayoutMainContainer: store.add(new Emitter()),
    onDidChangeViewContainerVisibility: store.add(new Emitter()),
    onDidChangeActiveViewDescriptors: store.add(new Emitter()),
    activeAuxViewContainerIds: options.activeAuxViewContainerIds ? [...options.activeAuxViewContainerIds] : [CHANGES_VIEW_CONTAINER_ID, SESSIONS_FILES_CONTAINER_ID],
    mainContainerWidth: options.mainContainerWidth ?? 2e3,
    editorMaximized: false,
    partVisibility: new Map([
      [Parts.AUXILIARYBAR_PART, true],
      [Parts.PANEL_PART, false],
      [Parts.EDITOR_PART, true],
      [Parts.CUSTOM_VIEW_GRID_PART, false],
      ...options.initialPartVisibility ?? []
    ]),
    openedViewContainers: [],
    openedViews: [],
    setPartHiddenCalls: [],
    editorRevealedExplicitly: false,
    editorPartAutoVisibilitySuppressionDepth: 0,
    activateAux: options.activateAux ?? false,
    activeGroupEditors: [],
    closedEditors: [],
    openedEditors: [],
    closeSuppressionFlags: [],
    activePaneCompositeId: void 0,
    pinnedAuxiliaryBarContainerIds: [SESSIONS_FILES_CONTAINER_ID, CHANGES_VIEW_CONTAINER_ID],
    visibleEditorsList: [],
    activeEditorResource: void 0,
    activeEditorInput: void 0,
    editorGroupsHaveContent: true,
    applyWorkingSetCalls: [],
    saveWorkingSetCalls: [],
    openChangesEditorCalls: [],
    sessionChangesService: new SessionChangesService(new class extends mock() {
    }(), instaService, new class extends mock() {
      get isSinglePaneLayoutEnabled() {
        return options.singlePaneLayoutEnabled ?? false;
      }
    }()),
    contextKeyService
  };
  const testActiveGroup = new class extends mock() {
    constructor() {
      super(...arguments);
      this.id = 1;
    }
    get editors() {
      return harness.activeGroupEditors;
    }
    get count() {
      return harness.activeGroupEditors.length;
    }
    get isEmpty() {
      return harness.activeGroupEditors.length === 0;
    }
    contains(editor) {
      return harness.activeGroupEditors.includes(editor);
    }
    isPinned() {
      return true;
    }
    pinEditor() {
    }
    getIndexOfEditor(editor) {
      return harness.activeGroupEditors.indexOf(editor);
    }
    moveEditor(editor, _target, options2) {
      const currentIndex = harness.activeGroupEditors.indexOf(editor);
      if (currentIndex === -1) {
        return false;
      }
      harness.activeGroupEditors.splice(currentIndex, 1);
      const targetIndex = Math.max(0, Math.min(options2?.index ?? harness.activeGroupEditors.length, harness.activeGroupEditors.length));
      harness.activeGroupEditors.splice(targetIndex, 0, editor);
      return true;
    }
  }();
  instaService.stub(ISessionsManagementService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeSessions = harness.onDidChangeSessions.event;
      this.onDidReplaceSession = harness.onDidReplaceSession.event;
    }
    getSessions() {
      return [];
    }
  }());
  instaService.stub(ISessionsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.activeSession = harness.activeSessionObs;
      this.visibleSessions = harness.visibleSessionsObs;
    }
  }());
  instaService.stub(ISessionChangesService, new class extends mock() {
    getChangesEditorResource(sessionResource) {
      return harness.sessionChangesService.getChangesEditorResource(sessionResource);
    }
    getSessionResource(editorResource) {
      return harness.sessionChangesService.getSessionResource(editorResource);
    }
    async openChangesEditor(sessionResource, options2) {
      harness.openChangesEditorCalls.push({ sessionResource, active: !options2?.inactive });
      if (harness.onOpenChangesEditor) {
        await harness.onOpenChangesEditor();
      }
      const resource = harness.sessionChangesService.getChangesEditorResource(sessionResource);
      let editor = harness.activeGroupEditors.find((e) => e.resource && isEqual(e.resource, resource));
      if (!editor) {
        editor = store.add(new TestStubEditorInput(resource));
        const index = options2?.index;
        if (typeof index === "number" && index >= 0 && index <= harness.activeGroupEditors.length) {
          harness.activeGroupEditors.splice(index, 0, editor);
        } else {
          harness.activeGroupEditors.push(editor);
        }
      }
      if (!options2?.inactive) {
        harness.activeEditorInput = editor;
        harness.onDidActiveEditorChange.fire();
      }
      return testActiveGroup;
    }
  }());
  instaService.stub(IChangesViewService, new class extends mock() {
    setChangesetId() {
    }
  }());
  instaService.stub(ILifecycleService, new class extends mock() {
    // Resolves only when a test opts in via `activateAux`, so the single-pane
    // managed-tab / detail-panel behaviour is not spun up otherwise.
    when() {
      return harness.activateAux ? Promise.resolve() : new Promise(() => {
      });
    }
  }());
  instaService.stub(IWorkbenchLayoutService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangePartVisibility = harness.onDidChangePartVisibility.event;
      this.onDidRevealSidePane = harness.onDidRevealSidePane.event;
      this.onDidChangeEditorMaximized = harness.onDidChangeEditorMaximized.event;
      this.onDidLayoutMainContainer = harness.onDidLayoutMainContainer.event;
    }
    isVisible(part) {
      return harness.partVisibility.get(part) ?? true;
    }
    setPartHidden(hidden, part) {
      harness.setPartHiddenCalls.push({ hidden, part });
      const wasVisible = harness.partVisibility.get(part) ?? true;
      const sidePaneWasClosed = !(harness.partVisibility.get(Parts.EDITOR_PART) ?? true) && !(harness.partVisibility.get(Parts.AUXILIARYBAR_PART) ?? true);
      harness.partVisibility.set(part, !hidden);
      if (wasVisible === hidden) {
        harness.onDidChangePartVisibility.fire({ partId: part, visible: !hidden });
        if (!hidden && sidePaneWasClosed && (part === Parts.EDITOR_PART || part === Parts.AUXILIARYBAR_PART)) {
          harness.onDidRevealSidePane.fire();
        }
      }
    }
    hasFocus(_part) {
      return false;
    }
    suppressEditorPartAutoVisibility() {
      harness.editorPartAutoVisibilitySuppressionDepth++;
      return toDisposable(() => harness.editorPartAutoVisibilitySuppressionDepth--);
    }
    isEditorRevealedExplicitly() {
      return harness.editorRevealedExplicitly;
    }
    revealEditorPartExplicitly() {
      harness.editorRevealedExplicitly = true;
      this.setPartHidden(false, Parts.EDITOR_PART);
    }
    isEditorMaximized() {
      return harness.editorMaximized;
    }
    get isSinglePaneLayoutEnabled() {
      return options.singlePaneLayoutEnabled ?? false;
    }
    get mainContainerDimension() {
      return { width: harness.mainContainerWidth, height: 1e3 };
    }
  }());
  instaService.stub(IViewsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeViewContainerVisibility = harness.onDidChangeViewContainerVisibility.event;
    }
    isViewContainerActive(id) {
      return harness.activeAuxViewContainerIds.includes(id);
    }
    async openViewContainer(id) {
      harness.openedViewContainers.push(id);
      revealAuxiliaryBar();
      return null;
    }
    closeViewContainer() {
    }
    async openView(id) {
      harness.openedViews.push(id);
      revealAuxiliaryBar();
      return null;
    }
  }());
  instaService.stub(IViewDescriptorService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeViewContainers = Event.None;
      this.onDidChangeContainerLocation = Event.None;
    }
    getViewContainersByLocation(location) {
      if (location !== ViewContainerLocation.AuxiliaryBar) {
        return [];
      }
      return [CHANGES_VIEW_CONTAINER_ID, SESSIONS_FILES_CONTAINER_ID].map((id) => {
        const container = { id };
        return container;
      });
    }
    getViewContainerModel(_container) {
      const model = { onDidChangeActiveViewDescriptors: harness.onDidChangeActiveViewDescriptors.event };
      return model;
    }
  }());
  function revealAuxiliaryBar() {
    if (!options.revealAuxiliaryBarOnOpen || harness.partVisibility.get(Parts.AUXILIARYBAR_PART) === true) {
      return;
    }
    const sidePaneWasClosed = !(harness.partVisibility.get(Parts.EDITOR_PART) ?? true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    if (sidePaneWasClosed) {
      harness.onDidRevealSidePane.fire();
    }
  }
  instaService.stub(IPaneCompositePartService, new class extends mock() {
    getActivePaneComposite(_location) {
      if (harness.activePaneCompositeId) {
        return new class extends mock() {
          getId() {
            return harness.activePaneCompositeId;
          }
        }();
      }
      return void 0;
    }
    getPinnedPaneCompositeIds(_location) {
      return [...harness.pinnedAuxiliaryBarContainerIds];
    }
  }());
  instaService.stub(IEditorService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidActiveEditorChange = harness.onDidActiveEditorChange.event;
      this.onWillOpenEditor = harness.onWillOpenEditor.event;
      this.onDidCloseEditor = harness.onDidCloseEditor.event;
      this.onDidEditorsChange = harness.onDidEditorsChange.event;
    }
    get visibleEditors() {
      return harness.visibleEditorsList;
    }
    get activeEditor() {
      if (harness.activeEditorInput) {
        return harness.activeEditorInput;
      }
      if (!harness.activeEditorResource) {
        return void 0;
      }
      const editor = { resource: harness.activeEditorResource };
      return editor;
    }
    async openEditor(...args) {
      const editor = args[0];
      if (editor instanceof EditorInput && !harness.activeGroupEditors.includes(editor)) {
        const options2 = args[1];
        const index = options2?.index;
        if (typeof index === "number" && index >= 0 && index <= harness.activeGroupEditors.length) {
          harness.activeGroupEditors.splice(index, 0, store.add(editor));
        } else {
          harness.activeGroupEditors.push(store.add(editor));
        }
      }
      return void 0;
    }
    async openEditors(editors) {
      for (const editor of editors) {
        harness.openedEditors.push(editor);
        const resource = isResourceEditorInput(editor) ? editor.resource : void 0;
        if (resource) {
          const stub = store.add(new TestStubEditorInput(resource));
          const index = editor.options?.index;
          if (typeof index === "number" && index >= 0 && index <= harness.activeGroupEditors.length) {
            harness.activeGroupEditors.splice(index, 0, stub);
          } else {
            harness.activeGroupEditors.push(stub);
          }
        }
      }
      return [];
    }
    async closeEditors(editors) {
      for (const { editor } of editors) {
        const index = harness.activeGroupEditors.indexOf(editor);
        if (index !== -1) {
          harness.closeSuppressionFlags.push(harness.editorPartAutoVisibilitySuppressionDepth > 0);
          harness.activeGroupEditors.splice(index, 1);
          harness.closedEditors.push(editor);
        }
      }
    }
  }());
  instaService.stub(IEditorGroupsService, new class extends mock() {
    get mainPart() {
      const groups = this.groups;
      return new class extends mock() {
        get groups() {
          return groups;
        }
        get activeGroup() {
          return testActiveGroup;
        }
        getGroup(id) {
          return id === testActiveGroup.id ? testActiveGroup : void 0;
        }
      }();
    }
    get groups() {
      return [{ isEmpty: !harness.editorGroupsHaveContent }];
    }
    saveWorkingSet(name) {
      harness.saveWorkingSetCalls.push(name);
      return { id: name, name };
    }
    async applyWorkingSet(workingSet) {
      harness.applyWorkingSetCalls.push(workingSet);
      harness.onApplyWorkingSet?.();
      return true;
    }
    deleteWorkingSet() {
    }
  }());
  instaService.stub(IWorkspaceContextService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeWorkspaceFolders = Event.None;
    }
    getWorkspace() {
      return { id: "test", folders: options.workspaceFolders ?? [] };
    }
  }());
  return harness;
}
export {
  TestStubEditorInput,
  createTestHarness,
  makeChange,
  makeSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvbGF5b3V0L3Rlc3QvYnJvd3Nlci9sYXlvdXRDb250cm9sbGVyVGVzdFV0aWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSURpbWVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdDb250YWluZXJNb2RlbCwgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lciwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlLCBJRWRpdG9yV29ya2luZ1NldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQYXJ0VmlzaWJpbGl0eUNoYW5nZUV2ZW50LCBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JXaWxsT3BlbkV2ZW50LCBJVW50eXBlZEVkaXRvcklucHV0LCBpc1Jlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiwgSVNlc3Npb25zQ2hhbmdlRXZlbnQsIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd29ya2JlbmNoLmpzJztcbmltcG9ydCB7IENoYXRJbnRlcmFjdGl2aXR5LCBJQ2hhdCwgSVNlc3Npb24sIElTZXNzaW9uRmlsZUNoYW5nZSwgSVNlc3Npb25Xb3Jrc3BhY2UsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLCBTZXNzaW9uQ2hhbmdlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGFuZ2VzL2Jyb3dzZXIvc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENIQU5HRVNfVklFV19DT05UQUlORVJfSUQgfSBmcm9tICcuLi8uLi8uLi9jaGFuZ2VzL2NvbW1vbi9jaGFuZ2VzLmpzJztcbmltcG9ydCB7IFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2Jyb3dzZXIvZmlsZXMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNoYW5nZXNWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYW5nZXMvY29tbW9uL2NoYW5nZXNWaWV3U2VydmljZS5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBtYWtlQ2hhbmdlKGZpbGVQYXRoOiBzdHJpbmcpOiBJU2Vzc2lvbkZpbGVDaGFuZ2Uge1xuXHRyZXR1cm4geyB1cmk6IFVSSS5maWxlKGZpbGVQYXRoKSwgaW5zZXJ0aW9uczogMSwgZGVsZXRpb25zOiAwIH07XG59XG5cbi8qKiBBIG1pbmltYWwgZWRpdG9yIGlucHV0IGZvciB0ZXN0cywgaWRlbnRpZmllZCBvbmx5IGJ5IGl0cyByZXNvdXJjZS4gKi9cbmV4cG9ydCBjbGFzcyBUZXN0U3R1YkVkaXRvcklucHV0IGV4dGVuZHMgRWRpdG9ySW5wdXQge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZTogVVJJLCBwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zPzogeyByZWFkb25seSBkaXJ0eT86IGJvb2xlYW47IHJlYWRvbmx5IG5vblJlc3RvcmFibGU/OiBib29sZWFuIH0pIHsgc3VwZXIoKTsgfVxuXHRvdmVycmlkZSBnZXQgdHlwZUlkKCk6IHN0cmluZyB7IHJldHVybiAndGVzdC5zdHViRWRpdG9yJzsgfVxuXHRvdmVycmlkZSBnZXQgcmVzb3VyY2UoKTogVVJJIHsgcmV0dXJuIHRoaXMuX3Jlc291cmNlOyB9XG5cdG92ZXJyaWRlIGlzRGlydHkoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9vcHRpb25zPy5kaXJ0eSA/PyBmYWxzZTsgfVxuXHRvdmVycmlkZSB0b1VudHlwZWQoKTogSVVudHlwZWRFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9vcHRpb25zPy5ub25SZXN0b3JhYmxlID8gdW5kZWZpbmVkIDogeyByZXNvdXJjZTogdGhpcy5fcmVzb3VyY2UgfTsgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbWFrZVNlc3Npb24ocmVzb3VyY2U6IFVSSSwgb3B0cz86IHtcblx0c3RhdHVzPzogU2Vzc2lvblN0YXR1cztcblx0aXNDcmVhdGVkPzogYm9vbGVhbjtcblx0Y2hhbmdlcz86IHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdO1xuXHR3b3Jrc3BhY2U/OiBJU2Vzc2lvbldvcmtzcGFjZTtcblx0aXNRdWlja0NoYXQ/OiBib29sZWFuO1xufSk6IElBY3RpdmVTZXNzaW9uIHtcblx0Y29uc3Qgc3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0dXMnLCBvcHRzPy5zdGF0dXMgPz8gU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpO1xuXHRjb25zdCBjaGF0OiBJQ2hhdCA9IHtcblx0XHRyZXNvdXJjZSxcblx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCksXG5cdFx0dGl0bGU6IG9ic2VydmFibGVWYWx1ZSgndGl0bGUnLCAnVGVzdCcpLFxuXHRcdHVwZGF0ZWRBdDogb2JzZXJ2YWJsZVZhbHVlKCd1cGRhdGVkQXQnLCBuZXcgRGF0ZSgpKSxcblx0XHRzdGF0dXMsXG5cdFx0Y2hlY2twb2ludHM6IG9ic2VydmFibGVWYWx1ZSgnY2hlY2twb2ludHMnLCB1bmRlZmluZWQpLFxuXHRcdGNoYW5nZXM6IG9ic2VydmFibGVWYWx1ZSgnY2hhbmdlcycsIG9wdHM/LmNoYW5nZXMgPz8gW10pLFxuXHRcdG1vZGVsSWQ6IG9ic2VydmFibGVWYWx1ZSgnbW9kZWxJZCcsIHVuZGVmaW5lZCksXG5cdFx0bW9kZTogb2JzZXJ2YWJsZVZhbHVlKCdtb2RlJywgdW5kZWZpbmVkKSxcblx0XHRpc0FyY2hpdmVkOiBvYnNlcnZhYmxlVmFsdWUoJ2lzQXJjaGl2ZWQnLCBmYWxzZSksXG5cdFx0aXNSZWFkOiBvYnNlcnZhYmxlVmFsdWUoJ2lzUmVhZCcsIHRydWUpLFxuXHRcdGludGVyYWN0aXZpdHk6IG9ic2VydmFibGVWYWx1ZSgnaW50ZXJhY3Rpdml0eScsIENoYXRJbnRlcmFjdGl2aXR5LkZ1bGwpLFxuXHRcdGxhc3RUdXJuRW5kOiBvYnNlcnZhYmxlVmFsdWUoJ2xhc3RUdXJuRW5kJywgdW5kZWZpbmVkKSxcblx0XHRkZXNjcmlwdGlvbjogb2JzZXJ2YWJsZVZhbHVlKCdkZXNjcmlwdGlvbicsIHVuZGVmaW5lZCksXG5cdH07XG5cblx0cmV0dXJuIHtcblx0XHRzZXNzaW9uSWQ6IGB0ZXN0OiR7cmVzb3VyY2UudG9TdHJpbmcoKX1gLFxuXHRcdHJlc291cmNlLFxuXHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRzZXNzaW9uVHlwZTogJ2xvY2FsJyxcblx0XHRpY29uOiBDb2RpY29uLmNvcGlsb3QsXG5cdFx0Y3JlYXRlZEF0OiBjaGF0LmNyZWF0ZWRBdCxcblx0XHR3b3Jrc3BhY2U6IG9ic2VydmFibGVWYWx1ZSgnd29ya3NwYWNlJywgb3B0cz8ud29ya3NwYWNlID8/IHtcblx0XHRcdHVyaTogVVJJLmZpbGUoJy9yZXBvJyksXG5cdFx0XHRsYWJlbDogJ3Rlc3QnLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5yZXBvLFxuXHRcdFx0Zm9sZGVyczogW3tcblx0XHRcdFx0cm9vdDogVVJJLmZpbGUoJy9yZXBvJyksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSS5maWxlKCcvcmVwbycpLFxuXHRcdFx0XHRuYW1lOiAncmVwbycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdpdFJlcG9zaXRvcnk6IHVuZGVmaW5lZCxcblx0XHRcdH1dLFxuXHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdH0pLFxuXHRcdHRpdGxlOiBjaGF0LnRpdGxlLFxuXHRcdHVwZGF0ZWRBdDogY2hhdC51cGRhdGVkQXQsXG5cdFx0c3RhdHVzOiBjaGF0LnN0YXR1cyxcblx0XHRjaGFuZ2VzZXRzOiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdGNoYW5nZXM6IGNoYXQuY2hhbmdlcyxcblx0XHRtb2RlbElkOiBjaGF0Lm1vZGVsSWQsXG5cdFx0bW9kZTogY2hhdC5tb2RlLFxuXHRcdGxvYWRpbmc6IG9ic2VydmFibGVWYWx1ZSgnbG9hZGluZycsIGZhbHNlKSxcblx0XHRpc0FyY2hpdmVkOiBjaGF0LmlzQXJjaGl2ZWQsXG5cdFx0aXNSZWFkOiBjaGF0LmlzUmVhZCxcblx0XHRsYXN0VHVybkVuZDogY2hhdC5sYXN0VHVybkVuZCxcblx0XHRkZXNjcmlwdGlvbjogY2hhdC5kZXNjcmlwdGlvbixcblx0XHRjaGF0czogb2JzZXJ2YWJsZVZhbHVlKCdjaGF0cycsIFtjaGF0XSksXG5cdFx0YWN0aXZlQ2hhdDogb2JzZXJ2YWJsZVZhbHVlKCdhY3RpdmVDaGF0JywgY2hhdCksXG5cdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UgfSksXG5cdFx0aXNDcmVhdGVkOiBvcHRzPy5pc0NyZWF0ZWQgPT09IHVuZGVmaW5lZFxuXHRcdFx0PyBzdGF0dXMubWFwKHN0YXR1cyA9PiBzdGF0dXMgIT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQpXG5cdFx0XHQ6IG9ic2VydmFibGVWYWx1ZSgnaXNDcmVhdGVkJywgb3B0cy5pc0NyZWF0ZWQpLFxuXHRcdHN0aWNreTogb2JzZXJ2YWJsZVZhbHVlKCdzdGlja3knLCBmYWxzZSksXG5cdFx0b3BlbkNoYXRzOiBvYnNlcnZhYmxlVmFsdWUoJ29wZW5DaGF0cycsIFtjaGF0XSksXG5cdFx0Y2xvc2VkQ2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0bGFzdENsb3NlZENoYXQ6IHVuZGVmaW5lZCxcblx0XHR2aXNpYmxlQ2hhdFRhYnM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdHNob3VsZFNob3dDaGF0VGFiczogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHRpc1F1aWNrQ2hhdDogY29uc3RPYnNlcnZhYmxlKG9wdHM/LmlzUXVpY2tDaGF0ID8/IGZhbHNlKSxcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ3JlYXRlT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHVzZU1vZGFsPzogJ29mZicgfCAnc29tZScgfCAnYWxsJztcblx0cmVhZG9ubHkgd29ya3NwYWNlRm9sZGVycz86IHJlYWRvbmx5IHsgcmVhZG9ubHkgdXJpOiBVUkkgfVtdO1xuXHRyZWFkb25seSBsYXlvdXRTdGF0ZT86IHJlYWRvbmx5IG9iamVjdFtdO1xuXHRyZWFkb25seSBuZXdTZXNzaW9uVmlld1N0YXRlPzogeyByZWFkb25seSBhdXhpbGlhcnlCYXJWaXNpYmxlOiBib29sZWFuIH07XG5cdHJlYWRvbmx5IG5ld1Nlc3Npb25WaWV3U3RhdGVSYXc/OiBzdHJpbmc7XG5cdC8qKiBbRDddIFZhbHVlIGZvciBgc2Vzc2lvbnMubGF5b3V0LmF1dG9Db2xsYXBzZVNlc3Npb25zU2lkZWJhcmAgKGRlZmF1bHRzIHRvIGVuYWJsZWQpLiAqL1xuXHRyZWFkb25seSByZXNwb25zaXZlU2lkZWJhcj86IGJvb2xlYW47XG5cdC8qKiBbRDddIFdoZW4gc2V0LCBgb3BlblZpZXdgL2BvcGVuVmlld0NvbnRhaW5lcmAgcmV2ZWFsIHRoZSBhdXhpbGlhcnkgYmFyIChtaXJyb3JpbmcgcHJvZHVjdGlvbikgc28gbmF2aWdhdGlvbiByZXZlYWxzIGNhbiBiZSBleGVyY2lzZWQuICovXG5cdHJlYWRvbmx5IHJldmVhbEF1eGlsaWFyeUJhck9uT3Blbj86IGJvb2xlYW47XG5cdC8qKiBJbml0aWFsIG1haW4gY29udGFpbmVyIHdpZHRoIChkZWZhdWx0cyB0byAyMDAwKS4gU2V0IGJlbG93IGBTTUFMTF9XSU5ET1dfTUFYX1dJRFRIYCB0byBzdGFydCBzcGFjZS1jb25zdHJhaW5lZC4gKi9cblx0cmVhZG9ubHkgbWFpbkNvbnRhaW5lcldpZHRoPzogbnVtYmVyO1xuXHQvKiogSW5pdGlhbCBwYXJ0IHZpc2liaWxpdHkgb3ZlcnJpZGVzIGFwcGxpZWQgYmVmb3JlIHRoZSBjb250cm9sbGVyIGlzIGNvbnN0cnVjdGVkIChtaXJyb3JzIHJlc3RvcmVkIGxheW91dCBhZnRlciBhIHJlbG9hZCkuICovXG5cdHJlYWRvbmx5IGluaXRpYWxQYXJ0VmlzaWJpbGl0eT86IFJlYWRvbmx5TWFwPFBhcnRzLCBib29sZWFuPjtcblx0LyoqIElEcyBvZiBhdXgtYmFyIHZpZXcgY29udGFpbmVycyBhY3RpdmUgYXQgY29uc3RydWN0aW9uIChkZWZhdWx0cyB0byBDaGFuZ2VzICsgRmlsZXMpLiBFbXB0eSBcdTIxRDIgbm8gYWN0aXZlIGF1eCBjb250YWluZXJzIChlLmcuIGEgcXVpY2sgY2hhdCkuICovXG5cdHJlYWRvbmx5IGFjdGl2ZUF1eFZpZXdDb250YWluZXJJZHM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0LyoqIFdoZW4gc2V0LCByZXNvbHZlcyB0aGUgbGlmZWN5Y2xlIGBSZXN0b3JlZGAgcGhhc2Ugc28gYSBzaW5nbGUtcGFuZSBjb250cm9sbGVyJ3MgbWFuYWdlZC10YWIgLyBkZXRhaWwtcGFuZWwgYmVoYXZpb3VyIGFjdGl2YXRlcy4gKi9cblx0cmVhZG9ubHkgYWN0aXZhdGVBdXg/OiBib29sZWFuO1xuXHQvKiogV2hlbiB0cnVlLCB0aGUgbGF5b3V0IHNlcnZpY2UgcmVwb3J0cyBzaW5nbGUtcGFuZSBsYXlvdXQgZW5hYmxlZCAoZHJpdmVzIGJhc2Ugc2luZ2xlLXBhbmUgYnJhbmNoZXMpLiAqL1xuXHRyZWFkb25seSBzaW5nbGVQYW5lTGF5b3V0RW5hYmxlZD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogTXV0YWJsZSB0ZXN0IGhhcm5lc3Mgc2hhcmVkIGJ5IHRoZSBiYXNlIC8gZGVza3RvcCAvIG1vYmlsZSBjb250cm9sbGVyIHRlc3RcbiAqIHN1aXRlcy4gTW9ja3MgcmVhZCB0aGUgbXV0YWJsZSBmaWVsZHMgb24gZWFjaCBjYWxsLCBzbyBhIHRlc3QgY2FuIHJlYXNzaWduXG4gKiAoZS5nLiBgaGFybmVzcy5vcGVuZWRWaWV3cyA9IFtdYCkgb3IgbXV0YXRlIHRoZW0gYmV0d2VlbiBhY3Rpb25zLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0TGF5b3V0SGFybmVzcyB7XG5cdHJlYWRvbmx5IGluc3RhU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRzdG9yYWdlU2VydmljZTogVGVzdFN0b3JhZ2VTZXJ2aWNlO1xuXHRhY3RpdmVTZXNzaW9uT2JzOiBJU2V0dGFibGVPYnNlcnZhYmxlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPjtcblx0dmlzaWJsZVNlc3Npb25zT2JzOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IChJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZClbXT47XG5cdG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEVtaXR0ZXI8SVNlc3Npb25zQ2hhbmdlRXZlbnQ+O1xuXHRvbkRpZFJlcGxhY2VTZXNzaW9uOiBFbWl0dGVyPHsgcmVhZG9ubHkgZnJvbTogSVNlc3Npb247IHJlYWRvbmx5IHRvOiBJU2Vzc2lvbiB9Pjtcblx0b25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eTogRW1pdHRlcjxJUGFydFZpc2liaWxpdHlDaGFuZ2VFdmVudD47XG5cdG9uRGlkUmV2ZWFsU2lkZVBhbmU6IEVtaXR0ZXI8dm9pZD47XG5cdG9uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkOiBFbWl0dGVyPHZvaWQ+O1xuXHRvbkRpZEFjdGl2ZUVkaXRvckNoYW5nZTogRW1pdHRlcjx2b2lkPjtcblx0b25XaWxsT3BlbkVkaXRvcjogRW1pdHRlcjxJRWRpdG9yV2lsbE9wZW5FdmVudD47XG5cdG9uRGlkQ2xvc2VFZGl0b3I6IEVtaXR0ZXI8eyBlZGl0b3I6IEVkaXRvcklucHV0IH0+O1xuXHRvbkRpZEVkaXRvcnNDaGFuZ2U6IEVtaXR0ZXI8dm9pZD47XG5cdG9uRGlkTGF5b3V0TWFpbkNvbnRhaW5lcjogRW1pdHRlcjxJRGltZW5zaW9uPjtcblx0b25EaWRDaGFuZ2VWaWV3Q29udGFpbmVyVmlzaWJpbGl0eTogRW1pdHRlcjx7IGlkOiBzdHJpbmc7IHZpc2libGU6IGJvb2xlYW47IGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfT47XG5cdG9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzOiBFbWl0dGVyPHZvaWQ+O1xuXHQvKiogSURzIG9mIGF1eC1iYXIgdmlldyBjb250YWluZXJzIHRoYXQgYXJlIGN1cnJlbnRseSBhY3RpdmUgKHNob3duIGFzIGEgdGFiKS4gKi9cblx0YWN0aXZlQXV4Vmlld0NvbnRhaW5lcklkczogc3RyaW5nW107XG5cdG1haW5Db250YWluZXJXaWR0aDogbnVtYmVyO1xuXHRlZGl0b3JNYXhpbWl6ZWQ6IGJvb2xlYW47XG5cdHBhcnRWaXNpYmlsaXR5OiBNYXA8UGFydHMsIGJvb2xlYW4+O1xuXHRvcGVuZWRWaWV3Q29udGFpbmVyczogc3RyaW5nW107XG5cdG9wZW5lZFZpZXdzOiBzdHJpbmdbXTtcblx0c2V0UGFydEhpZGRlbkNhbGxzOiB7IGhpZGRlbjogYm9vbGVhbjsgcGFydDogUGFydHMgfVtdO1xuXHQvKiogVmFsdWUgcmV0dXJuZWQgYnkgdGhlIGxheW91dCBzZXJ2aWNlJ3MgYGlzRWRpdG9yUmV2ZWFsZWRFeHBsaWNpdGx5KClgIG1vY2suICovXG5cdGVkaXRvclJldmVhbGVkRXhwbGljaXRseTogYm9vbGVhbjtcblx0LyoqIEN1cnJlbnQgc3VwcHJlc3Npb24gZGVwdGggZm9yIGBzdXBwcmVzc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eSgpYC4gKi9cblx0ZWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3Npb25EZXB0aDogbnVtYmVyO1xuXHQvKiogV2hldGhlciB0aGUgbGlmZWN5Y2xlIGBSZXN0b3JlZGAgcGhhc2UgaGFzIHJlc29sdmVkIChhY3RpdmF0ZXMgc2luZ2xlLXBhbmUgbWFuYWdlZC10YWIgLyBkZXRhaWwtcGFuZWwgYmVoYXZpb3VyKS4gKi9cblx0YWN0aXZhdGVBdXg6IGJvb2xlYW47XG5cdC8qKiBFZGl0b3JzIGluIHRoZSBtYWluIHBhcnQncyBhY3RpdmUgZ3JvdXAgKGRyaXZlcyB0aGUgc2luZ2xlLXBhbmUgbWFuYWdlZC10YWIgbG9naWMpLiAqL1xuXHRhY3RpdmVHcm91cEVkaXRvcnM6IEVkaXRvcklucHV0W107XG5cdC8qKiBSZWNvcmRzIGVkaXRvcnMgY2xvc2VkIHZpYSBgSUVkaXRvclNlcnZpY2UuY2xvc2VFZGl0b3JzYC4gKi9cblx0Y2xvc2VkRWRpdG9yczogRWRpdG9ySW5wdXRbXTtcblx0LyoqIFJlY29yZHMgdW50eXBlZCBlZGl0b3JzIHJlb3BlbmVkIHZpYSBgSUVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcnNgLiAqL1xuXHRvcGVuZWRFZGl0b3JzOiBJVW50eXBlZEVkaXRvcklucHV0W107XG5cdC8qKiBSZWNvcmRzIHRoZSBkZXB0aC1hdC1jbG9zZSBmb3IgZWFjaCBgY2xvc2VFZGl0b3JzYCBjYWxsLCB0byBhc3NlcnQgbGF5b3V0LWRyaXZlbiBjbG9zZXMgaGFwcGVuIHdoaWxlIHN1cHByZXNzZWQuICovXG5cdGNsb3NlU3VwcHJlc3Npb25GbGFnczogYm9vbGVhbltdO1xuXHRhY3RpdmVQYW5lQ29tcG9zaXRlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cGlubmVkQXV4aWxpYXJ5QmFyQ29udGFpbmVySWRzOiBzdHJpbmdbXTtcblx0dmlzaWJsZUVkaXRvcnNMaXN0OiByZWFkb25seSB1bmtub3duW107XG5cdGFjdGl2ZUVkaXRvclJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdC8qKiBXaGV0aGVyIHRoZSBlZGl0b3IgZ3JvdXBzIGhhdmUgY29udGVudCAoZHJpdmVzIGBoYXNFZGl0b3JzYCBpbiBgdG9nZ2xlU2lkZVBhbmVgKS4gKi9cblx0ZWRpdG9yR3JvdXBzSGF2ZUNvbnRlbnQ6IGJvb2xlYW47XG5cdC8qKiBSZWNvcmRzIGV2ZXJ5IGBhcHBseVdvcmtpbmdTZXRgIGNhbGwgbWFkZSBieSB0aGUgY29udHJvbGxlci4gKi9cblx0YXBwbHlXb3JraW5nU2V0Q2FsbHM6IChJRWRpdG9yV29ya2luZ1NldCB8ICdlbXB0eScpW107XG5cdC8qKiBSZWNvcmRzIHRoZSBuYW1lIG9mIGV2ZXJ5IGBzYXZlV29ya2luZ1NldGAgY2FsbCBtYWRlIGJ5IHRoZSBjb250cm9sbGVyLiAqL1xuXHRzYXZlV29ya2luZ1NldENhbGxzOiBzdHJpbmdbXTtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGNhbGxiYWNrIGludm9rZWQgc3luY2hyb25vdXNseSBkdXJpbmcgYGFwcGx5V29ya2luZ1NldGAsIGFsbG93aW5nXG5cdCAqIHRlc3RzIHRvIHNpbXVsYXRlIGV4dGVybmFsIHZpc2liaWxpdHkgY2hhbmdlcyAoZS5nLiB0aGUgc2luZ2xlLXBhbmUgZGV0YWlsXG5cdCAqIHBhbmVsKSB3aGlsZSBgX2lzUmVzdG9yaW5nU2Vzc2lvbkxheW91dGAgaXMgdHJ1ZS5cblx0ICovXG5cdG9uQXBwbHlXb3JraW5nU2V0PzogKCkgPT4gdm9pZDtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGFzeW5jIGhvb2sgYXdhaXRlZCBhdCB0aGUgc3RhcnQgb2YgYG9wZW5DaGFuZ2VzRWRpdG9yYCwgbGV0dGluZyBhXG5cdCAqIHRlc3QgcGF1c2UgYSBtYW5hZ2VkLXRhYiByZWNvbmNpbGUgbWlkLW9wZW4gKGUuZy4gdG8gc3dpdGNoIHNlc3Npb25zIGFuZFxuXHQgKiBhc3NlcnQgdGhlIHN1cGVyc2VkZWQgcmVjb25jaWxlJ3MgaW50ZW50cyBkbyBub3QgbGVhaykuXG5cdCAqL1xuXHRvbk9wZW5DaGFuZ2VzRWRpdG9yPzogKCkgPT4gUHJvbWlzZTx2b2lkPiB8IHZvaWQ7XG5cdC8qKiBSZWNvcmRzIGV2ZXJ5IGBvcGVuQ2hhbmdlc0VkaXRvcmAgY2FsbCBmb3IgYXNzZXJ0aW9ucyAoc2Vzc2lvbiArIHdoZXRoZXIgYWN0aXZlKS4gKi9cblx0b3BlbkNoYW5nZXNFZGl0b3JDYWxsczogeyBzZXNzaW9uUmVzb3VyY2U6IFVSSTsgYWN0aXZlOiBib29sZWFuIH1bXTtcblx0cmVhZG9ubHkgc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlOiBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlO1xuXHRyZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogTW9ja0NvbnRleHRLZXlTZXJ2aWNlO1xuXHRhY3RpdmVFZGl0b3JJbnB1dD86IEVkaXRvcklucHV0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGVzdEhhcm5lc3Moc3RvcmU6IERpc3Bvc2FibGVTdG9yZSwgb3B0aW9uczogSUNyZWF0ZU9wdGlvbnMgPSB7fSk6IElUZXN0TGF5b3V0SGFybmVzcyB7XG5cdGNvbnN0IGluc3RhU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXG5cdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdGlmIChvcHRpb25zLmxheW91dFN0YXRlKSB7XG5cdFx0Y29uc3QgcmF3ID0gSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5sYXlvdXRTdGF0ZSk7XG5cdFx0Ly8gU2VlZCBib3RoIHRoZSBjbGFzc2ljIGRlc2t0b3Aga2V5IGFuZCB0aGUgZnJlc2ggc2luZ2xlLXBhbmUga2V5IHNvIHRoZVxuXHRcdC8vIHNhbWUgaGFybmVzcyBzZXJ2ZXMgYm90aCB0aGUgTGF5b3V0Q29udHJvbGxlciBhbmQgU2luZ2xlUGFuZUxheW91dENvbnRyb2xsZXIgdGVzdHMuXG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3Nlc3Npb25zLmxheW91dFN0YXRlJywgcmF3LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAwKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnc2Vzc2lvbnMuc2luZ2xlUGFuZS5sYXlvdXRTdGF0ZScsIHJhdywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgMCk7XG5cdH1cblx0aWYgKG9wdGlvbnMubmV3U2Vzc2lvblZpZXdTdGF0ZSkge1xuXHRcdGNvbnN0IHJhdyA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMubmV3U2Vzc2lvblZpZXdTdGF0ZSk7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3Nlc3Npb25zLm5ld1Nlc3Npb25WaWV3U3RhdGUnLCByYXcsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIDApO1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdzZXNzaW9ucy5zaW5nbGVQYW5lLm5ld1Nlc3Npb25WaWV3U3RhdGUnLCByYXcsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIDApO1xuXHR9XG5cdGlmIChvcHRpb25zLm5ld1Nlc3Npb25WaWV3U3RhdGVSYXcgIT09IHVuZGVmaW5lZCkge1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdzZXNzaW9ucy5uZXdTZXNzaW9uVmlld1N0YXRlJywgb3B0aW9ucy5uZXdTZXNzaW9uVmlld1N0YXRlUmF3LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAwKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnc2Vzc2lvbnMuc2luZ2xlUGFuZS5uZXdTZXNzaW9uVmlld1N0YXRlJywgb3B0aW9ucy5uZXdTZXNzaW9uVmlld1N0YXRlUmF3LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAwKTtcblx0fVxuXHRpbnN0YVNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCd3b3JrYmVuY2guZWRpdG9yLnVzZU1vZGFsJywgb3B0aW9ucy51c2VNb2RhbCA/PyAnYWxsJyk7XG5cdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3Nlc3Npb25zLmxheW91dC5hdXRvQ29sbGFwc2VTZXNzaW9uc1NpZGViYXInLCBvcHRpb25zLnJlc3BvbnNpdmVTaWRlYmFyID8/IHRydWUpO1xuXHRpbnN0YVNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UpO1xuXHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHN0b3JlLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXHRpbnN0YVNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRjb25zdCBoYXJuZXNzOiBJVGVzdExheW91dEhhcm5lc3MgPSB7XG5cdFx0aW5zdGFTZXJ2aWNlLFxuXHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdGFjdGl2ZVNlc3Npb25PYnM6IG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ2FjdGl2ZVNlc3Npb24nLCB1bmRlZmluZWQpLFxuXHRcdHZpc2libGVTZXNzaW9uc09iczogb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IChJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZClbXT4oJ3Zpc2libGVTZXNzaW9ucycsIFtdKSxcblx0XHRvbkRpZENoYW5nZVNlc3Npb25zOiBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SVNlc3Npb25zQ2hhbmdlRXZlbnQ+KCkpLFxuXHRcdG9uRGlkUmVwbGFjZVNlc3Npb246IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGZyb206IElTZXNzaW9uOyByZWFkb25seSB0bzogSVNlc3Npb24gfT4oKSksXG5cdFx0b25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eTogc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElQYXJ0VmlzaWJpbGl0eUNoYW5nZUV2ZW50PigpKSxcblx0XHRvbkRpZFJldmVhbFNpZGVQYW5lOiBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSksXG5cdFx0b25EaWRDaGFuZ2VFZGl0b3JNYXhpbWl6ZWQ6IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKSxcblx0XHRvbkRpZEFjdGl2ZUVkaXRvckNoYW5nZTogc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpLFxuXHRcdG9uV2lsbE9wZW5FZGl0b3I6IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJRWRpdG9yV2lsbE9wZW5FdmVudD4oKSksXG5cdFx0b25EaWRDbG9zZUVkaXRvcjogc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHsgZWRpdG9yOiBFZGl0b3JJbnB1dCB9PigpKSxcblx0XHRvbkRpZEVkaXRvcnNDaGFuZ2U6IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKSxcblx0XHRvbkRpZExheW91dE1haW5Db250YWluZXI6IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJRGltZW5zaW9uPigpKSxcblx0XHRvbkRpZENoYW5nZVZpZXdDb250YWluZXJWaXNpYmlsaXR5OiBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8eyBpZDogc3RyaW5nOyB2aXNpYmxlOiBib29sZWFuOyBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uIH0+KCkpLFxuXHRcdG9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzOiBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSksXG5cdFx0YWN0aXZlQXV4Vmlld0NvbnRhaW5lcklkczogb3B0aW9ucy5hY3RpdmVBdXhWaWV3Q29udGFpbmVySWRzID8gWy4uLm9wdGlvbnMuYWN0aXZlQXV4Vmlld0NvbnRhaW5lcklkc10gOiBbQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRCwgU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEXSxcblx0XHRtYWluQ29udGFpbmVyV2lkdGg6IG9wdGlvbnMubWFpbkNvbnRhaW5lcldpZHRoID8/IDIwMDAsXG5cdFx0ZWRpdG9yTWF4aW1pemVkOiBmYWxzZSxcblx0XHRwYXJ0VmlzaWJpbGl0eTogbmV3IE1hcDxQYXJ0cywgYm9vbGVhbj4oW1xuXHRcdFx0W1BhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlXSxcblx0XHRcdFtQYXJ0cy5QQU5FTF9QQVJULCBmYWxzZV0sXG5cdFx0XHRbUGFydHMuRURJVE9SX1BBUlQsIHRydWVdLFxuXHRcdFx0W1BhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVCwgZmFsc2VdLFxuXHRcdFx0Li4uKG9wdGlvbnMuaW5pdGlhbFBhcnRWaXNpYmlsaXR5ID8/IFtdKSxcblx0XHRdKSxcblx0XHRvcGVuZWRWaWV3Q29udGFpbmVyczogW10sXG5cdFx0b3BlbmVkVmlld3M6IFtdLFxuXHRcdHNldFBhcnRIaWRkZW5DYWxsczogW10sXG5cdFx0ZWRpdG9yUmV2ZWFsZWRFeHBsaWNpdGx5OiBmYWxzZSxcblx0XHRlZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkRlcHRoOiAwLFxuXHRcdGFjdGl2YXRlQXV4OiBvcHRpb25zLmFjdGl2YXRlQXV4ID8/IGZhbHNlLFxuXHRcdGFjdGl2ZUdyb3VwRWRpdG9yczogW10sXG5cdFx0Y2xvc2VkRWRpdG9yczogW10sXG5cdFx0b3BlbmVkRWRpdG9yczogW10sXG5cdFx0Y2xvc2VTdXBwcmVzc2lvbkZsYWdzOiBbXSxcblx0XHRhY3RpdmVQYW5lQ29tcG9zaXRlSWQ6IHVuZGVmaW5lZCxcblx0XHRwaW5uZWRBdXhpbGlhcnlCYXJDb250YWluZXJJZHM6IFtTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQsIENIQU5HRVNfVklFV19DT05UQUlORVJfSURdLFxuXHRcdHZpc2libGVFZGl0b3JzTGlzdDogW10sXG5cdFx0YWN0aXZlRWRpdG9yUmVzb3VyY2U6IHVuZGVmaW5lZCxcblx0XHRhY3RpdmVFZGl0b3JJbnB1dDogdW5kZWZpbmVkLFxuXHRcdGVkaXRvckdyb3Vwc0hhdmVDb250ZW50OiB0cnVlLFxuXHRcdGFwcGx5V29ya2luZ1NldENhbGxzOiBbXSxcblx0XHRzYXZlV29ya2luZ1NldENhbGxzOiBbXSxcblx0XHRvcGVuQ2hhbmdlc0VkaXRvckNhbGxzOiBbXSxcblx0XHRzZXNzaW9uQ2hhbmdlc1NlcnZpY2U6IG5ldyBTZXNzaW9uQ2hhbmdlc1NlcnZpY2UobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yU2VydmljZT4oKSB7IH0sIGluc3RhU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGdldCBpc1NpbmdsZVBhbmVMYXlvdXRFbmFibGVkKCk6IGJvb2xlYW4geyByZXR1cm4gb3B0aW9ucy5zaW5nbGVQYW5lTGF5b3V0RW5hYmxlZCA/PyBmYWxzZTsgfVxuXHRcdH0pLFxuXHRcdGNvbnRleHRLZXlTZXJ2aWNlLFxuXHR9O1xuXG5cdGNvbnN0IHRlc3RBY3RpdmVHcm91cDogSUVkaXRvckdyb3VwID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yR3JvdXA+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gMTtcblx0XHRvdmVycmlkZSBnZXQgZWRpdG9ycygpIHsgcmV0dXJuIGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzIGFzIElFZGl0b3JHcm91cFsnZWRpdG9ycyddOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0IGNvdW50KCkgeyByZXR1cm4gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMubGVuZ3RoOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0IGlzRW1wdHkoKSB7IHJldHVybiBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5sZW5ndGggPT09IDA7IH1cblx0XHRvdmVycmlkZSBjb250YWlucyhlZGl0b3I6IEVkaXRvcklucHV0KSB7IHJldHVybiBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5pbmNsdWRlcyhlZGl0b3IgYXMgRWRpdG9ySW5wdXQpOyB9XG5cdFx0b3ZlcnJpZGUgaXNQaW5uZWQoKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0b3ZlcnJpZGUgcGluRWRpdG9yKCkgeyB9XG5cdFx0b3ZlcnJpZGUgZ2V0SW5kZXhPZkVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KSB7IHJldHVybiBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5pbmRleE9mKGVkaXRvcik7IH1cblx0XHRvdmVycmlkZSBtb3ZlRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIF90YXJnZXQ6IElFZGl0b3JHcm91cCwgb3B0aW9ucz86IHsgaW5kZXg/OiBudW1iZXIgfSkge1xuXHRcdFx0Y29uc3QgY3VycmVudEluZGV4ID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihlZGl0b3IpO1xuXHRcdFx0aWYgKGN1cnJlbnRJbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGN1cnJlbnRJbmRleCwgMSk7XG5cdFx0XHRjb25zdCB0YXJnZXRJbmRleCA9IE1hdGgubWF4KDAsIE1hdGgubWluKG9wdGlvbnM/LmluZGV4ID8/IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmxlbmd0aCwgaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMubGVuZ3RoKSk7XG5cdFx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UodGFyZ2V0SW5kZXgsIDAsIGVkaXRvcik7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH07XG5cblx0aW5zdGFTZXJ2aWNlLnN0dWIoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbnMgPSBoYXJuZXNzLm9uRGlkQ2hhbmdlU2Vzc2lvbnMuZXZlbnQ7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRSZXBsYWNlU2Vzc2lvbiA9IGhhcm5lc3Mub25EaWRSZXBsYWNlU2Vzc2lvbi5ldmVudDtcblx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpIHsgcmV0dXJuIFtdOyB9XG5cdH0pO1xuXHRpbnN0YVNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnM7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdmlzaWJsZVNlc3Npb25zID0gaGFybmVzcy52aXNpYmxlU2Vzc2lvbnNPYnM7XG5cdH0pO1xuXG5cdGluc3RhU2VydmljZS5zdHViKElTZXNzaW9uQ2hhbmdlc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25DaGFuZ2VzU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKHNlc3Npb25SZXNvdXJjZTogVVJJKTogVVJJIHsgcmV0dXJuIGhhcm5lc3Muc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmdldENoYW5nZXNFZGl0b3JSZXNvdXJjZShzZXNzaW9uUmVzb3VyY2UpOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvblJlc291cmNlKGVkaXRvclJlc291cmNlOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQgeyByZXR1cm4gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0U2Vzc2lvblJlc291cmNlKGVkaXRvclJlc291cmNlKTsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5DaGFuZ2VzRWRpdG9yKHNlc3Npb25SZXNvdXJjZTogVVJJLCBvcHRpb25zPzogeyBpbmRleD86IG51bWJlcjsgaW5hY3RpdmU/OiBib29sZWFuIH0pOiBQcm9taXNlPElFZGl0b3JHcm91cD4ge1xuXHRcdFx0aGFybmVzcy5vcGVuQ2hhbmdlc0VkaXRvckNhbGxzLnB1c2goeyBzZXNzaW9uUmVzb3VyY2UsIGFjdGl2ZTogIW9wdGlvbnM/LmluYWN0aXZlIH0pO1xuXHRcdFx0aWYgKGhhcm5lc3Mub25PcGVuQ2hhbmdlc0VkaXRvcikge1xuXHRcdFx0XHRhd2FpdCBoYXJuZXNzLm9uT3BlbkNoYW5nZXNFZGl0b3IoKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc291cmNlID0gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRsZXQgZWRpdG9yID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmluZChlID0+IGUucmVzb3VyY2UgJiYgaXNFcXVhbChlLnJlc291cmNlLCByZXNvdXJjZSkpO1xuXHRcdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdFx0ZWRpdG9yID0gc3RvcmUuYWRkKG5ldyBUZXN0U3R1YkVkaXRvcklucHV0KHJlc291cmNlKSk7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gb3B0aW9ucz8uaW5kZXg7XG5cdFx0XHRcdGlmICh0eXBlb2YgaW5kZXggPT09ICdudW1iZXInICYmIGluZGV4ID49IDAgJiYgaW5kZXggPD0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGluZGV4LCAwLCBlZGl0b3IpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnB1c2goZWRpdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gTWlycm9yIHRoZSB3b3JrYmVuY2g6IGEgbm9uLWluYWN0aXZlIG9wZW4gbWFrZXMgdGhlIGVkaXRvciBhY3RpdmUuXG5cdFx0XHRpZiAoIW9wdGlvbnM/LmluYWN0aXZlKSB7XG5cdFx0XHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBlZGl0b3I7XG5cdFx0XHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRlc3RBY3RpdmVHcm91cDtcblx0XHR9XG5cdH0pO1xuXHRpbnN0YVNlcnZpY2Uuc3R1YihJQ2hhbmdlc1ZpZXdTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGFuZ2VzVmlld1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHNldENoYW5nZXNldElkKCk6IHZvaWQgeyB9XG5cdH0pO1xuXHRpbnN0YVNlcnZpY2Uuc3R1YihJTGlmZWN5Y2xlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGlmZWN5Y2xlU2VydmljZT4oKSB7XG5cdFx0Ly8gUmVzb2x2ZXMgb25seSB3aGVuIGEgdGVzdCBvcHRzIGluIHZpYSBgYWN0aXZhdGVBdXhgLCBzbyB0aGUgc2luZ2xlLXBhbmVcblx0XHQvLyBtYW5hZ2VkLXRhYiAvIGRldGFpbC1wYW5lbCBiZWhhdmlvdXIgaXMgbm90IHNwdW4gdXAgb3RoZXJ3aXNlLlxuXHRcdG92ZXJyaWRlIHdoZW4oKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiBoYXJuZXNzLmFjdGl2YXRlQXV4ID8gUHJvbWlzZS5yZXNvbHZlKCkgOiBuZXcgUHJvbWlzZTx2b2lkPigoKSA9PiB7IH0pOyB9XG5cdH0pO1xuXG5cdGluc3RhU2VydmljZS5zdHViKElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBpc1Zpc2libGUocGFydDogUGFydHMpOiBib29sZWFuIHtcblx0XHRcdHJldHVybiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChwYXJ0KSA/PyB0cnVlO1xuXHRcdH1cblx0XHRvdmVycmlkZSBzZXRQYXJ0SGlkZGVuKGhpZGRlbjogYm9vbGVhbiwgcGFydDogUGFydHMpOiB2b2lkIHtcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnB1c2goeyBoaWRkZW4sIHBhcnQgfSk7XG5cdFx0XHRjb25zdCB3YXNWaXNpYmxlID0gaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQocGFydCkgPz8gdHJ1ZTtcblx0XHRcdGNvbnN0IHNpZGVQYW5lV2FzQ2xvc2VkID0gIShoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5FRElUT1JfUEFSVCkgPz8gdHJ1ZSkgJiYgIShoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkgPz8gdHJ1ZSk7XG5cdFx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChwYXJ0LCAhaGlkZGVuKTtcblx0XHRcdC8vIE1pcnJvciBwcm9kdWN0aW9uOiBmaXJlIHRoZSB2aXNpYmlsaXR5IGNoYW5nZSBzeW5jaHJvbm91c2x5IHdoZW4gaXQgYWN0dWFsbHkgY2hhbmdlc1xuXHRcdFx0aWYgKHdhc1Zpc2libGUgPT09IGhpZGRlbikge1xuXHRcdFx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogcGFydCwgdmlzaWJsZTogIWhpZGRlbiB9KTtcblx0XHRcdFx0aWYgKCFoaWRkZW4gJiYgc2lkZVBhbmVXYXNDbG9zZWQgJiYgKHBhcnQgPT09IFBhcnRzLkVESVRPUl9QQVJUIHx8IHBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSkge1xuXHRcdFx0XHRcdGhhcm5lc3Mub25EaWRSZXZlYWxTaWRlUGFuZS5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0b3ZlcnJpZGUgaGFzRm9jdXMoX3BhcnQ6IFBhcnRzKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRcdHN1cHByZXNzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5KCk6IElEaXNwb3NhYmxlIHtcblx0XHRcdGhhcm5lc3MuZWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3Npb25EZXB0aCsrO1xuXHRcdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiBoYXJuZXNzLmVkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uRGVwdGgtLSk7XG5cdFx0fVxuXHRcdGlzRWRpdG9yUmV2ZWFsZWRFeHBsaWNpdGx5KCk6IGJvb2xlYW4geyByZXR1cm4gaGFybmVzcy5lZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHk7IH1cblx0XHRyZXZlYWxFZGl0b3JQYXJ0RXhwbGljaXRseSgpOiB2b2lkIHtcblx0XHRcdGhhcm5lc3MuZWRpdG9yUmV2ZWFsZWRFeHBsaWNpdGx5ID0gdHJ1ZTtcblx0XHRcdHRoaXMuc2V0UGFydEhpZGRlbihmYWxzZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHRcdH1cblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5ID0gaGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmV2ZW50O1xuXHRcdHJlYWRvbmx5IG9uRGlkUmV2ZWFsU2lkZVBhbmUgPSBoYXJuZXNzLm9uRGlkUmV2ZWFsU2lkZVBhbmUuZXZlbnQ7XG5cdFx0aXNFZGl0b3JNYXhpbWl6ZWQoKTogYm9vbGVhbiB7IHJldHVybiBoYXJuZXNzLmVkaXRvck1heGltaXplZDsgfVxuXHRcdGdldCBpc1NpbmdsZVBhbmVMYXlvdXRFbmFibGVkKCk6IGJvb2xlYW4geyByZXR1cm4gb3B0aW9ucy5zaW5nbGVQYW5lTGF5b3V0RW5hYmxlZCA/PyBmYWxzZTsgfVxuXHRcdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkID0gaGFybmVzcy5vbkRpZENoYW5nZUVkaXRvck1heGltaXplZC5ldmVudDtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZExheW91dE1haW5Db250YWluZXIgPSBoYXJuZXNzLm9uRGlkTGF5b3V0TWFpbkNvbnRhaW5lci5ldmVudDtcblx0XHRvdmVycmlkZSBnZXQgbWFpbkNvbnRhaW5lckRpbWVuc2lvbigpOiBJRGltZW5zaW9uIHsgcmV0dXJuIHsgd2lkdGg6IGhhcm5lc3MubWFpbkNvbnRhaW5lcldpZHRoLCBoZWlnaHQ6IDEwMDAgfTsgfVxuXHR9IGFzIFBhcnRpYWw8SVdvcmtiZW5jaExheW91dFNlcnZpY2U+IGFzIElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblxuXHRpbnN0YVNlcnZpY2Uuc3R1YihJVmlld3NTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWaWV3c1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlld0NvbnRhaW5lclZpc2liaWxpdHkgPSBoYXJuZXNzLm9uRGlkQ2hhbmdlVmlld0NvbnRhaW5lclZpc2liaWxpdHkuZXZlbnQ7XG5cdFx0b3ZlcnJpZGUgaXNWaWV3Q29udGFpbmVyQWN0aXZlKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRcdHJldHVybiBoYXJuZXNzLmFjdGl2ZUF1eFZpZXdDb250YWluZXJJZHMuaW5jbHVkZXMoaWQpO1xuXHRcdH1cblx0XHRvdmVycmlkZSBhc3luYyBvcGVuVmlld0NvbnRhaW5lcihpZDogc3RyaW5nKSB7XG5cdFx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLnB1c2goaWQpO1xuXHRcdFx0cmV2ZWFsQXV4aWxpYXJ5QmFyKCk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgY2xvc2VWaWV3Q29udGFpbmVyKCkgeyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgb3BlblZpZXcoaWQ6IHN0cmluZykge1xuXHRcdFx0aGFybmVzcy5vcGVuZWRWaWV3cy5wdXNoKGlkKTtcblx0XHRcdHJldmVhbEF1eGlsaWFyeUJhcigpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHR9KTtcblxuXHRpbnN0YVNlcnZpY2Uuc3R1YihJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWaWV3RGVzY3JpcHRvclNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlld0NvbnRhaW5lcnMgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGFpbmVyTG9jYXRpb24gPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGdldFZpZXdDb250YWluZXJzQnlMb2NhdGlvbihsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogVmlld0NvbnRhaW5lcltdIHtcblx0XHRcdGlmIChsb2NhdGlvbiAhPT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gW0NIQU5HRVNfVklFV19DT05UQUlORVJfSUQsIFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRF0ubWFwKGlkID0+IHtcblx0XHRcdFx0Y29uc3QgY29udGFpbmVyOiBQYXJ0aWFsPFZpZXdDb250YWluZXI+ID0geyBpZCB9O1xuXHRcdFx0XHRyZXR1cm4gY29udGFpbmVyIGFzIFZpZXdDb250YWluZXI7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgZ2V0Vmlld0NvbnRhaW5lck1vZGVsKF9jb250YWluZXI6IFZpZXdDb250YWluZXIpOiBJVmlld0NvbnRhaW5lck1vZGVsIHtcblx0XHRcdGNvbnN0IG1vZGVsID0geyBvbkRpZENoYW5nZUFjdGl2ZVZpZXdEZXNjcmlwdG9yczogaGFybmVzcy5vbkRpZENoYW5nZUFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5ldmVudCB9O1xuXHRcdFx0cmV0dXJuIG1vZGVsIGFzIHVua25vd24gYXMgSVZpZXdDb250YWluZXJNb2RlbDtcblx0XHR9XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHJldmVhbEF1eGlsaWFyeUJhcigpOiB2b2lkIHtcblx0XHRpZiAoIW9wdGlvbnMucmV2ZWFsQXV4aWxpYXJ5QmFyT25PcGVuIHx8IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzaWRlUGFuZVdhc0Nsb3NlZCA9ICEoaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuRURJVE9SX1BBUlQpID8/IHRydWUpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0aWYgKHNpZGVQYW5lV2FzQ2xvc2VkKSB7XG5cdFx0XHRoYXJuZXNzLm9uRGlkUmV2ZWFsU2lkZVBhbmUuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdGluc3RhU2VydmljZS5zdHViKElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShfbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IElQYW5lQ29tcG9zaXRlIHwgdW5kZWZpbmVkIHtcblx0XHRcdGlmIChoYXJuZXNzLmFjdGl2ZVBhbmVDb21wb3NpdGVJZCkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUGFuZUNvbXBvc2l0ZT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgZ2V0SWQoKSB7IHJldHVybiBoYXJuZXNzLmFjdGl2ZVBhbmVDb21wb3NpdGVJZCE7IH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGdldFBpbm5lZFBhbmVDb21wb3NpdGVJZHMoX2xvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiBzdHJpbmdbXSB7XG5cdFx0XHRyZXR1cm4gWy4uLmhhcm5lc3MucGlubmVkQXV4aWxpYXJ5QmFyQ29udGFpbmVySWRzXTtcblx0XHR9XG5cdH0pO1xuXG5cdGluc3RhU2VydmljZS5zdHViKElFZGl0b3JTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBnZXQgdmlzaWJsZUVkaXRvcnMoKSB7IHJldHVybiBoYXJuZXNzLnZpc2libGVFZGl0b3JzTGlzdCBhcyBJRWRpdG9yU2VydmljZVsndmlzaWJsZUVkaXRvcnMnXTsgfVxuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlID0gaGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5ldmVudDtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbldpbGxPcGVuRWRpdG9yID0gaGFybmVzcy5vbldpbGxPcGVuRWRpdG9yLmV2ZW50O1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2xvc2VFZGl0b3IgPSBoYXJuZXNzLm9uRGlkQ2xvc2VFZGl0b3IuZXZlbnQgYXMgdW5rbm93biBhcyBJRWRpdG9yU2VydmljZVsnb25EaWRDbG9zZUVkaXRvciddO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkRWRpdG9yc0NoYW5nZSA9IGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmV2ZW50IGFzIHVua25vd24gYXMgSUVkaXRvclNlcnZpY2VbJ29uRGlkRWRpdG9yc0NoYW5nZSddO1xuXHRcdG92ZXJyaWRlIGdldCBhY3RpdmVFZGl0b3IoKSB7XG5cdFx0XHRpZiAoaGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dCkge1xuXHRcdFx0XHRyZXR1cm4gaGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dCBhcyBJRWRpdG9yU2VydmljZVsnYWN0aXZlRWRpdG9yJ107XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWhhcm5lc3MuYWN0aXZlRWRpdG9yUmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVkaXRvciA9IHsgcmVzb3VyY2U6IGhhcm5lc3MuYWN0aXZlRWRpdG9yUmVzb3VyY2UgfTtcblx0XHRcdHJldHVybiBlZGl0b3IgYXMgSUVkaXRvclNlcnZpY2VbJ2FjdGl2ZUVkaXRvciddO1xuXHRcdH1cblx0XHRvdmVycmlkZSBhc3luYyBvcGVuRWRpdG9yKC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSBhcmdzWzBdO1xuXHRcdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIEVkaXRvcklucHV0ICYmICFoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5pbmNsdWRlcyhlZGl0b3IpKSB7XG5cdFx0XHRcdGNvbnN0IG9wdGlvbnMgPSBhcmdzWzFdIGFzIHsgaW5kZXg/OiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSBvcHRpb25zPy5pbmRleDtcblx0XHRcdFx0aWYgKHR5cGVvZiBpbmRleCA9PT0gJ251bWJlcicgJiYgaW5kZXggPj0gMCAmJiBpbmRleCA8PSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdFx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoaW5kZXgsIDAsIHN0b3JlLmFkZChlZGl0b3IpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5wdXNoKHN0b3JlLmFkZChlZGl0b3IpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgb3BlbkVkaXRvcnMoZWRpdG9yczogcmVhZG9ubHkgSVVudHlwZWRFZGl0b3JJbnB1dFtdKTogUHJvbWlzZTxuZXZlcltdPiB7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBlZGl0b3JzKSB7XG5cdFx0XHRcdGhhcm5lc3Mub3BlbmVkRWRpdG9ycy5wdXNoKGVkaXRvcik7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gaXNSZXNvdXJjZUVkaXRvcklucHV0KGVkaXRvcikgPyBlZGl0b3IucmVzb3VyY2UgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHRcdGNvbnN0IHN0dWIgPSBzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQocmVzb3VyY2UpKTtcblx0XHRcdFx0XHRjb25zdCBpbmRleCA9IGVkaXRvci5vcHRpb25zPy5pbmRleDtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGluZGV4ID09PSAnbnVtYmVyJyAmJiBpbmRleCA+PSAwICYmIGluZGV4IDw9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGluZGV4LCAwLCBzdHViKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMucHVzaChzdHViKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgY2xvc2VFZGl0b3JzKGVkaXRvcnM6IHJlYWRvbmx5IHsgZWRpdG9yOiBFZGl0b3JJbnB1dCB9W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGZvciAoY29uc3QgeyBlZGl0b3IgfSBvZiBlZGl0b3JzKSB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihlZGl0b3IpO1xuXHRcdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0aGFybmVzcy5jbG9zZVN1cHByZXNzaW9uRmxhZ3MucHVzaChoYXJuZXNzLmVkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uRGVwdGggPiAwKTtcblx0XHRcdFx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0XHRcdGhhcm5lc3MuY2xvc2VkRWRpdG9ycy5wdXNoKGVkaXRvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdGluc3RhU2VydmljZS5zdHViKElFZGl0b3JHcm91cHNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JHcm91cHNTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBnZXQgbWFpblBhcnQoKSB7XG5cdFx0XHRjb25zdCBncm91cHMgPSB0aGlzLmdyb3Vwcztcblx0XHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JHcm91cHNTZXJ2aWNlWydtYWluUGFydCddPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0IGdyb3VwcygpIHsgcmV0dXJuIGdyb3VwczsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXQgYWN0aXZlR3JvdXAoKSB7IHJldHVybiB0ZXN0QWN0aXZlR3JvdXA7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0R3JvdXAoaWQ6IG51bWJlcikgeyByZXR1cm4gaWQgPT09IHRlc3RBY3RpdmVHcm91cC5pZCA/IHRlc3RBY3RpdmVHcm91cCA6IHVuZGVmaW5lZDsgfVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgZ2V0IGdyb3VwcygpIHsgcmV0dXJuIFt7IGlzRW1wdHk6ICFoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50IH1dIGFzIHVua25vd24gYXMgSUVkaXRvckdyb3Vwc1NlcnZpY2VbJ2dyb3VwcyddOyB9XG5cdFx0b3ZlcnJpZGUgc2F2ZVdvcmtpbmdTZXQobmFtZTogc3RyaW5nKTogSUVkaXRvcldvcmtpbmdTZXQgeyBoYXJuZXNzLnNhdmVXb3JraW5nU2V0Q2FsbHMucHVzaChuYW1lKTsgcmV0dXJuIHsgaWQ6IG5hbWUsIG5hbWUgfTsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIGFwcGx5V29ya2luZ1NldCh3b3JraW5nU2V0OiBJRWRpdG9yV29ya2luZ1NldCB8ICdlbXB0eScpIHtcblx0XHRcdGhhcm5lc3MuYXBwbHlXb3JraW5nU2V0Q2FsbHMucHVzaCh3b3JraW5nU2V0KTtcblx0XHRcdGhhcm5lc3Mub25BcHBseVdvcmtpbmdTZXQ/LigpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGRlbGV0ZVdvcmtpbmdTZXQoKSB7IH1cblx0fSk7XG5cblx0aW5zdGFTZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VDb250ZXh0U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSBnZXRXb3Jrc3BhY2UoKTogSVdvcmtzcGFjZSB7IHJldHVybiB7IGlkOiAndGVzdCcsIGZvbGRlcnM6IChvcHRpb25zLndvcmtzcGFjZUZvbGRlcnMgPz8gW10pIGFzIElXb3Jrc3BhY2VbJ2ZvbGRlcnMnXSB9OyB9XG5cdH0pO1xuXG5cdHJldHVybiBoYXJuZXNzO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBdUMsb0JBQW9CO0FBRTNELFNBQVMsaUJBQXNDLHVCQUF1QjtBQUN0RSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQXFCLGdDQUFnQztBQUNyRCxTQUE4Qix3QkFBdUMsNkJBQTZCO0FBQ2xHLFNBQXVCLDRCQUErQztBQUN0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
