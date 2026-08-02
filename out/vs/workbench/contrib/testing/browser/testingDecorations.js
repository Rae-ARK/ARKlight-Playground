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
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { Action, Separator, SubmenuAction } from "../../../../base/common/actions.js";
import { equals } from "../../../../base/common/arrays.js";
import { mapFindFirst } from "../../../../base/common/arraysFind.js";
import { RunOnceScheduler, Throttler, timeout } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { stripIcons } from "../../../../base/common/iconLabels.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { clamp } from "../../../../base/common/numbers.js";
import { autorun } from "../../../../base/common/observable.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { count, truncateMiddle } from "../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Constants } from "../../../../base/common/uint.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ContentWidgetPositionPreference, MouseTargetType } from "../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { overviewRulerError, overviewRulerInfo } from "../../../../editor/common/core/editorColorRegistry.js";
import { Position } from "../../../../editor/common/core/position.js";
import { GlyphMarginLane, OverviewRulerLane, TrackedRangeStickiness } from "../../../../editor/common/model.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { localize } from "../../../../nls.js";
import { getFlatContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { EditorLineNumberContextMenu, GutterActionsRegistry } from "../../codeEditor/browser/editorLineNumberMenu.js";
import { DefaultGutterClickAction, TestingConfigKeys, getTestingConfiguration } from "../common/configuration.js";
import { TestCommandId, Testing, labelForTestInState } from "../common/constants.js";
import { TestId } from "../common/testId.js";
import { ITestProfileService } from "../common/testProfileService.js";
import { LiveTestResult, TestResultItemChangeReason } from "../common/testResult.js";
import { ITestResultService } from "../common/testResultService.js";
import { ITestService, getContextForTestItem, simplifyTestsToExecute, testsInFile } from "../common/testService.js";
import { TestDiffOpType, TestMessageType, TestResultState, TestRunProfileBitset } from "../common/testTypes.js";
import { ITestingDecorationsService, TestDecorations } from "../common/testingDecorations.js";
import { ITestingPeekOpener } from "../common/testingPeekOpener.js";
import { isFailedState, maxPriority } from "../common/testingStates.js";
import { TestUriType, buildTestUri, parseTestUri } from "../common/testingUri.js";
import { getTestItemContextOverlay } from "./explorerProjections/testItemContextOverlay.js";
import { testingDebugAllIcon, testingDebugIcon, testingRunAllIcon, testingRunIcon, testingStatesToIcons } from "./icons.js";
import { renderTestMessageAsText } from "./testMessageColorizer.js";
import { MessageSubject } from "./testResultsView/testResultsSubject.js";
import { TestingOutputPeekController } from "./testingOutputPeek.js";
const MAX_INLINE_MESSAGE_LENGTH = 128;
const MAX_TESTS_IN_SUBMENU = 30;
const GLYPH_MARGIN_LANE = GlyphMarginLane.Center;
function isOriginalInDiffEditor(codeEditorService, codeEditor) {
  const diffEditors = codeEditorService.listDiffEditors();
  for (const diffEditor of diffEditors) {
    if (diffEditor.getOriginalEditor() === codeEditor) {
      return true;
    }
  }
  return false;
}
class CachedDecorations {
  constructor() {
    this.runByIdKey = /* @__PURE__ */ new Map();
  }
  get size() {
    return this.runByIdKey.size;
  }
  /** Gets a test run decoration that contains exactly the given test IDs */
  getForExactTests(testIds) {
    const key = testIds.sort().join("\0\0");
    return this.runByIdKey.get(key);
  }
  /** Adds a new test run decroation */
  addTest(d) {
    const key = d.testIds.sort().join("\0\0");
    this.runByIdKey.set(key, d);
  }
  /** Finds an extension by VS Code event ID */
  getById(decorationId) {
    for (const d of this.runByIdKey.values()) {
      if (d.id === decorationId) {
        return d;
      }
    }
    return void 0;
  }
  /** Iterate over all decorations */
  *[Symbol.iterator]() {
    for (const d of this.runByIdKey.values()) {
      yield d;
    }
  }
}
let TestingDecorationService = class extends Disposable {
  constructor(codeEditorService, configurationService, testService, results, instantiationService, modelService) {
    super();
    this.configurationService = configurationService;
    this.testService = testService;
    this.results = results;
    this.instantiationService = instantiationService;
    this.modelService = modelService;
    this.generation = 0;
    this.changeEmitter = this._register(new Emitter());
    this.decorationCache = new ResourceMap();
    /**
     * List of messages that should be hidden because an editor changed their
     * underlying ranges. I think this is good enough, because:
     *  - Message decorations are never shown across reloads; this does not
     *    need to persist
     *  - Message instances are stable for any completed test results for
     *    the duration of the session.
     */
    this.invalidatedMessages = /* @__PURE__ */ new WeakSet();
    /** @inheritdoc */
    this.onDidChange = this.changeEmitter.event;
    this._register(codeEditorService.registerDecorationType("test-message-decoration", TestMessageDecoration.decorationId, {}, void 0));
    this._register(modelService.onModelRemoved((e) => this.decorationCache.delete(e.uri)));
    const debounceInvalidate = this._register(new RunOnceScheduler(() => this.invalidate(), 100));
    this._register(this.testService.onWillProcessDiff((diff) => {
      for (const entry of diff) {
        if (entry.op !== TestDiffOpType.DocumentSynced) {
          continue;
        }
        const rec = this.decorationCache.get(entry.uri);
        if (rec) {
          rec.rangeUpdateVersionId = entry.docv;
        }
      }
      if (!debounceInvalidate.isScheduled()) {
        debounceInvalidate.schedule();
      }
    }));
    this._register(Event.any(
      this.results.onResultsChanged,
      this.results.onTestChanged,
      this.testService.excluded.onTestExclusionsChanged,
      Event.filter(configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(TestingConfigKeys.GutterEnabled))
    )(() => {
      if (!debounceInvalidate.isScheduled()) {
        debounceInvalidate.schedule();
      }
    }));
    this._register(GutterActionsRegistry.registerGutterActionsGenerator((context, result) => {
      const model = context.editor.getModel();
      const testingDecorations = TestingDecorations.get(context.editor);
      if (!model || !testingDecorations?.currentUri) {
        return;
      }
      const currentDecorations = this.syncDecorations(testingDecorations.currentUri);
      if (!currentDecorations.size) {
        return;
      }
      const modelDecorations = model.getLinesDecorations(context.lineNumber, context.lineNumber);
      for (const { id } of modelDecorations) {
        const decoration = currentDecorations.getById(id);
        if (decoration) {
          const { object: actions } = decoration.getContextMenuActions();
          for (const action of actions) {
            result.push(action, "1_testing");
          }
        }
      }
    }));
  }
  /** @inheritdoc */
  invalidateResultMessage(message) {
    this.invalidatedMessages.add(message);
    this.invalidate();
  }
  /** @inheritdoc */
  syncDecorations(resource) {
    const model = this.modelService.getModel(resource);
    if (!model) {
      return new CachedDecorations();
    }
    const cached = this.decorationCache.get(resource);
    if (cached && cached.generation === this.generation && (cached.rangeUpdateVersionId === void 0 || cached.rangeUpdateVersionId !== model.getVersionId())) {
      return cached.value;
    }
    return this.applyDecorations(model);
  }
  /** @inheritdoc */
  getDecoratedTestPosition(resource, testId) {
    const model = this.modelService.getModel(resource);
    if (!model) {
      return void 0;
    }
    const decoration = Iterable.find(this.syncDecorations(resource), (v) => v instanceof RunTestDecoration && v.isForTest(testId));
    if (!decoration) {
      return void 0;
    }
    return model.getDecorationRange(decoration.id)?.getStartPosition();
  }
  invalidate() {
    this.generation++;
    this.changeEmitter.fire();
  }
  /**
   * Sets whether alternate actions are shown for the model.
   */
  updateDecorationsAlternateAction(resource, isAlt) {
    const model = this.modelService.getModel(resource);
    const cached = this.decorationCache.get(resource);
    if (!model || !cached || cached.isAlt === isAlt) {
      return;
    }
    cached.isAlt = isAlt;
    model.changeDecorations((accessor) => {
      for (const decoration of cached.value) {
        if (decoration instanceof RunTestDecoration && decoration.editorDecoration.alternate) {
          accessor.changeDecorationOptions(
            decoration.id,
            isAlt ? decoration.editorDecoration.alternate : decoration.editorDecoration.options
          );
        }
      }
    });
  }
  /**
   * Applies the current set of test decorations to the given text model.
   */
  applyDecorations(model) {
    const gutterEnabled = getTestingConfiguration(this.configurationService, TestingConfigKeys.GutterEnabled);
    const cached = this.decorationCache.get(model.uri);
    const testRangesUpdated = cached?.rangeUpdateVersionId === model.getVersionId();
    const lastDecorations = cached?.value ?? new CachedDecorations();
    const newDecorations = model.changeDecorations((accessor) => {
      const newDecorations2 = new CachedDecorations();
      const runDecorations = new TestDecorations();
      for (const test of this.testService.collection.getNodeByUrl(model.uri)) {
        if (!test.item.range) {
          continue;
        }
        const stateLookup = this.results.getStateById(test.item.extId);
        const line = test.item.range.startLineNumber;
        runDecorations.push({ line, id: "", test, resultItem: stateLookup?.[1] });
      }
      for (const [line, tests] of runDecorations.lines()) {
        const multi = tests.length > 1;
        let existing = lastDecorations.getForExactTests(tests.map((t) => t.test.item.extId));
        if (existing && testRangesUpdated && model.getDecorationRange(existing.id)?.startLineNumber !== line) {
          existing = void 0;
        }
        if (existing) {
          if (existing.replaceOptions(tests, gutterEnabled)) {
            accessor.changeDecorationOptions(existing.id, existing.editorDecoration.options);
          }
          newDecorations2.addTest(existing);
        } else {
          newDecorations2.addTest(multi ? this.instantiationService.createInstance(MultiRunTestDecoration, tests, gutterEnabled, model) : this.instantiationService.createInstance(RunSingleTestDecoration, tests[0].test, tests[0].resultItem, model, gutterEnabled));
        }
      }
      const saveFromRemoval = /* @__PURE__ */ new Set();
      for (const decoration of newDecorations2) {
        if (decoration.id === "") {
          decoration.id = accessor.addDecoration(decoration.editorDecoration.range, decoration.editorDecoration.options);
        } else {
          saveFromRemoval.add(decoration.id);
        }
      }
      for (const decoration of lastDecorations) {
        if (!saveFromRemoval.has(decoration.id)) {
          accessor.removeDecoration(decoration.id);
        }
      }
      this.decorationCache.set(model.uri, {
        generation: this.generation,
        rangeUpdateVersionId: cached?.rangeUpdateVersionId,
        value: newDecorations2
      });
      return newDecorations2;
    });
    return newDecorations || lastDecorations;
  }
};
TestingDecorationService = __decorateClass([
  __decorateParam(0, ICodeEditorService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ITestService),
  __decorateParam(3, ITestResultService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IModelService)
], TestingDecorationService);
let TestingDecorations = class extends Disposable {
  constructor(editor, codeEditorService, testService, decorations, uriIdentityService, results, configurationService, instantiationService) {
    super();
    this.editor = editor;
    this.codeEditorService = codeEditorService;
    this.testService = testService;
    this.decorations = decorations;
    this.uriIdentityService = uriIdentityService;
    this.results = results;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.expectedWidget = this._register(new MutableDisposable());
    this.actualWidget = this._register(new MutableDisposable());
    this.errorContentWidgets = this._register(new DisposableMap());
    this.loggedMessageDecorations = /* @__PURE__ */ new Map();
    this._register(codeEditorService.registerDecorationType("test-message-decoration", TestMessageDecoration.decorationId, {}, void 0, editor));
    this.attachModel(editor.getModel()?.uri);
    this._register(decorations.onDidChange(() => {
      if (this._currentUri) {
        decorations.syncDecorations(this._currentUri);
      }
    }));
    const msgThrottler = this._register(new Throttler());
    this._register(this.results.onTestChanged((ev) => {
      if (ev.reason !== TestResultItemChangeReason.NewMessage) {
        return;
      }
      msgThrottler.queue(() => {
        this.applyResults();
        return timeout(100);
      });
    }));
    this._register(Event.any(
      this.results.onResultsChanged,
      editor.onDidChangeModel,
      this.testService.showInlineOutput.onDidChange
    )(() => this.applyResults()));
    const win = dom.getWindow(editor.getDomNode());
    this._register(dom.addDisposableListener(win, "keydown", (e) => {
      if (new StandardKeyboardEvent(e).keyCode === KeyCode.Alt && this._currentUri) {
        decorations.updateDecorationsAlternateAction(this._currentUri, true);
      }
    }));
    this._register(dom.addDisposableListener(win, "keyup", (e) => {
      if (new StandardKeyboardEvent(e).keyCode === KeyCode.Alt && this._currentUri) {
        decorations.updateDecorationsAlternateAction(this._currentUri, false);
      }
    }));
    this._register(dom.addDisposableListener(win, "blur", () => {
      if (this._currentUri) {
        decorations.updateDecorationsAlternateAction(this._currentUri, false);
      }
    }));
    this._register(this.editor.onKeyUp((e) => {
      if (e.keyCode === KeyCode.Alt && this._currentUri) {
        decorations.updateDecorationsAlternateAction(this._currentUri, false);
      }
    }));
    this._register(this.editor.onDidChangeModel((e) => this.attachModel(e.newModelUrl || void 0)));
    this._register(this.editor.onMouseDown((e) => {
      if (e.target.position && this.currentUri) {
        const modelDecorations = editor.getModel()?.getLineDecorations(e.target.position.lineNumber) ?? [];
        if (!modelDecorations.length) {
          return;
        }
        const cache = decorations.syncDecorations(this.currentUri);
        for (const { id } of modelDecorations) {
          if (cache.getById(id)?.click(e)) {
            e.event.stopPropagation();
            return;
          }
        }
      }
    }));
    this._register(Event.accumulate(this.editor.onDidChangeModelContent, 0, void 0, this._store)((evts) => {
      const model = editor.getModel();
      if (!this._currentUri || !model) {
        return;
      }
      let changed = false;
      for (const [message, deco] of this.loggedMessageDecorations) {
        const invalidate = evts.some((e) => e.changes.some(
          (c) => c.range.startLineNumber <= deco.line && c.range.endLineNumber >= deco.line || deco.resultItem?.item.range && deco.resultItem.item.range.startLineNumber <= c.range.startLineNumber && deco.resultItem.item.range.endLineNumber >= c.range.endLineNumber
        ));
        if (invalidate) {
          changed = true;
          TestingDecorations.invalidatedTests.add(deco.resultItem || message);
        }
      }
      if (changed) {
        this.applyResults();
      }
    }));
    const updateFontFamilyVar = () => {
      this.editor.getContainerDomNode().style.setProperty("--testMessageDecorationFontFamily", editor.getOption(EditorOption.fontFamily));
      this.editor.getContainerDomNode().style.setProperty("--testMessageDecorationFontSize", `${editor.getOption(EditorOption.fontSize)}px`);
    };
    this._register(this.editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.fontFamily)) {
        updateFontFamilyVar();
      }
    }));
    updateFontFamilyVar();
  }
  /**
   * Gets the decorations associated with the given code editor.
   */
  static get(editor) {
    return editor.getContribution(Testing.DecorationsContributionId);
  }
  get currentUri() {
    return this._currentUri;
  }
  attachModel(uri) {
    switch (uri && parseTestUri(uri)?.type) {
      case TestUriType.ResultExpectedOutput:
        this.expectedWidget.value = new ExpectedLensContentWidget(this.editor);
        this.actualWidget.clear();
        break;
      case TestUriType.ResultActualOutput:
        this.expectedWidget.clear();
        this.actualWidget.value = new ActualLensContentWidget(this.editor);
        break;
      default:
        this.expectedWidget.clear();
        this.actualWidget.clear();
    }
    if (isOriginalInDiffEditor(this.codeEditorService, this.editor)) {
      uri = void 0;
    }
    this._currentUri = uri;
    if (!uri) {
      return;
    }
    this.decorations.syncDecorations(uri);
    (async () => {
      for await (const _tests of testsInFile(this.testService, this.uriIdentityService, uri, false)) {
        if (this._currentUri !== uri) {
          break;
        }
      }
    })();
  }
  applyResults() {
    const model = this.editor.getModel();
    if (!model) {
      return this.clearResults();
    }
    const uriStr = model.uri.toString();
    const seenLines = /* @__PURE__ */ new Set();
    this.applyResultsContentWidgets(uriStr, seenLines);
    this.applyResultsLoggedMessages(uriStr, seenLines);
  }
  clearResults() {
    this.errorContentWidgets.clearAndDisposeAll();
  }
  isMessageInvalidated(message) {
    return TestingDecorations.invalidatedTests.has(message);
  }
  applyResultsContentWidgets(uriStr, seenLines) {
    const seen = /* @__PURE__ */ new Set();
    if (getTestingConfiguration(this.configurationService, TestingConfigKeys.ShowAllMessages)) {
      this.results.results.forEach((lastResult) => this.applyContentWidgetsFromResult(lastResult, uriStr, seen, seenLines));
    } else if (this.results.results.length) {
      this.applyContentWidgetsFromResult(this.results.results[0], uriStr, seen, seenLines);
    }
    for (const message of this.errorContentWidgets.keys()) {
      if (!seen.has(message)) {
        this.errorContentWidgets.deleteAndDispose(message);
      }
    }
  }
  applyContentWidgetsFromResult(lastResult, uriStr, seen, seenLines) {
    for (const test of lastResult.tests) {
      if (TestingDecorations.invalidatedTests.has(test)) {
        continue;
      }
      for (let taskId = 0; taskId < test.tasks.length; taskId++) {
        const state = test.tasks[taskId];
        for (let i = 0; i < state.messages.length; i++) {
          const m = state.messages[i];
          if (m.type !== TestMessageType.Error || this.isMessageInvalidated(m)) {
            continue;
          }
          const line = m.location?.uri.toString() === uriStr ? m.location.range.startLineNumber : m.stackTrace && mapFindFirst(m.stackTrace, (f) => f.position && f.uri?.toString() === uriStr ? f.position.lineNumber : void 0);
          if (line === void 0 || seenLines.has(line)) {
            continue;
          }
          seenLines.add(line);
          let deco = this.errorContentWidgets.get(m);
          if (!deco) {
            const lineLength = this.editor.getModel()?.getLineLength(line) ?? 100;
            deco = this.instantiationService.createInstance(
              TestErrorContentWidget,
              this.editor,
              new Position(line, lineLength + 1),
              m,
              test,
              buildTestUri({
                type: TestUriType.ResultActualOutput,
                messageIndex: i,
                taskIndex: taskId,
                resultId: lastResult.id,
                testExtId: test.item.extId
              })
            );
            this.errorContentWidgets.set(m, deco);
          }
          seen.add(m);
        }
      }
    }
  }
  applyResultsLoggedMessages(uriStr, messageLines) {
    this.editor.changeDecorations((accessor) => {
      const seen = /* @__PURE__ */ new Set();
      if (getTestingConfiguration(this.configurationService, TestingConfigKeys.ShowAllMessages)) {
        this.results.results.forEach((r) => this.applyLoggedMessageFromResult(r, uriStr, seen, messageLines, accessor));
      } else if (this.results.results.length) {
        this.applyLoggedMessageFromResult(this.results.results[0], uriStr, seen, messageLines, accessor);
      }
      for (const [message, { id }] of this.loggedMessageDecorations) {
        if (!seen.has(message)) {
          accessor.removeDecoration(id);
        }
      }
    });
  }
  applyLoggedMessageFromResult(lastResult, uriStr, seen, messageLines, accessor) {
    if (!this.testService.showInlineOutput.value || !(lastResult instanceof LiveTestResult)) {
      return;
    }
    const tryAdd = (resultItem, m, uri) => {
      if (this.isMessageInvalidated(m) || m.location?.uri.toString() !== uriStr) {
        return;
      }
      seen.add(m);
      const line = m.location.range.startLineNumber;
      if (messageLines.has(line) || this.loggedMessageDecorations.has(m)) {
        return;
      }
      const deco = this.instantiationService.createInstance(TestMessageDecoration, m, uri, this.editor.getModel());
      messageLines.add(line);
      const id = accessor.addDecoration(
        deco.editorDecoration.range,
        deco.editorDecoration.options
      );
      this.loggedMessageDecorations.set(m, { id, line, resultItem });
    };
    for (const test of lastResult.tests) {
      if (TestingDecorations.invalidatedTests.has(test)) {
        continue;
      }
      for (let taskId = 0; taskId < test.tasks.length; taskId++) {
        const state = test.tasks[taskId];
        for (let i = state.messages.length - 1; i >= 0; i--) {
          const m = state.messages[i];
          if (m.type === TestMessageType.Output) {
            tryAdd(test, m, buildTestUri({
              type: TestUriType.ResultActualOutput,
              messageIndex: i,
              taskIndex: taskId,
              resultId: lastResult.id,
              testExtId: test.item.extId
            }));
          }
        }
      }
    }
    for (const task of lastResult.tasks) {
      for (const m of task.otherMessages) {
        tryAdd(void 0, m);
      }
    }
  }
};
/**
 * Results invalidated by editor changes.
 */
TestingDecorations.invalidatedTests = /* @__PURE__ */ new WeakSet();
TestingDecorations = __decorateClass([
  __decorateParam(1, ICodeEditorService),
  __decorateParam(2, ITestService),
  __decorateParam(3, ITestingDecorationsService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, ITestResultService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IInstantiationService)
], TestingDecorations);
const collapseRange = (originalRange) => ({
  startLineNumber: originalRange.startLineNumber,
  endLineNumber: originalRange.startLineNumber,
  startColumn: originalRange.startColumn,
  endColumn: originalRange.startColumn
});
const createRunTestDecoration = (tests, states, visible, defaultGutterAction) => {
  const range = tests[0]?.item.range;
  if (!range) {
    throw new Error("Test decorations can only be created for tests with a range");
  }
  if (!visible) {
    return {
      range: collapseRange(range),
      options: { isWholeLine: true, description: "run-test-decoration" }
    };
  }
  let computedState = TestResultState.Unset;
  const hoverMessageParts = [];
  let testIdWithMessages;
  let retired = false;
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const resultItem = states[i];
    const state = resultItem?.computedState ?? TestResultState.Unset;
    if (hoverMessageParts.length < 10) {
      hoverMessageParts.push(labelForTestInState(test.item.label, state));
    }
    computedState = maxPriority(computedState, state);
    retired = retired || !!resultItem?.retired;
    if (!testIdWithMessages && resultItem?.tasks.some((t) => t.messages.length)) {
      testIdWithMessages = test.item.extId;
    }
  }
  const hasMultipleTests = tests.length > 1 || tests[0].children.size > 0;
  const primaryIcon = computedState === TestResultState.Unset ? hasMultipleTests ? testingRunAllIcon : testingRunIcon : testingStatesToIcons.get(computedState);
  const alternateIcon = defaultGutterAction === DefaultGutterClickAction.Debug ? hasMultipleTests ? testingRunAllIcon : testingRunIcon : hasMultipleTests ? testingDebugAllIcon : testingDebugIcon;
  let hoverMessage;
  let glyphMarginClassName = "testing-run-glyph";
  if (retired) {
    glyphMarginClassName += " retired";
  }
  const defaultOptions = {
    description: "run-test-decoration",
    showIfCollapsed: true,
    get hoverMessage() {
      if (!hoverMessage) {
        const building = hoverMessage = new MarkdownString("", true).appendText(hoverMessageParts.join(", ") + ".");
        if (testIdWithMessages) {
          const args = encodeURIComponent(JSON.stringify([testIdWithMessages]));
          building.appendMarkdown(` [${localize("peekTestOutout", "Peek Test Output")}](command:vscode.peekTestError?${args})`);
        }
      }
      return hoverMessage;
    },
    glyphMargin: { position: GLYPH_MARGIN_LANE },
    glyphMarginClassName: `${ThemeIcon.asClassName(primaryIcon)} ${glyphMarginClassName}`,
    stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    zIndex: 1e4,
    overviewRuler: isFailedState(computedState) ? { color: themeColorFromId(overviewRulerError), position: OverviewRulerLane.Center } : void 0
  };
  const alternateOptions = {
    ...defaultOptions,
    glyphMarginClassName: `${ThemeIcon.asClassName(alternateIcon)} ${glyphMarginClassName}`
  };
  return {
    range: collapseRange(range),
    options: defaultOptions,
    alternate: alternateOptions
  };
};
var LensContentWidgetVars = /* @__PURE__ */ ((LensContentWidgetVars2) => {
  LensContentWidgetVars2["FontFamily"] = "testingDiffLensFontFamily";
  LensContentWidgetVars2["FontFeatures"] = "testingDiffLensFontFeatures";
  return LensContentWidgetVars2;
})(LensContentWidgetVars || {});
class TitleLensContentWidget {
  constructor(editor) {
    this.editor = editor;
    /** @inheritdoc */
    this.allowEditorOverflow = false;
    /** @inheritdoc */
    this.suppressMouseDown = true;
    this._domNode = dom.$("span");
    queueMicrotask(() => {
      this.applyStyling();
      this.editor.addContentWidget(this);
    });
  }
  applyStyling() {
    let fontSize = this.editor.getOption(EditorOption.codeLensFontSize);
    let height;
    if (!fontSize || fontSize < 5) {
      fontSize = this.editor.getOption(EditorOption.fontSize) * 0.9 | 0;
      height = this.editor.getOption(EditorOption.lineHeight);
    } else {
      height = fontSize * Math.max(1.3, this.editor.getOption(EditorOption.lineHeight) / this.editor.getOption(EditorOption.fontSize)) | 0;
    }
    const editorFontInfo = this.editor.getOption(EditorOption.fontInfo);
    const node = this._domNode;
    node.classList.add("testing-diff-lens-widget");
    node.textContent = this.getText();
    node.style.lineHeight = `${height}px`;
    node.style.fontSize = `${fontSize}px`;
    node.style.fontFamily = `var(--${"testingDiffLensFontFamily" /* FontFamily */})`;
    node.style.fontFeatureSettings = `var(--${"testingDiffLensFontFeatures" /* FontFeatures */})`;
    const containerStyle = this.editor.getContainerDomNode().style;
    containerStyle.setProperty("testingDiffLensFontFamily" /* FontFamily */, this.editor.getOption(EditorOption.codeLensFontFamily) ?? "inherit");
    containerStyle.setProperty("testingDiffLensFontFeatures" /* FontFeatures */, editorFontInfo.fontFeatureSettings);
    this.editor.changeViewZones((accessor) => {
      if (this.viewZoneId) {
        accessor.removeZone(this.viewZoneId);
      }
      this.viewZoneId = accessor.addZone({
        afterLineNumber: 0,
        afterColumn: Constants.MAX_SAFE_SMALL_INTEGER,
        domNode: document.createElement("div"),
        heightInPx: 20
      });
    });
  }
  /** @inheritdoc */
  getDomNode() {
    return this._domNode;
  }
  /** @inheritdoc */
  dispose() {
    this.editor.changeViewZones((accessor) => {
      if (this.viewZoneId) {
        accessor.removeZone(this.viewZoneId);
      }
    });
    this.editor.removeContentWidget(this);
  }
  /** @inheritdoc */
  getPosition() {
    return {
      position: { column: 0, lineNumber: 0 },
      preference: [ContentWidgetPositionPreference.ABOVE]
    };
  }
}
class ExpectedLensContentWidget extends TitleLensContentWidget {
  getId() {
    return "expectedTestingLens";
  }
  getText() {
    return localize("expected.title", "Expected");
  }
}
class ActualLensContentWidget extends TitleLensContentWidget {
  getId() {
    return "actualTestingLens";
  }
  getText() {
    return localize("actual.title", "Actual");
  }
}
let RunTestDecoration = class {
  constructor(tests, visible, model, codeEditorService, testService, contextMenuService, commandService, configurationService, testProfileService, contextKeyService, menuService) {
    this.tests = tests;
    this.visible = visible;
    this.model = model;
    this.codeEditorService = codeEditorService;
    this.testService = testService;
    this.contextMenuService = contextMenuService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.testProfileService = testProfileService;
    this.contextKeyService = contextKeyService;
    this.menuService = menuService;
    /** @inheritdoc */
    this.id = "";
    this.displayedStates = tests.map((t) => t.resultItem?.computedState);
    this.editorDecoration = createRunTestDecoration(
      tests.map((t) => t.test),
      tests.map((t) => t.resultItem),
      visible,
      getTestingConfiguration(this.configurationService, TestingConfigKeys.DefaultGutterClickAction)
    );
    this.editorDecoration.options.glyphMarginHoverMessage = new MarkdownString().appendText(this.getGutterLabel());
  }
  get line() {
    return this.editorDecoration.range.startLineNumber;
  }
  get testIds() {
    return this.tests.map((t) => t.test.item.extId);
  }
  /** @inheritdoc */
  click(e) {
    if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN || e.target.detail.glyphMarginLane !== GLYPH_MARGIN_LANE || e.event.rightButton || isMacintosh && e.event.leftButton && e.event.ctrlKey) {
      return false;
    }
    const alternateAction = e.event.altKey;
    switch (getTestingConfiguration(this.configurationService, TestingConfigKeys.DefaultGutterClickAction)) {
      case DefaultGutterClickAction.ContextMenu:
        this.showContextMenu(e);
        break;
      case DefaultGutterClickAction.Debug:
        this.runWith(alternateAction ? TestRunProfileBitset.Run : TestRunProfileBitset.Debug);
        break;
      case DefaultGutterClickAction.Coverage:
        this.runWith(alternateAction ? TestRunProfileBitset.Debug : TestRunProfileBitset.Coverage);
        break;
      case DefaultGutterClickAction.Run:
      default:
        this.runWith(alternateAction ? TestRunProfileBitset.Debug : TestRunProfileBitset.Run);
        break;
    }
    return true;
  }
  /**
   * Updates the decoration to match the new set of tests.
   * @returns true if options were changed, false otherwise
   */
  replaceOptions(newTests, visible) {
    const displayedStates = newTests.map((t) => t.resultItem?.computedState);
    if (visible === this.visible && equals(this.displayedStates, displayedStates)) {
      return false;
    }
    this.tests = newTests;
    this.displayedStates = displayedStates;
    this.visible = visible;
    const { options, alternate } = createRunTestDecoration(
      newTests.map((t) => t.test),
      newTests.map((t) => t.resultItem),
      visible,
      getTestingConfiguration(this.configurationService, TestingConfigKeys.DefaultGutterClickAction)
    );
    this.editorDecoration.options = options;
    this.editorDecoration.alternate = alternate;
    this.editorDecoration.options.glyphMarginHoverMessage = new MarkdownString().appendText(this.getGutterLabel());
    return true;
  }
  /**
   * Gets whether this decoration serves as the run button for the given test ID.
   */
  isForTest(testId) {
    return this.tests.some((t) => t.test.item.extId === testId);
  }
  runWith(profile) {
    return this.testService.runTests({
      tests: simplifyTestsToExecute(this.testService.collection, this.tests.map(({ test }) => test)),
      group: profile
    });
  }
  showContextMenu(e) {
    const editor = this.codeEditorService.listCodeEditors().find((e2) => e2.getModel() === this.model);
    editor?.getContribution(EditorLineNumberContextMenu.ID)?.show(e);
  }
  getGutterLabel() {
    switch (getTestingConfiguration(this.configurationService, TestingConfigKeys.DefaultGutterClickAction)) {
      case DefaultGutterClickAction.ContextMenu:
        return localize("testing.gutterMsg.contextMenu", "Click for test options");
      case DefaultGutterClickAction.Debug:
        return localize("testing.gutterMsg.debug", "Click to debug tests, right click for more options");
      case DefaultGutterClickAction.Coverage:
        return localize("testing.gutterMsg.coverage", "Click to run tests with coverage, right click for more options");
      case DefaultGutterClickAction.Run:
      default:
        return localize("testing.gutterMsg.run", "Click to run tests, right click for more options");
    }
  }
  /**
   * Gets context menu actions relevant for a singel test.
   */
  getTestContextMenuActions(test, resultItem) {
    const testActions = [];
    const capabilities = this.testProfileService.capabilitiesForTest(test.item);
    [
      { bitset: TestRunProfileBitset.Run, label: localize("run test", "Run Test") },
      { bitset: TestRunProfileBitset.Debug, label: localize("debug test", "Debug Test") },
      { bitset: TestRunProfileBitset.Coverage, label: localize("coverage test", "Run with Coverage") }
    ].forEach(({ bitset, label }) => {
      if (capabilities & bitset) {
        testActions.push(new Action(
          `testing.gutter.${bitset}`,
          label,
          void 0,
          void 0,
          () => this.testService.runTests({ group: bitset, tests: [test] })
        ));
      }
    });
    if (capabilities & TestRunProfileBitset.HasNonDefaultProfile) {
      testActions.push(new Action("testing.runUsing", localize("testing.runUsing", "Execute Using Profile..."), void 0, void 0, async () => {
        const profile = await this.commandService.executeCommand("vscode.pickTestProfile", { onlyForTest: test });
        if (!profile) {
          return;
        }
        this.testService.runResolvedTests({
          group: profile.group,
          targets: [{
            profileId: profile.profileId,
            controllerId: profile.controllerId,
            testIds: [test.item.extId]
          }]
        });
      }));
    }
    if (resultItem && isFailedState(resultItem.computedState)) {
      testActions.push(new Action(
        "testing.gutter.peekFailure",
        localize("peek failure", "Peek Error"),
        void 0,
        void 0,
        () => this.commandService.executeCommand("vscode.peekTestError", test.item.extId)
      ));
    }
    if (resultItem?.computedState === TestResultState.Running) {
      testActions.push(new Action(
        "testing.gutter.cancel",
        localize("testing.cancelRun", "Cancel Test Run"),
        void 0,
        void 0,
        () => this.commandService.executeCommand(TestCommandId.CancelTestRunAction)
      ));
    }
    testActions.push(new Action(
      "testing.gutter.reveal",
      localize("reveal test", "Reveal in Test Explorer"),
      void 0,
      void 0,
      () => this.commandService.executeCommand("_revealTestInExplorer", test.item.extId)
    ));
    const contributed = this.getContributedTestActions(test, capabilities);
    return { object: Separator.join(testActions, contributed), dispose() {
      testActions.forEach((a) => a.dispose());
    } };
  }
  getContributedTestActions(test, capabilities) {
    const contextOverlay = this.contextKeyService.createOverlay(getTestItemContextOverlay(test, capabilities));
    const arg = getContextForTestItem(this.testService.collection, test.item.extId);
    const menu = this.menuService.getMenuActions(MenuId.TestItemGutter, contextOverlay, { shouldForwardArgs: true, arg });
    return getFlatContextMenuActions(menu);
  }
};
RunTestDecoration = __decorateClass([
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, ITestService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, ITestProfileService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IMenuService)
], RunTestDecoration);
let MultiRunTestDecoration = class extends RunTestDecoration {
  constructor(tests, visible, model, codeEditorService, testService, contextMenuService, commandService, configurationService, testProfileService, contextKeyService, menuService, quickInputService) {
    super(tests, visible, model, codeEditorService, testService, contextMenuService, commandService, configurationService, testProfileService, contextKeyService, menuService);
    this.quickInputService = quickInputService;
  }
  getContextMenuActions() {
    const disposable = new DisposableStore();
    const allActions = [];
    [
      { bitset: TestRunProfileBitset.Run, label: localize("run all test", "Run All Tests") },
      { bitset: TestRunProfileBitset.Coverage, label: localize("run all test with coverage", "Run All Tests with Coverage") },
      { bitset: TestRunProfileBitset.Debug, label: localize("debug all test", "Debug All Tests") }
    ].forEach(({ bitset, label }, i) => {
      const canRun = this.tests.some(({ test }) => this.testProfileService.capabilitiesForTest(test.item) & bitset);
      if (canRun) {
        allActions.push(new Action(`testing.gutter.run${i}`, label, void 0, void 0, () => this.runWith(bitset)));
      }
    });
    disposable.add(toDisposable(() => allActions.forEach((a) => a.dispose())));
    const testItems = this.tests.map((testItem) => ({
      currentLabel: testItem.test.item.label,
      testItem,
      parent: TestId.fromString(testItem.test.item.extId).parentId
    }));
    const getLabelConflicts = (tests) => {
      const labelCount = /* @__PURE__ */ new Map();
      for (const test of tests) {
        labelCount.set(test.currentLabel, (labelCount.get(test.currentLabel) || 0) + 1);
      }
      return tests.filter((e) => labelCount.get(e.currentLabel) > 1);
    };
    let conflicts, hasParent = true;
    while ((conflicts = getLabelConflicts(testItems)).length && hasParent) {
      for (const conflict of conflicts) {
        if (conflict.parent) {
          const parent = this.testService.collection.getNodeById(conflict.parent.toString());
          conflict.currentLabel = parent?.item.label + " > " + conflict.currentLabel;
          conflict.parent = conflict.parent.parentId;
        } else {
          hasParent = false;
        }
      }
    }
    testItems.sort((a, b) => {
      const ai = a.testItem.test.item;
      const bi = b.testItem.test.item;
      return (ai.sortText || ai.label).localeCompare(bi.sortText || bi.label);
    });
    let testSubmenus = testItems.map(({ currentLabel, testItem }) => {
      const actions = this.getTestContextMenuActions(testItem.test, testItem.resultItem);
      disposable.add(actions);
      let label = stripIcons(currentLabel);
      const lf = label.indexOf("\n");
      if (lf !== -1) {
        label = label.slice(0, lf);
      }
      return new SubmenuAction(testItem.test.item.extId, label, actions.object);
    });
    const overflow = testSubmenus.length - MAX_TESTS_IN_SUBMENU;
    if (overflow > 0) {
      testSubmenus = testSubmenus.slice(0, MAX_TESTS_IN_SUBMENU);
      testSubmenus.push(new Action(
        "testing.gutter.overflow",
        localize("testOverflowItems", "{0} more tests...", overflow),
        void 0,
        void 0,
        () => this.pickAndRun(testItems)
      ));
    }
    return { object: Separator.join(allActions, testSubmenus), dispose: () => disposable.dispose() };
  }
  async pickAndRun(testItems) {
    const doPick = (items, title) => new Promise((resolve) => {
      const disposables = new DisposableStore();
      const pick = disposables.add(this.quickInputService.createQuickPick());
      pick.placeholder = title;
      pick.items = items;
      disposables.add(pick.onDidHide(() => {
        resolve(void 0);
        disposables.dispose();
      }));
      disposables.add(pick.onDidAccept(() => {
        resolve(pick.selectedItems[0]);
        disposables.dispose();
      }));
      pick.show();
    });
    const item = await doPick(
      testItems.map(({ currentLabel, testItem }) => ({ label: currentLabel, test: testItem.test, result: testItem.resultItem })),
      localize("selectTestToRun", "Select a test to run")
    );
    if (!item) {
      return;
    }
    const actions = this.getTestContextMenuActions(item.test, item.result);
    try {
      (await doPick(actions.object, item.label))?.run();
    } finally {
      actions.dispose();
    }
  }
};
MultiRunTestDecoration = __decorateClass([
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, ITestService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, ITestProfileService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IMenuService),
  __decorateParam(11, IQuickInputService)
], MultiRunTestDecoration);
let RunSingleTestDecoration = class extends RunTestDecoration {
  constructor(test, resultItem, model, visible, codeEditorService, testService, commandService, contextMenuService, configurationService, testProfiles, contextKeyService, menuService) {
    super([{ test, resultItem }], visible, model, codeEditorService, testService, contextMenuService, commandService, configurationService, testProfiles, contextKeyService, menuService);
  }
  getContextMenuActions() {
    return this.getTestContextMenuActions(this.tests[0].test, this.tests[0].resultItem);
  }
};
RunSingleTestDecoration = __decorateClass([
  __decorateParam(4, ICodeEditorService),
  __decorateParam(5, ITestService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, ITestProfileService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IMenuService)
], RunSingleTestDecoration);
const lineBreakRe = /\r?\n\s*/g;
let TestMessageDecoration = class {
  constructor(testMessage, messageUri, textModel, peekOpener, editorService) {
    this.testMessage = testMessage;
    this.messageUri = messageUri;
    this.peekOpener = peekOpener;
    this.id = "";
    this.contentIdClass = `test-message-inline-content-id${generateUuid()}`;
    const location = testMessage.location;
    this.line = clamp(location.range.startLineNumber, 0, textModel.getLineCount());
    const severity = testMessage.type;
    const message = testMessage.message;
    const options = editorService.resolveDecorationOptions(TestMessageDecoration.decorationId, true);
    const hoverText = renderTestMessageAsText(message);
    options.hoverMessage = new MarkdownString().appendText(hoverText);
    options.zIndex = 10;
    options.className = `testing-inline-message-severity-${severity}`;
    options.isWholeLine = true;
    options.stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
    options.collapseOnReplaceEdit = true;
    let inlineText = renderTestMessageAsText(message).replace(lineBreakRe, " ");
    if (inlineText.length > MAX_INLINE_MESSAGE_LENGTH) {
      inlineText = inlineText.slice(0, MAX_INLINE_MESSAGE_LENGTH - 1) + "\u2026";
    }
    options.after = {
      content: inlineText,
      inlineClassName: `test-message-inline-content test-message-inline-content-s${severity} ${this.contentIdClass} ${messageUri ? "test-message-inline-content-clickable" : ""}`
    };
    options.showIfCollapsed = true;
    const rulerColor = severity === TestMessageType.Error ? overviewRulerError : overviewRulerInfo;
    if (rulerColor) {
      options.overviewRuler = { color: themeColorFromId(rulerColor), position: OverviewRulerLane.Right };
    }
    const lineLength = textModel.getLineLength(this.line);
    const column = lineLength ? lineLength + 1 : location.range.endColumn;
    this.editorDecoration = {
      options,
      range: {
        startLineNumber: this.line,
        startColumn: column,
        endColumn: column,
        endLineNumber: this.line
      }
    };
  }
  click(e) {
    if (e.event.rightButton) {
      return false;
    }
    if (!this.messageUri) {
      return false;
    }
    if (e.target.element?.className.includes(this.contentIdClass)) {
      this.peekOpener.peekUri(this.messageUri);
    }
    return false;
  }
  getContextMenuActions() {
    return { object: [], dispose: () => {
    } };
  }
};
TestMessageDecoration.inlineClassName = "test-message-inline-content";
TestMessageDecoration.decorationId = `testmessage-${generateUuid()}`;
TestMessageDecoration = __decorateClass([
  __decorateParam(3, ITestingPeekOpener),
  __decorateParam(4, ICodeEditorService)
], TestMessageDecoration);
const ERROR_CONTENT_WIDGET_HEIGHT = 20;
let TestErrorContentWidget = class extends Disposable {
  constructor(editor, position, message, resultItem, uri, peekOpener) {
    super();
    this.editor = editor;
    this.position = position;
    this.message = message;
    this.resultItem = resultItem;
    this.peekOpener = peekOpener;
    this.id = generateUuid();
    /** @inheritdoc */
    this.allowEditorOverflow = false;
    this.node = dom.h("div.test-error-content-widget", [
      dom.h("div.inner@inner", [
        dom.h("div.arrow@arrow"),
        dom.h(`span${ThemeIcon.asCSSSelector(testingStatesToIcons.get(TestResultState.Failed))}`),
        dom.h("span.content@name")
      ])
    ]);
    const setMarginTop = () => {
      const lineHeight = editor.getLineHeightForPosition(position);
      this.node.root.style.marginTop = (lineHeight - ERROR_CONTENT_WIDGET_HEIGHT) / 2 + "px";
    };
    setMarginTop();
    this._register(editor.onDidChangeLineHeight((e) => {
      if (e.affects(position)) {
        setMarginTop();
      }
    }));
    this._register(editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.lineHeight)) {
        setMarginTop();
      }
    }));
    let text;
    if (message.expected !== void 0 && message.actual !== void 0) {
      text = `${truncateMiddle(message.actual.replace(/\s+/g, " "), 30)} != ${truncateMiddle(message.expected.replace(/\s+/g, " "), 30)}`;
    } else {
      const msg = renderAsPlaintext(message.message);
      const lf = msg.indexOf("\n");
      text = lf === -1 ? msg : msg.slice(0, lf);
    }
    this._register(dom.addDisposableListener(this.node.root, dom.EventType.CLICK, (e) => {
      this.peekOpener.peekUri(uri);
      e.preventDefault();
    }));
    const ctrl = TestingOutputPeekController.get(editor);
    if (ctrl) {
      this._register(autorun((reader) => {
        const subject = ctrl.subject.read(reader);
        const isCurrent = subject instanceof MessageSubject && subject.message === message;
        this.node.root.classList.toggle("is-current", isCurrent);
      }));
    }
    this.node.name.innerText = text || "Test Failed";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "15");
    svg.setAttribute("height", "10");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("viewBox", "0 0 15 10");
    const leftArrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    leftArrow.setAttribute("d", "M15 0 L10 0 L0 5 L10 10 L15 10 Z");
    svg.append(leftArrow);
    this.node.arrow.appendChild(svg);
    this._register(editor.onDidChangeModelContent((e) => {
      for (const c of e.changes) {
        if (c.range.startLineNumber > this.line) {
          continue;
        }
        if (c.range.startLineNumber <= this.line && c.range.endLineNumber >= this.line || resultItem.item.range && resultItem.item.range.startLineNumber <= c.range.startLineNumber && resultItem.item.range.endLineNumber >= c.range.endLineNumber) {
          TestingDecorations.invalidatedTests.add(this.resultItem);
          this.dispose();
        }
        const adjust = count(c.text, "\n") - (c.range.endLineNumber - c.range.startLineNumber);
        if (adjust !== 0) {
          this.position = this.position.delta(adjust);
          this.editor.layoutContentWidget(this);
        }
      }
    }));
    editor.addContentWidget(this);
    this._register(toDisposable(() => editor.removeContentWidget(this)));
  }
  get line() {
    return this.position.lineNumber;
  }
  getId() {
    return this.id;
  }
  getDomNode() {
    return this.node.root;
  }
  getPosition() {
    return {
      position: this.position,
      preference: [ContentWidgetPositionPreference.EXACT]
    };
  }
  afterRender(_position, coordinate) {
    if (coordinate) {
      const { verticalScrollbarWidth } = this.editor.getLayoutInfo();
      const scrollWidth = this.editor.getScrollWidth();
      this.node.inner.style.maxWidth = `${scrollWidth - verticalScrollbarWidth - coordinate.left - 20}px`;
    }
  }
};
TestErrorContentWidget = __decorateClass([
  __decorateParam(5, ITestingPeekOpener)
], TestErrorContentWidget);
export {
  TestingDecorationService,
  TestingDecorations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvYnJvd3Nlci90ZXN0aW5nRGVjb3JhdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgbWFwRmluZEZpcnN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzRmluZC5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyLCBUaHJvdHRsZXIsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBzdHJpcEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElSZWZlcmVuY2UsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgY291bnQsIHRydW5jYXRlTWlkZGxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29uc3RhbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdWludC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLCBJQ29kZUVkaXRvciwgSUNvbnRlbnRXaWRnZXQsIElDb250ZW50V2lkZ2V0UG9zaXRpb24sIElDb250ZW50V2lkZ2V0UmVuZGVyZWRDb29yZGluYXRlLCBJRWRpdG9yTW91c2VFdmVudCwgTW91c2VUYXJnZXRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IG92ZXJ2aWV3UnVsZXJFcnJvciwgb3ZlcnZpZXdSdWxlckluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdG9yQ29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEdseXBoTWFyZ2luTGFuZSwgSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMsIElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IsIElNb2RlbERlbHRhRGVjb3JhdGlvbiwgSVRleHRNb2RlbCwgT3ZlcnZpZXdSdWxlckxhbmUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyB0aGVtZUNvbG9yRnJvbUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IEVkaXRvckxpbmVOdW1iZXJDb250ZXh0TWVudSwgR3V0dGVyQWN0aW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29kZUVkaXRvci9icm93c2VyL2VkaXRvckxpbmVOdW1iZXJNZW51LmpzJztcbmltcG9ydCB7IERlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbiwgVGVzdGluZ0NvbmZpZ0tleXMsIGdldFRlc3RpbmdDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbW1hbmRJZCwgVGVzdGluZywgbGFiZWxGb3JUZXN0SW5TdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgVGVzdElkIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RJZC5qcyc7XG5pbXBvcnQgeyBJVGVzdFByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RQcm9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVzdFJlc3VsdCwgTGl2ZVRlc3RSZXN1bHQsIFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSZXN1bHQuanMnO1xuaW1wb3J0IHsgSVRlc3RSZXN1bHRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSZXN1bHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXN0U2VydmljZSwgZ2V0Q29udGV4dEZvclRlc3RJdGVtLCBzaW1wbGlmeVRlc3RzVG9FeGVjdXRlLCB0ZXN0c0luRmlsZSB9IGZyb20gJy4uL2NvbW1vbi90ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVzdEVycm9yTWVzc2FnZSwgSVRlc3RNZXNzYWdlLCBJVGVzdFJ1blByb2ZpbGUsIEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtLCBJbnRlcm5hbFRlc3RJdGVtLCBUZXN0RGlmZk9wVHlwZSwgVGVzdE1lc3NhZ2VUeXBlLCBUZXN0UmVzdWx0SXRlbSwgVGVzdFJlc3VsdFN0YXRlLCBUZXN0UnVuUHJvZmlsZUJpdHNldCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0VHlwZXMuanMnO1xuaW1wb3J0IHsgSVRlc3REZWNvcmF0aW9uIGFzIElQdWJsaWNUZXN0RGVjb3JhdGlvbiwgSVRlc3RpbmdEZWNvcmF0aW9uc1NlcnZpY2UsIFRlc3REZWNvcmF0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi90ZXN0aW5nRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgSVRlc3RpbmdQZWVrT3BlbmVyIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RpbmdQZWVrT3BlbmVyLmpzJztcbmltcG9ydCB7IGlzRmFpbGVkU3RhdGUsIG1heFByaW9yaXR5IH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RpbmdTdGF0ZXMuanMnO1xuaW1wb3J0IHsgVGVzdFVyaVR5cGUsIGJ1aWxkVGVzdFVyaSwgcGFyc2VUZXN0VXJpIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RpbmdVcmkuanMnO1xuaW1wb3J0IHsgZ2V0VGVzdEl0ZW1Db250ZXh0T3ZlcmxheSB9IGZyb20gJy4vZXhwbG9yZXJQcm9qZWN0aW9ucy90ZXN0SXRlbUNvbnRleHRPdmVybGF5LmpzJztcbmltcG9ydCB7IHRlc3RpbmdEZWJ1Z0FsbEljb24sIHRlc3RpbmdEZWJ1Z0ljb24sIHRlc3RpbmdSdW5BbGxJY29uLCB0ZXN0aW5nUnVuSWNvbiwgdGVzdGluZ1N0YXRlc1RvSWNvbnMgfSBmcm9tICcuL2ljb25zLmpzJztcbmltcG9ydCB7IHJlbmRlclRlc3RNZXNzYWdlQXNUZXh0IH0gZnJvbSAnLi90ZXN0TWVzc2FnZUNvbG9yaXplci5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlU3ViamVjdCB9IGZyb20gJy4vdGVzdFJlc3VsdHNWaWV3L3Rlc3RSZXN1bHRzU3ViamVjdC5qcyc7XG5pbXBvcnQgeyBUZXN0aW5nT3V0cHV0UGVla0NvbnRyb2xsZXIgfSBmcm9tICcuL3Rlc3RpbmdPdXRwdXRQZWVrLmpzJztcblxuY29uc3QgTUFYX0lOTElORV9NRVNTQUdFX0xFTkdUSCA9IDEyODtcbmNvbnN0IE1BWF9URVNUU19JTl9TVUJNRU5VID0gMzA7XG5jb25zdCBHTFlQSF9NQVJHSU5fTEFORSA9IEdseXBoTWFyZ2luTGFuZS5DZW50ZXI7XG5cbmZ1bmN0aW9uIGlzT3JpZ2luYWxJbkRpZmZFZGl0b3IoY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSwgY29kZUVkaXRvcjogSUNvZGVFZGl0b3IpOiBib29sZWFuIHtcblx0Y29uc3QgZGlmZkVkaXRvcnMgPSBjb2RlRWRpdG9yU2VydmljZS5saXN0RGlmZkVkaXRvcnMoKTtcblxuXHRmb3IgKGNvbnN0IGRpZmZFZGl0b3Igb2YgZGlmZkVkaXRvcnMpIHtcblx0XHRpZiAoZGlmZkVkaXRvci5nZXRPcmlnaW5hbEVkaXRvcigpID09PSBjb2RlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmludGVyZmFjZSBJVGVzdERlY29yYXRpb24gZXh0ZW5kcyBJUHVibGljVGVzdERlY29yYXRpb24ge1xuXHRpZDogc3RyaW5nO1xuXHRjbGljayhlOiBJRWRpdG9yTW91c2VFdmVudCk6IGJvb2xlYW47XG59XG5cbi8qKiBWYWx1ZSBmb3Igc2F2ZWQgZGVjb3JhdGlvbnMsIHByb3ZpZGluZyBmYXN0IGFjY2Vzc29ycyBmb3IgdGhlIGhvdCAnc3luY0RlY29yYXRpb25zJyBwYXRoICovXG5jbGFzcyBDYWNoZWREZWNvcmF0aW9ucyB7XG5cdHByaXZhdGUgcmVhZG9ubHkgcnVuQnlJZEtleSA9IG5ldyBNYXA8c3RyaW5nLCBSdW5UZXN0RGVjb3JhdGlvbj4oKTtcblxuXHRwdWJsaWMgZ2V0IHNpemUoKSB7XG5cdFx0cmV0dXJuIHRoaXMucnVuQnlJZEtleS5zaXplO1xuXHR9XG5cblx0LyoqIEdldHMgYSB0ZXN0IHJ1biBkZWNvcmF0aW9uIHRoYXQgY29udGFpbnMgZXhhY3RseSB0aGUgZ2l2ZW4gdGVzdCBJRHMgKi9cblx0cHVibGljIGdldEZvckV4YWN0VGVzdHModGVzdElkczogc3RyaW5nW10pIHtcblx0XHRjb25zdCBrZXkgPSB0ZXN0SWRzLnNvcnQoKS5qb2luKCdcXDBcXDAnKTtcblx0XHRyZXR1cm4gdGhpcy5ydW5CeUlkS2V5LmdldChrZXkpO1xuXHR9XG5cdC8qKiBBZGRzIGEgbmV3IHRlc3QgcnVuIGRlY3JvYXRpb24gKi9cblx0cHVibGljIGFkZFRlc3QoZDogUnVuVGVzdERlY29yYXRpb24pIHtcblx0XHRjb25zdCBrZXkgPSBkLnRlc3RJZHMuc29ydCgpLmpvaW4oJ1xcMFxcMCcpO1xuXHRcdHRoaXMucnVuQnlJZEtleS5zZXQoa2V5LCBkKTtcblx0fVxuXG5cdC8qKiBGaW5kcyBhbiBleHRlbnNpb24gYnkgVlMgQ29kZSBldmVudCBJRCAqL1xuXHRwdWJsaWMgZ2V0QnlJZChkZWNvcmF0aW9uSWQ6IHN0cmluZykge1xuXHRcdGZvciAoY29uc3QgZCBvZiB0aGlzLnJ1bkJ5SWRLZXkudmFsdWVzKCkpIHtcblx0XHRcdGlmIChkLmlkID09PSBkZWNvcmF0aW9uSWQpIHtcblx0XHRcdFx0cmV0dXJuIGQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKiogSXRlcmF0ZSBvdmVyIGFsbCBkZWNvcmF0aW9ucyAqL1xuXHQqW1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmFibGVJdGVyYXRvcjxJVGVzdERlY29yYXRpb24+IHtcblx0XHRmb3IgKGNvbnN0IGQgb2YgdGhpcy5ydW5CeUlkS2V5LnZhbHVlcygpKSB7XG5cdFx0XHR5aWVsZCBkO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdGluZ0RlY29yYXRpb25TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXN0aW5nRGVjb3JhdGlvbnNTZXJ2aWNlIHtcblx0ZGVjbGFyZSBwdWJsaWMgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgZ2VuZXJhdGlvbiA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2hhbmdlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRlY29yYXRpb25DYWNoZSA9IG5ldyBSZXNvdXJjZU1hcDx7XG5cdFx0LyoqIFRoZSBkb2N1bWVudCB2ZXJzaW9uIGF0IHdoaWNoIHJhbmdlcyBoYXZlIGJlZW4gdXBkYXRlZCwgcmVxdWlyaW5nIHJlcmVuZGVyaW5nICovXG5cdFx0cmFuZ2VVcGRhdGVWZXJzaW9uSWQ/OiBudW1iZXI7XG5cdFx0LyoqIENvdW50ZXIgZm9yIHRoZSByZXN1bHRzIHJlbmRlcmVkIGluIHRoZSBkb2N1bWVudCAqL1xuXHRcdGdlbmVyYXRpb246IG51bWJlcjtcblx0XHRpc0FsdD86IGJvb2xlYW47XG5cdFx0dmFsdWU6IENhY2hlZERlY29yYXRpb25zO1xuXHR9PigpO1xuXG5cdC8qKlxuXHQgKiBMaXN0IG9mIG1lc3NhZ2VzIHRoYXQgc2hvdWxkIGJlIGhpZGRlbiBiZWNhdXNlIGFuIGVkaXRvciBjaGFuZ2VkIHRoZWlyXG5cdCAqIHVuZGVybHlpbmcgcmFuZ2VzLiBJIHRoaW5rIHRoaXMgaXMgZ29vZCBlbm91Z2gsIGJlY2F1c2U6XG5cdCAqICAtIE1lc3NhZ2UgZGVjb3JhdGlvbnMgYXJlIG5ldmVyIHNob3duIGFjcm9zcyByZWxvYWRzOyB0aGlzIGRvZXMgbm90XG5cdCAqICAgIG5lZWQgdG8gcGVyc2lzdFxuXHQgKiAgLSBNZXNzYWdlIGluc3RhbmNlcyBhcmUgc3RhYmxlIGZvciBhbnkgY29tcGxldGVkIHRlc3QgcmVzdWx0cyBmb3Jcblx0ICogICAgdGhlIGR1cmF0aW9uIG9mIHRoZSBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBpbnZhbGlkYXRlZE1lc3NhZ2VzID0gbmV3IFdlYWtTZXQ8SVRlc3RNZXNzYWdlPigpO1xuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLmNoYW5nZUVtaXR0ZXIuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXN0U2VydmljZTogSVRlc3RTZXJ2aWNlLFxuXHRcdEBJVGVzdFJlc3VsdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXN1bHRzOiBJVGVzdFJlc3VsdFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29kZUVkaXRvclNlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uVHlwZSgndGVzdC1tZXNzYWdlLWRlY29yYXRpb24nLCBUZXN0TWVzc2FnZURlY29yYXRpb24uZGVjb3JhdGlvbklkLCB7fSwgdW5kZWZpbmVkKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbFNlcnZpY2Uub25Nb2RlbFJlbW92ZWQoZSA9PiB0aGlzLmRlY29yYXRpb25DYWNoZS5kZWxldGUoZS51cmkpKSk7XG5cblx0XHRjb25zdCBkZWJvdW5jZUludmFsaWRhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLmludmFsaWRhdGUoKSwgMTAwKSk7XG5cblx0XHQvLyBJZiByYW5nZXMgd2VyZSB1cGRhdGVkIGluIHRoZSBkb2N1bWVudCwgbWFyayB0aGF0IHdlIHNob3VsZCBleHBsaWNpdGx5XG5cdFx0Ly8gc3luYyBkZWNvcmF0aW9ucyB0byB0aGUgcHVibGlzaGVkIGxpbmVzLCBzaW5jZSB3ZSBhc3N1bWUgdGhhdCBldmVyeXRoaW5nXG5cdFx0Ly8gaXMgdXAgdG8gZGF0ZS4gVGhpcyBwcmV2ZW50cyBpc3N1ZXMsIGFzIGluICMxMzg2MzIsICMxMzg4MzUsICMxMzg5MjIuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZXN0U2VydmljZS5vbldpbGxQcm9jZXNzRGlmZihkaWZmID0+IHtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgZGlmZikge1xuXHRcdFx0XHRpZiAoZW50cnkub3AgIT09IFRlc3REaWZmT3BUeXBlLkRvY3VtZW50U3luY2VkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZWMgPSB0aGlzLmRlY29yYXRpb25DYWNoZS5nZXQoZW50cnkudXJpKTtcblx0XHRcdFx0aWYgKHJlYykge1xuXHRcdFx0XHRcdHJlYy5yYW5nZVVwZGF0ZVZlcnNpb25JZCA9IGVudHJ5LmRvY3Y7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFkZWJvdW5jZUludmFsaWRhdGUuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHRkZWJvdW5jZUludmFsaWRhdGUuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoXG5cdFx0XHR0aGlzLnJlc3VsdHMub25SZXN1bHRzQ2hhbmdlZCxcblx0XHRcdHRoaXMucmVzdWx0cy5vblRlc3RDaGFuZ2VkLFxuXHRcdFx0dGhpcy50ZXN0U2VydmljZS5leGNsdWRlZC5vblRlc3RFeGNsdXNpb25zQ2hhbmdlZCxcblx0XHRcdEV2ZW50LmZpbHRlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXN0aW5nQ29uZmlnS2V5cy5HdXR0ZXJFbmFibGVkKSksXG5cdFx0KSgoKSA9PiB7XG5cdFx0XHRpZiAoIWRlYm91bmNlSW52YWxpZGF0ZS5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdGRlYm91bmNlSW52YWxpZGF0ZS5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEd1dHRlckFjdGlvbnNSZWdpc3RyeS5yZWdpc3Rlckd1dHRlckFjdGlvbnNHZW5lcmF0b3IoKGNvbnRleHQsIHJlc3VsdCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjb250ZXh0LmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0Y29uc3QgdGVzdGluZ0RlY29yYXRpb25zID0gVGVzdGluZ0RlY29yYXRpb25zLmdldChjb250ZXh0LmVkaXRvcik7XG5cdFx0XHRpZiAoIW1vZGVsIHx8ICF0ZXN0aW5nRGVjb3JhdGlvbnM/LmN1cnJlbnRVcmkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdXJyZW50RGVjb3JhdGlvbnMgPSB0aGlzLnN5bmNEZWNvcmF0aW9ucyh0ZXN0aW5nRGVjb3JhdGlvbnMuY3VycmVudFVyaSk7XG5cdFx0XHRpZiAoIWN1cnJlbnREZWNvcmF0aW9ucy5zaXplKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9kZWxEZWNvcmF0aW9ucyA9IG1vZGVsLmdldExpbmVzRGVjb3JhdGlvbnMoY29udGV4dC5saW5lTnVtYmVyLCBjb250ZXh0LmxpbmVOdW1iZXIpO1xuXHRcdFx0Zm9yIChjb25zdCB7IGlkIH0gb2YgbW9kZWxEZWNvcmF0aW9ucykge1xuXHRcdFx0XHRjb25zdCBkZWNvcmF0aW9uID0gY3VycmVudERlY29yYXRpb25zLmdldEJ5SWQoaWQpO1xuXHRcdFx0XHRpZiAoZGVjb3JhdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IHsgb2JqZWN0OiBhY3Rpb25zIH0gPSBkZWNvcmF0aW9uLmdldENvbnRleHRNZW51QWN0aW9ucygpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKGFjdGlvbiwgJzFfdGVzdGluZycpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgaW52YWxpZGF0ZVJlc3VsdE1lc3NhZ2UobWVzc2FnZTogSVRlc3RNZXNzYWdlKSB7XG5cdFx0dGhpcy5pbnZhbGlkYXRlZE1lc3NhZ2VzLmFkZChtZXNzYWdlKTtcblx0XHR0aGlzLmludmFsaWRhdGUoKTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgc3luY0RlY29yYXRpb25zKHJlc291cmNlOiBVUkkpOiBDYWNoZWREZWNvcmF0aW9ucyB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIG5ldyBDYWNoZWREZWNvcmF0aW9ucygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuZGVjb3JhdGlvbkNhY2hlLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKGNhY2hlZCAmJiBjYWNoZWQuZ2VuZXJhdGlvbiA9PT0gdGhpcy5nZW5lcmF0aW9uICYmIChjYWNoZWQucmFuZ2VVcGRhdGVWZXJzaW9uSWQgPT09IHVuZGVmaW5lZCB8fCBjYWNoZWQucmFuZ2VVcGRhdGVWZXJzaW9uSWQgIT09IG1vZGVsLmdldFZlcnNpb25JZCgpKSkge1xuXHRcdFx0cmV0dXJuIGNhY2hlZC52YWx1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5hcHBseURlY29yYXRpb25zKG1vZGVsKTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgZ2V0RGVjb3JhdGVkVGVzdFBvc2l0aW9uKHJlc291cmNlOiBVUkksIHRlc3RJZDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBkZWNvcmF0aW9uID0gSXRlcmFibGUuZmluZCh0aGlzLnN5bmNEZWNvcmF0aW9ucyhyZXNvdXJjZSksIHYgPT4gdiBpbnN0YW5jZW9mIFJ1blRlc3REZWNvcmF0aW9uICYmIHYuaXNGb3JUZXN0KHRlc3RJZCkpO1xuXHRcdGlmICghZGVjb3JhdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBkZWNvcmF0aW9uIGlzIGNvbGxhcHNlZCwgc28gdGhlIHJhbmdlIGlzIG1lYW5pbmdsZXNzOyBvbmx5IHBvc2l0aW9uIG1hdHRlcnMuXG5cdFx0cmV0dXJuIG1vZGVsLmdldERlY29yYXRpb25SYW5nZShkZWNvcmF0aW9uLmlkKT8uZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbnZhbGlkYXRlKCkge1xuXHRcdHRoaXMuZ2VuZXJhdGlvbisrO1xuXHRcdHRoaXMuY2hhbmdlRW1pdHRlci5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogU2V0cyB3aGV0aGVyIGFsdGVybmF0ZSBhY3Rpb25zIGFyZSBzaG93biBmb3IgdGhlIG1vZGVsLlxuXHQgKi9cblx0cHVibGljIHVwZGF0ZURlY29yYXRpb25zQWx0ZXJuYXRlQWN0aW9uKHJlc291cmNlOiBVUkksIGlzQWx0OiBib29sZWFuKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5kZWNvcmF0aW9uQ2FjaGUuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAoIW1vZGVsIHx8ICFjYWNoZWQgfHwgY2FjaGVkLmlzQWx0ID09PSBpc0FsdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNhY2hlZC5pc0FsdCA9IGlzQWx0O1xuXHRcdG1vZGVsLmNoYW5nZURlY29yYXRpb25zKGFjY2Vzc29yID0+IHtcblx0XHRcdGZvciAoY29uc3QgZGVjb3JhdGlvbiBvZiBjYWNoZWQudmFsdWUpIHtcblx0XHRcdFx0aWYgKGRlY29yYXRpb24gaW5zdGFuY2VvZiBSdW5UZXN0RGVjb3JhdGlvbiAmJiBkZWNvcmF0aW9uLmVkaXRvckRlY29yYXRpb24uYWx0ZXJuYXRlKSB7XG5cdFx0XHRcdFx0YWNjZXNzb3IuY2hhbmdlRGVjb3JhdGlvbk9wdGlvbnMoXG5cdFx0XHRcdFx0XHRkZWNvcmF0aW9uLmlkLFxuXHRcdFx0XHRcdFx0aXNBbHQgPyBkZWNvcmF0aW9uLmVkaXRvckRlY29yYXRpb24uYWx0ZXJuYXRlIDogZGVjb3JhdGlvbi5lZGl0b3JEZWNvcmF0aW9uLm9wdGlvbnMsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGxpZXMgdGhlIGN1cnJlbnQgc2V0IG9mIHRlc3QgZGVjb3JhdGlvbnMgdG8gdGhlIGdpdmVuIHRleHQgbW9kZWwuXG5cdCAqL1xuXHRwcml2YXRlIGFwcGx5RGVjb3JhdGlvbnMobW9kZWw6IElUZXh0TW9kZWwpIHtcblx0XHRjb25zdCBndXR0ZXJFbmFibGVkID0gZ2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgVGVzdGluZ0NvbmZpZ0tleXMuR3V0dGVyRW5hYmxlZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5kZWNvcmF0aW9uQ2FjaGUuZ2V0KG1vZGVsLnVyaSk7XG5cdFx0Y29uc3QgdGVzdFJhbmdlc1VwZGF0ZWQgPSBjYWNoZWQ/LnJhbmdlVXBkYXRlVmVyc2lvbklkID09PSBtb2RlbC5nZXRWZXJzaW9uSWQoKTtcblx0XHRjb25zdCBsYXN0RGVjb3JhdGlvbnMgPSBjYWNoZWQ/LnZhbHVlID8/IG5ldyBDYWNoZWREZWNvcmF0aW9ucygpO1xuXG5cdFx0Y29uc3QgbmV3RGVjb3JhdGlvbnMgPSBtb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCBuZXdEZWNvcmF0aW9ucyA9IG5ldyBDYWNoZWREZWNvcmF0aW9ucygpO1xuXHRcdFx0Y29uc3QgcnVuRGVjb3JhdGlvbnMgPSBuZXcgVGVzdERlY29yYXRpb25zPHsgbGluZTogbnVtYmVyOyBpZDogJyc7IHRlc3Q6IEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtOyByZXN1bHRJdGVtOiBUZXN0UmVzdWx0SXRlbSB8IHVuZGVmaW5lZCB9PigpO1xuXHRcdFx0Zm9yIChjb25zdCB0ZXN0IG9mIHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbi5nZXROb2RlQnlVcmwobW9kZWwudXJpKSkge1xuXHRcdFx0XHRpZiAoIXRlc3QuaXRlbS5yYW5nZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc3RhdGVMb29rdXAgPSB0aGlzLnJlc3VsdHMuZ2V0U3RhdGVCeUlkKHRlc3QuaXRlbS5leHRJZCk7XG5cdFx0XHRcdGNvbnN0IGxpbmUgPSB0ZXN0Lml0ZW0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRydW5EZWNvcmF0aW9ucy5wdXNoKHsgbGluZSwgaWQ6ICcnLCB0ZXN0LCByZXN1bHRJdGVtOiBzdGF0ZUxvb2t1cD8uWzFdIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IFtsaW5lLCB0ZXN0c10gb2YgcnVuRGVjb3JhdGlvbnMubGluZXMoKSkge1xuXHRcdFx0XHRjb25zdCBtdWx0aSA9IHRlc3RzLmxlbmd0aCA+IDE7XG5cdFx0XHRcdGxldCBleGlzdGluZyA9IGxhc3REZWNvcmF0aW9ucy5nZXRGb3JFeGFjdFRlc3RzKHRlc3RzLm1hcCh0ID0+IHQudGVzdC5pdGVtLmV4dElkKSk7XG5cblx0XHRcdFx0Ly8gc2VlIGNvbW1lbnQgaW4gdGhlIGNvbnN0cnVjdG9yIGZvciB3aGF0J3MgZ29pbmcgb24gaGVyZVxuXHRcdFx0XHRpZiAoZXhpc3RpbmcgJiYgdGVzdFJhbmdlc1VwZGF0ZWQgJiYgbW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKGV4aXN0aW5nLmlkKT8uc3RhcnRMaW5lTnVtYmVyICE9PSBsaW5lKSB7XG5cdFx0XHRcdFx0ZXhpc3RpbmcgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0XHRpZiAoZXhpc3RpbmcucmVwbGFjZU9wdGlvbnModGVzdHMsIGd1dHRlckVuYWJsZWQpKSB7XG5cdFx0XHRcdFx0XHRhY2Nlc3Nvci5jaGFuZ2VEZWNvcmF0aW9uT3B0aW9ucyhleGlzdGluZy5pZCwgZXhpc3RpbmcuZWRpdG9yRGVjb3JhdGlvbi5vcHRpb25zKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bmV3RGVjb3JhdGlvbnMuYWRkVGVzdChleGlzdGluZyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bmV3RGVjb3JhdGlvbnMuYWRkVGVzdChtdWx0aVxuXHRcdFx0XHRcdFx0PyB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE11bHRpUnVuVGVzdERlY29yYXRpb24sIHRlc3RzLCBndXR0ZXJFbmFibGVkLCBtb2RlbClcblx0XHRcdFx0XHRcdDogdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSdW5TaW5nbGVUZXN0RGVjb3JhdGlvbiwgdGVzdHNbMF0udGVzdCwgdGVzdHNbMF0ucmVzdWx0SXRlbSwgbW9kZWwsIGd1dHRlckVuYWJsZWQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzYXZlRnJvbVJlbW92YWwgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGZvciAoY29uc3QgZGVjb3JhdGlvbiBvZiBuZXdEZWNvcmF0aW9ucykge1xuXHRcdFx0XHRpZiAoZGVjb3JhdGlvbi5pZCA9PT0gJycpIHtcblx0XHRcdFx0XHRkZWNvcmF0aW9uLmlkID0gYWNjZXNzb3IuYWRkRGVjb3JhdGlvbihkZWNvcmF0aW9uLmVkaXRvckRlY29yYXRpb24ucmFuZ2UsIGRlY29yYXRpb24uZWRpdG9yRGVjb3JhdGlvbi5vcHRpb25zKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzYXZlRnJvbVJlbW92YWwuYWRkKGRlY29yYXRpb24uaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZGVjb3JhdGlvbiBvZiBsYXN0RGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0aWYgKCFzYXZlRnJvbVJlbW92YWwuaGFzKGRlY29yYXRpb24uaWQpKSB7XG5cdFx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlRGVjb3JhdGlvbihkZWNvcmF0aW9uLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmRlY29yYXRpb25DYWNoZS5zZXQobW9kZWwudXJpLCB7XG5cdFx0XHRcdGdlbmVyYXRpb246IHRoaXMuZ2VuZXJhdGlvbixcblx0XHRcdFx0cmFuZ2VVcGRhdGVWZXJzaW9uSWQ6IGNhY2hlZD8ucmFuZ2VVcGRhdGVWZXJzaW9uSWQsXG5cdFx0XHRcdHZhbHVlOiBuZXdEZWNvcmF0aW9ucyxcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gbmV3RGVjb3JhdGlvbnM7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gbmV3RGVjb3JhdGlvbnMgfHwgbGFzdERlY29yYXRpb25zO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0aW5nRGVjb3JhdGlvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cdC8qKlxuXHQgKiBSZXN1bHRzIGludmFsaWRhdGVkIGJ5IGVkaXRvciBjaGFuZ2VzLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBpbnZhbGlkYXRlZFRlc3RzID0gbmV3IFdlYWtTZXQ8VGVzdFJlc3VsdEl0ZW0gfCBJVGVzdE1lc3NhZ2U+KCk7XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIGRlY29yYXRpb25zIGFzc29jaWF0ZWQgd2l0aCB0aGUgZ2l2ZW4gY29kZSBlZGl0b3IuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogVGVzdGluZ0RlY29yYXRpb25zIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248VGVzdGluZ0RlY29yYXRpb25zPihUZXN0aW5nLkRlY29yYXRpb25zQ29udHJpYnV0aW9uSWQpO1xuXHR9XG5cblx0cHVibGljIGdldCBjdXJyZW50VXJpKCkgeyByZXR1cm4gdGhpcy5fY3VycmVudFVyaTsgfVxuXG5cdHByaXZhdGUgX2N1cnJlbnRVcmk/OiBVUkk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZXhwZWN0ZWRXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RXhwZWN0ZWRMZW5zQ29udGVudFdpZGdldD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0dWFsV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPEFjdHVhbExlbnNDb250ZW50V2lkZ2V0PigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVycm9yQ29udGVudFdpZGdldHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxJVGVzdE1lc3NhZ2UsIFRlc3RFcnJvckNvbnRlbnRXaWRnZXQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGxvZ2dlZE1lc3NhZ2VEZWNvcmF0aW9ucyA9IG5ldyBNYXA8SVRlc3RNZXNzYWdlLCB7XG5cdFx0aWQ6IHN0cmluZztcblx0XHRsaW5lOiBudW1iZXI7XG5cdFx0cmVzdWx0SXRlbTogVGVzdFJlc3VsdEl0ZW0gfCB1bmRlZmluZWQ7XG5cdH0+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXN0U2VydmljZTogSVRlc3RTZXJ2aWNlLFxuXHRcdEBJVGVzdGluZ0RlY29yYXRpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlY29yYXRpb25zOiBJVGVzdGluZ0RlY29yYXRpb25zU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASVRlc3RSZXN1bHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVzdWx0czogSVRlc3RSZXN1bHRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29kZUVkaXRvclNlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uVHlwZSgndGVzdC1tZXNzYWdlLWRlY29yYXRpb24nLCBUZXN0TWVzc2FnZURlY29yYXRpb24uZGVjb3JhdGlvbklkLCB7fSwgdW5kZWZpbmVkLCBlZGl0b3IpKTtcblxuXHRcdHRoaXMuYXR0YWNoTW9kZWwoZWRpdG9yLmdldE1vZGVsKCk/LnVyaSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGVjb3JhdGlvbnMub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRVcmkpIHtcblx0XHRcdFx0ZGVjb3JhdGlvbnMuc3luY0RlY29yYXRpb25zKHRoaXMuX2N1cnJlbnRVcmkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1zZ1Rocm90dGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZXIoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZXN1bHRzLm9uVGVzdENoYW5nZWQoZXYgPT4ge1xuXHRcdFx0aWYgKGV2LnJlYXNvbiAhPT0gVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24uTmV3TWVzc2FnZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdG1zZ1Rocm90dGxlci5xdWV1ZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuYXBwbHlSZXN1bHRzKCk7XG5cdFx0XHRcdHJldHVybiB0aW1lb3V0KDEwMCk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoXG5cdFx0XHR0aGlzLnJlc3VsdHMub25SZXN1bHRzQ2hhbmdlZCxcblx0XHRcdGVkaXRvci5vbkRpZENoYW5nZU1vZGVsLFxuXHRcdFx0dGhpcy50ZXN0U2VydmljZS5zaG93SW5saW5lT3V0cHV0Lm9uRGlkQ2hhbmdlLFxuXHRcdCkoKCkgPT4gdGhpcy5hcHBseVJlc3VsdHMoKSkpO1xuXG5cdFx0Y29uc3Qgd2luID0gZG9tLmdldFdpbmRvdyhlZGl0b3IuZ2V0RG9tTm9kZSgpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbiwgJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdGlmIChuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpLmtleUNvZGUgPT09IEtleUNvZGUuQWx0ICYmIHRoaXMuX2N1cnJlbnRVcmkpIHtcblx0XHRcdFx0ZGVjb3JhdGlvbnMudXBkYXRlRGVjb3JhdGlvbnNBbHRlcm5hdGVBY3Rpb24odGhpcy5fY3VycmVudFVyaSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIod2luLCAna2V5dXAnLCBlID0+IHtcblx0XHRcdGlmIChuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpLmtleUNvZGUgPT09IEtleUNvZGUuQWx0ICYmIHRoaXMuX2N1cnJlbnRVcmkpIHtcblx0XHRcdFx0ZGVjb3JhdGlvbnMudXBkYXRlRGVjb3JhdGlvbnNBbHRlcm5hdGVBY3Rpb24odGhpcy5fY3VycmVudFVyaSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbiwgJ2JsdXInLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudFVyaSkge1xuXHRcdFx0XHRkZWNvcmF0aW9ucy51cGRhdGVEZWNvcmF0aW9uc0FsdGVybmF0ZUFjdGlvbih0aGlzLl9jdXJyZW50VXJpLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uS2V5VXAoZSA9PiB7XG5cdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkFsdCAmJiB0aGlzLl9jdXJyZW50VXJpKSB7XG5cdFx0XHRcdGRlY29yYXRpb25zLnVwZGF0ZURlY29yYXRpb25zQWx0ZXJuYXRlQWN0aW9uKHRoaXMuX2N1cnJlbnRVcmkhLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoZSA9PiB0aGlzLmF0dGFjaE1vZGVsKGUubmV3TW9kZWxVcmwgfHwgdW5kZWZpbmVkKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uTW91c2VEb3duKGUgPT4ge1xuXHRcdFx0aWYgKGUudGFyZ2V0LnBvc2l0aW9uICYmIHRoaXMuY3VycmVudFVyaSkge1xuXHRcdFx0XHRjb25zdCBtb2RlbERlY29yYXRpb25zID0gZWRpdG9yLmdldE1vZGVsKCk/LmdldExpbmVEZWNvcmF0aW9ucyhlLnRhcmdldC5wb3NpdGlvbi5saW5lTnVtYmVyKSA/PyBbXTtcblx0XHRcdFx0aWYgKCFtb2RlbERlY29yYXRpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNhY2hlID0gZGVjb3JhdGlvbnMuc3luY0RlY29yYXRpb25zKHRoaXMuY3VycmVudFVyaSk7XG5cdFx0XHRcdGZvciAoY29uc3QgeyBpZCB9IG9mIG1vZGVsRGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0XHRpZiAoKGNhY2hlLmdldEJ5SWQoaWQpIGFzIElUZXN0RGVjb3JhdGlvbiB8IHVuZGVmaW5lZCk/LmNsaWNrKGUpKSB7XG5cdFx0XHRcdFx0XHRlLmV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hY2N1bXVsYXRlKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50LCAwLCB1bmRlZmluZWQsIHRoaXMuX3N0b3JlKShldnRzID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAoIXRoaXMuX2N1cnJlbnRVcmkgfHwgIW1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3QgW21lc3NhZ2UsIGRlY29dIG9mIHRoaXMubG9nZ2VkTWVzc2FnZURlY29yYXRpb25zKSB7XG5cdFx0XHRcdC8vIGludmFsaWRhdGUgZGVjb3JhdGlvbnMgaWYgZWl0aGVyIHRoZSBsaW5lIHRoZXkncmUgb24gd2FzIGNoYW5nZWQsXG5cdFx0XHRcdC8vIG9yIGlmIHRoZSByYW5nZSBvZiB0aGUgdGVzdCB3YXMgY2hhbmdlZC4gVGhlIHJhbmdlIG9mIHRoZSB0ZXN0IGlzXG5cdFx0XHRcdC8vIG5vdCBhbHdheXMgcHJlc2VudCwgc28gY2hlY2sgYm8uXG5cdFx0XHRcdGNvbnN0IGludmFsaWRhdGUgPSBldnRzLnNvbWUoZSA9PiBlLmNoYW5nZXMuc29tZShjID0+XG5cdFx0XHRcdFx0Yy5yYW5nZS5zdGFydExpbmVOdW1iZXIgPD0gZGVjby5saW5lICYmIGMucmFuZ2UuZW5kTGluZU51bWJlciA+PSBkZWNvLmxpbmVcblx0XHRcdFx0XHR8fCAoZGVjby5yZXN1bHRJdGVtPy5pdGVtLnJhbmdlICYmIGRlY28ucmVzdWx0SXRlbS5pdGVtLnJhbmdlLnN0YXJ0TGluZU51bWJlciA8PSBjLnJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiBkZWNvLnJlc3VsdEl0ZW0uaXRlbS5yYW5nZS5lbmRMaW5lTnVtYmVyID49IGMucmFuZ2UuZW5kTGluZU51bWJlcilcblx0XHRcdFx0KSk7XG5cblx0XHRcdFx0aWYgKGludmFsaWRhdGUpIHtcblx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRUZXN0aW5nRGVjb3JhdGlvbnMuaW52YWxpZGF0ZWRUZXN0cy5hZGQoZGVjby5yZXN1bHRJdGVtIHx8IG1lc3NhZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMuYXBwbHlSZXN1bHRzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlRm9udEZhbWlseVZhciA9ICgpID0+IHtcblx0XHRcdHRoaXMuZWRpdG9yLmdldENvbnRhaW5lckRvbU5vZGUoKS5zdHlsZS5zZXRQcm9wZXJ0eSgnLS10ZXN0TWVzc2FnZURlY29yYXRpb25Gb250RmFtaWx5JywgZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEZhbWlseSkpO1xuXHRcdFx0dGhpcy5lZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpLnN0eWxlLnNldFByb3BlcnR5KCctLXRlc3RNZXNzYWdlRGVjb3JhdGlvbkZvbnRTaXplJywgYCR7ZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udFNpemUpfXB4YCk7XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZvbnRGYW1pbHkpKSB7XG5cdFx0XHRcdHVwZGF0ZUZvbnRGYW1pbHlWYXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dXBkYXRlRm9udEZhbWlseVZhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBhdHRhY2hNb2RlbCh1cmk/OiBVUkkpIHtcblx0XHRzd2l0Y2ggKHVyaSAmJiBwYXJzZVRlc3RVcmkodXJpKT8udHlwZSkge1xuXHRcdFx0Y2FzZSBUZXN0VXJpVHlwZS5SZXN1bHRFeHBlY3RlZE91dHB1dDpcblx0XHRcdFx0dGhpcy5leHBlY3RlZFdpZGdldC52YWx1ZSA9IG5ldyBFeHBlY3RlZExlbnNDb250ZW50V2lkZ2V0KHRoaXMuZWRpdG9yKTtcblx0XHRcdFx0dGhpcy5hY3R1YWxXaWRnZXQuY2xlYXIoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFRlc3RVcmlUeXBlLlJlc3VsdEFjdHVhbE91dHB1dDpcblx0XHRcdFx0dGhpcy5leHBlY3RlZFdpZGdldC5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLmFjdHVhbFdpZGdldC52YWx1ZSA9IG5ldyBBY3R1YWxMZW5zQ29udGVudFdpZGdldCh0aGlzLmVkaXRvcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhpcy5leHBlY3RlZFdpZGdldC5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLmFjdHVhbFdpZGdldC5jbGVhcigpO1xuXHRcdH1cblxuXHRcdGlmIChpc09yaWdpbmFsSW5EaWZmRWRpdG9yKHRoaXMuY29kZUVkaXRvclNlcnZpY2UsIHRoaXMuZWRpdG9yKSkge1xuXHRcdFx0dXJpID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX2N1cnJlbnRVcmkgPSB1cmk7XG5cblx0XHRpZiAoIXVyaSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZGVjb3JhdGlvbnMuc3luY0RlY29yYXRpb25zKHVyaSk7XG5cblx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBfdGVzdHMgb2YgdGVzdHNJbkZpbGUodGhpcy50ZXN0U2VydmljZSwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UsIHVyaSwgZmFsc2UpKSB7XG5cdFx0XHRcdC8vIGNvbnN1bWUgdGhlIGl0ZXJhdG9yIHNvIHRoYXQgYWxsIHRlc3RzIGluIHRoZSBmaWxlIGdldCBleHBhbmRlZC4gT3Jcblx0XHRcdFx0Ly8gYXQgbGVhc3QgdW50aWwgdGhlIFVSSSBjaGFuZ2VzLiBJZiBuZXcgaXRlbXMgYXJlIHJlcXVlc3RlZCwgY2hhbmdlc1xuXHRcdFx0XHQvLyB3aWxsIGJlIHRyaWdnZWQgaW4gdGhlIGBvbkRpZFByb2Nlc3NEaWZmYCBjYWxsYmFjay5cblx0XHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRVcmkgIT09IHVyaSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkoKTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlSZXN1bHRzKCkge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jbGVhclJlc3VsdHMoKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cmlTdHIgPSBtb2RlbC51cmkudG9TdHJpbmcoKTtcblx0XHRjb25zdCBzZWVuTGluZXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0XHR0aGlzLmFwcGx5UmVzdWx0c0NvbnRlbnRXaWRnZXRzKHVyaVN0ciwgc2VlbkxpbmVzKTtcblx0XHR0aGlzLmFwcGx5UmVzdWx0c0xvZ2dlZE1lc3NhZ2VzKHVyaVN0ciwgc2VlbkxpbmVzKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJSZXN1bHRzKCkge1xuXHRcdHRoaXMuZXJyb3JDb250ZW50V2lkZ2V0cy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0fVxuXG5cdHByaXZhdGUgaXNNZXNzYWdlSW52YWxpZGF0ZWQobWVzc2FnZTogSVRlc3RNZXNzYWdlKSB7XG5cdFx0cmV0dXJuIFRlc3RpbmdEZWNvcmF0aW9ucy5pbnZhbGlkYXRlZFRlc3RzLmhhcyhtZXNzYWdlKTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlSZXN1bHRzQ29udGVudFdpZGdldHModXJpU3RyOiBzdHJpbmcsIHNlZW5MaW5lczogU2V0PG51bWJlcj4pIHtcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxJVGVzdE1lc3NhZ2U+KCk7XG5cdFx0aWYgKGdldFRlc3RpbmdDb25maWd1cmF0aW9uKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIFRlc3RpbmdDb25maWdLZXlzLlNob3dBbGxNZXNzYWdlcykpIHtcblx0XHRcdHRoaXMucmVzdWx0cy5yZXN1bHRzLmZvckVhY2gobGFzdFJlc3VsdCA9PiB0aGlzLmFwcGx5Q29udGVudFdpZGdldHNGcm9tUmVzdWx0KGxhc3RSZXN1bHQsIHVyaVN0ciwgc2Vlbiwgc2VlbkxpbmVzKSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnJlc3VsdHMucmVzdWx0cy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuYXBwbHlDb250ZW50V2lkZ2V0c0Zyb21SZXN1bHQodGhpcy5yZXN1bHRzLnJlc3VsdHNbMF0sIHVyaVN0ciwgc2Vlbiwgc2VlbkxpbmVzKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgdGhpcy5lcnJvckNvbnRlbnRXaWRnZXRzLmtleXMoKSkge1xuXHRcdFx0aWYgKCFzZWVuLmhhcyhtZXNzYWdlKSkge1xuXHRcdFx0XHR0aGlzLmVycm9yQ29udGVudFdpZGdldHMuZGVsZXRlQW5kRGlzcG9zZShtZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5Q29udGVudFdpZGdldHNGcm9tUmVzdWx0KGxhc3RSZXN1bHQ6IElUZXN0UmVzdWx0LCB1cmlTdHI6IHN0cmluZywgc2VlbjogU2V0PElUZXN0TWVzc2FnZT4sIHNlZW5MaW5lczogU2V0PG51bWJlcj4pIHtcblx0XHRmb3IgKGNvbnN0IHRlc3Qgb2YgbGFzdFJlc3VsdC50ZXN0cykge1xuXHRcdFx0aWYgKFRlc3RpbmdEZWNvcmF0aW9ucy5pbnZhbGlkYXRlZFRlc3RzLmhhcyh0ZXN0KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAobGV0IHRhc2tJZCA9IDA7IHRhc2tJZCA8IHRlc3QudGFza3MubGVuZ3RoOyB0YXNrSWQrKykge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRlc3QudGFza3NbdGFza0lkXTtcblx0XHRcdFx0Ly8gcHVzaCBlcnJvciBkZWNvcmF0aW9ucyBmaXJzdCBzbyB0aGV5IHRha2UgcHJlY2VkZW5jZSBvdmVyIG5vcm1hbCBvdXRwdXRcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzdGF0ZS5tZXNzYWdlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IG0gPSBzdGF0ZS5tZXNzYWdlc1tpXTtcblx0XHRcdFx0XHRpZiAobS50eXBlICE9PSBUZXN0TWVzc2FnZVR5cGUuRXJyb3IgfHwgdGhpcy5pc01lc3NhZ2VJbnZhbGlkYXRlZChtKSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgbGluZTogbnVtYmVyIHwgdW5kZWZpbmVkID0gbS5sb2NhdGlvbj8udXJpLnRvU3RyaW5nKCkgPT09IHVyaVN0clxuXHRcdFx0XHRcdFx0PyBtLmxvY2F0aW9uLnJhbmdlLnN0YXJ0TGluZU51bWJlclxuXHRcdFx0XHRcdFx0OiBtLnN0YWNrVHJhY2UgJiYgbWFwRmluZEZpcnN0KG0uc3RhY2tUcmFjZSwgKGYpID0+IGYucG9zaXRpb24gJiYgZi51cmk/LnRvU3RyaW5nKCkgPT09IHVyaVN0ciA/IGYucG9zaXRpb24ubGluZU51bWJlciA6IHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0aWYgKGxpbmUgPT09IHVuZGVmaW5lZCB8fCBzZWVuTGluZXMuaGFzKGxpbmUpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRzZWVuTGluZXMuYWRkKGxpbmUpO1xuXHRcdFx0XHRcdGxldCBkZWNvID0gdGhpcy5lcnJvckNvbnRlbnRXaWRnZXRzLmdldChtKTtcblx0XHRcdFx0XHRpZiAoIWRlY28pIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmVMZW5ndGggPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpPy5nZXRMaW5lTGVuZ3RoKGxpbmUpID8/IDEwMDtcblx0XHRcdFx0XHRcdGRlY28gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdFx0XHRUZXN0RXJyb3JDb250ZW50V2lkZ2V0LFxuXHRcdFx0XHRcdFx0XHR0aGlzLmVkaXRvcixcblx0XHRcdFx0XHRcdFx0bmV3IFBvc2l0aW9uKGxpbmUsIGxpbmVMZW5ndGggKyAxKSxcblx0XHRcdFx0XHRcdFx0bSxcblx0XHRcdFx0XHRcdFx0dGVzdCxcblx0XHRcdFx0XHRcdFx0YnVpbGRUZXN0VXJpKHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiBUZXN0VXJpVHlwZS5SZXN1bHRBY3R1YWxPdXRwdXQsXG5cdFx0XHRcdFx0XHRcdFx0bWVzc2FnZUluZGV4OiBpLFxuXHRcdFx0XHRcdFx0XHRcdHRhc2tJbmRleDogdGFza0lkLFxuXHRcdFx0XHRcdFx0XHRcdHJlc3VsdElkOiBsYXN0UmVzdWx0LmlkLFxuXHRcdFx0XHRcdFx0XHRcdHRlc3RFeHRJZDogdGVzdC5pdGVtLmV4dElkLFxuXHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHRoaXMuZXJyb3JDb250ZW50V2lkZ2V0cy5zZXQobSwgZGVjbyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHNlZW4uYWRkKG0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhcHBseVJlc3VsdHNMb2dnZWRNZXNzYWdlcyh1cmlTdHI6IHN0cmluZywgbWVzc2FnZUxpbmVzOiBTZXQ8bnVtYmVyPikge1xuXHRcdHRoaXMuZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKGFjY2Vzc29yID0+IHtcblx0XHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PElUZXN0TWVzc2FnZT4oKTtcblx0XHRcdGlmIChnZXRUZXN0aW5nQ29uZmlndXJhdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0aW5nQ29uZmlnS2V5cy5TaG93QWxsTWVzc2FnZXMpKSB7XG5cdFx0XHRcdHRoaXMucmVzdWx0cy5yZXN1bHRzLmZvckVhY2gociA9PiB0aGlzLmFwcGx5TG9nZ2VkTWVzc2FnZUZyb21SZXN1bHQociwgdXJpU3RyLCBzZWVuLCBtZXNzYWdlTGluZXMsIGFjY2Vzc29yKSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMucmVzdWx0cy5yZXN1bHRzLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLmFwcGx5TG9nZ2VkTWVzc2FnZUZyb21SZXN1bHQodGhpcy5yZXN1bHRzLnJlc3VsdHNbMF0sIHVyaVN0ciwgc2VlbiwgbWVzc2FnZUxpbmVzLCBhY2Nlc3Nvcik7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgW21lc3NhZ2UsIHsgaWQgfV0gb2YgdGhpcy5sb2dnZWRNZXNzYWdlRGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0aWYgKCFzZWVuLmhhcyhtZXNzYWdlKSkge1xuXHRcdFx0XHRcdGFjY2Vzc29yLnJlbW92ZURlY29yYXRpb24oaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5TG9nZ2VkTWVzc2FnZUZyb21SZXN1bHQobGFzdFJlc3VsdDogSVRlc3RSZXN1bHQsIHVyaVN0cjogc3RyaW5nLCBzZWVuOiBTZXQ8SVRlc3RNZXNzYWdlPiwgbWVzc2FnZUxpbmVzOiBTZXQ8bnVtYmVyPiwgYWNjZXNzb3I6IElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IpIHtcblx0XHRpZiAoIXRoaXMudGVzdFNlcnZpY2Uuc2hvd0lubGluZU91dHB1dC52YWx1ZSB8fCAhKGxhc3RSZXN1bHQgaW5zdGFuY2VvZiBMaXZlVGVzdFJlc3VsdCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0cnlBZGQgPSAocmVzdWx0SXRlbTogVGVzdFJlc3VsdEl0ZW0gfCB1bmRlZmluZWQsIG06IElUZXN0TWVzc2FnZSwgdXJpPzogVVJJKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc01lc3NhZ2VJbnZhbGlkYXRlZChtKSB8fCBtLmxvY2F0aW9uPy51cmkudG9TdHJpbmcoKSAhPT0gdXJpU3RyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0c2Vlbi5hZGQobSk7XG5cdFx0XHRjb25zdCBsaW5lID0gbS5sb2NhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRpZiAobWVzc2FnZUxpbmVzLmhhcyhsaW5lKSB8fCB0aGlzLmxvZ2dlZE1lc3NhZ2VEZWNvcmF0aW9ucy5oYXMobSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWNvID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0TWVzc2FnZURlY29yYXRpb24sIG0sIHVyaSwgdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKSEpO1xuXG5cdFx0XHRtZXNzYWdlTGluZXMuYWRkKGxpbmUpO1xuXHRcdFx0Y29uc3QgaWQgPSBhY2Nlc3Nvci5hZGREZWNvcmF0aW9uKFxuXHRcdFx0XHRkZWNvLmVkaXRvckRlY29yYXRpb24ucmFuZ2UsXG5cdFx0XHRcdGRlY28uZWRpdG9yRGVjb3JhdGlvbi5vcHRpb25zLFxuXHRcdFx0KTtcblx0XHRcdHRoaXMubG9nZ2VkTWVzc2FnZURlY29yYXRpb25zLnNldChtLCB7IGlkLCBsaW5lLCByZXN1bHRJdGVtIH0pO1xuXHRcdH07XG5cblx0XHRmb3IgKGNvbnN0IHRlc3Qgb2YgbGFzdFJlc3VsdC50ZXN0cykge1xuXHRcdFx0aWYgKFRlc3RpbmdEZWNvcmF0aW9ucy5pbnZhbGlkYXRlZFRlc3RzLmhhcyh0ZXN0KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChsZXQgdGFza0lkID0gMDsgdGFza0lkIDwgdGVzdC50YXNrcy5sZW5ndGg7IHRhc2tJZCsrKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gdGVzdC50YXNrc1t0YXNrSWRdO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gc3RhdGUubWVzc2FnZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0XHRjb25zdCBtID0gc3RhdGUubWVzc2FnZXNbaV07XG5cdFx0XHRcdFx0aWYgKG0udHlwZSA9PT0gVGVzdE1lc3NhZ2VUeXBlLk91dHB1dCkge1xuXHRcdFx0XHRcdFx0dHJ5QWRkKHRlc3QsIG0sIGJ1aWxkVGVzdFVyaSh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IFRlc3RVcmlUeXBlLlJlc3VsdEFjdHVhbE91dHB1dCxcblx0XHRcdFx0XHRcdFx0bWVzc2FnZUluZGV4OiBpLFxuXHRcdFx0XHRcdFx0XHR0YXNrSW5kZXg6IHRhc2tJZCxcblx0XHRcdFx0XHRcdFx0cmVzdWx0SWQ6IGxhc3RSZXN1bHQuaWQsXG5cdFx0XHRcdFx0XHRcdHRlc3RFeHRJZDogdGVzdC5pdGVtLmV4dElkLFxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgdGFzayBvZiBsYXN0UmVzdWx0LnRhc2tzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG0gb2YgdGFzay5vdGhlck1lc3NhZ2VzKSB7XG5cdFx0XHRcdHRyeUFkZCh1bmRlZmluZWQsIG0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5jb25zdCBjb2xsYXBzZVJhbmdlID0gKG9yaWdpbmFsUmFuZ2U6IElSYW5nZSkgPT4gKHtcblx0c3RhcnRMaW5lTnVtYmVyOiBvcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0ZW5kTGluZU51bWJlcjogb3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdHN0YXJ0Q29sdW1uOiBvcmlnaW5hbFJhbmdlLnN0YXJ0Q29sdW1uLFxuXHRlbmRDb2x1bW46IG9yaWdpbmFsUmFuZ2Uuc3RhcnRDb2x1bW4sXG59KTtcblxuY29uc3QgY3JlYXRlUnVuVGVzdERlY29yYXRpb24gPSAoXG5cdHRlc3RzOiByZWFkb25seSBJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbVtdLFxuXHRzdGF0ZXM6IHJlYWRvbmx5IChUZXN0UmVzdWx0SXRlbSB8IHVuZGVmaW5lZClbXSxcblx0dmlzaWJsZTogYm9vbGVhbixcblx0ZGVmYXVsdEd1dHRlckFjdGlvbjogRGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uLFxuKTogSU1vZGVsRGVsdGFEZWNvcmF0aW9uICYgeyBhbHRlcm5hdGU/OiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9ID0+IHtcblx0Y29uc3QgcmFuZ2UgPSB0ZXN0c1swXT8uaXRlbS5yYW5nZTtcblx0aWYgKCFyYW5nZSkge1xuXHRcdHRocm93IG5ldyBFcnJvcignVGVzdCBkZWNvcmF0aW9ucyBjYW4gb25seSBiZSBjcmVhdGVkIGZvciB0ZXN0cyB3aXRoIGEgcmFuZ2UnKTtcblx0fVxuXG5cdGlmICghdmlzaWJsZSkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogY29sbGFwc2VSYW5nZShyYW5nZSksXG5cdFx0XHRvcHRpb25zOiB7IGlzV2hvbGVMaW5lOiB0cnVlLCBkZXNjcmlwdGlvbjogJ3J1bi10ZXN0LWRlY29yYXRpb24nIH0sXG5cdFx0fTtcblx0fVxuXG5cdGxldCBjb21wdXRlZFN0YXRlID0gVGVzdFJlc3VsdFN0YXRlLlVuc2V0O1xuXHRjb25zdCBob3Zlck1lc3NhZ2VQYXJ0czogc3RyaW5nW10gPSBbXTtcblx0bGV0IHRlc3RJZFdpdGhNZXNzYWdlczogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgcmV0aXJlZCA9IGZhbHNlO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IHRlc3RzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgdGVzdCA9IHRlc3RzW2ldO1xuXHRcdGNvbnN0IHJlc3VsdEl0ZW0gPSBzdGF0ZXNbaV07XG5cdFx0Y29uc3Qgc3RhdGUgPSByZXN1bHRJdGVtPy5jb21wdXRlZFN0YXRlID8/IFRlc3RSZXN1bHRTdGF0ZS5VbnNldDtcblx0XHRpZiAoaG92ZXJNZXNzYWdlUGFydHMubGVuZ3RoIDwgMTApIHtcblx0XHRcdGhvdmVyTWVzc2FnZVBhcnRzLnB1c2gobGFiZWxGb3JUZXN0SW5TdGF0ZSh0ZXN0Lml0ZW0ubGFiZWwsIHN0YXRlKSk7XG5cdFx0fVxuXHRcdGNvbXB1dGVkU3RhdGUgPSBtYXhQcmlvcml0eShjb21wdXRlZFN0YXRlLCBzdGF0ZSk7XG5cdFx0cmV0aXJlZCA9IHJldGlyZWQgfHwgISFyZXN1bHRJdGVtPy5yZXRpcmVkO1xuXHRcdGlmICghdGVzdElkV2l0aE1lc3NhZ2VzICYmIHJlc3VsdEl0ZW0/LnRhc2tzLnNvbWUodCA9PiB0Lm1lc3NhZ2VzLmxlbmd0aCkpIHtcblx0XHRcdHRlc3RJZFdpdGhNZXNzYWdlcyA9IHRlc3QuaXRlbS5leHRJZDtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBoYXNNdWx0aXBsZVRlc3RzID0gdGVzdHMubGVuZ3RoID4gMSB8fCB0ZXN0c1swXS5jaGlsZHJlbi5zaXplID4gMDtcblxuXHRjb25zdCBwcmltYXJ5SWNvbiA9IGNvbXB1dGVkU3RhdGUgPT09IFRlc3RSZXN1bHRTdGF0ZS5VbnNldFxuXHRcdD8gKGhhc011bHRpcGxlVGVzdHMgPyB0ZXN0aW5nUnVuQWxsSWNvbiA6IHRlc3RpbmdSdW5JY29uKVxuXHRcdDogdGVzdGluZ1N0YXRlc1RvSWNvbnMuZ2V0KGNvbXB1dGVkU3RhdGUpITtcblxuXHRjb25zdCBhbHRlcm5hdGVJY29uID0gZGVmYXVsdEd1dHRlckFjdGlvbiA9PT0gRGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uLkRlYnVnXG5cdFx0PyAoaGFzTXVsdGlwbGVUZXN0cyA/IHRlc3RpbmdSdW5BbGxJY29uIDogdGVzdGluZ1J1bkljb24pXG5cdFx0OiAoaGFzTXVsdGlwbGVUZXN0cyA/IHRlc3RpbmdEZWJ1Z0FsbEljb24gOiB0ZXN0aW5nRGVidWdJY29uKTtcblxuXHRsZXQgaG92ZXJNZXNzYWdlOiBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0bGV0IGdseXBoTWFyZ2luQ2xhc3NOYW1lID0gJ3Rlc3RpbmctcnVuLWdseXBoJztcblx0aWYgKHJldGlyZWQpIHtcblx0XHRnbHlwaE1hcmdpbkNsYXNzTmFtZSArPSAnIHJldGlyZWQnO1xuXHR9XG5cblx0Y29uc3QgZGVmYXVsdE9wdGlvbnM6IElNb2RlbERlY29yYXRpb25PcHRpb25zID0ge1xuXHRcdGRlc2NyaXB0aW9uOiAncnVuLXRlc3QtZGVjb3JhdGlvbicsXG5cdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlLFxuXHRcdGdldCBob3Zlck1lc3NhZ2UoKSB7XG5cdFx0XHRpZiAoIWhvdmVyTWVzc2FnZSkge1xuXHRcdFx0XHRjb25zdCBidWlsZGluZyA9IGhvdmVyTWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZygnJywgdHJ1ZSkuYXBwZW5kVGV4dChob3Zlck1lc3NhZ2VQYXJ0cy5qb2luKCcsICcpICsgJy4nKTtcblx0XHRcdFx0aWYgKHRlc3RJZFdpdGhNZXNzYWdlcykge1xuXHRcdFx0XHRcdGNvbnN0IGFyZ3MgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoW3Rlc3RJZFdpdGhNZXNzYWdlc10pKTtcblx0XHRcdFx0XHRidWlsZGluZy5hcHBlbmRNYXJrZG93bihgIFske2xvY2FsaXplKCdwZWVrVGVzdE91dG91dCcsICdQZWVrIFRlc3QgT3V0cHV0Jyl9XShjb21tYW5kOnZzY29kZS5wZWVrVGVzdEVycm9yPyR7YXJnc30pYCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGhvdmVyTWVzc2FnZTtcblx0XHR9LFxuXHRcdGdseXBoTWFyZ2luOiB7IHBvc2l0aW9uOiBHTFlQSF9NQVJHSU5fTEFORSB9LFxuXHRcdGdseXBoTWFyZ2luQ2xhc3NOYW1lOiBgJHtUaGVtZUljb24uYXNDbGFzc05hbWUocHJpbWFyeUljb24pfSAke2dseXBoTWFyZ2luQ2xhc3NOYW1lfWAsXG5cdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdFx0ekluZGV4OiAxMDAwMCxcblx0XHRvdmVydmlld1J1bGVyOiBpc0ZhaWxlZFN0YXRlKGNvbXB1dGVkU3RhdGUpID8geyBjb2xvcjogdGhlbWVDb2xvckZyb21JZChvdmVydmlld1J1bGVyRXJyb3IpLCBwb3NpdGlvbjogT3ZlcnZpZXdSdWxlckxhbmUuQ2VudGVyIH0gOiB1bmRlZmluZWQsXG5cdH07XG5cblx0Y29uc3QgYWx0ZXJuYXRlT3B0aW9uczogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgPSB7XG5cdFx0Li4uZGVmYXVsdE9wdGlvbnMsXG5cdFx0Z2x5cGhNYXJnaW5DbGFzc05hbWU6IGAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShhbHRlcm5hdGVJY29uKX0gJHtnbHlwaE1hcmdpbkNsYXNzTmFtZX1gLFxuXHR9O1xuXG5cdHJldHVybiB7XG5cdFx0cmFuZ2U6IGNvbGxhcHNlUmFuZ2UocmFuZ2UpLFxuXHRcdG9wdGlvbnM6IGRlZmF1bHRPcHRpb25zLFxuXHRcdGFsdGVybmF0ZTogYWx0ZXJuYXRlT3B0aW9ucyxcblx0fTtcbn07XG5cbmNvbnN0IGVudW0gTGVuc0NvbnRlbnRXaWRnZXRWYXJzIHtcblx0Rm9udEZhbWlseSA9ICd0ZXN0aW5nRGlmZkxlbnNGb250RmFtaWx5Jyxcblx0Rm9udEZlYXR1cmVzID0gJ3Rlc3RpbmdEaWZmTGVuc0ZvbnRGZWF0dXJlcycsXG59XG5cbmFic3RyYWN0IGNsYXNzIFRpdGxlTGVuc0NvbnRlbnRXaWRnZXQge1xuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIHJlYWRvbmx5IGFsbG93RWRpdG9yT3ZlcmZsb3cgPSBmYWxzZTtcblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyByZWFkb25seSBzdXBwcmVzc01vdXNlRG93biA9IHRydWU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZSA9IGRvbS4kKCdzcGFuJyk7XG5cdHByaXZhdGUgdmlld1pvbmVJZD86IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IpIHtcblx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHR0aGlzLmFwcGx5U3R5bGluZygpO1xuXHRcdFx0dGhpcy5lZGl0b3IuYWRkQ29udGVudFdpZGdldCh0aGlzKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlTdHlsaW5nKCkge1xuXHRcdGxldCBmb250U2l6ZSA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uY29kZUxlbnNGb250U2l6ZSk7XG5cdFx0bGV0IGhlaWdodDogbnVtYmVyO1xuXHRcdGlmICghZm9udFNpemUgfHwgZm9udFNpemUgPCA1KSB7XG5cdFx0XHRmb250U2l6ZSA9ICh0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRTaXplKSAqIC45KSB8IDA7XG5cdFx0XHRoZWlnaHQgPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRoZWlnaHQgPSAoZm9udFNpemUgKiBNYXRoLm1heCgxLjMsIHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCkgLyB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRTaXplKSkpIHwgMDtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3JGb250SW5mbyA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLl9kb21Ob2RlO1xuXHRcdG5vZGUuY2xhc3NMaXN0LmFkZCgndGVzdGluZy1kaWZmLWxlbnMtd2lkZ2V0Jyk7XG5cdFx0bm9kZS50ZXh0Q29udGVudCA9IHRoaXMuZ2V0VGV4dCgpO1xuXHRcdG5vZGUuc3R5bGUubGluZUhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0bm9kZS5zdHlsZS5mb250U2l6ZSA9IGAke2ZvbnRTaXplfXB4YDtcblx0XHRub2RlLnN0eWxlLmZvbnRGYW1pbHkgPSBgdmFyKC0tJHtMZW5zQ29udGVudFdpZGdldFZhcnMuRm9udEZhbWlseX0pYDtcblx0XHRub2RlLnN0eWxlLmZvbnRGZWF0dXJlU2V0dGluZ3MgPSBgdmFyKC0tJHtMZW5zQ29udGVudFdpZGdldFZhcnMuRm9udEZlYXR1cmVzfSlgO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyU3R5bGUgPSB0aGlzLmVkaXRvci5nZXRDb250YWluZXJEb21Ob2RlKCkuc3R5bGU7XG5cdFx0Y29udGFpbmVyU3R5bGUuc2V0UHJvcGVydHkoTGVuc0NvbnRlbnRXaWRnZXRWYXJzLkZvbnRGYW1pbHksIHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uY29kZUxlbnNGb250RmFtaWx5KSA/PyAnaW5oZXJpdCcpO1xuXHRcdGNvbnRhaW5lclN0eWxlLnNldFByb3BlcnR5KExlbnNDb250ZW50V2lkZ2V0VmFycy5Gb250RmVhdHVyZXMsIGVkaXRvckZvbnRJbmZvLmZvbnRGZWF0dXJlU2V0dGluZ3MpO1xuXG5cdFx0dGhpcy5lZGl0b3IuY2hhbmdlVmlld1pvbmVzKGFjY2Vzc29yID0+IHtcblx0XHRcdGlmICh0aGlzLnZpZXdab25lSWQpIHtcblx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlWm9uZSh0aGlzLnZpZXdab25lSWQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnZpZXdab25lSWQgPSBhY2Nlc3Nvci5hZGRab25lKHtcblx0XHRcdFx0YWZ0ZXJMaW5lTnVtYmVyOiAwLFxuXHRcdFx0XHRhZnRlckNvbHVtbjogQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIsXG5cdFx0XHRcdGRvbU5vZGU6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxuXHRcdFx0XHRoZWlnaHRJblB4OiAyMCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBhYnN0cmFjdCBnZXRJZCgpOiBzdHJpbmc7XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBnZXREb21Ob2RlKCkge1xuXHRcdHJldHVybiB0aGlzLl9kb21Ob2RlO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBkaXNwb3NlKCkge1xuXHRcdHRoaXMuZWRpdG9yLmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRpZiAodGhpcy52aWV3Wm9uZUlkKSB7XG5cdFx0XHRcdGFjY2Vzc29yLnJlbW92ZVpvbmUodGhpcy52aWV3Wm9uZUlkKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuZWRpdG9yLnJlbW92ZUNvbnRlbnRXaWRnZXQodGhpcyk7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIGdldFBvc2l0aW9uKCk6IElDb250ZW50V2lkZ2V0UG9zaXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwb3NpdGlvbjogeyBjb2x1bW46IDAsIGxpbmVOdW1iZXI6IDAgfSxcblx0XHRcdHByZWZlcmVuY2U6IFtDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkFCT1ZFXSxcblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldFRleHQoKTogc3RyaW5nO1xufVxuXG5jbGFzcyBFeHBlY3RlZExlbnNDb250ZW50V2lkZ2V0IGV4dGVuZHMgVGl0bGVMZW5zQ29udGVudFdpZGdldCB7XG5cdHB1YmxpYyBnZXRJZCgpIHtcblx0XHRyZXR1cm4gJ2V4cGVjdGVkVGVzdGluZ0xlbnMnO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFRleHQoKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdleHBlY3RlZC50aXRsZScsICdFeHBlY3RlZCcpO1xuXHR9XG59XG5cblxuY2xhc3MgQWN0dWFsTGVuc0NvbnRlbnRXaWRnZXQgZXh0ZW5kcyBUaXRsZUxlbnNDb250ZW50V2lkZ2V0IHtcblx0cHVibGljIGdldElkKCkge1xuXHRcdHJldHVybiAnYWN0dWFsVGVzdGluZ0xlbnMnO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFRleHQoKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdhY3R1YWwudGl0bGUnLCAnQWN0dWFsJyk7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgUnVuVGVzdERlY29yYXRpb24ge1xuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIGlkID0gJyc7XG5cblx0cHVibGljIGdldCBsaW5lKCkge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvckRlY29yYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHR9XG5cblx0cHVibGljIGdldCB0ZXN0SWRzKCkge1xuXHRcdHJldHVybiB0aGlzLnRlc3RzLm1hcCh0ID0+IHQudGVzdC5pdGVtLmV4dElkKTtcblx0fVxuXG5cdHB1YmxpYyBlZGl0b3JEZWNvcmF0aW9uOiBJTW9kZWxEZWx0YURlY29yYXRpb24gJiB7IGFsdGVybmF0ZT86IElNb2RlbERlY29yYXRpb25PcHRpb25zIH07XG5cdHB1YmxpYyBkaXNwbGF5ZWRTdGF0ZXM6IHJlYWRvbmx5IChUZXN0UmVzdWx0U3RhdGUgfCB1bmRlZmluZWQpW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHRlc3RzOiByZWFkb25seSB7XG5cdFx0XHR0ZXN0OiBJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbTtcblx0XHRcdHJlc3VsdEl0ZW06IFRlc3RSZXN1bHRJdGVtIHwgdW5kZWZpbmVkO1xuXHRcdH1bXSxcblx0XHRwcml2YXRlIHZpc2libGU6IGJvb2xlYW4sXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGVzdFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHRlc3RTZXJ2aWNlOiBJVGVzdFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXN0UHJvZmlsZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHRlc3RQcm9maWxlU2VydmljZTogSVRlc3RQcm9maWxlU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuZGlzcGxheWVkU3RhdGVzID0gdGVzdHMubWFwKHQgPT4gdC5yZXN1bHRJdGVtPy5jb21wdXRlZFN0YXRlKTtcblx0XHR0aGlzLmVkaXRvckRlY29yYXRpb24gPSBjcmVhdGVSdW5UZXN0RGVjb3JhdGlvbihcblx0XHRcdHRlc3RzLm1hcCh0ID0+IHQudGVzdCksXG5cdFx0XHR0ZXN0cy5tYXAodCA9PiB0LnJlc3VsdEl0ZW0pLFxuXHRcdFx0dmlzaWJsZSxcblx0XHRcdGdldFRlc3RpbmdDb25maWd1cmF0aW9uKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIFRlc3RpbmdDb25maWdLZXlzLkRlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbiksXG5cdFx0KTtcblx0XHR0aGlzLmVkaXRvckRlY29yYXRpb24ub3B0aW9ucy5nbHlwaE1hcmdpbkhvdmVyTWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQodGhpcy5nZXRHdXR0ZXJMYWJlbCgpKTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgY2xpY2soZTogSUVkaXRvck1vdXNlRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAoZS50YXJnZXQudHlwZSAhPT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9HTFlQSF9NQVJHSU5cblx0XHRcdHx8IGUudGFyZ2V0LmRldGFpbC5nbHlwaE1hcmdpbkxhbmUgIT09IEdMWVBIX01BUkdJTl9MQU5FXG5cdFx0XHQvLyBoYW5kbGVkIGJ5IGVkaXRvciBndXR0ZXIgY29udGV4dCBtZW51XG5cdFx0XHR8fCBlLmV2ZW50LnJpZ2h0QnV0dG9uXG5cdFx0XHR8fCBpc01hY2ludG9zaCAmJiBlLmV2ZW50LmxlZnRCdXR0b24gJiYgZS5ldmVudC5jdHJsS2V5XG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWx0ZXJuYXRlQWN0aW9uID0gZS5ldmVudC5hbHRLZXk7XG5cdFx0c3dpdGNoIChnZXRUZXN0aW5nQ29uZmlndXJhdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0aW5nQ29uZmlnS2V5cy5EZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24pKSB7XG5cdFx0XHRjYXNlIERlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbi5Db250ZXh0TWVudTpcblx0XHRcdFx0dGhpcy5zaG93Q29udGV4dE1lbnUoZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBEZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24uRGVidWc6XG5cdFx0XHRcdHRoaXMucnVuV2l0aChhbHRlcm5hdGVBY3Rpb24gPyBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4gOiBUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1Zyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBEZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24uQ292ZXJhZ2U6XG5cdFx0XHRcdHRoaXMucnVuV2l0aChhbHRlcm5hdGVBY3Rpb24gPyBUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1ZyA6IFRlc3RSdW5Qcm9maWxlQml0c2V0LkNvdmVyYWdlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIERlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbi5SdW46XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aGlzLnJ1bldpdGgoYWx0ZXJuYXRlQWN0aW9uID8gVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWcgOiBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4pO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBkZWNvcmF0aW9uIHRvIG1hdGNoIHRoZSBuZXcgc2V0IG9mIHRlc3RzLlxuXHQgKiBAcmV0dXJucyB0cnVlIGlmIG9wdGlvbnMgd2VyZSBjaGFuZ2VkLCBmYWxzZSBvdGhlcndpc2Vcblx0ICovXG5cdHB1YmxpYyByZXBsYWNlT3B0aW9ucyhuZXdUZXN0czogcmVhZG9ubHkge1xuXHRcdHRlc3Q6IEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtO1xuXHRcdHJlc3VsdEl0ZW06IFRlc3RSZXN1bHRJdGVtIHwgdW5kZWZpbmVkO1xuXHR9W10sIHZpc2libGU6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRjb25zdCBkaXNwbGF5ZWRTdGF0ZXMgPSBuZXdUZXN0cy5tYXAodCA9PiB0LnJlc3VsdEl0ZW0/LmNvbXB1dGVkU3RhdGUpO1xuXHRcdGlmICh2aXNpYmxlID09PSB0aGlzLnZpc2libGUgJiYgZXF1YWxzKHRoaXMuZGlzcGxheWVkU3RhdGVzLCBkaXNwbGF5ZWRTdGF0ZXMpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy50ZXN0cyA9IG5ld1Rlc3RzO1xuXHRcdHRoaXMuZGlzcGxheWVkU3RhdGVzID0gZGlzcGxheWVkU3RhdGVzO1xuXHRcdHRoaXMudmlzaWJsZSA9IHZpc2libGU7XG5cblx0XHRjb25zdCB7IG9wdGlvbnMsIGFsdGVybmF0ZSB9ID0gY3JlYXRlUnVuVGVzdERlY29yYXRpb24oXG5cdFx0XHRuZXdUZXN0cy5tYXAodCA9PiB0LnRlc3QpLFxuXHRcdFx0bmV3VGVzdHMubWFwKHQgPT4gdC5yZXN1bHRJdGVtKSxcblx0XHRcdHZpc2libGUsXG5cdFx0XHRnZXRUZXN0aW5nQ29uZmlndXJhdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0aW5nQ29uZmlnS2V5cy5EZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24pXG5cdFx0KTtcblxuXHRcdHRoaXMuZWRpdG9yRGVjb3JhdGlvbi5vcHRpb25zID0gb3B0aW9ucztcblx0XHR0aGlzLmVkaXRvckRlY29yYXRpb24uYWx0ZXJuYXRlID0gYWx0ZXJuYXRlO1xuXHRcdHRoaXMuZWRpdG9yRGVjb3JhdGlvbi5vcHRpb25zLmdseXBoTWFyZ2luSG92ZXJNZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dCh0aGlzLmdldEd1dHRlckxhYmVsKCkpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgd2hldGhlciB0aGlzIGRlY29yYXRpb24gc2VydmVzIGFzIHRoZSBydW4gYnV0dG9uIGZvciB0aGUgZ2l2ZW4gdGVzdCBJRC5cblx0ICovXG5cdHB1YmxpYyBpc0ZvclRlc3QodGVzdElkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy50ZXN0cy5zb21lKHQgPT4gdC50ZXN0Lml0ZW0uZXh0SWQgPT09IHRlc3RJZCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIHdoZW4gdGhlIGRlY29yYXRpb24gaXMgY2xpY2tlZCBvbi5cblx0ICovXG5cdGFic3RyYWN0IGdldENvbnRleHRNZW51QWN0aW9ucygpOiBJUmVmZXJlbmNlPElBY3Rpb25bXT47XG5cblx0cHJvdGVjdGVkIHJ1bldpdGgocHJvZmlsZTogVGVzdFJ1blByb2ZpbGVCaXRzZXQpIHtcblx0XHRyZXR1cm4gdGhpcy50ZXN0U2VydmljZS5ydW5UZXN0cyh7XG5cdFx0XHR0ZXN0czogc2ltcGxpZnlUZXN0c1RvRXhlY3V0ZSh0aGlzLnRlc3RTZXJ2aWNlLmNvbGxlY3Rpb24sIHRoaXMudGVzdHMubWFwKCh7IHRlc3QgfSkgPT4gdGVzdCkpLFxuXHRcdFx0Z3JvdXA6IHByb2ZpbGUsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHNob3dDb250ZXh0TWVudShlOiBJRWRpdG9yTW91c2VFdmVudCkge1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuY29kZUVkaXRvclNlcnZpY2UubGlzdENvZGVFZGl0b3JzKCkuZmluZChlID0+IGUuZ2V0TW9kZWwoKSA9PT0gdGhpcy5tb2RlbCk7XG5cdFx0ZWRpdG9yPy5nZXRDb250cmlidXRpb248RWRpdG9yTGluZU51bWJlckNvbnRleHRNZW51PihFZGl0b3JMaW5lTnVtYmVyQ29udGV4dE1lbnUuSUQpPy5zaG93KGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRHdXR0ZXJMYWJlbCgpIHtcblx0XHRzd2l0Y2ggKGdldFRlc3RpbmdDb25maWd1cmF0aW9uKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIFRlc3RpbmdDb25maWdLZXlzLkRlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbikpIHtcblx0XHRcdGNhc2UgRGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uLkNvbnRleHRNZW51OlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rlc3RpbmcuZ3V0dGVyTXNnLmNvbnRleHRNZW51JywgJ0NsaWNrIGZvciB0ZXN0IG9wdGlvbnMnKTtcblx0XHRcdGNhc2UgRGVmYXVsdEd1dHRlckNsaWNrQWN0aW9uLkRlYnVnOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rlc3RpbmcuZ3V0dGVyTXNnLmRlYnVnJywgJ0NsaWNrIHRvIGRlYnVnIHRlc3RzLCByaWdodCBjbGljayBmb3IgbW9yZSBvcHRpb25zJyk7XG5cdFx0XHRjYXNlIERlZmF1bHRHdXR0ZXJDbGlja0FjdGlvbi5Db3ZlcmFnZTpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0ZXN0aW5nLmd1dHRlck1zZy5jb3ZlcmFnZScsICdDbGljayB0byBydW4gdGVzdHMgd2l0aCBjb3ZlcmFnZSwgcmlnaHQgY2xpY2sgZm9yIG1vcmUgb3B0aW9ucycpO1xuXHRcdFx0Y2FzZSBEZWZhdWx0R3V0dGVyQ2xpY2tBY3Rpb24uUnVuOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0ZXN0aW5nLmd1dHRlck1zZy5ydW4nLCAnQ2xpY2sgdG8gcnVuIHRlc3RzLCByaWdodCBjbGljayBmb3IgbW9yZSBvcHRpb25zJyk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgY29udGV4dCBtZW51IGFjdGlvbnMgcmVsZXZhbnQgZm9yIGEgc2luZ2VsIHRlc3QuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgZ2V0VGVzdENvbnRleHRNZW51QWN0aW9ucyh0ZXN0OiBJbnRlcm5hbFRlc3RJdGVtLCByZXN1bHRJdGVtPzogVGVzdFJlc3VsdEl0ZW0pOiBJUmVmZXJlbmNlPElBY3Rpb25bXT4ge1xuXHRcdGNvbnN0IHRlc3RBY3Rpb25zOiBBY3Rpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGNhcGFiaWxpdGllcyA9IHRoaXMudGVzdFByb2ZpbGVTZXJ2aWNlLmNhcGFiaWxpdGllc0ZvclRlc3QodGVzdC5pdGVtKTtcblxuXHRcdFtcblx0XHRcdHsgYml0c2V0OiBUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4sIGxhYmVsOiBsb2NhbGl6ZSgncnVuIHRlc3QnLCAnUnVuIFRlc3QnKSB9LFxuXHRcdFx0eyBiaXRzZXQ6IFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnLCBsYWJlbDogbG9jYWxpemUoJ2RlYnVnIHRlc3QnLCAnRGVidWcgVGVzdCcpIH0sXG5cdFx0XHR7IGJpdHNldDogVGVzdFJ1blByb2ZpbGVCaXRzZXQuQ292ZXJhZ2UsIGxhYmVsOiBsb2NhbGl6ZSgnY292ZXJhZ2UgdGVzdCcsICdSdW4gd2l0aCBDb3ZlcmFnZScpIH0sXG5cdFx0XS5mb3JFYWNoKCh7IGJpdHNldCwgbGFiZWwgfSkgPT4ge1xuXHRcdFx0aWYgKGNhcGFiaWxpdGllcyAmIGJpdHNldCkge1xuXHRcdFx0XHR0ZXN0QWN0aW9ucy5wdXNoKG5ldyBBY3Rpb24oYHRlc3RpbmcuZ3V0dGVyLiR7Yml0c2V0fWAsIGxhYmVsLCB1bmRlZmluZWQsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQoKSA9PiB0aGlzLnRlc3RTZXJ2aWNlLnJ1blRlc3RzKHsgZ3JvdXA6IGJpdHNldCwgdGVzdHM6IFt0ZXN0XSB9KSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKGNhcGFiaWxpdGllcyAmIFRlc3RSdW5Qcm9maWxlQml0c2V0Lkhhc05vbkRlZmF1bHRQcm9maWxlKSB7XG5cdFx0XHR0ZXN0QWN0aW9ucy5wdXNoKG5ldyBBY3Rpb24oJ3Rlc3RpbmcucnVuVXNpbmcnLCBsb2NhbGl6ZSgndGVzdGluZy5ydW5Vc2luZycsICdFeGVjdXRlIFVzaW5nIFByb2ZpbGUuLi4nKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcHJvZmlsZTogSVRlc3RSdW5Qcm9maWxlIHwgdW5kZWZpbmVkID0gYXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgndnNjb2RlLnBpY2tUZXN0UHJvZmlsZScsIHsgb25seUZvclRlc3Q6IHRlc3QgfSk7XG5cdFx0XHRcdGlmICghcHJvZmlsZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMudGVzdFNlcnZpY2UucnVuUmVzb2x2ZWRUZXN0cyh7XG5cdFx0XHRcdFx0Z3JvdXA6IHByb2ZpbGUuZ3JvdXAsXG5cdFx0XHRcdFx0dGFyZ2V0czogW3tcblx0XHRcdFx0XHRcdHByb2ZpbGVJZDogcHJvZmlsZS5wcm9maWxlSWQsXG5cdFx0XHRcdFx0XHRjb250cm9sbGVySWQ6IHByb2ZpbGUuY29udHJvbGxlcklkLFxuXHRcdFx0XHRcdFx0dGVzdElkczogW3Rlc3QuaXRlbS5leHRJZF1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAocmVzdWx0SXRlbSAmJiBpc0ZhaWxlZFN0YXRlKHJlc3VsdEl0ZW0uY29tcHV0ZWRTdGF0ZSkpIHtcblx0XHRcdHRlc3RBY3Rpb25zLnB1c2gobmV3IEFjdGlvbigndGVzdGluZy5ndXR0ZXIucGVla0ZhaWx1cmUnLCBsb2NhbGl6ZSgncGVlayBmYWlsdXJlJywgJ1BlZWsgRXJyb3InKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsXG5cdFx0XHRcdCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3ZzY29kZS5wZWVrVGVzdEVycm9yJywgdGVzdC5pdGVtLmV4dElkKSkpO1xuXHRcdH1cblxuXHRcdGlmIChyZXN1bHRJdGVtPy5jb21wdXRlZFN0YXRlID09PSBUZXN0UmVzdWx0U3RhdGUuUnVubmluZykge1xuXHRcdFx0dGVzdEFjdGlvbnMucHVzaChuZXcgQWN0aW9uKCd0ZXN0aW5nLmd1dHRlci5jYW5jZWwnLCBsb2NhbGl6ZSgndGVzdGluZy5jYW5jZWxSdW4nLCAnQ2FuY2VsIFRlc3QgUnVuJyksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLFxuXHRcdFx0XHQoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFRlc3RDb21tYW5kSWQuQ2FuY2VsVGVzdFJ1bkFjdGlvbikpKTtcblx0XHR9XG5cblx0XHR0ZXN0QWN0aW9ucy5wdXNoKG5ldyBBY3Rpb24oJ3Rlc3RpbmcuZ3V0dGVyLnJldmVhbCcsIGxvY2FsaXplKCdyZXZlYWwgdGVzdCcsICdSZXZlYWwgaW4gVGVzdCBFeHBsb3JlcicpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCxcblx0XHRcdCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ19yZXZlYWxUZXN0SW5FeHBsb3JlcicsIHRlc3QuaXRlbS5leHRJZCkpKTtcblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGVkID0gdGhpcy5nZXRDb250cmlidXRlZFRlc3RBY3Rpb25zKHRlc3QsIGNhcGFiaWxpdGllcyk7XG5cdFx0cmV0dXJuIHsgb2JqZWN0OiBTZXBhcmF0b3Iuam9pbih0ZXN0QWN0aW9ucywgY29udHJpYnV0ZWQpLCBkaXNwb3NlKCkgeyB0ZXN0QWN0aW9ucy5mb3JFYWNoKGEgPT4gYS5kaXNwb3NlKCkpOyB9IH07XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnRyaWJ1dGVkVGVzdEFjdGlvbnModGVzdDogSW50ZXJuYWxUZXN0SXRlbSwgY2FwYWJpbGl0aWVzOiBudW1iZXIpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IGNvbnRleHRPdmVybGF5ID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KGdldFRlc3RJdGVtQ29udGV4dE92ZXJsYXkodGVzdCwgY2FwYWJpbGl0aWVzKSk7XG5cblx0XHRjb25zdCBhcmcgPSBnZXRDb250ZXh0Rm9yVGVzdEl0ZW0odGhpcy50ZXN0U2VydmljZS5jb2xsZWN0aW9uLCB0ZXN0Lml0ZW0uZXh0SWQpO1xuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5UZXN0SXRlbUd1dHRlciwgY29udGV4dE92ZXJsYXksIHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUsIGFyZyB9KTtcblx0XHRyZXR1cm4gZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyhtZW51KTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSU11bHRpUnVuVGVzdCB7XG5cdGN1cnJlbnRMYWJlbDogc3RyaW5nO1xuXHRwYXJlbnQ6IFRlc3RJZCB8IHVuZGVmaW5lZDtcblx0dGVzdEl0ZW06IHtcblx0XHR0ZXN0OiBJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbTtcblx0XHRyZXN1bHRJdGVtOiBUZXN0UmVzdWx0SXRlbSB8IHVuZGVmaW5lZDtcblx0fTtcbn1cblxuY2xhc3MgTXVsdGlSdW5UZXN0RGVjb3JhdGlvbiBleHRlbmRzIFJ1blRlc3REZWNvcmF0aW9uIGltcGxlbWVudHMgSVRlc3REZWNvcmF0aW9uIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0dGVzdHM6IHJlYWRvbmx5IHtcblx0XHRcdHRlc3Q6IEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtO1xuXHRcdFx0cmVzdWx0SXRlbTogVGVzdFJlc3VsdEl0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0fVtdLFxuXHRcdHZpc2libGU6IGJvb2xlYW4sXG5cdFx0bW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGVzdFNlcnZpY2UgdGVzdFNlcnZpY2U6IElUZXN0U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlc3RQcm9maWxlU2VydmljZSB0ZXN0UHJvZmlsZVNlcnZpY2U6IElUZXN0UHJvZmlsZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodGVzdHMsIHZpc2libGUsIG1vZGVsLCBjb2RlRWRpdG9yU2VydmljZSwgdGVzdFNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29tbWFuZFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0ZXN0UHJvZmlsZVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBtZW51U2VydmljZSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0Q29udGV4dE1lbnVBY3Rpb25zKCkge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgYWxsQWN0aW9uczogQWN0aW9uW10gPSBbXTtcblx0XHRbXG5cdFx0XHR7IGJpdHNldDogVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuLCBsYWJlbDogbG9jYWxpemUoJ3J1biBhbGwgdGVzdCcsICdSdW4gQWxsIFRlc3RzJykgfSxcblx0XHRcdHsgYml0c2V0OiBUZXN0UnVuUHJvZmlsZUJpdHNldC5Db3ZlcmFnZSwgbGFiZWw6IGxvY2FsaXplKCdydW4gYWxsIHRlc3Qgd2l0aCBjb3ZlcmFnZScsICdSdW4gQWxsIFRlc3RzIHdpdGggQ292ZXJhZ2UnKSB9LFxuXHRcdFx0eyBiaXRzZXQ6IFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnLCBsYWJlbDogbG9jYWxpemUoJ2RlYnVnIGFsbCB0ZXN0JywgJ0RlYnVnIEFsbCBUZXN0cycpIH0sXG5cdFx0XS5mb3JFYWNoKCh7IGJpdHNldCwgbGFiZWwgfSwgaSkgPT4ge1xuXHRcdFx0Y29uc3QgY2FuUnVuID0gdGhpcy50ZXN0cy5zb21lKCh7IHRlc3QgfSkgPT4gdGhpcy50ZXN0UHJvZmlsZVNlcnZpY2UuY2FwYWJpbGl0aWVzRm9yVGVzdCh0ZXN0Lml0ZW0pICYgYml0c2V0KTtcblx0XHRcdGlmIChjYW5SdW4pIHtcblx0XHRcdFx0YWxsQWN0aW9ucy5wdXNoKG5ldyBBY3Rpb24oYHRlc3RpbmcuZ3V0dGVyLnJ1biR7aX1gLCBsYWJlbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsICgpID0+IHRoaXMucnVuV2l0aChiaXRzZXQpKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRkaXNwb3NhYmxlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYWxsQWN0aW9ucy5mb3JFYWNoKGEgPT4gYS5kaXNwb3NlKCkpKSk7XG5cblx0XHRjb25zdCB0ZXN0SXRlbXMgPSB0aGlzLnRlc3RzLm1hcCgodGVzdEl0ZW0pOiBJTXVsdGlSdW5UZXN0ID0+ICh7XG5cdFx0XHRjdXJyZW50TGFiZWw6IHRlc3RJdGVtLnRlc3QuaXRlbS5sYWJlbCxcblx0XHRcdHRlc3RJdGVtLFxuXHRcdFx0cGFyZW50OiBUZXN0SWQuZnJvbVN0cmluZyh0ZXN0SXRlbS50ZXN0Lml0ZW0uZXh0SWQpLnBhcmVudElkLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGdldExhYmVsQ29uZmxpY3RzID0gKHRlc3RzOiB0eXBlb2YgdGVzdEl0ZW1zKSA9PiB7XG5cdFx0XHRjb25zdCBsYWJlbENvdW50ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRcdGZvciAoY29uc3QgdGVzdCBvZiB0ZXN0cykge1xuXHRcdFx0XHRsYWJlbENvdW50LnNldCh0ZXN0LmN1cnJlbnRMYWJlbCwgKGxhYmVsQ291bnQuZ2V0KHRlc3QuY3VycmVudExhYmVsKSB8fCAwKSArIDEpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGVzdHMuZmlsdGVyKGUgPT4gbGFiZWxDb3VudC5nZXQoZS5jdXJyZW50TGFiZWwpISA+IDEpO1xuXHRcdH07XG5cblx0XHRsZXQgY29uZmxpY3RzLCBoYXNQYXJlbnQgPSB0cnVlO1xuXHRcdHdoaWxlICgoY29uZmxpY3RzID0gZ2V0TGFiZWxDb25mbGljdHModGVzdEl0ZW1zKSkubGVuZ3RoICYmIGhhc1BhcmVudCkge1xuXHRcdFx0Zm9yIChjb25zdCBjb25mbGljdCBvZiBjb25mbGljdHMpIHtcblx0XHRcdFx0aWYgKGNvbmZsaWN0LnBhcmVudCkge1xuXHRcdFx0XHRcdGNvbnN0IHBhcmVudCA9IHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbi5nZXROb2RlQnlJZChjb25mbGljdC5wYXJlbnQudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0Y29uZmxpY3QuY3VycmVudExhYmVsID0gcGFyZW50Py5pdGVtLmxhYmVsICsgJyA+ICcgKyBjb25mbGljdC5jdXJyZW50TGFiZWw7XG5cdFx0XHRcdFx0Y29uZmxpY3QucGFyZW50ID0gY29uZmxpY3QucGFyZW50LnBhcmVudElkO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGhhc1BhcmVudCA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGVzdEl0ZW1zLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGNvbnN0IGFpID0gYS50ZXN0SXRlbS50ZXN0Lml0ZW07XG5cdFx0XHRjb25zdCBiaSA9IGIudGVzdEl0ZW0udGVzdC5pdGVtO1xuXHRcdFx0cmV0dXJuIChhaS5zb3J0VGV4dCB8fCBhaS5sYWJlbCkubG9jYWxlQ29tcGFyZShiaS5zb3J0VGV4dCB8fCBiaS5sYWJlbCk7XG5cdFx0fSk7XG5cblx0XHRsZXQgdGVzdFN1Ym1lbnVzOiBJQWN0aW9uW10gPSB0ZXN0SXRlbXMubWFwKCh7IGN1cnJlbnRMYWJlbCwgdGVzdEl0ZW0gfSkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMuZ2V0VGVzdENvbnRleHRNZW51QWN0aW9ucyh0ZXN0SXRlbS50ZXN0LCB0ZXN0SXRlbS5yZXN1bHRJdGVtKTtcblx0XHRcdGRpc3Bvc2FibGUuYWRkKGFjdGlvbnMpO1xuXHRcdFx0bGV0IGxhYmVsID0gc3RyaXBJY29ucyhjdXJyZW50TGFiZWwpO1xuXHRcdFx0Y29uc3QgbGYgPSBsYWJlbC5pbmRleE9mKCdcXG4nKTtcblx0XHRcdGlmIChsZiAhPT0gLTEpIHtcblx0XHRcdFx0bGFiZWwgPSBsYWJlbC5zbGljZSgwLCBsZik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBuZXcgU3VibWVudUFjdGlvbih0ZXN0SXRlbS50ZXN0Lml0ZW0uZXh0SWQsIGxhYmVsLCBhY3Rpb25zLm9iamVjdCk7XG5cdFx0fSk7XG5cblxuXHRcdGNvbnN0IG92ZXJmbG93ID0gdGVzdFN1Ym1lbnVzLmxlbmd0aCAtIE1BWF9URVNUU19JTl9TVUJNRU5VO1xuXHRcdGlmIChvdmVyZmxvdyA+IDApIHtcblx0XHRcdHRlc3RTdWJtZW51cyA9IHRlc3RTdWJtZW51cy5zbGljZSgwLCBNQVhfVEVTVFNfSU5fU1VCTUVOVSk7XG5cdFx0XHR0ZXN0U3VibWVudXMucHVzaChuZXcgQWN0aW9uKFxuXHRcdFx0XHQndGVzdGluZy5ndXR0ZXIub3ZlcmZsb3cnLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGVzdE92ZXJmbG93SXRlbXMnLCAnezB9IG1vcmUgdGVzdHMuLi4nLCBvdmVyZmxvdyksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHQoKSA9PiB0aGlzLnBpY2tBbmRSdW4odGVzdEl0ZW1zKSxcblx0XHRcdCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IG9iamVjdDogU2VwYXJhdG9yLmpvaW4oYWxsQWN0aW9ucywgdGVzdFN1Ym1lbnVzKSwgZGlzcG9zZTogKCkgPT4gZGlzcG9zYWJsZS5kaXNwb3NlKCkgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcGlja0FuZFJ1bih0ZXN0SXRlbXM6IElNdWx0aVJ1blRlc3RbXSkge1xuXHRcdGNvbnN0IGRvUGljayA9IDxUIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0+KGl0ZW1zOiBUW10sIHRpdGxlOiBzdHJpbmcpID0+IG5ldyBQcm9taXNlPFQgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBwaWNrID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPFQ+KCkpO1xuXHRcdFx0cGljay5wbGFjZWhvbGRlciA9IHRpdGxlO1xuXHRcdFx0cGljay5pdGVtcyA9IGl0ZW1zO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUocGljay5zZWxlY3RlZEl0ZW1zWzBdKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0cGljay5zaG93KCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBpdGVtID0gYXdhaXQgZG9QaWNrKFxuXHRcdFx0dGVzdEl0ZW1zLm1hcCgoeyBjdXJyZW50TGFiZWwsIHRlc3RJdGVtIH0pID0+ICh7IGxhYmVsOiBjdXJyZW50TGFiZWwsIHRlc3Q6IHRlc3RJdGVtLnRlc3QsIHJlc3VsdDogdGVzdEl0ZW0ucmVzdWx0SXRlbSB9KSksXG5cdFx0XHRsb2NhbGl6ZSgnc2VsZWN0VGVzdFRvUnVuJywgJ1NlbGVjdCBhIHRlc3QgdG8gcnVuJyksXG5cdFx0KTtcblxuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLmdldFRlc3RDb250ZXh0TWVudUFjdGlvbnMoaXRlbS50ZXN0LCBpdGVtLnJlc3VsdCk7XG5cdFx0dHJ5IHtcblx0XHRcdChhd2FpdCBkb1BpY2soYWN0aW9ucy5vYmplY3QsIGl0ZW0ubGFiZWwpKT8ucnVuKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGFjdGlvbnMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBSdW5TaW5nbGVUZXN0RGVjb3JhdGlvbiBleHRlbmRzIFJ1blRlc3REZWNvcmF0aW9uIGltcGxlbWVudHMgSVRlc3REZWNvcmF0aW9uIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0dGVzdDogSW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW0sXG5cdFx0cmVzdWx0SXRlbTogVGVzdFJlc3VsdEl0ZW0gfCB1bmRlZmluZWQsXG5cdFx0bW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0dmlzaWJsZTogYm9vbGVhbixcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElUZXN0U2VydmljZSB0ZXN0U2VydmljZTogSVRlc3RTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVzdFByb2ZpbGVTZXJ2aWNlIHRlc3RQcm9maWxlczogSVRlc3RQcm9maWxlU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihbeyB0ZXN0LCByZXN1bHRJdGVtIH1dLCB2aXNpYmxlLCBtb2RlbCwgY29kZUVkaXRvclNlcnZpY2UsIHRlc3RTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgdGVzdFByb2ZpbGVzLCBjb250ZXh0S2V5U2VydmljZSwgbWVudVNlcnZpY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0Q29udGV4dE1lbnVBY3Rpb25zKCkge1xuXHRcdHJldHVybiB0aGlzLmdldFRlc3RDb250ZXh0TWVudUFjdGlvbnModGhpcy50ZXN0c1swXS50ZXN0LCB0aGlzLnRlc3RzWzBdLnJlc3VsdEl0ZW0pO1xuXHR9XG59XG5cbmNvbnN0IGxpbmVCcmVha1JlID0gL1xccj9cXG5cXHMqL2c7XG5cbmNsYXNzIFRlc3RNZXNzYWdlRGVjb3JhdGlvbiBpbXBsZW1lbnRzIElUZXN0RGVjb3JhdGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgaW5saW5lQ2xhc3NOYW1lID0gJ3Rlc3QtbWVzc2FnZS1pbmxpbmUtY29udGVudCc7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgZGVjb3JhdGlvbklkID0gYHRlc3RtZXNzYWdlLSR7Z2VuZXJhdGVVdWlkKCl9YDtcblxuXHRwdWJsaWMgaWQgPSAnJztcblxuXHRwdWJsaWMgcmVhZG9ubHkgZWRpdG9yRGVjb3JhdGlvbjogSU1vZGVsRGVsdGFEZWNvcmF0aW9uO1xuXHRwdWJsaWMgcmVhZG9ubHkgbGluZTogbnVtYmVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGVudElkQ2xhc3MgPSBgdGVzdC1tZXNzYWdlLWlubGluZS1jb250ZW50LWlkJHtnZW5lcmF0ZVV1aWQoKX1gO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB0ZXN0TWVzc2FnZTogSVRlc3RNZXNzYWdlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWVzc2FnZVVyaTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHRleHRNb2RlbDogSVRleHRNb2RlbCxcblx0XHRASVRlc3RpbmdQZWVrT3BlbmVyIHByaXZhdGUgcmVhZG9ubHkgcGVla09wZW5lcjogSVRlc3RpbmdQZWVrT3BlbmVyLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IHRlc3RNZXNzYWdlLmxvY2F0aW9uITtcblx0XHR0aGlzLmxpbmUgPSBjbGFtcChsb2NhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDAsIHRleHRNb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0Y29uc3Qgc2V2ZXJpdHkgPSB0ZXN0TWVzc2FnZS50eXBlO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSB0ZXN0TWVzc2FnZS5tZXNzYWdlO1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGVkaXRvclNlcnZpY2UucmVzb2x2ZURlY29yYXRpb25PcHRpb25zKFRlc3RNZXNzYWdlRGVjb3JhdGlvbi5kZWNvcmF0aW9uSWQsIHRydWUpO1xuXHRcdGNvbnN0IGhvdmVyVGV4dCA9IHJlbmRlclRlc3RNZXNzYWdlQXNUZXh0KG1lc3NhZ2UpO1xuXHRcdG9wdGlvbnMuaG92ZXJNZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dChob3ZlclRleHQpO1xuXHRcdG9wdGlvbnMuekluZGV4ID0gMTA7IC8vIHRvZG86IGluIHNwaXRlIG9mIHRoZSB6LWluZGV4LCB0aGlzIGFwcGVhcnMgYmVoaW5kIGdpdGxlbnNcblx0XHRvcHRpb25zLmNsYXNzTmFtZSA9IGB0ZXN0aW5nLWlubGluZS1tZXNzYWdlLXNldmVyaXR5LSR7c2V2ZXJpdHl9YDtcblx0XHRvcHRpb25zLmlzV2hvbGVMaW5lID0gdHJ1ZTtcblx0XHRvcHRpb25zLnN0aWNraW5lc3MgPSBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcztcblx0XHRvcHRpb25zLmNvbGxhcHNlT25SZXBsYWNlRWRpdCA9IHRydWU7XG5cblx0XHRsZXQgaW5saW5lVGV4dCA9IHJlbmRlclRlc3RNZXNzYWdlQXNUZXh0KG1lc3NhZ2UpLnJlcGxhY2UobGluZUJyZWFrUmUsICcgJyk7XG5cdFx0aWYgKGlubGluZVRleHQubGVuZ3RoID4gTUFYX0lOTElORV9NRVNTQUdFX0xFTkdUSCkge1xuXHRcdFx0aW5saW5lVGV4dCA9IGlubGluZVRleHQuc2xpY2UoMCwgTUFYX0lOTElORV9NRVNTQUdFX0xFTkdUSCAtIDEpICsgJ1x1MjAyNic7XG5cdFx0fVxuXG5cdFx0b3B0aW9ucy5hZnRlciA9IHtcblx0XHRcdGNvbnRlbnQ6IGlubGluZVRleHQsXG5cdFx0XHRpbmxpbmVDbGFzc05hbWU6IGB0ZXN0LW1lc3NhZ2UtaW5saW5lLWNvbnRlbnQgdGVzdC1tZXNzYWdlLWlubGluZS1jb250ZW50LXMke3NldmVyaXR5fSAke3RoaXMuY29udGVudElkQ2xhc3N9ICR7bWVzc2FnZVVyaSA/ICd0ZXN0LW1lc3NhZ2UtaW5saW5lLWNvbnRlbnQtY2xpY2thYmxlJyA6ICcnfWBcblx0XHR9O1xuXHRcdG9wdGlvbnMuc2hvd0lmQ29sbGFwc2VkID0gdHJ1ZTtcblxuXHRcdGNvbnN0IHJ1bGVyQ29sb3IgPSBzZXZlcml0eSA9PT0gVGVzdE1lc3NhZ2VUeXBlLkVycm9yXG5cdFx0XHQ/IG92ZXJ2aWV3UnVsZXJFcnJvclxuXHRcdFx0OiBvdmVydmlld1J1bGVySW5mbztcblxuXHRcdGlmIChydWxlckNvbG9yKSB7XG5cdFx0XHRvcHRpb25zLm92ZXJ2aWV3UnVsZXIgPSB7IGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKHJ1bGVyQ29sb3IpLCBwb3NpdGlvbjogT3ZlcnZpZXdSdWxlckxhbmUuUmlnaHQgfTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lTGVuZ3RoID0gdGV4dE1vZGVsLmdldExpbmVMZW5ndGgodGhpcy5saW5lKTtcblx0XHRjb25zdCBjb2x1bW4gPSBsaW5lTGVuZ3RoID8gKGxpbmVMZW5ndGggKyAxKSA6IGxvY2F0aW9uLnJhbmdlLmVuZENvbHVtbjtcblx0XHR0aGlzLmVkaXRvckRlY29yYXRpb24gPSB7XG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiB0aGlzLmxpbmUsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiBjb2x1bW4sXG5cdFx0XHRcdGVuZENvbHVtbjogY29sdW1uLFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB0aGlzLmxpbmUsXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGNsaWNrKGU6IElFZGl0b3JNb3VzZUV2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKGUuZXZlbnQucmlnaHRCdXR0b24pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMubWVzc2FnZVVyaSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChlLnRhcmdldC5lbGVtZW50Py5jbGFzc05hbWUuaW5jbHVkZXModGhpcy5jb250ZW50SWRDbGFzcykpIHtcblx0XHRcdHRoaXMucGVla09wZW5lci5wZWVrVXJpKHRoaXMubWVzc2FnZVVyaSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Z2V0Q29udGV4dE1lbnVBY3Rpb25zKCkge1xuXHRcdHJldHVybiB7IG9iamVjdDogW10sIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHR9XG59XG5cbmNvbnN0IEVSUk9SX0NPTlRFTlRfV0lER0VUX0hFSUdIVCA9IDIwO1xuXG5jbGFzcyBUZXN0RXJyb3JDb250ZW50V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb250ZW50V2lkZ2V0IHtcblx0cHJpdmF0ZSByZWFkb25seSBpZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgYWxsb3dFZGl0b3JPdmVyZmxvdyA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbm9kZSA9IGRvbS5oKCdkaXYudGVzdC1lcnJvci1jb250ZW50LXdpZGdldCcsIFtcblx0XHRkb20uaCgnZGl2LmlubmVyQGlubmVyJywgW1xuXHRcdFx0ZG9tLmgoJ2Rpdi5hcnJvd0BhcnJvdycpLFxuXHRcdFx0ZG9tLmgoYHNwYW4ke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHRlc3RpbmdTdGF0ZXNUb0ljb25zLmdldChUZXN0UmVzdWx0U3RhdGUuRmFpbGVkKSEpfWApLFxuXHRcdFx0ZG9tLmgoJ3NwYW4uY29udGVudEBuYW1lJyksXG5cdFx0XSksXG5cdF0pO1xuXG5cdHB1YmxpYyBnZXQgbGluZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5wb3NpdGlvbi5saW5lTnVtYmVyO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcG9zaXRpb246IFBvc2l0aW9uLFxuXHRcdHB1YmxpYyByZWFkb25seSBtZXNzYWdlOiBJVGVzdEVycm9yTWVzc2FnZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVzdWx0SXRlbTogVGVzdFJlc3VsdEl0ZW0sXG5cdFx0dXJpOiBVUkksXG5cdFx0QElUZXN0aW5nUGVla09wZW5lciByZWFkb25seSBwZWVrT3BlbmVyOiBJVGVzdGluZ1BlZWtPcGVuZXIsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBzZXRNYXJnaW5Ub3AgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gZWRpdG9yLmdldExpbmVIZWlnaHRGb3JQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHR0aGlzLm5vZGUucm9vdC5zdHlsZS5tYXJnaW5Ub3AgPSAobGluZUhlaWdodCAtIEVSUk9SX0NPTlRFTlRfV0lER0VUX0hFSUdIVCkgLyAyICsgJ3B4Jztcblx0XHR9O1xuXG5cdFx0c2V0TWFyZ2luVG9wKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlTGluZUhlaWdodChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHMocG9zaXRpb24pKSB7XG5cdFx0XHRcdHNldE1hcmdpblRvcCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KSkge1xuXHRcdFx0XHRzZXRNYXJnaW5Ub3AoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRsZXQgdGV4dDogc3RyaW5nO1xuXHRcdGlmIChtZXNzYWdlLmV4cGVjdGVkICE9PSB1bmRlZmluZWQgJiYgbWVzc2FnZS5hY3R1YWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGV4dCA9IGAke3RydW5jYXRlTWlkZGxlKG1lc3NhZ2UuYWN0dWFsLnJlcGxhY2UoL1xccysvZywgJyAnKSwgMzApfSAhPSAke3RydW5jYXRlTWlkZGxlKG1lc3NhZ2UuZXhwZWN0ZWQucmVwbGFjZSgvXFxzKy9nLCAnICcpLCAzMCl9YDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbXNnID0gcmVuZGVyQXNQbGFpbnRleHQobWVzc2FnZS5tZXNzYWdlKTtcblx0XHRcdGNvbnN0IGxmID0gbXNnLmluZGV4T2YoJ1xcbicpO1xuXHRcdFx0dGV4dCA9IGxmID09PSAtMSA/IG1zZyA6IG1zZy5zbGljZSgwLCBsZik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLm5vZGUucm9vdCwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHR0aGlzLnBlZWtPcGVuZXIucGVla1VyaSh1cmkpO1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGN0cmwgPSBUZXN0aW5nT3V0cHV0UGVla0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKGN0cmwpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3Qgc3ViamVjdCA9IGN0cmwuc3ViamVjdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGlzQ3VycmVudCA9IHN1YmplY3QgaW5zdGFuY2VvZiBNZXNzYWdlU3ViamVjdCAmJiBzdWJqZWN0Lm1lc3NhZ2UgPT09IG1lc3NhZ2U7XG5cdFx0XHRcdHRoaXMubm9kZS5yb290LmNsYXNzTGlzdC50b2dnbGUoJ2lzLWN1cnJlbnQnLCBpc0N1cnJlbnQpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMubm9kZS5uYW1lLmlubmVyVGV4dCA9IHRleHQgfHwgJ1Rlc3QgRmFpbGVkJztcblxuXHRcdGNvbnN0IHN2ZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAnc3ZnJyk7XG5cdFx0c3ZnLnNldEF0dHJpYnV0ZSgnd2lkdGgnLCAnMTUnKTtcblx0XHRzdmcuc2V0QXR0cmlidXRlKCdoZWlnaHQnLCAnMTAnKTtcblx0XHRzdmcuc2V0QXR0cmlidXRlKCdwcmVzZXJ2ZUFzcGVjdFJhdGlvJywgJ25vbmUnKTtcblx0XHRzdmcuc2V0QXR0cmlidXRlKCd2aWV3Qm94JywgJzAgMCAxNSAxMCcpO1xuXG5cdFx0Y29uc3QgbGVmdEFycm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICdwYXRoJyk7XG5cdFx0bGVmdEFycm93LnNldEF0dHJpYnV0ZSgnZCcsICdNMTUgMCBMMTAgMCBMMCA1IEwxMCAxMCBMMTUgMTAgWicpO1xuXHRcdHN2Zy5hcHBlbmQobGVmdEFycm93KTtcblxuXHRcdHRoaXMubm9kZS5hcnJvdy5hcHBlbmRDaGlsZChzdmcpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBjIG9mIGUuY2hhbmdlcykge1xuXHRcdFx0XHRpZiAoYy5yYW5nZS5zdGFydExpbmVOdW1iZXIgPiB0aGlzLmxpbmUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0Yy5yYW5nZS5zdGFydExpbmVOdW1iZXIgPD0gdGhpcy5saW5lICYmIGMucmFuZ2UuZW5kTGluZU51bWJlciA+PSB0aGlzLmxpbmVcblx0XHRcdFx0XHR8fCAocmVzdWx0SXRlbS5pdGVtLnJhbmdlICYmIHJlc3VsdEl0ZW0uaXRlbS5yYW5nZS5zdGFydExpbmVOdW1iZXIgPD0gYy5yYW5nZS5zdGFydExpbmVOdW1iZXIgJiYgcmVzdWx0SXRlbS5pdGVtLnJhbmdlLmVuZExpbmVOdW1iZXIgPj0gYy5yYW5nZS5lbmRMaW5lTnVtYmVyKVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRUZXN0aW5nRGVjb3JhdGlvbnMuaW52YWxpZGF0ZWRUZXN0cy5hZGQodGhpcy5yZXN1bHRJdGVtKTtcblx0XHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTsgLy8gdG9kb1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYWRqdXN0ID0gY291bnQoYy50ZXh0LCAnXFxuJykgLSAoYy5yYW5nZS5lbmRMaW5lTnVtYmVyIC0gYy5yYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRpZiAoYWRqdXN0ICE9PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5wb3NpdGlvbiA9IHRoaXMucG9zaXRpb24uZGVsdGEoYWRqdXN0KTtcblx0XHRcdFx0XHR0aGlzLmVkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZWRpdG9yLmFkZENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGVkaXRvci5yZW1vdmVDb250ZW50V2lkZ2V0KHRoaXMpKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pZDtcblx0fVxuXG5cdHB1YmxpYyBnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5ub2RlLnJvb3Q7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UG9zaXRpb24oKTogSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwb3NpdGlvbjogdGhpcy5wb3NpdGlvbixcblx0XHRcdHByZWZlcmVuY2U6IFtDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkVYQUNUXSxcblx0XHR9O1xuXHR9XG5cblx0YWZ0ZXJSZW5kZXIoX3Bvc2l0aW9uOiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlIHwgbnVsbCwgY29vcmRpbmF0ZTogSUNvbnRlbnRXaWRnZXRSZW5kZXJlZENvb3JkaW5hdGUgfCBudWxsKTogdm9pZCB7XG5cdFx0aWYgKGNvb3JkaW5hdGUpIHtcblx0XHRcdGNvbnN0IHsgdmVydGljYWxTY3JvbGxiYXJXaWR0aCB9ID0gdGhpcy5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdFx0Y29uc3Qgc2Nyb2xsV2lkdGggPSB0aGlzLmVkaXRvci5nZXRTY3JvbGxXaWR0aCgpO1xuXHRcdFx0dGhpcy5ub2RlLmlubmVyLnN0eWxlLm1heFdpZHRoID0gYCR7c2Nyb2xsV2lkdGggLSB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoIC0gY29vcmRpbmF0ZS5sZWZ0IC0gMjB9cHhgO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxRQUFpQixXQUFXLHFCQUFxQjtBQUMxRCxTQUFTLGNBQWM7QUFDdkIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrQkFBa0IsV0FBVyxlQUFlO0FBQ3JELFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQTBCLHNCQUFzQjtBQUNoRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGVBQWUsaUJBQTZCLG1CQUFtQixvQkFBb0I7QUFDeEcsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZUFBZTtBQUN4QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLE9BQU8sc0JBQXNCO0FBQ3RDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsaUNBQTJJLHVCQUF1QjtBQUMzSyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG9CQUFvQix5QkFBeUI7QUFDdEQsU0FBUyxnQkFBZ0I7QUFHekIsU0FBUyxpQkFBOEcsbUJBQW1CLDhCQUE4QjtBQUN4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SyxVQUFVLE9BQU8sd0JBQXdCLE9BQUs7QUFDbEQsaUJBQVcsS0FBSyxFQUFFLFNBQVM7QUFDMUIsWUFBSSxFQUFFLE1BQU0sa0JBQWtCLEtBQUssTUFBTTtBQUN4QztBQUFBLFFBQ0Q7QUFDQSxZQUNDLEVBQUUsTUFBTSxtQkFBbUIsS0FBSyxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsS0FBSyxRQUNsRSxXQUFXLEtBQUssU0FBUyxXQUFXLEtBQUssTUFBTSxtQkFBbUIsRUFBRSxNQUFNLG1CQUFtQixXQUFXLEtBQUssTUFBTSxpQkFBaUIsRUFBRSxNQUFNLGVBQy9JO0FBQ0QsNkJBQW1CLGlCQUFpQixJQUFJLEtBQUssVUFBVTtBQUN2RCxlQUFLLFFBQVE7QUFBQSxRQUNkO0FBRUEsY0FBTSxTQUFTLE1BQU0sRUFBRSxNQUFNLElBQUksS0FBSyxFQUFFLE1BQU0sZ0JBQWdCLEVBQUUsTUFBTTtBQUN0RSxZQUFJLFdBQVcsR0FBRztBQUNqQixlQUFLLFdBQVcsS0FBSyxTQUFTLE1BQU0sTUFBTTtBQUMxQyxlQUFLLE9BQU8sb0JBQW9CLElBQUk7QUFBQSxRQUNyQztBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFdBQU8saUJBQWlCLElBQUk7QUFDNUIsU0FBSyxVQUFVLGFBQWEsTUFBTSxPQUFPLG9CQUFvQixJQUFJLENBQUMsQ0FBQztBQUFBLEVBQ3BFO0FBQUEsRUE1RkEsSUFBVyxPQUFPO0FBQ2pCLFdBQU8sS0FBSyxTQUFTO0FBQUEsRUFDdEI7QUFBQSxFQTRGTyxRQUFnQjtBQUN0QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyxhQUEwQjtBQUNoQyxXQUFPLEtBQUssS0FBSztBQUFBLEVBQ2xCO0FBQUEsRUFFTyxjQUE2QztBQUNuRCxXQUFPO0FBQUEsTUFDTixVQUFVLEtBQUs7QUFBQSxNQUNmLFlBQVksQ0FBQyxnQ0FBZ0MsS0FBSztBQUFBLElBQ25EO0FBQUEsRUFDRDtBQUFBLEVBRUEsWUFBWSxXQUFtRCxZQUEyRDtBQUN6SCxRQUFJLFlBQVk7QUFDZixZQUFNLEVBQUUsdUJBQXVCLElBQUksS0FBSyxPQUFPLGNBQWM7QUFDN0QsWUFBTSxjQUFjLEtBQUssT0FBTyxlQUFlO0FBQy9DLFdBQUssS0FBSyxNQUFNLE1BQU0sV0FBVyxHQUFHLGNBQWMseUJBQXlCLFdBQVcsT0FBTyxFQUFFO0FBQUEsSUFDaEc7QUFBQSxFQUNEO0FBQ0Q7QUFsSU0seUJBQU47QUFBQSxFQXdCRztBQUFBLEdBeEJHOyIsCiAgIm5hbWVzIjogWyJuZXdEZWNvcmF0aW9ucyIsICJMZW5zQ29udGVudFdpZGdldFZhcnMiLCAiZSJdCn0K
