import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { mock } from "../../../../base/test/common/mock.js";
import { TabInputKind, TabModelOperationKind } from "../../common/extHost.protocol.js";
import { ExtHostEditorTabs } from "../../common/extHostEditorTabs.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
import { TextMergeTabInput, TextTabInput } from "../../common/extHostTypes.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("ExtHostEditorTabs", function() {
  const defaultTabDto = {
    id: "uniquestring",
    input: { kind: TabInputKind.TextInput, uri: URI.parse("file://abc/def.txt") },
    isActive: true,
    isDirty: true,
    isPinned: true,
    isPreview: false,
    label: "label1"
  };
  function createTabDto(dto) {
    return { ...defaultTabDto, ...dto };
  }
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("Ensure empty model throws when accessing active group", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 0);
    assert.throws(() => extHostEditorTabs.tabGroups.activeTabGroup);
  });
  test("single tab", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tab = createTabDto({
      id: "uniquestring",
      isActive: true,
      isDirty: true,
      isPinned: true,
      label: "label1"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    const [first] = extHostEditorTabs.tabGroups.all;
    assert.ok(first.activeTab);
    assert.strictEqual(first.tabs.indexOf(first.activeTab), 0);
    {
      extHostEditorTabs.$acceptEditorTabModel([{
        isActive: true,
        viewColumn: 0,
        groupId: 12,
        tabs: [tab]
      }]);
      assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
      const [first2] = extHostEditorTabs.tabGroups.all;
      assert.ok(first2.activeTab);
      assert.strictEqual(first2.tabs.indexOf(first2.activeTab), 0);
    }
  });
  test("Empty tab group", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: []
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    const [first] = extHostEditorTabs.tabGroups.all;
    assert.strictEqual(first.activeTab, void 0);
    assert.strictEqual(first.tabs.length, 0);
  });
  test("Ensure tabGroup change events fires", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    let count = 0;
    store.add(extHostEditorTabs.tabGroups.onDidChangeTabGroups(() => count++));
    assert.strictEqual(count, 0);
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: []
    }]);
    assert.ok(extHostEditorTabs.tabGroups.activeTabGroup);
    const activeTabGroup = extHostEditorTabs.tabGroups.activeTabGroup;
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(activeTabGroup.tabs.length, 0);
    assert.strictEqual(count, 1);
  });
  test("Check TabGroupChangeEvent properties", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const group1Data = {
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: []
    };
    const group2Data = { ...group1Data, groupId: 13 };
    const events = [];
    store.add(extHostEditorTabs.tabGroups.onDidChangeTabGroups((e) => events.push(e)));
    extHostEditorTabs.$acceptEditorTabModel([group1Data]);
    assert.deepStrictEqual(events, [{
      changed: [],
      closed: [],
      opened: [extHostEditorTabs.tabGroups.activeTabGroup]
    }]);
    events.length = 0;
    extHostEditorTabs.$acceptEditorTabModel([{ ...group1Data, isActive: false }, group2Data]);
    assert.deepStrictEqual(events, [{
      changed: [extHostEditorTabs.tabGroups.all[0]],
      closed: [],
      opened: [extHostEditorTabs.tabGroups.all[1]]
    }]);
    events.length = 0;
    extHostEditorTabs.$acceptEditorTabModel([group1Data, { ...group2Data, isActive: false }]);
    assert.deepStrictEqual(events, [{
      changed: extHostEditorTabs.tabGroups.all,
      closed: [],
      opened: []
    }]);
    events.length = 0;
    const oldActiveGroup = extHostEditorTabs.tabGroups.activeTabGroup;
    extHostEditorTabs.$acceptEditorTabModel([group2Data]);
    assert.deepStrictEqual(events, [{
      changed: extHostEditorTabs.tabGroups.all,
      closed: [oldActiveGroup],
      opened: []
    }]);
  });
  test("Ensure reference equality for activeTab and activeGroup", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tab = createTabDto({
      id: "uniquestring",
      isActive: true,
      isDirty: true,
      isPinned: true,
      label: "label1",
      editorId: "default"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    const [first] = extHostEditorTabs.tabGroups.all;
    assert.ok(first.activeTab);
    assert.strictEqual(first.tabs.indexOf(first.activeTab), 0);
    assert.strictEqual(first.activeTab, first.tabs[0]);
    assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup, first);
  });
  test("TextMergeTabInput surfaces in the UI", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tab = createTabDto({
      input: {
        kind: TabInputKind.TextMergeInput,
        base: URI.from({ scheme: "test", path: "base" }),
        input1: URI.from({ scheme: "test", path: "input1" }),
        input2: URI.from({ scheme: "test", path: "input2" }),
        result: URI.from({ scheme: "test", path: "result" })
      }
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    const [first] = extHostEditorTabs.tabGroups.all;
    assert.ok(first.activeTab);
    assert.strictEqual(first.tabs.indexOf(first.activeTab), 0);
    assert.ok(first.activeTab.input instanceof TextMergeTabInput);
  });
  test("Ensure reference stability", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tabDto = createTabDto();
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tabDto]
    }]);
    let all = extHostEditorTabs.tabGroups.all.map((group) => group.tabs).flat();
    assert.strictEqual(all.length, 1);
    const apiTab1 = all[0];
    assert.ok(apiTab1.input instanceof TextTabInput);
    assert.strictEqual(tabDto.input.kind, TabInputKind.TextInput);
    const dtoResource = tabDto.input.uri;
    assert.strictEqual(apiTab1.input.uri.toString(), URI.revive(dtoResource).toString());
    assert.strictEqual(apiTab1.isDirty, true);
    const tabDto2 = { ...tabDto, isDirty: false };
    extHostEditorTabs.$acceptTabOperation({
      kind: TabModelOperationKind.TAB_UPDATE,
      index: 0,
      tabDto: tabDto2,
      groupId: 12
    });
    all = extHostEditorTabs.tabGroups.all.map((group) => group.tabs).flat();
    assert.strictEqual(all.length, 1);
    const apiTab2 = all[0];
    assert.ok(apiTab1.input instanceof TextTabInput);
    assert.strictEqual(apiTab1.input.uri.toString(), URI.revive(dtoResource).toString());
    assert.strictEqual(apiTab2.isDirty, false);
    assert.strictEqual(apiTab1 === apiTab2, true);
  });
  test("Tab.isActive working", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tabDtoAAA = createTabDto({
      id: "AAA",
      isActive: true,
      isDirty: true,
      isPinned: true,
      label: "label1",
      input: { kind: TabInputKind.TextInput, uri: URI.parse("file://abc/AAA.txt") },
      editorId: "default"
    });
    const tabDtoBBB = createTabDto({
      id: "BBB",
      isActive: false,
      isDirty: true,
      isPinned: true,
      label: "label1",
      input: { kind: TabInputKind.TextInput, uri: URI.parse("file://abc/BBB.txt") },
      editorId: "default"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tabDtoAAA, tabDtoBBB]
    }]);
    const all = extHostEditorTabs.tabGroups.all.map((group) => group.tabs).flat();
    assert.strictEqual(all.length, 2);
    const activeTab1 = extHostEditorTabs.tabGroups.activeTabGroup?.activeTab;
    assert.ok(activeTab1?.input instanceof TextTabInput);
    assert.strictEqual(tabDtoAAA.input.kind, TabInputKind.TextInput);
    const dtoAAAResource = tabDtoAAA.input.uri;
    assert.strictEqual(activeTab1?.input?.uri.toString(), URI.revive(dtoAAAResource)?.toString());
    assert.strictEqual(activeTab1?.isActive, true);
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 1,
      kind: TabModelOperationKind.TAB_UPDATE,
      tabDto: { ...tabDtoBBB, isActive: true }
      /// BBB is now active
    });
    const activeTab2 = extHostEditorTabs.tabGroups.activeTabGroup?.activeTab;
    assert.ok(activeTab2?.input instanceof TextTabInput);
    assert.strictEqual(tabDtoBBB.input.kind, TabInputKind.TextInput);
    const dtoBBBResource = tabDtoBBB.input.uri;
    assert.strictEqual(activeTab2?.input?.uri.toString(), URI.revive(dtoBBBResource)?.toString());
    assert.strictEqual(activeTab2?.isActive, true);
    assert.strictEqual(activeTab1?.isActive, false);
  });
  test("vscode.window.tagGroups is immutable", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    assert.throws(() => {
      extHostEditorTabs.tabGroups.activeTabGroup = void 0;
    });
    assert.throws(() => {
      extHostEditorTabs.tabGroups.all.length = 0;
    });
    assert.throws(() => {
      extHostEditorTabs.tabGroups.onDidChangeActiveTabGroup = void 0;
    });
    assert.throws(() => {
      extHostEditorTabs.tabGroups.onDidChangeTabGroups = void 0;
    });
  });
  test("Ensure close is called with all tab ids", function() {
    const closedTabIds = [];
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
        async $closeTab(tabIds, preserveFocus) {
          closedTabIds.push(tabIds);
          return true;
        }
      }())
    );
    const tab = createTabDto({
      id: "uniquestring",
      isActive: true,
      isDirty: true,
      isPinned: true,
      label: "label1",
      editorId: "default"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    const activeTab = extHostEditorTabs.tabGroups.activeTabGroup?.activeTab;
    assert.ok(activeTab);
    extHostEditorTabs.tabGroups.close(activeTab, false);
    assert.strictEqual(closedTabIds.length, 1);
    assert.deepStrictEqual(closedTabIds[0], ["uniquestring"]);
    extHostEditorTabs.tabGroups.close([activeTab], false);
    assert.strictEqual(closedTabIds.length, 2);
    assert.deepStrictEqual(closedTabIds[1], ["uniquestring"]);
  });
  test("Update tab only sends tab change event", async function() {
    const closedTabIds = [];
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
        async $closeTab(tabIds, preserveFocus) {
          closedTabIds.push(tabIds);
          return true;
        }
      }())
    );
    const tabDto = createTabDto({
      id: "uniquestring",
      isActive: true,
      isDirty: true,
      isPinned: true,
      label: "label1",
      editorId: "default"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tabDto]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 1);
    const tab = extHostEditorTabs.tabGroups.all[0].tabs[0];
    const p = new Promise((resolve) => store.add(extHostEditorTabs.tabGroups.onDidChangeTabs(resolve)));
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 0,
      kind: TabModelOperationKind.TAB_UPDATE,
      tabDto: { ...tabDto, label: "NEW LABEL" }
    });
    const changedTab = (await p).changed[0];
    assert.ok(tab === changedTab);
    assert.strictEqual(changedTab.label, "NEW LABEL");
  });
  test("Active tab", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tab1 = createTabDto({
      id: "uniquestring",
      isActive: true,
      isDirty: true,
      isPinned: true,
      label: "label1"
    });
    const tab2 = createTabDto({
      isActive: false,
      id: "uniquestring2"
    });
    const tab3 = createTabDto({
      isActive: false,
      id: "uniquestring3"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab1, tab2, tab3]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 3);
    assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, extHostEditorTabs.tabGroups.activeTabGroup?.tabs[0]);
    tab1.isActive = false;
    tab2.isActive = true;
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 0,
      kind: TabModelOperationKind.TAB_UPDATE,
      tabDto: tab1
    });
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 1,
      kind: TabModelOperationKind.TAB_UPDATE,
      tabDto: tab2
    });
    assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, extHostEditorTabs.tabGroups.activeTabGroup?.tabs[1]);
    tab3.isActive = true;
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab3]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, extHostEditorTabs.tabGroups.activeTabGroup?.tabs[0]);
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: []
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 0);
    assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, void 0);
  });
  test("Tab operations patches open and close correctly", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tab1 = createTabDto({
      id: "uniquestring",
      isActive: true,
      label: "label1"
    });
    const tab2 = createTabDto({
      isActive: false,
      id: "uniquestring2",
      label: "label2"
    });
    const tab3 = createTabDto({
      isActive: false,
      id: "uniquestring3",
      label: "label3"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab1, tab2, tab3]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 3);
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 1,
      kind: TabModelOperationKind.TAB_CLOSE,
      tabDto: tab2
    });
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 2);
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 0,
      kind: TabModelOperationKind.TAB_CLOSE,
      tabDto: tab1
    });
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 1);
    tab3.isActive = true;
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 0,
      kind: TabModelOperationKind.TAB_UPDATE,
      tabDto: tab3
    });
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.activeTab?.label, "label3");
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 1,
      kind: TabModelOperationKind.TAB_OPEN,
      tabDto: tab2
    });
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 2);
    assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.tabs[1]?.label, "label2");
  });
  test("Tab operations patches move correctly", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tab1 = createTabDto({
      id: "uniquestring",
      isActive: true,
      label: "label1"
    });
    const tab2 = createTabDto({
      isActive: false,
      id: "uniquestring2",
      label: "label2"
    });
    const tab3 = createTabDto({
      isActive: false,
      id: "uniquestring3",
      label: "label3"
    });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tab1, tab2, tab3]
    }]);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 3);
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 0,
      oldIndex: 1,
      kind: TabModelOperationKind.TAB_MOVE,
      tabDto: tab2
    });
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 3);
    assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.tabs[0]?.label, "label2");
    extHostEditorTabs.$acceptTabOperation({
      groupId: 12,
      index: 1,
      oldIndex: 2,
      kind: TabModelOperationKind.TAB_MOVE,
      tabDto: tab3
    });
    assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
    assert.strictEqual(extHostEditorTabs.tabGroups.all.map((g) => g.tabs).flat().length, 3);
    assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.tabs[1]?.label, "label3");
    assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.tabs[0]?.label, "label2");
    assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.tabs[2]?.label, "label1");
  });
  test("Reference stability across full model resync", function() {
    const extHostEditorTabs = new ExtHostEditorTabs(
      SingleProxyRPCProtocol(new class extends mock() {
        // override/implement $moveTab or $closeTab
      }())
    );
    const tabAAA = createTabDto({ id: "AAA", label: "AAA", isActive: true, input: { kind: TabInputKind.TextInput, uri: URI.parse("file://abc/AAA.txt") } });
    const tabBBB = createTabDto({ id: "BBB", label: "BBB", isActive: false, input: { kind: TabInputKind.TextInput, uri: URI.parse("file://abc/BBB.txt") } });
    extHostEditorTabs.$acceptEditorTabModel([{
      isActive: true,
      viewColumn: 0,
      groupId: 12,
      tabs: [tabAAA, tabBBB]
    }]);
    const groupBefore = extHostEditorTabs.tabGroups.all[0];
    const tabAAABefore = groupBefore.tabs[0];
    const tabBBBBefore = groupBefore.tabs[1];
    extHostEditorTabs.$acceptEditorTabModel([
      { isActive: false, viewColumn: 0, groupId: 12, tabs: [tabAAA, tabBBB] },
      { isActive: true, viewColumn: 1, groupId: 13, tabs: [] }
    ]);
    const groupAfter = extHostEditorTabs.tabGroups.all.find((g) => g.tabs.length === 2);
    assert.strictEqual(groupAfter, groupBefore);
    assert.strictEqual(groupAfter.tabs[0], tabAAABefore);
    assert.strictEqual(groupAfter.tabs[1], tabBBBBefore);
    extHostEditorTabs.$acceptEditorTabModel([
      { isActive: false, viewColumn: 0, groupId: 12, tabs: [{ ...tabAAA, isActive: true }] },
      { isActive: true, viewColumn: 1, groupId: 13, tabs: [] }
    ]);
    const survivingGroup = extHostEditorTabs.tabGroups.all.find((g) => g.tabs.length === 1);
    assert.strictEqual(survivingGroup, groupBefore);
    assert.strictEqual(survivingGroup.tabs.length, 1);
    assert.strictEqual(survivingGroup.tabs[0], tabAAABefore);
    assert.strictEqual(survivingGroup.activeTab, tabAAABefore);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RFZGl0b3JUYWJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgSUVkaXRvclRhYkR0bywgSUVkaXRvclRhYkdyb3VwRHRvLCBNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlLCBUYWJJbnB1dEtpbmQsIFRhYk1vZGVsT3BlcmF0aW9uS2luZCwgVGV4dElucHV0RHRvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRXh0SG9zdEVkaXRvclRhYnMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdEVkaXRvclRhYnMuanMnO1xuaW1wb3J0IHsgU2luZ2xlUHJveHlSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgVGV4dE1lcmdlVGFiSW5wdXQsIFRleHRUYWJJbnB1dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdFeHRIb3N0RWRpdG9yVGFicycsIGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCBkZWZhdWx0VGFiRHRvOiBJRWRpdG9yVGFiRHRvID0ge1xuXHRcdGlkOiAndW5pcXVlc3RyaW5nJyxcblx0XHRpbnB1dDogeyBraW5kOiBUYWJJbnB1dEtpbmQuVGV4dElucHV0LCB1cmk6IFVSSS5wYXJzZSgnZmlsZTovL2FiYy9kZWYudHh0JykgfSxcblx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRpc0RpcnR5OiB0cnVlLFxuXHRcdGlzUGlubmVkOiB0cnVlLFxuXHRcdGlzUHJldmlldzogZmFsc2UsXG5cdFx0bGFiZWw6ICdsYWJlbDEnLFxuXHR9O1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRhYkR0byhkdG8/OiBQYXJ0aWFsPElFZGl0b3JUYWJEdG8+KTogSUVkaXRvclRhYkR0byB7XG5cdFx0cmV0dXJuIHsgLi4uZGVmYXVsdFRhYkR0bywgLi4uZHRvIH07XG5cdH1cblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ0Vuc3VyZSBlbXB0eSBtb2RlbCB0aHJvd3Mgd2hlbiBhY2Nlc3NpbmcgYWN0aXZlIGdyb3VwJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGV4dEhvc3RFZGl0b3JUYWJzID0gbmV3IEV4dEhvc3RFZGl0b3JUYWJzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbChuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRFZGl0b3JUYWJzU2hhcGU+KCkge1xuXHRcdFx0XHQvLyBvdmVycmlkZS9pbXBsZW1lbnQgJG1vdmVUYWIgb3IgJGNsb3NlVGFiXG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGgsIDApO1xuXHRcdC8vIEFjdGl2ZSBncm91cCBzaG91bGQgbmV2ZXIgYmUgdW5kZWZpbmVkICh0aGVyZSBpcyBhbHdheXMgYW4gYWN0aXZlIGdyb3VwKS4gRW5zdXJlIGFjY2Vzc2luZyBpdCB1bmRlZmluZWQgdGhyb3dzLlxuXHRcdC8vIFRPRE8gQGxyYW1vczE1IEFkZCBhIHRocm93IG9uIHRoZSBtYWluIHNpZGUgd2hlbiBhIG1vZGVsIGlzIHNlbnQgd2l0aG91dCBhbiBhY3RpdmUgZ3JvdXBcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hY3RpdmVUYWJHcm91cCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZSB0YWInLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBleHRIb3N0RWRpdG9yVGFicyA9IG5ldyBFeHRIb3N0RWRpdG9yVGFicyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlPigpIHtcblx0XHRcdFx0Ly8gb3ZlcnJpZGUvaW1wbGVtZW50ICRtb3ZlVGFiIG9yICRjbG9zZVRhYlxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgdGFiOiBJRWRpdG9yVGFiRHRvID0gY3JlYXRlVGFiRHRvKHtcblx0XHRcdGlkOiAndW5pcXVlc3RyaW5nJyxcblx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0aXNEaXJ0eTogdHJ1ZSxcblx0XHRcdGlzUGlubmVkOiB0cnVlLFxuXHRcdFx0bGFiZWw6ICdsYWJlbDEnLFxuXHRcdH0pO1xuXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFt7XG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdHZpZXdDb2x1bW46IDAsXG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdHRhYnM6IFt0YWJdXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW2ZpcnN0XSA9IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGw7XG5cdFx0YXNzZXJ0Lm9rKGZpcnN0LmFjdGl2ZVRhYik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRhYnMuaW5kZXhPZihmaXJzdC5hY3RpdmVUYWIpLCAwKTtcblxuXHRcdHtcblx0XHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRFZGl0b3JUYWJNb2RlbChbe1xuXHRcdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0dmlld0NvbHVtbjogMCxcblx0XHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHRcdHRhYnM6IFt0YWJdXG5cdFx0XHR9XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3QgW2ZpcnN0XSA9IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGw7XG5cdFx0XHRhc3NlcnQub2soZmlyc3QuYWN0aXZlVGFiKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50YWJzLmluZGV4T2YoZmlyc3QuYWN0aXZlVGFiKSwgMCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdFbXB0eSB0YWIgZ3JvdXAnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZXh0SG9zdEVkaXRvclRhYnMgPSBuZXcgRXh0SG9zdEVkaXRvclRhYnMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZEVkaXRvclRhYnNTaGFwZT4oKSB7XG5cdFx0XHRcdC8vIG92ZXJyaWRlL2ltcGxlbWVudCAkbW92ZVRhYiBvciAkY2xvc2VUYWJcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRFZGl0b3JUYWJNb2RlbChbe1xuXHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHR2aWV3Q29sdW1uOiAwLFxuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHR0YWJzOiBbXVxuXHRcdH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtmaXJzdF0gPSBleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5hY3RpdmVUYWIsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRhYnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnRW5zdXJlIHRhYkdyb3VwIGNoYW5nZSBldmVudHMgZmlyZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZXh0SG9zdEVkaXRvclRhYnMgPSBuZXcgRXh0SG9zdEVkaXRvclRhYnMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZEVkaXRvclRhYnNTaGFwZT4oKSB7XG5cdFx0XHRcdC8vIG92ZXJyaWRlL2ltcGxlbWVudCAkbW92ZVRhYiBvciAkY2xvc2VUYWJcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0c3RvcmUuYWRkKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5vbkRpZENoYW5nZVRhYkdyb3VwcygoKSA9PiBjb3VudCsrKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDApO1xuXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFt7XG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdHZpZXdDb2x1bW46IDAsXG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdHRhYnM6IFtdXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5vayhleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWN0aXZlVGFiR3JvdXApO1xuXHRcdGNvbnN0IGFjdGl2ZVRhYkdyb3VwOiB2c2NvZGUuVGFiR3JvdXAgPSBleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWN0aXZlVGFiR3JvdXA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlVGFiR3JvdXAudGFicy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoZWNrIFRhYkdyb3VwQ2hhbmdlRXZlbnQgcHJvcGVydGllcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBleHRIb3N0RWRpdG9yVGFicyA9IG5ldyBFeHRIb3N0RWRpdG9yVGFicyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlPigpIHtcblx0XHRcdFx0Ly8gb3ZlcnJpZGUvaW1wbGVtZW50ICRtb3ZlVGFiIG9yICRjbG9zZVRhYlxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgZ3JvdXAxRGF0YTogSUVkaXRvclRhYkdyb3VwRHRvID0ge1xuXHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHR2aWV3Q29sdW1uOiAwLFxuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHR0YWJzOiBbXVxuXHRcdH07XG5cdFx0Y29uc3QgZ3JvdXAyRGF0YTogSUVkaXRvclRhYkdyb3VwRHRvID0geyAuLi5ncm91cDFEYXRhLCBncm91cElkOiAxMyB9O1xuXG5cdFx0Y29uc3QgZXZlbnRzOiB2c2NvZGUuVGFiR3JvdXBDaGFuZ2VFdmVudFtdID0gW107XG5cdFx0c3RvcmUuYWRkKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5vbkRpZENoYW5nZVRhYkdyb3VwcyhlID0+IGV2ZW50cy5wdXNoKGUpKSk7XG5cdFx0Ly8gT1BFTlxuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRFZGl0b3JUYWJNb2RlbChbZ3JvdXAxRGF0YV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbe1xuXHRcdFx0Y2hhbmdlZDogW10sXG5cdFx0XHRjbG9zZWQ6IFtdLFxuXHRcdFx0b3BlbmVkOiBbZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFjdGl2ZVRhYkdyb3VwXVxuXHRcdH1dKTtcblxuXHRcdC8vIE9QRU4sIENIQU5HRVxuXHRcdGV2ZW50cy5sZW5ndGggPSAwO1xuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRFZGl0b3JUYWJNb2RlbChbeyAuLi5ncm91cDFEYXRhLCBpc0FjdGl2ZTogZmFsc2UgfSwgZ3JvdXAyRGF0YV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbe1xuXHRcdFx0Y2hhbmdlZDogW2V4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGxbMF1dLFxuXHRcdFx0Y2xvc2VkOiBbXSxcblx0XHRcdG9wZW5lZDogW2V4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGxbMV1dXG5cdFx0fV0pO1xuXG5cdFx0Ly8gQ0hBTkdFXG5cdFx0ZXZlbnRzLmxlbmd0aCA9IDA7XG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFtncm91cDFEYXRhLCB7IC4uLmdyb3VwMkRhdGEsIGlzQWN0aXZlOiBmYWxzZSB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFt7XG5cdFx0XHRjaGFuZ2VkOiBleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLFxuXHRcdFx0Y2xvc2VkOiBbXSxcblx0XHRcdG9wZW5lZDogW11cblx0XHR9XSk7XG5cblx0XHQvLyBDTE9TRSwgQ0hBTkdFXG5cdFx0ZXZlbnRzLmxlbmd0aCA9IDA7XG5cdFx0Y29uc3Qgb2xkQWN0aXZlR3JvdXAgPSBleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWN0aXZlVGFiR3JvdXA7XG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFtncm91cDJEYXRhXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFt7XG5cdFx0XHRjaGFuZ2VkOiBleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLFxuXHRcdFx0Y2xvc2VkOiBbb2xkQWN0aXZlR3JvdXBdLFxuXHRcdFx0b3BlbmVkOiBbXVxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnRW5zdXJlIHJlZmVyZW5jZSBlcXVhbGl0eSBmb3IgYWN0aXZlVGFiIGFuZCBhY3RpdmVHcm91cCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBleHRIb3N0RWRpdG9yVGFicyA9IG5ldyBFeHRIb3N0RWRpdG9yVGFicyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlPigpIHtcblx0XHRcdFx0Ly8gb3ZlcnJpZGUvaW1wbGVtZW50ICRtb3ZlVGFiIG9yICRjbG9zZVRhYlxuXHRcdFx0fSlcblx0XHQpO1xuXHRcdGNvbnN0IHRhYiA9IGNyZWF0ZVRhYkR0byh7XG5cdFx0XHRpZDogJ3VuaXF1ZXN0cmluZycsXG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdGlzRGlydHk6IHRydWUsXG5cdFx0XHRpc1Bpbm5lZDogdHJ1ZSxcblx0XHRcdGxhYmVsOiAnbGFiZWwxJyxcblx0XHRcdGVkaXRvcklkOiAnZGVmYXVsdCcsXG5cdFx0fSk7XG5cblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0RWRpdG9yVGFiTW9kZWwoW3tcblx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0dmlld0NvbHVtbjogMCxcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0dGFiczogW3RhYl1cblx0XHR9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbZmlyc3RdID0gZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbDtcblx0XHRhc3NlcnQub2soZmlyc3QuYWN0aXZlVGFiKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGFicy5pbmRleE9mKGZpcnN0LmFjdGl2ZVRhYiksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5hY3RpdmVUYWIsIGZpcnN0LnRhYnNbMF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWN0aXZlVGFiR3JvdXAsIGZpcnN0KTtcblx0fSk7XG5cblx0dGVzdCgnVGV4dE1lcmdlVGFiSW5wdXQgc3VyZmFjZXMgaW4gdGhlIFVJJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgZXh0SG9zdEVkaXRvclRhYnMgPSBuZXcgRXh0SG9zdEVkaXRvclRhYnMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZEVkaXRvclRhYnNTaGFwZT4oKSB7XG5cdFx0XHRcdC8vIG92ZXJyaWRlL2ltcGxlbWVudCAkbW92ZVRhYiBvciAkY2xvc2VUYWJcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdGNvbnN0IHRhYjogSUVkaXRvclRhYkR0byA9IGNyZWF0ZVRhYkR0byh7XG5cdFx0XHRpbnB1dDoge1xuXHRcdFx0XHRraW5kOiBUYWJJbnB1dEtpbmQuVGV4dE1lcmdlSW5wdXQsXG5cdFx0XHRcdGJhc2U6IFVSSS5mcm9tKHsgc2NoZW1lOiAndGVzdCcsIHBhdGg6ICdiYXNlJyB9KSxcblx0XHRcdFx0aW5wdXQxOiBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3QnLCBwYXRoOiAnaW5wdXQxJyB9KSxcblx0XHRcdFx0aW5wdXQyOiBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3QnLCBwYXRoOiAnaW5wdXQyJyB9KSxcblx0XHRcdFx0cmVzdWx0OiBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3QnLCBwYXRoOiAncmVzdWx0JyB9KSxcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRFZGl0b3JUYWJNb2RlbChbe1xuXHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHR2aWV3Q29sdW1uOiAwLFxuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHR0YWJzOiBbdGFiXVxuXHRcdH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtmaXJzdF0gPSBleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsO1xuXHRcdGFzc2VydC5vayhmaXJzdC5hY3RpdmVUYWIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50YWJzLmluZGV4T2YoZmlyc3QuYWN0aXZlVGFiKSwgMCk7XG5cdFx0YXNzZXJ0Lm9rKGZpcnN0LmFjdGl2ZVRhYi5pbnB1dCBpbnN0YW5jZW9mIFRleHRNZXJnZVRhYklucHV0KTtcblx0fSk7XG5cblx0dGVzdCgnRW5zdXJlIHJlZmVyZW5jZSBzdGFiaWxpdHknLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBleHRIb3N0RWRpdG9yVGFicyA9IG5ldyBFeHRIb3N0RWRpdG9yVGFicyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlPigpIHtcblx0XHRcdFx0Ly8gb3ZlcnJpZGUvaW1wbGVtZW50ICRtb3ZlVGFiIG9yICRjbG9zZVRhYlxuXHRcdFx0fSlcblx0XHQpO1xuXHRcdGNvbnN0IHRhYkR0byA9IGNyZWF0ZVRhYkR0bygpO1xuXG5cdFx0Ly8gc2luZ2xlIGRpcnR5IHRhYlxuXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFt7XG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdHZpZXdDb2x1bW46IDAsXG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdHRhYnM6IFt0YWJEdG9dXG5cdFx0fV0pO1xuXHRcdGxldCBhbGwgPSBleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLm1hcChncm91cCA9PiBncm91cC50YWJzKS5mbGF0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFsbC5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IGFwaVRhYjEgPSBhbGxbMF07XG5cdFx0YXNzZXJ0Lm9rKGFwaVRhYjEuaW5wdXQgaW5zdGFuY2VvZiBUZXh0VGFiSW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWJEdG8uaW5wdXQua2luZCwgVGFiSW5wdXRLaW5kLlRleHRJbnB1dCk7XG5cdFx0Y29uc3QgZHRvUmVzb3VyY2UgPSAodGFiRHRvLmlucHV0IGFzIFRleHRJbnB1dER0bykudXJpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcGlUYWIxLmlucHV0LnVyaS50b1N0cmluZygpLCBVUkkucmV2aXZlKGR0b1Jlc291cmNlKS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBpVGFiMS5pc0RpcnR5LCB0cnVlKTtcblxuXG5cdFx0Ly8gTk9UIERJUlRZIGFueW1vcmVcblxuXHRcdGNvbnN0IHRhYkR0bzI6IElFZGl0b3JUYWJEdG8gPSB7IC4uLnRhYkR0bywgaXNEaXJ0eTogZmFsc2UgfTtcblx0XHQvLyBBY2NlcHQgYSBzaW1wbGUgdXBkYXRlXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdFRhYk9wZXJhdGlvbih7XG5cdFx0XHRraW5kOiBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX1VQREFURSxcblx0XHRcdGluZGV4OiAwLFxuXHRcdFx0dGFiRHRvOiB0YWJEdG8yLFxuXHRcdFx0Z3JvdXBJZDogMTJcblx0XHR9KTtcblxuXHRcdGFsbCA9IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubWFwKGdyb3VwID0+IGdyb3VwLnRhYnMpLmZsYXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWxsLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgYXBpVGFiMiA9IGFsbFswXTtcblx0XHRhc3NlcnQub2soYXBpVGFiMS5pbnB1dCBpbnN0YW5jZW9mIFRleHRUYWJJbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwaVRhYjEuaW5wdXQudXJpLnRvU3RyaW5nKCksIFVSSS5yZXZpdmUoZHRvUmVzb3VyY2UpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcGlUYWIyLmlzRGlydHksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcGlUYWIxID09PSBhcGlUYWIyLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnVGFiLmlzQWN0aXZlIHdvcmtpbmcnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBleHRIb3N0RWRpdG9yVGFicyA9IG5ldyBFeHRIb3N0RWRpdG9yVGFicyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlPigpIHtcblx0XHRcdFx0Ly8gb3ZlcnJpZGUvaW1wbGVtZW50ICRtb3ZlVGFiIG9yICRjbG9zZVRhYlxuXHRcdFx0fSlcblx0XHQpO1xuXHRcdGNvbnN0IHRhYkR0b0FBQSA9IGNyZWF0ZVRhYkR0byh7XG5cdFx0XHRpZDogJ0FBQScsXG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdGlzRGlydHk6IHRydWUsXG5cdFx0XHRpc1Bpbm5lZDogdHJ1ZSxcblx0XHRcdGxhYmVsOiAnbGFiZWwxJyxcblx0XHRcdGlucHV0OiB7IGtpbmQ6IFRhYklucHV0S2luZC5UZXh0SW5wdXQsIHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vYWJjL0FBQS50eHQnKSB9LFxuXHRcdFx0ZWRpdG9ySWQ6ICdkZWZhdWx0J1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGFiRHRvQkJCID0gY3JlYXRlVGFiRHRvKHtcblx0XHRcdGlkOiAnQkJCJyxcblx0XHRcdGlzQWN0aXZlOiBmYWxzZSxcblx0XHRcdGlzRGlydHk6IHRydWUsXG5cdFx0XHRpc1Bpbm5lZDogdHJ1ZSxcblx0XHRcdGxhYmVsOiAnbGFiZWwxJyxcblx0XHRcdGlucHV0OiB7IGtpbmQ6IFRhYklucHV0S2luZC5UZXh0SW5wdXQsIHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vYWJjL0JCQi50eHQnKSB9LFxuXHRcdFx0ZWRpdG9ySWQ6ICdkZWZhdWx0J1xuXHRcdH0pO1xuXG5cdFx0Ly8gc2luZ2xlIGRpcnR5IHRhYlxuXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFt7XG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdHZpZXdDb2x1bW46IDAsXG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdHRhYnM6IFt0YWJEdG9BQUEsIHRhYkR0b0JCQl1cblx0XHR9XSk7XG5cblx0XHRjb25zdCBhbGwgPSBleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLm1hcChncm91cCA9PiBncm91cC50YWJzKS5mbGF0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFsbC5sZW5ndGgsIDIpO1xuXG5cdFx0Y29uc3QgYWN0aXZlVGFiMSA9IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hY3RpdmVUYWJHcm91cD8uYWN0aXZlVGFiO1xuXHRcdGFzc2VydC5vayhhY3RpdmVUYWIxPy5pbnB1dCBpbnN0YW5jZW9mIFRleHRUYWJJbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhYkR0b0FBQS5pbnB1dC5raW5kLCBUYWJJbnB1dEtpbmQuVGV4dElucHV0KTtcblx0XHRjb25zdCBkdG9BQUFSZXNvdXJjZSA9ICh0YWJEdG9BQUEuaW5wdXQgYXMgVGV4dElucHV0RHRvKS51cmk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2ZVRhYjE/LmlucHV0Py51cmkudG9TdHJpbmcoKSwgVVJJLnJldml2ZShkdG9BQUFSZXNvdXJjZSk/LnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVUYWIxPy5pc0FjdGl2ZSwgdHJ1ZSk7XG5cblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRraW5kOiBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX1VQREFURSxcblx0XHRcdHRhYkR0bzogeyAuLi50YWJEdG9CQkIsIGlzQWN0aXZlOiB0cnVlIH0gLy8vIEJCQiBpcyBub3cgYWN0aXZlXG5cdFx0fSk7XG5cblx0XHRjb25zdCBhY3RpdmVUYWIyID0gZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFjdGl2ZVRhYkdyb3VwPy5hY3RpdmVUYWI7XG5cdFx0YXNzZXJ0Lm9rKGFjdGl2ZVRhYjI/LmlucHV0IGluc3RhbmNlb2YgVGV4dFRhYklucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFiRHRvQkJCLmlucHV0LmtpbmQsIFRhYklucHV0S2luZC5UZXh0SW5wdXQpO1xuXHRcdGNvbnN0IGR0b0JCQlJlc291cmNlID0gKHRhYkR0b0JCQi5pbnB1dCBhcyBUZXh0SW5wdXREdG8pLnVyaTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlVGFiMj8uaW5wdXQ/LnVyaS50b1N0cmluZygpLCBVUkkucmV2aXZlKGR0b0JCQlJlc291cmNlKT8udG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2ZVRhYjI/LmlzQWN0aXZlLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlVGFiMT8uaXNBY3RpdmUsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgndnNjb2RlLndpbmRvdy50YWdHcm91cHMgaXMgaW1tdXRhYmxlJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgZXh0SG9zdEVkaXRvclRhYnMgPSBuZXcgRXh0SG9zdEVkaXRvclRhYnMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZEVkaXRvclRhYnNTaGFwZT4oKSB7XG5cdFx0XHRcdC8vIG92ZXJyaWRlL2ltcGxlbWVudCAkbW92ZVRhYiBvciAkY2xvc2VUYWJcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0Ly8gQHRzLWV4cGVjdC1lcnJvciB3cml0ZSB0byByZWFkb25seSBwcm9wXG5cdFx0XHRleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWN0aXZlVGFiR3JvdXAgPSB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yIHdyaXRlIHRvIHJlYWRvbmx5IHByb3Bcblx0XHRcdGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubGVuZ3RoID0gMDtcblx0XHR9KTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Igd3JpdGUgdG8gcmVhZG9ubHkgcHJvcFxuXHRcdFx0ZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLm9uRGlkQ2hhbmdlQWN0aXZlVGFiR3JvdXAgPSB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yIHdyaXRlIHRvIHJlYWRvbmx5IHByb3Bcblx0XHRcdGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5vbkRpZENoYW5nZVRhYkdyb3VwcyA9IHVuZGVmaW5lZDtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRW5zdXJlIGNsb3NlIGlzIGNhbGxlZCB3aXRoIGFsbCB0YWIgaWRzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNsb3NlZFRhYklkczogc3RyaW5nW11bXSA9IFtdO1xuXHRcdGNvbnN0IGV4dEhvc3RFZGl0b3JUYWJzID0gbmV3IEV4dEhvc3RFZGl0b3JUYWJzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbChuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRFZGl0b3JUYWJzU2hhcGU+KCkge1xuXHRcdFx0XHQvLyBvdmVycmlkZS9pbXBsZW1lbnQgJG1vdmVUYWIgb3IgJGNsb3NlVGFiXG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jICRjbG9zZVRhYih0YWJJZHM6IHN0cmluZ1tdLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbikge1xuXHRcdFx0XHRcdGNsb3NlZFRhYklkcy5wdXNoKHRhYklkcyk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblx0XHRjb25zdCB0YWI6IElFZGl0b3JUYWJEdG8gPSBjcmVhdGVUYWJEdG8oe1xuXHRcdFx0aWQ6ICd1bmlxdWVzdHJpbmcnLFxuXHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRpc0RpcnR5OiB0cnVlLFxuXHRcdFx0aXNQaW5uZWQ6IHRydWUsXG5cdFx0XHRsYWJlbDogJ2xhYmVsMScsXG5cdFx0XHRlZGl0b3JJZDogJ2RlZmF1bHQnXG5cdFx0fSk7XG5cblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0RWRpdG9yVGFiTW9kZWwoW3tcblx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0dmlld0NvbHVtbjogMCxcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0dGFiczogW3RhYl1cblx0XHR9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBhY3RpdmVUYWIgPSBleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWN0aXZlVGFiR3JvdXA/LmFjdGl2ZVRhYjtcblx0XHRhc3NlcnQub2soYWN0aXZlVGFiKTtcblx0XHRleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuY2xvc2UoYWN0aXZlVGFiLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb3NlZFRhYklkcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xvc2VkVGFiSWRzWzBdLCBbJ3VuaXF1ZXN0cmluZyddKTtcblx0XHQvLyBDbG9zZSB3aXRoIGFycmF5XG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmNsb3NlKFthY3RpdmVUYWJdLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb3NlZFRhYklkcy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xvc2VkVGFiSWRzWzFdLCBbJ3VuaXF1ZXN0cmluZyddKTtcblx0fSk7XG5cblx0dGVzdCgnVXBkYXRlIHRhYiBvbmx5IHNlbmRzIHRhYiBjaGFuZ2UgZXZlbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY2xvc2VkVGFiSWRzOiBzdHJpbmdbXVtdID0gW107XG5cdFx0Y29uc3QgZXh0SG9zdEVkaXRvclRhYnMgPSBuZXcgRXh0SG9zdEVkaXRvclRhYnMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZEVkaXRvclRhYnNTaGFwZT4oKSB7XG5cdFx0XHRcdC8vIG92ZXJyaWRlL2ltcGxlbWVudCAkbW92ZVRhYiBvciAkY2xvc2VUYWJcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgJGNsb3NlVGFiKHRhYklkczogc3RyaW5nW10sIHByZXNlcnZlRm9jdXM/OiBib29sZWFuKSB7XG5cdFx0XHRcdFx0Y2xvc2VkVGFiSWRzLnB1c2godGFiSWRzKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXHRcdGNvbnN0IHRhYkR0bzogSUVkaXRvclRhYkR0byA9IGNyZWF0ZVRhYkR0byh7XG5cdFx0XHRpZDogJ3VuaXF1ZXN0cmluZycsXG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdGlzRGlydHk6IHRydWUsXG5cdFx0XHRpc1Bpbm5lZDogdHJ1ZSxcblx0XHRcdGxhYmVsOiAnbGFiZWwxJyxcblx0XHRcdGVkaXRvcklkOiAnZGVmYXVsdCdcblx0XHR9KTtcblxuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRFZGl0b3JUYWJNb2RlbChbe1xuXHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHR2aWV3Q29sdW1uOiAwLFxuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHR0YWJzOiBbdGFiRHRvXVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubWFwKGcgPT4gZy50YWJzKS5mbGF0KCkubGVuZ3RoLCAxKTtcblxuXHRcdGNvbnN0IHRhYiA9IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGxbMF0udGFic1swXTtcblxuXG5cdFx0Y29uc3QgcCA9IG5ldyBQcm9taXNlPHZzY29kZS5UYWJDaGFuZ2VFdmVudD4ocmVzb2x2ZSA9PiBzdG9yZS5hZGQoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLm9uRGlkQ2hhbmdlVGFicyhyZXNvbHZlKSkpO1xuXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdFRhYk9wZXJhdGlvbih7XG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdGluZGV4OiAwLFxuXHRcdFx0a2luZDogVGFiTW9kZWxPcGVyYXRpb25LaW5kLlRBQl9VUERBVEUsXG5cdFx0XHR0YWJEdG86IHsgLi4udGFiRHRvLCBsYWJlbDogJ05FVyBMQUJFTCcgfVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY2hhbmdlZFRhYiA9IChhd2FpdCBwKS5jaGFuZ2VkWzBdO1xuXG5cdFx0YXNzZXJ0Lm9rKHRhYiA9PT0gY2hhbmdlZFRhYik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWRUYWIubGFiZWwsICdORVcgTEFCRUwnKTtcblxuXHR9KTtcblxuXHR0ZXN0KCdBY3RpdmUgdGFiJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgZXh0SG9zdEVkaXRvclRhYnMgPSBuZXcgRXh0SG9zdEVkaXRvclRhYnMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZEVkaXRvclRhYnNTaGFwZT4oKSB7XG5cdFx0XHRcdC8vIG92ZXJyaWRlL2ltcGxlbWVudCAkbW92ZVRhYiBvciAkY2xvc2VUYWJcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdGNvbnN0IHRhYjE6IElFZGl0b3JUYWJEdG8gPSBjcmVhdGVUYWJEdG8oe1xuXHRcdFx0aWQ6ICd1bmlxdWVzdHJpbmcnLFxuXHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRpc0RpcnR5OiB0cnVlLFxuXHRcdFx0aXNQaW5uZWQ6IHRydWUsXG5cdFx0XHRsYWJlbDogJ2xhYmVsMScsXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0YWIyOiBJRWRpdG9yVGFiRHRvID0gY3JlYXRlVGFiRHRvKHtcblx0XHRcdGlzQWN0aXZlOiBmYWxzZSxcblx0XHRcdGlkOiAndW5pcXVlc3RyaW5nMicsXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0YWIzOiBJRWRpdG9yVGFiRHRvID0gY3JlYXRlVGFiRHRvKHtcblx0XHRcdGlzQWN0aXZlOiBmYWxzZSxcblx0XHRcdGlkOiAndW5pcXVlc3RyaW5nMycsXG5cdFx0fSk7XG5cblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0RWRpdG9yVGFiTW9kZWwoW3tcblx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0dmlld0NvbHVtbjogMCxcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0dGFiczogW3RhYjEsIHRhYjIsIHRhYjNdXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5tYXAoZyA9PiBnLnRhYnMpLmZsYXQoKS5sZW5ndGgsIDMpO1xuXG5cdFx0Ly8gQWN0aXZlIHRhYiBpcyBjb3JyZWN0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hY3RpdmVUYWJHcm91cD8uYWN0aXZlVGFiLCBleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWN0aXZlVGFiR3JvdXA/LnRhYnNbMF0pO1xuXG5cdFx0Ly8gU3dpdGNoaW5nIGFjdGl2ZSB0YWIgd29ya3Ncblx0XHR0YWIxLmlzQWN0aXZlID0gZmFsc2U7XG5cdFx0dGFiMi5pc0FjdGl2ZSA9IHRydWU7XG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdFRhYk9wZXJhdGlvbih7XG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdGluZGV4OiAwLFxuXHRcdFx0a2luZDogVGFiTW9kZWxPcGVyYXRpb25LaW5kLlRBQl9VUERBVEUsXG5cdFx0XHR0YWJEdG86IHRhYjFcblx0XHR9KTtcblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRraW5kOiBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX1VQREFURSxcblx0XHRcdHRhYkR0bzogdGFiMlxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWN0aXZlVGFiR3JvdXA/LmFjdGl2ZVRhYiwgZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFjdGl2ZVRhYkdyb3VwPy50YWJzWzFdKTtcblxuXHRcdC8vQ2xvc2luZyB0YWJzIG91dCB3b3Jrc1xuXHRcdHRhYjMuaXNBY3RpdmUgPSB0cnVlO1xuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRFZGl0b3JUYWJNb2RlbChbe1xuXHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHR2aWV3Q29sdW1uOiAwLFxuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHR0YWJzOiBbdGFiM11cblx0XHR9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5tYXAoZyA9PiBnLnRhYnMpLmZsYXQoKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWN0aXZlVGFiR3JvdXA/LmFjdGl2ZVRhYiwgZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFjdGl2ZVRhYkdyb3VwPy50YWJzWzBdKTtcblxuXHRcdC8vIENsb3Npbmcgb3V0IGFsbCB0YWJzIHJldHVybnMgdW5kZWZpbmUgYWN0aXZlIHRhYlxuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRFZGl0b3JUYWJNb2RlbChbe1xuXHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHR2aWV3Q29sdW1uOiAwLFxuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHR0YWJzOiBbXVxuXHRcdH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLm1hcChnID0+IGcudGFicykuZmxhdCgpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hY3RpdmVUYWJHcm91cD8uYWN0aXZlVGFiLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdUYWIgb3BlcmF0aW9ucyBwYXRjaGVzIG9wZW4gYW5kIGNsb3NlIGNvcnJlY3RseScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBleHRIb3N0RWRpdG9yVGFicyA9IG5ldyBFeHRIb3N0RWRpdG9yVGFicyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2wobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkRWRpdG9yVGFic1NoYXBlPigpIHtcblx0XHRcdFx0Ly8gb3ZlcnJpZGUvaW1wbGVtZW50ICRtb3ZlVGFiIG9yICRjbG9zZVRhYlxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgdGFiMTogSUVkaXRvclRhYkR0byA9IGNyZWF0ZVRhYkR0byh7XG5cdFx0XHRpZDogJ3VuaXF1ZXN0cmluZycsXG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdGxhYmVsOiAnbGFiZWwxJyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRhYjI6IElFZGl0b3JUYWJEdG8gPSBjcmVhdGVUYWJEdG8oe1xuXHRcdFx0aXNBY3RpdmU6IGZhbHNlLFxuXHRcdFx0aWQ6ICd1bmlxdWVzdHJpbmcyJyxcblx0XHRcdGxhYmVsOiAnbGFiZWwyJyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRhYjM6IElFZGl0b3JUYWJEdG8gPSBjcmVhdGVUYWJEdG8oe1xuXHRcdFx0aXNBY3RpdmU6IGZhbHNlLFxuXHRcdFx0aWQ6ICd1bmlxdWVzdHJpbmczJyxcblx0XHRcdGxhYmVsOiAnbGFiZWwzJyxcblx0XHR9KTtcblxuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRFZGl0b3JUYWJNb2RlbChbe1xuXHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHR2aWV3Q29sdW1uOiAwLFxuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHR0YWJzOiBbdGFiMSwgdGFiMiwgdGFiM11cblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLm1hcChnID0+IGcudGFicykuZmxhdCgpLmxlbmd0aCwgMyk7XG5cblx0XHQvLyBDbG9zZSB0YWIgMlxuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRUYWJPcGVyYXRpb24oe1xuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHRpbmRleDogMSxcblx0XHRcdGtpbmQ6IFRhYk1vZGVsT3BlcmF0aW9uS2luZC5UQUJfQ0xPU0UsXG5cdFx0XHR0YWJEdG86IHRhYjJcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLm1hcChnID0+IGcudGFicykuZmxhdCgpLmxlbmd0aCwgMik7XG5cblx0XHQvLyBDbG9zZSBhY3RpdmUgdGFiIGFuZCB1cGRhdGUgdGFiIDMgdG8gYmUgYWN0aXZlXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdFRhYk9wZXJhdGlvbih7XG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdGluZGV4OiAwLFxuXHRcdFx0a2luZDogVGFiTW9kZWxPcGVyYXRpb25LaW5kLlRBQl9DTE9TRSxcblx0XHRcdHRhYkR0bzogdGFiMVxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubWFwKGcgPT4gZy50YWJzKS5mbGF0KCkubGVuZ3RoLCAxKTtcblx0XHR0YWIzLmlzQWN0aXZlID0gdHJ1ZTtcblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0VGFiT3BlcmF0aW9uKHtcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRraW5kOiBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX1VQREFURSxcblx0XHRcdHRhYkR0bzogdGFiM1xuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubWFwKGcgPT4gZy50YWJzKS5mbGF0KCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbFswXT8uYWN0aXZlVGFiPy5sYWJlbCwgJ2xhYmVsMycpO1xuXG5cdFx0Ly8gT3BlbiB0YWIgMiBiYWNrXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdFRhYk9wZXJhdGlvbih7XG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdGluZGV4OiAxLFxuXHRcdFx0a2luZDogVGFiTW9kZWxPcGVyYXRpb25LaW5kLlRBQl9PUEVOLFxuXHRcdFx0dGFiRHRvOiB0YWIyXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5tYXAoZyA9PiBnLnRhYnMpLmZsYXQoKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsWzBdPy50YWJzWzFdPy5sYWJlbCwgJ2xhYmVsMicpO1xuXHR9KTtcblxuXHR0ZXN0KCdUYWIgb3BlcmF0aW9ucyBwYXRjaGVzIG1vdmUgY29ycmVjdGx5JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGV4dEhvc3RFZGl0b3JUYWJzID0gbmV3IEV4dEhvc3RFZGl0b3JUYWJzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbChuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRFZGl0b3JUYWJzU2hhcGU+KCkge1xuXHRcdFx0XHQvLyBvdmVycmlkZS9pbXBsZW1lbnQgJG1vdmVUYWIgb3IgJGNsb3NlVGFiXG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHRjb25zdCB0YWIxOiBJRWRpdG9yVGFiRHRvID0gY3JlYXRlVGFiRHRvKHtcblx0XHRcdGlkOiAndW5pcXVlc3RyaW5nJyxcblx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0bGFiZWw6ICdsYWJlbDEnLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGFiMjogSUVkaXRvclRhYkR0byA9IGNyZWF0ZVRhYkR0byh7XG5cdFx0XHRpc0FjdGl2ZTogZmFsc2UsXG5cdFx0XHRpZDogJ3VuaXF1ZXN0cmluZzInLFxuXHRcdFx0bGFiZWw6ICdsYWJlbDInLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGFiMzogSUVkaXRvclRhYkR0byA9IGNyZWF0ZVRhYkR0byh7XG5cdFx0XHRpc0FjdGl2ZTogZmFsc2UsXG5cdFx0XHRpZDogJ3VuaXF1ZXN0cmluZzMnLFxuXHRcdFx0bGFiZWw6ICdsYWJlbDMnLFxuXHRcdH0pO1xuXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdEVkaXRvclRhYk1vZGVsKFt7XG5cdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdHZpZXdDb2x1bW46IDAsXG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdHRhYnM6IFt0YWIxLCB0YWIyLCB0YWIzXVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubWFwKGcgPT4gZy50YWJzKS5mbGF0KCkubGVuZ3RoLCAzKTtcblxuXHRcdC8vIE1vdmUgdGFiIDIgdG8gaW5kZXggMFxuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRUYWJPcGVyYXRpb24oe1xuXHRcdFx0Z3JvdXBJZDogMTIsXG5cdFx0XHRpbmRleDogMCxcblx0XHRcdG9sZEluZGV4OiAxLFxuXHRcdFx0a2luZDogVGFiTW9kZWxPcGVyYXRpb25LaW5kLlRBQl9NT1ZFLFxuXHRcdFx0dGFiRHRvOiB0YWIyXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5tYXAoZyA9PiBnLnRhYnMpLmZsYXQoKS5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsWzBdPy50YWJzWzBdPy5sYWJlbCwgJ2xhYmVsMicpO1xuXG5cdFx0Ly8gTW92ZSB0YWIgMyB0byBpbmRleCAxXG5cdFx0ZXh0SG9zdEVkaXRvclRhYnMuJGFjY2VwdFRhYk9wZXJhdGlvbih7XG5cdFx0XHRncm91cElkOiAxMixcblx0XHRcdGluZGV4OiAxLFxuXHRcdFx0b2xkSW5kZXg6IDIsXG5cdFx0XHRraW5kOiBUYWJNb2RlbE9wZXJhdGlvbktpbmQuVEFCX01PVkUsXG5cdFx0XHR0YWJEdG86IHRhYjNcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RWRpdG9yVGFicy50YWJHcm91cHMuYWxsLm1hcChnID0+IGcudGFicykuZmxhdCgpLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGxbMF0/LnRhYnNbMV0/LmxhYmVsLCAnbGFiZWwzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGxbMF0/LnRhYnNbMF0/LmxhYmVsLCAnbGFiZWwyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGxbMF0/LnRhYnNbMl0/LmxhYmVsLCAnbGFiZWwxJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JlZmVyZW5jZSBzdGFiaWxpdHkgYWNyb3NzIGZ1bGwgbW9kZWwgcmVzeW5jJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgZXh0SG9zdEVkaXRvclRhYnMgPSBuZXcgRXh0SG9zdEVkaXRvclRhYnMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZEVkaXRvclRhYnNTaGFwZT4oKSB7XG5cdFx0XHRcdC8vIG92ZXJyaWRlL2ltcGxlbWVudCAkbW92ZVRhYiBvciAkY2xvc2VUYWJcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdGNvbnN0IHRhYkFBQSA9IGNyZWF0ZVRhYkR0byh7IGlkOiAnQUFBJywgbGFiZWw6ICdBQUEnLCBpc0FjdGl2ZTogdHJ1ZSwgaW5wdXQ6IHsga2luZDogVGFiSW5wdXRLaW5kLlRleHRJbnB1dCwgdXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly9hYmMvQUFBLnR4dCcpIH0gfSk7XG5cdFx0Y29uc3QgdGFiQkJCID0gY3JlYXRlVGFiRHRvKHsgaWQ6ICdCQkInLCBsYWJlbDogJ0JCQicsIGlzQWN0aXZlOiBmYWxzZSwgaW5wdXQ6IHsga2luZDogVGFiSW5wdXRLaW5kLlRleHRJbnB1dCwgdXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly9hYmMvQkJCLnR4dCcpIH0gfSk7XG5cblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0RWRpdG9yVGFiTW9kZWwoW3tcblx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0dmlld0NvbHVtbjogMCxcblx0XHRcdGdyb3VwSWQ6IDEyLFxuXHRcdFx0dGFiczogW3RhYkFBQSwgdGFiQkJCXVxuXHRcdH1dKTtcblxuXHRcdGNvbnN0IGdyb3VwQmVmb3JlID0gZXh0SG9zdEVkaXRvclRhYnMudGFiR3JvdXBzLmFsbFswXTtcblx0XHRjb25zdCB0YWJBQUFCZWZvcmUgPSBncm91cEJlZm9yZS50YWJzWzBdO1xuXHRcdGNvbnN0IHRhYkJCQkJlZm9yZSA9IGdyb3VwQmVmb3JlLnRhYnNbMV07XG5cblx0XHQvLyBBIHNlY29uZCBncm91cCBpcyBvcGVuZWQ6IHRoZSBleGlzdGluZyBtb2RlbCBpcyByZXNlbnQgd2hvbGVzYWxlLCBidXRcblx0XHQvLyB0aGUgc3Vydml2aW5nIGdyb3VwL3RhYiBvYmplY3RzIG11c3Qga2VlcCB0aGVpciBpZGVudGl0eSBzbyB0aGF0XG5cdFx0Ly8gZXh0ZW5zaW9ucyBrZXlpbmcgTWFwcy9XZWFrTWFwcyBieSB0aGVtIGtlZXAgd29ya2luZy5cblx0XHRleHRIb3N0RWRpdG9yVGFicy4kYWNjZXB0RWRpdG9yVGFiTW9kZWwoW1xuXHRcdFx0eyBpc0FjdGl2ZTogZmFsc2UsIHZpZXdDb2x1bW46IDAsIGdyb3VwSWQ6IDEyLCB0YWJzOiBbdGFiQUFBLCB0YWJCQkJdIH0sXG5cdFx0XHR7IGlzQWN0aXZlOiB0cnVlLCB2aWV3Q29sdW1uOiAxLCBncm91cElkOiAxMywgdGFiczogW10gfVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgZ3JvdXBBZnRlciA9IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwuZmluZChnID0+IGcudGFicy5sZW5ndGggPT09IDIpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBBZnRlciwgZ3JvdXBCZWZvcmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChncm91cEFmdGVyLnRhYnNbMF0sIHRhYkFBQUJlZm9yZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3VwQWZ0ZXIudGFic1sxXSwgdGFiQkJCQmVmb3JlKTtcblxuXHRcdC8vIEEgdGFiIGlzIGNsb3NlZCBkdXJpbmcgdGhlIHJlc3luYzogdGhlIHN1cnZpdm9yIGtlZXBzIGl0cyBpZGVudGl0eSxcblx0XHQvLyBhbmQgdGhlIHJlbW92ZWQgb25lIGRvZXMgbm90IHJlYXBwZWFyLlxuXHRcdGV4dEhvc3RFZGl0b3JUYWJzLiRhY2NlcHRFZGl0b3JUYWJNb2RlbChbXG5cdFx0XHR7IGlzQWN0aXZlOiBmYWxzZSwgdmlld0NvbHVtbjogMCwgZ3JvdXBJZDogMTIsIHRhYnM6IFt7IC4uLnRhYkFBQSwgaXNBY3RpdmU6IHRydWUgfV0gfSxcblx0XHRcdHsgaXNBY3RpdmU6IHRydWUsIHZpZXdDb2x1bW46IDEsIGdyb3VwSWQ6IDEzLCB0YWJzOiBbXSB9XG5cdFx0XSk7XG5cblx0XHRjb25zdCBzdXJ2aXZpbmdHcm91cCA9IGV4dEhvc3RFZGl0b3JUYWJzLnRhYkdyb3Vwcy5hbGwuZmluZChnID0+IGcudGFicy5sZW5ndGggPT09IDEpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3Vydml2aW5nR3JvdXAsIGdyb3VwQmVmb3JlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3Vydml2aW5nR3JvdXAudGFicy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdXJ2aXZpbmdHcm91cC50YWJzWzBdLCB0YWJBQUFCZWZvcmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdXJ2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
