import assert from "assert";
import { workbenchInstantiationService, registerTestEditor, TestFileEditorInput, TestServiceAccessor, workbenchTeardown, createEditorParts } from "../../../../test/browser/workbenchTestServices.js";
import { GroupDirection, GroupsOrder, MergeGroupMode, GroupOrientation, GroupLocation, isEditorGroup, IEditorGroupsService, GroupsArrangement, GroupActivationReason } from "../../common/editorGroupsService.js";
import { CloseDirection, EditorsOrder, EditorInputCapabilities, GroupModelChangeKind, SideBySideEditor, EditorExtensions } from "../../../../common/editor.js";
import { URI } from "../../../../../base/common/uri.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { MockScopableContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ConfirmResult } from "../../../../../platform/dialogs/common/dialogs.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { SideBySideEditorInput } from "../../../../common/editor/sideBySideEditorInput.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { Emitter } from "../../../../../base/common/event.js";
import { isEqual } from "../../../../../base/common/resources.js";
suite("EditorGroupsService", () => {
  const TEST_EDITOR_ID = "MyFileEditorForEditorGroupService";
  const TEST_EDITOR_INPUT_ID = "testEditorInputForEditorGroupService";
  const disposables = new DisposableStore();
  let testLocalInstantiationService = void 0;
  setup(() => {
    disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(SideBySideEditorInput)], TEST_EDITOR_INPUT_ID));
  });
  teardown(async () => {
    if (testLocalInstantiationService) {
      await workbenchTeardown(testLocalInstantiationService);
      testLocalInstantiationService = void 0;
    }
    disposables.clear();
  });
  async function createParts(instantiationService = workbenchInstantiationService(void 0, disposables)) {
    instantiationService.invokeFunction((accessor) => Registry.as(EditorExtensions.EditorFactory).start(accessor));
    const parts = await createEditorParts(instantiationService, disposables);
    instantiationService.stub(IEditorGroupsService, parts);
    testLocalInstantiationService = instantiationService;
    return [parts, instantiationService];
  }
  async function createPart(instantiationService) {
    const [parts, testInstantiationService] = await createParts(instantiationService);
    return [parts.testMainPart, testInstantiationService];
  }
  function createTestFileEditorInput(resource, typeId) {
    return disposables.add(new TestFileEditorInput(resource, typeId));
  }
  test("groups basics", async function() {
    const instantiationService = workbenchInstantiationService({ contextKeyService: (instantiationService2) => instantiationService2.createInstance(MockScopableContextKeyService) }, disposables);
    const [part] = await createPart(instantiationService);
    let activeGroupModelChangeCounter = 0;
    const activeGroupModelChangeListener = part.onDidChangeActiveGroup(() => {
      activeGroupModelChangeCounter++;
    });
    let groupAddedCounter = 0;
    const groupAddedListener = part.onDidAddGroup(() => {
      groupAddedCounter++;
    });
    let groupRemovedCounter = 0;
    const groupRemovedListener = part.onDidRemoveGroup(() => {
      groupRemovedCounter++;
    });
    let groupMovedCounter = 0;
    const groupMovedListener = part.onDidMoveGroup(() => {
      groupMovedCounter++;
    });
    const rootGroup = part.groups[0];
    assert.strictEqual(isEditorGroup(rootGroup), true);
    assert.strictEqual(part.groups.length, 1);
    assert.strictEqual(part.count, 1);
    assert.strictEqual(rootGroup, part.getGroup(rootGroup.id));
    assert.ok(part.activeGroup === rootGroup);
    assert.strictEqual(rootGroup.label, "Group 1");
    let mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru.length, 1);
    assert.strictEqual(mru[0], rootGroup);
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    assert.strictEqual(rightGroup, part.getGroup(rightGroup.id));
    assert.strictEqual(groupAddedCounter, 1);
    assert.strictEqual(part.groups.length, 2);
    assert.strictEqual(part.count, 2);
    assert.ok(part.activeGroup === rootGroup);
    assert.strictEqual(rootGroup.label, "Group 1");
    assert.strictEqual(rightGroup.label, "Group 2");
    mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru.length, 2);
    assert.strictEqual(mru[0], rootGroup);
    assert.strictEqual(mru[1], rightGroup);
    assert.strictEqual(activeGroupModelChangeCounter, 0);
    let rootGroupActiveChangeCounter = 0;
    const rootGroupModelChangeListener = rootGroup.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.GROUP_ACTIVE) {
        rootGroupActiveChangeCounter++;
      }
    });
    let rightGroupActiveChangeCounter = 0;
    const rightGroupModelChangeListener = rightGroup.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.GROUP_ACTIVE) {
        rightGroupActiveChangeCounter++;
      }
    });
    part.activateGroup(rightGroup);
    assert.ok(part.activeGroup === rightGroup);
    assert.strictEqual(activeGroupModelChangeCounter, 1);
    assert.strictEqual(rootGroupActiveChangeCounter, 1);
    assert.strictEqual(rightGroupActiveChangeCounter, 1);
    rootGroupModelChangeListener.dispose();
    rightGroupModelChangeListener.dispose();
    mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru.length, 2);
    assert.strictEqual(mru[0], rightGroup);
    assert.strictEqual(mru[1], rootGroup);
    const downGroup = part.addGroup(rightGroup, GroupDirection.DOWN);
    let didDispose = false;
    disposables.add(downGroup.onWillDispose(() => {
      didDispose = true;
    }));
    assert.strictEqual(groupAddedCounter, 2);
    assert.strictEqual(part.groups.length, 3);
    assert.ok(part.activeGroup === rightGroup);
    assert.ok(!downGroup.activeEditorPane);
    assert.strictEqual(rootGroup.label, "Group 1");
    assert.strictEqual(rightGroup.label, "Group 2");
    assert.strictEqual(downGroup.label, "Group 3");
    mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru.length, 3);
    assert.strictEqual(mru[0], rightGroup);
    assert.strictEqual(mru[1], rootGroup);
    assert.strictEqual(mru[2], downGroup);
    const gridOrder = part.getGroups(GroupsOrder.GRID_APPEARANCE);
    assert.strictEqual(gridOrder.length, 3);
    assert.strictEqual(gridOrder[0], rootGroup);
    assert.strictEqual(gridOrder[0].index, 0);
    assert.strictEqual(gridOrder[1], rightGroup);
    assert.strictEqual(gridOrder[1].index, 1);
    assert.strictEqual(gridOrder[2], downGroup);
    assert.strictEqual(gridOrder[2].index, 2);
    part.moveGroup(downGroup, rightGroup, GroupDirection.DOWN);
    assert.strictEqual(groupMovedCounter, 1);
    part.removeGroup(downGroup);
    assert.ok(!part.getGroup(downGroup.id));
    assert.ok(!part.hasGroup(downGroup.id));
    assert.strictEqual(didDispose, true);
    assert.strictEqual(groupRemovedCounter, 1);
    assert.strictEqual(part.groups.length, 2);
    assert.ok(part.activeGroup === rightGroup);
    assert.strictEqual(rootGroup.label, "Group 1");
    assert.strictEqual(rightGroup.label, "Group 2");
    mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru.length, 2);
    assert.strictEqual(mru[0], rightGroup);
    assert.strictEqual(mru[1], rootGroup);
    const rightGroupContextKeyService = part.activeGroup.scopedContextKeyService;
    const rootGroupContextKeyService = rootGroup.scopedContextKeyService;
    assert.ok(rightGroupContextKeyService);
    assert.ok(rootGroupContextKeyService);
    assert.ok(rightGroupContextKeyService !== rootGroupContextKeyService);
    part.removeGroup(rightGroup);
    assert.strictEqual(groupRemovedCounter, 2);
    assert.strictEqual(part.groups.length, 1);
    assert.ok(part.activeGroup === rootGroup);
    mru = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru.length, 1);
    assert.strictEqual(mru[0], rootGroup);
    part.removeGroup(rootGroup);
    assert.strictEqual(part.groups.length, 1);
    assert.strictEqual(groupRemovedCounter, 2);
    assert.ok(part.activeGroup === rootGroup);
    part.setGroupOrientation(part.orientation === GroupOrientation.HORIZONTAL ? GroupOrientation.VERTICAL : GroupOrientation.HORIZONTAL);
    activeGroupModelChangeListener.dispose();
    groupAddedListener.dispose();
    groupRemovedListener.dispose();
    groupMovedListener.dispose();
  });
  test("sideGroup", async () => {
    const instantiationService = workbenchInstantiationService({ contextKeyService: (instantiationService2) => instantiationService2.createInstance(MockScopableContextKeyService) }, disposables);
    const [part] = await createPart(instantiationService);
    const rootGroup = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await rootGroup.openEditor(input1, { pinned: true });
    await part.sideGroup.openEditor(input2, { pinned: true });
    assert.strictEqual(part.count, 2);
    part.activateGroup(rootGroup);
    await part.sideGroup.openEditor(input3, { pinned: true });
    assert.strictEqual(part.count, 2);
  });
  test("save & restore state", async function() {
    const [part, instantiationService] = await createPart();
    const rootGroup = part.groups[0];
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    const downGroup = part.addGroup(rightGroup, GroupDirection.DOWN);
    const rootGroupInput = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    await rootGroup.openEditor(rootGroupInput, { pinned: true });
    const rightGroupInput = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await rightGroup.openEditor(rightGroupInput, { pinned: true });
    assert.strictEqual(part.groups.length, 3);
    part.testSaveState();
    part.dispose();
    const [restoredPart] = await createPart(instantiationService);
    assert.strictEqual(restoredPart.groups.length, 3);
    assert.ok(restoredPart.getGroup(rootGroup.id));
    assert.ok(restoredPart.hasGroup(rootGroup.id));
    assert.ok(restoredPart.getGroup(rightGroup.id));
    assert.ok(restoredPart.hasGroup(rightGroup.id));
    assert.ok(restoredPart.getGroup(downGroup.id));
    assert.ok(restoredPart.hasGroup(downGroup.id));
    restoredPart.clearState();
  });
  test("groups index / labels", async function() {
    const [part] = await createPart();
    const rootGroup = part.groups[0];
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    const downGroup = part.addGroup(rightGroup, GroupDirection.DOWN);
    let groupIndexChangedCounter = 0;
    const groupIndexChangedListener = part.onDidChangeGroupIndex(() => {
      groupIndexChangedCounter++;
    });
    let indexChangeCounter = 0;
    const labelChangeListener = downGroup.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.GROUP_INDEX) {
        indexChangeCounter++;
      }
    });
    assert.strictEqual(rootGroup.index, 0);
    assert.strictEqual(rightGroup.index, 1);
    assert.strictEqual(downGroup.index, 2);
    assert.strictEqual(rootGroup.label, "Group 1");
    assert.strictEqual(rightGroup.label, "Group 2");
    assert.strictEqual(downGroup.label, "Group 3");
    part.removeGroup(rightGroup);
    assert.strictEqual(rootGroup.index, 0);
    assert.strictEqual(downGroup.index, 1);
    assert.strictEqual(rootGroup.label, "Group 1");
    assert.strictEqual(downGroup.label, "Group 2");
    assert.strictEqual(indexChangeCounter, 1);
    assert.strictEqual(groupIndexChangedCounter, 1);
    part.moveGroup(downGroup, rootGroup, GroupDirection.UP);
    assert.strictEqual(downGroup.index, 0);
    assert.strictEqual(rootGroup.index, 1);
    assert.strictEqual(downGroup.label, "Group 1");
    assert.strictEqual(rootGroup.label, "Group 2");
    assert.strictEqual(indexChangeCounter, 2);
    assert.strictEqual(groupIndexChangedCounter, 3);
    const newFirstGroup = part.addGroup(downGroup, GroupDirection.UP);
    assert.strictEqual(newFirstGroup.index, 0);
    assert.strictEqual(downGroup.index, 1);
    assert.strictEqual(rootGroup.index, 2);
    assert.strictEqual(newFirstGroup.label, "Group 1");
    assert.strictEqual(downGroup.label, "Group 2");
    assert.strictEqual(rootGroup.label, "Group 3");
    assert.strictEqual(indexChangeCounter, 3);
    assert.strictEqual(groupIndexChangedCounter, 6);
    labelChangeListener.dispose();
    groupIndexChangedListener.dispose();
  });
  test("groups label", async function() {
    const [part] = await createPart();
    const rootGroup = part.groups[0];
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    let partLabelChangedCounter = 0;
    const groupIndexChangedListener = part.onDidChangeGroupLabel(() => {
      partLabelChangedCounter++;
    });
    let rootGroupLabelChangeCounter = 0;
    const rootGroupLabelChangeListener = rootGroup.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.GROUP_LABEL) {
        rootGroupLabelChangeCounter++;
      }
    });
    let rightGroupLabelChangeCounter = 0;
    const rightGroupLabelChangeListener = rightGroup.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.GROUP_LABEL) {
        rightGroupLabelChangeCounter++;
      }
    });
    assert.strictEqual(rootGroup.label, "Group 1");
    assert.strictEqual(rightGroup.label, "Group 2");
    part.notifyGroupsLabelChange("Window 2");
    assert.strictEqual(rootGroup.label, "Window 2: Group 1");
    assert.strictEqual(rightGroup.label, "Window 2: Group 2");
    assert.strictEqual(rootGroupLabelChangeCounter, 1);
    assert.strictEqual(rightGroupLabelChangeCounter, 1);
    assert.strictEqual(partLabelChangedCounter, 2);
    part.notifyGroupsLabelChange("Window 3");
    assert.strictEqual(rootGroup.label, "Window 3: Group 1");
    assert.strictEqual(rightGroup.label, "Window 3: Group 2");
    assert.strictEqual(rootGroupLabelChangeCounter, 2);
    assert.strictEqual(rightGroupLabelChangeCounter, 2);
    assert.strictEqual(partLabelChangedCounter, 4);
    rootGroupLabelChangeListener.dispose();
    rightGroupLabelChangeListener.dispose();
    groupIndexChangedListener.dispose();
  });
  test("copy/merge groups", async () => {
    const [part] = await createPart();
    let groupAddedCounter = 0;
    const groupAddedListener = part.onDidAddGroup(() => {
      groupAddedCounter++;
    });
    let groupRemovedCounter = 0;
    const groupRemovedListener = part.onDidRemoveGroup(() => {
      groupRemovedCounter++;
    });
    const rootGroup = part.groups[0];
    let rootGroupDisposed = false;
    const disposeListener = rootGroup.onWillDispose(() => {
      rootGroupDisposed = true;
    });
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    await rootGroup.openEditor(input, { pinned: true });
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    part.activateGroup(rightGroup);
    const downGroup = part.copyGroup(rootGroup, rightGroup, GroupDirection.DOWN);
    assert.strictEqual(groupAddedCounter, 2);
    assert.strictEqual(downGroup.count, 1);
    assert.ok(downGroup.activeEditor instanceof TestFileEditorInput);
    let res = part.mergeGroup(rootGroup, rightGroup, { mode: MergeGroupMode.COPY_EDITORS });
    assert.strictEqual(res, true);
    assert.strictEqual(rightGroup.count, 1);
    assert.ok(rightGroup.activeEditor instanceof TestFileEditorInput);
    res = part.mergeGroup(rootGroup, rightGroup, { mode: MergeGroupMode.MOVE_EDITORS });
    assert.strictEqual(res, true);
    assert.strictEqual(rootGroup.count, 0);
    res = part.mergeGroup(rootGroup, downGroup);
    assert.strictEqual(res, true);
    assert.strictEqual(groupRemovedCounter, 1);
    assert.strictEqual(rootGroupDisposed, true);
    groupAddedListener.dispose();
    groupRemovedListener.dispose();
    disposeListener.dispose();
    part.dispose();
  });
  test("merge all groups", async () => {
    const [part] = await createPart();
    const rootGroup = part.groups[0];
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await rootGroup.openEditor(input1, { pinned: true });
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    await rightGroup.openEditor(input2, { pinned: true });
    const downGroup = part.copyGroup(rootGroup, rightGroup, GroupDirection.DOWN);
    await downGroup.openEditor(input3, { pinned: true });
    part.activateGroup(rootGroup);
    assert.strictEqual(rootGroup.count, 1);
    const result = part.mergeAllGroups(part.activeGroup);
    assert.strictEqual(result, true);
    assert.strictEqual(rootGroup.count, 3);
    part.dispose();
  });
  test("whenReady / whenRestored", async () => {
    const [part] = await createPart();
    await part.whenReady;
    assert.strictEqual(part.isReady, true);
    await part.whenRestored;
  });
  test("options", async () => {
    const [part] = await createPart();
    let oldOptions;
    let newOptions;
    disposables.add(part.onDidChangeEditorPartOptions((event) => {
      oldOptions = event.oldPartOptions;
      newOptions = event.newPartOptions;
    }));
    const currentOptions = part.partOptions;
    assert.ok(currentOptions);
    disposables.add(part.enforcePartOptions({ showTabs: "single" }));
    assert.strictEqual(part.partOptions.showTabs, "single");
    assert.strictEqual(newOptions.showTabs, "single");
    assert.strictEqual(oldOptions, currentOptions);
    const enforced = part.enforcePartOptions({ allowDropIntoGroup: false });
    assert.strictEqual(part.partOptions.allowDropIntoGroup, false);
    enforced.dispose();
    assert.strictEqual(part.partOptions.allowDropIntoGroup, true);
  });
  test("editor basics", async function() {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    let activeEditorChangeCounter = 0;
    let editorDidOpenCounter = 0;
    const editorOpenEvents = [];
    let editorCloseCounter = 0;
    const editorCloseEvents = [];
    let editorPinCounter = 0;
    let editorStickyCounter = 0;
    let editorCapabilitiesCounter = 0;
    const editorGroupModelChangeListener = group.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_OPEN) {
        assert.ok(e.editor);
        editorDidOpenCounter++;
        editorOpenEvents.push(e);
      } else if (e.kind === GroupModelChangeKind.EDITOR_PIN) {
        assert.ok(e.editor);
        editorPinCounter++;
      } else if (e.kind === GroupModelChangeKind.EDITOR_STICKY) {
        assert.ok(e.editor);
        editorStickyCounter++;
      } else if (e.kind === GroupModelChangeKind.EDITOR_CAPABILITIES) {
        assert.ok(e.editor);
        editorCapabilitiesCounter++;
      } else if (e.kind === GroupModelChangeKind.EDITOR_CLOSE) {
        assert.ok(e.editor);
        editorCloseCounter++;
        editorCloseEvents.push(e);
      }
    });
    const activeEditorChangeListener = group.onDidActiveEditorChange((e) => {
      assert.ok(e.editor);
      activeEditorChangeCounter++;
    });
    let editorCloseCounter1 = 0;
    const editorCloseListener = group.onDidCloseEditor(() => {
      editorCloseCounter1++;
    });
    let editorWillCloseCounter = 0;
    const editorWillCloseListener = group.onWillCloseEditor(() => {
      editorWillCloseCounter++;
    });
    let editorDidCloseCounter = 0;
    const editorDidCloseListener = group.onDidCloseEditor(() => {
      editorDidCloseCounter++;
    });
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input, { pinned: true });
    await group.openEditor(inputInactive, { inactive: true });
    assert.strictEqual(group.isActive(input), true);
    assert.strictEqual(group.isActive(inputInactive), false);
    assert.strictEqual(group.contains(input), true);
    assert.strictEqual(group.contains(inputInactive), true);
    assert.strictEqual(group.isEmpty, false);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(editorCapabilitiesCounter, 0);
    assert.strictEqual(editorDidOpenCounter, 2);
    assert.strictEqual(editorOpenEvents[0].editorIndex, 0);
    assert.strictEqual(editorOpenEvents[1].editorIndex, 1);
    assert.strictEqual(editorOpenEvents[0].editor, input);
    assert.strictEqual(editorOpenEvents[1].editor, inputInactive);
    assert.strictEqual(activeEditorChangeCounter, 1);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    assert.strictEqual(group.getIndexOfEditor(input), 0);
    assert.strictEqual(group.getIndexOfEditor(inputInactive), 1);
    assert.strictEqual(group.isFirst(input), true);
    assert.strictEqual(group.isFirst(inputInactive), false);
    assert.strictEqual(group.isLast(input), false);
    assert.strictEqual(group.isLast(inputInactive), true);
    input.capabilities = EditorInputCapabilities.RequiresTrust;
    assert.strictEqual(editorCapabilitiesCounter, 1);
    inputInactive.capabilities = EditorInputCapabilities.Singleton;
    assert.strictEqual(editorCapabilitiesCounter, 2);
    assert.strictEqual(group.previewEditor, inputInactive);
    assert.strictEqual(group.isPinned(inputInactive), false);
    group.pinEditor(inputInactive);
    assert.strictEqual(editorPinCounter, 1);
    assert.strictEqual(group.isPinned(inputInactive), true);
    assert.ok(!group.previewEditor);
    assert.strictEqual(group.activeEditor, input);
    assert.strictEqual(group.activeEditorPane?.getId(), TEST_EDITOR_ID);
    assert.strictEqual(group.count, 2);
    const mru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
    assert.strictEqual(mru[0], input);
    assert.strictEqual(mru[1], inputInactive);
    await group.openEditor(inputInactive);
    assert.strictEqual(activeEditorChangeCounter, 2);
    assert.strictEqual(group.activeEditor, inputInactive);
    await group.openEditor(input);
    const closed = await group.closeEditor(inputInactive);
    assert.strictEqual(closed, true);
    assert.strictEqual(activeEditorChangeCounter, 3);
    assert.strictEqual(editorCloseCounter, 1);
    assert.strictEqual(editorCloseEvents[0].editorIndex, 1);
    assert.strictEqual(editorCloseEvents[0].editor, inputInactive);
    assert.strictEqual(editorCloseCounter1, 1);
    assert.strictEqual(editorWillCloseCounter, 1);
    assert.strictEqual(editorDidCloseCounter, 1);
    assert.ok(inputInactive.gotDisposed);
    assert.strictEqual(group.activeEditor, input);
    assert.strictEqual(editorStickyCounter, 0);
    group.stickEditor(input);
    assert.strictEqual(editorStickyCounter, 1);
    group.unstickEditor(input);
    assert.strictEqual(editorStickyCounter, 2);
    editorCloseListener.dispose();
    editorWillCloseListener.dispose();
    editorDidCloseListener.dispose();
    activeEditorChangeListener.dispose();
    editorGroupModelChangeListener.dispose();
  });
  test("openEditors / closeEditors", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input, options: { pinned: true } },
      { editor: inputInactive }
    ]);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    await group.closeEditors([input, inputInactive]);
    assert.ok(input.gotDisposed);
    assert.ok(inputInactive.gotDisposed);
    assert.strictEqual(group.isEmpty, true);
  });
  test("closeEditor - dirty editor handling", async () => {
    const [part, instantiationService] = await createPart();
    const accessor = instantiationService.createInstance(TestServiceAccessor);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    const group = part.activeGroup;
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    input.dirty = true;
    await group.openEditor(input);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
    let closed = await group.closeEditor(input);
    assert.strictEqual(closed, false);
    assert.ok(!input.gotDisposed);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    closed = await group.closeEditor(input);
    assert.strictEqual(closed, true);
    assert.ok(input.gotDisposed);
  });
  test("closeEditor (one, opened in multiple groups)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
    await rightGroup.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
    let closed = await rightGroup.closeEditor(input);
    assert.strictEqual(closed, true);
    assert.ok(!input.gotDisposed);
    closed = await group.closeEditor(input);
    assert.strictEqual(closed, true);
    assert.ok(input.gotDisposed);
  });
  test("closeEditors - dirty editor handling", async () => {
    const [part, instantiationService] = await createPart();
    const accessor = instantiationService.createInstance(TestServiceAccessor);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    let closeResult = false;
    const group = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    input1.dirty = true;
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input1);
    await group.openEditor(input2);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
    closeResult = await group.closeEditors([input1, input2]);
    assert.strictEqual(closeResult, false);
    assert.ok(!input1.gotDisposed);
    assert.ok(!input2.gotDisposed);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    closeResult = await group.closeEditors([input1, input2]);
    assert.strictEqual(closeResult, true);
    assert.ok(input1.gotDisposed);
    assert.ok(input2.gotDisposed);
  });
  test("closeEditors (except one)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ except: input2 });
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditorByIndex(0), input2);
  });
  test("closeEditors (except one, sticky editor)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true, sticky: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ except: input2, excludeSticky: true });
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    await group.closeEditors({ except: input2 });
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.stickyCount, 0);
    assert.strictEqual(group.getEditorByIndex(0), input2);
  });
  test("closeEditors (saved only)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ savedOnly: true });
    assert.strictEqual(group.count, 0);
  });
  test("closeEditors (saved only, sticky editor)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true, sticky: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ savedOnly: true, excludeSticky: true });
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    await group.closeEditors({ savedOnly: true });
    assert.strictEqual(group.count, 0);
  });
  test("closeEditors (direction: right)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ direction: CloseDirection.RIGHT, except: input2 });
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
  });
  test("closeEditors (direction: right, sticky editor)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true, sticky: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ direction: CloseDirection.RIGHT, except: input2, excludeSticky: true });
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    await group.closeEditors({ direction: CloseDirection.RIGHT, except: input2 });
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
  });
  test("closeEditors (direction: left)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ direction: CloseDirection.LEFT, except: input2 });
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input2);
    assert.strictEqual(group.getEditorByIndex(1), input3);
  });
  test("closeEditors (direction: left, sticky editor)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input1, options: { pinned: true, sticky: true } },
      { editor: input2, options: { pinned: true } },
      { editor: input3 }
    ]);
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ direction: CloseDirection.LEFT, except: input2, excludeSticky: true });
    assert.strictEqual(group.count, 3);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    await group.closeEditors({ direction: CloseDirection.LEFT, except: input2 });
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input2);
    assert.strictEqual(group.getEditorByIndex(1), input3);
  });
  test("closeAllEditors", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input, options: { pinned: true } },
      { editor: inputInactive }
    ]);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    await group.closeAllEditors();
    assert.strictEqual(group.isEmpty, true);
  });
  test("closeAllEditors - dirty editor handling", async () => {
    const [part, instantiationService] = await createPart();
    let closeResult = true;
    const accessor = instantiationService.createInstance(TestServiceAccessor);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    const group = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    input1.dirty = true;
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input1);
    await group.openEditor(input2);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
    closeResult = await group.closeAllEditors();
    assert.strictEqual(closeResult, false);
    assert.ok(!input1.gotDisposed);
    assert.ok(!input2.gotDisposed);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    closeResult = await group.closeAllEditors();
    assert.strictEqual(closeResult, true);
    assert.ok(input1.gotDisposed);
    assert.ok(input2.gotDisposed);
  });
  test("closeAllEditors (sticky editor)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([
      { editor: input, options: { pinned: true, sticky: true } },
      { editor: inputInactive }
    ]);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.stickyCount, 1);
    await group.closeAllEditors({ excludeSticky: true });
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.getEditorByIndex(0), input);
    await group.closeAllEditors();
    assert.strictEqual(group.isEmpty, true);
  });
  test("moveEditor (same group)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    const moveEvents = [];
    const editorGroupModelChangeListener = group.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_MOVE) {
        assert.ok(e.editor);
        moveEvents.push(e);
      }
    });
    await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    group.moveEditor(inputInactive, group, { index: 0 });
    assert.strictEqual(moveEvents.length, 1);
    assert.strictEqual(moveEvents[0].editorIndex, 0);
    assert.strictEqual(moveEvents[0].oldEditorIndex, 1);
    assert.strictEqual(moveEvents[0].editor, inputInactive);
    assert.strictEqual(group.getEditorByIndex(0), inputInactive);
    assert.strictEqual(group.getEditorByIndex(1), input);
    const res = group.moveEditors([{ editor: inputInactive, options: { index: 1 } }], group);
    assert.strictEqual(res, true);
    assert.strictEqual(moveEvents.length, 2);
    assert.strictEqual(moveEvents[1].editorIndex, 1);
    assert.strictEqual(moveEvents[1].oldEditorIndex, 0);
    assert.strictEqual(moveEvents[1].editor, inputInactive);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    editorGroupModelChangeListener.dispose();
  });
  test("moveEditor (across groups)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    group.moveEditor(inputInactive, rightGroup, { index: 0 });
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(rightGroup.count, 1);
    assert.strictEqual(rightGroup.getEditorByIndex(0), inputInactive);
  });
  test("moveEditors (across groups)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([{ editor: input1, options: { pinned: true } }, { editor: input2, options: { pinned: true } }, { editor: input3, options: { pinned: true } }]);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    group.moveEditors([{ editor: input2 }, { editor: input3 }], rightGroup);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(rightGroup.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(rightGroup.getEditorByIndex(0), input2);
    assert.strictEqual(rightGroup.getEditorByIndex(1), input3);
  });
  test("copyEditor (across groups)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    group.copyEditor(inputInactive, rightGroup, { index: 0 });
    assert.strictEqual(group.count, 2);
    assert.strictEqual(group.getEditorByIndex(0), input);
    assert.strictEqual(group.getEditorByIndex(1), inputInactive);
    assert.strictEqual(rightGroup.count, 1);
    assert.strictEqual(rightGroup.getEditorByIndex(0), inputInactive);
  });
  test("copyEditors (across groups)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([{ editor: input1, options: { pinned: true } }, { editor: input2, options: { pinned: true } }, { editor: input3, options: { pinned: true } }]);
    assert.strictEqual(group.getEditorByIndex(0), input1);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input3);
    group.copyEditors([{ editor: input1 }, { editor: input2 }, { editor: input3 }], rightGroup);
    [group, rightGroup].forEach((group2) => {
      assert.strictEqual(group2.getEditorByIndex(0), input1);
      assert.strictEqual(group2.getEditorByIndex(1), input2);
      assert.strictEqual(group2.getEditorByIndex(2), input3);
    });
  });
  test("replaceEditors", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditorByIndex(0), input);
    await group.replaceEditors([{ editor: input, replacement: inputInactive }]);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditorByIndex(0), inputInactive);
  });
  test("replaceEditors - dirty editor handling", async () => {
    const [part, instantiationService] = await createPart();
    const accessor = instantiationService.createInstance(TestServiceAccessor);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    const group = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    input1.dirty = true;
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input1);
    assert.strictEqual(group.activeEditor, input1);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
    await group.replaceEditors([{ editor: input1, replacement: input2 }]);
    assert.strictEqual(group.activeEditor, input1);
    assert.ok(!input1.gotDisposed);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    await group.replaceEditors([{ editor: input1, replacement: input2 }]);
    assert.strictEqual(group.activeEditor, input2);
    assert.ok(input1.gotDisposed);
  });
  test("replaceEditors - forceReplaceDirty flag", async () => {
    const [part, instantiationService] = await createPart();
    const accessor = instantiationService.createInstance(TestServiceAccessor);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.DONT_SAVE);
    const group = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    input1.dirty = true;
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input1);
    assert.strictEqual(group.activeEditor, input1);
    accessor.fileDialogService.setConfirmResult(ConfirmResult.CANCEL);
    await group.replaceEditors([{ editor: input1, replacement: input2, forceReplaceDirty: false }]);
    assert.strictEqual(group.activeEditor, input1);
    assert.ok(!input1.gotDisposed);
    await group.replaceEditors([{ editor: input1, replacement: input2, forceReplaceDirty: true }]);
    assert.strictEqual(group.activeEditor, input2);
    assert.ok(input1.gotDisposed);
  });
  test("replaceEditors - proper index handling", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    const input4 = createTestFileEditorInput(URI.file("foo/bar4"), TEST_EDITOR_INPUT_ID);
    const input5 = createTestFileEditorInput(URI.file("foo/bar5"), TEST_EDITOR_INPUT_ID);
    const input6 = createTestFileEditorInput(URI.file("foo/bar6"), TEST_EDITOR_INPUT_ID);
    const input7 = createTestFileEditorInput(URI.file("foo/bar7"), TEST_EDITOR_INPUT_ID);
    const input8 = createTestFileEditorInput(URI.file("foo/bar8"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input1, { pinned: true });
    await group.openEditor(input2, { pinned: true });
    await group.openEditor(input3, { pinned: true });
    await group.openEditor(input4, { pinned: true });
    await group.openEditor(input5, { pinned: true });
    await group.replaceEditors([
      { editor: input1, replacement: input6 },
      { editor: input3, replacement: input7 },
      { editor: input5, replacement: input8 }
    ]);
    assert.strictEqual(group.getEditorByIndex(0), input6);
    assert.strictEqual(group.getEditorByIndex(1), input2);
    assert.strictEqual(group.getEditorByIndex(2), input7);
    assert.strictEqual(group.getEditorByIndex(3), input4);
    assert.strictEqual(group.getEditorByIndex(4), input8);
  });
  test("replaceEditors - should be able to replace when side by side editor is involved with same input side by side", async () => {
    const [part, instantiationService] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const sideBySideInput = instantiationService.createInstance(SideBySideEditorInput, void 0, void 0, input, input);
    await group.openEditor(input);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditorByIndex(0), input);
    await group.replaceEditors([{ editor: input, replacement: sideBySideInput }]);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditorByIndex(0), sideBySideInput);
    await group.replaceEditors([{ editor: sideBySideInput, replacement: input }]);
    assert.strictEqual(group.count, 1);
    assert.strictEqual(group.getEditorByIndex(0), input);
  });
  test("find editors", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    const group2 = part.addGroup(group, GroupDirection.RIGHT);
    assert.strictEqual(group.isEmpty, true);
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar1"), `${TEST_EDITOR_INPUT_ID}-1`);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    const input4 = createTestFileEditorInput(URI.file("foo/bar4"), TEST_EDITOR_INPUT_ID);
    const input5 = createTestFileEditorInput(URI.file("foo/bar4"), `${TEST_EDITOR_INPUT_ID}-1`);
    await group.openEditor(input1, { pinned: true });
    await group.openEditor(input2, { pinned: true });
    await group.openEditor(input3, { pinned: true });
    await group.openEditor(input4, { pinned: true });
    await group2.openEditor(input5, { pinned: true });
    let foundEditors = group.findEditors(URI.file("foo/bar1"));
    assert.strictEqual(foundEditors.length, 2);
    foundEditors = group2.findEditors(URI.file("foo/bar4"));
    assert.strictEqual(foundEditors.length, 1);
  });
  test("find editors (side by side support)", async () => {
    const [part, instantiationService] = await createPart();
    const accessor = instantiationService.createInstance(TestServiceAccessor);
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const secondaryInput = createTestFileEditorInput(URI.file("foo/bar-secondary"), TEST_EDITOR_INPUT_ID);
    const primaryInput = createTestFileEditorInput(URI.file("foo/bar-primary"), `${TEST_EDITOR_INPUT_ID}-1`);
    const sideBySideEditor = new SideBySideEditorInput(void 0, void 0, secondaryInput, primaryInput, accessor.editorService);
    await group.openEditor(sideBySideEditor, { pinned: true });
    let foundEditors = group.findEditors(URI.file("foo/bar-secondary"));
    assert.strictEqual(foundEditors.length, 0);
    foundEditors = group.findEditors(URI.file("foo/bar-secondary"), { supportSideBySide: SideBySideEditor.PRIMARY });
    assert.strictEqual(foundEditors.length, 0);
    foundEditors = group.findEditors(URI.file("foo/bar-primary"), { supportSideBySide: SideBySideEditor.PRIMARY });
    assert.strictEqual(foundEditors.length, 1);
    foundEditors = group.findEditors(URI.file("foo/bar-secondary"), { supportSideBySide: SideBySideEditor.SECONDARY });
    assert.strictEqual(foundEditors.length, 1);
    foundEditors = group.findEditors(URI.file("foo/bar-primary"), { supportSideBySide: SideBySideEditor.SECONDARY });
    assert.strictEqual(foundEditors.length, 0);
    foundEditors = group.findEditors(URI.file("foo/bar-secondary"), { supportSideBySide: SideBySideEditor.ANY });
    assert.strictEqual(foundEditors.length, 1);
    foundEditors = group.findEditors(URI.file("foo/bar-primary"), { supportSideBySide: SideBySideEditor.ANY });
    assert.strictEqual(foundEditors.length, 1);
  });
  test("find neighbour group (left/right)", async function() {
    const [part] = await createPart();
    const rootGroup = part.activeGroup;
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    assert.strictEqual(rightGroup, part.findGroup({ direction: GroupDirection.RIGHT }, rootGroup));
    assert.strictEqual(rootGroup, part.findGroup({ direction: GroupDirection.LEFT }, rightGroup));
  });
  test("find neighbour group (up/down)", async function() {
    const [part] = await createPart();
    const rootGroup = part.activeGroup;
    const downGroup = part.addGroup(rootGroup, GroupDirection.DOWN);
    assert.strictEqual(downGroup, part.findGroup({ direction: GroupDirection.DOWN }, rootGroup));
    assert.strictEqual(rootGroup, part.findGroup({ direction: GroupDirection.UP }, downGroup));
  });
  test("find group by location (left/right)", async function() {
    const [part] = await createPart();
    const rootGroup = part.activeGroup;
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    const downGroup = part.addGroup(rightGroup, GroupDirection.DOWN);
    assert.strictEqual(rootGroup, part.findGroup({ location: GroupLocation.FIRST }));
    assert.strictEqual(downGroup, part.findGroup({ location: GroupLocation.LAST }));
    assert.strictEqual(rightGroup, part.findGroup({ location: GroupLocation.NEXT }, rootGroup));
    assert.strictEqual(rootGroup, part.findGroup({ location: GroupLocation.PREVIOUS }, rightGroup));
    assert.strictEqual(downGroup, part.findGroup({ location: GroupLocation.NEXT }, rightGroup));
    assert.strictEqual(rightGroup, part.findGroup({ location: GroupLocation.PREVIOUS }, downGroup));
  });
  test("applyLayout (2x2)", async function() {
    const [part] = await createPart();
    part.applyLayout({ groups: [{ groups: [{}, {}] }, { groups: [{}, {}] }], orientation: GroupOrientation.HORIZONTAL });
    assert.strictEqual(part.groups.length, 4);
  });
  test("getLayout", async function() {
    const [part] = await createPart();
    part.applyLayout({ groups: [{ groups: [{}, {}] }, { groups: [{}, {}] }], orientation: GroupOrientation.HORIZONTAL });
    let layout = part.getLayout();
    assert.strictEqual(layout.orientation, GroupOrientation.HORIZONTAL);
    assert.strictEqual(layout.groups.length, 2);
    assert.strictEqual(layout.groups[0].groups.length, 2);
    assert.strictEqual(layout.groups[1].groups.length, 2);
    part.applyLayout({ groups: [{}, {}, {}], orientation: GroupOrientation.VERTICAL });
    layout = part.getLayout();
    assert.strictEqual(layout.orientation, GroupOrientation.VERTICAL);
    assert.strictEqual(layout.groups.length, 3);
    assert.ok(typeof layout.groups[0].size === "number");
    assert.ok(typeof layout.groups[1].size === "number");
    assert.ok(typeof layout.groups[2].size === "number");
  });
  test("centeredLayout", async function() {
    const [part] = await createPart();
    part.centerLayout(true);
    assert.strictEqual(part.isLayoutCentered(), true);
  });
  test("sticky editors", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.stickyCount, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 0);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 0);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input, { pinned: true });
    await group.openEditor(inputInactive, { inactive: true });
    assert.strictEqual(group.stickyCount, 0);
    assert.strictEqual(group.isSticky(input), false);
    assert.strictEqual(group.isSticky(inputInactive), false);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 2);
    group.stickEditor(input);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.isSticky(input), true);
    assert.strictEqual(group.isSticky(inputInactive), false);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 1);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 1);
    group.unstickEditor(input);
    assert.strictEqual(group.stickyCount, 0);
    assert.strictEqual(group.isSticky(input), false);
    assert.strictEqual(group.isSticky(inputInactive), false);
    assert.strictEqual(group.getIndexOfEditor(input), 0);
    assert.strictEqual(group.getIndexOfEditor(inputInactive), 1);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 2);
    let editorMoveCounter = 0;
    const editorGroupModelChangeListener = group.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.EDITOR_MOVE) {
        assert.ok(e.editor);
        editorMoveCounter++;
      }
    });
    group.stickEditor(inputInactive);
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.isSticky(input), false);
    assert.strictEqual(group.isSticky(inputInactive), true);
    assert.strictEqual(group.getIndexOfEditor(input), 1);
    assert.strictEqual(group.getIndexOfEditor(inputInactive), 0);
    assert.strictEqual(editorMoveCounter, 1);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).length, 2);
    assert.strictEqual(group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).length, 1);
    assert.strictEqual(group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true }).length, 1);
    const inputSticky = createTestFileEditorInput(URI.file("foo/bar/sticky"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(inputSticky, { sticky: true });
    assert.strictEqual(group.stickyCount, 2);
    assert.strictEqual(group.isSticky(input), false);
    assert.strictEqual(group.isSticky(inputInactive), true);
    assert.strictEqual(group.isSticky(inputSticky), true);
    assert.strictEqual(group.getIndexOfEditor(inputInactive), 0);
    assert.strictEqual(group.getIndexOfEditor(inputSticky), 1);
    assert.strictEqual(group.getIndexOfEditor(input), 2);
    await group.openEditor(input, { sticky: true });
    assert.strictEqual(group.stickyCount, 3);
    assert.strictEqual(group.isSticky(input), true);
    assert.strictEqual(group.isSticky(inputInactive), true);
    assert.strictEqual(group.isSticky(inputSticky), true);
    assert.strictEqual(group.getIndexOfEditor(inputInactive), 0);
    assert.strictEqual(group.getIndexOfEditor(inputSticky), 1);
    assert.strictEqual(group.getIndexOfEditor(input), 2);
    editorGroupModelChangeListener.dispose();
  });
  test("sticky: true wins over index", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.stickyCount, 0);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    const inputSticky = createTestFileEditorInput(URI.file("foo/bar/sticky"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input, { pinned: true });
    await group.openEditor(inputInactive, { inactive: true });
    await group.openEditor(inputSticky, { sticky: true, index: 2 });
    assert.strictEqual(group.stickyCount, 1);
    assert.strictEqual(group.isSticky(inputSticky), true);
    assert.strictEqual(group.getIndexOfEditor(input), 1);
    assert.strictEqual(group.getIndexOfEditor(inputInactive), 2);
    assert.strictEqual(group.getIndexOfEditor(inputSticky), 0);
  });
  test("selection: setSelection, isSelected, selectedEditors", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    const input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    function isSelection(inputs) {
      for (const input of inputs) {
        if (group.selectedEditors.indexOf(input) === -1) {
          return false;
        }
      }
      return inputs.length === group.selectedEditors.length;
    }
    await group.openEditors([input1, input2, input3].map((editor) => ({ editor, options: { pinned: true } })));
    assert.strictEqual(group.isActive(input1), true);
    assert.strictEqual(group.isSelected(input1), true);
    assert.strictEqual(group.isSelected(input2), false);
    assert.strictEqual(group.isSelected(input3), false);
    assert.strictEqual(isSelection([input1]), true);
    await group.setSelection(input1, [input3]);
    assert.strictEqual(group.isActive(input1), true);
    assert.strictEqual(group.isSelected(input1), true);
    assert.strictEqual(group.isSelected(input2), false);
    assert.strictEqual(group.isSelected(input3), true);
    assert.strictEqual(isSelection([input1, input3]), true);
    await group.setSelection(input2, [input1, input3]);
    assert.strictEqual(group.isSelected(input1), true);
    assert.strictEqual(group.isActive(input2), true);
    assert.strictEqual(group.isSelected(input2), true);
    assert.strictEqual(group.isSelected(input3), true);
    assert.strictEqual(isSelection([input1, input2, input3]), true);
    await group.setSelection(input1, []);
    assert.strictEqual(group.isActive(input1), true);
    assert.strictEqual(group.isSelected(input1), true);
    assert.strictEqual(group.isSelected(input2), false);
    assert.strictEqual(group.isSelected(input3), false);
    assert.strictEqual(isSelection([input1]), true);
  });
  test("moveEditor with context (across groups)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    const thirdInput = createTestFileEditorInput(URI.file("foo/bar/third"), TEST_EDITOR_INPUT_ID);
    let leftFiredCount = 0;
    const leftGroupListener = group.onWillMoveEditor(() => {
      leftFiredCount++;
    });
    let rightFiredCount = 0;
    const rightGroupListener = rightGroup.onWillMoveEditor(() => {
      rightFiredCount++;
    });
    await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }, { editor: thirdInput }]);
    assert.strictEqual(leftFiredCount, 0);
    assert.strictEqual(rightFiredCount, 0);
    let result = group.moveEditor(input, rightGroup);
    assert.strictEqual(result, true);
    assert.strictEqual(leftFiredCount, 1);
    assert.strictEqual(rightFiredCount, 0);
    result = group.moveEditor(inputInactive, rightGroup);
    assert.strictEqual(result, true);
    assert.strictEqual(leftFiredCount, 2);
    assert.strictEqual(rightFiredCount, 0);
    result = rightGroup.moveEditor(inputInactive, group);
    assert.strictEqual(result, true);
    assert.strictEqual(leftFiredCount, 2);
    assert.strictEqual(rightFiredCount, 1);
    leftGroupListener.dispose();
    rightGroupListener.dispose();
  });
  test("moveEditor disabled", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    const thirdInput = createTestFileEditorInput(URI.file("foo/bar/third"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }, { editor: thirdInput }]);
    input.setMoveDisabled("disabled");
    const result = group.moveEditor(input, rightGroup);
    assert.strictEqual(result, false);
    assert.strictEqual(group.count, 3);
  });
  test("onWillOpenEditor", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const secondInput = createTestFileEditorInput(URI.file("foo/bar/second"), TEST_EDITOR_INPUT_ID);
    const thirdInput = createTestFileEditorInput(URI.file("foo/bar/third"), TEST_EDITOR_INPUT_ID);
    let leftFiredCount = 0;
    const leftGroupListener = group.onWillOpenEditor(() => {
      leftFiredCount++;
    });
    let rightFiredCount = 0;
    const rightGroupListener = rightGroup.onWillOpenEditor(() => {
      rightFiredCount++;
    });
    await group.openEditor(input);
    assert.strictEqual(leftFiredCount, 1);
    assert.strictEqual(rightFiredCount, 0);
    rightGroup.openEditor(secondInput);
    assert.strictEqual(leftFiredCount, 1);
    assert.strictEqual(rightFiredCount, 1);
    group.openEditor(thirdInput);
    assert.strictEqual(leftFiredCount, 2);
    assert.strictEqual(rightFiredCount, 1);
    rightGroup.moveEditor(secondInput, group);
    assert.strictEqual(leftFiredCount, 3);
    assert.strictEqual(rightFiredCount, 1);
    leftGroupListener.dispose();
    rightGroupListener.dispose();
  });
  test("copyEditor with context (across groups)", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    let firedCount = 0;
    const moveListener = group.onWillMoveEditor(() => firedCount++);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputInactive = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditors([{ editor: input, options: { pinned: true } }, { editor: inputInactive }]);
    assert.strictEqual(firedCount, 0);
    group.copyEditor(inputInactive, rightGroup, { index: 0 });
    assert.strictEqual(firedCount, 0);
    moveListener.dispose();
  });
  test("locked groups - basics", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    let leftFiredCountFromPart = 0;
    let rightFiredCountFromPart = 0;
    const partListener = part.onDidChangeGroupLocked((g) => {
      if (g === group) {
        leftFiredCountFromPart++;
      } else if (g === rightGroup) {
        rightFiredCountFromPart++;
      }
    });
    let leftFiredCountFromGroup = 0;
    const leftGroupListener = group.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.GROUP_LOCKED) {
        leftFiredCountFromGroup++;
      }
    });
    let rightFiredCountFromGroup = 0;
    const rightGroupListener = rightGroup.onDidModelChange((e) => {
      if (e.kind === GroupModelChangeKind.GROUP_LOCKED) {
        rightFiredCountFromGroup++;
      }
    });
    rightGroup.lock(true);
    rightGroup.lock(true);
    assert.strictEqual(leftFiredCountFromGroup, 0);
    assert.strictEqual(leftFiredCountFromPart, 0);
    assert.strictEqual(rightFiredCountFromGroup, 1);
    assert.strictEqual(rightFiredCountFromPart, 1);
    rightGroup.lock(false);
    rightGroup.lock(false);
    assert.strictEqual(leftFiredCountFromGroup, 0);
    assert.strictEqual(leftFiredCountFromPart, 0);
    assert.strictEqual(rightFiredCountFromGroup, 2);
    assert.strictEqual(rightFiredCountFromPart, 2);
    group.lock(true);
    group.lock(true);
    assert.strictEqual(leftFiredCountFromGroup, 1);
    assert.strictEqual(leftFiredCountFromPart, 1);
    assert.strictEqual(rightFiredCountFromGroup, 2);
    assert.strictEqual(rightFiredCountFromPart, 2);
    group.lock(false);
    group.lock(false);
    assert.strictEqual(leftFiredCountFromGroup, 2);
    assert.strictEqual(leftFiredCountFromPart, 2);
    assert.strictEqual(rightFiredCountFromGroup, 2);
    assert.strictEqual(rightFiredCountFromPart, 2);
    partListener.dispose();
    leftGroupListener.dispose();
    rightGroupListener.dispose();
  });
  test("locked groups - single group is can be locked", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    group.lock(true);
    assert.strictEqual(group.isLocked, true);
    const rightGroup = part.addGroup(group, GroupDirection.RIGHT);
    rightGroup.lock(true);
    assert.strictEqual(rightGroup.isLocked, true);
    part.removeGroup(group);
    assert.strictEqual(rightGroup.isLocked, true);
    const rightGroup2 = part.addGroup(rightGroup, GroupDirection.RIGHT);
    rightGroup.lock(true);
    rightGroup2.lock(true);
    assert.strictEqual(rightGroup.isLocked, true);
    assert.strictEqual(rightGroup2.isLocked, true);
    part.removeGroup(rightGroup2);
    assert.strictEqual(rightGroup.isLocked, true);
  });
  test("locked groups - auto locking via setting", async () => {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    await configurationService.setUserConfiguration("workbench", { "editor": { "autoLockGroups": { "testEditorInputForEditorGroupService": true } } });
    instantiationService.stub(IConfigurationService, configurationService);
    const [part] = await createPart(instantiationService);
    const rootGroup = part.activeGroup;
    let rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    let input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    let input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await rightGroup.openEditor(input1, { pinned: true });
    assert.strictEqual(rightGroup.isLocked, true);
    rightGroup.lock(false);
    await rightGroup.openEditor(input2, { pinned: true });
    assert.strictEqual(rightGroup.isLocked, false);
    await rightGroup.closeAllEditors();
    part.removeGroup(rightGroup);
    await rootGroup.closeAllEditors();
    input1 = createTestFileEditorInput(URI.file("foo/bar1"), TEST_EDITOR_INPUT_ID);
    input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await rootGroup.openEditor(input1, { pinned: true });
    assert.strictEqual(rootGroup.isLocked, false);
    rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    assert.strictEqual(rootGroup.isLocked, false);
    const leftGroup = part.addGroup(rootGroup, GroupDirection.LEFT);
    assert.strictEqual(rootGroup.isLocked, false);
    part.removeGroup(leftGroup);
    assert.strictEqual(rootGroup.isLocked, false);
  });
  test("maximize editor group", async () => {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const [part] = await createPart(instantiationService);
    const rootGroup = part.activeGroup;
    const editorPartSize = part.getSize(rootGroup);
    assert.strictEqual(part.hasMaximizedGroup(), false);
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    const rightBottomGroup = part.addGroup(rightGroup, GroupDirection.DOWN);
    const sizeRootGroup = part.getSize(rootGroup);
    const sizeRightGroup = part.getSize(rightGroup);
    const sizeRightBottomGroup = part.getSize(rightBottomGroup);
    let maximizedValue;
    const maxiizeGroupEventDisposable = part.onDidChangeGroupMaximized((maximized) => {
      maximizedValue = maximized;
    });
    assert.strictEqual(part.hasMaximizedGroup(), false);
    part.arrangeGroups(GroupsArrangement.MAXIMIZE, rootGroup);
    assert.strictEqual(part.hasMaximizedGroup(), true);
    assert.deepStrictEqual(part.getSize(rootGroup), editorPartSize);
    assert.deepStrictEqual(part.getSize(rightGroup), { width: 0, height: 0 });
    assert.deepStrictEqual(part.getSize(rightBottomGroup), { width: 0, height: 0 });
    assert.deepStrictEqual(maximizedValue, true);
    part.toggleMaximizeGroup();
    assert.strictEqual(part.hasMaximizedGroup(), false);
    assert.deepStrictEqual(part.getSize(rootGroup), sizeRootGroup);
    assert.deepStrictEqual(part.getSize(rightGroup), sizeRightGroup);
    assert.deepStrictEqual(part.getSize(rightBottomGroup), sizeRightBottomGroup);
    assert.deepStrictEqual(maximizedValue, false);
    maxiizeGroupEventDisposable.dispose();
  });
  test("transient editors - basics", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputTransient = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input, { pinned: true });
    await group.openEditor(inputTransient, { transient: true });
    assert.strictEqual(group.isTransient(input), false);
    assert.strictEqual(group.isTransient(inputTransient), true);
    await group.openEditor(input, { pinned: true });
    await group.openEditor(inputTransient, { transient: true });
    assert.strictEqual(group.isTransient(inputTransient), true);
    await group.openEditor(inputTransient, { transient: false });
    assert.strictEqual(group.isTransient(inputTransient), false);
    await group.openEditor(inputTransient, { transient: true });
    assert.strictEqual(group.isTransient(inputTransient), false);
  });
  test("transient editors - pinning clears transient", async () => {
    const [part] = await createPart();
    const group = part.activeGroup;
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const inputTransient = createTestFileEditorInput(URI.file("foo/bar/inactive"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input, { pinned: true });
    await group.openEditor(inputTransient, { transient: true });
    assert.strictEqual(group.isTransient(input), false);
    assert.strictEqual(group.isTransient(inputTransient), true);
    await group.openEditor(input, { pinned: true });
    await group.openEditor(inputTransient, { pinned: true, transient: true });
    assert.strictEqual(group.isTransient(inputTransient), false);
  });
  test("transient editors - overrides enablePreview setting", async function() {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    const configurationService = new TestConfigurationService();
    await configurationService.setUserConfiguration("workbench", { "editor": { "enablePreview": false } });
    instantiationService.stub(IConfigurationService, configurationService);
    const [part] = await createPart(instantiationService);
    const group = part.activeGroup;
    assert.strictEqual(group.isEmpty, true);
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await group.openEditor(input, { pinned: false });
    assert.strictEqual(group.isPinned(input), true);
    await group.openEditor(input2, { transient: true });
    assert.strictEqual(group.isPinned(input2), false);
    group.focus();
    assert.strictEqual(group.isPinned(input2), true);
  });
  test("working sets - create / apply state", async function() {
    const [part] = await createPart();
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const pane1 = await part.activeGroup.openEditor(input, { pinned: true });
    const pane2 = await part.sideGroup.openEditor(input2, { pinned: true });
    const state = part.createState();
    await pane2?.group.closeAllEditors();
    await pane1?.group.closeAllEditors();
    assert.strictEqual(part.count, 1);
    assert.strictEqual(part.activeGroup.isEmpty, true);
    await part.applyState(state);
    assert.strictEqual(part.count, 2);
    assert.strictEqual(part.groups[0].contains(input), true);
    assert.strictEqual(part.groups[1].contains(input2), true);
    for (const group of part.groups) {
      await group.closeAllEditors();
    }
    const emptyState = part.createState();
    await part.applyState(emptyState);
    assert.strictEqual(part.count, 1);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    input3.dirty = true;
    await part.activeGroup.openEditor(input3, { pinned: true });
    await part.applyState(emptyState);
    assert.strictEqual(part.count, 1);
    assert.strictEqual(part.groups[0].contains(input3), true);
    await part.applyState("empty");
    assert.strictEqual(part.count, 1);
    assert.strictEqual(part.groups[0].contains(input3), true);
    input3.dirty = false;
    await part.applyState("empty");
    assert.strictEqual(part.count, 1);
    assert.strictEqual(part.activeGroup.isEmpty, true);
  });
  test("working sets - apply state when the part has never been laid out does not throw and registers restored groups", async function() {
    const [part] = await createPart();
    const input = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    await part.activeGroup.openEditor(input, { pinned: true });
    await part.sideGroup.openEditor(input2, { pinned: true });
    const state = part.createState();
    for (const group of part.groups) {
      await group.closeAllEditors();
    }
    part._contentDimension = void 0;
    let addedGroups = 0;
    const listener = part.onDidAddGroup(() => addedGroups++);
    await part.applyState(state);
    listener.dispose();
    assert.strictEqual(part.count, 2);
    assert.strictEqual(part.groups[0].contains(input), true);
    assert.strictEqual(part.groups[1].contains(input2), true);
    assert.strictEqual(addedGroups, 2, `expected exactly 2 onDidAddGroup events, got ${addedGroups}`);
  });
  test("context key provider", async function() {
    const disposables2 = new DisposableStore();
    const instantiationService = workbenchInstantiationService({ contextKeyService: (instantiationService2) => instantiationService2.createInstance(MockScopableContextKeyService) }, disposables2);
    const rootContextKeyService = instantiationService.get(IContextKeyService);
    const [parts] = await createParts(instantiationService);
    const input1 = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const input3 = createTestFileEditorInput(URI.file("foo/bar3"), TEST_EDITOR_INPUT_ID);
    const group1 = parts.activeGroup;
    const group2 = parts.addGroup(group1, GroupDirection.RIGHT);
    await group2.openEditor(input2, { pinned: true });
    await group1.openEditor(input1, { pinned: true });
    const rawContextKey = new RawContextKey("testContextKey", parts.activeGroup.id);
    const contextKeyProvider = {
      contextKey: rawContextKey,
      getGroupContextKeyValue: (group) => group.id
    };
    disposables2.add(parts.registerContextKeyProvider(contextKeyProvider));
    assert.strictEqual(parts.activeGroup.id, group1.id);
    let globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
    let group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    let group2ContextKeyValue = group2.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    assert.strictEqual(globalContextKeyValue, group1.id);
    assert.strictEqual(group1ContextKeyValue, group1.id);
    assert.strictEqual(group2ContextKeyValue, group2.id);
    parts.activateGroup(group2);
    globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
    group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    group2ContextKeyValue = group2.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    assert.strictEqual(globalContextKeyValue, group2.id);
    assert.strictEqual(group1ContextKeyValue, group1.id);
    assert.strictEqual(group2ContextKeyValue, group2.id);
    const group3 = parts.addGroup(group2, GroupDirection.RIGHT);
    await group3.openEditor(input3, { pinned: true });
    globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
    group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    group2ContextKeyValue = group2.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    const group3ContextKeyValue = group3.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    assert.strictEqual(globalContextKeyValue, group3.id);
    assert.strictEqual(group1ContextKeyValue, group1.id);
    assert.strictEqual(group2ContextKeyValue, group2.id);
    assert.strictEqual(group3ContextKeyValue, group3.id);
    disposables2.dispose();
  });
  test("context key provider: onDidChange", async function() {
    const disposables2 = new DisposableStore();
    const instantiationService = workbenchInstantiationService({ contextKeyService: (instantiationService2) => instantiationService2.createInstance(MockScopableContextKeyService) }, disposables2);
    const rootContextKeyService = instantiationService.get(IContextKeyService);
    const parts = await createEditorParts(instantiationService, disposables2);
    const input1 = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const group1 = parts.activeGroup;
    const group2 = parts.addGroup(group1, GroupDirection.RIGHT);
    await group2.openEditor(input2, { pinned: true });
    await group1.openEditor(input1, { pinned: true });
    let offset = 0;
    const _onDidChange = new Emitter();
    const rawContextKey = new RawContextKey("testContextKey", parts.activeGroup.id);
    const contextKeyProvider = {
      contextKey: rawContextKey,
      getGroupContextKeyValue: (group) => group.id + offset,
      onDidChange: _onDidChange.event
    };
    disposables2.add(parts.registerContextKeyProvider(contextKeyProvider));
    assert.strictEqual(parts.activeGroup.id, group1.id);
    let globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
    let group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    let group2ContextKeyValue = group2.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    assert.strictEqual(globalContextKeyValue, group1.id + offset);
    assert.strictEqual(group1ContextKeyValue, group1.id + offset);
    assert.strictEqual(group2ContextKeyValue, group2.id + offset);
    offset = 10;
    _onDidChange.fire();
    globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
    group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    group2ContextKeyValue = group2.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    assert.strictEqual(globalContextKeyValue, group1.id + offset);
    assert.strictEqual(group1ContextKeyValue, group1.id + offset);
    assert.strictEqual(group2ContextKeyValue, group2.id + offset);
    disposables2.dispose();
  });
  test("context key provider: active editor change", async function() {
    const disposables2 = new DisposableStore();
    const instantiationService = workbenchInstantiationService({ contextKeyService: (instantiationService2) => instantiationService2.createInstance(MockScopableContextKeyService) }, disposables2);
    const rootContextKeyService = instantiationService.get(IContextKeyService);
    const parts = await createEditorParts(instantiationService, disposables2);
    const input1 = createTestFileEditorInput(URI.file("foo/bar"), TEST_EDITOR_INPUT_ID);
    const input2 = createTestFileEditorInput(URI.file("foo/bar2"), TEST_EDITOR_INPUT_ID);
    const group1 = parts.activeGroup;
    await group1.openEditor(input2, { pinned: true });
    await group1.openEditor(input1, { pinned: true });
    const rawContextKey = new RawContextKey("testContextKey", input1.resource.toString());
    const contextKeyProvider = {
      contextKey: rawContextKey,
      getGroupContextKeyValue: (group) => group.activeEditor?.resource?.toString() ?? ""
    };
    disposables2.add(parts.registerContextKeyProvider(contextKeyProvider));
    assert.strictEqual(isEqual(group1.activeEditor?.resource, input1.resource), true);
    let globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
    let group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    assert.strictEqual(globalContextKeyValue, input1.resource.toString());
    assert.strictEqual(group1ContextKeyValue, input1.resource.toString());
    await group1.openEditor(input2);
    globalContextKeyValue = rootContextKeyService.getContextKeyValue(rawContextKey.key);
    group1ContextKeyValue = group1.scopedContextKeyService.getContextKeyValue(rawContextKey.key);
    assert.strictEqual(globalContextKeyValue, input2.resource.toString());
    assert.strictEqual(group1ContextKeyValue, input2.resource.toString());
    disposables2.dispose();
  });
  test("onDidActivateGroup carries activation reason", async function() {
    const [part] = await createPart();
    const activationEvents = [];
    disposables.add(part.onDidActivateGroup((e) => activationEvents.push(e)));
    const rootGroup = part.groups[0];
    const rightGroup = part.addGroup(rootGroup, GroupDirection.RIGHT);
    activationEvents.length = 0;
    part.activateGroup(rightGroup);
    assert.strictEqual(activationEvents.length, 1);
    assert.strictEqual(activationEvents[0].group, rightGroup);
    assert.strictEqual(activationEvents[0].reason, GroupActivationReason.DEFAULT);
    activationEvents.length = 0;
    part.activateGroup(rightGroup);
    assert.strictEqual(activationEvents.length, 1);
    assert.strictEqual(activationEvents[0].group, rightGroup);
    assert.strictEqual(activationEvents[0].reason, GroupActivationReason.DEFAULT);
    activationEvents.length = 0;
    part.activateGroup(rootGroup);
    assert.strictEqual(activationEvents.length, 1);
    assert.strictEqual(activationEvents[0].group, rootGroup);
    assert.strictEqual(activationEvents[0].reason, GroupActivationReason.DEFAULT);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvdGVzdC9icm93c2VyL2VkaXRvckdyb3Vwc1NlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlLCByZWdpc3RlclRlc3RFZGl0b3IsIFRlc3RGaWxlRWRpdG9ySW5wdXQsIFRlc3RFZGl0b3JQYXJ0LCBUZXN0U2VydmljZUFjY2Vzc29yLCBJVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlLCB3b3JrYmVuY2hUZWFyZG93biwgY3JlYXRlRWRpdG9yUGFydHMsIFRlc3RFZGl0b3JQYXJ0cyB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgR3JvdXBEaXJlY3Rpb24sIEdyb3Vwc09yZGVyLCBNZXJnZUdyb3VwTW9kZSwgR3JvdXBPcmllbnRhdGlvbiwgR3JvdXBMb2NhdGlvbiwgaXNFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIEdyb3Vwc0FycmFuZ2VtZW50LCBJRWRpdG9yR3JvdXBDb250ZXh0S2V5UHJvdmlkZXIsIEdyb3VwQWN0aXZhdGlvblJlYXNvbiwgSUVkaXRvckdyb3VwQWN0aXZhdGlvbkV2ZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2xvc2VEaXJlY3Rpb24sIElFZGl0b3JQYXJ0T3B0aW9ucywgRWRpdG9yc09yZGVyLCBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgR3JvdXBNb2RlbENoYW5nZUtpbmQsIFNpZGVCeVNpZGVFZGl0b3IsIElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIEVkaXRvckV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNb2NrU2NvcGFibGVDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbmZpcm1SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgU2lkZUJ5U2lkZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9zaWRlQnlTaWRlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUdyb3VwTW9kZWxDaGFuZ2VFdmVudCwgSUdyb3VwRWRpdG9yTW92ZUV2ZW50LCBJR3JvdXBFZGl0b3JPcGVuRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvckdyb3VwTW9kZWwuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcblxuc3VpdGUoJ0VkaXRvckdyb3Vwc1NlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgVEVTVF9FRElUT1JfSUQgPSAnTXlGaWxlRWRpdG9yRm9yRWRpdG9yR3JvdXBTZXJ2aWNlJztcblx0Y29uc3QgVEVTVF9FRElUT1JfSU5QVVRfSUQgPSAndGVzdEVkaXRvcklucHV0Rm9yRWRpdG9yR3JvdXBTZXJ2aWNlJztcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRsZXQgdGVzdExvY2FsSW5zdGFudGlhdGlvblNlcnZpY2U6IElUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlclRlc3RFZGl0b3IoVEVTVF9FRElUT1JfSUQsIFtuZXcgU3luY0Rlc2NyaXB0b3IoVGVzdEZpbGVFZGl0b3JJbnB1dCksIG5ldyBTeW5jRGVzY3JpcHRvcihTaWRlQnlTaWRlRWRpdG9ySW5wdXQpXSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oYXN5bmMgKCkgPT4ge1xuXHRcdGlmICh0ZXN0TG9jYWxJbnN0YW50aWF0aW9uU2VydmljZSkge1xuXHRcdFx0YXdhaXQgd29ya2JlbmNoVGVhcmRvd24odGVzdExvY2FsSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0dGVzdExvY2FsSW5zdGFudGlhdGlvblNlcnZpY2UgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlUGFydHMoaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKSk6IFByb21pc2U8W1Rlc3RFZGl0b3JQYXJ0cywgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlXT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IFJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkuc3RhcnQoYWNjZXNzb3IpKTtcblx0XHRjb25zdCBwYXJ0cyA9IGF3YWl0IGNyZWF0ZUVkaXRvclBhcnRzKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yR3JvdXBzU2VydmljZSwgcGFydHMpO1xuXG5cdFx0dGVzdExvY2FsSW5zdGFudGlhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRcdHJldHVybiBbcGFydHMsIGluc3RhbnRpYXRpb25TZXJ2aWNlXTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVBhcnQoaW5zdGFudGlhdGlvblNlcnZpY2U/OiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UpOiBQcm9taXNlPFtUZXN0RWRpdG9yUGFydCwgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlXT4ge1xuXHRcdGNvbnN0IFtwYXJ0cywgdGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZVBhcnRzKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRyZXR1cm4gW3BhcnRzLnRlc3RNYWluUGFydCwgdGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlXTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQocmVzb3VyY2U6IFVSSSwgdHlwZUlkOiBzdHJpbmcpOiBUZXN0RmlsZUVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RmlsZUVkaXRvcklucHV0KHJlc291cmNlLCB0eXBlSWQpKTtcblx0fVxuXG5cdHRlc3QoJ2dyb3VwcyBiYXNpY3MnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7IGNvbnRleHRLZXlTZXJ2aWNlOiBpbnN0YW50aWF0aW9uU2VydmljZSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNb2NrU2NvcGFibGVDb250ZXh0S2V5U2VydmljZSkgfSwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0bGV0IGFjdGl2ZUdyb3VwTW9kZWxDaGFuZ2VDb3VudGVyID0gMDtcblx0XHRjb25zdCBhY3RpdmVHcm91cE1vZGVsQ2hhbmdlTGlzdGVuZXIgPSBwYXJ0Lm9uRGlkQ2hhbmdlQWN0aXZlR3JvdXAoKCkgPT4ge1xuXHRcdFx0YWN0aXZlR3JvdXBNb2RlbENoYW5nZUNvdW50ZXIrKztcblx0XHR9KTtcblxuXHRcdGxldCBncm91cEFkZGVkQ291bnRlciA9IDA7XG5cdFx0Y29uc3QgZ3JvdXBBZGRlZExpc3RlbmVyID0gcGFydC5vbkRpZEFkZEdyb3VwKCgpID0+IHtcblx0XHRcdGdyb3VwQWRkZWRDb3VudGVyKys7XG5cdFx0fSk7XG5cblx0XHRsZXQgZ3JvdXBSZW1vdmVkQ291bnRlciA9IDA7XG5cdFx0Y29uc3QgZ3JvdXBSZW1vdmVkTGlzdGVuZXIgPSBwYXJ0Lm9uRGlkUmVtb3ZlR3JvdXAoKCkgPT4ge1xuXHRcdFx0Z3JvdXBSZW1vdmVkQ291bnRlcisrO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGdyb3VwTW92ZWRDb3VudGVyID0gMDtcblx0XHRjb25zdCBncm91cE1vdmVkTGlzdGVuZXIgPSBwYXJ0Lm9uRGlkTW92ZUdyb3VwKCgpID0+IHtcblx0XHRcdGdyb3VwTW92ZWRDb3VudGVyKys7XG5cdFx0fSk7XG5cblx0XHQvLyBhbHdheXMgYSByb290IGdyb3VwXG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5ncm91cHNbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRWRpdG9yR3JvdXAocm9vdEdyb3VwKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZ3JvdXBzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAsIHBhcnQuZ2V0R3JvdXAocm9vdEdyb3VwLmlkKSk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnQuYWN0aXZlR3JvdXAgPT09IHJvb3RHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5sYWJlbCwgJ0dyb3VwIDEnKTtcblxuXHRcdGxldCBtcnUgPSBwYXJ0LmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnVbMF0sIHJvb3RHcm91cCk7XG5cblx0XHRjb25zdCByaWdodEdyb3VwID0gcGFydC5hZGRHcm91cChyb290R3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cCwgcGFydC5nZXRHcm91cChyaWdodEdyb3VwLmlkKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwQWRkZWRDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5ncm91cHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb3VudCwgMik7XG5cdFx0YXNzZXJ0Lm9rKHBhcnQuYWN0aXZlR3JvdXAgPT09IHJvb3RHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5sYWJlbCwgJ0dyb3VwIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5sYWJlbCwgJ0dyb3VwIDInKTtcblxuXHRcdG1ydSA9IHBhcnQuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1Lmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVswXSwgcm9vdEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1WzFdLCByaWdodEdyb3VwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVHcm91cE1vZGVsQ2hhbmdlQ291bnRlciwgMCk7XG5cblx0XHRsZXQgcm9vdEdyb3VwQWN0aXZlQ2hhbmdlQ291bnRlciA9IDA7XG5cdFx0Y29uc3Qgcm9vdEdyb3VwTW9kZWxDaGFuZ2VMaXN0ZW5lciA9IHJvb3RHcm91cC5vbkRpZE1vZGVsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfQUNUSVZFKSB7XG5cdFx0XHRcdHJvb3RHcm91cEFjdGl2ZUNoYW5nZUNvdW50ZXIrKztcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGxldCByaWdodEdyb3VwQWN0aXZlQ2hhbmdlQ291bnRlciA9IDA7XG5cdFx0Y29uc3QgcmlnaHRHcm91cE1vZGVsQ2hhbmdlTGlzdGVuZXIgPSByaWdodEdyb3VwLm9uRGlkTW9kZWxDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5HUk9VUF9BQ1RJVkUpIHtcblx0XHRcdFx0cmlnaHRHcm91cEFjdGl2ZUNoYW5nZUNvdW50ZXIrKztcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHBhcnQuYWN0aXZhdGVHcm91cChyaWdodEdyb3VwKTtcblx0XHRhc3NlcnQub2socGFydC5hY3RpdmVHcm91cCA9PT0gcmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2ZUdyb3VwTW9kZWxDaGFuZ2VDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwQWN0aXZlQ2hhbmdlQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXBBY3RpdmVDaGFuZ2VDb3VudGVyLCAxKTtcblxuXHRcdHJvb3RHcm91cE1vZGVsQ2hhbmdlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdHJpZ2h0R3JvdXBNb2RlbENoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblxuXHRcdG1ydSA9IHBhcnQuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1Lmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVswXSwgcmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVsxXSwgcm9vdEdyb3VwKTtcblxuXHRcdGNvbnN0IGRvd25Hcm91cCA9IHBhcnQuYWRkR3JvdXAocmlnaHRHcm91cCwgR3JvdXBEaXJlY3Rpb24uRE9XTik7XG5cdFx0bGV0IGRpZERpc3Bvc2UgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZG93bkdyb3VwLm9uV2lsbERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0ZGlkRGlzcG9zZSA9IHRydWU7XG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cEFkZGVkQ291bnRlciwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZ3JvdXBzLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnQuYWN0aXZlR3JvdXAgPT09IHJpZ2h0R3JvdXApO1xuXHRcdGFzc2VydC5vayghZG93bkdyb3VwLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAubGFiZWwsICdHcm91cCAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAubGFiZWwsICdHcm91cCAyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvd25Hcm91cC5sYWJlbCwgJ0dyb3VwIDMnKTtcblxuXHRcdG1ydSA9IHBhcnQuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1Lmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVswXSwgcmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVsxXSwgcm9vdEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1WzJdLCBkb3duR3JvdXApO1xuXG5cdFx0Y29uc3QgZ3JpZE9yZGVyID0gcGFydC5nZXRHcm91cHMoR3JvdXBzT3JkZXIuR1JJRF9BUFBFQVJBTkNFKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JpZE9yZGVyLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyaWRPcmRlclswXSwgcm9vdEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JpZE9yZGVyWzBdLmluZGV4LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JpZE9yZGVyWzFdLCByaWdodEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JpZE9yZGVyWzFdLmluZGV4LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JpZE9yZGVyWzJdLCBkb3duR3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncmlkT3JkZXJbMl0uaW5kZXgsIDIpO1xuXG5cdFx0cGFydC5tb3ZlR3JvdXAoZG93bkdyb3VwLCByaWdodEdyb3VwLCBHcm91cERpcmVjdGlvbi5ET1dOKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBNb3ZlZENvdW50ZXIsIDEpO1xuXG5cdFx0cGFydC5yZW1vdmVHcm91cChkb3duR3JvdXApO1xuXHRcdGFzc2VydC5vayghcGFydC5nZXRHcm91cChkb3duR3JvdXAuaWQpKTtcblx0XHRhc3NlcnQub2soIXBhcnQuaGFzR3JvdXAoZG93bkdyb3VwLmlkKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZERpc3Bvc2UsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cFJlbW92ZWRDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5ncm91cHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2socGFydC5hY3RpdmVHcm91cCA9PT0gcmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5sYWJlbCwgJ0dyb3VwIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5sYWJlbCwgJ0dyb3VwIDInKTtcblxuXHRcdG1ydSA9IHBhcnQuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1Lmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVswXSwgcmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVsxXSwgcm9vdEdyb3VwKTtcblxuXHRcdGNvbnN0IHJpZ2h0R3JvdXBDb250ZXh0S2V5U2VydmljZSA9IHBhcnQuYWN0aXZlR3JvdXAuc2NvcGVkQ29udGV4dEtleVNlcnZpY2U7XG5cdFx0Y29uc3Qgcm9vdEdyb3VwQ29udGV4dEtleVNlcnZpY2UgPSByb290R3JvdXAuc2NvcGVkQ29udGV4dEtleVNlcnZpY2U7XG5cblx0XHRhc3NlcnQub2socmlnaHRHcm91cENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2socm9vdEdyb3VwQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayhyaWdodEdyb3VwQ29udGV4dEtleVNlcnZpY2UgIT09IHJvb3RHcm91cENvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHBhcnQucmVtb3ZlR3JvdXAocmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwUmVtb3ZlZENvdW50ZXIsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Lmdyb3Vwcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5vayhwYXJ0LmFjdGl2ZUdyb3VwID09PSByb290R3JvdXApO1xuXG5cdFx0bXJ1ID0gcGFydC5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtcnUubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1WzBdLCByb290R3JvdXApO1xuXG5cdFx0cGFydC5yZW1vdmVHcm91cChyb290R3JvdXApOyAvLyBjYW5ub3QgcmVtb3ZlIHJvb3QgZ3JvdXBcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5ncm91cHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBSZW1vdmVkQ291bnRlciwgMik7XG5cdFx0YXNzZXJ0Lm9rKHBhcnQuYWN0aXZlR3JvdXAgPT09IHJvb3RHcm91cCk7XG5cblx0XHRwYXJ0LnNldEdyb3VwT3JpZW50YXRpb24ocGFydC5vcmllbnRhdGlvbiA9PT0gR3JvdXBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gR3JvdXBPcmllbnRhdGlvbi5WRVJUSUNBTCA6IEdyb3VwT3JpZW50YXRpb24uSE9SSVpPTlRBTCk7XG5cblx0XHRhY3RpdmVHcm91cE1vZGVsQ2hhbmdlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdGdyb3VwQWRkZWRMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0Z3JvdXBSZW1vdmVkTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdGdyb3VwTW92ZWRMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpZGVHcm91cCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHsgY29udGV4dEtleVNlcnZpY2U6IGluc3RhbnRpYXRpb25TZXJ2aWNlID0+IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vY2tTY29wYWJsZUNvbnRleHRLZXlTZXJ2aWNlKSB9LCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydChpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCByb290R3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDMgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCByb290R3JvdXAub3BlbkVkaXRvcihpbnB1dDEsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHBhcnQuc2lkZUdyb3VwLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb3VudCwgMik7XG5cblx0XHRwYXJ0LmFjdGl2YXRlR3JvdXAocm9vdEdyb3VwKTtcblx0XHRhd2FpdCBwYXJ0LnNpZGVHcm91cC5vcGVuRWRpdG9yKGlucHV0MywgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY291bnQsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYXZlICYgcmVzdG9yZSBzdGF0ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbcGFydCwgaW5zdGFudGlhdGlvblNlcnZpY2VdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5ncm91cHNbMF07XG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAocm9vdEdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cdFx0Y29uc3QgZG93bkdyb3VwID0gcGFydC5hZGRHcm91cChyaWdodEdyb3VwLCBHcm91cERpcmVjdGlvbi5ET1dOKTtcblxuXHRcdGNvbnN0IHJvb3RHcm91cElucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGF3YWl0IHJvb3RHcm91cC5vcGVuRWRpdG9yKHJvb3RHcm91cElucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IHJpZ2h0R3JvdXBJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRhd2FpdCByaWdodEdyb3VwLm9wZW5FZGl0b3IocmlnaHRHcm91cElucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Lmdyb3Vwcy5sZW5ndGgsIDMpO1xuXG5cdFx0cGFydC50ZXN0U2F2ZVN0YXRlKCk7XG5cdFx0cGFydC5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCBbcmVzdG9yZWRQYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3RvcmVkUGFydC5ncm91cHMubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQub2socmVzdG9yZWRQYXJ0LmdldEdyb3VwKHJvb3RHcm91cC5pZCkpO1xuXHRcdGFzc2VydC5vayhyZXN0b3JlZFBhcnQuaGFzR3JvdXAocm9vdEdyb3VwLmlkKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3RvcmVkUGFydC5nZXRHcm91cChyaWdodEdyb3VwLmlkKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3RvcmVkUGFydC5oYXNHcm91cChyaWdodEdyb3VwLmlkKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3RvcmVkUGFydC5nZXRHcm91cChkb3duR3JvdXAuaWQpKTtcblx0XHRhc3NlcnQub2socmVzdG9yZWRQYXJ0Lmhhc0dyb3VwKGRvd25Hcm91cC5pZCkpO1xuXG5cdFx0cmVzdG9yZWRQYXJ0LmNsZWFyU3RhdGUoKTtcblx0fSk7XG5cblx0dGVzdCgnZ3JvdXBzIGluZGV4IC8gbGFiZWxzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblxuXHRcdGNvbnN0IHJvb3RHcm91cCA9IHBhcnQuZ3JvdXBzWzBdO1xuXHRcdGNvbnN0IHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJvb3RHcm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXHRcdGNvbnN0IGRvd25Hcm91cCA9IHBhcnQuYWRkR3JvdXAocmlnaHRHcm91cCwgR3JvdXBEaXJlY3Rpb24uRE9XTik7XG5cblx0XHRsZXQgZ3JvdXBJbmRleENoYW5nZWRDb3VudGVyID0gMDtcblx0XHRjb25zdCBncm91cEluZGV4Q2hhbmdlZExpc3RlbmVyID0gcGFydC5vbkRpZENoYW5nZUdyb3VwSW5kZXgoKCkgPT4ge1xuXHRcdFx0Z3JvdXBJbmRleENoYW5nZWRDb3VudGVyKys7XG5cdFx0fSk7XG5cblx0XHRsZXQgaW5kZXhDaGFuZ2VDb3VudGVyID0gMDtcblx0XHRjb25zdCBsYWJlbENoYW5nZUxpc3RlbmVyID0gZG93bkdyb3VwLm9uRGlkTW9kZWxDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5HUk9VUF9JTkRFWCkge1xuXHRcdFx0XHRpbmRleENoYW5nZUNvdW50ZXIrKztcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAuaW5kZXgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwLmluZGV4LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG93bkdyb3VwLmluZGV4LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLmxhYmVsLCAnR3JvdXAgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwLmxhYmVsLCAnR3JvdXAgMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3duR3JvdXAubGFiZWwsICdHcm91cCAzJyk7XG5cblx0XHRwYXJ0LnJlbW92ZUdyb3VwKHJpZ2h0R3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAuaW5kZXgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3duR3JvdXAuaW5kZXgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAubGFiZWwsICdHcm91cCAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvd25Hcm91cC5sYWJlbCwgJ0dyb3VwIDInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5kZXhDaGFuZ2VDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBJbmRleENoYW5nZWRDb3VudGVyLCAxKTtcblxuXHRcdHBhcnQubW92ZUdyb3VwKGRvd25Hcm91cCwgcm9vdEdyb3VwLCBHcm91cERpcmVjdGlvbi5VUCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvd25Hcm91cC5pbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5pbmRleCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvd25Hcm91cC5sYWJlbCwgJ0dyb3VwIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLmxhYmVsLCAnR3JvdXAgMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmRleENoYW5nZUNvdW50ZXIsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cEluZGV4Q2hhbmdlZENvdW50ZXIsIDMpO1xuXG5cdFx0Y29uc3QgbmV3Rmlyc3RHcm91cCA9IHBhcnQuYWRkR3JvdXAoZG93bkdyb3VwLCBHcm91cERpcmVjdGlvbi5VUCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ld0ZpcnN0R3JvdXAuaW5kZXgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3duR3JvdXAuaW5kZXgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAuaW5kZXgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdGaXJzdEdyb3VwLmxhYmVsLCAnR3JvdXAgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3duR3JvdXAubGFiZWwsICdHcm91cCAyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5sYWJlbCwgJ0dyb3VwIDMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5kZXhDaGFuZ2VDb3VudGVyLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBJbmRleENoYW5nZWRDb3VudGVyLCA2KTtcblxuXHRcdGxhYmVsQ2hhbmdlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdGdyb3VwSW5kZXhDaGFuZ2VkTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdncm91cHMgbGFiZWwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5ncm91cHNbMF07XG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAocm9vdEdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cblx0XHRsZXQgcGFydExhYmVsQ2hhbmdlZENvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IGdyb3VwSW5kZXhDaGFuZ2VkTGlzdGVuZXIgPSBwYXJ0Lm9uRGlkQ2hhbmdlR3JvdXBMYWJlbCgoKSA9PiB7XG5cdFx0XHRwYXJ0TGFiZWxDaGFuZ2VkQ291bnRlcisrO1xuXHRcdH0pO1xuXG5cdFx0bGV0IHJvb3RHcm91cExhYmVsQ2hhbmdlQ291bnRlciA9IDA7XG5cdFx0Y29uc3Qgcm9vdEdyb3VwTGFiZWxDaGFuZ2VMaXN0ZW5lciA9IHJvb3RHcm91cC5vbkRpZE1vZGVsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfTEFCRUwpIHtcblx0XHRcdFx0cm9vdEdyb3VwTGFiZWxDaGFuZ2VDb3VudGVyKys7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRsZXQgcmlnaHRHcm91cExhYmVsQ2hhbmdlQ291bnRlciA9IDA7XG5cdFx0Y29uc3QgcmlnaHRHcm91cExhYmVsQ2hhbmdlTGlzdGVuZXIgPSByaWdodEdyb3VwLm9uRGlkTW9kZWxDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5HUk9VUF9MQUJFTCkge1xuXHRcdFx0XHRyaWdodEdyb3VwTGFiZWxDaGFuZ2VDb3VudGVyKys7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLmxhYmVsLCAnR3JvdXAgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwLmxhYmVsLCAnR3JvdXAgMicpO1xuXG5cdFx0cGFydC5ub3RpZnlHcm91cHNMYWJlbENoYW5nZSgnV2luZG93IDInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAubGFiZWwsICdXaW5kb3cgMjogR3JvdXAgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwLmxhYmVsLCAnV2luZG93IDI6IEdyb3VwIDInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXBMYWJlbENoYW5nZUNvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwTGFiZWxDaGFuZ2VDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydExhYmVsQ2hhbmdlZENvdW50ZXIsIDIpO1xuXG5cdFx0cGFydC5ub3RpZnlHcm91cHNMYWJlbENoYW5nZSgnV2luZG93IDMnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAubGFiZWwsICdXaW5kb3cgMzogR3JvdXAgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwLmxhYmVsLCAnV2luZG93IDM6IEdyb3VwIDInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXBMYWJlbENoYW5nZUNvdW50ZXIsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwTGFiZWxDaGFuZ2VDb3VudGVyLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydExhYmVsQ2hhbmdlZENvdW50ZXIsIDQpO1xuXG5cdFx0cm9vdEdyb3VwTGFiZWxDaGFuZ2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0cmlnaHRHcm91cExhYmVsQ2hhbmdlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdGdyb3VwSW5kZXhDaGFuZ2VkTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3B5L21lcmdlIGdyb3VwcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cblx0XHRsZXQgZ3JvdXBBZGRlZENvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IGdyb3VwQWRkZWRMaXN0ZW5lciA9IHBhcnQub25EaWRBZGRHcm91cCgoKSA9PiB7XG5cdFx0XHRncm91cEFkZGVkQ291bnRlcisrO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGdyb3VwUmVtb3ZlZENvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IGdyb3VwUmVtb3ZlZExpc3RlbmVyID0gcGFydC5vbkRpZFJlbW92ZUdyb3VwKCgpID0+IHtcblx0XHRcdGdyb3VwUmVtb3ZlZENvdW50ZXIrKztcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJvb3RHcm91cCA9IHBhcnQuZ3JvdXBzWzBdO1xuXHRcdGxldCByb290R3JvdXBEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IGRpc3Bvc2VMaXN0ZW5lciA9IHJvb3RHcm91cC5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdHJvb3RHcm91cERpc3Bvc2VkID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCByb290R3JvdXAub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAocm9vdEdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cdFx0cGFydC5hY3RpdmF0ZUdyb3VwKHJpZ2h0R3JvdXApO1xuXHRcdGNvbnN0IGRvd25Hcm91cCA9IHBhcnQuY29weUdyb3VwKHJvb3RHcm91cCwgcmlnaHRHcm91cCwgR3JvdXBEaXJlY3Rpb24uRE9XTik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwQWRkZWRDb3VudGVyLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG93bkdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQub2soZG93bkdyb3VwLmFjdGl2ZUVkaXRvciBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdGxldCByZXMgPSBwYXJ0Lm1lcmdlR3JvdXAocm9vdEdyb3VwLCByaWdodEdyb3VwLCB7IG1vZGU6IE1lcmdlR3JvdXBNb2RlLkNPUFlfRURJVE9SUyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKHJpZ2h0R3JvdXAuYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgVGVzdEZpbGVFZGl0b3JJbnB1dCk7XG5cdFx0cmVzID0gcGFydC5tZXJnZUdyb3VwKHJvb3RHcm91cCwgcmlnaHRHcm91cCwgeyBtb2RlOiBNZXJnZUdyb3VwTW9kZS5NT1ZFX0VESVRPUlMgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5jb3VudCwgMCk7XG5cdFx0cmVzID0gcGFydC5tZXJnZUdyb3VwKHJvb3RHcm91cCwgZG93bkdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBSZW1vdmVkQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cERpc3Bvc2VkLCB0cnVlKTtcblxuXHRcdGdyb3VwQWRkZWRMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0Z3JvdXBSZW1vdmVkTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdGRpc3Bvc2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0cGFydC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIGFsbCBncm91cHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5ncm91cHNbMF07XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IHJvb3RHcm91cC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRjb25zdCByaWdodEdyb3VwID0gcGFydC5hZGRHcm91cChyb290R3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0XHRhd2FpdCByaWdodEdyb3VwLm9wZW5FZGl0b3IoaW5wdXQyLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IGRvd25Hcm91cCA9IHBhcnQuY29weUdyb3VwKHJvb3RHcm91cCwgcmlnaHRHcm91cCwgR3JvdXBEaXJlY3Rpb24uRE9XTik7XG5cdFx0YXdhaXQgZG93bkdyb3VwLm9wZW5FZGl0b3IoaW5wdXQzLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdHBhcnQuYWN0aXZhdGVHcm91cChyb290R3JvdXApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5jb3VudCwgMSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBwYXJ0Lm1lcmdlQWxsR3JvdXBzKHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAuY291bnQsIDMpO1xuXG5cdFx0cGFydC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doZW5SZWFkeSAvIHdoZW5SZXN0b3JlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cblx0XHRhd2FpdCBwYXJ0LndoZW5SZWFkeTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5pc1JlYWR5LCB0cnVlKTtcblx0XHRhd2FpdCBwYXJ0LndoZW5SZXN0b3JlZDtcblx0fSk7XG5cblx0dGVzdCgnb3B0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cblx0XHRsZXQgb2xkT3B0aW9ucyE6IElFZGl0b3JQYXJ0T3B0aW9ucztcblx0XHRsZXQgbmV3T3B0aW9ucyE6IElFZGl0b3JQYXJ0T3B0aW9ucztcblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydC5vbkRpZENoYW5nZUVkaXRvclBhcnRPcHRpb25zKGV2ZW50ID0+IHtcblx0XHRcdG9sZE9wdGlvbnMgPSBldmVudC5vbGRQYXJ0T3B0aW9ucztcblx0XHRcdG5ld09wdGlvbnMgPSBldmVudC5uZXdQYXJ0T3B0aW9ucztcblx0XHR9KSk7XG5cblx0XHRjb25zdCBjdXJyZW50T3B0aW9ucyA9IHBhcnQucGFydE9wdGlvbnM7XG5cdFx0YXNzZXJ0Lm9rKGN1cnJlbnRPcHRpb25zKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChwYXJ0LmVuZm9yY2VQYXJ0T3B0aW9ucyh7IHNob3dUYWJzOiAnc2luZ2xlJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQucGFydE9wdGlvbnMuc2hvd1RhYnMsICdzaW5nbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3T3B0aW9ucy5zaG93VGFicywgJ3NpbmdsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbGRPcHRpb25zLCBjdXJyZW50T3B0aW9ucyk7XG5cblx0XHRjb25zdCBlbmZvcmNlZCA9IHBhcnQuZW5mb3JjZVBhcnRPcHRpb25zKHsgYWxsb3dEcm9wSW50b0dyb3VwOiBmYWxzZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5wYXJ0T3B0aW9ucy5hbGxvd0Ryb3BJbnRvR3JvdXAsIGZhbHNlKTtcblx0XHRlbmZvcmNlZC5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQucGFydE9wdGlvbnMuYWxsb3dEcm9wSW50b0dyb3VwLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZWRpdG9yIGJhc2ljcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGxldCBhY3RpdmVFZGl0b3JDaGFuZ2VDb3VudGVyID0gMDtcblx0XHRsZXQgZWRpdG9yRGlkT3BlbkNvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IGVkaXRvck9wZW5FdmVudHM6IElHcm91cE1vZGVsQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGxldCBlZGl0b3JDbG9zZUNvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IGVkaXRvckNsb3NlRXZlbnRzOiBJR3JvdXBNb2RlbENoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRsZXQgZWRpdG9yUGluQ291bnRlciA9IDA7XG5cdFx0bGV0IGVkaXRvclN0aWNreUNvdW50ZXIgPSAwO1xuXHRcdGxldCBlZGl0b3JDYXBhYmlsaXRpZXNDb3VudGVyID0gMDtcblx0XHRjb25zdCBlZGl0b3JHcm91cE1vZGVsQ2hhbmdlTGlzdGVuZXIgPSBncm91cC5vbkRpZE1vZGVsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX09QRU4pIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGUuZWRpdG9yKTtcblx0XHRcdFx0ZWRpdG9yRGlkT3BlbkNvdW50ZXIrKztcblx0XHRcdFx0ZWRpdG9yT3BlbkV2ZW50cy5wdXNoKGUpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9QSU4pIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGUuZWRpdG9yKTtcblx0XHRcdFx0ZWRpdG9yUGluQ291bnRlcisrO1xuXHRcdFx0fSBlbHNlIGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9TVElDS1kpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGUuZWRpdG9yKTtcblx0XHRcdFx0ZWRpdG9yU3RpY2t5Q291bnRlcisrO1xuXHRcdFx0fSBlbHNlIGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9DQVBBQklMSVRJRVMpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGUuZWRpdG9yKTtcblx0XHRcdFx0ZWRpdG9yQ2FwYWJpbGl0aWVzQ291bnRlcisrO1xuXHRcdFx0fSBlbHNlIGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9DTE9TRSkge1xuXHRcdFx0XHRhc3NlcnQub2soZS5lZGl0b3IpO1xuXHRcdFx0XHRlZGl0b3JDbG9zZUNvdW50ZXIrKztcblx0XHRcdFx0ZWRpdG9yQ2xvc2VFdmVudHMucHVzaChlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JDaGFuZ2VMaXN0ZW5lciA9IGdyb3VwLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKGUgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKGUuZWRpdG9yKTtcblx0XHRcdGFjdGl2ZUVkaXRvckNoYW5nZUNvdW50ZXIrKztcblx0XHR9KTtcblxuXHRcdGxldCBlZGl0b3JDbG9zZUNvdW50ZXIxID0gMDtcblx0XHRjb25zdCBlZGl0b3JDbG9zZUxpc3RlbmVyID0gZ3JvdXAub25EaWRDbG9zZUVkaXRvcigoKSA9PiB7XG5cdFx0XHRlZGl0b3JDbG9zZUNvdW50ZXIxKys7XG5cdFx0fSk7XG5cblx0XHRsZXQgZWRpdG9yV2lsbENsb3NlQ291bnRlciA9IDA7XG5cdFx0Y29uc3QgZWRpdG9yV2lsbENsb3NlTGlzdGVuZXIgPSBncm91cC5vbldpbGxDbG9zZUVkaXRvcigoKSA9PiB7XG5cdFx0XHRlZGl0b3JXaWxsQ2xvc2VDb3VudGVyKys7XG5cdFx0fSk7XG5cblx0XHRsZXQgZWRpdG9yRGlkQ2xvc2VDb3VudGVyID0gMDtcblx0XHRjb25zdCBlZGl0b3JEaWRDbG9zZUxpc3RlbmVyID0gZ3JvdXAub25EaWRDbG9zZUVkaXRvcigoKSA9PiB7XG5cdFx0XHRlZGl0b3JEaWRDbG9zZUNvdW50ZXIrKztcblx0XHR9KTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXRJbmFjdGl2ZSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dEluYWN0aXZlLCB7IGluYWN0aXZlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzQWN0aXZlKGlucHV0KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzQWN0aXZlKGlucHV0SW5hY3RpdmUpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKGlucHV0KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvbnRhaW5zKGlucHV0SW5hY3RpdmUpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckNhcGFiaWxpdGllc0NvdW50ZXIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JEaWRPcGVuQ291bnRlciwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChlZGl0b3JPcGVuRXZlbnRzWzBdIGFzIElHcm91cEVkaXRvck9wZW5FdmVudCkuZWRpdG9ySW5kZXgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZWRpdG9yT3BlbkV2ZW50c1sxXSBhcyBJR3JvdXBFZGl0b3JPcGVuRXZlbnQpLmVkaXRvckluZGV4LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yT3BlbkV2ZW50c1swXS5lZGl0b3IsIGlucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yT3BlbkV2ZW50c1sxXS5lZGl0b3IsIGlucHV0SW5hY3RpdmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVFZGl0b3JDaGFuZ2VDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dEluYWN0aXZlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihpbnB1dCksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRJbmRleE9mRWRpdG9yKGlucHV0SW5hY3RpdmUpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNGaXJzdChpbnB1dCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0ZpcnN0KGlucHV0SW5hY3RpdmUpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzTGFzdChpbnB1dCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNMYXN0KGlucHV0SW5hY3RpdmUpLCB0cnVlKTtcblxuXHRcdGlucHV0LmNhcGFiaWxpdGllcyA9IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlJlcXVpcmVzVHJ1c3Q7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckNhcGFiaWxpdGllc0NvdW50ZXIsIDEpO1xuXG5cdFx0aW5wdXRJbmFjdGl2ZS5jYXBhYmlsaXRpZXMgPSBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5TaW5nbGV0b247XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckNhcGFiaWxpdGllc0NvdW50ZXIsIDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnByZXZpZXdFZGl0b3IsIGlucHV0SW5hY3RpdmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dEluYWN0aXZlKSwgZmFsc2UpO1xuXHRcdGdyb3VwLnBpbkVkaXRvcihpbnB1dEluYWN0aXZlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yUGluQ291bnRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzUGlubmVkKGlucHV0SW5hY3RpdmUpLCB0cnVlKTtcblx0XHRhc3NlcnQub2soIWdyb3VwLnByZXZpZXdFZGl0b3IpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmFjdGl2ZUVkaXRvciwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3JQYW5lPy5nZXRJZCgpLCBURVNUX0VESVRPUl9JRCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblxuXHRcdGNvbnN0IG1ydSA9IGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXJ1WzBdLCBpbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ydVsxXSwgaW5wdXRJbmFjdGl2ZSk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0SW5hY3RpdmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVFZGl0b3JDaGFuZ2VDb3VudGVyLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dEluYWN0aXZlKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQpO1xuXHRcdGNvbnN0IGNsb3NlZCA9IGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9yKGlucHV0SW5hY3RpdmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9zZWQsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2ZUVkaXRvckNoYW5nZUNvdW50ZXIsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JDbG9zZUNvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZWRpdG9yQ2xvc2VFdmVudHNbMF0gYXMgSUdyb3VwRWRpdG9yT3BlbkV2ZW50KS5lZGl0b3JJbmRleCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckNsb3NlRXZlbnRzWzBdLmVkaXRvciwgaW5wdXRJbmFjdGl2ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckNsb3NlQ291bnRlcjEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JXaWxsQ2xvc2VDb3VudGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yRGlkQ2xvc2VDb3VudGVyLCAxKTtcblxuXHRcdGFzc2VydC5vayhpbnB1dEluYWN0aXZlLmdvdERpc3Bvc2VkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JTdGlja3lDb3VudGVyLCAwKTtcblx0XHRncm91cC5zdGlja0VkaXRvcihpbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvclN0aWNreUNvdW50ZXIsIDEpO1xuXHRcdGdyb3VwLnVuc3RpY2tFZGl0b3IoaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JTdGlja3lDb3VudGVyLCAyKTtcblxuXHRcdGVkaXRvckNsb3NlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdGVkaXRvcldpbGxDbG9zZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRlZGl0b3JEaWRDbG9zZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRhY3RpdmVFZGl0b3JDaGFuZ2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0ZWRpdG9yR3JvdXBNb2RlbENoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbkVkaXRvcnMgLyBjbG9zZUVkaXRvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0SW5hY3RpdmUgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyL2luYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3JzKFtcblx0XHRcdHsgZWRpdG9yOiBpbnB1dCwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LFxuXHRcdFx0eyBlZGl0b3I6IGlucHV0SW5hY3RpdmUgfVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dEluYWN0aXZlKTtcblxuXHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyhbaW5wdXQsIGlucHV0SW5hY3RpdmVdKTtcblxuXHRcdGFzc2VydC5vayhpbnB1dC5nb3REaXNwb3NlZCk7XG5cdFx0YXNzZXJ0Lm9rKGlucHV0SW5hY3RpdmUuZ290RGlzcG9zZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZUVkaXRvciAtIGRpcnR5IGVkaXRvciBoYW5kbGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgaW5zdGFudGlhdGlvblNlcnZpY2VdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0Y29uc3QgYWNjZXNzb3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U2VydmljZUFjY2Vzc29yKTtcblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KENvbmZpcm1SZXN1bHQuRE9OVF9TQVZFKTtcblxuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0aW5wdXQuZGlydHkgPSB0cnVlO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCk7XG5cblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KENvbmZpcm1SZXN1bHQuQ0FOQ0VMKTtcblx0XHRsZXQgY2xvc2VkID0gYXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9zZWQsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5vayghaW5wdXQuZ290RGlzcG9zZWQpO1xuXG5cdFx0YWNjZXNzb3IuZmlsZURpYWxvZ1NlcnZpY2Uuc2V0Q29uZmlybVJlc3VsdChDb25maXJtUmVzdWx0LkRPTlRfU0FWRSk7XG5cdFx0Y2xvc2VkID0gYXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9zZWQsIHRydWUpO1xuXG5cdFx0YXNzZXJ0Lm9rKGlucHV0LmdvdERpc3Bvc2VkKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvc2VFZGl0b3IgKG9uZSwgb3BlbmVkIGluIG11bHRpcGxlIGdyb3VwcyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cblx0XHRjb25zdCByaWdodEdyb3VwID0gcGFydC5hZGRHcm91cChncm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dEluYWN0aXZlID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2Jhci9pbmFjdGl2ZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbeyBlZGl0b3I6IGlucHV0LCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sIHsgZWRpdG9yOiBpbnB1dEluYWN0aXZlIH1dKTtcblx0XHRhd2FpdCByaWdodEdyb3VwLm9wZW5FZGl0b3JzKFt7IGVkaXRvcjogaW5wdXQsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSwgeyBlZGl0b3I6IGlucHV0SW5hY3RpdmUgfV0pO1xuXG5cdFx0bGV0IGNsb3NlZCA9IGF3YWl0IHJpZ2h0R3JvdXAuY2xvc2VFZGl0b3IoaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9zZWQsIHRydWUpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFpbnB1dC5nb3REaXNwb3NlZCk7XG5cblx0XHRjbG9zZWQgPSBhd2FpdCBncm91cC5jbG9zZUVkaXRvcihpbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb3NlZCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQub2soaW5wdXQuZ290RGlzcG9zZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZUVkaXRvcnMgLSBkaXJ0eSBlZGl0b3IgaGFuZGxpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnQsIGluc3RhbnRpYXRpb25TZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblxuXHRcdGNvbnN0IGFjY2Vzc29yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFNlcnZpY2VBY2Nlc3Nvcik7XG5cdFx0YWNjZXNzb3IuZmlsZURpYWxvZ1NlcnZpY2Uuc2V0Q29uZmlybVJlc3VsdChDb25maXJtUmVzdWx0LkRPTlRfU0FWRSk7XG5cdFx0bGV0IGNsb3NlUmVzdWx0ID0gZmFsc2U7XG5cblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0aW5wdXQxLmRpcnR5ID0gdHJ1ZTtcblxuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxKTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0Mik7XG5cblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KENvbmZpcm1SZXN1bHQuQ0FOQ0VMKTtcblx0XHRjbG9zZVJlc3VsdCA9IGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyhbaW5wdXQxLCBpbnB1dDJdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VSZXN1bHQsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5vayghaW5wdXQxLmdvdERpc3Bvc2VkKTtcblx0XHRhc3NlcnQub2soIWlucHV0Mi5nb3REaXNwb3NlZCk7XG5cblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KENvbmZpcm1SZXN1bHQuRE9OVF9TQVZFKTtcblx0XHRjbG9zZVJlc3VsdCA9IGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyhbaW5wdXQxLCBpbnB1dDJdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VSZXN1bHQsIHRydWUpO1xuXG5cdFx0YXNzZXJ0Lm9rKGlucHV0MS5nb3REaXNwb3NlZCk7XG5cdFx0YXNzZXJ0Lm9rKGlucHV0Mi5nb3REaXNwb3NlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NlRWRpdG9ycyAoZXhjZXB0IG9uZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3JzKFtcblx0XHRcdHsgZWRpdG9yOiBpbnB1dDEsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSxcblx0XHRcdHsgZWRpdG9yOiBpbnB1dDIsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSxcblx0XHRcdHsgZWRpdG9yOiBpbnB1dDMgfVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgyKSwgaW5wdXQzKTtcblxuXHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyh7IGV4Y2VwdDogaW5wdXQyIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0Mik7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NlRWRpdG9ycyAoZXhjZXB0IG9uZSwgc3RpY2t5IGVkaXRvciknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3JzKFtcblx0XHRcdHsgZWRpdG9yOiBpbnB1dDEsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUgfSB9LFxuXHRcdFx0eyBlZGl0b3I6IGlucHV0Miwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LFxuXHRcdFx0eyBlZGl0b3I6IGlucHV0MyB9XG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zdGlja3lDb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMSksIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMiksIGlucHV0Myk7XG5cblx0XHRhd2FpdCBncm91cC5jbG9zZUVkaXRvcnMoeyBleGNlcHQ6IGlucHV0MiwgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXQyKTtcblxuXHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyh7IGV4Y2VwdDogaW5wdXQyIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZUVkaXRvcnMgKHNhdmVkIG9ubHkpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDMgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQxLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQyLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQzIH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMSksIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMiksIGlucHV0Myk7XG5cblx0XHRhd2FpdCBncm91cC5jbG9zZUVkaXRvcnMoeyBzYXZlZE9ubHk6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvc2VFZGl0b3JzIChzYXZlZCBvbmx5LCBzdGlja3kgZWRpdG9yKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcnMoW1xuXHRcdFx0eyBlZGl0b3I6IGlucHV0MSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQyLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQzIH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgyKSwgaW5wdXQzKTtcblxuXHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyh7IHNhdmVkT25seTogdHJ1ZSwgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblxuXHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyh7IHNhdmVkT25seTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZUVkaXRvcnMgKGRpcmVjdGlvbjogcmlnaHQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDMgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQxLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQyLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQzIH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMSksIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMiksIGlucHV0Myk7XG5cblx0XHRhd2FpdCBncm91cC5jbG9zZUVkaXRvcnMoeyBkaXJlY3Rpb246IENsb3NlRGlyZWN0aW9uLlJJR0hULCBleGNlcHQ6IGlucHV0MiB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZUVkaXRvcnMgKGRpcmVjdGlvbjogcmlnaHQsIHN0aWNreSBlZGl0b3IpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDMgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQxLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSwgc3RpY2t5OiB0cnVlIH0gfSxcblx0XHRcdHsgZWRpdG9yOiBpbnB1dDIsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSxcblx0XHRcdHsgZWRpdG9yOiBpbnB1dDMgfVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDIpLCBpbnB1dDMpO1xuXG5cdFx0YXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKHsgZGlyZWN0aW9uOiBDbG9zZURpcmVjdGlvbi5SSUdIVCwgZXhjZXB0OiBpbnB1dDIsIGV4Y2x1ZGVTdGlja3k6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dDIpO1xuXG5cdFx0YXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKHsgZGlyZWN0aW9uOiBDbG9zZURpcmVjdGlvbi5SSUdIVCwgZXhjZXB0OiBpbnB1dDIgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXQyKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvc2VFZGl0b3JzIChkaXJlY3Rpb246IGxlZnQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDMgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQxLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQyLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQzIH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMSksIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMiksIGlucHV0Myk7XG5cblx0XHRhd2FpdCBncm91cC5jbG9zZUVkaXRvcnMoeyBkaXJlY3Rpb246IENsb3NlRGlyZWN0aW9uLkxFRlQsIGV4Y2VwdDogaW5wdXQyIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMSksIGlucHV0Myk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3NlRWRpdG9ycyAoZGlyZWN0aW9uOiBsZWZ0LCBzdGlja3kgZWRpdG9yKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcnMoW1xuXHRcdFx0eyBlZGl0b3I6IGlucHV0MSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUsIHN0aWNreTogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQyLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQzIH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgyKSwgaW5wdXQzKTtcblxuXHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyh7IGRpcmVjdGlvbjogQ2xvc2VEaXJlY3Rpb24uTEVGVCwgZXhjZXB0OiBpbnB1dDIsIGV4Y2x1ZGVTdGlja3k6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDIpLCBpbnB1dDMpO1xuXG5cdFx0YXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKHsgZGlyZWN0aW9uOiBDbG9zZURpcmVjdGlvbi5MRUZULCBleGNlcHQ6IGlucHV0MiB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZUFsbEVkaXRvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBpbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0SW5hY3RpdmUgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyL2luYWN0aXZlJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3JzKFtcblx0XHRcdHsgZWRpdG9yOiBpbnB1dCwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LFxuXHRcdFx0eyBlZGl0b3I6IGlucHV0SW5hY3RpdmUgfVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dEluYWN0aXZlKTtcblxuXHRcdGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvc2VBbGxFZGl0b3JzIC0gZGlydHkgZWRpdG9yIGhhbmRsaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0LCBpbnN0YW50aWF0aW9uU2VydmljZV0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0bGV0IGNsb3NlUmVzdWx0ID0gdHJ1ZTtcblxuXHRcdGNvbnN0IGFjY2Vzc29yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFNlcnZpY2VBY2Nlc3Nvcik7XG5cdFx0YWNjZXNzb3IuZmlsZURpYWxvZ1NlcnZpY2Uuc2V0Q29uZmlybVJlc3VsdChDb25maXJtUmVzdWx0LkRPTlRfU0FWRSk7XG5cblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0aW5wdXQxLmRpcnR5ID0gdHJ1ZTtcblxuXHRcdGNvbnN0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxKTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0Mik7XG5cblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KENvbmZpcm1SZXN1bHQuQ0FOQ0VMKTtcblx0XHRjbG9zZVJlc3VsdCA9IGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb3NlUmVzdWx0LCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKCFpbnB1dDEuZ290RGlzcG9zZWQpO1xuXHRcdGFzc2VydC5vayghaW5wdXQyLmdvdERpc3Bvc2VkKTtcblxuXHRcdGFjY2Vzc29yLmZpbGVEaWFsb2dTZXJ2aWNlLnNldENvbmZpcm1SZXN1bHQoQ29uZmlybVJlc3VsdC5ET05UX1NBVkUpO1xuXHRcdGNsb3NlUmVzdWx0ID0gYXdhaXQgZ3JvdXAuY2xvc2VBbGxFZGl0b3JzKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvc2VSZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5vayhpbnB1dDEuZ290RGlzcG9zZWQpO1xuXHRcdGFzc2VydC5vayhpbnB1dDIuZ290RGlzcG9zZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZUFsbEVkaXRvcnMgKHN0aWNreSBlZGl0b3IpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dEluYWN0aXZlID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2Jhci9pbmFjdGl2ZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9ycyhbXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlLCBzdGlja3k6IHRydWUgfSB9LFxuXHRcdFx0eyBlZGl0b3I6IGlucHV0SW5hY3RpdmUgfVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDEpO1xuXG5cdFx0YXdhaXQgZ3JvdXAuY2xvc2VBbGxFZGl0b3JzKHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAuY2xvc2VBbGxFZGl0b3JzKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmVFZGl0b3IgKHNhbWUgZ3JvdXApJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dEluYWN0aXZlID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2Jhci9pbmFjdGl2ZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRjb25zdCBtb3ZlRXZlbnRzOiBJR3JvdXBNb2RlbENoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRjb25zdCBlZGl0b3JHcm91cE1vZGVsQ2hhbmdlTGlzdGVuZXIgPSBncm91cC5vbkRpZE1vZGVsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX01PVkUpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGUuZWRpdG9yKTtcblx0XHRcdFx0bW92ZUV2ZW50cy5wdXNoKGUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dCwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LCB7IGVkaXRvcjogaW5wdXRJbmFjdGl2ZSB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dEluYWN0aXZlKTtcblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0SW5hY3RpdmUsIGdyb3VwLCB7IGluZGV4OiAwIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3ZlRXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChtb3ZlRXZlbnRzWzBdIGFzIElHcm91cEVkaXRvck9wZW5FdmVudCkuZWRpdG9ySW5kZXgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgobW92ZUV2ZW50c1swXSBhcyBJR3JvdXBFZGl0b3JNb3ZlRXZlbnQpLm9sZEVkaXRvckluZGV4LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW92ZUV2ZW50c1swXS5lZGl0b3IsIGlucHV0SW5hY3RpdmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dEluYWN0aXZlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXQpO1xuXG5cdFx0Y29uc3QgcmVzID0gZ3JvdXAubW92ZUVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dEluYWN0aXZlLCBvcHRpb25zOiB7IGluZGV4OiAxIH0gfV0sIGdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW92ZUV2ZW50cy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgobW92ZUV2ZW50c1sxXSBhcyBJR3JvdXBFZGl0b3JPcGVuRXZlbnQpLmVkaXRvckluZGV4LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKG1vdmVFdmVudHNbMV0gYXMgSUdyb3VwRWRpdG9yTW92ZUV2ZW50KS5vbGRFZGl0b3JJbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vdmVFdmVudHNbMV0uZWRpdG9yLCBpbnB1dEluYWN0aXZlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dEluYWN0aXZlKTtcblxuXHRcdGVkaXRvckdyb3VwTW9kZWxDaGFuZ2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmVFZGl0b3IgKGFjcm9zcyBncm91cHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAoZ3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXRJbmFjdGl2ZSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dCwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LCB7IGVkaXRvcjogaW5wdXRJbmFjdGl2ZSB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dEluYWN0aXZlKTtcblx0XHRncm91cC5tb3ZlRWRpdG9yKGlucHV0SW5hY3RpdmUsIHJpZ2h0R3JvdXAsIHsgaW5kZXg6IDAgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dEluYWN0aXZlKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZUVkaXRvcnMgKGFjcm9zcyBncm91cHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAoZ3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dDEsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSwgeyBlZGl0b3I6IGlucHV0Miwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LCB7IGVkaXRvcjogaW5wdXQzLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgyKSwgaW5wdXQzKTtcblx0XHRncm91cC5tb3ZlRWRpdG9ycyhbeyBlZGl0b3I6IGlucHV0MiB9LCB7IGVkaXRvcjogaW5wdXQzIH1dLCByaWdodEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuY291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMSksIGlucHV0Myk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHlFZGl0b3IgKGFjcm9zcyBncm91cHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAoZ3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXRJbmFjdGl2ZSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dCwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9LCB7IGVkaXRvcjogaW5wdXRJbmFjdGl2ZSB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dEluYWN0aXZlKTtcblx0XHRncm91cC5jb3B5RWRpdG9yKGlucHV0SW5hY3RpdmUsIHJpZ2h0R3JvdXAsIHsgaW5kZXg6IDAgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dEluYWN0aXZlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXRJbmFjdGl2ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHlFZGl0b3JzIChhY3Jvc3MgZ3JvdXBzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKGdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0MyA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3JzKFt7IGVkaXRvcjogaW5wdXQxLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0sIHsgZWRpdG9yOiBpbnB1dDIsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSwgeyBlZGl0b3I6IGlucHV0Mywgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMSksIGlucHV0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMiksIGlucHV0Myk7XG5cdFx0Z3JvdXAuY29weUVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dDEgfSwgeyBlZGl0b3I6IGlucHV0MiB9LCB7IGVkaXRvcjogaW5wdXQzIH1dLCByaWdodEdyb3VwKTtcblx0XHRbZ3JvdXAsIHJpZ2h0R3JvdXBdLmZvckVhY2goZ3JvdXAgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0MSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgxKSwgaW5wdXQyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDIpLCBpbnB1dDMpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlRWRpdG9ycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXRJbmFjdGl2ZSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAucmVwbGFjZUVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dCwgcmVwbGFjZW1lbnQ6IGlucHV0SW5hY3RpdmUgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0SW5hY3RpdmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlRWRpdG9ycyAtIGRpcnR5IGVkaXRvciBoYW5kbGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgaW5zdGFudGlhdGlvblNlcnZpY2VdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0Y29uc3QgYWNjZXNzb3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U2VydmljZUFjY2Vzc29yKTtcblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KENvbmZpcm1SZXN1bHQuRE9OVF9TQVZFKTtcblxuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRpbnB1dDEuZGlydHkgPSB0cnVlO1xuXG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0MSk7XG5cblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KENvbmZpcm1SZXN1bHQuQ0FOQ0VMKTtcblx0XHRhd2FpdCBncm91cC5yZXBsYWNlRWRpdG9ycyhbeyBlZGl0b3I6IGlucHV0MSwgcmVwbGFjZW1lbnQ6IGlucHV0MiB9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5vayghaW5wdXQxLmdvdERpc3Bvc2VkKTtcblxuXHRcdGFjY2Vzc29yLmZpbGVEaWFsb2dTZXJ2aWNlLnNldENvbmZpcm1SZXN1bHQoQ29uZmlybVJlc3VsdC5ET05UX1NBVkUpO1xuXHRcdGF3YWl0IGdyb3VwLnJlcGxhY2VFZGl0b3JzKFt7IGVkaXRvcjogaW5wdXQxLCByZXBsYWNlbWVudDogaW5wdXQyIH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0Mik7XG5cdFx0YXNzZXJ0Lm9rKGlucHV0MS5nb3REaXNwb3NlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2VFZGl0b3JzIC0gZm9yY2VSZXBsYWNlRGlydHkgZmxhZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgaW5zdGFudGlhdGlvblNlcnZpY2VdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0Y29uc3QgYWNjZXNzb3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U2VydmljZUFjY2Vzc29yKTtcblx0XHRhY2Nlc3Nvci5maWxlRGlhbG9nU2VydmljZS5zZXRDb25maXJtUmVzdWx0KENvbmZpcm1SZXN1bHQuRE9OVF9TQVZFKTtcblxuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRpbnB1dDEuZGlydHkgPSB0cnVlO1xuXG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5hY3RpdmVFZGl0b3IsIGlucHV0MSk7XG5cdFx0YWNjZXNzb3IuZmlsZURpYWxvZ1NlcnZpY2Uuc2V0Q29uZmlybVJlc3VsdChDb25maXJtUmVzdWx0LkNBTkNFTCk7XG5cdFx0YXdhaXQgZ3JvdXAucmVwbGFjZUVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dDEsIHJlcGxhY2VtZW50OiBpbnB1dDIsIGZvcmNlUmVwbGFjZURpcnR5OiBmYWxzZSB9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDEpO1xuXHRcdGFzc2VydC5vayghaW5wdXQxLmdvdERpc3Bvc2VkKTtcblxuXHRcdGF3YWl0IGdyb3VwLnJlcGxhY2VFZGl0b3JzKFt7IGVkaXRvcjogaW5wdXQxLCByZXBsYWNlbWVudDogaW5wdXQyLCBmb3JjZVJlcGxhY2VEaXJ0eTogdHJ1ZSB9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5vayhpbnB1dDEuZ290RGlzcG9zZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlRWRpdG9ycyAtIHByb3BlciBpbmRleCBoYW5kbGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0NCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXI0JyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDUgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyNScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRjb25zdCBpbnB1dDYgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyNicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQ3ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjcnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IGlucHV0OCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXI4JyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dDMsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQ0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0NSwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRhd2FpdCBncm91cC5yZXBsYWNlRWRpdG9ycyhbXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQxLCByZXBsYWNlbWVudDogaW5wdXQ2IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQzLCByZXBsYWNlbWVudDogaW5wdXQ3IH0sXG5cdFx0XHR7IGVkaXRvcjogaW5wdXQ1LCByZXBsYWNlbWVudDogaW5wdXQ4IH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDApLCBpbnB1dDYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDEpLCBpbnB1dDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDIpLCBpbnB1dDcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDMpLCBpbnB1dDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JCeUluZGV4KDQpLCBpbnB1dDgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlRWRpdG9ycyAtIHNob3VsZCBiZSBhYmxlIHRvIHJlcGxhY2Ugd2hlbiBzaWRlIGJ5IHNpZGUgZWRpdG9yIGlzIGludm9sdmVkIHdpdGggc2FtZSBpbnB1dCBzaWRlIGJ5IHNpZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnQsIGluc3RhbnRpYXRpb25TZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBzaWRlQnlTaWRlSW5wdXQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaWRlQnlTaWRlRWRpdG9ySW5wdXQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBpbnB1dCwgaW5wdXQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgaW5wdXQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAucmVwbGFjZUVkaXRvcnMoW3sgZWRpdG9yOiBpbnB1dCwgcmVwbGFjZW1lbnQ6IHNpZGVCeVNpZGVJbnB1dCB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleCgwKSwgc2lkZUJ5U2lkZUlucHV0KTtcblxuXHRcdGF3YWl0IGdyb3VwLnJlcGxhY2VFZGl0b3JzKFt7IGVkaXRvcjogc2lkZUJ5U2lkZUlucHV0LCByZXBsYWNlbWVudDogaW5wdXQgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvckJ5SW5kZXgoMCksIGlucHV0KTtcblx0fSk7XG5cblx0dGVzdCgnZmluZCBlZGl0b3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3QgZ3JvdXAyID0gcGFydC5hZGRHcm91cChncm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMScpLCBgJHtURVNUX0VESVRPUl9JTlBVVF9JRH0tMWApO1xuXHRcdGNvbnN0IGlucHV0MyA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIzJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyNCcpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQ1ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjQnKSwgYCR7VEVTVF9FRElUT1JfSU5QVVRfSUR9LTFgKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dDMsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXQ0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBncm91cDIub3BlbkVkaXRvcihpbnB1dDUsIHsgcGlubmVkOiB0cnVlIH0pO1xuXG5cdFx0bGV0IGZvdW5kRWRpdG9ycyA9IGdyb3VwLmZpbmRFZGl0b3JzKFVSSS5maWxlKCdmb28vYmFyMScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmRFZGl0b3JzLmxlbmd0aCwgMik7XG5cdFx0Zm91bmRFZGl0b3JzID0gZ3JvdXAyLmZpbmRFZGl0b3JzKFVSSS5maWxlKCdmb28vYmFyNCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmRFZGl0b3JzLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmQgZWRpdG9ycyAoc2lkZSBieSBzaWRlIHN1cHBvcnQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0LCBpbnN0YW50aWF0aW9uU2VydmljZV0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cblx0XHRjb25zdCBhY2Nlc3NvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTZXJ2aWNlQWNjZXNzb3IpO1xuXG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IHNlY29uZGFyeUlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2Jhci1zZWNvbmRhcnknKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IHByaW1hcnlJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXItcHJpbWFyeScpLCBgJHtURVNUX0VESVRPUl9JTlBVVF9JRH0tMWApO1xuXG5cdFx0Y29uc3Qgc2lkZUJ5U2lkZUVkaXRvciA9IG5ldyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQodW5kZWZpbmVkLCB1bmRlZmluZWQsIHNlY29uZGFyeUlucHV0LCBwcmltYXJ5SW5wdXQsIGFjY2Vzc29yLmVkaXRvclNlcnZpY2UpO1xuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3Ioc2lkZUJ5U2lkZUVkaXRvciwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRsZXQgZm91bmRFZGl0b3JzID0gZ3JvdXAuZmluZEVkaXRvcnMoVVJJLmZpbGUoJ2Zvby9iYXItc2Vjb25kYXJ5JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZEVkaXRvcnMubGVuZ3RoLCAwKTtcblxuXHRcdGZvdW5kRWRpdG9ycyA9IGdyb3VwLmZpbmRFZGl0b3JzKFVSSS5maWxlKCdmb28vYmFyLXNlY29uZGFyeScpLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kRWRpdG9ycy5sZW5ndGgsIDApO1xuXG5cdFx0Zm91bmRFZGl0b3JzID0gZ3JvdXAuZmluZEVkaXRvcnMoVVJJLmZpbGUoJ2Zvby9iYXItcHJpbWFyeScpLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kRWRpdG9ycy5sZW5ndGgsIDEpO1xuXG5cdFx0Zm91bmRFZGl0b3JzID0gZ3JvdXAuZmluZEVkaXRvcnMoVVJJLmZpbGUoJ2Zvby9iYXItc2Vjb25kYXJ5JyksIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuU0VDT05EQVJZIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZEVkaXRvcnMubGVuZ3RoLCAxKTtcblxuXHRcdGZvdW5kRWRpdG9ycyA9IGdyb3VwLmZpbmRFZGl0b3JzKFVSSS5maWxlKCdmb28vYmFyLXByaW1hcnknKSwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5TRUNPTkRBUlkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kRWRpdG9ycy5sZW5ndGgsIDApO1xuXG5cdFx0Zm91bmRFZGl0b3JzID0gZ3JvdXAuZmluZEVkaXRvcnMoVVJJLmZpbGUoJ2Zvby9iYXItc2Vjb25kYXJ5JyksIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuQU5ZIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZEVkaXRvcnMubGVuZ3RoLCAxKTtcblxuXHRcdGZvdW5kRWRpdG9ycyA9IGdyb3VwLmZpbmRFZGl0b3JzKFVSSS5maWxlKCdmb28vYmFyLXByaW1hcnknKSwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5BTlkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdW5kRWRpdG9ycy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kIG5laWdoYm91ciBncm91cCAobGVmdC9yaWdodCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXHRcdGNvbnN0IHJvb3RHcm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAocm9vdEdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cCwgcGFydC5maW5kR3JvdXAoeyBkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uLlJJR0hUIH0sIHJvb3RHcm91cCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAsIHBhcnQuZmluZEdyb3VwKHsgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbi5MRUZUIH0sIHJpZ2h0R3JvdXApKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZCBuZWlnaGJvdXIgZ3JvdXAgKHVwL2Rvd24pJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCByb290R3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGNvbnN0IGRvd25Hcm91cCA9IHBhcnQuYWRkR3JvdXAocm9vdEdyb3VwLCBHcm91cERpcmVjdGlvbi5ET1dOKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3duR3JvdXAsIHBhcnQuZmluZEdyb3VwKHsgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbi5ET1dOIH0sIHJvb3RHcm91cCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAsIHBhcnQuZmluZEdyb3VwKHsgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbi5VUCB9LCBkb3duR3JvdXApKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZCBncm91cCBieSBsb2NhdGlvbiAobGVmdC9yaWdodCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXHRcdGNvbnN0IHJvb3RHcm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAocm9vdEdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cdFx0Y29uc3QgZG93bkdyb3VwID0gcGFydC5hZGRHcm91cChyaWdodEdyb3VwLCBHcm91cERpcmVjdGlvbi5ET1dOKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAsIHBhcnQuZmluZEdyb3VwKHsgbG9jYXRpb246IEdyb3VwTG9jYXRpb24uRklSU1QgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3duR3JvdXAsIHBhcnQuZmluZEdyb3VwKHsgbG9jYXRpb246IEdyb3VwTG9jYXRpb24uTEFTVCB9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cCwgcGFydC5maW5kR3JvdXAoeyBsb2NhdGlvbjogR3JvdXBMb2NhdGlvbi5ORVhUIH0sIHJvb3RHcm91cCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAsIHBhcnQuZmluZEdyb3VwKHsgbG9jYXRpb246IEdyb3VwTG9jYXRpb24uUFJFVklPVVMgfSwgcmlnaHRHcm91cCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvd25Hcm91cCwgcGFydC5maW5kR3JvdXAoeyBsb2NhdGlvbjogR3JvdXBMb2NhdGlvbi5ORVhUIH0sIHJpZ2h0R3JvdXApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cCwgcGFydC5maW5kR3JvdXAoeyBsb2NhdGlvbjogR3JvdXBMb2NhdGlvbi5QUkVWSU9VUyB9LCBkb3duR3JvdXApKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHlMYXlvdXQgKDJ4MiknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0cGFydC5hcHBseUxheW91dCh7IGdyb3VwczogW3sgZ3JvdXBzOiBbe30sIHt9XSB9LCB7IGdyb3VwczogW3t9LCB7fV0gfV0sIG9yaWVudGF0aW9uOiBHcm91cE9yaWVudGF0aW9uLkhPUklaT05UQUwgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5ncm91cHMubGVuZ3RoLCA0KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TGF5b3V0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblxuXHRcdC8vIDJ4MlxuXHRcdHBhcnQuYXBwbHlMYXlvdXQoeyBncm91cHM6IFt7IGdyb3VwczogW3t9LCB7fV0gfSwgeyBncm91cHM6IFt7fSwge31dIH1dLCBvcmllbnRhdGlvbjogR3JvdXBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIH0pO1xuXHRcdGxldCBsYXlvdXQgPSBwYXJ0LmdldExheW91dCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxheW91dC5vcmllbnRhdGlvbiwgR3JvdXBPcmllbnRhdGlvbi5IT1JJWk9OVEFMKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGF5b3V0Lmdyb3Vwcy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXlvdXQuZ3JvdXBzWzBdLmdyb3VwcyEubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGF5b3V0Lmdyb3Vwc1sxXS5ncm91cHMhLmxlbmd0aCwgMik7XG5cblx0XHQvLyAzIGNvbHVtbnNcblx0XHRwYXJ0LmFwcGx5TGF5b3V0KHsgZ3JvdXBzOiBbe30sIHt9LCB7fV0sIG9yaWVudGF0aW9uOiBHcm91cE9yaWVudGF0aW9uLlZFUlRJQ0FMIH0pO1xuXHRcdGxheW91dCA9IHBhcnQuZ2V0TGF5b3V0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGF5b3V0Lm9yaWVudGF0aW9uLCBHcm91cE9yaWVudGF0aW9uLlZFUlRJQ0FMKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGF5b3V0Lmdyb3Vwcy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5vayh0eXBlb2YgbGF5b3V0Lmdyb3Vwc1swXS5zaXplID09PSAnbnVtYmVyJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBsYXlvdXQuZ3JvdXBzWzFdLnNpemUgPT09ICdudW1iZXInKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIGxheW91dC5ncm91cHNbMl0uc2l6ZSA9PT0gJ251bWJlcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdjZW50ZXJlZExheW91dCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cblx0XHRwYXJ0LmNlbnRlckxheW91dCh0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmlzTGF5b3V0Q2VudGVyZWQoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0aWNreSBlZGl0b3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCwgeyBleGNsdWRlU3RpY2t5OiB0cnVlIH0pLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFLCB7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSkubGVuZ3RoLCAwKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXRJbmFjdGl2ZSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dEluYWN0aXZlLCB7IGluYWN0aXZlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0SW5hY3RpdmUpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwsIHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSwgeyBleGNsdWRlU3RpY2t5OiB0cnVlIH0pLmxlbmd0aCwgMik7XG5cblx0XHRncm91cC5zdGlja0VkaXRvcihpbnB1dCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dEluYWN0aXZlKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMLCB7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUsIHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KS5sZW5ndGgsIDEpO1xuXG5cdFx0Z3JvdXAudW5zdGlja0VkaXRvcihpbnB1dCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1N0aWNreShpbnB1dCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXRJbmFjdGl2ZSksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRJbmRleE9mRWRpdG9yKGlucHV0KSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEluZGV4T2ZFZGl0b3IoaW5wdXRJbmFjdGl2ZSksIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMLCB7IGV4Y2x1ZGVTdGlja3k6IHRydWUgfSkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUsIHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KS5sZW5ndGgsIDIpO1xuXG5cdFx0bGV0IGVkaXRvck1vdmVDb3VudGVyID0gMDtcblx0XHRjb25zdCBlZGl0b3JHcm91cE1vZGVsQ2hhbmdlTGlzdGVuZXIgPSBncm91cC5vbkRpZE1vZGVsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX01PVkUpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGUuZWRpdG9yKTtcblx0XHRcdFx0ZWRpdG9yTW92ZUNvdW50ZXIrKztcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGdyb3VwLnN0aWNrRWRpdG9yKGlucHV0SW5hY3RpdmUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0SW5hY3RpdmUpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRJbmRleE9mRWRpdG9yKGlucHV0KSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEluZGV4T2ZFZGl0b3IoaW5wdXRJbmFjdGl2ZSksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JNb3ZlQ291bnRlciwgMSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwsIHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSwgeyBleGNsdWRlU3RpY2t5OiB0cnVlIH0pLmxlbmd0aCwgMSk7XG5cblx0XHRjb25zdCBpbnB1dFN0aWNreSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvc3RpY2t5JyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXRTdGlja3ksIHsgc3RpY2t5OiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0SW5hY3RpdmUpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXRTdGlja3kpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRJbmRleE9mRWRpdG9yKGlucHV0SW5hY3RpdmUpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihpbnB1dFN0aWNreSksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRJbmRleE9mRWRpdG9yKGlucHV0KSwgMik7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0LCB7IHN0aWNreTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5zdGlja3lDb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU3RpY2t5KGlucHV0SW5hY3RpdmUpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXRTdGlja3kpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRJbmRleE9mRWRpdG9yKGlucHV0SW5hY3RpdmUpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihpbnB1dFN0aWNreSksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRJbmRleE9mRWRpdG9yKGlucHV0KSwgMik7XG5cblx0XHRlZGl0b3JHcm91cE1vZGVsQ2hhbmdlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGlja3k6IHRydWUgd2lucyBvdmVyIGluZGV4JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuc3RpY2t5Q291bnQsIDApO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dEluYWN0aXZlID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2Jhci9pbmFjdGl2ZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXRTdGlja3kgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyL3N0aWNreScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0SW5hY3RpdmUsIHsgaW5hY3RpdmU6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dFN0aWNreSwgeyBzdGlja3k6IHRydWUsIGluZGV4OiAyIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLnN0aWNreUNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTdGlja3koaW5wdXRTdGlja3kpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRJbmRleE9mRWRpdG9yKGlucHV0KSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmdldEluZGV4T2ZFZGl0b3IoaW5wdXRJbmFjdGl2ZSksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5nZXRJbmRleE9mRWRpdG9yKGlucHV0U3RpY2t5KSwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdGlvbjogc2V0U2VsZWN0aW9uLCBpc1NlbGVjdGVkLCBzZWxlY3RlZEVkaXRvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGNvbnN0IGlucHV0MSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIxJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0ZnVuY3Rpb24gaXNTZWxlY3Rpb24oaW5wdXRzOiBUZXN0RmlsZUVkaXRvcklucHV0W10pOiBib29sZWFuIHtcblx0XHRcdGZvciAoY29uc3QgaW5wdXQgb2YgaW5wdXRzKSB7XG5cdFx0XHRcdGlmIChncm91cC5zZWxlY3RlZEVkaXRvcnMuaW5kZXhPZihpbnB1dCkgPT09IC0xKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaW5wdXRzLmxlbmd0aCA9PT0gZ3JvdXAuc2VsZWN0ZWRFZGl0b3JzLmxlbmd0aDtcblx0XHR9XG5cblx0XHQvLyBBY3RpdmU6IGlucHV0MSwgU2VsZWN0ZWQ6IGlucHV0MVxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3JzKFtpbnB1dDEsIGlucHV0MiwgaW5wdXQzXS5tYXAoZWRpdG9yID0+ICh7IGVkaXRvciwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9KSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzQWN0aXZlKGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1NlbGVjdGVkKGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1NlbGVjdGVkKGlucHV0MiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZChpbnB1dDMpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNTZWxlY3Rpb24oW2lucHV0MV0pLCB0cnVlKTtcblxuXHRcdC8vIEFjdGl2ZTogaW5wdXQxLCBTZWxlY3RlZDogaW5wdXQxLCBpbnB1dDNcblx0XHRhd2FpdCBncm91cC5zZXRTZWxlY3Rpb24oaW5wdXQxLCBbaW5wdXQzXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNBY3RpdmUoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU2VsZWN0ZWQoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU2VsZWN0ZWQoaW5wdXQyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1NlbGVjdGVkKGlucHV0MyksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzU2VsZWN0aW9uKFtpbnB1dDEsIGlucHV0M10pLCB0cnVlKTtcblxuXHRcdC8vIEFjdGl2ZTogaW5wdXQyLCBTZWxlY3RlZDogaW5wdXQxLCBpbnB1dDNcblx0XHRhd2FpdCBncm91cC5zZXRTZWxlY3Rpb24oaW5wdXQyLCBbaW5wdXQxLCBpbnB1dDNdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1NlbGVjdGVkKGlucHV0MSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0FjdGl2ZShpbnB1dDIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZChpbnB1dDIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNTZWxlY3RlZChpbnB1dDMpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1NlbGVjdGlvbihbaW5wdXQxLCBpbnB1dDIsIGlucHV0M10pLCB0cnVlKTtcblxuXHRcdGF3YWl0IGdyb3VwLnNldFNlbGVjdGlvbihpbnB1dDEsIFtdKTtcblxuXHRcdC8vIFNlbGVjdGVkOiBpbnB1dDNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNBY3RpdmUoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU2VsZWN0ZWQoaW5wdXQxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzU2VsZWN0ZWQoaW5wdXQyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1NlbGVjdGVkKGlucHV0MyksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1NlbGVjdGlvbihbaW5wdXQxXSksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlRWRpdG9yIHdpdGggY29udGV4dCAoYWNyb3NzIGdyb3VwcyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cblx0XHRjb25zdCByaWdodEdyb3VwID0gcGFydC5hZGRHcm91cChncm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dEluYWN0aXZlID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2Jhci9pbmFjdGl2ZScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgdGhpcmRJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvdGhpcmQnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0bGV0IGxlZnRGaXJlZENvdW50ID0gMDtcblx0XHRjb25zdCBsZWZ0R3JvdXBMaXN0ZW5lciA9IGdyb3VwLm9uV2lsbE1vdmVFZGl0b3IoKCkgPT4ge1xuXHRcdFx0bGVmdEZpcmVkQ291bnQrKztcblx0XHR9KTtcblxuXHRcdGxldCByaWdodEZpcmVkQ291bnQgPSAwO1xuXHRcdGNvbnN0IHJpZ2h0R3JvdXBMaXN0ZW5lciA9IHJpZ2h0R3JvdXAub25XaWxsTW92ZUVkaXRvcigoKSA9PiB7XG5cdFx0XHRyaWdodEZpcmVkQ291bnQrKztcblx0XHR9KTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3JzKFt7IGVkaXRvcjogaW5wdXQsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSwgeyBlZGl0b3I6IGlucHV0SW5hY3RpdmUgfSwgeyBlZGl0b3I6IHRoaXJkSW5wdXQgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWZ0RmlyZWRDb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0RmlyZWRDb3VudCwgMCk7XG5cblx0XHRsZXQgcmVzdWx0ID0gZ3JvdXAubW92ZUVkaXRvcihpbnB1dCwgcmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxlZnRGaXJlZENvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRGaXJlZENvdW50LCAwKTtcblxuXHRcdHJlc3VsdCA9IGdyb3VwLm1vdmVFZGl0b3IoaW5wdXRJbmFjdGl2ZSwgcmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxlZnRGaXJlZENvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRGaXJlZENvdW50LCAwKTtcblxuXHRcdHJlc3VsdCA9IHJpZ2h0R3JvdXAubW92ZUVkaXRvcihpbnB1dEluYWN0aXZlLCBncm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxlZnRGaXJlZENvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRGaXJlZENvdW50LCAxKTtcblxuXHRcdGxlZnRHcm91cExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRyaWdodEdyb3VwTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlRWRpdG9yIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXG5cdFx0Y29uc3QgcmlnaHRHcm91cCA9IHBhcnQuYWRkR3JvdXAoZ3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXRJbmFjdGl2ZSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGNvbnN0IHRoaXJkSW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyL3RoaXJkJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3JzKFt7IGVkaXRvcjogaW5wdXQsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSwgeyBlZGl0b3I6IGlucHV0SW5hY3RpdmUgfSwgeyBlZGl0b3I6IHRoaXJkSW5wdXQgfV0pO1xuXG5cdFx0aW5wdXQuc2V0TW92ZURpc2FibGVkKCdkaXNhYmxlZCcpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdyb3VwLm1vdmVFZGl0b3IoaW5wdXQsIHJpZ2h0R3JvdXApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5jb3VudCwgMyk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uV2lsbE9wZW5FZGl0b3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cblx0XHRjb25zdCByaWdodEdyb3VwID0gcGFydC5hZGRHcm91cChncm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBzZWNvbmRJbnB1dCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvc2Vjb25kJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCB0aGlyZElucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2Jhci90aGlyZCcpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRsZXQgbGVmdEZpcmVkQ291bnQgPSAwO1xuXHRcdGNvbnN0IGxlZnRHcm91cExpc3RlbmVyID0gZ3JvdXAub25XaWxsT3BlbkVkaXRvcigoKSA9PiB7XG5cdFx0XHRsZWZ0RmlyZWRDb3VudCsrO1xuXHRcdH0pO1xuXG5cdFx0bGV0IHJpZ2h0RmlyZWRDb3VudCA9IDA7XG5cdFx0Y29uc3QgcmlnaHRHcm91cExpc3RlbmVyID0gcmlnaHRHcm91cC5vbldpbGxPcGVuRWRpdG9yKCgpID0+IHtcblx0XHRcdHJpZ2h0RmlyZWRDb3VudCsrO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxlZnRGaXJlZENvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRGaXJlZENvdW50LCAwKTtcblxuXHRcdHJpZ2h0R3JvdXAub3BlbkVkaXRvcihzZWNvbmRJbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxlZnRGaXJlZENvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRGaXJlZENvdW50LCAxKTtcblxuXHRcdGdyb3VwLm9wZW5FZGl0b3IodGhpcmRJbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxlZnRGaXJlZENvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRGaXJlZENvdW50LCAxKTtcblxuXHRcdC8vIEVuc3VyZSBtb3ZlIGZpcmVzIHRoZSBvcGVuIGV2ZW50IHRvb1xuXHRcdHJpZ2h0R3JvdXAubW92ZUVkaXRvcihzZWNvbmRJbnB1dCwgZ3JvdXApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWZ0RmlyZWRDb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0RmlyZWRDb3VudCwgMSk7XG5cblx0XHRsZWZ0R3JvdXBMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0cmlnaHRHcm91cExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnY29weUVkaXRvciB3aXRoIGNvbnRleHQgKGFjcm9zcyBncm91cHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzRW1wdHksIHRydWUpO1xuXHRcdGxldCBmaXJlZENvdW50ID0gMDtcblx0XHRjb25zdCBtb3ZlTGlzdGVuZXIgPSBncm91cC5vbldpbGxNb3ZlRWRpdG9yKCgpID0+IGZpcmVkQ291bnQrKyk7XG5cblx0XHRjb25zdCByaWdodEdyb3VwID0gcGFydC5hZGRHcm91cChncm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXRJbmFjdGl2ZSA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3JzKFt7IGVkaXRvcjogaW5wdXQsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSwgeyBlZGl0b3I6IGlucHV0SW5hY3RpdmUgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZENvdW50LCAwKTtcblxuXHRcdGdyb3VwLmNvcHlFZGl0b3IoaW5wdXRJbmFjdGl2ZSwgcmlnaHRHcm91cCwgeyBpbmRleDogMCB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZENvdW50LCAwKTtcblx0XHRtb3ZlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NrZWQgZ3JvdXBzIC0gYmFzaWNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblx0XHRjb25zdCBncm91cCA9IHBhcnQuYWN0aXZlR3JvdXA7XG5cblx0XHRjb25zdCByaWdodEdyb3VwID0gcGFydC5hZGRHcm91cChncm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXG5cdFx0bGV0IGxlZnRGaXJlZENvdW50RnJvbVBhcnQgPSAwO1xuXHRcdGxldCByaWdodEZpcmVkQ291bnRGcm9tUGFydCA9IDA7XG5cdFx0Y29uc3QgcGFydExpc3RlbmVyID0gcGFydC5vbkRpZENoYW5nZUdyb3VwTG9ja2VkKGcgPT4ge1xuXHRcdFx0aWYgKGcgPT09IGdyb3VwKSB7XG5cdFx0XHRcdGxlZnRGaXJlZENvdW50RnJvbVBhcnQrKztcblx0XHRcdH0gZWxzZSBpZiAoZyA9PT0gcmlnaHRHcm91cCkge1xuXHRcdFx0XHRyaWdodEZpcmVkQ291bnRGcm9tUGFydCsrO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0bGV0IGxlZnRGaXJlZENvdW50RnJvbUdyb3VwID0gMDtcblx0XHRjb25zdCBsZWZ0R3JvdXBMaXN0ZW5lciA9IGdyb3VwLm9uRGlkTW9kZWxDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5HUk9VUF9MT0NLRUQpIHtcblx0XHRcdFx0bGVmdEZpcmVkQ291bnRGcm9tR3JvdXArKztcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGxldCByaWdodEZpcmVkQ291bnRGcm9tR3JvdXAgPSAwO1xuXHRcdGNvbnN0IHJpZ2h0R3JvdXBMaXN0ZW5lciA9IHJpZ2h0R3JvdXAub25EaWRNb2RlbENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0xPQ0tFRCkge1xuXHRcdFx0XHRyaWdodEZpcmVkQ291bnRGcm9tR3JvdXArKztcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJpZ2h0R3JvdXAubG9jayh0cnVlKTtcblx0XHRyaWdodEdyb3VwLmxvY2sodHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGVmdEZpcmVkQ291bnRGcm9tR3JvdXAsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWZ0RmlyZWRDb3VudEZyb21QYXJ0LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRGaXJlZENvdW50RnJvbUdyb3VwLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRGaXJlZENvdW50RnJvbVBhcnQsIDEpO1xuXG5cdFx0cmlnaHRHcm91cC5sb2NrKGZhbHNlKTtcblx0XHRyaWdodEdyb3VwLmxvY2soZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxlZnRGaXJlZENvdW50RnJvbUdyb3VwLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGVmdEZpcmVkQ291bnRGcm9tUGFydCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0RmlyZWRDb3VudEZyb21Hcm91cCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0RmlyZWRDb3VudEZyb21QYXJ0LCAyKTtcblxuXHRcdGdyb3VwLmxvY2sodHJ1ZSk7XG5cdFx0Z3JvdXAubG9jayh0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWZ0RmlyZWRDb3VudEZyb21Hcm91cCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxlZnRGaXJlZENvdW50RnJvbVBhcnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEZpcmVkQ291bnRGcm9tR3JvdXAsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEZpcmVkQ291bnRGcm9tUGFydCwgMik7XG5cblx0XHRncm91cC5sb2NrKGZhbHNlKTtcblx0XHRncm91cC5sb2NrKGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWZ0RmlyZWRDb3VudEZyb21Hcm91cCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxlZnRGaXJlZENvdW50RnJvbVBhcnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEZpcmVkQ291bnRGcm9tR3JvdXAsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEZpcmVkQ291bnRGcm9tUGFydCwgMik7XG5cblx0XHRwYXJ0TGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdGxlZnRHcm91cExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRyaWdodEdyb3VwTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NrZWQgZ3JvdXBzIC0gc2luZ2xlIGdyb3VwIGlzIGNhbiBiZSBsb2NrZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXHRcdGNvbnN0IGdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblxuXHRcdGdyb3VwLmxvY2sodHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzTG9ja2VkLCB0cnVlKTtcblxuXHRcdGNvbnN0IHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKGdyb3VwLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cdFx0cmlnaHRHcm91cC5sb2NrKHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAuaXNMb2NrZWQsIHRydWUpO1xuXG5cdFx0cGFydC5yZW1vdmVHcm91cChncm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAuaXNMb2NrZWQsIHRydWUpO1xuXG5cdFx0Y29uc3QgcmlnaHRHcm91cDIgPSBwYXJ0LmFkZEdyb3VwKHJpZ2h0R3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0XHRyaWdodEdyb3VwLmxvY2sodHJ1ZSk7XG5cdFx0cmlnaHRHcm91cDIubG9jayh0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyaWdodEdyb3VwLmlzTG9ja2VkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cDIuaXNMb2NrZWQsIHRydWUpO1xuXG5cdFx0cGFydC5yZW1vdmVHcm91cChyaWdodEdyb3VwMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5pc0xvY2tlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvY2tlZCBncm91cHMgLSBhdXRvIGxvY2tpbmcgdmlhIHNldHRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignd29ya2JlbmNoJywgeyAnZWRpdG9yJzogeyAnYXV0b0xvY2tHcm91cHMnOiB7ICd0ZXN0RWRpdG9ySW5wdXRGb3JFZGl0b3JHcm91cFNlcnZpY2UnOiB0cnVlIH0gfSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydChpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCByb290R3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGxldCByaWdodEdyb3VwID0gcGFydC5hZGRHcm91cChyb290R3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGxldCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMScpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0bGV0IGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdC8vIEZpcnN0IGVkaXRvciBvcGVucyBpbiByaWdodCBncm91cDogTG9ja2VkPXRydWVcblx0XHRhd2FpdCByaWdodEdyb3VwLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmlnaHRHcm91cC5pc0xvY2tlZCwgdHJ1ZSk7XG5cblx0XHQvLyBTZWNvbmQgZWRpdG9ycyBvcGVucyBpbiBub3cgdW5sb2NrZWQgcmlnaHQgZ3JvdXA6IExvY2tlZD1mYWxzZVxuXHRcdHJpZ2h0R3JvdXAubG9jayhmYWxzZSk7XG5cdFx0YXdhaXQgcmlnaHRHcm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJpZ2h0R3JvdXAuaXNMb2NrZWQsIGZhbHNlKTtcblxuXHRcdC8vRmlyc3QgZWRpdG9yIG9wZW5zIGluIHJvb3QgZ3JvdXAgd2l0aG91dCBvdGhlciBncm91cHMgYmVpbmcgb3BlbmVkOiBMb2NrZWQ9ZmFsc2Vcblx0XHRhd2FpdCByaWdodEdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXHRcdHBhcnQucmVtb3ZlR3JvdXAocmlnaHRHcm91cCk7XG5cdFx0YXdhaXQgcm9vdEdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXG5cdFx0aW5wdXQxID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjEnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXHRcdGlucHV0MiA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblxuXHRcdGF3YWl0IHJvb3RHcm91cC5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5pc0xvY2tlZCwgZmFsc2UpO1xuXHRcdHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJvb3RHcm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290R3JvdXAuaXNMb2NrZWQsIGZhbHNlKTtcblx0XHRjb25zdCBsZWZ0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJvb3RHcm91cCwgR3JvdXBEaXJlY3Rpb24uTEVGVCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3RHcm91cC5pc0xvY2tlZCwgZmFsc2UpO1xuXHRcdHBhcnQucmVtb3ZlR3JvdXAobGVmdEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdEdyb3VwLmlzTG9ja2VkLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21heGltaXplIGVkaXRvciBncm91cCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgcm9vdEdyb3VwID0gcGFydC5hY3RpdmVHcm91cDtcblx0XHRjb25zdCBlZGl0b3JQYXJ0U2l6ZSA9IHBhcnQuZ2V0U2l6ZShyb290R3JvdXApO1xuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgb25seSBvbmUgZ3JvdXAsIGl0IHNob3VsZCBub3QgYmUgY29uc2lkZXJlZCBtYXhpbWl6ZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5oYXNNYXhpbWl6ZWRHcm91cCgpLCBmYWxzZSk7XG5cblx0XHRjb25zdCByaWdodEdyb3VwID0gcGFydC5hZGRHcm91cChyb290R3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0XHRjb25zdCByaWdodEJvdHRvbUdyb3VwID0gcGFydC5hZGRHcm91cChyaWdodEdyb3VwLCBHcm91cERpcmVjdGlvbi5ET1dOKTtcblxuXHRcdGNvbnN0IHNpemVSb290R3JvdXAgPSBwYXJ0LmdldFNpemUocm9vdEdyb3VwKTtcblx0XHRjb25zdCBzaXplUmlnaHRHcm91cCA9IHBhcnQuZ2V0U2l6ZShyaWdodEdyb3VwKTtcblx0XHRjb25zdCBzaXplUmlnaHRCb3R0b21Hcm91cCA9IHBhcnQuZ2V0U2l6ZShyaWdodEJvdHRvbUdyb3VwKTtcblxuXHRcdGxldCBtYXhpbWl6ZWRWYWx1ZTtcblx0XHRjb25zdCBtYXhpaXplR3JvdXBFdmVudERpc3Bvc2FibGUgPSBwYXJ0Lm9uRGlkQ2hhbmdlR3JvdXBNYXhpbWl6ZWQoKG1heGltaXplZCkgPT4ge1xuXHRcdFx0bWF4aW1pemVkVmFsdWUgPSBtYXhpbWl6ZWQ7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5oYXNNYXhpbWl6ZWRHcm91cCgpLCBmYWxzZSk7XG5cblx0XHRwYXJ0LmFycmFuZ2VHcm91cHMoR3JvdXBzQXJyYW5nZW1lbnQuTUFYSU1JWkUsIHJvb3RHcm91cCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5oYXNNYXhpbWl6ZWRHcm91cCgpLCB0cnVlKTtcblxuXHRcdC8vIGdldFNpemUoKVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydC5nZXRTaXplKHJvb3RHcm91cCksIGVkaXRvclBhcnRTaXplKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnQuZ2V0U2l6ZShyaWdodEdyb3VwKSwgeyB3aWR0aDogMCwgaGVpZ2h0OiAwIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydC5nZXRTaXplKHJpZ2h0Qm90dG9tR3JvdXApLCB7IHdpZHRoOiAwLCBoZWlnaHQ6IDAgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1heGltaXplZFZhbHVlLCB0cnVlKTtcblxuXHRcdHBhcnQudG9nZ2xlTWF4aW1pemVHcm91cCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuaGFzTWF4aW1pemVkR3JvdXAoKSwgZmFsc2UpO1xuXG5cdFx0Ly8gU2l6ZSBpcyByZXN0b3JlZFxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydC5nZXRTaXplKHJvb3RHcm91cCksIHNpemVSb290R3JvdXApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydC5nZXRTaXplKHJpZ2h0R3JvdXApLCBzaXplUmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0LmdldFNpemUocmlnaHRCb3R0b21Hcm91cCksIHNpemVSaWdodEJvdHRvbUdyb3VwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWF4aW1pemVkVmFsdWUsIGZhbHNlKTtcblx0XHRtYXhpaXplR3JvdXBFdmVudERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmFuc2llbnQgZWRpdG9ycyAtIGJhc2ljcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dFRyYW5zaWVudCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dFRyYW5zaWVudCwgeyB0cmFuc2llbnQ6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNUcmFuc2llbnQoaW5wdXQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzVHJhbnNpZW50KGlucHV0VHJhbnNpZW50KSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0VHJhbnNpZW50LCB7IHRyYW5zaWVudDogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1RyYW5zaWVudChpbnB1dFRyYW5zaWVudCksIHRydWUpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dFRyYW5zaWVudCwgeyB0cmFuc2llbnQ6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1RyYW5zaWVudChpbnB1dFRyYW5zaWVudCksIGZhbHNlKTtcblxuXHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IoaW5wdXRUcmFuc2llbnQsIHsgdHJhbnNpZW50OiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1RyYW5zaWVudChpbnB1dFRyYW5zaWVudCksIGZhbHNlKTsgLy8gY2Fubm90IG1ha2UgYSBub24tdHJhbnNpZW50IGVkaXRvciB0cmFuc2llbnQgd2hlbiBhbHJlYWR5IG9wZW5lZFxuXHR9KTtcblxuXHR0ZXN0KCd0cmFuc2llbnQgZWRpdG9ycyAtIHBpbm5pbmcgY2xlYXJzIHRyYW5zaWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydF0gPSBhd2FpdCBjcmVhdGVQYXJ0KCk7XG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dFRyYW5zaWVudCA9IGNyZWF0ZVRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLmZpbGUoJ2Zvby9iYXIvaW5hY3RpdmUnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dFRyYW5zaWVudCwgeyB0cmFuc2llbnQ6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAuaXNUcmFuc2llbnQoaW5wdXQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzVHJhbnNpZW50KGlucHV0VHJhbnNpZW50KSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGlucHV0VHJhbnNpZW50LCB7IHBpbm5lZDogdHJ1ZSwgdHJhbnNpZW50OiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwLmlzVHJhbnNpZW50KGlucHV0VHJhbnNpZW50KSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmFuc2llbnQgZWRpdG9ycyAtIG92ZXJyaWRlcyBlbmFibGVQcmV2aWV3IHNldHRpbmcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignd29ya2JlbmNoJywgeyAnZWRpdG9yJzogeyAnZW5hYmxlUHJldmlldyc6IGZhbHNlIH0gfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZ3JvdXAgPSBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc0VtcHR5LCB0cnVlKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dCksIHRydWUpO1xuXG5cdFx0YXdhaXQgZ3JvdXAub3BlbkVkaXRvcihpbnB1dDIsIHsgdHJhbnNpZW50OiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dDIpLCBmYWxzZSk7XG5cblx0XHRncm91cC5mb2N1cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cC5pc1Bpbm5lZChpbnB1dDIpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnd29ya2luZyBzZXRzIC0gY3JlYXRlIC8gYXBwbHkgc3RhdGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0Y29uc3QgaW5wdXQgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRjb25zdCBwYW5lMSA9IGF3YWl0IHBhcnQuYWN0aXZlR3JvdXAub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0Y29uc3QgcGFuZTIgPSBhd2FpdCBwYXJ0LnNpZGVHcm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHBhcnQuY3JlYXRlU3RhdGUoKTtcblxuXHRcdGF3YWl0IHBhbmUyPy5ncm91cC5jbG9zZUFsbEVkaXRvcnMoKTtcblx0XHRhd2FpdCBwYW5lMT8uZ3JvdXAuY2xvc2VBbGxFZGl0b3JzKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAuaXNFbXB0eSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCBwYXJ0LmFwcGx5U3RhdGUoc3RhdGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY291bnQsIDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZ3JvdXBzWzBdLmNvbnRhaW5zKGlucHV0KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZ3JvdXBzWzFdLmNvbnRhaW5zKGlucHV0MiksIHRydWUpO1xuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBwYXJ0Lmdyb3Vwcykge1xuXHRcdFx0YXdhaXQgZ3JvdXAuY2xvc2VBbGxFZGl0b3JzKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW1wdHlTdGF0ZSA9IHBhcnQuY3JlYXRlU3RhdGUoKTtcblxuXHRcdGF3YWl0IHBhcnQuYXBwbHlTdGF0ZShlbXB0eVN0YXRlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb3VudCwgMSk7XG5cblx0XHRjb25zdCBpbnB1dDMgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMycpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0aW5wdXQzLmRpcnR5ID0gdHJ1ZTtcblx0XHRhd2FpdCBwYXJ0LmFjdGl2ZUdyb3VwLm9wZW5FZGl0b3IoaW5wdXQzLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdGF3YWl0IHBhcnQuYXBwbHlTdGF0ZShlbXB0eVN0YXRlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5ncm91cHNbMF0uY29udGFpbnMoaW5wdXQzKSwgdHJ1ZSk7IC8vIGRpcnR5IGVkaXRvcnMgZW5mb3JjZSB0byBiZSB0aGVyZSBldmVuIHdoZW4gc3RhdGUgaXMgZW1wdHlcblxuXHRcdGF3YWl0IHBhcnQuYXBwbHlTdGF0ZSgnZW1wdHknKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5ncm91cHNbMF0uY29udGFpbnMoaW5wdXQzKSwgdHJ1ZSk7IC8vIGRpcnR5IGVkaXRvcnMgZW5mb3JjZSB0byBiZSB0aGVyZSBldmVuIHdoZW4gc3RhdGUgaXMgZW1wdHlcblxuXHRcdGlucHV0My5kaXJ0eSA9IGZhbHNlO1xuXG5cdFx0YXdhaXQgcGFydC5hcHBseVN0YXRlKCdlbXB0eScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmlzRW1wdHksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JraW5nIHNldHMgLSBhcHBseSBzdGF0ZSB3aGVuIHRoZSBwYXJ0IGhhcyBuZXZlciBiZWVuIGxhaWQgb3V0IGRvZXMgbm90IHRocm93IGFuZCByZWdpc3RlcnMgcmVzdG9yZWQgZ3JvdXBzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IFtwYXJ0XSA9IGF3YWl0IGNyZWF0ZVBhcnQoKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQyID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjInKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0YXdhaXQgcGFydC5hY3RpdmVHcm91cC5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBwYXJ0LnNpZGVHcm91cC5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHBhcnQuY3JlYXRlU3RhdGUoKTtcblxuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgcGFydC5ncm91cHMpIHtcblx0XHRcdGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXHRcdH1cblxuXHRcdC8vIFNpbXVsYXRlIGFuIGVkaXRvciBwYXJ0IHRoYXQgaGFzIG5ldmVyIGJlZW4gbGFpZCBvdXQgKGUuZy4gaXQgc3RheWVkXG5cdFx0Ly8gaGlkZGVuIHNpbmNlIHRoZSB3aW5kb3cgb3BlbmVkLCBsaWtlIHRoZSBBZ2VudHMgd2luZG93IGVkaXRvciBhcmVhXG5cdFx0Ly8gYWZ0ZXIgYSByZWxvYWQgd2l0aCB0aGUgc2lkZSBwYW5lIGNsb3NlZCkuIEluIHRoYXQgc3RhdGVcblx0XHQvLyBgX2NvbnRlbnREaW1lbnNpb25gIGlzIHN0aWxsIHVuZGVmaW5lZCBhbmQgbGF5aW5nIG91dCBkdXJpbmcgdGhlXG5cdFx0Ly8gcmVzdG9yZSB3b3VsZCB0aHJvdywgYWJvcnRpbmcgYmVmb3JlIHRoZSBgb25EaWRBZGRHcm91cGAgZXZlbnRzIGZpcmUuXG5cdFx0KHBhcnQgYXMgdW5rbm93biBhcyB7IF9jb250ZW50RGltZW5zaW9uOiB1bmtub3duIH0pLl9jb250ZW50RGltZW5zaW9uID0gdW5kZWZpbmVkO1xuXG5cdFx0bGV0IGFkZGVkR3JvdXBzID0gMDtcblx0XHRjb25zdCBsaXN0ZW5lciA9IHBhcnQub25EaWRBZGRHcm91cCgoKSA9PiBhZGRlZEdyb3VwcysrKTtcblxuXHRcdC8vIE11c3Qgbm90IHRocm93LCBtdXN0IHJlc3RvcmUgdGhlIGdyb3VwcywgYW5kIG11c3QgZmlyZSBgb25EaWRBZGRHcm91cGBcblx0XHQvLyBmb3IgdGhlbSBzbyBsaXN0ZW5lcnMgKGUuZy4gdGhlIGVkaXRvciBzZXJ2aWNlKSByZWdpc3RlciB0aGVtLlxuXHRcdGF3YWl0IHBhcnQuYXBwbHlTdGF0ZShzdGF0ZSk7XG5cdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Lmdyb3Vwc1swXS5jb250YWlucyhpbnB1dCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Lmdyb3Vwc1sxXS5jb250YWlucyhpbnB1dDIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWRkZWRHcm91cHMsIDIsIGBleHBlY3RlZCBleGFjdGx5IDIgb25EaWRBZGRHcm91cCBldmVudHMsIGdvdCAke2FkZGVkR3JvdXBzfWApO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250ZXh0IGtleSBwcm92aWRlcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIEluc3RhbnRpYXRlIHdvcmtiZW5jaCBhbmQgc2V0dXAgaW5pdGlhbCBzdGF0ZVxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UoeyBjb250ZXh0S2V5U2VydmljZTogaW5zdGFudGlhdGlvblNlcnZpY2UgPT4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9ja1Njb3BhYmxlQ29udGV4dEtleVNlcnZpY2UpIH0sIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCByb290Q29udGV4dEtleVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IFtwYXJ0c10gPSBhd2FpdCBjcmVhdGVQYXJ0cyhpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0Y29uc3QgaW5wdXQzID0gY3JlYXRlVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkuZmlsZSgnZm9vL2JhcjMnKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpO1xuXG5cdFx0Y29uc3QgZ3JvdXAxID0gcGFydHMuYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3QgZ3JvdXAyID0gcGFydHMuYWRkR3JvdXAoZ3JvdXAxLCBHcm91cERpcmVjdGlvbi5SSUdIVCk7XG5cblx0XHRhd2FpdCBncm91cDIub3BlbkVkaXRvcihpbnB1dDIsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGdyb3VwMS5vcGVuRWRpdG9yKGlucHV0MSwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHQvLyBDcmVhdGUgY29udGV4dCBrZXkgcHJvdmlkZXJcblx0XHRjb25zdCByYXdDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8bnVtYmVyPigndGVzdENvbnRleHRLZXknLCBwYXJ0cy5hY3RpdmVHcm91cC5pZCk7XG5cdFx0Y29uc3QgY29udGV4dEtleVByb3ZpZGVyOiBJRWRpdG9yR3JvdXBDb250ZXh0S2V5UHJvdmlkZXI8bnVtYmVyPiA9IHtcblx0XHRcdGNvbnRleHRLZXk6IHJhd0NvbnRleHRLZXksXG5cdFx0XHRnZXRHcm91cENvbnRleHRLZXlWYWx1ZTogKGdyb3VwKSA9PiBncm91cC5pZFxuXHRcdH07XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBhcnRzLnJlZ2lzdGVyQ29udGV4dEtleVByb3ZpZGVyKGNvbnRleHRLZXlQcm92aWRlcikpO1xuXG5cdFx0Ly8gSW5pdGlhbCBzdGF0ZTogZ3JvdXAxIGlzIGFjdGl2ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0cy5hY3RpdmVHcm91cC5pZCwgZ3JvdXAxLmlkKTtcblxuXHRcdGxldCBnbG9iYWxDb250ZXh0S2V5VmFsdWUgPSByb290Q29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRsZXQgZ3JvdXAxQ29udGV4dEtleVZhbHVlID0gZ3JvdXAxLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShyYXdDb250ZXh0S2V5LmtleSk7XG5cdFx0bGV0IGdyb3VwMkNvbnRleHRLZXlWYWx1ZSA9IGdyb3VwMi5zY29wZWRDb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUocmF3Q29udGV4dEtleS5rZXkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iYWxDb250ZXh0S2V5VmFsdWUsIGdyb3VwMS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMUNvbnRleHRLZXlWYWx1ZSwgZ3JvdXAxLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAyQ29udGV4dEtleVZhbHVlLCBncm91cDIuaWQpO1xuXG5cdFx0Ly8gTWFrZSBncm91cDIgYWN0aXZlIGFuZCBlbnN1cmUgYm90aCBnbG9hYmFsIGFuZCBsb2NhbCBjb250ZXh0IGtleSB2YWx1ZXMgYXJlIHVwZGF0ZWRcblx0XHRwYXJ0cy5hY3RpdmF0ZUdyb3VwKGdyb3VwMik7XG5cblx0XHRnbG9iYWxDb250ZXh0S2V5VmFsdWUgPSByb290Q29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRncm91cDFDb250ZXh0S2V5VmFsdWUgPSBncm91cDEuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRncm91cDJDb250ZXh0S2V5VmFsdWUgPSBncm91cDIuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYmFsQ29udGV4dEtleVZhbHVlLCBncm91cDIuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDFDb250ZXh0S2V5VmFsdWUsIGdyb3VwMS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMkNvbnRleHRLZXlWYWx1ZSwgZ3JvdXAyLmlkKTtcblxuXHRcdC8vIEFkZCBhIG5ldyBncm91cCBhbmQgZW5zdXJlIGJvdGggZ2xvYWJhbCBhbmQgbG9jYWwgY29udGV4dCBrZXkgdmFsdWVzIGFyZSB1cGRhdGVkXG5cdFx0Ly8gR3JvdXAgMyB3aWxsIGJlIGFjdGl2ZVxuXHRcdGNvbnN0IGdyb3VwMyA9IHBhcnRzLmFkZEdyb3VwKGdyb3VwMiwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXHRcdGF3YWl0IGdyb3VwMy5vcGVuRWRpdG9yKGlucHV0MywgeyBwaW5uZWQ6IHRydWUgfSk7XG5cblx0XHRnbG9iYWxDb250ZXh0S2V5VmFsdWUgPSByb290Q29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRncm91cDFDb250ZXh0S2V5VmFsdWUgPSBncm91cDEuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRncm91cDJDb250ZXh0S2V5VmFsdWUgPSBncm91cDIuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRjb25zdCBncm91cDNDb250ZXh0S2V5VmFsdWUgPSBncm91cDMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYmFsQ29udGV4dEtleVZhbHVlLCBncm91cDMuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDFDb250ZXh0S2V5VmFsdWUsIGdyb3VwMS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMkNvbnRleHRLZXlWYWx1ZSwgZ3JvdXAyLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAzQ29udGV4dEtleVZhbHVlLCBncm91cDMuaWQpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250ZXh0IGtleSBwcm92aWRlcjogb25EaWRDaGFuZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBJbnN0YW50aWF0ZSB3b3JrYmVuY2ggYW5kIHNldHVwIGluaXRpYWwgc3RhdGVcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHsgY29udGV4dEtleVNlcnZpY2U6IGluc3RhbnRpYXRpb25TZXJ2aWNlID0+IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vY2tTY29wYWJsZUNvbnRleHRLZXlTZXJ2aWNlKSB9LCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgcm9vdENvbnRleHRLZXlTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBwYXJ0cyA9IGF3YWl0IGNyZWF0ZUVkaXRvclBhcnRzKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRjb25zdCBncm91cDEgPSBwYXJ0cy5hY3RpdmVHcm91cDtcblx0XHRjb25zdCBncm91cDIgPSBwYXJ0cy5hZGRHcm91cChncm91cDEsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblxuXHRcdGF3YWl0IGdyb3VwMi5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAxLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdC8vIENyZWF0ZSBjb250ZXh0IGtleSBwcm92aWRlclxuXHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdGNvbnN0IF9vbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cblx0XHRjb25zdCByYXdDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8bnVtYmVyPigndGVzdENvbnRleHRLZXknLCBwYXJ0cy5hY3RpdmVHcm91cC5pZCk7XG5cdFx0Y29uc3QgY29udGV4dEtleVByb3ZpZGVyOiBJRWRpdG9yR3JvdXBDb250ZXh0S2V5UHJvdmlkZXI8bnVtYmVyPiA9IHtcblx0XHRcdGNvbnRleHRLZXk6IHJhd0NvbnRleHRLZXksXG5cdFx0XHRnZXRHcm91cENvbnRleHRLZXlWYWx1ZTogKGdyb3VwKSA9PiBncm91cC5pZCArIG9mZnNldCxcblx0XHRcdG9uRGlkQ2hhbmdlOiBfb25EaWRDaGFuZ2UuZXZlbnRcblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwYXJ0cy5yZWdpc3RlckNvbnRleHRLZXlQcm92aWRlcihjb250ZXh0S2V5UHJvdmlkZXIpKTtcblxuXHRcdC8vIEluaXRpYWwgc3RhdGU6IGdyb3VwMSBpcyBhY3RpdmVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydHMuYWN0aXZlR3JvdXAuaWQsIGdyb3VwMS5pZCk7XG5cblx0XHRsZXQgZ2xvYmFsQ29udGV4dEtleVZhbHVlID0gcm9vdENvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShyYXdDb250ZXh0S2V5LmtleSk7XG5cdFx0bGV0IGdyb3VwMUNvbnRleHRLZXlWYWx1ZSA9IGdyb3VwMS5zY29wZWRDb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUocmF3Q29udGV4dEtleS5rZXkpO1xuXHRcdGxldCBncm91cDJDb250ZXh0S2V5VmFsdWUgPSBncm91cDIuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYmFsQ29udGV4dEtleVZhbHVlLCBncm91cDEuaWQgKyBvZmZzZXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDFDb250ZXh0S2V5VmFsdWUsIGdyb3VwMS5pZCArIG9mZnNldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMkNvbnRleHRLZXlWYWx1ZSwgZ3JvdXAyLmlkICsgb2Zmc2V0KTtcblxuXHRcdC8vIE1ha2UgYSBjaGFuZ2UgdG8gdGhlIGNvbnRleHQga2V5IHByb3ZpZGVyIGFuZCBmaXJlIG9uRGlkQ2hhbmdlIHN1Y2ggdGhhdCBhbGwgY29udGV4dCBrZXkgdmFsdWVzIGFyZSB1cGRhdGVkXG5cdFx0b2Zmc2V0ID0gMTA7XG5cdFx0X29uRGlkQ2hhbmdlLmZpcmUoKTtcblxuXHRcdGdsb2JhbENvbnRleHRLZXlWYWx1ZSA9IHJvb3RDb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUocmF3Q29udGV4dEtleS5rZXkpO1xuXHRcdGdyb3VwMUNvbnRleHRLZXlWYWx1ZSA9IGdyb3VwMS5zY29wZWRDb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUocmF3Q29udGV4dEtleS5rZXkpO1xuXHRcdGdyb3VwMkNvbnRleHRLZXlWYWx1ZSA9IGdyb3VwMi5zY29wZWRDb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUocmF3Q29udGV4dEtleS5rZXkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iYWxDb250ZXh0S2V5VmFsdWUsIGdyb3VwMS5pZCArIG9mZnNldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMUNvbnRleHRLZXlWYWx1ZSwgZ3JvdXAxLmlkICsgb2Zmc2V0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXAyQ29udGV4dEtleVZhbHVlLCBncm91cDIuaWQgKyBvZmZzZXQpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250ZXh0IGtleSBwcm92aWRlcjogYWN0aXZlIGVkaXRvciBjaGFuZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBJbnN0YW50aWF0ZSB3b3JrYmVuY2ggYW5kIHNldHVwIGluaXRpYWwgc3RhdGVcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHsgY29udGV4dEtleVNlcnZpY2U6IGluc3RhbnRpYXRpb25TZXJ2aWNlID0+IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vY2tTY29wYWJsZUNvbnRleHRLZXlTZXJ2aWNlKSB9LCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgcm9vdENvbnRleHRLZXlTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBwYXJ0cyA9IGF3YWl0IGNyZWF0ZUVkaXRvclBhcnRzKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBpbnB1dDEgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyJyksIFRFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRjb25zdCBpbnB1dDIgPSBjcmVhdGVUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5maWxlKCdmb28vYmFyMicpLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cblx0XHRjb25zdCBncm91cDEgPSBwYXJ0cy5hY3RpdmVHcm91cDtcblxuXHRcdGF3YWl0IGdyb3VwMS5vcGVuRWRpdG9yKGlucHV0MiwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgZ3JvdXAxLm9wZW5FZGl0b3IoaW5wdXQxLCB7IHBpbm5lZDogdHJ1ZSB9KTtcblxuXHRcdC8vIENyZWF0ZSBjb250ZXh0IGtleSBwcm92aWRlclxuXHRcdGNvbnN0IHJhd0NvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KCd0ZXN0Q29udGV4dEtleScsIGlucHV0MS5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBjb250ZXh0S2V5UHJvdmlkZXI6IElFZGl0b3JHcm91cENvbnRleHRLZXlQcm92aWRlcjxzdHJpbmc+ID0ge1xuXHRcdFx0Y29udGV4dEtleTogcmF3Q29udGV4dEtleSxcblx0XHRcdGdldEdyb3VwQ29udGV4dEtleVZhbHVlOiAoZ3JvdXApID0+IGdyb3VwLmFjdGl2ZUVkaXRvcj8ucmVzb3VyY2U/LnRvU3RyaW5nKCkgPz8gJycsXG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydHMucmVnaXN0ZXJDb250ZXh0S2V5UHJvdmlkZXIoY29udGV4dEtleVByb3ZpZGVyKSk7XG5cblx0XHQvLyBJbml0aWFsIHN0YXRlOiBpbnB1dDEgaXMgYWN0aXZlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXF1YWwoZ3JvdXAxLmFjdGl2ZUVkaXRvcj8ucmVzb3VyY2UsIGlucHV0MS5yZXNvdXJjZSksIHRydWUpO1xuXG5cdFx0bGV0IGdsb2JhbENvbnRleHRLZXlWYWx1ZSA9IHJvb3RDb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUocmF3Q29udGV4dEtleS5rZXkpO1xuXHRcdGxldCBncm91cDFDb250ZXh0S2V5VmFsdWUgPSBncm91cDEuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKHJhd0NvbnRleHRLZXkua2V5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYmFsQ29udGV4dEtleVZhbHVlLCBpbnB1dDEucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwMUNvbnRleHRLZXlWYWx1ZSwgaW5wdXQxLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Ly8gTWFrZSBpbnB1dDIgYWN0aXZlIGFuZCBlbnN1cmUgYm90aCBnbG9hYmFsIGFuZCBsb2NhbCBjb250ZXh0IGtleSB2YWx1ZXMgYXJlIHVwZGF0ZWRcblx0XHRhd2FpdCBncm91cDEub3BlbkVkaXRvcihpbnB1dDIpO1xuXG5cdFx0Z2xvYmFsQ29udGV4dEtleVZhbHVlID0gcm9vdENvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShyYXdDb250ZXh0S2V5LmtleSk7XG5cdFx0Z3JvdXAxQ29udGV4dEtleVZhbHVlID0gZ3JvdXAxLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShyYXdDb250ZXh0S2V5LmtleSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2JhbENvbnRleHRLZXlWYWx1ZSwgaW5wdXQyLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cDFDb250ZXh0S2V5VmFsdWUsIGlucHV0Mi5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRBY3RpdmF0ZUdyb3VwIGNhcnJpZXMgYWN0aXZhdGlvbiByZWFzb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgW3BhcnRdID0gYXdhaXQgY3JlYXRlUGFydCgpO1xuXG5cdFx0Y29uc3QgYWN0aXZhdGlvbkV2ZW50czogSUVkaXRvckdyb3VwQWN0aXZhdGlvbkV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGFydC5vbkRpZEFjdGl2YXRlR3JvdXAoZSA9PiBhY3RpdmF0aW9uRXZlbnRzLnB1c2goZSkpKTtcblxuXHRcdGNvbnN0IHJvb3RHcm91cCA9IHBhcnQuZ3JvdXBzWzBdO1xuXHRcdGNvbnN0IHJpZ2h0R3JvdXAgPSBwYXJ0LmFkZEdyb3VwKHJvb3RHcm91cCwgR3JvdXBEaXJlY3Rpb24uUklHSFQpO1xuXG5cdFx0Ly8gQWN0aXZhdGUgYSBncm91cCBleHBsaWNpdGx5IC0gc2hvdWxkIGNhcnJ5IERFRkFVTFQgcmVhc29uXG5cdFx0YWN0aXZhdGlvbkV2ZW50cy5sZW5ndGggPSAwO1xuXHRcdHBhcnQuYWN0aXZhdGVHcm91cChyaWdodEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZhdGlvbkV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmF0aW9uRXZlbnRzWzBdLmdyb3VwLCByaWdodEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZhdGlvbkV2ZW50c1swXS5yZWFzb24sIEdyb3VwQWN0aXZhdGlvblJlYXNvbi5ERUZBVUxUKTtcblxuXHRcdC8vIEFjdGl2YXRlIHRoZSBzYW1lIGdyb3VwIGFnYWluIC0gc2hvdWxkIHN0aWxsIGZpcmUgd2l0aCBERUZBVUxUIHJlYXNvblxuXHRcdGFjdGl2YXRpb25FdmVudHMubGVuZ3RoID0gMDtcblx0XHRwYXJ0LmFjdGl2YXRlR3JvdXAocmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2YXRpb25FdmVudHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZhdGlvbkV2ZW50c1swXS5ncm91cCwgcmlnaHRHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2YXRpb25FdmVudHNbMF0ucmVhc29uLCBHcm91cEFjdGl2YXRpb25SZWFzb24uREVGQVVMVCk7XG5cblx0XHQvLyBBY3RpdmF0ZSByb290IGdyb3VwIGJhY2tcblx0XHRhY3RpdmF0aW9uRXZlbnRzLmxlbmd0aCA9IDA7XG5cdFx0cGFydC5hY3RpdmF0ZUdyb3VwKHJvb3RHcm91cCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2YXRpb25FdmVudHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZhdGlvbkV2ZW50c1swXS5ncm91cCwgcm9vdEdyb3VwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZhdGlvbkV2ZW50c1swXS5yZWFzb24sIEdyb3VwQWN0aXZhdGlvblJlYXNvbi5ERUZBVUxUKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtCQUErQixvQkFBb0IscUJBQXFDLHFCQUFnRCxtQkFBbUIseUJBQTBDO0FBQzlNLFNBQVMsZ0JBQWdCLGFBQWEsZ0JBQWdCLGtCQUFrQixlQUFlLGVBQWUsc0JBQXNCLG1CQUFtRCw2QkFBMEQ7QUFDek8sU0FBUyxnQkFBb0MsY0FBYyx5QkFBeUIsc0JBQXNCLGtCQUEwQyx3QkFBd0I7QUFDNUssU0FBUyxXQUFXO0FBQ3BCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBR3RDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CLHFCQUFxQjtBQUNsRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBRXhCLE1BQU0sdUJBQXVCLE1BQU07QUFFbEMsUUFBTSxpQkFBaUI7QUFDdkIsUUFBTSx1QkFBdUI7QUFFN0IsUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBRXhDLE1BQUksZ0NBQXVFO0FBRTNFLFFBQU0sTUFBTTtBQUNYLGdCQUFZLElBQUksbUJBQW1CLGdCQUFnQixDQUFDLElBQUksZUFBZSxtQkFBbUIsR0FBRyxJQUFJLGVBQWUscUJBQXFCLENBQUMsR0FBRyxvQkFBb0IsQ0FBQztBQUFBLEVBQy9KLENBQUM7QUFFRCxXQUFTLFlBQVk7QUFDcEIsUUFBSSwrQkFBK0I7QUFDbEMsWUFBTSxrQkFBa0IsNkJBQTZCO0FBQ3JELHNDQUFnQztBQUFBLElBQ2pDO0FBRUEsZ0JBQVksTUFBTTtBQUFBLEVBQ25CLENBQUM7QUFFRCxpQkFBZSxZQUFZLHVCQUF1Qiw4QkFBOEIsUUFBVyxXQUFXLEdBQXlEO0FBQzlKLHlCQUFxQixlQUFlLGNBQVksU0FBUyxHQUEyQixpQkFBaUIsYUFBYSxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ25JLFVBQU0sUUFBUSxNQUFNLGtCQUFrQixzQkFBc0IsV0FBVztBQUN2RSx5QkFBcUIsS0FBSyxzQkFBc0IsS0FBSztBQUVyRCxvQ0FBZ0M7QUFFaEMsV0FBTyxDQUFDLE9BQU8sb0JBQW9CO0FBQUEsRUFDcEM7QUFFQSxpQkFBZSxXQUFXLHNCQUFzRztBQUMvSCxVQUFNLENBQUMsT0FBTyx3QkFBd0IsSUFBSSxNQUFNLFlBQVksb0JBQW9CO0FBQ2hGLFdBQU8sQ0FBQyxNQUFNLGNBQWMsd0JBQXdCO0FBQUEsRUFDckQ7QUFFQSxXQUFTLDBCQUEwQixVQUFlLFFBQXFDO0FBQ3RGLFdBQU8sWUFBWSxJQUFJLElBQUksb0JBQW9CLFVBQVUsTUFBTSxDQUFDO0FBQUEsRUFDakU7QUFFQSxPQUFLLGlCQUFpQixpQkFBa0I7QUFDdkMsVUFBTSx1QkFBdUIsOEJBQThCLEVBQUUsbUJBQW1CLENBQUFBLDBCQUF3QkEsc0JBQXFCLGVBQWUsNkJBQTZCLEVBQUUsR0FBRyxXQUFXO0FBQ3pMLFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXLG9CQUFvQjtBQUVwRCxRQUFJLGdDQUFnQztBQUNwQyxVQUFNLGlDQUFpQyxLQUFLLHVCQUF1QixNQUFNO0FBQ3hFO0FBQUEsSUFDRCxDQUFDO0FBRUQsUUFBSSxvQkFBb0I7QUFDeEIsVUFBTSxxQkFBcUIsS0FBSyxjQUFjLE1BQU07QUFDbkQ7QUFBQSxJQUNELENBQUM7QUFFRCxRQUFJLHNCQUFzQjtBQUMxQixVQUFNLHVCQUF1QixLQUFLLGlCQUFpQixNQUFNO0FBQ3hEO0FBQUEsSUFDRCxDQUFDO0FBRUQsUUFBSSxvQkFBb0I7QUFDeEIsVUFBTSxxQkFBcUIsS0FBSyxlQUFlLE1BQU07QUFDcEQ7QUFBQSxJQUNELENBQUM7QUFHRCxVQUFNLFlBQVksS0FBSyxPQUFPLENBQUM7QUFDL0IsV0FBTyxZQUFZLGNBQWMsU0FBUyxHQUFHLElBQUk7QUFDakQsV0FBTyxZQUFZLEtBQUssT0FBTyxRQUFRLENBQUM7QUFDeEMsV0FBTyxZQUFZLEtBQUssT0FBTyxDQUFDO0FBQ2hDLFdBQU8sWUFBWSxXQUFXLEtBQUssU0FBUyxVQUFVLEVBQUUsQ0FBQztBQUN6RCxXQUFPLEdBQUcsS0FBSyxnQkFBZ0IsU0FBUztBQUN4QyxXQUFPLFlBQVksVUFBVSxPQUFPLFNBQVM7QUFFN0MsUUFBSSxNQUFNLEtBQUssVUFBVSxZQUFZLG9CQUFvQjtBQUN6RCxXQUFPLFlBQVksSUFBSSxRQUFRLENBQUM7QUFDaEMsV0FBTyxZQUFZLElBQUksQ0FBQyxHQUFHLFNBQVM7QUFFcEMsVUFBTSxhQUFhLEtBQUssU0FBUyxXQUFXLGVBQWUsS0FBSztBQUNoRSxXQUFPLFlBQVksWUFBWSxLQUFLLFNBQVMsV0FBVyxFQUFFLENBQUM7QUFDM0QsV0FBTyxZQUFZLG1CQUFtQixDQUFDO0FBQ3ZDLFdBQU8sWUFBWSxLQUFLLE9BQU8sUUFBUSxDQUFDO0FBQ3hDLFdBQU8sWUFBWSxLQUFLLE9BQU8sQ0FBQztBQUNoQyxXQUFPLEdBQUcsS0FBSyxnQkFBZ0IsU0FBUztBQUN4QyxXQUFPLFlBQVksVUFBVSxPQUFPLFNBQVM7QUFDN0MsV0FBTyxZQUFZLFdBQVcsT0FBTyxTQUFTO0FBRTlDLFVBQU0sS0FBSyxVQUFVLFlBQVksb0JBQW9CO0FBQ3JELFdBQU8sWUFBWSxJQUFJLFFBQVEsQ0FBQztBQUNoQyxXQUFPLFlBQVksSUFBSSxDQUFDLEdBQUcsU0FBUztBQUNwQyxXQUFPLFlBQVksSUFBSSxDQUFDLEdBQUcsVUFBVTtBQUVyQyxXQUFPLFlBQVksK0JBQStCLENBQUM7QUFFbkQsUUFBSSwrQkFBK0I7QUFDbkMsVUFBTSwrQkFBK0IsVUFBVSxpQkFBaUIsT0FBSztBQUNwRSxVQUFJLEVBQUUsU0FBUyxxQkFBcUIsY0FBYztBQUNqRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxRQUFJLGdDQUFnQztBQUNwQyxVQUFNLGdDQUFnQyxXQUFXLGlCQUFpQixPQUFLO0FBQ3RFLFVBQUksRUFBRSxTQUFTLHFCQUFxQixjQUFjO0FBQ2pEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssY0FBYyxVQUFVO0FBQzdCLFdBQU8sR0FBRyxLQUFLLGdCQUFnQixVQUFVO0FBQ3pDLFdBQU8sWUFBWSwrQkFBK0IsQ0FBQztBQUNuRCxXQUFPLFlBQVksOEJBQThCLENBQUM7QUFDbEQsV0FBTyxZQUFZLCtCQUErQixDQUFDO0FBRW5ELGlDQUE2QixRQUFRO0FBQ3JDLGtDQUE4QixRQUFRO0FBRXRDLFVBQU0sS0FBSyxVQUFVLFlBQVksb0JBQW9CO0FBQ3JELFdBQU8sWUFBWSxJQUFJLFFBQVEsQ0FBQztBQUNoQyxXQUFPLFlBQVksSUFBSSxDQUFDLEdBQUcsVUFBVTtBQUNyQyxXQUFPLFlBQVksSUFBSSxDQUFDLEdBQUcsU0FBUztBQUVwQyxVQUFNLFlBQVksS0FBSyxTQUFTLFlBQVksZUFBZSxJQUFJO0FBQy9ELFFBQUksYUFBYTtBQUNqQixnQkFBWSxJQUFJLFVBQVUsY0FBYyxNQUFNO0FBQzdDLG1CQUFhO0FBQUEsSUFDZCxDQUFDLENBQUM7QUFDRixXQUFPLFlBQVksbUJBQW1CLENBQUM7QUFDdkMsV0FBTyxZQUFZLEtBQUssT0FBTyxRQUFRLENBQUM7QUFDeEMsV0FBTyxHQUFHLEtBQUssZ0JBQWdCLFVBQVU7QUFDekMsV0FBTyxHQUFHLENBQUMsVUFBVSxnQkFBZ0I7QUFDckMsV0FBTyxZQUFZLFVBQVUsT0FBTyxTQUFTO0FBQzdDLFdBQU8sWUFBWSxXQUFXLE9BQU8sU0FBUztBQUM5QyxXQUFPLFlBQVksVUFBVSxPQUFPLFNBQVM7QUFFN0MsVUFBTSxLQUFLLFVBQVUsWUFBWSxvQkFBb0I7QUFDckQsV0FBTyxZQUFZLElBQUksUUFBUSxDQUFDO0FBQ2hDLFdBQU8sWUFBWSxJQUFJLENBQUMsR0FBRyxVQUFVO0FBQ3JDLFdBQU8sWUFBWSxJQUFJLENBQUMsR0FBRyxTQUFTO0FBQ3BDLFdBQU8sWUFBWSxJQUFJLENBQUMsR0FBRyxTQUFTO0FBRXBDLFVBQU0sWUFBWSxLQUFLLFVBQVUsWUFBWSxlQUFlO0FBQzVELFdBQU8sWUFBWSxVQUFVLFFBQVEsQ0FBQztBQUN0QyxXQUFPLFlBQVksVUFBVSxDQUFDLEdBQUcsU0FBUztBQUMxQyxXQUFPLFlBQVksVUFBVSxDQUFDLEVBQUUsT0FBTyxDQUFDO0FBQ3hDLFdBQU8sWUFBWSxVQUFVLENBQUMsR0FBRyxVQUFVO0FBQzNDLFdBQU8sWUFBWSxVQUFVLENBQUMsRUFBRSxPQUFPLENBQUM7QUFDeEMsV0FBTyxZQUFZLFVBQVUsQ0FBQyxHQUFHLFNBQVM7QUFDMUMsV0FBTyxZQUFZLFVBQVUsQ0FBQyxFQUFFLE9BQU8sQ0FBQztBQUV4QyxTQUFLLFVBQVUsV0FBVyxZQUFZLGVBQWUsSUFBSTtBQUN6RCxXQUFPLFlBQVksbUJBQW1CLENBQUM7QUFFdkMsU0FBSyxZQUFZLFNBQVM7QUFDMUIsV0FBTyxHQUFHLENBQUMsS0FBSyxTQUFTLFVBQVUsRUFBRSxDQUFDO0FBQ3RDLFdBQU8sR0FBRyxDQUFDLEtBQUssU0FBUyxVQUFVLEVBQUUsQ0FBQztBQUN0QyxXQUFPLFlBQVksWUFBWSxJQUFJO0FBQ25DLFdBQU8sWUFBWSxxQkFBcUIsQ0FBQztBQUN6QyxXQUFPLFlBQVksS0FBSyxPQUFPLFFBQVEsQ0FBQztBQUN4QyxXQUFPLEdBQUcsS0FBSyxnQkFBZ0IsVUFBVTtBQUN6QyxXQUFPLFlBQVksVUFBVSxPQUFPLFNBQVM7QUFDN0MsV0FBTyxZQUFZLFdBQVcsT0FBTyxTQUFTO0FBRTlDLFVBQU0sS0FBSyxVQUFVLFlBQVksb0JBQW9CO0FBQ3JELFdBQU8sWUFBWSxJQUFJLFFBQVEsQ0FBQztBQUNoQyxXQUFPLFlBQVksSUFBSSxDQUFDLEdBQUcsVUFBVTtBQUNyQyxXQUFPLFlBQVksSUFBSSxDQUFDLEdBQUcsU0FBUztBQUVwQyxVQUFNLDhCQUE4QixLQUFLLFlBQVk7QUFDckQsVUFBTSw2QkFBNkIsVUFBVTtBQUU3QyxXQUFPLEdBQUcsMkJBQTJCO0FBQ3JDLFdBQU8sR0FBRywwQkFBMEI7QUFDcEMsV0FBTyxHQUFHLGdDQUFnQywwQkFBMEI7QUFFcEUsU0FBSyxZQUFZLFVBQVU7QUFDM0IsV0FBTyxZQUFZLHFCQUFxQixDQUFDO0FBQ3pDLFdBQU8sWUFBWSxLQUFLLE9BQU8sUUFBUSxDQUFDO0FBQ3hDLFdBQU8sR0FBRyxLQUFLLGdCQUFnQixTQUFTO0FBRXhDLFVBQU0sS0FBSyxVQUFVLFlBQVksb0JBQW9CO0FBQ3JELFdBQU8sWUFBWSxJQUFJLFFBQVEsQ0FBQztBQUNoQyxXQUFPLFlBQVksSUFBSSxDQUFDLEdBQUcsU0FBUztBQUVwQyxTQUFLLFlBQVksU0FBUztBQUMxQixXQUFPLFlBQVksS0FBSyxPQUFPLFFBQVEsQ0FBQztBQUN4QyxXQUFPLFlBQVkscUJBQXFCLENBQUM7QUFDekMsV0FBTyxHQUFHLEtBQUssZ0JBQWdCLFNBQVM7QUFFeEMsU0FBSyxvQkFBb0IsS0FBSyxnQkFBZ0IsaUJBQWlCLGFBQWEsaUJBQWlCLFdBQVcsaUJBQWlCLFVBQVU7QUFFbkksbUNBQStCLFFBQVE7QUFDdkMsdUJBQW1CLFFBQVE7QUFDM0IseUJBQXFCLFFBQVE7QUFDN0IsdUJBQW1CLFFBQVE7QUFBQSxFQUM1QixDQUFDO0FBRUQsT0FBSyxhQUFhLFlBQVk7QUFDN0IsVUFBTSx1QkFBdUIsOEJBQThCLEVBQUUsbUJBQW1CLENBQUFBLDBCQUF3QkEsc0JBQXFCLGVBQWUsNkJBQTZCLEVBQUUsR0FBRyxXQUFXO0FBQ3pMLFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXLG9CQUFvQjtBQUVwRCxVQUFNLFlBQVksS0FBSztBQUV2QixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBQ25GLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUVuRixVQUFNLFVBQVUsV0FBVyxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDbkQsVUFBTSxLQUFLLFVBQVUsV0FBVyxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDeEQsV0FBTyxZQUFZLEtBQUssT0FBTyxDQUFDO0FBRWhDLFNBQUssY0FBYyxTQUFTO0FBQzVCLFVBQU0sS0FBSyxVQUFVLFdBQVcsUUFBUSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQ3hELFdBQU8sWUFBWSxLQUFLLE9BQU8sQ0FBQztBQUFBLEVBQ2pDLENBQUM7QUFFRCxPQUFLLHdCQUF3QixpQkFBa0I7QUFDOUMsVUFBTSxDQUFDLE1BQU0sb0JBQW9CLElBQUksTUFBTSxXQUFXO0FBRXRELFVBQU0sWUFBWSxLQUFLLE9BQU8sQ0FBQztBQUMvQixVQUFNLGFBQWEsS0FBSyxTQUFTLFdBQVcsZUFBZSxLQUFLO0FBQ2hFLFVBQU0sWUFBWSxLQUFLLFNBQVMsWUFBWSxlQUFlLElBQUk7QUFFL0QsVUFBTSxpQkFBaUIsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBQzNGLFVBQU0sVUFBVSxXQUFXLGdCQUFnQixFQUFFLFFBQVEsS0FBSyxDQUFDO0FBRTNELFVBQU0sa0JBQWtCLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUM1RixVQUFNLFdBQVcsV0FBVyxpQkFBaUIsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUU3RCxXQUFPLFlBQVksS0FBSyxPQUFPLFFBQVEsQ0FBQztBQUV4QyxTQUFLLGNBQWM7QUFDbkIsU0FBSyxRQUFRO0FBRWIsVUFBTSxDQUFDLFlBQVksSUFBSSxNQUFNLFdBQVcsb0JBQW9CO0FBRTVELFdBQU8sWUFBWSxhQUFhLE9BQU8sUUFBUSxDQUFDO0FBQ2hELFdBQU8sR0FBRyxhQUFhLFNBQVMsVUFBVSxFQUFFLENBQUM7QUFDN0MsV0FBTyxHQUFHLGFBQWEsU0FBUyxVQUFVLEVBQUUsQ0FBQztBQUM3QyxXQUFPLEdBQUcsYUFBYSxTQUFTLFdBQVcsRUFBRSxDQUFDO0FBQzlDLFdBQU8sR0FBRyxhQUFhLFNBQVMsV0FBVyxFQUFFLENBQUM7QUFDOUMsV0FBTyxHQUFHLGFBQWEsU0FBUyxVQUFVLEVBQUUsQ0FBQztBQUM3QyxXQUFPLEdBQUcsYUFBYSxTQUFTLFVBQVUsRUFBRSxDQUFDO0FBRTdDLGlCQUFhLFdBQVc7QUFBQSxFQUN6QixDQUFDO0FBRUQsT0FBSyx5QkFBeUIsaUJBQWtCO0FBQy9DLFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXO0FBRWhDLFVBQU0sWUFBWSxLQUFLLE9BQU8sQ0FBQztBQUMvQixVQUFNLGFBQWEsS0FBSyxTQUFTLFdBQVcsZUFBZSxLQUFLO0FBQ2hFLFVBQU0sWUFBWSxLQUFLLFNBQVMsWUFBWSxlQUFlLElBQUk7QUFFL0QsUUFBSSwyQkFBMkI7QUFDL0IsVUFBTSw0QkFBNEIsS0FBSyxzQkFBc0IsTUFBTTtBQUNsRTtBQUFBLElBQ0QsQ0FBQztBQUVELFFBQUkscUJBQXFCO0FBQ3pCLFVBQU0sc0JBQXNCLFVBQVUsaUJBQWlCLE9BQUs7QUFDM0QsVUFBSSxFQUFFLFNBQVMscUJBQXFCLGFBQWE7QUFDaEQ7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTyxZQUFZLFVBQVUsT0FBTyxDQUFDO0FBQ3JDLFdBQU8sWUFBWSxXQUFXLE9BQU8sQ0FBQztBQUN0QyxXQUFPLFlBQVksVUFBVSxPQUFPLENBQUM7QUFDckMsV0FBTyxZQUFZLFVBQVUsT0FBTyxTQUFTO0FBQzdDLFdBQU8sWUFBWSxXQUFXLE9BQU8sU0FBUztBQUM5QyxXQUFPLFlBQVksVUFBVSxPQUFPLFNBQVM7QUFFN0MsU0FBSyxZQUFZLFVBQVU7QUFDM0IsV0FBTyxZQUFZLFVBQVUsT0FBTyxDQUFDO0FBQ3JDLFdBQU8sWUFBWSxVQUFVLE9BQU8sQ0FBQztBQUNyQyxXQUFPLFlBQVksVUFBVSxPQUFPLFNBQVM7QUFDN0MsV0FBTyxZQUFZLFVBQVUsT0FBTyxTQUFTO0FBQzdDLFdBQU8sWUFBWSxvQkFBb0IsQ0FBQztBQUN4QyxXQUFPLFlBQVksMEJBQTBCLENBQUM7QUFFOUMsU0FBSyxVQUFVLFdBQVcsV0FBVyxlQUFlLEVBQUU7QUFDdEQsV0FBTyxZQUFZLFVBQVUsT0FBTyxDQUFDO0FBQ3JDLFdBQU8sWUFBWSxVQUFVLE9BQU8sQ0FBQztBQUNyQyxXQUFPLFlBQVksVUFBVSxPQUFPLFNBQVM7QUFDN0MsV0FBTyxZQUFZLFVBQVUsT0FBTyxTQUFTO0FBQzdDLFdBQU8sWUFBWSxvQkFBb0IsQ0FBQztBQUN4QyxXQUFPLFlBQVksMEJBQTBCLENBQUM7QUFFOUMsVUFBTSxnQkFBZ0IsS0FBSyxTQUFTLFdBQVcsZUFBZSxFQUFFO0FBQ2hFLFdBQU8sWUFBWSxjQUFjLE9BQU8sQ0FBQztBQUN6QyxXQUFPLFlBQVksVUFBVSxPQUFPLENBQUM7QUFDckMsV0FBTyxZQUFZLFVBQVUsT0FBTyxDQUFDO0FBQ3JDLFdBQU8sWUFBWSxjQUFjLE9BQU8sU0FBUztBQUNqRCxXQUFPLFlBQVksVUFBVSxPQUFPLFNBQVM7QUFDN0MsV0FBTyxZQUFZLFVBQVUsT0FBTyxTQUFTO0FBQzdDLFdBQU8sWUFBWSxvQkFBb0IsQ0FBQztBQUN4QyxXQUFPLFlBQVksMEJBQTBCLENBQUM7QUFFOUMsd0JBQW9CLFFBQVE7QUFDNUIsOEJBQTBCLFFBQVE7QUFBQSxFQUNuQyxDQUFDO0FBRUQsT0FBSyxnQkFBZ0IsaUJBQWtCO0FBQ3RDLFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXO0FBRWhDLFVBQU0sWUFBWSxLQUFLLE9BQU8sQ0FBQztBQUMvQixVQUFNLGFBQWEsS0FBSyxTQUFTLFdBQVcsZUFBZSxLQUFLO0FBRWhFLFFBQUksMEJBQTBCO0FBQzlCLFVBQU0sNEJBQTRCLEtBQUssc0JBQXNCLE1BQU07QUFDbEU7QUFBQSxJQUNELENBQUM7QUFFRCxRQUFJLDhCQUE4QjtBQUNsQyxVQUFNLCtCQUErQixVQUFVLGlCQUFpQixPQUFLO0FBQ3BFLFVBQUksRUFBRSxTQUFTLHFCQUFxQixhQUFhO0FBQ2hEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFFBQUksK0JBQStCO0FBQ25DLFVBQU0sZ0NBQWdDLFdBQVcsaUJBQWlCLE9BQUs7QUFDdEUsVUFBSSxFQUFFLFNBQVMscUJBQXFCLGFBQWE7QUFDaEQ7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTyxZQUFZLFVBQVUsT0FBTyxTQUFTO0FBQzdDLFdBQU8sWUFBWSxXQUFXLE9BQU8sU0FBUztBQUU5QyxTQUFLLHdCQUF3QixVQUFVO0FBRXZDLFdBQU8sWUFBWSxVQUFVLE9BQU8sbUJBQW1CO0FBQ3ZELFdBQU8sWUFBWSxXQUFXLE9BQU8sbUJBQW1CO0FBRXhELFdBQU8sWUFBWSw2QkFBNkIsQ0FBQztBQUNqRCxXQUFPLFlBQVksOEJBQThCLENBQUM7QUFDbEQsV0FBTyxZQUFZLHlCQUF5QixDQUFDO0FBRTdDLFNBQUssd0JBQXdCLFVBQVU7QUFFdkMsV0FBTyxZQUFZLFVBQVUsT0FBTyxtQkFBbUI7QUFDdkQsV0FBTyxZQUFZLFdBQVcsT0FBTyxtQkFBbUI7QUFFeEQsV0FBTyxZQUFZLDZCQUE2QixDQUFDO0FBQ2pELFdBQU8sWUFBWSw4QkFBOEIsQ0FBQztBQUNsRCxXQUFPLFlBQVkseUJBQXlCLENBQUM7QUFFN0MsaUNBQTZCLFFBQVE7QUFDckMsa0NBQThCLFFBQVE7QUFDdEMsOEJBQTBCLFFBQVE7QUFBQSxFQUNuQyxDQUFDO0FBRUQsT0FBSyxxQkFBcUIsWUFBWTtBQUNyQyxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUVoQyxRQUFJLG9CQUFvQjtBQUN4QixVQUFNLHFCQUFxQixLQUFLLGNBQWMsTUFBTTtBQUNuRDtBQUFBLElBQ0QsQ0FBQztBQUVELFFBQUksc0JBQXNCO0FBQzFCLFVBQU0sdUJBQXVCLEtBQUssaUJBQWlCLE1BQU07QUFDeEQ7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLFlBQVksS0FBSyxPQUFPLENBQUM7QUFDL0IsUUFBSSxvQkFBb0I7QUFDeEIsVUFBTSxrQkFBa0IsVUFBVSxjQUFjLE1BQU07QUFDckQsMEJBQW9CO0FBQUEsSUFDckIsQ0FBQztBQUVELFVBQU0sUUFBUSwwQkFBMEIsSUFBSSxLQUFLLFNBQVMsR0FBRyxvQkFBb0I7QUFFakYsVUFBTSxVQUFVLFdBQVcsT0FBTyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQ2xELFVBQU0sYUFBYSxLQUFLLFNBQVMsV0FBVyxlQUFlLEtBQUs7QUFDaEUsU0FBSyxjQUFjLFVBQVU7QUFDN0IsVUFBTSxZQUFZLEtBQUssVUFBVSxXQUFXLFlBQVksZUFBZSxJQUFJO0FBQzNFLFdBQU8sWUFBWSxtQkFBbUIsQ0FBQztBQUN2QyxXQUFPLFlBQVksVUFBVSxPQUFPLENBQUM7QUFDckMsV0FBTyxHQUFHLFVBQVUsd0JBQXdCLG1CQUFtQjtBQUMvRCxRQUFJLE1BQU0sS0FBSyxXQUFXLFdBQVcsWUFBWSxFQUFFLE1BQU0sZUFBZSxhQUFhLENBQUM7QUFDdEYsV0FBTyxZQUFZLEtBQUssSUFBSTtBQUM1QixXQUFPLFlBQVksV0FBVyxPQUFPLENBQUM7QUFDdEMsV0FBTyxHQUFHLFdBQVcsd0JBQXdCLG1CQUFtQjtBQUNoRSxVQUFNLEtBQUssV0FBVyxXQUFXLFlBQVksRUFBRSxNQUFNLGVBQWUsYUFBYSxDQUFDO0FBQ2xGLFdBQU8sWUFBWSxLQUFLLElBQUk7QUFDNUIsV0FBTyxZQUFZLFVBQVUsT0FBTyxDQUFDO0FBQ3JDLFVBQU0sS0FBSyxXQUFXLFdBQVcsU0FBUztBQUMxQyxXQUFPLFlBQVksS0FBSyxJQUFJO0FBQzVCLFdBQU8sWUFBWSxxQkFBcUIsQ0FBQztBQUN6QyxXQUFPLFlBQVksbUJBQW1CLElBQUk7QUFFMUMsdUJBQW1CLFFBQVE7QUFDM0IseUJBQXFCLFFBQVE7QUFDN0Isb0JBQWdCLFFBQVE7QUFDeEIsU0FBSyxRQUFRO0FBQUEsRUFDZCxDQUFDO0FBRUQsT0FBSyxvQkFBb0IsWUFBWTtBQUNwQyxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUVoQyxVQUFNLFlBQVksS0FBSyxPQUFPLENBQUM7QUFFL0IsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUNuRixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBQ25GLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFFbkYsVUFBTSxVQUFVLFdBQVcsUUFBUSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBRW5ELFVBQU0sYUFBYSxLQUFLLFNBQVMsV0FBVyxlQUFlLEtBQUs7QUFDaEUsVUFBTSxXQUFXLFdBQVcsUUFBUSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBRXBELFVBQU0sWUFBWSxLQUFLLFVBQVUsV0FBVyxZQUFZLGVBQWUsSUFBSTtBQUMzRSxVQUFNLFVBQVUsV0FBVyxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFFbkQsU0FBSyxjQUFjLFNBQVM7QUFFNUIsV0FBTyxZQUFZLFVBQVUsT0FBTyxDQUFDO0FBRXJDLFVBQU0sU0FBUyxLQUFLLGVBQWUsS0FBSyxXQUFXO0FBQ25ELFdBQU8sWUFBWSxRQUFRLElBQUk7QUFDL0IsV0FBTyxZQUFZLFVBQVUsT0FBTyxDQUFDO0FBRXJDLFNBQUssUUFBUTtBQUFBLEVBQ2QsQ0FBQztBQUVELE9BQUssNEJBQTRCLFlBQVk7QUFDNUMsVUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLFdBQVc7QUFFaEMsVUFBTSxLQUFLO0FBQ1gsV0FBTyxZQUFZLEtBQUssU0FBUyxJQUFJO0FBQ3JDLFVBQU0sS0FBSztBQUFBLEVBQ1osQ0FBQztBQUVELE9BQUssV0FBVyxZQUFZO0FBQzNCLFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXO0FBRWhDLFFBQUk7QUFDSixRQUFJO0FBQ0osZ0JBQVksSUFBSSxLQUFLLDZCQUE2QixXQUFTO0FBQzFELG1CQUFhLE1BQU07QUFDbkIsbUJBQWEsTUFBTTtBQUFBLElBQ3BCLENBQUMsQ0FBQztBQUVGLFVBQU0saUJBQWlCLEtBQUs7QUFDNUIsV0FBTyxHQUFHLGNBQWM7QUFFeEIsZ0JBQVksSUFBSSxLQUFLLG1CQUFtQixFQUFFLFVBQVUsU0FBUyxDQUFDLENBQUM7QUFDL0QsV0FBTyxZQUFZLEtBQUssWUFBWSxVQUFVLFFBQVE7QUFDdEQsV0FBTyxZQUFZLFdBQVcsVUFBVSxRQUFRO0FBQ2hELFdBQU8sWUFBWSxZQUFZLGNBQWM7QUFFN0MsVUFBTSxXQUFXLEtBQUssbUJBQW1CLEVBQUUsb0JBQW9CLE1BQU0sQ0FBQztBQUN0RSxXQUFPLFlBQVksS0FBSyxZQUFZLG9CQUFvQixLQUFLO0FBQzdELGFBQVMsUUFBUTtBQUNqQixXQUFPLFlBQVksS0FBSyxZQUFZLG9CQUFvQixJQUFJO0FBQUEsRUFDN0QsQ0FBQztBQUVELE9BQUssaUJBQWlCLGlCQUFrQjtBQUN2QyxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFFBQVEsS0FBSztBQUNuQixXQUFPLFlBQVksTUFBTSxTQUFTLElBQUk7QUFFdEMsUUFBSSw0QkFBNEI7QUFDaEMsUUFBSSx1QkFBdUI7QUFDM0IsVUFBTSxtQkFBNkMsQ0FBQztBQUNwRCxRQUFJLHFCQUFxQjtBQUN6QixVQUFNLG9CQUE4QyxDQUFDO0FBQ3JELFFBQUksbUJBQW1CO0FBQ3ZCLFFBQUksc0JBQXNCO0FBQzFCLFFBQUksNEJBQTRCO0FBQ2hDLFVBQU0saUNBQWlDLE1BQU0saUJBQWlCLE9BQUs7QUFDbEUsVUFBSSxFQUFFLFNBQVMscUJBQXFCLGFBQWE7QUFDaEQsZUFBTyxHQUFHLEVBQUUsTUFBTTtBQUNsQjtBQUNBLHlCQUFpQixLQUFLLENBQUM7QUFBQSxNQUN4QixXQUFXLEVBQUUsU0FBUyxxQkFBcUIsWUFBWTtBQUN0RCxlQUFPLEdBQUcsRUFBRSxNQUFNO0FBQ2xCO0FBQUEsTUFDRCxXQUFXLEVBQUUsU0FBUyxxQkFBcUIsZUFBZTtBQUN6RCxlQUFPLEdBQUcsRUFBRSxNQUFNO0FBQ2xCO0FBQUEsTUFDRCxXQUFXLEVBQUUsU0FBUyxxQkFBcUIscUJBQXFCO0FBQy9ELGVBQU8sR0FBRyxFQUFFLE1BQU07QUFDbEI7QUFBQSxNQUNELFdBQVcsRUFBRSxTQUFTLHFCQUFxQixjQUFjO0FBQ3hELGVBQU8sR0FBRyxFQUFFLE1BQU07QUFDbEI7QUFDQSwwQkFBa0IsS0FBSyxDQUFDO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLDZCQUE2QixNQUFNLHdCQUF3QixPQUFLO0FBQ3JFLGFBQU8sR0FBRyxFQUFFLE1BQU07QUFDbEI7QUFBQSxJQUNELENBQUM7QUFFRCxRQUFJLHNCQUFzQjtBQUMxQixVQUFNLHNCQUFzQixNQUFNLGlCQUFpQixNQUFNO0FBQ3hEO0FBQUEsSUFDRCxDQUFDO0FBRUQsUUFBSSx5QkFBeUI7QUFDN0IsVUFBTSwwQkFBMEIsTUFBTSxrQkFBa0IsTUFBTTtBQUM3RDtBQUFBLElBQ0QsQ0FBQztBQUVELFFBQUksd0JBQXdCO0FBQzVCLFVBQU0seUJBQXlCLE1BQU0saUJBQWlCLE1BQU07QUFDM0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLFFBQVEsMEJBQTBCLElBQUksS0FBSyxTQUFTLEdBQUcsb0JBQW9CO0FBQ2pGLFVBQU0sZ0JBQWdCLDBCQUEwQixJQUFJLEtBQUssa0JBQWtCLEdBQUcsb0JBQW9CO0FBRWxHLFVBQU0sTUFBTSxXQUFXLE9BQU8sRUFBRSxRQUFRLEtBQUssQ0FBQztBQUM5QyxVQUFNLE1BQU0sV0FBVyxlQUFlLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFFeEQsV0FBTyxZQUFZLE1BQU0sU0FBUyxLQUFLLEdBQUcsSUFBSTtBQUM5QyxXQUFPLFlBQVksTUFBTSxTQUFTLGFBQWEsR0FBRyxLQUFLO0FBQ3ZELFdBQU8sWUFBWSxNQUFNLFNBQVMsS0FBSyxHQUFHLElBQUk7QUFDOUMsV0FBTyxZQUFZLE1BQU0sU0FBUyxhQUFhLEdBQUcsSUFBSTtBQUN0RCxXQUFPLFlBQVksTUFBTSxTQUFTLEtBQUs7QUFDdkMsV0FBTyxZQUFZLE1BQU0sT0FBTyxDQUFDO0FBQ2pDLFdBQU8sWUFBWSwyQkFBMkIsQ0FBQztBQUMvQyxXQUFPLFlBQVksc0JBQXNCLENBQUM7QUFDMUMsV0FBTyxZQUFhLGlCQUFpQixDQUFDLEVBQTRCLGFBQWEsQ0FBQztBQUNoRixXQUFPLFlBQWEsaUJBQWlCLENBQUMsRUFBNEIsYUFBYSxDQUFDO0FBQ2hGLFdBQU8sWUFBWSxpQkFBaUIsQ0FBQyxFQUFFLFFBQVEsS0FBSztBQUNwRCxXQUFPLFlBQVksaUJBQWlCLENBQUMsRUFBRSxRQUFRLGFBQWE7QUFDNUQsV0FBTyxZQUFZLDJCQUEyQixDQUFDO0FBQy9DLFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsS0FBSztBQUNuRCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLGFBQWE7QUFDM0QsV0FBTyxZQUFZLE1BQU0saUJBQWlCLEtBQUssR0FBRyxDQUFDO0FBQ25ELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixhQUFhLEdBQUcsQ0FBQztBQUMzRCxXQUFPLFlBQVksTUFBTSxRQUFRLEtBQUssR0FBRyxJQUFJO0FBQzdDLFdBQU8sWUFBWSxNQUFNLFFBQVEsYUFBYSxHQUFHLEtBQUs7QUFDdEQsV0FBTyxZQUFZLE1BQU0sT0FBTyxLQUFLLEdBQUcsS0FBSztBQUM3QyxXQUFPLFlBQVksTUFBTSxPQUFPLGFBQWEsR0FBRyxJQUFJO0FBRXBELFVBQU0sZUFBZSx3QkFBd0I7QUFDN0MsV0FBTyxZQUFZLDJCQUEyQixDQUFDO0FBRS9DLGtCQUFjLGVBQWUsd0JBQXdCO0FBQ3JELFdBQU8sWUFBWSwyQkFBMkIsQ0FBQztBQUUvQyxXQUFPLFlBQVksTUFBTSxlQUFlLGFBQWE7QUFDckQsV0FBTyxZQUFZLE1BQU0sU0FBUyxhQUFhLEdBQUcsS0FBSztBQUN2RCxVQUFNLFVBQVUsYUFBYTtBQUM3QixXQUFPLFlBQVksa0JBQWtCLENBQUM7QUFDdEMsV0FBTyxZQUFZLE1BQU0sU0FBUyxhQUFhLEdBQUcsSUFBSTtBQUN0RCxXQUFPLEdBQUcsQ0FBQyxNQUFNLGFBQWE7QUFFOUIsV0FBTyxZQUFZLE1BQU0sY0FBYyxLQUFLO0FBQzVDLFdBQU8sWUFBWSxNQUFNLGtCQUFrQixNQUFNLEdBQUcsY0FBYztBQUNsRSxXQUFPLFlBQVksTUFBTSxPQUFPLENBQUM7QUFFakMsVUFBTSxNQUFNLE1BQU0sV0FBVyxhQUFhLG9CQUFvQjtBQUM5RCxXQUFPLFlBQVksSUFBSSxDQUFDLEdBQUcsS0FBSztBQUNoQyxXQUFPLFlBQVksSUFBSSxDQUFDLEdBQUcsYUFBYTtBQUV4QyxVQUFNLE1BQU0sV0FBVyxhQUFhO0FBQ3BDLFdBQU8sWUFBWSwyQkFBMkIsQ0FBQztBQUMvQyxXQUFPLFlBQVksTUFBTSxjQUFjLGFBQWE7QUFFcEQsVUFBTSxNQUFNLFdBQVcsS0FBSztBQUM1QixVQUFNLFNBQVMsTUFBTSxNQUFNLFlBQVksYUFBYTtBQUNwRCxXQUFPLFlBQVksUUFBUSxJQUFJO0FBRS9CLFdBQU8sWUFBWSwyQkFBMkIsQ0FBQztBQUMvQyxXQUFPLFlBQVksb0JBQW9CLENBQUM7QUFDeEMsV0FBTyxZQUFhLGtCQUFrQixDQUFDLEVBQTRCLGFBQWEsQ0FBQztBQUNqRixXQUFPLFlBQVksa0JBQWtCLENBQUMsRUFBRSxRQUFRLGFBQWE7QUFDN0QsV0FBTyxZQUFZLHFCQUFxQixDQUFDO0FBQ3pDLFdBQU8sWUFBWSx3QkFBd0IsQ0FBQztBQUM1QyxXQUFPLFlBQVksdUJBQXVCLENBQUM7QUFFM0MsV0FBTyxHQUFHLGNBQWMsV0FBVztBQUVuQyxXQUFPLFlBQVksTUFBTSxjQUFjLEtBQUs7QUFFNUMsV0FBTyxZQUFZLHFCQUFxQixDQUFDO0FBQ3pDLFVBQU0sWUFBWSxLQUFLO0FBQ3ZCLFdBQU8sWUFBWSxxQkFBcUIsQ0FBQztBQUN6QyxVQUFNLGNBQWMsS0FBSztBQUN6QixXQUFPLFlBQVkscUJBQXFCLENBQUM7QUFFekMsd0JBQW9CLFFBQVE7QUFDNUIsNEJBQXdCLFFBQVE7QUFDaEMsMkJBQXVCLFFBQVE7QUFDL0IsK0JBQTJCLFFBQVE7QUFDbkMsbUNBQStCLFFBQVE7QUFBQSxFQUN4QyxDQUFDO0FBRUQsT0FBSyw4QkFBOEIsWUFBWTtBQUM5QyxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFFBQVEsS0FBSztBQUNuQixXQUFPLFlBQVksTUFBTSxTQUFTLElBQUk7QUFFdEMsVUFBTSxRQUFRLDBCQUEwQixJQUFJLEtBQUssU0FBUyxHQUFHLG9CQUFvQjtBQUNqRixVQUFNLGdCQUFnQiwwQkFBMEIsSUFBSSxLQUFLLGtCQUFrQixHQUFHLG9CQUFvQjtBQUVsRyxVQUFNLE1BQU0sWUFBWTtBQUFBLE1BQ3ZCLEVBQUUsUUFBUSxPQUFPLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRTtBQUFBLE1BQzNDLEVBQUUsUUFBUSxjQUFjO0FBQUEsSUFDekIsQ0FBQztBQUVELFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUNqQyxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLEtBQUs7QUFDbkQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxhQUFhO0FBRTNELFVBQU0sTUFBTSxhQUFhLENBQUMsT0FBTyxhQUFhLENBQUM7QUFFL0MsV0FBTyxHQUFHLE1BQU0sV0FBVztBQUMzQixXQUFPLEdBQUcsY0FBYyxXQUFXO0FBRW5DLFdBQU8sWUFBWSxNQUFNLFNBQVMsSUFBSTtBQUFBLEVBQ3ZDLENBQUM7QUFFRCxPQUFLLHVDQUF1QyxZQUFZO0FBQ3ZELFVBQU0sQ0FBQyxNQUFNLG9CQUFvQixJQUFJLE1BQU0sV0FBVztBQUV0RCxVQUFNLFdBQVcscUJBQXFCLGVBQWUsbUJBQW1CO0FBQ3hFLGFBQVMsa0JBQWtCLGlCQUFpQixjQUFjLFNBQVM7QUFFbkUsVUFBTSxRQUFRLEtBQUs7QUFFbkIsVUFBTSxRQUFRLDBCQUEwQixJQUFJLEtBQUssU0FBUyxHQUFHLG9CQUFvQjtBQUNqRixVQUFNLFFBQVE7QUFFZCxVQUFNLE1BQU0sV0FBVyxLQUFLO0FBRTVCLGFBQVMsa0JBQWtCLGlCQUFpQixjQUFjLE1BQU07QUFDaEUsUUFBSSxTQUFTLE1BQU0sTUFBTSxZQUFZLEtBQUs7QUFDMUMsV0FBTyxZQUFZLFFBQVEsS0FBSztBQUVoQyxXQUFPLEdBQUcsQ0FBQyxNQUFNLFdBQVc7QUFFNUIsYUFBUyxrQkFBa0IsaUJBQWlCLGNBQWMsU0FBUztBQUNuRSxhQUFTLE1BQU0sTUFBTSxZQUFZLEtBQUs7QUFDdEMsV0FBTyxZQUFZLFFBQVEsSUFBSTtBQUUvQixXQUFPLEdBQUcsTUFBTSxXQUFXO0FBQUEsRUFDNUIsQ0FBQztBQUVELE9BQUssZ0RBQWdELFlBQVk7QUFDaEUsVUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLFdBQVc7QUFDaEMsVUFBTSxRQUFRLEtBQUs7QUFDbkIsV0FBTyxZQUFZLE1BQU0sU0FBUyxJQUFJO0FBRXRDLFVBQU0sYUFBYSxLQUFLLFNBQVMsT0FBTyxlQUFlLEtBQUs7QUFFNUQsVUFBTSxRQUFRLDBCQUEwQixJQUFJLEtBQUssU0FBUyxHQUFHLG9CQUFvQjtBQUNqRixVQUFNLGdCQUFnQiwwQkFBMEIsSUFBSSxLQUFLLGtCQUFrQixHQUFHLG9CQUFvQjtBQUVsRyxVQUFNLE1BQU0sWUFBWSxDQUFDLEVBQUUsUUFBUSxPQUFPLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRSxHQUFHLEVBQUUsUUFBUSxjQUFjLENBQUMsQ0FBQztBQUNqRyxVQUFNLFdBQVcsWUFBWSxDQUFDLEVBQUUsUUFBUSxPQUFPLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRSxHQUFHLEVBQUUsUUFBUSxjQUFjLENBQUMsQ0FBQztBQUV0RyxRQUFJLFNBQVMsTUFBTSxXQUFXLFlBQVksS0FBSztBQUMvQyxXQUFPLFlBQVksUUFBUSxJQUFJO0FBRS9CLFdBQU8sR0FBRyxDQUFDLE1BQU0sV0FBVztBQUU1QixhQUFTLE1BQU0sTUFBTSxZQUFZLEtBQUs7QUFDdEMsV0FBTyxZQUFZLFFBQVEsSUFBSTtBQUUvQixXQUFPLEdBQUcsTUFBTSxXQUFXO0FBQUEsRUFDNUIsQ0FBQztBQUVELE9BQUssd0NBQXdDLFlBQVk7QUFDeEQsVUFBTSxDQUFDLE1BQU0sb0JBQW9CLElBQUksTUFBTSxXQUFXO0FBRXRELFVBQU0sV0FBVyxxQkFBcUIsZUFBZSxtQkFBbUI7QUFDeEUsYUFBUyxrQkFBa0IsaUJBQWlCLGNBQWMsU0FBUztBQUNuRSxRQUFJLGNBQWM7QUFFbEIsVUFBTSxRQUFRLEtBQUs7QUFFbkIsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUNuRixXQUFPLFFBQVE7QUFFZixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBRW5GLFVBQU0sTUFBTSxXQUFXLE1BQU07QUFDN0IsVUFBTSxNQUFNLFdBQVcsTUFBTTtBQUU3QixhQUFTLGtCQUFrQixpQkFBaUIsY0FBYyxNQUFNO0FBQ2hFLGtCQUFjLE1BQU0sTUFBTSxhQUFhLENBQUMsUUFBUSxNQUFNLENBQUM7QUFDdkQsV0FBTyxZQUFZLGFBQWEsS0FBSztBQUVyQyxXQUFPLEdBQUcsQ0FBQyxPQUFPLFdBQVc7QUFDN0IsV0FBTyxHQUFHLENBQUMsT0FBTyxXQUFXO0FBRTdCLGFBQVMsa0JBQWtCLGlCQUFpQixjQUFjLFNBQVM7QUFDbkUsa0JBQWMsTUFBTSxNQUFNLGFBQWEsQ0FBQyxRQUFRLE1BQU0sQ0FBQztBQUN2RCxXQUFPLFlBQVksYUFBYSxJQUFJO0FBRXBDLFdBQU8sR0FBRyxPQUFPLFdBQVc7QUFDNUIsV0FBTyxHQUFHLE9BQU8sV0FBVztBQUFBLEVBQzdCLENBQUM7QUFFRCxPQUFLLDZCQUE2QixZQUFZO0FBQzdDLFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXO0FBQ2hDLFVBQU0sUUFBUSxLQUFLO0FBQ25CLFdBQU8sWUFBWSxNQUFNLFNBQVMsSUFBSTtBQUV0QyxVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBQ25GLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUVuRixVQUFNLE1BQU0sWUFBWTtBQUFBLE1BQ3ZCLEVBQUUsUUFBUSxRQUFRLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRTtBQUFBLE1BQzVDLEVBQUUsUUFBUSxRQUFRLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRTtBQUFBLE1BQzVDLEVBQUUsUUFBUSxPQUFPO0FBQUEsSUFDbEIsQ0FBQztBQUVELFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUNqQyxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDcEQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3BELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUVwRCxVQUFNLE1BQU0sYUFBYSxFQUFFLFFBQVEsT0FBTyxDQUFDO0FBQzNDLFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUNqQyxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFBQSxFQUNyRCxDQUFDO0FBRUQsT0FBSyw0Q0FBNEMsWUFBWTtBQUM1RCxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFFBQVEsS0FBSztBQUNuQixXQUFPLFlBQVksTUFBTSxTQUFTLElBQUk7QUFFdEMsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUNuRixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBQ25GLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFFbkYsVUFBTSxNQUFNLFlBQVk7QUFBQSxNQUN2QixFQUFFLFFBQVEsUUFBUSxTQUFTLEVBQUUsUUFBUSxNQUFNLFFBQVEsS0FBSyxFQUFFO0FBQUEsTUFDMUQsRUFBRSxRQUFRLFFBQVEsU0FBUyxFQUFFLFFBQVEsS0FBSyxFQUFFO0FBQUEsTUFDNUMsRUFBRSxRQUFRLE9BQU87QUFBQSxJQUNsQixDQUFDO0FBRUQsV0FBTyxZQUFZLE1BQU0sT0FBTyxDQUFDO0FBQ2pDLFdBQU8sWUFBWSxNQUFNLGFBQWEsQ0FBQztBQUN2QyxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDcEQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3BELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUVwRCxVQUFNLE1BQU0sYUFBYSxFQUFFLFFBQVEsUUFBUSxlQUFlLEtBQUssQ0FBQztBQUVoRSxXQUFPLFlBQVksTUFBTSxPQUFPLENBQUM7QUFDakMsV0FBTyxZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQ3ZDLFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUNwRCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFFcEQsVUFBTSxNQUFNLGFBQWEsRUFBRSxRQUFRLE9BQU8sQ0FBQztBQUUzQyxXQUFPLFlBQVksTUFBTSxPQUFPLENBQUM7QUFDakMsV0FBTyxZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQ3ZDLFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUFBLEVBQ3JELENBQUM7QUFFRCxPQUFLLDZCQUE2QixZQUFZO0FBQzdDLFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXO0FBQ2hDLFVBQU0sUUFBUSxLQUFLO0FBQ25CLFdBQU8sWUFBWSxNQUFNLFNBQVMsSUFBSTtBQUV0QyxVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBQ25GLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUVuRixVQUFNLE1BQU0sWUFBWTtBQUFBLE1BQ3ZCLEVBQUUsUUFBUSxRQUFRLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRTtBQUFBLE1BQzVDLEVBQUUsUUFBUSxRQUFRLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRTtBQUFBLE1BQzVDLEVBQUUsUUFBUSxPQUFPO0FBQUEsSUFDbEIsQ0FBQztBQUVELFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUNqQyxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDcEQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3BELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUVwRCxVQUFNLE1BQU0sYUFBYSxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQzVDLFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUFBLEVBQ2xDLENBQUM7QUFFRCxPQUFLLDRDQUE0QyxZQUFZO0FBQzVELFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXO0FBQ2hDLFVBQU0sUUFBUSxLQUFLO0FBQ25CLFdBQU8sWUFBWSxNQUFNLFNBQVMsSUFBSTtBQUV0QyxVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBQ25GLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUVuRixVQUFNLE1BQU0sWUFBWTtBQUFBLE1BQ3ZCLEVBQUUsUUFBUSxRQUFRLFNBQVMsRUFBRSxRQUFRLE1BQU0sUUFBUSxLQUFLLEVBQUU7QUFBQSxNQUMxRCxFQUFFLFFBQVEsUUFBUSxTQUFTLEVBQUUsUUFBUSxLQUFLLEVBQUU7QUFBQSxNQUM1QyxFQUFFLFFBQVEsT0FBTztBQUFBLElBQ2xCLENBQUM7QUFFRCxXQUFPLFlBQVksTUFBTSxPQUFPLENBQUM7QUFDakMsV0FBTyxZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQ3ZDLFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUNwRCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDcEQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBRXBELFVBQU0sTUFBTSxhQUFhLEVBQUUsV0FBVyxNQUFNLGVBQWUsS0FBSyxDQUFDO0FBRWpFLFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUNqQyxXQUFPLFlBQVksTUFBTSxhQUFhLENBQUM7QUFDdkMsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBRXBELFVBQU0sTUFBTSxhQUFhLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFDNUMsV0FBTyxZQUFZLE1BQU0sT0FBTyxDQUFDO0FBQUEsRUFDbEMsQ0FBQztBQUVELE9BQUssbUNBQW1DLFlBQVk7QUFDbkQsVUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLFdBQVc7QUFDaEMsVUFBTSxRQUFRLEtBQUs7QUFDbkIsV0FBTyxZQUFZLE1BQU0sU0FBUyxJQUFJO0FBRXRDLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUNuRixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBRW5GLFVBQU0sTUFBTSxZQUFZO0FBQUEsTUFDdkIsRUFBRSxRQUFRLFFBQVEsU0FBUyxFQUFFLFFBQVEsS0FBSyxFQUFFO0FBQUEsTUFDNUMsRUFBRSxRQUFRLFFBQVEsU0FBUyxFQUFFLFFBQVEsS0FBSyxFQUFFO0FBQUEsTUFDNUMsRUFBRSxRQUFRLE9BQU87QUFBQSxJQUNsQixDQUFDO0FBRUQsV0FBTyxZQUFZLE1BQU0sT0FBTyxDQUFDO0FBQ2pDLFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUNwRCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDcEQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBRXBELFVBQU0sTUFBTSxhQUFhLEVBQUUsV0FBVyxlQUFlLE9BQU8sUUFBUSxPQUFPLENBQUM7QUFDNUUsV0FBTyxZQUFZLE1BQU0sT0FBTyxDQUFDO0FBQ2pDLFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUNwRCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFBQSxFQUNyRCxDQUFDO0FBRUQsT0FBSyxrREFBa0QsWUFBWTtBQUNsRSxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFFBQVEsS0FBSztBQUNuQixXQUFPLFlBQVksTUFBTSxTQUFTLElBQUk7QUFFdEMsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUNuRixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBQ25GLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFFbkYsVUFBTSxNQUFNLFlBQVk7QUFBQSxNQUN2QixFQUFFLFFBQVEsUUFBUSxTQUFTLEVBQUUsUUFBUSxNQUFNLFFBQVEsS0FBSyxFQUFFO0FBQUEsTUFDMUQsRUFBRSxRQUFRLFFBQVEsU0FBUyxFQUFFLFFBQVEsS0FBSyxFQUFFO0FBQUEsTUFDNUMsRUFBRSxRQUFRLE9BQU87QUFBQSxJQUNsQixDQUFDO0FBRUQsV0FBTyxZQUFZLE1BQU0sT0FBTyxDQUFDO0FBQ2pDLFdBQU8sWUFBWSxNQUFNLGFBQWEsQ0FBQztBQUN2QyxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDcEQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3BELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUVwRCxVQUFNLE1BQU0sYUFBYSxFQUFFLFdBQVcsZUFBZSxPQUFPLFFBQVEsUUFBUSxlQUFlLEtBQUssQ0FBQztBQUNqRyxXQUFPLFlBQVksTUFBTSxPQUFPLENBQUM7QUFDakMsV0FBTyxZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQ3ZDLFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUNwRCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFFcEQsVUFBTSxNQUFNLGFBQWEsRUFBRSxXQUFXLGVBQWUsT0FBTyxRQUFRLE9BQU8sQ0FBQztBQUM1RSxXQUFPLFlBQVksTUFBTSxPQUFPLENBQUM7QUFDakMsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3BELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUFBLEVBQ3JELENBQUM7QUFFRCxPQUFLLGtDQUFrQyxZQUFZO0FBQ2xELFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXO0FBQ2hDLFVBQU0sUUFBUSxLQUFLO0FBQ25CLFdBQU8sWUFBWSxNQUFNLFNBQVMsSUFBSTtBQUV0QyxVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBQ25GLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUVuRixVQUFNLE1BQU0sWUFBWTtBQUFBLE1BQ3ZCLEVBQUUsUUFBUSxRQUFRLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRTtBQUFBLE1BQzVDLEVBQUUsUUFBUSxRQUFRLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRTtBQUFBLE1BQzVDLEVBQUUsUUFBUSxPQUFPO0FBQUEsSUFDbEIsQ0FBQztBQUVELFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUNqQyxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDcEQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3BELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUVwRCxVQUFNLE1BQU0sYUFBYSxFQUFFLFdBQVcsZUFBZSxNQUFNLFFBQVEsT0FBTyxDQUFDO0FBQzNFLFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUNqQyxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDcEQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQUEsRUFDckQsQ0FBQztBQUVELE9BQUssaURBQWlELFlBQVk7QUFDakUsVUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLFdBQVc7QUFDaEMsVUFBTSxRQUFRLEtBQUs7QUFDbkIsV0FBTyxZQUFZLE1BQU0sU0FBUyxJQUFJO0FBRXRDLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUNuRixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBRW5GLFVBQU0sTUFBTSxZQUFZO0FBQUEsTUFDdkIsRUFBRSxRQUFRLFFBQVEsU0FBUyxFQUFFLFFBQVEsTUFBTSxRQUFRLEtBQUssRUFBRTtBQUFBLE1BQzFELEVBQUUsUUFBUSxRQUFRLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRTtBQUFBLE1BQzVDLEVBQUUsUUFBUSxPQUFPO0FBQUEsSUFDbEIsQ0FBQztBQUVELFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUNqQyxXQUFPLFlBQVksTUFBTSxhQUFhLENBQUM7QUFDdkMsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3BELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUNwRCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFFcEQsVUFBTSxNQUFNLGFBQWEsRUFBRSxXQUFXLGVBQWUsTUFBTSxRQUFRLFFBQVEsZUFBZSxLQUFLLENBQUM7QUFDaEcsV0FBTyxZQUFZLE1BQU0sT0FBTyxDQUFDO0FBQ2pDLFdBQU8sWUFBWSxNQUFNLGFBQWEsQ0FBQztBQUN2QyxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDcEQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3BELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUVwRCxVQUFNLE1BQU0sYUFBYSxFQUFFLFdBQVcsZUFBZSxNQUFNLFFBQVEsT0FBTyxDQUFDO0FBQzNFLFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUNqQyxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDcEQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQUEsRUFDckQsQ0FBQztBQUVELE9BQUssbUJBQW1CLFlBQVk7QUFDbkMsVUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLFdBQVc7QUFDaEMsVUFBTSxRQUFRLEtBQUs7QUFDbkIsV0FBTyxZQUFZLE1BQU0sU0FBUyxJQUFJO0FBRXRDLFVBQU0sUUFBUSwwQkFBMEIsSUFBSSxLQUFLLFNBQVMsR0FBRyxvQkFBb0I7QUFDakYsVUFBTSxnQkFBZ0IsMEJBQTBCLElBQUksS0FBSyxrQkFBa0IsR0FBRyxvQkFBb0I7QUFFbEcsVUFBTSxNQUFNLFlBQVk7QUFBQSxNQUN2QixFQUFFLFFBQVEsT0FBTyxTQUFTLEVBQUUsUUFBUSxLQUFLLEVBQUU7QUFBQSxNQUMzQyxFQUFFLFFBQVEsY0FBYztBQUFBLElBQ3pCLENBQUM7QUFFRCxXQUFPLFlBQVksTUFBTSxPQUFPLENBQUM7QUFDakMsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxLQUFLO0FBQ25ELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsYUFBYTtBQUUzRCxVQUFNLE1BQU0sZ0JBQWdCO0FBQzVCLFdBQU8sWUFBWSxNQUFNLFNBQVMsSUFBSTtBQUFBLEVBQ3ZDLENBQUM7QUFFRCxPQUFLLDJDQUEyQyxZQUFZO0FBQzNELFVBQU0sQ0FBQyxNQUFNLG9CQUFvQixJQUFJLE1BQU0sV0FBVztBQUN0RCxRQUFJLGNBQWM7QUFFbEIsVUFBTSxXQUFXLHFCQUFxQixlQUFlLG1CQUFtQjtBQUN4RSxhQUFTLGtCQUFrQixpQkFBaUIsY0FBYyxTQUFTO0FBRW5FLFVBQU0sUUFBUSxLQUFLO0FBRW5CLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsV0FBTyxRQUFRO0FBRWYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUVuRixVQUFNLE1BQU0sV0FBVyxNQUFNO0FBQzdCLFVBQU0sTUFBTSxXQUFXLE1BQU07QUFFN0IsYUFBUyxrQkFBa0IsaUJBQWlCLGNBQWMsTUFBTTtBQUNoRSxrQkFBYyxNQUFNLE1BQU0sZ0JBQWdCO0FBRTFDLFdBQU8sWUFBWSxhQUFhLEtBQUs7QUFDckMsV0FBTyxHQUFHLENBQUMsT0FBTyxXQUFXO0FBQzdCLFdBQU8sR0FBRyxDQUFDLE9BQU8sV0FBVztBQUU3QixhQUFTLGtCQUFrQixpQkFBaUIsY0FBYyxTQUFTO0FBQ25FLGtCQUFjLE1BQU0sTUFBTSxnQkFBZ0I7QUFFMUMsV0FBTyxZQUFZLGFBQWEsSUFBSTtBQUNwQyxXQUFPLEdBQUcsT0FBTyxXQUFXO0FBQzVCLFdBQU8sR0FBRyxPQUFPLFdBQVc7QUFBQSxFQUM3QixDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsWUFBWTtBQUNuRCxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFFBQVEsS0FBSztBQUNuQixXQUFPLFlBQVksTUFBTSxTQUFTLElBQUk7QUFFdEMsVUFBTSxRQUFRLDBCQUEwQixJQUFJLEtBQUssU0FBUyxHQUFHLG9CQUFvQjtBQUNqRixVQUFNLGdCQUFnQiwwQkFBMEIsSUFBSSxLQUFLLGtCQUFrQixHQUFHLG9CQUFvQjtBQUVsRyxVQUFNLE1BQU0sWUFBWTtBQUFBLE1BQ3ZCLEVBQUUsUUFBUSxPQUFPLFNBQVMsRUFBRSxRQUFRLE1BQU0sUUFBUSxLQUFLLEVBQUU7QUFBQSxNQUN6RCxFQUFFLFFBQVEsY0FBYztBQUFBLElBQ3pCLENBQUM7QUFFRCxXQUFPLFlBQVksTUFBTSxPQUFPLENBQUM7QUFDakMsV0FBTyxZQUFZLE1BQU0sYUFBYSxDQUFDO0FBRXZDLFVBQU0sTUFBTSxnQkFBZ0IsRUFBRSxlQUFlLEtBQUssQ0FBQztBQUVuRCxXQUFPLFlBQVksTUFBTSxPQUFPLENBQUM7QUFDakMsV0FBTyxZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQ3ZDLFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsS0FBSztBQUVuRCxVQUFNLE1BQU0sZ0JBQWdCO0FBRTVCLFdBQU8sWUFBWSxNQUFNLFNBQVMsSUFBSTtBQUFBLEVBQ3ZDLENBQUM7QUFFRCxPQUFLLDJCQUEyQixZQUFZO0FBQzNDLFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXO0FBQ2hDLFVBQU0sUUFBUSxLQUFLO0FBQ25CLFdBQU8sWUFBWSxNQUFNLFNBQVMsSUFBSTtBQUV0QyxVQUFNLFFBQVEsMEJBQTBCLElBQUksS0FBSyxTQUFTLEdBQUcsb0JBQW9CO0FBQ2pGLFVBQU0sZ0JBQWdCLDBCQUEwQixJQUFJLEtBQUssa0JBQWtCLEdBQUcsb0JBQW9CO0FBRWxHLFVBQU0sYUFBdUMsQ0FBQztBQUM5QyxVQUFNLGlDQUFpQyxNQUFNLGlCQUFpQixPQUFLO0FBQ2xFLFVBQUksRUFBRSxTQUFTLHFCQUFxQixhQUFhO0FBQ2hELGVBQU8sR0FBRyxFQUFFLE1BQU07QUFDbEIsbUJBQVcsS0FBSyxDQUFDO0FBQUEsTUFDbEI7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLE1BQU0sWUFBWSxDQUFDLEVBQUUsUUFBUSxPQUFPLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRSxHQUFHLEVBQUUsUUFBUSxjQUFjLENBQUMsQ0FBQztBQUNqRyxXQUFPLFlBQVksTUFBTSxPQUFPLENBQUM7QUFDakMsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxLQUFLO0FBQ25ELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsYUFBYTtBQUMzRCxVQUFNLFdBQVcsZUFBZSxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUM7QUFDbkQsV0FBTyxZQUFZLFdBQVcsUUFBUSxDQUFDO0FBQ3ZDLFdBQU8sWUFBYSxXQUFXLENBQUMsRUFBNEIsYUFBYSxDQUFDO0FBQzFFLFdBQU8sWUFBYSxXQUFXLENBQUMsRUFBNEIsZ0JBQWdCLENBQUM7QUFDN0UsV0FBTyxZQUFZLFdBQVcsQ0FBQyxFQUFFLFFBQVEsYUFBYTtBQUN0RCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLGFBQWE7QUFDM0QsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxLQUFLO0FBRW5ELFVBQU0sTUFBTSxNQUFNLFlBQVksQ0FBQyxFQUFFLFFBQVEsZUFBZSxTQUFTLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEtBQUs7QUFDdkYsV0FBTyxZQUFZLEtBQUssSUFBSTtBQUM1QixXQUFPLFlBQVksV0FBVyxRQUFRLENBQUM7QUFDdkMsV0FBTyxZQUFhLFdBQVcsQ0FBQyxFQUE0QixhQUFhLENBQUM7QUFDMUUsV0FBTyxZQUFhLFdBQVcsQ0FBQyxFQUE0QixnQkFBZ0IsQ0FBQztBQUM3RSxXQUFPLFlBQVksV0FBVyxDQUFDLEVBQUUsUUFBUSxhQUFhO0FBQ3RELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsS0FBSztBQUNuRCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLGFBQWE7QUFFM0QsbUNBQStCLFFBQVE7QUFBQSxFQUN4QyxDQUFDO0FBRUQsT0FBSyw4QkFBOEIsWUFBWTtBQUM5QyxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFFBQVEsS0FBSztBQUNuQixXQUFPLFlBQVksTUFBTSxTQUFTLElBQUk7QUFFdEMsVUFBTSxhQUFhLEtBQUssU0FBUyxPQUFPLGVBQWUsS0FBSztBQUU1RCxVQUFNLFFBQVEsMEJBQTBCLElBQUksS0FBSyxTQUFTLEdBQUcsb0JBQW9CO0FBQ2pGLFVBQU0sZ0JBQWdCLDBCQUEwQixJQUFJLEtBQUssa0JBQWtCLEdBQUcsb0JBQW9CO0FBRWxHLFVBQU0sTUFBTSxZQUFZLENBQUMsRUFBRSxRQUFRLE9BQU8sU0FBUyxFQUFFLFFBQVEsS0FBSyxFQUFFLEdBQUcsRUFBRSxRQUFRLGNBQWMsQ0FBQyxDQUFDO0FBQ2pHLFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUNqQyxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLEtBQUs7QUFDbkQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxhQUFhO0FBQzNELFVBQU0sV0FBVyxlQUFlLFlBQVksRUFBRSxPQUFPLEVBQUUsQ0FBQztBQUN4RCxXQUFPLFlBQVksTUFBTSxPQUFPLENBQUM7QUFDakMsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxLQUFLO0FBQ25ELFdBQU8sWUFBWSxXQUFXLE9BQU8sQ0FBQztBQUN0QyxXQUFPLFlBQVksV0FBVyxpQkFBaUIsQ0FBQyxHQUFHLGFBQWE7QUFBQSxFQUNqRSxDQUFDO0FBRUQsT0FBSywrQkFBK0IsWUFBWTtBQUMvQyxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFFBQVEsS0FBSztBQUNuQixXQUFPLFlBQVksTUFBTSxTQUFTLElBQUk7QUFFdEMsVUFBTSxhQUFhLEtBQUssU0FBUyxPQUFPLGVBQWUsS0FBSztBQUU1RCxVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBQ25GLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUVuRixVQUFNLE1BQU0sWUFBWSxDQUFDLEVBQUUsUUFBUSxRQUFRLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRSxHQUFHLEVBQUUsUUFBUSxRQUFRLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRSxHQUFHLEVBQUUsUUFBUSxRQUFRLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRSxDQUFDLENBQUM7QUFDckssV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3BELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUNwRCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDcEQsVUFBTSxZQUFZLENBQUMsRUFBRSxRQUFRLE9BQU8sR0FBRyxFQUFFLFFBQVEsT0FBTyxDQUFDLEdBQUcsVUFBVTtBQUN0RSxXQUFPLFlBQVksTUFBTSxPQUFPLENBQUM7QUFDakMsV0FBTyxZQUFZLFdBQVcsT0FBTyxDQUFDO0FBQ3RDLFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUNwRCxXQUFPLFlBQVksV0FBVyxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDekQsV0FBTyxZQUFZLFdBQVcsaUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQUEsRUFDMUQsQ0FBQztBQUVELE9BQUssOEJBQThCLFlBQVk7QUFDOUMsVUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLFdBQVc7QUFDaEMsVUFBTSxRQUFRLEtBQUs7QUFDbkIsV0FBTyxZQUFZLE1BQU0sU0FBUyxJQUFJO0FBRXRDLFVBQU0sYUFBYSxLQUFLLFNBQVMsT0FBTyxlQUFlLEtBQUs7QUFFNUQsVUFBTSxRQUFRLDBCQUEwQixJQUFJLEtBQUssU0FBUyxHQUFHLG9CQUFvQjtBQUNqRixVQUFNLGdCQUFnQiwwQkFBMEIsSUFBSSxLQUFLLGtCQUFrQixHQUFHLG9CQUFvQjtBQUVsRyxVQUFNLE1BQU0sWUFBWSxDQUFDLEVBQUUsUUFBUSxPQUFPLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRSxHQUFHLEVBQUUsUUFBUSxjQUFjLENBQUMsQ0FBQztBQUNqRyxXQUFPLFlBQVksTUFBTSxPQUFPLENBQUM7QUFDakMsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxLQUFLO0FBQ25ELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsYUFBYTtBQUMzRCxVQUFNLFdBQVcsZUFBZSxZQUFZLEVBQUUsT0FBTyxFQUFFLENBQUM7QUFDeEQsV0FBTyxZQUFZLE1BQU0sT0FBTyxDQUFDO0FBQ2pDLFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsS0FBSztBQUNuRCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLGFBQWE7QUFDM0QsV0FBTyxZQUFZLFdBQVcsT0FBTyxDQUFDO0FBQ3RDLFdBQU8sWUFBWSxXQUFXLGlCQUFpQixDQUFDLEdBQUcsYUFBYTtBQUFBLEVBQ2pFLENBQUM7QUFFRCxPQUFLLCtCQUErQixZQUFZO0FBQy9DLFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXO0FBQ2hDLFVBQU0sUUFBUSxLQUFLO0FBQ25CLFdBQU8sWUFBWSxNQUFNLFNBQVMsSUFBSTtBQUV0QyxVQUFNLGFBQWEsS0FBSyxTQUFTLE9BQU8sZUFBZSxLQUFLO0FBRTVELFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUNuRixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBRW5GLFVBQU0sTUFBTSxZQUFZLENBQUMsRUFBRSxRQUFRLFFBQVEsU0FBUyxFQUFFLFFBQVEsS0FBSyxFQUFFLEdBQUcsRUFBRSxRQUFRLFFBQVEsU0FBUyxFQUFFLFFBQVEsS0FBSyxFQUFFLEdBQUcsRUFBRSxRQUFRLFFBQVEsU0FBUyxFQUFFLFFBQVEsS0FBSyxFQUFFLENBQUMsQ0FBQztBQUNySyxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDcEQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3BELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUNwRCxVQUFNLFlBQVksQ0FBQyxFQUFFLFFBQVEsT0FBTyxHQUFHLEVBQUUsUUFBUSxPQUFPLEdBQUcsRUFBRSxRQUFRLE9BQU8sQ0FBQyxHQUFHLFVBQVU7QUFDMUYsS0FBQyxPQUFPLFVBQVUsRUFBRSxRQUFRLENBQUFDLFdBQVM7QUFDcEMsYUFBTyxZQUFZQSxPQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUNwRCxhQUFPLFlBQVlBLE9BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3BELGFBQU8sWUFBWUEsT0FBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFBQSxJQUNyRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxrQkFBa0IsWUFBWTtBQUNsQyxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFFBQVEsS0FBSztBQUNuQixXQUFPLFlBQVksTUFBTSxTQUFTLElBQUk7QUFFdEMsVUFBTSxRQUFRLDBCQUEwQixJQUFJLEtBQUssU0FBUyxHQUFHLG9CQUFvQjtBQUNqRixVQUFNLGdCQUFnQiwwQkFBMEIsSUFBSSxLQUFLLGtCQUFrQixHQUFHLG9CQUFvQjtBQUVsRyxVQUFNLE1BQU0sV0FBVyxLQUFLO0FBQzVCLFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUNqQyxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLEtBQUs7QUFFbkQsVUFBTSxNQUFNLGVBQWUsQ0FBQyxFQUFFLFFBQVEsT0FBTyxhQUFhLGNBQWMsQ0FBQyxDQUFDO0FBQzFFLFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUNqQyxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLGFBQWE7QUFBQSxFQUM1RCxDQUFDO0FBRUQsT0FBSywwQ0FBMEMsWUFBWTtBQUMxRCxVQUFNLENBQUMsTUFBTSxvQkFBb0IsSUFBSSxNQUFNLFdBQVc7QUFFdEQsVUFBTSxXQUFXLHFCQUFxQixlQUFlLG1CQUFtQjtBQUN4RSxhQUFTLGtCQUFrQixpQkFBaUIsY0FBYyxTQUFTO0FBRW5FLFVBQU0sUUFBUSxLQUFLO0FBRW5CLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsV0FBTyxRQUFRO0FBRWYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUVuRixVQUFNLE1BQU0sV0FBVyxNQUFNO0FBQzdCLFdBQU8sWUFBWSxNQUFNLGNBQWMsTUFBTTtBQUU3QyxhQUFTLGtCQUFrQixpQkFBaUIsY0FBYyxNQUFNO0FBQ2hFLFVBQU0sTUFBTSxlQUFlLENBQUMsRUFBRSxRQUFRLFFBQVEsYUFBYSxPQUFPLENBQUMsQ0FBQztBQUVwRSxXQUFPLFlBQVksTUFBTSxjQUFjLE1BQU07QUFDN0MsV0FBTyxHQUFHLENBQUMsT0FBTyxXQUFXO0FBRTdCLGFBQVMsa0JBQWtCLGlCQUFpQixjQUFjLFNBQVM7QUFDbkUsVUFBTSxNQUFNLGVBQWUsQ0FBQyxFQUFFLFFBQVEsUUFBUSxhQUFhLE9BQU8sQ0FBQyxDQUFDO0FBRXBFLFdBQU8sWUFBWSxNQUFNLGNBQWMsTUFBTTtBQUM3QyxXQUFPLEdBQUcsT0FBTyxXQUFXO0FBQUEsRUFDN0IsQ0FBQztBQUVELE9BQUssMkNBQTJDLFlBQVk7QUFDM0QsVUFBTSxDQUFDLE1BQU0sb0JBQW9CLElBQUksTUFBTSxXQUFXO0FBRXRELFVBQU0sV0FBVyxxQkFBcUIsZUFBZSxtQkFBbUI7QUFDeEUsYUFBUyxrQkFBa0IsaUJBQWlCLGNBQWMsU0FBUztBQUVuRSxVQUFNLFFBQVEsS0FBSztBQUVuQixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBQ25GLFdBQU8sUUFBUTtBQUVmLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFFbkYsVUFBTSxNQUFNLFdBQVcsTUFBTTtBQUM3QixXQUFPLFlBQVksTUFBTSxjQUFjLE1BQU07QUFDN0MsYUFBUyxrQkFBa0IsaUJBQWlCLGNBQWMsTUFBTTtBQUNoRSxVQUFNLE1BQU0sZUFBZSxDQUFDLEVBQUUsUUFBUSxRQUFRLGFBQWEsUUFBUSxtQkFBbUIsTUFBTSxDQUFDLENBQUM7QUFFOUYsV0FBTyxZQUFZLE1BQU0sY0FBYyxNQUFNO0FBQzdDLFdBQU8sR0FBRyxDQUFDLE9BQU8sV0FBVztBQUU3QixVQUFNLE1BQU0sZUFBZSxDQUFDLEVBQUUsUUFBUSxRQUFRLGFBQWEsUUFBUSxtQkFBbUIsS0FBSyxDQUFDLENBQUM7QUFFN0YsV0FBTyxZQUFZLE1BQU0sY0FBYyxNQUFNO0FBQzdDLFdBQU8sR0FBRyxPQUFPLFdBQVc7QUFBQSxFQUM3QixDQUFDO0FBRUQsT0FBSywwQ0FBMEMsWUFBWTtBQUMxRCxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFFBQVEsS0FBSztBQUNuQixXQUFPLFlBQVksTUFBTSxTQUFTLElBQUk7QUFFdEMsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUNuRixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBQ25GLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUNuRixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBRW5GLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUNuRixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBRW5GLFVBQU0sTUFBTSxXQUFXLFFBQVEsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUMvQyxVQUFNLE1BQU0sV0FBVyxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDL0MsVUFBTSxNQUFNLFdBQVcsUUFBUSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQy9DLFVBQU0sTUFBTSxXQUFXLFFBQVEsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUMvQyxVQUFNLE1BQU0sV0FBVyxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFFL0MsVUFBTSxNQUFNLGVBQWU7QUFBQSxNQUMxQixFQUFFLFFBQVEsUUFBUSxhQUFhLE9BQU87QUFBQSxNQUN0QyxFQUFFLFFBQVEsUUFBUSxhQUFhLE9BQU87QUFBQSxNQUN0QyxFQUFFLFFBQVEsUUFBUSxhQUFhLE9BQU87QUFBQSxJQUN2QyxDQUFDO0FBRUQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3BELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUNwRCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDcEQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxNQUFNO0FBQ3BELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsTUFBTTtBQUFBLEVBQ3JELENBQUM7QUFFRCxPQUFLLGdIQUFnSCxZQUFZO0FBQ2hJLFVBQU0sQ0FBQyxNQUFNLG9CQUFvQixJQUFJLE1BQU0sV0FBVztBQUN0RCxVQUFNLFFBQVEsS0FBSztBQUNuQixXQUFPLFlBQVksTUFBTSxTQUFTLElBQUk7QUFFdEMsVUFBTSxRQUFRLDBCQUEwQixJQUFJLEtBQUssU0FBUyxHQUFHLG9CQUFvQjtBQUNqRixVQUFNLGtCQUFrQixxQkFBcUIsZUFBZSx1QkFBdUIsUUFBVyxRQUFXLE9BQU8sS0FBSztBQUVySCxVQUFNLE1BQU0sV0FBVyxLQUFLO0FBQzVCLFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUNqQyxXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLEtBQUs7QUFFbkQsVUFBTSxNQUFNLGVBQWUsQ0FBQyxFQUFFLFFBQVEsT0FBTyxhQUFhLGdCQUFnQixDQUFDLENBQUM7QUFDNUUsV0FBTyxZQUFZLE1BQU0sT0FBTyxDQUFDO0FBQ2pDLFdBQU8sWUFBWSxNQUFNLGlCQUFpQixDQUFDLEdBQUcsZUFBZTtBQUU3RCxVQUFNLE1BQU0sZUFBZSxDQUFDLEVBQUUsUUFBUSxpQkFBaUIsYUFBYSxNQUFNLENBQUMsQ0FBQztBQUM1RSxXQUFPLFlBQVksTUFBTSxPQUFPLENBQUM7QUFDakMsV0FBTyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxLQUFLO0FBQUEsRUFDcEQsQ0FBQztBQUVELE9BQUssZ0JBQWdCLFlBQVk7QUFDaEMsVUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLFdBQVc7QUFDaEMsVUFBTSxRQUFRLEtBQUs7QUFDbkIsVUFBTSxTQUFTLEtBQUssU0FBUyxPQUFPLGVBQWUsS0FBSztBQUN4RCxXQUFPLFlBQVksTUFBTSxTQUFTLElBQUk7QUFFdEMsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUNuRixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsR0FBRyxvQkFBb0IsSUFBSTtBQUMxRixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBQ25GLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLEdBQUcsb0JBQW9CLElBQUk7QUFFMUYsVUFBTSxNQUFNLFdBQVcsUUFBUSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQy9DLFVBQU0sTUFBTSxXQUFXLFFBQVEsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUMvQyxVQUFNLE1BQU0sV0FBVyxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDL0MsVUFBTSxNQUFNLFdBQVcsUUFBUSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQy9DLFVBQU0sT0FBTyxXQUFXLFFBQVEsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUVoRCxRQUFJLGVBQWUsTUFBTSxZQUFZLElBQUksS0FBSyxVQUFVLENBQUM7QUFDekQsV0FBTyxZQUFZLGFBQWEsUUFBUSxDQUFDO0FBQ3pDLG1CQUFlLE9BQU8sWUFBWSxJQUFJLEtBQUssVUFBVSxDQUFDO0FBQ3RELFdBQU8sWUFBWSxhQUFhLFFBQVEsQ0FBQztBQUFBLEVBQzFDLENBQUM7QUFFRCxPQUFLLHVDQUF1QyxZQUFZO0FBQ3ZELFVBQU0sQ0FBQyxNQUFNLG9CQUFvQixJQUFJLE1BQU0sV0FBVztBQUV0RCxVQUFNLFdBQVcscUJBQXFCLGVBQWUsbUJBQW1CO0FBRXhFLFVBQU0sUUFBUSxLQUFLO0FBQ25CLFdBQU8sWUFBWSxNQUFNLFNBQVMsSUFBSTtBQUV0QyxVQUFNLGlCQUFpQiwwQkFBMEIsSUFBSSxLQUFLLG1CQUFtQixHQUFHLG9CQUFvQjtBQUNwRyxVQUFNLGVBQWUsMEJBQTBCLElBQUksS0FBSyxpQkFBaUIsR0FBRyxHQUFHLG9CQUFvQixJQUFJO0FBRXZHLFVBQU0sbUJBQW1CLElBQUksc0JBQXNCLFFBQVcsUUFBVyxnQkFBZ0IsY0FBYyxTQUFTLGFBQWE7QUFDN0gsVUFBTSxNQUFNLFdBQVcsa0JBQWtCLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFFekQsUUFBSSxlQUFlLE1BQU0sWUFBWSxJQUFJLEtBQUssbUJBQW1CLENBQUM7QUFDbEUsV0FBTyxZQUFZLGFBQWEsUUFBUSxDQUFDO0FBRXpDLG1CQUFlLE1BQU0sWUFBWSxJQUFJLEtBQUssbUJBQW1CLEdBQUcsRUFBRSxtQkFBbUIsaUJBQWlCLFFBQVEsQ0FBQztBQUMvRyxXQUFPLFlBQVksYUFBYSxRQUFRLENBQUM7QUFFekMsbUJBQWUsTUFBTSxZQUFZLElBQUksS0FBSyxpQkFBaUIsR0FBRyxFQUFFLG1CQUFtQixpQkFBaUIsUUFBUSxDQUFDO0FBQzdHLFdBQU8sWUFBWSxhQUFhLFFBQVEsQ0FBQztBQUV6QyxtQkFBZSxNQUFNLFlBQVksSUFBSSxLQUFLLG1CQUFtQixHQUFHLEVBQUUsbUJBQW1CLGlCQUFpQixVQUFVLENBQUM7QUFDakgsV0FBTyxZQUFZLGFBQWEsUUFBUSxDQUFDO0FBRXpDLG1CQUFlLE1BQU0sWUFBWSxJQUFJLEtBQUssaUJBQWlCLEdBQUcsRUFBRSxtQkFBbUIsaUJBQWlCLFVBQVUsQ0FBQztBQUMvRyxXQUFPLFlBQVksYUFBYSxRQUFRLENBQUM7QUFFekMsbUJBQWUsTUFBTSxZQUFZLElBQUksS0FBSyxtQkFBbUIsR0FBRyxFQUFFLG1CQUFtQixpQkFBaUIsSUFBSSxDQUFDO0FBQzNHLFdBQU8sWUFBWSxhQUFhLFFBQVEsQ0FBQztBQUV6QyxtQkFBZSxNQUFNLFlBQVksSUFBSSxLQUFLLGlCQUFpQixHQUFHLEVBQUUsbUJBQW1CLGlCQUFpQixJQUFJLENBQUM7QUFDekcsV0FBTyxZQUFZLGFBQWEsUUFBUSxDQUFDO0FBQUEsRUFDMUMsQ0FBQztBQUVELE9BQUsscUNBQXFDLGlCQUFrQjtBQUMzRCxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFlBQVksS0FBSztBQUN2QixVQUFNLGFBQWEsS0FBSyxTQUFTLFdBQVcsZUFBZSxLQUFLO0FBRWhFLFdBQU8sWUFBWSxZQUFZLEtBQUssVUFBVSxFQUFFLFdBQVcsZUFBZSxNQUFNLEdBQUcsU0FBUyxDQUFDO0FBQzdGLFdBQU8sWUFBWSxXQUFXLEtBQUssVUFBVSxFQUFFLFdBQVcsZUFBZSxLQUFLLEdBQUcsVUFBVSxDQUFDO0FBQUEsRUFDN0YsQ0FBQztBQUVELE9BQUssa0NBQWtDLGlCQUFrQjtBQUN4RCxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFlBQVksS0FBSztBQUN2QixVQUFNLFlBQVksS0FBSyxTQUFTLFdBQVcsZUFBZSxJQUFJO0FBRTlELFdBQU8sWUFBWSxXQUFXLEtBQUssVUFBVSxFQUFFLFdBQVcsZUFBZSxLQUFLLEdBQUcsU0FBUyxDQUFDO0FBQzNGLFdBQU8sWUFBWSxXQUFXLEtBQUssVUFBVSxFQUFFLFdBQVcsZUFBZSxHQUFHLEdBQUcsU0FBUyxDQUFDO0FBQUEsRUFDMUYsQ0FBQztBQUVELE9BQUssdUNBQXVDLGlCQUFrQjtBQUM3RCxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFlBQVksS0FBSztBQUN2QixVQUFNLGFBQWEsS0FBSyxTQUFTLFdBQVcsZUFBZSxLQUFLO0FBQ2hFLFVBQU0sWUFBWSxLQUFLLFNBQVMsWUFBWSxlQUFlLElBQUk7QUFFL0QsV0FBTyxZQUFZLFdBQVcsS0FBSyxVQUFVLEVBQUUsVUFBVSxjQUFjLE1BQU0sQ0FBQyxDQUFDO0FBQy9FLFdBQU8sWUFBWSxXQUFXLEtBQUssVUFBVSxFQUFFLFVBQVUsY0FBYyxLQUFLLENBQUMsQ0FBQztBQUU5RSxXQUFPLFlBQVksWUFBWSxLQUFLLFVBQVUsRUFBRSxVQUFVLGNBQWMsS0FBSyxHQUFHLFNBQVMsQ0FBQztBQUMxRixXQUFPLFlBQVksV0FBVyxLQUFLLFVBQVUsRUFBRSxVQUFVLGNBQWMsU0FBUyxHQUFHLFVBQVUsQ0FBQztBQUU5RixXQUFPLFlBQVksV0FBVyxLQUFLLFVBQVUsRUFBRSxVQUFVLGNBQWMsS0FBSyxHQUFHLFVBQVUsQ0FBQztBQUMxRixXQUFPLFlBQVksWUFBWSxLQUFLLFVBQVUsRUFBRSxVQUFVLGNBQWMsU0FBUyxHQUFHLFNBQVMsQ0FBQztBQUFBLEVBQy9GLENBQUM7QUFFRCxPQUFLLHFCQUFxQixpQkFBa0I7QUFDM0MsVUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLFdBQVc7QUFFaEMsU0FBSyxZQUFZLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsYUFBYSxpQkFBaUIsV0FBVyxDQUFDO0FBRW5ILFdBQU8sWUFBWSxLQUFLLE9BQU8sUUFBUSxDQUFDO0FBQUEsRUFDekMsQ0FBQztBQUVELE9BQUssYUFBYSxpQkFBa0I7QUFDbkMsVUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLFdBQVc7QUFHaEMsU0FBSyxZQUFZLEVBQUUsUUFBUSxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsYUFBYSxpQkFBaUIsV0FBVyxDQUFDO0FBQ25ILFFBQUksU0FBUyxLQUFLLFVBQVU7QUFFNUIsV0FBTyxZQUFZLE9BQU8sYUFBYSxpQkFBaUIsVUFBVTtBQUNsRSxXQUFPLFlBQVksT0FBTyxPQUFPLFFBQVEsQ0FBQztBQUMxQyxXQUFPLFlBQVksT0FBTyxPQUFPLENBQUMsRUFBRSxPQUFRLFFBQVEsQ0FBQztBQUNyRCxXQUFPLFlBQVksT0FBTyxPQUFPLENBQUMsRUFBRSxPQUFRLFFBQVEsQ0FBQztBQUdyRCxTQUFLLFlBQVksRUFBRSxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxhQUFhLGlCQUFpQixTQUFTLENBQUM7QUFDakYsYUFBUyxLQUFLLFVBQVU7QUFFeEIsV0FBTyxZQUFZLE9BQU8sYUFBYSxpQkFBaUIsUUFBUTtBQUNoRSxXQUFPLFlBQVksT0FBTyxPQUFPLFFBQVEsQ0FBQztBQUMxQyxXQUFPLEdBQUcsT0FBTyxPQUFPLE9BQU8sQ0FBQyxFQUFFLFNBQVMsUUFBUTtBQUNuRCxXQUFPLEdBQUcsT0FBTyxPQUFPLE9BQU8sQ0FBQyxFQUFFLFNBQVMsUUFBUTtBQUNuRCxXQUFPLEdBQUcsT0FBTyxPQUFPLE9BQU8sQ0FBQyxFQUFFLFNBQVMsUUFBUTtBQUFBLEVBQ3BELENBQUM7QUFFRCxPQUFLLGtCQUFrQixpQkFBa0I7QUFDeEMsVUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLFdBQVc7QUFFaEMsU0FBSyxhQUFhLElBQUk7QUFFdEIsV0FBTyxZQUFZLEtBQUssaUJBQWlCLEdBQUcsSUFBSTtBQUFBLEVBQ2pELENBQUM7QUFFRCxPQUFLLGtCQUFrQixZQUFZO0FBQ2xDLFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXO0FBQ2hDLFVBQU0sUUFBUSxLQUFLO0FBRW5CLFdBQU8sWUFBWSxNQUFNLGFBQWEsQ0FBQztBQUN2QyxXQUFPLFlBQVksTUFBTSxXQUFXLGFBQWEsVUFBVSxFQUFFLFFBQVEsQ0FBQztBQUN0RSxXQUFPLFlBQVksTUFBTSxXQUFXLGFBQWEsb0JBQW9CLEVBQUUsUUFBUSxDQUFDO0FBQ2hGLFdBQU8sWUFBWSxNQUFNLFdBQVcsYUFBYSxZQUFZLEVBQUUsZUFBZSxLQUFLLENBQUMsRUFBRSxRQUFRLENBQUM7QUFDL0YsV0FBTyxZQUFZLE1BQU0sV0FBVyxhQUFhLHNCQUFzQixFQUFFLGVBQWUsS0FBSyxDQUFDLEVBQUUsUUFBUSxDQUFDO0FBRXpHLFVBQU0sUUFBUSwwQkFBMEIsSUFBSSxLQUFLLFNBQVMsR0FBRyxvQkFBb0I7QUFDakYsVUFBTSxnQkFBZ0IsMEJBQTBCLElBQUksS0FBSyxrQkFBa0IsR0FBRyxvQkFBb0I7QUFFbEcsVUFBTSxNQUFNLFdBQVcsT0FBTyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQzlDLFVBQU0sTUFBTSxXQUFXLGVBQWUsRUFBRSxVQUFVLEtBQUssQ0FBQztBQUV4RCxXQUFPLFlBQVksTUFBTSxhQUFhLENBQUM7QUFDdkMsV0FBTyxZQUFZLE1BQU0sU0FBUyxLQUFLLEdBQUcsS0FBSztBQUMvQyxXQUFPLFlBQVksTUFBTSxTQUFTLGFBQWEsR0FBRyxLQUFLO0FBRXZELFdBQU8sWUFBWSxNQUFNLFdBQVcsYUFBYSxVQUFVLEVBQUUsUUFBUSxDQUFDO0FBQ3RFLFdBQU8sWUFBWSxNQUFNLFdBQVcsYUFBYSxvQkFBb0IsRUFBRSxRQUFRLENBQUM7QUFDaEYsV0FBTyxZQUFZLE1BQU0sV0FBVyxhQUFhLFlBQVksRUFBRSxlQUFlLEtBQUssQ0FBQyxFQUFFLFFBQVEsQ0FBQztBQUMvRixXQUFPLFlBQVksTUFBTSxXQUFXLGFBQWEsc0JBQXNCLEVBQUUsZUFBZSxLQUFLLENBQUMsRUFBRSxRQUFRLENBQUM7QUFFekcsVUFBTSxZQUFZLEtBQUs7QUFFdkIsV0FBTyxZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQ3ZDLFdBQU8sWUFBWSxNQUFNLFNBQVMsS0FBSyxHQUFHLElBQUk7QUFDOUMsV0FBTyxZQUFZLE1BQU0sU0FBUyxhQUFhLEdBQUcsS0FBSztBQUV2RCxXQUFPLFlBQVksTUFBTSxXQUFXLGFBQWEsVUFBVSxFQUFFLFFBQVEsQ0FBQztBQUN0RSxXQUFPLFlBQVksTUFBTSxXQUFXLGFBQWEsb0JBQW9CLEVBQUUsUUFBUSxDQUFDO0FBQ2hGLFdBQU8sWUFBWSxNQUFNLFdBQVcsYUFBYSxZQUFZLEVBQUUsZUFBZSxLQUFLLENBQUMsRUFBRSxRQUFRLENBQUM7QUFDL0YsV0FBTyxZQUFZLE1BQU0sV0FBVyxhQUFhLHNCQUFzQixFQUFFLGVBQWUsS0FBSyxDQUFDLEVBQUUsUUFBUSxDQUFDO0FBRXpHLFVBQU0sY0FBYyxLQUFLO0FBRXpCLFdBQU8sWUFBWSxNQUFNLGFBQWEsQ0FBQztBQUN2QyxXQUFPLFlBQVksTUFBTSxTQUFTLEtBQUssR0FBRyxLQUFLO0FBQy9DLFdBQU8sWUFBWSxNQUFNLFNBQVMsYUFBYSxHQUFHLEtBQUs7QUFFdkQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLEtBQUssR0FBRyxDQUFDO0FBQ25ELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixhQUFhLEdBQUcsQ0FBQztBQUUzRCxXQUFPLFlBQVksTUFBTSxXQUFXLGFBQWEsVUFBVSxFQUFFLFFBQVEsQ0FBQztBQUN0RSxXQUFPLFlBQVksTUFBTSxXQUFXLGFBQWEsb0JBQW9CLEVBQUUsUUFBUSxDQUFDO0FBQ2hGLFdBQU8sWUFBWSxNQUFNLFdBQVcsYUFBYSxZQUFZLEVBQUUsZUFBZSxLQUFLLENBQUMsRUFBRSxRQUFRLENBQUM7QUFDL0YsV0FBTyxZQUFZLE1BQU0sV0FBVyxhQUFhLHNCQUFzQixFQUFFLGVBQWUsS0FBSyxDQUFDLEVBQUUsUUFBUSxDQUFDO0FBRXpHLFFBQUksb0JBQW9CO0FBQ3hCLFVBQU0saUNBQWlDLE1BQU0saUJBQWlCLE9BQUs7QUFDbEUsVUFBSSxFQUFFLFNBQVMscUJBQXFCLGFBQWE7QUFDaEQsZUFBTyxHQUFHLEVBQUUsTUFBTTtBQUNsQjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLFlBQVksYUFBYTtBQUUvQixXQUFPLFlBQVksTUFBTSxhQUFhLENBQUM7QUFDdkMsV0FBTyxZQUFZLE1BQU0sU0FBUyxLQUFLLEdBQUcsS0FBSztBQUMvQyxXQUFPLFlBQVksTUFBTSxTQUFTLGFBQWEsR0FBRyxJQUFJO0FBRXRELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixLQUFLLEdBQUcsQ0FBQztBQUNuRCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsYUFBYSxHQUFHLENBQUM7QUFDM0QsV0FBTyxZQUFZLG1CQUFtQixDQUFDO0FBRXZDLFdBQU8sWUFBWSxNQUFNLFdBQVcsYUFBYSxVQUFVLEVBQUUsUUFBUSxDQUFDO0FBQ3RFLFdBQU8sWUFBWSxNQUFNLFdBQVcsYUFBYSxvQkFBb0IsRUFBRSxRQUFRLENBQUM7QUFDaEYsV0FBTyxZQUFZLE1BQU0sV0FBVyxhQUFhLFlBQVksRUFBRSxlQUFlLEtBQUssQ0FBQyxFQUFFLFFBQVEsQ0FBQztBQUMvRixXQUFPLFlBQVksTUFBTSxXQUFXLGFBQWEsc0JBQXNCLEVBQUUsZUFBZSxLQUFLLENBQUMsRUFBRSxRQUFRLENBQUM7QUFFekcsVUFBTSxjQUFjLDBCQUEwQixJQUFJLEtBQUssZ0JBQWdCLEdBQUcsb0JBQW9CO0FBRTlGLFVBQU0sTUFBTSxXQUFXLGFBQWEsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUVwRCxXQUFPLFlBQVksTUFBTSxhQUFhLENBQUM7QUFDdkMsV0FBTyxZQUFZLE1BQU0sU0FBUyxLQUFLLEdBQUcsS0FBSztBQUMvQyxXQUFPLFlBQVksTUFBTSxTQUFTLGFBQWEsR0FBRyxJQUFJO0FBQ3RELFdBQU8sWUFBWSxNQUFNLFNBQVMsV0FBVyxHQUFHLElBQUk7QUFFcEQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLGFBQWEsR0FBRyxDQUFDO0FBQzNELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixXQUFXLEdBQUcsQ0FBQztBQUN6RCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsS0FBSyxHQUFHLENBQUM7QUFFbkQsVUFBTSxNQUFNLFdBQVcsT0FBTyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBRTlDLFdBQU8sWUFBWSxNQUFNLGFBQWEsQ0FBQztBQUN2QyxXQUFPLFlBQVksTUFBTSxTQUFTLEtBQUssR0FBRyxJQUFJO0FBQzlDLFdBQU8sWUFBWSxNQUFNLFNBQVMsYUFBYSxHQUFHLElBQUk7QUFDdEQsV0FBTyxZQUFZLE1BQU0sU0FBUyxXQUFXLEdBQUcsSUFBSTtBQUVwRCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsYUFBYSxHQUFHLENBQUM7QUFDM0QsV0FBTyxZQUFZLE1BQU0saUJBQWlCLFdBQVcsR0FBRyxDQUFDO0FBQ3pELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixLQUFLLEdBQUcsQ0FBQztBQUVuRCxtQ0FBK0IsUUFBUTtBQUFBLEVBQ3hDLENBQUM7QUFFRCxPQUFLLGdDQUFnQyxZQUFZO0FBQ2hELFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXO0FBQ2hDLFVBQU0sUUFBUSxLQUFLO0FBRW5CLFdBQU8sWUFBWSxNQUFNLGFBQWEsQ0FBQztBQUV2QyxVQUFNLFFBQVEsMEJBQTBCLElBQUksS0FBSyxTQUFTLEdBQUcsb0JBQW9CO0FBQ2pGLFVBQU0sZ0JBQWdCLDBCQUEwQixJQUFJLEtBQUssa0JBQWtCLEdBQUcsb0JBQW9CO0FBQ2xHLFVBQU0sY0FBYywwQkFBMEIsSUFBSSxLQUFLLGdCQUFnQixHQUFHLG9CQUFvQjtBQUU5RixVQUFNLE1BQU0sV0FBVyxPQUFPLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDOUMsVUFBTSxNQUFNLFdBQVcsZUFBZSxFQUFFLFVBQVUsS0FBSyxDQUFDO0FBQ3hELFVBQU0sTUFBTSxXQUFXLGFBQWEsRUFBRSxRQUFRLE1BQU0sT0FBTyxFQUFFLENBQUM7QUFFOUQsV0FBTyxZQUFZLE1BQU0sYUFBYSxDQUFDO0FBQ3ZDLFdBQU8sWUFBWSxNQUFNLFNBQVMsV0FBVyxHQUFHLElBQUk7QUFFcEQsV0FBTyxZQUFZLE1BQU0saUJBQWlCLEtBQUssR0FBRyxDQUFDO0FBQ25ELFdBQU8sWUFBWSxNQUFNLGlCQUFpQixhQUFhLEdBQUcsQ0FBQztBQUMzRCxXQUFPLFlBQVksTUFBTSxpQkFBaUIsV0FBVyxHQUFHLENBQUM7QUFBQSxFQUMxRCxDQUFDO0FBRUQsT0FBSyx3REFBd0QsWUFBWTtBQUN4RSxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFFBQVEsS0FBSztBQUVuQixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBQ25GLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUVuRixhQUFTLFlBQVksUUFBd0M7QUFDNUQsaUJBQVcsU0FBUyxRQUFRO0FBQzNCLFlBQUksTUFBTSxnQkFBZ0IsUUFBUSxLQUFLLE1BQU0sSUFBSTtBQUNoRCxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQ0EsYUFBTyxPQUFPLFdBQVcsTUFBTSxnQkFBZ0I7QUFBQSxJQUNoRDtBQUdBLFVBQU0sTUFBTSxZQUFZLENBQUMsUUFBUSxRQUFRLE1BQU0sRUFBRSxJQUFJLGFBQVcsRUFBRSxRQUFRLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRSxFQUFFLENBQUM7QUFFdkcsV0FBTyxZQUFZLE1BQU0sU0FBUyxNQUFNLEdBQUcsSUFBSTtBQUMvQyxXQUFPLFlBQVksTUFBTSxXQUFXLE1BQU0sR0FBRyxJQUFJO0FBQ2pELFdBQU8sWUFBWSxNQUFNLFdBQVcsTUFBTSxHQUFHLEtBQUs7QUFDbEQsV0FBTyxZQUFZLE1BQU0sV0FBVyxNQUFNLEdBQUcsS0FBSztBQUVsRCxXQUFPLFlBQVksWUFBWSxDQUFDLE1BQU0sQ0FBQyxHQUFHLElBQUk7QUFHOUMsVUFBTSxNQUFNLGFBQWEsUUFBUSxDQUFDLE1BQU0sQ0FBQztBQUV6QyxXQUFPLFlBQVksTUFBTSxTQUFTLE1BQU0sR0FBRyxJQUFJO0FBQy9DLFdBQU8sWUFBWSxNQUFNLFdBQVcsTUFBTSxHQUFHLElBQUk7QUFDakQsV0FBTyxZQUFZLE1BQU0sV0FBVyxNQUFNLEdBQUcsS0FBSztBQUNsRCxXQUFPLFlBQVksTUFBTSxXQUFXLE1BQU0sR0FBRyxJQUFJO0FBRWpELFdBQU8sWUFBWSxZQUFZLENBQUMsUUFBUSxNQUFNLENBQUMsR0FBRyxJQUFJO0FBR3RELFVBQU0sTUFBTSxhQUFhLFFBQVEsQ0FBQyxRQUFRLE1BQU0sQ0FBQztBQUVqRCxXQUFPLFlBQVksTUFBTSxXQUFXLE1BQU0sR0FBRyxJQUFJO0FBQ2pELFdBQU8sWUFBWSxNQUFNLFNBQVMsTUFBTSxHQUFHLElBQUk7QUFDL0MsV0FBTyxZQUFZLE1BQU0sV0FBVyxNQUFNLEdBQUcsSUFBSTtBQUNqRCxXQUFPLFlBQVksTUFBTSxXQUFXLE1BQU0sR0FBRyxJQUFJO0FBRWpELFdBQU8sWUFBWSxZQUFZLENBQUMsUUFBUSxRQUFRLE1BQU0sQ0FBQyxHQUFHLElBQUk7QUFFOUQsVUFBTSxNQUFNLGFBQWEsUUFBUSxDQUFDLENBQUM7QUFHbkMsV0FBTyxZQUFZLE1BQU0sU0FBUyxNQUFNLEdBQUcsSUFBSTtBQUMvQyxXQUFPLFlBQVksTUFBTSxXQUFXLE1BQU0sR0FBRyxJQUFJO0FBQ2pELFdBQU8sWUFBWSxNQUFNLFdBQVcsTUFBTSxHQUFHLEtBQUs7QUFDbEQsV0FBTyxZQUFZLE1BQU0sV0FBVyxNQUFNLEdBQUcsS0FBSztBQUVsRCxXQUFPLFlBQVksWUFBWSxDQUFDLE1BQU0sQ0FBQyxHQUFHLElBQUk7QUFBQSxFQUMvQyxDQUFDO0FBRUQsT0FBSywyQ0FBMkMsWUFBWTtBQUMzRCxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFFBQVEsS0FBSztBQUNuQixXQUFPLFlBQVksTUFBTSxTQUFTLElBQUk7QUFFdEMsVUFBTSxhQUFhLEtBQUssU0FBUyxPQUFPLGVBQWUsS0FBSztBQUU1RCxVQUFNLFFBQVEsMEJBQTBCLElBQUksS0FBSyxTQUFTLEdBQUcsb0JBQW9CO0FBQ2pGLFVBQU0sZ0JBQWdCLDBCQUEwQixJQUFJLEtBQUssa0JBQWtCLEdBQUcsb0JBQW9CO0FBQ2xHLFVBQU0sYUFBYSwwQkFBMEIsSUFBSSxLQUFLLGVBQWUsR0FBRyxvQkFBb0I7QUFFNUYsUUFBSSxpQkFBaUI7QUFDckIsVUFBTSxvQkFBb0IsTUFBTSxpQkFBaUIsTUFBTTtBQUN0RDtBQUFBLElBQ0QsQ0FBQztBQUVELFFBQUksa0JBQWtCO0FBQ3RCLFVBQU0scUJBQXFCLFdBQVcsaUJBQWlCLE1BQU07QUFDNUQ7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLE1BQU0sWUFBWSxDQUFDLEVBQUUsUUFBUSxPQUFPLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRSxHQUFHLEVBQUUsUUFBUSxjQUFjLEdBQUcsRUFBRSxRQUFRLFdBQVcsQ0FBQyxDQUFDO0FBQ3pILFdBQU8sWUFBWSxnQkFBZ0IsQ0FBQztBQUNwQyxXQUFPLFlBQVksaUJBQWlCLENBQUM7QUFFckMsUUFBSSxTQUFTLE1BQU0sV0FBVyxPQUFPLFVBQVU7QUFDL0MsV0FBTyxZQUFZLFFBQVEsSUFBSTtBQUMvQixXQUFPLFlBQVksZ0JBQWdCLENBQUM7QUFDcEMsV0FBTyxZQUFZLGlCQUFpQixDQUFDO0FBRXJDLGFBQVMsTUFBTSxXQUFXLGVBQWUsVUFBVTtBQUNuRCxXQUFPLFlBQVksUUFBUSxJQUFJO0FBQy9CLFdBQU8sWUFBWSxnQkFBZ0IsQ0FBQztBQUNwQyxXQUFPLFlBQVksaUJBQWlCLENBQUM7QUFFckMsYUFBUyxXQUFXLFdBQVcsZUFBZSxLQUFLO0FBQ25ELFdBQU8sWUFBWSxRQUFRLElBQUk7QUFDL0IsV0FBTyxZQUFZLGdCQUFnQixDQUFDO0FBQ3BDLFdBQU8sWUFBWSxpQkFBaUIsQ0FBQztBQUVyQyxzQkFBa0IsUUFBUTtBQUMxQix1QkFBbUIsUUFBUTtBQUFBLEVBQzVCLENBQUM7QUFFRCxPQUFLLHVCQUF1QixZQUFZO0FBQ3ZDLFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXO0FBQ2hDLFVBQU0sUUFBUSxLQUFLO0FBQ25CLFdBQU8sWUFBWSxNQUFNLFNBQVMsSUFBSTtBQUV0QyxVQUFNLGFBQWEsS0FBSyxTQUFTLE9BQU8sZUFBZSxLQUFLO0FBRTVELFVBQU0sUUFBUSwwQkFBMEIsSUFBSSxLQUFLLFNBQVMsR0FBRyxvQkFBb0I7QUFDakYsVUFBTSxnQkFBZ0IsMEJBQTBCLElBQUksS0FBSyxrQkFBa0IsR0FBRyxvQkFBb0I7QUFDbEcsVUFBTSxhQUFhLDBCQUEwQixJQUFJLEtBQUssZUFBZSxHQUFHLG9CQUFvQjtBQUU1RixVQUFNLE1BQU0sWUFBWSxDQUFDLEVBQUUsUUFBUSxPQUFPLFNBQVMsRUFBRSxRQUFRLEtBQUssRUFBRSxHQUFHLEVBQUUsUUFBUSxjQUFjLEdBQUcsRUFBRSxRQUFRLFdBQVcsQ0FBQyxDQUFDO0FBRXpILFVBQU0sZ0JBQWdCLFVBQVU7QUFDaEMsVUFBTSxTQUFTLE1BQU0sV0FBVyxPQUFPLFVBQVU7QUFFakQsV0FBTyxZQUFZLFFBQVEsS0FBSztBQUNoQyxXQUFPLFlBQVksTUFBTSxPQUFPLENBQUM7QUFBQSxFQUNsQyxDQUFDO0FBRUQsT0FBSyxvQkFBb0IsWUFBWTtBQUNwQyxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFFBQVEsS0FBSztBQUNuQixXQUFPLFlBQVksTUFBTSxTQUFTLElBQUk7QUFFdEMsVUFBTSxhQUFhLEtBQUssU0FBUyxPQUFPLGVBQWUsS0FBSztBQUU1RCxVQUFNLFFBQVEsMEJBQTBCLElBQUksS0FBSyxTQUFTLEdBQUcsb0JBQW9CO0FBQ2pGLFVBQU0sY0FBYywwQkFBMEIsSUFBSSxLQUFLLGdCQUFnQixHQUFHLG9CQUFvQjtBQUM5RixVQUFNLGFBQWEsMEJBQTBCLElBQUksS0FBSyxlQUFlLEdBQUcsb0JBQW9CO0FBRTVGLFFBQUksaUJBQWlCO0FBQ3JCLFVBQU0sb0JBQW9CLE1BQU0saUJBQWlCLE1BQU07QUFDdEQ7QUFBQSxJQUNELENBQUM7QUFFRCxRQUFJLGtCQUFrQjtBQUN0QixVQUFNLHFCQUFxQixXQUFXLGlCQUFpQixNQUFNO0FBQzVEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxNQUFNLFdBQVcsS0FBSztBQUM1QixXQUFPLFlBQVksZ0JBQWdCLENBQUM7QUFDcEMsV0FBTyxZQUFZLGlCQUFpQixDQUFDO0FBRXJDLGVBQVcsV0FBVyxXQUFXO0FBQ2pDLFdBQU8sWUFBWSxnQkFBZ0IsQ0FBQztBQUNwQyxXQUFPLFlBQVksaUJBQWlCLENBQUM7QUFFckMsVUFBTSxXQUFXLFVBQVU7QUFDM0IsV0FBTyxZQUFZLGdCQUFnQixDQUFDO0FBQ3BDLFdBQU8sWUFBWSxpQkFBaUIsQ0FBQztBQUdyQyxlQUFXLFdBQVcsYUFBYSxLQUFLO0FBQ3hDLFdBQU8sWUFBWSxnQkFBZ0IsQ0FBQztBQUNwQyxXQUFPLFlBQVksaUJBQWlCLENBQUM7QUFFckMsc0JBQWtCLFFBQVE7QUFDMUIsdUJBQW1CLFFBQVE7QUFBQSxFQUM1QixDQUFDO0FBRUQsT0FBSywyQ0FBMkMsWUFBWTtBQUMzRCxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFFBQVEsS0FBSztBQUNuQixXQUFPLFlBQVksTUFBTSxTQUFTLElBQUk7QUFDdEMsUUFBSSxhQUFhO0FBQ2pCLFVBQU0sZUFBZSxNQUFNLGlCQUFpQixNQUFNLFlBQVk7QUFFOUQsVUFBTSxhQUFhLEtBQUssU0FBUyxPQUFPLGVBQWUsS0FBSztBQUM1RCxVQUFNLFFBQVEsMEJBQTBCLElBQUksS0FBSyxTQUFTLEdBQUcsb0JBQW9CO0FBQ2pGLFVBQU0sZ0JBQWdCLDBCQUEwQixJQUFJLEtBQUssa0JBQWtCLEdBQUcsb0JBQW9CO0FBQ2xHLFVBQU0sTUFBTSxZQUFZLENBQUMsRUFBRSxRQUFRLE9BQU8sU0FBUyxFQUFFLFFBQVEsS0FBSyxFQUFFLEdBQUcsRUFBRSxRQUFRLGNBQWMsQ0FBQyxDQUFDO0FBQ2pHLFdBQU8sWUFBWSxZQUFZLENBQUM7QUFFaEMsVUFBTSxXQUFXLGVBQWUsWUFBWSxFQUFFLE9BQU8sRUFBRSxDQUFDO0FBRXhELFdBQU8sWUFBWSxZQUFZLENBQUM7QUFDaEMsaUJBQWEsUUFBUTtBQUFBLEVBQ3RCLENBQUM7QUFFRCxPQUFLLDBCQUEwQixZQUFZO0FBQzFDLFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXO0FBQ2hDLFVBQU0sUUFBUSxLQUFLO0FBRW5CLFVBQU0sYUFBYSxLQUFLLFNBQVMsT0FBTyxlQUFlLEtBQUs7QUFFNUQsUUFBSSx5QkFBeUI7QUFDN0IsUUFBSSwwQkFBMEI7QUFDOUIsVUFBTSxlQUFlLEtBQUssdUJBQXVCLE9BQUs7QUFDckQsVUFBSSxNQUFNLE9BQU87QUFDaEI7QUFBQSxNQUNELFdBQVcsTUFBTSxZQUFZO0FBQzVCO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFFBQUksMEJBQTBCO0FBQzlCLFVBQU0sb0JBQW9CLE1BQU0saUJBQWlCLE9BQUs7QUFDckQsVUFBSSxFQUFFLFNBQVMscUJBQXFCLGNBQWM7QUFDakQ7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsUUFBSSwyQkFBMkI7QUFDL0IsVUFBTSxxQkFBcUIsV0FBVyxpQkFBaUIsT0FBSztBQUMzRCxVQUFJLEVBQUUsU0FBUyxxQkFBcUIsY0FBYztBQUNqRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxlQUFXLEtBQUssSUFBSTtBQUNwQixlQUFXLEtBQUssSUFBSTtBQUVwQixXQUFPLFlBQVkseUJBQXlCLENBQUM7QUFDN0MsV0FBTyxZQUFZLHdCQUF3QixDQUFDO0FBQzVDLFdBQU8sWUFBWSwwQkFBMEIsQ0FBQztBQUM5QyxXQUFPLFlBQVkseUJBQXlCLENBQUM7QUFFN0MsZUFBVyxLQUFLLEtBQUs7QUFDckIsZUFBVyxLQUFLLEtBQUs7QUFFckIsV0FBTyxZQUFZLHlCQUF5QixDQUFDO0FBQzdDLFdBQU8sWUFBWSx3QkFBd0IsQ0FBQztBQUM1QyxXQUFPLFlBQVksMEJBQTBCLENBQUM7QUFDOUMsV0FBTyxZQUFZLHlCQUF5QixDQUFDO0FBRTdDLFVBQU0sS0FBSyxJQUFJO0FBQ2YsVUFBTSxLQUFLLElBQUk7QUFFZixXQUFPLFlBQVkseUJBQXlCLENBQUM7QUFDN0MsV0FBTyxZQUFZLHdCQUF3QixDQUFDO0FBQzVDLFdBQU8sWUFBWSwwQkFBMEIsQ0FBQztBQUM5QyxXQUFPLFlBQVkseUJBQXlCLENBQUM7QUFFN0MsVUFBTSxLQUFLLEtBQUs7QUFDaEIsVUFBTSxLQUFLLEtBQUs7QUFFaEIsV0FBTyxZQUFZLHlCQUF5QixDQUFDO0FBQzdDLFdBQU8sWUFBWSx3QkFBd0IsQ0FBQztBQUM1QyxXQUFPLFlBQVksMEJBQTBCLENBQUM7QUFDOUMsV0FBTyxZQUFZLHlCQUF5QixDQUFDO0FBRTdDLGlCQUFhLFFBQVE7QUFDckIsc0JBQWtCLFFBQVE7QUFDMUIsdUJBQW1CLFFBQVE7QUFBQSxFQUM1QixDQUFDO0FBRUQsT0FBSyxpREFBaUQsWUFBWTtBQUNqRSxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNoQyxVQUFNLFFBQVEsS0FBSztBQUVuQixVQUFNLEtBQUssSUFBSTtBQUNmLFdBQU8sWUFBWSxNQUFNLFVBQVUsSUFBSTtBQUV2QyxVQUFNLGFBQWEsS0FBSyxTQUFTLE9BQU8sZUFBZSxLQUFLO0FBQzVELGVBQVcsS0FBSyxJQUFJO0FBRXBCLFdBQU8sWUFBWSxXQUFXLFVBQVUsSUFBSTtBQUU1QyxTQUFLLFlBQVksS0FBSztBQUN0QixXQUFPLFlBQVksV0FBVyxVQUFVLElBQUk7QUFFNUMsVUFBTSxjQUFjLEtBQUssU0FBUyxZQUFZLGVBQWUsS0FBSztBQUNsRSxlQUFXLEtBQUssSUFBSTtBQUNwQixnQkFBWSxLQUFLLElBQUk7QUFFckIsV0FBTyxZQUFZLFdBQVcsVUFBVSxJQUFJO0FBQzVDLFdBQU8sWUFBWSxZQUFZLFVBQVUsSUFBSTtBQUU3QyxTQUFLLFlBQVksV0FBVztBQUU1QixXQUFPLFlBQVksV0FBVyxVQUFVLElBQUk7QUFBQSxFQUM3QyxDQUFDO0FBRUQsT0FBSyw0Q0FBNEMsWUFBWTtBQUM1RCxVQUFNLHVCQUF1Qiw4QkFBOEIsUUFBVyxXQUFXO0FBQ2pGLFVBQU0sdUJBQXVCLElBQUkseUJBQXlCO0FBQzFELFVBQU0scUJBQXFCLHFCQUFxQixhQUFhLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFFLHdDQUF3QyxLQUFLLEVBQUUsRUFBRSxDQUFDO0FBQ2pKLHlCQUFxQixLQUFLLHVCQUF1QixvQkFBb0I7QUFFckUsVUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLFdBQVcsb0JBQW9CO0FBRXBELFVBQU0sWUFBWSxLQUFLO0FBQ3ZCLFFBQUksYUFBYSxLQUFLLFNBQVMsV0FBVyxlQUFlLEtBQUs7QUFFOUQsUUFBSSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUNqRixRQUFJLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBR2pGLFVBQU0sV0FBVyxXQUFXLFFBQVEsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUNwRCxXQUFPLFlBQVksV0FBVyxVQUFVLElBQUk7QUFHNUMsZUFBVyxLQUFLLEtBQUs7QUFDckIsVUFBTSxXQUFXLFdBQVcsUUFBUSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQ3BELFdBQU8sWUFBWSxXQUFXLFVBQVUsS0FBSztBQUc3QyxVQUFNLFdBQVcsZ0JBQWdCO0FBQ2pDLFNBQUssWUFBWSxVQUFVO0FBQzNCLFVBQU0sVUFBVSxnQkFBZ0I7QUFFaEMsYUFBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDN0UsYUFBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFFN0UsVUFBTSxVQUFVLFdBQVcsUUFBUSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQ25ELFdBQU8sWUFBWSxVQUFVLFVBQVUsS0FBSztBQUM1QyxpQkFBYSxLQUFLLFNBQVMsV0FBVyxlQUFlLEtBQUs7QUFDMUQsV0FBTyxZQUFZLFVBQVUsVUFBVSxLQUFLO0FBQzVDLFVBQU0sWUFBWSxLQUFLLFNBQVMsV0FBVyxlQUFlLElBQUk7QUFDOUQsV0FBTyxZQUFZLFVBQVUsVUFBVSxLQUFLO0FBQzVDLFNBQUssWUFBWSxTQUFTO0FBQzFCLFdBQU8sWUFBWSxVQUFVLFVBQVUsS0FBSztBQUFBLEVBQzdDLENBQUM7QUFFRCxPQUFLLHlCQUF5QixZQUFZO0FBQ3pDLFVBQU0sdUJBQXVCLDhCQUE4QixRQUFXLFdBQVc7QUFDakYsVUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLFdBQVcsb0JBQW9CO0FBRXBELFVBQU0sWUFBWSxLQUFLO0FBQ3ZCLFVBQU0saUJBQWlCLEtBQUssUUFBUSxTQUFTO0FBRzdDLFdBQU8sWUFBWSxLQUFLLGtCQUFrQixHQUFHLEtBQUs7QUFFbEQsVUFBTSxhQUFhLEtBQUssU0FBUyxXQUFXLGVBQWUsS0FBSztBQUNoRSxVQUFNLG1CQUFtQixLQUFLLFNBQVMsWUFBWSxlQUFlLElBQUk7QUFFdEUsVUFBTSxnQkFBZ0IsS0FBSyxRQUFRLFNBQVM7QUFDNUMsVUFBTSxpQkFBaUIsS0FBSyxRQUFRLFVBQVU7QUFDOUMsVUFBTSx1QkFBdUIsS0FBSyxRQUFRLGdCQUFnQjtBQUUxRCxRQUFJO0FBQ0osVUFBTSw4QkFBOEIsS0FBSywwQkFBMEIsQ0FBQyxjQUFjO0FBQ2pGLHVCQUFpQjtBQUFBLElBQ2xCLENBQUM7QUFFRCxXQUFPLFlBQVksS0FBSyxrQkFBa0IsR0FBRyxLQUFLO0FBRWxELFNBQUssY0FBYyxrQkFBa0IsVUFBVSxTQUFTO0FBRXhELFdBQU8sWUFBWSxLQUFLLGtCQUFrQixHQUFHLElBQUk7QUFHakQsV0FBTyxnQkFBZ0IsS0FBSyxRQUFRLFNBQVMsR0FBRyxjQUFjO0FBQzlELFdBQU8sZ0JBQWdCLEtBQUssUUFBUSxVQUFVLEdBQUcsRUFBRSxPQUFPLEdBQUcsUUFBUSxFQUFFLENBQUM7QUFDeEUsV0FBTyxnQkFBZ0IsS0FBSyxRQUFRLGdCQUFnQixHQUFHLEVBQUUsT0FBTyxHQUFHLFFBQVEsRUFBRSxDQUFDO0FBRTlFLFdBQU8sZ0JBQWdCLGdCQUFnQixJQUFJO0FBRTNDLFNBQUssb0JBQW9CO0FBRXpCLFdBQU8sWUFBWSxLQUFLLGtCQUFrQixHQUFHLEtBQUs7QUFHbEQsV0FBTyxnQkFBZ0IsS0FBSyxRQUFRLFNBQVMsR0FBRyxhQUFhO0FBQzdELFdBQU8sZ0JBQWdCLEtBQUssUUFBUSxVQUFVLEdBQUcsY0FBYztBQUMvRCxXQUFPLGdCQUFnQixLQUFLLFFBQVEsZ0JBQWdCLEdBQUcsb0JBQW9CO0FBRTNFLFdBQU8sZ0JBQWdCLGdCQUFnQixLQUFLO0FBQzVDLGdDQUE0QixRQUFRO0FBQUEsRUFDckMsQ0FBQztBQUVELE9BQUssOEJBQThCLFlBQVk7QUFDOUMsVUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLFdBQVc7QUFDaEMsVUFBTSxRQUFRLEtBQUs7QUFFbkIsVUFBTSxRQUFRLDBCQUEwQixJQUFJLEtBQUssU0FBUyxHQUFHLG9CQUFvQjtBQUNqRixVQUFNLGlCQUFpQiwwQkFBMEIsSUFBSSxLQUFLLGtCQUFrQixHQUFHLG9CQUFvQjtBQUVuRyxVQUFNLE1BQU0sV0FBVyxPQUFPLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDOUMsVUFBTSxNQUFNLFdBQVcsZ0JBQWdCLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFFMUQsV0FBTyxZQUFZLE1BQU0sWUFBWSxLQUFLLEdBQUcsS0FBSztBQUNsRCxXQUFPLFlBQVksTUFBTSxZQUFZLGNBQWMsR0FBRyxJQUFJO0FBRTFELFVBQU0sTUFBTSxXQUFXLE9BQU8sRUFBRSxRQUFRLEtBQUssQ0FBQztBQUM5QyxVQUFNLE1BQU0sV0FBVyxnQkFBZ0IsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUUxRCxXQUFPLFlBQVksTUFBTSxZQUFZLGNBQWMsR0FBRyxJQUFJO0FBRTFELFVBQU0sTUFBTSxXQUFXLGdCQUFnQixFQUFFLFdBQVcsTUFBTSxDQUFDO0FBQzNELFdBQU8sWUFBWSxNQUFNLFlBQVksY0FBYyxHQUFHLEtBQUs7QUFFM0QsVUFBTSxNQUFNLFdBQVcsZ0JBQWdCLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFDMUQsV0FBTyxZQUFZLE1BQU0sWUFBWSxjQUFjLEdBQUcsS0FBSztBQUFBLEVBQzVELENBQUM7QUFFRCxPQUFLLGdEQUFnRCxZQUFZO0FBQ2hFLFVBQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxXQUFXO0FBQ2hDLFVBQU0sUUFBUSxLQUFLO0FBRW5CLFVBQU0sUUFBUSwwQkFBMEIsSUFBSSxLQUFLLFNBQVMsR0FBRyxvQkFBb0I7QUFDakYsVUFBTSxpQkFBaUIsMEJBQTBCLElBQUksS0FBSyxrQkFBa0IsR0FBRyxvQkFBb0I7QUFFbkcsVUFBTSxNQUFNLFdBQVcsT0FBTyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQzlDLFVBQU0sTUFBTSxXQUFXLGdCQUFnQixFQUFFLFdBQVcsS0FBSyxDQUFDO0FBRTFELFdBQU8sWUFBWSxNQUFNLFlBQVksS0FBSyxHQUFHLEtBQUs7QUFDbEQsV0FBTyxZQUFZLE1BQU0sWUFBWSxjQUFjLEdBQUcsSUFBSTtBQUUxRCxVQUFNLE1BQU0sV0FBVyxPQUFPLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDOUMsVUFBTSxNQUFNLFdBQVcsZ0JBQWdCLEVBQUUsUUFBUSxNQUFNLFdBQVcsS0FBSyxDQUFDO0FBRXhFLFdBQU8sWUFBWSxNQUFNLFlBQVksY0FBYyxHQUFHLEtBQUs7QUFBQSxFQUM1RCxDQUFDO0FBRUQsT0FBSyx1REFBdUQsaUJBQWtCO0FBQzdFLFVBQU0sdUJBQXVCLDhCQUE4QixRQUFXLFdBQVc7QUFDakYsVUFBTSx1QkFBdUIsSUFBSSx5QkFBeUI7QUFDMUQsVUFBTSxxQkFBcUIscUJBQXFCLGFBQWEsRUFBRSxVQUFVLEVBQUUsaUJBQWlCLE1BQU0sRUFBRSxDQUFDO0FBQ3JHLHlCQUFxQixLQUFLLHVCQUF1QixvQkFBb0I7QUFFckUsVUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLFdBQVcsb0JBQW9CO0FBRXBELFVBQU0sUUFBUSxLQUFLO0FBQ25CLFdBQU8sWUFBWSxNQUFNLFNBQVMsSUFBSTtBQUV0QyxVQUFNLFFBQVEsMEJBQTBCLElBQUksS0FBSyxTQUFTLEdBQUcsb0JBQW9CO0FBQ2pGLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFFbkYsVUFBTSxNQUFNLFdBQVcsT0FBTyxFQUFFLFFBQVEsTUFBTSxDQUFDO0FBQy9DLFdBQU8sWUFBWSxNQUFNLFNBQVMsS0FBSyxHQUFHLElBQUk7QUFFOUMsVUFBTSxNQUFNLFdBQVcsUUFBUSxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQ2xELFdBQU8sWUFBWSxNQUFNLFNBQVMsTUFBTSxHQUFHLEtBQUs7QUFFaEQsVUFBTSxNQUFNO0FBQ1osV0FBTyxZQUFZLE1BQU0sU0FBUyxNQUFNLEdBQUcsSUFBSTtBQUFBLEVBQ2hELENBQUM7QUFFRCxPQUFLLHVDQUF1QyxpQkFBa0I7QUFDN0QsVUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLFdBQVc7QUFFaEMsVUFBTSxRQUFRLDBCQUEwQixJQUFJLEtBQUssU0FBUyxHQUFHLG9CQUFvQjtBQUNqRixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBRW5GLFVBQU0sUUFBUSxNQUFNLEtBQUssWUFBWSxXQUFXLE9BQU8sRUFBRSxRQUFRLEtBQUssQ0FBQztBQUN2RSxVQUFNLFFBQVEsTUFBTSxLQUFLLFVBQVUsV0FBVyxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFFdEUsVUFBTSxRQUFRLEtBQUssWUFBWTtBQUUvQixVQUFNLE9BQU8sTUFBTSxnQkFBZ0I7QUFDbkMsVUFBTSxPQUFPLE1BQU0sZ0JBQWdCO0FBRW5DLFdBQU8sWUFBWSxLQUFLLE9BQU8sQ0FBQztBQUNoQyxXQUFPLFlBQVksS0FBSyxZQUFZLFNBQVMsSUFBSTtBQUVqRCxVQUFNLEtBQUssV0FBVyxLQUFLO0FBRTNCLFdBQU8sWUFBWSxLQUFLLE9BQU8sQ0FBQztBQUVoQyxXQUFPLFlBQVksS0FBSyxPQUFPLENBQUMsRUFBRSxTQUFTLEtBQUssR0FBRyxJQUFJO0FBQ3ZELFdBQU8sWUFBWSxLQUFLLE9BQU8sQ0FBQyxFQUFFLFNBQVMsTUFBTSxHQUFHLElBQUk7QUFFeEQsZUFBVyxTQUFTLEtBQUssUUFBUTtBQUNoQyxZQUFNLE1BQU0sZ0JBQWdCO0FBQUEsSUFDN0I7QUFFQSxVQUFNLGFBQWEsS0FBSyxZQUFZO0FBRXBDLFVBQU0sS0FBSyxXQUFXLFVBQVU7QUFDaEMsV0FBTyxZQUFZLEtBQUssT0FBTyxDQUFDO0FBRWhDLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFDbkYsV0FBTyxRQUFRO0FBQ2YsVUFBTSxLQUFLLFlBQVksV0FBVyxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFFMUQsVUFBTSxLQUFLLFdBQVcsVUFBVTtBQUVoQyxXQUFPLFlBQVksS0FBSyxPQUFPLENBQUM7QUFDaEMsV0FBTyxZQUFZLEtBQUssT0FBTyxDQUFDLEVBQUUsU0FBUyxNQUFNLEdBQUcsSUFBSTtBQUV4RCxVQUFNLEtBQUssV0FBVyxPQUFPO0FBRTdCLFdBQU8sWUFBWSxLQUFLLE9BQU8sQ0FBQztBQUNoQyxXQUFPLFlBQVksS0FBSyxPQUFPLENBQUMsRUFBRSxTQUFTLE1BQU0sR0FBRyxJQUFJO0FBRXhELFdBQU8sUUFBUTtBQUVmLFVBQU0sS0FBSyxXQUFXLE9BQU87QUFFN0IsV0FBTyxZQUFZLEtBQUssT0FBTyxDQUFDO0FBQ2hDLFdBQU8sWUFBWSxLQUFLLFlBQVksU0FBUyxJQUFJO0FBQUEsRUFDbEQsQ0FBQztBQUVELE9BQUssaUhBQWlILGlCQUFrQjtBQUN2SSxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUVoQyxVQUFNLFFBQVEsMEJBQTBCLElBQUksS0FBSyxTQUFTLEdBQUcsb0JBQW9CO0FBQ2pGLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFFbkYsVUFBTSxLQUFLLFlBQVksV0FBVyxPQUFPLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDekQsVUFBTSxLQUFLLFVBQVUsV0FBVyxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFFeEQsVUFBTSxRQUFRLEtBQUssWUFBWTtBQUUvQixlQUFXLFNBQVMsS0FBSyxRQUFRO0FBQ2hDLFlBQU0sTUFBTSxnQkFBZ0I7QUFBQSxJQUM3QjtBQU9BLElBQUMsS0FBbUQsb0JBQW9CO0FBRXhFLFFBQUksY0FBYztBQUNsQixVQUFNLFdBQVcsS0FBSyxjQUFjLE1BQU0sYUFBYTtBQUl2RCxVQUFNLEtBQUssV0FBVyxLQUFLO0FBQzNCLGFBQVMsUUFBUTtBQUVqQixXQUFPLFlBQVksS0FBSyxPQUFPLENBQUM7QUFDaEMsV0FBTyxZQUFZLEtBQUssT0FBTyxDQUFDLEVBQUUsU0FBUyxLQUFLLEdBQUcsSUFBSTtBQUN2RCxXQUFPLFlBQVksS0FBSyxPQUFPLENBQUMsRUFBRSxTQUFTLE1BQU0sR0FBRyxJQUFJO0FBQ3hELFdBQU8sWUFBWSxhQUFhLEdBQUcsZ0RBQWdELFdBQVcsRUFBRTtBQUFBLEVBQ2pHLENBQUM7QUFFRCxPQUFLLHdCQUF3QixpQkFBa0I7QUFDOUMsVUFBTUMsZUFBYyxJQUFJLGdCQUFnQjtBQUd4QyxVQUFNLHVCQUF1Qiw4QkFBOEIsRUFBRSxtQkFBbUIsQ0FBQUYsMEJBQXdCQSxzQkFBcUIsZUFBZSw2QkFBNkIsRUFBRSxHQUFHRSxZQUFXO0FBQ3pMLFVBQU0sd0JBQXdCLHFCQUFxQixJQUFJLGtCQUFrQjtBQUV6RSxVQUFNLENBQUMsS0FBSyxJQUFJLE1BQU0sWUFBWSxvQkFBb0I7QUFFdEQsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssU0FBUyxHQUFHLG9CQUFvQjtBQUNsRixVQUFNLFNBQVMsMEJBQTBCLElBQUksS0FBSyxVQUFVLEdBQUcsb0JBQW9CO0FBQ25GLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFVBQVUsR0FBRyxvQkFBb0I7QUFFbkYsVUFBTSxTQUFTLE1BQU07QUFDckIsVUFBTSxTQUFTLE1BQU0sU0FBUyxRQUFRLGVBQWUsS0FBSztBQUUxRCxVQUFNLE9BQU8sV0FBVyxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDaEQsVUFBTSxPQUFPLFdBQVcsUUFBUSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBR2hELFVBQU0sZ0JBQWdCLElBQUksY0FBc0Isa0JBQWtCLE1BQU0sWUFBWSxFQUFFO0FBQ3RGLFVBQU0scUJBQTZEO0FBQUEsTUFDbEUsWUFBWTtBQUFBLE1BQ1oseUJBQXlCLENBQUMsVUFBVSxNQUFNO0FBQUEsSUFDM0M7QUFDQSxJQUFBQSxhQUFZLElBQUksTUFBTSwyQkFBMkIsa0JBQWtCLENBQUM7QUFHcEUsV0FBTyxZQUFZLE1BQU0sWUFBWSxJQUFJLE9BQU8sRUFBRTtBQUVsRCxRQUFJLHdCQUF3QixzQkFBc0IsbUJBQW1CLGNBQWMsR0FBRztBQUN0RixRQUFJLHdCQUF3QixPQUFPLHdCQUF3QixtQkFBbUIsY0FBYyxHQUFHO0FBQy9GLFFBQUksd0JBQXdCLE9BQU8sd0JBQXdCLG1CQUFtQixjQUFjLEdBQUc7QUFDL0YsV0FBTyxZQUFZLHVCQUF1QixPQUFPLEVBQUU7QUFDbkQsV0FBTyxZQUFZLHVCQUF1QixPQUFPLEVBQUU7QUFDbkQsV0FBTyxZQUFZLHVCQUF1QixPQUFPLEVBQUU7QUFHbkQsVUFBTSxjQUFjLE1BQU07QUFFMUIsNEJBQXdCLHNCQUFzQixtQkFBbUIsY0FBYyxHQUFHO0FBQ2xGLDRCQUF3QixPQUFPLHdCQUF3QixtQkFBbUIsY0FBYyxHQUFHO0FBQzNGLDRCQUF3QixPQUFPLHdCQUF3QixtQkFBbUIsY0FBYyxHQUFHO0FBQzNGLFdBQU8sWUFBWSx1QkFBdUIsT0FBTyxFQUFFO0FBQ25ELFdBQU8sWUFBWSx1QkFBdUIsT0FBTyxFQUFFO0FBQ25ELFdBQU8sWUFBWSx1QkFBdUIsT0FBTyxFQUFFO0FBSW5ELFVBQU0sU0FBUyxNQUFNLFNBQVMsUUFBUSxlQUFlLEtBQUs7QUFDMUQsVUFBTSxPQUFPLFdBQVcsUUFBUSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBRWhELDRCQUF3QixzQkFBc0IsbUJBQW1CLGNBQWMsR0FBRztBQUNsRiw0QkFBd0IsT0FBTyx3QkFBd0IsbUJBQW1CLGNBQWMsR0FBRztBQUMzRiw0QkFBd0IsT0FBTyx3QkFBd0IsbUJBQW1CLGNBQWMsR0FBRztBQUMzRixVQUFNLHdCQUF3QixPQUFPLHdCQUF3QixtQkFBbUIsY0FBYyxHQUFHO0FBQ2pHLFdBQU8sWUFBWSx1QkFBdUIsT0FBTyxFQUFFO0FBQ25ELFdBQU8sWUFBWSx1QkFBdUIsT0FBTyxFQUFFO0FBQ25ELFdBQU8sWUFBWSx1QkFBdUIsT0FBTyxFQUFFO0FBQ25ELFdBQU8sWUFBWSx1QkFBdUIsT0FBTyxFQUFFO0FBRW5ELElBQUFBLGFBQVksUUFBUTtBQUFBLEVBQ3JCLENBQUM7QUFFRCxPQUFLLHFDQUFxQyxpQkFBa0I7QUFDM0QsVUFBTUEsZUFBYyxJQUFJLGdCQUFnQjtBQUd4QyxVQUFNLHVCQUF1Qiw4QkFBOEIsRUFBRSxtQkFBbUIsQ0FBQUYsMEJBQXdCQSxzQkFBcUIsZUFBZSw2QkFBNkIsRUFBRSxHQUFHRSxZQUFXO0FBQ3pMLFVBQU0sd0JBQXdCLHFCQUFxQixJQUFJLGtCQUFrQjtBQUV6RSxVQUFNLFFBQVEsTUFBTSxrQkFBa0Isc0JBQXNCQSxZQUFXO0FBRXZFLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFNBQVMsR0FBRyxvQkFBb0I7QUFDbEYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUVuRixVQUFNLFNBQVMsTUFBTTtBQUNyQixVQUFNLFNBQVMsTUFBTSxTQUFTLFFBQVEsZUFBZSxLQUFLO0FBRTFELFVBQU0sT0FBTyxXQUFXLFFBQVEsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUNoRCxVQUFNLE9BQU8sV0FBVyxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFHaEQsUUFBSSxTQUFTO0FBQ2IsVUFBTSxlQUFlLElBQUksUUFBYztBQUV2QyxVQUFNLGdCQUFnQixJQUFJLGNBQXNCLGtCQUFrQixNQUFNLFlBQVksRUFBRTtBQUN0RixVQUFNLHFCQUE2RDtBQUFBLE1BQ2xFLFlBQVk7QUFBQSxNQUNaLHlCQUF5QixDQUFDLFVBQVUsTUFBTSxLQUFLO0FBQUEsTUFDL0MsYUFBYSxhQUFhO0FBQUEsSUFDM0I7QUFDQSxJQUFBQSxhQUFZLElBQUksTUFBTSwyQkFBMkIsa0JBQWtCLENBQUM7QUFHcEUsV0FBTyxZQUFZLE1BQU0sWUFBWSxJQUFJLE9BQU8sRUFBRTtBQUVsRCxRQUFJLHdCQUF3QixzQkFBc0IsbUJBQW1CLGNBQWMsR0FBRztBQUN0RixRQUFJLHdCQUF3QixPQUFPLHdCQUF3QixtQkFBbUIsY0FBYyxHQUFHO0FBQy9GLFFBQUksd0JBQXdCLE9BQU8sd0JBQXdCLG1CQUFtQixjQUFjLEdBQUc7QUFDL0YsV0FBTyxZQUFZLHVCQUF1QixPQUFPLEtBQUssTUFBTTtBQUM1RCxXQUFPLFlBQVksdUJBQXVCLE9BQU8sS0FBSyxNQUFNO0FBQzVELFdBQU8sWUFBWSx1QkFBdUIsT0FBTyxLQUFLLE1BQU07QUFHNUQsYUFBUztBQUNULGlCQUFhLEtBQUs7QUFFbEIsNEJBQXdCLHNCQUFzQixtQkFBbUIsY0FBYyxHQUFHO0FBQ2xGLDRCQUF3QixPQUFPLHdCQUF3QixtQkFBbUIsY0FBYyxHQUFHO0FBQzNGLDRCQUF3QixPQUFPLHdCQUF3QixtQkFBbUIsY0FBYyxHQUFHO0FBQzNGLFdBQU8sWUFBWSx1QkFBdUIsT0FBTyxLQUFLLE1BQU07QUFDNUQsV0FBTyxZQUFZLHVCQUF1QixPQUFPLEtBQUssTUFBTTtBQUM1RCxXQUFPLFlBQVksdUJBQXVCLE9BQU8sS0FBSyxNQUFNO0FBRTVELElBQUFBLGFBQVksUUFBUTtBQUFBLEVBQ3JCLENBQUM7QUFFRCxPQUFLLDhDQUE4QyxpQkFBa0I7QUFDcEUsVUFBTUEsZUFBYyxJQUFJLGdCQUFnQjtBQUd4QyxVQUFNLHVCQUF1Qiw4QkFBOEIsRUFBRSxtQkFBbUIsQ0FBQUYsMEJBQXdCQSxzQkFBcUIsZUFBZSw2QkFBNkIsRUFBRSxHQUFHRSxZQUFXO0FBQ3pMLFVBQU0sd0JBQXdCLHFCQUFxQixJQUFJLGtCQUFrQjtBQUV6RSxVQUFNLFFBQVEsTUFBTSxrQkFBa0Isc0JBQXNCQSxZQUFXO0FBRXZFLFVBQU0sU0FBUywwQkFBMEIsSUFBSSxLQUFLLFNBQVMsR0FBRyxvQkFBb0I7QUFDbEYsVUFBTSxTQUFTLDBCQUEwQixJQUFJLEtBQUssVUFBVSxHQUFHLG9CQUFvQjtBQUVuRixVQUFNLFNBQVMsTUFBTTtBQUVyQixVQUFNLE9BQU8sV0FBVyxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDaEQsVUFBTSxPQUFPLFdBQVcsUUFBUSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBR2hELFVBQU0sZ0JBQWdCLElBQUksY0FBc0Isa0JBQWtCLE9BQU8sU0FBUyxTQUFTLENBQUM7QUFDNUYsVUFBTSxxQkFBNkQ7QUFBQSxNQUNsRSxZQUFZO0FBQUEsTUFDWix5QkFBeUIsQ0FBQyxVQUFVLE1BQU0sY0FBYyxVQUFVLFNBQVMsS0FBSztBQUFBLElBQ2pGO0FBQ0EsSUFBQUEsYUFBWSxJQUFJLE1BQU0sMkJBQTJCLGtCQUFrQixDQUFDO0FBR3BFLFdBQU8sWUFBWSxRQUFRLE9BQU8sY0FBYyxVQUFVLE9BQU8sUUFBUSxHQUFHLElBQUk7QUFFaEYsUUFBSSx3QkFBd0Isc0JBQXNCLG1CQUFtQixjQUFjLEdBQUc7QUFDdEYsUUFBSSx3QkFBd0IsT0FBTyx3QkFBd0IsbUJBQW1CLGNBQWMsR0FBRztBQUMvRixXQUFPLFlBQVksdUJBQXVCLE9BQU8sU0FBUyxTQUFTLENBQUM7QUFDcEUsV0FBTyxZQUFZLHVCQUF1QixPQUFPLFNBQVMsU0FBUyxDQUFDO0FBR3BFLFVBQU0sT0FBTyxXQUFXLE1BQU07QUFFOUIsNEJBQXdCLHNCQUFzQixtQkFBbUIsY0FBYyxHQUFHO0FBQ2xGLDRCQUF3QixPQUFPLHdCQUF3QixtQkFBbUIsY0FBYyxHQUFHO0FBQzNGLFdBQU8sWUFBWSx1QkFBdUIsT0FBTyxTQUFTLFNBQVMsQ0FBQztBQUNwRSxXQUFPLFlBQVksdUJBQXVCLE9BQU8sU0FBUyxTQUFTLENBQUM7QUFFcEUsSUFBQUEsYUFBWSxRQUFRO0FBQUEsRUFDckIsQ0FBQztBQUVELE9BQUssZ0RBQWdELGlCQUFrQjtBQUN0RSxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUVoQyxVQUFNLG1CQUFrRCxDQUFDO0FBQ3pELGdCQUFZLElBQUksS0FBSyxtQkFBbUIsT0FBSyxpQkFBaUIsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUV0RSxVQUFNLFlBQVksS0FBSyxPQUFPLENBQUM7QUFDL0IsVUFBTSxhQUFhLEtBQUssU0FBUyxXQUFXLGVBQWUsS0FBSztBQUdoRSxxQkFBaUIsU0FBUztBQUMxQixTQUFLLGNBQWMsVUFBVTtBQUM3QixXQUFPLFlBQVksaUJBQWlCLFFBQVEsQ0FBQztBQUM3QyxXQUFPLFlBQVksaUJBQWlCLENBQUMsRUFBRSxPQUFPLFVBQVU7QUFDeEQsV0FBTyxZQUFZLGlCQUFpQixDQUFDLEVBQUUsUUFBUSxzQkFBc0IsT0FBTztBQUc1RSxxQkFBaUIsU0FBUztBQUMxQixTQUFLLGNBQWMsVUFBVTtBQUM3QixXQUFPLFlBQVksaUJBQWlCLFFBQVEsQ0FBQztBQUM3QyxXQUFPLFlBQVksaUJBQWlCLENBQUMsRUFBRSxPQUFPLFVBQVU7QUFDeEQsV0FBTyxZQUFZLGlCQUFpQixDQUFDLEVBQUUsUUFBUSxzQkFBc0IsT0FBTztBQUc1RSxxQkFBaUIsU0FBUztBQUMxQixTQUFLLGNBQWMsU0FBUztBQUM1QixXQUFPLFlBQVksaUJBQWlCLFFBQVEsQ0FBQztBQUM3QyxXQUFPLFlBQVksaUJBQWlCLENBQUMsRUFBRSxPQUFPLFNBQVM7QUFDdkQsV0FBTyxZQUFZLGlCQUFpQixDQUFDLEVBQUUsUUFBUSxzQkFBc0IsT0FBTztBQUFBLEVBQzdFLENBQUM7QUFFRCwwQ0FBd0M7QUFDekMsQ0FBQzsiLAogICJuYW1lcyI6IFsiaW5zdGFudGlhdGlvblNlcnZpY2UiLCAiZ3JvdXAiLCAiZGlzcG9zYWJsZXMiXQp9Cg==
