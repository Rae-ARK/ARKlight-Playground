import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { isIMenuItem, MenuId, MenuRegistry } from "../../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { MainEditorAreaVisibleContext } from "../../../../../workbench/common/contextkeys.js";
import { StorageScope, WillSaveStateReason } from "../../../../../platform/storage/common/storage.js";
import { Parts } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { ViewContainerLocation } from "../../../../../workbench/common/views.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { SinglePaneChangesTabMissingContext, HasDockedDetailsContext, SinglePaneFilesTabMissingContext } from "../../../../common/contextkeys.js";
import { BrowserEditorInput } from "../../../../../workbench/contrib/browserView/common/browserEditorInput.js";
import { FileEditorInput } from "../../../../../workbench/contrib/files/browser/editors/fileEditorInput.js";
import { DiffEditorInput } from "../../../../../workbench/common/editor/diffEditorInput.js";
import { EmptyFileEditorInput } from "../../../editor/browser/emptyFileEditorInput.js";
import { isResourceEditorInput } from "../../../../../workbench/common/editor.js";
import { LayoutController } from "../../browser/desktopSessionLayoutController.js";
import { SinglePaneLayoutController, TOGGLE_DETAILS_COMMAND_ID } from "../../browser/singlePaneLayoutController.js";
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID } from "../../../changes/common/changes.js";
import "../../../changes/browser/changesActions.js";
import { SESSIONS_FILES_CONTAINER_ID } from "../../../files/browser/files.contribution.js";
import { NewChangesTabAction, NewFileTabAction } from "../../../editor/browser/addTabActions.js";
import { createTestHarness, makeChange, makeSession, TestStubEditorInput } from "./layoutControllerTestUtils.js";
suite("LayoutController (desktop)", () => {
  const store = new DisposableStore();
  let harness;
  class TestLayoutController extends LayoutController {
    getViewState(sessionResource) {
      return this._viewStateBySession.get(sessionResource);
    }
    getEditorPartHidden(sessionResource) {
      return this._editorPartHiddenBySession.get(sessionResource);
    }
    runWithRestore(work) {
      this._withSessionLayoutRestore(work);
    }
  }
  class TestSinglePaneController extends SinglePaneLayoutController {
    /** Runs `work` while a session-switch layout restore is held (see `_withSessionLayoutRestore`). */
    runWithRestore(work) {
      this._withSessionLayoutRestore(work);
    }
    getViewState(sessionResource) {
      return this._viewStateBySession.get(sessionResource);
    }
    getEditorPartHidden(sessionResource) {
      return this._editorPartHiddenBySession.get(sessionResource);
    }
  }
  function createController(options = {}) {
    harness = createTestHarness(store, options);
    return store.add(harness.instaService.createInstance(TestLayoutController));
  }
  function createSinglePaneController(options = {}) {
    harness = createTestHarness(store, options);
    return store.add(harness.instaService.createInstance(TestSinglePaneController));
  }
  function makeWorkspaceFileEditor(path = "/repo/package.json") {
    const fileEditor = Object.create(FileEditorInput.prototype);
    Object.defineProperty(fileEditor, "resource", { value: URI.file(path) });
    return fileEditor;
  }
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("[D3c] hides side pane for existing session without saved state", () => {
    createController();
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "side pane should be hidden"
    );
    assert.ok(!harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID), "should not auto-open the Files view");
  });
  test("[D6] does not auto-open side pane for existing session with changes", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), {
      changes: [makeChange("/file.ts")]
    });
    harness.activeSessionObs.set(session, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "side pane should be hidden"
    );
    assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID), "should not auto-open the Changes view");
  });
  test("[D3b] shows files view for untitled session", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(session, void 0);
    assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
  });
  test("[D3d] defaults to Files while the session has no changes", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(session, void 0);
    assert.deepStrictEqual({
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID)
    }, {
      openedFiles: true,
      openedChanges: false
    });
  });
  test("[D3d] defaults to Changes once one of the session chats has a change", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), {
      status: SessionStatus.Untitled,
      changes: [makeChange("/file.ts")]
    });
    harness.activeSessionObs.set(session, void 0);
    assert.deepStrictEqual({
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID)
    }, {
      openedFiles: false,
      openedChanges: true
    });
  });
  test("[D3d] does not switch a side pane that is already showing Files when a change lands", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(session, void 0);
    harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
    harness.openedViews = [];
    harness.openedViewContainers = [];
    session.changes.set([makeChange("/file.ts")], void 0);
    assert.deepStrictEqual({
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID)
    }, {
      openedFiles: false,
      openedChanges: false
    });
  });
  test("[D3d] does not force-open Files when the Files pane is hidden", () => {
    createController();
    harness.pinnedAuxiliaryBarContainerIds = [CHANGES_VIEW_CONTAINER_ID];
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(session, void 0);
    assert.ok(
      !harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "should not open the hidden Files pane"
    );
    assert.ok(
      harness.openedViews.includes(CHANGES_VIEW_ID),
      "should fall back to Changes when Files is hidden"
    );
  });
  test("[D3a] does not open views when session has no workspace", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), {
      workspace: { uri: URI.file("/repo"), label: "test", icon: Codicon.repo, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false }
    });
    harness.activeSessionObs.set(session, void 0);
    assert.ok(!harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
    assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID));
  });
  test("[D1] remembers aux bar hidden state on session switch", () => {
    createController();
    const session1 = makeSession(URI.parse("session:1"));
    const session2 = makeSession(URI.parse("session:2"));
    harness.activeSessionObs.set(session1, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.activeSessionObs.set(session2, void 0);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(session1, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should be hidden when returning to session 1"
    );
  });
  test("[D1] remembers active view container on session switch", () => {
    createController();
    const session1 = makeSession(URI.parse("session:1"));
    const session2 = makeSession(URI.parse("session:2"));
    harness.activeSessionObs.set(session1, void 0);
    harness.activePaneCompositeId = "some.custom.view";
    harness.pinnedAuxiliaryBarContainerIds = [...harness.pinnedAuxiliaryBarContainerIds, "some.custom.view"];
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.activeSessionObs.set(session2, void 0);
    harness.openedViewContainers = [];
    harness.activeSessionObs.set(session1, void 0);
    assert.ok(
      harness.openedViewContainers.includes("some.custom.view"),
      "should restore active view container when returning to session 1"
    );
  });
  test("[D3c] restores an explicit Files choice on session switch even when the session has changes", () => {
    createController();
    const session1 = makeSession(URI.parse("session:1"), { changes: [makeChange("/file.ts")] });
    const session2 = makeSession(URI.parse("session:2"));
    harness.activeSessionObs.set(session1, void 0);
    harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.activeSessionObs.set(session2, void 0);
    harness.openedViewContainers = [];
    harness.openedViews = [];
    harness.activeSessionObs.set(session1, void 0);
    assert.ok(
      harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "should restore the user's explicit Files choice"
    );
    assert.ok(
      !harness.openedViews.includes(CHANGES_VIEW_ID),
      "should not override the explicit Files choice with Changes"
    );
  });
  test("[D3c/single-pane] restores aux-bar hidden state even when external reveal fires during working-set apply", async () => {
    createSinglePaneController();
    const sessionA = makeSession(URI.parse("session:a"));
    const sessionB = makeSession(URI.parse("session:b"));
    harness.activeSessionObs.set(sessionA, void 0);
    harness.visibleSessionsObs.set([sessionA], void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.activeSessionObs.set(sessionB, void 0);
    harness.visibleSessionsObs.set([sessionB], void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.onApplyWorkingSet = () => {
      if (!harness.partVisibility.get(Parts.AUXILIARYBAR_PART)) {
        harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
        harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
      }
    };
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(sessionA, void 0);
    harness.visibleSessionsObs.set([sessionA], void 0);
    await timeout(0);
    harness.onApplyWorkingSet = void 0;
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux-bar should be hidden when returning to session A (detail-closed state)"
    );
  });
  test("[single-pane] restores the detail panel after a browser tab hides it", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    const hasDockedDetails = () => harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key);
    assert.strictEqual(hasDockedDetails(), false, "hidden target should clear the editor chevron context");
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    assert.strictEqual(hasDockedDetails(), true, "changes target should enable the editor chevron context");
    const browserEditor = Object.create(BrowserEditorInput.prototype);
    Object.defineProperty(browserEditor, "resource", { value: URI.parse("browser://test") });
    harness.activeEditorInput = browserEditor;
    harness.onDidActiveEditorChange.fire();
    assert.strictEqual(hasDockedDetails(), false, "browser target should clear the editor chevron context");
    await timeout(0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "browser tabs should hide the detail panel"
    );
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.activeEditorInput = store.add(new EmptyFileEditorInput());
    harness.onDidActiveEditorChange.fire();
    assert.strictEqual(hasDockedDetails(), true, "files target should enable the editor chevron context");
    await timeout(0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
      "file tabs should restore the detail panel after browser hides it"
    );
    assert.ok(
      harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "file tabs should reopen the Files container after browser hides it"
    );
    harness.activeEditorInput = store.add(new TestStubEditorInput(URI.parse("search-editor://test")));
    harness.onDidActiveEditorChange.fire();
    assert.strictEqual(hasDockedDetails(), false, "search target should clear the editor chevron context");
  });
  test("[single-pane] hides the detail panel when the main editor part is empty and keeps it closed on tab open", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    const hasDockedDetails = () => harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key);
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    await timeout(0);
    assert.strictEqual(hasDockedDetails(), true, "non-empty no-active-editor fallback should keep contextual detail active");
    harness.setPartHiddenCalls = [];
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.editorGroupsHaveContent = false;
    harness.activeEditorInput = void 0;
    harness.onDidEditorsChange.fire();
    await timeout(0);
    assert.deepStrictEqual({
      hasDockedDetails: hasDockedDetails(),
      hiddenCalls: harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true).length
    }, {
      hasDockedDetails: false,
      hiddenCalls: 1
    });
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.editorGroupsHaveContent = true;
    harness.activeEditorInput = makeWorkspaceFileEditor();
    harness.onDidEditorsChange.fire();
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.deepStrictEqual({
      hasDockedDetails: hasDockedDetails(),
      reveals: harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID)
    }, {
      hasDockedDetails: true,
      reveals: 0,
      openedFiles: false
    });
  });
  test("[cmd+n] keeps the detail panel visible for a new-session view with a transiently empty editor group", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    const session = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(session, void 0);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.editorGroupsHaveContent = false;
    harness.activeEditorInput = void 0;
    harness.onDidEditorsChange.fire();
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.strictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true).length,
      0
    );
  });
  test("[single-pane] keeps the detail panel closed by default when a file/changes editor is active", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.activeEditorInput = makeWorkspaceFileEditor();
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.deepStrictEqual({
      reveals: harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID)
    }, {
      reveals: 0,
      openedFiles: false
    });
  });
  test("[single-pane] reveals the Files detail when the empty Files placeholder becomes active", async () => {
    const controller = createSinglePaneController({ activateAux: true });
    await timeout(0);
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.activeEditorInput = store.add(new EmptyFileEditorInput());
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.deepStrictEqual({
      reveals: harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length > 0,
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID)
    }, {
      reveals: true,
      openedFiles: true
    });
    harness.setPartHiddenCalls = [];
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    await timeout(0);
    assert.strictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
      0,
      "hiding the detail while the placeholder is active must stick"
    );
    let releaseRestore;
    const restoreGate = new Promise((resolve) => {
      releaseRestore = resolve;
    });
    controller.runWithRestore(() => restoreGate);
    harness.setPartHiddenCalls = [];
    harness.activeEditorInput = store.add(new EmptyFileEditorInput());
    harness.onDidActiveEditorChange.fire();
    releaseRestore();
    await restoreGate;
    await timeout(0);
    assert.strictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
      0,
      "a restore-driven placeholder activation must not reveal the detail"
    );
  });
  test("[per-session detail] does not force-reveal the detail on editor activation, during or after a restore", async () => {
    const controller = createSinglePaneController({ activateAux: true });
    await timeout(0);
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    await timeout(0);
    let releaseRestore;
    const restoreGate = new Promise((resolve) => {
      releaseRestore = resolve;
    });
    controller.runWithRestore(() => restoreGate);
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.activeEditorInput = makeWorkspaceFileEditor();
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.strictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
      0,
      "the detail must stay closed during a session-switch restore"
    );
    releaseRestore();
    await restoreGate;
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.activeEditorInput = makeWorkspaceFileEditor();
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.strictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
      0,
      "the detail stays closed by default after the restore"
    );
  });
  test("[Scenario C] does not re-reveal the detail on reload when the whole side pane was closed", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.activeEditorInput = store.add(new EmptyFileEditorInput());
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.strictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
      0
    );
  });
  test("[per-session detail] keeps the whole side pane closed when returning to a session that had it closed", async () => {
    createSinglePaneController({ activateAux: true, revealAuxiliaryBarOnOpen: true, workspaceFolders: [{ uri: URI.file("/repo") }] });
    await timeout(0);
    const sessionA = makeSession(URI.parse("session:a"));
    const sessionB = makeSession(URI.parse("session:b"));
    harness.activeSessionObs.set(sessionA, void 0);
    harness.visibleSessionsObs.set([sessionA], void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    await timeout(0);
    harness.activeSessionObs.set(sessionB, void 0);
    harness.visibleSessionsObs.set([sessionB], void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await timeout(0);
    harness.activeSessionObs.set(sessionA, void 0);
    harness.visibleSessionsObs.set([sessionA], void 0);
    harness.activeEditorInput = store.add(new EmptyFileEditorInput());
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.deepStrictEqual({
      aux: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      editor: harness.partVisibility.get(Parts.EDITOR_PART)
    }, {
      aux: false,
      editor: false
    });
  });
  test("[per-session detail] restores detail visibility on session switch despite a stale queued detail sync", async () => {
    createSinglePaneController({ activateAux: true, revealAuxiliaryBarOnOpen: true, workspaceFolders: [{ uri: URI.file("/repo") }] });
    await timeout(0);
    const sessionA = makeSession(URI.parse("session:a"));
    const sessionB = makeSession(URI.parse("session:b"));
    harness.activeSessionObs.set(sessionA, void 0);
    harness.visibleSessionsObs.set([sessionA], void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    await timeout(0);
    harness.activeSessionObs.set(sessionB, void 0);
    harness.visibleSessionsObs.set([sessionB], void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    await timeout(0);
    harness.activeEditorInput = makeWorkspaceFileEditor();
    harness.onDidActiveEditorChange.fire();
    harness.activeSessionObs.set(sessionA, void 0);
    harness.visibleSessionsObs.set([sessionA], void 0);
    await timeout(0);
    assert.strictEqual(
      harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      false,
      "session A detail-hidden state must win over any queued detail-container sync"
    );
  });
  test("[per-session detail] persists detail visibility and restores it after reload", async () => {
    let controller = createSinglePaneController({ activateAux: true });
    await timeout(0);
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.storageService.flush(WillSaveStateReason.SHUTDOWN);
    const persisted = JSON.parse(harness.storageService.get("sessions.singlePane.layoutState", StorageScope.WORKSPACE) ?? "[]");
    assert.deepStrictEqual(
      persisted.map((entry) => ({ sessionResource: entry.sessionResource, auxiliaryBarVisible: entry.viewState?.auxiliaryBarVisible })),
      [{ sessionResource: session.resource.toString(), auxiliaryBarVisible: false }]
    );
    store.clear();
    controller = createSinglePaneController({
      activateAux: true,
      revealAuxiliaryBarOnOpen: true,
      initialPartVisibility: /* @__PURE__ */ new Map([[Parts.AUXILIARYBAR_PART, true], [Parts.EDITOR_PART, true]]),
      layoutState: persisted
    });
    harness.activeSessionObs.set(session, void 0);
    await timeout(0);
    assert.deepStrictEqual({
      auxVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      viewState: controller.getViewState(session.resource)?.auxiliaryBarVisible
    }, {
      auxVisible: false,
      viewState: false
    });
  });
  test("[B2] captures editor-part hidden state eagerly when the user closes the side pane", () => {
    const controller = createController();
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    setPartVisible(Parts.EDITOR_PART, false);
    assert.strictEqual(
      controller.getEditorPartHidden(session.resource),
      true,
      "editor-part hidden must be captured at the moment the user closes it"
    );
    setPartVisible(Parts.EDITOR_PART, true);
    assert.strictEqual(
      controller.getEditorPartHidden(session.resource),
      false,
      "editor-part hidden must update when the user reopens it"
    );
  });
  test("[B2] a later transient editor reveal does not overwrite a session's captured closed state during a switch", () => {
    const controller = createController();
    const sessionA = makeSession(URI.parse("session:a"));
    const sessionB = makeSession(URI.parse("session:b"));
    harness.activeSessionObs.set(sessionA, void 0);
    setPartVisible(Parts.EDITOR_PART, false);
    assert.strictEqual(controller.getEditorPartHidden(sessionA.resource), true);
    controller.runWithRestore(() => {
      harness.activeSessionObs.set(sessionB, void 0);
      setPartVisible(Parts.EDITOR_PART, true);
    });
    assert.strictEqual(
      controller.getEditorPartHidden(sessionA.resource),
      true,
      "a restore-driven editor reveal must not overwrite session A's captured closed state"
    );
  });
  test("[D4] keeps the open side pane on its current view when a new session is submitted", () => {
    const controller = createController();
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(session, void 0);
    assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
    harness.setPartHiddenCalls = [];
    harness.openedViews = [];
    session.isCreated.set(true, void 0);
    assert.deepStrictEqual({
      hidden: harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID),
      viewState: controller.getViewState(session.resource)
    }, {
      hidden: false,
      openedChanges: false,
      viewState: {
        auxiliaryBarVisible: true,
        auxiliaryBarActiveViewContainerId: SESSIONS_FILES_CONTAINER_ID
      }
    });
  });
  test("[D4] keeps the side pane closed when a new session is submitted with the aux bar hidden", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(session, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.setPartHiddenCalls = [];
    harness.openedViews = [];
    session.isCreated.set(true, void 0);
    assert.ok(
      !harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
      "side pane should stay closed after the new session is submitted"
    );
    assert.ok(
      !harness.openedViews.includes(CHANGES_VIEW_ID),
      "Changes view should not be shown when the aux bar is hidden"
    );
  });
  test("[D4] shows Files when a hidden side pane is opened after a change-free session is submitted", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(session, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    session.isCreated.set(true, void 0);
    harness.openedViewContainers = [];
    harness.openedViews = [];
    harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    assert.deepStrictEqual({
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID)
    }, {
      openedFiles: true,
      openedChanges: false
    });
  });
  test("[D4] shows Changes when a hidden side pane is opened after the session produced a change", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(session, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    session.isCreated.set(true, void 0);
    session.changes.set([makeChange("/file.ts")], void 0);
    harness.openedViewContainers = [];
    harness.openedViews = [];
    harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    assert.deepStrictEqual({
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID)
    }, {
      openedFiles: false,
      openedChanges: true
    });
  });
  test("[D4] records Files when a change-free session falls back from an invalid saved container", () => {
    const session = makeSession(URI.parse("session:1"));
    const controller = createController({
      layoutState: [{
        sessionResource: session.resource.toString(),
        viewState: {
          auxiliaryBarVisible: false,
          auxiliaryBarActiveViewContainerId: "missing.view"
        }
      }]
    });
    harness.activeSessionObs.set(session, void 0);
    harness.openedViews = [];
    harness.openedViewContainers = [];
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    assert.deepStrictEqual({
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      viewState: controller.getViewState(session.resource)
    }, {
      openedFiles: true,
      viewState: {
        auxiliaryBarVisible: true,
        auxiliaryBarActiveViewContainerId: SESSIONS_FILES_CONTAINER_ID
      }
    });
  });
  test("[D4] records Changes when a session with changes falls back from an invalid saved container", () => {
    const session = makeSession(URI.parse("session:1"), { changes: [makeChange("/file.ts")] });
    const controller = createController({
      layoutState: [{
        sessionResource: session.resource.toString(),
        viewState: {
          auxiliaryBarVisible: false,
          auxiliaryBarActiveViewContainerId: "missing.view"
        }
      }]
    });
    harness.activeSessionObs.set(session, void 0);
    harness.openedViews = [];
    harness.openedViewContainers = [];
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    assert.deepStrictEqual({
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID),
      viewState: controller.getViewState(session.resource)
    }, {
      openedChanges: true,
      viewState: {
        auxiliaryBarVisible: true,
        auxiliaryBarActiveViewContainerId: CHANGES_VIEW_CONTAINER_ID
      }
    });
  });
  test("[D4] remembers Files when the user chooses it after the session is submitted", () => {
    createController();
    const session1 = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled, isCreated: false });
    const session2 = makeSession(URI.parse("session:2"));
    harness.activeSessionObs.set(session1, void 0);
    session1.isCreated.set(true, void 0);
    harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
    harness.activeSessionObs.set(session2, void 0);
    harness.openedViews = [];
    harness.openedViewContainers = [];
    harness.activeSessionObs.set(session1, void 0);
    assert.deepStrictEqual({
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID)
    }, {
      openedFiles: true,
      openedChanges: false
    });
  });
  test("[D2] remembers hidden aux bar across new (untitled) sessions", () => {
    createController();
    const untitled1 = makeSession(URI.parse("session:untitled1"), { status: SessionStatus.Untitled });
    const existing = makeSession(URI.parse("session:existing"));
    const untitled2 = makeSession(URI.parse("session:untitled2"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(untitled1, void 0);
    assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.activeSessionObs.set(existing, void 0);
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.activeSessionObs.set(untitled2, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should stay hidden on the next new session"
    );
    assert.ok(
      !harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "should not re-open the Files view on the next new session"
    );
  });
  test("[D2] persists hidden new-session aux bar to storage and restores it after reload", () => {
    createController();
    const untitled1 = makeSession(URI.parse("session:untitled1"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(untitled1, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    assert.deepStrictEqual(
      JSON.parse(harness.storageService.get("sessions.newSessionViewState", StorageScope.WORKSPACE) ?? ""),
      { auxiliaryBarVisible: false },
      "state should be persisted to storage"
    );
    store.clear();
    createController({ newSessionViewState: { auxiliaryBarVisible: false } });
    const untitled2 = makeSession(URI.parse("session:untitled2"), { status: SessionStatus.Untitled });
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.activeSessionObs.set(untitled2, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should stay hidden after reload"
    );
    assert.ok(
      !harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "should not re-open the Files view after reload"
    );
  });
  test("[D3b] ignores malformed persisted new-session state and does not force-hide the aux bar", () => {
    createController({ newSessionViewStateRaw: JSON.stringify({ foo: "bar" }) });
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(untitled, void 0);
    assert.ok(
      !harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "malformed state must not force-hide the aux bar"
    );
    assert.ok(
      harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "should fall back to the default Files view"
    );
    assert.strictEqual(
      harness.storageService.get("sessions.newSessionViewState", StorageScope.WORKSPACE),
      void 0,
      "malformed state should be removed from storage"
    );
  });
  test("[D6] does not re-reveal aux bar after user hides it when session changes state updates", () => {
    createController();
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.openedViews = [];
    harness.openedViewContainers = [];
    harness.setPartHiddenCalls = [];
    session.changes.set([makeChange("/file.ts")], void 0);
    assert.ok(
      !harness.openedViews.includes(CHANGES_VIEW_ID) && !harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "aux bar must stay hidden after the user hid it, even when changes appear"
    );
  });
  test("[D9b] closing the whole side pane on a new session keeps it closed for the next new session", () => {
    const controller = createController();
    const untitled1 = makeSession(URI.parse("session:untitled1"), { status: SessionStatus.Untitled });
    const existing = makeSession(URI.parse("session:existing"));
    const untitled2 = makeSession(URI.parse("session:untitled2"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(untitled1, void 0);
    assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    controller.toggleSidePane();
    assert.deepStrictEqual(
      JSON.parse(harness.storageService.get("sessions.newSessionViewState", StorageScope.WORKSPACE) ?? ""),
      { auxiliaryBarVisible: false },
      "closing the whole side pane on a new session should record the closed choice"
    );
    harness.activeSessionObs.set(existing, void 0);
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.activeSessionObs.set(untitled2, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should stay hidden on the next new session"
    );
    assert.ok(
      !harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "should not re-open the Files view on the next new session"
    );
  });
  test("[D9b] closing the whole side pane while composing a new session does not reopen it when the session re-syncs", () => {
    const controller = createController();
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled });
    const other = makeSession(URI.parse("session:other"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(untitled, void 0);
    assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    controller.toggleSidePane();
    harness.visibleSessionsObs.set([untitled, other], void 0);
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.visibleSessionsObs.set([untitled], void 0);
    assert.ok(
      !harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "should not reopen the Files view when the same new session re-syncs"
    );
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should stay hidden when the same new session re-syncs"
    );
  });
  test("[D8] reveals the Changes view the first time a Changes editor is opened, then remembers the choice", () => {
    createController({ revealAuxiliaryBarOnOpen: true });
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    harness.openedViews = [];
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
    harness.onDidActiveEditorChange.fire();
    assert.ok(harness.openedViews.includes(CHANGES_VIEW_ID), "first Changes open should reveal the Changes view");
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.openedViews = [];
    harness.onDidActiveEditorChange.fire();
    assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID), "later Changes opens should not re-reveal the side pane");
  });
  test("[D9] closing the whole side pane is not remembered, so reopening Changes reveals it again", () => {
    const controller = createController({ revealAuxiliaryBarOnOpen: true });
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    harness.openedViews = [];
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidActiveEditorChange.fire();
    assert.ok(harness.openedViews.includes(CHANGES_VIEW_ID), "first Changes open should reveal the Changes view");
    controller.toggleSidePane();
    harness.openedViews = [];
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    assert.ok(harness.openedViews.includes(CHANGES_VIEW_ID), "reopening Changes after closing the whole side pane should reveal the Changes view again");
  });
  test("[D9] reopening the side pane restores the parts that were visible when it was closed", () => {
    const controller = createController();
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    const visibleAfterClose = controller.toggleSidePane();
    assert.strictEqual(visibleAfterClose, false, "side pane should be hidden after closing");
    assert.ok(harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true), "aux bar should be hidden");
    assert.ok(harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === true), "editor should be hidden");
    harness.setPartHiddenCalls.length = 0;
    const visibleAfterOpen = controller.toggleSidePane();
    assert.strictEqual(visibleAfterOpen, true, "side pane should be visible after reopening");
    assert.ok(harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === false), "editor should be restored");
    assert.ok(harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false), "aux bar should be restored");
  });
  test("[reopen default single-pane] a created session opens the side pane to the editor with the detail closed", () => {
    const controller = createSinglePaneController();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    harness.editorGroupsHaveContent = true;
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.setPartHiddenCalls = [];
    controller.toggleSidePane();
    assert.deepStrictEqual({
      editorRevealed: harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === false),
      detailRevealed: harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false)
    }, { editorRevealed: true, detailRevealed: false });
  });
  test("[reopen default single-pane] a new-session view opens the side pane to the Files detail", () => {
    const controller = createSinglePaneController();
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    harness.editorGroupsHaveContent = true;
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.setPartHiddenCalls = [];
    controller.toggleSidePane();
    assert.deepStrictEqual({
      editorRevealed: harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === false),
      detailRevealed: harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false)
    }, { editorRevealed: false, detailRevealed: true });
  });
  test("[D8] does not reveal the Changes view for an untitled session", () => {
    createController();
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(untitled, void 0);
    harness.openedViews = [];
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(untitled.resource);
    harness.onDidActiveEditorChange.fire();
    assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID), "untitled sessions are governed by D3b/D4, not D8");
  });
  test("[R1] single-pane hides the editor on entering a new-session view but keeps an explicit in-session reveal", async () => {
    createSinglePaneController();
    const untitled1 = makeSession(URI.parse("session:untitled1"), { status: SessionStatus.Untitled, isCreated: false });
    const existing = makeSession(URI.parse("session:existing"));
    const untitled2 = makeSession(URI.parse("session:untitled2"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(untitled1, void 0);
    await timeout(0);
    const firstReveal = {
      editorHiddenCalls: harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden),
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID)
    };
    harness.setPartHiddenCalls = [];
    harness.editorRevealedExplicitly = true;
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await timeout(0);
    const explicitRevealEditorHiddenCalls = harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden);
    harness.activeSessionObs.set(existing, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.editorRevealedExplicitly = false;
    harness.activeSessionObs.set(untitled2, void 0);
    await timeout(0);
    assert.deepStrictEqual({
      firstReveal,
      explicitRevealEditorHiddenCalls,
      secondRevealEditorHiddenCalls: harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden)
    }, {
      firstReveal: {
        editorHiddenCalls: [{ part: Parts.EDITOR_PART, hidden: true }],
        openedFiles: true
      },
      explicitRevealEditorHiddenCalls: [],
      secondRevealEditorHiddenCalls: [{ part: Parts.EDITOR_PART, hidden: true }]
    });
  });
  test("[R1] single-pane re-hides the editor on an automatic reveal in a new-session view", async () => {
    createSinglePaneController();
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(untitled, void 0);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.editorRevealedExplicitly = false;
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await timeout(0);
    assert.deepStrictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden),
      [{ part: Parts.EDITOR_PART, hidden: true }]
    );
  });
  test("[R1] single-pane hides the editor when the managed empty File tab is the active editor", async () => {
    createSinglePaneController();
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeEditorInput = store.add(new EmptyFileEditorInput());
    harness.onDidActiveEditorChange.fire();
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.activeSessionObs.set(untitled, void 0);
    await timeout(0);
    assert.deepStrictEqual({
      editorHiddenCalls: harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden)
    }, {
      editorHiddenCalls: [{ part: Parts.EDITOR_PART, hidden: true }]
    });
  });
  test("[R1/T2] single-pane does not hide the editor when a real file is the active editor", async () => {
    createSinglePaneController();
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled, isCreated: false });
    const fileEditor = Object.create(FileEditorInput.prototype);
    Object.defineProperty(fileEditor, "resource", { value: URI.file("/repo/file.ts") });
    harness.activeEditorInput = fileEditor;
    harness.onDidActiveEditorChange.fire();
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.activeSessionObs.set(untitled, void 0);
    await timeout(0);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await timeout(0);
    assert.deepStrictEqual({
      editorHiddenCalls: harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden)
    }, {
      editorHiddenCalls: []
    });
  });
  test("[R1/T4] single-pane keeps the editor open when a file is opened before it becomes active", async () => {
    createSinglePaneController();
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeEditorInput = store.add(new EmptyFileEditorInput());
    harness.onDidActiveEditorChange.fire();
    harness.activeSessionObs.set(untitled, void 0);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.editorRevealedExplicitly = true;
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await timeout(0);
    const beforeActiveEditor = harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden);
    const fileEditor = Object.create(FileEditorInput.prototype);
    Object.defineProperty(fileEditor, "resource", { value: URI.file("/repo/package.json") });
    harness.activeEditorInput = fileEditor;
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.deepStrictEqual({
      beforeActiveEditor,
      afterActiveEditor: harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden),
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART)
    }, {
      beforeActiveEditor: [],
      afterActiveEditor: [],
      editorVisible: true
    });
  });
  test("[R1] single-pane keeps the editor open when switching to the Files tab while the editor is already visible", async () => {
    createSinglePaneController();
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeEditorInput = store.add(new EmptyFileEditorInput());
    harness.onDidActiveEditorChange.fire();
    harness.activeSessionObs.set(untitled, void 0);
    await timeout(0);
    harness.editorRevealedExplicitly = true;
    const fileEditor = Object.create(FileEditorInput.prototype);
    Object.defineProperty(fileEditor, "resource", { value: URI.file("/repo/package.json") });
    harness.activeEditorInput = fileEditor;
    harness.onDidActiveEditorChange.fire();
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.editorRevealedExplicitly = false;
    harness.activeEditorInput = store.add(new EmptyFileEditorInput());
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.deepStrictEqual({
      editorHiddenCalls: harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden),
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART)
    }, {
      editorHiddenCalls: [],
      editorVisible: true
    });
  });
  test("[R1/T2] single-pane keeps the editor open when details is toggled off in a new-session view", async () => {
    createSinglePaneController();
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeEditorInput = store.add(new EmptyFileEditorInput());
    harness.onDidActiveEditorChange.fire();
    harness.activeSessionObs.set(untitled, void 0);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.editorRevealedExplicitly = true;
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await timeout(0);
    assert.deepStrictEqual({
      editorHiddenCalls: harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden),
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART)
    }, {
      editorHiddenCalls: [],
      editorVisible: true
    });
  });
  test("[R1] single-pane hides the editor when entering a new-session view with an inherited-visible editor", async () => {
    createSinglePaneController();
    const existing = makeSession(URI.parse("session:existing"));
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(existing, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.editorRevealedExplicitly = true;
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(untitled, void 0);
    await timeout(0);
    assert.deepStrictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden),
      [{ part: Parts.EDITOR_PART, hidden: true }]
    );
  });
  test("[D3b] standard controller does not hide the editor on new-session side-pane reveal", async () => {
    createController();
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(untitled, void 0);
    await timeout(0);
    assert.deepStrictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden),
      []
    );
  });
  test("[D8] does not reveal the Changes view while multiple sessions are visible", () => {
    createController();
    const a = makeSession(URI.parse("session:a"));
    const b = makeSession(URI.parse("session:b"));
    harness.visibleSessionsObs.set([a, b], void 0);
    harness.activeSessionObs.set(a, void 0);
    harness.openedViews = [];
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(a.resource);
    harness.onDidActiveEditorChange.fire();
    assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID), "multi-session mode manages the side pane separately");
  });
  test("[D5] shows the Changes view when the editor area is maximized", () => {
    createController();
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    harness.openedViews = [];
    harness.editorMaximized = true;
    harness.onDidChangeEditorMaximized.fire();
    assert.ok(
      harness.openedViews.includes(CHANGES_VIEW_ID),
      "Changes view should be shown when the editor is maximized"
    );
  });
  test("[D5] restores the previous aux bar visibility when the editor is un-maximized", () => {
    createController();
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.editorMaximized = true;
    harness.onDidChangeEditorMaximized.fire();
    harness.setPartHiddenCalls = [];
    harness.editorMaximized = false;
    harness.onDidChangeEditorMaximized.fire();
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should be restored to hidden after un-maximizing"
    );
  });
  test("[D5] does not capture forced aux bar visibility while the editor is maximized", () => {
    createController();
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.editorMaximized = true;
    harness.onDidChangeEditorMaximized.fire();
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.editorMaximized = false;
    harness.onDidChangeEditorMaximized.fire();
    const session2 = makeSession(URI.parse("session:2"));
    harness.activeSessionObs.set(session2, void 0);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(session, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should remain hidden for the session after the editor was maximized"
    );
  });
  test("[D5] keeps the Changes view shown while maximized regardless of the session state", () => {
    createController();
    const session1 = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session1, void 0);
    harness.editorMaximized = true;
    harness.onDidChangeEditorMaximized.fire();
    harness.setPartHiddenCalls = [];
    harness.openedViews = [];
    const session2 = makeSession(URI.parse("session:2"));
    harness.activeSessionObs.set(session2, void 0);
    assert.ok(
      harness.openedViews.includes(CHANGES_VIEW_ID),
      "Changes view should stay shown while maximized"
    );
    assert.ok(
      !harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should not be hidden while the editor is maximized"
    );
  });
  test("[D1] does not force auxiliary bar visible when restoring editor working set on session switch", async () => {
    const session1 = makeSession(URI.parse("session:1"));
    const session2 = makeSession(URI.parse("session:2"));
    createController({
      useModal: "some",
      workspaceFolders: [{ uri: URI.file("/repo") }],
      layoutState: [{
        sessionResource: "session:1",
        editorWorkingSet: { id: "ws-1", name: "ws-1" },
        viewState: { auxiliaryBarVisible: false, auxiliaryBarActiveViewContainerId: void 0 }
      }]
    });
    harness.activeSessionObs.set(session2, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(session1, void 0);
    await timeout(0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === false),
      "editor part should be revealed by the working set restore"
    );
    assert.ok(
      !harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
      "auxiliary bar must not be forced visible during working set restore"
    );
  });
  test("[single-pane] reveals the editor part for a created session on switch, even with useModal all (Editor-only default)", async () => {
    const workspaceFolders = [{ uri: URI.file("/repo") }];
    createSinglePaneController({ singlePaneLayoutEnabled: true, workspaceFolders });
    const untitled = makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false });
    const existing = makeSession(URI.parse("session:existing"));
    harness.activeSessionObs.set(untitled, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(existing, void 0);
    await timeout(0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === false),
      "editor part should be revealed for the created session"
    );
  });
  test("[single-pane] preserves detail-only layout when an active new session is replaced by its created session", async () => {
    const workspaceFolders = [{ uri: URI.file("/repo") }];
    const controller = createSinglePaneController({ singlePaneLayoutEnabled: true, workspaceFolders });
    const draft = makeSession(URI.parse("session:draft"), { status: SessionStatus.Untitled, isCreated: false });
    const created = makeSession(URI.parse("session:created"));
    harness.activeSessionObs.set(draft, void 0);
    harness.visibleSessionsObs.set([draft], void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    assert.strictEqual(controller.getEditorPartHidden(draft.resource), true);
    harness.setPartHiddenCalls = [];
    harness.openedViews = [];
    harness.onDidReplaceSession.fire({ from: draft, to: created });
    harness.activeSessionObs.set(created, void 0);
    harness.visibleSessionsObs.set([created], void 0);
    await timeout(0);
    assert.deepStrictEqual({
      editorReveals: harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden === false).length,
      editorHides: harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden === true).length,
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID),
      editorPartHidden: controller.getEditorPartHidden(created.resource),
      detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART)
    }, {
      editorReveals: 0,
      editorHides: 0,
      openedChanges: true,
      editorPartHidden: true,
      detailVisible: true,
      editorVisible: false
    });
  });
  test("[single-pane] preserves editor-hidden layout on submit even when the draft state was never captured", async () => {
    const workspaceFolders = [{ uri: URI.file("/repo") }];
    createSinglePaneController({ singlePaneLayoutEnabled: true, workspaceFolders });
    const draft = makeSession(URI.parse("session:draft"), { status: SessionStatus.Untitled, isCreated: false });
    const created = makeSession(URI.parse("session:created"));
    harness.activeSessionObs.set(draft, void 0);
    harness.visibleSessionsObs.set([draft], void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.setPartHiddenCalls = [];
    harness.onDidReplaceSession.fire({ from: draft, to: created });
    harness.activeSessionObs.set(created, void 0);
    harness.visibleSessionsObs.set([created], void 0);
    await timeout(0);
    assert.deepStrictEqual({
      editorReveals: harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden === false).length,
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART)
    }, {
      editorReveals: 0,
      editorVisible: false
    });
  });
  test("[single-pane] does not reveal the editor part for a created session whose editor was explicitly hidden", async () => {
    const workspaceFolders = [{ uri: URI.file("/repo") }];
    createSinglePaneController({
      singlePaneLayoutEnabled: true,
      workspaceFolders,
      layoutState: [{ sessionResource: "session:existing", editorPartHidden: true }]
    });
    const untitled = makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false });
    const existing = makeSession(URI.parse("session:existing"));
    harness.activeSessionObs.set(untitled, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(existing, void 0);
    await timeout(0);
    assert.ok(
      !harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === false),
      "the editor part must stay hidden for a session whose editor was explicitly hidden"
    );
  });
  test("[single-pane] does not reveal the editor part for a created quick chat on switch", async () => {
    createSinglePaneController({ singlePaneLayoutEnabled: true });
    const untitled = makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false });
    const quickChat = makeSession(URI.parse("session:qc"), { isQuickChat: true });
    harness.activeSessionObs.set(untitled, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(quickChat, void 0);
    await timeout(0);
    assert.ok(
      !harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === false),
      "the editor part must not be revealed for a quick chat"
    );
  });
  test("[single-pane] hides a visible editor part when switching to a quick chat with an empty editor group", async () => {
    createSinglePaneController({ singlePaneLayoutEnabled: true, activateAux: true });
    await timeout(0);
    harness.editorGroupsHaveContent = false;
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(makeSession(URI.parse("session:qc"), { isQuickChat: true }), void 0);
    await timeout(0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === true),
      "the editor part should hide for a quick chat with an empty editor group"
    );
  });
  test("[B4] persists aux-bar view state to sessions.layoutState key", () => {
    createController();
    const session1 = makeSession(URI.parse("session:1"));
    const session2 = makeSession(URI.parse("session:2"));
    harness.activeSessionObs.set(session1, void 0);
    harness.activePaneCompositeId = "custom.view";
    harness.activeSessionObs.set(session2, void 0);
    harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
    const stored = harness.storageService.get("sessions.layoutState", StorageScope.WORKSPACE);
    assert.ok(stored, "state should be persisted");
    const parsed = JSON.parse(stored);
    const session1Entry = parsed.find((e) => e.sessionResource === "session:1");
    assert.ok(session1Entry, "session 1 entry should exist");
    assert.deepStrictEqual(session1Entry.viewState, {
      auxiliaryBarVisible: false,
      auxiliaryBarActiveViewContainerId: "custom.view"
    });
  });
  test("[D1] keeps aux bar hidden after reload when a session with editors closes both editor and aux bar", () => {
    const workspaceFolders = [{ uri: URI.file("/repo") }];
    createController({ useModal: "some", workspaceFolders });
    const session1 = makeSession(URI.parse("session:1"));
    const session2 = makeSession(URI.parse("session:2"));
    harness.visibleEditorsList = [{}];
    harness.activeSessionObs.set(session1, void 0);
    harness.activeSessionObs.set(session2, void 0);
    harness.activeSessionObs.set(session1, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.visibleEditorsList = [];
    harness.activeSessionObs.set(session2, void 0);
    harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
    const stored = harness.storageService.get("sessions.layoutState", StorageScope.WORKSPACE);
    assert.ok(stored, "state should be persisted");
    store.clear();
    createController({ useModal: "some", workspaceFolders, layoutState: JSON.parse(stored) });
    const reloadedSession1 = makeSession(URI.parse("session:1"));
    harness.setPartHiddenCalls = [];
    harness.openedViews = [];
    harness.openedViewContainers = [];
    harness.activeSessionObs.set(reloadedSession1, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should remain hidden after reload"
    );
  });
  function reloadWithSidePaneToggledClosed() {
    const workspaceFolders = [{ uri: URI.file("/repo") }];
    const controller = createController({ useModal: "some", workspaceFolders, revealAuxiliaryBarOnOpen: true });
    const session = makeSession(URI.parse("session:1"));
    harness.visibleEditorsList = [{}];
    harness.activeSessionObs.set(session, void 0);
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidActiveEditorChange.fire();
    assert.deepStrictEqual(controller.getViewState(session.resource)?.auxiliaryBarVisible, true);
    controller.toggleSidePane();
    harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
    const stored = harness.storageService.get("sessions.layoutState", StorageScope.WORKSPACE);
    assert.ok(stored, "state should be persisted");
    store.clear();
    createController({ useModal: "some", workspaceFolders, layoutState: JSON.parse(stored), revealAuxiliaryBarOnOpen: true });
    const reloadedSession = makeSession(URI.parse("session:1"));
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.activeSessionObs.set(reloadedSession, void 0);
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(reloadedSession.resource);
  }
  test("[D9] does not auto-reveal the side pane when the Changes editor is restored on reload", () => {
    reloadWithSidePaneToggledClosed();
    harness.openedViews = [];
    harness.onDidActiveEditorChange.fire();
    assert.ok(
      !harness.openedViews.includes(CHANGES_VIEW_ID),
      "restoring the Changes editor on reload must not auto-reveal the side pane"
    );
  });
  test("[D9] reveals the Changes view when opening Changes after reloading a session whose side pane was toggled closed", () => {
    reloadWithSidePaneToggledClosed();
    harness.openedViews = [];
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidActiveEditorChange.fire();
    assert.ok(
      harness.openedViews.includes(CHANGES_VIEW_ID),
      "opening Changes after reload should reveal the Changes view"
    );
  });
  test("[D9] does not turn an explicit aux-bar hide into a collapse when another session is collapsed", () => {
    const workspaceFolders = [{ uri: URI.file("/repo") }];
    const controller = createController({ useModal: "some", workspaceFolders, revealAuxiliaryBarOnOpen: true });
    const sessionExplicit = makeSession(URI.parse("session:explicit"));
    const sessionCollapse = makeSession(URI.parse("session:collapse"));
    harness.visibleEditorsList = [{}];
    harness.activeSessionObs.set(sessionExplicit, void 0);
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(sessionExplicit.resource);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidActiveEditorChange.fire();
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    assert.strictEqual(controller.getViewState(sessionExplicit.resource)?.auxiliaryBarHiddenByCollapse, void 0);
    harness.activeSessionObs.set(sessionCollapse, void 0);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    controller.toggleSidePane();
    assert.strictEqual(controller.getViewState(sessionCollapse.resource)?.auxiliaryBarHiddenByCollapse, true);
    harness.activeSessionObs.set(sessionExplicit, void 0);
    harness.activeSessionObs.set(sessionCollapse, void 0);
    assert.strictEqual(controller.getViewState(sessionExplicit.resource)?.auxiliaryBarHiddenByCollapse, void 0);
  });
  test("[D9] re-opening the side pane to editor-only does not mark an explicit aux-bar hide as a collapse", () => {
    const workspaceFolders = [{ uri: URI.file("/repo") }];
    const controller = createController({ useModal: "some", workspaceFolders, revealAuxiliaryBarOnOpen: true });
    const session = makeSession(URI.parse("session:1"));
    harness.visibleEditorsList = [{}];
    harness.activeSessionObs.set(session, void 0);
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidActiveEditorChange.fire();
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    assert.strictEqual(controller.getViewState(session.resource)?.auxiliaryBarHiddenByCollapse, void 0);
    controller.toggleSidePane();
    controller.toggleSidePane();
    assert.strictEqual(controller.getViewState(session.resource)?.auxiliaryBarHiddenByCollapse, void 0);
    harness.openedViews = [];
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidActiveEditorChange.fire();
    assert.ok(
      !harness.openedViews.includes(CHANGES_VIEW_ID),
      "an explicit aux-bar hide must not re-reveal after a collapse + editor-only re-open"
    );
  });
  function setPartVisible(part, visible) {
    harness.partVisibility.set(part, visible);
    harness.onDidChangePartVisibility.fire({ partId: part, visible });
  }
  function resizeWindow(width) {
    harness.mainContainerWidth = width;
    harness.onDidLayoutMainContainer.fire({ width, height: 1e3 });
  }
  function sidebarHiddenCalls() {
    return harness.setPartHiddenCalls.filter((c) => c.part === Parts.SIDEBAR_PART).map((c) => c.hidden);
  }
  test("[D7] hides the sidebar on a small window when editor and aux bar are both open", () => {
    createController();
    harness.setPartHiddenCalls = [];
    resizeWindow(800);
    assert.deepStrictEqual(sidebarHiddenCalls(), [true]);
  });
  test("[D7] does not touch the sidebar on a large window", () => {
    createController();
    harness.setPartHiddenCalls = [];
    resizeWindow(2e3);
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D7] shows the sidebar again once the aux bar closes", () => {
    createController();
    resizeWindow(800);
    harness.setPartHiddenCalls = [];
    setPartVisible(Parts.AUXILIARYBAR_PART, false);
    assert.deepStrictEqual(sidebarHiddenCalls(), [false]);
  });
  test("[D7] shows the sidebar again once the window grows back", () => {
    createController();
    resizeWindow(800);
    harness.setPartHiddenCalls = [];
    resizeWindow(2e3);
    assert.deepStrictEqual(sidebarHiddenCalls(), [false]);
  });
  test("[D7] does not auto-show the sidebar after the user closed it manually", () => {
    createController();
    setPartVisible(Parts.SIDEBAR_PART, false);
    harness.setPartHiddenCalls = [];
    resizeWindow(800);
    setPartVisible(Parts.AUXILIARYBAR_PART, false);
    assert.ok(
      !sidebarHiddenCalls().includes(false),
      "sidebar must not be auto-shown while the user-closed preference holds"
    );
  });
  test("[D7] resumes auto-management after the user opens the sidebar again", () => {
    createController();
    setPartVisible(Parts.SIDEBAR_PART, false);
    setPartVisible(Parts.SIDEBAR_PART, true);
    harness.setPartHiddenCalls = [];
    resizeWindow(800);
    setPartVisible(Parts.AUXILIARYBAR_PART, false);
    assert.deepStrictEqual(sidebarHiddenCalls(), [true, false]);
  });
  test("[D7] does not auto-show the sidebar the user closed before reloading", () => {
    const controller = createController({
      mainContainerWidth: 800,
      initialPartVisibility: /* @__PURE__ */ new Map([
        [Parts.SIDEBAR_PART, false],
        [Parts.EDITOR_PART, false],
        [Parts.AUXILIARYBAR_PART, false]
      ])
    });
    harness.setPartHiddenCalls = [];
    controller.toggleSidePane();
    controller.toggleSidePane();
    assert.ok(
      !sidebarHiddenCalls().includes(false),
      "sidebar must not be auto-shown when it was closed before the reload"
    );
  });
  test("[D7] does not manage the sidebar while the editor is maximized", () => {
    createController();
    harness.editorMaximized = true;
    harness.onDidChangeEditorMaximized.fire();
    harness.setPartHiddenCalls = [];
    resizeWindow(800);
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D7] does not manage the sidebar when the experimental setting is disabled", () => {
    createController({ responsiveSidebar: false });
    harness.setPartHiddenCalls = [];
    resizeWindow(800);
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D7] does not hide the sidebar when navigating to a session that restores the side panel", () => {
    const sessionB = URI.parse("session:2");
    createController({
      revealAuxiliaryBarOnOpen: true,
      layoutState: [{
        sessionResource: sessionB.toString(),
        viewState: { auxiliaryBarVisible: true, auxiliaryBarActiveViewContainerId: CHANGES_VIEW_CONTAINER_ID }
      }]
    });
    setPartVisible(Parts.AUXILIARYBAR_PART, false);
    resizeWindow(800);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(makeSession(sessionB), void 0);
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D7] does not hide the sidebar when navigating to a session whose working set reveals the editor", async () => {
    const session1 = URI.parse("session:1");
    const session2 = URI.parse("session:2");
    createController({
      useModal: "some",
      workspaceFolders: [{ uri: URI.file("/repo") }],
      layoutState: [{
        sessionResource: session1.toString(),
        editorWorkingSet: { id: "ws-1", name: "ws-1" },
        viewState: { auxiliaryBarVisible: true, auxiliaryBarActiveViewContainerId: CHANGES_VIEW_CONTAINER_ID }
      }]
    });
    harness.activeSessionObs.set(makeSession(session2), void 0);
    await timeout(0);
    setPartVisible(Parts.AUXILIARYBAR_PART, true);
    setPartVisible(Parts.EDITOR_PART, false);
    resizeWindow(800);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(makeSession(session1), void 0);
    await timeout(0);
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D7] does not manage the sidebar while multiple sessions are visible", () => {
    createController();
    harness.visibleSessionsObs.set([
      makeSession(URI.parse("session:1")),
      makeSession(URI.parse("session:2"))
    ], void 0);
    harness.setPartHiddenCalls = [];
    resizeWindow(800);
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D7 single-pane] hides the sessions list when details is opened via the toggle action", () => {
    const controller = createSinglePaneController({ mainContainerWidth: 800 });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    harness.setPartHiddenCalls = [];
    controller.toggleDetails();
    assert.deepStrictEqual(sidebarHiddenCalls(), [true]);
  });
  test("[D7 single-pane] does not hide the sessions list on a big window when details is opened", () => {
    const controller = createSinglePaneController({ mainContainerWidth: 2400 });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    harness.setPartHiddenCalls = [];
    controller.toggleDetails();
    assert.deepStrictEqual(sidebarHiddenCalls(), [], "a wide window keeps the sessions list open");
  });
  test("[D7 single-pane] restores the sessions list when details is closed via the toggle action", () => {
    const controller = createSinglePaneController({ mainContainerWidth: 800 });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    controller.toggleDetails();
    harness.setPartHiddenCalls = [];
    controller.toggleDetails();
    assert.deepStrictEqual(sidebarHiddenCalls(), [false]);
  });
  test("[D7 single-pane] does not touch the sessions list on automatic details opens", () => {
    createSinglePaneController({ mainContainerWidth: 800 });
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    harness.setPartHiddenCalls = [];
    setPartVisible(Parts.AUXILIARYBAR_PART, true);
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D7 single-pane] does not manage the sessions list while multiple sessions are visible", () => {
    const controller = createSinglePaneController({ mainContainerWidth: 800 });
    harness.visibleSessionsObs.set([
      makeSession(URI.parse("session:1")),
      makeSession(URI.parse("session:2"))
    ], void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    harness.setPartHiddenCalls = [];
    controller.toggleDetails();
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D7 single-pane] does not restore a sessions list the user reopened manually", () => {
    const controller = createSinglePaneController({ mainContainerWidth: 800 });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    controller.toggleDetails();
    setPartVisible(Parts.SIDEBAR_PART, true);
    harness.setPartHiddenCalls = [];
    controller.toggleDetails();
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D7 single-pane] restores an auto-hidden sessions list once the side pane is fully hidden", () => {
    const controller = createSinglePaneController({ mainContainerWidth: 800 });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    controller.toggleDetails();
    harness.setPartHiddenCalls = [];
    setPartVisible(Parts.AUXILIARYBAR_PART, false);
    assert.deepStrictEqual(sidebarHiddenCalls(), [false]);
  });
  test("[D7 single-pane] restores an auto-hidden sessions list once the window grows past the threshold", () => {
    const controller = createSinglePaneController({ mainContainerWidth: 800 });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    controller.toggleDetails();
    harness.setPartHiddenCalls = [];
    resizeWindow(2400);
    assert.deepStrictEqual(sidebarHiddenCalls(), [false]);
  });
  test("[D7 single-pane] does not restore a manually-hidden sessions list when the side pane is hidden", () => {
    createSinglePaneController({ mainContainerWidth: 800 });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    setPartVisible(Parts.SIDEBAR_PART, false);
    harness.setPartHiddenCalls = [];
    setPartVisible(Parts.AUXILIARYBAR_PART, false);
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D7 single-pane] contributes the Toggle Details command to the editor title layout cluster", () => {
    createSinglePaneController();
    const items = MenuRegistry.getMenuItems(MenuId.EditorTitleLayout).filter(isIMenuItem).filter((item) => item.command.id === TOGGLE_DETAILS_COMMAND_ID);
    assert.strictEqual(items.length, 1, "exactly one Toggle Details item on the editor title layout cluster");
    const when = items[0].when?.serialize() ?? "";
    assert.deepStrictEqual({
      icon: ThemeIcon.isThemeIcon(items[0].command.icon) ? items[0].command.icon.id : void 0,
      order: items[0].order,
      hasToggled: !!items[0].command.toggled,
      gatedOnEditorArea: when.includes(MainEditorAreaVisibleContext.key),
      gatedOnDockedDetails: when.includes(HasDockedDetailsContext.key)
    }, {
      icon: Codicon.listSelection.id,
      // Conditional (hidden for tab types with no detail, e.g. browser and
      // search), but keeps its trailing position after the always-present
      // maximize (order 10) and hide-editor (order 20) items.
      order: 30,
      hasToggled: true,
      gatedOnEditorArea: true,
      gatedOnDockedDetails: true
    });
  });
  function openEditor(editor) {
    const event = { groupId: 1, editor };
    harness.onWillOpenEditor.fire(event);
  }
  test("[Scenario 8] hides the sessions list when a real file is opened in a created session with the editor closed", async () => {
    createSinglePaneController({ mainContainerWidth: 800 });
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    openEditor(Object.create(FileEditorInput.prototype));
    assert.deepStrictEqual(sidebarHiddenCalls(), [true]);
  });
  test("[Scenario 8] hides the sessions list when a single-file diff is opened in a created session with the editor closed", async () => {
    createSinglePaneController({ mainContainerWidth: 800 });
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    const diffEditor = Object.create(DiffEditorInput.prototype);
    Object.defineProperty(diffEditor, "original", { value: Object.create(FileEditorInput.prototype) });
    Object.defineProperty(diffEditor, "modified", { value: Object.create(FileEditorInput.prototype) });
    openEditor(diffEditor);
    assert.deepStrictEqual(sidebarHiddenCalls(), [true]);
  });
  test("[Scenario 8] does not hide the sessions list on a big window when a file is opened", async () => {
    createSinglePaneController({ mainContainerWidth: 2400 });
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    openEditor(Object.create(FileEditorInput.prototype));
    assert.deepStrictEqual(sidebarHiddenCalls(), [], "a wide window keeps the sessions list open");
  });
  test("[Scenario 8] does not hide the sessions list in a new (uncreated) session", async () => {
    createSinglePaneController({ mainContainerWidth: 800 });
    harness.activeSessionObs.set(makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    openEditor(Object.create(FileEditorInput.prototype));
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[Scenario 8] does not hide the sessions list when the editor area is already open", async () => {
    createSinglePaneController({ mainContainerWidth: 800 });
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    openEditor(Object.create(FileEditorInput.prototype));
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[Scenario 8] does not hide the sessions list when a managed empty tab is opened", async () => {
    createSinglePaneController({ mainContainerWidth: 800 });
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    openEditor(store.add(new EmptyFileEditorInput()));
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[Scenario 8] does not hide the sessions list on file open while multiple sessions are visible", () => {
    createSinglePaneController({ mainContainerWidth: 800 });
    harness.visibleSessionsObs.set([
      makeSession(URI.parse("session:1")),
      makeSession(URI.parse("session:2"))
    ], void 0);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.setPartHiddenCalls = [];
    openEditor(Object.create(FileEditorInput.prototype));
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D10] hides the aux-bar part for a quick chat when its view containers are gated off", async () => {
    createController();
    harness.activeSessionObs.set(makeSession(URI.parse("session:qc"), { isQuickChat: true }), void 0);
    await timeout(0);
    harness.activeAuxViewContainerIds = [];
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.onDidChangeActiveViewDescriptors.fire();
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux-bar part should hide when a quick chat has no active view containers"
    );
  });
  test("[D10] does not hide the aux bar during early reload when there is no active session yet", () => {
    createController({ activeAuxViewContainerIds: [] });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.onDidChangeActiveViewDescriptors.fire();
    assert.deepStrictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      [],
      "aux-bar part must not be hidden by D10 while there is no active session"
    );
  });
  test("[D10] does not hide the aux bar for a workspace session with transiently empty containers", async () => {
    createController({ activeAuxViewContainerIds: [] });
    harness.activeSessionObs.set(makeSession(URI.parse("session:ws")), void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.onDidChangeActiveViewDescriptors.fire();
    assert.deepStrictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      [],
      "aux-bar part must not be hidden by D10 for a workspace session with transiently empty containers"
    );
  });
  test("[D10] never reveals an empty aux-bar part", async () => {
    createController({ activeAuxViewContainerIds: [] });
    harness.activeSessionObs.set(makeSession(URI.parse("session:qc"), { isQuickChat: true }), void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.setPartHiddenCalls = [];
    harness.onDidChangeActiveViewDescriptors.fire();
    assert.ok(
      !harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
      "aux-bar part should never be revealed when it has no active view containers"
    );
  });
  test("[D10] re-hides the aux-bar part if a switch to a quick chat left it visible with no containers", async () => {
    createController({ activeAuxViewContainerIds: [] });
    harness.activeSessionObs.set(makeSession(URI.parse("session:qc"), { isQuickChat: true }), void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.onDidChangeViewContainerVisibility.fire({ id: CHANGES_VIEW_CONTAINER_ID, visible: false, location: ViewContainerLocation.AuxiliaryBar });
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux-bar part should be hidden reactively when a quick chat has no active view containers"
    );
  });
  test("[D10] leaves the aux-bar part alone when it has active view containers", () => {
    createController();
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.onDidChangeActiveViewDescriptors.fire();
    assert.deepStrictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART),
      [],
      "aux-bar part should be left as-is while it has active view containers"
    );
  });
  test("[D10] hides the aux-bar part when a quick chat becomes visible with no active containers", async () => {
    createController({ activeAuxViewContainerIds: [] });
    harness.activeSessionObs.set(makeSession(URI.parse("session:qc"), { isQuickChat: true }), void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux-bar part should hide when a quick chat becomes visible with no active view containers"
    );
  });
  test("[D10] leaves the aux-bar part visible when it becomes visible with active containers", () => {
    createController();
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    assert.deepStrictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART),
      [],
      "aux-bar part should stay visible when it becomes visible with active view containers"
    );
  });
  test("[D10] toggling the side pane with no aux containers reveals the editor, not an empty aux bar", () => {
    const controller = createController({ activeAuxViewContainerIds: [] });
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.editorGroupsHaveContent = true;
    harness.setPartHiddenCalls = [];
    controller.toggleSidePane();
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === false),
      "toggle should reveal the editor part"
    );
    assert.ok(
      !harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
      "toggle should never reveal an empty aux bar"
    );
  });
  test("[D10] toggling the side pane with neither editors nor aux containers reveals nothing", () => {
    const controller = createController({ activeAuxViewContainerIds: [] });
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.editorGroupsHaveContent = false;
    harness.setPartHiddenCalls = [];
    controller.toggleSidePane();
    assert.deepStrictEqual(
      harness.setPartHiddenCalls.filter((c) => c.hidden === false),
      [],
      "toggle should reveal nothing when there is no content on either side"
    );
  });
  async function settle() {
    for (let i = 0; i < 6; i++) {
      await timeout(0);
    }
  }
  function hasFilesTab() {
    return harness.activeGroupEditors.some((e) => e instanceof EmptyFileEditorInput);
  }
  function hasChangesTab() {
    return harness.activeGroupEditors.some((e) => !(e instanceof EmptyFileEditorInput) && e.resource !== void 0);
  }
  test("[managed tabs] ensures the Changes and Files tabs for a created session under suppression", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
  });
  test("[managed tabs / Changes pill] reveals the editor area before opening the managed Changes editor", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    await settle();
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.setPartHiddenCalls = [];
    const handler = CommandsRegistry.getCommand("workbench.agentSessions.action.viewChanges")?.handler;
    assert.ok(handler, "Changes pill command should be registered");
    await handler(harness.instaService, session);
    await settle();
    assert.deepStrictEqual({
      editorRevealed: harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === false),
      hasChangesTab: hasChangesTab()
    }, {
      editorRevealed: true,
      hasChangesTab: true
    });
  });
  test("[managed tabs / Scenario 9] shows the Changes and Files tabs for a new-session view", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    await settle();
    assert.deepStrictEqual({
      hasChangesTab: hasChangesTab(),
      hasFilesTab: hasFilesTab(),
      changesTabMissing: harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key)
    }, {
      hasChangesTab: true,
      hasFilesTab: true,
      changesTabMissing: false
    });
  });
  test("[managed tabs / new session] re-ensures Changes after a delayed different-folder restore retains Files", async () => {
    const controller = createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:created")), void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
    harness.activeSessionObs.set(void 0, void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
    const filesTab = harness.activeGroupEditors.find((editor) => editor instanceof EmptyFileEditorInput);
    assert.ok(filesTab);
    controller.runWithRestore(() => {
      harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length, filesTab);
      harness.activeEditorInput = filesTab;
      harness.onDidEditorsChange.fire();
    });
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
  });
  test("[managed tabs / submit] opens the Changes tab when a new session is submitted (group already has the Files tab)", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const session = makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(session, void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
    harness.activeEditorInput = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    session.isCreated.set(true, void 0);
    await settle();
    const changesResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
    assert.deepStrictEqual({
      hasChangesTab: hasChangesTab(),
      hasFilesTab: hasFilesTab(),
      changesActive: !!harness.activeEditorInput?.resource && isEqual(harness.activeEditorInput.resource, changesResource)
    }, { hasChangesTab: true, hasFilesTab: true, changesActive: true });
  });
  test("[managed tabs / submit] opens the Changes tab on a resource-replace submit (agent-host path)", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:draft"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
    const committed = URI.parse("session:committed");
    harness.activeSessionObs.set(makeSession(committed, { isCreated: true }), void 0);
    await settle();
    const changesResource = harness.sessionChangesService.getChangesEditorResource(committed);
    assert.deepStrictEqual({
      hasChangesTab: hasChangesTab(),
      hasFilesTab: hasFilesTab(),
      changesActive: !!harness.activeEditorInput?.resource && isEqual(harness.activeEditorInput.resource, changesResource)
    }, { hasChangesTab: true, hasFilesTab: true, changesActive: true });
  });
  test(`[managed tabs / session switch] does not leak a superseded submit's "activate Changes" intent onto the switched-to session`, async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const sessionA = makeSession(URI.parse("session:a"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(sessionA, void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
    let releaseChangesOpen;
    const changesOpenGate = new Promise((resolve) => {
      releaseChangesOpen = resolve;
    });
    let gateArmed = true;
    harness.onOpenChangesEditor = () => {
      if (gateArmed) {
        gateArmed = false;
        return changesOpenGate;
      }
      return void 0;
    };
    sessionA.isCreated.set(true, void 0);
    await settle();
    const aActiveCalls = harness.openChangesEditorCalls.filter((c) => isEqual(c.sessionResource, sessionA.resource) && c.active);
    assert.strictEqual(aActiveCalls.length, 1, "A's submit should open its Changes tab active (and stall on the gate)");
    const sessionB = makeSession(URI.parse("session:b"), { isCreated: true });
    harness.activeSessionObs.set(sessionB, void 0);
    await settle();
    releaseChangesOpen();
    await settle();
    const bActiveCalls = harness.openChangesEditorCalls.filter((c) => isEqual(c.sessionResource, sessionB.resource) && c.active);
    assert.deepStrictEqual({ bChangesOpenedActive: bActiveCalls.length }, { bChangesOpenedActive: 0 });
  });
  test("[managed tabs / details-only] a details-only reveal restores the docked inputs even when one was closed", async () => {
    createSinglePaneController({ activateAux: true, initialPartVisibility: /* @__PURE__ */ new Map([[Parts.EDITOR_PART, false], [Parts.AUXILIARYBAR_PART, true]]) });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
    const fileTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
    harness.onDidCloseEditor.fire({ editor: fileTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.onDidRevealSidePane.fire();
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
  });
  test("[managed tabs / details-only] an editor reveal does NOT force back a closed managed tab", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const fileTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
    harness.onDidCloseEditor.fire({ editor: fileTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), false);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    harness.onDidRevealSidePane.fire();
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: false });
  });
  test("[managed tabs / new session] re-opens both managed tabs when a working-set apply empties the group during the switch", async () => {
    const controller = createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:created")), void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    controller.runWithRestore(() => {
      harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length);
      harness.onDidEditorsChange.fire();
    });
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
  });
  test("[managed tabs / new session] re-opens both managed tabs on restore-end even if no editor-change fires during the restore", async () => {
    const controller = createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:created")), void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    controller.runWithRestore(() => {
      harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length);
    });
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
  });
  test("[managed tabs / Scenario 9] removes the Files tab while a real editor is open and does not re-add it when that file closes", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    assert.strictEqual(hasFilesTab(), true);
    const realEditor = store.add(new TestStubEditorInput(URI.file("/repo/a.ts")));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    openEditor(realEditor);
    harness.activeGroupEditors.push(realEditor);
    harness.onDidEditorsChange.fire();
    await settle();
    const filesRemoved = !hasFilesTab();
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(realEditor), 1);
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({
      filesRemoved,
      filesReadded: hasFilesTab()
    }, {
      filesRemoved: true,
      filesReadded: false
    });
  });
  test("[managed tabs / Scenario 9] keeps a Files tab the user adds via `+` while a real file is open", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const realEditor = store.add(new TestStubEditorInput(URI.file("/repo/a.ts")));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    openEditor(realEditor);
    harness.activeGroupEditors.push(realEditor);
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), false);
    const userFilesTab = store.add(new EmptyFileEditorInput());
    openEditor(userFilesTab);
    harness.activeGroupEditors.push(userFilesTab);
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), true, "a user-added Files tab stays while a real file is open");
    openEditor(realEditor);
    harness.onDidActiveEditorChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), true, "re-activating an open file must not tidy the user-added Files tab");
  });
  test("[managed tabs / Scenario 9] keeps the Files tab when a non-file editor (e.g. the browser) opens", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    assert.strictEqual(hasFilesTab(), true);
    const browserEditor = store.add(new TestStubEditorInput(URI.parse("browserView://host/page")));
    harness.activeGroupEditors.push(browserEditor);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    openEditor(browserEditor);
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), true, "a non-file editor must not remove the Files tab");
  });
  test("[single-pane] closes non-managed tabs when the editor area hides and reopens them when shown", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const fileResource = URI.file("/repo/a.ts");
    harness.activeGroupEditors.splice(1, 0, store.add(new TestStubEditorInput(fileResource)));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await settle();
    const originalIndex = harness.activeGroupEditors.findIndex((e) => e.resource && isEqual(e.resource, fileResource));
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    await settle();
    const closedFile = harness.closedEditors.some((e) => isEqual(e.resource, fileResource));
    const filesTabKept = hasFilesTab();
    const fileTabGone = !harness.activeGroupEditors.some((e) => e.resource && isEqual(e.resource, fileResource));
    harness.openedEditors = [];
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await settle();
    assert.deepStrictEqual({
      closedFile,
      filesTabKept,
      fileTabGone,
      reopenedFile: harness.openedEditors.some((e) => isResourceEditorInput(e) && isEqual(e.resource, fileResource)),
      restoredAtOriginalIndex: harness.activeGroupEditors.findIndex((e) => e.resource && isEqual(e.resource, fileResource)) === originalIndex
    }, {
      closedFile: true,
      filesTabKept: true,
      fileTabGone: true,
      reopenedFile: true,
      restoredAtOriginalIndex: true
    });
  });
  test("[single-pane] closes a non-restorable non-docked tab (e.g. untitled Search) when the editor area hides, without restoring it", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const searchResource = URI.parse("search-editor:/Untitled-1");
    harness.activeGroupEditors.splice(1, 0, store.add(new TestStubEditorInput(searchResource, { dirty: true, nonRestorable: true })));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await settle();
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    await settle();
    const closedSearch = harness.closedEditors.some((e) => isEqual(e.resource, searchResource));
    const searchTabGone = !harness.activeGroupEditors.some((e) => e.resource && isEqual(e.resource, searchResource));
    harness.openedEditors = [];
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await settle();
    assert.deepStrictEqual({
      closedSearch,
      searchTabGone,
      filesTabKept: hasFilesTab(),
      reopenedSearch: harness.openedEditors.some((e) => isResourceEditorInput(e) && isEqual(e.resource, searchResource))
    }, {
      closedSearch: true,
      searchTabGone: true,
      filesTabKept: true,
      reopenedSearch: false
    });
  });
  test("[single-pane] does NOT close editors when the whole side pane is closed (editor + aux hidden)", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const fileResource = URI.file("/repo/a.ts");
    harness.activeGroupEditors.splice(1, 0, store.add(new TestStubEditorInput(fileResource)));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await settle();
    harness.closedEditors = [];
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    await settle();
    assert.deepStrictEqual({
      anyEditorClosed: harness.closedEditors.length > 0,
      fileStillPresent: harness.activeGroupEditors.some((e) => e.resource && isEqual(e.resource, fileResource))
    }, {
      anyEditorClosed: false,
      fileStillPresent: true
    });
  });
  test("[managed tabs / close] does not re-open a managed tab after the user closes it (group stays non-empty)", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const fileTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    assert.ok(fileTab);
    const index = harness.activeGroupEditors.indexOf(fileTab);
    harness.activeGroupEditors.splice(index, 1);
    harness.onDidCloseEditor.fire({ editor: fileTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), false, "the closed Files tab stays closed");
  });
  test("[managed tabs / close] re-opens the default tabs for the new session after switching (empty group)", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const fileTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    const index = harness.activeGroupEditors.indexOf(fileTab);
    harness.activeGroupEditors.splice(index, 1);
    harness.onDidCloseEditor.fire({ editor: fileTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), false);
    harness.activeSessionObs.set(makeSession(URI.parse("session:2")), void 0);
    await settle();
    assert.strictEqual(hasFilesTab(), true, "the default tabs are opened for the new session");
  });
  test("[managed tabs / add-tab] closing the Changes tab flips SinglePaneChangesTabMissingContext", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const changesTab = harness.activeGroupEditors.find((e) => !(e instanceof EmptyFileEditorInput) && e.resource !== void 0);
    assert.strictEqual(harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key), false);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(changesTab), 1);
    harness.onDidCloseEditor.fire({ editor: changesTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({
      hasChangesTab: hasChangesTab(),
      changesTabMissing: harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key)
    }, { hasChangesTab: false, changesTabMissing: true });
  });
  test("[managed tabs / add-tab] closing the Files tab flips SinglePaneFilesTabMissingContext", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const fileTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    assert.strictEqual(harness.contextKeyService.getContextKeyValue(SinglePaneFilesTabMissingContext.key), false);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
    harness.onDidCloseEditor.fire({ editor: fileTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({
      hasFilesTab: hasFilesTab(),
      filesTabMissing: harness.contextKeyService.getContextKeyValue(SinglePaneFilesTabMissingContext.key)
    }, { hasFilesTab: false, filesTabMissing: true });
  });
  test("[managed tabs / add-tab] reopening the Changes tab clears the missing context and is retained", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const session = URI.parse("session:1");
    harness.activeSessionObs.set(makeSession(session), void 0);
    await settle();
    const changesTab = harness.activeGroupEditors.find((e) => !(e instanceof EmptyFileEditorInput) && e.resource !== void 0);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(changesTab), 1);
    harness.onDidCloseEditor.fire({ editor: changesTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key), true);
    const changesResource = harness.sessionChangesService.getChangesEditorResource(session);
    harness.activeGroupEditors.push(store.add(new TestStubEditorInput(changesResource)));
    harness.onDidEditorsChange.fire();
    await settle();
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({
      hasChangesTab: hasChangesTab(),
      changesTabMissing: harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key)
    }, { hasChangesTab: true, changesTabMissing: false });
  });
  test("[managed tabs / add-tab] reopening managed tabs from the plus menu adds them at the end", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const session = URI.parse("session:1");
    harness.activeSessionObs.set(makeSession(session), void 0);
    await settle();
    const changesTab = harness.activeGroupEditors.find((e) => !(e instanceof EmptyFileEditorInput) && e.resource !== void 0);
    const filesTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    const extraEditor = store.add(new TestStubEditorInput(URI.file("/repo/extra.ts")));
    harness.activeGroupEditors.push(extraEditor);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(changesTab), 1);
    harness.onDidCloseEditor.fire({ editor: changesTab });
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(filesTab), 1);
    harness.onDidCloseEditor.fire({ editor: filesTab });
    harness.onDidEditorsChange.fire();
    await settle();
    await new NewChangesTabAction().run(harness.instaService);
    await new NewFileTabAction().run(harness.instaService);
    assert.deepStrictEqual(harness.activeGroupEditors.map((editor) => {
      if (editor === extraEditor) {
        return "extra";
      }
      if (editor instanceof EmptyFileEditorInput) {
        return "files";
      }
      if (editor.resource && isEqual(editor.resource, harness.sessionChangesService.getChangesEditorResource(session))) {
        return "changes";
      }
      return "other";
    }), ["extra", "changes", "files"]);
  });
  test("[managed tabs / reload] closing a stale Changes tab happens under editor-visibility suppression", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const staleChangesResource = harness.sessionChangesService.getChangesEditorResource(URI.parse("session:stale"));
    harness.activeGroupEditors.push(store.add(new TestStubEditorInput(staleChangesResource)));
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const staleClosed = harness.closedEditors.some((e) => e.resource && isEqual(e.resource, staleChangesResource));
    const allClosesSuppressed = harness.closeSuppressionFlags.every((flag) => flag);
    assert.deepStrictEqual({ staleClosed, allClosesSuppressed }, { staleClosed: true, allClosesSuppressed: true });
  });
  test("[managed tabs / Issue 1] re-ensures the Files tab when the side pane is reopened via the aux bar alone", async () => {
    createSinglePaneController({ activateAux: true, initialPartVisibility: /* @__PURE__ */ new Map([[Parts.EDITOR_PART, false], [Parts.AUXILIARYBAR_PART, true]]) });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    await settle();
    const fileTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    assert.ok(fileTab);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
    harness.onDidCloseEditor.fire({ editor: fileTab });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    await settle();
    assert.strictEqual(hasFilesTab(), false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.onDidRevealSidePane.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), true, "reopening via the aux bar re-ensures the Files tab");
  });
  test("[managed tabs / Issue 2] opening a file after the side pane was closed does not re-force the managed tabs", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const session = URI.parse("session:1");
    harness.activeSessionObs.set(makeSession(session), void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
    const changesTab = harness.activeGroupEditors.find((e) => !(e instanceof EmptyFileEditorInput) && e.resource !== void 0);
    const filesTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    for (const tab of [changesTab, filesTab]) {
      harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(tab), 1);
      harness.onDidCloseEditor.fire({ editor: tab });
    }
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: false });
    const changesResource = harness.sessionChangesService.getChangesEditorResource(session);
    harness.activeGroupEditors.push(store.add(new TestStubEditorInput(URI.file("/repo/opened.ts"))));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    harness.onDidRevealSidePane.fire();
    harness.onDidActiveEditorChange.fire();
    harness.onDidEditorsChange.fire();
    await settle();
    const hasManagedChangesTab = harness.activeGroupEditors.some((e) => e.resource && isEqual(e.resource, changesResource));
    assert.deepStrictEqual({ hasManagedChangesTab, hasFilesTab: hasFilesTab() }, { hasManagedChangesTab: false, hasFilesTab: false });
  });
  test("[managed tabs / Issue 2] toggling the empty side pane open re-populates the default managed tabs", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const session = URI.parse("session:1");
    harness.activeSessionObs.set(makeSession(session), void 0);
    await settle();
    for (const tab of [...harness.activeGroupEditors]) {
      harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(tab), 1);
      harness.onDidCloseEditor.fire({ editor: tab });
    }
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: false });
    harness.onDidRevealSidePane.fire();
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvbGF5b3V0L3Rlc3QvYnJvd3Nlci9kZXNrdG9wU2Vzc2lvbkxheW91dENvbnRyb2xsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU2V0dGFibGVPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGlzSU1lbnVJdGVtLCBNZW51SWQsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBNYWluRWRpdG9yQXJlYVZpc2libGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBTdG9yYWdlU2NvcGUsIFdpbGxTYXZlU3RhdGVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkZpbGVDaGFuZ2UsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBTaW5nbGVQYW5lQ2hhbmdlc1RhYk1pc3NpbmdDb250ZXh0LCBIYXNEb2NrZWREZXRhaWxzQ29udGV4dCwgU2luZ2xlUGFuZUZpbGVzVGFiTWlzc2luZ0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBGaWxlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9maWxlcy9icm93c2VyL2VkaXRvcnMvZmlsZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yL2RpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBFbXB0eUZpbGVFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VtcHR5RmlsZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvcldpbGxPcGVuRXZlbnQsIGlzUmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IExheW91dENvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL2Rlc2t0b3BTZXNzaW9uTGF5b3V0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBTaW5nbGVQYW5lTGF5b3V0Q29udHJvbGxlciwgVE9HR0xFX0RFVEFJTFNfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2luZ2xlUGFuZUxheW91dENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRCwgQ0hBTkdFU19WSUVXX0lEIH0gZnJvbSAnLi4vLi4vLi4vY2hhbmdlcy9jb21tb24vY2hhbmdlcy5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uL2NoYW5nZXMvYnJvd3Nlci9jaGFuZ2VzQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9icm93c2VyL2ZpbGVzLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBOZXdDaGFuZ2VzVGFiQWN0aW9uLCBOZXdGaWxlVGFiQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvYWRkVGFiQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXN0SGFybmVzcywgSUNyZWF0ZU9wdGlvbnMsIElUZXN0TGF5b3V0SGFybmVzcywgbWFrZUNoYW5nZSwgbWFrZVNlc3Npb24sIFRlc3RTdHViRWRpdG9ySW5wdXQgfSBmcm9tICcuL2xheW91dENvbnRyb2xsZXJUZXN0VXRpbHMuanMnO1xuXG5zdWl0ZSgnTGF5b3V0Q29udHJvbGxlciAoZGVza3RvcCknLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBoYXJuZXNzOiBJVGVzdExheW91dEhhcm5lc3M7XG5cblx0Y2xhc3MgVGVzdExheW91dENvbnRyb2xsZXIgZXh0ZW5kcyBMYXlvdXRDb250cm9sbGVyIHtcblx0XHRnZXRWaWV3U3RhdGUoc2Vzc2lvblJlc291cmNlOiBVUkkpIHtcblx0XHRcdHJldHVybiB0aGlzLl92aWV3U3RhdGVCeVNlc3Npb24uZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXHRcdGdldEVkaXRvclBhcnRIaWRkZW4oc2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB0aGlzLl9lZGl0b3JQYXJ0SGlkZGVuQnlTZXNzaW9uLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH1cblx0XHRydW5XaXRoUmVzdG9yZSh3b3JrOiAoKSA9PiB2b2lkIHwgUHJvbWlzZTx1bmtub3duPik6IHZvaWQge1xuXHRcdFx0dGhpcy5fd2l0aFNlc3Npb25MYXlvdXRSZXN0b3JlKHdvcmspO1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIFRlc3RTaW5nbGVQYW5lQ29udHJvbGxlciBleHRlbmRzIFNpbmdsZVBhbmVMYXlvdXRDb250cm9sbGVyIHtcblx0XHQvKiogUnVucyBgd29ya2Agd2hpbGUgYSBzZXNzaW9uLXN3aXRjaCBsYXlvdXQgcmVzdG9yZSBpcyBoZWxkIChzZWUgYF93aXRoU2Vzc2lvbkxheW91dFJlc3RvcmVgKS4gKi9cblx0XHRydW5XaXRoUmVzdG9yZSh3b3JrOiAoKSA9PiB2b2lkIHwgUHJvbWlzZTx1bmtub3duPik6IHZvaWQge1xuXHRcdFx0dGhpcy5fd2l0aFNlc3Npb25MYXlvdXRSZXN0b3JlKHdvcmspO1xuXHRcdH1cblx0XHRnZXRWaWV3U3RhdGUoc2Vzc2lvblJlc291cmNlOiBVUkkpIHtcblx0XHRcdHJldHVybiB0aGlzLl92aWV3U3RhdGVCeVNlc3Npb24uZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXHRcdGdldEVkaXRvclBhcnRIaWRkZW4oc2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB0aGlzLl9lZGl0b3JQYXJ0SGlkZGVuQnlTZXNzaW9uLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUNvbnRyb2xsZXIob3B0aW9uczogSUNyZWF0ZU9wdGlvbnMgPSB7fSk6IFRlc3RMYXlvdXRDb250cm9sbGVyIHtcblx0XHRoYXJuZXNzID0gY3JlYXRlVGVzdEhhcm5lc3Moc3RvcmUsIG9wdGlvbnMpO1xuXHRcdHJldHVybiBzdG9yZS5hZGQoaGFybmVzcy5pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdExheW91dENvbnRyb2xsZXIpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKG9wdGlvbnM6IElDcmVhdGVPcHRpb25zID0ge30pOiBUZXN0U2luZ2xlUGFuZUNvbnRyb2xsZXIge1xuXHRcdGhhcm5lc3MgPSBjcmVhdGVUZXN0SGFybmVzcyhzdG9yZSwgb3B0aW9ucyk7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChoYXJuZXNzLmluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U2luZ2xlUGFuZUNvbnRyb2xsZXIpKTtcblx0fVxuXG5cdC8qKiBBIHN0dWIgcmVhbCBmaWxlIGVkaXRvciB3aG9zZSByZXNvdXJjZSBsaXZlcyB1bmRlciB0aGUgc2Vzc2lvbidzIGAvcmVwb2Agd29ya3NwYWNlIGZvbGRlci4gKi9cblx0ZnVuY3Rpb24gbWFrZVdvcmtzcGFjZUZpbGVFZGl0b3IocGF0aDogc3RyaW5nID0gJy9yZXBvL3BhY2thZ2UuanNvbicpOiBGaWxlRWRpdG9ySW5wdXQge1xuXHRcdGNvbnN0IGZpbGVFZGl0b3IgPSBPYmplY3QuY3JlYXRlKEZpbGVFZGl0b3JJbnB1dC5wcm90b3R5cGUpIGFzIEZpbGVFZGl0b3JJbnB1dDtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZmlsZUVkaXRvciwgJ3Jlc291cmNlJywgeyB2YWx1ZTogVVJJLmZpbGUocGF0aCkgfSk7XG5cdFx0cmV0dXJuIGZpbGVFZGl0b3I7XG5cdH1cblxuXHR0ZWFyZG93bigoKSA9PiBzdG9yZS5jbGVhcigpKTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gLS0tIFtEM10gQXV4aWxpYXJ5IGJhciByZXN0b3JlIC0tLVxuXG5cdHRlc3QoJ1tEM2NdIGhpZGVzIHNpZGUgcGFuZSBmb3IgZXhpc3Rpbmcgc2Vzc2lvbiB3aXRob3V0IHNhdmVkIHN0YXRlJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IHRydWUpLFxuXHRcdFx0J3NpZGUgcGFuZSBzaG91bGQgYmUgaGlkZGVuJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0Lm9rKCFoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCksICdzaG91bGQgbm90IGF1dG8tb3BlbiB0aGUgRmlsZXMgdmlldycpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDZdIGRvZXMgbm90IGF1dG8tb3BlbiBzaWRlIHBhbmUgZm9yIGV4aXN0aW5nIHNlc3Npb24gd2l0aCBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSwge1xuXHRcdFx0Y2hhbmdlczogW21ha2VDaGFuZ2UoJy9maWxlLnRzJyldLFxuXHRcdH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdCdzaWRlIHBhbmUgc2hvdWxkIGJlIGhpZGRlbidcblx0XHQpO1xuXHRcdGFzc2VydC5vayghaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLCAnc2hvdWxkIG5vdCBhdXRvLW9wZW4gdGhlIENoYW5nZXMgdmlldycpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDNiXSBzaG93cyBmaWxlcyB2aWV3IGZvciB1bnRpdGxlZCBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEM2RdIGRlZmF1bHRzIHRvIEZpbGVzIHdoaWxlIHRoZSBzZXNzaW9uIGhhcyBubyBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRvcGVuZWRGaWxlczogaGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycy5pbmNsdWRlcyhTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQpLFxuXHRcdFx0b3BlbmVkQ2hhbmdlczogaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLFxuXHRcdH0sIHtcblx0XHRcdG9wZW5lZEZpbGVzOiB0cnVlLFxuXHRcdFx0b3BlbmVkQ2hhbmdlczogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEM2RdIGRlZmF1bHRzIHRvIENoYW5nZXMgb25jZSBvbmUgb2YgdGhlIHNlc3Npb24gY2hhdHMgaGFzIGEgY2hhbmdlJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSwge1xuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLFxuXHRcdFx0Y2hhbmdlczogW21ha2VDaGFuZ2UoJy9maWxlLnRzJyldLFxuXHRcdH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b3BlbmVkRmlsZXM6IGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHRcdG9wZW5lZENoYW5nZXM6IGhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSxcblx0XHR9LCB7XG5cdFx0XHRvcGVuZWRGaWxlczogZmFsc2UsXG5cdFx0XHRvcGVuZWRDaGFuZ2VzOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDNkXSBkb2VzIG5vdCBzd2l0Y2ggYSBzaWRlIHBhbmUgdGhhdCBpcyBhbHJlYWR5IHNob3dpbmcgRmlsZXMgd2hlbiBhIGNoYW5nZSBsYW5kcycsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVBhbmVDb21wb3NpdGVJZCA9IFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRDtcblxuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzID0gW107XG5cdFx0KHNlc3Npb24uY2hhbmdlcyBhcyBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPikuc2V0KFttYWtlQ2hhbmdlKCcvZmlsZS50cycpXSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b3BlbmVkRmlsZXM6IGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHRcdG9wZW5lZENoYW5nZXM6IGhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSxcblx0XHR9LCB7XG5cdFx0XHRvcGVuZWRGaWxlczogZmFsc2UsXG5cdFx0XHRvcGVuZWRDaGFuZ2VzOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW0QzZF0gZG9lcyBub3QgZm9yY2Utb3BlbiBGaWxlcyB3aGVuIHRoZSBGaWxlcyBwYW5lIGlzIGhpZGRlbicsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Ly8gVXNlciBoYXMgaGlkZGVuIC8gdW5waW5uZWQgdGhlIEZpbGVzIHBhbmUuXG5cdFx0aGFybmVzcy5waW5uZWRBdXhpbGlhcnlCYXJDb250YWluZXJJZHMgPSBbQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRF07XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIH0pO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0IWhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHRcdCdzaG91bGQgbm90IG9wZW4gdGhlIGhpZGRlbiBGaWxlcyBwYW5lJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0aGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLFxuXHRcdFx0J3Nob3VsZCBmYWxsIGJhY2sgdG8gQ2hhbmdlcyB3aGVuIEZpbGVzIGlzIGhpZGRlbidcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDNhXSBkb2VzIG5vdCBvcGVuIHZpZXdzIHdoZW4gc2Vzc2lvbiBoYXMgbm8gd29ya3NwYWNlJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSwge1xuXHRcdFx0d29ya3NwYWNlOiB7IHVyaTogVVJJLmZpbGUoJy9yZXBvJyksIGxhYmVsOiAndGVzdCcsIGljb246IENvZGljb24ucmVwbywgZm9sZGVyczogW10sIHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLCBpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlIH0sXG5cdFx0fSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCkpO1xuXHRcdGFzc2VydC5vayghaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpKTtcblx0fSk7XG5cblx0Ly8gLS0tIFtEMV0gQ2FwdHVyZSAvIHJlc3RvcmUgb24gc3dpdGNoIC0tLVxuXG5cdHRlc3QoJ1tEMV0gcmVtZW1iZXJzIGF1eCBiYXIgaGlkZGVuIHN0YXRlIG9uIHNlc3Npb24gc3dpdGNoJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uMSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGNvbnN0IHNlc3Npb24yID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjInKSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24xLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24yLCB1bmRlZmluZWQpO1xuXG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24xLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IHRydWUpLFxuXHRcdFx0J2F1eCBiYXIgc2hvdWxkIGJlIGhpZGRlbiB3aGVuIHJldHVybmluZyB0byBzZXNzaW9uIDEnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0QxXSByZW1lbWJlcnMgYWN0aXZlIHZpZXcgY29udGFpbmVyIG9uIHNlc3Npb24gc3dpdGNoJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uMSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGNvbnN0IHNlc3Npb24yID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjInKSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24xLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MuYWN0aXZlUGFuZUNvbXBvc2l0ZUlkID0gJ3NvbWUuY3VzdG9tLnZpZXcnO1xuXHRcdGhhcm5lc3MucGlubmVkQXV4aWxpYXJ5QmFyQ29udGFpbmVySWRzID0gWy4uLmhhcm5lc3MucGlubmVkQXV4aWxpYXJ5QmFyQ29udGFpbmVySWRzLCAnc29tZS5jdXN0b20udmlldyddO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24yLCB1bmRlZmluZWQpO1xuXG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjEsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKCdzb21lLmN1c3RvbS52aWV3JyksXG5cdFx0XHQnc2hvdWxkIHJlc3RvcmUgYWN0aXZlIHZpZXcgY29udGFpbmVyIHdoZW4gcmV0dXJuaW5nIHRvIHNlc3Npb24gMSdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDNjXSByZXN0b3JlcyBhbiBleHBsaWNpdCBGaWxlcyBjaG9pY2Ugb24gc2Vzc2lvbiBzd2l0Y2ggZXZlbiB3aGVuIHRoZSBzZXNzaW9uIGhhcyBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uMSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyksIHsgY2hhbmdlczogW21ha2VDaGFuZ2UoJy9maWxlLnRzJyldIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24yID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjInKSk7XG5cblx0XHQvLyBUaGUgdXNlciBleHBsaWNpdGx5IG9wZW5zIHRoZSAocGlubmVkKSBGaWxlcyBwYW5lIGZvciBzZXNzaW9uIDEuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMSwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVBhbmVDb21wb3NpdGVJZCA9IFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRDtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjIsIHVuZGVmaW5lZCk7XG5cblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3cyA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjEsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCksXG5cdFx0XHQnc2hvdWxkIHJlc3RvcmUgdGhlIHVzZXJcXCdzIGV4cGxpY2l0IEZpbGVzIGNob2ljZSdcblx0XHQpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdCFoYXJuZXNzLm9wZW5lZFZpZXdzLmluY2x1ZGVzKENIQU5HRVNfVklFV19JRCksXG5cdFx0XHQnc2hvdWxkIG5vdCBvdmVycmlkZSB0aGUgZXhwbGljaXQgRmlsZXMgY2hvaWNlIHdpdGggQ2hhbmdlcydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDNjL3NpbmdsZS1wYW5lXSByZXN0b3JlcyBhdXgtYmFyIGhpZGRlbiBzdGF0ZSBldmVuIHdoZW4gZXh0ZXJuYWwgcmV2ZWFsIGZpcmVzIGR1cmluZyB3b3JraW5nLXNldCBhcHBseScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTY2VuYXJpbyA0OiBTZXNzaW9uIEEgKGNyZWF0ZWQpIGhhcyBkZXRhaWwgY2xvc2VkIChhdXgtYmFyIGhpZGRlbiwgZWRpdG9yIHZpc2libGUpLlxuXHRcdC8vIFNlc3Npb24gQiAoY3JlYXRlZCkgaGFzIGJvdGggdmlzaWJsZS4gU3dpdGNoIEEtPkIsIHRoZW4gQi0+QS4gRXh0ZXJuYWwgY29tcG9uZW50XG5cdFx0Ly8gKHRoZSBzaW5nbGUtcGFuZSBkZXRhaWwgcGFuZWwpIHJldmVhbHMgYXV4LWJhciBkdXJpbmcgd29ya2luZy1zZXQgcmVzdG9yZS4gQSdzXG5cdFx0Ly8gaGlkZGVuIHN0YXRlIG11c3Qgc3RpbGwgYmUgcmVzdG9yZWQuXG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uQSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjphJykpO1xuXHRcdGNvbnN0IHNlc3Npb25CID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmInKSk7XG5cblx0XHQvLyBTZXNzaW9uIEEgYWN0aXZlLCB1c2VyIGhpZGVzIHRoZSBkZXRhaWwgcGFuZWwgKGF1eC1iYXIpIHdoaWxlIGVkaXRvciBpcyBvcGVuLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbkEsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy52aXNpYmxlU2Vzc2lvbnNPYnMuc2V0KFtzZXNzaW9uQV0sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXG5cdFx0Ly8gU3dpdGNoIHRvIHNlc3Npb24gQiAoYm90aCBlZGl0b3IgYW5kIGF1eC1iYXIgdmlzaWJsZSkuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uQiwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnZpc2libGVTZXNzaW9uc09icy5zZXQoW3Nlc3Npb25CXSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cblx0XHQvLyBTaW11bGF0ZSB0aGUgc2luZ2xlLXBhbmUgZGV0YWlsIHBhbmVsIHJldmVhbGluZyB0aGUgYXV4LWJhciBkdXJpbmdcblx0XHQvLyB3b3JraW5nLXNldCByZXN0b3JlICh3aGlsZSBfaXNSZXN0b3JpbmdTZXNzaW9uTGF5b3V0IGlzIHRydWUpLlxuXHRcdGhhcm5lc3Mub25BcHBseVdvcmtpbmdTZXQgPSAoKSA9PiB7XG5cdFx0XHRpZiAoIWhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSkge1xuXHRcdFx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0XHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gU3dpdGNoIGJhY2sgdG8gc2Vzc2lvbiBBLlxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uQSwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnZpc2libGVTZXNzaW9uc09icy5zZXQoW3Nlc3Npb25BXSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gQ2xlYW4gdXAgaG9vay5cblx0XHRoYXJuZXNzLm9uQXBwbHlXb3JraW5nU2V0ID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gVGhlIGF1eC1iYXIgc2hvdWxkIGJlIGhpZGRlbiB0byBtYXRjaCBzZXNzaW9uIEEncyBzYXZlZCBzdGF0ZS4gVGhlIGV4dGVybmFsXG5cdFx0Ly8gcmV2ZWFsIGR1cmluZyB3b3JraW5nLXNldCBhcHBseSBtdXN0IE5PVCBvdmVyd3JpdGUgdGhlIHBlci1zZXNzaW9uIHN0YXRlLlxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdCdhdXgtYmFyIHNob3VsZCBiZSBoaWRkZW4gd2hlbiByZXR1cm5pbmcgdG8gc2Vzc2lvbiBBIChkZXRhaWwtY2xvc2VkIHN0YXRlKSdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbc2luZ2xlLXBhbmVdIHJlc3RvcmVzIHRoZSBkZXRhaWwgcGFuZWwgYWZ0ZXIgYSBicm93c2VyIHRhYiBoaWRlcyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgaGFzRG9ja2VkRGV0YWlscyA9ICgpID0+IGhhcm5lc3MuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKEhhc0RvY2tlZERldGFpbHNDb250ZXh0LmtleSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRG9ja2VkRGV0YWlscygpLCBmYWxzZSwgJ2hpZGRlbiB0YXJnZXQgc2hvdWxkIGNsZWFyIHRoZSBlZGl0b3IgY2hldnJvbiBjb250ZXh0Jyk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNEb2NrZWREZXRhaWxzKCksIHRydWUsICdjaGFuZ2VzIHRhcmdldCBzaG91bGQgZW5hYmxlIHRoZSBlZGl0b3IgY2hldnJvbiBjb250ZXh0Jyk7XG5cblx0XHRjb25zdCBicm93c2VyRWRpdG9yID0gT2JqZWN0LmNyZWF0ZShCcm93c2VyRWRpdG9ySW5wdXQucHJvdG90eXBlKSBhcyBCcm93c2VyRWRpdG9ySW5wdXQ7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGJyb3dzZXJFZGl0b3IsICdyZXNvdXJjZScsIHsgdmFsdWU6IFVSSS5wYXJzZSgnYnJvd3NlcjovL3Rlc3QnKSB9KTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBicm93c2VyRWRpdG9yO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNEb2NrZWREZXRhaWxzKCksIGZhbHNlLCAnYnJvd3NlciB0YXJnZXQgc2hvdWxkIGNsZWFyIHRoZSBlZGl0b3IgY2hldnJvbiBjb250ZXh0Jyk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdCdicm93c2VyIHRhYnMgc2hvdWxkIGhpZGUgdGhlIGRldGFpbCBwYW5lbCdcblx0XHQpO1xuXG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzID0gW107XG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dCA9IHN0b3JlLmFkZChuZXcgRW1wdHlGaWxlRWRpdG9ySW5wdXQoKSk7XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0RvY2tlZERldGFpbHMoKSwgdHJ1ZSwgJ2ZpbGVzIHRhcmdldCBzaG91bGQgZW5hYmxlIHRoZSBlZGl0b3IgY2hldnJvbiBjb250ZXh0Jyk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSBmYWxzZSksXG5cdFx0XHQnZmlsZSB0YWJzIHNob3VsZCByZXN0b3JlIHRoZSBkZXRhaWwgcGFuZWwgYWZ0ZXIgYnJvd3NlciBoaWRlcyBpdCdcblx0XHQpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHRcdCdmaWxlIHRhYnMgc2hvdWxkIHJlb3BlbiB0aGUgRmlsZXMgY29udGFpbmVyIGFmdGVyIGJyb3dzZXIgaGlkZXMgaXQnXG5cdFx0KTtcblxuXHRcdC8vIEEgc2VhcmNoIHRhYiAoYW55IG5vbi1jaGFuZ2VzL25vbi1maWxlIGVkaXRvcikgaGFzIG5vIGRldGFpbCBwYW5lbCwgc29cblx0XHQvLyB0aGUgY2hldnJvbiBjb250ZXh0IG11c3QgY2xlYXIganVzdCBsaWtlIHRoZSBicm93c2VyIHRhYiBkb2VzLlxuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdzZWFyY2gtZWRpdG9yOi8vdGVzdCcpKSk7XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0RvY2tlZERldGFpbHMoKSwgZmFsc2UsICdzZWFyY2ggdGFyZ2V0IHNob3VsZCBjbGVhciB0aGUgZWRpdG9yIGNoZXZyb24gY29udGV4dCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdbc2luZ2xlLXBhbmVdIGhpZGVzIHRoZSBkZXRhaWwgcGFuZWwgd2hlbiB0aGUgbWFpbiBlZGl0b3IgcGFydCBpcyBlbXB0eSBhbmQga2VlcHMgaXQgY2xvc2VkIG9uIHRhYiBvcGVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBoYXNEb2NrZWREZXRhaWxzID0gKCkgPT4gaGFybmVzcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoSGFzRG9ja2VkRGV0YWlsc0NvbnRleHQua2V5KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRG9ja2VkRGV0YWlscygpLCB0cnVlLCAnbm9uLWVtcHR5IG5vLWFjdGl2ZS1lZGl0b3IgZmFsbGJhY2sgc2hvdWxkIGtlZXAgY29udGV4dHVhbCBkZXRhaWwgYWN0aXZlJyk7XG5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0aGFybmVzcy5lZGl0b3JHcm91cHNIYXZlQ29udGVudCA9IGZhbHNlO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSB1bmRlZmluZWQ7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhhc0RvY2tlZERldGFpbHM6IGhhc0RvY2tlZERldGFpbHMoKSxcblx0XHRcdGhpZGRlbkNhbGxzOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKS5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0aGFzRG9ja2VkRGV0YWlsczogZmFsc2UsXG5cdFx0XHRoaWRkZW5DYWxsczogMSxcblx0XHR9KTtcblxuXHRcdC8vIEEgcmVhbCBmaWxlIHRhYiByZS1vcGVuczogdGhlIGNvbnRleHQga2V5IGZsaXBzIGJhY2sgb24sIGJ1dCB0aGUgZGV0YWlsIGlzXG5cdFx0Ly8gTk9UIGZvcmNlLXJldmVhbGVkIChhIGNyZWF0ZWQgc2Vzc2lvbiBkZWZhdWx0cyB0byB0aGUgZWRpdG9yIHdpdGggdGhlIGRldGFpbCBjbG9zZWQpLlxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3MuZWRpdG9yR3JvdXBzSGF2ZUNvbnRlbnQgPSB0cnVlO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBtYWtlV29ya3NwYWNlRmlsZUVkaXRvcigpO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNEb2NrZWREZXRhaWxzOiBoYXNEb2NrZWREZXRhaWxzKCksXG5cdFx0XHRyZXZlYWxzOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSBmYWxzZSkubGVuZ3RoLFxuXHRcdFx0b3BlbmVkRmlsZXM6IGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHR9LCB7XG5cdFx0XHRoYXNEb2NrZWREZXRhaWxzOiB0cnVlLFxuXHRcdFx0cmV2ZWFsczogMCxcblx0XHRcdG9wZW5lZEZpbGVzOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW2NtZCtuXSBrZWVwcyB0aGUgZGV0YWlsIHBhbmVsIHZpc2libGUgZm9yIGEgbmV3LXNlc3Npb24gdmlldyB3aXRoIGEgdHJhbnNpZW50bHkgZW1wdHkgZWRpdG9yIGdyb3VwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246dW50aXRsZWQnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0Ly8gVGhlIEZpbGVzIHRhYiBpcyBiZWluZyAocmUpZW5zdXJlZCwgc28gdGhlIGVkaXRvciBncm91cCBpcyB0cmFuc2llbnRseSBlbXB0eS5cblx0XHRoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50ID0gZmFsc2U7XG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dCA9IHVuZGVmaW5lZDtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdC8vIFRoZSBkZXRhaWwgbXVzdCBOT1QgYmUgaGlkZGVuIGZvciB0aGUgbmV3LXNlc3Npb24gdmlldyAodW5saWtlIGEgY3JlYXRlZFxuXHRcdC8vIHNlc3Npb24sIHdoZXJlIGFuIGVtcHR5IGdyb3VwIG1lYW5zIHRoZSB3aG9sZSBzaWRlIHBhbmUgd2FzIGNsb3NlZCkuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSkubGVuZ3RoLFxuXHRcdFx0MCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0ga2VlcHMgdGhlIGRldGFpbCBwYW5lbCBjbG9zZWQgYnkgZGVmYXVsdCB3aGVuIGEgZmlsZS9jaGFuZ2VzIGVkaXRvciBpcyBhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gRGV0YWlsIGNsb3NlZCAodGhlIGNyZWF0ZWQtc2Vzc2lvbiBkZWZhdWx0LCBub3QgYSBicm93c2VyLXRhYiBoaWRlKS5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdC8vIEEgZmlsZSB0YWIgYmVjb21lcyBhY3RpdmU6IHRoZSBkZXRhaWwgbXVzdCBzdGF5IGNsb3NlZCAobm8gZm9yY2UtcmV2ZWFsKS5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gbWFrZVdvcmtzcGFjZUZpbGVFZGl0b3IoKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXZlYWxzOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSBmYWxzZSkubGVuZ3RoLFxuXHRcdFx0b3BlbmVkRmlsZXM6IGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHR9LCB7XG5cdFx0XHRyZXZlYWxzOiAwLFxuXHRcdFx0b3BlbmVkRmlsZXM6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbc2luZ2xlLXBhbmVdIHJldmVhbHMgdGhlIEZpbGVzIGRldGFpbCB3aGVuIHRoZSBlbXB0eSBGaWxlcyBwbGFjZWhvbGRlciBiZWNvbWVzIGFjdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gRGV0YWlsIGNsb3NlZCAodGhlIGNyZWF0ZWQtc2Vzc2lvbiBkZWZhdWx0KSB3aXRoIHRoZSBlZGl0b3IgdmlzaWJsZS5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHQvLyBUaGUgdXNlciBvcGVucyB0aGUgRmlsZXMgcGxhY2Vob2xkZXIgKGl0IGJlY29tZXMgdGhlIGFjdGl2ZSBlZGl0b3IpOiB0aGVcblx0XHQvLyBGaWxlcyBkZXRhaWwgaXMgcmV2ZWFsZWQgYW5kIHRoZSBGaWxlcyBjb250YWluZXIgaXMgb3BlbmVkLlxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBzdG9yZS5hZGQobmV3IEVtcHR5RmlsZUVkaXRvcklucHV0KCkpO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJldmVhbHM6IGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IGZhbHNlKS5sZW5ndGggPiAwLFxuXHRcdFx0b3BlbmVkRmlsZXM6IGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHR9LCB7XG5cdFx0XHRyZXZlYWxzOiB0cnVlLFxuXHRcdFx0b3BlbmVkRmlsZXM6IHRydWUsXG5cdFx0fSk7XG5cblx0XHQvLyBUaGUgdXNlciBoaWRlcyB0aGUgZGV0YWlsOiBpdCBtdXN0IE5PVCBiZSByZS1yZXZlYWxlZCB3aGlsZSB0aGVcblx0XHQvLyBwbGFjZWhvbGRlciBzdGF5cyBhY3RpdmUgKHRoZSByZXZlYWwgaXMga2V5ZWQgb24gdGhlIGFjdGl2ZS1lZGl0b3IgY2hhbmdlKS5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gZmFsc2UpLmxlbmd0aCxcblx0XHRcdDAsXG5cdFx0XHQnaGlkaW5nIHRoZSBkZXRhaWwgd2hpbGUgdGhlIHBsYWNlaG9sZGVyIGlzIGFjdGl2ZSBtdXN0IHN0aWNrJyk7XG5cblx0XHQvLyBBIHNlc3Npb24tc3dpdGNoIHJlc3RvcmUgdGhhdCBtYWtlcyB0aGUgcGxhY2Vob2xkZXIgYWN0aXZlIG11c3Qgbm90IHJldmVhbC5cblx0XHRsZXQgcmVsZWFzZVJlc3RvcmUhOiAoKSA9PiB2b2lkO1xuXHRcdGNvbnN0IHJlc3RvcmVHYXRlID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7IHJlbGVhc2VSZXN0b3JlID0gcmVzb2x2ZTsgfSk7XG5cdFx0Y29udHJvbGxlci5ydW5XaXRoUmVzdG9yZSgoKSA9PiByZXN0b3JlR2F0ZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gc3RvcmUuYWRkKG5ldyBFbXB0eUZpbGVFZGl0b3JJbnB1dCgpKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRyZWxlYXNlUmVzdG9yZSgpO1xuXHRcdGF3YWl0IHJlc3RvcmVHYXRlO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSBmYWxzZSkubGVuZ3RoLFxuXHRcdFx0MCxcblx0XHRcdCdhIHJlc3RvcmUtZHJpdmVuIHBsYWNlaG9sZGVyIGFjdGl2YXRpb24gbXVzdCBub3QgcmV2ZWFsIHRoZSBkZXRhaWwnKTtcblx0fSk7XG5cblx0dGVzdCgnW3Blci1zZXNzaW9uIGRldGFpbF0gZG9lcyBub3QgZm9yY2UtcmV2ZWFsIHRoZSBkZXRhaWwgb24gZWRpdG9yIGFjdGl2YXRpb24sIGR1cmluZyBvciBhZnRlciBhIHJlc3RvcmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdC8vIFNlc3Npb24ncyBkZXRhaWwgaXMgY2xvc2VkICh0aGUgY3JlYXRlZC1zZXNzaW9uIGRlZmF1bHQpIHdpdGggaXRzIGVkaXRvciB2aXNpYmxlLlxuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9KTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdC8vIEhvbGQgYSBzZXNzaW9uLXN3aXRjaCByZXN0b3JlIG9wZW4uIFRoZSByZXN0b3JlIG1ha2VzIGEgZmlsZSBlZGl0b3Jcblx0XHQvLyBhY3RpdmU7IHRoYXQgZWRpdG9yIGNoYW5nZSBtdXN0IE5PVCByZXZlYWwgdGhlIGRldGFpbC5cblx0XHRsZXQgcmVsZWFzZVJlc3RvcmUhOiAoKSA9PiB2b2lkO1xuXHRcdGNvbnN0IHJlc3RvcmVHYXRlID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7IHJlbGVhc2VSZXN0b3JlID0gcmVzb2x2ZTsgfSk7XG5cdFx0Y29udHJvbGxlci5ydW5XaXRoUmVzdG9yZSgoKSA9PiByZXN0b3JlR2F0ZSk7XG5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gbWFrZVdvcmtzcGFjZUZpbGVFZGl0b3IoKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gZmFsc2UpLmxlbmd0aCxcblx0XHRcdDAsXG5cdFx0XHQndGhlIGRldGFpbCBtdXN0IHN0YXkgY2xvc2VkIGR1cmluZyBhIHNlc3Npb24tc3dpdGNoIHJlc3RvcmUnKTtcblxuXHRcdC8vIEFmdGVyIHRoZSByZXN0b3JlIGVuZHMsIGEgcGxhaW4gZWRpdG9yIGFjdGl2YXRpb24gc3RpbGwgZG9lcyBub3QgcmV2ZWFsXG5cdFx0Ly8gdGhlIGRldGFpbCAoYSBjcmVhdGVkIHNlc3Npb24gZGVmYXVsdHMgdG8gdGhlIGVkaXRvciB3aXRoIHRoZSBkZXRhaWwgY2xvc2VkKS5cblx0XHRyZWxlYXNlUmVzdG9yZSgpO1xuXHRcdGF3YWl0IHJlc3RvcmVHYXRlO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBtYWtlV29ya3NwYWNlRmlsZUVkaXRvcigpO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSBmYWxzZSkubGVuZ3RoLFxuXHRcdFx0MCxcblx0XHRcdCd0aGUgZGV0YWlsIHN0YXlzIGNsb3NlZCBieSBkZWZhdWx0IGFmdGVyIHRoZSByZXN0b3JlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tTY2VuYXJpbyBDXSBkb2VzIG5vdCByZS1yZXZlYWwgdGhlIGRldGFpbCBvbiByZWxvYWQgd2hlbiB0aGUgd2hvbGUgc2lkZSBwYW5lIHdhcyBjbG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gV2hvbGUgc2lkZSBwYW5lIGNsb3NlZCAoYXMgcGVyc2lzdGVkIGFjcm9zcyBhIHJlbG9hZCk6IGJvdGggdGhlIGVkaXRvclxuXHRcdC8vIGNvbnRlbnQgYW5kIHRoZSBkZXRhaWwgYXJlIGhpZGRlbi5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9KTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMgPSBbXTtcblxuXHRcdC8vIFRoZSByZXN0b3JlZCBtYW5hZ2VkIHRhYiBiZWNvbWVzIGFjdGl2ZTsgdGhlIGRldGFpbCBtdXN0IE5PVCByZS1yZXZlYWwuXG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dCA9IHN0b3JlLmFkZChuZXcgRW1wdHlGaWxlRWRpdG9ySW5wdXQoKSk7XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IGZhbHNlKS5sZW5ndGgsXG5cdFx0XHQwKTtcblx0fSk7XG5cblx0dGVzdCgnW3Blci1zZXNzaW9uIGRldGFpbF0ga2VlcHMgdGhlIHdob2xlIHNpZGUgcGFuZSBjbG9zZWQgd2hlbiByZXR1cm5pbmcgdG8gYSBzZXNzaW9uIHRoYXQgaGFkIGl0IGNsb3NlZCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTZXNzaW9uIEEgaGFkIHRoZSB3aG9sZSBzaWRlIHBhbmUgY2xvc2VkIChlZGl0b3IgKyBkZXRhaWwgaGlkZGVuKS4gU3dpdGNoXG5cdFx0Ly8gdG8gc2Vzc2lvbiBCIChzaWRlIHBhbmUgb3BlbiksIHRoZW4gYmFjayB0byBBLiBUaGUgZGV0YWlsIHBhbmVsIG11c3Qgbm90XG5cdFx0Ly8gcmUtcmV2ZWFsIEEncyBhdXggYmFyOiByZXR1cm5pbmcgdG8gQSBtdXN0IHJlc3RvcmUgaXRzIGNsb3NlZCBzaWRlIHBhbmUuXG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSwgcmV2ZWFsQXV4aWxpYXJ5QmFyT25PcGVuOiB0cnVlLCB3b3Jrc3BhY2VGb2xkZXJzOiBbeyB1cmk6IFVSSS5maWxlKCcvcmVwbycpIH1dIH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkEgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246YScpKTtcblx0XHRjb25zdCBzZXNzaW9uQiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpiJykpO1xuXG5cdFx0Ly8gU2Vzc2lvbiBBIGFjdGl2ZSB3aXRoIHRoZSB3aG9sZSBzaWRlIHBhbmUgY2xvc2VkLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbkEsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy52aXNpYmxlU2Vzc2lvbnNPYnMuc2V0KFtzZXNzaW9uQV0sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHQvLyBTd2l0Y2ggdG8gc2Vzc2lvbiBCIChzaWRlIHBhbmUgb3BlbikuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uQiwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnZpc2libGVTZXNzaW9uc09icy5zZXQoW3Nlc3Npb25CXSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gU3dpdGNoIGJhY2sgdG8gQS4gVGhlIHJlc3RvcmUgbWFrZXMgQSdzIG1hbmFnZWQgZmlsZSBlZGl0b3IgYWN0aXZlIHdoaWxlXG5cdFx0Ly8gQidzIGF1eCBiYXIgaXMgc3RpbGwgdmlzaWJsZSAodGhlIGRldGFpbCBhdXRvcnVuIGNhcHR1cmVzIGl0IGFzIHZpc2libGUpLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbkEsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy52aXNpYmxlU2Vzc2lvbnNPYnMuc2V0KFtzZXNzaW9uQV0sIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dCA9IHN0b3JlLmFkZChuZXcgRW1wdHlGaWxlRWRpdG9ySW5wdXQoKSk7XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YXV4OiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0XHRlZGl0b3I6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHR9LCB7XG5cdFx0XHRhdXg6IGZhbHNlLFxuXHRcdFx0ZWRpdG9yOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW3Blci1zZXNzaW9uIGRldGFpbF0gcmVzdG9yZXMgZGV0YWlsIHZpc2liaWxpdHkgb24gc2Vzc2lvbiBzd2l0Y2ggZGVzcGl0ZSBhIHN0YWxlIHF1ZXVlZCBkZXRhaWwgc3luYycsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlLCByZXZlYWxBdXhpbGlhcnlCYXJPbk9wZW46IHRydWUsIHdvcmtzcGFjZUZvbGRlcnM6IFt7IHVyaTogVVJJLmZpbGUoJy9yZXBvJykgfV0gfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBzZXNzaW9uQSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjphJykpO1xuXHRcdGNvbnN0IHNlc3Npb25CID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmInKSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb25BLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MudmlzaWJsZVNlc3Npb25zT2JzLnNldChbc2Vzc2lvbkFdLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb25CLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MudmlzaWJsZVNlc3Npb25zT2JzLnNldChbc2Vzc2lvbkJdLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dCA9IG1ha2VXb3Jrc3BhY2VGaWxlRWRpdG9yKCk7XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uQSwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnZpc2libGVTZXNzaW9uc09icy5zZXQoW3Nlc3Npb25BXSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSwgZmFsc2UsXG5cdFx0XHQnc2Vzc2lvbiBBIGRldGFpbC1oaWRkZW4gc3RhdGUgbXVzdCB3aW4gb3ZlciBhbnkgcXVldWVkIGRldGFpbC1jb250YWluZXIgc3luYycpO1xuXHR9KTtcblxuXHR0ZXN0KCdbcGVyLXNlc3Npb24gZGV0YWlsXSBwZXJzaXN0cyBkZXRhaWwgdmlzaWJpbGl0eSBhbmQgcmVzdG9yZXMgaXQgYWZ0ZXIgcmVsb2FkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBjb250cm9sbGVyID0gY3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9KTtcblx0XHRoYXJuZXNzLnN0b3JhZ2VTZXJ2aWNlLmZsdXNoKFdpbGxTYXZlU3RhdGVSZWFzb24uU0hVVERPV04pO1xuXHRcdGNvbnN0IHBlcnNpc3RlZCA9IEpTT04ucGFyc2UoaGFybmVzcy5zdG9yYWdlU2VydmljZS5nZXQoJ3Nlc3Npb25zLnNpbmdsZVBhbmUubGF5b3V0U3RhdGUnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSA/PyAnW10nKSBhcyB7IHNlc3Npb25SZXNvdXJjZTogc3RyaW5nOyB2aWV3U3RhdGU/OiB7IGF1eGlsaWFyeUJhclZpc2libGU6IGJvb2xlYW4gfSB9W107XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwZXJzaXN0ZWQubWFwKGVudHJ5ID0+ICh7IHNlc3Npb25SZXNvdXJjZTogZW50cnkuc2Vzc2lvblJlc291cmNlLCBhdXhpbGlhcnlCYXJWaXNpYmxlOiBlbnRyeS52aWV3U3RhdGU/LmF1eGlsaWFyeUJhclZpc2libGUgfSkpLFxuXHRcdFx0W3sgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksIGF1eGlsaWFyeUJhclZpc2libGU6IGZhbHNlIH1dKTtcblxuXHRcdHN0b3JlLmNsZWFyKCk7XG5cblx0XHRjb250cm9sbGVyID0gY3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoe1xuXHRcdFx0YWN0aXZhdGVBdXg6IHRydWUsXG5cdFx0XHRyZXZlYWxBdXhpbGlhcnlCYXJPbk9wZW46IHRydWUsXG5cdFx0XHRpbml0aWFsUGFydFZpc2liaWxpdHk6IG5ldyBNYXAoW1tQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZV0sIFtQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZV1dKSxcblx0XHRcdGxheW91dFN0YXRlOiBwZXJzaXN0ZWQsXG5cdFx0fSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF1eFZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHRcdHZpZXdTdGF0ZTogY29udHJvbGxlci5nZXRWaWV3U3RhdGUoc2Vzc2lvbi5yZXNvdXJjZSk/LmF1eGlsaWFyeUJhclZpc2libGUsXG5cdFx0fSwge1xuXHRcdFx0YXV4VmlzaWJsZTogZmFsc2UsXG5cdFx0XHR2aWV3U3RhdGU6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbQjJdIGNhcHR1cmVzIGVkaXRvci1wYXJ0IGhpZGRlbiBzdGF0ZSBlYWdlcmx5IHdoZW4gdGhlIHVzZXIgY2xvc2VzIHRoZSBzaWRlIHBhbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gVXNlciBjbG9zZXMgdGhlIHNpZGUgcGFuZSAoZWRpdG9yIHBhcnQgaGlkZGVuKSB3aGlsZSBvbiB0aGUgc2Vzc2lvbi5cblx0XHRzZXRQYXJ0VmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuZ2V0RWRpdG9yUGFydEhpZGRlbihzZXNzaW9uLnJlc291cmNlKSwgdHJ1ZSxcblx0XHRcdCdlZGl0b3ItcGFydCBoaWRkZW4gbXVzdCBiZSBjYXB0dXJlZCBhdCB0aGUgbW9tZW50IHRoZSB1c2VyIGNsb3NlcyBpdCcpO1xuXG5cdFx0Ly8gVXNlciByZW9wZW5zIGl0LlxuXHRcdHNldFBhcnRWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5nZXRFZGl0b3JQYXJ0SGlkZGVuKHNlc3Npb24ucmVzb3VyY2UpLCBmYWxzZSxcblx0XHRcdCdlZGl0b3ItcGFydCBoaWRkZW4gbXVzdCB1cGRhdGUgd2hlbiB0aGUgdXNlciByZW9wZW5zIGl0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tCMl0gYSBsYXRlciB0cmFuc2llbnQgZWRpdG9yIHJldmVhbCBkb2VzIG5vdCBvdmVyd3JpdGUgYSBzZXNzaW9uXFwncyBjYXB0dXJlZCBjbG9zZWQgc3RhdGUgZHVyaW5nIGEgc3dpdGNoJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkEgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246YScpKTtcblx0XHRjb25zdCBzZXNzaW9uQiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpiJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbkEsIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBBOiB1c2VyIGNsb3NlcyB0aGUgZWRpdG9yIHBhcnQgLT4gY2FwdHVyZWQgaGlkZGVuLlxuXHRcdHNldFBhcnRWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuZ2V0RWRpdG9yUGFydEhpZGRlbihzZXNzaW9uQS5yZXNvdXJjZSksIHRydWUpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgdGhlIHN3aXRjaC10aW1lIHJhY2U6IHdoaWxlIHN3aXRjaGluZyB0byBCIHRoZSBlZGl0b3IgcGFydCBpc1xuXHRcdC8vIHJldmVhbGVkIGJ5IEIncyBsYXlvdXQgcmVzdG9yZSAodGhlIGNhcHR1cmUgbGlzdGVuZXIgaWdub3JlcyBjaGFuZ2VzXG5cdFx0Ly8gZHVyaW5nIGEgcmVzdG9yZSkuIEEncyBjYXB0dXJlZCBjbG9zZWQgc3RhdGUgbXVzdCBiZSBwcmVzZXJ2ZWQuXG5cdFx0Y29udHJvbGxlci5ydW5XaXRoUmVzdG9yZSgoKSA9PiB7XG5cdFx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb25CLCB1bmRlZmluZWQpO1xuXHRcdFx0c2V0UGFydFZpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuZ2V0RWRpdG9yUGFydEhpZGRlbihzZXNzaW9uQS5yZXNvdXJjZSksIHRydWUsXG5cdFx0XHQnYSByZXN0b3JlLWRyaXZlbiBlZGl0b3IgcmV2ZWFsIG11c3Qgbm90IG92ZXJ3cml0ZSBzZXNzaW9uIEFcXCdzIGNhcHR1cmVkIGNsb3NlZCBzdGF0ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDRdIGtlZXBzIHRoZSBvcGVuIHNpZGUgcGFuZSBvbiBpdHMgY3VycmVudCB2aWV3IHdoZW4gYSBuZXcgc2Vzc2lvbiBpcyBzdWJtaXR0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSk7XG5cblx0XHQvLyBBdXggYmFyIGlzIG9wZW4gb24gdGhlIG5ldy1zZXNzaW9uIHZpZXcsIHNob3dpbmcgRmlsZXMuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MuYWN0aXZlUGFuZUNvbXBvc2l0ZUlkID0gU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3cyA9IFtdO1xuXHRcdChzZXNzaW9uLmlzQ3JlYXRlZCBhcyBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+KS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGlkZGVuOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSksXG5cdFx0XHRvcGVuZWRDaGFuZ2VzOiBoYXJuZXNzLm9wZW5lZFZpZXdzLmluY2x1ZGVzKENIQU5HRVNfVklFV19JRCksXG5cdFx0XHR2aWV3U3RhdGU6IGNvbnRyb2xsZXIuZ2V0Vmlld1N0YXRlKHNlc3Npb24ucmVzb3VyY2UpLFxuXHRcdH0sIHtcblx0XHRcdGhpZGRlbjogZmFsc2UsXG5cdFx0XHRvcGVuZWRDaGFuZ2VzOiBmYWxzZSxcblx0XHRcdHZpZXdTdGF0ZToge1xuXHRcdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlLFxuXHRcdFx0XHRhdXhpbGlhcnlCYXJBY3RpdmVWaWV3Q29udGFpbmVySWQ6IFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tENF0ga2VlcHMgdGhlIHNpZGUgcGFuZSBjbG9zZWQgd2hlbiBhIG5ldyBzZXNzaW9uIGlzIHN1Ym1pdHRlZCB3aXRoIHRoZSBhdXggYmFyIGhpZGRlbicsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIFVzZXIgaGlkZXMgdGhlIGF1eCBiYXIgb24gdGhlIG5ldy1zZXNzaW9uIHZpZXcuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cdFx0KHNlc3Npb24uaXNDcmVhdGVkIGFzIElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4pLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0IWhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSBmYWxzZSksXG5cdFx0XHQnc2lkZSBwYW5lIHNob3VsZCBzdGF5IGNsb3NlZCBhZnRlciB0aGUgbmV3IHNlc3Npb24gaXMgc3VibWl0dGVkJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0IWhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSxcblx0XHRcdCdDaGFuZ2VzIHZpZXcgc2hvdWxkIG5vdCBiZSBzaG93biB3aGVuIHRoZSBhdXggYmFyIGlzIGhpZGRlbidcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDRdIHNob3dzIEZpbGVzIHdoZW4gYSBoaWRkZW4gc2lkZSBwYW5lIGlzIG9wZW5lZCBhZnRlciBhIGNoYW5nZS1mcmVlIHNlc3Npb24gaXMgc3VibWl0dGVkJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXG5cdFx0KHNlc3Npb24uaXNDcmVhdGVkIGFzIElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4pLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZVBhbmVDb21wb3NpdGVJZCA9IFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRDtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRvcGVuZWRGaWxlczogaGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycy5pbmNsdWRlcyhTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQpLFxuXHRcdFx0b3BlbmVkQ2hhbmdlczogaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLFxuXHRcdH0sIHtcblx0XHRcdG9wZW5lZEZpbGVzOiB0cnVlLFxuXHRcdFx0b3BlbmVkQ2hhbmdlczogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tENF0gc2hvd3MgQ2hhbmdlcyB3aGVuIGEgaGlkZGVuIHNpZGUgcGFuZSBpcyBvcGVuZWQgYWZ0ZXIgdGhlIHNlc3Npb24gcHJvZHVjZWQgYSBjaGFuZ2UnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cblx0XHQoc2Vzc2lvbi5pc0NyZWF0ZWQgYXMgSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPikuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0KHNlc3Npb24uY2hhbmdlcyBhcyBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPikuc2V0KFttYWtlQ2hhbmdlKCcvZmlsZS50cycpXSwgdW5kZWZpbmVkKTtcblxuXHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMgPSBbXTtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cdFx0aGFybmVzcy5hY3RpdmVQYW5lQ29tcG9zaXRlSWQgPSBTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQ7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b3BlbmVkRmlsZXM6IGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHRcdG9wZW5lZENoYW5nZXM6IGhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSxcblx0XHR9LCB7XG5cdFx0XHRvcGVuZWRGaWxlczogZmFsc2UsXG5cdFx0XHRvcGVuZWRDaGFuZ2VzOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDRdIHJlY29yZHMgRmlsZXMgd2hlbiBhIGNoYW5nZS1mcmVlIHNlc3Npb24gZmFsbHMgYmFjayBmcm9tIGFuIGludmFsaWQgc2F2ZWQgY29udGFpbmVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih7XG5cdFx0XHRsYXlvdXRTdGF0ZTogW3tcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdHZpZXdTdGF0ZToge1xuXHRcdFx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGZhbHNlLFxuXHRcdFx0XHRcdGF1eGlsaWFyeUJhckFjdGl2ZVZpZXdDb250YWluZXJJZDogJ21pc3NpbmcudmlldycsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG9wZW5lZEZpbGVzOiBoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCksXG5cdFx0XHR2aWV3U3RhdGU6IGNvbnRyb2xsZXIuZ2V0Vmlld1N0YXRlKHNlc3Npb24ucmVzb3VyY2UpLFxuXHRcdH0sIHtcblx0XHRcdG9wZW5lZEZpbGVzOiB0cnVlLFxuXHRcdFx0dmlld1N0YXRlOiB7XG5cdFx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IHRydWUsXG5cdFx0XHRcdGF1eGlsaWFyeUJhckFjdGl2ZVZpZXdDb250YWluZXJJZDogU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lELFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW0Q0XSByZWNvcmRzIENoYW5nZXMgd2hlbiBhIHNlc3Npb24gd2l0aCBjaGFuZ2VzIGZhbGxzIGJhY2sgZnJvbSBhbiBpbnZhbGlkIHNhdmVkIGNvbnRhaW5lcicsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSwgeyBjaGFuZ2VzOiBbbWFrZUNoYW5nZSgnL2ZpbGUudHMnKV0gfSk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoe1xuXHRcdFx0bGF5b3V0U3RhdGU6IFt7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHR2aWV3U3RhdGU6IHtcblx0XHRcdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSxcblx0XHRcdFx0XHRhdXhpbGlhcnlCYXJBY3RpdmVWaWV3Q29udGFpbmVySWQ6ICdtaXNzaW5nLnZpZXcnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3cyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMgPSBbXTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRvcGVuZWRDaGFuZ2VzOiBoYXJuZXNzLm9wZW5lZFZpZXdzLmluY2x1ZGVzKENIQU5HRVNfVklFV19JRCksXG5cdFx0XHR2aWV3U3RhdGU6IGNvbnRyb2xsZXIuZ2V0Vmlld1N0YXRlKHNlc3Npb24ucmVzb3VyY2UpLFxuXHRcdH0sIHtcblx0XHRcdG9wZW5lZENoYW5nZXM6IHRydWUsXG5cdFx0XHR2aWV3U3RhdGU6IHtcblx0XHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSxcblx0XHRcdFx0YXV4aWxpYXJ5QmFyQWN0aXZlVmlld0NvbnRhaW5lcklkOiBDSEFOR0VTX1ZJRVdfQ09OVEFJTkVSX0lELFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW0Q0XSByZW1lbWJlcnMgRmlsZXMgd2hlbiB0aGUgdXNlciBjaG9vc2VzIGl0IGFmdGVyIHRoZSBzZXNzaW9uIGlzIHN1Ym1pdHRlZCcsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjEgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KTtcblx0XHRjb25zdCBzZXNzaW9uMiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoyJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjEsIHVuZGVmaW5lZCk7XG5cblx0XHQoc2Vzc2lvbjEuaXNDcmVhdGVkIGFzIElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4pLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MuYWN0aXZlUGFuZUNvbXBvc2l0ZUlkID0gU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMiwgdW5kZWZpbmVkKTtcblxuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzID0gW107XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b3BlbmVkRmlsZXM6IGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHRcdG9wZW5lZENoYW5nZXM6IGhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSxcblx0XHR9LCB7XG5cdFx0XHRvcGVuZWRGaWxlczogdHJ1ZSxcblx0XHRcdG9wZW5lZENoYW5nZXM6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gW0QyXSBMaXZlIHZpc2liaWxpdHkgdHJhY2tpbmcgKG5ldy1zZXNzaW9uIHNoYXJlZCBzdGF0ZSkgLS0tXG5cblx0dGVzdCgnW0QyXSByZW1lbWJlcnMgaGlkZGVuIGF1eCBiYXIgYWNyb3NzIG5ldyAodW50aXRsZWQpIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCB1bnRpdGxlZDEgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246dW50aXRsZWQxJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIH0pO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmV4aXN0aW5nJykpO1xuXHRcdGNvbnN0IHVudGl0bGVkMiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjp1bnRpdGxlZDInKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgfSk7XG5cblx0XHQvLyBPcGVuIGEgbmV3ICh1bnRpdGxlZCkgc2Vzc2lvbiBcdTIwMTQgYXV4IGJhciBzaG93cyB0aGUgRmlsZXMgdmlldy5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHVudGl0bGVkMSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2soaGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycy5pbmNsdWRlcyhTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQpKTtcblxuXHRcdC8vIFVzZXIgaGlkZXMgdGhlIGF1eCBiYXIgb24gdGhlIG5ldy1zZXNzaW9uIHZpZXcuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXG5cdFx0Ly8gU3dpdGNoIHRvIGFuIGV4aXN0aW5nIHNlc3Npb24gYW5kIGJhY2sgdG8gYSBicmFuZCBuZXcgKHVudGl0bGVkKSBzZXNzaW9uLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoZXhpc3RpbmcsIHVuZGVmaW5lZCk7XG5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHVudGl0bGVkMiwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdCdhdXggYmFyIHNob3VsZCBzdGF5IGhpZGRlbiBvbiB0aGUgbmV4dCBuZXcgc2Vzc2lvbidcblx0XHQpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdCFoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCksXG5cdFx0XHQnc2hvdWxkIG5vdCByZS1vcGVuIHRoZSBGaWxlcyB2aWV3IG9uIHRoZSBuZXh0IG5ldyBzZXNzaW9uJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEMl0gcGVyc2lzdHMgaGlkZGVuIG5ldy1zZXNzaW9uIGF1eCBiYXIgdG8gc3RvcmFnZSBhbmQgcmVzdG9yZXMgaXQgYWZ0ZXIgcmVsb2FkJywgKCkgPT4ge1xuXHRcdC8vIEZpcnN0IGxpZmV0aW1lOiB1c2VyIGhpZGVzIHRoZSBhdXggYmFyIG9uIHRoZSBuZXctc2Vzc2lvbiB2aWV3LlxuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCB1bnRpdGxlZDEgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246dW50aXRsZWQxJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQodW50aXRsZWQxLCB1bmRlZmluZWQpO1xuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdEpTT04ucGFyc2UoaGFybmVzcy5zdG9yYWdlU2VydmljZS5nZXQoJ3Nlc3Npb25zLm5ld1Nlc3Npb25WaWV3U3RhdGUnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSA/PyAnJyksXG5cdFx0XHR7IGF1eGlsaWFyeUJhclZpc2libGU6IGZhbHNlIH0sXG5cdFx0XHQnc3RhdGUgc2hvdWxkIGJlIHBlcnNpc3RlZCB0byBzdG9yYWdlJ1xuXHRcdCk7XG5cblx0XHRzdG9yZS5jbGVhcigpO1xuXG5cdFx0Ly8gU2Vjb25kIGxpZmV0aW1lIChyZWxvYWQpOiBhIGZyZXNoIGNvbnRyb2xsZXIgd2l0aCB0aGUgcGVyc2lzdGVkIHN0YXRlLlxuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoeyBuZXdTZXNzaW9uVmlld1N0YXRlOiB7IGF1eGlsaWFyeUJhclZpc2libGU6IGZhbHNlIH0gfSk7XG5cdFx0Y29uc3QgdW50aXRsZWQyID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOnVudGl0bGVkMicpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCB9KTtcblxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQodW50aXRsZWQyLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IHRydWUpLFxuXHRcdFx0J2F1eCBiYXIgc2hvdWxkIHN0YXkgaGlkZGVuIGFmdGVyIHJlbG9hZCdcblx0XHQpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdCFoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCksXG5cdFx0XHQnc2hvdWxkIG5vdCByZS1vcGVuIHRoZSBGaWxlcyB2aWV3IGFmdGVyIHJlbG9hZCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDNiXSBpZ25vcmVzIG1hbGZvcm1lZCBwZXJzaXN0ZWQgbmV3LXNlc3Npb24gc3RhdGUgYW5kIGRvZXMgbm90IGZvcmNlLWhpZGUgdGhlIGF1eCBiYXInLCAoKSA9PiB7XG5cdFx0Ly8gUGVyc2lzdGVkIG9iamVjdCBpcyBtaXNzaW5nIHRoZSBgYXV4aWxpYXJ5QmFyVmlzaWJsZWAgYm9vbGVhbi5cblx0XHRjcmVhdGVDb250cm9sbGVyKHsgbmV3U2Vzc2lvblZpZXdTdGF0ZVJhdzogSlNPTi5zdHJpbmdpZnkoeyBmb286ICdiYXInIH0pIH0pO1xuXHRcdGNvbnN0IHVudGl0bGVkID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOnVudGl0bGVkJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIH0pO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldCh1bnRpdGxlZCwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdCFoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSksXG5cdFx0XHQnbWFsZm9ybWVkIHN0YXRlIG11c3Qgbm90IGZvcmNlLWhpZGUgdGhlIGF1eCBiYXInXG5cdFx0KTtcblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCksXG5cdFx0XHQnc2hvdWxkIGZhbGwgYmFjayB0byB0aGUgZGVmYXVsdCBGaWxlcyB2aWV3J1xuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0aGFybmVzcy5zdG9yYWdlU2VydmljZS5nZXQoJ3Nlc3Npb25zLm5ld1Nlc3Npb25WaWV3U3RhdGUnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCdtYWxmb3JtZWQgc3RhdGUgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBzdG9yYWdlJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tENl0gZG9lcyBub3QgcmUtcmV2ZWFsIGF1eCBiYXIgYWZ0ZXIgdXNlciBoaWRlcyBpdCB3aGVuIHNlc3Npb24gY2hhbmdlcyBzdGF0ZSB1cGRhdGVzJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gVXNlciBoaWRlcyB0aGUgYXV4IGJhciAoU2lkZSBQYW5lbCkgd2l0aG91dCBzd2l0Y2hpbmcgc2Vzc2lvbnMuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3cyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMgPSBbXTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0Ly8gQ2hhbmdlcyBhcHBlYXIsIHdoaWNoIHJlLXRyaWdnZXJzIHRoZSBhdXggYmFyIHN5bmMgYXV0b3J1bi5cblx0XHQoc2Vzc2lvbi5jaGFuZ2VzIGFzIElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10+KS5zZXQoW21ha2VDaGFuZ2UoJy9maWxlLnRzJyldLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0IWhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSAmJiAhaGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycy5pbmNsdWRlcyhTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQpLFxuXHRcdFx0J2F1eCBiYXIgbXVzdCBzdGF5IGhpZGRlbiBhZnRlciB0aGUgdXNlciBoaWQgaXQsIGV2ZW4gd2hlbiBjaGFuZ2VzIGFwcGVhcidcblx0XHQpO1xuXHR9KTtcblxuXHQvLyAtLS0gW0Q5Yl0gQ2xvc2luZyB0aGUgd2hvbGUgc2lkZSBwYW5lIG9uIGEgbmV3ICh1bmNyZWF0ZWQpIHNlc3Npb24gLS0tXG5cblx0dGVzdCgnW0Q5Yl0gY2xvc2luZyB0aGUgd2hvbGUgc2lkZSBwYW5lIG9uIGEgbmV3IHNlc3Npb24ga2VlcHMgaXQgY2xvc2VkIGZvciB0aGUgbmV4dCBuZXcgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHVudGl0bGVkMSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjp1bnRpdGxlZDEnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgfSk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246ZXhpc3RpbmcnKSk7XG5cdFx0Y29uc3QgdW50aXRsZWQyID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOnVudGl0bGVkMicpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCB9KTtcblxuXHRcdC8vIE9wZW4gYSBuZXcgKHVudGl0bGVkKSBzZXNzaW9uIFx1MjAxNCBhdXggYmFyIHNob3dzIHRoZSBGaWxlcyB2aWV3LlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQodW50aXRsZWQxLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCkpO1xuXG5cdFx0Ly8gVXNlciBjbG9zZXMgdGhlIHdob2xlIHNpZGUgcGFuZSAoZWRpdG9yICsgYXV4IGJhcikgdmlhIHRoZSB0b2dnbGUuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRjb250cm9sbGVyLnRvZ2dsZVNpZGVQYW5lKCk7XG5cblx0XHQvLyBUaGUgY2xvc2VkIHN0YXRlIGlzIHJlY29yZGVkIGZvciB0aGUgc2hhcmVkIG5ldy1zZXNzaW9uIHZpZXcuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdEpTT04ucGFyc2UoaGFybmVzcy5zdG9yYWdlU2VydmljZS5nZXQoJ3Nlc3Npb25zLm5ld1Nlc3Npb25WaWV3U3RhdGUnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSA/PyAnJyksXG5cdFx0XHR7IGF1eGlsaWFyeUJhclZpc2libGU6IGZhbHNlIH0sXG5cdFx0XHQnY2xvc2luZyB0aGUgd2hvbGUgc2lkZSBwYW5lIG9uIGEgbmV3IHNlc3Npb24gc2hvdWxkIHJlY29yZCB0aGUgY2xvc2VkIGNob2ljZSdcblx0XHQpO1xuXG5cdFx0Ly8gU3dpdGNoIHZpYSBhbiBleGlzdGluZyBzZXNzaW9uIHRvIHRoZSBuZXh0IG5ldyAodW50aXRsZWQpIHNlc3Npb24uXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChleGlzdGluZywgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHVudGl0bGVkMiwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdCdhdXggYmFyIHNob3VsZCBzdGF5IGhpZGRlbiBvbiB0aGUgbmV4dCBuZXcgc2Vzc2lvbidcblx0XHQpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdCFoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCksXG5cdFx0XHQnc2hvdWxkIG5vdCByZS1vcGVuIHRoZSBGaWxlcyB2aWV3IG9uIHRoZSBuZXh0IG5ldyBzZXNzaW9uJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEOWJdIGNsb3NpbmcgdGhlIHdob2xlIHNpZGUgcGFuZSB3aGlsZSBjb21wb3NpbmcgYSBuZXcgc2Vzc2lvbiBkb2VzIG5vdCByZW9wZW4gaXQgd2hlbiB0aGUgc2Vzc2lvbiByZS1zeW5jcycsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHVudGl0bGVkID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOnVudGl0bGVkJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIH0pO1xuXHRcdGNvbnN0IG90aGVyID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOm90aGVyJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIH0pO1xuXG5cdFx0Ly8gQ29tcG9zZSBhIG5ldyBzZXNzaW9uIFx1MjAxNCBhdXggYmFyIHNob3dzIHRoZSBGaWxlcyB2aWV3LlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQodW50aXRsZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSk7XG5cblx0XHQvLyBVc2VyIGNsb3NlcyB0aGUgd2hvbGUgc2lkZSBwYW5lIHdoaWxlIHN0aWxsIGNvbXBvc2luZyB0aGUgbmV3IHNlc3Npb24uXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRjb250cm9sbGVyLnRvZ2dsZVNpZGVQYW5lKCk7XG5cblx0XHQvLyBUaGUgc2FtZSB1bmNyZWF0ZWQgc2Vzc2lvbiByZS1zeW5jcyAoZS5nLiBhIG11bHRpLXNlc3Npb24gdmlldyBjb2xsYXBzZXNcblx0XHQvLyBiYWNrIHRvIGl0KS4gVGhpcyBtdXN0IG5vdCByZW9wZW4gdGhlIGF1eCBiYXIgdGhlIHVzZXIganVzdCBjbG9zZWQuXG5cdFx0aGFybmVzcy52aXNpYmxlU2Vzc2lvbnNPYnMuc2V0KFt1bnRpdGxlZCwgb3RoZXJdLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3MudmlzaWJsZVNlc3Npb25zT2JzLnNldChbdW50aXRsZWRdLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0IWhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHRcdCdzaG91bGQgbm90IHJlb3BlbiB0aGUgRmlsZXMgdmlldyB3aGVuIHRoZSBzYW1lIG5ldyBzZXNzaW9uIHJlLXN5bmNzJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IHRydWUpLFxuXHRcdFx0J2F1eCBiYXIgc2hvdWxkIHN0YXkgaGlkZGVuIHdoZW4gdGhlIHNhbWUgbmV3IHNlc3Npb24gcmUtc3luY3MnXG5cdFx0KTtcblx0fSk7XG5cblx0Ly8gLS0tIFtEOF0gRmlyc3QgQ2hhbmdlcyBlZGl0b3Igb3BlbiAtLS1cblxuXHR0ZXN0KCdbRDhdIHJldmVhbHMgdGhlIENoYW5nZXMgdmlldyB0aGUgZmlyc3QgdGltZSBhIENoYW5nZXMgZWRpdG9yIGlzIG9wZW5lZCwgdGhlbiByZW1lbWJlcnMgdGhlIGNob2ljZScsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKHsgcmV2ZWFsQXV4aWxpYXJ5QmFyT25PcGVuOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBGaXJzdCBvcGVuIG9mIHRoZSBDaGFuZ2VzIGVkaXRvciByZXZlYWxzIHRoZSBDaGFuZ2VzIHZpZXcgaW4gdGhlIHNpZGUgcGFuZS5cblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JSZXNvdXJjZSA9IGhhcm5lc3Muc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmdldENoYW5nZXNFZGl0b3JSZXNvdXJjZShzZXNzaW9uLnJlc291cmNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhc3NlcnQub2soaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLCAnZmlyc3QgQ2hhbmdlcyBvcGVuIHNob3VsZCByZXZlYWwgdGhlIENoYW5nZXMgdmlldycpO1xuXG5cdFx0Ly8gVXNlciBoaWRlcyBvbmx5IHRoZSBzaWRlIHBhbmUgKGF1eCBiYXIpIHdoaWxlIHRoZSBlZGl0b3Igc3RheXMgb3BlbjsgdGhlIGNob2ljZSBpcyByZW1lbWJlcmVkLlxuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9KTtcblxuXHRcdC8vIE9wZW5pbmcgdGhlIENoYW5nZXMgZWRpdG9yIGFnYWluIHJlc3BlY3RzIHRoZSByZW1lbWJlcmVkIGNsb3NlZCBjaG9pY2UuXG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3cyA9IFtdO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGFzc2VydC5vayghaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLCAnbGF0ZXIgQ2hhbmdlcyBvcGVucyBzaG91bGQgbm90IHJlLXJldmVhbCB0aGUgc2lkZSBwYW5lJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEOV0gY2xvc2luZyB0aGUgd2hvbGUgc2lkZSBwYW5lIGlzIG5vdCByZW1lbWJlcmVkLCBzbyByZW9wZW5pbmcgQ2hhbmdlcyByZXZlYWxzIGl0IGFnYWluJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHsgcmV2ZWFsQXV4aWxpYXJ5QmFyT25PcGVuOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBUaGUgZmlyc3QgQ2hhbmdlcyBvcGVuIHJldmVhbHMgdGhlIHNpZGUgcGFuZSAoY2FwdHVyZWQgYXMgb3BlbikuXG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3cyA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9yUmVzb3VyY2UgPSBoYXJuZXNzLnNlc3Npb25DaGFuZ2VzU2VydmljZS5nZXRDaGFuZ2VzRWRpdG9yUmVzb3VyY2Uoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhc3NlcnQub2soaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLCAnZmlyc3QgQ2hhbmdlcyBvcGVuIHNob3VsZCByZXZlYWwgdGhlIENoYW5nZXMgdmlldycpO1xuXG5cdFx0Ly8gVXNlciBjbG9zZXMgdGhlIHdob2xlIHNpZGUgcGFuZSB2aWEgdGhlIGNvbnRyb2xsZXItb3duZWQgdG9nZ2xlLCB3aGljaFxuXHRcdC8vIGhpZGVzIHRoZSBlZGl0b3IgYW5kIGF1eCBiYXIgdG9nZXRoZXIuIFRoaXMgbXVzdCBub3QgYmUgcmVtZW1iZXJlZCBhcyBhXG5cdFx0Ly8gcGVyLXNlc3Npb24gYXV4LWJhciBjaG9pY2UuXG5cdFx0Y29udHJvbGxlci50b2dnbGVTaWRlUGFuZSgpO1xuXG5cdFx0Ly8gUmUtY2xpY2tpbmcgQ2hhbmdlcyByZS1yZXZlYWxzIHRoZSAoc3RpbGwtYWN0aXZlLCBqdXN0IGhpZGRlbikgZWRpdG9yIHBhcnRcblx0XHQvLyB3aXRob3V0IGZpcmluZyBhbiBhY3RpdmUtZWRpdG9yIGNoYW5nZTsgdGhlIHNpZGUgcGFuZSBvcGVucyBhZ2FpbiAodGhlXG5cdFx0Ly8gY2xvc2Ugd2FzIG5vdCByZW1lbWJlcmVkIGFzIGFuIGF1eC1iYXIgY2hvaWNlKS5cblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQub2soaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLCAncmVvcGVuaW5nIENoYW5nZXMgYWZ0ZXIgY2xvc2luZyB0aGUgd2hvbGUgc2lkZSBwYW5lIHNob3VsZCByZXZlYWwgdGhlIENoYW5nZXMgdmlldyBhZ2FpbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDldIHJlb3BlbmluZyB0aGUgc2lkZSBwYW5lIHJlc3RvcmVzIHRoZSBwYXJ0cyB0aGF0IHdlcmUgdmlzaWJsZSB3aGVuIGl0IHdhcyBjbG9zZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXG5cdFx0Ly8gQ2xvc2luZyBoaWRlcyBib3RoIHBhcnRzLlxuXHRcdGNvbnN0IHZpc2libGVBZnRlckNsb3NlID0gY29udHJvbGxlci50b2dnbGVTaWRlUGFuZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aXNpYmxlQWZ0ZXJDbG9zZSwgZmFsc2UsICdzaWRlIHBhbmUgc2hvdWxkIGJlIGhpZGRlbiBhZnRlciBjbG9zaW5nJyk7XG5cdFx0YXNzZXJ0Lm9rKGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSwgJ2F1eCBiYXIgc2hvdWxkIGJlIGhpZGRlbicpO1xuXHRcdGFzc2VydC5vayhoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSksICdlZGl0b3Igc2hvdWxkIGJlIGhpZGRlbicpO1xuXG5cdFx0Ly8gUmVvcGVuaW5nIHJlc3RvcmVzIGJvdGggcGFydHMgdGhhdCB3ZXJlIHZpc2libGUgYmVmb3JlLlxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmxlbmd0aCA9IDA7XG5cdFx0Y29uc3QgdmlzaWJsZUFmdGVyT3BlbiA9IGNvbnRyb2xsZXIudG9nZ2xlU2lkZVBhbmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlzaWJsZUFmdGVyT3BlbiwgdHJ1ZSwgJ3NpZGUgcGFuZSBzaG91bGQgYmUgdmlzaWJsZSBhZnRlciByZW9wZW5pbmcnKTtcblx0XHRhc3NlcnQub2soaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgJiYgYy5oaWRkZW4gPT09IGZhbHNlKSwgJ2VkaXRvciBzaG91bGQgYmUgcmVzdG9yZWQnKTtcblx0XHRhc3NlcnQub2soaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IGZhbHNlKSwgJ2F1eCBiYXIgc2hvdWxkIGJlIHJlc3RvcmVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tyZW9wZW4gZGVmYXVsdCBzaW5nbGUtcGFuZV0gYSBjcmVhdGVkIHNlc3Npb24gb3BlbnMgdGhlIHNpZGUgcGFuZSB0byB0aGUgZWRpdG9yIHdpdGggdGhlIGRldGFpbCBjbG9zZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKCk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50ID0gdHJ1ZTtcblxuXHRcdC8vIFRoZSBzaWRlIHBhbmUgc3RhcnRzIGZ1bGx5IGNsb3NlZCB3aXRoIG5vIHJlbWVtYmVyZWQgcGFydHMgKGUuZy4gYWZ0ZXIgYSByZWxvYWQpLlxuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0Y29udHJvbGxlci50b2dnbGVTaWRlUGFuZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JSZXZlYWxlZDogaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgJiYgYy5oaWRkZW4gPT09IGZhbHNlKSxcblx0XHRcdGRldGFpbFJldmVhbGVkOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gZmFsc2UpLFxuXHRcdH0sIHsgZWRpdG9yUmV2ZWFsZWQ6IHRydWUsIGRldGFpbFJldmVhbGVkOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnW3Jlb3BlbiBkZWZhdWx0IHNpbmdsZS1wYW5lXSBhIG5ldy1zZXNzaW9uIHZpZXcgb3BlbnMgdGhlIHNpZGUgcGFuZSB0byB0aGUgRmlsZXMgZGV0YWlsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcigpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOm5ldycpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KSwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50ID0gdHJ1ZTtcblxuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0Y29udHJvbGxlci50b2dnbGVTaWRlUGFuZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JSZXZlYWxlZDogaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgJiYgYy5oaWRkZW4gPT09IGZhbHNlKSxcblx0XHRcdGRldGFpbFJldmVhbGVkOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gZmFsc2UpLFxuXHRcdH0sIHsgZWRpdG9yUmV2ZWFsZWQ6IGZhbHNlLCBkZXRhaWxSZXZlYWxlZDogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnW0Q4XSBkb2VzIG5vdCByZXZlYWwgdGhlIENoYW5nZXMgdmlldyBmb3IgYW4gdW50aXRsZWQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3QgdW50aXRsZWQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246dW50aXRsZWQnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldCh1bnRpdGxlZCwgdW5kZWZpbmVkKTtcblxuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvclJlc291cmNlID0gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKHVudGl0bGVkLnJlc291cmNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblxuXHRcdGFzc2VydC5vayghaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLCAndW50aXRsZWQgc2Vzc2lvbnMgYXJlIGdvdmVybmVkIGJ5IEQzYi9ENCwgbm90IEQ4Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tSMV0gc2luZ2xlLXBhbmUgaGlkZXMgdGhlIGVkaXRvciBvbiBlbnRlcmluZyBhIG5ldy1zZXNzaW9uIHZpZXcgYnV0IGtlZXBzIGFuIGV4cGxpY2l0IGluLXNlc3Npb24gcmV2ZWFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3QgdW50aXRsZWQxID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOnVudGl0bGVkMScpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KTtcblx0XHRjb25zdCBleGlzdGluZyA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpleGlzdGluZycpKTtcblx0XHRjb25zdCB1bnRpdGxlZDIgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246dW50aXRsZWQyJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldCh1bnRpdGxlZDEsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IGZpcnN0UmV2ZWFsID0ge1xuXHRcdFx0ZWRpdG9ySGlkZGVuQ2FsbHM6IGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjID0+IGMucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgJiYgYy5oaWRkZW4pLFxuXHRcdFx0b3BlbmVkRmlsZXM6IGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHR9O1xuXG5cdFx0Ly8gQW4gKmV4cGxpY2l0KiBlZGl0b3IgcmV2ZWFsIGluIHRoZSBzYW1lIG5ldy1zZXNzaW9uIHZpZXcgKG9wZW5pbmcgYSBmaWxlLFxuXHRcdC8vIHRvZ2dsaW5nIGRldGFpbHMgb2ZmKSBtdXN0IHN0aWNrLlxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5lZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHkgPSB0cnVlO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBleHBsaWNpdFJldmVhbEVkaXRvckhpZGRlbkNhbGxzID0gaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCAmJiBjLmhpZGRlbik7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KGV4aXN0aW5nLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMgPSBbXTtcblx0XHRoYXJuZXNzLmVkaXRvclJldmVhbGVkRXhwbGljaXRseSA9IGZhbHNlO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldCh1bnRpdGxlZDIsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zmlyc3RSZXZlYWwsXG5cdFx0XHRleHBsaWNpdFJldmVhbEVkaXRvckhpZGRlbkNhbGxzLFxuXHRcdFx0c2Vjb25kUmV2ZWFsRWRpdG9ySGlkZGVuQ2FsbHM6IGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjID0+IGMucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgJiYgYy5oaWRkZW4pLFxuXHRcdH0sIHtcblx0XHRcdGZpcnN0UmV2ZWFsOiB7XG5cdFx0XHRcdGVkaXRvckhpZGRlbkNhbGxzOiBbeyBwYXJ0OiBQYXJ0cy5FRElUT1JfUEFSVCwgaGlkZGVuOiB0cnVlIH1dLFxuXHRcdFx0XHRvcGVuZWRGaWxlczogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRleHBsaWNpdFJldmVhbEVkaXRvckhpZGRlbkNhbGxzOiBbXSxcblx0XHRcdHNlY29uZFJldmVhbEVkaXRvckhpZGRlbkNhbGxzOiBbeyBwYXJ0OiBQYXJ0cy5FRElUT1JfUEFSVCwgaGlkZGVuOiB0cnVlIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbUjFdIHNpbmdsZS1wYW5lIHJlLWhpZGVzIHRoZSBlZGl0b3Igb24gYW4gYXV0b21hdGljIHJldmVhbCBpbiBhIG5ldy1zZXNzaW9uIHZpZXcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCB1bnRpdGxlZCA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjp1bnRpdGxlZCcpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQodW50aXRsZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0Ly8gQW4gYXV0b21hdGljIHJldmVhbCAod29ya2luZy1zZXQgcmVzdG9yZSwgYW4gaW5oZXJpdGVkLXZpc2libGUgZWRpdG9yLCBhXG5cdFx0Ly8gbGF5b3V0IHJhY2UpIGlzIG5vdCBleHBsaWNpdCwgc28gUjEgcmUtaGlkZXMgaXQuXG5cdFx0aGFybmVzcy5lZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHkgPSBmYWxzZTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCAmJiBjLmhpZGRlbiksXG5cdFx0XHRbeyBwYXJ0OiBQYXJ0cy5FRElUT1JfUEFSVCwgaGlkZGVuOiB0cnVlIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnW1IxXSBzaW5nbGUtcGFuZSBoaWRlcyB0aGUgZWRpdG9yIHdoZW4gdGhlIG1hbmFnZWQgZW1wdHkgRmlsZSB0YWIgaXMgdGhlIGFjdGl2ZSBlZGl0b3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCB1bnRpdGxlZCA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjp1bnRpdGxlZCcpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBzdG9yZS5hZGQobmV3IEVtcHR5RmlsZUVkaXRvcklucHV0KCkpO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHVudGl0bGVkLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvckhpZGRlbkNhbGxzOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkVESVRPUl9QQVJUICYmIGMuaGlkZGVuKSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JIaWRkZW5DYWxsczogW3sgcGFydDogUGFydHMuRURJVE9SX1BBUlQsIGhpZGRlbjogdHJ1ZSB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW1IxL1QyXSBzaW5nbGUtcGFuZSBkb2VzIG5vdCBoaWRlIHRoZSBlZGl0b3Igd2hlbiBhIHJlYWwgZmlsZSBpcyB0aGUgYWN0aXZlIGVkaXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHVudGl0bGVkID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOnVudGl0bGVkJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pO1xuXG5cdFx0Y29uc3QgZmlsZUVkaXRvciA9IE9iamVjdC5jcmVhdGUoRmlsZUVkaXRvcklucHV0LnByb3RvdHlwZSkgYXMgRmlsZUVkaXRvcklucHV0O1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShmaWxlRWRpdG9yLCAncmVzb3VyY2UnLCB7IHZhbHVlOiBVUkkuZmlsZSgnL3JlcG8vZmlsZS50cycpIH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBmaWxlRWRpdG9yO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHVudGl0bGVkLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHQvLyBBIHNwdXJpb3VzIHZpc2liaWxpdHkgc2lnbmFsIG11c3Qgc3RpbGwgbm90IHJlLWhpZGUgd2hpbGUgcmVhbCBjb250ZW50IGlzIGFjdGl2ZS5cblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9ySGlkZGVuQ2FsbHM6IGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjID0+IGMucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgJiYgYy5oaWRkZW4pLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvckhpZGRlbkNhbGxzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW1IxL1Q0XSBzaW5nbGUtcGFuZSBrZWVwcyB0aGUgZWRpdG9yIG9wZW4gd2hlbiBhIGZpbGUgaXMgb3BlbmVkIGJlZm9yZSBpdCBiZWNvbWVzIGFjdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHVudGl0bGVkID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOnVudGl0bGVkJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pO1xuXG5cdFx0Ly8gTmV3LXNlc3Npb24gdmlldyBzdGFydHMgd2l0aCB0aGUgbWFuYWdlZCBlbXB0eSB0YWIgYWN0aXZlIGFuZCB0aGUgZWRpdG9yIGhpZGRlbi5cblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gc3RvcmUuYWRkKG5ldyBFbXB0eUZpbGVFZGl0b3JJbnB1dCgpKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHVudGl0bGVkLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdC8vIE9wZW5pbmcgYSBmaWxlIHJldmVhbHMgdGhlIGVkaXRvciAob25XaWxsT3BlbkVkaXRvcikgKmJlZm9yZSogdGhlIGZpbGVcblx0XHQvLyBiZWNvbWVzIHRoZSBhY3RpdmUgZWRpdG9yLCBtYXJraW5nIHRoZSByZXZlYWwgZXhwbGljaXQuIFIxIG11c3Qgbm90IHVuZG8gaXQuXG5cdFx0aGFybmVzcy5lZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHkgPSB0cnVlO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBiZWZvcmVBY3RpdmVFZGl0b3IgPSBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkVESVRPUl9QQVJUICYmIGMuaGlkZGVuKTtcblxuXHRcdGNvbnN0IGZpbGVFZGl0b3IgPSBPYmplY3QuY3JlYXRlKEZpbGVFZGl0b3JJbnB1dC5wcm90b3R5cGUpIGFzIEZpbGVFZGl0b3JJbnB1dDtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZmlsZUVkaXRvciwgJ3Jlc291cmNlJywgeyB2YWx1ZTogVVJJLmZpbGUoJy9yZXBvL3BhY2thZ2UuanNvbicpIH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBmaWxlRWRpdG9yO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJlZm9yZUFjdGl2ZUVkaXRvcixcblx0XHRcdGFmdGVyQWN0aXZlRWRpdG9yOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkVESVRPUl9QQVJUICYmIGMuaGlkZGVuKSxcblx0XHRcdGVkaXRvclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHR9LCB7XG5cdFx0XHRiZWZvcmVBY3RpdmVFZGl0b3I6IFtdLFxuXHRcdFx0YWZ0ZXJBY3RpdmVFZGl0b3I6IFtdLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW1IxXSBzaW5nbGUtcGFuZSBrZWVwcyB0aGUgZWRpdG9yIG9wZW4gd2hlbiBzd2l0Y2hpbmcgdG8gdGhlIEZpbGVzIHRhYiB3aGlsZSB0aGUgZWRpdG9yIGlzIGFscmVhZHkgdmlzaWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHVudGl0bGVkID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOnVudGl0bGVkJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pO1xuXG5cdFx0Ly8gTmV3LXNlc3Npb24gdmlldzsgdGhlIHVzZXIgb3BlbnMgYSBmaWxlLCBzbyB0aGUgZWRpdG9yIGlzIHJldmVhbGVkIGFuZCB2aXNpYmxlLlxuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBzdG9yZS5hZGQobmV3IEVtcHR5RmlsZUVkaXRvcklucHV0KCkpO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQodW50aXRsZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGhhcm5lc3MuZWRpdG9yUmV2ZWFsZWRFeHBsaWNpdGx5ID0gdHJ1ZTtcblx0XHRjb25zdCBmaWxlRWRpdG9yID0gT2JqZWN0LmNyZWF0ZShGaWxlRWRpdG9ySW5wdXQucHJvdG90eXBlKSBhcyBGaWxlRWRpdG9ySW5wdXQ7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGZpbGVFZGl0b3IsICdyZXNvdXJjZScsIHsgdmFsdWU6IFVSSS5maWxlKCcvcmVwby9wYWNrYWdlLmpzb24nKSB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gZmlsZUVkaXRvcjtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdC8vIFRoZSB1c2VyIHN3aXRjaGVzIHRvIHRoZSBtYW5hZ2VkIEZpbGVzIHBsYWNlaG9sZGVyIHRhYi4gVGhlIGVkaXRvciBpc1xuXHRcdC8vIGFscmVhZHkgdmlzaWJsZSwgc28gc3dpdGNoaW5nIHRhYnMgbXVzdCBOT1QgaGlkZSB0aGUgZWRpdG9yIGFyZWEgXHUyMDE0IGV2ZW5cblx0XHQvLyB0aG91Z2ggdGhlIHJldmVhbCBpcyBubyBsb25nZXIgZmxhZ2dlZCBleHBsaWNpdCAodGhlIGZsYWcgaXMgY2xlYXJlZCB3aGVuXG5cdFx0Ly8gdGhlIHJldmVhbC1zeW5jIHN1cHByZXNzaW9uIGlzIHJlLWFybWVkIGZvciBub24tcmVhbCBjb250ZW50KS5cblx0XHRoYXJuZXNzLmVkaXRvclJldmVhbGVkRXhwbGljaXRseSA9IGZhbHNlO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBzdG9yZS5hZGQobmV3IEVtcHR5RmlsZUVkaXRvcklucHV0KCkpO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvckhpZGRlbkNhbGxzOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkVESVRPUl9QQVJUICYmIGMuaGlkZGVuKSxcblx0XHRcdGVkaXRvclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JIaWRkZW5DYWxsczogW10sXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbUjEvVDJdIHNpbmdsZS1wYW5lIGtlZXBzIHRoZSBlZGl0b3Igb3BlbiB3aGVuIGRldGFpbHMgaXMgdG9nZ2xlZCBvZmYgaW4gYSBuZXctc2Vzc2lvbiB2aWV3JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3QgdW50aXRsZWQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246dW50aXRsZWQnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gc3RvcmUuYWRkKG5ldyBFbXB0eUZpbGVFZGl0b3JJbnB1dCgpKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHVudGl0bGVkLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdC8vIFRvZ2dsaW5nIGRldGFpbHMgb2ZmIHJldmVhbHMgdGhlIGVtcHR5IGVkaXRvciAoc28gdGhlIHNpZGUgcGFuZSBkb2VzIG5vdFxuXHRcdC8vIHZhbmlzaCkuIFRoZSBhY3RpdmUgZWRpdG9yIHN0YXlzIHRoZSBtYW5hZ2VkIGVtcHR5IHRhYiwgYnV0IHRoZSByZXZlYWwgaXNcblx0XHQvLyBleHBsaWNpdDsgUjEgbXVzdCBub3QgcmUtaGlkZSB0aGUgZWRpdG9yIGl0IHdhcyBqdXN0IGFza2VkIHRvIHNob3cuXG5cdFx0aGFybmVzcy5lZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHkgPSB0cnVlO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9ySGlkZGVuQ2FsbHM6IGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjID0+IGMucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgJiYgYy5oaWRkZW4pLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuRURJVE9SX1BBUlQpLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvckhpZGRlbkNhbGxzOiBbXSxcblx0XHRcdGVkaXRvclZpc2libGU6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tSMV0gc2luZ2xlLXBhbmUgaGlkZXMgdGhlIGVkaXRvciB3aGVuIGVudGVyaW5nIGEgbmV3LXNlc3Npb24gdmlldyB3aXRoIGFuIGluaGVyaXRlZC12aXNpYmxlIGVkaXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmV4aXN0aW5nJykpO1xuXHRcdGNvbnN0IHVudGl0bGVkID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOnVudGl0bGVkJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pO1xuXG5cdFx0Ly8gU3RhcnQgb24gYSBjcmVhdGVkIHNlc3Npb24gd2l0aCB0aGUgZWRpdG9yIHZpc2libGUgYW5kIGxlZnQgZXhwbGljaXRseSByZXZlYWxlZC5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KGV4aXN0aW5nLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MuZWRpdG9yUmV2ZWFsZWRFeHBsaWNpdGx5ID0gdHJ1ZTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0Ly8gRW50ZXJpbmcgdGhlIG5ldy1zZXNzaW9uIHZpZXcgbXVzdCByZXNldCB0byBlZGl0b3ItY2xvc2VkLCBldmVuIHRob3VnaCB0aGVcblx0XHQvLyBpbmhlcml0ZWQgZWRpdG9yIHdhcyBleHBsaWNpdGx5IHJldmVhbGVkIGZvciB0aGUgcHJldmlvdXMgc2Vzc2lvbi5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHVudGl0bGVkLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCAmJiBjLmhpZGRlbiksXG5cdFx0XHRbeyBwYXJ0OiBQYXJ0cy5FRElUT1JfUEFSVCwgaGlkZGVuOiB0cnVlIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnW0QzYl0gc3RhbmRhcmQgY29udHJvbGxlciBkb2VzIG5vdCBoaWRlIHRoZSBlZGl0b3Igb24gbmV3LXNlc3Npb24gc2lkZS1wYW5lIHJldmVhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3QgdW50aXRsZWQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246dW50aXRsZWQnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHVudGl0bGVkLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCAmJiBjLmhpZGRlbiksXG5cdFx0XHRbXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEOF0gZG9lcyBub3QgcmV2ZWFsIHRoZSBDaGFuZ2VzIHZpZXcgd2hpbGUgbXVsdGlwbGUgc2Vzc2lvbnMgYXJlIHZpc2libGUnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IGEgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246YScpKTtcblx0XHRjb25zdCBiID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmInKSk7XG5cdFx0aGFybmVzcy52aXNpYmxlU2Vzc2lvbnNPYnMuc2V0KFthLCBiXSwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KGEsIHVuZGVmaW5lZCk7XG5cblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JSZXNvdXJjZSA9IGhhcm5lc3Muc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmdldENoYW5nZXNFZGl0b3JSZXNvdXJjZShhLnJlc291cmNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblxuXHRcdGFzc2VydC5vayghaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLCAnbXVsdGktc2Vzc2lvbiBtb2RlIG1hbmFnZXMgdGhlIHNpZGUgcGFuZSBzZXBhcmF0ZWx5Jyk7XG5cdH0pO1xuXG5cdC8vIC0tLSBbRDVdIEVkaXRvciBtYXhpbWl6ZWQgLS0tXG5cblx0dGVzdCgnW0Q1XSBzaG93cyB0aGUgQ2hhbmdlcyB2aWV3IHdoZW4gdGhlIGVkaXRvciBhcmVhIGlzIG1heGltaXplZCcsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblxuXHRcdC8vIE1heGltaXplIHRoZSBlZGl0b3IgYXJlYS5cblx0XHRoYXJuZXNzLmVkaXRvck1heGltaXplZCA9IHRydWU7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZUVkaXRvck1heGltaXplZC5maXJlKCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzLmluY2x1ZGVzKENIQU5HRVNfVklFV19JRCksXG5cdFx0XHQnQ2hhbmdlcyB2aWV3IHNob3VsZCBiZSBzaG93biB3aGVuIHRoZSBlZGl0b3IgaXMgbWF4aW1pemVkJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tENV0gcmVzdG9yZXMgdGhlIHByZXZpb3VzIGF1eCBiYXIgdmlzaWJpbGl0eSB3aGVuIHRoZSBlZGl0b3IgaXMgdW4tbWF4aW1pemVkJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gQXV4IGJhciBoaWRkZW4gYmVmb3JlIG1heGltaXppbmcuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblxuXHRcdC8vIE1heGltaXplIFx1MjAxNCBDaGFuZ2VzIHZpZXcgc2hvd24gKGF1eCBiYXIgcmV2ZWFsZWQpLlxuXHRcdGhhcm5lc3MuZWRpdG9yTWF4aW1pemVkID0gdHJ1ZTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkLmZpcmUoKTtcblxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHQvLyBSZXN0b3JlIFx1MjAxNCBhdXggYmFyIHNob3VsZCBiZSBoaWRkZW4gYWdhaW4uXG5cdFx0aGFybmVzcy5lZGl0b3JNYXhpbWl6ZWQgPSBmYWxzZTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkLmZpcmUoKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdCdhdXggYmFyIHNob3VsZCBiZSByZXN0b3JlZCB0byBoaWRkZW4gYWZ0ZXIgdW4tbWF4aW1pemluZydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDVdIGRvZXMgbm90IGNhcHR1cmUgZm9yY2VkIGF1eCBiYXIgdmlzaWJpbGl0eSB3aGlsZSB0aGUgZWRpdG9yIGlzIG1heGltaXplZCcsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIEF1eCBiYXIgaGlkZGVuIGJlZm9yZSBtYXhpbWl6aW5nLlxuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cblx0XHRoYXJuZXNzLmVkaXRvck1heGltaXplZCA9IHRydWU7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZUVkaXRvck1heGltaXplZC5maXJlKCk7XG5cblx0XHQvLyBTaW11bGF0ZSB0aGUgYXV4IGJhciBiZWluZyByZXZlYWxlZCB3aGlsZSBtYXhpbWl6ZWQuXG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXG5cdFx0Ly8gU3dpdGNoaW5nIGF3YXkgZnJvbSB0aGUgc2Vzc2lvbiBzaG91bGQgbm90IGhhdmUgcmVtZW1iZXJlZCB0aGUgZm9yY2VkXG5cdFx0Ly8gdmlzaWJsZSBzdGF0ZTogc3dpdGNoaW5nIGJhY2sga2VlcHMgdGhlIGF1eCBiYXIgaGlkZGVuLlxuXHRcdGhhcm5lc3MuZWRpdG9yTWF4aW1pemVkID0gZmFsc2U7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZUVkaXRvck1heGltaXplZC5maXJlKCk7XG5cblx0XHRjb25zdCBzZXNzaW9uMiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoyJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjIsIHVuZGVmaW5lZCk7XG5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdCdhdXggYmFyIHNob3VsZCByZW1haW4gaGlkZGVuIGZvciB0aGUgc2Vzc2lvbiBhZnRlciB0aGUgZWRpdG9yIHdhcyBtYXhpbWl6ZWQnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0Q1XSBrZWVwcyB0aGUgQ2hhbmdlcyB2aWV3IHNob3duIHdoaWxlIG1heGltaXplZCByZWdhcmRsZXNzIG9mIHRoZSBzZXNzaW9uIHN0YXRlJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uMSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjEsIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBNYXhpbWl6ZSBcdTIwMTQgQ2hhbmdlcyB2aWV3IHNob3duLlxuXHRcdGhhcm5lc3MuZWRpdG9yTWF4aW1pemVkID0gdHJ1ZTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkLmZpcmUoKTtcblxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3cyA9IFtdO1xuXG5cdFx0Ly8gV2hpbGUgc3RpbGwgbWF4aW1pemVkLCBzd2l0Y2ggdG8gYW5vdGhlciBleGlzdGluZyBzZXNzaW9uIHRoYXQgd291bGRcblx0XHQvLyBub3JtYWxseSBrZWVwIHRoZSBhdXggYmFyIGhpZGRlbi4gSXQgbXVzdCBzdGF5IHNob3dpbmcgdGhlIENoYW5nZXMgdmlldy5cblx0XHRjb25zdCBzZXNzaW9uMiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoyJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjIsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzLmluY2x1ZGVzKENIQU5HRVNfVklFV19JRCksXG5cdFx0XHQnQ2hhbmdlcyB2aWV3IHNob3VsZCBzdGF5IHNob3duIHdoaWxlIG1heGltaXplZCdcblx0XHQpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdCFoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSksXG5cdFx0XHQnYXV4IGJhciBzaG91bGQgbm90IGJlIGhpZGRlbiB3aGlsZSB0aGUgZWRpdG9yIGlzIG1heGltaXplZCdcblx0XHQpO1xuXHR9KTtcblxuXHQvLyAtLS0gW0QxXSArIFtCMl0gRWRpdG9yIC8gYXV4aWxpYXJ5IGJhciBpbnZhcmlhbnQgLS0tXG5cblx0dGVzdCgnW0QxXSBkb2VzIG5vdCBmb3JjZSBhdXhpbGlhcnkgYmFyIHZpc2libGUgd2hlbiByZXN0b3JpbmcgZWRpdG9yIHdvcmtpbmcgc2V0IG9uIHNlc3Npb24gc3dpdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24xID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MicpKTtcblx0XHRjcmVhdGVDb250cm9sbGVyKHtcblx0XHRcdHVzZU1vZGFsOiAnc29tZScsXG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXJzOiBbeyB1cmk6IFVSSS5maWxlKCcvcmVwbycpIH1dLFxuXHRcdFx0bGF5b3V0U3RhdGU6IFt7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogJ3Nlc3Npb246MScsXG5cdFx0XHRcdGVkaXRvcldvcmtpbmdTZXQ6IHsgaWQ6ICd3cy0xJywgbmFtZTogJ3dzLTEnIH0sXG5cdFx0XHRcdHZpZXdTdGF0ZTogeyBhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSwgYXV4aWxpYXJ5QmFyQWN0aXZlVmlld0NvbnRhaW5lcklkOiB1bmRlZmluZWQgfSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXG5cdFx0Ly8gU3RhcnQgb24gYSBkaWZmZXJlbnQgc2Vzc2lvbiwgdGhlbiBzd2l0Y2ggdG8gdGhlIG9uZSB3aXRoIGEgc2F2ZWQgd29ya2luZyBzZXQuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24xLCB1bmRlZmluZWQpO1xuXHRcdC8vIEZsdXNoIHRoZSB3b3JraW5nLXNldCBzZXF1ZW5jZXIgKHF1ZXVlZCBtaWNyb3Rhc2tzKVxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCAmJiBjLmhpZGRlbiA9PT0gZmFsc2UpLFxuXHRcdFx0J2VkaXRvciBwYXJ0IHNob3VsZCBiZSByZXZlYWxlZCBieSB0aGUgd29ya2luZyBzZXQgcmVzdG9yZSdcblx0XHQpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdCFoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gZmFsc2UpLFxuXHRcdFx0J2F1eGlsaWFyeSBiYXIgbXVzdCBub3QgYmUgZm9yY2VkIHZpc2libGUgZHVyaW5nIHdvcmtpbmcgc2V0IHJlc3RvcmUnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSByZXZlYWxzIHRoZSBlZGl0b3IgcGFydCBmb3IgYSBjcmVhdGVkIHNlc3Npb24gb24gc3dpdGNoLCBldmVuIHdpdGggdXNlTW9kYWwgYWxsIChFZGl0b3Itb25seSBkZWZhdWx0KScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gW3sgdXJpOiBVUkkuZmlsZSgnL3JlcG8nKSB9XTtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IHNpbmdsZVBhbmVMYXlvdXRFbmFibGVkOiB0cnVlLCB3b3Jrc3BhY2VGb2xkZXJzIH0pO1xuXHRcdGNvbnN0IHVudGl0bGVkID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOm5ldycpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KTtcblx0XHRjb25zdCBleGlzdGluZyA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpleGlzdGluZycpKTtcblxuXHRcdC8vIE9uIHRoZSBuZXctc2Vzc2lvbiB2aWV3IHRoZSBlZGl0b3IgcGFydCBpcyBoaWRkZW4uXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldCh1bnRpdGxlZCwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdC8vIE5hdmlnYXRpbmcgdG8gdGhlIGV4aXN0aW5nIChjcmVhdGVkKSBzZXNzaW9uIHJldmVhbHMgdGhlIGVkaXRvciBwYXJ0IHRvXG5cdFx0Ly8gc2hvdyB0aGUgbWFuYWdlZCBDaGFuZ2VzIGVkaXRvciAodGhlIHNpZGUgcGFuZSBpcyBubyBsb25nZXIgbGVmdCBjbG9zZWQpLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoZXhpc3RpbmcsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkVESVRPUl9QQVJUICYmIGMuaGlkZGVuID09PSBmYWxzZSksXG5cdFx0XHQnZWRpdG9yIHBhcnQgc2hvdWxkIGJlIHJldmVhbGVkIGZvciB0aGUgY3JlYXRlZCBzZXNzaW9uJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gcHJlc2VydmVzIGRldGFpbC1vbmx5IGxheW91dCB3aGVuIGFuIGFjdGl2ZSBuZXcgc2Vzc2lvbiBpcyByZXBsYWNlZCBieSBpdHMgY3JlYXRlZCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSBbeyB1cmk6IFVSSS5maWxlKCcvcmVwbycpIH1dO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IHNpbmdsZVBhbmVMYXlvdXRFbmFibGVkOiB0cnVlLCB3b3Jrc3BhY2VGb2xkZXJzIH0pO1xuXHRcdGNvbnN0IGRyYWZ0ID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmRyYWZ0JyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246Y3JlYXRlZCcpKTtcblxuXHRcdC8vIFRoZSBuZXctc2Vzc2lvbiB2aWV3IHN0YXJ0cyBGaWxlcy9kZXRhaWwtb25seTogZGV0YWlsIHZpc2libGUsIGVkaXRvciBoaWRkZW4uXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChkcmFmdCwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnZpc2libGVTZXNzaW9uc09icy5zZXQoW2RyYWZ0XSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuZ2V0RWRpdG9yUGFydEhpZGRlbihkcmFmdC5yZXNvdXJjZSksIHRydWUpO1xuXG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cdFx0Ly8gVGhlIHByb3ZpZGVyIGNvbW1pdHMgdGhlIGRyYWZ0IGFzIGEgbmV3IHJlc291cmNlLCB0aGVuIHRoZSB2aXNpYmxlIHNsb3QgdXBkYXRlcy5cblx0XHRoYXJuZXNzLm9uRGlkUmVwbGFjZVNlc3Npb24uZmlyZSh7IGZyb206IGRyYWZ0LCB0bzogY3JlYXRlZCB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KGNyZWF0ZWQsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy52aXNpYmxlU2Vzc2lvbnNPYnMuc2V0KFtjcmVhdGVkXSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JSZXZlYWxzOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkVESVRPUl9QQVJUICYmIGMuaGlkZGVuID09PSBmYWxzZSkubGVuZ3RoLFxuXHRcdFx0ZWRpdG9ySGlkZXM6IGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjID0+IGMucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgJiYgYy5oaWRkZW4gPT09IHRydWUpLmxlbmd0aCxcblx0XHRcdG9wZW5lZENoYW5nZXM6IGhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSxcblx0XHRcdGVkaXRvclBhcnRIaWRkZW46IGNvbnRyb2xsZXIuZ2V0RWRpdG9yUGFydEhpZGRlbihjcmVhdGVkLnJlc291cmNlKSxcblx0XHRcdGRldGFpbFZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHRcdGVkaXRvclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JSZXZlYWxzOiAwLFxuXHRcdFx0ZWRpdG9ySGlkZXM6IDAsXG5cdFx0XHRvcGVuZWRDaGFuZ2VzOiB0cnVlLFxuXHRcdFx0ZWRpdG9yUGFydEhpZGRlbjogdHJ1ZSxcblx0XHRcdGRldGFpbFZpc2libGU6IHRydWUsXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSBwcmVzZXJ2ZXMgZWRpdG9yLWhpZGRlbiBsYXlvdXQgb24gc3VibWl0IGV2ZW4gd2hlbiB0aGUgZHJhZnQgc3RhdGUgd2FzIG5ldmVyIGNhcHR1cmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIE1pcnJvcnMgdGhlIHJlYWwgYXBwOiB0aGUgbmV3LXNlc3Npb24gZWRpdG9yIHN0YXJ0cyBoaWRkZW4gd2l0aCBub1xuXHRcdC8vIHZpc2libGVcdTIxOTJoaWRkZW4gdHJhbnNpdGlvbiwgc28gYF9lZGl0b3JQYXJ0SGlkZGVuQnlTZXNzaW9uYCBpcyBuZXZlclxuXHRcdC8vIGNhcHR1cmVkIGZvciB0aGUgZHJhZnQuIFRoZSBmaXggbXVzdCBzdGlsbCBrZWVwIHRoZSBlZGl0b3IgaGlkZGVuIG9uXG5cdFx0Ly8gc3VibWl0ICh2aWEgdGhlIGRyYWZ0XHUyMTkyY29tbWl0dGVkIHJlcGxhY2VtZW50IHByZXNlcnZlKSwgbm90IHJldmVhbCBpdC5cblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gW3sgdXJpOiBVUkkuZmlsZSgnL3JlcG8nKSB9XTtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IHNpbmdsZVBhbmVMYXlvdXRFbmFibGVkOiB0cnVlLCB3b3Jrc3BhY2VGb2xkZXJzIH0pO1xuXHRcdGNvbnN0IGRyYWZ0ID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmRyYWZ0JyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246Y3JlYXRlZCcpKTtcblxuXHRcdC8vIERldGFpbC1vbmx5IG9uLXNjcmVlbiwgYnV0IFdJVEhPVVQgZmlyaW5nIHRoZSBlZGl0b3ItdmlzaWJpbGl0eSBjYXB0dXJlIGV2ZW50LlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoZHJhZnQsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy52aXNpYmxlU2Vzc2lvbnNPYnMuc2V0KFtkcmFmdF0sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0Ly8gVGhlIHByb3ZpZGVyIGNvbW1pdHMgdGhlIGRyYWZ0LCB0aGVuIHRoZSB2aXNpYmxlIHNsb3QgdXBkYXRlcy5cblx0XHRoYXJuZXNzLm9uRGlkUmVwbGFjZVNlc3Npb24uZmlyZSh7IGZyb206IGRyYWZ0LCB0bzogY3JlYXRlZCB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KGNyZWF0ZWQsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy52aXNpYmxlU2Vzc2lvbnNPYnMuc2V0KFtjcmVhdGVkXSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JSZXZlYWxzOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkVESVRPUl9QQVJUICYmIGMuaGlkZGVuID09PSBmYWxzZSkubGVuZ3RoLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuRURJVE9SX1BBUlQpLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclJldmVhbHM6IDAsXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSBkb2VzIG5vdCByZXZlYWwgdGhlIGVkaXRvciBwYXJ0IGZvciBhIGNyZWF0ZWQgc2Vzc2lvbiB3aG9zZSBlZGl0b3Igd2FzIGV4cGxpY2l0bHkgaGlkZGVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSBbeyB1cmk6IFVSSS5maWxlKCcvcmVwbycpIH1dO1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHtcblx0XHRcdHNpbmdsZVBhbmVMYXlvdXRFbmFibGVkOiB0cnVlLFxuXHRcdFx0d29ya3NwYWNlRm9sZGVycyxcblx0XHRcdGxheW91dFN0YXRlOiBbeyBzZXNzaW9uUmVzb3VyY2U6ICdzZXNzaW9uOmV4aXN0aW5nJywgZWRpdG9yUGFydEhpZGRlbjogdHJ1ZSB9XSxcblx0XHR9KTtcblx0XHRjb25zdCB1bnRpdGxlZCA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpuZXcnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246ZXhpc3RpbmcnKSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHVudGl0bGVkLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChleGlzdGluZywgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0IWhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkVESVRPUl9QQVJUICYmIGMuaGlkZGVuID09PSBmYWxzZSksXG5cdFx0XHQndGhlIGVkaXRvciBwYXJ0IG11c3Qgc3RheSBoaWRkZW4gZm9yIGEgc2Vzc2lvbiB3aG9zZSBlZGl0b3Igd2FzIGV4cGxpY2l0bHkgaGlkZGVuJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gZG9lcyBub3QgcmV2ZWFsIHRoZSBlZGl0b3IgcGFydCBmb3IgYSBjcmVhdGVkIHF1aWNrIGNoYXQgb24gc3dpdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgc2luZ2xlUGFuZUxheW91dEVuYWJsZWQ6IHRydWUgfSk7XG5cdFx0Y29uc3QgdW50aXRsZWQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246bmV3JyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IHF1aWNrQ2hhdCA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpxYycpLCB7IGlzUXVpY2tDaGF0OiB0cnVlIH0pO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldCh1bnRpdGxlZCwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdC8vIEEgcXVpY2sgY2hhdCBoYXMgbm8gc2lkZSBwYW5lLCBzbyBzd2l0Y2hpbmcgdG8gaXQgbXVzdCBuZXZlciBhdXRvLXJldmVhbFxuXHRcdC8vIHRoZSBlZGl0b3IgcGFydCBldmVuIHRob3VnaCB0aGUgc2Vzc2lvbiBpcyBjcmVhdGVkLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQocXVpY2tDaGF0LCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHQhaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgJiYgYy5oaWRkZW4gPT09IGZhbHNlKSxcblx0XHRcdCd0aGUgZWRpdG9yIHBhcnQgbXVzdCBub3QgYmUgcmV2ZWFsZWQgZm9yIGEgcXVpY2sgY2hhdCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbc2luZ2xlLXBhbmVdIGhpZGVzIGEgdmlzaWJsZSBlZGl0b3IgcGFydCB3aGVuIHN3aXRjaGluZyB0byBhIHF1aWNrIGNoYXQgd2l0aCBhbiBlbXB0eSBlZGl0b3IgZ3JvdXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBzaW5nbGVQYW5lTGF5b3V0RW5hYmxlZDogdHJ1ZSwgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHQvLyBBIHByaW9yIHNlc3Npb24gbGVmdCB0aGUgZWRpdG9yIHBhcnQgdmlzaWJsZTsgdGhlIHF1aWNrIGNoYXQncyBlZGl0b3Jcblx0XHQvLyBncm91cCBpcyBlbXB0eSAobm8gbWFuYWdlZCB0YWJzKSwgc28gdGhlIHdob2xlIHNpZGUgcGFuZSBtdXN0IGNvbGxhcHNlLlxuXHRcdGhhcm5lc3MuZWRpdG9yR3JvdXBzSGF2ZUNvbnRlbnQgPSBmYWxzZTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOnFjJyksIHsgaXNRdWlja0NoYXQ6IHRydWUgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkVESVRPUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdCd0aGUgZWRpdG9yIHBhcnQgc2hvdWxkIGhpZGUgZm9yIGEgcXVpY2sgY2hhdCB3aXRoIGFuIGVtcHR5IGVkaXRvciBncm91cCdcblx0XHQpO1xuXHR9KTtcblxuXHQvLyAtLS0gW0I0XSArIFtEMV0gUGVyc2lzdGVuY2UgLS0tXG5cblx0dGVzdCgnW0I0XSBwZXJzaXN0cyBhdXgtYmFyIHZpZXcgc3RhdGUgdG8gc2Vzc2lvbnMubGF5b3V0U3RhdGUga2V5JywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uMSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGNvbnN0IHNlc3Npb24yID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjInKSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24xLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MuYWN0aXZlUGFuZUNvbXBvc2l0ZUlkID0gJ2N1c3RvbS52aWV3JztcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjIsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5zdG9yYWdlU2VydmljZS50ZXN0RW1pdFdpbGxTYXZlU3RhdGUoV2lsbFNhdmVTdGF0ZVJlYXNvbi5TSFVURE9XTik7XG5cblx0XHRjb25zdCBzdG9yZWQgPSBoYXJuZXNzLnN0b3JhZ2VTZXJ2aWNlLmdldCgnc2Vzc2lvbnMubGF5b3V0U3RhdGUnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRhc3NlcnQub2soc3RvcmVkLCAnc3RhdGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShzdG9yZWQhKTtcblx0XHRjb25zdCBzZXNzaW9uMUVudHJ5ID0gcGFyc2VkLmZpbmQoKGU6IGFueSkgPT4gZS5zZXNzaW9uUmVzb3VyY2UgPT09ICdzZXNzaW9uOjEnKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbjFFbnRyeSwgJ3Nlc3Npb24gMSBlbnRyeSBzaG91bGQgZXhpc3QnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb24xRW50cnkudmlld1N0YXRlLCB7XG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGF1eGlsaWFyeUJhckFjdGl2ZVZpZXdDb250YWluZXJJZDogJ2N1c3RvbS52aWV3Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW0QxXSBrZWVwcyBhdXggYmFyIGhpZGRlbiBhZnRlciByZWxvYWQgd2hlbiBhIHNlc3Npb24gd2l0aCBlZGl0b3JzIGNsb3NlcyBib3RoIGVkaXRvciBhbmQgYXV4IGJhcicsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gW3sgdXJpOiBVUkkuZmlsZSgnL3JlcG8nKSB9XTtcblx0XHRjcmVhdGVDb250cm9sbGVyKHsgdXNlTW9kYWw6ICdzb21lJywgd29ya3NwYWNlRm9sZGVycyB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24xID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MicpKTtcblxuXHRcdC8vIFNlc3Npb24gMSBhY3RpdmUgd2l0aCBhbiBlZGl0b3Igb3BlbiBzbyBhIHdvcmtpbmcgc2V0IGlzIHNhdmVkIG9uIHN3aXRjaC1hd2F5LlxuXHRcdGhhcm5lc3MudmlzaWJsZUVkaXRvcnNMaXN0ID0gW3t9XTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24xLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjIsIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBCYWNrIHRvIHNlc3Npb24gMSBhbmQgaGlkZSB0aGUgYXV4IGJhciAoY2FwdHVyZWQgaW1tZWRpYXRlbHkgYXMgaGlkZGVuIHZpZXcgc3RhdGUpLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjEsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXG5cdFx0Ly8gQ2xvc2UgYWxsIGVkaXRvcnMsIHRoZW4gc3dpdGNoIGF3YXkgc28gdGhlIG5vdy1lbXB0eSB3b3JraW5nIHNldCBpcyBzYXZlZC5cblx0XHRoYXJuZXNzLnZpc2libGVFZGl0b3JzTGlzdCA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjIsIHVuZGVmaW5lZCk7XG5cblx0XHRoYXJuZXNzLnN0b3JhZ2VTZXJ2aWNlLnRlc3RFbWl0V2lsbFNhdmVTdGF0ZShXaWxsU2F2ZVN0YXRlUmVhc29uLlNIVVRET1dOKTtcblx0XHRjb25zdCBzdG9yZWQgPSBoYXJuZXNzLnN0b3JhZ2VTZXJ2aWNlLmdldCgnc2Vzc2lvbnMubGF5b3V0U3RhdGUnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRhc3NlcnQub2soc3RvcmVkLCAnc3RhdGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXG5cdFx0Ly8gUmVsb2FkOiBhIGZyZXNoIGNvbnRyb2xsZXIgcmVzdG9yZXMgZnJvbSB0aGUgcGVyc2lzdGVkIHN0YXRlLlxuXHRcdHN0b3JlLmNsZWFyKCk7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcih7IHVzZU1vZGFsOiAnc29tZScsIHdvcmtzcGFjZUZvbGRlcnMsIGxheW91dFN0YXRlOiBKU09OLnBhcnNlKHN0b3JlZCEpIH0pO1xuXHRcdGNvbnN0IHJlbG9hZGVkU2Vzc2lvbjEgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzID0gW107XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChyZWxvYWRlZFNlc3Npb24xLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IHRydWUpLFxuXHRcdFx0J2F1eCBiYXIgc2hvdWxkIHJlbWFpbiBoaWRkZW4gYWZ0ZXIgcmVsb2FkJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHJlbG9hZFdpdGhTaWRlUGFuZVRvZ2dsZWRDbG9zZWQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IFt7IHVyaTogVVJJLmZpbGUoJy9yZXBvJykgfV07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoeyB1c2VNb2RhbDogJ3NvbWUnLCB3b3Jrc3BhY2VGb2xkZXJzLCByZXZlYWxBdXhpbGlhcnlCYXJPbk9wZW46IHRydWUgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MudmlzaWJsZUVkaXRvcnNMaXN0ID0gW3t9XTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBPcGVuIHRoZSBDaGFuZ2VzIGVkaXRvciBzbyB0aGUgZWRpdG9yICsgYXV4IGJhciBhcmUgYm90aCB2aXNpYmxlIGFuZCB0aGVcblx0XHQvLyBzZXNzaW9uJ3MgYXV4LWJhciB2aXNpYmxlIGNob2ljZSBpcyBjYXB0dXJlZC5cblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvclJlc291cmNlID0gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRyb2xsZXIuZ2V0Vmlld1N0YXRlKHNlc3Npb24ucmVzb3VyY2UpPy5hdXhpbGlhcnlCYXJWaXNpYmxlLCB0cnVlKTtcblxuXHRcdC8vIFVzZXIgY2xvc2VzIHRoZSB3aG9sZSBzaWRlIHBhbmUgKGVkaXRvciArIGF1eCBiYXIpIHZpYSB0aGUgdG9nZ2xlLCB0aGVuIHJlbG9hZHMuXG5cdFx0Y29udHJvbGxlci50b2dnbGVTaWRlUGFuZSgpO1xuXHRcdGhhcm5lc3Muc3RvcmFnZVNlcnZpY2UudGVzdEVtaXRXaWxsU2F2ZVN0YXRlKFdpbGxTYXZlU3RhdGVSZWFzb24uU0hVVERPV04pO1xuXHRcdGNvbnN0IHN0b3JlZCA9IGhhcm5lc3Muc3RvcmFnZVNlcnZpY2UuZ2V0KCdzZXNzaW9ucy5sYXlvdXRTdGF0ZScsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGFzc2VydC5vayhzdG9yZWQsICdzdGF0ZSBzaG91bGQgYmUgcGVyc2lzdGVkJyk7XG5cblx0XHRzdG9yZS5jbGVhcigpO1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoeyB1c2VNb2RhbDogJ3NvbWUnLCB3b3Jrc3BhY2VGb2xkZXJzLCBsYXlvdXRTdGF0ZTogSlNPTi5wYXJzZShzdG9yZWQhKSwgcmV2ZWFsQXV4aWxpYXJ5QmFyT25PcGVuOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHJlbG9hZGVkU2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXG5cdFx0Ly8gUmVsb2FkIHJlc3RvcmVzIHRoZSBzaWRlIHBhbmUgY2xvc2VkIChib3RoIHBhcnRzIGhpZGRlbikuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQocmVsb2FkZWRTZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9yUmVzb3VyY2UgPSBoYXJuZXNzLnNlc3Npb25DaGFuZ2VzU2VydmljZS5nZXRDaGFuZ2VzRWRpdG9yUmVzb3VyY2UocmVsb2FkZWRTZXNzaW9uLnJlc291cmNlKTtcblx0fVxuXG5cdHRlc3QoJ1tEOV0gZG9lcyBub3QgYXV0by1yZXZlYWwgdGhlIHNpZGUgcGFuZSB3aGVuIHRoZSBDaGFuZ2VzIGVkaXRvciBpcyByZXN0b3JlZCBvbiByZWxvYWQnLCAoKSA9PiB7XG5cdFx0cmVsb2FkV2l0aFNpZGVQYW5lVG9nZ2xlZENsb3NlZCgpO1xuXG5cdFx0Ly8gVGhlIHdvcmtpbmcgc2V0IHJlc3RvcmUgY2FuIG1ha2UgdGhlIENoYW5nZXMgZWRpdG9yIGFjdGl2ZSBhZ2FpbiB3aGlsZVxuXHRcdC8vIHRoZSBlZGl0b3IgcGFydCBpcyBzdGlsbCBoaWRkZW4gXHUyMDE0IHRoaXMgbXVzdCBOT1QgYXV0by1yZXZlYWwgdGhlIHNpZGUgcGFuZS5cblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHQhaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLFxuXHRcdFx0J3Jlc3RvcmluZyB0aGUgQ2hhbmdlcyBlZGl0b3Igb24gcmVsb2FkIG11c3Qgbm90IGF1dG8tcmV2ZWFsIHRoZSBzaWRlIHBhbmUnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0Q5XSByZXZlYWxzIHRoZSBDaGFuZ2VzIHZpZXcgd2hlbiBvcGVuaW5nIENoYW5nZXMgYWZ0ZXIgcmVsb2FkaW5nIGEgc2Vzc2lvbiB3aG9zZSBzaWRlIHBhbmUgd2FzIHRvZ2dsZWQgY2xvc2VkJywgKCkgPT4ge1xuXHRcdHJlbG9hZFdpdGhTaWRlUGFuZVRvZ2dsZWRDbG9zZWQoKTtcblxuXHRcdC8vIENsaWNraW5nIE9wZW4gQ2hhbmdlcyBvcGVucyB0aGUgQ2hhbmdlcyBlZGl0b3IgKHJldmVhbGluZyB0aGUgZWRpdG9yXG5cdFx0Ly8gcGFydCk7IHRoZSBhdXggYmFyIG11c3QgYmUgcmV2ZWFsZWQgdG9vIGJlY2F1c2UgdGhlIHdob2xlLXBhbmUgY29sbGFwc2Vcblx0XHQvLyB3YXMgbm90IGFuIGV4cGxpY2l0IGF1eC1iYXItaGlkZGVuIGNob2ljZS5cblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0aGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLFxuXHRcdFx0J29wZW5pbmcgQ2hhbmdlcyBhZnRlciByZWxvYWQgc2hvdWxkIHJldmVhbCB0aGUgQ2hhbmdlcyB2aWV3J1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEOV0gZG9lcyBub3QgdHVybiBhbiBleHBsaWNpdCBhdXgtYmFyIGhpZGUgaW50byBhIGNvbGxhcHNlIHdoZW4gYW5vdGhlciBzZXNzaW9uIGlzIGNvbGxhcHNlZCcsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gW3sgdXJpOiBVUkkuZmlsZSgnL3JlcG8nKSB9XTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih7IHVzZU1vZGFsOiAnc29tZScsIHdvcmtzcGFjZUZvbGRlcnMsIHJldmVhbEF1eGlsaWFyeUJhck9uT3BlbjogdHJ1ZSB9KTtcblx0XHRjb25zdCBzZXNzaW9uRXhwbGljaXQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246ZXhwbGljaXQnKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNvbGxhcHNlID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmNvbGxhcHNlJykpO1xuXHRcdGhhcm5lc3MudmlzaWJsZUVkaXRvcnNMaXN0ID0gW3t9XTtcblxuXHRcdC8vIFNlc3Npb24gQTogb3BlbiBDaGFuZ2VzIChlZGl0b3IgKyBhdXggdmlzaWJsZSksIHRoZW4gZXhwbGljaXRseSBoaWRlIGp1c3Rcblx0XHQvLyB0aGUgYXV4IGJhciB3aGlsZSB0aGUgZWRpdG9yIHN0YXlzIG9wZW4gXHUyMDE0IGFuIGV4cGxpY2l0IGF1eC1iYXIgY2hvaWNlLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbkV4cGxpY2l0LCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9yUmVzb3VyY2UgPSBoYXJuZXNzLnNlc3Npb25DaGFuZ2VzU2VydmljZS5nZXRDaGFuZ2VzRWRpdG9yUmVzb3VyY2Uoc2Vzc2lvbkV4cGxpY2l0LnJlc291cmNlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmdldFZpZXdTdGF0ZShzZXNzaW9uRXhwbGljaXQucmVzb3VyY2UpPy5hdXhpbGlhcnlCYXJIaWRkZW5CeUNvbGxhcHNlLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gU2Vzc2lvbiBCOiBjb2xsYXBzZSB0aGUgd2hvbGUgc2lkZSBwYW5lIChtYXJrcyBCIGFzIGNvbGxhcHNlLWhpZGRlbikuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uQ29sbGFwc2UsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRjb250cm9sbGVyLnRvZ2dsZVNpZGVQYW5lKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuZ2V0Vmlld1N0YXRlKHNlc3Npb25Db2xsYXBzZS5yZXNvdXJjZSk/LmF1eGlsaWFyeUJhckhpZGRlbkJ5Q29sbGFwc2UsIHRydWUpO1xuXG5cdFx0Ly8gU3dpdGNoaW5nIGJhY2sgdG8gQSBjYXB0dXJlcyBpdCBhZ2FpbiBcdTIwMTQgaXRzIGV4cGxpY2l0IGhpZGUgbXVzdCByZW1haW5cblx0XHQvLyBleHBsaWNpdCAobm8gY29sbGFwc2UgbWFya2VyIGxlYWtpbmcgZnJvbSBzZXNzaW9uIEIncyBjb2xsYXBzZSkuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uRXhwbGljaXQsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uQ29sbGFwc2UsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuZ2V0Vmlld1N0YXRlKHNlc3Npb25FeHBsaWNpdC5yZXNvdXJjZSk/LmF1eGlsaWFyeUJhckhpZGRlbkJ5Q29sbGFwc2UsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEOV0gcmUtb3BlbmluZyB0aGUgc2lkZSBwYW5lIHRvIGVkaXRvci1vbmx5IGRvZXMgbm90IG1hcmsgYW4gZXhwbGljaXQgYXV4LWJhciBoaWRlIGFzIGEgY29sbGFwc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IFt7IHVyaTogVVJJLmZpbGUoJy9yZXBvJykgfV07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoeyB1c2VNb2RhbDogJ3NvbWUnLCB3b3Jrc3BhY2VGb2xkZXJzLCByZXZlYWxBdXhpbGlhcnlCYXJPbk9wZW46IHRydWUgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MudmlzaWJsZUVkaXRvcnNMaXN0ID0gW3t9XTtcblxuXHRcdC8vIE9wZW4gQ2hhbmdlcyAoZWRpdG9yICsgYXV4IHZpc2libGUpLCB0aGVuIGV4cGxpY2l0bHkgaGlkZSBqdXN0IHRoZSBhdXggYmFyLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvclJlc291cmNlID0gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuZ2V0Vmlld1N0YXRlKHNlc3Npb24ucmVzb3VyY2UpPy5hdXhpbGlhcnlCYXJIaWRkZW5CeUNvbGxhcHNlLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gQ29sbGFwc2UgdGhlIHdob2xlIHNpZGUgcGFuZSwgdGhlbiByZS1vcGVuIGl0OiBpdCByZXN0b3JlcyB0aGUgZWRpdG9yLW9ubHlcblx0XHQvLyBzdGF0ZSAoYXV4IGJhciBzdGF5cyBoaWRkZW4gYmVjYXVzZSBpdCB3YXMgZXhwbGljaXRseSBoaWRkZW4gYmVmb3JlKS5cblx0XHRjb250cm9sbGVyLnRvZ2dsZVNpZGVQYW5lKCk7XG5cdFx0Y29udHJvbGxlci50b2dnbGVTaWRlUGFuZSgpO1xuXG5cdFx0Ly8gVGhlIGV4cGxpY2l0IGF1eC1iYXIgaGlkZSBtdXN0IG5vdCBoYXZlIGJlY29tZSBhIGNvbGxhcHNlLWRyaXZlbiBoaWRlLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmdldFZpZXdTdGF0ZShzZXNzaW9uLnJlc291cmNlKT8uYXV4aWxpYXJ5QmFySGlkZGVuQnlDb2xsYXBzZSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIE9wZW5pbmcgQ2hhbmdlcyBtdXN0IHRoZXJlZm9yZSBub3QgcmUtcmV2ZWFsIHRoZSBhdXggYmFyLlxuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0IWhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSxcblx0XHRcdCdhbiBleHBsaWNpdCBhdXgtYmFyIGhpZGUgbXVzdCBub3QgcmUtcmV2ZWFsIGFmdGVyIGEgY29sbGFwc2UgKyBlZGl0b3Itb25seSByZS1vcGVuJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBbRDddIFJlc3BvbnNpdmUgc2Vzc2lvbnMgc2lkZWJhciAtLS1cblxuXHRmdW5jdGlvbiBzZXRQYXJ0VmlzaWJsZShwYXJ0OiBQYXJ0cywgdmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KHBhcnQsIHZpc2libGUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBwYXJ0LCB2aXNpYmxlIH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVzaXplV2luZG93KHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRoYXJuZXNzLm1haW5Db250YWluZXJXaWR0aCA9IHdpZHRoO1xuXHRcdGhhcm5lc3Mub25EaWRMYXlvdXRNYWluQ29udGFpbmVyLmZpcmUoeyB3aWR0aCwgaGVpZ2h0OiAxMDAwIH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2lkZWJhckhpZGRlbkNhbGxzKCk6IGJvb2xlYW5bXSB7XG5cdFx0cmV0dXJuIGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjID0+IGMucGFydCA9PT0gUGFydHMuU0lERUJBUl9QQVJUKS5tYXAoYyA9PiBjLmhpZGRlbik7XG5cdH1cblxuXHR0ZXN0KCdbRDddIGhpZGVzIHRoZSBzaWRlYmFyIG9uIGEgc21hbGwgd2luZG93IHdoZW4gZWRpdG9yIGFuZCBhdXggYmFyIGFyZSBib3RoIG9wZW4nLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRyZXNpemVXaW5kb3coODAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lkZWJhckhpZGRlbkNhbGxzKCksIFt0cnVlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEN10gZG9lcyBub3QgdG91Y2ggdGhlIHNpZGViYXIgb24gYSBsYXJnZSB3aW5kb3cnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRyZXNpemVXaW5kb3coMjAwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZGViYXJIaWRkZW5DYWxscygpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEN10gc2hvd3MgdGhlIHNpZGViYXIgYWdhaW4gb25jZSB0aGUgYXV4IGJhciBjbG9zZXMnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdHJlc2l6ZVdpbmRvdyg4MDApO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRzZXRQYXJ0VmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWRlYmFySGlkZGVuQ2FsbHMoKSwgW2ZhbHNlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEN10gc2hvd3MgdGhlIHNpZGViYXIgYWdhaW4gb25jZSB0aGUgd2luZG93IGdyb3dzIGJhY2snLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdHJlc2l6ZVdpbmRvdyg4MDApO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRyZXNpemVXaW5kb3coMjAwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZGViYXJIaWRkZW5DYWxscygpLCBbZmFsc2VdKTtcblx0fSk7XG5cblx0dGVzdCgnW0Q3XSBkb2VzIG5vdCBhdXRvLXNob3cgdGhlIHNpZGViYXIgYWZ0ZXIgdGhlIHVzZXIgY2xvc2VkIGl0IG1hbnVhbGx5JywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHQvLyBVc2VyIG1hbnVhbGx5IGNsb3NlcyB0aGUgc2lkZWJhciBvbiBhIGxhcmdlIHdpbmRvdy5cblx0XHRzZXRQYXJ0VmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0Ly8gQmVjb21lIHNwYWNlIGNvbnN0cmFpbmVkLCB0aGVuIHJlbGlldmUgdGhlIGNvbnN0cmFpbnQuXG5cdFx0cmVzaXplV2luZG93KDgwMCk7XG5cdFx0c2V0UGFydFZpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdCFzaWRlYmFySGlkZGVuQ2FsbHMoKS5pbmNsdWRlcyhmYWxzZSksXG5cdFx0XHQnc2lkZWJhciBtdXN0IG5vdCBiZSBhdXRvLXNob3duIHdoaWxlIHRoZSB1c2VyLWNsb3NlZCBwcmVmZXJlbmNlIGhvbGRzJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEN10gcmVzdW1lcyBhdXRvLW1hbmFnZW1lbnQgYWZ0ZXIgdGhlIHVzZXIgb3BlbnMgdGhlIHNpZGViYXIgYWdhaW4nLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdC8vIFVzZXIgbWFudWFsbHkgY2xvc2VzLCB0aGVuIHJlLW9wZW5zIHRoZSBzaWRlYmFyIFx1MjAxNCBhdXRvLW1hbmFnZW1lbnQgcmVzdW1lcy5cblx0XHRzZXRQYXJ0VmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRzZXRQYXJ0VmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHQvLyBBIGNvbnN0cmFpbiBcdTIxOTIgdW4tY29uc3RyYWluIGN5Y2xlIHNob3VsZCBub3cgYXV0by1oaWRlIHRoZW4gYXV0by1zaG93IGFnYWluLlxuXHRcdHJlc2l6ZVdpbmRvdyg4MDApO1xuXHRcdHNldFBhcnRWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZGViYXJIaWRkZW5DYWxscygpLCBbdHJ1ZSwgZmFsc2VdKTtcblx0fSk7XG5cblx0dGVzdCgnW0Q3XSBkb2VzIG5vdCBhdXRvLXNob3cgdGhlIHNpZGViYXIgdGhlIHVzZXIgY2xvc2VkIGJlZm9yZSByZWxvYWRpbmcnLCAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGUgdGhlIHJlc3RvcmVkIHN0YXRlIGFmdGVyIGEgcmVsb2FkOiB0aGUgc2lkZWJhciBhbmQgdGhlIHdob2xlIHNpZGVcblx0XHQvLyBwYW5lIChlZGl0b3IgKyBhdXggYmFyKSBhcmUgaGlkZGVuLCBvbiBhIHNtYWxsIHdpbmRvdy4gVGhlIGNvbnRyb2xsZXIgb25seVxuXHRcdC8vIGF1dG8tcmV2ZWFscyBhIHNpZGViYXIgaXQgYXV0by1oaWQsIHNvIGEgc2lkZWJhciB0aGUgdXNlciBjbG9zZWQgYmVmb3JlIHRoZVxuXHRcdC8vIHJlbG9hZCAoYWxyZWFkeSBoaWRkZW4gaGVyZSkgbXVzdCBzdGF5IGNsb3NlZC5cblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih7XG5cdFx0XHRtYWluQ29udGFpbmVyV2lkdGg6IDgwMCxcblx0XHRcdGluaXRpYWxQYXJ0VmlzaWJpbGl0eTogbmV3IE1hcDxQYXJ0cywgYm9vbGVhbj4oW1xuXHRcdFx0XHRbUGFydHMuU0lERUJBUl9QQVJULCBmYWxzZV0sXG5cdFx0XHRcdFtQYXJ0cy5FRElUT1JfUEFSVCwgZmFsc2VdLFxuXHRcdFx0XHRbUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlXSxcblx0XHRcdF0pLFxuXHRcdH0pO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHQvLyBPcGVuIHRoZSBzaWRlIHBhbmUgKGJlY29tZXMgc3BhY2UgY29uc3RyYWluZWQpLCB0aGVuIGNsb3NlIGl0IGFnYWluLlxuXHRcdGNvbnRyb2xsZXIudG9nZ2xlU2lkZVBhbmUoKTtcblx0XHRjb250cm9sbGVyLnRvZ2dsZVNpZGVQYW5lKCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHQhc2lkZWJhckhpZGRlbkNhbGxzKCkuaW5jbHVkZXMoZmFsc2UpLFxuXHRcdFx0J3NpZGViYXIgbXVzdCBub3QgYmUgYXV0by1zaG93biB3aGVuIGl0IHdhcyBjbG9zZWQgYmVmb3JlIHRoZSByZWxvYWQnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0Q3XSBkb2VzIG5vdCBtYW5hZ2UgdGhlIHNpZGViYXIgd2hpbGUgdGhlIGVkaXRvciBpcyBtYXhpbWl6ZWQnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGhhcm5lc3MuZWRpdG9yTWF4aW1pemVkID0gdHJ1ZTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkLmZpcmUoKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0cmVzaXplV2luZG93KDgwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZGViYXJIaWRkZW5DYWxscygpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEN10gZG9lcyBub3QgbWFuYWdlIHRoZSBzaWRlYmFyIHdoZW4gdGhlIGV4cGVyaW1lbnRhbCBzZXR0aW5nIGlzIGRpc2FibGVkJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoeyByZXNwb25zaXZlU2lkZWJhcjogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdHJlc2l6ZVdpbmRvdyg4MDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWRlYmFySGlkZGVuQ2FsbHMoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDddIGRvZXMgbm90IGhpZGUgdGhlIHNpZGViYXIgd2hlbiBuYXZpZ2F0aW5nIHRvIGEgc2Vzc2lvbiB0aGF0IHJlc3RvcmVzIHRoZSBzaWRlIHBhbmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25CID0gVVJJLnBhcnNlKCdzZXNzaW9uOjInKTtcblx0XHRjcmVhdGVDb250cm9sbGVyKHtcblx0XHRcdHJldmVhbEF1eGlsaWFyeUJhck9uT3BlbjogdHJ1ZSxcblx0XHRcdGxheW91dFN0YXRlOiBbe1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25CLnRvU3RyaW5nKCksXG5cdFx0XHRcdHZpZXdTdGF0ZTogeyBhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlLCBhdXhpbGlhcnlCYXJBY3RpdmVWaWV3Q29udGFpbmVySWQ6IENIQU5HRVNfVklFV19DT05UQUlORVJfSUQgfSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHRcdC8vIFNtYWxsIHdpbmRvdyB3aXRoIHRoZSBzaWRlIHBhbmVsIGNsb3NlZDogdGhlIHNpZGViYXIgaXMgc2hvd24gKG5vdCBjb25zdHJhaW5lZCkuXG5cdFx0c2V0UGFydFZpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRyZXNpemVXaW5kb3coODAwKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0Ly8gTmF2aWdhdGUgdG8gYSBzZXNzaW9uIHdob3NlIHJlc3RvcmUgcmUtb3BlbnMgdGhlIHNpZGUgcGFuZWwuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihzZXNzaW9uQiksIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZGViYXJIaWRkZW5DYWxscygpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEN10gZG9lcyBub3QgaGlkZSB0aGUgc2lkZWJhciB3aGVuIG5hdmlnYXRpbmcgdG8gYSBzZXNzaW9uIHdob3NlIHdvcmtpbmcgc2V0IHJldmVhbHMgdGhlIGVkaXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uMSA9IFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBVUkkucGFyc2UoJ3Nlc3Npb246MicpO1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoe1xuXHRcdFx0dXNlTW9kYWw6ICdzb21lJyxcblx0XHRcdHdvcmtzcGFjZUZvbGRlcnM6IFt7IHVyaTogVVJJLmZpbGUoJy9yZXBvJykgfV0sXG5cdFx0XHRsYXlvdXRTdGF0ZTogW3tcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uMS50b1N0cmluZygpLFxuXHRcdFx0XHRlZGl0b3JXb3JraW5nU2V0OiB7IGlkOiAnd3MtMScsIG5hbWU6ICd3cy0xJyB9LFxuXHRcdFx0XHR2aWV3U3RhdGU6IHsgYXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSwgYXV4aWxpYXJ5QmFyQWN0aXZlVmlld0NvbnRhaW5lcklkOiBDSEFOR0VTX1ZJRVdfQ09OVEFJTkVSX0lEIH0sXG5cdFx0XHR9XSxcblx0XHR9KTtcblxuXHRcdC8vIFN0YXJ0IG9uIGEgc2Vzc2lvbiB3aXRob3V0IGEgd29ya2luZyBzZXQuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihzZXNzaW9uMiksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdC8vIFNtYWxsIHdpbmRvdywgYXV4IGJhciBvcGVuLCBlZGl0b3IgY2xvc2VkOiBub3QgY29uc3RyYWluZWQgeWV0IChlZGl0b3IgaGlkZGVuKS5cblx0XHRzZXRQYXJ0VmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0c2V0UGFydFZpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRyZXNpemVXaW5kb3coODAwKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0Ly8gTmF2aWdhdGUgdG8gdGhlIHNlc3Npb24gd2hvc2Ugd29ya2luZyBzZXQgcmV2ZWFscyB0aGUgZWRpdG9yIChhc3luYykuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihzZXNzaW9uMSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lkZWJhckhpZGRlbkNhbGxzKCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnW0Q3XSBkb2VzIG5vdCBtYW5hZ2UgdGhlIHNpZGViYXIgd2hpbGUgbXVsdGlwbGUgc2Vzc2lvbnMgYXJlIHZpc2libGUnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGhhcm5lc3MudmlzaWJsZVNlc3Npb25zT2JzLnNldChbXG5cdFx0XHRtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSxcblx0XHRcdG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoyJykpLFxuXHRcdF0sIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdHJlc2l6ZVdpbmRvdyg4MDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWRlYmFySGlkZGVuQ2FsbHMoKSwgW10pO1xuXHR9KTtcblxuXHQvLyAtLS0gW0Q3IHNpbmdsZS1wYW5lXSBBdXRvLWhpZGUgdGhlIHNlc3Npb25zIGxpc3Qgb25seSBvbiBleHBsaWNpdCBkZXRhaWxzIG9wZW4gLS0tXG5cblx0dGVzdCgnW0Q3IHNpbmdsZS1wYW5lXSBoaWRlcyB0aGUgc2Vzc2lvbnMgbGlzdCB3aGVuIGRldGFpbHMgaXMgb3BlbmVkIHZpYSB0aGUgdG9nZ2xlIGFjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBtYWluQ29udGFpbmVyV2lkdGg6IDgwMCB9KTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLlNJREVCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdGNvbnRyb2xsZXIudG9nZ2xlRGV0YWlscygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWRlYmFySGlkZGVuQ2FsbHMoKSwgW3RydWVdKTtcblx0fSk7XG5cblx0dGVzdCgnW0Q3IHNpbmdsZS1wYW5lXSBkb2VzIG5vdCBoaWRlIHRoZSBzZXNzaW9ucyBsaXN0IG9uIGEgYmlnIHdpbmRvdyB3aGVuIGRldGFpbHMgaXMgb3BlbmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IG1haW5Db250YWluZXJXaWR0aDogMjQwMCB9KTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLlNJREVCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdGNvbnRyb2xsZXIudG9nZ2xlRGV0YWlscygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWRlYmFySGlkZGVuQ2FsbHMoKSwgW10sICdhIHdpZGUgd2luZG93IGtlZXBzIHRoZSBzZXNzaW9ucyBsaXN0IG9wZW4nKTtcblx0fSk7XG5cblx0dGVzdCgnW0Q3IHNpbmdsZS1wYW5lXSByZXN0b3JlcyB0aGUgc2Vzc2lvbnMgbGlzdCB3aGVuIGRldGFpbHMgaXMgY2xvc2VkIHZpYSB0aGUgdG9nZ2xlIGFjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBtYWluQ29udGFpbmVyV2lkdGg6IDgwMCB9KTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLlNJREVCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0Y29udHJvbGxlci50b2dnbGVEZXRhaWxzKCk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdC8vIERldGFpbHMgbm93IG9wZW4gLT4gdG9nZ2xpbmcgYWdhaW4gY2xvc2VzIGl0IGFuZCByZXN0b3JlcyB0aGUgYXV0by1oaWRkZW4gbGlzdC5cblx0XHRjb250cm9sbGVyLnRvZ2dsZURldGFpbHMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lkZWJhckhpZGRlbkNhbGxzKCksIFtmYWxzZV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDcgc2luZ2xlLXBhbmVdIGRvZXMgbm90IHRvdWNoIHRoZSBzZXNzaW9ucyBsaXN0IG9uIGF1dG9tYXRpYyBkZXRhaWxzIG9wZW5zJywgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgbWFpbkNvbnRhaW5lcldpZHRoOiA4MDAgfSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuU0lERUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0Ly8gQSBwcm9ncmFtbWF0aWMgYXV4LWJhciB2aXNpYmlsaXR5IGNoYW5nZSAoc3VibWl0L3Jlc3RvcmUpIGlzIG5vdCB0aGVcblx0XHQvLyB0b2dnbGUgYWN0aW9uLCBzbyB0aGUgc2Vzc2lvbnMgbGlzdCBzdGF5cyBhcy1pcy5cblx0XHRzZXRQYXJ0VmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZGViYXJIaWRkZW5DYWxscygpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tENyBzaW5nbGUtcGFuZV0gZG9lcyBub3QgbWFuYWdlIHRoZSBzZXNzaW9ucyBsaXN0IHdoaWxlIG11bHRpcGxlIHNlc3Npb25zIGFyZSB2aXNpYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IG1haW5Db250YWluZXJXaWR0aDogODAwIH0pO1xuXHRcdGhhcm5lc3MudmlzaWJsZVNlc3Npb25zT2JzLnNldChbXG5cdFx0XHRtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSxcblx0XHRcdG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoyJykpLFxuXHRcdF0sIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5TSURFQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRjb250cm9sbGVyLnRvZ2dsZURldGFpbHMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lkZWJhckhpZGRlbkNhbGxzKCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnW0Q3IHNpbmdsZS1wYW5lXSBkb2VzIG5vdCByZXN0b3JlIGEgc2Vzc2lvbnMgbGlzdCB0aGUgdXNlciByZW9wZW5lZCBtYW51YWxseScsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBtYWluQ29udGFpbmVyV2lkdGg6IDgwMCB9KTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLlNJREVCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0Y29udHJvbGxlci50b2dnbGVEZXRhaWxzKCk7XG5cblx0XHQvLyBVc2VyIG1hbnVhbGx5IHJlb3BlbnMgdGhlIHNlc3Npb25zIGxpc3QgLT4gY29udHJvbCBoYW5kZWQgYmFjay5cblx0XHRzZXRQYXJ0VmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHQvLyBDbG9zaW5nIGRldGFpbHMgbXVzdCBub3cgbm90IHRvdWNoIHRoZSBzZXNzaW9ucyBsaXN0LlxuXHRcdGNvbnRyb2xsZXIudG9nZ2xlRGV0YWlscygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWRlYmFySGlkZGVuQ2FsbHMoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDcgc2luZ2xlLXBhbmVdIHJlc3RvcmVzIGFuIGF1dG8taGlkZGVuIHNlc3Npb25zIGxpc3Qgb25jZSB0aGUgc2lkZSBwYW5lIGlzIGZ1bGx5IGhpZGRlbicsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBtYWluQ29udGFpbmVyV2lkdGg6IDgwMCB9KTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuU0lERUJBUl9QQVJULCB0cnVlKTtcblx0XHQvLyBPcGVuaW5nIGRldGFpbHMgYXV0by1oaWRlcyB0aGUgc2Vzc2lvbnMgbGlzdCAob25seSB0aGUgYXV4IGJhciBpcyB2aXNpYmxlKS5cblx0XHRjb250cm9sbGVyLnRvZ2dsZURldGFpbHMoKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0Ly8gVGhlIHdob2xlIHNpZGUgcGFuZSBpcyBsYXRlciBoaWRkZW4gYnkgb3RoZXIgbWVhbnMgKGUuZy4gc3dpdGNoaW5nIHRvIGFcblx0XHQvLyBxdWljayBjaGF0LCB3aGljaCBoYXMgbm8gc2lkZSBwYW5lKS4gVGhlIGxpc3QgbXVzdCBub3QgYmUgbGVmdCBjb2xsYXBzZWRcblx0XHQvLyB3aGlsZSB0aGUgc2lkZSBwYW5lIGlzIGhpZGRlbiwgc28gcmVzdG9yZSBpdC5cblx0XHRzZXRQYXJ0VmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWRlYmFySGlkZGVuQ2FsbHMoKSwgW2ZhbHNlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tENyBzaW5nbGUtcGFuZV0gcmVzdG9yZXMgYW4gYXV0by1oaWRkZW4gc2Vzc2lvbnMgbGlzdCBvbmNlIHRoZSB3aW5kb3cgZ3Jvd3MgcGFzdCB0aGUgdGhyZXNob2xkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IG1haW5Db250YWluZXJXaWR0aDogODAwIH0pO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuU0lERUJBUl9QQVJULCB0cnVlKTtcblx0XHQvLyBPcGVuaW5nIGRldGFpbHMgb24gYSBzbWFsbCB3aW5kb3cgYXV0by1oaWRlcyB0aGUgc2Vzc2lvbnMgbGlzdC5cblx0XHRjb250cm9sbGVyLnRvZ2dsZURldGFpbHMoKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0Ly8gVGhlIHVzZXIgZW5sYXJnZXMgdGhlIHdpbmRvdyBwYXN0IHRoZSB0aHJlc2hvbGQ6IHRoZXJlIGlzIG5vdyByb29tLCBzbyB0aGVcblx0XHQvLyBhdXRvLWhpZGRlbiBsaXN0IGlzIHJlc3RvcmVkLlxuXHRcdHJlc2l6ZVdpbmRvdygyNDAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lkZWJhckhpZGRlbkNhbGxzKCksIFtmYWxzZV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDcgc2luZ2xlLXBhbmVdIGRvZXMgbm90IHJlc3RvcmUgYSBtYW51YWxseS1oaWRkZW4gc2Vzc2lvbnMgbGlzdCB3aGVuIHRoZSBzaWRlIHBhbmUgaXMgaGlkZGVuJywgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgbWFpbkNvbnRhaW5lcldpZHRoOiA4MDAgfSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuU0lERUJBUl9QQVJULCB0cnVlKTtcblx0XHQvLyBVc2VyIG1hbnVhbGx5IGNsb3NlcyB0aGUgc2Vzc2lvbnMgbGlzdCAobm90IGFuIGF1dG8taGlkZSkuXG5cdFx0c2V0UGFydFZpc2libGUoUGFydHMuU0lERUJBUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdC8vIFRoZSBzaWRlIHBhbmUgbGF0ZXIgZnVsbHkgY2xvc2VzOyBhIHVzZXItY2xvc2VkIGxpc3QgbXVzdCBzdGF5IGNsb3NlZC5cblx0XHRzZXRQYXJ0VmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWRlYmFySGlkZGVuQ2FsbHMoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDcgc2luZ2xlLXBhbmVdIGNvbnRyaWJ1dGVzIHRoZSBUb2dnbGUgRGV0YWlscyBjb21tYW5kIHRvIHRoZSBlZGl0b3IgdGl0bGUgbGF5b3V0IGNsdXN0ZXInLCAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoKTtcblxuXHRcdGNvbnN0IGl0ZW1zID0gTWVudVJlZ2lzdHJ5LmdldE1lbnVJdGVtcyhNZW51SWQuRWRpdG9yVGl0bGVMYXlvdXQpXG5cdFx0XHQuZmlsdGVyKGlzSU1lbnVJdGVtKVxuXHRcdFx0LmZpbHRlcihpdGVtID0+IGl0ZW0uY29tbWFuZC5pZCA9PT0gVE9HR0xFX0RFVEFJTFNfQ09NTUFORF9JRCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXMubGVuZ3RoLCAxLCAnZXhhY3RseSBvbmUgVG9nZ2xlIERldGFpbHMgaXRlbSBvbiB0aGUgZWRpdG9yIHRpdGxlIGxheW91dCBjbHVzdGVyJyk7XG5cdFx0Y29uc3Qgd2hlbiA9IGl0ZW1zWzBdLndoZW4/LnNlcmlhbGl6ZSgpID8/ICcnO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aWNvbjogVGhlbWVJY29uLmlzVGhlbWVJY29uKGl0ZW1zWzBdLmNvbW1hbmQuaWNvbikgPyBpdGVtc1swXS5jb21tYW5kLmljb24uaWQgOiB1bmRlZmluZWQsXG5cdFx0XHRvcmRlcjogaXRlbXNbMF0ub3JkZXIsXG5cdFx0XHRoYXNUb2dnbGVkOiAhIWl0ZW1zWzBdLmNvbW1hbmQudG9nZ2xlZCxcblx0XHRcdGdhdGVkT25FZGl0b3JBcmVhOiB3aGVuLmluY2x1ZGVzKE1haW5FZGl0b3JBcmVhVmlzaWJsZUNvbnRleHQua2V5KSxcblx0XHRcdGdhdGVkT25Eb2NrZWREZXRhaWxzOiB3aGVuLmluY2x1ZGVzKEhhc0RvY2tlZERldGFpbHNDb250ZXh0LmtleSksXG5cdFx0fSwge1xuXHRcdFx0aWNvbjogQ29kaWNvbi5saXN0U2VsZWN0aW9uLmlkLFxuXHRcdFx0Ly8gQ29uZGl0aW9uYWwgKGhpZGRlbiBmb3IgdGFiIHR5cGVzIHdpdGggbm8gZGV0YWlsLCBlLmcuIGJyb3dzZXIgYW5kXG5cdFx0XHQvLyBzZWFyY2gpLCBidXQga2VlcHMgaXRzIHRyYWlsaW5nIHBvc2l0aW9uIGFmdGVyIHRoZSBhbHdheXMtcHJlc2VudFxuXHRcdFx0Ly8gbWF4aW1pemUgKG9yZGVyIDEwKSBhbmQgaGlkZS1lZGl0b3IgKG9yZGVyIDIwKSBpdGVtcy5cblx0XHRcdG9yZGVyOiAzMCxcblx0XHRcdGhhc1RvZ2dsZWQ6IHRydWUsXG5cdFx0XHRnYXRlZE9uRWRpdG9yQXJlYTogdHJ1ZSxcblx0XHRcdGdhdGVkT25Eb2NrZWREZXRhaWxzOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gW1NjZW5hcmlvIDhdIEF1dG8taGlkZSB0aGUgc2Vzc2lvbnMgbGlzdCB3aGVuIG9wZW5pbmcgYSBmaWxlIC0tLVxuXG5cdGZ1bmN0aW9uIG9wZW5FZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdGNvbnN0IGV2ZW50OiBJRWRpdG9yV2lsbE9wZW5FdmVudCA9IHsgZ3JvdXBJZDogMSwgZWRpdG9yIH07XG5cdFx0aGFybmVzcy5vbldpbGxPcGVuRWRpdG9yLmZpcmUoZXZlbnQpO1xuXHR9XG5cblx0dGVzdCgnW1NjZW5hcmlvIDhdIGhpZGVzIHRoZSBzZXNzaW9ucyBsaXN0IHdoZW4gYSByZWFsIGZpbGUgaXMgb3BlbmVkIGluIGEgY3JlYXRlZCBzZXNzaW9uIHdpdGggdGhlIGVkaXRvciBjbG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBtYWluQ29udGFpbmVyV2lkdGg6IDgwMCB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLlNJREVCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRvcGVuRWRpdG9yKE9iamVjdC5jcmVhdGUoRmlsZUVkaXRvcklucHV0LnByb3RvdHlwZSkgYXMgRmlsZUVkaXRvcklucHV0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lkZWJhckhpZGRlbkNhbGxzKCksIFt0cnVlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tTY2VuYXJpbyA4XSBoaWRlcyB0aGUgc2Vzc2lvbnMgbGlzdCB3aGVuIGEgc2luZ2xlLWZpbGUgZGlmZiBpcyBvcGVuZWQgaW4gYSBjcmVhdGVkIHNlc3Npb24gd2l0aCB0aGUgZWRpdG9yIGNsb3NlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IG1haW5Db250YWluZXJXaWR0aDogODAwIH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSksIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuU0lERUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgZmFsc2UpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdGNvbnN0IGRpZmZFZGl0b3IgPSBPYmplY3QuY3JlYXRlKERpZmZFZGl0b3JJbnB1dC5wcm90b3R5cGUpIGFzIERpZmZFZGl0b3JJbnB1dDtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZGlmZkVkaXRvciwgJ29yaWdpbmFsJywgeyB2YWx1ZTogT2JqZWN0LmNyZWF0ZShGaWxlRWRpdG9ySW5wdXQucHJvdG90eXBlKSB9KTtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZGlmZkVkaXRvciwgJ21vZGlmaWVkJywgeyB2YWx1ZTogT2JqZWN0LmNyZWF0ZShGaWxlRWRpdG9ySW5wdXQucHJvdG90eXBlKSB9KTtcblx0XHRvcGVuRWRpdG9yKGRpZmZFZGl0b3IpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWRlYmFySGlkZGVuQ2FsbHMoKSwgW3RydWVdKTtcblx0fSk7XG5cblx0dGVzdCgnW1NjZW5hcmlvIDhdIGRvZXMgbm90IGhpZGUgdGhlIHNlc3Npb25zIGxpc3Qgb24gYSBiaWcgd2luZG93IHdoZW4gYSBmaWxlIGlzIG9wZW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IG1haW5Db250YWluZXJXaWR0aDogMjQwMCB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLlNJREVCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRvcGVuRWRpdG9yKE9iamVjdC5jcmVhdGUoRmlsZUVkaXRvcklucHV0LnByb3RvdHlwZSkgYXMgRmlsZUVkaXRvcklucHV0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lkZWJhckhpZGRlbkNhbGxzKCksIFtdLCAnYSB3aWRlIHdpbmRvdyBrZWVwcyB0aGUgc2Vzc2lvbnMgbGlzdCBvcGVuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tTY2VuYXJpbyA4XSBkb2VzIG5vdCBoaWRlIHRoZSBzZXNzaW9ucyBsaXN0IGluIGEgbmV3ICh1bmNyZWF0ZWQpIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBtYWluQ29udGFpbmVyV2lkdGg6IDgwMCB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjp1bnRpdGxlZCcpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KSwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5TSURFQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0b3BlbkVkaXRvcihPYmplY3QuY3JlYXRlKEZpbGVFZGl0b3JJbnB1dC5wcm90b3R5cGUpIGFzIEZpbGVFZGl0b3JJbnB1dCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZGViYXJIaWRkZW5DYWxscygpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tTY2VuYXJpbyA4XSBkb2VzIG5vdCBoaWRlIHRoZSBzZXNzaW9ucyBsaXN0IHdoZW4gdGhlIGVkaXRvciBhcmVhIGlzIGFscmVhZHkgb3BlbicsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IG1haW5Db250YWluZXJXaWR0aDogODAwIH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSksIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuU0lERUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0b3BlbkVkaXRvcihPYmplY3QuY3JlYXRlKEZpbGVFZGl0b3JJbnB1dC5wcm90b3R5cGUpIGFzIEZpbGVFZGl0b3JJbnB1dCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZGViYXJIaWRkZW5DYWxscygpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tTY2VuYXJpbyA4XSBkb2VzIG5vdCBoaWRlIHRoZSBzZXNzaW9ucyBsaXN0IHdoZW4gYSBtYW5hZ2VkIGVtcHR5IHRhYiBpcyBvcGVuZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBtYWluQ29udGFpbmVyV2lkdGg6IDgwMCB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLlNJREVCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRvcGVuRWRpdG9yKHN0b3JlLmFkZChuZXcgRW1wdHlGaWxlRWRpdG9ySW5wdXQoKSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWRlYmFySGlkZGVuQ2FsbHMoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdbU2NlbmFyaW8gOF0gZG9lcyBub3QgaGlkZSB0aGUgc2Vzc2lvbnMgbGlzdCBvbiBmaWxlIG9wZW4gd2hpbGUgbXVsdGlwbGUgc2Vzc2lvbnMgYXJlIHZpc2libGUnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBtYWluQ29udGFpbmVyV2lkdGg6IDgwMCB9KTtcblx0XHRoYXJuZXNzLnZpc2libGVTZXNzaW9uc09icy5zZXQoW1xuXHRcdFx0bWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSksXG5cdFx0XHRtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MicpKSxcblx0XHRdLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLlNJREVCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0b3BlbkVkaXRvcihPYmplY3QuY3JlYXRlKEZpbGVFZGl0b3JJbnB1dC5wcm90b3R5cGUpIGFzIEZpbGVFZGl0b3JJbnB1dCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZGViYXJIaWRkZW5DYWxscygpLCBbXSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBbRDEwXSBBdXhpbGlhcnkgYmFyIHBhcnQgaGlkZGVuIHdoZW4gaXQgaGFzIG5vIGFjdGl2ZSB2aWV3IGNvbnRhaW5lcnMgLS0tXG5cblx0dGVzdCgnW0QxMF0gaGlkZXMgdGhlIGF1eC1iYXIgcGFydCBmb3IgYSBxdWljayBjaGF0IHdoZW4gaXRzIHZpZXcgY29udGFpbmVycyBhcmUgZ2F0ZWQgb2ZmJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpxYycpLCB7IGlzUXVpY2tDaGF0OiB0cnVlIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5hY3RpdmVBdXhWaWV3Q29udGFpbmVySWRzID0gW107XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHQvLyBBIHF1aWNrIGNoYXQgZ2F0ZXMgb2ZmIENoYW5nZXMgKyBGaWxlcywgc28gdGhlIGF1eCBiYXIgaGFzIG5vIGFjdGl2ZVxuXHRcdC8vIHZpZXcgY29udGFpbmVycyBcdTIwMTQgdGhlIHBhcnQgbXVzdCBoaWRlIGluc3RlYWQgb2Ygc2hvd2luZyBhbiBlbXB0eSBjb2x1bW4uXG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZUFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5maXJlKCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSksXG5cdFx0XHQnYXV4LWJhciBwYXJ0IHNob3VsZCBoaWRlIHdoZW4gYSBxdWljayBjaGF0IGhhcyBubyBhY3RpdmUgdmlldyBjb250YWluZXJzJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEMTBdIGRvZXMgbm90IGhpZGUgdGhlIGF1eCBiYXIgZHVyaW5nIGVhcmx5IHJlbG9hZCB3aGVuIHRoZXJlIGlzIG5vIGFjdGl2ZSBzZXNzaW9uIHlldCcsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKHsgYWN0aXZlQXV4Vmlld0NvbnRhaW5lcklkczogW10gfSk7XG5cdFx0Ly8gU3RhcnR1cC9yZWxvYWQ6IGF1eCByZXN0b3JlZCB2aXNpYmxlIChwZXJzaXN0ZWQpIGJ1dCBubyBhY3RpdmUgc2Vzc2lvbiB5ZXQ7XG5cdFx0Ly8gaXRzIGNvbnRhaW5lcnMgYXJlIHRyYW5zaWVudGx5IGluYWN0aXZlLiBIaWRpbmcgaGVyZSBpcyB0aGUgcmVsb2FkIGZsaWNrZXJcblx0XHQvLyAob3BlbnMgdGhlbiBjbG9zZXMpIFx1MjAxNCBEMTAgbXVzdCBsZWF2ZSBpdCBhbG9uZSB1bnRpbCBhIHNlc3Npb24gc2V0dGxlcy5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzLmZpcmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdFtdLFxuXHRcdFx0J2F1eC1iYXIgcGFydCBtdXN0IG5vdCBiZSBoaWRkZW4gYnkgRDEwIHdoaWxlIHRoZXJlIGlzIG5vIGFjdGl2ZSBzZXNzaW9uJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEMTBdIGRvZXMgbm90IGhpZGUgdGhlIGF1eCBiYXIgZm9yIGEgd29ya3NwYWNlIHNlc3Npb24gd2l0aCB0cmFuc2llbnRseSBlbXB0eSBjb250YWluZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoeyBhY3RpdmVBdXhWaWV3Q29udGFpbmVySWRzOiBbXSB9KTtcblx0XHQvLyBBIHJlYWwgd29ya3NwYWNlIHNlc3Npb24gd2hvc2UgRmlsZXMvQ2hhbmdlcyBjb250ZXh0IGtleXMgaGF2ZSBub3Qgc2V0dGxlZFxuXHRcdC8vIHlldCAoY29udGFpbmVycyB0cmFuc2llbnRseSBpbmFjdGl2ZSkuIEQxMCBtdXN0IG5vdCBjb2xsYXBzZSBpdHMgc2lkZSBwYW5lLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOndzJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZUFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5maXJlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSksXG5cdFx0XHRbXSxcblx0XHRcdCdhdXgtYmFyIHBhcnQgbXVzdCBub3QgYmUgaGlkZGVuIGJ5IEQxMCBmb3IgYSB3b3Jrc3BhY2Ugc2Vzc2lvbiB3aXRoIHRyYW5zaWVudGx5IGVtcHR5IGNvbnRhaW5lcnMnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0QxMF0gbmV2ZXIgcmV2ZWFscyBhbiBlbXB0eSBhdXgtYmFyIHBhcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcih7IGFjdGl2ZUF1eFZpZXdDb250YWluZXJJZHM6IFtdIH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOnFjJyksIHsgaXNRdWlja0NoYXQ6IHRydWUgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzLmZpcmUoKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdCFoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gZmFsc2UpLFxuXHRcdFx0J2F1eC1iYXIgcGFydCBzaG91bGQgbmV2ZXIgYmUgcmV2ZWFsZWQgd2hlbiBpdCBoYXMgbm8gYWN0aXZlIHZpZXcgY29udGFpbmVycydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDEwXSByZS1oaWRlcyB0aGUgYXV4LWJhciBwYXJ0IGlmIGEgc3dpdGNoIHRvIGEgcXVpY2sgY2hhdCBsZWZ0IGl0IHZpc2libGUgd2l0aCBubyBjb250YWluZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoeyBhY3RpdmVBdXhWaWV3Q29udGFpbmVySWRzOiBbXSB9KTtcblx0XHQvLyBNaXJyb3IgYSBzd2l0Y2ggdG8gYSB3b3Jrc3BhY2UtbGVzcyBxdWljayBjaGF0IHdoZXJlIEQzYSByZXR1cm5lZCBlYXJseVxuXHRcdC8vIChubyB3b3Jrc3BhY2UpIGFuZCBsZWZ0IGEgcHJldmlvdXNseS12aXNpYmxlIGF1eCBiYXIgc2hvd2luZy5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpxYycpLCB7IGlzUXVpY2tDaGF0OiB0cnVlIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlVmlld0NvbnRhaW5lclZpc2liaWxpdHkuZmlyZSh7IGlkOiBDSEFOR0VTX1ZJRVdfQ09OVEFJTkVSX0lELCB2aXNpYmxlOiBmYWxzZSwgbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIgfSk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSksXG5cdFx0XHQnYXV4LWJhciBwYXJ0IHNob3VsZCBiZSBoaWRkZW4gcmVhY3RpdmVseSB3aGVuIGEgcXVpY2sgY2hhdCBoYXMgbm8gYWN0aXZlIHZpZXcgY29udGFpbmVycydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDEwXSBsZWF2ZXMgdGhlIGF1eC1iYXIgcGFydCBhbG9uZSB3aGVuIGl0IGhhcyBhY3RpdmUgdmlldyBjb250YWluZXJzJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdC8vIENoYW5nZXMgKyBGaWxlcyBzdGlsbCBhY3RpdmUgKGRlZmF1bHQpIFx1MjAxNCB0aGUgcmVhY3RpdmUgc3luYyBtdXN0IG5vdCB0b3VjaCB0aGUgcGFydC5cblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzLmZpcmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHRcdFtdLFxuXHRcdFx0J2F1eC1iYXIgcGFydCBzaG91bGQgYmUgbGVmdCBhcy1pcyB3aGlsZSBpdCBoYXMgYWN0aXZlIHZpZXcgY29udGFpbmVycydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDEwXSBoaWRlcyB0aGUgYXV4LWJhciBwYXJ0IHdoZW4gYSBxdWljayBjaGF0IGJlY29tZXMgdmlzaWJsZSB3aXRoIG5vIGFjdGl2ZSBjb250YWluZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoeyBhY3RpdmVBdXhWaWV3Q29udGFpbmVySWRzOiBbXSB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpxYycpLCB7IGlzUXVpY2tDaGF0OiB0cnVlIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHQvLyBUaGUgcGFydCBiZWNhbWUgdmlzaWJsZSAoZS5nLiBhIGJhcmUgZGV0YWlsIHRvZ2dsZSB0aGF0IHNob3dzIHRoZSBjb2x1bW5cblx0XHQvLyBiZWZvcmUgYW55IGNvbnRhaW5lciBpcyBvcGVuZWQpIHdpdGhvdXQgYW55IGNvbnRhaW5lci0vZGVzY3JpcHRvci1jaGFuZ2Vcblx0XHQvLyBzaWduYWwgZmlyaW5nLiBGb3IgYSBxdWljayBjaGF0IEQxMCBtdXN0IHN0aWxsIHJlY29uY2lsZSB0aGUgZW1wdHkgY29sdW1uXG5cdFx0Ly8gYXdheSBzbyB0aGUgdG9nZ2xlL2NvbnRleHQga2V5IG5ldmVyIHJlYWRzIFwib25cIiBvdmVyIGEgYmxhbmsgcGFuZWwuXG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IHRydWUpLFxuXHRcdFx0J2F1eC1iYXIgcGFydCBzaG91bGQgaGlkZSB3aGVuIGEgcXVpY2sgY2hhdCBiZWNvbWVzIHZpc2libGUgd2l0aCBubyBhY3RpdmUgdmlldyBjb250YWluZXJzJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEMTBdIGxlYXZlcyB0aGUgYXV4LWJhciBwYXJ0IHZpc2libGUgd2hlbiBpdCBiZWNvbWVzIHZpc2libGUgd2l0aCBhY3RpdmUgY29udGFpbmVycycsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0XHRbXSxcblx0XHRcdCdhdXgtYmFyIHBhcnQgc2hvdWxkIHN0YXkgdmlzaWJsZSB3aGVuIGl0IGJlY29tZXMgdmlzaWJsZSB3aXRoIGFjdGl2ZSB2aWV3IGNvbnRhaW5lcnMnXG5cdFx0KTtcblx0fSk7XG5cblx0Ly8gLS0tIFtEMTBdIFRvZ2dsZSBTaWRlIFBhbmVsIHdpdGggYW4gZW1wdHkgYXV4IGJhciAtLS1cblxuXHR0ZXN0KCdbRDEwXSB0b2dnbGluZyB0aGUgc2lkZSBwYW5lIHdpdGggbm8gYXV4IGNvbnRhaW5lcnMgcmV2ZWFscyB0aGUgZWRpdG9yLCBub3QgYW4gZW1wdHkgYXV4IGJhcicsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih7IGFjdGl2ZUF1eFZpZXdDb250YWluZXJJZHM6IFtdIH0pO1xuXHRcdC8vIFNpZGUgcGFuZSBmdWxseSBjbG9zZWQ7IGVkaXRvcnMgZXhpc3QgYnV0IG5vIGF1eCB2aWV3IGNvbnRhaW5lcnMuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3MuZWRpdG9yR3JvdXBzSGF2ZUNvbnRlbnQgPSB0cnVlO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRjb250cm9sbGVyLnRvZ2dsZVNpZGVQYW5lKCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCAmJiBjLmhpZGRlbiA9PT0gZmFsc2UpLFxuXHRcdFx0J3RvZ2dsZSBzaG91bGQgcmV2ZWFsIHRoZSBlZGl0b3IgcGFydCdcblx0XHQpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdCFoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gZmFsc2UpLFxuXHRcdFx0J3RvZ2dsZSBzaG91bGQgbmV2ZXIgcmV2ZWFsIGFuIGVtcHR5IGF1eCBiYXInXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0QxMF0gdG9nZ2xpbmcgdGhlIHNpZGUgcGFuZSB3aXRoIG5laXRoZXIgZWRpdG9ycyBub3IgYXV4IGNvbnRhaW5lcnMgcmV2ZWFscyBub3RoaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHsgYWN0aXZlQXV4Vmlld0NvbnRhaW5lcklkczogW10gfSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3MuZWRpdG9yR3JvdXBzSGF2ZUNvbnRlbnQgPSBmYWxzZTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0Y29udHJvbGxlci50b2dnbGVTaWRlUGFuZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjID0+IGMuaGlkZGVuID09PSBmYWxzZSksXG5cdFx0XHRbXSxcblx0XHRcdCd0b2dnbGUgc2hvdWxkIHJldmVhbCBub3RoaW5nIHdoZW4gdGhlcmUgaXMgbm8gY29udGVudCBvbiBlaXRoZXIgc2lkZSdcblx0XHQpO1xuXHR9KTtcblxuXHQvLyAtLS0gU2luZ2xlLXBhbmUgbWFuYWdlZCBkb2NrZWQgdGFicyAoQ2hhbmdlcyArIEZpbGVzIHBsYWNlaG9sZGVyKSAtLS1cblxuXHRhc3luYyBmdW5jdGlvbiBzZXR0bGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA2OyBpKyspIHtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gaGFzRmlsZXNUYWIoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNvbWUoZSA9PiBlIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gaGFzQ2hhbmdlc1RhYigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc29tZShlID0+ICEoZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSAmJiBlLnJlc291cmNlICE9PSB1bmRlZmluZWQpO1xuXHR9XG5cblx0dGVzdCgnW21hbmFnZWQgdGFic10gZW5zdXJlcyB0aGUgQ2hhbmdlcyBhbmQgRmlsZXMgdGFicyBmb3IgYSBjcmVhdGVkIHNlc3Npb24gdW5kZXIgc3VwcHJlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaGFzQ2hhbmdlc1RhYjogaGFzQ2hhbmdlc1RhYigpLCBoYXNGaWxlc1RhYjogaGFzRmlsZXNUYWIoKSB9LCB7IGhhc0NoYW5nZXNUYWI6IHRydWUsIGhhc0ZpbGVzVGFiOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gQ2hhbmdlcyBwaWxsXSByZXZlYWxzIHRoZSBlZGl0b3IgYXJlYSBiZWZvcmUgb3BlbmluZyB0aGUgbWFuYWdlZCBDaGFuZ2VzIGVkaXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdGNvbnN0IGhhbmRsZXIgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3dvcmtiZW5jaC5hZ2VudFNlc3Npb25zLmFjdGlvbi52aWV3Q2hhbmdlcycpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyLCAnQ2hhbmdlcyBwaWxsIGNvbW1hbmQgc2hvdWxkIGJlIHJlZ2lzdGVyZWQnKTtcblxuXHRcdGF3YWl0IGhhbmRsZXIoaGFybmVzcy5pbnN0YVNlcnZpY2UsIHNlc3Npb24pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JSZXZlYWxlZDogaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgJiYgYy5oaWRkZW4gPT09IGZhbHNlKSxcblx0XHRcdGhhc0NoYW5nZXNUYWI6IGhhc0NoYW5nZXNUYWIoKSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JSZXZlYWxlZDogdHJ1ZSxcblx0XHRcdGhhc0NoYW5nZXNUYWI6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBTY2VuYXJpbyA5XSBzaG93cyB0aGUgQ2hhbmdlcyBhbmQgRmlsZXMgdGFicyBmb3IgYSBuZXctc2Vzc2lvbiB2aWV3JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpuZXcnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhhc0NoYW5nZXNUYWI6IGhhc0NoYW5nZXNUYWIoKSxcblx0XHRcdGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpLFxuXHRcdFx0Y2hhbmdlc1RhYk1pc3Npbmc6IGhhcm5lc3MuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKFNpbmdsZVBhbmVDaGFuZ2VzVGFiTWlzc2luZ0NvbnRleHQua2V5KSxcblx0XHR9LCB7XG5cdFx0XHRoYXNDaGFuZ2VzVGFiOiB0cnVlLFxuXHRcdFx0aGFzRmlsZXNUYWI6IHRydWUsXG5cdFx0XHRjaGFuZ2VzVGFiTWlzc2luZzogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBuZXcgc2Vzc2lvbl0gcmUtZW5zdXJlcyBDaGFuZ2VzIGFmdGVyIGEgZGVsYXllZCBkaWZmZXJlbnQtZm9sZGVyIHJlc3RvcmUgcmV0YWlucyBGaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmNyZWF0ZWQnKSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGhhc0NoYW5nZXNUYWI6IGhhc0NoYW5nZXNUYWIoKSwgaGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCkgfSwgeyBoYXNDaGFuZ2VzVGFiOiB0cnVlLCBoYXNGaWxlc1RhYjogdHJ1ZSB9KTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogZmFsc2UsIGhhc0ZpbGVzVGFiOiB0cnVlIH0pO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246bmV3JyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IHRydWUgfSk7XG5cblx0XHQvLyBBIGRpZmZlcmVudCBkZWZhdWx0IGZvbGRlciBkZWxheXMgdGhpcyByZXN0b3JlIHVudGlsIGFmdGVyIHRoZSBkcmFmdCByZWNvbmNpbGUuXG5cdFx0Y29uc3QgZmlsZXNUYWIgPSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5maW5kKGVkaXRvciA9PiBlZGl0b3IgaW5zdGFuY2VvZiBFbXB0eUZpbGVFZGl0b3JJbnB1dCk7XG5cdFx0YXNzZXJ0Lm9rKGZpbGVzVGFiKTtcblx0XHRjb250cm9sbGVyLnJ1bldpdGhSZXN0b3JlKCgpID0+IHtcblx0XHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZSgwLCBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5sZW5ndGgsIGZpbGVzVGFiKTtcblx0XHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBmaWxlc1RhYjtcblx0XHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHR9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBzdWJtaXRdIG9wZW5zIHRoZSBDaGFuZ2VzIHRhYiB3aGVuIGEgbmV3IHNlc3Npb24gaXMgc3VibWl0dGVkIChncm91cCBhbHJlYWR5IGhhcyB0aGUgRmlsZXMgdGFiKScsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpuZXcnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IHRydWUgfSk7XG5cblx0XHQvLyBTdWJtaXQgZnJvbSB0aGUgRmlsZXMgdGFiOiB0aGUgZXhpc3RpbmcgQ2hhbmdlcyB0YWIgYmVjb21lcyBhY3RpdmUuXG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dCA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmQoZSA9PiBlIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdChzZXNzaW9uLmlzQ3JlYXRlZCBhcyBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+KS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdC8vIFRoZSBDaGFuZ2VzIHRhYiBpcyBub3QganVzdCBwcmVzZW50IFx1MjAxNCBpdCBpcyBvcGVuZWQgYXMgdGhlIGFjdGl2ZSBlZGl0b3Jcblx0XHQvLyAoc28gdGhlIGRldGFpbCBwYW5lbCBtYXBzIHRvIENoYW5nZXMgcmF0aGVyIHRoYW4gdGhlIEZpbGVzIHBsYWNlaG9sZGVyKS5cblx0XHRjb25zdCBjaGFuZ2VzUmVzb3VyY2UgPSBoYXJuZXNzLnNlc3Npb25DaGFuZ2VzU2VydmljZS5nZXRDaGFuZ2VzRWRpdG9yUmVzb3VyY2Uoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksXG5cdFx0XHRoYXNGaWxlc1RhYjogaGFzRmlsZXNUYWIoKSxcblx0XHRcdGNoYW5nZXNBY3RpdmU6ICEhaGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dD8ucmVzb3VyY2UgJiYgaXNFcXVhbChoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0LnJlc291cmNlLCBjaGFuZ2VzUmVzb3VyY2UpLFxuXHRcdH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IHRydWUsIGNoYW5nZXNBY3RpdmU6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBzdWJtaXRdIG9wZW5zIHRoZSBDaGFuZ2VzIHRhYiBvbiBhIHJlc291cmNlLXJlcGxhY2Ugc3VibWl0IChhZ2VudC1ob3N0IHBhdGgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHQvLyBOZXctc2Vzc2lvbiBkcmFmdCBhY3RpdmU6IGJvdGggbWFuYWdlZCB0YWJzIGFyZSBwcmVzZW50LlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmRyYWZ0JyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IHRydWUgfSk7XG5cblx0XHQvLyBUaGUgcHJvdmlkZXIgY29tbWl0cyB0aGUgZHJhZnQgYnkgcmVwbGFjaW5nIGl0IHdpdGggYSBuZXcgY3JlYXRlZCByZXNvdXJjZS5cblx0XHRjb25zdCBjb21taXR0ZWQgPSBVUkkucGFyc2UoJ3Nlc3Npb246Y29tbWl0dGVkJyk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihjb21taXR0ZWQsIHsgaXNDcmVhdGVkOiB0cnVlIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3QgY2hhbmdlc1Jlc291cmNlID0gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKGNvbW1pdHRlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksXG5cdFx0XHRoYXNGaWxlc1RhYjogaGFzRmlsZXNUYWIoKSxcblx0XHRcdGNoYW5nZXNBY3RpdmU6ICEhaGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dD8ucmVzb3VyY2UgJiYgaXNFcXVhbChoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0LnJlc291cmNlLCBjaGFuZ2VzUmVzb3VyY2UpLFxuXHRcdH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IHRydWUsIGNoYW5nZXNBY3RpdmU6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBzZXNzaW9uIHN3aXRjaF0gZG9lcyBub3QgbGVhayBhIHN1cGVyc2VkZWQgc3VibWl0XFwncyBcImFjdGl2YXRlIENoYW5nZXNcIiBpbnRlbnQgb250byB0aGUgc3dpdGNoZWQtdG8gc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Ly8gU2Vzc2lvbiBBIGlzIGEgbmV3LXNlc3Npb24gZHJhZnQgd2l0aCBib3RoIG1hbmFnZWQgdGFicy5cblx0XHRjb25zdCBzZXNzaW9uQSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjphJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbkEsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGhhc0NoYW5nZXNUYWI6IGhhc0NoYW5nZXNUYWIoKSwgaGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCkgfSwgeyBoYXNDaGFuZ2VzVGFiOiB0cnVlLCBoYXNGaWxlc1RhYjogdHJ1ZSB9KTtcblxuXHRcdC8vIFBhdXNlIHRoZSB2ZXJ5IG5leHQgQ2hhbmdlcyBvcGVuIHNvIEEncyBzdWJtaXQgcmVjb25jaWxlIHN0YWxscyBtaWQtb3Blbi5cblx0XHRsZXQgcmVsZWFzZUNoYW5nZXNPcGVuITogKCkgPT4gdm9pZDtcblx0XHRjb25zdCBjaGFuZ2VzT3BlbkdhdGUgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHsgcmVsZWFzZUNoYW5nZXNPcGVuID0gcmVzb2x2ZTsgfSk7XG5cdFx0bGV0IGdhdGVBcm1lZCA9IHRydWU7XG5cdFx0aGFybmVzcy5vbk9wZW5DaGFuZ2VzRWRpdG9yID0gKCkgPT4ge1xuXHRcdFx0aWYgKGdhdGVBcm1lZCkge1xuXHRcdFx0XHRnYXRlQXJtZWQgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuIGNoYW5nZXNPcGVuR2F0ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblxuXHRcdC8vIFN1Ym1pdCBBOiB0aGlzIHF1ZXVlcyBhIHJlY29uY2lsZSB0aGF0IG9wZW5zIHRoZSBDaGFuZ2VzIHRhYiAqYWN0aXZlKjsgaXRcblx0XHQvLyBzdGFsbHMgYXdhaXRpbmcgdGhlIGdhdGVkIG9wZW4uXG5cdFx0KHNlc3Npb25BLmlzQ3JlYXRlZCBhcyBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+KS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRjb25zdCBhQWN0aXZlQ2FsbHMgPSBoYXJuZXNzLm9wZW5DaGFuZ2VzRWRpdG9yQ2FsbHMuZmlsdGVyKGMgPT4gaXNFcXVhbChjLnNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvbkEucmVzb3VyY2UpICYmIGMuYWN0aXZlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYUFjdGl2ZUNhbGxzLmxlbmd0aCwgMSwgJ0FcXCdzIHN1Ym1pdCBzaG91bGQgb3BlbiBpdHMgQ2hhbmdlcyB0YWIgYWN0aXZlIChhbmQgc3RhbGwgb24gdGhlIGdhdGUpJyk7XG5cblx0XHQvLyBXaGlsZSBBXFwncyBzdWJtaXQgcmVjb25jaWxlIGlzIHN0YWxsZWQsIHN3aXRjaCB0byBhIGRpZmZlcmVudCBjcmVhdGVkXG5cdFx0Ly8gc2Vzc2lvbiBCIChhIHBsYWluIHN3aXRjaCBcdTIwMTQgbmV2ZXIgYSBzdWJtaXQpLlxuXHRcdGNvbnN0IHNlc3Npb25CID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmInKSwgeyBpc0NyZWF0ZWQ6IHRydWUgfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uQiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdC8vIFJlbGVhc2UgdGhlIGdhdGU6IEFcXCdzIHJlY29uY2lsZSByZXN1bWVzLCBmaW5kcyBpdHNlbGYgc3VwZXJzZWRlZCwgYW5kIG11c3Rcblx0XHQvLyBOT1QgaGFuZCBpdHMgXCJhY3RpdmF0ZSBDaGFuZ2VzXCIgaW50ZW50IHRvIEIuXG5cdFx0cmVsZWFzZUNoYW5nZXNPcGVuKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHQvLyBCLCBiZWluZyBhIHBsYWluIHN3aXRjaCwgbXVzdCBuZXZlciBoYXZlIGl0cyBDaGFuZ2VzIHRhYiBvcGVuZWQgKmFjdGl2ZSouXG5cdFx0Y29uc3QgYkFjdGl2ZUNhbGxzID0gaGFybmVzcy5vcGVuQ2hhbmdlc0VkaXRvckNhbGxzLmZpbHRlcihjID0+IGlzRXF1YWwoYy5zZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25CLnJlc291cmNlKSAmJiBjLmFjdGl2ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGJDaGFuZ2VzT3BlbmVkQWN0aXZlOiBiQWN0aXZlQ2FsbHMubGVuZ3RoIH0sIHsgYkNoYW5nZXNPcGVuZWRBY3RpdmU6IDAgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBkZXRhaWxzLW9ubHldIGEgZGV0YWlscy1vbmx5IHJldmVhbCByZXN0b3JlcyB0aGUgZG9ja2VkIGlucHV0cyBldmVuIHdoZW4gb25lIHdhcyBjbG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSwgaW5pdGlhbFBhcnRWaXNpYmlsaXR5OiBuZXcgTWFwKFtbUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlXSwgW1BhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlXV0pIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaGFzQ2hhbmdlc1RhYjogaGFzQ2hhbmdlc1RhYigpLCBoYXNGaWxlc1RhYjogaGFzRmlsZXNUYWIoKSB9LCB7IGhhc0NoYW5nZXNUYWI6IHRydWUsIGhhc0ZpbGVzVGFiOiB0cnVlIH0pO1xuXG5cdFx0Ly8gVXNlciBjbG9zZXMgdGhlIEZpbGVzIHRhYjsgdGhlIENoYW5nZXMgdGFiIHJlbWFpbnMgKGdyb3VwIG5vbi1lbXB0eSkuXG5cdFx0Y29uc3QgZmlsZVRhYiA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmQoZSA9PiBlIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQpITtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihmaWxlVGFiKSwgMSk7XG5cdFx0aGFybmVzcy5vbkRpZENsb3NlRWRpdG9yLmZpcmUoeyBlZGl0b3I6IGZpbGVUYWIgfSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNGaWxlc1RhYigpLCBmYWxzZSk7XG5cblx0XHQvLyBDbG9zZSB0aGUgc2lkZSBwYW5lLCB0aGVuIHJlb3BlbiBpdCBkZXRhaWxzLW9ubHkgKGF1eCBvbmx5LCBlZGl0b3IgaGlkZGVuKS5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRoYXJuZXNzLm9uRGlkUmV2ZWFsU2lkZVBhbmUuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Ly8gVGhlIGRldGFpbHMtb25seSByZXZlYWwgYWx3YXlzIHNob3dzIHRoZSBkb2NrZWQgaW5wdXRzLCBzbyBGaWxlcyByZXR1cm5zLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBkZXRhaWxzLW9ubHldIGFuIGVkaXRvciByZXZlYWwgZG9lcyBOT1QgZm9yY2UgYmFjayBhIGNsb3NlZCBtYW5hZ2VkIHRhYicsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdC8vIFVzZXIgY2xvc2VzIHRoZSBGaWxlcyB0YWI7IHRoZSBDaGFuZ2VzIHRhYiByZW1haW5zLlxuXHRcdGNvbnN0IGZpbGVUYWIgPSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5maW5kKGUgPT4gZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSE7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmluZGV4T2YoZmlsZVRhYiksIDEpO1xuXHRcdGhhcm5lc3Mub25EaWRDbG9zZUVkaXRvci5maXJlKHsgZWRpdG9yOiBmaWxlVGFiIH0pO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRmlsZXNUYWIoKSwgZmFsc2UpO1xuXG5cdFx0Ly8gUmVvcGVuIHRoZSBzaWRlIHBhbmUgd2l0aCB0aGUgZWRpdG9yIGFyZWEgdmlzaWJsZSAobm90IGRldGFpbHMtb25seSk6IHRoZVxuXHRcdC8vIGNsb3NlIGlzIHJlc3BlY3RlZCwgc28gRmlsZXMgaXMgbm90IGZvcmNlZCBiYWNrLlxuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9KTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGhhcm5lc3Mub25EaWRSZXZlYWxTaWRlUGFuZS5maXJlKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaGFzQ2hhbmdlc1RhYjogaGFzQ2hhbmdlc1RhYigpLCBoYXNGaWxlc1RhYjogaGFzRmlsZXNUYWIoKSB9LCB7IGhhc0NoYW5nZXNUYWI6IHRydWUsIGhhc0ZpbGVzVGFiOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnW21hbmFnZWQgdGFicyAvIG5ldyBzZXNzaW9uXSByZS1vcGVucyBib3RoIG1hbmFnZWQgdGFicyB3aGVuIGEgd29ya2luZy1zZXQgYXBwbHkgZW1wdGllcyB0aGUgZ3JvdXAgZHVyaW5nIHRoZSBzd2l0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHQvLyBBIGNyZWF0ZWQgc2Vzc2lvbiB3aXRoIGl0cyBkb2NrZWQgdGFicy5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpjcmVhdGVkJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IHRydWUgfSk7XG5cblx0XHQvLyBTd2l0Y2ggdG8gYSBuZXcgKHVuY3JlYXRlZCkgc2Vzc2lvbi4gSXRzIGVtcHR5IHdvcmtpbmcgc2V0IGNsb3NlcyB0aGVcblx0XHQvLyBwcmV2aW91cyBzZXNzaW9uJ3MgZG9ja2VkIHRhYnMsIGVtcHR5aW5nIHRoZSBncm91cCBcdTIwMTQgdGhpcyBoYXBwZW5zIHVuZGVyIGFcblx0XHQvLyBsYXlvdXQgcmVzdG9yZSwgbm90IGEgdXNlciBjbG9zZS5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpuZXcnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSksIHVuZGVmaW5lZCk7XG5cdFx0Y29udHJvbGxlci5ydW5XaXRoUmVzdG9yZSgoKSA9PiB7XG5cdFx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoMCwgaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMubGVuZ3RoKTtcblx0XHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHR9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdC8vIEJvdGggbWFuYWdlZCB0YWJzIG11c3QgYmUgcmVzdG9yZWQgZm9yIHRoZSB1bmNyZWF0ZWQgc2Vzc2lvbi5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaGFzQ2hhbmdlc1RhYjogaGFzQ2hhbmdlc1RhYigpLCBoYXNGaWxlc1RhYjogaGFzRmlsZXNUYWIoKSB9LCB7IGhhc0NoYW5nZXNUYWI6IHRydWUsIGhhc0ZpbGVzVGFiOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gbmV3IHNlc3Npb25dIHJlLW9wZW5zIGJvdGggbWFuYWdlZCB0YWJzIG9uIHJlc3RvcmUtZW5kIGV2ZW4gaWYgbm8gZWRpdG9yLWNoYW5nZSBmaXJlcyBkdXJpbmcgdGhlIHJlc3RvcmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpjcmVhdGVkJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IHRydWUgfSk7XG5cblx0XHQvLyBTd2l0Y2ggdG8gYSBuZXcgKHVuY3JlYXRlZCkgc2Vzc2lvbjsgdGhlIHdvcmtpbmctc2V0IGFwcGx5IGVtcHRpZXMgdGhlXG5cdFx0Ly8gZ3JvdXAgZHVyaW5nIHRoZSByZXN0b3JlIGJ1dCB0aGUgdHJhbnNpZW50IGVkaXRvci1jaGFuZ2UgaXMgTk9UIG9ic2VydmVkXG5cdFx0Ly8gKGl0IHJhY2VzIHRoZSBhc3luYyBjbG9zZSkuIE9ubHkgdGhlIHNldHRsZWQgcmVzdG9yZS1lbmQgbXVzdCByZS1vcGVuIHRoZVxuXHRcdC8vIG1hbmFnZWQgdGFicy5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpuZXcnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSksIHVuZGVmaW5lZCk7XG5cdFx0Y29udHJvbGxlci5ydW5XaXRoUmVzdG9yZSgoKSA9PiB7XG5cdFx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoMCwgaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMubGVuZ3RoKTtcblx0XHR9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBTY2VuYXJpbyA5XSByZW1vdmVzIHRoZSBGaWxlcyB0YWIgd2hpbGUgYSByZWFsIGVkaXRvciBpcyBvcGVuIGFuZCBkb2VzIG5vdCByZS1hZGQgaXQgd2hlbiB0aGF0IGZpbGUgY2xvc2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNGaWxlc1RhYigpLCB0cnVlKTtcblxuXHRcdC8vIEEgcmVhbCBmaWxlIG9wZW5zIGludG8gYSB2aXNpYmxlIGVkaXRvciBhcmVhLiBQcm9kdWN0aW9uIGZpcmVzXG5cdFx0Ly8gb25XaWxsT3BlbkVkaXRvciAqYmVmb3JlKiB0aGUgZWRpdG9yIGlzIGFkZGVkIHRvIHRoZSBncm91cC5cblx0XHRjb25zdCByZWFsRWRpdG9yID0gc3RvcmUuYWRkKG5ldyBUZXN0U3R1YkVkaXRvcklucHV0KFVSSS5maWxlKCcvcmVwby9hLnRzJykpKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0b3BlbkVkaXRvcihyZWFsRWRpdG9yKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5wdXNoKHJlYWxFZGl0b3IpO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRjb25zdCBmaWxlc1JlbW92ZWQgPSAhaGFzRmlsZXNUYWIoKTtcblxuXHRcdC8vIENsb3NpbmcgdGhlIGZpbGUgbGVhdmVzIHRoZSBDaGFuZ2VzIHRhYiAoZ3JvdXAgbm9uLWVtcHR5KSwgc28gdGhlIEZpbGVzXG5cdFx0Ly8gcGxhY2Vob2xkZXIgaXMgTk9UIHJlLWFkZGVkIFx1MjAxNCB0aGUgZGVmYXVsdHMgcmV0dXJuIG9ubHkgd2hlbiB0aGUgZ3JvdXBcblx0XHQvLyBlbXB0aWVzIGFuZCB0aGUgc2lkZSBwYW5lIGlzIHJlb3BlbmVkLlxuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZShoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5pbmRleE9mKHJlYWxFZGl0b3IpLCAxKTtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpbGVzUmVtb3ZlZCxcblx0XHRcdGZpbGVzUmVhZGRlZDogaGFzRmlsZXNUYWIoKSxcblx0XHR9LCB7XG5cdFx0XHRmaWxlc1JlbW92ZWQ6IHRydWUsXG5cdFx0XHRmaWxlc1JlYWRkZWQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gU2NlbmFyaW8gOV0ga2VlcHMgYSBGaWxlcyB0YWIgdGhlIHVzZXIgYWRkcyB2aWEgYCtgIHdoaWxlIGEgcmVhbCBmaWxlIGlzIG9wZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHQvLyBBIHJlYWwgZmlsZSBvcGVucyBhbmQgdGlkaWVzIGF3YXkgdGhlIGF1dG8gRmlsZXMgcGxhY2Vob2xkZXIuIFByb2R1Y3Rpb25cblx0XHQvLyBmaXJlcyBvbldpbGxPcGVuRWRpdG9yICpiZWZvcmUqIHRoZSBlZGl0b3IgaXMgYWRkZWQgdG8gdGhlIGdyb3VwLlxuXHRcdGNvbnN0IHJlYWxFZGl0b3IgPSBzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQoVVJJLmZpbGUoJy9yZXBvL2EudHMnKSkpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRvcGVuRWRpdG9yKHJlYWxFZGl0b3IpO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnB1c2gocmVhbEVkaXRvcik7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNGaWxlc1RhYigpLCBmYWxzZSk7XG5cblx0XHQvLyBUaGUgdXNlciBleHBsaWNpdGx5IGFkZHMgdGhlIEZpbGVzIHRhYiB2aWEgYCtgIChvcGVucyBhbiBFbXB0eUZpbGVFZGl0b3JJbnB1dCkuXG5cdFx0Y29uc3QgdXNlckZpbGVzVGFiID0gc3RvcmUuYWRkKG5ldyBFbXB0eUZpbGVFZGl0b3JJbnB1dCgpKTtcblx0XHRvcGVuRWRpdG9yKHVzZXJGaWxlc1RhYik7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMucHVzaCh1c2VyRmlsZXNUYWIpO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdC8vIEl0IG11c3QgTk9UIGJlIHRpZGllZCBhd2F5IFx1MjAxNCB0aGUgYCtgIGFkZCBpcyBub3QgYSByZWFsLWZpbGUgb3Blbi5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRmlsZXNUYWIoKSwgdHJ1ZSwgJ2EgdXNlci1hZGRlZCBGaWxlcyB0YWIgc3RheXMgd2hpbGUgYSByZWFsIGZpbGUgaXMgb3BlbicpO1xuXG5cdFx0Ly8gUmUtYWN0aXZhdGluZyB0aGUgYWxyZWFkeS1vcGVuIHJlYWwgZmlsZSAoZS5nLiBzZWxlY3RpbmcgaXRzIHRhYikgZmlyZXNcblx0XHQvLyBvbldpbGxPcGVuRWRpdG9yIHdoaWxlIGl0IGlzIHN0aWxsIGluIHRoZSBncm91cDsgdGhlIGd1YXJkIG11c3QgdHJlYXQgdGhpc1xuXHRcdC8vIGFzIGFuIGFjdGl2YXRpb24sIG5vdCBhIG5ldyBvcGVuLCBzbyB0aGUgdXNlci1hZGRlZCBGaWxlcyB0YWIgc3Vydml2ZXMuXG5cdFx0b3BlbkVkaXRvcihyZWFsRWRpdG9yKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRmlsZXNUYWIoKSwgdHJ1ZSwgJ3JlLWFjdGl2YXRpbmcgYW4gb3BlbiBmaWxlIG11c3Qgbm90IHRpZHkgdGhlIHVzZXItYWRkZWQgRmlsZXMgdGFiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBTY2VuYXJpbyA5XSBrZWVwcyB0aGUgRmlsZXMgdGFiIHdoZW4gYSBub24tZmlsZSBlZGl0b3IgKGUuZy4gdGhlIGJyb3dzZXIpIG9wZW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNGaWxlc1RhYigpLCB0cnVlKTtcblxuXHRcdC8vIEEgbm9uLWZpbGUgZWRpdG9yICh0aGUgaW50ZWdyYXRlZCBicm93c2VyIHVzZXMgdGhlIGJyb3dzZXJWaWV3IHNjaGVtZSkgb3BlbnNcblx0XHQvLyBpbnRvIGEgdmlzaWJsZSBlZGl0b3IgYXJlYS4gSXQgbXVzdCBOT1QgY29sbGFwc2UgdGhlIEZpbGVzIHBsYWNlaG9sZGVyLlxuXHRcdGNvbnN0IGJyb3dzZXJFZGl0b3IgPSBzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdicm93c2VyVmlldzovL2hvc3QvcGFnZScpKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMucHVzaChicm93c2VyRWRpdG9yKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0b3BlbkVkaXRvcihicm93c2VyRWRpdG9yKTtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRmlsZXNUYWIoKSwgdHJ1ZSwgJ2Egbm9uLWZpbGUgZWRpdG9yIG11c3Qgbm90IHJlbW92ZSB0aGUgRmlsZXMgdGFiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gY2xvc2VzIG5vbi1tYW5hZ2VkIHRhYnMgd2hlbiB0aGUgZWRpdG9yIGFyZWEgaGlkZXMgYW5kIHJlb3BlbnMgdGhlbSB3aGVuIHNob3duJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Ly8gQSByZWFsIGZpbGUgb3BlbnMgYmV0d2VlbiB0aGUgbWFuYWdlZCB0YWJzIHdoaWxlIHRoZSBlZGl0b3IgYXJlYSBpcyB2aXNpYmxlLlxuXHRcdGNvbnN0IGZpbGVSZXNvdXJjZSA9IFVSSS5maWxlKCcvcmVwby9hLnRzJyk7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKDEsIDAsIHN0b3JlLmFkZChuZXcgVGVzdFN0dWJFZGl0b3JJbnB1dChmaWxlUmVzb3VyY2UpKSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRjb25zdCBvcmlnaW5hbEluZGV4ID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmluZEluZGV4KGUgPT4gZS5yZXNvdXJjZSAmJiBpc0VxdWFsKGUucmVzb3VyY2UsIGZpbGVSZXNvdXJjZSkpO1xuXG5cdFx0Ly8gSGlkZSB0aGUgZWRpdG9yIGFyZWEgd2hpbGUgdGhlIGRldGFpbCAoYXV4IGJhcikgc3RheXMgb3BlbiBcdTIwMTQgYSBkZXRhaWwtb25seVxuXHRcdC8vIGNvbGxhcHNlLiBUaGUgcmVhbCBmaWxlIHRhYiBjbG9zZXMsIHRoZSBtYW5hZ2VkIEZpbGVzIHRhYiBzdGF5cy5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3QgY2xvc2VkRmlsZSA9IGhhcm5lc3MuY2xvc2VkRWRpdG9ycy5zb21lKGUgPT4gaXNFcXVhbChlLnJlc291cmNlISwgZmlsZVJlc291cmNlKSk7XG5cdFx0Y29uc3QgZmlsZXNUYWJLZXB0ID0gaGFzRmlsZXNUYWIoKTtcblx0XHRjb25zdCBmaWxlVGFiR29uZSA9ICFoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zb21lKGUgPT4gZS5yZXNvdXJjZSAmJiBpc0VxdWFsKGUucmVzb3VyY2UsIGZpbGVSZXNvdXJjZSkpO1xuXG5cdFx0Ly8gU2hvdyB0aGUgZWRpdG9yIGFyZWEgYWdhaW46IHRoZSBmaWxlIHRhYiBpcyByZW9wZW5lZCBhdCBpdHMgb3JpZ2luYWwgcG9zaXRpb24uXG5cdFx0aGFybmVzcy5vcGVuZWRFZGl0b3JzID0gW107XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2xvc2VkRmlsZSxcblx0XHRcdGZpbGVzVGFiS2VwdCxcblx0XHRcdGZpbGVUYWJHb25lLFxuXHRcdFx0cmVvcGVuZWRGaWxlOiBoYXJuZXNzLm9wZW5lZEVkaXRvcnMuc29tZShlID0+IGlzUmVzb3VyY2VFZGl0b3JJbnB1dChlKSAmJiBpc0VxdWFsKGUucmVzb3VyY2UsIGZpbGVSZXNvdXJjZSkpLFxuXHRcdFx0cmVzdG9yZWRBdE9yaWdpbmFsSW5kZXg6IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmRJbmRleChlID0+IGUucmVzb3VyY2UgJiYgaXNFcXVhbChlLnJlc291cmNlLCBmaWxlUmVzb3VyY2UpKSA9PT0gb3JpZ2luYWxJbmRleCxcblx0XHR9LCB7XG5cdFx0XHRjbG9zZWRGaWxlOiB0cnVlLFxuXHRcdFx0ZmlsZXNUYWJLZXB0OiB0cnVlLFxuXHRcdFx0ZmlsZVRhYkdvbmU6IHRydWUsXG5cdFx0XHRyZW9wZW5lZEZpbGU6IHRydWUsXG5cdFx0XHRyZXN0b3JlZEF0T3JpZ2luYWxJbmRleDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSBjbG9zZXMgYSBub24tcmVzdG9yYWJsZSBub24tZG9ja2VkIHRhYiAoZS5nLiB1bnRpdGxlZCBTZWFyY2gpIHdoZW4gdGhlIGVkaXRvciBhcmVhIGhpZGVzLCB3aXRob3V0IHJlc3RvcmluZyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdC8vIEEgZGlydHksIG5vbi1yZXN0b3JhYmxlIGVkaXRvciAobGlrZSBhbiB1bnRpdGxlZCBTZWFyY2ggZWRpdG9yKSBvcGVuc1xuXHRcdC8vIGJldHdlZW4gdGhlIG1hbmFnZWQgdGFicyB3aGlsZSB0aGUgZWRpdG9yIGFyZWEgaXMgdmlzaWJsZS5cblx0XHRjb25zdCBzZWFyY2hSZXNvdXJjZSA9IFVSSS5wYXJzZSgnc2VhcmNoLWVkaXRvcjovVW50aXRsZWQtMScpO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZSgxLCAwLCBzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQoc2VhcmNoUmVzb3VyY2UsIHsgZGlydHk6IHRydWUsIG5vblJlc3RvcmFibGU6IHRydWUgfSkpKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Ly8gSGlkZSB0aGUgZWRpdG9yIGFyZWEgd2hpbGUgdGhlIGRldGFpbCAoYXV4IGJhcikgc3RheXMgb3BlbiBcdTIwMTQgYSBkZXRhaWwtb25seVxuXHRcdC8vIGNvbGxhcHNlLiBUaGUgbm9uLWRvY2tlZCB0YWIgY2xvc2VzIGV2ZW4gdGhvdWdoIGl0IGlzIGRpcnR5IGFuZCBjYW5ub3QgYmVcblx0XHQvLyBjYXB0dXJlZDsgb25seSB0aGUgbWFuYWdlZCBGaWxlcyB0YWIgcmVtYWlucy5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3QgY2xvc2VkU2VhcmNoID0gaGFybmVzcy5jbG9zZWRFZGl0b3JzLnNvbWUoZSA9PiBpc0VxdWFsKGUucmVzb3VyY2UhLCBzZWFyY2hSZXNvdXJjZSkpO1xuXHRcdGNvbnN0IHNlYXJjaFRhYkdvbmUgPSAhaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc29tZShlID0+IGUucmVzb3VyY2UgJiYgaXNFcXVhbChlLnJlc291cmNlLCBzZWFyY2hSZXNvdXJjZSkpO1xuXG5cdFx0Ly8gU2hvdyB0aGUgZWRpdG9yIGFyZWEgYWdhaW46IHRoZSBub24tcmVzdG9yYWJsZSB0YWIgaXMgTk9UIHJlb3BlbmVkLlxuXHRcdGhhcm5lc3Mub3BlbmVkRWRpdG9ycyA9IFtdO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNsb3NlZFNlYXJjaCxcblx0XHRcdHNlYXJjaFRhYkdvbmUsXG5cdFx0XHRmaWxlc1RhYktlcHQ6IGhhc0ZpbGVzVGFiKCksXG5cdFx0XHRyZW9wZW5lZFNlYXJjaDogaGFybmVzcy5vcGVuZWRFZGl0b3JzLnNvbWUoZSA9PiBpc1Jlc291cmNlRWRpdG9ySW5wdXQoZSkgJiYgaXNFcXVhbChlLnJlc291cmNlLCBzZWFyY2hSZXNvdXJjZSkpLFxuXHRcdH0sIHtcblx0XHRcdGNsb3NlZFNlYXJjaDogdHJ1ZSxcblx0XHRcdHNlYXJjaFRhYkdvbmU6IHRydWUsXG5cdFx0XHRmaWxlc1RhYktlcHQ6IHRydWUsXG5cdFx0XHRyZW9wZW5lZFNlYXJjaDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gZG9lcyBOT1QgY2xvc2UgZWRpdG9ycyB3aGVuIHRoZSB3aG9sZSBzaWRlIHBhbmUgaXMgY2xvc2VkIChlZGl0b3IgKyBhdXggaGlkZGVuKScsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdC8vIEEgcmVhbCBmaWxlIGlzIG9wZW4gYmV0d2VlbiB0aGUgbWFuYWdlZCB0YWJzLCBib3RoIHBhcnRzIHZpc2libGUuXG5cdFx0Y29uc3QgZmlsZVJlc291cmNlID0gVVJJLmZpbGUoJy9yZXBvL2EudHMnKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoMSwgMCwgc3RvcmUuYWRkKG5ldyBUZXN0U3R1YkVkaXRvcklucHV0KGZpbGVSZXNvdXJjZSkpKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRoYXJuZXNzLmNsb3NlZEVkaXRvcnMgPSBbXTtcblxuXHRcdC8vIENsb3NlIHRoZSB3aG9sZSBzaWRlIHBhbmU6IHRoZSBhdXggYmFyIGlzIGhpZGRlbiBmaXJzdCwgdGhlbiB0aGUgZWRpdG9yXG5cdFx0Ly8gYXJlYSAobWF0Y2hpbmcgdG9nZ2xlU2lkZVBhbmUncyBvcmRlcikuIE5vIGVkaXRvcnMgbXVzdCBiZSBjbG9zZWQuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YW55RWRpdG9yQ2xvc2VkOiBoYXJuZXNzLmNsb3NlZEVkaXRvcnMubGVuZ3RoID4gMCxcblx0XHRcdGZpbGVTdGlsbFByZXNlbnQ6IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNvbWUoZSA9PiBlLnJlc291cmNlICYmIGlzRXF1YWwoZS5yZXNvdXJjZSwgZmlsZVJlc291cmNlKSksXG5cdFx0fSwge1xuXHRcdFx0YW55RWRpdG9yQ2xvc2VkOiBmYWxzZSxcblx0XHRcdGZpbGVTdGlsbFByZXNlbnQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBjbG9zZV0gZG9lcyBub3QgcmUtb3BlbiBhIG1hbmFnZWQgdGFiIGFmdGVyIHRoZSB1c2VyIGNsb3NlcyBpdCAoZ3JvdXAgc3RheXMgbm9uLWVtcHR5KScsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRjb25zdCBmaWxlVGFiID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmluZChlID0+IGUgaW5zdGFuY2VvZiBFbXB0eUZpbGVFZGl0b3JJbnB1dCkhO1xuXHRcdGFzc2VydC5vayhmaWxlVGFiKTtcblxuXHRcdC8vIFVzZXIgY2xvc2VzIHRoZSBGaWxlcyB0YWIuXG5cdFx0Y29uc3QgaW5kZXggPSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5pbmRleE9mKGZpbGVUYWIpO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0aGFybmVzcy5vbkRpZENsb3NlRWRpdG9yLmZpcmUoeyBlZGl0b3I6IGZpbGVUYWIgfSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0ZpbGVzVGFiKCksIGZhbHNlLCAndGhlIGNsb3NlZCBGaWxlcyB0YWIgc3RheXMgY2xvc2VkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBjbG9zZV0gcmUtb3BlbnMgdGhlIGRlZmF1bHQgdGFicyBmb3IgdGhlIG5ldyBzZXNzaW9uIGFmdGVyIHN3aXRjaGluZyAoZW1wdHkgZ3JvdXApJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGNvbnN0IGZpbGVUYWIgPSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5maW5kKGUgPT4gZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSE7XG5cdFx0Y29uc3QgaW5kZXggPSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5pbmRleE9mKGZpbGVUYWIpO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0aGFybmVzcy5vbkRpZENsb3NlRWRpdG9yLmZpcmUoeyBlZGl0b3I6IGZpbGVUYWIgfSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNGaWxlc1RhYigpLCBmYWxzZSk7XG5cblx0XHQvLyBTd2l0Y2hpbmcgc2Vzc2lvbnMgY2xvc2VzIHRoZSBwcmV2aW91cyBzZXNzaW9uJ3MgdGFicyAoc3RhbGUpIGxlYXZpbmcgYW5cblx0XHQvLyBlbXB0eSBncm91cCwgc28gdGhlIG5ldyBzZXNzaW9uJ3MgZGVmYXVsdHMgYXJlIG9wZW5lZC5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoyJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0ZpbGVzVGFiKCksIHRydWUsICd0aGUgZGVmYXVsdCB0YWJzIGFyZSBvcGVuZWQgZm9yIHRoZSBuZXcgc2Vzc2lvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gYWRkLXRhYl0gY2xvc2luZyB0aGUgQ2hhbmdlcyB0YWIgZmxpcHMgU2luZ2xlUGFuZUNoYW5nZXNUYWJNaXNzaW5nQ29udGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRjb25zdCBjaGFuZ2VzVGFiID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmluZChlID0+ICEoZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSAmJiBlLnJlc291cmNlICE9PSB1bmRlZmluZWQpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFybmVzcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoU2luZ2xlUGFuZUNoYW5nZXNUYWJNaXNzaW5nQ29udGV4dC5rZXkpLCBmYWxzZSk7XG5cblx0XHQvLyBVc2VyIGNsb3NlcyB0aGUgQ2hhbmdlcyB0YWIuXG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmluZGV4T2YoY2hhbmdlc1RhYiksIDEpO1xuXHRcdGhhcm5lc3Mub25EaWRDbG9zZUVkaXRvci5maXJlKHsgZWRpdG9yOiBjaGFuZ2VzVGFiIH0pO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzQ2hhbmdlc1RhYjogaGFzQ2hhbmdlc1RhYigpLFxuXHRcdFx0Y2hhbmdlc1RhYk1pc3Npbmc6IGhhcm5lc3MuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKFNpbmdsZVBhbmVDaGFuZ2VzVGFiTWlzc2luZ0NvbnRleHQua2V5KVxuXHRcdH0sIHsgaGFzQ2hhbmdlc1RhYjogZmFsc2UsIGNoYW5nZXNUYWJNaXNzaW5nOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gYWRkLXRhYl0gY2xvc2luZyB0aGUgRmlsZXMgdGFiIGZsaXBzIFNpbmdsZVBhbmVGaWxlc1RhYk1pc3NpbmdDb250ZXh0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGNvbnN0IGZpbGVUYWIgPSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5maW5kKGUgPT4gZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhcm5lc3MuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKFNpbmdsZVBhbmVGaWxlc1RhYk1pc3NpbmdDb250ZXh0LmtleSksIGZhbHNlKTtcblxuXHRcdC8vIFVzZXIgY2xvc2VzIHRoZSBGaWxlcyB0YWIuXG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmluZGV4T2YoZmlsZVRhYiksIDEpO1xuXHRcdGhhcm5lc3Mub25EaWRDbG9zZUVkaXRvci5maXJlKHsgZWRpdG9yOiBmaWxlVGFiIH0pO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCksXG5cdFx0XHRmaWxlc1RhYk1pc3Npbmc6IGhhcm5lc3MuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKFNpbmdsZVBhbmVGaWxlc1RhYk1pc3NpbmdDb250ZXh0LmtleSlcblx0XHR9LCB7IGhhc0ZpbGVzVGFiOiBmYWxzZSwgZmlsZXNUYWJNaXNzaW5nOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gYWRkLXRhYl0gcmVvcGVuaW5nIHRoZSBDaGFuZ2VzIHRhYiBjbGVhcnMgdGhlIG1pc3NpbmcgY29udGV4dCBhbmQgaXMgcmV0YWluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBVUkkucGFyc2UoJ3Nlc3Npb246MScpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oc2Vzc2lvbiksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0Y29uc3QgY2hhbmdlc1RhYiA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmQoZSA9PiAhKGUgaW5zdGFuY2VvZiBFbXB0eUZpbGVFZGl0b3JJbnB1dCkgJiYgZS5yZXNvdXJjZSAhPT0gdW5kZWZpbmVkKSE7XG5cblx0XHQvLyBVc2VyIGNsb3NlcyB0aGUgQ2hhbmdlcyB0YWIgLT4gdGhlIG1pc3NpbmcgY29udGV4dCBiZWNvbWVzIHRydWUuXG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmluZGV4T2YoY2hhbmdlc1RhYiksIDEpO1xuXHRcdGhhcm5lc3Mub25EaWRDbG9zZUVkaXRvci5maXJlKHsgZWRpdG9yOiBjaGFuZ2VzVGFiIH0pO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFybmVzcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoU2luZ2xlUGFuZUNoYW5nZXNUYWJNaXNzaW5nQ29udGV4dC5rZXkpLCB0cnVlKTtcblxuXHRcdC8vIFJlb3BlbiBpdCAoYXMgdGhlIGArYCBcIkNoYW5nZXNcIiBlbnRyeSBkb2VzKTogdGhlIENoYW5nZXMgZWRpdG9yIHJlYXBwZWFycy5cblx0XHRjb25zdCBjaGFuZ2VzUmVzb3VyY2UgPSBoYXJuZXNzLnNlc3Npb25DaGFuZ2VzU2VydmljZS5nZXRDaGFuZ2VzRWRpdG9yUmVzb3VyY2Uoc2Vzc2lvbik7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMucHVzaChzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQoY2hhbmdlc1Jlc291cmNlKSkpO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdC8vIFRoZSByZS1hZGRlZCB0YWIgbWFrZXMgdGhlIGdyb3VwIG5vbi1lbXB0eSwgc28gYSBsYXRlciByb3V0aW5lIHN5bmNcblx0XHQvLyByZXRhaW5zIGl0IGFuZCB0aGUgbWlzc2luZyBjb250ZXh0IHN0YXlzIGZhbHNlLlxuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhhc0NoYW5nZXNUYWI6IGhhc0NoYW5nZXNUYWIoKSxcblx0XHRcdGNoYW5nZXNUYWJNaXNzaW5nOiBoYXJuZXNzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShTaW5nbGVQYW5lQ2hhbmdlc1RhYk1pc3NpbmdDb250ZXh0LmtleSlcblx0XHR9LCB7IGhhc0NoYW5nZXNUYWI6IHRydWUsIGNoYW5nZXNUYWJNaXNzaW5nOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnW21hbmFnZWQgdGFicyAvIGFkZC10YWJdIHJlb3BlbmluZyBtYW5hZ2VkIHRhYnMgZnJvbSB0aGUgcGx1cyBtZW51IGFkZHMgdGhlbSBhdCB0aGUgZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gVVJJLnBhcnNlKCdzZXNzaW9uOjEnKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKHNlc3Npb24pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3QgY2hhbmdlc1RhYiA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmQoZSA9PiAhKGUgaW5zdGFuY2VvZiBFbXB0eUZpbGVFZGl0b3JJbnB1dCkgJiYgZS5yZXNvdXJjZSAhPT0gdW5kZWZpbmVkKSE7XG5cdFx0Y29uc3QgZmlsZXNUYWIgPSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5maW5kKGUgPT4gZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSE7XG5cdFx0Y29uc3QgZXh0cmFFZGl0b3IgPSBzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQoVVJJLmZpbGUoJy9yZXBvL2V4dHJhLnRzJykpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5wdXNoKGV4dHJhRWRpdG9yKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZShoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5pbmRleE9mKGNoYW5nZXNUYWIpLCAxKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2xvc2VFZGl0b3IuZmlyZSh7IGVkaXRvcjogY2hhbmdlc1RhYiB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihmaWxlc1RhYiksIDEpO1xuXHRcdGhhcm5lc3Mub25EaWRDbG9zZUVkaXRvci5maXJlKHsgZWRpdG9yOiBmaWxlc1RhYiB9KTtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhd2FpdCBuZXcgTmV3Q2hhbmdlc1RhYkFjdGlvbigpLnJ1bihoYXJuZXNzLmluc3RhU2VydmljZSk7XG5cdFx0YXdhaXQgbmV3IE5ld0ZpbGVUYWJBY3Rpb24oKS5ydW4oaGFybmVzcy5pbnN0YVNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5tYXAoZWRpdG9yID0+IHtcblx0XHRcdGlmIChlZGl0b3IgPT09IGV4dHJhRWRpdG9yKSB7XG5cdFx0XHRcdHJldHVybiAnZXh0cmEnO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSB7XG5cdFx0XHRcdHJldHVybiAnZmlsZXMnO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVkaXRvci5yZXNvdXJjZSAmJiBpc0VxdWFsKGVkaXRvci5yZXNvdXJjZSwgaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKHNlc3Npb24pKSkge1xuXHRcdFx0XHRyZXR1cm4gJ2NoYW5nZXMnO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICdvdGhlcic7XG5cdFx0fSksIFsnZXh0cmEnLCAnY2hhbmdlcycsICdmaWxlcyddKTtcblx0fSk7XG5cblx0dGVzdCgnW21hbmFnZWQgdGFicyAvIHJlbG9hZF0gY2xvc2luZyBhIHN0YWxlIENoYW5nZXMgdGFiIGhhcHBlbnMgdW5kZXIgZWRpdG9yLXZpc2liaWxpdHkgc3VwcHJlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdC8vIEEgc3RhbGUgQ2hhbmdlcyB0YWIgZm9yIGEgcHJldmlvdXMgc2Vzc2lvbiBpcyByZXN0b3JlZCBpbnRvIHRoZSBncm91cC5cblx0XHRjb25zdCBzdGFsZUNoYW5nZXNSZXNvdXJjZSA9IGhhcm5lc3Muc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmdldENoYW5nZXNFZGl0b3JSZXNvdXJjZShVUkkucGFyc2UoJ3Nlc3Npb246c3RhbGUnKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMucHVzaChzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQoc3RhbGVDaGFuZ2VzUmVzb3VyY2UpKSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3Qgc3RhbGVDbG9zZWQgPSBoYXJuZXNzLmNsb3NlZEVkaXRvcnMuc29tZShlID0+IGUucmVzb3VyY2UgJiYgaXNFcXVhbChlLnJlc291cmNlLCBzdGFsZUNoYW5nZXNSZXNvdXJjZSkpO1xuXHRcdGNvbnN0IGFsbENsb3Nlc1N1cHByZXNzZWQgPSBoYXJuZXNzLmNsb3NlU3VwcHJlc3Npb25GbGFncy5ldmVyeShmbGFnID0+IGZsYWcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzdGFsZUNsb3NlZCwgYWxsQ2xvc2VzU3VwcHJlc3NlZCB9LCB7IHN0YWxlQ2xvc2VkOiB0cnVlLCBhbGxDbG9zZXNTdXBwcmVzc2VkOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gSXNzdWUgMV0gcmUtZW5zdXJlcyB0aGUgRmlsZXMgdGFiIHdoZW4gdGhlIHNpZGUgcGFuZSBpcyByZW9wZW5lZCB2aWEgdGhlIGF1eCBiYXIgYWxvbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSwgaW5pdGlhbFBhcnRWaXNpYmlsaXR5OiBuZXcgTWFwKFtbUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlXSwgW1BhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlXV0pIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246bmV3JyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGNvbnN0IGZpbGVUYWIgPSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5maW5kKGUgPT4gZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSE7XG5cdFx0YXNzZXJ0Lm9rKGZpbGVUYWIpO1xuXG5cdFx0Ly8gVXNlciBjbG9zZXMgdGhlIEZpbGVzIHRhYjsgdGhlIHdob2xlIHNpZGUgcGFuZSBjbG9zZXMgKGF1eCBoaWRkZW4pLlxuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZShoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5pbmRleE9mKGZpbGVUYWIpLCAxKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2xvc2VFZGl0b3IuZmlyZSh7IGVkaXRvcjogZmlsZVRhYiB9KTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0ZpbGVzVGFiKCksIGZhbHNlKTtcblxuXHRcdC8vIFJlb3BlbiB0aGUgc2lkZSBwYW5lIGJ5IHJldmVhbGluZyBPTkxZIHRoZSBhdXggYmFyIChlZGl0b3Igc3RheXMgaGlkZGVuKS5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGhhcm5lc3Mub25EaWRSZXZlYWxTaWRlUGFuZS5maXJlKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRmlsZXNUYWIoKSwgdHJ1ZSwgJ3Jlb3BlbmluZyB2aWEgdGhlIGF1eCBiYXIgcmUtZW5zdXJlcyB0aGUgRmlsZXMgdGFiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBJc3N1ZSAyXSBvcGVuaW5nIGEgZmlsZSBhZnRlciB0aGUgc2lkZSBwYW5lIHdhcyBjbG9zZWQgZG9lcyBub3QgcmUtZm9yY2UgdGhlIG1hbmFnZWQgdGFicycsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihzZXNzaW9uKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaGFzQ2hhbmdlc1RhYjogaGFzQ2hhbmdlc1RhYigpLCBoYXNGaWxlc1RhYjogaGFzRmlsZXNUYWIoKSB9LCB7IGhhc0NoYW5nZXNUYWI6IHRydWUsIGhhc0ZpbGVzVGFiOiB0cnVlIH0pO1xuXG5cdFx0Ly8gVXNlciBjbG9zZXMgYm90aCBtYW5hZ2VkIHRhYnM7IHRoZSB3aG9sZSBzaWRlIHBhbmUgY2xvc2VzIChib3RoIHBhcnRzIGhpZGRlbikuXG5cdFx0Y29uc3QgY2hhbmdlc1RhYiA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmQoZSA9PiAhKGUgaW5zdGFuY2VvZiBFbXB0eUZpbGVFZGl0b3JJbnB1dCkgJiYgZS5yZXNvdXJjZSAhPT0gdW5kZWZpbmVkKSE7XG5cdFx0Y29uc3QgZmlsZXNUYWIgPSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5maW5kKGUgPT4gZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSE7XG5cdFx0Zm9yIChjb25zdCB0YWIgb2YgW2NoYW5nZXNUYWIsIGZpbGVzVGFiXSkge1xuXHRcdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmluZGV4T2YodGFiKSwgMSk7XG5cdFx0XHRoYXJuZXNzLm9uRGlkQ2xvc2VFZGl0b3IuZmlyZSh7IGVkaXRvcjogdGFiIH0pO1xuXHRcdH1cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaGFzQ2hhbmdlc1RhYjogaGFzQ2hhbmdlc1RhYigpLCBoYXNGaWxlc1RhYjogaGFzRmlsZXNUYWIoKSB9LCB7IGhhc0NoYW5nZXNUYWI6IGZhbHNlLCBoYXNGaWxlc1RhYjogZmFsc2UgfSk7XG5cblx0XHQvLyBUaGUgdXNlciBvcGVucyBhIGZpbGU6IHRoZSBzaWRlIHBhbmUgb3BlbnMgKGVkaXRvciBwYXJ0IHJldmVhbGVkKSBhbmQgYVxuXHRcdC8vIHJlYWwgZWRpdG9yIGlzIGFkZGVkLiBQcm9kdWN0aW9uIGZpcmVzIG9uRGlkUmV2ZWFsU2lkZVBhbmUgb24gdGhlIHJldmVhbCxcblx0XHQvLyBidXQgdGhlIGZpbGUgaXMgYSByZWFsIGVkaXRvciBzbyB0aGUgbWFuYWdlZCBDaGFuZ2VzL0ZpbGVzIHRhYnMgbXVzdCBOT1Rcblx0XHQvLyBiZSByZS1mb3JjZWQuXG5cdFx0Y29uc3QgY2hhbmdlc1Jlc291cmNlID0gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKHNlc3Npb24pO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnB1c2goc3RvcmUuYWRkKG5ldyBUZXN0U3R1YkVkaXRvcklucHV0KFVSSS5maWxlKCcvcmVwby9vcGVuZWQudHMnKSkpKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGhhcm5lc3Mub25EaWRSZXZlYWxTaWRlUGFuZS5maXJlKCk7XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3QgaGFzTWFuYWdlZENoYW5nZXNUYWIgPSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zb21lKGUgPT4gZS5yZXNvdXJjZSAmJiBpc0VxdWFsKGUucmVzb3VyY2UsIGNoYW5nZXNSZXNvdXJjZSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNNYW5hZ2VkQ2hhbmdlc1RhYiwgaGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCkgfSwgeyBoYXNNYW5hZ2VkQ2hhbmdlc1RhYjogZmFsc2UsIGhhc0ZpbGVzVGFiOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnW21hbmFnZWQgdGFicyAvIElzc3VlIDJdIHRvZ2dsaW5nIHRoZSBlbXB0eSBzaWRlIHBhbmUgb3BlbiByZS1wb3B1bGF0ZXMgdGhlIGRlZmF1bHQgbWFuYWdlZCB0YWJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gVVJJLnBhcnNlKCdzZXNzaW9uOjEnKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKHNlc3Npb24pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Ly8gVXNlciBjbG9zZXMgYm90aCBtYW5hZ2VkIHRhYnM7IHRoZSB3aG9sZSBzaWRlIHBhbmUgY2xvc2VzLlxuXHRcdGZvciAoY29uc3QgdGFiIG9mIFsuLi5oYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9yc10pIHtcblx0XHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZShoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5pbmRleE9mKHRhYiksIDEpO1xuXHRcdFx0aGFybmVzcy5vbkRpZENsb3NlRWRpdG9yLmZpcmUoeyBlZGl0b3I6IHRhYiB9KTtcblx0XHR9XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9KTtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGhhc0NoYW5nZXNUYWI6IGhhc0NoYW5nZXNUYWIoKSwgaGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCkgfSwgeyBoYXNDaGFuZ2VzVGFiOiBmYWxzZSwgaGFzRmlsZXNUYWI6IGZhbHNlIH0pO1xuXG5cdFx0Ly8gVGhlIHVzZXIgcmVvcGVucyB0aGUgc2lkZSBwYW5lIHZpYSB0aGUgdG9nZ2xlIGFjdGlvbiB3aGlsZSB0aGUgZWRpdG9yXG5cdFx0Ly8gZ3JvdXAgaXMgZW1wdHk6IHRoZSBkZWZhdWx0IG1hbmFnZWQgdGFicyBtdXN0IGJlIHJlLXBvcHVsYXRlZC5cblx0XHRoYXJuZXNzLm9uRGlkUmV2ZWFsU2lkZVBhbmUuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGhhc0NoYW5nZXNUYWI6IGhhc0NoYW5nZXNUYWIoKSwgaGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCkgfSwgeyBoYXNDaGFuZ2VzVGFiOiB0cnVlLCBoYXNGaWxlc1RhYjogdHJ1ZSB9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGVB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
