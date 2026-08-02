import assert from "assert";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { EditorInput } from "../../../../../workbench/common/editor/editorInput.js";
import { Parts } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { IViewsService } from "../../../../../workbench/services/views/common/viewsService.js";
import { IEditorService } from "../../../../../workbench/services/editor/common/editorService.js";
import { IEditorGroupsService } from "../../../../../workbench/services/editor/common/editorGroupsService.js";
import { TERMINAL_VIEW_ID } from "../../../../../workbench/contrib/terminal/common/terminal.js";
import { openNewSearchEditor } from "../../../../../workbench/contrib/searchEditor/browser/searchEditorActions.js";
import { IAgentWorkbenchLayoutService } from "../../../../browser/workbench.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionChangesService } from "../../../changes/browser/sessionChangesService.js";
import { NewChangesTabAction, NewFileTabAction, NewSearchTabAction } from "../../browser/addTabActions.js";
import { EmptyFileEditorInput } from "../../browser/emptyFileEditorInput.js";
import "../../browser/editor.contribution.js";
suite("Sessions - Editor Contribution", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function stubEditorGroupCount(instantiationService, count) {
    instantiationService.stub(IEditorGroupsService, new class extends mock() {
      get mainPart() {
        return { activeGroup: { count } };
      }
    }());
  }
  test("new file tab action opens pinned empty file editor", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    const opened = [];
    stubEditorGroupCount(instantiationService, 7);
    instantiationService.set(IEditorService, new class extends mock() {
      async openEditor(...args) {
        const editor = args[0];
        if (editor instanceof EditorInput) {
          opened.push({ editor: store.add(editor), options: args[1] });
        }
        return void 0;
      }
    }());
    await new NewFileTabAction().run(instantiationService);
    assert.deepStrictEqual(opened.map(({ editor, options }) => ({
      isEmptyFileEditor: editor instanceof EmptyFileEditorInput,
      pinned: options?.pinned,
      index: options?.index
    })), [{ isEmptyFileEditor: true, pinned: true, index: 7 }]);
  });
  test("new search tab action opens a new search editor", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    const invoked = [];
    instantiationService.stub(IInstantiationService, new class extends mock() {
      invokeFunction(fn, ..._args) {
        invoked.push(fn);
        return void 0;
      }
    }());
    await new NewSearchTabAction().run(instantiationService);
    assert.deepStrictEqual(invoked, [openNewSearchEditor]);
  });
  test("new changes tab action opens the changes editor for the active session", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    const resource = URI.parse("session:1");
    stubEditorGroupCount(instantiationService, 5);
    instantiationService.stub(ISessionsService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = constObservable({ resource });
      }
    }());
    const opened = [];
    instantiationService.stub(ISessionChangesService, new class extends mock() {
      async openChangesEditor(sessionResource, options) {
        opened.push({ resource: sessionResource, index: options?.index });
        return void 0;
      }
    }());
    await new NewChangesTabAction().run(instantiationService);
    assert.deepStrictEqual(opened, [{ resource, index: 5 }]);
  });
  test("new changes tab action is a no-op when there is no active session", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    stubEditorGroupCount(instantiationService, 0);
    instantiationService.stub(ISessionsService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = constObservable(void 0);
      }
    }());
    let opened = false;
    instantiationService.stub(ISessionChangesService, new class extends mock() {
      async openChangesEditor() {
        opened = true;
        return void 0;
      }
    }());
    await new NewChangesTabAction().run(instantiationService);
    assert.strictEqual(opened, false);
  });
  test("maximize editor hides the terminal panel before maximizing", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.calls = [];
        this.hiddenParts = [];
        this.editorMaximized = false;
        this.panelVisible = true;
      }
      isVisible(part) {
        return part === Parts.PANEL_PART ? this.panelVisible : false;
      }
      setPartHidden(hidden, part) {
        if (part === Parts.PANEL_PART) {
          this.panelVisible = !hidden;
        }
        if (hidden && part === Parts.PANEL_PART) {
          this.calls.push("hidePanel");
          this.hiddenParts.push(part);
        }
      }
      setEditorMaximized(maximized) {
        this.calls.push(maximized ? "maximizeEditor" : "restoreEditor");
        this.editorMaximized = maximized;
      }
    }();
    instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
    instantiationService.set(IViewsService, new class extends mock() {
      isViewVisible(id) {
        return id === TERMINAL_VIEW_ID;
      }
    }());
    const handler = CommandsRegistry.getCommand("workbench.action.agentSessions.maximizeMainEditorPart")?.handler;
    assert.ok(handler, "Command handler should be registered");
    await handler(instantiationService);
    assert.deepStrictEqual(layoutService.calls, ["hidePanel", "maximizeEditor"]);
    assert.deepStrictEqual(layoutService.hiddenParts, [Parts.PANEL_PART]);
    assert.strictEqual(layoutService.editorMaximized, true);
  });
  test("maximize editor keeps non-terminal panels visible", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.hiddenParts = [];
        this.editorMaximized = false;
        this.panelVisible = true;
      }
      isVisible(part) {
        return part === Parts.PANEL_PART ? this.panelVisible : false;
      }
      setPartHidden(hidden, part) {
        if (part === Parts.PANEL_PART) {
          this.panelVisible = !hidden;
        }
        if (hidden && part === Parts.PANEL_PART) {
          this.hiddenParts.push(part);
        }
      }
      setEditorMaximized(maximized) {
        this.editorMaximized = maximized;
      }
    }();
    instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
    instantiationService.set(IViewsService, new class extends mock() {
      isViewVisible(_id) {
        return false;
      }
    }());
    const handler = CommandsRegistry.getCommand("workbench.action.agentSessions.maximizeMainEditorPart")?.handler;
    assert.ok(handler, "Command handler should be registered");
    await handler(instantiationService);
    assert.deepStrictEqual(layoutService.hiddenParts, []);
    assert.strictEqual(layoutService.editorMaximized, true);
  });
  test("restore editor reopens the terminal panel when maximize hid it", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.hiddenParts = [];
        this.shownParts = [];
        this.maximizedStates = [];
        this.panelVisible = true;
      }
      isVisible(part) {
        return part === Parts.PANEL_PART ? this.panelVisible : false;
      }
      setPartHidden(hidden, part) {
        if (part === Parts.PANEL_PART) {
          this.panelVisible = !hidden;
          if (hidden) {
            this.hiddenParts.push(part);
          } else {
            this.shownParts.push(part);
          }
        }
      }
      setEditorMaximized(maximized) {
        this.maximizedStates.push(maximized);
      }
    }();
    instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
    instantiationService.set(IViewsService, new class extends mock() {
      isViewVisible(id) {
        return id === TERMINAL_VIEW_ID;
      }
    }());
    const maximizeHandler = CommandsRegistry.getCommand("workbench.action.agentSessions.maximizeMainEditorPart")?.handler;
    const restoreHandler = CommandsRegistry.getCommand("workbench.action.agentSessions.restoreMainEditorPart")?.handler;
    assert.ok(maximizeHandler, "Maximize command handler should be registered");
    assert.ok(restoreHandler, "Restore command handler should be registered");
    await maximizeHandler(instantiationService);
    await restoreHandler(instantiationService);
    assert.deepStrictEqual(layoutService.hiddenParts, [Parts.PANEL_PART]);
    assert.deepStrictEqual(layoutService.shownParts, [Parts.PANEL_PART]);
    assert.deepStrictEqual(layoutService.maximizedStates, [true, false]);
    assert.strictEqual(layoutService.panelVisible, true);
  });
  test("restore editor does not reopen the panel when maximize left it visible", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.shownParts = [];
        this.maximizedStates = [];
        this.panelVisible = true;
      }
      isVisible(part) {
        return part === Parts.PANEL_PART ? this.panelVisible : false;
      }
      setPartHidden(hidden, part) {
        if (part === Parts.PANEL_PART) {
          this.panelVisible = !hidden;
          if (!hidden) {
            this.shownParts.push(part);
          }
        }
      }
      setEditorMaximized(maximized) {
        this.maximizedStates.push(maximized);
      }
    }();
    instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
    instantiationService.set(IViewsService, new class extends mock() {
      isViewVisible(_id) {
        return false;
      }
    }());
    const maximizeHandler = CommandsRegistry.getCommand("workbench.action.agentSessions.maximizeMainEditorPart")?.handler;
    const restoreHandler = CommandsRegistry.getCommand("workbench.action.agentSessions.restoreMainEditorPart")?.handler;
    assert.ok(maximizeHandler, "Maximize command handler should be registered");
    assert.ok(restoreHandler, "Restore command handler should be registered");
    await maximizeHandler(instantiationService);
    await restoreHandler(instantiationService);
    assert.deepStrictEqual(layoutService.shownParts, []);
    assert.deepStrictEqual(layoutService.maximizedStates, [true, false]);
    assert.strictEqual(layoutService.panelVisible, true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvZWRpdG9yL3Rlc3QvYnJvd3Nlci9lZGl0b3IuY29udHJpYnV0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBQYXJ0cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVEVSTUlOQUxfVklFV19JRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBvcGVuTmV3U2VhcmNoRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoRWRpdG9yL2Jyb3dzZXIvc2VhcmNoRWRpdG9yQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93b3JrYmVuY2guanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY2hhbmdlcy9icm93c2VyL3Nlc3Npb25DaGFuZ2VzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOZXdDaGFuZ2VzVGFiQWN0aW9uLCBOZXdGaWxlVGFiQWN0aW9uLCBOZXdTZWFyY2hUYWJBY3Rpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL2FkZFRhYkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1wdHlGaWxlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9icm93c2VyL2VtcHR5RmlsZUVkaXRvcklucHV0LmpzJztcblxuLy8gSW1wb3J0IGVkaXRvciBjb250cmlidXRpb24gdG8gdHJpZ2dlciBhY3Rpb24gcmVnaXN0cmF0aW9uLlxuaW1wb3J0ICcuLi8uLi9icm93c2VyL2VkaXRvci5jb250cmlidXRpb24uanMnO1xuXG5zdWl0ZSgnU2Vzc2lvbnMgLSBFZGl0b3IgQ29udHJpYnV0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHN0dWJFZGl0b3JHcm91cENvdW50KGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UsIGNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JHcm91cHNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JHcm91cHNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGdldCBtYWluUGFydCgpOiBJRWRpdG9yR3JvdXBzU2VydmljZVsnbWFpblBhcnQnXSB7XG5cdFx0XHRcdHJldHVybiB7IGFjdGl2ZUdyb3VwOiB7IGNvdW50IH0gYXMgSUVkaXRvckdyb3VwIH0gYXMgSUVkaXRvckdyb3Vwc1NlcnZpY2VbJ21haW5QYXJ0J107XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCduZXcgZmlsZSB0YWIgYWN0aW9uIG9wZW5zIHBpbm5lZCBlbXB0eSBmaWxlIGVkaXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IG9wZW5lZDogeyBlZGl0b3I6IEVkaXRvcklucHV0OyBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0XHRzdHViRWRpdG9yR3JvdXBDb3VudChpbnN0YW50aWF0aW9uU2VydmljZSwgNyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElFZGl0b3JTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5FZGl0b3IoLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmRlZmluZWQ+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gYXJnc1swXTtcblx0XHRcdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIEVkaXRvcklucHV0KSB7XG5cdFx0XHRcdFx0b3BlbmVkLnB1c2goeyBlZGl0b3I6IHN0b3JlLmFkZChlZGl0b3IpLCBvcHRpb25zOiBhcmdzWzFdIGFzIElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhd2FpdCBuZXcgTmV3RmlsZVRhYkFjdGlvbigpLnJ1bihpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wZW5lZC5tYXAoKHsgZWRpdG9yLCBvcHRpb25zIH0pID0+ICh7XG5cdFx0XHRpc0VtcHR5RmlsZUVkaXRvcjogZWRpdG9yIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQsXG5cdFx0XHRwaW5uZWQ6IG9wdGlvbnM/LnBpbm5lZCxcblx0XHRcdGluZGV4OiBvcHRpb25zPy5pbmRleFxuXHRcdH0pKSwgW3sgaXNFbXB0eUZpbGVFZGl0b3I6IHRydWUsIHBpbm5lZDogdHJ1ZSwgaW5kZXg6IDcgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCduZXcgc2VhcmNoIHRhYiBhY3Rpb24gb3BlbnMgYSBuZXcgc2VhcmNoIGVkaXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGludm9rZWQ6IHVua25vd25bXSA9IFtdO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElJbnN0YW50aWF0aW9uU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBpbnZva2VGdW5jdGlvbjxSLCBUUyBleHRlbmRzIGFueVtdID0gW10+KGZuOiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IFRTKSA9PiBSLCAuLi5fYXJnczogVFMpOiBSIHtcblx0XHRcdFx0aW52b2tlZC5wdXNoKGZuKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZCBhcyBSO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgbmV3IE5ld1NlYXJjaFRhYkFjdGlvbigpLnJ1bihpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGludm9rZWQsIFtvcGVuTmV3U2VhcmNoRWRpdG9yXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25ldyBjaGFuZ2VzIHRhYiBhY3Rpb24gb3BlbnMgdGhlIGNoYW5nZXMgZWRpdG9yIGZvciB0aGUgYWN0aXZlIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyk7XG5cdFx0c3R1YkVkaXRvckdyb3VwQ291bnQoaW5zdGFudGlhdGlvblNlcnZpY2UsIDUpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBjb25zdE9ic2VydmFibGUoeyByZXNvdXJjZSB9IGFzIElBY3RpdmVTZXNzaW9uKTtcblx0XHR9KTtcblx0XHRjb25zdCBvcGVuZWQ6IHsgcmVzb3VyY2U6IFVSSTsgaW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uQ2hhbmdlc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25DaGFuZ2VzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBvcGVuQ2hhbmdlc0VkaXRvcihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElFZGl0b3JPcHRpb25zKTogUHJvbWlzZTx1bmRlZmluZWQ+IHtcblx0XHRcdFx0b3BlbmVkLnB1c2goeyByZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLCBpbmRleDogb3B0aW9ucz8uaW5kZXggfSk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhd2FpdCBuZXcgTmV3Q2hhbmdlc1RhYkFjdGlvbigpLnJ1bihpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wZW5lZCwgW3sgcmVzb3VyY2UsIGluZGV4OiA1IH1dKTtcblx0fSk7XG5cblx0dGVzdCgnbmV3IGNoYW5nZXMgdGFiIGFjdGlvbiBpcyBhIG5vLW9wIHdoZW4gdGhlcmUgaXMgbm8gYWN0aXZlIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRzdHViRWRpdG9yR3JvdXBDb3VudChpbnN0YW50aWF0aW9uU2VydmljZSwgMCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvbiA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHRcdGxldCBvcGVuZWQgPSBmYWxzZTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uQ2hhbmdlc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25DaGFuZ2VzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBvcGVuQ2hhbmdlc0VkaXRvcigpOiBQcm9taXNlPHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRvcGVuZWQgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgbmV3IE5ld0NoYW5nZXNUYWJBY3Rpb24oKS5ydW4oaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5lZCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXhpbWl6ZSBlZGl0b3IgaGlkZXMgdGhlIHRlcm1pbmFsIHBhbmVsIGJlZm9yZSBtYXhpbWl6aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZT4oKSB7XG5cdFx0XHRyZWFkb25seSBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRcdHJlYWRvbmx5IGhpZGRlblBhcnRzOiBQYXJ0c1tdID0gW107XG5cdFx0XHRlZGl0b3JNYXhpbWl6ZWQgPSBmYWxzZTtcblx0XHRcdHBhbmVsVmlzaWJsZSA9IHRydWU7XG5cblx0XHRcdG92ZXJyaWRlIGlzVmlzaWJsZShwYXJ0OiBQYXJ0cyk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gcGFydCA9PT0gUGFydHMuUEFORUxfUEFSVCA/IHRoaXMucGFuZWxWaXNpYmxlIDogZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIHNldFBhcnRIaWRkZW4oaGlkZGVuOiBib29sZWFuLCBwYXJ0OiBQYXJ0cyk6IHZvaWQge1xuXHRcdFx0XHRpZiAocGFydCA9PT0gUGFydHMuUEFORUxfUEFSVCkge1xuXHRcdFx0XHRcdHRoaXMucGFuZWxWaXNpYmxlID0gIWhpZGRlbjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChoaWRkZW4gJiYgcGFydCA9PT0gUGFydHMuUEFORUxfUEFSVCkge1xuXHRcdFx0XHRcdHRoaXMuY2FsbHMucHVzaCgnaGlkZVBhbmVsJyk7XG5cdFx0XHRcdFx0dGhpcy5oaWRkZW5QYXJ0cy5wdXNoKHBhcnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIHNldEVkaXRvck1heGltaXplZChtYXhpbWl6ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdFx0dGhpcy5jYWxscy5wdXNoKG1heGltaXplZCA/ICdtYXhpbWl6ZUVkaXRvcicgOiAncmVzdG9yZUVkaXRvcicpO1xuXHRcdFx0XHR0aGlzLmVkaXRvck1heGltaXplZCA9IG1heGltaXplZDtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSVZpZXdzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVmlld3NTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGlzVmlld1Zpc2libGUoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gaWQgPT09IFRFUk1JTkFMX1ZJRVdfSUQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBoYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMubWF4aW1pemVNYWluRWRpdG9yUGFydCcpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyLCAnQ29tbWFuZCBoYW5kbGVyIHNob3VsZCBiZSByZWdpc3RlcmVkJyk7XG5cblx0XHRhd2FpdCBoYW5kbGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF5b3V0U2VydmljZS5jYWxscywgWydoaWRlUGFuZWwnLCAnbWF4aW1pemVFZGl0b3InXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXlvdXRTZXJ2aWNlLmhpZGRlblBhcnRzLCBbUGFydHMuUEFORUxfUEFSVF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXlvdXRTZXJ2aWNlLmVkaXRvck1heGltaXplZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21heGltaXplIGVkaXRvciBrZWVwcyBub24tdGVybWluYWwgcGFuZWxzIHZpc2libGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlPigpIHtcblx0XHRcdHJlYWRvbmx5IGhpZGRlblBhcnRzOiBQYXJ0c1tdID0gW107XG5cdFx0XHRlZGl0b3JNYXhpbWl6ZWQgPSBmYWxzZTtcblx0XHRcdHBhbmVsVmlzaWJsZSA9IHRydWU7XG5cblx0XHRcdG92ZXJyaWRlIGlzVmlzaWJsZShwYXJ0OiBQYXJ0cyk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gcGFydCA9PT0gUGFydHMuUEFORUxfUEFSVCA/IHRoaXMucGFuZWxWaXNpYmxlIDogZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIHNldFBhcnRIaWRkZW4oaGlkZGVuOiBib29sZWFuLCBwYXJ0OiBQYXJ0cyk6IHZvaWQge1xuXHRcdFx0XHRpZiAocGFydCA9PT0gUGFydHMuUEFORUxfUEFSVCkge1xuXHRcdFx0XHRcdHRoaXMucGFuZWxWaXNpYmxlID0gIWhpZGRlbjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChoaWRkZW4gJiYgcGFydCA9PT0gUGFydHMuUEFORUxfUEFSVCkge1xuXHRcdFx0XHRcdHRoaXMuaGlkZGVuUGFydHMucHVzaChwYXJ0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBzZXRFZGl0b3JNYXhpbWl6ZWQobWF4aW1pemVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yTWF4aW1pemVkID0gbWF4aW1pemVkO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UsIGxheW91dFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJVmlld3NTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWaWV3c1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgaXNWaWV3VmlzaWJsZShfaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBoYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMubWF4aW1pemVNYWluRWRpdG9yUGFydCcpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyLCAnQ29tbWFuZCBoYW5kbGVyIHNob3VsZCBiZSByZWdpc3RlcmVkJyk7XG5cblx0XHRhd2FpdCBoYW5kbGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF5b3V0U2VydmljZS5oaWRkZW5QYXJ0cywgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXlvdXRTZXJ2aWNlLmVkaXRvck1heGltaXplZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmUgZWRpdG9yIHJlb3BlbnMgdGhlIHRlcm1pbmFsIHBhbmVsIHdoZW4gbWF4aW1pemUgaGlkIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZT4oKSB7XG5cdFx0XHRyZWFkb25seSBoaWRkZW5QYXJ0czogUGFydHNbXSA9IFtdO1xuXHRcdFx0cmVhZG9ubHkgc2hvd25QYXJ0czogUGFydHNbXSA9IFtdO1xuXHRcdFx0cmVhZG9ubHkgbWF4aW1pemVkU3RhdGVzOiBib29sZWFuW10gPSBbXTtcblx0XHRcdHBhbmVsVmlzaWJsZSA9IHRydWU7XG5cblx0XHRcdG92ZXJyaWRlIGlzVmlzaWJsZShwYXJ0OiBQYXJ0cyk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gcGFydCA9PT0gUGFydHMuUEFORUxfUEFSVCA/IHRoaXMucGFuZWxWaXNpYmxlIDogZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIHNldFBhcnRIaWRkZW4oaGlkZGVuOiBib29sZWFuLCBwYXJ0OiBQYXJ0cyk6IHZvaWQge1xuXHRcdFx0XHRpZiAocGFydCA9PT0gUGFydHMuUEFORUxfUEFSVCkge1xuXHRcdFx0XHRcdHRoaXMucGFuZWxWaXNpYmxlID0gIWhpZGRlbjtcblx0XHRcdFx0XHRpZiAoaGlkZGVuKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmhpZGRlblBhcnRzLnB1c2gocGFydCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuc2hvd25QYXJ0cy5wdXNoKHBhcnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBzZXRFZGl0b3JNYXhpbWl6ZWQobWF4aW1pemVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMubWF4aW1pemVkU3RhdGVzLnB1c2gobWF4aW1pemVkKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSVZpZXdzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVmlld3NTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGlzVmlld1Zpc2libGUoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gaWQgPT09IFRFUk1JTkFMX1ZJRVdfSUQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBtYXhpbWl6ZUhhbmRsZXIgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5tYXhpbWl6ZU1haW5FZGl0b3JQYXJ0Jyk/LmhhbmRsZXI7XG5cdFx0Y29uc3QgcmVzdG9yZUhhbmRsZXIgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5yZXN0b3JlTWFpbkVkaXRvclBhcnQnKT8uaGFuZGxlcjtcblx0XHRhc3NlcnQub2sobWF4aW1pemVIYW5kbGVyLCAnTWF4aW1pemUgY29tbWFuZCBoYW5kbGVyIHNob3VsZCBiZSByZWdpc3RlcmVkJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3RvcmVIYW5kbGVyLCAnUmVzdG9yZSBjb21tYW5kIGhhbmRsZXIgc2hvdWxkIGJlIHJlZ2lzdGVyZWQnKTtcblxuXHRcdGF3YWl0IG1heGltaXplSGFuZGxlcihpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0YXdhaXQgcmVzdG9yZUhhbmRsZXIoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXlvdXRTZXJ2aWNlLmhpZGRlblBhcnRzLCBbUGFydHMuUEFORUxfUEFSVF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF5b3V0U2VydmljZS5zaG93blBhcnRzLCBbUGFydHMuUEFORUxfUEFSVF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF5b3V0U2VydmljZS5tYXhpbWl6ZWRTdGF0ZXMsIFt0cnVlLCBmYWxzZV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXlvdXRTZXJ2aWNlLnBhbmVsVmlzaWJsZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmUgZWRpdG9yIGRvZXMgbm90IHJlb3BlbiB0aGUgcGFuZWwgd2hlbiBtYXhpbWl6ZSBsZWZ0IGl0IHZpc2libGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlPigpIHtcblx0XHRcdHJlYWRvbmx5IHNob3duUGFydHM6IFBhcnRzW10gPSBbXTtcblx0XHRcdHJlYWRvbmx5IG1heGltaXplZFN0YXRlczogYm9vbGVhbltdID0gW107XG5cdFx0XHRwYW5lbFZpc2libGUgPSB0cnVlO1xuXG5cdFx0XHRvdmVycmlkZSBpc1Zpc2libGUocGFydDogUGFydHMpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHBhcnQgPT09IFBhcnRzLlBBTkVMX1BBUlQgPyB0aGlzLnBhbmVsVmlzaWJsZSA6IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBzZXRQYXJ0SGlkZGVuKGhpZGRlbjogYm9vbGVhbiwgcGFydDogUGFydHMpOiB2b2lkIHtcblx0XHRcdFx0aWYgKHBhcnQgPT09IFBhcnRzLlBBTkVMX1BBUlQpIHtcblx0XHRcdFx0XHR0aGlzLnBhbmVsVmlzaWJsZSA9ICFoaWRkZW47XG5cdFx0XHRcdFx0aWYgKCFoaWRkZW4pIHtcblx0XHRcdFx0XHRcdHRoaXMuc2hvd25QYXJ0cy5wdXNoKHBhcnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBzZXRFZGl0b3JNYXhpbWl6ZWQobWF4aW1pemVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMubWF4aW1pemVkU3RhdGVzLnB1c2gobWF4aW1pemVkKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSVZpZXdzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVmlld3NTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGlzVmlld1Zpc2libGUoX2lkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbWF4aW1pemVIYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMubWF4aW1pemVNYWluRWRpdG9yUGFydCcpPy5oYW5kbGVyO1xuXHRcdGNvbnN0IHJlc3RvcmVIYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMucmVzdG9yZU1haW5FZGl0b3JQYXJ0Jyk/LmhhbmRsZXI7XG5cdFx0YXNzZXJ0Lm9rKG1heGltaXplSGFuZGxlciwgJ01heGltaXplIGNvbW1hbmQgaGFuZGxlciBzaG91bGQgYmUgcmVnaXN0ZXJlZCcpO1xuXHRcdGFzc2VydC5vayhyZXN0b3JlSGFuZGxlciwgJ1Jlc3RvcmUgY29tbWFuZCBoYW5kbGVyIHNob3VsZCBiZSByZWdpc3RlcmVkJyk7XG5cblx0XHRhd2FpdCBtYXhpbWl6ZUhhbmRsZXIoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGF3YWl0IHJlc3RvcmVIYW5kbGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF5b3V0U2VydmljZS5zaG93blBhcnRzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXlvdXRTZXJ2aWNlLm1heGltaXplZFN0YXRlcywgW3RydWUsIGZhbHNlXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxheW91dFNlcnZpY2UucGFuZWxWaXNpYmxlLCB0cnVlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUF1Qiw0QkFBNEI7QUFDbkQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQ0FBb0M7QUFFN0MsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxxQkFBcUIsa0JBQWtCLDBCQUEwQjtBQUMxRSxTQUFTLDRCQUE0QjtBQUdyQyxPQUFPO0FBRVAsTUFBTSxrQ0FBa0MsTUFBTTtBQUM3QyxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELFdBQVMscUJBQXFCLHNCQUFnRCxPQUFxQjtBQUNsRyx5QkFBcUIsS0FBSyxzQkFBc0IsSUFBSSxjQUFjLEtBQTJCLEVBQUU7QUFBQSxNQUM5RixJQUFhLFdBQTZDO0FBQ3pELGVBQU8sRUFB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
