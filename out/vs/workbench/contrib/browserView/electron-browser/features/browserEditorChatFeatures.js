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
import { localize, localize2 } from "../../../../../nls.js";
import { $ } from "../../../../../base/browser/dom.js";
import { Event } from "../../../../../base/common/event.js";
import { IContextKeyService, ContextKeyExpr, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { Action2, registerAction2, MenuId, MenuRegistry } from "../../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyMod, KeyCode } from "../../../../../base/common/keyCodes.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { DisposableMap, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceTrustManagementService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { URI } from "../../../../../base/common/uri.js";
import { IChatWidgetService } from "../../../chat/browser/chat.js";
import { IChatService } from "../../../chat/common/chatService/chatService.js";
import { ChatContextKeys } from "../../../chat/common/actions/chatContextKeys.js";
import { BrowserElementSelectionMode, BrowserViewCommandId } from "../../../../../platform/browserView/common/browserView.js";
import { BrowserViewSharingState } from "../../../browserView/common/browserView.js";
import { BrowserEditorInput } from "../../common/browserEditorInput.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { WorkbenchHoverDelegate } from "../../../../../platform/hover/browser/hover.js";
import { HoverPosition } from "../../../../../base/browser/ui/hover/hoverWidget.js";
import { BrowserEditor, BrowserEditorContribution, BrowserWidgetLocation, BrowserActionCategory, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL, BrowserActionGroup } from "../browserEditor.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { Extensions as ConfigurationExtensions } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { PolicyCategory } from "../../../../../base/common/policy.js";
import { Extensions as ConfigurationMigrationExtensions, workbenchConfigurationNodeBase } from "../../../../common/configuration.js";
import { safeSetInnerHtml } from "../../../../../base/browser/domSanitize.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { ChatDynamicVariableModel } from "../../../chat/browser/attachments/chatDynamicVariables.js";
import { toAttachedContextDynamicVariable } from "../../../chat/common/attachments/chatVariables.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType, IAccessibleViewService } from "../../../../../platform/accessibility/browser/accessibleView.js";
import { AccessibleViewRegistry } from "../../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { AccessibilityVerbositySettingId } from "../../../accessibility/browser/accessibilityConfiguration.js";
import "../tools/browserTools.contribution.js";
const BrowserSendElementsToChatAttachImagesSettingId = "workbench.browser.sendElementsToChat.attachImages";
function formatElementPath(ancestors) {
  if (!ancestors || ancestors.length === 0) {
    return void 0;
  }
  return ancestors.map((ancestor) => {
    const classes = ancestor.classNames?.length ? `.${ancestor.classNames.join(".")}` : "";
    const id = ancestor.id ? `#${ancestor.id}` : "";
    return `${ancestor.tagName}${id}${classes}`;
  }).join(" > ");
}
function createElementContextValue(elementData, displayName) {
  const sections = [];
  sections.push("Attached Element Context from Integrated Browser");
  sections.push(`Element: ${displayName}`);
  if (elementData.url) {
    sections.push(`URL: ${elementData.url}`);
  }
  const htmlPath = formatElementPath(elementData.ancestors);
  if (htmlPath) {
    sections.push(`HTML Path: ${htmlPath}`);
  }
  sections.push(`Outer HTML:
\`\`\`html
${elementData.outerHTML}
\`\`\``);
  if (elementData.dimensions) {
    const { top, left, width, height } = elementData.dimensions;
    sections.push(
      `Dimensions:
- top: ${Math.round(top)}px
- left: ${Math.round(left)}px
- width: ${Math.round(width)}px
- height: ${Math.round(height)}px`
    );
  }
  sections.push(`CSS:
\`\`\`css
${elementData.computedStyle}
\`\`\``);
  return sections.join("\n\n");
}
const BROWSER_EDITOR_ACTIVE = ContextKeyExpr.equals("activeEditor", BrowserEditorInput.EDITOR_ID);
const BrowserCategory = localize2("browserCategory", "Browser");
const CONTEXT_BROWSER_ELEMENT_SELECTION_MODE = new RawContextKey("browserElementSelectionMode", void 0, localize("browser.elementSelectionMode", "The active element selection mode"));
const CONTEXT_BROWSER_AREA_SELECTION_ACTIVE = new RawContextKey("browserAreaSelectionActive", false, localize("browser.areaSelectionActive", "Whether area selection is currently active"));
class BrowserElementCommentingAccessibilityHelp {
  constructor() {
    this.type = AccessibleViewType.Help;
    this.priority = 110;
    this.name = "browserElementCommenting";
    this.when = CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.isEqualTo(BrowserElementSelectionMode.Comment);
  }
  getProvider(accessor) {
    const editorPane = accessor.get(IEditorService).activeEditorPane;
    if (!(editorPane instanceof BrowserEditor)) {
      return void 0;
    }
    return new AccessibleContentProvider(
      AccessibleViewProviderId.BrowserElementCommenting,
      { type: AccessibleViewType.Help },
      () => [
        localize("browser.elementCommentingAccessibilityHelp.overview", "You are in Integrated Browser element commenting mode."),
        localize("browser.elementCommentingAccessibilityHelp.navigation", "Use Tab and Shift+Tab to move through focusable page elements. Press Enter to comment on the focused element."),
        localize("browser.elementCommentingAccessibilityHelp.composer", "In the comment input, press Enter to add the comment or Escape to cancel it."),
        localize("browser.elementCommentingAccessibilityHelp.continuous", "Commenting mode remains active after adding a comment. Press Escape outside the comment input to stop commenting."),
        localize("browser.elementCommentingAccessibilityHelp.pins", "Numbered comment pins are in the page tab order. Focus a pin to preview its comment, then Tab to its Remove Comment button.")
      ].join("\n"),
      () => editorPane.focus(),
      AccessibilityVerbositySettingId.BrowserElementCommenting
    );
  }
}
AccessibleViewRegistry.register(new BrowserElementCommentingAccessibilityHelp());
let BrowserEditorChatIntegration = class extends BrowserEditorContribution {
  constructor(editor, contextKeyService, instantiationService, telemetryService, logService, chatWidgetService, chatService, configurationService, dialogService, storageService, workspaceTrustManagementService, accessibilityService, accessibleViewService) {
    super(editor);
    this.telemetryService = telemetryService;
    this.logService = logService;
    this.chatWidgetService = chatWidgetService;
    this.chatService = chatService;
    this.configurationService = configurationService;
    this.dialogService = dialogService;
    this.storageService = storageService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.accessibilityService = accessibilityService;
    this.accessibleViewService = accessibleViewService;
    this._commentReferences = /* @__PURE__ */ new Map();
    this._commentReferenceListeners = this._register(new DisposableMap());
    this._commentModelListeners = this._register(new DisposableMap());
    this._disposedCommentModels = /* @__PURE__ */ new WeakSet();
    this._commentSessionsWithComments = /* @__PURE__ */ new Set();
    this._elementSelectionModeContext = CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.bindTo(contextKeyService);
    this._areaSelectionActiveContext = CONTEXT_BROWSER_AREA_SELECTION_ACTIVE.bindTo(contextKeyService);
    const hoverDelegate = this._register(instantiationService.createInstance(
      WorkbenchHoverDelegate,
      "element",
      void 0,
      { position: { hoverPosition: HoverPosition.ABOVE } }
    ));
    this._shareButtonContainer = $(".browser-share-toggle-container");
    this._shareButton = this._register(new Button(this._shareButtonContainer, {
      supportIcons: true,
      title: localize("browser.shareWithAgent", "Share with Agent"),
      small: true,
      hoverDelegate
    }));
    this._shareButton.element.classList.add("browser-share-toggle");
    this._shareButton.label = "$(share-window)";
    this._register(this._shareButton.onDidClick(() => {
      this._toggleShareWithAgent();
    }));
    this._register(this.chatService.onDidSubmitRequest((event) => {
      if (this.editor.model?.elementSelectionState.active) {
        void this.editor.model.toggleElementSelection(false);
      }
      const submittedComments = [...this._commentReferences].filter(([, reference]) => reference.widget.viewModel && isEqual(reference.widget.viewModel.sessionResource, event.chatSessionResource));
      if (submittedComments.length > 0) {
        const browserModels = new Set(submittedComments.map(([, reference]) => reference.browserModel));
        const widgets = new Set(submittedComments.map(([, reference]) => reference.widget));
        for (const [attachmentId] of submittedComments) {
          this._commentReferences.delete(attachmentId);
        }
        for (const widget of widgets) {
          this._disposeCommentReferenceListenerIfUnused(widget);
        }
        for (const browserModel of browserModels) {
          this._syncElementComments(browserModel);
          this._disposeCommentModelListenerIfUnused(browserModel);
        }
      }
    }));
  }
  get widgets() {
    return [{ location: BrowserWidgetLocation.PostUrl, element: this._shareButtonContainer, order: 50 }];
  }
  onModelAttached(model, store) {
    this._updateSharingState(true);
    store.add(model.onDidChangeSharingState(() => {
      this._updateSharingState(false);
    }));
    store.add(model.onDidSelectElement(async (data) => {
      const tracksComment = data.comment !== void 0 && data.elementId !== void 0;
      if (tracksComment) {
        this._ensureCommentModelListeners(model);
      }
      let attached = false;
      try {
        attached = await this._attachElementDataToChat(data, model);
      } catch (error) {
        this.logService.error("BrowserEditor.addElementToChat: Failed to attach element", error);
      }
      if (!attached && data.comment !== void 0 && data.elementId && !this._disposedCommentModels.has(model)) {
        this._syncElementComments(model, [data.elementId]);
      }
      if (tracksComment) {
        this._disposeCommentModelListenerIfUnused(model);
      }
    }));
    this._elementSelectionMode = model.elementSelectionState.active ? model.elementSelectionState.options.mode : void 0;
    this._elementSelectionModeContext.set(this._elementSelectionMode);
    store.add(model.onDidChangeElementSelectionState((state) => {
      const wasCommenting = this._elementSelectionMode === BrowserElementSelectionMode.Comment;
      this._elementSelectionMode = state.active ? state.options.mode : void 0;
      this._elementSelectionModeContext.set(this._elementSelectionMode);
      const isCommenting = this._elementSelectionMode === BrowserElementSelectionMode.Comment;
      const accessibilityHelpHint = isCommenting && state.active ? this.accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.BrowserElementCommenting) : void 0;
      this.accessibilityService.status(isCommenting ? state.active ? accessibilityHelpHint ? localize("browser.elementCommentingEnabledWithAccessibilityHelp", "Element commenting enabled. Press Enter to comment on the focused element. {0}", accessibilityHelpHint) : localize("browser.elementCommentingEnabled", "Element commenting enabled. Press Enter to comment on the focused element.") : localize("browser.elementCommentingDisabled", "Element commenting disabled.") : state.active ? localize("browser.elementSelectionEnabled", "Element selection enabled. Press Enter to add the focused element to chat.") : localize("browser.elementSelectionDisabled", "Element selection disabled."));
      if (isCommenting && !wasCommenting) {
        this._commentSessionsWithComments.delete(model);
      } else if (wasCommenting && !isCommenting && this._commentSessionsWithComments.delete(model)) {
        this._focusChatInputForComments(model);
      }
    }));
    this._areaSelectionActiveContext.set(model.isAreaSelectionActive);
    store.add(model.onDidChangeAreaSelectionActive((active) => {
      this._areaSelectionActiveContext.set(active);
    }));
  }
  onModelDetached() {
    if (this.editor.model) {
      this._commentSessionsWithComments.delete(this.editor.model);
    }
    this._elementSelectionModeContext.reset();
    this._elementSelectionMode = void 0;
    this._areaSelectionActiveContext.reset();
  }
  // -- Sharing -------------------------------------------------------
  _toggleShareWithAgent() {
    const model = this.editor.model;
    if (!model) {
      return;
    }
    model.setSharedWithAgent(model.sharingState !== BrowserViewSharingState.Shared);
  }
  _updateSharingState(isInitialState) {
    const model = this.editor.model;
    const isShared = model?.sharingState === BrowserViewSharingState.Shared;
    const isUnavailable = !model || model.sharingState === BrowserViewSharingState.Unavailable;
    this.editor.browserContainer.classList.toggle("animate", !isInitialState);
    this.editor.browserContainer.classList.toggle("shared", isShared);
    this._shareButtonContainer.style.display = isUnavailable ? "none" : "";
    this._shareButton.checked = isShared;
    this._shareButton.label = isShared ? localize("browser.sharingWithAgent", "Sharing with Agent") + " $(share-window)" : "$(share-window)";
    const title = isShared ? localize("browser.unshareWithAgent", "Stop Sharing with Agent") : localize("browser.shareWithAgent", "Share with Agent");
    this._shareButton.setTitle(title);
    this._shareButton.element.setAttribute("aria-label", title);
  }
  /**
   * Confirm with the user that they understand the risks of sharing content on untrusted pages.
   *
   * @returns true if the user confirms (or the page is local / trusted), false if they cancel.
   */
  async _confirmContentAttachmentRisk(url) {
    if (this.storageService.getBoolean(BrowserEditorChatIntegration.SHARING_CONTENT_WARNING_DONT_ASK_KEY, StorageScope.PROFILE)) {
      return true;
    }
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === "file:") {
        const trustInfo = await this.workspaceTrustManagementService.getUriTrustInfo(URI.file(parsedUrl.pathname));
        if (trustInfo.trusted) {
          return true;
        }
      } else if (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "::1") {
        return true;
      }
    } catch {
    }
    const result = await this.dialogService.confirm({
      type: "warning",
      message: localize("browser.agentSharingContentWarning.message", "Use caution when attaching content from untrusted sources."),
      detail: localize("browser.agentSharingContentWarning.detail", "Pages may contain hidden prompts that can influence agent behavior. Double-check the attached contents before sending."),
      primaryButton: localize("browser.agentSharingContentWarning.ok", "&&OK"),
      checkbox: { label: localize("browser.agentSharingContentWarning.dontShowAgain", "Don't show again"), checked: false }
    });
    if (result.confirmed && result.checkboxChecked) {
      this.storageService.store(BrowserEditorChatIntegration.SHARING_CONTENT_WARNING_DONT_ASK_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
    }
    return result.confirmed;
  }
  // -- Chat widget helpers --------------------------------------------
  /**
   * Reveal the chat widget and wait for its viewModel to be bound before
   * returning. When the chat panel is opened for the first time the session
   * model loads asynchronously, and once it loads {@link ChatInputPart}'s
   * `_syncFromModel` clears any attachments that were added before the model
   * was bound. Callers must use this helper before calling
   * {@linkcode IChatWidget.attachmentModel.addContext} so the attachment is
   * not silently discarded.
   */
  async _revealChatWidgetForAttachment(preserveFocus = false) {
    const widget = await this.chatWidgetService.revealWidget(preserveFocus) ?? this.chatWidgetService.lastFocusedWidget;
    if (widget && !widget.viewModel) {
      await Event.toPromise(widget.onDidChangeViewModel);
    }
    return widget;
  }
  /**
   * Reveal the chat widget and attach the given entries. Returns false if no widget was available.
   * Callers are responsible for running {@link _confirmContentAttachmentRisk} first.
   */
  async _attachToChat(entries) {
    const widget = await this._revealChatWidgetForAttachment();
    if (!widget?.attachmentModel) {
      return false;
    }
    widget.attachmentModel.addContext(...entries);
    return true;
  }
  // -- Element Selection ----------------------------------------------
  async _attachElementDataToChat(elementData, model) {
    const bounds = elementData.bounds;
    const toAttach = [];
    const container = document.createElement("div");
    safeSetInnerHtml(container, elementData.outerHTML);
    const element = container.firstElementChild;
    const innerText = container.textContent;
    let displayNameShort = element ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}` : "";
    let displayNameFull = element ? `${displayNameShort}${element.classList.length ? `.${[...element.classList].join(".")}` : ""}` : "";
    if (elementData.ancestors && elementData.ancestors.length > 0) {
      let last = elementData.ancestors[elementData.ancestors.length - 1];
      let pseudo = "";
      if (last.tagName.startsWith("::") && elementData.ancestors.length > 1) {
        pseudo = last.tagName;
        last = elementData.ancestors[elementData.ancestors.length - 2];
      }
      displayNameShort = `${last.tagName.toLowerCase()}${last.id ? `#${last.id}` : ""}${pseudo}`;
      displayNameFull = `${last.tagName.toLowerCase()}${last.id ? `#${last.id}` : ""}${last.classNames && last.classNames.length ? `.${last.classNames.join(".")}` : ""}${pseudo}`;
    }
    const value = createElementContextValue(elementData, displayNameFull);
    const attachImages = this.configurationService.getValue(BrowserSendElementsToChatAttachImagesSettingId);
    const screenshotBuffer = attachImages ? await model.captureScreenshot({
      quality: 90,
      pageRect: bounds
    }) : void 0;
    const elementEntry = {
      id: "element-" + Date.now(),
      name: displayNameShort,
      fullName: displayNameFull,
      value,
      modelDescription: "Structured browser element context with HTML path, outer HTML, dimensions, and computed styles.",
      kind: "element",
      icon: ThemeIcon.fromId(Codicon.layout.id),
      ancestors: elementData.ancestors,
      attributes: elementData.attributes,
      computedStyles: elementData.computedStyles,
      dimensions: elementData.dimensions,
      innerText,
      imageData: screenshotBuffer?.buffer,
      imageMimeType: screenshotBuffer ? "image/jpeg" : void 0
    };
    toAttach.push(elementEntry);
    if (!await this._confirmContentAttachmentRisk(elementData.url ?? model.url)) {
      return false;
    }
    const widget = await this._revealChatWidgetForAttachment(elementData.comment !== void 0);
    if (!widget?.attachmentModel || this._disposedCommentModels.has(model)) {
      return false;
    }
    widget.attachmentModel.addContext(...toAttach);
    if (elementData.comment !== void 0 && elementData.elementId) {
      if (!this._insertElementCommentReference(widget, model, elementEntry, toAttach.map((attachment) => attachment.id), elementData.elementId, elementData.comment)) {
        widget.attachmentModel.delete(...toAttach.map((attachment) => attachment.id));
        return false;
      }
      if (model.elementSelectionState.active) {
        this._commentSessionsWithComments.add(model);
      } else {
        widget.focusInput();
      }
    }
    this.telemetryService.publicLog2("integratedBrowser.addElementToChat.added", {
      attachImages
    });
    return true;
  }
  _insertElementCommentReference(widget, browserModel, attachment, attachmentIds, elementId, comment) {
    const inputModel = widget.inputEditor.getModel();
    const dynamicVariableModel = widget.getContrib(ChatDynamicVariableModel.ID);
    if (!inputModel || !dynamicVariableModel) {
      return false;
    }
    const insertionPosition = widget.inputEditor.getPosition() ?? inputModel.getFullModelRange().getEndPosition();
    const prefix = insertionPosition.column > 1 ? "\n" : "";
    const suffix = insertionPosition.column < inputModel.getLineMaxColumn(insertionPosition.lineNumber) ? "\n" : "";
    const reference = `@${attachment.name}`;
    const commentText = comment ? ` ${comment}` : "";
    const text = `${prefix}${reference}${commentText}${suffix}`;
    if (!widget.inputEditor.executeEdits("browserElementComment", [{ range: Range.fromPositions(insertionPosition), text }])) {
      return false;
    }
    const referenceStart = prefix ? { lineNumber: insertionPosition.lineNumber + 1, column: 1 } : insertionPosition;
    const referenceRange = new Range(referenceStart.lineNumber, referenceStart.column, referenceStart.lineNumber, referenceStart.column + reference.length);
    dynamicVariableModel.addReference(toAttachedContextDynamicVariable(attachment, referenceRange));
    widget.inputEditor.setPosition({
      lineNumber: referenceRange.endLineNumber,
      column: referenceRange.endColumn + commentText.length
    });
    this._commentReferences.set(attachment.id, { elementId, attachmentIds, widget, browserModel });
    this._ensureCommentReferenceListeners(widget, dynamicVariableModel);
    this._ensureCommentModelListeners(browserModel);
    this._syncElementComments(browserModel);
    return true;
  }
  _ensureCommentReferenceListeners(widget, dynamicVariableModel) {
    if (this._commentReferenceListeners.has(widget)) {
      return;
    }
    const store = new DisposableStore();
    store.add(dynamicVariableModel.onDidChangeReferences(() => this._syncElementCommentsForWidget(widget)));
    store.add(widget.inputEditor.onDidChangeModelContent(() => this._syncElementCommentsForWidget(widget)));
    store.add(widget.attachmentModel.onDidChange((event) => {
      for (const [attachmentId, tracked] of this._commentReferences) {
        if (tracked.widget === widget && event.deleted.includes(attachmentId)) {
          this._removeElementCommentReference(tracked.browserModel, tracked.elementId);
        }
      }
    }));
    this._commentReferenceListeners.set(widget, store);
  }
  _ensureCommentModelListeners(browserModel) {
    if (this._commentModelListeners.has(browserModel)) {
      return;
    }
    const store = new DisposableStore();
    store.add(browserModel.onDidRemoveElementComment((elementId) => this._removeElementCommentReference(browserModel, elementId)));
    store.add(browserModel.onDidNavigate(() => this._detachElementCommentReferences(browserModel)));
    store.add(browserModel.onWillDispose(() => {
      this._disposedCommentModels.add(browserModel);
      this._detachElementCommentReferences(browserModel, false);
    }));
    this._commentModelListeners.set(browserModel, store);
  }
  _syncElementCommentsForWidget(widget) {
    const browserModels = /* @__PURE__ */ new Set();
    for (const reference of this._commentReferences.values()) {
      if (reference.widget === widget) {
        browserModels.add(reference.browserModel);
      }
    }
    for (const browserModel of browserModels) {
      this._syncElementComments(browserModel);
    }
  }
  _syncElementComments(browserModel, pendingCommentIdsToDiscard) {
    const comments = [];
    for (const [attachmentId, tracked] of this._commentReferences) {
      if (tracked.browserModel !== browserModel) {
        continue;
      }
      const inputModel = tracked.widget.inputEditor.getModel();
      const dynamicVariableModel = tracked.widget.getContrib(ChatDynamicVariableModel.ID);
      if (!inputModel || !dynamicVariableModel) {
        continue;
      }
      const variable = dynamicVariableModel.variables.find((candidate) => candidate.id === attachmentId && candidate.isAttachmentReference);
      if (!variable) {
        this._deleteCommentAttachments(attachmentId, tracked);
        continue;
      }
      const line = inputModel.getLineContent(variable.range.endLineNumber);
      comments.push({
        elementId: tracked.elementId,
        body: line.slice(variable.range.endColumn - 1).trimStart()
      });
    }
    void browserModel.setElementComments({ comments, pendingCommentIdsToDiscard });
  }
  _removeElementCommentReference(browserModel, elementId) {
    for (const [attachmentId, tracked] of this._commentReferences) {
      if (tracked.browserModel !== browserModel || tracked.elementId !== elementId) {
        continue;
      }
      const dynamicVariableModel = tracked.widget.getContrib(ChatDynamicVariableModel.ID);
      const variable = dynamicVariableModel?.variables.find((candidate) => candidate.id === attachmentId && candidate.isAttachmentReference);
      const inputModel = tracked.widget.inputEditor.getModel();
      if (variable && inputModel) {
        const lineNumber = variable.range.startLineNumber;
        const lineRange = lineNumber < inputModel.getLineCount() ? new Range(lineNumber, 1, lineNumber + 1, 1) : lineNumber > 1 ? new Range(lineNumber - 1, inputModel.getLineMaxColumn(lineNumber - 1), lineNumber, inputModel.getLineMaxColumn(lineNumber)) : inputModel.getFullModelRange();
        tracked.widget.inputEditor.executeEdits("browserElementComment", [{
          range: lineRange,
          text: ""
        }]);
      }
      this._deleteCommentAttachments(attachmentId, tracked);
    }
  }
  _detachElementCommentReferences(browserModel, syncComments = true) {
    this._commentSessionsWithComments.delete(browserModel);
    const widgets = /* @__PURE__ */ new Set();
    for (const [attachmentId, reference] of this._commentReferences) {
      if (reference.browserModel === browserModel) {
        widgets.add(reference.widget);
        this._commentReferences.delete(attachmentId);
      }
    }
    for (const widget of widgets) {
      this._disposeCommentReferenceListenerIfUnused(widget);
    }
    this._commentModelListeners.deleteAndDispose(browserModel);
    if (syncComments) {
      void browserModel.setElementComments({ comments: [] });
    }
  }
  _focusChatInputForComments(browserModel) {
    for (const reference of this._commentReferences.values()) {
      if (reference.browserModel === browserModel) {
        reference.widget.focusInput();
        return;
      }
    }
  }
  _deleteCommentAttachments(elementAttachmentId, tracked) {
    this._commentReferences.delete(elementAttachmentId);
    tracked.widget.attachmentModel.delete(...tracked.attachmentIds);
    this._disposeCommentReferenceListenerIfUnused(tracked.widget);
    this._disposeCommentModelListenerIfUnused(tracked.browserModel);
  }
  _disposeCommentReferenceListenerIfUnused(widget) {
    for (const reference of this._commentReferences.values()) {
      if (reference.widget === widget) {
        return;
      }
    }
    this._commentReferenceListeners.deleteAndDispose(widget);
  }
  _disposeCommentModelListenerIfUnused(browserModel) {
    for (const reference of this._commentReferences.values()) {
      if (reference.browserModel === browserModel) {
        return;
      }
    }
    this._commentModelListeners.deleteAndDispose(browserModel);
  }
  // -- Console Logs ---------------------------------------------------
  /**
   * Grab the current console logs from the active console session and attach them to chat.
   */
  async addConsoleLogsToChat() {
    const model = this.editor.model;
    if (!model) {
      return;
    }
    try {
      const logs = await model.getConsoleLogs();
      if (!logs) {
        return;
      }
      if (!await this._confirmContentAttachmentRisk(model.url)) {
        return;
      }
      const toAttach = [];
      toAttach.push({
        id: "console-logs-" + Date.now(),
        name: localize("consoleLogs", "Console Logs"),
        fullName: localize("consoleLogs", "Console Logs"),
        value: logs,
        modelDescription: "Console logs captured from Integrated Browser.",
        kind: "element",
        icon: ThemeIcon.fromId(Codicon.terminal.id)
      });
      await this._attachToChat(toAttach);
    } catch (error) {
      this.logService.error("BrowserEditor.addConsoleLogsToChat: Failed to get console logs", error);
    }
  }
  // -- Screenshot ----------------------------------------------------
  /**
   * Capture a viewport screenshot of the current browser view and attach it to chat.
   */
  async addScreenshotToChat() {
    const model = this.editor.model;
    if (!model) {
      return;
    }
    try {
      const screenshotBuffer = await model.captureScreenshot({ quality: 80 });
      if (!await this._confirmContentAttachmentRisk(model.url)) {
        return;
      }
      const toAttach = [{
        id: "browser-screenshot-" + Date.now(),
        name: localize("browserScreenshot", "Browser Screenshot"),
        fullName: localize("browserScreenshot", "Browser Screenshot"),
        kind: "image",
        value: screenshotBuffer.buffer,
        mimeType: "image/jpeg"
      }];
      if (!await this._attachToChat(toAttach)) {
        return;
      }
      this.telemetryService.publicLog2("integratedBrowser.addScreenshotToChat.added", {
        screenshotType: "viewport"
      });
    } catch (error) {
      this.logService.error("BrowserEditor.addScreenshotToChat: Failed to capture screenshot", error);
    }
  }
  /**
   * Drive the area-screenshot flow: present the drag-to-select picker, capture the
   * user-drawn region, and attach the resulting image to chat.
   */
  async addAreaScreenshotToChat() {
    const model = this.editor.model;
    if (!model) {
      return;
    }
    if (model.isAreaSelectionActive) {
      void model.toggleAreaSelection(false);
      return;
    }
    this.editor.ensureBrowserFocus();
    const pickPromise = Event.toPromise(Event.once(model.onDidPickArea));
    void model.toggleAreaSelection(true);
    const rect = await pickPromise;
    if (!rect) {
      return;
    }
    try {
      const screenshotBuffer = await model.captureScreenshot({ quality: 80, pageRect: rect, awaitNextPaint: true });
      if (!await this._confirmContentAttachmentRisk(model.url)) {
        return;
      }
      const toAttach = [{
        id: "browser-area-screenshot-" + Date.now(),
        name: localize("browserAreaScreenshot", "Browser Area Screenshot"),
        fullName: localize("browserAreaScreenshot", "Browser Area Screenshot"),
        kind: "image",
        value: screenshotBuffer.buffer,
        mimeType: "image/jpeg"
      }];
      if (!await this._attachToChat(toAttach)) {
        return;
      }
      this.telemetryService.publicLog2("integratedBrowser.addScreenshotToChat.added", {
        screenshotType: "area"
      });
    } catch (error) {
      this.logService.error("BrowserEditor.addAreaScreenshotToChat: Failed to capture area screenshot", error);
    }
  }
  /**
   * Capture a full-page screenshot (including content scrolled off-screen) and attach it to chat.
   */
  async addFullPageScreenshotToChat() {
    const model = this.editor.model;
    if (!model) {
      return;
    }
    try {
      const screenshotBuffer = await model.captureScreenshot({ fullPage: true, format: "png" });
      if (!await this._confirmContentAttachmentRisk(model.url)) {
        return;
      }
      const toAttach = [{
        id: "browser-fullpage-screenshot-" + Date.now(),
        name: localize("browserFullPageScreenshot", "Browser Full Page Screenshot"),
        fullName: localize("browserFullPageScreenshot", "Browser Full Page Screenshot"),
        kind: "image",
        value: screenshotBuffer.buffer,
        mimeType: "image/png"
      }];
      if (!await this._attachToChat(toAttach)) {
        return;
      }
      this.telemetryService.publicLog2("integratedBrowser.addScreenshotToChat.added", {
        screenshotType: "fullPage"
      });
    } catch (error) {
      this.logService.error("BrowserEditor.addFullPageScreenshotToChat: Failed to capture full-page screenshot", error);
    }
  }
};
BrowserEditorChatIntegration.SHARING_CONTENT_WARNING_DONT_ASK_KEY = "browserView.agentSharingContentWarning.dontAskAgain";
BrowserEditorChatIntegration = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, IChatService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IWorkspaceTrustManagementService),
  __decorateParam(11, IAccessibilityService),
  __decorateParam(12, IAccessibleViewService)
], BrowserEditorChatIntegration);
BrowserEditor.registerContribution(BrowserEditorChatIntegration);
const _AddElementToChatAction = class _AddElementToChatAction extends Action2 {
  constructor() {
    super({
      id: _AddElementToChatAction.ID,
      title: localize2("browser.addElementToChatAction", "Add Element to Chat"),
      category: BrowserCategory,
      icon: Codicon.inspect,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled),
      toggled: CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.isEqualTo(BrowserElementSelectionMode.Select),
      menu: {
        id: MenuId.BrowserChatActionsMenu,
        group: "1_element",
        order: 1,
        when: ChatContextKeys.enabled
      },
      keybinding: [{
        weight: KeybindingWeight.WorkbenchContrib + 50,
        // Priority over terminal
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC,
        args: { highlightFocusedElement: true }
      }]
    });
  }
  run(accessor, argument) {
    const browserEditor = argument instanceof BrowserEditor ? argument : accessor.get(IEditorService).activeEditorPane;
    if (browserEditor instanceof BrowserEditor) {
      browserEditor.ensureBrowserFocus();
      const model = browserEditor.model;
      if (model) {
        const options = argument instanceof BrowserEditor ? void 0 : argument;
        const isActiveMode = model.elementSelectionState.active && model.elementSelectionState.options.mode !== BrowserElementSelectionMode.Comment;
        void model.toggleElementSelection(!isActiveMode, { ...options, continuous: false, mode: BrowserElementSelectionMode.Select });
      }
    }
  }
};
_AddElementToChatAction.ID = BrowserViewCommandId.AddElementToChat;
let AddElementToChatAction = _AddElementToChatAction;
const _AddElementCommentToChatAction = class _AddElementCommentToChatAction extends Action2 {
  constructor() {
    super({
      id: _AddElementCommentToChatAction.ID,
      title: localize2("browser.addElementCommentToChatAction", "Comment on Elements"),
      category: BrowserCategory,
      icon: Codicon.comment,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled),
      toggled: CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.isEqualTo(BrowserElementSelectionMode.Comment),
      menu: {
        id: MenuId.BrowserChatActionsMenu,
        group: "1_element",
        order: 2,
        when: ChatContextKeys.enabled
      },
      keybinding: [{
        weight: KeybindingWeight.WorkbenchContrib + 50,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC,
        args: { continuous: true, mode: BrowserElementSelectionMode.Comment, highlightFocusedElement: true }
      }]
    });
  }
  run(accessor, argument) {
    const browserEditor = argument instanceof BrowserEditor ? argument : accessor.get(IEditorService).activeEditorPane;
    if (browserEditor instanceof BrowserEditor) {
      browserEditor.ensureBrowserFocus();
      const options = argument instanceof BrowserEditor ? void 0 : argument;
      const model = browserEditor.model;
      if (model) {
        const isActiveMode = model.elementSelectionState.active && model.elementSelectionState.options.mode === BrowserElementSelectionMode.Comment;
        void model.toggleElementSelection(!isActiveMode, { ...options, continuous: true, mode: BrowserElementSelectionMode.Comment });
      }
    }
  }
};
_AddElementCommentToChatAction.ID = BrowserViewCommandId.AddElementCommentToChat;
let AddElementCommentToChatAction = _AddElementCommentToChatAction;
class StopElementSelectionAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.browser.stopElementSelection",
      title: localize2("browser.stopElementSelectionAction", "Stop Element Selection"),
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, ContextKeyExpr.has(CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.key)),
      keybinding: {
        when: ContextKeyExpr.has(CONTEXT_BROWSER_ELEMENT_SELECTION_MODE.key),
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyCode.Escape
      }
    });
  }
  run(accessor) {
    const browserEditor = accessor.get(IEditorService).activeEditorPane;
    if (browserEditor instanceof BrowserEditor) {
      void browserEditor.model?.toggleElementSelection(false);
    }
  }
}
const _AddConsoleLogsToChatAction = class _AddConsoleLogsToChatAction extends Action2 {
  constructor() {
    super({
      id: _AddConsoleLogsToChatAction.ID,
      title: localize2("browser.addConsoleLogsToChatAction", "Add Console Logs to Chat"),
      category: BrowserActionCategory,
      icon: Codicon.output,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled),
      menu: {
        id: MenuId.BrowserChatActionsMenu,
        group: "2_logs",
        order: 1,
        when: ChatContextKeys.enabled
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.getContribution(BrowserEditorChatIntegration)?.addConsoleLogsToChat();
    }
  }
};
_AddConsoleLogsToChatAction.ID = BrowserViewCommandId.AddConsoleLogsToChat;
let AddConsoleLogsToChatAction = _AddConsoleLogsToChatAction;
const _AddScreenshotToChatAction = class _AddScreenshotToChatAction extends Action2 {
  constructor() {
    super({
      id: _AddScreenshotToChatAction.ID,
      title: localize2("browser.addScreenshotToChatAction", "Add Screenshot to Chat"),
      category: BrowserActionCategory,
      icon: Codicon.deviceCamera,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled),
      menu: {
        id: MenuId.BrowserChatActionsMenu,
        group: "3_screenshots",
        order: 1,
        when: ChatContextKeys.enabled
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.getContribution(BrowserEditorChatIntegration)?.addScreenshotToChat();
    }
  }
};
_AddScreenshotToChatAction.ID = BrowserViewCommandId.AddScreenshotToChat;
let AddScreenshotToChatAction = _AddScreenshotToChatAction;
const _AddAreaScreenshotToChatAction = class _AddAreaScreenshotToChatAction extends Action2 {
  constructor() {
    super({
      id: _AddAreaScreenshotToChatAction.ID,
      title: localize2("browser.addAreaScreenshotToChatAction", "Add Area Screenshot to Chat"),
      category: BrowserActionCategory,
      icon: Codicon.screenFull,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled),
      toggled: CONTEXT_BROWSER_AREA_SELECTION_ACTIVE,
      menu: {
        id: MenuId.BrowserChatActionsMenu,
        group: "3_screenshots",
        order: 2,
        when: ChatContextKeys.enabled
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.getContribution(BrowserEditorChatIntegration)?.addAreaScreenshotToChat();
    }
  }
};
_AddAreaScreenshotToChatAction.ID = BrowserViewCommandId.AddAreaScreenshotToChat;
let AddAreaScreenshotToChatAction = _AddAreaScreenshotToChatAction;
const _AddFullPageScreenshotToChatAction = class _AddFullPageScreenshotToChatAction extends Action2 {
  constructor() {
    const enabledSetting = ContextKeyExpr.has("config.workbench.browser.experimentalUserTools.enabled");
    super({
      id: _AddFullPageScreenshotToChatAction.ID,
      title: localize2("browser.addFullPageScreenshotToChatAction", "Add Full Page Screenshot to Chat (Experimental)"),
      category: BrowserActionCategory,
      icon: Codicon.deviceCamera,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate(), ChatContextKeys.enabled, enabledSetting),
      menu: {
        id: MenuId.BrowserChatActionsMenu,
        group: "3_screenshots",
        order: 3,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, enabledSetting)
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.getContribution(BrowserEditorChatIntegration)?.addFullPageScreenshotToChat();
    }
  }
};
_AddFullPageScreenshotToChatAction.ID = BrowserViewCommandId.AddFullPageScreenshotToChat;
let AddFullPageScreenshotToChatAction = _AddFullPageScreenshotToChatAction;
registerAction2(AddElementToChatAction);
registerAction2(AddElementCommentToChatAction);
registerAction2(StopElementSelectionAction);
registerAction2(AddConsoleLogsToChatAction);
registerAction2(AddScreenshotToChatAction);
registerAction2(AddAreaScreenshotToChatAction);
registerAction2(AddFullPageScreenshotToChatAction);
MenuRegistry.appendMenuItem(MenuId.BrowserActionsToolbar, {
  submenu: MenuId.BrowserChatActionsMenu,
  title: localize2("browser.chatActionsSubmenu", "Add to Chat"),
  icon: Codicon.inspect,
  group: BrowserActionGroup.Tools,
  order: 1,
  when: ChatContextKeys.enabled,
  isSplitButton: {
    togglePrimaryAction: true,
    primaryActionIds: [AddElementToChatAction.ID, AddElementCommentToChatAction.ID]
  }
});
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...workbenchConfigurationNodeBase,
  properties: {
    "workbench.browser.enableChatTools": {
      type: "boolean",
      default: true,
      markdownDescription: localize(
        { comment: ["This is the description for a setting."], key: "browser.enableChatTools" },
        "When enabled, chat agents can use browser tools to open and interact with pages in the Integrated Browser."
      ),
      policy: {
        name: "BrowserChatTools",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.110",
        localization: {
          description: {
            key: "browser.enableChatTools",
            value: localize("browser.enableChatTools", "When enabled, chat agents can use browser tools to open and interact with pages in the Integrated Browser.")
          }
        }
      },
      agentsWindow: { default: true }
    },
    "workbench.browser.experimentalUserTools.enabled": {
      type: "boolean",
      default: false,
      experiment: { mode: "startup" },
      tags: ["experimental"],
      markdownDescription: localize(
        { comment: ["This is the description for a setting."], key: "browser.experimentalUserTools.enabled" },
        "When enabled, experimental user-facing tools are available in the Integrated Browser's Add to Chat menu."
      )
    },
    [BrowserSendElementsToChatAttachImagesSettingId]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("workbench.browser.sendElementsToChat.attachImages", "Controls whether a screenshot of the selected element will be added to the chat.")
    }
  }
});
Registry.as(ConfigurationMigrationExtensions.ConfigurationMigration).registerConfigurationMigrations([
  {
    key: "chat.sendElementsToChat.attachImages",
    migrateFn: (value) => {
      const result = [
        ["chat.sendElementsToChat.attachImages", { value: void 0 }]
      ];
      if (typeof value === "boolean") {
        result.push([BrowserSendElementsToChatAttachImagesSettingId, { value }]);
      }
      return result;
    }
  }
]);
export {
  BrowserEditorChatIntegration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLWJyb3dzZXIvZmVhdHVyZXMvYnJvd3NlckVkaXRvckNoYXRGZWF0dXJlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBDb250ZXh0S2V5RXhwciwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yLCBNZW51SWQsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBLZXlNb2QsIEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJFbGVtZW50U2VsZWN0aW9uTW9kZSwgSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucywgSUVsZW1lbnREYXRhLCBJRWxlbWVudEFuY2VzdG9yLCBCcm93c2VyVmlld0NvbW1hbmRJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyVmlldy5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlclZpZXdNb2RlbCwgQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3IsIEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24sIEJyb3dzZXJXaWRnZXRMb2NhdGlvbiwgSUJyb3dzZXJFZGl0b3JXaWRnZXQsIEJyb3dzZXJBY3Rpb25DYXRlZ29yeSwgQ09OVEVYVF9CUk9XU0VSX0hBU19FUlJPUiwgQ09OVEVYVF9CUk9XU0VSX0hBU19VUkwsIEJyb3dzZXJBY3Rpb25Hcm91cCB9IGZyb20gJy4uL2Jyb3dzZXJFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFBvbGljeUNhdGVnb3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbk1pZ3JhdGlvbkV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnksIHdvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IHNhZmVTZXRJbm5lckh0bWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU2FuaXRpemUuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXREeW5hbWljVmFyaWFibGVzLmpzJztcbmltcG9ydCB7IHRvQXR0YWNoZWRDb250ZXh0RHluYW1pY1ZhcmlhYmxlIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIsIEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZCwgQWNjZXNzaWJsZVZpZXdUeXBlLCBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3UmVnaXN0cnksIElBY2Nlc3NpYmxlVmlld0ltcGxlbWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5cbi8vIFJlZ2lzdGVyIHRvb2xzXG5pbXBvcnQgJy4uL3Rvb2xzL2Jyb3dzZXJUb29scy5jb250cmlidXRpb24uanMnO1xuXG4vKipcbiAqIFNldHRpbmcgdGhhdCBjb250cm9scyB3aGV0aGVyIGEgc2NyZWVuc2hvdCBvZiB0aGUgc2VsZWN0ZWQgZWxlbWVudCBpcyBhdHRhY2hlZFxuICogdG8gdGhlIGNoYXQgd2hlbiBzZW5kaW5nIGVsZW1lbnRzIGZyb20gdGhlIEludGVncmF0ZWQgQnJvd3Nlci5cbiAqL1xuY29uc3QgQnJvd3NlclNlbmRFbGVtZW50c1RvQ2hhdEF0dGFjaEltYWdlc1NldHRpbmdJZCA9ICd3b3JrYmVuY2guYnJvd3Nlci5zZW5kRWxlbWVudHNUb0NoYXQuYXR0YWNoSW1hZ2VzJztcblxuLyoqXG4gKiBGb3JtYXQgYW4gYXJyYXkgb2YgZWxlbWVudCBhbmNlc3RvcnMgaW50byBhIENTUy1zZWxlY3Rvci1saWtlIHBhdGggc3RyaW5nLlxuICovXG5mdW5jdGlvbiBmb3JtYXRFbGVtZW50UGF0aChhbmNlc3RvcnM6IHJlYWRvbmx5IElFbGVtZW50QW5jZXN0b3JbXSB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghYW5jZXN0b3JzIHx8IGFuY2VzdG9ycy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmV0dXJuIGFuY2VzdG9yc1xuXHRcdC5tYXAoYW5jZXN0b3IgPT4ge1xuXHRcdFx0Y29uc3QgY2xhc3NlcyA9IGFuY2VzdG9yLmNsYXNzTmFtZXM/Lmxlbmd0aCA/IGAuJHthbmNlc3Rvci5jbGFzc05hbWVzLmpvaW4oJy4nKX1gIDogJyc7XG5cdFx0XHRjb25zdCBpZCA9IGFuY2VzdG9yLmlkID8gYCMke2FuY2VzdG9yLmlkfWAgOiAnJztcblx0XHRcdHJldHVybiBgJHthbmNlc3Rvci50YWdOYW1lfSR7aWR9JHtjbGFzc2VzfWA7XG5cdFx0fSlcblx0XHQuam9pbignID4gJyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnRDb250ZXh0VmFsdWUoZWxlbWVudERhdGE6IElFbGVtZW50RGF0YSwgZGlzcGxheU5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHNlY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRzZWN0aW9ucy5wdXNoKCdBdHRhY2hlZCBFbGVtZW50IENvbnRleHQgZnJvbSBJbnRlZ3JhdGVkIEJyb3dzZXInKTtcblx0c2VjdGlvbnMucHVzaChgRWxlbWVudDogJHtkaXNwbGF5TmFtZX1gKTtcblxuXHRpZiAoZWxlbWVudERhdGEudXJsKSB7XG5cdFx0c2VjdGlvbnMucHVzaChgVVJMOiAke2VsZW1lbnREYXRhLnVybH1gKTtcblx0fVxuXG5cdGNvbnN0IGh0bWxQYXRoID0gZm9ybWF0RWxlbWVudFBhdGgoZWxlbWVudERhdGEuYW5jZXN0b3JzKTtcblx0aWYgKGh0bWxQYXRoKSB7XG5cdFx0c2VjdGlvbnMucHVzaChgSFRNTCBQYXRoOiAke2h0bWxQYXRofWApO1xuXHR9XG5cblx0c2VjdGlvbnMucHVzaChgT3V0ZXIgSFRNTDpcXG5cXGBcXGBcXGBodG1sXFxuJHtlbGVtZW50RGF0YS5vdXRlckhUTUx9XFxuXFxgXFxgXFxgYCk7XG5cblx0aWYgKGVsZW1lbnREYXRhLmRpbWVuc2lvbnMpIHtcblx0XHRjb25zdCB7IHRvcCwgbGVmdCwgd2lkdGgsIGhlaWdodCB9ID0gZWxlbWVudERhdGEuZGltZW5zaW9ucztcblx0XHRzZWN0aW9ucy5wdXNoKFxuXHRcdFx0YERpbWVuc2lvbnM6XFxuLSB0b3A6ICR7TWF0aC5yb3VuZCh0b3ApfXB4XFxuLSBsZWZ0OiAke01hdGgucm91bmQobGVmdCl9cHhcXG4tIHdpZHRoOiAke01hdGgucm91bmQod2lkdGgpfXB4XFxuLSBoZWlnaHQ6ICR7TWF0aC5yb3VuZChoZWlnaHQpfXB4YFxuXHRcdCk7XG5cdH1cblxuXHRzZWN0aW9ucy5wdXNoKGBDU1M6XFxuXFxgXFxgXFxgY3NzXFxuJHtlbGVtZW50RGF0YS5jb21wdXRlZFN0eWxlfVxcblxcYFxcYFxcYGApO1xuXG5cdHJldHVybiBzZWN0aW9ucy5qb2luKCdcXG5cXG4nKTtcbn1cblxuLy8gQ29udGV4dCBrZXkgZXhwcmVzc2lvbiB0byBjaGVjayBpZiBicm93c2VyIGVkaXRvciBpcyBhY3RpdmVcbmNvbnN0IEJST1dTRVJfRURJVE9SX0FDVElWRSA9IENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgQnJvd3NlckVkaXRvcklucHV0LkVESVRPUl9JRCk7XG5jb25zdCBCcm93c2VyQ2F0ZWdvcnkgPSBsb2NhbGl6ZTIoJ2Jyb3dzZXJDYXRlZ29yeScsIFwiQnJvd3NlclwiKTtcblxuY29uc3QgQ09OVEVYVF9CUk9XU0VSX0VMRU1FTlRfU0VMRUNUSU9OX01PREUgPSBuZXcgUmF3Q29udGV4dEtleTxCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUgfCB1bmRlZmluZWQ+KCdicm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdicm93c2VyLmVsZW1lbnRTZWxlY3Rpb25Nb2RlJywgXCJUaGUgYWN0aXZlIGVsZW1lbnQgc2VsZWN0aW9uIG1vZGVcIikpO1xuY29uc3QgQ09OVEVYVF9CUk9XU0VSX0FSRUFfU0VMRUNUSU9OX0FDVElWRSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdicm93c2VyQXJlYVNlbGVjdGlvbkFjdGl2ZScsIGZhbHNlLCBsb2NhbGl6ZSgnYnJvd3Nlci5hcmVhU2VsZWN0aW9uQWN0aXZlJywgXCJXaGV0aGVyIGFyZWEgc2VsZWN0aW9uIGlzIGN1cnJlbnRseSBhY3RpdmVcIikpO1xuXG5jbGFzcyBCcm93c2VyRWxlbWVudENvbW1lbnRpbmdBY2Nlc3NpYmlsaXR5SGVscCBpbXBsZW1lbnRzIElBY2Nlc3NpYmxlVmlld0ltcGxlbWVudGF0aW9uIHtcblx0cmVhZG9ubHkgdHlwZSA9IEFjY2Vzc2libGVWaWV3VHlwZS5IZWxwO1xuXHRyZWFkb25seSBwcmlvcml0eSA9IDExMDtcblx0cmVhZG9ubHkgbmFtZSA9ICdicm93c2VyRWxlbWVudENvbW1lbnRpbmcnO1xuXHRyZWFkb25seSB3aGVuID0gQ09OVEVYVF9CUk9XU0VSX0VMRU1FTlRfU0VMRUNUSU9OX01PREUuaXNFcXVhbFRvKEJyb3dzZXJFbGVtZW50U2VsZWN0aW9uTW9kZS5Db21tZW50KTtcblxuXHRnZXRQcm92aWRlcihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKCEoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIoXG5cdFx0XHRBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuQnJvd3NlckVsZW1lbnRDb21tZW50aW5nLFxuXHRcdFx0eyB0eXBlOiBBY2Nlc3NpYmxlVmlld1R5cGUuSGVscCB9LFxuXHRcdFx0KCkgPT4gW1xuXHRcdFx0XHRsb2NhbGl6ZSgnYnJvd3Nlci5lbGVtZW50Q29tbWVudGluZ0FjY2Vzc2liaWxpdHlIZWxwLm92ZXJ2aWV3JywgXCJZb3UgYXJlIGluIEludGVncmF0ZWQgQnJvd3NlciBlbGVtZW50IGNvbW1lbnRpbmcgbW9kZS5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdicm93c2VyLmVsZW1lbnRDb21tZW50aW5nQWNjZXNzaWJpbGl0eUhlbHAubmF2aWdhdGlvbicsIFwiVXNlIFRhYiBhbmQgU2hpZnQrVGFiIHRvIG1vdmUgdGhyb3VnaCBmb2N1c2FibGUgcGFnZSBlbGVtZW50cy4gUHJlc3MgRW50ZXIgdG8gY29tbWVudCBvbiB0aGUgZm9jdXNlZCBlbGVtZW50LlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2Jyb3dzZXIuZWxlbWVudENvbW1lbnRpbmdBY2Nlc3NpYmlsaXR5SGVscC5jb21wb3NlcicsIFwiSW4gdGhlIGNvbW1lbnQgaW5wdXQsIHByZXNzIEVudGVyIHRvIGFkZCB0aGUgY29tbWVudCBvciBFc2NhcGUgdG8gY2FuY2VsIGl0LlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2Jyb3dzZXIuZWxlbWVudENvbW1lbnRpbmdBY2Nlc3NpYmlsaXR5SGVscC5jb250aW51b3VzJywgXCJDb21tZW50aW5nIG1vZGUgcmVtYWlucyBhY3RpdmUgYWZ0ZXIgYWRkaW5nIGEgY29tbWVudC4gUHJlc3MgRXNjYXBlIG91dHNpZGUgdGhlIGNvbW1lbnQgaW5wdXQgdG8gc3RvcCBjb21tZW50aW5nLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2Jyb3dzZXIuZWxlbWVudENvbW1lbnRpbmdBY2Nlc3NpYmlsaXR5SGVscC5waW5zJywgXCJOdW1iZXJlZCBjb21tZW50IHBpbnMgYXJlIGluIHRoZSBwYWdlIHRhYiBvcmRlci4gRm9jdXMgYSBwaW4gdG8gcHJldmlldyBpdHMgY29tbWVudCwgdGhlbiBUYWIgdG8gaXRzIFJlbW92ZSBDb21tZW50IGJ1dHRvbi5cIiksXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0KCkgPT4gZWRpdG9yUGFuZS5mb2N1cygpLFxuXHRcdFx0QWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5Ccm93c2VyRWxlbWVudENvbW1lbnRpbmdcblx0XHQpO1xuXHR9XG59XG5cbkFjY2Vzc2libGVWaWV3UmVnaXN0cnkucmVnaXN0ZXIobmV3IEJyb3dzZXJFbGVtZW50Q29tbWVudGluZ0FjY2Vzc2liaWxpdHlIZWxwKCkpO1xuXG50eXBlIEludGVncmF0ZWRCcm93c2VyQWRkU2NyZWVuc2hvdFRvQ2hhdEFkZGVkRXZlbnQgPSB7XG5cdHNjcmVlbnNob3RUeXBlOiAndmlld3BvcnQnIHwgJ2FyZWEnIHwgJ2Z1bGxQYWdlJztcbn07XG5cbnR5cGUgSW50ZWdyYXRlZEJyb3dzZXJBZGRTY3JlZW5zaG90VG9DaGF0QWRkZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0c2NyZWVuc2hvdFR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGF0IGtpbmQgb2Ygc2NyZWVuc2hvdCB3YXMgY2FwdHVyZWQgKHZpZXdwb3J0LCBhcmVhLCBvciBmdWxsUGFnZSkuJyB9O1xuXHRvd25lcjogJ2pydWFsZXMnO1xuXHRjb21tZW50OiAnQSBzY3JlZW5zaG90IHdhcyBzdWNjZXNzZnVsbHkgYWRkZWQgdG8gY2hhdCBmcm9tIEludGVncmF0ZWQgQnJvd3Nlci4nO1xufTtcblxuXG4vKipcbiAqIENvbnRyaWJ1dGlvbiB0aGF0IG1hbmFnZXMgZWxlbWVudCBzZWxlY3Rpb24sIGVsZW1lbnQgYXR0YWNobWVudCB0byBjaGF0LFxuICogY29uc29sZSBsb2cgYXR0YWNobWVudCB0byBjaGF0LCBhbmQgYWdlbnQgc2hhcmluZy5cbiAqL1xuZXhwb3J0IGNsYXNzIEJyb3dzZXJFZGl0b3JDaGF0SW50ZWdyYXRpb24gZXh0ZW5kcyBCcm93c2VyRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBfZWxlbWVudFNlbGVjdGlvbk1vZGVDb250ZXh0OiBJQ29udGV4dEtleTxCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hcmVhU2VsZWN0aW9uQWN0aXZlQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX2VsZW1lbnRTZWxlY3Rpb25Nb2RlOiBCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1lbnRSZWZlcmVuY2VzID0gbmV3IE1hcDxzdHJpbmcsIHsgZWxlbWVudElkOiBzdHJpbmc7IGF0dGFjaG1lbnRJZHM6IHJlYWRvbmx5IHN0cmluZ1tdOyB3aWRnZXQ6IElDaGF0V2lkZ2V0OyBicm93c2VyTW9kZWw6IElCcm93c2VyVmlld01vZGVsIH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1lbnRSZWZlcmVuY2VMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxJQ2hhdFdpZGdldCwgRGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWVudE1vZGVsTGlzdGVuZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8SUJyb3dzZXJWaWV3TW9kZWwsIERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2VkQ29tbWVudE1vZGVscyA9IG5ldyBXZWFrU2V0PElCcm93c2VyVmlld01vZGVsPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50U2Vzc2lvbnNXaXRoQ29tbWVudHMgPSBuZXcgU2V0PElCcm93c2VyVmlld01vZGVsPigpO1xuXG5cdC8vIFNoYXJlIHdpdGggQWdlbnRcblx0cHJpdmF0ZSByZWFkb25seSBfc2hhcmVCdXR0b25Db250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaGFyZUJ1dHRvbjogQnV0dG9uO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogQnJvd3NlckVkaXRvcixcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJsZVZpZXdTZXJ2aWNlOiBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3IpO1xuXHRcdHRoaXMuX2VsZW1lbnRTZWxlY3Rpb25Nb2RlQ29udGV4dCA9IENPTlRFWFRfQlJPV1NFUl9FTEVNRU5UX1NFTEVDVElPTl9NT0RFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fYXJlYVNlbGVjdGlvbkFjdGl2ZUNvbnRleHQgPSBDT05URVhUX0JST1dTRVJfQVJFQV9TRUxFQ1RJT05fQUNUSVZFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHQvLyBCdWlsZCBzaGFyZSB0b2dnbGUgYnV0dG9uXG5cdFx0Y29uc3QgaG92ZXJEZWxlZ2F0ZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSxcblx0XHRcdCdlbGVtZW50Jyxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHsgcG9zaXRpb246IHsgaG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5BQk9WRSB9IH1cblx0XHQpKTtcblxuXHRcdHRoaXMuX3NoYXJlQnV0dG9uQ29udGFpbmVyID0gJCgnLmJyb3dzZXItc2hhcmUtdG9nZ2xlLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuX3NoYXJlQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0aGlzLl9zaGFyZUJ1dHRvbkNvbnRhaW5lciwge1xuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdicm93c2VyLnNoYXJlV2l0aEFnZW50JywgXCJTaGFyZSB3aXRoIEFnZW50XCIpLFxuXHRcdFx0c21hbGw6IHRydWUsXG5cdFx0XHRob3ZlckRlbGVnYXRlXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3NoYXJlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnYnJvd3Nlci1zaGFyZS10b2dnbGUnKTtcblx0XHR0aGlzLl9zaGFyZUJ1dHRvbi5sYWJlbCA9ICckKHNoYXJlLXdpbmRvdyknO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2hhcmVCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR0aGlzLl90b2dnbGVTaGFyZVdpdGhBZ2VudCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEF1dG8tZGlzYWJsZSBlbGVtZW50IHNlbGVjdGlvbiB3aGVuIHRoZSB1c2VyIHNlbmRzIGEgY2hhdCByZXF1ZXN0LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFNlcnZpY2Uub25EaWRTdWJtaXRSZXF1ZXN0KGV2ZW50ID0+IHtcblx0XHRcdGlmICh0aGlzLmVkaXRvci5tb2RlbD8uZWxlbWVudFNlbGVjdGlvblN0YXRlLmFjdGl2ZSkge1xuXHRcdFx0XHR2b2lkIHRoaXMuZWRpdG9yLm1vZGVsLnRvZ2dsZUVsZW1lbnRTZWxlY3Rpb24oZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3VibWl0dGVkQ29tbWVudHMgPSBbLi4udGhpcy5fY29tbWVudFJlZmVyZW5jZXNdXG5cdFx0XHRcdC5maWx0ZXIoKFssIHJlZmVyZW5jZV0pID0+IHJlZmVyZW5jZS53aWRnZXQudmlld01vZGVsICYmIGlzRXF1YWwocmVmZXJlbmNlLndpZGdldC52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlLCBldmVudC5jaGF0U2Vzc2lvblJlc291cmNlKSk7XG5cdFx0XHRpZiAoc3VibWl0dGVkQ29tbWVudHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBicm93c2VyTW9kZWxzID0gbmV3IFNldChzdWJtaXR0ZWRDb21tZW50cy5tYXAoKFssIHJlZmVyZW5jZV0pID0+IHJlZmVyZW5jZS5icm93c2VyTW9kZWwpKTtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0cyA9IG5ldyBTZXQoc3VibWl0dGVkQ29tbWVudHMubWFwKChbLCByZWZlcmVuY2VdKSA9PiByZWZlcmVuY2Uud2lkZ2V0KSk7XG5cdFx0XHRcdGZvciAoY29uc3QgW2F0dGFjaG1lbnRJZF0gb2Ygc3VibWl0dGVkQ29tbWVudHMpIHtcblx0XHRcdFx0XHR0aGlzLl9jb21tZW50UmVmZXJlbmNlcy5kZWxldGUoYXR0YWNobWVudElkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB3aWRnZXRzKSB7XG5cdFx0XHRcdFx0dGhpcy5fZGlzcG9zZUNvbW1lbnRSZWZlcmVuY2VMaXN0ZW5lcklmVW51c2VkKHdpZGdldCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBicm93c2VyTW9kZWwgb2YgYnJvd3Nlck1vZGVscykge1xuXHRcdFx0XHRcdHRoaXMuX3N5bmNFbGVtZW50Q29tbWVudHMoYnJvd3Nlck1vZGVsKTtcblx0XHRcdFx0XHR0aGlzLl9kaXNwb3NlQ29tbWVudE1vZGVsTGlzdGVuZXJJZlVudXNlZChicm93c2VyTW9kZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHdpZGdldHMoKTogcmVhZG9ubHkgSUJyb3dzZXJFZGl0b3JXaWRnZXRbXSB7XG5cdFx0cmV0dXJuIFt7IGxvY2F0aW9uOiBCcm93c2VyV2lkZ2V0TG9jYXRpb24uUG9zdFVybCwgZWxlbWVudDogdGhpcy5fc2hhcmVCdXR0b25Db250YWluZXIsIG9yZGVyOiA1MCB9XTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbk1vZGVsQXR0YWNoZWQobW9kZWw6IElCcm93c2VyVmlld01vZGVsLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0Ly8gTWFuYWdlIHNoYXJpbmcgc3RhdGVcblx0XHR0aGlzLl91cGRhdGVTaGFyaW5nU3RhdGUodHJ1ZSk7XG5cdFx0c3RvcmUuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlU2hhcmluZ1N0YXRlKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVNoYXJpbmdTdGF0ZShmYWxzZSk7XG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZChtb2RlbC5vbkRpZFNlbGVjdEVsZW1lbnQoYXN5bmMgZGF0YSA9PiB7XG5cdFx0XHRjb25zdCB0cmFja3NDb21tZW50ID0gZGF0YS5jb21tZW50ICE9PSB1bmRlZmluZWQgJiYgZGF0YS5lbGVtZW50SWQgIT09IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0cmFja3NDb21tZW50KSB7XG5cdFx0XHRcdHRoaXMuX2Vuc3VyZUNvbW1lbnRNb2RlbExpc3RlbmVycyhtb2RlbCk7XG5cdFx0XHR9XG5cdFx0XHRsZXQgYXR0YWNoZWQgPSBmYWxzZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF0dGFjaGVkID0gYXdhaXQgdGhpcy5fYXR0YWNoRWxlbWVudERhdGFUb0NoYXQoZGF0YSwgbW9kZWwpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdCcm93c2VyRWRpdG9yLmFkZEVsZW1lbnRUb0NoYXQ6IEZhaWxlZCB0byBhdHRhY2ggZWxlbWVudCcsIGVycm9yKTtcblx0XHRcdH1cblx0XHRcdGlmICghYXR0YWNoZWQgJiYgZGF0YS5jb21tZW50ICE9PSB1bmRlZmluZWQgJiYgZGF0YS5lbGVtZW50SWQgJiYgIXRoaXMuX2Rpc3Bvc2VkQ29tbWVudE1vZGVscy5oYXMobW9kZWwpKSB7XG5cdFx0XHRcdHRoaXMuX3N5bmNFbGVtZW50Q29tbWVudHMobW9kZWwsIFtkYXRhLmVsZW1lbnRJZF0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRyYWNrc0NvbW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fZGlzcG9zZUNvbW1lbnRNb2RlbExpc3RlbmVySWZVbnVzZWQobW9kZWwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFN5bmMgY29udGV4dCBrZXkgd2l0aCBtb2RlbCBzdGF0ZVxuXHRcdHRoaXMuX2VsZW1lbnRTZWxlY3Rpb25Nb2RlID0gbW9kZWwuZWxlbWVudFNlbGVjdGlvblN0YXRlLmFjdGl2ZSA/IG1vZGVsLmVsZW1lbnRTZWxlY3Rpb25TdGF0ZS5vcHRpb25zLm1vZGUgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZWxlbWVudFNlbGVjdGlvbk1vZGVDb250ZXh0LnNldCh0aGlzLl9lbGVtZW50U2VsZWN0aW9uTW9kZSk7XG5cdFx0c3RvcmUuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlRWxlbWVudFNlbGVjdGlvblN0YXRlKHN0YXRlID0+IHtcblx0XHRcdGNvbnN0IHdhc0NvbW1lbnRpbmcgPSB0aGlzLl9lbGVtZW50U2VsZWN0aW9uTW9kZSA9PT0gQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25Nb2RlLkNvbW1lbnQ7XG5cdFx0XHR0aGlzLl9lbGVtZW50U2VsZWN0aW9uTW9kZSA9IHN0YXRlLmFjdGl2ZSA/IHN0YXRlLm9wdGlvbnMubW9kZSA6IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2VsZW1lbnRTZWxlY3Rpb25Nb2RlQ29udGV4dC5zZXQodGhpcy5fZWxlbWVudFNlbGVjdGlvbk1vZGUpO1xuXHRcdFx0Y29uc3QgaXNDb21tZW50aW5nID0gdGhpcy5fZWxlbWVudFNlbGVjdGlvbk1vZGUgPT09IEJyb3dzZXJFbGVtZW50U2VsZWN0aW9uTW9kZS5Db21tZW50O1xuXHRcdFx0Y29uc3QgYWNjZXNzaWJpbGl0eUhlbHBIaW50ID0gaXNDb21tZW50aW5nICYmIHN0YXRlLmFjdGl2ZVxuXHRcdFx0XHQ/IHRoaXMuYWNjZXNzaWJsZVZpZXdTZXJ2aWNlLmdldE9wZW5BcmlhSGludChBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkJyb3dzZXJFbGVtZW50Q29tbWVudGluZylcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLnN0YXR1cyhpc0NvbW1lbnRpbmdcblx0XHRcdFx0PyBzdGF0ZS5hY3RpdmVcblx0XHRcdFx0XHQ/IGFjY2Vzc2liaWxpdHlIZWxwSGludFxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnYnJvd3Nlci5lbGVtZW50Q29tbWVudGluZ0VuYWJsZWRXaXRoQWNjZXNzaWJpbGl0eUhlbHAnLCBcIkVsZW1lbnQgY29tbWVudGluZyBlbmFibGVkLiBQcmVzcyBFbnRlciB0byBjb21tZW50IG9uIHRoZSBmb2N1c2VkIGVsZW1lbnQuIHswfVwiLCBhY2Nlc3NpYmlsaXR5SGVscEhpbnQpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdicm93c2VyLmVsZW1lbnRDb21tZW50aW5nRW5hYmxlZCcsIFwiRWxlbWVudCBjb21tZW50aW5nIGVuYWJsZWQuIFByZXNzIEVudGVyIHRvIGNvbW1lbnQgb24gdGhlIGZvY3VzZWQgZWxlbWVudC5cIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdicm93c2VyLmVsZW1lbnRDb21tZW50aW5nRGlzYWJsZWQnLCBcIkVsZW1lbnQgY29tbWVudGluZyBkaXNhYmxlZC5cIilcblx0XHRcdFx0OiBzdGF0ZS5hY3RpdmVcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdicm93c2VyLmVsZW1lbnRTZWxlY3Rpb25FbmFibGVkJywgXCJFbGVtZW50IHNlbGVjdGlvbiBlbmFibGVkLiBQcmVzcyBFbnRlciB0byBhZGQgdGhlIGZvY3VzZWQgZWxlbWVudCB0byBjaGF0LlwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2Jyb3dzZXIuZWxlbWVudFNlbGVjdGlvbkRpc2FibGVkJywgXCJFbGVtZW50IHNlbGVjdGlvbiBkaXNhYmxlZC5cIikpO1xuXHRcdFx0aWYgKGlzQ29tbWVudGluZyAmJiAhd2FzQ29tbWVudGluZykge1xuXHRcdFx0XHR0aGlzLl9jb21tZW50U2Vzc2lvbnNXaXRoQ29tbWVudHMuZGVsZXRlKG1vZGVsKTtcblx0XHRcdH0gZWxzZSBpZiAod2FzQ29tbWVudGluZyAmJiAhaXNDb21tZW50aW5nICYmIHRoaXMuX2NvbW1lbnRTZXNzaW9uc1dpdGhDb21tZW50cy5kZWxldGUobW9kZWwpKSB7XG5cdFx0XHRcdHRoaXMuX2ZvY3VzQ2hhdElucHV0Rm9yQ29tbWVudHMobW9kZWwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9hcmVhU2VsZWN0aW9uQWN0aXZlQ29udGV4dC5zZXQobW9kZWwuaXNBcmVhU2VsZWN0aW9uQWN0aXZlKTtcblx0XHRzdG9yZS5hZGQobW9kZWwub25EaWRDaGFuZ2VBcmVhU2VsZWN0aW9uQWN0aXZlKGFjdGl2ZSA9PiB7XG5cdFx0XHR0aGlzLl9hcmVhU2VsZWN0aW9uQWN0aXZlQ29udGV4dC5zZXQoYWN0aXZlKTtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBvbk1vZGVsRGV0YWNoZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZWRpdG9yLm1vZGVsKSB7XG5cdFx0XHR0aGlzLl9jb21tZW50U2Vzc2lvbnNXaXRoQ29tbWVudHMuZGVsZXRlKHRoaXMuZWRpdG9yLm1vZGVsKTtcblx0XHR9XG5cdFx0dGhpcy5fZWxlbWVudFNlbGVjdGlvbk1vZGVDb250ZXh0LnJlc2V0KCk7XG5cdFx0dGhpcy5fZWxlbWVudFNlbGVjdGlvbk1vZGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fYXJlYVNlbGVjdGlvbkFjdGl2ZUNvbnRleHQucmVzZXQoKTtcblx0fVxuXG5cdC8vIC0tIFNoYXJpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX3RvZ2dsZVNoYXJlV2l0aEFnZW50KCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IubW9kZWw7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRtb2RlbC5zZXRTaGFyZWRXaXRoQWdlbnQobW9kZWwuc2hhcmluZ1N0YXRlICE9PSBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5TaGFyZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU2hhcmluZ1N0YXRlKGlzSW5pdGlhbFN0YXRlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5tb2RlbDtcblx0XHRjb25zdCBpc1NoYXJlZCA9IG1vZGVsPy5zaGFyaW5nU3RhdGUgPT09IEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLlNoYXJlZDtcblx0XHRjb25zdCBpc1VuYXZhaWxhYmxlID0gIW1vZGVsIHx8IG1vZGVsLnNoYXJpbmdTdGF0ZSA9PT0gQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUuVW5hdmFpbGFibGU7XG5cblx0XHR0aGlzLmVkaXRvci5icm93c2VyQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2FuaW1hdGUnLCAhaXNJbml0aWFsU3RhdGUpO1xuXHRcdHRoaXMuZWRpdG9yLmJyb3dzZXJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2hhcmVkJywgaXNTaGFyZWQpO1xuXG5cdFx0dGhpcy5fc2hhcmVCdXR0b25Db250YWluZXIuc3R5bGUuZGlzcGxheSA9IGlzVW5hdmFpbGFibGUgPyAnbm9uZScgOiAnJztcblx0XHR0aGlzLl9zaGFyZUJ1dHRvbi5jaGVja2VkID0gaXNTaGFyZWQ7XG5cdFx0dGhpcy5fc2hhcmVCdXR0b24ubGFiZWwgPSBpc1NoYXJlZFxuXHRcdFx0PyBsb2NhbGl6ZSgnYnJvd3Nlci5zaGFyaW5nV2l0aEFnZW50JywgXCJTaGFyaW5nIHdpdGggQWdlbnRcIikgKyAnICQoc2hhcmUtd2luZG93KSdcblx0XHRcdDogJyQoc2hhcmUtd2luZG93KSc7XG5cblx0XHRjb25zdCB0aXRsZSA9IGlzU2hhcmVkXG5cdFx0XHQ/IGxvY2FsaXplKCdicm93c2VyLnVuc2hhcmVXaXRoQWdlbnQnLCBcIlN0b3AgU2hhcmluZyB3aXRoIEFnZW50XCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdicm93c2VyLnNoYXJlV2l0aEFnZW50JywgXCJTaGFyZSB3aXRoIEFnZW50XCIpO1xuXHRcdHRoaXMuX3NoYXJlQnV0dG9uLnNldFRpdGxlKHRpdGxlKTtcblx0XHR0aGlzLl9zaGFyZUJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRpdGxlKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNIQVJJTkdfQ09OVEVOVF9XQVJOSU5HX0RPTlRfQVNLX0tFWSA9ICdicm93c2VyVmlldy5hZ2VudFNoYXJpbmdDb250ZW50V2FybmluZy5kb250QXNrQWdhaW4nO1xuXG5cdC8qKlxuXHQgKiBDb25maXJtIHdpdGggdGhlIHVzZXIgdGhhdCB0aGV5IHVuZGVyc3RhbmQgdGhlIHJpc2tzIG9mIHNoYXJpbmcgY29udGVudCBvbiB1bnRydXN0ZWQgcGFnZXMuXG5cdCAqXG5cdCAqIEByZXR1cm5zIHRydWUgaWYgdGhlIHVzZXIgY29uZmlybXMgKG9yIHRoZSBwYWdlIGlzIGxvY2FsIC8gdHJ1c3RlZCksIGZhbHNlIGlmIHRoZXkgY2FuY2VsLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfY29uZmlybUNvbnRlbnRBdHRhY2htZW50Umlzayh1cmw6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdC8vIElmIHRoZSB1c2VyIHByZXZpb3VzbHkgY2hvc2UgXCJEb24ndCBzaG93IGFnYWluXCIsIHNraXAgdGhlIGRpYWxvZ1xuXHRcdGlmICh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oQnJvd3NlckVkaXRvckNoYXRJbnRlZ3JhdGlvbi5TSEFSSU5HX0NPTlRFTlRfV0FSTklOR19ET05UX0FTS19LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZFVybCA9IG5ldyBVUkwodXJsKTtcblx0XHRcdGlmIChwYXJzZWRVcmwucHJvdG9jb2wgPT09ICdmaWxlOicpIHtcblx0XHRcdFx0Ly8gUXVlcnkgdGhlIHdvcmtzcGFjZSB0cnVzdCBzZXJ2aWNlIGZvciBmaWxlIFVSTHNcblx0XHRcdFx0Y29uc3QgdHJ1c3RJbmZvID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmdldFVyaVRydXN0SW5mbyhVUkkuZmlsZShwYXJzZWRVcmwucGF0aG5hbWUpKTtcblx0XHRcdFx0aWYgKHRydXN0SW5mby50cnVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAocGFyc2VkVXJsLmhvc3RuYW1lID09PSAnbG9jYWxob3N0JyB8fCBwYXJzZWRVcmwuaG9zdG5hbWUgPT09ICcxMjcuMC4wLjEnIHx8IHBhcnNlZFVybC5ob3N0bmFtZSA9PT0gJzo6MScpIHtcblx0XHRcdFx0Ly8gQ29uc2lkZXIgbG9jYWxob3N0IFVSTHMgdHJ1c3RlZFxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIEludmFsaWQgVVJMIC0gZmFsbCB0aHJvdWdoIHRvIHRoZSB3YXJuaW5nXG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2Jyb3dzZXIuYWdlbnRTaGFyaW5nQ29udGVudFdhcm5pbmcubWVzc2FnZScsIFwiVXNlIGNhdXRpb24gd2hlbiBhdHRhY2hpbmcgY29udGVudCBmcm9tIHVudHJ1c3RlZCBzb3VyY2VzLlwiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2Jyb3dzZXIuYWdlbnRTaGFyaW5nQ29udGVudFdhcm5pbmcuZGV0YWlsJywgXCJQYWdlcyBtYXkgY29udGFpbiBoaWRkZW4gcHJvbXB0cyB0aGF0IGNhbiBpbmZsdWVuY2UgYWdlbnQgYmVoYXZpb3IuIERvdWJsZS1jaGVjayB0aGUgYXR0YWNoZWQgY29udGVudHMgYmVmb3JlIHNlbmRpbmcuXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ2Jyb3dzZXIuYWdlbnRTaGFyaW5nQ29udGVudFdhcm5pbmcub2snLCBcIiYmT0tcIiksXG5cdFx0XHRjaGVja2JveDogeyBsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIuYWdlbnRTaGFyaW5nQ29udGVudFdhcm5pbmcuZG9udFNob3dBZ2FpbicsIFwiRG9uJ3Qgc2hvdyBhZ2FpblwiKSwgY2hlY2tlZDogZmFsc2UgfSxcblx0XHR9KTtcblxuXHRcdGlmIChyZXN1bHQuY29uZmlybWVkICYmIHJlc3VsdC5jaGVja2JveENoZWNrZWQpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQnJvd3NlckVkaXRvckNoYXRJbnRlZ3JhdGlvbi5TSEFSSU5HX0NPTlRFTlRfV0FSTklOR19ET05UX0FTS19LRVksIHRydWUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQuY29uZmlybWVkO1xuXHR9XG5cblx0Ly8gLS0gQ2hhdCB3aWRnZXQgaGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBSZXZlYWwgdGhlIGNoYXQgd2lkZ2V0IGFuZCB3YWl0IGZvciBpdHMgdmlld01vZGVsIHRvIGJlIGJvdW5kIGJlZm9yZVxuXHQgKiByZXR1cm5pbmcuIFdoZW4gdGhlIGNoYXQgcGFuZWwgaXMgb3BlbmVkIGZvciB0aGUgZmlyc3QgdGltZSB0aGUgc2Vzc2lvblxuXHQgKiBtb2RlbCBsb2FkcyBhc3luY2hyb25vdXNseSwgYW5kIG9uY2UgaXQgbG9hZHMge0BsaW5rIENoYXRJbnB1dFBhcnR9J3Ncblx0ICogYF9zeW5jRnJvbU1vZGVsYCBjbGVhcnMgYW55IGF0dGFjaG1lbnRzIHRoYXQgd2VyZSBhZGRlZCBiZWZvcmUgdGhlIG1vZGVsXG5cdCAqIHdhcyBib3VuZC4gQ2FsbGVycyBtdXN0IHVzZSB0aGlzIGhlbHBlciBiZWZvcmUgY2FsbGluZ1xuXHQgKiB7QGxpbmtjb2RlIElDaGF0V2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0fSBzbyB0aGUgYXR0YWNobWVudCBpc1xuXHQgKiBub3Qgc2lsZW50bHkgZGlzY2FyZGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmV2ZWFsQ2hhdFdpZGdldEZvckF0dGFjaG1lbnQocHJlc2VydmVGb2N1cyA9IGZhbHNlKTogUHJvbWlzZTxJQ2hhdFdpZGdldCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGF3YWl0IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UucmV2ZWFsV2lkZ2V0KHByZXNlcnZlRm9jdXMpID8/IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKHdpZGdldCAmJiAhd2lkZ2V0LnZpZXdNb2RlbCkge1xuXHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHdpZGdldC5vbkRpZENoYW5nZVZpZXdNb2RlbCk7XG5cdFx0fVxuXHRcdHJldHVybiB3aWRnZXQ7XG5cdH1cblxuXHQvKipcblx0ICogUmV2ZWFsIHRoZSBjaGF0IHdpZGdldCBhbmQgYXR0YWNoIHRoZSBnaXZlbiBlbnRyaWVzLiBSZXR1cm5zIGZhbHNlIGlmIG5vIHdpZGdldCB3YXMgYXZhaWxhYmxlLlxuXHQgKiBDYWxsZXJzIGFyZSByZXNwb25zaWJsZSBmb3IgcnVubmluZyB7QGxpbmsgX2NvbmZpcm1Db250ZW50QXR0YWNobWVudFJpc2t9IGZpcnN0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYXR0YWNoVG9DaGF0KGVudHJpZXM6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGF3YWl0IHRoaXMuX3JldmVhbENoYXRXaWRnZXRGb3JBdHRhY2htZW50KCk7XG5cdFx0aWYgKCF3aWRnZXQ/LmF0dGFjaG1lbnRNb2RlbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoLi4uZW50cmllcyk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyAtLSBFbGVtZW50IFNlbGVjdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBhc3luYyBfYXR0YWNoRWxlbWVudERhdGFUb0NoYXQoZWxlbWVudERhdGE6IElFbGVtZW50RGF0YSwgbW9kZWw6IElCcm93c2VyVmlld01vZGVsKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgYm91bmRzID0gZWxlbWVudERhdGEuYm91bmRzO1xuXHRcdGNvbnN0IHRvQXR0YWNoOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHNhZmVTZXRJbm5lckh0bWwoY29udGFpbmVyLCBlbGVtZW50RGF0YS5vdXRlckhUTUwpO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBjb250YWluZXIuZmlyc3RFbGVtZW50Q2hpbGQ7XG5cdFx0Y29uc3QgaW5uZXJUZXh0ID0gY29udGFpbmVyLnRleHRDb250ZW50O1xuXG5cdFx0bGV0IGRpc3BsYXlOYW1lU2hvcnQgPSBlbGVtZW50ID8gYCR7ZWxlbWVudC50YWdOYW1lLnRvTG93ZXJDYXNlKCl9JHtlbGVtZW50LmlkID8gYCMke2VsZW1lbnQuaWR9YCA6ICcnfWAgOiAnJztcblx0XHRsZXQgZGlzcGxheU5hbWVGdWxsID0gZWxlbWVudCA/IGAke2Rpc3BsYXlOYW1lU2hvcnR9JHtlbGVtZW50LmNsYXNzTGlzdC5sZW5ndGggPyBgLiR7Wy4uLmVsZW1lbnQuY2xhc3NMaXN0XS5qb2luKCcuJyl9YCA6ICcnfWAgOiAnJztcblx0XHRpZiAoZWxlbWVudERhdGEuYW5jZXN0b3JzICYmIGVsZW1lbnREYXRhLmFuY2VzdG9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRsZXQgbGFzdCA9IGVsZW1lbnREYXRhLmFuY2VzdG9yc1tlbGVtZW50RGF0YS5hbmNlc3RvcnMubGVuZ3RoIC0gMV07XG5cdFx0XHRsZXQgcHNldWRvID0gJyc7XG5cdFx0XHRpZiAobGFzdC50YWdOYW1lLnN0YXJ0c1dpdGgoJzo6JykgJiYgZWxlbWVudERhdGEuYW5jZXN0b3JzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0cHNldWRvID0gbGFzdC50YWdOYW1lO1xuXHRcdFx0XHRsYXN0ID0gZWxlbWVudERhdGEuYW5jZXN0b3JzW2VsZW1lbnREYXRhLmFuY2VzdG9ycy5sZW5ndGggLSAyXTtcblx0XHRcdH1cblx0XHRcdGRpc3BsYXlOYW1lU2hvcnQgPSBgJHtsYXN0LnRhZ05hbWUudG9Mb3dlckNhc2UoKX0ke2xhc3QuaWQgPyBgIyR7bGFzdC5pZH1gIDogJyd9JHtwc2V1ZG99YDtcblx0XHRcdGRpc3BsYXlOYW1lRnVsbCA9IGAke2xhc3QudGFnTmFtZS50b0xvd2VyQ2FzZSgpfSR7bGFzdC5pZCA/IGAjJHtsYXN0LmlkfWAgOiAnJ30ke2xhc3QuY2xhc3NOYW1lcyAmJiBsYXN0LmNsYXNzTmFtZXMubGVuZ3RoID8gYC4ke2xhc3QuY2xhc3NOYW1lcy5qb2luKCcuJyl9YCA6ICcnfSR7cHNldWRvfWA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFsdWUgPSBjcmVhdGVFbGVtZW50Q29udGV4dFZhbHVlKGVsZW1lbnREYXRhLCBkaXNwbGF5TmFtZUZ1bGwpO1xuXHRcdGNvbnN0IGF0dGFjaEltYWdlcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQnJvd3NlclNlbmRFbGVtZW50c1RvQ2hhdEF0dGFjaEltYWdlc1NldHRpbmdJZCk7XG5cdFx0Y29uc3Qgc2NyZWVuc2hvdEJ1ZmZlciA9IGF0dGFjaEltYWdlc1xuXHRcdFx0PyBhd2FpdCBtb2RlbC5jYXB0dXJlU2NyZWVuc2hvdCh7XG5cdFx0XHRcdHF1YWxpdHk6IDkwLFxuXHRcdFx0XHRwYWdlUmVjdDogYm91bmRzXG5cdFx0XHR9KVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBlbGVtZW50RW50cnk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgPSB7XG5cdFx0XHRpZDogJ2VsZW1lbnQtJyArIERhdGUubm93KCksXG5cdFx0XHRuYW1lOiBkaXNwbGF5TmFtZVNob3J0LFxuXHRcdFx0ZnVsbE5hbWU6IGRpc3BsYXlOYW1lRnVsbCxcblx0XHRcdHZhbHVlOiB2YWx1ZSxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdTdHJ1Y3R1cmVkIGJyb3dzZXIgZWxlbWVudCBjb250ZXh0IHdpdGggSFRNTCBwYXRoLCBvdXRlciBIVE1MLCBkaW1lbnNpb25zLCBhbmQgY29tcHV0ZWQgc3R5bGVzLicsXG5cdFx0XHRraW5kOiAnZWxlbWVudCcsXG5cdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24ubGF5b3V0LmlkKSxcblx0XHRcdGFuY2VzdG9yczogZWxlbWVudERhdGEuYW5jZXN0b3JzLFxuXHRcdFx0YXR0cmlidXRlczogZWxlbWVudERhdGEuYXR0cmlidXRlcyxcblx0XHRcdGNvbXB1dGVkU3R5bGVzOiBlbGVtZW50RGF0YS5jb21wdXRlZFN0eWxlcyxcblx0XHRcdGRpbWVuc2lvbnM6IGVsZW1lbnREYXRhLmRpbWVuc2lvbnMsXG5cdFx0XHRpbm5lclRleHQsXG5cdFx0XHRpbWFnZURhdGE6IHNjcmVlbnNob3RCdWZmZXI/LmJ1ZmZlcixcblx0XHRcdGltYWdlTWltZVR5cGU6IHNjcmVlbnNob3RCdWZmZXIgPyAnaW1hZ2UvanBlZycgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHR0b0F0dGFjaC5wdXNoKGVsZW1lbnRFbnRyeSk7XG5cblx0XHRpZiAoIWF3YWl0IHRoaXMuX2NvbmZpcm1Db250ZW50QXR0YWNobWVudFJpc2soZWxlbWVudERhdGEudXJsID8/IG1vZGVsLnVybCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYXdhaXQgdGhpcy5fcmV2ZWFsQ2hhdFdpZGdldEZvckF0dGFjaG1lbnQoZWxlbWVudERhdGEuY29tbWVudCAhPT0gdW5kZWZpbmVkKTtcblx0XHRpZiAoIXdpZGdldD8uYXR0YWNobWVudE1vZGVsIHx8IHRoaXMuX2Rpc3Bvc2VkQ29tbWVudE1vZGVscy5oYXMobW9kZWwpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dCguLi50b0F0dGFjaCk7XG5cdFx0aWYgKGVsZW1lbnREYXRhLmNvbW1lbnQgIT09IHVuZGVmaW5lZCAmJiBlbGVtZW50RGF0YS5lbGVtZW50SWQpIHtcblx0XHRcdGlmICghdGhpcy5faW5zZXJ0RWxlbWVudENvbW1lbnRSZWZlcmVuY2Uod2lkZ2V0LCBtb2RlbCwgZWxlbWVudEVudHJ5LCB0b0F0dGFjaC5tYXAoYXR0YWNobWVudCA9PiBhdHRhY2htZW50LmlkKSwgZWxlbWVudERhdGEuZWxlbWVudElkLCBlbGVtZW50RGF0YS5jb21tZW50KSkge1xuXHRcdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmRlbGV0ZSguLi50b0F0dGFjaC5tYXAoYXR0YWNobWVudCA9PiBhdHRhY2htZW50LmlkKSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChtb2RlbC5lbGVtZW50U2VsZWN0aW9uU3RhdGUuYWN0aXZlKSB7XG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRTZXNzaW9uc1dpdGhDb21tZW50cy5hZGQobW9kZWwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0d2lkZ2V0LmZvY3VzSW5wdXQoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0eXBlIEludGVncmF0ZWRCcm93c2VyQWRkRWxlbWVudFRvQ2hhdEFkZGVkRXZlbnQgPSB7XG5cdFx0XHRhdHRhY2hJbWFnZXM6IGJvb2xlYW47XG5cdFx0fTtcblxuXHRcdHR5cGUgSW50ZWdyYXRlZEJyb3dzZXJBZGRFbGVtZW50VG9DaGF0QWRkZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdGF0dGFjaEltYWdlczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgd29ya2JlbmNoLmJyb3dzZXIuc2VuZEVsZW1lbnRzVG9DaGF0LmF0dGFjaEltYWdlcyB3YXMgZW5hYmxlZC4nIH07XG5cdFx0XHRvd25lcjogJ2pydWFsZXMnO1xuXHRcdFx0Y29tbWVudDogJ0FuIGVsZW1lbnQgd2FzIHN1Y2Nlc3NmdWxseSBhZGRlZCB0byBjaGF0IGZyb20gSW50ZWdyYXRlZCBCcm93c2VyLic7XG5cdFx0fTtcblxuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEludGVncmF0ZWRCcm93c2VyQWRkRWxlbWVudFRvQ2hhdEFkZGVkRXZlbnQsIEludGVncmF0ZWRCcm93c2VyQWRkRWxlbWVudFRvQ2hhdEFkZGVkQ2xhc3NpZmljYXRpb24+KCdpbnRlZ3JhdGVkQnJvd3Nlci5hZGRFbGVtZW50VG9DaGF0LmFkZGVkJywge1xuXHRcdFx0YXR0YWNoSW1hZ2VzXG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9pbnNlcnRFbGVtZW50Q29tbWVudFJlZmVyZW5jZSh3aWRnZXQ6IElDaGF0V2lkZ2V0LCBicm93c2VyTW9kZWw6IElCcm93c2VyVmlld01vZGVsLCBhdHRhY2htZW50OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBhdHRhY2htZW50SWRzOiByZWFkb25seSBzdHJpbmdbXSwgZWxlbWVudElkOiBzdHJpbmcsIGNvbW1lbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGlucHV0TW9kZWwgPSB3aWRnZXQuaW5wdXRFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBkeW5hbWljVmFyaWFibGVNb2RlbCA9IHdpZGdldC5nZXRDb250cmliPENoYXREeW5hbWljVmFyaWFibGVNb2RlbD4oQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsLklEKTtcblx0XHRpZiAoIWlucHV0TW9kZWwgfHwgIWR5bmFtaWNWYXJpYWJsZU1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zZXJ0aW9uUG9zaXRpb24gPSB3aWRnZXQuaW5wdXRFZGl0b3IuZ2V0UG9zaXRpb24oKSA/PyBpbnB1dE1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCkuZ2V0RW5kUG9zaXRpb24oKTtcblx0XHRjb25zdCBwcmVmaXggPSBpbnNlcnRpb25Qb3NpdGlvbi5jb2x1bW4gPiAxID8gJ1xcbicgOiAnJztcblx0XHRjb25zdCBzdWZmaXggPSBpbnNlcnRpb25Qb3NpdGlvbi5jb2x1bW4gPCBpbnB1dE1vZGVsLmdldExpbmVNYXhDb2x1bW4oaW5zZXJ0aW9uUG9zaXRpb24ubGluZU51bWJlcikgPyAnXFxuJyA6ICcnO1xuXHRcdGNvbnN0IHJlZmVyZW5jZSA9IGBAJHthdHRhY2htZW50Lm5hbWV9YDtcblx0XHRjb25zdCBjb21tZW50VGV4dCA9IGNvbW1lbnQgPyBgICR7Y29tbWVudH1gIDogJyc7XG5cdFx0Y29uc3QgdGV4dCA9IGAke3ByZWZpeH0ke3JlZmVyZW5jZX0ke2NvbW1lbnRUZXh0fSR7c3VmZml4fWA7XG5cdFx0aWYgKCF3aWRnZXQuaW5wdXRFZGl0b3IuZXhlY3V0ZUVkaXRzKCdicm93c2VyRWxlbWVudENvbW1lbnQnLCBbeyByYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyhpbnNlcnRpb25Qb3NpdGlvbiksIHRleHQgfV0pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHJlZmVyZW5jZVN0YXJ0ID0gcHJlZml4ID8geyBsaW5lTnVtYmVyOiBpbnNlcnRpb25Qb3NpdGlvbi5saW5lTnVtYmVyICsgMSwgY29sdW1uOiAxIH0gOiBpbnNlcnRpb25Qb3NpdGlvbjtcblx0XHRjb25zdCByZWZlcmVuY2VSYW5nZSA9IG5ldyBSYW5nZShyZWZlcmVuY2VTdGFydC5saW5lTnVtYmVyLCByZWZlcmVuY2VTdGFydC5jb2x1bW4sIHJlZmVyZW5jZVN0YXJ0LmxpbmVOdW1iZXIsIHJlZmVyZW5jZVN0YXJ0LmNvbHVtbiArIHJlZmVyZW5jZS5sZW5ndGgpO1xuXHRcdGR5bmFtaWNWYXJpYWJsZU1vZGVsLmFkZFJlZmVyZW5jZSh0b0F0dGFjaGVkQ29udGV4dER5bmFtaWNWYXJpYWJsZShhdHRhY2htZW50LCByZWZlcmVuY2VSYW5nZSkpO1xuXHRcdHdpZGdldC5pbnB1dEVkaXRvci5zZXRQb3NpdGlvbih7XG5cdFx0XHRsaW5lTnVtYmVyOiByZWZlcmVuY2VSYW5nZS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0Y29sdW1uOiByZWZlcmVuY2VSYW5nZS5lbmRDb2x1bW4gKyBjb21tZW50VGV4dC5sZW5ndGhcblx0XHR9KTtcblxuXHRcdHRoaXMuX2NvbW1lbnRSZWZlcmVuY2VzLnNldChhdHRhY2htZW50LmlkLCB7IGVsZW1lbnRJZCwgYXR0YWNobWVudElkcywgd2lkZ2V0LCBicm93c2VyTW9kZWwgfSk7XG5cdFx0dGhpcy5fZW5zdXJlQ29tbWVudFJlZmVyZW5jZUxpc3RlbmVycyh3aWRnZXQsIGR5bmFtaWNWYXJpYWJsZU1vZGVsKTtcblx0XHR0aGlzLl9lbnN1cmVDb21tZW50TW9kZWxMaXN0ZW5lcnMoYnJvd3Nlck1vZGVsKTtcblx0XHR0aGlzLl9zeW5jRWxlbWVudENvbW1lbnRzKGJyb3dzZXJNb2RlbCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVDb21tZW50UmVmZXJlbmNlTGlzdGVuZXJzKHdpZGdldDogSUNoYXRXaWRnZXQsIGR5bmFtaWNWYXJpYWJsZU1vZGVsOiBDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29tbWVudFJlZmVyZW5jZUxpc3RlbmVycy5oYXMod2lkZ2V0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQoZHluYW1pY1ZhcmlhYmxlTW9kZWwub25EaWRDaGFuZ2VSZWZlcmVuY2VzKCgpID0+IHRoaXMuX3N5bmNFbGVtZW50Q29tbWVudHNGb3JXaWRnZXQod2lkZ2V0KSkpO1xuXHRcdHN0b3JlLmFkZCh3aWRnZXQuaW5wdXRFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4gdGhpcy5fc3luY0VsZW1lbnRDb21tZW50c0ZvcldpZGdldCh3aWRnZXQpKSk7XG5cdFx0c3RvcmUuYWRkKHdpZGdldC5hdHRhY2htZW50TW9kZWwub25EaWRDaGFuZ2UoZXZlbnQgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBbYXR0YWNobWVudElkLCB0cmFja2VkXSBvZiB0aGlzLl9jb21tZW50UmVmZXJlbmNlcykge1xuXHRcdFx0XHRpZiAodHJhY2tlZC53aWRnZXQgPT09IHdpZGdldCAmJiBldmVudC5kZWxldGVkLmluY2x1ZGVzKGF0dGFjaG1lbnRJZCkpIHtcblx0XHRcdFx0XHR0aGlzLl9yZW1vdmVFbGVtZW50Q29tbWVudFJlZmVyZW5jZSh0cmFja2VkLmJyb3dzZXJNb2RlbCwgdHJhY2tlZC5lbGVtZW50SWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2NvbW1lbnRSZWZlcmVuY2VMaXN0ZW5lcnMuc2V0KHdpZGdldCwgc3RvcmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlQ29tbWVudE1vZGVsTGlzdGVuZXJzKGJyb3dzZXJNb2RlbDogSUJyb3dzZXJWaWV3TW9kZWwpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29tbWVudE1vZGVsTGlzdGVuZXJzLmhhcyhicm93c2VyTW9kZWwpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChicm93c2VyTW9kZWwub25EaWRSZW1vdmVFbGVtZW50Q29tbWVudChlbGVtZW50SWQgPT4gdGhpcy5fcmVtb3ZlRWxlbWVudENvbW1lbnRSZWZlcmVuY2UoYnJvd3Nlck1vZGVsLCBlbGVtZW50SWQpKSk7XG5cdFx0c3RvcmUuYWRkKGJyb3dzZXJNb2RlbC5vbkRpZE5hdmlnYXRlKCgpID0+IHRoaXMuX2RldGFjaEVsZW1lbnRDb21tZW50UmVmZXJlbmNlcyhicm93c2VyTW9kZWwpKSk7XG5cdFx0c3RvcmUuYWRkKGJyb3dzZXJNb2RlbC5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdHRoaXMuX2Rpc3Bvc2VkQ29tbWVudE1vZGVscy5hZGQoYnJvd3Nlck1vZGVsKTtcblx0XHRcdHRoaXMuX2RldGFjaEVsZW1lbnRDb21tZW50UmVmZXJlbmNlcyhicm93c2VyTW9kZWwsIGZhbHNlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fY29tbWVudE1vZGVsTGlzdGVuZXJzLnNldChicm93c2VyTW9kZWwsIHN0b3JlKTtcblx0fVxuXG5cdHByaXZhdGUgX3N5bmNFbGVtZW50Q29tbWVudHNGb3JXaWRnZXQod2lkZ2V0OiBJQ2hhdFdpZGdldCk6IHZvaWQge1xuXHRcdGNvbnN0IGJyb3dzZXJNb2RlbHMgPSBuZXcgU2V0PElCcm93c2VyVmlld01vZGVsPigpO1xuXHRcdGZvciAoY29uc3QgcmVmZXJlbmNlIG9mIHRoaXMuX2NvbW1lbnRSZWZlcmVuY2VzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAocmVmZXJlbmNlLndpZGdldCA9PT0gd2lkZ2V0KSB7XG5cdFx0XHRcdGJyb3dzZXJNb2RlbHMuYWRkKHJlZmVyZW5jZS5icm93c2VyTW9kZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGJyb3dzZXJNb2RlbCBvZiBicm93c2VyTW9kZWxzKSB7XG5cdFx0XHR0aGlzLl9zeW5jRWxlbWVudENvbW1lbnRzKGJyb3dzZXJNb2RlbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3luY0VsZW1lbnRDb21tZW50cyhicm93c2VyTW9kZWw6IElCcm93c2VyVmlld01vZGVsLCBwZW5kaW5nQ29tbWVudElkc1RvRGlzY2FyZD86IHJlYWRvbmx5IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tbWVudHM6IHsgZWxlbWVudElkOiBzdHJpbmc7IGJvZHk6IHN0cmluZyB9W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFthdHRhY2htZW50SWQsIHRyYWNrZWRdIG9mIHRoaXMuX2NvbW1lbnRSZWZlcmVuY2VzKSB7XG5cdFx0XHRpZiAodHJhY2tlZC5icm93c2VyTW9kZWwgIT09IGJyb3dzZXJNb2RlbCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlucHV0TW9kZWwgPSB0cmFja2VkLndpZGdldC5pbnB1dEVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0Y29uc3QgZHluYW1pY1ZhcmlhYmxlTW9kZWwgPSB0cmFja2VkLndpZGdldC5nZXRDb250cmliPENoYXREeW5hbWljVmFyaWFibGVNb2RlbD4oQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsLklEKTtcblx0XHRcdGlmICghaW5wdXRNb2RlbCB8fCAhZHluYW1pY1ZhcmlhYmxlTW9kZWwpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB2YXJpYWJsZSA9IGR5bmFtaWNWYXJpYWJsZU1vZGVsLnZhcmlhYmxlcy5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuaWQgPT09IGF0dGFjaG1lbnRJZCAmJiBjYW5kaWRhdGUuaXNBdHRhY2htZW50UmVmZXJlbmNlKTtcblx0XHRcdGlmICghdmFyaWFibGUpIHtcblx0XHRcdFx0dGhpcy5fZGVsZXRlQ29tbWVudEF0dGFjaG1lbnRzKGF0dGFjaG1lbnRJZCwgdHJhY2tlZCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGluZSA9IGlucHV0TW9kZWwuZ2V0TGluZUNvbnRlbnQodmFyaWFibGUucmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0XHRjb21tZW50cy5wdXNoKHtcblx0XHRcdFx0ZWxlbWVudElkOiB0cmFja2VkLmVsZW1lbnRJZCxcblx0XHRcdFx0Ym9keTogbGluZS5zbGljZSh2YXJpYWJsZS5yYW5nZS5lbmRDb2x1bW4gLSAxKS50cmltU3RhcnQoKVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHZvaWQgYnJvd3Nlck1vZGVsLnNldEVsZW1lbnRDb21tZW50cyh7IGNvbW1lbnRzLCBwZW5kaW5nQ29tbWVudElkc1RvRGlzY2FyZCB9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUVsZW1lbnRDb21tZW50UmVmZXJlbmNlKGJyb3dzZXJNb2RlbDogSUJyb3dzZXJWaWV3TW9kZWwsIGVsZW1lbnRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbYXR0YWNobWVudElkLCB0cmFja2VkXSBvZiB0aGlzLl9jb21tZW50UmVmZXJlbmNlcykge1xuXHRcdFx0aWYgKHRyYWNrZWQuYnJvd3Nlck1vZGVsICE9PSBicm93c2VyTW9kZWwgfHwgdHJhY2tlZC5lbGVtZW50SWQgIT09IGVsZW1lbnRJZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGR5bmFtaWNWYXJpYWJsZU1vZGVsID0gdHJhY2tlZC53aWRnZXQuZ2V0Q29udHJpYjxDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWw+KENoYXREeW5hbWljVmFyaWFibGVNb2RlbC5JRCk7XG5cdFx0XHRjb25zdCB2YXJpYWJsZSA9IGR5bmFtaWNWYXJpYWJsZU1vZGVsPy52YXJpYWJsZXMuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmlkID09PSBhdHRhY2htZW50SWQgJiYgY2FuZGlkYXRlLmlzQXR0YWNobWVudFJlZmVyZW5jZSk7XG5cdFx0XHRjb25zdCBpbnB1dE1vZGVsID0gdHJhY2tlZC53aWRnZXQuaW5wdXRFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmICh2YXJpYWJsZSAmJiBpbnB1dE1vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSB2YXJpYWJsZS5yYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdGNvbnN0IGxpbmVSYW5nZSA9IGxpbmVOdW1iZXIgPCBpbnB1dE1vZGVsLmdldExpbmVDb3VudCgpXG5cdFx0XHRcdFx0PyBuZXcgUmFuZ2UobGluZU51bWJlciwgMSwgbGluZU51bWJlciArIDEsIDEpXG5cdFx0XHRcdFx0OiBsaW5lTnVtYmVyID4gMVxuXHRcdFx0XHRcdFx0PyBuZXcgUmFuZ2UobGluZU51bWJlciAtIDEsIGlucHV0TW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyIC0gMSksIGxpbmVOdW1iZXIsIGlucHV0TW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSlcblx0XHRcdFx0XHRcdDogaW5wdXRNb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpO1xuXHRcdFx0XHR0cmFja2VkLndpZGdldC5pbnB1dEVkaXRvci5leGVjdXRlRWRpdHMoJ2Jyb3dzZXJFbGVtZW50Q29tbWVudCcsIFt7XG5cdFx0XHRcdFx0cmFuZ2U6IGxpbmVSYW5nZSxcblx0XHRcdFx0XHR0ZXh0OiAnJ1xuXHRcdFx0XHR9XSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9kZWxldGVDb21tZW50QXR0YWNobWVudHMoYXR0YWNobWVudElkLCB0cmFja2VkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kZXRhY2hFbGVtZW50Q29tbWVudFJlZmVyZW5jZXMoYnJvd3Nlck1vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCwgc3luY0NvbW1lbnRzID0gdHJ1ZSk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbW1lbnRTZXNzaW9uc1dpdGhDb21tZW50cy5kZWxldGUoYnJvd3Nlck1vZGVsKTtcblx0XHRjb25zdCB3aWRnZXRzID0gbmV3IFNldDxJQ2hhdFdpZGdldD4oKTtcblx0XHRmb3IgKGNvbnN0IFthdHRhY2htZW50SWQsIHJlZmVyZW5jZV0gb2YgdGhpcy5fY29tbWVudFJlZmVyZW5jZXMpIHtcblx0XHRcdGlmIChyZWZlcmVuY2UuYnJvd3Nlck1vZGVsID09PSBicm93c2VyTW9kZWwpIHtcblx0XHRcdFx0d2lkZ2V0cy5hZGQocmVmZXJlbmNlLndpZGdldCk7XG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRSZWZlcmVuY2VzLmRlbGV0ZShhdHRhY2htZW50SWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB3aWRnZXRzKSB7XG5cdFx0XHR0aGlzLl9kaXNwb3NlQ29tbWVudFJlZmVyZW5jZUxpc3RlbmVySWZVbnVzZWQod2lkZ2V0KTtcblx0XHR9XG5cdFx0dGhpcy5fY29tbWVudE1vZGVsTGlzdGVuZXJzLmRlbGV0ZUFuZERpc3Bvc2UoYnJvd3Nlck1vZGVsKTtcblx0XHRpZiAoc3luY0NvbW1lbnRzKSB7XG5cdFx0XHR2b2lkIGJyb3dzZXJNb2RlbC5zZXRFbGVtZW50Q29tbWVudHMoeyBjb21tZW50czogW10gfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZm9jdXNDaGF0SW5wdXRGb3JDb21tZW50cyhicm93c2VyTW9kZWw6IElCcm93c2VyVmlld01vZGVsKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCByZWZlcmVuY2Ugb2YgdGhpcy5fY29tbWVudFJlZmVyZW5jZXMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChyZWZlcmVuY2UuYnJvd3Nlck1vZGVsID09PSBicm93c2VyTW9kZWwpIHtcblx0XHRcdFx0cmVmZXJlbmNlLndpZGdldC5mb2N1c0lucHV0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kZWxldGVDb21tZW50QXR0YWNobWVudHMoZWxlbWVudEF0dGFjaG1lbnRJZDogc3RyaW5nLCB0cmFja2VkOiB7IGF0dGFjaG1lbnRJZHM6IHJlYWRvbmx5IHN0cmluZ1tdOyB3aWRnZXQ6IElDaGF0V2lkZ2V0OyBicm93c2VyTW9kZWw6IElCcm93c2VyVmlld01vZGVsIH0pOiB2b2lkIHtcblx0XHR0aGlzLl9jb21tZW50UmVmZXJlbmNlcy5kZWxldGUoZWxlbWVudEF0dGFjaG1lbnRJZCk7XG5cdFx0dHJhY2tlZC53aWRnZXQuYXR0YWNobWVudE1vZGVsLmRlbGV0ZSguLi50cmFja2VkLmF0dGFjaG1lbnRJZHMpO1xuXHRcdHRoaXMuX2Rpc3Bvc2VDb21tZW50UmVmZXJlbmNlTGlzdGVuZXJJZlVudXNlZCh0cmFja2VkLndpZGdldCk7XG5cdFx0dGhpcy5fZGlzcG9zZUNvbW1lbnRNb2RlbExpc3RlbmVySWZVbnVzZWQodHJhY2tlZC5icm93c2VyTW9kZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZUNvbW1lbnRSZWZlcmVuY2VMaXN0ZW5lcklmVW51c2VkKHdpZGdldDogSUNoYXRXaWRnZXQpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlZmVyZW5jZSBvZiB0aGlzLl9jb21tZW50UmVmZXJlbmNlcy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHJlZmVyZW5jZS53aWRnZXQgPT09IHdpZGdldCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2NvbW1lbnRSZWZlcmVuY2VMaXN0ZW5lcnMuZGVsZXRlQW5kRGlzcG9zZSh3aWRnZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZUNvbW1lbnRNb2RlbExpc3RlbmVySWZVbnVzZWQoYnJvd3Nlck1vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcmVmZXJlbmNlIG9mIHRoaXMuX2NvbW1lbnRSZWZlcmVuY2VzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAocmVmZXJlbmNlLmJyb3dzZXJNb2RlbCA9PT0gYnJvd3Nlck1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fY29tbWVudE1vZGVsTGlzdGVuZXJzLmRlbGV0ZUFuZERpc3Bvc2UoYnJvd3Nlck1vZGVsKTtcblx0fVxuXG5cdC8vIC0tIENvbnNvbGUgTG9ncyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogR3JhYiB0aGUgY3VycmVudCBjb25zb2xlIGxvZ3MgZnJvbSB0aGUgYWN0aXZlIGNvbnNvbGUgc2Vzc2lvbiBhbmQgYXR0YWNoIHRoZW0gdG8gY2hhdC5cblx0ICovXG5cdGFzeW5jIGFkZENvbnNvbGVMb2dzVG9DaGF0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IubW9kZWw7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBsb2dzID0gYXdhaXQgbW9kZWwuZ2V0Q29uc29sZUxvZ3MoKTtcblx0XHRcdGlmICghbG9ncykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghYXdhaXQgdGhpcy5fY29uZmlybUNvbnRlbnRBdHRhY2htZW50Umlzayhtb2RlbC51cmwpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdG9BdHRhY2g6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXHRcdFx0dG9BdHRhY2gucHVzaCh7XG5cdFx0XHRcdGlkOiAnY29uc29sZS1sb2dzLScgKyBEYXRlLm5vdygpLFxuXHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnY29uc29sZUxvZ3MnLCAnQ29uc29sZSBMb2dzJyksXG5cdFx0XHRcdGZ1bGxOYW1lOiBsb2NhbGl6ZSgnY29uc29sZUxvZ3MnLCAnQ29uc29sZSBMb2dzJyksXG5cdFx0XHRcdHZhbHVlOiBsb2dzLFxuXHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnQ29uc29sZSBsb2dzIGNhcHR1cmVkIGZyb20gSW50ZWdyYXRlZCBCcm93c2VyLicsXG5cdFx0XHRcdGtpbmQ6ICdlbGVtZW50Jyxcblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnRlcm1pbmFsLmlkKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB0aGlzLl9hdHRhY2hUb0NoYXQodG9BdHRhY2gpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0Jyb3dzZXJFZGl0b3IuYWRkQ29uc29sZUxvZ3NUb0NoYXQ6IEZhaWxlZCB0byBnZXQgY29uc29sZSBsb2dzJywgZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tIFNjcmVlbnNob3QgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBDYXB0dXJlIGEgdmlld3BvcnQgc2NyZWVuc2hvdCBvZiB0aGUgY3VycmVudCBicm93c2VyIHZpZXcgYW5kIGF0dGFjaCBpdCB0byBjaGF0LlxuXHQgKi9cblx0YXN5bmMgYWRkU2NyZWVuc2hvdFRvQ2hhdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLm1vZGVsO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Ly8gQ2FwdHVyZSB0aGUgc2NyZWVuc2hvdCBCRUZPUkUgcmV2ZWFsaW5nIHRoZSBjaGF0IHBhbmVsIG9yIHByb21wdGluZyB0aGVcblx0XHRcdC8vIHVzZXIgc28gdGhlIGltYWdlIHJlZmxlY3RzIHdoYXQgdGhlIHVzZXIgc2F3IHdoZW4gdGhleSBwcmVzc2VkIHRoZSBidXR0b24sXG5cdFx0XHQvLyBub3QgYSByZWZsb3dlZCB2ZXJzaW9uIG9mIHRoZSBwYWdlIGFmdGVyIHRoZSBwYW5lbCBvcGVucyBvciBhIGxhdGVyIHZlcnNpb25cblx0XHRcdC8vIGFmdGVyIHRoZSBkaWFsb2cgYXBwZWFycy5cblx0XHRcdGNvbnN0IHNjcmVlbnNob3RCdWZmZXIgPSBhd2FpdCBtb2RlbC5jYXB0dXJlU2NyZWVuc2hvdCh7IHF1YWxpdHk6IDgwIH0pO1xuXG5cdFx0XHRpZiAoIWF3YWl0IHRoaXMuX2NvbmZpcm1Db250ZW50QXR0YWNobWVudFJpc2sobW9kZWwudXJsKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRvQXR0YWNoOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbe1xuXHRcdFx0XHRpZDogJ2Jyb3dzZXItc2NyZWVuc2hvdC0nICsgRGF0ZS5ub3coKSxcblx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ2Jyb3dzZXJTY3JlZW5zaG90JywgJ0Jyb3dzZXIgU2NyZWVuc2hvdCcpLFxuXHRcdFx0XHRmdWxsTmFtZTogbG9jYWxpemUoJ2Jyb3dzZXJTY3JlZW5zaG90JywgJ0Jyb3dzZXIgU2NyZWVuc2hvdCcpLFxuXHRcdFx0XHRraW5kOiAnaW1hZ2UnLFxuXHRcdFx0XHR2YWx1ZTogc2NyZWVuc2hvdEJ1ZmZlci5idWZmZXIsXG5cdFx0XHRcdG1pbWVUeXBlOiAnaW1hZ2UvanBlZycsXG5cdFx0XHR9XTtcblxuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9hdHRhY2hUb0NoYXQodG9BdHRhY2gpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SW50ZWdyYXRlZEJyb3dzZXJBZGRTY3JlZW5zaG90VG9DaGF0QWRkZWRFdmVudCwgSW50ZWdyYXRlZEJyb3dzZXJBZGRTY3JlZW5zaG90VG9DaGF0QWRkZWRDbGFzc2lmaWNhdGlvbj4oJ2ludGVncmF0ZWRCcm93c2VyLmFkZFNjcmVlbnNob3RUb0NoYXQuYWRkZWQnLCB7XG5cdFx0XHRcdHNjcmVlbnNob3RUeXBlOiAndmlld3BvcnQnXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdCcm93c2VyRWRpdG9yLmFkZFNjcmVlbnNob3RUb0NoYXQ6IEZhaWxlZCB0byBjYXB0dXJlIHNjcmVlbnNob3QnLCBlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERyaXZlIHRoZSBhcmVhLXNjcmVlbnNob3QgZmxvdzogcHJlc2VudCB0aGUgZHJhZy10by1zZWxlY3QgcGlja2VyLCBjYXB0dXJlIHRoZVxuXHQgKiB1c2VyLWRyYXduIHJlZ2lvbiwgYW5kIGF0dGFjaCB0aGUgcmVzdWx0aW5nIGltYWdlIHRvIGNoYXQuXG5cdCAqL1xuXHRhc3luYyBhZGRBcmVhU2NyZWVuc2hvdFRvQ2hhdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLm1vZGVsO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUb2dnbGUgb2ZmIGlmIGFscmVhZHkgYWN0aXZlIFx1MjAxNCBzZWNvbmQgaW52b2NhdGlvbiBjYW5jZWxzLlxuXHRcdGlmIChtb2RlbC5pc0FyZWFTZWxlY3Rpb25BY3RpdmUpIHtcblx0XHRcdHZvaWQgbW9kZWwudG9nZ2xlQXJlYVNlbGVjdGlvbihmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lZGl0b3IuZW5zdXJlQnJvd3NlckZvY3VzKCk7XG5cblx0XHQvLyBgb25EaWRQaWNrQXJlYWAgZmlyZXMgZXhhY3RseSBvbmNlIHBlciBzZXNzaW9uIHdpdGggdGhlIHVzZXItZHJhd24gcmVjdGFuZ2xlXG5cdFx0Ly8gb3IgYHVuZGVmaW5lZGAgb24gY2FuY2VsbGF0aW9uLCBzbyB3ZSBkb24ndCBoYXZlIHRvIHJlY29uY2lsZSByZWN0IHZzLlxuXHRcdC8vIGFjdGl2YXRpb24tc3RhdGUgZXZlbnRzIGFjcm9zcyB0aGUgSVBDIGJvdW5kYXJ5LlxuXHRcdGNvbnN0IHBpY2tQcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKEV2ZW50Lm9uY2UobW9kZWwub25EaWRQaWNrQXJlYSkpO1xuXHRcdHZvaWQgbW9kZWwudG9nZ2xlQXJlYVNlbGVjdGlvbih0cnVlKTtcblx0XHRjb25zdCByZWN0ID0gYXdhaXQgcGlja1Byb21pc2U7XG5cblx0XHRpZiAoIXJlY3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Ly8gQWRkZWQgYXdhaXROZXh0UGFpbnQgYmVjYXVzZSB0aGUgYXJlYSBzZWxlY3Rpb24gVUkgKGEgZGFzaGVkIHJlY3RhbmdsZSkgd2FzIGV2ZXJ5IHNvIG9mdGVuIG1ha2luZyBpdHMgd2F5XG5cdFx0XHQvLyBpbnRvIHRoZSBjYXB0dXJlZCBzY3JlZW5zaG90LlxuXHRcdFx0Y29uc3Qgc2NyZWVuc2hvdEJ1ZmZlciA9IGF3YWl0IG1vZGVsLmNhcHR1cmVTY3JlZW5zaG90KHsgcXVhbGl0eTogODAsIHBhZ2VSZWN0OiByZWN0LCBhd2FpdE5leHRQYWludDogdHJ1ZSB9KTtcblxuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9jb25maXJtQ29udGVudEF0dGFjaG1lbnRSaXNrKG1vZGVsLnVybCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0b0F0dGFjaDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW3tcblx0XHRcdFx0aWQ6ICdicm93c2VyLWFyZWEtc2NyZWVuc2hvdC0nICsgRGF0ZS5ub3coKSxcblx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ2Jyb3dzZXJBcmVhU2NyZWVuc2hvdCcsICdCcm93c2VyIEFyZWEgU2NyZWVuc2hvdCcpLFxuXHRcdFx0XHRmdWxsTmFtZTogbG9jYWxpemUoJ2Jyb3dzZXJBcmVhU2NyZWVuc2hvdCcsICdCcm93c2VyIEFyZWEgU2NyZWVuc2hvdCcpLFxuXHRcdFx0XHRraW5kOiAnaW1hZ2UnLFxuXHRcdFx0XHR2YWx1ZTogc2NyZWVuc2hvdEJ1ZmZlci5idWZmZXIsXG5cdFx0XHRcdG1pbWVUeXBlOiAnaW1hZ2UvanBlZycsXG5cdFx0XHR9XTtcblxuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9hdHRhY2hUb0NoYXQodG9BdHRhY2gpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SW50ZWdyYXRlZEJyb3dzZXJBZGRTY3JlZW5zaG90VG9DaGF0QWRkZWRFdmVudCwgSW50ZWdyYXRlZEJyb3dzZXJBZGRTY3JlZW5zaG90VG9DaGF0QWRkZWRDbGFzc2lmaWNhdGlvbj4oJ2ludGVncmF0ZWRCcm93c2VyLmFkZFNjcmVlbnNob3RUb0NoYXQuYWRkZWQnLCB7XG5cdFx0XHRcdHNjcmVlbnNob3RUeXBlOiAnYXJlYSdcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0Jyb3dzZXJFZGl0b3IuYWRkQXJlYVNjcmVlbnNob3RUb0NoYXQ6IEZhaWxlZCB0byBjYXB0dXJlIGFyZWEgc2NyZWVuc2hvdCcsIGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ2FwdHVyZSBhIGZ1bGwtcGFnZSBzY3JlZW5zaG90IChpbmNsdWRpbmcgY29udGVudCBzY3JvbGxlZCBvZmYtc2NyZWVuKSBhbmQgYXR0YWNoIGl0IHRvIGNoYXQuXG5cdCAqL1xuXHRhc3luYyBhZGRGdWxsUGFnZVNjcmVlbnNob3RUb0NoYXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5tb2RlbDtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNjcmVlbnNob3RCdWZmZXIgPSBhd2FpdCBtb2RlbC5jYXB0dXJlU2NyZWVuc2hvdCh7IGZ1bGxQYWdlOiB0cnVlLCBmb3JtYXQ6ICdwbmcnIH0pO1xuXG5cdFx0XHRpZiAoIWF3YWl0IHRoaXMuX2NvbmZpcm1Db250ZW50QXR0YWNobWVudFJpc2sobW9kZWwudXJsKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRvQXR0YWNoOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbe1xuXHRcdFx0XHRpZDogJ2Jyb3dzZXItZnVsbHBhZ2Utc2NyZWVuc2hvdC0nICsgRGF0ZS5ub3coKSxcblx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ2Jyb3dzZXJGdWxsUGFnZVNjcmVlbnNob3QnLCAnQnJvd3NlciBGdWxsIFBhZ2UgU2NyZWVuc2hvdCcpLFxuXHRcdFx0XHRmdWxsTmFtZTogbG9jYWxpemUoJ2Jyb3dzZXJGdWxsUGFnZVNjcmVlbnNob3QnLCAnQnJvd3NlciBGdWxsIFBhZ2UgU2NyZWVuc2hvdCcpLFxuXHRcdFx0XHRraW5kOiAnaW1hZ2UnLFxuXHRcdFx0XHR2YWx1ZTogc2NyZWVuc2hvdEJ1ZmZlci5idWZmZXIsXG5cdFx0XHRcdG1pbWVUeXBlOiAnaW1hZ2UvcG5nJyxcblx0XHRcdH1dO1xuXG5cdFx0XHRpZiAoIWF3YWl0IHRoaXMuX2F0dGFjaFRvQ2hhdCh0b0F0dGFjaCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnRlZ3JhdGVkQnJvd3NlckFkZFNjcmVlbnNob3RUb0NoYXRBZGRlZEV2ZW50LCBJbnRlZ3JhdGVkQnJvd3NlckFkZFNjcmVlbnNob3RUb0NoYXRBZGRlZENsYXNzaWZpY2F0aW9uPignaW50ZWdyYXRlZEJyb3dzZXIuYWRkU2NyZWVuc2hvdFRvQ2hhdC5hZGRlZCcsIHtcblx0XHRcdFx0c2NyZWVuc2hvdFR5cGU6ICdmdWxsUGFnZSdcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0Jyb3dzZXJFZGl0b3IuYWRkRnVsbFBhZ2VTY3JlZW5zaG90VG9DaGF0OiBGYWlsZWQgdG8gY2FwdHVyZSBmdWxsLXBhZ2Ugc2NyZWVuc2hvdCcsIGVycm9yKTtcblx0XHR9XG5cdH1cbn1cblxuLy8gUmVnaXN0ZXIgdGhlIGNvbnRyaWJ1dGlvblxuQnJvd3NlckVkaXRvci5yZWdpc3RlckNvbnRyaWJ1dGlvbihCcm93c2VyRWRpdG9yQ2hhdEludGVncmF0aW9uKTtcblxuLy8gLS0gQWN0aW9ucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY2xhc3MgQWRkRWxlbWVudFRvQ2hhdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBCcm93c2VyVmlld0NvbW1hbmRJZC5BZGRFbGVtZW50VG9DaGF0O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBZGRFbGVtZW50VG9DaGF0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5hZGRFbGVtZW50VG9DaGF0QWN0aW9uJywgJ0FkZCBFbGVtZW50IHRvIENoYXQnKSxcblx0XHRcdGNhdGVnb3J5OiBCcm93c2VyQ2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLmluc3BlY3QsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEJST1dTRVJfRURJVE9SX0FDVElWRSwgQ09OVEVYVF9CUk9XU0VSX0hBU19VUkwsIENPTlRFWFRfQlJPV1NFUl9IQVNfRVJST1IubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5lbmFibGVkKSxcblx0XHRcdHRvZ2dsZWQ6IENPTlRFWFRfQlJPV1NFUl9FTEVNRU5UX1NFTEVDVElPTl9NT0RFLmlzRXF1YWxUbyhCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUuU2VsZWN0KSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Ccm93c2VyQ2hhdEFjdGlvbnNNZW51LFxuXHRcdFx0XHRncm91cDogJzFfZWxlbWVudCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdFx0fSxcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNTAsIC8vIFByaW9yaXR5IG92ZXIgdGVybWluYWxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUMsXG5cdFx0XHRcdGFyZ3M6IHsgaGlnaGxpZ2h0Rm9jdXNlZEVsZW1lbnQ6IHRydWUgfSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3VtZW50PzogSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucyB8IEJyb3dzZXJFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBicm93c2VyRWRpdG9yID0gYXJndW1lbnQgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yID8gYXJndW1lbnQgOiBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKGJyb3dzZXJFZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yKSB7XG5cdFx0XHRicm93c2VyRWRpdG9yLmVuc3VyZUJyb3dzZXJGb2N1cygpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBicm93c2VyRWRpdG9yLm1vZGVsO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IG9wdGlvbnMgPSBhcmd1bWVudCBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3IgPyB1bmRlZmluZWQgOiBhcmd1bWVudDtcblx0XHRcdFx0Y29uc3QgaXNBY3RpdmVNb2RlID0gbW9kZWwuZWxlbWVudFNlbGVjdGlvblN0YXRlLmFjdGl2ZSAmJiBtb2RlbC5lbGVtZW50U2VsZWN0aW9uU3RhdGUub3B0aW9ucy5tb2RlICE9PSBCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUuQ29tbWVudDtcblx0XHRcdFx0dm9pZCBtb2RlbC50b2dnbGVFbGVtZW50U2VsZWN0aW9uKCFpc0FjdGl2ZU1vZGUsIHsgLi4ub3B0aW9ucywgY29udGludW91czogZmFsc2UsIG1vZGU6IEJyb3dzZXJFbGVtZW50U2VsZWN0aW9uTW9kZS5TZWxlY3QgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEFkZEVsZW1lbnRDb21tZW50VG9DaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9IEJyb3dzZXJWaWV3Q29tbWFuZElkLkFkZEVsZW1lbnRDb21tZW50VG9DaGF0O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBZGRFbGVtZW50Q29tbWVudFRvQ2hhdEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIuYWRkRWxlbWVudENvbW1lbnRUb0NoYXRBY3Rpb24nLCAnQ29tbWVudCBvbiBFbGVtZW50cycpLFxuXHRcdFx0Y2F0ZWdvcnk6IEJyb3dzZXJDYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24uY29tbWVudCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQlJPV1NFUl9FRElUT1JfQUNUSVZFLCBDT05URVhUX0JST1dTRVJfSEFTX1VSTCwgQ09OVEVYVF9CUk9XU0VSX0hBU19FUlJPUi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQpLFxuXHRcdFx0dG9nZ2xlZDogQ09OVEVYVF9CUk9XU0VSX0VMRU1FTlRfU0VMRUNUSU9OX01PREUuaXNFcXVhbFRvKEJyb3dzZXJFbGVtZW50U2VsZWN0aW9uTW9kZS5Db21tZW50KSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Ccm93c2VyQ2hhdEFjdGlvbnNNZW51LFxuXHRcdFx0XHRncm91cDogJzFfZWxlbWVudCcsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdFx0fSxcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNTAsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5Qyxcblx0XHRcdFx0YXJnczogeyBjb250aW51b3VzOiB0cnVlLCBtb2RlOiBCcm93c2VyRWxlbWVudFNlbGVjdGlvbk1vZGUuQ29tbWVudCwgaGlnaGxpZ2h0Rm9jdXNlZEVsZW1lbnQ6IHRydWUgfVxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3VtZW50PzogSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucyB8IEJyb3dzZXJFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBicm93c2VyRWRpdG9yID0gYXJndW1lbnQgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yID8gYXJndW1lbnQgOiBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKGJyb3dzZXJFZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yKSB7XG5cdFx0XHRicm93c2VyRWRpdG9yLmVuc3VyZUJyb3dzZXJGb2N1cygpO1xuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IGFyZ3VtZW50IGluc3RhbmNlb2YgQnJvd3NlckVkaXRvciA/IHVuZGVmaW5lZCA6IGFyZ3VtZW50O1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBicm93c2VyRWRpdG9yLm1vZGVsO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IGlzQWN0aXZlTW9kZSA9IG1vZGVsLmVsZW1lbnRTZWxlY3Rpb25TdGF0ZS5hY3RpdmUgJiYgbW9kZWwuZWxlbWVudFNlbGVjdGlvblN0YXRlLm9wdGlvbnMubW9kZSA9PT0gQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25Nb2RlLkNvbW1lbnQ7XG5cdFx0XHRcdHZvaWQgbW9kZWwudG9nZ2xlRWxlbWVudFNlbGVjdGlvbighaXNBY3RpdmVNb2RlLCB7IC4uLm9wdGlvbnMsIGNvbnRpbnVvdXM6IHRydWUsIG1vZGU6IEJyb3dzZXJFbGVtZW50U2VsZWN0aW9uTW9kZS5Db21tZW50IH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBTdG9wRWxlbWVudFNlbGVjdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uYnJvd3Nlci5zdG9wRWxlbWVudFNlbGVjdGlvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdicm93c2VyLnN0b3BFbGVtZW50U2VsZWN0aW9uQWN0aW9uJywgJ1N0b3AgRWxlbWVudCBTZWxlY3Rpb24nKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEJST1dTRVJfRURJVE9SX0FDVElWRSwgQ29udGV4dEtleUV4cHIuaGFzKENPTlRFWFRfQlJPV1NFUl9FTEVNRU5UX1NFTEVDVElPTl9NT0RFLmtleSkpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoQ09OVEVYVF9CUk9XU0VSX0VMRU1FTlRfU0VMRUNUSU9OX01PREUua2V5KSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBicm93c2VyRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmIChicm93c2VyRWRpdG9yIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcikge1xuXHRcdFx0dm9pZCBicm93c2VyRWRpdG9yLm1vZGVsPy50b2dnbGVFbGVtZW50U2VsZWN0aW9uKGZhbHNlKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgQWRkQ29uc29sZUxvZ3NUb0NoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gQnJvd3NlclZpZXdDb21tYW5kSWQuQWRkQ29uc29sZUxvZ3NUb0NoYXQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFkZENvbnNvbGVMb2dzVG9DaGF0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5hZGRDb25zb2xlTG9nc1RvQ2hhdEFjdGlvbicsICdBZGQgQ29uc29sZSBMb2dzIHRvIENoYXQnKSxcblx0XHRcdGNhdGVnb3J5OiBCcm93c2VyQWN0aW9uQ2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLm91dHB1dCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQlJPV1NFUl9FRElUT1JfQUNUSVZFLCBDT05URVhUX0JST1dTRVJfSEFTX1VSTCwgQ09OVEVYVF9CUk9XU0VSX0hBU19FUlJPUi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkJyb3dzZXJDaGF0QWN0aW9uc01lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMl9sb2dzJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGJyb3dzZXJFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYnJvd3NlckVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3IpIHtcblx0XHRcdGF3YWl0IGJyb3dzZXJFZGl0b3IuZ2V0Q29udHJpYnV0aW9uKEJyb3dzZXJFZGl0b3JDaGF0SW50ZWdyYXRpb24pPy5hZGRDb25zb2xlTG9nc1RvQ2hhdCgpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBBZGRTY3JlZW5zaG90VG9DaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9IEJyb3dzZXJWaWV3Q29tbWFuZElkLkFkZFNjcmVlbnNob3RUb0NoYXQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFkZFNjcmVlbnNob3RUb0NoYXRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdicm93c2VyLmFkZFNjcmVlbnNob3RUb0NoYXRBY3Rpb24nLCAnQWRkIFNjcmVlbnNob3QgdG8gQ2hhdCcpLFxuXHRcdFx0Y2F0ZWdvcnk6IEJyb3dzZXJBY3Rpb25DYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24uZGV2aWNlQ2FtZXJhLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChCUk9XU0VSX0VESVRPUl9BQ1RJVkUsIENPTlRFWFRfQlJPV1NFUl9IQVNfVVJMLCBDT05URVhUX0JST1dTRVJfSEFTX0VSUk9SLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQnJvd3NlckNoYXRBY3Rpb25zTWVudSxcblx0XHRcdFx0Z3JvdXA6ICczX3NjcmVlbnNob3RzJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGJyb3dzZXJFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYnJvd3NlckVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3IpIHtcblx0XHRcdGF3YWl0IGJyb3dzZXJFZGl0b3IuZ2V0Q29udHJpYnV0aW9uKEJyb3dzZXJFZGl0b3JDaGF0SW50ZWdyYXRpb24pPy5hZGRTY3JlZW5zaG90VG9DaGF0KCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEFkZEFyZWFTY3JlZW5zaG90VG9DaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9IEJyb3dzZXJWaWV3Q29tbWFuZElkLkFkZEFyZWFTY3JlZW5zaG90VG9DaGF0O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBZGRBcmVhU2NyZWVuc2hvdFRvQ2hhdEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIuYWRkQXJlYVNjcmVlbnNob3RUb0NoYXRBY3Rpb24nLCAnQWRkIEFyZWEgU2NyZWVuc2hvdCB0byBDaGF0JyksXG5cdFx0XHRjYXRlZ29yeTogQnJvd3NlckFjdGlvbkNhdGVnb3J5LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zY3JlZW5GdWxsLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChCUk9XU0VSX0VESVRPUl9BQ1RJVkUsIENPTlRFWFRfQlJPV1NFUl9IQVNfVVJMLCBDT05URVhUX0JST1dTRVJfSEFTX0VSUk9SLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCksXG5cdFx0XHR0b2dnbGVkOiBDT05URVhUX0JST1dTRVJfQVJFQV9TRUxFQ1RJT05fQUNUSVZFLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkJyb3dzZXJDaGF0QWN0aW9uc01lbnUsXG5cdFx0XHRcdGdyb3VwOiAnM19zY3JlZW5zaG90cycsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBicm93c2VyRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGJyb3dzZXJFZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yKSB7XG5cdFx0XHRhd2FpdCBicm93c2VyRWRpdG9yLmdldENvbnRyaWJ1dGlvbihCcm93c2VyRWRpdG9yQ2hhdEludGVncmF0aW9uKT8uYWRkQXJlYVNjcmVlbnNob3RUb0NoYXQoKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgQWRkRnVsbFBhZ2VTY3JlZW5zaG90VG9DaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9IEJyb3dzZXJWaWV3Q29tbWFuZElkLkFkZEZ1bGxQYWdlU2NyZWVuc2hvdFRvQ2hhdDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBlbmFibGVkU2V0dGluZyA9IENvbnRleHRLZXlFeHByLmhhcygnY29uZmlnLndvcmtiZW5jaC5icm93c2VyLmV4cGVyaW1lbnRhbFVzZXJUb29scy5lbmFibGVkJyk7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFkZEZ1bGxQYWdlU2NyZWVuc2hvdFRvQ2hhdEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIuYWRkRnVsbFBhZ2VTY3JlZW5zaG90VG9DaGF0QWN0aW9uJywgJ0FkZCBGdWxsIFBhZ2UgU2NyZWVuc2hvdCB0byBDaGF0IChFeHBlcmltZW50YWwpJyksXG5cdFx0XHRjYXRlZ29yeTogQnJvd3NlckFjdGlvbkNhdGVnb3J5LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5kZXZpY2VDYW1lcmEsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEJST1dTRVJfRURJVE9SX0FDVElWRSwgQ09OVEVYVF9CUk9XU0VSX0hBU19VUkwsIENPTlRFWFRfQlJPV1NFUl9IQVNfRVJST1IubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBlbmFibGVkU2V0dGluZyksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQnJvd3NlckNoYXRBY3Rpb25zTWVudSxcblx0XHRcdFx0Z3JvdXA6ICczX3NjcmVlbnNob3RzJyxcblx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgZW5hYmxlZFNldHRpbmcpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGJyb3dzZXJFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYnJvd3NlckVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3IpIHtcblx0XHRcdGF3YWl0IGJyb3dzZXJFZGl0b3IuZ2V0Q29udHJpYnV0aW9uKEJyb3dzZXJFZGl0b3JDaGF0SW50ZWdyYXRpb24pPy5hZGRGdWxsUGFnZVNjcmVlbnNob3RUb0NoYXQoKTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKEFkZEVsZW1lbnRUb0NoYXRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEFkZEVsZW1lbnRDb21tZW50VG9DaGF0QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTdG9wRWxlbWVudFNlbGVjdGlvbkFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoQWRkQ29uc29sZUxvZ3NUb0NoYXRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEFkZFNjcmVlbnNob3RUb0NoYXRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEFkZEFyZWFTY3JlZW5zaG90VG9DaGF0QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihBZGRGdWxsUGFnZVNjcmVlbnNob3RUb0NoYXRBY3Rpb24pO1xuXG4vLyBFeHBvc2UgdGhlIGNoYXQgYWN0aW9ucyBzdWJtZW51IChBZGQgRWxlbWVudCB0byBDaGF0LCBldGMuKSBhcyBhIHNwbGl0IGJ1dHRvbiBpbiB0aGUgYnJvd3NlciBhY3Rpb25zIHRvb2xiYXIuXG4vLyBUaGUgcHJpbWFyeSBhY3Rpb24gKGNoZXZyb24ncyBsZWZ0IHNpZGUpIGlzIHRoZSBmaXJzdCBpdGVtIGluIHRoZSBzdWJtZW51LlxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Ccm93c2VyQWN0aW9uc1Rvb2xiYXIsIHtcblx0c3VibWVudTogTWVudUlkLkJyb3dzZXJDaGF0QWN0aW9uc01lbnUsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIuY2hhdEFjdGlvbnNTdWJtZW51JywgXCJBZGQgdG8gQ2hhdFwiKSxcblx0aWNvbjogQ29kaWNvbi5pbnNwZWN0LFxuXHRncm91cDogQnJvd3NlckFjdGlvbkdyb3VwLlRvb2xzLFxuXHRvcmRlcjogMSxcblx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdGlzU3BsaXRCdXR0b246IHtcblx0XHR0b2dnbGVQcmltYXJ5QWN0aW9uOiB0cnVlLFxuXHRcdHByaW1hcnlBY3Rpb25JZHM6IFtBZGRFbGVtZW50VG9DaGF0QWN0aW9uLklELCBBZGRFbGVtZW50Q29tbWVudFRvQ2hhdEFjdGlvbi5JRF1cblx0fVxufSk7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdC4uLndvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSxcblx0cHJvcGVydGllczoge1xuXHRcdCd3b3JrYmVuY2guYnJvd3Nlci5lbmFibGVDaGF0VG9vbHMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoXG5cdFx0XHRcdHsgY29tbWVudDogWydUaGlzIGlzIHRoZSBkZXNjcmlwdGlvbiBmb3IgYSBzZXR0aW5nLiddLCBrZXk6ICdicm93c2VyLmVuYWJsZUNoYXRUb29scycgfSxcblx0XHRcdFx0J1doZW4gZW5hYmxlZCwgY2hhdCBhZ2VudHMgY2FuIHVzZSBicm93c2VyIHRvb2xzIHRvIG9wZW4gYW5kIGludGVyYWN0IHdpdGggcGFnZXMgaW4gdGhlIEludGVncmF0ZWQgQnJvd3Nlci4nXG5cdFx0XHQpLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdCcm93c2VyQ2hhdFRvb2xzJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjExMCcsXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdicm93c2VyLmVuYWJsZUNoYXRUb29scycsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ2Jyb3dzZXIuZW5hYmxlQ2hhdFRvb2xzJywgJ1doZW4gZW5hYmxlZCwgY2hhdCBhZ2VudHMgY2FuIHVzZSBicm93c2VyIHRvb2xzIHRvIG9wZW4gYW5kIGludGVyYWN0IHdpdGggcGFnZXMgaW4gdGhlIEludGVncmF0ZWQgQnJvd3Nlci4nKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogdHJ1ZSB9LFxuXHRcdH0sXG5cdFx0J3dvcmtiZW5jaC5icm93c2VyLmV4cGVyaW1lbnRhbFVzZXJUb29scy5lbmFibGVkJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRleHBlcmltZW50OiB7IG1vZGU6ICdzdGFydHVwJyB9LFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKFxuXHRcdFx0XHR7IGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gZm9yIGEgc2V0dGluZy4nXSwga2V5OiAnYnJvd3Nlci5leHBlcmltZW50YWxVc2VyVG9vbHMuZW5hYmxlZCcgfSxcblx0XHRcdFx0XCJXaGVuIGVuYWJsZWQsIGV4cGVyaW1lbnRhbCB1c2VyLWZhY2luZyB0b29scyBhcmUgYXZhaWxhYmxlIGluIHRoZSBJbnRlZ3JhdGVkIEJyb3dzZXIncyBBZGQgdG8gQ2hhdCBtZW51LlwiXG5cdFx0XHQpLFxuXHRcdH0sXG5cdFx0W0Jyb3dzZXJTZW5kRWxlbWVudHNUb0NoYXRBdHRhY2hJbWFnZXNTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtiZW5jaC5icm93c2VyLnNlbmRFbGVtZW50c1RvQ2hhdC5hdHRhY2hJbWFnZXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgYSBzY3JlZW5zaG90IG9mIHRoZSBzZWxlY3RlZCBlbGVtZW50IHdpbGwgYmUgYWRkZWQgdG8gdGhlIGNoYXQuXCIpLFxuXHRcdH1cblx0fVxufSk7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25NaWdyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb25NaWdyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbk1pZ3JhdGlvbnMoW1xuXHR7XG5cdFx0a2V5OiAnY2hhdC5zZW5kRWxlbWVudHNUb0NoYXQuYXR0YWNoSW1hZ2VzJyxcblx0XHRtaWdyYXRlRm46IHZhbHVlID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogW3N0cmluZywgeyB2YWx1ZTogdW5rbm93biB8IHVuZGVmaW5lZCB9XVtdID0gW1xuXHRcdFx0XHRbJ2NoYXQuc2VuZEVsZW1lbnRzVG9DaGF0LmF0dGFjaEltYWdlcycsIHsgdmFsdWU6IHVuZGVmaW5lZCB9XSxcblx0XHRcdF07XG5cdFx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goW0Jyb3dzZXJTZW5kRWxlbWVudHNUb0NoYXRBdHRhY2hJbWFnZXNTZXR0aW5nSWQsIHsgdmFsdWUgfV0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdH1cbl0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsU0FBUztBQUNsQixTQUFTLGFBQWE7QUFDdEIsU0FBc0Isb0JBQW9CLGdCQUFnQixxQkFBcUI7QUFDL0UsU0FBUyxTQUFTLGlCQUFpQixRQUFRLG9CQUFvQjtBQUMvRCxTQUEyQiw2QkFBNkI7QUFDeEQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxRQUFRLGVBQWU7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZSx1QkFBdUI7QUFDL0MsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxXQUFXO0FBQ3BCLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE4Riw0QkFBNEI7QUFDbkksU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsY0FBYztBQUN2QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGVBQWUsMkJBQTJCLHVCQUE2Qyx1QkFBdUIsMkJBQTJCLHlCQUF5QiwwQkFBMEI7QUFDck0s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
