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
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Color } from "../../../../base/common/color.js";
import { Event } from "../../../../base/common/event.js";
import { stripIcons } from "../../../../base/common/iconLabels.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { derived, disposableObservableValue, observableValue } from "../../../../base/common/observable.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { EditorAction2 } from "../../../../editor/browser/editorExtensions.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { EmbeddedDiffEditorWidget } from "../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { IPeekViewService, PeekViewWidget, peekViewTitleForeground, peekViewTitleInfoForeground } from "../../../../editor/contrib/peekView/browser/peekView.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { fillInActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { TextEditorSelectionRevealType } from "../../../../platform/editor/common/editor.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { AutoOpenPeekViewWhen, TestingConfigKeys, getTestingConfiguration } from "../common/configuration.js";
import { Testing } from "../common/constants.js";
import { MutableObservableValue, staticObservableValue } from "../common/observableValue.js";
import { StoredValue } from "../common/storedValue.js";
import { TestResultItemChangeReason, resultItemParents } from "../common/testResult.js";
import { ITestResultService } from "../common/testResultService.js";
import { ITestService } from "../common/testService.js";
import { TestMessageType } from "../common/testTypes.js";
import { TestingContextKeys } from "../common/testingContextKeys.js";
import { ITestingPeekOpener } from "../common/testingPeekOpener.js";
import { isFailedState } from "../common/testingStates.js";
import { TestUriType, buildTestUri, parseTestUri } from "../common/testingUri.js";
import { renderTestMessageAsText } from "./testMessageColorizer.js";
import { MessageSubject, TaskSubject, TestOutputSubject, inspectSubjectHasStack, mapFindTestMessage } from "./testResultsView/testResultsSubject.js";
import { TestResultsViewContent } from "./testResultsView/testResultsViewContent.js";
import { testingMessagePeekBorder, testingPeekBorder, testingPeekHeaderBackground, testingPeekMessageHeaderBackground } from "./theme.js";
function* allMessages([result]) {
  if (!result) {
    return;
  }
  for (const test of result.tests) {
    for (let taskIndex = 0; taskIndex < test.tasks.length; taskIndex++) {
      const messages = test.tasks[taskIndex].messages;
      for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
        if (messages[messageIndex].type === TestMessageType.Error) {
          yield { result, test, taskIndex, messageIndex };
        }
      }
    }
  }
}
function messageItReferenceToUri({ result, test, taskIndex, messageIndex }) {
  return buildTestUri({
    type: TestUriType.ResultMessage,
    resultId: result.id,
    testExtId: test.item.extId,
    taskIndex,
    messageIndex
  });
}
let TestingPeekOpener = class extends Disposable {
  constructor(configuration, editorService, codeEditorService, testResults, testService, storageService, viewsService, commandService, notificationService) {
    super();
    this.configuration = configuration;
    this.editorService = editorService;
    this.codeEditorService = codeEditorService;
    this.testResults = testResults;
    this.testService = testService;
    this.viewsService = viewsService;
    this.commandService = commandService;
    this.notificationService = notificationService;
    this._register(testResults.onTestChanged(this.openPeekOnFailure, this));
    this.historyVisible = this._register(MutableObservableValue.stored(new StoredValue({
      key: "testHistoryVisibleInPeek",
      scope: StorageScope.PROFILE,
      target: StorageTarget.USER
    }, storageService), false));
  }
  /** @inheritdoc */
  async open() {
    let uri;
    const active = this.editorService.activeTextEditorControl;
    if (isCodeEditor(active) && active.getModel()?.uri) {
      const modelUri = active.getModel()?.uri;
      if (modelUri) {
        uri = await this.getFileCandidateMessage(modelUri, active.getPosition());
      }
    }
    if (!uri) {
      uri = this.lastUri;
    }
    if (!uri) {
      uri = this.getAnyCandidateMessage();
    }
    if (!uri) {
      return false;
    }
    return this.showPeekFromUri(uri);
  }
  /** @inheritdoc */
  tryPeekFirstError(result, test, options) {
    const candidate = this.getFailedCandidateMessage(test);
    if (!candidate) {
      return false;
    }
    this.showPeekFromUri({
      type: TestUriType.ResultMessage,
      documentUri: candidate.location.uri,
      taskIndex: candidate.taskId,
      messageIndex: candidate.index,
      resultId: result.id,
      testExtId: test.item.extId
    }, void 0, { selection: candidate.location.range, selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport, ...options });
    return true;
  }
  /** @inheritdoc */
  peekUri(uri, options = {}) {
    const parsed = parseTestUri(uri);
    const result = parsed && this.testResults.getResult(parsed.resultId);
    if (!parsed || !result || !("testExtId" in parsed)) {
      return false;
    }
    if (!("messageIndex" in parsed)) {
      return false;
    }
    const message = result.getStateById(parsed.testExtId)?.tasks[parsed.taskIndex].messages[parsed.messageIndex];
    if (!message?.location) {
      return false;
    }
    this.showPeekFromUri({
      type: TestUriType.ResultMessage,
      documentUri: message.location.uri,
      taskIndex: parsed.taskIndex,
      messageIndex: parsed.messageIndex,
      resultId: result.id,
      testExtId: parsed.testExtId
    }, options.inEditor, { selection: message.location.range, ...options.options });
    return true;
  }
  /** @inheritdoc */
  closeAllPeeks() {
    for (const editor of this.codeEditorService.listCodeEditors()) {
      TestingOutputPeekController.get(editor)?.removePeek();
    }
  }
  openCurrentInEditor() {
    const current = this.getActiveControl();
    if (!current) {
      return;
    }
    const options = { pinned: false, revealIfOpened: true };
    if (current instanceof TaskSubject || current instanceof TestOutputSubject) {
      this.editorService.openEditor({ resource: current.outputUri, options });
      return;
    }
    if (current instanceof TestOutputSubject) {
      this.editorService.openEditor({ resource: current.outputUri, options });
      return;
    }
    const message = current.message;
    if (current.isDiffable) {
      this.editorService.openEditor({
        original: { resource: current.expectedUri },
        modified: { resource: current.actualUri },
        options
      });
    } else if (typeof message.message === "string") {
      this.editorService.openEditor({ resource: current.messageUri, options });
    } else {
      this.commandService.executeCommand("markdown.showPreview", current.messageUri).catch((err) => {
        this.notificationService.error(localize("testing.markdownPeekError", "Could not open markdown preview: {0}.\n\nPlease make sure the markdown extension is enabled.", err.message));
      });
    }
  }
  getActiveControl() {
    const editor = getPeekedEditorFromFocus(this.codeEditorService);
    const controller = editor && TestingOutputPeekController.get(editor);
    return controller?.subject.get() ?? this.viewsService.getActiveViewWithId(Testing.ResultsViewId)?.subject;
  }
  /** @inheritdoc */
  async showPeekFromUri(uri, editor, options) {
    if (isCodeEditor(editor)) {
      this.lastUri = uri;
      TestingOutputPeekController.get(editor)?.show(buildTestUri(this.lastUri));
      return true;
    }
    const pane = await this.editorService.openEditor({
      resource: uri.documentUri,
      options: { revealIfOpened: true, ...options }
    });
    const control = pane?.getControl();
    if (!isCodeEditor(control)) {
      return false;
    }
    this.lastUri = uri;
    TestingOutputPeekController.get(control)?.show(buildTestUri(this.lastUri));
    return true;
  }
  /**
   * Opens the peek view on a test failure, based on user preferences.
   */
  openPeekOnFailure(evt) {
    if (evt.reason !== TestResultItemChangeReason.OwnStateChange) {
      return;
    }
    const candidate = this.getFailedCandidateMessage(evt.item);
    if (!candidate) {
      return;
    }
    if (evt.result.request.continuous && !getTestingConfiguration(this.configuration, TestingConfigKeys.AutoOpenPeekViewDuringContinuousRun)) {
      return;
    }
    const editors = this.codeEditorService.listCodeEditors();
    const cfg = getTestingConfiguration(this.configuration, TestingConfigKeys.AutoOpenPeekView);
    switch (cfg) {
      case AutoOpenPeekViewWhen.FailureVisible: {
        const visibleEditors = this.editorService.visibleTextEditorControls;
        const editorUris = new Set(visibleEditors.filter(isCodeEditor).map((e) => e.getModel()?.uri.toString()));
        if (!Iterable.some(resultItemParents(evt.result, evt.item), (i) => i.item.uri && editorUris.has(i.item.uri.toString()))) {
          return;
        }
        if (!editorUris.has(candidate.location.uri.toString())) {
          return;
        }
        break;
      }
      case AutoOpenPeekViewWhen.FailureAnywhere:
        break;
      //continue
      default:
        return;
    }
    const controllers = editors.map(TestingOutputPeekController.get);
    if (controllers.some((c) => c?.subject.get())) {
      return;
    }
    this.tryPeekFirstError(evt.result, evt.item);
  }
  /**
   * Gets the message closest to the given position from a test in the file.
   */
  async getFileCandidateMessage(uri, position) {
    let best;
    let bestDistance = Infinity;
    const demandedUriStr = uri.toString();
    for (const test of this.testService.collection.all) {
      const result = this.testResults.getStateById(test.item.extId);
      if (!result) {
        continue;
      }
      mapFindTestMessage(result[1], (_task, message, messageIndex, taskIndex) => {
        if (message.type !== TestMessageType.Error || !message.location || message.location.uri.toString() !== demandedUriStr) {
          return;
        }
        const distance = position ? Math.abs(position.lineNumber - message.location.range.startLineNumber) : 0;
        if (!best || distance <= bestDistance) {
          bestDistance = distance;
          best = {
            type: TestUriType.ResultMessage,
            testExtId: result[1].item.extId,
            resultId: result[0].id,
            taskIndex,
            messageIndex,
            documentUri: uri
          };
        }
      });
    }
    return best;
  }
  /**
   * Gets any possible still-relevant message from the results.
   */
  getAnyCandidateMessage() {
    const seen = /* @__PURE__ */ new Set();
    for (const result of this.testResults.results) {
      for (const test of result.tests) {
        if (seen.has(test.item.extId)) {
          continue;
        }
        seen.add(test.item.extId);
        const found = mapFindTestMessage(test, (task, message, messageIndex, taskIndex) => message.location && {
          type: TestUriType.ResultMessage,
          testExtId: test.item.extId,
          resultId: result.id,
          taskIndex,
          messageIndex,
          documentUri: message.location.uri
        });
        if (found) {
          return found;
        }
      }
    }
    return void 0;
  }
  /**
   * Gets the first failed message that can be displayed from the result.
   */
  getFailedCandidateMessage(test) {
    const fallbackLocation = test.item.uri && test.item.range ? { uri: test.item.uri, range: test.item.range } : void 0;
    let best;
    mapFindTestMessage(test, (task, message, messageIndex, taskId) => {
      const location = message.location || fallbackLocation;
      if (!isFailedState(task.state) || !location) {
        return;
      }
      if (best && message.type !== TestMessageType.Error) {
        return;
      }
      best = { taskId, index: messageIndex, message, location };
    });
    return best;
  }
};
TestingPeekOpener.ID = "workbench.contrib.testing.peekOpener";
TestingPeekOpener = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, ICodeEditorService),
  __decorateParam(3, ITestResultService),
  __decorateParam(4, ITestService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IViewsService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, INotificationService)
], TestingPeekOpener);
let TestingOutputPeekController = class extends Disposable {
  constructor(editor, codeEditorService, instantiationService, testResults, contextKeyService) {
    super();
    this.editor = editor;
    this.codeEditorService = codeEditorService;
    this.instantiationService = instantiationService;
    this.testResults = testResults;
    /**
     * Currently-shown peek view.
     */
    this.peek = this._register(disposableObservableValue("TestingOutputPeek", void 0));
    /**
     * Gets the currently display subject. Undefined if the peek is not open.
     */
    this.subject = derived((reader) => this.peek.read(reader)?.current.read(reader));
    this.visible = TestingContextKeys.isPeekVisible.bindTo(contextKeyService);
    this._register(editor.onDidChangeModel(() => this.peek.set(void 0, void 0)));
    this._register(testResults.onResultsChanged(this.closePeekOnCertainResultEvents, this));
    this._register(testResults.onTestChanged(this.closePeekOnTestChange, this));
  }
  /**
   * Gets the controller associated with the given code editor.
   */
  static get(editor) {
    return editor.getContribution(Testing.OutputPeekContributionId);
  }
  /**
   * Shows a peek for the message in the editor.
   */
  async show(uri) {
    const subject = this.retrieveTest(uri);
    if (subject) {
      this.showSubject(subject);
    }
  }
  /**
   * Shows a peek for the existing inspect subject.
   */
  async showSubject(subject) {
    if (!this.peek.get()) {
      const peek = this.instantiationService.createInstance(TestResultsPeek, this.editor);
      this.peek.set(peek, void 0);
      Event.once(peek.onDidClose)(() => {
        this.visible.set(false);
        this.peek.set(void 0, void 0);
      });
      this.visible.set(true);
      peek.create();
    }
    if (subject instanceof MessageSubject) {
      alert(renderTestMessageAsText(subject.message.message));
    }
    this.peek.get().setModel(subject);
  }
  async openAndShow(uri) {
    const subject = this.retrieveTest(uri);
    if (!subject) {
      return;
    }
    if (!subject.revealLocation || subject.revealLocation.uri.toString() === this.editor.getModel()?.uri.toString()) {
      return this.show(uri);
    }
    const otherEditor = await this.codeEditorService.openCodeEditor({
      resource: subject.revealLocation.uri,
      options: { pinned: false, revealIfOpened: true }
    }, this.editor);
    if (otherEditor) {
      TestingOutputPeekController.get(otherEditor)?.removePeek();
      return TestingOutputPeekController.get(otherEditor)?.show(uri);
    }
  }
  /**
   * Disposes the peek view, if any.
   */
  removePeek() {
    this.peek.set(void 0, void 0);
  }
  /**
   * Collapses all displayed stack frames.
   */
  collapseStack() {
    this.peek.get()?.collapseStack();
  }
  /**
   * Shows the next message in the peek, if possible.
   */
  next() {
    const subject = this.peek.get()?.current.get();
    if (!subject) {
      return;
    }
    let first;
    let found = false;
    for (const m of allMessages(this.testResults.results)) {
      first ??= m;
      if (subject instanceof TaskSubject && m.result.id === subject.result.id) {
        found = true;
      }
      if (found) {
        this.openAndShow(messageItReferenceToUri(m));
        return;
      }
      if (subject instanceof TestOutputSubject && subject.test.item.extId === m.test.item.extId && subject.taskIndex === m.taskIndex && subject.result.id === m.result.id) {
        found = true;
      }
      if (subject instanceof MessageSubject && subject.test.extId === m.test.item.extId && subject.messageIndex === m.messageIndex && subject.taskIndex === m.taskIndex && subject.result.id === m.result.id) {
        found = true;
      }
    }
    if (first) {
      this.openAndShow(messageItReferenceToUri(first));
    }
  }
  /**
   * Shows the previous message in the peek, if possible.
   */
  previous() {
    const subject = this.subject.get();
    if (!subject) {
      return;
    }
    let previous;
    let previousLockedIn = false;
    let last;
    for (const m of allMessages(this.testResults.results)) {
      last = m;
      if (!previousLockedIn) {
        if (subject instanceof TaskSubject) {
          if (m.result.id === subject.result.id) {
            previousLockedIn = true;
          }
          continue;
        }
        if (subject instanceof TestOutputSubject) {
          if (m.test.item.extId === subject.test.item.extId && m.result.id === subject.result.id && m.taskIndex === subject.taskIndex) {
            previousLockedIn = true;
          }
          continue;
        }
        if (subject.test.extId === m.test.item.extId && subject.messageIndex === m.messageIndex && subject.taskIndex === m.taskIndex && subject.result.id === m.result.id) {
          previousLockedIn = true;
          continue;
        }
        previous = m;
      }
    }
    const target = previous || last;
    if (target) {
      this.openAndShow(messageItReferenceToUri(target));
    }
  }
  /**
   * Removes the peek view if it's being displayed on the given test ID.
   */
  removeIfPeekingForTest(testId) {
    const c = this.subject.get();
    if (c && c instanceof MessageSubject && c.test.extId === testId) {
      this.peek.set(void 0, void 0);
    }
  }
  /**
   * If the test we're currently showing has its state change to something
   * else, then clear the peek.
   */
  closePeekOnTestChange(evt) {
    if (evt.reason !== TestResultItemChangeReason.OwnStateChange || evt.previousState === evt.item.ownComputedState) {
      return;
    }
    this.removeIfPeekingForTest(evt.item.item.extId);
  }
  closePeekOnCertainResultEvents(evt) {
    if ("started" in evt) {
      this.peek.set(void 0, void 0);
    }
    if ("removed" in evt && this.testResults.results.length === 0) {
      this.peek.set(void 0, void 0);
    }
  }
  retrieveTest(uri) {
    const parts = parseTestUri(uri);
    if (!parts) {
      return void 0;
    }
    const result = this.testResults.results.find((r) => r.id === parts.resultId);
    if (!result) {
      return;
    }
    if (parts.type === TestUriType.TaskOutput) {
      return new TaskSubject(result, parts.taskIndex);
    }
    if (parts.type === TestUriType.TestOutput) {
      const test2 = result.getStateById(parts.testExtId);
      if (!test2) {
        return;
      }
      return new TestOutputSubject(result, parts.taskIndex, test2);
    }
    const { testExtId, taskIndex, messageIndex } = parts;
    const test = result?.getStateById(testExtId);
    if (!test || !test.tasks[parts.taskIndex]) {
      return;
    }
    return new MessageSubject(result, test, taskIndex, messageIndex);
  }
};
TestingOutputPeekController = __decorateClass([
  __decorateParam(1, ICodeEditorService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ITestResultService),
  __decorateParam(4, IContextKeyService)
], TestingOutputPeekController);
let TestResultsPeek = class extends PeekViewWidget {
  constructor(editor, themeService, peekViewService, testingPeek, contextKeyService, menuService, instantiationService, modelService, codeEditorService, uriIdentityService) {
    super(editor, { showFrame: true, frameWidth: 1, showArrow: true, isResizeable: true, isAccessible: true, className: "test-output-peek" }, instantiationService);
    this.themeService = themeService;
    this.testingPeek = testingPeek;
    this.contextKeyService = contextKeyService;
    this.menuService = menuService;
    this.modelService = modelService;
    this.codeEditorService = codeEditorService;
    this.uriIdentityService = uriIdentityService;
    this.current = observableValue("testPeekCurrent", void 0);
    this.resizeOnNextContentHeightUpdate = false;
    this._disposables.add(themeService.onDidColorThemeChange(this.applyTheme, this));
    peekViewService.addExclusiveWidget(editor, this);
  }
  _getMaximumHeightInLines() {
    const defaultMaxHeight = super._getMaximumHeightInLines();
    const contentHeight = this.content?.contentHeight;
    if (!contentHeight) {
      return defaultMaxHeight;
    }
    if (this.testingPeek.historyVisible.value) {
      return defaultMaxHeight;
    }
    const lineHeight = this.editor.getOption(EditorOption.lineHeight);
    const basePeekOverhead = 41;
    return Math.min(defaultMaxHeight || Infinity, (contentHeight + basePeekOverhead) / lineHeight + 1);
  }
  applyTheme() {
    const theme = this.themeService.getColorTheme();
    const current = this.current.get();
    const isError = current instanceof MessageSubject && current.message.type === TestMessageType.Error;
    const borderColor = (isError ? theme.getColor(testingPeekBorder) : theme.getColor(testingMessagePeekBorder)) || Color.transparent;
    const headerBg = (isError ? theme.getColor(testingPeekHeaderBackground) : theme.getColor(testingPeekMessageHeaderBackground)) || Color.transparent;
    const editorBg = theme.getColor(editorBackground);
    this.style({
      arrowColor: borderColor,
      frameColor: borderColor,
      headerBackgroundColor: editorBg && headerBg ? headerBg.makeOpaque(editorBg) : headerBg,
      primaryHeadingColor: theme.getColor(peekViewTitleForeground),
      secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
    });
  }
  _fillContainer(container) {
    if (!this.scopedContextKeyService) {
      this.scopedContextKeyService = this._disposables.add(this.contextKeyService.createScoped(container));
      TestingContextKeys.isInPeek.bindTo(this.scopedContextKeyService).set(true);
      const instaService = this._disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
      this.content = this._disposables.add(instaService.createInstance(TestResultsViewContent, this.editor, { historyVisible: this.testingPeek.historyVisible, showRevealLocationOnMessages: false, locationForProgress: Testing.ResultsViewId }));
      this._disposables.add(this.content.onClose(() => {
        TestingOutputPeekController.get(this.editor)?.removePeek();
      }));
    }
    super._fillContainer(container);
  }
  _fillHead(container) {
    super._fillHead(container);
    const menuContextKeyService = this._disposables.add(this.contextKeyService.createScoped(container));
    this._disposables.add(bindContextKey(
      TestingContextKeys.peekHasStack,
      menuContextKeyService,
      (reader) => inspectSubjectHasStack(this.current.read(reader))
    ));
    const menu = this.menuService.createMenu(MenuId.TestPeekTitle, menuContextKeyService);
    const actionBar = this._actionbarWidget;
    this._disposables.add(menu.onDidChange(() => {
      actions.length = 0;
      fillInActionBarActions(menu.getActions(), actions);
      while (actionBar.getAction(1)) {
        actionBar.pull(0);
      }
      actionBar.push(actions, { label: false, icon: true, index: 0 });
    }));
    const actions = [];
    fillInActionBarActions(menu.getActions(), actions);
    actionBar.push(actions, { label: false, icon: true, index: 0 });
  }
  _fillBody(containerElement) {
    this.content.fillBody(containerElement);
    const contentHeightSettleTimer = this._disposables.add(new RunOnceScheduler(() => {
      this.resizeOnNextContentHeightUpdate = false;
    }, 500));
    this._disposables.add(this.content.onDidChangeContentHeight((height) => {
      if (!this.resizeOnNextContentHeightUpdate || !height) {
        return;
      }
      const displayed = this._getMaximumHeightInLines();
      if (displayed) {
        this._relayout(Math.min(displayed, this.getVisibleEditorLines() / 2), true);
        if (!contentHeightSettleTimer.isScheduled()) {
          contentHeightSettleTimer.schedule();
        }
      }
    }));
    this._disposables.add(this.content.onDidRequestReveal((sub) => {
      TestingOutputPeekController.get(this.editor)?.show(sub instanceof MessageSubject ? sub.messageUri : sub.outputUri);
    }));
  }
  /**
   * Updates the test to be shown.
   */
  setModel(subject) {
    if (subject instanceof TaskSubject || subject instanceof TestOutputSubject) {
      this.current.set(subject, void 0);
      return this.showInPlace(subject);
    }
    const previous = this.current;
    const revealLocation = subject.revealLocation?.range.getStartPosition();
    if (!revealLocation && !previous) {
      return Promise.resolve();
    }
    this.current.set(subject, void 0);
    if (!revealLocation) {
      return this.showInPlace(subject);
    }
    this.resizeOnNextContentHeightUpdate = true;
    this.show(revealLocation, 10);
    this.editor.revealRangeNearTopIfOutsideViewport(Range.fromPositions(revealLocation), ScrollType.Smooth);
    return this.showInPlace(subject);
  }
  /**
   * Collapses all displayed stack frames.
   */
  collapseStack() {
    this.content.collapseStack();
  }
  getVisibleEditorLines() {
    return Math.round(this.editor.getDomNode().clientHeight / this.editor.getOption(EditorOption.lineHeight));
  }
  /**
   * Shows a message in-place without showing or changing the peek location.
   * This is mostly used if peeking a message without a location.
   */
  async showInPlace(subject) {
    if (subject instanceof MessageSubject) {
      const message = subject.message;
      this.setTitle(firstLine(renderTestMessageAsText(message.message)), stripIcons(subject.test.label));
    } else {
      this.setTitle(localize("testOutputTitle", "Test Output"));
    }
    this.applyTheme();
    await this.content.reveal({ subject, preserveFocus: false });
  }
  /** @override */
  _doLayoutBody(height, width) {
    super._doLayoutBody(height, width);
    this.content.onLayoutBody(height, width);
  }
  /** @override */
  _onWidth(width) {
    super._onWidth(width);
    if (this.dimension) {
      this.dimension = new dom.Dimension(width, this.dimension.height);
    }
    this.content.onWidth(width);
  }
};
TestResultsPeek = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, IPeekViewService),
  __decorateParam(3, ITestingPeekOpener),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IMenuService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, ITextModelService),
  __decorateParam(8, ICodeEditorService),
  __decorateParam(9, IUriIdentityService)
], TestResultsPeek);
let TestResultsView = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, resultService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.resultService = resultService;
    this.content = new Lazy(() => this._register(this.instantiationService.createInstance(TestResultsViewContent, void 0, {
      historyVisible: staticObservableValue(true),
      showRevealLocationOnMessages: true,
      locationForProgress: Testing.ExplorerViewId
    })));
  }
  get subject() {
    return this.content.rawValue?.current;
  }
  showLatestRun(preserveFocus = false) {
    const result = this.resultService.results.find((r) => r.tasks.length);
    if (!result) {
      return;
    }
    this.content.rawValue?.reveal({ preserveFocus, subject: new TaskSubject(result, 0) });
  }
  renderBody(container) {
    super.renderBody(container);
    if (this.isBodyVisible()) {
      this.renderContent(container);
    } else {
      this._register(Event.once(Event.filter(this.onDidChangeBodyVisibility, Boolean))(() => this.renderContent(container)));
    }
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.content.rawValue?.onLayoutBody(height, width);
  }
  renderContent(container) {
    const content = this.content.value;
    content.fillBody(container);
    this._register(content.onDidRequestReveal((subject) => content.reveal({ preserveFocus: true, subject })));
    const [lastResult] = this.resultService.results;
    if (lastResult && lastResult.tasks.length) {
      content.reveal({ preserveFocus: true, subject: new TaskSubject(lastResult, 0) });
    }
  }
};
TestResultsView = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, ITestResultService)
], TestResultsView);
const firstLine = (str) => {
  const index = str.indexOf("\n");
  return index === -1 ? str : str.slice(0, index);
};
function getOuterEditorFromDiffEditor(codeEditorService) {
  const diffEditors = codeEditorService.listDiffEditors();
  for (const diffEditor of diffEditors) {
    if (diffEditor.hasTextFocus() && diffEditor instanceof EmbeddedDiffEditorWidget) {
      return diffEditor.getParentEditor();
    }
  }
  return null;
}
class CloseTestPeek extends EditorAction2 {
  constructor() {
    super({
      id: "editor.closeTestPeek",
      title: localize2("close", "Close"),
      icon: Codicon.close,
      precondition: ContextKeyExpr.or(TestingContextKeys.isInPeek, TestingContextKeys.isPeekVisible),
      keybinding: {
        weight: KeybindingWeight.EditorContrib - 101,
        primary: KeyCode.Escape,
        when: ContextKeyExpr.not("config.editor.stablePeek")
      }
    });
  }
  runEditorCommand(accessor, editor) {
    const parent = getPeekedEditorFromFocus(accessor.get(ICodeEditorService));
    TestingOutputPeekController.get(parent ?? editor)?.removePeek();
  }
}
const navWhen = ContextKeyExpr.and(
  EditorContextKeys.focus,
  TestingContextKeys.isPeekVisible
);
const getPeekedEditorFromFocus = (codeEditorService) => {
  const editor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
  return editor && getPeekedEditor(codeEditorService, editor);
};
const getPeekedEditor = (codeEditorService, editor) => {
  if (TestingOutputPeekController.get(editor)?.subject.get()) {
    return editor;
  }
  if (editor instanceof EmbeddedCodeEditorWidget) {
    return editor.getParentEditor();
  }
  const outer = getOuterEditorFromDiffEditor(codeEditorService);
  if (outer) {
    return outer;
  }
  return editor;
};
const _GoToNextMessageAction = class _GoToNextMessageAction extends Action2 {
  constructor() {
    super({
      id: _GoToNextMessageAction.ID,
      f1: true,
      title: localize2("testing.goToNextMessage", "Go to Next Test Failure"),
      metadata: {
        description: localize2("testing.goToNextMessage.description", "Shows the next failure message in your file")
      },
      icon: Codicon.arrowDown,
      category: Categories.Test,
      keybinding: {
        primary: KeyMod.Alt | KeyCode.F8,
        weight: KeybindingWeight.EditorContrib + 1,
        when: navWhen
      },
      menu: [{
        id: MenuId.TestPeekTitle,
        group: "navigation",
        order: 2
      }, {
        id: MenuId.CommandPalette,
        when: navWhen
      }]
    });
  }
  run(accessor) {
    const editor = getPeekedEditorFromFocus(accessor.get(ICodeEditorService));
    if (editor) {
      TestingOutputPeekController.get(editor)?.next();
    }
  }
};
_GoToNextMessageAction.ID = "testing.goToNextMessage";
let GoToNextMessageAction = _GoToNextMessageAction;
const _GoToPreviousMessageAction = class _GoToPreviousMessageAction extends Action2 {
  constructor() {
    super({
      id: _GoToPreviousMessageAction.ID,
      f1: true,
      title: localize2("testing.goToPreviousMessage", "Go to Previous Test Failure"),
      metadata: {
        description: localize2("testing.goToPreviousMessage.description", "Shows the previous failure message in your file")
      },
      icon: Codicon.arrowUp,
      category: Categories.Test,
      keybinding: {
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F8,
        weight: KeybindingWeight.EditorContrib + 1,
        when: navWhen
      },
      menu: [{
        id: MenuId.TestPeekTitle,
        group: "navigation",
        order: 1
      }, {
        id: MenuId.CommandPalette,
        when: navWhen
      }]
    });
  }
  run(accessor) {
    const editor = getPeekedEditorFromFocus(accessor.get(ICodeEditorService));
    if (editor) {
      TestingOutputPeekController.get(editor)?.previous();
    }
  }
};
_GoToPreviousMessageAction.ID = "testing.goToPreviousMessage";
let GoToPreviousMessageAction = _GoToPreviousMessageAction;
const _CollapsePeekStack = class _CollapsePeekStack extends Action2 {
  constructor() {
    super({
      id: _CollapsePeekStack.ID,
      title: localize2("testing.collapsePeekStack", "Collapse Stack Frames"),
      icon: Codicon.collapseAll,
      category: Categories.Test,
      menu: [{
        id: MenuId.TestPeekTitle,
        when: TestingContextKeys.peekHasStack,
        group: "navigation",
        order: 4
      }]
    });
  }
  run(accessor) {
    const editor = getPeekedEditorFromFocus(accessor.get(ICodeEditorService));
    if (editor) {
      TestingOutputPeekController.get(editor)?.collapseStack();
    }
  }
};
_CollapsePeekStack.ID = "testing.collapsePeekStack";
let CollapsePeekStack = _CollapsePeekStack;
const _OpenMessageInEditorAction = class _OpenMessageInEditorAction extends Action2 {
  constructor() {
    super({
      id: _OpenMessageInEditorAction.ID,
      f1: false,
      title: localize2("testing.openMessageInEditor", "Open in Editor"),
      icon: Codicon.goToFile,
      category: Categories.Test,
      menu: [{ id: MenuId.TestPeekTitle }]
    });
  }
  run(accessor) {
    accessor.get(ITestingPeekOpener).openCurrentInEditor();
  }
};
_OpenMessageInEditorAction.ID = "testing.openMessageInEditor";
let OpenMessageInEditorAction = _OpenMessageInEditorAction;
const _ToggleTestingPeekHistory = class _ToggleTestingPeekHistory extends Action2 {
  constructor() {
    super({
      id: _ToggleTestingPeekHistory.ID,
      f1: true,
      title: localize2("testing.toggleTestingPeekHistory", "Toggle Test History in Peek"),
      metadata: {
        description: localize2("testing.toggleTestingPeekHistory.description", "Shows or hides the history of test runs in the peek view")
      },
      icon: Codicon.history,
      category: Categories.Test,
      menu: [{
        id: MenuId.TestPeekTitle,
        group: "navigation",
        order: 3
      }],
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.Alt | KeyCode.KeyH,
        when: TestingContextKeys.isPeekVisible.isEqualTo(true)
      }
    });
  }
  run(accessor) {
    const opener = accessor.get(ITestingPeekOpener);
    opener.historyVisible.value = !opener.historyVisible.value;
  }
};
_ToggleTestingPeekHistory.ID = "testing.toggleTestingPeekHistory";
let ToggleTestingPeekHistory = _ToggleTestingPeekHistory;
export {
  CloseTestPeek,
  CollapsePeekStack,
  GoToNextMessageAction,
  GoToPreviousMessageAction,
  OpenMessageInEditorAction,
  TestResultsView,
  TestingOutputPeekController,
  TestingPeekOpener,
  ToggleTestingPeekHistory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvYnJvd3Nlci90ZXN0aW5nT3V0cHV0UGVlay50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBzdHJpcEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGVyaXZlZCwgZGlzcG9zYWJsZU9ic2VydmFibGVWYWx1ZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIGlzQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvZW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVtYmVkZGVkRGlmZkVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2VtYmVkZGVkRGlmZkVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElFZGl0b3IsIElFZGl0b3JDb250cmlidXRpb24sIFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGVla1ZpZXdTZXJ2aWNlLCBQZWVrVmlld1dpZGdldCwgcGVla1ZpZXdUaXRsZUZvcmVncm91bmQsIHBlZWtWaWV3VGl0bGVJbmZvRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3BlZWtWaWV3L2Jyb3dzZXIvcGVla1ZpZXcuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IGZpbGxJbkFjdGlvbkJhckFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvck9wdGlvbnMsIFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBiaW5kQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGVkaXRvckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElWaWV3UGFuZU9wdGlvbnMsIFZpZXdQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dG9PcGVuUGVla1ZpZXdXaGVuLCBUZXN0aW5nQ29uZmlnS2V5cywgZ2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0aW5nIH0gZnJvbSAnLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBNdXRhYmxlT2JzZXJ2YWJsZVZhbHVlLCBzdGF0aWNPYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi9jb21tb24vb2JzZXJ2YWJsZVZhbHVlLmpzJztcbmltcG9ydCB7IFN0b3JlZFZhbHVlIH0gZnJvbSAnLi4vY29tbW9uL3N0b3JlZFZhbHVlLmpzJztcbmltcG9ydCB7IElUZXN0UmVzdWx0LCBUZXN0UmVzdWx0SXRlbUNoYW5nZSwgVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24sIHJlc3VsdEl0ZW1QYXJlbnRzIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSZXN1bHQuanMnO1xuaW1wb3J0IHsgSVRlc3RSZXN1bHRTZXJ2aWNlLCBSZXN1bHRDaGFuZ2VFdmVudCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UmVzdWx0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVzdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdGVzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJpY2hMb2NhdGlvbiwgSVRlc3RNZXNzYWdlLCBUZXN0TWVzc2FnZVR5cGUsIFRlc3RSZXN1bHRJdGVtIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBUZXN0aW5nQ29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vdGVzdGluZ0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElTaG93UmVzdWx0T3B0aW9ucywgSVRlc3RpbmdQZWVrT3BlbmVyIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RpbmdQZWVrT3BlbmVyLmpzJztcbmltcG9ydCB7IGlzRmFpbGVkU3RhdGUgfSBmcm9tICcuLi9jb21tb24vdGVzdGluZ1N0YXRlcy5qcyc7XG5pbXBvcnQgeyBQYXJzZWRUZXN0VXJpLCBUZXN0VXJpVHlwZSwgYnVpbGRUZXN0VXJpLCBwYXJzZVRlc3RVcmkgfSBmcm9tICcuLi9jb21tb24vdGVzdGluZ1VyaS5qcyc7XG5pbXBvcnQgeyByZW5kZXJUZXN0TWVzc2FnZUFzVGV4dCB9IGZyb20gJy4vdGVzdE1lc3NhZ2VDb2xvcml6ZXIuanMnO1xuaW1wb3J0IHsgSW5zcGVjdFN1YmplY3QsIE1lc3NhZ2VTdWJqZWN0LCBUYXNrU3ViamVjdCwgVGVzdE91dHB1dFN1YmplY3QsIGluc3BlY3RTdWJqZWN0SGFzU3RhY2ssIG1hcEZpbmRUZXN0TWVzc2FnZSB9IGZyb20gJy4vdGVzdFJlc3VsdHNWaWV3L3Rlc3RSZXN1bHRzU3ViamVjdC5qcyc7XG5pbXBvcnQgeyBUZXN0UmVzdWx0c1ZpZXdDb250ZW50IH0gZnJvbSAnLi90ZXN0UmVzdWx0c1ZpZXcvdGVzdFJlc3VsdHNWaWV3Q29udGVudC5qcyc7XG5pbXBvcnQgeyB0ZXN0aW5nTWVzc2FnZVBlZWtCb3JkZXIsIHRlc3RpbmdQZWVrQm9yZGVyLCB0ZXN0aW5nUGVla0hlYWRlckJhY2tncm91bmQsIHRlc3RpbmdQZWVrTWVzc2FnZUhlYWRlckJhY2tncm91bmQgfSBmcm9tICcuL3RoZW1lLmpzJztcblxuXG4vKiogSXRlcmF0ZXMgdGhyb3VnaCBldmVyeSBtZXNzYWdlIGluIGV2ZXJ5IHJlc3VsdCAqL1xuZnVuY3Rpb24qIGFsbE1lc3NhZ2VzKFtyZXN1bHRdOiByZWFkb25seSBJVGVzdFJlc3VsdFtdKSB7XG5cdGlmICghcmVzdWx0KSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Zm9yIChjb25zdCB0ZXN0IG9mIHJlc3VsdC50ZXN0cykge1xuXHRcdGZvciAobGV0IHRhc2tJbmRleCA9IDA7IHRhc2tJbmRleCA8IHRlc3QudGFza3MubGVuZ3RoOyB0YXNrSW5kZXgrKykge1xuXHRcdFx0Y29uc3QgbWVzc2FnZXMgPSB0ZXN0LnRhc2tzW3Rhc2tJbmRleF0ubWVzc2FnZXM7XG5cdFx0XHRmb3IgKGxldCBtZXNzYWdlSW5kZXggPSAwOyBtZXNzYWdlSW5kZXggPCBtZXNzYWdlcy5sZW5ndGg7IG1lc3NhZ2VJbmRleCsrKSB7XG5cblx0XHRcdFx0aWYgKG1lc3NhZ2VzW21lc3NhZ2VJbmRleF0udHlwZSA9PT0gVGVzdE1lc3NhZ2VUeXBlLkVycm9yKSB7XG5cdFx0XHRcdFx0eWllbGQgeyByZXN1bHQsIHRlc3QsIHRhc2tJbmRleCwgbWVzc2FnZUluZGV4IH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIElNZXNzYWdlSXRlcmF0ZWRSZWZlcmVuY2Uge1xuXHRtZXNzYWdlSW5kZXg6IG51bWJlcjtcblx0dGFza0luZGV4OiBudW1iZXI7XG5cdHJlc3VsdDogSVRlc3RSZXN1bHQ7XG5cdHRlc3Q6IFRlc3RSZXN1bHRJdGVtO1xufVxuXG5mdW5jdGlvbiBtZXNzYWdlSXRSZWZlcmVuY2VUb1VyaSh7IHJlc3VsdCwgdGVzdCwgdGFza0luZGV4LCBtZXNzYWdlSW5kZXggfTogSU1lc3NhZ2VJdGVyYXRlZFJlZmVyZW5jZSkge1xuXHRyZXR1cm4gYnVpbGRUZXN0VXJpKHtcblx0XHR0eXBlOiBUZXN0VXJpVHlwZS5SZXN1bHRNZXNzYWdlLFxuXHRcdHJlc3VsdElkOiByZXN1bHQuaWQsXG5cdFx0dGVzdEV4dElkOiB0ZXN0Lml0ZW0uZXh0SWQsXG5cdFx0dGFza0luZGV4LFxuXHRcdG1lc3NhZ2VJbmRleCxcblx0fSk7XG59XG5cbnR5cGUgVGVzdFVyaVdpdGhEb2N1bWVudCA9IFBhcnNlZFRlc3RVcmkgJiB7IGRvY3VtZW50VXJpOiBVUkkgfTtcblxuZXhwb3J0IGNsYXNzIFRlc3RpbmdQZWVrT3BlbmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXN0aW5nUGVla09wZW5lciB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIudGVzdGluZy5wZWVrT3BlbmVyJztcblxuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGxhc3RVcmk/OiBUZXN0VXJpV2l0aERvY3VtZW50O1xuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgaGlzdG9yeVZpc2libGU6IE11dGFibGVPYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASVRlc3RSZXN1bHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVzdFJlc3VsdHM6IElUZXN0UmVzdWx0U2VydmljZSxcblx0XHRASVRlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVzdFNlcnZpY2U6IElUZXN0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGVzdFJlc3VsdHMub25UZXN0Q2hhbmdlZCh0aGlzLm9wZW5QZWVrT25GYWlsdXJlLCB0aGlzKSk7XG5cdFx0dGhpcy5oaXN0b3J5VmlzaWJsZSA9IHRoaXMuX3JlZ2lzdGVyKE11dGFibGVPYnNlcnZhYmxlVmFsdWUuc3RvcmVkKG5ldyBTdG9yZWRWYWx1ZTxib29sZWFuPih7XG5cdFx0XHRrZXk6ICd0ZXN0SGlzdG9yeVZpc2libGVJblBlZWsnLFxuXHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5QUk9GSUxFLFxuXHRcdFx0dGFyZ2V0OiBTdG9yYWdlVGFyZ2V0LlVTRVIsXG5cdFx0fSwgc3RvcmFnZVNlcnZpY2UpLCBmYWxzZSkpO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBhc3luYyBvcGVuKCkge1xuXHRcdGxldCB1cmk6IFRlc3RVcmlXaXRoRG9jdW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWN0aXZlID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHRcdGlmIChpc0NvZGVFZGl0b3IoYWN0aXZlKSAmJiBhY3RpdmUuZ2V0TW9kZWwoKT8udXJpKSB7XG5cdFx0XHRjb25zdCBtb2RlbFVyaSA9IGFjdGl2ZS5nZXRNb2RlbCgpPy51cmk7XG5cdFx0XHRpZiAobW9kZWxVcmkpIHtcblx0XHRcdFx0dXJpID0gYXdhaXQgdGhpcy5nZXRGaWxlQ2FuZGlkYXRlTWVzc2FnZShtb2RlbFVyaSwgYWN0aXZlLmdldFBvc2l0aW9uKCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdXJpKSB7XG5cdFx0XHR1cmkgPSB0aGlzLmxhc3RVcmk7XG5cdFx0fVxuXG5cdFx0aWYgKCF1cmkpIHtcblx0XHRcdHVyaSA9IHRoaXMuZ2V0QW55Q2FuZGlkYXRlTWVzc2FnZSgpO1xuXHRcdH1cblxuXHRcdGlmICghdXJpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc2hvd1BlZWtGcm9tVXJpKHVyaSk7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIHRyeVBlZWtGaXJzdEVycm9yKHJlc3VsdDogSVRlc3RSZXN1bHQsIHRlc3Q6IFRlc3RSZXN1bHRJdGVtLCBvcHRpb25zPzogUGFydGlhbDxJVGV4dEVkaXRvck9wdGlvbnM+KSB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlID0gdGhpcy5nZXRGYWlsZWRDYW5kaWRhdGVNZXNzYWdlKHRlc3QpO1xuXHRcdGlmICghY2FuZGlkYXRlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5zaG93UGVla0Zyb21Vcmkoe1xuXHRcdFx0dHlwZTogVGVzdFVyaVR5cGUuUmVzdWx0TWVzc2FnZSxcblx0XHRcdGRvY3VtZW50VXJpOiBjYW5kaWRhdGUubG9jYXRpb24udXJpLFxuXHRcdFx0dGFza0luZGV4OiBjYW5kaWRhdGUudGFza0lkLFxuXHRcdFx0bWVzc2FnZUluZGV4OiBjYW5kaWRhdGUuaW5kZXgsXG5cdFx0XHRyZXN1bHRJZDogcmVzdWx0LmlkLFxuXHRcdFx0dGVzdEV4dElkOiB0ZXN0Lml0ZW0uZXh0SWQsXG5cdFx0fSwgdW5kZWZpbmVkLCB7IHNlbGVjdGlvbjogY2FuZGlkYXRlLmxvY2F0aW9uLnJhbmdlLCBzZWxlY3Rpb25SZXZlYWxUeXBlOiBUZXh0RWRpdG9yU2VsZWN0aW9uUmV2ZWFsVHlwZS5OZWFyVG9wSWZPdXRzaWRlVmlld3BvcnQsIC4uLm9wdGlvbnMgfSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIHBlZWtVcmkodXJpOiBVUkksIG9wdGlvbnM6IElTaG93UmVzdWx0T3B0aW9ucyA9IHt9KSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VUZXN0VXJpKHVyaSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VkICYmIHRoaXMudGVzdFJlc3VsdHMuZ2V0UmVzdWx0KHBhcnNlZC5yZXN1bHRJZCk7XG5cdFx0aWYgKCFwYXJzZWQgfHwgIXJlc3VsdCB8fCAhKCd0ZXN0RXh0SWQnIGluIHBhcnNlZCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoISgnbWVzc2FnZUluZGV4JyBpbiBwYXJzZWQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWVzc2FnZSA9IHJlc3VsdC5nZXRTdGF0ZUJ5SWQocGFyc2VkLnRlc3RFeHRJZCk/LnRhc2tzW3BhcnNlZC50YXNrSW5kZXhdLm1lc3NhZ2VzW3BhcnNlZC5tZXNzYWdlSW5kZXhdO1xuXHRcdGlmICghbWVzc2FnZT8ubG9jYXRpb24pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLnNob3dQZWVrRnJvbVVyaSh7XG5cdFx0XHR0eXBlOiBUZXN0VXJpVHlwZS5SZXN1bHRNZXNzYWdlLFxuXHRcdFx0ZG9jdW1lbnRVcmk6IG1lc3NhZ2UubG9jYXRpb24udXJpLFxuXHRcdFx0dGFza0luZGV4OiBwYXJzZWQudGFza0luZGV4LFxuXHRcdFx0bWVzc2FnZUluZGV4OiBwYXJzZWQubWVzc2FnZUluZGV4LFxuXHRcdFx0cmVzdWx0SWQ6IHJlc3VsdC5pZCxcblx0XHRcdHRlc3RFeHRJZDogcGFyc2VkLnRlc3RFeHRJZCxcblx0XHR9LCBvcHRpb25zLmluRWRpdG9yLCB7IHNlbGVjdGlvbjogbWVzc2FnZS5sb2NhdGlvbi5yYW5nZSwgLi4ub3B0aW9ucy5vcHRpb25zIH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBjbG9zZUFsbFBlZWtzKCkge1xuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIHRoaXMuY29kZUVkaXRvclNlcnZpY2UubGlzdENvZGVFZGl0b3JzKCkpIHtcblx0XHRcdFRlc3RpbmdPdXRwdXRQZWVrQ29udHJvbGxlci5nZXQoZWRpdG9yKT8ucmVtb3ZlUGVlaygpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvcGVuQ3VycmVudEluRWRpdG9yKCk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLmdldEFjdGl2ZUNvbnRyb2woKTtcblx0XHRpZiAoIWN1cnJlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvcHRpb25zID0geyBwaW5uZWQ6IGZhbHNlLCByZXZlYWxJZk9wZW5lZDogdHJ1ZSB9O1xuXHRcdGlmIChjdXJyZW50IGluc3RhbmNlb2YgVGFza1N1YmplY3QgfHwgY3VycmVudCBpbnN0YW5jZW9mIFRlc3RPdXRwdXRTdWJqZWN0KSB7XG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBjdXJyZW50Lm91dHB1dFVyaSwgb3B0aW9ucyB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoY3VycmVudCBpbnN0YW5jZW9mIFRlc3RPdXRwdXRTdWJqZWN0KSB7XG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBjdXJyZW50Lm91dHB1dFVyaSwgb3B0aW9ucyB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtZXNzYWdlID0gY3VycmVudC5tZXNzYWdlO1xuXHRcdGlmIChjdXJyZW50LmlzRGlmZmFibGUpIHtcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IGN1cnJlbnQuZXhwZWN0ZWRVcmkgfSxcblx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IGN1cnJlbnQuYWN0dWFsVXJpIH0sXG5cdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiBtZXNzYWdlLm1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBjdXJyZW50Lm1lc3NhZ2VVcmksIG9wdGlvbnMgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ21hcmtkb3duLnNob3dQcmV2aWV3JywgY3VycmVudC5tZXNzYWdlVXJpKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3Rlc3RpbmcubWFya2Rvd25QZWVrRXJyb3InLCAnQ291bGQgbm90IG9wZW4gbWFya2Rvd24gcHJldmlldzogezB9LlxcblxcblBsZWFzZSBtYWtlIHN1cmUgdGhlIG1hcmtkb3duIGV4dGVuc2lvbiBpcyBlbmFibGVkLicsIGVyci5tZXNzYWdlKSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGl2ZUNvbnRyb2woKTogSW5zcGVjdFN1YmplY3QgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVkaXRvciA9IGdldFBlZWtlZEVkaXRvckZyb21Gb2N1cyh0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZWRpdG9yICYmIFRlc3RpbmdPdXRwdXRQZWVrQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRyZXR1cm4gY29udHJvbGxlcj8uc3ViamVjdC5nZXQoKSA/PyB0aGlzLnZpZXdzU2VydmljZS5nZXRBY3RpdmVWaWV3V2l0aElkPFRlc3RSZXN1bHRzVmlldz4oVGVzdGluZy5SZXN1bHRzVmlld0lkKT8uc3ViamVjdDtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwcml2YXRlIGFzeW5jIHNob3dQZWVrRnJvbVVyaSh1cmk6IFRlc3RVcmlXaXRoRG9jdW1lbnQsIGVkaXRvcj86IElFZGl0b3IsIG9wdGlvbnM/OiBJVGV4dEVkaXRvck9wdGlvbnMpIHtcblx0XHRpZiAoaXNDb2RlRWRpdG9yKGVkaXRvcikpIHtcblx0XHRcdHRoaXMubGFzdFVyaSA9IHVyaTtcblx0XHRcdFRlc3RpbmdPdXRwdXRQZWVrQ29udHJvbGxlci5nZXQoZWRpdG9yKT8uc2hvdyhidWlsZFRlc3RVcmkodGhpcy5sYXN0VXJpKSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBwYW5lID0gYXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IHVyaS5kb2N1bWVudFVyaSxcblx0XHRcdG9wdGlvbnM6IHsgcmV2ZWFsSWZPcGVuZWQ6IHRydWUsIC4uLm9wdGlvbnMgfVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY29udHJvbCA9IHBhbmU/LmdldENvbnRyb2woKTtcblx0XHRpZiAoIWlzQ29kZUVkaXRvcihjb250cm9sKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMubGFzdFVyaSA9IHVyaTtcblx0XHRUZXN0aW5nT3V0cHV0UGVla0NvbnRyb2xsZXIuZ2V0KGNvbnRyb2wpPy5zaG93KGJ1aWxkVGVzdFVyaSh0aGlzLmxhc3RVcmkpKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPcGVucyB0aGUgcGVlayB2aWV3IG9uIGEgdGVzdCBmYWlsdXJlLCBiYXNlZCBvbiB1c2VyIHByZWZlcmVuY2VzLlxuXHQgKi9cblx0cHJpdmF0ZSBvcGVuUGVla09uRmFpbHVyZShldnQ6IFRlc3RSZXN1bHRJdGVtQ2hhbmdlKSB7XG5cdFx0aWYgKGV2dC5yZWFzb24gIT09IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLk93blN0YXRlQ2hhbmdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FuZGlkYXRlID0gdGhpcy5nZXRGYWlsZWRDYW5kaWRhdGVNZXNzYWdlKGV2dC5pdGVtKTtcblx0XHRpZiAoIWNhbmRpZGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChldnQucmVzdWx0LnJlcXVlc3QuY29udGludW91cyAmJiAhZ2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24odGhpcy5jb25maWd1cmF0aW9uLCBUZXN0aW5nQ29uZmlnS2V5cy5BdXRvT3BlblBlZWtWaWV3RHVyaW5nQ29udGludW91c1J1bikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3JzID0gdGhpcy5jb2RlRWRpdG9yU2VydmljZS5saXN0Q29kZUVkaXRvcnMoKTtcblx0XHRjb25zdCBjZmcgPSBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbih0aGlzLmNvbmZpZ3VyYXRpb24sIFRlc3RpbmdDb25maWdLZXlzLkF1dG9PcGVuUGVla1ZpZXcpO1xuXG5cdFx0Ly8gZG9uJ3Qgc2hvdyB0aGUgcGVlayBpZiB0aGUgdXNlciBhc2tlZCB0byBvbmx5IGF1dG8tb3BlbiBwZWVrcyBmb3IgdmlzaWJsZSB0ZXN0cyxcblx0XHQvLyBhbmQgdGhpcyB0ZXN0IGlzIG5vdCBpbiBhbnkgb2YgdGhlIGVkaXRvcnMnIG1vZGVscy5cblx0XHRzd2l0Y2ggKGNmZykge1xuXHRcdFx0Y2FzZSBBdXRvT3BlblBlZWtWaWV3V2hlbi5GYWlsdXJlVmlzaWJsZToge1xuXHRcdFx0XHRjb25zdCB2aXNpYmxlRWRpdG9ycyA9IHRoaXMuZWRpdG9yU2VydmljZS52aXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzO1xuXHRcdFx0XHRjb25zdCBlZGl0b3JVcmlzID0gbmV3IFNldCh2aXNpYmxlRWRpdG9ycy5maWx0ZXIoaXNDb2RlRWRpdG9yKS5tYXAoZSA9PiBlLmdldE1vZGVsKCk/LnVyaS50b1N0cmluZygpKSk7XG5cdFx0XHRcdGlmICghSXRlcmFibGUuc29tZShyZXN1bHRJdGVtUGFyZW50cyhldnQucmVzdWx0LCBldnQuaXRlbSksIGkgPT4gaS5pdGVtLnVyaSAmJiBlZGl0b3JVcmlzLmhhcyhpLml0ZW0udXJpLnRvU3RyaW5nKCkpKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBBbHNvIGNoZWNrIHRoYXQgdGhlIG1lc3NhZ2UgbG9jYXRpb24gaXRzZWxmIGlzIGluIGEgdmlzaWJsZVxuXHRcdFx0XHQvLyBkb2N1bWVudC4gVGhlIG1lc3NhZ2UgbWF5IHBvaW50IHRvIGEgZGlmZmVyZW50IGZpbGUgKGUuZy4gYVxuXHRcdFx0XHQvLyB1dGlsaXR5KSB0aGFuIHdoZXJlIHRoZSB0ZXN0IGlzIGRlZmluZWQsIGFuZCBvcGVuaW5nIGEgbm9uLVxuXHRcdFx0XHQvLyB2aXNpYmxlIGZpbGUganVzdCB0byBzaG93IGEgcGVlayB3b3VsZCBiZSBkaXNydXB0aXZlLlxuXHRcdFx0XHRpZiAoIWVkaXRvclVyaXMuaGFzKGNhbmRpZGF0ZS5sb2NhdGlvbi51cmkudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7IC8vY29udGludWVcblx0XHRcdH1cblx0XHRcdGNhc2UgQXV0b09wZW5QZWVrVmlld1doZW4uRmFpbHVyZUFueXdoZXJlOlxuXHRcdFx0XHRicmVhazsgLy9jb250aW51ZVxuXG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm47IC8vIG5ldmVyIHNob3dcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVycyA9IGVkaXRvcnMubWFwKFRlc3RpbmdPdXRwdXRQZWVrQ29udHJvbGxlci5nZXQpO1xuXHRcdGlmIChjb250cm9sbGVycy5zb21lKGMgPT4gYz8uc3ViamVjdC5nZXQoKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnRyeVBlZWtGaXJzdEVycm9yKGV2dC5yZXN1bHQsIGV2dC5pdGVtKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBtZXNzYWdlIGNsb3Nlc3QgdG8gdGhlIGdpdmVuIHBvc2l0aW9uIGZyb20gYSB0ZXN0IGluIHRoZSBmaWxlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBnZXRGaWxlQ2FuZGlkYXRlTWVzc2FnZSh1cmk6IFVSSSwgcG9zaXRpb246IFBvc2l0aW9uIHwgbnVsbCkge1xuXHRcdGxldCBiZXN0OiBUZXN0VXJpV2l0aERvY3VtZW50IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBiZXN0RGlzdGFuY2UgPSBJbmZpbml0eTtcblxuXHRcdC8vIEdldCBhbGwgdGVzdHMgZm9yIHRoZSBkb2N1bWVudC4gSW4gdGhvc2UsIGZpbmQgb25lIHRoYXQgaGFzIGEgdGVzdFxuXHRcdC8vIG1lc3NhZ2UgY2xvc2VzdCB0byB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuXHRcdGNvbnN0IGRlbWFuZGVkVXJpU3RyID0gdXJpLnRvU3RyaW5nKCk7XG5cdFx0Zm9yIChjb25zdCB0ZXN0IG9mIHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbi5hbGwpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMudGVzdFJlc3VsdHMuZ2V0U3RhdGVCeUlkKHRlc3QuaXRlbS5leHRJZCk7XG5cdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0bWFwRmluZFRlc3RNZXNzYWdlKHJlc3VsdFsxXSwgKF90YXNrLCBtZXNzYWdlLCBtZXNzYWdlSW5kZXgsIHRhc2tJbmRleCkgPT4ge1xuXHRcdFx0XHRpZiAobWVzc2FnZS50eXBlICE9PSBUZXN0TWVzc2FnZVR5cGUuRXJyb3IgfHwgIW1lc3NhZ2UubG9jYXRpb24gfHwgbWVzc2FnZS5sb2NhdGlvbi51cmkudG9TdHJpbmcoKSAhPT0gZGVtYW5kZWRVcmlTdHIpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBkaXN0YW5jZSA9IHBvc2l0aW9uID8gTWF0aC5hYnMocG9zaXRpb24ubGluZU51bWJlciAtIG1lc3NhZ2UubG9jYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSA6IDA7XG5cdFx0XHRcdGlmICghYmVzdCB8fCBkaXN0YW5jZSA8PSBiZXN0RGlzdGFuY2UpIHtcblx0XHRcdFx0XHRiZXN0RGlzdGFuY2UgPSBkaXN0YW5jZTtcblx0XHRcdFx0XHRiZXN0ID0ge1xuXHRcdFx0XHRcdFx0dHlwZTogVGVzdFVyaVR5cGUuUmVzdWx0TWVzc2FnZSxcblx0XHRcdFx0XHRcdHRlc3RFeHRJZDogcmVzdWx0WzFdLml0ZW0uZXh0SWQsXG5cdFx0XHRcdFx0XHRyZXN1bHRJZDogcmVzdWx0WzBdLmlkLFxuXHRcdFx0XHRcdFx0dGFza0luZGV4LFxuXHRcdFx0XHRcdFx0bWVzc2FnZUluZGV4LFxuXHRcdFx0XHRcdFx0ZG9jdW1lbnRVcmk6IHVyaSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYmVzdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIGFueSBwb3NzaWJsZSBzdGlsbC1yZWxldmFudCBtZXNzYWdlIGZyb20gdGhlIHJlc3VsdHMuXG5cdCAqL1xuXHRwcml2YXRlIGdldEFueUNhbmRpZGF0ZU1lc3NhZ2UoKSB7XG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgcmVzdWx0IG9mIHRoaXMudGVzdFJlc3VsdHMucmVzdWx0cykge1xuXHRcdFx0Zm9yIChjb25zdCB0ZXN0IG9mIHJlc3VsdC50ZXN0cykge1xuXHRcdFx0XHRpZiAoc2Vlbi5oYXModGVzdC5pdGVtLmV4dElkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2Vlbi5hZGQodGVzdC5pdGVtLmV4dElkKTtcblx0XHRcdFx0Y29uc3QgZm91bmQgPSBtYXBGaW5kVGVzdE1lc3NhZ2UodGVzdCwgKHRhc2ssIG1lc3NhZ2UsIG1lc3NhZ2VJbmRleCwgdGFza0luZGV4KSA9PiAoXG5cdFx0XHRcdFx0bWVzc2FnZS5sb2NhdGlvbiAmJiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBUZXN0VXJpVHlwZS5SZXN1bHRNZXNzYWdlLFxuXHRcdFx0XHRcdFx0dGVzdEV4dElkOiB0ZXN0Lml0ZW0uZXh0SWQsXG5cdFx0XHRcdFx0XHRyZXN1bHRJZDogcmVzdWx0LmlkLFxuXHRcdFx0XHRcdFx0dGFza0luZGV4LFxuXHRcdFx0XHRcdFx0bWVzc2FnZUluZGV4LFxuXHRcdFx0XHRcdFx0ZG9jdW1lbnRVcmk6IG1lc3NhZ2UubG9jYXRpb24udXJpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0KSk7XG5cblx0XHRcdFx0aWYgKGZvdW5kKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZvdW5kO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBmaXJzdCBmYWlsZWQgbWVzc2FnZSB0aGF0IGNhbiBiZSBkaXNwbGF5ZWQgZnJvbSB0aGUgcmVzdWx0LlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRGYWlsZWRDYW5kaWRhdGVNZXNzYWdlKHRlc3Q6IFRlc3RSZXN1bHRJdGVtKSB7XG5cdFx0Y29uc3QgZmFsbGJhY2tMb2NhdGlvbiA9IHRlc3QuaXRlbS51cmkgJiYgdGVzdC5pdGVtLnJhbmdlXG5cdFx0XHQ/IHsgdXJpOiB0ZXN0Lml0ZW0udXJpLCByYW5nZTogdGVzdC5pdGVtLnJhbmdlIH1cblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0bGV0IGJlc3Q6IHsgdGFza0lkOiBudW1iZXI7IGluZGV4OiBudW1iZXI7IG1lc3NhZ2U6IElUZXN0TWVzc2FnZTsgbG9jYXRpb246IElSaWNoTG9jYXRpb24gfSB8IHVuZGVmaW5lZDtcblx0XHRtYXBGaW5kVGVzdE1lc3NhZ2UodGVzdCwgKHRhc2ssIG1lc3NhZ2UsIG1lc3NhZ2VJbmRleCwgdGFza0lkKSA9PiB7XG5cdFx0XHRjb25zdCBsb2NhdGlvbiA9IG1lc3NhZ2UubG9jYXRpb24gfHwgZmFsbGJhY2tMb2NhdGlvbjtcblx0XHRcdGlmICghaXNGYWlsZWRTdGF0ZSh0YXNrLnN0YXRlKSB8fCAhbG9jYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYmVzdCAmJiBtZXNzYWdlLnR5cGUgIT09IFRlc3RNZXNzYWdlVHlwZS5FcnJvcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGJlc3QgPSB7IHRhc2tJZCwgaW5kZXg6IG1lc3NhZ2VJbmRleCwgbWVzc2FnZSwgbG9jYXRpb24gfTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBiZXN0O1xuXHR9XG59XG5cbi8qKlxuICogQWRkcyBvdXRwdXQvbWVzc2FnZSBwZWVrIGZ1bmN0aW9uYWxpdHkgdG8gY29kZSBlZGl0b3JzLlxuICovXG5leHBvcnQgY2xhc3MgVGVzdGluZ091dHB1dFBlZWtDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXHQvKipcblx0ICogR2V0cyB0aGUgY29udHJvbGxlciBhc3NvY2lhdGVkIHdpdGggdGhlIGdpdmVuIGNvZGUgZWRpdG9yLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBnZXQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IFRlc3RpbmdPdXRwdXRQZWVrQ29udHJvbGxlciB8IG51bGwge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPFRlc3RpbmdPdXRwdXRQZWVrQ29udHJvbGxlcj4oVGVzdGluZy5PdXRwdXRQZWVrQ29udHJpYnV0aW9uSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEN1cnJlbnRseS1zaG93biBwZWVrIHZpZXcuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IHBlZWsgPSB0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlT2JzZXJ2YWJsZVZhbHVlPFRlc3RSZXN1bHRzUGVlayB8IHVuZGVmaW5lZD4oJ1Rlc3RpbmdPdXRwdXRQZWVrJywgdW5kZWZpbmVkKSk7XG5cblx0LyoqXG5cdCAqIENvbnRleHQga2V5IHVwZGF0ZWQgd2hlbiB0aGUgcGVlayBpcyB2aXNpYmxlL2hpZGRlbi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgdmlzaWJsZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIGN1cnJlbnRseSBkaXNwbGF5IHN1YmplY3QuIFVuZGVmaW5lZCBpZiB0aGUgcGVlayBpcyBub3Qgb3Blbi5cblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBzdWJqZWN0ID0gZGVyaXZlZChyZWFkZXIgPT4gdGhpcy5wZWVrLnJlYWQocmVhZGVyKT8uY3VycmVudC5yZWFkKHJlYWRlcikpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRlc3RSZXN1bHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVzdFJlc3VsdHM6IElUZXN0UmVzdWx0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnZpc2libGUgPSBUZXN0aW5nQ29udGV4dEtleXMuaXNQZWVrVmlzaWJsZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHRoaXMucGVlay5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGVzdFJlc3VsdHMub25SZXN1bHRzQ2hhbmdlZCh0aGlzLmNsb3NlUGVla09uQ2VydGFpblJlc3VsdEV2ZW50cywgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRlc3RSZXN1bHRzLm9uVGVzdENoYW5nZWQodGhpcy5jbG9zZVBlZWtPblRlc3RDaGFuZ2UsIHRoaXMpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93cyBhIHBlZWsgZm9yIHRoZSBtZXNzYWdlIGluIHRoZSBlZGl0b3IuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgc2hvdyh1cmk6IFVSSSkge1xuXHRcdGNvbnN0IHN1YmplY3QgPSB0aGlzLnJldHJpZXZlVGVzdCh1cmkpO1xuXHRcdGlmIChzdWJqZWN0KSB7XG5cdFx0XHR0aGlzLnNob3dTdWJqZWN0KHN1YmplY3QpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93cyBhIHBlZWsgZm9yIHRoZSBleGlzdGluZyBpbnNwZWN0IHN1YmplY3QuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgc2hvd1N1YmplY3Qoc3ViamVjdDogSW5zcGVjdFN1YmplY3QpIHtcblx0XHRpZiAoIXRoaXMucGVlay5nZXQoKSkge1xuXHRcdFx0Y29uc3QgcGVlayA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFJlc3VsdHNQZWVrLCB0aGlzLmVkaXRvcik7XG5cdFx0XHR0aGlzLnBlZWsuc2V0KHBlZWssIHVuZGVmaW5lZCk7XG5cdFx0XHRFdmVudC5vbmNlKHBlZWsub25EaWRDbG9zZSkoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnZpc2libGUuc2V0KGZhbHNlKTtcblx0XHRcdFx0dGhpcy5wZWVrLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy52aXNpYmxlLnNldCh0cnVlKTtcblx0XHRcdHBlZWsuY3JlYXRlKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN1YmplY3QgaW5zdGFuY2VvZiBNZXNzYWdlU3ViamVjdCkge1xuXHRcdFx0YWxlcnQocmVuZGVyVGVzdE1lc3NhZ2VBc1RleHQoc3ViamVjdC5tZXNzYWdlLm1lc3NhZ2UpKTtcblx0XHR9XG5cblx0XHR0aGlzLnBlZWsuZ2V0KCkhLnNldE1vZGVsKHN1YmplY3QpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIG9wZW5BbmRTaG93KHVyaTogVVJJKSB7XG5cdFx0Y29uc3Qgc3ViamVjdCA9IHRoaXMucmV0cmlldmVUZXN0KHVyaSk7XG5cdFx0aWYgKCFzdWJqZWN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFzdWJqZWN0LnJldmVhbExvY2F0aW9uIHx8IHN1YmplY3QucmV2ZWFsTG9jYXRpb24udXJpLnRvU3RyaW5nKCkgPT09IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk/LnVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zaG93KHVyaSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3RoZXJFZGl0b3IgPSBhd2FpdCB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLm9wZW5Db2RlRWRpdG9yKHtcblx0XHRcdHJlc291cmNlOiBzdWJqZWN0LnJldmVhbExvY2F0aW9uLnVyaSxcblx0XHRcdG9wdGlvbnM6IHsgcGlubmVkOiBmYWxzZSwgcmV2ZWFsSWZPcGVuZWQ6IHRydWUgfVxuXHRcdH0sIHRoaXMuZWRpdG9yKTtcblxuXHRcdGlmIChvdGhlckVkaXRvcikge1xuXHRcdFx0VGVzdGluZ091dHB1dFBlZWtDb250cm9sbGVyLmdldChvdGhlckVkaXRvcik/LnJlbW92ZVBlZWsoKTtcblx0XHRcdHJldHVybiBUZXN0aW5nT3V0cHV0UGVla0NvbnRyb2xsZXIuZ2V0KG90aGVyRWRpdG9yKT8uc2hvdyh1cmkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwb3NlcyB0aGUgcGVlayB2aWV3LCBpZiBhbnkuXG5cdCAqL1xuXHRwdWJsaWMgcmVtb3ZlUGVlaygpIHtcblx0XHR0aGlzLnBlZWsuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb2xsYXBzZXMgYWxsIGRpc3BsYXllZCBzdGFjayBmcmFtZXMuXG5cdCAqL1xuXHRwdWJsaWMgY29sbGFwc2VTdGFjaygpIHtcblx0XHR0aGlzLnBlZWsuZ2V0KCk/LmNvbGxhcHNlU3RhY2soKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93cyB0aGUgbmV4dCBtZXNzYWdlIGluIHRoZSBwZWVrLCBpZiBwb3NzaWJsZS5cblx0ICovXG5cdHB1YmxpYyBuZXh0KCkge1xuXHRcdGNvbnN0IHN1YmplY3QgPSB0aGlzLnBlZWsuZ2V0KCk/LmN1cnJlbnQuZ2V0KCk7XG5cdFx0aWYgKCFzdWJqZWN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGZpcnN0OiBJTWVzc2FnZUl0ZXJhdGVkUmVmZXJlbmNlIHwgdW5kZWZpbmVkO1xuXG5cdFx0bGV0IGZvdW5kID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBtIG9mIGFsbE1lc3NhZ2VzKHRoaXMudGVzdFJlc3VsdHMucmVzdWx0cykpIHtcblx0XHRcdGZpcnN0ID8/PSBtO1xuXHRcdFx0aWYgKHN1YmplY3QgaW5zdGFuY2VvZiBUYXNrU3ViamVjdCAmJiBtLnJlc3VsdC5pZCA9PT0gc3ViamVjdC5yZXN1bHQuaWQpIHtcblx0XHRcdFx0Zm91bmQgPSB0cnVlOyAvLyBvcGVuIHRoZSBmaXJzdCBtZXNzYWdlIGZvdW5kIGluIHRoZSBjdXJyZW50IHJlc3VsdFxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZm91bmQpIHtcblx0XHRcdFx0dGhpcy5vcGVuQW5kU2hvdyhtZXNzYWdlSXRSZWZlcmVuY2VUb1VyaShtKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN1YmplY3QgaW5zdGFuY2VvZiBUZXN0T3V0cHV0U3ViamVjdCAmJiBzdWJqZWN0LnRlc3QuaXRlbS5leHRJZCA9PT0gbS50ZXN0Lml0ZW0uZXh0SWQgJiYgc3ViamVjdC50YXNrSW5kZXggPT09IG0udGFza0luZGV4ICYmIHN1YmplY3QucmVzdWx0LmlkID09PSBtLnJlc3VsdC5pZCkge1xuXHRcdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdWJqZWN0IGluc3RhbmNlb2YgTWVzc2FnZVN1YmplY3QgJiYgc3ViamVjdC50ZXN0LmV4dElkID09PSBtLnRlc3QuaXRlbS5leHRJZCAmJiBzdWJqZWN0Lm1lc3NhZ2VJbmRleCA9PT0gbS5tZXNzYWdlSW5kZXggJiYgc3ViamVjdC50YXNrSW5kZXggPT09IG0udGFza0luZGV4ICYmIHN1YmplY3QucmVzdWx0LmlkID09PSBtLnJlc3VsdC5pZCkge1xuXHRcdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGZpcnN0KSB7XG5cdFx0XHR0aGlzLm9wZW5BbmRTaG93KG1lc3NhZ2VJdFJlZmVyZW5jZVRvVXJpKGZpcnN0KSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNob3dzIHRoZSBwcmV2aW91cyBtZXNzYWdlIGluIHRoZSBwZWVrLCBpZiBwb3NzaWJsZS5cblx0ICovXG5cdHB1YmxpYyBwcmV2aW91cygpIHtcblx0XHRjb25zdCBzdWJqZWN0ID0gdGhpcy5zdWJqZWN0LmdldCgpO1xuXHRcdGlmICghc3ViamVjdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBwcmV2aW91czogSU1lc3NhZ2VJdGVyYXRlZFJlZmVyZW5jZSB8IHVuZGVmaW5lZDsgLy8gcG9pbnRlciB0byB0aGUgbGFzdCBtZXNzYWdlXG5cdFx0bGV0IHByZXZpb3VzTG9ja2VkSW4gPSBmYWxzZTsgLy8gd2hldGhlciB0aGUgbGFzdCBtZXNzYWdlIHdhcyB2ZXJpZmllZCBhcyBwcmV2aW91cyB0byB0aGUgY3VycmVudCBzdWJqZWN0XG5cdFx0bGV0IGxhc3Q6IElNZXNzYWdlSXRlcmF0ZWRSZWZlcmVuY2UgfCB1bmRlZmluZWQ7IC8vIG92ZXJhbGwgbGFzdCBtZXNzYWdlXG5cdFx0Zm9yIChjb25zdCBtIG9mIGFsbE1lc3NhZ2VzKHRoaXMudGVzdFJlc3VsdHMucmVzdWx0cykpIHtcblx0XHRcdGxhc3QgPSBtO1xuXG5cdFx0XHRpZiAoIXByZXZpb3VzTG9ja2VkSW4pIHtcblx0XHRcdFx0aWYgKHN1YmplY3QgaW5zdGFuY2VvZiBUYXNrU3ViamVjdCkge1xuXHRcdFx0XHRcdGlmIChtLnJlc3VsdC5pZCA9PT0gc3ViamVjdC5yZXN1bHQuaWQpIHtcblx0XHRcdFx0XHRcdHByZXZpb3VzTG9ja2VkSW4gPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzdWJqZWN0IGluc3RhbmNlb2YgVGVzdE91dHB1dFN1YmplY3QpIHtcblx0XHRcdFx0XHRpZiAobS50ZXN0Lml0ZW0uZXh0SWQgPT09IHN1YmplY3QudGVzdC5pdGVtLmV4dElkICYmIG0ucmVzdWx0LmlkID09PSBzdWJqZWN0LnJlc3VsdC5pZCAmJiBtLnRhc2tJbmRleCA9PT0gc3ViamVjdC50YXNrSW5kZXgpIHtcblx0XHRcdFx0XHRcdHByZXZpb3VzTG9ja2VkSW4gPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzdWJqZWN0LnRlc3QuZXh0SWQgPT09IG0udGVzdC5pdGVtLmV4dElkICYmIHN1YmplY3QubWVzc2FnZUluZGV4ID09PSBtLm1lc3NhZ2VJbmRleCAmJiBzdWJqZWN0LnRhc2tJbmRleCA9PT0gbS50YXNrSW5kZXggJiYgc3ViamVjdC5yZXN1bHQuaWQgPT09IG0ucmVzdWx0LmlkKSB7XG5cdFx0XHRcdFx0cHJldmlvdXNMb2NrZWRJbiA9IHRydWU7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcmV2aW91cyA9IG07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gcHJldmlvdXMgfHwgbGFzdDtcblx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHR0aGlzLm9wZW5BbmRTaG93KG1lc3NhZ2VJdFJlZmVyZW5jZVRvVXJpKHRhcmdldCkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmVzIHRoZSBwZWVrIHZpZXcgaWYgaXQncyBiZWluZyBkaXNwbGF5ZWQgb24gdGhlIGdpdmVuIHRlc3QgSUQuXG5cdCAqL1xuXHRwdWJsaWMgcmVtb3ZlSWZQZWVraW5nRm9yVGVzdCh0ZXN0SWQ6IHN0cmluZykge1xuXHRcdGNvbnN0IGMgPSB0aGlzLnN1YmplY3QuZ2V0KCk7XG5cdFx0aWYgKGMgJiYgYyBpbnN0YW5jZW9mIE1lc3NhZ2VTdWJqZWN0ICYmIGMudGVzdC5leHRJZCA9PT0gdGVzdElkKSB7XG5cdFx0XHR0aGlzLnBlZWsuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSWYgdGhlIHRlc3Qgd2UncmUgY3VycmVudGx5IHNob3dpbmcgaGFzIGl0cyBzdGF0ZSBjaGFuZ2UgdG8gc29tZXRoaW5nXG5cdCAqIGVsc2UsIHRoZW4gY2xlYXIgdGhlIHBlZWsuXG5cdCAqL1xuXHRwcml2YXRlIGNsb3NlUGVla09uVGVzdENoYW5nZShldnQ6IFRlc3RSZXN1bHRJdGVtQ2hhbmdlKSB7XG5cdFx0aWYgKGV2dC5yZWFzb24gIT09IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLk93blN0YXRlQ2hhbmdlIHx8IGV2dC5wcmV2aW91c1N0YXRlID09PSBldnQuaXRlbS5vd25Db21wdXRlZFN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW1vdmVJZlBlZWtpbmdGb3JUZXN0KGV2dC5pdGVtLml0ZW0uZXh0SWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbG9zZVBlZWtPbkNlcnRhaW5SZXN1bHRFdmVudHMoZXZ0OiBSZXN1bHRDaGFuZ2VFdmVudCkge1xuXHRcdGlmICgnc3RhcnRlZCcgaW4gZXZ0KSB7XG5cdFx0XHR0aGlzLnBlZWsuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTsgLy8gY2xvc2UgcGVlayB3aGVuIHJ1bnMgc3RhcnRcblx0XHR9XG5cblx0XHRpZiAoJ3JlbW92ZWQnIGluIGV2dCAmJiB0aGlzLnRlc3RSZXN1bHRzLnJlc3VsdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLnBlZWsuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTsgLy8gY2xvc2UgdGhlIHBlZWsgaWYgcmVzdWx0cyBhcmUgY2xlYXJlZFxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmV0cmlldmVUZXN0KHVyaTogVVJJKTogSW5zcGVjdFN1YmplY3QgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHBhcnRzID0gcGFyc2VUZXN0VXJpKHVyaSk7XG5cdFx0aWYgKCFwYXJ0cykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnRlc3RSZXN1bHRzLnJlc3VsdHMuZmluZChyID0+IHIuaWQgPT09IHBhcnRzLnJlc3VsdElkKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChwYXJ0cy50eXBlID09PSBUZXN0VXJpVHlwZS5UYXNrT3V0cHV0KSB7XG5cdFx0XHRyZXR1cm4gbmV3IFRhc2tTdWJqZWN0KHJlc3VsdCwgcGFydHMudGFza0luZGV4KTtcblx0XHR9XG5cblx0XHRpZiAocGFydHMudHlwZSA9PT0gVGVzdFVyaVR5cGUuVGVzdE91dHB1dCkge1xuXHRcdFx0Y29uc3QgdGVzdCA9IHJlc3VsdC5nZXRTdGF0ZUJ5SWQocGFydHMudGVzdEV4dElkKTtcblx0XHRcdGlmICghdGVzdCkgeyByZXR1cm47IH1cblx0XHRcdHJldHVybiBuZXcgVGVzdE91dHB1dFN1YmplY3QocmVzdWx0LCBwYXJ0cy50YXNrSW5kZXgsIHRlc3QpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgdGVzdEV4dElkLCB0YXNrSW5kZXgsIG1lc3NhZ2VJbmRleCB9ID0gcGFydHM7XG5cdFx0Y29uc3QgdGVzdCA9IHJlc3VsdD8uZ2V0U3RhdGVCeUlkKHRlc3RFeHRJZCk7XG5cdFx0aWYgKCF0ZXN0IHx8ICF0ZXN0LnRhc2tzW3BhcnRzLnRhc2tJbmRleF0pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IE1lc3NhZ2VTdWJqZWN0KHJlc3VsdCwgdGVzdCwgdGFza0luZGV4LCBtZXNzYWdlSW5kZXgpO1xuXHR9XG59XG5cblxuY2xhc3MgVGVzdFJlc3VsdHNQZWVrIGV4dGVuZHMgUGVla1ZpZXdXaWRnZXQge1xuXHRwdWJsaWMgcmVhZG9ubHkgY3VycmVudCA9IG9ic2VydmFibGVWYWx1ZTxJbnNwZWN0U3ViamVjdCB8IHVuZGVmaW5lZD4oJ3Rlc3RQZWVrQ3VycmVudCcsIHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgcmVzaXplT25OZXh0Q29udGVudEhlaWdodFVwZGF0ZSA9IGZhbHNlO1xuXHRwcml2YXRlIGNvbnRlbnQhOiBUZXN0UmVzdWx0c1ZpZXdDb250ZW50O1xuXHRwcml2YXRlIHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlITogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRwcml2YXRlIGRpbWVuc2lvbj86IGRvbS5EaW1lbnNpb247XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVBlZWtWaWV3U2VydmljZSBwZWVrVmlld1NlcnZpY2U6IElQZWVrVmlld1NlcnZpY2UsXG5cdFx0QElUZXN0aW5nUGVla09wZW5lciBwcml2YXRlIHJlYWRvbmx5IHRlc3RpbmdQZWVrOiBJVGVzdGluZ1BlZWtPcGVuZXIsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGVkaXRvciwgeyBzaG93RnJhbWU6IHRydWUsIGZyYW1lV2lkdGg6IDEsIHNob3dBcnJvdzogdHJ1ZSwgaXNSZXNpemVhYmxlOiB0cnVlLCBpc0FjY2Vzc2libGU6IHRydWUsIGNsYXNzTmFtZTogJ3Rlc3Qtb3V0cHV0LXBlZWsnIH0sIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKHRoaXMuYXBwbHlUaGVtZSwgdGhpcykpO1xuXHRcdHBlZWtWaWV3U2VydmljZS5hZGRFeGNsdXNpdmVXaWRnZXQoZWRpdG9yLCB0aGlzKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZ2V0TWF4aW11bUhlaWdodEluTGluZXMoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkZWZhdWx0TWF4SGVpZ2h0ID0gc3VwZXIuX2dldE1heGltdW1IZWlnaHRJbkxpbmVzKCk7XG5cdFx0Y29uc3QgY29udGVudEhlaWdodCA9IHRoaXMuY29udGVudD8uY29udGVudEhlaWdodDtcblx0XHRpZiAoIWNvbnRlbnRIZWlnaHQpIHsgLy8gdW5kZWZpbmVkIG9yIDBcblx0XHRcdHJldHVybiBkZWZhdWx0TWF4SGVpZ2h0O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRlc3RpbmdQZWVrLmhpc3RvcnlWaXNpYmxlLnZhbHVlKSB7IC8vIGRvbid0IGNhcCBoZWlnaHQgd2l0aCB0aGUgaGlzdG9yeSBzcGxpdFxuXHRcdFx0cmV0dXJuIGRlZmF1bHRNYXhIZWlnaHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0Ly8gNDEgaXMgZXhwZXJpbWVudGFsbHkgZGV0ZXJtaW5lZCB0byBiZSB0aGUgb3ZlcmhlYWQgb2YgdGhlIHBlZWsgdmlldyBpdHNlbGZcblx0XHQvLyB0byBhdm9pZCBzaG93aW5nIHNjcm9sbGJhcnMgYnkgZGVmYXVsdCBpbiBpdHMgY29udGVudC5cblx0XHRjb25zdCBiYXNlUGVla092ZXJoZWFkID0gNDE7XG5cblx0XHRyZXR1cm4gTWF0aC5taW4oZGVmYXVsdE1heEhlaWdodCB8fCBJbmZpbml0eSwgKGNvbnRlbnRIZWlnaHQgKyBiYXNlUGVla092ZXJoZWFkKSAvIGxpbmVIZWlnaHQgKyAxKTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlUaGVtZSgpIHtcblx0XHRjb25zdCB0aGVtZSA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5jdXJyZW50LmdldCgpO1xuXHRcdGNvbnN0IGlzRXJyb3IgPSBjdXJyZW50IGluc3RhbmNlb2YgTWVzc2FnZVN1YmplY3QgJiYgY3VycmVudC5tZXNzYWdlLnR5cGUgPT09IFRlc3RNZXNzYWdlVHlwZS5FcnJvcjtcblx0XHRjb25zdCBib3JkZXJDb2xvciA9IChpc0Vycm9yID8gdGhlbWUuZ2V0Q29sb3IodGVzdGluZ1BlZWtCb3JkZXIpIDogdGhlbWUuZ2V0Q29sb3IodGVzdGluZ01lc3NhZ2VQZWVrQm9yZGVyKSkgfHwgQ29sb3IudHJhbnNwYXJlbnQ7XG5cdFx0Y29uc3QgaGVhZGVyQmcgPSAoaXNFcnJvciA/IHRoZW1lLmdldENvbG9yKHRlc3RpbmdQZWVrSGVhZGVyQmFja2dyb3VuZCkgOiB0aGVtZS5nZXRDb2xvcih0ZXN0aW5nUGVla01lc3NhZ2VIZWFkZXJCYWNrZ3JvdW5kKSkgfHwgQ29sb3IudHJhbnNwYXJlbnQ7XG5cdFx0Y29uc3QgZWRpdG9yQmcgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JCYWNrZ3JvdW5kKTtcblx0XHR0aGlzLnN0eWxlKHtcblx0XHRcdGFycm93Q29sb3I6IGJvcmRlckNvbG9yLFxuXHRcdFx0ZnJhbWVDb2xvcjogYm9yZGVyQ29sb3IsXG5cdFx0XHRoZWFkZXJCYWNrZ3JvdW5kQ29sb3I6IGVkaXRvckJnICYmIGhlYWRlckJnID8gaGVhZGVyQmcubWFrZU9wYXF1ZShlZGl0b3JCZykgOiBoZWFkZXJCZyxcblx0XHRcdHByaW1hcnlIZWFkaW5nQ29sb3I6IHRoZW1lLmdldENvbG9yKHBlZWtWaWV3VGl0bGVGb3JlZ3JvdW5kKSxcblx0XHRcdHNlY29uZGFyeUhlYWRpbmdDb2xvcjogdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXdUaXRsZUluZm9Gb3JlZ3JvdW5kKVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9maWxsQ29udGFpbmVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpIHtcblx0XHRcdHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoY29udGFpbmVyKSk7XG5cdFx0XHRUZXN0aW5nQ29udGV4dEtleXMuaXNJblBlZWsuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpLnNldCh0cnVlKTtcblx0XHRcdGNvbnN0IGluc3RhU2VydmljZSA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblx0XHRcdHRoaXMuY29udGVudCA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFJlc3VsdHNWaWV3Q29udGVudCwgdGhpcy5lZGl0b3IsIHsgaGlzdG9yeVZpc2libGU6IHRoaXMudGVzdGluZ1BlZWsuaGlzdG9yeVZpc2libGUsIHNob3dSZXZlYWxMb2NhdGlvbk9uTWVzc2FnZXM6IGZhbHNlLCBsb2NhdGlvbkZvclByb2dyZXNzOiBUZXN0aW5nLlJlc3VsdHNWaWV3SWQgfSkpO1xuXG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZW50Lm9uQ2xvc2UoKCkgPT4ge1xuXHRcdFx0XHRUZXN0aW5nT3V0cHV0UGVla0NvbnRyb2xsZXIuZ2V0KHRoaXMuZWRpdG9yKT8ucmVtb3ZlUGVlaygpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHN1cGVyLl9maWxsQ29udGFpbmVyKGNvbnRhaW5lcik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2ZpbGxIZWFkKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5fZmlsbEhlYWQoY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IG1lbnVDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChjb250YWluZXIpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoYmluZENvbnRleHRLZXkoXG5cdFx0XHRUZXN0aW5nQ29udGV4dEtleXMucGVla0hhc1N0YWNrLFxuXHRcdFx0bWVudUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0cmVhZGVyID0+IGluc3BlY3RTdWJqZWN0SGFzU3RhY2sodGhpcy5jdXJyZW50LnJlYWQocmVhZGVyKSksXG5cdFx0KSk7XG5cblx0XHRjb25zdCBtZW51ID0gdGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5UZXN0UGVla1RpdGxlLCBtZW51Q29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IHRoaXMuX2FjdGlvbmJhcldpZGdldCE7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKG1lbnUub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0YWN0aW9ucy5sZW5ndGggPSAwO1xuXHRcdFx0ZmlsbEluQWN0aW9uQmFyQWN0aW9ucyhtZW51LmdldEFjdGlvbnMoKSwgYWN0aW9ucyk7XG5cdFx0XHR3aGlsZSAoYWN0aW9uQmFyLmdldEFjdGlvbigxKSkge1xuXHRcdFx0XHRhY3Rpb25CYXIucHVsbCgwKTsgLy8gcmVtb3ZlIGFsbCBidXQgdGhlIHZpZXcncyBkZWZhdWx0IFwiY2xvc2VcIiBidXR0b25cblx0XHRcdH1cblx0XHRcdGFjdGlvbkJhci5wdXNoKGFjdGlvbnMsIHsgbGFiZWw6IGZhbHNlLCBpY29uOiB0cnVlLCBpbmRleDogMCB9KTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRmaWxsSW5BY3Rpb25CYXJBY3Rpb25zKG1lbnUuZ2V0QWN0aW9ucygpLCBhY3Rpb25zKTtcblx0XHRhY3Rpb25CYXIucHVzaChhY3Rpb25zLCB7IGxhYmVsOiBmYWxzZSwgaWNvbjogdHJ1ZSwgaW5kZXg6IDAgfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2ZpbGxCb2R5KGNvbnRhaW5lckVsZW1lbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5jb250ZW50LmZpbGxCb2R5KGNvbnRhaW5lckVsZW1lbnQpO1xuXG5cdFx0Ly8gUmVzaXplIG9uIGhlaWdodCB1cGRhdGVzIGZvciBhIHNob3J0IHRpbWUgdG8gYWxsb3cgYW55IGhlaWdodHMgbWFkZVxuXHRcdC8vIGJ5IGVkaXRvciBjb250cmlidXRpb25zIHRvIGNvbWUgaW50byBlZmZlY3QgYmVmb3JlLlxuXHRcdGNvbnN0IGNvbnRlbnRIZWlnaHRTZXR0bGVUaW1lciA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHR0aGlzLnJlc2l6ZU9uTmV4dENvbnRlbnRIZWlnaHRVcGRhdGUgPSBmYWxzZTtcblx0XHR9LCA1MDApKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRlbnQub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KGhlaWdodCA9PiB7XG5cdFx0XHRpZiAoIXRoaXMucmVzaXplT25OZXh0Q29udGVudEhlaWdodFVwZGF0ZSB8fCAhaGVpZ2h0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGlzcGxheWVkID0gdGhpcy5fZ2V0TWF4aW11bUhlaWdodEluTGluZXMoKTtcblx0XHRcdGlmIChkaXNwbGF5ZWQpIHtcblx0XHRcdFx0dGhpcy5fcmVsYXlvdXQoTWF0aC5taW4oZGlzcGxheWVkLCB0aGlzLmdldFZpc2libGVFZGl0b3JMaW5lcygpIC8gMiksIHRydWUpO1xuXHRcdFx0XHRpZiAoIWNvbnRlbnRIZWlnaHRTZXR0bGVUaW1lci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdFx0Y29udGVudEhlaWdodFNldHRsZVRpbWVyLnNjaGVkdWxlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZW50Lm9uRGlkUmVxdWVzdFJldmVhbChzdWIgPT4ge1xuXHRcdFx0VGVzdGluZ091dHB1dFBlZWtDb250cm9sbGVyLmdldCh0aGlzLmVkaXRvcik/LnNob3coc3ViIGluc3RhbmNlb2YgTWVzc2FnZVN1YmplY3Rcblx0XHRcdFx0PyBzdWIubWVzc2FnZVVyaVxuXHRcdFx0XHQ6IHN1Yi5vdXRwdXRVcmkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSB0ZXN0IHRvIGJlIHNob3duLlxuXHQgKi9cblx0cHVibGljIHNldE1vZGVsKHN1YmplY3Q6IEluc3BlY3RTdWJqZWN0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHN1YmplY3QgaW5zdGFuY2VvZiBUYXNrU3ViamVjdCB8fCBzdWJqZWN0IGluc3RhbmNlb2YgVGVzdE91dHB1dFN1YmplY3QpIHtcblx0XHRcdHRoaXMuY3VycmVudC5zZXQoc3ViamVjdCwgdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybiB0aGlzLnNob3dJblBsYWNlKHN1YmplY3QpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5jdXJyZW50O1xuXHRcdGNvbnN0IHJldmVhbExvY2F0aW9uID0gc3ViamVjdC5yZXZlYWxMb2NhdGlvbj8ucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdGlmICghcmV2ZWFsTG9jYXRpb24gJiYgIXByZXZpb3VzKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jdXJyZW50LnNldChzdWJqZWN0LCB1bmRlZmluZWQpO1xuXHRcdGlmICghcmV2ZWFsTG9jYXRpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLnNob3dJblBsYWNlKHN1YmplY3QpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVzaXplT25OZXh0Q29udGVudEhlaWdodFVwZGF0ZSA9IHRydWU7XG5cdFx0dGhpcy5zaG93KHJldmVhbExvY2F0aW9uLCAxMCk7IC8vIDEwIGlzIGp1c3QgYSByYW5kb20gbnVtYmVyLCB3ZSByZXNpemUgb25jZSBjb250ZW50IGlzIGF2YWlsYWJsZVxuXHRcdHRoaXMuZWRpdG9yLnJldmVhbFJhbmdlTmVhclRvcElmT3V0c2lkZVZpZXdwb3J0KFJhbmdlLmZyb21Qb3NpdGlvbnMocmV2ZWFsTG9jYXRpb24pLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cblx0XHRyZXR1cm4gdGhpcy5zaG93SW5QbGFjZShzdWJqZWN0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb2xsYXBzZXMgYWxsIGRpc3BsYXllZCBzdGFjayBmcmFtZXMuXG5cdCAqL1xuXHRwdWJsaWMgY29sbGFwc2VTdGFjaygpIHtcblx0XHR0aGlzLmNvbnRlbnQuY29sbGFwc2VTdGFjaygpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRWaXNpYmxlRWRpdG9yTGluZXMoKSB7XG5cdFx0Ly8gbm90ZSB0aGF0IHdlIGRvbid0IHVzZSB0aGUgdmlldyByYW5nZXMgYmVjYXVzZSB3ZSBkb24ndCB3YW50IHRvIGdldFxuXHRcdC8vIHRocm93biBvZmYgYnkgbGFyZ2Ugd3JhcHBpbmcgbGluZXMuIEJlaW5nIGFwcHJveGltYXRlIGhlcmUgaXMgb2theS5cblx0XHRyZXR1cm4gTWF0aC5yb3VuZCh0aGlzLmVkaXRvci5nZXREb21Ob2RlKCkhLmNsaWVudEhlaWdodCAvIHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNob3dzIGEgbWVzc2FnZSBpbi1wbGFjZSB3aXRob3V0IHNob3dpbmcgb3IgY2hhbmdpbmcgdGhlIHBlZWsgbG9jYXRpb24uXG5cdCAqIFRoaXMgaXMgbW9zdGx5IHVzZWQgaWYgcGVla2luZyBhIG1lc3NhZ2Ugd2l0aG91dCBhIGxvY2F0aW9uLlxuXHQgKi9cblx0cHVibGljIGFzeW5jIHNob3dJblBsYWNlKHN1YmplY3Q6IEluc3BlY3RTdWJqZWN0KSB7XG5cdFx0aWYgKHN1YmplY3QgaW5zdGFuY2VvZiBNZXNzYWdlU3ViamVjdCkge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHN1YmplY3QubWVzc2FnZTtcblx0XHRcdHRoaXMuc2V0VGl0bGUoZmlyc3RMaW5lKHJlbmRlclRlc3RNZXNzYWdlQXNUZXh0KG1lc3NhZ2UubWVzc2FnZSkpLCBzdHJpcEljb25zKHN1YmplY3QudGVzdC5sYWJlbCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNldFRpdGxlKGxvY2FsaXplKCd0ZXN0T3V0cHV0VGl0bGUnLCAnVGVzdCBPdXRwdXQnKSk7XG5cdFx0fVxuXHRcdHRoaXMuYXBwbHlUaGVtZSgpO1xuXHRcdGF3YWl0IHRoaXMuY29udGVudC5yZXZlYWwoeyBzdWJqZWN0LCBwcmVzZXJ2ZUZvY3VzOiBmYWxzZSB9KTtcblx0fVxuXG5cdC8qKiBAb3ZlcnJpZGUgKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9kb0xheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpIHtcblx0XHRzdXBlci5fZG9MYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMuY29udGVudC5vbkxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHQvKiogQG92ZXJyaWRlICovXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb25XaWR0aCh3aWR0aDogbnVtYmVyKSB7XG5cdFx0c3VwZXIuX29uV2lkdGgod2lkdGgpO1xuXHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5kaW1lbnNpb24gPSBuZXcgZG9tLkRpbWVuc2lvbih3aWR0aCwgdGhpcy5kaW1lbnNpb24uaGVpZ2h0KTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRlbnQub25XaWR0aCh3aWR0aCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RSZXN1bHRzVmlldyBleHRlbmRzIFZpZXdQYW5lIHtcblx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50ID0gbmV3IExhenkoKCkgPT4gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0UmVzdWx0c1ZpZXdDb250ZW50LCB1bmRlZmluZWQsIHtcblx0XHRoaXN0b3J5VmlzaWJsZTogc3RhdGljT2JzZXJ2YWJsZVZhbHVlKHRydWUpLFxuXHRcdHNob3dSZXZlYWxMb2NhdGlvbk9uTWVzc2FnZXM6IHRydWUsXG5cdFx0bG9jYXRpb25Gb3JQcm9ncmVzczogVGVzdGluZy5FeHBsb3JlclZpZXdJZCxcblx0fSkpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld1BhbmVPcHRpb25zLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJVGVzdFJlc3VsdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXN1bHRTZXJ2aWNlOiBJVGVzdFJlc3VsdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXHR9XG5cblx0cHVibGljIGdldCBzdWJqZWN0KCkge1xuXHRcdHJldHVybiB0aGlzLmNvbnRlbnQucmF3VmFsdWU/LmN1cnJlbnQ7XG5cdH1cblxuXHRwdWJsaWMgc2hvd0xhdGVzdFJ1bihwcmVzZXJ2ZUZvY3VzID0gZmFsc2UpIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnJlc3VsdFNlcnZpY2UucmVzdWx0cy5maW5kKHIgPT4gci50YXNrcy5sZW5ndGgpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250ZW50LnJhd1ZhbHVlPy5yZXZlYWwoeyBwcmVzZXJ2ZUZvY3VzLCBzdWJqZWN0OiBuZXcgVGFza1N1YmplY3QocmVzdWx0LCAwKSB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cdFx0Ly8gQXZvaWQgcmVuZGVyaW5nIGludG8gdGhlIGJvZHkgdW50aWwgaXQncyBhdHRhY2hlZCB0aGUgRE9NLCBhcyBpdCBjYW5cblx0XHQvLyByZXN1bHQgaW4gcmVuZGVyaW5nIGlzc3VlcyBpbiB0aGUgdGVybWluYWwgKCMxOTQxNTYpXG5cdFx0aWYgKHRoaXMuaXNCb2R5VmlzaWJsZSgpKSB7XG5cdFx0XHR0aGlzLnJlbmRlckNvbnRlbnQoY29udGFpbmVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQub25jZShFdmVudC5maWx0ZXIodGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5LCBCb29sZWFuKSkoKCkgPT4gdGhpcy5yZW5kZXJDb250ZW50KGNvbnRhaW5lcikpKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5jb250ZW50LnJhd1ZhbHVlPy5vbkxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNvbnRlbnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSB0aGlzLmNvbnRlbnQudmFsdWU7XG5cdFx0Y29udGVudC5maWxsQm9keShjb250YWluZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRlbnQub25EaWRSZXF1ZXN0UmV2ZWFsKHN1YmplY3QgPT4gY29udGVudC5yZXZlYWwoeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlLCBzdWJqZWN0IH0pKSk7XG5cblx0XHRjb25zdCBbbGFzdFJlc3VsdF0gPSB0aGlzLnJlc3VsdFNlcnZpY2UucmVzdWx0cztcblx0XHRpZiAobGFzdFJlc3VsdCAmJiBsYXN0UmVzdWx0LnRhc2tzLmxlbmd0aCkge1xuXHRcdFx0Y29udGVudC5yZXZlYWwoeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlLCBzdWJqZWN0OiBuZXcgVGFza1N1YmplY3QobGFzdFJlc3VsdCwgMCkgfSk7XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IGZpcnN0TGluZSA9IChzdHI6IHN0cmluZykgPT4ge1xuXHRjb25zdCBpbmRleCA9IHN0ci5pbmRleE9mKCdcXG4nKTtcblx0cmV0dXJuIGluZGV4ID09PSAtMSA/IHN0ciA6IHN0ci5zbGljZSgwLCBpbmRleCk7XG59O1xuXG5mdW5jdGlvbiBnZXRPdXRlckVkaXRvckZyb21EaWZmRWRpdG9yKGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UpOiBJQ29kZUVkaXRvciB8IG51bGwge1xuXHRjb25zdCBkaWZmRWRpdG9ycyA9IGNvZGVFZGl0b3JTZXJ2aWNlLmxpc3REaWZmRWRpdG9ycygpO1xuXG5cdGZvciAoY29uc3QgZGlmZkVkaXRvciBvZiBkaWZmRWRpdG9ycykge1xuXHRcdGlmIChkaWZmRWRpdG9yLmhhc1RleHRGb2N1cygpICYmIGRpZmZFZGl0b3IgaW5zdGFuY2VvZiBFbWJlZGRlZERpZmZFZGl0b3JXaWRnZXQpIHtcblx0XHRcdHJldHVybiBkaWZmRWRpdG9yLmdldFBhcmVudEVkaXRvcigpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgY2xhc3MgQ2xvc2VUZXN0UGVlayBleHRlbmRzIEVkaXRvckFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5jbG9zZVRlc3RQZWVrJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Nsb3NlJywgJ0Nsb3NlJyksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNsb3NlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihUZXN0aW5nQ29udGV4dEtleXMuaXNJblBlZWssIFRlc3RpbmdDb250ZXh0S2V5cy5pc1BlZWtWaXNpYmxlKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgLSAxMDEsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5ub3QoJ2NvbmZpZy5lZGl0b3Iuc3RhYmxlUGVlaycpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgcGFyZW50ID0gZ2V0UGVla2VkRWRpdG9yRnJvbUZvY3VzKGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpKTtcblx0XHRUZXN0aW5nT3V0cHV0UGVla0NvbnRyb2xsZXIuZ2V0KHBhcmVudCA/PyBlZGl0b3IpPy5yZW1vdmVQZWVrKCk7XG5cdH1cbn1cblxuXG5jb25zdCBuYXZXaGVuID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0VGVzdGluZ0NvbnRleHRLZXlzLmlzUGVla1Zpc2libGUsXG4pO1xuXG4vKipcbiAqIEdldHMgdGhlIGFwcHJvcHJpYXRlIGVkaXRvciBmb3IgcGVla2luZyBiYXNlZCBvbiB0aGUgY3VycmVudGx5IGZvY3VzZWQgZWRpdG9yLlxuICovXG5jb25zdCBnZXRQZWVrZWRFZGl0b3JGcm9tRm9jdXMgPSAoY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSkgPT4ge1xuXHRjb25zdCBlZGl0b3IgPSBjb2RlRWRpdG9yU2VydmljZS5nZXRGb2N1c2VkQ29kZUVkaXRvcigpIHx8IGNvZGVFZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKTtcblx0cmV0dXJuIGVkaXRvciAmJiBnZXRQZWVrZWRFZGl0b3IoY29kZUVkaXRvclNlcnZpY2UsIGVkaXRvcik7XG59O1xuXG4vKipcbiAqIEdldHMgdGhlIGVkaXRvciB3aGVyZSB0aGUgcGVlayBtYXkgYmUgc2hvd24sIGJ1YmJsaW5nIHVwd2FyZHMgaWYgdGhlIGdpdmVuXG4gKiBlZGl0b3IgaXMgZW1iZWRkZWQgKGkuZS4gaW5zaWRlIGEgcGVlayBhbHJlYWR5KS5cbiAqL1xuY29uc3QgZ2V0UGVla2VkRWRpdG9yID0gKGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsIGVkaXRvcjogSUNvZGVFZGl0b3IpID0+IHtcblx0aWYgKFRlc3RpbmdPdXRwdXRQZWVrQ29udHJvbGxlci5nZXQoZWRpdG9yKT8uc3ViamVjdC5nZXQoKSkge1xuXHRcdHJldHVybiBlZGl0b3I7XG5cdH1cblxuXHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0KSB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRQYXJlbnRFZGl0b3IoKTtcblx0fVxuXG5cdGNvbnN0IG91dGVyID0gZ2V0T3V0ZXJFZGl0b3JGcm9tRGlmZkVkaXRvcihjb2RlRWRpdG9yU2VydmljZSk7XG5cdGlmIChvdXRlcikge1xuXHRcdHJldHVybiBvdXRlcjtcblx0fVxuXG5cdHJldHVybiBlZGl0b3I7XG59O1xuXG5leHBvcnQgY2xhc3MgR29Ub05leHRNZXNzYWdlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAndGVzdGluZy5nb1RvTmV4dE1lc3NhZ2UnO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogR29Ub05leHRNZXNzYWdlQWN0aW9uLklELFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLmdvVG9OZXh0TWVzc2FnZScsICdHbyB0byBOZXh0IFRlc3QgRmFpbHVyZScpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMigndGVzdGluZy5nb1RvTmV4dE1lc3NhZ2UuZGVzY3JpcHRpb24nLCAnU2hvd3MgdGhlIG5leHQgZmFpbHVyZSBtZXNzYWdlIGluIHlvdXIgZmlsZScpXG5cdFx0XHR9LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hcnJvd0Rvd24sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5UZXN0LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GOCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyAxLFxuXHRcdFx0XHR3aGVuOiBuYXZXaGVuLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVzdFBlZWtUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IG5hdldoZW5cblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGVkaXRvciA9IGdldFBlZWtlZEVkaXRvckZyb21Gb2N1cyhhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKSk7XG5cdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0VGVzdGluZ091dHB1dFBlZWtDb250cm9sbGVyLmdldChlZGl0b3IpPy5uZXh0KCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBHb1RvUHJldmlvdXNNZXNzYWdlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAndGVzdGluZy5nb1RvUHJldmlvdXNNZXNzYWdlJztcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEdvVG9QcmV2aW91c01lc3NhZ2VBY3Rpb24uSUQsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuZ29Ub1ByZXZpb3VzTWVzc2FnZScsICdHbyB0byBQcmV2aW91cyBUZXN0IEZhaWx1cmUnKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuZ29Ub1ByZXZpb3VzTWVzc2FnZS5kZXNjcmlwdGlvbicsICdTaG93cyB0aGUgcHJldmlvdXMgZmFpbHVyZSBtZXNzYWdlIGluIHlvdXIgZmlsZScpXG5cdFx0XHR9LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hcnJvd1VwLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVGVzdCxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuRjgsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgMSxcblx0XHRcdFx0d2hlbjogbmF2V2hlblxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGVzdFBlZWtUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IG5hdldoZW5cblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGVkaXRvciA9IGdldFBlZWtlZEVkaXRvckZyb21Gb2N1cyhhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKSk7XG5cdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0VGVzdGluZ091dHB1dFBlZWtDb250cm9sbGVyLmdldChlZGl0b3IpPy5wcmV2aW91cygpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29sbGFwc2VQZWVrU3RhY2sgZXh0ZW5kcyBBY3Rpb24yIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICd0ZXN0aW5nLmNvbGxhcHNlUGVla1N0YWNrJztcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbGxhcHNlUGVla1N0YWNrLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5jb2xsYXBzZVBlZWtTdGFjaycsICdDb2xsYXBzZSBTdGFjayBGcmFtZXMnKSxcblx0XHRcdGljb246IENvZGljb24uY29sbGFwc2VBbGwsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5UZXN0LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXN0UGVla1RpdGxlLFxuXHRcdFx0XHR3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMucGVla0hhc1N0YWNrLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGVkaXRvciA9IGdldFBlZWtlZEVkaXRvckZyb21Gb2N1cyhhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKSk7XG5cdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0VGVzdGluZ091dHB1dFBlZWtDb250cm9sbGVyLmdldChlZGl0b3IpPy5jb2xsYXBzZVN0YWNrKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuTWVzc2FnZUluRWRpdG9yQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAndGVzdGluZy5vcGVuTWVzc2FnZUluRWRpdG9yJztcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5NZXNzYWdlSW5FZGl0b3JBY3Rpb24uSUQsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLm9wZW5NZXNzYWdlSW5FZGl0b3InLCAnT3BlbiBpbiBFZGl0b3InKSxcblx0XHRcdGljb246IENvZGljb24uZ29Ub0ZpbGUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5UZXN0LFxuXHRcdFx0bWVudTogW3sgaWQ6IE1lbnVJZC5UZXN0UGVla1RpdGxlIH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGFjY2Vzc29yLmdldChJVGVzdGluZ1BlZWtPcGVuZXIpLm9wZW5DdXJyZW50SW5FZGl0b3IoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVG9nZ2xlVGVzdGluZ1BlZWtIaXN0b3J5IGV4dGVuZHMgQWN0aW9uMiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAndGVzdGluZy50b2dnbGVUZXN0aW5nUGVla0hpc3RvcnknO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVG9nZ2xlVGVzdGluZ1BlZWtIaXN0b3J5LklELFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLnRvZ2dsZVRlc3RpbmdQZWVrSGlzdG9yeScsICdUb2dnbGUgVGVzdCBIaXN0b3J5IGluIFBlZWsnKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcudG9nZ2xlVGVzdGluZ1BlZWtIaXN0b3J5LmRlc2NyaXB0aW9uJywgJ1Nob3dzIG9yIGhpZGVzIHRoZSBoaXN0b3J5IG9mIHRlc3QgcnVucyBpbiB0aGUgcGVlayB2aWV3Jylcblx0XHRcdH0sXG5cdFx0XHRpY29uOiBDb2RpY29uLmhpc3RvcnksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5UZXN0LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5UZXN0UGVla1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdH1dLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5SCxcblx0XHRcdFx0d2hlbjogVGVzdGluZ0NvbnRleHRLZXlzLmlzUGVla1Zpc2libGUuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBvcGVuZXIgPSBhY2Nlc3Nvci5nZXQoSVRlc3RpbmdQZWVrT3BlbmVyKTtcblx0XHRvcGVuZXIuaGlzdG9yeVZpc2libGUudmFsdWUgPSAhb3BlbmVyLmhpc3RvcnlWaXNpYmxlLnZhbHVlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGFBQWE7QUFFdEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUywyQkFBMkIsdUJBQXVCO0FBRXBFLFNBQXNCLG9CQUFvQjtBQUMxQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLGFBQWE7QUFDdEIsU0FBdUMsa0JBQWtCO0FBQ3pELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCLGdCQUFnQix5QkFBeUIsbUNBQW1DO0FBQ3ZHLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxTQUFTLGNBQWMsY0FBYztBQUM5QyxTQUFTLHVCQUF1QjtBQUNo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O0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRWdCLElBQUksVUFBNEI7QUFDL0MsVUFBTSxTQUFTLHlCQUF5QixTQUFTLElBQUksa0JBQWtCLENBQUM7QUFDeEUsUUFBSSxRQUFRO0FBQ1gsa0NBQTRCLElBQUksTUFBTSxHQUFHLGNBQWM7QUFBQSxJQUN4RDtBQUFBLEVBQ0Q7QUFDRDtBQXZCYSxtQkFDVyxLQUFLO0FBRHRCLElBQU0sb0JBQU47QUF5QkEsTUFBTSw2QkFBTixNQUFNLG1DQUFrQyxRQUFRO0FBQUEsRUFFdEQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUksMkJBQTBCO0FBQUEsTUFDOUIsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLCtCQUErQixnQkFBZ0I7QUFBQSxNQUNoRSxNQUFNLFFBQVE7QUFBQSxNQUNkLFVBQVUsV0FBVztBQUFBLE1BQ3JCLE1BQU0sQ0FBQyxFQUFFLElBQUksT0FBTyxjQUFjLENBQUM7QUFBQSxJQUNwQyxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRWdCLElBQUksVUFBNEI7QUFDL0MsYUFBUyxJQUFJLGtCQUFrQixFQUFFLG9CQUFvQjtBQUFBLEVBQ3REO0FBQ0Q7QUFoQmEsMkJBQ1csS0FBSztBQUR0QixJQUFNLDRCQUFOO0FBa0JBLE1BQU0sNEJBQU4sTUFBTSxrQ0FBaUMsUUFBUTtBQUFBLEVBRXJELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJLDBCQUF5QjtBQUFBLE1BQzdCLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxvQ0FBb0MsNkJBQTZCO0FBQUEsTUFDbEYsVUFBVTtBQUFBLFFBQ1QsYUFBYSxVQUFVLGdEQUFnRCwwREFBMEQ7QUFBQSxNQUNsSTtBQUFBLE1BQ0EsTUFBTSxRQUFRO0FBQUEsTUFDZCxVQUFVLFdBQVc7QUFBQSxNQUNyQixNQUFNLENBQUM7QUFBQSxRQUNOLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLE1BQ0QsWUFBWTtBQUFBLFFBQ1gsUUFBUSxpQkFBaUI7QUFBQSxRQUN6QixTQUFTLE9BQU8sTUFBTSxRQUFRO0FBQUEsUUFDOUIsTUFBTSxtQkFBbUIsY0FBYyxVQUFVLElBQUk7QUFBQSxNQUN0RDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVnQixJQUFJLFVBQTRCO0FBQy9DLFVBQU0sU0FBUyxTQUFTLElBQUksa0JBQWtCO0FBQzlDLFdBQU8sZUFBZSxRQUFRLENBQUMsT0FBTyxlQUFlO0FBQUEsRUFDdEQ7QUFDRDtBQTdCYSwwQkFDVyxLQUFLO0FBRHRCLElBQU0sMkJBQU47IiwKICAibmFtZXMiOiBbInRlc3QiXQp9Cg==
