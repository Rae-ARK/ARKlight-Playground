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
import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import * as domStylesheetsJs from "../../../../base/browser/domStylesheets.js";
import { Action, ActionRunner } from "../../../../base/common/actions.js";
import { Event } from "../../../../base/common/event.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { SelectActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { defaultSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { peekViewBorder, peekViewTitleBackground, peekViewTitleForeground, peekViewTitleInfoForeground, PeekViewWidget } from "../../../../editor/contrib/peekView/browser/peekView.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { IMenuService, MenuId, MenuItemAction, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { MouseTargetType } from "../../../../editor/browser/editorBrowser.js";
import { EditorAction, registerEditorAction } from "../../../../editor/browser/editorExtensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { EmbeddedDiffEditorWidget } from "../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { IQuickDiffModelService } from "./quickDiffModel.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { rot } from "../../../../base/common/numbers.js";
import { ChangeType, getChangeHeight, getChangeType, getChangeTypeColor, getModifiedEndLineNumber, IQuickDiffService, lineIntersectsChange } from "../common/quickDiff.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { TextCompareEditorActiveContext } from "../../../common/contextkeys.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { basename } from "../../../../base/common/resources.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../editor/common/core/position.js";
import { getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { gotoNextLocation, gotoPreviousLocation } from "../../../../platform/theme/common/iconRegistry.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Color } from "../../../../base/common/color.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { getOuterEditor } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { quickDiffDecorationCount } from "./quickDiffDecorator.js";
import { hasNativeContextMenu } from "../../../../platform/window/common/window.js";
const isQuickDiffVisible = new RawContextKey("dirtyDiffVisible", false);
let QuickDiffPickerViewItem = class extends SelectActionViewItem {
  constructor(action, contextViewService, themeService, configurationService) {
    const styles = { ...defaultSelectBoxStyles };
    const theme = themeService.getColorTheme();
    const editorBackgroundColor = theme.getColor(editorBackground);
    const peekTitleColor = theme.getColor(peekViewTitleBackground);
    const opaqueTitleColor = peekTitleColor?.makeOpaque(editorBackgroundColor) ?? editorBackgroundColor;
    styles.selectBackground = opaqueTitleColor.lighten(0.6).toString();
    super(null, action, [], 0, contextViewService, styles, { ariaLabel: nls.localize("remotes", "Switch quick diff base"), useCustomDrawn: !hasNativeContextMenu(configurationService) });
    this.optionsItems = [];
  }
  setSelection(quickDiffs, providerId) {
    this.optionsItems = quickDiffs.map((quickDiff) => ({ providerId: quickDiff.id, text: quickDiff.label }));
    const index = this.optionsItems.findIndex((item) => item.providerId === providerId);
    this.setOptions(this.optionsItems, index);
  }
  getActionContext(_, index) {
    return this.optionsItems[index];
  }
  render(container) {
    super.render(container);
    this.setFocusable(true);
  }
};
QuickDiffPickerViewItem = __decorateClass([
  __decorateParam(1, IContextViewService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IConfigurationService)
], QuickDiffPickerViewItem);
const _QuickDiffPickerBaseAction = class _QuickDiffPickerBaseAction extends Action {
  constructor(callback) {
    super(_QuickDiffPickerBaseAction.ID, _QuickDiffPickerBaseAction.LABEL, void 0, void 0);
    this.callback = callback;
  }
  async run(event) {
    return this.callback(event);
  }
};
_QuickDiffPickerBaseAction.ID = "quickDiff.base.switch";
_QuickDiffPickerBaseAction.LABEL = nls.localize("quickDiff.base.switch", "Switch Quick Diff Base");
let QuickDiffPickerBaseAction = _QuickDiffPickerBaseAction;
class QuickDiffWidgetActionRunner extends ActionRunner {
  runAction(action, context) {
    if (action instanceof MenuItemAction) {
      return action.run(...context);
    }
    return super.runAction(action, context);
  }
}
let QuickDiffWidgetEditorAction = class extends Action {
  constructor(editor, action, cssClass, keybindingService, instantiationService) {
    const label = keybindingService.appendKeybinding(action.label, action.id);
    super(action.id, label, cssClass);
    this.instantiationService = instantiationService;
    this.action = action;
    this.editor = editor;
  }
  run() {
    return Promise.resolve(this.instantiationService.invokeFunction((accessor) => this.action.run(accessor, this.editor, null)));
  }
};
QuickDiffWidgetEditorAction = __decorateClass([
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IInstantiationService)
], QuickDiffWidgetEditorAction);
let QuickDiffWidget = class extends PeekViewWidget {
  constructor(editor, model, themeService, instantiationService, menuService, contextKeyService, quickDiffService) {
    super(editor, { isResizeable: true, frameWidth: 1, keepEditorSelection: true, className: "dirty-diff" }, instantiationService);
    this.model = model;
    this.themeService = themeService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.quickDiffService = quickDiffService;
    this._index = 0;
    this._providerId = "";
    this.height = void 0;
    this._disposables.add(themeService.onDidColorThemeChange(this._applyTheme, this));
    this._applyTheme(themeService.getColorTheme());
    if (!Iterable.isEmpty(this.model.originalTextModels)) {
      contextKeyService = contextKeyService.createOverlay([
        ["originalResourceScheme", Iterable.first(this.model.originalTextModels)?.uri.scheme],
        ["originalResourceSchemes", Iterable.map(this.model.originalTextModels, (textModel) => textModel.uri.scheme)]
      ]);
    }
    this.create();
    if (editor.hasModel()) {
      this.title = basename(editor.getModel().uri);
    } else {
      this.title = "";
    }
    this.setTitle(this.title);
  }
  get providerId() {
    return this._providerId;
  }
  get index() {
    return this._index;
  }
  get visibleRange() {
    const visibleRanges = this.diffEditor.getModifiedEditor().getVisibleRanges();
    return visibleRanges.length >= 0 ? visibleRanges[0] : void 0;
  }
  showChange(index, usePosition = true) {
    const labeledChange = this.model.changes[index];
    const change = labeledChange.change;
    this._index = index;
    this.contextKeyService.createKey("originalResource", this.model.changes[index].original.toString());
    this.contextKeyService.createKey("originalResourceScheme", this.model.changes[index].original.scheme);
    this.updateActions();
    this.change = change;
    this._providerId = labeledChange.providerId;
    if (Iterable.isEmpty(this.model.originalTextModels)) {
      return;
    }
    const onFirstDiffUpdate = Event.once(this.diffEditor.onDidUpdateDiff);
    onFirstDiffUpdate(() => setTimeout(() => this.revealChange(change), 0));
    const diffEditorModel = this.model.getDiffEditorModel(labeledChange.original);
    if (!diffEditorModel) {
      return;
    }
    this.diffEditor.setModel(diffEditorModel);
    const position = new Position(getModifiedEndLineNumber(change), 1);
    const lineHeight = this.editor.getOption(EditorOption.lineHeight);
    const editorHeight = this.editor.getLayoutInfo().height;
    const editorHeightInLines = Math.floor(editorHeight / lineHeight);
    const height = Math.min(
      getChangeHeight(change) + 2 + 6,
      Math.floor(editorHeightInLines / 3)
    );
    this.renderTitle();
    this.updateDropdown();
    const changeType = getChangeType(change);
    const changeTypeColor = getChangeTypeColor(this.themeService.getColorTheme(), changeType);
    this.style({ frameColor: changeTypeColor, arrowColor: changeTypeColor });
    const providerSpecificChanges = [];
    let contextIndex = index;
    for (const change2 of this.model.changes) {
      if (change2.providerId === this.model.changes[this._index].providerId) {
        providerSpecificChanges.push(change2.change);
        if (labeledChange === change2) {
          contextIndex = providerSpecificChanges.length - 1;
        }
      }
    }
    this._actionbarWidget.context = [diffEditorModel.modified.uri, providerSpecificChanges, contextIndex];
    if (usePosition) {
      this.show(position, height + 1 / lineHeight);
      this.editor.setPosition(position);
      this.editor.focus();
    }
  }
  renderTitle() {
    const providerChanges = this.model.quickDiffChanges.get(this._providerId);
    const providerIndex = providerChanges.indexOf(this._index);
    let detail;
    if (!this.shouldUseDropdown()) {
      const label = this.model.quickDiffs.find((quickDiff) => quickDiff.id === this._providerId)?.label ?? "";
      detail = this.model.changes.length > 1 ? nls.localize("changes", "{0} - {1} of {2} changes", label, providerIndex + 1, providerChanges.length) : nls.localize("change", "{0} - {1} of {2} change", label, providerIndex + 1, providerChanges.length);
      this.dropdownContainer.style.display = "none";
    } else {
      detail = this.model.changes.length > 1 ? nls.localize("multiChanges", "{0} of {1} changes", providerIndex + 1, providerChanges.length) : nls.localize("multiChange", "{0} of {1} change", providerIndex + 1, providerChanges.length);
      this.dropdownContainer.style.display = "inherit";
    }
    this.setTitle(this.title, detail);
  }
  switchQuickDiff(event) {
    const newProviderId = event?.providerId;
    if (newProviderId === this.model.changes[this._index].providerId) {
      return;
    }
    let closestGreaterIndex = this._index < this.model.changes.length - 1 ? this._index + 1 : 0;
    for (let i = closestGreaterIndex; i !== this._index; i < this.model.changes.length - 1 ? i++ : i = 0) {
      if (this.model.changes[i].providerId === newProviderId) {
        closestGreaterIndex = i;
        break;
      }
    }
    let closestLesserIndex = this._index > 0 ? this._index - 1 : this.model.changes.length - 1;
    for (let i = closestLesserIndex; i !== this._index; i > 0 ? i-- : i = this.model.changes.length - 1) {
      if (this.model.changes[i].providerId === newProviderId) {
        closestLesserIndex = i;
        break;
      }
    }
    const closestIndex = Math.abs(this.model.changes[closestGreaterIndex].change.modifiedEndLineNumber - this.model.changes[this._index].change.modifiedEndLineNumber) < Math.abs(this.model.changes[closestLesserIndex].change.modifiedEndLineNumber - this.model.changes[this._index].change.modifiedEndLineNumber) ? closestGreaterIndex : closestLesserIndex;
    this.showChange(closestIndex, false);
  }
  shouldUseDropdown() {
    const quickDiffs = this.getQuickDiffsContainingChange();
    return quickDiffs.length > 1;
  }
  updateActions() {
    if (!this._actionbarWidget) {
      return;
    }
    const previous = this.instantiationService.createInstance(QuickDiffWidgetEditorAction, this.editor, new ShowPreviousChangeAction(this.editor), ThemeIcon.asClassName(gotoPreviousLocation));
    const next = this.instantiationService.createInstance(QuickDiffWidgetEditorAction, this.editor, new ShowNextChangeAction(this.editor), ThemeIcon.asClassName(gotoNextLocation));
    this._disposables.add(previous);
    this._disposables.add(next);
    if (this.menu) {
      this.menu.dispose();
    }
    this.menu = this.menuService.createMenu(MenuId.SCMChangeContext, this.contextKeyService);
    const actions = getFlatActionBarActions(this.menu.getActions({ shouldForwardArgs: true }));
    this._actionbarWidget.clear();
    this._actionbarWidget.push(actions.reverse(), { label: false, icon: true });
    this._actionbarWidget.push([next, previous], { label: false, icon: true });
    this._actionbarWidget.push(this._disposables.add(new Action("peekview.close", nls.localize("label.close", "Close"), ThemeIcon.asClassName(Codicon.close), true, () => this.dispose())), { label: false, icon: true });
  }
  updateDropdown() {
    const quickDiffs = this.getQuickDiffsContainingChange();
    this.dropdown?.setSelection(quickDiffs, this._providerId);
  }
  getQuickDiffsContainingChange() {
    const change = this.model.changes[this._index];
    const quickDiffsWithChange = this.model.changes.filter((c) => change.change2.modified.intersectsOrTouches(c.change2.modified)).map((c) => c.providerId);
    return this.model.quickDiffs.filter((quickDiff) => quickDiffsWithChange.includes(quickDiff.id) && this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id));
  }
  _fillHead(container) {
    super._fillHead(container, true);
    const action = new QuickDiffPickerBaseAction((event) => this.switchQuickDiff(event));
    this._disposables.add(action);
    this.dropdownContainer = dom.prepend(this._titleElement, dom.$(".dropdown"));
    this.dropdown = this.instantiationService.createInstance(QuickDiffPickerViewItem, action);
    this.dropdown.render(this.dropdownContainer);
  }
  _getActionBarOptions() {
    const actionRunner = new QuickDiffWidgetActionRunner();
    this._disposables.add(actionRunner);
    this._disposables.add(actionRunner.onDidRun((e) => {
      if (!(e.action instanceof QuickDiffWidgetEditorAction) && !e.error) {
        this.dispose();
      }
    }));
    return {
      ...super._getActionBarOptions(),
      actionRunner
    };
  }
  _fillBody(container) {
    const options = {
      diffAlgorithm: "advanced",
      fixedOverflowWidgets: true,
      ignoreTrimWhitespace: false,
      minimap: { enabled: false },
      readOnly: false,
      renderGutterMenu: false,
      renderIndicators: false,
      renderOverviewRuler: false,
      renderSideBySide: false,
      scrollbar: {
        verticalScrollbarSize: 14,
        horizontal: "auto",
        useShadows: true,
        verticalHasArrows: false,
        horizontalHasArrows: false
      },
      scrollBeyondLastLine: false,
      stickyScroll: { enabled: false }
    };
    this.diffEditor = this.instantiationService.createInstance(EmbeddedDiffEditorWidget, container, options, {}, this.editor);
    this._disposables.add(this.diffEditor);
  }
  _onWidth(width) {
    if (typeof this.height === "undefined") {
      return;
    }
    this.diffEditor.layout({ height: this.height, width });
  }
  _doLayoutBody(height, width) {
    super._doLayoutBody(height, width);
    this.diffEditor.layout({ height, width });
    if (typeof this.height === "undefined" && this.change) {
      this.revealChange(this.change);
    }
    this.height = height;
  }
  revealChange(change) {
    let start, end;
    if (change.modifiedEndLineNumber === 0) {
      start = change.modifiedStartLineNumber;
      end = change.modifiedStartLineNumber + 1;
    } else if (change.originalEndLineNumber > 0) {
      start = change.modifiedStartLineNumber - 1;
      end = change.modifiedEndLineNumber + 1;
    } else {
      start = change.modifiedStartLineNumber;
      end = change.modifiedEndLineNumber;
    }
    this.diffEditor.revealLinesInCenter(start, end, ScrollType.Immediate);
  }
  _applyTheme(theme) {
    const borderColor = theme.getColor(peekViewBorder) || Color.transparent;
    this.style({
      arrowColor: borderColor,
      frameColor: borderColor,
      headerBackgroundColor: theme.getColor(peekViewTitleBackground) || Color.transparent,
      primaryHeadingColor: theme.getColor(peekViewTitleForeground),
      secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
    });
  }
  revealRange(range) {
    this.editor.revealLineInCenterIfOutsideViewport(range.endLineNumber, ScrollType.Smooth);
  }
  hasFocus() {
    return this.diffEditor.hasTextFocus();
  }
  toggleFocus() {
    if (this.diffEditor.hasTextFocus()) {
      this.editor.focus();
    } else {
      this.diffEditor.focus();
    }
  }
  dispose() {
    this.dropdown?.dispose();
    this.menu?.dispose();
    super.dispose();
  }
};
QuickDiffWidget = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IQuickDiffService)
], QuickDiffWidget);
let QuickDiffEditorController = class extends Disposable {
  constructor(editor, contextKeyService, configurationService, quickDiffModelService, instantiationService) {
    super();
    this.editor = editor;
    this.configurationService = configurationService;
    this.quickDiffModelService = quickDiffModelService;
    this.instantiationService = instantiationService;
    this.model = null;
    this.widget = null;
    this.session = Disposable.None;
    this.mouseDownInfo = null;
    this.enabled = false;
    this.gutterActionDisposables = new DisposableStore();
    this.enabled = !contextKeyService.getContextKeyValue("isInDiffEditor");
    this.stylesheet = domStylesheetsJs.createStyleSheet(void 0, void 0, this._store);
    if (this.enabled) {
      this.isQuickDiffVisible = isQuickDiffVisible.bindTo(contextKeyService);
      this._register(editor.onDidChangeModel(() => this.close()));
      const onDidChangeGutterAction = Event.filter(configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("scm.diffDecorationsGutterAction"));
      this._register(onDidChangeGutterAction(this.onDidChangeGutterAction, this));
      this.onDidChangeGutterAction();
    }
  }
  static get(editor) {
    return editor.getContribution(QuickDiffEditorController.ID);
  }
  onDidChangeGutterAction() {
    const gutterAction = this.configurationService.getValue("scm.diffDecorationsGutterAction");
    this.gutterActionDisposables.clear();
    if (gutterAction === "diff") {
      this.gutterActionDisposables.add(this.editor.onMouseDown((e) => this.onEditorMouseDown(e)));
      this.gutterActionDisposables.add(this.editor.onMouseUp((e) => this.onEditorMouseUp(e)));
      this.stylesheet.textContent = `
				.monaco-editor .dirty-diff-glyph {
					cursor: pointer;
				}

				.monaco-editor .margin-view-overlays .dirty-diff-glyph:hover::before {
					height: 100%;
					width: 6px;
					left: -6px;
				}

				.monaco-editor .margin-view-overlays .dirty-diff-deleted:hover::after {
					bottom: 0;
					border-top-width: 0;
					border-bottom-width: 0;
				}
			`;
    } else {
      this.stylesheet.textContent = ``;
    }
  }
  canNavigate() {
    return !this.widget || this.widget?.index === -1 || !!this.model && this.model.changes.length > 1;
  }
  refresh() {
    this.widget?.showChange(this.widget.index, false);
  }
  toggleFocus() {
    if (this.widget) {
      this.widget.toggleFocus();
    }
  }
  next(lineNumber) {
    if (!this.assertWidget()) {
      return;
    }
    if (!this.widget || !this.model) {
      return;
    }
    let index;
    if (this.editor.hasModel() && (typeof lineNumber === "number" || !this.widget.providerId)) {
      index = this.model.findNextClosestChange(typeof lineNumber === "number" ? lineNumber : this.editor.getPosition().lineNumber, true, this.widget.providerId);
    } else {
      const providerChanges = this.model.quickDiffChanges.get(this.widget.providerId) ?? this.model.quickDiffChanges.values().next().value;
      const mapIndex = providerChanges.findIndex((value) => value === this.widget.index);
      index = providerChanges[rot(mapIndex + 1, providerChanges.length)];
    }
    this.widget.showChange(index);
  }
  previous(lineNumber) {
    if (!this.assertWidget()) {
      return;
    }
    if (!this.widget || !this.model) {
      return;
    }
    let index;
    if (this.editor.hasModel() && (typeof lineNumber === "number" || !this.widget.providerId)) {
      index = this.model.findPreviousClosestChange(typeof lineNumber === "number" ? lineNumber : this.editor.getPosition().lineNumber, true, this.widget.providerId);
    } else {
      const providerChanges = this.model.quickDiffChanges.get(this.widget.providerId) ?? this.model.quickDiffChanges.values().next().value;
      const mapIndex = providerChanges.findIndex((value) => value === this.widget.index);
      index = providerChanges[rot(mapIndex - 1, providerChanges.length)];
    }
    this.widget.showChange(index);
  }
  close() {
    this.session.dispose();
    this.session = Disposable.None;
  }
  assertWidget() {
    if (!this.enabled) {
      return false;
    }
    if (this.widget) {
      if (!this.model || this.model.changes.length === 0) {
        this.close();
        return false;
      }
      return true;
    }
    const editorModel = this.editor.getModel();
    if (!editorModel) {
      return false;
    }
    const modelRef = this.quickDiffModelService.createQuickDiffModelReference(editorModel.uri);
    if (!modelRef) {
      return false;
    }
    if (modelRef.object.changes.length === 0) {
      modelRef.dispose();
      return false;
    }
    this.model = modelRef.object;
    this.widget = this.instantiationService.createInstance(QuickDiffWidget, this.editor, this.model);
    this.isQuickDiffVisible.set(true);
    const disposables = new DisposableStore();
    disposables.add(Event.once(this.widget.onDidClose)(this.close, this));
    const onDidModelChange = Event.chain(
      this.model.onDidChange,
      ($) => $.filter((e) => e.diff.length > 0).map((e) => e.diff)
    );
    onDidModelChange(this.onDidModelChange, this, disposables);
    disposables.add(modelRef);
    disposables.add(this.widget);
    disposables.add(toDisposable(() => {
      this.model = null;
      this.widget = null;
      this.isQuickDiffVisible.set(false);
      this.editor.focus();
    }));
    this.session = disposables;
    return true;
  }
  onDidModelChange(splices) {
    if (!this.model || !this.widget || this.widget.hasFocus()) {
      return;
    }
    for (const splice of splices) {
      if (splice.start <= this.widget.index) {
        this.next();
        return;
      }
    }
    this.refresh();
  }
  onEditorMouseDown(e) {
    this.mouseDownInfo = null;
    const range = e.target.range;
    if (!range) {
      return;
    }
    if (!e.event.leftButton) {
      return;
    }
    if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
      return;
    }
    if (!e.target.element) {
      return;
    }
    if (e.target.element.className.indexOf("dirty-diff-glyph") < 0) {
      return;
    }
    const data = e.target.detail;
    const offsetLeftInGutter = e.target.element.offsetLeft;
    const gutterOffsetX = data.offsetX - offsetLeftInGutter;
    if (gutterOffsetX < -3 || gutterOffsetX > 3) {
      return;
    }
    this.mouseDownInfo = { lineNumber: range.startLineNumber };
  }
  onEditorMouseUp(e) {
    if (!this.mouseDownInfo) {
      return;
    }
    const { lineNumber } = this.mouseDownInfo;
    this.mouseDownInfo = null;
    const range = e.target.range;
    if (!range || range.startLineNumber !== lineNumber) {
      return;
    }
    if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
      return;
    }
    const editorModel = this.editor.getModel();
    if (!editorModel) {
      return;
    }
    const modelRef = this.quickDiffModelService.createQuickDiffModelReference(editorModel.uri);
    if (!modelRef) {
      return;
    }
    try {
      const index = modelRef.object.changes.findIndex((change) => lineIntersectsChange(lineNumber, change.change));
      if (index < 0) {
        return;
      }
      if (index === this.widget?.index) {
        this.close();
      } else {
        this.next(lineNumber);
      }
    } finally {
      modelRef.dispose();
    }
  }
  dispose() {
    this.gutterActionDisposables.dispose();
    super.dispose();
  }
};
QuickDiffEditorController.ID = "editor.contrib.quickdiff";
QuickDiffEditorController = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IQuickDiffModelService),
  __decorateParam(4, IInstantiationService)
], QuickDiffEditorController);
class ShowPreviousChangeAction extends EditorAction {
  constructor(outerEditor) {
    super({
      id: "editor.action.dirtydiff.previous",
      label: nls.localize2("show previous change", "Show Previous Change"),
      precondition: TextCompareEditorActiveContext.toNegated(),
      kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F3, weight: KeybindingWeight.EditorContrib }
    });
    this.outerEditor = outerEditor;
  }
  run(accessor) {
    const outerEditor = this.outerEditor ?? getOuterEditorFromDiffEditor(accessor);
    if (!outerEditor) {
      return;
    }
    const controller = QuickDiffEditorController.get(outerEditor);
    if (!controller) {
      return;
    }
    if (!controller.canNavigate()) {
      return;
    }
    controller.previous();
  }
}
registerEditorAction(ShowPreviousChangeAction);
class ShowNextChangeAction extends EditorAction {
  constructor(outerEditor) {
    super({
      id: "editor.action.dirtydiff.next",
      label: nls.localize2("show next change", "Show Next Change"),
      precondition: TextCompareEditorActiveContext.toNegated(),
      kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Alt | KeyCode.F3, weight: KeybindingWeight.EditorContrib }
    });
    this.outerEditor = outerEditor;
  }
  run(accessor) {
    const outerEditor = this.outerEditor ?? getOuterEditorFromDiffEditor(accessor);
    if (!outerEditor) {
      return;
    }
    const controller = QuickDiffEditorController.get(outerEditor);
    if (!controller) {
      return;
    }
    if (!controller.canNavigate()) {
      return;
    }
    controller.next();
  }
}
registerEditorAction(ShowNextChangeAction);
class GotoPreviousChangeAction extends EditorAction {
  constructor() {
    super({
      id: "workbench.action.editor.previousChange",
      label: nls.localize2("move to previous change", "Go to Previous Change"),
      precondition: ContextKeyExpr.and(TextCompareEditorActiveContext.toNegated(), quickDiffDecorationCount.notEqualsTo(0)),
      kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F5, weight: KeybindingWeight.EditorContrib }
    });
  }
  async run(accessor) {
    const outerEditor = getOuterEditorFromDiffEditor(accessor);
    const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
    const accessibilityService = accessor.get(IAccessibilityService);
    const codeEditorService = accessor.get(ICodeEditorService);
    const quickDiffModelService = accessor.get(IQuickDiffModelService);
    if (!outerEditor || !outerEditor.hasModel()) {
      return;
    }
    const modelRef = quickDiffModelService.createQuickDiffModelReference(outerEditor.getModel().uri);
    try {
      if (!modelRef || modelRef.object.changes.length === 0) {
        return;
      }
      const lineNumber = outerEditor.getPosition().lineNumber;
      const index = modelRef.object.findPreviousClosestChange(lineNumber, false);
      const change = modelRef.object.changes[index];
      await playAccessibilitySymbolForChange(change.change, accessibilitySignalService);
      setPositionAndSelection(change.change, outerEditor, accessibilityService, codeEditorService);
    } finally {
      modelRef?.dispose();
    }
  }
}
registerEditorAction(GotoPreviousChangeAction);
class GotoNextChangeAction extends EditorAction {
  constructor() {
    super({
      id: "workbench.action.editor.nextChange",
      label: nls.localize2("move to next change", "Go to Next Change"),
      precondition: ContextKeyExpr.and(TextCompareEditorActiveContext.toNegated(), quickDiffDecorationCount.notEqualsTo(0)),
      kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Alt | KeyCode.F5, weight: KeybindingWeight.EditorContrib }
    });
  }
  async run(accessor) {
    const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
    const outerEditor = getOuterEditorFromDiffEditor(accessor);
    const accessibilityService = accessor.get(IAccessibilityService);
    const codeEditorService = accessor.get(ICodeEditorService);
    const quickDiffModelService = accessor.get(IQuickDiffModelService);
    if (!outerEditor || !outerEditor.hasModel()) {
      return;
    }
    const modelRef = quickDiffModelService.createQuickDiffModelReference(outerEditor.getModel().uri);
    try {
      if (!modelRef || modelRef.object.changes.length === 0) {
        return;
      }
      const lineNumber = outerEditor.getPosition().lineNumber;
      const index = modelRef.object.findNextClosestChange(lineNumber, false);
      const change = modelRef.object.changes[index].change;
      await playAccessibilitySymbolForChange(change, accessibilitySignalService);
      setPositionAndSelection(change, outerEditor, accessibilityService, codeEditorService);
    } finally {
      modelRef?.dispose();
    }
  }
}
registerEditorAction(GotoNextChangeAction);
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
  group: "7_change_nav",
  command: {
    id: "editor.action.dirtydiff.next",
    title: nls.localize({ key: "miGotoNextChange", comment: ["&& denotes a mnemonic"] }, "Next &&Change")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
  group: "7_change_nav",
  command: {
    id: "editor.action.dirtydiff.previous",
    title: nls.localize({ key: "miGotoPreviousChange", comment: ["&& denotes a mnemonic"] }, "Previous &&Change")
  },
  order: 2
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "closeQuickDiff",
  weight: KeybindingWeight.EditorContrib + 50,
  primary: KeyCode.Escape,
  secondary: [KeyMod.Shift | KeyCode.Escape],
  when: ContextKeyExpr.and(isQuickDiffVisible),
  handler: (accessor) => {
    const outerEditor = getOuterEditorFromDiffEditor(accessor);
    if (!outerEditor) {
      return;
    }
    const controller = QuickDiffEditorController.get(outerEditor);
    if (!controller) {
      return;
    }
    controller.close();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "toggleQuickDiffWidgetFocus",
  weight: KeybindingWeight.EditorContrib,
  primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.F2),
  when: isQuickDiffVisible,
  handler: (accessor) => {
    const outerEditor = getOuterEditorFromDiffEditor(accessor);
    if (!outerEditor) {
      return;
    }
    const controller = QuickDiffEditorController.get(outerEditor);
    if (!controller) {
      return;
    }
    controller.toggleFocus();
  }
});
function setPositionAndSelection(change, editor, accessibilityService, codeEditorService) {
  const position = new Position(change.modifiedStartLineNumber, 1);
  editor.setPosition(position);
  editor.revealPositionInCenter(position);
  if (accessibilityService.isScreenReaderOptimized()) {
    editor.setSelection({ startLineNumber: change.modifiedStartLineNumber, startColumn: 0, endLineNumber: change.modifiedStartLineNumber, endColumn: Number.MAX_VALUE });
    codeEditorService.getActiveCodeEditor()?.writeScreenReaderContent("diff-navigation");
  }
}
async function playAccessibilitySymbolForChange(change, accessibilitySignalService) {
  const changeType = getChangeType(change);
  switch (changeType) {
    case ChangeType.Add:
      accessibilitySignalService.playSignal(AccessibilitySignal.diffLineInserted, { allowManyInParallel: true, source: "quickDiffDecoration" });
      break;
    case ChangeType.Delete:
      accessibilitySignalService.playSignal(AccessibilitySignal.diffLineDeleted, { allowManyInParallel: true, source: "quickDiffDecoration" });
      break;
    case ChangeType.Modify:
      accessibilitySignalService.playSignal(AccessibilitySignal.diffLineModified, { allowManyInParallel: true, source: "quickDiffDecoration" });
      break;
  }
}
function getOuterEditorFromDiffEditor(accessor) {
  const diffEditors = accessor.get(ICodeEditorService).listDiffEditors();
  for (const diffEditor of diffEditors) {
    if (diffEditor.hasTextFocus() && diffEditor instanceof EmbeddedDiffEditorWidget) {
      return diffEditor.getParentEditor();
    }
  }
  return getOuterEditor(accessor);
}
export {
  GotoNextChangeAction,
  GotoPreviousChangeAction,
  QuickDiffEditorController,
  QuickDiffPickerBaseAction,
  QuickDiffPickerViewItem,
  ShowNextChangeAction,
  ShowPreviousChangeAction,
  isQuickDiffVisible
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9icm93c2VyL3F1aWNrRGlmZldpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgZG9tU3R5bGVzaGVldHNKcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBBY3Rpb25SdW5uZXIsIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSVNlbGVjdE9wdGlvbkl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2VsZWN0Qm94L3NlbGVjdEJveC5qcyc7XG5pbXBvcnQgeyBTZWxlY3RBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IGRlZmF1bHRTZWxlY3RCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUNvbG9yVGhlbWUsIElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHBlZWtWaWV3Qm9yZGVyLCBwZWVrVmlld1RpdGxlQmFja2dyb3VuZCwgcGVla1ZpZXdUaXRsZUZvcmVncm91bmQsIHBlZWtWaWV3VGl0bGVJbmZvRm9yZWdyb3VuZCwgUGVla1ZpZXdXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9wZWVrVmlldy9icm93c2VyL3BlZWtWaWV3LmpzJztcbmltcG9ydCB7IGVkaXRvckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTWVudSwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uLCBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJRWRpdG9yTW91c2VFdmVudCwgTW91c2VUYXJnZXRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIHJlZ2lzdGVyRWRpdG9yQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgRW1iZWRkZWREaWZmRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvZW1iZWRkZWREaWZmRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24sIFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tEaWZmTW9kZWxTZXJ2aWNlLCBRdWlja0RpZmZNb2RlbCB9IGZyb20gJy4vcXVpY2tEaWZmTW9kZWwuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IHJvdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgSVNwbGljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NlcXVlbmNlLmpzJztcbmltcG9ydCB7IENoYW5nZVR5cGUsIGdldENoYW5nZUhlaWdodCwgZ2V0Q2hhbmdlVHlwZSwgZ2V0Q2hhbmdlVHlwZUNvbG9yLCBnZXRNb2RpZmllZEVuZExpbmVOdW1iZXIsIElRdWlja0RpZmZTZXJ2aWNlLCBsaW5lSW50ZXJzZWN0c0NoYW5nZSwgUXVpY2tEaWZmLCBRdWlja0RpZmZDaGFuZ2UgfSBmcm9tICcuLi9jb21tb24vcXVpY2tEaWZmLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRleHRDb21wYXJlRWRpdG9yQWN0aXZlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNoYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZGlmZi9sZWdhY3lMaW5lc0RpZmZDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiwgSURpZmZFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uQmFyT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBnb3RvTmV4dExvY2F0aW9uLCBnb3RvUHJldmlvdXNMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGdldE91dGVyRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvZW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IHF1aWNrRGlmZkRlY29yYXRpb25Db3VudCB9IGZyb20gJy4vcXVpY2tEaWZmRGVjb3JhdG9yLmpzJztcbmltcG9ydCB7IGhhc05hdGl2ZUNvbnRleHRNZW51IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuXG5leHBvcnQgY29uc3QgaXNRdWlja0RpZmZWaXNpYmxlID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2RpcnR5RGlmZlZpc2libGUnLCBmYWxzZSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVF1aWNrRGlmZlNlbGVjdEl0ZW0gZXh0ZW5kcyBJU2VsZWN0T3B0aW9uSXRlbSB7XG5cdHByb3ZpZGVySWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFF1aWNrRGlmZlBpY2tlclZpZXdJdGVtIGV4dGVuZHMgU2VsZWN0QWN0aW9uVmlld0l0ZW08SVF1aWNrRGlmZlNlbGVjdEl0ZW0+IHtcblx0cHJpdmF0ZSBvcHRpb25zSXRlbXM6IElRdWlja0RpZmZTZWxlY3RJdGVtW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IHN0eWxlcyA9IHsgLi4uZGVmYXVsdFNlbGVjdEJveFN0eWxlcyB9O1xuXHRcdGNvbnN0IHRoZW1lID0gdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRjb25zdCBlZGl0b3JCYWNrZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JCYWNrZ3JvdW5kKTtcblx0XHRjb25zdCBwZWVrVGl0bGVDb2xvciA9IHRoZW1lLmdldENvbG9yKHBlZWtWaWV3VGl0bGVCYWNrZ3JvdW5kKTtcblx0XHRjb25zdCBvcGFxdWVUaXRsZUNvbG9yID0gcGVla1RpdGxlQ29sb3I/Lm1ha2VPcGFxdWUoZWRpdG9yQmFja2dyb3VuZENvbG9yISkgPz8gZWRpdG9yQmFja2dyb3VuZENvbG9yITtcblx0XHRzdHlsZXMuc2VsZWN0QmFja2dyb3VuZCA9IG9wYXF1ZVRpdGxlQ29sb3IubGlnaHRlbiguNikudG9TdHJpbmcoKTtcblx0XHRzdXBlcihudWxsLCBhY3Rpb24sIFtdLCAwLCBjb250ZXh0Vmlld1NlcnZpY2UsIHN0eWxlcywgeyBhcmlhTGFiZWw6IG5scy5sb2NhbGl6ZSgncmVtb3RlcycsICdTd2l0Y2ggcXVpY2sgZGlmZiBiYXNlJyksIHVzZUN1c3RvbURyYXduOiAhaGFzTmF0aXZlQ29udGV4dE1lbnUoY29uZmlndXJhdGlvblNlcnZpY2UpIH0pO1xuXHR9XG5cblx0cHVibGljIHNldFNlbGVjdGlvbihxdWlja0RpZmZzOiBRdWlja0RpZmZbXSwgcHJvdmlkZXJJZDogc3RyaW5nKSB7XG5cdFx0dGhpcy5vcHRpb25zSXRlbXMgPSBxdWlja0RpZmZzLm1hcChxdWlja0RpZmYgPT4gKHsgcHJvdmlkZXJJZDogcXVpY2tEaWZmLmlkLCB0ZXh0OiBxdWlja0RpZmYubGFiZWwgfSkpO1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5vcHRpb25zSXRlbXMuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS5wcm92aWRlcklkID09PSBwcm92aWRlcklkKTtcblx0XHR0aGlzLnNldE9wdGlvbnModGhpcy5vcHRpb25zSXRlbXMsIGluZGV4KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRBY3Rpb25Db250ZXh0KF86IHN0cmluZywgaW5kZXg6IG51bWJlcik6IElRdWlja0RpZmZTZWxlY3RJdGVtIHtcblx0XHRyZXR1cm4gdGhpcy5vcHRpb25zSXRlbXNbaW5kZXhdO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHR0aGlzLnNldEZvY3VzYWJsZSh0cnVlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUXVpY2tEaWZmUGlja2VyQmFzZUFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdxdWlja0RpZmYuYmFzZS5zd2l0Y2gnO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IExBQkVMID0gbmxzLmxvY2FsaXplKCdxdWlja0RpZmYuYmFzZS5zd2l0Y2gnLCBcIlN3aXRjaCBRdWljayBEaWZmIEJhc2VcIik7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBjYWxsYmFjazogKGV2ZW50PzogSVF1aWNrRGlmZlNlbGVjdEl0ZW0pID0+IHZvaWQpIHtcblx0XHRzdXBlcihRdWlja0RpZmZQaWNrZXJCYXNlQWN0aW9uLklELCBRdWlja0RpZmZQaWNrZXJCYXNlQWN0aW9uLkxBQkVMLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oZXZlbnQ/OiBJUXVpY2tEaWZmU2VsZWN0SXRlbSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmNhbGxiYWNrKGV2ZW50KTtcblx0fVxufVxuXG5jbGFzcyBRdWlja0RpZmZXaWRnZXRBY3Rpb25SdW5uZXIgZXh0ZW5kcyBBY3Rpb25SdW5uZXIge1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBydW5BY3Rpb24oYWN0aW9uOiBJQWN0aW9uLCBjb250ZXh0OiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdHJldHVybiBhY3Rpb24ucnVuKC4uLmNvbnRleHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5ydW5BY3Rpb24oYWN0aW9uLCBjb250ZXh0KTtcblx0fVxufVxuXG5jbGFzcyBRdWlja0RpZmZXaWRnZXRFZGl0b3JBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdHByaXZhdGUgZWRpdG9yOiBJQ29kZUVkaXRvcjtcblx0cHJpdmF0ZSBhY3Rpb246IEVkaXRvckFjdGlvbjtcblx0cHJpdmF0ZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0YWN0aW9uOiBFZGl0b3JBY3Rpb24sXG5cdFx0Y3NzQ2xhc3M6IHN0cmluZyxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdGNvbnN0IGxhYmVsID0ga2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyhhY3Rpb24ubGFiZWwsIGFjdGlvbi5pZCk7XG5cblx0XHRzdXBlcihhY3Rpb24uaWQsIGxhYmVsLCBjc3NDbGFzcyk7XG5cblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0dGhpcy5hY3Rpb24gPSBhY3Rpb247XG5cdFx0dGhpcy5lZGl0b3IgPSBlZGl0b3I7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHRoaXMuYWN0aW9uLnJ1bihhY2Nlc3NvciwgdGhpcy5lZGl0b3IsIG51bGwpKSk7XG5cdH1cbn1cblxuY2xhc3MgUXVpY2tEaWZmV2lkZ2V0IGV4dGVuZHMgUGVla1ZpZXdXaWRnZXQge1xuXG5cdHByaXZhdGUgZGlmZkVkaXRvciE6IEVtYmVkZGVkRGlmZkVkaXRvcldpZGdldDtcblx0cHJpdmF0ZSB0aXRsZTogc3RyaW5nO1xuXHRwcml2YXRlIG1lbnU6IElNZW51IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pbmRleDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfcHJvdmlkZXJJZDogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgY2hhbmdlOiBJQ2hhbmdlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGRyb3Bkb3duOiBRdWlja0RpZmZQaWNrZXJWaWV3SXRlbSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkcm9wZG93bkNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIG1vZGVsOiBRdWlja0RpZmZNb2RlbCxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElRdWlja0RpZmZTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tEaWZmU2VydmljZTogSVF1aWNrRGlmZlNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yLCB7IGlzUmVzaXplYWJsZTogdHJ1ZSwgZnJhbWVXaWR0aDogMSwga2VlcEVkaXRvclNlbGVjdGlvbjogdHJ1ZSwgY2xhc3NOYW1lOiAnZGlydHktZGlmZicgfSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UodGhpcy5fYXBwbHlUaGVtZSwgdGhpcykpO1xuXHRcdHRoaXMuX2FwcGx5VGhlbWUodGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSk7XG5cblx0XHRpZiAoIUl0ZXJhYmxlLmlzRW1wdHkodGhpcy5tb2RlbC5vcmlnaW5hbFRleHRNb2RlbHMpKSB7XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoW1xuXHRcdFx0XHRbJ29yaWdpbmFsUmVzb3VyY2VTY2hlbWUnLCBJdGVyYWJsZS5maXJzdCh0aGlzLm1vZGVsLm9yaWdpbmFsVGV4dE1vZGVscyk/LnVyaS5zY2hlbWVdLFxuXHRcdFx0XHRbJ29yaWdpbmFsUmVzb3VyY2VTY2hlbWVzJywgSXRlcmFibGUubWFwKHRoaXMubW9kZWwub3JpZ2luYWxUZXh0TW9kZWxzLCB0ZXh0TW9kZWwgPT4gdGV4dE1vZGVsLnVyaS5zY2hlbWUpXV0pO1xuXHRcdH1cblxuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdFx0aWYgKGVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHR0aGlzLnRpdGxlID0gYmFzZW5hbWUoZWRpdG9yLmdldE1vZGVsKCkudXJpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50aXRsZSA9ICcnO1xuXHRcdH1cblx0XHR0aGlzLnNldFRpdGxlKHRoaXMudGl0bGUpO1xuXHR9XG5cblx0Z2V0IHByb3ZpZGVySWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvdmlkZXJJZDtcblx0fVxuXG5cdGdldCBpbmRleCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9pbmRleDtcblx0fVxuXG5cdGdldCB2aXNpYmxlUmFuZ2UoKTogUmFuZ2UgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZpc2libGVSYW5nZXMgPSB0aGlzLmRpZmZFZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKS5nZXRWaXNpYmxlUmFuZ2VzKCk7XG5cdFx0cmV0dXJuIHZpc2libGVSYW5nZXMubGVuZ3RoID49IDAgPyB2aXNpYmxlUmFuZ2VzWzBdIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0c2hvd0NoYW5nZShpbmRleDogbnVtYmVyLCB1c2VQb3NpdGlvbjogYm9vbGVhbiA9IHRydWUpOiB2b2lkIHtcblx0XHRjb25zdCBsYWJlbGVkQ2hhbmdlID0gdGhpcy5tb2RlbC5jaGFuZ2VzW2luZGV4XTtcblx0XHRjb25zdCBjaGFuZ2UgPSBsYWJlbGVkQ2hhbmdlLmNoYW5nZTtcblx0XHR0aGlzLl9pbmRleCA9IGluZGV4O1xuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCdvcmlnaW5hbFJlc291cmNlJywgdGhpcy5tb2RlbC5jaGFuZ2VzW2luZGV4XS5vcmlnaW5hbC50b1N0cmluZygpKTtcblx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleSgnb3JpZ2luYWxSZXNvdXJjZVNjaGVtZScsIHRoaXMubW9kZWwuY2hhbmdlc1tpbmRleF0ub3JpZ2luYWwuc2NoZW1lKTtcblx0XHR0aGlzLnVwZGF0ZUFjdGlvbnMoKTtcblxuXHRcdHRoaXMuY2hhbmdlID0gY2hhbmdlO1xuXHRcdHRoaXMuX3Byb3ZpZGVySWQgPSBsYWJlbGVkQ2hhbmdlLnByb3ZpZGVySWQ7XG5cblx0XHRpZiAoSXRlcmFibGUuaXNFbXB0eSh0aGlzLm1vZGVsLm9yaWdpbmFsVGV4dE1vZGVscykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvbkZpcnN0RGlmZlVwZGF0ZSA9IEV2ZW50Lm9uY2UodGhpcy5kaWZmRWRpdG9yLm9uRGlkVXBkYXRlRGlmZik7XG5cblx0XHQvLyBUT0RPQGpvYW8gVE9ET0BhbGV4IG5lZWQgdGhpcyBzZXRUaW1lb3V0IHByb2JhYmx5IGJlY2F1c2UgdGhlXG5cdFx0Ly8gbm9uLXNpZGUtYnktc2lkZSBkaWZmIHN0aWxsIGhhc24ndCBjcmVhdGVkIHRoZSB2aWV3IHpvbmVzXG5cdFx0b25GaXJzdERpZmZVcGRhdGUoKCkgPT4gc2V0VGltZW91dCgoKSA9PiB0aGlzLnJldmVhbENoYW5nZShjaGFuZ2UpLCAwKSk7XG5cblx0XHRjb25zdCBkaWZmRWRpdG9yTW9kZWwgPSB0aGlzLm1vZGVsLmdldERpZmZFZGl0b3JNb2RlbChsYWJlbGVkQ2hhbmdlLm9yaWdpbmFsKTtcblx0XHRpZiAoIWRpZmZFZGl0b3JNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmRpZmZFZGl0b3Iuc2V0TW9kZWwoZGlmZkVkaXRvck1vZGVsKTtcblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKGdldE1vZGlmaWVkRW5kTGluZU51bWJlcihjaGFuZ2UpLCAxKTtcblxuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdGNvbnN0IGVkaXRvckhlaWdodCA9IHRoaXMuZWRpdG9yLmdldExheW91dEluZm8oKS5oZWlnaHQ7XG5cdFx0Y29uc3QgZWRpdG9ySGVpZ2h0SW5MaW5lcyA9IE1hdGguZmxvb3IoZWRpdG9ySGVpZ2h0IC8gbGluZUhlaWdodCk7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gTWF0aC5taW4oXG5cdFx0XHRnZXRDaGFuZ2VIZWlnaHQoY2hhbmdlKSArIDIgLyogYXJyb3csIGZyYW1lLCBoZWFkZXIgKi8gKyA2IC8qIDMgbGluZXMgYWJvdmUvYmVsb3cgdGhlIGNoYW5nZSAqLyxcblx0XHRcdE1hdGguZmxvb3IoZWRpdG9ySGVpZ2h0SW5MaW5lcyAvIDMpKTtcblxuXHRcdHRoaXMucmVuZGVyVGl0bGUoKTtcblx0XHR0aGlzLnVwZGF0ZURyb3Bkb3duKCk7XG5cblx0XHRjb25zdCBjaGFuZ2VUeXBlID0gZ2V0Q2hhbmdlVHlwZShjaGFuZ2UpO1xuXHRcdGNvbnN0IGNoYW5nZVR5cGVDb2xvciA9IGdldENoYW5nZVR5cGVDb2xvcih0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCksIGNoYW5nZVR5cGUpO1xuXHRcdHRoaXMuc3R5bGUoeyBmcmFtZUNvbG9yOiBjaGFuZ2VUeXBlQ29sb3IsIGFycm93Q29sb3I6IGNoYW5nZVR5cGVDb2xvciB9KTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyU3BlY2lmaWNDaGFuZ2VzOiBJQ2hhbmdlW10gPSBbXTtcblx0XHRsZXQgY29udGV4dEluZGV4ID0gaW5kZXg7XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgdGhpcy5tb2RlbC5jaGFuZ2VzKSB7XG5cdFx0XHRpZiAoY2hhbmdlLnByb3ZpZGVySWQgPT09IHRoaXMubW9kZWwuY2hhbmdlc1t0aGlzLl9pbmRleF0ucHJvdmlkZXJJZCkge1xuXHRcdFx0XHRwcm92aWRlclNwZWNpZmljQ2hhbmdlcy5wdXNoKGNoYW5nZS5jaGFuZ2UpO1xuXHRcdFx0XHRpZiAobGFiZWxlZENoYW5nZSA9PT0gY2hhbmdlKSB7XG5cdFx0XHRcdFx0Y29udGV4dEluZGV4ID0gcHJvdmlkZXJTcGVjaWZpY0NoYW5nZXMubGVuZ3RoIC0gMTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9hY3Rpb25iYXJXaWRnZXQhLmNvbnRleHQgPSBbZGlmZkVkaXRvck1vZGVsLm1vZGlmaWVkLnVyaSwgcHJvdmlkZXJTcGVjaWZpY0NoYW5nZXMsIGNvbnRleHRJbmRleF07XG5cdFx0aWYgKHVzZVBvc2l0aW9uKSB7XG5cdFx0XHQvLyBJbiBvcmRlciB0byBhY2NvdW50IGZvciB0aGUgMXB4IGJvcmRlci10b3Agb2YgdGhlIGNvbnRlbnQgZWxlbWVudCB3ZVxuXHRcdFx0Ly8gaGF2ZSB0byBhZGQgMXB4LiBUaGUgcGl4ZWwgdmFsdWUgbmVlZHMgdG8gYmUgZXhwcmVzc2VkIGFzIGEgZnJhY3Rpb25cblx0XHRcdC8vIG9mIHRoZSBsaW5lIGhlaWdodC5cblx0XHRcdHRoaXMuc2hvdyhwb3NpdGlvbiwgaGVpZ2h0ICsgKDEgLyBsaW5lSGVpZ2h0KSk7XG5cdFx0XHR0aGlzLmVkaXRvci5zZXRQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyVGl0bGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXJDaGFuZ2VzID0gdGhpcy5tb2RlbC5xdWlja0RpZmZDaGFuZ2VzLmdldCh0aGlzLl9wcm92aWRlcklkKSE7XG5cdFx0Y29uc3QgcHJvdmlkZXJJbmRleCA9IHByb3ZpZGVyQ2hhbmdlcy5pbmRleE9mKHRoaXMuX2luZGV4KTtcblxuXHRcdGxldCBkZXRhaWw6IHN0cmluZztcblx0XHRpZiAoIXRoaXMuc2hvdWxkVXNlRHJvcGRvd24oKSkge1xuXHRcdFx0Y29uc3QgbGFiZWwgPSB0aGlzLm1vZGVsLnF1aWNrRGlmZnNcblx0XHRcdFx0LmZpbmQocXVpY2tEaWZmID0+IHF1aWNrRGlmZi5pZCA9PT0gdGhpcy5fcHJvdmlkZXJJZCk/LmxhYmVsID8/ICcnO1xuXG5cdFx0XHRkZXRhaWwgPSB0aGlzLm1vZGVsLmNoYW5nZXMubGVuZ3RoID4gMVxuXHRcdFx0XHQ/IG5scy5sb2NhbGl6ZSgnY2hhbmdlcycsIFwiezB9IC0gezF9IG9mIHsyfSBjaGFuZ2VzXCIsIGxhYmVsLCBwcm92aWRlckluZGV4ICsgMSwgcHJvdmlkZXJDaGFuZ2VzLmxlbmd0aClcblx0XHRcdFx0OiBubHMubG9jYWxpemUoJ2NoYW5nZScsIFwiezB9IC0gezF9IG9mIHsyfSBjaGFuZ2VcIiwgbGFiZWwsIHByb3ZpZGVySW5kZXggKyAxLCBwcm92aWRlckNoYW5nZXMubGVuZ3RoKTtcblx0XHRcdHRoaXMuZHJvcGRvd25Db250YWluZXIhLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRldGFpbCA9IHRoaXMubW9kZWwuY2hhbmdlcy5sZW5ndGggPiAxXG5cdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdtdWx0aUNoYW5nZXMnLCBcInswfSBvZiB7MX0gY2hhbmdlc1wiLCBwcm92aWRlckluZGV4ICsgMSwgcHJvdmlkZXJDaGFuZ2VzLmxlbmd0aClcblx0XHRcdFx0OiBubHMubG9jYWxpemUoJ211bHRpQ2hhbmdlJywgXCJ7MH0gb2YgezF9IGNoYW5nZVwiLCBwcm92aWRlckluZGV4ICsgMSwgcHJvdmlkZXJDaGFuZ2VzLmxlbmd0aCk7XG5cdFx0XHR0aGlzLmRyb3Bkb3duQ29udGFpbmVyIS5zdHlsZS5kaXNwbGF5ID0gJ2luaGVyaXQnO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0VGl0bGUodGhpcy50aXRsZSwgZGV0YWlsKTtcblx0fVxuXG5cdHByaXZhdGUgc3dpdGNoUXVpY2tEaWZmKGV2ZW50PzogSVF1aWNrRGlmZlNlbGVjdEl0ZW0pIHtcblx0XHRjb25zdCBuZXdQcm92aWRlcklkID0gZXZlbnQ/LnByb3ZpZGVySWQ7XG5cdFx0aWYgKG5ld1Byb3ZpZGVySWQgPT09IHRoaXMubW9kZWwuY2hhbmdlc1t0aGlzLl9pbmRleF0ucHJvdmlkZXJJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgY2xvc2VzdEdyZWF0ZXJJbmRleCA9IHRoaXMuX2luZGV4IDwgdGhpcy5tb2RlbC5jaGFuZ2VzLmxlbmd0aCAtIDEgPyB0aGlzLl9pbmRleCArIDEgOiAwO1xuXHRcdGZvciAobGV0IGkgPSBjbG9zZXN0R3JlYXRlckluZGV4OyBpICE9PSB0aGlzLl9pbmRleDsgaSA8IHRoaXMubW9kZWwuY2hhbmdlcy5sZW5ndGggLSAxID8gaSsrIDogaSA9IDApIHtcblx0XHRcdGlmICh0aGlzLm1vZGVsLmNoYW5nZXNbaV0ucHJvdmlkZXJJZCA9PT0gbmV3UHJvdmlkZXJJZCkge1xuXHRcdFx0XHRjbG9zZXN0R3JlYXRlckluZGV4ID0gaTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGxldCBjbG9zZXN0TGVzc2VySW5kZXggPSB0aGlzLl9pbmRleCA+IDAgPyB0aGlzLl9pbmRleCAtIDEgOiB0aGlzLm1vZGVsLmNoYW5nZXMubGVuZ3RoIC0gMTtcblx0XHRmb3IgKGxldCBpID0gY2xvc2VzdExlc3NlckluZGV4OyBpICE9PSB0aGlzLl9pbmRleDsgaSA+IDAgPyBpLS0gOiBpID0gdGhpcy5tb2RlbC5jaGFuZ2VzLmxlbmd0aCAtIDEpIHtcblx0XHRcdGlmICh0aGlzLm1vZGVsLmNoYW5nZXNbaV0ucHJvdmlkZXJJZCA9PT0gbmV3UHJvdmlkZXJJZCkge1xuXHRcdFx0XHRjbG9zZXN0TGVzc2VySW5kZXggPSBpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgY2xvc2VzdEluZGV4ID0gTWF0aC5hYnModGhpcy5tb2RlbC5jaGFuZ2VzW2Nsb3Nlc3RHcmVhdGVySW5kZXhdLmNoYW5nZS5tb2RpZmllZEVuZExpbmVOdW1iZXIgLSB0aGlzLm1vZGVsLmNoYW5nZXNbdGhpcy5faW5kZXhdLmNoYW5nZS5tb2RpZmllZEVuZExpbmVOdW1iZXIpXG5cdFx0XHQ8IE1hdGguYWJzKHRoaXMubW9kZWwuY2hhbmdlc1tjbG9zZXN0TGVzc2VySW5kZXhdLmNoYW5nZS5tb2RpZmllZEVuZExpbmVOdW1iZXIgLSB0aGlzLm1vZGVsLmNoYW5nZXNbdGhpcy5faW5kZXhdLmNoYW5nZS5tb2RpZmllZEVuZExpbmVOdW1iZXIpXG5cdFx0XHQ/IGNsb3Nlc3RHcmVhdGVySW5kZXggOiBjbG9zZXN0TGVzc2VySW5kZXg7XG5cdFx0dGhpcy5zaG93Q2hhbmdlKGNsb3Nlc3RJbmRleCwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRVc2VEcm9wZG93bigpOiBib29sZWFuIHtcblx0XHRjb25zdCBxdWlja0RpZmZzID0gdGhpcy5nZXRRdWlja0RpZmZzQ29udGFpbmluZ0NoYW5nZSgpO1xuXHRcdHJldHVybiBxdWlja0RpZmZzLmxlbmd0aCA+IDE7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFjdGlvbnMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9hY3Rpb25iYXJXaWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1aWNrRGlmZldpZGdldEVkaXRvckFjdGlvbiwgdGhpcy5lZGl0b3IsIG5ldyBTaG93UHJldmlvdXNDaGFuZ2VBY3Rpb24odGhpcy5lZGl0b3IpLCBUaGVtZUljb24uYXNDbGFzc05hbWUoZ290b1ByZXZpb3VzTG9jYXRpb24pKTtcblx0XHRjb25zdCBuZXh0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShRdWlja0RpZmZXaWRnZXRFZGl0b3JBY3Rpb24sIHRoaXMuZWRpdG9yLCBuZXcgU2hvd05leHRDaGFuZ2VBY3Rpb24odGhpcy5lZGl0b3IpLCBUaGVtZUljb24uYXNDbGFzc05hbWUoZ290b05leHRMb2NhdGlvbikpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHByZXZpb3VzKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQobmV4dCk7XG5cblx0XHRpZiAodGhpcy5tZW51KSB7XG5cdFx0XHR0aGlzLm1lbnUuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLm1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLlNDTUNoYW5nZUNvbnRleHQsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyh0aGlzLm1lbnUuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pKTtcblx0XHR0aGlzLl9hY3Rpb25iYXJXaWRnZXQuY2xlYXIoKTtcblx0XHR0aGlzLl9hY3Rpb25iYXJXaWRnZXQucHVzaChhY3Rpb25zLnJldmVyc2UoKSwgeyBsYWJlbDogZmFsc2UsIGljb246IHRydWUgfSk7XG5cdFx0dGhpcy5fYWN0aW9uYmFyV2lkZ2V0LnB1c2goW25leHQsIHByZXZpb3VzXSwgeyBsYWJlbDogZmFsc2UsIGljb246IHRydWUgfSk7XG5cdFx0dGhpcy5fYWN0aW9uYmFyV2lkZ2V0LnB1c2godGhpcy5fZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oJ3BlZWt2aWV3LmNsb3NlJywgbmxzLmxvY2FsaXplKCdsYWJlbC5jbG9zZScsIFwiQ2xvc2VcIiksIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNsb3NlKSwgdHJ1ZSwgKCkgPT4gdGhpcy5kaXNwb3NlKCkpKSwgeyBsYWJlbDogZmFsc2UsIGljb246IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZURyb3Bkb3duKCk6IHZvaWQge1xuXHRcdGNvbnN0IHF1aWNrRGlmZnMgPSB0aGlzLmdldFF1aWNrRGlmZnNDb250YWluaW5nQ2hhbmdlKCk7XG5cdFx0dGhpcy5kcm9wZG93bj8uc2V0U2VsZWN0aW9uKHF1aWNrRGlmZnMsIHRoaXMuX3Byb3ZpZGVySWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRRdWlja0RpZmZzQ29udGFpbmluZ0NoYW5nZSgpOiBRdWlja0RpZmZbXSB7XG5cdFx0Y29uc3QgY2hhbmdlID0gdGhpcy5tb2RlbC5jaGFuZ2VzW3RoaXMuX2luZGV4XTtcblxuXHRcdGNvbnN0IHF1aWNrRGlmZnNXaXRoQ2hhbmdlID0gdGhpcy5tb2RlbC5jaGFuZ2VzXG5cdFx0XHQuZmlsdGVyKGMgPT4gY2hhbmdlLmNoYW5nZTIubW9kaWZpZWQuaW50ZXJzZWN0c09yVG91Y2hlcyhjLmNoYW5nZTIubW9kaWZpZWQpKVxuXHRcdFx0Lm1hcChjID0+IGMucHJvdmlkZXJJZCk7XG5cblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5xdWlja0RpZmZzXG5cdFx0XHQuZmlsdGVyKHF1aWNrRGlmZiA9PiBxdWlja0RpZmZzV2l0aENoYW5nZS5pbmNsdWRlcyhxdWlja0RpZmYuaWQpICYmXG5cdFx0XHRcdHRoaXMucXVpY2tEaWZmU2VydmljZS5pc1F1aWNrRGlmZlByb3ZpZGVyVmlzaWJsZShxdWlja0RpZmYuaWQpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZmlsbEhlYWQoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLl9maWxsSGVhZChjb250YWluZXIsIHRydWUpO1xuXG5cdFx0Ly8gUmVuZGVyIGFuIGVtcHR5IHBpY2tlciB3aGljaCB3aWxsIGJlIHBvcHVsYXRlZCBsYXRlclxuXHRcdGNvbnN0IGFjdGlvbiA9IG5ldyBRdWlja0RpZmZQaWNrZXJCYXNlQWN0aW9uKChldmVudD86IElRdWlja0RpZmZTZWxlY3RJdGVtKSA9PiB0aGlzLnN3aXRjaFF1aWNrRGlmZihldmVudCkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChhY3Rpb24pO1xuXG5cdFx0dGhpcy5kcm9wZG93bkNvbnRhaW5lciA9IGRvbS5wcmVwZW5kKHRoaXMuX3RpdGxlRWxlbWVudCEsIGRvbS4kKCcuZHJvcGRvd24nKSk7XG5cdFx0dGhpcy5kcm9wZG93biA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUXVpY2tEaWZmUGlja2VyVmlld0l0ZW0sIGFjdGlvbik7XG5cdFx0dGhpcy5kcm9wZG93bi5yZW5kZXIodGhpcy5kcm9wZG93bkNvbnRhaW5lcik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2dldEFjdGlvbkJhck9wdGlvbnMoKTogSUFjdGlvbkJhck9wdGlvbnMge1xuXHRcdGNvbnN0IGFjdGlvblJ1bm5lciA9IG5ldyBRdWlja0RpZmZXaWRnZXRBY3Rpb25SdW5uZXIoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoYWN0aW9uUnVubmVyKTtcblxuXHRcdC8vIGNsb3NlIHdpZGdldCBvbiBzdWNjZXNzZnVsIGFjdGlvblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChhY3Rpb25SdW5uZXIub25EaWRSdW4oZSA9PiB7XG5cdFx0XHRpZiAoIShlLmFjdGlvbiBpbnN0YW5jZW9mIFF1aWNrRGlmZldpZGdldEVkaXRvckFjdGlvbikgJiYgIWUuZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnN1cGVyLl9nZXRBY3Rpb25CYXJPcHRpb25zKCksXG5cdFx0XHRhY3Rpb25SdW5uZXJcblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIF9maWxsQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgb3B0aW9uczogSURpZmZFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0ZGlmZkFsZ29yaXRobTogJ2FkdmFuY2VkJyxcblx0XHRcdGZpeGVkT3ZlcmZsb3dXaWRnZXRzOiB0cnVlLFxuXHRcdFx0aWdub3JlVHJpbVdoaXRlc3BhY2U6IGZhbHNlLFxuXHRcdFx0bWluaW1hcDogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0cmVhZE9ubHk6IGZhbHNlLFxuXHRcdFx0cmVuZGVyR3V0dGVyTWVudTogZmFsc2UsXG5cdFx0XHRyZW5kZXJJbmRpY2F0b3JzOiBmYWxzZSxcblx0XHRcdHJlbmRlck92ZXJ2aWV3UnVsZXI6IGZhbHNlLFxuXHRcdFx0cmVuZGVyU2lkZUJ5U2lkZTogZmFsc2UsXG5cdFx0XHRzY3JvbGxiYXI6IHtcblx0XHRcdFx0dmVydGljYWxTY3JvbGxiYXJTaXplOiAxNCxcblx0XHRcdFx0aG9yaXpvbnRhbDogJ2F1dG8nLFxuXHRcdFx0XHR1c2VTaGFkb3dzOiB0cnVlLFxuXHRcdFx0XHR2ZXJ0aWNhbEhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRcdGhvcml6b250YWxIYXNBcnJvd3M6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IGZhbHNlLFxuXHRcdFx0c3RpY2t5U2Nyb2xsOiB7IGVuYWJsZWQ6IGZhbHNlIH1cblx0XHR9O1xuXG5cdFx0dGhpcy5kaWZmRWRpdG9yID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbWJlZGRlZERpZmZFZGl0b3JXaWRnZXQsIGNvbnRhaW5lciwgb3B0aW9ucywge30sIHRoaXMuZWRpdG9yKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5kaWZmRWRpdG9yKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb25XaWR0aCh3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLmhlaWdodCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmRpZmZFZGl0b3IubGF5b3V0KHsgaGVpZ2h0OiB0aGlzLmhlaWdodCwgd2lkdGggfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2RvTGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLl9kb0xheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5kaWZmRWRpdG9yLmxheW91dCh7IGhlaWdodCwgd2lkdGggfSk7XG5cblx0XHRpZiAodHlwZW9mIHRoaXMuaGVpZ2h0ID09PSAndW5kZWZpbmVkJyAmJiB0aGlzLmNoYW5nZSkge1xuXHRcdFx0dGhpcy5yZXZlYWxDaGFuZ2UodGhpcy5jaGFuZ2UpO1xuXHRcdH1cblxuXHRcdHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXHR9XG5cblx0cHJpdmF0ZSByZXZlYWxDaGFuZ2UoY2hhbmdlOiBJQ2hhbmdlKTogdm9pZCB7XG5cdFx0bGV0IHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyO1xuXG5cdFx0aWYgKGNoYW5nZS5tb2RpZmllZEVuZExpbmVOdW1iZXIgPT09IDApIHsgLy8gZGVsZXRpb25cblx0XHRcdHN0YXJ0ID0gY2hhbmdlLm1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0ZW5kID0gY2hhbmdlLm1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyICsgMTtcblx0XHR9IGVsc2UgaWYgKGNoYW5nZS5vcmlnaW5hbEVuZExpbmVOdW1iZXIgPiAwKSB7IC8vIG1vZGlmaWNhdGlvblxuXHRcdFx0c3RhcnQgPSBjaGFuZ2UubW9kaWZpZWRTdGFydExpbmVOdW1iZXIgLSAxO1xuXHRcdFx0ZW5kID0gY2hhbmdlLm1vZGlmaWVkRW5kTGluZU51bWJlciArIDE7XG5cdFx0fSBlbHNlIHsgLy8gaW5zZXJ0aW9uXG5cdFx0XHRzdGFydCA9IGNoYW5nZS5tb2RpZmllZFN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGVuZCA9IGNoYW5nZS5tb2RpZmllZEVuZExpbmVOdW1iZXI7XG5cdFx0fVxuXG5cdFx0dGhpcy5kaWZmRWRpdG9yLnJldmVhbExpbmVzSW5DZW50ZXIoc3RhcnQsIGVuZCwgU2Nyb2xsVHlwZS5JbW1lZGlhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlUaGVtZSh0aGVtZTogSUNvbG9yVGhlbWUpIHtcblx0XHRjb25zdCBib3JkZXJDb2xvciA9IHRoZW1lLmdldENvbG9yKHBlZWtWaWV3Qm9yZGVyKSB8fCBDb2xvci50cmFuc3BhcmVudDtcblx0XHR0aGlzLnN0eWxlKHtcblx0XHRcdGFycm93Q29sb3I6IGJvcmRlckNvbG9yLFxuXHRcdFx0ZnJhbWVDb2xvcjogYm9yZGVyQ29sb3IsXG5cdFx0XHRoZWFkZXJCYWNrZ3JvdW5kQ29sb3I6IHRoZW1lLmdldENvbG9yKHBlZWtWaWV3VGl0bGVCYWNrZ3JvdW5kKSB8fCBDb2xvci50cmFuc3BhcmVudCxcblx0XHRcdHByaW1hcnlIZWFkaW5nQ29sb3I6IHRoZW1lLmdldENvbG9yKHBlZWtWaWV3VGl0bGVGb3JlZ3JvdW5kKSxcblx0XHRcdHNlY29uZGFyeUhlYWRpbmdDb2xvcjogdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXdUaXRsZUluZm9Gb3JlZ3JvdW5kKVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJldmVhbFJhbmdlKHJhbmdlOiBSYW5nZSkge1xuXHRcdHRoaXMuZWRpdG9yLnJldmVhbExpbmVJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KHJhbmdlLmVuZExpbmVOdW1iZXIsIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRpZmZFZGl0b3IuaGFzVGV4dEZvY3VzKCk7XG5cdH1cblxuXHR0b2dnbGVGb2N1cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5kaWZmRWRpdG9yLmhhc1RleHRGb2N1cygpKSB7XG5cdFx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRpZmZFZGl0b3IuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMuZHJvcGRvd24/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLm1lbnU/LmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFF1aWNrRGlmZkVkaXRvckNvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuY29udHJpYi5xdWlja2RpZmYnO1xuXG5cdHN0YXRpYyBnZXQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IFF1aWNrRGlmZkVkaXRvckNvbnRyb2xsZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxRdWlja0RpZmZFZGl0b3JDb250cm9sbGVyPihRdWlja0RpZmZFZGl0b3JDb250cm9sbGVyLklEKTtcblx0fVxuXG5cdHByaXZhdGUgbW9kZWw6IFF1aWNrRGlmZk1vZGVsIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgd2lkZ2V0OiBRdWlja0RpZmZXaWRnZXQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBpc1F1aWNrRGlmZlZpc2libGUhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBzZXNzaW9uOiBJRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblx0cHJpdmF0ZSBtb3VzZURvd25JbmZvOiB7IGxpbmVOdW1iZXI6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgZW5hYmxlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGd1dHRlckFjdGlvbkRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHN0eWxlc2hlZXQ6IEhUTUxTdHlsZUVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVF1aWNrRGlmZk1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrRGlmZk1vZGVsU2VydmljZTogSVF1aWNrRGlmZk1vZGVsU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZW5hYmxlZCA9ICFjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoJ2lzSW5EaWZmRWRpdG9yJyk7XG5cdFx0dGhpcy5zdHlsZXNoZWV0ID0gZG9tU3R5bGVzaGVldHNKcy5jcmVhdGVTdHlsZVNoZWV0KHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLl9zdG9yZSk7XG5cblx0XHRpZiAodGhpcy5lbmFibGVkKSB7XG5cdFx0XHR0aGlzLmlzUXVpY2tEaWZmVmlzaWJsZSA9IGlzUXVpY2tEaWZmVmlzaWJsZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4gdGhpcy5jbG9zZSgpKSk7XG5cblx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlR3V0dGVyQWN0aW9uID0gRXZlbnQuZmlsdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY20uZGlmZkRlY29yYXRpb25zR3V0dGVyQWN0aW9uJykpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRDaGFuZ2VHdXR0ZXJBY3Rpb24odGhpcy5vbkRpZENoYW5nZUd1dHRlckFjdGlvbiwgdGhpcykpO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUd1dHRlckFjdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VHdXR0ZXJBY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgZ3V0dGVyQWN0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnZGlmZicgfCAnbm9uZSc+KCdzY20uZGlmZkRlY29yYXRpb25zR3V0dGVyQWN0aW9uJyk7XG5cblx0XHR0aGlzLmd1dHRlckFjdGlvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRpZiAoZ3V0dGVyQWN0aW9uID09PSAnZGlmZicpIHtcblx0XHRcdHRoaXMuZ3V0dGVyQWN0aW9uRGlzcG9zYWJsZXMuYWRkKHRoaXMuZWRpdG9yLm9uTW91c2VEb3duKGUgPT4gdGhpcy5vbkVkaXRvck1vdXNlRG93bihlKSkpO1xuXHRcdFx0dGhpcy5ndXR0ZXJBY3Rpb25EaXNwb3NhYmxlcy5hZGQodGhpcy5lZGl0b3Iub25Nb3VzZVVwKGUgPT4gdGhpcy5vbkVkaXRvck1vdXNlVXAoZSkpKTtcblx0XHRcdHRoaXMuc3R5bGVzaGVldC50ZXh0Q29udGVudCA9IGBcblx0XHRcdFx0Lm1vbmFjby1lZGl0b3IgLmRpcnR5LWRpZmYtZ2x5cGgge1xuXHRcdFx0XHRcdGN1cnNvcjogcG9pbnRlcjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC5tb25hY28tZWRpdG9yIC5tYXJnaW4tdmlldy1vdmVybGF5cyAuZGlydHktZGlmZi1nbHlwaDpob3Zlcjo6YmVmb3JlIHtcblx0XHRcdFx0XHRoZWlnaHQ6IDEwMCU7XG5cdFx0XHRcdFx0d2lkdGg6IDZweDtcblx0XHRcdFx0XHRsZWZ0OiAtNnB4O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Lm1vbmFjby1lZGl0b3IgLm1hcmdpbi12aWV3LW92ZXJsYXlzIC5kaXJ0eS1kaWZmLWRlbGV0ZWQ6aG92ZXI6OmFmdGVyIHtcblx0XHRcdFx0XHRib3R0b206IDA7XG5cdFx0XHRcdFx0Ym9yZGVyLXRvcC13aWR0aDogMDtcblx0XHRcdFx0XHRib3JkZXItYm90dG9tLXdpZHRoOiAwO1xuXHRcdFx0XHR9XG5cdFx0XHRgO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0eWxlc2hlZXQudGV4dENvbnRlbnQgPSBgYDtcblx0XHR9XG5cdH1cblxuXHRjYW5OYXZpZ2F0ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMud2lkZ2V0IHx8ICh0aGlzLndpZGdldD8uaW5kZXggPT09IC0xKSB8fCAoISF0aGlzLm1vZGVsICYmIHRoaXMubW9kZWwuY2hhbmdlcy5sZW5ndGggPiAxKTtcblx0fVxuXG5cdHJlZnJlc2goKTogdm9pZCB7XG5cdFx0dGhpcy53aWRnZXQ/LnNob3dDaGFuZ2UodGhpcy53aWRnZXQuaW5kZXgsIGZhbHNlKTtcblx0fVxuXG5cdHRvZ2dsZUZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLndpZGdldCkge1xuXHRcdFx0dGhpcy53aWRnZXQudG9nZ2xlRm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRuZXh0KGxpbmVOdW1iZXI/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuYXNzZXJ0V2lkZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLndpZGdldCB8fCAhdGhpcy5tb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBpbmRleDogbnVtYmVyO1xuXHRcdGlmICh0aGlzLmVkaXRvci5oYXNNb2RlbCgpICYmICh0eXBlb2YgbGluZU51bWJlciA9PT0gJ251bWJlcicgfHwgIXRoaXMud2lkZ2V0LnByb3ZpZGVySWQpKSB7XG5cdFx0XHRpbmRleCA9IHRoaXMubW9kZWwuZmluZE5leHRDbG9zZXN0Q2hhbmdlKHR5cGVvZiBsaW5lTnVtYmVyID09PSAnbnVtYmVyJyA/IGxpbmVOdW1iZXIgOiB0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpLmxpbmVOdW1iZXIsIHRydWUsIHRoaXMud2lkZ2V0LnByb3ZpZGVySWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwcm92aWRlckNoYW5nZXM6IG51bWJlcltdID0gdGhpcy5tb2RlbC5xdWlja0RpZmZDaGFuZ2VzLmdldCh0aGlzLndpZGdldC5wcm92aWRlcklkKSA/PyB0aGlzLm1vZGVsLnF1aWNrRGlmZkNoYW5nZXMudmFsdWVzKCkubmV4dCgpLnZhbHVlITtcblx0XHRcdGNvbnN0IG1hcEluZGV4ID0gcHJvdmlkZXJDaGFuZ2VzLmZpbmRJbmRleCh2YWx1ZSA9PiB2YWx1ZSA9PT0gdGhpcy53aWRnZXQhLmluZGV4KTtcblx0XHRcdGluZGV4ID0gcHJvdmlkZXJDaGFuZ2VzW3JvdChtYXBJbmRleCArIDEsIHByb3ZpZGVyQ2hhbmdlcy5sZW5ndGgpXTtcblx0XHR9XG5cblx0XHR0aGlzLndpZGdldC5zaG93Q2hhbmdlKGluZGV4KTtcblx0fVxuXG5cdHByZXZpb3VzKGxpbmVOdW1iZXI/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuYXNzZXJ0V2lkZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLndpZGdldCB8fCAhdGhpcy5tb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBpbmRleDogbnVtYmVyO1xuXHRcdGlmICh0aGlzLmVkaXRvci5oYXNNb2RlbCgpICYmICh0eXBlb2YgbGluZU51bWJlciA9PT0gJ251bWJlcicgfHwgIXRoaXMud2lkZ2V0LnByb3ZpZGVySWQpKSB7XG5cdFx0XHRpbmRleCA9IHRoaXMubW9kZWwuZmluZFByZXZpb3VzQ2xvc2VzdENoYW5nZSh0eXBlb2YgbGluZU51bWJlciA9PT0gJ251bWJlcicgPyBsaW5lTnVtYmVyIDogdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKS5saW5lTnVtYmVyLCB0cnVlLCB0aGlzLndpZGdldC5wcm92aWRlcklkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJDaGFuZ2VzOiBudW1iZXJbXSA9IHRoaXMubW9kZWwucXVpY2tEaWZmQ2hhbmdlcy5nZXQodGhpcy53aWRnZXQucHJvdmlkZXJJZCkgPz8gdGhpcy5tb2RlbC5xdWlja0RpZmZDaGFuZ2VzLnZhbHVlcygpLm5leHQoKS52YWx1ZSE7XG5cdFx0XHRjb25zdCBtYXBJbmRleCA9IHByb3ZpZGVyQ2hhbmdlcy5maW5kSW5kZXgodmFsdWUgPT4gdmFsdWUgPT09IHRoaXMud2lkZ2V0IS5pbmRleCk7XG5cdFx0XHRpbmRleCA9IHByb3ZpZGVyQ2hhbmdlc1tyb3QobWFwSW5kZXggLSAxLCBwcm92aWRlckNoYW5nZXMubGVuZ3RoKV07XG5cdFx0fVxuXG5cdFx0dGhpcy53aWRnZXQuc2hvd0NoYW5nZShpbmRleCk7XG5cdH1cblxuXHRjbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdHRoaXMuc2Vzc2lvbiA9IERpc3Bvc2FibGUuTm9uZTtcblx0fVxuXG5cdHByaXZhdGUgYXNzZXJ0V2lkZ2V0KCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5lbmFibGVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMud2lkZ2V0KSB7XG5cdFx0XHRpZiAoIXRoaXMubW9kZWwgfHwgdGhpcy5tb2RlbC5jaGFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLmNsb3NlKCk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yTW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXG5cdFx0aWYgKCFlZGl0b3JNb2RlbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsUmVmID0gdGhpcy5xdWlja0RpZmZNb2RlbFNlcnZpY2UuY3JlYXRlUXVpY2tEaWZmTW9kZWxSZWZlcmVuY2UoZWRpdG9yTW9kZWwudXJpKTtcblxuXHRcdGlmICghbW9kZWxSZWYpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAobW9kZWxSZWYub2JqZWN0LmNoYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRtb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5tb2RlbCA9IG1vZGVsUmVmLm9iamVjdDtcblx0XHR0aGlzLndpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUXVpY2tEaWZmV2lkZ2V0LCB0aGlzLmVkaXRvciwgdGhpcy5tb2RlbCk7XG5cdFx0dGhpcy5pc1F1aWNrRGlmZlZpc2libGUuc2V0KHRydWUpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50Lm9uY2UodGhpcy53aWRnZXQub25EaWRDbG9zZSkodGhpcy5jbG9zZSwgdGhpcykpO1xuXHRcdGNvbnN0IG9uRGlkTW9kZWxDaGFuZ2UgPSBFdmVudC5jaGFpbih0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlLCAkID0+XG5cdFx0XHQkLmZpbHRlcihlID0+IGUuZGlmZi5sZW5ndGggPiAwKVxuXHRcdFx0XHQubWFwKGUgPT4gZS5kaWZmKVxuXHRcdCk7XG5cblx0XHRvbkRpZE1vZGVsQ2hhbmdlKHRoaXMub25EaWRNb2RlbENoYW5nZSwgdGhpcywgZGlzcG9zYWJsZXMpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsUmVmKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy53aWRnZXQpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5tb2RlbCA9IG51bGw7XG5cdFx0XHR0aGlzLndpZGdldCA9IG51bGw7XG5cdFx0XHR0aGlzLmlzUXVpY2tEaWZmVmlzaWJsZS5zZXQoZmFsc2UpO1xuXHRcdFx0dGhpcy5lZGl0b3IuZm9jdXMoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnNlc3Npb24gPSBkaXNwb3NhYmxlcztcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRNb2RlbENoYW5nZShzcGxpY2VzOiBJU3BsaWNlPFF1aWNrRGlmZkNoYW5nZT5bXSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5tb2RlbCB8fCAhdGhpcy53aWRnZXQgfHwgdGhpcy53aWRnZXQuaGFzRm9jdXMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc3BsaWNlIG9mIHNwbGljZXMpIHtcblx0XHRcdGlmIChzcGxpY2Uuc3RhcnQgPD0gdGhpcy53aWRnZXQuaW5kZXgpIHtcblx0XHRcdFx0dGhpcy5uZXh0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnJlZnJlc2goKTtcblx0fVxuXG5cdHByaXZhdGUgb25FZGl0b3JNb3VzZURvd24oZTogSUVkaXRvck1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLm1vdXNlRG93bkluZm8gPSBudWxsO1xuXG5cdFx0Y29uc3QgcmFuZ2UgPSBlLnRhcmdldC5yYW5nZTtcblxuXHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWUuZXZlbnQubGVmdEJ1dHRvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlLnRhcmdldC50eXBlICE9PSBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0xJTkVfREVDT1JBVElPTlMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFlLnRhcmdldC5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChlLnRhcmdldC5lbGVtZW50LmNsYXNzTmFtZS5pbmRleE9mKCdkaXJ0eS1kaWZmLWdseXBoJykgPCAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YSA9IGUudGFyZ2V0LmRldGFpbDtcblx0XHRjb25zdCBvZmZzZXRMZWZ0SW5HdXR0ZXIgPSBlLnRhcmdldC5lbGVtZW50Lm9mZnNldExlZnQ7XG5cdFx0Y29uc3QgZ3V0dGVyT2Zmc2V0WCA9IGRhdGEub2Zmc2V0WCAtIG9mZnNldExlZnRJbkd1dHRlcjtcblxuXHRcdC8vIFRPRE9Aam9hbyBUT0RPQGFsZXggVE9ET0BtYXJ0aW4gdGhpcyBpcyBzdWNoIHRoYXQgd2UgZG9uJ3QgY29sbGlkZSB3aXRoIGZvbGRpbmdcblx0XHRpZiAoZ3V0dGVyT2Zmc2V0WCA8IC0zIHx8IGd1dHRlck9mZnNldFggPiAzKSB7IC8vIGRpcnR5IGRpZmYgZGVjb3JhdGlvbiBvbiBob3ZlciBpcyA2cHggd2lkZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubW91c2VEb3duSW5mbyA9IHsgbGluZU51bWJlcjogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIH07XG5cdH1cblxuXHRwcml2YXRlIG9uRWRpdG9yTW91c2VVcChlOiBJRWRpdG9yTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5tb3VzZURvd25JbmZvKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBsaW5lTnVtYmVyIH0gPSB0aGlzLm1vdXNlRG93bkluZm87XG5cdFx0dGhpcy5tb3VzZURvd25JbmZvID0gbnVsbDtcblxuXHRcdGNvbnN0IHJhbmdlID0gZS50YXJnZXQucmFuZ2U7XG5cblx0XHRpZiAoIXJhbmdlIHx8IHJhbmdlLnN0YXJ0TGluZU51bWJlciAhPT0gbGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlLnRhcmdldC50eXBlICE9PSBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0xJTkVfREVDT1JBVElPTlMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3JNb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRpZiAoIWVkaXRvck1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWxSZWYgPSB0aGlzLnF1aWNrRGlmZk1vZGVsU2VydmljZS5jcmVhdGVRdWlja0RpZmZNb2RlbFJlZmVyZW5jZShlZGl0b3JNb2RlbC51cmkpO1xuXG5cdFx0aWYgKCFtb2RlbFJlZikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IG1vZGVsUmVmLm9iamVjdC5jaGFuZ2VzXG5cdFx0XHRcdC5maW5kSW5kZXgoY2hhbmdlID0+IGxpbmVJbnRlcnNlY3RzQ2hhbmdlKGxpbmVOdW1iZXIsIGNoYW5nZS5jaGFuZ2UpKTtcblxuXHRcdFx0aWYgKGluZGV4IDwgMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpbmRleCA9PT0gdGhpcy53aWRnZXQ/LmluZGV4KSB7XG5cdFx0XHRcdHRoaXMuY2xvc2UoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubmV4dChsaW5lTnVtYmVyKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0bW9kZWxSZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5ndXR0ZXJBY3Rpb25EaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTaG93UHJldmlvdXNDaGFuZ2VBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgb3V0ZXJFZGl0b3I/OiBJQ29kZUVkaXRvcikge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5kaXJ0eWRpZmYucHJldmlvdXMnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ3Nob3cgcHJldmlvdXMgY2hhbmdlJywgXCJTaG93IFByZXZpb3VzIENoYW5nZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogVGV4dENvbXBhcmVFZGl0b3JBY3RpdmVDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0a2JPcHRzOiB7IGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLCBwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GMywgd2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgfVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3V0ZXJFZGl0b3IgPSB0aGlzLm91dGVyRWRpdG9yID8/IGdldE91dGVyRWRpdG9yRnJvbURpZmZFZGl0b3IoYWNjZXNzb3IpO1xuXG5cdFx0aWYgKCFvdXRlckVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBRdWlja0RpZmZFZGl0b3JDb250cm9sbGVyLmdldChvdXRlckVkaXRvcik7XG5cblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWNvbnRyb2xsZXIuY2FuTmF2aWdhdGUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnRyb2xsZXIucHJldmlvdXMoKTtcblx0fVxufVxucmVnaXN0ZXJFZGl0b3JBY3Rpb24oU2hvd1ByZXZpb3VzQ2hhbmdlQWN0aW9uKTtcblxuZXhwb3J0IGNsYXNzIFNob3dOZXh0Q2hhbmdlQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG91dGVyRWRpdG9yPzogSUNvZGVFZGl0b3IpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uZGlydHlkaWZmLm5leHQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ3Nob3cgbmV4dCBjaGFuZ2UnLCBcIlNob3cgTmV4dCBDaGFuZ2VcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IFRleHRDb21wYXJlRWRpdG9yQWN0aXZlQ29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdGtiT3B0czogeyBrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cywgcHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuRjMsIHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliIH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IG91dGVyRWRpdG9yID0gdGhpcy5vdXRlckVkaXRvciA/PyBnZXRPdXRlckVkaXRvckZyb21EaWZmRWRpdG9yKGFjY2Vzc29yKTtcblxuXHRcdGlmICghb3V0ZXJFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gUXVpY2tEaWZmRWRpdG9yQ29udHJvbGxlci5nZXQob3V0ZXJFZGl0b3IpO1xuXG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFjb250cm9sbGVyLmNhbk5hdmlnYXRlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb250cm9sbGVyLm5leHQoKTtcblx0fVxufVxucmVnaXN0ZXJFZGl0b3JBY3Rpb24oU2hvd05leHRDaGFuZ2VBY3Rpb24pO1xuXG5leHBvcnQgY2xhc3MgR290b1ByZXZpb3VzQ2hhbmdlQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZWRpdG9yLnByZXZpb3VzQ2hhbmdlJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdtb3ZlIHRvIHByZXZpb3VzIGNoYW5nZScsIFwiR28gdG8gUHJldmlvdXMgQ2hhbmdlXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoVGV4dENvbXBhcmVFZGl0b3JBY3RpdmVDb250ZXh0LnRvTmVnYXRlZCgpLCBxdWlja0RpZmZEZWNvcmF0aW9uQ291bnQubm90RXF1YWxzVG8oMCkpLFxuXHRcdFx0a2JPcHRzOiB7IGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLCBwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GNSwgd2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgfVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb3V0ZXJFZGl0b3IgPSBnZXRPdXRlckVkaXRvckZyb21EaWZmRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSA9IGFjY2Vzc29yLmdldChJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjY2Vzc2liaWxpdHlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBY2Nlc3NpYmlsaXR5U2VydmljZSk7XG5cdFx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0RpZmZNb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrRGlmZk1vZGVsU2VydmljZSk7XG5cblx0XHRpZiAoIW91dGVyRWRpdG9yIHx8ICFvdXRlckVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWxSZWYgPSBxdWlja0RpZmZNb2RlbFNlcnZpY2UuY3JlYXRlUXVpY2tEaWZmTW9kZWxSZWZlcmVuY2Uob3V0ZXJFZGl0b3IuZ2V0TW9kZWwoKS51cmkpO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIW1vZGVsUmVmIHx8IG1vZGVsUmVmLm9iamVjdC5jaGFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBvdXRlckVkaXRvci5nZXRQb3NpdGlvbigpLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBpbmRleCA9IG1vZGVsUmVmLm9iamVjdC5maW5kUHJldmlvdXNDbG9zZXN0Q2hhbmdlKGxpbmVOdW1iZXIsIGZhbHNlKTtcblx0XHRcdGNvbnN0IGNoYW5nZSA9IG1vZGVsUmVmLm9iamVjdC5jaGFuZ2VzW2luZGV4XTtcblx0XHRcdGF3YWl0IHBsYXlBY2Nlc3NpYmlsaXR5U3ltYm9sRm9yQ2hhbmdlKGNoYW5nZS5jaGFuZ2UsIGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlKTtcblx0XHRcdHNldFBvc2l0aW9uQW5kU2VsZWN0aW9uKGNoYW5nZS5jaGFuZ2UsIG91dGVyRWRpdG9yLCBhY2Nlc3NpYmlsaXR5U2VydmljZSwgY29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRtb2RlbFJlZj8uZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufVxucmVnaXN0ZXJFZGl0b3JBY3Rpb24oR290b1ByZXZpb3VzQ2hhbmdlQWN0aW9uKTtcblxuZXhwb3J0IGNsYXNzIEdvdG9OZXh0Q2hhbmdlQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZWRpdG9yLm5leHRDaGFuZ2UnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ21vdmUgdG8gbmV4dCBjaGFuZ2UnLCBcIkdvIHRvIE5leHQgQ2hhbmdlXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoVGV4dENvbXBhcmVFZGl0b3JBY3RpdmVDb250ZXh0LnRvTmVnYXRlZCgpLCBxdWlja0RpZmZEZWNvcmF0aW9uQ291bnQubm90RXF1YWxzVG8oMCkpLFxuXHRcdFx0a2JPcHRzOiB7IGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLCBwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GNSwgd2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgfVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlKTtcblx0XHRjb25zdCBvdXRlckVkaXRvciA9IGdldE91dGVyRWRpdG9yRnJvbURpZmZFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdGNvbnN0IGFjY2Vzc2liaWxpdHlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBY2Nlc3NpYmlsaXR5U2VydmljZSk7XG5cdFx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0RpZmZNb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrRGlmZk1vZGVsU2VydmljZSk7XG5cblx0XHRpZiAoIW91dGVyRWRpdG9yIHx8ICFvdXRlckVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWxSZWYgPSBxdWlja0RpZmZNb2RlbFNlcnZpY2UuY3JlYXRlUXVpY2tEaWZmTW9kZWxSZWZlcmVuY2Uob3V0ZXJFZGl0b3IuZ2V0TW9kZWwoKS51cmkpO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIW1vZGVsUmVmIHx8IG1vZGVsUmVmLm9iamVjdC5jaGFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBvdXRlckVkaXRvci5nZXRQb3NpdGlvbigpLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBpbmRleCA9IG1vZGVsUmVmLm9iamVjdC5maW5kTmV4dENsb3Nlc3RDaGFuZ2UobGluZU51bWJlciwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgY2hhbmdlID0gbW9kZWxSZWYub2JqZWN0LmNoYW5nZXNbaW5kZXhdLmNoYW5nZTtcblx0XHRcdGF3YWl0IHBsYXlBY2Nlc3NpYmlsaXR5U3ltYm9sRm9yQ2hhbmdlKGNoYW5nZSwgYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UpO1xuXHRcdFx0c2V0UG9zaXRpb25BbmRTZWxlY3Rpb24oY2hhbmdlLCBvdXRlckVkaXRvciwgYWNjZXNzaWJpbGl0eVNlcnZpY2UsIGNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0bW9kZWxSZWY/LmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEdvdG9OZXh0Q2hhbmdlQWN0aW9uKTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyR29NZW51LCB7XG5cdGdyb3VwOiAnN19jaGFuZ2VfbmF2Jyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5kaXJ0eWRpZmYubmV4dCcsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pR290b05leHRDaGFuZ2UnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiTmV4dCAmJkNoYW5nZVwiKVxuXHR9LFxuXHRvcmRlcjogMVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckdvTWVudSwge1xuXHRncm91cDogJzdfY2hhbmdlX25hdicsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ2VkaXRvci5hY3Rpb24uZGlydHlkaWZmLnByZXZpb3VzJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlHb3RvUHJldmlvdXNDaGFuZ2UnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiUHJldmlvdXMgJiZDaGFuZ2VcIilcblx0fSxcblx0b3JkZXI6IDJcbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdjbG9zZVF1aWNrRGlmZicsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgNTAsXG5cdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRzZWNvbmRhcnk6IFtLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVzY2FwZV0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChpc1F1aWNrRGlmZlZpc2libGUpLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBvdXRlckVkaXRvciA9IGdldE91dGVyRWRpdG9yRnJvbURpZmZFZGl0b3IoYWNjZXNzb3IpO1xuXG5cdFx0aWYgKCFvdXRlckVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBRdWlja0RpZmZFZGl0b3JDb250cm9sbGVyLmdldChvdXRlckVkaXRvcik7XG5cblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb250cm9sbGVyLmNsb3NlKCk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICd0b2dnbGVRdWlja0RpZmZXaWRnZXRGb2N1cycsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5Q29kZS5GMiksXG5cdHdoZW46IGlzUXVpY2tEaWZmVmlzaWJsZSxcblx0aGFuZGxlcjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3Qgb3V0ZXJFZGl0b3IgPSBnZXRPdXRlckVkaXRvckZyb21EaWZmRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRpZiAoIW91dGVyRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IFF1aWNrRGlmZkVkaXRvckNvbnRyb2xsZXIuZ2V0KG91dGVyRWRpdG9yKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb250cm9sbGVyLnRvZ2dsZUZvY3VzKCk7XG5cdH1cbn0pO1xuXG5mdW5jdGlvbiBzZXRQb3NpdGlvbkFuZFNlbGVjdGlvbihjaGFuZ2U6IElDaGFuZ2UsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsIGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UpIHtcblx0Y29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24oY2hhbmdlLm1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyLCAxKTtcblx0ZWRpdG9yLnNldFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0ZWRpdG9yLnJldmVhbFBvc2l0aW9uSW5DZW50ZXIocG9zaXRpb24pO1xuXHRpZiAoYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb24oeyBzdGFydExpbmVOdW1iZXI6IGNoYW5nZS5tb2RpZmllZFN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW46IDAsIGVuZExpbmVOdW1iZXI6IGNoYW5nZS5tb2RpZmllZFN0YXJ0TGluZU51bWJlciwgZW5kQ29sdW1uOiBOdW1iZXIuTUFYX1ZBTFVFIH0pO1xuXHRcdGNvZGVFZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKT8ud3JpdGVTY3JlZW5SZWFkZXJDb250ZW50KCdkaWZmLW5hdmlnYXRpb24nKTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBwbGF5QWNjZXNzaWJpbGl0eVN5bWJvbEZvckNoYW5nZShjaGFuZ2U6IElDaGFuZ2UsIGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UpIHtcblx0Y29uc3QgY2hhbmdlVHlwZSA9IGdldENoYW5nZVR5cGUoY2hhbmdlKTtcblx0c3dpdGNoIChjaGFuZ2VUeXBlKSB7XG5cdFx0Y2FzZSBDaGFuZ2VUeXBlLkFkZDpcblx0XHRcdGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5kaWZmTGluZUluc2VydGVkLCB7IGFsbG93TWFueUluUGFyYWxsZWw6IHRydWUsIHNvdXJjZTogJ3F1aWNrRGlmZkRlY29yYXRpb24nIH0pO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBDaGFuZ2VUeXBlLkRlbGV0ZTpcblx0XHRcdGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5kaWZmTGluZURlbGV0ZWQsIHsgYWxsb3dNYW55SW5QYXJhbGxlbDogdHJ1ZSwgc291cmNlOiAncXVpY2tEaWZmRGVjb3JhdGlvbicgfSk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIENoYW5nZVR5cGUuTW9kaWZ5OlxuXHRcdFx0YWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmRpZmZMaW5lTW9kaWZpZWQsIHsgYWxsb3dNYW55SW5QYXJhbGxlbDogdHJ1ZSwgc291cmNlOiAncXVpY2tEaWZmRGVjb3JhdGlvbicgfSk7XG5cdFx0XHRicmVhaztcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRPdXRlckVkaXRvckZyb21EaWZmRWRpdG9yKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogSUNvZGVFZGl0b3IgfCBudWxsIHtcblx0Y29uc3QgZGlmZkVkaXRvcnMgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKS5saXN0RGlmZkVkaXRvcnMoKTtcblxuXHRmb3IgKGNvbnN0IGRpZmZFZGl0b3Igb2YgZGlmZkVkaXRvcnMpIHtcblx0XHRpZiAoZGlmZkVkaXRvci5oYXNUZXh0Rm9jdXMoKSAmJiBkaWZmRWRpdG9yIGluc3RhbmNlb2YgRW1iZWRkZWREaWZmRWRpdG9yV2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm4gZGlmZkVkaXRvci5nZXRQYXJlbnRFZGl0b3IoKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZ2V0T3V0ZXJFZGl0b3IoYWNjZXNzb3IpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxTQUFTO0FBQ3JCLFlBQVksc0JBQXNCO0FBQ2xDLFNBQVMsUUFBUSxvQkFBNkI7QUFDOUMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQXNCLHFCQUFxQjtBQUMzQyxTQUFTLGdCQUFnQix5QkFBeUIseUJBQXlCLDZCQUE2QixzQkFBc0I7QUFDOUgsU0FBUyx3QkFBd0I7QUFDakMsU0FBZ0IsY0FBYyxRQUFRLGdCQUFnQixvQkFBb0I7QUFDMUUsU0FBeUMsdUJBQXVCO0FBQ2hFLFNBQVMsY0FBYyw0QkFBNEI7QUFDbkQsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBOEIsa0JBQWtCO0FBQ2hELFNBQVMsOEJBQThDO0FBQ3ZELFNBQVMsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQ3ZFLFNBQVMsZ0JBQTZCLG9CQUFvQixxQkFBcUI7QUFDL0UsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxXQUFXO0FBRXBCLFNBQVMsWUFBWSxpQkFBaUIsZUFBZSxvQkFBb0IsMEJBQTBCLG1CQUFtQiw0QkFBd0Q7QUFDOUssU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUIsd0JBQXdCO0FBRXRELFNBQVMscUJBQXFCLG1DQUFtQztBQUNqRSxTQUFTLDZCQUE2QjtBQUN0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QU0sUUFBUSxFQUFFO0FBQUEsRUFDM0QsTUFBTTtBQUFBLEVBQ04sU0FBUyxDQUFDLGFBQStCO0FBQ3hDLFVBQU0sY0FBYyw2QkFBNkIsUUFBUTtBQUN6RCxRQUFJLENBQUMsYUFBYTtBQUNqQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGFBQWEsMEJBQTBCLElBQUksV0FBVztBQUM1RCxRQUFJLENBQUMsWUFBWTtBQUNoQjtBQUFBLElBQ0Q7QUFFQSxlQUFXLFlBQVk7QUFBQSxFQUN4QjtBQUNELENBQUM7QUFFRCxTQUFTLHdCQUF3QixRQUFpQixRQUFxQixzQkFBNkMsbUJBQXVDO0FBQzFKLFFBQU0sV0FBVyxJQUFJLFNBQVMsT0FBTyx5QkFBeUIsQ0FBQztBQUMvRCxTQUFPLFlBQVksUUFBUTtBQUMzQixTQUFPLHVCQUF1QixRQUFRO0FBQ3RDLE1BQUkscUJBQXFCLHdCQUF3QixHQUFHO0FBQ25ELFdBQU8sYUFBYSxFQUFFLGlCQUFpQixPQUFPLHlCQUF5QixhQUFhLEdBQUcsZUFBZSxPQUFPLHlCQUF5QixXQUFXLE9BQU8sVUFBVSxDQUFDO0FBQ25LLHNCQUFrQixvQkFBb0IsR0FBRyx5QkFBeUIsaUJBQWlCO0FBQUEsRUFDcEY7QUFDRDtBQUVBLGVBQWUsaUNBQWlDLFFBQWlCLDRCQUF5RDtBQUN6SCxRQUFNLGFBQWEsY0FBYyxNQUFNO0FBQ3ZDLFVBQVEsWUFBWTtBQUFBLElBQ25CLEtBQUssV0FBVztBQUNmLGlDQUEyQixXQUFXLG9CQUFvQixrQkFBa0IsRUFBRSxxQkFBcUIsTUFBTSxRQUFRLHNCQUFzQixDQUFDO0FBQ3hJO0FBQUEsSUFDRCxLQUFLLFdBQVc7QUFDZixpQ0FBMkIsV0FBVyxvQkFBb0IsaUJBQWlCLEVBQUUscUJBQXFCLE1BQU0sUUFBUSxzQkFBc0IsQ0FBQztBQUN2STtBQUFBLElBQ0QsS0FBSyxXQUFXO0FBQ2YsaUNBQTJCLFdBQVcsb0JBQW9CLGtCQUFrQixFQUFFLHFCQUFxQixNQUFNLFFBQVEsc0JBQXNCLENBQUM7QUFDeEk7QUFBQSxFQUNGO0FBQ0Q7QUFFQSxTQUFTLDZCQUE2QixVQUFnRDtBQUNyRixRQUFNLGNBQWMsU0FBUyxJQUFJLGtCQUFrQixFQUFFLGdCQUFnQjtBQUVyRSxhQUFXLGNBQWMsYUFBYTtBQUNyQyxRQUFJLFdBQVcsYUFBYSxLQUFLLHNCQUFzQiwwQkFBMEI7QUFDaEYsYUFBTyxXQUFXLGdCQUFnQjtBQUFBLElBQ25DO0FBQUEsRUFDRDtBQUVBLFNBQU8sZUFBZSxRQUFRO0FBQy9COyIsCiAgIm5hbWVzIjogWyJjaGFuZ2UiXQp9Cg==
