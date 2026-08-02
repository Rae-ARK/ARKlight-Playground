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
import "./media/scm.css";
import { Event, Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { append, $, Dimension, trackFocus } from "../../../../base/browser/dom.js";
import { InputValidationType, ISCMViewService, SCMInputChangeReason } from "../common/scm.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IContextViewService, IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IContextKeyService, ContextKeyExpr, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { MenuItemAction, IMenuService, registerAction2, MenuId, Action2 } from "../../../../platform/actions/common/actions.js";
import { ActionRunner, Action } from "../../../../base/common/actions.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { IConfigurationService, ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { ThrottledDelayer } from "../../../../base/common/async.js";
import { localize } from "../../../../nls.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { getSimpleEditorOptions, setupSimpleEditorSelectionStyling } from "../../codeEditor/browser/simpleEditorOptions.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { MenuPreventer } from "../../codeEditor/browser/menuPreventer.js";
import { SelectionClipboardContributionID } from "../../codeEditor/browser/selectionClipboard.js";
import { EditorDictation } from "../../codeEditor/browser/dictation/editorDictation.js";
import { ContextMenuController } from "../../../../editor/contrib/contextmenu/browser/contextmenu.js";
import * as platform from "../../../../base/common/platform.js";
import { format } from "../../../../base/common/strings.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { SnippetController2 } from "../../../../editor/contrib/snippet/browser/snippetController2.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { ColorDetector } from "../../../../editor/contrib/colorPicker/browser/colorDetector.js";
import { LinkDetector } from "../../../../editor/contrib/links/browser/links.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DEFAULT_FONT_FAMILY } from "../../../../base/browser/fonts.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { AnchorAlignment } from "../../../../base/browser/ui/contextview/contextview.js";
import { createActionViewItem, getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMarkdownRendererService, openLinkFromMarkdown } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { DragAndDropController } from "../../../../editor/contrib/dnd/browser/dnd.js";
import { CopyPasteController } from "../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js";
import { DropIntoEditorController } from "../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js";
import { MessageController } from "../../../../editor/contrib/message/browser/messageController.js";
import { InlineCompletionsController } from "../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js";
import { CodeActionController } from "../../../../editor/contrib/codeAction/browser/codeActionController.js";
import { FormatOnType } from "../../../../editor/contrib/format/browser/formatActions.js";
import { EditorOption, EditorOptions } from "../../../../editor/common/config/editorOptions.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { HiddenItemStrategy, WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { DropdownWithPrimaryActionViewItem } from "../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js";
import { clamp } from "../../../../base/common/numbers.js";
import { ContentHoverController } from "../../../../editor/contrib/hover/browser/contentHoverController.js";
import { GlyphHoverController } from "../../../../editor/contrib/hover/browser/glyphHoverController.js";
import { autorun, runOnChange } from "../../../../base/common/observable.js";
import { PlaceholderTextContribution } from "../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import product from "../../../../platform/product/common/product.js";
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from "../../chat/browser/actions/chatActions.js";
const SCMInputContextKeys = {
  SCMInputHasValidationMessage: new RawContextKey("scmInputHasValidationMessage", false)
};
var SCMInputWidgetCommandId = /* @__PURE__ */ ((SCMInputWidgetCommandId2) => {
  SCMInputWidgetCommandId2["CancelAction"] = "scm.input.cancelAction";
  SCMInputWidgetCommandId2["SetupAction"] = "scm.input.triggerSetup";
  return SCMInputWidgetCommandId2;
})(SCMInputWidgetCommandId || {});
var SCMInputWidgetStorageKey = /* @__PURE__ */ ((SCMInputWidgetStorageKey2) => {
  SCMInputWidgetStorageKey2["LastActionId"] = "scm.input.lastActionId";
  return SCMInputWidgetStorageKey2;
})(SCMInputWidgetStorageKey || {});
let SCMInputWidgetActionRunner = class extends ActionRunner {
  constructor(input, storageService) {
    super();
    this.input = input;
    this.storageService = storageService;
    this._runningActions = /* @__PURE__ */ new Set();
  }
  get runningActions() {
    return this._runningActions;
  }
  async runAction(action) {
    try {
      if (this.runningActions.size !== 0) {
        this._cts?.cancel();
        if (action.id === "scm.input.cancelAction" /* CancelAction */) {
          return;
        }
      }
      const context = [];
      for (const group of this.input.repository.provider.groups) {
        context.push({
          resourceGroupId: group.id,
          resources: [...group.resources.map((r) => r.sourceUri)]
        });
      }
      this._runningActions.add(action);
      this._cts = new CancellationTokenSource();
      await action.run(...[this.input.repository.provider.rootUri, context, this._cts.token]);
    } finally {
      this._runningActions.delete(action);
      if (this._runningActions.size === 0) {
        const actionId = action.id === "scm.input.triggerSetup" /* SetupAction */ ? product.defaultChatAgent?.generateCommitMessageCommand ?? action.id : action.id;
        this.storageService.store("scm.input.lastActionId" /* LastActionId */, actionId, StorageScope.PROFILE, StorageTarget.USER);
      }
    }
  }
};
SCMInputWidgetActionRunner = __decorateClass([
  __decorateParam(1, IStorageService)
], SCMInputWidgetActionRunner);
let SCMInputWidgetToolbar = class extends WorkbenchToolBar {
  constructor(container, options, menuService, contextKeyService, contextMenuService, commandService, keybindingService, storageService, telemetryService) {
    super(container, options, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService);
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.storageService = storageService;
    this._dropdownActions = [];
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._disposables = this._register(new MutableDisposable());
    this._dropdownAction = new Action(
      "scmInputMoreActions",
      localize("scmInputMoreActions", "More Actions..."),
      "codicon-chevron-down"
    );
    this._cancelAction = new MenuItemAction({
      id: "scm.input.cancelAction" /* CancelAction */,
      title: localize("scmInputCancelAction", "Cancel"),
      icon: Codicon.stopCircle
    }, void 0, void 0, void 0, void 0, contextKeyService, commandService);
  }
  get dropdownActions() {
    return this._dropdownActions;
  }
  get dropdownAction() {
    return this._dropdownAction;
  }
  setInput(input) {
    this._disposables.value = new DisposableStore();
    const contextKeyService = this.contextKeyService.createOverlay([
      ["scmProvider", input.repository.provider.providerId],
      ["scmProviderRootUri", input.repository.provider.rootUri?.toString()],
      ["scmProviderHasRootUri", !!input.repository.provider.rootUri]
    ]);
    const menu = this._disposables.value.add(this.menuService.createMenu(MenuId.SCMInputBox, contextKeyService, { emitEventsForSubmenuChanges: true }));
    const isEnabled = () => {
      return input.repository.provider.groups.some((g) => g.resources.length > 0);
    };
    const updateToolbar = () => {
      const actions = getFlatActionBarActions(menu.getActions({ shouldForwardArgs: true }));
      for (const action of actions) {
        action.enabled = isEnabled();
      }
      this._dropdownAction.enabled = isEnabled();
      let primaryAction = void 0;
      if (this.actionRunner.runningActions.size !== 0) {
        primaryAction = this._cancelAction;
      } else if (actions.length === 1) {
        primaryAction = actions[0];
      } else if (actions.length > 1) {
        const lastActionId = this.storageService.get("scm.input.lastActionId" /* LastActionId */, StorageScope.PROFILE, "");
        primaryAction = actions.find((a) => a.id === lastActionId) ?? actions[0];
      }
      this._dropdownActions = actions.length === 1 ? [] : actions;
      super.setActions(primaryAction ? [primaryAction] : [], []);
      this._onDidChange.fire();
    };
    this._disposables.value.add(menu.onDidChange(() => updateToolbar()));
    this._disposables.value.add(input.repository.provider.onDidChangeResources(() => updateToolbar()));
    this._disposables.value.add(this.storageService.onDidChangeValue(StorageScope.PROFILE, "scm.input.lastActionId" /* LastActionId */, this._disposables.value)(() => updateToolbar()));
    this.actionRunner = this._disposables.value.add(new SCMInputWidgetActionRunner(input, this.storageService));
    this._disposables.value.add(this.actionRunner.onWillRun((e) => {
      if (this.actionRunner.runningActions.size === 0) {
        super.setActions([this._cancelAction], []);
        this._onDidChange.fire();
      }
    }));
    this._disposables.value.add(this.actionRunner.onDidRun((e) => {
      if (this.actionRunner.runningActions.size === 0) {
        updateToolbar();
      }
    }));
    updateToolbar();
  }
};
SCMInputWidgetToolbar = __decorateClass([
  __decorateParam(2, IMenuService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, ITelemetryService)
], SCMInputWidgetToolbar);
class SCMInputWidgetEditorOptions {
  constructor(overflowWidgetsDomNode, configurationService) {
    this.overflowWidgetsDomNode = overflowWidgetsDomNode;
    this.configurationService = configurationService;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this.defaultInputFontFamily = DEFAULT_FONT_FAMILY;
    this._disposables = new DisposableStore();
    const onDidChangeConfiguration = Event.filter(
      this.configurationService.onDidChangeConfiguration,
      (e) => {
        return e.affectsConfiguration("editor.accessibilitySupport") || e.affectsConfiguration("editor.cursorBlinking") || e.affectsConfiguration("editor.cursorStyle") || e.affectsConfiguration("editor.cursorWidth") || e.affectsConfiguration("editor.emptySelectionClipboard") || e.affectsConfiguration("editor.fontFamily") || e.affectsConfiguration("editor.roundedSelection") || e.affectsConfiguration("editor.rulers") || e.affectsConfiguration("editor.wordWrap") || e.affectsConfiguration("editor.wordSegmenterLocales") || e.affectsConfiguration("scm.inputFontFamily") || e.affectsConfiguration("scm.inputFontSize");
      },
      this._disposables
    );
    this._disposables.add(onDidChangeConfiguration(() => this._onDidChange.fire()));
  }
  getEditorConstructionOptions() {
    return {
      ...getSimpleEditorOptions(this.configurationService),
      ...this.getEditorOptions(),
      dragAndDrop: true,
      dropIntoEditor: { enabled: true },
      formatOnType: true,
      lineDecorationsWidth: 6,
      overflowWidgetsDomNode: this.overflowWidgetsDomNode,
      padding: { top: 2, bottom: 2 },
      quickSuggestions: false,
      renderWhitespace: "none",
      scrollbar: {
        alwaysConsumeMouseWheel: false,
        vertical: "hidden"
      },
      wrappingIndent: "none",
      wrappingStrategy: "advanced"
    };
  }
  getEditorOptions() {
    const fontFamily = this._getEditorFontFamily();
    const fontSize = this._getEditorFontSize();
    const lineHeight = this._getEditorLineHeight(fontSize);
    const wordSegmenterLocales = this.configurationService.getValue("editor.wordSegmenterLocales");
    const accessibilitySupport = this.configurationService.getValue("editor.accessibilitySupport");
    const cursorBlinking = this.configurationService.getValue("editor.cursorBlinking");
    const cursorStyle = this.configurationService.getValue("editor.cursorStyle");
    const cursorWidth = this.configurationService.getValue("editor.cursorWidth") ?? 1;
    const emptySelectionClipboard = this.configurationService.getValue("editor.emptySelectionClipboard") === true;
    const roundedSelection = this.configurationService.getValue("editor.roundedSelection") === true;
    return { ...this._getEditorLanguageConfiguration(), accessibilitySupport, cursorBlinking, cursorStyle, cursorWidth, fontFamily, fontSize, lineHeight, emptySelectionClipboard, roundedSelection, wordSegmenterLocales };
  }
  _getEditorFontFamily() {
    const inputFontFamily = this.configurationService.getValue("scm.inputFontFamily").trim();
    if (inputFontFamily.toLowerCase() === "editor") {
      return this.configurationService.getValue("editor.fontFamily").trim();
    }
    if (inputFontFamily.length !== 0 && inputFontFamily.toLowerCase() !== "default") {
      return inputFontFamily;
    }
    return this.defaultInputFontFamily;
  }
  _getEditorFontSize() {
    return this.configurationService.getValue("scm.inputFontSize");
  }
  _getEditorLanguageConfiguration() {
    const rulersConfig = this.configurationService.inspect("editor.rulers", { overrideIdentifier: "scminput" });
    const rulers = rulersConfig.overrideIdentifiers?.includes("scminput") ? EditorOptions.rulers.validate(rulersConfig.value) : [];
    const wordWrapConfig = this.configurationService.inspect("editor.wordWrap", { overrideIdentifier: "scminput" });
    const wordWrap = wordWrapConfig.overrideIdentifiers?.includes("scminput") ? EditorOptions.wordWrap.validate(wordWrapConfig.value) : "on";
    return { rulers, wordWrap };
  }
  _getEditorLineHeight(fontSize) {
    return Math.round(fontSize * 1.5);
  }
  dispose() {
    this._disposables.dispose();
    this._onDidChange.dispose();
  }
}
let SCMInputWidget = class {
  constructor(container, overflowWidgetsDomNode, contextKeyService, instantiationService, modelService, keybindingService, configurationService, scmViewService, contextViewService, openerService, accessibilityService, markdownRendererService) {
    this.modelService = modelService;
    this.keybindingService = keybindingService;
    this.configurationService = configurationService;
    this.scmViewService = scmViewService;
    this.contextViewService = contextViewService;
    this.openerService = openerService;
    this.accessibilityService = accessibilityService;
    this.markdownRendererService = markdownRendererService;
    this.disposables = new DisposableStore();
    this.repositoryDisposables = new DisposableStore();
    this.validationHasFocus = false;
    // This is due to "Setup height change listener on next tick" above
    // https://github.com/microsoft/vscode/issues/108067
    this.lastLayoutWasTrash = false;
    this.shouldFocusAfterLayout = false;
    this.element = append(container, $(".scm-editor"));
    this.editorContainer = append(this.element, $(".scm-editor-container"));
    this.toolbarContainer = append(this.element, $(".scm-editor-toolbar"));
    this.contextKeyService = this.disposables.add(contextKeyService.createScoped(this.element));
    this.repositoryIdContextKey = this.contextKeyService.createKey("scmRepository", void 0);
    this.validationMessageContextKey = SCMInputContextKeys.SCMInputHasValidationMessage.bindTo(this.contextKeyService);
    this.inputEditorOptions = new SCMInputWidgetEditorOptions(overflowWidgetsDomNode, this.configurationService);
    this.disposables.add(this.inputEditorOptions.onDidChange(this.onDidChangeEditorOptions, this));
    this.disposables.add(this.inputEditorOptions);
    const codeEditorWidgetOptions = {
      contributions: EditorExtensionsRegistry.getSomeEditorContributions([
        CodeActionController.ID,
        ColorDetector.ID,
        ContextMenuController.ID,
        CopyPasteController.ID,
        DragAndDropController.ID,
        DropIntoEditorController.ID,
        EditorDictation.ID,
        FormatOnType.ID,
        ContentHoverController.ID,
        GlyphHoverController.ID,
        InlineCompletionsController.ID,
        LinkDetector.ID,
        MenuPreventer.ID,
        MessageController.ID,
        PlaceholderTextContribution.ID,
        SelectionClipboardContributionID,
        SnippetController2.ID,
        SuggestController.ID
      ]),
      isSimpleWidget: true
    };
    const services = new ServiceCollection([IContextKeyService, this.contextKeyService]);
    const instantiationService2 = instantiationService.createChild(services, this.disposables);
    const editorConstructionOptions = this.inputEditorOptions.getEditorConstructionOptions();
    this.inputEditor = instantiationService2.createInstance(CodeEditorWidget, this.editorContainer, editorConstructionOptions, codeEditorWidgetOptions);
    this.disposables.add(this.inputEditor);
    this.disposables.add(this.inputEditor.onDidFocusEditorText(() => {
      if (this.input?.repository) {
        this.scmViewService.focus(this.input.repository);
      }
      this.element.classList.add("synthetic-focus");
      this.renderValidation();
    }));
    this.disposables.add(this.inputEditor.onDidBlurEditorText(() => {
      this.element.classList.remove("synthetic-focus");
      setTimeout(() => {
        if (!this.validation || !this.validationHasFocus) {
          this.clearValidation();
        }
      }, 0);
    }));
    this.disposables.add(this.inputEditor.onDidBlurEditorWidget(() => {
      CopyPasteController.get(this.inputEditor)?.clearWidgets();
      DropIntoEditorController.get(this.inputEditor)?.clearWidgets();
    }));
    const firstLineKey = this.contextKeyService.createKey("scmInputIsInFirstPosition", false);
    const lastLineKey = this.contextKeyService.createKey("scmInputIsInLastPosition", false);
    this.disposables.add(this.inputEditor.onDidChangeCursorPosition(({ position }) => {
      const viewModel = this.inputEditor._getViewModel();
      const lastLineNumber = viewModel.getLineCount();
      const lastLineCol = viewModel.getLineLength(lastLineNumber) + 1;
      const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
      firstLineKey.set(viewPosition.lineNumber === 1 && viewPosition.column === 1);
      lastLineKey.set(viewPosition.lineNumber === lastLineNumber && viewPosition.column === lastLineCol);
    }));
    this.disposables.add(this.inputEditor.onDidScrollChange((e) => {
      this.toolbarContainer.classList.toggle("scroll-decoration", e.scrollTop > 0);
    }));
    Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("scm.showInputActionButton"))(() => this.layout(), this, this.disposables);
    this.onDidChangeContentHeight = Event.signal(Event.filter(this.inputEditor.onDidContentSizeChange, (e) => e.contentHeightChanged, this.disposables));
    this.toolbar = instantiationService2.createInstance(SCMInputWidgetToolbar, this.toolbarContainer, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof MenuItemAction && this.toolbar.dropdownActions.length > 1) {
          return instantiationService.createInstance(DropdownWithPrimaryActionViewItem, action, this.toolbar.dropdownAction, this.toolbar.dropdownActions, "", { actionRunner: this.toolbar.actionRunner, hoverDelegate: options.hoverDelegate });
        }
        return createActionViewItem(instantiationService, action, options);
      },
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      menuOptions: {
        shouldForwardArgs: true
      }
    });
    this.disposables.add(this.toolbar.onDidChange(() => this.layout()));
    this.disposables.add(this.toolbar);
  }
  get input() {
    return this.model?.input;
  }
  set input(input) {
    if (input === this.input) {
      return;
    }
    this.clearValidation();
    this.element.classList.remove("synthetic-focus");
    this.repositoryDisposables.clear();
    this.repositoryIdContextKey.set(input?.repository.id);
    if (!input) {
      this.inputEditor.setModel(void 0);
      this.model = void 0;
      return;
    }
    const textModel = input.repository.provider.inputBoxTextModel;
    this.inputEditor.setModel(textModel);
    if (this.configurationService.getValue("editor.wordBasedSuggestions", { resource: textModel.uri }) !== "off") {
      this.configurationService.updateValue("editor.wordBasedSuggestions", "off", { resource: textModel.uri }, ConfigurationTarget.MEMORY);
    }
    const validationDelayer = new ThrottledDelayer(200);
    const validate = async () => {
      const position = this.inputEditor.getSelection()?.getStartPosition();
      const offset = position && textModel.getOffsetAt(position);
      const value = textModel.getValue();
      this.setValidation(await input.validateInput(value, offset || 0));
    };
    const triggerValidation = () => validationDelayer.trigger(validate);
    this.repositoryDisposables.add(validationDelayer);
    this.repositoryDisposables.add(this.inputEditor.onDidChangeCursorPosition(triggerValidation));
    const opts = this.modelService.getCreationOptions(textModel.getLanguageId(), textModel.uri, textModel.isForSimpleWidget);
    const onEnter = Event.filter(this.inputEditor.onKeyDown, (e) => e.keyCode === KeyCode.Enter, this.repositoryDisposables);
    this.repositoryDisposables.add(onEnter(() => textModel.detectIndentation(opts.insertSpaces, opts.tabSize)));
    textModel.setValue(input.value);
    this.repositoryDisposables.add(input.onDidChange(({ value, reason }) => {
      const currentValue = textModel.getValue();
      if (value === currentValue) {
        return;
      }
      textModel.pushStackElement();
      textModel.pushEditOperations(null, [EditOperation.replaceMove(textModel.getFullModelRange(), value)], () => []);
      const position = reason === SCMInputChangeReason.HistoryPrevious ? textModel.getFullModelRange().getStartPosition() : textModel.getFullModelRange().getEndPosition();
      this.inputEditor.setPosition(position);
      this.inputEditor.revealPositionInCenterIfOutsideViewport(position);
    }));
    this.repositoryDisposables.add(input.onDidChangeFocus(() => this.focus()));
    this.repositoryDisposables.add(input.onDidChangeValidationMessage((e) => this.setValidation(e, { focus: true, timeout: true })));
    this.repositoryDisposables.add(input.onDidChangeValidateInput((e) => triggerValidation()));
    this.repositoryDisposables.add(input.onDidClearValidation(() => this.clearValidation()));
    this.repositoryDisposables.add(textModel.onDidChangeContent(() => {
      input.setValue(textModel.getValue(), true);
      triggerValidation();
    }));
    const accessibilityVerbosityConfig = observableConfigValue(
      AccessibilityVerbositySettingId.SourceControl,
      true,
      this.configurationService
    );
    const getAriaLabel = (placeholder, verbosity) => {
      verbosity = verbosity ?? accessibilityVerbosityConfig.get();
      if (!verbosity || !this.accessibilityService.isScreenReaderOptimized()) {
        return placeholder;
      }
      const kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
      return kbLabel ? localize("scmInput.accessibilityHelp", "{0}, Use {1} to open Source Control Accessibility Help.", placeholder, kbLabel) : localize("scmInput.accessibilityHelpNoKb", "{0}, Run the Open Accessibility Help command for more information.", placeholder);
    };
    const getPlaceholderText = () => {
      const binding = this.keybindingService.lookupKeybinding("scm.acceptInput");
      const label = binding ? binding.getLabel() : platform.isMacintosh ? "Cmd+Enter" : "Ctrl+Enter";
      return format(input.placeholder, label);
    };
    const updatePlaceholderText = () => {
      const placeholder = getPlaceholderText();
      const ariaLabel = getAriaLabel(placeholder);
      this.inputEditor.updateOptions({ ariaLabel, placeholder });
    };
    this.repositoryDisposables.add(input.onDidChangePlaceholder(updatePlaceholderText));
    this.repositoryDisposables.add(this.keybindingService.onDidUpdateKeybindings(updatePlaceholderText));
    this.repositoryDisposables.add(runOnChange(accessibilityVerbosityConfig, (verbosity) => {
      const placeholder = getPlaceholderText();
      const ariaLabel = getAriaLabel(placeholder, verbosity);
      this.inputEditor.updateOptions({ ariaLabel });
    }));
    updatePlaceholderText();
    let commitTemplate = "";
    this.repositoryDisposables.add(autorun((reader) => {
      if (!input.visible) {
        return;
      }
      const oldCommitTemplate = commitTemplate;
      commitTemplate = input.repository.provider.commitTemplate.read(reader);
      const value = textModel.getValue();
      if (value && value !== oldCommitTemplate) {
        return;
      }
      textModel.setValue(commitTemplate);
    }));
    const updateEnablement = (enabled) => {
      this.inputEditor.updateOptions({ readOnly: !enabled });
    };
    this.repositoryDisposables.add(input.onDidChangeEnablement((enabled) => updateEnablement(enabled)));
    updateEnablement(input.enabled);
    this.toolbar.setInput(input);
    this.model = { input, textModel };
  }
  get selections() {
    return this.inputEditor.getSelections();
  }
  set selections(selections) {
    if (selections) {
      this.inputEditor.setSelections(selections);
    }
  }
  setValidation(validation, options) {
    if (this._validationTimer) {
      clearTimeout(this._validationTimer);
      this._validationTimer = void 0;
    }
    this.validation = validation;
    this.renderValidation();
    if (options?.focus && !this.hasFocus()) {
      this.focus();
    }
    if (validation && options?.timeout) {
      this._validationTimer = setTimeout(() => this.setValidation(void 0), SCMInputWidget.ValidationTimeouts[validation.type]);
    }
  }
  getContentHeight() {
    const lineHeight = this.inputEditor.getOption(EditorOption.lineHeight);
    const { top, bottom } = this.inputEditor.getOption(EditorOption.padding);
    const inputMinLinesConfig = this.configurationService.getValue("scm.inputMinLineCount");
    const inputMinLines = typeof inputMinLinesConfig === "number" ? clamp(inputMinLinesConfig, 1, 50) : 1;
    const editorMinHeight = inputMinLines * lineHeight + top + bottom;
    const inputMaxLinesConfig = this.configurationService.getValue("scm.inputMaxLineCount");
    const inputMaxLines = typeof inputMaxLinesConfig === "number" ? clamp(inputMaxLinesConfig, 1, 50) : 10;
    const editorMaxHeight = inputMaxLines * lineHeight + top + bottom;
    return clamp(this.inputEditor.getContentHeight(), editorMinHeight, editorMaxHeight);
  }
  layout() {
    const editorHeight = this.getContentHeight();
    const toolbarWidth = this.getToolbarWidth();
    const dimension = new Dimension(this.element.clientWidth - toolbarWidth, editorHeight);
    if (dimension.width < 0) {
      this.lastLayoutWasTrash = true;
      return;
    }
    this.lastLayoutWasTrash = false;
    this.inputEditor.layout(dimension);
    this.renderValidation();
    const showInputActionButton = this.configurationService.getValue("scm.showInputActionButton") === true;
    this.toolbarContainer.classList.toggle("hidden", !showInputActionButton || this.toolbar?.isEmpty() === true);
    if (this.shouldFocusAfterLayout) {
      this.shouldFocusAfterLayout = false;
      this.focus();
    }
  }
  focus() {
    if (this.lastLayoutWasTrash) {
      this.lastLayoutWasTrash = false;
      this.shouldFocusAfterLayout = true;
      return;
    }
    this.inputEditor.focus();
    this.element.classList.add("synthetic-focus");
  }
  hasFocus() {
    return this.inputEditor.hasTextFocus();
  }
  onDidChangeEditorOptions() {
    this.inputEditor.updateOptions(this.inputEditorOptions.getEditorOptions());
  }
  renderValidation() {
    this.clearValidation();
    this.element.classList.toggle("validation-info", this.validation?.type === InputValidationType.Information);
    this.element.classList.toggle("validation-warning", this.validation?.type === InputValidationType.Warning);
    this.element.classList.toggle("validation-error", this.validation?.type === InputValidationType.Error);
    if (!this.validation || !this.inputEditor.hasTextFocus()) {
      return;
    }
    this.validationMessageContextKey.set(true);
    const disposables = new DisposableStore();
    this.validationContextView = this.contextViewService.showContextView({
      getAnchor: () => this.element,
      render: (container) => {
        this.element.style.borderBottomLeftRadius = "0";
        this.element.style.borderBottomRightRadius = "0";
        const validationContainer = append(container, $(".scm-editor-validation-container"));
        validationContainer.classList.toggle("validation-info", this.validation.type === InputValidationType.Information);
        validationContainer.classList.toggle("validation-warning", this.validation.type === InputValidationType.Warning);
        validationContainer.classList.toggle("validation-error", this.validation.type === InputValidationType.Error);
        validationContainer.style.width = `${this.element.clientWidth + 2}px`;
        const element = append(validationContainer, $(".scm-editor-validation"));
        const message = this.validation.message;
        if (typeof message === "string") {
          element.textContent = message;
        } else {
          const tracker = trackFocus(element);
          disposables.add(tracker);
          disposables.add(tracker.onDidFocus(() => this.validationHasFocus = true));
          disposables.add(tracker.onDidBlur(() => {
            this.validationHasFocus = false;
            this.element.style.borderBottomLeftRadius = "2px";
            this.element.style.borderBottomRightRadius = "2px";
            this.contextViewService.hideContextView();
          }));
          const renderedMarkdown = this.markdownRendererService.render(message, {
            actionHandler: (link, mdStr) => {
              openLinkFromMarkdown(this.openerService, link, mdStr.isTrusted);
              this.element.style.borderBottomLeftRadius = "2px";
              this.element.style.borderBottomRightRadius = "2px";
              this.contextViewService.hideContextView();
            }
          });
          disposables.add(renderedMarkdown);
          element.appendChild(renderedMarkdown.element);
        }
        const actionsContainer = append(validationContainer, $(".scm-editor-validation-actions"));
        const actionbar = new ActionBar(actionsContainer);
        const action = new Action("scmInputWidget.validationMessage.close", localize("label.close", "Close"), ThemeIcon.asClassName(Codicon.close), true, () => {
          this.contextViewService.hideContextView();
          this.element.style.borderBottomLeftRadius = "2px";
          this.element.style.borderBottomRightRadius = "2px";
        });
        disposables.add(actionbar);
        actionbar.push(action, { icon: true, label: false });
        return Disposable.None;
      },
      onHide: () => {
        this.validationHasFocus = false;
        this.element.style.borderBottomLeftRadius = "2px";
        this.element.style.borderBottomRightRadius = "2px";
        disposables.dispose();
      },
      anchorAlignment: AnchorAlignment.LEFT
    });
  }
  getToolbarWidth() {
    const showInputActionButton = this.configurationService.getValue("scm.showInputActionButton");
    if (!this.toolbar || !showInputActionButton || this.toolbar?.isEmpty() === true) {
      return 0;
    }
    return this.toolbar.dropdownActions.length === 0 ? 26 : 39;
  }
  clearValidation() {
    this.validationContextView?.close();
    this.validationContextView = void 0;
    this.validationHasFocus = false;
    this.validationMessageContextKey.set(false);
  }
  dispose() {
    this.input = void 0;
    this.repositoryDisposables.dispose();
    this.clearValidation();
    clearTimeout(this._validationTimer);
    this.disposables.dispose();
  }
};
SCMInputWidget.ValidationTimeouts = {
  [InputValidationType.Information]: 5e3,
  [InputValidationType.Warning]: 8e3,
  [InputValidationType.Error]: 1e4
};
SCMInputWidget = __decorateClass([
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IModelService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, ISCMViewService),
  __decorateParam(8, IContextViewService),
  __decorateParam(9, IOpenerService),
  __decorateParam(10, IAccessibilityService),
  __decorateParam(11, IMarkdownRendererService)
], SCMInputWidget);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "scm.input.triggerSetup" /* SetupAction */,
      title: localize("scmInputGenerateCommitMessage", "Generate Commit Message"),
      icon: Codicon.sparkle,
      f1: false,
      menu: {
        id: MenuId.SCMInputBox,
        when: ContextKeyExpr.and(
          ChatContextKeys.Setup.hidden.negate(),
          ChatContextKeys.Setup.disabledInWorkspace.negate(),
          ChatContextKeys.Setup.completed.negate(),
          ContextKeyExpr.equals("scmProvider", "git")
        )
      }
    });
  }
  async run(accessor, ...args) {
    const commandService = accessor.get(ICommandService);
    const result = await commandService.executeCommand(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID);
    if (!result) {
      return;
    }
    const command = product.defaultChatAgent?.generateCommitMessageCommand;
    if (!command) {
      return;
    }
    await commandService.executeCommand(command, ...args);
  }
});
setupSimpleEditorSelectionStyling(".scm-view .scm-editor-container");
export {
  SCMInputContextKeys,
  SCMInputWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9icm93c2VyL3NjbUlucHV0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3NjbS5jc3MnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGFwcGVuZCwgJCwgRGltZW5zaW9uLCB0cmFja0ZvY3VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJbnB1dFZhbGlkYXRpb25UeXBlLCBJU0NNSW5wdXQsIElJbnB1dFZhbGlkYXRpb24sIElTQ01WaWV3U2VydmljZSwgU0NNSW5wdXRDaGFuZ2VSZWFzb24sIElTQ01JbnB1dFZhbHVlUHJvdmlkZXJDb250ZXh0IH0gZnJvbSAnLi4vY29tbW9uL3NjbS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UsIElDb250ZXh0TWVudVNlcnZpY2UsIElPcGVuQ29udGV4dFZpZXcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgSUNvbnRleHRLZXksIENvbnRleHRLZXlFeHByLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBNZW51SXRlbUFjdGlvbiwgSU1lbnVTZXJ2aWNlLCByZWdpc3RlckFjdGlvbjIsIE1lbnVJZCwgQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgQWN0aW9uUnVubmVyLCBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSwgQ29uZmlndXJhdGlvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGhyb3R0bGVkRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0LCBJQ29kZUVkaXRvcldpZGdldE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgZ2V0U2ltcGxlRWRpdG9yT3B0aW9ucywgc2V0dXBTaW1wbGVFZGl0b3JTZWxlY3Rpb25TdHlsaW5nIH0gZnJvbSAnLi4vLi4vY29kZUVkaXRvci9icm93c2VyL3NpbXBsZUVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBNZW51UHJldmVudGVyIH0gZnJvbSAnLi4vLi4vY29kZUVkaXRvci9icm93c2VyL21lbnVQcmV2ZW50ZXIuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uQ2xpcGJvYXJkQ29udHJpYnV0aW9uSUQgfSBmcm9tICcuLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvc2VsZWN0aW9uQ2xpcGJvYXJkLmpzJztcbmltcG9ydCB7IEVkaXRvckRpY3RhdGlvbiB9IGZyb20gJy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9kaWN0YXRpb24vZWRpdG9yRGljdGF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRNZW51Q29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvbnRleHRtZW51L2Jyb3dzZXIvY29udGV4dG1lbnUuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZm9ybWF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0Q29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0Q29udHJvbGxlcjIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldENvbnRyb2xsZXIyLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgQ29sb3JEZXRlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvbG9yUGlja2VyL2Jyb3dzZXIvY29sb3JEZXRlY3Rvci5qcyc7XG5pbXBvcnQgeyBMaW5rRGV0ZWN0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9saW5rcy9icm93c2VyL2xpbmtzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9GT05UX0ZBTUlMWSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mb250cy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IEFuY2hvckFsaWdubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvblZpZXdJdGVtLCBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIG9wZW5MaW5rRnJvbU1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IERyYWdBbmREcm9wQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2RuZC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBDb3B5UGFzdGVDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZHJvcE9yUGFzdGVJbnRvL2Jyb3dzZXIvY29weVBhc3RlQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBEcm9wSW50b0VkaXRvckNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9kcm9wT3JQYXN0ZUludG8vYnJvd3Nlci9kcm9wSW50b0VkaXRvckNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9tZXNzYWdlL2Jyb3dzZXIvbWVzc2FnZUNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9jb250cm9sbGVyL2lubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vYnJvd3Nlci9jb2RlQWN0aW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBGb3JtYXRPblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9mb3JtYXQvYnJvd3Nlci9mb3JtYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiwgRWRpdG9yT3B0aW9ucywgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIElNZW51V29ya2JlbmNoVG9vbEJhck9wdGlvbnMsIFdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEcm9wZG93bldpdGhQcmltYXJ5QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvZHJvcGRvd25XaXRoUHJpbWFyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBDb250ZW50SG92ZXJDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaG92ZXIvYnJvd3Nlci9jb250ZW50SG92ZXJDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IEdseXBoSG92ZXJDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaG92ZXIvYnJvd3Nlci9nbHlwaEhvdmVyQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBydW5PbkNoYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgUGxhY2Vob2xkZXJUZXh0Q29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcGxhY2Vob2xkZXJUZXh0L2Jyb3dzZXIvcGxhY2Vob2xkZXJUZXh0Q29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5Q29tbWFuZElkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgQ0hBVF9TRVRVUF9TVVBQT1JUX0FOT05ZTU9VU19BQ1RJT05fSUQgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5cbmV4cG9ydCBjb25zdCBTQ01JbnB1dENvbnRleHRLZXlzID0ge1xuXHRTQ01JbnB1dEhhc1ZhbGlkYXRpb25NZXNzYWdlOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2NtSW5wdXRIYXNWYWxpZGF0aW9uTWVzc2FnZScsIGZhbHNlKSxcbn07XG5cbmNvbnN0IGVudW0gU0NNSW5wdXRXaWRnZXRDb21tYW5kSWQge1xuXHRDYW5jZWxBY3Rpb24gPSAnc2NtLmlucHV0LmNhbmNlbEFjdGlvbicsXG5cdFNldHVwQWN0aW9uID0gJ3NjbS5pbnB1dC50cmlnZ2VyU2V0dXAnXG59XG5cbmNvbnN0IGVudW0gU0NNSW5wdXRXaWRnZXRTdG9yYWdlS2V5IHtcblx0TGFzdEFjdGlvbklkID0gJ3NjbS5pbnB1dC5sYXN0QWN0aW9uSWQnXG59XG5cbmNsYXNzIFNDTUlucHV0V2lkZ2V0QWN0aW9uUnVubmVyIGV4dGVuZHMgQWN0aW9uUnVubmVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ydW5uaW5nQWN0aW9ucyA9IG5ldyBTZXQ8SUFjdGlvbj4oKTtcblx0cHVibGljIGdldCBydW5uaW5nQWN0aW9ucygpOiBTZXQ8SUFjdGlvbj4geyByZXR1cm4gdGhpcy5fcnVubmluZ0FjdGlvbnM7IH1cblxuXHRwcml2YXRlIF9jdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW5wdXQ6IElTQ01JbnB1dCxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIHJ1bkFjdGlvbihhY3Rpb246IElBY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Ly8gQ2FuY2VsIHByZXZpb3VzIGFjdGlvblxuXHRcdFx0aWYgKHRoaXMucnVubmluZ0FjdGlvbnMuc2l6ZSAhPT0gMCkge1xuXHRcdFx0XHR0aGlzLl9jdHM/LmNhbmNlbCgpO1xuXG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IFNDTUlucHV0V2lkZ2V0Q29tbWFuZElkLkNhbmNlbEFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBDcmVhdGUgYWN0aW9uIGNvbnRleHRcblx0XHRcdGNvbnN0IGNvbnRleHQ6IElTQ01JbnB1dFZhbHVlUHJvdmlkZXJDb250ZXh0W10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5pbnB1dC5yZXBvc2l0b3J5LnByb3ZpZGVyLmdyb3Vwcykge1xuXHRcdFx0XHRjb250ZXh0LnB1c2goe1xuXHRcdFx0XHRcdHJlc291cmNlR3JvdXBJZDogZ3JvdXAuaWQsXG5cdFx0XHRcdFx0cmVzb3VyY2VzOiBbLi4uZ3JvdXAucmVzb3VyY2VzLm1hcChyID0+IHIuc291cmNlVXJpKV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJ1biBhY3Rpb25cblx0XHRcdHRoaXMuX3J1bm5pbmdBY3Rpb25zLmFkZChhY3Rpb24pO1xuXHRcdFx0dGhpcy5fY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRhd2FpdCBhY3Rpb24ucnVuKC4uLlt0aGlzLmlucHV0LnJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaSwgY29udGV4dCwgdGhpcy5fY3RzLnRva2VuXSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3J1bm5pbmdBY3Rpb25zLmRlbGV0ZShhY3Rpb24pO1xuXG5cdFx0XHQvLyBTYXZlIGxhc3QgYWN0aW9uXG5cdFx0XHRpZiAodGhpcy5fcnVubmluZ0FjdGlvbnMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRjb25zdCBhY3Rpb25JZCA9IGFjdGlvbi5pZCA9PT0gU0NNSW5wdXRXaWRnZXRDb21tYW5kSWQuU2V0dXBBY3Rpb25cblx0XHRcdFx0XHQ/IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8uZ2VuZXJhdGVDb21taXRNZXNzYWdlQ29tbWFuZCA/PyBhY3Rpb24uaWRcblx0XHRcdFx0XHQ6IGFjdGlvbi5pZDtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTQ01JbnB1dFdpZGdldFN0b3JhZ2VLZXkuTGFzdEFjdGlvbklkLCBhY3Rpb25JZCwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cbn1cblxuY2xhc3MgU0NNSW5wdXRXaWRnZXRUb29sYmFyIGV4dGVuZHMgV29ya2JlbmNoVG9vbEJhciB7XG5cblx0cHJpdmF0ZSBfZHJvcGRvd25BY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0Z2V0IGRyb3Bkb3duQWN0aW9ucygpOiBJQWN0aW9uW10geyByZXR1cm4gdGhpcy5fZHJvcGRvd25BY3Rpb25zOyB9XG5cblx0cHJpdmF0ZSBfZHJvcGRvd25BY3Rpb246IElBY3Rpb247XG5cdGdldCBkcm9wZG93bkFjdGlvbigpOiBJQWN0aW9uIHsgcmV0dXJuIHRoaXMuX2Ryb3Bkb3duQWN0aW9uOyB9XG5cblx0cHJpdmF0ZSBfY2FuY2VsQWN0aW9uOiBJQWN0aW9uO1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRvcHRpb25zOiBJTWVudVdvcmtiZW5jaFRvb2xCYXJPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY29udGFpbmVyLCBvcHRpb25zLCBtZW51U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2Ryb3Bkb3duQWN0aW9uID0gbmV3IEFjdGlvbihcblx0XHRcdCdzY21JbnB1dE1vcmVBY3Rpb25zJyxcblx0XHRcdGxvY2FsaXplKCdzY21JbnB1dE1vcmVBY3Rpb25zJywgXCJNb3JlIEFjdGlvbnMuLi5cIiksXG5cdFx0XHQnY29kaWNvbi1jaGV2cm9uLWRvd24nKTtcblxuXHRcdHRoaXMuX2NhbmNlbEFjdGlvbiA9IG5ldyBNZW51SXRlbUFjdGlvbih7XG5cdFx0XHRpZDogU0NNSW5wdXRXaWRnZXRDb21tYW5kSWQuQ2FuY2VsQWN0aW9uLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzY21JbnB1dENhbmNlbEFjdGlvbicsIFwiQ2FuY2VsXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zdG9wQ2lyY2xlLFxuXHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgY29udGV4dEtleVNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRJbnB1dChpbnB1dDogSVNDTUlucHV0KTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheShbXG5cdFx0XHRbJ3NjbVByb3ZpZGVyJywgaW5wdXQucmVwb3NpdG9yeS5wcm92aWRlci5wcm92aWRlcklkXSxcblx0XHRcdFsnc2NtUHJvdmlkZXJSb290VXJpJywgaW5wdXQucmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpPy50b1N0cmluZygpXSxcblx0XHRcdFsnc2NtUHJvdmlkZXJIYXNSb290VXJpJywgISFpbnB1dC5yZXBvc2l0b3J5LnByb3ZpZGVyLnJvb3RVcmldXG5cdFx0XSk7XG5cblx0XHRjb25zdCBtZW51ID0gdGhpcy5fZGlzcG9zYWJsZXMudmFsdWUuYWRkKHRoaXMubWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuU0NNSW5wdXRCb3gsIGNvbnRleHRLZXlTZXJ2aWNlLCB7IGVtaXRFdmVudHNGb3JTdWJtZW51Q2hhbmdlczogdHJ1ZSB9KSk7XG5cblx0XHRjb25zdCBpc0VuYWJsZWQgPSAoKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRyZXR1cm4gaW5wdXQucmVwb3NpdG9yeS5wcm92aWRlci5ncm91cHMuc29tZShnID0+IGcucmVzb3VyY2VzLmxlbmd0aCA+IDApO1xuXHRcdH07XG5cblx0XHRjb25zdCB1cGRhdGVUb29sYmFyID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zKG1lbnUuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pKTtcblxuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0XHRhY3Rpb24uZW5hYmxlZCA9IGlzRW5hYmxlZCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZHJvcGRvd25BY3Rpb24uZW5hYmxlZCA9IGlzRW5hYmxlZCgpO1xuXG5cdFx0XHRsZXQgcHJpbWFyeUFjdGlvbjogSUFjdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKCh0aGlzLmFjdGlvblJ1bm5lciBhcyBTQ01JbnB1dFdpZGdldEFjdGlvblJ1bm5lcikucnVubmluZ0FjdGlvbnMuc2l6ZSAhPT0gMCkge1xuXHRcdFx0XHRwcmltYXJ5QWN0aW9uID0gdGhpcy5fY2FuY2VsQWN0aW9uO1xuXHRcdFx0fSBlbHNlIGlmIChhY3Rpb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRwcmltYXJ5QWN0aW9uID0gYWN0aW9uc1swXTtcblx0XHRcdH0gZWxzZSBpZiAoYWN0aW9ucy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGNvbnN0IGxhc3RBY3Rpb25JZCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFNDTUlucHV0V2lkZ2V0U3RvcmFnZUtleS5MYXN0QWN0aW9uSWQsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAnJyk7XG5cdFx0XHRcdHByaW1hcnlBY3Rpb24gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmlkID09PSBsYXN0QWN0aW9uSWQpID8/IGFjdGlvbnNbMF07XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2Ryb3Bkb3duQWN0aW9ucyA9IGFjdGlvbnMubGVuZ3RoID09PSAxID8gW10gOiBhY3Rpb25zO1xuXHRcdFx0c3VwZXIuc2V0QWN0aW9ucyhwcmltYXJ5QWN0aW9uID8gW3ByaW1hcnlBY3Rpb25dIDogW10sIFtdKTtcblxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdH07XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy52YWx1ZS5hZGQobWVudS5vbkRpZENoYW5nZSgoKSA9PiB1cGRhdGVUb29sYmFyKCkpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy52YWx1ZS5hZGQoaW5wdXQucmVwb3NpdG9yeS5wcm92aWRlci5vbkRpZENoYW5nZVJlc291cmNlcygoKSA9PiB1cGRhdGVUb29sYmFyKCkpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy52YWx1ZS5hZGQodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTQ01JbnB1dFdpZGdldFN0b3JhZ2VLZXkuTGFzdEFjdGlvbklkLCB0aGlzLl9kaXNwb3NhYmxlcy52YWx1ZSkoKCkgPT4gdXBkYXRlVG9vbGJhcigpKSk7XG5cblx0XHR0aGlzLmFjdGlvblJ1bm5lciA9IHRoaXMuX2Rpc3Bvc2FibGVzLnZhbHVlLmFkZChuZXcgU0NNSW5wdXRXaWRnZXRBY3Rpb25SdW5uZXIoaW5wdXQsIHRoaXMuc3RvcmFnZVNlcnZpY2UpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy52YWx1ZS5hZGQodGhpcy5hY3Rpb25SdW5uZXIub25XaWxsUnVuKGUgPT4ge1xuXHRcdFx0aWYgKCh0aGlzLmFjdGlvblJ1bm5lciBhcyBTQ01JbnB1dFdpZGdldEFjdGlvblJ1bm5lcikucnVubmluZ0FjdGlvbnMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRzdXBlci5zZXRBY3Rpb25zKFt0aGlzLl9jYW5jZWxBY3Rpb25dLCBbXSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMudmFsdWUuYWRkKHRoaXMuYWN0aW9uUnVubmVyLm9uRGlkUnVuKGUgPT4ge1xuXHRcdFx0aWYgKCh0aGlzLmFjdGlvblJ1bm5lciBhcyBTQ01JbnB1dFdpZGdldEFjdGlvblJ1bm5lcikucnVubmluZ0FjdGlvbnMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHR1cGRhdGVUb29sYmFyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dXBkYXRlVG9vbGJhcigpO1xuXHR9XG59XG5cbmNsYXNzIFNDTUlucHV0V2lkZ2V0RWRpdG9yT3B0aW9ucyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdElucHV0Rm9udEZhbWlseSA9IERFRkFVTFRfRk9OVF9GQU1JTFk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvdmVyZmxvd1dpZGdldHNEb21Ob2RlOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpIHtcblxuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiA9IEV2ZW50LmZpbHRlcihcblx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLFxuXHRcdFx0ZSA9PiB7XG5cdFx0XHRcdHJldHVybiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IuYWNjZXNzaWJpbGl0eVN1cHBvcnQnKSB8fFxuXHRcdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5jdXJzb3JCbGlua2luZycpIHx8XG5cdFx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmN1cnNvclN0eWxlJykgfHxcblx0XHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IuY3Vyc29yV2lkdGgnKSB8fFxuXHRcdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5lbXB0eVNlbGVjdGlvbkNsaXBib2FyZCcpIHx8XG5cdFx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmZvbnRGYW1pbHknKSB8fFxuXHRcdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5yb3VuZGVkU2VsZWN0aW9uJykgfHxcblx0XHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IucnVsZXJzJykgfHxcblx0XHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3Iud29yZFdyYXAnKSB8fFxuXHRcdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci53b3JkU2VnbWVudGVyTG9jYWxlcycpIHx8XG5cdFx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2NtLmlucHV0Rm9udEZhbWlseScpIHx8XG5cdFx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2NtLmlucHV0Rm9udFNpemUnKTtcblx0XHRcdH0sXG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlc1xuXHRcdCk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQob25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKSkpO1xuXHR9XG5cblx0Z2V0RWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucygpOiBJRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmdldFNpbXBsZUVkaXRvck9wdGlvbnModGhpcy5jb25maWd1cmF0aW9uU2VydmljZSksXG5cdFx0XHQuLi50aGlzLmdldEVkaXRvck9wdGlvbnMoKSxcblx0XHRcdGRyYWdBbmREcm9wOiB0cnVlLFxuXHRcdFx0ZHJvcEludG9FZGl0b3I6IHsgZW5hYmxlZDogdHJ1ZSB9LFxuXHRcdFx0Zm9ybWF0T25UeXBlOiB0cnVlLFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDYsXG5cdFx0XHRvdmVyZmxvd1dpZGdldHNEb21Ob2RlOiB0aGlzLm92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsXG5cdFx0XHRwYWRkaW5nOiB7IHRvcDogMiwgYm90dG9tOiAyIH0sXG5cdFx0XHRxdWlja1N1Z2dlc3Rpb25zOiBmYWxzZSxcblx0XHRcdHJlbmRlcldoaXRlc3BhY2U6ICdub25lJyxcblx0XHRcdHNjcm9sbGJhcjoge1xuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2UsXG5cdFx0XHRcdHZlcnRpY2FsOiAnaGlkZGVuJ1xuXHRcdFx0fSxcblx0XHRcdHdyYXBwaW5nSW5kZW50OiAnbm9uZScsXG5cdFx0XHR3cmFwcGluZ1N0cmF0ZWd5OiAnYWR2YW5jZWQnLFxuXHRcdH07XG5cdH1cblxuXHRnZXRFZGl0b3JPcHRpb25zKCk6IElFZGl0b3JPcHRpb25zIHtcblx0XHRjb25zdCBmb250RmFtaWx5ID0gdGhpcy5fZ2V0RWRpdG9yRm9udEZhbWlseSgpO1xuXHRcdGNvbnN0IGZvbnRTaXplID0gdGhpcy5fZ2V0RWRpdG9yRm9udFNpemUoKTtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5fZ2V0RWRpdG9yTGluZUhlaWdodChmb250U2l6ZSk7XG5cdFx0Y29uc3Qgd29yZFNlZ21lbnRlckxvY2FsZXMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZyB8IHN0cmluZ1tdPignZWRpdG9yLndvcmRTZWdtZW50ZXJMb2NhbGVzJyk7XG5cdFx0Y29uc3QgYWNjZXNzaWJpbGl0eVN1cHBvcnQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdhdXRvJyB8ICdvZmYnIHwgJ29uJz4oJ2VkaXRvci5hY2Nlc3NpYmlsaXR5U3VwcG9ydCcpO1xuXHRcdGNvbnN0IGN1cnNvckJsaW5raW5nID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnYmxpbmsnIHwgJ3Ntb290aCcgfCAncGhhc2UnIHwgJ2V4cGFuZCcgfCAnc29saWQnPignZWRpdG9yLmN1cnNvckJsaW5raW5nJyk7XG5cdFx0Y29uc3QgY3Vyc29yU3R5bGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElFZGl0b3JPcHRpb25zWydjdXJzb3JTdHlsZSddPignZWRpdG9yLmN1cnNvclN0eWxlJyk7XG5cdFx0Y29uc3QgY3Vyc29yV2lkdGggPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElFZGl0b3JPcHRpb25zWydjdXJzb3JXaWR0aCddPignZWRpdG9yLmN1cnNvcldpZHRoJykgPz8gMTtcblx0XHRjb25zdCBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2VkaXRvci5lbXB0eVNlbGVjdGlvbkNsaXBib2FyZCcpID09PSB0cnVlO1xuXHRcdGNvbnN0IHJvdW5kZWRTZWxlY3Rpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdlZGl0b3Iucm91bmRlZFNlbGVjdGlvbicpID09PSB0cnVlO1xuXG5cdFx0cmV0dXJuIHsgLi4udGhpcy5fZ2V0RWRpdG9yTGFuZ3VhZ2VDb25maWd1cmF0aW9uKCksIGFjY2Vzc2liaWxpdHlTdXBwb3J0LCBjdXJzb3JCbGlua2luZywgY3Vyc29yU3R5bGUsIGN1cnNvcldpZHRoLCBmb250RmFtaWx5LCBmb250U2l6ZSwgbGluZUhlaWdodCwgZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQsIHJvdW5kZWRTZWxlY3Rpb24sIHdvcmRTZWdtZW50ZXJMb2NhbGVzIH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFZGl0b3JGb250RmFtaWx5KCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgaW5wdXRGb250RmFtaWx5ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdzY20uaW5wdXRGb250RmFtaWx5JykudHJpbSgpO1xuXG5cdFx0aWYgKGlucHV0Rm9udEZhbWlseS50b0xvd2VyQ2FzZSgpID09PSAnZWRpdG9yJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignZWRpdG9yLmZvbnRGYW1pbHknKS50cmltKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGlucHV0Rm9udEZhbWlseS5sZW5ndGggIT09IDAgJiYgaW5wdXRGb250RmFtaWx5LnRvTG93ZXJDYXNlKCkgIT09ICdkZWZhdWx0Jykge1xuXHRcdFx0cmV0dXJuIGlucHV0Rm9udEZhbWlseTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0SW5wdXRGb250RmFtaWx5O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RWRpdG9yRm9udFNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdzY20uaW5wdXRGb250U2l6ZScpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RWRpdG9yTGFuZ3VhZ2VDb25maWd1cmF0aW9uKCk6IElFZGl0b3JPcHRpb25zIHtcblx0XHQvLyBlZGl0b3IucnVsZXJzXG5cdFx0Y29uc3QgcnVsZXJzQ29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KCdlZGl0b3IucnVsZXJzJywgeyBvdmVycmlkZUlkZW50aWZpZXI6ICdzY21pbnB1dCcgfSk7XG5cdFx0Y29uc3QgcnVsZXJzID0gcnVsZXJzQ29uZmlnLm92ZXJyaWRlSWRlbnRpZmllcnM/LmluY2x1ZGVzKCdzY21pbnB1dCcpID8gRWRpdG9yT3B0aW9ucy5ydWxlcnMudmFsaWRhdGUocnVsZXJzQ29uZmlnLnZhbHVlKSA6IFtdO1xuXG5cdFx0Ly8gZWRpdG9yLndvcmRXcmFwXG5cdFx0Y29uc3Qgd29yZFdyYXBDb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QoJ2VkaXRvci53b3JkV3JhcCcsIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiAnc2NtaW5wdXQnIH0pO1xuXHRcdGNvbnN0IHdvcmRXcmFwID0gd29yZFdyYXBDb25maWcub3ZlcnJpZGVJZGVudGlmaWVycz8uaW5jbHVkZXMoJ3NjbWlucHV0JykgPyBFZGl0b3JPcHRpb25zLndvcmRXcmFwLnZhbGlkYXRlKHdvcmRXcmFwQ29uZmlnLnZhbHVlKSA6ICdvbic7XG5cblx0XHRyZXR1cm4geyBydWxlcnMsIHdvcmRXcmFwIH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFZGl0b3JMaW5lSGVpZ2h0KGZvbnRTaXplOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBNYXRoLnJvdW5kKGZvbnRTaXplICogMS41KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmRpc3Bvc2UoKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBTQ01JbnB1dFdpZGdldCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVmFsaWRhdGlvblRpbWVvdXRzOiB7IFtzZXZlcml0eTogbnVtYmVyXTogbnVtYmVyIH0gPSB7XG5cdFx0W0lucHV0VmFsaWRhdGlvblR5cGUuSW5mb3JtYXRpb25dOiA1MDAwLFxuXHRcdFtJbnB1dFZhbGlkYXRpb25UeXBlLldhcm5pbmddOiA4MDAwLFxuXHRcdFtJbnB1dFZhbGlkYXRpb25UeXBlLkVycm9yXTogMTAwMDBcblx0fTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cblx0cHJpdmF0ZSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBlZGl0b3JDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGlucHV0RWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IGlucHV0RWRpdG9yT3B0aW9uczogU0NNSW5wdXRXaWRnZXRFZGl0b3JPcHRpb25zO1xuXHRwcml2YXRlIHRvb2xiYXJDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRvb2xiYXI6IFNDTUlucHV0V2lkZ2V0VG9vbGJhcjtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIG1vZGVsOiB7IHJlYWRvbmx5IGlucHV0OiBJU0NNSW5wdXQ7IHJlYWRvbmx5IHRleHRNb2RlbDogSVRleHRNb2RlbCB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlcG9zaXRvcnlJZENvbnRleHRLZXk6IElDb250ZXh0S2V5PHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgdmFsaWRhdGlvbk1lc3NhZ2VDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSByZXBvc2l0b3J5RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSB2YWxpZGF0aW9uOiBJSW5wdXRWYWxpZGF0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHZhbGlkYXRpb25Db250ZXh0VmlldzogSU9wZW5Db250ZXh0VmlldyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB2YWxpZGF0aW9uSGFzRm9jdXM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfdmFsaWRhdGlvblRpbWVyOiBUaW1lb3V0IHwgdW5kZWZpbmVkO1xuXG5cdC8vIFRoaXMgaXMgZHVlIHRvIFwiU2V0dXAgaGVpZ2h0IGNoYW5nZSBsaXN0ZW5lciBvbiBuZXh0IHRpY2tcIiBhYm92ZVxuXHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTA4MDY3XG5cdHByaXZhdGUgbGFzdExheW91dFdhc1RyYXNoID0gZmFsc2U7XG5cdHByaXZhdGUgc2hvdWxkRm9jdXNBZnRlckxheW91dCA9IGZhbHNlO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudEhlaWdodDogRXZlbnQ8dm9pZD47XG5cblx0Z2V0IGlucHV0KCk6IElTQ01JbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWw/LmlucHV0O1xuXHR9XG5cblx0c2V0IGlucHV0KGlucHV0OiBJU0NNSW5wdXQgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoaW5wdXQgPT09IHRoaXMuaW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNsZWFyVmFsaWRhdGlvbigpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdzeW50aGV0aWMtZm9jdXMnKTtcblxuXHRcdHRoaXMucmVwb3NpdG9yeURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5yZXBvc2l0b3J5SWRDb250ZXh0S2V5LnNldChpbnB1dD8ucmVwb3NpdG9yeS5pZCk7XG5cblx0XHRpZiAoIWlucHV0KSB7XG5cdFx0XHR0aGlzLmlucHV0RWRpdG9yLnNldE1vZGVsKHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLm1vZGVsID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHRNb2RlbCA9IGlucHV0LnJlcG9zaXRvcnkucHJvdmlkZXIuaW5wdXRCb3hUZXh0TW9kZWw7XG5cdFx0dGhpcy5pbnB1dEVkaXRvci5zZXRNb2RlbCh0ZXh0TW9kZWwpO1xuXG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvci53b3JkQmFzZWRTdWdnZXN0aW9ucycsIHsgcmVzb3VyY2U6IHRleHRNb2RlbC51cmkgfSkgIT09ICdvZmYnKSB7XG5cdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdlZGl0b3Iud29yZEJhc2VkU3VnZ2VzdGlvbnMnLCAnb2ZmJywgeyByZXNvdXJjZTogdGV4dE1vZGVsLnVyaSB9LCBDb25maWd1cmF0aW9uVGFyZ2V0Lk1FTU9SWSk7XG5cdFx0fVxuXG5cdFx0Ly8gVmFsaWRhdGlvblxuXHRcdGNvbnN0IHZhbGlkYXRpb25EZWxheWVyID0gbmV3IFRocm90dGxlZERlbGF5ZXI8dm9pZD4oMjAwKTtcblx0XHRjb25zdCB2YWxpZGF0ZSA9IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5pbnB1dEVkaXRvci5nZXRTZWxlY3Rpb24oKT8uZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdFx0Y29uc3Qgb2Zmc2V0ID0gcG9zaXRpb24gJiYgdGV4dE1vZGVsLmdldE9mZnNldEF0KHBvc2l0aW9uKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gdGV4dE1vZGVsLmdldFZhbHVlKCk7XG5cblx0XHRcdHRoaXMuc2V0VmFsaWRhdGlvbihhd2FpdCBpbnB1dC52YWxpZGF0ZUlucHV0KHZhbHVlLCBvZmZzZXQgfHwgMCkpO1xuXHRcdH07XG5cblx0XHRjb25zdCB0cmlnZ2VyVmFsaWRhdGlvbiA9ICgpID0+IHZhbGlkYXRpb25EZWxheWVyLnRyaWdnZXIodmFsaWRhdGUpO1xuXHRcdHRoaXMucmVwb3NpdG9yeURpc3Bvc2FibGVzLmFkZCh2YWxpZGF0aW9uRGVsYXllcik7XG5cdFx0dGhpcy5yZXBvc2l0b3J5RGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5wdXRFZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbih0cmlnZ2VyVmFsaWRhdGlvbikpO1xuXG5cdFx0Ly8gQWRhcHRpdmUgaW5kZW50YXRpb24gcnVsZXNcblx0XHRjb25zdCBvcHRzID0gdGhpcy5tb2RlbFNlcnZpY2UuZ2V0Q3JlYXRpb25PcHRpb25zKHRleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCksIHRleHRNb2RlbC51cmksIHRleHRNb2RlbC5pc0ZvclNpbXBsZVdpZGdldCk7XG5cdFx0Y29uc3Qgb25FbnRlciA9IEV2ZW50LmZpbHRlcih0aGlzLmlucHV0RWRpdG9yLm9uS2V5RG93biwgZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIsIHRoaXMucmVwb3NpdG9yeURpc3Bvc2FibGVzKTtcblx0XHR0aGlzLnJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQob25FbnRlcigoKSA9PiB0ZXh0TW9kZWwuZGV0ZWN0SW5kZW50YXRpb24ob3B0cy5pbnNlcnRTcGFjZXMsIG9wdHMudGFiU2l6ZSkpKTtcblxuXHRcdC8vIEtlZXAgbW9kZWwgaW4gc3luYyB3aXRoIEFQSVxuXHRcdHRleHRNb2RlbC5zZXRWYWx1ZShpbnB1dC52YWx1ZSk7XG5cdFx0dGhpcy5yZXBvc2l0b3J5RGlzcG9zYWJsZXMuYWRkKGlucHV0Lm9uRGlkQ2hhbmdlKCh7IHZhbHVlLCByZWFzb24gfSkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudFZhbHVlID0gdGV4dE1vZGVsLmdldFZhbHVlKCk7XG5cdFx0XHRpZiAodmFsdWUgPT09IGN1cnJlbnRWYWx1ZSkgeyAvLyBjaXJjdWl0IGJyZWFrZXJcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0ZXh0TW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdFx0dGV4dE1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhudWxsLCBbRWRpdE9wZXJhdGlvbi5yZXBsYWNlTW92ZSh0ZXh0TW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgdmFsdWUpXSwgKCkgPT4gW10pO1xuXG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IHJlYXNvbiA9PT0gU0NNSW5wdXRDaGFuZ2VSZWFzb24uSGlzdG9yeVByZXZpb3VzXG5cdFx0XHRcdD8gdGV4dE1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCkuZ2V0U3RhcnRQb3NpdGlvbigpXG5cdFx0XHRcdDogdGV4dE1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCkuZ2V0RW5kUG9zaXRpb24oKTtcblx0XHRcdHRoaXMuaW5wdXRFZGl0b3Iuc2V0UG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0dGhpcy5pbnB1dEVkaXRvci5yZXZlYWxQb3NpdGlvbkluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQocG9zaXRpb24pO1xuXHRcdH0pKTtcblx0XHR0aGlzLnJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQoaW5wdXQub25EaWRDaGFuZ2VGb2N1cygoKSA9PiB0aGlzLmZvY3VzKCkpKTtcblx0XHR0aGlzLnJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQoaW5wdXQub25EaWRDaGFuZ2VWYWxpZGF0aW9uTWVzc2FnZSgoZSkgPT4gdGhpcy5zZXRWYWxpZGF0aW9uKGUsIHsgZm9jdXM6IHRydWUsIHRpbWVvdXQ6IHRydWUgfSkpKTtcblx0XHR0aGlzLnJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQoaW5wdXQub25EaWRDaGFuZ2VWYWxpZGF0ZUlucHV0KChlKSA9PiB0cmlnZ2VyVmFsaWRhdGlvbigpKSk7XG5cdFx0dGhpcy5yZXBvc2l0b3J5RGlzcG9zYWJsZXMuYWRkKGlucHV0Lm9uRGlkQ2xlYXJWYWxpZGF0aW9uKCgpID0+IHRoaXMuY2xlYXJWYWxpZGF0aW9uKCkpKTtcblxuXHRcdC8vIEtlZXAgQVBJIGluIHN5bmMgd2l0aCBtb2RlbCBhbmQgdmFsaWRhdGVcblx0XHR0aGlzLnJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQodGV4dE1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB7XG5cdFx0XHRpbnB1dC5zZXRWYWx1ZSh0ZXh0TW9kZWwuZ2V0VmFsdWUoKSwgdHJ1ZSk7XG5cdFx0XHR0cmlnZ2VyVmFsaWRhdGlvbigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEFyaWEgbGFiZWwgJiBwbGFjZWhvbGRlciB0ZXh0XG5cdFx0Y29uc3QgYWNjZXNzaWJpbGl0eVZlcmJvc2l0eUNvbmZpZyA9IG9ic2VydmFibGVDb25maWdWYWx1ZShcblx0XHRcdEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuU291cmNlQ29udHJvbCwgdHJ1ZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBnZXRBcmlhTGFiZWwgPSAocGxhY2Vob2xkZXI6IHN0cmluZywgdmVyYm9zaXR5PzogYm9vbGVhbikgPT4ge1xuXHRcdFx0dmVyYm9zaXR5ID0gdmVyYm9zaXR5ID8/IGFjY2Vzc2liaWxpdHlWZXJib3NpdHlDb25maWcuZ2V0KCk7XG5cblx0XHRcdGlmICghdmVyYm9zaXR5IHx8ICF0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpIHtcblx0XHRcdFx0cmV0dXJuIHBsYWNlaG9sZGVyO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBrYkxhYmVsID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEFjY2Vzc2liaWxpdHlDb21tYW5kSWQuT3BlbkFjY2Vzc2liaWxpdHlIZWxwKT8uZ2V0TGFiZWwoKTtcblx0XHRcdHJldHVybiBrYkxhYmVsXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3NjbUlucHV0LmFjY2Vzc2liaWxpdHlIZWxwJywgXCJ7MH0sIFVzZSB7MX0gdG8gb3BlbiBTb3VyY2UgQ29udHJvbCBBY2Nlc3NpYmlsaXR5IEhlbHAuXCIsIHBsYWNlaG9sZGVyLCBrYkxhYmVsKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdzY21JbnB1dC5hY2Nlc3NpYmlsaXR5SGVscE5vS2InLCBcInswfSwgUnVuIHRoZSBPcGVuIEFjY2Vzc2liaWxpdHkgSGVscCBjb21tYW5kIGZvciBtb3JlIGluZm9ybWF0aW9uLlwiLCBwbGFjZWhvbGRlcik7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGdldFBsYWNlaG9sZGVyVGV4dCA9ICgpOiBzdHJpbmcgPT4ge1xuXHRcdFx0Y29uc3QgYmluZGluZyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZygnc2NtLmFjY2VwdElucHV0Jyk7XG5cdFx0XHRjb25zdCBsYWJlbCA9IGJpbmRpbmcgPyBiaW5kaW5nLmdldExhYmVsKCkgOiAocGxhdGZvcm0uaXNNYWNpbnRvc2ggPyAnQ21kK0VudGVyJyA6ICdDdHJsK0VudGVyJyk7XG5cdFx0XHRyZXR1cm4gZm9ybWF0KGlucHV0LnBsYWNlaG9sZGVyLCBsYWJlbCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHVwZGF0ZVBsYWNlaG9sZGVyVGV4dCA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHBsYWNlaG9sZGVyID0gZ2V0UGxhY2Vob2xkZXJUZXh0KCk7XG5cdFx0XHRjb25zdCBhcmlhTGFiZWwgPSBnZXRBcmlhTGFiZWwocGxhY2Vob2xkZXIpO1xuXG5cdFx0XHR0aGlzLmlucHV0RWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyBhcmlhTGFiZWwsIHBsYWNlaG9sZGVyIH0pO1xuXHRcdH07XG5cblx0XHR0aGlzLnJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQoaW5wdXQub25EaWRDaGFuZ2VQbGFjZWhvbGRlcih1cGRhdGVQbGFjZWhvbGRlclRleHQpKTtcblx0XHR0aGlzLnJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQodGhpcy5rZXliaW5kaW5nU2VydmljZS5vbkRpZFVwZGF0ZUtleWJpbmRpbmdzKHVwZGF0ZVBsYWNlaG9sZGVyVGV4dCkpO1xuXG5cdFx0dGhpcy5yZXBvc2l0b3J5RGlzcG9zYWJsZXMuYWRkKHJ1bk9uQ2hhbmdlKGFjY2Vzc2liaWxpdHlWZXJib3NpdHlDb25maWcsIHZlcmJvc2l0eSA9PiB7XG5cdFx0XHRjb25zdCBwbGFjZWhvbGRlciA9IGdldFBsYWNlaG9sZGVyVGV4dCgpO1xuXHRcdFx0Y29uc3QgYXJpYUxhYmVsID0gZ2V0QXJpYUxhYmVsKHBsYWNlaG9sZGVyLCB2ZXJib3NpdHkpO1xuXG5cdFx0XHR0aGlzLmlucHV0RWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyBhcmlhTGFiZWwgfSk7XG5cdFx0fSkpO1xuXG5cdFx0dXBkYXRlUGxhY2Vob2xkZXJUZXh0KCk7XG5cblx0XHQvLyBVcGRhdGUgaW5wdXQgdGVtcGxhdGVcblx0XHRsZXQgY29tbWl0VGVtcGxhdGUgPSAnJztcblx0XHR0aGlzLnJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0aWYgKCFpbnB1dC52aXNpYmxlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb2xkQ29tbWl0VGVtcGxhdGUgPSBjb21taXRUZW1wbGF0ZTtcblx0XHRcdGNvbW1pdFRlbXBsYXRlID0gaW5wdXQucmVwb3NpdG9yeS5wcm92aWRlci5jb21taXRUZW1wbGF0ZS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IHZhbHVlID0gdGV4dE1vZGVsLmdldFZhbHVlKCk7XG5cdFx0XHRpZiAodmFsdWUgJiYgdmFsdWUgIT09IG9sZENvbW1pdFRlbXBsYXRlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGV4dE1vZGVsLnNldFZhbHVlKGNvbW1pdFRlbXBsYXRlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBVcGRhdGUgaW5wdXQgZW5hYmxlbWVudFxuXHRcdGNvbnN0IHVwZGF0ZUVuYWJsZW1lbnQgPSAoZW5hYmxlZDogYm9vbGVhbikgPT4ge1xuXHRcdFx0dGhpcy5pbnB1dEVkaXRvci51cGRhdGVPcHRpb25zKHsgcmVhZE9ubHk6ICFlbmFibGVkIH0pO1xuXHRcdH07XG5cdFx0dGhpcy5yZXBvc2l0b3J5RGlzcG9zYWJsZXMuYWRkKGlucHV0Lm9uRGlkQ2hhbmdlRW5hYmxlbWVudChlbmFibGVkID0+IHVwZGF0ZUVuYWJsZW1lbnQoZW5hYmxlZCkpKTtcblx0XHR1cGRhdGVFbmFibGVtZW50KGlucHV0LmVuYWJsZWQpO1xuXG5cdFx0Ly8gVG9vbGJhclxuXHRcdHRoaXMudG9vbGJhci5zZXRJbnB1dChpbnB1dCk7XG5cblx0XHQvLyBTYXZlIG1vZGVsXG5cdFx0dGhpcy5tb2RlbCA9IHsgaW5wdXQsIHRleHRNb2RlbCB9O1xuXHR9XG5cblx0Z2V0IHNlbGVjdGlvbnMoKTogU2VsZWN0aW9uW10gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dEVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdH1cblxuXHRzZXQgc2VsZWN0aW9ucyhzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSB8IG51bGwpIHtcblx0XHRpZiAoc2VsZWN0aW9ucykge1xuXHRcdFx0dGhpcy5pbnB1dEVkaXRvci5zZXRTZWxlY3Rpb25zKHNlbGVjdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0VmFsaWRhdGlvbih2YWxpZGF0aW9uOiBJSW5wdXRWYWxpZGF0aW9uIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogeyBmb2N1cz86IGJvb2xlYW47IHRpbWVvdXQ/OiBib29sZWFuIH0pIHtcblx0XHRpZiAodGhpcy5fdmFsaWRhdGlvblRpbWVyKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fdmFsaWRhdGlvblRpbWVyKTtcblx0XHRcdHRoaXMuX3ZhbGlkYXRpb25UaW1lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLnZhbGlkYXRpb24gPSB2YWxpZGF0aW9uO1xuXHRcdHRoaXMucmVuZGVyVmFsaWRhdGlvbigpO1xuXG5cdFx0aWYgKG9wdGlvbnM/LmZvY3VzICYmICF0aGlzLmhhc0ZvY3VzKCkpIHtcblx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHR9XG5cblx0XHRpZiAodmFsaWRhdGlvbiAmJiBvcHRpb25zPy50aW1lb3V0KSB7XG5cdFx0XHR0aGlzLl92YWxpZGF0aW9uVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHRoaXMuc2V0VmFsaWRhdGlvbih1bmRlZmluZWQpLCBTQ01JbnB1dFdpZGdldC5WYWxpZGF0aW9uVGltZW91dHNbdmFsaWRhdGlvbi50eXBlXSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRvdmVyZmxvd1dpZGdldHNEb21Ob2RlOiBIVE1MRWxlbWVudCxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU0NNVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzY21WaWV3U2VydmljZTogSVNDTVZpZXdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmVsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuc2NtLWVkaXRvcicpKTtcblx0XHR0aGlzLmVkaXRvckNvbnRhaW5lciA9IGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5zY20tZWRpdG9yLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLnRvb2xiYXJDb250YWluZXIgPSBhcHBlbmQodGhpcy5lbGVtZW50LCAkKCcuc2NtLWVkaXRvci10b29sYmFyJykpO1xuXG5cdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZSA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLmVsZW1lbnQpKTtcblx0XHR0aGlzLnJlcG9zaXRvcnlJZENvbnRleHRLZXkgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleSgnc2NtUmVwb3NpdG9yeScsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy52YWxpZGF0aW9uTWVzc2FnZUNvbnRleHRLZXkgPSBTQ01JbnB1dENvbnRleHRLZXlzLlNDTUlucHV0SGFzVmFsaWRhdGlvbk1lc3NhZ2UuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5pbnB1dEVkaXRvck9wdGlvbnMgPSBuZXcgU0NNSW5wdXRXaWRnZXRFZGl0b3JPcHRpb25zKG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5wdXRFZGl0b3JPcHRpb25zLm9uRGlkQ2hhbmdlKHRoaXMub25EaWRDaGFuZ2VFZGl0b3JPcHRpb25zLCB0aGlzKSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5pbnB1dEVkaXRvck9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgY29kZUVkaXRvcldpZGdldE9wdGlvbnM6IElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyA9IHtcblx0XHRcdGNvbnRyaWJ1dGlvbnM6IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRTb21lRWRpdG9yQ29udHJpYnV0aW9ucyhbXG5cdFx0XHRcdENvZGVBY3Rpb25Db250cm9sbGVyLklELFxuXHRcdFx0XHRDb2xvckRldGVjdG9yLklELFxuXHRcdFx0XHRDb250ZXh0TWVudUNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdENvcHlQYXN0ZUNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdERyYWdBbmREcm9wQ29udHJvbGxlci5JRCxcblx0XHRcdFx0RHJvcEludG9FZGl0b3JDb250cm9sbGVyLklELFxuXHRcdFx0XHRFZGl0b3JEaWN0YXRpb24uSUQsXG5cdFx0XHRcdEZvcm1hdE9uVHlwZS5JRCxcblx0XHRcdFx0Q29udGVudEhvdmVyQ29udHJvbGxlci5JRCxcblx0XHRcdFx0R2x5cGhIb3ZlckNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5JRCxcblx0XHRcdFx0TGlua0RldGVjdG9yLklELFxuXHRcdFx0XHRNZW51UHJldmVudGVyLklELFxuXHRcdFx0XHRNZXNzYWdlQ29udHJvbGxlci5JRCxcblx0XHRcdFx0UGxhY2Vob2xkZXJUZXh0Q29udHJpYnV0aW9uLklELFxuXHRcdFx0XHRTZWxlY3Rpb25DbGlwYm9hcmRDb250cmlidXRpb25JRCxcblx0XHRcdFx0U25pcHBldENvbnRyb2xsZXIyLklELFxuXHRcdFx0XHRTdWdnZXN0Q29udHJvbGxlci5JRFxuXHRcdFx0XSksXG5cdFx0XHRpc1NpbXBsZVdpZGdldDogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlXSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQoc2VydmljZXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMgPSB0aGlzLmlucHV0RWRpdG9yT3B0aW9ucy5nZXRFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zKCk7XG5cdFx0dGhpcy5pbnB1dEVkaXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlMi5jcmVhdGVJbnN0YW5jZShDb2RlRWRpdG9yV2lkZ2V0LCB0aGlzLmVkaXRvckNvbnRhaW5lciwgZWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucywgY29kZUVkaXRvcldpZGdldE9wdGlvbnMpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5wdXRFZGl0b3IpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5pbnB1dEVkaXRvci5vbkRpZEZvY3VzRWRpdG9yVGV4dCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pbnB1dD8ucmVwb3NpdG9yeSkge1xuXHRcdFx0XHR0aGlzLnNjbVZpZXdTZXJ2aWNlLmZvY3VzKHRoaXMuaW5wdXQucmVwb3NpdG9yeSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzeW50aGV0aWMtZm9jdXMnKTtcblx0XHRcdHRoaXMucmVuZGVyVmFsaWRhdGlvbigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmlucHV0RWRpdG9yLm9uRGlkQmx1ckVkaXRvclRleHQoKCkgPT4ge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ3N5bnRoZXRpYy1mb2N1cycpO1xuXG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLnZhbGlkYXRpb24gfHwgIXRoaXMudmFsaWRhdGlvbkhhc0ZvY3VzKSB7XG5cdFx0XHRcdFx0dGhpcy5jbGVhclZhbGlkYXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgMCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5pbnB1dEVkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0Q29weVBhc3RlQ29udHJvbGxlci5nZXQodGhpcy5pbnB1dEVkaXRvcik/LmNsZWFyV2lkZ2V0cygpO1xuXHRcdFx0RHJvcEludG9FZGl0b3JDb250cm9sbGVyLmdldCh0aGlzLmlucHV0RWRpdG9yKT8uY2xlYXJXaWRnZXRzKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZmlyc3RMaW5lS2V5ID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXk8Ym9vbGVhbj4oJ3NjbUlucHV0SXNJbkZpcnN0UG9zaXRpb24nLCBmYWxzZSk7XG5cdFx0Y29uc3QgbGFzdExpbmVLZXkgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxib29sZWFuPignc2NtSW5wdXRJc0luTGFzdFBvc2l0aW9uJywgZmFsc2UpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5pbnB1dEVkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKCh7IHBvc2l0aW9uIH0pID0+IHtcblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuaW5wdXRFZGl0b3IuX2dldFZpZXdNb2RlbCgpITtcblx0XHRcdGNvbnN0IGxhc3RMaW5lTnVtYmVyID0gdmlld01vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdFx0Y29uc3QgbGFzdExpbmVDb2wgPSB2aWV3TW9kZWwuZ2V0TGluZUxlbmd0aChsYXN0TGluZU51bWJlcikgKyAxO1xuXHRcdFx0Y29uc3Qgdmlld1Bvc2l0aW9uID0gdmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0Zmlyc3RMaW5lS2V5LnNldCh2aWV3UG9zaXRpb24ubGluZU51bWJlciA9PT0gMSAmJiB2aWV3UG9zaXRpb24uY29sdW1uID09PSAxKTtcblx0XHRcdGxhc3RMaW5lS2V5LnNldCh2aWV3UG9zaXRpb24ubGluZU51bWJlciA9PT0gbGFzdExpbmVOdW1iZXIgJiYgdmlld1Bvc2l0aW9uLmNvbHVtbiA9PT0gbGFzdExpbmVDb2wpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmlucHV0RWRpdG9yLm9uRGlkU2Nyb2xsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0dGhpcy50b29sYmFyQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3Njcm9sbC1kZWNvcmF0aW9uJywgZS5zY3JvbGxUb3AgPiAwKTtcblx0XHR9KSk7XG5cblx0XHRFdmVudC5maWx0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2NtLnNob3dJbnB1dEFjdGlvbkJ1dHRvbicpKSgoKSA9PiB0aGlzLmxheW91dCgpLCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblxuXHRcdHRoaXMub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0ID0gRXZlbnQuc2lnbmFsKEV2ZW50LmZpbHRlcih0aGlzLmlucHV0RWRpdG9yLm9uRGlkQ29udGVudFNpemVDaGFuZ2UsIGUgPT4gZS5jb250ZW50SGVpZ2h0Q2hhbmdlZCwgdGhpcy5kaXNwb3NhYmxlcykpO1xuXG5cdFx0Ly8gVG9vbGJhclxuXHRcdHRoaXMudG9vbGJhciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlMi5jcmVhdGVJbnN0YW5jZShTQ01JbnB1dFdpZGdldFRvb2xiYXIsIHRoaXMudG9vbGJhckNvbnRhaW5lciwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24gJiYgdGhpcy50b29sYmFyLmRyb3Bkb3duQWN0aW9ucy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERyb3Bkb3duV2l0aFByaW1hcnlBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB0aGlzLnRvb2xiYXIuZHJvcGRvd25BY3Rpb24sIHRoaXMudG9vbGJhci5kcm9wZG93bkFjdGlvbnMsICcnLCB7IGFjdGlvblJ1bm5lcjogdGhpcy50b29sYmFyLmFjdGlvblJ1bm5lciwgaG92ZXJEZWxlZ2F0ZTogb3B0aW9ucy5ob3ZlckRlbGVnYXRlIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGNyZWF0ZUFjdGlvblZpZXdJdGVtKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy50b29sYmFyLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMubGF5b3V0KCkpKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnRvb2xiYXIpO1xuXHR9XG5cblx0Z2V0Q29udGVudEhlaWdodCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLmlucHV0RWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0Y29uc3QgeyB0b3AsIGJvdHRvbSB9ID0gdGhpcy5pbnB1dEVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnBhZGRpbmcpO1xuXG5cdFx0Y29uc3QgaW5wdXRNaW5MaW5lc0NvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3NjbS5pbnB1dE1pbkxpbmVDb3VudCcpO1xuXHRcdGNvbnN0IGlucHV0TWluTGluZXMgPSB0eXBlb2YgaW5wdXRNaW5MaW5lc0NvbmZpZyA9PT0gJ251bWJlcicgPyBjbGFtcChpbnB1dE1pbkxpbmVzQ29uZmlnLCAxLCA1MCkgOiAxO1xuXHRcdGNvbnN0IGVkaXRvck1pbkhlaWdodCA9IGlucHV0TWluTGluZXMgKiBsaW5lSGVpZ2h0ICsgdG9wICsgYm90dG9tO1xuXG5cdFx0Y29uc3QgaW5wdXRNYXhMaW5lc0NvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3NjbS5pbnB1dE1heExpbmVDb3VudCcpO1xuXHRcdGNvbnN0IGlucHV0TWF4TGluZXMgPSB0eXBlb2YgaW5wdXRNYXhMaW5lc0NvbmZpZyA9PT0gJ251bWJlcicgPyBjbGFtcChpbnB1dE1heExpbmVzQ29uZmlnLCAxLCA1MCkgOiAxMDtcblx0XHRjb25zdCBlZGl0b3JNYXhIZWlnaHQgPSBpbnB1dE1heExpbmVzICogbGluZUhlaWdodCArIHRvcCArIGJvdHRvbTtcblxuXHRcdHJldHVybiBjbGFtcCh0aGlzLmlucHV0RWRpdG9yLmdldENvbnRlbnRIZWlnaHQoKSwgZWRpdG9yTWluSGVpZ2h0LCBlZGl0b3JNYXhIZWlnaHQpO1xuXHR9XG5cblx0bGF5b3V0KCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvckhlaWdodCA9IHRoaXMuZ2V0Q29udGVudEhlaWdodCgpO1xuXHRcdGNvbnN0IHRvb2xiYXJXaWR0aCA9IHRoaXMuZ2V0VG9vbGJhcldpZHRoKCk7XG5cdFx0Y29uc3QgZGltZW5zaW9uID0gbmV3IERpbWVuc2lvbih0aGlzLmVsZW1lbnQuY2xpZW50V2lkdGggLSB0b29sYmFyV2lkdGgsIGVkaXRvckhlaWdodCk7XG5cblx0XHRpZiAoZGltZW5zaW9uLndpZHRoIDwgMCkge1xuXHRcdFx0dGhpcy5sYXN0TGF5b3V0V2FzVHJhc2ggPSB0cnVlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubGFzdExheW91dFdhc1RyYXNoID0gZmFsc2U7XG5cdFx0dGhpcy5pbnB1dEVkaXRvci5sYXlvdXQoZGltZW5zaW9uKTtcblx0XHR0aGlzLnJlbmRlclZhbGlkYXRpb24oKTtcblxuXHRcdGNvbnN0IHNob3dJbnB1dEFjdGlvbkJ1dHRvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3NjbS5zaG93SW5wdXRBY3Rpb25CdXR0b24nKSA9PT0gdHJ1ZTtcblx0XHR0aGlzLnRvb2xiYXJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIXNob3dJbnB1dEFjdGlvbkJ1dHRvbiB8fCB0aGlzLnRvb2xiYXI/LmlzRW1wdHkoKSA9PT0gdHJ1ZSk7XG5cblx0XHRpZiAodGhpcy5zaG91bGRGb2N1c0FmdGVyTGF5b3V0KSB7XG5cdFx0XHR0aGlzLnNob3VsZEZvY3VzQWZ0ZXJMYXlvdXQgPSBmYWxzZTtcblx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sYXN0TGF5b3V0V2FzVHJhc2gpIHtcblx0XHRcdHRoaXMubGFzdExheW91dFdhc1RyYXNoID0gZmFsc2U7XG5cdFx0XHR0aGlzLnNob3VsZEZvY3VzQWZ0ZXJMYXlvdXQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5wdXRFZGl0b3IuZm9jdXMoKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnc3ludGhldGljLWZvY3VzJyk7XG5cdH1cblxuXHRoYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dEVkaXRvci5oYXNUZXh0Rm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VFZGl0b3JPcHRpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuaW5wdXRFZGl0b3IudXBkYXRlT3B0aW9ucyh0aGlzLmlucHV0RWRpdG9yT3B0aW9ucy5nZXRFZGl0b3JPcHRpb25zKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJWYWxpZGF0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuY2xlYXJWYWxpZGF0aW9uKCk7XG5cblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgndmFsaWRhdGlvbi1pbmZvJywgdGhpcy52YWxpZGF0aW9uPy50eXBlID09PSBJbnB1dFZhbGlkYXRpb25UeXBlLkluZm9ybWF0aW9uKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgndmFsaWRhdGlvbi13YXJuaW5nJywgdGhpcy52YWxpZGF0aW9uPy50eXBlID09PSBJbnB1dFZhbGlkYXRpb25UeXBlLldhcm5pbmcpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCd2YWxpZGF0aW9uLWVycm9yJywgdGhpcy52YWxpZGF0aW9uPy50eXBlID09PSBJbnB1dFZhbGlkYXRpb25UeXBlLkVycm9yKTtcblxuXHRcdGlmICghdGhpcy52YWxpZGF0aW9uIHx8ICF0aGlzLmlucHV0RWRpdG9yLmhhc1RleHRGb2N1cygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy52YWxpZGF0aW9uTWVzc2FnZUNvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0dGhpcy52YWxpZGF0aW9uQ29udGV4dFZpZXcgPSB0aGlzLmNvbnRleHRWaWV3U2VydmljZS5zaG93Q29udGV4dFZpZXcoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiB0aGlzLmVsZW1lbnQsXG5cdFx0XHRyZW5kZXI6IGNvbnRhaW5lciA9PiB7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5ib3JkZXJCb3R0b21MZWZ0UmFkaXVzID0gJzAnO1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuYm9yZGVyQm90dG9tUmlnaHRSYWRpdXMgPSAnMCc7XG5cblx0XHRcdFx0Y29uc3QgdmFsaWRhdGlvbkNvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5zY20tZWRpdG9yLXZhbGlkYXRpb24tY29udGFpbmVyJykpO1xuXHRcdFx0XHR2YWxpZGF0aW9uQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3ZhbGlkYXRpb24taW5mbycsIHRoaXMudmFsaWRhdGlvbiEudHlwZSA9PT0gSW5wdXRWYWxpZGF0aW9uVHlwZS5JbmZvcm1hdGlvbik7XG5cdFx0XHRcdHZhbGlkYXRpb25Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgndmFsaWRhdGlvbi13YXJuaW5nJywgdGhpcy52YWxpZGF0aW9uIS50eXBlID09PSBJbnB1dFZhbGlkYXRpb25UeXBlLldhcm5pbmcpO1xuXHRcdFx0XHR2YWxpZGF0aW9uQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3ZhbGlkYXRpb24tZXJyb3InLCB0aGlzLnZhbGlkYXRpb24hLnR5cGUgPT09IElucHV0VmFsaWRhdGlvblR5cGUuRXJyb3IpO1xuXHRcdFx0XHR2YWxpZGF0aW9uQ29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7dGhpcy5lbGVtZW50LmNsaWVudFdpZHRoICsgMn1weGA7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBhcHBlbmQodmFsaWRhdGlvbkNvbnRhaW5lciwgJCgnLnNjbS1lZGl0b3ItdmFsaWRhdGlvbicpKTtcblxuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gdGhpcy52YWxpZGF0aW9uIS5tZXNzYWdlO1xuXHRcdFx0XHRpZiAodHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0ZWxlbWVudC50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgdHJhY2tlciA9IHRyYWNrRm9jdXMoZWxlbWVudCk7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRyYWNrZXIpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0cmFja2VyLm9uRGlkRm9jdXMoKCkgPT4gKHRoaXMudmFsaWRhdGlvbkhhc0ZvY3VzID0gdHJ1ZSkpKTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodHJhY2tlci5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy52YWxpZGF0aW9uSGFzRm9jdXMgPSBmYWxzZTtcblx0XHRcdFx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5ib3JkZXJCb3R0b21MZWZ0UmFkaXVzID0gJzJweCc7XG5cdFx0XHRcdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuYm9yZGVyQm90dG9tUmlnaHRSYWRpdXMgPSAnMnB4Jztcblx0XHRcdFx0XHRcdHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLmhpZGVDb250ZXh0VmlldygpO1xuXHRcdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRcdGNvbnN0IHJlbmRlcmVkTWFya2Rvd24gPSB0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihtZXNzYWdlLCB7XG5cdFx0XHRcdFx0XHRhY3Rpb25IYW5kbGVyOiAobGluaywgbWRTdHIpID0+IHtcblx0XHRcdFx0XHRcdFx0b3BlbkxpbmtGcm9tTWFya2Rvd24odGhpcy5vcGVuZXJTZXJ2aWNlLCBsaW5rLCBtZFN0ci5pc1RydXN0ZWQpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuYm9yZGVyQm90dG9tTGVmdFJhZGl1cyA9ICcycHgnO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuYm9yZGVyQm90dG9tUmlnaHRSYWRpdXMgPSAnMnB4Jztcblx0XHRcdFx0XHRcdFx0dGhpcy5jb250ZXh0Vmlld1NlcnZpY2UuaGlkZUNvbnRleHRWaWV3KCk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChyZW5kZXJlZE1hcmtkb3duKTtcblx0XHRcdFx0XHRlbGVtZW50LmFwcGVuZENoaWxkKHJlbmRlcmVkTWFya2Rvd24uZWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGFwcGVuZCh2YWxpZGF0aW9uQ29udGFpbmVyLCAkKCcuc2NtLWVkaXRvci12YWxpZGF0aW9uLWFjdGlvbnMnKSk7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbmJhciA9IG5ldyBBY3Rpb25CYXIoYWN0aW9uc0NvbnRhaW5lcik7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IG5ldyBBY3Rpb24oJ3NjbUlucHV0V2lkZ2V0LnZhbGlkYXRpb25NZXNzYWdlLmNsb3NlJywgbG9jYWxpemUoJ2xhYmVsLmNsb3NlJywgXCJDbG9zZVwiKSwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2UpLCB0cnVlLCAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5jb250ZXh0Vmlld1NlcnZpY2UuaGlkZUNvbnRleHRWaWV3KCk7XG5cdFx0XHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLmJvcmRlckJvdHRvbUxlZnRSYWRpdXMgPSAnMnB4Jztcblx0XHRcdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuYm9yZGVyQm90dG9tUmlnaHRSYWRpdXMgPSAnMnB4Jztcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChhY3Rpb25iYXIpO1xuXHRcdFx0XHRhY3Rpb25iYXIucHVzaChhY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXG5cdFx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0XHR9LFxuXHRcdFx0b25IaWRlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGlvbkhhc0ZvY3VzID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5ib3JkZXJCb3R0b21MZWZ0UmFkaXVzID0gJzJweCc7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5ib3JkZXJCb3R0b21SaWdodFJhZGl1cyA9ICcycHgnO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9LFxuXHRcdFx0YW5jaG9yQWxpZ25tZW50OiBBbmNob3JBbGlnbm1lbnQuTEVGVFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUb29sYmFyV2lkdGgoKTogbnVtYmVyIHtcblx0XHRjb25zdCBzaG93SW5wdXRBY3Rpb25CdXR0b24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdzY20uc2hvd0lucHV0QWN0aW9uQnV0dG9uJyk7XG5cdFx0aWYgKCF0aGlzLnRvb2xiYXIgfHwgIXNob3dJbnB1dEFjdGlvbkJ1dHRvbiB8fCB0aGlzLnRvb2xiYXI/LmlzRW1wdHkoKSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMudG9vbGJhci5kcm9wZG93bkFjdGlvbnMubGVuZ3RoID09PSAwID9cblx0XHRcdDI2IC8qIDIycHggYWN0aW9uICsgNHB4IG1hcmdpbiAqLyA6XG5cdFx0XHQzOSAvKiAzNXB4IGFjdGlvbiArIDRweCBtYXJnaW4gKi87XG5cdH1cblxuXHRjbGVhclZhbGlkYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy52YWxpZGF0aW9uQ29udGV4dFZpZXc/LmNsb3NlKCk7XG5cdFx0dGhpcy52YWxpZGF0aW9uQ29udGV4dFZpZXcgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy52YWxpZGF0aW9uSGFzRm9jdXMgPSBmYWxzZTtcblx0XHR0aGlzLnZhbGlkYXRpb25NZXNzYWdlQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmlucHV0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMucmVwb3NpdG9yeURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmNsZWFyVmFsaWRhdGlvbigpO1xuXHRcdGNsZWFyVGltZW91dCh0aGlzLl92YWxpZGF0aW9uVGltZXIpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU0NNSW5wdXRXaWRnZXRDb21tYW5kSWQuU2V0dXBBY3Rpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NjbUlucHV0R2VuZXJhdGVDb21taXRNZXNzYWdlJywgXCJHZW5lcmF0ZSBDb21taXQgTWVzc2FnZVwiKSxcblx0XHRcdGljb246IENvZGljb24uc3BhcmtsZSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5TQ01JbnB1dEJveCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmNvbXBsZXRlZC5uZWdhdGUoKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3NjbVByb3ZpZGVyJywgJ2dpdCcpXG5cdFx0XHRcdClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENIQVRfU0VUVVBfU1VQUE9SVF9BTk9OWU1PVVNfQUNUSU9OX0lEKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmQgPSBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LmdlbmVyYXRlQ29tbWl0TWVzc2FnZUNvbW1hbmQ7XG5cdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZCwgLi4uYXJncyk7XG5cdH1cbn0pO1xuXG5zZXR1cFNpbXBsZUVkaXRvclNlbGVjdGlvblN0eWxpbmcoJy5zY20tdmlldyAuc2NtLWVkaXRvci1jb250YWluZXInKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsT0FBTyxlQUFlO0FBQy9CLFNBQVMsWUFBWSxpQkFBaUIseUJBQXlCO0FBQy9ELFNBQVMsUUFBUSxHQUFHLFdBQVcsa0JBQWtCO0FBQ2pELFNBQVMscUJBQWtELGlCQUFpQiw0QkFBMkQ7QUFDdkksU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxxQkFBcUIsMkJBQTZDO0FBQzNFLFNBQVMsb0JBQWlDLGdCQUFnQixxQkFBcUI7QUFDL0UsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQkFBZ0IsY0FBYyxp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U0FBSyw0QkFBNEIsSUFBSSxLQUFLO0FBQUEsRUFDM0M7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsU0FBSyxRQUFRO0FBQ2IsU0FBSyxzQkFBc0IsUUFBUTtBQUNuQyxTQUFLLGdCQUFnQjtBQUNyQixpQkFBYSxLQUFLLGdCQUFnQjtBQUNsQyxTQUFLLFlBQVksUUFBUTtBQUFBLEVBQzFCO0FBQ0Q7QUFwZWEsZUFFWSxxQkFBcUQ7QUFBQSxFQUM1RSxDQUFDLG9CQUFvQixXQUFXLEdBQUc7QUFBQSxFQUNuQyxDQUFDLG9CQUFvQixPQUFPLEdBQUc7QUFBQSxFQUMvQixDQUFDLG9CQUFvQixLQUFLLEdBQUc7QUFDOUI7QUFOWSxpQkFBTjtBQUFBLEVBdU5KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FoT1U7QUFzZWIsZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLEVBQ3JDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsaUNBQWlDLHlCQUF5QjtBQUFBLE1BQzFFLE1BQU0sUUFBUTtBQUFBLE1BQ2QsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLFFBQ0wsSUFBSSxPQUFPO0FBQUEsUUFDWCxNQUFNLGVBQWU7QUFBQSxVQUNwQixnQkFBZ0IsTUFBTSxPQUFPLE9BQU87QUFBQSxVQUNwQyxnQkFBZ0IsTUFBTSxvQkFBb0IsT0FBTztBQUFBLFVBQ2pELGdCQUFnQixNQUFNLFVBQVUsT0FBTztBQUFBLFVBQ3ZDLGVBQWUsT0FBTyxlQUFlLEtBQUs7QUFBQSxRQUMzQztBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFlLElBQUksYUFBK0IsTUFBZ0M7QUFDakYsVUFBTSxpQkFBaUIsU0FBUyxJQUFJLGVBQWU7QUFFbkQsVUFBTSxTQUFTLE1BQU0sZUFBZSxlQUFlLHNDQUFzQztBQUN6RixRQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsSUFDRDtBQUVBLFVBQU0sVUFBVSxRQUFRLGtCQUFrQjtBQUMxQyxRQUFJLENBQUMsU0FBUztBQUNiO0FBQUEsSUFDRDtBQUVBLFVBQU0sZUFBZSxlQUFlLFNBQVMsR0FBRyxJQUFJO0FBQUEsRUFDckQ7QUFDRCxDQUFDO0FBRUQsa0NBQWtDLGlDQUFpQzsiLAogICJuYW1lcyI6IFsiU0NNSW5wdXRXaWRnZXRDb21tYW5kSWQiLCAiU0NNSW5wdXRXaWRnZXRTdG9yYWdlS2V5Il0KfQo=
