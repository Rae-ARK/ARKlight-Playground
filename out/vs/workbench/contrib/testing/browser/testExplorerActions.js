import { distinct } from "../../../../base/common/arrays.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { isDefined } from "../../../../base/common/types.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { SymbolNavigationAction } from "../../../../editor/contrib/gotoSymbol/browser/goToCommands.js";
import { ReferencesModel } from "../../../../editor/contrib/gotoSymbol/browser/referencesModel.js";
import { MessageController } from "../../../../editor/contrib/message/browser/messageController.js";
import { PeekContext } from "../../../../editor/contrib/peekView/browser/peekView.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuId } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, ContextKeyGreaterExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { widgetClose } from "../../../../platform/theme/common/iconRegistry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ViewAction } from "../../../browser/parts/views/viewPane.js";
import { FocusedViewContext } from "../../../common/contextkeys.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { TestItemTreeElement } from "./explorerProjections/index.js";
import * as icons from "./icons.js";
import { TestCommandId, TestExplorerViewMode, TestExplorerViewSorting, Testing, testConfigurationGroupNames } from "../common/constants.js";
import { getTestingConfiguration, TestingConfigKeys, TestingResultsViewLayout } from "../common/configuration.js";
import { ITestCoverageService } from "../common/testCoverageService.js";
import { TestId } from "../common/testId.js";
import { ITestProfileService, canUseProfileWithTest } from "../common/testProfileService.js";
import { ITestResultService } from "../common/testResultService.js";
import { ITestService, expandAndGetTestById, testsInFile, testsUnderUri } from "../common/testService.js";
import { ExtTestRunProfileKind, TestItemExpandState, TestRunProfileBitset } from "../common/testTypes.js";
import { TestingContextKeys } from "../common/testingContextKeys.js";
import { ITestingContinuousRunService } from "../common/testingContinuousRunService.js";
import { ITestingPeekOpener } from "../common/testingPeekOpener.js";
import { isFailedState } from "../common/testingStates.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
const category = Categories.Test;
var ActionOrder = /* @__PURE__ */ ((ActionOrder2) => {
  ActionOrder2[ActionOrder2["Refresh"] = 10] = "Refresh";
  ActionOrder2[ActionOrder2["Run"] = 11] = "Run";
  ActionOrder2[ActionOrder2["Debug"] = 12] = "Debug";
  ActionOrder2[ActionOrder2["Coverage"] = 13] = "Coverage";
  ActionOrder2[ActionOrder2["RunContinuous"] = 14] = "RunContinuous";
  ActionOrder2[ActionOrder2["RunUsing"] = 15] = "RunUsing";
  ActionOrder2[ActionOrder2["Collapse"] = 16] = "Collapse";
  ActionOrder2[ActionOrder2["ClearResults"] = 17] = "ClearResults";
  ActionOrder2[ActionOrder2["DisplayMode"] = 18] = "DisplayMode";
  ActionOrder2[ActionOrder2["Sort"] = 19] = "Sort";
  ActionOrder2[ActionOrder2["GoToTest"] = 20] = "GoToTest";
  ActionOrder2[ActionOrder2["HideTest"] = 21] = "HideTest";
  ActionOrder2[ActionOrder2["ContinuousRunTest"] = 2147483647] = "ContinuousRunTest";
  return ActionOrder2;
})(ActionOrder || {});
const hasAnyTestProvider = ContextKeyGreaterExpr.create(TestingContextKeys.providerCount.key, 0);
const LABEL_RUN_TESTS = localize2("runSelectedTests", "Run Tests");
const LABEL_DEBUG_TESTS = localize2("debugSelectedTests", "Debug Tests");
const LABEL_COVERAGE_TESTS = localize2("coverageSelectedTests", "Run Tests with Coverage");
class HideTestAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.HideTestAction,
      title: localize2("hideTest", "Hide Test"),
      menu: {
        id: MenuId.TestItem,
        group: "builtin@2",
        when: TestingContextKeys.testItemIsHidden.isEqualTo(false)
      }
    });
  }
  run(accessor, ...elements) {
    const service = accessor.get(ITestService);
    for (const element of elements) {
      service.excluded.toggle(element.test, true);
    }
    return Promise.resolve();
  }
}
class UnhideTestAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.UnhideTestAction,
      title: localize2("unhideTest", "Unhide Test"),
      menu: {
        id: MenuId.TestItem,
        order: 21 /* HideTest */,
        when: TestingContextKeys.testItemIsHidden.isEqualTo(true)
      }
    });
  }
  run(accessor, ...elements) {
    const service = accessor.get(ITestService);
    for (const element of elements) {
      if (element instanceof TestItemTreeElement) {
        service.excluded.toggle(element.test, false);
      }
    }
    return Promise.resolve();
  }
}
class UnhideAllTestsAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.UnhideAllTestsAction,
      title: localize2("unhideAllTests", "Unhide All Tests")
    });
  }
  run(accessor) {
    const service = accessor.get(ITestService);
    service.excluded.clear();
    return Promise.resolve();
  }
}
const testItemInlineAndInContext = (order, when) => [
  {
    id: MenuId.TestItem,
    group: "inline",
    order,
    when
  },
  {
    id: MenuId.TestItem,
    group: "builtin@1",
    order,
    when
  }
];
class RunVisibleAction extends ViewAction {
  constructor(bitset, desc) {
    super({
      ...desc,
      viewId: Testing.ExplorerViewId
    });
    this.bitset = bitset;
  }
  /**
   * @override
   */
  runInView(accessor, view, ...elements) {
    const { include, exclude } = view.getTreeIncludeExclude(this.bitset, elements.map((e) => e.test));
    return accessor.get(ITestService).runTests({
      tests: include,
      exclude,
      group: this.bitset
    });
  }
}
class DebugAction extends RunVisibleAction {
  constructor() {
    super(TestRunProfileBitset.Debug, {
      id: TestCommandId.DebugAction,
      title: localize2("debug test", "Debug Test"),
      icon: icons.testingDebugIcon,
      menu: testItemInlineAndInContext(12 /* Debug */, TestingContextKeys.hasDebuggableTests.isEqualTo(true))
    });
  }
}
class CoverageAction extends RunVisibleAction {
  constructor() {
    super(TestRunProfileBitset.Coverage, {
      id: TestCommandId.RunWithCoverageAction,
      title: localize2("run with cover test", "Run Test with Coverage"),
      icon: icons.testingCoverageIcon,
      menu: testItemInlineAndInContext(13 /* Coverage */, TestingContextKeys.hasCoverableTests.isEqualTo(true))
    });
  }
}
class RunUsingProfileAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.RunUsingProfileAction,
      title: localize2("testing.runUsing", "Execute Using Profile..."),
      icon: icons.testingDebugIcon,
      menu: {
        id: MenuId.TestItem,
        order: 15 /* RunUsing */,
        group: "builtin@2",
        when: TestingContextKeys.hasNonDefaultProfile.isEqualTo(true)
      }
    });
  }
  async run(acessor, ...elements) {
    const commandService = acessor.get(ICommandService);
    const testService = acessor.get(ITestService);
    const profile = await commandService.executeCommand("vscode.pickTestProfile", {
      onlyForTest: elements[0].test
    });
    if (!profile) {
      return;
    }
    testService.runResolvedTests({
      group: profile.group,
      targets: [{
        profileId: profile.profileId,
        controllerId: profile.controllerId,
        testIds: elements.filter((t) => canUseProfileWithTest(profile, t.test)).map((t) => t.test.item.extId)
      }]
    });
  }
}
class RunAction extends RunVisibleAction {
  constructor() {
    super(TestRunProfileBitset.Run, {
      id: TestCommandId.RunAction,
      title: localize2("run test", "Run Test"),
      icon: icons.testingRunIcon,
      menu: testItemInlineAndInContext(11 /* Run */, TestingContextKeys.hasRunnableTests.isEqualTo(true))
    });
  }
}
class SelectDefaultTestProfiles extends Action2 {
  constructor() {
    super({
      id: TestCommandId.SelectDefaultTestProfiles,
      title: localize2("testing.selectDefaultTestProfiles", "Select Default Profile"),
      icon: icons.testingUpdateProfiles,
      category
    });
  }
  async run(acessor, onlyGroup) {
    const commands = acessor.get(ICommandService);
    const testProfileService = acessor.get(ITestProfileService);
    const profiles = await commands.executeCommand("vscode.pickMultipleTestProfiles", {
      showConfigureButtons: false,
      selected: testProfileService.getGroupDefaultProfiles(onlyGroup),
      onlyGroup
    });
    if (profiles?.length) {
      testProfileService.setGroupDefaultProfiles(onlyGroup, profiles);
    }
  }
}
class ContinuousRunTestAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.ToggleContinousRunForTest,
      title: localize2("testing.toggleContinuousRunOn", "Turn on Continuous Run"),
      icon: icons.testingTurnContinuousRunOn,
      precondition: ContextKeyExpr.or(
        TestingContextKeys.isContinuousModeOn.isEqualTo(true),
        TestingContextKeys.isParentRunningContinuously.isEqualTo(false)
      ),
      toggled: {
        condition: TestingContextKeys.isContinuousModeOn.isEqualTo(true),
        icon: icons.testingContinuousIsOn,
        title: localize("testing.toggleContinuousRunOff", "Turn off Continuous Run")
      },
      menu: testItemInlineAndInContext(2147483647 /* ContinuousRunTest */, TestingContextKeys.supportsContinuousRun.isEqualTo(true))
    });
  }
  async run(accessor, ...elements) {
    const crService = accessor.get(ITestingContinuousRunService);
    for (const element of elements) {
      const id = element.test.item.extId;
      if (crService.isSpecificallyEnabledFor(id)) {
        crService.stop(id);
        continue;
      }
      crService.start(TestRunProfileBitset.Run, id);
    }
  }
}
class ContinuousRunUsingProfileTestAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.ContinousRunUsingForTest,
      title: localize2("testing.startContinuousRunUsing", "Start Continous Run Using..."),
      icon: icons.testingDebugIcon,
      menu: [
        {
          id: MenuId.TestItem,
          order: 14 /* RunContinuous */,
          group: "builtin@2",
          when: ContextKeyExpr.and(
            TestingContextKeys.supportsContinuousRun.isEqualTo(true),
            TestingContextKeys.isContinuousModeOn.isEqualTo(false)
          )
        }
      ]
    });
  }
  async run(accessor, ...elements) {
    const crService = accessor.get(ITestingContinuousRunService);
    const profileService = accessor.get(ITestProfileService);
    const notificationService = accessor.get(INotificationService);
    const quickInputService = accessor.get(IQuickInputService);
    for (const element of elements) {
      const selected = await selectContinuousRunProfiles(
        crService,
        notificationService,
        quickInputService,
        [{ profiles: profileService.getControllerProfiles(element.test.controllerId) }]
      );
      if (selected.length) {
        crService.start(selected, element.test.item.extId);
      }
    }
  }
}
class ConfigureTestProfilesAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.ConfigureTestProfilesAction,
      title: localize2("testing.configureProfile", "Configure Test Profiles"),
      icon: icons.testingUpdateProfiles,
      f1: true,
      category,
      menu: {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.hasConfigurableProfile.isEqualTo(true)
      }
    });
  }
  async run(acessor, onlyGroup) {
    const commands = acessor.get(ICommandService);
    const testProfileService = acessor.get(ITestProfileService);
    const profile = await commands.executeCommand("vscode.pickTestProfile", {
      placeholder: localize("configureProfile", "Select a profile to update"),
      showConfigureButtons: false,
      onlyConfigurable: true,
      onlyGroup
    });
    if (profile) {
      testProfileService.configure(profile.controllerId, profile.profileId);
    }
  }
}
const continuousMenus = (whenIsContinuousOn) => [
  {
    id: MenuId.ViewTitle,
    group: "navigation",
    order: 15 /* RunUsing */,
    when: ContextKeyExpr.and(
      ContextKeyExpr.equals("view", Testing.ExplorerViewId),
      TestingContextKeys.supportsContinuousRun.isEqualTo(true),
      TestingContextKeys.isContinuousModeOn.isEqualTo(whenIsContinuousOn)
    )
  },
  {
    id: MenuId.CommandPalette,
    when: TestingContextKeys.supportsContinuousRun.isEqualTo(true)
  }
];
class StopContinuousRunAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.StopContinousRun,
      title: localize2("testing.stopContinuous", "Stop Continuous Run"),
      category,
      icon: icons.testingTurnContinuousRunOff,
      menu: continuousMenus(true)
    });
  }
  run(accessor) {
    accessor.get(ITestingContinuousRunService).stop();
  }
}
function selectContinuousRunProfiles(crs, notificationService, quickInputService, profilesToPickFrom) {
  const items = [];
  for (const { controller, profiles } of profilesToPickFrom) {
    for (const profile of profiles) {
      if (profile.supportsContinuousRun) {
        items.push({
          label: profile.label || controller?.label.get() || "",
          description: controller?.label.get(),
          profile
        });
      }
    }
  }
  if (items.length === 0) {
    notificationService.info(localize("testing.noProfiles", "No test continuous run-enabled profiles were found"));
    return Promise.resolve([]);
  }
  if (items.length === 1) {
    return Promise.resolve([items[0].profile]);
  }
  const qpItems = [];
  const selectedItems = [];
  const lastRun = crs.lastRunProfileIds;
  items.sort((a, b) => a.profile.group - b.profile.group || a.profile.controllerId.localeCompare(b.profile.controllerId) || a.label.localeCompare(b.label));
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i === 0 || items[i - 1].profile.group !== item.profile.group) {
      qpItems.push({ type: "separator", label: testConfigurationGroupNames[item.profile.group] });
    }
    qpItems.push(item);
    if (lastRun.has(item.profile.profileId)) {
      selectedItems.push(item);
    }
  }
  const disposables = new DisposableStore();
  const quickpick = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
  quickpick.title = localize("testing.selectContinuousProfiles", "Select profiles to run when files change:");
  quickpick.canSelectMany = true;
  quickpick.items = qpItems;
  quickpick.selectedItems = selectedItems;
  quickpick.show();
  return new Promise((resolve) => {
    disposables.add(quickpick.onDidAccept(() => {
      resolve(quickpick.selectedItems.map((i) => i.profile));
      disposables.dispose();
    }));
    disposables.add(quickpick.onDidHide(() => {
      resolve([]);
      disposables.dispose();
    }));
  });
}
class StartContinuousRunAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.StartContinousRun,
      title: localize2("testing.startContinuous", "Start Continuous Run"),
      category,
      icon: icons.testingTurnContinuousRunOn,
      menu: continuousMenus(false)
    });
  }
  async run(accessor) {
    const crs = accessor.get(ITestingContinuousRunService);
    const profileService = accessor.get(ITestProfileService);
    const lastRunProfiles = [...profileService.all()].flatMap((p) => p.profiles.filter((p2) => crs.lastRunProfileIds.has(p2.profileId)));
    if (lastRunProfiles.length) {
      return crs.start(lastRunProfiles);
    }
    const selected = await selectContinuousRunProfiles(crs, accessor.get(INotificationService), accessor.get(IQuickInputService), accessor.get(ITestProfileService).all());
    if (selected.length) {
      crs.start(selected);
    }
  }
}
class ExecuteSelectedAction extends ViewAction {
  constructor(options, group) {
    super({
      ...options,
      menu: [{
        id: MenuId.ViewTitle,
        order: group === TestRunProfileBitset.Run ? 11 /* Run */ : group === TestRunProfileBitset.Debug ? 12 /* Debug */ : 13 /* Coverage */,
        group: "navigation",
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("view", Testing.ExplorerViewId),
          TestingContextKeys.isRunning.isEqualTo(false),
          TestingContextKeys.capabilityToContextKey[group].isEqualTo(true)
        )
      }],
      category,
      viewId: Testing.ExplorerViewId
    });
    this.group = group;
  }
  /**
   * @override
   */
  runInView(accessor, view) {
    const { include, exclude } = view.getTreeIncludeExclude(this.group);
    return accessor.get(ITestService).runTests({ tests: include, exclude, group: this.group });
  }
}
class GetSelectedProfiles extends Action2 {
  constructor() {
    super({ id: TestCommandId.GetSelectedProfiles, title: localize2("getSelectedProfiles", "Get Selected Profiles") });
  }
  /**
   * @override
   */
  run(accessor) {
    const profiles = accessor.get(ITestProfileService);
    return [
      ...profiles.getGroupDefaultProfiles(TestRunProfileBitset.Run),
      ...profiles.getGroupDefaultProfiles(TestRunProfileBitset.Debug),
      ...profiles.getGroupDefaultProfiles(TestRunProfileBitset.Coverage)
    ].map((p) => ({
      controllerId: p.controllerId,
      label: p.label,
      kind: p.group & TestRunProfileBitset.Coverage ? ExtTestRunProfileKind.Coverage : p.group & TestRunProfileBitset.Debug ? ExtTestRunProfileKind.Debug : ExtTestRunProfileKind.Run
    }));
  }
}
class GetExplorerSelection extends ViewAction {
  constructor() {
    super({ id: TestCommandId.GetExplorerSelection, title: localize2("getExplorerSelection", "Get Explorer Selection"), viewId: Testing.ExplorerViewId });
  }
  /**
   * @override
   */
  runInView(_accessor, view) {
    const { include, exclude } = view.getTreeIncludeExclude(TestRunProfileBitset.Run, void 0, "selected");
    const mapper = (i) => i.item.extId;
    return { include: include.map(mapper), exclude: exclude.map(mapper) };
  }
}
class RunSelectedAction extends ExecuteSelectedAction {
  constructor() {
    super({
      id: TestCommandId.RunSelectedAction,
      title: LABEL_RUN_TESTS,
      icon: icons.testingRunAllIcon
    }, TestRunProfileBitset.Run);
  }
}
class DebugSelectedAction extends ExecuteSelectedAction {
  constructor() {
    super({
      id: TestCommandId.DebugSelectedAction,
      title: LABEL_DEBUG_TESTS,
      icon: icons.testingDebugAllIcon
    }, TestRunProfileBitset.Debug);
  }
}
class CoverageSelectedAction extends ExecuteSelectedAction {
  constructor() {
    super({
      id: TestCommandId.CoverageSelectedAction,
      title: LABEL_COVERAGE_TESTS,
      icon: icons.testingCoverageAllIcon
    }, TestRunProfileBitset.Coverage);
  }
}
const showDiscoveringWhile = (progress, task) => {
  return progress.withProgress(
    {
      location: ProgressLocation.Window,
      title: localize("discoveringTests", "Discovering Tests")
    },
    () => task
  );
};
class RunOrDebugAllTestsAction extends Action2 {
  constructor(options, group, noTestsFoundError) {
    super({
      ...options,
      category,
      menu: [{
        id: MenuId.CommandPalette,
        when: TestingContextKeys.capabilityToContextKey[group].isEqualTo(true)
      }]
    });
    this.group = group;
    this.noTestsFoundError = noTestsFoundError;
  }
  async run(accessor) {
    const testService = accessor.get(ITestService);
    const notifications = accessor.get(INotificationService);
    const roots = [...testService.collection.rootItems].filter((r) => r.children.size || r.expand === TestItemExpandState.Expandable || r.expand === TestItemExpandState.BusyExpanding);
    if (!roots.length) {
      notifications.info(this.noTestsFoundError);
      return;
    }
    await testService.runTests({ tests: roots, group: this.group });
  }
}
class RunAllAction extends RunOrDebugAllTestsAction {
  constructor() {
    super(
      {
        id: TestCommandId.RunAllAction,
        title: localize2("runAllTests", "Run All Tests"),
        icon: icons.testingRunAllIcon,
        keybinding: {
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyCode.KeyA)
        }
      },
      TestRunProfileBitset.Run,
      localize("noTestProvider", "No tests found in this workspace. You may need to install a test provider extension")
    );
  }
}
class DebugAllAction extends RunOrDebugAllTestsAction {
  constructor() {
    super(
      {
        id: TestCommandId.DebugAllAction,
        title: localize2("debugAllTests", "Debug All Tests"),
        icon: icons.testingDebugIcon,
        keybinding: {
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyA)
        }
      },
      TestRunProfileBitset.Debug,
      localize("noDebugTestProvider", "No debuggable tests found in this workspace. You may need to install a test provider extension")
    );
  }
}
class CoverageAllAction extends RunOrDebugAllTestsAction {
  constructor() {
    super(
      {
        id: TestCommandId.RunAllWithCoverageAction,
        title: localize2("runAllWithCoverage", "Run All Tests with Coverage"),
        icon: icons.testingCoverageIcon,
        keybinding: {
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA)
        }
      },
      TestRunProfileBitset.Coverage,
      localize("noCoverageTestProvider", "No tests with coverage runners found in this workspace. You may need to install a test provider extension")
    );
  }
}
class CancelTestRunAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CancelTestRunAction,
      title: localize2("testing.cancelRun", "Cancel Test Run"),
      icon: icons.testingCancelIcon,
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyX)
      },
      menu: [{
        id: MenuId.ViewTitle,
        order: 11 /* Run */,
        group: "navigation",
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("view", Testing.ExplorerViewId),
          ContextKeyExpr.equals(TestingContextKeys.isRunning.serialize(), true)
        )
      }, {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.isRunning
      }]
    });
  }
  /**
   * @override
   */
  async run(accessor, resultId, taskId) {
    const resultService = accessor.get(ITestResultService);
    const testService = accessor.get(ITestService);
    if (resultId) {
      testService.cancelTestRun(resultId, taskId);
    } else {
      for (const run of resultService.results) {
        if (!run.completedAt) {
          testService.cancelTestRun(run.id);
        }
      }
    }
  }
}
class TestingViewAsListAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.TestingViewAsListAction,
      viewId: Testing.ExplorerViewId,
      title: localize2("testing.viewAsList", "View as List"),
      toggled: TestingContextKeys.viewMode.isEqualTo(TestExplorerViewMode.List),
      menu: {
        id: MenuId.ViewTitle,
        order: 18 /* DisplayMode */,
        group: "viewAs",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }
    });
  }
  /**
   * @override
   */
  runInView(_accessor, view) {
    view.viewModel.viewMode = TestExplorerViewMode.List;
  }
}
class TestingViewAsTreeAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.TestingViewAsTreeAction,
      viewId: Testing.ExplorerViewId,
      title: localize2("testing.viewAsTree", "View as Tree"),
      toggled: TestingContextKeys.viewMode.isEqualTo(TestExplorerViewMode.Tree),
      menu: {
        id: MenuId.ViewTitle,
        order: 18 /* DisplayMode */,
        group: "viewAs",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }
    });
  }
  /**
   * @override
   */
  runInView(_accessor, view) {
    view.viewModel.viewMode = TestExplorerViewMode.Tree;
  }
}
class TestingSortByStatusAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.TestingSortByStatusAction,
      viewId: Testing.ExplorerViewId,
      title: localize2("testing.sortByStatus", "Sort by Status"),
      toggled: TestingContextKeys.viewSorting.isEqualTo(TestExplorerViewSorting.ByStatus),
      menu: {
        id: MenuId.ViewTitle,
        order: 19 /* Sort */,
        group: "sortBy",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }
    });
  }
  /**
   * @override
   */
  runInView(_accessor, view) {
    view.viewModel.viewSorting = TestExplorerViewSorting.ByStatus;
  }
}
class TestingSortByLocationAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.TestingSortByLocationAction,
      viewId: Testing.ExplorerViewId,
      title: localize2("testing.sortByLocation", "Sort by Location"),
      toggled: TestingContextKeys.viewSorting.isEqualTo(TestExplorerViewSorting.ByLocation),
      menu: {
        id: MenuId.ViewTitle,
        order: 19 /* Sort */,
        group: "sortBy",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }
    });
  }
  /**
   * @override
   */
  runInView(_accessor, view) {
    view.viewModel.viewSorting = TestExplorerViewSorting.ByLocation;
  }
}
class TestingSortByDurationAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.TestingSortByDurationAction,
      viewId: Testing.ExplorerViewId,
      title: localize2("testing.sortByDuration", "Sort by Duration"),
      toggled: TestingContextKeys.viewSorting.isEqualTo(TestExplorerViewSorting.ByDuration),
      menu: {
        id: MenuId.ViewTitle,
        order: 19 /* Sort */,
        group: "sortBy",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }
    });
  }
  /**
   * @override
   */
  runInView(_accessor, view) {
    view.viewModel.viewSorting = TestExplorerViewSorting.ByDuration;
  }
}
class ShowMostRecentOutputAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.ShowMostRecentOutputAction,
      title: localize2("testing.showMostRecentOutput", "Show Output"),
      category,
      icon: Codicon.terminal,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyO)
      },
      precondition: TestingContextKeys.hasAnyResults.isEqualTo(true),
      menu: [{
        id: MenuId.ViewTitle,
        order: 16 /* Collapse */,
        group: "navigation",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }, {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.hasAnyResults.isEqualTo(true)
      }]
    });
  }
  async run(accessor) {
    const viewService = accessor.get(IViewsService);
    const testView = await viewService.openView(Testing.ResultsViewId, true);
    testView?.showLatestRun();
  }
}
class CollapseAllAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.CollapseAllAction,
      viewId: Testing.ExplorerViewId,
      title: localize2("testing.collapseAll", "Collapse All Tests"),
      icon: Codicon.collapseAll,
      menu: {
        id: MenuId.ViewTitle,
        order: 16 /* Collapse */,
        group: "displayAction",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }
    });
  }
  /**
   * @override
   */
  runInView(_accessor, view) {
    view.viewModel.collapseAll();
  }
}
class ClearTestResultsAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.ClearTestResultsAction,
      title: localize2("testing.clearResults", "Clear All Results"),
      category,
      icon: Codicon.clearAll,
      menu: [{
        id: MenuId.TestPeekTitle
      }, {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.hasAnyResults.isEqualTo(true)
      }, {
        id: MenuId.ViewTitle,
        order: 17 /* ClearResults */,
        group: "displayAction",
        when: ContextKeyExpr.equals("view", Testing.ExplorerViewId)
      }, {
        id: MenuId.ViewTitle,
        order: 17 /* ClearResults */,
        group: "navigation",
        when: ContextKeyExpr.equals("view", Testing.ResultsViewId)
      }]
    });
  }
  /**
   * @override
   */
  run(accessor) {
    accessor.get(ITestResultService).clear();
  }
}
class GoToTest extends Action2 {
  constructor() {
    super({
      id: TestCommandId.GoToTest,
      title: localize2("testing.editFocusedTest", "Go to Test"),
      icon: Codicon.goToFile,
      menu: {
        id: MenuId.TestItem,
        group: "builtin@1",
        order: 20 /* GoToTest */,
        when: TestingContextKeys.testItemHasUri.isEqualTo(true)
      },
      keybinding: {
        weight: KeybindingWeight.EditorContrib - 10,
        when: FocusedViewContext.isEqualTo(Testing.ExplorerViewId),
        primary: KeyCode.Enter | KeyMod.Alt
      }
    });
  }
  async run(accessor, element, preserveFocus) {
    if (!element) {
      const view = accessor.get(IViewsService).getActiveViewWithId(Testing.ExplorerViewId);
      element = view?.focusedTreeElements[0];
    }
    if (element && element instanceof TestItemTreeElement) {
      accessor.get(ICommandService).executeCommand("vscode.revealTest", element.test.item.extId, preserveFocus);
    }
  }
}
async function getTestsAtCursor(testService, uriIdentityService, uri, position, filter) {
  let bestNodes = [];
  let bestRange;
  let bestNodesBefore = [];
  let bestRangeBefore;
  for await (const tests of testsInFile(testService, uriIdentityService, uri)) {
    for (const test of tests) {
      if (!test.item.range || filter?.(test) === false) {
        continue;
      }
      const irange = Range.lift(test.item.range);
      if (irange.containsPosition(position)) {
        if (bestRange && Range.equalsRange(test.item.range, bestRange)) {
          if (!bestNodes.some((b) => TestId.isChild(b.item.extId, test.item.extId))) {
            bestNodes.push(test);
          }
        } else {
          bestRange = irange;
          bestNodes = [test];
        }
      } else if (Position.isBefore(irange.getStartPosition(), position)) {
        if (!bestRangeBefore || bestRangeBefore.getStartPosition().isBefore(irange.getStartPosition())) {
          bestRangeBefore = irange;
          bestNodesBefore = [test];
        } else if (irange.equalsRange(bestRangeBefore) && !bestNodesBefore.some((b) => TestId.isChild(b.item.extId, test.item.extId))) {
          bestNodesBefore.push(test);
        }
      }
    }
  }
  return bestNodes.length ? bestNodes : bestNodesBefore;
}
var EditorContextOrder = /* @__PURE__ */ ((EditorContextOrder2) => {
  EditorContextOrder2[EditorContextOrder2["RunAtCursor"] = 0] = "RunAtCursor";
  EditorContextOrder2[EditorContextOrder2["DebugAtCursor"] = 1] = "DebugAtCursor";
  EditorContextOrder2[EditorContextOrder2["RunInFile"] = 2] = "RunInFile";
  EditorContextOrder2[EditorContextOrder2["DebugInFile"] = 3] = "DebugInFile";
  EditorContextOrder2[EditorContextOrder2["GoToRelated"] = 4] = "GoToRelated";
  EditorContextOrder2[EditorContextOrder2["PeekRelated"] = 5] = "PeekRelated";
  return EditorContextOrder2;
})(EditorContextOrder || {});
class ExecuteTestAtCursor extends Action2 {
  constructor(options, group) {
    super({
      ...options,
      menu: [{
        id: MenuId.CommandPalette,
        when: hasAnyTestProvider
      }, {
        id: MenuId.EditorContext,
        group: "testing",
        order: group === TestRunProfileBitset.Run ? 0 /* RunAtCursor */ : 1 /* DebugAtCursor */,
        when: ContextKeyExpr.and(TestingContextKeys.activeEditorHasTests, TestingContextKeys.capabilityToContextKey[group])
      }]
    });
    this.group = group;
  }
  /**
   * @override
   */
  async run(accessor) {
    const codeEditorService = accessor.get(ICodeEditorService);
    const editorService = accessor.get(IEditorService);
    const activeEditorPane = editorService.activeEditorPane;
    let editor = codeEditorService.getActiveCodeEditor();
    if (!activeEditorPane || !editor) {
      return;
    }
    if (editor instanceof EmbeddedCodeEditorWidget) {
      editor = editor.getParentEditor();
    }
    const position = editor?.getPosition();
    const model = editor?.getModel();
    if (!position || !model || !("uri" in model)) {
      return;
    }
    const testService = accessor.get(ITestService);
    const profileService = accessor.get(ITestProfileService);
    const uriIdentityService = accessor.get(IUriIdentityService);
    const progressService = accessor.get(IProgressService);
    const configurationService = accessor.get(IConfigurationService);
    const saveBeforeTest = getTestingConfiguration(configurationService, TestingConfigKeys.SaveBeforeTest);
    if (saveBeforeTest) {
      await editorService.save({ editor: activeEditorPane.input, groupId: activeEditorPane.group.id });
      await testService.syncTests();
    }
    const testsToRun = await showDiscoveringWhile(
      progressService,
      getTestsAtCursor(
        testService,
        uriIdentityService,
        model.uri,
        position,
        (test) => !!(profileService.capabilitiesForTest(test.item) & this.group)
      )
    );
    if (testsToRun.length) {
      await testService.runTests({ group: this.group, tests: testsToRun });
      return;
    }
    const relatedTests = await testService.getTestsRelatedToCode(model.uri, position);
    if (relatedTests.length) {
      await testService.runTests({ group: this.group, tests: relatedTests });
      return;
    }
    if (editor) {
      MessageController.get(editor)?.showMessage(localize("noTestsAtCursor", "No tests found here"), position);
    }
  }
}
class RunAtCursor extends ExecuteTestAtCursor {
  constructor() {
    super({
      id: TestCommandId.RunAtCursor,
      title: localize2("testing.runAtCursor", "Run Test at Cursor"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyCode.KeyC)
      }
    }, TestRunProfileBitset.Run);
  }
}
class DebugAtCursor extends ExecuteTestAtCursor {
  constructor() {
    super({
      id: TestCommandId.DebugAtCursor,
      title: localize2("testing.debugAtCursor", "Debug Test at Cursor"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyC)
      }
    }, TestRunProfileBitset.Debug);
  }
}
class CoverageAtCursor extends ExecuteTestAtCursor {
  constructor() {
    super({
      id: TestCommandId.CoverageAtCursor,
      title: localize2("testing.coverageAtCursor", "Run Test at Cursor with Coverage"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC)
      }
    }, TestRunProfileBitset.Coverage);
  }
}
class ExecuteTestsUnderUriAction extends Action2 {
  constructor(options, group) {
    super({
      ...options,
      menu: [{
        id: MenuId.ExplorerContext,
        when: TestingContextKeys.capabilityToContextKey[group].isEqualTo(true),
        group: "6.5_testing",
        order: (group === TestRunProfileBitset.Run ? 11 /* Run */ : 12 /* Debug */) + 0.1
      }]
    });
    this.group = group;
  }
  async run(accessor, uri) {
    const testService = accessor.get(ITestService);
    const notificationService = accessor.get(INotificationService);
    const tests = await Iterable.asyncToArray(testsUnderUri(
      testService,
      accessor.get(IUriIdentityService),
      uri
    ));
    if (!tests.length) {
      notificationService.notify({ message: localize("noTests", "No tests found in the selected file or folder"), severity: Severity.Info });
      return;
    }
    return testService.runTests({ tests, group: this.group });
  }
}
class RunTestsUnderUri extends ExecuteTestsUnderUriAction {
  constructor() {
    super({
      id: TestCommandId.RunByUri,
      title: LABEL_RUN_TESTS,
      category
    }, TestRunProfileBitset.Run);
  }
}
class DebugTestsUnderUri extends ExecuteTestsUnderUriAction {
  constructor() {
    super({
      id: TestCommandId.DebugByUri,
      title: LABEL_DEBUG_TESTS,
      category
    }, TestRunProfileBitset.Debug);
  }
}
class CoverageTestsUnderUri extends ExecuteTestsUnderUriAction {
  constructor() {
    super({
      id: TestCommandId.CoverageByUri,
      title: LABEL_COVERAGE_TESTS,
      category
    }, TestRunProfileBitset.Coverage);
  }
}
class ExecuteTestsInCurrentFile extends Action2 {
  constructor(options, group) {
    super({
      ...options,
      menu: [{
        id: MenuId.CommandPalette,
        when: TestingContextKeys.capabilityToContextKey[group].isEqualTo(true)
      }, {
        id: MenuId.EditorContext,
        group: "testing",
        order: group === TestRunProfileBitset.Run ? 2 /* RunInFile */ : 3 /* DebugInFile */,
        when: ContextKeyExpr.and(TestingContextKeys.activeEditorHasTests, TestingContextKeys.capabilityToContextKey[group])
      }]
    });
    this.group = group;
  }
  async _runByUris(accessor, files) {
    const uriIdentity = accessor.get(IUriIdentityService);
    const testService = accessor.get(ITestService);
    const discovered = [];
    for (const uri of files) {
      for await (const files2 of testsInFile(testService, uriIdentity, uri, void 0, true)) {
        for (const file of files2) {
          discovered.push(file);
        }
      }
    }
    if (discovered.length) {
      const r = await testService.runTests({ tests: discovered, group: this.group });
      return { completedAt: r.completedAt };
    }
    return { completedAt: void 0 };
  }
  /**
   * @override
   */
  run(accessor, files) {
    if (files?.length) {
      return this._runByUris(accessor, files);
    }
    const uriIdentity = accessor.get(IUriIdentityService);
    let editor = accessor.get(ICodeEditorService).getActiveCodeEditor();
    if (!editor) {
      return;
    }
    if (editor instanceof EmbeddedCodeEditorWidget) {
      editor = editor.getParentEditor();
    }
    const position = editor?.getPosition();
    const model = editor?.getModel();
    if (!position || !model || !("uri" in model)) {
      return;
    }
    const testService = accessor.get(ITestService);
    const queue = [testService.collection.rootIds];
    const discovered = [];
    while (queue.length) {
      for (const id of queue.pop()) {
        const node = testService.collection.getNodeById(id);
        if (uriIdentity.extUri.isEqual(node.item.uri, model.uri)) {
          discovered.push(node);
        } else {
          queue.push(node.children);
        }
      }
    }
    if (discovered.length) {
      return testService.runTests({
        tests: discovered,
        group: this.group
      });
    }
    if (editor) {
      MessageController.get(editor)?.showMessage(localize("noTestsInFile", "No tests found in this file"), position);
    }
    return void 0;
  }
}
class RunCurrentFile extends ExecuteTestsInCurrentFile {
  constructor() {
    super({
      id: TestCommandId.RunCurrentFile,
      title: localize2("testing.runCurrentFile", "Run Tests in Current File"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyCode.KeyF)
      }
    }, TestRunProfileBitset.Run);
  }
}
class DebugCurrentFile extends ExecuteTestsInCurrentFile {
  constructor() {
    super({
      id: TestCommandId.DebugCurrentFile,
      title: localize2("testing.debugCurrentFile", "Debug Tests in Current File"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyF)
      }
    }, TestRunProfileBitset.Debug);
  }
}
class CoverageCurrentFile extends ExecuteTestsInCurrentFile {
  constructor() {
    super({
      id: TestCommandId.CoverageCurrentFile,
      title: localize2("testing.coverageCurrentFile", "Run Tests with Coverage in Current File"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF)
      }
    }, TestRunProfileBitset.Coverage);
  }
}
const discoverAndRunTests = async (collection, progress, ids, runTests) => {
  const todo = Promise.all(ids.map((p) => expandAndGetTestById(collection, p)));
  const tests = (await showDiscoveringWhile(progress, todo)).filter(isDefined);
  return tests.length ? await runTests(tests) : void 0;
};
class RunOrDebugExtsByPath extends Action2 {
  /**
   * @override
   */
  async run(accessor, ...args) {
    const testService = accessor.get(ITestService);
    await discoverAndRunTests(
      accessor.get(ITestService).collection,
      accessor.get(IProgressService),
      [...this.getTestExtIdsToRun(accessor, ...args)],
      (tests) => this.runTest(testService, tests)
    );
  }
}
class RunOrDebugFailedTests extends RunOrDebugExtsByPath {
  constructor(options) {
    super({
      ...options,
      menu: {
        id: MenuId.CommandPalette,
        when: hasAnyTestProvider
      }
    });
  }
  /**
   * @inheritdoc
   */
  getTestExtIdsToRun(accessor) {
    const { results } = accessor.get(ITestResultService);
    const ids = /* @__PURE__ */ new Set();
    for (let i = results.length - 1; i >= 0; i--) {
      const resultSet = results[i];
      for (const test of resultSet.tests) {
        if (isFailedState(test.ownComputedState)) {
          ids.add(test.item.extId);
        } else {
          ids.delete(test.item.extId);
        }
      }
    }
    return ids;
  }
}
class RunOrDebugLastRun extends Action2 {
  constructor(options) {
    super({
      ...options,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(
          hasAnyTestProvider,
          TestingContextKeys.hasAnyResults.isEqualTo(true)
        )
      }
    });
  }
  getLastTestRunRequest(accessor, runId) {
    const resultService = accessor.get(ITestResultService);
    const lastResult = runId ? resultService.results.find((r) => r.id === runId) : resultService.results[0];
    return lastResult?.request;
  }
  /** @inheritdoc */
  async run(accessor, runId) {
    const resultService = accessor.get(ITestResultService);
    const lastResult = runId ? resultService.results.find((r) => r.id === runId) : resultService.results[0];
    if (!lastResult) {
      return;
    }
    const req = lastResult.request;
    const testService = accessor.get(ITestService);
    const profileService = accessor.get(ITestProfileService);
    const profileExists = (t) => profileService.getControllerProfiles(t.controllerId).some((p) => p.profileId === t.profileId);
    await discoverAndRunTests(
      testService.collection,
      accessor.get(IProgressService),
      req.targets.flatMap((t) => t.testIds),
      (tests) => {
        if (this.getGroup() & req.group && req.targets.every(profileExists)) {
          return testService.runResolvedTests({
            targets: req.targets,
            group: req.group,
            exclude: req.exclude
          });
        } else {
          return testService.runTests({ tests, group: this.getGroup() });
        }
      }
    );
  }
}
class ReRunFailedTests extends RunOrDebugFailedTests {
  constructor() {
    super({
      id: TestCommandId.ReRunFailedTests,
      title: localize2("testing.reRunFailTests", "Rerun Failed Tests"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyCode.KeyE)
      }
    });
  }
  runTest(service, internalTests) {
    return service.runTests({
      group: TestRunProfileBitset.Run,
      tests: internalTests
    });
  }
}
class DebugFailedTests extends RunOrDebugFailedTests {
  constructor() {
    super({
      id: TestCommandId.DebugFailedTests,
      title: localize2("testing.debugFailTests", "Debug Failed Tests"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyE)
      }
    });
  }
  runTest(service, internalTests) {
    return service.runTests({
      group: TestRunProfileBitset.Debug,
      tests: internalTests
    });
  }
}
class ReRunLastRun extends RunOrDebugLastRun {
  constructor() {
    super({
      id: TestCommandId.ReRunLastRun,
      title: localize2("testing.reRunLastRun", "Rerun Last Run"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyCode.KeyL)
      }
    });
  }
  getGroup() {
    return TestRunProfileBitset.Run;
  }
}
class DebugLastRun extends RunOrDebugLastRun {
  constructor() {
    super({
      id: TestCommandId.DebugLastRun,
      title: localize2("testing.debugLastRun", "Debug Last Run"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyL)
      }
    });
  }
  getGroup() {
    return TestRunProfileBitset.Debug;
  }
}
class CoverageLastRun extends RunOrDebugLastRun {
  constructor() {
    super({
      id: TestCommandId.CoverageLastRun,
      title: localize2("testing.coverageLastRun", "Rerun Last Run with Coverage"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL)
      }
    });
  }
  getGroup() {
    return TestRunProfileBitset.Coverage;
  }
}
class RunOrDebugFailedFromLastRun extends Action2 {
  constructor(options) {
    super({
      ...options,
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(
          hasAnyTestProvider,
          TestingContextKeys.hasAnyResults.isEqualTo(true)
        )
      }
    });
  }
  /** @inheritdoc */
  async run(accessor, runId) {
    const resultService = accessor.get(ITestResultService);
    const testService = accessor.get(ITestService);
    const progressService = accessor.get(IProgressService);
    const lastResult = runId ? resultService.results.find((r) => r.id === runId) : resultService.results[0];
    if (!lastResult) {
      return;
    }
    const failedTestIds = /* @__PURE__ */ new Set();
    for (const test of lastResult.tests) {
      if (isFailedState(test.ownComputedState)) {
        failedTestIds.add(test.item.extId);
      }
    }
    if (failedTestIds.size === 0) {
      return;
    }
    await discoverAndRunTests(
      testService.collection,
      progressService,
      Array.from(failedTestIds),
      (tests) => testService.runTests({ tests, group: this.getGroup() })
    );
  }
}
class ReRunFailedFromLastRun extends RunOrDebugFailedFromLastRun {
  constructor() {
    super({
      id: TestCommandId.ReRunFailedFromLastRun,
      title: localize2("testing.reRunFailedFromLastRun", "Rerun Failed Tests from Last Run"),
      category
    });
  }
  getGroup() {
    return TestRunProfileBitset.Run;
  }
}
class DebugFailedFromLastRun extends RunOrDebugFailedFromLastRun {
  constructor() {
    super({
      id: TestCommandId.DebugFailedFromLastRun,
      title: localize2("testing.debugFailedFromLastRun", "Debug Failed Tests from Last Run"),
      category
    });
  }
  getGroup() {
    return TestRunProfileBitset.Debug;
  }
}
class SearchForTestExtension extends Action2 {
  constructor() {
    super({
      id: TestCommandId.SearchForTestExtension,
      title: localize2("testing.searchForTestExtension", "Search for Test Extension")
    });
  }
  async run(accessor) {
    accessor.get(IExtensionsWorkbenchService).openSearch('@category:"testing"');
  }
}
class OpenOutputPeek extends Action2 {
  constructor() {
    super({
      id: TestCommandId.OpenOutputPeek,
      title: localize2("testing.openOutputPeek", "Peek Output"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyM)
      },
      menu: {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.hasAnyResults.isEqualTo(true)
      }
    });
  }
  async run(accessor) {
    accessor.get(ITestingPeekOpener).open();
  }
}
class ToggleInlineTestOutput extends Action2 {
  constructor() {
    super({
      id: TestCommandId.ToggleInlineTestOutput,
      title: localize2("testing.toggleInlineTestOutput", "Toggle Inline Test Output"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyI)
      },
      menu: {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.hasAnyResults.isEqualTo(true)
      }
    });
  }
  async run(accessor) {
    const testService = accessor.get(ITestService);
    testService.showInlineOutput.value = !testService.showInlineOutput.value;
  }
}
const refreshMenus = (whenIsRefreshing) => [
  {
    id: MenuId.TestItem,
    group: "inline",
    order: 10 /* Refresh */,
    when: ContextKeyExpr.and(
      TestingContextKeys.canRefreshTests.isEqualTo(true),
      TestingContextKeys.isRefreshingTests.isEqualTo(whenIsRefreshing)
    )
  },
  {
    id: MenuId.ViewTitle,
    group: "navigation",
    order: 10 /* Refresh */,
    when: ContextKeyExpr.and(
      ContextKeyExpr.equals("view", Testing.ExplorerViewId),
      TestingContextKeys.canRefreshTests.isEqualTo(true),
      TestingContextKeys.isRefreshingTests.isEqualTo(whenIsRefreshing)
    )
  },
  {
    id: MenuId.CommandPalette,
    when: TestingContextKeys.canRefreshTests.isEqualTo(true)
  }
];
class RefreshTestsAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.RefreshTestsAction,
      title: localize2("testing.refreshTests", "Refresh Tests"),
      category,
      icon: icons.testingRefreshTests,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyCode.KeyR),
        when: TestingContextKeys.canRefreshTests.isEqualTo(true)
      },
      menu: refreshMenus(false)
    });
  }
  async run(accessor, ...elements) {
    const testService = accessor.get(ITestService);
    const progressService = accessor.get(IProgressService);
    const controllerIds = distinct(elements.filter(isDefined).map((e) => e.test.controllerId));
    return progressService.withProgress({ location: Testing.ViewletId }, async () => {
      if (controllerIds.length) {
        await Promise.all(controllerIds.map((id) => testService.refreshTests(id)));
      } else {
        await testService.refreshTests();
      }
    });
  }
}
class CancelTestRefreshAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CancelTestRefreshAction,
      title: localize2("testing.cancelTestRefresh", "Cancel Test Refresh"),
      category,
      icon: icons.testingCancelRefreshTests,
      menu: refreshMenus(true)
    });
  }
  async run(accessor) {
    accessor.get(ITestService).cancelRefreshTests();
  }
}
class CleareCoverage extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CoverageClear,
      title: localize2("testing.clearCoverage", "Clear Coverage"),
      icon: widgetClose,
      category,
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 10 /* Refresh */,
        when: ContextKeyExpr.equals("view", Testing.CoverageViewId)
      }, {
        id: MenuId.CommandPalette,
        when: TestingContextKeys.isTestCoverageOpen.isEqualTo(true)
      }]
    });
  }
  run(accessor) {
    accessor.get(ITestCoverageService).closeCoverage();
  }
}
class OpenCoverage extends Action2 {
  constructor() {
    super({
      id: TestCommandId.OpenCoverage,
      title: localize2("testing.openCoverage", "Open Coverage"),
      category,
      menu: [{
        id: MenuId.CommandPalette,
        when: TestingContextKeys.hasAnyResults.isEqualTo(true)
      }]
    });
  }
  run(accessor) {
    const results = accessor.get(ITestResultService).results;
    const task = results.length && results[0].tasks.find((r) => r.coverage);
    if (!task) {
      const notificationService = accessor.get(INotificationService);
      notificationService.info(localize("testing.noCoverage", "No coverage information available on the last test run."));
      return;
    }
    accessor.get(ITestCoverageService).openCoverage(task, true);
  }
}
class TestNavigationAction extends SymbolNavigationAction {
  runEditorCommand(accessor, editor, ...args) {
    this.testService = accessor.get(ITestService);
    this.uriIdentityService = accessor.get(IUriIdentityService);
    return super.runEditorCommand(accessor, editor, ...args);
  }
  _getAlternativeCommand(editor) {
    return editor.getOption(EditorOption.gotoLocation).alternativeTestsCommand;
  }
  _getGoToPreference(editor) {
    return editor.getOption(EditorOption.gotoLocation).multipleTests || "peek";
  }
}
class GoToRelatedTestAction extends TestNavigationAction {
  async _getLocationModel(_languageFeaturesService, model, position, token) {
    const tests = await this.testService.getTestsRelatedToCode(model.uri, position, token);
    return new ReferencesModel(
      tests.map((t) => t.item.uri && { uri: t.item.uri, range: t.item.range || new Range(1, 1, 1, 1) }).filter(isDefined),
      localize("relatedTests", "Related Tests")
    );
  }
  _getNoResultFoundMessage() {
    return localize("noTestFound", "No related tests found.");
  }
}
class GoToRelatedTest extends GoToRelatedTestAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: false,
      muteMessage: false
    }, {
      id: TestCommandId.GoToRelatedTest,
      title: localize2("testing.goToRelatedTest", "Go to Related Test"),
      category,
      precondition: ContextKeyExpr.and(
        // todo@connor4312: make this more explicit based on cursor position
        ContextKeyExpr.not(TestingContextKeys.activeEditorHasTests.key),
        TestingContextKeys.canGoToRelatedTest
      ),
      menu: [{
        id: MenuId.EditorContext,
        group: "testing",
        order: 4 /* GoToRelated */
      }]
    });
  }
}
class PeekRelatedTest extends GoToRelatedTestAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: true,
      muteMessage: false
    }, {
      id: TestCommandId.PeekRelatedTest,
      title: localize2("testing.peekToRelatedTest", "Peek Related Test"),
      category,
      precondition: ContextKeyExpr.and(
        TestingContextKeys.canGoToRelatedTest,
        // todo@connor4312: make this more explicit based on cursor position
        ContextKeyExpr.not(TestingContextKeys.activeEditorHasTests.key),
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      menu: [{
        id: MenuId.EditorContext,
        group: "testing",
        order: 5 /* PeekRelated */
      }]
    });
  }
}
class GoToRelatedCodeAction extends TestNavigationAction {
  async _getLocationModel(_languageFeaturesService, model, position, token) {
    const testsAtCursor = await getTestsAtCursor(this.testService, this.uriIdentityService, model.uri, position);
    const code = await Promise.all(testsAtCursor.map((t) => this.testService.getCodeRelatedToTest(t)));
    return new ReferencesModel(code.flat(), localize("relatedCode", "Related Code"));
  }
  _getNoResultFoundMessage() {
    return localize("noRelatedCode", "No related code found.");
  }
}
class GoToRelatedCode extends GoToRelatedCodeAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: false,
      muteMessage: false
    }, {
      id: TestCommandId.GoToRelatedCode,
      title: localize2("testing.goToRelatedCode", "Go to Related Code"),
      category,
      precondition: ContextKeyExpr.and(
        TestingContextKeys.activeEditorHasTests,
        TestingContextKeys.canGoToRelatedCode
      ),
      menu: [{
        id: MenuId.EditorContext,
        group: "testing",
        order: 4 /* GoToRelated */
      }]
    });
  }
}
class PeekRelatedCode extends GoToRelatedCodeAction {
  constructor() {
    super({
      openToSide: false,
      openInPeek: true,
      muteMessage: false
    }, {
      id: TestCommandId.PeekRelatedCode,
      title: localize2("testing.peekToRelatedCode", "Peek Related Code"),
      category,
      precondition: ContextKeyExpr.and(
        TestingContextKeys.activeEditorHasTests,
        TestingContextKeys.canGoToRelatedCode,
        PeekContext.notInPeekEditor,
        EditorContextKeys.isInEmbeddedEditor.toNegated()
      ),
      menu: [{
        id: MenuId.EditorContext,
        group: "testing",
        order: 5 /* PeekRelated */
      }]
    });
  }
}
class ToggleResultsViewLayoutAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.ToggleResultsViewLayoutAction,
      title: localize2("testing.toggleResultsViewLayout", "Toggle Tree Position"),
      category,
      icon: Codicon.arrowSwap,
      menu: {
        id: MenuId.ViewTitle,
        order: 18 /* DisplayMode */,
        group: "navigation",
        when: ContextKeyExpr.equals("view", Testing.ResultsViewId)
      }
    });
  }
  async run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    const currentLayout = getTestingConfiguration(configurationService, TestingConfigKeys.ResultsViewLayout);
    const newLayout = currentLayout === TestingResultsViewLayout.TreeLeft ? TestingResultsViewLayout.TreeRight : TestingResultsViewLayout.TreeLeft;
    await configurationService.updateValue(TestingConfigKeys.ResultsViewLayout, newLayout);
  }
}
const allTestActions = [
  CancelTestRefreshAction,
  CancelTestRunAction,
  CleareCoverage,
  ClearTestResultsAction,
  CollapseAllAction,
  ConfigureTestProfilesAction,
  ContinuousRunTestAction,
  ContinuousRunUsingProfileTestAction,
  CoverageAction,
  CoverageAllAction,
  CoverageAtCursor,
  CoverageCurrentFile,
  CoverageLastRun,
  CoverageSelectedAction,
  CoverageTestsUnderUri,
  DebugAction,
  DebugAllAction,
  DebugAtCursor,
  DebugCurrentFile,
  DebugFailedTests,
  DebugLastRun,
  DebugSelectedAction,
  DebugTestsUnderUri,
  GetExplorerSelection,
  GetSelectedProfiles,
  GoToRelatedCode,
  GoToRelatedTest,
  GoToTest,
  HideTestAction,
  OpenCoverage,
  OpenOutputPeek,
  PeekRelatedCode,
  PeekRelatedTest,
  RefreshTestsAction,
  ReRunFailedTests,
  ReRunLastRun,
  RunAction,
  RunAllAction,
  RunAtCursor,
  RunCurrentFile,
  RunSelectedAction,
  RunTestsUnderUri,
  RunUsingProfileAction,
  SearchForTestExtension,
  SelectDefaultTestProfiles,
  ShowMostRecentOutputAction,
  StartContinuousRunAction,
  StopContinuousRunAction,
  TestingSortByDurationAction,
  TestingSortByLocationAction,
  TestingSortByStatusAction,
  TestingViewAsListAction,
  TestingViewAsTreeAction,
  ToggleInlineTestOutput,
  ToggleResultsViewLayoutAction,
  UnhideAllTestsAction,
  UnhideTestAction,
  ReRunFailedFromLastRun,
  DebugFailedFromLastRun
];
export {
  CancelTestRefreshAction,
  CancelTestRunAction,
  ClearTestResultsAction,
  CleareCoverage,
  CollapseAllAction,
  ConfigureTestProfilesAction,
  ContinuousRunTestAction,
  ContinuousRunUsingProfileTestAction,
  CoverageAction,
  CoverageAllAction,
  CoverageAtCursor,
  CoverageCurrentFile,
  CoverageLastRun,
  CoverageSelectedAction,
  DebugAction,
  DebugAllAction,
  DebugAtCursor,
  DebugCurrentFile,
  DebugFailedFromLastRun,
  DebugFailedTests,
  DebugLastRun,
  DebugSelectedAction,
  GetExplorerSelection,
  GetSelectedProfiles,
  GoToTest,
  HideTestAction,
  OpenCoverage,
  OpenOutputPeek,
  ReRunFailedFromLastRun,
  ReRunFailedTests,
  ReRunLastRun,
  RefreshTestsAction,
  RunAction,
  RunAllAction,
  RunAtCursor,
  RunCurrentFile,
  RunSelectedAction,
  RunUsingProfileAction,
  SearchForTestExtension,
  SelectDefaultTestProfiles,
  ShowMostRecentOutputAction,
  TestingSortByDurationAction,
  TestingSortByLocationAction,
  TestingSortByStatusAction,
  TestingViewAsListAction,
  TestingViewAsTreeAction,
  ToggleInlineTestOutput,
  ToggleResultsViewLayoutAction,
  UnhideAllTestsAction,
  UnhideTestAction,
  allTestActions,
  discoverAndRunTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvYnJvd3Nlci90ZXN0RXhwbG9yZXJBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZUNvZGVFZGl0b3IsIElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9lbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uLCBHb1RvTG9jYXRpb25WYWx1ZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBTeW1ib2xOYXZpZ2F0aW9uQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZ290b1N5bWJvbC9icm93c2VyL2dvVG9Db21tYW5kcy5qcyc7XG5pbXBvcnQgeyBSZWZlcmVuY2VzTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9nb3RvU3ltYm9sL2Jyb3dzZXIvcmVmZXJlbmNlc01vZGVsLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvbWVzc2FnZS9icm93c2VyL21lc3NhZ2VDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IFBlZWtDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcGVla1ZpZXcvYnJvd3Nlci9wZWVrVmlldy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSUFjdGlvbjJPcHRpb25zLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBDb250ZXh0S2V5RXhwcmVzc2lvbiwgQ29udGV4dEtleUdyZWF0ZXJFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IHdpZGdldENsb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IFZpZXdBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IEZvY3VzZWRWaWV3Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFRlc3RFeHBsb3JlclRyZWVFbGVtZW50LCBUZXN0SXRlbVRyZWVFbGVtZW50IH0gZnJvbSAnLi9leHBsb3JlclByb2plY3Rpb25zL2luZGV4LmpzJztcbmltcG9ydCAqIGFzIGljb25zIGZyb20gJy4vaWNvbnMuanMnO1xuaW1wb3J0IHsgVGVzdGluZ0V4cGxvcmVyVmlldyB9IGZyb20gJy4vdGVzdGluZ0V4cGxvcmVyVmlldy5qcyc7XG5pbXBvcnQgeyBUZXN0UmVzdWx0c1ZpZXcgfSBmcm9tICcuL3Rlc3RpbmdPdXRwdXRQZWVrLmpzJztcbmltcG9ydCB7IFRlc3RDb21tYW5kSWQsIFRlc3RFeHBsb3JlclZpZXdNb2RlLCBUZXN0RXhwbG9yZXJWaWV3U29ydGluZywgVGVzdGluZywgdGVzdENvbmZpZ3VyYXRpb25Hcm91cE5hbWVzIH0gZnJvbSAnLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbiwgVGVzdGluZ0NvbmZpZ0tleXMsIFRlc3RpbmdSZXN1bHRzVmlld0xheW91dCB9IGZyb20gJy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElUZXN0Q292ZXJhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RDb3ZlcmFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdElkIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RJZC5qcyc7XG5pbXBvcnQgeyBJVGVzdFByb2ZpbGVTZXJ2aWNlLCBjYW5Vc2VQcm9maWxlV2l0aFRlc3QgfSBmcm9tICcuLi9jb21tb24vdGVzdFByb2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0UmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSZXN1bHQuanMnO1xuaW1wb3J0IHsgSVRlc3RSZXN1bHRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSZXN1bHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYWluVGhyZWFkVGVzdENvbGxlY3Rpb24sIElNYWluVGhyZWFkVGVzdENvbnRyb2xsZXIsIElUZXN0U2VydmljZSwgZXhwYW5kQW5kR2V0VGVzdEJ5SWQsIHRlc3RzSW5GaWxlLCB0ZXN0c1VuZGVyVXJpIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dFRlc3RSdW5Qcm9maWxlS2luZCwgSVRlc3RSdW5Qcm9maWxlLCBJbnRlcm5hbFRlc3RJdGVtLCBUZXN0SXRlbUV4cGFuZFN0YXRlLCBUZXN0UnVuUHJvZmlsZUJpdHNldCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0VHlwZXMuanMnO1xuaW1wb3J0IHsgVGVzdGluZ0NvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RpbmdDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJVGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RpbmdDb250aW51b3VzUnVuU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVzdGluZ1BlZWtPcGVuZXIgfSBmcm9tICcuLi9jb21tb24vdGVzdGluZ1BlZWtPcGVuZXIuanMnO1xuaW1wb3J0IHsgaXNGYWlsZWRTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi90ZXN0aW5nU3RhdGVzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcblxuY29uc3QgY2F0ZWdvcnkgPSBDYXRlZ29yaWVzLlRlc3Q7XG5cbmNvbnN0IGVudW0gQWN0aW9uT3JkZXIge1xuXHQvLyBOYXZpZ2F0aW9uOlxuXHRSZWZyZXNoID0gMTAsXG5cdFJ1bixcblx0RGVidWcsXG5cdENvdmVyYWdlLFxuXHRSdW5Db250aW51b3VzLFxuXHRSdW5Vc2luZyxcblxuXHQvLyBTdWJtZW51OlxuXHRDb2xsYXBzZSxcblx0Q2xlYXJSZXN1bHRzLFxuXHREaXNwbGF5TW9kZSxcblx0U29ydCxcblx0R29Ub1Rlc3QsXG5cdEhpZGVUZXN0LFxuXHRDb250aW51b3VzUnVuVGVzdCA9IC0xID4+PiAxLCAvLyBtYXggaW50LCBhbHdheXMgYXQgdGhlIGVuZCB0byBhdm9pZCBzaGlmdGluZyBvbiBob3ZlclxufVxuXG5jb25zdCBoYXNBbnlUZXN0UHJvdmlkZXIgPSBDb250ZXh0S2V5R3JlYXRlckV4cHIuY3JlYXRlKFRlc3RpbmdDb250ZXh0S2V5cy5wcm92aWRlckNvdW50LmtleSwgMCk7XG5cbmNvbnN0IExBQkVMX1JVTl9URVNUUyA9IGxvY2FsaXplMigncnVuU2VsZWN0ZWRUZXN0cycsIFwiUnVuIFRlc3RzXCIpO1xuY29uc3QgTEFCRUxfREVCVUdfVEVTVFMgPSBsb2NhbGl6ZTIoJ2RlYnVnU2VsZWN0ZWRUZXN0cycsIFwiRGVidWcgVGVzdHNcIik7XG5jb25zdCBMQUJFTF9DT1ZFUkFHRV9URVNUUyA9IGxvY2FsaXplMignY292ZXJhZ2VTZWxlY3RlZFRlc3RzJywgXCJSdW4gVGVzdHMgd2l0aCBDb3ZlcmFnZVwiKTtcblxuZXhwb3J0IGNsYXNzIEhpZGVUZXN0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkhpZGVUZXN0QWN0aW9uLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaGlkZVRlc3QnLCAnSGlkZSBUZXN0JyksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVzdEl0ZW0sXG5cdFx0XHRcdGdyb3VwOiAnYnVpbHRpbkAyJyxcblx0XHRcdFx0d2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLnRlc3RJdGVtSXNIaWRkZW4uaXNFcXVhbFRvKGZhbHNlKVxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmVsZW1lbnRzOiBUZXN0SXRlbVRyZWVFbGVtZW50W10pIHtcblx0XHRjb25zdCBzZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXN0U2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzKSB7XG5cdFx0XHRzZXJ2aWNlLmV4Y2x1ZGVkLnRvZ2dsZShlbGVtZW50LnRlc3QsIHRydWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFVuaGlkZVRlc3RBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuVW5oaWRlVGVzdEFjdGlvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3VuaGlkZVRlc3QnLCAnVW5oaWRlIFRlc3QnKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXN0SXRlbSxcblx0XHRcdFx0b3JkZXI6IEFjdGlvbk9yZGVyLkhpZGVUZXN0LFxuXHRcdFx0XHR3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMudGVzdEl0ZW1Jc0hpZGRlbi5pc0VxdWFsVG8odHJ1ZSlcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5lbGVtZW50czogSW50ZXJuYWxUZXN0SXRlbVtdKSB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFNlcnZpY2UpO1xuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBlbGVtZW50cykge1xuXHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0SXRlbVRyZWVFbGVtZW50KSB7XG5cdFx0XHRcdHNlcnZpY2UuZXhjbHVkZWQudG9nZ2xlKGVsZW1lbnQudGVzdCwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFVuaGlkZUFsbFRlc3RzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlVuaGlkZUFsbFRlc3RzQWN0aW9uLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndW5oaWRlQWxsVGVzdHMnLCAnVW5oaWRlIEFsbCBUZXN0cycpLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKTtcblx0XHRzZXJ2aWNlLmV4Y2x1ZGVkLmNsZWFyKCk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG59XG5cbmNvbnN0IHRlc3RJdGVtSW5saW5lQW5kSW5Db250ZXh0ID0gKG9yZGVyOiBBY3Rpb25PcmRlciwgd2hlbj86IENvbnRleHRLZXlFeHByZXNzaW9uKSA9PiBbXG5cdHtcblx0XHRpZDogTWVudUlkLlRlc3RJdGVtLFxuXHRcdGdyb3VwOiAnaW5saW5lJyxcblx0XHRvcmRlcixcblx0XHR3aGVuLFxuXHR9LCB7XG5cdFx0aWQ6IE1lbnVJZC5UZXN0SXRlbSxcblx0XHRncm91cDogJ2J1aWx0aW5AMScsXG5cdFx0b3JkZXIsXG5cdFx0d2hlbixcblx0fVxuXTtcblxuYWJzdHJhY3QgY2xhc3MgUnVuVmlzaWJsZUFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248VGVzdGluZ0V4cGxvcmVyVmlldz4ge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGJpdHNldDogVGVzdFJ1blByb2ZpbGVCaXRzZXQsIGRlc2M6IFJlYWRvbmx5PElBY3Rpb24yT3B0aW9ucz4pIHtcblx0XHRzdXBlcih7XG5cdFx0XHQuLi5kZXNjLFxuXHRcdFx0dmlld0lkOiBUZXN0aW5nLkV4cGxvcmVyVmlld0lkLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHVibGljIHJ1bkluVmlldyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogVGVzdGluZ0V4cGxvcmVyVmlldywgLi4uZWxlbWVudHM6IFRlc3RJdGVtVHJlZUVsZW1lbnRbXSk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdGNvbnN0IHsgaW5jbHVkZSwgZXhjbHVkZSB9ID0gdmlldy5nZXRUcmVlSW5jbHVkZUV4Y2x1ZGUodGhpcy5iaXRzZXQsIGVsZW1lbnRzLm1hcChlID0+IGUudGVzdCkpO1xuXHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKS5ydW5UZXN0cyh7XG5cdFx0XHR0ZXN0czogaW5jbHVkZSxcblx0XHRcdGV4Y2x1ZGUsXG5cdFx0XHRncm91cDogdGhpcy5iaXRzZXQsXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlYnVnQWN0aW9uIGV4dGVuZHMgUnVuVmlzaWJsZUFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnLCB7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5EZWJ1Z0FjdGlvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2RlYnVnIHRlc3QnLCAnRGVidWcgVGVzdCcpLFxuXHRcdFx0aWNvbjogaWNvbnMudGVzdGluZ0RlYnVnSWNvbixcblx0XHRcdG1lbnU6IHRlc3RJdGVtSW5saW5lQW5kSW5Db250ZXh0KEFjdGlvbk9yZGVyLkRlYnVnLCBUZXN0aW5nQ29udGV4dEtleXMuaGFzRGVidWdnYWJsZVRlc3RzLmlzRXF1YWxUbyh0cnVlKSksXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvdmVyYWdlQWN0aW9uIGV4dGVuZHMgUnVuVmlzaWJsZUFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFRlc3RSdW5Qcm9maWxlQml0c2V0LkNvdmVyYWdlLCB7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5SdW5XaXRoQ292ZXJhZ2VBY3Rpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdydW4gd2l0aCBjb3ZlciB0ZXN0JywgJ1J1biBUZXN0IHdpdGggQ292ZXJhZ2UnKSxcblx0XHRcdGljb246IGljb25zLnRlc3RpbmdDb3ZlcmFnZUljb24sXG5cdFx0XHRtZW51OiB0ZXN0SXRlbUlubGluZUFuZEluQ29udGV4dChBY3Rpb25PcmRlci5Db3ZlcmFnZSwgVGVzdGluZ0NvbnRleHRLZXlzLmhhc0NvdmVyYWJsZVRlc3RzLmlzRXF1YWxUbyh0cnVlKSksXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJ1blVzaW5nUHJvZmlsZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5SdW5Vc2luZ1Byb2ZpbGVBY3Rpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnJ1blVzaW5nJywgJ0V4ZWN1dGUgVXNpbmcgUHJvZmlsZS4uLicpLFxuXHRcdFx0aWNvbjogaWNvbnMudGVzdGluZ0RlYnVnSWNvbixcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXN0SXRlbSxcblx0XHRcdFx0b3JkZXI6IEFjdGlvbk9yZGVyLlJ1blVzaW5nLFxuXHRcdFx0XHRncm91cDogJ2J1aWx0aW5AMicsXG5cdFx0XHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5oYXNOb25EZWZhdWx0UHJvZmlsZS5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5lbGVtZW50czogVGVzdEl0ZW1UcmVlRWxlbWVudFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gYWNlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9maWxlOiBJVGVzdFJ1blByb2ZpbGUgfCB1bmRlZmluZWQgPSBhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgndnNjb2RlLnBpY2tUZXN0UHJvZmlsZScsIHtcblx0XHRcdG9ubHlGb3JUZXN0OiBlbGVtZW50c1swXS50ZXN0LFxuXHRcdH0pO1xuXHRcdGlmICghcHJvZmlsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRlc3RTZXJ2aWNlLnJ1blJlc29sdmVkVGVzdHMoe1xuXHRcdFx0Z3JvdXA6IHByb2ZpbGUuZ3JvdXAsXG5cdFx0XHR0YXJnZXRzOiBbe1xuXHRcdFx0XHRwcm9maWxlSWQ6IHByb2ZpbGUucHJvZmlsZUlkLFxuXHRcdFx0XHRjb250cm9sbGVySWQ6IHByb2ZpbGUuY29udHJvbGxlcklkLFxuXHRcdFx0XHR0ZXN0SWRzOiBlbGVtZW50cy5maWx0ZXIodCA9PiBjYW5Vc2VQcm9maWxlV2l0aFRlc3QocHJvZmlsZSwgdC50ZXN0KSkubWFwKHQgPT4gdC50ZXN0Lml0ZW0uZXh0SWQpXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSdW5BY3Rpb24gZXh0ZW5kcyBSdW5WaXNpYmxlQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuLCB7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5SdW5BY3Rpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdydW4gdGVzdCcsICdSdW4gVGVzdCcpLFxuXHRcdFx0aWNvbjogaWNvbnMudGVzdGluZ1J1bkljb24sXG5cdFx0XHRtZW51OiB0ZXN0SXRlbUlubGluZUFuZEluQ29udGV4dChBY3Rpb25PcmRlci5SdW4sIFRlc3RpbmdDb250ZXh0S2V5cy5oYXNSdW5uYWJsZVRlc3RzLmlzRXF1YWxUbyh0cnVlKSksXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNlbGVjdERlZmF1bHRUZXN0UHJvZmlsZXMgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuU2VsZWN0RGVmYXVsdFRlc3RQcm9maWxlcyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3Rpbmcuc2VsZWN0RGVmYXVsdFRlc3RQcm9maWxlcycsICdTZWxlY3QgRGVmYXVsdCBQcm9maWxlJyksXG5cdFx0XHRpY29uOiBpY29ucy50ZXN0aW5nVXBkYXRlUHJvZmlsZXMsXG5cdFx0XHRjYXRlZ29yeSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyBydW4oYWNlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgb25seUdyb3VwOiBUZXN0UnVuUHJvZmlsZUJpdHNldCkge1xuXHRcdGNvbnN0IGNvbW1hbmRzID0gYWNlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCB0ZXN0UHJvZmlsZVNlcnZpY2UgPSBhY2Vzc29yLmdldChJVGVzdFByb2ZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9maWxlcyA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPElUZXN0UnVuUHJvZmlsZVtdPigndnNjb2RlLnBpY2tNdWx0aXBsZVRlc3RQcm9maWxlcycsIHtcblx0XHRcdHNob3dDb25maWd1cmVCdXR0b25zOiBmYWxzZSxcblx0XHRcdHNlbGVjdGVkOiB0ZXN0UHJvZmlsZVNlcnZpY2UuZ2V0R3JvdXBEZWZhdWx0UHJvZmlsZXMob25seUdyb3VwKSxcblx0XHRcdG9ubHlHcm91cCxcblx0XHR9KTtcblxuXHRcdGlmIChwcm9maWxlcz8ubGVuZ3RoKSB7XG5cdFx0XHR0ZXN0UHJvZmlsZVNlcnZpY2Uuc2V0R3JvdXBEZWZhdWx0UHJvZmlsZXMob25seUdyb3VwLCBwcm9maWxlcyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb250aW51b3VzUnVuVGVzdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5Ub2dnbGVDb250aW5vdXNSdW5Gb3JUZXN0LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy50b2dnbGVDb250aW51b3VzUnVuT24nLCAnVHVybiBvbiBDb250aW51b3VzIFJ1bicpLFxuXHRcdFx0aWNvbjogaWNvbnMudGVzdGluZ1R1cm5Db250aW51b3VzUnVuT24sXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuaXNDb250aW51b3VzTW9kZU9uLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmlzUGFyZW50UnVubmluZ0NvbnRpbnVvdXNseS5pc0VxdWFsVG8oZmFsc2UpXG5cdFx0XHQpLFxuXHRcdFx0dG9nZ2xlZDoge1xuXHRcdFx0XHRjb25kaXRpb246IFRlc3RpbmdDb250ZXh0S2V5cy5pc0NvbnRpbnVvdXNNb2RlT24uaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0XHRpY29uOiBpY29ucy50ZXN0aW5nQ29udGludW91c0lzT24sXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndGVzdGluZy50b2dnbGVDb250aW51b3VzUnVuT2ZmJywgJ1R1cm4gb2ZmIENvbnRpbnVvdXMgUnVuJyksXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogdGVzdEl0ZW1JbmxpbmVBbmRJbkNvbnRleHQoQWN0aW9uT3JkZXIuQ29udGludW91c1J1blRlc3QsIFRlc3RpbmdDb250ZXh0S2V5cy5zdXBwb3J0c0NvbnRpbnVvdXNSdW4uaXNFcXVhbFRvKHRydWUpKSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmVsZW1lbnRzOiBUZXN0SXRlbVRyZWVFbGVtZW50W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RpbmdDb250aW51b3VzUnVuU2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzKSB7XG5cdFx0XHRjb25zdCBpZCA9IGVsZW1lbnQudGVzdC5pdGVtLmV4dElkO1xuXHRcdFx0aWYgKGNyU2VydmljZS5pc1NwZWNpZmljYWxseUVuYWJsZWRGb3IoaWQpKSB7XG5cdFx0XHRcdGNyU2VydmljZS5zdG9wKGlkKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNyU2VydmljZS5zdGFydChUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4sIGlkKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRpbnVvdXNSdW5Vc2luZ1Byb2ZpbGVUZXN0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkNvbnRpbm91c1J1blVzaW5nRm9yVGVzdCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3Rpbmcuc3RhcnRDb250aW51b3VzUnVuVXNpbmcnLCAnU3RhcnQgQ29udGlub3VzIFJ1biBVc2luZy4uLicpLFxuXHRcdFx0aWNvbjogaWNvbnMudGVzdGluZ0RlYnVnSWNvbixcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuVGVzdEl0ZW0sXG5cdFx0XHRcdFx0b3JkZXI6IEFjdGlvbk9yZGVyLlJ1bkNvbnRpbnVvdXMsXG5cdFx0XHRcdFx0Z3JvdXA6ICdidWlsdGluQDInLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5zdXBwb3J0c0NvbnRpbnVvdXNSdW4uaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0XHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmlzQ29udGludW91c01vZGVPbi5pc0VxdWFsVG8oZmFsc2UpLFxuXHRcdFx0XHRcdClcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmVsZW1lbnRzOiBUZXN0SXRlbVRyZWVFbGVtZW50W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RpbmdDb250aW51b3VzUnVuU2VydmljZSk7XG5cdFx0Y29uc3QgcHJvZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RQcm9maWxlU2VydmljZSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblxuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBlbGVtZW50cykge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWQgPSBhd2FpdCBzZWxlY3RDb250aW51b3VzUnVuUHJvZmlsZXMoY3JTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBxdWlja0lucHV0U2VydmljZSxcblx0XHRcdFx0W3sgcHJvZmlsZXM6IHByb2ZpbGVTZXJ2aWNlLmdldENvbnRyb2xsZXJQcm9maWxlcyhlbGVtZW50LnRlc3QuY29udHJvbGxlcklkKSB9XSk7XG5cblx0XHRcdGlmIChzZWxlY3RlZC5sZW5ndGgpIHtcblx0XHRcdFx0Y3JTZXJ2aWNlLnN0YXJ0KHNlbGVjdGVkLCBlbGVtZW50LnRlc3QuaXRlbS5leHRJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb25maWd1cmVUZXN0UHJvZmlsZXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuQ29uZmlndXJlVGVzdFByb2ZpbGVzQWN0aW9uLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5jb25maWd1cmVQcm9maWxlJywgXCJDb25maWd1cmUgVGVzdCBQcm9maWxlc1wiKSxcblx0XHRcdGljb246IGljb25zLnRlc3RpbmdVcGRhdGVQcm9maWxlcyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5oYXNDb25maWd1cmFibGVQcm9maWxlLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgYXN5bmMgcnVuKGFjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG9ubHlHcm91cD86IFRlc3RSdW5Qcm9maWxlQml0c2V0KSB7XG5cdFx0Y29uc3QgY29tbWFuZHMgPSBhY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IHRlc3RQcm9maWxlU2VydmljZSA9IGFjZXNzb3IuZ2V0KElUZXN0UHJvZmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb2ZpbGUgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDxJVGVzdFJ1blByb2ZpbGU+KCd2c2NvZGUucGlja1Rlc3RQcm9maWxlJywge1xuXHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdjb25maWd1cmVQcm9maWxlJywgJ1NlbGVjdCBhIHByb2ZpbGUgdG8gdXBkYXRlJyksXG5cdFx0XHRzaG93Q29uZmlndXJlQnV0dG9uczogZmFsc2UsXG5cdFx0XHRvbmx5Q29uZmlndXJhYmxlOiB0cnVlLFxuXHRcdFx0b25seUdyb3VwLFxuXHRcdH0pO1xuXG5cdFx0aWYgKHByb2ZpbGUpIHtcblx0XHRcdHRlc3RQcm9maWxlU2VydmljZS5jb25maWd1cmUocHJvZmlsZS5jb250cm9sbGVySWQsIHByb2ZpbGUucHJvZmlsZUlkKTtcblx0XHR9XG5cdH1cbn1cblxuY29uc3QgY29udGludW91c01lbnVzID0gKHdoZW5Jc0NvbnRpbnVvdXNPbjogYm9vbGVhbik6IElBY3Rpb24yT3B0aW9uc1snbWVudSddID0+IFtcblx0e1xuXHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0b3JkZXI6IEFjdGlvbk9yZGVyLlJ1blVzaW5nLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRlc3RpbmcuRXhwbG9yZXJWaWV3SWQpLFxuXHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLnN1cHBvcnRzQ29udGludW91c1J1bi5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuaXNDb250aW51b3VzTW9kZU9uLmlzRXF1YWxUbyh3aGVuSXNDb250aW51b3VzT24pLFxuXHRcdCksXG5cdH0sXG5cdHtcblx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5zdXBwb3J0c0NvbnRpbnVvdXNSdW4uaXNFcXVhbFRvKHRydWUpLFxuXHR9LFxuXTtcblxuY2xhc3MgU3RvcENvbnRpbnVvdXNSdW5BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuU3RvcENvbnRpbm91c1J1bixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3Rpbmcuc3RvcENvbnRpbnVvdXMnLCAnU3RvcCBDb250aW51b3VzIFJ1bicpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRpY29uOiBpY29ucy50ZXN0aW5nVHVybkNvbnRpbnVvdXNSdW5PZmYsXG5cdFx0XHRtZW51OiBjb250aW51b3VzTWVudXModHJ1ZSksXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRhY2Nlc3Nvci5nZXQoSVRlc3RpbmdDb250aW51b3VzUnVuU2VydmljZSkuc3RvcCgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHNlbGVjdENvbnRpbnVvdXNSdW5Qcm9maWxlcyhcblx0Y3JzOiBJVGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlLFxuXHRub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0cXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0cHJvZmlsZXNUb1BpY2tGcm9tOiBJdGVyYWJsZTxSZWFkb25seTx7XG5cdFx0Y29udHJvbGxlcj86IElNYWluVGhyZWFkVGVzdENvbnRyb2xsZXI7XG5cdFx0cHJvZmlsZXM6IElUZXN0UnVuUHJvZmlsZVtdO1xuXHR9Pj4sXG4pOiBQcm9taXNlPElUZXN0UnVuUHJvZmlsZVtdPiB7XG5cdHR5cGUgSXRlbVR5cGUgPSBJUXVpY2tQaWNrSXRlbSAmIHsgcHJvZmlsZTogSVRlc3RSdW5Qcm9maWxlIH07XG5cblx0Y29uc3QgaXRlbXM6IEl0ZW1UeXBlW10gPSBbXTtcblx0Zm9yIChjb25zdCB7IGNvbnRyb2xsZXIsIHByb2ZpbGVzIH0gb2YgcHJvZmlsZXNUb1BpY2tGcm9tKSB7XG5cdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHByb2ZpbGVzKSB7XG5cdFx0XHRpZiAocHJvZmlsZS5zdXBwb3J0c0NvbnRpbnVvdXNSdW4pIHtcblx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IHByb2ZpbGUubGFiZWwgfHwgY29udHJvbGxlcj8ubGFiZWwuZ2V0KCkgfHwgJycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGNvbnRyb2xsZXI/LmxhYmVsLmdldCgpLFxuXHRcdFx0XHRcdHByb2ZpbGUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlmIChpdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ3Rlc3Rpbmcubm9Qcm9maWxlcycsICdObyB0ZXN0IGNvbnRpbnVvdXMgcnVuLWVuYWJsZWQgcHJvZmlsZXMgd2VyZSBmb3VuZCcpKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0fVxuXG5cdC8vIHNwZWNpYWwgY2FzZTogZG9uJ3QgYm90aGVyIHRvIHF1aWNrIGEgcGlja3BpY2sgaWYgdGhlcmUncyBvbmx5IGEgc2luZ2xlIHByb2ZpbGVcblx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMSkge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW2l0ZW1zWzBdLnByb2ZpbGVdKTtcblx0fVxuXG5cdGNvbnN0IHFwSXRlbXM6IChJdGVtVHlwZSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gPSBbXTtcblx0Y29uc3Qgc2VsZWN0ZWRJdGVtczogSXRlbVR5cGVbXSA9IFtdO1xuXHRjb25zdCBsYXN0UnVuID0gY3JzLmxhc3RSdW5Qcm9maWxlSWRzO1xuXG5cdGl0ZW1zLnNvcnQoKGEsIGIpID0+IGEucHJvZmlsZS5ncm91cCAtIGIucHJvZmlsZS5ncm91cFxuXHRcdHx8IGEucHJvZmlsZS5jb250cm9sbGVySWQubG9jYWxlQ29tcGFyZShiLnByb2ZpbGUuY29udHJvbGxlcklkKVxuXHRcdHx8IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSk7XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpdGVtcy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGl0ZW0gPSBpdGVtc1tpXTtcblx0XHRpZiAoaSA9PT0gMCB8fCBpdGVtc1tpIC0gMV0ucHJvZmlsZS5ncm91cCAhPT0gaXRlbS5wcm9maWxlLmdyb3VwKSB7XG5cdFx0XHRxcEl0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IHRlc3RDb25maWd1cmF0aW9uR3JvdXBOYW1lc1tpdGVtLnByb2ZpbGUuZ3JvdXBdIH0pO1xuXHRcdH1cblxuXHRcdHFwSXRlbXMucHVzaChpdGVtKTtcblx0XHRpZiAobGFzdFJ1bi5oYXMoaXRlbS5wcm9maWxlLnByb2ZpbGVJZCkpIHtcblx0XHRcdHNlbGVjdGVkSXRlbXMucHVzaChpdGVtKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgcXVpY2twaWNrID0gZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbSAmIHsgcHJvZmlsZTogSVRlc3RSdW5Qcm9maWxlIH0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KSk7XG5cdHF1aWNrcGljay50aXRsZSA9IGxvY2FsaXplKCd0ZXN0aW5nLnNlbGVjdENvbnRpbnVvdXNQcm9maWxlcycsICdTZWxlY3QgcHJvZmlsZXMgdG8gcnVuIHdoZW4gZmlsZXMgY2hhbmdlOicpO1xuXHRxdWlja3BpY2suY2FuU2VsZWN0TWFueSA9IHRydWU7XG5cdHF1aWNrcGljay5pdGVtcyA9IHFwSXRlbXM7XG5cdHF1aWNrcGljay5zZWxlY3RlZEl0ZW1zID0gc2VsZWN0ZWRJdGVtcztcblx0cXVpY2twaWNrLnNob3coKTtcblx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja3BpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0cmVzb2x2ZShxdWlja3BpY2suc2VsZWN0ZWRJdGVtcy5tYXAoaSA9PiBpLnByb2ZpbGUpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2twaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRyZXNvbHZlKFtdKTtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cdH0pO1xufVxuXG5jbGFzcyBTdGFydENvbnRpbnVvdXNSdW5BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuU3RhcnRDb250aW5vdXNSdW4sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnN0YXJ0Q29udGludW91cycsIFwiU3RhcnQgQ29udGludW91cyBSdW5cIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGljb246IGljb25zLnRlc3RpbmdUdXJuQ29udGludW91c1J1bk9uLFxuXHRcdFx0bWVudTogY29udGludW91c01lbnVzKGZhbHNlKSxcblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjcnMgPSBhY2Nlc3Nvci5nZXQoSVRlc3RpbmdDb250aW51b3VzUnVuU2VydmljZSk7XG5cdFx0Y29uc3QgcHJvZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RQcm9maWxlU2VydmljZSk7XG5cblx0XHRjb25zdCBsYXN0UnVuUHJvZmlsZXMgPSBbLi4ucHJvZmlsZVNlcnZpY2UuYWxsKCldLmZsYXRNYXAocCA9PiBwLnByb2ZpbGVzLmZpbHRlcihwID0+IGNycy5sYXN0UnVuUHJvZmlsZUlkcy5oYXMocC5wcm9maWxlSWQpKSk7XG5cdFx0aWYgKGxhc3RSdW5Qcm9maWxlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBjcnMuc3RhcnQobGFzdFJ1blByb2ZpbGVzKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHNlbGVjdENvbnRpbnVvdXNSdW5Qcm9maWxlcyhjcnMsIGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSksIGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSVRlc3RQcm9maWxlU2VydmljZSkuYWxsKCkpO1xuXHRcdGlmIChzZWxlY3RlZC5sZW5ndGgpIHtcblx0XHRcdGNycy5zdGFydChzZWxlY3RlZCk7XG5cdFx0fVxuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEV4ZWN1dGVTZWxlY3RlZEFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248VGVzdGluZ0V4cGxvcmVyVmlldz4ge1xuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBJQWN0aW9uMk9wdGlvbnMsIHByaXZhdGUgcmVhZG9ubHkgZ3JvdXA6IFRlc3RSdW5Qcm9maWxlQml0c2V0KSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRvcmRlcjogZ3JvdXAgPT09IFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1blxuXHRcdFx0XHRcdD8gQWN0aW9uT3JkZXIuUnVuXG5cdFx0XHRcdFx0OiBncm91cCA9PT0gVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWdcblx0XHRcdFx0XHRcdD8gQWN0aW9uT3JkZXIuRGVidWdcblx0XHRcdFx0XHRcdDogQWN0aW9uT3JkZXIuQ292ZXJhZ2UsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBUZXN0aW5nLkV4cGxvcmVyVmlld0lkKSxcblx0XHRcdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuaXNSdW5uaW5nLmlzRXF1YWxUbyhmYWxzZSksXG5cdFx0XHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmNhcGFiaWxpdHlUb0NvbnRleHRLZXlbZ3JvdXBdLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdFx0KVxuXHRcdFx0fV0sXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdHZpZXdJZDogVGVzdGluZy5FeHBsb3JlclZpZXdJZCxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAb3ZlcnJpZGVcblx0ICovXG5cdHB1YmxpYyBydW5JblZpZXcoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFRlc3RpbmdFeHBsb3JlclZpZXcpOiBQcm9taXNlPElUZXN0UmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgeyBpbmNsdWRlLCBleGNsdWRlIH0gPSB2aWV3LmdldFRyZWVJbmNsdWRlRXhjbHVkZSh0aGlzLmdyb3VwKTtcblx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElUZXN0U2VydmljZSkucnVuVGVzdHMoeyB0ZXN0czogaW5jbHVkZSwgZXhjbHVkZSwgZ3JvdXA6IHRoaXMuZ3JvdXAgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEdldFNlbGVjdGVkUHJvZmlsZXMgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoeyBpZDogVGVzdENvbW1hbmRJZC5HZXRTZWxlY3RlZFByb2ZpbGVzLCB0aXRsZTogbG9jYWxpemUyKCdnZXRTZWxlY3RlZFByb2ZpbGVzJywgJ0dldCBTZWxlY3RlZCBQcm9maWxlcycpIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHVibGljIG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHByb2ZpbGVzID0gYWNjZXNzb3IuZ2V0KElUZXN0UHJvZmlsZVNlcnZpY2UpO1xuXHRcdHJldHVybiBbXG5cdFx0XHQuLi5wcm9maWxlcy5nZXRHcm91cERlZmF1bHRQcm9maWxlcyhUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4pLFxuXHRcdFx0Li4ucHJvZmlsZXMuZ2V0R3JvdXBEZWZhdWx0UHJvZmlsZXMoVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcpLFxuXHRcdFx0Li4ucHJvZmlsZXMuZ2V0R3JvdXBEZWZhdWx0UHJvZmlsZXMoVGVzdFJ1blByb2ZpbGVCaXRzZXQuQ292ZXJhZ2UpLFxuXHRcdF0ubWFwKHAgPT4gKHtcblx0XHRcdGNvbnRyb2xsZXJJZDogcC5jb250cm9sbGVySWQsXG5cdFx0XHRsYWJlbDogcC5sYWJlbCxcblx0XHRcdGtpbmQ6IHAuZ3JvdXAgJiBUZXN0UnVuUHJvZmlsZUJpdHNldC5Db3ZlcmFnZVxuXHRcdFx0XHQ/IEV4dFRlc3RSdW5Qcm9maWxlS2luZC5Db3ZlcmFnZVxuXHRcdFx0XHQ6IHAuZ3JvdXAgJiBUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1Z1xuXHRcdFx0XHRcdD8gRXh0VGVzdFJ1blByb2ZpbGVLaW5kLkRlYnVnXG5cdFx0XHRcdFx0OiBFeHRUZXN0UnVuUHJvZmlsZUtpbmQuUnVuLFxuXHRcdH0pKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgR2V0RXhwbG9yZXJTZWxlY3Rpb24gZXh0ZW5kcyBWaWV3QWN0aW9uPFRlc3RpbmdFeHBsb3JlclZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoeyBpZDogVGVzdENvbW1hbmRJZC5HZXRFeHBsb3JlclNlbGVjdGlvbiwgdGl0bGU6IGxvY2FsaXplMignZ2V0RXhwbG9yZXJTZWxlY3Rpb24nLCAnR2V0IEV4cGxvcmVyIFNlbGVjdGlvbicpLCB2aWV3SWQ6IFRlc3RpbmcuRXhwbG9yZXJWaWV3SWQgfSk7XG5cdH1cblxuXHQvKipcblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuSW5WaWV3KF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogVGVzdGluZ0V4cGxvcmVyVmlldykge1xuXHRcdGNvbnN0IHsgaW5jbHVkZSwgZXhjbHVkZSB9ID0gdmlldy5nZXRUcmVlSW5jbHVkZUV4Y2x1ZGUoVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuLCB1bmRlZmluZWQsICdzZWxlY3RlZCcpO1xuXHRcdGNvbnN0IG1hcHBlciA9IChpOiBJbnRlcm5hbFRlc3RJdGVtKSA9PiBpLml0ZW0uZXh0SWQ7XG5cdFx0cmV0dXJuIHsgaW5jbHVkZTogaW5jbHVkZS5tYXAobWFwcGVyKSwgZXhjbHVkZTogZXhjbHVkZS5tYXAobWFwcGVyKSB9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSdW5TZWxlY3RlZEFjdGlvbiBleHRlbmRzIEV4ZWN1dGVTZWxlY3RlZEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlJ1blNlbGVjdGVkQWN0aW9uLFxuXHRcdFx0dGl0bGU6IExBQkVMX1JVTl9URVNUUyxcblx0XHRcdGljb246IGljb25zLnRlc3RpbmdSdW5BbGxJY29uLFxuXHRcdH0sIFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1bik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlYnVnU2VsZWN0ZWRBY3Rpb24gZXh0ZW5kcyBFeGVjdXRlU2VsZWN0ZWRBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5EZWJ1Z1NlbGVjdGVkQWN0aW9uLFxuXHRcdFx0dGl0bGU6IExBQkVMX0RFQlVHX1RFU1RTLFxuXHRcdFx0aWNvbjogaWNvbnMudGVzdGluZ0RlYnVnQWxsSWNvbixcblx0XHR9LCBUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1Zyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvdmVyYWdlU2VsZWN0ZWRBY3Rpb24gZXh0ZW5kcyBFeGVjdXRlU2VsZWN0ZWRBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5Db3ZlcmFnZVNlbGVjdGVkQWN0aW9uLFxuXHRcdFx0dGl0bGU6IExBQkVMX0NPVkVSQUdFX1RFU1RTLFxuXHRcdFx0aWNvbjogaWNvbnMudGVzdGluZ0NvdmVyYWdlQWxsSWNvbixcblx0XHR9LCBUZXN0UnVuUHJvZmlsZUJpdHNldC5Db3ZlcmFnZSk7XG5cdH1cbn1cblxuY29uc3Qgc2hvd0Rpc2NvdmVyaW5nV2hpbGUgPSA8Uj4ocHJvZ3Jlc3M6IElQcm9ncmVzc1NlcnZpY2UsIHRhc2s6IFByb21pc2U8Uj4pOiBQcm9taXNlPFI+ID0+IHtcblx0cmV0dXJuIHByb2dyZXNzLndpdGhQcm9ncmVzcyhcblx0XHR7XG5cdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3csXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2Rpc2NvdmVyaW5nVGVzdHMnLCAnRGlzY292ZXJpbmcgVGVzdHMnKSxcblx0XHR9LFxuXHRcdCgpID0+IHRhc2ssXG5cdCk7XG59O1xuXG5hYnN0cmFjdCBjbGFzcyBSdW5PckRlYnVnQWxsVGVzdHNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3Iob3B0aW9uczogSUFjdGlvbjJPcHRpb25zLCBwcml2YXRlIHJlYWRvbmx5IGdyb3VwOiBUZXN0UnVuUHJvZmlsZUJpdHNldCwgcHJpdmF0ZSBub1Rlc3RzRm91bmRFcnJvcjogc3RyaW5nKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLmNhcGFiaWxpdHlUb0NvbnRleHRLZXlbZ3JvdXBdLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25zID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJvb3RzID0gWy4uLnRlc3RTZXJ2aWNlLmNvbGxlY3Rpb24ucm9vdEl0ZW1zXS5maWx0ZXIociA9PiByLmNoaWxkcmVuLnNpemVcblx0XHRcdHx8IHIuZXhwYW5kID09PSBUZXN0SXRlbUV4cGFuZFN0YXRlLkV4cGFuZGFibGUgfHwgci5leHBhbmQgPT09IFRlc3RJdGVtRXhwYW5kU3RhdGUuQnVzeUV4cGFuZGluZyk7XG5cdFx0aWYgKCFyb290cy5sZW5ndGgpIHtcblx0XHRcdG5vdGlmaWNhdGlvbnMuaW5mbyh0aGlzLm5vVGVzdHNGb3VuZEVycm9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0ZXN0U2VydmljZS5ydW5UZXN0cyh7IHRlc3RzOiByb290cywgZ3JvdXA6IHRoaXMuZ3JvdXAgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJ1bkFsbEFjdGlvbiBleHRlbmRzIFJ1bk9yRGVidWdBbGxUZXN0c0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogVGVzdENvbW1hbmRJZC5SdW5BbGxBY3Rpb24sXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3J1bkFsbFRlc3RzJywgJ1J1biBBbGwgVGVzdHMnKSxcblx0XHRcdFx0aWNvbjogaWNvbnMudGVzdGluZ1J1bkFsbEljb24sXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlDb2RlLktleUEpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1bixcblx0XHRcdGxvY2FsaXplKCdub1Rlc3RQcm92aWRlcicsICdObyB0ZXN0cyBmb3VuZCBpbiB0aGlzIHdvcmtzcGFjZS4gWW91IG1heSBuZWVkIHRvIGluc3RhbGwgYSB0ZXN0IHByb3ZpZGVyIGV4dGVuc2lvbicpLFxuXHRcdCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlYnVnQWxsQWN0aW9uIGV4dGVuZHMgUnVuT3JEZWJ1Z0FsbFRlc3RzQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkRlYnVnQWxsQWN0aW9uLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdkZWJ1Z0FsbFRlc3RzJywgJ0RlYnVnIEFsbCBUZXN0cycpLFxuXHRcdFx0XHRpY29uOiBpY29ucy50ZXN0aW5nRGVidWdJY29uLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNlbWljb2xvbiwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUEpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnLFxuXHRcdFx0bG9jYWxpemUoJ25vRGVidWdUZXN0UHJvdmlkZXInLCAnTm8gZGVidWdnYWJsZSB0ZXN0cyBmb3VuZCBpbiB0aGlzIHdvcmtzcGFjZS4gWW91IG1heSBuZWVkIHRvIGluc3RhbGwgYSB0ZXN0IHByb3ZpZGVyIGV4dGVuc2lvbicpLFxuXHRcdCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvdmVyYWdlQWxsQWN0aW9uIGV4dGVuZHMgUnVuT3JEZWJ1Z0FsbFRlc3RzQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlJ1bkFsbFdpdGhDb3ZlcmFnZUFjdGlvbixcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMigncnVuQWxsV2l0aENvdmVyYWdlJywgJ1J1biBBbGwgVGVzdHMgd2l0aCBDb3ZlcmFnZScpLFxuXHRcdFx0XHRpY29uOiBpY29ucy50ZXN0aW5nQ292ZXJhZ2VJY29uLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNlbWljb2xvbiwgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUEpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdFRlc3RSdW5Qcm9maWxlQml0c2V0LkNvdmVyYWdlLFxuXHRcdFx0bG9jYWxpemUoJ25vQ292ZXJhZ2VUZXN0UHJvdmlkZXInLCAnTm8gdGVzdHMgd2l0aCBjb3ZlcmFnZSBydW5uZXJzIGZvdW5kIGluIHRoaXMgd29ya3NwYWNlLiBZb3UgbWF5IG5lZWQgdG8gaW5zdGFsbCBhIHRlc3QgcHJvdmlkZXIgZXh0ZW5zaW9uJyksXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2FuY2VsVGVzdFJ1bkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5DYW5jZWxUZXN0UnVuQWN0aW9uLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5jYW5jZWxSdW4nLCAnQ2FuY2VsIFRlc3QgUnVuJyksXG5cdFx0XHRpY29uOiBpY29ucy50ZXN0aW5nQ2FuY2VsSWNvbixcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNlbWljb2xvbiwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVgpLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRvcmRlcjogQWN0aW9uT3JkZXIuUnVuLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVGVzdGluZy5FeHBsb3JlclZpZXdJZCksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKFRlc3RpbmdDb250ZXh0S2V5cy5pc1J1bm5pbmcuc2VyaWFsaXplKCksIHRydWUpLFxuXHRcdFx0XHQpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5pc1J1bm5pbmcsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHVibGljIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVzdWx0SWQ/OiBzdHJpbmcsIHRhc2tJZD86IHN0cmluZykge1xuXHRcdGNvbnN0IHJlc3VsdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RSZXN1bHRTZXJ2aWNlKTtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFNlcnZpY2UpO1xuXHRcdGlmIChyZXN1bHRJZCkge1xuXHRcdFx0dGVzdFNlcnZpY2UuY2FuY2VsVGVzdFJ1bihyZXN1bHRJZCwgdGFza0lkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBydW4gb2YgcmVzdWx0U2VydmljZS5yZXN1bHRzKSB7XG5cdFx0XHRcdGlmICghcnVuLmNvbXBsZXRlZEF0KSB7XG5cdFx0XHRcdFx0dGVzdFNlcnZpY2UuY2FuY2VsVGVzdFJ1bihydW4uaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0aW5nVmlld0FzTGlzdEFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248VGVzdGluZ0V4cGxvcmVyVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5UZXN0aW5nVmlld0FzTGlzdEFjdGlvbixcblx0XHRcdHZpZXdJZDogVGVzdGluZy5FeHBsb3JlclZpZXdJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3Rpbmcudmlld0FzTGlzdCcsICdWaWV3IGFzIExpc3QnKSxcblx0XHRcdHRvZ2dsZWQ6IFRlc3RpbmdDb250ZXh0S2V5cy52aWV3TW9kZS5pc0VxdWFsVG8oVGVzdEV4cGxvcmVyVmlld01vZGUuTGlzdCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRvcmRlcjogQWN0aW9uT3JkZXIuRGlzcGxheU1vZGUsXG5cdFx0XHRcdGdyb3VwOiAndmlld0FzJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVGVzdGluZy5FeHBsb3JlclZpZXdJZClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAb3ZlcnJpZGVcblx0ICovXG5cdHB1YmxpYyBydW5JblZpZXcoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBUZXN0aW5nRXhwbG9yZXJWaWV3KSB7XG5cdFx0dmlldy52aWV3TW9kZWwudmlld01vZGUgPSBUZXN0RXhwbG9yZXJWaWV3TW9kZS5MaXN0O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0aW5nVmlld0FzVHJlZUFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248VGVzdGluZ0V4cGxvcmVyVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5UZXN0aW5nVmlld0FzVHJlZUFjdGlvbixcblx0XHRcdHZpZXdJZDogVGVzdGluZy5FeHBsb3JlclZpZXdJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3Rpbmcudmlld0FzVHJlZScsICdWaWV3IGFzIFRyZWUnKSxcblx0XHRcdHRvZ2dsZWQ6IFRlc3RpbmdDb250ZXh0S2V5cy52aWV3TW9kZS5pc0VxdWFsVG8oVGVzdEV4cGxvcmVyVmlld01vZGUuVHJlZSksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRvcmRlcjogQWN0aW9uT3JkZXIuRGlzcGxheU1vZGUsXG5cdFx0XHRcdGdyb3VwOiAndmlld0FzJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVGVzdGluZy5FeHBsb3JlclZpZXdJZClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAb3ZlcnJpZGVcblx0ICovXG5cdHB1YmxpYyBydW5JblZpZXcoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBUZXN0aW5nRXhwbG9yZXJWaWV3KSB7XG5cdFx0dmlldy52aWV3TW9kZWwudmlld01vZGUgPSBUZXN0RXhwbG9yZXJWaWV3TW9kZS5UcmVlO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIFRlc3RpbmdTb3J0QnlTdGF0dXNBY3Rpb24gZXh0ZW5kcyBWaWV3QWN0aW9uPFRlc3RpbmdFeHBsb3JlclZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuVGVzdGluZ1NvcnRCeVN0YXR1c0FjdGlvbixcblx0XHRcdHZpZXdJZDogVGVzdGluZy5FeHBsb3JlclZpZXdJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3Rpbmcuc29ydEJ5U3RhdHVzJywgJ1NvcnQgYnkgU3RhdHVzJyksXG5cdFx0XHR0b2dnbGVkOiBUZXN0aW5nQ29udGV4dEtleXMudmlld1NvcnRpbmcuaXNFcXVhbFRvKFRlc3RFeHBsb3JlclZpZXdTb3J0aW5nLkJ5U3RhdHVzKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdG9yZGVyOiBBY3Rpb25PcmRlci5Tb3J0LFxuXHRcdFx0XHRncm91cDogJ3NvcnRCeScsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRlc3RpbmcuRXhwbG9yZXJWaWV3SWQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwdWJsaWMgcnVuSW5WaWV3KF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogVGVzdGluZ0V4cGxvcmVyVmlldykge1xuXHRcdHZpZXcudmlld01vZGVsLnZpZXdTb3J0aW5nID0gVGVzdEV4cGxvcmVyVmlld1NvcnRpbmcuQnlTdGF0dXM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RpbmdTb3J0QnlMb2NhdGlvbkFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248VGVzdGluZ0V4cGxvcmVyVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5UZXN0aW5nU29ydEJ5TG9jYXRpb25BY3Rpb24sXG5cdFx0XHR2aWV3SWQ6IFRlc3RpbmcuRXhwbG9yZXJWaWV3SWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnNvcnRCeUxvY2F0aW9uJywgJ1NvcnQgYnkgTG9jYXRpb24nKSxcblx0XHRcdHRvZ2dsZWQ6IFRlc3RpbmdDb250ZXh0S2V5cy52aWV3U29ydGluZy5pc0VxdWFsVG8oVGVzdEV4cGxvcmVyVmlld1NvcnRpbmcuQnlMb2NhdGlvbiksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRvcmRlcjogQWN0aW9uT3JkZXIuU29ydCxcblx0XHRcdFx0Z3JvdXA6ICdzb3J0QnknLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBUZXN0aW5nLkV4cGxvcmVyVmlld0lkKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHVibGljIHJ1bkluVmlldyhfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFRlc3RpbmdFeHBsb3JlclZpZXcpIHtcblx0XHR2aWV3LnZpZXdNb2RlbC52aWV3U29ydGluZyA9IFRlc3RFeHBsb3JlclZpZXdTb3J0aW5nLkJ5TG9jYXRpb247XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RpbmdTb3J0QnlEdXJhdGlvbkFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248VGVzdGluZ0V4cGxvcmVyVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5UZXN0aW5nU29ydEJ5RHVyYXRpb25BY3Rpb24sXG5cdFx0XHR2aWV3SWQ6IFRlc3RpbmcuRXhwbG9yZXJWaWV3SWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnNvcnRCeUR1cmF0aW9uJywgJ1NvcnQgYnkgRHVyYXRpb24nKSxcblx0XHRcdHRvZ2dsZWQ6IFRlc3RpbmdDb250ZXh0S2V5cy52aWV3U29ydGluZy5pc0VxdWFsVG8oVGVzdEV4cGxvcmVyVmlld1NvcnRpbmcuQnlEdXJhdGlvbiksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRvcmRlcjogQWN0aW9uT3JkZXIuU29ydCxcblx0XHRcdFx0Z3JvdXA6ICdzb3J0QnknLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBUZXN0aW5nLkV4cGxvcmVyVmlld0lkKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHVibGljIHJ1bkluVmlldyhfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFRlc3RpbmdFeHBsb3JlclZpZXcpIHtcblx0XHR2aWV3LnZpZXdNb2RlbC52aWV3U29ydGluZyA9IFRlc3RFeHBsb3JlclZpZXdTb3J0aW5nLkJ5RHVyYXRpb247XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNob3dNb3N0UmVjZW50T3V0cHV0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlNob3dNb3N0UmVjZW50T3V0cHV0QWN0aW9uLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5zaG93TW9zdFJlY2VudE91dHB1dCcsICdTaG93IE91dHB1dCcpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNlbWljb2xvbiwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleU8pLFxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogVGVzdGluZ0NvbnRleHRLZXlzLmhhc0FueVJlc3VsdHMuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdG9yZGVyOiBBY3Rpb25PcmRlci5Db2xsYXBzZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVGVzdGluZy5FeHBsb3JlclZpZXdJZCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5oYXNBbnlSZXN1bHRzLmlzRXF1YWxUbyh0cnVlKVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB2aWV3U2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB0ZXN0VmlldyA9IGF3YWl0IHZpZXdTZXJ2aWNlLm9wZW5WaWV3PFRlc3RSZXN1bHRzVmlldz4oVGVzdGluZy5SZXN1bHRzVmlld0lkLCB0cnVlKTtcblx0XHR0ZXN0Vmlldz8uc2hvd0xhdGVzdFJ1bigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb2xsYXBzZUFsbEFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248VGVzdGluZ0V4cGxvcmVyVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5Db2xsYXBzZUFsbEFjdGlvbixcblx0XHRcdHZpZXdJZDogVGVzdGluZy5FeHBsb3JlclZpZXdJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuY29sbGFwc2VBbGwnLCAnQ29sbGFwc2UgQWxsIFRlc3RzJyksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNvbGxhcHNlQWxsLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0b3JkZXI6IEFjdGlvbk9yZGVyLkNvbGxhcHNlLFxuXHRcdFx0XHRncm91cDogJ2Rpc3BsYXlBY3Rpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBUZXN0aW5nLkV4cGxvcmVyVmlld0lkKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHVibGljIHJ1bkluVmlldyhfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFRlc3RpbmdFeHBsb3JlclZpZXcpIHtcblx0XHR2aWV3LnZpZXdNb2RlbC5jb2xsYXBzZUFsbCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDbGVhclRlc3RSZXN1bHRzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkNsZWFyVGVzdFJlc3VsdHNBY3Rpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLmNsZWFyUmVzdWx0cycsICdDbGVhciBBbGwgUmVzdWx0cycpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNsZWFyQWxsLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXN0UGVla1RpdGxlLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMuaGFzQW55UmVzdWx0cy5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRvcmRlcjogQWN0aW9uT3JkZXIuQ2xlYXJSZXN1bHRzLFxuXHRcdFx0XHRncm91cDogJ2Rpc3BsYXlBY3Rpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBUZXN0aW5nLkV4cGxvcmVyVmlld0lkKVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0b3JkZXI6IEFjdGlvbk9yZGVyLkNsZWFyUmVzdWx0cyxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVGVzdGluZy5SZXN1bHRzVmlld0lkKVxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0YWNjZXNzb3IuZ2V0KElUZXN0UmVzdWx0U2VydmljZSkuY2xlYXIoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgR29Ub1Rlc3QgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuR29Ub1Rlc3QsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLmVkaXRGb2N1c2VkVGVzdCcsICdHbyB0byBUZXN0JyksXG5cdFx0XHRpY29uOiBDb2RpY29uLmdvVG9GaWxlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlRlc3RJdGVtLFxuXHRcdFx0XHRncm91cDogJ2J1aWx0aW5AMScsXG5cdFx0XHRcdG9yZGVyOiBBY3Rpb25PcmRlci5Hb1RvVGVzdCxcblx0XHRcdFx0d2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLnRlc3RJdGVtSGFzVXJpLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdH0sXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliIC0gMTAsXG5cdFx0XHRcdHdoZW46IEZvY3VzZWRWaWV3Q29udGV4dC5pc0VxdWFsVG8oVGVzdGluZy5FeHBsb3JlclZpZXdJZCksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXIgfCBLZXlNb2QuQWx0LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVsZW1lbnQ/OiBUZXN0RXhwbG9yZXJUcmVlRWxlbWVudCwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pIHtcblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IHZpZXcgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkuZ2V0QWN0aXZlVmlld1dpdGhJZDxUZXN0aW5nRXhwbG9yZXJWaWV3PihUZXN0aW5nLkV4cGxvcmVyVmlld0lkKTtcblx0XHRcdGVsZW1lbnQgPSB2aWV3Py5mb2N1c2VkVHJlZUVsZW1lbnRzWzBdO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50ICYmIGVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0SXRlbVRyZWVFbGVtZW50KSB7XG5cdFx0XHRhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZCgndnNjb2RlLnJldmVhbFRlc3QnLCBlbGVtZW50LnRlc3QuaXRlbS5leHRJZCwgcHJlc2VydmVGb2N1cyk7XG5cdFx0fVxuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFRlc3RzQXRDdXJzb3IodGVzdFNlcnZpY2U6IElUZXN0U2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLCB1cmk6IFVSSSwgcG9zaXRpb246IFBvc2l0aW9uLCBmaWx0ZXI/OiAodGVzdDogSW50ZXJuYWxUZXN0SXRlbSkgPT4gYm9vbGVhbikge1xuXHQvLyB0ZXN0c0luRmlsZSB3aWxsIGRlc2NlbmQgaW4gdGhlIHRlc3QgdHJlZS4gV2UgYXNzdW1lIHRoYXQgYXMgd2UgZ29cblx0Ly8gZGVlcGVyLCByYW5nZXMgZ2V0IG1vcmUgc3BlY2lmaWMuIFdlJ2xsIHdhbnQgdG8gcnVuIGFsbCB0ZXN0cyB3aG9zZVxuXHQvLyByYW5nZSBpcyBlcXVhbCB0byB0aGUgbW9zdCBzcGVjaWZpYyByYW5nZSB3ZSBmaW5kIChzZWUgIzEzMzUxOSlcblx0Ly9cblx0Ly8gSWYgd2UgZG9uJ3QgZmluZCBhbnkgdGVzdCB3aG9zZSByYW5nZSBjb250YWlucyB0aGUgcG9zaXRpb24sIHdlIHBpY2tcblx0Ly8gdGhlIGNsb3Nlc3Qgb25lIGJlZm9yZSB0aGUgcG9zaXRpb24uIEFnYWluLCBpZiB3ZSBmaW5kIHNldmVyYWwgdGVzdHNcblx0Ly8gd2hvc2UgcmFuZ2UgaXMgZXF1YWwgdG8gdGhlIGNsb3Nlc3Qgb25lLCB3ZSBydW4gdGhlbSBhbGwuXG5cblx0bGV0IGJlc3ROb2RlczogSW50ZXJuYWxUZXN0SXRlbVtdID0gW107XG5cdGxldCBiZXN0UmFuZ2U6IFJhbmdlIHwgdW5kZWZpbmVkO1xuXG5cdGxldCBiZXN0Tm9kZXNCZWZvcmU6IEludGVybmFsVGVzdEl0ZW1bXSA9IFtdO1xuXHRsZXQgYmVzdFJhbmdlQmVmb3JlOiBSYW5nZSB8IHVuZGVmaW5lZDtcblxuXHRmb3IgYXdhaXQgKGNvbnN0IHRlc3RzIG9mIHRlc3RzSW5GaWxlKHRlc3RTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIHVyaSkpIHtcblx0XHRmb3IgKGNvbnN0IHRlc3Qgb2YgdGVzdHMpIHtcblx0XHRcdGlmICghdGVzdC5pdGVtLnJhbmdlIHx8IGZpbHRlcj8uKHRlc3QpID09PSBmYWxzZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXJhbmdlID0gUmFuZ2UubGlmdCh0ZXN0Lml0ZW0ucmFuZ2UpO1xuXHRcdFx0aWYgKGlyYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0XHRpZiAoYmVzdFJhbmdlICYmIFJhbmdlLmVxdWFsc1JhbmdlKHRlc3QuaXRlbS5yYW5nZSwgYmVzdFJhbmdlKSkge1xuXHRcdFx0XHRcdC8vIGNoZWNrIHRoYXQgYSBwYXJlbnQgaXNuJ3QgYWxyZWFkeSBpbmNsdWRlZCAoIzE4MDc2MClcblx0XHRcdFx0XHRpZiAoIWJlc3ROb2Rlcy5zb21lKGIgPT4gVGVzdElkLmlzQ2hpbGQoYi5pdGVtLmV4dElkLCB0ZXN0Lml0ZW0uZXh0SWQpKSkge1xuXHRcdFx0XHRcdFx0YmVzdE5vZGVzLnB1c2godGVzdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJlc3RSYW5nZSA9IGlyYW5nZTtcblx0XHRcdFx0XHRiZXN0Tm9kZXMgPSBbdGVzdF07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoUG9zaXRpb24uaXNCZWZvcmUoaXJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSwgcG9zaXRpb24pKSB7XG5cdFx0XHRcdGlmICghYmVzdFJhbmdlQmVmb3JlIHx8IGJlc3RSYW5nZUJlZm9yZS5nZXRTdGFydFBvc2l0aW9uKCkuaXNCZWZvcmUoaXJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSkpIHtcblx0XHRcdFx0XHRiZXN0UmFuZ2VCZWZvcmUgPSBpcmFuZ2U7XG5cdFx0XHRcdFx0YmVzdE5vZGVzQmVmb3JlID0gW3Rlc3RdO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlyYW5nZS5lcXVhbHNSYW5nZShiZXN0UmFuZ2VCZWZvcmUpICYmICFiZXN0Tm9kZXNCZWZvcmUuc29tZShiID0+IFRlc3RJZC5pc0NoaWxkKGIuaXRlbS5leHRJZCwgdGVzdC5pdGVtLmV4dElkKSkpIHtcblx0XHRcdFx0XHRiZXN0Tm9kZXNCZWZvcmUucHVzaCh0ZXN0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBiZXN0Tm9kZXMubGVuZ3RoID8gYmVzdE5vZGVzIDogYmVzdE5vZGVzQmVmb3JlO1xufVxuXG5jb25zdCBlbnVtIEVkaXRvckNvbnRleHRPcmRlciB7XG5cdFJ1bkF0Q3Vyc29yLFxuXHREZWJ1Z0F0Q3Vyc29yLFxuXHRSdW5JbkZpbGUsXG5cdERlYnVnSW5GaWxlLFxuXHRHb1RvUmVsYXRlZCxcblx0UGVla1JlbGF0ZWQsXG59XG5cbmFic3RyYWN0IGNsYXNzIEV4ZWN1dGVUZXN0QXRDdXJzb3IgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3Iob3B0aW9uczogSUFjdGlvbjJPcHRpb25zLCBwcm90ZWN0ZWQgcmVhZG9ubHkgZ3JvdXA6IFRlc3RSdW5Qcm9maWxlQml0c2V0KSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IGhhc0FueVRlc3RQcm92aWRlcixcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ3Rlc3RpbmcnLFxuXHRcdFx0XHRvcmRlcjogZ3JvdXAgPT09IFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1biA/IEVkaXRvckNvbnRleHRPcmRlci5SdW5BdEN1cnNvciA6IEVkaXRvckNvbnRleHRPcmRlci5EZWJ1Z0F0Q3Vyc29yLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVGVzdGluZ0NvbnRleHRLZXlzLmFjdGl2ZUVkaXRvckhhc1Rlc3RzLCBUZXN0aW5nQ29udGV4dEtleXMuY2FwYWJpbGl0eVRvQ29udGV4dEtleVtncm91cF0pLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAb3ZlcnJpZGVcblx0ICovXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0bGV0IGVkaXRvciA9IGNvZGVFZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKTtcblx0XHRpZiAoIWFjdGl2ZUVkaXRvclBhbmUgfHwgIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQpIHtcblx0XHRcdGVkaXRvciA9IGVkaXRvci5nZXRQYXJlbnRFZGl0b3IoKTtcblx0XHR9XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IGVkaXRvcj8uZ2V0UG9zaXRpb24oKTtcblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvcj8uZ2V0TW9kZWwoKTtcblx0XHRpZiAoIXBvc2l0aW9uIHx8ICFtb2RlbCB8fCAhKCd1cmknIGluIG1vZGVsKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXN0U2VydmljZSk7XG5cdFx0Y29uc3QgcHJvZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RQcm9maWxlU2VydmljZSk7XG5cdFx0Y29uc3QgdXJpSWRlbnRpdHlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVcmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb2dyZXNzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJvZ3Jlc3NTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc2F2ZUJlZm9yZVRlc3QgPSBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uU2VydmljZSwgVGVzdGluZ0NvbmZpZ0tleXMuU2F2ZUJlZm9yZVRlc3QpO1xuXHRcdGlmIChzYXZlQmVmb3JlVGVzdCkge1xuXHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5zYXZlKHsgZWRpdG9yOiBhY3RpdmVFZGl0b3JQYW5lLmlucHV0LCBncm91cElkOiBhY3RpdmVFZGl0b3JQYW5lLmdyb3VwLmlkIH0pO1xuXHRcdFx0YXdhaXQgdGVzdFNlcnZpY2Uuc3luY1Rlc3RzKCk7XG5cdFx0fVxuXG5cblx0XHQvLyB0ZXN0c0luRmlsZSB3aWxsIGRlc2NlbmQgaW4gdGhlIHRlc3QgdHJlZS4gV2UgYXNzdW1lIHRoYXQgYXMgd2UgZ29cblx0XHQvLyBkZWVwZXIsIHJhbmdlcyBnZXQgbW9yZSBzcGVjaWZpYy4gV2UnbGwgd2FudCB0byBydW4gYWxsIHRlc3RzIHdob3NlXG5cdFx0Ly8gcmFuZ2UgaXMgZXF1YWwgdG8gdGhlIG1vc3Qgc3BlY2lmaWMgcmFuZ2Ugd2UgZmluZCAoc2VlICMxMzM1MTkpXG5cdFx0Ly9cblx0XHQvLyBJZiB3ZSBkb24ndCBmaW5kIGFueSB0ZXN0IHdob3NlIHJhbmdlIGNvbnRhaW5zIHRoZSBwb3NpdGlvbiwgd2UgcGlja1xuXHRcdC8vIHRoZSBjbG9zZXN0IG9uZSBiZWZvcmUgdGhlIHBvc2l0aW9uLiBBZ2FpbiwgaWYgd2UgZmluZCBzZXZlcmFsIHRlc3RzXG5cdFx0Ly8gd2hvc2UgcmFuZ2UgaXMgZXF1YWwgdG8gdGhlIGNsb3Nlc3Qgb25lLCB3ZSBydW4gdGhlbSBhbGwuXG5cdFx0Y29uc3QgdGVzdHNUb1J1biA9IGF3YWl0IHNob3dEaXNjb3ZlcmluZ1doaWxlKHByb2dyZXNzU2VydmljZSxcblx0XHRcdGdldFRlc3RzQXRDdXJzb3IoXG5cdFx0XHRcdHRlc3RTZXJ2aWNlLFxuXHRcdFx0XHR1cmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0XHRcdG1vZGVsLnVyaSxcblx0XHRcdFx0cG9zaXRpb24sXG5cdFx0XHRcdHRlc3QgPT4gISEocHJvZmlsZVNlcnZpY2UuY2FwYWJpbGl0aWVzRm9yVGVzdCh0ZXN0Lml0ZW0pICYgdGhpcy5ncm91cClcblx0XHRcdClcblx0XHQpO1xuXG5cdFx0aWYgKHRlc3RzVG9SdW4ubGVuZ3RoKSB7XG5cdFx0XHRhd2FpdCB0ZXN0U2VydmljZS5ydW5UZXN0cyh7IGdyb3VwOiB0aGlzLmdyb3VwLCB0ZXN0czogdGVzdHNUb1J1biB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZWxhdGVkVGVzdHMgPSBhd2FpdCB0ZXN0U2VydmljZS5nZXRUZXN0c1JlbGF0ZWRUb0NvZGUobW9kZWwudXJpLCBwb3NpdGlvbik7XG5cdFx0aWYgKHJlbGF0ZWRUZXN0cy5sZW5ndGgpIHtcblx0XHRcdGF3YWl0IHRlc3RTZXJ2aWNlLnJ1blRlc3RzKHsgZ3JvdXA6IHRoaXMuZ3JvdXAsIHRlc3RzOiByZWxhdGVkVGVzdHMgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0TWVzc2FnZUNvbnRyb2xsZXIuZ2V0KGVkaXRvcik/LnNob3dNZXNzYWdlKGxvY2FsaXplKCdub1Rlc3RzQXRDdXJzb3InLCBcIk5vIHRlc3RzIGZvdW5kIGhlcmVcIiksIHBvc2l0aW9uKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJ1bkF0Q3Vyc29yIGV4dGVuZHMgRXhlY3V0ZVRlc3RBdEN1cnNvciB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlJ1bkF0Q3Vyc29yLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5ydW5BdEN1cnNvcicsICdSdW4gVGVzdCBhdCBDdXJzb3InKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlDb2RlLktleUMpLFxuXHRcdFx0fSxcblx0XHR9LCBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z0F0Q3Vyc29yIGV4dGVuZHMgRXhlY3V0ZVRlc3RBdEN1cnNvciB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkRlYnVnQXRDdXJzb3IsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLmRlYnVnQXRDdXJzb3InLCAnRGVidWcgVGVzdCBhdCBDdXJzb3InKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QyksXG5cdFx0XHR9LFxuXHRcdH0sIFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ292ZXJhZ2VBdEN1cnNvciBleHRlbmRzIEV4ZWN1dGVUZXN0QXRDdXJzb3Ige1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5Db3ZlcmFnZUF0Q3Vyc29yLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5jb3ZlcmFnZUF0Q3Vyc29yJywgJ1J1biBUZXN0IGF0IEN1cnNvciB3aXRoIENvdmVyYWdlJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNlbWljb2xvbiwgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUMpLFxuXHRcdFx0fSxcblx0XHR9LCBUZXN0UnVuUHJvZmlsZUJpdHNldC5Db3ZlcmFnZSk7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgRXhlY3V0ZVRlc3RzVW5kZXJVcmlBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3Iob3B0aW9uczogSUFjdGlvbjJPcHRpb25zLCBwcm90ZWN0ZWQgcmVhZG9ubHkgZ3JvdXA6IFRlc3RSdW5Qcm9maWxlQml0c2V0KSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRXhwbG9yZXJDb250ZXh0LFxuXHRcdFx0XHR3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMuY2FwYWJpbGl0eVRvQ29udGV4dEtleVtncm91cF0uaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0XHRncm91cDogJzYuNV90ZXN0aW5nJyxcblx0XHRcdFx0b3JkZXI6IChncm91cCA9PT0gVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuID8gQWN0aW9uT3JkZXIuUnVuIDogQWN0aW9uT3JkZXIuRGVidWcpICsgMC4xLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB1cmk6IFVSSSk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXN0U2VydmljZSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgdGVzdHMgPSBhd2FpdCBJdGVyYWJsZS5hc3luY1RvQXJyYXkodGVzdHNVbmRlclVyaShcblx0XHRcdHRlc3RTZXJ2aWNlLFxuXHRcdFx0YWNjZXNzb3IuZ2V0KElVcmlJZGVudGl0eVNlcnZpY2UpLFxuXHRcdFx0dXJpXG5cdFx0KSk7XG5cblx0XHRpZiAoIXRlc3RzLmxlbmd0aCkge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoeyBtZXNzYWdlOiBsb2NhbGl6ZSgnbm9UZXN0cycsICdObyB0ZXN0cyBmb3VuZCBpbiB0aGUgc2VsZWN0ZWQgZmlsZSBvciBmb2xkZXInKSwgc2V2ZXJpdHk6IFNldmVyaXR5LkluZm8gfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRlc3RTZXJ2aWNlLnJ1blRlc3RzKHsgdGVzdHMsIGdyb3VwOiB0aGlzLmdyb3VwIH0pO1xuXHR9XG59XG5cbmNsYXNzIFJ1blRlc3RzVW5kZXJVcmkgZXh0ZW5kcyBFeGVjdXRlVGVzdHNVbmRlclVyaUFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlJ1bkJ5VXJpLFxuXHRcdFx0dGl0bGU6IExBQkVMX1JVTl9URVNUUyxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdH0sIFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1bik7XG5cdH1cbn1cblxuY2xhc3MgRGVidWdUZXN0c1VuZGVyVXJpIGV4dGVuZHMgRXhlY3V0ZVRlc3RzVW5kZXJVcmlBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5EZWJ1Z0J5VXJpLFxuXHRcdFx0dGl0bGU6IExBQkVMX0RFQlVHX1RFU1RTLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0fSwgVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcpO1xuXHR9XG59XG5cbmNsYXNzIENvdmVyYWdlVGVzdHNVbmRlclVyaSBleHRlbmRzIEV4ZWN1dGVUZXN0c1VuZGVyVXJpQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuQ292ZXJhZ2VCeVVyaSxcblx0XHRcdHRpdGxlOiBMQUJFTF9DT1ZFUkFHRV9URVNUUyxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdH0sIFRlc3RSdW5Qcm9maWxlQml0c2V0LkNvdmVyYWdlKTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBFeGVjdXRlVGVzdHNJbkN1cnJlbnRGaWxlIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IElBY3Rpb24yT3B0aW9ucywgcHJvdGVjdGVkIHJlYWRvbmx5IGdyb3VwOiBUZXN0UnVuUHJvZmlsZUJpdHNldCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMuY2FwYWJpbGl0eVRvQ29udGV4dEtleVtncm91cF0uaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAndGVzdGluZycsXG5cdFx0XHRcdG9yZGVyOiBncm91cCA9PT0gVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuID8gRWRpdG9yQ29udGV4dE9yZGVyLlJ1bkluRmlsZSA6IEVkaXRvckNvbnRleHRPcmRlci5EZWJ1Z0luRmlsZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFRlc3RpbmdDb250ZXh0S2V5cy5hY3RpdmVFZGl0b3JIYXNUZXN0cywgVGVzdGluZ0NvbnRleHRLZXlzLmNhcGFiaWxpdHlUb0NvbnRleHRLZXlbZ3JvdXBdKSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuQnlVcmlzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBmaWxlczogVVJJW10pOiBQcm9taXNlPHsgY29tcGxldGVkQXQ6IG51bWJlciB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0Y29uc3QgdXJpSWRlbnRpdHkgPSBhY2Nlc3Nvci5nZXQoSVVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBkaXNjb3ZlcmVkOiBJbnRlcm5hbFRlc3RJdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHVyaSBvZiBmaWxlcykge1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBmaWxlcyBvZiB0ZXN0c0luRmlsZSh0ZXN0U2VydmljZSwgdXJpSWRlbnRpdHksIHVyaSwgdW5kZWZpbmVkLCB0cnVlKSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcblx0XHRcdFx0XHRkaXNjb3ZlcmVkLnB1c2goZmlsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZGlzY292ZXJlZC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHIgPSBhd2FpdCB0ZXN0U2VydmljZS5ydW5UZXN0cyh7IHRlc3RzOiBkaXNjb3ZlcmVkLCBncm91cDogdGhpcy5ncm91cCB9KTtcblx0XHRcdHJldHVybiB7IGNvbXBsZXRlZEF0OiByLmNvbXBsZXRlZEF0IH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgY29tcGxldGVkQXQ6IHVuZGVmaW5lZCB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZmlsZXM/OiBVUklbXSkge1xuXHRcdGlmIChmaWxlcz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcnVuQnlVcmlzKGFjY2Vzc29yLCBmaWxlcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJpSWRlbnRpdHkgPSBhY2Nlc3Nvci5nZXQoSVVyaUlkZW50aXR5U2VydmljZSk7XG5cdFx0bGV0IGVkaXRvciA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpLmdldEFjdGl2ZUNvZGVFZGl0b3IoKTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0KSB7XG5cdFx0XHRlZGl0b3IgPSBlZGl0b3IuZ2V0UGFyZW50RWRpdG9yKCk7XG5cdFx0fVxuXHRcdGNvbnN0IHBvc2l0aW9uID0gZWRpdG9yPy5nZXRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yPy5nZXRNb2RlbCgpO1xuXHRcdGlmICghcG9zaXRpb24gfHwgIW1vZGVsIHx8ICEoJ3VyaScgaW4gbW9kZWwpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKTtcblxuXHRcdC8vIEl0ZXJhdGUgdGhyb3VnaCB0aGUgZW50aXJlIGNvbGxlY3Rpb24gYW5kIHJ1biBhbnkgdGVzdHMgdGhhdCBhcmUgaW4gdGhlXG5cdFx0Ly8gdXJpLiBTZWUgIzEzODAwNy5cblx0XHRjb25zdCBxdWV1ZSA9IFt0ZXN0U2VydmljZS5jb2xsZWN0aW9uLnJvb3RJZHNdO1xuXHRcdGNvbnN0IGRpc2NvdmVyZWQ6IEludGVybmFsVGVzdEl0ZW1bXSA9IFtdO1xuXHRcdHdoaWxlIChxdWV1ZS5sZW5ndGgpIHtcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgcXVldWUucG9wKCkhKSB7XG5cdFx0XHRcdGNvbnN0IG5vZGUgPSB0ZXN0U2VydmljZS5jb2xsZWN0aW9uLmdldE5vZGVCeUlkKGlkKSE7XG5cdFx0XHRcdGlmICh1cmlJZGVudGl0eS5leHRVcmkuaXNFcXVhbChub2RlLml0ZW0udXJpLCBtb2RlbC51cmkpKSB7XG5cdFx0XHRcdFx0ZGlzY292ZXJlZC5wdXNoKG5vZGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHF1ZXVlLnB1c2gobm9kZS5jaGlsZHJlbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZGlzY292ZXJlZC5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0ZXN0U2VydmljZS5ydW5UZXN0cyh7XG5cdFx0XHRcdHRlc3RzOiBkaXNjb3ZlcmVkLFxuXHRcdFx0XHRncm91cDogdGhpcy5ncm91cCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdE1lc3NhZ2VDb250cm9sbGVyLmdldChlZGl0b3IpPy5zaG93TWVzc2FnZShsb2NhbGl6ZSgnbm9UZXN0c0luRmlsZScsIFwiTm8gdGVzdHMgZm91bmQgaW4gdGhpcyBmaWxlXCIpLCBwb3NpdGlvbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUnVuQ3VycmVudEZpbGUgZXh0ZW5kcyBFeGVjdXRlVGVzdHNJbkN1cnJlbnRGaWxlIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5SdW5DdXJyZW50RmlsZSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcucnVuQ3VycmVudEZpbGUnLCAnUnVuIFRlc3RzIGluIEN1cnJlbnQgRmlsZScpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TZW1pY29sb24sIEtleUNvZGUuS2V5RiksXG5cdFx0XHR9LFxuXHRcdH0sIFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1bik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlYnVnQ3VycmVudEZpbGUgZXh0ZW5kcyBFeGVjdXRlVGVzdHNJbkN1cnJlbnRGaWxlIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuRGVidWdDdXJyZW50RmlsZSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuZGVidWdDdXJyZW50RmlsZScsICdEZWJ1ZyBUZXN0cyBpbiBDdXJyZW50IEZpbGUnKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5RiksXG5cdFx0XHR9LFxuXHRcdH0sIFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ292ZXJhZ2VDdXJyZW50RmlsZSBleHRlbmRzIEV4ZWN1dGVUZXN0c0luQ3VycmVudEZpbGUge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5Db3ZlcmFnZUN1cnJlbnRGaWxlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5jb3ZlcmFnZUN1cnJlbnRGaWxlJywgJ1J1biBUZXN0cyB3aXRoIENvdmVyYWdlIGluIEN1cnJlbnQgRmlsZScpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TZW1pY29sb24sIEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlGKSxcblx0XHRcdH0sXG5cdFx0fSwgVGVzdFJ1blByb2ZpbGVCaXRzZXQuQ292ZXJhZ2UpO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBkaXNjb3ZlckFuZFJ1blRlc3RzID0gYXN5bmMgKFxuXHRjb2xsZWN0aW9uOiBJTWFpblRocmVhZFRlc3RDb2xsZWN0aW9uLFxuXHRwcm9ncmVzczogSVByb2dyZXNzU2VydmljZSxcblx0aWRzOiBSZWFkb25seUFycmF5PHN0cmluZz4sXG5cdHJ1blRlc3RzOiAodGVzdHM6IFJlYWRvbmx5QXJyYXk8SW50ZXJuYWxUZXN0SXRlbT4pID0+IFByb21pc2U8SVRlc3RSZXN1bHQ+LFxuKTogUHJvbWlzZTxJVGVzdFJlc3VsdCB8IHVuZGVmaW5lZD4gPT4ge1xuXHRjb25zdCB0b2RvID0gUHJvbWlzZS5hbGwoaWRzLm1hcChwID0+IGV4cGFuZEFuZEdldFRlc3RCeUlkKGNvbGxlY3Rpb24sIHApKSk7XG5cdGNvbnN0IHRlc3RzID0gKGF3YWl0IHNob3dEaXNjb3ZlcmluZ1doaWxlKHByb2dyZXNzLCB0b2RvKSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cdHJldHVybiB0ZXN0cy5sZW5ndGggPyBhd2FpdCBydW5UZXN0cyh0ZXN0cykgOiB1bmRlZmluZWQ7XG59O1xuXG5hYnN0cmFjdCBjbGFzcyBSdW5PckRlYnVnRXh0c0J5UGF0aCBleHRlbmRzIEFjdGlvbjIge1xuXHQvKipcblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFNlcnZpY2UpO1xuXHRcdGF3YWl0IGRpc2NvdmVyQW5kUnVuVGVzdHMoXG5cdFx0XHRhY2Nlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKS5jb2xsZWN0aW9uLFxuXHRcdFx0YWNjZXNzb3IuZ2V0KElQcm9ncmVzc1NlcnZpY2UpLFxuXHRcdFx0Wy4uLnRoaXMuZ2V0VGVzdEV4dElkc1RvUnVuKGFjY2Vzc29yLCAuLi5hcmdzKV0sXG5cdFx0XHR0ZXN0cyA9PiB0aGlzLnJ1blRlc3QodGVzdFNlcnZpY2UsIHRlc3RzKSxcblx0XHQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldFRlc3RFeHRJZHNUb1J1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogSXRlcmFibGU8c3RyaW5nPjtcblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgcnVuVGVzdChzZXJ2aWNlOiBJVGVzdFNlcnZpY2UsIG5vZGU6IHJlYWRvbmx5IEludGVybmFsVGVzdEl0ZW1bXSk6IFByb21pc2U8SVRlc3RSZXN1bHQ+O1xufVxuXG5hYnN0cmFjdCBjbGFzcyBSdW5PckRlYnVnRmFpbGVkVGVzdHMgZXh0ZW5kcyBSdW5PckRlYnVnRXh0c0J5UGF0aCB7XG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IElBY3Rpb24yT3B0aW9ucykge1xuXHRcdHN1cGVyKHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IGhhc0FueVRlc3RQcm92aWRlcixcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwcm90ZWN0ZWQgZ2V0VGVzdEV4dElkc1RvUnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgeyByZXN1bHRzIH0gPSBhY2Nlc3Nvci5nZXQoSVRlc3RSZXN1bHRTZXJ2aWNlKTtcblx0XHRjb25zdCBpZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGxldCBpID0gcmVzdWx0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgcmVzdWx0U2V0ID0gcmVzdWx0c1tpXTtcblx0XHRcdGZvciAoY29uc3QgdGVzdCBvZiByZXN1bHRTZXQudGVzdHMpIHtcblx0XHRcdFx0aWYgKGlzRmFpbGVkU3RhdGUodGVzdC5vd25Db21wdXRlZFN0YXRlKSkge1xuXHRcdFx0XHRcdGlkcy5hZGQodGVzdC5pdGVtLmV4dElkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZHMuZGVsZXRlKHRlc3QuaXRlbS5leHRJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gaWRzO1xuXHR9XG59XG5cblxuYWJzdHJhY3QgY2xhc3MgUnVuT3JEZWJ1Z0xhc3RSdW4gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3Iob3B0aW9uczogSUFjdGlvbjJPcHRpb25zKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdGhhc0FueVRlc3RQcm92aWRlcixcblx0XHRcdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuaGFzQW55UmVzdWx0cy5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRcdCksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldEdyb3VwKCk6IFRlc3RSdW5Qcm9maWxlQml0c2V0O1xuXG5cdHByb3RlY3RlZCBnZXRMYXN0VGVzdFJ1blJlcXVlc3QoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJ1bklkPzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgcmVzdWx0U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFJlc3VsdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhc3RSZXN1bHQgPSBydW5JZCA/IHJlc3VsdFNlcnZpY2UucmVzdWx0cy5maW5kKHIgPT4gci5pZCA9PT0gcnVuSWQpIDogcmVzdWx0U2VydmljZS5yZXN1bHRzWzBdO1xuXHRcdHJldHVybiBsYXN0UmVzdWx0Py5yZXF1ZXN0O1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJ1bklkPzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgcmVzdWx0U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFJlc3VsdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhc3RSZXN1bHQgPSBydW5JZCA/IHJlc3VsdFNlcnZpY2UucmVzdWx0cy5maW5kKHIgPT4gci5pZCA9PT0gcnVuSWQpIDogcmVzdWx0U2VydmljZS5yZXN1bHRzWzBdO1xuXHRcdGlmICghbGFzdFJlc3VsdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcSA9IGxhc3RSZXN1bHQucmVxdWVzdDtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb2ZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXN0UHJvZmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb2ZpbGVFeGlzdHMgPSAodDogeyBjb250cm9sbGVySWQ6IHN0cmluZzsgcHJvZmlsZUlkOiBudW1iZXIgfSkgPT5cblx0XHRcdHByb2ZpbGVTZXJ2aWNlLmdldENvbnRyb2xsZXJQcm9maWxlcyh0LmNvbnRyb2xsZXJJZCkuc29tZShwID0+IHAucHJvZmlsZUlkID09PSB0LnByb2ZpbGVJZCk7XG5cblx0XHRhd2FpdCBkaXNjb3ZlckFuZFJ1blRlc3RzKFxuXHRcdFx0dGVzdFNlcnZpY2UuY29sbGVjdGlvbixcblx0XHRcdGFjY2Vzc29yLmdldChJUHJvZ3Jlc3NTZXJ2aWNlKSxcblx0XHRcdHJlcS50YXJnZXRzLmZsYXRNYXAodCA9PiB0LnRlc3RJZHMpLFxuXHRcdFx0dGVzdHMgPT4ge1xuXHRcdFx0XHQvLyBJZiB3ZSdyZSByZXF1ZXN0aW5nIGEgcmUtcnVuIGluIHRoZSBzYW1lIGdyb3VwIGFuZCBoYXZlIHRoZSBzYW1lIHByb2ZpbGVzXG5cdFx0XHRcdC8vIGFzIHdlcmUgdXNlZCBiZWZvcmUsIHRoZW4gdXNlIHRob3NlIGV4YWN0bHkuIE90aGVyd2lzZSBndWVzcyBuYWl2ZWx5LlxuXHRcdFx0XHRpZiAodGhpcy5nZXRHcm91cCgpICYgcmVxLmdyb3VwICYmIHJlcS50YXJnZXRzLmV2ZXJ5KHByb2ZpbGVFeGlzdHMpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRlc3RTZXJ2aWNlLnJ1blJlc29sdmVkVGVzdHMoe1xuXHRcdFx0XHRcdFx0dGFyZ2V0czogcmVxLnRhcmdldHMsXG5cdFx0XHRcdFx0XHRncm91cDogcmVxLmdyb3VwLFxuXHRcdFx0XHRcdFx0ZXhjbHVkZTogcmVxLmV4Y2x1ZGUsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRlc3RTZXJ2aWNlLnJ1blRlc3RzKHsgdGVzdHMsIGdyb3VwOiB0aGlzLmdldEdyb3VwKCkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVSdW5GYWlsZWRUZXN0cyBleHRlbmRzIFJ1bk9yRGVidWdGYWlsZWRUZXN0cyB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlJlUnVuRmFpbGVkVGVzdHMsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnJlUnVuRmFpbFRlc3RzJywgJ1JlcnVuIEZhaWxlZCBUZXN0cycpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlDb2RlLktleUUpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBydW5UZXN0KHNlcnZpY2U6IElUZXN0U2VydmljZSwgaW50ZXJuYWxUZXN0czogSW50ZXJuYWxUZXN0SXRlbVtdKTogUHJvbWlzZTxJVGVzdFJlc3VsdD4ge1xuXHRcdHJldHVybiBzZXJ2aWNlLnJ1blRlc3RzKHtcblx0XHRcdGdyb3VwOiBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4sXG5cdFx0XHR0ZXN0czogaW50ZXJuYWxUZXN0cyxcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVidWdGYWlsZWRUZXN0cyBleHRlbmRzIFJ1bk9yRGVidWdGYWlsZWRUZXN0cyB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkRlYnVnRmFpbGVkVGVzdHMsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLmRlYnVnRmFpbFRlc3RzJywgJ0RlYnVnIEZhaWxlZCBUZXN0cycpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5RSksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJ1blRlc3Qoc2VydmljZTogSVRlc3RTZXJ2aWNlLCBpbnRlcm5hbFRlc3RzOiBJbnRlcm5hbFRlc3RJdGVtW10pOiBQcm9taXNlPElUZXN0UmVzdWx0PiB7XG5cdFx0cmV0dXJuIHNlcnZpY2UucnVuVGVzdHMoe1xuXHRcdFx0Z3JvdXA6IFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnLFxuXHRcdFx0dGVzdHM6IGludGVybmFsVGVzdHMsXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlUnVuTGFzdFJ1biBleHRlbmRzIFJ1bk9yRGVidWdMYXN0UnVuIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuUmVSdW5MYXN0UnVuLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5yZVJ1bkxhc3RSdW4nLCAnUmVydW4gTGFzdCBSdW4nKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNlbWljb2xvbiwgS2V5Q29kZS5LZXlMKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0R3JvdXAoKTogVGVzdFJ1blByb2ZpbGVCaXRzZXQge1xuXHRcdHJldHVybiBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW47XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlYnVnTGFzdFJ1biBleHRlbmRzIFJ1bk9yRGVidWdMYXN0UnVuIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuRGVidWdMYXN0UnVuLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5kZWJ1Z0xhc3RSdW4nLCAnRGVidWcgTGFzdCBSdW4nKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNlbWljb2xvbiwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUwpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRHcm91cCgpOiBUZXN0UnVuUHJvZmlsZUJpdHNldCB7XG5cdFx0cmV0dXJuIFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb3ZlcmFnZUxhc3RSdW4gZXh0ZW5kcyBSdW5PckRlYnVnTGFzdFJ1biB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkNvdmVyYWdlTGFzdFJ1bixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuY292ZXJhZ2VMYXN0UnVuJywgJ1JlcnVuIExhc3QgUnVuIHdpdGggQ292ZXJhZ2UnKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNlbWljb2xvbiwgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUwpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRHcm91cCgpOiBUZXN0UnVuUHJvZmlsZUJpdHNldCB7XG5cdFx0cmV0dXJuIFRlc3RSdW5Qcm9maWxlQml0c2V0LkNvdmVyYWdlO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIFJ1bk9yRGVidWdGYWlsZWRGcm9tTGFzdFJ1biBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBJQWN0aW9uMk9wdGlvbnMpIHtcblx0XHRzdXBlcih7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0aGFzQW55VGVzdFByb3ZpZGVyLFxuXHRcdFx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5oYXNBbnlSZXN1bHRzLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdFx0KSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0R3JvdXAoKTogVGVzdFJ1blByb2ZpbGVCaXRzZXQ7XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJ1bklkPzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgcmVzdWx0U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdFJlc3VsdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXN0U2VydmljZSk7XG5cdFx0Y29uc3QgcHJvZ3Jlc3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcm9ncmVzc1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbGFzdFJlc3VsdCA9IHJ1bklkID8gcmVzdWx0U2VydmljZS5yZXN1bHRzLmZpbmQociA9PiByLmlkID09PSBydW5JZCkgOiByZXN1bHRTZXJ2aWNlLnJlc3VsdHNbMF07XG5cdFx0aWYgKCFsYXN0UmVzdWx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmFpbGVkVGVzdElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgdGVzdCBvZiBsYXN0UmVzdWx0LnRlc3RzKSB7XG5cdFx0XHRpZiAoaXNGYWlsZWRTdGF0ZSh0ZXN0Lm93bkNvbXB1dGVkU3RhdGUpKSB7XG5cdFx0XHRcdGZhaWxlZFRlc3RJZHMuYWRkKHRlc3QuaXRlbS5leHRJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGZhaWxlZFRlc3RJZHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IGRpc2NvdmVyQW5kUnVuVGVzdHMoXG5cdFx0XHR0ZXN0U2VydmljZS5jb2xsZWN0aW9uLFxuXHRcdFx0cHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdFx0QXJyYXkuZnJvbShmYWlsZWRUZXN0SWRzKSxcblx0XHRcdHRlc3RzID0+IHRlc3RTZXJ2aWNlLnJ1blRlc3RzKHsgdGVzdHMsIGdyb3VwOiB0aGlzLmdldEdyb3VwKCkgfSksXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVSdW5GYWlsZWRGcm9tTGFzdFJ1biBleHRlbmRzIFJ1bk9yRGVidWdGYWlsZWRGcm9tTGFzdFJ1biB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlJlUnVuRmFpbGVkRnJvbUxhc3RSdW4sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnJlUnVuRmFpbGVkRnJvbUxhc3RSdW4nLCAnUmVydW4gRmFpbGVkIFRlc3RzIGZyb20gTGFzdCBSdW4nKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldEdyb3VwKCk6IFRlc3RSdW5Qcm9maWxlQml0c2V0IHtcblx0XHRyZXR1cm4gVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z0ZhaWxlZEZyb21MYXN0UnVuIGV4dGVuZHMgUnVuT3JEZWJ1Z0ZhaWxlZEZyb21MYXN0UnVuIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuRGVidWdGYWlsZWRGcm9tTGFzdFJ1bixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuZGVidWdGYWlsZWRGcm9tTGFzdFJ1bicsICdEZWJ1ZyBGYWlsZWQgVGVzdHMgZnJvbSBMYXN0IFJ1bicpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0R3JvdXAoKTogVGVzdFJ1blByb2ZpbGVCaXRzZXQge1xuXHRcdHJldHVybiBUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1Zztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2VhcmNoRm9yVGVzdEV4dGVuc2lvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5TZWFyY2hGb3JUZXN0RXh0ZW5zaW9uLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5zZWFyY2hGb3JUZXN0RXh0ZW5zaW9uJywgJ1NlYXJjaCBmb3IgVGVzdCBFeHRlbnNpb24nKSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKS5vcGVuU2VhcmNoKCdAY2F0ZWdvcnk6XCJ0ZXN0aW5nXCInKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3Blbk91dHB1dFBlZWsgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuT3Blbk91dHB1dFBlZWssXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLm9wZW5PdXRwdXRQZWVrJywgJ1BlZWsgT3V0cHV0JyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TZW1pY29sb24sIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlNKSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5oYXNBbnlSZXN1bHRzLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0YWNjZXNzb3IuZ2V0KElUZXN0aW5nUGVla09wZW5lcikub3BlbigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVJbmxpbmVUZXN0T3V0cHV0IGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlRvZ2dsZUlubGluZVRlc3RPdXRwdXQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnRvZ2dsZUlubGluZVRlc3RPdXRwdXQnLCAnVG9nZ2xlIElubGluZSBUZXN0IE91dHB1dCcpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SSksXG5cdFx0XHR9LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMuaGFzQW55UmVzdWx0cy5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXN0U2VydmljZSk7XG5cdFx0dGVzdFNlcnZpY2Uuc2hvd0lubGluZU91dHB1dC52YWx1ZSA9ICF0ZXN0U2VydmljZS5zaG93SW5saW5lT3V0cHV0LnZhbHVlO1xuXHR9XG59XG5cbmNvbnN0IHJlZnJlc2hNZW51cyA9ICh3aGVuSXNSZWZyZXNoaW5nOiBib29sZWFuKTogSUFjdGlvbjJPcHRpb25zWydtZW51J10gPT4gW1xuXHR7XG5cdFx0aWQ6IE1lbnVJZC5UZXN0SXRlbSxcblx0XHRncm91cDogJ2lubGluZScsXG5cdFx0b3JkZXI6IEFjdGlvbk9yZGVyLlJlZnJlc2gsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmNhblJlZnJlc2hUZXN0cy5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuaXNSZWZyZXNoaW5nVGVzdHMuaXNFcXVhbFRvKHdoZW5Jc1JlZnJlc2hpbmcpLFxuXHRcdCksXG5cdH0sXG5cdHtcblx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdG9yZGVyOiBBY3Rpb25PcmRlci5SZWZyZXNoLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRlc3RpbmcuRXhwbG9yZXJWaWV3SWQpLFxuXHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmNhblJlZnJlc2hUZXN0cy5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuaXNSZWZyZXNoaW5nVGVzdHMuaXNFcXVhbFRvKHdoZW5Jc1JlZnJlc2hpbmcpLFxuXHRcdCksXG5cdH0sXG5cdHtcblx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5jYW5SZWZyZXNoVGVzdHMuaXNFcXVhbFRvKHRydWUpLFxuXHR9LFxuXTtcblxuZXhwb3J0IGNsYXNzIFJlZnJlc2hUZXN0c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5SZWZyZXNoVGVzdHNBY3Rpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnJlZnJlc2hUZXN0cycsICdSZWZyZXNoIFRlc3RzJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGljb246IGljb25zLnRlc3RpbmdSZWZyZXNoVGVzdHMsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2VtaWNvbG9uLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5UiksXG5cdFx0XHRcdHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5jYW5SZWZyZXNoVGVzdHMuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHJlZnJlc2hNZW51cyhmYWxzZSksXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5lbGVtZW50czogVGVzdEl0ZW1UcmVlRWxlbWVudFtdKSB7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9ncmVzc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByb2dyZXNzU2VydmljZSk7XG5cblx0XHRjb25zdCBjb250cm9sbGVySWRzID0gZGlzdGluY3QoZWxlbWVudHMuZmlsdGVyKGlzRGVmaW5lZCkubWFwKGUgPT4gZS50ZXN0LmNvbnRyb2xsZXJJZCkpO1xuXHRcdHJldHVybiBwcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IFRlc3RpbmcuVmlld2xldElkIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChjb250cm9sbGVySWRzLmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChjb250cm9sbGVySWRzLm1hcChpZCA9PiB0ZXN0U2VydmljZS5yZWZyZXNoVGVzdHMoaWQpKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0ZXN0U2VydmljZS5yZWZyZXNoVGVzdHMoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2FuY2VsVGVzdFJlZnJlc2hBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuQ2FuY2VsVGVzdFJlZnJlc2hBY3Rpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLmNhbmNlbFRlc3RSZWZyZXNoJywgJ0NhbmNlbCBUZXN0IFJlZnJlc2gnKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0aWNvbjogaWNvbnMudGVzdGluZ0NhbmNlbFJlZnJlc2hUZXN0cyxcblx0XHRcdG1lbnU6IHJlZnJlc2hNZW51cyh0cnVlKSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRhY2Nlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKS5jYW5jZWxSZWZyZXNoVGVzdHMoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2xlYXJlQ292ZXJhZ2UgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuQ292ZXJhZ2VDbGVhcixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuY2xlYXJDb3ZlcmFnZScsICdDbGVhciBDb3ZlcmFnZScpLFxuXHRcdFx0aWNvbjogd2lkZ2V0Q2xvc2UsXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogQWN0aW9uT3JkZXIuUmVmcmVzaCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVGVzdGluZy5Db3ZlcmFnZVZpZXdJZClcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLmlzVGVzdENvdmVyYWdlT3Blbi5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGFjY2Vzc29yLmdldChJVGVzdENvdmVyYWdlU2VydmljZSkuY2xvc2VDb3ZlcmFnZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuQ292ZXJhZ2UgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuT3BlbkNvdmVyYWdlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5vcGVuQ292ZXJhZ2UnLCAnT3BlbiBDb3ZlcmFnZScpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMuaGFzQW55UmVzdWx0cy5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBhY2Nlc3Nvci5nZXQoSVRlc3RSZXN1bHRTZXJ2aWNlKS5yZXN1bHRzO1xuXHRcdGNvbnN0IHRhc2sgPSByZXN1bHRzLmxlbmd0aCAmJiByZXN1bHRzWzBdLnRhc2tzLmZpbmQociA9PiByLmNvdmVyYWdlKTtcblx0XHRpZiAoIXRhc2spIHtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5pbmZvKGxvY2FsaXplKCd0ZXN0aW5nLm5vQ292ZXJhZ2UnLCAnTm8gY292ZXJhZ2UgaW5mb3JtYXRpb24gYXZhaWxhYmxlIG9uIHRoZSBsYXN0IHRlc3QgcnVuLicpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhY2Nlc3Nvci5nZXQoSVRlc3RDb3ZlcmFnZVNlcnZpY2UpLm9wZW5Db3ZlcmFnZSh0YXNrLCB0cnVlKTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBUZXN0TmF2aWdhdGlvbkFjdGlvbiBleHRlbmRzIFN5bWJvbE5hdmlnYXRpb25BY3Rpb24ge1xuXHRwcm90ZWN0ZWQgdGVzdFNlcnZpY2UhOiBJVGVzdFNlcnZpY2U7IC8vIGxpdHRsZSBoYWNrLi4uXG5cdHByb3RlY3RlZCB1cmlJZGVudGl0eVNlcnZpY2UhOiBJVXJpSWRlbnRpdHlTZXJ2aWNlO1xuXG5cdG92ZXJyaWRlIHJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdHRoaXMudGVzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RTZXJ2aWNlKTtcblx0XHR0aGlzLnVyaUlkZW50aXR5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRyZXR1cm4gc3VwZXIucnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvciwgZWRpdG9yLCAuLi5hcmdzKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZ2V0QWx0ZXJuYXRpdmVDb21tYW5kKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IpOiBzdHJpbmcge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5nb3RvTG9jYXRpb24pLmFsdGVybmF0aXZlVGVzdHNDb21tYW5kO1xuXHR9XG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZ2V0R29Ub1ByZWZlcmVuY2UoZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcik6IEdvVG9Mb2NhdGlvblZhbHVlcyB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmdvdG9Mb2NhdGlvbikubXVsdGlwbGVUZXN0cyB8fCAncGVlayc7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgR29Ub1JlbGF0ZWRUZXN0QWN0aW9uIGV4dGVuZHMgVGVzdE5hdmlnYXRpb25BY3Rpb24ge1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgX2dldExvY2F0aW9uTW9kZWwoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiB1bmtub3duLCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlZmVyZW5jZXNNb2RlbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRlc3RzID0gYXdhaXQgdGhpcy50ZXN0U2VydmljZS5nZXRUZXN0c1JlbGF0ZWRUb0NvZGUobW9kZWwudXJpLCBwb3NpdGlvbiwgdG9rZW4pO1xuXHRcdHJldHVybiBuZXcgUmVmZXJlbmNlc01vZGVsKFxuXHRcdFx0dGVzdHMubWFwKHQgPT4gdC5pdGVtLnVyaSAmJiAoeyB1cmk6IHQuaXRlbS51cmksIHJhbmdlOiB0Lml0ZW0ucmFuZ2UgfHwgbmV3IFJhbmdlKDEsIDEsIDEsIDEpIH0pKS5maWx0ZXIoaXNEZWZpbmVkKSxcblx0XHRcdGxvY2FsaXplKCdyZWxhdGVkVGVzdHMnLCAnUmVsYXRlZCBUZXN0cycpLFxuXHRcdCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2dldE5vUmVzdWx0Rm91bmRNZXNzYWdlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdub1Rlc3RGb3VuZCcsICdObyByZWxhdGVkIHRlc3RzIGZvdW5kLicpO1xuXHR9XG59XG5cbmNsYXNzIEdvVG9SZWxhdGVkVGVzdCBleHRlbmRzIEdvVG9SZWxhdGVkVGVzdEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdG9wZW5Ub1NpZGU6IGZhbHNlLFxuXHRcdFx0b3BlbkluUGVlazogZmFsc2UsXG5cdFx0XHRtdXRlTWVzc2FnZTogZmFsc2Vcblx0XHR9LCB7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5Hb1RvUmVsYXRlZFRlc3QsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLmdvVG9SZWxhdGVkVGVzdCcsICdHbyB0byBSZWxhdGVkIFRlc3QnKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdC8vIHRvZG9AY29ubm9yNDMxMjogbWFrZSB0aGlzIG1vcmUgZXhwbGljaXQgYmFzZWQgb24gY3Vyc29yIHBvc2l0aW9uXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdChUZXN0aW5nQ29udGV4dEtleXMuYWN0aXZlRWRpdG9ySGFzVGVzdHMua2V5KSwgVGVzdGluZ0NvbnRleHRLZXlzLmNhbkdvVG9SZWxhdGVkVGVzdCxcblx0XHRcdCksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAndGVzdGluZycsXG5cdFx0XHRcdG9yZGVyOiBFZGl0b3JDb250ZXh0T3JkZXIuR29Ub1JlbGF0ZWQsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIFBlZWtSZWxhdGVkVGVzdCBleHRlbmRzIEdvVG9SZWxhdGVkVGVzdEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdG9wZW5Ub1NpZGU6IGZhbHNlLFxuXHRcdFx0b3BlbkluUGVlazogdHJ1ZSxcblx0XHRcdG11dGVNZXNzYWdlOiBmYWxzZVxuXHRcdH0sIHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlBlZWtSZWxhdGVkVGVzdCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcucGVla1RvUmVsYXRlZFRlc3QnLCAnUGVlayBSZWxhdGVkIFRlc3QnKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5jYW5Hb1RvUmVsYXRlZFRlc3QsXG5cdFx0XHRcdC8vIHRvZG9AY29ubm9yNDMxMjogbWFrZSB0aGlzIG1vcmUgZXhwbGljaXQgYmFzZWQgb24gY3Vyc29yIHBvc2l0aW9uXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdChUZXN0aW5nQ29udGV4dEtleXMuYWN0aXZlRWRpdG9ySGFzVGVzdHMua2V5KSxcblx0XHRcdFx0UGVla0NvbnRleHQubm90SW5QZWVrRWRpdG9yLFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5pc0luRW1iZWRkZWRFZGl0b3IudG9OZWdhdGVkKClcblx0XHRcdCksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAndGVzdGluZycsXG5cdFx0XHRcdG9yZGVyOiBFZGl0b3JDb250ZXh0T3JkZXIuUGVla1JlbGF0ZWQsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEdvVG9SZWxhdGVkQ29kZUFjdGlvbiBleHRlbmRzIFRlc3ROYXZpZ2F0aW9uQWN0aW9uIHtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9nZXRMb2NhdGlvbk1vZGVsKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZTogdW5rbm93biwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxSZWZlcmVuY2VzTW9kZWwgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB0ZXN0c0F0Q3Vyc29yID0gYXdhaXQgZ2V0VGVzdHNBdEN1cnNvcih0aGlzLnRlc3RTZXJ2aWNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZSwgbW9kZWwudXJpLCBwb3NpdGlvbik7XG5cdFx0Y29uc3QgY29kZSA9IGF3YWl0IFByb21pc2UuYWxsKHRlc3RzQXRDdXJzb3IubWFwKHQgPT4gdGhpcy50ZXN0U2VydmljZS5nZXRDb2RlUmVsYXRlZFRvVGVzdCh0KSkpO1xuXHRcdHJldHVybiBuZXcgUmVmZXJlbmNlc01vZGVsKGNvZGUuZmxhdCgpLCBsb2NhbGl6ZSgncmVsYXRlZENvZGUnLCAnUmVsYXRlZCBDb2RlJykpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9nZXROb1Jlc3VsdEZvdW5kTWVzc2FnZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnbm9SZWxhdGVkQ29kZScsICdObyByZWxhdGVkIGNvZGUgZm91bmQuJyk7XG5cdH1cbn1cblxuY2xhc3MgR29Ub1JlbGF0ZWRDb2RlIGV4dGVuZHMgR29Ub1JlbGF0ZWRDb2RlQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0b3BlblRvU2lkZTogZmFsc2UsXG5cdFx0XHRvcGVuSW5QZWVrOiBmYWxzZSxcblx0XHRcdG11dGVNZXNzYWdlOiBmYWxzZVxuXHRcdH0sIHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkdvVG9SZWxhdGVkQ29kZSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuZ29Ub1JlbGF0ZWRDb2RlJywgJ0dvIHRvIFJlbGF0ZWQgQ29kZScpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmFjdGl2ZUVkaXRvckhhc1Rlc3RzLFxuXHRcdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuY2FuR29Ub1JlbGF0ZWRDb2RlLFxuXHRcdFx0KSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICd0ZXN0aW5nJyxcblx0XHRcdFx0b3JkZXI6IEVkaXRvckNvbnRleHRPcmRlci5Hb1RvUmVsYXRlZCxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgUGVla1JlbGF0ZWRDb2RlIGV4dGVuZHMgR29Ub1JlbGF0ZWRDb2RlQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0b3BlblRvU2lkZTogZmFsc2UsXG5cdFx0XHRvcGVuSW5QZWVrOiB0cnVlLFxuXHRcdFx0bXV0ZU1lc3NhZ2U6IGZhbHNlXG5cdFx0fSwge1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuUGVla1JlbGF0ZWRDb2RlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5wZWVrVG9SZWxhdGVkQ29kZScsICdQZWVrIFJlbGF0ZWQgQ29kZScpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmFjdGl2ZUVkaXRvckhhc1Rlc3RzLFxuXHRcdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuY2FuR29Ub1JlbGF0ZWRDb2RlLFxuXHRcdFx0XHRQZWVrQ29udGV4dC5ub3RJblBlZWtFZGl0b3IsXG5cdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmlzSW5FbWJlZGRlZEVkaXRvci50b05lZ2F0ZWQoKVxuXHRcdFx0KSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICd0ZXN0aW5nJyxcblx0XHRcdFx0b3JkZXI6IEVkaXRvckNvbnRleHRPcmRlci5QZWVrUmVsYXRlZCxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRvZ2dsZVJlc3VsdHNWaWV3TGF5b3V0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLlRvZ2dsZVJlc3VsdHNWaWV3TGF5b3V0QWN0aW9uLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy50b2dnbGVSZXN1bHRzVmlld0xheW91dCcsICdUb2dnbGUgVHJlZSBQb3NpdGlvbicpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLmFycm93U3dhcCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdG9yZGVyOiBBY3Rpb25PcmRlci5EaXNwbGF5TW9kZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVGVzdGluZy5SZXN1bHRzVmlld0lkKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgY3VycmVudExheW91dCA9IGdldFRlc3RpbmdDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0aW5nQ29uZmlnS2V5cy5SZXN1bHRzVmlld0xheW91dCk7XG5cdFx0Y29uc3QgbmV3TGF5b3V0ID0gY3VycmVudExheW91dCA9PT0gVGVzdGluZ1Jlc3VsdHNWaWV3TGF5b3V0LlRyZWVMZWZ0ID8gVGVzdGluZ1Jlc3VsdHNWaWV3TGF5b3V0LlRyZWVSaWdodCA6IFRlc3RpbmdSZXN1bHRzVmlld0xheW91dC5UcmVlTGVmdDtcblxuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFRlc3RpbmdDb25maWdLZXlzLlJlc3VsdHNWaWV3TGF5b3V0LCBuZXdMYXlvdXQpO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBhbGxUZXN0QWN0aW9ucyA9IFtcblx0Q2FuY2VsVGVzdFJlZnJlc2hBY3Rpb24sXG5cdENhbmNlbFRlc3RSdW5BY3Rpb24sXG5cdENsZWFyZUNvdmVyYWdlLFxuXHRDbGVhclRlc3RSZXN1bHRzQWN0aW9uLFxuXHRDb2xsYXBzZUFsbEFjdGlvbixcblx0Q29uZmlndXJlVGVzdFByb2ZpbGVzQWN0aW9uLFxuXHRDb250aW51b3VzUnVuVGVzdEFjdGlvbixcblx0Q29udGludW91c1J1blVzaW5nUHJvZmlsZVRlc3RBY3Rpb24sXG5cdENvdmVyYWdlQWN0aW9uLFxuXHRDb3ZlcmFnZUFsbEFjdGlvbixcblx0Q292ZXJhZ2VBdEN1cnNvcixcblx0Q292ZXJhZ2VDdXJyZW50RmlsZSxcblx0Q292ZXJhZ2VMYXN0UnVuLFxuXHRDb3ZlcmFnZVNlbGVjdGVkQWN0aW9uLFxuXHRDb3ZlcmFnZVRlc3RzVW5kZXJVcmksXG5cdERlYnVnQWN0aW9uLFxuXHREZWJ1Z0FsbEFjdGlvbixcblx0RGVidWdBdEN1cnNvcixcblx0RGVidWdDdXJyZW50RmlsZSxcblx0RGVidWdGYWlsZWRUZXN0cyxcblx0RGVidWdMYXN0UnVuLFxuXHREZWJ1Z1NlbGVjdGVkQWN0aW9uLFxuXHREZWJ1Z1Rlc3RzVW5kZXJVcmksXG5cdEdldEV4cGxvcmVyU2VsZWN0aW9uLFxuXHRHZXRTZWxlY3RlZFByb2ZpbGVzLFxuXHRHb1RvUmVsYXRlZENvZGUsXG5cdEdvVG9SZWxhdGVkVGVzdCxcblx0R29Ub1Rlc3QsXG5cdEhpZGVUZXN0QWN0aW9uLFxuXHRPcGVuQ292ZXJhZ2UsXG5cdE9wZW5PdXRwdXRQZWVrLFxuXHRQZWVrUmVsYXRlZENvZGUsXG5cdFBlZWtSZWxhdGVkVGVzdCxcblx0UmVmcmVzaFRlc3RzQWN0aW9uLFxuXHRSZVJ1bkZhaWxlZFRlc3RzLFxuXHRSZVJ1bkxhc3RSdW4sXG5cdFJ1bkFjdGlvbixcblx0UnVuQWxsQWN0aW9uLFxuXHRSdW5BdEN1cnNvcixcblx0UnVuQ3VycmVudEZpbGUsXG5cdFJ1blNlbGVjdGVkQWN0aW9uLFxuXHRSdW5UZXN0c1VuZGVyVXJpLFxuXHRSdW5Vc2luZ1Byb2ZpbGVBY3Rpb24sXG5cdFNlYXJjaEZvclRlc3RFeHRlbnNpb24sXG5cdFNlbGVjdERlZmF1bHRUZXN0UHJvZmlsZXMsXG5cdFNob3dNb3N0UmVjZW50T3V0cHV0QWN0aW9uLFxuXHRTdGFydENvbnRpbnVvdXNSdW5BY3Rpb24sXG5cdFN0b3BDb250aW51b3VzUnVuQWN0aW9uLFxuXHRUZXN0aW5nU29ydEJ5RHVyYXRpb25BY3Rpb24sXG5cdFRlc3RpbmdTb3J0QnlMb2NhdGlvbkFjdGlvbixcblx0VGVzdGluZ1NvcnRCeVN0YXR1c0FjdGlvbixcblx0VGVzdGluZ1ZpZXdBc0xpc3RBY3Rpb24sXG5cdFRlc3RpbmdWaWV3QXNUcmVlQWN0aW9uLFxuXHRUb2dnbGVJbmxpbmVUZXN0T3V0cHV0LFxuXHRUb2dnbGVSZXN1bHRzVmlld0xheW91dEFjdGlvbixcblx0VW5oaWRlQWxsVGVzdHNBY3Rpb24sXG5cdFVuaGlkZVRlc3RBY3Rpb24sXG5cdFJlUnVuRmFpbGVkRnJvbUxhc3RSdW4sXG5cdERlYnVnRmFpbGVkRnJvbUxhc3RSdW4sXG5dO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsVUFBVSxTQUFTLGNBQWM7QUFDMUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBaUI7QUFHMUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBd0M7QUFDakQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUEwQixjQUFjO0FBQ2pELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQXNDLDZCQUE2QjtBQUU1RSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHNCQUFzQixnQkFBZ0I7QUFDL0MsU0FBUyxrQkFBa0Isd0JBQXdCO0FBQ25ELFNBQVMsMEJBQStEO0FBQ3hFLFNBQVMsbUJBQW1CO0FBQzVC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LGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJLGNBQWM7QUFBQSxNQUNsQixPQUFPLFVBQVUsbUNBQW1DLHNCQUFzQjtBQUFBLE1BQzFFO0FBQUEsTUFDQSxNQUFNLFFBQVE7QUFBQSxNQUNkLE1BQU07QUFBQSxRQUNMLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxlQUFlLE9BQU8sUUFBUSxRQUFRLGFBQWE7QUFBQSxNQUMxRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQXNCLElBQUksVUFBNEI7QUFDckQsVUFBTSx1QkFBdUIsU0FBUyxJQUFJLHFCQUFxQjtBQUMvRCxVQUFNLGdCQUFnQix3QkFBd0Isc0JBQXNCLGtCQUFrQixpQkFBaUI7QUFDdkcsVUFBTSxZQUFZLGtCQUFrQix5QkFBeUIsV0FBVyx5QkFBeUIsWUFBWSx5QkFBeUI7QUFFdEksVUFBTSxxQkFBcUIsWUFBWSxrQkFBa0IsbUJBQW1CLFNBQVM7QUFBQSxFQUN0RjtBQUNEO0FBRU8sTUFBTSxpQkFBaUI7QUFBQSxFQUM3QjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFDRDsiLAogICJuYW1lcyI6IFsiQWN0aW9uT3JkZXIiLCAicCIsICJFZGl0b3JDb250ZXh0T3JkZXIiLCAiZmlsZXMiXQp9Cg==
