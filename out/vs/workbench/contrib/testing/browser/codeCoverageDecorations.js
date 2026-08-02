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
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { ActionBar, ActionsOrientation } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Action } from "../../../../base/common/actions.js";
import { mapFindFirst } from "../../../../base/common/arraysFind.js";
import { assert, assertNever } from "../../../../base/common/assert.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableFromEvent, observableValue } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { isUriComponents, URI } from "../../../../base/common/uri.js";
import { isCodeEditor, MouseTargetType, OverlayWidgetPositionPreference } from "../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { InjectedTextCursorStops, MinimapPosition } from "../../../../editor/common/model.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { bindContextKey, observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { ActiveEditorContext } from "../../../common/contextkeys.js";
import { TEXT_FILE_EDITOR_ID } from "../../files/common/files.js";
import { getTestingConfiguration, TestingConfigKeys } from "../common/configuration.js";
import { TestCommandId, Testing } from "../common/constants.js";
import { FileCoverage } from "../common/testCoverage.js";
import { ITestCoverageService } from "../common/testCoverageService.js";
import { TestId } from "../common/testId.js";
import { ITestService } from "../common/testService.js";
import { DetailType } from "../common/testTypes.js";
import { TestingContextKeys } from "../common/testingContextKeys.js";
import * as coverUtils from "./codeCoverageDisplayUtils.js";
import { testingCoverageMissingBranch, testingCoverageReport, testingFilterIcon, testingRerunIcon } from "./icons.js";
import { ManagedTestCoverageBars } from "./testCoverageBars.js";
import { testingCoveredMinimapBackground, testingUncoveredMinimapBackground } from "./theme.js";
const CLASS_HIT = "coverage-deco-hit";
const CLASS_MISS = "coverage-deco-miss";
const TOGGLE_INLINE_COMMAND_TEXT = localize("testing.toggleInlineCoverage", "Toggle Inline");
const TOGGLE_INLINE_COMMAND_ID = "testing.toggleInlineCoverage";
const BRANCH_MISS_INDICATOR_CHARS = 4;
const GO_TO_NEXT_MISSED_LINE_TITLE = localize2("testing.goToNextMissedLine", "Go to Next Uncovered Line");
const GO_TO_PREVIOUS_MISSED_LINE_TITLE = localize2("testing.goToPreviousMissedLine", "Go to Previous Uncovered Line");
let CodeCoverageDecorations = class extends Disposable {
  constructor(editor, instantiationService, coverage, configurationService, log, contextKeyService) {
    super();
    this.editor = editor;
    this.coverage = coverage;
    this.log = log;
    this.displayedStore = this._register(new DisposableStore());
    this.hoveredStore = this._register(new DisposableStore());
    this.decorationIds = /* @__PURE__ */ new Map();
    this.hasInlineCoverageDetails = observableValue("hasInlineCoverageDetails", false);
    this.summaryWidget = new Lazy(() => this._register(instantiationService.createInstance(CoverageToolbarWidget, this.editor)));
    const modelObs = observableFromEvent(this, editor.onDidChangeModel, () => editor.getModel());
    const configObs = observableFromEvent(this, editor.onDidChangeConfiguration, (i) => i);
    const fileCoverage = derived((reader) => {
      const report = coverage.selected.read(reader);
      if (!report) {
        return;
      }
      const model = modelObs.read(reader);
      if (!model) {
        return;
      }
      const file = report.getUri(model.uri);
      if (!file) {
        return;
      }
      report.didAddCoverage.read(reader);
      return { file, testId: coverage.filterToTest.read(reader) };
    });
    this._register(bindContextKey(
      TestingContextKeys.hasPerTestCoverage,
      contextKeyService,
      (reader) => !!fileCoverage.read(reader)?.file.perTestData?.size
    ));
    this._register(bindContextKey(
      TestingContextKeys.hasCoverageInFile,
      contextKeyService,
      (reader) => !!fileCoverage.read(reader)?.file
    ));
    this._register(bindContextKey(
      TestingContextKeys.hasInlineCoverageDetails,
      contextKeyService,
      (reader) => this.hasInlineCoverageDetails.read(reader)
    ));
    const minimapEnabled = observableConfigValue(TestingConfigKeys.CoverageMinimapEnabled, true, configurationService);
    this._register(autorun((reader) => {
      const c = fileCoverage.read(reader);
      if (c) {
        this.apply(editor.getModel(), c.file, c.testId, coverage.showInline.read(reader), minimapEnabled.read(reader));
      } else {
        this.clear();
      }
    }));
    const toolbarEnabled = observableConfigValue(TestingConfigKeys.CoverageToolbarEnabled, true, configurationService);
    this._register(autorun((reader) => {
      const c = fileCoverage.read(reader);
      if (c && toolbarEnabled.read(reader)) {
        this.summaryWidget.value.setCoverage(c.file, c.testId);
      } else {
        this.summaryWidget.rawValue?.clearCoverage();
      }
    }));
    this._register(autorun((reader) => {
      const c = fileCoverage.read(reader);
      if (c) {
        const evt = configObs.read(reader);
        if (evt?.hasChanged(EditorOption.lineHeight) !== false) {
          this.updateEditorStyles();
        }
      }
    }));
    this._register(editor.onMouseMove((e) => {
      const model = editor.getModel();
      if (e.target.type === MouseTargetType.GUTTER_LINE_NUMBERS && model) {
        this.hoverLineNumber(editor.getModel());
      } else if (coverage.showInline.get() && e.target.type === MouseTargetType.CONTENT_TEXT && model) {
        this.hoverInlineDecoration(model, e.target.position);
      } else {
        this.hoveredStore.clear();
      }
    }));
    this._register(editor.onWillChangeModel(() => {
      const model = editor.getModel();
      if (!this.details || !model) {
        return;
      }
      for (const decoration of model.getAllDecorations()) {
        const own = this.decorationIds.get(decoration.id);
        if (own) {
          own.detail.range = decoration.range;
        }
      }
    }));
  }
  updateEditorStyles() {
    const lineHeight = this.editor.getOption(EditorOption.lineHeight);
    const { style } = this.editor.getContainerDomNode();
    style.setProperty("--vscode-testing-coverage-lineHeight", `${lineHeight}px`);
  }
  hoverInlineDecoration(model, position) {
    const allDecorations = model.getDecorationsInRange(Range.fromPositions(position));
    const decoration = mapFindFirst(allDecorations, ({ id }) => this.decorationIds.has(id) ? { id, deco: this.decorationIds.get(id) } : void 0);
    if (decoration === this.hoveredSubject) {
      return;
    }
    this.hoveredStore.clear();
    this.hoveredSubject = decoration;
    if (!decoration) {
      return;
    }
    model.changeDecorations((e) => {
      e.changeDecorationOptions(decoration.id, {
        ...decoration.deco.options,
        className: `${decoration.deco.options.className} coverage-deco-hovered`
      });
    });
    this.hoveredStore.add(toDisposable(() => {
      this.hoveredSubject = void 0;
      model.changeDecorations((e) => {
        e.changeDecorationOptions(decoration.id, decoration.deco.options);
      });
    }));
  }
  hoverLineNumber(model) {
    if (this.hoveredSubject === "lineNo" || !this.details || this.coverage.showInline.get()) {
      return;
    }
    this.hoveredStore.clear();
    this.hoveredSubject = "lineNo";
    model.changeDecorations((e) => {
      for (const [id, decoration] of this.decorationIds) {
        const { applyHoverOptions, options } = decoration;
        const dup = { ...options };
        applyHoverOptions(dup);
        e.changeDecorationOptions(id, dup);
      }
    });
    this.hoveredStore.add(this.editor.onMouseLeave(() => {
      this.hoveredStore.clear();
    }));
    this.hoveredStore.add(toDisposable(() => {
      this.hoveredSubject = void 0;
      model.changeDecorations((e) => {
        for (const [id, decoration] of this.decorationIds) {
          e.changeDecorationOptions(id, decoration.options);
        }
      });
    }));
  }
  /**
   * Navigate to the next missed (uncovered) line from the current cursor position.
   * @returns true if navigation occurred, false if no missed line was found
   */
  goToNextMissedLine() {
    return this.navigateToMissedLine(true);
  }
  /**
   * Navigate to the previous missed (uncovered) line from the current cursor position.
   * @returns true if navigation occurred, false if no missed line was found
   */
  goToPreviousMissedLine() {
    return this.navigateToMissedLine(false);
  }
  navigateToMissedLine(next) {
    const model = this.editor.getModel();
    const position = this.editor.getPosition();
    if (!model || !position || !this.details) {
      return false;
    }
    const currentLine = position.lineNumber;
    let closestBefore;
    let closestAfter;
    let firstMissed;
    let lastMissed;
    for (const [, { detail, options }] of this.decorationIds) {
      if (options.lineNumberClassName?.includes(CLASS_MISS)) {
        const range = detail.range;
        if (range.isEmpty()) {
          continue;
        }
        const lineNumber = range.startLineNumber;
        const missedLine = { lineNumber, range };
        if (!firstMissed || lineNumber < firstMissed.lineNumber) {
          firstMissed = missedLine;
        }
        if (!lastMissed || lineNumber > lastMissed.lineNumber) {
          lastMissed = missedLine;
        }
        if (lineNumber < currentLine) {
          if (!closestBefore || lineNumber > closestBefore.lineNumber) {
            closestBefore = missedLine;
          }
        } else if (lineNumber > currentLine) {
          if (!closestAfter || lineNumber < closestAfter.lineNumber) {
            closestAfter = missedLine;
          }
        }
      }
    }
    const targetLine = next ? closestAfter || firstMissed : closestBefore || lastMissed;
    if (targetLine) {
      this.editor.setPosition(new Position(targetLine.lineNumber, 1));
      this.editor.revealLineInCenter(targetLine.lineNumber);
      return true;
    }
    return false;
  }
  async apply(model, coverage, testId, showInlineByDefault, showMinimap) {
    const details = this.details = await this.loadDetails(coverage, testId, model);
    if (!details) {
      this.hasInlineCoverageDetails.set(false, void 0);
      return this.clear();
    }
    this.hasInlineCoverageDetails.set(details.ranges.length > 0, void 0);
    this.displayedStore.clear();
    model.changeDecorations((e) => {
      for (const detailRange of details.ranges) {
        const { metadata: { detail, description }, range, primary } = detailRange;
        if (detail.type === DetailType.Branch) {
          const hits = detail.detail.branches[detail.branch].count;
          const cls = hits ? CLASS_HIT : CLASS_MISS;
          const showMissIndicator = !hits && range.isEmpty() && detail.detail.branches.some((b) => b.count);
          const options = {
            showIfCollapsed: showMissIndicator,
            // only avoid collapsing if we want to show the miss indicator
            description: "coverage-gutter",
            lineNumberClassName: `coverage-deco-gutter ${cls}`,
            minimap: showMinimap ? {
              color: themeColorFromId(hits ? testingCoveredMinimapBackground : testingUncoveredMinimapBackground),
              position: MinimapPosition.Gutter
            } : void 0
          };
          const applyHoverOptions = (target) => {
            target.hoverMessage = description;
            if (showMissIndicator) {
              target.after = {
                content: "\xA0".repeat(BRANCH_MISS_INDICATOR_CHARS),
                // nbsp
                inlineClassName: `coverage-deco-branch-miss-indicator ${ThemeIcon.asClassName(testingCoverageMissingBranch)}`,
                inlineClassNameAffectsLetterSpacing: true,
                cursorStops: InjectedTextCursorStops.None
              };
            } else {
              target.className = `coverage-deco-inline ${cls}`;
              if (primary && typeof hits === "number") {
                target.before = countBadge(hits);
              }
            }
          };
          if (showInlineByDefault) {
            applyHoverOptions(options);
          }
          this.decorationIds.set(e.addDecoration(range, options), { options, applyHoverOptions, detail: detailRange });
        } else if (detail.type === DetailType.Statement) {
          const cls = detail.count ? CLASS_HIT : CLASS_MISS;
          const options = {
            showIfCollapsed: false,
            description: "coverage-inline",
            lineNumberClassName: `coverage-deco-gutter ${cls}`,
            minimap: showMinimap ? {
              color: themeColorFromId(detail.count ? testingCoveredMinimapBackground : testingUncoveredMinimapBackground),
              position: MinimapPosition.Gutter
            } : void 0
          };
          const applyHoverOptions = (target) => {
            target.className = `coverage-deco-inline ${cls}`;
            target.hoverMessage = description;
            if (primary && typeof detail.count === "number") {
              target.before = countBadge(detail.count);
            }
          };
          if (showInlineByDefault) {
            applyHoverOptions(options);
          }
          this.decorationIds.set(e.addDecoration(range, options), { options, applyHoverOptions, detail: detailRange });
        }
      }
    });
    this.displayedStore.add(toDisposable(() => {
      model.changeDecorations((e) => {
        for (const decoration of this.decorationIds.keys()) {
          e.removeDecoration(decoration);
        }
        this.decorationIds.clear();
      });
    }));
  }
  clear() {
    this.loadingCancellation?.cancel();
    this.loadingCancellation = void 0;
    this.displayedStore.clear();
    this.hoveredStore.clear();
    this.hasInlineCoverageDetails.set(false, void 0);
  }
  async loadDetails(coverage, testId, textModel) {
    const cts = this.loadingCancellation = new CancellationTokenSource();
    this.displayedStore.add(this.loadingCancellation);
    try {
      const details = testId ? await coverage.detailsForTest(testId, this.loadingCancellation.token) : await coverage.details(this.loadingCancellation.token);
      if (cts.token.isCancellationRequested) {
        return;
      }
      return new CoverageDetailsModel(details, textModel);
    } catch (e) {
      this.log.error("Error loading coverage details", e);
    }
    return void 0;
  }
};
CodeCoverageDecorations.ID = Testing.CoverageDecorationsContributionId;
CodeCoverageDecorations = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ITestCoverageService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IContextKeyService)
], CodeCoverageDecorations);
const countBadge = (count) => {
  if (count === 0) {
    return void 0;
  }
  return {
    content: `${count > 99 ? "99+" : count}x`,
    cursorStops: InjectedTextCursorStops.None,
    inlineClassName: `coverage-deco-inline-count`,
    inlineClassNameAffectsLetterSpacing: true
  };
};
class CoverageDetailsModel {
  constructor(details, textModel) {
    this.details = details;
    this.ranges = [];
    const detailRanges = details.map((detail) => ({
      range: tidyLocation(detail.location),
      primary: true,
      metadata: { detail, description: this.describe(detail, textModel) }
    }));
    for (const { range, metadata: { detail } } of detailRanges) {
      if (detail.type === DetailType.Statement && detail.branches) {
        for (let i = 0; i < detail.branches.length; i++) {
          const branch = { type: DetailType.Branch, branch: i, detail };
          detailRanges.push({
            range: tidyLocation(detail.branches[i].location || Range.fromPositions(range.getEndPosition())),
            primary: true,
            metadata: {
              detail: branch,
              description: this.describe(branch, textModel)
            }
          });
        }
      }
    }
    detailRanges.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range) || a.metadata.detail.type - b.metadata.detail.type);
    const stack = [];
    const result = this.ranges = [];
    const pop = () => {
      const next = stack.pop();
      const prev = stack[stack.length - 1];
      if (prev) {
        prev.range = prev.range.setStartPosition(next.range.endLineNumber, next.range.endColumn);
      }
      result.push(next);
    };
    for (const item of detailRanges) {
      const start = item.range.getStartPosition();
      while (stack[stack.length - 1]?.range.containsPosition(start) === false) {
        pop();
      }
      if (item.range.isEmpty()) {
        result.push(item);
        continue;
      }
      const prev = stack[stack.length - 1];
      if (prev) {
        const primary = prev.primary;
        const si = prev.range.setEndPosition(start.lineNumber, start.column);
        prev.range = prev.range.setStartPosition(item.range.endLineNumber, item.range.endColumn);
        prev.primary = false;
        if (prev.range.isEmpty()) {
          stack.pop();
        }
        result.push({ range: si, primary, metadata: prev.metadata });
      }
      stack.push(item);
    }
    while (stack.length) {
      pop();
    }
  }
  /** Gets the markdown description for the given detail */
  describe(detail, model) {
    if (detail.type === DetailType.Declaration) {
      return namedDetailLabel(detail.name, detail);
    } else if (detail.type === DetailType.Statement) {
      const text = wrapName(model.getValueInRange(tidyLocation(detail.location)).trim() || `<empty statement>`);
      if (detail.branches?.length) {
        const covered = detail.branches.filter((b) => !!b.count).length;
        return new MarkdownString().appendMarkdown(localize("coverage.branches", "{0} of {1} of branches in {2} were covered.", covered, detail.branches.length, text));
      } else {
        return namedDetailLabel(text, detail);
      }
    } else if (detail.type === DetailType.Branch) {
      const text = wrapName(model.getValueInRange(tidyLocation(detail.detail.location)).trim() || `<empty statement>`);
      const { count, label } = detail.detail.branches[detail.branch];
      const label2 = label ? wrapInBackticks(label) : `#${detail.branch + 1}`;
      if (!count) {
        return new MarkdownString().appendMarkdown(localize("coverage.branchNotCovered", "Branch {0} in {1} was not covered.", label2, text));
      } else if (count === true) {
        return new MarkdownString().appendMarkdown(localize("coverage.branchCoveredYes", "Branch {0} in {1} was executed.", label2, text));
      } else {
        return new MarkdownString().appendMarkdown(localize("coverage.branchCovered", "Branch {0} in {1} was executed {2} time(s).", label2, text, count));
      }
    }
    assertNever(detail);
  }
}
function namedDetailLabel(name, detail) {
  return new MarkdownString().appendMarkdown(
    !detail.count ? localize("coverage.declExecutedNo", "`{0}` was not executed.", name) : typeof detail.count === "number" ? localize("coverage.declExecutedCount", "`{0}` was executed {1} time(s).", name, detail.count) : localize("coverage.declExecutedYes", "`{0}` was executed.", name)
  );
}
function tidyLocation(location) {
  if (location instanceof Position) {
    return Range.fromPositions(location, new Position(location.lineNumber, 2147483647));
  }
  return location;
}
function wrapInBackticks(str) {
  return "`" + str.replace(/[\n\r`]/g, "") + "`";
}
function wrapName(functionNameOrCode) {
  if (functionNameOrCode.length > 50) {
    functionNameOrCode = functionNameOrCode.slice(0, 40) + "...";
  }
  return wrapInBackticks(functionNameOrCode);
}
let CoverageToolbarWidget = class extends Disposable {
  constructor(editor, configurationService, contextMenuService, testService, keybindingService, commandService, coverage, instaService) {
    super();
    this.editor = editor;
    this.configurationService = configurationService;
    this.contextMenuService = contextMenuService;
    this.testService = testService;
    this.keybindingService = keybindingService;
    this.commandService = commandService;
    this.coverage = coverage;
    this.registered = false;
    this.isRunning = false;
    this.showStore = this._register(new DisposableStore());
    this._domNode = dom.h("div.coverage-summary-widget", [
      dom.h("div", [
        dom.h("span.bars@bars"),
        dom.h("span.toolbar@toolbar")
      ])
    ]);
    this.bars = this._register(instaService.createInstance(ManagedTestCoverageBars, {
      compact: false,
      overall: false,
      container: this._domNode.bars
    }));
    this.actionBar = this._register(instaService.createInstance(ActionBar, this._domNode.toolbar, {
      orientation: ActionsOrientation.HORIZONTAL,
      actionViewItemProvider: (action, options) => {
        if (action instanceof ActionWithIcon) {
          if (action.iconOnly) {
            action.class = ThemeIcon.asClassName(action.icon);
            return new ActionViewItem(void 0, action, { ...options, label: false, icon: true });
          }
          const vm = new CodiconActionViewItem(void 0, action, options);
          vm.themeIcon = action.icon;
          return vm;
        }
        return void 0;
      }
    }));
    this._register(autorun((reader) => {
      coverage.showInline.read(reader);
      this.setActions();
    }));
    this._register(dom.addStandardDisposableListener(this._domNode.root, dom.EventType.CONTEXT_MENU, (e) => {
      this.contextMenuService.showContextMenu({
        menuId: MenuId.StickyScrollContext,
        getAnchor: () => e
      });
    }));
  }
  /** @inheritdoc */
  getId() {
    return "coverage-summary-widget";
  }
  /** @inheritdoc */
  getDomNode() {
    return this._domNode.root;
  }
  /** @inheritdoc */
  getPosition() {
    return {
      preference: OverlayWidgetPositionPreference.TOP_CENTER,
      stackOrdinal: 9
    };
  }
  clearCoverage() {
    this.current = void 0;
    this.bars.setCoverageInfo(void 0);
    this.hide();
  }
  setCoverage(coverage, testId) {
    this.current = { coverage, testId };
    this.bars.setCoverageInfo(coverage);
    if (!coverage) {
      this.hide();
    } else {
      this.setActions();
      this.show();
    }
  }
  setActions() {
    this.actionBar.clear();
    const current = this.current;
    if (!current) {
      return;
    }
    const toggleAction = new ActionWithIcon(
      "toggleInline",
      this.coverage.showInline.get() ? localize("testing.hideInlineCoverage", "Hide Inline") : localize("testing.showInlineCoverage", "Show Inline"),
      testingCoverageReport,
      void 0,
      () => this.coverage.showInline.set(!this.coverage.showInline.get(), void 0)
    );
    toggleAction.tooltip = this.keybindingService.appendKeybinding(TOGGLE_INLINE_COMMAND_TEXT, TOGGLE_INLINE_COMMAND_ID);
    const hasUncoveredStmt = current.coverage.statement.covered < current.coverage.statement.total;
    this.actionBar.push(new ActionWithIcon(
      "goToPreviousMissed",
      GO_TO_PREVIOUS_MISSED_LINE_TITLE.value,
      Codicon.arrowUp,
      hasUncoveredStmt,
      () => this.commandService.executeCommand(TestCommandId.CoverageGoToPreviousMissedLine),
      true
    ));
    this.actionBar.push(new ActionWithIcon(
      "goToNextMissed",
      GO_TO_NEXT_MISSED_LINE_TITLE.value,
      Codicon.arrowDown,
      hasUncoveredStmt,
      () => this.commandService.executeCommand(TestCommandId.CoverageGoToNextMissedLine),
      true
    ));
    this.actionBar.push(toggleAction);
    if (current.testId) {
      const testItem = current.coverage.fromResult.getTestById(current.testId.toString());
      assert(!!testItem, "got coverage for an unreported test");
      this.actionBar.push(new ActionWithIcon(
        "perTestFilter",
        coverUtils.labels.showingFilterFor(testItem.label),
        testingFilterIcon,
        void 0,
        () => this.commandService.executeCommand(TestCommandId.CoverageFilterToTestInEditor, this.current, this.editor)
      ));
    } else if (current.coverage.perTestData?.size) {
      this.actionBar.push(new ActionWithIcon(
        "perTestFilter",
        localize("testing.coverageForTestAvailable", "{0} test(s) ran code in this file", current.coverage.perTestData.size),
        testingFilterIcon,
        void 0,
        () => this.commandService.executeCommand(TestCommandId.CoverageFilterToTestInEditor, this.current, this.editor)
      ));
    }
    this.actionBar.push(new ActionWithIcon(
      "rerun",
      localize("testing.rerun", "Rerun"),
      testingRerunIcon,
      !this.isRunning,
      () => this.rerunTest()
    ));
  }
  show() {
    if (this.registered) {
      return;
    }
    this.registered = true;
    let viewZoneId;
    const ds = this.showStore;
    this.editor.addOverlayWidget(this);
    this.editor.changeViewZones((accessor) => {
      viewZoneId = accessor.addZone({
        // make space for the widget
        afterLineNumber: 0,
        afterColumn: 0,
        domNode: document.createElement("div"),
        heightInPx: 30,
        ordinal: -1
        // show before code lenses
      });
    });
    ds.add(toDisposable(() => {
      this.registered = false;
      this.editor.removeOverlayWidget(this);
      this.editor.changeViewZones((accessor) => {
        accessor.removeZone(viewZoneId);
      });
    }));
    ds.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (this.current && (e.affectsConfiguration(TestingConfigKeys.CoverageBarThresholds) || e.affectsConfiguration(TestingConfigKeys.CoveragePercent))) {
        this.setCoverage(this.current.coverage, this.current.testId);
      }
    }));
  }
  rerunTest() {
    const current = this.current;
    if (current) {
      this.isRunning = true;
      this.setActions();
      this.testService.runResolvedTests(current.coverage.fromResult.request).finally(() => {
        this.isRunning = false;
        this.setActions();
      });
    }
  }
  hide() {
    this.showStore.clear();
  }
};
CoverageToolbarWidget = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, ITestService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, ITestCoverageService),
  __decorateParam(7, IInstantiationService)
], CoverageToolbarWidget);
registerAction2(class ToggleInlineCoverage extends Action2 {
  constructor() {
    super({
      id: TOGGLE_INLINE_COMMAND_ID,
      // note: ideally this would be "show inline", but the command palette does
      // not use the 'toggled' titles, so we need to make this generic.
      title: localize2("coverage.toggleInline", "Toggle Inline Coverage"),
      category: Categories.Test,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI)
      },
      toggled: {
        condition: TestingContextKeys.inlineCoverageEnabled,
        title: localize("coverage.hideInline", "Hide Inline Coverage")
      },
      icon: testingCoverageReport,
      menu: [
        { id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen },
        { id: MenuId.EditorTitle, when: ContextKeyExpr.and(TestingContextKeys.hasInlineCoverageDetails, TestingContextKeys.coverageToolbarEnabled.notEqualsTo(true)), group: "navigation" }
      ]
    });
  }
  run(accessor) {
    const coverage = accessor.get(ITestCoverageService);
    coverage.showInline.set(!coverage.showInline.get(), void 0);
  }
});
registerAction2(class ToggleCoverageToolbar extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CoverageToggleToolbar,
      title: localize2("testing.toggleToolbarTitle", "Show Test Coverage Toolbar"),
      metadata: {
        description: localize2("testing.toggleToolbarDesc", "Toggle the sticky coverage bar in the editor.")
      },
      category: Categories.Test,
      toggled: {
        condition: TestingContextKeys.coverageToolbarEnabled
      },
      menu: [
        { id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen },
        { id: MenuId.StickyScrollContext, when: TestingContextKeys.isTestCoverageOpen },
        { id: MenuId.EditorTitle, when: TestingContextKeys.hasCoverageInFile, group: "coverage", order: 1 }
      ]
    });
  }
  run(accessor) {
    const config = accessor.get(IConfigurationService);
    const value = getTestingConfiguration(config, TestingConfigKeys.CoverageToolbarEnabled);
    config.updateValue(TestingConfigKeys.CoverageToolbarEnabled, !value);
  }
});
registerAction2(class FilterCoverageToTestInEditor extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CoverageFilterToTestInEditor,
      title: localize2("testing.filterActionLabel", "Filter Coverage to Test"),
      category: Categories.Test,
      icon: Codicon.filter,
      toggled: {
        icon: Codicon.filterFilled,
        condition: TestingContextKeys.isCoverageFilteredToTest
      },
      menu: [
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(
            TestingContextKeys.hasCoverageInFile,
            TestingContextKeys.coverageToolbarEnabled.notEqualsTo(true),
            TestingContextKeys.hasPerTestCoverage,
            ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID)
          ),
          group: "navigation"
        }
      ]
    });
  }
  run(accessor, coverageOrUri, editor) {
    const testCoverageService = accessor.get(ITestCoverageService);
    const quickInputService = accessor.get(IQuickInputService);
    const commandService = accessor.get(ICommandService);
    const activeEditor = isCodeEditor(editor) ? editor : accessor.get(ICodeEditorService).getActiveCodeEditor();
    let coverage;
    if (coverageOrUri instanceof FileCoverage) {
      coverage = coverageOrUri;
    } else if (isUriComponents(coverageOrUri)) {
      coverage = testCoverageService.selected.get()?.getUri(URI.from(coverageOrUri));
    } else {
      const uri = activeEditor?.getModel()?.uri;
      coverage = uri && testCoverageService.selected.get()?.getUri(uri);
    }
    if (!coverage || !coverage.perTestData?.size) {
      return;
    }
    const tests = [...coverage.perTestData].map(TestId.fromString);
    const commonPrefix = TestId.getLengthOfCommonPrefix(tests.length, (i) => tests[i]);
    const result = coverage.fromResult;
    const previousSelection = testCoverageService.filterToTest.get();
    const buttons = [{
      iconClass: "codicon-go-to-file",
      tooltip: "Go to Test"
    }];
    const items = [
      { label: coverUtils.labels.allTests, testId: void 0 },
      { type: "separator" },
      ...tests.map((id) => ({ ...coverUtils.getLabelForItem(result, id, commonPrefix), testId: id, buttons }))
    ];
    const scrollTop = activeEditor?.getScrollTop() || 0;
    const revealScrollCts = new MutableDisposable();
    quickInputService.pick(items, {
      activeItem: items.find((item) => "testId" in item && item.testId?.toString() === previousSelection?.toString()),
      placeHolder: coverUtils.labels.pickShowCoverage,
      onDidTriggerItemButton: (context) => {
        commandService.executeCommand("vscode.revealTest", context.item.testId?.toString());
      },
      onDidFocus: (entry) => {
        if (!entry.testId) {
          revealScrollCts.clear();
          activeEditor?.setScrollTop(scrollTop);
          testCoverageService.filterToTest.set(void 0, void 0);
        } else {
          const cts = revealScrollCts.value = new CancellationTokenSource();
          coverage.detailsForTest(entry.testId, cts.token).then(
            (details) => {
              const first = details.find((d) => d.type === DetailType.Statement);
              if (!cts.token.isCancellationRequested && first) {
                activeEditor?.revealLineNearTop(first.location instanceof Position ? first.location.lineNumber : first.location.startLineNumber);
              }
            },
            () => {
            }
          );
          testCoverageService.filterToTest.set(entry.testId, void 0);
        }
      }
    }).then((selected) => {
      if (!selected) {
        activeEditor?.setScrollTop(scrollTop);
      }
      revealScrollCts.dispose();
      testCoverageService.filterToTest.set(selected ? selected.testId : previousSelection, void 0);
    });
  }
});
registerAction2(class ToggleCoverageInExplorer extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CoverageToggleInExplorer,
      title: localize2("testing.toggleCoverageInExplorerTitle", "Toggle Coverage in Explorer"),
      metadata: {
        description: localize2("testing.toggleCoverageInExplorerDesc", "Toggle the display of test coverage in the File Explorer view.")
      },
      category: Categories.Test,
      toggled: {
        condition: ContextKeyExpr.equals("config.testing.showCoverageInExplorer", true),
        title: localize("testing.hideCoverageInExplorer", "Hide Coverage in Explorer")
      },
      menu: [
        { id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen }
      ]
    });
  }
  run(accessor) {
    const config = accessor.get(IConfigurationService);
    const value = getTestingConfiguration(config, TestingConfigKeys.ShowCoverageInExplorer);
    config.updateValue(TestingConfigKeys.ShowCoverageInExplorer, !value);
  }
});
registerAction2(class GoToNextMissedCoverageLine extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CoverageGoToNextMissedLine,
      title: GO_TO_NEXT_MISSED_LINE_TITLE,
      metadata: {
        description: localize2("testing.goToNextMissedLineDesc", "Navigate to the next line that is not covered by tests.")
      },
      category: Categories.Test,
      icon: Codicon.arrowDown,
      precondition: TestingContextKeys.hasCoverageInFile,
      keybinding: {
        when: ActiveEditorContext,
        weight: KeybindingWeight.EditorContrib,
        primary: KeyMod.Alt | KeyCode.F9
      },
      menu: [
        { id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen },
        { id: MenuId.EditorTitle, when: TestingContextKeys.hasCoverageInFile, group: "coverage", order: 2 }
      ]
    });
  }
  run(accessor) {
    const codeEditorService = accessor.get(ICodeEditorService);
    const activeEditor = codeEditorService.getActiveCodeEditor();
    if (!activeEditor) {
      return;
    }
    const contribution = activeEditor.getContribution(CodeCoverageDecorations.ID);
    contribution?.goToNextMissedLine();
  }
});
registerAction2(class GoToPreviousMissedCoverageLine extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CoverageGoToPreviousMissedLine,
      title: GO_TO_PREVIOUS_MISSED_LINE_TITLE,
      metadata: {
        description: localize2("testing.goToPreviousMissedLineDesc", "Navigate to the previous line that is not covered by tests.")
      },
      category: Categories.Test,
      icon: Codicon.arrowUp,
      precondition: TestingContextKeys.hasCoverageInFile,
      keybinding: {
        when: ActiveEditorContext,
        weight: KeybindingWeight.EditorContrib,
        primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F9
      },
      menu: [
        { id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen },
        { id: MenuId.EditorTitle, when: TestingContextKeys.hasCoverageInFile, group: "coverage", order: 3 }
      ]
    });
  }
  run(accessor) {
    const codeEditorService = accessor.get(ICodeEditorService);
    const activeEditor = codeEditorService.getActiveCodeEditor();
    if (!activeEditor) {
      return;
    }
    const contribution = activeEditor.getContribution(CodeCoverageDecorations.ID);
    contribution?.goToPreviousMissedLine();
  }
});
class ActionWithIcon extends Action {
  constructor(id, title, icon, enabled, run, iconOnly = false) {
    super(id, title, void 0, enabled, run);
    this.icon = icon;
    this.iconOnly = iconOnly;
  }
}
class CodiconActionViewItem extends ActionViewItem {
  updateLabel() {
    if (this.options.label && this.label && this.themeIcon) {
      dom.reset(this.label, renderIcon(this.themeIcon), this.action.label);
    }
  }
}
export {
  CodeCoverageDecorations,
  CoverageDetailsModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvYnJvd3Nlci9jb2RlQ292ZXJhZ2VEZWNvcmF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyLCBBY3Rpb25zT3JpZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgbWFwRmluZEZpcnN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzRmluZC5qcyc7XG5pbXBvcnQgeyBhc3NlcnQsIGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc1VyaUNvbXBvbmVudHMsIFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSU92ZXJsYXlXaWRnZXQsIElPdmVybGF5V2lkZ2V0UG9zaXRpb24sIGlzQ29kZUVkaXRvciwgTW91c2VUYXJnZXRUeXBlLCBPdmVybGF5V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucywgSW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMsIEluamVjdGVkVGV4dE9wdGlvbnMsIElUZXh0TW9kZWwsIE1pbmltYXBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBiaW5kQ29udGV4dEtleSwgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRCdXR0b24sIElRdWlja0lucHV0U2VydmljZSwgUXVpY2tQaWNrSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IHRoZW1lQ29sb3JGcm9tSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGl2ZUVkaXRvckNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgVEVYVF9GSUxFX0VESVRPUl9JRCB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbiwgVGVzdGluZ0NvbmZpZ0tleXMgfSBmcm9tICcuLi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29tbWFuZElkLCBUZXN0aW5nIH0gZnJvbSAnLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBGaWxlQ292ZXJhZ2UgfSBmcm9tICcuLi9jb21tb24vdGVzdENvdmVyYWdlLmpzJztcbmltcG9ydCB7IElUZXN0Q292ZXJhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RDb3ZlcmFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdElkIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RJZC5qcyc7XG5pbXBvcnQgeyBJVGVzdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdGVzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ292ZXJhZ2VEZXRhaWxzLCBEZXRhaWxUeXBlLCBJRGVjbGFyYXRpb25Db3ZlcmFnZSwgSVN0YXRlbWVudENvdmVyYWdlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBUZXN0aW5nQ29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vdGVzdGluZ0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCAqIGFzIGNvdmVyVXRpbHMgZnJvbSAnLi9jb2RlQ292ZXJhZ2VEaXNwbGF5VXRpbHMuanMnO1xuaW1wb3J0IHsgdGVzdGluZ0NvdmVyYWdlTWlzc2luZ0JyYW5jaCwgdGVzdGluZ0NvdmVyYWdlUmVwb3J0LCB0ZXN0aW5nRmlsdGVySWNvbiwgdGVzdGluZ1JlcnVuSWNvbiB9IGZyb20gJy4vaWNvbnMuanMnO1xuaW1wb3J0IHsgTWFuYWdlZFRlc3RDb3ZlcmFnZUJhcnMgfSBmcm9tICcuL3Rlc3RDb3ZlcmFnZUJhcnMuanMnO1xuaW1wb3J0IHsgdGVzdGluZ0NvdmVyZWRNaW5pbWFwQmFja2dyb3VuZCwgdGVzdGluZ1VuY292ZXJlZE1pbmltYXBCYWNrZ3JvdW5kIH0gZnJvbSAnLi90aGVtZS5qcyc7XG5cbmNvbnN0IENMQVNTX0hJVCA9ICdjb3ZlcmFnZS1kZWNvLWhpdCc7XG5jb25zdCBDTEFTU19NSVNTID0gJ2NvdmVyYWdlLWRlY28tbWlzcyc7XG5jb25zdCBUT0dHTEVfSU5MSU5FX0NPTU1BTkRfVEVYVCA9IGxvY2FsaXplKCd0ZXN0aW5nLnRvZ2dsZUlubGluZUNvdmVyYWdlJywgJ1RvZ2dsZSBJbmxpbmUnKTtcbmNvbnN0IFRPR0dMRV9JTkxJTkVfQ09NTUFORF9JRCA9ICd0ZXN0aW5nLnRvZ2dsZUlubGluZUNvdmVyYWdlJztcbmNvbnN0IEJSQU5DSF9NSVNTX0lORElDQVRPUl9DSEFSUyA9IDQ7XG5jb25zdCBHT19UT19ORVhUX01JU1NFRF9MSU5FX1RJVExFID0gbG9jYWxpemUyKCd0ZXN0aW5nLmdvVG9OZXh0TWlzc2VkTGluZScsIFwiR28gdG8gTmV4dCBVbmNvdmVyZWQgTGluZVwiKTtcbmNvbnN0IEdPX1RPX1BSRVZJT1VTX01JU1NFRF9MSU5FX1RJVExFID0gbG9jYWxpemUyKCd0ZXN0aW5nLmdvVG9QcmV2aW91c01pc3NlZExpbmUnLCBcIkdvIHRvIFByZXZpb3VzIFVuY292ZXJlZCBMaW5lXCIpO1xuXG5leHBvcnQgY2xhc3MgQ29kZUNvdmVyYWdlRGVjb3JhdGlvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSBUZXN0aW5nLkNvdmVyYWdlRGVjb3JhdGlvbnNDb250cmlidXRpb25JZDtcblxuXHRwcml2YXRlIGxvYWRpbmdDYW5jZWxsYXRpb24/OiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNwbGF5ZWRTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgaG92ZXJlZFN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBzdW1tYXJ5V2lkZ2V0OiBMYXp5PENvdmVyYWdlVG9vbGJhcldpZGdldD47XG5cdHByaXZhdGUgZGVjb3JhdGlvbklkcyA9IG5ldyBNYXA8c3RyaW5nLCB7XG5cdFx0ZGV0YWlsOiBEZXRhaWxSYW5nZTtcblx0XHRvcHRpb25zOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucztcblx0XHRhcHBseUhvdmVyT3B0aW9ucyh0YXJnZXQ6IElNb2RlbERlY29yYXRpb25PcHRpb25zKTogdm9pZDtcblx0fT4oKTtcblx0cHJpdmF0ZSBob3ZlcmVkU3ViamVjdD86IHVua25vd247XG5cdHByaXZhdGUgZGV0YWlscz86IENvdmVyYWdlRGV0YWlsc01vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IGhhc0lubGluZUNvdmVyYWdlRGV0YWlscyA9IG9ic2VydmFibGVWYWx1ZSgnaGFzSW5saW5lQ292ZXJhZ2VEZXRhaWxzJywgZmFsc2UpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXN0Q292ZXJhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY292ZXJhZ2U6IElUZXN0Q292ZXJhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2c6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuc3VtbWFyeVdpZGdldCA9IG5ldyBMYXp5KCgpID0+IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvdmVyYWdlVG9vbGJhcldpZGdldCwgdGhpcy5lZGl0b3IpKSk7XG5cblx0XHRjb25zdCBtb2RlbE9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwsICgpID0+IGVkaXRvci5nZXRNb2RlbCgpKTtcblx0XHRjb25zdCBjb25maWdPYnMgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIGVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGkgPT4gaSk7XG5cblx0XHRjb25zdCBmaWxlQ292ZXJhZ2UgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCByZXBvcnQgPSBjb3ZlcmFnZS5zZWxlY3RlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXJlcG9ydCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gbW9kZWxPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZpbGUgPSByZXBvcnQuZ2V0VXJpKG1vZGVsLnVyaSk7XG5cdFx0XHRpZiAoIWZpbGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXBvcnQuZGlkQWRkQ292ZXJhZ2UucmVhZChyZWFkZXIpOyAvLyByZS1yZWFkIGlmIGNoYW5nZXMgd2hlbiB0aGVyZSdzIG5vIHJlcG9ydFxuXHRcdFx0cmV0dXJuIHsgZmlsZSwgdGVzdElkOiBjb3ZlcmFnZS5maWx0ZXJUb1Rlc3QucmVhZChyZWFkZXIpIH07XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShcblx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5oYXNQZXJUZXN0Q292ZXJhZ2UsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZSxcblx0XHRcdHJlYWRlciA9PiAhIWZpbGVDb3ZlcmFnZS5yZWFkKHJlYWRlcik/LmZpbGUucGVyVGVzdERhdGE/LnNpemUsXG5cdFx0KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShcblx0XHRcdFRlc3RpbmdDb250ZXh0S2V5cy5oYXNDb3ZlcmFnZUluRmlsZSxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0cmVhZGVyID0+ICEhZmlsZUNvdmVyYWdlLnJlYWQocmVhZGVyKT8uZmlsZSxcblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KFxuXHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmhhc0lubGluZUNvdmVyYWdlRGV0YWlscyxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0cmVhZGVyID0+IHRoaXMuaGFzSW5saW5lQ292ZXJhZ2VEZXRhaWxzLnJlYWQocmVhZGVyKSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IG1pbmltYXBFbmFibGVkID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlKFRlc3RpbmdDb25maWdLZXlzLkNvdmVyYWdlTWluaW1hcEVuYWJsZWQsIHRydWUsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjID0gZmlsZUNvdmVyYWdlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjKSB7XG5cdFx0XHRcdHRoaXMuYXBwbHkoZWRpdG9yLmdldE1vZGVsKCkhLCBjLmZpbGUsIGMudGVzdElkLCBjb3ZlcmFnZS5zaG93SW5saW5lLnJlYWQocmVhZGVyKSwgbWluaW1hcEVuYWJsZWQucmVhZChyZWFkZXIpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCB0b29sYmFyRW5hYmxlZCA9IG9ic2VydmFibGVDb25maWdWYWx1ZShUZXN0aW5nQ29uZmlnS2V5cy5Db3ZlcmFnZVRvb2xiYXJFbmFibGVkLCB0cnVlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYyA9IGZpbGVDb3ZlcmFnZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoYyAmJiB0b29sYmFyRW5hYmxlZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0dGhpcy5zdW1tYXJ5V2lkZ2V0LnZhbHVlLnNldENvdmVyYWdlKGMuZmlsZSwgYy50ZXN0SWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zdW1tYXJ5V2lkZ2V0LnJhd1ZhbHVlPy5jbGVhckNvdmVyYWdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYyA9IGZpbGVDb3ZlcmFnZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoYykge1xuXHRcdFx0XHRjb25zdCBldnQgPSBjb25maWdPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoZXZ0Py5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KSAhPT0gZmFsc2UpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUVkaXRvclN0eWxlcygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uTW91c2VNb3ZlKGUgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmIChlLnRhcmdldC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0xJTkVfTlVNQkVSUyAmJiBtb2RlbCkge1xuXHRcdFx0XHR0aGlzLmhvdmVyTGluZU51bWJlcihlZGl0b3IuZ2V0TW9kZWwoKSEpO1xuXHRcdFx0fSBlbHNlIGlmIChjb3ZlcmFnZS5zaG93SW5saW5lLmdldCgpICYmIGUudGFyZ2V0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1RFWFQgJiYgbW9kZWwpIHtcblx0XHRcdFx0dGhpcy5ob3ZlcklubGluZURlY29yYXRpb24obW9kZWwsIGUudGFyZ2V0LnBvc2l0aW9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuaG92ZXJlZFN0b3JlLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uV2lsbENoYW5nZU1vZGVsKCgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAoIXRoaXMuZGV0YWlscyB8fCAhbW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEZWNvcmF0aW9ucyBhZGp1c3QgdG8gbG9jYWwgY2hhbmdlcyBtYWRlIGluLWVkaXRvciwga2VlcCB0aGVtIHN5bmNlZCBpbiBjYXNlIHRoZSBmaWxlIGlzIHJlb3BlbmVkOlxuXHRcdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIG1vZGVsLmdldEFsbERlY29yYXRpb25zKCkpIHtcblx0XHRcdFx0Y29uc3Qgb3duID0gdGhpcy5kZWNvcmF0aW9uSWRzLmdldChkZWNvcmF0aW9uLmlkKTtcblx0XHRcdFx0aWYgKG93bikge1xuXHRcdFx0XHRcdG93bi5kZXRhaWwucmFuZ2UgPSBkZWNvcmF0aW9uLnJhbmdlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFZGl0b3JTdHlsZXMoKSB7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0Y29uc3QgeyBzdHlsZSB9ID0gdGhpcy5lZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpO1xuXHRcdHN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS10ZXN0aW5nLWNvdmVyYWdlLWxpbmVIZWlnaHQnLCBgJHtsaW5lSGVpZ2h0fXB4YCk7XG5cdH1cblxuXHRwcml2YXRlIGhvdmVySW5saW5lRGVjb3JhdGlvbihtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uKSB7XG5cdFx0Y29uc3QgYWxsRGVjb3JhdGlvbnMgPSBtb2RlbC5nZXREZWNvcmF0aW9uc0luUmFuZ2UoUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbikpO1xuXHRcdGNvbnN0IGRlY29yYXRpb24gPSBtYXBGaW5kRmlyc3QoYWxsRGVjb3JhdGlvbnMsICh7IGlkIH0pID0+IHRoaXMuZGVjb3JhdGlvbklkcy5oYXMoaWQpID8geyBpZCwgZGVjbzogdGhpcy5kZWNvcmF0aW9uSWRzLmdldChpZCkhIH0gOiB1bmRlZmluZWQpO1xuXHRcdGlmIChkZWNvcmF0aW9uID09PSB0aGlzLmhvdmVyZWRTdWJqZWN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5ob3ZlcmVkU3RvcmUuY2xlYXIoKTtcblx0XHR0aGlzLmhvdmVyZWRTdWJqZWN0ID0gZGVjb3JhdGlvbjtcblxuXHRcdGlmICghZGVjb3JhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdG1vZGVsLmNoYW5nZURlY29yYXRpb25zKGUgPT4ge1xuXHRcdFx0ZS5jaGFuZ2VEZWNvcmF0aW9uT3B0aW9ucyhkZWNvcmF0aW9uLmlkLCB7XG5cdFx0XHRcdC4uLmRlY29yYXRpb24uZGVjby5vcHRpb25zLFxuXHRcdFx0XHRjbGFzc05hbWU6IGAke2RlY29yYXRpb24uZGVjby5vcHRpb25zLmNsYXNzTmFtZX0gY292ZXJhZ2UtZGVjby1ob3ZlcmVkYCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5ob3ZlcmVkU3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmhvdmVyZWRTdWJqZWN0ID0gdW5kZWZpbmVkO1xuXHRcdFx0bW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoZSA9PiB7XG5cdFx0XHRcdGUuY2hhbmdlRGVjb3JhdGlvbk9wdGlvbnMoZGVjb3JhdGlvbiEuaWQsIGRlY29yYXRpb24hLmRlY28ub3B0aW9ucyk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGhvdmVyTGluZU51bWJlcihtb2RlbDogSVRleHRNb2RlbCkge1xuXHRcdGlmICh0aGlzLmhvdmVyZWRTdWJqZWN0ID09PSAnbGluZU5vJyB8fCAhdGhpcy5kZXRhaWxzIHx8IHRoaXMuY292ZXJhZ2Uuc2hvd0lubGluZS5nZXQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaG92ZXJlZFN0b3JlLmNsZWFyKCk7XG5cdFx0dGhpcy5ob3ZlcmVkU3ViamVjdCA9ICdsaW5lTm8nO1xuXG5cdFx0bW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IFtpZCwgZGVjb3JhdGlvbl0gb2YgdGhpcy5kZWNvcmF0aW9uSWRzKSB7XG5cdFx0XHRcdGNvbnN0IHsgYXBwbHlIb3Zlck9wdGlvbnMsIG9wdGlvbnMgfSA9IGRlY29yYXRpb247XG5cdFx0XHRcdGNvbnN0IGR1cCA9IHsgLi4ub3B0aW9ucyB9O1xuXHRcdFx0XHRhcHBseUhvdmVyT3B0aW9ucyhkdXApO1xuXHRcdFx0XHRlLmNoYW5nZURlY29yYXRpb25PcHRpb25zKGlkLCBkdXApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5ob3ZlcmVkU3RvcmUuYWRkKHRoaXMuZWRpdG9yLm9uTW91c2VMZWF2ZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmhvdmVyZWRTdG9yZS5jbGVhcigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuaG92ZXJlZFN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5ob3ZlcmVkU3ViamVjdCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0bW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoZSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgW2lkLCBkZWNvcmF0aW9uXSBvZiB0aGlzLmRlY29yYXRpb25JZHMpIHtcblx0XHRcdFx0XHRlLmNoYW5nZURlY29yYXRpb25PcHRpb25zKGlkLCBkZWNvcmF0aW9uLm9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogTmF2aWdhdGUgdG8gdGhlIG5leHQgbWlzc2VkICh1bmNvdmVyZWQpIGxpbmUgZnJvbSB0aGUgY3VycmVudCBjdXJzb3IgcG9zaXRpb24uXG5cdCAqIEByZXR1cm5zIHRydWUgaWYgbmF2aWdhdGlvbiBvY2N1cnJlZCwgZmFsc2UgaWYgbm8gbWlzc2VkIGxpbmUgd2FzIGZvdW5kXG5cdCAqL1xuXHRwdWJsaWMgZ29Ub05leHRNaXNzZWRMaW5lKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm5hdmlnYXRlVG9NaXNzZWRMaW5lKHRydWUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE5hdmlnYXRlIHRvIHRoZSBwcmV2aW91cyBtaXNzZWQgKHVuY292ZXJlZCkgbGluZSBmcm9tIHRoZSBjdXJyZW50IGN1cnNvciBwb3NpdGlvbi5cblx0ICogQHJldHVybnMgdHJ1ZSBpZiBuYXZpZ2F0aW9uIG9jY3VycmVkLCBmYWxzZSBpZiBubyBtaXNzZWQgbGluZSB3YXMgZm91bmRcblx0ICovXG5cdHB1YmxpYyBnb1RvUHJldmlvdXNNaXNzZWRMaW5lKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm5hdmlnYXRlVG9NaXNzZWRMaW5lKGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgbmF2aWdhdGVUb01pc3NlZExpbmUobmV4dDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0aWYgKCFtb2RlbCB8fCAhcG9zaXRpb24gfHwgIXRoaXMuZGV0YWlscykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnJlbnRMaW5lID0gcG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRsZXQgY2xvc2VzdEJlZm9yZTogeyBsaW5lTnVtYmVyOiBudW1iZXI7IHJhbmdlOiBSYW5nZSB9IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjbG9zZXN0QWZ0ZXI6IHsgbGluZU51bWJlcjogbnVtYmVyOyByYW5nZTogUmFuZ2UgfSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZmlyc3RNaXNzZWQ6IHsgbGluZU51bWJlcjogbnVtYmVyOyByYW5nZTogUmFuZ2UgfSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbGFzdE1pc3NlZDogeyBsaW5lTnVtYmVyOiBudW1iZXI7IHJhbmdlOiBSYW5nZSB9IHwgdW5kZWZpbmVkO1xuXG5cdFx0Ly8gRmluZCB0aGUgY2xvc2VzdCBtaXNzZWQgbGluZSBiZWZvcmUgYW5kIGFmdGVyIHRoZSBjdXJyZW50IHBvc2l0aW9uXG5cdFx0Zm9yIChjb25zdCBbLCB7IGRldGFpbCwgb3B0aW9ucyB9XSBvZiB0aGlzLmRlY29yYXRpb25JZHMpIHtcblx0XHRcdC8vIENoZWNrIGlmIHRoaXMgaXMgYSBtaXNzZWQgbGluZSAoQ0xBU1NfTUlTUyBpbiBsaW5lTnVtYmVyQ2xhc3NOYW1lKVxuXHRcdFx0aWYgKG9wdGlvbnMubGluZU51bWJlckNsYXNzTmFtZT8uaW5jbHVkZXMoQ0xBU1NfTUlTUykpIHtcblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBkZXRhaWwucmFuZ2U7XG5cdFx0XHRcdGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdGNvbnN0IG1pc3NlZExpbmUgPSB7IGxpbmVOdW1iZXIsIHJhbmdlIH07XG5cblx0XHRcdFx0Ly8gVHJhY2sgZmlyc3QgYW5kIGxhc3QgbWlzc2VkIGxpbmVzIGZvciB3cmFwLWFyb3VuZFxuXHRcdFx0XHRpZiAoIWZpcnN0TWlzc2VkIHx8IGxpbmVOdW1iZXIgPCBmaXJzdE1pc3NlZC5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0Zmlyc3RNaXNzZWQgPSBtaXNzZWRMaW5lO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghbGFzdE1pc3NlZCB8fCBsaW5lTnVtYmVyID4gbGFzdE1pc3NlZC5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0bGFzdE1pc3NlZCA9IG1pc3NlZExpbmU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBUcmFjayBjbG9zZXN0IGJlZm9yZSBhbmQgYWZ0ZXIgY3VycmVudCBsaW5lXG5cdFx0XHRcdGlmIChsaW5lTnVtYmVyIDwgY3VycmVudExpbmUpIHtcblx0XHRcdFx0XHRpZiAoIWNsb3Nlc3RCZWZvcmUgfHwgbGluZU51bWJlciA+IGNsb3Nlc3RCZWZvcmUubGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0Y2xvc2VzdEJlZm9yZSA9IG1pc3NlZExpbmU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGxpbmVOdW1iZXIgPiBjdXJyZW50TGluZSkge1xuXHRcdFx0XHRcdGlmICghY2xvc2VzdEFmdGVyIHx8IGxpbmVOdW1iZXIgPCBjbG9zZXN0QWZ0ZXIubGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0Y2xvc2VzdEFmdGVyID0gbWlzc2VkTGluZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEZXRlcm1pbmUgdGFyZ2V0IGxpbmUgYmFzZWQgb24gZGlyZWN0aW9uXG5cdFx0Y29uc3QgdGFyZ2V0TGluZSA9IG5leHRcblx0XHRcdD8gKGNsb3Nlc3RBZnRlciB8fCBmaXJzdE1pc3NlZCkgIC8vIE5leHQ6IGNsb3Nlc3QgYWZ0ZXIsIG9yIHdyYXAgdG8gZmlyc3Rcblx0XHRcdDogKGNsb3Nlc3RCZWZvcmUgfHwgbGFzdE1pc3NlZCk7ICAvLyBQcmV2aW91czogY2xvc2VzdCBiZWZvcmUsIG9yIHdyYXAgdG8gbGFzdFxuXG5cdFx0aWYgKHRhcmdldExpbmUpIHtcblx0XHRcdHRoaXMuZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbih0YXJnZXRMaW5lLmxpbmVOdW1iZXIsIDEpKTtcblx0XHRcdHRoaXMuZWRpdG9yLnJldmVhbExpbmVJbkNlbnRlcih0YXJnZXRMaW5lLmxpbmVOdW1iZXIpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhcHBseShtb2RlbDogSVRleHRNb2RlbCwgY292ZXJhZ2U6IEZpbGVDb3ZlcmFnZSwgdGVzdElkOiBUZXN0SWQgfCB1bmRlZmluZWQsIHNob3dJbmxpbmVCeURlZmF1bHQ6IGJvb2xlYW4sIHNob3dNaW5pbWFwOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgZGV0YWlscyA9IHRoaXMuZGV0YWlscyA9IGF3YWl0IHRoaXMubG9hZERldGFpbHMoY292ZXJhZ2UsIHRlc3RJZCwgbW9kZWwpO1xuXHRcdGlmICghZGV0YWlscykge1xuXHRcdFx0dGhpcy5oYXNJbmxpbmVDb3ZlcmFnZURldGFpbHMuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuIHRoaXMuY2xlYXIoKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgY29udGV4dCBrZXkgdG8gaW5kaWNhdGUgaW5saW5lIGNvdmVyYWdlIGRldGFpbHMgYXJlIGF2YWlsYWJsZVxuXHRcdHRoaXMuaGFzSW5saW5lQ292ZXJhZ2VEZXRhaWxzLnNldChkZXRhaWxzLnJhbmdlcy5sZW5ndGggPiAwLCB1bmRlZmluZWQpO1xuXG5cdFx0dGhpcy5kaXNwbGF5ZWRTdG9yZS5jbGVhcigpO1xuXG5cdFx0bW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGRldGFpbFJhbmdlIG9mIGRldGFpbHMucmFuZ2VzKSB7XG5cdFx0XHRcdGNvbnN0IHsgbWV0YWRhdGE6IHsgZGV0YWlsLCBkZXNjcmlwdGlvbiB9LCByYW5nZSwgcHJpbWFyeSB9ID0gZGV0YWlsUmFuZ2U7XG5cdFx0XHRcdGlmIChkZXRhaWwudHlwZSA9PT0gRGV0YWlsVHlwZS5CcmFuY2gpIHtcblx0XHRcdFx0XHRjb25zdCBoaXRzID0gZGV0YWlsLmRldGFpbC5icmFuY2hlcyFbZGV0YWlsLmJyYW5jaF0uY291bnQ7XG5cdFx0XHRcdFx0Y29uc3QgY2xzID0gaGl0cyA/IENMQVNTX0hJVCA6IENMQVNTX01JU1M7XG5cdFx0XHRcdFx0Ly8gZG9uJ3QgYm90aGVyIHNob3dpbmcgdGhlIG1pc3MgaW5kaWNhdG9yIGlmIHRoZSBjb25kaXRpb24gd2Fzbid0IGV4ZWN1dGVkIGF0IGFsbDpcblx0XHRcdFx0XHRjb25zdCBzaG93TWlzc0luZGljYXRvciA9ICFoaXRzICYmIHJhbmdlLmlzRW1wdHkoKSAmJiBkZXRhaWwuZGV0YWlsLmJyYW5jaGVzIS5zb21lKGIgPT4gYi5jb3VudCk7XG5cdFx0XHRcdFx0Y29uc3Qgb3B0aW9uczogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0XHRzaG93SWZDb2xsYXBzZWQ6IHNob3dNaXNzSW5kaWNhdG9yLCAvLyBvbmx5IGF2b2lkIGNvbGxhcHNpbmcgaWYgd2Ugd2FudCB0byBzaG93IHRoZSBtaXNzIGluZGljYXRvclxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdjb3ZlcmFnZS1ndXR0ZXInLFxuXHRcdFx0XHRcdFx0bGluZU51bWJlckNsYXNzTmFtZTogYGNvdmVyYWdlLWRlY28tZ3V0dGVyICR7Y2xzfWAsXG5cdFx0XHRcdFx0XHRtaW5pbWFwOiBzaG93TWluaW1hcCA/IHtcblx0XHRcdFx0XHRcdFx0Y29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoaGl0cyA/IHRlc3RpbmdDb3ZlcmVkTWluaW1hcEJhY2tncm91bmQgOiB0ZXN0aW5nVW5jb3ZlcmVkTWluaW1hcEJhY2tncm91bmQpLFxuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogTWluaW1hcFBvc2l0aW9uLkd1dHRlcixcblx0XHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdGNvbnN0IGFwcGx5SG92ZXJPcHRpb25zID0gKHRhcmdldDogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMpID0+IHtcblx0XHRcdFx0XHRcdHRhcmdldC5ob3Zlck1lc3NhZ2UgPSBkZXNjcmlwdGlvbjtcblx0XHRcdFx0XHRcdGlmIChzaG93TWlzc0luZGljYXRvcikge1xuXHRcdFx0XHRcdFx0XHR0YXJnZXQuYWZ0ZXIgPSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudDogJ1xceGEwJy5yZXBlYXQoQlJBTkNIX01JU1NfSU5ESUNBVE9SX0NIQVJTKSwgLy8gbmJzcFxuXHRcdFx0XHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogYGNvdmVyYWdlLWRlY28tYnJhbmNoLW1pc3MtaW5kaWNhdG9yICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKHRlc3RpbmdDb3ZlcmFnZU1pc3NpbmdCcmFuY2gpfWAsXG5cdFx0XHRcdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmc6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0Y3Vyc29yU3RvcHM6IEluamVjdGVkVGV4dEN1cnNvclN0b3BzLk5vbmUsXG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0YXJnZXQuY2xhc3NOYW1lID0gYGNvdmVyYWdlLWRlY28taW5saW5lICR7Y2xzfWA7XG5cdFx0XHRcdFx0XHRcdGlmIChwcmltYXJ5ICYmIHR5cGVvZiBoaXRzID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0XHRcdHRhcmdldC5iZWZvcmUgPSBjb3VudEJhZGdlKGhpdHMpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdGlmIChzaG93SW5saW5lQnlEZWZhdWx0KSB7XG5cdFx0XHRcdFx0XHRhcHBseUhvdmVyT3B0aW9ucyhvcHRpb25zKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLmRlY29yYXRpb25JZHMuc2V0KGUuYWRkRGVjb3JhdGlvbihyYW5nZSwgb3B0aW9ucyksIHsgb3B0aW9ucywgYXBwbHlIb3Zlck9wdGlvbnMsIGRldGFpbDogZGV0YWlsUmFuZ2UgfSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZGV0YWlsLnR5cGUgPT09IERldGFpbFR5cGUuU3RhdGVtZW50KSB7XG5cdFx0XHRcdFx0Y29uc3QgY2xzID0gZGV0YWlsLmNvdW50ID8gQ0xBU1NfSElUIDogQ0xBU1NfTUlTUztcblx0XHRcdFx0XHRjb25zdCBvcHRpb25zOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRcdHNob3dJZkNvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2NvdmVyYWdlLWlubGluZScsXG5cdFx0XHRcdFx0XHRsaW5lTnVtYmVyQ2xhc3NOYW1lOiBgY292ZXJhZ2UtZGVjby1ndXR0ZXIgJHtjbHN9YCxcblx0XHRcdFx0XHRcdG1pbmltYXA6IHNob3dNaW5pbWFwID8ge1xuXHRcdFx0XHRcdFx0XHRjb2xvcjogdGhlbWVDb2xvckZyb21JZChkZXRhaWwuY291bnQgPyB0ZXN0aW5nQ292ZXJlZE1pbmltYXBCYWNrZ3JvdW5kIDogdGVzdGluZ1VuY292ZXJlZE1pbmltYXBCYWNrZ3JvdW5kKSxcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246IE1pbmltYXBQb3NpdGlvbi5HdXR0ZXIsXG5cdFx0XHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRjb25zdCBhcHBseUhvdmVyT3B0aW9ucyA9ICh0YXJnZXQ6IElNb2RlbERlY29yYXRpb25PcHRpb25zKSA9PiB7XG5cdFx0XHRcdFx0XHR0YXJnZXQuY2xhc3NOYW1lID0gYGNvdmVyYWdlLWRlY28taW5saW5lICR7Y2xzfWA7XG5cdFx0XHRcdFx0XHR0YXJnZXQuaG92ZXJNZXNzYWdlID0gZGVzY3JpcHRpb247XG5cdFx0XHRcdFx0XHRpZiAocHJpbWFyeSAmJiB0eXBlb2YgZGV0YWlsLmNvdW50ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0XHR0YXJnZXQuYmVmb3JlID0gY291bnRCYWRnZShkZXRhaWwuY291bnQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRpZiAoc2hvd0lubGluZUJ5RGVmYXVsdCkge1xuXHRcdFx0XHRcdFx0YXBwbHlIb3Zlck9wdGlvbnMob3B0aW9ucyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5kZWNvcmF0aW9uSWRzLnNldChlLmFkZERlY29yYXRpb24ocmFuZ2UsIG9wdGlvbnMpLCB7IG9wdGlvbnMsIGFwcGx5SG92ZXJPcHRpb25zLCBkZXRhaWw6IGRldGFpbFJhbmdlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLmRpc3BsYXllZFN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0bW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoZSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgZGVjb3JhdGlvbiBvZiB0aGlzLmRlY29yYXRpb25JZHMua2V5cygpKSB7XG5cdFx0XHRcdFx0ZS5yZW1vdmVEZWNvcmF0aW9uKGRlY29yYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuZGVjb3JhdGlvbklkcy5jbGVhcigpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpIHtcblx0XHR0aGlzLmxvYWRpbmdDYW5jZWxsYXRpb24/LmNhbmNlbCgpO1xuXHRcdHRoaXMubG9hZGluZ0NhbmNlbGxhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmRpc3BsYXllZFN0b3JlLmNsZWFyKCk7XG5cdFx0dGhpcy5ob3ZlcmVkU3RvcmUuY2xlYXIoKTtcblx0XHR0aGlzLmhhc0lubGluZUNvdmVyYWdlRGV0YWlscy5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxvYWREZXRhaWxzKGNvdmVyYWdlOiBGaWxlQ292ZXJhZ2UsIHRlc3RJZDogVGVzdElkIHwgdW5kZWZpbmVkLCB0ZXh0TW9kZWw6IElUZXh0TW9kZWwpIHtcblx0XHRjb25zdCBjdHMgPSB0aGlzLmxvYWRpbmdDYW5jZWxsYXRpb24gPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLmRpc3BsYXllZFN0b3JlLmFkZCh0aGlzLmxvYWRpbmdDYW5jZWxsYXRpb24pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSB0ZXN0SWRcblx0XHRcdFx0PyBhd2FpdCBjb3ZlcmFnZS5kZXRhaWxzRm9yVGVzdCh0ZXN0SWQsIHRoaXMubG9hZGluZ0NhbmNlbGxhdGlvbi50b2tlbilcblx0XHRcdFx0OiBhd2FpdCBjb3ZlcmFnZS5kZXRhaWxzKHRoaXMubG9hZGluZ0NhbmNlbGxhdGlvbi50b2tlbik7XG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgQ292ZXJhZ2VEZXRhaWxzTW9kZWwoZGV0YWlscywgdGV4dE1vZGVsKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZy5lcnJvcignRXJyb3IgbG9hZGluZyBjb3ZlcmFnZSBkZXRhaWxzJywgZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5jb25zdCBjb3VudEJhZGdlID0gKGNvdW50OiBudW1iZXIpOiBJbmplY3RlZFRleHRPcHRpb25zIHwgdW5kZWZpbmVkID0+IHtcblx0aWYgKGNvdW50ID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0Y29udGVudDogYCR7Y291bnQgPiA5OSA/ICc5OSsnIDogY291bnR9eGAsXG5cdFx0Y3Vyc29yU3RvcHM6IEluamVjdGVkVGV4dEN1cnNvclN0b3BzLk5vbmUsXG5cdFx0aW5saW5lQ2xhc3NOYW1lOiBgY292ZXJhZ2UtZGVjby1pbmxpbmUtY291bnRgLFxuXHRcdGlubGluZUNsYXNzTmFtZUFmZmVjdHNMZXR0ZXJTcGFjaW5nOiB0cnVlLFxuXHR9O1xufTtcblxudHlwZSBDb3ZlcmFnZURldGFpbHNXaXRoQnJhbmNoID0gQ292ZXJhZ2VEZXRhaWxzIHwgeyB0eXBlOiBEZXRhaWxUeXBlLkJyYW5jaDsgYnJhbmNoOiBudW1iZXI7IGRldGFpbDogSVN0YXRlbWVudENvdmVyYWdlIH07XG50eXBlIERldGFpbFJhbmdlID0geyByYW5nZTogUmFuZ2U7IHByaW1hcnk6IGJvb2xlYW47IG1ldGFkYXRhOiB7IGRldGFpbDogQ292ZXJhZ2VEZXRhaWxzV2l0aEJyYW5jaDsgZGVzY3JpcHRpb246IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCB9IH07XG5cbmV4cG9ydCBjbGFzcyBDb3ZlcmFnZURldGFpbHNNb2RlbCB7XG5cdHB1YmxpYyByZWFkb25seSByYW5nZXM6IERldGFpbFJhbmdlW10gPSBbXTtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgZGV0YWlsczogQ292ZXJhZ2VEZXRhaWxzW10sIHRleHRNb2RlbDogSVRleHRNb2RlbCkge1xuXG5cdFx0Ly8jcmVnaW9uIGRlY29yYXRpb24gZ2VuZXJhdGlvblxuXHRcdC8vIENvdmVyYWdlIGZyb20gYSBwcm92aWRlciBjYW4gaGF2ZSBhIHJhbmdlIHRoYXQgY29udGFpbnMgc21hbGxlciByYW5nZXMsXG5cdFx0Ly8gc3VjaCBhcyBhIGZ1bmN0aW9uIGRlY2xhcmF0aW9uIHRoYXQgaGFzIG5lc3RlZCBzdGF0ZW1lbnRzLiBJbiB0aGlzIHdlXG5cdFx0Ly8gbWFrZSBzZXF1ZW50aWFsLCBub24tb3ZlcmxhcHBpbmcgcmFuZ2VzIGZvciBlYWNoIGRldGFpbCBmb3IgZGlzcGxheSBpblxuXHRcdC8vIHRoZSBlZGl0b3Igd2l0aG91dCB1Z2x5IG92ZXJsYXBzLlxuXHRcdGNvbnN0IGRldGFpbFJhbmdlczogRGV0YWlsUmFuZ2VbXSA9IGRldGFpbHMubWFwKGRldGFpbCA9PiAoe1xuXHRcdFx0cmFuZ2U6IHRpZHlMb2NhdGlvbihkZXRhaWwubG9jYXRpb24pLFxuXHRcdFx0cHJpbWFyeTogdHJ1ZSxcblx0XHRcdG1ldGFkYXRhOiB7IGRldGFpbCwgZGVzY3JpcHRpb246IHRoaXMuZGVzY3JpYmUoZGV0YWlsLCB0ZXh0TW9kZWwpIH1cblx0XHR9KSk7XG5cblx0XHRmb3IgKGNvbnN0IHsgcmFuZ2UsIG1ldGFkYXRhOiB7IGRldGFpbCB9IH0gb2YgZGV0YWlsUmFuZ2VzKSB7XG5cdFx0XHRpZiAoZGV0YWlsLnR5cGUgPT09IERldGFpbFR5cGUuU3RhdGVtZW50ICYmIGRldGFpbC5icmFuY2hlcykge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGRldGFpbC5icmFuY2hlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGJyYW5jaDogQ292ZXJhZ2VEZXRhaWxzV2l0aEJyYW5jaCA9IHsgdHlwZTogRGV0YWlsVHlwZS5CcmFuY2gsIGJyYW5jaDogaSwgZGV0YWlsIH07XG5cdFx0XHRcdFx0ZGV0YWlsUmFuZ2VzLnB1c2goe1xuXHRcdFx0XHRcdFx0cmFuZ2U6IHRpZHlMb2NhdGlvbihkZXRhaWwuYnJhbmNoZXNbaV0ubG9jYXRpb24gfHwgUmFuZ2UuZnJvbVBvc2l0aW9ucyhyYW5nZS5nZXRFbmRQb3NpdGlvbigpKSksXG5cdFx0XHRcdFx0XHRwcmltYXJ5OiB0cnVlLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdFx0ZGV0YWlsOiBicmFuY2gsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmRlc2NyaWJlKGJyYW5jaCwgdGV4dE1vZGVsKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyB0eXBlIG9yZGVyaW5nIGlzIGRvbmUgc28gdGhhdCBmdW5jdGlvbiBkZWNsYXJhdGlvbnMgY29tZSBmaXJzdCBvbiBhIHRpZSBzbyB0aGF0XG5cdFx0Ly8gc2luZ2xlLXN0YXRlbWVudCBmdW5jdGlvbnMgKGAoKSA9PiBmb28oKWAgZm9yIGV4YW1wbGUpIGdldCBpbmxpbmUgZGVjb3JhdGlvbnMuXG5cdFx0ZGV0YWlsUmFuZ2VzLnNvcnQoKGEsIGIpID0+IFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyhhLnJhbmdlLCBiLnJhbmdlKSB8fCBhLm1ldGFkYXRhLmRldGFpbC50eXBlIC0gYi5tZXRhZGF0YS5kZXRhaWwudHlwZSk7XG5cblx0XHRjb25zdCBzdGFjazogRGV0YWlsUmFuZ2VbXSA9IFtdO1xuXHRcdGNvbnN0IHJlc3VsdDogRGV0YWlsUmFuZ2VbXSA9IHRoaXMucmFuZ2VzID0gW107XG5cdFx0Y29uc3QgcG9wID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV4dCA9IHN0YWNrLnBvcCgpITtcblx0XHRcdGNvbnN0IHByZXYgPSBzdGFja1tzdGFjay5sZW5ndGggLSAxXTtcblx0XHRcdGlmIChwcmV2KSB7XG5cdFx0XHRcdHByZXYucmFuZ2UgPSBwcmV2LnJhbmdlLnNldFN0YXJ0UG9zaXRpb24obmV4dC5yYW5nZS5lbmRMaW5lTnVtYmVyLCBuZXh0LnJhbmdlLmVuZENvbHVtbik7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdC5wdXNoKG5leHQpO1xuXHRcdH07XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZGV0YWlsUmFuZ2VzKSB7XG5cdFx0XHQvLyAxLiBFbnN1cmUgdGhhdCBhbnkgcmFuZ2VzIGluIHRoZSBzdGFjayB0aGF0IGVuZGVkIGJlZm9yZSB0aGlzIGFyZSBmbHVzaGVkXG5cdFx0XHRjb25zdCBzdGFydCA9IGl0ZW0ucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdFx0d2hpbGUgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdPy5yYW5nZS5jb250YWluc1Bvc2l0aW9uKHN0YXJ0KSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0cG9wKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEVtcHR5IHJhbmdlcyAodXN1YWxseSByZXByZXNlbnRpbmcgbWlzc2luZyBicmFuY2hlcykgY2FuIGJlIGFkZGVkXG5cdFx0XHQvLyB3aXRob3V0IHdvcnJ5IGFib3V0IG92ZXJsYXkuXG5cdFx0XHRpZiAoaXRlbS5yYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goaXRlbSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyAyLiBUYWtlIHRoZSBsYXN0IChvdmVybGFwcGluZykgaXRlbSBpbiB0aGUgc3RhY2ssIHB1c2ggcmFuZ2UgYmVmb3JlXG5cdFx0XHQvLyB0aGUgYGl0ZW0ucmFuZ2VgIGludG8gdGhlIHJlc3VsdCBhbmQgbW9kaWZ5IGl0cyBzdGFjayB0byBwdXNoIHRoZSBzdGFydFxuXHRcdFx0Ly8gdW50aWwgYWZ0ZXIgdGhlIGBpdGVtLnJhbmdlYCBlbmRzLlxuXHRcdFx0Y29uc3QgcHJldiA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdO1xuXHRcdFx0aWYgKHByZXYpIHtcblx0XHRcdFx0Y29uc3QgcHJpbWFyeSA9IHByZXYucHJpbWFyeTtcblx0XHRcdFx0Y29uc3Qgc2kgPSBwcmV2LnJhbmdlLnNldEVuZFBvc2l0aW9uKHN0YXJ0LmxpbmVOdW1iZXIsIHN0YXJ0LmNvbHVtbik7XG5cdFx0XHRcdHByZXYucmFuZ2UgPSBwcmV2LnJhbmdlLnNldFN0YXJ0UG9zaXRpb24oaXRlbS5yYW5nZS5lbmRMaW5lTnVtYmVyLCBpdGVtLnJhbmdlLmVuZENvbHVtbik7XG5cdFx0XHRcdHByZXYucHJpbWFyeSA9IGZhbHNlO1xuXHRcdFx0XHQvLyBkaXNjYXJkIHRoZSBwcmV2aW91cyByYW5nZSBpZiBpdCBiZWNhbWUgZW1wdHksIGUuZy4gYSBuZXN0ZWQgc3RhdGVtZW50XG5cdFx0XHRcdGlmIChwcmV2LnJhbmdlLmlzRW1wdHkoKSkgeyBzdGFjay5wb3AoKTsgfVxuXHRcdFx0XHRyZXN1bHQucHVzaCh7IHJhbmdlOiBzaSwgcHJpbWFyeSwgbWV0YWRhdGE6IHByZXYubWV0YWRhdGEgfSk7XG5cdFx0XHR9XG5cblx0XHRcdHN0YWNrLnB1c2goaXRlbSk7XG5cdFx0fVxuXHRcdHdoaWxlIChzdGFjay5sZW5ndGgpIHtcblx0XHRcdHBvcCgpO1xuXHRcdH1cblx0XHQvLyNlbmRyZWdpb25cblx0fVxuXG5cdC8qKiBHZXRzIHRoZSBtYXJrZG93biBkZXNjcmlwdGlvbiBmb3IgdGhlIGdpdmVuIGRldGFpbCAqL1xuXHRwdWJsaWMgZGVzY3JpYmUoZGV0YWlsOiBDb3ZlcmFnZURldGFpbHNXaXRoQnJhbmNoLCBtb2RlbDogSVRleHRNb2RlbCk6IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGRldGFpbC50eXBlID09PSBEZXRhaWxUeXBlLkRlY2xhcmF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gbmFtZWREZXRhaWxMYWJlbChkZXRhaWwubmFtZSwgZGV0YWlsKTtcblx0XHR9IGVsc2UgaWYgKGRldGFpbC50eXBlID09PSBEZXRhaWxUeXBlLlN0YXRlbWVudCkge1xuXHRcdFx0Y29uc3QgdGV4dCA9IHdyYXBOYW1lKG1vZGVsLmdldFZhbHVlSW5SYW5nZSh0aWR5TG9jYXRpb24oZGV0YWlsLmxvY2F0aW9uKSkudHJpbSgpIHx8IGA8ZW1wdHkgc3RhdGVtZW50PmApO1xuXHRcdFx0aWYgKGRldGFpbC5icmFuY2hlcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGNvdmVyZWQgPSBkZXRhaWwuYnJhbmNoZXMuZmlsdGVyKGIgPT4gISFiLmNvdW50KS5sZW5ndGg7XG5cdFx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihsb2NhbGl6ZSgnY292ZXJhZ2UuYnJhbmNoZXMnLCAnezB9IG9mIHsxfSBvZiBicmFuY2hlcyBpbiB7Mn0gd2VyZSBjb3ZlcmVkLicsIGNvdmVyZWQsIGRldGFpbC5icmFuY2hlcy5sZW5ndGgsIHRleHQpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBuYW1lZERldGFpbExhYmVsKHRleHQsIGRldGFpbCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChkZXRhaWwudHlwZSA9PT0gRGV0YWlsVHlwZS5CcmFuY2gpIHtcblx0XHRcdGNvbnN0IHRleHQgPSB3cmFwTmFtZShtb2RlbC5nZXRWYWx1ZUluUmFuZ2UodGlkeUxvY2F0aW9uKGRldGFpbC5kZXRhaWwubG9jYXRpb24pKS50cmltKCkgfHwgYDxlbXB0eSBzdGF0ZW1lbnQ+YCk7XG5cdFx0XHRjb25zdCB7IGNvdW50LCBsYWJlbCB9ID0gZGV0YWlsLmRldGFpbC5icmFuY2hlcyFbZGV0YWlsLmJyYW5jaF07XG5cdFx0XHRjb25zdCBsYWJlbDIgPSBsYWJlbCA/IHdyYXBJbkJhY2t0aWNrcyhsYWJlbCkgOiBgIyR7ZGV0YWlsLmJyYW5jaCArIDF9YDtcblx0XHRcdGlmICghY291bnQpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdjb3ZlcmFnZS5icmFuY2hOb3RDb3ZlcmVkJywgJ0JyYW5jaCB7MH0gaW4gezF9IHdhcyBub3QgY292ZXJlZC4nLCBsYWJlbDIsIHRleHQpKTtcblx0XHRcdH0gZWxzZSBpZiAoY291bnQgPT09IHRydWUpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdjb3ZlcmFnZS5icmFuY2hDb3ZlcmVkWWVzJywgJ0JyYW5jaCB7MH0gaW4gezF9IHdhcyBleGVjdXRlZC4nLCBsYWJlbDIsIHRleHQpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihsb2NhbGl6ZSgnY292ZXJhZ2UuYnJhbmNoQ292ZXJlZCcsICdCcmFuY2ggezB9IGluIHsxfSB3YXMgZXhlY3V0ZWQgezJ9IHRpbWUocykuJywgbGFiZWwyLCB0ZXh0LCBjb3VudCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGFzc2VydE5ldmVyKGRldGFpbCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gbmFtZWREZXRhaWxMYWJlbChuYW1lOiBzdHJpbmcsIGRldGFpbDogSVN0YXRlbWVudENvdmVyYWdlIHwgSURlY2xhcmF0aW9uQ292ZXJhZ2UpIHtcblx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKFxuXHRcdCFkZXRhaWwuY291bnQgLy8gMCBvciBmYWxzZVxuXHRcdFx0PyBsb2NhbGl6ZSgnY292ZXJhZ2UuZGVjbEV4ZWN1dGVkTm8nLCAnYHswfWAgd2FzIG5vdCBleGVjdXRlZC4nLCBuYW1lKVxuXHRcdFx0OiB0eXBlb2YgZGV0YWlsLmNvdW50ID09PSAnbnVtYmVyJ1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdjb3ZlcmFnZS5kZWNsRXhlY3V0ZWRDb3VudCcsICdgezB9YCB3YXMgZXhlY3V0ZWQgezF9IHRpbWUocykuJywgbmFtZSwgZGV0YWlsLmNvdW50KVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjb3ZlcmFnZS5kZWNsRXhlY3V0ZWRZZXMnLCAnYHswfWAgd2FzIGV4ZWN1dGVkLicsIG5hbWUpXG5cdCk7XG59XG5cbi8vICd0aWRpZXMnIHRoZSByYW5nZSBieSBub3JtYWxpemluZyBpdCBpbnRvIGEgcmFuZ2UgYW5kIHJlbW92aW5nIGxlYWRpbmdcbi8vIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlLlxuZnVuY3Rpb24gdGlkeUxvY2F0aW9uKGxvY2F0aW9uOiBSYW5nZSB8IFBvc2l0aW9uKTogUmFuZ2Uge1xuXHRpZiAobG9jYXRpb24gaW5zdGFuY2VvZiBQb3NpdGlvbikge1xuXHRcdHJldHVybiBSYW5nZS5mcm9tUG9zaXRpb25zKGxvY2F0aW9uLCBuZXcgUG9zaXRpb24obG9jYXRpb24ubGluZU51bWJlciwgMHg3RkZGRkZGRikpO1xuXHR9XG5cblx0cmV0dXJuIGxvY2F0aW9uO1xufVxuXG5mdW5jdGlvbiB3cmFwSW5CYWNrdGlja3Moc3RyOiBzdHJpbmcpIHtcblx0cmV0dXJuICdgJyArIHN0ci5yZXBsYWNlKC9bXFxuXFxyYF0vZywgJycpICsgJ2AnO1xufVxuXG5mdW5jdGlvbiB3cmFwTmFtZShmdW5jdGlvbk5hbWVPckNvZGU6IHN0cmluZykge1xuXHRpZiAoZnVuY3Rpb25OYW1lT3JDb2RlLmxlbmd0aCA+IDUwKSB7XG5cdFx0ZnVuY3Rpb25OYW1lT3JDb2RlID0gZnVuY3Rpb25OYW1lT3JDb2RlLnNsaWNlKDAsIDQwKSArICcuLi4nO1xuXHR9XG5cdHJldHVybiB3cmFwSW5CYWNrdGlja3MoZnVuY3Rpb25OYW1lT3JDb2RlKTtcbn1cblxuY2xhc3MgQ292ZXJhZ2VUb29sYmFyV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElPdmVybGF5V2lkZ2V0IHtcblx0cHJpdmF0ZSBjdXJyZW50OiB7IGNvdmVyYWdlOiBGaWxlQ292ZXJhZ2U7IHRlc3RJZDogVGVzdElkIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVnaXN0ZXJlZCA9IGZhbHNlO1xuXHRwcml2YXRlIGlzUnVubmluZyA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNob3dTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGUgPSBkb20uaCgnZGl2LmNvdmVyYWdlLXN1bW1hcnktd2lkZ2V0JywgW1xuXHRcdGRvbS5oKCdkaXYnLCBbXG5cdFx0XHRkb20uaCgnc3Bhbi5iYXJzQGJhcnMnKSxcblx0XHRcdGRvbS5oKCdzcGFuLnRvb2xiYXJAdG9vbGJhcicpLFxuXHRcdF0pLFxuXHRdKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGJhcnM6IE1hbmFnZWRUZXN0Q292ZXJhZ2VCYXJzO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASVRlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVzdFNlcnZpY2U6IElUZXN0U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVRlc3RDb3ZlcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb3ZlcmFnZTogSVRlc3RDb3ZlcmFnZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuYmFycyA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYW5hZ2VkVGVzdENvdmVyYWdlQmFycywge1xuXHRcdFx0Y29tcGFjdDogZmFsc2UsXG5cdFx0XHRvdmVyYWxsOiBmYWxzZSxcblx0XHRcdGNvbnRhaW5lcjogdGhpcy5fZG9tTm9kZS5iYXJzLFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuYWN0aW9uQmFyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFjdGlvbkJhciwgdGhpcy5fZG9tTm9kZS50b29sYmFyLCB7XG5cdFx0XHRvcmllbnRhdGlvbjogQWN0aW9uc09yaWVudGF0aW9uLkhPUklaT05UQUwsXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBBY3Rpb25XaXRoSWNvbikge1xuXHRcdFx0XHRcdGlmIChhY3Rpb24uaWNvbk9ubHkpIHtcblx0XHRcdFx0XHRcdGFjdGlvbi5jbGFzcyA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShhY3Rpb24uaWNvbik7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IEFjdGlvblZpZXdJdGVtKHVuZGVmaW5lZCwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGxhYmVsOiBmYWxzZSwgaWNvbjogdHJ1ZSB9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCB2bSA9IG5ldyBDb2RpY29uQWN0aW9uVmlld0l0ZW0odW5kZWZpbmVkLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0XHRcdHZtLnRoZW1lSWNvbiA9IGFjdGlvbi5pY29uO1xuXHRcdFx0XHRcdHJldHVybiB2bTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb3ZlcmFnZS5zaG93SW5saW5lLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuc2V0QWN0aW9ucygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kb21Ob2RlLnJvb3QsIGRvbS5FdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBlID0+IHtcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdG1lbnVJZDogTWVudUlkLlN0aWNreVNjcm9sbENvbnRleHQsXG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgZ2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ2NvdmVyYWdlLXN1bW1hcnktd2lkZ2V0Jztcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgZ2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGUucm9vdDtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgZ2V0UG9zaXRpb24oKTogSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcmVmZXJlbmNlOiBPdmVybGF5V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLlRPUF9DRU5URVIsXG5cdFx0XHRzdGFja09yZGluYWw6IDksXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBjbGVhckNvdmVyYWdlKCkge1xuXHRcdHRoaXMuY3VycmVudCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmJhcnMuc2V0Q292ZXJhZ2VJbmZvKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5oaWRlKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q292ZXJhZ2UoY292ZXJhZ2U6IEZpbGVDb3ZlcmFnZSwgdGVzdElkOiBUZXN0SWQgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLmN1cnJlbnQgPSB7IGNvdmVyYWdlLCB0ZXN0SWQgfTtcblx0XHR0aGlzLmJhcnMuc2V0Q292ZXJhZ2VJbmZvKGNvdmVyYWdlKTtcblxuXHRcdGlmICghY292ZXJhZ2UpIHtcblx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNldEFjdGlvbnMoKTtcblx0XHRcdHRoaXMuc2hvdygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0QWN0aW9ucygpIHtcblx0XHR0aGlzLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLmN1cnJlbnQ7XG5cdFx0aWYgKCFjdXJyZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9nZ2xlQWN0aW9uID0gbmV3IEFjdGlvbldpdGhJY29uKFxuXHRcdFx0J3RvZ2dsZUlubGluZScsXG5cdFx0XHR0aGlzLmNvdmVyYWdlLnNob3dJbmxpbmUuZ2V0KClcblx0XHRcdFx0PyBsb2NhbGl6ZSgndGVzdGluZy5oaWRlSW5saW5lQ292ZXJhZ2UnLCAnSGlkZSBJbmxpbmUnKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCd0ZXN0aW5nLnNob3dJbmxpbmVDb3ZlcmFnZScsICdTaG93IElubGluZScpLFxuXHRcdFx0dGVzdGluZ0NvdmVyYWdlUmVwb3J0LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KCkgPT4gdGhpcy5jb3ZlcmFnZS5zaG93SW5saW5lLnNldCghdGhpcy5jb3ZlcmFnZS5zaG93SW5saW5lLmdldCgpLCB1bmRlZmluZWQpLFxuXHRcdCk7XG5cblx0XHR0b2dnbGVBY3Rpb24udG9vbHRpcCA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyhUT0dHTEVfSU5MSU5FX0NPTU1BTkRfVEVYVCwgVE9HR0xFX0lOTElORV9DT01NQU5EX0lEKTtcblxuXHRcdGNvbnN0IGhhc1VuY292ZXJlZFN0bXQgPSBjdXJyZW50LmNvdmVyYWdlLnN0YXRlbWVudC5jb3ZlcmVkIDwgY3VycmVudC5jb3ZlcmFnZS5zdGF0ZW1lbnQudG90YWw7XG5cdFx0Ly8gTmF2aWdhdGlvbiBidXR0b25zIGZvciBtaXNzZWQgY292ZXJhZ2UgbGluZXNcblx0XHR0aGlzLmFjdGlvbkJhci5wdXNoKG5ldyBBY3Rpb25XaXRoSWNvbihcblx0XHRcdCdnb1RvUHJldmlvdXNNaXNzZWQnLFxuXHRcdFx0R09fVE9fUFJFVklPVVNfTUlTU0VEX0xJTkVfVElUTEUudmFsdWUsXG5cdFx0XHRDb2RpY29uLmFycm93VXAsXG5cdFx0XHRoYXNVbmNvdmVyZWRTdG10LFxuXHRcdFx0KCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChUZXN0Q29tbWFuZElkLkNvdmVyYWdlR29Ub1ByZXZpb3VzTWlzc2VkTGluZSksXG5cdFx0XHR0cnVlLFxuXHRcdCkpO1xuXG5cdFx0dGhpcy5hY3Rpb25CYXIucHVzaChuZXcgQWN0aW9uV2l0aEljb24oXG5cdFx0XHQnZ29Ub05leHRNaXNzZWQnLFxuXHRcdFx0R09fVE9fTkVYVF9NSVNTRURfTElORV9USVRMRS52YWx1ZSxcblx0XHRcdENvZGljb24uYXJyb3dEb3duLFxuXHRcdFx0aGFzVW5jb3ZlcmVkU3RtdCxcblx0XHRcdCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoVGVzdENvbW1hbmRJZC5Db3ZlcmFnZUdvVG9OZXh0TWlzc2VkTGluZSksXG5cdFx0XHR0cnVlLFxuXHRcdCkpO1xuXG5cdFx0dGhpcy5hY3Rpb25CYXIucHVzaCh0b2dnbGVBY3Rpb24pO1xuXG5cdFx0aWYgKGN1cnJlbnQudGVzdElkKSB7XG5cdFx0XHRjb25zdCB0ZXN0SXRlbSA9IGN1cnJlbnQuY292ZXJhZ2UuZnJvbVJlc3VsdC5nZXRUZXN0QnlJZChjdXJyZW50LnRlc3RJZC50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydCghIXRlc3RJdGVtLCAnZ290IGNvdmVyYWdlIGZvciBhbiB1bnJlcG9ydGVkIHRlc3QnKTtcblx0XHRcdHRoaXMuYWN0aW9uQmFyLnB1c2gobmV3IEFjdGlvbldpdGhJY29uKCdwZXJUZXN0RmlsdGVyJyxcblx0XHRcdFx0Y292ZXJVdGlscy5sYWJlbHMuc2hvd2luZ0ZpbHRlckZvcih0ZXN0SXRlbS5sYWJlbCksXG5cdFx0XHRcdHRlc3RpbmdGaWx0ZXJJY29uLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoVGVzdENvbW1hbmRJZC5Db3ZlcmFnZUZpbHRlclRvVGVzdEluRWRpdG9yLCB0aGlzLmN1cnJlbnQsIHRoaXMuZWRpdG9yKSxcblx0XHRcdCkpO1xuXHRcdH0gZWxzZSBpZiAoY3VycmVudC5jb3ZlcmFnZS5wZXJUZXN0RGF0YT8uc2l6ZSkge1xuXHRcdFx0dGhpcy5hY3Rpb25CYXIucHVzaChuZXcgQWN0aW9uV2l0aEljb24oJ3BlclRlc3RGaWx0ZXInLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5jb3ZlcmFnZUZvclRlc3RBdmFpbGFibGUnLCBcInswfSB0ZXN0KHMpIHJhbiBjb2RlIGluIHRoaXMgZmlsZVwiLCBjdXJyZW50LmNvdmVyYWdlLnBlclRlc3REYXRhLnNpemUpLFxuXHRcdFx0XHR0ZXN0aW5nRmlsdGVySWNvbixcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHQoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFRlc3RDb21tYW5kSWQuQ292ZXJhZ2VGaWx0ZXJUb1Rlc3RJbkVkaXRvciwgdGhpcy5jdXJyZW50LCB0aGlzLmVkaXRvciksXG5cdFx0XHQpKTtcblx0XHR9XG5cblx0XHR0aGlzLmFjdGlvbkJhci5wdXNoKG5ldyBBY3Rpb25XaXRoSWNvbihcblx0XHRcdCdyZXJ1bicsXG5cdFx0XHRsb2NhbGl6ZSgndGVzdGluZy5yZXJ1bicsICdSZXJ1bicpLFxuXHRcdFx0dGVzdGluZ1JlcnVuSWNvbixcblx0XHRcdCF0aGlzLmlzUnVubmluZyxcblx0XHRcdCgpID0+IHRoaXMucmVydW5UZXN0KClcblx0XHQpKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdygpIHtcblx0XHRpZiAodGhpcy5yZWdpc3RlcmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yZWdpc3RlcmVkID0gdHJ1ZTtcblx0XHRsZXQgdmlld1pvbmVJZDogc3RyaW5nO1xuXHRcdGNvbnN0IGRzID0gdGhpcy5zaG93U3RvcmU7XG5cblx0XHR0aGlzLmVkaXRvci5hZGRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHRcdHRoaXMuZWRpdG9yLmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdFx0XHR2aWV3Wm9uZUlkID0gYWNjZXNzb3IuYWRkWm9uZSh7IC8vIG1ha2Ugc3BhY2UgZm9yIHRoZSB3aWRnZXRcblx0XHRcdFx0YWZ0ZXJMaW5lTnVtYmVyOiAwLFxuXHRcdFx0XHRhZnRlckNvbHVtbjogMCxcblx0XHRcdFx0ZG9tTm9kZTogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JyksXG5cdFx0XHRcdGhlaWdodEluUHg6IDMwLFxuXHRcdFx0XHRvcmRpbmFsOiAtMSwgLy8gc2hvdyBiZWZvcmUgY29kZSBsZW5zZXNcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0ZHMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuZWRpdG9yLnJlbW92ZU92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdFx0XHR0aGlzLmVkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVab25lKHZpZXdab25lSWQpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0ZHMuYWRkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKHRoaXMuY3VycmVudCAmJiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXN0aW5nQ29uZmlnS2V5cy5Db3ZlcmFnZUJhclRocmVzaG9sZHMpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVzdGluZ0NvbmZpZ0tleXMuQ292ZXJhZ2VQZXJjZW50KSkpIHtcblx0XHRcdFx0dGhpcy5zZXRDb3ZlcmFnZSh0aGlzLmN1cnJlbnQuY292ZXJhZ2UsIHRoaXMuY3VycmVudC50ZXN0SWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVydW5UZXN0KCkge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLmN1cnJlbnQ7XG5cdFx0aWYgKGN1cnJlbnQpIHtcblx0XHRcdHRoaXMuaXNSdW5uaW5nID0gdHJ1ZTtcblx0XHRcdHRoaXMuc2V0QWN0aW9ucygpO1xuXHRcdFx0dGhpcy50ZXN0U2VydmljZS5ydW5SZXNvbHZlZFRlc3RzKGN1cnJlbnQuY292ZXJhZ2UuZnJvbVJlc3VsdC5yZXF1ZXN0KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0dGhpcy5pc1J1bm5pbmcgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5zZXRBY3Rpb25zKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhpZGUoKSB7XG5cdFx0dGhpcy5zaG93U3RvcmUuY2xlYXIoKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVG9nZ2xlSW5saW5lQ292ZXJhZ2UgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRPR0dMRV9JTkxJTkVfQ09NTUFORF9JRCxcblx0XHRcdC8vIG5vdGU6IGlkZWFsbHkgdGhpcyB3b3VsZCBiZSBcInNob3cgaW5saW5lXCIsIGJ1dCB0aGUgY29tbWFuZCBwYWxldHRlIGRvZXNcblx0XHRcdC8vIG5vdCB1c2UgdGhlICd0b2dnbGVkJyB0aXRsZXMsIHNvIHdlIG5lZWQgdG8gbWFrZSB0aGlzIGdlbmVyaWMuXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjb3ZlcmFnZS50b2dnbGVJbmxpbmUnLCBcIlRvZ2dsZSBJbmxpbmUgQ292ZXJhZ2VcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5UZXN0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNlbWljb2xvbiwgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUkpLFxuXHRcdFx0fSxcblx0XHRcdHRvZ2dsZWQ6IHtcblx0XHRcdFx0Y29uZGl0aW9uOiBUZXN0aW5nQ29udGV4dEtleXMuaW5saW5lQ292ZXJhZ2VFbmFibGVkLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NvdmVyYWdlLmhpZGVJbmxpbmUnLCBcIkhpZGUgSW5saW5lIENvdmVyYWdlXCIpLFxuXHRcdFx0fSxcblx0XHRcdGljb246IHRlc3RpbmdDb3ZlcmFnZVJlcG9ydCxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0eyBpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLCB3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMuaXNUZXN0Q292ZXJhZ2VPcGVuIH0sXG5cdFx0XHRcdHsgaWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSwgd2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFRlc3RpbmdDb250ZXh0S2V5cy5oYXNJbmxpbmVDb3ZlcmFnZURldGFpbHMsIFRlc3RpbmdDb250ZXh0S2V5cy5jb3ZlcmFnZVRvb2xiYXJFbmFibGVkLm5vdEVxdWFsc1RvKHRydWUpKSwgZ3JvdXA6ICduYXZpZ2F0aW9uJyB9LFxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvdmVyYWdlID0gYWNjZXNzb3IuZ2V0KElUZXN0Q292ZXJhZ2VTZXJ2aWNlKTtcblx0XHRjb3ZlcmFnZS5zaG93SW5saW5lLnNldCghY292ZXJhZ2Uuc2hvd0lubGluZS5nZXQoKSwgdW5kZWZpbmVkKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVDb3ZlcmFnZVRvb2xiYXIgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuQ292ZXJhZ2VUb2dnbGVUb29sYmFyLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy50b2dnbGVUb29sYmFyVGl0bGUnLCBcIlNob3cgVGVzdCBDb3ZlcmFnZSBUb29sYmFyXCIpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMigndGVzdGluZy50b2dnbGVUb29sYmFyRGVzYycsICdUb2dnbGUgdGhlIHN0aWNreSBjb3ZlcmFnZSBiYXIgaW4gdGhlIGVkaXRvci4nKVxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlRlc3QsXG5cdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdGNvbmRpdGlvbjogVGVzdGluZ0NvbnRleHRLZXlzLmNvdmVyYWdlVG9vbGJhckVuYWJsZWQsXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7IGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5pc1Rlc3RDb3ZlcmFnZU9wZW4gfSxcblx0XHRcdFx0eyBpZDogTWVudUlkLlN0aWNreVNjcm9sbENvbnRleHQsIHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5pc1Rlc3RDb3ZlcmFnZU9wZW4gfSxcblx0XHRcdFx0eyBpZDogTWVudUlkLkVkaXRvclRpdGxlLCB3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMuaGFzQ292ZXJhZ2VJbkZpbGUsIGdyb3VwOiAnY292ZXJhZ2UnLCBvcmRlcjogMSB9LFxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlnID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgdmFsdWUgPSBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbihjb25maWcsIFRlc3RpbmdDb25maWdLZXlzLkNvdmVyYWdlVG9vbGJhckVuYWJsZWQpO1xuXHRcdGNvbmZpZy51cGRhdGVWYWx1ZShUZXN0aW5nQ29uZmlnS2V5cy5Db3ZlcmFnZVRvb2xiYXJFbmFibGVkLCAhdmFsdWUpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZpbHRlckNvdmVyYWdlVG9UZXN0SW5FZGl0b3IgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuQ292ZXJhZ2VGaWx0ZXJUb1Rlc3RJbkVkaXRvcixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuZmlsdGVyQWN0aW9uTGFiZWwnLCBcIkZpbHRlciBDb3ZlcmFnZSB0byBUZXN0XCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVGVzdCxcblx0XHRcdGljb246IENvZGljb24uZmlsdGVyLFxuXHRcdFx0dG9nZ2xlZDoge1xuXHRcdFx0XHRpY29uOiBDb2RpY29uLmZpbHRlckZpbGxlZCxcblx0XHRcdFx0Y29uZGl0aW9uOiBUZXN0aW5nQ29udGV4dEtleXMuaXNDb3ZlcmFnZUZpbHRlcmVkVG9UZXN0LFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmhhc0NvdmVyYWdlSW5GaWxlLFxuXHRcdFx0XHRcdFx0VGVzdGluZ0NvbnRleHRLZXlzLmNvdmVyYWdlVG9vbGJhckVuYWJsZWQubm90RXF1YWxzVG8odHJ1ZSksXG5cdFx0XHRcdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuaGFzUGVyVGVzdENvdmVyYWdlLFxuXHRcdFx0XHRcdFx0QWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oVEVYVF9GSUxFX0VESVRPUl9JRCksXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb3ZlcmFnZU9yVXJpPzogRmlsZUNvdmVyYWdlIHwgVVJJLCBlZGl0b3I/OiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IHRlc3RDb3ZlcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlc3RDb3ZlcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBpc0NvZGVFZGl0b3IoZWRpdG9yKSA/IGVkaXRvciA6IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpLmdldEFjdGl2ZUNvZGVFZGl0b3IoKTtcblx0XHRsZXQgY292ZXJhZ2U6IEZpbGVDb3ZlcmFnZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoY292ZXJhZ2VPclVyaSBpbnN0YW5jZW9mIEZpbGVDb3ZlcmFnZSkge1xuXHRcdFx0Y292ZXJhZ2UgPSBjb3ZlcmFnZU9yVXJpO1xuXHRcdH0gZWxzZSBpZiAoaXNVcmlDb21wb25lbnRzKGNvdmVyYWdlT3JVcmkpKSB7XG5cdFx0XHRjb3ZlcmFnZSA9IHRlc3RDb3ZlcmFnZVNlcnZpY2Uuc2VsZWN0ZWQuZ2V0KCk/LmdldFVyaShVUkkuZnJvbShjb3ZlcmFnZU9yVXJpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHVyaSA9IGFjdGl2ZUVkaXRvcj8uZ2V0TW9kZWwoKT8udXJpO1xuXHRcdFx0Y292ZXJhZ2UgPSB1cmkgJiYgdGVzdENvdmVyYWdlU2VydmljZS5zZWxlY3RlZC5nZXQoKT8uZ2V0VXJpKHVyaSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFjb3ZlcmFnZSB8fCAhY292ZXJhZ2UucGVyVGVzdERhdGE/LnNpemUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXN0cyA9IFsuLi5jb3ZlcmFnZS5wZXJUZXN0RGF0YV0ubWFwKFRlc3RJZC5mcm9tU3RyaW5nKTtcblx0XHRjb25zdCBjb21tb25QcmVmaXggPSBUZXN0SWQuZ2V0TGVuZ3RoT2ZDb21tb25QcmVmaXgodGVzdHMubGVuZ3RoLCBpID0+IHRlc3RzW2ldKTtcblx0XHRjb25zdCByZXN1bHQgPSBjb3ZlcmFnZS5mcm9tUmVzdWx0O1xuXHRcdGNvbnN0IHByZXZpb3VzU2VsZWN0aW9uID0gdGVzdENvdmVyYWdlU2VydmljZS5maWx0ZXJUb1Rlc3QuZ2V0KCk7XG5cblx0XHR0eXBlIFRJdGVtID0geyBsYWJlbDogc3RyaW5nOyBkZXNjcmlwdGlvbj86IHN0cmluZzsgdGVzdElkOiBUZXN0SWQgfCB1bmRlZmluZWQ7IGJ1dHRvbnM/OiBJUXVpY2tJbnB1dEJ1dHRvbltdIH07XG5cblx0XHRjb25zdCBidXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW3tcblx0XHRcdGljb25DbGFzczogJ2NvZGljb24tZ28tdG8tZmlsZScsXG5cdFx0XHR0b29sdGlwOiAnR28gdG8gVGVzdCcsXG5cdFx0fV07XG5cdFx0Y29uc3QgaXRlbXM6IFF1aWNrUGlja0lucHV0PFRJdGVtPltdID0gW1xuXHRcdFx0eyBsYWJlbDogY292ZXJVdGlscy5sYWJlbHMuYWxsVGVzdHMsIHRlc3RJZDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IHR5cGU6ICdzZXBhcmF0b3InIH0sXG5cdFx0XHQuLi50ZXN0cy5tYXAoaWQgPT4gKHsgLi4uY292ZXJVdGlscy5nZXRMYWJlbEZvckl0ZW0ocmVzdWx0LCBpZCwgY29tbW9uUHJlZml4KSwgdGVzdElkOiBpZCwgYnV0dG9ucyB9KSksXG5cdFx0XTtcblxuXHRcdC8vIFRoZXNlIGhhbmRsZSB0aGUgYmVoYXZpb3IgdGhhdCByZXZlYWxzIHRoZSBzdGFydCBvZiBjb3ZlcmFnZSB3aGVuIHRoZVxuXHRcdC8vIHVzZXIgcGlja3MgZnJvbSB0aGUgcXVpY2twaWNrLiBTY3JvbGwgcG9zaXRpb24gaXMgcmVzdG9yZWQgaWYgdGhlIHVzZXJcblx0XHQvLyBleGl0cyB3aXRob3V0IHBpY2tpbmcgYW4gaXRlbSwgb3IgcGlja3MgXCJhbGwgdGVzdHNcIi5cblx0XHRjb25zdCBzY3JvbGxUb3AgPSBhY3RpdmVFZGl0b3I/LmdldFNjcm9sbFRvcCgpIHx8IDA7XG5cdFx0Y29uc3QgcmV2ZWFsU2Nyb2xsQ3RzID0gbmV3IE11dGFibGVEaXNwb3NhYmxlPENhbmNlbGxhdGlvblRva2VuU291cmNlPigpO1xuXG5cdFx0cXVpY2tJbnB1dFNlcnZpY2UucGljayhpdGVtcywge1xuXHRcdFx0YWN0aXZlSXRlbTogaXRlbXMuZmluZCgoaXRlbSk6IGl0ZW0gaXMgVEl0ZW0gPT4gJ3Rlc3RJZCcgaW4gaXRlbSAmJiBpdGVtLnRlc3RJZD8udG9TdHJpbmcoKSA9PT0gcHJldmlvdXNTZWxlY3Rpb24/LnRvU3RyaW5nKCkpLFxuXHRcdFx0cGxhY2VIb2xkZXI6IGNvdmVyVXRpbHMubGFiZWxzLnBpY2tTaG93Q292ZXJhZ2UsXG5cdFx0XHRvbkRpZFRyaWdnZXJJdGVtQnV0dG9uOiAoY29udGV4dCkgPT4ge1xuXHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgndnNjb2RlLnJldmVhbFRlc3QnLCBjb250ZXh0Lml0ZW0udGVzdElkPy50b1N0cmluZygpKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZEZvY3VzOiAoZW50cnkpID0+IHtcblx0XHRcdFx0aWYgKCFlbnRyeS50ZXN0SWQpIHtcblx0XHRcdFx0XHRyZXZlYWxTY3JvbGxDdHMuY2xlYXIoKTtcblx0XHRcdFx0XHRhY3RpdmVFZGl0b3I/LnNldFNjcm9sbFRvcChzY3JvbGxUb3ApO1xuXHRcdFx0XHRcdHRlc3RDb3ZlcmFnZVNlcnZpY2UuZmlsdGVyVG9UZXN0LnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgY3RzID0gcmV2ZWFsU2Nyb2xsQ3RzLnZhbHVlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRcdFx0Y292ZXJhZ2UuZGV0YWlsc0ZvclRlc3QoZW50cnkudGVzdElkLCBjdHMudG9rZW4pLnRoZW4oXG5cdFx0XHRcdFx0XHRkZXRhaWxzID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZmlyc3QgPSBkZXRhaWxzLmZpbmQoZCA9PiBkLnR5cGUgPT09IERldGFpbFR5cGUuU3RhdGVtZW50KTtcblx0XHRcdFx0XHRcdFx0aWYgKCFjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgJiYgZmlyc3QpIHtcblx0XHRcdFx0XHRcdFx0XHRhY3RpdmVFZGl0b3I/LnJldmVhbExpbmVOZWFyVG9wKGZpcnN0LmxvY2F0aW9uIGluc3RhbmNlb2YgUG9zaXRpb24gPyBmaXJzdC5sb2NhdGlvbi5saW5lTnVtYmVyIDogZmlyc3QubG9jYXRpb24uc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdCgpID0+IHsgLyogaWdub3JlZCAqLyB9XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR0ZXN0Q292ZXJhZ2VTZXJ2aWNlLmZpbHRlclRvVGVzdC5zZXQoZW50cnkudGVzdElkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pLnRoZW4oc2VsZWN0ZWQgPT4ge1xuXHRcdFx0aWYgKCFzZWxlY3RlZCkge1xuXHRcdFx0XHRhY3RpdmVFZGl0b3I/LnNldFNjcm9sbFRvcChzY3JvbGxUb3ApO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXZlYWxTY3JvbGxDdHMuZGlzcG9zZSgpO1xuXHRcdFx0dGVzdENvdmVyYWdlU2VydmljZS5maWx0ZXJUb1Rlc3Quc2V0KHNlbGVjdGVkID8gc2VsZWN0ZWQudGVzdElkIDogcHJldmlvdXNTZWxlY3Rpb24sIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVG9nZ2xlQ292ZXJhZ2VJbkV4cGxvcmVyIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkNvdmVyYWdlVG9nZ2xlSW5FeHBsb3Jlcixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcudG9nZ2xlQ292ZXJhZ2VJbkV4cGxvcmVyVGl0bGUnLCBcIlRvZ2dsZSBDb3ZlcmFnZSBpbiBFeHBsb3JlclwiKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcudG9nZ2xlQ292ZXJhZ2VJbkV4cGxvcmVyRGVzYycsICdUb2dnbGUgdGhlIGRpc3BsYXkgb2YgdGVzdCBjb3ZlcmFnZSBpbiB0aGUgRmlsZSBFeHBsb3JlciB2aWV3LicpXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVGVzdCxcblx0XHRcdHRvZ2dsZWQ6IHtcblx0XHRcdFx0Y29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy50ZXN0aW5nLnNob3dDb3ZlcmFnZUluRXhwbG9yZXInLCB0cnVlKSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd0ZXN0aW5nLmhpZGVDb3ZlcmFnZUluRXhwbG9yZXInLCBcIkhpZGUgQ292ZXJhZ2UgaW4gRXhwbG9yZXJcIiksXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7IGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5pc1Rlc3RDb3ZlcmFnZU9wZW4gfSxcblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpZyA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHZhbHVlID0gZ2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24oY29uZmlnLCBUZXN0aW5nQ29uZmlnS2V5cy5TaG93Q292ZXJhZ2VJbkV4cGxvcmVyKTtcblx0XHRjb25maWcudXBkYXRlVmFsdWUoVGVzdGluZ0NvbmZpZ0tleXMuU2hvd0NvdmVyYWdlSW5FeHBsb3JlciwgIXZhbHVlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHb1RvTmV4dE1pc3NlZENvdmVyYWdlTGluZSBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5Db3ZlcmFnZUdvVG9OZXh0TWlzc2VkTGluZSxcblx0XHRcdHRpdGxlOiBHT19UT19ORVhUX01JU1NFRF9MSU5FX1RJVExFLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMigndGVzdGluZy5nb1RvTmV4dE1pc3NlZExpbmVEZXNjJywgJ05hdmlnYXRlIHRvIHRoZSBuZXh0IGxpbmUgdGhhdCBpcyBub3QgY292ZXJlZCBieSB0ZXN0cy4nKVxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlRlc3QsXG5cdFx0XHRpY29uOiBDb2RpY29uLmFycm93RG93bixcblx0XHRcdHByZWNvbmRpdGlvbjogVGVzdGluZ0NvbnRleHRLZXlzLmhhc0NvdmVyYWdlSW5GaWxlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBBY3RpdmVFZGl0b3JDb250ZXh0LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuRjksXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7IGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5pc1Rlc3RDb3ZlcmFnZU9wZW4gfSxcblx0XHRcdFx0eyBpZDogTWVudUlkLkVkaXRvclRpdGxlLCB3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMuaGFzQ292ZXJhZ2VJbkZpbGUsIGdyb3VwOiAnY292ZXJhZ2UnLCBvcmRlcjogMiB9LFxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBjb2RlRWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSBhY3RpdmVFZGl0b3IuZ2V0Q29udHJpYnV0aW9uPENvZGVDb3ZlcmFnZURlY29yYXRpb25zPihDb2RlQ292ZXJhZ2VEZWNvcmF0aW9ucy5JRCk7XG5cdFx0Y29udHJpYnV0aW9uPy5nb1RvTmV4dE1pc3NlZExpbmUoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHb1RvUHJldmlvdXNNaXNzZWRDb3ZlcmFnZUxpbmUgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuQ292ZXJhZ2VHb1RvUHJldmlvdXNNaXNzZWRMaW5lLFxuXHRcdFx0dGl0bGU6IEdPX1RPX1BSRVZJT1VTX01JU1NFRF9MSU5FX1RJVExFLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMigndGVzdGluZy5nb1RvUHJldmlvdXNNaXNzZWRMaW5lRGVzYycsICdOYXZpZ2F0ZSB0byB0aGUgcHJldmlvdXMgbGluZSB0aGF0IGlzIG5vdCBjb3ZlcmVkIGJ5IHRlc3RzLicpXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVGVzdCxcblx0XHRcdGljb246IENvZGljb24uYXJyb3dVcCxcblx0XHRcdHByZWNvbmRpdGlvbjogVGVzdGluZ0NvbnRleHRLZXlzLmhhc0NvdmVyYWdlSW5GaWxlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBBY3RpdmVFZGl0b3JDb250ZXh0LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRjksXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7IGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5pc1Rlc3RDb3ZlcmFnZU9wZW4gfSxcblx0XHRcdFx0eyBpZDogTWVudUlkLkVkaXRvclRpdGxlLCB3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMuaGFzQ292ZXJhZ2VJbkZpbGUsIGdyb3VwOiAnY292ZXJhZ2UnLCBvcmRlcjogMyB9LFxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBjb2RlRWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSBhY3RpdmVFZGl0b3IuZ2V0Q29udHJpYnV0aW9uPENvZGVDb3ZlcmFnZURlY29yYXRpb25zPihDb2RlQ292ZXJhZ2VEZWNvcmF0aW9ucy5JRCk7XG5cdFx0Y29udHJpYnV0aW9uPy5nb1RvUHJldmlvdXNNaXNzZWRMaW5lKCk7XG5cdH1cbn0pO1xuXG5jbGFzcyBBY3Rpb25XaXRoSWNvbiBleHRlbmRzIEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcsIHB1YmxpYyByZWFkb25seSBpY29uOiBUaGVtZUljb24sIGVuYWJsZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQsIHJ1bjogKCkgPT4gdm9pZCwgcHVibGljIGljb25Pbmx5ID0gZmFsc2UpIHtcblx0XHRzdXBlcihpZCwgdGl0bGUsIHVuZGVmaW5lZCwgZW5hYmxlZCwgcnVuKTtcblx0fVxufVxuXG5jbGFzcyBDb2RpY29uQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cblx0cHVibGljIHRoZW1lSWNvbj86IFRoZW1lSWNvbjtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5sYWJlbCAmJiB0aGlzLmxhYmVsICYmIHRoaXMudGhlbWVJY29uKSB7XG5cdFx0XHRkb20ucmVzZXQodGhpcy5sYWJlbCwgcmVuZGVySWNvbih0aGlzLnRoZW1lSWNvbiksIHRoaXMuYWN0aW9uLmxhYmVsKTtcblx0XHR9XG5cdH1c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
