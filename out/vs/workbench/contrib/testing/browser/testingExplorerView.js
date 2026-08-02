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
import * as dom from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { DefaultKeyboardNavigationDelegate } from "../../../../base/browser/ui/list/listWidget.js";
import { TreeVisibility } from "../../../../base/browser/ui/tree/tree.js";
import { Action, ActionRunner, Separator, toAction } from "../../../../base/common/actions.js";
import { mapFindFirst } from "../../../../base/common/arraysFind.js";
import { RunOnceScheduler, disposableTimeout } from "../../../../base/common/async.js";
import { groupBy } from "../../../../base/common/collections.js";
import { Color, RGBA } from "../../../../base/common/color.js";
import { compareFileNames } from "../../../../base/common/comparers.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, observableFromEvent } from "../../../../base/common/observable.js";
import { fuzzyContains } from "../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { isDefined } from "../../../../base/common/types.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { localize } from "../../../../nls.js";
import { DropdownWithPrimaryActionViewItem } from "../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js";
import { MenuEntryActionViewItem, createActionViewItem, getActionBarActions, getFlatContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { UnmanagedProgress } from "../../../../platform/progress/common/progress.js";
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from "../../../../platform/storage/common/storage.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { foreground } from "../../../../platform/theme/common/colorRegistry.js";
import { spinningLoading } from "../../../../platform/theme/common/iconRegistry.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { registerNavigableContainer } from "../../../browser/actions/widgetNavigationCommands.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { DiffEditorInput } from "../../../common/editor/diffEditorInput.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IActivityService, IconBadge, NumberBadge } from "../../../services/activity/common/activity.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { TestingConfigKeys, TestingCountBadge, getTestingConfiguration } from "../common/configuration.js";
import { TestCommandId, TestExplorerViewMode, TestExplorerViewSorting, Testing, labelForTestInState } from "../common/constants.js";
import { StoredValue } from "../common/storedValue.js";
import { ITestExplorerFilterState, TestFilterTerm } from "../common/testExplorerFilterState.js";
import { TestId } from "../common/testId.js";
import { ITestProfileService, canUseProfileWithTest } from "../common/testProfileService.js";
import { LiveTestResult, TestResultItemChangeReason } from "../common/testResult.js";
import { ITestResultService } from "../common/testResultService.js";
import { ITestService, testCollectionIsEmpty } from "../common/testService.js";
import { TestControllerCapability, TestItemExpandState, TestResultState, TestRunProfileBitset, testProfileBitset, testResultStateToContextValues } from "../common/testTypes.js";
import { TestingContextKeys } from "../common/testingContextKeys.js";
import { ITestingContinuousRunService } from "../common/testingContinuousRunService.js";
import { ITestingPeekOpener } from "../common/testingPeekOpener.js";
import { collectTestStateCounts, getTestProgressText } from "../common/testingProgressMessages.js";
import { cmpPriority, isFailedState, isStateWithResult, statesInOrder } from "../common/testingStates.js";
import { TestItemTreeElement, TestTreeErrorMessage } from "./explorerProjections/index.js";
import { ListProjection } from "./explorerProjections/listProjection.js";
import { getTestItemContextOverlay } from "./explorerProjections/testItemContextOverlay.js";
import { TestingObjectTree } from "./explorerProjections/testingObjectTree.js";
import { TreeProjection } from "./explorerProjections/treeProjection.js";
import * as icons from "./icons.js";
import "./media/testing.css";
import { DebugLastRun, ReRunLastRun } from "./testExplorerActions.js";
import { TestingExplorerFilter } from "./testingExplorerFilter.js";
var LastFocusState = /* @__PURE__ */ ((LastFocusState2) => {
  LastFocusState2[LastFocusState2["Input"] = 0] = "Input";
  LastFocusState2[LastFocusState2["Tree"] = 1] = "Tree";
  return LastFocusState2;
})(LastFocusState || {});
let TestingExplorerView = class extends ViewPane {
  constructor(options, contextMenuService, keybindingService, configurationService, instantiationService, viewDescriptorService, contextKeyService, openerService, themeService, testService, hoverService, testProfileService, commandService, menuService, crService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.testService = testService;
    this.testProfileService = testProfileService;
    this.commandService = commandService;
    this.menuService = menuService;
    this.crService = crService;
    this.filterActionBar = this._register(new MutableDisposable());
    this.discoveryProgress = this._register(new MutableDisposable());
    this.filter = this._register(new MutableDisposable());
    this.filterFocusListener = this._register(new MutableDisposable());
    this.dimensions = { width: 0, height: 0 };
    this.lastFocusState = 0 /* Input */;
    const relayout = this._register(new RunOnceScheduler(() => this.layoutBody(), 1));
    this._register(this.onDidChangeViewWelcomeState(() => {
      if (!this.shouldShowWelcome()) {
        relayout.schedule();
      }
    }));
    this._register(Event.any(crService.onDidChange, testProfileService.onDidChange)(() => {
      this.updateActions();
    }));
    this._register(testService.collection.onBusyProvidersChange((busy) => {
      this.updateDiscoveryProgress(busy);
    }));
    this._register(testProfileService.onDidChange(() => this.updateActions()));
  }
  get focusedTreeElements() {
    return this.viewModel.tree.getFocus().filter(isDefined);
  }
  shouldShowWelcome() {
    return this.viewModel?.welcomeExperience === 1 /* ForWorkspace */;
  }
  focus() {
    super.focus();
    if (this.lastFocusState === 1 /* Tree */) {
      this.viewModel.tree.domFocus();
    } else {
      this.filter.value?.focus();
    }
  }
  /**
   * Gets include/exclude items in the tree, based either on visible tests
   * or a use selection. If a profile is given, only tests in that profile
   * are collected. If a bitset is given, any test that can run in that
   * bitset is collected.
   */
  getTreeIncludeExclude(profileOrBitset, withinItems, filterToType = "visible") {
    const projection = this.viewModel.projection.value;
    if (!projection) {
      return { include: [], exclude: [] };
    }
    const include = /* @__PURE__ */ new Set();
    const exclude = [];
    const runnableWithProfileOrBitset = /* @__PURE__ */ new Map();
    const isRunnableWithProfileOrBitset = (item) => {
      let value = runnableWithProfileOrBitset.get(item);
      if (value === void 0) {
        value = typeof profileOrBitset === "number" ? !!this.testProfileService.getDefaultProfileForTest(profileOrBitset, item) : canUseProfileWithTest(profileOrBitset, item);
        runnableWithProfileOrBitset.set(item, value);
      }
      return value;
    };
    const attempt = (element, alreadyIncluded) => {
      if (!(element instanceof TestItemTreeElement) || !this.viewModel.tree.hasElement(element)) {
        return;
      }
      const inTree = this.viewModel.tree.getNode(element);
      if (!inTree.visible) {
        if (alreadyIncluded) {
          exclude.push(element.test);
        }
        return;
      }
      const visibleRunnableChildren = inTree.children.filter(
        (c) => c.visible && c.element instanceof TestItemTreeElement && isRunnableWithProfileOrBitset(c.element.test)
      ).length;
      if (
        // If it's not already included...
        !alreadyIncluded && isRunnableWithProfileOrBitset(element.test) && (visibleRunnableChildren === 0 || visibleRunnableChildren * 2 >= inTree.children.length) && visibleRunnableChildren !== 1
      ) {
        include.add(element.test);
        alreadyIncluded = true;
      }
      for (const child of element.children) {
        attempt(child, alreadyIncluded);
      }
    };
    if (filterToType === "selected") {
      const sel = this.viewModel.tree.getSelection().filter(isDefined);
      if (sel.length) {
        L:
          for (const node of sel) {
            if (node instanceof TestItemTreeElement) {
              for (let i = node; i; i = i.parent) {
                if (include.has(i.test)) {
                  continue L;
                }
              }
              include.add(node.test);
              node.children.forEach((c) => attempt(c, true));
            }
          }
        return { include: [...include], exclude };
      }
    }
    for (const root of withinItems || this.testService.collection.rootItems) {
      const element = projection.getElementByTestId(root.item.extId);
      if (!element) {
        continue;
      }
      if (typeof profileOrBitset === "object" && !canUseProfileWithTest(profileOrBitset, root)) {
        continue;
      }
      include.add(element.test);
      element.children.forEach((c) => attempt(c, true));
    }
    return { include: [...include], exclude };
  }
  render() {
    super.render();
    this._register(registerNavigableContainer({
      name: "testingExplorerView",
      focusNotifiers: [this],
      focusNextWidget: () => {
        if (!this.viewModel.tree.isDOMFocused()) {
          this.viewModel.tree.domFocus();
        }
      },
      focusPreviousWidget: () => {
        if (this.viewModel.tree.isDOMFocused()) {
          this.filter.value?.focus();
        }
      }
    }));
  }
  /**
   * @override
   */
  renderBody(container) {
    super.renderBody(container);
    this.container = dom.append(container, dom.$(".test-explorer"));
    this.treeHeader = dom.append(this.container, dom.$(".test-explorer-header"));
    this.filterActionBar.value = this.createFilterActionBar();
    const messagesContainer = dom.append(this.treeHeader, dom.$(".result-summary-container"));
    this._register(this.instantiationService.createInstance(ResultSummaryView, messagesContainer));
    const listContainer = dom.append(this.container, dom.$(".test-explorer-tree"));
    this.viewModel = this.instantiationService.createInstance(TestingExplorerViewModel, listContainer, this.onDidChangeBodyVisibility);
    this._register(this.viewModel.tree.onDidFocus(() => this.lastFocusState = 1 /* Tree */));
    this._register(this.viewModel.onChangeWelcomeVisibility(() => this._onDidChangeViewWelcomeState.fire()));
    this._register(this.viewModel);
    this._onDidChangeViewWelcomeState.fire();
  }
  /** @override  */
  createActionViewItem(action, options) {
    switch (action.id) {
      case TestCommandId.FilterAction:
        this.filter.value = this.instantiationService.createInstance(TestingExplorerFilter, action, options);
        this.filterFocusListener.value = this.filter.value.onDidFocus(() => this.lastFocusState = 0 /* Input */);
        return this.filter.value;
      case TestCommandId.RunSelectedAction:
        return this.getRunGroupDropdown(TestRunProfileBitset.Run, action, options);
      case TestCommandId.DebugSelectedAction:
        return this.getRunGroupDropdown(TestRunProfileBitset.Debug, action, options);
      case TestCommandId.CoverageSelectedAction:
        return this.getRunGroupDropdown(TestRunProfileBitset.Coverage, action, options);
      case TestCommandId.StartContinousRun:
      case TestCommandId.StopContinousRun:
        return this.getContinuousRunDropdown(action, options);
      default:
        return super.createActionViewItem(action, options);
    }
  }
  /** @inheritdoc */
  getTestConfigGroupActions(group) {
    const profileActions = [];
    let participatingGroups = 0;
    let participatingProfiles = 0;
    let hasConfigurable = false;
    const defaults = this.testProfileService.getGroupDefaultProfiles(group);
    for (const { profiles, controller } of this.testProfileService.all()) {
      let hasAdded = false;
      for (const profile of profiles) {
        if (profile.group !== group) {
          continue;
        }
        if (!hasAdded) {
          hasAdded = true;
          participatingGroups++;
          profileActions.push(toAction({ id: `${controller.id}.$root`, label: controller.label.get(), enabled: false, checked: false, run: () => {
          } }));
        }
        hasConfigurable = hasConfigurable || profile.hasConfigurationHandler;
        participatingProfiles++;
        profileActions.push(toAction({
          id: `${controller.id}.${profile.profileId}`,
          label: defaults.includes(profile) ? localize("defaultTestProfile", "{0} (Default)", profile.label) : profile.label,
          run: () => {
            const { include, exclude } = this.getTreeIncludeExclude(profile);
            this.testService.runResolvedTests({
              exclude: exclude.map((e) => e.item.extId),
              group: profile.group,
              targets: [{
                profileId: profile.profileId,
                controllerId: profile.controllerId,
                testIds: include.map((i) => i.item.extId)
              }]
            });
          }
        }));
      }
    }
    const contextKeys = [];
    if (group === TestRunProfileBitset.Run) {
      contextKeys.push(["testing.profile.context.group", "run"]);
    }
    if (group === TestRunProfileBitset.Debug) {
      contextKeys.push(["testing.profile.context.group", "debug"]);
    }
    if (group === TestRunProfileBitset.Coverage) {
      contextKeys.push(["testing.profile.context.group", "coverage"]);
    }
    const key = this.contextKeyService.createOverlay(contextKeys);
    const menu = this.menuService.getMenuActions(MenuId.TestProfilesContext, key);
    const menuActions = getFlatContextMenuActions(menu);
    const postActions = [];
    if (participatingProfiles > 1) {
      postActions.push(toAction({
        id: "selectDefaultTestConfigurations",
        label: localize("selectDefaultConfigs", "Select Default Profile"),
        run: () => this.commandService.executeCommand(TestCommandId.SelectDefaultTestProfiles, group)
      }));
    }
    if (hasConfigurable) {
      postActions.push(toAction({
        id: "configureTestProfiles",
        label: localize("configureTestProfiles", "Configure Test Profiles"),
        run: () => this.commandService.executeCommand(TestCommandId.ConfigureTestProfilesAction, group)
      }));
    }
    return {
      numberOfProfiles: participatingProfiles,
      actions: menuActions.length > 0 ? Separator.join(profileActions, menuActions, postActions) : Separator.join(profileActions, postActions)
    };
  }
  /**
   * @override
   */
  saveState() {
    this.filter.value?.saveState();
    super.saveState();
  }
  getRunGroupDropdown(group, defaultAction, options) {
    const dropdownActions = this.getTestConfigGroupActions(group);
    if (dropdownActions.numberOfProfiles < 2) {
      return super.createActionViewItem(defaultAction, options);
    }
    const primaryAction = this.instantiationService.createInstance(MenuItemAction, {
      id: defaultAction.id,
      title: defaultAction.label,
      icon: group === TestRunProfileBitset.Run ? icons.testingRunAllIcon : group === TestRunProfileBitset.Debug ? icons.testingDebugAllIcon : icons.testingCoverageAllIcon
    }, void 0, void 0, void 0, void 0);
    return this.instantiationService.createInstance(
      DropdownWithPrimaryActionViewItem,
      primaryAction,
      this.getDropdownAction(),
      dropdownActions.actions,
      "",
      options
    );
  }
  getDropdownAction() {
    return new Action("selectRunConfig", localize("testingSelectConfig", "Select Configuration..."), "codicon-chevron-down", true);
  }
  getContinuousRunDropdown(defaultAction, options) {
    const allProfiles = [...Iterable.flatMap(this.testProfileService.all(), (cr) => {
      if (this.testService.collection.getNodeById(cr.controller.id)?.children.size) {
        return Iterable.filter(cr.profiles, (p) => p.supportsContinuousRun);
      }
      return Iterable.empty();
    })];
    if (allProfiles.length <= 1) {
      return super.createActionViewItem(defaultAction, options);
    }
    const primaryAction = this.instantiationService.createInstance(MenuItemAction, {
      id: defaultAction.id,
      title: defaultAction.label,
      icon: defaultAction.id === TestCommandId.StartContinousRun ? icons.testingTurnContinuousRunOn : icons.testingTurnContinuousRunOff
    }, void 0, void 0, void 0, void 0);
    const dropdownActions = [];
    const groups = groupBy(allProfiles, (p) => p.group);
    const crService = this.crService;
    for (const group of [TestRunProfileBitset.Run, TestRunProfileBitset.Debug, TestRunProfileBitset.Coverage]) {
      const profiles = groups[group];
      if (!profiles) {
        continue;
      }
      if (Object.keys(groups).length > 1) {
        dropdownActions.push({
          id: `${group}.label`,
          label: testProfileBitset[group],
          enabled: false,
          class: void 0,
          tooltip: testProfileBitset[group],
          run: () => {
          }
        });
      }
      for (const profile of profiles) {
        dropdownActions.push({
          id: `${group}.${profile.profileId}`,
          label: profile.label,
          enabled: true,
          class: void 0,
          tooltip: profile.label,
          checked: crService.isEnabledForProfile(profile),
          run: () => crService.isEnabledForProfile(profile) ? crService.stopProfile(profile) : crService.start([profile])
        });
      }
    }
    return this.instantiationService.createInstance(
      DropdownWithPrimaryActionViewItem,
      primaryAction,
      this.getDropdownAction(),
      dropdownActions,
      "",
      options
    );
  }
  createFilterActionBar() {
    const bar = new ActionBar(this.treeHeader, {
      actionViewItemProvider: (action, options) => this.createActionViewItem(action, options),
      triggerKeys: { keyDown: false, keys: [] }
    });
    bar.push(new Action(TestCommandId.FilterAction));
    bar.getContainer().classList.add("testing-filter-action-bar");
    return bar;
  }
  updateDiscoveryProgress(busy) {
    if (!busy && this.discoveryProgress) {
      this.discoveryProgress.clear();
    } else if (busy && !this.discoveryProgress.value) {
      this.discoveryProgress.value = this.instantiationService.createInstance(UnmanagedProgress, { location: this.getProgressLocation() });
    }
  }
  /**
   * @override
   */
  layoutBody(height = this.dimensions.height, width = this.dimensions.width) {
    super.layoutBody(height, width);
    this.dimensions.height = height;
    this.dimensions.width = width;
    this.container.style.height = `${height}px`;
    this.viewModel?.layout(height - this.treeHeader.clientHeight, width);
    this.filter.value?.layout(width);
  }
};
TestingExplorerView = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, ITestService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, ITestProfileService),
  __decorateParam(12, ICommandService),
  __decorateParam(13, IMenuService),
  __decorateParam(14, ITestingContinuousRunService)
], TestingExplorerView);
const SUMMARY_RENDER_INTERVAL = 200;
let ResultSummaryView = class extends Disposable {
  constructor(container, resultService, activityService, crService, configurationService, instantiationService, hoverService) {
    super();
    this.container = container;
    this.resultService = resultService;
    this.activityService = activityService;
    this.crService = crService;
    this.elementsWereAttached = false;
    this.badgeDisposable = this._register(new MutableDisposable());
    this.renderLoop = this._register(new RunOnceScheduler(() => this.render(), SUMMARY_RENDER_INTERVAL));
    this.elements = dom.h("div.result-summary", [
      dom.h("div@status"),
      dom.h("div@count"),
      dom.h("div@count"),
      dom.h("span"),
      dom.h("duration@duration"),
      dom.h("a@rerun")
    ]);
    this.badgeType = configurationService.getValue(TestingConfigKeys.CountBadge);
    this._register(resultService.onResultsChanged(this.render, this));
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TestingConfigKeys.CountBadge)) {
        this.badgeType = configurationService.getValue(TestingConfigKeys.CountBadge);
        this.render();
      }
    }));
    this.countHover = this._register(hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.elements.count, ""));
    const ab = this._register(new ActionBar(this.elements.rerun, {
      actionViewItemProvider: (action, options) => createActionViewItem(instantiationService, action, options)
    }));
    ab.push(instantiationService.createInstance(
      MenuItemAction,
      { ...new ReRunLastRun().desc, icon: icons.testingRerunIcon },
      { ...new DebugLastRun().desc, icon: icons.testingDebugIcon },
      {},
      void 0,
      void 0
    ), { icon: true, label: false });
    this.render();
  }
  render() {
    const { results } = this.resultService;
    const { count, root, status, duration, rerun } = this.elements;
    if (!results.length) {
      if (this.elementsWereAttached) {
        root.remove();
        this.elementsWereAttached = false;
      }
      this.container.innerText = localize("noResults", "No test results yet.");
      this.badgeDisposable.clear();
      return;
    }
    const live = results.filter((r) => !r.completedAt);
    let counts;
    if (live.length) {
      status.className = ThemeIcon.asClassName(spinningLoading);
      counts = collectTestStateCounts(true, live);
      this.renderLoop.schedule();
      const last = live[live.length - 1];
      duration.textContent = formatDuration(Date.now() - last.startedAt);
      rerun.style.display = "none";
    } else {
      const last = results[0];
      const dominantState = mapFindFirst(statesInOrder, (s) => last.counts[s] > 0 ? s : void 0);
      status.className = ThemeIcon.asClassName(icons.testingStatesToIcons.get(dominantState ?? TestResultState.Unset));
      counts = collectTestStateCounts(false, [last]);
      duration.textContent = last instanceof LiveTestResult ? formatDuration(last.completedAt - last.startedAt) : "";
      rerun.style.display = "block";
    }
    count.textContent = `${counts.passed}/${counts.totalWillBeRun}`;
    this.countHover.update(getTestProgressText(counts));
    this.renderActivityBadge(counts, live.length > 0);
    if (!this.elementsWereAttached) {
      dom.clearNode(this.container);
      this.container.appendChild(root);
      this.elementsWereAttached = true;
    }
  }
  renderActivityBadge(countSummary, isRunning) {
    if (isRunning) {
      if (this.badgeDisposable.value && this.lastBadge instanceof IconBadge && this.lastBadge.icon === spinningLoading) {
        return;
      }
      this.lastBadge = new IconBadge(spinningLoading, () => localize("testingRunningBadge", "Tests are running"));
    } else if (countSummary && this.badgeType !== TestingCountBadge.Off && countSummary[this.badgeType] !== 0) {
      if (this.badgeDisposable.value && this.lastBadge instanceof NumberBadge && this.lastBadge.number === countSummary[this.badgeType]) {
        return;
      }
      this.lastBadge = new NumberBadge(countSummary[this.badgeType], (num) => this.getLocalizedBadgeString(this.badgeType, num));
    } else if (this.crService.isEnabled()) {
      if (this.badgeDisposable.value && this.lastBadge instanceof IconBadge && this.lastBadge.icon === icons.testingContinuousIsOn) {
        return;
      }
      this.lastBadge = new IconBadge(icons.testingContinuousIsOn, () => localize("testingContinuousBadge", "Tests are being watched for changes"));
    } else {
      if (!this.lastBadge) {
        return;
      }
      this.lastBadge = void 0;
    }
    this.badgeDisposable.value = this.lastBadge && this.activityService.showViewActivity(Testing.ExplorerViewId, { badge: this.lastBadge });
  }
  getLocalizedBadgeString(countBadgeType, count) {
    switch (countBadgeType) {
      case TestingCountBadge.Passed:
        return localize("testingCountBadgePassed", "{0} passed tests", count);
      case TestingCountBadge.Skipped:
        return localize("testingCountBadgeSkipped", "{0} skipped tests", count);
      default:
        return localize("testingCountBadgeFailed", "{0} failed tests", count);
    }
  }
};
ResultSummaryView = __decorateClass([
  __decorateParam(1, ITestResultService),
  __decorateParam(2, IActivityService),
  __decorateParam(3, ITestingContinuousRunService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IHoverService)
], ResultSummaryView);
var WelcomeExperience = /* @__PURE__ */ ((WelcomeExperience2) => {
  WelcomeExperience2[WelcomeExperience2["None"] = 0] = "None";
  WelcomeExperience2[WelcomeExperience2["ForWorkspace"] = 1] = "ForWorkspace";
  WelcomeExperience2[WelcomeExperience2["ForDocument"] = 2] = "ForDocument";
  return WelcomeExperience2;
})(WelcomeExperience || {});
let TestingExplorerViewModel = class extends Disposable {
  constructor(listContainer, onDidChangeVisibility, configurationService, editorService, editorGroupsService, menuService, contextMenuService, testService, filterState, instantiationService, storageService, contextKeyService, testResults, peekOpener, testProfileService, crService, commandService) {
    super();
    this.menuService = menuService;
    this.contextMenuService = contextMenuService;
    this.testService = testService;
    this.filterState = filterState;
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.contextKeyService = contextKeyService;
    this.testResults = testResults;
    this.peekOpener = peekOpener;
    this.testProfileService = testProfileService;
    this.crService = crService;
    this.projection = this._register(new MutableDisposable());
    this.revealTimeout = this._register(new MutableDisposable());
    this.welcomeVisibilityEmitter = this._register(new Emitter());
    this.actionRunner = this._register(new TestExplorerActionRunner(() => this.tree.getSelection().filter(isDefined)));
    /**
     * Whether there's a reveal request which has not yet been delivered. This
     * can happen if the user asks to reveal before the test tree is loaded.
     * We check to see if the reveal request is present on each tree update,
     * and do it then if so.
     */
    this.hasPendingReveal = false;
    /**
     * Fires when the visibility of the placeholder state changes.
     */
    this.onChangeWelcomeVisibility = this.welcomeVisibilityEmitter.event;
    /**
     * Gets whether the welcome should be visible.
     */
    this.welcomeExperience = 0 /* None */;
    this.hasPendingReveal = !!filterState.reveal.get();
    this.noTestForDocumentWidget = this._register(instantiationService.createInstance(NoTestsForDocumentWidget, listContainer));
    this.lastViewState = this._register(new StoredValue({
      key: "testing.treeState",
      scope: StorageScope.WORKSPACE,
      target: StorageTarget.MACHINE
    }, this.storageService));
    this._viewMode = TestingContextKeys.viewMode.bindTo(contextKeyService);
    this._viewSorting = TestingContextKeys.viewSorting.bindTo(contextKeyService);
    this._viewMode.set(this.storageService.get("testing.viewMode", StorageScope.WORKSPACE, TestExplorerViewMode.Tree));
    this._viewSorting.set(this.storageService.get("testing.viewSorting", StorageScope.WORKSPACE, TestExplorerViewSorting.ByLocation));
    this.reevaluateWelcomeState();
    this.filter = this.instantiationService.createInstance(TestsFilter, testService.collection);
    this.tree = instantiationService.createInstance(
      TestingObjectTree,
      "Test Explorer List",
      listContainer,
      new ListDelegate(),
      [
        instantiationService.createInstance(TestItemRenderer, this.actionRunner),
        instantiationService.createInstance(ErrorRenderer)
      ],
      {
        identityProvider: instantiationService.createInstance(IdentityProvider),
        hideTwistiesOfChildlessElements: false,
        sorter: instantiationService.createInstance(TreeSorter, this),
        keyboardNavigationLabelProvider: instantiationService.createInstance(TreeKeyboardNavigationLabelProvider),
        accessibilityProvider: instantiationService.createInstance(ListAccessibilityProvider),
        filter: this.filter,
        findWidgetEnabled: false
      }
    );
    const collapseStateSaver = this._register(new RunOnceScheduler(() => {
      const state = this.tree.getOptimizedViewState(this.lastViewState.get({}));
      const projection = this.projection.value;
      if (projection) {
        projection.lastState = state;
      }
    }, 3e3));
    this._register(this.tree.onDidChangeCollapseState((evt) => {
      if (evt.node.element instanceof TestItemTreeElement) {
        if (!evt.node.collapsed) {
          this.projection.value?.expandElement(evt.node.element, evt.deep ? Infinity : 0);
        }
        collapseStateSaver.schedule();
      }
    }));
    this._register(this.crService.onDidChange((testId) => {
      if (testId) {
        const elem = this.projection.value?.getElementByTestId(testId);
        this.tree.resort(elem?.parent && this.tree.hasElement(elem.parent) ? elem.parent : null, false);
      }
    }));
    this._register(onDidChangeVisibility((visible) => {
      if (visible) {
        this.ensureProjection();
      }
    }));
    this._register(this.tree.onContextMenu((e) => this.onContextMenu(e)));
    this._register(Event.any(
      filterState.text.onDidChange,
      filterState.fuzzy.onDidChange,
      testService.excluded.onTestExclusionsChanged
    )(() => {
      if (!filterState.text.value) {
        return this.tree.refilter();
      }
      const items = this.filter.lastIncludedTests = /* @__PURE__ */ new Set();
      this.tree.refilter();
      this.filter.lastIncludedTests = void 0;
      for (const test of items) {
        this.tree.expandTo(test);
      }
    }));
    this._register(this.tree.onDidOpen((e) => {
      if (!(e.element instanceof TestItemTreeElement)) {
        return;
      }
      filterState.didSelectTestInExplorer(e.element.test.item.extId);
      if (!e.element.children.size && e.element.test.item.uri) {
        if (!this.tryPeekError(e.element)) {
          commandService.executeCommand("vscode.revealTest", e.element.test.item.extId, {
            openToSide: e.sideBySide,
            preserveFocus: true
          });
        }
      }
    }));
    this._register(this.tree);
    this._register(this.onChangeWelcomeVisibility((e) => {
      this.noTestForDocumentWidget.setVisible(e === 2 /* ForDocument */);
    }));
    this._register(dom.addStandardDisposableListener(this.tree.getHTMLElement(), "keydown", (evt) => {
      if (evt.equals(KeyCode.Enter)) {
        this.handleExecuteKeypress(evt);
      } else if (DefaultKeyboardNavigationDelegate.mightProducePrintableCharacter(evt)) {
        filterState.text.value = evt.browserEvent.key;
        filterState.focusInput();
      }
    }));
    this._register(autorun((reader) => {
      this.revealById(filterState.reveal.read(reader), void 0, false);
    }));
    this._register(onDidChangeVisibility((visible) => {
      if (visible) {
        filterState.focusInput();
      }
    }));
    let followRunningTests = getTestingConfiguration(configurationService, TestingConfigKeys.FollowRunningTest);
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TestingConfigKeys.FollowRunningTest)) {
        followRunningTests = getTestingConfiguration(configurationService, TestingConfigKeys.FollowRunningTest);
      }
    }));
    let alwaysRevealTestAfterStateChange = getTestingConfiguration(configurationService, TestingConfigKeys.AlwaysRevealTestOnStateChange);
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TestingConfigKeys.AlwaysRevealTestOnStateChange)) {
        alwaysRevealTestAfterStateChange = getTestingConfiguration(configurationService, TestingConfigKeys.AlwaysRevealTestOnStateChange);
      }
    }));
    this._register(testResults.onTestChanged((evt) => {
      if (!followRunningTests) {
        return;
      }
      if (evt.reason !== TestResultItemChangeReason.OwnStateChange) {
        return;
      }
      if (this.tree.selectionSize > 1) {
        return;
      }
      if (evt.item.ownComputedState !== TestResultState.Running && !(evt.previousState === TestResultState.Queued && isStateWithResult(evt.item.ownComputedState))) {
        return;
      }
      this.revealById(evt.item.item.extId, alwaysRevealTestAfterStateChange, false);
    }));
    this._register(testResults.onResultsChanged(() => {
      this.tree.resort(null);
    }));
    this._register(this.testProfileService.onDidChange(() => {
      this.tree.rerender();
    }));
    const allOpenEditorInputs = observableFromEvent(
      this,
      editorService.onDidEditorsChange,
      () => new Set(editorGroupsService.groups.flatMap((g) => g.editors).map((e) => e.resource).filter(isDefined))
    );
    const activeResource = observableFromEvent(this, editorService.onDidActiveEditorChange, () => {
      if (editorService.activeEditor instanceof DiffEditorInput) {
        return editorService.activeEditor.primary.resource;
      } else {
        return editorService.activeEditor?.resource;
      }
    });
    const filterText = observableFromEvent(this.filterState.text.onDidChange, () => this.filterState.text);
    this._register(autorun((reader) => {
      filterText.read(reader);
      if (this.filterState.isFilteringFor(TestFilterTerm.OpenedFiles)) {
        this.filter.filterToDocumentUri([...allOpenEditorInputs.read(reader)]);
      } else {
        this.filter.filterToDocumentUri([activeResource.read(reader)].filter(isDefined));
      }
      if (this.filterState.isFilteringFor(TestFilterTerm.CurrentDoc) || this.filterState.isFilteringFor(TestFilterTerm.OpenedFiles)) {
        this.tree.refilter();
      }
    }));
    this._register(this.storageService.onWillSaveState(({ reason }) => {
      if (reason === WillSaveStateReason.SHUTDOWN) {
        this.lastViewState.store(this.tree.getOptimizedViewState());
      }
    }));
  }
  get viewMode() {
    return this._viewMode.get() ?? TestExplorerViewMode.Tree;
  }
  set viewMode(newMode) {
    if (newMode === this._viewMode.get()) {
      return;
    }
    this._viewMode.set(newMode);
    this.updatePreferredProjection();
    this.storageService.store("testing.viewMode", newMode, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  get viewSorting() {
    return this._viewSorting.get() ?? TestExplorerViewSorting.ByStatus;
  }
  set viewSorting(newSorting) {
    if (newSorting === this._viewSorting.get()) {
      return;
    }
    this._viewSorting.set(newSorting);
    this.tree.resort(null);
    this.storageService.store("testing.viewSorting", newSorting, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  /**
   * Re-layout the tree.
   */
  layout(height, width) {
    this.tree.layout(height, width);
  }
  /**
   * Tries to reveal by extension ID. Queues the request if the extension
   * ID is not currently available.
   */
  revealById(id, expand = true, focus = true) {
    if (!id) {
      this.hasPendingReveal = false;
      return;
    }
    const projection = this.ensureProjection();
    let expandToLevel = 0;
    const idPath = [...TestId.fromString(id).idsFromRoot()];
    for (let i = idPath.length - 1; i >= expandToLevel; i--) {
      const element = projection.getElementByTestId(idPath[i].toString());
      if (!element || !this.tree.hasElement(element)) {
        continue;
      }
      if (i < idPath.length - 1) {
        if (expand) {
          this.tree.expand(element);
          expandToLevel = i + 1;
          i = idPath.length - 1;
          continue;
        }
      }
      let focusTarget = element;
      for (let n = element; n instanceof TestItemTreeElement; n = n.parent) {
        if (n.test && this.testService.excluded.contains(n.test)) {
          this.filterState.toggleFilteringFor(TestFilterTerm.Hidden, true);
          break;
        }
        if (!expand && (this.tree.hasElement(n) && this.tree.isCollapsed(n))) {
          focusTarget = n;
        }
      }
      this.filterState.reveal.set(void 0, void 0);
      this.hasPendingReveal = false;
      if (focus) {
        this.tree.domFocus();
      }
      if (this.tree.getRelativeTop(focusTarget) === null) {
        this.tree.reveal(focusTarget, 0.5);
      }
      this.revealTimeout.value = disposableTimeout(() => {
        this.tree.setFocus([focusTarget]);
        this.tree.setSelection([focusTarget]);
      }, 1);
      return;
    }
    this.hasPendingReveal = true;
  }
  /**
   * Collapse all items in the tree.
   */
  async collapseAll() {
    this.tree.collapseAll();
  }
  /**
   * Tries to peek the first test error, if the item is in a failed state.
   */
  tryPeekError(item) {
    const lookup = item.test && this.testResults.getStateById(item.test.item.extId);
    return lookup && lookup[1].tasks.some((s) => isFailedState(s.state)) ? this.peekOpener.tryPeekFirstError(lookup[0], lookup[1], { preserveFocus: true }) : false;
  }
  onContextMenu(evt) {
    const element = evt.element;
    if (!(element instanceof TestItemTreeElement)) {
      return;
    }
    const { actions } = getActionableElementActions(this.contextKeyService, this.menuService, this.testService, this.crService, this.testProfileService, element);
    this.contextMenuService.showContextMenu({
      getAnchor: () => evt.anchor,
      getActions: () => actions.secondary,
      getActionsContext: () => element,
      actionRunner: this.actionRunner
    });
  }
  handleExecuteKeypress(evt) {
    const focused = this.tree.getFocus();
    const selected = this.tree.getSelection();
    let targeted;
    if (focused.length === 1 && selected.includes(focused[0])) {
      evt.browserEvent?.preventDefault();
      targeted = selected;
    } else {
      targeted = focused;
    }
    const toRun = targeted.filter((e) => e instanceof TestItemTreeElement);
    if (toRun.length) {
      this.testService.runTests({
        group: TestRunProfileBitset.Run,
        tests: toRun.map((t) => t.test)
      });
    }
  }
  reevaluateWelcomeState() {
    const shouldShowWelcome = this.testService.collection.busyProviders === 0 && testCollectionIsEmpty(this.testService.collection);
    const welcomeExperience = shouldShowWelcome ? this.filterState.isFilteringFor(TestFilterTerm.CurrentDoc) ? 2 /* ForDocument */ : 1 /* ForWorkspace */ : 0 /* None */;
    if (welcomeExperience !== this.welcomeExperience) {
      this.welcomeExperience = welcomeExperience;
      this.welcomeVisibilityEmitter.fire(welcomeExperience);
    }
  }
  ensureProjection() {
    return this.projection.value ?? this.updatePreferredProjection();
  }
  updatePreferredProjection() {
    this.projection.clear();
    const lastState = this.lastViewState.get({});
    if (this._viewMode.get() === TestExplorerViewMode.List) {
      this.projection.value = this.instantiationService.createInstance(ListProjection, lastState);
    } else {
      this.projection.value = this.instantiationService.createInstance(TreeProjection, lastState);
    }
    const scheduler = this._register(new RunOnceScheduler(() => this.applyProjectionChanges(), 200));
    this.projection.value.onUpdate(() => {
      if (!scheduler.isScheduled()) {
        scheduler.schedule();
      }
    });
    this.applyProjectionChanges();
    return this.projection.value;
  }
  applyProjectionChanges() {
    this.reevaluateWelcomeState();
    this.projection.value?.applyTo(this.tree);
    this.tree.refilter();
    if (this.hasPendingReveal) {
      this.revealById(this.filterState.reveal.get());
    }
  }
  /**
   * Gets the selected tests from the tree.
   */
  getSelectedTests() {
    return this.tree.getSelection();
  }
};
TestingExplorerViewModel = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IEditorGroupsService),
  __decorateParam(5, IMenuService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, ITestService),
  __decorateParam(8, ITestExplorerFilterState),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IStorageService),
  __decorateParam(11, IContextKeyService),
  __decorateParam(12, ITestResultService),
  __decorateParam(13, ITestingPeekOpener),
  __decorateParam(14, ITestProfileService),
  __decorateParam(15, ITestingContinuousRunService),
  __decorateParam(16, ICommandService)
], TestingExplorerViewModel);
var FilterResult = /* @__PURE__ */ ((FilterResult2) => {
  FilterResult2[FilterResult2["Exclude"] = 0] = "Exclude";
  FilterResult2[FilterResult2["Inherit"] = 1] = "Inherit";
  FilterResult2[FilterResult2["Include"] = 2] = "Include";
  return FilterResult2;
})(FilterResult || {});
const hasNodeInOrParentOfUri = (collection, ident, testUri, fromNode) => {
  const queue = [fromNode ? [fromNode] : collection.rootIds];
  while (queue.length) {
    for (const id of queue.pop()) {
      const node = collection.getNodeById(id);
      if (!node) {
        continue;
      }
      if (!node.item.uri || !ident.extUri.isEqualOrParent(testUri, node.item.uri)) {
        continue;
      }
      if (node.item.range || node.expand === TestItemExpandState.Expandable) {
        return true;
      }
      queue.push(node.children);
    }
  }
  return false;
};
let TestsFilter = class {
  constructor(collection, state, testService, uriIdentityService) {
    this.collection = collection;
    this.state = state;
    this.testService = testService;
    this.uriIdentityService = uriIdentityService;
    this.documentUris = [];
  }
  /**
   * @inheritdoc
   */
  filter(element) {
    if (element instanceof TestTreeErrorMessage) {
      return TreeVisibility.Visible;
    }
    if (element.test && !this.state.isFilteringFor(TestFilterTerm.Hidden) && this.testService.excluded.contains(element.test)) {
      return TreeVisibility.Hidden;
    }
    switch (Math.min(this.testFilterText(element), this.testLocation(element), this.testState(element), this.testTags(element))) {
      case 0 /* Exclude */:
        return TreeVisibility.Hidden;
      case 2 /* Include */:
        this.lastIncludedTests?.add(element);
        return TreeVisibility.Visible;
      default:
        return TreeVisibility.Recurse;
    }
  }
  filterToDocumentUri(uris) {
    this.documentUris = [...uris];
  }
  testTags(element) {
    if (!this.state.includeTags.size && !this.state.excludeTags.size) {
      return 2 /* Include */;
    }
    return (this.state.includeTags.size ? element.test.item.tags.some((t) => this.state.includeTags.has(t)) : true) && element.test.item.tags.every((t) => !this.state.excludeTags.has(t)) ? 2 /* Include */ : 1 /* Inherit */;
  }
  testState(element) {
    if (this.state.isFilteringFor(TestFilterTerm.Failed)) {
      return isFailedState(element.state) ? 2 /* Include */ : 1 /* Inherit */;
    }
    if (this.state.isFilteringFor(TestFilterTerm.Executed)) {
      return element.state !== TestResultState.Unset ? 2 /* Include */ : 1 /* Inherit */;
    }
    return 2 /* Include */;
  }
  testLocation(element) {
    if (this.documentUris.length === 0) {
      return 2 /* Include */;
    }
    if (!this.state.isFilteringFor(TestFilterTerm.CurrentDoc) && !this.state.isFilteringFor(TestFilterTerm.OpenedFiles) || !(element instanceof TestItemTreeElement)) {
      return 2 /* Include */;
    }
    if (this.documentUris.some((uri) => hasNodeInOrParentOfUri(this.collection, this.uriIdentityService, uri, element.test.item.extId))) {
      return 2 /* Include */;
    }
    return 1 /* Inherit */;
  }
  testFilterText(element) {
    if (this.state.globList.length === 0) {
      return 2 /* Include */;
    }
    const fuzzy = this.state.fuzzy.value;
    for (let e = element; e; e = e.parent) {
      let included = this.state.globList[0].include === false ? 2 /* Include */ : 1 /* Inherit */;
      const data = e.test.item.label.toLowerCase();
      for (const { include, text } of this.state.globList) {
        if (fuzzy ? fuzzyContains(data, text) : data.includes(text)) {
          included = include ? 2 /* Include */ : 0 /* Exclude */;
        }
      }
      if (included !== 1 /* Inherit */) {
        return included;
      }
    }
    return 1 /* Inherit */;
  }
};
TestsFilter = __decorateClass([
  __decorateParam(1, ITestExplorerFilterState),
  __decorateParam(2, ITestService),
  __decorateParam(3, IUriIdentityService)
], TestsFilter);
class TreeSorter {
  constructor(viewModel) {
    this.viewModel = viewModel;
  }
  compare(a, b) {
    if (a instanceof TestTreeErrorMessage || b instanceof TestTreeErrorMessage) {
      return (a instanceof TestTreeErrorMessage ? -1 : 0) + (b instanceof TestTreeErrorMessage ? 1 : 0);
    }
    const durationDelta = (b.duration || 0) - (a.duration || 0);
    if (this.viewModel.viewSorting === TestExplorerViewSorting.ByDuration && durationDelta !== 0) {
      return durationDelta;
    }
    const stateDelta = cmpPriority(a.state, b.state);
    if (this.viewModel.viewSorting === TestExplorerViewSorting.ByStatus && stateDelta !== 0) {
      return stateDelta;
    }
    let inSameLocation = false;
    if (a instanceof TestItemTreeElement && b instanceof TestItemTreeElement && a.test.item.uri && b.test.item.uri && a.test.item.uri.toString() === b.test.item.uri.toString() && a.test.item.range && b.test.item.range) {
      inSameLocation = true;
      const delta = a.test.item.range.startLineNumber - b.test.item.range.startLineNumber;
      if (delta !== 0) {
        return delta;
      }
    }
    const sa = a.test.item.sortText;
    const sb = b.test.item.sortText;
    return inSameLocation && !sa && !sb ? 0 : compareFileNames(sa || a.test.item.label, sb || b.test.item.label);
  }
}
let NoTestsForDocumentWidget = class extends Disposable {
  constructor(container, filterState) {
    super();
    const el = this.el = dom.append(container, dom.$(".testing-no-test-placeholder"));
    const emptyParagraph = dom.append(el, dom.$("p"));
    emptyParagraph.innerText = localize("testingNoTest", "No tests were found in this file.");
    const buttonLabel = localize("testingFindExtension", "Show Workspace Tests");
    const button = this._register(new Button(el, { title: buttonLabel, ...defaultButtonStyles }));
    button.label = buttonLabel;
    this._register(button.onDidClick(() => filterState.toggleFilteringFor(TestFilterTerm.CurrentDoc, false)));
  }
  setVisible(isVisible) {
    this.el.classList.toggle("visible", isVisible);
  }
};
NoTestsForDocumentWidget = __decorateClass([
  __decorateParam(1, ITestExplorerFilterState)
], NoTestsForDocumentWidget);
class TestExplorerActionRunner extends ActionRunner {
  constructor(getSelectedTests) {
    super();
    this.getSelectedTests = getSelectedTests;
  }
  async runAction(action, context) {
    if (!(action instanceof MenuItemAction)) {
      return super.runAction(action, context);
    }
    const selection = this.getSelectedTests();
    const contextIsSelected = selection.some((s) => s === context);
    const actualContext = contextIsSelected ? selection : [context];
    const actionable = actualContext.filter((t) => t instanceof TestItemTreeElement);
    await action.run(...actionable);
  }
}
const getLabelForTestTreeElement = (element) => {
  let label = labelForTestInState(element.description || element.test.item.label, element.state);
  if (element instanceof TestItemTreeElement) {
    if (element.duration !== void 0) {
      label = localize({
        key: "testing.treeElementLabelDuration",
        comment: ["{0} is the original label in testing.treeElementLabel, {1} is a duration"]
      }, "{0}, in {1}", label, formatDuration(element.duration));
    }
    if (element.retired) {
      label = localize({
        key: "testing.treeElementLabelOutdated",
        comment: ["{0} is the original label in testing.treeElementLabel"]
      }, "{0}, outdated result", label);
    }
  }
  return label;
};
class ListAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("testExplorer", "Test Explorer");
  }
  getAriaLabel(element) {
    return element instanceof TestTreeErrorMessage ? element.description : getLabelForTestTreeElement(element);
  }
}
class TreeKeyboardNavigationLabelProvider {
  getKeyboardNavigationLabel(element) {
    return element instanceof TestTreeErrorMessage ? element.message : element.test.item.label;
  }
}
class ListDelegate {
  getHeight(element) {
    return element instanceof TestTreeErrorMessage ? 17 + 10 : 22;
  }
  getTemplateId(element) {
    if (element instanceof TestTreeErrorMessage) {
      return ErrorRenderer.ID;
    }
    return TestItemRenderer.ID;
  }
}
class IdentityProvider {
  getId(element) {
    return element.treeId;
  }
}
let ErrorRenderer = class {
  constructor(hoverService, markdownRendererService) {
    this.hoverService = hoverService;
    this.markdownRendererService = markdownRendererService;
  }
  get templateId() {
    return ErrorRenderer.ID;
  }
  renderTemplate(container) {
    const label = dom.append(container, dom.$(".error"));
    return { label, disposable: new DisposableStore() };
  }
  renderElement({ element }, _, data) {
    dom.clearNode(data.label);
    if (typeof element.message === "string") {
      data.label.innerText = element.message;
    } else {
      const result = this.markdownRendererService.render(element.message, void 0, document.createElement("span"));
      data.label.appendChild(result.element);
    }
    data.disposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.label, element.description));
  }
  disposeTemplate(data) {
    data.disposable.dispose();
  }
};
ErrorRenderer.ID = "error";
ErrorRenderer = __decorateClass([
  __decorateParam(0, IHoverService),
  __decorateParam(1, IMarkdownRendererService)
], ErrorRenderer);
let TestItemRenderer = class extends Disposable {
  constructor(actionRunner, menuService, testService, profiles, contextKeyService, instantiationService, crService, hoverService) {
    super();
    this.actionRunner = actionRunner;
    this.menuService = menuService;
    this.testService = testService;
    this.profiles = profiles;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.crService = crService;
    this.hoverService = hoverService;
    /**
     * @inheritdoc
     */
    this.templateId = TestItemRenderer.ID;
  }
  /**
   * @inheritdoc
   */
  renderTemplate(wrapper) {
    wrapper.classList.add("testing-stdtree-container");
    const icon = dom.append(wrapper, dom.$(".computed-state"));
    const label = dom.append(wrapper, dom.$(".label"));
    const disposable = new DisposableStore();
    dom.append(wrapper, dom.$(ThemeIcon.asCSSSelector(icons.testingHiddenIcon)));
    const actionBar = disposable.add(new ActionBar(wrapper, {
      actionRunner: this.actionRunner,
      actionViewItemProvider: (action, options) => action instanceof MenuItemAction ? this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate }) : void 0
    }));
    disposable.add(this.profiles.onDidChange(() => {
      if (templateData.current) {
        this.fillActionBar(templateData.current, templateData);
      }
    }));
    disposable.add(this.crService.onDidChange((changed) => {
      const id = templateData.current?.test.item.extId;
      if (id && (!changed || changed === id || TestId.isChild(id, changed))) {
        this.fillActionBar(templateData.current, templateData);
      }
    }));
    const templateData = { wrapper, label, actionBar, icon, elementDisposable: new DisposableStore(), templateDisposable: disposable };
    return templateData;
  }
  /**
   * @inheritdoc
   */
  disposeTemplate(templateData) {
    templateData.templateDisposable.clear();
  }
  /**
   * @inheritdoc
   */
  disposeElement(_element, _, templateData) {
    templateData.elementDisposable.clear();
  }
  fillActionBar(element, data) {
    const { actions, contextOverlay } = getActionableElementActions(this.contextKeyService, this.menuService, this.testService, this.crService, this.profiles, element);
    const crSelf = !!contextOverlay.getContextKeyValue(TestingContextKeys.isContinuousModeOn.key);
    const crChild = !crSelf && this.crService.isEnabledForAChildOf(element.test.item.extId);
    data.actionBar.domNode.classList.toggle("testing-is-continuous-run", crSelf || crChild);
    data.actionBar.clear();
    data.actionBar.context = element;
    data.actionBar.push(actions.primary, { icon: true, label: false });
  }
  /**
   * @inheritdoc
   */
  renderElement(node, _depth, data) {
    data.elementDisposable.clear();
    data.current = node.element;
    data.elementDisposable.add(node.element.onChange(() => this._renderElement(node, data)));
    this._renderElement(node, data);
  }
  _renderElement(node, data) {
    this.fillActionBar(node.element, data);
    const testHidden = this.testService.excluded.contains(node.element.test);
    data.wrapper.classList.toggle("test-is-hidden", testHidden);
    const icon = icons.testingStatesToIcons.get(
      node.element.test.expand === TestItemExpandState.BusyExpanding || node.element.test.item.busy ? TestResultState.Running : node.element.state
    );
    data.icon.className = "computed-state " + (icon ? ThemeIcon.asClassName(icon) : "");
    if (node.element.retired) {
      data.icon.className += " retired";
    }
    data.elementDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), data.label, getLabelForTestTreeElement(node.element)));
    if (node.element.test.item.label.trim()) {
      dom.reset(data.label, ...renderLabelWithIcons(node.element.test.item.label));
    } else {
      data.label.textContent = String.fromCharCode(160);
    }
    let description = node.element.description;
    if (node.element.duration !== void 0) {
      description = description ? `${description}: ${formatDuration(node.element.duration)}` : formatDuration(node.element.duration);
    }
    if (description) {
      dom.append(data.label, dom.$("span.test-label-description", {}, description));
    }
  }
};
TestItemRenderer.ID = "testItem";
TestItemRenderer = __decorateClass([
  __decorateParam(1, IMenuService),
  __decorateParam(2, ITestService),
  __decorateParam(3, ITestProfileService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ITestingContinuousRunService),
  __decorateParam(7, IHoverService)
], TestItemRenderer);
const formatDuration = (ms) => {
  if (ms < 10) {
    return `${ms.toFixed(1)}ms`;
  }
  if (ms < 1e3) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${(ms / 1e3).toFixed(1)}s`;
};
const getActionableElementActions = (contextKeyService, menuService, testService, crService, profiles, element) => {
  const test = element instanceof TestItemTreeElement ? element.test : void 0;
  const contextKeys = getTestItemContextOverlay(test, test ? profiles.capabilitiesForTest(test.item) : 0);
  contextKeys.push(["view", Testing.ExplorerViewId]);
  if (test) {
    const ctrl = testService.getTestController(test.controllerId);
    const supportsCr = !!ctrl && profiles.getControllerProfiles(ctrl.id).some((p) => p.supportsContinuousRun && canUseProfileWithTest(p, test));
    contextKeys.push([
      TestingContextKeys.canRefreshTests.key,
      ctrl && !!(ctrl.capabilities.get() & TestControllerCapability.Refresh) && TestId.isRoot(test.item.extId)
    ], [
      TestingContextKeys.testItemIsHidden.key,
      testService.excluded.contains(test)
    ], [
      TestingContextKeys.isContinuousModeOn.key,
      supportsCr && crService.isSpecificallyEnabledFor(test.item.extId)
    ], [
      TestingContextKeys.isParentRunningContinuously.key,
      supportsCr && crService.isEnabledForAParentOf(test.item.extId)
    ], [
      TestingContextKeys.supportsContinuousRun.key,
      supportsCr
    ], [
      TestingContextKeys.testResultOutdated.key,
      element.retired
    ], [
      TestingContextKeys.testResultState.key,
      testResultStateToContextValues[element.state]
    ]);
  }
  const contextOverlay = contextKeyService.createOverlay(contextKeys);
  const menu = menuService.getMenuActions(MenuId.TestItem, contextOverlay, {
    shouldForwardArgs: true
  });
  const actions = getActionBarActions(menu, "inline");
  return { actions, contextOverlay };
};
registerThemingParticipant((theme, collector) => {
  if (theme.type === "dark") {
    const foregroundColor = theme.getColor(foreground);
    if (foregroundColor) {
      const fgWithOpacity = new Color(new RGBA(foregroundColor.rgba.r, foregroundColor.rgba.g, foregroundColor.rgba.b, 0.65));
      collector.addRule(`.test-explorer .test-explorer-messages { color: ${fgWithOpacity}; }`);
    }
  }
});
export {
  TestingExplorerView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvYnJvd3Nlci90ZXN0aW5nRXhwbG9yZXJWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyLCBJQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IElNYW5hZ2VkSG92ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSUlkZW50aXR5UHJvdmlkZXIsIElLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgRGVmYXVsdEtleWJvYXJkTmF2aWdhdGlvbkRlbGVnYXRlLCBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVRyZWVDb250ZXh0TWVudUV2ZW50LCBJVHJlZUZpbHRlciwgSVRyZWVOb2RlLCBJVHJlZVJlbmRlcmVyLCBJVHJlZVNvcnRlciwgVHJlZUZpbHRlclJlc3VsdCwgVHJlZVZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgQWN0aW9uUnVubmVyLCBJQWN0aW9uLCBTZXBhcmF0b3IsIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBtYXBGaW5kRmlyc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIsIGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZ3JvdXBCeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbG9yLCBSR0JBIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgY29tcGFyZUZpbGVOYW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbXBhcmVycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZnV6enlDb250YWlucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRHJvcGRvd25XaXRoUHJpbWFyeUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2Ryb3Bkb3duV2l0aFByaW1hcnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgY3JlYXRlQWN0aW9uVmlld0l0ZW0sIGdldEFjdGlvbkJhckFjdGlvbnMsIGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBVbm1hbmFnZWRQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCwgV2lsbFNhdmVTdGF0ZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBmb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgc3Bpbm5pbmdMb2FkaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck5hdmlnYWJsZUNvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy93aWRnZXROYXZpZ2F0aW9uQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3bGV0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdzVmlld2xldC5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2RpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElBY3Rpdml0eVNlcnZpY2UsIEljb25CYWRnZSwgTnVtYmVyQmFkZ2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hY3Rpdml0eS9jb21tb24vYWN0aXZpdHkuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdGluZ0NvbmZpZ0tleXMsIFRlc3RpbmdDb3VudEJhZGdlLCBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb21tYW5kSWQsIFRlc3RFeHBsb3JlclZpZXdNb2RlLCBUZXN0RXhwbG9yZXJWaWV3U29ydGluZywgVGVzdGluZywgbGFiZWxGb3JUZXN0SW5TdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgU3RvcmVkVmFsdWUgfSBmcm9tICcuLi9jb21tb24vc3RvcmVkVmFsdWUuanMnO1xuaW1wb3J0IHsgSVRlc3RFeHBsb3JlckZpbHRlclN0YXRlLCBUZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZSwgVGVzdEZpbHRlclRlcm0gfSBmcm9tICcuLi9jb21tb24vdGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUuanMnO1xuaW1wb3J0IHsgVGVzdElkIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RJZC5qcyc7XG5pbXBvcnQgeyBJVGVzdFByb2ZpbGVTZXJ2aWNlLCBjYW5Vc2VQcm9maWxlV2l0aFRlc3QgfSBmcm9tICcuLi9jb21tb24vdGVzdFByb2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExpdmVUZXN0UmVzdWx0LCBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbiB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UmVzdWx0LmpzJztcbmltcG9ydCB7IElUZXN0UmVzdWx0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UmVzdWx0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFpblRocmVhZFRlc3RDb2xsZWN0aW9uLCBJVGVzdFNlcnZpY2UsIHRlc3RDb2xsZWN0aW9uSXNFbXB0eSB9IGZyb20gJy4uL2NvbW1vbi90ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVzdFJ1blByb2ZpbGUsIEludGVybmFsVGVzdEl0ZW0sIFRlc3RDb250cm9sbGVyQ2FwYWJpbGl0eSwgVGVzdEl0ZW1FeHBhbmRTdGF0ZSwgVGVzdFJlc3VsdFN0YXRlLCBUZXN0UnVuUHJvZmlsZUJpdHNldCwgdGVzdFByb2ZpbGVCaXRzZXQsIHRlc3RSZXN1bHRTdGF0ZVRvQ29udGV4dFZhbHVlcyB9IGZyb20gJy4uL2NvbW1vbi90ZXN0VHlwZXMuanMnO1xuaW1wb3J0IHsgVGVzdGluZ0NvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RpbmdDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJVGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RpbmdDb250aW51b3VzUnVuU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVzdGluZ1BlZWtPcGVuZXIgfSBmcm9tICcuLi9jb21tb24vdGVzdGluZ1BlZWtPcGVuZXIuanMnO1xuaW1wb3J0IHsgQ291bnRTdW1tYXJ5LCBjb2xsZWN0VGVzdFN0YXRlQ291bnRzLCBnZXRUZXN0UHJvZ3Jlc3NUZXh0IH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RpbmdQcm9ncmVzc01lc3NhZ2VzLmpzJztcbmltcG9ydCB7IGNtcFByaW9yaXR5LCBpc0ZhaWxlZFN0YXRlLCBpc1N0YXRlV2l0aFJlc3VsdCwgc3RhdGVzSW5PcmRlciB9IGZyb20gJy4uL2NvbW1vbi90ZXN0aW5nU3RhdGVzLmpzJztcbmltcG9ydCB7IElUZXN0VHJlZVByb2plY3Rpb24sIFRlc3RFeHBsb3JlclRyZWVFbGVtZW50LCBUZXN0SXRlbVRyZWVFbGVtZW50LCBUZXN0VHJlZUVycm9yTWVzc2FnZSB9IGZyb20gJy4vZXhwbG9yZXJQcm9qZWN0aW9ucy9pbmRleC5qcyc7XG5pbXBvcnQgeyBMaXN0UHJvamVjdGlvbiB9IGZyb20gJy4vZXhwbG9yZXJQcm9qZWN0aW9ucy9saXN0UHJvamVjdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRUZXN0SXRlbUNvbnRleHRPdmVybGF5IH0gZnJvbSAnLi9leHBsb3JlclByb2plY3Rpb25zL3Rlc3RJdGVtQ29udGV4dE92ZXJsYXkuanMnO1xuaW1wb3J0IHsgVGVzdGluZ09iamVjdFRyZWUgfSBmcm9tICcuL2V4cGxvcmVyUHJvamVjdGlvbnMvdGVzdGluZ09iamVjdFRyZWUuanMnO1xuaW1wb3J0IHsgSVNlcmlhbGl6ZWRUZXN0VHJlZUNvbGxhcHNlU3RhdGUgfSBmcm9tICcuL2V4cGxvcmVyUHJvamVjdGlvbnMvdGVzdGluZ1ZpZXdTdGF0ZS5qcyc7XG5pbXBvcnQgeyBUcmVlUHJvamVjdGlvbiB9IGZyb20gJy4vZXhwbG9yZXJQcm9qZWN0aW9ucy90cmVlUHJvamVjdGlvbi5qcyc7XG5pbXBvcnQgKiBhcyBpY29ucyBmcm9tICcuL2ljb25zLmpzJztcbmltcG9ydCAnLi9tZWRpYS90ZXN0aW5nLmNzcyc7XG5pbXBvcnQgeyBEZWJ1Z0xhc3RSdW4sIFJlUnVuTGFzdFJ1biB9IGZyb20gJy4vdGVzdEV4cGxvcmVyQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUZXN0aW5nRXhwbG9yZXJGaWx0ZXIgfSBmcm9tICcuL3Rlc3RpbmdFeHBsb3JlckZpbHRlci5qcyc7XG5cbmNvbnN0IGVudW0gTGFzdEZvY3VzU3RhdGUge1xuXHRJbnB1dCxcblx0VHJlZSxcbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RpbmdFeHBsb3JlclZpZXcgZXh0ZW5kcyBWaWV3UGFuZSB7XG5cdHB1YmxpYyB2aWV3TW9kZWwhOiBUZXN0aW5nRXhwbG9yZXJWaWV3TW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsdGVyQWN0aW9uQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIGNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRyZWVIZWFkZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNjb3ZlcnlQcm9ncmVzcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxVbm1hbmFnZWRQcm9ncmVzcz4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsdGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPFRlc3RpbmdFeHBsb3JlckZpbHRlcj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsdGVyRm9jdXNMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBkaW1lbnNpb25zID0geyB3aWR0aDogMCwgaGVpZ2h0OiAwIH07XG5cdHByaXZhdGUgbGFzdEZvY3VzU3RhdGUgPSBMYXN0Rm9jdXNTdGF0ZS5JbnB1dDtcblxuXHRwdWJsaWMgZ2V0IGZvY3VzZWRUcmVlRWxlbWVudHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsLnRyZWUuZ2V0Rm9jdXMoKS5maWx0ZXIoaXNEZWZpbmVkKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3bGV0Vmlld09wdGlvbnMsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVRlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVzdFNlcnZpY2U6IElUZXN0U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElUZXN0UHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXN0UHJvZmlsZVNlcnZpY2U6IElUZXN0UHJvZmlsZVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElUZXN0aW5nQ29udGludW91c1J1blNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjclNlcnZpY2U6IElUZXN0aW5nQ29udGludW91c1J1blNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVsYXlvdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLmxheW91dEJvZHkoKSwgMSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VWaWV3V2VsY29tZVN0YXRlKCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5zaG91bGRTaG93V2VsY29tZSgpKSB7XG5cdFx0XHRcdHJlbGF5b3V0LnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KGNyU2VydmljZS5vbkRpZENoYW5nZSwgdGVzdFByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlKSgoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZUFjdGlvbnMoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0ZXN0U2VydmljZS5jb2xsZWN0aW9uLm9uQnVzeVByb3ZpZGVyc0NoYW5nZShidXN5ID0+IHtcblx0XHRcdHRoaXMudXBkYXRlRGlzY292ZXJ5UHJvZ3Jlc3MoYnVzeSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGVzdFByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMudXBkYXRlQWN0aW9ucygpKSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgc2hvdWxkU2hvd1dlbGNvbWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsPy53ZWxjb21lRXhwZXJpZW5jZSA9PT0gV2VsY29tZUV4cGVyaWVuY2UuRm9yV29ya3NwYWNlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGZvY3VzKCkge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0aWYgKHRoaXMubGFzdEZvY3VzU3RhdGUgPT09IExhc3RGb2N1c1N0YXRlLlRyZWUpIHtcblx0XHRcdHRoaXMudmlld01vZGVsLnRyZWUuZG9tRm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5maWx0ZXIudmFsdWU/LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgaW5jbHVkZS9leGNsdWRlIGl0ZW1zIGluIHRoZSB0cmVlLCBiYXNlZCBlaXRoZXIgb24gdmlzaWJsZSB0ZXN0c1xuXHQgKiBvciBhIHVzZSBzZWxlY3Rpb24uIElmIGEgcHJvZmlsZSBpcyBnaXZlbiwgb25seSB0ZXN0cyBpbiB0aGF0IHByb2ZpbGVcblx0ICogYXJlIGNvbGxlY3RlZC4gSWYgYSBiaXRzZXQgaXMgZ2l2ZW4sIGFueSB0ZXN0IHRoYXQgY2FuIHJ1biBpbiB0aGF0XG5cdCAqIGJpdHNldCBpcyBjb2xsZWN0ZWQuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0VHJlZUluY2x1ZGVFeGNsdWRlKHByb2ZpbGVPckJpdHNldDogSVRlc3RSdW5Qcm9maWxlIHwgVGVzdFJ1blByb2ZpbGVCaXRzZXQsIHdpdGhpbkl0ZW1zPzogSW50ZXJuYWxUZXN0SXRlbVtdLCBmaWx0ZXJUb1R5cGU6ICd2aXNpYmxlJyB8ICdzZWxlY3RlZCcgPSAndmlzaWJsZScpIHtcblx0XHRjb25zdCBwcm9qZWN0aW9uID0gdGhpcy52aWV3TW9kZWwucHJvamVjdGlvbi52YWx1ZTtcblx0XHRpZiAoIXByb2plY3Rpb24pIHtcblx0XHRcdHJldHVybiB7IGluY2x1ZGU6IFtdLCBleGNsdWRlOiBbXSB9O1xuXHRcdH1cblxuXHRcdC8vIFRvIGNhbGN1bGF0ZSBpbmNsdWRlcyBhbmQgZXhjbHVkZXMsIHdlIGluY2x1ZGUgdGhlIGZpcnN0IGNoaWxkcmVuIHRoYXRcblx0XHQvLyBoYXZlIGEgbWFqb3JpdHkgb2YgdGhlaXIgaXRlbXMgaW5jbHVkZWQgdG9vLCBhbmQgdGhlbiBhcHBseSBleGNsdXNpb25zLlxuXHRcdGNvbnN0IGluY2x1ZGUgPSBuZXcgU2V0PEludGVybmFsVGVzdEl0ZW0+KCk7XG5cdFx0Y29uc3QgZXhjbHVkZTogSW50ZXJuYWxUZXN0SXRlbVtdID0gW107XG5cblx0XHRjb25zdCBydW5uYWJsZVdpdGhQcm9maWxlT3JCaXRzZXQgPSBuZXcgTWFwPEludGVybmFsVGVzdEl0ZW0sIGJvb2xlYW4+KCk7XG5cdFx0Y29uc3QgaXNSdW5uYWJsZVdpdGhQcm9maWxlT3JCaXRzZXQgPSAoaXRlbTogSW50ZXJuYWxUZXN0SXRlbSkgPT4ge1xuXHRcdFx0bGV0IHZhbHVlID0gcnVubmFibGVXaXRoUHJvZmlsZU9yQml0c2V0LmdldChpdGVtKTtcblx0XHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHZhbHVlID0gdHlwZW9mIHByb2ZpbGVPckJpdHNldCA9PT0gJ251bWJlcidcblx0XHRcdFx0XHQ/ICEhdGhpcy50ZXN0UHJvZmlsZVNlcnZpY2UuZ2V0RGVmYXVsdFByb2ZpbGVGb3JUZXN0KHByb2ZpbGVPckJpdHNldCwgaXRlbSlcblx0XHRcdFx0XHQ6IGNhblVzZVByb2ZpbGVXaXRoVGVzdChwcm9maWxlT3JCaXRzZXQsIGl0ZW0pO1xuXHRcdFx0XHRydW5uYWJsZVdpdGhQcm9maWxlT3JCaXRzZXQuc2V0KGl0ZW0sIHZhbHVlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9O1xuXG5cblx0XHRjb25zdCBhdHRlbXB0ID0gKGVsZW1lbnQ6IFRlc3RFeHBsb3JlclRyZWVFbGVtZW50LCBhbHJlYWR5SW5jbHVkZWQ6IGJvb2xlYW4pID0+IHtcblx0XHRcdC8vIHNhbml0eSBjaGVjayBoYXNFbGVtZW50IHNpbmNlIHVwZGF0ZXMgYXJlIGRlYm91bmNlZCBhbmQgdGhleSBtYXkgZXhpc3Rcblx0XHRcdC8vIGJ1dCBub3QgYmUgcmVuZGVyZWQgeWV0XG5cdFx0XHRpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgVGVzdEl0ZW1UcmVlRWxlbWVudCkgfHwgIXRoaXMudmlld01vZGVsLnRyZWUuaGFzRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRoZSBjdXJyZW50IG5vZGUgaXMgbm90IHZpc2libGUgb3IgcnVubmFibGUgaW4gdGhlIGN1cnJlbnQgcHJvZmlsZSwgaXQncyBleGNsdWRlZFxuXHRcdFx0Y29uc3QgaW5UcmVlID0gdGhpcy52aWV3TW9kZWwudHJlZS5nZXROb2RlKGVsZW1lbnQpO1xuXHRcdFx0aWYgKCFpblRyZWUudmlzaWJsZSkge1xuXHRcdFx0XHRpZiAoYWxyZWFkeUluY2x1ZGVkKSB7IGV4Y2x1ZGUucHVzaChlbGVtZW50LnRlc3QpOyB9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT25seSBjb3VudCByZWxldmFudCBjaGlsZHJlbiB3aGVuIGRlY2lkaW5nIHdoZXRoZXIgdG8gaW5jbHVkZSB0aGlzIG5vZGUsICMyMjkxMjBcblx0XHRcdGNvbnN0IHZpc2libGVSdW5uYWJsZUNoaWxkcmVuID0gaW5UcmVlLmNoaWxkcmVuLmZpbHRlcihcblx0XHRcdFx0YyA9PiBjLnZpc2libGVcblx0XHRcdFx0XHQmJiBjLmVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0SXRlbVRyZWVFbGVtZW50XG5cdFx0XHRcdFx0JiYgaXNSdW5uYWJsZVdpdGhQcm9maWxlT3JCaXRzZXQoYy5lbGVtZW50LnRlc3QpLFxuXHRcdFx0KS5sZW5ndGg7XG5cblx0XHRcdC8vIElmIGl0J3Mgbm90IGFscmVhZHkgaW5jbHVkZWQgYnV0IG1vc3Qgb2YgaXRzIGNoaWxkcmVuIGFyZSwgdGhlbiBhZGQgaXRcblx0XHRcdC8vIGlmIGl0IGNhbiBiZSBydW4gdW5kZXIgdGhlIGN1cnJlbnQgcHJvZmlsZSAod2hlbiBzcGVjaWZpZWQpXG5cdFx0XHRpZiAoXG5cdFx0XHRcdC8vIElmIGl0J3Mgbm90IGFscmVhZHkgaW5jbHVkZWQuLi5cblx0XHRcdFx0IWFscmVhZHlJbmNsdWRlZFxuXHRcdFx0XHQvLyBBbmQgaXQgY2FuIGJlIHJ1biB1c2luZyB0aGUgY3VycmVudCBwcm9maWxlIChpZiBhbnkpXG5cdFx0XHRcdCYmIGlzUnVubmFibGVXaXRoUHJvZmlsZU9yQml0c2V0KGVsZW1lbnQudGVzdClcblx0XHRcdFx0Ly8gQW5kIGVpdGhlciBpdCdzIGEgbGVhZiBub2RlIG9yIG1vc3QgY2hpbGRyZW4gYXJlIGluY2x1ZGVkLCB0aGVuIGluY2x1ZGUgaXQuXG5cdFx0XHRcdCYmICh2aXNpYmxlUnVubmFibGVDaGlsZHJlbiA9PT0gMCB8fCB2aXNpYmxlUnVubmFibGVDaGlsZHJlbiAqIDIgPj0gaW5UcmVlLmNoaWxkcmVuLmxlbmd0aClcblx0XHRcdFx0Ly8gQW5kIG5vdCBpZiB3ZSdyZSBvbmx5IHNob3dpbmcgYSBzaW5nbGUgb2YgaXRzIGNoaWxkcmVuLCBzaW5jZSBpdFxuXHRcdFx0XHQvLyBwcm9iYWJseSBmYW5zIG91dCBsYXRlci4gKFdvcnNlIGNhc2Ugd2UnbGwgZGlyZWN0bHkgaW5jbHVkZSBpdHMgc2luZ2xlIGNoaWxkKVxuXHRcdFx0XHQmJiB2aXNpYmxlUnVubmFibGVDaGlsZHJlbiAhPT0gMVxuXHRcdFx0KSB7XG5cdFx0XHRcdGluY2x1ZGUuYWRkKGVsZW1lbnQudGVzdCk7XG5cdFx0XHRcdGFscmVhZHlJbmNsdWRlZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlY3Vyc2UgXHUyNzI4XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGVsZW1lbnQuY2hpbGRyZW4pIHtcblx0XHRcdFx0YXR0ZW1wdChjaGlsZCwgYWxyZWFkeUluY2x1ZGVkKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aWYgKGZpbHRlclRvVHlwZSA9PT0gJ3NlbGVjdGVkJykge1xuXHRcdFx0Y29uc3Qgc2VsID0gdGhpcy52aWV3TW9kZWwudHJlZS5nZXRTZWxlY3Rpb24oKS5maWx0ZXIoaXNEZWZpbmVkKTtcblx0XHRcdGlmIChzZWwubGVuZ3RoKSB7XG5cblx0XHRcdFx0TDpcblx0XHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIHNlbCkge1xuXHRcdFx0XHRcdGlmIChub2RlIGluc3RhbmNlb2YgVGVzdEl0ZW1UcmVlRWxlbWVudCkge1xuXHRcdFx0XHRcdFx0Ly8gYXZvaWQgYWRkaW5nIGFuIGl0ZW0gaWYgaXRzIHBhcmVudCBpcyBhbHJlYWR5IGluY2x1ZGVkXG5cdFx0XHRcdFx0XHRmb3IgKGxldCBpOiBUZXN0SXRlbVRyZWVFbGVtZW50IHwgbnVsbCA9IG5vZGU7IGk7IGkgPSBpLnBhcmVudCkge1xuXHRcdFx0XHRcdFx0XHRpZiAoaW5jbHVkZS5oYXMoaS50ZXN0KSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlIEw7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aW5jbHVkZS5hZGQobm9kZS50ZXN0KTtcblx0XHRcdFx0XHRcdG5vZGUuY2hpbGRyZW4uZm9yRWFjaChjID0+IGF0dGVtcHQoYywgdHJ1ZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7IGluY2x1ZGU6IFsuLi5pbmNsdWRlXSwgZXhjbHVkZSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgcm9vdCBvZiB3aXRoaW5JdGVtcyB8fCB0aGlzLnRlc3RTZXJ2aWNlLmNvbGxlY3Rpb24ucm9vdEl0ZW1zKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gcHJvamVjdGlvbi5nZXRFbGVtZW50QnlUZXN0SWQocm9vdC5pdGVtLmV4dElkKTtcblx0XHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHR5cGVvZiBwcm9maWxlT3JCaXRzZXQgPT09ICdvYmplY3QnICYmICFjYW5Vc2VQcm9maWxlV2l0aFRlc3QocHJvZmlsZU9yQml0c2V0LCByb290KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aW5jbHVkZS5hZGQoZWxlbWVudC50ZXN0KTtcblx0XHRcdGVsZW1lbnQuY2hpbGRyZW4uZm9yRWFjaChjID0+IGF0dGVtcHQoYywgdHJ1ZSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGluY2x1ZGU6IFsuLi5pbmNsdWRlXSwgZXhjbHVkZSB9O1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyTmF2aWdhYmxlQ29udGFpbmVyKHtcblx0XHRcdG5hbWU6ICd0ZXN0aW5nRXhwbG9yZXJWaWV3Jyxcblx0XHRcdGZvY3VzTm90aWZpZXJzOiBbdGhpc10sXG5cdFx0XHRmb2N1c05leHRXaWRnZXQ6ICgpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLnZpZXdNb2RlbC50cmVlLmlzRE9NRm9jdXNlZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy52aWV3TW9kZWwudHJlZS5kb21Gb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Zm9jdXNQcmV2aW91c1dpZGdldDogKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy52aWV3TW9kZWwudHJlZS5pc0RPTUZvY3VzZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuZmlsdGVyLnZhbHVlPy5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuY29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcudGVzdC1leHBsb3JlcicpKTtcblx0XHR0aGlzLnRyZWVIZWFkZXIgPSBkb20uYXBwZW5kKHRoaXMuY29udGFpbmVyLCBkb20uJCgnLnRlc3QtZXhwbG9yZXItaGVhZGVyJykpO1xuXHRcdHRoaXMuZmlsdGVyQWN0aW9uQmFyLnZhbHVlID0gdGhpcy5jcmVhdGVGaWx0ZXJBY3Rpb25CYXIoKTtcblxuXHRcdGNvbnN0IG1lc3NhZ2VzQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLnRyZWVIZWFkZXIsIGRvbS4kKCcucmVzdWx0LXN1bW1hcnktY29udGFpbmVyJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzdWx0U3VtbWFyeVZpZXcsIG1lc3NhZ2VzQ29udGFpbmVyKSk7XG5cblx0XHRjb25zdCBsaXN0Q29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgZG9tLiQoJy50ZXN0LWV4cGxvcmVyLXRyZWUnKSk7XG5cdFx0dGhpcy52aWV3TW9kZWwgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RpbmdFeHBsb3JlclZpZXdNb2RlbCwgbGlzdENvbnRhaW5lciwgdGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdNb2RlbC50cmVlLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy5sYXN0Rm9jdXNTdGF0ZSA9IExhc3RGb2N1c1N0YXRlLlRyZWUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdNb2RlbC5vbkNoYW5nZVdlbGNvbWVWaXNpYmlsaXR5KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlVmlld1dlbGNvbWVTdGF0ZS5maXJlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdNb2RlbCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWaWV3V2VsY29tZVN0YXRlLmZpcmUoKTtcblx0fVxuXG5cdC8qKiBAb3ZlcnJpZGUgICovXG5cdHB1YmxpYyBvdmVycmlkZSBjcmVhdGVBY3Rpb25WaWV3SXRlbShhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpOiBJQWN0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAoYWN0aW9uLmlkKSB7XG5cdFx0XHRjYXNlIFRlc3RDb21tYW5kSWQuRmlsdGVyQWN0aW9uOlxuXHRcdFx0XHR0aGlzLmZpbHRlci52YWx1ZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdGluZ0V4cGxvcmVyRmlsdGVyLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0XHR0aGlzLmZpbHRlckZvY3VzTGlzdGVuZXIudmFsdWUgPSB0aGlzLmZpbHRlci52YWx1ZS5vbkRpZEZvY3VzKCgpID0+IHRoaXMubGFzdEZvY3VzU3RhdGUgPSBMYXN0Rm9jdXNTdGF0ZS5JbnB1dCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLmZpbHRlci52YWx1ZTtcblx0XHRcdGNhc2UgVGVzdENvbW1hbmRJZC5SdW5TZWxlY3RlZEFjdGlvbjpcblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0UnVuR3JvdXBEcm9wZG93bihUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4sIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHRjYXNlIFRlc3RDb21tYW5kSWQuRGVidWdTZWxlY3RlZEFjdGlvbjpcblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0UnVuR3JvdXBEcm9wZG93bihUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1ZywgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdGNhc2UgVGVzdENvbW1hbmRJZC5Db3ZlcmFnZVNlbGVjdGVkQWN0aW9uOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRSdW5Hcm91cERyb3Bkb3duKFRlc3RSdW5Qcm9maWxlQml0c2V0LkNvdmVyYWdlLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0Y2FzZSBUZXN0Q29tbWFuZElkLlN0YXJ0Q29udGlub3VzUnVuOlxuXHRcdFx0Y2FzZSBUZXN0Q29tbWFuZElkLlN0b3BDb250aW5vdXNSdW46XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldENvbnRpbnVvdXNSdW5Ecm9wZG93bihhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHN1cGVyLmNyZWF0ZUFjdGlvblZpZXdJdGVtKGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHByaXZhdGUgZ2V0VGVzdENvbmZpZ0dyb3VwQWN0aW9ucyhncm91cDogVGVzdFJ1blByb2ZpbGVCaXRzZXQpIHtcblx0XHRjb25zdCBwcm9maWxlQWN0aW9uczogSUFjdGlvbltdID0gW107XG5cblx0XHRsZXQgcGFydGljaXBhdGluZ0dyb3VwcyA9IDA7XG5cdFx0bGV0IHBhcnRpY2lwYXRpbmdQcm9maWxlcyA9IDA7XG5cdFx0bGV0IGhhc0NvbmZpZ3VyYWJsZSA9IGZhbHNlO1xuXHRcdGNvbnN0IGRlZmF1bHRzID0gdGhpcy50ZXN0UHJvZmlsZVNlcnZpY2UuZ2V0R3JvdXBEZWZhdWx0UHJvZmlsZXMoZ3JvdXApO1xuXHRcdGZvciAoY29uc3QgeyBwcm9maWxlcywgY29udHJvbGxlciB9IG9mIHRoaXMudGVzdFByb2ZpbGVTZXJ2aWNlLmFsbCgpKSB7XG5cdFx0XHRsZXQgaGFzQWRkZWQgPSBmYWxzZTtcblxuXHRcdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHByb2ZpbGVzKSB7XG5cdFx0XHRcdGlmIChwcm9maWxlLmdyb3VwICE9PSBncm91cCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFoYXNBZGRlZCkge1xuXHRcdFx0XHRcdGhhc0FkZGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRwYXJ0aWNpcGF0aW5nR3JvdXBzKys7XG5cdFx0XHRcdFx0cHJvZmlsZUFjdGlvbnMucHVzaCh0b0FjdGlvbih7IGlkOiBgJHtjb250cm9sbGVyLmlkfS4kcm9vdGAsIGxhYmVsOiBjb250cm9sbGVyLmxhYmVsLmdldCgpLCBlbmFibGVkOiBmYWxzZSwgY2hlY2tlZDogZmFsc2UsIHJ1bjogKCkgPT4geyB9IH0pKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGhhc0NvbmZpZ3VyYWJsZSA9IGhhc0NvbmZpZ3VyYWJsZSB8fCBwcm9maWxlLmhhc0NvbmZpZ3VyYXRpb25IYW5kbGVyO1xuXHRcdFx0XHRwYXJ0aWNpcGF0aW5nUHJvZmlsZXMrKztcblx0XHRcdFx0cHJvZmlsZUFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdFx0aWQ6IGAke2NvbnRyb2xsZXIuaWR9LiR7cHJvZmlsZS5wcm9maWxlSWR9YCxcblx0XHRcdFx0XHRsYWJlbDogZGVmYXVsdHMuaW5jbHVkZXMocHJvZmlsZSkgPyBsb2NhbGl6ZSgnZGVmYXVsdFRlc3RQcm9maWxlJywgJ3swfSAoRGVmYXVsdCknLCBwcm9maWxlLmxhYmVsKSA6IHByb2ZpbGUubGFiZWwsXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB7IGluY2x1ZGUsIGV4Y2x1ZGUgfSA9IHRoaXMuZ2V0VHJlZUluY2x1ZGVFeGNsdWRlKHByb2ZpbGUpO1xuXHRcdFx0XHRcdFx0dGhpcy50ZXN0U2VydmljZS5ydW5SZXNvbHZlZFRlc3RzKHtcblx0XHRcdFx0XHRcdFx0ZXhjbHVkZTogZXhjbHVkZS5tYXAoZSA9PiBlLml0ZW0uZXh0SWQpLFxuXHRcdFx0XHRcdFx0XHRncm91cDogcHJvZmlsZS5ncm91cCxcblx0XHRcdFx0XHRcdFx0dGFyZ2V0czogW3tcblx0XHRcdFx0XHRcdFx0XHRwcm9maWxlSWQ6IHByb2ZpbGUucHJvZmlsZUlkLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRyb2xsZXJJZDogcHJvZmlsZS5jb250cm9sbGVySWQsXG5cdFx0XHRcdFx0XHRcdFx0dGVzdElkczogaW5jbHVkZS5tYXAoaSA9PiBpLml0ZW0uZXh0SWQpLFxuXHRcdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRleHRLZXlzOiBbc3RyaW5nLCB1bmtub3duXVtdID0gW107XG5cdFx0Ly8gYWxsb3cgZXh0ZW5zaW9uIGF1dGhvciB0byBkZWZpbmUgY29udGV4dCBmb3Igd2hlbiB0byBzaG93IHRoZSB0ZXN0IG1lbnUgYWN0aW9ucyBmb3IgcnVuIG9yIGRlYnVnIG1lbnVzXG5cdFx0aWYgKGdyb3VwID09PSBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4pIHtcblx0XHRcdGNvbnRleHRLZXlzLnB1c2goWyd0ZXN0aW5nLnByb2ZpbGUuY29udGV4dC5ncm91cCcsICdydW4nXSk7XG5cdFx0fVxuXHRcdGlmIChncm91cCA9PT0gVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcpIHtcblx0XHRcdGNvbnRleHRLZXlzLnB1c2goWyd0ZXN0aW5nLnByb2ZpbGUuY29udGV4dC5ncm91cCcsICdkZWJ1ZyddKTtcblx0XHR9XG5cdFx0aWYgKGdyb3VwID09PSBUZXN0UnVuUHJvZmlsZUJpdHNldC5Db3ZlcmFnZSkge1xuXHRcdFx0Y29udGV4dEtleXMucHVzaChbJ3Rlc3RpbmcucHJvZmlsZS5jb250ZXh0Lmdyb3VwJywgJ2NvdmVyYWdlJ10pO1xuXHRcdH1cblx0XHRjb25zdCBrZXkgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoY29udGV4dEtleXMpO1xuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5UZXN0UHJvZmlsZXNDb250ZXh0LCBrZXkpO1xuXG5cdFx0Ly8gZmlsbCBpZiB0aGVyZSBhcmUgYW55IGFjdGlvbnNcblx0XHRjb25zdCBtZW51QWN0aW9ucyA9IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMobWVudSk7XG5cblx0XHRjb25zdCBwb3N0QWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0aWYgKHBhcnRpY2lwYXRpbmdQcm9maWxlcyA+IDEpIHtcblx0XHRcdHBvc3RBY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRpZDogJ3NlbGVjdERlZmF1bHRUZXN0Q29uZmlndXJhdGlvbnMnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NlbGVjdERlZmF1bHRDb25maWdzJywgJ1NlbGVjdCBEZWZhdWx0IFByb2ZpbGUnKSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPElUZXN0UnVuUHJvZmlsZT4oVGVzdENvbW1hbmRJZC5TZWxlY3REZWZhdWx0VGVzdFByb2ZpbGVzLCBncm91cCksXG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0aWYgKGhhc0NvbmZpZ3VyYWJsZSkge1xuXHRcdFx0cG9zdEFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAnY29uZmlndXJlVGVzdFByb2ZpbGVzJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjb25maWd1cmVUZXN0UHJvZmlsZXMnLCAnQ29uZmlndXJlIFRlc3QgUHJvZmlsZXMnKSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPElUZXN0UnVuUHJvZmlsZT4oVGVzdENvbW1hbmRJZC5Db25maWd1cmVUZXN0UHJvZmlsZXNBY3Rpb24sIGdyb3VwKSxcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBzaG93IG1lbnUgYWN0aW9ucyBpZiB0aGVyZSBhcmUgYW55IG90aGVyd2lzZSBkb24ndFxuXHRcdHJldHVybiB7XG5cdFx0XHRudW1iZXJPZlByb2ZpbGVzOiBwYXJ0aWNpcGF0aW5nUHJvZmlsZXMsXG5cdFx0XHRhY3Rpb25zOiBtZW51QWN0aW9ucy5sZW5ndGggPiAwXG5cdFx0XHRcdD8gU2VwYXJhdG9yLmpvaW4ocHJvZmlsZUFjdGlvbnMsIG1lbnVBY3Rpb25zLCBwb3N0QWN0aW9ucylcblx0XHRcdFx0OiBTZXBhcmF0b3Iuam9pbihwcm9maWxlQWN0aW9ucywgcG9zdEFjdGlvbnMpLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwdWJsaWMgb3ZlcnJpZGUgc2F2ZVN0YXRlKCkge1xuXHRcdHRoaXMuZmlsdGVyLnZhbHVlPy5zYXZlU3RhdGUoKTtcblx0XHRzdXBlci5zYXZlU3RhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UnVuR3JvdXBEcm9wZG93bihncm91cDogVGVzdFJ1blByb2ZpbGVCaXRzZXQsIGRlZmF1bHRBY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpIHtcblx0XHRjb25zdCBkcm9wZG93bkFjdGlvbnMgPSB0aGlzLmdldFRlc3RDb25maWdHcm91cEFjdGlvbnMoZ3JvdXApO1xuXHRcdGlmIChkcm9wZG93bkFjdGlvbnMubnVtYmVyT2ZQcm9maWxlcyA8IDIpIHtcblx0XHRcdHJldHVybiBzdXBlci5jcmVhdGVBY3Rpb25WaWV3SXRlbShkZWZhdWx0QWN0aW9uLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmltYXJ5QWN0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51SXRlbUFjdGlvbiwge1xuXHRcdFx0aWQ6IGRlZmF1bHRBY3Rpb24uaWQsXG5cdFx0XHR0aXRsZTogZGVmYXVsdEFjdGlvbi5sYWJlbCxcblx0XHRcdGljb246IGdyb3VwID09PSBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW5cblx0XHRcdFx0PyBpY29ucy50ZXN0aW5nUnVuQWxsSWNvblxuXHRcdFx0XHQ6IGdyb3VwID09PSBUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1Z1xuXHRcdFx0XHRcdD8gaWNvbnMudGVzdGluZ0RlYnVnQWxsSWNvblxuXHRcdFx0XHRcdDogaWNvbnMudGVzdGluZ0NvdmVyYWdlQWxsSWNvbixcblx0XHR9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHREcm9wZG93bldpdGhQcmltYXJ5QWN0aW9uVmlld0l0ZW0sXG5cdFx0XHRwcmltYXJ5QWN0aW9uLCB0aGlzLmdldERyb3Bkb3duQWN0aW9uKCksIGRyb3Bkb3duQWN0aW9ucy5hY3Rpb25zLFxuXHRcdFx0JycsXG5cdFx0XHRvcHRpb25zXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RHJvcGRvd25BY3Rpb24oKSB7XG5cdFx0cmV0dXJuIG5ldyBBY3Rpb24oJ3NlbGVjdFJ1bkNvbmZpZycsIGxvY2FsaXplKCd0ZXN0aW5nU2VsZWN0Q29uZmlnJywgJ1NlbGVjdCBDb25maWd1cmF0aW9uLi4uJyksICdjb2RpY29uLWNoZXZyb24tZG93bicsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb250aW51b3VzUnVuRHJvcGRvd24oZGVmYXVsdEFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucykge1xuXHRcdGNvbnN0IGFsbFByb2ZpbGVzID0gWy4uLkl0ZXJhYmxlLmZsYXRNYXAodGhpcy50ZXN0UHJvZmlsZVNlcnZpY2UuYWxsKCksIChjcik6IEl0ZXJhYmxlPElUZXN0UnVuUHJvZmlsZT4gPT4ge1xuXHRcdFx0aWYgKHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbi5nZXROb2RlQnlJZChjci5jb250cm9sbGVyLmlkKT8uY2hpbGRyZW4uc2l6ZSkge1xuXHRcdFx0XHRyZXR1cm4gSXRlcmFibGUuZmlsdGVyKGNyLnByb2ZpbGVzLCBwID0+IHAuc3VwcG9ydHNDb250aW51b3VzUnVuKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBJdGVyYWJsZS5lbXB0eSgpO1xuXHRcdH0pXTtcblxuXHRcdGlmIChhbGxQcm9maWxlcy5sZW5ndGggPD0gMSkge1xuXHRcdFx0cmV0dXJuIHN1cGVyLmNyZWF0ZUFjdGlvblZpZXdJdGVtKGRlZmF1bHRBY3Rpb24sIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByaW1hcnlBY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVJdGVtQWN0aW9uLCB7XG5cdFx0XHRpZDogZGVmYXVsdEFjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiBkZWZhdWx0QWN0aW9uLmxhYmVsLFxuXHRcdFx0aWNvbjogZGVmYXVsdEFjdGlvbi5pZCA9PT0gVGVzdENvbW1hbmRJZC5TdGFydENvbnRpbm91c1J1biA/IGljb25zLnRlc3RpbmdUdXJuQ29udGludW91c1J1bk9uIDogaWNvbnMudGVzdGluZ1R1cm5Db250aW51b3VzUnVuT2ZmLFxuXHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBkcm9wZG93bkFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGdyb3VwcyA9IGdyb3VwQnkoYWxsUHJvZmlsZXMsIHAgPT4gcC5ncm91cCk7XG5cdFx0Y29uc3QgY3JTZXJ2aWNlID0gdGhpcy5jclNlcnZpY2U7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBbVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuLCBUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1ZywgVGVzdFJ1blByb2ZpbGVCaXRzZXQuQ292ZXJhZ2VdIGFzIGNvbnN0KSB7XG5cdFx0XHRjb25zdCBwcm9maWxlcyA9IGdyb3Vwc1tncm91cF07XG5cdFx0XHRpZiAoIXByb2ZpbGVzKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoT2JqZWN0LmtleXMoZ3JvdXBzKS5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGRyb3Bkb3duQWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRpZDogYCR7Z3JvdXB9LmxhYmVsYCxcblx0XHRcdFx0XHRsYWJlbDogdGVzdFByb2ZpbGVCaXRzZXRbZ3JvdXBdLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dG9vbHRpcDogdGVzdFByb2ZpbGVCaXRzZXRbZ3JvdXBdLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4geyB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBwcm9maWxlIG9mIHByb2ZpbGVzKSB7XG5cdFx0XHRcdGRyb3Bkb3duQWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRpZDogYCR7Z3JvdXB9LiR7cHJvZmlsZS5wcm9maWxlSWR9YCxcblx0XHRcdFx0XHRsYWJlbDogcHJvZmlsZS5sYWJlbCxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dG9vbHRpcDogcHJvZmlsZS5sYWJlbCxcblx0XHRcdFx0XHRjaGVja2VkOiBjclNlcnZpY2UuaXNFbmFibGVkRm9yUHJvZmlsZShwcm9maWxlKSxcblx0XHRcdFx0XHRydW46ICgpID0+IGNyU2VydmljZS5pc0VuYWJsZWRGb3JQcm9maWxlKHByb2ZpbGUpXG5cdFx0XHRcdFx0XHQ/IGNyU2VydmljZS5zdG9wUHJvZmlsZShwcm9maWxlKVxuXHRcdFx0XHRcdFx0OiBjclNlcnZpY2Uuc3RhcnQoW3Byb2ZpbGVdKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHREcm9wZG93bldpdGhQcmltYXJ5QWN0aW9uVmlld0l0ZW0sXG5cdFx0XHRwcmltYXJ5QWN0aW9uLCB0aGlzLmdldERyb3Bkb3duQWN0aW9uKCksIGRyb3Bkb3duQWN0aW9ucyxcblx0XHRcdCcnLFxuXHRcdFx0b3B0aW9uc1xuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUZpbHRlckFjdGlvbkJhcigpIHtcblx0XHRjb25zdCBiYXIgPSBuZXcgQWN0aW9uQmFyKHRoaXMudHJlZUhlYWRlciwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4gdGhpcy5jcmVhdGVBY3Rpb25WaWV3SXRlbShhY3Rpb24sIG9wdGlvbnMpLFxuXHRcdFx0dHJpZ2dlcktleXM6IHsga2V5RG93bjogZmFsc2UsIGtleXM6IFtdIH0sXG5cdFx0fSk7XG5cdFx0YmFyLnB1c2gobmV3IEFjdGlvbihUZXN0Q29tbWFuZElkLkZpbHRlckFjdGlvbikpO1xuXHRcdGJhci5nZXRDb250YWluZXIoKS5jbGFzc0xpc3QuYWRkKCd0ZXN0aW5nLWZpbHRlci1hY3Rpb24tYmFyJyk7XG5cdFx0cmV0dXJuIGJhcjtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRGlzY292ZXJ5UHJvZ3Jlc3MoYnVzeTogbnVtYmVyKSB7XG5cdFx0aWYgKCFidXN5ICYmIHRoaXMuZGlzY292ZXJ5UHJvZ3Jlc3MpIHtcblx0XHRcdHRoaXMuZGlzY292ZXJ5UHJvZ3Jlc3MuY2xlYXIoKTtcblx0XHR9IGVsc2UgaWYgKGJ1c3kgJiYgIXRoaXMuZGlzY292ZXJ5UHJvZ3Jlc3MudmFsdWUpIHtcblx0XHRcdHRoaXMuZGlzY292ZXJ5UHJvZ3Jlc3MudmFsdWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVubWFuYWdlZFByb2dyZXNzLCB7IGxvY2F0aW9uOiB0aGlzLmdldFByb2dyZXNzTG9jYXRpb24oKSB9KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQgPSB0aGlzLmRpbWVuc2lvbnMuaGVpZ2h0LCB3aWR0aCA9IHRoaXMuZGltZW5zaW9ucy53aWR0aCk6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5kaW1lbnNpb25zLmhlaWdodCA9IGhlaWdodDtcblx0XHR0aGlzLmRpbWVuc2lvbnMud2lkdGggPSB3aWR0aDtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHRcdHRoaXMudmlld01vZGVsPy5sYXlvdXQoaGVpZ2h0IC0gdGhpcy50cmVlSGVhZGVyLmNsaWVudEhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMuZmlsdGVyLnZhbHVlPy5sYXlvdXQod2lkdGgpO1xuXHR9XG59XG5cbmNvbnN0IFNVTU1BUllfUkVOREVSX0lOVEVSVkFMID0gMjAwO1xuXG5jbGFzcyBSZXN1bHRTdW1tYXJ5VmlldyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIGVsZW1lbnRzV2VyZUF0dGFjaGVkID0gZmFsc2U7XG5cdHByaXZhdGUgYmFkZ2VUeXBlOiBUZXN0aW5nQ291bnRCYWRnZTtcblx0cHJpdmF0ZSBsYXN0QmFkZ2U/OiBOdW1iZXJCYWRnZSB8IEljb25CYWRnZTtcblx0cHJpdmF0ZSBjb3VudEhvdmVyOiBJTWFuYWdlZEhvdmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IGJhZGdlRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJMb29wID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5yZW5kZXIoKSwgU1VNTUFSWV9SRU5ERVJfSU5URVJWQUwpKTtcblx0cHJpdmF0ZSByZWFkb25seSBlbGVtZW50cyA9IGRvbS5oKCdkaXYucmVzdWx0LXN1bW1hcnknLCBbXG5cdFx0ZG9tLmgoJ2RpdkBzdGF0dXMnKSxcblx0XHRkb20uaCgnZGl2QGNvdW50JyksXG5cdFx0ZG9tLmgoJ2RpdkBjb3VudCcpLFxuXHRcdGRvbS5oKCdzcGFuJyksXG5cdFx0ZG9tLmgoJ2R1cmF0aW9uQGR1cmF0aW9uJyksXG5cdFx0ZG9tLmgoJ2FAcmVydW4nKSxcblx0XSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJVGVzdFJlc3VsdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXN1bHRTZXJ2aWNlOiBJVGVzdFJlc3VsdFNlcnZpY2UsXG5cdFx0QElBY3Rpdml0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY3Rpdml0eVNlcnZpY2U6IElBY3Rpdml0eVNlcnZpY2UsXG5cdFx0QElUZXN0aW5nQ29udGludW91c1J1blNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjclNlcnZpY2U6IElUZXN0aW5nQ29udGludW91c1J1blNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmJhZGdlVHlwZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFRlc3RpbmdDb3VudEJhZGdlPihUZXN0aW5nQ29uZmlnS2V5cy5Db3VudEJhZGdlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZXN1bHRTZXJ2aWNlLm9uUmVzdWx0c0NoYW5nZWQodGhpcy5yZW5kZXIsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXN0aW5nQ29uZmlnS2V5cy5Db3VudEJhZGdlKSkge1xuXHRcdFx0XHR0aGlzLmJhZGdlVHlwZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlc3RpbmdDb25maWdLZXlzLkNvdW50QmFkZ2UpO1xuXHRcdFx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuY291bnRIb3ZlciA9IHRoaXMuX3JlZ2lzdGVyKGhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGhpcy5lbGVtZW50cy5jb3VudCwgJycpKTtcblxuXHRcdGNvbnN0IGFiID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcih0aGlzLmVsZW1lbnRzLnJlcnVuLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiBjcmVhdGVBY3Rpb25WaWV3SXRlbShpbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uLCBvcHRpb25zKSxcblx0XHR9KSk7XG5cdFx0YWIucHVzaChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51SXRlbUFjdGlvbixcblx0XHRcdHsgLi4ubmV3IFJlUnVuTGFzdFJ1bigpLmRlc2MsIGljb246IGljb25zLnRlc3RpbmdSZXJ1bkljb24gfSxcblx0XHRcdHsgLi4ubmV3IERlYnVnTGFzdFJ1bigpLmRlc2MsIGljb246IGljb25zLnRlc3RpbmdEZWJ1Z0ljb24gfSxcblx0XHRcdHt9LFxuXHRcdFx0dW5kZWZpbmVkLCB1bmRlZmluZWRcblx0XHQpLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblxuXHRcdHRoaXMucmVuZGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcigpIHtcblx0XHRjb25zdCB7IHJlc3VsdHMgfSA9IHRoaXMucmVzdWx0U2VydmljZTtcblx0XHRjb25zdCB7IGNvdW50LCByb290LCBzdGF0dXMsIGR1cmF0aW9uLCByZXJ1biB9ID0gdGhpcy5lbGVtZW50cztcblx0XHRpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG5cdFx0XHRpZiAodGhpcy5lbGVtZW50c1dlcmVBdHRhY2hlZCkge1xuXHRcdFx0XHRyb290LnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLmVsZW1lbnRzV2VyZUF0dGFjaGVkID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5pbm5lclRleHQgPSBsb2NhbGl6ZSgnbm9SZXN1bHRzJywgJ05vIHRlc3QgcmVzdWx0cyB5ZXQuJyk7XG5cdFx0XHR0aGlzLmJhZGdlRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpdmUgPSByZXN1bHRzLmZpbHRlcihyID0+ICFyLmNvbXBsZXRlZEF0KSBhcyBMaXZlVGVzdFJlc3VsdFtdO1xuXHRcdGxldCBjb3VudHM6IENvdW50U3VtbWFyeTtcblx0XHRpZiAobGl2ZS5sZW5ndGgpIHtcblx0XHRcdHN0YXR1cy5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoc3Bpbm5pbmdMb2FkaW5nKTtcblx0XHRcdGNvdW50cyA9IGNvbGxlY3RUZXN0U3RhdGVDb3VudHModHJ1ZSwgbGl2ZSk7XG5cdFx0XHR0aGlzLnJlbmRlckxvb3Auc2NoZWR1bGUoKTtcblxuXHRcdFx0Y29uc3QgbGFzdCA9IGxpdmVbbGl2ZS5sZW5ndGggLSAxXTtcblx0XHRcdGR1cmF0aW9uLnRleHRDb250ZW50ID0gZm9ybWF0RHVyYXRpb24oRGF0ZS5ub3coKSAtIGxhc3Quc3RhcnRlZEF0KTtcblx0XHRcdHJlcnVuLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGxhc3QgPSByZXN1bHRzWzBdO1xuXHRcdFx0Y29uc3QgZG9taW5hbnRTdGF0ZSA9IG1hcEZpbmRGaXJzdChzdGF0ZXNJbk9yZGVyLCBzID0+IGxhc3QuY291bnRzW3NdID4gMCA/IHMgOiB1bmRlZmluZWQpO1xuXHRcdFx0c3RhdHVzLmNsYXNzTmFtZSA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29ucy50ZXN0aW5nU3RhdGVzVG9JY29ucy5nZXQoZG9taW5hbnRTdGF0ZSA/PyBUZXN0UmVzdWx0U3RhdGUuVW5zZXQpISk7XG5cdFx0XHRjb3VudHMgPSBjb2xsZWN0VGVzdFN0YXRlQ291bnRzKGZhbHNlLCBbbGFzdF0pO1xuXHRcdFx0ZHVyYXRpb24udGV4dENvbnRlbnQgPSBsYXN0IGluc3RhbmNlb2YgTGl2ZVRlc3RSZXN1bHQgPyBmb3JtYXREdXJhdGlvbihsYXN0LmNvbXBsZXRlZEF0ISAtIGxhc3Quc3RhcnRlZEF0KSA6ICcnO1xuXHRcdFx0cmVydW4uc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0fVxuXG5cdFx0Y291bnQudGV4dENvbnRlbnQgPSBgJHtjb3VudHMucGFzc2VkfS8ke2NvdW50cy50b3RhbFdpbGxCZVJ1bn1gO1xuXHRcdHRoaXMuY291bnRIb3Zlci51cGRhdGUoZ2V0VGVzdFByb2dyZXNzVGV4dChjb3VudHMpKTtcblx0XHR0aGlzLnJlbmRlckFjdGl2aXR5QmFkZ2UoY291bnRzLCBsaXZlLmxlbmd0aCA+IDApO1xuXG5cdFx0aWYgKCF0aGlzLmVsZW1lbnRzV2VyZUF0dGFjaGVkKSB7XG5cdFx0XHRkb20uY2xlYXJOb2RlKHRoaXMuY29udGFpbmVyKTtcblx0XHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHJvb3QpO1xuXHRcdFx0dGhpcy5lbGVtZW50c1dlcmVBdHRhY2hlZCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJBY3Rpdml0eUJhZGdlKGNvdW50U3VtbWFyeTogQ291bnRTdW1tYXJ5LCBpc1J1bm5pbmc6IGJvb2xlYW4pIHtcblx0XHRpZiAoaXNSdW5uaW5nKSB7XG5cdFx0XHRpZiAodGhpcy5iYWRnZURpc3Bvc2FibGUudmFsdWUgJiYgdGhpcy5sYXN0QmFkZ2UgaW5zdGFuY2VvZiBJY29uQmFkZ2UgJiYgdGhpcy5sYXN0QmFkZ2UuaWNvbiA9PT0gc3Bpbm5pbmdMb2FkaW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5sYXN0QmFkZ2UgPSBuZXcgSWNvbkJhZGdlKHNwaW5uaW5nTG9hZGluZywgKCkgPT4gbG9jYWxpemUoJ3Rlc3RpbmdSdW5uaW5nQmFkZ2UnLCAnVGVzdHMgYXJlIHJ1bm5pbmcnKSk7XG5cdFx0fSBlbHNlIGlmIChjb3VudFN1bW1hcnkgJiYgdGhpcy5iYWRnZVR5cGUgIT09IFRlc3RpbmdDb3VudEJhZGdlLk9mZiAmJiBjb3VudFN1bW1hcnlbdGhpcy5iYWRnZVR5cGVdICE9PSAwKSB7XG5cdFx0XHRpZiAodGhpcy5iYWRnZURpc3Bvc2FibGUudmFsdWUgJiYgdGhpcy5sYXN0QmFkZ2UgaW5zdGFuY2VvZiBOdW1iZXJCYWRnZSAmJiB0aGlzLmxhc3RCYWRnZS5udW1iZXIgPT09IGNvdW50U3VtbWFyeVt0aGlzLmJhZGdlVHlwZV0pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmxhc3RCYWRnZSA9IG5ldyBOdW1iZXJCYWRnZShjb3VudFN1bW1hcnlbdGhpcy5iYWRnZVR5cGVdLCBudW0gPT4gdGhpcy5nZXRMb2NhbGl6ZWRCYWRnZVN0cmluZyh0aGlzLmJhZGdlVHlwZSwgbnVtKSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmNyU2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0aWYgKHRoaXMuYmFkZ2VEaXNwb3NhYmxlLnZhbHVlICYmIHRoaXMubGFzdEJhZGdlIGluc3RhbmNlb2YgSWNvbkJhZGdlICYmIHRoaXMubGFzdEJhZGdlLmljb24gPT09IGljb25zLnRlc3RpbmdDb250aW51b3VzSXNPbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubGFzdEJhZGdlID0gbmV3IEljb25CYWRnZShpY29ucy50ZXN0aW5nQ29udGludW91c0lzT24sICgpID0+IGxvY2FsaXplKCd0ZXN0aW5nQ29udGludW91c0JhZGdlJywgJ1Rlc3RzIGFyZSBiZWluZyB3YXRjaGVkIGZvciBjaGFuZ2VzJykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIXRoaXMubGFzdEJhZGdlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5sYXN0QmFkZ2UgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5iYWRnZURpc3Bvc2FibGUudmFsdWUgPSB0aGlzLmxhc3RCYWRnZSAmJiB0aGlzLmFjdGl2aXR5U2VydmljZS5zaG93Vmlld0FjdGl2aXR5KFRlc3RpbmcuRXhwbG9yZXJWaWV3SWQsIHsgYmFkZ2U6IHRoaXMubGFzdEJhZGdlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRMb2NhbGl6ZWRCYWRnZVN0cmluZyhjb3VudEJhZGdlVHlwZTogVGVzdGluZ0NvdW50QmFkZ2UsIGNvdW50OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAoY291bnRCYWRnZVR5cGUpIHtcblx0XHRcdGNhc2UgVGVzdGluZ0NvdW50QmFkZ2UuUGFzc2VkOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rlc3RpbmdDb3VudEJhZGdlUGFzc2VkJywgJ3swfSBwYXNzZWQgdGVzdHMnLCBjb3VudCk7XG5cdFx0XHRjYXNlIFRlc3RpbmdDb3VudEJhZGdlLlNraXBwZWQ6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndGVzdGluZ0NvdW50QmFkZ2VTa2lwcGVkJywgJ3swfSBza2lwcGVkIHRlc3RzJywgY291bnQpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0ZXN0aW5nQ291bnRCYWRnZUZhaWxlZCcsICd7MH0gZmFpbGVkIHRlc3RzJywgY291bnQpO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCBlbnVtIFdlbGNvbWVFeHBlcmllbmNlIHtcblx0Tm9uZSxcblx0Rm9yV29ya3NwYWNlLFxuXHRGb3JEb2N1bWVudCxcbn1cblxuY2xhc3MgVGVzdGluZ0V4cGxvcmVyVmlld01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyB0cmVlOiBUZXN0aW5nT2JqZWN0VHJlZTxGdXp6eVNjb3JlPjtcblx0cHJpdmF0ZSBmaWx0ZXI6IFRlc3RzRmlsdGVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJvamVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJVGVzdFRyZWVQcm9qZWN0aW9uPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJldmVhbFRpbWVvdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdNb2RlOiBJQ29udGV4dEtleTxUZXN0RXhwbG9yZXJWaWV3TW9kZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdTb3J0aW5nOiBJQ29udGV4dEtleTxUZXN0RXhwbG9yZXJWaWV3U29ydGluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgd2VsY29tZVZpc2liaWxpdHlFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8V2VsY29tZUV4cGVyaWVuY2U+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvblJ1bm5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUZXN0RXhwbG9yZXJBY3Rpb25SdW5uZXIoKCkgPT4gdGhpcy50cmVlLmdldFNlbGVjdGlvbigpLmZpbHRlcihpc0RlZmluZWQpKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbGFzdFZpZXdTdGF0ZTogU3RvcmVkVmFsdWU8SVNlcmlhbGl6ZWRUZXN0VHJlZUNvbGxhcHNlU3RhdGU+O1xuXHRwcml2YXRlIHJlYWRvbmx5IG5vVGVzdEZvckRvY3VtZW50V2lkZ2V0OiBOb1Rlc3RzRm9yRG9jdW1lbnRXaWRnZXQ7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlcmUncyBhIHJldmVhbCByZXF1ZXN0IHdoaWNoIGhhcyBub3QgeWV0IGJlZW4gZGVsaXZlcmVkLiBUaGlzXG5cdCAqIGNhbiBoYXBwZW4gaWYgdGhlIHVzZXIgYXNrcyB0byByZXZlYWwgYmVmb3JlIHRoZSB0ZXN0IHRyZWUgaXMgbG9hZGVkLlxuXHQgKiBXZSBjaGVjayB0byBzZWUgaWYgdGhlIHJldmVhbCByZXF1ZXN0IGlzIHByZXNlbnQgb24gZWFjaCB0cmVlIHVwZGF0ZSxcblx0ICogYW5kIGRvIGl0IHRoZW4gaWYgc28uXG5cdCAqL1xuXHRwcml2YXRlIGhhc1BlbmRpbmdSZXZlYWwgPSBmYWxzZTtcblx0LyoqXG5cdCAqIEZpcmVzIHdoZW4gdGhlIHZpc2liaWxpdHkgb2YgdGhlIHBsYWNlaG9sZGVyIHN0YXRlIGNoYW5nZXMuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgb25DaGFuZ2VXZWxjb21lVmlzaWJpbGl0eSA9IHRoaXMud2VsY29tZVZpc2liaWxpdHlFbWl0dGVyLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBHZXRzIHdoZXRoZXIgdGhlIHdlbGNvbWUgc2hvdWxkIGJlIHZpc2libGUuXG5cdCAqL1xuXHRwdWJsaWMgd2VsY29tZUV4cGVyaWVuY2UgPSBXZWxjb21lRXhwZXJpZW5jZS5Ob25lO1xuXG5cdHB1YmxpYyBnZXQgdmlld01vZGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXdNb2RlLmdldCgpID8/IFRlc3RFeHBsb3JlclZpZXdNb2RlLlRyZWU7XG5cdH1cblxuXHRwdWJsaWMgc2V0IHZpZXdNb2RlKG5ld01vZGU6IFRlc3RFeHBsb3JlclZpZXdNb2RlKSB7XG5cdFx0aWYgKG5ld01vZGUgPT09IHRoaXMuX3ZpZXdNb2RlLmdldCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmlld01vZGUuc2V0KG5ld01vZGUpO1xuXHRcdHRoaXMudXBkYXRlUHJlZmVycmVkUHJvamVjdGlvbigpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3Rlc3Rpbmcudmlld01vZGUnLCBuZXdNb2RlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblxuXHRwdWJsaWMgZ2V0IHZpZXdTb3J0aW5nKCkge1xuXHRcdHJldHVybiB0aGlzLl92aWV3U29ydGluZy5nZXQoKSA/PyBUZXN0RXhwbG9yZXJWaWV3U29ydGluZy5CeVN0YXR1cztcblx0fVxuXG5cdHB1YmxpYyBzZXQgdmlld1NvcnRpbmcobmV3U29ydGluZzogVGVzdEV4cGxvcmVyVmlld1NvcnRpbmcpIHtcblx0XHRpZiAobmV3U29ydGluZyA9PT0gdGhpcy5fdmlld1NvcnRpbmcuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl92aWV3U29ydGluZy5zZXQobmV3U29ydGluZyk7XG5cdFx0dGhpcy50cmVlLnJlc29ydChudWxsKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCd0ZXN0aW5nLnZpZXdTb3J0aW5nJywgbmV3U29ydGluZywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGxpc3RDb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRXZlbnQ8Ym9vbGVhbj4sXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElUZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlc3RTZXJ2aWNlOiBJVGVzdFNlcnZpY2UsXG5cdFx0QElUZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZSBwcml2YXRlIHJlYWRvbmx5IGZpbHRlclN0YXRlOiBUZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRlc3RSZXN1bHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVzdFJlc3VsdHM6IElUZXN0UmVzdWx0U2VydmljZSxcblx0XHRASVRlc3RpbmdQZWVrT3BlbmVyIHByaXZhdGUgcmVhZG9ubHkgcGVla09wZW5lcjogSVRlc3RpbmdQZWVrT3BlbmVyLFxuXHRcdEBJVGVzdFByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVzdFByb2ZpbGVTZXJ2aWNlOiBJVGVzdFByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJVGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY3JTZXJ2aWNlOiBJVGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuaGFzUGVuZGluZ1JldmVhbCA9ICEhZmlsdGVyU3RhdGUucmV2ZWFsLmdldCgpO1xuXHRcdHRoaXMubm9UZXN0Rm9yRG9jdW1lbnRXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb1Rlc3RzRm9yRG9jdW1lbnRXaWRnZXQsIGxpc3RDb250YWluZXIpKTtcblx0XHR0aGlzLmxhc3RWaWV3U3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgU3RvcmVkVmFsdWU8SVNlcmlhbGl6ZWRUZXN0VHJlZUNvbGxhcHNlU3RhdGU+KHtcblx0XHRcdGtleTogJ3Rlc3RpbmcudHJlZVN0YXRlJyxcblx0XHRcdHNjb3BlOiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLFxuXHRcdFx0dGFyZ2V0OiBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsXG5cdFx0fSwgdGhpcy5zdG9yYWdlU2VydmljZSkpO1xuXHRcdHRoaXMuX3ZpZXdNb2RlID0gVGVzdGluZ0NvbnRleHRLZXlzLnZpZXdNb2RlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fdmlld1NvcnRpbmcgPSBUZXN0aW5nQ29udGV4dEtleXMudmlld1NvcnRpbmcuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl92aWV3TW9kZS5zZXQodGhpcy5zdG9yYWdlU2VydmljZS5nZXQoJ3Rlc3Rpbmcudmlld01vZGUnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBUZXN0RXhwbG9yZXJWaWV3TW9kZS5UcmVlKSBhcyBUZXN0RXhwbG9yZXJWaWV3TW9kZSk7XG5cdFx0dGhpcy5fdmlld1NvcnRpbmcuc2V0KHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KCd0ZXN0aW5nLnZpZXdTb3J0aW5nJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgVGVzdEV4cGxvcmVyVmlld1NvcnRpbmcuQnlMb2NhdGlvbikgYXMgVGVzdEV4cGxvcmVyVmlld1NvcnRpbmcpO1xuXG5cdFx0dGhpcy5yZWV2YWx1YXRlV2VsY29tZVN0YXRlKCk7XG5cdFx0dGhpcy5maWx0ZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RzRmlsdGVyLCB0ZXN0U2VydmljZS5jb2xsZWN0aW9uKTtcblx0XHR0aGlzLnRyZWUgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFRlc3RpbmdPYmplY3RUcmVlLFxuXHRcdFx0J1Rlc3QgRXhwbG9yZXIgTGlzdCcsXG5cdFx0XHRsaXN0Q29udGFpbmVyLFxuXHRcdFx0bmV3IExpc3REZWxlZ2F0ZSgpLFxuXHRcdFx0W1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0SXRlbVJlbmRlcmVyLCB0aGlzLmFjdGlvblJ1bm5lciksXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVycm9yUmVuZGVyZXIpLFxuXHRcdFx0XSxcblx0XHRcdHtcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjogaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSWRlbnRpdHlQcm92aWRlciksXG5cdFx0XHRcdGhpZGVUd2lzdGllc09mQ2hpbGRsZXNzRWxlbWVudHM6IGZhbHNlLFxuXHRcdFx0XHRzb3J0ZXI6IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyZWVTb3J0ZXIsIHRoaXMpLFxuXHRcdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcmVlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciksXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciksXG5cdFx0XHRcdGZpbHRlcjogdGhpcy5maWx0ZXIsXG5cdFx0XHRcdGZpbmRXaWRnZXRFbmFibGVkOiBmYWxzZSxcblx0XHRcdH0pIGFzIFRlc3RpbmdPYmplY3RUcmVlPEZ1enp5U2NvcmU+O1xuXG5cblx0XHQvLyBzYXZlcyB0aGUgY29sbGFwc2Ugc3RhdGUgc28gdGhhdCBpZiBpdGVtcyBhcmUgcmVtb3ZlZCBvciByZWZyZXNoZWQsIHRoZXlcblx0XHQvLyByZXRhaW4gdGhlIHNhbWUgc3RhdGUgKCMxNzAxNjkpXG5cdFx0Y29uc3QgY29sbGFwc2VTdGF0ZVNhdmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0Ly8gcmV1c2UgdGhlIGxhc3QgdmlldyBzdGF0ZSB0byBhdm9pZCBtYWtpbmcgYSBidW5jaCBvZiBvYmplY3QgZ2FyYmFnZTpcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy50cmVlLmdldE9wdGltaXplZFZpZXdTdGF0ZSh0aGlzLmxhc3RWaWV3U3RhdGUuZ2V0KHt9KSk7XG5cdFx0XHRjb25zdCBwcm9qZWN0aW9uID0gdGhpcy5wcm9qZWN0aW9uLnZhbHVlO1xuXHRcdFx0aWYgKHByb2plY3Rpb24pIHtcblx0XHRcdFx0cHJvamVjdGlvbi5sYXN0U3RhdGUgPSBzdGF0ZTtcblx0XHRcdH1cblx0XHR9LCAzMDAwKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlKGV2dCA9PiB7XG5cdFx0XHRpZiAoZXZ0Lm5vZGUuZWxlbWVudCBpbnN0YW5jZW9mIFRlc3RJdGVtVHJlZUVsZW1lbnQpIHtcblx0XHRcdFx0aWYgKCFldnQubm9kZS5jb2xsYXBzZWQpIHtcblx0XHRcdFx0XHR0aGlzLnByb2plY3Rpb24udmFsdWU/LmV4cGFuZEVsZW1lbnQoZXZ0Lm5vZGUuZWxlbWVudCwgZXZ0LmRlZXAgPyBJbmZpbml0eSA6IDApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbGxhcHNlU3RhdGVTYXZlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JTZXJ2aWNlLm9uRGlkQ2hhbmdlKHRlc3RJZCA9PiB7XG5cdFx0XHRpZiAodGVzdElkKSB7XG5cdFx0XHRcdC8vIGEgY29udGludW91cyBydW4gdGVzdCB3aWxsIHNvcnQgdG8gdGhlIHRvcDpcblx0XHRcdFx0Y29uc3QgZWxlbSA9IHRoaXMucHJvamVjdGlvbi52YWx1ZT8uZ2V0RWxlbWVudEJ5VGVzdElkKHRlc3RJZCk7XG5cdFx0XHRcdHRoaXMudHJlZS5yZXNvcnQoZWxlbT8ucGFyZW50ICYmIHRoaXMudHJlZS5oYXNFbGVtZW50KGVsZW0ucGFyZW50KSA/IGVsZW0ucGFyZW50IDogbnVsbCwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkQ2hhbmdlVmlzaWJpbGl0eSh2aXNpYmxlID0+IHtcblx0XHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuZW5zdXJlUHJvamVjdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkNvbnRleHRNZW51KGUgPT4gdGhpcy5vbkNvbnRleHRNZW51KGUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoXG5cdFx0XHRmaWx0ZXJTdGF0ZS50ZXh0Lm9uRGlkQ2hhbmdlLFxuXHRcdFx0ZmlsdGVyU3RhdGUuZnV6enkub25EaWRDaGFuZ2UsXG5cdFx0XHR0ZXN0U2VydmljZS5leGNsdWRlZC5vblRlc3RFeGNsdXNpb25zQ2hhbmdlZCxcblx0XHQpKCgpID0+IHtcblx0XHRcdGlmICghZmlsdGVyU3RhdGUudGV4dC52YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy50cmVlLnJlZmlsdGVyKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5maWx0ZXIubGFzdEluY2x1ZGVkVGVzdHMgPSBuZXcgU2V0KCk7XG5cdFx0XHR0aGlzLnRyZWUucmVmaWx0ZXIoKTtcblx0XHRcdHRoaXMuZmlsdGVyLmxhc3RJbmNsdWRlZFRlc3RzID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHRlc3Qgb2YgaXRlbXMpIHtcblx0XHRcdFx0dGhpcy50cmVlLmV4cGFuZFRvKHRlc3QpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZE9wZW4oZSA9PiB7XG5cdFx0XHRpZiAoIShlLmVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0SXRlbVRyZWVFbGVtZW50KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGZpbHRlclN0YXRlLmRpZFNlbGVjdFRlc3RJbkV4cGxvcmVyKGUuZWxlbWVudC50ZXN0Lml0ZW0uZXh0SWQpO1xuXG5cdFx0XHRpZiAoIWUuZWxlbWVudC5jaGlsZHJlbi5zaXplICYmIGUuZWxlbWVudC50ZXN0Lml0ZW0udXJpKSB7XG5cdFx0XHRcdGlmICghdGhpcy50cnlQZWVrRXJyb3IoZS5lbGVtZW50KSkge1xuXHRcdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUucmV2ZWFsVGVzdCcsIGUuZWxlbWVudC50ZXN0Lml0ZW0uZXh0SWQsIHtcblx0XHRcdFx0XHRcdG9wZW5Ub1NpZGU6IGUuc2lkZUJ5U2lkZSxcblx0XHRcdFx0XHRcdHByZXNlcnZlRm9jdXM6IHRydWUsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkNoYW5nZVdlbGNvbWVWaXNpYmlsaXR5KGUgPT4ge1xuXHRcdFx0dGhpcy5ub1Rlc3RGb3JEb2N1bWVudFdpZGdldC5zZXRWaXNpYmxlKGUgPT09IFdlbGNvbWVFeHBlcmllbmNlLkZvckRvY3VtZW50KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy50cmVlLmdldEhUTUxFbGVtZW50KCksICdrZXlkb3duJywgZXZ0ID0+IHtcblx0XHRcdGlmIChldnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdHRoaXMuaGFuZGxlRXhlY3V0ZUtleXByZXNzKGV2dCk7XG5cdFx0XHR9IGVsc2UgaWYgKERlZmF1bHRLZXlib2FyZE5hdmlnYXRpb25EZWxlZ2F0ZS5taWdodFByb2R1Y2VQcmludGFibGVDaGFyYWN0ZXIoZXZ0KSkge1xuXHRcdFx0XHRmaWx0ZXJTdGF0ZS50ZXh0LnZhbHVlID0gZXZ0LmJyb3dzZXJFdmVudC5rZXk7XG5cdFx0XHRcdGZpbHRlclN0YXRlLmZvY3VzSW5wdXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLnJldmVhbEJ5SWQoZmlsdGVyU3RhdGUucmV2ZWFsLnJlYWQocmVhZGVyKSwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRDaGFuZ2VWaXNpYmlsaXR5KHZpc2libGUgPT4ge1xuXHRcdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdFx0ZmlsdGVyU3RhdGUuZm9jdXNJbnB1dCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGxldCBmb2xsb3dSdW5uaW5nVGVzdHMgPSBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uU2VydmljZSwgVGVzdGluZ0NvbmZpZ0tleXMuRm9sbG93UnVubmluZ1Rlc3QpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlc3RpbmdDb25maWdLZXlzLkZvbGxvd1J1bm5pbmdUZXN0KSkge1xuXHRcdFx0XHRmb2xsb3dSdW5uaW5nVGVzdHMgPSBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uU2VydmljZSwgVGVzdGluZ0NvbmZpZ0tleXMuRm9sbG93UnVubmluZ1Rlc3QpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGxldCBhbHdheXNSZXZlYWxUZXN0QWZ0ZXJTdGF0ZUNoYW5nZSA9IGdldFRlc3RpbmdDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0aW5nQ29uZmlnS2V5cy5BbHdheXNSZXZlYWxUZXN0T25TdGF0ZUNoYW5nZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVzdGluZ0NvbmZpZ0tleXMuQWx3YXlzUmV2ZWFsVGVzdE9uU3RhdGVDaGFuZ2UpKSB7XG5cdFx0XHRcdGFsd2F5c1JldmVhbFRlc3RBZnRlclN0YXRlQ2hhbmdlID0gZ2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvblNlcnZpY2UsIFRlc3RpbmdDb25maWdLZXlzLkFsd2F5c1JldmVhbFRlc3RPblN0YXRlQ2hhbmdlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0ZXN0UmVzdWx0cy5vblRlc3RDaGFuZ2VkKGV2dCA9PiB7XG5cdFx0XHRpZiAoIWZvbGxvd1J1bm5pbmdUZXN0cykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChldnQucmVhc29uICE9PSBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbi5Pd25TdGF0ZUNoYW5nZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLnRyZWUuc2VsZWN0aW9uU2l6ZSA+IDEpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBkb24ndCBjaGFuZ2UgYSBtdWx0aS1zZWxlY3Rpb24gIzE4MDk1MFxuXHRcdFx0fVxuXG5cdFx0XHQvLyBmb2xsb3cgcnVubmluZyB0ZXN0cywgb3IgdGVzdHMgd2hvc2Ugc3RhdGUgY2hhbmdlZC4gVGVzdHMgdGhhdFxuXHRcdFx0Ly8gY29tcGxldGUgdmVyeSBmYXN0IG1heSBub3QgZW50ZXIgdGhlIHJ1bm5pbmcgc3RhdGUgYXQgYWxsLlxuXHRcdFx0aWYgKGV2dC5pdGVtLm93bkNvbXB1dGVkU3RhdGUgIT09IFRlc3RSZXN1bHRTdGF0ZS5SdW5uaW5nICYmICEoZXZ0LnByZXZpb3VzU3RhdGUgPT09IFRlc3RSZXN1bHRTdGF0ZS5RdWV1ZWQgJiYgaXNTdGF0ZVdpdGhSZXN1bHQoZXZ0Lml0ZW0ub3duQ29tcHV0ZWRTdGF0ZSkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5yZXZlYWxCeUlkKGV2dC5pdGVtLml0ZW0uZXh0SWQsIGFsd2F5c1JldmVhbFRlc3RBZnRlclN0YXRlQ2hhbmdlLCBmYWxzZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGVzdFJlc3VsdHMub25SZXN1bHRzQ2hhbmdlZCgoKSA9PiB7XG5cdFx0XHR0aGlzLnRyZWUucmVzb3J0KG51bGwpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGVzdFByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMudHJlZS5yZXJlbmRlcigpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGFsbE9wZW5FZGl0b3JJbnB1dHMgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHRlZGl0b3JTZXJ2aWNlLm9uRGlkRWRpdG9yc0NoYW5nZSxcblx0XHRcdCgpID0+IG5ldyBTZXQoZWRpdG9yR3JvdXBzU2VydmljZS5ncm91cHMuZmxhdE1hcChnID0+IGcuZWRpdG9ycykubWFwKGUgPT4gZS5yZXNvdXJjZSkuZmlsdGVyKGlzRGVmaW5lZCkpLFxuXHRcdCk7XG5cblx0XHRjb25zdCBhY3RpdmVSZXNvdXJjZSA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSwgKCkgPT4ge1xuXHRcdFx0aWYgKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHRcdHJldHVybiBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvci5wcmltYXJ5LnJlc291cmNlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yPy5yZXNvdXJjZTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGZpbHRlclRleHQgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMuZmlsdGVyU3RhdGUudGV4dC5vbkRpZENoYW5nZSwgKCkgPT4gdGhpcy5maWx0ZXJTdGF0ZS50ZXh0KTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRmaWx0ZXJUZXh0LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICh0aGlzLmZpbHRlclN0YXRlLmlzRmlsdGVyaW5nRm9yKFRlc3RGaWx0ZXJUZXJtLk9wZW5lZEZpbGVzKSkge1xuXHRcdFx0XHR0aGlzLmZpbHRlci5maWx0ZXJUb0RvY3VtZW50VXJpKFsuLi5hbGxPcGVuRWRpdG9ySW5wdXRzLnJlYWQocmVhZGVyKV0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5maWx0ZXIuZmlsdGVyVG9Eb2N1bWVudFVyaShbYWN0aXZlUmVzb3VyY2UucmVhZChyZWFkZXIpXS5maWx0ZXIoaXNEZWZpbmVkKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmZpbHRlclN0YXRlLmlzRmlsdGVyaW5nRm9yKFRlc3RGaWx0ZXJUZXJtLkN1cnJlbnREb2MpIHx8IHRoaXMuZmlsdGVyU3RhdGUuaXNGaWx0ZXJpbmdGb3IoVGVzdEZpbHRlclRlcm0uT3BlbmVkRmlsZXMpKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5yZWZpbHRlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKCh7IHJlYXNvbiwgfSkgPT4ge1xuXHRcdFx0aWYgKHJlYXNvbiA9PT0gV2lsbFNhdmVTdGF0ZVJlYXNvbi5TSFVURE9XTikge1xuXHRcdFx0XHR0aGlzLmxhc3RWaWV3U3RhdGUuc3RvcmUodGhpcy50cmVlLmdldE9wdGltaXplZFZpZXdTdGF0ZSgpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmUtbGF5b3V0IHRoZSB0cmVlLlxuXHQgKi9cblx0cHVibGljIGxheW91dChoZWlnaHQ/OiBudW1iZXIsIHdpZHRoPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmllcyB0byByZXZlYWwgYnkgZXh0ZW5zaW9uIElELiBRdWV1ZXMgdGhlIHJlcXVlc3QgaWYgdGhlIGV4dGVuc2lvblxuXHQgKiBJRCBpcyBub3QgY3VycmVudGx5IGF2YWlsYWJsZS5cblx0ICovXG5cdHByaXZhdGUgcmV2ZWFsQnlJZChpZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBleHBhbmQgPSB0cnVlLCBmb2N1cyA9IHRydWUpIHtcblx0XHRpZiAoIWlkKSB7XG5cdFx0XHR0aGlzLmhhc1BlbmRpbmdSZXZlYWwgPSBmYWxzZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9qZWN0aW9uID0gdGhpcy5lbnN1cmVQcm9qZWN0aW9uKCk7XG5cblx0XHQvLyBJZiB0aGUgaXRlbSBpdHNlbGYgaXMgdmlzaWJsZSBpbiB0aGUgdHJlZSwgc2hvdyBpdC4gT3RoZXJ3aXNlLCBleHBhbmRcblx0XHQvLyBpdHMgY2xvc2VzdCBwYXJlbnQuXG5cdFx0bGV0IGV4cGFuZFRvTGV2ZWwgPSAwO1xuXHRcdGNvbnN0IGlkUGF0aCA9IFsuLi5UZXN0SWQuZnJvbVN0cmluZyhpZCkuaWRzRnJvbVJvb3QoKV07XG5cdFx0Zm9yIChsZXQgaSA9IGlkUGF0aC5sZW5ndGggLSAxOyBpID49IGV4cGFuZFRvTGV2ZWw7IGktLSkge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IHByb2plY3Rpb24uZ2V0RWxlbWVudEJ5VGVzdElkKGlkUGF0aFtpXS50b1N0cmluZygpKTtcblx0XHRcdC8vIFNraXAgYWxsIGVsZW1lbnRzIHRoYXQgYXJlbid0IGluIHRoZSB0cmVlLlxuXHRcdFx0aWYgKCFlbGVtZW50IHx8ICF0aGlzLnRyZWUuaGFzRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgdGhpcyAnaWYnIGlzIHRydWUsIHdlJ3JlIGF0IHRoZSBjbG9zZXN0LXZpc2libGUgcGFyZW50IHRvIHRoZSBub2RlXG5cdFx0XHQvLyB3ZSB3YW50IHRvIGV4cGFuZC4gRXhwYW5kIHRoYXQsIGFuZCB0aGVuIHN0YXJ0IHRoZSBsb29wIGFnYWluIGJlY2F1c2Vcblx0XHRcdC8vIHdlIG1pZ2h0IGFscmVhZHkgaGF2ZSBjaGlsZHJlbiBmb3IgaXQuXG5cdFx0XHRpZiAoaSA8IGlkUGF0aC5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdGlmIChleHBhbmQpIHtcblx0XHRcdFx0XHR0aGlzLnRyZWUuZXhwYW5kKGVsZW1lbnQpO1xuXHRcdFx0XHRcdGV4cGFuZFRvTGV2ZWwgPSBpICsgMTsgLy8gYXZvaWQgYW4gaW5maW5pdGUgbG9vcCBpZiB0aGUgdGVzdCBkb2VzIG5vdCBleGlzdFxuXHRcdFx0XHRcdGkgPSBpZFBhdGgubGVuZ3RoIC0gMTsgLy8gcmVzdGFydCB0aGUgbG9vcCBzaW5jZSBuZXcgY2hpbGRyZW4gbWF5IG5vdyBiZSB2aXNpYmxlXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gT3RoZXJ3aXNlLCB3ZSd2ZSBhcnJpdmVkIVxuXG5cdFx0XHQvLyBJZiB0aGUgbm9kZSBvciBhbnkgb2YgaXRzIGNoaWxkcmVuIGFyZSBleGNsdWRlZCwgZmxpcCBvbiB0aGUgJ3Nob3dcblx0XHRcdC8vIGV4Y2x1ZGVkIHRlc3RzJyBjaGVja2JveCBhdXRvbWF0aWNhbGx5LiBJZiB3ZSBkaWRuJ3QgZXhwYW5kLCB0aGVuIHNldFxuXHRcdFx0Ly8gdGFyZ2V0IGZvY3VzIHRhcmdldCB0byB0aGUgZmlyc3QgY29sbGFwc2VkIGVsZW1lbnQuXG5cblx0XHRcdGxldCBmb2N1c1RhcmdldCA9IGVsZW1lbnQ7XG5cdFx0XHRmb3IgKGxldCBuOiBUZXN0SXRlbVRyZWVFbGVtZW50IHwgbnVsbCA9IGVsZW1lbnQ7IG4gaW5zdGFuY2VvZiBUZXN0SXRlbVRyZWVFbGVtZW50OyBuID0gbi5wYXJlbnQpIHtcblx0XHRcdFx0aWYgKG4udGVzdCAmJiB0aGlzLnRlc3RTZXJ2aWNlLmV4Y2x1ZGVkLmNvbnRhaW5zKG4udGVzdCkpIHtcblx0XHRcdFx0XHR0aGlzLmZpbHRlclN0YXRlLnRvZ2dsZUZpbHRlcmluZ0ZvcihUZXN0RmlsdGVyVGVybS5IaWRkZW4sIHRydWUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFleHBhbmQgJiYgKHRoaXMudHJlZS5oYXNFbGVtZW50KG4pICYmIHRoaXMudHJlZS5pc0NvbGxhcHNlZChuKSkpIHtcblx0XHRcdFx0XHRmb2N1c1RhcmdldCA9IG47XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5maWx0ZXJTdGF0ZS5yZXZlYWwuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuaGFzUGVuZGluZ1JldmVhbCA9IGZhbHNlO1xuXHRcdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy50cmVlLmdldFJlbGF0aXZlVG9wKGZvY3VzVGFyZ2V0KSA9PT0gbnVsbCkge1xuXHRcdFx0XHR0aGlzLnRyZWUucmV2ZWFsKGZvY3VzVGFyZ2V0LCAwLjUpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJldmVhbFRpbWVvdXQudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbZm9jdXNUYXJnZXRdKTtcblx0XHRcdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbihbZm9jdXNUYXJnZXRdKTtcblx0XHRcdH0sIDEpO1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgaGVyZSwgd2UndmUgZXhwYW5kZWQgYWxsIHBhcmVudHMgd2UgY2FuLiBXYWl0aW5nIG9uIGRhdGEgdG8gY29tZVxuXHRcdC8vIGluIHRvIHBvc3NpYmx5IHNob3cgdGhlIHJldmVhbGVkIHRlc3QuXG5cdFx0dGhpcy5oYXNQZW5kaW5nUmV2ZWFsID0gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb2xsYXBzZSBhbGwgaXRlbXMgaW4gdGhlIHRyZWUuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgY29sbGFwc2VBbGwoKSB7XG5cdFx0dGhpcy50cmVlLmNvbGxhcHNlQWxsKCk7XG5cdH1cblxuXHQvKipcblx0ICogVHJpZXMgdG8gcGVlayB0aGUgZmlyc3QgdGVzdCBlcnJvciwgaWYgdGhlIGl0ZW0gaXMgaW4gYSBmYWlsZWQgc3RhdGUuXG5cdCAqL1xuXHRwcml2YXRlIHRyeVBlZWtFcnJvcihpdGVtOiBUZXN0SXRlbVRyZWVFbGVtZW50KSB7XG5cdFx0Y29uc3QgbG9va3VwID0gaXRlbS50ZXN0ICYmIHRoaXMudGVzdFJlc3VsdHMuZ2V0U3RhdGVCeUlkKGl0ZW0udGVzdC5pdGVtLmV4dElkKTtcblx0XHRyZXR1cm4gbG9va3VwICYmIGxvb2t1cFsxXS50YXNrcy5zb21lKHMgPT4gaXNGYWlsZWRTdGF0ZShzLnN0YXRlKSlcblx0XHRcdD8gdGhpcy5wZWVrT3BlbmVyLnRyeVBlZWtGaXJzdEVycm9yKGxvb2t1cFswXSwgbG9va3VwWzFdLCB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSlcblx0XHRcdDogZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIG9uQ29udGV4dE1lbnUoZXZ0OiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8VGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQgfCBudWxsPikge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBldnQuZWxlbWVudDtcblx0XHRpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgVGVzdEl0ZW1UcmVlRWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGFjdGlvbnMgfSA9IGdldEFjdGlvbmFibGVFbGVtZW50QWN0aW9ucyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLm1lbnVTZXJ2aWNlLCB0aGlzLnRlc3RTZXJ2aWNlLCB0aGlzLmNyU2VydmljZSwgdGhpcy50ZXN0UHJvZmlsZVNlcnZpY2UsIGVsZW1lbnQpO1xuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGV2dC5hbmNob3IsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLnNlY29uZGFyeSxcblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBlbGVtZW50LFxuXHRcdFx0YWN0aW9uUnVubmVyOiB0aGlzLmFjdGlvblJ1bm5lcixcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlRXhlY3V0ZUtleXByZXNzKGV2dDogSUtleWJvYXJkRXZlbnQpIHtcblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy50cmVlLmdldEZvY3VzKCk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0bGV0IHRhcmdldGVkOiAoVGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQgfCBudWxsKVtdO1xuXHRcdGlmIChmb2N1c2VkLmxlbmd0aCA9PT0gMSAmJiBzZWxlY3RlZC5pbmNsdWRlcyhmb2N1c2VkWzBdKSkge1xuXHRcdFx0ZXZ0LmJyb3dzZXJFdmVudD8ucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHRhcmdldGVkID0gc2VsZWN0ZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRhcmdldGVkID0gZm9jdXNlZDtcblx0XHR9XG5cblx0XHRjb25zdCB0b1J1biA9IHRhcmdldGVkXG5cdFx0XHQuZmlsdGVyKChlKTogZSBpcyBUZXN0SXRlbVRyZWVFbGVtZW50ID0+IGUgaW5zdGFuY2VvZiBUZXN0SXRlbVRyZWVFbGVtZW50KTtcblxuXHRcdGlmICh0b1J1bi5sZW5ndGgpIHtcblx0XHRcdHRoaXMudGVzdFNlcnZpY2UucnVuVGVzdHMoe1xuXHRcdFx0XHRncm91cDogVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuLFxuXHRcdFx0XHR0ZXN0czogdG9SdW4ubWFwKHQgPT4gdC50ZXN0KSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVldmFsdWF0ZVdlbGNvbWVTdGF0ZSgpIHtcblx0XHRjb25zdCBzaG91bGRTaG93V2VsY29tZSA9IHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbi5idXN5UHJvdmlkZXJzID09PSAwICYmIHRlc3RDb2xsZWN0aW9uSXNFbXB0eSh0aGlzLnRlc3RTZXJ2aWNlLmNvbGxlY3Rpb24pO1xuXHRcdGNvbnN0IHdlbGNvbWVFeHBlcmllbmNlID0gc2hvdWxkU2hvd1dlbGNvbWVcblx0XHRcdD8gKHRoaXMuZmlsdGVyU3RhdGUuaXNGaWx0ZXJpbmdGb3IoVGVzdEZpbHRlclRlcm0uQ3VycmVudERvYykgPyBXZWxjb21lRXhwZXJpZW5jZS5Gb3JEb2N1bWVudCA6IFdlbGNvbWVFeHBlcmllbmNlLkZvcldvcmtzcGFjZSlcblx0XHRcdDogV2VsY29tZUV4cGVyaWVuY2UuTm9uZTtcblxuXHRcdGlmICh3ZWxjb21lRXhwZXJpZW5jZSAhPT0gdGhpcy53ZWxjb21lRXhwZXJpZW5jZSkge1xuXHRcdFx0dGhpcy53ZWxjb21lRXhwZXJpZW5jZSA9IHdlbGNvbWVFeHBlcmllbmNlO1xuXHRcdFx0dGhpcy53ZWxjb21lVmlzaWJpbGl0eUVtaXR0ZXIuZmlyZSh3ZWxjb21lRXhwZXJpZW5jZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBlbnN1cmVQcm9qZWN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLnByb2plY3Rpb24udmFsdWUgPz8gdGhpcy51cGRhdGVQcmVmZXJyZWRQcm9qZWN0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVByZWZlcnJlZFByb2plY3Rpb24oKSB7XG5cdFx0dGhpcy5wcm9qZWN0aW9uLmNsZWFyKCk7XG5cblx0XHRjb25zdCBsYXN0U3RhdGUgPSB0aGlzLmxhc3RWaWV3U3RhdGUuZ2V0KHt9KTtcblx0XHRpZiAodGhpcy5fdmlld01vZGUuZ2V0KCkgPT09IFRlc3RFeHBsb3JlclZpZXdNb2RlLkxpc3QpIHtcblx0XHRcdHRoaXMucHJvamVjdGlvbi52YWx1ZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGlzdFByb2plY3Rpb24sIGxhc3RTdGF0ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucHJvamVjdGlvbi52YWx1ZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJlZVByb2plY3Rpb24sIGxhc3RTdGF0ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5hcHBseVByb2plY3Rpb25DaGFuZ2VzKCksIDIwMCkpO1xuXHRcdHRoaXMucHJvamVjdGlvbi52YWx1ZS5vblVwZGF0ZSgoKSA9PiB7XG5cdFx0XHRpZiAoIXNjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5hcHBseVByb2plY3Rpb25DaGFuZ2VzKCk7XG5cdFx0cmV0dXJuIHRoaXMucHJvamVjdGlvbi52YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlQcm9qZWN0aW9uQ2hhbmdlcygpIHtcblx0XHR0aGlzLnJlZXZhbHVhdGVXZWxjb21lU3RhdGUoKTtcblx0XHR0aGlzLnByb2plY3Rpb24udmFsdWU/LmFwcGx5VG8odGhpcy50cmVlKTtcblxuXHRcdHRoaXMudHJlZS5yZWZpbHRlcigpO1xuXG5cdFx0aWYgKHRoaXMuaGFzUGVuZGluZ1JldmVhbCkge1xuXHRcdFx0dGhpcy5yZXZlYWxCeUlkKHRoaXMuZmlsdGVyU3RhdGUucmV2ZWFsLmdldCgpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgc2VsZWN0ZWQgdGVzdHMgZnJvbSB0aGUgdHJlZS5cblx0ICovXG5cdHB1YmxpYyBnZXRTZWxlY3RlZFRlc3RzKCkge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cdH1cbn1cblxuY29uc3QgZW51bSBGaWx0ZXJSZXN1bHQge1xuXHRFeGNsdWRlLFxuXHRJbmhlcml0LFxuXHRJbmNsdWRlLFxufVxuXG5jb25zdCBoYXNOb2RlSW5PclBhcmVudE9mVXJpID0gKGNvbGxlY3Rpb246IElNYWluVGhyZWFkVGVzdENvbGxlY3Rpb24sIGlkZW50OiBJVXJpSWRlbnRpdHlTZXJ2aWNlLCB0ZXN0VXJpOiBVUkksIGZyb21Ob2RlPzogc3RyaW5nKSA9PiB7XG5cdGNvbnN0IHF1ZXVlOiBJdGVyYWJsZTxzdHJpbmc+W10gPSBbZnJvbU5vZGUgPyBbZnJvbU5vZGVdIDogY29sbGVjdGlvbi5yb290SWRzXTtcblx0d2hpbGUgKHF1ZXVlLmxlbmd0aCkge1xuXHRcdGZvciAoY29uc3QgaWQgb2YgcXVldWUucG9wKCkhKSB7XG5cdFx0XHRjb25zdCBub2RlID0gY29sbGVjdGlvbi5nZXROb2RlQnlJZChpZCk7XG5cdFx0XHRpZiAoIW5vZGUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghbm9kZS5pdGVtLnVyaSB8fCAhaWRlbnQuZXh0VXJpLmlzRXF1YWxPclBhcmVudCh0ZXN0VXJpLCBub2RlLml0ZW0udXJpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT25seSBzaG93IG5vZGVzIHRoYXQgY2FuIGJlIGV4cGFuZGVkIChhbmQgbWlnaHQgaGF2ZSBhIGNoaWxkIHdpdGhcblx0XHRcdC8vIGEgcmFuZ2UpIG9yIG9uZXMgdGhhdCBoYXZlIGEgcGh5c2ljYWwgbG9jYXRpb24uXG5cdFx0XHRpZiAobm9kZS5pdGVtLnJhbmdlIHx8IG5vZGUuZXhwYW5kID09PSBUZXN0SXRlbUV4cGFuZFN0YXRlLkV4cGFuZGFibGUpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHF1ZXVlLnB1c2gobm9kZS5jaGlsZHJlbik7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufTtcblxuY2xhc3MgVGVzdHNGaWx0ZXIgaW1wbGVtZW50cyBJVHJlZUZpbHRlcjxUZXN0RXhwbG9yZXJUcmVlRWxlbWVudD4ge1xuXHRwcml2YXRlIGRvY3VtZW50VXJpczogVVJJW10gPSBbXTtcblxuXHRwdWJsaWMgbGFzdEluY2x1ZGVkVGVzdHM/OiBTZXQ8VGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29sbGVjdGlvbjogSU1haW5UaHJlYWRUZXN0Q29sbGVjdGlvbixcblx0XHRASVRlc3RFeHBsb3JlckZpbHRlclN0YXRlIHByaXZhdGUgcmVhZG9ubHkgc3RhdGU6IElUZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZSxcblx0XHRASVRlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVzdFNlcnZpY2U6IElUZXN0U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7IH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBmaWx0ZXIoZWxlbWVudDogVGVzdEl0ZW1UcmVlRWxlbWVudCk6IFRyZWVGaWx0ZXJSZXN1bHQ8dm9pZD4ge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgVGVzdFRyZWVFcnJvck1lc3NhZ2UpIHtcblx0XHRcdHJldHVybiBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlO1xuXHRcdH1cblxuXHRcdGlmIChcblx0XHRcdGVsZW1lbnQudGVzdFxuXHRcdFx0JiYgIXRoaXMuc3RhdGUuaXNGaWx0ZXJpbmdGb3IoVGVzdEZpbHRlclRlcm0uSGlkZGVuKVxuXHRcdFx0JiYgdGhpcy50ZXN0U2VydmljZS5leGNsdWRlZC5jb250YWlucyhlbGVtZW50LnRlc3QpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gVHJlZVZpc2liaWxpdHkuSGlkZGVuO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoTWF0aC5taW4odGhpcy50ZXN0RmlsdGVyVGV4dChlbGVtZW50KSwgdGhpcy50ZXN0TG9jYXRpb24oZWxlbWVudCksIHRoaXMudGVzdFN0YXRlKGVsZW1lbnQpLCB0aGlzLnRlc3RUYWdzKGVsZW1lbnQpKSkge1xuXHRcdFx0Y2FzZSBGaWx0ZXJSZXN1bHQuRXhjbHVkZTpcblx0XHRcdFx0cmV0dXJuIFRyZWVWaXNpYmlsaXR5LkhpZGRlbjtcblx0XHRcdGNhc2UgRmlsdGVyUmVzdWx0LkluY2x1ZGU6XG5cdFx0XHRcdHRoaXMubGFzdEluY2x1ZGVkVGVzdHM/LmFkZChlbGVtZW50KTtcblx0XHRcdFx0cmV0dXJuIFRyZWVWaXNpYmlsaXR5LlZpc2libGU7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gVHJlZVZpc2liaWxpdHkuUmVjdXJzZTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZmlsdGVyVG9Eb2N1bWVudFVyaSh1cmlzOiByZWFkb25seSBVUklbXSkge1xuXHRcdHRoaXMuZG9jdW1lbnRVcmlzID0gWy4uLnVyaXNdO1xuXHR9XG5cblx0cHJpdmF0ZSB0ZXN0VGFncyhlbGVtZW50OiBUZXN0SXRlbVRyZWVFbGVtZW50KTogRmlsdGVyUmVzdWx0IHtcblx0XHRpZiAoIXRoaXMuc3RhdGUuaW5jbHVkZVRhZ3Muc2l6ZSAmJiAhdGhpcy5zdGF0ZS5leGNsdWRlVGFncy5zaXplKSB7XG5cdFx0XHRyZXR1cm4gRmlsdGVyUmVzdWx0LkluY2x1ZGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICh0aGlzLnN0YXRlLmluY2x1ZGVUYWdzLnNpemUgP1xuXHRcdFx0ZWxlbWVudC50ZXN0Lml0ZW0udGFncy5zb21lKHQgPT4gdGhpcy5zdGF0ZS5pbmNsdWRlVGFncy5oYXModCkpIDpcblx0XHRcdHRydWUpICYmIGVsZW1lbnQudGVzdC5pdGVtLnRhZ3MuZXZlcnkodCA9PiAhdGhpcy5zdGF0ZS5leGNsdWRlVGFncy5oYXModCkpXG5cdFx0XHQ/IEZpbHRlclJlc3VsdC5JbmNsdWRlXG5cdFx0XHQ6IEZpbHRlclJlc3VsdC5Jbmhlcml0O1xuXHR9XG5cblx0cHJpdmF0ZSB0ZXN0U3RhdGUoZWxlbWVudDogVGVzdEl0ZW1UcmVlRWxlbWVudCk6IEZpbHRlclJlc3VsdCB7XG5cdFx0aWYgKHRoaXMuc3RhdGUuaXNGaWx0ZXJpbmdGb3IoVGVzdEZpbHRlclRlcm0uRmFpbGVkKSkge1xuXHRcdFx0cmV0dXJuIGlzRmFpbGVkU3RhdGUoZWxlbWVudC5zdGF0ZSkgPyBGaWx0ZXJSZXN1bHQuSW5jbHVkZSA6IEZpbHRlclJlc3VsdC5Jbmhlcml0O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnN0YXRlLmlzRmlsdGVyaW5nRm9yKFRlc3RGaWx0ZXJUZXJtLkV4ZWN1dGVkKSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuc3RhdGUgIT09IFRlc3RSZXN1bHRTdGF0ZS5VbnNldCA/IEZpbHRlclJlc3VsdC5JbmNsdWRlIDogRmlsdGVyUmVzdWx0LkluaGVyaXQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEZpbHRlclJlc3VsdC5JbmNsdWRlO1xuXHR9XG5cblx0cHJpdmF0ZSB0ZXN0TG9jYXRpb24oZWxlbWVudDogVGVzdEl0ZW1UcmVlRWxlbWVudCk6IEZpbHRlclJlc3VsdCB7XG5cdFx0aWYgKHRoaXMuZG9jdW1lbnRVcmlzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIEZpbHRlclJlc3VsdC5JbmNsdWRlO1xuXHRcdH1cblxuXHRcdGlmICgoIXRoaXMuc3RhdGUuaXNGaWx0ZXJpbmdGb3IoVGVzdEZpbHRlclRlcm0uQ3VycmVudERvYykgJiYgIXRoaXMuc3RhdGUuaXNGaWx0ZXJpbmdGb3IoVGVzdEZpbHRlclRlcm0uT3BlbmVkRmlsZXMpKSB8fCAhKGVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0SXRlbVRyZWVFbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIEZpbHRlclJlc3VsdC5JbmNsdWRlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmRvY3VtZW50VXJpcy5zb21lKHVyaSA9PiBoYXNOb2RlSW5PclBhcmVudE9mVXJpKHRoaXMuY29sbGVjdGlvbiwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UsIHVyaSwgZWxlbWVudC50ZXN0Lml0ZW0uZXh0SWQpKSkge1xuXHRcdFx0cmV0dXJuIEZpbHRlclJlc3VsdC5JbmNsdWRlO1xuXHRcdH1cblxuXHRcdHJldHVybiBGaWx0ZXJSZXN1bHQuSW5oZXJpdDtcblx0fVxuXG5cdHByaXZhdGUgdGVzdEZpbHRlclRleHQoZWxlbWVudDogVGVzdEl0ZW1UcmVlRWxlbWVudCkge1xuXHRcdGlmICh0aGlzLnN0YXRlLmdsb2JMaXN0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIEZpbHRlclJlc3VsdC5JbmNsdWRlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZ1enp5ID0gdGhpcy5zdGF0ZS5mdXp6eS52YWx1ZTtcblx0XHRmb3IgKGxldCBlOiBUZXN0SXRlbVRyZWVFbGVtZW50IHwgbnVsbCA9IGVsZW1lbnQ7IGU7IGUgPSBlLnBhcmVudCkge1xuXHRcdFx0Ly8gc3RhcnQgYXMgaW5jbHVkZWQgaWYgdGhlIGZpcnN0IGdsb2IgaXMgYSBuZWdhdGlvblxuXHRcdFx0bGV0IGluY2x1ZGVkID0gdGhpcy5zdGF0ZS5nbG9iTGlzdFswXS5pbmNsdWRlID09PSBmYWxzZSA/IEZpbHRlclJlc3VsdC5JbmNsdWRlIDogRmlsdGVyUmVzdWx0LkluaGVyaXQ7XG5cdFx0XHRjb25zdCBkYXRhID0gZS50ZXN0Lml0ZW0ubGFiZWwudG9Mb3dlckNhc2UoKTtcblxuXHRcdFx0Zm9yIChjb25zdCB7IGluY2x1ZGUsIHRleHQgfSBvZiB0aGlzLnN0YXRlLmdsb2JMaXN0KSB7XG5cdFx0XHRcdGlmIChmdXp6eSA/IGZ1enp5Q29udGFpbnMoZGF0YSwgdGV4dCkgOiBkYXRhLmluY2x1ZGVzKHRleHQpKSB7XG5cdFx0XHRcdFx0aW5jbHVkZWQgPSBpbmNsdWRlID8gRmlsdGVyUmVzdWx0LkluY2x1ZGUgOiBGaWx0ZXJSZXN1bHQuRXhjbHVkZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaW5jbHVkZWQgIT09IEZpbHRlclJlc3VsdC5Jbmhlcml0KSB7XG5cdFx0XHRcdHJldHVybiBpbmNsdWRlZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gRmlsdGVyUmVzdWx0LkluaGVyaXQ7XG5cdH1cbn1cblxuY2xhc3MgVHJlZVNvcnRlciBpbXBsZW1lbnRzIElUcmVlU29ydGVyPFRlc3RFeHBsb3JlclRyZWVFbGVtZW50PiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlld01vZGVsOiBUZXN0aW5nRXhwbG9yZXJWaWV3TW9kZWwsXG5cdCkgeyB9XG5cblx0cHVibGljIGNvbXBhcmUoYTogVGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQsIGI6IFRlc3RFeHBsb3JlclRyZWVFbGVtZW50KTogbnVtYmVyIHtcblx0XHRpZiAoYSBpbnN0YW5jZW9mIFRlc3RUcmVlRXJyb3JNZXNzYWdlIHx8IGIgaW5zdGFuY2VvZiBUZXN0VHJlZUVycm9yTWVzc2FnZSkge1xuXHRcdFx0cmV0dXJuIChhIGluc3RhbmNlb2YgVGVzdFRyZWVFcnJvck1lc3NhZ2UgPyAtMSA6IDApICsgKGIgaW5zdGFuY2VvZiBUZXN0VHJlZUVycm9yTWVzc2FnZSA/IDEgOiAwKTtcblx0XHR9XG5cblx0XHRjb25zdCBkdXJhdGlvbkRlbHRhID0gKGIuZHVyYXRpb24gfHwgMCkgLSAoYS5kdXJhdGlvbiB8fCAwKTtcblx0XHRpZiAodGhpcy52aWV3TW9kZWwudmlld1NvcnRpbmcgPT09IFRlc3RFeHBsb3JlclZpZXdTb3J0aW5nLkJ5RHVyYXRpb24gJiYgZHVyYXRpb25EZWx0YSAhPT0gMCkge1xuXHRcdFx0cmV0dXJuIGR1cmF0aW9uRGVsdGE7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdGVEZWx0YSA9IGNtcFByaW9yaXR5KGEuc3RhdGUsIGIuc3RhdGUpO1xuXHRcdGlmICh0aGlzLnZpZXdNb2RlbC52aWV3U29ydGluZyA9PT0gVGVzdEV4cGxvcmVyVmlld1NvcnRpbmcuQnlTdGF0dXMgJiYgc3RhdGVEZWx0YSAhPT0gMCkge1xuXHRcdFx0cmV0dXJuIHN0YXRlRGVsdGE7XG5cdFx0fVxuXG5cdFx0bGV0IGluU2FtZUxvY2F0aW9uID0gZmFsc2U7XG5cdFx0aWYgKGEgaW5zdGFuY2VvZiBUZXN0SXRlbVRyZWVFbGVtZW50ICYmIGIgaW5zdGFuY2VvZiBUZXN0SXRlbVRyZWVFbGVtZW50ICYmIGEudGVzdC5pdGVtLnVyaSAmJiBiLnRlc3QuaXRlbS51cmkgJiYgYS50ZXN0Lml0ZW0udXJpLnRvU3RyaW5nKCkgPT09IGIudGVzdC5pdGVtLnVyaS50b1N0cmluZygpICYmIGEudGVzdC5pdGVtLnJhbmdlICYmIGIudGVzdC5pdGVtLnJhbmdlKSB7XG5cdFx0XHRpblNhbWVMb2NhdGlvbiA9IHRydWU7XG5cblx0XHRcdGNvbnN0IGRlbHRhID0gYS50ZXN0Lml0ZW0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gYi50ZXN0Lml0ZW0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0aWYgKGRlbHRhICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybiBkZWx0YTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzYSA9IGEudGVzdC5pdGVtLnNvcnRUZXh0O1xuXHRcdGNvbnN0IHNiID0gYi50ZXN0Lml0ZW0uc29ydFRleHQ7XG5cdFx0Ly8gSWYgdGVzdHMgYXJlIGluIHRoZSBzYW1lIGxvY2F0aW9uIGFuZCB0aGVyZSdzIG5vIHByZWZlcnJlZCBzb3J0VGV4dCxcblx0XHQvLyBrZWVwIHRoZSBleHRlbnNpb24ncyBpbnNlcnRpb24gb3JkZXIgKCMxNjM0NDkpLlxuXHRcdHJldHVybiBpblNhbWVMb2NhdGlvbiAmJiAhc2EgJiYgIXNiXG5cdFx0XHQ/IDBcblx0XHRcdDogY29tcGFyZUZpbGVOYW1lcyhzYSB8fCBhLnRlc3QuaXRlbS5sYWJlbCwgc2IgfHwgYi50ZXN0Lml0ZW0ubGFiZWwpO1xuXHR9XG59XG5cbmNsYXNzIE5vVGVzdHNGb3JEb2N1bWVudFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IGVsOiBIVE1MRWxlbWVudDtcblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASVRlc3RFeHBsb3JlckZpbHRlclN0YXRlIGZpbHRlclN0YXRlOiBJVGVzdEV4cGxvcmVyRmlsdGVyU3RhdGVcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBlbCA9IHRoaXMuZWwgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy50ZXN0aW5nLW5vLXRlc3QtcGxhY2Vob2xkZXInKSk7XG5cdFx0Y29uc3QgZW1wdHlQYXJhZ3JhcGggPSBkb20uYXBwZW5kKGVsLCBkb20uJCgncCcpKTtcblx0XHRlbXB0eVBhcmFncmFwaC5pbm5lclRleHQgPSBsb2NhbGl6ZSgndGVzdGluZ05vVGVzdCcsICdObyB0ZXN0cyB3ZXJlIGZvdW5kIGluIHRoaXMgZmlsZS4nKTtcblx0XHRjb25zdCBidXR0b25MYWJlbCA9IGxvY2FsaXplKCd0ZXN0aW5nRmluZEV4dGVuc2lvbicsICdTaG93IFdvcmtzcGFjZSBUZXN0cycpO1xuXHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oZWwsIHsgdGl0bGU6IGJ1dHRvbkxhYmVsLCAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzIH0pKTtcblx0XHRidXR0b24ubGFiZWwgPSBidXR0b25MYWJlbDtcblx0XHR0aGlzLl9yZWdpc3RlcihidXR0b24ub25EaWRDbGljaygoKSA9PiBmaWx0ZXJTdGF0ZS50b2dnbGVGaWx0ZXJpbmdGb3IoVGVzdEZpbHRlclRlcm0uQ3VycmVudERvYywgZmFsc2UpKSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0VmlzaWJsZShpc1Zpc2libGU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLmVsLmNsYXNzTGlzdC50b2dnbGUoJ3Zpc2libGUnLCBpc1Zpc2libGUpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RFeHBsb3JlckFjdGlvblJ1bm5lciBleHRlbmRzIEFjdGlvblJ1bm5lciB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgZ2V0U2VsZWN0ZWRUZXN0czogKCkgPT4gUmVhZG9ubHlBcnJheTxUZXN0RXhwbG9yZXJUcmVlRWxlbWVudD4pIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIHJ1bkFjdGlvbihhY3Rpb246IElBY3Rpb24sIGNvbnRleHQ6IFRlc3RFeHBsb3JlclRyZWVFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pKSB7XG5cdFx0XHRyZXR1cm4gc3VwZXIucnVuQWN0aW9uKGFjdGlvbiwgY29udGV4dCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3RlZFRlc3RzKCk7XG5cdFx0Y29uc3QgY29udGV4dElzU2VsZWN0ZWQgPSBzZWxlY3Rpb24uc29tZShzID0+IHMgPT09IGNvbnRleHQpO1xuXHRcdGNvbnN0IGFjdHVhbENvbnRleHQgPSBjb250ZXh0SXNTZWxlY3RlZCA/IHNlbGVjdGlvbiA6IFtjb250ZXh0XTtcblx0XHRjb25zdCBhY3Rpb25hYmxlID0gYWN0dWFsQ29udGV4dC5maWx0ZXIoKHQpOiB0IGlzIFRlc3RJdGVtVHJlZUVsZW1lbnQgPT4gdCBpbnN0YW5jZW9mIFRlc3RJdGVtVHJlZUVsZW1lbnQpO1xuXHRcdGF3YWl0IGFjdGlvbi5ydW4oLi4uYWN0aW9uYWJsZSk7XG5cdH1cbn1cblxuY29uc3QgZ2V0TGFiZWxGb3JUZXN0VHJlZUVsZW1lbnQgPSAoZWxlbWVudDogVGVzdEl0ZW1UcmVlRWxlbWVudCkgPT4ge1xuXHRsZXQgbGFiZWwgPSBsYWJlbEZvclRlc3RJblN0YXRlKGVsZW1lbnQuZGVzY3JpcHRpb24gfHwgZWxlbWVudC50ZXN0Lml0ZW0ubGFiZWwsIGVsZW1lbnQuc3RhdGUpO1xuXG5cdGlmIChlbGVtZW50IGluc3RhbmNlb2YgVGVzdEl0ZW1UcmVlRWxlbWVudCkge1xuXHRcdGlmIChlbGVtZW50LmR1cmF0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGxhYmVsID0gbG9jYWxpemUoe1xuXHRcdFx0XHRrZXk6ICd0ZXN0aW5nLnRyZWVFbGVtZW50TGFiZWxEdXJhdGlvbicsXG5cdFx0XHRcdGNvbW1lbnQ6IFsnezB9IGlzIHRoZSBvcmlnaW5hbCBsYWJlbCBpbiB0ZXN0aW5nLnRyZWVFbGVtZW50TGFiZWwsIHsxfSBpcyBhIGR1cmF0aW9uJ10sXG5cdFx0XHR9LCAnezB9LCBpbiB7MX0nLCBsYWJlbCwgZm9ybWF0RHVyYXRpb24oZWxlbWVudC5kdXJhdGlvbikpO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50LnJldGlyZWQpIHtcblx0XHRcdGxhYmVsID0gbG9jYWxpemUoe1xuXHRcdFx0XHRrZXk6ICd0ZXN0aW5nLnRyZWVFbGVtZW50TGFiZWxPdXRkYXRlZCcsXG5cdFx0XHRcdGNvbW1lbnQ6IFsnezB9IGlzIHRoZSBvcmlnaW5hbCBsYWJlbCBpbiB0ZXN0aW5nLnRyZWVFbGVtZW50TGFiZWwnXSxcblx0XHRcdH0sICd7MH0sIG91dGRhdGVkIHJlc3VsdCcsIGxhYmVsKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gbGFiZWw7XG59O1xuXG5jbGFzcyBMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8VGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQ+IHtcblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCd0ZXN0RXhwbG9yZXInLCBcIlRlc3QgRXhwbG9yZXJcIik7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogVGVzdEV4cGxvcmVyVHJlZUVsZW1lbnQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBlbGVtZW50IGluc3RhbmNlb2YgVGVzdFRyZWVFcnJvck1lc3NhZ2Vcblx0XHRcdD8gZWxlbWVudC5kZXNjcmlwdGlvblxuXHRcdFx0OiBnZXRMYWJlbEZvclRlc3RUcmVlRWxlbWVudChlbGVtZW50KTtcblx0fVxufVxuXG5jbGFzcyBUcmVlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciBpbXBsZW1lbnRzIElLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyPFRlc3RFeHBsb3JlclRyZWVFbGVtZW50PiB7XG5cdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKGVsZW1lbnQ6IFRlc3RFeHBsb3JlclRyZWVFbGVtZW50KSB7XG5cdFx0cmV0dXJuIGVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0VHJlZUVycm9yTWVzc2FnZSA/IGVsZW1lbnQubWVzc2FnZSA6IGVsZW1lbnQudGVzdC5pdGVtLmxhYmVsO1xuXHR9XG59XG5cbmNsYXNzIExpc3REZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPFRlc3RFeHBsb3JlclRyZWVFbGVtZW50PiB7XG5cdGdldEhlaWdodChlbGVtZW50OiBUZXN0RXhwbG9yZXJUcmVlRWxlbWVudCkge1xuXHRcdHJldHVybiBlbGVtZW50IGluc3RhbmNlb2YgVGVzdFRyZWVFcnJvck1lc3NhZ2UgPyAxNyArIDEwIDogMjI7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IFRlc3RFeHBsb3JlclRyZWVFbGVtZW50KSB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBUZXN0VHJlZUVycm9yTWVzc2FnZSkge1xuXHRcdFx0cmV0dXJuIEVycm9yUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFRlc3RJdGVtUmVuZGVyZXIuSUQ7XG5cdH1cbn1cblxuY2xhc3MgSWRlbnRpdHlQcm92aWRlciBpbXBsZW1lbnRzIElJZGVudGl0eVByb3ZpZGVyPFRlc3RFeHBsb3JlclRyZWVFbGVtZW50PiB7XG5cdHB1YmxpYyBnZXRJZChlbGVtZW50OiBUZXN0RXhwbG9yZXJUcmVlRWxlbWVudCkge1xuXHRcdHJldHVybiBlbGVtZW50LnRyZWVJZDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUVycm9yVGVtcGxhdGVEYXRhIHtcblx0bGFiZWw6IEhUTUxFbGVtZW50O1xuXHRkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmNsYXNzIEVycm9yUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFRlc3RUcmVlRXJyb3JNZXNzYWdlLCBGdXp6eVNjb3JlLCBJRXJyb3JUZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2Vycm9yJztcblxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEVycm9yUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUVycm9yVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBsYWJlbCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLmVycm9yJykpO1xuXHRcdHJldHVybiB7IGxhYmVsLCBkaXNwb3NhYmxlOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCkgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoeyBlbGVtZW50IH06IElUcmVlTm9kZTxUZXN0VHJlZUVycm9yTWVzc2FnZSwgRnV6enlTY29yZT4sIF86IG51bWJlciwgZGF0YTogSUVycm9yVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0ZG9tLmNsZWFyTm9kZShkYXRhLmxhYmVsKTtcblxuXHRcdGlmICh0eXBlb2YgZWxlbWVudC5tZXNzYWdlID09PSAnc3RyaW5nJykge1xuXHRcdFx0ZGF0YS5sYWJlbC5pbm5lclRleHQgPSBlbGVtZW50Lm1lc3NhZ2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKGVsZW1lbnQubWVzc2FnZSwgdW5kZWZpbmVkLCBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJykpO1xuXHRcdFx0ZGF0YS5sYWJlbC5hcHBlbmRDaGlsZChyZXN1bHQuZWxlbWVudCk7XG5cdFx0fVxuXHRcdGRhdGEuZGlzcG9zYWJsZS5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGRhdGEubGFiZWwsIGVsZW1lbnQuZGVzY3JpcHRpb24pKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZShkYXRhOiBJRXJyb3JUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRkYXRhLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJVGVzdEVsZW1lbnRUZW1wbGF0ZURhdGEge1xuXHRjdXJyZW50PzogVGVzdEl0ZW1UcmVlRWxlbWVudDtcblx0bGFiZWw6IEhUTUxFbGVtZW50O1xuXHRpY29uOiBIVE1MRWxlbWVudDtcblx0d3JhcHBlcjogSFRNTEVsZW1lbnQ7XG5cdGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRlbGVtZW50RGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlO1xuXHR0ZW1wbGF0ZURpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgVGVzdEl0ZW1SZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGVcblx0aW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFRlc3RJdGVtVHJlZUVsZW1lbnQsIEZ1enp5U2NvcmUsIElUZXN0RWxlbWVudFRlbXBsYXRlRGF0YT4ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ3Rlc3RJdGVtJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvblJ1bm5lcjogVGVzdEV4cGxvcmVyQWN0aW9uUnVubmVyLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJVGVzdFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHRlc3RTZXJ2aWNlOiBJVGVzdFNlcnZpY2UsXG5cdFx0QElUZXN0UHJvZmlsZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHByb2ZpbGVzOiBJVGVzdFByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY3JTZXJ2aWNlOiBJVGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgdGVtcGxhdGVJZCA9IFRlc3RJdGVtUmVuZGVyZXIuSUQ7XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgcmVuZGVyVGVtcGxhdGUod3JhcHBlcjogSFRNTEVsZW1lbnQpOiBJVGVzdEVsZW1lbnRUZW1wbGF0ZURhdGEge1xuXHRcdHdyYXBwZXIuY2xhc3NMaXN0LmFkZCgndGVzdGluZy1zdGR0cmVlLWNvbnRhaW5lcicpO1xuXG5cdFx0Y29uc3QgaWNvbiA9IGRvbS5hcHBlbmQod3JhcHBlciwgZG9tLiQoJy5jb21wdXRlZC1zdGF0ZScpKTtcblx0XHRjb25zdCBsYWJlbCA9IGRvbS5hcHBlbmQod3JhcHBlciwgZG9tLiQoJy5sYWJlbCcpKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0ZG9tLmFwcGVuZCh3cmFwcGVyLCBkb20uJChUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29ucy50ZXN0aW5nSGlkZGVuSWNvbikpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBkaXNwb3NhYmxlLmFkZChuZXcgQWN0aW9uQmFyKHdyYXBwZXIsIHtcblx0XHRcdGFjdGlvblJ1bm5lcjogdGhpcy5hY3Rpb25SdW5uZXIsXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PlxuXHRcdFx0XHRhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvblxuXHRcdFx0XHRcdD8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7IGhvdmVyRGVsZWdhdGU6IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSB9KVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkXG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZS5hZGQodGhpcy5wcm9maWxlcy5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGVtcGxhdGVEYXRhLmN1cnJlbnQpIHtcblx0XHRcdFx0dGhpcy5maWxsQWN0aW9uQmFyKHRlbXBsYXRlRGF0YS5jdXJyZW50LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGUuYWRkKHRoaXMuY3JTZXJ2aWNlLm9uRGlkQ2hhbmdlKGNoYW5nZWQgPT4ge1xuXHRcdFx0Y29uc3QgaWQgPSB0ZW1wbGF0ZURhdGEuY3VycmVudD8udGVzdC5pdGVtLmV4dElkO1xuXHRcdFx0aWYgKGlkICYmICghY2hhbmdlZCB8fCBjaGFuZ2VkID09PSBpZCB8fCBUZXN0SWQuaXNDaGlsZChpZCwgY2hhbmdlZCkpKSB7XG5cdFx0XHRcdHRoaXMuZmlsbEFjdGlvbkJhcih0ZW1wbGF0ZURhdGEuY3VycmVudCEsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGVEYXRhOiBJVGVzdEVsZW1lbnRUZW1wbGF0ZURhdGEgPSB7IHdyYXBwZXIsIGxhYmVsLCBhY3Rpb25CYXIsIGljb24sIGVsZW1lbnREaXNwb3NhYmxlOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCksIHRlbXBsYXRlRGlzcG9zYWJsZTogZGlzcG9zYWJsZSB9O1xuXHRcdHJldHVybiB0ZW1wbGF0ZURhdGE7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElUZXN0RWxlbWVudFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGUuY2xlYXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0ZGlzcG9zZUVsZW1lbnQoX2VsZW1lbnQ6IElUcmVlTm9kZTxUZXN0SXRlbVRyZWVFbGVtZW50LCBGdXp6eVNjb3JlPiwgXzogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElUZXN0RWxlbWVudFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZS5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWxsQWN0aW9uQmFyKGVsZW1lbnQ6IFRlc3RJdGVtVHJlZUVsZW1lbnQsIGRhdGE6IElUZXN0RWxlbWVudFRlbXBsYXRlRGF0YSkge1xuXHRcdGNvbnN0IHsgYWN0aW9ucywgY29udGV4dE92ZXJsYXkgfSA9IGdldEFjdGlvbmFibGVFbGVtZW50QWN0aW9ucyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLm1lbnVTZXJ2aWNlLCB0aGlzLnRlc3RTZXJ2aWNlLCB0aGlzLmNyU2VydmljZSwgdGhpcy5wcm9maWxlcywgZWxlbWVudCk7XG5cdFx0Y29uc3QgY3JTZWxmID0gISFjb250ZXh0T3ZlcmxheS5nZXRDb250ZXh0S2V5VmFsdWUoVGVzdGluZ0NvbnRleHRLZXlzLmlzQ29udGludW91c01vZGVPbi5rZXkpO1xuXHRcdGNvbnN0IGNyQ2hpbGQgPSAhY3JTZWxmICYmIHRoaXMuY3JTZXJ2aWNlLmlzRW5hYmxlZEZvckFDaGlsZE9mKGVsZW1lbnQudGVzdC5pdGVtLmV4dElkKTtcblx0XHRkYXRhLmFjdGlvbkJhci5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3Rlc3RpbmctaXMtY29udGludW91cy1ydW4nLCBjclNlbGYgfHwgY3JDaGlsZCk7XG5cdFx0ZGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHRkYXRhLmFjdGlvbkJhci5jb250ZXh0ID0gZWxlbWVudDtcblx0XHRkYXRhLmFjdGlvbkJhci5wdXNoKGFjdGlvbnMucHJpbWFyeSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyByZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxUZXN0SXRlbVRyZWVFbGVtZW50LCBGdXp6eVNjb3JlPiwgX2RlcHRoOiBudW1iZXIsIGRhdGE6IElUZXN0RWxlbWVudFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRkYXRhLmN1cnJlbnQgPSBub2RlLmVsZW1lbnQ7XG5cblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlLmFkZChub2RlLmVsZW1lbnQub25DaGFuZ2UoKCkgPT4gdGhpcy5fcmVuZGVyRWxlbWVudChub2RlLCBkYXRhKSkpO1xuXHRcdHRoaXMuX3JlbmRlckVsZW1lbnQobm9kZSwgZGF0YSk7XG5cdH1cblxuXHRwdWJsaWMgX3JlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPFRlc3RJdGVtVHJlZUVsZW1lbnQsIEZ1enp5U2NvcmU+LCBkYXRhOiBJVGVzdEVsZW1lbnRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0aGlzLmZpbGxBY3Rpb25CYXIobm9kZS5lbGVtZW50LCBkYXRhKTtcblxuXHRcdGNvbnN0IHRlc3RIaWRkZW4gPSB0aGlzLnRlc3RTZXJ2aWNlLmV4Y2x1ZGVkLmNvbnRhaW5zKG5vZGUuZWxlbWVudC50ZXN0KTtcblx0XHRkYXRhLndyYXBwZXIuY2xhc3NMaXN0LnRvZ2dsZSgndGVzdC1pcy1oaWRkZW4nLCB0ZXN0SGlkZGVuKTtcblxuXHRcdGNvbnN0IGljb24gPSBpY29ucy50ZXN0aW5nU3RhdGVzVG9JY29ucy5nZXQoXG5cdFx0XHRub2RlLmVsZW1lbnQudGVzdC5leHBhbmQgPT09IFRlc3RJdGVtRXhwYW5kU3RhdGUuQnVzeUV4cGFuZGluZyB8fCBub2RlLmVsZW1lbnQudGVzdC5pdGVtLmJ1c3lcblx0XHRcdFx0PyBUZXN0UmVzdWx0U3RhdGUuUnVubmluZ1xuXHRcdFx0XHQ6IG5vZGUuZWxlbWVudC5zdGF0ZSk7XG5cblx0XHRkYXRhLmljb24uY2xhc3NOYW1lID0gJ2NvbXB1dGVkLXN0YXRlICcgKyAoaWNvbiA/IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29uKSA6ICcnKTtcblx0XHRpZiAobm9kZS5lbGVtZW50LnJldGlyZWQpIHtcblx0XHRcdGRhdGEuaWNvbi5jbGFzc05hbWUgKz0gJyByZXRpcmVkJztcblx0XHR9XG5cblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZGF0YS5sYWJlbCwgZ2V0TGFiZWxGb3JUZXN0VHJlZUVsZW1lbnQobm9kZS5lbGVtZW50KSkpO1xuXHRcdGlmIChub2RlLmVsZW1lbnQudGVzdC5pdGVtLmxhYmVsLnRyaW0oKSkge1xuXHRcdFx0ZG9tLnJlc2V0KGRhdGEubGFiZWwsIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKG5vZGUuZWxlbWVudC50ZXN0Lml0ZW0ubGFiZWwpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS5sYWJlbC50ZXh0Q29udGVudCA9IFN0cmluZy5mcm9tQ2hhckNvZGUoMHhBMCk7IC8vICZuYnNwO1xuXHRcdH1cblxuXHRcdGxldCBkZXNjcmlwdGlvbiA9IG5vZGUuZWxlbWVudC5kZXNjcmlwdGlvbjtcblx0XHRpZiAobm9kZS5lbGVtZW50LmR1cmF0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb25cblx0XHRcdFx0PyBgJHtkZXNjcmlwdGlvbn06ICR7Zm9ybWF0RHVyYXRpb24obm9kZS5lbGVtZW50LmR1cmF0aW9uKX1gXG5cdFx0XHRcdDogZm9ybWF0RHVyYXRpb24obm9kZS5lbGVtZW50LmR1cmF0aW9uKTtcblx0XHR9XG5cblx0XHRpZiAoZGVzY3JpcHRpb24pIHtcblx0XHRcdGRvbS5hcHBlbmQoZGF0YS5sYWJlbCwgZG9tLiQoJ3NwYW4udGVzdC1sYWJlbC1kZXNjcmlwdGlvbicsIHt9LCBkZXNjcmlwdGlvbikpO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCBmb3JtYXREdXJhdGlvbiA9IChtczogbnVtYmVyKSA9PiB7XG5cdGlmIChtcyA8IDEwKSB7XG5cdFx0cmV0dXJuIGAke21zLnRvRml4ZWQoMSl9bXNgO1xuXHR9XG5cblx0aWYgKG1zIDwgMV8wMDApIHtcblx0XHRyZXR1cm4gYCR7bXMudG9GaXhlZCgwKX1tc2A7XG5cdH1cblxuXHRyZXR1cm4gYCR7KG1zIC8gMTAwMCkudG9GaXhlZCgxKX1zYDtcbn07XG5cbmNvbnN0IGdldEFjdGlvbmFibGVFbGVtZW50QWN0aW9ucyA9IChcblx0Y29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0bWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0dGVzdFNlcnZpY2U6IElUZXN0U2VydmljZSxcblx0Y3JTZXJ2aWNlOiBJVGVzdGluZ0NvbnRpbnVvdXNSdW5TZXJ2aWNlLFxuXHRwcm9maWxlczogSVRlc3RQcm9maWxlU2VydmljZSxcblx0ZWxlbWVudDogVGVzdEl0ZW1UcmVlRWxlbWVudCxcbikgPT4ge1xuXHRjb25zdCB0ZXN0ID0gZWxlbWVudCBpbnN0YW5jZW9mIFRlc3RJdGVtVHJlZUVsZW1lbnQgPyBlbGVtZW50LnRlc3QgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGNvbnRleHRLZXlzOiBbc3RyaW5nLCB1bmtub3duXVtdID0gZ2V0VGVzdEl0ZW1Db250ZXh0T3ZlcmxheSh0ZXN0LCB0ZXN0ID8gcHJvZmlsZXMuY2FwYWJpbGl0aWVzRm9yVGVzdCh0ZXN0Lml0ZW0pIDogMCk7XG5cdGNvbnRleHRLZXlzLnB1c2goWyd2aWV3JywgVGVzdGluZy5FeHBsb3JlclZpZXdJZF0pO1xuXHRpZiAodGVzdCkge1xuXHRcdGNvbnN0IGN0cmwgPSB0ZXN0U2VydmljZS5nZXRUZXN0Q29udHJvbGxlcih0ZXN0LmNvbnRyb2xsZXJJZCk7XG5cdFx0Y29uc3Qgc3VwcG9ydHNDciA9ICEhY3RybCAmJiBwcm9maWxlcy5nZXRDb250cm9sbGVyUHJvZmlsZXMoY3RybC5pZCkuc29tZShwID0+XG5cdFx0XHRwLnN1cHBvcnRzQ29udGludW91c1J1biAmJiBjYW5Vc2VQcm9maWxlV2l0aFRlc3QocCwgdGVzdCkpO1xuXHRcdGNvbnRleHRLZXlzLnB1c2goW1xuXHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmNhblJlZnJlc2hUZXN0cy5rZXksXG5cdFx0XHRjdHJsICYmICEhKGN0cmwuY2FwYWJpbGl0aWVzLmdldCgpICYgVGVzdENvbnRyb2xsZXJDYXBhYmlsaXR5LlJlZnJlc2gpICYmIFRlc3RJZC5pc1Jvb3QodGVzdC5pdGVtLmV4dElkKSxcblx0XHRdLCBbXG5cdFx0XHRUZXN0aW5nQ29udGV4dEtleXMudGVzdEl0ZW1Jc0hpZGRlbi5rZXksXG5cdFx0XHR0ZXN0U2VydmljZS5leGNsdWRlZC5jb250YWlucyh0ZXN0KVxuXHRcdF0sIFtcblx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5pc0NvbnRpbnVvdXNNb2RlT24ua2V5LFxuXHRcdFx0c3VwcG9ydHNDciAmJiBjclNlcnZpY2UuaXNTcGVjaWZpY2FsbHlFbmFibGVkRm9yKHRlc3QuaXRlbS5leHRJZClcblx0XHRdLCBbXG5cdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuaXNQYXJlbnRSdW5uaW5nQ29udGludW91c2x5LmtleSxcblx0XHRcdHN1cHBvcnRzQ3IgJiYgY3JTZXJ2aWNlLmlzRW5hYmxlZEZvckFQYXJlbnRPZih0ZXN0Lml0ZW0uZXh0SWQpXG5cdFx0XSwgW1xuXHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLnN1cHBvcnRzQ29udGludW91c1J1bi5rZXksXG5cdFx0XHRzdXBwb3J0c0NyLFxuXHRcdF0sIFtcblx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy50ZXN0UmVzdWx0T3V0ZGF0ZWQua2V5LFxuXHRcdFx0ZWxlbWVudC5yZXRpcmVkLFxuXHRcdF0sIFtcblx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy50ZXN0UmVzdWx0U3RhdGUua2V5LFxuXHRcdFx0dGVzdFJlc3VsdFN0YXRlVG9Db250ZXh0VmFsdWVzW2VsZW1lbnQuc3RhdGVdLFxuXHRcdF0pO1xuXHR9XG5cblx0Y29uc3QgY29udGV4dE92ZXJsYXkgPSBjb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KGNvbnRleHRLZXlzKTtcblx0Y29uc3QgbWVudSA9IG1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5UZXN0SXRlbSwgY29udGV4dE92ZXJsYXksIHtcblx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSxcblx0fSk7XG5cblx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkJhckFjdGlvbnMobWVudSwgJ2lubGluZScpO1xuXG5cdHJldHVybiB7IGFjdGlvbnMsIGNvbnRleHRPdmVybGF5IH07XG59O1xuXG5yZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWUsIGNvbGxlY3RvcikgPT4ge1xuXHRpZiAodGhlbWUudHlwZSA9PT0gJ2RhcmsnKSB7XG5cdFx0Y29uc3QgZm9yZWdyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZm9yZWdyb3VuZCk7XG5cdFx0aWYgKGZvcmVncm91bmRDb2xvcikge1xuXHRcdFx0Y29uc3QgZmdXaXRoT3BhY2l0eSA9IG5ldyBDb2xvcihuZXcgUkdCQShmb3JlZ3JvdW5kQ29sb3IucmdiYS5yLCBmb3JlZ3JvdW5kQ29sb3IucmdiYS5nLCBmb3JlZ3JvdW5kQ29sb3IucmdiYS5iLCAwLjY1KSk7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLnRlc3QtZXhwbG9yZXIgLnRlc3QtZXhwbG9yZXItbWVzc2FnZXMgeyBjb2xvcjogJHtmZ1dpdGhPcGFjaXR5fTsgfWApO1xuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUdyQixTQUFTLGlCQUFrQztBQUMzQyxTQUFTLGNBQWM7QUFFdkIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyx5Q0FBcUU7QUFDOUUsU0FBc0csc0JBQXNCO0FBQzVILFNBQVMsUUFBUSxjQUF1QixXQUFXLGdCQUFnQjtBQUNuRSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFrQix5QkFBeUI7QUFDcEQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsT0FBTyxZQUFZO0FBQzVCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsU0FBUyxhQUFhO0FBRS9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUMvRCxTQUFTLFNBQVMsMkJBQTJCO0FBQzdDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMseUJBQXlCLHNCQUFzQixxQkFBcUIsaUNBQWlDO0FBQzlHLFNBQVMsY0FBYyxRQUFRLHNCQUFzQjtBQUNyRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQkFBaUIsY0FBYyxlQUFlLDJCQUEyQjtBQUNsRixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWUsa0NB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
