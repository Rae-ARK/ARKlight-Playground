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
import { EventType, addDisposableListener, getActiveWindow, getWindow, isActiveElement } from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { ActionsOrientation } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import * as marked from "../../../../base/common/marked/marked.js";
import { Schemas } from "../../../../base/common/network.js";
import { isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { Position } from "../../../../editor/common/core/position.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { AccessibilityHelpNLS } from "../../../../editor/common/standaloneStrings.js";
import { CodeActionController } from "../../../../editor/contrib/codeAction/browser/codeActionController.js";
import { FloatingEditorToolbar } from "../../../../editor/contrib/floatingMenu/browser/floatingMenu.js";
import { localize } from "../../../../nls.js";
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType, ExtensionContentProvider, isIAccessibleViewContentProvider } from "../../../../platform/accessibility/browser/accessibleView.js";
import { ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX, IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ResultKind } from "../../../../platform/keybinding/common/keybindingResolver.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { FloatingEditorClickMenu } from "../../../browser/codeeditor.js";
import { IChatCodeBlockContextProviderService } from "../../chat/browser/chat.js";
import { getSimpleEditorOptions } from "../../codeEditor/browser/simpleEditorOptions.js";
import { AccessibilityCommandId } from "../common/accessibilityCommands.js";
import { AccessibilityWorkbenchSettingId, accessibilityHelpIsShown, accessibleViewContainsCodeBlocks, accessibleViewCurrentProviderId, accessibleViewGoToSymbolSupported, accessibleViewHasAssignedKeybindings, accessibleViewHasUnassignedKeybindings, accessibleViewInCodeBlock, accessibleViewIsShown, accessibleViewOnLastLine, accessibleViewSupportsNavigation, accessibleViewVerbosityEnabled } from "./accessibilityConfiguration.js";
import { resolveContentAndKeybindingItems } from "./accessibleViewKeybindingResolver.js";
var DIMENSIONS = /* @__PURE__ */ ((DIMENSIONS2) => {
  DIMENSIONS2[DIMENSIONS2["MAX_WIDTH"] = 900] = "MAX_WIDTH";
  DIMENSIONS2[DIMENSIONS2["WIDTH_RATIO"] = 0.75] = "WIDTH_RATIO";
  DIMENSIONS2[DIMENSIONS2["MAX_HEIGHT_RATIO"] = 0.6] = "MAX_HEIGHT_RATIO";
  return DIMENSIONS2;
})(DIMENSIONS || {});
let AccessibleView = class extends Disposable {
  constructor(_openerService, _instantiationService, _configurationService, _modelService, _contextViewService, _contextKeyService, _accessibilityService, _keybindingService, _layoutService, _menuService, _commandService, _codeBlockContextProviderService, _storageService, _quickInputService, _accessibilitySignalService) {
    super();
    this._openerService = _openerService;
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._modelService = _modelService;
    this._contextViewService = _contextViewService;
    this._contextKeyService = _contextKeyService;
    this._accessibilityService = _accessibilityService;
    this._keybindingService = _keybindingService;
    this._layoutService = _layoutService;
    this._menuService = _menuService;
    this._commandService = _commandService;
    this._codeBlockContextProviderService = _codeBlockContextProviderService;
    this._storageService = _storageService;
    this._quickInputService = _quickInputService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._isInQuickPick = false;
    this._lastProviderPosition = /* @__PURE__ */ new Map();
    this._accessiblityHelpIsShown = accessibilityHelpIsShown.bindTo(this._contextKeyService);
    this._accessibleViewIsShown = accessibleViewIsShown.bindTo(this._contextKeyService);
    this._accessibleViewSupportsNavigation = accessibleViewSupportsNavigation.bindTo(this._contextKeyService);
    this._accessibleViewVerbosityEnabled = accessibleViewVerbosityEnabled.bindTo(this._contextKeyService);
    this._accessibleViewGoToSymbolSupported = accessibleViewGoToSymbolSupported.bindTo(this._contextKeyService);
    this._accessibleViewCurrentProviderId = accessibleViewCurrentProviderId.bindTo(this._contextKeyService);
    this._accessibleViewInCodeBlock = accessibleViewInCodeBlock.bindTo(this._contextKeyService);
    this._accessibleViewContainsCodeBlocks = accessibleViewContainsCodeBlocks.bindTo(this._contextKeyService);
    this._onLastLine = accessibleViewOnLastLine.bindTo(this._contextKeyService);
    this._hasUnassignedKeybindings = accessibleViewHasUnassignedKeybindings.bindTo(this._contextKeyService);
    this._hasAssignedKeybindings = accessibleViewHasAssignedKeybindings.bindTo(this._contextKeyService);
    this._container = document.createElement("div");
    this._container.classList.add("accessible-view");
    if (this._configurationService.getValue(AccessibilityWorkbenchSettingId.HideAccessibleView)) {
      this._container.classList.add("hide");
    }
    const codeEditorWidgetOptions = {
      contributions: EditorExtensionsRegistry.getEditorContributions().filter((c) => c.id !== CodeActionController.ID && c.id !== FloatingEditorClickMenu.ID && c.id !== FloatingEditorToolbar.ID)
    };
    const titleBar = document.createElement("div");
    titleBar.classList.add("accessible-view-title-bar");
    this._title = document.createElement("div");
    this._title.classList.add("accessible-view-title");
    titleBar.appendChild(this._title);
    const actionBar = document.createElement("div");
    actionBar.classList.add("accessible-view-action-bar");
    titleBar.appendChild(actionBar);
    this._container.appendChild(titleBar);
    this._toolbar = this._register(_instantiationService.createInstance(WorkbenchToolBar, actionBar, { orientation: ActionsOrientation.HORIZONTAL }));
    this._toolbar.context = { viewId: "accessibleView" };
    const toolbarElt = this._toolbar.getElement();
    toolbarElt.tabIndex = 0;
    const editorOptions = {
      ...getSimpleEditorOptions(this._configurationService),
      lineDecorationsWidth: 6,
      dragAndDrop: false,
      cursorWidth: 1,
      wordWrap: "off",
      wrappingStrategy: "advanced",
      wrappingIndent: "none",
      padding: { top: 2, bottom: 2 },
      quickSuggestions: false,
      renderWhitespace: "none",
      dropIntoEditor: { enabled: false },
      readOnly: true,
      fontFamily: "var(--monaco-monospace-font)"
    };
    this._editorWidget = this._register(this._instantiationService.createInstance(CodeEditorWidget, this._container, editorOptions, codeEditorWidgetOptions));
    this._register(this._accessibilityService.onDidChangeScreenReaderOptimized(() => {
      if (this._currentProvider && this._accessiblityHelpIsShown.get()) {
        this.show(this._currentProvider);
      }
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (isIAccessibleViewContentProvider(this._currentProvider) && e.affectsConfiguration(this._currentProvider.verbositySettingKey)) {
        if (this._accessiblityHelpIsShown.get()) {
          this.show(this._currentProvider);
        }
        this._accessibleViewVerbosityEnabled.set(this._configurationService.getValue(this._currentProvider.verbositySettingKey));
        this._updateToolbar(this._currentProvider.actions, this._currentProvider.options.type);
      }
      if (e.affectsConfiguration(AccessibilityWorkbenchSettingId.HideAccessibleView)) {
        this._container.classList.toggle("hide", this._configurationService.getValue(AccessibilityWorkbenchSettingId.HideAccessibleView));
      }
    }));
    this._register(this._editorWidget.onDidDispose(() => this._resetContextKeys()));
    this._register(this._editorWidget.onDidChangeCursorPosition(() => {
      this._onLastLine.set(this._editorWidget.getPosition()?.lineNumber === this._editorWidget.getModel()?.getLineCount());
      const cursorPosition = this._editorWidget.getPosition()?.lineNumber;
      if (this._codeBlocks && cursorPosition !== void 0) {
        const inCodeBlock = this._codeBlocks.find((c) => c.startLine <= cursorPosition && c.endLine >= cursorPosition) !== void 0;
        this._accessibleViewInCodeBlock.set(inCodeBlock);
      }
      this._playDiffSignals();
    }));
  }
  get editorWidget() {
    return this._editorWidget;
  }
  _playDiffSignals() {
    if (this._currentProvider?.id !== AccessibleViewProviderId.DiffEditor && this._currentProvider?.id !== AccessibleViewProviderId.InlineCompletions) {
      return;
    }
    const position = this._editorWidget.getPosition();
    const model = this._editorWidget.getModel();
    if (!position || !model) {
      return void 0;
    }
    const lineContent = model.getLineContent(position.lineNumber);
    if (lineContent?.startsWith("+")) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineInserted);
    } else if (lineContent?.startsWith("-")) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineDeleted);
    }
  }
  _resetContextKeys() {
    this._accessiblityHelpIsShown.reset();
    this._accessibleViewIsShown.reset();
    this._accessibleViewSupportsNavigation.reset();
    this._accessibleViewVerbosityEnabled.reset();
    this._accessibleViewGoToSymbolSupported.reset();
    this._accessibleViewCurrentProviderId.reset();
    this._hasAssignedKeybindings.reset();
    this._hasUnassignedKeybindings.reset();
  }
  getPosition(id) {
    if (!id || !this._lastProvider || this._lastProvider.id !== id) {
      return void 0;
    }
    return this._editorWidget.getPosition() || void 0;
  }
  setPosition(position, reveal, select) {
    this._editorWidget.setPosition(position);
    if (reveal) {
      this._editorWidget.revealPosition(position);
    }
    if (select) {
      const lineLength = this._editorWidget.getModel()?.getLineLength(position.lineNumber) ?? 0;
      if (lineLength) {
        this._editorWidget.setSelection({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: lineLength + 1 });
      }
    }
  }
  getCodeBlockContext() {
    const position = this._editorWidget.getPosition();
    if (!this._codeBlocks?.length || !position) {
      return;
    }
    const codeBlockIndex = this._codeBlocks?.findIndex((c) => c.startLine <= position?.lineNumber && c.endLine >= position?.lineNumber);
    const codeBlock = codeBlockIndex !== void 0 && codeBlockIndex > -1 ? this._codeBlocks[codeBlockIndex] : void 0;
    if (!codeBlock || codeBlockIndex === void 0) {
      return;
    }
    return { code: codeBlock.code, languageId: codeBlock.languageId, codeBlockIndex, element: void 0, chatSessionResource: codeBlock.chatSessionResource };
  }
  navigateToCodeBlock(type) {
    const position = this._editorWidget.getPosition();
    if (!this._codeBlocks?.length || !position) {
      return;
    }
    let codeBlock;
    const codeBlocks = this._codeBlocks.slice();
    if (type === "previous") {
      codeBlock = codeBlocks.reverse().find((c) => c.endLine < position.lineNumber);
    } else {
      codeBlock = codeBlocks.find((c) => c.startLine > position.lineNumber);
    }
    if (!codeBlock) {
      return;
    }
    this.setPosition(new Position(codeBlock.startLine, 1), true);
  }
  showLastProvider(id) {
    if (!this._lastProvider || this._lastProvider.options.id !== id) {
      return;
    }
    this.show(this._lastProvider);
  }
  show(provider, symbol, showAccessibleViewHelp, position) {
    provider = provider ?? this._currentProvider;
    if (!provider) {
      return;
    }
    provider.onOpen?.();
    const delegate = {
      getAnchor: () => {
        return { x: getActiveWindow().innerWidth / 2 - Math.min(this._layoutService.activeContainerDimension.width * 0.75 /* WIDTH_RATIO */, 900 /* MAX_WIDTH */) / 2, y: this._layoutService.activeContainerOffset.quickPickTop };
      },
      render: (container) => {
        this._viewContainer = container;
        this._viewContainer.classList.add("accessible-view-container");
        return this._render(provider, container, showAccessibleViewHelp);
      },
      onHide: () => {
        if (!showAccessibleViewHelp) {
          this._updateLastProvider();
          if (this._currentProvider) {
            const currentPosition = this._editorWidget.getPosition();
            if (currentPosition) {
              this._lastProviderPosition.set(this._currentProvider.id, currentPosition);
            }
          }
          this._currentProvider?.dispose();
          this._currentProvider = void 0;
          this._resetContextKeys();
        }
      }
    };
    this._contextViewService.showContextView(delegate);
    if (position) {
      queueMicrotask(() => {
        this._editorWidget.revealLine(position.lineNumber);
        this._editorWidget.setSelection({ startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column });
      });
    }
    if (symbol && this._currentProvider) {
      this.showSymbol(this._currentProvider, symbol);
    }
    if (provider instanceof AccessibleContentProvider && provider.onDidRequestClearLastProvider) {
      this._register(provider.onDidRequestClearLastProvider((id) => {
        if (this._lastProvider?.options.id === id) {
          this._lastProvider = void 0;
        }
        this._lastProviderPosition.delete(id);
      }));
    }
    if (provider.options.id) {
      this._lastProvider = provider;
    }
    if (provider.id === AccessibleViewProviderId.PanelChat || provider.id === AccessibleViewProviderId.QuickChat) {
      this._register(this._codeBlockContextProviderService.registerProvider({ getCodeBlockContext: () => this.getCodeBlockContext() }, "accessibleView"));
    }
    if (provider instanceof ExtensionContentProvider) {
      this._storageService.store(`${ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX}${provider.id}`, true, StorageScope.APPLICATION, StorageTarget.USER);
    }
    if (provider.onDidChangeContent) {
      this._register(provider.onDidChangeContent(() => {
        if (this._viewContainer) {
          this._render(provider, this._viewContainer, showAccessibleViewHelp);
        }
      }));
    }
  }
  previous() {
    const newContent = this._currentProvider?.providePreviousContent?.();
    if (!this._currentProvider || !this._viewContainer || !newContent) {
      return;
    }
    this._render(this._currentProvider, this._viewContainer, void 0, newContent);
  }
  next() {
    const newContent = this._currentProvider?.provideNextContent?.();
    if (!this._currentProvider || !this._viewContainer || !newContent) {
      return;
    }
    this._render(this._currentProvider, this._viewContainer, void 0, newContent);
  }
  _verbosityEnabled() {
    if (!this._currentProvider) {
      return false;
    }
    return isIAccessibleViewContentProvider(this._currentProvider) ? this._configurationService.getValue(this._currentProvider.verbositySettingKey) === true : this._storageService.getBoolean(`${ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX}${this._currentProvider.id}`, StorageScope.APPLICATION, false);
  }
  goToSymbol() {
    if (!this._currentProvider) {
      return;
    }
    this._isInQuickPick = true;
    this._instantiationService.createInstance(AccessibleViewSymbolQuickPick, this).show(this._currentProvider);
  }
  calculateCodeBlocks(markdown) {
    if (!markdown) {
      return;
    }
    if (this._currentProvider?.id !== AccessibleViewProviderId.PanelChat && this._currentProvider?.id !== AccessibleViewProviderId.QuickChat) {
      return;
    }
    if (this._currentProvider.options.language && this._currentProvider.options.language !== "markdown") {
      return;
    }
    const lines = markdown.split("\n");
    this._codeBlocks = [];
    let inBlock = false;
    let startLine = 0;
    let languageId;
    lines.forEach((line, i) => {
      if (!inBlock && line.startsWith("```")) {
        inBlock = true;
        startLine = i + 1;
        languageId = line.substring(3).trim();
      } else if (inBlock && line.endsWith("```")) {
        inBlock = false;
        const endLine = i;
        const code = lines.slice(startLine, endLine).join("\n");
        this._codeBlocks?.push({ startLine, endLine, code, languageId, chatSessionResource: void 0 });
      }
    });
    this._accessibleViewContainsCodeBlocks.set(this._codeBlocks.length > 0);
  }
  getSymbols() {
    const provider = this._currentProvider ? this._currentProvider : void 0;
    if (!this._currentContent || !provider) {
      return;
    }
    const symbols = "getSymbols" in provider ? provider.getSymbols?.() || [] : [];
    if (symbols?.length) {
      return symbols;
    }
    if (provider.options.language && provider.options.language !== "markdown") {
      return;
    }
    const markdownTokens = marked.marked.lexer(this._currentContent);
    if (!markdownTokens) {
      return;
    }
    this._convertTokensToSymbols(markdownTokens, symbols);
    return symbols.length ? symbols : void 0;
  }
  openHelpLink() {
    if (!this._currentProvider?.options.readMoreUrl) {
      return;
    }
    this._openerService.open(URI.parse(this._currentProvider.options.readMoreUrl));
  }
  configureKeybindings(unassigned) {
    this._isInQuickPick = true;
    const provider = this._updateLastProvider();
    const items = unassigned ? provider?.options?.configureKeybindingItems : provider?.options?.configuredKeybindingItems;
    if (!items) {
      return;
    }
    const disposables = this._register(new DisposableStore());
    const quickPick = disposables.add(this._quickInputService.createQuickPick());
    quickPick.items = items;
    quickPick.title = localize("keybindings", "Configure keybindings");
    quickPick.placeholder = localize("selectKeybinding", "Select a command ID to configure a keybinding for it");
    quickPick.show();
    disposables.add(quickPick.onDidAccept(async () => {
      const item = quickPick.selectedItems[0];
      if (item) {
        await this._commandService.executeCommand("workbench.action.openGlobalKeybindings", item.id);
      }
      quickPick.dispose();
    }));
    disposables.add(quickPick.onDidHide(() => {
      if (!quickPick.selectedItems.length && provider) {
        this.show(provider);
      }
      disposables.dispose();
      this._isInQuickPick = false;
    }));
  }
  _convertTokensToSymbols(tokens, symbols) {
    let firstListItem;
    for (const token of tokens) {
      let label = void 0;
      if ("type" in token) {
        switch (token.type) {
          case "heading":
          case "paragraph":
          case "code":
            label = token.text;
            break;
          case "list": {
            const firstItem = token.items[0];
            if (!firstItem) {
              break;
            }
            firstListItem = `- ${firstItem.text}`;
            label = token.items.map((i) => i.text).join(", ");
            break;
          }
        }
      }
      if (label) {
        symbols.push({ markdownToParse: label, label: localize("symbolLabel", "({0}) {1}", token.type, label), ariaLabel: localize("symbolLabelAria", "({0}) {1}", token.type, label), firstListItem });
        firstListItem = void 0;
      }
    }
  }
  showSymbol(provider, symbol) {
    if (!this._currentContent) {
      return;
    }
    let lineNumber = symbol.lineNumber;
    const markdownToParse = symbol.markdownToParse;
    if (lineNumber === void 0 && markdownToParse === void 0) {
      return;
    }
    if (lineNumber === void 0 && markdownToParse) {
      const index = this._currentContent.split("\n").findIndex((line) => line.includes(markdownToParse.split("\n")[0]) || symbol.firstListItem && line.includes(symbol.firstListItem)) ?? -1;
      if (index >= 0) {
        lineNumber = index + 1;
      }
    }
    if (lineNumber === void 0) {
      return;
    }
    this._isInQuickPick = false;
    this.show(provider, void 0, void 0, { lineNumber, column: 1 });
    this._updateContextKeys(provider, true);
  }
  disableHint() {
    if (!isIAccessibleViewContentProvider(this._currentProvider)) {
      return;
    }
    this._configurationService.updateValue(this._currentProvider?.verbositySettingKey, false);
    alert(localize("disableAccessibilityHelp", "{0} accessibility verbosity is now disabled", this._currentProvider.verbositySettingKey));
  }
  _updateContextKeys(provider, shown) {
    if (provider.options.type === AccessibleViewType.Help) {
      this._accessiblityHelpIsShown.set(shown);
      this._accessibleViewIsShown.reset();
    } else {
      this._accessibleViewIsShown.set(shown);
      this._accessiblityHelpIsShown.reset();
    }
    this._accessibleViewSupportsNavigation.set(provider.provideNextContent !== void 0 || provider.providePreviousContent !== void 0);
    this._accessibleViewVerbosityEnabled.set(this._verbosityEnabled());
    this._accessibleViewGoToSymbolSupported.set(this._goToSymbolsSupported() ? this.getSymbols()?.length > 0 : false);
  }
  _getStableUri(providerId) {
    return URI.from({ path: `accessible-view-${providerId}`, scheme: Schemas.accessibleView });
  }
  _updateContent(provider, updatedContent) {
    let content = updatedContent ?? provider.provideContent();
    if (provider.options.type === AccessibleViewType.View) {
      this._currentContent = content;
      this._hasUnassignedKeybindings.reset();
      this._hasAssignedKeybindings.reset();
      return;
    }
    const readMoreLinkHint = this._readMoreHint(provider);
    const disableHelpHint = this._disableVerbosityHint(provider);
    const screenReaderModeHint = this._screenReaderModeHint(provider);
    const exitThisDialogHint = this._exitDialogHint(provider);
    let configureKbHint = "";
    let configureAssignedKbHint = "";
    const resolvedContent = resolveContentAndKeybindingItems(this._keybindingService, screenReaderModeHint + content + readMoreLinkHint + disableHelpHint + exitThisDialogHint);
    if (resolvedContent) {
      content = resolvedContent.content.value;
      if (resolvedContent.configureKeybindingItems) {
        provider.options.configureKeybindingItems = resolvedContent.configureKeybindingItems;
        this._hasUnassignedKeybindings.set(true);
        configureKbHint = this._configureUnassignedKbHint();
      } else {
        this._hasAssignedKeybindings.reset();
      }
      if (resolvedContent.configuredKeybindingItems) {
        provider.options.configuredKeybindingItems = resolvedContent.configuredKeybindingItems;
        this._hasAssignedKeybindings.set(true);
        configureAssignedKbHint = this._configureAssignedKbHint();
      } else {
        this._hasAssignedKeybindings.reset();
      }
    }
    this._currentContent = content + configureKbHint + configureAssignedKbHint;
  }
  _render(provider, container, showAccessibleViewHelp, updatedContent) {
    const isSameProvider = this._currentProvider?.id === provider.id;
    const previousPosition = isSameProvider ? this._editorWidget.getPosition() : void 0;
    const previousScrollTop = isSameProvider ? this._editorWidget.getScrollTop() : void 0;
    this._currentProvider = provider;
    this._accessibleViewCurrentProviderId.set(provider.id);
    const verbose = this._verbosityEnabled();
    this._updateContent(provider, updatedContent);
    this.calculateCodeBlocks(this._currentContent);
    this._updateContextKeys(provider, true);
    const widgetIsFocused = this._editorWidget.hasTextFocus() || this._editorWidget.hasWidgetFocus();
    const stableUri = this._getStableUri(provider.id);
    this._getTextModel(stableUri).then((model) => {
      if (!model) {
        return;
      }
      const currentContent = this._currentContent ?? "";
      if (model.getValue() !== currentContent) {
        model.setValue(currentContent);
      }
      if (this._editorWidget.getModel() !== model) {
        this._editorWidget.setModel(model);
      }
      const domNode = this._editorWidget.getDomNode();
      if (!domNode) {
        return;
      }
      model.setLanguage(provider.options.language ?? "markdown");
      container.appendChild(this._container);
      let actionsHint = "";
      const hasActions = this._accessibleViewSupportsNavigation.get() || this._accessibleViewVerbosityEnabled.get() || this._accessibleViewGoToSymbolSupported.get() || provider.actions?.length;
      if (verbose && !showAccessibleViewHelp && hasActions) {
        actionsHint = provider.options.position ? localize("ariaAccessibleViewActionsBottom", "Explore actions such as disabling this hint (Shift+Tab), use Escape to exit this dialog.") : localize("ariaAccessibleViewActions", "Explore actions such as disabling this hint (Shift+Tab).");
      }
      let ariaLabel = provider.options.type === AccessibleViewType.Help ? localize("accessibility-help", "Accessibility Help") : localize("accessible-view", "Accessible View");
      this._title.textContent = ariaLabel;
      if (actionsHint && provider.options.type === AccessibleViewType.View) {
        ariaLabel = localize("accessible-view-hint", "Accessible View, {0}", actionsHint);
      } else if (actionsHint) {
        ariaLabel = localize("accessibility-help-hint", "Accessibility Help, {0}", actionsHint);
      }
      if (isWindows && widgetIsFocused) {
        ariaLabel = "";
      }
      this._editorWidget.updateOptions({ ariaLabel });
      this._editorWidget.focus();
      if (this._currentProvider?.options.position) {
        const position = this._editorWidget.getPosition();
        const isDefaultPosition = position?.lineNumber === 1 && position.column === 1;
        const lineCount = this.editorWidget.getModel()?.getLineCount();
        const savedPosition = this._lastProviderPosition.get(provider.id);
        const preservedPosition = this._currentProvider.options.position === "initial-bottom-preserve" ? previousPosition ?? savedPosition : this._currentProvider.options.position === "initial-bottom" && !isSameProvider ? savedPosition : void 0;
        if (preservedPosition && preservedPosition.lineNumber <= (lineCount ?? 0)) {
          this._editorWidget.setPosition(preservedPosition);
          if (this._currentProvider.options.position === "initial-bottom-preserve" && previousScrollTop !== void 0) {
            this._editorWidget.setScrollTop(previousScrollTop);
          } else {
            this._editorWidget.revealLine(preservedPosition.lineNumber);
          }
        } else if (this._currentProvider.options.position === "bottom" || this._currentProvider.options.position === "initial-bottom-preserve" || this._currentProvider.options.position === "initial-bottom" && isDefaultPosition) {
          const lastLine = lineCount;
          const position2 = lastLine !== void 0 && lastLine > 0 ? new Position(lastLine, 1) : void 0;
          if (position2) {
            this._editorWidget.setPosition(position2);
            this._editorWidget.revealLine(position2.lineNumber);
          }
        }
      } else if (previousPosition) {
        this._editorWidget.setPosition(previousPosition);
      } else {
        const savedPosition = this._lastProviderPosition.get(provider.id);
        if (savedPosition) {
          const lineCount = this._editorWidget.getModel()?.getLineCount() ?? 0;
          if (savedPosition.lineNumber <= lineCount) {
            this._editorWidget.setPosition(savedPosition);
            this._editorWidget.revealPosition(savedPosition);
          }
        }
      }
    });
    this._updateToolbar(this._currentProvider.actions, provider.options.type);
    const hide = (e) => {
      const thisWindowIsFocused = getWindow(this._editorWidget.getDomNode()).document.hasFocus();
      if (!thisWindowIsFocused) {
        e?.preventDefault();
        e?.stopPropagation();
        return;
      }
      if (!this._isInQuickPick) {
        provider.onClose();
      }
      e?.stopPropagation();
      this._contextViewService.hideContextView();
      if (this._isInQuickPick) {
        return;
      }
      this._updateContextKeys(provider, false);
      const currentPosition = this._editorWidget.getPosition();
      if (currentPosition) {
        this._lastProviderPosition.set(provider.id, currentPosition);
      }
      this._lastProvider = void 0;
      this._currentContent = void 0;
      this._currentProvider?.dispose();
      this._currentProvider = void 0;
    };
    const disposableStore = new DisposableStore();
    disposableStore.add(this._editorWidget.onKeyDown((e) => {
      if (e.keyCode === KeyCode.Enter) {
        this._commandService.executeCommand("editor.action.openLink");
      } else if (e.keyCode === KeyCode.Escape || shouldHide(e.browserEvent, this._keybindingService, this._configurationService)) {
        hide(e);
      } else if (e.keyCode === KeyCode.KeyH && provider.options.readMoreUrl) {
        const url = provider.options.readMoreUrl;
        alert(AccessibilityHelpNLS.openingDocs);
        this._openerService.open(URI.parse(url));
        e.preventDefault();
        e.stopPropagation();
      }
      if (provider instanceof AccessibleContentProvider) {
        provider.onKeyDown?.(e);
      }
    }));
    disposableStore.add(addDisposableListener(this._toolbar.getElement(), EventType.KEY_DOWN, (e) => {
      const keyboardEvent = new StandardKeyboardEvent(e);
      if (keyboardEvent.equals(KeyCode.Escape)) {
        hide(e);
      }
    }));
    disposableStore.add(this._editorWidget.onDidBlurEditorWidget(() => {
      if (!isActiveElement(this._toolbar.getElement())) {
        hide();
      }
    }));
    disposableStore.add(this._editorWidget.onDidContentSizeChange(() => this._layout()));
    disposableStore.add(this._layoutService.onDidLayoutActiveContainer(() => this._layout()));
    return disposableStore;
  }
  _updateToolbar(providedActions, type) {
    this._toolbar.setAriaLabel(type === AccessibleViewType.Help ? localize("accessibleHelpToolbar", "Accessibility Help") : localize("accessibleViewToolbar", "Accessible View"));
    const toolbarMenu = this._register(this._menuService.createMenu(MenuId.AccessibleView, this._contextKeyService));
    const menuActions = getFlatActionBarActions(toolbarMenu.getActions({}));
    if (providedActions) {
      for (const providedAction of providedActions) {
        providedAction.class = providedAction.class || ThemeIcon.asClassName(Codicon.primitiveSquare);
        providedAction.checked = void 0;
      }
      this._toolbar.setActions([...providedActions, ...menuActions]);
    } else {
      this._toolbar.setActions(menuActions);
    }
  }
  _layout() {
    const dimension = this._layoutService.activeContainerDimension;
    const maxHeight = dimension.height && dimension.height * 0.6 /* MAX_HEIGHT_RATIO */;
    const height = Math.min(maxHeight, this._editorWidget.getContentHeight());
    const width = Math.min(dimension.width * 0.75 /* WIDTH_RATIO */, 900 /* MAX_WIDTH */);
    this._editorWidget.layout({ width, height });
  }
  async _getTextModel(resource) {
    const existing = this._modelService.getModel(resource);
    if (existing && !existing.isDisposed()) {
      return existing;
    }
    return this._modelService.createModel("", null, resource, false);
  }
  _goToSymbolsSupported() {
    if (!this._currentProvider) {
      return false;
    }
    return this._currentProvider.options.type === AccessibleViewType.Help || this._currentProvider.options.language === "markdown" || this._currentProvider.options.language === void 0 || this._currentProvider instanceof AccessibleContentProvider && !!this._currentProvider.getSymbols?.();
  }
  _updateLastProvider() {
    const provider = this._currentProvider;
    if (!provider) {
      return;
    }
    const lastProvider = provider instanceof AccessibleContentProvider ? new AccessibleContentProvider(
      provider.id,
      provider.options,
      provider.provideContent.bind(provider),
      provider.onClose.bind(provider),
      provider.verbositySettingKey,
      provider.onOpen?.bind(provider),
      provider.actions,
      provider.provideNextContent?.bind(provider),
      provider.providePreviousContent?.bind(provider),
      provider.onDidChangeContent?.bind(provider),
      provider.onKeyDown?.bind(provider),
      provider.getSymbols?.bind(provider)
    ) : new ExtensionContentProvider(
      provider.id,
      provider.options,
      provider.provideContent.bind(provider),
      provider.onClose.bind(provider),
      provider.onOpen?.bind(provider),
      provider.provideNextContent?.bind(provider),
      provider.providePreviousContent?.bind(provider),
      provider.actions,
      provider.onDidChangeContent?.bind(provider)
    );
    return lastProvider;
  }
  showAccessibleViewHelp() {
    const lastProvider = this._updateLastProvider();
    if (!lastProvider) {
      return;
    }
    let accessibleViewHelpProvider;
    if (lastProvider instanceof AccessibleContentProvider) {
      accessibleViewHelpProvider = new AccessibleContentProvider(
        lastProvider.id,
        { type: AccessibleViewType.Help },
        () => lastProvider.options.customHelp ? lastProvider?.options.customHelp() : this._accessibleViewHelpDialogContent(this._goToSymbolsSupported()),
        () => {
          this._contextViewService.hideContextView();
          queueMicrotask(() => this.show(lastProvider));
        },
        lastProvider.verbositySettingKey
      );
    } else {
      accessibleViewHelpProvider = new ExtensionContentProvider(
        lastProvider.id,
        { type: AccessibleViewType.Help },
        () => lastProvider.options.customHelp ? lastProvider?.options.customHelp() : this._accessibleViewHelpDialogContent(this._goToSymbolsSupported()),
        () => {
          this._contextViewService.hideContextView();
          queueMicrotask(() => this.show(lastProvider));
        }
      );
    }
    this._contextViewService.hideContextView();
    if (accessibleViewHelpProvider) {
      queueMicrotask(() => this.show(accessibleViewHelpProvider, void 0, true));
    }
  }
  _accessibleViewHelpDialogContent(providerHasSymbols) {
    const navigationHint = this._navigationHint();
    const goToSymbolHint = this._goToSymbolHint(providerHasSymbols);
    const toolbarHint = localize("toolbar", "Navigate to the toolbar (Shift+Tab).");
    const chatHints = this._getChatHints();
    let hint = localize("intro", "In the accessible view, you can:\n");
    if (navigationHint) {
      hint += " - " + navigationHint + "\n";
    }
    if (goToSymbolHint) {
      hint += " - " + goToSymbolHint + "\n";
    }
    if (toolbarHint) {
      hint += " - " + toolbarHint + "\n";
    }
    if (chatHints) {
      hint += chatHints;
    }
    return hint;
  }
  _getChatHints() {
    if (this._currentProvider?.id !== AccessibleViewProviderId.PanelChat && this._currentProvider?.id !== AccessibleViewProviderId.QuickChat) {
      return;
    }
    return [
      localize("insertAtCursor", " - Insert the code block at the cursor{0}.", "<keybinding:workbench.action.chat.insertCodeBlock>"),
      localize("insertIntoNewFile", " - Insert the code block into a new file{0}.", "<keybinding:workbench.action.chat.insertIntoNewFile>"),
      localize("runInTerminal", " - Run the code block in the terminal{0}.\n", "<keybinding:workbench.action.chat.runInTerminal>")
    ].join("\n");
  }
  _navigationHint() {
    return localize("accessibleViewNextPreviousHint", "Show the next item{0} or previous item{1}.", `<keybinding:${AccessibilityCommandId.ShowNext}>`, `<keybinding:${AccessibilityCommandId.ShowPrevious}>`);
  }
  _disableVerbosityHint(provider) {
    if (provider.options.type === AccessibleViewType.Help && this._verbosityEnabled()) {
      return localize("acessibleViewDisableHint", "\nDisable accessibility verbosity for this feature{0}.", `<keybinding:${AccessibilityCommandId.DisableVerbosityHint}>`);
    }
    return "";
  }
  _goToSymbolHint(providerHasSymbols) {
    if (!providerHasSymbols) {
      return;
    }
    return localize("goToSymbolHint", "Go to a symbol{0}.", `<keybinding:${AccessibilityCommandId.GoToSymbol}>`);
  }
  _configureUnassignedKbHint() {
    const configureKb = this._keybindingService.lookupKeybinding(AccessibilityCommandId.AccessibilityHelpConfigureKeybindings)?.getAriaLabel();
    const keybindingToConfigureQuickPick = configureKb ? "(" + configureKb + ")" : "by assigning a keybinding to the command Accessibility Help Configure Unassigned Keybindings.";
    return localize("configureKb", "\nConfigure keybindings for commands that lack them {0}.", keybindingToConfigureQuickPick);
  }
  _configureAssignedKbHint() {
    const configureKb = this._keybindingService.lookupKeybinding(AccessibilityCommandId.AccessibilityHelpConfigureAssignedKeybindings)?.getAriaLabel();
    const keybindingToConfigureQuickPick = configureKb ? "(" + configureKb + ")" : "by assigning a keybinding to the command Accessibility Help Configure Assigned Keybindings.";
    return localize("configureKbAssigned", "\nConfigure keybindings for commands that already have assignments {0}.", keybindingToConfigureQuickPick);
  }
  _screenReaderModeHint(provider) {
    const accessibilitySupport = this._accessibilityService.isScreenReaderOptimized();
    let screenReaderModeHint = "";
    const turnOnMessage = isMacintosh ? AccessibilityHelpNLS.changeConfigToOnMac : AccessibilityHelpNLS.changeConfigToOnWinLinux;
    if (accessibilitySupport && provider.id === AccessibleViewProviderId.Editor) {
      screenReaderModeHint = AccessibilityHelpNLS.auto_on;
      screenReaderModeHint += "\n";
    } else if (!accessibilitySupport) {
      screenReaderModeHint = AccessibilityHelpNLS.auto_off + "\n" + turnOnMessage;
      screenReaderModeHint += "\n";
    }
    return screenReaderModeHint;
  }
  _exitDialogHint(provider) {
    return this._verbosityEnabled() && !provider.options.position ? localize("exit", "\nExit this dialog (Escape).") : "";
  }
  _readMoreHint(provider) {
    return provider.options.readMoreUrl ? localize("openDoc", "\nOpen a browser window with more information related to accessibility{0}.", `<keybinding:${AccessibilityCommandId.AccessibilityHelpOpenHelpLink}>`) : "";
  }
};
AccessibleView = __decorateClass([
  __decorateParam(0, IOpenerService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IModelService),
  __decorateParam(4, IContextViewService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IAccessibilityService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, ILayoutService),
  __decorateParam(9, IMenuService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IChatCodeBlockContextProviderService),
  __decorateParam(12, IStorageService),
  __decorateParam(13, IQuickInputService),
  __decorateParam(14, IAccessibilitySignalService)
], AccessibleView);
let AccessibleViewService = class extends Disposable {
  constructor(_instantiationService, _configurationService, _keybindingService) {
    super();
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._keybindingService = _keybindingService;
  }
  show(provider, position) {
    if (!this._accessibleView) {
      this._accessibleView = this._register(this._instantiationService.createInstance(AccessibleView));
    }
    this._accessibleView.show(provider, void 0, void 0, position);
  }
  configureKeybindings(unassigned) {
    this._accessibleView?.configureKeybindings(unassigned);
  }
  openHelpLink() {
    this._accessibleView?.openHelpLink();
  }
  showLastProvider(id) {
    this._accessibleView?.showLastProvider(id);
  }
  next() {
    this._accessibleView?.next();
  }
  previous() {
    this._accessibleView?.previous();
  }
  goToSymbol() {
    this._accessibleView?.goToSymbol();
  }
  getOpenAriaHint(verbositySettingKey) {
    if (!this._configurationService.getValue(verbositySettingKey)) {
      return null;
    }
    const keybinding = this._keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibleView)?.getAriaLabel();
    let hint = null;
    if (keybinding) {
      hint = localize("acessibleViewHint", "Inspect this in the accessible view with {0}", keybinding);
    } else {
      hint = localize("acessibleViewHintNoKbEither", "Inspect this in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding.");
    }
    return hint;
  }
  disableHint() {
    this._accessibleView?.disableHint();
  }
  showAccessibleViewHelp() {
    this._accessibleView?.showAccessibleViewHelp();
  }
  getPosition(id) {
    return this._accessibleView?.getPosition(id) ?? void 0;
  }
  getLastPosition() {
    const lastLine = this._accessibleView?.editorWidget.getModel()?.getLineCount();
    return lastLine !== void 0 && lastLine > 0 ? new Position(lastLine, 1) : void 0;
  }
  setPosition(position, reveal, select) {
    this._accessibleView?.setPosition(position, reveal, select);
  }
  getCodeBlockContext() {
    return this._accessibleView?.getCodeBlockContext();
  }
  navigateToCodeBlock(type) {
    this._accessibleView?.navigateToCodeBlock(type);
  }
};
AccessibleViewService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IKeybindingService)
], AccessibleViewService);
let AccessibleViewSymbolQuickPick = class {
  constructor(_accessibleView, _quickInputService) {
    this._accessibleView = _accessibleView;
    this._quickInputService = _quickInputService;
  }
  show(provider) {
    const disposables = new DisposableStore();
    const quickPick = disposables.add(this._quickInputService.createQuickPick());
    quickPick.placeholder = localize("accessibleViewSymbolQuickPickPlaceholder", "Type to search symbols");
    quickPick.title = localize("accessibleViewSymbolQuickPickTitle", "Go to Symbol Accessible View");
    const picks = [];
    const symbols = this._accessibleView.getSymbols();
    if (!symbols) {
      return;
    }
    for (const symbol of symbols) {
      picks.push({
        label: symbol.label,
        ariaLabel: symbol.ariaLabel,
        firstListItem: symbol.firstListItem,
        lineNumber: symbol.lineNumber,
        endLineNumber: symbol.endLineNumber,
        markdownToParse: symbol.markdownToParse
      });
    }
    quickPick.canSelectMany = false;
    quickPick.items = picks;
    quickPick.show();
    disposables.add(quickPick.onDidAccept(() => {
      this._accessibleView.showSymbol(provider, quickPick.selectedItems[0]);
      quickPick.hide();
    }));
    disposables.add(quickPick.onDidHide(() => {
      if (quickPick.selectedItems.length === 0) {
        this._accessibleView.show(provider);
      }
      disposables.dispose();
    }));
  }
};
AccessibleViewSymbolQuickPick = __decorateClass([
  __decorateParam(1, IQuickInputService)
], AccessibleViewSymbolQuickPick);
function shouldHide(event, keybindingService, configurationService) {
  if (!configurationService.getValue(AccessibilityWorkbenchSettingId.AccessibleViewCloseOnKeyPress)) {
    return false;
  }
  const standardKeyboardEvent = new StandardKeyboardEvent(event);
  const resolveResult = keybindingService.softDispatch(standardKeyboardEvent, standardKeyboardEvent.target);
  const isValidChord = resolveResult.kind === ResultKind.MoreChordsNeeded;
  if (keybindingService.inChordMode || isValidChord) {
    return false;
  }
  return shouldHandleKey(event) && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}
function shouldHandleKey(event) {
  return !!event.code.match(/^(Key[A-Z]|Digit[0-9]|Equal|Comma|Period|Slash|Quote|Backquote|Backslash|Minus|Semicolon|Space|Enter)$/);
}
export {
  AccessibleView,
  AccessibleViewService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV2ZW50VHlwZSwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBnZXRBY3RpdmVXaW5kb3csIGdldFdpbmRvdywgaXNBY3RpdmVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCwgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uc09yaWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBtYXJrZWQgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFya2VkL21hcmtlZC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2NvbmZpZy9lZGl0b3JDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCwgSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcblxuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eUhlbHBOTFMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3N0YW5kYWxvbmVTdHJpbmdzLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25Db250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi9icm93c2VyL2NvZGVBY3Rpb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IEZsb2F0aW5nRWRpdG9yVG9vbGJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Zsb2F0aW5nTWVudS9icm93c2VyL2Zsb2F0aW5nTWVudS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmxlQ29udGVudFByb3ZpZGVyLCBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQsIEFjY2Vzc2libGVWaWV3VHlwZSwgRXh0ZW5zaW9uQ29udGVudFByb3ZpZGVyLCBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlLCBJQWNjZXNzaWJsZVZpZXdTeW1ib2wsIGlzSUFjY2Vzc2libGVWaWV3Q29udGVudFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IEFDQ0VTU0lCTEVfVklFV19TSE9XTl9TVE9SQUdFX1BSRUZJWCwgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0RmxhdEFjdGlvbkJhckFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdEZWxlZ2F0ZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFJlc3VsdEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IEZsb2F0aW5nRWRpdG9yQ2xpY2tNZW51IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb2RlZWRpdG9yLmpzJztcbmltcG9ydCB7IElDaGF0Q29kZUJsb2NrQ29udGV4dFByb3ZpZGVyU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElDb2RlQmxvY2tBY3Rpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NvZGVCbG9ja1BhcnQuanMnO1xuaW1wb3J0IHsgZ2V0U2ltcGxlRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9zaW1wbGVFZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlDb21tYW5kSWQgfSBmcm9tICcuLi9jb21tb24vYWNjZXNzaWJpbGl0eUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQsIEFjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQsIGFjY2Vzc2liaWxpdHlIZWxwSXNTaG93biwgYWNjZXNzaWJsZVZpZXdDb250YWluc0NvZGVCbG9ja3MsIGFjY2Vzc2libGVWaWV3Q3VycmVudFByb3ZpZGVySWQsIGFjY2Vzc2libGVWaWV3R29Ub1N5bWJvbFN1cHBvcnRlZCwgYWNjZXNzaWJsZVZpZXdIYXNBc3NpZ25lZEtleWJpbmRpbmdzLCBhY2Nlc3NpYmxlVmlld0hhc1VuYXNzaWduZWRLZXliaW5kaW5ncywgYWNjZXNzaWJsZVZpZXdJbkNvZGVCbG9jaywgYWNjZXNzaWJsZVZpZXdJc1Nob3duLCBhY2Nlc3NpYmxlVmlld09uTGFzdExpbmUsIGFjY2Vzc2libGVWaWV3U3VwcG9ydHNOYXZpZ2F0aW9uLCBhY2Nlc3NpYmxlVmlld1ZlcmJvc2l0eUVuYWJsZWQgfSBmcm9tICcuL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IHJlc29sdmVDb250ZW50QW5kS2V5YmluZGluZ0l0ZW1zIH0gZnJvbSAnLi9hY2Nlc3NpYmxlVmlld0tleWJpbmRpbmdSZXNvbHZlci5qcyc7XG5cbmNvbnN0IGVudW0gRElNRU5TSU9OUyB7XG5cdE1BWF9XSURUSCA9IDkwMCxcblx0V0lEVEhfUkFUSU8gPSAwLjc1LFxuXHRNQVhfSEVJR0hUX1JBVElPID0gMC42XG59XG5cbmV4cG9ydCB0eXBlIEFjY2VzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIgPSBBY2Nlc3NpYmxlQ29udGVudFByb3ZpZGVyIHwgRXh0ZW5zaW9uQ29udGVudFByb3ZpZGVyO1xuXG5pbnRlcmZhY2UgSUNvZGVCbG9jayB7XG5cdHN0YXJ0TGluZTogbnVtYmVyO1xuXHRlbmRMaW5lOiBudW1iZXI7XG5cdGNvZGU6IHN0cmluZztcblx0bGFuZ3VhZ2VJZD86IHN0cmluZztcblx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgQWNjZXNzaWJsZVZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfZWRpdG9yV2lkZ2V0OiBDb2RlRWRpdG9yV2lkZ2V0O1xuXG5cdHByaXZhdGUgX2FjY2Vzc2libGl0eUhlbHBJc1Nob3duOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfb25MYXN0TGluZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX2FjY2Vzc2libGVWaWV3SXNTaG93bjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX2FjY2Vzc2libGVWaWV3U3VwcG9ydHNOYXZpZ2F0aW9uOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfYWNjZXNzaWJsZVZpZXdWZXJib3NpdHlFbmFibGVkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfYWNjZXNzaWJsZVZpZXdHb1RvU3ltYm9sU3VwcG9ydGVkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfYWNjZXNzaWJsZVZpZXdDdXJyZW50UHJvdmlkZXJJZDogSUNvbnRleHRLZXk8c3RyaW5nPjtcblx0cHJpdmF0ZSBfYWNjZXNzaWJsZVZpZXdJbkNvZGVCbG9jazogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX2FjY2Vzc2libGVWaWV3Q29udGFpbnNDb2RlQmxvY2tzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfaGFzVW5hc3NpZ25lZEtleWJpbmRpbmdzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfaGFzQXNzaWduZWRLZXliaW5kaW5nczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBfY29kZUJsb2Nrcz86IElDb2RlQmxvY2tbXTtcblx0cHJpdmF0ZSBfaXNJblF1aWNrUGljazogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGdldCBlZGl0b3JXaWRnZXQoKSB7IHJldHVybiB0aGlzLl9lZGl0b3JXaWRnZXQ7IH1cblx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfdGl0bGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b29sYmFyOiBXb3JrYmVuY2hUb29sQmFyO1xuXG5cdHByaXZhdGUgX2N1cnJlbnRQcm92aWRlcjogQWNjZXNpYmxlVmlld0NvbnRlbnRQcm92aWRlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3VycmVudENvbnRlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9sYXN0UHJvdmlkZXI6IEFjY2VzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RQcm92aWRlclBvc2l0aW9uOiBNYXA8c3RyaW5nLCBQb3NpdGlvbj4gPSBuZXcgTWFwKCk7XG5cblx0cHJpdmF0ZSBfdmlld0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXRTZXJ2aWNlOiBJTGF5b3V0U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ2hhdENvZGVCbG9ja0NvbnRleHRQcm92aWRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29kZUJsb2NrQ29udGV4dFByb3ZpZGVyU2VydmljZTogSUNoYXRDb2RlQmxvY2tDb250ZXh0UHJvdmlkZXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTogSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fYWNjZXNzaWJsaXR5SGVscElzU2hvd24gPSBhY2Nlc3NpYmlsaXR5SGVscElzU2hvd24uYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld0lzU2hvd24gPSBhY2Nlc3NpYmxlVmlld0lzU2hvd24uYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld1N1cHBvcnRzTmF2aWdhdGlvbiA9IGFjY2Vzc2libGVWaWV3U3VwcG9ydHNOYXZpZ2F0aW9uLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXdWZXJib3NpdHlFbmFibGVkID0gYWNjZXNzaWJsZVZpZXdWZXJib3NpdHlFbmFibGVkLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXdHb1RvU3ltYm9sU3VwcG9ydGVkID0gYWNjZXNzaWJsZVZpZXdHb1RvU3ltYm9sU3VwcG9ydGVkLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXdDdXJyZW50UHJvdmlkZXJJZCA9IGFjY2Vzc2libGVWaWV3Q3VycmVudFByb3ZpZGVySWQuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld0luQ29kZUJsb2NrID0gYWNjZXNzaWJsZVZpZXdJbkNvZGVCbG9jay5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3Q29udGFpbnNDb2RlQmxvY2tzID0gYWNjZXNzaWJsZVZpZXdDb250YWluc0NvZGVCbG9ja3MuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9vbkxhc3RMaW5lID0gYWNjZXNzaWJsZVZpZXdPbkxhc3RMaW5lLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzVW5hc3NpZ25lZEtleWJpbmRpbmdzID0gYWNjZXNzaWJsZVZpZXdIYXNVbmFzc2lnbmVkS2V5YmluZGluZ3MuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNBc3NpZ25lZEtleWJpbmRpbmdzID0gYWNjZXNzaWJsZVZpZXdIYXNBc3NpZ25lZEtleWJpbmRpbmdzLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9jb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYWNjZXNzaWJsZS12aWV3Jyk7XG5cdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEFjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQuSGlkZUFjY2Vzc2libGVWaWV3KSkge1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2hpZGUnKTtcblx0XHR9XG5cdFx0Y29uc3QgY29kZUVkaXRvcldpZGdldE9wdGlvbnM6IElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyA9IHtcblx0XHRcdGNvbnRyaWJ1dGlvbnM6IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRFZGl0b3JDb250cmlidXRpb25zKClcblx0XHRcdFx0LmZpbHRlcihjID0+IGMuaWQgIT09IENvZGVBY3Rpb25Db250cm9sbGVyLklEICYmIGMuaWQgIT09IEZsb2F0aW5nRWRpdG9yQ2xpY2tNZW51LklEICYmIGMuaWQgIT09IEZsb2F0aW5nRWRpdG9yVG9vbGJhci5JRClcblx0XHR9O1xuXHRcdGNvbnN0IHRpdGxlQmFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGl0bGVCYXIuY2xhc3NMaXN0LmFkZCgnYWNjZXNzaWJsZS12aWV3LXRpdGxlLWJhcicpO1xuXHRcdHRoaXMuX3RpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fdGl0bGUuY2xhc3NMaXN0LmFkZCgnYWNjZXNzaWJsZS12aWV3LXRpdGxlJyk7XG5cdFx0dGl0bGVCYXIuYXBwZW5kQ2hpbGQodGhpcy5fdGl0bGUpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGFjdGlvbkJhci5jbGFzc0xpc3QuYWRkKCdhY2Nlc3NpYmxlLXZpZXctYWN0aW9uLWJhcicpO1xuXHRcdHRpdGxlQmFyLmFwcGVuZENoaWxkKGFjdGlvbkJhcik7XG5cdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHRpdGxlQmFyKTtcblx0XHR0aGlzLl90b29sYmFyID0gdGhpcy5fcmVnaXN0ZXIoX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRvb2xCYXIsIGFjdGlvbkJhciwgeyBvcmllbnRhdGlvbjogQWN0aW9uc09yaWVudGF0aW9uLkhPUklaT05UQUwgfSkpO1xuXHRcdHRoaXMuX3Rvb2xiYXIuY29udGV4dCA9IHsgdmlld0lkOiAnYWNjZXNzaWJsZVZpZXcnIH07XG5cdFx0Y29uc3QgdG9vbGJhckVsdCA9IHRoaXMuX3Rvb2xiYXIuZ2V0RWxlbWVudCgpO1xuXHRcdHRvb2xiYXJFbHQudGFiSW5kZXggPSAwO1xuXG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9uczogSUVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMgPSB7XG5cdFx0XHQuLi5nZXRTaW1wbGVFZGl0b3JPcHRpb25zKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiA2LFxuXHRcdFx0ZHJhZ0FuZERyb3A6IGZhbHNlLFxuXHRcdFx0Y3Vyc29yV2lkdGg6IDEsXG5cdFx0XHR3b3JkV3JhcDogJ29mZicsXG5cdFx0XHR3cmFwcGluZ1N0cmF0ZWd5OiAnYWR2YW5jZWQnLFxuXHRcdFx0d3JhcHBpbmdJbmRlbnQ6ICdub25lJyxcblx0XHRcdHBhZGRpbmc6IHsgdG9wOiAyLCBib3R0b206IDIgfSxcblx0XHRcdHF1aWNrU3VnZ2VzdGlvbnM6IGZhbHNlLFxuXHRcdFx0cmVuZGVyV2hpdGVzcGFjZTogJ25vbmUnLFxuXHRcdFx0ZHJvcEludG9FZGl0b3I6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdHJlYWRPbmx5OiB0cnVlLFxuXHRcdFx0Zm9udEZhbWlseTogJ3ZhcigtLW1vbmFjby1tb25vc3BhY2UtZm9udCknXG5cdFx0fTtcblxuXHRcdHRoaXMuX2VkaXRvcldpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVFZGl0b3JXaWRnZXQsIHRoaXMuX2NvbnRhaW5lciwgZWRpdG9yT3B0aW9ucywgY29kZUVkaXRvcldpZGdldE9wdGlvbnMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5vbkRpZENoYW5nZVNjcmVlblJlYWRlck9wdGltaXplZCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudFByb3ZpZGVyICYmIHRoaXMuX2FjY2Vzc2libGl0eUhlbHBJc1Nob3duLmdldCgpKSB7XG5cdFx0XHRcdHRoaXMuc2hvdyh0aGlzLl9jdXJyZW50UHJvdmlkZXIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoaXNJQWNjZXNzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIodGhpcy5fY3VycmVudFByb3ZpZGVyKSAmJiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKHRoaXMuX2N1cnJlbnRQcm92aWRlci52ZXJib3NpdHlTZXR0aW5nS2V5KSkge1xuXHRcdFx0XHRpZiAodGhpcy5fYWNjZXNzaWJsaXR5SGVscElzU2hvd24uZ2V0KCkpIHtcblx0XHRcdFx0XHR0aGlzLnNob3codGhpcy5fY3VycmVudFByb3ZpZGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld1ZlcmJvc2l0eUVuYWJsZWQuc2V0KHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHRoaXMuX2N1cnJlbnRQcm92aWRlci52ZXJib3NpdHlTZXR0aW5nS2V5KSk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVRvb2xiYXIodGhpcy5fY3VycmVudFByb3ZpZGVyLmFjdGlvbnMsIHRoaXMuX2N1cnJlbnRQcm92aWRlci5vcHRpb25zLnR5cGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZC5IaWRlQWNjZXNzaWJsZVZpZXcpKSB7XG5cdFx0XHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlJywgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZC5IaWRlQWNjZXNzaWJsZVZpZXcpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yV2lkZ2V0Lm9uRGlkRGlzcG9zZSgoKSA9PiB0aGlzLl9yZXNldENvbnRleHRLZXlzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JXaWRnZXQub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkxhc3RMaW5lLnNldCh0aGlzLl9lZGl0b3JXaWRnZXQuZ2V0UG9zaXRpb24oKT8ubGluZU51bWJlciA9PT0gdGhpcy5fZWRpdG9yV2lkZ2V0LmdldE1vZGVsKCk/LmdldExpbmVDb3VudCgpKTtcblx0XHRcdGNvbnN0IGN1cnNvclBvc2l0aW9uID0gdGhpcy5fZWRpdG9yV2lkZ2V0LmdldFBvc2l0aW9uKCk/LmxpbmVOdW1iZXI7XG5cdFx0XHRpZiAodGhpcy5fY29kZUJsb2NrcyAmJiBjdXJzb3JQb3NpdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IGluQ29kZUJsb2NrID0gdGhpcy5fY29kZUJsb2Nrcy5maW5kKGMgPT4gYy5zdGFydExpbmUgPD0gY3Vyc29yUG9zaXRpb24gJiYgYy5lbmRMaW5lID49IGN1cnNvclBvc2l0aW9uKSAhPT0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld0luQ29kZUJsb2NrLnNldChpbkNvZGVCbG9jayk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wbGF5RGlmZlNpZ25hbHMoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9wbGF5RGlmZlNpZ25hbHMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRQcm92aWRlcj8uaWQgIT09IEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZC5EaWZmRWRpdG9yICYmIHRoaXMuX2N1cnJlbnRQcm92aWRlcj8uaWQgIT09IEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZC5JbmxpbmVDb21wbGV0aW9ucykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX2VkaXRvcldpZGdldC5nZXRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yV2lkZ2V0LmdldE1vZGVsKCk7XG5cdFx0aWYgKCFwb3NpdGlvbiB8fCAhbW9kZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0aWYgKGxpbmVDb250ZW50Py5zdGFydHNXaXRoKCcrJykpIHtcblx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5kaWZmTGluZUluc2VydGVkKTtcblx0XHR9IGVsc2UgaWYgKGxpbmVDb250ZW50Py5zdGFydHNXaXRoKCctJykpIHtcblx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5kaWZmTGluZURlbGV0ZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Jlc2V0Q29udGV4dEtleXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWNjZXNzaWJsaXR5SGVscElzU2hvd24ucmVzZXQoKTtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld0lzU2hvd24ucmVzZXQoKTtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld1N1cHBvcnRzTmF2aWdhdGlvbi5yZXNldCgpO1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3VmVyYm9zaXR5RW5hYmxlZC5yZXNldCgpO1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3R29Ub1N5bWJvbFN1cHBvcnRlZC5yZXNldCgpO1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3Q3VycmVudFByb3ZpZGVySWQucmVzZXQoKTtcblx0XHR0aGlzLl9oYXNBc3NpZ25lZEtleWJpbmRpbmdzLnJlc2V0KCk7XG5cdFx0dGhpcy5faGFzVW5hc3NpZ25lZEtleWJpbmRpbmdzLnJlc2V0KCk7XG5cdH1cblxuXHRnZXRQb3NpdGlvbihpZD86IEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZCk6IFBvc2l0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWlkIHx8ICF0aGlzLl9sYXN0UHJvdmlkZXIgfHwgdGhpcy5fbGFzdFByb3ZpZGVyLmlkICE9PSBpZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvcldpZGdldC5nZXRQb3NpdGlvbigpIHx8IHVuZGVmaW5lZDtcblx0fVxuXG5cdHNldFBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbiwgcmV2ZWFsPzogYm9vbGVhbiwgc2VsZWN0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2VkaXRvcldpZGdldC5zZXRQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0aWYgKHJldmVhbCkge1xuXHRcdFx0dGhpcy5fZWRpdG9yV2lkZ2V0LnJldmVhbFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHR9XG5cdFx0aWYgKHNlbGVjdCkge1xuXHRcdFx0Y29uc3QgbGluZUxlbmd0aCA9IHRoaXMuX2VkaXRvcldpZGdldC5nZXRNb2RlbCgpPy5nZXRMaW5lTGVuZ3RoKHBvc2l0aW9uLmxpbmVOdW1iZXIpID8/IDA7XG5cdFx0XHRpZiAobGluZUxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JXaWRnZXQuc2V0U2VsZWN0aW9uKHsgc3RhcnRMaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lTnVtYmVyLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlciwgZW5kQ29sdW1uOiBsaW5lTGVuZ3RoICsgMSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRDb2RlQmxvY2tDb250ZXh0KCk6IElDb2RlQmxvY2tBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX2VkaXRvcldpZGdldC5nZXRQb3NpdGlvbigpO1xuXHRcdGlmICghdGhpcy5fY29kZUJsb2Nrcz8ubGVuZ3RoIHx8ICFwb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb2RlQmxvY2tJbmRleCA9IHRoaXMuX2NvZGVCbG9ja3M/LmZpbmRJbmRleChjID0+IGMuc3RhcnRMaW5lIDw9IHBvc2l0aW9uPy5saW5lTnVtYmVyICYmIGMuZW5kTGluZSA+PSBwb3NpdGlvbj8ubGluZU51bWJlcik7XG5cdFx0Y29uc3QgY29kZUJsb2NrID0gY29kZUJsb2NrSW5kZXggIT09IHVuZGVmaW5lZCAmJiBjb2RlQmxvY2tJbmRleCA+IC0xID8gdGhpcy5fY29kZUJsb2Nrc1tjb2RlQmxvY2tJbmRleF0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFjb2RlQmxvY2sgfHwgY29kZUJsb2NrSW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4geyBjb2RlOiBjb2RlQmxvY2suY29kZSwgbGFuZ3VhZ2VJZDogY29kZUJsb2NrLmxhbmd1YWdlSWQsIGNvZGVCbG9ja0luZGV4LCBlbGVtZW50OiB1bmRlZmluZWQsIGNoYXRTZXNzaW9uUmVzb3VyY2U6IGNvZGVCbG9jay5jaGF0U2Vzc2lvblJlc291cmNlIH07XG5cdH1cblxuXHRuYXZpZ2F0ZVRvQ29kZUJsb2NrKHR5cGU6ICduZXh0JyB8ICdwcmV2aW91cycpOiB2b2lkIHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX2VkaXRvcldpZGdldC5nZXRQb3NpdGlvbigpO1xuXHRcdGlmICghdGhpcy5fY29kZUJsb2Nrcz8ubGVuZ3RoIHx8ICFwb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgY29kZUJsb2NrO1xuXHRcdGNvbnN0IGNvZGVCbG9ja3MgPSB0aGlzLl9jb2RlQmxvY2tzLnNsaWNlKCk7XG5cdFx0aWYgKHR5cGUgPT09ICdwcmV2aW91cycpIHtcblx0XHRcdGNvZGVCbG9jayA9IGNvZGVCbG9ja3MucmV2ZXJzZSgpLmZpbmQoYyA9PiBjLmVuZExpbmUgPCBwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29kZUJsb2NrID0gY29kZUJsb2Nrcy5maW5kKGMgPT4gYy5zdGFydExpbmUgPiBwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHR9XG5cdFx0aWYgKCFjb2RlQmxvY2spIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zZXRQb3NpdGlvbihuZXcgUG9zaXRpb24oY29kZUJsb2NrLnN0YXJ0TGluZSwgMSksIHRydWUpO1xuXHR9XG5cblx0c2hvd0xhc3RQcm92aWRlcihpZDogQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9sYXN0UHJvdmlkZXIgfHwgdGhpcy5fbGFzdFByb3ZpZGVyLm9wdGlvbnMuaWQgIT09IGlkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuc2hvdyh0aGlzLl9sYXN0UHJvdmlkZXIpO1xuXHR9XG5cblx0c2hvdyhwcm92aWRlcj86IEFjY2VzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIsIHN5bWJvbD86IElBY2Nlc3NpYmxlVmlld1N5bWJvbCwgc2hvd0FjY2Vzc2libGVWaWV3SGVscD86IGJvb2xlYW4sIHBvc2l0aW9uPzogSVBvc2l0aW9uKTogdm9pZCB7XG5cdFx0cHJvdmlkZXIgPSBwcm92aWRlciA/PyB0aGlzLl9jdXJyZW50UHJvdmlkZXI7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRwcm92aWRlci5vbk9wZW4/LigpO1xuXHRcdGNvbnN0IGRlbGVnYXRlOiBJQ29udGV4dFZpZXdEZWxlZ2F0ZSA9IHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4geyByZXR1cm4geyB4OiAoZ2V0QWN0aXZlV2luZG93KCkuaW5uZXJXaWR0aCAvIDIpIC0gKChNYXRoLm1pbih0aGlzLl9sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lckRpbWVuc2lvbi53aWR0aCAqIERJTUVOU0lPTlMuV0lEVEhfUkFUSU8sIERJTUVOU0lPTlMuTUFYX1dJRFRIKSkgLyAyKSwgeTogdGhpcy5fbGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXJPZmZzZXQucXVpY2tQaWNrVG9wIH07IH0sXG5cdFx0XHRyZW5kZXI6IChjb250YWluZXIpID0+IHtcblx0XHRcdFx0dGhpcy5fdmlld0NvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHRcdFx0dGhpcy5fdmlld0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdhY2Nlc3NpYmxlLXZpZXctY29udGFpbmVyJyk7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZW5kZXIocHJvdmlkZXIsIGNvbnRhaW5lciwgc2hvd0FjY2Vzc2libGVWaWV3SGVscCk7XG5cdFx0XHR9LFxuXHRcdFx0b25IaWRlOiAoKSA9PiB7XG5cdFx0XHRcdGlmICghc2hvd0FjY2Vzc2libGVWaWV3SGVscCkge1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZUxhc3RQcm92aWRlcigpO1xuXHRcdFx0XHRcdC8vIFNhdmUgY3Vyc29yIHBvc2l0aW9uIGJlZm9yZSBkaXNwb3Npbmcgc28gaXQgY2FuIGJlIHJlc3RvcmVkIG9uIHJlb3BlblxuXHRcdFx0XHRcdGlmICh0aGlzLl9jdXJyZW50UHJvdmlkZXIpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRQb3NpdGlvbiA9IHRoaXMuX2VkaXRvcldpZGdldC5nZXRQb3NpdGlvbigpO1xuXHRcdFx0XHRcdFx0aWYgKGN1cnJlbnRQb3NpdGlvbikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9sYXN0UHJvdmlkZXJQb3NpdGlvbi5zZXQodGhpcy5fY3VycmVudFByb3ZpZGVyLmlkLCBjdXJyZW50UG9zaXRpb24pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9jdXJyZW50UHJvdmlkZXI/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLl9jdXJyZW50UHJvdmlkZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fcmVzZXRDb250ZXh0S2V5cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2Uuc2hvd0NvbnRleHRWaWV3KGRlbGVnYXRlKTtcblxuXHRcdGlmIChwb3NpdGlvbikge1xuXHRcdFx0Ly8gQ29udGV4dCB2aWV3IHRha2VzIHRpbWUgdG8gc2hvdyB1cCwgc28gd2UgbmVlZCB0byB3YWl0IGZvciBpdCB0byBzaG93IHVwIGJlZm9yZSB3ZSBjYW4gc2V0IHRoZSBwb3NpdGlvblxuXHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JXaWRnZXQucmV2ZWFsTGluZShwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yV2lkZ2V0LnNldFNlbGVjdGlvbih7IHN0YXJ0TGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlciwgc3RhcnRDb2x1bW46IHBvc2l0aW9uLmNvbHVtbiwgZW5kTGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlciwgZW5kQ29sdW1uOiBwb3NpdGlvbi5jb2x1bW4gfSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoc3ltYm9sICYmIHRoaXMuX2N1cnJlbnRQcm92aWRlcikge1xuXHRcdFx0dGhpcy5zaG93U3ltYm9sKHRoaXMuX2N1cnJlbnRQcm92aWRlciwgc3ltYm9sKTtcblx0XHR9XG5cdFx0aWYgKHByb3ZpZGVyIGluc3RhbmNlb2YgQWNjZXNzaWJsZUNvbnRlbnRQcm92aWRlciAmJiBwcm92aWRlci5vbkRpZFJlcXVlc3RDbGVhckxhc3RQcm92aWRlcikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocHJvdmlkZXIub25EaWRSZXF1ZXN0Q2xlYXJMYXN0UHJvdmlkZXIoKGlkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2xhc3RQcm92aWRlcj8ub3B0aW9ucy5pZCA9PT0gaWQpIHtcblx0XHRcdFx0XHR0aGlzLl9sYXN0UHJvdmlkZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbGFzdFByb3ZpZGVyUG9zaXRpb24uZGVsZXRlKGlkKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0aWYgKHByb3ZpZGVyLm9wdGlvbnMuaWQpIHtcblx0XHRcdC8vIG9ubHkgY2FjaGUgYSBwcm92aWRlciB3aXRoIGFuIElEIHNvIHRoYXQgaXQgd2lsbCBldmVudHVhbGx5IGJlIGNsZWFyZWQuXG5cdFx0XHR0aGlzLl9sYXN0UHJvdmlkZXIgPSBwcm92aWRlcjtcblx0XHR9XG5cdFx0aWYgKHByb3ZpZGVyLmlkID09PSBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuUGFuZWxDaGF0IHx8IHByb3ZpZGVyLmlkID09PSBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuUXVpY2tDaGF0KSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb2RlQmxvY2tDb250ZXh0UHJvdmlkZXJTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoeyBnZXRDb2RlQmxvY2tDb250ZXh0OiAoKSA9PiB0aGlzLmdldENvZGVCbG9ja0NvbnRleHQoKSB9LCAnYWNjZXNzaWJsZVZpZXcnKSk7XG5cdFx0fVxuXHRcdGlmIChwcm92aWRlciBpbnN0YW5jZW9mIEV4dGVuc2lvbkNvbnRlbnRQcm92aWRlcikge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoYCR7QUNDRVNTSUJMRV9WSUVXX1NIT1dOX1NUT1JBR0VfUFJFRklYfSR7cHJvdmlkZXIuaWR9YCwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdH1cblx0XHRpZiAocHJvdmlkZXIub25EaWRDaGFuZ2VDb250ZW50KSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihwcm92aWRlci5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fdmlld0NvbnRhaW5lcikgeyB0aGlzLl9yZW5kZXIocHJvdmlkZXIsIHRoaXMuX3ZpZXdDb250YWluZXIsIHNob3dBY2Nlc3NpYmxlVmlld0hlbHApOyB9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJldmlvdXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV3Q29udGVudCA9IHRoaXMuX2N1cnJlbnRQcm92aWRlcj8ucHJvdmlkZVByZXZpb3VzQ29udGVudD8uKCk7XG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50UHJvdmlkZXIgfHwgIXRoaXMuX3ZpZXdDb250YWluZXIgfHwgIW5ld0NvbnRlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcmVuZGVyKHRoaXMuX2N1cnJlbnRQcm92aWRlciwgdGhpcy5fdmlld0NvbnRhaW5lciwgdW5kZWZpbmVkLCBuZXdDb250ZW50KTtcblx0fVxuXG5cdG5leHQoKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV3Q29udGVudCA9IHRoaXMuX2N1cnJlbnRQcm92aWRlcj8ucHJvdmlkZU5leHRDb250ZW50Py4oKTtcblx0XHRpZiAoIXRoaXMuX2N1cnJlbnRQcm92aWRlciB8fCAhdGhpcy5fdmlld0NvbnRhaW5lciB8fCAhbmV3Q29udGVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZW5kZXIodGhpcy5fY3VycmVudFByb3ZpZGVyLCB0aGlzLl92aWV3Q29udGFpbmVyLCB1bmRlZmluZWQsIG5ld0NvbnRlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdmVyYm9zaXR5RW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX2N1cnJlbnRQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gaXNJQWNjZXNzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIodGhpcy5fY3VycmVudFByb3ZpZGVyKSA/IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHRoaXMuX2N1cnJlbnRQcm92aWRlci52ZXJib3NpdHlTZXR0aW5nS2V5KSA9PT0gdHJ1ZSA6IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oYCR7QUNDRVNTSUJMRV9WSUVXX1NIT1dOX1NUT1JBR0VfUFJFRklYfSR7dGhpcy5fY3VycmVudFByb3ZpZGVyLmlkfWAsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXHR9XG5cblx0Z29Ub1N5bWJvbCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2N1cnJlbnRQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc0luUXVpY2tQaWNrID0gdHJ1ZTtcblx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY2Nlc3NpYmxlVmlld1N5bWJvbFF1aWNrUGljaywgdGhpcykuc2hvdyh0aGlzLl9jdXJyZW50UHJvdmlkZXIpO1xuXHR9XG5cblx0Y2FsY3VsYXRlQ29kZUJsb2NrcyhtYXJrZG93bj86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghbWFya2Rvd24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRQcm92aWRlcj8uaWQgIT09IEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZC5QYW5lbENoYXQgJiYgdGhpcy5fY3VycmVudFByb3ZpZGVyPy5pZCAhPT0gQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLlF1aWNrQ2hhdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY3VycmVudFByb3ZpZGVyLm9wdGlvbnMubGFuZ3VhZ2UgJiYgdGhpcy5fY3VycmVudFByb3ZpZGVyLm9wdGlvbnMubGFuZ3VhZ2UgIT09ICdtYXJrZG93bicpIHtcblx0XHRcdC8vIFN5bWJvbHMgaGF2ZW4ndCBiZWVuIHByb3ZpZGVkIGFuZCB3ZSBjYW5ub3QgcGFyc2UgdGhpcyBsYW5ndWFnZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsaW5lcyA9IG1hcmtkb3duLnNwbGl0KCdcXG4nKTtcblx0XHR0aGlzLl9jb2RlQmxvY2tzID0gW107XG5cdFx0bGV0IGluQmxvY2sgPSBmYWxzZTtcblx0XHRsZXQgc3RhcnRMaW5lID0gMDtcblxuXHRcdGxldCBsYW5ndWFnZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGluZXMuZm9yRWFjaCgobGluZSwgaSkgPT4ge1xuXHRcdFx0aWYgKCFpbkJsb2NrICYmIGxpbmUuc3RhcnRzV2l0aCgnYGBgJykpIHtcblx0XHRcdFx0aW5CbG9jayA9IHRydWU7XG5cdFx0XHRcdHN0YXJ0TGluZSA9IGkgKyAxO1xuXHRcdFx0XHRsYW5ndWFnZUlkID0gbGluZS5zdWJzdHJpbmcoMykudHJpbSgpO1xuXHRcdFx0fSBlbHNlIGlmIChpbkJsb2NrICYmIGxpbmUuZW5kc1dpdGgoJ2BgYCcpKSB7XG5cdFx0XHRcdGluQmxvY2sgPSBmYWxzZTtcblx0XHRcdFx0Y29uc3QgZW5kTGluZSA9IGk7XG5cdFx0XHRcdGNvbnN0IGNvZGUgPSBsaW5lcy5zbGljZShzdGFydExpbmUsIGVuZExpbmUpLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHR0aGlzLl9jb2RlQmxvY2tzPy5wdXNoKHsgc3RhcnRMaW5lLCBlbmRMaW5lLCBjb2RlLCBsYW5ndWFnZUlkLCBjaGF0U2Vzc2lvblJlc291cmNlOiB1bmRlZmluZWQgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXdDb250YWluc0NvZGVCbG9ja3Muc2V0KHRoaXMuX2NvZGVCbG9ja3MubGVuZ3RoID4gMCk7XG5cdH1cblxuXHRnZXRTeW1ib2xzKCk6IElBY2Nlc3NpYmxlVmlld1N5bWJvbFtdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2N1cnJlbnRQcm92aWRlciA/IHRoaXMuX2N1cnJlbnRQcm92aWRlciA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXRoaXMuX2N1cnJlbnRDb250ZW50IHx8ICFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzeW1ib2xzOiBJQWNjZXNzaWJsZVZpZXdTeW1ib2xbXSA9ICdnZXRTeW1ib2xzJyBpbiBwcm92aWRlciA/IHByb3ZpZGVyLmdldFN5bWJvbHM/LigpIHx8IFtdIDogW107XG5cdFx0aWYgKHN5bWJvbHM/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHN5bWJvbHM7XG5cdFx0fVxuXHRcdGlmIChwcm92aWRlci5vcHRpb25zLmxhbmd1YWdlICYmIHByb3ZpZGVyLm9wdGlvbnMubGFuZ3VhZ2UgIT09ICdtYXJrZG93bicpIHtcblx0XHRcdC8vIFN5bWJvbHMgaGF2ZW4ndCBiZWVuIHByb3ZpZGVkIGFuZCB3ZSBjYW5ub3QgcGFyc2UgdGhpcyBsYW5ndWFnZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtYXJrZG93blRva2VuczogbWFya2VkLlRva2Vuc0xpc3QgfCB1bmRlZmluZWQgPSBtYXJrZWQubWFya2VkLmxleGVyKHRoaXMuX2N1cnJlbnRDb250ZW50KTtcblx0XHRpZiAoIW1hcmtkb3duVG9rZW5zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NvbnZlcnRUb2tlbnNUb1N5bWJvbHMobWFya2Rvd25Ub2tlbnMsIHN5bWJvbHMpO1xuXHRcdHJldHVybiBzeW1ib2xzLmxlbmd0aCA/IHN5bWJvbHMgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvcGVuSGVscExpbmsoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50UHJvdmlkZXI/Lm9wdGlvbnMucmVhZE1vcmVVcmwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZSh0aGlzLl9jdXJyZW50UHJvdmlkZXIub3B0aW9ucy5yZWFkTW9yZVVybCkpO1xuXHR9XG5cblx0Y29uZmlndXJlS2V5YmluZGluZ3ModW5hc3NpZ25lZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2lzSW5RdWlja1BpY2sgPSB0cnVlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fdXBkYXRlTGFzdFByb3ZpZGVyKCk7XG5cdFx0Y29uc3QgaXRlbXMgPSB1bmFzc2lnbmVkID8gcHJvdmlkZXI/Lm9wdGlvbnM/LmNvbmZpZ3VyZUtleWJpbmRpbmdJdGVtcyA6IHByb3ZpZGVyPy5vcHRpb25zPy5jb25maWd1cmVkS2V5YmluZGluZ0l0ZW1zO1xuXHRcdGlmICghaXRlbXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHF1aWNrUGljazogSVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbT4gPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKCkpO1xuXHRcdHF1aWNrUGljay5pdGVtcyA9IGl0ZW1zO1xuXHRcdHF1aWNrUGljay50aXRsZSA9IGxvY2FsaXplKCdrZXliaW5kaW5ncycsICdDb25maWd1cmUga2V5YmluZGluZ3MnKTtcblx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnc2VsZWN0S2V5YmluZGluZycsICdTZWxlY3QgYSBjb21tYW5kIElEIHRvIGNvbmZpZ3VyZSBhIGtleWJpbmRpbmcgZm9yIGl0Jyk7XG5cdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW0gPSBxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXTtcblx0XHRcdGlmIChpdGVtKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5HbG9iYWxLZXliaW5kaW5ncycsIGl0ZW0uaWQpO1xuXHRcdFx0fVxuXHRcdFx0cXVpY2tQaWNrLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0aWYgKCFxdWlja1BpY2suc2VsZWN0ZWRJdGVtcy5sZW5ndGggJiYgcHJvdmlkZXIpIHtcblx0XHRcdFx0dGhpcy5zaG93KHByb3ZpZGVyKTtcblx0XHRcdH1cblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2lzSW5RdWlja1BpY2sgPSBmYWxzZTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9jb252ZXJ0VG9rZW5zVG9TeW1ib2xzKHRva2VuczogbWFya2VkLlRva2Vuc0xpc3QsIHN5bWJvbHM6IElBY2Nlc3NpYmxlVmlld1N5bWJvbFtdKTogdm9pZCB7XG5cdFx0bGV0IGZpcnN0TGlzdEl0ZW06IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IHRva2VuIG9mIHRva2Vucykge1xuXHRcdFx0bGV0IGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoJ3R5cGUnIGluIHRva2VuKSB7XG5cdFx0XHRcdHN3aXRjaCAodG9rZW4udHlwZSkge1xuXHRcdFx0XHRcdGNhc2UgJ2hlYWRpbmcnOlxuXHRcdFx0XHRcdGNhc2UgJ3BhcmFncmFwaCc6XG5cdFx0XHRcdFx0Y2FzZSAnY29kZSc6XG5cdFx0XHRcdFx0XHRsYWJlbCA9IHRva2VuLnRleHQ7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdsaXN0Jzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgZmlyc3RJdGVtID0gKHRva2VuIGFzIG1hcmtlZC5Ub2tlbnMuTGlzdCkuaXRlbXNbMF07XG5cdFx0XHRcdFx0XHRpZiAoIWZpcnN0SXRlbSkge1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGZpcnN0TGlzdEl0ZW0gPSBgLSAke2ZpcnN0SXRlbS50ZXh0fWA7XG5cdFx0XHRcdFx0XHRsYWJlbCA9ICh0b2tlbiBhcyBtYXJrZWQuVG9rZW5zLkxpc3QpLml0ZW1zLm1hcChpID0+IGkudGV4dCkuam9pbignLCAnKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGxhYmVsKSB7XG5cdFx0XHRcdHN5bWJvbHMucHVzaCh7IG1hcmtkb3duVG9QYXJzZTogbGFiZWwsIGxhYmVsOiBsb2NhbGl6ZSgnc3ltYm9sTGFiZWwnLCBcIih7MH0pIHsxfVwiLCB0b2tlbi50eXBlLCBsYWJlbCksIGFyaWFMYWJlbDogbG9jYWxpemUoJ3N5bWJvbExhYmVsQXJpYScsIFwiKHswfSkgezF9XCIsIHRva2VuLnR5cGUsIGxhYmVsKSwgZmlyc3RMaXN0SXRlbSB9KTtcblx0XHRcdFx0Zmlyc3RMaXN0SXRlbSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRzaG93U3ltYm9sKHByb3ZpZGVyOiBBY2Nlc2libGVWaWV3Q29udGVudFByb3ZpZGVyLCBzeW1ib2w6IElBY2Nlc3NpYmxlVmlld1N5bWJvbCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY3VycmVudENvbnRlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IGxpbmVOdW1iZXI6IG51bWJlciB8IHVuZGVmaW5lZCA9IHN5bWJvbC5saW5lTnVtYmVyO1xuXHRcdGNvbnN0IG1hcmtkb3duVG9QYXJzZSA9IHN5bWJvbC5tYXJrZG93blRvUGFyc2U7XG5cdFx0aWYgKGxpbmVOdW1iZXIgPT09IHVuZGVmaW5lZCAmJiBtYXJrZG93blRvUGFyc2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gTm8gc3ltYm9scyBwcm92aWRlZCBhbmQgd2UgY2Fubm90IHBhcnNlIHRoaXMgbGFuZ3VhZ2Vcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAobGluZU51bWJlciA9PT0gdW5kZWZpbmVkICYmIG1hcmtkb3duVG9QYXJzZSkge1xuXHRcdFx0Ly8gTm90ZSB0aGF0IHRoaXMgc2NhbGVzIHBvb3JseSwgdGh1cyBpc24ndCB1c2VkIGZvciB3b3JzdCBjYXNlIHNjZW5hcmlvcyBsaWtlIHRoZSB0ZXJtaW5hbCwgZm9yIHdoaWNoIGEgbGluZSBudW1iZXIgd2lsbCBhbHdheXMgYmUgcHJvdmlkZWQuXG5cdFx0XHQvLyBQYXJzZSB0aGUgbWFya2Rvd24gdG8gZmluZCB0aGUgbGluZSBudW1iZXJcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fY3VycmVudENvbnRlbnQuc3BsaXQoJ1xcbicpLmZpbmRJbmRleChsaW5lID0+IGxpbmUuaW5jbHVkZXMobWFya2Rvd25Ub1BhcnNlLnNwbGl0KCdcXG4nKVswXSkgfHwgKHN5bWJvbC5maXJzdExpc3RJdGVtICYmIGxpbmUuaW5jbHVkZXMoc3ltYm9sLmZpcnN0TGlzdEl0ZW0pKSkgPz8gLTE7XG5cdFx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0XHRsaW5lTnVtYmVyID0gaW5kZXggKyAxO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAobGluZU51bWJlciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzSW5RdWlja1BpY2sgPSBmYWxzZTtcblx0XHR0aGlzLnNob3cocHJvdmlkZXIsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7IGxpbmVOdW1iZXIsIGNvbHVtbjogMSB9KTtcblx0XHR0aGlzLl91cGRhdGVDb250ZXh0S2V5cyhwcm92aWRlciwgdHJ1ZSk7XG5cdH1cblxuXHRkaXNhYmxlSGludCgpOiB2b2lkIHtcblx0XHRpZiAoIWlzSUFjY2Vzc2libGVWaWV3Q29udGVudFByb3ZpZGVyKHRoaXMuX2N1cnJlbnRQcm92aWRlcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUodGhpcy5fY3VycmVudFByb3ZpZGVyPy52ZXJib3NpdHlTZXR0aW5nS2V5LCBmYWxzZSk7XG5cdFx0YWxlcnQobG9jYWxpemUoJ2Rpc2FibGVBY2Nlc3NpYmlsaXR5SGVscCcsICd7MH0gYWNjZXNzaWJpbGl0eSB2ZXJib3NpdHkgaXMgbm93IGRpc2FibGVkJywgdGhpcy5fY3VycmVudFByb3ZpZGVyLnZlcmJvc2l0eVNldHRpbmdLZXkpKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNvbnRleHRLZXlzKHByb3ZpZGVyOiBBY2Nlc2libGVWaWV3Q29udGVudFByb3ZpZGVyLCBzaG93bjogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChwcm92aWRlci5vcHRpb25zLnR5cGUgPT09IEFjY2Vzc2libGVWaWV3VHlwZS5IZWxwKSB7XG5cdFx0XHR0aGlzLl9hY2Nlc3NpYmxpdHlIZWxwSXNTaG93bi5zZXQoc2hvd24pO1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXdJc1Nob3duLnJlc2V0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3SXNTaG93bi5zZXQoc2hvd24pO1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJsaXR5SGVscElzU2hvd24ucmVzZXQoKTtcblx0XHR9XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXdTdXBwb3J0c05hdmlnYXRpb24uc2V0KHByb3ZpZGVyLnByb3ZpZGVOZXh0Q29udGVudCAhPT0gdW5kZWZpbmVkIHx8IHByb3ZpZGVyLnByb3ZpZGVQcmV2aW91c0NvbnRlbnQgIT09IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXdWZXJib3NpdHlFbmFibGVkLnNldCh0aGlzLl92ZXJib3NpdHlFbmFibGVkKCkpO1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3R29Ub1N5bWJvbFN1cHBvcnRlZC5zZXQodGhpcy5fZ29Ub1N5bWJvbHNTdXBwb3J0ZWQoKSA/IHRoaXMuZ2V0U3ltYm9scygpPy5sZW5ndGghID4gMCA6IGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFN0YWJsZVVyaShwcm92aWRlcklkOiBzdHJpbmcpOiBVUkkge1xuXHRcdHJldHVybiBVUkkuZnJvbSh7IHBhdGg6IGBhY2Nlc3NpYmxlLXZpZXctJHtwcm92aWRlcklkfWAsIHNjaGVtZTogU2NoZW1hcy5hY2Nlc3NpYmxlVmlldyB9KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNvbnRlbnQocHJvdmlkZXI6IEFjY2VzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIsIHVwZGF0ZWRDb250ZW50Pzogc3RyaW5nKTogdm9pZCB7XG5cdFx0bGV0IGNvbnRlbnQgPSB1cGRhdGVkQ29udGVudCA/PyBwcm92aWRlci5wcm92aWRlQ29udGVudCgpO1xuXHRcdGlmIChwcm92aWRlci5vcHRpb25zLnR5cGUgPT09IEFjY2Vzc2libGVWaWV3VHlwZS5WaWV3KSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50Q29udGVudCA9IGNvbnRlbnQ7XG5cdFx0XHR0aGlzLl9oYXNVbmFzc2lnbmVkS2V5YmluZGluZ3MucmVzZXQoKTtcblx0XHRcdHRoaXMuX2hhc0Fzc2lnbmVkS2V5YmluZGluZ3MucmVzZXQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVhZE1vcmVMaW5rSGludCA9IHRoaXMuX3JlYWRNb3JlSGludChwcm92aWRlcik7XG5cdFx0Y29uc3QgZGlzYWJsZUhlbHBIaW50ID0gdGhpcy5fZGlzYWJsZVZlcmJvc2l0eUhpbnQocHJvdmlkZXIpO1xuXHRcdGNvbnN0IHNjcmVlblJlYWRlck1vZGVIaW50ID0gdGhpcy5fc2NyZWVuUmVhZGVyTW9kZUhpbnQocHJvdmlkZXIpO1xuXHRcdGNvbnN0IGV4aXRUaGlzRGlhbG9nSGludCA9IHRoaXMuX2V4aXREaWFsb2dIaW50KHByb3ZpZGVyKTtcblx0XHRsZXQgY29uZmlndXJlS2JIaW50ID0gJyc7XG5cdFx0bGV0IGNvbmZpZ3VyZUFzc2lnbmVkS2JIaW50ID0gJyc7XG5cdFx0Y29uc3QgcmVzb2x2ZWRDb250ZW50ID0gcmVzb2x2ZUNvbnRlbnRBbmRLZXliaW5kaW5nSXRlbXModGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsIHNjcmVlblJlYWRlck1vZGVIaW50ICsgY29udGVudCArIHJlYWRNb3JlTGlua0hpbnQgKyBkaXNhYmxlSGVscEhpbnQgKyBleGl0VGhpc0RpYWxvZ0hpbnQpO1xuXHRcdGlmIChyZXNvbHZlZENvbnRlbnQpIHtcblx0XHRcdGNvbnRlbnQgPSByZXNvbHZlZENvbnRlbnQuY29udGVudC52YWx1ZTtcblx0XHRcdGlmIChyZXNvbHZlZENvbnRlbnQuY29uZmlndXJlS2V5YmluZGluZ0l0ZW1zKSB7XG5cdFx0XHRcdHByb3ZpZGVyLm9wdGlvbnMuY29uZmlndXJlS2V5YmluZGluZ0l0ZW1zID0gcmVzb2x2ZWRDb250ZW50LmNvbmZpZ3VyZUtleWJpbmRpbmdJdGVtcztcblx0XHRcdFx0dGhpcy5faGFzVW5hc3NpZ25lZEtleWJpbmRpbmdzLnNldCh0cnVlKTtcblx0XHRcdFx0Y29uZmlndXJlS2JIaW50ID0gdGhpcy5fY29uZmlndXJlVW5hc3NpZ25lZEtiSGludCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5faGFzQXNzaWduZWRLZXliaW5kaW5ncy5yZXNldCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc29sdmVkQ29udGVudC5jb25maWd1cmVkS2V5YmluZGluZ0l0ZW1zKSB7XG5cdFx0XHRcdHByb3ZpZGVyLm9wdGlvbnMuY29uZmlndXJlZEtleWJpbmRpbmdJdGVtcyA9IHJlc29sdmVkQ29udGVudC5jb25maWd1cmVkS2V5YmluZGluZ0l0ZW1zO1xuXHRcdFx0XHR0aGlzLl9oYXNBc3NpZ25lZEtleWJpbmRpbmdzLnNldCh0cnVlKTtcblx0XHRcdFx0Y29uZmlndXJlQXNzaWduZWRLYkhpbnQgPSB0aGlzLl9jb25maWd1cmVBc3NpZ25lZEtiSGludCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5faGFzQXNzaWduZWRLZXliaW5kaW5ncy5yZXNldCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9jdXJyZW50Q29udGVudCA9IGNvbnRlbnQgKyBjb25maWd1cmVLYkhpbnQgKyBjb25maWd1cmVBc3NpZ25lZEtiSGludDtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlcihwcm92aWRlcjogQWNjZXNpYmxlVmlld0NvbnRlbnRQcm92aWRlciwgY29udGFpbmVyOiBIVE1MRWxlbWVudCwgc2hvd0FjY2Vzc2libGVWaWV3SGVscD86IGJvb2xlYW4sIHVwZGF0ZWRDb250ZW50Pzogc3RyaW5nKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGlzU2FtZVByb3ZpZGVyID0gdGhpcy5fY3VycmVudFByb3ZpZGVyPy5pZCA9PT0gcHJvdmlkZXIuaWQ7XG5cdFx0Y29uc3QgcHJldmlvdXNQb3NpdGlvbiA9IGlzU2FtZVByb3ZpZGVyID8gdGhpcy5fZWRpdG9yV2lkZ2V0LmdldFBvc2l0aW9uKCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcHJldmlvdXNTY3JvbGxUb3AgPSBpc1NhbWVQcm92aWRlciA/IHRoaXMuX2VkaXRvcldpZGdldC5nZXRTY3JvbGxUb3AoKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jdXJyZW50UHJvdmlkZXIgPSBwcm92aWRlcjtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkLnNldChwcm92aWRlci5pZCk7XG5cdFx0Y29uc3QgdmVyYm9zZSA9IHRoaXMuX3ZlcmJvc2l0eUVuYWJsZWQoKTtcblx0XHR0aGlzLl91cGRhdGVDb250ZW50KHByb3ZpZGVyLCB1cGRhdGVkQ29udGVudCk7XG5cdFx0dGhpcy5jYWxjdWxhdGVDb2RlQmxvY2tzKHRoaXMuX2N1cnJlbnRDb250ZW50KTtcblx0XHR0aGlzLl91cGRhdGVDb250ZXh0S2V5cyhwcm92aWRlciwgdHJ1ZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0SXNGb2N1c2VkID0gdGhpcy5fZWRpdG9yV2lkZ2V0Lmhhc1RleHRGb2N1cygpIHx8IHRoaXMuX2VkaXRvcldpZGdldC5oYXNXaWRnZXRGb2N1cygpO1xuXHRcdGNvbnN0IHN0YWJsZVVyaSA9IHRoaXMuX2dldFN0YWJsZVVyaShwcm92aWRlci5pZCk7XG5cdFx0dGhpcy5fZ2V0VGV4dE1vZGVsKHN0YWJsZVVyaSkudGhlbigobW9kZWwpID0+IHtcblx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVXBkYXRlIHRoZSBjb250ZW50IG9mIHRoZSBleGlzdGluZyBtb2RlbCBpbnN0ZWFkIG9mIGNyZWF0aW5nIGEgbmV3IG9uZVxuXHRcdFx0Ly8gVGhpcyBwcmVzZXJ2ZXMgdGhlIGN1cnNvciBwb3NpdGlvbiB3aGVuIGNvbnRlbnQgY2hhbmdlc1xuXHRcdFx0Y29uc3QgY3VycmVudENvbnRlbnQgPSB0aGlzLl9jdXJyZW50Q29udGVudCA/PyAnJztcblx0XHRcdGlmIChtb2RlbC5nZXRWYWx1ZSgpICE9PSBjdXJyZW50Q29udGVudCkge1xuXHRcdFx0XHRtb2RlbC5zZXRWYWx1ZShjdXJyZW50Q29udGVudCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fZWRpdG9yV2lkZ2V0LmdldE1vZGVsKCkgIT09IG1vZGVsKSB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvcldpZGdldC5zZXRNb2RlbChtb2RlbCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkb21Ob2RlID0gdGhpcy5fZWRpdG9yV2lkZ2V0LmdldERvbU5vZGUoKTtcblx0XHRcdGlmICghZG9tTm9kZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRtb2RlbC5zZXRMYW5ndWFnZShwcm92aWRlci5vcHRpb25zLmxhbmd1YWdlID8/ICdtYXJrZG93bicpO1xuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2NvbnRhaW5lcik7XG5cdFx0XHRsZXQgYWN0aW9uc0hpbnQgPSAnJztcblx0XHRcdGNvbnN0IGhhc0FjdGlvbnMgPSB0aGlzLl9hY2Nlc3NpYmxlVmlld1N1cHBvcnRzTmF2aWdhdGlvbi5nZXQoKSB8fCB0aGlzLl9hY2Nlc3NpYmxlVmlld1ZlcmJvc2l0eUVuYWJsZWQuZ2V0KCkgfHwgdGhpcy5fYWNjZXNzaWJsZVZpZXdHb1RvU3ltYm9sU3VwcG9ydGVkLmdldCgpIHx8IHByb3ZpZGVyLmFjdGlvbnM/Lmxlbmd0aDtcblx0XHRcdGlmICh2ZXJib3NlICYmICFzaG93QWNjZXNzaWJsZVZpZXdIZWxwICYmIGhhc0FjdGlvbnMpIHtcblx0XHRcdFx0YWN0aW9uc0hpbnQgPSBwcm92aWRlci5vcHRpb25zLnBvc2l0aW9uID8gbG9jYWxpemUoJ2FyaWFBY2Nlc3NpYmxlVmlld0FjdGlvbnNCb3R0b20nLCAnRXhwbG9yZSBhY3Rpb25zIHN1Y2ggYXMgZGlzYWJsaW5nIHRoaXMgaGludCAoU2hpZnQrVGFiKSwgdXNlIEVzY2FwZSB0byBleGl0IHRoaXMgZGlhbG9nLicpIDogbG9jYWxpemUoJ2FyaWFBY2Nlc3NpYmxlVmlld0FjdGlvbnMnLCAnRXhwbG9yZSBhY3Rpb25zIHN1Y2ggYXMgZGlzYWJsaW5nIHRoaXMgaGludCAoU2hpZnQrVGFiKS4nKTtcblx0XHRcdH1cblx0XHRcdGxldCBhcmlhTGFiZWwgPSBwcm92aWRlci5vcHRpb25zLnR5cGUgPT09IEFjY2Vzc2libGVWaWV3VHlwZS5IZWxwID8gbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHktaGVscCcsIFwiQWNjZXNzaWJpbGl0eSBIZWxwXCIpIDogbG9jYWxpemUoJ2FjY2Vzc2libGUtdmlldycsIFwiQWNjZXNzaWJsZSBWaWV3XCIpO1xuXHRcdFx0dGhpcy5fdGl0bGUudGV4dENvbnRlbnQgPSBhcmlhTGFiZWw7XG5cdFx0XHRpZiAoYWN0aW9uc0hpbnQgJiYgcHJvdmlkZXIub3B0aW9ucy50eXBlID09PSBBY2Nlc3NpYmxlVmlld1R5cGUuVmlldykge1xuXHRcdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnYWNjZXNzaWJsZS12aWV3LWhpbnQnLCBcIkFjY2Vzc2libGUgVmlldywgezB9XCIsIGFjdGlvbnNIaW50KTtcblx0XHRcdH0gZWxzZSBpZiAoYWN0aW9uc0hpbnQpIHtcblx0XHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHktaGVscC1oaW50JywgXCJBY2Nlc3NpYmlsaXR5IEhlbHAsIHswfVwiLCBhY3Rpb25zSGludCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNXaW5kb3dzICYmIHdpZGdldElzRm9jdXNlZCkge1xuXHRcdFx0XHQvLyBwcmV2ZW50IHRoZSBzY3JlZW4gcmVhZGVyIG9uIHdpbmRvd3MgZnJvbSByZWFkaW5nXG5cdFx0XHRcdC8vIHRoZSBhcmlhIGxhYmVsIGFnYWluIHdoZW4gaXQncyByZWZvY3VzZWRcblx0XHRcdFx0YXJpYUxhYmVsID0gJyc7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9lZGl0b3JXaWRnZXQudXBkYXRlT3B0aW9ucyh7IGFyaWFMYWJlbCB9KTtcblx0XHRcdHRoaXMuX2VkaXRvcldpZGdldC5mb2N1cygpO1xuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRQcm92aWRlcj8ub3B0aW9ucy5wb3NpdGlvbikge1xuXHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX2VkaXRvcldpZGdldC5nZXRQb3NpdGlvbigpO1xuXHRcdFx0XHRjb25zdCBpc0RlZmF1bHRQb3NpdGlvbiA9IHBvc2l0aW9uPy5saW5lTnVtYmVyID09PSAxICYmIHBvc2l0aW9uLmNvbHVtbiA9PT0gMTtcblx0XHRcdFx0Y29uc3QgbGluZUNvdW50ID0gdGhpcy5lZGl0b3JXaWRnZXQuZ2V0TW9kZWwoKT8uZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRcdGNvbnN0IHNhdmVkUG9zaXRpb24gPSB0aGlzLl9sYXN0UHJvdmlkZXJQb3NpdGlvbi5nZXQocHJvdmlkZXIuaWQpO1xuXHRcdFx0XHRjb25zdCBwcmVzZXJ2ZWRQb3NpdGlvbiA9IHRoaXMuX2N1cnJlbnRQcm92aWRlci5vcHRpb25zLnBvc2l0aW9uID09PSAnaW5pdGlhbC1ib3R0b20tcHJlc2VydmUnXG5cdFx0XHRcdFx0PyBwcmV2aW91c1Bvc2l0aW9uID8/IHNhdmVkUG9zaXRpb25cblx0XHRcdFx0XHQ6IHRoaXMuX2N1cnJlbnRQcm92aWRlci5vcHRpb25zLnBvc2l0aW9uID09PSAnaW5pdGlhbC1ib3R0b20nICYmICFpc1NhbWVQcm92aWRlciA/IHNhdmVkUG9zaXRpb24gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChwcmVzZXJ2ZWRQb3NpdGlvbiAmJiBwcmVzZXJ2ZWRQb3NpdGlvbi5saW5lTnVtYmVyIDw9IChsaW5lQ291bnQgPz8gMCkpIHtcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3JXaWRnZXQuc2V0UG9zaXRpb24ocHJlc2VydmVkUG9zaXRpb24pO1xuXHRcdFx0XHRcdC8vIFdoZW4gYWx3YXlzIHByZXNlcnZpbmcgdGhlIGN1cnNvciBwb3NpdGlvbiwga2VlcCB0aGUgY3VycmVudCBzY3JvbGxcblx0XHRcdFx0XHQvLyBwb3NpdGlvbiBvbiBjb250ZW50IHVwZGF0ZXMgaW5zdGVhZCBvZiByZXZlYWxpbmcgdGhlIGN1cnNvciwgd2hpY2hcblx0XHRcdFx0XHQvLyB3b3VsZCBjYXVzZSB0aGUgdmlldyB0byBqdW1wIHdoaWxlIHRoZSB1c2VyIGlzIHNjcm9sbGluZy5cblx0XHRcdFx0XHRpZiAodGhpcy5fY3VycmVudFByb3ZpZGVyLm9wdGlvbnMucG9zaXRpb24gPT09ICdpbml0aWFsLWJvdHRvbS1wcmVzZXJ2ZScgJiYgcHJldmlvdXNTY3JvbGxUb3AgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZWRpdG9yV2lkZ2V0LnNldFNjcm9sbFRvcChwcmV2aW91c1Njcm9sbFRvcCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvcldpZGdldC5yZXZlYWxMaW5lKHByZXNlcnZlZFBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9jdXJyZW50UHJvdmlkZXIub3B0aW9ucy5wb3NpdGlvbiA9PT0gJ2JvdHRvbScgfHwgdGhpcy5fY3VycmVudFByb3ZpZGVyLm9wdGlvbnMucG9zaXRpb24gPT09ICdpbml0aWFsLWJvdHRvbS1wcmVzZXJ2ZScgfHwgdGhpcy5fY3VycmVudFByb3ZpZGVyLm9wdGlvbnMucG9zaXRpb24gPT09ICdpbml0aWFsLWJvdHRvbScgJiYgaXNEZWZhdWx0UG9zaXRpb24pIHtcblx0XHRcdFx0XHRjb25zdCBsYXN0TGluZSA9IGxpbmVDb3VudDtcblx0XHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IGxhc3RMaW5lICE9PSB1bmRlZmluZWQgJiYgbGFzdExpbmUgPiAwID8gbmV3IFBvc2l0aW9uKGxhc3RMaW5lLCAxKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAocG9zaXRpb24pIHtcblx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvcldpZGdldC5zZXRQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRcdFx0XHR0aGlzLl9lZGl0b3JXaWRnZXQucmV2ZWFsTGluZShwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAocHJldmlvdXNQb3NpdGlvbikge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JXaWRnZXQuc2V0UG9zaXRpb24ocHJldmlvdXNQb3NpdGlvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBSZXN0b3JlIHRoZSBzYXZlZCBwb3NpdGlvbiBmb3IgdGhpcyBwcm92aWRlciBpZiBhdmFpbGFibGUgKGUuZy4sIGFmdGVyIGNsb3NlIGFuZCByZW9wZW4pXG5cdFx0XHRcdGNvbnN0IHNhdmVkUG9zaXRpb24gPSB0aGlzLl9sYXN0UHJvdmlkZXJQb3NpdGlvbi5nZXQocHJvdmlkZXIuaWQpO1xuXHRcdFx0XHRpZiAoc2F2ZWRQb3NpdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMuX2VkaXRvcldpZGdldC5nZXRNb2RlbCgpPy5nZXRMaW5lQ291bnQoKSA/PyAwO1xuXHRcdFx0XHRcdC8vIE9ubHkgcmVzdG9yZSBpZiB0aGUgc2F2ZWQgcG9zaXRpb24gaXMgc3RpbGwgdmFsaWQgd2l0aGluIHRoZSBjdXJyZW50IGNvbnRlbnRcblx0XHRcdFx0XHRpZiAoc2F2ZWRQb3NpdGlvbi5saW5lTnVtYmVyIDw9IGxpbmVDb3VudCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZWRpdG9yV2lkZ2V0LnNldFBvc2l0aW9uKHNhdmVkUG9zaXRpb24pO1xuXHRcdFx0XHRcdFx0dGhpcy5fZWRpdG9yV2lkZ2V0LnJldmVhbFBvc2l0aW9uKHNhdmVkUG9zaXRpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3VwZGF0ZVRvb2xiYXIodGhpcy5fY3VycmVudFByb3ZpZGVyLmFjdGlvbnMsIHByb3ZpZGVyLm9wdGlvbnMudHlwZSk7XG5cblx0XHRjb25zdCBoaWRlID0gKGU/OiBLZXlib2FyZEV2ZW50IHwgSUtleWJvYXJkRXZlbnQpOiB2b2lkID0+IHtcblx0XHRcdGNvbnN0IHRoaXNXaW5kb3dJc0ZvY3VzZWQgPSBnZXRXaW5kb3codGhpcy5fZWRpdG9yV2lkZ2V0LmdldERvbU5vZGUoKSkuZG9jdW1lbnQuaGFzRm9jdXMoKTtcblx0XHRcdGlmICghdGhpc1dpbmRvd0lzRm9jdXNlZCkge1xuXHRcdFx0XHQvLyBXaGVuIHN3aXRjaGluZyB3aW5kb3dzLCBrZWVwIGFjY2Vzc2libGUgdmlldyBvcGVuXG5cdFx0XHRcdGU/LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGU/LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX2lzSW5RdWlja1BpY2spIHtcblx0XHRcdFx0cHJvdmlkZXIub25DbG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0ZT8uc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UuaGlkZUNvbnRleHRWaWV3KCk7XG5cdFx0XHRpZiAodGhpcy5faXNJblF1aWNrUGljaykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl91cGRhdGVDb250ZXh0S2V5cyhwcm92aWRlciwgZmFsc2UpO1xuXHRcdFx0Ly8gU2F2ZSB0aGUgY3Vyc29yIHBvc2l0aW9uIGZvciB0aGlzIHByb3ZpZGVyIHNvIGl0IGNhbiBiZSByZXN0b3JlZCBvbiByZW9wZW5cblx0XHRcdGNvbnN0IGN1cnJlbnRQb3NpdGlvbiA9IHRoaXMuX2VkaXRvcldpZGdldC5nZXRQb3NpdGlvbigpO1xuXHRcdFx0aWYgKGN1cnJlbnRQb3NpdGlvbikge1xuXHRcdFx0XHR0aGlzLl9sYXN0UHJvdmlkZXJQb3NpdGlvbi5zZXQocHJvdmlkZXIuaWQsIGN1cnJlbnRQb3NpdGlvbik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sYXN0UHJvdmlkZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9jdXJyZW50Q29udGVudCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2N1cnJlbnRQcm92aWRlcj8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fY3VycmVudFByb3ZpZGVyID0gdW5kZWZpbmVkO1xuXHRcdH07XG5cdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fZWRpdG9yV2lkZ2V0Lm9uS2V5RG93bigoZSkgPT4ge1xuXHRcdFx0aWYgKGUua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlcikge1xuXHRcdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnZWRpdG9yLmFjdGlvbi5vcGVuTGluaycpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuRXNjYXBlIHx8IHNob3VsZEhpZGUoZS5icm93c2VyRXZlbnQsIHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSkpIHtcblx0XHRcdFx0aGlkZShlKTtcblx0XHRcdH0gZWxzZSBpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLktleUggJiYgcHJvdmlkZXIub3B0aW9ucy5yZWFkTW9yZVVybCkge1xuXHRcdFx0XHRjb25zdCB1cmw6IHN0cmluZyA9IHByb3ZpZGVyLm9wdGlvbnMucmVhZE1vcmVVcmw7XG5cdFx0XHRcdGFsZXJ0KEFjY2Vzc2liaWxpdHlIZWxwTkxTLm9wZW5pbmdEb2NzKTtcblx0XHRcdFx0dGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZSh1cmwpKTtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByb3ZpZGVyIGluc3RhbmNlb2YgQWNjZXNzaWJsZUNvbnRlbnRQcm92aWRlcikge1xuXHRcdFx0XHRwcm92aWRlci5vbktleURvd24/LihlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdG9vbGJhci5nZXRFbGVtZW50KCksIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGtleWJvYXJkRXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuRXNjYXBlKSkge1xuXHRcdFx0XHRoaWRlKGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2VkaXRvcldpZGdldC5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0aWYgKCFpc0FjdGl2ZUVsZW1lbnQodGhpcy5fdG9vbGJhci5nZXRFbGVtZW50KCkpKSB7XG5cdFx0XHRcdGhpZGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9lZGl0b3JXaWRnZXQub25EaWRDb250ZW50U2l6ZUNoYW5nZSgoKSA9PiB0aGlzLl9sYXlvdXQoKSkpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fbGF5b3V0U2VydmljZS5vbkRpZExheW91dEFjdGl2ZUNvbnRhaW5lcigoKSA9PiB0aGlzLl9sYXlvdXQoKSkpO1xuXHRcdHJldHVybiBkaXNwb3NhYmxlU3RvcmU7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUb29sYmFyKHByb3ZpZGVkQWN0aW9ucz86IElBY3Rpb25bXSwgdHlwZT86IEFjY2Vzc2libGVWaWV3VHlwZSk6IHZvaWQge1xuXHRcdHRoaXMuX3Rvb2xiYXIuc2V0QXJpYUxhYmVsKHR5cGUgPT09IEFjY2Vzc2libGVWaWV3VHlwZS5IZWxwID8gbG9jYWxpemUoJ2FjY2Vzc2libGVIZWxwVG9vbGJhcicsICdBY2Nlc3NpYmlsaXR5IEhlbHAnKSA6IGxvY2FsaXplKCdhY2Nlc3NpYmxlVmlld1Rvb2xiYXInLCBcIkFjY2Vzc2libGUgVmlld1wiKSk7XG5cdFx0Y29uc3QgdG9vbGJhck1lbnUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5BY2Nlc3NpYmxlVmlldywgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRjb25zdCBtZW51QWN0aW9ucyA9IGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zKHRvb2xiYXJNZW51LmdldEFjdGlvbnMoe30pKTtcblx0XHRpZiAocHJvdmlkZWRBY3Rpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVkQWN0aW9uIG9mIHByb3ZpZGVkQWN0aW9ucykge1xuXHRcdFx0XHRwcm92aWRlZEFjdGlvbi5jbGFzcyA9IHByb3ZpZGVkQWN0aW9uLmNsYXNzIHx8IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnByaW1pdGl2ZVNxdWFyZSk7XG5cdFx0XHRcdHByb3ZpZGVkQWN0aW9uLmNoZWNrZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl90b29sYmFyLnNldEFjdGlvbnMoWy4uLnByb3ZpZGVkQWN0aW9ucywgLi4ubWVudUFjdGlvbnNdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdG9vbGJhci5zZXRBY3Rpb25zKG1lbnVBY3Rpb25zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9sYXlvdXQoKTogdm9pZCB7XG5cdFx0Y29uc3QgZGltZW5zaW9uID0gdGhpcy5fbGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXJEaW1lbnNpb247XG5cdFx0Y29uc3QgbWF4SGVpZ2h0ID0gZGltZW5zaW9uLmhlaWdodCAmJiBkaW1lbnNpb24uaGVpZ2h0ICogRElNRU5TSU9OUy5NQVhfSEVJR0hUX1JBVElPO1xuXHRcdGNvbnN0IGhlaWdodCA9IE1hdGgubWluKG1heEhlaWdodCwgdGhpcy5fZWRpdG9yV2lkZ2V0LmdldENvbnRlbnRIZWlnaHQoKSk7XG5cdFx0Y29uc3Qgd2lkdGggPSBNYXRoLm1pbihkaW1lbnNpb24ud2lkdGggKiBESU1FTlNJT05TLldJRFRIX1JBVElPLCBESU1FTlNJT05TLk1BWF9XSURUSCk7XG5cdFx0dGhpcy5fZWRpdG9yV2lkZ2V0LmxheW91dCh7IHdpZHRoLCBoZWlnaHQgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRUZXh0TW9kZWwocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVRleHRNb2RlbCB8IG51bGw+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nICYmICFleGlzdGluZy5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0Ly8gQ3JlYXRlIGFuIGVtcHR5IG1vZGVsIC0gY29udGVudCB3aWxsIGJlIHNldCB2aWEgc2V0VmFsdWUoKSB0byBwcmVzZXJ2ZSBjdXJzb3IgcG9zaXRpb25cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCcnLCBudWxsLCByZXNvdXJjZSwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ29Ub1N5bWJvbHNTdXBwb3J0ZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50UHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRQcm92aWRlci5vcHRpb25zLnR5cGUgPT09IEFjY2Vzc2libGVWaWV3VHlwZS5IZWxwIHx8IHRoaXMuX2N1cnJlbnRQcm92aWRlci5vcHRpb25zLmxhbmd1YWdlID09PSAnbWFya2Rvd24nIHx8IHRoaXMuX2N1cnJlbnRQcm92aWRlci5vcHRpb25zLmxhbmd1YWdlID09PSB1bmRlZmluZWQgfHwgKHRoaXMuX2N1cnJlbnRQcm92aWRlciBpbnN0YW5jZW9mIEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIgJiYgISF0aGlzLl9jdXJyZW50UHJvdmlkZXIuZ2V0U3ltYm9scz8uKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTGFzdFByb3ZpZGVyKCk6IEFjY2VzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fY3VycmVudFByb3ZpZGVyO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFzdFByb3ZpZGVyID0gcHJvdmlkZXIgaW5zdGFuY2VvZiBBY2Nlc3NpYmxlQ29udGVudFByb3ZpZGVyID8gbmV3IEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIoXG5cdFx0XHRwcm92aWRlci5pZCxcblx0XHRcdHByb3ZpZGVyLm9wdGlvbnMsXG5cdFx0XHRwcm92aWRlci5wcm92aWRlQ29udGVudC5iaW5kKHByb3ZpZGVyKSxcblx0XHRcdHByb3ZpZGVyLm9uQ2xvc2UuYmluZChwcm92aWRlciksXG5cdFx0XHRwcm92aWRlci52ZXJib3NpdHlTZXR0aW5nS2V5LFxuXHRcdFx0cHJvdmlkZXIub25PcGVuPy5iaW5kKHByb3ZpZGVyKSxcblx0XHRcdHByb3ZpZGVyLmFjdGlvbnMsXG5cdFx0XHRwcm92aWRlci5wcm92aWRlTmV4dENvbnRlbnQ/LmJpbmQocHJvdmlkZXIpLFxuXHRcdFx0cHJvdmlkZXIucHJvdmlkZVByZXZpb3VzQ29udGVudD8uYmluZChwcm92aWRlciksXG5cdFx0XHRwcm92aWRlci5vbkRpZENoYW5nZUNvbnRlbnQ/LmJpbmQocHJvdmlkZXIpLFxuXHRcdFx0cHJvdmlkZXIub25LZXlEb3duPy5iaW5kKHByb3ZpZGVyKSxcblx0XHRcdHByb3ZpZGVyLmdldFN5bWJvbHM/LmJpbmQocHJvdmlkZXIpLFxuXHRcdCkgOiBuZXcgRXh0ZW5zaW9uQ29udGVudFByb3ZpZGVyKFxuXHRcdFx0cHJvdmlkZXIuaWQsXG5cdFx0XHRwcm92aWRlci5vcHRpb25zLFxuXHRcdFx0cHJvdmlkZXIucHJvdmlkZUNvbnRlbnQuYmluZChwcm92aWRlciksXG5cdFx0XHRwcm92aWRlci5vbkNsb3NlLmJpbmQocHJvdmlkZXIpLFxuXHRcdFx0cHJvdmlkZXIub25PcGVuPy5iaW5kKHByb3ZpZGVyKSxcblx0XHRcdHByb3ZpZGVyLnByb3ZpZGVOZXh0Q29udGVudD8uYmluZChwcm92aWRlciksXG5cdFx0XHRwcm92aWRlci5wcm92aWRlUHJldmlvdXNDb250ZW50Py5iaW5kKHByb3ZpZGVyKSxcblx0XHRcdHByb3ZpZGVyLmFjdGlvbnMsXG5cdFx0XHRwcm92aWRlci5vbkRpZENoYW5nZUNvbnRlbnQ/LmJpbmQocHJvdmlkZXIpLFxuXHRcdCk7XG5cdFx0cmV0dXJuIGxhc3RQcm92aWRlcjtcblx0fVxuXG5cdHB1YmxpYyBzaG93QWNjZXNzaWJsZVZpZXdIZWxwKCk6IHZvaWQge1xuXHRcdGNvbnN0IGxhc3RQcm92aWRlciA9IHRoaXMuX3VwZGF0ZUxhc3RQcm92aWRlcigpO1xuXHRcdGlmICghbGFzdFByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBhY2Nlc3NpYmxlVmlld0hlbHBQcm92aWRlcjtcblx0XHRpZiAobGFzdFByb3ZpZGVyIGluc3RhbmNlb2YgQWNjZXNzaWJsZUNvbnRlbnRQcm92aWRlcikge1xuXHRcdFx0YWNjZXNzaWJsZVZpZXdIZWxwUHJvdmlkZXIgPSBuZXcgQWNjZXNzaWJsZUNvbnRlbnRQcm92aWRlcihcblx0XHRcdFx0bGFzdFByb3ZpZGVyLmlkLFxuXHRcdFx0XHR7IHR5cGU6IEFjY2Vzc2libGVWaWV3VHlwZS5IZWxwIH0sXG5cdFx0XHRcdCgpID0+IGxhc3RQcm92aWRlci5vcHRpb25zLmN1c3RvbUhlbHAgPyBsYXN0UHJvdmlkZXI/Lm9wdGlvbnMuY3VzdG9tSGVscCgpIDogdGhpcy5fYWNjZXNzaWJsZVZpZXdIZWxwRGlhbG9nQ29udGVudCh0aGlzLl9nb1RvU3ltYm9sc1N1cHBvcnRlZCgpKSxcblx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2NvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcoKTtcblx0XHRcdFx0XHQvLyBIQUNLOiBEZWxheSB0byBhbGxvdyB0aGUgY29udGV4dCB2aWV3IHRvIGhpZGUgIzIwNzYzOFxuXHRcdFx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHRoaXMuc2hvdyhsYXN0UHJvdmlkZXIpKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0bGFzdFByb3ZpZGVyLnZlcmJvc2l0eVNldHRpbmdLZXlcblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjY2Vzc2libGVWaWV3SGVscFByb3ZpZGVyID0gbmV3IEV4dGVuc2lvbkNvbnRlbnRQcm92aWRlcihcblx0XHRcdFx0bGFzdFByb3ZpZGVyLmlkLFxuXHRcdFx0XHR7IHR5cGU6IEFjY2Vzc2libGVWaWV3VHlwZS5IZWxwIH0sXG5cdFx0XHRcdCgpID0+IGxhc3RQcm92aWRlci5vcHRpb25zLmN1c3RvbUhlbHAgPyBsYXN0UHJvdmlkZXI/Lm9wdGlvbnMuY3VzdG9tSGVscCgpIDogdGhpcy5fYWNjZXNzaWJsZVZpZXdIZWxwRGlhbG9nQ29udGVudCh0aGlzLl9nb1RvU3ltYm9sc1N1cHBvcnRlZCgpKSxcblx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2NvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcoKTtcblx0XHRcdFx0XHQvLyBIQUNLOiBEZWxheSB0byBhbGxvdyB0aGUgY29udGV4dCB2aWV3IHRvIGhpZGUgIzIwNzYzOFxuXHRcdFx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHRoaXMuc2hvdyhsYXN0UHJvdmlkZXIpKTtcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcoKTtcblx0XHQvLyBIQUNLOiBEZWxheSB0byBhbGxvdyB0aGUgY29udGV4dCB2aWV3IHRvIGhpZGUgIzE4NjUxNFxuXHRcdGlmIChhY2Nlc3NpYmxlVmlld0hlbHBQcm92aWRlcikge1xuXHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4gdGhpcy5zaG93KGFjY2Vzc2libGVWaWV3SGVscFByb3ZpZGVyLCB1bmRlZmluZWQsIHRydWUpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hY2Nlc3NpYmxlVmlld0hlbHBEaWFsb2dDb250ZW50KHByb3ZpZGVySGFzU3ltYm9scz86IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGNvbnN0IG5hdmlnYXRpb25IaW50ID0gdGhpcy5fbmF2aWdhdGlvbkhpbnQoKTtcblx0XHRjb25zdCBnb1RvU3ltYm9sSGludCA9IHRoaXMuX2dvVG9TeW1ib2xIaW50KHByb3ZpZGVySGFzU3ltYm9scyk7XG5cdFx0Y29uc3QgdG9vbGJhckhpbnQgPSBsb2NhbGl6ZSgndG9vbGJhcicsIFwiTmF2aWdhdGUgdG8gdGhlIHRvb2xiYXIgKFNoaWZ0K1RhYikuXCIpO1xuXHRcdGNvbnN0IGNoYXRIaW50cyA9IHRoaXMuX2dldENoYXRIaW50cygpO1xuXG5cdFx0bGV0IGhpbnQgPSBsb2NhbGl6ZSgnaW50cm8nLCBcIkluIHRoZSBhY2Nlc3NpYmxlIHZpZXcsIHlvdSBjYW46XFxuXCIpO1xuXHRcdGlmIChuYXZpZ2F0aW9uSGludCkge1xuXHRcdFx0aGludCArPSAnIC0gJyArIG5hdmlnYXRpb25IaW50ICsgJ1xcbic7XG5cdFx0fVxuXHRcdGlmIChnb1RvU3ltYm9sSGludCkge1xuXHRcdFx0aGludCArPSAnIC0gJyArIGdvVG9TeW1ib2xIaW50ICsgJ1xcbic7XG5cdFx0fVxuXHRcdGlmICh0b29sYmFySGludCkge1xuXHRcdFx0aGludCArPSAnIC0gJyArIHRvb2xiYXJIaW50ICsgJ1xcbic7XG5cdFx0fVxuXHRcdGlmIChjaGF0SGludHMpIHtcblx0XHRcdGhpbnQgKz0gY2hhdEhpbnRzO1xuXHRcdH1cblx0XHRyZXR1cm4gaGludDtcblx0fVxuXG5cdHByaXZhdGUgX2dldENoYXRIaW50cygpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9jdXJyZW50UHJvdmlkZXI/LmlkICE9PSBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuUGFuZWxDaGF0ICYmIHRoaXMuX2N1cnJlbnRQcm92aWRlcj8uaWQgIT09IEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZC5RdWlja0NoYXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIFtsb2NhbGl6ZSgnaW5zZXJ0QXRDdXJzb3InLCBcIiAtIEluc2VydCB0aGUgY29kZSBibG9jayBhdCB0aGUgY3Vyc29yezB9LlwiLCAnPGtleWJpbmRpbmc6d29ya2JlbmNoLmFjdGlvbi5jaGF0Lmluc2VydENvZGVCbG9jaz4nKSxcblx0XHRsb2NhbGl6ZSgnaW5zZXJ0SW50b05ld0ZpbGUnLCBcIiAtIEluc2VydCB0aGUgY29kZSBibG9jayBpbnRvIGEgbmV3IGZpbGV7MH0uXCIsICc8a2V5YmluZGluZzp3b3JrYmVuY2guYWN0aW9uLmNoYXQuaW5zZXJ0SW50b05ld0ZpbGU+JyksXG5cdFx0bG9jYWxpemUoJ3J1bkluVGVybWluYWwnLCBcIiAtIFJ1biB0aGUgY29kZSBibG9jayBpbiB0aGUgdGVybWluYWx7MH0uXFxuXCIsICc8a2V5YmluZGluZzp3b3JrYmVuY2guYWN0aW9uLmNoYXQucnVuSW5UZXJtaW5hbD4nKV0uam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIF9uYXZpZ2F0aW9uSGludCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnYWNjZXNzaWJsZVZpZXdOZXh0UHJldmlvdXNIaW50JywgXCJTaG93IHRoZSBuZXh0IGl0ZW17MH0gb3IgcHJldmlvdXMgaXRlbXsxfS5cIiwgYDxrZXliaW5kaW5nOiR7QWNjZXNzaWJpbGl0eUNvbW1hbmRJZC5TaG93TmV4dH0+YCwgYDxrZXliaW5kaW5nOiR7QWNjZXNzaWJpbGl0eUNvbW1hbmRJZC5TaG93UHJldmlvdXN9PmApO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzYWJsZVZlcmJvc2l0eUhpbnQocHJvdmlkZXI6IEFjY2VzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIpOiBzdHJpbmcge1xuXHRcdGlmIChwcm92aWRlci5vcHRpb25zLnR5cGUgPT09IEFjY2Vzc2libGVWaWV3VHlwZS5IZWxwICYmIHRoaXMuX3ZlcmJvc2l0eUVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhY2Vzc2libGVWaWV3RGlzYWJsZUhpbnQnLCBcIlxcbkRpc2FibGUgYWNjZXNzaWJpbGl0eSB2ZXJib3NpdHkgZm9yIHRoaXMgZmVhdHVyZXswfS5cIiwgYDxrZXliaW5kaW5nOiR7QWNjZXNzaWJpbGl0eUNvbW1hbmRJZC5EaXNhYmxlVmVyYm9zaXR5SGludH0+YCk7XG5cdFx0fVxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHByaXZhdGUgX2dvVG9TeW1ib2xIaW50KHByb3ZpZGVySGFzU3ltYm9scz86IGJvb2xlYW4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcHJvdmlkZXJIYXNTeW1ib2xzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiBsb2NhbGl6ZSgnZ29Ub1N5bWJvbEhpbnQnLCAnR28gdG8gYSBzeW1ib2x7MH0uJywgYDxrZXliaW5kaW5nOiR7QWNjZXNzaWJpbGl0eUNvbW1hbmRJZC5Hb1RvU3ltYm9sfT5gKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbmZpZ3VyZVVuYXNzaWduZWRLYkhpbnQoKTogc3RyaW5nIHtcblx0XHRjb25zdCBjb25maWd1cmVLYiA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoQWNjZXNzaWJpbGl0eUNvbW1hbmRJZC5BY2Nlc3NpYmlsaXR5SGVscENvbmZpZ3VyZUtleWJpbmRpbmdzKT8uZ2V0QXJpYUxhYmVsKCk7XG5cdFx0Y29uc3Qga2V5YmluZGluZ1RvQ29uZmlndXJlUXVpY2tQaWNrID0gY29uZmlndXJlS2IgPyAnKCcgKyBjb25maWd1cmVLYiArICcpJyA6ICdieSBhc3NpZ25pbmcgYSBrZXliaW5kaW5nIHRvIHRoZSBjb21tYW5kIEFjY2Vzc2liaWxpdHkgSGVscCBDb25maWd1cmUgVW5hc3NpZ25lZCBLZXliaW5kaW5ncy4nO1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnY29uZmlndXJlS2InLCAnXFxuQ29uZmlndXJlIGtleWJpbmRpbmdzIGZvciBjb21tYW5kcyB0aGF0IGxhY2sgdGhlbSB7MH0uJywga2V5YmluZGluZ1RvQ29uZmlndXJlUXVpY2tQaWNrKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbmZpZ3VyZUFzc2lnbmVkS2JIaW50KCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgY29uZmlndXJlS2IgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEFjY2Vzc2liaWxpdHlDb21tYW5kSWQuQWNjZXNzaWJpbGl0eUhlbHBDb25maWd1cmVBc3NpZ25lZEtleWJpbmRpbmdzKT8uZ2V0QXJpYUxhYmVsKCk7XG5cdFx0Y29uc3Qga2V5YmluZGluZ1RvQ29uZmlndXJlUXVpY2tQaWNrID0gY29uZmlndXJlS2IgPyAnKCcgKyBjb25maWd1cmVLYiArICcpJyA6ICdieSBhc3NpZ25pbmcgYSBrZXliaW5kaW5nIHRvIHRoZSBjb21tYW5kIEFjY2Vzc2liaWxpdHkgSGVscCBDb25maWd1cmUgQXNzaWduZWQgS2V5YmluZGluZ3MuJztcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2NvbmZpZ3VyZUtiQXNzaWduZWQnLCAnXFxuQ29uZmlndXJlIGtleWJpbmRpbmdzIGZvciBjb21tYW5kcyB0aGF0IGFscmVhZHkgaGF2ZSBhc3NpZ25tZW50cyB7MH0uJywga2V5YmluZGluZ1RvQ29uZmlndXJlUXVpY2tQaWNrKTtcblx0fVxuXG5cdHByaXZhdGUgX3NjcmVlblJlYWRlck1vZGVIaW50KHByb3ZpZGVyOiBBY2Nlc2libGVWaWV3Q29udGVudFByb3ZpZGVyKTogc3RyaW5nIHtcblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5U3VwcG9ydCA9IHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCk7XG5cdFx0bGV0IHNjcmVlblJlYWRlck1vZGVIaW50ID0gJyc7XG5cdFx0Y29uc3QgdHVybk9uTWVzc2FnZSA9IChcblx0XHRcdGlzTWFjaW50b3NoXG5cdFx0XHRcdD8gQWNjZXNzaWJpbGl0eUhlbHBOTFMuY2hhbmdlQ29uZmlnVG9Pbk1hY1xuXHRcdFx0XHQ6IEFjY2Vzc2liaWxpdHlIZWxwTkxTLmNoYW5nZUNvbmZpZ1RvT25XaW5MaW51eFxuXHRcdCk7XG5cdFx0aWYgKGFjY2Vzc2liaWxpdHlTdXBwb3J0ICYmIHByb3ZpZGVyLmlkID09PSBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuRWRpdG9yKSB7XG5cdFx0XHRzY3JlZW5SZWFkZXJNb2RlSGludCA9IEFjY2Vzc2liaWxpdHlIZWxwTkxTLmF1dG9fb247XG5cdFx0XHRzY3JlZW5SZWFkZXJNb2RlSGludCArPSAnXFxuJztcblx0XHR9IGVsc2UgaWYgKCFhY2Nlc3NpYmlsaXR5U3VwcG9ydCkge1xuXHRcdFx0c2NyZWVuUmVhZGVyTW9kZUhpbnQgPSBBY2Nlc3NpYmlsaXR5SGVscE5MUy5hdXRvX29mZiArICdcXG4nICsgdHVybk9uTWVzc2FnZTtcblx0XHRcdHNjcmVlblJlYWRlck1vZGVIaW50ICs9ICdcXG4nO1xuXHRcdH1cblx0XHRyZXR1cm4gc2NyZWVuUmVhZGVyTW9kZUhpbnQ7XG5cdH1cblxuXHRwcml2YXRlIF9leGl0RGlhbG9nSGludChwcm92aWRlcjogQWNjZXNpYmxlVmlld0NvbnRlbnRQcm92aWRlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZlcmJvc2l0eUVuYWJsZWQoKSAmJiAhcHJvdmlkZXIub3B0aW9ucy5wb3NpdGlvbiA/IGxvY2FsaXplKCdleGl0JywgJ1xcbkV4aXQgdGhpcyBkaWFsb2cgKEVzY2FwZSkuJykgOiAnJztcblx0fVxuXG5cdHByaXZhdGUgX3JlYWRNb3JlSGludChwcm92aWRlcjogQWNjZXNpYmxlVmlld0NvbnRlbnRQcm92aWRlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHByb3ZpZGVyLm9wdGlvbnMucmVhZE1vcmVVcmwgPyBsb2NhbGl6ZShcIm9wZW5Eb2NcIiwgXCJcXG5PcGVuIGEgYnJvd3NlciB3aW5kb3cgd2l0aCBtb3JlIGluZm9ybWF0aW9uIHJlbGF0ZWQgdG8gYWNjZXNzaWJpbGl0eXswfS5cIiwgYDxrZXliaW5kaW5nOiR7QWNjZXNzaWJpbGl0eUNvbW1hbmRJZC5BY2Nlc3NpYmlsaXR5SGVscE9wZW5IZWxwTGlua30+YCkgOiAnJztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBY2Nlc3NpYmxlVmlld1NlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWNjZXNzaWJsZVZpZXc6IEFjY2Vzc2libGVWaWV3IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRzaG93KHByb3ZpZGVyOiBBY2Nlc2libGVWaWV3Q29udGVudFByb3ZpZGVyLCBwb3NpdGlvbj86IFBvc2l0aW9uKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9hY2Nlc3NpYmxlVmlldykge1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXcgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY2Nlc3NpYmxlVmlldykpO1xuXHRcdH1cblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlldy5zaG93KHByb3ZpZGVyLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgcG9zaXRpb24pO1xuXHR9XG5cdGNvbmZpZ3VyZUtleWJpbmRpbmdzKHVuYXNzaWduZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlldz8uY29uZmlndXJlS2V5YmluZGluZ3ModW5hc3NpZ25lZCk7XG5cdH1cblx0b3BlbkhlbHBMaW5rKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3Py5vcGVuSGVscExpbmsoKTtcblx0fVxuXHRzaG93TGFzdFByb3ZpZGVyKGlkOiBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQpOiB2b2lkIHtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlldz8uc2hvd0xhc3RQcm92aWRlcihpZCk7XG5cdH1cblx0bmV4dCgpOiB2b2lkIHtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlldz8ubmV4dCgpO1xuXHR9XG5cdHByZXZpb3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3Py5wcmV2aW91cygpO1xuXHR9XG5cdGdvVG9TeW1ib2woKTogdm9pZCB7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXc/LmdvVG9TeW1ib2woKTtcblx0fVxuXHRnZXRPcGVuQXJpYUhpbnQodmVyYm9zaXR5U2V0dGluZ0tleTogQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUodmVyYm9zaXR5U2V0dGluZ0tleSkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhBY2Nlc3NpYmlsaXR5Q29tbWFuZElkLk9wZW5BY2Nlc3NpYmxlVmlldyk/LmdldEFyaWFMYWJlbCgpO1xuXHRcdGxldCBoaW50ID0gbnVsbDtcblx0XHRpZiAoa2V5YmluZGluZykge1xuXHRcdFx0aGludCA9IGxvY2FsaXplKCdhY2Vzc2libGVWaWV3SGludCcsIFwiSW5zcGVjdCB0aGlzIGluIHRoZSBhY2Nlc3NpYmxlIHZpZXcgd2l0aCB7MH1cIiwga2V5YmluZGluZyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGhpbnQgPSBsb2NhbGl6ZSgnYWNlc3NpYmxlVmlld0hpbnROb0tiRWl0aGVyJywgXCJJbnNwZWN0IHRoaXMgaW4gdGhlIGFjY2Vzc2libGUgdmlldyB2aWEgdGhlIGNvbW1hbmQgT3BlbiBBY2Nlc3NpYmxlIFZpZXcgd2hpY2ggaXMgY3VycmVudGx5IG5vdCB0cmlnZ2VyYWJsZSB2aWEga2V5YmluZGluZy5cIik7XG5cdFx0fVxuXHRcdHJldHVybiBoaW50O1xuXHR9XG5cdGRpc2FibGVIaW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3Py5kaXNhYmxlSGludCgpO1xuXHR9XG5cdHNob3dBY2Nlc3NpYmxlVmlld0hlbHAoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXc/LnNob3dBY2Nlc3NpYmxlVmlld0hlbHAoKTtcblx0fVxuXHRnZXRQb3NpdGlvbihpZDogQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkKTogUG9zaXRpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hY2Nlc3NpYmxlVmlldz8uZ2V0UG9zaXRpb24oaWQpID8/IHVuZGVmaW5lZDtcblx0fVxuXHRnZXRMYXN0UG9zaXRpb24oKTogUG9zaXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxhc3RMaW5lID0gdGhpcy5fYWNjZXNzaWJsZVZpZXc/LmVkaXRvcldpZGdldC5nZXRNb2RlbCgpPy5nZXRMaW5lQ291bnQoKTtcblx0XHRyZXR1cm4gbGFzdExpbmUgIT09IHVuZGVmaW5lZCAmJiBsYXN0TGluZSA+IDAgPyBuZXcgUG9zaXRpb24obGFzdExpbmUsIDEpIDogdW5kZWZpbmVkO1xuXHR9XG5cdHNldFBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbiwgcmV2ZWFsPzogYm9vbGVhbiwgc2VsZWN0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3Py5zZXRQb3NpdGlvbihwb3NpdGlvbiwgcmV2ZWFsLCBzZWxlY3QpO1xuXHR9XG5cdGdldENvZGVCbG9ja0NvbnRleHQoKTogSUNvZGVCbG9ja0FjdGlvbkNvbnRleHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hY2Nlc3NpYmxlVmlldz8uZ2V0Q29kZUJsb2NrQ29udGV4dCgpO1xuXHR9XG5cdG5hdmlnYXRlVG9Db2RlQmxvY2sodHlwZTogJ25leHQnIHwgJ3ByZXZpb3VzJyk6IHZvaWQge1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3Py5uYXZpZ2F0ZVRvQ29kZUJsb2NrKHR5cGUpO1xuXHR9XG59XG5cbmNsYXNzIEFjY2Vzc2libGVWaWV3U3ltYm9sUXVpY2tQaWNrIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSBfYWNjZXNzaWJsZVZpZXc6IEFjY2Vzc2libGVWaWV3LCBASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UpIHtcblxuXHR9XG5cdHNob3cocHJvdmlkZXI6IEFjY2VzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIpOiB2b2lkIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBxdWlja1BpY2sgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElBY2Nlc3NpYmxlVmlld1N5bWJvbD4oKSk7XG5cdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2FjY2Vzc2libGVWaWV3U3ltYm9sUXVpY2tQaWNrUGxhY2Vob2xkZXInLCBcIlR5cGUgdG8gc2VhcmNoIHN5bWJvbHNcIik7XG5cdFx0cXVpY2tQaWNrLnRpdGxlID0gbG9jYWxpemUoJ2FjY2Vzc2libGVWaWV3U3ltYm9sUXVpY2tQaWNrVGl0bGUnLCBcIkdvIHRvIFN5bWJvbCBBY2Nlc3NpYmxlIFZpZXdcIik7XG5cdFx0Y29uc3QgcGlja3MgPSBbXTtcblx0XHRjb25zdCBzeW1ib2xzID0gdGhpcy5fYWNjZXNzaWJsZVZpZXcuZ2V0U3ltYm9scygpO1xuXHRcdGlmICghc3ltYm9scykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHN5bWJvbCBvZiBzeW1ib2xzKSB7XG5cdFx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IHN5bWJvbC5sYWJlbCxcblx0XHRcdFx0YXJpYUxhYmVsOiBzeW1ib2wuYXJpYUxhYmVsLFxuXHRcdFx0XHRmaXJzdExpc3RJdGVtOiBzeW1ib2wuZmlyc3RMaXN0SXRlbSxcblx0XHRcdFx0bGluZU51bWJlcjogc3ltYm9sLmxpbmVOdW1iZXIsXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IHN5bWJvbC5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRtYXJrZG93blRvUGFyc2U6IHN5bWJvbC5tYXJrZG93blRvUGFyc2Vcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRxdWlja1BpY2suY2FuU2VsZWN0TWFueSA9IGZhbHNlO1xuXHRcdHF1aWNrUGljay5pdGVtcyA9IHBpY2tzO1xuXHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlldy5zaG93U3ltYm9sKHByb3ZpZGVyLCBxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXSk7XG5cdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRpZiAocXVpY2tQaWNrLnNlbGVjdGVkSXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdC8vIHRoaXMgd2FzIGVzY2FwZWQsIHNvIHJlZm9jdXMgdGhlIGFjY2Vzc2libGUgdmlld1xuXHRcdFx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlldy5zaG93KHByb3ZpZGVyKTtcblx0XHRcdH1cblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cdH1cbn1cblxuXG5mdW5jdGlvbiBzaG91bGRIaWRlKGV2ZW50OiBLZXlib2FyZEV2ZW50LCBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogYm9vbGVhbiB7XG5cdGlmICghY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZC5BY2Nlc3NpYmxlVmlld0Nsb3NlT25LZXlQcmVzcykpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3Qgc3RhbmRhcmRLZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChldmVudCk7XG5cdGNvbnN0IHJlc29sdmVSZXN1bHQgPSBrZXliaW5kaW5nU2VydmljZS5zb2Z0RGlzcGF0Y2goc3RhbmRhcmRLZXlib2FyZEV2ZW50LCBzdGFuZGFyZEtleWJvYXJkRXZlbnQudGFyZ2V0KTtcblxuXHRjb25zdCBpc1ZhbGlkQ2hvcmQgPSByZXNvbHZlUmVzdWx0LmtpbmQgPT09IFJlc3VsdEtpbmQuTW9yZUNob3Jkc05lZWRlZDtcblx0aWYgKGtleWJpbmRpbmdTZXJ2aWNlLmluQ2hvcmRNb2RlIHx8IGlzVmFsaWRDaG9yZCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gc2hvdWxkSGFuZGxlS2V5KGV2ZW50KSAmJiAhZXZlbnQuY3RybEtleSAmJiAhZXZlbnQuYWx0S2V5ICYmICFldmVudC5tZXRhS2V5ICYmICFldmVudC5zaGlmdEtleTtcbn1cblxuZnVuY3Rpb24gc2hvdWxkSGFuZGxlS2V5KGV2ZW50OiBLZXlib2FyZEV2ZW50KTogYm9vbGVhbiB7XG5cdHJldHVybiAhIWV2ZW50LmNvZGUubWF0Y2goL14oS2V5W0EtWl18RGlnaXRbMC05XXxFcXVhbHxDb21tYXxQZXJpb2R8U2xhc2h8UXVvdGV8QmFja3F1b3RlfEJhY2tzbGFzaHxNaW51c3xTZW1pY29sb258U3BhY2V8RW50ZXIpJC8pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFdBQVcsdUJBQXVCLGlCQUFpQixXQUFXLHVCQUF1QjtBQUM5RixTQUF5Qiw2QkFBNkI7QUFDdEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxhQUFhO0FBRXRCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxZQUFZLFlBQVk7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYSxpQkFBaUI7QUFDdkMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBRXBCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsd0JBQWtEO0FBQzNELFNBQW9CLGdCQUFnQjtBQUVwQyxTQUFTLHFCQUFxQjtBQUU5QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDZC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
