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
import { asArray, compareBy, numberComparator } from "../../../../base/common/arrays.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isEmptyMarkdownString, MarkdownString } from "../../../../base/common/htmlContent.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { DECREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID, HIDE_LONG_LINE_WARNING_HOVER_ACTION_ID } from "./hoverActionIds.js";
import { Range } from "../../../common/core/range.js";
import { HoverAnchorType, RenderedHoverParts } from "./hoverTypes.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { HoverVerbosityAction } from "../../../common/languages.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ClickAction, HoverPosition, KeyDownAction } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../../../platform/hover/browser/hover.js";
import { AsyncIterableProducer } from "../../../../base/common/async.js";
import { getHoverProviderResultsAsAsyncIterable } from "./getHover.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
const $ = dom.$;
const increaseHoverVerbosityIcon = registerIcon("hover-increase-verbosity", Codicon.addSmall, nls.localize("increaseHoverVerbosity", "Icon for increaseing hover verbosity."));
const decreaseHoverVerbosityIcon = registerIcon("hover-decrease-verbosity", Codicon.removeSmall, nls.localize("decreaseHoverVerbosity", "Icon for decreasing hover verbosity."));
class MarkdownHover {
  constructor(owner, range, contents, isBeforeContent, ordinal, source = void 0) {
    this.owner = owner;
    this.range = range;
    this.contents = contents;
    this.isBeforeContent = isBeforeContent;
    this.ordinal = ordinal;
    this.source = source;
  }
  isValidForHoverAnchor(anchor) {
    return anchor.type === HoverAnchorType.Range && this.range.startColumn <= anchor.range.startColumn && this.range.endColumn >= anchor.range.endColumn;
  }
}
class HoverSource {
  constructor(hover, hoverProvider, hoverPosition) {
    this.hover = hover;
    this.hoverProvider = hoverProvider;
    this.hoverPosition = hoverPosition;
  }
  supportsVerbosityAction(hoverVerbosityAction) {
    switch (hoverVerbosityAction) {
      case HoverVerbosityAction.Increase:
        return this.hover.canIncreaseVerbosity ?? false;
      case HoverVerbosityAction.Decrease:
        return this.hover.canDecreaseVerbosity ?? false;
    }
  }
}
let MarkdownHoverParticipant = class {
  constructor(_editor, _markdownRendererService, _configurationService, _languageFeaturesService, _keybindingService, _hoverService, _commandService) {
    this._editor = _editor;
    this._markdownRendererService = _markdownRendererService;
    this._configurationService = _configurationService;
    this._languageFeaturesService = _languageFeaturesService;
    this._keybindingService = _keybindingService;
    this._hoverService = _hoverService;
    this._commandService = _commandService;
    this.hoverOrdinal = 3;
  }
  createLoadingMessage(anchor) {
    return new MarkdownHover(this, anchor.range, [new MarkdownString().appendText(nls.localize("modesContentHover.loading", "Loading..."))], false, 2e3);
  }
  computeSync(anchor, lineDecorations) {
    if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
      return [];
    }
    const model = this._editor.getModel();
    const lineNumber = anchor.range.startLineNumber;
    const maxColumn = model.getLineMaxColumn(lineNumber);
    const result = [];
    let index = 1e3;
    const lineLength = model.getLineLength(lineNumber);
    const languageId = model.getLanguageIdAtPosition(anchor.range.startLineNumber, anchor.range.startColumn);
    const stopRenderingLineAfter = this._editor.getOption(EditorOption.stopRenderingLineAfter);
    const maxTokenizationLineLength = this._configurationService.getValue("editor.maxTokenizationLineLength", {
      overrideIdentifier: languageId
    });
    const showLongLineWarning = this._editor.getOption(EditorOption.hover).showLongLineWarning;
    let stopRenderingMessage = false;
    if (stopRenderingLineAfter >= 0 && lineLength > stopRenderingLineAfter && anchor.range.startColumn >= stopRenderingLineAfter) {
      stopRenderingMessage = true;
      if (showLongLineWarning) {
        result.push(new MarkdownHover(this, anchor.range, [{
          value: nls.localize(
            { key: "stopped rendering", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change', '{Locked="](command:{0})"}'] },
            "Rendering paused for long line for performance reasons. This can be configured via `editor.stopRenderingLineAfter`. [Don't Show Again](command:{0})",
            HIDE_LONG_LINE_WARNING_HOVER_ACTION_ID
          ),
          isTrusted: true
        }], false, index++));
      }
    }
    if (!stopRenderingMessage && typeof maxTokenizationLineLength === "number" && lineLength >= maxTokenizationLineLength) {
      if (showLongLineWarning) {
        result.push(new MarkdownHover(this, anchor.range, [{
          value: nls.localize(
            { key: "too many characters", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change', '{Locked="](command:{0})"}'] },
            "Tokenization is skipped for long lines for performance reasons. This can be configured via `editor.maxTokenizationLineLength`. [Don't Show Again](command:{0})",
            HIDE_LONG_LINE_WARNING_HOVER_ACTION_ID
          ),
          isTrusted: true
        }], false, index++));
      }
    }
    let isBeforeContent = false;
    for (const d of lineDecorations) {
      const startColumn = d.range.startLineNumber === lineNumber ? d.range.startColumn : 1;
      const endColumn = d.range.endLineNumber === lineNumber ? d.range.endColumn : maxColumn;
      const hoverMessage = d.options.hoverMessage;
      if (!hoverMessage || isEmptyMarkdownString(hoverMessage)) {
        continue;
      }
      if (d.options.beforeContentClassName) {
        isBeforeContent = true;
      }
      const range = new Range(anchor.range.startLineNumber, startColumn, anchor.range.startLineNumber, endColumn);
      result.push(new MarkdownHover(this, range, asArray(hoverMessage), isBeforeContent, index++));
    }
    return result;
  }
  computeAsync(anchor, lineDecorations, source, token) {
    if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
      return AsyncIterableProducer.EMPTY;
    }
    const model = this._editor.getModel();
    const hoverProviderRegistry = this._languageFeaturesService.hoverProvider;
    if (!hoverProviderRegistry.has(model)) {
      return AsyncIterableProducer.EMPTY;
    }
    return this._getMarkdownHovers(hoverProviderRegistry, model, anchor, token);
  }
  async *_getMarkdownHovers(hoverProviderRegistry, model, anchor, token) {
    const position = anchor.range.getStartPosition();
    const hoverProviderResults = getHoverProviderResultsAsAsyncIterable(hoverProviderRegistry, model, position, token);
    for await (const item of hoverProviderResults) {
      if (!isEmptyMarkdownString(item.hover.contents)) {
        const range = item.hover.range ? Range.lift(item.hover.range) : anchor.range;
        const hoverSource = new HoverSource(item.hover, item.provider, position);
        yield new MarkdownHover(this, range, item.hover.contents, false, item.ordinal, hoverSource);
      }
    }
  }
  renderHoverParts(context, hoverParts) {
    this._renderedHoverParts = new MarkdownRenderedHoverParts(
      hoverParts,
      context.fragment,
      this,
      this._editor,
      this._commandService,
      this._keybindingService,
      this._hoverService,
      this._configurationService,
      this._markdownRendererService,
      context.onContentsChanged
    );
    return this._renderedHoverParts;
  }
  handleScroll(e) {
    this._renderedHoverParts?.handleScroll(e);
  }
  getAccessibleContent(hoverPart) {
    return this._renderedHoverParts?.getAccessibleContent(hoverPart) ?? "";
  }
  doesMarkdownHoverAtIndexSupportVerbosityAction(index, action) {
    return this._renderedHoverParts?.doesMarkdownHoverAtIndexSupportVerbosityAction(index, action) ?? false;
  }
  updateMarkdownHoverVerbosityLevel(action, index) {
    return Promise.resolve(this._renderedHoverParts?.updateMarkdownHoverPartVerbosityLevel(action, index));
  }
};
MarkdownHoverParticipant = __decorateClass([
  __decorateParam(1, IMarkdownRendererService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ILanguageFeaturesService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, ICommandService)
], MarkdownHoverParticipant);
class RenderedMarkdownHoverPart {
  constructor(hoverPart, hoverElement, disposables, actionsContainer) {
    this.hoverPart = hoverPart;
    this.hoverElement = hoverElement;
    this.disposables = disposables;
    this.actionsContainer = actionsContainer;
  }
  get hoverAccessibleContent() {
    return this.hoverElement.innerText.trim();
  }
  dispose() {
    this.disposables.dispose();
  }
}
class MarkdownRenderedHoverParts {
  constructor(hoverParts, hoverPartsContainer, _hoverParticipant, _editor, _commandService, _keybindingService, _hoverService, _configurationService, _markdownRendererService, _onFinishedRendering) {
    this._hoverParticipant = _hoverParticipant;
    this._editor = _editor;
    this._commandService = _commandService;
    this._keybindingService = _keybindingService;
    this._hoverService = _hoverService;
    this._configurationService = _configurationService;
    this._markdownRendererService = _markdownRendererService;
    this._onFinishedRendering = _onFinishedRendering;
    this._ongoingHoverOperations = /* @__PURE__ */ new Map();
    this._disposables = new DisposableStore();
    this.renderedHoverParts = this._renderHoverParts(hoverParts, hoverPartsContainer, this._onFinishedRendering);
    this._disposables.add(toDisposable(() => {
      this.renderedHoverParts.forEach((renderedHoverPart) => {
        renderedHoverPart.dispose();
      });
      this._ongoingHoverOperations.forEach((operation) => {
        operation.tokenSource.dispose(true);
      });
    }));
  }
  _renderHoverParts(hoverParts, hoverPartsContainer, onFinishedRendering) {
    hoverParts.sort(compareBy((hover) => hover.ordinal, numberComparator));
    return hoverParts.map((hoverPart) => {
      const renderedHoverPart = this._renderHoverPart(hoverPart, onFinishedRendering);
      hoverPartsContainer.appendChild(renderedHoverPart.hoverElement);
      return renderedHoverPart;
    });
  }
  _renderHoverPart(hoverPart, onFinishedRendering) {
    const renderedMarkdownPart = this._renderMarkdownHover(hoverPart, onFinishedRendering);
    const renderedMarkdownElement = renderedMarkdownPart.hoverElement;
    const hoverSource = hoverPart.source;
    const disposables = new DisposableStore();
    disposables.add(renderedMarkdownPart);
    if (!hoverSource) {
      return new RenderedMarkdownHoverPart(hoverPart, renderedMarkdownElement, disposables);
    }
    const canIncreaseVerbosity = hoverSource.supportsVerbosityAction(HoverVerbosityAction.Increase);
    const canDecreaseVerbosity = hoverSource.supportsVerbosityAction(HoverVerbosityAction.Decrease);
    if (!canIncreaseVerbosity && !canDecreaseVerbosity) {
      return new RenderedMarkdownHoverPart(hoverPart, renderedMarkdownElement, disposables);
    }
    const actionsContainer = $("div.verbosity-actions");
    renderedMarkdownElement.prepend(actionsContainer);
    const actionsContainerInner = $("div.verbosity-actions-inner");
    actionsContainer.append(actionsContainerInner);
    disposables.add(this._renderHoverExpansionAction(actionsContainerInner, HoverVerbosityAction.Increase, canIncreaseVerbosity));
    disposables.add(this._renderHoverExpansionAction(actionsContainerInner, HoverVerbosityAction.Decrease, canDecreaseVerbosity));
    return new RenderedMarkdownHoverPart(hoverPart, renderedMarkdownElement, disposables, actionsContainerInner);
  }
  _renderMarkdownHover(markdownHover, onFinishedRendering) {
    const renderedMarkdownHover = renderMarkdown(
      this._editor,
      markdownHover,
      this._markdownRendererService,
      onFinishedRendering
    );
    return renderedMarkdownHover;
  }
  _renderHoverExpansionAction(container, action, actionEnabled) {
    const store = new DisposableStore();
    const isActionIncrease = action === HoverVerbosityAction.Increase;
    const actionElement = dom.append(container, $(ThemeIcon.asCSSSelector(isActionIncrease ? increaseHoverVerbosityIcon : decreaseHoverVerbosityIcon)));
    actionElement.tabIndex = 0;
    const hoverDelegate = store.add(new WorkbenchHoverDelegate("mouse", void 0, { target: container, position: { hoverPosition: HoverPosition.LEFT } }, this._configurationService, this._hoverService));
    store.add(this._hoverService.setupManagedHover(hoverDelegate, actionElement, labelForHoverVerbosityAction(this._keybindingService, action)));
    if (!actionEnabled) {
      actionElement.classList.add("disabled");
      return store;
    }
    actionElement.classList.add("enabled");
    const actionFunction = () => this._commandService.executeCommand(action === HoverVerbosityAction.Increase ? INCREASE_HOVER_VERBOSITY_ACTION_ID : DECREASE_HOVER_VERBOSITY_ACTION_ID, { focus: true });
    store.add(new ClickAction(actionElement, actionFunction));
    store.add(new KeyDownAction(actionElement, actionFunction, [KeyCode.Enter, KeyCode.Space]));
    return store;
  }
  handleScroll(e) {
    this.renderedHoverParts.forEach((renderedHoverPart) => {
      const actionsContainerInner = renderedHoverPart.actionsContainer;
      if (!actionsContainerInner) {
        return;
      }
      const hoverElement = renderedHoverPart.hoverElement;
      const topOfHoverScrollPosition = e.scrollTop;
      const bottomOfHoverScrollPosition = topOfHoverScrollPosition + e.height;
      const topOfRenderedPart = hoverElement.offsetTop;
      const hoverElementHeight = hoverElement.clientHeight;
      const bottomOfRenderedPart = topOfRenderedPart + hoverElementHeight;
      const iconsHeight = 22;
      let top;
      if (bottomOfRenderedPart <= bottomOfHoverScrollPosition || topOfRenderedPart >= bottomOfHoverScrollPosition) {
        top = hoverElementHeight - iconsHeight;
      } else {
        top = bottomOfHoverScrollPosition - topOfRenderedPart - iconsHeight;
      }
      actionsContainerInner.style.top = `${top}px`;
    });
  }
  async updateMarkdownHoverPartVerbosityLevel(action, index) {
    const model = this._editor.getModel();
    if (!model) {
      return void 0;
    }
    const hoverRenderedPart = this._getRenderedHoverPartAtIndex(index);
    const hoverSource = hoverRenderedPart?.hoverPart.source;
    if (!hoverRenderedPart || !hoverSource?.supportsVerbosityAction(action)) {
      return void 0;
    }
    const newHover = await this._fetchHover(hoverSource, model, action);
    if (!newHover) {
      return void 0;
    }
    const newHoverSource = new HoverSource(newHover, hoverSource.hoverProvider, hoverSource.hoverPosition);
    const initialHoverPart = hoverRenderedPart.hoverPart;
    const newHoverPart = new MarkdownHover(
      this._hoverParticipant,
      initialHoverPart.range,
      newHover.contents,
      initialHoverPart.isBeforeContent,
      initialHoverPart.ordinal,
      newHoverSource
    );
    const newHoverRenderedPart = this._updateRenderedHoverPart(index, newHoverPart);
    if (!newHoverRenderedPart) {
      return void 0;
    }
    return {
      hoverPart: newHoverPart,
      hoverElement: newHoverRenderedPart.hoverElement
    };
  }
  getAccessibleContent(hoverPart) {
    const renderedHoverPartIndex = this.renderedHoverParts.findIndex((renderedHoverPart2) => renderedHoverPart2.hoverPart === hoverPart);
    if (renderedHoverPartIndex === -1) {
      return void 0;
    }
    const renderedHoverPart = this._getRenderedHoverPartAtIndex(renderedHoverPartIndex);
    if (!renderedHoverPart) {
      return void 0;
    }
    const hoverElementInnerText = renderedHoverPart.hoverElement.innerText;
    const accessibleContent = hoverElementInnerText.replace(/[^\S\n\r]+/gu, " ");
    return accessibleContent;
  }
  doesMarkdownHoverAtIndexSupportVerbosityAction(index, action) {
    const hoverRenderedPart = this._getRenderedHoverPartAtIndex(index);
    const hoverSource = hoverRenderedPart?.hoverPart.source;
    if (!hoverRenderedPart || !hoverSource?.supportsVerbosityAction(action)) {
      return false;
    }
    return true;
  }
  async _fetchHover(hoverSource, model, action) {
    let verbosityDelta = action === HoverVerbosityAction.Increase ? 1 : -1;
    const provider = hoverSource.hoverProvider;
    const ongoingHoverOperation = this._ongoingHoverOperations.get(provider);
    if (ongoingHoverOperation) {
      ongoingHoverOperation.tokenSource.cancel();
      verbosityDelta += ongoingHoverOperation.verbosityDelta;
    }
    const tokenSource = new CancellationTokenSource();
    this._ongoingHoverOperations.set(provider, { verbosityDelta, tokenSource });
    const context = { verbosityRequest: { verbosityDelta, previousHover: hoverSource.hover } };
    let hover;
    try {
      hover = await Promise.resolve(provider.provideHover(model, hoverSource.hoverPosition, tokenSource.token, context));
    } catch (e) {
      onUnexpectedExternalError(e);
    }
    tokenSource.dispose();
    this._ongoingHoverOperations.delete(provider);
    return hover;
  }
  _updateRenderedHoverPart(index, hoverPart) {
    if (index >= this.renderedHoverParts.length || index < 0) {
      return void 0;
    }
    const renderedHoverPart = this._renderHoverPart(hoverPart, this._onFinishedRendering);
    const currentRenderedHoverPart = this.renderedHoverParts[index];
    const currentRenderedMarkdown = currentRenderedHoverPart.hoverElement;
    const renderedMarkdown = renderedHoverPart.hoverElement;
    const renderedChildrenElements = Array.from(renderedMarkdown.children);
    currentRenderedMarkdown.replaceChildren(...renderedChildrenElements);
    const newRenderedHoverPart = new RenderedMarkdownHoverPart(
      hoverPart,
      currentRenderedMarkdown,
      renderedHoverPart.disposables,
      renderedHoverPart.actionsContainer
    );
    currentRenderedHoverPart.dispose();
    this.renderedHoverParts[index] = newRenderedHoverPart;
    return newRenderedHoverPart;
  }
  _getRenderedHoverPartAtIndex(index) {
    return this.renderedHoverParts[index];
  }
  dispose() {
    this._disposables.dispose();
  }
}
function renderMarkdownHovers(context, markdownHovers, editor, markdownRendererService) {
  markdownHovers.sort(compareBy((hover) => hover.ordinal, numberComparator));
  const renderedHoverParts = [];
  for (const markdownHover of markdownHovers) {
    const renderedHoverPart = renderMarkdown(
      editor,
      markdownHover,
      markdownRendererService,
      context.onContentsChanged
    );
    context.fragment.appendChild(renderedHoverPart.hoverElement);
    renderedHoverParts.push(renderedHoverPart);
  }
  return new RenderedHoverParts(renderedHoverParts);
}
function renderMarkdown(editor, markdownHover, markdownRendererService, onFinishedRendering) {
  const disposables = new DisposableStore();
  const renderedMarkdown = $("div.hover-row");
  const renderedMarkdownContents = $("div.hover-row-contents");
  renderedMarkdown.appendChild(renderedMarkdownContents);
  const markdownStrings = markdownHover.contents;
  for (const markdownString of markdownStrings) {
    if (isEmptyMarkdownString(markdownString)) {
      continue;
    }
    const markdownHoverElement = $("div.markdown-hover");
    const hoverContentsElement = dom.append(markdownHoverElement, $("div.hover-contents"));
    const renderedContents = disposables.add(markdownRendererService.render(markdownString, {
      context: editor,
      asyncRenderCallback: () => {
        hoverContentsElement.className = "hover-contents code-hover-contents";
        onFinishedRendering();
      }
    }));
    hoverContentsElement.appendChild(renderedContents.element);
    renderedMarkdownContents.appendChild(markdownHoverElement);
  }
  const renderedHoverPart = {
    hoverPart: markdownHover,
    hoverElement: renderedMarkdown,
    dispose() {
      disposables.dispose();
    }
  };
  return renderedHoverPart;
}
function labelForHoverVerbosityAction(keybindingService, action) {
  switch (action) {
    case HoverVerbosityAction.Increase:
      return keybindingService.appendKeybinding(nls.localize("increaseVerbosity", "Increase Hover Verbosity"), INCREASE_HOVER_VERBOSITY_ACTION_ID);
    case HoverVerbosityAction.Decrease:
      return keybindingService.appendKeybinding(nls.localize("decreaseVerbosity", "Decrease Hover Verbosity"), DECREASE_HOVER_VERBOSITY_ACTION_ID);
  }
}
export {
  MarkdownHover,
  MarkdownHoverParticipant,
  labelForHoverVerbosityAction,
  renderMarkdownHovers
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvbWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgYXNBcnJheSwgY29tcGFyZUJ5LCBudW1iZXJDb21wYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIGlzRW1wdHlNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgREVDUkVBU0VfSE9WRVJfVkVSQk9TSVRZX0FDVElPTl9JRCwgSU5DUkVBU0VfSE9WRVJfVkVSQk9TSVRZX0FDVElPTl9JRCwgSElERV9MT05HX0xJTkVfV0FSTklOR19IT1ZFUl9BQ1RJT05fSUQgfSBmcm9tICcuL2hvdmVyQWN0aW9uSWRzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWNvcmF0aW9uLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IEhvdmVyQW5jaG9yLCBIb3ZlckFuY2hvclR5cGUsIEhvdmVyUmFuZ2VBbmNob3IsIElFZGl0b3JIb3ZlclBhcnRpY2lwYW50LCBJRWRpdG9ySG92ZXJSZW5kZXJDb250ZXh0LCBJSG92ZXJQYXJ0LCBJUmVuZGVyZWRIb3ZlclBhcnQsIElSZW5kZXJlZEhvdmVyUGFydHMsIFJlbmRlcmVkSG92ZXJQYXJ0cyB9IGZyb20gJy4vaG92ZXJUeXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEhvdmVyLCBIb3ZlckNvbnRleHQsIEhvdmVyUHJvdmlkZXIsIEhvdmVyVmVyYm9zaXR5QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IENsaWNrQWN0aW9uLCBIb3ZlclBvc2l0aW9uLCBLZXlEb3duQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlLCBXb3JrYmVuY2hIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBBc3luY0l0ZXJhYmxlUHJvZHVjZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZUZlYXR1cmVSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBnZXRIb3ZlclByb3ZpZGVyUmVzdWx0c0FzQXN5bmNJdGVyYWJsZSB9IGZyb20gJy4vZ2V0SG92ZXIuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEhvdmVyU3RhcnRTb3VyY2UgfSBmcm9tICcuL2hvdmVyT3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFNjcm9sbEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcbmNvbnN0IGluY3JlYXNlSG92ZXJWZXJib3NpdHlJY29uID0gcmVnaXN0ZXJJY29uKCdob3Zlci1pbmNyZWFzZS12ZXJib3NpdHknLCBDb2RpY29uLmFkZFNtYWxsLCBubHMubG9jYWxpemUoJ2luY3JlYXNlSG92ZXJWZXJib3NpdHknLCAnSWNvbiBmb3IgaW5jcmVhc2VpbmcgaG92ZXIgdmVyYm9zaXR5LicpKTtcbmNvbnN0IGRlY3JlYXNlSG92ZXJWZXJib3NpdHlJY29uID0gcmVnaXN0ZXJJY29uKCdob3Zlci1kZWNyZWFzZS12ZXJib3NpdHknLCBDb2RpY29uLnJlbW92ZVNtYWxsLCBubHMubG9jYWxpemUoJ2RlY3JlYXNlSG92ZXJWZXJib3NpdHknLCAnSWNvbiBmb3IgZGVjcmVhc2luZyBob3ZlciB2ZXJib3NpdHkuJykpO1xuXG5leHBvcnQgY2xhc3MgTWFya2Rvd25Ib3ZlciBpbXBsZW1lbnRzIElIb3ZlclBhcnQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBvd25lcjogSUVkaXRvckhvdmVyUGFydGljaXBhbnQ8TWFya2Rvd25Ib3Zlcj4sXG5cdFx0cHVibGljIHJlYWRvbmx5IHJhbmdlOiBSYW5nZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgY29udGVudHM6IElNYXJrZG93blN0cmluZ1tdLFxuXHRcdHB1YmxpYyByZWFkb25seSBpc0JlZm9yZUNvbnRlbnQ6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IG9yZGluYWw6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgc291cmNlOiBIb3ZlclNvdXJjZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCxcblx0KSB7IH1cblxuXHRwdWJsaWMgaXNWYWxpZEZvckhvdmVyQW5jaG9yKGFuY2hvcjogSG92ZXJBbmNob3IpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0YW5jaG9yLnR5cGUgPT09IEhvdmVyQW5jaG9yVHlwZS5SYW5nZVxuXHRcdFx0JiYgdGhpcy5yYW5nZS5zdGFydENvbHVtbiA8PSBhbmNob3IucmFuZ2Uuc3RhcnRDb2x1bW5cblx0XHRcdCYmIHRoaXMucmFuZ2UuZW5kQ29sdW1uID49IGFuY2hvci5yYW5nZS5lbmRDb2x1bW5cblx0XHQpO1xuXHR9XG59XG5cbmNsYXNzIEhvdmVyU291cmNlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBob3ZlcjogSG92ZXIsXG5cdFx0cmVhZG9ubHkgaG92ZXJQcm92aWRlcjogSG92ZXJQcm92aWRlcixcblx0XHRyZWFkb25seSBob3ZlclBvc2l0aW9uOiBQb3NpdGlvbixcblx0KSB7IH1cblxuXHRwdWJsaWMgc3VwcG9ydHNWZXJib3NpdHlBY3Rpb24oaG92ZXJWZXJib3NpdHlBY3Rpb246IEhvdmVyVmVyYm9zaXR5QWN0aW9uKTogYm9vbGVhbiB7XG5cdFx0c3dpdGNoIChob3ZlclZlcmJvc2l0eUFjdGlvbikge1xuXHRcdFx0Y2FzZSBIb3ZlclZlcmJvc2l0eUFjdGlvbi5JbmNyZWFzZTpcblx0XHRcdFx0cmV0dXJuIHRoaXMuaG92ZXIuY2FuSW5jcmVhc2VWZXJib3NpdHkgPz8gZmFsc2U7XG5cdFx0XHRjYXNlIEhvdmVyVmVyYm9zaXR5QWN0aW9uLkRlY3JlYXNlOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5ob3Zlci5jYW5EZWNyZWFzZVZlcmJvc2l0eSA/PyBmYWxzZTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hcmtkb3duSG92ZXJQYXJ0aWNpcGFudCBpbXBsZW1lbnRzIElFZGl0b3JIb3ZlclBhcnRpY2lwYW50PE1hcmtkb3duSG92ZXI+IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaG92ZXJPcmRpbmFsOiBudW1iZXIgPSAzO1xuXG5cdHByaXZhdGUgX3JlbmRlcmVkSG92ZXJQYXJ0czogTWFya2Rvd25SZW5kZXJlZEhvdmVyUGFydHMgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cHVibGljIGNyZWF0ZUxvYWRpbmdNZXNzYWdlKGFuY2hvcjogSG92ZXJBbmNob3IpOiBNYXJrZG93bkhvdmVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIG5ldyBNYXJrZG93bkhvdmVyKHRoaXMsIGFuY2hvci5yYW5nZSwgW25ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQobmxzLmxvY2FsaXplKCdtb2Rlc0NvbnRlbnRIb3Zlci5sb2FkaW5nJywgXCJMb2FkaW5nLi4uXCIpKV0sIGZhbHNlLCAyMDAwKTtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlU3luYyhhbmNob3I6IEhvdmVyQW5jaG9yLCBsaW5lRGVjb3JhdGlvbnM6IElNb2RlbERlY29yYXRpb25bXSk6IE1hcmtkb3duSG92ZXJbXSB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSB8fCBhbmNob3IudHlwZSAhPT0gSG92ZXJBbmNob3JUeXBlLlJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBsaW5lTnVtYmVyID0gYW5jaG9yLnJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBtYXhDb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IHJlc3VsdDogTWFya2Rvd25Ib3ZlcltdID0gW107XG5cblx0XHRsZXQgaW5kZXggPSAxMDAwO1xuXG5cdFx0Y29uc3QgbGluZUxlbmd0aCA9IG1vZGVsLmdldExpbmVMZW5ndGgobGluZU51bWJlcik7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IG1vZGVsLmdldExhbmd1YWdlSWRBdFBvc2l0aW9uKGFuY2hvci5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGFuY2hvci5yYW5nZS5zdGFydENvbHVtbik7XG5cdFx0Y29uc3Qgc3RvcFJlbmRlcmluZ0xpbmVBZnRlciA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIpO1xuXHRcdGNvbnN0IG1heFRva2VuaXphdGlvbkxpbmVMZW5ndGggPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdlZGl0b3IubWF4VG9rZW5pemF0aW9uTGluZUxlbmd0aCcsIHtcblx0XHRcdG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2VJZFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNob3dMb25nTGluZVdhcm5pbmcgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5ob3Zlcikuc2hvd0xvbmdMaW5lV2FybmluZztcblx0XHRsZXQgc3RvcFJlbmRlcmluZ01lc3NhZ2UgPSBmYWxzZTtcblx0XHRpZiAoc3RvcFJlbmRlcmluZ0xpbmVBZnRlciA+PSAwICYmIGxpbmVMZW5ndGggPiBzdG9wUmVuZGVyaW5nTGluZUFmdGVyICYmIGFuY2hvci5yYW5nZS5zdGFydENvbHVtbiA+PSBzdG9wUmVuZGVyaW5nTGluZUFmdGVyKSB7XG5cdFx0XHRzdG9wUmVuZGVyaW5nTWVzc2FnZSA9IHRydWU7XG5cdFx0XHRpZiAoc2hvd0xvbmdMaW5lV2FybmluZykge1xuXHRcdFx0XHRyZXN1bHQucHVzaChuZXcgTWFya2Rvd25Ib3Zlcih0aGlzLCBhbmNob3IucmFuZ2UsIFt7XG5cdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHRcdHsga2V5OiAnc3RvcHBlZCByZW5kZXJpbmcnLCBjb21tZW50OiBbJ1BsZWFzZSBkbyBub3QgdHJhbnNsYXRlIHRoZSB3b3JkIFwiY29tbWFuZFwiLCBpdCBpcyBwYXJ0IG9mIG91ciBpbnRlcm5hbCBzeW50YXggd2hpY2ggbXVzdCBub3QgY2hhbmdlJywgJ3tMb2NrZWQ9XCJdKGNvbW1hbmQ6ezB9KVwifSddIH0sXG5cdFx0XHRcdFx0XHRcIlJlbmRlcmluZyBwYXVzZWQgZm9yIGxvbmcgbGluZSBmb3IgcGVyZm9ybWFuY2UgcmVhc29ucy4gVGhpcyBjYW4gYmUgY29uZmlndXJlZCB2aWEgYGVkaXRvci5zdG9wUmVuZGVyaW5nTGluZUFmdGVyYC4gW0Rvbid0IFNob3cgQWdhaW5dKGNvbW1hbmQ6ezB9KVwiLFxuXHRcdFx0XHRcdFx0SElERV9MT05HX0xJTkVfV0FSTklOR19IT1ZFUl9BQ1RJT05fSURcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGlzVHJ1c3RlZDogdHJ1ZVxuXHRcdFx0XHR9XSwgZmFsc2UsIGluZGV4KyspKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCFzdG9wUmVuZGVyaW5nTWVzc2FnZSAmJiB0eXBlb2YgbWF4VG9rZW5pemF0aW9uTGluZUxlbmd0aCA9PT0gJ251bWJlcicgJiYgbGluZUxlbmd0aCA+PSBtYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoKSB7XG5cdFx0XHRpZiAoc2hvd0xvbmdMaW5lV2FybmluZykge1xuXHRcdFx0XHRyZXN1bHQucHVzaChuZXcgTWFya2Rvd25Ib3Zlcih0aGlzLCBhbmNob3IucmFuZ2UsIFt7XG5cdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHRcdHsga2V5OiAndG9vIG1hbnkgY2hhcmFjdGVycycsIGNvbW1lbnQ6IFsnUGxlYXNlIGRvIG5vdCB0cmFuc2xhdGUgdGhlIHdvcmQgXCJjb21tYW5kXCIsIGl0IGlzIHBhcnQgb2Ygb3VyIGludGVybmFsIHN5bnRheCB3aGljaCBtdXN0IG5vdCBjaGFuZ2UnLCAne0xvY2tlZD1cIl0oY29tbWFuZDp7MH0pXCJ9J10gfSxcblx0XHRcdFx0XHRcdFwiVG9rZW5pemF0aW9uIGlzIHNraXBwZWQgZm9yIGxvbmcgbGluZXMgZm9yIHBlcmZvcm1hbmNlIHJlYXNvbnMuIFRoaXMgY2FuIGJlIGNvbmZpZ3VyZWQgdmlhIGBlZGl0b3IubWF4VG9rZW5pemF0aW9uTGluZUxlbmd0aGAuIFtEb24ndCBTaG93IEFnYWluXShjb21tYW5kOnswfSlcIixcblx0XHRcdFx0XHRcdEhJREVfTE9OR19MSU5FX1dBUk5JTkdfSE9WRVJfQUNUSU9OX0lEXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRpc1RydXN0ZWQ6IHRydWVcblx0XHRcdFx0fV0sIGZhbHNlLCBpbmRleCsrKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IGlzQmVmb3JlQ29udGVudCA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCBkIG9mIGxpbmVEZWNvcmF0aW9ucykge1xuXHRcdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSAoZC5yYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIpID8gZC5yYW5nZS5zdGFydENvbHVtbiA6IDE7XG5cdFx0XHRjb25zdCBlbmRDb2x1bW4gPSAoZC5yYW5nZS5lbmRMaW5lTnVtYmVyID09PSBsaW5lTnVtYmVyKSA/IGQucmFuZ2UuZW5kQ29sdW1uIDogbWF4Q29sdW1uO1xuXG5cdFx0XHRjb25zdCBob3Zlck1lc3NhZ2UgPSBkLm9wdGlvbnMuaG92ZXJNZXNzYWdlO1xuXHRcdFx0aWYgKCFob3Zlck1lc3NhZ2UgfHwgaXNFbXB0eU1hcmtkb3duU3RyaW5nKGhvdmVyTWVzc2FnZSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkLm9wdGlvbnMuYmVmb3JlQ29udGVudENsYXNzTmFtZSkge1xuXHRcdFx0XHRpc0JlZm9yZUNvbnRlbnQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShhbmNob3IucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgYW5jaG9yLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgZW5kQ29sdW1uKTtcblx0XHRcdHJlc3VsdC5wdXNoKG5ldyBNYXJrZG93bkhvdmVyKHRoaXMsIHJhbmdlLCBhc0FycmF5KGhvdmVyTWVzc2FnZSksIGlzQmVmb3JlQ29udGVudCwgaW5kZXgrKykpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZUFzeW5jKGFuY2hvcjogSG92ZXJBbmNob3IsIGxpbmVEZWNvcmF0aW9uczogSU1vZGVsRGVjb3JhdGlvbltdLCBzb3VyY2U6IEhvdmVyU3RhcnRTb3VyY2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IEFzeW5jSXRlcmFibGU8TWFya2Rvd25Ib3Zlcj4ge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkgfHwgYW5jaG9yLnR5cGUgIT09IEhvdmVyQW5jaG9yVHlwZS5SYW5nZSkge1xuXHRcdFx0cmV0dXJuIEFzeW5jSXRlcmFibGVQcm9kdWNlci5FTVBUWTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXG5cdFx0Y29uc3QgaG92ZXJQcm92aWRlclJlZ2lzdHJ5ID0gdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaG92ZXJQcm92aWRlcjtcblx0XHRpZiAoIWhvdmVyUHJvdmlkZXJSZWdpc3RyeS5oYXMobW9kZWwpKSB7XG5cdFx0XHRyZXR1cm4gQXN5bmNJdGVyYWJsZVByb2R1Y2VyLkVNUFRZO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZ2V0TWFya2Rvd25Ib3ZlcnMoaG92ZXJQcm92aWRlclJlZ2lzdHJ5LCBtb2RlbCwgYW5jaG9yLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jICpfZ2V0TWFya2Rvd25Ib3ZlcnMoaG92ZXJQcm92aWRlclJlZ2lzdHJ5OiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxIb3ZlclByb3ZpZGVyPiwgbW9kZWw6IElUZXh0TW9kZWwsIGFuY2hvcjogSG92ZXJSYW5nZUFuY2hvciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogQXN5bmNJdGVyYWJsZTxNYXJrZG93bkhvdmVyPiB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBhbmNob3IucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IGhvdmVyUHJvdmlkZXJSZXN1bHRzID0gZ2V0SG92ZXJQcm92aWRlclJlc3VsdHNBc0FzeW5jSXRlcmFibGUoaG92ZXJQcm92aWRlclJlZ2lzdHJ5LCBtb2RlbCwgcG9zaXRpb24sIHRva2VuKTtcblxuXHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBob3ZlclByb3ZpZGVyUmVzdWx0cykge1xuXHRcdFx0aWYgKCFpc0VtcHR5TWFya2Rvd25TdHJpbmcoaXRlbS5ob3Zlci5jb250ZW50cykpIHtcblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBpdGVtLmhvdmVyLnJhbmdlID8gUmFuZ2UubGlmdChpdGVtLmhvdmVyLnJhbmdlKSA6IGFuY2hvci5yYW5nZTtcblx0XHRcdFx0Y29uc3QgaG92ZXJTb3VyY2UgPSBuZXcgSG92ZXJTb3VyY2UoaXRlbS5ob3ZlciwgaXRlbS5wcm92aWRlciwgcG9zaXRpb24pO1xuXHRcdFx0XHR5aWVsZCBuZXcgTWFya2Rvd25Ib3Zlcih0aGlzLCByYW5nZSwgaXRlbS5ob3Zlci5jb250ZW50cywgZmFsc2UsIGl0ZW0ub3JkaW5hbCwgaG92ZXJTb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZW5kZXJIb3ZlclBhcnRzKGNvbnRleHQ6IElFZGl0b3JIb3ZlclJlbmRlckNvbnRleHQsIGhvdmVyUGFydHM6IE1hcmtkb3duSG92ZXJbXSk6IElSZW5kZXJlZEhvdmVyUGFydHM8TWFya2Rvd25Ib3Zlcj4ge1xuXHRcdHRoaXMuX3JlbmRlcmVkSG92ZXJQYXJ0cyA9IG5ldyBNYXJrZG93blJlbmRlcmVkSG92ZXJQYXJ0cyhcblx0XHRcdGhvdmVyUGFydHMsXG5cdFx0XHRjb250ZXh0LmZyYWdtZW50LFxuXHRcdFx0dGhpcyxcblx0XHRcdHRoaXMuX2VkaXRvcixcblx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0XHR0aGlzLl9ob3ZlclNlcnZpY2UsXG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHRoaXMuX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdFx0Y29udGV4dC5vbkNvbnRlbnRzQ2hhbmdlZFxuXHRcdCk7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkSG92ZXJQYXJ0cztcblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVTY3JvbGwoZTogU2Nyb2xsRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW5kZXJlZEhvdmVyUGFydHM/LmhhbmRsZVNjcm9sbChlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY2Nlc3NpYmxlQ29udGVudChob3ZlclBhcnQ6IE1hcmtkb3duSG92ZXIpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlZEhvdmVyUGFydHM/LmdldEFjY2Vzc2libGVDb250ZW50KGhvdmVyUGFydCkgPz8gJyc7XG5cdH1cblxuXHRwdWJsaWMgZG9lc01hcmtkb3duSG92ZXJBdEluZGV4U3VwcG9ydFZlcmJvc2l0eUFjdGlvbihpbmRleDogbnVtYmVyLCBhY3Rpb246IEhvdmVyVmVyYm9zaXR5QWN0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkSG92ZXJQYXJ0cz8uZG9lc01hcmtkb3duSG92ZXJBdEluZGV4U3VwcG9ydFZlcmJvc2l0eUFjdGlvbihpbmRleCwgYWN0aW9uKSA/PyBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVNYXJrZG93bkhvdmVyVmVyYm9zaXR5TGV2ZWwoYWN0aW9uOiBIb3ZlclZlcmJvc2l0eUFjdGlvbiwgaW5kZXg6IG51bWJlcik6IFByb21pc2U8eyBob3ZlclBhcnQ6IE1hcmtkb3duSG92ZXI7IGhvdmVyRWxlbWVudDogSFRNTEVsZW1lbnQgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5fcmVuZGVyZWRIb3ZlclBhcnRzPy51cGRhdGVNYXJrZG93bkhvdmVyUGFydFZlcmJvc2l0eUxldmVsKGFjdGlvbiwgaW5kZXgpKTtcblx0fVxufVxuXG5jbGFzcyBSZW5kZXJlZE1hcmtkb3duSG92ZXJQYXJ0IGltcGxlbWVudHMgSVJlbmRlcmVkSG92ZXJQYXJ0PE1hcmtkb3duSG92ZXI+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgaG92ZXJQYXJ0OiBNYXJrZG93bkhvdmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBob3ZlckVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHB1YmxpYyByZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdHB1YmxpYyByZWFkb25seSBhY3Rpb25zQ29udGFpbmVyPzogSFRNTEVsZW1lbnRcblx0KSB7IH1cblxuXHRnZXQgaG92ZXJBY2Nlc3NpYmxlQ29udGVudCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmhvdmVyRWxlbWVudC5pbm5lclRleHQudHJpbSgpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBNYXJrZG93blJlbmRlcmVkSG92ZXJQYXJ0cyBpbXBsZW1lbnRzIElSZW5kZXJlZEhvdmVyUGFydHM8TWFya2Rvd25Ib3Zlcj4ge1xuXG5cdHB1YmxpYyByZW5kZXJlZEhvdmVyUGFydHM6IFJlbmRlcmVkTWFya2Rvd25Ib3ZlclBhcnRbXTtcblxuXHRwcml2YXRlIF9vbmdvaW5nSG92ZXJPcGVyYXRpb25zOiBNYXA8SG92ZXJQcm92aWRlciwgeyB2ZXJib3NpdHlEZWx0YTogbnVtYmVyOyB0b2tlblNvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfT4gPSBuZXcgTWFwKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aG92ZXJQYXJ0czogTWFya2Rvd25Ib3ZlcltdLFxuXHRcdGhvdmVyUGFydHNDb250YWluZXI6IERvY3VtZW50RnJhZ21lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXJQYXJ0aWNpcGFudDogTWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25GaW5pc2hlZFJlbmRlcmluZzogKCkgPT4gdm9pZCxcblx0KSB7XG5cdFx0dGhpcy5yZW5kZXJlZEhvdmVyUGFydHMgPSB0aGlzLl9yZW5kZXJIb3ZlclBhcnRzKGhvdmVyUGFydHMsIGhvdmVyUGFydHNDb250YWluZXIsIHRoaXMuX29uRmluaXNoZWRSZW5kZXJpbmcpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5yZW5kZXJlZEhvdmVyUGFydHMuZm9yRWFjaChyZW5kZXJlZEhvdmVyUGFydCA9PiB7XG5cdFx0XHRcdHJlbmRlcmVkSG92ZXJQYXJ0LmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fb25nb2luZ0hvdmVyT3BlcmF0aW9ucy5mb3JFYWNoKG9wZXJhdGlvbiA9PiB7XG5cdFx0XHRcdG9wZXJhdGlvbi50b2tlblNvdXJjZS5kaXNwb3NlKHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVySG92ZXJQYXJ0cyhcblx0XHRob3ZlclBhcnRzOiBNYXJrZG93bkhvdmVyW10sXG5cdFx0aG92ZXJQYXJ0c0NvbnRhaW5lcjogRG9jdW1lbnRGcmFnbWVudCxcblx0XHRvbkZpbmlzaGVkUmVuZGVyaW5nOiAoKSA9PiB2b2lkLFxuXHQpOiBSZW5kZXJlZE1hcmtkb3duSG92ZXJQYXJ0W10ge1xuXHRcdGhvdmVyUGFydHMuc29ydChjb21wYXJlQnkoaG92ZXIgPT4gaG92ZXIub3JkaW5hbCwgbnVtYmVyQ29tcGFyYXRvcikpO1xuXHRcdHJldHVybiBob3ZlclBhcnRzLm1hcChob3ZlclBhcnQgPT4ge1xuXHRcdFx0Y29uc3QgcmVuZGVyZWRIb3ZlclBhcnQgPSB0aGlzLl9yZW5kZXJIb3ZlclBhcnQoaG92ZXJQYXJ0LCBvbkZpbmlzaGVkUmVuZGVyaW5nKTtcblx0XHRcdGhvdmVyUGFydHNDb250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVyZWRIb3ZlclBhcnQuaG92ZXJFbGVtZW50KTtcblx0XHRcdHJldHVybiByZW5kZXJlZEhvdmVyUGFydDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckhvdmVyUGFydChcblx0XHRob3ZlclBhcnQ6IE1hcmtkb3duSG92ZXIsXG5cdFx0b25GaW5pc2hlZFJlbmRlcmluZzogKCkgPT4gdm9pZFxuXHQpOiBSZW5kZXJlZE1hcmtkb3duSG92ZXJQYXJ0IHtcblxuXHRcdGNvbnN0IHJlbmRlcmVkTWFya2Rvd25QYXJ0ID0gdGhpcy5fcmVuZGVyTWFya2Rvd25Ib3Zlcihob3ZlclBhcnQsIG9uRmluaXNoZWRSZW5kZXJpbmcpO1xuXHRcdGNvbnN0IHJlbmRlcmVkTWFya2Rvd25FbGVtZW50ID0gcmVuZGVyZWRNYXJrZG93blBhcnQuaG92ZXJFbGVtZW50O1xuXHRcdGNvbnN0IGhvdmVyU291cmNlID0gaG92ZXJQYXJ0LnNvdXJjZTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVuZGVyZWRNYXJrZG93blBhcnQpO1xuXG5cdFx0aWYgKCFob3ZlclNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIG5ldyBSZW5kZXJlZE1hcmtkb3duSG92ZXJQYXJ0KGhvdmVyUGFydCwgcmVuZGVyZWRNYXJrZG93bkVsZW1lbnQsIGRpc3Bvc2FibGVzKTtcblx0XHR9XG5cblx0XHRjb25zdCBjYW5JbmNyZWFzZVZlcmJvc2l0eSA9IGhvdmVyU291cmNlLnN1cHBvcnRzVmVyYm9zaXR5QWN0aW9uKEhvdmVyVmVyYm9zaXR5QWN0aW9uLkluY3JlYXNlKTtcblx0XHRjb25zdCBjYW5EZWNyZWFzZVZlcmJvc2l0eSA9IGhvdmVyU291cmNlLnN1cHBvcnRzVmVyYm9zaXR5QWN0aW9uKEhvdmVyVmVyYm9zaXR5QWN0aW9uLkRlY3JlYXNlKTtcblxuXHRcdGlmICghY2FuSW5jcmVhc2VWZXJib3NpdHkgJiYgIWNhbkRlY3JlYXNlVmVyYm9zaXR5KSB7XG5cdFx0XHRyZXR1cm4gbmV3IFJlbmRlcmVkTWFya2Rvd25Ib3ZlclBhcnQoaG92ZXJQYXJ0LCByZW5kZXJlZE1hcmtkb3duRWxlbWVudCwgZGlzcG9zYWJsZXMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSAkKCdkaXYudmVyYm9zaXR5LWFjdGlvbnMnKTtcblx0XHRyZW5kZXJlZE1hcmtkb3duRWxlbWVudC5wcmVwZW5kKGFjdGlvbnNDb250YWluZXIpO1xuXHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXJJbm5lciA9ICQoJ2Rpdi52ZXJib3NpdHktYWN0aW9ucy1pbm5lcicpO1xuXHRcdGFjdGlvbnNDb250YWluZXIuYXBwZW5kKGFjdGlvbnNDb250YWluZXJJbm5lcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3JlbmRlckhvdmVyRXhwYW5zaW9uQWN0aW9uKGFjdGlvbnNDb250YWluZXJJbm5lciwgSG92ZXJWZXJib3NpdHlBY3Rpb24uSW5jcmVhc2UsIGNhbkluY3JlYXNlVmVyYm9zaXR5KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3JlbmRlckhvdmVyRXhwYW5zaW9uQWN0aW9uKGFjdGlvbnNDb250YWluZXJJbm5lciwgSG92ZXJWZXJib3NpdHlBY3Rpb24uRGVjcmVhc2UsIGNhbkRlY3JlYXNlVmVyYm9zaXR5KSk7XG5cdFx0cmV0dXJuIG5ldyBSZW5kZXJlZE1hcmtkb3duSG92ZXJQYXJ0KGhvdmVyUGFydCwgcmVuZGVyZWRNYXJrZG93bkVsZW1lbnQsIGRpc3Bvc2FibGVzLCBhY3Rpb25zQ29udGFpbmVySW5uZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyTWFya2Rvd25Ib3Zlcihcblx0XHRtYXJrZG93bkhvdmVyOiBNYXJrZG93bkhvdmVyLFxuXHRcdG9uRmluaXNoZWRSZW5kZXJpbmc6ICgpID0+IHZvaWRcblx0KTogSVJlbmRlcmVkSG92ZXJQYXJ0PE1hcmtkb3duSG92ZXI+IHtcblx0XHRjb25zdCByZW5kZXJlZE1hcmtkb3duSG92ZXIgPSByZW5kZXJNYXJrZG93bihcblx0XHRcdHRoaXMuX2VkaXRvcixcblx0XHRcdG1hcmtkb3duSG92ZXIsXG5cdFx0XHR0aGlzLl9tYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRcdG9uRmluaXNoZWRSZW5kZXJpbmcsXG5cdFx0KTtcblx0XHRyZXR1cm4gcmVuZGVyZWRNYXJrZG93bkhvdmVyO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVySG92ZXJFeHBhbnNpb25BY3Rpb24oY29udGFpbmVyOiBIVE1MRWxlbWVudCwgYWN0aW9uOiBIb3ZlclZlcmJvc2l0eUFjdGlvbiwgYWN0aW9uRW5hYmxlZDogYm9vbGVhbik6IERpc3Bvc2FibGVTdG9yZSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaXNBY3Rpb25JbmNyZWFzZSA9IGFjdGlvbiA9PT0gSG92ZXJWZXJib3NpdHlBY3Rpb24uSW5jcmVhc2U7XG5cdFx0Y29uc3QgYWN0aW9uRWxlbWVudCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGlzQWN0aW9uSW5jcmVhc2UgPyBpbmNyZWFzZUhvdmVyVmVyYm9zaXR5SWNvbiA6IGRlY3JlYXNlSG92ZXJWZXJib3NpdHlJY29uKSkpO1xuXHRcdGFjdGlvbkVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdGNvbnN0IGhvdmVyRGVsZWdhdGUgPSBzdG9yZS5hZGQobmV3IFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUoJ21vdXNlJywgdW5kZWZpbmVkLCB7IHRhcmdldDogY29udGFpbmVyLCBwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkxFRlQgfSB9LCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5faG92ZXJTZXJ2aWNlKSk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihob3ZlckRlbGVnYXRlLCBhY3Rpb25FbGVtZW50LCBsYWJlbEZvckhvdmVyVmVyYm9zaXR5QWN0aW9uKHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLCBhY3Rpb24pKSk7XG5cdFx0aWYgKCFhY3Rpb25FbmFibGVkKSB7XG5cdFx0XHRhY3Rpb25FbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0XHRyZXR1cm4gc3RvcmU7XG5cdFx0fVxuXHRcdGFjdGlvbkVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZW5hYmxlZCcpO1xuXHRcdGNvbnN0IGFjdGlvbkZ1bmN0aW9uID0gKCkgPT4gdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoYWN0aW9uID09PSBIb3ZlclZlcmJvc2l0eUFjdGlvbi5JbmNyZWFzZSA/IElOQ1JFQVNFX0hPVkVSX1ZFUkJPU0lUWV9BQ1RJT05fSUQgOiBERUNSRUFTRV9IT1ZFUl9WRVJCT1NJVFlfQUNUSU9OX0lELCB7IGZvY3VzOiB0cnVlIH0pO1xuXHRcdHN0b3JlLmFkZChuZXcgQ2xpY2tBY3Rpb24oYWN0aW9uRWxlbWVudCwgYWN0aW9uRnVuY3Rpb24pKTtcblx0XHRzdG9yZS5hZGQobmV3IEtleURvd25BY3Rpb24oYWN0aW9uRWxlbWVudCwgYWN0aW9uRnVuY3Rpb24sIFtLZXlDb2RlLkVudGVyLCBLZXlDb2RlLlNwYWNlXSkpO1xuXHRcdHJldHVybiBzdG9yZTtcblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVTY3JvbGwoZTogU2Nyb2xsRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcmVkSG92ZXJQYXJ0cy5mb3JFYWNoKHJlbmRlcmVkSG92ZXJQYXJ0ID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXJJbm5lciA9IHJlbmRlcmVkSG92ZXJQYXJ0LmFjdGlvbnNDb250YWluZXI7XG5cdFx0XHRpZiAoIWFjdGlvbnNDb250YWluZXJJbm5lcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBob3ZlckVsZW1lbnQgPSByZW5kZXJlZEhvdmVyUGFydC5ob3ZlckVsZW1lbnQ7XG5cdFx0XHRjb25zdCB0b3BPZkhvdmVyU2Nyb2xsUG9zaXRpb24gPSBlLnNjcm9sbFRvcDtcblx0XHRcdGNvbnN0IGJvdHRvbU9mSG92ZXJTY3JvbGxQb3NpdGlvbiA9IHRvcE9mSG92ZXJTY3JvbGxQb3NpdGlvbiArIGUuaGVpZ2h0O1xuXHRcdFx0Y29uc3QgdG9wT2ZSZW5kZXJlZFBhcnQgPSBob3ZlckVsZW1lbnQub2Zmc2V0VG9wO1xuXHRcdFx0Y29uc3QgaG92ZXJFbGVtZW50SGVpZ2h0ID0gaG92ZXJFbGVtZW50LmNsaWVudEhlaWdodDtcblx0XHRcdGNvbnN0IGJvdHRvbU9mUmVuZGVyZWRQYXJ0ID0gdG9wT2ZSZW5kZXJlZFBhcnQgKyBob3ZlckVsZW1lbnRIZWlnaHQ7XG5cdFx0XHRjb25zdCBpY29uc0hlaWdodCA9IDIyO1xuXHRcdFx0bGV0IHRvcDogbnVtYmVyO1xuXHRcdFx0aWYgKGJvdHRvbU9mUmVuZGVyZWRQYXJ0IDw9IGJvdHRvbU9mSG92ZXJTY3JvbGxQb3NpdGlvbiB8fCB0b3BPZlJlbmRlcmVkUGFydCA+PSBib3R0b21PZkhvdmVyU2Nyb2xsUG9zaXRpb24pIHtcblx0XHRcdFx0dG9wID0gaG92ZXJFbGVtZW50SGVpZ2h0IC0gaWNvbnNIZWlnaHQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0b3AgPSBib3R0b21PZkhvdmVyU2Nyb2xsUG9zaXRpb24gLSB0b3BPZlJlbmRlcmVkUGFydCAtIGljb25zSGVpZ2h0O1xuXHRcdFx0fVxuXHRcdFx0YWN0aW9uc0NvbnRhaW5lcklubmVyLnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdXBkYXRlTWFya2Rvd25Ib3ZlclBhcnRWZXJib3NpdHlMZXZlbChhY3Rpb246IEhvdmVyVmVyYm9zaXR5QWN0aW9uLCBpbmRleDogbnVtYmVyKTogUHJvbWlzZTx7IGhvdmVyUGFydDogTWFya2Rvd25Ib3ZlcjsgaG92ZXJFbGVtZW50OiBIVE1MRWxlbWVudCB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBob3ZlclJlbmRlcmVkUGFydCA9IHRoaXMuX2dldFJlbmRlcmVkSG92ZXJQYXJ0QXRJbmRleChpbmRleCk7XG5cdFx0Y29uc3QgaG92ZXJTb3VyY2UgPSBob3ZlclJlbmRlcmVkUGFydD8uaG92ZXJQYXJ0LnNvdXJjZTtcblx0XHRpZiAoIWhvdmVyUmVuZGVyZWRQYXJ0IHx8ICFob3ZlclNvdXJjZT8uc3VwcG9ydHNWZXJib3NpdHlBY3Rpb24oYWN0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbmV3SG92ZXIgPSBhd2FpdCB0aGlzLl9mZXRjaEhvdmVyKGhvdmVyU291cmNlLCBtb2RlbCwgYWN0aW9uKTtcblx0XHRpZiAoIW5ld0hvdmVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBuZXdIb3ZlclNvdXJjZSA9IG5ldyBIb3ZlclNvdXJjZShuZXdIb3ZlciwgaG92ZXJTb3VyY2UuaG92ZXJQcm92aWRlciwgaG92ZXJTb3VyY2UuaG92ZXJQb3NpdGlvbik7XG5cdFx0Y29uc3QgaW5pdGlhbEhvdmVyUGFydCA9IGhvdmVyUmVuZGVyZWRQYXJ0LmhvdmVyUGFydDtcblx0XHRjb25zdCBuZXdIb3ZlclBhcnQgPSBuZXcgTWFya2Rvd25Ib3Zlcihcblx0XHRcdHRoaXMuX2hvdmVyUGFydGljaXBhbnQsXG5cdFx0XHRpbml0aWFsSG92ZXJQYXJ0LnJhbmdlLFxuXHRcdFx0bmV3SG92ZXIuY29udGVudHMsXG5cdFx0XHRpbml0aWFsSG92ZXJQYXJ0LmlzQmVmb3JlQ29udGVudCxcblx0XHRcdGluaXRpYWxIb3ZlclBhcnQub3JkaW5hbCxcblx0XHRcdG5ld0hvdmVyU291cmNlXG5cdFx0KTtcblx0XHRjb25zdCBuZXdIb3ZlclJlbmRlcmVkUGFydCA9IHRoaXMuX3VwZGF0ZVJlbmRlcmVkSG92ZXJQYXJ0KGluZGV4LCBuZXdIb3ZlclBhcnQpO1xuXHRcdGlmICghbmV3SG92ZXJSZW5kZXJlZFBhcnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRob3ZlclBhcnQ6IG5ld0hvdmVyUGFydCxcblx0XHRcdGhvdmVyRWxlbWVudDogbmV3SG92ZXJSZW5kZXJlZFBhcnQuaG92ZXJFbGVtZW50XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY2Nlc3NpYmxlQ29udGVudChob3ZlclBhcnQ6IE1hcmtkb3duSG92ZXIpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlbmRlcmVkSG92ZXJQYXJ0SW5kZXggPSB0aGlzLnJlbmRlcmVkSG92ZXJQYXJ0cy5maW5kSW5kZXgocmVuZGVyZWRIb3ZlclBhcnQgPT4gcmVuZGVyZWRIb3ZlclBhcnQuaG92ZXJQYXJ0ID09PSBob3ZlclBhcnQpO1xuXHRcdGlmIChyZW5kZXJlZEhvdmVyUGFydEluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVuZGVyZWRIb3ZlclBhcnQgPSB0aGlzLl9nZXRSZW5kZXJlZEhvdmVyUGFydEF0SW5kZXgocmVuZGVyZWRIb3ZlclBhcnRJbmRleCk7XG5cdFx0aWYgKCFyZW5kZXJlZEhvdmVyUGFydCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgaG92ZXJFbGVtZW50SW5uZXJUZXh0ID0gcmVuZGVyZWRIb3ZlclBhcnQuaG92ZXJFbGVtZW50LmlubmVyVGV4dDtcblx0XHRjb25zdCBhY2Nlc3NpYmxlQ29udGVudCA9IGhvdmVyRWxlbWVudElubmVyVGV4dC5yZXBsYWNlKC9bXlxcU1xcblxccl0rL2d1LCAnICcpO1xuXHRcdHJldHVybiBhY2Nlc3NpYmxlQ29udGVudDtcblx0fVxuXG5cdHB1YmxpYyBkb2VzTWFya2Rvd25Ib3ZlckF0SW5kZXhTdXBwb3J0VmVyYm9zaXR5QWN0aW9uKGluZGV4OiBudW1iZXIsIGFjdGlvbjogSG92ZXJWZXJib3NpdHlBY3Rpb24pOiBib29sZWFuIHtcblx0XHRjb25zdCBob3ZlclJlbmRlcmVkUGFydCA9IHRoaXMuX2dldFJlbmRlcmVkSG92ZXJQYXJ0QXRJbmRleChpbmRleCk7XG5cdFx0Y29uc3QgaG92ZXJTb3VyY2UgPSBob3ZlclJlbmRlcmVkUGFydD8uaG92ZXJQYXJ0LnNvdXJjZTtcblx0XHRpZiAoIWhvdmVyUmVuZGVyZWRQYXJ0IHx8ICFob3ZlclNvdXJjZT8uc3VwcG9ydHNWZXJib3NpdHlBY3Rpb24oYWN0aW9uKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZldGNoSG92ZXIoaG92ZXJTb3VyY2U6IEhvdmVyU291cmNlLCBtb2RlbDogSVRleHRNb2RlbCwgYWN0aW9uOiBIb3ZlclZlcmJvc2l0eUFjdGlvbik6IFByb21pc2U8SG92ZXIgfCBudWxsIHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IHZlcmJvc2l0eURlbHRhID0gYWN0aW9uID09PSBIb3ZlclZlcmJvc2l0eUFjdGlvbi5JbmNyZWFzZSA/IDEgOiAtMTtcblx0XHRjb25zdCBwcm92aWRlciA9IGhvdmVyU291cmNlLmhvdmVyUHJvdmlkZXI7XG5cdFx0Y29uc3Qgb25nb2luZ0hvdmVyT3BlcmF0aW9uID0gdGhpcy5fb25nb2luZ0hvdmVyT3BlcmF0aW9ucy5nZXQocHJvdmlkZXIpO1xuXHRcdGlmIChvbmdvaW5nSG92ZXJPcGVyYXRpb24pIHtcblx0XHRcdG9uZ29pbmdIb3Zlck9wZXJhdGlvbi50b2tlblNvdXJjZS5jYW5jZWwoKTtcblx0XHRcdHZlcmJvc2l0eURlbHRhICs9IG9uZ29pbmdIb3Zlck9wZXJhdGlvbi52ZXJib3NpdHlEZWx0YTtcblx0XHR9XG5cdFx0Y29uc3QgdG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9vbmdvaW5nSG92ZXJPcGVyYXRpb25zLnNldChwcm92aWRlciwgeyB2ZXJib3NpdHlEZWx0YSwgdG9rZW5Tb3VyY2UgfSk7XG5cdFx0Y29uc3QgY29udGV4dDogSG92ZXJDb250ZXh0ID0geyB2ZXJib3NpdHlSZXF1ZXN0OiB7IHZlcmJvc2l0eURlbHRhLCBwcmV2aW91c0hvdmVyOiBob3ZlclNvdXJjZS5ob3ZlciB9IH07XG5cdFx0bGV0IGhvdmVyOiBIb3ZlciB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGhvdmVyID0gYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHByb3ZpZGVyLnByb3ZpZGVIb3Zlcihtb2RlbCwgaG92ZXJTb3VyY2UuaG92ZXJQb3NpdGlvbiwgdG9rZW5Tb3VyY2UudG9rZW4sIGNvbnRleHQpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yKGUpO1xuXHRcdH1cblx0XHR0b2tlblNvdXJjZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25nb2luZ0hvdmVyT3BlcmF0aW9ucy5kZWxldGUocHJvdmlkZXIpO1xuXHRcdHJldHVybiBob3Zlcjtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVJlbmRlcmVkSG92ZXJQYXJ0KGluZGV4OiBudW1iZXIsIGhvdmVyUGFydDogTWFya2Rvd25Ib3Zlcik6IFJlbmRlcmVkTWFya2Rvd25Ib3ZlclBhcnQgfCB1bmRlZmluZWQge1xuXHRcdGlmIChpbmRleCA+PSB0aGlzLnJlbmRlcmVkSG92ZXJQYXJ0cy5sZW5ndGggfHwgaW5kZXggPCAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZW5kZXJlZEhvdmVyUGFydCA9IHRoaXMuX3JlbmRlckhvdmVyUGFydChob3ZlclBhcnQsIHRoaXMuX29uRmluaXNoZWRSZW5kZXJpbmcpO1xuXHRcdGNvbnN0IGN1cnJlbnRSZW5kZXJlZEhvdmVyUGFydCA9IHRoaXMucmVuZGVyZWRIb3ZlclBhcnRzW2luZGV4XTtcblx0XHRjb25zdCBjdXJyZW50UmVuZGVyZWRNYXJrZG93biA9IGN1cnJlbnRSZW5kZXJlZEhvdmVyUGFydC5ob3ZlckVsZW1lbnQ7XG5cdFx0Y29uc3QgcmVuZGVyZWRNYXJrZG93biA9IHJlbmRlcmVkSG92ZXJQYXJ0LmhvdmVyRWxlbWVudDtcblx0XHRjb25zdCByZW5kZXJlZENoaWxkcmVuRWxlbWVudHMgPSBBcnJheS5mcm9tKHJlbmRlcmVkTWFya2Rvd24uY2hpbGRyZW4pO1xuXHRcdGN1cnJlbnRSZW5kZXJlZE1hcmtkb3duLnJlcGxhY2VDaGlsZHJlbiguLi5yZW5kZXJlZENoaWxkcmVuRWxlbWVudHMpO1xuXHRcdGNvbnN0IG5ld1JlbmRlcmVkSG92ZXJQYXJ0ID0gbmV3IFJlbmRlcmVkTWFya2Rvd25Ib3ZlclBhcnQoXG5cdFx0XHRob3ZlclBhcnQsXG5cdFx0XHRjdXJyZW50UmVuZGVyZWRNYXJrZG93bixcblx0XHRcdHJlbmRlcmVkSG92ZXJQYXJ0LmRpc3Bvc2FibGVzLFxuXHRcdFx0cmVuZGVyZWRIb3ZlclBhcnQuYWN0aW9uc0NvbnRhaW5lclxuXHRcdCk7XG5cdFx0Y3VycmVudFJlbmRlcmVkSG92ZXJQYXJ0LmRpc3Bvc2UoKTtcblx0XHR0aGlzLnJlbmRlcmVkSG92ZXJQYXJ0c1tpbmRleF0gPSBuZXdSZW5kZXJlZEhvdmVyUGFydDtcblx0XHRyZXR1cm4gbmV3UmVuZGVyZWRIb3ZlclBhcnQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZW5kZXJlZEhvdmVyUGFydEF0SW5kZXgoaW5kZXg6IG51bWJlcik6IFJlbmRlcmVkTWFya2Rvd25Ib3ZlclBhcnQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnJlbmRlcmVkSG92ZXJQYXJ0c1tpbmRleF07XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlck1hcmtkb3duSG92ZXJzKFxuXHRjb250ZXh0OiBJRWRpdG9ySG92ZXJSZW5kZXJDb250ZXh0LFxuXHRtYXJrZG93bkhvdmVyczogTWFya2Rvd25Ib3ZlcltdLFxuXHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuKTogSVJlbmRlcmVkSG92ZXJQYXJ0czxNYXJrZG93bkhvdmVyPiB7XG5cblx0Ly8gU29ydCBob3ZlciBwYXJ0cyB0byBrZWVwIHRoZW0gc3RhYmxlIHNpbmNlIHRoZXkgbWlnaHQgY29tZSBpbiBhc3luYywgb3V0LW9mLW9yZGVyXG5cdG1hcmtkb3duSG92ZXJzLnNvcnQoY29tcGFyZUJ5KGhvdmVyID0+IGhvdmVyLm9yZGluYWwsIG51bWJlckNvbXBhcmF0b3IpKTtcblx0Y29uc3QgcmVuZGVyZWRIb3ZlclBhcnRzOiBJUmVuZGVyZWRIb3ZlclBhcnQ8TWFya2Rvd25Ib3Zlcj5bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IG1hcmtkb3duSG92ZXIgb2YgbWFya2Rvd25Ib3ZlcnMpIHtcblx0XHRjb25zdCByZW5kZXJlZEhvdmVyUGFydCA9IHJlbmRlck1hcmtkb3duKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0bWFya2Rvd25Ib3Zlcixcblx0XHRcdG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdFx0Y29udGV4dC5vbkNvbnRlbnRzQ2hhbmdlZCxcblx0XHQpO1xuXHRcdGNvbnRleHQuZnJhZ21lbnQuYXBwZW5kQ2hpbGQocmVuZGVyZWRIb3ZlclBhcnQuaG92ZXJFbGVtZW50KTtcblx0XHRyZW5kZXJlZEhvdmVyUGFydHMucHVzaChyZW5kZXJlZEhvdmVyUGFydCk7XG5cdH1cblx0cmV0dXJuIG5ldyBSZW5kZXJlZEhvdmVyUGFydHMocmVuZGVyZWRIb3ZlclBhcnRzKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyTWFya2Rvd24oXG5cdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdG1hcmtkb3duSG92ZXI6IE1hcmtkb3duSG92ZXIsXG5cdG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdG9uRmluaXNoZWRSZW5kZXJpbmc6ICgpID0+IHZvaWQsXG4pOiBJUmVuZGVyZWRIb3ZlclBhcnQ8TWFya2Rvd25Ib3Zlcj4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgcmVuZGVyZWRNYXJrZG93biA9ICQoJ2Rpdi5ob3Zlci1yb3cnKTtcblx0Y29uc3QgcmVuZGVyZWRNYXJrZG93bkNvbnRlbnRzID0gJCgnZGl2LmhvdmVyLXJvdy1jb250ZW50cycpO1xuXHRyZW5kZXJlZE1hcmtkb3duLmFwcGVuZENoaWxkKHJlbmRlcmVkTWFya2Rvd25Db250ZW50cyk7XG5cdGNvbnN0IG1hcmtkb3duU3RyaW5ncyA9IG1hcmtkb3duSG92ZXIuY29udGVudHM7XG5cdGZvciAoY29uc3QgbWFya2Rvd25TdHJpbmcgb2YgbWFya2Rvd25TdHJpbmdzKSB7XG5cdFx0aWYgKGlzRW1wdHlNYXJrZG93blN0cmluZyhtYXJrZG93blN0cmluZykpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBtYXJrZG93bkhvdmVyRWxlbWVudCA9ICQoJ2Rpdi5tYXJrZG93bi1ob3ZlcicpO1xuXHRcdGNvbnN0IGhvdmVyQ29udGVudHNFbGVtZW50ID0gZG9tLmFwcGVuZChtYXJrZG93bkhvdmVyRWxlbWVudCwgJCgnZGl2LmhvdmVyLWNvbnRlbnRzJykpO1xuXG5cdFx0Y29uc3QgcmVuZGVyZWRDb250ZW50cyA9IGRpc3Bvc2FibGVzLmFkZChtYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIobWFya2Rvd25TdHJpbmcsIHtcblx0XHRcdGNvbnRleHQ6IGVkaXRvcixcblx0XHRcdGFzeW5jUmVuZGVyQ2FsbGJhY2s6ICgpID0+IHtcblx0XHRcdFx0aG92ZXJDb250ZW50c0VsZW1lbnQuY2xhc3NOYW1lID0gJ2hvdmVyLWNvbnRlbnRzIGNvZGUtaG92ZXItY29udGVudHMnO1xuXHRcdFx0XHRvbkZpbmlzaGVkUmVuZGVyaW5nKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGhvdmVyQ29udGVudHNFbGVtZW50LmFwcGVuZENoaWxkKHJlbmRlcmVkQ29udGVudHMuZWxlbWVudCk7XG5cdFx0cmVuZGVyZWRNYXJrZG93bkNvbnRlbnRzLmFwcGVuZENoaWxkKG1hcmtkb3duSG92ZXJFbGVtZW50KTtcblx0fVxuXHRjb25zdCByZW5kZXJlZEhvdmVyUGFydDogSVJlbmRlcmVkSG92ZXJQYXJ0PE1hcmtkb3duSG92ZXI+ID0ge1xuXHRcdGhvdmVyUGFydDogbWFya2Rvd25Ib3Zlcixcblx0XHRob3ZlckVsZW1lbnQ6IHJlbmRlcmVkTWFya2Rvd24sXG5cdFx0ZGlzcG9zZSgpIHsgZGlzcG9zYWJsZXMuZGlzcG9zZSgpOyB9XG5cdH07XG5cdHJldHVybiByZW5kZXJlZEhvdmVyUGFydDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxhYmVsRm9ySG92ZXJWZXJib3NpdHlBY3Rpb24oa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSwgYWN0aW9uOiBIb3ZlclZlcmJvc2l0eUFjdGlvbik6IHN0cmluZyB7XG5cdHN3aXRjaCAoYWN0aW9uKSB7XG5cdFx0Y2FzZSBIb3ZlclZlcmJvc2l0eUFjdGlvbi5JbmNyZWFzZTpcblx0XHRcdHJldHVybiBrZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKG5scy5sb2NhbGl6ZSgnaW5jcmVhc2VWZXJib3NpdHknLCBcIkluY3JlYXNlIEhvdmVyIFZlcmJvc2l0eVwiKSwgSU5DUkVBU0VfSE9WRVJfVkVSQk9TSVRZX0FDVElPTl9JRCk7XG5cdFx0Y2FzZSBIb3ZlclZlcmJvc2l0eUFjdGlvbi5EZWNyZWFzZTpcblx0XHRcdHJldHVybiBrZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKG5scy5sb2NhbGl6ZSgnZGVjcmVhc2VWZXJib3NpdHknLCBcIkRlY3JlYXNlIEhvdmVyIFZlcmJvc2l0eVwiKSwgREVDUkVBU0VfSE9WRVJfVkVSQk9TSVRZX0FDVElPTl9JRCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsU0FBUyxXQUFXLHdCQUF3QjtBQUNyRCxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBMEIsdUJBQXVCLHNCQUFzQjtBQUN2RSxTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQ0FBb0Msb0NBQW9DLDhDQUE4QztBQUcvSCxTQUFTLGFBQWE7QUFFdEIsU0FBc0IsaUJBQTRJLDBCQUEw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
