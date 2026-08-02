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
import * as domStylesheetsJs from "../../../../base/browser/domStylesheets.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from "../../../../base/browser/ui/mouseCursor/mouseCursor.js";
import { RunOnceScheduler, timeout } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { memoize } from "../../../../base/common/decorators.js";
import { Emitter } from "../../../../base/common/event.js";
import { HistoryNavigator } from "../../../../base/common/history.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { removeAnsiEscapeCodes } from "../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI as uri } from "../../../../base/common/uri.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { EditorAction, registerEditorAction } from "../../../../editor/browser/editorExtensions.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../../../../editor/common/config/fontInfo.js";
import { Range } from "../../../../editor/common/core/range.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { CompletionItemInsertTextRule, CompletionItemKind, CompletionItemKinds } from "../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITextResourcePropertiesService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { localize, localize2 } from "../../../../nls.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { getFlatContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { registerAndCreateHistoryNavigationContext } from "../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { editorForeground, resolveColorValue } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { registerNavigableContainer } from "../../../browser/actions/widgetNavigationCommands.js";
import { FilterViewPane, ViewAction } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from "../../codeEditor/browser/simpleEditorOptions.js";
import { CONTEXT_DEBUG_STATE, CONTEXT_IN_DEBUG_REPL, CONTEXT_MULTI_SESSION_REPL, DEBUG_SCHEME, IDebugService, REPL_VIEW_ID, State, getStateLabel } from "../common/debug.js";
import { Variable } from "../common/debugModel.js";
import { resolveChildSession } from "../common/debugUtils.js";
import { ReplEvaluationResult, ReplGroup } from "../common/replModel.js";
import { FocusSessionActionViewItem } from "./debugActionViewItems.js";
import { DEBUG_COMMAND_CATEGORY, FOCUS_REPL_ID } from "./debugCommands.js";
import { DebugExpressionRenderer } from "./debugExpressionRenderer.js";
import { debugConsoleClearAll, debugConsoleEvaluationPrompt } from "./debugIcons.js";
import "./media/repl.css";
import { ReplFilter } from "./replFilter.js";
import { ReplAccessibilityProvider, ReplDataSource, ReplDelegate, ReplEvaluationInputsRenderer, ReplEvaluationResultsRenderer, ReplGroupRenderer, ReplOutputElementRenderer, ReplRawObjectsRenderer, ReplVariablesRenderer } from "./replViewer.js";
const $ = dom.$;
const HISTORY_STORAGE_KEY = "debug.repl.history";
const FILTER_HISTORY_STORAGE_KEY = "debug.repl.filterHistory";
const FILTER_VALUE_STORAGE_KEY = "debug.repl.filterValue";
const DECORATION_KEY = "replinputdecoration";
function revealLastElement(tree) {
  tree.scrollTop = tree.scrollHeight - tree.renderHeight;
}
const sessionsToIgnore = /* @__PURE__ */ new Set();
const identityProvider = { getId: (element) => element.getId() };
let Repl = class extends FilterViewPane {
  constructor(options, debugService, instantiationService, storageService, themeService, modelService, contextKeyService, codeEditorService, viewDescriptorService, contextMenuService, configurationService, textResourcePropertiesService, editorService, keybindingService, openerService, hoverService, menuService, languageFeaturesService, logService) {
    const filterText = storageService.get(FILTER_VALUE_STORAGE_KEY, StorageScope.WORKSPACE, "");
    super({
      ...options,
      filterOptions: {
        placeholder: localize({ key: "workbench.debug.filter.placeholder", comment: ["Text in the brackets after e.g. is not localizable"] }, "Filter (e.g. text, !exclude, \\escape)"),
        text: filterText,
        history: JSON.parse(storageService.get(FILTER_HISTORY_STORAGE_KEY, StorageScope.WORKSPACE, "[]"))
      }
    }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.debugService = debugService;
    this.storageService = storageService;
    this.modelService = modelService;
    this.configurationService = configurationService;
    this.textResourcePropertiesService = textResourcePropertiesService;
    this.editorService = editorService;
    this.keybindingService = keybindingService;
    this.languageFeaturesService = languageFeaturesService;
    this.logService = logService;
    this.previousTreeScrollHeight = 0;
    this.styleChangedWhenInvisible = false;
    this.modelChangeListener = Disposable.None;
    this.findIsOpen = false;
    this.menu = menuService.createMenu(MenuId.DebugConsoleContext, contextKeyService);
    this._register(this.menu);
    this.history = this._register(new HistoryNavigator(new Set(JSON.parse(this.storageService.get(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE, "[]"))), 100));
    this.filter = new ReplFilter();
    this.filter.filterQuery = filterText;
    this.multiSessionRepl = CONTEXT_MULTI_SESSION_REPL.bindTo(contextKeyService);
    this.replOptions = this._register(this.instantiationService.createInstance(ReplOptions, this.id, () => this.getLocationBasedColors().background));
    this._register(this.replOptions.onDidChange(() => this.onDidStyleChange()));
    this._register(codeEditorService.registerDecorationType("repl-decoration", DECORATION_KEY, {}));
    this.multiSessionRepl.set(this.isMultiSessionView);
    this.registerListeners();
  }
  registerListeners() {
    if (this.debugService.getViewModel().focusedSession) {
      this.onDidFocusSession(this.debugService.getViewModel().focusedSession);
    }
    this._register(this.debugService.getViewModel().onDidFocusSession((session) => {
      this.onDidFocusSession(session);
    }));
    this._register(this.debugService.getViewModel().onDidEvaluateLazyExpression(async (e) => {
      if (e instanceof Variable && this.tree?.hasNode(e)) {
        await this.tree.updateChildren(e, false, true);
        await this.tree.expand(e);
      }
    }));
    this._register(this.debugService.onWillNewSession(async (newSession) => {
      const input = this.tree?.getInput();
      if (!input || input.state === State.Inactive) {
        await this.selectSession(newSession);
      }
      this.multiSessionRepl.set(this.isMultiSessionView);
    }));
    this._register(this.debugService.onDidEndSession(async () => {
      await Promise.resolve();
      this.multiSessionRepl.set(this.isMultiSessionView);
    }));
    this._register(this.themeService.onDidColorThemeChange(() => {
      this.refreshReplElements(false);
      if (this.isVisible()) {
        this.updateInputDecoration();
      }
    }));
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (!visible) {
        return;
      }
      if (!this.model) {
        this.model = this.modelService.getModel(Repl.URI) || this.modelService.createModel("", null, Repl.URI, true);
      }
      const focusedSession = this.debugService.getViewModel().focusedSession;
      if (this.tree && this.tree.getInput() !== focusedSession) {
        this.onDidFocusSession(focusedSession);
      }
      this.setMode();
      this.replInput.setModel(this.model);
      this.updateInputDecoration();
      this.refreshReplElements(true);
      if (this.styleChangedWhenInvisible) {
        this.styleChangedWhenInvisible = false;
        if (this.tree?.getInput()) {
          this.tree.updateChildren(void 0, true, false);
        }
        this.onDidStyleChange();
      }
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("debug.console.wordWrap") && this.tree) {
        this.tree.dispose();
        this.treeContainer.innerText = "";
        dom.clearNode(this.treeContainer);
        this.createReplTree();
      }
      if (e.affectsConfiguration("debug.console.acceptSuggestionOnEnter")) {
        const config = this.configurationService.getValue("debug");
        this.replInput.updateOptions({
          acceptSuggestionOnEnter: config.console.acceptSuggestionOnEnter === "on" ? "on" : "off"
        });
      }
    }));
    this._register(this.editorService.onDidActiveEditorChange(() => {
      this.setMode();
    }));
    this._register(this.filterWidget.onDidChangeFilterText(() => {
      this.filter.filterQuery = this.filterWidget.getFilterText();
      if (this.tree) {
        this.tree.refilter();
        revealLastElement(this.tree);
      }
    }));
  }
  async onDidFocusSession(session) {
    if (session) {
      sessionsToIgnore.delete(session);
      this.completionItemProvider?.dispose();
      if (session.capabilities.supportsCompletionsRequest) {
        this.completionItemProvider = this.languageFeaturesService.completionProvider.register({ scheme: DEBUG_SCHEME, pattern: "**/replinput", hasAccessToAllModels: true }, {
          _debugDisplayName: "debugConsole",
          triggerCharacters: session.capabilities.completionTriggerCharacters || ["."],
          provideCompletionItems: async (_, position, _context, token) => {
            this.setHistoryNavigationEnablement(false);
            const model = this.replInput.getModel();
            if (model) {
              const text = model.getValue();
              const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
              const frameId = focusedStackFrame ? focusedStackFrame.frameId : void 0;
              const response = await session.completions(frameId, focusedStackFrame?.thread.threadId || 0, text, position, token);
              const suggestions = [];
              const computeRange = (length) => Range.fromPositions(position.delta(0, -length), position);
              if (response && response.body && response.body.targets) {
                response.body.targets.forEach((item) => {
                  if (item && item.label) {
                    let insertTextRules = void 0;
                    let insertText = item.text || item.label;
                    if (typeof item.selectionStart === "number") {
                      insertTextRules = CompletionItemInsertTextRule.InsertAsSnippet;
                      const selectionLength = typeof item.selectionLength === "number" ? item.selectionLength : 0;
                      const placeholder = selectionLength > 0 ? "${1:" + insertText.substring(item.selectionStart, item.selectionStart + selectionLength) + "}$0" : "$0";
                      insertText = insertText.substring(0, item.selectionStart) + placeholder + insertText.substring(item.selectionStart + selectionLength);
                    }
                    const label = item.detail ? { label: item.label, description: item.detail } : item.label;
                    suggestions.push({
                      label,
                      insertText,
                      kind: CompletionItemKinds.fromString(item.type || "property"),
                      filterText: item.start && item.length ? text.substring(item.start, item.start + item.length).concat(item.label) : void 0,
                      range: computeRange(item.length || 0),
                      sortText: item.sortText,
                      insertTextRules
                    });
                  }
                });
              }
              if (this.configurationService.getValue("debug").console.historySuggestions) {
                const history = this.history.getHistory();
                const idxLength = String(history.length).length;
                history.forEach((h, i) => suggestions.push({
                  label: h,
                  insertText: h,
                  kind: CompletionItemKind.Text,
                  range: computeRange(h.length),
                  sortText: "ZZZ" + String(history.length - i).padStart(idxLength, "0")
                }));
              }
              return { suggestions };
            }
            return Promise.resolve({ suggestions: [] });
          }
        });
      }
    }
    await this.selectSession();
  }
  getFilterStats() {
    return {
      total: this.tree?.getNode().children.length ?? 0,
      filtered: this.tree?.getNode().children.filter((c) => c.visible).length ?? 0
    };
  }
  get isReadonly() {
    const session = this.tree?.getInput();
    if (session && session.state !== State.Inactive) {
      return false;
    }
    return true;
  }
  showPreviousValue() {
    if (!this.isReadonly) {
      this.navigateHistory(true);
    }
  }
  showNextValue() {
    if (!this.isReadonly) {
      this.navigateHistory(false);
    }
  }
  focusFilter() {
    this.filterWidget.focus();
  }
  openFind() {
    this.tree?.openFind();
  }
  setMode() {
    if (!this.isVisible()) {
      return;
    }
    const activeEditorControl = this.editorService.activeTextEditorControl;
    if (isCodeEditor(activeEditorControl)) {
      this.modelChangeListener.dispose();
      this.modelChangeListener = activeEditorControl.onDidChangeModelLanguage(() => this.setMode());
      if (this.model && activeEditorControl.hasModel()) {
        this.model.setLanguage(activeEditorControl.getModel().getLanguageId());
      }
    }
  }
  onDidStyleChange() {
    if (!this.isVisible()) {
      this.styleChangedWhenInvisible = true;
      return;
    }
    if (this.styleElement) {
      this.replInput.updateOptions({
        fontSize: this.replOptions.replConfiguration.fontSize,
        lineHeight: this.replOptions.replConfiguration.lineHeight,
        fontFamily: this.replOptions.replConfiguration.fontFamily === "default" ? EDITOR_FONT_DEFAULTS.fontFamily : this.replOptions.replConfiguration.fontFamily
      });
      const replInputLineHeight = this.replInput.getOption(EditorOption.lineHeight);
      this.styleElement.textContent = `
				.repl .repl-input-wrapper .repl-input-chevron {
					line-height: ${replInputLineHeight}px
				}

				.repl .repl-input-wrapper .monaco-editor .lines-content {
					background-color: ${this.replOptions.replConfiguration.backgroundColor};
				}
			`;
      const cssFontFamily = this.replOptions.replConfiguration.fontFamily === "default" ? "var(--monaco-monospace-font)" : this.replOptions.replConfiguration.fontFamily;
      this.container.style.setProperty(`--vscode-repl-font-family`, cssFontFamily);
      this.container.style.setProperty(`--vscode-repl-font-size`, `${this.replOptions.replConfiguration.fontSize}px`);
      this.container.style.setProperty(`--vscode-repl-font-size-for-twistie`, `${this.replOptions.replConfiguration.fontSizeForTwistie}px`);
      this.container.style.setProperty(`--vscode-repl-line-height`, this.replOptions.replConfiguration.cssLineHeight);
      this.tree?.rerender();
      if (this.bodyContentDimension) {
        this.layoutBodyContent(this.bodyContentDimension.height, this.bodyContentDimension.width);
      }
    }
  }
  navigateHistory(previous) {
    const historyInput = (previous ? this.history.previous() ?? this.history.first() : this.history.next()) ?? "";
    this.replInput.setValue(historyInput);
    aria.status(historyInput);
    this.replInput.setPosition({ lineNumber: 1, column: historyInput.length + 1 });
    this.setHistoryNavigationEnablement(true);
  }
  async selectSession(session) {
    const treeInput = this.tree?.getInput();
    if (!session) {
      const focusedSession = this.debugService.getViewModel().focusedSession;
      if (focusedSession) {
        session = focusedSession;
      } else if (!treeInput || sessionsToIgnore.has(treeInput)) {
        session = this.debugService.getModel().getSessions(true).find((s) => !sessionsToIgnore.has(s));
      }
    }
    if (session) {
      this.replElementsChangeListener?.dispose();
      this.replElementsChangeListener = session.onDidChangeReplElements(() => {
        this.refreshReplElements(session.getReplElements().length === 0);
      });
      if (this.tree && treeInput !== session) {
        try {
          await this.tree.setInput(session);
        } catch (err) {
          this.logService.error(err);
        }
        revealLastElement(this.tree);
      }
    }
    this.replInput?.updateOptions({ readOnly: this.isReadonly });
    this.updateInputDecoration();
  }
  async clearRepl() {
    const session = this.tree?.getInput();
    if (session) {
      session.removeReplExpressions();
      if (session.state === State.Inactive) {
        sessionsToIgnore.add(session);
        await this.selectSession();
        this.multiSessionRepl.set(this.isMultiSessionView);
      }
    }
    this.replInput.focus();
  }
  acceptReplInput() {
    const session = this.tree?.getInput();
    if (session && !this.isReadonly) {
      session.addReplExpression(this.debugService.getViewModel().focusedStackFrame, this.replInput.getValue());
      revealLastElement(this.tree);
      this.history.add(this.replInput.getValue());
      this.replInput.setValue("");
      if (this.bodyContentDimension) {
        this.layoutBodyContent(this.bodyContentDimension.height, this.bodyContentDimension.width);
      }
    }
  }
  sendReplInput(input) {
    const session = this.tree?.getInput();
    if (session && !this.isReadonly) {
      session.addReplExpression(this.debugService.getViewModel().focusedStackFrame, input);
      revealLastElement(this.tree);
      this.history.add(input);
    }
  }
  getVisibleContent() {
    let text = "";
    if (this.model && this.tree) {
      const lineDelimiter = this.textResourcePropertiesService.getEOL(this.model.uri);
      const traverseAndAppend = (node) => {
        node.children.forEach((child) => {
          if (child.visible) {
            text += child.element.toString().trimRight() + lineDelimiter;
            if (!child.collapsed && child.children.length) {
              traverseAndAppend(child);
            }
          }
        });
      };
      traverseAndAppend(this.tree.getNode());
    }
    return removeAnsiEscapeCodes(text);
  }
  layoutBodyContent(height, width) {
    this.bodyContentDimension = new dom.Dimension(width, height);
    const replInputHeight = Math.min(this.replInput.getContentHeight(), height);
    if (this.tree) {
      const lastElementVisible = this.tree.scrollTop + this.tree.renderHeight >= this.tree.scrollHeight;
      const treeHeight = height - replInputHeight;
      this.tree.getHTMLElement().style.height = `${treeHeight}px`;
      this.tree.layout(treeHeight, width);
      if (lastElementVisible) {
        revealLastElement(this.tree);
      }
    }
    this.replInputContainer.style.height = `${replInputHeight}px`;
    this.replInput.layout({ width: width - 30, height: replInputHeight });
  }
  collapseAll() {
    this.tree?.collapseAll();
  }
  getDebugSession() {
    return this.tree?.getInput();
  }
  getReplInput() {
    return this.replInput;
  }
  getReplDataSource() {
    return this.replDataSource;
  }
  getFocusedElement() {
    return this.tree?.getFocus()?.[0];
  }
  focusTree() {
    this.tree?.domFocus();
  }
  async focus() {
    super.focus();
    await timeout(0);
    this.replInput.focus();
  }
  createActionViewItem(action) {
    if (action.id === selectReplCommandId) {
      const session = (this.tree ? this.tree.getInput() : void 0) ?? this.debugService.getViewModel().focusedSession;
      return this.instantiationService.createInstance(SelectReplActionViewItem, action, session);
    }
    return super.createActionViewItem(action);
  }
  get isMultiSessionView() {
    return this.debugService.getModel().getSessions(true).filter((s) => s.hasSeparateRepl() && !sessionsToIgnore.has(s)).length > 1;
  }
  get refreshScheduler() {
    const autoExpanded = /* @__PURE__ */ new Set();
    return new RunOnceScheduler(async () => {
      if (!this.tree || !this.tree.getInput() || !this.isVisible()) {
        return;
      }
      await this.tree.updateChildren(void 0, true, false, { diffIdentityProvider: identityProvider });
      const session = this.tree.getInput();
      if (session) {
        const autoExpandElements = async (elements) => {
          for (const element of elements) {
            if (element instanceof ReplGroup) {
              if (element.autoExpand && !autoExpanded.has(element.getId())) {
                autoExpanded.add(element.getId());
                await this.tree.expand(element);
              }
              if (!this.tree.isCollapsed(element)) {
                await autoExpandElements(element.getChildren());
              }
            }
          }
        };
        await autoExpandElements(session.getReplElements());
      }
      const { total, filtered } = this.getFilterStats();
      this.filterWidget.updateBadge(total === filtered || total === 0 ? void 0 : localize("showing filtered repl lines", "Showing {0} of {1}", filtered, total));
    }, Repl.REFRESH_DELAY);
  }
  // --- Creation
  render() {
    super.render();
    this._register(registerNavigableContainer({
      name: "repl",
      focusNotifiers: [this, this.filterWidget],
      focusNextWidget: () => {
        const element = this.tree?.getHTMLElement();
        if (this.filterWidget.hasFocus()) {
          this.tree?.domFocus();
        } else if (element && dom.isActiveElement(element)) {
          this.focus();
        }
      },
      focusPreviousWidget: () => {
        const element = this.tree?.getHTMLElement();
        if (this.replInput.hasTextFocus()) {
          this.tree?.domFocus();
        } else if (element && dom.isActiveElement(element)) {
          this.focusFilter();
        }
      }
    }));
  }
  renderBody(parent) {
    super.renderBody(parent);
    this.container = dom.append(parent, $(".repl"));
    this.treeContainer = dom.append(this.container, $(`.repl-tree.${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`));
    this.createReplInput(this.container);
    this.createReplTree();
  }
  createReplTree() {
    this.replDelegate = new ReplDelegate(this.configurationService, this.replOptions);
    const wordWrap = this.configurationService.getValue("debug").console.wordWrap;
    this.treeContainer.classList.toggle("word-wrap", wordWrap);
    const expressionRenderer = this.instantiationService.createInstance(DebugExpressionRenderer);
    this.replDataSource = new ReplDataSource();
    const tree = this.tree = this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "DebugRepl",
      this.treeContainer,
      this.replDelegate,
      [
        this.instantiationService.createInstance(ReplVariablesRenderer, expressionRenderer),
        this.instantiationService.createInstance(ReplOutputElementRenderer, expressionRenderer),
        new ReplEvaluationInputsRenderer(),
        this.instantiationService.createInstance(ReplGroupRenderer, expressionRenderer),
        new ReplEvaluationResultsRenderer(expressionRenderer),
        new ReplRawObjectsRenderer(expressionRenderer)
      ],
      this.replDataSource,
      {
        filter: this.filter,
        accessibilityProvider: new ReplAccessibilityProvider(),
        identityProvider,
        userSelection: true,
        mouseSupport: false,
        findWidgetEnabled: true,
        keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e) => e.toString(true) },
        horizontalScrolling: !wordWrap,
        setRowLineHeight: false,
        supportDynamicHeights: wordWrap,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles
      }
    );
    this._register(tree.onDidChangeContentHeight(() => {
      if (tree.scrollHeight !== this.previousTreeScrollHeight) {
        const lastElementWasVisible = tree.scrollTop + tree.renderHeight >= this.previousTreeScrollHeight - 2;
        if (lastElementWasVisible) {
          setTimeout(() => {
            revealLastElement(tree);
          }, 0);
        }
      }
      this.previousTreeScrollHeight = tree.scrollHeight;
    }));
    this._register(tree.onContextMenu((e) => this.onContextMenu(e)));
    this._register(tree.onDidChangeFindOpenState((open) => this.findIsOpen = open));
    let lastSelectedString;
    this._register(tree.onMouseClick(() => {
      if (this.findIsOpen) {
        return;
      }
      const selection = dom.getWindow(this.treeContainer).getSelection();
      if (!selection || selection.type !== "Range" || lastSelectedString === selection.toString()) {
        this.replInput.focus();
      }
      lastSelectedString = selection ? selection.toString() : "";
    }));
    this.selectSession();
    this.styleElement = domStylesheetsJs.createStyleSheet(this.container, void 0, this._store);
    this.onDidStyleChange();
  }
  createReplInput(container) {
    this.replInputContainer = dom.append(container, $(".repl-input-wrapper"));
    dom.append(this.replInputContainer, $(".repl-input-chevron" + ThemeIcon.asCSSSelector(debugConsoleEvaluationPrompt)));
    const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(this.scopedContextKeyService, this));
    this.setHistoryNavigationEnablement = (enabled) => {
      historyNavigationBackwardsEnablement.set(enabled);
      historyNavigationForwardsEnablement.set(enabled);
    };
    CONTEXT_IN_DEBUG_REPL.bindTo(this.scopedContextKeyService).set(true);
    this.scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
    const options = getSimpleEditorOptions(this.configurationService);
    options.readOnly = true;
    options.suggest = { showStatusBar: true };
    const config = this.configurationService.getValue("debug");
    options.acceptSuggestionOnEnter = config.console.acceptSuggestionOnEnter === "on" ? "on" : "off";
    options.ariaLabel = this.getAriaLabel();
    this.replInput = this.scopedInstantiationService.createInstance(CodeEditorWidget, this.replInputContainer, options, getSimpleCodeEditorWidgetOptions());
    let lastContentHeight = -1;
    this._register(this.replInput.onDidChangeModelContent(() => {
      const model = this.replInput.getModel();
      this.setHistoryNavigationEnablement(!!model && model.getValue() === "");
      const contentHeight = this.replInput.getContentHeight();
      if (contentHeight !== lastContentHeight) {
        lastContentHeight = contentHeight;
        if (this.bodyContentDimension) {
          this.layoutBodyContent(this.bodyContentDimension.height, this.bodyContentDimension.width);
        }
      }
    }));
    this._register(this.replInput.onDidFocusEditorText(() => this.updateInputDecoration()));
    this._register(this.replInput.onDidBlurEditorText(() => this.updateInputDecoration()));
    this._register(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.FOCUS, () => this.replInputContainer.classList.add("synthetic-focus")));
    this._register(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.BLUR, () => this.replInputContainer.classList.remove("synthetic-focus")));
  }
  getAriaLabel() {
    let ariaLabel = localize("debugConsole", "Debug Console");
    if (!this.configurationService.getValue(AccessibilityVerbositySettingId.Debug)) {
      return ariaLabel;
    }
    const keybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getAriaLabel();
    if (keybinding) {
      ariaLabel = localize("commentLabelWithKeybinding", "{0}, use ({1}) for accessibility help", ariaLabel, keybinding);
    } else {
      ariaLabel = localize("commentLabelWithKeybindingNoKeybinding", "{0}, run the command Open Accessibility Help which is currently not triggerable via keybinding.", ariaLabel);
    }
    return ariaLabel;
  }
  onContextMenu(e) {
    const actions = getFlatContextMenuActions(this.menu.getActions({ arg: e.element, shouldForwardArgs: false }));
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => actions,
      getActionsContext: () => e.element
    });
  }
  // --- Update
  refreshReplElements(noDelay) {
    if (this.tree && this.isVisible()) {
      if (this.refreshScheduler.isScheduled()) {
        return;
      }
      this.refreshScheduler.schedule(noDelay ? 0 : void 0);
    }
  }
  updateInputDecoration() {
    if (!this.replInput) {
      return;
    }
    const decorations = [];
    if (this.isReadonly && this.replInput.hasTextFocus() && !this.replInput.getValue()) {
      const transparentForeground = resolveColorValue(editorForeground, this.themeService.getColorTheme())?.transparent(0.4);
      decorations.push({
        range: {
          startLineNumber: 0,
          endLineNumber: 0,
          startColumn: 0,
          endColumn: 1
        },
        renderOptions: {
          after: {
            contentText: localize("startDebugFirst", "Please start a debug session to evaluate expressions"),
            color: transparentForeground ? transparentForeground.toString() : void 0
          }
        }
      });
    }
    this.replInput.setDecorationsByType("repl-decoration", DECORATION_KEY, decorations);
  }
  saveState() {
    const replHistory = this.history.getHistory();
    if (replHistory.length) {
      this.storageService.store(HISTORY_STORAGE_KEY, JSON.stringify(replHistory), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE);
    }
    const filterHistory = this.filterWidget.getHistory();
    if (filterHistory.length) {
      this.storageService.store(FILTER_HISTORY_STORAGE_KEY, JSON.stringify(filterHistory), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(FILTER_HISTORY_STORAGE_KEY, StorageScope.WORKSPACE);
    }
    const filterValue = this.filterWidget.getFilterText();
    if (filterValue) {
      this.storageService.store(FILTER_VALUE_STORAGE_KEY, filterValue, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(FILTER_VALUE_STORAGE_KEY, StorageScope.WORKSPACE);
    }
    super.saveState();
  }
  dispose() {
    this.replInput?.dispose();
    this.replElementsChangeListener?.dispose();
    this.refreshScheduler.dispose();
    this.modelChangeListener.dispose();
    super.dispose();
  }
};
Repl.REFRESH_DELAY = 50;
// delay in ms to refresh the repl for new elements to show
Repl.URI = uri.parse(`${DEBUG_SCHEME}:replinput`);
__decorateClass([
  memoize
], Repl.prototype, "refreshScheduler", 1);
Repl = __decorateClass([
  __decorateParam(1, IDebugService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IModelService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, ICodeEditorService),
  __decorateParam(8, IViewDescriptorService),
  __decorateParam(9, IContextMenuService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, ITextResourcePropertiesService),
  __decorateParam(12, IEditorService),
  __decorateParam(13, IKeybindingService),
  __decorateParam(14, IOpenerService),
  __decorateParam(15, IHoverService),
  __decorateParam(16, IMenuService),
  __decorateParam(17, ILanguageFeaturesService),
  __decorateParam(18, ILogService)
], Repl);
let ReplOptions = class extends Disposable {
  constructor(viewId, backgroundColorDelegate, configurationService, themeService, viewDescriptorService) {
    super();
    this.backgroundColorDelegate = backgroundColorDelegate;
    this.configurationService = configurationService;
    this.themeService = themeService;
    this.viewDescriptorService = viewDescriptorService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._register(this.themeService.onDidColorThemeChange((e) => this.update()));
    this._register(this.viewDescriptorService.onDidChangeLocation((e) => {
      if (e.views.some((v) => v.id === viewId)) {
        this.update();
      }
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("debug.console.lineHeight") || e.affectsConfiguration("debug.console.fontSize") || e.affectsConfiguration("debug.console.fontFamily")) {
        this.update();
      }
    }));
    this.update();
  }
  get replConfiguration() {
    return this._replConfig;
  }
  update() {
    const debugConsole = this.configurationService.getValue("debug").console;
    this._replConfig = {
      fontSize: debugConsole.fontSize,
      fontFamily: debugConsole.fontFamily,
      lineHeight: debugConsole.lineHeight ? debugConsole.lineHeight : ReplOptions.lineHeightEm * debugConsole.fontSize,
      cssLineHeight: debugConsole.lineHeight ? `${debugConsole.lineHeight}px` : `${ReplOptions.lineHeightEm}em`,
      backgroundColor: this.themeService.getColorTheme().getColor(this.backgroundColorDelegate()),
      fontSizeForTwistie: debugConsole.fontSize * ReplOptions.lineHeightEm / 2 - 8
    };
    this._onDidChange.fire();
  }
};
ReplOptions.lineHeightEm = 1.4;
ReplOptions = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, IViewDescriptorService)
], ReplOptions);
class AcceptReplInputAction extends EditorAction {
  constructor() {
    super({
      id: "repl.action.acceptInput",
      label: localize2({ key: "actions.repl.acceptInput", comment: ["Apply input from the debug console input box"] }, "Debug Console: Accept Input"),
      precondition: CONTEXT_IN_DEBUG_REPL,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor, editor) {
    SuggestController.get(editor)?.cancelSuggestWidget();
    const repl = getReplView(accessor.get(IViewsService));
    repl?.acceptReplInput();
  }
}
class FilterReplAction extends ViewAction {
  constructor() {
    super({
      viewId: REPL_VIEW_ID,
      id: "repl.action.filter",
      title: localize("repl.action.filter", "Debug Console: Focus Filter"),
      precondition: CONTEXT_IN_DEBUG_REPL,
      keybinding: [{
        when: EditorContextKeys.textInputFocus,
        primary: KeyMod.CtrlCmd | KeyCode.KeyF,
        weight: KeybindingWeight.EditorContrib
      }]
    });
  }
  runInView(accessor, repl) {
    repl.focusFilter();
  }
}
class FindReplAction extends ViewAction {
  constructor() {
    super({
      viewId: REPL_VIEW_ID,
      id: "repl.action.find",
      title: localize("repl.action.find", "Debug Console: Focus Find"),
      precondition: CONTEXT_IN_DEBUG_REPL,
      keybinding: [{
        when: ContextKeyExpr.or(CONTEXT_IN_DEBUG_REPL, ContextKeyExpr.equals("focusedView", "workbench.panel.repl.view")),
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyF,
        weight: KeybindingWeight.EditorContrib
      }],
      icon: Codicon.search,
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", REPL_VIEW_ID),
        order: 15
      }, {
        id: MenuId.DebugConsoleContext,
        group: "z_commands",
        order: 25
      }]
    });
  }
  runInView(accessor, view) {
    view.openFind();
  }
}
class ReplCopyAllAction extends EditorAction {
  constructor() {
    super({
      id: "repl.action.copyAll",
      label: localize("actions.repl.copyAll", "Debug: Console Copy All"),
      alias: "Debug Console Copy All",
      precondition: CONTEXT_IN_DEBUG_REPL
    });
  }
  run(accessor, editor) {
    const clipboardService = accessor.get(IClipboardService);
    const repl = getReplView(accessor.get(IViewsService));
    if (repl) {
      return clipboardService.writeText(repl.getVisibleContent());
    }
  }
}
registerEditorAction(AcceptReplInputAction);
registerEditorAction(ReplCopyAllAction);
registerAction2(FilterReplAction);
registerAction2(FindReplAction);
class SelectReplActionViewItem extends FocusSessionActionViewItem {
  getSessions() {
    return this.debugService.getModel().getSessions(true).filter((s) => s.hasSeparateRepl() && !sessionsToIgnore.has(s));
  }
  mapFocusedSessionToSelected(focusedSession) {
    while (focusedSession.parentSession && !focusedSession.hasSeparateRepl()) {
      focusedSession = focusedSession.parentSession;
    }
    return focusedSession;
  }
}
function getReplView(viewsService) {
  return viewsService.getActiveViewWithId(REPL_VIEW_ID) ?? void 0;
}
const selectReplCommandId = "workbench.action.debug.selectRepl";
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: selectReplCommandId,
      viewId: REPL_VIEW_ID,
      title: localize("selectRepl", "Select Debug Console"),
      f1: false,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", REPL_VIEW_ID), CONTEXT_MULTI_SESSION_REPL),
        order: 20
      }
    });
  }
  async runInView(accessor, view, session) {
    const debugService = accessor.get(IDebugService);
    if (session && session.state !== State.Inactive && session !== debugService.getViewModel().focusedSession) {
      session = resolveChildSession(session, debugService.getModel().getSessions());
      await debugService.focusStackFrame(void 0, void 0, session, { explicit: true });
    }
    await view.selectSession(session);
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "workbench.debug.panel.action.clearReplAction",
      viewId: REPL_VIEW_ID,
      title: localize2("clearRepl", "Clear Console"),
      metadata: {
        description: localize2("clearRepl.descriotion", "Clears all program output from your debug REPL")
      },
      f1: true,
      icon: debugConsoleClearAll,
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", REPL_VIEW_ID),
        order: 30
      }, {
        id: MenuId.DebugConsoleContext,
        group: "z_commands",
        order: 20
      }],
      keybinding: [{
        primary: 0,
        mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyK },
        // Weight is higher than work workbench contributions so the keybinding remains
        // highest priority when chords are registered afterwards
        weight: KeybindingWeight.WorkbenchContrib + 1,
        when: ContextKeyExpr.equals("focusedView", "workbench.panel.repl.view")
      }]
    });
  }
  runInView(_accessor, view) {
    const accessibilitySignalService = _accessor.get(IAccessibilitySignalService);
    view.clearRepl();
    accessibilitySignalService.playSignal(AccessibilitySignal.clear);
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "debug.collapseRepl",
      title: localize("collapse", "Collapse All"),
      viewId: REPL_VIEW_ID,
      menu: {
        id: MenuId.DebugConsoleContext,
        group: "z_commands",
        order: 10
      }
    });
  }
  runInView(_accessor, view) {
    view.collapseAll();
    view.focus();
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "debug.replPaste",
      title: localize("paste", "Paste"),
      viewId: REPL_VIEW_ID,
      precondition: CONTEXT_DEBUG_STATE.notEqualsTo(getStateLabel(State.Inactive)),
      menu: {
        id: MenuId.DebugConsoleContext,
        group: "2_cutcopypaste",
        order: 30
      }
    });
  }
  async runInView(accessor, view) {
    const clipboardService = accessor.get(IClipboardService);
    const clipboardText = await clipboardService.readText();
    if (clipboardText) {
      const replInput = view.getReplInput();
      replInput.setValue(replInput.getValue().concat(clipboardText));
      view.focus();
      const model = replInput.getModel();
      const lineNumber = model ? model.getLineCount() : 0;
      const column = model?.getLineMaxColumn(lineNumber);
      if (typeof lineNumber === "number" && typeof column === "number") {
        replInput.setPosition({ lineNumber, column });
      }
    }
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "workbench.debug.action.copyAll",
      title: localize("copyAll", "Copy All"),
      viewId: REPL_VIEW_ID,
      menu: {
        id: MenuId.DebugConsoleContext,
        group: "2_cutcopypaste",
        order: 20
      }
    });
  }
  async runInView(accessor, view) {
    const clipboardService = accessor.get(IClipboardService);
    await clipboardService.writeText(view.getVisibleContent());
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "debug.replCopy",
      title: localize("copy", "Copy"),
      menu: {
        id: MenuId.DebugConsoleContext,
        group: "2_cutcopypaste",
        order: 10
      }
    });
  }
  async run(accessor, element) {
    const clipboardService = accessor.get(IClipboardService);
    const debugService = accessor.get(IDebugService);
    const nativeSelection = dom.getActiveWindow().getSelection();
    const selectedText = nativeSelection?.toString();
    if (selectedText && selectedText.length > 0) {
      return clipboardService.writeText(selectedText);
    } else if (element) {
      const retValue = await this.tryEvaluateAndCopy(debugService, element);
      const textToCopy = retValue || removeAnsiEscapeCodes(element.toString());
      return clipboardService.writeText(textToCopy);
    }
  }
  async tryEvaluateAndCopy(debugService, element) {
    if (!(element instanceof ReplEvaluationResult)) {
      return;
    }
    const stackFrame = debugService.getViewModel().focusedStackFrame;
    const session = debugService.getViewModel().focusedSession;
    if (!stackFrame || !session || !session.capabilities.supportsClipboardContext) {
      return;
    }
    try {
      const evaluation = await session.evaluate(element.originalExpression, stackFrame.frameId, "clipboard");
      return evaluation?.body.result;
    } catch (e) {
      return;
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: FOCUS_REPL_ID,
      category: DEBUG_COMMAND_CATEGORY,
      title: localize2({ comment: ["Debug is a noun in this context, not a verb."], key: "debugFocusConsole" }, "Focus on Debug Console View")
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const repl = await viewsService.openView(REPL_VIEW_ID);
    await repl?.focus();
  }
});
export {
  Repl,
  getReplView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvcmVwbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGRvbVN0eWxlc2hlZXRzSnMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IElIaXN0b3J5TmF2aWdhdGlvbldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9oaXN0b3J5LmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCAqIGFzIGFyaWEgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBNT1VTRV9DVVJTT1JfVEVYVF9DU1NfQ0xBU1NfTkFNRSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9tb3VzZUN1cnNvci9tb3VzZUN1cnNvci5qcyc7XG5pbXBvcnQgeyBJQXN5bmNEYXRhU291cmNlLCBJVHJlZUNvbnRleHRNZW51RXZlbnQsIElUcmVlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRnV6enlTY29yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgSGlzdG9yeU5hdmlnYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcmVtb3ZlQW5zaUVzY2FwZUNvZGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIGFzIHVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgaXNDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIHJlZ2lzdGVyRWRpdG9yQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEVESVRPUl9GT05UX0RFRkFVTFRTIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZm9udEluZm8uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSURlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25Db250ZXh0LCBDb21wbGV0aW9uSXRlbSwgQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZSwgQ29tcGxldGlvbkl0ZW1LaW5kLCBDb21wbGV0aW9uSXRlbUtpbmRzLCBDb21wbGV0aW9uSXRlbUxhYmVsLCBDb21wbGV0aW9uTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgU3VnZ2VzdENvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvc3VnZ2VzdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJTWVudSwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBbmRDcmVhdGVIaXN0b3J5TmF2aWdhdGlvbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9oaXN0b3J5L2Jyb3dzZXIvY29udGV4dFNjb3BlZEhpc3RvcnlXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQXN5bmNEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGVkaXRvckZvcmVncm91bmQsIHJlc29sdmVDb2xvclZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJOYXZpZ2FibGVDb250YWluZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvd2lkZ2V0TmF2aWdhdGlvbkNvbW1hbmRzLmpzJztcbmltcG9ydCB7IEZpbHRlclZpZXdQYW5lLCBJVmlld1BhbmVPcHRpb25zLCBWaWV3QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eUNvbW1hbmRJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHlDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBnZXRTaW1wbGVDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucywgZ2V0U2ltcGxlRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9zaW1wbGVFZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IENPTlRFWFRfREVCVUdfU1RBVEUsIENPTlRFWFRfSU5fREVCVUdfUkVQTCwgQ09OVEVYVF9NVUxUSV9TRVNTSU9OX1JFUEwsIERFQlVHX1NDSEVNRSwgSURlYnVnQ29uZmlndXJhdGlvbiwgSURlYnVnU2VydmljZSwgSURlYnVnU2Vzc2lvbiwgSVJlcGxDb25maWd1cmF0aW9uLCBJUmVwbEVsZW1lbnQsIElSZXBsT3B0aW9ucywgUkVQTF9WSUVXX0lELCBTdGF0ZSwgZ2V0U3RhdGVMYWJlbCB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBWYXJpYWJsZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z01vZGVsLmpzJztcbmltcG9ydCB7IHJlc29sdmVDaGlsZFNlc3Npb24gfSBmcm9tICcuLi9jb21tb24vZGVidWdVdGlscy5qcyc7XG5pbXBvcnQgeyBSZXBsRXZhbHVhdGlvblJlc3VsdCwgUmVwbEdyb3VwIH0gZnJvbSAnLi4vY29tbW9uL3JlcGxNb2RlbC5qcyc7XG5pbXBvcnQgeyBGb2N1c1Nlc3Npb25BY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4vZGVidWdBY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgREVCVUdfQ09NTUFORF9DQVRFR09SWSwgRk9DVVNfUkVQTF9JRCB9IGZyb20gJy4vZGVidWdDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0V4cHJlc3Npb25SZW5kZXJlciB9IGZyb20gJy4vZGVidWdFeHByZXNzaW9uUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgZGVidWdDb25zb2xlQ2xlYXJBbGwsIGRlYnVnQ29uc29sZUV2YWx1YXRpb25Qcm9tcHQgfSBmcm9tICcuL2RlYnVnSWNvbnMuanMnO1xuaW1wb3J0ICcuL21lZGlhL3JlcGwuY3NzJztcbmltcG9ydCB7IFJlcGxGaWx0ZXIgfSBmcm9tICcuL3JlcGxGaWx0ZXIuanMnO1xuaW1wb3J0IHsgUmVwbEFjY2Vzc2liaWxpdHlQcm92aWRlciwgUmVwbERhdGFTb3VyY2UsIFJlcGxEZWxlZ2F0ZSwgUmVwbEV2YWx1YXRpb25JbnB1dHNSZW5kZXJlciwgUmVwbEV2YWx1YXRpb25SZXN1bHRzUmVuZGVyZXIsIFJlcGxHcm91cFJlbmRlcmVyLCBSZXBsT3V0cHV0RWxlbWVudFJlbmRlcmVyLCBSZXBsUmF3T2JqZWN0c1JlbmRlcmVyLCBSZXBsVmFyaWFibGVzUmVuZGVyZXIgfSBmcm9tICcuL3JlcGxWaWV3ZXIuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmNvbnN0IEhJU1RPUllfU1RPUkFHRV9LRVkgPSAnZGVidWcucmVwbC5oaXN0b3J5JztcbmNvbnN0IEZJTFRFUl9ISVNUT1JZX1NUT1JBR0VfS0VZID0gJ2RlYnVnLnJlcGwuZmlsdGVySGlzdG9yeSc7XG5jb25zdCBGSUxURVJfVkFMVUVfU1RPUkFHRV9LRVkgPSAnZGVidWcucmVwbC5maWx0ZXJWYWx1ZSc7XG5jb25zdCBERUNPUkFUSU9OX0tFWSA9ICdyZXBsaW5wdXRkZWNvcmF0aW9uJztcblxuZnVuY3Rpb24gcmV2ZWFsTGFzdEVsZW1lbnQodHJlZTogV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxhbnksIGFueSwgYW55Pikge1xuXHR0cmVlLnNjcm9sbFRvcCA9IHRyZWUuc2Nyb2xsSGVpZ2h0IC0gdHJlZS5yZW5kZXJIZWlnaHQ7XG5cdC8vIHRyZWUuc2Nyb2xsVG9wID0gMWU2O1xufVxuXG5jb25zdCBzZXNzaW9uc1RvSWdub3JlID0gbmV3IFNldDxJRGVidWdTZXNzaW9uPigpO1xuY29uc3QgaWRlbnRpdHlQcm92aWRlciA9IHsgZ2V0SWQ6IChlbGVtZW50OiBJUmVwbEVsZW1lbnQpID0+IGVsZW1lbnQuZ2V0SWQoKSB9O1xuXG5leHBvcnQgY2xhc3MgUmVwbCBleHRlbmRzIEZpbHRlclZpZXdQYW5lIGltcGxlbWVudHMgSUhpc3RvcnlOYXZpZ2F0aW9uV2lkZ2V0IHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVGUkVTSF9ERUxBWSA9IDUwOyAvLyBkZWxheSBpbiBtcyB0byByZWZyZXNoIHRoZSByZXBsIGZvciBuZXcgZWxlbWVudHMgdG8gc2hvd1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBVUkkgPSB1cmkucGFyc2UoYCR7REVCVUdfU0NIRU1FfTpyZXBsaW5wdXRgKTtcblxuXHRwcml2YXRlIGhpc3Rvcnk6IEhpc3RvcnlOYXZpZ2F0b3I8c3RyaW5nPjtcblx0cHJpdmF0ZSB0cmVlPzogV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxJRGVidWdTZXNzaW9uLCBJUmVwbEVsZW1lbnQsIEZ1enp5U2NvcmU+O1xuXHRwcml2YXRlIHJlcGxPcHRpb25zOiBSZXBsT3B0aW9ucztcblx0cHJpdmF0ZSBwcmV2aW91c1RyZWVTY3JvbGxIZWlnaHQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgcmVwbERlbGVnYXRlITogUmVwbERlbGVnYXRlO1xuXHRwcml2YXRlIGNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRyZWVDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZXBsSW5wdXQhOiBDb2RlRWRpdG9yV2lkZ2V0O1xuXHRwcml2YXRlIHJlcGxJbnB1dENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGJvZHlDb250ZW50RGltZW5zaW9uOiBkb20uRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1vZGVsOiBJVGV4dE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNldEhpc3RvcnlOYXZpZ2F0aW9uRW5hYmxlbWVudCE6IChlbmFibGVkOiBib29sZWFuKSA9PiB2b2lkO1xuXHRwcml2YXRlIHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlITogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRwcml2YXRlIHJlcGxFbGVtZW50c0NoYW5nZUxpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdHlsZUVsZW1lbnQ6IEhUTUxTdHlsZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3R5bGVDaGFuZ2VkV2hlbkludmlzaWJsZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGNvbXBsZXRpb25JdGVtUHJvdmlkZXI6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1vZGVsQ2hhbmdlTGlzdGVuZXI6IElEaXNwb3NhYmxlID0gRGlzcG9zYWJsZS5Ob25lO1xuXHRwcml2YXRlIGZpbHRlcjogUmVwbEZpbHRlcjtcblx0cHJpdmF0ZSBtdWx0aVNlc3Npb25SZXBsOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBtZW51OiBJTWVudTtcblx0cHJpdmF0ZSByZXBsRGF0YVNvdXJjZTogSUFzeW5jRGF0YVNvdXJjZTxJRGVidWdTZXNzaW9uLCBJUmVwbEVsZW1lbnQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGZpbmRJc09wZW46IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld1BhbmVPcHRpb25zLFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIG92ZXJyaWRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlOiBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgZmlsdGVyVGV4dCA9IHN0b3JhZ2VTZXJ2aWNlLmdldChGSUxURVJfVkFMVUVfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsICcnKTtcblx0XHRzdXBlcih7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0ZmlsdGVyT3B0aW9uczoge1xuXHRcdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoeyBrZXk6ICd3b3JrYmVuY2guZGVidWcuZmlsdGVyLnBsYWNlaG9sZGVyJywgY29tbWVudDogWydUZXh0IGluIHRoZSBicmFja2V0cyBhZnRlciBlLmcuIGlzIG5vdCBsb2NhbGl6YWJsZSddIH0sIFwiRmlsdGVyIChlLmcuIHRleHQsICFleGNsdWRlLCBcXFxcZXNjYXBlKVwiKSxcblx0XHRcdFx0dGV4dDogZmlsdGVyVGV4dCxcblx0XHRcdFx0aGlzdG9yeTogSlNPTi5wYXJzZShzdG9yYWdlU2VydmljZS5nZXQoRklMVEVSX0hJU1RPUllfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsICdbXScpKSBhcyBzdHJpbmdbXSxcblx0XHRcdH1cblx0XHR9LCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblxuXHRcdHRoaXMubWVudSA9IG1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLkRlYnVnQ29uc29sZUNvbnRleHQsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1lbnUpO1xuXHRcdHRoaXMuaGlzdG9yeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBIaXN0b3J5TmF2aWdhdG9yKG5ldyBTZXQoSlNPTi5wYXJzZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChISVNUT1JZX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAnW10nKSkpLCAxMDApKTtcblx0XHR0aGlzLmZpbHRlciA9IG5ldyBSZXBsRmlsdGVyKCk7XG5cdFx0dGhpcy5maWx0ZXIuZmlsdGVyUXVlcnkgPSBmaWx0ZXJUZXh0O1xuXHRcdHRoaXMubXVsdGlTZXNzaW9uUmVwbCA9IENPTlRFWFRfTVVMVElfU0VTU0lPTl9SRVBMLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5yZXBsT3B0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVwbE9wdGlvbnMsIHRoaXMuaWQsICgpID0+IHRoaXMuZ2V0TG9jYXRpb25CYXNlZENvbG9ycygpLmJhY2tncm91bmQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlcGxPcHRpb25zLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMub25EaWRTdHlsZUNoYW5nZSgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb2RlRWRpdG9yU2VydmljZS5yZWdpc3RlckRlY29yYXRpb25UeXBlKCdyZXBsLWRlY29yYXRpb24nLCBERUNPUkFUSU9OX0tFWSwge30pKTtcblx0XHR0aGlzLm11bHRpU2Vzc2lvblJlcGwuc2V0KHRoaXMuaXNNdWx0aVNlc3Npb25WaWV3KTtcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbikge1xuXHRcdFx0dGhpcy5vbkRpZEZvY3VzU2Vzc2lvbih0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkub25EaWRGb2N1c1Nlc3Npb24oc2Vzc2lvbiA9PiB7XG5cdFx0XHR0aGlzLm9uRGlkRm9jdXNTZXNzaW9uKHNlc3Npb24pO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5vbkRpZEV2YWx1YXRlTGF6eUV4cHJlc3Npb24oYXN5bmMgZSA9PiB7XG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFZhcmlhYmxlICYmIHRoaXMudHJlZT8uaGFzTm9kZShlKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUudXBkYXRlQ2hpbGRyZW4oZSwgZmFsc2UsIHRydWUpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUuZXhwYW5kKGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5vbldpbGxOZXdTZXNzaW9uKGFzeW5jIG5ld1Nlc3Npb24gPT4ge1xuXHRcdFx0Ly8gTmVlZCB0byBsaXN0ZW4gdG8gb3V0cHV0IGV2ZW50cyBmb3Igc2Vzc2lvbnMgd2hpY2ggYXJlIG5vdCB5ZXQgZnVsbHkgaW5pdGlhbGlzZWRcblx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy50cmVlPy5nZXRJbnB1dCgpO1xuXHRcdFx0aWYgKCFpbnB1dCB8fCBpbnB1dC5zdGF0ZSA9PT0gU3RhdGUuSW5hY3RpdmUpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zZWxlY3RTZXNzaW9uKG5ld1Nlc3Npb24pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5tdWx0aVNlc3Npb25SZXBsLnNldCh0aGlzLmlzTXVsdGlTZXNzaW9uVmlldyk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLm9uRGlkRW5kU2Vzc2lvbihhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBVcGRhdGUgdmlldywgc2luY2Ugb3JwaGFuZWQgc2Vzc2lvbnMgbWlnaHQgbm93IGJlIHNlcGFyYXRlXG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTsgLy8gYWxsb3cgb3RoZXIgbGlzdGVuZXJzIHRvIGdvIGZpcnN0LCBzbyBzZXNzaW9ucyBjYW4gdXBkYXRlIHBhcmVudHNcblx0XHRcdHRoaXMubXVsdGlTZXNzaW9uUmVwbC5zZXQodGhpcy5pc011bHRpU2Vzc2lvblZpZXcpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5yZWZyZXNoUmVwbEVsZW1lbnRzKGZhbHNlKTtcblx0XHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlSW5wdXREZWNvcmF0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSh2aXNpYmxlID0+IHtcblx0XHRcdGlmICghdmlzaWJsZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMubW9kZWwpIHtcblx0XHRcdFx0dGhpcy5tb2RlbCA9IHRoaXMubW9kZWxTZXJ2aWNlLmdldE1vZGVsKFJlcGwuVVJJKSB8fCB0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnJywgbnVsbCwgUmVwbC5VUkksIHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmb2N1c2VkU2Vzc2lvbiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdFx0aWYgKHRoaXMudHJlZSAmJiB0aGlzLnRyZWUuZ2V0SW5wdXQoKSAhPT0gZm9jdXNlZFNlc3Npb24pIHtcblx0XHRcdFx0dGhpcy5vbkRpZEZvY3VzU2Vzc2lvbihmb2N1c2VkU2Vzc2lvbik7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuc2V0TW9kZSgpO1xuXHRcdFx0dGhpcy5yZXBsSW5wdXQuc2V0TW9kZWwodGhpcy5tb2RlbCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUlucHV0RGVjb3JhdGlvbigpO1xuXHRcdFx0dGhpcy5yZWZyZXNoUmVwbEVsZW1lbnRzKHRydWUpO1xuXG5cdFx0XHRpZiAodGhpcy5zdHlsZUNoYW5nZWRXaGVuSW52aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuc3R5bGVDaGFuZ2VkV2hlbkludmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHQvLyBPbmx5IHVwZGF0ZSBjaGlsZHJlbiB3aGVuIHRoZSB0cmVlIGhhcyBhbiBpbnB1dCAtIGl0IG1heSBub3QgeWV0XG5cdFx0XHRcdC8vIChubyBkZWJ1ZyBzZXNzaW9uIGhhcyBiZWVuIGZvY3VzZWQgc2luY2UgdGhpcyB2aWV3IHdhcyBjcmVhdGVkKSxcblx0XHRcdFx0Ly8gaW4gd2hpY2ggY2FzZSBgX3VwZGF0ZUNoaWxkcmVuYCB3b3VsZCB0aHJvdyBgVHJlZSBpbnB1dCBub3Qgc2V0YC5cblx0XHRcdFx0aWYgKHRoaXMudHJlZT8uZ2V0SW5wdXQoKSkge1xuXHRcdFx0XHRcdHRoaXMudHJlZS51cGRhdGVDaGlsZHJlbih1bmRlZmluZWQsIHRydWUsIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLm9uRGlkU3R5bGVDaGFuZ2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZGVidWcuY29uc29sZS53b3JkV3JhcCcpICYmIHRoaXMudHJlZSkge1xuXHRcdFx0XHR0aGlzLnRyZWUuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLnRyZWVDb250YWluZXIuaW5uZXJUZXh0ID0gJyc7XG5cdFx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy50cmVlQ29udGFpbmVyKTtcblx0XHRcdFx0dGhpcy5jcmVhdGVSZXBsVHJlZSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2RlYnVnLmNvbnNvbGUuYWNjZXB0U3VnZ2VzdGlvbk9uRW50ZXInKSkge1xuXHRcdFx0XHRjb25zdCBjb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpO1xuXHRcdFx0XHR0aGlzLnJlcGxJbnB1dC51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0XHRhY2NlcHRTdWdnZXN0aW9uT25FbnRlcjogY29uZmlnLmNvbnNvbGUuYWNjZXB0U3VnZ2VzdGlvbk9uRW50ZXIgPT09ICdvbicgPyAnb24nIDogJ29mZidcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuc2V0TW9kZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsdGVyV2lkZ2V0Lm9uRGlkQ2hhbmdlRmlsdGVyVGV4dCgoKSA9PiB7XG5cdFx0XHR0aGlzLmZpbHRlci5maWx0ZXJRdWVyeSA9IHRoaXMuZmlsdGVyV2lkZ2V0LmdldEZpbHRlclRleHQoKTtcblx0XHRcdGlmICh0aGlzLnRyZWUpIHtcblx0XHRcdFx0dGhpcy50cmVlLnJlZmlsdGVyKCk7XG5cdFx0XHRcdHJldmVhbExhc3RFbGVtZW50KHRoaXMudHJlZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZEZvY3VzU2Vzc2lvbihzZXNzaW9uOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHNlc3Npb25zVG9JZ25vcmUuZGVsZXRlKHNlc3Npb24pO1xuXHRcdFx0dGhpcy5jb21wbGV0aW9uSXRlbVByb3ZpZGVyPy5kaXNwb3NlKCk7XG5cdFx0XHRpZiAoc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNDb21wbGV0aW9uc1JlcXVlc3QpIHtcblx0XHRcdFx0dGhpcy5jb21wbGV0aW9uSXRlbVByb3ZpZGVyID0gdGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6IERFQlVHX1NDSEVNRSwgcGF0dGVybjogJyoqL3JlcGxpbnB1dCcsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIHtcblx0XHRcdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ2RlYnVnQ29uc29sZScsXG5cdFx0XHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IHNlc3Npb24uY2FwYWJpbGl0aWVzLmNvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVycyB8fCBbJy4nXSxcblx0XHRcdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zOiBhc3luYyAoXzogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBfY29udGV4dDogQ29tcGxldGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Q29tcGxldGlvbkxpc3Q+ID0+IHtcblx0XHRcdFx0XHRcdC8vIERpc2FibGUgaGlzdG9yeSBuYXZpZ2F0aW9uIGJlY2F1c2UgdXAgYW5kIGRvd24gYXJlIHVzZWQgdG8gbmF2aWdhdGUgdGhyb3VnaCB0aGUgc3VnZ2VzdCB3aWRnZXRcblx0XHRcdFx0XHRcdHRoaXMuc2V0SGlzdG9yeU5hdmlnYXRpb25FbmFibGVtZW50KGZhbHNlKTtcblxuXHRcdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLnJlcGxJbnB1dC5nZXRNb2RlbCgpO1xuXHRcdFx0XHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHRleHQgPSBtb2RlbC5nZXRWYWx1ZSgpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmb2N1c2VkU3RhY2tGcmFtZSA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmcmFtZUlkID0gZm9jdXNlZFN0YWNrRnJhbWUgPyBmb2N1c2VkU3RhY2tGcmFtZS5mcmFtZUlkIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHNlc3Npb24uY29tcGxldGlvbnMoZnJhbWVJZCwgZm9jdXNlZFN0YWNrRnJhbWU/LnRocmVhZC50aHJlYWRJZCB8fCAwLCB0ZXh0LCBwb3NpdGlvbiwgdG9rZW4pO1xuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IHN1Z2dlc3Rpb25zOiBDb21wbGV0aW9uSXRlbVtdID0gW107XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbXB1dGVSYW5nZSA9IChsZW5ndGg6IG51bWJlcikgPT4gUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbi5kZWx0YSgwLCAtbGVuZ3RoKSwgcG9zaXRpb24pO1xuXHRcdFx0XHRcdFx0XHRpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2UuYm9keSAmJiByZXNwb25zZS5ib2R5LnRhcmdldHMpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXNwb25zZS5ib2R5LnRhcmdldHMuZm9yRWFjaChpdGVtID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChpdGVtICYmIGl0ZW0ubGFiZWwpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bGV0IGluc2VydFRleHRSdWxlczogQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bGV0IGluc2VydFRleHQgPSBpdGVtLnRleHQgfHwgaXRlbS5sYWJlbDtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBpdGVtLnNlbGVjdGlvblN0YXJ0ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIElmIGEgZGVidWcgY29tcGxldGlvbiBpdGVtIHNldHMgYSBzZWxlY3Rpb24gd2UgbmVlZCB0byB1c2Ugc25pcHBldHMgdG8gbWFrZSBzdXJlIHRoZSBzZWxlY3Rpb24gaXMgc2VsZWN0ZWQgIzkwOTc0XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0aW5zZXJ0VGV4dFJ1bGVzID0gQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZS5JbnNlcnRBc1NuaXBwZXQ7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uTGVuZ3RoID0gdHlwZW9mIGl0ZW0uc2VsZWN0aW9uTGVuZ3RoID09PSAnbnVtYmVyJyA/IGl0ZW0uc2VsZWN0aW9uTGVuZ3RoIDogMDtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBwbGFjZWhvbGRlciA9IHNlbGVjdGlvbkxlbmd0aCA+IDAgPyAnJHsxOicgKyBpbnNlcnRUZXh0LnN1YnN0cmluZyhpdGVtLnNlbGVjdGlvblN0YXJ0LCBpdGVtLnNlbGVjdGlvblN0YXJ0ICsgc2VsZWN0aW9uTGVuZ3RoKSArICd9JDAnIDogJyQwJztcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRpbnNlcnRUZXh0ID0gaW5zZXJ0VGV4dC5zdWJzdHJpbmcoMCwgaXRlbS5zZWxlY3Rpb25TdGFydCkgKyBwbGFjZWhvbGRlciArIGluc2VydFRleHQuc3Vic3RyaW5nKGl0ZW0uc2VsZWN0aW9uU3RhcnQgKyBzZWxlY3Rpb25MZW5ndGgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgbGFiZWw6IHN0cmluZyB8IENvbXBsZXRpb25JdGVtTGFiZWwgPSBpdGVtLmRldGFpbFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdD8geyBsYWJlbDogaXRlbS5sYWJlbCwgZGVzY3JpcHRpb246IGl0ZW0uZGV0YWlsIH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQ6IGl0ZW0ubGFiZWw7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHN1Z2dlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGluc2VydFRleHQsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kcy5mcm9tU3RyaW5nKGl0ZW0udHlwZSB8fCAncHJvcGVydHknKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRmaWx0ZXJUZXh0OiAoaXRlbS5zdGFydCAmJiBpdGVtLmxlbmd0aCkgPyB0ZXh0LnN1YnN0cmluZyhpdGVtLnN0YXJ0LCBpdGVtLnN0YXJ0ICsgaXRlbS5sZW5ndGgpLmNvbmNhdChpdGVtLmxhYmVsKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRyYW5nZTogY29tcHV0ZVJhbmdlKGl0ZW0ubGVuZ3RoIHx8IDApLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHNvcnRUZXh0OiBpdGVtLnNvcnRUZXh0LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGluc2VydFRleHRSdWxlc1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLmNvbnNvbGUuaGlzdG9yeVN1Z2dlc3Rpb25zKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgaGlzdG9yeSA9IHRoaXMuaGlzdG9yeS5nZXRIaXN0b3J5KCk7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgaWR4TGVuZ3RoID0gU3RyaW5nKGhpc3RvcnkubGVuZ3RoKS5sZW5ndGg7XG5cdFx0XHRcdFx0XHRcdFx0aGlzdG9yeS5mb3JFYWNoKChoLCBpKSA9PiBzdWdnZXN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBoLFxuXHRcdFx0XHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogaCxcblx0XHRcdFx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0XHRcdFx0XHRcdFx0cmFuZ2U6IGNvbXB1dGVSYW5nZShoLmxlbmd0aCksXG5cdFx0XHRcdFx0XHRcdFx0XHRzb3J0VGV4dDogJ1paWicgKyBTdHJpbmcoaGlzdG9yeS5sZW5ndGggLSBpKS5wYWRTdGFydChpZHhMZW5ndGgsICcwJylcblx0XHRcdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRyZXR1cm4geyBzdWdnZXN0aW9ucyB9O1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgc3VnZ2VzdGlvbnM6IFtdIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5zZWxlY3RTZXNzaW9uKCk7XG5cdH1cblxuXHRnZXRGaWx0ZXJTdGF0cygpOiB7IHRvdGFsOiBudW1iZXI7IGZpbHRlcmVkOiBudW1iZXIgfSB7XG5cdFx0Ly8gVGhpcyBjb3VsZCBiZSBjYWxsZWQgYmVmb3JlIHRoZSB0cmVlIGlzIGNyZWF0ZWQgd2hlbiBzZXR0aW5nIHRoaXMuZmlsdGVyU3RhdGUuZmlsdGVyVGV4dCB2YWx1ZVxuXHRcdHJldHVybiB7XG5cdFx0XHR0b3RhbDogdGhpcy50cmVlPy5nZXROb2RlKCkuY2hpbGRyZW4ubGVuZ3RoID8/IDAsXG5cdFx0XHRmaWx0ZXJlZDogdGhpcy50cmVlPy5nZXROb2RlKCkuY2hpbGRyZW4uZmlsdGVyKGMgPT4gYy52aXNpYmxlKS5sZW5ndGggPz8gMFxuXHRcdH07XG5cdH1cblxuXHRnZXQgaXNSZWFkb25seSgpOiBib29sZWFuIHtcblx0XHQvLyBEbyBub3QgYWxsb3cgdG8gZWRpdCBpbmFjdGl2ZSBzZXNzaW9uc1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnRyZWU/LmdldElucHV0KCk7XG5cdFx0aWYgKHNlc3Npb24gJiYgc2Vzc2lvbi5zdGF0ZSAhPT0gU3RhdGUuSW5hY3RpdmUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHNob3dQcmV2aW91c1ZhbHVlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc1JlYWRvbmx5KSB7XG5cdFx0XHR0aGlzLm5hdmlnYXRlSGlzdG9yeSh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRzaG93TmV4dFZhbHVlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc1JlYWRvbmx5KSB7XG5cdFx0XHR0aGlzLm5hdmlnYXRlSGlzdG9yeShmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0Zm9jdXNGaWx0ZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5maWx0ZXJXaWRnZXQuZm9jdXMoKTtcblx0fVxuXG5cdG9wZW5GaW5kKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZT8ub3BlbkZpbmQoKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0TW9kZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3JDb250cm9sID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHRcdGlmIChpc0NvZGVFZGl0b3IoYWN0aXZlRWRpdG9yQ29udHJvbCkpIHtcblx0XHRcdHRoaXMubW9kZWxDaGFuZ2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLm1vZGVsQ2hhbmdlTGlzdGVuZXIgPSBhY3RpdmVFZGl0b3JDb250cm9sLm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZSgoKSA9PiB0aGlzLnNldE1vZGUoKSk7XG5cdFx0XHRpZiAodGhpcy5tb2RlbCAmJiBhY3RpdmVFZGl0b3JDb250cm9sLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0dGhpcy5tb2RlbC5zZXRMYW5ndWFnZShhY3RpdmVFZGl0b3JDb250cm9sLmdldE1vZGVsKCkuZ2V0TGFuZ3VhZ2VJZCgpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkU3R5bGVDaGFuZ2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHR0aGlzLnN0eWxlQ2hhbmdlZFdoZW5JbnZpc2libGUgPSB0cnVlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5zdHlsZUVsZW1lbnQpIHtcblx0XHRcdHRoaXMucmVwbElucHV0LnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRmb250U2l6ZTogdGhpcy5yZXBsT3B0aW9ucy5yZXBsQ29uZmlndXJhdGlvbi5mb250U2l6ZSxcblx0XHRcdFx0bGluZUhlaWdodDogdGhpcy5yZXBsT3B0aW9ucy5yZXBsQ29uZmlndXJhdGlvbi5saW5lSGVpZ2h0LFxuXHRcdFx0XHRmb250RmFtaWx5OiB0aGlzLnJlcGxPcHRpb25zLnJlcGxDb25maWd1cmF0aW9uLmZvbnRGYW1pbHkgPT09ICdkZWZhdWx0JyA/IEVESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRGYW1pbHkgOiB0aGlzLnJlcGxPcHRpb25zLnJlcGxDb25maWd1cmF0aW9uLmZvbnRGYW1pbHlcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXBsSW5wdXRMaW5lSGVpZ2h0ID0gdGhpcy5yZXBsSW5wdXQuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblxuXHRcdFx0Ly8gU2V0IHRoZSBmb250IHNpemUsIGZvbnQgZmFtaWx5LCBsaW5lIGhlaWdodCBhbmQgYWxpZ24gdGhlIHR3aXN0aWUgdG8gYmUgY2VudGVyZWQsIGFuZCBpbnB1dCB0aGVtZSBjb2xvclxuXHRcdFx0dGhpcy5zdHlsZUVsZW1lbnQudGV4dENvbnRlbnQgPSBgXG5cdFx0XHRcdC5yZXBsIC5yZXBsLWlucHV0LXdyYXBwZXIgLnJlcGwtaW5wdXQtY2hldnJvbiB7XG5cdFx0XHRcdFx0bGluZS1oZWlnaHQ6ICR7cmVwbElucHV0TGluZUhlaWdodH1weFxuXHRcdFx0XHR9XG5cblx0XHRcdFx0LnJlcGwgLnJlcGwtaW5wdXQtd3JhcHBlciAubW9uYWNvLWVkaXRvciAubGluZXMtY29udGVudCB7XG5cdFx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogJHt0aGlzLnJlcGxPcHRpb25zLnJlcGxDb25maWd1cmF0aW9uLmJhY2tncm91bmRDb2xvcn07XG5cdFx0XHRcdH1cblx0XHRcdGA7XG5cdFx0XHRjb25zdCBjc3NGb250RmFtaWx5ID0gdGhpcy5yZXBsT3B0aW9ucy5yZXBsQ29uZmlndXJhdGlvbi5mb250RmFtaWx5ID09PSAnZGVmYXVsdCcgPyAndmFyKC0tbW9uYWNvLW1vbm9zcGFjZS1mb250KScgOiB0aGlzLnJlcGxPcHRpb25zLnJlcGxDb25maWd1cmF0aW9uLmZvbnRGYW1pbHk7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eShgLS12c2NvZGUtcmVwbC1mb250LWZhbWlseWAsIGNzc0ZvbnRGYW1pbHkpO1xuXHRcdFx0dGhpcy5jb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoYC0tdnNjb2RlLXJlcGwtZm9udC1zaXplYCwgYCR7dGhpcy5yZXBsT3B0aW9ucy5yZXBsQ29uZmlndXJhdGlvbi5mb250U2l6ZX1weGApO1xuXHRcdFx0dGhpcy5jb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoYC0tdnNjb2RlLXJlcGwtZm9udC1zaXplLWZvci10d2lzdGllYCwgYCR7dGhpcy5yZXBsT3B0aW9ucy5yZXBsQ29uZmlndXJhdGlvbi5mb250U2l6ZUZvclR3aXN0aWV9cHhgKTtcblx0XHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KGAtLXZzY29kZS1yZXBsLWxpbmUtaGVpZ2h0YCwgdGhpcy5yZXBsT3B0aW9ucy5yZXBsQ29uZmlndXJhdGlvbi5jc3NMaW5lSGVpZ2h0KTtcblxuXHRcdFx0dGhpcy50cmVlPy5yZXJlbmRlcigpO1xuXG5cdFx0XHRpZiAodGhpcy5ib2R5Q29udGVudERpbWVuc2lvbikge1xuXHRcdFx0XHR0aGlzLmxheW91dEJvZHlDb250ZW50KHRoaXMuYm9keUNvbnRlbnREaW1lbnNpb24uaGVpZ2h0LCB0aGlzLmJvZHlDb250ZW50RGltZW5zaW9uLndpZHRoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG5hdmlnYXRlSGlzdG9yeShwcmV2aW91czogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGhpc3RvcnlJbnB1dCA9IChwcmV2aW91cyA/XG5cdFx0XHQodGhpcy5oaXN0b3J5LnByZXZpb3VzKCkgPz8gdGhpcy5oaXN0b3J5LmZpcnN0KCkpIDogdGhpcy5oaXN0b3J5Lm5leHQoKSlcblx0XHRcdD8/ICcnO1xuXHRcdHRoaXMucmVwbElucHV0LnNldFZhbHVlKGhpc3RvcnlJbnB1dCk7XG5cdFx0YXJpYS5zdGF0dXMoaGlzdG9yeUlucHV0KTtcblx0XHQvLyBhbHdheXMgbGVhdmUgY3Vyc29yIGF0IHRoZSBlbmQuXG5cdFx0dGhpcy5yZXBsSW5wdXQuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IGhpc3RvcnlJbnB1dC5sZW5ndGggKyAxIH0pO1xuXHRcdHRoaXMuc2V0SGlzdG9yeU5hdmlnYXRpb25FbmFibGVtZW50KHRydWUpO1xuXHR9XG5cblx0YXN5bmMgc2VsZWN0U2Vzc2lvbihzZXNzaW9uPzogSURlYnVnU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRyZWVJbnB1dCA9IHRoaXMudHJlZT8uZ2V0SW5wdXQoKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdGNvbnN0IGZvY3VzZWRTZXNzaW9uID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cdFx0XHQvLyBJZiB0aGVyZSBpcyBhIGZvY3VzZWRTZXNzaW9uIGZvY3VzIG9uIHRoYXQgb25lLCBvdGhlcndpc2UganVzdCBzaG93IGFueSBvdGhlciBub3QgaWdub3JlZCBzZXNzaW9uXG5cdFx0XHRpZiAoZm9jdXNlZFNlc3Npb24pIHtcblx0XHRcdFx0c2Vzc2lvbiA9IGZvY3VzZWRTZXNzaW9uO1xuXHRcdFx0fSBlbHNlIGlmICghdHJlZUlucHV0IHx8IHNlc3Npb25zVG9JZ25vcmUuaGFzKHRyZWVJbnB1dCkpIHtcblx0XHRcdFx0c2Vzc2lvbiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbnModHJ1ZSkuZmluZChzID0+ICFzZXNzaW9uc1RvSWdub3JlLmhhcyhzKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHR0aGlzLnJlcGxFbGVtZW50c0NoYW5nZUxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnJlcGxFbGVtZW50c0NoYW5nZUxpc3RlbmVyID0gc2Vzc2lvbi5vbkRpZENoYW5nZVJlcGxFbGVtZW50cygoKSA9PiB7XG5cdFx0XHRcdHRoaXMucmVmcmVzaFJlcGxFbGVtZW50cyhzZXNzaW9uLmdldFJlcGxFbGVtZW50cygpLmxlbmd0aCA9PT0gMCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHRoaXMudHJlZSAmJiB0cmVlSW5wdXQgIT09IHNlc3Npb24pIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUuc2V0SW5wdXQoc2Vzc2lvbik7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdC8vIElnbm9yZSBlcnJvciBiZWNhdXNlIHRoaXMgbWF5IGhhcHBlbiBtdWx0aXBsZSB0aW1lcyB3aGlsZSByZWZyZXNoaW5nLFxuXHRcdFx0XHRcdC8vIHRoZW4gY2hhbmdpbmcgdGhlIHJvb3QgbWF5IGZhaWwuIExvZyB0byBoZWxwIHdpdGggZGVidWdnaW5nIGlmIG5lZWRlZC5cblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXZlYWxMYXN0RWxlbWVudCh0aGlzLnRyZWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMucmVwbElucHV0Py51cGRhdGVPcHRpb25zKHsgcmVhZE9ubHk6IHRoaXMuaXNSZWFkb25seSB9KTtcblx0XHR0aGlzLnVwZGF0ZUlucHV0RGVjb3JhdGlvbigpO1xuXHR9XG5cblx0YXN5bmMgY2xlYXJSZXBsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnRyZWU/LmdldElucHV0KCk7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHNlc3Npb24ucmVtb3ZlUmVwbEV4cHJlc3Npb25zKCk7XG5cdFx0XHRpZiAoc2Vzc2lvbi5zdGF0ZSA9PT0gU3RhdGUuSW5hY3RpdmUpIHtcblx0XHRcdFx0Ly8gSWdub3JlIGluYWN0aXZlIHNlc3Npb25zIHdoaWNoIGdvdCBjbGVhcmVkIC0gc28gdGhleSBhcmUgbm90IHNob3duIGFueSBtb3JlXG5cdFx0XHRcdHNlc3Npb25zVG9JZ25vcmUuYWRkKHNlc3Npb24pO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnNlbGVjdFNlc3Npb24oKTtcblx0XHRcdFx0dGhpcy5tdWx0aVNlc3Npb25SZXBsLnNldCh0aGlzLmlzTXVsdGlTZXNzaW9uVmlldyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMucmVwbElucHV0LmZvY3VzKCk7XG5cdH1cblxuXHRhY2NlcHRSZXBsSW5wdXQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMudHJlZT8uZ2V0SW5wdXQoKTtcblx0XHRpZiAoc2Vzc2lvbiAmJiAhdGhpcy5pc1JlYWRvbmx5KSB7XG5cdFx0XHRzZXNzaW9uLmFkZFJlcGxFeHByZXNzaW9uKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lLCB0aGlzLnJlcGxJbnB1dC5nZXRWYWx1ZSgpKTtcblx0XHRcdHJldmVhbExhc3RFbGVtZW50KHRoaXMudHJlZSEpO1xuXHRcdFx0dGhpcy5oaXN0b3J5LmFkZCh0aGlzLnJlcGxJbnB1dC5nZXRWYWx1ZSgpKTtcblx0XHRcdHRoaXMucmVwbElucHV0LnNldFZhbHVlKCcnKTtcblx0XHRcdGlmICh0aGlzLmJvZHlDb250ZW50RGltZW5zaW9uKSB7XG5cdFx0XHRcdC8vIFRyaWdnZXIgYSBsYXlvdXQgdG8gc2hyaW5rIGEgcG90ZW50aWFsIG11bHRpIGxpbmUgaW5wdXRcblx0XHRcdFx0dGhpcy5sYXlvdXRCb2R5Q29udGVudCh0aGlzLmJvZHlDb250ZW50RGltZW5zaW9uLmhlaWdodCwgdGhpcy5ib2R5Q29udGVudERpbWVuc2lvbi53aWR0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0c2VuZFJlcGxJbnB1dChpbnB1dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMudHJlZT8uZ2V0SW5wdXQoKTtcblx0XHRpZiAoc2Vzc2lvbiAmJiAhdGhpcy5pc1JlYWRvbmx5KSB7XG5cdFx0XHRzZXNzaW9uLmFkZFJlcGxFeHByZXNzaW9uKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lLCBpbnB1dCk7XG5cdFx0XHRyZXZlYWxMYXN0RWxlbWVudCh0aGlzLnRyZWUhKTtcblx0XHRcdHRoaXMuaGlzdG9yeS5hZGQoaW5wdXQpO1xuXHRcdH1cblx0fVxuXG5cdGdldFZpc2libGVDb250ZW50KCk6IHN0cmluZyB7XG5cdFx0bGV0IHRleHQgPSAnJztcblx0XHRpZiAodGhpcy5tb2RlbCAmJiB0aGlzLnRyZWUpIHtcblx0XHRcdGNvbnN0IGxpbmVEZWxpbWl0ZXIgPSB0aGlzLnRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlLmdldEVPTCh0aGlzLm1vZGVsLnVyaSk7XG5cdFx0XHRjb25zdCB0cmF2ZXJzZUFuZEFwcGVuZCA9IChub2RlOiBJVHJlZU5vZGU8SVJlcGxFbGVtZW50LCBGdXp6eVNjb3JlPikgPT4ge1xuXHRcdFx0XHRub2RlLmNoaWxkcmVuLmZvckVhY2goY2hpbGQgPT4ge1xuXHRcdFx0XHRcdGlmIChjaGlsZC52aXNpYmxlKSB7XG5cdFx0XHRcdFx0XHR0ZXh0ICs9IGNoaWxkLmVsZW1lbnQudG9TdHJpbmcoKS50cmltUmlnaHQoKSArIGxpbmVEZWxpbWl0ZXI7XG5cdFx0XHRcdFx0XHRpZiAoIWNoaWxkLmNvbGxhcHNlZCAmJiBjaGlsZC5jaGlsZHJlbi5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0dHJhdmVyc2VBbmRBcHBlbmQoY2hpbGQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXHRcdFx0dHJhdmVyc2VBbmRBcHBlbmQodGhpcy50cmVlLmdldE5vZGUoKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlbW92ZUFuc2lFc2NhcGVDb2Rlcyh0ZXh0KTtcblx0fVxuXG5cdHByb3RlY3RlZCBsYXlvdXRCb2R5Q29udGVudChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuYm9keUNvbnRlbnREaW1lbnNpb24gPSBuZXcgZG9tLkRpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KTtcblx0XHRjb25zdCByZXBsSW5wdXRIZWlnaHQgPSBNYXRoLm1pbih0aGlzLnJlcGxJbnB1dC5nZXRDb250ZW50SGVpZ2h0KCksIGhlaWdodCk7XG5cdFx0aWYgKHRoaXMudHJlZSkge1xuXHRcdFx0Y29uc3QgbGFzdEVsZW1lbnRWaXNpYmxlID0gdGhpcy50cmVlLnNjcm9sbFRvcCArIHRoaXMudHJlZS5yZW5kZXJIZWlnaHQgPj0gdGhpcy50cmVlLnNjcm9sbEhlaWdodDtcblx0XHRcdGNvbnN0IHRyZWVIZWlnaHQgPSBoZWlnaHQgLSByZXBsSW5wdXRIZWlnaHQ7XG5cdFx0XHR0aGlzLnRyZWUuZ2V0SFRNTEVsZW1lbnQoKS5zdHlsZS5oZWlnaHQgPSBgJHt0cmVlSGVpZ2h0fXB4YDtcblx0XHRcdHRoaXMudHJlZS5sYXlvdXQodHJlZUhlaWdodCwgd2lkdGgpO1xuXHRcdFx0aWYgKGxhc3RFbGVtZW50VmlzaWJsZSkge1xuXHRcdFx0XHRyZXZlYWxMYXN0RWxlbWVudCh0aGlzLnRyZWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLnJlcGxJbnB1dENvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtyZXBsSW5wdXRIZWlnaHR9cHhgO1xuXG5cdFx0dGhpcy5yZXBsSW5wdXQubGF5b3V0KHsgd2lkdGg6IHdpZHRoIC0gMzAsIGhlaWdodDogcmVwbElucHV0SGVpZ2h0IH0pO1xuXHR9XG5cblx0Y29sbGFwc2VBbGwoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlPy5jb2xsYXBzZUFsbCgpO1xuXHR9XG5cblx0Z2V0RGVidWdTZXNzaW9uKCk6IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnRyZWU/LmdldElucHV0KCk7XG5cdH1cblxuXHRnZXRSZXBsSW5wdXQoKTogQ29kZUVkaXRvcldpZGdldCB7XG5cdFx0cmV0dXJuIHRoaXMucmVwbElucHV0O1xuXHR9XG5cblx0Z2V0UmVwbERhdGFTb3VyY2UoKTogSUFzeW5jRGF0YVNvdXJjZTxJRGVidWdTZXNzaW9uLCBJUmVwbEVsZW1lbnQ+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5yZXBsRGF0YVNvdXJjZTtcblx0fVxuXG5cdGdldEZvY3VzZWRFbGVtZW50KCk6IElSZXBsRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZT8uZ2V0Rm9jdXMoKT8uWzBdO1xuXHR9XG5cblx0Zm9jdXNUcmVlKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZT8uZG9tRm9jdXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGZvY3VzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTsgLy8gd2FpdCBhIHRhc2sgZm9yIHRoZSByZXBsIHRvIGdldCBhdHRhY2hlZCB0byB0aGUgRE9NLCAjODMzODdcblx0XHR0aGlzLnJlcGxJbnB1dC5mb2N1cygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY3JlYXRlQWN0aW9uVmlld0l0ZW0oYWN0aW9uOiBJQWN0aW9uKTogSUFjdGlvblZpZXdJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoYWN0aW9uLmlkID09PSBzZWxlY3RSZXBsQ29tbWFuZElkKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gKHRoaXMudHJlZSA/IHRoaXMudHJlZS5nZXRJbnB1dCgpIDogdW5kZWZpbmVkKSA/PyB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlbGVjdFJlcGxBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCBzZXNzaW9uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIuY3JlYXRlQWN0aW9uVmlld0l0ZW0oYWN0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGlzTXVsdGlTZXNzaW9uVmlldygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9ucyh0cnVlKS5maWx0ZXIocyA9PiBzLmhhc1NlcGFyYXRlUmVwbCgpICYmICFzZXNzaW9uc1RvSWdub3JlLmhhcyhzKSkubGVuZ3RoID4gMTtcblx0fVxuXG5cdC8vIC0tLSBDYWNoZWQgbG9jYWxzXG5cblx0QG1lbW9pemVcblx0cHJpdmF0ZSBnZXQgcmVmcmVzaFNjaGVkdWxlcigpOiBSdW5PbmNlU2NoZWR1bGVyIHtcblx0XHRjb25zdCBhdXRvRXhwYW5kZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRyZXR1cm4gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnRyZWUgfHwgIXRoaXMudHJlZS5nZXRJbnB1dCgpIHx8ICF0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy50cmVlLnVwZGF0ZUNoaWxkcmVuKHVuZGVmaW5lZCwgdHJ1ZSwgZmFsc2UsIHsgZGlmZklkZW50aXR5UHJvdmlkZXI6IGlkZW50aXR5UHJvdmlkZXIgfSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnRyZWUuZ2V0SW5wdXQoKTtcblx0XHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRcdC8vIEF1dG9tYXRpY2FsbHkgZXhwYW5kIHJlcGwgZ3JvdXAgZWxlbWVudHMgd2hlbiBzcGVjaWZpZWRcblx0XHRcdFx0Y29uc3QgYXV0b0V4cGFuZEVsZW1lbnRzID0gYXN5bmMgKGVsZW1lbnRzOiBJUmVwbEVsZW1lbnRbXSkgPT4ge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBlbGVtZW50cykge1xuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsR3JvdXApIHtcblx0XHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQuYXV0b0V4cGFuZCAmJiAhYXV0b0V4cGFuZGVkLmhhcyhlbGVtZW50LmdldElkKCkpKSB7XG5cdFx0XHRcdFx0XHRcdFx0YXV0b0V4cGFuZGVkLmFkZChlbGVtZW50LmdldElkKCkpO1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudHJlZSEuZXhwYW5kKGVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmICghdGhpcy50cmVlIS5pc0NvbGxhcHNlZChlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIFJlcGwgZ3JvdXBzIGNhbiBoYXZlIGNoaWxkcmVuIHdoaWNoIGFyZSByZXBsIGdyb3VwcyB0aHVzIHdlIG1pZ2h0IG5lZWQgdG8gZXhwYW5kIHRob3NlIGFzIHdlbGxcblx0XHRcdFx0XHRcdFx0XHRhd2FpdCBhdXRvRXhwYW5kRWxlbWVudHMoZWxlbWVudC5nZXRDaGlsZHJlbigpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0YXdhaXQgYXV0b0V4cGFuZEVsZW1lbnRzKHNlc3Npb24uZ2V0UmVwbEVsZW1lbnRzKCkpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUmVwbCBlbGVtZW50cyBjb3VudCBjaGFuZ2VkLCBuZWVkIHRvIHVwZGF0ZSBmaWx0ZXIgc3RhdHMgb24gdGhlIGJhZGdlXG5cdFx0XHRjb25zdCB7IHRvdGFsLCBmaWx0ZXJlZCB9ID0gdGhpcy5nZXRGaWx0ZXJTdGF0cygpO1xuXHRcdFx0dGhpcy5maWx0ZXJXaWRnZXQudXBkYXRlQmFkZ2UodG90YWwgPT09IGZpbHRlcmVkIHx8IHRvdGFsID09PSAwID8gdW5kZWZpbmVkIDogbG9jYWxpemUoJ3Nob3dpbmcgZmlsdGVyZWQgcmVwbCBsaW5lcycsIFwiU2hvd2luZyB7MH0gb2YgezF9XCIsIGZpbHRlcmVkLCB0b3RhbCkpO1xuXHRcdH0sIFJlcGwuUkVGUkVTSF9ERUxBWSk7XG5cdH1cblxuXHQvLyAtLS0gQ3JlYXRpb25cblxuXHRvdmVycmlkZSByZW5kZXIoKTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJOYXZpZ2FibGVDb250YWluZXIoe1xuXHRcdFx0bmFtZTogJ3JlcGwnLFxuXHRcdFx0Zm9jdXNOb3RpZmllcnM6IFt0aGlzLCB0aGlzLmZpbHRlcldpZGdldF0sXG5cdFx0XHRmb2N1c05leHRXaWRnZXQ6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMudHJlZT8uZ2V0SFRNTEVsZW1lbnQoKTtcblx0XHRcdFx0aWYgKHRoaXMuZmlsdGVyV2lkZ2V0Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0XHR0aGlzLnRyZWU/LmRvbUZvY3VzKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudCAmJiBkb20uaXNBY3RpdmVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Zm9jdXNQcmV2aW91c1dpZGdldDogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy50cmVlPy5nZXRIVE1MRWxlbWVudCgpO1xuXHRcdFx0XHRpZiAodGhpcy5yZXBsSW5wdXQuaGFzVGV4dEZvY3VzKCkpIHtcblx0XHRcdFx0XHR0aGlzLnRyZWU/LmRvbUZvY3VzKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudCAmJiBkb20uaXNBY3RpdmVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1c0ZpbHRlcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkocGFyZW50KTtcblx0XHR0aGlzLmNvbnRhaW5lciA9IGRvbS5hcHBlbmQocGFyZW50LCAkKCcucmVwbCcpKTtcblx0XHR0aGlzLnRyZWVDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKGAucmVwbC10cmVlLiR7TU9VU0VfQ1VSU09SX1RFWFRfQ1NTX0NMQVNTX05BTUV9YCkpO1xuXHRcdHRoaXMuY3JlYXRlUmVwbElucHV0KHRoaXMuY29udGFpbmVyKTtcblx0XHR0aGlzLmNyZWF0ZVJlcGxUcmVlKCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVJlcGxUcmVlKCk6IHZvaWQge1xuXHRcdHRoaXMucmVwbERlbGVnYXRlID0gbmV3IFJlcGxEZWxlZ2F0ZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnJlcGxPcHRpb25zKTtcblx0XHRjb25zdCB3b3JkV3JhcCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykuY29uc29sZS53b3JkV3JhcDtcblx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnd29yZC13cmFwJywgd29yZFdyYXApO1xuXHRcdGNvbnN0IGV4cHJlc3Npb25SZW5kZXJlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVidWdFeHByZXNzaW9uUmVuZGVyZXIpO1xuXHRcdHRoaXMucmVwbERhdGFTb3VyY2UgPSBuZXcgUmVwbERhdGFTb3VyY2UoKTtcblxuXHRcdGNvbnN0IHRyZWUgPSB0aGlzLnRyZWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoQXN5bmNEYXRhVHJlZTxJRGVidWdTZXNzaW9uLCBJUmVwbEVsZW1lbnQsIEZ1enp5U2NvcmU+LFxuXHRcdFx0J0RlYnVnUmVwbCcsXG5cdFx0XHR0aGlzLnRyZWVDb250YWluZXIsXG5cdFx0XHR0aGlzLnJlcGxEZWxlZ2F0ZSxcblx0XHRcdFtcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXBsVmFyaWFibGVzUmVuZGVyZXIsIGV4cHJlc3Npb25SZW5kZXJlciksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVwbE91dHB1dEVsZW1lbnRSZW5kZXJlciwgZXhwcmVzc2lvblJlbmRlcmVyKSxcblx0XHRcdFx0bmV3IFJlcGxFdmFsdWF0aW9uSW5wdXRzUmVuZGVyZXIoKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXBsR3JvdXBSZW5kZXJlciwgZXhwcmVzc2lvblJlbmRlcmVyKSxcblx0XHRcdFx0bmV3IFJlcGxFdmFsdWF0aW9uUmVzdWx0c1JlbmRlcmVyKGV4cHJlc3Npb25SZW5kZXJlciksXG5cdFx0XHRcdG5ldyBSZXBsUmF3T2JqZWN0c1JlbmRlcmVyKGV4cHJlc3Npb25SZW5kZXJlciksXG5cdFx0XHRdLFxuXHRcdFx0dGhpcy5yZXBsRGF0YVNvdXJjZSxcblx0XHRcdHtcblx0XHRcdFx0ZmlsdGVyOiB0aGlzLmZpbHRlcixcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgUmVwbEFjY2Vzc2liaWxpdHlQcm92aWRlcigpLFxuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyLFxuXHRcdFx0XHR1c2VyU2VsZWN0aW9uOiB0cnVlLFxuXHRcdFx0XHRtb3VzZVN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRmaW5kV2lkZ2V0RW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjogeyBnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbDogKGU6IElSZXBsRWxlbWVudCkgPT4gZS50b1N0cmluZyh0cnVlKSB9LFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiAhd29yZFdyYXAsXG5cdFx0XHRcdHNldFJvd0xpbmVIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRzdXBwb3J0RHluYW1pY0hlaWdodHM6IHdvcmRXcmFwLFxuXHRcdFx0XHRvdmVycmlkZVN0eWxlczogdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCkubGlzdE92ZXJyaWRlU3R5bGVzXG5cdFx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRyZWUub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KCgpID0+IHtcblx0XHRcdGlmICh0cmVlLnNjcm9sbEhlaWdodCAhPT0gdGhpcy5wcmV2aW91c1RyZWVTY3JvbGxIZWlnaHQpIHtcblx0XHRcdFx0Ly8gRHVlIHRvIHJvdW5kaW5nLCB0aGUgc2Nyb2xsVG9wICsgcmVuZGVySGVpZ2h0IHdpbGwgbm90IGV4YWN0bHkgbWF0Y2ggdGhlIHNjcm9sbEhlaWdodC5cblx0XHRcdFx0Ly8gQ29uc2lkZXIgdGhlIHRyZWUgdG8gYmUgc2Nyb2xsZWQgYWxsIHRoZSB3YXkgZG93biBpZiBpdCBpcyB3aXRoaW4gMnB4IG9mIHRoZSBib3R0b20uXG5cdFx0XHRcdGNvbnN0IGxhc3RFbGVtZW50V2FzVmlzaWJsZSA9IHRyZWUuc2Nyb2xsVG9wICsgdHJlZS5yZW5kZXJIZWlnaHQgPj0gdGhpcy5wcmV2aW91c1RyZWVTY3JvbGxIZWlnaHQgLSAyO1xuXHRcdFx0XHRpZiAobGFzdEVsZW1lbnRXYXNWaXNpYmxlKSB7XG5cdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBDYW4ndCBzZXQgc2Nyb2xsVG9wIGR1cmluZyB0aGlzIGV2ZW50IGxpc3RlbmVyLCB0aGUgbGlzdCBtaWdodCBvdmVyd3JpdGUgdGhlIGNoYW5nZVxuXHRcdFx0XHRcdFx0cmV2ZWFsTGFzdEVsZW1lbnQodHJlZSk7XG5cdFx0XHRcdFx0fSwgMCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5wcmV2aW91c1RyZWVTY3JvbGxIZWlnaHQgPSB0cmVlLnNjcm9sbEhlaWdodDtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0cmVlLm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uQ29udGV4dE1lbnUoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0cmVlLm9uRGlkQ2hhbmdlRmluZE9wZW5TdGF0ZSgob3BlbikgPT4gdGhpcy5maW5kSXNPcGVuID0gb3BlbikpO1xuXG5cdFx0bGV0IGxhc3RTZWxlY3RlZFN0cmluZzogc3RyaW5nO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRyZWUub25Nb3VzZUNsaWNrKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmZpbmRJc09wZW4pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gZG9tLmdldFdpbmRvdyh0aGlzLnRyZWVDb250YWluZXIpLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0aWYgKCFzZWxlY3Rpb24gfHwgc2VsZWN0aW9uLnR5cGUgIT09ICdSYW5nZScgfHwgbGFzdFNlbGVjdGVkU3RyaW5nID09PSBzZWxlY3Rpb24udG9TdHJpbmcoKSkge1xuXHRcdFx0XHQvLyBvbmx5IGZvY3VzIHRoZSBpbnB1dCBpZiB0aGUgdXNlciBpcyBub3QgY3VycmVudGx5IHNlbGVjdGluZyBhbmQgZmluZCBpc24ndCBvcGVuLlxuXHRcdFx0XHR0aGlzLnJlcGxJbnB1dC5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdFx0bGFzdFNlbGVjdGVkU3RyaW5nID0gc2VsZWN0aW9uID8gc2VsZWN0aW9uLnRvU3RyaW5nKCkgOiAnJztcblx0XHR9KSk7XG5cdFx0Ly8gTWFrZSBzdXJlIHRvIHNlbGVjdCB0aGUgc2Vzc2lvbiBpZiBkZWJ1Z2dpbmcgaXMgYWxyZWFkeSBhY3RpdmVcblx0XHR0aGlzLnNlbGVjdFNlc3Npb24oKTtcblx0XHR0aGlzLnN0eWxlRWxlbWVudCA9IGRvbVN0eWxlc2hlZXRzSnMuY3JlYXRlU3R5bGVTaGVldCh0aGlzLmNvbnRhaW5lciwgdW5kZWZpbmVkLCB0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5vbkRpZFN0eWxlQ2hhbmdlKCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVJlcGxJbnB1dChjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5yZXBsSW5wdXRDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnJlcGwtaW5wdXQtd3JhcHBlcicpKTtcblx0XHRkb20uYXBwZW5kKHRoaXMucmVwbElucHV0Q29udGFpbmVyLCAkKCcucmVwbC1pbnB1dC1jaGV2cm9uJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGRlYnVnQ29uc29sZUV2YWx1YXRpb25Qcm9tcHQpKSk7XG5cblx0XHRjb25zdCB7IGhpc3RvcnlOYXZpZ2F0aW9uQmFja3dhcmRzRW5hYmxlbWVudCwgaGlzdG9yeU5hdmlnYXRpb25Gb3J3YXJkc0VuYWJsZW1lbnQgfSA9IHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQW5kQ3JlYXRlSGlzdG9yeU5hdmlnYXRpb25Db250ZXh0KHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHRoaXMpKTtcblx0XHR0aGlzLnNldEhpc3RvcnlOYXZpZ2F0aW9uRW5hYmxlbWVudCA9IGVuYWJsZWQgPT4ge1xuXHRcdFx0aGlzdG9yeU5hdmlnYXRpb25CYWNrd2FyZHNFbmFibGVtZW50LnNldChlbmFibGVkKTtcblx0XHRcdGhpc3RvcnlOYXZpZ2F0aW9uRm9yd2FyZHNFbmFibGVtZW50LnNldChlbmFibGVkKTtcblx0XHR9O1xuXHRcdENPTlRFWFRfSU5fREVCVUdfUkVQTC5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpO1xuXG5cdFx0dGhpcy5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBnZXRTaW1wbGVFZGl0b3JPcHRpb25zKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdG9wdGlvbnMucmVhZE9ubHkgPSB0cnVlO1xuXHRcdG9wdGlvbnMuc3VnZ2VzdCA9IHsgc2hvd1N0YXR1c0JhcjogdHJ1ZSB9O1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJyk7XG5cdFx0b3B0aW9ucy5hY2NlcHRTdWdnZXN0aW9uT25FbnRlciA9IGNvbmZpZy5jb25zb2xlLmFjY2VwdFN1Z2dlc3Rpb25PbkVudGVyID09PSAnb24nID8gJ29uJyA6ICdvZmYnO1xuXHRcdG9wdGlvbnMuYXJpYUxhYmVsID0gdGhpcy5nZXRBcmlhTGFiZWwoKTtcblxuXHRcdHRoaXMucmVwbElucHV0ID0gdGhpcy5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2RlRWRpdG9yV2lkZ2V0LCB0aGlzLnJlcGxJbnB1dENvbnRhaW5lciwgb3B0aW9ucywgZ2V0U2ltcGxlQ29kZUVkaXRvcldpZGdldE9wdGlvbnMoKSk7XG5cblx0XHRsZXQgbGFzdENvbnRlbnRIZWlnaHQgPSAtMTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlcGxJbnB1dC5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMucmVwbElucHV0LmdldE1vZGVsKCk7XG5cdFx0XHR0aGlzLnNldEhpc3RvcnlOYXZpZ2F0aW9uRW5hYmxlbWVudCghIW1vZGVsICYmIG1vZGVsLmdldFZhbHVlKCkgPT09ICcnKTtcblxuXHRcdFx0Y29uc3QgY29udGVudEhlaWdodCA9IHRoaXMucmVwbElucHV0LmdldENvbnRlbnRIZWlnaHQoKTtcblx0XHRcdGlmIChjb250ZW50SGVpZ2h0ICE9PSBsYXN0Q29udGVudEhlaWdodCkge1xuXHRcdFx0XHRsYXN0Q29udGVudEhlaWdodCA9IGNvbnRlbnRIZWlnaHQ7XG5cdFx0XHRcdGlmICh0aGlzLmJvZHlDb250ZW50RGltZW5zaW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5sYXlvdXRCb2R5Q29udGVudCh0aGlzLmJvZHlDb250ZW50RGltZW5zaW9uLmhlaWdodCwgdGhpcy5ib2R5Q29udGVudERpbWVuc2lvbi53aWR0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Ly8gV2UgYWRkIHRoZSBpbnB1dCBkZWNvcmF0aW9uIG9ubHkgd2hlbiB0aGUgZm9jdXMgaXMgaW4gdGhlIGlucHV0ICM2MTEyNlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVwbElucHV0Lm9uRGlkRm9jdXNFZGl0b3JUZXh0KCgpID0+IHRoaXMudXBkYXRlSW5wdXREZWNvcmF0aW9uKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlcGxJbnB1dC5vbkRpZEJsdXJFZGl0b3JUZXh0KCgpID0+IHRoaXMudXBkYXRlSW5wdXREZWNvcmF0aW9uKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnJlcGxJbnB1dENvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5GT0NVUywgKCkgPT4gdGhpcy5yZXBsSW5wdXRDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc3ludGhldGljLWZvY3VzJykpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5yZXBsSW5wdXRDb250YWluZXIsIGRvbS5FdmVudFR5cGUuQkxVUiwgKCkgPT4gdGhpcy5yZXBsSW5wdXRDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnc3ludGhldGljLWZvY3VzJykpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0bGV0IGFyaWFMYWJlbCA9IGxvY2FsaXplKCdkZWJ1Z0NvbnNvbGUnLCBcIkRlYnVnIENvbnNvbGVcIik7XG5cdFx0aWYgKCF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuRGVidWcpKSB7XG5cdFx0XHRyZXR1cm4gYXJpYUxhYmVsO1xuXHRcdH1cblx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEFjY2Vzc2liaWxpdHlDb21tYW5kSWQuT3BlbkFjY2Vzc2liaWxpdHlIZWxwKT8uZ2V0QXJpYUxhYmVsKCk7XG5cdFx0aWYgKGtleWJpbmRpbmcpIHtcblx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjb21tZW50TGFiZWxXaXRoS2V5YmluZGluZycsIFwiezB9LCB1c2UgKHsxfSkgZm9yIGFjY2Vzc2liaWxpdHkgaGVscFwiLCBhcmlhTGFiZWwsIGtleWJpbmRpbmcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY29tbWVudExhYmVsV2l0aEtleWJpbmRpbmdOb0tleWJpbmRpbmcnLCBcInswfSwgcnVuIHRoZSBjb21tYW5kIE9wZW4gQWNjZXNzaWJpbGl0eSBIZWxwIHdoaWNoIGlzIGN1cnJlbnRseSBub3QgdHJpZ2dlcmFibGUgdmlhIGtleWJpbmRpbmcuXCIsIGFyaWFMYWJlbCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFyaWFMYWJlbDtcblx0fVxuXG5cdHByaXZhdGUgb25Db250ZXh0TWVudShlOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8SVJlcGxFbGVtZW50Pik6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zKHRoaXMubWVudS5nZXRBY3Rpb25zKHsgYXJnOiBlLmVsZW1lbnQsIHNob3VsZEZvcndhcmRBcmdzOiBmYWxzZSB9KSk7XG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IGUuZWxlbWVudFxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gLS0tIFVwZGF0ZVxuXG5cdHByaXZhdGUgcmVmcmVzaFJlcGxFbGVtZW50cyhub0RlbGF5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudHJlZSAmJiB0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRpZiAodGhpcy5yZWZyZXNoU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlZnJlc2hTY2hlZHVsZXIuc2NoZWR1bGUobm9EZWxheSA/IDAgOiB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSW5wdXREZWNvcmF0aW9uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5yZXBsSW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkZWNvcmF0aW9uczogSURlY29yYXRpb25PcHRpb25zW10gPSBbXTtcblx0XHRpZiAodGhpcy5pc1JlYWRvbmx5ICYmIHRoaXMucmVwbElucHV0Lmhhc1RleHRGb2N1cygpICYmICF0aGlzLnJlcGxJbnB1dC5nZXRWYWx1ZSgpKSB7XG5cdFx0XHRjb25zdCB0cmFuc3BhcmVudEZvcmVncm91bmQgPSByZXNvbHZlQ29sb3JWYWx1ZShlZGl0b3JGb3JlZ3JvdW5kLCB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkpPy50cmFuc3BhcmVudCgwLjQpO1xuXHRcdFx0ZGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAwLFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDAsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDAsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAxXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlbmRlck9wdGlvbnM6IHtcblx0XHRcdFx0XHRhZnRlcjoge1xuXHRcdFx0XHRcdFx0Y29udGVudFRleHQ6IGxvY2FsaXplKCdzdGFydERlYnVnRmlyc3QnLCBcIlBsZWFzZSBzdGFydCBhIGRlYnVnIHNlc3Npb24gdG8gZXZhbHVhdGUgZXhwcmVzc2lvbnNcIiksXG5cdFx0XHRcdFx0XHRjb2xvcjogdHJhbnNwYXJlbnRGb3JlZ3JvdW5kID8gdHJhbnNwYXJlbnRGb3JlZ3JvdW5kLnRvU3RyaW5nKCkgOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMucmVwbElucHV0LnNldERlY29yYXRpb25zQnlUeXBlKCdyZXBsLWRlY29yYXRpb24nLCBERUNPUkFUSU9OX0tFWSwgZGVjb3JhdGlvbnMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2F2ZVN0YXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlcGxIaXN0b3J5ID0gdGhpcy5oaXN0b3J5LmdldEhpc3RvcnkoKTtcblx0XHRpZiAocmVwbEhpc3RvcnkubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEhJU1RPUllfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KHJlcGxIaXN0b3J5KSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoSElTVE9SWV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0fVxuXHRcdGNvbnN0IGZpbHRlckhpc3RvcnkgPSB0aGlzLmZpbHRlcldpZGdldC5nZXRIaXN0b3J5KCk7XG5cdFx0aWYgKGZpbHRlckhpc3RvcnkubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEZJTFRFUl9ISVNUT1JZX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeShmaWx0ZXJIaXN0b3J5KSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoRklMVEVSX0hJU1RPUllfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdH1cblx0XHRjb25zdCBmaWx0ZXJWYWx1ZSA9IHRoaXMuZmlsdGVyV2lkZ2V0LmdldEZpbHRlclRleHQoKTtcblx0XHRpZiAoZmlsdGVyVmFsdWUpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoRklMVEVSX1ZBTFVFX1NUT1JBR0VfS0VZLCBmaWx0ZXJWYWx1ZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoRklMVEVSX1ZBTFVFX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHR9XG5cblx0XHRzdXBlci5zYXZlU3RhdGUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5yZXBsSW5wdXQ/LmRpc3Bvc2UoKTsgLy8gRGlzcG9zZWQgYmVmb3JlIHJlbmRlcmVkPyAjMTc0NTU4XG5cdFx0dGhpcy5yZXBsRWxlbWVudHNDaGFuZ2VMaXN0ZW5lcj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMucmVmcmVzaFNjaGVkdWxlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5tb2RlbENoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgUmVwbE9wdGlvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVJlcGxPcHRpb25zIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgbGluZUhlaWdodEVtID0gMS40O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfcmVwbENvbmZpZyE6IElSZXBsQ29uZmlndXJhdGlvbjtcblx0cHVibGljIGdldCByZXBsQ29uZmlndXJhdGlvbigpOiBJUmVwbENvbmZpZ3VyYXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9yZXBsQ29uZmlnO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dmlld0lkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBiYWNrZ3JvdW5kQ29sb3JEZWxlZ2F0ZTogKCkgPT4gc3RyaW5nLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoZSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2Uub25EaWRDaGFuZ2VMb2NhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLnZpZXdzLnNvbWUodiA9PiB2LmlkID09PSB2aWV3SWQpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2RlYnVnLmNvbnNvbGUubGluZUhlaWdodCcpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2RlYnVnLmNvbnNvbGUuZm9udFNpemUnKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdkZWJ1Zy5jb25zb2xlLmZvbnRGYW1pbHknKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGUoKSB7XG5cdFx0Y29uc3QgZGVidWdDb25zb2xlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5jb25zb2xlO1xuXHRcdHRoaXMuX3JlcGxDb25maWcgPSB7XG5cdFx0XHRmb250U2l6ZTogZGVidWdDb25zb2xlLmZvbnRTaXplLFxuXHRcdFx0Zm9udEZhbWlseTogZGVidWdDb25zb2xlLmZvbnRGYW1pbHksXG5cdFx0XHRsaW5lSGVpZ2h0OiBkZWJ1Z0NvbnNvbGUubGluZUhlaWdodCA/IGRlYnVnQ29uc29sZS5saW5lSGVpZ2h0IDogUmVwbE9wdGlvbnMubGluZUhlaWdodEVtICogZGVidWdDb25zb2xlLmZvbnRTaXplLFxuXHRcdFx0Y3NzTGluZUhlaWdodDogZGVidWdDb25zb2xlLmxpbmVIZWlnaHQgPyBgJHtkZWJ1Z0NvbnNvbGUubGluZUhlaWdodH1weGAgOiBgJHtSZXBsT3B0aW9ucy5saW5lSGVpZ2h0RW19ZW1gLFxuXHRcdFx0YmFja2dyb3VuZENvbG9yOiB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkuZ2V0Q29sb3IodGhpcy5iYWNrZ3JvdW5kQ29sb3JEZWxlZ2F0ZSgpKSxcblx0XHRcdGZvbnRTaXplRm9yVHdpc3RpZTogZGVidWdDb25zb2xlLmZvbnRTaXplICogUmVwbE9wdGlvbnMubGluZUhlaWdodEVtIC8gMiAtIDhcblx0XHR9O1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0fVxufVxuXG4vLyBSZXBsIGFjdGlvbnMgYW5kIGNvbW1hbmRzXG5cbmNsYXNzIEFjY2VwdFJlcGxJbnB1dEFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdyZXBsLmFjdGlvbi5hY2NlcHRJbnB1dCcsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUyKHsga2V5OiAnYWN0aW9ucy5yZXBsLmFjY2VwdElucHV0JywgY29tbWVudDogWydBcHBseSBpbnB1dCBmcm9tIHRoZSBkZWJ1ZyBjb25zb2xlIGlucHV0IGJveCddIH0sIFwiRGVidWcgQ29uc29sZTogQWNjZXB0IElucHV0XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0lOX0RFQlVHX1JFUEwsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQgfCBQcm9taXNlPHZvaWQ+IHtcblx0XHRTdWdnZXN0Q29udHJvbGxlci5nZXQoZWRpdG9yKT8uY2FuY2VsU3VnZ2VzdFdpZGdldCgpO1xuXHRcdGNvbnN0IHJlcGwgPSBnZXRSZXBsVmlldyhhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkpO1xuXHRcdHJlcGw/LmFjY2VwdFJlcGxJbnB1dCgpO1xuXHR9XG59XG5cbmNsYXNzIEZpbHRlclJlcGxBY3Rpb24gZXh0ZW5kcyBWaWV3QWN0aW9uPFJlcGw+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHR2aWV3SWQ6IFJFUExfVklFV19JRCxcblx0XHRcdGlkOiAncmVwbC5hY3Rpb24uZmlsdGVyJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncmVwbC5hY3Rpb24uZmlsdGVyJywgXCJEZWJ1ZyBDb25zb2xlOiBGb2N1cyBGaWx0ZXJcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfSU5fREVCVUdfUkVQTCxcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Rixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRydW5JblZpZXcoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlcGw6IFJlcGwpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmVwbC5mb2N1c0ZpbHRlcigpO1xuXHR9XG59XG5cblxuY2xhc3MgRmluZFJlcGxBY3Rpb24gZXh0ZW5kcyBWaWV3QWN0aW9uPFJlcGw+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHR2aWV3SWQ6IFJFUExfVklFV19JRCxcblx0XHRcdGlkOiAncmVwbC5hY3Rpb24uZmluZCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3JlcGwuYWN0aW9uLmZpbmQnLCBcIkRlYnVnIENvbnNvbGU6IEZvY3VzIEZpbmRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfSU5fREVCVUdfUkVQTCxcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKENPTlRFWFRfSU5fREVCVUdfUkVQTCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdmb2N1c2VkVmlldycsICd3b3JrYmVuY2gucGFuZWwucmVwbC52aWV3JykpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUYsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XSxcblx0XHRcdGljb246IENvZGljb24uc2VhcmNoLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFJFUExfVklFV19JRCksXG5cdFx0XHRcdG9yZGVyOiAxNVxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkRlYnVnQ29uc29sZUNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnel9jb21tYW5kcycsXG5cdFx0XHRcdG9yZGVyOiAyNVxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRydW5JblZpZXcoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFJlcGwpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy5vcGVuRmluZCgpO1xuXHR9XG59XG5cbmNsYXNzIFJlcGxDb3B5QWxsQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3JlcGwuYWN0aW9uLmNvcHlBbGwnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhY3Rpb25zLnJlcGwuY29weUFsbCcsIFwiRGVidWc6IENvbnNvbGUgQ29weSBBbGxcIiksXG5cdFx0XHRhbGlhczogJ0RlYnVnIENvbnNvbGUgQ29weSBBbGwnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0lOX0RFQlVHX1JFUEwsXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0Y29uc3QgcmVwbCA9IGdldFJlcGxWaWV3KGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKSk7XG5cdFx0aWYgKHJlcGwpIHtcblx0XHRcdHJldHVybiBjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChyZXBsLmdldFZpc2libGVDb250ZW50KCkpO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlckVkaXRvckFjdGlvbihBY2NlcHRSZXBsSW5wdXRBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oUmVwbENvcHlBbGxBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEZpbHRlclJlcGxBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEZpbmRSZXBsQWN0aW9uKTtcblxuY2xhc3MgU2VsZWN0UmVwbEFjdGlvblZpZXdJdGVtIGV4dGVuZHMgRm9jdXNTZXNzaW9uQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBSZWFkb25seUFycmF5PElEZWJ1Z1Nlc3Npb24+IHtcblx0XHRyZXR1cm4gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9ucyh0cnVlKS5maWx0ZXIocyA9PiBzLmhhc1NlcGFyYXRlUmVwbCgpICYmICFzZXNzaW9uc1RvSWdub3JlLmhhcyhzKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbWFwRm9jdXNlZFNlc3Npb25Ub1NlbGVjdGVkKGZvY3VzZWRTZXNzaW9uOiBJRGVidWdTZXNzaW9uKTogSURlYnVnU2Vzc2lvbiB7XG5cdFx0d2hpbGUgKGZvY3VzZWRTZXNzaW9uLnBhcmVudFNlc3Npb24gJiYgIWZvY3VzZWRTZXNzaW9uLmhhc1NlcGFyYXRlUmVwbCgpKSB7XG5cdFx0XHRmb2N1c2VkU2Vzc2lvbiA9IGZvY3VzZWRTZXNzaW9uLnBhcmVudFNlc3Npb247XG5cdFx0fVxuXHRcdHJldHVybiBmb2N1c2VkU2Vzc2lvbjtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVwbFZpZXcodmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlKTogUmVwbCB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB2aWV3c1NlcnZpY2UuZ2V0QWN0aXZlVmlld1dpdGhJZChSRVBMX1ZJRVdfSUQpIGFzIFJlcGwgPz8gdW5kZWZpbmVkO1xufVxuXG5jb25zdCBzZWxlY3RSZXBsQ29tbWFuZElkID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuc2VsZWN0UmVwbCc7XG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPFJlcGw+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IHNlbGVjdFJlcGxDb21tYW5kSWQsXG5cdFx0XHR2aWV3SWQ6IFJFUExfVklFV19JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2VsZWN0UmVwbCcsIFwiU2VsZWN0IERlYnVnIENvbnNvbGVcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgUkVQTF9WSUVXX0lEKSwgQ09OVEVYVF9NVUxUSV9TRVNTSU9OX1JFUEwpLFxuXHRcdFx0XHRvcmRlcjogMjBcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkluVmlldyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogUmVwbCwgc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHQvLyBJZiBzZXNzaW9uIGlzIGFscmVhZHkgdGhlIGZvY3VzZWQgc2Vzc2lvbiB3ZSBuZWVkIHRvIG1hbnVhbHkgdXBkYXRlIHRoZSB0cmVlIHNpbmNlIHZpZXcgbW9kZWwgd2lsbCBub3Qgc2VuZCBhIGZvY3VzZWQgY2hhbmdlIGV2ZW50XG5cdFx0aWYgKHNlc3Npb24gJiYgc2Vzc2lvbi5zdGF0ZSAhPT0gU3RhdGUuSW5hY3RpdmUgJiYgc2Vzc2lvbiAhPT0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uKSB7XG5cdFx0XHRzZXNzaW9uID0gcmVzb2x2ZUNoaWxkU2Vzc2lvbihzZXNzaW9uLCBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9ucygpKTtcblx0XHRcdGF3YWl0IGRlYnVnU2VydmljZS5mb2N1c1N0YWNrRnJhbWUodW5kZWZpbmVkLCB1bmRlZmluZWQsIHNlc3Npb24sIHsgZXhwbGljaXQ6IHRydWUgfSk7XG5cdFx0fVxuXHRcdC8vIE5lZWQgdG8gc2VsZWN0IHRoZSBzZXNzaW9uIGluIHRoZSB2aWV3IHNpbmNlIHRoZSBmb2N1c3NlZCBzZXNzaW9uIG1pZ2h0IG5vdCBoYXZlIGNoYW5nZWRcblx0XHRhd2FpdCB2aWV3LnNlbGVjdFNlc3Npb24oc2Vzc2lvbik7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPFJlcGw+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZGVidWcucGFuZWwuYWN0aW9uLmNsZWFyUmVwbEFjdGlvbicsXG5cdFx0XHR2aWV3SWQ6IFJFUExfVklFV19JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NsZWFyUmVwbCcsICdDbGVhciBDb25zb2xlJyksXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUyKCdjbGVhclJlcGwuZGVzY3Jpb3Rpb24nLCAnQ2xlYXJzIGFsbCBwcm9ncmFtIG91dHB1dCBmcm9tIHlvdXIgZGVidWcgUkVQTCcpXG5cdFx0XHR9LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRpY29uOiBkZWJ1Z0NvbnNvbGVDbGVhckFsbCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBSRVBMX1ZJRVdfSUQpLFxuXHRcdFx0XHRvcmRlcjogMzBcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z0NvbnNvbGVDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ3pfY29tbWFuZHMnLFxuXHRcdFx0XHRvcmRlcjogMjBcblx0XHRcdH1dLFxuXHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0cHJpbWFyeTogMCxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLIH0sXG5cdFx0XHRcdC8vIFdlaWdodCBpcyBoaWdoZXIgdGhhbiB3b3JrIHdvcmtiZW5jaCBjb250cmlidXRpb25zIHNvIHRoZSBrZXliaW5kaW5nIHJlbWFpbnNcblx0XHRcdFx0Ly8gaGlnaGVzdCBwcmlvcml0eSB3aGVuIGNob3JkcyBhcmUgcmVnaXN0ZXJlZCBhZnRlcndhcmRzXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdmb2N1c2VkVmlldycsICd3b3JrYmVuY2gucGFuZWwucmVwbC52aWV3Jylcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuSW5WaWV3KF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogUmVwbCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlID0gX2FjY2Vzc29yLmdldChJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UpO1xuXHRcdHZpZXcuY2xlYXJSZXBsKCk7XG5cdFx0YWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmNsZWFyKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdBY3Rpb248UmVwbD4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2RlYnVnLmNvbGxhcHNlUmVwbCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NvbGxhcHNlJywgXCJDb2xsYXBzZSBBbGxcIiksXG5cdFx0XHR2aWV3SWQ6IFJFUExfVklFV19JRCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z0NvbnNvbGVDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ3pfY29tbWFuZHMnLFxuXHRcdFx0XHRvcmRlcjogMTBcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bkluVmlldyhfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFJlcGwpOiB2b2lkIHtcblx0XHR2aWV3LmNvbGxhcHNlQWxsKCk7XG5cdFx0dmlldy5mb2N1cygpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxSZXBsPiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZGVidWcucmVwbFBhc3RlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncGFzdGUnLCBcIlBhc3RlXCIpLFxuXHRcdFx0dmlld0lkOiBSRVBMX1ZJRVdfSUQsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfREVCVUdfU1RBVEUubm90RXF1YWxzVG8oZ2V0U3RhdGVMYWJlbChTdGF0ZS5JbmFjdGl2ZSkpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkRlYnVnQ29uc29sZUNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMl9jdXRjb3B5cGFzdGUnLFxuXHRcdFx0XHRvcmRlcjogMzBcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkluVmlldyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogUmVwbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNsaXBib2FyZFRleHQgPSBhd2FpdCBjbGlwYm9hcmRTZXJ2aWNlLnJlYWRUZXh0KCk7XG5cdFx0aWYgKGNsaXBib2FyZFRleHQpIHtcblx0XHRcdGNvbnN0IHJlcGxJbnB1dCA9IHZpZXcuZ2V0UmVwbElucHV0KCk7XG5cdFx0XHRyZXBsSW5wdXQuc2V0VmFsdWUocmVwbElucHV0LmdldFZhbHVlKCkuY29uY2F0KGNsaXBib2FyZFRleHQpKTtcblx0XHRcdHZpZXcuZm9jdXMoKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gcmVwbElucHV0LmdldE1vZGVsKCk7XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gbW9kZWwgPyBtb2RlbC5nZXRMaW5lQ291bnQoKSA6IDA7XG5cdFx0XHRjb25zdCBjb2x1bW4gPSBtb2RlbD8uZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRcdGlmICh0eXBlb2YgbGluZU51bWJlciA9PT0gJ251bWJlcicgJiYgdHlwZW9mIGNvbHVtbiA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0cmVwbElucHV0LnNldFBvc2l0aW9uKHsgbGluZU51bWJlciwgY29sdW1uIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdBY3Rpb248UmVwbD4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5kZWJ1Zy5hY3Rpb24uY29weUFsbCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NvcHlBbGwnLCBcIkNvcHkgQWxsXCIpLFxuXHRcdFx0dmlld0lkOiBSRVBMX1ZJRVdfSUQsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdDb25zb2xlQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcyX2N1dGNvcHlwYXN0ZScsXG5cdFx0XHRcdG9yZGVyOiAyMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBSZXBsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0YXdhaXQgY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodmlldy5nZXRWaXNpYmxlQ29udGVudCgpKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2RlYnVnLnJlcGxDb3B5Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29weScsIFwiQ29weVwiKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z0NvbnNvbGVDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzJfY3V0Y29weXBhc3RlJyxcblx0XHRcdFx0b3JkZXI6IDEwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVsZW1lbnQ6IElSZXBsRWxlbWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCBuYXRpdmVTZWxlY3Rpb24gPSBkb20uZ2V0QWN0aXZlV2luZG93KCkuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRUZXh0ID0gbmF0aXZlU2VsZWN0aW9uPy50b1N0cmluZygpO1xuXHRcdGlmIChzZWxlY3RlZFRleHQgJiYgc2VsZWN0ZWRUZXh0Lmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChzZWxlY3RlZFRleHQpO1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudCkge1xuXHRcdFx0Y29uc3QgcmV0VmFsdWUgPSBhd2FpdCB0aGlzLnRyeUV2YWx1YXRlQW5kQ29weShkZWJ1Z1NlcnZpY2UsIGVsZW1lbnQpO1xuXHRcdFx0Y29uc3QgdGV4dFRvQ29weSA9IHJldFZhbHVlIHx8IHJlbW92ZUFuc2lFc2NhcGVDb2RlcyhlbGVtZW50LnRvU3RyaW5nKCkpO1xuXHRcdFx0cmV0dXJuIGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHRleHRUb0NvcHkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHJ5RXZhbHVhdGVBbmRDb3B5KGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSwgZWxlbWVudDogSVJlcGxFbGVtZW50KTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyB0b2RvOiB3ZSBzaG91bGQgZXhwYW5kIERBUCB0byBhbGxvdyBjb3B5aW5nIG1vcmUgdHlwZXMgaGVyZSAoIzE4Nzc4NClcblx0XHRpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgUmVwbEV2YWx1YXRpb25SZXN1bHQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhY2tGcmFtZSA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRjb25zdCBzZXNzaW9uID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdGlmICghc3RhY2tGcmFtZSB8fCAhc2Vzc2lvbiB8fCAhc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNDbGlwYm9hcmRDb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGV2YWx1YXRpb24gPSBhd2FpdCBzZXNzaW9uLmV2YWx1YXRlKGVsZW1lbnQub3JpZ2luYWxFeHByZXNzaW9uLCBzdGFja0ZyYW1lLmZyYW1lSWQsICdjbGlwYm9hcmQnKTtcblx0XHRcdHJldHVybiBldmFsdWF0aW9uPy5ib2R5LnJlc3VsdDtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBGT0NVU19SRVBMX0lELFxuXHRcdFx0Y2F0ZWdvcnk6IERFQlVHX0NPTU1BTkRfQ0FURUdPUlksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKHsgY29tbWVudDogWydEZWJ1ZyBpcyBhIG5vdW4gaW4gdGhpcyBjb250ZXh0LCBub3QgYSB2ZXJiLiddLCBrZXk6ICdkZWJ1Z0ZvY3VzQ29uc29sZScgfSwgXCJGb2N1cyBvbiBEZWJ1ZyBDb25zb2xlIFZpZXdcIiksXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgcmVwbCA9IGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldzxSZXBsPihSRVBMX1ZJRVdfSUQpO1xuXHRcdGF3YWl0IHJlcGw/LmZvY3VzKCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxzQkFBc0I7QUFHbEMsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsd0NBQXdDO0FBR2pELFNBQVMsa0JBQWtCLGVBQWU7QUFFMUMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFFeEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxPQUFPLFdBQVc7QUFDM0IsU0FBc0Isb0JBQW9CO0FBQzFDLFNBQVMsY0FBYyw0QkFBNEI7QUFDbkQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyxhQUFhO0FBRXRCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQTRDLDhCQUE4QixvQkFBb0IsMkJBQWdFO0FBRTlKLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxxQkFBcUIsbUNBQW1DO0FBQ2pFLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsU0FBZ0IsY0FBYyxRQUFRLHVCQUF1QjtBQUN0RSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUE2QiwwQkFB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
