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
import "./media/codeBlockPart.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { renderFormattedText } from "../../../../../../base/browser/formattedTextRenderer.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event } from "../../../../../../base/common/event.js";
import { combinedDisposable, Disposable, MutableDisposable, thenRegisterOrDispose } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { assertType } from "../../../../../../base/common/types.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { EditorExtensionsRegistry } from "../../../../../../editor/browser/editorExtensions.js";
import { ICodeEditorService } from "../../../../../../editor/browser/services/codeEditorService.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { DiffEditorWidget } from "../../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js";
import { EditorOption } from "../../../../../../editor/common/config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../../../../../../editor/common/config/fontInfo.js";
import { EndOfLinePreference } from "../../../../../../editor/common/model.js";
import { TextEdit } from "../../../../../../editor/common/languages.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../../../editor/common/languages/modesRegistry.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { TextModelText } from "../../../../../../editor/common/model/textModelText.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { DefaultModelSHA1Computer } from "../../../../../../editor/common/services/modelService.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { BracketMatchingController } from "../../../../../../editor/contrib/bracketMatching/browser/bracketMatching.js";
import { ColorDetector } from "../../../../../../editor/contrib/colorPicker/browser/colorDetector.js";
import { ContextMenuController } from "../../../../../../editor/contrib/contextmenu/browser/contextmenu.js";
import { GotoDefinitionAtPositionEditorContribution } from "../../../../../../editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js";
import { ContentHoverController } from "../../../../../../editor/contrib/hover/browser/contentHoverController.js";
import { GlyphHoverController } from "../../../../../../editor/contrib/hover/browser/glyphHoverController.js";
import { LinkDetector } from "../../../../../../editor/contrib/links/browser/links.js";
import { MessageController } from "../../../../../../editor/contrib/message/browser/messageController.js";
import { ViewportSemanticTokensContribution } from "../../../../../../editor/contrib/semanticTokens/browser/viewportSemanticTokens.js";
import { SmartSelectController } from "../../../../../../editor/contrib/smartSelect/browser/smartSelect.js";
import { WordHighlighterContribution } from "../../../../../../editor/contrib/wordHighlighter/browser/wordHighlighter.js";
import { localize } from "../../../../../../nls.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { FileKind } from "../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { ResourceLabel } from "../../../../../browser/labels.js";
import { StaticResourceContextKey } from "../../../../../common/contextkeys.js";
import { AccessibilityVerbositySettingId } from "../../../../accessibility/browser/accessibilityConfiguration.js";
import { InspectEditorTokensController } from "../../../../codeEditor/browser/inspectEditorTokens/inspectEditorTokens.js";
import { MenuPreventer } from "../../../../codeEditor/browser/menuPreventer.js";
import { SelectionClipboardContributionID } from "../../../../codeEditor/browser/selectionClipboard.js";
import { getSimpleEditorOptions } from "../../../../codeEditor/browser/simpleEditorOptions.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { isRequestVM, isResponseVM } from "../../../common/model/chatViewModel.js";
import { emptyProgressRunner, IEditorProgressService } from "../../../../../../platform/progress/common/progress.js";
import { SuggestController } from "../../../../../../editor/contrib/suggest/browser/suggestController.js";
import { SnippetController2 } from "../../../../../../editor/contrib/snippet/browser/snippetController2.js";
import { EditorContextKeys } from "../../../../../../editor/common/editorContextKeys.js";
const $ = dom.$;
const defaultCodeblockPadding = 10;
const defaultChatScrollbarSize = 7;
let CodeBlockPart = class extends Disposable {
  constructor(editorOptions, menuId, delegate, overflowWidgetsDomNode, isSimpleWidget = false, instantiationService, contextKeyService, modelService, languageService, configurationService, accessibilityService, logService, textModelService) {
    super();
    this.editorOptions = editorOptions;
    this.menuId = menuId;
    this.isSimpleWidget = isSimpleWidget;
    this.modelService = modelService;
    this.languageService = languageService;
    this.configurationService = configurationService;
    this.accessibilityService = accessibilityService;
    this.logService = logService;
    this.textModelService = textModelService;
    this.currentScrollWidth = 0;
    this._isHovered = false;
    this._isDropdownVisible = false;
    this.isDisposed = false;
    this.element = $(".interactive-result-code-block");
    this.resourceContextKey = instantiationService.createInstance(StaticResourceContextKey);
    this.contextKeyService = this._register(contextKeyService.createScoped(this.element));
    const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService])));
    const editorElement = dom.append(this.element, $(".interactive-result-editor"));
    this.editor = this.createEditor(scopedInstantiationService, editorElement, {
      ...getSimpleEditorOptions(this.configurationService),
      readOnly: true,
      lineNumbers: "off",
      selectOnLineNumbers: true,
      scrollBeyondLastLine: false,
      lineDecorationsWidth: 8,
      dragAndDrop: false,
      padding: { top: this.verticalPadding, bottom: this.verticalPadding },
      mouseWheelZoom: false,
      scrollbar: {
        vertical: "hidden",
        alwaysConsumeMouseWheel: false
      },
      definitionLinkOpensInPeek: false,
      gotoLocation: {
        multiple: "goto",
        multipleDeclarations: "goto",
        multipleDefinitions: "goto",
        multipleImplementations: "goto"
      },
      ariaLabel: localize("chat.codeBlockHelp", "Code block"),
      overflowWidgetsDomNode,
      tabFocusMode: true,
      ...this.getEditorOptionsFromConfig()
    });
    const toolbarElement = dom.append(this.element, $(".interactive-result-code-block-toolbar"));
    this._toolbarElement = toolbarElement;
    const editorScopedService = this._register(this.editor.contextKeyService.createScoped(toolbarElement));
    const editorScopedInstantiationService = this._register(scopedInstantiationService.createChild(new ServiceCollection([IContextKeyService, editorScopedService])));
    this._toolbarFactory = () => editorScopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarElement, menuId, {
      menuOptions: {
        shouldForwardArgs: true
      }
    });
    const vulnsContainer = dom.append(this.element, $(".interactive-result-vulns"));
    const vulnsHeaderElement = dom.append(vulnsContainer, $(".interactive-result-vulns-header", void 0));
    this.vulnsButton = this._register(new Button(vulnsHeaderElement, {
      buttonBackground: void 0,
      buttonBorder: void 0,
      buttonForeground: void 0,
      buttonHoverBackground: void 0,
      buttonSecondaryBackground: void 0,
      buttonSecondaryForeground: void 0,
      buttonSecondaryHoverBackground: void 0,
      buttonSeparator: void 0,
      supportIcons: true
    }));
    this.vulnsListElement = dom.append(vulnsContainer, $("ul.interactive-result-vulns-list"));
    this._register(this.vulnsButton.onDidClick(() => {
      const element = this.currentCodeBlockData.element;
      element.vulnerabilitiesListExpanded = !element.vulnerabilitiesListExpanded;
      this.vulnsButton.label = this.getVulnerabilitiesLabel();
      this.element.classList.toggle("chat-vulnerabilities-collapsed", !element.vulnerabilitiesListExpanded);
      this.layout();
    }));
    this._isHovered = false;
    this._register(dom.addDisposableListener(this.element, "mouseenter", () => {
      this._isHovered = true;
      toolbarElement.classList.add("force-visibility");
      this._ensureToolbar();
    }));
    this._register(dom.addDisposableListener(this.element, "mouseleave", () => {
      this._isHovered = false;
      if (!this._isDropdownVisible) {
        toolbarElement.classList.remove("force-visibility");
      }
    }));
    this._configureForScreenReader();
    this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this._configureForScreenReader()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectedKeys.has(AccessibilityVerbositySettingId.Chat)) {
        this._configureForScreenReader();
      }
    }));
    this._register(this.editorOptions.onDidChange(() => {
      this.editor.updateOptions(this.getEditorOptionsFromConfig());
    }));
    this._register(this.editor.onDidScrollChange((e) => {
      this.currentScrollWidth = e.scrollWidth;
    }));
    this._register(this.editor.onDidContentSizeChange((e) => {
      if (e.contentHeightChanged) {
        this.layout();
      }
    }));
    this._register(this.editor.onDidBlurEditorWidget(() => {
      this.element.classList.remove("focused");
      WordHighlighterContribution.get(this.editor)?.stopHighlighting();
      this.clearWidgets();
    }));
    this._register(this.editor.onDidFocusEditorWidget(() => {
      this.element.classList.add("focused");
      this._ensureToolbar();
      WordHighlighterContribution.get(this.editor)?.restoreViewState(true);
    }));
    this._register(Event.any(
      this.editor.onDidChangeModel,
      this.editor.onDidChangeModelContent
    )(() => {
      if (this.currentCodeBlockData) {
        this.updateContexts(this.currentCodeBlockData);
      }
    }));
    if (delegate.onDidScroll) {
      this._register(delegate.onDidScroll((e) => {
        this.clearWidgets();
      }));
    }
    this._textModel = this._register(this.modelService.createModel(
      "",
      null,
      URI.from({ scheme: Schemas.vscodeChatCodeBlock, path: generateUuid() }),
      this.isSimpleWidget
    ));
    thenRegisterOrDispose(this.textModelService.createModelReference(this._textModel.uri), this._store);
    this.editor.setModel(this._textModel);
  }
  /**
   * Compute a pool reuse key for a code block. When the same key is used
   * across render cycles the pool will try to return the same CodeBlockPart,
   * which lets the setText append-optimisation avoid a full model reset.
   */
  static poolKey(elementId, codeBlockIndex) {
    return `${elementId}/${codeBlockIndex}`;
  }
  get verticalPadding() {
    return this.currentCodeBlockData?.renderOptions?.verticalPadding ?? defaultCodeblockPadding;
  }
  dispose() {
    this.isDisposed = true;
    super.dispose();
  }
  get uri() {
    return this.editor.getModel()?.uri;
  }
  createEditor(instantiationService, parent, options) {
    return this._register(instantiationService.createInstance(CodeEditorWidget, parent, options, {
      isSimpleWidget: this.isSimpleWidget,
      contributions: EditorExtensionsRegistry.getSomeEditorContributions([
        MenuPreventer.ID,
        SelectionClipboardContributionID,
        ContextMenuController.ID,
        WordHighlighterContribution.ID,
        ViewportSemanticTokensContribution.ID,
        BracketMatchingController.ID,
        SmartSelectController.ID,
        ContentHoverController.ID,
        GlyphHoverController.ID,
        MessageController.ID,
        GotoDefinitionAtPositionEditorContribution.ID,
        SuggestController.ID,
        SnippetController2.ID,
        ColorDetector.ID,
        LinkDetector.ID,
        InspectEditorTokensController.ID
      ])
    }));
  }
  focus() {
    this.editor.focus();
  }
  updatePaddingForLayout() {
    const horizontalScrollbarVisible = this.currentScrollWidth > this.editor.getLayoutInfo().contentWidth;
    const scrollbarHeight = this.editor.getLayoutInfo().horizontalScrollbarHeight;
    const bottomPadding = horizontalScrollbarVisible ? Math.max(this.verticalPadding - scrollbarHeight, 2) : this.verticalPadding;
    this.editor.updateOptions({ padding: { top: this.verticalPadding, bottom: bottomPadding } });
  }
  _ensureToolbar() {
    if (this.isDisposed) {
      return void 0;
    }
    if (this.currentCodeBlockData?.renderOptions?.hideToolbar) {
      return void 0;
    }
    if (!this.toolbar) {
      const factory = this._toolbarFactory;
      if (!factory) {
        return void 0;
      }
      this._toolbarFactory = void 0;
      const toolbar = this._register(factory());
      this.toolbar = toolbar;
      this._register(toolbar.onDidChangeDropdownVisibility((e) => {
        this._isDropdownVisible = e;
        this._toolbarElement.classList.toggle("force-visibility", e || this._isHovered);
      }));
      if (this._pendingToolbarAriaLabel !== void 0) {
        toolbar.setAriaLabel(this._pendingToolbarAriaLabel);
        this._pendingToolbarAriaLabel = void 0;
      }
      if (this._pendingToolbarContext !== void 0) {
        toolbar.context = this._pendingToolbarContext;
        this._pendingToolbarContext = void 0;
      }
    }
    return this.toolbar;
  }
  _configureForScreenReader() {
    const hideToolbar = !!this.currentCodeBlockData?.renderOptions?.hideToolbar;
    if (this.accessibilityService.isScreenReaderOptimized()) {
      if (hideToolbar) {
        dom.hide(this._toolbarElement);
      } else {
        this._toolbarElement.style.display = "block";
        if (this.currentCodeBlockData) {
          this._ensureToolbar();
        }
      }
    } else if (hideToolbar) {
      dom.hide(this._toolbarElement);
    } else {
      this._toolbarElement.style.display = "";
    }
  }
  getEditorOptionsFromConfig() {
    const renderOptions = this.currentCodeBlockData?.renderOptions;
    const scrollbar = renderOptions?.maxHeightInLines ? { vertical: "auto", verticalScrollbarSize: defaultChatScrollbarSize, ...renderOptions?.editorOptions?.scrollbar } : void 0;
    return {
      wordWrap: this.editorOptions.configuration.resultEditor.wordWrap,
      fontLigatures: this.editorOptions.configuration.resultEditor.fontLigatures,
      bracketPairColorization: this.editorOptions.configuration.resultEditor.bracketPairColorization,
      fontFamily: this.editorOptions.configuration.resultEditor.fontFamily === "default" ? EDITOR_FONT_DEFAULTS.fontFamily : this.editorOptions.configuration.resultEditor.fontFamily,
      fontSize: this.editorOptions.configuration.resultEditor.fontSize,
      fontWeight: this.editorOptions.configuration.resultEditor.fontWeight,
      lineHeight: this.editorOptions.configuration.resultEditor.lineHeight,
      ...renderOptions?.editorOptions,
      ...scrollbar ? { scrollbar } : {}
    };
  }
  layout(width = this.lastLayoutWidth) {
    if (width === void 0) {
      return;
    }
    this.lastLayoutWidth = width;
    const contentHeight = this.getContentHeight();
    let height = contentHeight;
    if (this.currentCodeBlockData?.renderOptions?.maxHeightInLines) {
      height = Math.min(contentHeight, this.editor.getOption(EditorOption.lineHeight) * this.currentCodeBlockData?.renderOptions?.maxHeightInLines);
    }
    const editorBorder = 2;
    width = width - editorBorder - (this.currentCodeBlockData?.renderOptions?.reserveWidth ?? 0);
    this.editor.layout(
      { width: isRequestVM(this.currentCodeBlockData?.element) ? width * 0.9 : width, height },
      /* postponeRendering */
      true
    );
    this.updatePaddingForLayout();
  }
  getContentHeight() {
    return this.editor.getContentHeight();
  }
  render(data, width) {
    this.currentCodeBlockData = data;
    if (data.parentContextKeyService) {
      this.contextKeyService.updateParent(data.parentContextKeyService);
    }
    if (this.getEditorOptionsFromConfig().wordWrap === "on") {
      this.layout(width);
    }
    const didUpdate = this.updateEditor(data);
    if (!didUpdate || this.isDisposed || this.currentCodeBlockData !== data) {
      return;
    }
    this.editor.updateOptions({
      ...this.getEditorOptionsFromConfig()
    });
    if (!this.editor.getOption(EditorOption.ariaLabel)) {
      this.editor.updateOptions({
        ariaLabel: localize("chat.codeBlockLabel", "Code block {0}", data.codeBlockIndex + 1)
      });
    }
    this.layout(width);
    const toolbarAriaLabel = localize("chat.codeBlockToolbarLabel", "Code block {0}", data.codeBlockIndex + 1);
    if (this.toolbar) {
      this.toolbar.setAriaLabel(toolbarAriaLabel);
    } else {
      this._pendingToolbarAriaLabel = toolbarAriaLabel;
    }
    if (data.renderOptions?.hideToolbar) {
      dom.hide(this._toolbarElement);
    } else {
      dom.show(this._toolbarElement);
      if (this.accessibilityService.isScreenReaderOptimized()) {
        this._ensureToolbar();
      }
    }
    if (data.vulns?.length && isResponseVM(data.element)) {
      dom.clearNode(this.vulnsListElement);
      this.element.classList.remove("no-vulns");
      this.element.classList.toggle("chat-vulnerabilities-collapsed", !data.element.vulnerabilitiesListExpanded);
      dom.append(this.vulnsListElement, ...data.vulns.map((v) => $("li", void 0, $("span.chat-vuln-title", void 0, v.title), " " + v.description)));
      this.vulnsButton.label = this.getVulnerabilitiesLabel();
    } else {
      this.element.classList.add("no-vulns");
    }
    if (this._isHovered) {
      this._toolbarElement.classList.add("force-visibility");
    }
    this.layout();
    this.editor.renderAsync(true);
  }
  reset() {
    this.clearWidgets();
    this.currentCodeBlockData = void 0;
  }
  onDidRemount() {
    if (this.currentCodeBlockData) {
      this.editor.renderAsync(true);
    }
  }
  clearWidgets() {
    ContentHoverController.get(this.editor)?.hideContentHover();
    GlyphHoverController.get(this.editor)?.hideGlyphHover();
  }
  updateEditor(data) {
    if (this.isDisposed || this.currentCodeBlockData !== data) {
      return false;
    }
    this.setText(data.text);
    this.setLanguage(data.languageId);
    this.updateContexts(data);
    return true;
  }
  getVulnerabilitiesLabel() {
    if (!this.currentCodeBlockData || !this.currentCodeBlockData.vulns) {
      return "";
    }
    const referencesLabel = this.currentCodeBlockData.vulns.length > 1 ? localize("vulnerabilitiesPlural", "{0} vulnerabilities", this.currentCodeBlockData.vulns.length) : localize("vulnerabilitiesSingular", "{0} vulnerability", 1);
    const icon = (element) => element.vulnerabilitiesListExpanded ? Codicon.chevronDown : Codicon.chevronRight;
    return `${referencesLabel} $(${icon(this.currentCodeBlockData.element).id})`;
  }
  updateContexts(data) {
    const textModel = this.editor.getModel();
    if (!textModel) {
      return;
    }
    const context = {
      code: textModel.getTextBuffer().getValueInRange(textModel.getFullModelRange(), EndOfLinePreference.TextDefined),
      codeBlockIndex: data.codeBlockIndex,
      element: data.element,
      languageId: textModel.getLanguageId(),
      codemapperUri: data.codemapperUri,
      chatSessionResource: data.chatSessionResource
    };
    if (this.toolbar) {
      this.toolbar.context = context;
    } else {
      this._pendingToolbarContext = context;
    }
    this.resourceContextKey.set(textModel.uri);
  }
  setText(newText) {
    const currentText = this._textModel.getValue(EndOfLinePreference.LF);
    if (newText === currentText) {
      return;
    }
    if (newText.startsWith(currentText)) {
      const text = newText.slice(currentText.length);
      const lastLine = this._textModel.getLineCount();
      const lastCol = this._textModel.getLineMaxColumn(lastLine);
      this._textModel.applyEdits([{ range: new Range(lastLine, lastCol, lastLine, lastCol), text }]);
    } else {
      this.logService.trace("[CodeBlockPart] setText could not optimize, falling back to setValue");
      this._textModel.setValue(newText);
    }
  }
  setLanguage(languageId) {
    const vscodeLanguageId = this.languageService.getLanguageIdByLanguageName(languageId);
    if (vscodeLanguageId && vscodeLanguageId !== this._textModel.getLanguageId()) {
      this._textModel.setLanguage(vscodeLanguageId);
    } else if (!vscodeLanguageId && this._textModel.getLanguageId() !== PLAINTEXT_LANGUAGE_ID) {
      this._textModel.setLanguage(PLAINTEXT_LANGUAGE_ID);
    }
  }
};
CodeBlockPart = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IModelService),
  __decorateParam(8, ILanguageService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IAccessibilityService),
  __decorateParam(11, ILogService),
  __decorateParam(12, ITextModelService)
], CodeBlockPart);
let ChatCodeBlockContentProvider = class extends Disposable {
  constructor(textModelService, _modelService) {
    super();
    this._modelService = _modelService;
    this._register(textModelService.registerTextModelContentProvider(Schemas.vscodeChatCodeBlock, {
      provideTextContent: (resource) => {
        return Promise.resolve(this._modelService.getModel(resource));
      }
    }));
  }
};
ChatCodeBlockContentProvider = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IModelService)
], ChatCodeBlockContentProvider);
let CodeCompareBlockPart = class extends Disposable {
  constructor(options, menuId, delegate, overflowWidgetsDomNode, isSimpleWidget = false, instantiationService, contextKeyService, modelService, configurationService, accessibilityService, labelService, openerService) {
    super();
    this.options = options;
    this.menuId = menuId;
    this.isSimpleWidget = isSimpleWidget;
    this.modelService = modelService;
    this.configurationService = configurationService;
    this.accessibilityService = accessibilityService;
    this.labelService = labelService;
    this.openerService = openerService;
    this._lastDiffEditorViewModel = this._store.add(new MutableDisposable());
    this.currentScrollWidth = 0;
    this.currentHorizontalPadding = 0;
    this.element = $(".interactive-result-code-block");
    this.element.classList.add("compare");
    this.messageElement = dom.append(this.element, $(".message"));
    this.messageElement.setAttribute("role", "status");
    this.messageElement.tabIndex = 0;
    this.contextKeyService = this._register(contextKeyService.createScoped(this.element));
    const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection(
      [IContextKeyService, this.contextKeyService],
      [IEditorProgressService, new class {
        show(_total, _delay) {
          return emptyProgressRunner;
        }
        async showWhile(promise, _delay) {
          await promise;
        }
      }()]
    )));
    const editorHeader = this.editorHeader = dom.append(this.element, $(".interactive-result-header.show-file-icons"));
    const editorElement = dom.append(this.element, $(".interactive-result-editor"));
    this.diffEditor = this.createDiffEditor(scopedInstantiationService, editorElement, {
      ...getSimpleEditorOptions(this.configurationService),
      lineNumbers: "on",
      selectOnLineNumbers: true,
      scrollBeyondLastLine: false,
      lineDecorationsWidth: 12,
      dragAndDrop: false,
      padding: { top: defaultCodeblockPadding, bottom: defaultCodeblockPadding },
      mouseWheelZoom: false,
      scrollbar: {
        vertical: "hidden",
        alwaysConsumeMouseWheel: false
      },
      definitionLinkOpensInPeek: false,
      gotoLocation: {
        multiple: "goto",
        multipleDeclarations: "goto",
        multipleDefinitions: "goto",
        multipleImplementations: "goto"
      },
      ariaLabel: localize("chat.codeBlockHelp", "Code block"),
      overflowWidgetsDomNode,
      ...this.getEditorOptionsFromConfig()
    });
    this.resourceLabel = this._register(scopedInstantiationService.createInstance(ResourceLabel, editorHeader, { supportIcons: true }));
    const editorScopedService = this._register(this.diffEditor.getModifiedEditor().contextKeyService.createScoped(editorHeader));
    const editorScopedInstantiationService = this._register(scopedInstantiationService.createChild(new ServiceCollection([IContextKeyService, editorScopedService])));
    this.toolbar = this._register(editorScopedInstantiationService.createInstance(MenuWorkbenchToolBar, editorHeader, menuId, {
      menuOptions: {
        shouldForwardArgs: true
      }
    }));
    this._configureForScreenReader();
    this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this._configureForScreenReader()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectedKeys.has(AccessibilityVerbositySettingId.Chat)) {
        this._configureForScreenReader();
      }
    }));
    this._register(this.options.onDidChange(() => {
      this.diffEditor.updateOptions(this.getEditorOptionsFromConfig());
    }));
    this._register(this.diffEditor.getModifiedEditor().onDidScrollChange((e) => {
      this.currentScrollWidth = e.scrollWidth;
    }));
    this._register(this.diffEditor.getModifiedEditor().onDidBlurEditorWidget(() => {
      this.element.classList.remove("focused");
      WordHighlighterContribution.get(this.diffEditor.getModifiedEditor())?.stopHighlighting();
      this.clearWidgets();
    }));
    this._register(this.diffEditor.getModifiedEditor().onDidFocusEditorWidget(() => {
      this.element.classList.add("focused");
      WordHighlighterContribution.get(this.diffEditor.getModifiedEditor())?.restoreViewState(true);
    }));
    if (delegate.onDidScroll) {
      this._register(delegate.onDidScroll((e) => {
        this.clearWidgets();
      }));
    }
  }
  get uri() {
    return this.diffEditor.getModifiedEditor().getModel()?.uri;
  }
  createDiffEditor(instantiationService, parent, options) {
    const widgetOptions = {
      isSimpleWidget: this.isSimpleWidget,
      contributions: EditorExtensionsRegistry.getSomeEditorContributions([
        MenuPreventer.ID,
        SelectionClipboardContributionID,
        ContextMenuController.ID,
        WordHighlighterContribution.ID,
        ViewportSemanticTokensContribution.ID,
        BracketMatchingController.ID,
        SmartSelectController.ID,
        ContentHoverController.ID,
        GlyphHoverController.ID,
        GotoDefinitionAtPositionEditorContribution.ID
      ])
    };
    return this._register(instantiationService.createInstance(DiffEditorWidget, parent, {
      scrollbar: { useShadows: false, alwaysConsumeMouseWheel: false, ignoreHorizontalScrollbarInContentHeight: true },
      renderMarginRevertIcon: false,
      diffCodeLens: false,
      scrollBeyondLastLine: false,
      stickyScroll: { enabled: false },
      originalAriaLabel: localize("original", "Original"),
      modifiedAriaLabel: localize("modified", "Modified"),
      diffAlgorithm: "advanced",
      readOnly: false,
      isInEmbeddedEditor: true,
      useInlineViewWhenSpaceIsLimited: true,
      experimental: {
        useTrueInlineView: true
      },
      renderSideBySideInlineBreakpoint: 300,
      renderOverviewRuler: false,
      compactMode: true,
      hideUnchangedRegions: { enabled: true, contextLineCount: 1 },
      renderGutterMenu: false,
      lineNumbersMinChars: 1,
      ...options
    }, { originalEditor: widgetOptions, modifiedEditor: widgetOptions }));
  }
  focus() {
    this.diffEditor.focus();
  }
  updatePaddingForLayout() {
    const horizontalScrollbarVisible = this.currentScrollWidth > this.diffEditor.getModifiedEditor().getLayoutInfo().contentWidth;
    const scrollbarHeight = this.diffEditor.getModifiedEditor().getLayoutInfo().horizontalScrollbarHeight;
    const bottomPadding = horizontalScrollbarVisible ? Math.max(defaultCodeblockPadding - scrollbarHeight, 2) : defaultCodeblockPadding;
    this.diffEditor.updateOptions({ padding: { top: defaultCodeblockPadding, bottom: bottomPadding } });
  }
  _configureForScreenReader() {
    const toolbarElt = this.toolbar.getElement();
    toolbarElt.style.display = "block";
    if (this.accessibilityService.isScreenReaderOptimized()) {
      toolbarElt.ariaLabel = localize("chat.codeBlock.toolbar", "Code block toolbar");
    }
  }
  getEditorOptionsFromConfig() {
    return {
      wordWrap: this.options.configuration.resultEditor.wordWrap,
      fontLigatures: this.options.configuration.resultEditor.fontLigatures,
      bracketPairColorization: this.options.configuration.resultEditor.bracketPairColorization,
      fontFamily: this.options.configuration.resultEditor.fontFamily === "default" ? EDITOR_FONT_DEFAULTS.fontFamily : this.options.configuration.resultEditor.fontFamily,
      fontSize: this.options.configuration.resultEditor.fontSize,
      fontWeight: this.options.configuration.resultEditor.fontWeight,
      lineHeight: this.options.configuration.resultEditor.lineHeight
    };
  }
  layout(width = this.lastLayoutWidth) {
    if (width === void 0) {
      return;
    }
    this.lastLayoutWidth = width;
    const editorBorder = 2;
    const toolbar = dom.getTotalHeight(this.editorHeader);
    const content = this.diffEditor.getModel() ? this.diffEditor.getContentHeight() : dom.getTotalHeight(this.messageElement);
    const dimension = new dom.Dimension(width - editorBorder - this.currentHorizontalPadding * 2, toolbar + content);
    this.element.style.width = `${dimension.width}px`;
    this.diffEditor.layout(dimension.with(void 0, content - editorBorder));
    this.updatePaddingForLayout();
  }
  async render(data, width, token) {
    this.currentHorizontalPadding = data.horizontalPadding || 0;
    if (data.parentContextKeyService) {
      this.contextKeyService.updateParent(data.parentContextKeyService);
    }
    if (this.options.configuration.resultEditor.wordWrap === "on") {
      this.layout(width);
    }
    await this.updateEditor(data, token);
    this.layout(width);
    this.diffEditor.updateOptions({
      ariaLabel: localize("chat.compareCodeBlockLabel", "Code Edits"),
      readOnly: !!data.isReadOnly
    });
    this.resourceLabel.element.setFile(data.edit.uri, {
      fileKind: FileKind.FILE,
      fileDecorations: { colors: true, badges: false }
    });
  }
  reset() {
    this.clearWidgets();
  }
  clearWidgets() {
    ContentHoverController.get(this.diffEditor.getOriginalEditor())?.hideContentHover();
    ContentHoverController.get(this.diffEditor.getModifiedEditor())?.hideContentHover();
    GlyphHoverController.get(this.diffEditor.getOriginalEditor())?.hideGlyphHover();
    GlyphHoverController.get(this.diffEditor.getModifiedEditor())?.hideGlyphHover();
  }
  async updateEditor(data, token) {
    if (!isResponseVM(data.element)) {
      return;
    }
    const isEditApplied = Boolean(data.edit.state?.applied ?? 0);
    ChatContextKeys.editApplied.bindTo(this.contextKeyService).set(isEditApplied);
    this.element.classList.toggle("no-diff", isEditApplied);
    if (isEditApplied) {
      assertType(data.edit.state?.applied);
      const uriLabel = this.labelService.getUriLabel(data.edit.uri, { relative: true, noPrefix: true });
      let template;
      if (data.edit.state.applied === 1) {
        template = localize("chat.edits.1", "Applied 1 change in [[``{0}``]]", uriLabel);
      } else if (data.edit.state.applied < 0) {
        template = localize("chat.edits.rejected", "Edits in [[``{0}``]] have been rejected", uriLabel);
      } else {
        template = localize("chat.edits.N", "Applied {0} changes in [[``{1}``]]", data.edit.state.applied, uriLabel);
      }
      const message = renderFormattedText(template, {
        renderCodeSegments: true,
        actionHandler: {
          callback: () => {
            this.openerService.open(data.edit.uri, { fromUserGesture: true, allowCommands: false });
          },
          disposables: this._store
        }
      });
      dom.reset(this.messageElement, message);
    }
    const diffData = await data.diffData;
    if (token.isCancellationRequested) {
      return;
    }
    if (!isEditApplied && diffData) {
      const viewModel = this.diffEditor.createViewModel({
        original: diffData.original,
        modified: diffData.modified
      });
      await viewModel.waitForDiff();
      if (token.isCancellationRequested) {
        return;
      }
      const listener = Event.any(diffData.original.onWillDispose, diffData.modified.onWillDispose)(() => {
        this.diffEditor.setModel(null);
      });
      this.diffEditor.setModel(viewModel);
      this._lastDiffEditorViewModel.value = combinedDisposable(listener, viewModel);
    } else {
      this.diffEditor.setModel(null);
      this._lastDiffEditorViewModel.value = void 0;
    }
    this.toolbar.context = {
      edit: data.edit,
      element: data.element,
      diffEditor: this.diffEditor,
      toggleDiffViewMode: () => {
        const isCurrentlyInline = !!this.diffEditor.getModifiedEditor().contextKeyService.getContextKeyValue(EditorContextKeys.diffEditorInlineMode.key);
        const renderSideBySide = isCurrentlyInline;
        this.diffEditor.updateOptions({
          renderSideBySide,
          // Make it not-compact in side by side mode, otherwise we may not actually
          // show it side-by-side if it's a simple diff https://github.com/microsoft/vscode/blob/0632563332c7c08656fb47c97bc4328d62ee1d80/src/vs/editor/browser/widget/diffEditor/diffEditorOptions.ts#L35-L39
          compactMode: !renderSideBySide,
          useInlineViewWhenSpaceIsLimited: false
        });
        this.layout();
      }
    };
  }
};
CodeCompareBlockPart = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IModelService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IAccessibilityService),
  __decorateParam(10, ILabelService),
  __decorateParam(11, IOpenerService)
], CodeCompareBlockPart);
let DefaultChatTextEditor = class {
  constructor(modelService, editorService, dialogService) {
    this.modelService = modelService;
    this.editorService = editorService;
    this.dialogService = dialogService;
    this._sha1 = new DefaultModelSHA1Computer();
  }
  async apply(response, item, diffEditor) {
    if (!response.response.value.includes(item)) {
      return;
    }
    if (item.state?.applied) {
      return;
    }
    if (!diffEditor) {
      for (const candidate of this.editorService.listDiffEditors()) {
        if (!candidate.getContainerDomNode().isConnected) {
          continue;
        }
        const model = candidate.getModel();
        if (!model || !isEqual(model.original.uri, item.uri) || model.modified.uri.scheme !== Schemas.vscodeChatCodeCompareBlock) {
          diffEditor = candidate;
          break;
        }
      }
    }
    const edits = diffEditor ? await this._applyWithDiffEditor(diffEditor, item) : await this._apply(item);
    response.setEditApplied(item, edits);
  }
  async _applyWithDiffEditor(diffEditor, item) {
    const model = diffEditor.getModel();
    if (!model) {
      return 0;
    }
    const diff = diffEditor.getDiffComputationResult();
    if (!diff || diff.identical) {
      return 0;
    }
    if (!await this._checkSha1(model.original, item)) {
      return 0;
    }
    const modified = new TextModelText(model.modified);
    const edits = diff.changes2.map((i) => i.toRangeMapping().toTextEdit(modified).toSingleEditOperation());
    model.original.pushStackElement();
    model.original.pushEditOperations(null, edits, () => null);
    model.original.pushStackElement();
    return edits.length;
  }
  async _apply(item) {
    const ref = await this.modelService.createModelReference(item.uri);
    try {
      if (!await this._checkSha1(ref.object.textEditorModel, item)) {
        return 0;
      }
      ref.object.textEditorModel.pushStackElement();
      let total = 0;
      for (const group of item.edits) {
        const edits = group.map(TextEdit.asEditOperation);
        ref.object.textEditorModel.pushEditOperations(null, edits, () => null);
        total += edits.length;
      }
      ref.object.textEditorModel.pushStackElement();
      return total;
    } finally {
      ref.dispose();
    }
  }
  async _checkSha1(model, item) {
    if (item.state?.sha1 && this._sha1.computeSHA1(model) && this._sha1.computeSHA1(model) !== item.state.sha1) {
      const result = await this.dialogService.confirm({
        message: localize("interactive.compare.apply.confirm", "The original file has been modified."),
        detail: localize("interactive.compare.apply.confirm.detail", "Do you want to apply the changes anyway?")
      });
      if (!result.confirmed) {
        return false;
      }
    }
    return true;
  }
  discard(response, item) {
    if (!response.response.value.includes(item)) {
      return;
    }
    if (item.state?.applied) {
      return;
    }
    response.setEditApplied(item, -1);
  }
};
DefaultChatTextEditor = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, ICodeEditorService),
  __decorateParam(2, IDialogService)
], DefaultChatTextEditor);
export {
  ChatCodeBlockContentProvider,
  CodeBlockPart,
  CodeCompareBlockPart,
  DefaultChatTextEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jb2RlQmxvY2tQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NvZGVCbG9ja1BhcnQuY3NzJztcblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVyRm9ybWF0dGVkVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mb3JtYXR0ZWRUZXh0UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY29tYmluZWREaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdGhlblJlZ2lzdGVyT3JEaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpZmZFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCwgSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvZGlmZkVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24sIElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFRElUT1JfRk9OVF9ERUZBVUxUUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2ZvbnRJbmZvLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVByZWZlcmVuY2UsIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsVGV4dC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0TW9kZWxTSEExQ29tcHV0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJyYWNrZXRNYXRjaGluZ0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9icmFja2V0TWF0Y2hpbmcvYnJvd3Nlci9icmFja2V0TWF0Y2hpbmcuanMnO1xuaW1wb3J0IHsgQ29sb3JEZXRlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvbG9yUGlja2VyL2Jyb3dzZXIvY29sb3JEZXRlY3Rvci5qcyc7XG5pbXBvcnQgeyBDb250ZXh0TWVudUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb250ZXh0bWVudS9icm93c2VyL2NvbnRleHRtZW51LmpzJztcbmltcG9ydCB7IEdvdG9EZWZpbml0aW9uQXRQb3NpdGlvbkVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2dvdG9TeW1ib2wvYnJvd3Nlci9saW5rL2dvVG9EZWZpbml0aW9uQXRQb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZW50SG92ZXJDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaG92ZXIvYnJvd3Nlci9jb250ZW50SG92ZXJDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IEdseXBoSG92ZXJDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaG92ZXIvYnJvd3Nlci9nbHlwaEhvdmVyQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBMaW5rRGV0ZWN0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9saW5rcy9icm93c2VyL2xpbmtzLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvbWVzc2FnZS9icm93c2VyL21lc3NhZ2VDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IFZpZXdwb3J0U2VtYW50aWNUb2tlbnNDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zZW1hbnRpY1Rva2Vucy9icm93c2VyL3ZpZXdwb3J0U2VtYW50aWNUb2tlbnMuanMnO1xuaW1wb3J0IHsgU21hcnRTZWxlY3RDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc21hcnRTZWxlY3QvYnJvd3Nlci9zbWFydFNlbGVjdC5qcyc7XG5pbXBvcnQgeyBXb3JkSGlnaGxpZ2h0ZXJDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi93b3JkSGlnaGxpZ2h0ZXIvYnJvd3Nlci93b3JkSGlnaGxpZ2h0ZXIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IFN0YXRpY1Jlc291cmNlQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEluc3BlY3RFZGl0b3JUb2tlbnNDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29kZUVkaXRvci9icm93c2VyL2luc3BlY3RFZGl0b3JUb2tlbnMvaW5zcGVjdEVkaXRvclRva2Vucy5qcyc7XG5pbXBvcnQgeyBNZW51UHJldmVudGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29kZUVkaXRvci9icm93c2VyL21lbnVQcmV2ZW50ZXIuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uQ2xpcGJvYXJkQ29udHJpYnV0aW9uSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvc2VsZWN0aW9uQ2xpcGJvYXJkLmpzJztcbmltcG9ydCB7IGdldFNpbXBsZUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvc2ltcGxlRWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25WdWxuZXJhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3dpZGdldC9hbm5vdGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXNwb25zZU1vZGVsLCBJQ2hhdFRleHRFZGl0R3JvdXAgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZpZXdNb2RlbCwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaXNSZXF1ZXN0Vk0sIGlzUmVzcG9uc2VWTSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRSZW5kZXJlckRlbGVnYXRlIH0gZnJvbSAnLi4vY2hhdExpc3RSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uL2NoYXRPcHRpb25zLmpzJztcbmltcG9ydCB7IGVtcHR5UHJvZ3Jlc3NSdW5uZXIsIElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgU3VnZ2VzdENvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvc3VnZ2VzdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgU25pcHBldENvbnRyb2xsZXIyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc25pcHBldC9icm93c2VyL3NuaXBwZXRDb250cm9sbGVyMi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGVCbG9ja0RhdGEge1xuXHRyZWFkb25seSBjb2RlQmxvY2tJbmRleDogbnVtYmVyO1xuXHRyZWFkb25seSBlbGVtZW50OiBJQ2hhdFJlcXVlc3RWaWV3TW9kZWwgfCBJQ2hhdFJlc3BvbnNlVmlld01vZGVsO1xuXG5cdC8qKlxuXHQgKiBUZXh0IGNvbnRlbnQgZm9yIHRoZSBjb2RlIGJsb2NrLiBUaGUgQ29kZUJsb2NrUGFydCB3aWxsIG1hbmFnZVxuXHQgKiBjcmVhdGluZyBhbmQgdXBkYXRpbmcgaXRzIG93biB0ZXh0IG1vZGVsIGZyb20gdGhpcyB0ZXh0LlxuXHQgKi9cblx0cmVhZG9ubHkgdGV4dDogc3RyaW5nO1xuXHRyZWFkb25seSBsYW5ndWFnZUlkOiBzdHJpbmc7XG5cblx0cmVhZG9ubHkgY29kZW1hcHBlclVyaT86IFVSSTtcblxuXHRyZWFkb25seSB2dWxucz86IHJlYWRvbmx5IElNYXJrZG93blZ1bG5lcmFiaWxpdHlbXTtcblxuXHRyZWFkb25seSBwYXJlbnRDb250ZXh0S2V5U2VydmljZT86IElDb250ZXh0S2V5U2VydmljZTtcblx0cmVhZG9ubHkgcmVuZGVyT3B0aW9ucz86IElDb2RlQmxvY2tSZW5kZXJPcHRpb25zO1xuXG5cdHJlYWRvbmx5IGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29kZUJsb2NrQWN0aW9uQ29udGV4dCB7XG5cdHJlYWRvbmx5IGNvZGU6IHN0cmluZztcblx0cmVhZG9ubHkgY29kZW1hcHBlclVyaT86IFVSSTtcblx0cmVhZG9ubHkgbGFuZ3VhZ2VJZD86IHN0cmluZztcblx0cmVhZG9ubHkgY29kZUJsb2NrSW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgZWxlbWVudDogdW5rbm93bjtcblxuXHRyZWFkb25seSBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGVCbG9ja1JlbmRlck9wdGlvbnMge1xuXHRoaWRlVG9vbGJhcj86IGJvb2xlYW47XG5cdHZlcnRpY2FsUGFkZGluZz86IG51bWJlcjtcblx0cmVzZXJ2ZVdpZHRoPzogbnVtYmVyO1xuXHRlZGl0b3JPcHRpb25zPzogSUVkaXRvck9wdGlvbnM7XG5cdG1heEhlaWdodEluTGluZXM/OiBudW1iZXI7XG59XG5cbmNvbnN0IGRlZmF1bHRDb2RlYmxvY2tQYWRkaW5nID0gMTA7XG5jb25zdCBkZWZhdWx0Q2hhdFNjcm9sbGJhclNpemUgPSA3O1xuZXhwb3J0IGNsYXNzIENvZGVCbG9ja1BhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHQvKipcblx0ICogQ29tcHV0ZSBhIHBvb2wgcmV1c2Uga2V5IGZvciBhIGNvZGUgYmxvY2suIFdoZW4gdGhlIHNhbWUga2V5IGlzIHVzZWRcblx0ICogYWNyb3NzIHJlbmRlciBjeWNsZXMgdGhlIHBvb2wgd2lsbCB0cnkgdG8gcmV0dXJuIHRoZSBzYW1lIENvZGVCbG9ja1BhcnQsXG5cdCAqIHdoaWNoIGxldHMgdGhlIHNldFRleHQgYXBwZW5kLW9wdGltaXNhdGlvbiBhdm9pZCBhIGZ1bGwgbW9kZWwgcmVzZXQuXG5cdCAqL1xuXHRzdGF0aWMgcG9vbEtleShlbGVtZW50SWQ6IHN0cmluZywgY29kZUJsb2NrSW5kZXg6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke2VsZW1lbnRJZH0vJHtjb2RlQmxvY2tJbmRleH1gO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IGVkaXRvcjogQ29kZUVkaXRvcldpZGdldDtcblx0cHJpdmF0ZSB0b29sYmFyOiBNZW51V29ya2JlbmNoVG9vbEJhciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdG9vbGJhckZhY3Rvcnk6ICgoKSA9PiBNZW51V29ya2JlbmNoVG9vbEJhcikgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3BlbmRpbmdUb29sYmFyQXJpYUxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3BlbmRpbmdUb29sYmFyQ29udGV4dDogSUNvZGVCbG9ja0FjdGlvbkNvbnRleHQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSB2dWxuc0J1dHRvbjogQnV0dG9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IHZ1bG5zTGlzdEVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RleHRNb2RlbCE6IElUZXh0TW9kZWw7XG5cblx0cHJpdmF0ZSBjdXJyZW50Q29kZUJsb2NrRGF0YTogSUNvZGVCbG9ja0RhdGEgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VycmVudFNjcm9sbFdpZHRoID0gMDtcblx0cHJpdmF0ZSBsYXN0TGF5b3V0V2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNIb3ZlcmVkID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzRHJvcGRvd25WaXNpYmxlID0gZmFsc2U7XG5cdHByaXZhdGUgX3Rvb2xiYXJFbGVtZW50ITogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZXNvdXJjZUNvbnRleHRLZXk6IFN0YXRpY1Jlc291cmNlQ29udGV4dEtleTtcblxuXHRwcml2YXRlIGdldCB2ZXJ0aWNhbFBhZGRpbmcoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50Q29kZUJsb2NrRGF0YT8ucmVuZGVyT3B0aW9ucz8udmVydGljYWxQYWRkaW5nID8/IGRlZmF1bHRDb2RlYmxvY2tQYWRkaW5nO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JPcHRpb25zOiBDaGF0RWRpdG9yT3B0aW9ucyxcblx0XHRyZWFkb25seSBtZW51SWQ6IE1lbnVJZCxcblx0XHRkZWxlZ2F0ZTogSUNoYXRSZW5kZXJlckRlbGVnYXRlLFxuXHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaXNTaW1wbGVXaWRnZXQ6IGJvb2xlYW4gPSBmYWxzZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gJCgnLmludGVyYWN0aXZlLXJlc3VsdC1jb2RlLWJsb2NrJyk7XG5cblx0XHR0aGlzLnJlc291cmNlQ29udGV4dEtleSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN0YXRpY1Jlc291cmNlQ29udGV4dEtleSk7XG5cdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLmVsZW1lbnQpKTtcblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblx0XHRjb25zdCBlZGl0b3JFbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5pbnRlcmFjdGl2ZS1yZXN1bHQtZWRpdG9yJykpO1xuXHRcdHRoaXMuZWRpdG9yID0gdGhpcy5jcmVhdGVFZGl0b3Ioc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UsIGVkaXRvckVsZW1lbnQsIHtcblx0XHRcdC4uLmdldFNpbXBsZUVkaXRvck9wdGlvbnModGhpcy5jb25maWd1cmF0aW9uU2VydmljZSksXG5cdFx0XHRyZWFkT25seTogdHJ1ZSxcblx0XHRcdGxpbmVOdW1iZXJzOiAnb2ZmJyxcblx0XHRcdHNlbGVjdE9uTGluZU51bWJlcnM6IHRydWUsXG5cdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogOCxcblx0XHRcdGRyYWdBbmREcm9wOiBmYWxzZSxcblx0XHRcdHBhZGRpbmc6IHsgdG9wOiB0aGlzLnZlcnRpY2FsUGFkZGluZywgYm90dG9tOiB0aGlzLnZlcnRpY2FsUGFkZGluZyB9LFxuXHRcdFx0bW91c2VXaGVlbFpvb206IGZhbHNlLFxuXHRcdFx0c2Nyb2xsYmFyOiB7XG5cdFx0XHRcdHZlcnRpY2FsOiAnaGlkZGVuJyxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0ZGVmaW5pdGlvbkxpbmtPcGVuc0luUGVlazogZmFsc2UsXG5cdFx0XHRnb3RvTG9jYXRpb246IHtcblx0XHRcdFx0bXVsdGlwbGU6ICdnb3RvJyxcblx0XHRcdFx0bXVsdGlwbGVEZWNsYXJhdGlvbnM6ICdnb3RvJyxcblx0XHRcdFx0bXVsdGlwbGVEZWZpbml0aW9uczogJ2dvdG8nLFxuXHRcdFx0XHRtdWx0aXBsZUltcGxlbWVudGF0aW9uczogJ2dvdG8nLFxuXHRcdFx0fSxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2NoYXQuY29kZUJsb2NrSGVscCcsICdDb2RlIGJsb2NrJyksXG5cdFx0XHRvdmVyZmxvd1dpZGdldHNEb21Ob2RlLFxuXHRcdFx0dGFiRm9jdXNNb2RlOiB0cnVlLFxuXHRcdFx0Li4udGhpcy5nZXRFZGl0b3JPcHRpb25zRnJvbUNvbmZpZygpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdG9vbGJhckVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLmludGVyYWN0aXZlLXJlc3VsdC1jb2RlLWJsb2NrLXRvb2xiYXInKSk7XG5cdFx0dGhpcy5fdG9vbGJhckVsZW1lbnQgPSB0b29sYmFyRWxlbWVudDtcblx0XHRjb25zdCBlZGl0b3JTY29wZWRTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3IuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRvb2xiYXJFbGVtZW50KSk7XG5cdFx0Y29uc3QgZWRpdG9yU2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgZWRpdG9yU2NvcGVkU2VydmljZV0pKSk7XG5cdFx0Ly8gVGhlIHRvb2xiYXIgaXRzZWxmIGNyZWF0ZXMgbGlzdGVuZXJzIG9uIHRoZSBtZW51IHNlcnZpY2UgYW5kIHNoYXJlZFxuXHRcdC8vIGNvbnRleHQga2V5IHNlcnZpY2UuIEluIGxhcmdlIHJlc3BvbnNlcyB0aGVyZSBjYW4gYmUgbWFueSBjb2RlXG5cdFx0Ly8gYmxvY2tzLCBzbyBkZWZlciBjcmVhdGlvbiB1bnRpbCB0aGUgdXNlciBhY3R1YWxseSBpbnRlcmFjdHMgd2l0aFxuXHRcdC8vIHRoaXMgY29kZSBibG9jayAoaG92ZXIsIGVkaXRvciBmb2N1cywgb3Igc2NyZWVuIHJlYWRlciBtb2RlKS5cblx0XHR0aGlzLl90b29sYmFyRmFjdG9yeSA9ICgpID0+IGVkaXRvclNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0b29sYmFyRWxlbWVudCwgbWVudUlkLCB7XG5cdFx0XHRtZW51T3B0aW9uczoge1xuXHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdnVsbnNDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLmludGVyYWN0aXZlLXJlc3VsdC12dWxucycpKTtcblx0XHRjb25zdCB2dWxuc0hlYWRlckVsZW1lbnQgPSBkb20uYXBwZW5kKHZ1bG5zQ29udGFpbmVyLCAkKCcuaW50ZXJhY3RpdmUtcmVzdWx0LXZ1bG5zLWhlYWRlcicsIHVuZGVmaW5lZCkpO1xuXHRcdHRoaXMudnVsbnNCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHZ1bG5zSGVhZGVyRWxlbWVudCwge1xuXHRcdFx0YnV0dG9uQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uQm9yZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25Gb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25Ib3ZlckJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUhvdmVyQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uU2VwYXJhdG9yOiB1bmRlZmluZWQsXG5cdFx0XHRzdXBwb3J0SWNvbnM6IHRydWVcblx0XHR9KSk7XG5cblx0XHR0aGlzLnZ1bG5zTGlzdEVsZW1lbnQgPSBkb20uYXBwZW5kKHZ1bG5zQ29udGFpbmVyLCAkKCd1bC5pbnRlcmFjdGl2ZS1yZXN1bHQtdnVsbnMtbGlzdCcpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudnVsbnNCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5jdXJyZW50Q29kZUJsb2NrRGF0YSEuZWxlbWVudCBhcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsO1xuXHRcdFx0ZWxlbWVudC52dWxuZXJhYmlsaXRpZXNMaXN0RXhwYW5kZWQgPSAhZWxlbWVudC52dWxuZXJhYmlsaXRpZXNMaXN0RXhwYW5kZWQ7XG5cdFx0XHR0aGlzLnZ1bG5zQnV0dG9uLmxhYmVsID0gdGhpcy5nZXRWdWxuZXJhYmlsaXRpZXNMYWJlbCgpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtdnVsbmVyYWJpbGl0aWVzLWNvbGxhcHNlZCcsICFlbGVtZW50LnZ1bG5lcmFiaWxpdGllc0xpc3RFeHBhbmRlZCk7XG5cdFx0XHR0aGlzLmxheW91dCgpO1xuXHRcdFx0Ly8gdGhpcy51cGRhdGVBcmlhTGFiZWwoY29sbGFwc2VCdXR0b24uZWxlbWVudCwgcmVmZXJlbmNlc0xhYmVsLCBlbGVtZW50LnVzZWRSZWZlcmVuY2VzRXhwYW5kZWQpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIGhvdmVyIHN0YXRlIHZpYSBKUyBzbyB0aGUgdG9vbGJhciByZW1haW5zIHZpc2libGUgYW5kIGNsaWNrYWJsZVxuXHRcdC8vIGV2ZW4gd2hlbiB0aGUgY29kZSBibG9jayBET00gZWxlbWVudCBpcyBicmllZmx5IGRldGFjaGVkIGFuZCByZWF0dGFjaGVkXG5cdFx0Ly8gZHVyaW5nIHN0cmVhbWluZyByZS1yZW5kZXJzLiBDU1MgOmhvdmVyIGlzIGxvc3Qgd2hlbiBhbiBlbGVtZW50IGxlYXZlc1xuXHRcdC8vIHRoZSBET00sIHdoaWNoIGNhdXNlcyB0aGUgdG9vbGJhciB0byBmbGlja2VyIGFuZCBiZWNvbWUgdW5jbGlja2FibGVcblx0XHQvLyBiZWNhdXNlIG9mIHRoZSBwb2ludGVyLWV2ZW50czpub25lIHJ1bGUuIEJ5IHRyYWNraW5nIGhvdmVyIHN0YXRlIHdpdGggYVxuXHRcdC8vIHBlcnNpc3RlbnQgYm9vbGVhbiBhbmQgdGhlIGZvcmNlLXZpc2liaWxpdHkgY2xhc3MsIHRoZSB0b29sYmFyIHN1cnZpdmVzXG5cdFx0Ly8gRE9NIHJlYXR0YWNobWVudC5cblx0XHR0aGlzLl9pc0hvdmVyZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgJ21vdXNlZW50ZXInLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9pc0hvdmVyZWQgPSB0cnVlO1xuXHRcdFx0dG9vbGJhckVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZm9yY2UtdmlzaWJpbGl0eScpO1xuXHRcdFx0dGhpcy5fZW5zdXJlVG9vbGJhcigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9pc0hvdmVyZWQgPSBmYWxzZTtcblx0XHRcdGlmICghdGhpcy5faXNEcm9wZG93blZpc2libGUpIHtcblx0XHRcdFx0dG9vbGJhckVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZm9yY2UtdmlzaWJpbGl0eScpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2NvbmZpZ3VyZUZvclNjcmVlblJlYWRlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2Uub25EaWRDaGFuZ2VTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKCkgPT4gdGhpcy5fY29uZmlndXJlRm9yU2NyZWVuUmVhZGVyKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0ZWRLZXlzLmhhcyhBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkNoYXQpKSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyZUZvclNjcmVlblJlYWRlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yT3B0aW9ucy5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmVkaXRvci51cGRhdGVPcHRpb25zKHRoaXMuZ2V0RWRpdG9yT3B0aW9uc0Zyb21Db25maWcoKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UoZSA9PiB7XG5cdFx0XHR0aGlzLmN1cnJlbnRTY3JvbGxXaWR0aCA9IGUuc2Nyb2xsV2lkdGg7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uRGlkQ29udGVudFNpemVDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5jb250ZW50SGVpZ2h0Q2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLmxheW91dCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2ZvY3VzZWQnKTtcblx0XHRcdFdvcmRIaWdobGlnaHRlckNvbnRyaWJ1dGlvbi5nZXQodGhpcy5lZGl0b3IpPy5zdG9wSGlnaGxpZ2h0aW5nKCk7XG5cdFx0XHR0aGlzLmNsZWFyV2lkZ2V0cygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbkRpZEZvY3VzRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdmb2N1c2VkJyk7XG5cdFx0XHQvLyBFZGl0b3IgZm9jdXMgcHV0cyB0aGUgY29kZSBibG9jayBpbnRvIGtleWJvYXJkIGludGVyYWN0aW9uIHJhbmdlO1xuXHRcdFx0Ly8gY3JlYXRlIHRoZSB0b29sYmFyIHNvIFRhYiBjYW4gcmVhY2ggaXQuXG5cdFx0XHR0aGlzLl9lbnN1cmVUb29sYmFyKCk7XG5cdFx0XHRXb3JkSGlnaGxpZ2h0ZXJDb250cmlidXRpb24uZ2V0KHRoaXMuZWRpdG9yKT8ucmVzdG9yZVZpZXdTdGF0ZSh0cnVlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KFxuXHRcdFx0dGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCxcblx0XHRcdHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50XG5cdFx0KSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50Q29kZUJsb2NrRGF0YSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvbnRleHRzKHRoaXMuY3VycmVudENvZGVCbG9ja0RhdGEpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFBhcmVudCBsaXN0IHNjcm9sbGVkXG5cdFx0aWYgKGRlbGVnYXRlLm9uRGlkU2Nyb2xsKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihkZWxlZ2F0ZS5vbkRpZFNjcm9sbChlID0+IHtcblx0XHRcdFx0dGhpcy5jbGVhcldpZGdldHMoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl90ZXh0TW9kZWwgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnJywgbnVsbCxcblx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZUNoYXRDb2RlQmxvY2ssIHBhdGg6IGdlbmVyYXRlVXVpZCgpIH0pLFxuXHRcdFx0dGhpcy5pc1NpbXBsZVdpZGdldFxuXHRcdCkpO1xuXHRcdC8vIEhvbGQgYSBtb2RlbCByZWZlcmVuY2UgdG8gcHJldmVudCB0aGUgVGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlIGZyb21cblx0XHQvLyBkaXNwb3Npbmcgb3VyIG1vZGVsIHdoZW4gb3RoZXIgY29uc3VtZXJzIChlLmcuIFdvcmRIaWdobGlnaHRlcilcblx0XHQvLyBhY3F1aXJlIGFuZCByZWxlYXNlIHRoZWlyIHJlZmVyZW5jZXMuXG5cdFx0dGhlblJlZ2lzdGVyT3JEaXNwb3NlKHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZSh0aGlzLl90ZXh0TW9kZWwudXJpKSwgdGhpcy5fc3RvcmUpO1xuXHRcdHRoaXMuZWRpdG9yLnNldE1vZGVsKHRoaXMuX3RleHRNb2RlbCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMuaXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0Z2V0IHVyaSgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvci5nZXRNb2RlbCgpPy51cmk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUVkaXRvcihpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBwYXJlbnQ6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBSZWFkb25seTxJRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucz4pOiBDb2RlRWRpdG9yV2lkZ2V0IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUVkaXRvcldpZGdldCwgcGFyZW50LCBvcHRpb25zLCB7XG5cdFx0XHRpc1NpbXBsZVdpZGdldDogdGhpcy5pc1NpbXBsZVdpZGdldCxcblx0XHRcdGNvbnRyaWJ1dGlvbnM6IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRTb21lRWRpdG9yQ29udHJpYnV0aW9ucyhbXG5cdFx0XHRcdE1lbnVQcmV2ZW50ZXIuSUQsXG5cdFx0XHRcdFNlbGVjdGlvbkNsaXBib2FyZENvbnRyaWJ1dGlvbklELFxuXHRcdFx0XHRDb250ZXh0TWVudUNvbnRyb2xsZXIuSUQsXG5cblx0XHRcdFx0V29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uLklELFxuXHRcdFx0XHRWaWV3cG9ydFNlbWFudGljVG9rZW5zQ29udHJpYnV0aW9uLklELFxuXHRcdFx0XHRCcmFja2V0TWF0Y2hpbmdDb250cm9sbGVyLklELFxuXHRcdFx0XHRTbWFydFNlbGVjdENvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdENvbnRlbnRIb3ZlckNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdEdseXBoSG92ZXJDb250cm9sbGVyLklELFxuXHRcdFx0XHRNZXNzYWdlQ29udHJvbGxlci5JRCxcblx0XHRcdFx0R290b0RlZmluaXRpb25BdFBvc2l0aW9uRWRpdG9yQ29udHJpYnV0aW9uLklELFxuXHRcdFx0XHRTdWdnZXN0Q29udHJvbGxlci5JRCxcblx0XHRcdFx0U25pcHBldENvbnRyb2xsZXIyLklELFxuXHRcdFx0XHRDb2xvckRldGVjdG9yLklELFxuXHRcdFx0XHRMaW5rRGV0ZWN0b3IuSUQsXG5cblx0XHRcdFx0SW5zcGVjdEVkaXRvclRva2Vuc0NvbnRyb2xsZXIuSUQsXG5cdFx0XHRdKVxuXHRcdH0pKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVBhZGRpbmdGb3JMYXlvdXQoKSB7XG5cdFx0Ly8gc2Nyb2xsV2lkdGggPSBcInRoZSB3aWR0aCBvZiB0aGUgY29udGVudCB0aGF0IG5lZWRzIHRvIGJlIHNjcm9sbGVkXCJcblx0XHQvLyBjb250ZW50V2lkdGggPSBcInRoZSB3aWR0aCBvZiB0aGUgYXJlYSB3aGVyZSBjb250ZW50IGlzIGRpc3BsYXllZFwiXG5cdFx0Y29uc3QgaG9yaXpvbnRhbFNjcm9sbGJhclZpc2libGUgPSB0aGlzLmN1cnJlbnRTY3JvbGxXaWR0aCA+IHRoaXMuZWRpdG9yLmdldExheW91dEluZm8oKS5jb250ZW50V2lkdGg7XG5cdFx0Y29uc3Qgc2Nyb2xsYmFySGVpZ2h0ID0gdGhpcy5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpLmhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ7XG5cdFx0Y29uc3QgYm90dG9tUGFkZGluZyA9IGhvcml6b250YWxTY3JvbGxiYXJWaXNpYmxlID9cblx0XHRcdE1hdGgubWF4KHRoaXMudmVydGljYWxQYWRkaW5nIC0gc2Nyb2xsYmFySGVpZ2h0LCAyKSA6XG5cdFx0XHR0aGlzLnZlcnRpY2FsUGFkZGluZztcblx0XHR0aGlzLmVkaXRvci51cGRhdGVPcHRpb25zKHsgcGFkZGluZzogeyB0b3A6IHRoaXMudmVydGljYWxQYWRkaW5nLCBib3R0b206IGJvdHRvbVBhZGRpbmcgfSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZVRvb2xiYXIoKTogTWVudVdvcmtiZW5jaFRvb2xCYXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIElmIHRoZSBjdXJyZW50IHJlbmRlciBleHBsaWNpdGx5IGhpZCB0aGUgdG9vbGJhciwgZG9uJ3QgcGF5IHRoZSBjb3N0XG5cdFx0Ly8gb2YgY3JlYXRpbmcgaXQgKGFuZCBhZGRpbmcgbGlzdGVuZXJzIG9uIHRoZSBzaGFyZWQgbWVudSAvIGNvbnRleHRcblx0XHQvLyBrZXkgc2VydmljZXMpLiBJdCB3aWxsIGJlIGNyZWF0ZWQgbGF0ZXIgaWYgYSByZW5kZXIgbWFrZXMgaXQgdmlzaWJsZS5cblx0XHRpZiAodGhpcy5jdXJyZW50Q29kZUJsb2NrRGF0YT8ucmVuZGVyT3B0aW9ucz8uaGlkZVRvb2xiYXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghdGhpcy50b29sYmFyKSB7XG5cdFx0XHRjb25zdCBmYWN0b3J5ID0gdGhpcy5fdG9vbGJhckZhY3Rvcnk7XG5cdFx0XHRpZiAoIWZhY3RvcnkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Rvb2xiYXJGYWN0b3J5ID0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgdG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKGZhY3RvcnkoKSk7XG5cdFx0XHR0aGlzLnRvb2xiYXIgPSB0b29sYmFyO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0b29sYmFyLm9uRGlkQ2hhbmdlRHJvcGRvd25WaXNpYmlsaXR5KGUgPT4ge1xuXHRcdFx0XHR0aGlzLl9pc0Ryb3Bkb3duVmlzaWJsZSA9IGU7XG5cdFx0XHRcdHRoaXMuX3Rvb2xiYXJFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2ZvcmNlLXZpc2liaWxpdHknLCBlIHx8IHRoaXMuX2lzSG92ZXJlZCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGlmICh0aGlzLl9wZW5kaW5nVG9vbGJhckFyaWFMYWJlbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRvb2xiYXIuc2V0QXJpYUxhYmVsKHRoaXMuX3BlbmRpbmdUb29sYmFyQXJpYUxhYmVsKTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Rvb2xiYXJBcmlhTGFiZWwgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fcGVuZGluZ1Rvb2xiYXJDb250ZXh0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dG9vbGJhci5jb250ZXh0ID0gdGhpcy5fcGVuZGluZ1Rvb2xiYXJDb250ZXh0O1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nVG9vbGJhckNvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnRvb2xiYXI7XG5cdH1cblxuXHRwcml2YXRlIF9jb25maWd1cmVGb3JTY3JlZW5SZWFkZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgaGlkZVRvb2xiYXIgPSAhIXRoaXMuY3VycmVudENvZGVCbG9ja0RhdGE/LnJlbmRlck9wdGlvbnM/LmhpZGVUb29sYmFyO1xuXHRcdGlmICh0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpIHtcblx0XHRcdGlmIChoaWRlVG9vbGJhcikge1xuXHRcdFx0XHQvLyBoaWRlVG9vbGJhciBpcyBhdXRob3JpdGF0aXZlOyBkb24ndCByZXZlYWwgdGhlIHdyYXBwZXIganVzdFxuXHRcdFx0XHQvLyBiZWNhdXNlIFNSIG1vZGUgaXMgb24uXG5cdFx0XHRcdGRvbS5oaWRlKHRoaXMuX3Rvb2xiYXJFbGVtZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Rvb2xiYXJFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHRcdFx0XHQvLyBTY3JlZW4gcmVhZGVycyBuZWVkIHRoZSB0b29sYmFyIERPTSB0byBleGlzdCBzbyBpdCBjYW4gYmVcblx0XHRcdFx0Ly8gYW5ub3VuY2VkIGFuZCBuYXZpZ2F0ZWQsIGJ1dCBvbmx5IGNyZWF0ZSBpdCBvbmNlIHJlbmRlciBkYXRhXG5cdFx0XHRcdC8vIGlzIGF2YWlsYWJsZSBzbyBwb29sZWQgb3IgcmVzZXQgaW5zdGFuY2VzIGRvbid0IGVhZ2VybHlcblx0XHRcdFx0Ly8gYXR0YWNoIHRvb2xiYXIgbGlzdGVuZXJzLlxuXHRcdFx0XHRpZiAodGhpcy5jdXJyZW50Q29kZUJsb2NrRGF0YSkge1xuXHRcdFx0XHRcdHRoaXMuX2Vuc3VyZVRvb2xiYXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaGlkZVRvb2xiYXIpIHtcblx0XHRcdGRvbS5oaWRlKHRoaXMuX3Rvb2xiYXJFbGVtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdG9vbGJhckVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0RWRpdG9yT3B0aW9uc0Zyb21Db25maWcoKTogSUVkaXRvck9wdGlvbnMge1xuXHRcdGNvbnN0IHJlbmRlck9wdGlvbnMgPSB0aGlzLmN1cnJlbnRDb2RlQmxvY2tEYXRhPy5yZW5kZXJPcHRpb25zO1xuXHRcdC8vIFdoZW4gdGhlIGNvZGUgYmxvY2sgaXMgaGVpZ2h0LWNhcHBlZCB2aWEgYG1heEhlaWdodEluTGluZXNgLCBjb250ZW50IGNhblxuXHRcdC8vIGV4Y2VlZCB0aGUgdmlzaWJsZSBhcmVhLiBJbiB0aGF0IGNhc2UgdGhlIGRlZmF1bHQgaGlkZGVuIHZlcnRpY2FsXG5cdFx0Ly8gc2Nyb2xsYmFyIGxlYXZlcyB1c2VycyB1bmFibGUgdG8gcmVhY2ggdGhlIGNsaXBwZWQgY29udGVudCAoc2VlICMyODMyNDIpLlxuXHRcdC8vIEVuYWJsZSBhIGNoYXQtc2l6ZWQgdmlzaWJsZSBzY3JvbGxiYXIuIENhbGxlcnMgY2FuIHN0aWxsIG92ZXJyaWRlXG5cdFx0Ly8gdmlhIGByZW5kZXJPcHRpb25zLmVkaXRvck9wdGlvbnMuc2Nyb2xsYmFyYC5cblx0XHRjb25zdCBzY3JvbGxiYXI6IElFZGl0b3JPcHRpb25zWydzY3JvbGxiYXInXSB8IHVuZGVmaW5lZCA9IHJlbmRlck9wdGlvbnM/Lm1heEhlaWdodEluTGluZXNcblx0XHRcdD8geyB2ZXJ0aWNhbDogJ2F1dG8nLCB2ZXJ0aWNhbFNjcm9sbGJhclNpemU6IGRlZmF1bHRDaGF0U2Nyb2xsYmFyU2l6ZSwgLi4ucmVuZGVyT3B0aW9ucz8uZWRpdG9yT3B0aW9ucz8uc2Nyb2xsYmFyIH1cblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiB7XG5cdFx0XHR3b3JkV3JhcDogdGhpcy5lZGl0b3JPcHRpb25zLmNvbmZpZ3VyYXRpb24ucmVzdWx0RWRpdG9yLndvcmRXcmFwLFxuXHRcdFx0Zm9udExpZ2F0dXJlczogdGhpcy5lZGl0b3JPcHRpb25zLmNvbmZpZ3VyYXRpb24ucmVzdWx0RWRpdG9yLmZvbnRMaWdhdHVyZXMsXG5cdFx0XHRicmFja2V0UGFpckNvbG9yaXphdGlvbjogdGhpcy5lZGl0b3JPcHRpb25zLmNvbmZpZ3VyYXRpb24ucmVzdWx0RWRpdG9yLmJyYWNrZXRQYWlyQ29sb3JpemF0aW9uLFxuXHRcdFx0Zm9udEZhbWlseTogdGhpcy5lZGl0b3JPcHRpb25zLmNvbmZpZ3VyYXRpb24ucmVzdWx0RWRpdG9yLmZvbnRGYW1pbHkgPT09ICdkZWZhdWx0JyA/XG5cdFx0XHRcdEVESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRGYW1pbHkgOlxuXHRcdFx0XHR0aGlzLmVkaXRvck9wdGlvbnMuY29uZmlndXJhdGlvbi5yZXN1bHRFZGl0b3IuZm9udEZhbWlseSxcblx0XHRcdGZvbnRTaXplOiB0aGlzLmVkaXRvck9wdGlvbnMuY29uZmlndXJhdGlvbi5yZXN1bHRFZGl0b3IuZm9udFNpemUsXG5cdFx0XHRmb250V2VpZ2h0OiB0aGlzLmVkaXRvck9wdGlvbnMuY29uZmlndXJhdGlvbi5yZXN1bHRFZGl0b3IuZm9udFdlaWdodCxcblx0XHRcdGxpbmVIZWlnaHQ6IHRoaXMuZWRpdG9yT3B0aW9ucy5jb25maWd1cmF0aW9uLnJlc3VsdEVkaXRvci5saW5lSGVpZ2h0LFxuXHRcdFx0Li4ucmVuZGVyT3B0aW9ucz8uZWRpdG9yT3B0aW9ucyxcblx0XHRcdC4uLihzY3JvbGxiYXIgPyB7IHNjcm9sbGJhciB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHRsYXlvdXQod2lkdGggPSB0aGlzLmxhc3RMYXlvdXRXaWR0aCk6IHZvaWQge1xuXHRcdGlmICh3aWR0aCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vdCB5ZXQgaW4gRE9NXG5cdFx0fVxuXG5cdFx0dGhpcy5sYXN0TGF5b3V0V2lkdGggPSB3aWR0aDtcblx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gdGhpcy5nZXRDb250ZW50SGVpZ2h0KCk7XG5cblx0XHRsZXQgaGVpZ2h0ID0gY29udGVudEhlaWdodDtcblx0XHRpZiAodGhpcy5jdXJyZW50Q29kZUJsb2NrRGF0YT8ucmVuZGVyT3B0aW9ucz8ubWF4SGVpZ2h0SW5MaW5lcykge1xuXHRcdFx0aGVpZ2h0ID0gTWF0aC5taW4oY29udGVudEhlaWdodCwgdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KSAqIHRoaXMuY3VycmVudENvZGVCbG9ja0RhdGE/LnJlbmRlck9wdGlvbnM/Lm1heEhlaWdodEluTGluZXMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvckJvcmRlciA9IDI7XG5cdFx0d2lkdGggPSB3aWR0aCAtIGVkaXRvckJvcmRlciAtICh0aGlzLmN1cnJlbnRDb2RlQmxvY2tEYXRhPy5yZW5kZXJPcHRpb25zPy5yZXNlcnZlV2lkdGggPz8gMCk7XG5cdFx0Ly8gISEhIVxuXHRcdC8vIEltcG9ydGFudDogVXNpbmcgaGVyZSBwb3N0cG9uZVJlbmRlcmluZyA9IHRydWUgdG8gYXZvaWQgZG9pbmcgYSBzeW5jIGxheW91dCBvbiB0aGUgZWRpdG9yXG5cdFx0Ly8gd2hpY2ggY2FuIGJlIHZlcnkgZXhwZW5zaXZlIGlmIHRoZXJlIGFyZSBtYW55IGNvZGUgYmxvY2tzIGJlaW5nIGxhaWQgb3V0IGF0IG9uY2UuXG5cdFx0Ly8gVGhpcyBhbGxvd3MgbXVsdGlwbGUgZWRpdG9ycyB0byBjb29yZGluYXRlIGFuZCByZW5kZXIgdG9nZXRoZXIgYXQgdGhlIG5leHQgYW5pbWF0aW9uIGZyYW1lLlxuXHRcdC8vICEhISFcblx0XHR0aGlzLmVkaXRvci5sYXlvdXQoeyB3aWR0aDogaXNSZXF1ZXN0Vk0odGhpcy5jdXJyZW50Q29kZUJsb2NrRGF0YT8uZWxlbWVudCkgPyB3aWR0aCAqIDAuOSA6IHdpZHRoLCBoZWlnaHQgfSwgLyogcG9zdHBvbmVSZW5kZXJpbmcgKi8gdHJ1ZSk7XG5cdFx0dGhpcy51cGRhdGVQYWRkaW5nRm9yTGF5b3V0KCk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnRlbnRIZWlnaHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yLmdldENvbnRlbnRIZWlnaHQoKTtcblx0fVxuXG5cdHJlbmRlcihkYXRhOiBJQ29kZUJsb2NrRGF0YSwgd2lkdGg6IG51bWJlcikge1xuXHRcdHRoaXMuY3VycmVudENvZGVCbG9ja0RhdGEgPSBkYXRhO1xuXHRcdGlmIChkYXRhLnBhcmVudENvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLnVwZGF0ZVBhcmVudChkYXRhLnBhcmVudENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5nZXRFZGl0b3JPcHRpb25zRnJvbUNvbmZpZygpLndvcmRXcmFwID09PSAnb24nKSB7XG5cdFx0XHQvLyBJbml0aWFsaXplIHRoZSBlZGl0b3Igd2l0aCB0aGUgbmV3IHByb3BlciB3aWR0aCBzbyB0aGF0IGdldENvbnRlbnRIZWlnaHRcblx0XHRcdC8vIHdpbGwgYmUgY29tcHV0ZWQgY29ycmVjdGx5IGluIHRoZSBuZXh0IGNhbGwgdG8gbGF5b3V0KClcblx0XHRcdHRoaXMubGF5b3V0KHdpZHRoKTtcblx0XHR9XG5cblx0XHRjb25zdCBkaWRVcGRhdGUgPSB0aGlzLnVwZGF0ZUVkaXRvcihkYXRhKTtcblx0XHRpZiAoIWRpZFVwZGF0ZSB8fCB0aGlzLmlzRGlzcG9zZWQgfHwgdGhpcy5jdXJyZW50Q29kZUJsb2NrRGF0YSAhPT0gZGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWRpdG9yLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0Li4udGhpcy5nZXRFZGl0b3JPcHRpb25zRnJvbUNvbmZpZygpLFxuXHRcdH0pO1xuXHRcdGlmICghdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5hcmlhTGFiZWwpKSB7XG5cdFx0XHQvLyBEb24ndCBvdmVycmlkZSB0aGUgYXJpYUxhYmVsIGlmIGl0IHdhcyBzZXQgYnkgdGhlIGVkaXRvciBvcHRpb25zXG5cdFx0XHR0aGlzLmVkaXRvci51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5jb2RlQmxvY2tMYWJlbCcsIFwiQ29kZSBibG9jayB7MH1cIiwgZGF0YS5jb2RlQmxvY2tJbmRleCArIDEpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHRoaXMubGF5b3V0KHdpZHRoKTtcblx0XHRjb25zdCB0b29sYmFyQXJpYUxhYmVsID0gbG9jYWxpemUoJ2NoYXQuY29kZUJsb2NrVG9vbGJhckxhYmVsJywgXCJDb2RlIGJsb2NrIHswfVwiLCBkYXRhLmNvZGVCbG9ja0luZGV4ICsgMSk7XG5cdFx0aWYgKHRoaXMudG9vbGJhcikge1xuXHRcdFx0dGhpcy50b29sYmFyLnNldEFyaWFMYWJlbCh0b29sYmFyQXJpYUxhYmVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1Rvb2xiYXJBcmlhTGFiZWwgPSB0b29sYmFyQXJpYUxhYmVsO1xuXHRcdH1cblx0XHRpZiAoZGF0YS5yZW5kZXJPcHRpb25zPy5oaWRlVG9vbGJhcikge1xuXHRcdFx0ZG9tLmhpZGUodGhpcy5fdG9vbGJhckVsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkb20uc2hvdyh0aGlzLl90b29sYmFyRWxlbWVudCk7XG5cdFx0XHQvLyBJbiBzY3JlZW4gcmVhZGVyIG1vZGUgdGhlIHRvb2xiYXIgbXVzdCBleGlzdCBpbiB0aGUgRE9NIHNvIGl0XG5cdFx0XHQvLyBjYW4gYmUgYW5ub3VuY2VkIGFuZCBUYWItbmF2aWdhdGVkLiBJZiBhIHByZXZpb3VzIHJlbmRlciBoaWRcblx0XHRcdC8vIHRoZSB0b29sYmFyLCBfZW5zdXJlVG9vbGJhciB3b3VsZCBoYXZlIGVhcmx5LWV4aXRlZDsgY3JlYXRlXG5cdFx0XHQvLyBpdCBub3cgdGhhdCBpdCBpcyB2aXNpYmxlLlxuXHRcdFx0aWYgKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0XHR0aGlzLl9lbnN1cmVUb29sYmFyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGRhdGEudnVsbnM/Lmxlbmd0aCAmJiBpc1Jlc3BvbnNlVk0oZGF0YS5lbGVtZW50KSkge1xuXHRcdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLnZ1bG5zTGlzdEVsZW1lbnQpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ25vLXZ1bG5zJyk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC12dWxuZXJhYmlsaXRpZXMtY29sbGFwc2VkJywgIWRhdGEuZWxlbWVudC52dWxuZXJhYmlsaXRpZXNMaXN0RXhwYW5kZWQpO1xuXHRcdFx0ZG9tLmFwcGVuZCh0aGlzLnZ1bG5zTGlzdEVsZW1lbnQsIC4uLmRhdGEudnVsbnMubWFwKHYgPT4gJCgnbGknLCB1bmRlZmluZWQsICQoJ3NwYW4uY2hhdC12dWxuLXRpdGxlJywgdW5kZWZpbmVkLCB2LnRpdGxlKSwgJyAnICsgdi5kZXNjcmlwdGlvbikpKTtcblx0XHRcdHRoaXMudnVsbnNCdXR0b24ubGFiZWwgPSB0aGlzLmdldFZ1bG5lcmFiaWxpdGllc0xhYmVsKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCduby12dWxucycpO1xuXHRcdH1cblxuXHRcdC8vIFJlc3RvcmUgdG9vbGJhciB2aXNpYmlsaXR5IGlmIHRoZSBlbGVtZW50IHdhcyBob3ZlcmVkIGJlZm9yZSByZS1yZW5kZXIuXG5cdFx0Ly8gRHVyaW5nIHN0cmVhbWluZywgY29kZSBibG9jayBlbGVtZW50cyBhcmUgYnJpZWZseSBkZXRhY2hlZCBmcm9tIGFuZFxuXHRcdC8vIHJlYXR0YWNoZWQgdG8gdGhlIERPTSwgd2hpY2ggY2F1c2VzIHRoZSBicm93c2VyIHRvIGxvc2UgQ1NTIDpob3ZlciBzdGF0ZS5cblx0XHQvLyBUaGUgZm9yY2UtdmlzaWJpbGl0eSBjbGFzcyBlbnN1cmVzIHRoZSB0b29sYmFyIHJlbWFpbnMgaW50ZXJhY3RpdmUuXG5cdFx0aWYgKHRoaXMuX2lzSG92ZXJlZCkge1xuXHRcdFx0dGhpcy5fdG9vbGJhckVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZm9yY2UtdmlzaWJpbGl0eScpO1xuXHRcdH1cblxuXHRcdHRoaXMubGF5b3V0KCk7XG5cblx0XHQvLyBUaGUgZWRpdG9yIGVsZW1lbnQgaXMgdHlwaWNhbGx5IG5vdCB5ZXQgY29ubmVjdGVkIHRvIHRoZSBsaXZlIERPTSBhdFxuXHRcdC8vIHRoaXMgcG9pbnQgKHRoZSBjYWxsZXIgc3RpbGwgbmVlZHMgdG8gYXR0YWNoIGl0KS4gQW55IHJlbmRlciBwYXNzXG5cdFx0Ly8gc2NoZWR1bGVkIGJ5IHNldFRleHQvc2V0TGFuZ3VhZ2UvbGF5b3V0IGlzIHNpbGVudGx5IGRyb3BwZWQgYnkgdGhlXG5cdFx0Ly8gZWRpdG9yIHZpZXcgd2hlbiBgaXNDb25uZWN0ZWRgIGlzIGZhbHNlLiBTY2hlZHVsZSBhIGRlZmVycmVkIHJlbmRlclxuXHRcdC8vIHNvIHRoZSB2aWV3IGxpbmVzIGFyZSBwYWludGVkIG9uY2UgdGhlIGVsZW1lbnQgaXMgaW4gdGhlIGRvY3VtZW50LlxuXHRcdHRoaXMuZWRpdG9yLnJlbmRlckFzeW5jKHRydWUpO1xuXHR9XG5cblx0cmVzZXQoKSB7XG5cdFx0dGhpcy5jbGVhcldpZGdldHMoKTtcblx0XHR0aGlzLmN1cnJlbnRDb2RlQmxvY2tEYXRhID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0b25EaWRSZW1vdW50KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmN1cnJlbnRDb2RlQmxvY2tEYXRhKSB7XG5cdFx0XHQvLyAhISEhXG5cdFx0XHQvLyBJbXBvcnRhbnQ6IGlmIHRoZSBlZGl0b3Igd2FzIG9mZi1kb20gYW5kIGlzIG5vdyBjb25uZWN0ZWQsIHdlIG5lZWQgdG8gcmUtcmVuZGVyIGl0XG5cdFx0XHQvLyAhISEhXG5cdFx0XHR0aGlzLmVkaXRvci5yZW5kZXJBc3luYyh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyV2lkZ2V0cygpIHtcblx0XHRDb250ZW50SG92ZXJDb250cm9sbGVyLmdldCh0aGlzLmVkaXRvcik/LmhpZGVDb250ZW50SG92ZXIoKTtcblx0XHRHbHlwaEhvdmVyQ29udHJvbGxlci5nZXQodGhpcy5lZGl0b3IpPy5oaWRlR2x5cGhIb3ZlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFZGl0b3IoZGF0YTogSUNvZGVCbG9ja0RhdGEpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkIHx8IHRoaXMuY3VycmVudENvZGVCbG9ja0RhdGEgIT09IGRhdGEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLnNldFRleHQoZGF0YS50ZXh0KTtcblx0XHR0aGlzLnNldExhbmd1YWdlKGRhdGEubGFuZ3VhZ2VJZCk7XG5cdFx0dGhpcy51cGRhdGVDb250ZXh0cyhkYXRhKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRWdWxuZXJhYmlsaXRpZXNMYWJlbCgpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5jdXJyZW50Q29kZUJsb2NrRGF0YSB8fCAhdGhpcy5jdXJyZW50Q29kZUJsb2NrRGF0YS52dWxucykge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlZmVyZW5jZXNMYWJlbCA9IHRoaXMuY3VycmVudENvZGVCbG9ja0RhdGEudnVsbnMubGVuZ3RoID4gMSA/XG5cdFx0XHRsb2NhbGl6ZSgndnVsbmVyYWJpbGl0aWVzUGx1cmFsJywgXCJ7MH0gdnVsbmVyYWJpbGl0aWVzXCIsIHRoaXMuY3VycmVudENvZGVCbG9ja0RhdGEudnVsbnMubGVuZ3RoKSA6XG5cdFx0XHRsb2NhbGl6ZSgndnVsbmVyYWJpbGl0aWVzU2luZ3VsYXInLCBcInswfSB2dWxuZXJhYmlsaXR5XCIsIDEpO1xuXHRcdGNvbnN0IGljb24gPSAoZWxlbWVudDogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCkgPT4gZWxlbWVudC52dWxuZXJhYmlsaXRpZXNMaXN0RXhwYW5kZWQgPyBDb2RpY29uLmNoZXZyb25Eb3duIDogQ29kaWNvbi5jaGV2cm9uUmlnaHQ7XG5cdFx0cmV0dXJuIGAke3JlZmVyZW5jZXNMYWJlbH0gJCgke2ljb24odGhpcy5jdXJyZW50Q29kZUJsb2NrRGF0YS5lbGVtZW50IGFzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwpLmlkfSlgO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb250ZXh0cyhkYXRhOiBJQ29kZUJsb2NrRGF0YSkge1xuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCF0ZXh0TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZXh0OiBJQ29kZUJsb2NrQWN0aW9uQ29udGV4dCA9IHtcblx0XHRcdGNvZGU6IHRleHRNb2RlbC5nZXRUZXh0QnVmZmVyKCkuZ2V0VmFsdWVJblJhbmdlKHRleHRNb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpLCBFbmRPZkxpbmVQcmVmZXJlbmNlLlRleHREZWZpbmVkKSxcblx0XHRcdGNvZGVCbG9ja0luZGV4OiBkYXRhLmNvZGVCbG9ja0luZGV4LFxuXHRcdFx0ZWxlbWVudDogZGF0YS5lbGVtZW50LFxuXHRcdFx0bGFuZ3VhZ2VJZDogdGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKSxcblx0XHRcdGNvZGVtYXBwZXJVcmk6IGRhdGEuY29kZW1hcHBlclVyaSxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IGRhdGEuY2hhdFNlc3Npb25SZXNvdXJjZVxuXHRcdH07XG5cdFx0aWYgKHRoaXMudG9vbGJhcikge1xuXHRcdFx0dGhpcy50b29sYmFyLmNvbnRleHQgPSBjb250ZXh0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nVG9vbGJhckNvbnRleHQgPSBjb250ZXh0O1xuXHRcdH1cblx0XHR0aGlzLnJlc291cmNlQ29udGV4dEtleS5zZXQodGV4dE1vZGVsLnVyaSk7XG5cdH1cblxuXHRwcml2YXRlIHNldFRleHQobmV3VGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudFRleHQgPSB0aGlzLl90ZXh0TW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRik7XG5cdFx0aWYgKG5ld1RleHQgPT09IGN1cnJlbnRUZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG5ld1RleHQuc3RhcnRzV2l0aChjdXJyZW50VGV4dCkpIHtcblx0XHRcdGNvbnN0IHRleHQgPSBuZXdUZXh0LnNsaWNlKGN1cnJlbnRUZXh0Lmxlbmd0aCk7XG5cdFx0XHRjb25zdCBsYXN0TGluZSA9IHRoaXMuX3RleHRNb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRcdGNvbnN0IGxhc3RDb2wgPSB0aGlzLl90ZXh0TW9kZWwuZ2V0TGluZU1heENvbHVtbihsYXN0TGluZSk7XG5cdFx0XHR0aGlzLl90ZXh0TW9kZWwuYXBwbHlFZGl0cyhbeyByYW5nZTogbmV3IFJhbmdlKGxhc3RMaW5lLCBsYXN0Q29sLCBsYXN0TGluZSwgbGFzdENvbCksIHRleHQgfV0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tDb2RlQmxvY2tQYXJ0XSBzZXRUZXh0IGNvdWxkIG5vdCBvcHRpbWl6ZSwgZmFsbGluZyBiYWNrIHRvIHNldFZhbHVlJyk7XG5cdFx0XHR0aGlzLl90ZXh0TW9kZWwuc2V0VmFsdWUobmV3VGV4dCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRMYW5ndWFnZShsYW5ndWFnZUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB2c2NvZGVMYW5ndWFnZUlkID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VJZEJ5TGFuZ3VhZ2VOYW1lKGxhbmd1YWdlSWQpO1xuXHRcdGlmICh2c2NvZGVMYW5ndWFnZUlkICYmIHZzY29kZUxhbmd1YWdlSWQgIT09IHRoaXMuX3RleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCkpIHtcblx0XHRcdHRoaXMuX3RleHRNb2RlbC5zZXRMYW5ndWFnZSh2c2NvZGVMYW5ndWFnZUlkKTtcblx0XHR9IGVsc2UgaWYgKCF2c2NvZGVMYW5ndWFnZUlkICYmIHRoaXMuX3RleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCkgIT09IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCkge1xuXHRcdFx0dGhpcy5fdGV4dE1vZGVsLnNldExhbmd1YWdlKFBMQUlOVEVYVF9MQU5HVUFHRV9JRCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0Q29kZUJsb2NrQ29udGVudFByb3ZpZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0ZXh0TW9kZWxTZXJ2aWNlLnJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKFNjaGVtYXMudnNjb2RlQ2hhdENvZGVCbG9jaywge1xuXHRcdFx0cHJvdmlkZVRleHRDb250ZW50OiAocmVzb3VyY2U6IFVSSSkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG4vL1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb2RlQ29tcGFyZUJsb2NrQWN0aW9uQ29udGV4dCB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWw7XG5cdHJlYWRvbmx5IGRpZmZFZGl0b3I6IElEaWZmRWRpdG9yO1xuXHRyZWFkb25seSBlZGl0OiBJQ2hhdFRleHRFZGl0R3JvdXA7XG5cdHRvZ2dsZURpZmZWaWV3TW9kZSgpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb2RlQ29tcGFyZUJsb2NrRGlmZkRhdGEge1xuXHRtb2RpZmllZDogSVRleHRNb2RlbDtcblx0b3JpZ2luYWw6IElUZXh0TW9kZWw7XG5cdG9yaWdpbmFsU2hhMTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb2RlQ29tcGFyZUJsb2NrRGF0YSB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IENoYXRUcmVlSXRlbTtcblxuXHRyZWFkb25seSBlZGl0OiBJQ2hhdFRleHRFZGl0R3JvdXA7XG5cblx0cmVhZG9ubHkgZGlmZkRhdGE6IFByb21pc2U8SUNvZGVDb21wYXJlQmxvY2tEaWZmRGF0YSB8IHVuZGVmaW5lZD47XG5cblx0cmVhZG9ubHkgcGFyZW50Q29udGV4dEtleVNlcnZpY2U/OiBJQ29udGV4dEtleVNlcnZpY2U7XG5cblx0cmVhZG9ubHkgaG9yaXpvbnRhbFBhZGRpbmc/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGlzUmVhZE9ubHk/OiBib29sZWFuO1xuXHQvLyByZWFkb25seSBoaWRlVG9vbGJhcj86IGJvb2xlYW47XG59XG5cblxuLy8gbG9uZy1saXZlZCBvYmplY3QgdGhhdCBzaXRzIGluIHRoZSBEaWZmUG9vbCBhbmQgdGhhdCBnZXRzIHJldXNlZFxuZXhwb3J0IGNsYXNzIENvZGVDb21wYXJlQmxvY2tQYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBkaWZmRWRpdG9yOiBEaWZmRWRpdG9yV2lkZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlc291cmNlTGFiZWw6IFJlc291cmNlTGFiZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9vbGJhcjogTWVudVdvcmtiZW5jaFRvb2xCYXI7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IG1lc3NhZ2VFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JIZWFkZXI6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhc3REaWZmRWRpdG9yVmlld01vZGVsID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBjdXJyZW50U2Nyb2xsV2lkdGggPSAwO1xuXHRwcml2YXRlIGN1cnJlbnRIb3Jpem9udGFsUGFkZGluZyA9IDA7XG5cblx0cHJpdmF0ZSBsYXN0TGF5b3V0V2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IENoYXRFZGl0b3JPcHRpb25zLFxuXHRcdHJlYWRvbmx5IG1lbnVJZDogTWVudUlkLFxuXHRcdGRlbGVnYXRlOiBJQ2hhdFJlbmRlcmVyRGVsZWdhdGUsXG5cdFx0b3ZlcmZsb3dXaWRnZXRzRG9tTm9kZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpc1NpbXBsZVdpZGdldDogYm9vbGVhbiA9IGZhbHNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmVsZW1lbnQgPSAkKCcuaW50ZXJhY3RpdmUtcmVzdWx0LWNvZGUtYmxvY2snKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY29tcGFyZScpO1xuXG5cdFx0dGhpcy5tZXNzYWdlRWxlbWVudCA9IGRvbS5hcHBlbmQodGhpcy5lbGVtZW50LCAkKCcubWVzc2FnZScpKTtcblx0XHR0aGlzLm1lc3NhZ2VFbGVtZW50LnNldEF0dHJpYnV0ZSgncm9sZScsICdzdGF0dXMnKTtcblx0XHR0aGlzLm1lc3NhZ2VFbGVtZW50LnRhYkluZGV4ID0gMDtcblxuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcihjb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5lbGVtZW50KSk7XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlXSxcblx0XHRcdFtJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLCBuZXcgY2xhc3MgaW1wbGVtZW50cyBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0XHRzaG93KF90b3RhbDogdW5rbm93biwgX2RlbGF5PzogdW5rbm93bikge1xuXHRcdFx0XHRcdHJldHVybiBlbXB0eVByb2dyZXNzUnVubmVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFzeW5jIHNob3dXaGlsZShwcm9taXNlOiBQcm9taXNlPHVua25vd24+LCBfZGVsYXk/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRhd2FpdCBwcm9taXNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XSxcblx0XHQpKSk7XG5cdFx0Y29uc3QgZWRpdG9ySGVhZGVyID0gdGhpcy5lZGl0b3JIZWFkZXIgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLmludGVyYWN0aXZlLXJlc3VsdC1oZWFkZXIuc2hvdy1maWxlLWljb25zJykpO1xuXHRcdGNvbnN0IGVkaXRvckVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLmludGVyYWN0aXZlLXJlc3VsdC1lZGl0b3InKSk7XG5cdFx0dGhpcy5kaWZmRWRpdG9yID0gdGhpcy5jcmVhdGVEaWZmRWRpdG9yKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLCBlZGl0b3JFbGVtZW50LCB7XG5cdFx0XHQuLi5nZXRTaW1wbGVFZGl0b3JPcHRpb25zKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpLFxuXHRcdFx0bGluZU51bWJlcnM6ICdvbicsXG5cdFx0XHRzZWxlY3RPbkxpbmVOdW1iZXJzOiB0cnVlLFxuXHRcdFx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IGZhbHNlLFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDEyLFxuXHRcdFx0ZHJhZ0FuZERyb3A6IGZhbHNlLFxuXHRcdFx0cGFkZGluZzogeyB0b3A6IGRlZmF1bHRDb2RlYmxvY2tQYWRkaW5nLCBib3R0b206IGRlZmF1bHRDb2RlYmxvY2tQYWRkaW5nIH0sXG5cdFx0XHRtb3VzZVdoZWVsWm9vbTogZmFsc2UsXG5cdFx0XHRzY3JvbGxiYXI6IHtcblx0XHRcdFx0dmVydGljYWw6ICdoaWRkZW4nLFxuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2Vcblx0XHRcdH0sXG5cdFx0XHRkZWZpbml0aW9uTGlua09wZW5zSW5QZWVrOiBmYWxzZSxcblx0XHRcdGdvdG9Mb2NhdGlvbjoge1xuXHRcdFx0XHRtdWx0aXBsZTogJ2dvdG8nLFxuXHRcdFx0XHRtdWx0aXBsZURlY2xhcmF0aW9uczogJ2dvdG8nLFxuXHRcdFx0XHRtdWx0aXBsZURlZmluaXRpb25zOiAnZ290bycsXG5cdFx0XHRcdG11bHRpcGxlSW1wbGVtZW50YXRpb25zOiAnZ290bycsXG5cdFx0XHR9LFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5jb2RlQmxvY2tIZWxwJywgJ0NvZGUgYmxvY2snKSxcblx0XHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsXG5cdFx0XHQuLi50aGlzLmdldEVkaXRvck9wdGlvbnNGcm9tQ29uZmlnKCksXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlc291cmNlTGFiZWwgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVsLCBlZGl0b3JIZWFkZXIsIHsgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IGVkaXRvclNjb3BlZFNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmRpZmZFZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKS5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoZWRpdG9ySGVhZGVyKSk7XG5cdFx0Y29uc3QgZWRpdG9yU2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgZWRpdG9yU2NvcGVkU2VydmljZV0pKSk7XG5cdFx0dGhpcy50b29sYmFyID0gdGhpcy5fcmVnaXN0ZXIoZWRpdG9yU2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGVkaXRvckhlYWRlciwgbWVudUlkLCB7XG5cdFx0XHRtZW51T3B0aW9uczoge1xuXHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2NvbmZpZ3VyZUZvclNjcmVlblJlYWRlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2Uub25EaWRDaGFuZ2VTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKCkgPT4gdGhpcy5fY29uZmlndXJlRm9yU2NyZWVuUmVhZGVyKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0ZWRLZXlzLmhhcyhBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkNoYXQpKSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyZUZvclNjcmVlblJlYWRlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub3B0aW9ucy5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmRpZmZFZGl0b3IudXBkYXRlT3B0aW9ucyh0aGlzLmdldEVkaXRvck9wdGlvbnNGcm9tQ29uZmlnKCkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGlmZkVkaXRvci5nZXRNb2RpZmllZEVkaXRvcigpLm9uRGlkU2Nyb2xsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0dGhpcy5jdXJyZW50U2Nyb2xsV2lkdGggPSBlLnNjcm9sbFdpZHRoO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRpZmZFZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKS5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2ZvY3VzZWQnKTtcblx0XHRcdFdvcmRIaWdobGlnaHRlckNvbnRyaWJ1dGlvbi5nZXQodGhpcy5kaWZmRWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCkpPy5zdG9wSGlnaGxpZ2h0aW5nKCk7XG5cdFx0XHR0aGlzLmNsZWFyV2lkZ2V0cygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRpZmZFZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKS5vbkRpZEZvY3VzRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdmb2N1c2VkJyk7XG5cdFx0XHRXb3JkSGlnaGxpZ2h0ZXJDb250cmlidXRpb24uZ2V0KHRoaXMuZGlmZkVkaXRvci5nZXRNb2RpZmllZEVkaXRvcigpKT8ucmVzdG9yZVZpZXdTdGF0ZSh0cnVlKTtcblx0XHR9KSk7XG5cblxuXHRcdC8vIFBhcmVudCBsaXN0IHNjcm9sbGVkXG5cdFx0aWYgKGRlbGVnYXRlLm9uRGlkU2Nyb2xsKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihkZWxlZ2F0ZS5vbkRpZFNjcm9sbChlID0+IHtcblx0XHRcdFx0dGhpcy5jbGVhcldpZGdldHMoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgdXJpKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZGlmZkVkaXRvci5nZXRNb2RpZmllZEVkaXRvcigpLmdldE1vZGVsKCk/LnVyaTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRGlmZkVkaXRvcihpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBwYXJlbnQ6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBSZWFkb25seTxJRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucz4pOiBEaWZmRWRpdG9yV2lkZ2V0IHtcblx0XHRjb25zdCB3aWRnZXRPcHRpb25zOiBJQ29kZUVkaXRvcldpZGdldE9wdGlvbnMgPSB7XG5cdFx0XHRpc1NpbXBsZVdpZGdldDogdGhpcy5pc1NpbXBsZVdpZGdldCxcblx0XHRcdGNvbnRyaWJ1dGlvbnM6IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRTb21lRWRpdG9yQ29udHJpYnV0aW9ucyhbXG5cdFx0XHRcdE1lbnVQcmV2ZW50ZXIuSUQsXG5cdFx0XHRcdFNlbGVjdGlvbkNsaXBib2FyZENvbnRyaWJ1dGlvbklELFxuXHRcdFx0XHRDb250ZXh0TWVudUNvbnRyb2xsZXIuSUQsXG5cblx0XHRcdFx0V29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uLklELFxuXHRcdFx0XHRWaWV3cG9ydFNlbWFudGljVG9rZW5zQ29udHJpYnV0aW9uLklELFxuXHRcdFx0XHRCcmFja2V0TWF0Y2hpbmdDb250cm9sbGVyLklELFxuXHRcdFx0XHRTbWFydFNlbGVjdENvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdENvbnRlbnRIb3ZlckNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdEdseXBoSG92ZXJDb250cm9sbGVyLklELFxuXHRcdFx0XHRHb3RvRGVmaW5pdGlvbkF0UG9zaXRpb25FZGl0b3JDb250cmlidXRpb24uSUQsXG5cdFx0XHRdKVxuXHRcdH07XG5cblx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlmZkVkaXRvcldpZGdldCwgcGFyZW50LCB7XG5cdFx0XHRzY3JvbGxiYXI6IHsgdXNlU2hhZG93czogZmFsc2UsIGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiBmYWxzZSwgaWdub3JlSG9yaXpvbnRhbFNjcm9sbGJhckluQ29udGVudEhlaWdodDogdHJ1ZSwgfSxcblx0XHRcdHJlbmRlck1hcmdpblJldmVydEljb246IGZhbHNlLFxuXHRcdFx0ZGlmZkNvZGVMZW5zOiBmYWxzZSxcblx0XHRcdHNjcm9sbEJleW9uZExhc3RMaW5lOiBmYWxzZSxcblx0XHRcdHN0aWNreVNjcm9sbDogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0b3JpZ2luYWxBcmlhTGFiZWw6IGxvY2FsaXplKCdvcmlnaW5hbCcsICdPcmlnaW5hbCcpLFxuXHRcdFx0bW9kaWZpZWRBcmlhTGFiZWw6IGxvY2FsaXplKCdtb2RpZmllZCcsICdNb2RpZmllZCcpLFxuXHRcdFx0ZGlmZkFsZ29yaXRobTogJ2FkdmFuY2VkJyxcblx0XHRcdHJlYWRPbmx5OiBmYWxzZSxcblx0XHRcdGlzSW5FbWJlZGRlZEVkaXRvcjogdHJ1ZSxcblx0XHRcdHVzZUlubGluZVZpZXdXaGVuU3BhY2VJc0xpbWl0ZWQ6IHRydWUsXG5cdFx0XHRleHBlcmltZW50YWw6IHtcblx0XHRcdFx0dXNlVHJ1ZUlubGluZVZpZXc6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0cmVuZGVyU2lkZUJ5U2lkZUlubGluZUJyZWFrcG9pbnQ6IDMwMCxcblx0XHRcdHJlbmRlck92ZXJ2aWV3UnVsZXI6IGZhbHNlLFxuXHRcdFx0Y29tcGFjdE1vZGU6IHRydWUsXG5cdFx0XHRoaWRlVW5jaGFuZ2VkUmVnaW9uczogeyBlbmFibGVkOiB0cnVlLCBjb250ZXh0TGluZUNvdW50OiAxIH0sXG5cdFx0XHRyZW5kZXJHdXR0ZXJNZW51OiBmYWxzZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDEsXG5cdFx0XHQuLi5vcHRpb25zXG5cdFx0fSwgeyBvcmlnaW5hbEVkaXRvcjogd2lkZ2V0T3B0aW9ucywgbW9kaWZpZWRFZGl0b3I6IHdpZGdldE9wdGlvbnMgfSkpO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5kaWZmRWRpdG9yLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVBhZGRpbmdGb3JMYXlvdXQoKSB7XG5cdFx0Ly8gc2Nyb2xsV2lkdGggPSBcInRoZSB3aWR0aCBvZiB0aGUgY29udGVudCB0aGF0IG5lZWRzIHRvIGJlIHNjcm9sbGVkXCJcblx0XHQvLyBjb250ZW50V2lkdGggPSBcInRoZSB3aWR0aCBvZiB0aGUgYXJlYSB3aGVyZSBjb250ZW50IGlzIGRpc3BsYXllZFwiXG5cdFx0Y29uc3QgaG9yaXpvbnRhbFNjcm9sbGJhclZpc2libGUgPSB0aGlzLmN1cnJlbnRTY3JvbGxXaWR0aCA+IHRoaXMuZGlmZkVkaXRvci5nZXRNb2RpZmllZEVkaXRvcigpLmdldExheW91dEluZm8oKS5jb250ZW50V2lkdGg7XG5cdFx0Y29uc3Qgc2Nyb2xsYmFySGVpZ2h0ID0gdGhpcy5kaWZmRWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCkuZ2V0TGF5b3V0SW5mbygpLmhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ7XG5cdFx0Y29uc3QgYm90dG9tUGFkZGluZyA9IGhvcml6b250YWxTY3JvbGxiYXJWaXNpYmxlID9cblx0XHRcdE1hdGgubWF4KGRlZmF1bHRDb2RlYmxvY2tQYWRkaW5nIC0gc2Nyb2xsYmFySGVpZ2h0LCAyKSA6XG5cdFx0XHRkZWZhdWx0Q29kZWJsb2NrUGFkZGluZztcblx0XHR0aGlzLmRpZmZFZGl0b3IudXBkYXRlT3B0aW9ucyh7IHBhZGRpbmc6IHsgdG9wOiBkZWZhdWx0Q29kZWJsb2NrUGFkZGluZywgYm90dG9tOiBib3R0b21QYWRkaW5nIH0gfSk7XG5cdH1cblxuXHRwcml2YXRlIF9jb25maWd1cmVGb3JTY3JlZW5SZWFkZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgdG9vbGJhckVsdCA9IHRoaXMudG9vbGJhci5nZXRFbGVtZW50KCk7XG5cdFx0Ly8gQWx3YXlzIHNob3cgdG9vbGJhciwgYnV0IGFkZCBhcmlhLWxhYmVsIGZvciBzY3JlZW4gcmVhZGVyc1xuXHRcdHRvb2xiYXJFbHQuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0aWYgKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0dG9vbGJhckVsdC5hcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5jb2RlQmxvY2sudG9vbGJhcicsICdDb2RlIGJsb2NrIHRvb2xiYXInKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEVkaXRvck9wdGlvbnNGcm9tQ29uZmlnKCk6IElFZGl0b3JPcHRpb25zIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0d29yZFdyYXA6IHRoaXMub3B0aW9ucy5jb25maWd1cmF0aW9uLnJlc3VsdEVkaXRvci53b3JkV3JhcCxcblx0XHRcdGZvbnRMaWdhdHVyZXM6IHRoaXMub3B0aW9ucy5jb25maWd1cmF0aW9uLnJlc3VsdEVkaXRvci5mb250TGlnYXR1cmVzLFxuXHRcdFx0YnJhY2tldFBhaXJDb2xvcml6YXRpb246IHRoaXMub3B0aW9ucy5jb25maWd1cmF0aW9uLnJlc3VsdEVkaXRvci5icmFja2V0UGFpckNvbG9yaXphdGlvbixcblx0XHRcdGZvbnRGYW1pbHk6IHRoaXMub3B0aW9ucy5jb25maWd1cmF0aW9uLnJlc3VsdEVkaXRvci5mb250RmFtaWx5ID09PSAnZGVmYXVsdCcgP1xuXHRcdFx0XHRFRElUT1JfRk9OVF9ERUZBVUxUUy5mb250RmFtaWx5IDpcblx0XHRcdFx0dGhpcy5vcHRpb25zLmNvbmZpZ3VyYXRpb24ucmVzdWx0RWRpdG9yLmZvbnRGYW1pbHksXG5cdFx0XHRmb250U2l6ZTogdGhpcy5vcHRpb25zLmNvbmZpZ3VyYXRpb24ucmVzdWx0RWRpdG9yLmZvbnRTaXplLFxuXHRcdFx0Zm9udFdlaWdodDogdGhpcy5vcHRpb25zLmNvbmZpZ3VyYXRpb24ucmVzdWx0RWRpdG9yLmZvbnRXZWlnaHQsXG5cdFx0XHRsaW5lSGVpZ2h0OiB0aGlzLm9wdGlvbnMuY29uZmlndXJhdGlvbi5yZXN1bHRFZGl0b3IubGluZUhlaWdodCxcblx0XHR9O1xuXHR9XG5cblx0bGF5b3V0KHdpZHRoID0gdGhpcy5sYXN0TGF5b3V0V2lkdGgpOiB2b2lkIHtcblx0XHRpZiAod2lkdGggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuOyAvLyBub3QgeWV0IGluIERPTVxuXHRcdH1cblxuXHRcdHRoaXMubGFzdExheW91dFdpZHRoID0gd2lkdGg7XG5cblx0XHRjb25zdCBlZGl0b3JCb3JkZXIgPSAyO1xuXG5cdFx0Y29uc3QgdG9vbGJhciA9IGRvbS5nZXRUb3RhbEhlaWdodCh0aGlzLmVkaXRvckhlYWRlcik7XG5cdFx0Y29uc3QgY29udGVudCA9IHRoaXMuZGlmZkVkaXRvci5nZXRNb2RlbCgpXG5cdFx0XHQ/IHRoaXMuZGlmZkVkaXRvci5nZXRDb250ZW50SGVpZ2h0KClcblx0XHRcdDogZG9tLmdldFRvdGFsSGVpZ2h0KHRoaXMubWVzc2FnZUVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgZGltZW5zaW9uID0gbmV3IGRvbS5EaW1lbnNpb24od2lkdGggLSBlZGl0b3JCb3JkZXIgLSB0aGlzLmN1cnJlbnRIb3Jpem9udGFsUGFkZGluZyAqIDIsIHRvb2xiYXIgKyBjb250ZW50KTtcblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUud2lkdGggPSBgJHtkaW1lbnNpb24ud2lkdGh9cHhgO1xuXHRcdHRoaXMuZGlmZkVkaXRvci5sYXlvdXQoZGltZW5zaW9uLndpdGgodW5kZWZpbmVkLCBjb250ZW50IC0gZWRpdG9yQm9yZGVyKSk7XG5cdFx0dGhpcy51cGRhdGVQYWRkaW5nRm9yTGF5b3V0KCk7XG5cdH1cblxuXG5cdGFzeW5jIHJlbmRlcihkYXRhOiBJQ29kZUNvbXBhcmVCbG9ja0RhdGEsIHdpZHRoOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdHRoaXMuY3VycmVudEhvcml6b250YWxQYWRkaW5nID0gZGF0YS5ob3Jpem9udGFsUGFkZGluZyB8fCAwO1xuXG5cdFx0aWYgKGRhdGEucGFyZW50Q29udGV4dEtleVNlcnZpY2UpIHtcblx0XHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UudXBkYXRlUGFyZW50KGRhdGEucGFyZW50Q29udGV4dEtleVNlcnZpY2UpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9wdGlvbnMuY29uZmlndXJhdGlvbi5yZXN1bHRFZGl0b3Iud29yZFdyYXAgPT09ICdvbicpIHtcblx0XHRcdC8vIEluaXRpYWxpemUgdGhlIGVkaXRvciB3aXRoIHRoZSBuZXcgcHJvcGVyIHdpZHRoIHNvIHRoYXQgZ2V0Q29udGVudEhlaWdodFxuXHRcdFx0Ly8gd2lsbCBiZSBjb21wdXRlZCBjb3JyZWN0bHkgaW4gdGhlIG5leHQgY2FsbCB0byBsYXlvdXQoKVxuXHRcdFx0dGhpcy5sYXlvdXQod2lkdGgpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMudXBkYXRlRWRpdG9yKGRhdGEsIHRva2VuKTtcblxuXHRcdHRoaXMubGF5b3V0KHdpZHRoKTtcblx0XHR0aGlzLmRpZmZFZGl0b3IudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdjaGF0LmNvbXBhcmVDb2RlQmxvY2tMYWJlbCcsIFwiQ29kZSBFZGl0c1wiKSxcblx0XHRcdHJlYWRPbmx5OiAhIWRhdGEuaXNSZWFkT25seSxcblx0XHR9KTtcblxuXHRcdHRoaXMucmVzb3VyY2VMYWJlbC5lbGVtZW50LnNldEZpbGUoZGF0YS5lZGl0LnVyaSwge1xuXHRcdFx0ZmlsZUtpbmQ6IEZpbGVLaW5kLkZJTEUsXG5cdFx0XHRmaWxlRGVjb3JhdGlvbnM6IHsgY29sb3JzOiB0cnVlLCBiYWRnZXM6IGZhbHNlIH1cblx0XHR9KTtcblx0fVxuXG5cdHJlc2V0KCkge1xuXHRcdHRoaXMuY2xlYXJXaWRnZXRzKCk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyV2lkZ2V0cygpIHtcblx0XHRDb250ZW50SG92ZXJDb250cm9sbGVyLmdldCh0aGlzLmRpZmZFZGl0b3IuZ2V0T3JpZ2luYWxFZGl0b3IoKSk/LmhpZGVDb250ZW50SG92ZXIoKTtcblx0XHRDb250ZW50SG92ZXJDb250cm9sbGVyLmdldCh0aGlzLmRpZmZFZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKSk/LmhpZGVDb250ZW50SG92ZXIoKTtcblx0XHRHbHlwaEhvdmVyQ29udHJvbGxlci5nZXQodGhpcy5kaWZmRWRpdG9yLmdldE9yaWdpbmFsRWRpdG9yKCkpPy5oaWRlR2x5cGhIb3ZlcigpO1xuXHRcdEdseXBoSG92ZXJDb250cm9sbGVyLmdldCh0aGlzLmRpZmZFZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKSk/LmhpZGVHbHlwaEhvdmVyKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUVkaXRvcihkYXRhOiBJQ29kZUNvbXBhcmVCbG9ja0RhdGEsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0aWYgKCFpc1Jlc3BvbnNlVk0oZGF0YS5lbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzRWRpdEFwcGxpZWQgPSBCb29sZWFuKGRhdGEuZWRpdC5zdGF0ZT8uYXBwbGllZCA/PyAwKTtcblxuXHRcdENoYXRDb250ZXh0S2V5cy5lZGl0QXBwbGllZC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSkuc2V0KGlzRWRpdEFwcGxpZWQpO1xuXG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ25vLWRpZmYnLCBpc0VkaXRBcHBsaWVkKTtcblxuXHRcdGlmIChpc0VkaXRBcHBsaWVkKSB7XG5cdFx0XHRhc3NlcnRUeXBlKGRhdGEuZWRpdC5zdGF0ZT8uYXBwbGllZCk7XG5cblx0XHRcdGNvbnN0IHVyaUxhYmVsID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZGF0YS5lZGl0LnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSwgbm9QcmVmaXg6IHRydWUgfSk7XG5cblx0XHRcdGxldCB0ZW1wbGF0ZTogc3RyaW5nO1xuXHRcdFx0aWYgKGRhdGEuZWRpdC5zdGF0ZS5hcHBsaWVkID09PSAxKSB7XG5cdFx0XHRcdHRlbXBsYXRlID0gbG9jYWxpemUoJ2NoYXQuZWRpdHMuMScsIFwiQXBwbGllZCAxIGNoYW5nZSBpbiBbW2BgezB9YGBdXVwiLCB1cmlMYWJlbCk7XG5cdFx0XHR9IGVsc2UgaWYgKGRhdGEuZWRpdC5zdGF0ZS5hcHBsaWVkIDwgMCkge1xuXHRcdFx0XHR0ZW1wbGF0ZSA9IGxvY2FsaXplKCdjaGF0LmVkaXRzLnJlamVjdGVkJywgXCJFZGl0cyBpbiBbW2BgezB9YGBdXSBoYXZlIGJlZW4gcmVqZWN0ZWRcIiwgdXJpTGFiZWwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGVtcGxhdGUgPSBsb2NhbGl6ZSgnY2hhdC5lZGl0cy5OJywgXCJBcHBsaWVkIHswfSBjaGFuZ2VzIGluIFtbYGB7MX1gYF1dXCIsIGRhdGEuZWRpdC5zdGF0ZS5hcHBsaWVkLCB1cmlMYWJlbCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSByZW5kZXJGb3JtYXR0ZWRUZXh0KHRlbXBsYXRlLCB7XG5cdFx0XHRcdHJlbmRlckNvZGVTZWdtZW50czogdHJ1ZSxcblx0XHRcdFx0YWN0aW9uSGFuZGxlcjoge1xuXHRcdFx0XHRcdGNhbGxiYWNrOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihkYXRhLmVkaXQudXJpLCB7IGZyb21Vc2VyR2VzdHVyZTogdHJ1ZSwgYWxsb3dDb21tYW5kczogZmFsc2UgfSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRkaXNwb3NhYmxlczogdGhpcy5fc3RvcmUsXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRkb20ucmVzZXQodGhpcy5tZXNzYWdlRWxlbWVudCwgbWVzc2FnZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlmZkRhdGEgPSBhd2FpdCBkYXRhLmRpZmZEYXRhO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghaXNFZGl0QXBwbGllZCAmJiBkaWZmRGF0YSkge1xuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5kaWZmRWRpdG9yLmNyZWF0ZVZpZXdNb2RlbCh7XG5cdFx0XHRcdG9yaWdpbmFsOiBkaWZmRGF0YS5vcmlnaW5hbCxcblx0XHRcdFx0bW9kaWZpZWQ6IGRpZmZEYXRhLm1vZGlmaWVkXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgdmlld01vZGVsLndhaXRGb3JEaWZmKCk7XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gRXZlbnQuYW55KGRpZmZEYXRhLm9yaWdpbmFsLm9uV2lsbERpc3Bvc2UsIGRpZmZEYXRhLm1vZGlmaWVkLm9uV2lsbERpc3Bvc2UpKCgpID0+IHtcblx0XHRcdFx0Ly8gdGhpcyBhIGJpdCB3ZWlyZCBhbmQgYmFzaWNhbGx5IGR1cGxpY2F0ZXMgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvYmxvYi83Y2JjYWZjYmNjODgyOThjZmRjZDAyMzgwMThmYmJiYThlYjY4NTNlL3NyYy92cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9kaWZmRWRpdG9yV2lkZ2V0LnRzI0wzMjhcblx0XHRcdFx0Ly8gd2hpY2ggY2Fubm90IGNhbGwgYHNldE1vZGVsKG51bGwpYCB3aXRob3V0IGZpcnN0IGNvbXBsYWluaW5nXG5cdFx0XHRcdHRoaXMuZGlmZkVkaXRvci5zZXRNb2RlbChudWxsKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5kaWZmRWRpdG9yLnNldE1vZGVsKHZpZXdNb2RlbCk7XG5cdFx0XHR0aGlzLl9sYXN0RGlmZkVkaXRvclZpZXdNb2RlbC52YWx1ZSA9IGNvbWJpbmVkRGlzcG9zYWJsZShsaXN0ZW5lciwgdmlld01vZGVsKTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRpZmZFZGl0b3Iuc2V0TW9kZWwobnVsbCk7XG5cdFx0XHR0aGlzLl9sYXN0RGlmZkVkaXRvclZpZXdNb2RlbC52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLnRvb2xiYXIuY29udGV4dCA9IHtcblx0XHRcdGVkaXQ6IGRhdGEuZWRpdCxcblx0XHRcdGVsZW1lbnQ6IGRhdGEuZWxlbWVudCxcblx0XHRcdGRpZmZFZGl0b3I6IHRoaXMuZGlmZkVkaXRvcixcblx0XHRcdHRvZ2dsZURpZmZWaWV3TW9kZTogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpc0N1cnJlbnRseUlubGluZSA9ICEhdGhpcy5kaWZmRWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCkuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKEVkaXRvckNvbnRleHRLZXlzLmRpZmZFZGl0b3JJbmxpbmVNb2RlLmtleSk7XG5cdFx0XHRcdGNvbnN0IHJlbmRlclNpZGVCeVNpZGUgPSBpc0N1cnJlbnRseUlubGluZTtcblx0XHRcdFx0dGhpcy5kaWZmRWRpdG9yLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRcdHJlbmRlclNpZGVCeVNpZGUsXG5cdFx0XHRcdFx0Ly8gTWFrZSBpdCBub3QtY29tcGFjdCBpbiBzaWRlIGJ5IHNpZGUgbW9kZSwgb3RoZXJ3aXNlIHdlIG1heSBub3QgYWN0dWFsbHlcblx0XHRcdFx0XHQvLyBzaG93IGl0IHNpZGUtYnktc2lkZSBpZiBpdCdzIGEgc2ltcGxlIGRpZmYgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvYmxvYi8wNjMyNTYzMzMyYzdjMDg2NTZmYjQ3Yzk3YmM0MzI4ZDYyZWUxZDgwL3NyYy92cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9kaWZmRWRpdG9yT3B0aW9ucy50cyNMMzUtTDM5XG5cdFx0XHRcdFx0Y29tcGFjdE1vZGU6ICFyZW5kZXJTaWRlQnlTaWRlLFxuXHRcdFx0XHRcdHVzZUlubGluZVZpZXdXaGVuU3BhY2VJc0xpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5sYXlvdXQoKTtcblx0XHRcdH0sXG5cdFx0fSBzYXRpc2ZpZXMgSUNvZGVDb21wYXJlQmxvY2tBY3Rpb25Db250ZXh0O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWZhdWx0Q2hhdFRleHRFZGl0b3Ige1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NoYTEgPSBuZXcgRGVmYXVsdE1vZGVsU0hBMUNvbXB1dGVyKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIGFwcGx5KHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlTW9kZWwgfCBJQ2hhdFJlc3BvbnNlVmlld01vZGVsLCBpdGVtOiBJQ2hhdFRleHRFZGl0R3JvdXAsIGRpZmZFZGl0b3I6IElEaWZmRWRpdG9yIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRpZiAoIXJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlLmluY2x1ZGVzKGl0ZW0pKSB7XG5cdFx0XHQvLyBib2dvdXMgaXRlbVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpdGVtLnN0YXRlPy5hcHBsaWVkKSB7XG5cdFx0XHQvLyBhbHJlYWR5IGFwcGxpZWRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWRpZmZFZGl0b3IpIHtcblx0XHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHRoaXMuZWRpdG9yU2VydmljZS5saXN0RGlmZkVkaXRvcnMoKSkge1xuXHRcdFx0XHRpZiAoIWNhbmRpZGF0ZS5nZXRDb250YWluZXJEb21Ob2RlKCkuaXNDb25uZWN0ZWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtb2RlbCA9IGNhbmRpZGF0ZS5nZXRNb2RlbCgpO1xuXHRcdFx0XHRpZiAoIW1vZGVsIHx8ICFpc0VxdWFsKG1vZGVsLm9yaWdpbmFsLnVyaSwgaXRlbS51cmkpIHx8IG1vZGVsLm1vZGlmaWVkLnVyaS5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlQ2hhdENvZGVDb21wYXJlQmxvY2spIHtcblx0XHRcdFx0XHRkaWZmRWRpdG9yID0gY2FuZGlkYXRlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdHMgPSBkaWZmRWRpdG9yXG5cdFx0XHQ/IGF3YWl0IHRoaXMuX2FwcGx5V2l0aERpZmZFZGl0b3IoZGlmZkVkaXRvciwgaXRlbSlcblx0XHRcdDogYXdhaXQgdGhpcy5fYXBwbHkoaXRlbSk7XG5cblx0XHRyZXNwb25zZS5zZXRFZGl0QXBwbGllZChpdGVtLCBlZGl0cyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHBseVdpdGhEaWZmRWRpdG9yKGRpZmZFZGl0b3I6IElEaWZmRWRpdG9yLCBpdGVtOiBJQ2hhdFRleHRFZGl0R3JvdXApIHtcblx0XHRjb25zdCBtb2RlbCA9IGRpZmZFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRjb25zdCBkaWZmID0gZGlmZkVkaXRvci5nZXREaWZmQ29tcHV0YXRpb25SZXN1bHQoKTtcblx0XHRpZiAoIWRpZmYgfHwgZGlmZi5pZGVudGljYWwpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXG5cdFx0aWYgKCFhd2FpdCB0aGlzLl9jaGVja1NoYTEobW9kZWwub3JpZ2luYWwsIGl0ZW0pKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RpZmllZCA9IG5ldyBUZXh0TW9kZWxUZXh0KG1vZGVsLm1vZGlmaWVkKTtcblx0XHRjb25zdCBlZGl0cyA9IGRpZmYuY2hhbmdlczIubWFwKGkgPT4gaS50b1JhbmdlTWFwcGluZygpLnRvVGV4dEVkaXQobW9kaWZpZWQpLnRvU2luZ2xlRWRpdE9wZXJhdGlvbigpKTtcblxuXHRcdG1vZGVsLm9yaWdpbmFsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRtb2RlbC5vcmlnaW5hbC5wdXNoRWRpdE9wZXJhdGlvbnMobnVsbCwgZWRpdHMsICgpID0+IG51bGwpO1xuXHRcdG1vZGVsLm9yaWdpbmFsLnB1c2hTdGFja0VsZW1lbnQoKTtcblxuXHRcdHJldHVybiBlZGl0cy5sZW5ndGg7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHBseShpdGVtOiBJQ2hhdFRleHRFZGl0R3JvdXApIHtcblx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShpdGVtLnVyaSk7XG5cdFx0dHJ5IHtcblxuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9jaGVja1NoYTEocmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwsIGl0ZW0pKSB7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXG5cdFx0XHRyZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0XHRsZXQgdG90YWwgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBpdGVtLmVkaXRzKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRzID0gZ3JvdXAubWFwKFRleHRFZGl0LmFzRWRpdE9wZXJhdGlvbik7XG5cdFx0XHRcdHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhudWxsLCBlZGl0cywgKCkgPT4gbnVsbCk7XG5cdFx0XHRcdHRvdGFsICs9IGVkaXRzLmxlbmd0aDtcblx0XHRcdH1cblx0XHRcdHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdHJldHVybiB0b3RhbDtcblxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NoZWNrU2hhMShtb2RlbDogSVRleHRNb2RlbCwgaXRlbTogSUNoYXRUZXh0RWRpdEdyb3VwKSB7XG5cdFx0aWYgKGl0ZW0uc3RhdGU/LnNoYTEgJiYgdGhpcy5fc2hhMS5jb21wdXRlU0hBMShtb2RlbCkgJiYgdGhpcy5fc2hhMS5jb21wdXRlU0hBMShtb2RlbCkgIT09IGl0ZW0uc3RhdGUuc2hhMSkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnaW50ZXJhY3RpdmUuY29tcGFyZS5hcHBseS5jb25maXJtJywgXCJUaGUgb3JpZ2luYWwgZmlsZSBoYXMgYmVlbiBtb2RpZmllZC5cIiksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2ludGVyYWN0aXZlLmNvbXBhcmUuYXBwbHkuY29uZmlybS5kZXRhaWwnLCBcIkRvIHlvdSB3YW50IHRvIGFwcGx5IHRoZSBjaGFuZ2VzIGFueXdheT9cIiksXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKCFyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRkaXNjYXJkKHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlTW9kZWwgfCBJQ2hhdFJlc3BvbnNlVmlld01vZGVsLCBpdGVtOiBJQ2hhdFRleHRFZGl0R3JvdXApIHtcblx0XHRpZiAoIXJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlLmluY2x1ZGVzKGl0ZW0pKSB7XG5cdFx0XHQvLyBib2dvdXMgaXRlbVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpdGVtLnN0YXRlPy5hcHBsaWVkKSB7XG5cdFx0XHQvLyBhbHJlYWR5IGFwcGxpZWRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXNwb25zZS5zZXRFZGl0QXBwbGllZChpdGVtLCAtMSk7XG5cdH1cblxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFFUCxZQUFZLFNBQVM7QUFD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
