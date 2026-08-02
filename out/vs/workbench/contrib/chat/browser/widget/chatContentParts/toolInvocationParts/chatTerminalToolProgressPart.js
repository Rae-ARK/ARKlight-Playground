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
import { h } from "../../../../../../../base/browser/dom.js";
import { createPixelSpinner } from "../../../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js";
import { isMarkdownString, MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { ChatConfiguration } from "../../../../common/constants.js";
import { migrateLegacyTerminalToolSpecificData } from "../../../../common/chat.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { IChatWidgetService } from "../../../chat.js";
import { ChatQueryTitlePart } from "../chatConfirmationWidget.js";
import { ChatMarkdownContentPart } from "../chatMarkdownContentPart.js";
import { ChatProgressSubPart } from "../chatProgressContentPart.js";
import { ChatResourceGroupWidget } from "../chatResourceGroupWidget.js";
import { BaseChatToolInvocationSubPart } from "./chatToolInvocationSubPart.js";
import { extractImagesFromToolInvocationOutputDetails } from "../../../../common/chatImageExtraction.js";
import { TerminalToolAutoExpand } from "./terminalToolAutoExpand.js";
import { ChatCollapsibleContentPart } from "../chatCollapsibleContentPart.js";
import { isResponseVM } from "../../../../common/model/chatViewModel.js";
import "../media/chatTerminalToolProgressPart.css";
import { Action } from "../../../../../../../base/common/actions.js";
import { ActionBar } from "../../../../../../../base/browser/ui/actionbar/actionbar.js";
import { timeout } from "../../../../../../../base/common/async.js";
import { ITerminalChatService, ITerminalConfigurationService, ITerminalEditorService, ITerminalGroupService, ITerminalService } from "../../../../../terminal/browser/terminal.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { Emitter, Event } from "../../../../../../../base/common/event.js";
import { autorun } from "../../../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../../../base/common/themables.js";
import { DecorationSelector, getTerminalCommandDecorationState, getTerminalCommandDecorationTooltip } from "../../../../../terminal/browser/xterm/decorationStyles.js";
import * as dom from "../../../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../../../../base/common/keyCodes.js";
import { DomScrollableElement } from "../../../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../../../../../base/common/scrollable.js";
import { localize } from "../../../../../../../nls.js";
import { TerminalCapability } from "../../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { stripIcons } from "../../../../../../../base/common/iconLabels.js";
import { IAccessibleViewService } from "../../../../../../../platform/accessibility/browser/accessibleView.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { AccessibilityVerbositySettingId } from "../../../../../accessibility/browser/accessibilityConfiguration.js";
import { ChatContextKeys } from "../../../../common/actions/chatContextKeys.js";
import { DetachedTerminalCommandMirror, DetachedTerminalSnapshotMirror } from "../../../../../terminal/browser/chatTerminalCommandMirror.js";
import { TerminalLocation } from "../../../../../../../platform/terminal/common/terminal.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { TerminalContribCommandId } from "../../../../../terminal/terminalContribExports.js";
import { ITelemetryService } from "../../../../../../../platform/telemetry/common/telemetry.js";
import { isNumber } from "../../../../../../../base/common/types.js";
import { removeAnsiEscapeCodes } from "../../../../../../../base/common/strings.js";
import { PANEL_BACKGROUND } from "../../../../../../common/theme.js";
import { editorBackground } from "../../../../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../../../../platform/theme/common/themeService.js";
import { CommandsRegistry } from "../../../../../../../platform/commands/common/commands.js";
const MIN_OUTPUT_ROWS = 1;
const MAX_OUTPUT_ROWS = 10;
const MAX_COMMAND_TITLE_LENGTH = 50;
const MAX_OUTPUT_POLL_RETRIES = 10;
const OUTPUT_POLL_DELAY_MS = 100;
const MIN_DATA_EVENTS_FOR_REAL_OUTPUT = 2;
const expandedStateByInvocation = /* @__PURE__ */ new WeakMap();
CommandsRegistry.registerCommand(TerminalContribCommandId.FocusChatInstanceAction, async (_accessor, progressPart) => {
  await progressPart?.focusTerminal();
});
CommandsRegistry.registerCommand(TerminalContribCommandId.ContinueInBackground, async (_accessor, progressPart) => {
  progressPart?.continueInBackground();
});
CommandsRegistry.registerCommand(TerminalContribCommandId.ToggleChatTerminalOutput, async (_accessor, progressPart) => {
  await progressPart?.toggleOutputFromAction();
});
let TerminalCommandDecoration = class extends Disposable {
  constructor(_options, _hoverService) {
    super();
    this._options = _options;
    this._hoverService = _hoverService;
    this._hoverRegistered = false;
    const decorationElements = h("span.chat-terminal-command-decoration@decoration", { role: "img", tabIndex: 0 });
    this._element = decorationElements.decoration;
    this._register(createPixelSpinner(this._element));
    this._attachElementToContainer();
  }
  _attachElementToContainer() {
    const container = this._options.getCommandBlock();
    if (!container) {
      return;
    }
    const decoration = this._element;
    if (!decoration.isConnected || decoration.parentElement !== container) {
      const icon = this._options.getIconElement();
      if (icon && icon.parentElement === container) {
        icon.insertAdjacentElement("afterend", decoration);
      } else {
        container.insertBefore(decoration, container.firstElementChild ?? null);
      }
    }
    if (!this._hoverRegistered) {
      this._hoverRegistered = true;
      this._register(this._hoverService.setupDelayedHover(decoration, () => ({
        content: this._getHoverText()
      })));
    }
  }
  _getHoverText() {
    const command = this._options.getResolvedCommand();
    const { effectiveCommand, storedState } = this._getDecorationInput(command);
    return getTerminalCommandDecorationTooltip(effectiveCommand, storedState) || "";
  }
  update(command) {
    this._attachElementToContainer();
    const decoration = this._element;
    const resolvedCommand = command ?? this._options.getResolvedCommand();
    this._apply(decoration, resolvedCommand);
  }
  _apply(decoration, command) {
    const terminalData = this._options.terminalData;
    if (terminalData.isPty !== false && command) {
      const existingState = terminalData.terminalCommandState ?? {};
      terminalData.terminalCommandState = {
        ...existingState,
        exitCode: command.exitCode,
        timestamp: command.timestamp ?? existingState.timestamp,
        duration: command.duration ?? existingState.duration
      };
    } else if (terminalData.isPty !== false && !terminalData.terminalCommandState) {
      const now = Date.now();
      terminalData.terminalCommandState = { exitCode: void 0, timestamp: now };
    }
    const { effectiveCommand, storedState } = this._getDecorationInput(command);
    const decorationState = getTerminalCommandDecorationState(effectiveCommand, storedState);
    const tooltip = getTerminalCommandDecorationTooltip(effectiveCommand, storedState);
    const isRunning = this._options.getIsRunning();
    decoration.className = `chat-terminal-command-decoration ${DecorationSelector.CommandDecoration}`;
    if (isRunning) {
      const nonIconClasses = decorationState.classNames.filter((c) => c !== DecorationSelector.Codicon && !c.startsWith("codicon-"));
      decoration.classList.add("chat-terminal-running-spinner", ...nonIconClasses);
    } else {
      decoration.classList.add(DecorationSelector.Codicon, ...decorationState.classNames, ...ThemeIcon.asClassNameArray(decorationState.icon));
    }
    const isInteractive = !decoration.classList.contains(DecorationSelector.Default);
    decoration.tabIndex = isInteractive ? 0 : -1;
    if (isInteractive) {
      decoration.removeAttribute("aria-disabled");
    } else {
      decoration.setAttribute("aria-disabled", "true");
    }
    const hoverText = tooltip || decorationState.hoverMessage;
    if (hoverText) {
      decoration.setAttribute("aria-label", hoverText);
    } else {
      decoration.removeAttribute("aria-label");
    }
  }
  _getDecorationInput(command) {
    let storedState = this._options.terminalData.terminalCommandState;
    if (this._options.terminalData.isPty !== false) {
      return { effectiveCommand: command, storedState };
    }
    const exitCode = this._options.getExitCode();
    storedState = exitCode === void 0 ? storedState : { ...storedState, exitCode };
    return {
      effectiveCommand: command?.exitCode === void 0 && storedState?.exitCode !== void 0 ? void 0 : command,
      storedState
    };
  }
};
TerminalCommandDecoration = __decorateClass([
  __decorateParam(1, IHoverService)
], TerminalCommandDecoration);
let ChatTerminalToolProgressPart = class extends BaseChatToolInvocationSubPart {
  constructor(toolInvocation, terminalData, context, renderer, editorPool, currentWidthDelegate, codeBlockStartIndex, _instantiationService, _terminalChatService, _terminalService, _contextKeyService, _chatWidgetService, _configurationService, _terminalEditorService, _terminalGroupService, _telemetryService) {
    super(toolInvocation);
    this._instantiationService = _instantiationService;
    this._terminalChatService = _terminalChatService;
    this._terminalService = _terminalService;
    this._contextKeyService = _contextKeyService;
    this._chatWidgetService = _chatWidgetService;
    this._configurationService = _configurationService;
    this._terminalEditorService = _terminalEditorService;
    this._terminalGroupService = _terminalGroupService;
    this._telemetryService = _telemetryService;
    // Toolbar state that drives action visibility (replaces context keys to avoid
    // accumulating listeners on the shared IContextKeyService when many parts exist)
    this._toolbarHasInstance = false;
    this._toolbarCanContinueInBackground = false;
    this._toolbarHasOutput = false;
    this._toolbarIsHiddenTerminal = false;
    this._toolbarOutputExpanded = false;
    this._actionBarActions = new DisposableStore();
    this._outputSourceListener = this._register(new MutableDisposable());
    this._userToggledOutput = false;
    this._isInThinkingContainer = false;
    this._usesCollapsibleWrapper = false;
    this._elementIndex = context.elementIndex;
    this._contentIndex = context.contentIndex;
    this._sessionResource = context.element.sessionResource;
    this._forceExpandTerminalOutput = isResponseVM(context.element) && context.element.isTerminalCommand;
    terminalData = migrateLegacyTerminalToolSpecificData(terminalData);
    this._terminalData = terminalData;
    this._terminalCommandUri = terminalData.terminalCommandUri ? URI.revive(terminalData.terminalCommandUri) : void 0;
    this._isSerializedInvocation = toolInvocation.kind === "toolInvocationSerialized";
    const elements = h(".chat-terminal-content-part@container", [
      h(".chat-terminal-content-title@title", [
        h(".chat-terminal-command-block@commandBlock")
      ]),
      h(".chat-terminal-content-message@message")
    ]);
    this._titleElement = elements.title;
    const command = (terminalData.commandLine.forDisplay ?? terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original).trimStart();
    this._commandText = command;
    this._terminalOutputContextKey = ChatContextKeys.inChatTerminalToolOutput.bindTo(this._contextKeyService);
    this._decoration = this._register(this._instantiationService.createInstance(TerminalCommandDecoration, {
      terminalData: this._terminalData,
      getCommandBlock: () => elements.commandBlock,
      getIconElement: () => void 0,
      getResolvedCommand: () => this._getResolvedCommand(),
      getIsRunning: () => this._isInvocationRunning(),
      getExitCode: () => this._outputSource?.exitCode
    }));
    const displayCommand = terminalData.presentationOverrides?.commandLine ?? command;
    const displayLanguage = terminalData.presentationOverrides?.language ?? terminalData.language;
    const titlePart = this._register(_instantiationService.createInstance(
      ChatQueryTitlePart,
      elements.commandBlock,
      new MarkdownString([
        `\`\`\`${displayLanguage}`,
        `${displayCommand.replaceAll("```", "\\`\\`\\`")}`,
        `\`\`\``
      ].join("\n"), { supportThemeIcons: true }),
      void 0
    ));
    this._register(titlePart.onDidChangeHeight(() => {
      this._decoration.update();
    }));
    this._outputView = this._register(this._instantiationService.createInstance(
      ChatTerminalToolOutputSection,
      () => this._ensureTerminalInstance(),
      () => this._getResolvedCommand(),
      () => this._outputSource,
      () => this._terminalData.terminalCommandOutput,
      () => this._commandText,
      () => this._terminalData.terminalTheme,
      () => this._isInvocationRunning(),
      !!this._terminalData.terminalToolSessionId
    ));
    if (this._terminalData.terminalToolSessionId || this._terminalData.terminalCommandOutput) {
      elements.container.append(this._outputView.domNode);
    }
    this._register(this._outputView.onDidFocus(() => this._handleOutputFocus()));
    this._register(this._outputView.onDidBlur((e) => this._handleOutputBlur(e)));
    this._register(toDisposable(() => this._handleDispose()));
    const actionBarEl = h(".chat-terminal-action-bar@actionBar");
    elements.title.append(actionBarEl.root);
    this._actionBar = this._register(new ActionBar(actionBarEl.actionBar));
    this._register(this._actionBarActions);
    let didInitializeTerminalActions = false;
    const initializeTerminalActionsOnce = () => {
      if (didInitializeTerminalActions || this._store.isDisposed) {
        return;
      }
      didInitializeTerminalActions = true;
      this._initializeTerminalActions();
    };
    initializeTerminalActionsOnce();
    this._terminalService.whenConnected.then(() => {
      initializeTerminalActionsOnce();
    });
    const terminalToolSessionId = this._terminalData.terminalToolSessionId;
    if (terminalToolSessionId) {
      if (this._terminalData.isPty === false) {
        this._attachOutputSource();
        this._register(this._terminalChatService.onDidRegisterOutputSource((sessionId) => {
          if (sessionId === terminalToolSessionId) {
            this._attachOutputSource();
          }
        }));
      }
      this._register(this._terminalChatService.onDidContinueInBackground((sessionId) => {
        if (sessionId === terminalToolSessionId) {
          this._terminalData.didContinueInBackground = true;
          this._toolbarCanContinueInBackground = false;
          this._updateToolbarActions();
        }
      }));
    }
    let pastTenseMessage;
    if (toolInvocation.pastTenseMessage) {
      pastTenseMessage = `${typeof toolInvocation.pastTenseMessage === "string" ? toolInvocation.pastTenseMessage : toolInvocation.pastTenseMessage.value}`;
    }
    const markdownContent = new MarkdownString(pastTenseMessage, {
      supportThemeIcons: true,
      isTrusted: isMarkdownString(toolInvocation.pastTenseMessage) ? toolInvocation.pastTenseMessage.isTrusted : false
    });
    const chatMarkdownContent = {
      kind: "markdownContent",
      content: markdownContent
    };
    const codeBlockRenderOptions = {
      hideToolbar: true,
      reserveWidth: 19,
      verticalPadding: 5,
      editorOptions: {
        wordWrap: "on"
      }
    };
    const markdownOptions = {
      codeBlockRenderOptions,
      accessibilityOptions: pastTenseMessage ? {
        statusMessage: localize("terminalToolCommand", "{0}", stripIcons(pastTenseMessage))
      } : void 0
    };
    this.markdownPart = this._register(_instantiationService.createInstance(ChatMarkdownContentPart, chatMarkdownContent, context, editorPool, false, codeBlockStartIndex, renderer, {}, currentWidthDelegate(), markdownOptions));
    elements.message.append(this.markdownPart.domNode);
    const progressPart = this._register(_instantiationService.createInstance(ChatProgressSubPart, elements.container, this.getIcon(), terminalData.autoApproveInfo));
    progressPart.domNode.classList.add("chat-terminal-progress-row");
    this._decoration.update();
    if (toolInvocation.kind === "toolInvocation") {
      this._register(autorun((reader) => {
        toolInvocation.state.read(reader);
        this._decoration.update();
      }));
    }
    const terminalToolsInThinking = this._configurationService.getValue(ChatConfiguration.TerminalToolsInThinking);
    const isSimpleTerminal = this._configurationService.getValue(ChatConfiguration.SimpleTerminalCollapsible);
    const requiresConfirmation = toolInvocation.kind === "toolInvocation" && IChatToolInvocation.getConfirmationMessages(toolInvocation);
    this._isInThinkingContainer = terminalToolsInThinking && !requiresConfirmation;
    this._usesCollapsibleWrapper = this._isInThinkingContainer || isSimpleTerminal;
    if (this._usesCollapsibleWrapper) {
      this.domNode = this._createCollapsibleWrapper(progressPart.domNode, displayCommand, toolInvocation, context);
    } else {
      this.domNode = progressPart.domNode;
    }
    this._renderImagePills(toolInvocation, context, elements.container);
    const hasStoredOutput = !!terminalData.terminalCommandOutput;
    const storedExpandedState = expandedStateByInvocation.get(toolInvocation);
    const hasStoredExpandedState = expandedStateByInvocation.has(toolInvocation);
    if (storedExpandedState || !hasStoredExpandedState && this._forceExpandTerminalOutput || this._isInThinkingContainer && IChatToolInvocation.isComplete(toolInvocation) && hasStoredOutput) {
      void this._toggleOutput(true);
    }
    this._register(this._terminalChatService.registerProgressPart(this));
  }
  get codeblocks() {
    return this.markdownPart?.codeblocks ?? [];
  }
  get elementIndex() {
    return this._elementIndex;
  }
  get contentIndex() {
    return this._contentIndex;
  }
  /**
   * Renders image attachment pills below the terminal output when the tool
   * result contains image data parts. For collapsible wrappers, the single
   * widget is reparented between inside/outside based on expanded state.
   */
  _renderImagePills(toolInvocation, context, innerContainer) {
    const renderImages = () => {
      const extracted = extractImagesFromToolInvocationOutputDetails(toolInvocation, context.element.sessionResource);
      const imageParts = extracted.map((img) => ({
        kind: "data",
        value: img.data.buffer,
        mimeType: img.mimeType,
        uri: img.uri
      }));
      if (imageParts.length === 0) {
        return;
      }
      const widget = this._register(this._instantiationService.createInstance(ChatResourceGroupWidget, imageParts));
      if (this._thinkingCollapsibleWrapper) {
        const wrapper = this._thinkingCollapsibleWrapper;
        const placeWidget = (expanded) => {
          if (expanded) {
            innerContainer.appendChild(widget.domNode);
          } else {
            wrapper.domNode.appendChild(widget.domNode);
          }
        };
        placeWidget(wrapper.expanded.get());
        this._register(autorun((reader) => {
          placeWidget(wrapper.expanded.read(reader));
        }));
      } else {
        innerContainer.appendChild(widget.domNode);
      }
    };
    if (toolInvocation.kind === "toolInvocationSerialized") {
      renderImages();
    } else {
      this._register(autorun((reader) => {
        const state = toolInvocation.state.read(reader);
        if (state.type === IChatToolInvocation.StateKind.Completed) {
          renderImages();
        }
      }));
    }
  }
  _createCollapsibleWrapper(contentElement, commandText, toolInvocation, context) {
    const truncatedCommand = commandText.length > MAX_COMMAND_TITLE_LENGTH ? commandText.substring(0, MAX_COMMAND_TITLE_LENGTH) + "..." : commandText;
    const toolInvocationComplete = IChatToolInvocation.isComplete(toolInvocation);
    const isRunningInBackground = toolInvocationComplete && this._isInvocationRunning();
    const isComplete = toolInvocationComplete && !isRunningInBackground;
    const isSkipped = IChatToolInvocation.executionConfirmedOrDenied(toolInvocation)?.type === ToolConfirmKind.Skipped;
    const autoExpandFailures = this._configurationService.getValue(ChatConfiguration.AutoExpandToolFailures);
    const hasError = autoExpandFailures && this._terminalData.terminalCommandState?.exitCode !== void 0 && this._terminalData.terminalCommandState.exitCode !== 0;
    const initialExpanded = !isComplete || hasError || this._forceExpandTerminalOutput;
    const wrapper = this._register(this._instantiationService.createInstance(
      ChatTerminalThinkingCollapsibleWrapper,
      truncatedCommand,
      this._terminalData.intention,
      this._terminalData.commandLine.isSandboxWrapped === true,
      contentElement,
      context,
      initialExpanded,
      isComplete,
      isSkipped,
      isRunningInBackground,
      this._terminalData.isPty === false ? void 0 : () => this.focusTerminal()
    ));
    this._thinkingCollapsibleWrapper = wrapper;
    let isFirstRun = true;
    this._register(autorun((r) => {
      const expanded = wrapper.expanded.read(r);
      if (isFirstRun) {
        isFirstRun = false;
        return;
      }
      this._toggleOutput(expanded);
    }));
    return wrapper.domNode;
  }
  expandCollapsibleWrapper() {
    this._thinkingCollapsibleWrapper?.expand();
  }
  markCollapsibleWrapperComplete() {
    this._thinkingCollapsibleWrapper?.markComplete();
  }
  async _initializeTerminalActions() {
    if (this._store.isDisposed) {
      return;
    }
    const terminalToolSessionId = this._terminalData.terminalToolSessionId;
    if (!terminalToolSessionId) {
      this._updateToolbarContextKeys();
      return;
    }
    if (this._terminalData.isPty === false) {
      this._attachOutputSource();
      this._updateToolbarContextKeys(void 0, terminalToolSessionId);
      return;
    }
    const attachInstance = async (instance) => {
      if (this._store.isDisposed) {
        return;
      }
      if (!instance) {
        if (this._isSerializedInvocation) {
          this._clearCommandAssociation();
        }
        this._updateToolbarContextKeys(void 0, terminalToolSessionId);
        return;
      }
      const isNewInstance = this._terminalInstance !== instance;
      if (isNewInstance) {
        this._terminalInstance = instance;
        this._registerInstanceListener(instance);
      }
      this._updateToolbarContextKeys(instance, terminalToolSessionId);
    };
    const initialInstance = await this._terminalChatService.getTerminalInstanceByToolSessionId(terminalToolSessionId);
    await attachInstance(initialInstance);
    if (!initialInstance) {
      this._updateToolbarContextKeys(void 0, terminalToolSessionId);
    }
    if (this._store.isDisposed) {
      return;
    }
    if (!this._terminalSessionRegistration) {
      const listener = this._terminalChatService.onDidRegisterTerminalInstanceWithToolSession(async (instance) => {
        const registeredInstance = await this._terminalChatService.getTerminalInstanceByToolSessionId(terminalToolSessionId);
        if (instance !== registeredInstance) {
          return;
        }
        this._terminalSessionRegistration?.dispose();
        this._terminalSessionRegistration = void 0;
        await attachInstance(instance);
      });
      this._terminalSessionRegistration = this._store.add(listener);
    }
  }
  /**
   * Updates the scoped context keys that drive toolbar action visibility.
   * The ActionBar is rebuilt with the correct set of visible actions.
   */
  _updateToolbarContextKeys(terminalInstance, terminalToolSessionId) {
    if (this._store.isDisposed) {
      return;
    }
    const resolvedCommand = this._getResolvedCommand(terminalInstance);
    this._toolbarHasInstance = !!terminalInstance;
    if (terminalInstance && terminalToolSessionId) {
      this._toolbarIsHiddenTerminal = this._terminalChatService.isBackgroundTerminal(terminalToolSessionId);
    } else {
      this._toolbarIsHiddenTerminal = false;
    }
    if (terminalInstance && terminalToolSessionId && !this._terminalData.isBackground && !this._terminalData.didContinueInBackground) {
      const isStillRunning = resolvedCommand?.exitCode === void 0 && this._terminalData.terminalCommandState?.exitCode === void 0;
      this._toolbarCanContinueInBackground = isStillRunning;
    } else {
      this._toolbarCanContinueInBackground = false;
    }
    if (!this._usesCollapsibleWrapper) {
      const hasSnapshot = !!this._terminalData.terminalCommandOutput || !!this._outputSource?.output;
      const hasOutput = !!resolvedCommand || hasSnapshot;
      this._toolbarHasOutput = hasOutput;
      if (hasOutput && !this._outputView.isExpanded) {
        const autoExpandFailures = this._configurationService.getValue(ChatConfiguration.AutoExpandToolFailures);
        const exitCode = resolvedCommand?.exitCode ?? this._outputSource?.exitCode ?? this._terminalData.terminalCommandState?.exitCode;
        if (exitCode !== void 0 && exitCode !== 0 && autoExpandFailures) {
          this._toggleOutput(true);
        }
      }
    }
    this._updateToolbarActions();
    this._decoration.update(resolvedCommand);
  }
  /**
   * Rebuilds the ActionBar actions based on current toolbar state.
   */
  _updateToolbarActions() {
    if (!this._actionBar || this._store.isDisposed) {
      return;
    }
    this._actionBar.clear();
    this._actionBarActions.clear();
    const actions = [];
    if (this._toolbarCanContinueInBackground) {
      const action = new Action(
        TerminalContribCommandId.ContinueInBackground,
        localize("continueInBackground", "Continue in Background"),
        ThemeIcon.asClassName(Codicon.debugContinueSmall),
        true,
        () => this.continueInBackground()
      );
      this._actionBarActions.add(action);
      actions.push(action);
    }
    if (this._toolbarHasInstance) {
      const focusLabel = this._toolbarIsHiddenTerminal ? localize("showTerminal", "Show and Focus Terminal") : localize("focusTerminal", "Focus Terminal");
      const action = new Action(
        TerminalContribCommandId.FocusChatInstanceAction,
        focusLabel,
        ThemeIcon.asClassName(Codicon.openInProduct),
        true,
        () => this.focusTerminal()
      );
      this._actionBarActions.add(action);
      actions.push(action);
    }
    if (this._toolbarHasOutput && !this._usesCollapsibleWrapper) {
      const toggleIcon = this._toolbarOutputExpanded ? Codicon.chevronDown : Codicon.chevronRight;
      const toggleLabel = this._toolbarOutputExpanded ? localize("hideTerminalOutput", "Hide Output") : localize("showTerminalOutput", "Show Output");
      const action = new Action(
        TerminalContribCommandId.ToggleChatTerminalOutput,
        toggleLabel,
        ThemeIcon.asClassName(toggleIcon),
        true,
        () => this.toggleOutputFromAction()
      );
      this._actionBarActions.add(action);
      actions.push(action);
    }
    this._actionBar.push(actions, { icon: true, label: false });
  }
  _getResolvedCommand(instance) {
    const target = instance ?? this._terminalInstance;
    if (!target) {
      return void 0;
    }
    return this._resolveCommand(target);
  }
  _isInvocationRunning() {
    const currentTerminalData = this.toolInvocation.toolSpecificData?.kind === "terminal" ? migrateLegacyTerminalToolSpecificData(this.toolInvocation.toolSpecificData) : this._terminalData;
    if (currentTerminalData.isPty === false) {
      if (this._outputSource?.exitCode !== void 0 || currentTerminalData.terminalCommandState?.exitCode !== void 0) {
        return false;
      }
      if (!IChatToolInvocation.isComplete(this.toolInvocation)) {
        return true;
      }
      return currentTerminalData.isBackground === true || currentTerminalData.didContinueInBackground === true;
    }
    const commandExitCode = this._getResolvedCommand()?.exitCode;
    if (commandExitCode !== void 0) {
      return false;
    }
    const storedExitCode = currentTerminalData.terminalCommandState?.exitCode;
    if (storedExitCode !== void 0) {
      return false;
    }
    if (!IChatToolInvocation.isComplete(this.toolInvocation)) {
      return true;
    }
    return currentTerminalData.isBackground === true || currentTerminalData.didContinueInBackground === true;
  }
  _clearCommandAssociation(options) {
    this._terminalCommandUri = void 0;
    if (options?.clearPersistentData) {
      if (this._terminalData.terminalCommandUri) {
        delete this._terminalData.terminalCommandUri;
      }
      if (this._terminalData.terminalToolSessionId) {
        delete this._terminalData.terminalToolSessionId;
      }
    }
    this._decoration.update();
  }
  /**
   * Determines whether the terminal output should auto-expand.
   * Returns false if already expanded, user has manually toggled, component is disposed,
   * or if the invocation was previously expanded (to preserve state across re-renders).
   */
  _shouldAutoExpand() {
    return !this._outputView.isExpanded && !this._userToggledOutput && !this._store.isDisposed && (!this._forceExpandTerminalOutput || !expandedStateByInvocation.has(this.toolInvocation)) && !expandedStateByInvocation.get(this.toolInvocation);
  }
  /**
   * Registers event listeners on the terminal instance to track command execution,
   * manage auto-expansion of output, and handle command completion.
   *
   * This method sets up:
   * - Command detection listeners for tracking command lifecycle
   * - Auto-expand logic based on command output and duration
   * - Instance disposal handling to clean up actions and state
   */
  _registerInstanceListener(terminalInstance) {
    const commandDetectionListener = this._register(new MutableDisposable());
    const tryResolveCommand = async () => {
      const resolvedCommand = this._resolveCommand(terminalInstance);
      this._updateToolbarContextKeys(terminalInstance, this._terminalData.terminalToolSessionId);
      return resolvedCommand;
    };
    const attachCommandDetection = async (commandDetection) => {
      commandDetectionListener.clear();
      if (!commandDetection) {
        const ahpSource = this._terminalData.terminalToolSessionId ? this._terminalChatService.getAhpCommandSource(this._terminalData.terminalToolSessionId) : void 0;
        if (ahpSource) {
          this._attachAhpCommandSource(terminalInstance, ahpSource, commandDetectionListener);
        }
        await tryResolveCommand();
        return;
      }
      const store = new DisposableStore();
      let receivedDataCount = 0;
      const hasRealOutput = () => {
        if (this._terminalData.terminalCommandOutput?.text?.trim()) {
          return true;
        }
        const command = this._getResolvedCommand(terminalInstance);
        if (!command?.executedMarker || terminalInstance.isDisposed) {
          return false;
        }
        const buffer = terminalInstance.xterm?.raw.buffer.active;
        if (!buffer) {
          return false;
        }
        const cursorLine = buffer.baseY + buffer.cursorY;
        if (cursorLine > command.executedMarker.line) {
          return true;
        }
        return receivedDataCount > MIN_DATA_EVENTS_FOR_REAL_OUTPUT;
      };
      const autoExpand = store.add(new TerminalToolAutoExpand({
        onCommandExecuted: Event.map(commandDetection.onCommandExecuted, () => void 0),
        onCommandFinished: Event.map(commandDetection.onCommandFinished, () => void 0),
        onWillData: terminalInstance.onWillData,
        shouldAutoExpand: () => this._shouldAutoExpand(),
        hasRealOutput
      }));
      store.add(autoExpand.onDidRequestExpand(() => {
        if (this._usesCollapsibleWrapper) {
          this.expandCollapsibleWrapper();
        }
        this._toggleOutput(true);
      }));
      store.add(terminalInstance.onWillData(() => {
        receivedDataCount++;
      }));
      store.add(commandDetection.onCommandExecuted(() => {
        this._updateToolbarContextKeys(terminalInstance, this._terminalData.terminalToolSessionId);
      }));
      store.add(commandDetection.onCommandFinished(() => {
        this._updateToolbarContextKeys(terminalInstance, this._terminalData.terminalToolSessionId);
        const resolvedCommand = this._getResolvedCommand(terminalInstance);
        this._handleCommandCompletion(resolvedCommand);
        if (resolvedCommand?.endMarker) {
          commandDetectionListener.clear();
        }
      }));
      commandDetectionListener.value = store;
      const resolvedImmediately = await tryResolveCommand();
      if (resolvedImmediately?.endMarker) {
        commandDetectionListener.clear();
        this._handleCommandCompletion(resolvedImmediately);
        return;
      }
    };
    attachCommandDetection(terminalInstance.capabilities.get(TerminalCapability.CommandDetection));
    this._register(terminalInstance.capabilities.onDidAddCommandDetectionCapability((cd) => attachCommandDetection(cd)));
    const instanceListener = this._register(terminalInstance.onDisposed(() => {
      if (this._terminalInstance === terminalInstance) {
        this._terminalInstance = void 0;
      }
      this._clearCommandAssociation({ clearPersistentData: true });
      commandDetectionListener.clear();
      this._updateToolbarContextKeys(void 0, this._terminalData.terminalToolSessionId);
      instanceListener.dispose();
    }));
  }
  /**
   * Sets up listeners using an {@link IAhpTerminalCommandSource} when no local
   * `ICommandDetectionCapability` is available. Provides auto-expand, toolbar
   * context key updates, and command completion handling.
   */
  _attachAhpCommandSource(terminalInstance, ahpSource, commandDetectionListener) {
    const store = new DisposableStore();
    const hasRealOutput = () => {
      const command = this._getResolvedCommand(terminalInstance);
      if (command?.hasOutput()) {
        return true;
      }
      return !!this._terminalData.terminalCommandOutput?.text?.trim();
    };
    const autoExpand = store.add(new TerminalToolAutoExpand({
      onCommandExecuted: Event.map(ahpSource.onCommandExecuted, () => void 0),
      onCommandFinished: Event.map(ahpSource.onCommandFinished, () => void 0),
      onWillData: terminalInstance.onWillData,
      shouldAutoExpand: () => this._shouldAutoExpand(),
      hasRealOutput
    }));
    store.add(autoExpand.onDidRequestExpand(() => {
      if (this._usesCollapsibleWrapper) {
        this.expandCollapsibleWrapper();
      }
      this._toggleOutput(true);
    }));
    store.add(ahpSource.onCommandExecuted((cmd) => {
      if (!this._terminalData.terminalCommandId && cmd.id) {
        this._terminalData.terminalCommandId = cmd.id;
        this._updateToolbarContextKeys(terminalInstance, this._terminalData.terminalToolSessionId);
      }
      if (this._outputView.isExpanded) {
        void this._toggleOutput(true);
      }
    }));
    store.add(ahpSource.onCommandFinished((cmd) => {
      if (this._terminalData.terminalCommandId === cmd.id) {
        this._updateToolbarContextKeys(terminalInstance, this._terminalData.terminalToolSessionId);
        const resolvedCommand2 = this._getResolvedCommand(terminalInstance);
        this._handleCommandCompletion(resolvedCommand2);
      }
    }));
    commandDetectionListener.value = store;
    const resolvedCommand = this._resolveCommand(terminalInstance);
    if (resolvedCommand?.endMarker) {
      this._handleCommandCompletion(resolvedCommand);
    }
  }
  /**
   * Handles the completion of a terminal command by updating the UI state.
   * This includes marking the collapsible wrapper as complete, auto-collapsing
   * successful commands, and keeping failed commands expanded.
   *
   * @param resolvedCommand The completed terminal command with exit code information.
   */
  _handleCommandCompletion(resolvedCommand) {
    this.markCollapsibleWrapperComplete();
    if (resolvedCommand?.exitCode === 0 && this._outputView.isExpanded && !this._userToggledOutput && !this._forceExpandTerminalOutput) {
      this._toggleOutput(false);
    }
    const autoExpandFailures = this._configurationService.getValue(ChatConfiguration.AutoExpandToolFailures);
    if (autoExpandFailures && resolvedCommand?.exitCode !== void 0 && resolvedCommand.exitCode !== 0 && this._thinkingCollapsibleWrapper) {
      this.expandCollapsibleWrapper();
    }
  }
  async _toggleOutput(expanded) {
    const didChange = await this._outputView.toggle(expanded);
    const isExpanded = this._outputView.isExpanded;
    const hasOutputSection = !!this._outputView.domNode.parentElement;
    this._titleElement.classList.toggle("chat-terminal-content-title-no-bottom-radius", isExpanded && hasOutputSection);
    this._toolbarOutputExpanded = isExpanded;
    this._updateToolbarActions();
    if (didChange) {
      expandedStateByInvocation.set(this.toolInvocation, isExpanded);
    }
    return didChange;
  }
  async _ensureTerminalInstance() {
    if (this._terminalData.isPty === false) {
      return void 0;
    }
    if (this._terminalInstance?.isDisposed) {
      this._terminalInstance = void 0;
    }
    if (!this._terminalInstance && this._terminalData.terminalToolSessionId) {
      this._terminalInstance = await this._terminalChatService.getTerminalInstanceByToolSessionId(this._terminalData.terminalToolSessionId);
      if (this._terminalInstance?.isDisposed) {
        this._terminalInstance = void 0;
      }
    }
    return this._terminalInstance;
  }
  _attachOutputSource() {
    const source = this._terminalChatService.getOutputSource(this._terminalData.terminalToolSessionId);
    if (!source || source === this._outputSource) {
      return;
    }
    this._outputSource = source;
    const store = new DisposableStore();
    const onCommandExecuted = store.add(new Emitter());
    const onCommandFinished = store.add(new Emitter());
    const autoExpand = store.add(new TerminalToolAutoExpand({
      onCommandExecuted: onCommandExecuted.event,
      onCommandFinished: onCommandFinished.event,
      onWillData: source.onDidChange,
      shouldAutoExpand: () => this._shouldAutoExpand(),
      hasRealOutput: () => !!source.output
    }));
    store.add(autoExpand.onDidRequestExpand(() => {
      if (this._usesCollapsibleWrapper) {
        this.expandCollapsibleWrapper();
      }
      void this._toggleOutput(true);
    }));
    store.add(source.onDidChange(() => {
      this._decoration.update();
      this._updateToolbarContextKeys(void 0, this._terminalData.terminalToolSessionId);
      void this._outputView.refresh();
      if (source.exitCode !== void 0) {
        onCommandFinished.fire();
        this.markCollapsibleWrapperComplete();
      }
    }));
    this._outputSourceListener.value = store;
    onCommandExecuted.fire();
    if (source.exitCode !== void 0) {
      onCommandFinished.fire();
    }
    this._decoration.update();
    this._updateToolbarContextKeys(void 0, this._terminalData.terminalToolSessionId);
    void this._outputView.refresh();
  }
  _handleOutputFocus() {
    this._terminalOutputContextKey.set(true);
    this._terminalChatService.setFocusedProgressPart(this);
    this._outputView.updateAriaLabel();
  }
  _handleOutputBlur(event) {
    const nextTarget = event.relatedTarget;
    if (this._outputView.containsElement(nextTarget)) {
      return;
    }
    this._terminalOutputContextKey.reset();
    this._terminalChatService.clearFocusedProgressPart(this);
  }
  _handleDispose() {
    this._terminalOutputContextKey.reset();
    this._terminalChatService.clearFocusedProgressPart(this);
  }
  getCommandAndOutputAsText() {
    return this._outputView.getCommandAndOutputAsText();
  }
  focusOutput() {
    this._outputView.focus();
  }
  _focusChatInput() {
    const widget = this._chatWidgetService.getWidgetBySessionResource(this._sessionResource);
    widget?.focusInput();
  }
  async focusTerminal() {
    if (this._terminalData.isPty === false) {
      return;
    }
    const instance = await this._ensureTerminalInstance();
    let target = "none";
    let location = "panel";
    if (instance) {
      target = "instance";
      location = instance.target === TerminalLocation.Editor ? "editor" : "panel";
    } else if (this._terminalCommandUri) {
      target = "commandUri";
    }
    this._telemetryService.publicLog2("terminal/chatFocusInstance", { target, location });
    if (instance) {
      this._terminalService.setActiveInstance(instance);
      if (instance.target === TerminalLocation.Editor) {
        this._terminalEditorService.openEditor(instance);
      } else {
        await this._terminalGroupService.showPanel(true);
      }
      this._terminalService.setActiveInstance(instance);
      await instance.focusWhenReady(true);
      const command = this._getResolvedCommand(instance);
      if (command) {
        instance.xterm?.markTracker.revealCommand(command);
      }
      return;
    }
    if (this._terminalCommandUri) {
      this._terminalService.openResource(this._terminalCommandUri);
    }
  }
  continueInBackground() {
    const sessionId = this._terminalData.terminalToolSessionId;
    if (sessionId) {
      this._terminalChatService.continueInBackground(sessionId);
    }
  }
  async toggleOutputFromAction() {
    this._userToggledOutput = true;
    this._telemetryService.publicLog2("terminal/chatToggleOutput", {
      previousExpanded: this._outputView.isExpanded
    });
    if (!this._outputView.isExpanded) {
      await this._toggleOutput(true);
      return;
    }
    await this._toggleOutput(false);
  }
  async toggleOutputFromKeyboard() {
    this._userToggledOutput = true;
    if (!this._outputView.isExpanded) {
      await this._toggleOutput(true);
      this.focusOutput();
      return;
    }
    await this._collapseOutputAndFocusInput();
  }
  async _collapseOutputAndFocusInput() {
    if (this._outputView.isExpanded) {
      await this._toggleOutput(false);
    }
    this._focusChatInput();
  }
  _resolveCommand(instance) {
    if (instance.isDisposed) {
      return void 0;
    }
    const targetId = this._terminalData.terminalCommandId;
    const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
    if (commandDetection && targetId) {
      const commands = commandDetection.commands;
      if (commands && commands.length > 0) {
        const fromHistory = commands.find((c) => c.id === targetId);
        if (fromHistory) {
          return fromHistory;
        }
      }
      const executing = commandDetection.executingCommandObject;
      if (executing && executing.id === targetId) {
        return executing;
      }
    }
    const sessionId = this._terminalData.terminalToolSessionId;
    if (sessionId) {
      const ahpSource = this._terminalChatService.getAhpCommandSource(sessionId);
      if (ahpSource) {
        if (targetId) {
          return ahpSource.getCommandById(targetId);
        }
        return ahpSource.executingCommandObject ?? ahpSource.commands[ahpSource.commands.length - 1];
      }
    }
    return void 0;
  }
};
ChatTerminalToolProgressPart = __decorateClass([
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, ITerminalChatService),
  __decorateParam(9, ITerminalService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IChatWidgetService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, ITerminalEditorService),
  __decorateParam(14, ITerminalGroupService),
  __decorateParam(15, ITelemetryService)
], ChatTerminalToolProgressPart);
let ChatTerminalToolOutputSection = class extends Disposable {
  constructor(_ensureTerminalInstance, _resolveCommand, _getOutputSource, _getTerminalCommandOutput, _getCommandText, _getStoredTheme, _isInvocationRunning, _hasTerminalSession, _accessibleViewService, _instantiationService, _terminalConfigurationService, _themeService, _contextKeyService) {
    super();
    this._ensureTerminalInstance = _ensureTerminalInstance;
    this._resolveCommand = _resolveCommand;
    this._getOutputSource = _getOutputSource;
    this._getTerminalCommandOutput = _getTerminalCommandOutput;
    this._getCommandText = _getCommandText;
    this._getStoredTheme = _getStoredTheme;
    this._isInvocationRunning = _isInvocationRunning;
    this._hasTerminalSession = _hasTerminalSession;
    this._accessibleViewService = _accessibleViewService;
    this._instantiationService = _instantiationService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._themeService = _themeService;
    this._contextKeyService = _contextKeyService;
    this._isAtBottom = true;
    this._isProgrammaticScroll = false;
    this._onDidFocusEmitter = this._register(new Emitter());
    this._onDidBlurEmitter = this._register(new Emitter());
    const containerElements = h(".chat-terminal-output-container@container", [
      h(".chat-terminal-output-body@body", [
        h(".chat-terminal-output-content@content", [
          h(".chat-terminal-output-terminal@terminal"),
          h(".chat-terminal-output-empty@empty")
        ])
      ])
    ]);
    this.domNode = containerElements.container;
    this.domNode.classList.add("collapsed");
    this._outputBody = containerElements.body;
    this._contentContainer = containerElements.content;
    this._terminalContainer = containerElements.terminal;
    this._emptyElement = containerElements.empty;
    this._contentContainer.appendChild(this._emptyElement);
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.FOCUS_IN, () => this._onDidFocusEmitter.fire()));
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.FOCUS_OUT, (event) => this._onDidBlurEmitter.fire(event)));
    const resizeObserver = this._register(new dom.DisposableResizeObserver("ChatTerminalToolProgressPart.handleResize", () => this._handleResize()));
    this._register(resizeObserver.observe(this.domNode));
    this._applyBackgroundColor();
    this._register(this._themeService.onDidColorThemeChange(() => this._applyBackgroundColor()));
  }
  get isExpanded() {
    return this.domNode.classList.contains("expanded");
  }
  get onDidFocus() {
    return this._onDidFocusEmitter.event;
  }
  get onDidBlur() {
    return this._onDidBlurEmitter.event;
  }
  async toggle(expanded) {
    const currentlyExpanded = this.isExpanded;
    if (expanded === currentlyExpanded) {
      if (expanded) {
        await this._updateTerminalContent();
      }
      return false;
    }
    if (!expanded) {
      this._setExpanded(false);
      this._isAtBottom = true;
      return true;
    }
    if (!this._scrollableContainer) {
      await this._createScrollableContainer();
    }
    await this._updateTerminalContent();
    this._setExpanded(true);
    await this._layoutMirrorWidth();
    this._layoutOutput();
    this._scrollOutputToBottom();
    this._scheduleOutputRelayout();
    return true;
  }
  async refresh() {
    if (this.isExpanded) {
      await this._updateTerminalContent();
    }
  }
  focus() {
    this._scrollableContainer?.getDomNode().focus();
  }
  containsElement(element) {
    return !!element && this.domNode.contains(element);
  }
  updateAriaLabel() {
    if (!this._scrollableContainer) {
      return;
    }
    const command = this._resolveCommand();
    const commandText = command?.command ?? this._getCommandText();
    if (!commandText) {
      return;
    }
    const ariaLabel = localize("chatTerminalOutputAriaLabel", "Terminal output for {0}", commandText);
    const scrollableDomNode = this._scrollableContainer.getDomNode();
    scrollableDomNode.setAttribute("role", "region");
    const accessibleViewHint = this._accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.TerminalChatOutput);
    const label = accessibleViewHint ? ariaLabel + ", " + accessibleViewHint : ariaLabel;
    scrollableDomNode.setAttribute("aria-label", label);
  }
  getCommandAndOutputAsText() {
    const command = this._resolveCommand();
    const commandText = command?.command ?? this._getCommandText();
    if (!commandText) {
      return void 0;
    }
    const commandHeader = localize("chatTerminalOutputAccessibleViewHeader", "Command: {0}", commandText);
    if (command) {
      const rawOutput = command.getOutput();
      if (!rawOutput || rawOutput.trim().length === 0) {
        return `${commandHeader}
${localize("chat.terminalOutputEmpty", "No output was produced by the command.")}`;
      }
      const lines = rawOutput.split("\n");
      return `${commandHeader}
${lines.join("\n").trimEnd()}`;
    }
    const source = this._getOutputSource();
    const snapshot = source ? { text: source.output } : this._getTerminalCommandOutput();
    if (!snapshot) {
      return `${commandHeader}
${localize("chatTerminalOutputUnavailable", "Command output is no longer available.")}`;
    }
    const plain = removeAnsiEscapeCodes(snapshot.text ?? "");
    if (!plain.trim().length) {
      return `${commandHeader}
${localize("chat.terminalOutputEmpty", "No output was produced by the command.")}`;
    }
    let outputText = plain.trimEnd();
    if (snapshot.truncated) {
      outputText += `
${localize("chatTerminalOutputTruncated", "Output truncated.")}`;
    }
    return `${commandHeader}
${outputText}`;
  }
  _setExpanded(expanded) {
    this.domNode.classList.toggle("expanded", expanded);
    this.domNode.classList.toggle("collapsed", !expanded);
  }
  async _createScrollableContainer() {
    this._scrollableContainer = this._register(new DomScrollableElement(this._outputBody, {
      vertical: ScrollbarVisibility.Hidden,
      horizontal: ScrollbarVisibility.Hidden,
      handleMouseWheel: true
    }));
    const scrollableDomNode = this._scrollableContainer.getDomNode();
    scrollableDomNode.tabIndex = 0;
    this.domNode.appendChild(scrollableDomNode);
    this.updateAriaLabel();
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.MOUSE_ENTER, () => {
      this._scrollableContainer?.updateOptions({ horizontal: ScrollbarVisibility.Auto });
    }));
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.MOUSE_LEAVE, () => {
      this._scrollableContainer?.updateOptions({ horizontal: ScrollbarVisibility.Hidden });
    }));
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.FOCUS_IN, () => {
      this._scrollableContainer?.updateOptions({ horizontal: ScrollbarVisibility.Auto });
    }));
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.FOCUS_OUT, () => {
      this._scrollableContainer?.updateOptions({ horizontal: ScrollbarVisibility.Hidden });
    }));
    this._register(this._scrollableContainer.onScroll(() => {
      if (this._isProgrammaticScroll) {
        return;
      }
      this._isAtBottom = this._computeIsAtBottom();
    }));
  }
  async _updateTerminalContent() {
    const outputSource = this._getOutputSource();
    if (outputSource) {
      this._disposeLiveMirror();
      if (outputSource.output) {
        await this._renderSnapshotOutput({ text: outputSource.output });
      } else if (outputSource.exitCode === void 0) {
        this._hideEmptyMessage();
        this._layoutOutput(0);
      } else {
        this._showEmptyMessage(localize("chat.terminalOutputEmpty", "No output was produced by the command."));
        this._layoutOutput(0);
      }
      return;
    }
    const liveTerminalInstance = await this._resolveLiveTerminal();
    const command = liveTerminalInstance ? this._resolveCommand() : void 0;
    const snapshot = this._getTerminalCommandOutput();
    if (liveTerminalInstance && command) {
      const handled = await this._renderLiveOutput(liveTerminalInstance, command);
      if (handled) {
        return;
      }
    }
    this._disposeLiveMirror();
    if (snapshot) {
      await this._renderSnapshotOutput(snapshot);
      return;
    }
    if (!this._hasTerminalSession) {
      return;
    }
    if (this._isInvocationRunning()) {
      this._hideEmptyMessage();
      this._layoutOutput(0);
      return;
    }
    this._renderUnavailableMessage(liveTerminalInstance);
  }
  async _renderLiveOutput(liveTerminalInstance, command) {
    if (this._mirror) {
      return true;
    }
    await liveTerminalInstance.xtermReadyPromise;
    if (this._store.isDisposed || liveTerminalInstance.isDisposed || !liveTerminalInstance.xterm) {
      this._disposeLiveMirror();
      return false;
    }
    const mirror = this._register(this._instantiationService.createInstance(DetachedTerminalCommandMirror, liveTerminalInstance.xterm, command));
    this._mirror = mirror;
    this._register(mirror.onDidChangeRowHeight(() => this._handleMirrorRowHeightChange()));
    this._register(mirror.onDidUpdate((result2) => {
      if (result2.lineCount && result2.lineCount > 0) {
        this._hideEmptyMessage();
      }
      this._layoutOutput(result2.lineCount);
      if (this._isAtBottom) {
        this._scrollOutputToBottom();
      }
    }));
    this._register(mirror.onDidInput((data) => {
      if (!liveTerminalInstance.isDisposed) {
        liveTerminalInstance.sendText(data, false);
      }
    }));
    await mirror.attach(this._terminalContainer);
    await this._layoutMirrorWidth(mirror);
    let result = await mirror.renderCommand();
    let commandFinished = !!command.endMarker;
    let hasOutput = result && result.lineCount && result.lineCount > 0;
    if (!hasOutput) {
      for (let retry = 0; retry < MAX_OUTPUT_POLL_RETRIES && !hasOutput; retry++) {
        await timeout(OUTPUT_POLL_DELAY_MS);
        if (this._store.isDisposed) {
          return true;
        }
        result = await mirror.renderCommand();
        hasOutput = result && result.lineCount && result.lineCount > 0;
        commandFinished = !!command.endMarker;
        if (commandFinished) {
          break;
        }
      }
    }
    if (!hasOutput) {
      if (commandFinished) {
        this._showEmptyMessage(localize("chat.terminalOutputEmpty", "No output was produced by the command."));
      }
    } else {
      this._hideEmptyMessage();
    }
    this._layoutOutput(result?.lineCount ?? 0);
    return true;
  }
  async _renderSnapshotOutput(snapshot) {
    if (this._snapshotMirror) {
      this._snapshotMirror.setOutput(snapshot);
      await this._layoutMirrorWidth(this._snapshotMirror);
      const result2 = await this._snapshotMirror.render();
      this._layoutOutput(result2?.lineCount ?? snapshot.lineCount ?? this._lastRenderedLineCount ?? 0);
      return;
    }
    if (this._store.isDisposed) {
      return;
    }
    dom.clearNode(this._terminalContainer);
    this._snapshotMirror = this._register(this._instantiationService.createInstance(DetachedTerminalSnapshotMirror, snapshot, this._getStoredTheme));
    this._register(this._snapshotMirror.onDidChangeRowHeight(() => this._handleMirrorRowHeightChange()));
    await this._snapshotMirror.attach(this._terminalContainer);
    this._snapshotMirror.setOutput(snapshot);
    await this._layoutMirrorWidth(this._snapshotMirror);
    const result = await this._snapshotMirror.render();
    const hasText = !!snapshot.text && snapshot.text.length > 0;
    if (hasText) {
      this._hideEmptyMessage();
    } else {
      this._showEmptyMessage(localize("chat.terminalOutputEmpty", "No output was produced by the command."));
    }
    const lineCount = result?.lineCount ?? snapshot.lineCount ?? 0;
    this._layoutOutput(lineCount);
  }
  _renderUnavailableMessage(liveTerminalInstance) {
    dom.clearNode(this._terminalContainer);
    this._lastRenderedLineCount = void 0;
    if (!liveTerminalInstance) {
      this._showEmptyMessage(localize("chat.terminalOutputTerminalMissing", "Terminal is no longer available."));
    } else {
      this._showEmptyMessage(localize("chat.terminalOutputCommandMissing", "Command information is not available."));
    }
  }
  async _resolveLiveTerminal() {
    const instance = await this._ensureTerminalInstance();
    return instance && !instance.isDisposed ? instance : void 0;
  }
  _showEmptyMessage(message) {
    this._emptyElement.textContent = message;
    this._terminalContainer.classList.add("chat-terminal-output-terminal-no-output");
    this.domNode.classList.add("chat-terminal-output-container-no-output");
  }
  _hideEmptyMessage() {
    this._emptyElement.textContent = "";
    this._terminalContainer.classList.remove("chat-terminal-output-terminal-no-output");
    this.domNode.classList.remove("chat-terminal-output-container-no-output");
  }
  _disposeLiveMirror() {
    if (this._mirror) {
      this._mirror.dispose();
      this._mirror = void 0;
    }
  }
  _scheduleOutputRelayout() {
    dom.getWindow(this.domNode).requestAnimationFrame(() => {
      this._layoutOutput();
      this._scrollOutputToBottom();
    });
  }
  /**
   * The mirror's painted cell metrics changed: the first render replaces the pre-render
   * font estimate, and later renders can reflect DPR changes. Re-run layout so the box
   * height and wrap width match what xterm actually painted.
   */
  _handleMirrorRowHeightChange() {
    void this._layoutMirrorWidth();
    this._layoutOutput();
  }
  _handleResize() {
    if (!this._scrollableContainer) {
      return;
    }
    if (this.isExpanded) {
      void this._layoutMirrorWidth();
      this._layoutOutput();
      this._scrollOutputToBottom();
    } else {
      this._scrollableContainer.scanDomNode();
    }
  }
  /**
   * Resizes the mirror's column count to fill the currently available width. No-op while the
   * width is unmeasurable (e.g. collapsed); the mirror keeps its current cols until the next
   * layout opportunity.
   */
  async _layoutMirrorWidth(mirror = this._snapshotMirror ?? this._mirror) {
    if (!mirror) {
      return;
    }
    const width = this._terminalContainer.clientWidth || this._outputBody.clientWidth || this.domNode.clientWidth || (this.domNode.parentElement?.clientWidth ?? 0);
    if (width <= 0) {
      return;
    }
    const result = await mirror.layout(width);
    if (!this._store.isDisposed && result?.lineCount !== void 0) {
      this._layoutOutput(result.lineCount);
    }
  }
  _layoutOutput(lineCount) {
    if (!this._scrollableContainer) {
      return;
    }
    if (lineCount !== void 0) {
      this._lastRenderedLineCount = lineCount;
    } else {
      lineCount = this._lastRenderedLineCount;
    }
    this._scrollableContainer.scanDomNode();
    if (!this.isExpanded || lineCount === void 0) {
      return;
    }
    const scrollableDomNode = this._scrollableContainer.getDomNode();
    const rowHeight = this._computeRowHeightPx();
    const padding = this._getOutputPadding();
    let maxRows = MAX_OUTPUT_ROWS;
    const containerMaxHeight = Number.parseFloat(dom.getComputedStyle(this.domNode).maxHeight);
    if (!Number.isNaN(containerMaxHeight)) {
      maxRows = Math.max(Math.min(maxRows, Math.floor((containerMaxHeight - padding) / rowHeight)), MIN_OUTPUT_ROWS);
    }
    const contentRows = Math.min(Math.max(lineCount, MIN_OUTPUT_ROWS), maxRows);
    scrollableDomNode.style.height = `${contentRows * rowHeight + padding}px`;
    this._scrollableContainer.scanDomNode();
  }
  _computeIsAtBottom() {
    if (!this._scrollableContainer) {
      return true;
    }
    const dimensions = this._scrollableContainer.getScrollDimensions();
    const scrollPosition = this._scrollableContainer.getScrollPosition();
    const threshold = 5;
    return scrollPosition.scrollTop >= dimensions.scrollHeight - dimensions.height - threshold;
  }
  _scrollOutputToBottom() {
    if (!this._scrollableContainer) {
      return;
    }
    this._isProgrammaticScroll = true;
    const dimensions = this._scrollableContainer.getScrollDimensions();
    this._scrollableContainer.setScrollPosition({ scrollTop: dimensions.scrollHeight });
    this._isProgrammaticScroll = false;
  }
  _getOutputPadding() {
    const style = dom.getComputedStyle(this._outputBody);
    const paddingTop = Number.parseFloat(style.paddingTop || "0");
    const paddingBottom = Number.parseFloat(style.paddingBottom || "0");
    return paddingTop + paddingBottom;
  }
  _computeRowHeightPx() {
    const mirrorRowHeight = (this._snapshotMirror ?? this._mirror)?.getRowHeightPx();
    if (mirrorRowHeight !== void 0) {
      return mirrorRowHeight;
    }
    const window = dom.getWindow(this.domNode);
    const font = this._terminalConfigurationService.getFont(window);
    const hasCharHeight = isNumber(font.charHeight) && font.charHeight > 0;
    const hasFontSize = isNumber(font.fontSize) && font.fontSize > 0;
    const hasLineHeight = isNumber(font.lineHeight) && font.lineHeight > 0;
    const charHeight = (hasCharHeight ? font.charHeight : hasFontSize ? font.fontSize : 1) ?? 1;
    const lineHeight = hasLineHeight ? font.lineHeight : 1;
    const rowHeight = Math.ceil(charHeight * lineHeight);
    return Math.max(rowHeight, 1);
  }
  _applyBackgroundColor() {
    const theme = this._themeService.getColorTheme();
    const isInEditor = ChatContextKeys.inChatEditor.getValue(this._contextKeyService);
    const backgroundColor = theme.getColor(isInEditor ? editorBackground : PANEL_BACKGROUND);
    if (backgroundColor) {
      this.domNode.style.backgroundColor = backgroundColor.toString();
    }
  }
};
ChatTerminalToolOutputSection = __decorateClass([
  __decorateParam(8, IAccessibleViewService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, ITerminalConfigurationService),
  __decorateParam(11, IThemeService),
  __decorateParam(12, IContextKeyService)
], ChatTerminalToolOutputSection);
let ChatTerminalThinkingCollapsibleWrapper = class extends ChatCollapsibleContentPart {
  constructor(commandText, intention, isSandboxWrapped, contentElement, context, initialExpanded, isComplete, isSkipped, isRunningInBackground, onFocusTerminal, hoverService, configurationService) {
    const intentionText = intention && !isSkipped ? intention : void 0;
    const stateTitle = isSkipped ? localize("chat.terminal.skipped.plain", "Skipped {0}", commandText) : isRunningInBackground ? localize("chat.terminal.runningInBackground.plain", "Running {0} in background", commandText) : isComplete ? localize("chat.terminal.ran.plain", "Ran {0}", commandText) : localize("chat.terminal.running.plain", "Running {0}", commandText);
    const title = intentionText ? isRunningInBackground ? `${intentionText} ${commandText}${localize("chat.terminal.backgroundSuffix", " in background")}` : `${intentionText} ${commandText}` : stateTitle;
    super(title, context, void 0, hoverService, configurationService);
    this._showLinkDisposables = this._register(new MutableDisposable());
    this._terminalContentElement = contentElement;
    this._commandText = commandText;
    this._intention = intentionText;
    this._isSandboxWrapped = isSandboxWrapped;
    this._isComplete = isComplete;
    this._isSkipped = isSkipped;
    this._isRunningInBackground = isRunningInBackground;
    this._onFocusTerminal = onFocusTerminal;
    this.domNode.classList.add("chat-terminal-thinking-collapsible");
    if (isComplete) {
      this.icon = Codicon.check;
    }
    this._setCodeFormattedTitle();
    this._updateShowLink();
    this.setExpanded(initialExpanded);
  }
  shouldAnimateContent() {
    return true;
  }
  _setCodeFormattedTitle() {
    if (!this._collapseButton) {
      return;
    }
    const labelElement = this._collapseButton.labelElement;
    labelElement.textContent = "";
    const suffixText = this._isSandboxWrapped ? this._isRunningInBackground ? localize("chat.terminal.sandbox.backgroundSuffix", " in sandbox (background)") : localize("chat.terminal.sandbox.suffix", " in sandbox") : this._isRunningInBackground ? localize("chat.terminal.backgroundSuffix", " in background") : void 0;
    this.domNode.classList.toggle("chat-terminal-has-intention", !!this._intention);
    if (this._intention) {
      const row = dom.$("span.chat-terminal-label-flex");
      const intentionElement = dom.$("span.chat-terminal-intention");
      intentionElement.textContent = this._intention;
      const commandElement = dom.$("span.chat-terminal-command");
      const codeElement2 = document.createElement("code");
      codeElement2.textContent = this._commandText;
      commandElement.appendChild(codeElement2);
      row.appendChild(intentionElement);
      row.appendChild(commandElement);
      if (suffixText) {
        const suffixElement = dom.$("span.chat-terminal-label-suffix");
        suffixElement.textContent = suffixText;
        row.appendChild(suffixElement);
      }
      labelElement.appendChild(row);
      return;
    }
    const prefixText = this._isSandboxWrapped ? this._isSkipped ? localize("chat.terminal.skippedInSandbox.prefix", "Skipped ") : this._isComplete ? localize("chat.terminal.ranInSandbox.prefix", "Ran ") : localize("chat.terminal.runningInSandbox.prefix", "Running ") : this._isSkipped ? localize("chat.terminal.skipped.prefix", "Skipped ") : this._isComplete ? localize("chat.terminal.ran.prefix", "Ran ") : localize("chat.terminal.running.prefix", "Running ");
    labelElement.appendChild(document.createTextNode(prefixText));
    const codeElement = document.createElement("code");
    codeElement.textContent = this._commandText;
    labelElement.appendChild(codeElement);
    if (suffixText) {
      labelElement.appendChild(document.createTextNode(suffixText));
    }
  }
  _updateShowLink() {
    this._showLinkElement?.remove();
    this._showLinkElement = void 0;
    this._showLinkDisposables.value = void 0;
    if (!this._isRunningInBackground || !this._onFocusTerminal || !this._collapseButton) {
      return;
    }
    const labelElement = this._collapseButton.labelElement;
    const store = new DisposableStore();
    this._showLinkDisposables.value = store;
    const container = dom.$("span.chat-terminal-show-link-container");
    container.appendChild(document.createTextNode(" \u2014 "));
    const showLink = dom.$("span.chat-terminal-show-link");
    showLink.textContent = localize("chat.terminal.showTerminal", "Show");
    showLink.role = "button";
    showLink.tabIndex = 0;
    store.add(dom.addDisposableListener(showLink, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      this._onFocusTerminal?.();
    }));
    store.add(dom.addDisposableListener(showLink, dom.EventType.KEY_DOWN, (e) => {
      const keyboardEvent = new StandardKeyboardEvent(e);
      if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
        dom.EventHelper.stop(e, true);
        this._onFocusTerminal?.();
      }
    }));
    container.appendChild(showLink);
    labelElement.appendChild(container);
    this._showLinkElement = container;
  }
  markComplete() {
    if (this._isComplete) {
      return;
    }
    this._isComplete = true;
    this._isRunningInBackground = false;
    this.icon = Codicon.check;
    this._setCodeFormattedTitle();
    this._updateShowLink();
  }
  initContent() {
    const listWrapper = dom.$(".chat-used-context-list.chat-terminal-thinking-content");
    listWrapper.appendChild(this._terminalContentElement);
    return listWrapper;
  }
  expand() {
    this.setExpanded(true);
  }
  hasSameContent(_other, _followingContent, _element) {
    return false;
  }
};
ChatTerminalThinkingCollapsibleWrapper = __decorateClass([
  __decorateParam(10, IHoverService),
  __decorateParam(11, IConfigurationService)
], ChatTerminalThinkingCollapsibleWrapper);
export {
  ChatTerminalThinkingCollapsibleWrapper,
  ChatTerminalToolOutputSection,
  ChatTerminalToolProgressPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVQaXhlbFNwaW5uZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcGl4ZWxTcGlubmVyL3BpeGVsU3Bpbm5lci5qcyc7XG5pbXBvcnQgeyBpc01hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgbWlncmF0ZUxlZ2FjeVRlcm1pbmFsVG9vbFNwZWNpZmljRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0VG9vbEludm9jYXRpb24sIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLCBUb29sQ29uZmlybUtpbmQsIHR5cGUgSUNoYXRNYXJrZG93bkNvbnRlbnQsIHR5cGUgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSwgdHlwZSBJTGVnYWN5Q2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSwgSUNoYXRDb2RlQmxvY2tJbmZvLCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRRdWVyeVRpdGxlUGFydCB9IGZyb20gJy4uL2NoYXRDb25maXJtYXRpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0LCB0eXBlIElDaGF0TWFya2Rvd25Db250ZW50UGFydE9wdGlvbnMgfSBmcm9tICcuLi9jaGF0TWFya2Rvd25Db250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0UHJvZ3Jlc3NTdWJQYXJ0IH0gZnJvbSAnLi4vY2hhdFByb2dyZXNzQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFJlc291cmNlR3JvdXBXaWRnZXQgfSBmcm9tICcuLi9jaGF0UmVzb3VyY2VHcm91cFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbGxhcHNpYmxlSU9EYXRhUGFydCB9IGZyb20gJy4uL2NoYXRUb29sSW5wdXRPdXRwdXRDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBCYXNlQ2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydCB9IGZyb20gJy4vY2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydC5qcyc7XG5pbXBvcnQgeyBleHRyYWN0SW1hZ2VzRnJvbVRvb2xJbnZvY2F0aW9uT3V0cHV0RGV0YWlscyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0SW1hZ2VFeHRyYWN0aW9uLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsVG9vbEF1dG9FeHBhbmQgfSBmcm9tICcuL3Rlcm1pbmFsVG9vbEF1dG9FeHBhbmQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQgfSBmcm9tICcuLi9jaGF0Q29sbGFwc2libGVDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlbmRlcmVyQ29udGVudCwgaXNSZXNwb25zZVZNIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0ICcuLi9tZWRpYS9jaGF0VGVybWluYWxUb29sUHJvZ3Jlc3NQYXJ0LmNzcyc7XG5pbXBvcnQgdHlwZSB7IElDb2RlQmxvY2tSZW5kZXJPcHRpb25zIH0gZnJvbSAnLi4vY29kZUJsb2NrUGFydC5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJQWhwVGVybWluYWxDb21tYW5kU291cmNlLCBJQ2hhdFRlcm1pbmFsT3V0cHV0U291cmNlLCBJQ2hhdFRlcm1pbmFsVG9vbFByb2dyZXNzUGFydCwgSVRlcm1pbmFsQ2hhdFNlcnZpY2UsIElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJVGVybWluYWxFZGl0b3JTZXJ2aWNlLCBJVGVybWluYWxHcm91cFNlcnZpY2UsIElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUsIHR5cGUgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgRGVjb3JhdGlvblNlbGVjdG9yLCBnZXRUZXJtaW5hbENvbW1hbmREZWNvcmF0aW9uU3RhdGUsIGdldFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25Ub29sdGlwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci94dGVybS9kZWNvcmF0aW9uU3R5bGVzLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ29tbWFuZCwgVGVybWluYWxDYXBhYmlsaXR5LCB0eXBlIElDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBzdHJpcEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IEVkaXRvclBvb2wgfSBmcm9tICcuLi9jaGF0Q29udGVudENvZGVQb29scy5qcyc7XG5pbXBvcnQgeyBEZXRhY2hlZFRlcm1pbmFsQ29tbWFuZE1pcnJvciwgRGV0YWNoZWRUZXJtaW5hbFNuYXBzaG90TWlycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci9jaGF0VGVybWluYWxDb21tYW5kTWlycm9yLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udHJpYkNvbW1hbmRJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlcm1pbmFsL3Rlcm1pbmFsQ29udHJpYkV4cG9ydHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBpc051bWJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IHJlbW92ZUFuc2lFc2NhcGVDb2RlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgUEFORUxfQkFDS0dST1VORCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBlZGl0b3JCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5cbi8qKlxuICogTWluaW11bSBudW1iZXIgb2Ygcm93cyB0byBkaXNwbGF5IGluIHRoZSB0ZXJtaW5hbCBvdXRwdXQgdmlldy5cbiAqL1xuY29uc3QgTUlOX09VVFBVVF9ST1dTID0gMTtcblxuLyoqXG4gKiBNYXhpbXVtIG51bWJlciBvZiByb3dzIHRvIGRpc3BsYXkgaW4gdGhlIHRlcm1pbmFsIG91dHB1dCB2aWV3IGJlZm9yZSBzY3JvbGxpbmcuXG4gKi9cbmNvbnN0IE1BWF9PVVRQVVRfUk9XUyA9IDEwO1xuXG4vKipcbiAqIE1heGltdW0gbnVtYmVyIG9mIGNoYXJhY3RlcnMgdG8gZGlzcGxheSBpbiB0aGUgY29tbWFuZCB0aXRsZSBiZWZvcmUgdHJ1bmNhdGluZy5cbiAqL1xuY29uc3QgTUFYX0NPTU1BTkRfVElUTEVfTEVOR1RIID0gNTA7XG5cbi8qKlxuICogTWF4aW11bSBudW1iZXIgb2YgcmV0cmllcyB3aGVuIHdhaXRpbmcgZm9yIHRlcm1pbmFsIG91dHB1dCB0byBhcHBlYXIuXG4gKi9cbmNvbnN0IE1BWF9PVVRQVVRfUE9MTF9SRVRSSUVTID0gMTA7XG5cbi8qKlxuICogRGVsYXkgYmV0d2VlbiByZXRyaWVzIHdoZW4gcG9sbGluZyBmb3IgdGVybWluYWwgb3V0cHV0IChpbiBtaWxsaXNlY29uZHMpLlxuICovXG5jb25zdCBPVVRQVVRfUE9MTF9ERUxBWV9NUyA9IDEwMDtcblxuLyoqXG4gKiBNaW5pbXVtIG51bWJlciBvZiBkYXRhIGV2ZW50cyB0aGF0IGluZGljYXRlIHJlYWwgb3V0cHV0ICh2cyBzaGVsbCBpbnRlZ3JhdGlvbiBzZXF1ZW5jZXMpLlxuICovXG5jb25zdCBNSU5fREFUQV9FVkVOVFNfRk9SX1JFQUxfT1VUUFVUID0gMjtcblxuLyoqXG4gKiBSZW1lbWJlcnMgd2hldGhlciBhIHRvb2wgaW52b2NhdGlvbiB3YXMgbGFzdCBleHBhbmRlZCBzbyBzdGF0ZSBzdXJ2aXZlcyB2aXJ0dWFsaXphdGlvbiByZS1yZW5kZXJzLlxuICovXG5jb25zdCBleHBhbmRlZFN0YXRlQnlJbnZvY2F0aW9uID0gbmV3IFdlYWtNYXA8SUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLCBib29sZWFuPigpO1xuXG4vLyAtLS0gQ29tbWFuZCByZWdpc3RyYXRpb25zIGZvciB0ZXJtaW5hbCB0b29sIHByb2dyZXNzIHRvb2xiYXIgLS0tXG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKFRlcm1pbmFsQ29udHJpYkNvbW1hbmRJZC5Gb2N1c0NoYXRJbnN0YW5jZUFjdGlvbiwgYXN5bmMgKF9hY2Nlc3NvcjogdW5rbm93biwgcHJvZ3Jlc3NQYXJ0PzogSUNoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQpID0+IHtcblx0YXdhaXQgcHJvZ3Jlc3NQYXJ0Py5mb2N1c1Rlcm1pbmFsKCk7XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoVGVybWluYWxDb250cmliQ29tbWFuZElkLkNvbnRpbnVlSW5CYWNrZ3JvdW5kLCBhc3luYyAoX2FjY2Vzc29yOiB1bmtub3duLCBwcm9ncmVzc1BhcnQ/OiBJQ2hhdFRlcm1pbmFsVG9vbFByb2dyZXNzUGFydCkgPT4ge1xuXHRwcm9ncmVzc1BhcnQ/LmNvbnRpbnVlSW5CYWNrZ3JvdW5kKCk7XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoVGVybWluYWxDb250cmliQ29tbWFuZElkLlRvZ2dsZUNoYXRUZXJtaW5hbE91dHB1dCwgYXN5bmMgKF9hY2Nlc3NvcjogdW5rbm93biwgcHJvZ3Jlc3NQYXJ0PzogSUNoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQpID0+IHtcblx0YXdhaXQgcHJvZ3Jlc3NQYXJ0Py50b2dnbGVPdXRwdXRGcm9tQWN0aW9uKCk7XG59KTtcblxuLyoqXG4gKiBPcHRpb25zIGZvciBjb25maWd1cmluZyBhIHRlcm1pbmFsIGNvbW1hbmQgZGVjb3JhdGlvbi5cbiAqL1xuaW50ZXJmYWNlIElUZXJtaW5hbENvbW1hbmREZWNvcmF0aW9uT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBUaGUgdGVybWluYWwgZGF0YSBhc3NvY2lhdGVkIHdpdGggdGhlIHRvb2wgaW52b2NhdGlvbi5cblx0ICovXG5cdHJlYWRvbmx5IHRlcm1pbmFsRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTtcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgSFRNTCBlbGVtZW50IHJlcHJlc2VudGluZyB0aGUgY29tbWFuZCBibG9jayBpbiB0aGUgdGVybWluYWwgb3V0cHV0LlxuXHQgKiBNYXkgcmV0dXJuIGB1bmRlZmluZWRgIGlmIHRoZSBjb21tYW5kIGJsb2NrIGlzIG5vdCBjdXJyZW50bHkgcmVuZGVyZWQuXG5cdCAqIENhbGxlZCB3aGVuIGF0dGFjaGluZyB0aGUgZGVjb3JhdGlvbiB0byB0aGUgY29tbWFuZCBibG9jayBjb250YWluZXIuXG5cdCAqL1xuXHRnZXRDb21tYW5kQmxvY2soKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIEhUTUwgZWxlbWVudCByZXByZXNlbnRpbmcgdGhlIGljb24gZm9yIHRoZSBjb21tYW5kLCBpZiBhbnkuXG5cdCAqIE1heSByZXR1cm4gYHVuZGVmaW5lZGAgaWYgbm8gaWNvbiBpcyBwcmVzZW50LlxuXHQgKiBVc2VkIHRvIGRldGVybWluZSB3aGVyZSB0byBpbnNlcnQgdGhlIGRlY29yYXRpb24gcmVsYXRpdmUgdG8gdGhlIGljb24uXG5cdCAqL1xuXHRnZXRJY29uRWxlbWVudCgpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgcmVzb2x2ZWQgdGVybWluYWwgY29tbWFuZCBhc3NvY2lhdGVkIHdpdGggdGhpcyBkZWNvcmF0aW9uLCBpZiBhdmFpbGFibGUuXG5cdCAqIE1heSByZXR1cm4gYHVuZGVmaW5lZGAgaWYgdGhlIGNvbW1hbmQgaGFzIG5vdCBiZWVuIHJlc29sdmVkIHlldC5cblx0ICogVXNlZCB0byBhY2Nlc3MgY29tbWFuZCBtZXRhZGF0YSBmb3IgdGhlIGRlY29yYXRpb24uXG5cdCAqL1xuXHRnZXRSZXNvbHZlZENvbW1hbmQoKTogSVRlcm1pbmFsQ29tbWFuZCB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSB0b29sIGludm9jYXRpb24gaXMgY3VycmVudGx5IHJ1bm5pbmcuXG5cdCAqL1xuXHRnZXRJc1J1bm5pbmcoKTogYm9vbGVhbjtcblxuXHQvKiogUmV0dXJucyBhIHN0cnVjdHVyZWQgZXhpdCBjb2RlIHRoYXQgbWF5IGFycml2ZSB3aXRob3V0IGNvbW1hbmQgZGV0ZWN0aW9uLiAqL1xuXHRnZXRFeGl0Q29kZSgpOiBudW1iZXIgfCB1bmRlZmluZWQ7XG59XG5cbmNsYXNzIFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2hvdmVyUmVnaXN0ZXJlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IElUZXJtaW5hbENvbW1hbmREZWNvcmF0aW9uT3B0aW9ucyxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBkZWNvcmF0aW9uRWxlbWVudHMgPSBoKCdzcGFuLmNoYXQtdGVybWluYWwtY29tbWFuZC1kZWNvcmF0aW9uQGRlY29yYXRpb24nLCB7IHJvbGU6ICdpbWcnLCB0YWJJbmRleDogMCB9KTtcblx0XHR0aGlzLl9lbGVtZW50ID0gZGVjb3JhdGlvbkVsZW1lbnRzLmRlY29yYXRpb247XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY3JlYXRlUGl4ZWxTcGlubmVyKHRoaXMuX2VsZW1lbnQpKTtcblx0XHR0aGlzLl9hdHRhY2hFbGVtZW50VG9Db250YWluZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX2F0dGFjaEVsZW1lbnRUb0NvbnRhaW5lcigpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLl9vcHRpb25zLmdldENvbW1hbmRCbG9jaygpO1xuXHRcdGlmICghY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVjb3JhdGlvbiA9IHRoaXMuX2VsZW1lbnQ7XG5cdFx0aWYgKCFkZWNvcmF0aW9uLmlzQ29ubmVjdGVkIHx8IGRlY29yYXRpb24ucGFyZW50RWxlbWVudCAhPT0gY29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCBpY29uID0gdGhpcy5fb3B0aW9ucy5nZXRJY29uRWxlbWVudCgpO1xuXHRcdFx0aWYgKGljb24gJiYgaWNvbi5wYXJlbnRFbGVtZW50ID09PSBjb250YWluZXIpIHtcblx0XHRcdFx0aWNvbi5pbnNlcnRBZGphY2VudEVsZW1lbnQoJ2FmdGVyZW5kJywgZGVjb3JhdGlvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb250YWluZXIuaW5zZXJ0QmVmb3JlKGRlY29yYXRpb24sIGNvbnRhaW5lci5maXJzdEVsZW1lbnRDaGlsZCA/PyBudWxsKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2hvdmVyUmVnaXN0ZXJlZCkge1xuXHRcdFx0dGhpcy5faG92ZXJSZWdpc3RlcmVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihkZWNvcmF0aW9uLCAoKSA9PiAoe1xuXHRcdFx0XHRjb250ZW50OiB0aGlzLl9nZXRIb3ZlclRleHQoKVxuXHRcdFx0fSkpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRIb3ZlclRleHQoKTogc3RyaW5nIHtcblx0XHRjb25zdCBjb21tYW5kID0gdGhpcy5fb3B0aW9ucy5nZXRSZXNvbHZlZENvbW1hbmQoKTtcblx0XHRjb25zdCB7IGVmZmVjdGl2ZUNvbW1hbmQsIHN0b3JlZFN0YXRlIH0gPSB0aGlzLl9nZXREZWNvcmF0aW9uSW5wdXQoY29tbWFuZCk7XG5cdFx0cmV0dXJuIGdldFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25Ub29sdGlwKGVmZmVjdGl2ZUNvbW1hbmQsIHN0b3JlZFN0YXRlKSB8fCAnJztcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGUoY29tbWFuZD86IElUZXJtaW5hbENvbW1hbmQpOiB2b2lkIHtcblx0XHR0aGlzLl9hdHRhY2hFbGVtZW50VG9Db250YWluZXIoKTtcblx0XHRjb25zdCBkZWNvcmF0aW9uID0gdGhpcy5fZWxlbWVudDtcblx0XHRjb25zdCByZXNvbHZlZENvbW1hbmQgPSBjb21tYW5kID8/IHRoaXMuX29wdGlvbnMuZ2V0UmVzb2x2ZWRDb21tYW5kKCk7XG5cdFx0dGhpcy5fYXBwbHkoZGVjb3JhdGlvbiwgcmVzb2x2ZWRDb21tYW5kKTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5KGRlY29yYXRpb246IEhUTUxFbGVtZW50LCBjb21tYW5kOiBJVGVybWluYWxDb21tYW5kIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVybWluYWxEYXRhID0gdGhpcy5fb3B0aW9ucy50ZXJtaW5hbERhdGE7XG5cdFx0aWYgKHRlcm1pbmFsRGF0YS5pc1B0eSAhPT0gZmFsc2UgJiYgY29tbWFuZCkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdTdGF0ZSA9IHRlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZSA/PyB7fTtcblx0XHRcdHRlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZSA9IHtcblx0XHRcdFx0Li4uZXhpc3RpbmdTdGF0ZSxcblx0XHRcdFx0ZXhpdENvZGU6IGNvbW1hbmQuZXhpdENvZGUsXG5cdFx0XHRcdHRpbWVzdGFtcDogY29tbWFuZC50aW1lc3RhbXAgPz8gZXhpc3RpbmdTdGF0ZS50aW1lc3RhbXAsXG5cdFx0XHRcdGR1cmF0aW9uOiBjb21tYW5kLmR1cmF0aW9uID8/IGV4aXN0aW5nU3RhdGUuZHVyYXRpb25cblx0XHRcdH07XG5cdFx0fSBlbHNlIGlmICh0ZXJtaW5hbERhdGEuaXNQdHkgIT09IGZhbHNlICYmICF0ZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kU3RhdGUpIHtcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHR0ZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kU3RhdGUgPSB7IGV4aXRDb2RlOiB1bmRlZmluZWQsIHRpbWVzdGFtcDogbm93IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBlZmZlY3RpdmVDb21tYW5kLCBzdG9yZWRTdGF0ZSB9ID0gdGhpcy5fZ2V0RGVjb3JhdGlvbklucHV0KGNvbW1hbmQpO1xuXHRcdGNvbnN0IGRlY29yYXRpb25TdGF0ZSA9IGdldFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25TdGF0ZShlZmZlY3RpdmVDb21tYW5kLCBzdG9yZWRTdGF0ZSk7XG5cdFx0Y29uc3QgdG9vbHRpcCA9IGdldFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25Ub29sdGlwKGVmZmVjdGl2ZUNvbW1hbmQsIHN0b3JlZFN0YXRlKTtcblxuXHRcdGNvbnN0IGlzUnVubmluZyA9IHRoaXMuX29wdGlvbnMuZ2V0SXNSdW5uaW5nKCk7XG5cblx0XHRkZWNvcmF0aW9uLmNsYXNzTmFtZSA9IGBjaGF0LXRlcm1pbmFsLWNvbW1hbmQtZGVjb3JhdGlvbiAke0RlY29yYXRpb25TZWxlY3Rvci5Db21tYW5kRGVjb3JhdGlvbn1gO1xuXHRcdGlmIChpc1J1bm5pbmcpIHtcblx0XHRcdGNvbnN0IG5vbkljb25DbGFzc2VzID0gZGVjb3JhdGlvblN0YXRlLmNsYXNzTmFtZXMuZmlsdGVyKGMgPT4gYyAhPT0gRGVjb3JhdGlvblNlbGVjdG9yLkNvZGljb24gJiYgIWMuc3RhcnRzV2l0aCgnY29kaWNvbi0nKSk7XG5cdFx0XHRkZWNvcmF0aW9uLmNsYXNzTGlzdC5hZGQoJ2NoYXQtdGVybWluYWwtcnVubmluZy1zcGlubmVyJywgLi4ubm9uSWNvbkNsYXNzZXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkZWNvcmF0aW9uLmNsYXNzTGlzdC5hZGQoRGVjb3JhdGlvblNlbGVjdG9yLkNvZGljb24sIC4uLmRlY29yYXRpb25TdGF0ZS5jbGFzc05hbWVzLCAuLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShkZWNvcmF0aW9uU3RhdGUuaWNvbikpO1xuXHRcdH1cblx0XHRjb25zdCBpc0ludGVyYWN0aXZlID0gIWRlY29yYXRpb24uY2xhc3NMaXN0LmNvbnRhaW5zKERlY29yYXRpb25TZWxlY3Rvci5EZWZhdWx0KTtcblx0XHRkZWNvcmF0aW9uLnRhYkluZGV4ID0gaXNJbnRlcmFjdGl2ZSA/IDAgOiAtMTtcblx0XHRpZiAoaXNJbnRlcmFjdGl2ZSkge1xuXHRcdFx0ZGVjb3JhdGlvbi5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGVjb3JhdGlvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnLCAndHJ1ZScpO1xuXHRcdH1cblx0XHRjb25zdCBob3ZlclRleHQgPSB0b29sdGlwIHx8IGRlY29yYXRpb25TdGF0ZS5ob3Zlck1lc3NhZ2U7XG5cdFx0aWYgKGhvdmVyVGV4dCkge1xuXHRcdFx0ZGVjb3JhdGlvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBob3ZlclRleHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkZWNvcmF0aW9uLnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldERlY29yYXRpb25JbnB1dChjb21tYW5kOiBJVGVybWluYWxDb21tYW5kIHwgdW5kZWZpbmVkKToge1xuXHRcdGVmZmVjdGl2ZUNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQgfCB1bmRlZmluZWQ7XG5cdFx0c3RvcmVkU3RhdGU6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGFbJ3Rlcm1pbmFsQ29tbWFuZFN0YXRlJ107XG5cdH0ge1xuXHRcdGxldCBzdG9yZWRTdGF0ZSA9IHRoaXMuX29wdGlvbnMudGVybWluYWxEYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlO1xuXHRcdGlmICh0aGlzLl9vcHRpb25zLnRlcm1pbmFsRGF0YS5pc1B0eSAhPT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiB7IGVmZmVjdGl2ZUNvbW1hbmQ6IGNvbW1hbmQsIHN0b3JlZFN0YXRlIH07XG5cdFx0fVxuXHRcdGNvbnN0IGV4aXRDb2RlID0gdGhpcy5fb3B0aW9ucy5nZXRFeGl0Q29kZSgpO1xuXHRcdHN0b3JlZFN0YXRlID0gZXhpdENvZGUgPT09IHVuZGVmaW5lZCA/IHN0b3JlZFN0YXRlIDogeyAuLi5zdG9yZWRTdGF0ZSwgZXhpdENvZGUgfTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWZmZWN0aXZlQ29tbWFuZDogY29tbWFuZD8uZXhpdENvZGUgPT09IHVuZGVmaW5lZCAmJiBzdG9yZWRTdGF0ZT8uZXhpdENvZGUgIT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IGNvbW1hbmQsXG5cdFx0XHRzdG9yZWRTdGF0ZVxuXHRcdH07XG5cdH1cblxufVxuXG4vKipcbiAqIEEgY2hhdCBjb250ZW50IHBhcnQgdGhhdCBkaXNwbGF5cyB0ZXJtaW5hbCB0b29sIGludm9jYXRpb24gcHJvZ3Jlc3MuXG4gKlxuICogVGhpcyBjb21wb25lbnQgc2hvd3M6XG4gKiAtIFRoZSBjb21tYW5kIGJlaW5nIGV4ZWN1dGVkIHdpdGggc3ludGF4IGhpZ2hsaWdodGluZ1xuICogLSBBIHN0YXR1cyBkZWNvcmF0aW9uIGluZGljYXRpbmcgc3VjY2Vzcy9mYWlsdXJlL3J1bm5pbmcgc3RhdGVcbiAqIC0gRXhwYW5kYWJsZSB0ZXJtaW5hbCBvdXRwdXQgd2l0aCBsaXZlIHN0cmVhbWluZyBzdXBwb3J0XG4gKiAtIEFjdGlvbnMgdG8gZm9jdXMgdGhlIHRlcm1pbmFsLCBzaG93L2hpZGUgb3V0cHV0LCBhbmQgY29udGludWUgaW4gYmFja2dyb3VuZFxuICpcbiAqIFRoZSBjb21wb25lbnQgc3VwcG9ydHMgdHdvIHJlbmRlcmluZyBtb2RlczpcbiAqIC0gU3RhbmRhcmQgbW9kZTogU2hvd3MgZnVsbCBwcm9ncmVzcyB3aXRoIHN0YXR1cyBpbmRpY2F0b3JzXG4gKiAtIENvbGxhcHNpYmxlIHdyYXBwZXIgbW9kZTogRm9yIHRoaW5raW5nIGNvbnRhaW5lcnMgd2l0aCBzaW1wbGlmaWVkIFVJXG4gKlxuICogT3V0cHV0IGF1dG8tZXhwYW5zaW9uIGJlaGF2aW9yOlxuICogLSBMb25nLXJ1bm5pbmcgY29tbWFuZHMgd2l0aCBvdXRwdXQgYXV0by1leHBhbmQgYWZ0ZXIgYSBzaG9ydCBkZWxheVxuICogLSBGYXN0IGNvbW1hbmRzIHRoYXQgY29tcGxldGUgcXVpY2tseSBkb24ndCBhdXRvLWV4cGFuZCAocHJldmVudHMgZmxpY2tlcmluZylcbiAqIC0gRmFpbGVkIGNvbW1hbmRzIGNhbiBiZSBjb25maWd1cmVkIHRvIGF1dG8tZXhwYW5kIHZpYSBzZXR0aW5nc1xuICogLSBTdWNjZXNzZnVsIGNvbW1hbmRzIGF1dG8tY29sbGFwc2UgaWYgb3V0cHV0IHdhcyBhdXRvLWV4cGFuZGVkXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0VGVybWluYWxUb29sUHJvZ3Jlc3NQYXJ0IGV4dGVuZHMgQmFzZUNoYXRUb29sSW52b2NhdGlvblN1YlBhcnQgaW1wbGVtZW50cyBJQ2hhdFRlcm1pbmFsVG9vbFByb2dyZXNzUGFydCB7XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZUVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vdXRwdXRWaWV3OiBDaGF0VGVybWluYWxUb29sT3V0cHV0U2VjdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxPdXRwdXRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfdGVybWluYWxTZXNzaW9uUmVnaXN0cmF0aW9uOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZWxlbWVudEluZGV4OiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRlbnRJbmRleDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uUmVzb3VyY2U6IFVSSTtcblxuXHQvLyBUb29sYmFyIHN0YXRlIHRoYXQgZHJpdmVzIGFjdGlvbiB2aXNpYmlsaXR5IChyZXBsYWNlcyBjb250ZXh0IGtleXMgdG8gYXZvaWRcblx0Ly8gYWNjdW11bGF0aW5nIGxpc3RlbmVycyBvbiB0aGUgc2hhcmVkIElDb250ZXh0S2V5U2VydmljZSB3aGVuIG1hbnkgcGFydHMgZXhpc3QpXG5cdHByaXZhdGUgX3Rvb2xiYXJIYXNJbnN0YW5jZSA9IGZhbHNlO1xuXHRwcml2YXRlIF90b29sYmFyQ2FuQ29udGludWVJbkJhY2tncm91bmQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfdG9vbGJhckhhc091dHB1dCA9IGZhbHNlO1xuXHRwcml2YXRlIF90b29sYmFySXNIaWRkZW5UZXJtaW5hbCA9IGZhbHNlO1xuXHRwcml2YXRlIF90b29sYmFyT3V0cHV0RXhwYW5kZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfYWN0aW9uQmFyOiBBY3Rpb25CYXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvbkJhckFjdGlvbnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRwcml2YXRlIF90ZXJtaW5hbENvbW1hbmRVcmk6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFRleHQ6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfaXNTZXJpYWxpemVkSW52b2NhdGlvbjogYm9vbGVhbjtcblx0cHJpdmF0ZSBfdGVybWluYWxJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX291dHB1dFNvdXJjZTogSUNoYXRUZXJtaW5hbE91dHB1dFNvdXJjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfb3V0cHV0U291cmNlTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uOiBUZXJtaW5hbENvbW1hbmREZWNvcmF0aW9uO1xuXHRwcml2YXRlIF91c2VyVG9nZ2xlZE91dHB1dDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc0luVGhpbmtpbmdDb250YWluZXI6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfdXNlc0NvbGxhcHNpYmxlV3JhcHBlcjogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF90aGlua2luZ0NvbGxhcHNpYmxlV3JhcHBlcjogQ2hhdFRlcm1pbmFsVGhpbmtpbmdDb2xsYXBzaWJsZVdyYXBwZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZvcmNlRXhwYW5kVGVybWluYWxPdXRwdXQ6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSBtYXJrZG93blBhcnQ6IENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0IHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZ2V0IGNvZGVibG9ja3MoKTogSUNoYXRDb2RlQmxvY2tJbmZvW10ge1xuXHRcdHJldHVybiB0aGlzLm1hcmtkb3duUGFydD8uY29kZWJsb2NrcyA/PyBbXTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZWxlbWVudEluZGV4KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2VsZW1lbnRJbmRleDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY29udGVudEluZGV4KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRlbnRJbmRleDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsXG5cdFx0dGVybWluYWxEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIHwgSUxlZ2FjeUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSxcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRyZW5kZXJlcjogSU1hcmtkb3duUmVuZGVyZXIsXG5cdFx0ZWRpdG9yUG9vbDogRWRpdG9yUG9vbCxcblx0XHRjdXJyZW50V2lkdGhEZWxlZ2F0ZTogKCkgPT4gbnVtYmVyLFxuXHRcdGNvZGVCbG9ja1N0YXJ0SW5kZXg6IG51bWJlcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ2hhdFNlcnZpY2U6IElUZXJtaW5hbENoYXRTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEVkaXRvclNlcnZpY2U6IElUZXJtaW5hbEVkaXRvclNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEdyb3VwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEdyb3VwU2VydmljZTogSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodG9vbEludm9jYXRpb24pO1xuXG5cdFx0dGhpcy5fZWxlbWVudEluZGV4ID0gY29udGV4dC5lbGVtZW50SW5kZXg7XG5cdFx0dGhpcy5fY29udGVudEluZGV4ID0gY29udGV4dC5jb250ZW50SW5kZXg7XG5cdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlID0gY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZTtcblx0XHR0aGlzLl9mb3JjZUV4cGFuZFRlcm1pbmFsT3V0cHV0ID0gaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgJiYgY29udGV4dC5lbGVtZW50LmlzVGVybWluYWxDb21tYW5kO1xuXG5cdFx0dGVybWluYWxEYXRhID0gbWlncmF0ZUxlZ2FjeVRlcm1pbmFsVG9vbFNwZWNpZmljRGF0YSh0ZXJtaW5hbERhdGEpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsRGF0YSA9IHRlcm1pbmFsRGF0YTtcblx0XHR0aGlzLl90ZXJtaW5hbENvbW1hbmRVcmkgPSB0ZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kVXJpID8gVVJJLnJldml2ZSh0ZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kVXJpKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9pc1NlcmlhbGl6ZWRJbnZvY2F0aW9uID0gKHRvb2xJbnZvY2F0aW9uLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKTtcblxuXHRcdGNvbnN0IGVsZW1lbnRzID0gaCgnLmNoYXQtdGVybWluYWwtY29udGVudC1wYXJ0QGNvbnRhaW5lcicsIFtcblx0XHRcdGgoJy5jaGF0LXRlcm1pbmFsLWNvbnRlbnQtdGl0bGVAdGl0bGUnLCBbXG5cdFx0XHRcdGgoJy5jaGF0LXRlcm1pbmFsLWNvbW1hbmQtYmxvY2tAY29tbWFuZEJsb2NrJylcblx0XHRcdF0pLFxuXHRcdFx0aCgnLmNoYXQtdGVybWluYWwtY29udGVudC1tZXNzYWdlQG1lc3NhZ2UnKVxuXHRcdF0pO1xuXHRcdHRoaXMuX3RpdGxlRWxlbWVudCA9IGVsZW1lbnRzLnRpdGxlO1xuXG5cdFx0Y29uc3QgY29tbWFuZCA9ICh0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUuZm9yRGlzcGxheSA/PyB0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUudXNlckVkaXRlZCA/PyB0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUudG9vbEVkaXRlZCA/PyB0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUub3JpZ2luYWwpLnRyaW1TdGFydCgpO1xuXHRcdHRoaXMuX2NvbW1hbmRUZXh0ID0gY29tbWFuZDtcblx0XHR0aGlzLl90ZXJtaW5hbE91dHB1dENvbnRleHRLZXkgPSBDaGF0Q29udGV4dEtleXMuaW5DaGF0VGVybWluYWxUb29sT3V0cHV0LmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9kZWNvcmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxDb21tYW5kRGVjb3JhdGlvbiwge1xuXHRcdFx0dGVybWluYWxEYXRhOiB0aGlzLl90ZXJtaW5hbERhdGEsXG5cdFx0XHRnZXRDb21tYW5kQmxvY2s6ICgpID0+IGVsZW1lbnRzLmNvbW1hbmRCbG9jayxcblx0XHRcdGdldEljb25FbGVtZW50OiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRnZXRSZXNvbHZlZENvbW1hbmQ6ICgpID0+IHRoaXMuX2dldFJlc29sdmVkQ29tbWFuZCgpLFxuXHRcdFx0Z2V0SXNSdW5uaW5nOiAoKSA9PiB0aGlzLl9pc0ludm9jYXRpb25SdW5uaW5nKCksXG5cdFx0XHRnZXRFeGl0Q29kZTogKCkgPT4gdGhpcy5fb3V0cHV0U291cmNlPy5leGl0Q29kZSxcblx0XHR9KSk7XG5cblx0XHQvLyBVc2UgcHJlc2VudGF0aW9uT3ZlcnJpZGVzIGZvciBkaXNwbGF5IGlmIGF2YWlsYWJsZSAoZS5nLiwgZXh0cmFjdGVkIFB5dGhvbiBjb2RlIHdpdGggc3ludGF4IGhpZ2hsaWdodGluZylcblx0XHRjb25zdCBkaXNwbGF5Q29tbWFuZCA9IHRlcm1pbmFsRGF0YS5wcmVzZW50YXRpb25PdmVycmlkZXM/LmNvbW1hbmRMaW5lID8/IGNvbW1hbmQ7XG5cdFx0Y29uc3QgZGlzcGxheUxhbmd1YWdlID0gdGVybWluYWxEYXRhLnByZXNlbnRhdGlvbk92ZXJyaWRlcz8ubGFuZ3VhZ2UgPz8gdGVybWluYWxEYXRhLmxhbmd1YWdlO1xuXHRcdGNvbnN0IHRpdGxlUGFydCA9IHRoaXMuX3JlZ2lzdGVyKF9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRRdWVyeVRpdGxlUGFydCxcblx0XHRcdGVsZW1lbnRzLmNvbW1hbmRCbG9jayxcblx0XHRcdG5ldyBNYXJrZG93blN0cmluZyhbXG5cdFx0XHRcdGBcXGBcXGBcXGAke2Rpc3BsYXlMYW5ndWFnZX1gLFxuXHRcdFx0XHRgJHtkaXNwbGF5Q29tbWFuZC5yZXBsYWNlQWxsKCdgYGAnLCAnXFxcXGBcXFxcYFxcXFxgJyl9YCxcblx0XHRcdFx0YFxcYFxcYFxcYGBcblx0XHRcdF0uam9pbignXFxuJyksIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGl0bGVQYXJ0Lm9uRGlkQ2hhbmdlSGVpZ2h0KCgpID0+IHtcblx0XHRcdHRoaXMuX2RlY29yYXRpb24udXBkYXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fb3V0cHV0VmlldyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFRlcm1pbmFsVG9vbE91dHB1dFNlY3Rpb24sXG5cdFx0XHQoKSA9PiB0aGlzLl9lbnN1cmVUZXJtaW5hbEluc3RhbmNlKCksXG5cdFx0XHQoKSA9PiB0aGlzLl9nZXRSZXNvbHZlZENvbW1hbmQoKSxcblx0XHRcdCgpID0+IHRoaXMuX291dHB1dFNvdXJjZSxcblx0XHRcdCgpID0+IHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQsXG5cdFx0XHQoKSA9PiB0aGlzLl9jb21tYW5kVGV4dCxcblx0XHRcdCgpID0+IHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRoZW1lLFxuXHRcdFx0KCkgPT4gdGhpcy5faXNJbnZvY2F0aW9uUnVubmluZygpLFxuXHRcdFx0ISF0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxUb29sU2Vzc2lvbklkLFxuXHRcdCkpO1xuXHRcdC8vIE9ubHkgYXBwZW5kIHRoZSBvdXRwdXQgc2VjdGlvbiBpZiB0aGVyZSdzIGEgdGVybWluYWwgc2Vzc2lvbiBvciBzdG9yZWQgb3V0cHV0O1xuXHRcdC8vIGRpc3BsYXktb25seSBpbnZvY2F0aW9ucyB3aXRoIG5vIG91dHB1dCBkb24ndCBuZWVkIHRoZSBvdXRwdXQgYXJlYSBhdCBhbGxcblx0XHRpZiAodGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZCB8fCB0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kT3V0cHV0KSB7XG5cdFx0XHRlbGVtZW50cy5jb250YWluZXIuYXBwZW5kKHRoaXMuX291dHB1dFZpZXcuZG9tTm9kZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX291dHB1dFZpZXcub25EaWRGb2N1cygoKSA9PiB0aGlzLl9oYW5kbGVPdXRwdXRGb2N1cygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fb3V0cHV0Vmlldy5vbkRpZEJsdXIoZSA9PiB0aGlzLl9oYW5kbGVPdXRwdXRCbHVyKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2hhbmRsZURpc3Bvc2UoKSkpO1xuXG5cdFx0Ly8gVXNlIGEgbGlnaHR3ZWlnaHQgQWN0aW9uQmFyIGluc3RlYWQgb2YgTWVudVdvcmtiZW5jaFRvb2xCYXIgdG8gYXZvaWRcblx0XHQvLyBhY2N1bXVsYXRpbmcgbGlzdGVuZXJzIG9uIHRoZSBzaGFyZWQgSUNvbnRleHRLZXlTZXJ2aWNlIHdoZW4gbWFueVxuXHRcdC8vIHRlcm1pbmFsIHRvb2wgcHJvZ3Jlc3MgcGFydHMgZXhpc3QgY29uY3VycmVudGx5IChmaXhlcyBsaXN0ZW5lciBMRUFLKS5cblx0XHRjb25zdCBhY3Rpb25CYXJFbCA9IGgoJy5jaGF0LXRlcm1pbmFsLWFjdGlvbi1iYXJAYWN0aW9uQmFyJyk7XG5cdFx0ZWxlbWVudHMudGl0bGUuYXBwZW5kKGFjdGlvbkJhckVsLnJvb3QpO1xuXHRcdHRoaXMuX2FjdGlvbkJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25CYXIoYWN0aW9uQmFyRWwuYWN0aW9uQmFyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYWN0aW9uQmFyQWN0aW9ucyk7XG5cdFx0bGV0IGRpZEluaXRpYWxpemVUZXJtaW5hbEFjdGlvbnMgPSBmYWxzZTtcblx0XHRjb25zdCBpbml0aWFsaXplVGVybWluYWxBY3Rpb25zT25jZSA9ICgpID0+IHtcblx0XHRcdGlmIChkaWRJbml0aWFsaXplVGVybWluYWxBY3Rpb25zIHx8IHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZGlkSW5pdGlhbGl6ZVRlcm1pbmFsQWN0aW9ucyA9IHRydWU7XG5cdFx0XHR0aGlzLl9pbml0aWFsaXplVGVybWluYWxBY3Rpb25zKCk7XG5cdFx0fTtcblx0XHRpbml0aWFsaXplVGVybWluYWxBY3Rpb25zT25jZSgpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS53aGVuQ29ubmVjdGVkLnRoZW4oKCkgPT4ge1xuXHRcdFx0aW5pdGlhbGl6ZVRlcm1pbmFsQWN0aW9uc09uY2UoKTtcblx0XHR9KTtcblxuXHRcdC8vIExpc3RlbiBmb3IgY29udGludWUgaW4gYmFja2dyb3VuZCBcdTIwMTQgdXBkYXRlcyB0b29sYmFyIHRvIGF1dG8taGlkZSB0aGUgYWN0aW9uXG5cdFx0Y29uc3QgdGVybWluYWxUb29sU2Vzc2lvbklkID0gdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZDtcblx0XHRpZiAodGVybWluYWxUb29sU2Vzc2lvbklkKSB7XG5cdFx0XHRpZiAodGhpcy5fdGVybWluYWxEYXRhLmlzUHR5ID09PSBmYWxzZSkge1xuXHRcdFx0XHR0aGlzLl9hdHRhY2hPdXRwdXRTb3VyY2UoKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxDaGF0U2VydmljZS5vbkRpZFJlZ2lzdGVyT3V0cHV0U291cmNlKHNlc3Npb25JZCA9PiB7XG5cdFx0XHRcdFx0aWYgKHNlc3Npb25JZCA9PT0gdGVybWluYWxUb29sU2Vzc2lvbklkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9hdHRhY2hPdXRwdXRTb3VyY2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2Uub25EaWRDb250aW51ZUluQmFja2dyb3VuZChzZXNzaW9uSWQgPT4ge1xuXHRcdFx0XHRpZiAoc2Vzc2lvbklkID09PSB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpIHtcblx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbERhdGEuZGlkQ29udGludWVJbkJhY2tncm91bmQgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX3Rvb2xiYXJDYW5Db250aW51ZUluQmFja2dyb3VuZCA9IGZhbHNlO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZVRvb2xiYXJBY3Rpb25zKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0bGV0IHBhc3RUZW5zZU1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAodG9vbEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSkge1xuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZSA9IGAke3R5cGVvZiB0b29sSW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlID09PSAnc3RyaW5nJyA/IHRvb2xJbnZvY2F0aW9uLnBhc3RUZW5zZU1lc3NhZ2UgOiB0b29sSW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlLnZhbHVlfWA7XG5cdFx0fVxuXHRcdGNvbnN0IG1hcmtkb3duQ29udGVudCA9IG5ldyBNYXJrZG93blN0cmluZyhwYXN0VGVuc2VNZXNzYWdlLCB7XG5cdFx0XHRzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSxcblx0XHRcdGlzVHJ1c3RlZDogaXNNYXJrZG93blN0cmluZyh0b29sSW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlKSA/IHRvb2xJbnZvY2F0aW9uLnBhc3RUZW5zZU1lc3NhZ2UuaXNUcnVzdGVkIDogZmFsc2UsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdE1hcmtkb3duQ29udGVudDogSUNoYXRNYXJrZG93bkNvbnRlbnQgPSB7XG5cdFx0XHRraW5kOiAnbWFya2Rvd25Db250ZW50Jyxcblx0XHRcdGNvbnRlbnQ6IG1hcmtkb3duQ29udGVudCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgY29kZUJsb2NrUmVuZGVyT3B0aW9uczogSUNvZGVCbG9ja1JlbmRlck9wdGlvbnMgPSB7XG5cdFx0XHRoaWRlVG9vbGJhcjogdHJ1ZSxcblx0XHRcdHJlc2VydmVXaWR0aDogMTksXG5cdFx0XHR2ZXJ0aWNhbFBhZGRpbmc6IDUsXG5cdFx0XHRlZGl0b3JPcHRpb25zOiB7XG5cdFx0XHRcdHdvcmRXcmFwOiAnb24nXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IG1hcmtkb3duT3B0aW9uczogSUNoYXRNYXJrZG93bkNvbnRlbnRQYXJ0T3B0aW9ucyA9IHtcblx0XHRcdGNvZGVCbG9ja1JlbmRlck9wdGlvbnMsXG5cdFx0XHRhY2Nlc3NpYmlsaXR5T3B0aW9uczogcGFzdFRlbnNlTWVzc2FnZSA/IHtcblx0XHRcdFx0c3RhdHVzTWVzc2FnZTogbG9jYWxpemUoJ3Rlcm1pbmFsVG9vbENvbW1hbmQnLCAnezB9Jywgc3RyaXBJY29ucyhwYXN0VGVuc2VNZXNzYWdlKSlcblx0XHRcdH0gOiB1bmRlZmluZWRcblx0XHR9O1xuXG5cdFx0dGhpcy5tYXJrZG93blBhcnQgPSB0aGlzLl9yZWdpc3RlcihfaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1hcmtkb3duQ29udGVudFBhcnQsIGNoYXRNYXJrZG93bkNvbnRlbnQsIGNvbnRleHQsIGVkaXRvclBvb2wsIGZhbHNlLCBjb2RlQmxvY2tTdGFydEluZGV4LCByZW5kZXJlciwge30sIGN1cnJlbnRXaWR0aERlbGVnYXRlKCksIG1hcmtkb3duT3B0aW9ucykpO1xuXG5cdFx0ZWxlbWVudHMubWVzc2FnZS5hcHBlbmQodGhpcy5tYXJrZG93blBhcnQuZG9tTm9kZSk7XG5cdFx0Y29uc3QgcHJvZ3Jlc3NQYXJ0ID0gdGhpcy5fcmVnaXN0ZXIoX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRQcm9ncmVzc1N1YlBhcnQsIGVsZW1lbnRzLmNvbnRhaW5lciwgdGhpcy5nZXRJY29uKCksIHRlcm1pbmFsRGF0YS5hdXRvQXBwcm92ZUluZm8pKTtcblx0XHRwcm9ncmVzc1BhcnQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LXRlcm1pbmFsLXByb2dyZXNzLXJvdycpO1xuXHRcdHRoaXMuX2RlY29yYXRpb24udXBkYXRlKCk7XG5cdFx0aWYgKHRvb2xJbnZvY2F0aW9uLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0dG9vbEludm9jYXRpb24uc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9uLnVwZGF0ZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIEtlZXAgdGhpbmtpbmctY29udGFpbmVyIHNlbWFudGljcyBzZXBhcmF0ZSBmcm9tIHdyYXBwZXIgc2VtYW50aWNzLlxuXHRcdGNvbnN0IHRlcm1pbmFsVG9vbHNJblRoaW5raW5nID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uVGVybWluYWxUb29sc0luVGhpbmtpbmcpO1xuXHRcdGNvbnN0IGlzU2ltcGxlVGVybWluYWwgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5TaW1wbGVUZXJtaW5hbENvbGxhcHNpYmxlKTtcblx0XHRjb25zdCByZXF1aXJlc0NvbmZpcm1hdGlvbiA9IHRvb2xJbnZvY2F0aW9uLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgJiYgSUNoYXRUb29sSW52b2NhdGlvbi5nZXRDb25maXJtYXRpb25NZXNzYWdlcyh0b29sSW52b2NhdGlvbik7XG5cdFx0dGhpcy5faXNJblRoaW5raW5nQ29udGFpbmVyID0gdGVybWluYWxUb29sc0luVGhpbmtpbmcgJiYgIXJlcXVpcmVzQ29uZmlybWF0aW9uO1xuXHRcdHRoaXMuX3VzZXNDb2xsYXBzaWJsZVdyYXBwZXIgPSB0aGlzLl9pc0luVGhpbmtpbmdDb250YWluZXIgfHwgaXNTaW1wbGVUZXJtaW5hbDtcblxuXHRcdGlmICh0aGlzLl91c2VzQ29sbGFwc2libGVXcmFwcGVyKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUgPSB0aGlzLl9jcmVhdGVDb2xsYXBzaWJsZVdyYXBwZXIocHJvZ3Jlc3NQYXJ0LmRvbU5vZGUsIGRpc3BsYXlDb21tYW5kLCB0b29sSW52b2NhdGlvbiwgY29udGV4dCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZG9tTm9kZSA9IHByb2dyZXNzUGFydC5kb21Ob2RlO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlbmRlckltYWdlUGlsbHModG9vbEludm9jYXRpb24sIGNvbnRleHQsIGVsZW1lbnRzLmNvbnRhaW5lcik7XG5cblx0XHQvLyBPbmx5IGF1dG8tZXhwYW5kIGluIHRoaW5raW5nIGNvbnRhaW5lcnMgaWYgdGhlcmUncyBhY3R1YWwgb3V0cHV0IHRvIHNob3dcblx0XHRjb25zdCBoYXNTdG9yZWRPdXRwdXQgPSAhIXRlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQ7XG5cdFx0Y29uc3Qgc3RvcmVkRXhwYW5kZWRTdGF0ZSA9IGV4cGFuZGVkU3RhdGVCeUludm9jYXRpb24uZ2V0KHRvb2xJbnZvY2F0aW9uKTtcblx0XHRjb25zdCBoYXNTdG9yZWRFeHBhbmRlZFN0YXRlID0gZXhwYW5kZWRTdGF0ZUJ5SW52b2NhdGlvbi5oYXModG9vbEludm9jYXRpb24pO1xuXHRcdGlmIChzdG9yZWRFeHBhbmRlZFN0YXRlIHx8ICghaGFzU3RvcmVkRXhwYW5kZWRTdGF0ZSAmJiB0aGlzLl9mb3JjZUV4cGFuZFRlcm1pbmFsT3V0cHV0KSB8fCAodGhpcy5faXNJblRoaW5raW5nQ29udGFpbmVyICYmIElDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZSh0b29sSW52b2NhdGlvbikgJiYgaGFzU3RvcmVkT3V0cHV0KSkge1xuXHRcdFx0dm9pZCB0aGlzLl90b2dnbGVPdXRwdXQodHJ1ZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UucmVnaXN0ZXJQcm9ncmVzc1BhcnQodGhpcykpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgaW1hZ2UgYXR0YWNobWVudCBwaWxscyBiZWxvdyB0aGUgdGVybWluYWwgb3V0cHV0IHdoZW4gdGhlIHRvb2xcblx0ICogcmVzdWx0IGNvbnRhaW5zIGltYWdlIGRhdGEgcGFydHMuIEZvciBjb2xsYXBzaWJsZSB3cmFwcGVycywgdGhlIHNpbmdsZVxuXHQgKiB3aWRnZXQgaXMgcmVwYXJlbnRlZCBiZXR3ZWVuIGluc2lkZS9vdXRzaWRlIGJhc2VkIG9uIGV4cGFuZGVkIHN0YXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVySW1hZ2VQaWxscyh0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgaW5uZXJDb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcmVuZGVySW1hZ2VzID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXh0cmFjdGVkID0gZXh0cmFjdEltYWdlc0Zyb21Ub29sSW52b2NhdGlvbk91dHB1dERldGFpbHModG9vbEludm9jYXRpb24sIGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgaW1hZ2VQYXJ0czogSUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnRbXSA9IGV4dHJhY3RlZC5tYXAoaW1nID0+ICh7XG5cdFx0XHRcdGtpbmQ6ICdkYXRhJyxcblx0XHRcdFx0dmFsdWU6IGltZy5kYXRhLmJ1ZmZlcixcblx0XHRcdFx0bWltZVR5cGU6IGltZy5taW1lVHlwZSxcblx0XHRcdFx0dXJpOiBpbWcudXJpLFxuXHRcdFx0fSkpO1xuXHRcdFx0aWYgKGltYWdlUGFydHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlc291cmNlR3JvdXBXaWRnZXQsIGltYWdlUGFydHMpKTtcblxuXHRcdFx0aWYgKHRoaXMuX3RoaW5raW5nQ29sbGFwc2libGVXcmFwcGVyKSB7XG5cdFx0XHRcdC8vIFJlcGFyZW50IHRoZSBzaW5nbGUgd2lkZ2V0IGJldHdlZW4gaW5uZXIgKGV4cGFuZGVkKSBhbmQgb3V0ZXIgKGNvbGxhcHNlZClcblx0XHRcdFx0Y29uc3Qgd3JhcHBlciA9IHRoaXMuX3RoaW5raW5nQ29sbGFwc2libGVXcmFwcGVyO1xuXHRcdFx0XHRjb25zdCBwbGFjZVdpZGdldCA9IChleHBhbmRlZDogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRcdGlmIChleHBhbmRlZCkge1xuXHRcdFx0XHRcdFx0aW5uZXJDb250YWluZXIuYXBwZW5kQ2hpbGQod2lkZ2V0LmRvbU5vZGUpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR3cmFwcGVyLmRvbU5vZGUuYXBwZW5kQ2hpbGQod2lkZ2V0LmRvbU5vZGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0cGxhY2VXaWRnZXQod3JhcHBlci5leHBhbmRlZC5nZXQoKSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRwbGFjZVdpZGdldCh3cmFwcGVyLmV4cGFuZGVkLnJlYWQocmVhZGVyKSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlubmVyQ29udGFpbmVyLmFwcGVuZENoaWxkKHdpZGdldC5kb21Ob2RlKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aWYgKHRvb2xJbnZvY2F0aW9uLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSB7XG5cdFx0XHRyZW5kZXJJbWFnZXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCkge1xuXHRcdFx0XHRcdHJlbmRlckltYWdlcygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlQ29sbGFwc2libGVXcmFwcGVyKGNvbnRlbnRFbGVtZW50OiBIVE1MRWxlbWVudCwgY29tbWFuZFRleHQ6IHN0cmluZywgdG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCwgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQpOiBIVE1MRWxlbWVudCB7XG5cdFx0Ly8gdHJ1bmNhdGUgaGVhZGVyIHdoZW4gaXQncyB0b28gbG9uZ1xuXHRcdGNvbnN0IHRydW5jYXRlZENvbW1hbmQgPSBjb21tYW5kVGV4dC5sZW5ndGggPiBNQVhfQ09NTUFORF9USVRMRV9MRU5HVEhcblx0XHRcdD8gY29tbWFuZFRleHQuc3Vic3RyaW5nKDAsIE1BWF9DT01NQU5EX1RJVExFX0xFTkdUSCkgKyAnLi4uJ1xuXHRcdFx0OiBjb21tYW5kVGV4dDtcblxuXHRcdC8vIEEgYmFja2dyb3VuZCB0ZXJtaW5hbCBtYXkgaGF2ZSBpdHMgdG9vbCBpbnZvY2F0aW9uIG1hcmtlZCBjb21wbGV0ZSAodGhlXG5cdFx0Ly8gdG9vbCByZXR1cm5lZCkgd2hpbGUgdGhlIHRlcm1pbmFsIGNvbW1hbmQgaXMgc3RpbGwgcnVubmluZy4gRGV0ZWN0IHRoaXNcblx0XHQvLyBzbyB0aGUgd3JhcHBlciBzaG93cyBcIlJ1bm5pbmcgXHUyMDI2IGluIGJhY2tncm91bmRcIiBpbnN0ZWFkIG9mIFwiUmFuIFx1MjAyNlwiLlxuXHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uQ29tcGxldGUgPSBJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUodG9vbEludm9jYXRpb24pO1xuXHRcdGNvbnN0IGlzUnVubmluZ0luQmFja2dyb3VuZCA9IHRvb2xJbnZvY2F0aW9uQ29tcGxldGUgJiYgdGhpcy5faXNJbnZvY2F0aW9uUnVubmluZygpO1xuXHRcdGNvbnN0IGlzQ29tcGxldGUgPSB0b29sSW52b2NhdGlvbkNvbXBsZXRlICYmICFpc1J1bm5pbmdJbkJhY2tncm91bmQ7XG5cdFx0Y29uc3QgaXNTa2lwcGVkID0gSUNoYXRUb29sSW52b2NhdGlvbi5leGVjdXRpb25Db25maXJtZWRPckRlbmllZCh0b29sSW52b2NhdGlvbik/LnR5cGUgPT09IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkO1xuXHRcdGNvbnN0IGF1dG9FeHBhbmRGYWlsdXJlcyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkF1dG9FeHBhbmRUb29sRmFpbHVyZXMpO1xuXHRcdGNvbnN0IGhhc0Vycm9yID0gYXV0b0V4cGFuZEZhaWx1cmVzICYmIHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZT8uZXhpdENvZGUgIT09IHVuZGVmaW5lZCAmJiB0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kU3RhdGUuZXhpdENvZGUgIT09IDA7XG5cdFx0Y29uc3QgaW5pdGlhbEV4cGFuZGVkID0gIWlzQ29tcGxldGUgfHwgaGFzRXJyb3IgfHwgdGhpcy5fZm9yY2VFeHBhbmRUZXJtaW5hbE91dHB1dDtcblxuXHRcdGNvbnN0IHdyYXBwZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRUZXJtaW5hbFRoaW5raW5nQ29sbGFwc2libGVXcmFwcGVyLFxuXHRcdFx0dHJ1bmNhdGVkQ29tbWFuZCxcblx0XHRcdHRoaXMuX3Rlcm1pbmFsRGF0YS5pbnRlbnRpb24sXG5cdFx0XHR0aGlzLl90ZXJtaW5hbERhdGEuY29tbWFuZExpbmUuaXNTYW5kYm94V3JhcHBlZCA9PT0gdHJ1ZSxcblx0XHRcdGNvbnRlbnRFbGVtZW50LFxuXHRcdFx0Y29udGV4dCxcblx0XHRcdGluaXRpYWxFeHBhbmRlZCxcblx0XHRcdGlzQ29tcGxldGUsXG5cdFx0XHRpc1NraXBwZWQsXG5cdFx0XHRpc1J1bm5pbmdJbkJhY2tncm91bmQsXG5cdFx0XHR0aGlzLl90ZXJtaW5hbERhdGEuaXNQdHkgPT09IGZhbHNlID8gdW5kZWZpbmVkIDogKCkgPT4gdGhpcy5mb2N1c1Rlcm1pbmFsKCksXG5cdFx0KSk7XG5cdFx0dGhpcy5fdGhpbmtpbmdDb2xsYXBzaWJsZVdyYXBwZXIgPSB3cmFwcGVyO1xuXG5cdFx0Ly8gU3luYyB0ZXJtaW5hbCBvdXRwdXQgZXhwYW5zaW9uIHdpdGggdGhlIGNvbGxhcHNpYmxlIHdyYXBwZXIuXG5cdFx0Ly8gU2tpcCB0aGUgaW5pdGlhbCBydW4gXHUyMDE0IGluaXRpYWwgc3RhdGUgaXMgaGFuZGxlZCBzZXBhcmF0ZWx5LlxuXHRcdGxldCBpc0ZpcnN0UnVuID0gdHJ1ZTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3QgZXhwYW5kZWQgPSB3cmFwcGVyLmV4cGFuZGVkLnJlYWQocik7XG5cdFx0XHRpZiAoaXNGaXJzdFJ1bikge1xuXHRcdFx0XHRpc0ZpcnN0UnVuID0gZmFsc2U7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3RvZ2dsZU91dHB1dChleHBhbmRlZCk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHdyYXBwZXIuZG9tTm9kZTtcblx0fVxuXG5cdHB1YmxpYyBleHBhbmRDb2xsYXBzaWJsZVdyYXBwZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fdGhpbmtpbmdDb2xsYXBzaWJsZVdyYXBwZXI/LmV4cGFuZCgpO1xuXHR9XG5cblx0cHVibGljIG1hcmtDb2xsYXBzaWJsZVdyYXBwZXJDb21wbGV0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl90aGlua2luZ0NvbGxhcHNpYmxlV3JhcHBlcj8ubWFya0NvbXBsZXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbml0aWFsaXplVGVybWluYWxBY3Rpb25zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRlcm1pbmFsVG9vbFNlc3Npb25JZCA9IHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQ7XG5cdFx0aWYgKCF0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZVRvb2xiYXJDb250ZXh0S2V5cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fdGVybWluYWxEYXRhLmlzUHR5ID09PSBmYWxzZSkge1xuXHRcdFx0dGhpcy5fYXR0YWNoT3V0cHV0U291cmNlKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVUb29sYmFyQ29udGV4dEtleXModW5kZWZpbmVkLCB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF0dGFjaEluc3RhbmNlID0gYXN5bmMgKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpbnN0YW5jZSkge1xuXHRcdFx0XHRpZiAodGhpcy5faXNTZXJpYWxpemVkSW52b2NhdGlvbikge1xuXHRcdFx0XHRcdHRoaXMuX2NsZWFyQ29tbWFuZEFzc29jaWF0aW9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdXBkYXRlVG9vbGJhckNvbnRleHRLZXlzKHVuZGVmaW5lZCwgdGVybWluYWxUb29sU2Vzc2lvbklkKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaXNOZXdJbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2UgIT09IGluc3RhbmNlO1xuXHRcdFx0aWYgKGlzTmV3SW5zdGFuY2UpIHtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxJbnN0YW5jZSA9IGluc3RhbmNlO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlckluc3RhbmNlTGlzdGVuZXIoaW5zdGFuY2UpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdXBkYXRlVG9vbGJhckNvbnRleHRLZXlzKGluc3RhbmNlLCB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdH07XG5cblx0XHRjb25zdCBpbml0aWFsSW5zdGFuY2UgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLmdldFRlcm1pbmFsSW5zdGFuY2VCeVRvb2xTZXNzaW9uSWQodGVybWluYWxUb29sU2Vzc2lvbklkKTtcblx0XHRhd2FpdCBhdHRhY2hJbnN0YW5jZShpbml0aWFsSW5zdGFuY2UpO1xuXG5cdFx0aWYgKCFpbml0aWFsSW5zdGFuY2UpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZVRvb2xiYXJDb250ZXh0S2V5cyh1bmRlZmluZWQsIHRlcm1pbmFsVG9vbFNlc3Npb25JZCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsU2Vzc2lvblJlZ2lzdHJhdGlvbikge1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSB0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLm9uRGlkUmVnaXN0ZXJUZXJtaW5hbEluc3RhbmNlV2l0aFRvb2xTZXNzaW9uKGFzeW5jIGluc3RhbmNlID0+IHtcblx0XHRcdFx0Y29uc3QgcmVnaXN0ZXJlZEluc3RhbmNlID0gYXdhaXQgdGhpcy5fdGVybWluYWxDaGF0U2VydmljZS5nZXRUZXJtaW5hbEluc3RhbmNlQnlUb29sU2Vzc2lvbklkKHRlcm1pbmFsVG9vbFNlc3Npb25JZCk7XG5cdFx0XHRcdGlmIChpbnN0YW5jZSAhPT0gcmVnaXN0ZXJlZEluc3RhbmNlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2Vzc2lvblJlZ2lzdHJhdGlvbj8uZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlc3Npb25SZWdpc3RyYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGF3YWl0IGF0dGFjaEluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fdGVybWluYWxTZXNzaW9uUmVnaXN0cmF0aW9uID0gdGhpcy5fc3RvcmUuYWRkKGxpc3RlbmVyKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgc2NvcGVkIGNvbnRleHQga2V5cyB0aGF0IGRyaXZlIHRvb2xiYXIgYWN0aW9uIHZpc2liaWxpdHkuXG5cdCAqIFRoZSBBY3Rpb25CYXIgaXMgcmVidWlsdCB3aXRoIHRoZSBjb3JyZWN0IHNldCBvZiB2aXNpYmxlIGFjdGlvbnMuXG5cdCAqL1xuXHRwcml2YXRlIF91cGRhdGVUb29sYmFyQ29udGV4dEtleXModGVybWluYWxJbnN0YW5jZT86IElUZXJtaW5hbEluc3RhbmNlLCB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZXNvbHZlZENvbW1hbmQgPSB0aGlzLl9nZXRSZXNvbHZlZENvbW1hbmQodGVybWluYWxJbnN0YW5jZSk7XG5cblx0XHQvLyBGb2N1cyB0ZXJtaW5hbCBhY3Rpb25cblx0XHR0aGlzLl90b29sYmFySGFzSW5zdGFuY2UgPSAhIXRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0aWYgKHRlcm1pbmFsSW5zdGFuY2UgJiYgdGVybWluYWxUb29sU2Vzc2lvbklkKSB7XG5cdFx0XHR0aGlzLl90b29sYmFySXNIaWRkZW5UZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UuaXNCYWNrZ3JvdW5kVGVybWluYWwodGVybWluYWxUb29sU2Vzc2lvbklkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdG9vbGJhcklzSGlkZGVuVGVybWluYWwgPSBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBDb250aW51ZSBpbiBiYWNrZ3JvdW5kIGFjdGlvblxuXHRcdGlmICh0ZXJtaW5hbEluc3RhbmNlICYmIHRlcm1pbmFsVG9vbFNlc3Npb25JZCAmJiAhdGhpcy5fdGVybWluYWxEYXRhLmlzQmFja2dyb3VuZCAmJiAhdGhpcy5fdGVybWluYWxEYXRhLmRpZENvbnRpbnVlSW5CYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb25zdCBpc1N0aWxsUnVubmluZyA9IHJlc29sdmVkQ29tbWFuZD8uZXhpdENvZGUgPT09IHVuZGVmaW5lZCAmJiB0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kU3RhdGU/LmV4aXRDb2RlID09PSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl90b29sYmFyQ2FuQ29udGludWVJbkJhY2tncm91bmQgPSBpc1N0aWxsUnVubmluZztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdG9vbGJhckNhbkNvbnRpbnVlSW5CYWNrZ3JvdW5kID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyBvdXRwdXQgYWN0aW9uIChvbmx5IHdoZW4gTk9UIHVzaW5nIGNvbGxhcHNpYmxlIHdyYXBwZXIpXG5cdFx0aWYgKCF0aGlzLl91c2VzQ29sbGFwc2libGVXcmFwcGVyKSB7XG5cdFx0XHRjb25zdCBoYXNTbmFwc2hvdCA9ICEhdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dCB8fCAhIXRoaXMuX291dHB1dFNvdXJjZT8ub3V0cHV0O1xuXHRcdFx0Y29uc3QgaGFzT3V0cHV0ID0gISFyZXNvbHZlZENvbW1hbmQgfHwgaGFzU25hcHNob3Q7XG5cdFx0XHR0aGlzLl90b29sYmFySGFzT3V0cHV0ID0gaGFzT3V0cHV0O1xuXG5cdFx0XHQvLyBBdXRvLWV4cGFuZCBvbiBmaXJzdCBkZXRlY3Rpb24gb2YgZmFpbGVkIG91dHB1dFxuXHRcdFx0aWYgKGhhc091dHB1dCAmJiAhdGhpcy5fb3V0cHV0Vmlldy5pc0V4cGFuZGVkKSB7XG5cdFx0XHRcdGNvbnN0IGF1dG9FeHBhbmRGYWlsdXJlcyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkF1dG9FeHBhbmRUb29sRmFpbHVyZXMpO1xuXHRcdFx0XHRjb25zdCBleGl0Q29kZSA9IHJlc29sdmVkQ29tbWFuZD8uZXhpdENvZGUgPz8gdGhpcy5fb3V0cHV0U291cmNlPy5leGl0Q29kZSA/PyB0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kU3RhdGU/LmV4aXRDb2RlO1xuXHRcdFx0XHRpZiAoZXhpdENvZGUgIT09IHVuZGVmaW5lZCAmJiBleGl0Q29kZSAhPT0gMCAmJiBhdXRvRXhwYW5kRmFpbHVyZXMpIHtcblx0XHRcdFx0XHR0aGlzLl90b2dnbGVPdXRwdXQodHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVUb29sYmFyQWN0aW9ucygpO1xuXHRcdHRoaXMuX2RlY29yYXRpb24udXBkYXRlKHJlc29sdmVkQ29tbWFuZCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVidWlsZHMgdGhlIEFjdGlvbkJhciBhY3Rpb25zIGJhc2VkIG9uIGN1cnJlbnQgdG9vbGJhciBzdGF0ZS5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZVRvb2xiYXJBY3Rpb25zKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYWN0aW9uQmFyIHx8IHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0dGhpcy5fYWN0aW9uQmFyQWN0aW9ucy5jbGVhcigpO1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGlmICh0aGlzLl90b29sYmFyQ2FuQ29udGludWVJbkJhY2tncm91bmQpIHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IG5ldyBBY3Rpb24oXG5cdFx0XHRcdFRlcm1pbmFsQ29udHJpYkNvbW1hbmRJZC5Db250aW51ZUluQmFja2dyb3VuZCxcblx0XHRcdFx0bG9jYWxpemUoJ2NvbnRpbnVlSW5CYWNrZ3JvdW5kJywgJ0NvbnRpbnVlIGluIEJhY2tncm91bmQnKSxcblx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZGVidWdDb250aW51ZVNtYWxsKSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0KCkgPT4gdGhpcy5jb250aW51ZUluQmFja2dyb3VuZCgpXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5fYWN0aW9uQmFyQWN0aW9ucy5hZGQoYWN0aW9uKTtcblx0XHRcdGFjdGlvbnMucHVzaChhY3Rpb24pO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fdG9vbGJhckhhc0luc3RhbmNlKSB7XG5cdFx0XHRjb25zdCBmb2N1c0xhYmVsID0gdGhpcy5fdG9vbGJhcklzSGlkZGVuVGVybWluYWxcblx0XHRcdFx0PyBsb2NhbGl6ZSgnc2hvd1Rlcm1pbmFsJywgJ1Nob3cgYW5kIEZvY3VzIFRlcm1pbmFsJylcblx0XHRcdFx0OiBsb2NhbGl6ZSgnZm9jdXNUZXJtaW5hbCcsICdGb2N1cyBUZXJtaW5hbCcpO1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gbmV3IEFjdGlvbihcblx0XHRcdFx0VGVybWluYWxDb250cmliQ29tbWFuZElkLkZvY3VzQ2hhdEluc3RhbmNlQWN0aW9uLFxuXHRcdFx0XHRmb2N1c0xhYmVsLFxuXHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5vcGVuSW5Qcm9kdWN0KSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0KCkgPT4gdGhpcy5mb2N1c1Rlcm1pbmFsKClcblx0XHRcdCk7XG5cdFx0XHR0aGlzLl9hY3Rpb25CYXJBY3Rpb25zLmFkZChhY3Rpb24pO1xuXHRcdFx0YWN0aW9ucy5wdXNoKGFjdGlvbik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl90b29sYmFySGFzT3V0cHV0ICYmICF0aGlzLl91c2VzQ29sbGFwc2libGVXcmFwcGVyKSB7XG5cdFx0XHRjb25zdCB0b2dnbGVJY29uID0gdGhpcy5fdG9vbGJhck91dHB1dEV4cGFuZGVkID8gQ29kaWNvbi5jaGV2cm9uRG93biA6IENvZGljb24uY2hldnJvblJpZ2h0O1xuXHRcdFx0Y29uc3QgdG9nZ2xlTGFiZWwgPSB0aGlzLl90b29sYmFyT3V0cHV0RXhwYW5kZWRcblx0XHRcdFx0PyBsb2NhbGl6ZSgnaGlkZVRlcm1pbmFsT3V0cHV0JywgJ0hpZGUgT3V0cHV0Jylcblx0XHRcdFx0OiBsb2NhbGl6ZSgnc2hvd1Rlcm1pbmFsT3V0cHV0JywgJ1Nob3cgT3V0cHV0Jyk7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBuZXcgQWN0aW9uKFxuXHRcdFx0XHRUZXJtaW5hbENvbnRyaWJDb21tYW5kSWQuVG9nZ2xlQ2hhdFRlcm1pbmFsT3V0cHV0LFxuXHRcdFx0XHR0b2dnbGVMYWJlbCxcblx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKHRvZ2dsZUljb24pLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQoKSA9PiB0aGlzLnRvZ2dsZU91dHB1dEZyb21BY3Rpb24oKVxuXHRcdFx0KTtcblx0XHRcdHRoaXMuX2FjdGlvbkJhckFjdGlvbnMuYWRkKGFjdGlvbik7XG5cdFx0XHRhY3Rpb25zLnB1c2goYWN0aW9uKTtcblx0XHR9XG5cdFx0dGhpcy5fYWN0aW9uQmFyLnB1c2goYWN0aW9ucywgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZXNvbHZlZENvbW1hbmQoaW5zdGFuY2U/OiBJVGVybWluYWxJbnN0YW5jZSk6IElUZXJtaW5hbENvbW1hbmQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHRhcmdldCA9IGluc3RhbmNlID8/IHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2U7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlQ29tbWFuZCh0YXJnZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNJbnZvY2F0aW9uUnVubmluZygpOiBib29sZWFuIHtcblx0XHRjb25zdCBjdXJyZW50VGVybWluYWxEYXRhID0gdGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAndGVybWluYWwnXG5cdFx0XHQ/IG1pZ3JhdGVMZWdhY3lUZXJtaW5hbFRvb2xTcGVjaWZpY0RhdGEodGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhKVxuXHRcdFx0OiB0aGlzLl90ZXJtaW5hbERhdGE7XG5cdFx0aWYgKGN1cnJlbnRUZXJtaW5hbERhdGEuaXNQdHkgPT09IGZhbHNlKSB7XG5cdFx0XHRpZiAodGhpcy5fb3V0cHV0U291cmNlPy5leGl0Q29kZSAhPT0gdW5kZWZpbmVkIHx8IGN1cnJlbnRUZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kU3RhdGU/LmV4aXRDb2RlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUodGhpcy50b29sSW52b2NhdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY3VycmVudFRlcm1pbmFsRGF0YS5pc0JhY2tncm91bmQgPT09IHRydWUgfHwgY3VycmVudFRlcm1pbmFsRGF0YS5kaWRDb250aW51ZUluQmFja2dyb3VuZCA9PT0gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgY29tbWFuZEV4aXRDb2RlID0gdGhpcy5fZ2V0UmVzb2x2ZWRDb21tYW5kKCk/LmV4aXRDb2RlO1xuXHRcdGlmIChjb21tYW5kRXhpdENvZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBzdG9yZWRFeGl0Q29kZSA9IGN1cnJlbnRUZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kU3RhdGU/LmV4aXRDb2RlO1xuXHRcdGlmIChzdG9yZWRFeGl0Q29kZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHRoaXMudG9vbEludm9jYXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGN1cnJlbnRUZXJtaW5hbERhdGEuaXNCYWNrZ3JvdW5kID09PSB0cnVlIHx8IGN1cnJlbnRUZXJtaW5hbERhdGEuZGlkQ29udGludWVJbkJhY2tncm91bmQgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckNvbW1hbmRBc3NvY2lhdGlvbihvcHRpb25zPzogeyBjbGVhclBlcnNpc3RlbnREYXRhPzogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0dGhpcy5fdGVybWluYWxDb21tYW5kVXJpID0gdW5kZWZpbmVkO1xuXHRcdGlmIChvcHRpb25zPy5jbGVhclBlcnNpc3RlbnREYXRhKSB7XG5cdFx0XHRpZiAodGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsQ29tbWFuZFVyaSkge1xuXHRcdFx0XHRkZWxldGUgdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsQ29tbWFuZFVyaTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxUb29sU2Vzc2lvbklkKSB7XG5cdFx0XHRcdGRlbGV0ZSB0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxUb29sU2Vzc2lvbklkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9kZWNvcmF0aW9uLnVwZGF0ZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERldGVybWluZXMgd2hldGhlciB0aGUgdGVybWluYWwgb3V0cHV0IHNob3VsZCBhdXRvLWV4cGFuZC5cblx0ICogUmV0dXJucyBmYWxzZSBpZiBhbHJlYWR5IGV4cGFuZGVkLCB1c2VyIGhhcyBtYW51YWxseSB0b2dnbGVkLCBjb21wb25lbnQgaXMgZGlzcG9zZWQsXG5cdCAqIG9yIGlmIHRoZSBpbnZvY2F0aW9uIHdhcyBwcmV2aW91c2x5IGV4cGFuZGVkICh0byBwcmVzZXJ2ZSBzdGF0ZSBhY3Jvc3MgcmUtcmVuZGVycykuXG5cdCAqL1xuXHRwcml2YXRlIF9zaG91bGRBdXRvRXhwYW5kKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5fb3V0cHV0Vmlldy5pc0V4cGFuZGVkICYmXG5cdFx0XHQhdGhpcy5fdXNlclRvZ2dsZWRPdXRwdXQgJiZcblx0XHRcdCF0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkICYmXG5cdFx0XHQoIXRoaXMuX2ZvcmNlRXhwYW5kVGVybWluYWxPdXRwdXQgfHwgIWV4cGFuZGVkU3RhdGVCeUludm9jYXRpb24uaGFzKHRoaXMudG9vbEludm9jYXRpb24pKSAmJlxuXHRcdFx0IWV4cGFuZGVkU3RhdGVCeUludm9jYXRpb24uZ2V0KHRoaXMudG9vbEludm9jYXRpb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVycyBldmVudCBsaXN0ZW5lcnMgb24gdGhlIHRlcm1pbmFsIGluc3RhbmNlIHRvIHRyYWNrIGNvbW1hbmQgZXhlY3V0aW9uLFxuXHQgKiBtYW5hZ2UgYXV0by1leHBhbnNpb24gb2Ygb3V0cHV0LCBhbmQgaGFuZGxlIGNvbW1hbmQgY29tcGxldGlvbi5cblx0ICpcblx0ICogVGhpcyBtZXRob2Qgc2V0cyB1cDpcblx0ICogLSBDb21tYW5kIGRldGVjdGlvbiBsaXN0ZW5lcnMgZm9yIHRyYWNraW5nIGNvbW1hbmQgbGlmZWN5Y2xlXG5cdCAqIC0gQXV0by1leHBhbmQgbG9naWMgYmFzZWQgb24gY29tbWFuZCBvdXRwdXQgYW5kIGR1cmF0aW9uXG5cdCAqIC0gSW5zdGFuY2UgZGlzcG9zYWwgaGFuZGxpbmcgdG8gY2xlYW4gdXAgYWN0aW9ucyBhbmQgc3RhdGVcblx0ICovXG5cdHByaXZhdGUgX3JlZ2lzdGVySW5zdGFuY2VMaXN0ZW5lcih0ZXJtaW5hbEluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb25MaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdFx0Y29uc3QgdHJ5UmVzb2x2ZUNvbW1hbmQgPSBhc3luYyAoKTogUHJvbWlzZTxJVGVybWluYWxDb21tYW5kIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRjb25zdCByZXNvbHZlZENvbW1hbmQgPSB0aGlzLl9yZXNvbHZlQ29tbWFuZCh0ZXJtaW5hbEluc3RhbmNlKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVRvb2xiYXJDb250ZXh0S2V5cyh0ZXJtaW5hbEluc3RhbmNlLCB0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxUb29sU2Vzc2lvbklkKTtcblx0XHRcdHJldHVybiByZXNvbHZlZENvbW1hbmQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGF0dGFjaENvbW1hbmREZXRlY3Rpb24gPSBhc3luYyAoY29tbWFuZERldGVjdGlvbjogSUNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5IHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRjb21tYW5kRGV0ZWN0aW9uTGlzdGVuZXIuY2xlYXIoKTtcblx0XHRcdGlmICghY29tbWFuZERldGVjdGlvbikge1xuXHRcdFx0XHQvLyBUcnkgQUhQIGNvbW1hbmQgc291cmNlIGFzIGZhbGxiYWNrXG5cdFx0XHRcdGNvbnN0IGFocFNvdXJjZSA9IHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWRcblx0XHRcdFx0XHQ/IHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UuZ2V0QWhwQ29tbWFuZFNvdXJjZSh0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxUb29sU2Vzc2lvbklkKVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoYWhwU291cmNlKSB7XG5cdFx0XHRcdFx0dGhpcy5fYXR0YWNoQWhwQ29tbWFuZFNvdXJjZSh0ZXJtaW5hbEluc3RhbmNlLCBhaHBTb3VyY2UsIGNvbW1hbmREZXRlY3Rpb25MaXN0ZW5lcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdHJ5UmVzb2x2ZUNvbW1hbmQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGxldCByZWNlaXZlZERhdGFDb3VudCA9IDA7XG5cblx0XHRcdGNvbnN0IGhhc1JlYWxPdXRwdXQgPSAoKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRcdC8vIENoZWNrIGZvciBzbmFwc2hvdCBvdXRwdXRcblx0XHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQ/LnRleHQ/LnRyaW0oKSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIENoZWNrIGZvciBsaXZlIG91dHB1dCAoY3Vyc29yIG1vdmVkIHBhc3QgZXhlY3V0ZWQgbWFya2VyKVxuXHRcdFx0XHRjb25zdCBjb21tYW5kID0gdGhpcy5fZ2V0UmVzb2x2ZWRDb21tYW5kKHRlcm1pbmFsSW5zdGFuY2UpO1xuXHRcdFx0XHRpZiAoIWNvbW1hbmQ/LmV4ZWN1dGVkTWFya2VyIHx8IHRlcm1pbmFsSW5zdGFuY2UuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBidWZmZXIgPSB0ZXJtaW5hbEluc3RhbmNlLnh0ZXJtPy5yYXcuYnVmZmVyLmFjdGl2ZTtcblx0XHRcdFx0aWYgKCFidWZmZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY3Vyc29yTGluZSA9IGJ1ZmZlci5iYXNlWSArIGJ1ZmZlci5jdXJzb3JZO1xuXHRcdFx0XHRpZiAoY3Vyc29yTGluZSA+IGNvbW1hbmQuZXhlY3V0ZWRNYXJrZXIubGluZSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIElmIHdlJ3ZlIHJlY2VpdmVkIG1hbnkgZGF0YSBldmVudHMsIHRyZWF0IGl0IGFzIHJlYWwgb3V0cHV0IGV2ZW4gaWYgY3Vyc29yXG5cdFx0XHRcdC8vIGhhc24ndCBtb3ZlZCBwYXN0IHRoZSBtYXJrZXIgKGUuZy4sIHByb2dyZXNzIGJhcnMgdXBkYXRpbmcgb24gc2FtZSBsaW5lKVxuXHRcdFx0XHQvLyBTaGVsbCBpbnRlZ3JhdGlvbiBzZXF1ZW5jZXMgZmlyZSBhIGNvdXBsZSB0aW1lcyBwZXIgY29tbWFuZCAoUHJvbXB0U3RhcnQsIENvbW1hbmRTdGFydCxcblx0XHRcdFx0Ly8gQ29tbWFuZEV4ZWN1dGVkKSwgc28gd2UgbmVlZCBhIHNtYWxsIHRocmVzaG9sZCB0byBmaWx0ZXIgdGhvc2Ugb3V0XG5cdFx0XHRcdHJldHVybiByZWNlaXZlZERhdGFDb3VudCA+IE1JTl9EQVRBX0VWRU5UU19GT1JfUkVBTF9PVVRQVVQ7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBVc2UgdGhlIGV4dHJhY3RlZCBhdXRvLWV4cGFuZCBsb2dpY1xuXHRcdFx0Y29uc3QgYXV0b0V4cGFuZCA9IHN0b3JlLmFkZChuZXcgVGVybWluYWxUb29sQXV0b0V4cGFuZCh7XG5cdFx0XHRcdG9uQ29tbWFuZEV4ZWN1dGVkOiBFdmVudC5tYXAoY29tbWFuZERldGVjdGlvbi5vbkNvbW1hbmRFeGVjdXRlZCwgKCkgPT4gdW5kZWZpbmVkKSxcblx0XHRcdFx0b25Db21tYW5kRmluaXNoZWQ6IEV2ZW50Lm1hcChjb21tYW5kRGV0ZWN0aW9uLm9uQ29tbWFuZEZpbmlzaGVkLCAoKSA9PiB1bmRlZmluZWQpLFxuXHRcdFx0XHRvbldpbGxEYXRhOiB0ZXJtaW5hbEluc3RhbmNlLm9uV2lsbERhdGEsXG5cdFx0XHRcdHNob3VsZEF1dG9FeHBhbmQ6ICgpID0+IHRoaXMuX3Nob3VsZEF1dG9FeHBhbmQoKSxcblx0XHRcdFx0aGFzUmVhbE91dHB1dCxcblx0XHRcdH0pKTtcblx0XHRcdHN0b3JlLmFkZChhdXRvRXhwYW5kLm9uRGlkUmVxdWVzdEV4cGFuZCgoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl91c2VzQ29sbGFwc2libGVXcmFwcGVyKSB7XG5cdFx0XHRcdFx0dGhpcy5leHBhbmRDb2xsYXBzaWJsZVdyYXBwZXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl90b2dnbGVPdXRwdXQodHJ1ZSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIFRyYWNrIGRhdGEgZXZlbnRzIHRvIGhlbHAgaGFzUmVhbE91dHB1dCBkZXRlY3QgcHJvZ3Jlc3Mtc3R5bGUgb3V0cHV0XG5cdFx0XHRzdG9yZS5hZGQodGVybWluYWxJbnN0YW5jZS5vbldpbGxEYXRhKCgpID0+IHtcblx0XHRcdFx0cmVjZWl2ZWREYXRhQ291bnQrKztcblx0XHRcdH0pKTtcblxuXHRcdFx0c3RvcmUuYWRkKGNvbW1hbmREZXRlY3Rpb24ub25Db21tYW5kRXhlY3V0ZWQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVUb29sYmFyQ29udGV4dEtleXModGVybWluYWxJbnN0YW5jZSwgdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHN0b3JlLmFkZChjb21tYW5kRGV0ZWN0aW9uLm9uQ29tbWFuZEZpbmlzaGVkKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVG9vbGJhckNvbnRleHRLZXlzKHRlcm1pbmFsSW5zdGFuY2UsIHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZENvbW1hbmQgPSB0aGlzLl9nZXRSZXNvbHZlZENvbW1hbmQodGVybWluYWxJbnN0YW5jZSk7XG5cblx0XHRcdFx0dGhpcy5faGFuZGxlQ29tbWFuZENvbXBsZXRpb24ocmVzb2x2ZWRDb21tYW5kKTtcblxuXHRcdFx0XHRpZiAocmVzb2x2ZWRDb21tYW5kPy5lbmRNYXJrZXIpIHtcblx0XHRcdFx0XHRjb21tYW5kRGV0ZWN0aW9uTGlzdGVuZXIuY2xlYXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0Y29tbWFuZERldGVjdGlvbkxpc3RlbmVyLnZhbHVlID0gc3RvcmU7XG5cblx0XHRcdGNvbnN0IHJlc29sdmVkSW1tZWRpYXRlbHkgPSBhd2FpdCB0cnlSZXNvbHZlQ29tbWFuZCgpO1xuXHRcdFx0aWYgKHJlc29sdmVkSW1tZWRpYXRlbHk/LmVuZE1hcmtlcikge1xuXHRcdFx0XHRjb21tYW5kRGV0ZWN0aW9uTGlzdGVuZXIuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5faGFuZGxlQ29tbWFuZENvbXBsZXRpb24ocmVzb2x2ZWRJbW1lZGlhdGVseSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0YXR0YWNoQ29tbWFuZERldGVjdGlvbih0ZXJtaW5hbEluc3RhbmNlLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0ZXJtaW5hbEluc3RhbmNlLmNhcGFiaWxpdGllcy5vbkRpZEFkZENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5KGNkID0+IGF0dGFjaENvbW1hbmREZXRlY3Rpb24oY2QpKSk7XG5cblx0XHRjb25zdCBpbnN0YW5jZUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIodGVybWluYWxJbnN0YW5jZS5vbkRpc3Bvc2VkKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbEluc3RhbmNlID09PSB0ZXJtaW5hbEluc3RhbmNlKSB7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jbGVhckNvbW1hbmRBc3NvY2lhdGlvbih7IGNsZWFyUGVyc2lzdGVudERhdGE6IHRydWUgfSk7XG5cdFx0XHRjb21tYW5kRGV0ZWN0aW9uTGlzdGVuZXIuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVRvb2xiYXJDb250ZXh0S2V5cyh1bmRlZmluZWQsIHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdFx0aW5zdGFuY2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgdXAgbGlzdGVuZXJzIHVzaW5nIGFuIHtAbGluayBJQWhwVGVybWluYWxDb21tYW5kU291cmNlfSB3aGVuIG5vIGxvY2FsXG5cdCAqIGBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHlgIGlzIGF2YWlsYWJsZS4gUHJvdmlkZXMgYXV0by1leHBhbmQsIHRvb2xiYXJcblx0ICogY29udGV4dCBrZXkgdXBkYXRlcywgYW5kIGNvbW1hbmQgY29tcGxldGlvbiBoYW5kbGluZy5cblx0ICovXG5cdHByaXZhdGUgX2F0dGFjaEFocENvbW1hbmRTb3VyY2UoXG5cdFx0dGVybWluYWxJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsXG5cdFx0YWhwU291cmNlOiBJQWhwVGVybWluYWxDb21tYW5kU291cmNlLFxuXHRcdGNvbW1hbmREZXRlY3Rpb25MaXN0ZW5lcjogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+LFxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGhhc1JlYWxPdXRwdXQgPSAoKTogYm9vbGVhbiA9PiB7XG5cdFx0XHQvLyBGb3IgQUhQIHRlcm1pbmFscywgc2hlbGwgaW50ZWdyYXRpb24gc2VxdWVuY2VzIGFyZSBzdHJpcHBlZCBzZXJ2ZXItc2lkZS5cblx0XHRcdC8vIFJlYWwgb3V0cHV0IGlzIHNpbXBseSB3aGV0aGVyIHRoZSBjb21tYW5kIGhhcyBub24tZW1wdHkgb3V0cHV0LlxuXHRcdFx0Y29uc3QgY29tbWFuZCA9IHRoaXMuX2dldFJlc29sdmVkQ29tbWFuZCh0ZXJtaW5hbEluc3RhbmNlKTtcblx0XHRcdGlmIChjb21tYW5kPy5oYXNPdXRwdXQoKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiAhIXRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQ/LnRleHQ/LnRyaW0oKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgYXV0b0V4cGFuZCA9IHN0b3JlLmFkZChuZXcgVGVybWluYWxUb29sQXV0b0V4cGFuZCh7XG5cdFx0XHRvbkNvbW1hbmRFeGVjdXRlZDogRXZlbnQubWFwKGFocFNvdXJjZS5vbkNvbW1hbmRFeGVjdXRlZCwgKCkgPT4gdW5kZWZpbmVkKSxcblx0XHRcdG9uQ29tbWFuZEZpbmlzaGVkOiBFdmVudC5tYXAoYWhwU291cmNlLm9uQ29tbWFuZEZpbmlzaGVkLCAoKSA9PiB1bmRlZmluZWQpLFxuXHRcdFx0b25XaWxsRGF0YTogdGVybWluYWxJbnN0YW5jZS5vbldpbGxEYXRhLFxuXHRcdFx0c2hvdWxkQXV0b0V4cGFuZDogKCkgPT4gdGhpcy5fc2hvdWxkQXV0b0V4cGFuZCgpLFxuXHRcdFx0aGFzUmVhbE91dHB1dCxcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKGF1dG9FeHBhbmQub25EaWRSZXF1ZXN0RXhwYW5kKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl91c2VzQ29sbGFwc2libGVXcmFwcGVyKSB7XG5cdFx0XHRcdHRoaXMuZXhwYW5kQ29sbGFwc2libGVXcmFwcGVyKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl90b2dnbGVPdXRwdXQodHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKGFocFNvdXJjZS5vbkNvbW1hbmRFeGVjdXRlZChjbWQgPT4ge1xuXHRcdFx0Ly8gU2V0IHRlcm1pbmFsQ29tbWFuZElkIG9uIHRvb2wgaW52b2NhdGlvbiBkYXRhIGZvciBmdXR1cmUgbG9va3Vwc1xuXHRcdFx0aWYgKCF0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kSWQgJiYgY21kLmlkKSB7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRJZCA9IGNtZC5pZDtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVG9vbGJhckNvbnRleHRLZXlzKHRlcm1pbmFsSW5zdGFuY2UsIHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX291dHB1dFZpZXcuaXNFeHBhbmRlZCkge1xuXHRcdFx0XHR2b2lkIHRoaXMuX3RvZ2dsZU91dHB1dCh0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRzdG9yZS5hZGQoYWhwU291cmNlLm9uQ29tbWFuZEZpbmlzaGVkKGNtZCA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsQ29tbWFuZElkID09PSBjbWQuaWQpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVG9vbGJhckNvbnRleHRLZXlzKHRlcm1pbmFsSW5zdGFuY2UsIHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZENvbW1hbmQgPSB0aGlzLl9nZXRSZXNvbHZlZENvbW1hbmQodGVybWluYWxJbnN0YW5jZSk7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZUNvbW1hbmRDb21wbGV0aW9uKHJlc29sdmVkQ29tbWFuZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29tbWFuZERldGVjdGlvbkxpc3RlbmVyLnZhbHVlID0gc3RvcmU7XG5cblx0XHQvLyBDaGVjayBpZiB0aGUgY29tbWFuZCB3YXMgYWxyZWFkeSByZXNvbHZlZCAoZS5nLiBkdXJpbmcgY29udGVudCByZXBsYXkpXG5cdFx0Y29uc3QgcmVzb2x2ZWRDb21tYW5kID0gdGhpcy5fcmVzb2x2ZUNvbW1hbmQodGVybWluYWxJbnN0YW5jZSk7XG5cdFx0aWYgKHJlc29sdmVkQ29tbWFuZD8uZW5kTWFya2VyKSB7XG5cdFx0XHR0aGlzLl9oYW5kbGVDb21tYW5kQ29tcGxldGlvbihyZXNvbHZlZENvbW1hbmQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIHRoZSBjb21wbGV0aW9uIG9mIGEgdGVybWluYWwgY29tbWFuZCBieSB1cGRhdGluZyB0aGUgVUkgc3RhdGUuXG5cdCAqIFRoaXMgaW5jbHVkZXMgbWFya2luZyB0aGUgY29sbGFwc2libGUgd3JhcHBlciBhcyBjb21wbGV0ZSwgYXV0by1jb2xsYXBzaW5nXG5cdCAqIHN1Y2Nlc3NmdWwgY29tbWFuZHMsIGFuZCBrZWVwaW5nIGZhaWxlZCBjb21tYW5kcyBleHBhbmRlZC5cblx0ICpcblx0ICogQHBhcmFtIHJlc29sdmVkQ29tbWFuZCBUaGUgY29tcGxldGVkIHRlcm1pbmFsIGNvbW1hbmQgd2l0aCBleGl0IGNvZGUgaW5mb3JtYXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVDb21tYW5kQ29tcGxldGlvbihyZXNvbHZlZENvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHQvLyBVcGRhdGUgdGl0bGUgdG8gc2hvdyBjb21wbGV0aW9uIHN0YXRlXG5cdFx0dGhpcy5tYXJrQ29sbGFwc2libGVXcmFwcGVyQ29tcGxldGUoKTtcblxuXHRcdC8vIEF1dG8tY29sbGFwc2Ugb24gc3VjY2VzcyAoZXhpdCBjb2RlIDApXG5cdFx0aWYgKHJlc29sdmVkQ29tbWFuZD8uZXhpdENvZGUgPT09IDAgJiYgdGhpcy5fb3V0cHV0Vmlldy5pc0V4cGFuZGVkICYmICF0aGlzLl91c2VyVG9nZ2xlZE91dHB1dCAmJiAhdGhpcy5fZm9yY2VFeHBhbmRUZXJtaW5hbE91dHB1dCkge1xuXHRcdFx0dGhpcy5fdG9nZ2xlT3V0cHV0KGZhbHNlKTtcblx0XHR9XG5cblx0XHQvLyBLZWVwIG91dGVyIHdyYXBwZXIgZXhwYW5kZWQgb24gZXJyb3IgZm9yIHZpc2liaWxpdHlcblx0XHRjb25zdCBhdXRvRXhwYW5kRmFpbHVyZXMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5BdXRvRXhwYW5kVG9vbEZhaWx1cmVzKTtcblx0XHRpZiAoYXV0b0V4cGFuZEZhaWx1cmVzICYmIHJlc29sdmVkQ29tbWFuZD8uZXhpdENvZGUgIT09IHVuZGVmaW5lZCAmJiByZXNvbHZlZENvbW1hbmQuZXhpdENvZGUgIT09IDAgJiYgdGhpcy5fdGhpbmtpbmdDb2xsYXBzaWJsZVdyYXBwZXIpIHtcblx0XHRcdHRoaXMuZXhwYW5kQ29sbGFwc2libGVXcmFwcGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdG9nZ2xlT3V0cHV0KGV4cGFuZGVkOiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZGlkQ2hhbmdlID0gYXdhaXQgdGhpcy5fb3V0cHV0Vmlldy50b2dnbGUoZXhwYW5kZWQpO1xuXHRcdGNvbnN0IGlzRXhwYW5kZWQgPSB0aGlzLl9vdXRwdXRWaWV3LmlzRXhwYW5kZWQ7XG5cdFx0Ly8gT25seSBkcm9wIHRoZSB0aXRsZSdzIGJvdHRvbSBib3JkZXIvcmFkaXVzIHdoZW4gdGhlIG91dHB1dCBzZWN0aW9uIGlzXG5cdFx0Ly8gYWN0dWFsbHkgcmVuZGVyZWQgYmVsb3cgdGhlIHRpdGxlIHRvIHZpc3VhbGx5IGNsb3NlIHRoZSBib3guIERpc3BsYXktb25seVxuXHRcdC8vIGludm9jYXRpb25zIChlLmcuIGEgZGVuaWVkIGNvbW1hbmQgd2l0aCBubyB0ZXJtaW5hbCBzZXNzaW9uIG9yIG91dHB1dCkgbmV2ZXJcblx0XHQvLyBhcHBlbmQgdGhlIG91dHB1dCBzZWN0aW9uIChzZWUgY29uc3RydWN0b3IpLCBzbyByZW1vdmluZyB0aGUgdGl0bGUncyBib3R0b21cblx0XHQvLyBib3JkZXIgaGVyZSB3b3VsZCBsZWF2ZSBhbiBvcGVuLWJvdHRvbWVkIGJveC5cblx0XHRjb25zdCBoYXNPdXRwdXRTZWN0aW9uID0gISF0aGlzLl9vdXRwdXRWaWV3LmRvbU5vZGUucGFyZW50RWxlbWVudDtcblx0XHR0aGlzLl90aXRsZUVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC10ZXJtaW5hbC1jb250ZW50LXRpdGxlLW5vLWJvdHRvbS1yYWRpdXMnLCBpc0V4cGFuZGVkICYmIGhhc091dHB1dFNlY3Rpb24pO1xuXHRcdHRoaXMuX3Rvb2xiYXJPdXRwdXRFeHBhbmRlZCA9IGlzRXhwYW5kZWQ7XG5cdFx0dGhpcy5fdXBkYXRlVG9vbGJhckFjdGlvbnMoKTtcblx0XHRpZiAoZGlkQ2hhbmdlKSB7XG5cdFx0XHRleHBhbmRlZFN0YXRlQnlJbnZvY2F0aW9uLnNldCh0aGlzLnRvb2xJbnZvY2F0aW9uLCBpc0V4cGFuZGVkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGRpZENoYW5nZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Vuc3VyZVRlcm1pbmFsSW5zdGFuY2UoKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLl90ZXJtaW5hbERhdGEuaXNQdHkgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fdGVybWluYWxJbnN0YW5jZT8uaXNEaXNwb3NlZCkge1xuXHRcdFx0dGhpcy5fdGVybWluYWxJbnN0YW5jZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl90ZXJtaW5hbEluc3RhbmNlICYmIHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2UgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLmdldFRlcm1pbmFsSW5zdGFuY2VCeVRvb2xTZXNzaW9uSWQodGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZCk7XG5cdFx0XHRpZiAodGhpcy5fdGVybWluYWxJbnN0YW5jZT8uaXNEaXNwb3NlZCkge1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbEluc3RhbmNlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxJbnN0YW5jZTtcblx0fVxuXG5cdHByaXZhdGUgX2F0dGFjaE91dHB1dFNvdXJjZSgpOiB2b2lkIHtcblx0XHRjb25zdCBzb3VyY2UgPSB0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLmdldE91dHB1dFNvdXJjZSh0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxUb29sU2Vzc2lvbklkKTtcblx0XHRpZiAoIXNvdXJjZSB8fCBzb3VyY2UgPT09IHRoaXMuX291dHB1dFNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9vdXRwdXRTb3VyY2UgPSBzb3VyY2U7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgb25Db21tYW5kRXhlY3V0ZWQgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0Y29uc3Qgb25Db21tYW5kRmluaXNoZWQgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0Y29uc3QgYXV0b0V4cGFuZCA9IHN0b3JlLmFkZChuZXcgVGVybWluYWxUb29sQXV0b0V4cGFuZCh7XG5cdFx0XHRvbkNvbW1hbmRFeGVjdXRlZDogb25Db21tYW5kRXhlY3V0ZWQuZXZlbnQsXG5cdFx0XHRvbkNvbW1hbmRGaW5pc2hlZDogb25Db21tYW5kRmluaXNoZWQuZXZlbnQsXG5cdFx0XHRvbldpbGxEYXRhOiBzb3VyY2Uub25EaWRDaGFuZ2UsXG5cdFx0XHRzaG91bGRBdXRvRXhwYW5kOiAoKSA9PiB0aGlzLl9zaG91bGRBdXRvRXhwYW5kKCksXG5cdFx0XHRoYXNSZWFsT3V0cHV0OiAoKSA9PiAhIXNvdXJjZS5vdXRwdXQsXG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZChhdXRvRXhwYW5kLm9uRGlkUmVxdWVzdEV4cGFuZCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdXNlc0NvbGxhcHNpYmxlV3JhcHBlcikge1xuXHRcdFx0XHR0aGlzLmV4cGFuZENvbGxhcHNpYmxlV3JhcHBlcigpO1xuXHRcdFx0fVxuXHRcdFx0dm9pZCB0aGlzLl90b2dnbGVPdXRwdXQodHJ1ZSk7XG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZChzb3VyY2Uub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbi51cGRhdGUoKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVRvb2xiYXJDb250ZXh0S2V5cyh1bmRlZmluZWQsIHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdFx0dm9pZCB0aGlzLl9vdXRwdXRWaWV3LnJlZnJlc2goKTtcblx0XHRcdGlmIChzb3VyY2UuZXhpdENvZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRvbkNvbW1hbmRGaW5pc2hlZC5maXJlKCk7XG5cdFx0XHRcdHRoaXMubWFya0NvbGxhcHNpYmxlV3JhcHBlckNvbXBsZXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX291dHB1dFNvdXJjZUxpc3RlbmVyLnZhbHVlID0gc3RvcmU7XG5cdFx0b25Db21tYW5kRXhlY3V0ZWQuZmlyZSgpO1xuXHRcdGlmIChzb3VyY2UuZXhpdENvZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0b25Db21tYW5kRmluaXNoZWQuZmlyZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9kZWNvcmF0aW9uLnVwZGF0ZSgpO1xuXHRcdHRoaXMuX3VwZGF0ZVRvb2xiYXJDb250ZXh0S2V5cyh1bmRlZmluZWQsIHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdHZvaWQgdGhpcy5fb3V0cHV0Vmlldy5yZWZyZXNoKCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVPdXRwdXRGb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl90ZXJtaW5hbE91dHB1dENvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2Uuc2V0Rm9jdXNlZFByb2dyZXNzUGFydCh0aGlzKTtcblx0XHR0aGlzLl9vdXRwdXRWaWV3LnVwZGF0ZUFyaWFMYWJlbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlT3V0cHV0Qmx1cihldmVudDogRm9jdXNFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IG5leHRUYXJnZXQgPSBldmVudC5yZWxhdGVkVGFyZ2V0IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRpZiAodGhpcy5fb3V0cHV0Vmlldy5jb250YWluc0VsZW1lbnQobmV4dFRhcmdldCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdGVybWluYWxPdXRwdXRDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0dGhpcy5fdGVybWluYWxDaGF0U2VydmljZS5jbGVhckZvY3VzZWRQcm9ncmVzc1BhcnQodGhpcyk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVEaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rlcm1pbmFsT3V0cHV0Q29udGV4dEtleS5yZXNldCgpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UuY2xlYXJGb2N1c2VkUHJvZ3Jlc3NQYXJ0KHRoaXMpO1xuXHR9XG5cblx0cHVibGljIGdldENvbW1hbmRBbmRPdXRwdXRBc1RleHQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb3V0cHV0Vmlldy5nZXRDb21tYW5kQW5kT3V0cHV0QXNUZXh0KCk7XG5cdH1cblxuXHRwdWJsaWMgZm9jdXNPdXRwdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fb3V0cHV0Vmlldy5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9jdXNDaGF0SW5wdXQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UodGhpcy5fc2Vzc2lvblJlc291cmNlKTtcblx0XHR3aWRnZXQ/LmZvY3VzSW5wdXQoKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBmb2N1c1Rlcm1pbmFsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl90ZXJtaW5hbERhdGEuaXNQdHkgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgdGhpcy5fZW5zdXJlVGVybWluYWxJbnN0YW5jZSgpO1xuXG5cdFx0dHlwZSBGb2N1c0NoYXRJbnN0YW5jZVRlbGVtZXRyeUV2ZW50ID0ge1xuXHRcdFx0dGFyZ2V0OiAnaW5zdGFuY2UnIHwgJ2NvbW1hbmRVcmknIHwgJ25vbmUnO1xuXHRcdFx0bG9jYXRpb246ICdwYW5lbCcgfCAnZWRpdG9yJztcblx0XHR9O1xuXG5cdFx0dHlwZSBGb2N1c0NoYXRJbnN0YW5jZVRlbGVtZXRyeUNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdtZWdhbnJvZ2dlJztcblx0XHRcdGNvbW1lbnQ6ICdUcmFjayB1c2FnZSBvZiB0aGUgZm9jdXMgY2hhdCB0ZXJtaW5hbCBhY3Rpb24uJztcblx0XHRcdHRhcmdldDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgZm9jdXNpbmcgdGFyZ2V0ZWQgYW4gZXhpc3RpbmcgaW5zdGFuY2Ugb3Igb3BlbmVkIGEgY29tbWFuZCBVUkkuJyB9O1xuXHRcdFx0bG9jYXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdMb2NhdGlvbiBvZiB0aGUgdGVybWluYWwgaW5zdGFuY2Ugd2hlbiBmb2N1c2luZy4nIH07XG5cdFx0fTtcblxuXHRcdGxldCB0YXJnZXQ6IEZvY3VzQ2hhdEluc3RhbmNlVGVsZW1ldHJ5RXZlbnRbJ3RhcmdldCddID0gJ25vbmUnO1xuXHRcdGxldCBsb2NhdGlvbjogRm9jdXNDaGF0SW5zdGFuY2VUZWxlbWV0cnlFdmVudFsnbG9jYXRpb24nXSA9ICdwYW5lbCc7XG5cdFx0aWYgKGluc3RhbmNlKSB7XG5cdFx0XHR0YXJnZXQgPSAnaW5zdGFuY2UnO1xuXHRcdFx0bG9jYXRpb24gPSBpbnN0YW5jZS50YXJnZXQgPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yID8gJ2VkaXRvcicgOiAncGFuZWwnO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fdGVybWluYWxDb21tYW5kVXJpKSB7XG5cdFx0XHR0YXJnZXQgPSAnY29tbWFuZFVyaSc7XG5cdFx0fVxuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxGb2N1c0NoYXRJbnN0YW5jZVRlbGVtZXRyeUV2ZW50LCBGb2N1c0NoYXRJbnN0YW5jZVRlbGVtZXRyeUNsYXNzaWZpY2F0aW9uPigndGVybWluYWwvY2hhdEZvY3VzSW5zdGFuY2UnLCB7IHRhcmdldCwgbG9jYXRpb24gfSk7XG5cblx0XHRpZiAoaW5zdGFuY2UpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0XHRpZiAoaW5zdGFuY2UudGFyZ2V0ID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcikge1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbEVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihpbnN0YW5jZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zaG93UGFuZWwodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0YXdhaXQgaW5zdGFuY2UuZm9jdXNXaGVuUmVhZHkodHJ1ZSk7XG5cdFx0XHRjb25zdCBjb21tYW5kID0gdGhpcy5fZ2V0UmVzb2x2ZWRDb21tYW5kKGluc3RhbmNlKTtcblx0XHRcdGlmIChjb21tYW5kKSB7XG5cdFx0XHRcdGluc3RhbmNlLnh0ZXJtPy5tYXJrVHJhY2tlci5yZXZlYWxDb21tYW5kKGNvbW1hbmQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl90ZXJtaW5hbENvbW1hbmRVcmkpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vcGVuUmVzb3VyY2UodGhpcy5fdGVybWluYWxDb21tYW5kVXJpKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY29udGludWVJbkJhY2tncm91bmQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZDtcblx0XHRpZiAoc2Vzc2lvbklkKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLmNvbnRpbnVlSW5CYWNrZ3JvdW5kKHNlc3Npb25JZCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIHRvZ2dsZU91dHB1dEZyb21BY3Rpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fdXNlclRvZ2dsZWRPdXRwdXQgPSB0cnVlO1xuXG5cdFx0dHlwZSBUb2dnbGVDaGF0VGVybWluYWxPdXRwdXRUZWxlbWV0cnlFdmVudCA9IHtcblx0XHRcdHByZXZpb3VzRXhwYW5kZWQ6IGJvb2xlYW47XG5cdFx0fTtcblx0XHR0eXBlIFRvZ2dsZUNoYXRUZXJtaW5hbE91dHB1dFRlbGVtZXRyeUNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdtZWdhbnJvZ2dlJztcblx0XHRcdGNvbW1lbnQ6ICdUcmFjayB1c2FnZSBvZiB0aGUgdG9nZ2xlIGNoYXQgdGVybWluYWwgb3V0cHV0IGFjdGlvbi4nO1xuXHRcdFx0cHJldmlvdXNFeHBhbmRlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIHRlcm1pbmFsIG91dHB1dCB3YXMgZXhwYW5kZWQgYmVmb3JlIHRoZSB0b2dnbGUuJyB9O1xuXHRcdH07XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFRvZ2dsZUNoYXRUZXJtaW5hbE91dHB1dFRlbGVtZXRyeUV2ZW50LCBUb2dnbGVDaGF0VGVybWluYWxPdXRwdXRUZWxlbWV0cnlDbGFzc2lmaWNhdGlvbj4oJ3Rlcm1pbmFsL2NoYXRUb2dnbGVPdXRwdXQnLCB7XG5cdFx0XHRwcmV2aW91c0V4cGFuZGVkOiB0aGlzLl9vdXRwdXRWaWV3LmlzRXhwYW5kZWRcblx0XHR9KTtcblxuXHRcdGlmICghdGhpcy5fb3V0cHV0Vmlldy5pc0V4cGFuZGVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl90b2dnbGVPdXRwdXQodHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3RvZ2dsZU91dHB1dChmYWxzZSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdG9nZ2xlT3V0cHV0RnJvbUtleWJvYXJkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3VzZXJUb2dnbGVkT3V0cHV0ID0gdHJ1ZTtcblx0XHRpZiAoIXRoaXMuX291dHB1dFZpZXcuaXNFeHBhbmRlZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fdG9nZ2xlT3V0cHV0KHRydWUpO1xuXHRcdFx0dGhpcy5mb2N1c091dHB1dCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9jb2xsYXBzZU91dHB1dEFuZEZvY3VzSW5wdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvbGxhcHNlT3V0cHV0QW5kRm9jdXNJbnB1dCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fb3V0cHV0Vmlldy5pc0V4cGFuZGVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl90b2dnbGVPdXRwdXQoZmFsc2UpO1xuXHRcdH1cblx0XHR0aGlzLl9mb2N1c0NoYXRJbnB1dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUNvbW1hbmQoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogSVRlcm1pbmFsQ29tbWFuZCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGluc3RhbmNlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0SWQgPSB0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kSWQ7XG5cblx0XHQvLyBUcnkgbG9jYWwgc2hlbGwgaW50ZWdyYXRpb24gY29tbWFuZCBkZXRlY3Rpb24gZmlyc3Rcblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uID0gaW5zdGFuY2UuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0aWYgKGNvbW1hbmREZXRlY3Rpb24gJiYgdGFyZ2V0SWQpIHtcblx0XHRcdGNvbnN0IGNvbW1hbmRzID0gY29tbWFuZERldGVjdGlvbi5jb21tYW5kcztcblx0XHRcdGlmIChjb21tYW5kcyAmJiBjb21tYW5kcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGZyb21IaXN0b3J5ID0gY29tbWFuZHMuZmluZChjID0+IGMuaWQgPT09IHRhcmdldElkKTtcblx0XHRcdFx0aWYgKGZyb21IaXN0b3J5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZyb21IaXN0b3J5O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGV4ZWN1dGluZyA9IGNvbW1hbmREZXRlY3Rpb24uZXhlY3V0aW5nQ29tbWFuZE9iamVjdDtcblx0XHRcdGlmIChleGVjdXRpbmcgJiYgZXhlY3V0aW5nLmlkID09PSB0YXJnZXRJZCkge1xuXHRcdFx0XHRyZXR1cm4gZXhlY3V0aW5nO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZhbGwgYmFjayB0byBBSFAgY29tbWFuZCBzb3VyY2Vcblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxUb29sU2Vzc2lvbklkO1xuXHRcdGlmIChzZXNzaW9uSWQpIHtcblx0XHRcdGNvbnN0IGFocFNvdXJjZSA9IHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UuZ2V0QWhwQ29tbWFuZFNvdXJjZShzZXNzaW9uSWQpO1xuXHRcdFx0aWYgKGFocFNvdXJjZSkge1xuXHRcdFx0XHRpZiAodGFyZ2V0SWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gYWhwU291cmNlLmdldENvbW1hbmRCeUlkKHRhcmdldElkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBObyBzcGVjaWZpYyBjb21tYW5kIElEIFx1MjAxNCByZXR1cm4gZXhlY3V0aW5nIG9yIG1vc3QgcmVjZW50XG5cdFx0XHRcdHJldHVybiBhaHBTb3VyY2UuZXhlY3V0aW5nQ29tbWFuZE9iamVjdCA/PyBhaHBTb3VyY2UuY29tbWFuZHNbYWhwU291cmNlLmNvbW1hbmRzLmxlbmd0aCAtIDFdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLyoqXG4gKiBBIGNvbXBvbmVudCB0aGF0IGRpc3BsYXlzIHRlcm1pbmFsIGNvbW1hbmQgb3V0cHV0IGluIGFuIGV4cGFuZGFibGUvY29sbGFwc2libGUgc2VjdGlvbi5cbiAqXG4gKiBUaGlzIGNvbXBvbmVudCBzdXBwb3J0cyB0d28gbW9kZXMgb2YgZGlzcGxheWluZyBvdXRwdXQ6XG4gKiAtICoqTGl2ZSBvdXRwdXQqKjogTWlycm9ycyB0aGUgb3V0cHV0IGZyb20gYSBydW5uaW5nIHRlcm1pbmFsIGluc3RhbmNlIGluIHJlYWwtdGltZSxcbiAqICAgc3VwcG9ydGluZyBzdHJlYW1pbmcgdXBkYXRlcywgc2Nyb2xsLWxvY2sgYmVoYXZpb3IsIGFuZCB1c2VyIGlucHV0IGZvcndhcmRpbmcuXG4gKiAtICoqU25hcHNob3Qgb3V0cHV0Kio6IERpc3BsYXlzIGEgc3RhdGljIHNuYXBzaG90IG9mIHByZXZpb3VzbHkgY2FwdHVyZWQgdGVybWluYWwgb3V0cHV0LFxuICogICB1c2VmdWwgZm9yIHNlcmlhbGl6ZWQvcmVzdG9yZWQgY2hhdCBzZXNzaW9ucy5cbiAqXG4gKiBGZWF0dXJlczpcbiAqIC0gQXV0b21hdGljIGhlaWdodCBjYWxjdWxhdGlvbiBiYXNlZCBvbiBsaW5lIGNvdW50IChtaW4vbWF4IHJvdyBsaW1pdHMpXG4gKiAtIFNjcm9sbC1sb2NrIGJlaGF2aW9yOiBzdGF5cyBhdCBib3R0b20gZHVyaW5nIHN0cmVhbWluZywgcmVzcGVjdHMgdXNlciBzY3JvbGwgcG9zaXRpb25cbiAqIC0gQWNjZXNzaWJpbGl0eTogcHJvcGVyIEFSSUEgbGFiZWxzIGFuZCBhY2Nlc3NpYmxlIHZpZXcgc3VwcG9ydFxuICogLSBUaGVtZS1hd2FyZSBiYWNrZ3JvdW5kIGNvbG9yIHRoYXQgYWRhcHRzIHRvIHBhbmVsIHZzIGVkaXRvciBjb250ZXh0XG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0VGVybWluYWxUb29sT3V0cHV0U2VjdGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHVibGljIGdldCBpc0V4cGFuZGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdleHBhbmRlZCcpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3V0cHV0Qm9keTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3Njcm9sbGFibGVDb250YWluZXI6IERvbVNjcm9sbGFibGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc0F0Qm90dG9tOiBib29sZWFuID0gdHJ1ZTtcblx0cHJpdmF0ZSBfaXNQcm9ncmFtbWF0aWNTY3JvbGw6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfbWlycm9yOiBEZXRhY2hlZFRlcm1pbmFsQ29tbWFuZE1pcnJvciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc25hcHNob3RNaXJyb3I6IERldGFjaGVkVGVybWluYWxTbmFwc2hvdE1pcnJvciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfZW1wdHlFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfbGFzdFJlbmRlcmVkTGluZUNvdW50OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGb2N1c0VtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIGdldCBvbkRpZEZvY3VzKCkgeyByZXR1cm4gdGhpcy5fb25EaWRGb2N1c0VtaXR0ZXIuZXZlbnQ7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRCbHVyRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEZvY3VzRXZlbnQ+KCkpO1xuXHRwdWJsaWMgZ2V0IG9uRGlkQmx1cigpIHsgcmV0dXJuIHRoaXMuX29uRGlkQmx1ckVtaXR0ZXIuZXZlbnQ7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lbnN1cmVUZXJtaW5hbEluc3RhbmNlOiAoKSA9PiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlQ29tbWFuZDogKCkgPT4gSVRlcm1pbmFsQ29tbWFuZCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRPdXRwdXRTb3VyY2U6ICgpID0+IElDaGF0VGVybWluYWxPdXRwdXRTb3VyY2UgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0VGVybWluYWxDb21tYW5kT3V0cHV0OiAoKSA9PiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhWyd0ZXJtaW5hbENvbW1hbmRPdXRwdXQnXSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRDb21tYW5kVGV4dDogKCkgPT4gc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldFN0b3JlZFRoZW1lOiAoKSA9PiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhWyd0ZXJtaW5hbFRoZW1lJ10gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaXNJbnZvY2F0aW9uUnVubmluZzogKCkgPT4gYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oYXNUZXJtaW5hbFNlc3Npb246IGJvb2xlYW4sXG5cdFx0QElBY2Nlc3NpYmxlVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJsZVZpZXdTZXJ2aWNlOiBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZTogSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyRWxlbWVudHMgPSBoKCcuY2hhdC10ZXJtaW5hbC1vdXRwdXQtY29udGFpbmVyQGNvbnRhaW5lcicsIFtcblx0XHRcdGgoJy5jaGF0LXRlcm1pbmFsLW91dHB1dC1ib2R5QGJvZHknLCBbXG5cdFx0XHRcdGgoJy5jaGF0LXRlcm1pbmFsLW91dHB1dC1jb250ZW50QGNvbnRlbnQnLCBbXG5cdFx0XHRcdFx0aCgnLmNoYXQtdGVybWluYWwtb3V0cHV0LXRlcm1pbmFsQHRlcm1pbmFsJyksXG5cdFx0XHRcdFx0aCgnLmNoYXQtdGVybWluYWwtb3V0cHV0LWVtcHR5QGVtcHR5Jylcblx0XHRcdFx0XSlcblx0XHRcdF0pXG5cdFx0XSk7XG5cdFx0dGhpcy5kb21Ob2RlID0gY29udGFpbmVyRWxlbWVudHMuY29udGFpbmVyO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdjb2xsYXBzZWQnKTtcblx0XHR0aGlzLl9vdXRwdXRCb2R5ID0gY29udGFpbmVyRWxlbWVudHMuYm9keTtcblx0XHR0aGlzLl9jb250ZW50Q29udGFpbmVyID0gY29udGFpbmVyRWxlbWVudHMuY29udGVudDtcblx0XHR0aGlzLl90ZXJtaW5hbENvbnRhaW5lciA9IGNvbnRhaW5lckVsZW1lbnRzLnRlcm1pbmFsO1xuXG5cdFx0dGhpcy5fZW1wdHlFbGVtZW50ID0gY29udGFpbmVyRWxlbWVudHMuZW1wdHk7XG5cdFx0dGhpcy5fY29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9lbXB0eUVsZW1lbnQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuRk9DVVNfSU4sICgpID0+IHRoaXMuX29uRGlkRm9jdXNFbWl0dGVyLmZpcmUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCBkb20uRXZlbnRUeXBlLkZPQ1VTX09VVCwgZXZlbnQgPT4gdGhpcy5fb25EaWRCbHVyRW1pdHRlci5maXJlKGV2ZW50KSkpO1xuXG5cdFx0Y29uc3QgcmVzaXplT2JzZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgZG9tLkRpc3Bvc2FibGVSZXNpemVPYnNlcnZlcignQ2hhdFRlcm1pbmFsVG9vbFByb2dyZXNzUGFydC5oYW5kbGVSZXNpemUnLCAoKSA9PiB0aGlzLl9oYW5kbGVSZXNpemUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlc2l6ZU9ic2VydmVyLm9ic2VydmUodGhpcy5kb21Ob2RlKSk7XG5cblx0XHR0aGlzLl9hcHBseUJhY2tncm91bmRDb2xvcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy5fYXBwbHlCYWNrZ3JvdW5kQ29sb3IoKSkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHRvZ2dsZShleHBhbmRlZDogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGN1cnJlbnRseUV4cGFuZGVkID0gdGhpcy5pc0V4cGFuZGVkO1xuXHRcdGlmIChleHBhbmRlZCA9PT0gY3VycmVudGx5RXhwYW5kZWQpIHtcblx0XHRcdGlmIChleHBhbmRlZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl91cGRhdGVUZXJtaW5hbENvbnRlbnQoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIWV4cGFuZGVkKSB7XG5cdFx0XHR0aGlzLl9zZXRFeHBhbmRlZChmYWxzZSk7XG5cdFx0XHR0aGlzLl9pc0F0Qm90dG9tID0gdHJ1ZTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lcikge1xuXHRcdFx0YXdhaXQgdGhpcy5fY3JlYXRlU2Nyb2xsYWJsZUNvbnRhaW5lcigpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl91cGRhdGVUZXJtaW5hbENvbnRlbnQoKTtcblxuXHRcdC8vIE9ubHkgbm93IHNob3cgdGhlIGV4cGFuZGVkIHN0YXRlIChhZnRlciBjb250ZW50IGlzIHJlYWR5KVxuXHRcdHRoaXMuX3NldEV4cGFuZGVkKHRydWUpO1xuXHRcdGF3YWl0IHRoaXMuX2xheW91dE1pcnJvcldpZHRoKCk7XG5cdFx0dGhpcy5fbGF5b3V0T3V0cHV0KCk7XG5cdFx0dGhpcy5fc2Nyb2xsT3V0cHV0VG9Cb3R0b20oKTtcblx0XHR0aGlzLl9zY2hlZHVsZU91dHB1dFJlbGF5b3V0KCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVmcmVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5pc0V4cGFuZGVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl91cGRhdGVUZXJtaW5hbENvbnRlbnQoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lcj8uZ2V0RG9tTm9kZSgpLmZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgY29udGFpbnNFbGVtZW50KGVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIWVsZW1lbnQgJiYgdGhpcy5kb21Ob2RlLmNvbnRhaW5zKGVsZW1lbnQpO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZUFyaWFMYWJlbCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Njcm9sbGFibGVDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29tbWFuZCA9IHRoaXMuX3Jlc29sdmVDb21tYW5kKCk7XG5cdFx0Y29uc3QgY29tbWFuZFRleHQgPSBjb21tYW5kPy5jb21tYW5kID8/IHRoaXMuX2dldENvbW1hbmRUZXh0KCk7XG5cdFx0aWYgKCFjb21tYW5kVGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdFRlcm1pbmFsT3V0cHV0QXJpYUxhYmVsJywgJ1Rlcm1pbmFsIG91dHB1dCBmb3IgezB9JywgY29tbWFuZFRleHQpO1xuXHRcdGNvbnN0IHNjcm9sbGFibGVEb21Ob2RlID0gdGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lci5nZXREb21Ob2RlKCk7XG5cdFx0c2Nyb2xsYWJsZURvbU5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3JlZ2lvbicpO1xuXHRcdGNvbnN0IGFjY2Vzc2libGVWaWV3SGludCA9IHRoaXMuX2FjY2Vzc2libGVWaWV3U2VydmljZS5nZXRPcGVuQXJpYUhpbnQoQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5UZXJtaW5hbENoYXRPdXRwdXQpO1xuXHRcdGNvbnN0IGxhYmVsID0gYWNjZXNzaWJsZVZpZXdIaW50XG5cdFx0XHQ/IGFyaWFMYWJlbCArICcsICcgKyBhY2Nlc3NpYmxlVmlld0hpbnRcblx0XHRcdDogYXJpYUxhYmVsO1xuXHRcdHNjcm9sbGFibGVEb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxhYmVsKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb21tYW5kQW5kT3V0cHV0QXNUZXh0KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29tbWFuZCA9IHRoaXMuX3Jlc29sdmVDb21tYW5kKCk7XG5cdFx0Y29uc3QgY29tbWFuZFRleHQgPSBjb21tYW5kPy5jb21tYW5kID8/IHRoaXMuX2dldENvbW1hbmRUZXh0KCk7XG5cdFx0aWYgKCFjb21tYW5kVGV4dCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY29tbWFuZEhlYWRlciA9IGxvY2FsaXplKCdjaGF0VGVybWluYWxPdXRwdXRBY2Nlc3NpYmxlVmlld0hlYWRlcicsICdDb21tYW5kOiB7MH0nLCBjb21tYW5kVGV4dCk7XG5cdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdGNvbnN0IHJhd091dHB1dCA9IGNvbW1hbmQuZ2V0T3V0cHV0KCk7XG5cdFx0XHRpZiAoIXJhd091dHB1dCB8fCByYXdPdXRwdXQudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gYCR7Y29tbWFuZEhlYWRlcn1cXG4ke2xvY2FsaXplKCdjaGF0LnRlcm1pbmFsT3V0cHV0RW1wdHknLCAnTm8gb3V0cHV0IHdhcyBwcm9kdWNlZCBieSB0aGUgY29tbWFuZC4nKX1gO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGluZXMgPSByYXdPdXRwdXQuc3BsaXQoJ1xcbicpO1xuXHRcdFx0cmV0dXJuIGAke2NvbW1hbmRIZWFkZXJ9XFxuJHtsaW5lcy5qb2luKCdcXG4nKS50cmltRW5kKCl9YDtcblx0XHR9XG5cblx0XHRjb25zdCBzb3VyY2UgPSB0aGlzLl9nZXRPdXRwdXRTb3VyY2UoKTtcblx0XHRjb25zdCBzbmFwc2hvdCA9IHNvdXJjZSA/IHsgdGV4dDogc291cmNlLm91dHB1dCB9IDogdGhpcy5fZ2V0VGVybWluYWxDb21tYW5kT3V0cHV0KCk7XG5cdFx0aWYgKCFzbmFwc2hvdCkge1xuXHRcdFx0cmV0dXJuIGAke2NvbW1hbmRIZWFkZXJ9XFxuJHtsb2NhbGl6ZSgnY2hhdFRlcm1pbmFsT3V0cHV0VW5hdmFpbGFibGUnLCAnQ29tbWFuZCBvdXRwdXQgaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZS4nKX1gO1xuXHRcdH1cblx0XHRjb25zdCBwbGFpbiA9IHJlbW92ZUFuc2lFc2NhcGVDb2Rlcygoc25hcHNob3QudGV4dCA/PyAnJykpO1xuXHRcdGlmICghcGxhaW4udHJpbSgpLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGAke2NvbW1hbmRIZWFkZXJ9XFxuJHtsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbE91dHB1dEVtcHR5JywgJ05vIG91dHB1dCB3YXMgcHJvZHVjZWQgYnkgdGhlIGNvbW1hbmQuJyl9YDtcblx0XHR9XG5cdFx0bGV0IG91dHB1dFRleHQgPSBwbGFpbi50cmltRW5kKCk7XG5cdFx0aWYgKHNuYXBzaG90LnRydW5jYXRlZCkge1xuXHRcdFx0b3V0cHV0VGV4dCArPSBgXFxuJHtsb2NhbGl6ZSgnY2hhdFRlcm1pbmFsT3V0cHV0VHJ1bmNhdGVkJywgJ091dHB1dCB0cnVuY2F0ZWQuJyl9YDtcblx0XHR9XG5cdFx0cmV0dXJuIGAke2NvbW1hbmRIZWFkZXJ9XFxuJHtvdXRwdXRUZXh0fWA7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRFeHBhbmRlZChleHBhbmRlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdleHBhbmRlZCcsIGV4cGFuZGVkKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnY29sbGFwc2VkJywgIWV4cGFuZGVkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVNjcm9sbGFibGVDb250YWluZXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudCh0aGlzLl9vdXRwdXRCb2R5LCB7XG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbixcblx0XHRcdGhhbmRsZU1vdXNlV2hlZWw6IHRydWVcblx0XHR9KSk7XG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZURvbU5vZGUgPSB0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyLmdldERvbU5vZGUoKTtcblx0XHRzY3JvbGxhYmxlRG9tTm9kZS50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKHNjcm9sbGFibGVEb21Ob2RlKTtcblx0XHR0aGlzLnVwZGF0ZUFyaWFMYWJlbCgpO1xuXG5cdFx0Ly8gU2hvdyBob3Jpem9udGFsIHNjcm9sbGJhciBvbiBob3Zlci9mb2N1cywgaGlkZSBvdGhlcndpc2UgdG8gcHJldmVudCBmbGlja2VyaW5nIGR1cmluZyBzdHJlYW1pbmdcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5NT1VTRV9FTlRFUiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lcj8udXBkYXRlT3B0aW9ucyh7IGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0byB9KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuTU9VU0VfTEVBVkUsICgpID0+IHtcblx0XHRcdHRoaXMuX3Njcm9sbGFibGVDb250YWluZXI/LnVwZGF0ZU9wdGlvbnMoeyBob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbiB9KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuRk9DVVNfSU4sICgpID0+IHtcblx0XHRcdHRoaXMuX3Njcm9sbGFibGVDb250YWluZXI/LnVwZGF0ZU9wdGlvbnMoeyBob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8gfSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCBkb20uRXZlbnRUeXBlLkZPQ1VTX09VVCwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lcj8udXBkYXRlT3B0aW9ucyh7IGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuIH0pO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIHNjcm9sbCBzdGF0ZSB0byBlbmFibGUgc2Nyb2xsIGxvY2sgYmVoYXZpb3IgKG9ubHkgZm9yIHVzZXIgc2Nyb2xscylcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyLm9uU2Nyb2xsKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc1Byb2dyYW1tYXRpY1Njcm9sbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9pc0F0Qm90dG9tID0gdGhpcy5fY29tcHV0ZUlzQXRCb3R0b20oKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVUZXJtaW5hbENvbnRlbnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb3V0cHV0U291cmNlID0gdGhpcy5fZ2V0T3V0cHV0U291cmNlKCk7XG5cdFx0aWYgKG91dHB1dFNvdXJjZSkge1xuXHRcdFx0dGhpcy5fZGlzcG9zZUxpdmVNaXJyb3IoKTtcblx0XHRcdGlmIChvdXRwdXRTb3VyY2Uub3V0cHV0KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3JlbmRlclNuYXBzaG90T3V0cHV0KHsgdGV4dDogb3V0cHV0U291cmNlLm91dHB1dCB9KTtcblx0XHRcdH0gZWxzZSBpZiAob3V0cHV0U291cmNlLmV4aXRDb2RlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5faGlkZUVtcHR5TWVzc2FnZSgpO1xuXHRcdFx0XHR0aGlzLl9sYXlvdXRPdXRwdXQoMCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9zaG93RW1wdHlNZXNzYWdlKGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsT3V0cHV0RW1wdHknLCAnTm8gb3V0cHV0IHdhcyBwcm9kdWNlZCBieSB0aGUgY29tbWFuZC4nKSk7XG5cdFx0XHRcdHRoaXMuX2xheW91dE91dHB1dCgwKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGl2ZVRlcm1pbmFsSW5zdGFuY2UgPSBhd2FpdCB0aGlzLl9yZXNvbHZlTGl2ZVRlcm1pbmFsKCk7XG5cdFx0Y29uc3QgY29tbWFuZCA9IGxpdmVUZXJtaW5hbEluc3RhbmNlID8gdGhpcy5fcmVzb2x2ZUNvbW1hbmQoKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzbmFwc2hvdCA9IHRoaXMuX2dldFRlcm1pbmFsQ29tbWFuZE91dHB1dCgpO1xuXG5cdFx0aWYgKGxpdmVUZXJtaW5hbEluc3RhbmNlICYmIGNvbW1hbmQpIHtcblx0XHRcdGNvbnN0IGhhbmRsZWQgPSBhd2FpdCB0aGlzLl9yZW5kZXJMaXZlT3V0cHV0KGxpdmVUZXJtaW5hbEluc3RhbmNlLCBjb21tYW5kKTtcblx0XHRcdGlmIChoYW5kbGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9kaXNwb3NlTGl2ZU1pcnJvcigpO1xuXG5cdFx0aWYgKHNuYXBzaG90KSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZW5kZXJTbmFwc2hvdE91dHB1dChzbmFwc2hvdCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9oYXNUZXJtaW5hbFNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5faXNJbnZvY2F0aW9uUnVubmluZygpKSB7XG5cdFx0XHR0aGlzLl9oaWRlRW1wdHlNZXNzYWdlKCk7XG5cdFx0XHR0aGlzLl9sYXlvdXRPdXRwdXQoMCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVuZGVyVW5hdmFpbGFibGVNZXNzYWdlKGxpdmVUZXJtaW5hbEluc3RhbmNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlbmRlckxpdmVPdXRwdXQobGl2ZVRlcm1pbmFsSW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLCBjb21tYW5kOiBJVGVybWluYWxDb21tYW5kKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHRoaXMuX21pcnJvcikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGF3YWl0IGxpdmVUZXJtaW5hbEluc3RhbmNlLnh0ZXJtUmVhZHlQcm9taXNlO1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkIHx8IGxpdmVUZXJtaW5hbEluc3RhbmNlLmlzRGlzcG9zZWQgfHwgIWxpdmVUZXJtaW5hbEluc3RhbmNlLnh0ZXJtKSB7XG5cdFx0XHR0aGlzLl9kaXNwb3NlTGl2ZU1pcnJvcigpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBtaXJyb3IgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZXRhY2hlZFRlcm1pbmFsQ29tbWFuZE1pcnJvciwgbGl2ZVRlcm1pbmFsSW5zdGFuY2UueHRlcm0sIGNvbW1hbmQpKTtcblx0XHR0aGlzLl9taXJyb3IgPSBtaXJyb3I7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobWlycm9yLm9uRGlkQ2hhbmdlUm93SGVpZ2h0KCgpID0+IHRoaXMuX2hhbmRsZU1pcnJvclJvd0hlaWdodENoYW5nZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobWlycm9yLm9uRGlkVXBkYXRlKHJlc3VsdCA9PiB7XG5cdFx0XHQvLyBIaWRlIGVtcHR5IG1lc3NhZ2UgYXMgc29vbiBhcyB3ZSBnZXQgb3V0cHV0XG5cdFx0XHRpZiAocmVzdWx0LmxpbmVDb3VudCAmJiByZXN1bHQubGluZUNvdW50ID4gMCkge1xuXHRcdFx0XHR0aGlzLl9oaWRlRW1wdHlNZXNzYWdlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sYXlvdXRPdXRwdXQocmVzdWx0LmxpbmVDb3VudCk7XG5cdFx0XHRpZiAodGhpcy5faXNBdEJvdHRvbSkge1xuXHRcdFx0XHR0aGlzLl9zY3JvbGxPdXRwdXRUb0JvdHRvbSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHQvLyBGb3J3YXJkIGlucHV0IGZyb20gdGhlIG1pcnJvciB0ZXJtaW5hbCB0byB0aGUgbGl2ZSB0ZXJtaW5hbCBpbnN0YW5jZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKG1pcnJvci5vbkRpZElucHV0KGRhdGEgPT4ge1xuXHRcdFx0aWYgKCFsaXZlVGVybWluYWxJbnN0YW5jZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdGxpdmVUZXJtaW5hbEluc3RhbmNlLnNlbmRUZXh0KGRhdGEsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0YXdhaXQgbWlycm9yLmF0dGFjaCh0aGlzLl90ZXJtaW5hbENvbnRhaW5lcik7XG5cdFx0YXdhaXQgdGhpcy5fbGF5b3V0TWlycm9yV2lkdGgobWlycm9yKTtcblx0XHRsZXQgcmVzdWx0ID0gYXdhaXQgbWlycm9yLnJlbmRlckNvbW1hbmQoKTtcblx0XHQvLyBPbmx5IHNob3cgXCJObyBvdXRwdXRcIiBtZXNzYWdlIGlmOlxuXHRcdC8vIDEuIENvbW1hbmQgaGFzIGZpbmlzaGVkIChoYXMgZW5kTWFya2VyKSwgQU5EXG5cdFx0Ly8gMi4gVGhlcmUncyBubyBvdXRwdXQgYWZ0ZXIgcmV0cnlpbmdcblx0XHQvLyBJZiBjb21tYW5kIGlzIHN0aWxsIHJ1bm5pbmcsIGRvbid0IHNob3cgdGhlIG1lc3NhZ2UgLSBvdXRwdXQgbWF5IGNvbWUgbGF0ZXJcblx0XHRsZXQgY29tbWFuZEZpbmlzaGVkID0gISFjb21tYW5kLmVuZE1hcmtlcjtcblx0XHRsZXQgaGFzT3V0cHV0ID0gcmVzdWx0ICYmIHJlc3VsdC5saW5lQ291bnQgJiYgcmVzdWx0LmxpbmVDb3VudCA+IDA7XG5cblx0XHQvLyBJZiB3ZSBnb3Qgbm8gb3V0cHV0LCBwb2xsIHVudGlsIGVpdGhlciBvdXRwdXQgYXBwZWFycyBvciBjb21tYW5kIGZpbmlzaGVzXG5cdFx0Ly8gVGhpcyBoYW5kbGVzIGNhc2VzIHdoZXJlOlxuXHRcdC8vIDEuIENvbW1hbmQgaXMgcnVubmluZyBidXQgZXhlY3V0ZWRNYXJrZXIgaXNuJ3Qgc2V0IHlldCAocmVuZGVyQ29tbWFuZCByZXR1cm5zIHVuZGVmaW5lZClcblx0XHQvLyAyLiBDb21tYW5kIGZpbmlzaGVkIHF1aWNrbHkgYnV0IGJ1ZmZlciBpc24ndCByZWFkeSB5ZXRcblx0XHRpZiAoIWhhc091dHB1dCkge1xuXHRcdFx0Zm9yIChsZXQgcmV0cnkgPSAwOyByZXRyeSA8IE1BWF9PVVRQVVRfUE9MTF9SRVRSSUVTICYmICFoYXNPdXRwdXQ7IHJldHJ5KyspIHtcblx0XHRcdFx0YXdhaXQgdGltZW91dChPVVRQVVRfUE9MTF9ERUxBWV9NUyk7XG5cdFx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgbWlycm9yLnJlbmRlckNvbW1hbmQoKTtcblx0XHRcdFx0aGFzT3V0cHV0ID0gcmVzdWx0ICYmIHJlc3VsdC5saW5lQ291bnQgJiYgcmVzdWx0LmxpbmVDb3VudCA+IDA7XG5cdFx0XHRcdGNvbW1hbmRGaW5pc2hlZCA9ICEhY29tbWFuZC5lbmRNYXJrZXI7XG5cdFx0XHRcdC8vIFN0b3AgcG9sbGluZyBpZiBjb21tYW5kIGZpbmlzaGVkICh3ZSdsbCBzaG93IFwibm8gb3V0cHV0XCIgb3Igb3V0cHV0KVxuXHRcdFx0XHRpZiAoY29tbWFuZEZpbmlzaGVkKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWhhc091dHB1dCkge1xuXHRcdFx0aWYgKGNvbW1hbmRGaW5pc2hlZCkge1xuXHRcdFx0XHR0aGlzLl9zaG93RW1wdHlNZXNzYWdlKGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsT3V0cHV0RW1wdHknLCAnTm8gb3V0cHV0IHdhcyBwcm9kdWNlZCBieSB0aGUgY29tbWFuZC4nKSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBJZiBjb21tYW5kIGlzIHN0aWxsIHJ1bm5pbmcsIGxlYXZlIGNvbnRlbnQgZW1wdHkgYnV0IGRvbid0IHNob3cgXCJubyBvdXRwdXRcIiBtZXNzYWdlXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2hpZGVFbXB0eU1lc3NhZ2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fbGF5b3V0T3V0cHV0KHJlc3VsdD8ubGluZUNvdW50ID8/IDApO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVuZGVyU25hcHNob3RPdXRwdXQoc25hcHNob3Q6IE5vbk51bGxhYmxlPElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGFbJ3Rlcm1pbmFsQ29tbWFuZE91dHB1dCddPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zbmFwc2hvdE1pcnJvcikge1xuXHRcdFx0dGhpcy5fc25hcHNob3RNaXJyb3Iuc2V0T3V0cHV0KHNuYXBzaG90KTtcblx0XHRcdGF3YWl0IHRoaXMuX2xheW91dE1pcnJvcldpZHRoKHRoaXMuX3NuYXBzaG90TWlycm9yKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3NuYXBzaG90TWlycm9yLnJlbmRlcigpO1xuXHRcdFx0dGhpcy5fbGF5b3V0T3V0cHV0KHJlc3VsdD8ubGluZUNvdW50ID8/IHNuYXBzaG90LmxpbmVDb3VudCA/PyB0aGlzLl9sYXN0UmVuZGVyZWRMaW5lQ291bnQgPz8gMCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fdGVybWluYWxDb250YWluZXIpO1xuXHRcdHRoaXMuX3NuYXBzaG90TWlycm9yID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGV0YWNoZWRUZXJtaW5hbFNuYXBzaG90TWlycm9yLCBzbmFwc2hvdCwgdGhpcy5fZ2V0U3RvcmVkVGhlbWUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zbmFwc2hvdE1pcnJvci5vbkRpZENoYW5nZVJvd0hlaWdodCgoKSA9PiB0aGlzLl9oYW5kbGVNaXJyb3JSb3dIZWlnaHRDaGFuZ2UoKSkpO1xuXHRcdGF3YWl0IHRoaXMuX3NuYXBzaG90TWlycm9yLmF0dGFjaCh0aGlzLl90ZXJtaW5hbENvbnRhaW5lcik7XG5cdFx0dGhpcy5fc25hcHNob3RNaXJyb3Iuc2V0T3V0cHV0KHNuYXBzaG90KTtcblx0XHRhd2FpdCB0aGlzLl9sYXlvdXRNaXJyb3JXaWR0aCh0aGlzLl9zbmFwc2hvdE1pcnJvcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fc25hcHNob3RNaXJyb3IucmVuZGVyKCk7XG5cdFx0Y29uc3QgaGFzVGV4dCA9ICEhc25hcHNob3QudGV4dCAmJiBzbmFwc2hvdC50ZXh0Lmxlbmd0aCA+IDA7XG5cdFx0aWYgKGhhc1RleHQpIHtcblx0XHRcdHRoaXMuX2hpZGVFbXB0eU1lc3NhZ2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2hvd0VtcHR5TWVzc2FnZShsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbE91dHB1dEVtcHR5JywgJ05vIG91dHB1dCB3YXMgcHJvZHVjZWQgYnkgdGhlIGNvbW1hbmQuJykpO1xuXHRcdH1cblx0XHRjb25zdCBsaW5lQ291bnQgPSByZXN1bHQ/LmxpbmVDb3VudCA/PyBzbmFwc2hvdC5saW5lQ291bnQgPz8gMDtcblx0XHR0aGlzLl9sYXlvdXRPdXRwdXQobGluZUNvdW50KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclVuYXZhaWxhYmxlTWVzc2FnZShsaXZlVGVybWluYWxJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuX3Rlcm1pbmFsQ29udGFpbmVyKTtcblx0XHR0aGlzLl9sYXN0UmVuZGVyZWRMaW5lQ291bnQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKCFsaXZlVGVybWluYWxJbnN0YW5jZSkge1xuXHRcdFx0dGhpcy5fc2hvd0VtcHR5TWVzc2FnZShsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbE91dHB1dFRlcm1pbmFsTWlzc2luZycsICdUZXJtaW5hbCBpcyBubyBsb25nZXIgYXZhaWxhYmxlLicpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2hvd0VtcHR5TWVzc2FnZShsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbE91dHB1dENvbW1hbmRNaXNzaW5nJywgJ0NvbW1hbmQgaW5mb3JtYXRpb24gaXMgbm90IGF2YWlsYWJsZS4nKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUxpdmVUZXJtaW5hbCgpOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCB0aGlzLl9lbnN1cmVUZXJtaW5hbEluc3RhbmNlKCk7XG5cdFx0cmV0dXJuIGluc3RhbmNlICYmICFpbnN0YW5jZS5pc0Rpc3Bvc2VkID8gaW5zdGFuY2UgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93RW1wdHlNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2VtcHR5RWxlbWVudC50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG5cdFx0dGhpcy5fdGVybWluYWxDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY2hhdC10ZXJtaW5hbC1vdXRwdXQtdGVybWluYWwtbm8tb3V0cHV0Jyk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtdGVybWluYWwtb3V0cHV0LWNvbnRhaW5lci1uby1vdXRwdXQnKTtcblx0fVxuXG5cdHByaXZhdGUgX2hpZGVFbXB0eU1lc3NhZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZW1wdHlFbGVtZW50LnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGhpcy5fdGVybWluYWxDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC10ZXJtaW5hbC1vdXRwdXQtdGVybWluYWwtbm8tb3V0cHV0Jyk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2NoYXQtdGVybWluYWwtb3V0cHV0LWNvbnRhaW5lci1uby1vdXRwdXQnKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VMaXZlTWlycm9yKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9taXJyb3IpIHtcblx0XHRcdHRoaXMuX21pcnJvci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9taXJyb3IgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVPdXRwdXRSZWxheW91dCgpOiB2b2lkIHtcblx0XHRkb20uZ2V0V2luZG93KHRoaXMuZG9tTm9kZSkucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcblx0XHRcdHRoaXMuX2xheW91dE91dHB1dCgpO1xuXHRcdFx0dGhpcy5fc2Nyb2xsT3V0cHV0VG9Cb3R0b20oKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbWlycm9yJ3MgcGFpbnRlZCBjZWxsIG1ldHJpY3MgY2hhbmdlZDogdGhlIGZpcnN0IHJlbmRlciByZXBsYWNlcyB0aGUgcHJlLXJlbmRlclxuXHQgKiBmb250IGVzdGltYXRlLCBhbmQgbGF0ZXIgcmVuZGVycyBjYW4gcmVmbGVjdCBEUFIgY2hhbmdlcy4gUmUtcnVuIGxheW91dCBzbyB0aGUgYm94XG5cdCAqIGhlaWdodCBhbmQgd3JhcCB3aWR0aCBtYXRjaCB3aGF0IHh0ZXJtIGFjdHVhbGx5IHBhaW50ZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVNaXJyb3JSb3dIZWlnaHRDaGFuZ2UoKTogdm9pZCB7XG5cdFx0dm9pZCB0aGlzLl9sYXlvdXRNaXJyb3JXaWR0aCgpO1xuXHRcdHRoaXMuX2xheW91dE91dHB1dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlUmVzaXplKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5pc0V4cGFuZGVkKSB7XG5cdFx0XHR2b2lkIHRoaXMuX2xheW91dE1pcnJvcldpZHRoKCk7XG5cdFx0XHR0aGlzLl9sYXlvdXRPdXRwdXQoKTtcblx0XHRcdHRoaXMuX3Njcm9sbE91dHB1dFRvQm90dG9tKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Njcm9sbGFibGVDb250YWluZXIuc2NhbkRvbU5vZGUoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVzaXplcyB0aGUgbWlycm9yJ3MgY29sdW1uIGNvdW50IHRvIGZpbGwgdGhlIGN1cnJlbnRseSBhdmFpbGFibGUgd2lkdGguIE5vLW9wIHdoaWxlIHRoZVxuXHQgKiB3aWR0aCBpcyB1bm1lYXN1cmFibGUgKGUuZy4gY29sbGFwc2VkKTsgdGhlIG1pcnJvciBrZWVwcyBpdHMgY3VycmVudCBjb2xzIHVudGlsIHRoZSBuZXh0XG5cdCAqIGxheW91dCBvcHBvcnR1bml0eS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2xheW91dE1pcnJvcldpZHRoKG1pcnJvcjogRGV0YWNoZWRUZXJtaW5hbENvbW1hbmRNaXJyb3IgfCBEZXRhY2hlZFRlcm1pbmFsU25hcHNob3RNaXJyb3IgfCB1bmRlZmluZWQgPSB0aGlzLl9zbmFwc2hvdE1pcnJvciA/PyB0aGlzLl9taXJyb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIW1pcnJvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB3aWR0aCA9IHRoaXMuX3Rlcm1pbmFsQ29udGFpbmVyLmNsaWVudFdpZHRoIHx8IHRoaXMuX291dHB1dEJvZHkuY2xpZW50V2lkdGggfHwgdGhpcy5kb21Ob2RlLmNsaWVudFdpZHRoIHx8ICh0aGlzLmRvbU5vZGUucGFyZW50RWxlbWVudD8uY2xpZW50V2lkdGggPz8gMCk7XG5cdFx0aWYgKHdpZHRoIDw9IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWlycm9yLmxheW91dCh3aWR0aCk7XG5cdFx0aWYgKCF0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkICYmIHJlc3VsdD8ubGluZUNvdW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIFJlLXdyYXBwaW5nIGNhbiBjaGFuZ2UgdGhlIG51bWJlciBvZiByZW5kZXJlZCByb3dzLCBzbyByZWZyZXNoIHRoZSBib3ggaGVpZ2h0XG5cdFx0XHR0aGlzLl9sYXlvdXRPdXRwdXQocmVzdWx0LmxpbmVDb3VudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0T3V0cHV0KGxpbmVDb3VudD86IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChsaW5lQ291bnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fbGFzdFJlbmRlcmVkTGluZUNvdW50ID0gbGluZUNvdW50O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsaW5lQ291bnQgPSB0aGlzLl9sYXN0UmVuZGVyZWRMaW5lQ291bnQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lci5zY2FuRG9tTm9kZSgpO1xuXHRcdGlmICghdGhpcy5pc0V4cGFuZGVkIHx8IGxpbmVDb3VudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZURvbU5vZGUgPSB0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyLmdldERvbU5vZGUoKTtcblx0XHRjb25zdCByb3dIZWlnaHQgPSB0aGlzLl9jb21wdXRlUm93SGVpZ2h0UHgoKTtcblx0XHRjb25zdCBwYWRkaW5nID0gdGhpcy5fZ2V0T3V0cHV0UGFkZGluZygpO1xuXHRcdC8vIFRoZSBjb250YWluZXIgY2FycmllcyBhIENTUyBtYXgtaGVpZ2h0IHdpdGggb3ZlcmZsb3c6IGhpZGRlbjsga2VlcCB0aGUgcm93IGNhcFxuXHRcdC8vIHVuZGVyIGl0IHNvIHRoZSBDU1MgbGltaXQgY2FuIG5ldmVyIHNsaWNlIGEgcm93IHRoYXQgdGhlIGhlaWdodCBtYXRoIGFsbG93ZWQuXG5cdFx0bGV0IG1heFJvd3MgPSBNQVhfT1VUUFVUX1JPV1M7XG5cdFx0Y29uc3QgY29udGFpbmVyTWF4SGVpZ2h0ID0gTnVtYmVyLnBhcnNlRmxvYXQoZG9tLmdldENvbXB1dGVkU3R5bGUodGhpcy5kb21Ob2RlKS5tYXhIZWlnaHQpO1xuXHRcdGlmICghTnVtYmVyLmlzTmFOKGNvbnRhaW5lck1heEhlaWdodCkpIHtcblx0XHRcdG1heFJvd3MgPSBNYXRoLm1heChNYXRoLm1pbihtYXhSb3dzLCBNYXRoLmZsb29yKChjb250YWluZXJNYXhIZWlnaHQgLSBwYWRkaW5nKSAvIHJvd0hlaWdodCkpLCBNSU5fT1VUUFVUX1JPV1MpO1xuXHRcdH1cblx0XHRjb25zdCBjb250ZW50Um93cyA9IE1hdGgubWluKE1hdGgubWF4KGxpbmVDb3VudCwgTUlOX09VVFBVVF9ST1dTKSwgbWF4Um93cyk7XG5cdFx0Ly8gVXNlIHRoZSBsaW5lLWNvdW50LWJhc2VkIGNhbGN1bGF0aW9uIGRpcmVjdGx5IHJhdGhlciB0aGFuIGNvbnN0cmFpbmluZyBieVxuXHRcdC8vIF9vdXRwdXRCb2R5LmNsaWVudEhlaWdodC4gVGhlIERPTSBtZWFzdXJlbWVudCByYWNlcyB3aXRoIHh0ZXJtJ3MgYXN5bmNcblx0XHQvLyByZW5kZXJpbmcgXHUyMDE0IHdoZW4gbmV3IGxpbmVzIGFycml2ZSwgY2xpZW50SGVpZ2h0IHJlZmxlY3RzIHRoZSBzdGFsZVxuXHRcdC8vIChwcmUtcmVuZGVyKSBzaXplLCBjYXVzaW5nIHRoZSB2aWV3cG9ydCB0byBiZSB0b28gc2hvcnQgYW5kIGNsaXBwaW5nIHRoZVxuXHRcdC8vIGxhc3QgbGluZS4gVGhlIGhlaWdodCBpcyBhbiBleGFjdCBtdWx0aXBsZSBvZiB0aGUgbWlycm9yJ3MgcGFpbnRlZCByb3dcblx0XHQvLyBoZWlnaHQgKHBsdXMgdGhlIG91dHB1dCBwYWRkaW5nKSB3aXRoIG5vIHJvdW5kaW5nIHNsYWNrLCBzbyB0aGUgYm94IGFsd2F5c1xuXHRcdC8vIGVuZHMgb24gYSB3aG9sZSByb3cuXG5cdFx0c2Nyb2xsYWJsZURvbU5vZGUuc3R5bGUuaGVpZ2h0ID0gYCR7Y29udGVudFJvd3MgKiByb3dIZWlnaHQgKyBwYWRkaW5nfXB4YDtcblx0XHR0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyLnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlSXNBdEJvdHRvbSgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3Njcm9sbGFibGVDb250YWluZXIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBkaW1lbnNpb25zID0gdGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lci5nZXRTY3JvbGxEaW1lbnNpb25zKCk7XG5cdFx0Y29uc3Qgc2Nyb2xsUG9zaXRpb24gPSB0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyLmdldFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0Ly8gQ29uc2lkZXIgXCJhdCBib3R0b21cIiBpZiB3aXRoaW4gYSBzbWFsbCB0aHJlc2hvbGQgdG8gYWNjb3VudCBmb3Igcm91bmRpbmdcblx0XHRjb25zdCB0aHJlc2hvbGQgPSA1O1xuXHRcdHJldHVybiBzY3JvbGxQb3NpdGlvbi5zY3JvbGxUb3AgPj0gZGltZW5zaW9ucy5zY3JvbGxIZWlnaHQgLSBkaW1lbnNpb25zLmhlaWdodCAtIHRocmVzaG9sZDtcblx0fVxuXG5cdHByaXZhdGUgX3Njcm9sbE91dHB1dFRvQm90dG9tKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc1Byb2dyYW1tYXRpY1Njcm9sbCA9IHRydWU7XG5cdFx0Y29uc3QgZGltZW5zaW9ucyA9IHRoaXMuX3Njcm9sbGFibGVDb250YWluZXIuZ2V0U2Nyb2xsRGltZW5zaW9ucygpO1xuXHRcdHRoaXMuX3Njcm9sbGFibGVDb250YWluZXIuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IGRpbWVuc2lvbnMuc2Nyb2xsSGVpZ2h0IH0pO1xuXHRcdHRoaXMuX2lzUHJvZ3JhbW1hdGljU2Nyb2xsID0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPdXRwdXRQYWRkaW5nKCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgc3R5bGUgPSBkb20uZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLl9vdXRwdXRCb2R5KTtcblx0XHRjb25zdCBwYWRkaW5nVG9wID0gTnVtYmVyLnBhcnNlRmxvYXQoc3R5bGUucGFkZGluZ1RvcCB8fCAnMCcpO1xuXHRcdGNvbnN0IHBhZGRpbmdCb3R0b20gPSBOdW1iZXIucGFyc2VGbG9hdChzdHlsZS5wYWRkaW5nQm90dG9tIHx8ICcwJyk7XG5cdFx0cmV0dXJuIHBhZGRpbmdUb3AgKyBwYWRkaW5nQm90dG9tO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZVJvd0hlaWdodFB4KCk6IG51bWJlciB7XG5cdFx0Ly8gUHJlZmVyIHRoZSBtaXJyb3IncyBvd24gcm93IGhlaWdodDogb25jZSBpdHMgcmVuZGVyZXIgaGFzIGluaXRpYWxpemVkIHRoaXMgaXMgdGhlXG5cdFx0Ly8gZXhhY3QgY2VsbCBoZWlnaHQgeHRlcm0gcGFpbnRzLCBzbyB0aGUgYm94IGVuZHMgb24gYSB3aG9sZSByb3cgaW5zdGVhZCBvZiBzbGljaW5nXG5cdFx0Ly8gdGhlIGxhc3Qgb25lIHZpYSB0aGUgY29uZmlnLWJhc2VkIGVzdGltYXRlIGJlbG93LlxuXHRcdGNvbnN0IG1pcnJvclJvd0hlaWdodCA9ICh0aGlzLl9zbmFwc2hvdE1pcnJvciA/PyB0aGlzLl9taXJyb3IpPy5nZXRSb3dIZWlnaHRQeCgpO1xuXHRcdGlmIChtaXJyb3JSb3dIZWlnaHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIG1pcnJvclJvd0hlaWdodDtcblx0XHR9XG5cdFx0Y29uc3Qgd2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLmRvbU5vZGUpO1xuXHRcdGNvbnN0IGZvbnQgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEZvbnQod2luZG93KTtcblx0XHRjb25zdCBoYXNDaGFySGVpZ2h0ID0gaXNOdW1iZXIoZm9udC5jaGFySGVpZ2h0KSAmJiBmb250LmNoYXJIZWlnaHQgPiAwO1xuXHRcdGNvbnN0IGhhc0ZvbnRTaXplID0gaXNOdW1iZXIoZm9udC5mb250U2l6ZSkgJiYgZm9udC5mb250U2l6ZSA+IDA7XG5cdFx0Y29uc3QgaGFzTGluZUhlaWdodCA9IGlzTnVtYmVyKGZvbnQubGluZUhlaWdodCkgJiYgZm9udC5saW5lSGVpZ2h0ID4gMDtcblx0XHRjb25zdCBjaGFySGVpZ2h0ID0gKGhhc0NoYXJIZWlnaHQgPyBmb250LmNoYXJIZWlnaHQgOiAoaGFzRm9udFNpemUgPyBmb250LmZvbnRTaXplIDogMSkpID8/IDE7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IGhhc0xpbmVIZWlnaHQgPyBmb250LmxpbmVIZWlnaHQgOiAxO1xuXHRcdGNvbnN0IHJvd0hlaWdodCA9IE1hdGguY2VpbChjaGFySGVpZ2h0ICogbGluZUhlaWdodCk7XG5cdFx0cmV0dXJuIE1hdGgubWF4KHJvd0hlaWdodCwgMSk7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseUJhY2tncm91bmRDb2xvcigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGVtZSA9IHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cdFx0Y29uc3QgaXNJbkVkaXRvciA9IENoYXRDb250ZXh0S2V5cy5pbkNoYXRFZGl0b3IuZ2V0VmFsdWUodGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGJhY2tncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGlzSW5FZGl0b3IgPyBlZGl0b3JCYWNrZ3JvdW5kIDogUEFORUxfQkFDS0dST1VORCk7XG5cdFx0aWYgKGJhY2tncm91bmRDb2xvcikge1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGJhY2tncm91bmRDb2xvci50b1N0cmluZygpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFRlcm1pbmFsVGhpbmtpbmdDb2xsYXBzaWJsZVdyYXBwZXIgZXh0ZW5kcyBDaGF0Q29sbGFwc2libGVDb250ZW50UGFydCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ29udGVudEVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kVGV4dDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnRlbnRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNTYW5kYm94V3JhcHBlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfaXNDb21wbGV0ZTogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNTa2lwcGVkOiBib29sZWFuO1xuXHRwcml2YXRlIF9pc1J1bm5pbmdJbkJhY2tncm91bmQ6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRm9jdXNUZXJtaW5hbDogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaG93TGlua0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgX3Nob3dMaW5rRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29tbWFuZFRleHQ6IHN0cmluZyxcblx0XHRpbnRlbnRpb246IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRpc1NhbmRib3hXcmFwcGVkOiBib29sZWFuLFxuXHRcdGNvbnRlbnRFbGVtZW50OiBIVE1MRWxlbWVudCxcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRpbml0aWFsRXhwYW5kZWQ6IGJvb2xlYW4sXG5cdFx0aXNDb21wbGV0ZTogYm9vbGVhbixcblx0XHRpc1NraXBwZWQ6IGJvb2xlYW4sXG5cdFx0aXNSdW5uaW5nSW5CYWNrZ3JvdW5kOiBib29sZWFuLFxuXHRcdG9uRm9jdXNUZXJtaW5hbDogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdC8vIFdoZW4gdGhlIG1vZGVsIHN1cHBsaWVkIGFuIGludGVudGlvbiAod2h5IGl0J3MgcnVubmluZyB0aGUgY29tbWFuZCksXG5cdFx0Ly8gdXNlIGl0IGFzIHRoZSBkZXNjcmlwdGl2ZSB0ZXh0IGluc3RlYWQgb2YgdGhlIGdlbmVyaWMgdmVyYi4gU2tpcHBlZFxuXHRcdC8vIGNvbW1hbmRzIGtlZXAgdGhlIGV4cGxpY2l0IFwiU2tpcHBlZFwiIHdvcmRpbmcgc2luY2UgdGhleSBuZXZlciByYW4uXG5cdFx0Ly8gVGhlIGludGVudGlvbiBhbmQgY29tbWFuZCBhcmUgbm90IGxvY2FsaXphYmxlLCBzbyB0aGV5IGFyZSBjb21iaW5lZFxuXHRcdC8vIGRpcmVjdGx5OyBvbmx5IHRoZSBzdGF0ZSBzdWZmaXggaXMgZXh0ZXJuYWxpemVkLlxuXHRcdGNvbnN0IGludGVudGlvblRleHQgPSBpbnRlbnRpb24gJiYgIWlzU2tpcHBlZCA/IGludGVudGlvbiA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzdGF0ZVRpdGxlID0gaXNTa2lwcGVkXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsLnNraXBwZWQucGxhaW4nLCBcIlNraXBwZWQgezB9XCIsIGNvbW1hbmRUZXh0KVxuXHRcdFx0OiBpc1J1bm5pbmdJbkJhY2tncm91bmRcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbC5ydW5uaW5nSW5CYWNrZ3JvdW5kLnBsYWluJywgXCJSdW5uaW5nIHswfSBpbiBiYWNrZ3JvdW5kXCIsIGNvbW1hbmRUZXh0KVxuXHRcdFx0XHQ6IGlzQ29tcGxldGVcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsLnJhbi5wbGFpbicsIFwiUmFuIHswfVwiLCBjb21tYW5kVGV4dClcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsLnJ1bm5pbmcucGxhaW4nLCBcIlJ1bm5pbmcgezB9XCIsIGNvbW1hbmRUZXh0KTtcblx0XHRjb25zdCB0aXRsZSA9IGludGVudGlvblRleHRcblx0XHRcdD8gaXNSdW5uaW5nSW5CYWNrZ3JvdW5kXG5cdFx0XHRcdD8gYCR7aW50ZW50aW9uVGV4dH0gJHtjb21tYW5kVGV4dH0ke2xvY2FsaXplKCdjaGF0LnRlcm1pbmFsLmJhY2tncm91bmRTdWZmaXgnLCBcIiBpbiBiYWNrZ3JvdW5kXCIpfWBcblx0XHRcdFx0OiBgJHtpbnRlbnRpb25UZXh0fSAke2NvbW1hbmRUZXh0fWBcblx0XHRcdDogc3RhdGVUaXRsZTtcblx0XHRzdXBlcih0aXRsZSwgY29udGV4dCwgdW5kZWZpbmVkLCBob3ZlclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3Rlcm1pbmFsQ29udGVudEVsZW1lbnQgPSBjb250ZW50RWxlbWVudDtcblx0XHR0aGlzLl9jb21tYW5kVGV4dCA9IGNvbW1hbmRUZXh0O1xuXHRcdHRoaXMuX2ludGVudGlvbiA9IGludGVudGlvblRleHQ7XG5cdFx0dGhpcy5faXNTYW5kYm94V3JhcHBlZCA9IGlzU2FuZGJveFdyYXBwZWQ7XG5cdFx0dGhpcy5faXNDb21wbGV0ZSA9IGlzQ29tcGxldGU7XG5cdFx0dGhpcy5faXNTa2lwcGVkID0gaXNTa2lwcGVkO1xuXHRcdHRoaXMuX2lzUnVubmluZ0luQmFja2dyb3VuZCA9IGlzUnVubmluZ0luQmFja2dyb3VuZDtcblx0XHR0aGlzLl9vbkZvY3VzVGVybWluYWwgPSBvbkZvY3VzVGVybWluYWw7XG5cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC10ZXJtaW5hbC10aGlua2luZy1jb2xsYXBzaWJsZScpO1xuXG5cdFx0aWYgKGlzQ29tcGxldGUpIHtcblx0XHRcdHRoaXMuaWNvbiA9IENvZGljb24uY2hlY2s7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2V0Q29kZUZvcm1hdHRlZFRpdGxlKCk7XG5cdFx0dGhpcy5fdXBkYXRlU2hvd0xpbmsoKTtcblx0XHR0aGlzLnNldEV4cGFuZGVkKGluaXRpYWxFeHBhbmRlZCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2hvdWxkQW5pbWF0ZUNvbnRlbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDb2RlRm9ybWF0dGVkVGl0bGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb2xsYXBzZUJ1dHRvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IHRoaXMuX2NvbGxhcHNlQnV0dG9uLmxhYmVsRWxlbWVudDtcblx0XHRsYWJlbEVsZW1lbnQudGV4dENvbnRlbnQgPSAnJztcblxuXHRcdGNvbnN0IHN1ZmZpeFRleHQgPSB0aGlzLl9pc1NhbmRib3hXcmFwcGVkXG5cdFx0XHQ/IHRoaXMuX2lzUnVubmluZ0luQmFja2dyb3VuZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsLnNhbmRib3guYmFja2dyb3VuZFN1ZmZpeCcsIFwiIGluIHNhbmRib3ggKGJhY2tncm91bmQpXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQudGVybWluYWwuc2FuZGJveC5zdWZmaXgnLCBcIiBpbiBzYW5kYm94XCIpXG5cdFx0XHQ6IHRoaXMuX2lzUnVubmluZ0luQmFja2dyb3VuZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsLmJhY2tncm91bmRTdWZmaXgnLCBcIiBpbiBiYWNrZ3JvdW5kXCIpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gSW50ZW50aW9uIGxheW91dDogdGhlIGludGVudGlvbiBhbmQgdGhlIGNvbW1hbmQgc2hhcmUgdGhlIHJvdyBhcyB0d29cblx0XHQvLyBmbGV4IGNlbGxzIHRoYXQgc3RheSBvbiBvbmUgbGluZSBhbmQgZWFjaCBlbGxpcHNpcy10cnVuY2F0ZSwgc3BsaXR0aW5nXG5cdFx0Ly8gdGhlIGF2YWlsYWJsZSB3aWR0aCBlcXVhbGx5IHdoZW4gdGhlIGNvbnRlbnQgb3ZlcmZsb3dzLlxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXRlcm1pbmFsLWhhcy1pbnRlbnRpb24nLCAhIXRoaXMuX2ludGVudGlvbik7XG5cdFx0aWYgKHRoaXMuX2ludGVudGlvbikge1xuXHRcdFx0Y29uc3Qgcm93ID0gZG9tLiQoJ3NwYW4uY2hhdC10ZXJtaW5hbC1sYWJlbC1mbGV4Jyk7XG5cdFx0XHRjb25zdCBpbnRlbnRpb25FbGVtZW50ID0gZG9tLiQoJ3NwYW4uY2hhdC10ZXJtaW5hbC1pbnRlbnRpb24nKTtcblx0XHRcdGludGVudGlvbkVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLl9pbnRlbnRpb247XG5cdFx0XHRjb25zdCBjb21tYW5kRWxlbWVudCA9IGRvbS4kKCdzcGFuLmNoYXQtdGVybWluYWwtY29tbWFuZCcpO1xuXHRcdFx0Y29uc3QgY29kZUVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjb2RlJyk7XG5cdFx0XHRjb2RlRWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuX2NvbW1hbmRUZXh0O1xuXHRcdFx0Y29tbWFuZEVsZW1lbnQuYXBwZW5kQ2hpbGQoY29kZUVsZW1lbnQpO1xuXHRcdFx0cm93LmFwcGVuZENoaWxkKGludGVudGlvbkVsZW1lbnQpO1xuXHRcdFx0cm93LmFwcGVuZENoaWxkKGNvbW1hbmRFbGVtZW50KTtcblx0XHRcdGlmIChzdWZmaXhUZXh0KSB7XG5cdFx0XHRcdGNvbnN0IHN1ZmZpeEVsZW1lbnQgPSBkb20uJCgnc3Bhbi5jaGF0LXRlcm1pbmFsLWxhYmVsLXN1ZmZpeCcpO1xuXHRcdFx0XHRzdWZmaXhFbGVtZW50LnRleHRDb250ZW50ID0gc3VmZml4VGV4dDtcblx0XHRcdFx0cm93LmFwcGVuZENoaWxkKHN1ZmZpeEVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdFx0bGFiZWxFbGVtZW50LmFwcGVuZENoaWxkKHJvdyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJlZml4VGV4dCA9IHRoaXMuX2lzU2FuZGJveFdyYXBwZWRcblx0XHRcdD8gdGhpcy5faXNTa2lwcGVkXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQudGVybWluYWwuc2tpcHBlZEluU2FuZGJveC5wcmVmaXgnLCBcIlNraXBwZWQgXCIpXG5cdFx0XHRcdDogdGhpcy5faXNDb21wbGV0ZVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQudGVybWluYWwucmFuSW5TYW5kYm94LnByZWZpeCcsIFwiUmFuIFwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQudGVybWluYWwucnVubmluZ0luU2FuZGJveC5wcmVmaXgnLCBcIlJ1bm5pbmcgXCIpXG5cdFx0XHQ6IHRoaXMuX2lzU2tpcHBlZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsLnNraXBwZWQucHJlZml4JywgXCJTa2lwcGVkIFwiKVxuXHRcdFx0XHQ6IHRoaXMuX2lzQ29tcGxldGVcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsLnJhbi5wcmVmaXgnLCBcIlJhbiBcIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsLnJ1bm5pbmcucHJlZml4JywgXCJSdW5uaW5nIFwiKTtcblx0XHRsYWJlbEVsZW1lbnQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUocHJlZml4VGV4dCkpO1xuXHRcdGNvbnN0IGNvZGVFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY29kZScpO1xuXHRcdGNvZGVFbGVtZW50LnRleHRDb250ZW50ID0gdGhpcy5fY29tbWFuZFRleHQ7XG5cdFx0bGFiZWxFbGVtZW50LmFwcGVuZENoaWxkKGNvZGVFbGVtZW50KTtcblx0XHRpZiAoc3VmZml4VGV4dCkge1xuXHRcdFx0bGFiZWxFbGVtZW50LmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHN1ZmZpeFRleHQpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTaG93TGluaygpOiB2b2lkIHtcblx0XHR0aGlzLl9zaG93TGlua0VsZW1lbnQ/LnJlbW92ZSgpO1xuXHRcdHRoaXMuX3Nob3dMaW5rRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zaG93TGlua0Rpc3Bvc2FibGVzLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdGlmICghdGhpcy5faXNSdW5uaW5nSW5CYWNrZ3JvdW5kIHx8ICF0aGlzLl9vbkZvY3VzVGVybWluYWwgfHwgIXRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IHRoaXMuX2NvbGxhcHNlQnV0dG9uLmxhYmVsRWxlbWVudDtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9zaG93TGlua0Rpc3Bvc2FibGVzLnZhbHVlID0gc3RvcmU7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9tLiQoJ3NwYW4uY2hhdC10ZXJtaW5hbC1zaG93LWxpbmstY29udGFpbmVyJyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCcgXFx1MjAxNCAnKSk7XG5cdFx0Y29uc3Qgc2hvd0xpbmsgPSBkb20uJCgnc3Bhbi5jaGF0LXRlcm1pbmFsLXNob3ctbGluaycpO1xuXHRcdHNob3dMaW5rLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXQudGVybWluYWwuc2hvd1Rlcm1pbmFsJywgXCJTaG93XCIpO1xuXHRcdHNob3dMaW5rLnJvbGUgPSAnYnV0dG9uJztcblx0XHRzaG93TGluay50YWJJbmRleCA9IDA7XG5cdFx0c3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoc2hvd0xpbmssIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdHRoaXMuX29uRm9jdXNUZXJtaW5hbD8uKCk7XG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNob3dMaW5rLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0Y29uc3Qga2V5Ym9hcmRFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwga2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuX29uRm9jdXNUZXJtaW5hbD8uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChzaG93TGluayk7XG5cdFx0bGFiZWxFbGVtZW50LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0dGhpcy5fc2hvd0xpbmtFbGVtZW50ID0gY29udGFpbmVyO1xuXHR9XG5cblx0cHVibGljIG1hcmtDb21wbGV0ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNDb21wbGV0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc0NvbXBsZXRlID0gdHJ1ZTtcblx0XHR0aGlzLl9pc1J1bm5pbmdJbkJhY2tncm91bmQgPSBmYWxzZTtcblx0XHR0aGlzLmljb24gPSBDb2RpY29uLmNoZWNrO1xuXHRcdHRoaXMuX3NldENvZGVGb3JtYXR0ZWRUaXRsZSgpO1xuXHRcdHRoaXMuX3VwZGF0ZVNob3dMaW5rKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgaW5pdENvbnRlbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGxpc3RXcmFwcGVyID0gZG9tLiQoJy5jaGF0LXVzZWQtY29udGV4dC1saXN0LmNoYXQtdGVybWluYWwtdGhpbmtpbmctY29udGVudCcpO1xuXHRcdGxpc3RXcmFwcGVyLmFwcGVuZENoaWxkKHRoaXMuX3Rlcm1pbmFsQ29udGVudEVsZW1lbnQpO1xuXHRcdHJldHVybiBsaXN0V3JhcHBlcjtcblx0fVxuXG5cdHB1YmxpYyBleHBhbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5zZXRFeHBhbmRlZCh0cnVlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGhhc1NhbWVDb250ZW50KF9vdGhlcjogSUNoYXRSZW5kZXJlckNvbnRlbnQsIF9mb2xsb3dpbmdDb250ZW50OiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdLCBfZWxlbWVudDogQ2hhdFRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsU0FBUztBQUNsQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGtCQUFrQixzQkFBc0I7QUFDakQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2Q0FBNkM7QUFDdEQsU0FBUyxxQkFBb0QsdUJBQW9JO0FBQ2pNLFNBQTJDLDBCQUEwQjtBQUNyRSxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLCtCQUFxRTtBQUM5RSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLCtCQUErQjtBQUV4QyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLG9EQUFvRDtBQUM3RCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGtDQUFrQztBQUMzQyxTQUErQixvQkFBb0I7QUFDbkQsT0FBTztBQUVQLFNBQVMsY0FBdUI7QUFDaEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxlQUFlO0FBQ3hCLFNBQThGLHNCQUFzQiwrQkFBK0Isd0JBQXdCLHVCQUEwQyx3QkFBd0I7QUFDN08sU0FBUyxZQUFZLGlCQUFpQixtQkFBbUIsb0JBQXNDO0FBQy9GLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG9CQUFvQixtQ0FBbUMsMkNBQTJDO0FBQzNHLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBMkIsMEJBQTREO0FBRXZGLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsV0FBVztBQUNwQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyx1Q0FBdUM7QUFDaEQs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
