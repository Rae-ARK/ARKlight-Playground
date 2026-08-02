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
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { getBaseLayerHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegate2.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { List } from "../../../../base/browser/ui/list/listWidget.js";
import * as arrays from "../../../../base/common/arrays.js";
import { DeferredPromise, raceCancellation } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { assertType, isDefined } from "../../../../base/common/types.js";
import "./renameWidget.css";
import * as domFontInfo from "../../../browser/config/domFontInfo.js";
import { ContentWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { NewSymbolNameTag, NewSymbolNameTriggerKind } from "../../../common/languages.js";
import * as nls from "../../../../nls.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { getListStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import {
  editorWidgetBackground,
  inputBackground,
  inputBorder,
  inputForeground,
  quickInputListFocusBackground,
  quickInputListFocusForeground,
  widgetBorder,
  widgetShadow
} from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { HoverStyle } from "../../../../base/browser/ui/hover/hover.js";
const _sticky = false;
const CONTEXT_RENAME_INPUT_VISIBLE = new RawContextKey("renameInputVisible", false, nls.localize("renameInputVisible", "Whether the rename input widget is visible"));
const CONTEXT_RENAME_INPUT_FOCUSED = new RawContextKey("renameInputFocused", false, nls.localize("renameInputFocused", "Whether the rename input widget is focused"));
let RenameWidget = class {
  constructor(_editor, _acceptKeybindings, _themeService, _keybindingService, contextKeyService, _logService) {
    this._editor = _editor;
    this._acceptKeybindings = _acceptKeybindings;
    this._themeService = _themeService;
    this._keybindingService = _keybindingService;
    this._logService = _logService;
    // implement IContentWidget
    this.allowEditorOverflow = true;
    this._disposables = new DisposableStore();
    this._visibleContextKey = CONTEXT_RENAME_INPUT_VISIBLE.bindTo(contextKeyService);
    this._isEditingRenameCandidate = false;
    this._nRenameSuggestionsInvocations = 0;
    this._hadAutomaticRenameSuggestionsInvocation = false;
    this._candidates = /* @__PURE__ */ new Set();
    this._beforeFirstInputFieldEditSW = new StopWatch();
    this._inputWithButton = new InputWithButton();
    this._disposables.add(this._inputWithButton);
    this._editor.addContentWidget(this);
    this._disposables.add(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.fontInfo)) {
        this._updateFont();
      }
    }));
    this._disposables.add(_themeService.onDidColorThemeChange(this._updateStyles, this));
  }
  dispose() {
    this._disposables.dispose();
    this._editor.removeContentWidget(this);
  }
  getId() {
    return "__renameInputWidget";
  }
  getDomNode() {
    if (!this._domNode) {
      this._domNode = document.createElement("div");
      this._domNode.className = "monaco-editor rename-box";
      this._domNode.appendChild(this._inputWithButton.domNode);
      this._renameCandidateListView = this._disposables.add(
        new RenameCandidateListView(this._domNode, {
          fontInfo: this._editor.getOption(EditorOption.fontInfo),
          onFocusChange: (newSymbolName) => {
            this._inputWithButton.input.value = newSymbolName;
            this._isEditingRenameCandidate = false;
          },
          onSelectionChange: () => {
            this._isEditingRenameCandidate = false;
            this.acceptInput(false);
          }
        })
      );
      this._disposables.add(
        this._inputWithButton.onDidInputChange(() => {
          if (this._renameCandidateListView?.focusedCandidate !== void 0) {
            this._isEditingRenameCandidate = true;
          }
          this._timeBeforeFirstInputFieldEdit ??= this._beforeFirstInputFieldEditSW.elapsed();
          if (this._renameCandidateProvidersCts?.token.isCancellationRequested === false) {
            this._renameCandidateProvidersCts.cancel();
          }
          this._renameCandidateListView?.clearFocus();
        })
      );
      this._label = document.createElement("div");
      this._label.className = "rename-label";
      this._domNode.appendChild(this._label);
      this._updateFont();
      this._updateStyles(this._themeService.getColorTheme());
    }
    return this._domNode;
  }
  _updateStyles(theme) {
    if (!this._domNode) {
      return;
    }
    const widgetShadowColor = theme.getColor(widgetShadow);
    const widgetBorderColor = theme.getColor(widgetBorder);
    this._domNode.style.backgroundColor = String(theme.getColor(editorWidgetBackground) ?? "");
    this._domNode.style.boxShadow = widgetShadowColor ? ` 0 0 8px 2px ${widgetShadowColor}` : "";
    this._domNode.style.border = widgetBorderColor ? `1px solid ${widgetBorderColor}` : "";
    this._domNode.style.color = String(theme.getColor(inputForeground) ?? "");
    const border = theme.getColor(inputBorder);
    this._inputWithButton.domNode.style.backgroundColor = String(theme.getColor(inputBackground) ?? "");
    this._inputWithButton.input.style.backgroundColor = String(theme.getColor(inputBackground) ?? "");
    this._inputWithButton.domNode.style.borderWidth = border ? "1px" : "0px";
    this._inputWithButton.domNode.style.borderStyle = border ? "solid" : "none";
    this._inputWithButton.domNode.style.borderColor = border?.toString() ?? "none";
  }
  _updateFont() {
    if (this._domNode === void 0) {
      return;
    }
    assertType(this._label !== void 0, "RenameWidget#_updateFont: _label must not be undefined given _domNode is defined");
    this._editor.applyFontInfo(this._inputWithButton.input);
    const fontInfo = this._editor.getOption(EditorOption.fontInfo);
    this._label.style.fontSize = `${this._computeLabelFontSize(fontInfo.fontSize)}px`;
  }
  _computeLabelFontSize(editorFontSize) {
    return editorFontSize * 0.8;
  }
  getPosition() {
    if (!this._visible) {
      return null;
    }
    if (!this._editor.hasModel() || // @ulugbekna: shouldn't happen
    !this._editor.getDomNode()) {
      return null;
    }
    const bodyBox = dom.getClientArea(this.getDomNode().ownerDocument.body);
    const editorBox = dom.getDomNodePagePosition(this._editor.getDomNode());
    const cursorBoxTop = this._getTopForPosition();
    this._nPxAvailableAbove = cursorBoxTop + editorBox.top;
    this._nPxAvailableBelow = bodyBox.height - this._nPxAvailableAbove;
    const lineHeight = this._editor.getOption(EditorOption.lineHeight);
    const { totalHeight: candidateViewHeight } = RenameCandidateView.getLayoutInfo({ lineHeight });
    const positionPreference = this._nPxAvailableBelow > candidateViewHeight * 6 ? [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE] : [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW];
    return {
      position: this._position,
      preference: positionPreference
    };
  }
  beforeRender() {
    const [accept, preview] = this._acceptKeybindings;
    this._label.innerText = nls.localize({ key: "label", comment: ['placeholders are keybindings, e.g "F2 to Rename, Shift+F2 to Preview"'] }, "{0} to Rename, {1} to Preview", this._keybindingService.lookupKeybinding(accept)?.getLabel(), this._keybindingService.lookupKeybinding(preview)?.getLabel());
    this._domNode.style.minWidth = `200px`;
    return null;
  }
  afterRender(position) {
    if (position === null) {
      this.cancelInput(true, "afterRender (because position is null)");
      return;
    }
    if (!this._editor.hasModel() || // shouldn't happen
    !this._editor.getDomNode()) {
      return;
    }
    assertType(this._renameCandidateListView);
    assertType(this._nPxAvailableAbove !== void 0);
    assertType(this._nPxAvailableBelow !== void 0);
    const inputBoxHeight = dom.getTotalHeight(this._inputWithButton.domNode);
    const labelHeight = dom.getTotalHeight(this._label);
    let totalHeightAvailable;
    if (position === ContentWidgetPositionPreference.BELOW) {
      totalHeightAvailable = this._nPxAvailableBelow;
    } else {
      totalHeightAvailable = this._nPxAvailableAbove;
    }
    this._renameCandidateListView.layout({
      height: totalHeightAvailable - labelHeight - inputBoxHeight,
      width: dom.getTotalWidth(this._inputWithButton.domNode)
    });
  }
  acceptInput(wantsPreview) {
    this._trace(`invoking acceptInput`);
    this._currentAcceptInput?.(wantsPreview);
  }
  cancelInput(focusEditor, caller) {
    this._currentCancelInput?.(focusEditor);
  }
  focusNextRenameSuggestion() {
    if (!this._renameCandidateListView?.focusNext()) {
      this._inputWithButton.input.value = this._currentName;
    }
  }
  focusPreviousRenameSuggestion() {
    if (!this._renameCandidateListView?.focusPrevious()) {
      this._inputWithButton.input.value = this._currentName;
    }
  }
  /**
   * @param requestRenameCandidates is `undefined` when there are no rename suggestion providers
   */
  getInput(where, currentName, supportPreview, requestRenameCandidates, cts) {
    const { start: selectionStart, end: selectionEnd } = this._getSelection(where, currentName);
    this._renameCts = cts;
    const disposeOnDone = new DisposableStore();
    this._nRenameSuggestionsInvocations = 0;
    this._hadAutomaticRenameSuggestionsInvocation = false;
    if (requestRenameCandidates === void 0) {
      this._inputWithButton.button.style.display = "none";
    } else {
      this._inputWithButton.button.style.display = "flex";
      this._requestRenameCandidatesOnce = requestRenameCandidates;
      this._requestRenameCandidates(currentName, false);
      disposeOnDone.add(dom.addDisposableListener(
        this._inputWithButton.button,
        "click",
        () => this._requestRenameCandidates(currentName, true)
      ));
      disposeOnDone.add(dom.addDisposableListener(
        this._inputWithButton.button,
        dom.EventType.KEY_DOWN,
        (e) => {
          const keyEvent = new StandardKeyboardEvent(e);
          if (keyEvent.equals(KeyCode.Enter) || keyEvent.equals(KeyCode.Space)) {
            keyEvent.stopPropagation();
            keyEvent.preventDefault();
            this._requestRenameCandidates(currentName, true);
          }
        }
      ));
    }
    this._isEditingRenameCandidate = false;
    this._domNode.classList.toggle("preview", supportPreview);
    this._position = new Position(where.startLineNumber, where.startColumn);
    this._currentName = currentName;
    this._inputWithButton.input.value = currentName;
    this._inputWithButton.input.setAttribute("selectionStart", selectionStart.toString());
    this._inputWithButton.input.setAttribute("selectionEnd", selectionEnd.toString());
    this._inputWithButton.input.size = Math.max((where.endColumn - where.startColumn) * 1.1, 20);
    this._beforeFirstInputFieldEditSW.reset();
    disposeOnDone.add(toDisposable(() => {
      this._renameCts = void 0;
      cts.dispose(true);
    }));
    disposeOnDone.add(toDisposable(() => {
      if (this._renameCandidateProvidersCts !== void 0) {
        this._renameCandidateProvidersCts.dispose(true);
        this._renameCandidateProvidersCts = void 0;
      }
    }));
    disposeOnDone.add(toDisposable(() => this._candidates.clear()));
    const inputResult = new DeferredPromise();
    inputResult.p.finally(() => {
      disposeOnDone.dispose();
      this._hide();
    });
    this._currentCancelInput = (focusEditor) => {
      this._trace("invoking _currentCancelInput");
      this._currentAcceptInput = void 0;
      this._currentCancelInput = void 0;
      this._renameCandidateListView?.clearCandidates();
      inputResult.complete(focusEditor);
      return true;
    };
    this._currentAcceptInput = (wantsPreview) => {
      this._trace("invoking _currentAcceptInput");
      assertType(this._renameCandidateListView !== void 0);
      const nRenameSuggestions = this._renameCandidateListView.nCandidates;
      let newName;
      let source;
      const focusedCandidate = this._renameCandidateListView.focusedCandidate;
      if (focusedCandidate !== void 0) {
        this._trace("using new name from renameSuggestion");
        newName = focusedCandidate;
        source = { k: "renameSuggestion" };
      } else {
        this._trace("using new name from inputField");
        newName = this._inputWithButton.input.value;
        source = this._isEditingRenameCandidate ? { k: "userEditedRenameSuggestion" } : { k: "inputField" };
      }
      if (newName === currentName || newName.trim().length === 0) {
        this.cancelInput(true, "_currentAcceptInput (because newName === value || newName.trim().length === 0)");
        return;
      }
      this._currentAcceptInput = void 0;
      this._currentCancelInput = void 0;
      this._renameCandidateListView.clearCandidates();
      inputResult.complete({
        newName,
        wantsPreview: supportPreview && wantsPreview,
        stats: {
          source,
          nRenameSuggestions,
          timeBeforeFirstInputFieldEdit: this._timeBeforeFirstInputFieldEdit,
          nRenameSuggestionsInvocations: this._nRenameSuggestionsInvocations,
          hadAutomaticRenameSuggestionsInvocation: this._hadAutomaticRenameSuggestionsInvocation
        }
      });
    };
    disposeOnDone.add(cts.token.onCancellationRequested(() => this.cancelInput(true, "cts.token.onCancellationRequested")));
    if (!_sticky) {
      disposeOnDone.add(this._editor.onDidBlurEditorWidget(() => this.cancelInput(!this._domNode?.ownerDocument.hasFocus(), "editor.onDidBlurEditorWidget")));
    }
    this._show();
    return inputResult.p;
  }
  _requestRenameCandidates(currentName, isManuallyTriggered) {
    if (this._requestRenameCandidatesOnce === void 0) {
      return;
    }
    if (this._renameCandidateProvidersCts !== void 0) {
      this._renameCandidateProvidersCts.dispose(true);
    }
    assertType(this._renameCts);
    if (this._inputWithButton.buttonState !== "stop") {
      this._renameCandidateProvidersCts = new CancellationTokenSource();
      const triggerKind = isManuallyTriggered ? NewSymbolNameTriggerKind.Invoke : NewSymbolNameTriggerKind.Automatic;
      const candidates = this._requestRenameCandidatesOnce(triggerKind, this._renameCandidateProvidersCts.token);
      if (candidates.length === 0) {
        this._inputWithButton.setSparkleButton();
        return;
      }
      if (!isManuallyTriggered) {
        this._hadAutomaticRenameSuggestionsInvocation = true;
      }
      this._nRenameSuggestionsInvocations += 1;
      this._inputWithButton.setStopButton();
      this._updateRenameCandidates(candidates, currentName, this._renameCts.token);
    }
  }
  /**
   * This allows selecting only part of the symbol name in the input field based on the selection in the editor
   */
  _getSelection(where, currentName) {
    assertType(this._editor.hasModel());
    const selection = this._editor.getSelection();
    let start = 0;
    let end = currentName.length;
    if (!Range.isEmpty(selection) && !Range.spansMultipleLines(selection) && Range.containsRange(where, selection)) {
      start = Math.max(0, selection.startColumn - where.startColumn);
      end = Math.min(where.endColumn, selection.endColumn) - where.startColumn;
    }
    return { start, end };
  }
  _show() {
    this._trace("invoking _show");
    this._editor.revealLineInCenterIfOutsideViewport(this._position.lineNumber, ScrollType.Smooth);
    this._visible = true;
    this._visibleContextKey.set(true);
    this._editor.layoutContentWidget(this);
    setTimeout(() => {
      this._inputWithButton.input.focus();
      this._inputWithButton.input.setSelectionRange(
        parseInt(this._inputWithButton.input.getAttribute("selectionStart")),
        parseInt(this._inputWithButton.input.getAttribute("selectionEnd"))
      );
    }, 100);
  }
  async _updateRenameCandidates(candidates, currentName, token) {
    const trace = (...args) => this._trace("_updateRenameCandidates", ...args);
    trace("start");
    const namesListResults = await raceCancellation(Promise.allSettled(candidates), token);
    this._inputWithButton.setSparkleButton();
    if (namesListResults === void 0) {
      trace("returning early - received updateRenameCandidates results - undefined");
      return;
    }
    const newNames = namesListResults.flatMap(
      (namesListResult) => namesListResult.status === "fulfilled" && isDefined(namesListResult.value) ? namesListResult.value : []
    );
    trace(`received updateRenameCandidates results - total (unfiltered) ${newNames.length} candidates.`);
    const distinctNames = arrays.distinct(newNames, (v) => v.newSymbolName);
    trace(`distinct candidates - ${distinctNames.length} candidates.`);
    const validDistinctNames = distinctNames.filter(({ newSymbolName }) => newSymbolName.trim().length > 0 && newSymbolName !== this._inputWithButton.input.value && newSymbolName !== currentName && !this._candidates.has(newSymbolName));
    trace(`valid distinct candidates - ${newNames.length} candidates.`);
    validDistinctNames.forEach((n) => this._candidates.add(n.newSymbolName));
    if (validDistinctNames.length < 1) {
      trace("returning early - no valid distinct candidates");
      return;
    }
    trace("setting candidates");
    this._renameCandidateListView.setCandidates(validDistinctNames);
    trace("asking editor to re-layout");
    this._editor.layoutContentWidget(this);
  }
  _hide() {
    this._trace("invoked _hide");
    this._visible = false;
    this._visibleContextKey.reset();
    this._editor.layoutContentWidget(this);
  }
  _getTopForPosition() {
    const visibleRanges = this._editor.getVisibleRanges();
    let firstLineInViewport;
    if (visibleRanges.length > 0) {
      firstLineInViewport = visibleRanges[0].startLineNumber;
    } else {
      this._logService.warn("RenameWidget#_getTopForPosition: this should not happen - visibleRanges is empty");
      firstLineInViewport = Math.max(1, this._position.lineNumber - 5);
    }
    return this._editor.getTopForLineNumber(this._position.lineNumber) - this._editor.getTopForLineNumber(firstLineInViewport);
  }
  _trace(...args) {
    this._logService.trace("RenameWidget", ...args);
  }
};
RenameWidget = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, ILogService)
], RenameWidget);
class RenameCandidateListView {
  // FIXME@ulugbekna: rewrite using event emitters
  constructor(parent, opts) {
    this._disposables = new DisposableStore();
    this._availableHeight = 0;
    this._minimumWidth = 0;
    this._lineHeight = opts.fontInfo.lineHeight;
    this._typicalHalfwidthCharacterWidth = opts.fontInfo.typicalHalfwidthCharacterWidth;
    this._listContainer = document.createElement("div");
    this._listContainer.className = "rename-box rename-candidate-list-container";
    parent.appendChild(this._listContainer);
    this._listWidget = RenameCandidateListView._createListWidget(this._listContainer, this._candidateViewHeight, opts.fontInfo);
    this._disposables.add(this._listWidget.onDidChangeFocus(
      (e) => {
        if (e.elements.length === 1) {
          opts.onFocusChange(e.elements[0].newSymbolName);
        }
      },
      this._disposables
    ));
    this._disposables.add(this._listWidget.onDidChangeSelection(
      (e) => {
        if (e.elements.length === 1) {
          opts.onSelectionChange();
        }
      },
      this._disposables
    ));
    this._disposables.add(
      this._listWidget.onDidBlur((e) => {
        this._listWidget.setFocus([]);
      })
    );
    this._listWidget.style(getListStyles({
      listInactiveFocusForeground: quickInputListFocusForeground,
      listInactiveFocusBackground: quickInputListFocusBackground
    }));
  }
  dispose() {
    this._listWidget.dispose();
    this._disposables.dispose();
  }
  // height - max height allowed by parent element
  layout({ height, width }) {
    this._availableHeight = height;
    this._minimumWidth = width;
  }
  setCandidates(candidates) {
    this._listWidget.splice(0, 0, candidates);
    const height = this._pickListHeight(this._listWidget.length);
    const width = this._pickListWidth(candidates);
    this._listWidget.layout(height, width);
    this._listContainer.style.height = `${height}px`;
    this._listContainer.style.width = `${width}px`;
    aria.status(nls.localize("renameSuggestionsReceivedAria", "Received {0} rename suggestions", candidates.length));
  }
  clearCandidates() {
    this._listContainer.style.height = "0px";
    this._listContainer.style.width = "0px";
    this._listWidget.splice(0, this._listWidget.length, []);
  }
  get nCandidates() {
    return this._listWidget.length;
  }
  get focusedCandidate() {
    if (this._listWidget.length === 0) {
      return;
    }
    const selectedElement = this._listWidget.getSelectedElements()[0];
    if (selectedElement !== void 0) {
      return selectedElement.newSymbolName;
    }
    const focusedElement = this._listWidget.getFocusedElements()[0];
    if (focusedElement !== void 0) {
      return focusedElement.newSymbolName;
    }
    return;
  }
  focusNext() {
    if (this._listWidget.length === 0) {
      return false;
    }
    const focusedIxs = this._listWidget.getFocus();
    if (focusedIxs.length === 0) {
      this._listWidget.focusFirst();
      this._listWidget.reveal(0);
      return true;
    } else {
      if (focusedIxs[0] === this._listWidget.length - 1) {
        this._listWidget.setFocus([]);
        this._listWidget.reveal(0);
        return false;
      } else {
        this._listWidget.focusNext();
        const focused = this._listWidget.getFocus()[0];
        this._listWidget.reveal(focused);
        return true;
      }
    }
  }
  /**
   * @returns true if focus is moved to previous element
   */
  focusPrevious() {
    if (this._listWidget.length === 0) {
      return false;
    }
    const focusedIxs = this._listWidget.getFocus();
    if (focusedIxs.length === 0) {
      this._listWidget.focusLast();
      const focused = this._listWidget.getFocus()[0];
      this._listWidget.reveal(focused);
      return true;
    } else {
      if (focusedIxs[0] === 0) {
        this._listWidget.setFocus([]);
        return false;
      } else {
        this._listWidget.focusPrevious();
        const focused = this._listWidget.getFocus()[0];
        this._listWidget.reveal(focused);
        return true;
      }
    }
  }
  clearFocus() {
    this._listWidget.setFocus([]);
  }
  get _candidateViewHeight() {
    const { totalHeight } = RenameCandidateView.getLayoutInfo({ lineHeight: this._lineHeight });
    return totalHeight;
  }
  _pickListHeight(nCandidates) {
    const heightToFitAllCandidates = this._candidateViewHeight * nCandidates;
    const MAX_N_CANDIDATES = 7;
    const height = Math.min(heightToFitAllCandidates, this._availableHeight, this._candidateViewHeight * MAX_N_CANDIDATES);
    return height;
  }
  _pickListWidth(candidates) {
    const longestCandidateWidth = Math.ceil(Math.max(...candidates.map((c) => c.newSymbolName.length)) * this._typicalHalfwidthCharacterWidth);
    const width = Math.max(
      this._minimumWidth,
      4 + 16 + 5 + longestCandidateWidth + 10
      /* (possibly visible) scrollbar width */
      // TODO@ulugbekna: approximate calc - clean this up
    );
    return width;
  }
  static _createListWidget(container, candidateViewHeight, fontInfo) {
    const virtualDelegate = new class {
      getTemplateId(element) {
        return "candidate";
      }
      getHeight(element) {
        return candidateViewHeight;
      }
    }();
    const renderer = new class {
      constructor() {
        this.templateId = "candidate";
      }
      renderTemplate(container2) {
        return new RenameCandidateView(container2, fontInfo);
      }
      renderElement(candidate, index, templateData) {
        templateData.populate(candidate);
      }
      disposeTemplate(templateData) {
        templateData.dispose();
      }
    }();
    return new List(
      "NewSymbolNameCandidates",
      container,
      virtualDelegate,
      [renderer],
      {
        keyboardSupport: false,
        // @ulugbekna: because we handle keyboard events through proper commands & keybinding service, see `rename.ts`
        mouseSupport: true,
        multipleSelectionSupport: false
      }
    );
  }
}
class InputWithButton {
  constructor() {
    this._buttonHoverContent = "";
    this._disposables = new DisposableStore();
    this._onDidInputChange = this._disposables.add(new Emitter());
    this.onDidInputChange = this._onDidInputChange.event;
  }
  get domNode() {
    if (!this._domNode) {
      this._domNode = document.createElement("div");
      this._domNode.className = "rename-input-with-button";
      this._domNode.style.display = "flex";
      this._domNode.style.flexDirection = "row";
      this._domNode.style.alignItems = "center";
      this._inputNode = document.createElement("input");
      this._inputNode.className = "rename-input";
      this._inputNode.type = "text";
      this._inputNode.style.border = "none";
      this._inputNode.setAttribute("aria-label", nls.localize("renameAriaLabel", "Rename input. Type new name and press Enter to commit."));
      this._domNode.appendChild(this._inputNode);
      this._buttonNode = document.createElement("div");
      this._buttonNode.className = "rename-suggestions-button";
      this._buttonNode.setAttribute("tabindex", "0");
      this._buttonGenHoverText = nls.localize("generateRenameSuggestionsButton", "Generate New Name Suggestions");
      this._buttonCancelHoverText = nls.localize("cancelRenameSuggestionsButton", "Cancel");
      this._buttonHoverContent = this._buttonGenHoverText;
      this._disposables.add(getBaseLayerHoverDelegate().setupDelayedHover(this._buttonNode, () => ({
        content: this._buttonHoverContent,
        style: HoverStyle.Pointer
      })));
      this._domNode.appendChild(this._buttonNode);
      this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.INPUT, () => this._onDidInputChange.fire()));
      this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.KEY_DOWN, (e) => {
        const keyEvent = new StandardKeyboardEvent(e);
        if (keyEvent.keyCode === KeyCode.LeftArrow || keyEvent.keyCode === KeyCode.RightArrow) {
          this._onDidInputChange.fire();
        }
      }));
      this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.CLICK, () => this._onDidInputChange.fire()));
      this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.FOCUS, () => {
        this.domNode.style.outlineWidth = "1px";
        this.domNode.style.outlineStyle = "solid";
        this.domNode.style.outlineOffset = "-1px";
        this.domNode.style.outlineColor = "var(--vscode-focusBorder)";
      }));
      this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.BLUR, () => {
        this.domNode.style.outline = "none";
      }));
    }
    return this._domNode;
  }
  get input() {
    assertType(this._inputNode);
    return this._inputNode;
  }
  get button() {
    assertType(this._buttonNode);
    return this._buttonNode;
  }
  get buttonState() {
    return this._buttonState;
  }
  setSparkleButton() {
    this._buttonState = "sparkle";
    this._sparkleIcon ??= renderIcon(Codicon.sparkle);
    dom.clearNode(this.button);
    this.button.appendChild(this._sparkleIcon);
    this.button.setAttribute("aria-label", "Generating new name suggestions");
    this._buttonHoverContent = this._buttonGenHoverText;
    this.input.focus();
  }
  setStopButton() {
    this._buttonState = "stop";
    this._stopIcon ??= renderIcon(Codicon.stopCircle);
    dom.clearNode(this.button);
    this.button.appendChild(this._stopIcon);
    this.button.setAttribute("aria-label", "Cancel generating new name suggestions");
    this._buttonHoverContent = this._buttonCancelHoverText;
    this.input.focus();
  }
  dispose() {
    this._disposables.dispose();
  }
}
const _RenameCandidateView = class _RenameCandidateView {
  constructor(parent, fontInfo) {
    this._domNode = document.createElement("div");
    this._domNode.className = "rename-box rename-candidate";
    this._domNode.style.display = `flex`;
    this._domNode.style.columnGap = `5px`;
    this._domNode.style.alignItems = `center`;
    this._domNode.style.height = `${fontInfo.lineHeight}px`;
    this._domNode.style.padding = `${_RenameCandidateView._PADDING}px`;
    const iconContainer = document.createElement("div");
    iconContainer.style.display = `flex`;
    iconContainer.style.alignItems = `center`;
    iconContainer.style.width = iconContainer.style.height = `${fontInfo.lineHeight * 0.8}px`;
    this._domNode.appendChild(iconContainer);
    this._icon = renderIcon(Codicon.sparkle);
    this._icon.style.display = `none`;
    iconContainer.appendChild(this._icon);
    this._label = document.createElement("div");
    domFontInfo.applyFontInfo(this._label, fontInfo);
    this._domNode.appendChild(this._label);
    parent.appendChild(this._domNode);
  }
  populate(value) {
    this._updateIcon(value);
    this._updateLabel(value);
  }
  _updateIcon(value) {
    const isAIGenerated = !!value.tags?.includes(NewSymbolNameTag.AIGenerated);
    this._icon.style.display = isAIGenerated ? "inherit" : "none";
  }
  _updateLabel(value) {
    this._label.innerText = value.newSymbolName;
  }
  static getLayoutInfo({ lineHeight }) {
    const totalHeight = lineHeight + _RenameCandidateView._PADDING * 2;
    return { totalHeight };
  }
  dispose() {
  }
};
_RenameCandidateView._PADDING = 2;
let RenameCandidateView = _RenameCandidateView;
export {
  CONTEXT_RENAME_INPUT_FOCUSED,
  CONTEXT_RENAME_INPUT_VISIBLE,
  RenameWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3JlbmFtZS9icm93c2VyL3JlbmFtZVdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCAqIGFzIGFyaWEgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBnZXRCYXNlTGF5ZXJIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUyLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSUxpc3RSZW5kZXJlciwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCAqIGFzIGFycmF5cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCByYWNlQ2FuY2VsbGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSwgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICcuL3JlbmFtZVdpZGdldC5jc3MnO1xuaW1wb3J0ICogYXMgZG9tRm9udEluZm8gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb25maWcvZG9tRm9udEluZm8uanMnO1xuaW1wb3J0IHsgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSwgSUNvZGVFZGl0b3IsIElDb250ZW50V2lkZ2V0LCBJQ29udGVudFdpZGdldFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBGb250SW5mbyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZm9udEluZm8uanMnO1xuaW1wb3J0IHsgSURpbWVuc2lvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlLzJkL2RpbWVuc2lvbi5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBOZXdTeW1ib2xOYW1lLCBOZXdTeW1ib2xOYW1lVGFnLCBOZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQsIFByb3ZpZGVyUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBnZXRMaXN0U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7XG5cdGVkaXRvcldpZGdldEJhY2tncm91bmQsXG5cdGlucHV0QmFja2dyb3VuZCxcblx0aW5wdXRCb3JkZXIsXG5cdGlucHV0Rm9yZWdyb3VuZCxcblx0cXVpY2tJbnB1dExpc3RGb2N1c0JhY2tncm91bmQsXG5cdHF1aWNrSW5wdXRMaXN0Rm9jdXNGb3JlZ3JvdW5kLFxuXHR3aWRnZXRCb3JkZXIsXG5cdHdpZGdldFNoYWRvd1xufSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSwgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSG92ZXJTdHlsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5cbi8qKiBmb3IgZGVidWdnaW5nICovXG5jb25zdCBfc3RpY2t5ID0gZmFsc2Vcblx0Ly8gfHwgQm9vbGVhbihcInRydWVcIikgLy8gZG9uZSBcIndlaXJkbHlcIiBzbyB0aGF0IGEgbGludCB3YXJuaW5nIHByZXZlbnRzIHlvdSBmcm9tIHB1c2hpbmcgdGhpc1xuXHQ7XG5cblxuZXhwb3J0IGNvbnN0IENPTlRFWFRfUkVOQU1FX0lOUFVUX1ZJU0lCTEUgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigncmVuYW1lSW5wdXRWaXNpYmxlJywgZmFsc2UsIG5scy5sb2NhbGl6ZSgncmVuYW1lSW5wdXRWaXNpYmxlJywgXCJXaGV0aGVyIHRoZSByZW5hbWUgaW5wdXQgd2lkZ2V0IGlzIHZpc2libGVcIikpO1xuZXhwb3J0IGNvbnN0IENPTlRFWFRfUkVOQU1FX0lOUFVUX0ZPQ1VTRUQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigncmVuYW1lSW5wdXRGb2N1c2VkJywgZmFsc2UsIG5scy5sb2NhbGl6ZSgncmVuYW1lSW5wdXRGb2N1c2VkJywgXCJXaGV0aGVyIHRoZSByZW5hbWUgaW5wdXQgd2lkZ2V0IGlzIGZvY3VzZWRcIikpO1xuXG4vKipcbiAqIFwiU291cmNlXCIgb2YgdGhlIG5ldyBuYW1lOlxuICogLSAnaW5wdXRGaWVsZCcgLSB1c2VyIGVudGVyZWQgdGhlIG5ldyBuYW1lXG4gKiAtICdyZW5hbWVTdWdnZXN0aW9uJyAtIHVzZXIgcGlja2VkIGZyb20gcmVuYW1lIHN1Z2dlc3Rpb25zXG4gKiAtICd1c2VyRWRpdGVkUmVuYW1lU3VnZ2VzdGlvbicgLSB1c2VyIF9saWtlbHlfIGVkaXRlZCBhIHJlbmFtZSBzdWdnZXN0aW9uIChcImxpa2VseVwiIGJlY2F1c2Ugd2hlbiBpbnB1dCBzdGFydGVkIGJlaW5nIGVkaXRlZCwgYSByZW5hbWUgc3VnZ2VzdGlvbiBoYWQgZm9jdXMpXG4gKi9cbmV4cG9ydCB0eXBlIE5ld05hbWVTb3VyY2UgPVxuXHR8IHsgazogJ2lucHV0RmllbGQnIH1cblx0fCB7IGs6ICdyZW5hbWVTdWdnZXN0aW9uJyB9XG5cdHwgeyBrOiAndXNlckVkaXRlZFJlbmFtZVN1Z2dlc3Rpb24nIH07XG5cbi8qKlxuICogVmFyaW91cyBzdGF0aXN0aWNzIHJlZ2FyZGluZyByZW5hbWUgaW5wdXQgZmllbGRcbiAqL1xuZXhwb3J0IHR5cGUgUmVuYW1lV2lkZ2V0U3RhdHMgPSB7XG5cdG5SZW5hbWVTdWdnZXN0aW9uczogbnVtYmVyO1xuXHRzb3VyY2U6IE5ld05hbWVTb3VyY2U7XG5cdHRpbWVCZWZvcmVGaXJzdElucHV0RmllbGRFZGl0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdG5SZW5hbWVTdWdnZXN0aW9uc0ludm9jYXRpb25zOiBudW1iZXI7XG5cdGhhZEF1dG9tYXRpY1JlbmFtZVN1Z2dlc3Rpb25zSW52b2NhdGlvbjogYm9vbGVhbjtcbn07XG5cbmV4cG9ydCB0eXBlIFJlbmFtZVdpZGdldFJlc3VsdCA9IHtcblx0LyoqXG5cdCAqIFRoZSBuZXcgbmFtZSB0byBiZSB1c2VkXG5cdCAqL1xuXHRuZXdOYW1lOiBzdHJpbmc7XG5cdHdhbnRzUHJldmlldz86IGJvb2xlYW47XG5cdHN0YXRzOiBSZW5hbWVXaWRnZXRTdGF0cztcbn07XG5cbmludGVyZmFjZSBJUmVuYW1lV2lkZ2V0IHtcblx0LyoqXG5cdCAqIEByZXR1cm5zIGEgYGJvb2xlYW5gIHN0YW5kaW5nIGZvciBgc2hvdWxkRm9jdXNFZGl0b3JgLCBpZiB1c2VyIGRpZG4ndCBwaWNrIGEgbmV3IG5hbWUsIG9yIGEge0BsaW5rIFJlbmFtZVdpZGdldFJlc3VsdH1cblx0ICovXG5cdGdldElucHV0KFxuXHRcdHdoZXJlOiBJUmFuZ2UsXG5cdFx0Y3VycmVudE5hbWU6IHN0cmluZyxcblx0XHRzdXBwb3J0UHJldmlldzogYm9vbGVhbixcblx0XHRyZXF1ZXN0UmVuYW1lU3VnZ2VzdGlvbnM6ICh0cmlnZ2VyS2luZDogTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kLCBjdHM6IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm92aWRlclJlc3VsdDxOZXdTeW1ib2xOYW1lW10+W10sXG5cdFx0Y3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZVxuXHQpOiBQcm9taXNlPFJlbmFtZVdpZGdldFJlc3VsdCB8IGJvb2xlYW4+O1xuXG5cdGFjY2VwdElucHV0KHdhbnRzUHJldmlldzogYm9vbGVhbik6IHZvaWQ7XG5cdGNhbmNlbElucHV0KGZvY3VzRWRpdG9yOiBib29sZWFuLCBjYWxsZXI6IHN0cmluZyk6IHZvaWQ7XG5cblx0Zm9jdXNOZXh0UmVuYW1lU3VnZ2VzdGlvbigpOiB2b2lkO1xuXHRmb2N1c1ByZXZpb3VzUmVuYW1lU3VnZ2VzdGlvbigpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgUmVuYW1lV2lkZ2V0IGltcGxlbWVudHMgSVJlbmFtZVdpZGdldCwgSUNvbnRlbnRXaWRnZXQsIElEaXNwb3NhYmxlIHtcblxuXHQvLyBpbXBsZW1lbnQgSUNvbnRlbnRXaWRnZXRcblx0cmVhZG9ubHkgYWxsb3dFZGl0b3JPdmVyZmxvdzogYm9vbGVhbiA9IHRydWU7XG5cblx0Ly8gVUkgc3RhdGVcblxuXHRwcml2YXRlIF9kb21Ob2RlPzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2lucHV0V2l0aEJ1dHRvbjogSW5wdXRXaXRoQnV0dG9uO1xuXHRwcml2YXRlIF9yZW5hbWVDYW5kaWRhdGVMaXN0Vmlldz86IFJlbmFtZUNhbmRpZGF0ZUxpc3RWaWV3O1xuXHRwcml2YXRlIF9sYWJlbD86IEhUTUxEaXZFbGVtZW50O1xuXG5cdHByaXZhdGUgX25QeEF2YWlsYWJsZUFib3ZlPzogbnVtYmVyO1xuXHRwcml2YXRlIF9uUHhBdmFpbGFibGVCZWxvdz86IG51bWJlcjtcblxuXHQvLyBNb2RlbCBzdGF0ZVxuXG5cdHByaXZhdGUgX3Bvc2l0aW9uPzogUG9zaXRpb247XG5cdHByaXZhdGUgX2N1cnJlbnROYW1lPzogc3RyaW5nO1xuXHQvKiogSXMgdHJ1ZSBpZiBpbnB1dCBmaWVsZCBnb3QgY2hhbmdlcyB3aGVuIGEgcmVuYW1lIGNhbmRpZGF0ZSB3YXMgZm9jdXNlZDsgb3RoZXJ3aXNlLCBmYWxzZSAqL1xuXHRwcml2YXRlIF9pc0VkaXRpbmdSZW5hbWVDYW5kaWRhdGU6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2FuZGlkYXRlczogU2V0PHN0cmluZz47XG5cblx0cHJpdmF0ZSBfdmlzaWJsZT86IGJvb2xlYW47XG5cblx0LyoqIG11c3QgYmUgcmVzZXQgYXQgc2Vzc2lvbiBzdGFydCAqL1xuXHRwcml2YXRlIF9iZWZvcmVGaXJzdElucHV0RmllbGRFZGl0U1c6IFN0b3BXYXRjaDtcblxuXHQvKipcblx0ICogTWlsbGlzZWNvbmRzIGJlZm9yZSB1c2VyIGVkaXRzIHRoZSBpbnB1dCBmaWVsZCBmb3IgdGhlIGZpcnN0IHRpbWVcblx0ICogQHJlbWFya3MgbXVzdCBiZSBzZXQgb25jZSBwZXIgc2Vzc2lvblxuXHQgKi9cblx0cHJpdmF0ZSBfdGltZUJlZm9yZUZpcnN0SW5wdXRGaWVsZEVkaXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9uUmVuYW1lU3VnZ2VzdGlvbnNJbnZvY2F0aW9uczogbnVtYmVyO1xuXG5cdHByaXZhdGUgX2hhZEF1dG9tYXRpY1JlbmFtZVN1Z2dlc3Rpb25zSW52b2NhdGlvbjogYm9vbGVhbjtcblxuXHRwcml2YXRlIF9yZW5hbWVDYW5kaWRhdGVQcm92aWRlcnNDdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZW5hbWVDdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Zpc2libGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hY2NlcHRLZXliaW5kaW5nczogW3N0cmluZywgc3RyaW5nXSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX3Zpc2libGVDb250ZXh0S2V5ID0gQ09OVEVYVF9SRU5BTUVfSU5QVVRfVklTSUJMRS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5faXNFZGl0aW5nUmVuYW1lQ2FuZGlkYXRlID0gZmFsc2U7XG5cblx0XHR0aGlzLl9uUmVuYW1lU3VnZ2VzdGlvbnNJbnZvY2F0aW9ucyA9IDA7XG5cblx0XHR0aGlzLl9oYWRBdXRvbWF0aWNSZW5hbWVTdWdnZXN0aW9uc0ludm9jYXRpb24gPSBmYWxzZTtcblxuXHRcdHRoaXMuX2NhbmRpZGF0ZXMgPSBuZXcgU2V0KCk7XG5cblx0XHR0aGlzLl9iZWZvcmVGaXJzdElucHV0RmllbGRFZGl0U1cgPSBuZXcgU3RvcFdhdGNoKCk7XG5cblx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24gPSBuZXcgSW5wdXRXaXRoQnV0dG9uKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2lucHV0V2l0aEJ1dHRvbik7XG5cblx0XHR0aGlzLl9lZGl0b3IuYWRkQ29udGVudFdpZGdldCh0aGlzKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9udEluZm8pKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUZvbnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoX3RoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UodGhpcy5fdXBkYXRlU3R5bGVzLCB0aGlzKSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9lZGl0b3IucmVtb3ZlQ29udGVudFdpZGdldCh0aGlzKTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdfX3JlbmFtZUlucHV0V2lkZ2V0Jztcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdGlmICghdGhpcy5fZG9tTm9kZSkge1xuXHRcdFx0dGhpcy5fZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc05hbWUgPSAnbW9uYWNvLWVkaXRvciByZW5hbWUtYm94JztcblxuXHRcdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9pbnB1dFdpdGhCdXR0b24uZG9tTm9kZSk7XG5cblx0XHRcdHRoaXMuX3JlbmFtZUNhbmRpZGF0ZUxpc3RWaWV3ID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0XHRuZXcgUmVuYW1lQ2FuZGlkYXRlTGlzdFZpZXcodGhpcy5fZG9tTm9kZSwge1xuXHRcdFx0XHRcdGZvbnRJbmZvOiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250SW5mbyksXG5cdFx0XHRcdFx0b25Gb2N1c0NoYW5nZTogKG5ld1N5bWJvbE5hbWU6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLmlucHV0LnZhbHVlID0gbmV3U3ltYm9sTmFtZTtcblx0XHRcdFx0XHRcdHRoaXMuX2lzRWRpdGluZ1JlbmFtZUNhbmRpZGF0ZSA9IGZhbHNlOyAvLyBAdWx1Z2Jla25hOiByZXNldFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0b25TZWxlY3Rpb25DaGFuZ2U6ICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2lzRWRpdGluZ1JlbmFtZUNhbmRpZGF0ZSA9IGZhbHNlOyAvLyBAdWx1Z2Jla25hOiBiZWNhdXNlIHVzZXIgcGlja2VkIGEgcmVuYW1lIHN1Z2dlc3Rpb25cblx0XHRcdFx0XHRcdHRoaXMuYWNjZXB0SW5wdXQoZmFsc2UpOyAvLyB3ZSBkb24ndCBhbGxvdyBwcmV2aWV3IHdpdGggbW91c2UgY2xpY2sgZm9yIG5vd1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSlcblx0XHRcdCk7XG5cblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChcblx0XHRcdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLm9uRGlkSW5wdXRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9yZW5hbWVDYW5kaWRhdGVMaXN0Vmlldz8uZm9jdXNlZENhbmRpZGF0ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9pc0VkaXRpbmdSZW5hbWVDYW5kaWRhdGUgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl90aW1lQmVmb3JlRmlyc3RJbnB1dEZpZWxkRWRpdCA/Pz0gdGhpcy5fYmVmb3JlRmlyc3RJbnB1dEZpZWxkRWRpdFNXLmVsYXBzZWQoKTtcblx0XHRcdFx0XHRpZiAodGhpcy5fcmVuYW1lQ2FuZGlkYXRlUHJvdmlkZXJzQ3RzPy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCA9PT0gZmFsc2UpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3JlbmFtZUNhbmRpZGF0ZVByb3ZpZGVyc0N0cy5jYW5jZWwoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fcmVuYW1lQ2FuZGlkYXRlTGlzdFZpZXc/LmNsZWFyRm9jdXMoKTtcblx0XHRcdFx0fSlcblx0XHRcdCk7XG5cblx0XHRcdHRoaXMuX2xhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHR0aGlzLl9sYWJlbC5jbGFzc05hbWUgPSAncmVuYW1lLWxhYmVsJztcblx0XHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fbGFiZWwpO1xuXG5cdFx0XHR0aGlzLl91cGRhdGVGb250KCk7XG5cdFx0XHR0aGlzLl91cGRhdGVTdHlsZXModGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9kb21Ob2RlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU3R5bGVzKHRoZW1lOiBJQ29sb3JUaGVtZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZG9tTm9kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpZGdldFNoYWRvd0NvbG9yID0gdGhlbWUuZ2V0Q29sb3Iod2lkZ2V0U2hhZG93KTtcblx0XHRjb25zdCB3aWRnZXRCb3JkZXJDb2xvciA9IHRoZW1lLmdldENvbG9yKHdpZGdldEJvcmRlcik7XG5cdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBTdHJpbmcodGhlbWUuZ2V0Q29sb3IoZWRpdG9yV2lkZ2V0QmFja2dyb3VuZCkgPz8gJycpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuYm94U2hhZG93ID0gd2lkZ2V0U2hhZG93Q29sb3IgPyBgIDAgMCA4cHggMnB4ICR7d2lkZ2V0U2hhZG93Q29sb3J9YCA6ICcnO1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuYm9yZGVyID0gd2lkZ2V0Qm9yZGVyQ29sb3IgPyBgMXB4IHNvbGlkICR7d2lkZ2V0Qm9yZGVyQ29sb3J9YCA6ICcnO1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuY29sb3IgPSBTdHJpbmcodGhlbWUuZ2V0Q29sb3IoaW5wdXRGb3JlZ3JvdW5kKSA/PyAnJyk7XG5cblx0XHRjb25zdCBib3JkZXIgPSB0aGVtZS5nZXRDb2xvcihpbnB1dEJvcmRlcik7XG5cblx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24uZG9tTm9kZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBTdHJpbmcodGhlbWUuZ2V0Q29sb3IoaW5wdXRCYWNrZ3JvdW5kKSA/PyAnJyk7XG5cdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLmlucHV0LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFN0cmluZyh0aGVtZS5nZXRDb2xvcihpbnB1dEJhY2tncm91bmQpID8/ICcnKTtcblx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24uZG9tTm9kZS5zdHlsZS5ib3JkZXJXaWR0aCA9IGJvcmRlciA/ICcxcHgnIDogJzBweCc7XG5cdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLmRvbU5vZGUuc3R5bGUuYm9yZGVyU3R5bGUgPSBib3JkZXIgPyAnc29saWQnIDogJ25vbmUnO1xuXHRcdHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5kb21Ob2RlLnN0eWxlLmJvcmRlckNvbG9yID0gYm9yZGVyPy50b1N0cmluZygpID8/ICdub25lJztcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUZvbnQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2RvbU5vZGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhc3NlcnRUeXBlKHRoaXMuX2xhYmVsICE9PSB1bmRlZmluZWQsICdSZW5hbWVXaWRnZXQjX3VwZGF0ZUZvbnQ6IF9sYWJlbCBtdXN0IG5vdCBiZSB1bmRlZmluZWQgZ2l2ZW4gX2RvbU5vZGUgaXMgZGVmaW5lZCcpO1xuXG5cdFx0dGhpcy5fZWRpdG9yLmFwcGx5Rm9udEluZm8odGhpcy5faW5wdXRXaXRoQnV0dG9uLmlucHV0KTtcblxuXHRcdGNvbnN0IGZvbnRJbmZvID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdHRoaXMuX2xhYmVsLnN0eWxlLmZvbnRTaXplID0gYCR7dGhpcy5fY29tcHV0ZUxhYmVsRm9udFNpemUoZm9udEluZm8uZm9udFNpemUpfXB4YDtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVMYWJlbEZvbnRTaXplKGVkaXRvckZvbnRTaXplOiBudW1iZXIpIHtcblx0XHRyZXR1cm4gZWRpdG9yRm9udFNpemUgKiAwLjg7XG5cdH1cblxuXHRnZXRQb3NpdGlvbigpOiBJQ29udGVudFdpZGdldFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl92aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpIHx8IC8vIEB1bHVnYmVrbmE6IHNob3VsZG4ndCBoYXBwZW5cblx0XHRcdCF0aGlzLl9lZGl0b3IuZ2V0RG9tTm9kZSgpIC8vIEB1bHVnYmVrbmE6IGNhbiBoYXBwZW4gZHVyaW5nIHRlc3RzIGJhc2VkIG9uIHN1Z2dlc3RXaWRnZXQncyBzaW1pbGFyIHByZWRpY2F0ZSBjaGVja1xuXHRcdCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYm9keUJveCA9IGRvbS5nZXRDbGllbnRBcmVhKHRoaXMuZ2V0RG9tTm9kZSgpLm93bmVyRG9jdW1lbnQuYm9keSk7XG5cdFx0Y29uc3QgZWRpdG9yQm94ID0gZG9tLmdldERvbU5vZGVQYWdlUG9zaXRpb24odGhpcy5fZWRpdG9yLmdldERvbU5vZGUoKSk7XG5cblx0XHRjb25zdCBjdXJzb3JCb3hUb3AgPSB0aGlzLl9nZXRUb3BGb3JQb3NpdGlvbigpO1xuXG5cdFx0dGhpcy5fblB4QXZhaWxhYmxlQWJvdmUgPSBjdXJzb3JCb3hUb3AgKyBlZGl0b3JCb3gudG9wO1xuXHRcdHRoaXMuX25QeEF2YWlsYWJsZUJlbG93ID0gYm9keUJveC5oZWlnaHQgLSB0aGlzLl9uUHhBdmFpbGFibGVBYm92ZTtcblxuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHRjb25zdCB7IHRvdGFsSGVpZ2h0OiBjYW5kaWRhdGVWaWV3SGVpZ2h0IH0gPSBSZW5hbWVDYW5kaWRhdGVWaWV3LmdldExheW91dEluZm8oeyBsaW5lSGVpZ2h0IH0pO1xuXG5cdFx0Y29uc3QgcG9zaXRpb25QcmVmZXJlbmNlID0gdGhpcy5fblB4QXZhaWxhYmxlQmVsb3cgPiBjYW5kaWRhdGVWaWV3SGVpZ2h0ICogNiAvKiBhcHByb3hpbWF0ZSAjIG9mIGNhbmRpZGF0ZXMgdG8gZml0IGluIChpbmNsdXNpdmUgb2YgcmVuYW1lIGlucHV0IGJveCAmIHJlbmFtZSBsYWJlbCkgKi9cblx0XHRcdD8gW0NvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQkVMT1csIENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQUJPVkVdXG5cdFx0XHQ6IFtDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkFCT1ZFLCBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkJFTE9XXTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRwb3NpdGlvbjogdGhpcy5fcG9zaXRpb24hLFxuXHRcdFx0cHJlZmVyZW5jZTogcG9zaXRpb25QcmVmZXJlbmNlLFxuXHRcdH07XG5cdH1cblxuXHRiZWZvcmVSZW5kZXIoKTogSURpbWVuc2lvbiB8IG51bGwge1xuXHRcdGNvbnN0IFthY2NlcHQsIHByZXZpZXddID0gdGhpcy5fYWNjZXB0S2V5YmluZGluZ3M7XG5cdFx0dGhpcy5fbGFiZWwhLmlubmVyVGV4dCA9IG5scy5sb2NhbGl6ZSh7IGtleTogJ2xhYmVsJywgY29tbWVudDogWydwbGFjZWhvbGRlcnMgYXJlIGtleWJpbmRpbmdzLCBlLmcgXCJGMiB0byBSZW5hbWUsIFNoaWZ0K0YyIHRvIFByZXZpZXdcIiddIH0sIFwiezB9IHRvIFJlbmFtZSwgezF9IHRvIFByZXZpZXdcIiwgdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY2NlcHQpPy5nZXRMYWJlbCgpLCB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKHByZXZpZXcpPy5nZXRMYWJlbCgpKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUhLnN0eWxlLm1pbldpZHRoID0gYDIwMHB4YDsgLy8gdG8gcHJldmVudCBmcm9tIHdpZGVuaW5nIHdoZW4gY2FuZGlkYXRlcyBjb21lIGluXG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGFmdGVyUmVuZGVyKHBvc2l0aW9uOiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlIHwgbnVsbCk6IHZvaWQge1xuXHRcdC8vIEZJWE1FQHVsdWdiZWtuYTogY29tbWVudGluZyB0cmFjZSBsb2cgb3V0IHVudGlsIHdlIHN0YXJ0IHVubW91bnRpbmcgdGhlIHdpZGdldCBmcm9tIGVkaXRvciBwcm9wZXJseSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMjY5NzVcblx0XHQvLyB0aGlzLl90cmFjZSgnaW52b2tpbmcgYWZ0ZXJSZW5kZXIsIHBvc2l0aW9uOiAnLCBwb3NpdGlvbiA/ICdub3QgbnVsbCcgOiAnbnVsbCcpO1xuXHRcdGlmIChwb3NpdGlvbiA9PT0gbnVsbCkge1xuXHRcdFx0Ly8gY2FuY2VsIHJlbmFtZSB3aGVuIGlucHV0IHdpZGdldCBpc24ndCByZW5kZXJlZCBhbnltb3JlXG5cdFx0XHR0aGlzLmNhbmNlbElucHV0KHRydWUsICdhZnRlclJlbmRlciAoYmVjYXVzZSBwb3NpdGlvbiBpcyBudWxsKScpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkgfHwgLy8gc2hvdWxkbid0IGhhcHBlblxuXHRcdFx0IXRoaXMuX2VkaXRvci5nZXREb21Ob2RlKCkgLy8gY2FuIGhhcHBlbiBkdXJpbmcgdGVzdHMgYmFzZWQgb24gc3VnZ2VzdFdpZGdldCdzIHNpbWlsYXIgcHJlZGljYXRlIGNoZWNrXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXNzZXJ0VHlwZSh0aGlzLl9yZW5hbWVDYW5kaWRhdGVMaXN0Vmlldyk7XG5cdFx0YXNzZXJ0VHlwZSh0aGlzLl9uUHhBdmFpbGFibGVBYm92ZSAhPT0gdW5kZWZpbmVkKTtcblx0XHRhc3NlcnRUeXBlKHRoaXMuX25QeEF2YWlsYWJsZUJlbG93ICE9PSB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgaW5wdXRCb3hIZWlnaHQgPSBkb20uZ2V0VG90YWxIZWlnaHQodGhpcy5faW5wdXRXaXRoQnV0dG9uLmRvbU5vZGUpO1xuXG5cdFx0Y29uc3QgbGFiZWxIZWlnaHQgPSBkb20uZ2V0VG90YWxIZWlnaHQodGhpcy5fbGFiZWwhKTtcblxuXHRcdGxldCB0b3RhbEhlaWdodEF2YWlsYWJsZTogbnVtYmVyO1xuXHRcdGlmIChwb3NpdGlvbiA9PT0gQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5CRUxPVykge1xuXHRcdFx0dG90YWxIZWlnaHRBdmFpbGFibGUgPSB0aGlzLl9uUHhBdmFpbGFibGVCZWxvdztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dG90YWxIZWlnaHRBdmFpbGFibGUgPSB0aGlzLl9uUHhBdmFpbGFibGVBYm92ZTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZW5hbWVDYW5kaWRhdGVMaXN0Vmlldy5sYXlvdXQoe1xuXHRcdFx0aGVpZ2h0OiB0b3RhbEhlaWdodEF2YWlsYWJsZSAtIGxhYmVsSGVpZ2h0IC0gaW5wdXRCb3hIZWlnaHQsXG5cdFx0XHR3aWR0aDogZG9tLmdldFRvdGFsV2lkdGgodGhpcy5faW5wdXRXaXRoQnV0dG9uLmRvbU5vZGUpLFxuXHRcdH0pO1xuXHR9XG5cblxuXHRwcml2YXRlIF9jdXJyZW50QWNjZXB0SW5wdXQ/OiAod2FudHNQcmV2aWV3OiBib29sZWFuKSA9PiB2b2lkO1xuXHRwcml2YXRlIF9jdXJyZW50Q2FuY2VsSW5wdXQ/OiAoZm9jdXNFZGl0b3I6IGJvb2xlYW4pID0+IHZvaWQ7XG5cdHByaXZhdGUgX3JlcXVlc3RSZW5hbWVDYW5kaWRhdGVzT25jZT86ICh0cmlnZ2VyS2luZDogTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kLCBjdHM6IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm92aWRlclJlc3VsdDxOZXdTeW1ib2xOYW1lW10+W107XG5cblx0YWNjZXB0SW5wdXQod2FudHNQcmV2aWV3OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJhY2UoYGludm9raW5nIGFjY2VwdElucHV0YCk7XG5cdFx0dGhpcy5fY3VycmVudEFjY2VwdElucHV0Py4od2FudHNQcmV2aWV3KTtcblx0fVxuXG5cdGNhbmNlbElucHV0KGZvY3VzRWRpdG9yOiBib29sZWFuLCBjYWxsZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdC8vIHRoaXMuX3RyYWNlKGBpbnZva2luZyBjYW5jZWxJbnB1dCwgY2FsbGVyOiAke2NhbGxlcn0sIF9jdXJyZW50Q2FuY2VsSW5wdXQ6ICR7dGhpcy5fY3VycmVudEFjY2VwdElucHV0ID8gJ25vdCB1bmRlZmluZWQnIDogJ3VuZGVmaW5lZCd9YCk7XG5cdFx0dGhpcy5fY3VycmVudENhbmNlbElucHV0Py4oZm9jdXNFZGl0b3IpO1xuXHR9XG5cblx0Zm9jdXNOZXh0UmVuYW1lU3VnZ2VzdGlvbigpIHtcblx0XHRpZiAoIXRoaXMuX3JlbmFtZUNhbmRpZGF0ZUxpc3RWaWV3Py5mb2N1c05leHQoKSkge1xuXHRcdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLmlucHV0LnZhbHVlID0gdGhpcy5fY3VycmVudE5hbWUhO1xuXHRcdH1cblx0fVxuXG5cdGZvY3VzUHJldmlvdXNSZW5hbWVTdWdnZXN0aW9uKCkgeyAvLyBUT0RPQHVsdWdiZWtuYTogdGhpcyBhbmQgZm9jdXNOZXh0IHNob3VsZCBzZXQgdGhlIG9yaWdpbmFsIG5hbWUgaWYgbm8gY2FuZGlkYXRlIGlzIGZvY3VzZWRcblx0XHRpZiAoIXRoaXMuX3JlbmFtZUNhbmRpZGF0ZUxpc3RWaWV3Py5mb2N1c1ByZXZpb3VzKCkpIHtcblx0XHRcdHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5pbnB1dC52YWx1ZSA9IHRoaXMuX2N1cnJlbnROYW1lITtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIHJlcXVlc3RSZW5hbWVDYW5kaWRhdGVzIGlzIGB1bmRlZmluZWRgIHdoZW4gdGhlcmUgYXJlIG5vIHJlbmFtZSBzdWdnZXN0aW9uIHByb3ZpZGVyc1xuXHQgKi9cblx0Z2V0SW5wdXQoXG5cdFx0d2hlcmU6IElSYW5nZSxcblx0XHRjdXJyZW50TmFtZTogc3RyaW5nLFxuXHRcdHN1cHBvcnRQcmV2aWV3OiBib29sZWFuLFxuXHRcdHJlcXVlc3RSZW5hbWVDYW5kaWRhdGVzOiB1bmRlZmluZWQgfCAoKHRyaWdnZXJLaW5kOiBOZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQsIGN0czogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb3ZpZGVyUmVzdWx0PE5ld1N5bWJvbE5hbWVbXT5bXSksXG5cdFx0Y3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZVxuXHQpOiBQcm9taXNlPFJlbmFtZVdpZGdldFJlc3VsdCB8IGJvb2xlYW4+IHtcblxuXHRcdGNvbnN0IHsgc3RhcnQ6IHNlbGVjdGlvblN0YXJ0LCBlbmQ6IHNlbGVjdGlvbkVuZCB9ID0gdGhpcy5fZ2V0U2VsZWN0aW9uKHdoZXJlLCBjdXJyZW50TmFtZSk7XG5cblx0XHR0aGlzLl9yZW5hbWVDdHMgPSBjdHM7XG5cblx0XHRjb25zdCBkaXNwb3NlT25Eb25lID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0dGhpcy5fblJlbmFtZVN1Z2dlc3Rpb25zSW52b2NhdGlvbnMgPSAwO1xuXG5cdFx0dGhpcy5faGFkQXV0b21hdGljUmVuYW1lU3VnZ2VzdGlvbnNJbnZvY2F0aW9uID0gZmFsc2U7XG5cblx0XHRpZiAocmVxdWVzdFJlbmFtZUNhbmRpZGF0ZXMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLmJ1dHRvbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24uYnV0dG9uLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cblx0XHRcdHRoaXMuX3JlcXVlc3RSZW5hbWVDYW5kaWRhdGVzT25jZSA9IHJlcXVlc3RSZW5hbWVDYW5kaWRhdGVzO1xuXG5cdFx0XHR0aGlzLl9yZXF1ZXN0UmVuYW1lQ2FuZGlkYXRlcyhjdXJyZW50TmFtZSwgZmFsc2UpO1xuXG5cdFx0XHRkaXNwb3NlT25Eb25lLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKFxuXHRcdFx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24uYnV0dG9uLFxuXHRcdFx0XHQnY2xpY2snLFxuXHRcdFx0XHQoKSA9PiB0aGlzLl9yZXF1ZXN0UmVuYW1lQ2FuZGlkYXRlcyhjdXJyZW50TmFtZSwgdHJ1ZSlcblx0XHRcdCkpO1xuXHRcdFx0ZGlzcG9zZU9uRG9uZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihcblx0XHRcdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLmJ1dHRvbixcblx0XHRcdFx0ZG9tLkV2ZW50VHlwZS5LRVlfRE9XTixcblx0XHRcdFx0KGUpID0+IHtcblx0XHRcdFx0XHRjb25zdCBrZXlFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cblx0XHRcdFx0XHRpZiAoa2V5RXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpIHx8IGtleUV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSkge1xuXHRcdFx0XHRcdFx0a2V5RXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0XHRrZXlFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVxdWVzdFJlbmFtZUNhbmRpZGF0ZXMoY3VycmVudE5hbWUsIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNFZGl0aW5nUmVuYW1lQ2FuZGlkYXRlID0gZmFsc2U7XG5cblx0XHR0aGlzLl9kb21Ob2RlIS5jbGFzc0xpc3QudG9nZ2xlKCdwcmV2aWV3Jywgc3VwcG9ydFByZXZpZXcpO1xuXG5cdFx0dGhpcy5fcG9zaXRpb24gPSBuZXcgUG9zaXRpb24od2hlcmUuc3RhcnRMaW5lTnVtYmVyLCB3aGVyZS5zdGFydENvbHVtbik7XG5cdFx0dGhpcy5fY3VycmVudE5hbWUgPSBjdXJyZW50TmFtZTtcblxuXHRcdHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5pbnB1dC52YWx1ZSA9IGN1cnJlbnROYW1lO1xuXHRcdHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5pbnB1dC5zZXRBdHRyaWJ1dGUoJ3NlbGVjdGlvblN0YXJ0Jywgc2VsZWN0aW9uU3RhcnQudG9TdHJpbmcoKSk7XG5cdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLmlucHV0LnNldEF0dHJpYnV0ZSgnc2VsZWN0aW9uRW5kJywgc2VsZWN0aW9uRW5kLnRvU3RyaW5nKCkpO1xuXHRcdHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5pbnB1dC5zaXplID0gTWF0aC5tYXgoKHdoZXJlLmVuZENvbHVtbiAtIHdoZXJlLnN0YXJ0Q29sdW1uKSAqIDEuMSwgMjApOyAvLyBkZXRlcm1pbmVzIHdpZHRoXG5cblx0XHR0aGlzLl9iZWZvcmVGaXJzdElucHV0RmllbGRFZGl0U1cucmVzZXQoKTtcblxuXG5cdFx0ZGlzcG9zZU9uRG9uZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlbmFtZUN0cyA9IHVuZGVmaW5lZDtcblx0XHRcdGN0cy5kaXNwb3NlKHRydWUpO1xuXHRcdH0pKTsgLy8gQHVsdWdiZWtuYTogdGhpcyBtYXkgcmVzdWx0IGluIGB0aGlzLmNhbmNlbElucHV0YCBiZWluZyBjYWxsZWQgdHdpY2UsIGJ1dCBpdCBzaG91bGQgYmUgc2FmZSBzaW5jZSB3ZSBzZXQgaXQgdG8gdW5kZWZpbmVkIGFmdGVyIDFzdCBjYWxsXG5cdFx0ZGlzcG9zZU9uRG9uZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9yZW5hbWVDYW5kaWRhdGVQcm92aWRlcnNDdHMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9yZW5hbWVDYW5kaWRhdGVQcm92aWRlcnNDdHMuZGlzcG9zZSh0cnVlKTtcblx0XHRcdFx0dGhpcy5fcmVuYW1lQ2FuZGlkYXRlUHJvdmlkZXJzQ3RzID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2VPbkRvbmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9jYW5kaWRhdGVzLmNsZWFyKCkpKTtcblxuXHRcdGNvbnN0IGlucHV0UmVzdWx0ID0gbmV3IERlZmVycmVkUHJvbWlzZTxSZW5hbWVXaWRnZXRSZXN1bHQgfCBib29sZWFuPigpO1xuXG5cdFx0aW5wdXRSZXN1bHQucC5maW5hbGx5KCgpID0+IHtcblx0XHRcdGRpc3Bvc2VPbkRvbmUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5faGlkZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fY3VycmVudENhbmNlbElucHV0ID0gKGZvY3VzRWRpdG9yKSA9PiB7XG5cdFx0XHR0aGlzLl90cmFjZSgnaW52b2tpbmcgX2N1cnJlbnRDYW5jZWxJbnB1dCcpO1xuXHRcdFx0dGhpcy5fY3VycmVudEFjY2VwdElucHV0ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fY3VycmVudENhbmNlbElucHV0ID0gdW5kZWZpbmVkO1xuXHRcdFx0Ly8gZml4bWUgc2Vzc2lvbiBjbGVhbnVwXG5cdFx0XHR0aGlzLl9yZW5hbWVDYW5kaWRhdGVMaXN0Vmlldz8uY2xlYXJDYW5kaWRhdGVzKCk7XG5cdFx0XHRpbnB1dFJlc3VsdC5jb21wbGV0ZShmb2N1c0VkaXRvcik7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fY3VycmVudEFjY2VwdElucHV0ID0gKHdhbnRzUHJldmlldykgPT4ge1xuXHRcdFx0dGhpcy5fdHJhY2UoJ2ludm9raW5nIF9jdXJyZW50QWNjZXB0SW5wdXQnKTtcblx0XHRcdGFzc2VydFR5cGUodGhpcy5fcmVuYW1lQ2FuZGlkYXRlTGlzdFZpZXcgIT09IHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IG5SZW5hbWVTdWdnZXN0aW9ucyA9IHRoaXMuX3JlbmFtZUNhbmRpZGF0ZUxpc3RWaWV3Lm5DYW5kaWRhdGVzO1xuXG5cdFx0XHRsZXQgbmV3TmFtZTogc3RyaW5nO1xuXHRcdFx0bGV0IHNvdXJjZTogTmV3TmFtZVNvdXJjZTtcblx0XHRcdGNvbnN0IGZvY3VzZWRDYW5kaWRhdGUgPSB0aGlzLl9yZW5hbWVDYW5kaWRhdGVMaXN0Vmlldy5mb2N1c2VkQ2FuZGlkYXRlO1xuXHRcdFx0aWYgKGZvY3VzZWRDYW5kaWRhdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl90cmFjZSgndXNpbmcgbmV3IG5hbWUgZnJvbSByZW5hbWVTdWdnZXN0aW9uJyk7XG5cdFx0XHRcdG5ld05hbWUgPSBmb2N1c2VkQ2FuZGlkYXRlO1xuXHRcdFx0XHRzb3VyY2UgPSB7IGs6ICdyZW5hbWVTdWdnZXN0aW9uJyB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fdHJhY2UoJ3VzaW5nIG5ldyBuYW1lIGZyb20gaW5wdXRGaWVsZCcpO1xuXHRcdFx0XHRuZXdOYW1lID0gdGhpcy5faW5wdXRXaXRoQnV0dG9uLmlucHV0LnZhbHVlO1xuXHRcdFx0XHRzb3VyY2UgPSB0aGlzLl9pc0VkaXRpbmdSZW5hbWVDYW5kaWRhdGUgPyB7IGs6ICd1c2VyRWRpdGVkUmVuYW1lU3VnZ2VzdGlvbicgfSA6IHsgazogJ2lucHV0RmllbGQnIH07XG5cdFx0XHR9XG5cblx0XHRcdGlmIChuZXdOYW1lID09PSBjdXJyZW50TmFtZSB8fCBuZXdOYW1lLnRyaW0oKS5sZW5ndGggPT09IDAgLyogaXMganVzdCB3aGl0ZXNwYWNlICovKSB7XG5cdFx0XHRcdHRoaXMuY2FuY2VsSW5wdXQodHJ1ZSwgJ19jdXJyZW50QWNjZXB0SW5wdXQgKGJlY2F1c2UgbmV3TmFtZSA9PT0gdmFsdWUgfHwgbmV3TmFtZS50cmltKCkubGVuZ3RoID09PSAwKScpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2N1cnJlbnRBY2NlcHRJbnB1dCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2N1cnJlbnRDYW5jZWxJbnB1dCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3JlbmFtZUNhbmRpZGF0ZUxpc3RWaWV3LmNsZWFyQ2FuZGlkYXRlcygpO1xuXHRcdFx0Ly8gZml4bWUgc2Vzc2lvbiBjbGVhbnVwXG5cblx0XHRcdGlucHV0UmVzdWx0LmNvbXBsZXRlKHtcblx0XHRcdFx0bmV3TmFtZSxcblx0XHRcdFx0d2FudHNQcmV2aWV3OiBzdXBwb3J0UHJldmlldyAmJiB3YW50c1ByZXZpZXcsXG5cdFx0XHRcdHN0YXRzOiB7XG5cdFx0XHRcdFx0c291cmNlLFxuXHRcdFx0XHRcdG5SZW5hbWVTdWdnZXN0aW9ucyxcblx0XHRcdFx0XHR0aW1lQmVmb3JlRmlyc3RJbnB1dEZpZWxkRWRpdDogdGhpcy5fdGltZUJlZm9yZUZpcnN0SW5wdXRGaWVsZEVkaXQsXG5cdFx0XHRcdFx0blJlbmFtZVN1Z2dlc3Rpb25zSW52b2NhdGlvbnM6IHRoaXMuX25SZW5hbWVTdWdnZXN0aW9uc0ludm9jYXRpb25zLFxuXHRcdFx0XHRcdGhhZEF1dG9tYXRpY1JlbmFtZVN1Z2dlc3Rpb25zSW52b2NhdGlvbjogdGhpcy5faGFkQXV0b21hdGljUmVuYW1lU3VnZ2VzdGlvbnNJbnZvY2F0aW9uLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9O1xuXG5cdFx0ZGlzcG9zZU9uRG9uZS5hZGQoY3RzLnRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHRoaXMuY2FuY2VsSW5wdXQodHJ1ZSwgJ2N0cy50b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCcpKSk7XG5cdFx0aWYgKCFfc3RpY2t5KSB7XG5cdFx0XHRkaXNwb3NlT25Eb25lLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRCbHVyRWRpdG9yV2lkZ2V0KCgpID0+IHRoaXMuY2FuY2VsSW5wdXQoIXRoaXMuX2RvbU5vZGU/Lm93bmVyRG9jdW1lbnQuaGFzRm9jdXMoKSwgJ2VkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQnKSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Nob3coKTtcblxuXHRcdHJldHVybiBpbnB1dFJlc3VsdC5wO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVxdWVzdFJlbmFtZUNhbmRpZGF0ZXMoY3VycmVudE5hbWU6IHN0cmluZywgaXNNYW51YWxseVRyaWdnZXJlZDogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9yZXF1ZXN0UmVuYW1lQ2FuZGlkYXRlc09uY2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fcmVuYW1lQ2FuZGlkYXRlUHJvdmlkZXJzQ3RzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3JlbmFtZUNhbmRpZGF0ZVByb3ZpZGVyc0N0cy5kaXNwb3NlKHRydWUpO1xuXHRcdH1cblxuXHRcdGFzc2VydFR5cGUodGhpcy5fcmVuYW1lQ3RzKTtcblxuXHRcdGlmICh0aGlzLl9pbnB1dFdpdGhCdXR0b24uYnV0dG9uU3RhdGUgIT09ICdzdG9wJykge1xuXG5cdFx0XHR0aGlzLl9yZW5hbWVDYW5kaWRhdGVQcm92aWRlcnNDdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdFx0Y29uc3QgdHJpZ2dlcktpbmQgPSBpc01hbnVhbGx5VHJpZ2dlcmVkID8gTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kLkludm9rZSA6IE5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZC5BdXRvbWF0aWM7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGVzID0gdGhpcy5fcmVxdWVzdFJlbmFtZUNhbmRpZGF0ZXNPbmNlKHRyaWdnZXJLaW5kLCB0aGlzLl9yZW5hbWVDYW5kaWRhdGVQcm92aWRlcnNDdHMudG9rZW4pO1xuXG5cdFx0XHRpZiAoY2FuZGlkYXRlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLnNldFNwYXJrbGVCdXR0b24oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWlzTWFudWFsbHlUcmlnZ2VyZWQpIHtcblx0XHRcdFx0dGhpcy5faGFkQXV0b21hdGljUmVuYW1lU3VnZ2VzdGlvbnNJbnZvY2F0aW9uID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fblJlbmFtZVN1Z2dlc3Rpb25zSW52b2NhdGlvbnMgKz0gMTtcblxuXHRcdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLnNldFN0b3BCdXR0b24oKTtcblxuXHRcdFx0dGhpcy5fdXBkYXRlUmVuYW1lQ2FuZGlkYXRlcyhjYW5kaWRhdGVzLCBjdXJyZW50TmFtZSwgdGhpcy5fcmVuYW1lQ3RzLnRva2VuKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVGhpcyBhbGxvd3Mgc2VsZWN0aW5nIG9ubHkgcGFydCBvZiB0aGUgc3ltYm9sIG5hbWUgaW4gdGhlIGlucHV0IGZpZWxkIGJhc2VkIG9uIHRoZSBzZWxlY3Rpb24gaW4gdGhlIGVkaXRvclxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0U2VsZWN0aW9uKHdoZXJlOiBJUmFuZ2UsIGN1cnJlbnROYW1lOiBzdHJpbmcpOiB7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH0ge1xuXHRcdGFzc2VydFR5cGUodGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGxldCBzdGFydCA9IDA7XG5cdFx0bGV0IGVuZCA9IGN1cnJlbnROYW1lLmxlbmd0aDtcblxuXHRcdGlmICghUmFuZ2UuaXNFbXB0eShzZWxlY3Rpb24pICYmICFSYW5nZS5zcGFuc011bHRpcGxlTGluZXMoc2VsZWN0aW9uKSAmJiBSYW5nZS5jb250YWluc1JhbmdlKHdoZXJlLCBzZWxlY3Rpb24pKSB7XG5cdFx0XHRzdGFydCA9IE1hdGgubWF4KDAsIHNlbGVjdGlvbi5zdGFydENvbHVtbiAtIHdoZXJlLnN0YXJ0Q29sdW1uKTtcblx0XHRcdGVuZCA9IE1hdGgubWluKHdoZXJlLmVuZENvbHVtbiwgc2VsZWN0aW9uLmVuZENvbHVtbikgLSB3aGVyZS5zdGFydENvbHVtbjtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBzdGFydCwgZW5kIH07XG5cdH1cblxuXHRwcml2YXRlIF9zaG93KCk6IHZvaWQge1xuXHRcdHRoaXMuX3RyYWNlKCdpbnZva2luZyBfc2hvdycpO1xuXHRcdHRoaXMuX2VkaXRvci5yZXZlYWxMaW5lSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydCh0aGlzLl9wb3NpdGlvbiEubGluZU51bWJlciwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdHRoaXMuX3Zpc2libGUgPSB0cnVlO1xuXHRcdHRoaXMuX3Zpc2libGVDb250ZXh0S2V5LnNldCh0cnVlKTtcblx0XHR0aGlzLl9lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblxuXHRcdC8vIFRPRE9AdWx1Z2Jla25hOiBjb3VsZCB0aGlzIGJlIHNpbXBseSBydW4gaW4gYGFmdGVyUmVuZGVyYD9cblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5pbnB1dC5mb2N1cygpO1xuXHRcdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLmlucHV0LnNldFNlbGVjdGlvblJhbmdlKFxuXHRcdFx0XHRwYXJzZUludCh0aGlzLl9pbnB1dFdpdGhCdXR0b24uaW5wdXQuZ2V0QXR0cmlidXRlKCdzZWxlY3Rpb25TdGFydCcpISksXG5cdFx0XHRcdHBhcnNlSW50KHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5pbnB1dC5nZXRBdHRyaWJ1dGUoJ3NlbGVjdGlvbkVuZCcpISlcblx0XHRcdCk7XG5cdFx0fSwgMTAwKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVJlbmFtZUNhbmRpZGF0ZXMoY2FuZGlkYXRlczogUHJvdmlkZXJSZXN1bHQ8TmV3U3ltYm9sTmFtZVtdPltdLCBjdXJyZW50TmFtZTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRjb25zdCB0cmFjZSA9ICguLi5hcmdzOiB1bmtub3duW10pID0+IHRoaXMuX3RyYWNlKCdfdXBkYXRlUmVuYW1lQ2FuZGlkYXRlcycsIC4uLmFyZ3MpO1xuXG5cdFx0dHJhY2UoJ3N0YXJ0Jyk7XG5cdFx0Y29uc3QgbmFtZXNMaXN0UmVzdWx0cyA9IGF3YWl0IHJhY2VDYW5jZWxsYXRpb24oUHJvbWlzZS5hbGxTZXR0bGVkKGNhbmRpZGF0ZXMpLCB0b2tlbik7XG5cblx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24uc2V0U3BhcmtsZUJ1dHRvbigpO1xuXG5cdFx0aWYgKG5hbWVzTGlzdFJlc3VsdHMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dHJhY2UoJ3JldHVybmluZyBlYXJseSAtIHJlY2VpdmVkIHVwZGF0ZVJlbmFtZUNhbmRpZGF0ZXMgcmVzdWx0cyAtIHVuZGVmaW5lZCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld05hbWVzID0gbmFtZXNMaXN0UmVzdWx0cy5mbGF0TWFwKG5hbWVzTGlzdFJlc3VsdCA9PlxuXHRcdFx0bmFtZXNMaXN0UmVzdWx0LnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcgJiYgaXNEZWZpbmVkKG5hbWVzTGlzdFJlc3VsdC52YWx1ZSlcblx0XHRcdFx0PyBuYW1lc0xpc3RSZXN1bHQudmFsdWVcblx0XHRcdFx0OiBbXVxuXHRcdCk7XG5cdFx0dHJhY2UoYHJlY2VpdmVkIHVwZGF0ZVJlbmFtZUNhbmRpZGF0ZXMgcmVzdWx0cyAtIHRvdGFsICh1bmZpbHRlcmVkKSAke25ld05hbWVzLmxlbmd0aH0gY2FuZGlkYXRlcy5gKTtcblxuXHRcdC8vIGRlZHVwbGljYXRlIGFuZCBmaWx0ZXIgb3V0IHRoZSBjdXJyZW50IHZhbHVlXG5cblx0XHRjb25zdCBkaXN0aW5jdE5hbWVzID0gYXJyYXlzLmRpc3RpbmN0KG5ld05hbWVzLCB2ID0+IHYubmV3U3ltYm9sTmFtZSk7XG5cdFx0dHJhY2UoYGRpc3RpbmN0IGNhbmRpZGF0ZXMgLSAke2Rpc3RpbmN0TmFtZXMubGVuZ3RofSBjYW5kaWRhdGVzLmApO1xuXG5cdFx0Y29uc3QgdmFsaWREaXN0aW5jdE5hbWVzID0gZGlzdGluY3ROYW1lcy5maWx0ZXIoKHsgbmV3U3ltYm9sTmFtZSB9KSA9PiBuZXdTeW1ib2xOYW1lLnRyaW0oKS5sZW5ndGggPiAwICYmIG5ld1N5bWJvbE5hbWUgIT09IHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5pbnB1dC52YWx1ZSAmJiBuZXdTeW1ib2xOYW1lICE9PSBjdXJyZW50TmFtZSAmJiAhdGhpcy5fY2FuZGlkYXRlcy5oYXMobmV3U3ltYm9sTmFtZSkpO1xuXHRcdHRyYWNlKGB2YWxpZCBkaXN0aW5jdCBjYW5kaWRhdGVzIC0gJHtuZXdOYW1lcy5sZW5ndGh9IGNhbmRpZGF0ZXMuYCk7XG5cblx0XHR2YWxpZERpc3RpbmN0TmFtZXMuZm9yRWFjaChuID0+IHRoaXMuX2NhbmRpZGF0ZXMuYWRkKG4ubmV3U3ltYm9sTmFtZSkpO1xuXG5cdFx0aWYgKHZhbGlkRGlzdGluY3ROYW1lcy5sZW5ndGggPCAxKSB7XG5cdFx0XHR0cmFjZSgncmV0dXJuaW5nIGVhcmx5IC0gbm8gdmFsaWQgZGlzdGluY3QgY2FuZGlkYXRlcycpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHNob3cgdGhlIGNhbmRpZGF0ZXNcblx0XHR0cmFjZSgnc2V0dGluZyBjYW5kaWRhdGVzJyk7XG5cdFx0dGhpcy5fcmVuYW1lQ2FuZGlkYXRlTGlzdFZpZXchLnNldENhbmRpZGF0ZXModmFsaWREaXN0aW5jdE5hbWVzKTtcblxuXHRcdC8vIGFzayBlZGl0b3IgdG8gcmUtbGF5b3V0IGdpdmVuIHRoYXQgdGhlIHdpZGdldCBpcyBub3cgb2YgYSBkaWZmZXJlbnQgc2l6ZSBhZnRlciByZW5kZXJpbmcgcmVuYW1lIGNhbmRpZGF0ZXNcblx0XHR0cmFjZSgnYXNraW5nIGVkaXRvciB0byByZS1sYXlvdXQnKTtcblx0XHR0aGlzLl9lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblx0fVxuXG5cdHByaXZhdGUgX2hpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJhY2UoJ2ludm9rZWQgX2hpZGUnKTtcblx0XHR0aGlzLl92aXNpYmxlID0gZmFsc2U7XG5cdFx0dGhpcy5fdmlzaWJsZUNvbnRleHRLZXkucmVzZXQoKTtcblx0XHR0aGlzLl9lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFRvcEZvclBvc2l0aW9uKCk6IG51bWJlciB7XG5cdFx0Y29uc3QgdmlzaWJsZVJhbmdlcyA9IHRoaXMuX2VkaXRvci5nZXRWaXNpYmxlUmFuZ2VzKCk7XG5cdFx0bGV0IGZpcnN0TGluZUluVmlld3BvcnQ6IG51bWJlcjtcblx0XHRpZiAodmlzaWJsZVJhbmdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRmaXJzdExpbmVJblZpZXdwb3J0ID0gdmlzaWJsZVJhbmdlc1swXS5zdGFydExpbmVOdW1iZXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignUmVuYW1lV2lkZ2V0I19nZXRUb3BGb3JQb3NpdGlvbjogdGhpcyBzaG91bGQgbm90IGhhcHBlbiAtIHZpc2libGVSYW5nZXMgaXMgZW1wdHknKTtcblx0XHRcdGZpcnN0TGluZUluVmlld3BvcnQgPSBNYXRoLm1heCgxLCB0aGlzLl9wb3NpdGlvbiEubGluZU51bWJlciAtIDUpOyAvLyBAdWx1Z2Jla25hOiBmYWxsYmFjayB0byBjdXJyZW50IGxpbmUgbWludXMgNVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIodGhpcy5fcG9zaXRpb24hLmxpbmVOdW1iZXIpIC0gdGhpcy5fZWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIoZmlyc3RMaW5lSW5WaWV3cG9ydCk7XG5cdH1cblxuXHRwcml2YXRlIF90cmFjZSguLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdSZW5hbWVXaWRnZXQnLCAuLi5hcmdzKTtcblx0fVxufVxuXG5jbGFzcyBSZW5hbWVDYW5kaWRhdGVMaXN0VmlldyB7XG5cblx0LyoqIFBhcmVudCBub2RlIG9mIHRoZSBsaXN0IHdpZGdldDsgbmVlZGVkIHRvIGNvbnRyb2wgIyBvZiBsaXN0IGVsZW1lbnRzIHZpc2libGUgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbGlzdENvbnRhaW5lcjogSFRNTERpdkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpc3RXaWRnZXQ6IExpc3Q8TmV3U3ltYm9sTmFtZT47XG5cblx0cHJpdmF0ZSBfbGluZUhlaWdodDogbnVtYmVyO1xuXHRwcml2YXRlIF9hdmFpbGFibGVIZWlnaHQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfbWluaW11bVdpZHRoOiBudW1iZXI7XG5cdHByaXZhdGUgX3R5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogbnVtYmVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cblx0Ly8gRklYTUVAdWx1Z2Jla25hOiByZXdyaXRlIHVzaW5nIGV2ZW50IGVtaXR0ZXJzXG5cdGNvbnN0cnVjdG9yKHBhcmVudDogSFRNTEVsZW1lbnQsIG9wdHM6IHsgZm9udEluZm86IEZvbnRJbmZvOyBvbkZvY3VzQ2hhbmdlOiAobmV3U3ltYm9sTmFtZTogc3RyaW5nKSA9PiB2b2lkOyBvblNlbGVjdGlvbkNoYW5nZTogKCkgPT4gdm9pZCB9KSB7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdHRoaXMuX2F2YWlsYWJsZUhlaWdodCA9IDA7XG5cdFx0dGhpcy5fbWluaW11bVdpZHRoID0gMDtcblxuXHRcdHRoaXMuX2xpbmVIZWlnaHQgPSBvcHRzLmZvbnRJbmZvLmxpbmVIZWlnaHQ7XG5cdFx0dGhpcy5fdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoID0gb3B0cy5mb250SW5mby50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg7XG5cblx0XHR0aGlzLl9saXN0Q29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fbGlzdENvbnRhaW5lci5jbGFzc05hbWUgPSAncmVuYW1lLWJveCByZW5hbWUtY2FuZGlkYXRlLWxpc3QtY29udGFpbmVyJztcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5fbGlzdENvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9saXN0V2lkZ2V0ID0gUmVuYW1lQ2FuZGlkYXRlTGlzdFZpZXcuX2NyZWF0ZUxpc3RXaWRnZXQodGhpcy5fbGlzdENvbnRhaW5lciwgdGhpcy5fY2FuZGlkYXRlVmlld0hlaWdodCwgb3B0cy5mb250SW5mbyk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fbGlzdFdpZGdldC5vbkRpZENoYW5nZUZvY3VzKFxuXHRcdFx0ZSA9PiB7XG5cdFx0XHRcdGlmIChlLmVsZW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdG9wdHMub25Gb2N1c0NoYW5nZShlLmVsZW1lbnRzWzBdLm5ld1N5bWJvbE5hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZXNcblx0XHQpKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9saXN0V2lkZ2V0Lm9uRGlkQ2hhbmdlU2VsZWN0aW9uKFxuXHRcdFx0ZSA9PiB7XG5cdFx0XHRcdGlmIChlLmVsZW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdG9wdHMub25TZWxlY3Rpb25DaGFuZ2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzXG5cdFx0KSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoXG5cdFx0XHR0aGlzLl9saXN0V2lkZ2V0Lm9uRGlkQmx1cihlID0+IHsgLy8gQHVsdWdiZWtuYTogYmVjYXVzZSBsaXN0IHdpZGdldCBvdGhlcndpc2UgcmVtZW1iZXJzIGxhc3QgZm9jdXNlZCBlbGVtZW50IGFuZCByZXR1cm5zIGl0IGFzIGZvY3VzZWQgZWxlbWVudFxuXHRcdFx0XHR0aGlzLl9saXN0V2lkZ2V0LnNldEZvY3VzKFtdKTtcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdHRoaXMuX2xpc3RXaWRnZXQuc3R5bGUoZ2V0TGlzdFN0eWxlcyh7XG5cdFx0XHRsaXN0SW5hY3RpdmVGb2N1c0ZvcmVncm91bmQ6IHF1aWNrSW5wdXRMaXN0Rm9jdXNGb3JlZ3JvdW5kLFxuXHRcdFx0bGlzdEluYWN0aXZlRm9jdXNCYWNrZ3JvdW5kOiBxdWlja0lucHV0TGlzdEZvY3VzQmFja2dyb3VuZCxcblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2xpc3RXaWRnZXQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8vIGhlaWdodCAtIG1heCBoZWlnaHQgYWxsb3dlZCBieSBwYXJlbnQgZWxlbWVudFxuXHRwdWJsaWMgbGF5b3V0KHsgaGVpZ2h0LCB3aWR0aCB9OiB7IGhlaWdodDogbnVtYmVyOyB3aWR0aDogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHR0aGlzLl9hdmFpbGFibGVIZWlnaHQgPSBoZWlnaHQ7XG5cdFx0dGhpcy5fbWluaW11bVdpZHRoID0gd2lkdGg7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q2FuZGlkYXRlcyhjYW5kaWRhdGVzOiBOZXdTeW1ib2xOYW1lW10pOiB2b2lkIHtcblxuXHRcdC8vIGluc2VydCBjYW5kaWRhdGVzIGludG8gbGlzdCB3aWRnZXRcblx0XHR0aGlzLl9saXN0V2lkZ2V0LnNwbGljZSgwLCAwLCBjYW5kaWRhdGVzKTtcblxuXHRcdC8vIGFkanVzdCBsaXN0IHdpZGdldCBsYXlvdXRcblx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLl9waWNrTGlzdEhlaWdodCh0aGlzLl9saXN0V2lkZ2V0Lmxlbmd0aCk7XG5cdFx0Y29uc3Qgd2lkdGggPSB0aGlzLl9waWNrTGlzdFdpZHRoKGNhbmRpZGF0ZXMpO1xuXG5cdFx0dGhpcy5fbGlzdFdpZGdldC5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cblx0XHQvLyBhZGp1c3QgbGlzdCBjb250YWluZXIgbGF5b3V0XG5cdFx0dGhpcy5fbGlzdENvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHRcdHRoaXMuX2xpc3RDb250YWluZXIuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cblx0XHRhcmlhLnN0YXR1cyhubHMubG9jYWxpemUoJ3JlbmFtZVN1Z2dlc3Rpb25zUmVjZWl2ZWRBcmlhJywgXCJSZWNlaXZlZCB7MH0gcmVuYW1lIHN1Z2dlc3Rpb25zXCIsIGNhbmRpZGF0ZXMubGVuZ3RoKSk7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJDYW5kaWRhdGVzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xpc3RDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzBweCc7XG5cdFx0dGhpcy5fbGlzdENvbnRhaW5lci5zdHlsZS53aWR0aCA9ICcwcHgnO1xuXHRcdHRoaXMuX2xpc3RXaWRnZXQuc3BsaWNlKDAsIHRoaXMuX2xpc3RXaWRnZXQubGVuZ3RoLCBbXSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG5DYW5kaWRhdGVzKCkge1xuXHRcdHJldHVybiB0aGlzLl9saXN0V2lkZ2V0Lmxlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZm9jdXNlZENhbmRpZGF0ZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9saXN0V2lkZ2V0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZWxlY3RlZEVsZW1lbnQgPSB0aGlzLl9saXN0V2lkZ2V0LmdldFNlbGVjdGVkRWxlbWVudHMoKVswXTtcblx0XHRpZiAoc2VsZWN0ZWRFbGVtZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBzZWxlY3RlZEVsZW1lbnQubmV3U3ltYm9sTmFtZTtcblx0XHR9XG5cdFx0Y29uc3QgZm9jdXNlZEVsZW1lbnQgPSB0aGlzLl9saXN0V2lkZ2V0LmdldEZvY3VzZWRFbGVtZW50cygpWzBdO1xuXHRcdGlmIChmb2N1c2VkRWxlbWVudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gZm9jdXNlZEVsZW1lbnQubmV3U3ltYm9sTmFtZTtcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHVibGljIGZvY3VzTmV4dCgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fbGlzdFdpZGdldC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgZm9jdXNlZEl4cyA9IHRoaXMuX2xpc3RXaWRnZXQuZ2V0Rm9jdXMoKTtcblx0XHRpZiAoZm9jdXNlZEl4cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2xpc3RXaWRnZXQuZm9jdXNGaXJzdCgpO1xuXHRcdFx0dGhpcy5fbGlzdFdpZGdldC5yZXZlYWwoMCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGZvY3VzZWRJeHNbMF0gPT09IHRoaXMuX2xpc3RXaWRnZXQubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHR0aGlzLl9saXN0V2lkZ2V0LnNldEZvY3VzKFtdKTtcblx0XHRcdFx0dGhpcy5fbGlzdFdpZGdldC5yZXZlYWwoMCk7IC8vIEB1bHVnYmVrbmE6IHdpdGhvdXQgdGhpcywgaXQgc2VlbXMgbGlrZSBmb2N1c2VkIGVsZW1lbnQgaXMgb2JzdHJ1Y3RlZFxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9saXN0V2lkZ2V0LmZvY3VzTmV4dCgpO1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5fbGlzdFdpZGdldC5nZXRGb2N1cygpWzBdO1xuXHRcdFx0XHR0aGlzLl9saXN0V2lkZ2V0LnJldmVhbChmb2N1c2VkKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEByZXR1cm5zIHRydWUgaWYgZm9jdXMgaXMgbW92ZWQgdG8gcHJldmlvdXMgZWxlbWVudFxuXHQgKi9cblx0cHVibGljIGZvY3VzUHJldmlvdXMoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2xpc3RXaWRnZXQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGZvY3VzZWRJeHMgPSB0aGlzLl9saXN0V2lkZ2V0LmdldEZvY3VzKCk7XG5cdFx0aWYgKGZvY3VzZWRJeHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9saXN0V2lkZ2V0LmZvY3VzTGFzdCgpO1xuXHRcdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuX2xpc3RXaWRnZXQuZ2V0Rm9jdXMoKVswXTtcblx0XHRcdHRoaXMuX2xpc3RXaWRnZXQucmV2ZWFsKGZvY3VzZWQpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChmb2N1c2VkSXhzWzBdID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2xpc3RXaWRnZXQuc2V0Rm9jdXMoW10pO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9saXN0V2lkZ2V0LmZvY3VzUHJldmlvdXMoKTtcblx0XHRcdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuX2xpc3RXaWRnZXQuZ2V0Rm9jdXMoKVswXTtcblx0XHRcdFx0dGhpcy5fbGlzdFdpZGdldC5yZXZlYWwoZm9jdXNlZCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjbGVhckZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xpc3RXaWRnZXQuc2V0Rm9jdXMoW10pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2NhbmRpZGF0ZVZpZXdIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRjb25zdCB7IHRvdGFsSGVpZ2h0IH0gPSBSZW5hbWVDYW5kaWRhdGVWaWV3LmdldExheW91dEluZm8oeyBsaW5lSGVpZ2h0OiB0aGlzLl9saW5lSGVpZ2h0IH0pO1xuXHRcdHJldHVybiB0b3RhbEhlaWdodDtcblx0fVxuXG5cdHByaXZhdGUgX3BpY2tMaXN0SGVpZ2h0KG5DYW5kaWRhdGVzOiBudW1iZXIpIHtcblx0XHRjb25zdCBoZWlnaHRUb0ZpdEFsbENhbmRpZGF0ZXMgPSB0aGlzLl9jYW5kaWRhdGVWaWV3SGVpZ2h0ICogbkNhbmRpZGF0ZXM7XG5cdFx0Y29uc3QgTUFYX05fQ0FORElEQVRFUyA9IDc7ICAvLyBAdWx1Z2Jla25hOiBtYXggIyBvZiBjYW5kaWRhdGVzIHdlIHdhbnQgdG8gc2hvdyBhdCBvbmNlXG5cdFx0Y29uc3QgaGVpZ2h0ID0gTWF0aC5taW4oaGVpZ2h0VG9GaXRBbGxDYW5kaWRhdGVzLCB0aGlzLl9hdmFpbGFibGVIZWlnaHQsIHRoaXMuX2NhbmRpZGF0ZVZpZXdIZWlnaHQgKiBNQVhfTl9DQU5ESURBVEVTKTtcblx0XHRyZXR1cm4gaGVpZ2h0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcGlja0xpc3RXaWR0aChjYW5kaWRhdGVzOiBOZXdTeW1ib2xOYW1lW10pOiBudW1iZXIge1xuXHRcdGNvbnN0IGxvbmdlc3RDYW5kaWRhdGVXaWR0aCA9IE1hdGguY2VpbChNYXRoLm1heCguLi5jYW5kaWRhdGVzLm1hcChjID0+IGMubmV3U3ltYm9sTmFtZS5sZW5ndGgpKSAqIHRoaXMuX3R5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCk7XG5cdFx0Y29uc3Qgd2lkdGggPSBNYXRoLm1heChcblx0XHRcdHRoaXMuX21pbmltdW1XaWR0aCxcblx0XHRcdDQgLyogcGFkZGluZyAqLyArIDE2IC8qIHNwYXJrbGUgaWNvbiAqLyArIDUgLyogbWFyZ2luLWxlZnQgKi8gKyBsb25nZXN0Q2FuZGlkYXRlV2lkdGggKyAxMCAvKiAocG9zc2libHkgdmlzaWJsZSkgc2Nyb2xsYmFyIHdpZHRoICovIC8vIFRPRE9AdWx1Z2Jla25hOiBhcHByb3hpbWF0ZSBjYWxjIC0gY2xlYW4gdGhpcyB1cFxuXHRcdCk7XG5cdFx0cmV0dXJuIHdpZHRoO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NyZWF0ZUxpc3RXaWRnZXQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgY2FuZGlkYXRlVmlld0hlaWdodDogbnVtYmVyLCBmb250SW5mbzogRm9udEluZm8pIHtcblx0XHRjb25zdCB2aXJ0dWFsRGVsZWdhdGUgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxOZXdTeW1ib2xOYW1lPiB7XG5cdFx0XHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IE5ld1N5bWJvbE5hbWUpOiBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gJ2NhbmRpZGF0ZSc7XG5cdFx0XHR9XG5cblx0XHRcdGdldEhlaWdodChlbGVtZW50OiBOZXdTeW1ib2xOYW1lKTogbnVtYmVyIHtcblx0XHRcdFx0cmV0dXJuIGNhbmRpZGF0ZVZpZXdIZWlnaHQ7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlbmRlcmVyID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxOZXdTeW1ib2xOYW1lLCBSZW5hbWVDYW5kaWRhdGVWaWV3PiB7XG5cdFx0XHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gJ2NhbmRpZGF0ZSc7XG5cblx0XHRcdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBSZW5hbWVDYW5kaWRhdGVWaWV3IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBSZW5hbWVDYW5kaWRhdGVWaWV3KGNvbnRhaW5lciwgZm9udEluZm8pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZW5kZXJFbGVtZW50KGNhbmRpZGF0ZTogTmV3U3ltYm9sTmFtZSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBSZW5hbWVDYW5kaWRhdGVWaWV3KTogdm9pZCB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5wb3B1bGF0ZShjYW5kaWRhdGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBSZW5hbWVDYW5kaWRhdGVWaWV3KTogdm9pZCB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHJldHVybiBuZXcgTGlzdChcblx0XHRcdCdOZXdTeW1ib2xOYW1lQ2FuZGlkYXRlcycsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHR2aXJ0dWFsRGVsZWdhdGUsXG5cdFx0XHRbcmVuZGVyZXJdLFxuXHRcdFx0e1xuXHRcdFx0XHRrZXlib2FyZFN1cHBvcnQ6IGZhbHNlLCAvLyBAdWx1Z2Jla25hOiBiZWNhdXNlIHdlIGhhbmRsZSBrZXlib2FyZCBldmVudHMgdGhyb3VnaCBwcm9wZXIgY29tbWFuZHMgJiBrZXliaW5kaW5nIHNlcnZpY2UsIHNlZSBgcmVuYW1lLnRzYFxuXHRcdFx0XHRtb3VzZVN1cHBvcnQ6IHRydWUsXG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxufVxuXG5jbGFzcyBJbnB1dFdpdGhCdXR0b24gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfYnV0dG9uU3RhdGU6ICdzcGFya2xlJyB8ICdzdG9wJyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9kb21Ob2RlOiBIVE1MRGl2RWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaW5wdXROb2RlOiBIVE1MSW5wdXRFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9idXR0b25Ob2RlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYnV0dG9uSG92ZXJDb250ZW50OiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBfYnV0dG9uR2VuSG92ZXJUZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2J1dHRvbkNhbmNlbEhvdmVyVGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zcGFya2xlSWNvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3N0b3BJY29uOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZElucHV0Q2hhbmdlID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRJbnB1dENoYW5nZSA9IHRoaXMuX29uRGlkSW5wdXRDaGFuZ2UuZXZlbnQ7XG5cblx0Z2V0IGRvbU5vZGUoKSB7XG5cdFx0aWYgKCF0aGlzLl9kb21Ob2RlKSB7XG5cblx0XHRcdHRoaXMuX2RvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NOYW1lID0gJ3JlbmFtZS1pbnB1dC13aXRoLWJ1dHRvbic7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAncm93Jztcblx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuXG5cdFx0XHR0aGlzLl9pbnB1dE5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbnB1dCcpO1xuXHRcdFx0dGhpcy5faW5wdXROb2RlLmNsYXNzTmFtZSA9ICdyZW5hbWUtaW5wdXQnO1xuXHRcdFx0dGhpcy5faW5wdXROb2RlLnR5cGUgPSAndGV4dCc7XG5cdFx0XHR0aGlzLl9pbnB1dE5vZGUuc3R5bGUuYm9yZGVyID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5faW5wdXROb2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIG5scy5sb2NhbGl6ZSgncmVuYW1lQXJpYUxhYmVsJywgXCJSZW5hbWUgaW5wdXQuIFR5cGUgbmV3IG5hbWUgYW5kIHByZXNzIEVudGVyIHRvIGNvbW1pdC5cIikpO1xuXG5cdFx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2lucHV0Tm9kZSk7XG5cblx0XHRcdHRoaXMuX2J1dHRvbk5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdHRoaXMuX2J1dHRvbk5vZGUuY2xhc3NOYW1lID0gJ3JlbmFtZS1zdWdnZXN0aW9ucy1idXR0b24nO1xuXHRcdFx0dGhpcy5fYnV0dG9uTm9kZS5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJzAnKTtcblxuXHRcdFx0dGhpcy5fYnV0dG9uR2VuSG92ZXJUZXh0ID0gbmxzLmxvY2FsaXplKCdnZW5lcmF0ZVJlbmFtZVN1Z2dlc3Rpb25zQnV0dG9uJywgXCJHZW5lcmF0ZSBOZXcgTmFtZSBTdWdnZXN0aW9uc1wiKTtcblx0XHRcdHRoaXMuX2J1dHRvbkNhbmNlbEhvdmVyVGV4dCA9IG5scy5sb2NhbGl6ZSgnY2FuY2VsUmVuYW1lU3VnZ2VzdGlvbnNCdXR0b24nLCBcIkNhbmNlbFwiKTtcblx0XHRcdHRoaXMuX2J1dHRvbkhvdmVyQ29udGVudCA9IHRoaXMuX2J1dHRvbkdlbkhvdmVyVGV4dDtcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChnZXRCYXNlTGF5ZXJIb3ZlckRlbGVnYXRlKCkuc2V0dXBEZWxheWVkSG92ZXIodGhpcy5fYnV0dG9uTm9kZSwgKCkgPT4gKHtcblx0XHRcdFx0Y29udGVudDogdGhpcy5fYnV0dG9uSG92ZXJDb250ZW50LFxuXHRcdFx0XHRzdHlsZTogSG92ZXJTdHlsZS5Qb2ludGVyLFxuXHRcdFx0fSkpKTtcblxuXHRcdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9idXR0b25Ob2RlKTtcblxuXHRcdFx0Ly8gbm90aWZ5IGlmIHNlbGVjdGlvbiBjaGFuZ2VzIHRvIGNhbmNlbCByZXF1ZXN0IHRvIHJlbmFtZS1zdWdnZXN0aW9uIHByb3ZpZGVyc1xuXG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmlucHV0LCBkb20uRXZlbnRUeXBlLklOUFVULCAoKSA9PiB0aGlzLl9vbkRpZElucHV0Q2hhbmdlLmZpcmUoKSkpO1xuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5pbnB1dCwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGUpID0+IHtcblx0XHRcdFx0Y29uc3Qga2V5RXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRpZiAoa2V5RXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5MZWZ0QXJyb3cgfHwga2V5RXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5SaWdodEFycm93KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRJbnB1dENoYW5nZS5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuaW5wdXQsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuX29uRGlkSW5wdXRDaGFuZ2UuZmlyZSgpKSk7XG5cblx0XHRcdC8vIGZvY3VzIFwiY29udGFpbmVyXCIgYm9yZGVyIGluc3RlYWQgb2YgaW5wdXQgYm94XG5cblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuaW5wdXQsIGRvbS5FdmVudFR5cGUuRk9DVVMsICgpID0+IHtcblx0XHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLm91dGxpbmVXaWR0aCA9ICcxcHgnO1xuXHRcdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUub3V0bGluZVN0eWxlID0gJ3NvbGlkJztcblx0XHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnLTFweCc7XG5cdFx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5vdXRsaW5lQ29sb3IgPSAndmFyKC0tdnNjb2RlLWZvY3VzQm9yZGVyKSc7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmlucHV0LCBkb20uRXZlbnRUeXBlLkJMVVIsICgpID0+IHtcblx0XHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLm91dGxpbmUgPSAnbm9uZSc7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9kb21Ob2RlO1xuXHR9XG5cblx0Z2V0IGlucHV0KCkge1xuXHRcdGFzc2VydFR5cGUodGhpcy5faW5wdXROb2RlKTtcblx0XHRyZXR1cm4gdGhpcy5faW5wdXROb2RlO1xuXHR9XG5cblx0Z2V0IGJ1dHRvbigpIHtcblx0XHRhc3NlcnRUeXBlKHRoaXMuX2J1dHRvbk5vZGUpO1xuXHRcdHJldHVybiB0aGlzLl9idXR0b25Ob2RlO1xuXHR9XG5cblx0Z2V0IGJ1dHRvblN0YXRlKCkge1xuXHRcdHJldHVybiB0aGlzLl9idXR0b25TdGF0ZTtcblx0fVxuXG5cdHNldFNwYXJrbGVCdXR0b24oKSB7XG5cdFx0dGhpcy5fYnV0dG9uU3RhdGUgPSAnc3BhcmtsZSc7XG5cdFx0dGhpcy5fc3BhcmtsZUljb24gPz89IHJlbmRlckljb24oQ29kaWNvbi5zcGFya2xlKTtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuYnV0dG9uKTtcblx0XHR0aGlzLmJ1dHRvbi5hcHBlbmRDaGlsZCh0aGlzLl9zcGFya2xlSWNvbik7XG5cdFx0dGhpcy5idXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0dlbmVyYXRpbmcgbmV3IG5hbWUgc3VnZ2VzdGlvbnMnKTtcblx0XHR0aGlzLl9idXR0b25Ib3ZlckNvbnRlbnQgPSB0aGlzLl9idXR0b25HZW5Ib3ZlclRleHQhO1xuXHRcdHRoaXMuaW5wdXQuZm9jdXMoKTtcblx0fVxuXG5cdHNldFN0b3BCdXR0b24oKSB7XG5cdFx0dGhpcy5fYnV0dG9uU3RhdGUgPSAnc3RvcCc7XG5cdFx0dGhpcy5fc3RvcEljb24gPz89IHJlbmRlckljb24oQ29kaWNvbi5zdG9wQ2lyY2xlKTtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuYnV0dG9uKTtcblx0XHR0aGlzLmJ1dHRvbi5hcHBlbmRDaGlsZCh0aGlzLl9zdG9wSWNvbik7XG5cdFx0dGhpcy5idXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0NhbmNlbCBnZW5lcmF0aW5nIG5ldyBuYW1lIHN1Z2dlc3Rpb25zJyk7XG5cdFx0dGhpcy5fYnV0dG9uSG92ZXJDb250ZW50ID0gdGhpcy5fYnV0dG9uQ2FuY2VsSG92ZXJUZXh0ITtcblx0XHR0aGlzLmlucHV0LmZvY3VzKCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBSZW5hbWVDYW5kaWRhdGVWaWV3IHtcblxuXHRwcml2YXRlIHN0YXRpYyBfUEFERElORzogbnVtYmVyID0gMjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfaWNvbjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsOiBIVE1MRWxlbWVudDtcblxuXHRjb25zdHJ1Y3RvcihwYXJlbnQ6IEhUTUxFbGVtZW50LCBmb250SW5mbzogRm9udEluZm8pIHtcblxuXHRcdHRoaXMuX2RvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTmFtZSA9ICdyZW5hbWUtYm94IHJlbmFtZS1jYW5kaWRhdGUnO1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuZGlzcGxheSA9IGBmbGV4YDtcblx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLmNvbHVtbkdhcCA9IGA1cHhgO1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuYWxpZ25JdGVtcyA9IGBjZW50ZXJgO1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuaGVpZ2h0ID0gYCR7Zm9udEluZm8ubGluZUhlaWdodH1weGA7XG5cdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5wYWRkaW5nID0gYCR7UmVuYW1lQ2FuZGlkYXRlVmlldy5fUEFERElOR31weGA7XG5cblx0XHQvLyBAdWx1Z2Jla25hOiBuZWVkZWQgdG8ga2VlcCBzcGFjZSB3aGVuIHRoZSBgaWNvbi5zdHlsZS5kaXNwbGF5YCBpcyBzZXQgdG8gYG5vbmVgXG5cdFx0Y29uc3QgaWNvbkNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGljb25Db250YWluZXIuc3R5bGUuZGlzcGxheSA9IGBmbGV4YDtcblx0XHRpY29uQ29udGFpbmVyLnN0eWxlLmFsaWduSXRlbXMgPSBgY2VudGVyYDtcblx0XHRpY29uQ29udGFpbmVyLnN0eWxlLndpZHRoID0gaWNvbkNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtmb250SW5mby5saW5lSGVpZ2h0ICogMC44fXB4YDtcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKGljb25Db250YWluZXIpO1xuXG5cdFx0dGhpcy5faWNvbiA9IHJlbmRlckljb24oQ29kaWNvbi5zcGFya2xlKTtcblx0XHR0aGlzLl9pY29uLnN0eWxlLmRpc3BsYXkgPSBgbm9uZWA7XG5cdFx0aWNvbkNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9pY29uKTtcblxuXHRcdHRoaXMuX2xhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZG9tRm9udEluZm8uYXBwbHlGb250SW5mbyh0aGlzLl9sYWJlbCwgZm9udEluZm8pO1xuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fbGFiZWwpO1xuXG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKHRoaXMuX2RvbU5vZGUpO1xuXHR9XG5cblx0cHVibGljIHBvcHVsYXRlKHZhbHVlOiBOZXdTeW1ib2xOYW1lKSB7XG5cdFx0dGhpcy5fdXBkYXRlSWNvbih2YWx1ZSk7XG5cdFx0dGhpcy5fdXBkYXRlTGFiZWwodmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlSWNvbih2YWx1ZTogTmV3U3ltYm9sTmFtZSkge1xuXHRcdGNvbnN0IGlzQUlHZW5lcmF0ZWQgPSAhIXZhbHVlLnRhZ3M/LmluY2x1ZGVzKE5ld1N5bWJvbE5hbWVUYWcuQUlHZW5lcmF0ZWQpO1xuXHRcdHRoaXMuX2ljb24uc3R5bGUuZGlzcGxheSA9IGlzQUlHZW5lcmF0ZWQgPyAnaW5oZXJpdCcgOiAnbm9uZSc7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVMYWJlbCh2YWx1ZTogTmV3U3ltYm9sTmFtZSkge1xuXHRcdHRoaXMuX2xhYmVsLmlubmVyVGV4dCA9IHZhbHVlLm5ld1N5bWJvbE5hbWU7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGdldExheW91dEluZm8oeyBsaW5lSGVpZ2h0IH06IHsgbGluZUhlaWdodDogbnVtYmVyIH0pOiB7IHRvdGFsSGVpZ2h0OiBudW1iZXIgfSB7XG5cdFx0Y29uc3QgdG90YWxIZWlnaHQgPSBsaW5lSGVpZ2h0ICsgUmVuYW1lQ2FuZGlkYXRlVmlldy5fUEFERElORyAqIDIgLyogdG9wICYgYm90dG9tIHBhZGRpbmcgKi87XG5cdFx0cmV0dXJuIHsgdG90YWxIZWlnaHQgfTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCkge1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxZQUFZLFVBQVU7QUFDdEIsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxZQUFZO0FBQ3JCLFlBQVksWUFBWTtBQUN4QixTQUFTLGlCQUFpQix3QkFBd0I7QUFDbEQsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQThCLG9CQUFvQjtBQUMzRCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFlBQVksaUJBQWlCO0FBQ3RDLE9BQU87QUFDUCxZQUFZLGlCQUFpQjtBQUM3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
