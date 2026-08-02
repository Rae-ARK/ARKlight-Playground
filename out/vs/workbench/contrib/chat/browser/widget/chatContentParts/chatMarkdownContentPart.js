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
import * as dom from "../../../../../../base/browser/dom.js";
import { allowedMarkdownHtmlAttributes } from "../../../../../../base/browser/markdownRenderer.js";
import { status } from "../../../../../../base/browser/ui/aria/aria.js";
import { DomScrollableElement } from "../../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { wrapTablesWithScrollable } from "./chatMarkdownTableScrolling.js";
import { coalesce } from "../../../../../../base/common/arrays.js";
import { findLast } from "../../../../../../base/common/arraysFind.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { isCancellationError } from "../../../../../../base/common/errors.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { Disposable, DisposableStore, dispose, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { autorun, autorunSelfDisposable, derived } from "../../../../../../base/common/observable.js";
import { ScrollbarVisibility } from "../../../../../../base/common/scrollable.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { isLocation } from "../../../../../../editor/common/languages.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { EditDeltaInfo } from "../../../../../../editor/common/textModelEditSource.js";
import { localize } from "../../../../../../nls.js";
import { getFlatContextMenuActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { IEditorService, SIDE_GROUP } from "../../../../../services/editor/common/editorService.js";
import { AccessibilityWorkbenchSettingId } from "../../../../accessibility/browser/accessibilityConfiguration.js";
import { IAiEditTelemetryService } from "../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { MarkedKatexSupport } from "../../../../markdown/browser/markedKatexSupport.js";
import { extractCodeblockUrisFromText, extractVulnerabilitiesFromText } from "../../../common/widget/annotations.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { IChatSessionsService } from "../../../common/chatSessionsService.js";
import { isRequestVM, isResponseVM } from "../../../common/model/chatViewModel.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { IChatOutputRendererService } from "../../chatOutputItemRenderer.js";
import { allowedChatMarkdownHtmlTags } from "../chatContentMarkdownRenderer.js";
import { MarkdownDiffBlockPart, parseUnifiedDiff } from "./chatDiffBlockPart.js";
import { ChatMarkdownDecorationsRenderer } from "./chatMarkdownDecorationsRenderer.js";
import { CodeBlockPart } from "./codeBlockPart.js";
import "./media/chatCodeBlockPill.css";
import { ChatEditPillElement, isResourceContentEmpty } from "./chatEditPillElement.js";
import { ChatExtensionsContentPart } from "./chatExtensionsContentPart.js";
import { ChatProgressSubPart } from "./chatProgressContentPart.js";
import { IncrementalDOMMorpher } from "./chatIncrementalRendering/chatIncrementalRendering.js";
import { IChatOutputPartStateCache } from "./chatOutputPartStateCache.js";
import "./media/chatMarkdownPart.css";
const $ = dom.$;
let ChatMarkdownContentPart = class extends Disposable {
  constructor(markdown, context, editorPool, fillInIncompleteTokens = false, codeBlockStartIndex = 0, renderer, markdownRenderOptions, currentWidth, rendererOptions, contextKeyService, configurationService, instantiationService, aiEditTelemetryService, chatOutputRendererService, chatSessionsService) {
    super();
    this.markdown = markdown;
    this.editorPool = editorPool;
    this.rendererOptions = rendererOptions;
    this.instantiationService = instantiationService;
    this.aiEditTelemetryService = aiEditTelemetryService;
    this.chatOutputRendererService = chatOutputRendererService;
    this.chatSessionsService = chatSessionsService;
    this.codeblocksPartId = String(++ChatMarkdownContentPart.ID_POOL);
    // This Event exists for one specific scenario and the pattern shouldn't be copied without a good reason
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._onDidChangeDiff = this._register(new Emitter());
    /**
     * Fires when any edit pill (CollapsedCodeBlock) in this markdown part updates its diff.
     * The aggregated stats reflect the total added/removed across all edit pills.
     */
    this.onDidChangeDiff = this._onDidChangeDiff.event;
    this.allRefs = [];
    this._codeblocks = [];
    this.mathLayoutParticipants = /* @__PURE__ */ new Set();
    const element = context.element;
    const inUndoStop = findLast(context.content, (e) => e.kind === "undoStop", context.contentIndex)?.id;
    let globalCodeBlockIndexStart = codeBlockStartIndex;
    this.domNode = $("div.chat-markdown-part");
    if (this.rendererOptions.accessibilityOptions?.statusMessage) {
      this.domNode.ariaLabel = this.rendererOptions.accessibilityOptions.statusMessage;
      if (configurationService.getValue(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates)) {
        status(this.rendererOptions.accessibilityOptions.statusMessage);
      }
    }
    const enableMath = configurationService.getValue(ChatConfiguration.EnableMath);
    const incrementalRenderingEnabled = configurationService.getValue(ChatConfiguration.IncrementalRendering);
    if (incrementalRenderingEnabled && isResponseVM(element) && fillInIncompleteTokens && !element.isComplete) {
      this._incrementalMorpher = this._register(instantiationService.createInstance(IncrementalDOMMorpher, this.domNode));
      this._incrementalMorpher.setRenderCallback((newMd) => {
        const savedMarkdown = this.markdown;
        const content = new MarkdownString(newMd, this.markdown.content);
        content.baseUri = URI.revive(this.markdown.content.baseUri);
        content.uris = this.markdown.content.uris;
        this.markdown = { ...this.markdown, content };
        doRenderMarkdown();
        this.markdown = savedMarkdown;
        this._onDidChangeHeight.fire();
      });
    }
    const renderStore = this._register(new MutableDisposable());
    const doRenderMarkdown = () => {
      if (this._store.isDisposed) {
        return;
      }
      const previousRenderStore = renderStore.clearAndLeak();
      const reusableOutputCodeBlockRefs = /* @__PURE__ */ new Map();
      for (const ref of this.allRefs) {
        if (ref.object instanceof ChatOutputCodeBlockPart) {
          const outputRef = ref;
          previousRenderStore?.deleteAndLeak(outputRef);
          reusableOutputCodeBlockRefs.set(outputRef.object.reuseKey, outputRef);
        }
      }
      previousRenderStore?.dispose();
      const store = new DisposableStore();
      renderStore.value = store;
      dom.clearNode(this.domNode);
      this.allRefs.length = 0;
      this._codeblocks.length = 0;
      this.mathLayoutParticipants.clear();
      globalCodeBlockIndexStart = codeBlockStartIndex;
      const markedExtensions = enableMath ? coalesce([MarkedKatexSupport.getExtension(dom.getWindow(context.container), {
        throwOnError: false
      })]) : [];
      const markedOpts = {
        gfm: true,
        breaks: true
      };
      const configuredUriTransformer = markdownRenderOptions?.transformUri;
      const transformUri = isResponseVM(element) ? (href, kind) => this.chatSessionsService.resolveChatResponseUri(element.sessionResource, configuredUriTransformer?.(href, kind) ?? href, kind) : configuredUriTransformer;
      const result = store.add(renderer.render(this.markdown.content, {
        sanitizerConfig: MarkedKatexSupport.getSanitizerOptions({
          allowedTags: allowedChatMarkdownHtmlTags,
          allowedAttributes: allowedMarkdownHtmlAttributes
        }),
        fillInIncompleteTokens,
        codeBlockRendererSync: (languageId, text, raw) => {
          const isCodeBlockComplete = !isResponseVM(context.element) || context.element.isComplete || !raw || codeblockHasClosingBackticks(raw);
          const hasChatOutputRenderer = !!languageId && this.chatOutputRendererService.hasCodeBlockRenderer(languageId);
          if ((!text || text.startsWith("<vscode_codeblock_uri") && !text.includes("\n")) && !isCodeBlockComplete && !hasChatOutputRenderer) {
            const hideEmptyCodeblock = $("div");
            hideEmptyCodeblock.style.display = "none";
            return hideEmptyCodeblock;
          }
          if (languageId === "diff" && raw && this.rendererOptions.allowInlineDiffs) {
            const match = raw.match(/^```diff:(\w+)/);
            if (match && isResponseVM(context.element)) {
              const actualLanguageId = match[1];
              const codeBlockUri = extractCodeblockUrisFromText(text);
              const { before, after } = parseUnifiedDiff(codeBlockUri?.textWithoutResult ?? text);
              const diffData = {
                element: context.element,
                codeBlockIndex: globalCodeBlockIndexStart++,
                languageId: actualLanguageId,
                beforeContent: before,
                afterContent: after,
                codeBlockResource: codeBlockUri?.uri,
                isReadOnly: true,
                horizontalPadding: this.rendererOptions.horizontalPadding
              };
              const diffPart = this.instantiationService.createInstance(MarkdownDiffBlockPart, diffData, context.diffEditorPool, context.currentWidth.get());
              const ref2 = {
                object: diffPart,
                isStale: () => false,
                dispose: () => diffPart.dispose()
              };
              this.allRefs.push(ref2);
              store.add(ref2);
              return diffPart.element;
            }
          }
          if (languageId === "vscode-extensions") {
            const chatExtensions = store.add(instantiationService.createInstance(ChatExtensionsContentPart, { kind: "extensions", extensions: text.split(",") }));
            return chatExtensions.domNode;
          }
          const globalIndex = globalCodeBlockIndexStart++;
          let codeBlockText = text;
          const extractedVulns = extractVulnerabilitiesFromText(text);
          codeBlockText = fixCodeText(extractedVulns.newText, languageId);
          const vulns = extractedVulns.vulnerabilities;
          let codemapperUri;
          let isEdit;
          const codeblockUri = extractCodeblockUrisFromText(codeBlockText);
          if (codeblockUri) {
            codemapperUri = codeblockUri.uri;
            isEdit = codeblockUri.isEdit;
            codeBlockText = codeblockUri.textWithoutResult;
          }
          const hideToolbar = isResponseVM(element) && element.errorDetails?.responseIsFiltered;
          const renderOptions = {
            ...this.rendererOptions.codeBlockRenderOptions
          };
          if (hideToolbar !== void 0) {
            renderOptions.hideToolbar = hideToolbar;
          }
          const codeBlockInfo = { languageId, text: codeBlockText, codeBlockIndex: globalIndex, element, parentContextKeyService: contextKeyService, vulns, codemapperUri, renderOptions, chatSessionResource: element.sessionResource };
          const baseCodeBlockInfo = {
            ownerMarkdownPartId: this.codeblocksPartId,
            codeBlockIndex: globalIndex,
            elementId: element.id,
            chatSessionResource: element.sessionResource,
            languageId,
            editDeltaInfo: EditDeltaInfo.fromText(text)
          };
          if (element.isCompleteAddedRequest || !codemapperUri || !isEdit) {
            if (hasChatOutputRenderer) {
              const ref3 = this.renderChatOutputCodeBlock(languageId, codeBlockText, globalIndex, context, isCodeBlockComplete, reusableOutputCodeBlockRefs);
              this._codeblocks.push({
                ...baseCodeBlockInfo,
                codemapperUri: codeBlockInfo.codemapperUri,
                isStreamingEdit: false,
                get uri() {
                  return void 0;
                },
                focus() {
                  ref3.object.focus();
                }
              });
              store.add(ref3);
              return ref3.object.element;
            }
            const ref2 = this.renderCodeBlock(codeBlockInfo, currentWidth);
            this._codeblocks.push({
              ...baseCodeBlockInfo,
              codemapperUri: codeBlockInfo.codemapperUri,
              isStreamingEdit: false,
              get uri() {
                return ref2.object.uri;
              },
              focus() {
                ref2.object.focus();
              }
            });
            store.add(ref2);
            return ref2.object.element;
          }
          const requestId = isRequestVM(element) ? element.id : element.requestId;
          const ref = this.renderCodeBlockPill(element.sessionResource, requestId, inUndoStop, codemapperUri);
          this._codeblocks.push({
            ...baseCodeBlockInfo,
            codemapperUri,
            isStreamingEdit: !isCodeBlockComplete,
            get uri() {
              return void 0;
            },
            focus() {
              return ref.object.element.focus();
            }
          });
          store.add(ref);
          return ref.object.element;
        },
        markedOptions: markedOpts,
        markedExtensions,
        ...markdownRenderOptions,
        transformUri
      }, this.domNode));
      if (isResponseVM(element) && !element.model.codeBlockInfos && element.model.isComplete) {
        element.model.initializeCodeBlockInfos(this._codeblocks.map((info) => {
          return {
            suggestionId: this.aiEditTelemetryService.createSuggestionId({
              presentation: "codeBlock",
              feature: "sideBarChat",
              editDeltaInfo: info.editDeltaInfo,
              languageId: info.languageId,
              modeId: element.model.request?.modeInfo?.telemetryModeId,
              modelId: element.model.request?.modelId,
              applyCodeBlockSuggestionId: void 0,
              source: void 0,
              sourceRequestId: void 0
            })
          };
        }));
      }
      const markdownDecorationsRenderer = instantiationService.createInstance(ChatMarkdownDecorationsRenderer);
      store.add(markdownDecorationsRenderer.walkTreeAndAnnotateReferenceLinks(this.markdown, result.element));
      const layoutParticipants = new Lazy(() => {
        const observer = store.add(new dom.DisposableResizeObserver("ChatMarkdownContentPart.mathLayout", () => this.mathLayoutParticipants.forEach((layout) => layout())));
        store.add(observer.observe(this.domNode));
        return this.mathLayoutParticipants;
      });
      for (const katexBlock of this.domNode.querySelectorAll(".katex-display")) {
        if (!dom.isHTMLElement(katexBlock)) {
          continue;
        }
        const scrollable = new DomScrollableElement(katexBlock.cloneNode(true), {
          vertical: ScrollbarVisibility.Hidden,
          horizontal: ScrollbarVisibility.Auto
        });
        store.add(scrollable);
        katexBlock.replaceWith(scrollable.getDomNode());
        layoutParticipants.value.add(() => {
          scrollable.scanDomNode();
        });
        scrollable.scanDomNode();
      }
      store.add(wrapTablesWithScrollable(this.domNode, layoutParticipants));
      dispose(reusableOutputCodeBlockRefs.values());
    };
    doRenderMarkdown();
    this._incrementalMorpher?.seed(
      markdown.content.value,
      /* animateInitial */
      true
    );
    if (enableMath && !MarkedKatexSupport.getExtension(dom.getWindow(context.container))) {
      MarkedKatexSupport.loadExtension(dom.getWindow(context.container)).then(() => {
        doRenderMarkdown();
      }).catch((e) => {
        console.error("Failed to load MarkedKatexSupport extension:", e);
      });
    }
  }
  get codeblocks() {
    return this._codeblocks;
  }
  dispose() {
    super.dispose();
    dispose(this.allRefs);
    this.allRefs.length = 0;
  }
  renderCodeBlockPill(sessionResource, requestId, inUndoStop, codemapperUri) {
    const codeBlock = this.instantiationService.createInstance(CollapsedCodeBlock, sessionResource, requestId, inUndoStop);
    const diffListenerStore = new DisposableStore();
    const ref = {
      object: codeBlock,
      isStale: () => false,
      dispose: () => {
        codeBlock.dispose();
        diffListenerStore.dispose();
      }
    };
    this.allRefs.push(ref);
    diffListenerStore.add(codeBlock.onDidChangeDiff(() => this.fireAggregatedDiff()));
    codeBlock.render(codemapperUri);
    return ref;
  }
  renderChatOutputCodeBlock(identifier, text, codeBlockIndex, context, isComplete, reusableOutputCodeBlockRefs) {
    const reuseKey = ChatOutputCodeBlockPart.reuseKey(context.element.id, codeBlockIndex, identifier);
    const reusableRef = reusableOutputCodeBlockRefs.get(reuseKey);
    if (reusableRef?.object.hasSameContent(identifier, text, isComplete)) {
      reusableOutputCodeBlockRefs.delete(reuseKey);
      this.allRefs.push(reusableRef);
      return reusableRef;
    }
    const codeBlock = this.instantiationService.createInstance(
      ChatOutputCodeBlockPart,
      identifier,
      text,
      codeBlockIndex,
      context,
      isComplete,
      () => this._onDidChangeHeight.fire()
    );
    const ref = {
      object: codeBlock,
      isStale: () => false,
      dispose: () => codeBlock.dispose()
    };
    this.allRefs.push(ref);
    return ref;
  }
  fireAggregatedDiff() {
    let totalAdded = 0;
    let totalRemoved = 0;
    for (const ref of this.allRefs) {
      if (ref.object instanceof CollapsedCodeBlock && ref.object.diff) {
        totalAdded += ref.object.diff.added;
        totalRemoved += ref.object.diff.removed;
      }
    }
    this._onDidChangeDiff.fire({ added: totalAdded, removed: totalRemoved });
  }
  renderCodeBlock(data, currentWidth) {
    const key = CodeBlockPart.poolKey(data.element.id, data.codeBlockIndex);
    const ref = this.editorPool.get(key);
    this.allRefs.push(ref);
    ref.object.render(data, currentWidth);
    if (!this._store.isDisposed && isRequestVM(data.element)) {
      this._onDidChangeHeight.fire();
    }
    return ref;
  }
  hasSameContent(other) {
    if (other.kind !== "markdownContent") {
      return false;
    }
    if (other.content.value === this.markdown.content.value && equalsInlineReferences(other.inlineReferences, this.markdown.inlineReferences)) {
      return true;
    }
    const lastCodeblock = this._codeblocks.at(-1);
    if (lastCodeblock && lastCodeblock.codemapperUri !== void 0 && lastCodeblock.isStreamingEdit) {
      return other.content.value.lastIndexOf("```") === this.markdown.content.value.lastIndexOf("```");
    }
    return false;
  }
  /**
   * Attempts an incremental DOM update for smooth streaming instead of
   * tearing down and rebuilding the entire markdown part.
   *
   * The morpher checks that the new content is a pure append, then
   * schedules a rAF-batched re-render through the full markdown
   * pipeline. Code blocks, tables, and all markdown features are
   * rendered correctly because the update goes through the standard
   * `doRenderMarkdown()` path.
   *
   * @param newMarkdown The new (appended) markdown content.
   * @returns `true` if the incremental update succeeded and the caller
   *          should treat this part as unchanged. `false` if a full
   *          re-render is needed.
   */
  tryIncrementalUpdate(newMarkdown) {
    if (!this._incrementalMorpher) {
      return false;
    }
    if (!equalsInlineReferences(newMarkdown.inlineReferences, this.markdown.inlineReferences)) {
      return false;
    }
    const success = this._incrementalMorpher.tryMorph(newMarkdown.content.value);
    if (success) {
      this.markdown = newMarkdown;
    }
    return success;
  }
  /**
   * Forward the stream's word-rate estimate to the morpher's buffer.
   */
  updateStreamRate(rate, isComplete) {
    this._incrementalMorpher?.updateStreamRate(rate, isComplete);
  }
  layout(width) {
    this.allRefs.forEach((ref, index) => {
      if (ref.object instanceof CodeBlockPart) {
        ref.object.layout(width);
      } else if (ref.object instanceof ChatOutputCodeBlockPart) {
        ref.object.layout(width);
      } else if (ref.object instanceof MarkdownDiffBlockPart) {
        ref.object.layout(width);
      } else if (ref.object instanceof CollapsedCodeBlock) {
        const codeblockModel = this._codeblocks[index];
        if (codeblockModel.codemapperUri && !isEqual(ref.object.uri, codeblockModel.codemapperUri)) {
          ref.object.render(codeblockModel.codemapperUri);
        }
      }
    });
    this.mathLayoutParticipants.forEach((layout) => layout());
  }
  onDidRemount() {
    for (const ref of this.allRefs) {
      if (ref.object instanceof CodeBlockPart || ref.object instanceof ChatOutputCodeBlockPart) {
        ref.object.onDidRemount();
      }
    }
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatMarkdownContentPart.ID_POOL = 0;
ChatMarkdownContentPart = __decorateClass([
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IInstantiationService),
  __decorateParam(12, IAiEditTelemetryService),
  __decorateParam(13, IChatOutputRendererService),
  __decorateParam(14, IChatSessionsService)
], ChatMarkdownContentPart);
function equalsInlineReferences(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return !a && !b;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => equalsInlineReference(a[key], b[key]));
}
function equalsInlineReference(a, b) {
  if (!a || !b) {
    return !a && !b;
  }
  return a.resolveId === b.resolveId && a.name === b.name && equalsInlineReferenceValue(a.inlineReference, b.inlineReference);
}
const workspaceSymbolComparers = {
  name: (a, b) => a.name === b.name,
  containerName: (a, b) => a.containerName === b.containerName,
  kind: (a, b) => a.kind === b.kind,
  tags: (a, b) => equalsSymbolTags(a.tags, b.tags),
  location: (a, b) => isEqual(a.location.uri, b.location.uri) && Range.equalsRange(a.location.range, b.location.range)
};
const workspaceSymbolComparerKeys = Object.keys(workspaceSymbolComparers);
function equalsInlineReferenceValue(a, b) {
  if (URI.isUri(a) || URI.isUri(b)) {
    return URI.isUri(a) && URI.isUri(b) && isEqual(a, b);
  }
  if (isLocation(a) || isLocation(b)) {
    return isLocation(a) && isLocation(b) && isEqual(a.uri, b.uri) && Range.equalsRange(a.range, b.range);
  }
  return equalsWorkspaceSymbol(a, b);
}
function equalsWorkspaceSymbol(a, b) {
  return workspaceSymbolComparerKeys.every((key) => workspaceSymbolComparers[key](a, b));
}
function equalsSymbolTags(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  return a.every((tag, index) => tag === b[index]);
}
function codeblockHasClosingBackticks(str) {
  str = str.trim();
  return !!str.match(/\n```+$/);
}
let ChatOutputCodeBlockPart = class extends Disposable {
  constructor(identifier, text, codeBlockIndex, context, isComplete, onDidChangeHeight, instantiationService, chatOutputRendererService, stateCache) {
    super();
    this.identifier = identifier;
    this.text = text;
    this.context = context;
    this.isComplete = isComplete;
    this.onDidChangeHeight = onDidChangeHeight;
    this.instantiationService = instantiationService;
    this.chatOutputRendererService = chatOutputRendererService;
    this.stateCache = stateCache;
    this._disposeCts = this._register(new CancellationTokenSource());
    this._renderedOutputPart = this._register(new MutableDisposable());
    this.reuseKey = ChatOutputCodeBlockPart.reuseKey(context.element.id, codeBlockIndex, identifier);
    const title = localize("chat.renderedCodeBlockLabel", "Rendered code block {0}", codeBlockIndex + 1);
    this.element = $(".interactive-result-code-block.chat-output-code-block.tool-output-part");
    this.element.tabIndex = -1;
    this.element.ariaLabel = title;
    const parent = $(".webview-output");
    parent.style.maxHeight = "80vh";
    parent.style.minHeight = "38px";
    this.element.appendChild(parent);
    const stateCacheKey = `codeBlock/${context.element.sessionResource.toString()}/${context.element.id}/${codeBlockIndex}/${identifier.toLowerCase()}`;
    const partState = this.stateCache.get(stateCacheKey) ?? { height: 0 };
    this.stateCache.set(stateCacheKey, partState);
    if (partState.height) {
      parent.style.height = `${partState.height}px`;
    }
    const progressMessage = $("span");
    progressMessage.textContent = localize("chat.codeBlockOutputRendering", "Rendering code block...");
    const progressPart = this._register(this.instantiationService.createInstance(ChatProgressSubPart, progressMessage, ThemeIcon.modify(Codicon.loading, "spin"), void 0));
    parent.appendChild(progressPart.domNode);
    if (!isComplete) {
      this.onDidChangeHeight();
      return;
    }
    this.chatOutputRendererService.renderCodeBlock(identifier, new TextEncoder().encode(text), parent, {
      webviewState: partState.webviewState,
      title,
      chatSessionResource: this.context.element.sessionResource
    }, this._disposeCts.token).then((renderedItem) => {
      if (this._disposeCts.token.isCancellationRequested) {
        renderedItem.dispose();
        return;
      }
      this._renderedOutputPart.value = renderedItem;
      progressPart.domNode.remove();
      parent.style.minHeight = "";
      this.onDidChangeHeight();
      this._register(renderedItem.webview.onDidUpdateState((e) => {
        partState.webviewState = e;
      }));
      this._register(renderedItem.onDidChangeHeight((newHeight) => {
        partState.height = newHeight;
        this.onDidChangeHeight();
      }));
      this._register(this.context.onDidChangeVisibility((visible) => {
        if (visible) {
          renderedItem.reinitialize();
        }
      }));
    }, (error) => {
      if (isCancellationError(error)) {
        return;
      }
      console.error("Error rendering chat code block:", error);
      progressPart.domNode.replaceWith(this.renderError(error));
      parent.style.minHeight = "";
      this.onDidChangeHeight();
    });
  }
  static reuseKey(elementId, codeBlockIndex, identifier) {
    return `${elementId}/${codeBlockIndex}/${identifier.toLowerCase()}`;
  }
  hasSameContent(identifier, text, isComplete) {
    return identifier.toLowerCase() === this.identifier.toLowerCase() && text === this.text && isComplete === this.isComplete;
  }
  dispose() {
    this._disposeCts.dispose(true);
    super.dispose();
  }
  layout(width) {
    this.element.style.maxWidth = `${width}px`;
  }
  onDidRemount() {
    this._renderedOutputPart.value?.reinitialize();
  }
  focus() {
    const webview = this._renderedOutputPart.value?.webview;
    if (webview) {
      webview.focus();
    } else {
      this.element.focus();
    }
  }
  renderError(error) {
    const errorNode = $(".output-error");
    const errorHeaderNode = $(".output-error-header");
    dom.append(errorNode, errorHeaderNode);
    const iconElement = $("div");
    iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.error));
    errorHeaderNode.append(iconElement);
    const errorTitleNode = $(".output-error-title");
    errorTitleNode.textContent = localize("chat.codeBlockOutputError", "Error rendering the code block");
    errorHeaderNode.append(errorTitleNode);
    const errorMessageNode = $(".output-error-details");
    errorMessageNode.textContent = error?.message || String(error);
    errorNode.append(errorMessageNode);
    return errorNode;
  }
};
ChatOutputCodeBlockPart = __decorateClass([
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IChatOutputRendererService),
  __decorateParam(8, IChatOutputPartStateCache)
], ChatOutputCodeBlockPart);
let CollapsedCodeBlock = class extends ChatEditPillElement {
  constructor(sessionResource, requestId, inUndoStop, labelService, editorService, modelService, languageService, contextMenuService, contextKeyService, menuService, hoverService, chatService, configurationService, textModelService) {
    super(labelService, modelService, languageService, hoverService);
    this.sessionResource = sessionResource;
    this.requestId = requestId;
    this.inUndoStop = inUndoStop;
    this.editorService = editorService;
    this.contextMenuService = contextMenuService;
    this.contextKeyService = contextKeyService;
    this.menuService = menuService;
    this.chatService = chatService;
    this.configurationService = configurationService;
    this.textModelService = textModelService;
    this._onDidChangeDiff = this._register(new Emitter());
    this.onDidChangeDiff = this._onDidChangeDiff.event;
    this.progressStore = this._store.add(new DisposableStore());
    this._register(this.onDidClick((e) => this.showDiff(e)));
    this._register(this.onDidContextMenu((event) => {
      this.contextMenuService.showContextMenu({
        contextKeyService: this.contextKeyService,
        getAnchor: () => event,
        getActions: () => {
          if (!this.uri) {
            return [];
          }
          const menu = this.menuService.getMenuActions(MenuId.ChatEditingCodeBlockContext, this.contextKeyService, {
            arg: {
              sessionResource: this.sessionResource,
              requestId: this.requestId,
              uri: this.uri,
              stopId: this.inUndoStop
            }
          });
          return getFlatContextMenuActions(menu);
        }
      });
    }));
  }
  get diff() {
    return this.currentDiff;
  }
  async showDiff({ editorOptions: options, openToSide }) {
    const group = openToSide ? SIDE_GROUP : void 0;
    if (this.currentDiff) {
      if (this.currentDiff.removed === 0 && await isResourceContentEmpty(this.textModelService, this.currentDiff.originalURI) && this.uri) {
        this.editorService.openEditor({ resource: this.uri, options }, group);
        return;
      }
      this.editorService.openEditor({
        original: { resource: this.currentDiff.originalURI },
        modified: { resource: this.currentDiff.modifiedURI },
        options
      }, group);
    } else if (this.uri) {
      this.editorService.openEditor({ resource: this.uri, options }, group);
    }
  }
  /**
   * @param uri URI of the file on-disk being changed
   */
  render(uri) {
    this.progressStore.clear();
    this.setUri(uri);
    this.setStatus(void 0, "");
    this.setLabelDetail("");
    this.setProgressFill(void 0);
    const session = this.chatService.getSession(this.sessionResource);
    const editSession = session?.editingSession;
    if (!editSession) {
      return;
    }
    const diffObservable = derived((reader) => {
      const entry = editSession.readEntry(uri, reader);
      return entry && editSession.getEntryDiffBetweenStops(entry.modifiedURI, this.requestId, this.inUndoStop);
    }).map((d, r) => d?.read(r));
    const isStreaming = derived((r) => {
      const entry = editSession.readEntry(uri, r);
      const currentlyModified = entry?.isCurrentlyBeingModifiedBy.read(r);
      return !!currentlyModified && currentlyModified.responseModel.requestId === this.requestId && currentlyModified.undoStopId === this.inUndoStop;
    });
    const iconText = this.labelService.getUriBasenameLabel(uri);
    this.progressStore.add(autorun((r) => {
      if (isStreaming.read(r)) {
        const codicon = ThemeIcon.modify(Codicon.loading, "spin");
        this.setStatus(codicon, localize("chat.codeblock.applyingEdits", "Applying edits"));
        const entry = editSession.readEntry(uri, r);
        const rwRatio = Math.floor((entry?.rewriteRatio.read(r) || 0) * 100);
        const showAnimation = this.configurationService.getValue(ChatConfiguration.ShowCodeBlockProgressAnimation);
        if (showAnimation) {
          this.setProgressFill(rwRatio);
          this.setLabelDetail("");
        } else {
          this.setProgressFill(void 0);
          this.setLabelDetail(rwRatio === 0 || !rwRatio ? localize("chat.codeblock.generating", "Generating edits...") : localize("chat.codeblock.applyingPercentage", "({0}%)...", rwRatio));
        }
      } else {
        this.setStatus(Codicon.check, localize("chat.codeblock.edited", "Edited"));
        this.setProgressFill(void 0);
        this.setLabelDetail("");
      }
    }));
    this.progressStore.add(autorunSelfDisposable((r) => {
      const changes = diffObservable.read(r);
      if (changes === void 0) {
        return;
      }
      if (changes && !changes?.identical && !changes?.quitEarly) {
        this.currentDiff = changes;
        this._onDidChangeDiff.fire(changes);
        this.setDiff({ added: changes.added, removed: changes.removed });
        const insertionsFragment = changes.added === 1 ? localize("chat.codeblock.insertions.one", "1 insertion") : localize("chat.codeblock.insertions", "{0} insertions", changes.added);
        const deletionsFragment = changes.removed === 1 ? localize("chat.codeblock.deletions.one", "1 deletion") : localize("chat.codeblock.deletions", "{0} deletions", changes.removed);
        this.setAriaLabel(localize("summary", "Edited {0}, {1}, {2}", iconText, insertionsFragment, deletionsFragment));
        if (changes.isFinal) {
          r.dispose();
        }
      }
    }));
  }
};
CollapsedCodeBlock = __decorateClass([
  __decorateParam(3, ILabelService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, IModelService),
  __decorateParam(6, ILanguageService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IMenuService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, IChatService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, ITextModelService)
], CollapsedCodeBlock);
function fixCodeText(text, languageId) {
  if (languageId === "php") {
    if (!text.trim().startsWith("<?")) {
      return `<?php
${text}`;
    }
  }
  return text;
}
export {
  ChatMarkdownContentPart,
  CollapsedCodeBlock,
  codeblockHasClosingBackticks
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0TWFya2Rvd25Db250ZW50UGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGFsbG93ZWRNYXJrZG93bkh0bWxBdHRyaWJ1dGVzLCBNYXJrZG93blJlbmRlcmVyTWFya2VkT3B0aW9ucywgdHlwZSBNYXJrZG93blJlbmRlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBzdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyB3cmFwVGFibGVzV2l0aFNjcm9sbGFibGUgfSBmcm9tICcuL2NoYXRNYXJrZG93blRhYmxlU2Nyb2xsaW5nLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGZpbmRMYXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzRmluZC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgYXV0b3J1blNlbGZEaXNwb3NhYmxlLCBkZXJpdmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgaXNMb2NhdGlvbiwgdHlwZSBTeW1ib2xUYWcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0RGVsdGFJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi90ZXh0TW9kZWxFZGl0U291cmNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJT3BlbkVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvYnJvd3Nlci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0VGVsZW1ldHJ5L2Jyb3dzZXIvdGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeS9haUVkaXRUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1hcmtlZEthdGV4U3VwcG9ydCB9IGZyb20gJy4uLy4uLy4uLy4uL21hcmtkb3duL2Jyb3dzZXIvbWFya2VkS2F0ZXhTdXBwb3J0LmpzJztcbmltcG9ydCB7IGV4dHJhY3RDb2RlYmxvY2tVcmlzRnJvbVRleHQsIGV4dHJhY3RWdWxuZXJhYmlsaXRpZXNGcm9tVGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi93aWRnZXQvYW5ub3RhdGlvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRTZXNzaW9uRGlmZlN0YXRzLCBJRWRpdFNlc3Npb25FbnRyeURpZmYgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRQcm9ncmVzc1JlbmRlcmFibGVSZXNwb25zZUNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSwgSUNoYXRNYXJrZG93bkNvbnRlbnQsIElDaGF0U2VydmljZSwgSUNoYXRVbmRvU3RvcCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzUmVxdWVzdFZNLCBpc1Jlc3BvbnNlVk0gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRDb2RlQmxvY2tJbmZvIH0gZnJvbSAnLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdE91dHB1dFJlbmRlcmVyU2VydmljZSwgdHlwZSBSZW5kZXJlZE91dHB1dFBhcnQgfSBmcm9tICcuLi8uLi9jaGF0T3V0cHV0SXRlbVJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGFsbG93ZWRDaGF0TWFya2Rvd25IdG1sVGFncyB9IGZyb20gJy4uL2NoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25EaWZmQmxvY2tEYXRhLCBNYXJrZG93bkRpZmZCbG9ja1BhcnQsIHBhcnNlVW5pZmllZERpZmYgfSBmcm9tICcuL2NoYXREaWZmQmxvY2tQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nQWN0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0TWFya2Rvd25EZWNvcmF0aW9uc1JlbmRlcmVyIH0gZnJvbSAnLi9jaGF0TWFya2Rvd25EZWNvcmF0aW9uc1JlbmRlcmVyLmpzJztcbmltcG9ydCB7IENvZGVCbG9ja1BhcnQsIElDb2RlQmxvY2tEYXRhLCBJQ29kZUJsb2NrUmVuZGVyT3B0aW9ucyB9IGZyb20gJy4vY29kZUJsb2NrUGFydC5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvY2hhdENvZGVCbG9ja1BpbGwuY3NzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlUmVmZXJlbmNlIH0gZnJvbSAnLi9jaGF0Q29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yUG9vbCB9IGZyb20gJy4vY2hhdENvbnRlbnRDb2RlUG9vbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydCwgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRQaWxsRWxlbWVudCwgaXNSZXNvdXJjZUNvbnRlbnRFbXB0eSB9IGZyb20gJy4vY2hhdEVkaXRQaWxsRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBDaGF0RXh0ZW5zaW9uc0NvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0RXh0ZW5zaW9uc0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRQcm9ncmVzc1N1YlBhcnQgfSBmcm9tICcuL2NoYXRQcm9ncmVzc0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IEluY3JlbWVudGFsRE9NTW9ycGhlciB9IGZyb20gJy4vY2hhdEluY3JlbWVudGFsUmVuZGVyaW5nL2NoYXRJbmNyZW1lbnRhbFJlbmRlcmluZy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE91dHB1dFBhcnRTdGF0ZUNhY2hlLCBJT3V0cHV0UGFydFN0YXRlIH0gZnJvbSAnLi9jaGF0T3V0cHV0UGFydFN0YXRlQ2FjaGUuanMnO1xuaW1wb3J0ICcuL21lZGlhL2NoYXRNYXJrZG93blBhcnQuY3NzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0TWFya2Rvd25Db250ZW50UGFydE9wdGlvbnMge1xuXHRyZWFkb25seSBjb2RlQmxvY2tSZW5kZXJPcHRpb25zPzogSUNvZGVCbG9ja1JlbmRlck9wdGlvbnM7XG5cdHJlYWRvbmx5IGFsbG93SW5saW5lRGlmZnM/OiBib29sZWFuO1xuXHRyZWFkb25seSBob3Jpem9udGFsUGFkZGluZz86IG51bWJlcjtcblx0cmVhZG9ubHkgYWNjZXNzaWJpbGl0eU9wdGlvbnM/OiB7XG5cdFx0LyoqXG5cdFx0ICogTWVzc2FnZSB0byBhbm5vdW5jZSB0byBzY3JlZW4gcmVhZGVycyBhcyBhIHN0YXR1cyB1cGRhdGUgaWYgVmVyYm9zZUNoYXRQcm9ncmVzc1VwZGF0ZXMgaXMgZW5hYmxlZC5cblx0XHQgKiBXaWxsIGFsc28gYmUgdXNlZCBhcyB0aGUgYXJpYS1sYWJlbCBmb3IgdGhlIGNvbnRhaW5lci5cblx0XHQgKiAqL1xuXHRcdHN0YXR1c01lc3NhZ2U/OiBzdHJpbmc7XG5cdH07XG59XG5cbmludGVyZmFjZSBJTWFya2Rvd25QYXJ0Q29kZUJsb2NrSW5mbyBleHRlbmRzIElDaGF0Q29kZUJsb2NrSW5mbyB7XG5cdGlzU3RyZWFtaW5nRWRpdDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0Q29udGVudFBhcnQge1xuXG5cdHByaXZhdGUgc3RhdGljIElEX1BPT0wgPSAwO1xuXG5cdHJlYWRvbmx5IGNvZGVibG9ja3NQYXJ0SWQgPSBTdHJpbmcoKytDaGF0TWFya2Rvd25Db250ZW50UGFydC5JRF9QT09MKTtcblx0cmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0Ly8gVGhpcyBFdmVudCBleGlzdHMgZm9yIG9uZSBzcGVjaWZpYyBzY2VuYXJpbyBhbmQgdGhlIHBhdHRlcm4gc2hvdWxkbid0IGJlIGNvcGllZCB3aXRob3V0IGEgZ29vZCByZWFzb25cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VIZWlnaHQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VEaWZmID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRTZXNzaW9uRGlmZlN0YXRzPigpKTtcblx0LyoqXG5cdCAqIEZpcmVzIHdoZW4gYW55IGVkaXQgcGlsbCAoQ29sbGFwc2VkQ29kZUJsb2NrKSBpbiB0aGlzIG1hcmtkb3duIHBhcnQgdXBkYXRlcyBpdHMgZGlmZi5cblx0ICogVGhlIGFnZ3JlZ2F0ZWQgc3RhdHMgcmVmbGVjdCB0aGUgdG90YWwgYWRkZWQvcmVtb3ZlZCBhY3Jvc3MgYWxsIGVkaXQgcGlsbHMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURpZmY6IEV2ZW50PElFZGl0U2Vzc2lvbkRpZmZTdGF0cz4gPSB0aGlzLl9vbkRpZENoYW5nZURpZmYuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhbGxSZWZzOiBJRGlzcG9zYWJsZVJlZmVyZW5jZTxDb2RlQmxvY2tQYXJ0IHwgQ2hhdE91dHB1dENvZGVCbG9ja1BhcnQgfCBDb2xsYXBzZWRDb2RlQmxvY2sgfCBNYXJrZG93bkRpZmZCbG9ja1BhcnQ+W10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb2RlYmxvY2tzOiBJTWFya2Rvd25QYXJ0Q29kZUJsb2NrSW5mb1tdID0gW107XG5cdHB1YmxpYyBnZXQgY29kZWJsb2NrcygpOiBJQ2hhdENvZGVCbG9ja0luZm9bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvZGVibG9ja3M7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IG1hdGhMYXlvdXRQYXJ0aWNpcGFudHMgPSBuZXcgU2V0PCgpID0+IHZvaWQ+KCk7XG5cblx0LyoqIEluY3JlbWVudGFsIHJlbmRlcmluZyBtb3JwaGVyIFx1MjAxNCBvbmx5IGNyZWF0ZWQgd2hlbiB0aGUgZXhwZXJpbWVudCBpcyBlbmFibGVkLiAqL1xuXHRwcml2YXRlIF9pbmNyZW1lbnRhbE1vcnBoZXI6IEluY3JlbWVudGFsRE9NTW9ycGhlciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIG1hcmtkb3duOiBJQ2hhdE1hcmtkb3duQ29udGVudCxcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvclBvb2w6IEVkaXRvclBvb2wsXG5cdFx0ZmlsbEluSW5jb21wbGV0ZVRva2VucyA9IGZhbHNlLFxuXHRcdGNvZGVCbG9ja1N0YXJ0SW5kZXggPSAwLFxuXHRcdHJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcixcblx0XHRtYXJrZG93blJlbmRlck9wdGlvbnM6IE1hcmtkb3duUmVuZGVyT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRjdXJyZW50V2lkdGg6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlcmVyT3B0aW9uczogSUNoYXRNYXJrZG93bkNvbnRlbnRQYXJ0T3B0aW9ucyxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWlFZGl0VGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFpRWRpdFRlbGVtZXRyeVNlcnZpY2U6IElBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQ2hhdE91dHB1dFJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRPdXRwdXRSZW5kZXJlclNlcnZpY2U6IElDaGF0T3V0cHV0UmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgZWxlbWVudCA9IGNvbnRleHQuZWxlbWVudDtcblx0XHRjb25zdCBpblVuZG9TdG9wID0gKGZpbmRMYXN0KGNvbnRleHQuY29udGVudCwgZSA9PiBlLmtpbmQgPT09ICd1bmRvU3RvcCcsIGNvbnRleHQuY29udGVudEluZGV4KSBhcyBJQ2hhdFVuZG9TdG9wIHwgdW5kZWZpbmVkKT8uaWQ7XG5cblx0XHQvLyBOZWVkIHRvIHRyYWNrIHRoZSBpbmRleCBvZiB0aGUgY29kZWJsb2NrIHdpdGhpbiB0aGUgcmVzcG9uc2Ugc28gaXQgY2FuIGhhdmUgYSB1bmlxdWUgSUQsXG5cdFx0Ly8gYW5kIHdpdGhpbiB0aGlzIHBhcnQgdG8gZmluZCBpdCB3aXRoaW4gdGhlIGNvZGVibG9ja3MgYXJyYXlcblx0XHRsZXQgZ2xvYmFsQ29kZUJsb2NrSW5kZXhTdGFydCA9IGNvZGVCbG9ja1N0YXJ0SW5kZXg7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSAkKCdkaXYuY2hhdC1tYXJrZG93bi1wYXJ0Jyk7XG5cblx0XHRpZiAodGhpcy5yZW5kZXJlck9wdGlvbnMuYWNjZXNzaWJpbGl0eU9wdGlvbnM/LnN0YXR1c01lc3NhZ2UpIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5hcmlhTGFiZWwgPSB0aGlzLnJlbmRlcmVyT3B0aW9ucy5hY2Nlc3NpYmlsaXR5T3B0aW9ucy5zdGF0dXNNZXNzYWdlO1xuXHRcdFx0aWYgKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQuVmVyYm9zZUNoYXRQcm9ncmVzc1VwZGF0ZXMpKSB7XG5cdFx0XHRcdHN0YXR1cyh0aGlzLnJlbmRlcmVyT3B0aW9ucy5hY2Nlc3NpYmlsaXR5T3B0aW9ucy5zdGF0dXNNZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBlbmFibGVNYXRoID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uRW5hYmxlTWF0aCk7XG5cblx0XHQvLyBJbml0aWFsaXplIGluY3JlbWVudGFsIHJlbmRlcmluZyBtb3JwaGVyIHdoZW4gdGhlIGV4cGVyaW1lbnQgaXMgZW5hYmxlZC5cblx0XHQvLyBPbmx5IGNyZWF0ZSBmb3IgYWN0aXZlbHkgc3RyZWFtaW5nIHJlc3BvbnNlcyAoIWVsZW1lbnQuaXNDb21wbGV0ZSksXG5cdFx0Ly8gbm90IGZvciBjb21wbGV0ZWQgcmVzcG9uc2VzIGxvYWRlZCBmcm9tIGhpc3RvcnkgXHUyMDE0IGV2ZW4gaWZcblx0XHQvLyBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zIGlzIHRydWUgKGUuZy4gY2FuY2VsZWQgb3IgaW5jb21wbGV0ZSByZXNwb25zZXMpLlxuXHRcdGNvbnN0IGluY3JlbWVudGFsUmVuZGVyaW5nRW5hYmxlZCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nKTtcblx0XHRpZiAoaW5jcmVtZW50YWxSZW5kZXJpbmdFbmFibGVkICYmIGlzUmVzcG9uc2VWTShlbGVtZW50KSAmJiBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zICYmICFlbGVtZW50LmlzQ29tcGxldGUpIHtcblx0XHRcdHRoaXMuX2luY3JlbWVudGFsTW9ycGhlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluY3JlbWVudGFsRE9NTW9ycGhlciwgdGhpcy5kb21Ob2RlKSk7XG5cdFx0XHR0aGlzLl9pbmNyZW1lbnRhbE1vcnBoZXIuc2V0UmVuZGVyQ2FsbGJhY2soKG5ld01kKSA9PiB7XG5cdFx0XHRcdC8vIFRlbXBvcmFyaWx5IHN3YXAgdGhpcy5tYXJrZG93biB0byB0aGUgYnVmZmVyZWQgY29udGVudFxuXHRcdFx0XHQvLyBmb3IgZG9SZW5kZXJNYXJrZG93bigpLCB0aGVuIHJlc3RvcmUgaXQuIFRoZSBtb3JwaGVyIG1heVxuXHRcdFx0XHQvLyByZW5kZXIgYSBzdWJzZXQgb2YgdGhlIGZ1bGwgbWFya2Rvd24gKHdvcmQvcGFyYWdyYXBoXG5cdFx0XHRcdC8vIGJ1ZmZlcmluZyksIGJ1dCB0aGlzLm1hcmtkb3duIG11c3QgYWx3YXlzIHJlZmxlY3QgdGhlXG5cdFx0XHRcdC8vIGxhdGVzdCBmdWxsIGNvbnRlbnQgZnJvbSB0cnlJbmNyZW1lbnRhbFVwZGF0ZSBzbyB0aGF0XG5cdFx0XHRcdC8vIGhhc1NhbWVDb250ZW50KCkgcmV0dXJucyB0cnVlIGFuZCBhdm9pZHMgdW5uZWNlc3Nhcnlcblx0XHRcdFx0Ly8gcmUtZGlmZnMgb24gdGhlIG5leHQgcmVuZGVyRWxlbWVudCBjYWxsLlxuXHRcdFx0XHRjb25zdCBzYXZlZE1hcmtkb3duID0gdGhpcy5tYXJrZG93bjtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IG5ldyBNYXJrZG93blN0cmluZyhuZXdNZCwgdGhpcy5tYXJrZG93bi5jb250ZW50KTtcblx0XHRcdFx0Y29udGVudC5iYXNlVXJpID0gVVJJLnJldml2ZSh0aGlzLm1hcmtkb3duLmNvbnRlbnQuYmFzZVVyaSk7XG5cdFx0XHRcdGNvbnRlbnQudXJpcyA9IHRoaXMubWFya2Rvd24uY29udGVudC51cmlzO1xuXHRcdFx0XHR0aGlzLm1hcmtkb3duID0geyAuLi50aGlzLm1hcmtkb3duLCBjb250ZW50IH07XG5cdFx0XHRcdGRvUmVuZGVyTWFya2Rvd24oKTtcblx0XHRcdFx0dGhpcy5tYXJrZG93biA9IHNhdmVkTWFya2Rvd247XG5cdFx0XHRcdC8vIE5vdGlmeSB0aGUgbGlzdCB0aGF0IG91ciBoZWlnaHQgY2hhbmdlZCBzbyBpdCBjYW5cblx0XHRcdFx0Ly8gdXBkYXRlIHNjcm9sbCBwb3NpdGlvbi4gVGhlIG1vcnBoZXIgcmVuZGVycyB2aWEgckFGLFxuXHRcdFx0XHQvLyBvdXRzaWRlIHRoZSBub3JtYWwgcmVuZGVyRWxlbWVudCBmbG93LCBzbyB0aGUgbGlzdFxuXHRcdFx0XHQvLyB3b24ndCBwaWNrIHRoaXMgdXAgd2l0aG91dCBhbiBleHBsaWNpdCBub3RpZmljYXRpb24uXG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbmRlclN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cblx0XHRjb25zdCBkb1JlbmRlck1hcmtkb3duID0gKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcmV2aW91c1JlbmRlclN0b3JlID0gcmVuZGVyU3RvcmUuY2xlYXJBbmRMZWFrKCk7XG5cdFx0XHRjb25zdCByZXVzYWJsZU91dHB1dENvZGVCbG9ja1JlZnMgPSBuZXcgTWFwPHN0cmluZywgSURpc3Bvc2FibGVSZWZlcmVuY2U8Q2hhdE91dHB1dENvZGVCbG9ja1BhcnQ+PigpO1xuXHRcdFx0Zm9yIChjb25zdCByZWYgb2YgdGhpcy5hbGxSZWZzKSB7XG5cdFx0XHRcdGlmIChyZWYub2JqZWN0IGluc3RhbmNlb2YgQ2hhdE91dHB1dENvZGVCbG9ja1BhcnQpIHtcblx0XHRcdFx0XHRjb25zdCBvdXRwdXRSZWYgPSByZWYgYXMgSURpc3Bvc2FibGVSZWZlcmVuY2U8Q2hhdE91dHB1dENvZGVCbG9ja1BhcnQ+O1xuXHRcdFx0XHRcdHByZXZpb3VzUmVuZGVyU3RvcmU/LmRlbGV0ZUFuZExlYWsob3V0cHV0UmVmKTtcblx0XHRcdFx0XHRyZXVzYWJsZU91dHB1dENvZGVCbG9ja1JlZnMuc2V0KG91dHB1dFJlZi5vYmplY3QucmV1c2VLZXksIG91dHB1dFJlZik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHByZXZpb3VzUmVuZGVyU3RvcmU/LmRpc3Bvc2UoKTtcblxuXHRcdFx0Ly8gUmVzZXQgc3RhdGUgZm9yIHJlLXJlbmRlclxuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRyZW5kZXJTdG9yZS52YWx1ZSA9IHN0b3JlO1xuXHRcdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmRvbU5vZGUpO1xuXHRcdFx0dGhpcy5hbGxSZWZzLmxlbmd0aCA9IDA7XG5cdFx0XHR0aGlzLl9jb2RlYmxvY2tzLmxlbmd0aCA9IDA7XG5cdFx0XHR0aGlzLm1hdGhMYXlvdXRQYXJ0aWNpcGFudHMuY2xlYXIoKTtcblx0XHRcdGdsb2JhbENvZGVCbG9ja0luZGV4U3RhcnQgPSBjb2RlQmxvY2tTdGFydEluZGV4O1xuXG5cdFx0XHQvLyBUT0RPOiBNb3ZlIGthdGV4IHN1cHBvcnQgaW50byBjaGF0TWFya2Rvd25SZW5kZXJlclxuXHRcdFx0Y29uc3QgbWFya2VkRXh0ZW5zaW9ucyA9IGVuYWJsZU1hdGhcblx0XHRcdFx0PyBjb2FsZXNjZShbTWFya2VkS2F0ZXhTdXBwb3J0LmdldEV4dGVuc2lvbihkb20uZ2V0V2luZG93KGNvbnRleHQuY29udGFpbmVyKSwge1xuXHRcdFx0XHRcdHRocm93T25FcnJvcjogZmFsc2Vcblx0XHRcdFx0fSldKVxuXHRcdFx0XHQ6IFtdO1xuXG5cdFx0XHQvLyBFbmFibGVzIGdpdGh1Yi1mbGF2b3JlZC1tYXJrZG93biArIGxpbmUgYnJlYWtzIHdpdGggc2luZ2xlIG5ld2xpbmVzXG5cdFx0XHQvLyAod2hpY2ggbWF0Y2hlcyB0eXBpY2FsIGV4cGVjdGF0aW9ucyBidXQgaXNuJ3QgXCJwcm9wZXJcIiBpbiBtYXJrZG93bilcblx0XHRcdGNvbnN0IG1hcmtlZE9wdHM6IE1hcmtkb3duUmVuZGVyZXJNYXJrZWRPcHRpb25zID0ge1xuXHRcdFx0XHRnZm06IHRydWUsXG5cdFx0XHRcdGJyZWFrczogdHJ1ZSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRVcmlUcmFuc2Zvcm1lciA9IG1hcmtkb3duUmVuZGVyT3B0aW9ucz8udHJhbnNmb3JtVXJpO1xuXHRcdFx0Y29uc3QgdHJhbnNmb3JtVXJpID0gaXNSZXNwb25zZVZNKGVsZW1lbnQpXG5cdFx0XHRcdD8gKGhyZWY6IHN0cmluZywga2luZDogJ2xpbmsnIHwgJ2ltYWdlJykgPT4gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlc29sdmVDaGF0UmVzcG9uc2VVcmkoZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UsIGNvbmZpZ3VyZWRVcmlUcmFuc2Zvcm1lcj8uKGhyZWYsIGtpbmQpID8/IGhyZWYsIGtpbmQpXG5cdFx0XHRcdDogY29uZmlndXJlZFVyaVRyYW5zZm9ybWVyO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHJlbmRlcmVyLnJlbmRlcih0aGlzLm1hcmtkb3duLmNvbnRlbnQsIHtcblx0XHRcdFx0c2FuaXRpemVyQ29uZmlnOiBNYXJrZWRLYXRleFN1cHBvcnQuZ2V0U2FuaXRpemVyT3B0aW9ucyh7XG5cdFx0XHRcdFx0YWxsb3dlZFRhZ3M6IGFsbG93ZWRDaGF0TWFya2Rvd25IdG1sVGFncyxcblx0XHRcdFx0XHRhbGxvd2VkQXR0cmlidXRlczogYWxsb3dlZE1hcmtkb3duSHRtbEF0dHJpYnV0ZXMsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRmaWxsSW5JbmNvbXBsZXRlVG9rZW5zLFxuXHRcdFx0XHRjb2RlQmxvY2tSZW5kZXJlclN5bmM6IChsYW5ndWFnZUlkLCB0ZXh0LCByYXcpID0+IHtcblx0XHRcdFx0XHRjb25zdCBpc0NvZGVCbG9ja0NvbXBsZXRlID0gIWlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpIHx8IGNvbnRleHQuZWxlbWVudC5pc0NvbXBsZXRlIHx8ICFyYXcgfHwgY29kZWJsb2NrSGFzQ2xvc2luZ0JhY2t0aWNrcyhyYXcpO1xuXHRcdFx0XHRcdGNvbnN0IGhhc0NoYXRPdXRwdXRSZW5kZXJlciA9ICEhbGFuZ3VhZ2VJZFxuXHRcdFx0XHRcdFx0JiYgdGhpcy5jaGF0T3V0cHV0UmVuZGVyZXJTZXJ2aWNlLmhhc0NvZGVCbG9ja1JlbmRlcmVyKGxhbmd1YWdlSWQpO1xuXHRcdFx0XHRcdGlmICgoIXRleHQgfHwgKHRleHQuc3RhcnRzV2l0aCgnPHZzY29kZV9jb2RlYmxvY2tfdXJpJykgJiYgIXRleHQuaW5jbHVkZXMoJ1xcbicpKSlcblx0XHRcdFx0XHRcdCYmICFpc0NvZGVCbG9ja0NvbXBsZXRlXG5cdFx0XHRcdFx0XHQmJiAhaGFzQ2hhdE91dHB1dFJlbmRlcmVyKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBoaWRlRW1wdHlDb2RlYmxvY2sgPSAkKCdkaXYnKTtcblx0XHRcdFx0XHRcdGhpZGVFbXB0eUNvZGVibG9jay5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGhpZGVFbXB0eUNvZGVibG9jaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGxhbmd1YWdlSWQgPT09ICdkaWZmJyAmJiByYXcgJiYgdGhpcy5yZW5kZXJlck9wdGlvbnMuYWxsb3dJbmxpbmVEaWZmcykge1xuXHRcdFx0XHRcdFx0Y29uc3QgbWF0Y2ggPSByYXcubWF0Y2goL15gYGBkaWZmOihcXHcrKS8pO1xuXHRcdFx0XHRcdFx0aWYgKG1hdGNoICYmIGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGFjdHVhbExhbmd1YWdlSWQgPSBtYXRjaFsxXTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY29kZUJsb2NrVXJpID0gZXh0cmFjdENvZGVibG9ja1VyaXNGcm9tVGV4dCh0ZXh0KTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgeyBiZWZvcmUsIGFmdGVyIH0gPSBwYXJzZVVuaWZpZWREaWZmKGNvZGVCbG9ja1VyaT8udGV4dFdpdGhvdXRSZXN1bHQgPz8gdGV4dCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGRpZmZEYXRhOiBJTWFya2Rvd25EaWZmQmxvY2tEYXRhID0ge1xuXHRcdFx0XHRcdFx0XHRcdGVsZW1lbnQ6IGNvbnRleHQuZWxlbWVudCxcblx0XHRcdFx0XHRcdFx0XHRjb2RlQmxvY2tJbmRleDogZ2xvYmFsQ29kZUJsb2NrSW5kZXhTdGFydCsrLFxuXHRcdFx0XHRcdFx0XHRcdGxhbmd1YWdlSWQ6IGFjdHVhbExhbmd1YWdlSWQsXG5cdFx0XHRcdFx0XHRcdFx0YmVmb3JlQ29udGVudDogYmVmb3JlLFxuXHRcdFx0XHRcdFx0XHRcdGFmdGVyQ29udGVudDogYWZ0ZXIsXG5cdFx0XHRcdFx0XHRcdFx0Y29kZUJsb2NrUmVzb3VyY2U6IGNvZGVCbG9ja1VyaT8udXJpLFxuXHRcdFx0XHRcdFx0XHRcdGlzUmVhZE9ubHk6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0aG9yaXpvbnRhbFBhZGRpbmc6IHRoaXMucmVuZGVyZXJPcHRpb25zLmhvcml6b250YWxQYWRkaW5nLFxuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRjb25zdCBkaWZmUGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFya2Rvd25EaWZmQmxvY2tQYXJ0LCBkaWZmRGF0YSwgY29udGV4dC5kaWZmRWRpdG9yUG9vbCwgY29udGV4dC5jdXJyZW50V2lkdGguZ2V0KCkpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZWY6IElEaXNwb3NhYmxlUmVmZXJlbmNlPE1hcmtkb3duRGlmZkJsb2NrUGFydD4gPSB7XG5cdFx0XHRcdFx0XHRcdFx0b2JqZWN0OiBkaWZmUGFydCxcblx0XHRcdFx0XHRcdFx0XHRpc1N0YWxlOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiBkaWZmUGFydC5kaXNwb3NlKClcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdFx0dGhpcy5hbGxSZWZzLnB1c2gocmVmKTtcblx0XHRcdFx0XHRcdFx0c3RvcmUuYWRkKHJlZik7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBkaWZmUGFydC5lbGVtZW50O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobGFuZ3VhZ2VJZCA9PT0gJ3ZzY29kZS1leHRlbnNpb25zJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2hhdEV4dGVuc2lvbnMgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEV4dGVuc2lvbnNDb250ZW50UGFydCwgeyBraW5kOiAnZXh0ZW5zaW9ucycsIGV4dGVuc2lvbnM6IHRleHQuc3BsaXQoJywnKSB9KSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gY2hhdEV4dGVuc2lvbnMuZG9tTm9kZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZ2xvYmFsSW5kZXggPSBnbG9iYWxDb2RlQmxvY2tJbmRleFN0YXJ0Kys7XG5cdFx0XHRcdFx0bGV0IGNvZGVCbG9ja1RleHQgPSB0ZXh0O1xuXHRcdFx0XHRcdGNvbnN0IGV4dHJhY3RlZFZ1bG5zID0gZXh0cmFjdFZ1bG5lcmFiaWxpdGllc0Zyb21UZXh0KHRleHQpO1xuXHRcdFx0XHRcdGNvZGVCbG9ja1RleHQgPSBmaXhDb2RlVGV4dChleHRyYWN0ZWRWdWxucy5uZXdUZXh0LCBsYW5ndWFnZUlkKTtcblx0XHRcdFx0XHRjb25zdCB2dWxucyA9IGV4dHJhY3RlZFZ1bG5zLnZ1bG5lcmFiaWxpdGllcztcblxuXHRcdFx0XHRcdGxldCBjb2RlbWFwcGVyVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0bGV0IGlzRWRpdDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBjb2RlYmxvY2tVcmkgPSBleHRyYWN0Q29kZWJsb2NrVXJpc0Zyb21UZXh0KGNvZGVCbG9ja1RleHQpO1xuXHRcdFx0XHRcdGlmIChjb2RlYmxvY2tVcmkpIHtcblx0XHRcdFx0XHRcdGNvZGVtYXBwZXJVcmkgPSBjb2RlYmxvY2tVcmkudXJpO1xuXHRcdFx0XHRcdFx0aXNFZGl0ID0gY29kZWJsb2NrVXJpLmlzRWRpdDtcblx0XHRcdFx0XHRcdGNvZGVCbG9ja1RleHQgPSBjb2RlYmxvY2tVcmkudGV4dFdpdGhvdXRSZXN1bHQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgaGlkZVRvb2xiYXIgPSBpc1Jlc3BvbnNlVk0oZWxlbWVudCkgJiYgZWxlbWVudC5lcnJvckRldGFpbHM/LnJlc3BvbnNlSXNGaWx0ZXJlZDtcblx0XHRcdFx0XHRjb25zdCByZW5kZXJPcHRpb25zID0ge1xuXHRcdFx0XHRcdFx0Li4udGhpcy5yZW5kZXJlck9wdGlvbnMuY29kZUJsb2NrUmVuZGVyT3B0aW9ucyxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGlmIChoaWRlVG9vbGJhciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRyZW5kZXJPcHRpb25zLmhpZGVUb29sYmFyID0gaGlkZVRvb2xiYXI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGNvZGVCbG9ja0luZm86IElDb2RlQmxvY2tEYXRhID0geyBsYW5ndWFnZUlkLCB0ZXh0OiBjb2RlQmxvY2tUZXh0LCBjb2RlQmxvY2tJbmRleDogZ2xvYmFsSW5kZXgsIGVsZW1lbnQsIHBhcmVudENvbnRleHRLZXlTZXJ2aWNlOiBjb250ZXh0S2V5U2VydmljZSwgdnVsbnMsIGNvZGVtYXBwZXJVcmksIHJlbmRlck9wdGlvbnMsIGNoYXRTZXNzaW9uUmVzb3VyY2U6IGVsZW1lbnQuc2Vzc2lvblJlc291cmNlIH07XG5cdFx0XHRcdFx0Y29uc3QgYmFzZUNvZGVCbG9ja0luZm8gPSB7XG5cdFx0XHRcdFx0XHRvd25lck1hcmtkb3duUGFydElkOiB0aGlzLmNvZGVibG9ja3NQYXJ0SWQsXG5cdFx0XHRcdFx0XHRjb2RlQmxvY2tJbmRleDogZ2xvYmFsSW5kZXgsXG5cdFx0XHRcdFx0XHRlbGVtZW50SWQ6IGVsZW1lbnQuaWQsXG5cdFx0XHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBlbGVtZW50LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRcdGxhbmd1YWdlSWQsXG5cdFx0XHRcdFx0XHRlZGl0RGVsdGFJbmZvOiBFZGl0RGVsdGFJbmZvLmZyb21UZXh0KHRleHQpLFxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRpZiAoZWxlbWVudC5pc0NvbXBsZXRlQWRkZWRSZXF1ZXN0IHx8ICFjb2RlbWFwcGVyVXJpIHx8ICFpc0VkaXQpIHtcblx0XHRcdFx0XHRcdGlmIChoYXNDaGF0T3V0cHV0UmVuZGVyZXIpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcmVmID0gdGhpcy5yZW5kZXJDaGF0T3V0cHV0Q29kZUJsb2NrKGxhbmd1YWdlSWQsIGNvZGVCbG9ja1RleHQsIGdsb2JhbEluZGV4LCBjb250ZXh0LCBpc0NvZGVCbG9ja0NvbXBsZXRlLCByZXVzYWJsZU91dHB1dENvZGVCbG9ja1JlZnMpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9jb2RlYmxvY2tzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdC4uLmJhc2VDb2RlQmxvY2tJbmZvLFxuXHRcdFx0XHRcdFx0XHRcdGNvZGVtYXBwZXJVcmk6IGNvZGVCbG9ja0luZm8uY29kZW1hcHBlclVyaSxcblx0XHRcdFx0XHRcdFx0XHRpc1N0cmVhbWluZ0VkaXQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdGdldCB1cmkoKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0Zm9jdXMoKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZWYub2JqZWN0LmZvY3VzKCk7XG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdHN0b3JlLmFkZChyZWYpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVmLm9iamVjdC5lbGVtZW50O1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCByZWYgPSB0aGlzLnJlbmRlckNvZGVCbG9jayhjb2RlQmxvY2tJbmZvLCBjdXJyZW50V2lkdGgpO1xuXHRcdFx0XHRcdFx0dGhpcy5fY29kZWJsb2Nrcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0Li4uYmFzZUNvZGVCbG9ja0luZm8sXG5cdFx0XHRcdFx0XHRcdGNvZGVtYXBwZXJVcmk6IGNvZGVCbG9ja0luZm8uY29kZW1hcHBlclVyaSxcblx0XHRcdFx0XHRcdFx0aXNTdHJlYW1pbmdFZGl0OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0Z2V0IHVyaSgpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVmLm9iamVjdC51cmk7XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGZvY3VzKCkge1xuXHRcdFx0XHRcdFx0XHRcdHJlZi5vYmplY3QuZm9jdXMoKTtcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0c3RvcmUuYWRkKHJlZik7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVmLm9iamVjdC5lbGVtZW50O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9IGlzUmVxdWVzdFZNKGVsZW1lbnQpID8gZWxlbWVudC5pZCA6IGVsZW1lbnQucmVxdWVzdElkO1xuXHRcdFx0XHRcdGNvbnN0IHJlZiA9IHRoaXMucmVuZGVyQ29kZUJsb2NrUGlsbChlbGVtZW50LnNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdElkLCBpblVuZG9TdG9wLCBjb2RlbWFwcGVyVXJpKTtcblx0XHRcdFx0XHR0aGlzLl9jb2RlYmxvY2tzLnB1c2goe1xuXHRcdFx0XHRcdFx0Li4uYmFzZUNvZGVCbG9ja0luZm8sXG5cdFx0XHRcdFx0XHRjb2RlbWFwcGVyVXJpLFxuXHRcdFx0XHRcdFx0aXNTdHJlYW1pbmdFZGl0OiAhaXNDb2RlQmxvY2tDb21wbGV0ZSxcblx0XHRcdFx0XHRcdGdldCB1cmkoKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0Zm9jdXMoKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiByZWYub2JqZWN0LmVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0c3RvcmUuYWRkKHJlZik7XG5cdFx0XHRcdFx0cmV0dXJuIHJlZi5vYmplY3QuZWxlbWVudDtcblx0XHRcdFx0fSxcblx0XHRcdFx0bWFya2VkT3B0aW9uczogbWFya2VkT3B0cyxcblx0XHRcdFx0bWFya2VkRXh0ZW5zaW9ucyxcblx0XHRcdFx0Li4ubWFya2Rvd25SZW5kZXJPcHRpb25zLFxuXHRcdFx0XHR0cmFuc2Zvcm1VcmksXG5cdFx0XHR9LCB0aGlzLmRvbU5vZGUpKTtcblxuXHRcdFx0Ly8gSWRlYWxseSB0aGlzIHdvdWxkIGhhcHBlbiBlYXJsaWVyLCBidXQgd2UgbmVlZCB0byBwYXJzZSB0aGUgbWFya2Rvd24uXG5cdFx0XHRpZiAoaXNSZXNwb25zZVZNKGVsZW1lbnQpICYmICFlbGVtZW50Lm1vZGVsLmNvZGVCbG9ja0luZm9zICYmIGVsZW1lbnQubW9kZWwuaXNDb21wbGV0ZSkge1xuXHRcdFx0XHRlbGVtZW50Lm1vZGVsLmluaXRpYWxpemVDb2RlQmxvY2tJbmZvcyh0aGlzLl9jb2RlYmxvY2tzLm1hcChpbmZvID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0c3VnZ2VzdGlvbklkOiB0aGlzLmFpRWRpdFRlbGVtZXRyeVNlcnZpY2UuY3JlYXRlU3VnZ2VzdGlvbklkKHtcblx0XHRcdFx0XHRcdFx0cHJlc2VudGF0aW9uOiAnY29kZUJsb2NrJyxcblx0XHRcdFx0XHRcdFx0ZmVhdHVyZTogJ3NpZGVCYXJDaGF0Jyxcblx0XHRcdFx0XHRcdFx0ZWRpdERlbHRhSW5mbzogaW5mby5lZGl0RGVsdGFJbmZvLFxuXHRcdFx0XHRcdFx0XHRsYW5ndWFnZUlkOiBpbmZvLmxhbmd1YWdlSWQsXG5cdFx0XHRcdFx0XHRcdG1vZGVJZDogZWxlbWVudC5tb2RlbC5yZXF1ZXN0Py5tb2RlSW5mbz8udGVsZW1ldHJ5TW9kZUlkLFxuXHRcdFx0XHRcdFx0XHRtb2RlbElkOiBlbGVtZW50Lm1vZGVsLnJlcXVlc3Q/Lm1vZGVsSWQsXG5cdFx0XHRcdFx0XHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzb3VyY2VSZXF1ZXN0SWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtYXJrZG93bkRlY29yYXRpb25zUmVuZGVyZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TWFya2Rvd25EZWNvcmF0aW9uc1JlbmRlcmVyKTtcblx0XHRcdHN0b3JlLmFkZChtYXJrZG93bkRlY29yYXRpb25zUmVuZGVyZXIud2Fsa1RyZWVBbmRBbm5vdGF0ZVJlZmVyZW5jZUxpbmtzKHRoaXMubWFya2Rvd24sIHJlc3VsdC5lbGVtZW50KSk7XG5cblx0XHRcdGNvbnN0IGxheW91dFBhcnRpY2lwYW50cyA9IG5ldyBMYXp5KCgpID0+IHtcblx0XHRcdFx0Y29uc3Qgb2JzZXJ2ZXIgPSBzdG9yZS5hZGQobmV3IGRvbS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0NoYXRNYXJrZG93bkNvbnRlbnRQYXJ0Lm1hdGhMYXlvdXQnLCAoKSA9PiB0aGlzLm1hdGhMYXlvdXRQYXJ0aWNpcGFudHMuZm9yRWFjaChsYXlvdXQgPT4gbGF5b3V0KCkpKSk7XG5cdFx0XHRcdHN0b3JlLmFkZChvYnNlcnZlci5vYnNlcnZlKHRoaXMuZG9tTm9kZSkpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5tYXRoTGF5b3V0UGFydGljaXBhbnRzO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIE1ha2Uga2F0ZXggYmxvY2tzIGhvcml6b250YWxseSBzY3JvbGxhYmxlXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGZvciAoY29uc3Qga2F0ZXhCbG9jayBvZiB0aGlzLmRvbU5vZGUucXVlcnlTZWxlY3RvckFsbCgnLmthdGV4LWRpc3BsYXknKSkge1xuXHRcdFx0XHRpZiAoIWRvbS5pc0hUTUxFbGVtZW50KGthdGV4QmxvY2spKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzY3JvbGxhYmxlID0gbmV3IERvbVNjcm9sbGFibGVFbGVtZW50KGthdGV4QmxvY2suY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxFbGVtZW50LCB7XG5cdFx0XHRcdFx0dmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0XHRcdGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0byxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHN0b3JlLmFkZChzY3JvbGxhYmxlKTtcblx0XHRcdFx0a2F0ZXhCbG9jay5yZXBsYWNlV2l0aChzY3JvbGxhYmxlLmdldERvbU5vZGUoKSk7XG5cblx0XHRcdFx0bGF5b3V0UGFydGljaXBhbnRzLnZhbHVlLmFkZCgoKSA9PiB7IHNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTsgfSk7XG5cdFx0XHRcdHNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0XHRcdH1cblxuXHRcdFx0c3RvcmUuYWRkKHdyYXBUYWJsZXNXaXRoU2Nyb2xsYWJsZSh0aGlzLmRvbU5vZGUsIGxheW91dFBhcnRpY2lwYW50cykpO1xuXHRcdFx0ZGlzcG9zZShyZXVzYWJsZU91dHB1dENvZGVCbG9ja1JlZnMudmFsdWVzKCkpO1xuXHRcdH07XG5cblx0XHQvLyBBbHdheXMgcmVuZGVyIGltbWVkaWF0ZWx5XG5cdFx0ZG9SZW5kZXJNYXJrZG93bigpO1xuXG5cdFx0Ly8gU2VlZCB0aGUgbW9ycGhlciAqYWZ0ZXIqIHRoZSBpbml0aWFsIHJlbmRlciBzbyBpdCBjYXB0dXJlc1xuXHRcdC8vIHRoZSBjb3JyZWN0IG1hcmtkb3duIGJhc2VsaW5lLiBQYXNzIGBhbmltYXRlSW5pdGlhbDogdHJ1ZWBcblx0XHQvLyBzbyB0aGUgaW5pdGlhbCBET00gY2hpbGRyZW4gcmVjZWl2ZSB0aGUgZW50cmFuY2UgYW5pbWF0aW9uIFx1MjAxNFxuXHRcdC8vIHRoaXMgaXMgaW1wb3J0YW50IHdoZW4gYSBtYXJrZG93biBwYXJ0IGZpcnN0IGFwcGVhcnMgKGUuZy5cblx0XHQvLyBhZnRlciB0aGlua2luZyBjb250ZW50KSBhbmQgYWxyZWFkeSBjb250YWlucyB2aXNpYmxlIGNvbnRlbnQuXG5cdFx0dGhpcy5faW5jcmVtZW50YWxNb3JwaGVyPy5zZWVkKG1hcmtkb3duLmNvbnRlbnQudmFsdWUsIC8qIGFuaW1hdGVJbml0aWFsICovIHRydWUpO1xuXG5cdFx0aWYgKGVuYWJsZU1hdGggJiYgIU1hcmtlZEthdGV4U3VwcG9ydC5nZXRFeHRlbnNpb24oZG9tLmdldFdpbmRvdyhjb250ZXh0LmNvbnRhaW5lcikpKSB7XG5cdFx0XHQvLyBLYVRlWCBub3QgeWV0IGxvYWRlZCAtIGxvYWQgaXQgYW5kIHJlLXJlbmRlciB3aGVuIHJlYWR5XG5cdFx0XHRNYXJrZWRLYXRleFN1cHBvcnQubG9hZEV4dGVuc2lvbihkb20uZ2V0V2luZG93KGNvbnRleHQuY29udGFpbmVyKSlcblx0XHRcdFx0LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdGRvUmVuZGVyTWFya2Rvd24oKTtcblx0XHRcdFx0fSlcblx0XHRcdFx0LmNhdGNoKGUgPT4ge1xuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIE1hcmtlZEthdGV4U3VwcG9ydCBleHRlbnNpb246JywgZSk7XG5cdFx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0ZGlzcG9zZSh0aGlzLmFsbFJlZnMpO1xuXHRcdHRoaXMuYWxsUmVmcy5sZW5ndGggPSAwO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDb2RlQmxvY2tQaWxsKHNlc3Npb25SZXNvdXJjZTogVVJJLCByZXF1ZXN0SWQ6IHN0cmluZywgaW5VbmRvU3RvcDogc3RyaW5nIHwgdW5kZWZpbmVkLCBjb2RlbWFwcGVyVXJpOiBVUkkpOiBJRGlzcG9zYWJsZVJlZmVyZW5jZTxDb2xsYXBzZWRDb2RlQmxvY2s+IHtcblx0XHRjb25zdCBjb2RlQmxvY2sgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbGxhcHNlZENvZGVCbG9jaywgc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0SWQsIGluVW5kb1N0b3ApO1xuXHRcdGNvbnN0IGRpZmZMaXN0ZW5lclN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHJlZjogSURpc3Bvc2FibGVSZWZlcmVuY2U8Q29sbGFwc2VkQ29kZUJsb2NrPiA9IHtcblx0XHRcdG9iamVjdDogY29kZUJsb2NrLFxuXHRcdFx0aXNTdGFsZTogKCkgPT4gZmFsc2UsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGNvZGVCbG9jay5kaXNwb3NlKCk7XG5cdFx0XHRcdGRpZmZMaXN0ZW5lclN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gUHVzaCB0byBhbGxSZWZzIGFuZCByZWdpc3RlciB0aGUgZGlmZiBsaXN0ZW5lciBiZWZvcmUgY2FsbGluZyByZW5kZXIoKSxcblx0XHQvLyBzaW5jZSBkaWZmIG9ic2VydmFibGVzIG1heSBmaXJlIHN5bmNocm9ub3VzbHkgd2hlbiB0aGUgZWRpdGluZyBzZXNzaW9uXG5cdFx0Ly8gYWxyZWFkeSBoYXMgZmluYWxpemVkIGRpZmYgZGF0YSAoZS5nLiBvbiBzZXNzaW9uIHJlc3RvcmUpLlxuXHRcdHRoaXMuYWxsUmVmcy5wdXNoKHJlZik7XG5cdFx0ZGlmZkxpc3RlbmVyU3RvcmUuYWRkKGNvZGVCbG9jay5vbkRpZENoYW5nZURpZmYoKCkgPT4gdGhpcy5maXJlQWdncmVnYXRlZERpZmYoKSkpO1xuXHRcdGNvZGVCbG9jay5yZW5kZXIoY29kZW1hcHBlclVyaSk7XG5cdFx0cmV0dXJuIHJlZjtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ2hhdE91dHB1dENvZGVCbG9jayhcblx0XHRpZGVudGlmaWVyOiBzdHJpbmcsXG5cdFx0dGV4dDogc3RyaW5nLFxuXHRcdGNvZGVCbG9ja0luZGV4OiBudW1iZXIsXG5cdFx0Y29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0aXNDb21wbGV0ZTogYm9vbGVhbixcblx0XHRyZXVzYWJsZU91dHB1dENvZGVCbG9ja1JlZnM6IE1hcDxzdHJpbmcsIElEaXNwb3NhYmxlUmVmZXJlbmNlPENoYXRPdXRwdXRDb2RlQmxvY2tQYXJ0Pj4sXG5cdCk6IElEaXNwb3NhYmxlUmVmZXJlbmNlPENoYXRPdXRwdXRDb2RlQmxvY2tQYXJ0PiB7XG5cdFx0Y29uc3QgcmV1c2VLZXkgPSBDaGF0T3V0cHV0Q29kZUJsb2NrUGFydC5yZXVzZUtleShjb250ZXh0LmVsZW1lbnQuaWQsIGNvZGVCbG9ja0luZGV4LCBpZGVudGlmaWVyKTtcblx0XHRjb25zdCByZXVzYWJsZVJlZiA9IHJldXNhYmxlT3V0cHV0Q29kZUJsb2NrUmVmcy5nZXQocmV1c2VLZXkpO1xuXHRcdGlmIChyZXVzYWJsZVJlZj8ub2JqZWN0Lmhhc1NhbWVDb250ZW50KGlkZW50aWZpZXIsIHRleHQsIGlzQ29tcGxldGUpKSB7XG5cdFx0XHRyZXVzYWJsZU91dHB1dENvZGVCbG9ja1JlZnMuZGVsZXRlKHJldXNlS2V5KTtcblx0XHRcdHRoaXMuYWxsUmVmcy5wdXNoKHJldXNhYmxlUmVmKTtcblx0XHRcdHJldHVybiByZXVzYWJsZVJlZjtcblx0XHR9XG5cblx0XHRjb25zdCBjb2RlQmxvY2sgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdE91dHB1dENvZGVCbG9ja1BhcnQsXG5cdFx0XHRpZGVudGlmaWVyLFxuXHRcdFx0dGV4dCxcblx0XHRcdGNvZGVCbG9ja0luZGV4LFxuXHRcdFx0Y29udGV4dCxcblx0XHRcdGlzQ29tcGxldGUsXG5cdFx0XHQoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKClcblx0XHQpO1xuXHRcdGNvbnN0IHJlZjogSURpc3Bvc2FibGVSZWZlcmVuY2U8Q2hhdE91dHB1dENvZGVCbG9ja1BhcnQ+ID0ge1xuXHRcdFx0b2JqZWN0OiBjb2RlQmxvY2ssXG5cdFx0XHRpc1N0YWxlOiAoKSA9PiBmYWxzZSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IGNvZGVCbG9jay5kaXNwb3NlKClcblx0XHR9O1xuXHRcdHRoaXMuYWxsUmVmcy5wdXNoKHJlZik7XG5cdFx0cmV0dXJuIHJlZjtcblx0fVxuXG5cdHByaXZhdGUgZmlyZUFnZ3JlZ2F0ZWREaWZmKCk6IHZvaWQge1xuXHRcdGxldCB0b3RhbEFkZGVkID0gMDtcblx0XHRsZXQgdG90YWxSZW1vdmVkID0gMDtcblx0XHRmb3IgKGNvbnN0IHJlZiBvZiB0aGlzLmFsbFJlZnMpIHtcblx0XHRcdGlmIChyZWYub2JqZWN0IGluc3RhbmNlb2YgQ29sbGFwc2VkQ29kZUJsb2NrICYmIHJlZi5vYmplY3QuZGlmZikge1xuXHRcdFx0XHR0b3RhbEFkZGVkICs9IHJlZi5vYmplY3QuZGlmZi5hZGRlZDtcblx0XHRcdFx0dG90YWxSZW1vdmVkICs9IHJlZi5vYmplY3QuZGlmZi5yZW1vdmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZURpZmYuZmlyZSh7IGFkZGVkOiB0b3RhbEFkZGVkLCByZW1vdmVkOiB0b3RhbFJlbW92ZWQgfSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNvZGVCbG9jayhkYXRhOiBJQ29kZUJsb2NrRGF0YSwgY3VycmVudFdpZHRoOiBudW1iZXIpOiBJRGlzcG9zYWJsZVJlZmVyZW5jZTxDb2RlQmxvY2tQYXJ0PiB7XG5cdFx0Y29uc3Qga2V5ID0gQ29kZUJsb2NrUGFydC5wb29sS2V5KGRhdGEuZWxlbWVudC5pZCwgZGF0YS5jb2RlQmxvY2tJbmRleCk7XG5cdFx0Y29uc3QgcmVmID0gdGhpcy5lZGl0b3JQb29sLmdldChrZXkpO1xuXHRcdHRoaXMuYWxsUmVmcy5wdXNoKHJlZik7XG5cdFx0cmVmLm9iamVjdC5yZW5kZXIoZGF0YSwgY3VycmVudFdpZHRoKTtcblxuXHRcdC8vIFRoZXJlIGlzIGEgc2NlbmFyaW8gd2hlcmUgcmVxdWVzdCBjb2RlIGJsb2NrIGNvbnRlbnQgY2hhbmdlcyB3aXRob3V0IGEgUmVzaXplT2JzZXJ2ZXIgY2FsbGJhY2suXG5cdFx0Ly8gV29yayBhcm91bmQgaXQgd2l0aCB0aGlzIHRhcmdldGVkIG9uRGlkSGVpZ2h0Q2hhbmdlLiBCdXQgdGhpcyBwYXR0ZXJuIGdlbmVyYWxseSBzaG91bGRuJ3QgYmUgbmVjZXNzYXJ5IGFuZFxuXHRcdC8vIHNob3VsZG4ndCBiZSBjb3BpZWQgZWxzZXdoZXJlLlxuXHRcdGlmICghdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCAmJiBpc1JlcXVlc3RWTShkYXRhLmVsZW1lbnQpKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlZjtcblx0fVxuXG5cdGhhc1NhbWVDb250ZW50KG90aGVyOiBJQ2hhdFByb2dyZXNzUmVuZGVyYWJsZVJlc3BvbnNlQ29udGVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChvdGhlci5raW5kICE9PSAnbWFya2Rvd25Db250ZW50Jykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChvdGhlci5jb250ZW50LnZhbHVlID09PSB0aGlzLm1hcmtkb3duLmNvbnRlbnQudmFsdWUgJiYgZXF1YWxzSW5saW5lUmVmZXJlbmNlcyhvdGhlci5pbmxpbmVSZWZlcmVuY2VzLCB0aGlzLm1hcmtkb3duLmlubGluZVJlZmVyZW5jZXMpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBJZiB3ZSBhcmUgc3RyZWFtaW5nIGluIGNvZGUgc2hvd24gaW4gYW4gZWRpdCBwaWxsLCBkbyBub3QgcmUtcmVuZGVyIHRoZSBlbnRpcmUgY29udGVudCBhcyBsb25nIGFzIGl0J3MgY29taW5nIGluXG5cdFx0Y29uc3QgbGFzdENvZGVibG9jayA9IHRoaXMuX2NvZGVibG9ja3MuYXQoLTEpO1xuXHRcdGlmIChsYXN0Q29kZWJsb2NrICYmIGxhc3RDb2RlYmxvY2suY29kZW1hcHBlclVyaSAhPT0gdW5kZWZpbmVkICYmIGxhc3RDb2RlYmxvY2suaXNTdHJlYW1pbmdFZGl0KSB7XG5cdFx0XHRyZXR1cm4gb3RoZXIuY29udGVudC52YWx1ZS5sYXN0SW5kZXhPZignYGBgJykgPT09IHRoaXMubWFya2Rvd24uY29udGVudC52YWx1ZS5sYXN0SW5kZXhPZignYGBgJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEF0dGVtcHRzIGFuIGluY3JlbWVudGFsIERPTSB1cGRhdGUgZm9yIHNtb290aCBzdHJlYW1pbmcgaW5zdGVhZCBvZlxuXHQgKiB0ZWFyaW5nIGRvd24gYW5kIHJlYnVpbGRpbmcgdGhlIGVudGlyZSBtYXJrZG93biBwYXJ0LlxuXHQgKlxuXHQgKiBUaGUgbW9ycGhlciBjaGVja3MgdGhhdCB0aGUgbmV3IGNvbnRlbnQgaXMgYSBwdXJlIGFwcGVuZCwgdGhlblxuXHQgKiBzY2hlZHVsZXMgYSByQUYtYmF0Y2hlZCByZS1yZW5kZXIgdGhyb3VnaCB0aGUgZnVsbCBtYXJrZG93blxuXHQgKiBwaXBlbGluZS4gQ29kZSBibG9ja3MsIHRhYmxlcywgYW5kIGFsbCBtYXJrZG93biBmZWF0dXJlcyBhcmVcblx0ICogcmVuZGVyZWQgY29ycmVjdGx5IGJlY2F1c2UgdGhlIHVwZGF0ZSBnb2VzIHRocm91Z2ggdGhlIHN0YW5kYXJkXG5cdCAqIGBkb1JlbmRlck1hcmtkb3duKClgIHBhdGguXG5cdCAqXG5cdCAqIEBwYXJhbSBuZXdNYXJrZG93biBUaGUgbmV3IChhcHBlbmRlZCkgbWFya2Rvd24gY29udGVudC5cblx0ICogQHJldHVybnMgYHRydWVgIGlmIHRoZSBpbmNyZW1lbnRhbCB1cGRhdGUgc3VjY2VlZGVkIGFuZCB0aGUgY2FsbGVyXG5cdCAqICAgICAgICAgIHNob3VsZCB0cmVhdCB0aGlzIHBhcnQgYXMgdW5jaGFuZ2VkLiBgZmFsc2VgIGlmIGEgZnVsbFxuXHQgKiAgICAgICAgICByZS1yZW5kZXIgaXMgbmVlZGVkLlxuXHQgKi9cblx0dHJ5SW5jcmVtZW50YWxVcGRhdGUobmV3TWFya2Rvd246IElDaGF0TWFya2Rvd25Db250ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9pbmNyZW1lbnRhbE1vcnBoZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIWVxdWFsc0lubGluZVJlZmVyZW5jZXMobmV3TWFya2Rvd24uaW5saW5lUmVmZXJlbmNlcywgdGhpcy5tYXJrZG93bi5pbmxpbmVSZWZlcmVuY2VzKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1Y2Nlc3MgPSB0aGlzLl9pbmNyZW1lbnRhbE1vcnBoZXIudHJ5TW9ycGgobmV3TWFya2Rvd24uY29udGVudC52YWx1ZSk7XG5cblx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0Ly8gVXBkYXRlIHRoZSBzdG9yZWQgbWFya2Rvd24gc28gaGFzU2FtZUNvbnRlbnQoKSByZXR1cm5zIHRydWVcblx0XHRcdC8vIGZvciBzdWJzZXF1ZW50IGRpZmZzIHdpdGggdGhlIHNhbWUgY29udGVudCwgYWxsb3dpbmcgdGhlXG5cdFx0XHQvLyBwcm9ncmVzc2l2ZSByZW5kZXIgdG8gZGV0ZWN0IFwiY2F1Z2h0IHVwXCIgYW5kIFwiY29tcGxldGVcIiBzdGF0ZXMuXG5cdFx0XHR0aGlzLm1hcmtkb3duID0gbmV3TWFya2Rvd247XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1Y2Nlc3M7XG5cdH1cblxuXHQvKipcblx0ICogRm9yd2FyZCB0aGUgc3RyZWFtJ3Mgd29yZC1yYXRlIGVzdGltYXRlIHRvIHRoZSBtb3JwaGVyJ3MgYnVmZmVyLlxuXHQgKi9cblx0dXBkYXRlU3RyZWFtUmF0ZShyYXRlOiBudW1iZXIsIGlzQ29tcGxldGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9pbmNyZW1lbnRhbE1vcnBoZXI/LnVwZGF0ZVN0cmVhbVJhdGUocmF0ZSwgaXNDb21wbGV0ZSk7XG5cdH1cblxuXHRsYXlvdXQod2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuYWxsUmVmcy5mb3JFYWNoKChyZWYsIGluZGV4KSA9PiB7XG5cdFx0XHRpZiAocmVmLm9iamVjdCBpbnN0YW5jZW9mIENvZGVCbG9ja1BhcnQpIHtcblx0XHRcdFx0cmVmLm9iamVjdC5sYXlvdXQod2lkdGgpO1xuXHRcdFx0fSBlbHNlIGlmIChyZWYub2JqZWN0IGluc3RhbmNlb2YgQ2hhdE91dHB1dENvZGVCbG9ja1BhcnQpIHtcblx0XHRcdFx0cmVmLm9iamVjdC5sYXlvdXQod2lkdGgpO1xuXHRcdFx0fSBlbHNlIGlmIChyZWYub2JqZWN0IGluc3RhbmNlb2YgTWFya2Rvd25EaWZmQmxvY2tQYXJ0KSB7XG5cdFx0XHRcdHJlZi5vYmplY3QubGF5b3V0KHdpZHRoKTtcblx0XHRcdH0gZWxzZSBpZiAocmVmLm9iamVjdCBpbnN0YW5jZW9mIENvbGxhcHNlZENvZGVCbG9jaykge1xuXHRcdFx0XHRjb25zdCBjb2RlYmxvY2tNb2RlbCA9IHRoaXMuX2NvZGVibG9ja3NbaW5kZXhdO1xuXHRcdFx0XHRpZiAoY29kZWJsb2NrTW9kZWwuY29kZW1hcHBlclVyaSAmJiAhaXNFcXVhbChyZWYub2JqZWN0LnVyaSwgY29kZWJsb2NrTW9kZWwuY29kZW1hcHBlclVyaSkpIHtcblx0XHRcdFx0XHRyZWYub2JqZWN0LnJlbmRlcihjb2RlYmxvY2tNb2RlbC5jb2RlbWFwcGVyVXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5tYXRoTGF5b3V0UGFydGljaXBhbnRzLmZvckVhY2gobGF5b3V0ID0+IGxheW91dCgpKTtcblx0fVxuXG5cdG9uRGlkUmVtb3VudCgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlZiBvZiB0aGlzLmFsbFJlZnMpIHtcblx0XHRcdGlmIChyZWYub2JqZWN0IGluc3RhbmNlb2YgQ29kZUJsb2NrUGFydCB8fCByZWYub2JqZWN0IGluc3RhbmNlb2YgQ2hhdE91dHB1dENvZGVCbG9ja1BhcnQpIHtcblx0XHRcdFx0cmVmLm9iamVjdC5vbkRpZFJlbW91bnQoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhZGREaXNwb3NhYmxlKGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZXF1YWxzSW5saW5lUmVmZXJlbmNlcyhhOiBSZWNvcmQ8c3RyaW5nLCBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2U+IHwgdW5kZWZpbmVkLCBiOiBSZWNvcmQ8c3RyaW5nLCBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2U+IHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmIChhID09PSBiKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKCFhIHx8ICFiKSB7XG5cdFx0cmV0dXJuICFhICYmICFiO1xuXHR9XG5cblx0Y29uc3QgYUtleXMgPSBPYmplY3Qua2V5cyhhKTtcblx0Y29uc3QgYktleXMgPSBPYmplY3Qua2V5cyhiKTtcblx0aWYgKGFLZXlzLmxlbmd0aCAhPT0gYktleXMubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIGFLZXlzLmV2ZXJ5KGtleSA9PiBlcXVhbHNJbmxpbmVSZWZlcmVuY2UoYVtrZXldLCBiW2tleV0pKTtcbn1cblxuZnVuY3Rpb24gZXF1YWxzSW5saW5lUmVmZXJlbmNlKGE6IElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSB8IHVuZGVmaW5lZCwgYjogSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmICghYSB8fCAhYikge1xuXHRcdHJldHVybiAhYSAmJiAhYjtcblx0fVxuXG5cdHJldHVybiBhLnJlc29sdmVJZCA9PT0gYi5yZXNvbHZlSWRcblx0XHQmJiBhLm5hbWUgPT09IGIubmFtZVxuXHRcdCYmIGVxdWFsc0lubGluZVJlZmVyZW5jZVZhbHVlKGEuaW5saW5lUmVmZXJlbmNlLCBiLmlubGluZVJlZmVyZW5jZSk7XG59XG5cbnR5cGUgSW5saW5lUmVmZXJlbmNlVmFsdWUgPSBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2VbJ2lubGluZVJlZmVyZW5jZSddO1xudHlwZSBXb3Jrc3BhY2VTeW1ib2xJbmxpbmVSZWZlcmVuY2UgPSBFeHRyYWN0PElubGluZVJlZmVyZW5jZVZhbHVlLCB7IG5hbWU6IHN0cmluZzsgbG9jYXRpb246IHVua25vd24gfT47XG50eXBlIFdvcmtzcGFjZVN5bWJvbENvbXBhcmVyID0gKGE6IFdvcmtzcGFjZVN5bWJvbElubGluZVJlZmVyZW5jZSwgYjogV29ya3NwYWNlU3ltYm9sSW5saW5lUmVmZXJlbmNlKSA9PiBib29sZWFuO1xuXG5jb25zdCB3b3Jrc3BhY2VTeW1ib2xDb21wYXJlcnM6IHsgcmVhZG9ubHkgW0sgaW4ga2V5b2YgV29ya3NwYWNlU3ltYm9sSW5saW5lUmVmZXJlbmNlXS0/OiBXb3Jrc3BhY2VTeW1ib2xDb21wYXJlciB9ID0ge1xuXHRuYW1lOiAoYSwgYikgPT4gYS5uYW1lID09PSBiLm5hbWUsXG5cdGNvbnRhaW5lck5hbWU6IChhLCBiKSA9PiBhLmNvbnRhaW5lck5hbWUgPT09IGIuY29udGFpbmVyTmFtZSxcblx0a2luZDogKGEsIGIpID0+IGEua2luZCA9PT0gYi5raW5kLFxuXHR0YWdzOiAoYSwgYikgPT4gZXF1YWxzU3ltYm9sVGFncyhhLnRhZ3MsIGIudGFncyksXG5cdGxvY2F0aW9uOiAoYSwgYikgPT4gaXNFcXVhbChhLmxvY2F0aW9uLnVyaSwgYi5sb2NhdGlvbi51cmkpICYmIFJhbmdlLmVxdWFsc1JhbmdlKGEubG9jYXRpb24ucmFuZ2UsIGIubG9jYXRpb24ucmFuZ2UpLFxufTtcblxuY29uc3Qgd29ya3NwYWNlU3ltYm9sQ29tcGFyZXJLZXlzID0gT2JqZWN0LmtleXMod29ya3NwYWNlU3ltYm9sQ29tcGFyZXJzKSBhcyAoa2V5b2YgV29ya3NwYWNlU3ltYm9sSW5saW5lUmVmZXJlbmNlKVtdO1xuXG5mdW5jdGlvbiBlcXVhbHNJbmxpbmVSZWZlcmVuY2VWYWx1ZShhOiBJbmxpbmVSZWZlcmVuY2VWYWx1ZSwgYjogSW5saW5lUmVmZXJlbmNlVmFsdWUpOiBib29sZWFuIHtcblx0aWYgKFVSSS5pc1VyaShhKSB8fCBVUkkuaXNVcmkoYikpIHtcblx0XHRyZXR1cm4gVVJJLmlzVXJpKGEpICYmIFVSSS5pc1VyaShiKSAmJiBpc0VxdWFsKGEsIGIpO1xuXHR9XG5cdGlmIChpc0xvY2F0aW9uKGEpIHx8IGlzTG9jYXRpb24oYikpIHtcblx0XHRyZXR1cm4gaXNMb2NhdGlvbihhKSAmJiBpc0xvY2F0aW9uKGIpICYmIGlzRXF1YWwoYS51cmksIGIudXJpKSAmJiBSYW5nZS5lcXVhbHNSYW5nZShhLnJhbmdlLCBiLnJhbmdlKTtcblx0fVxuXG5cdHJldHVybiBlcXVhbHNXb3Jrc3BhY2VTeW1ib2woYSwgYik7XG59XG5cbmZ1bmN0aW9uIGVxdWFsc1dvcmtzcGFjZVN5bWJvbChhOiBXb3Jrc3BhY2VTeW1ib2xJbmxpbmVSZWZlcmVuY2UsIGI6IFdvcmtzcGFjZVN5bWJvbElubGluZVJlZmVyZW5jZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gd29ya3NwYWNlU3ltYm9sQ29tcGFyZXJLZXlzLmV2ZXJ5KGtleSA9PiB3b3Jrc3BhY2VTeW1ib2xDb21wYXJlcnNba2V5XShhLCBiKSk7XG59XG5cbmZ1bmN0aW9uIGVxdWFsc1N5bWJvbFRhZ3MoYTogcmVhZG9ubHkgU3ltYm9sVGFnW10gfCB1bmRlZmluZWQsIGI6IHJlYWRvbmx5IFN5bWJvbFRhZ1tdIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmIChhID09PSBiKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKCFhIHx8ICFiIHx8IGEubGVuZ3RoICE9PSBiLmxlbmd0aCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gYS5ldmVyeSgodGFnLCBpbmRleCkgPT4gdGFnID09PSBiW2luZGV4XSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2RlYmxvY2tIYXNDbG9zaW5nQmFja3RpY2tzKHN0cjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHN0ciA9IHN0ci50cmltKCk7XG5cdHJldHVybiAhIXN0ci5tYXRjaCgvXFxuYGBgKyQvKTtcbn1cblxuY2xhc3MgQ2hhdE91dHB1dENvZGVCbG9ja1BhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRzdGF0aWMgcmV1c2VLZXkoZWxlbWVudElkOiBzdHJpbmcsIGNvZGVCbG9ja0luZGV4OiBudW1iZXIsIGlkZW50aWZpZXI6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke2VsZW1lbnRJZH0vJHtjb2RlQmxvY2tJbmRleH0vJHtpZGVudGlmaWVyLnRvTG93ZXJDYXNlKCl9YDtcblx0fVxuXG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSByZXVzZUtleTogc3RyaW5nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2VDdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlcmVkT3V0cHV0UGFydCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxSZW5kZXJlZE91dHB1dFBhcnQ+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaWRlbnRpZmllcjogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGV4dDogc3RyaW5nLFxuXHRcdGNvZGVCbG9ja0luZGV4OiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlzQ29tcGxldGU6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvbkRpZENoYW5nZUhlaWdodDogKCkgPT4gdm9pZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRPdXRwdXRSZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0T3V0cHV0UmVuZGVyZXJTZXJ2aWNlOiBJQ2hhdE91dHB1dFJlbmRlcmVyU2VydmljZSxcblx0XHRASUNoYXRPdXRwdXRQYXJ0U3RhdGVDYWNoZSBwcml2YXRlIHJlYWRvbmx5IHN0YXRlQ2FjaGU6IElDaGF0T3V0cHV0UGFydFN0YXRlQ2FjaGUsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZXVzZUtleSA9IENoYXRPdXRwdXRDb2RlQmxvY2tQYXJ0LnJldXNlS2V5KGNvbnRleHQuZWxlbWVudC5pZCwgY29kZUJsb2NrSW5kZXgsIGlkZW50aWZpZXIpO1xuXG5cdFx0Y29uc3QgdGl0bGUgPSBsb2NhbGl6ZSgnY2hhdC5yZW5kZXJlZENvZGVCbG9ja0xhYmVsJywgXCJSZW5kZXJlZCBjb2RlIGJsb2NrIHswfVwiLCBjb2RlQmxvY2tJbmRleCArIDEpO1xuXHRcdHRoaXMuZWxlbWVudCA9ICQoJy5pbnRlcmFjdGl2ZS1yZXN1bHQtY29kZS1ibG9jay5jaGF0LW91dHB1dC1jb2RlLWJsb2NrLnRvb2wtb3V0cHV0LXBhcnQnKTtcblx0XHR0aGlzLmVsZW1lbnQudGFiSW5kZXggPSAtMTtcblx0XHR0aGlzLmVsZW1lbnQuYXJpYUxhYmVsID0gdGl0bGU7XG5cblx0XHRjb25zdCBwYXJlbnQgPSAkKCcud2Vidmlldy1vdXRwdXQnKTtcblx0XHRwYXJlbnQuc3R5bGUubWF4SGVpZ2h0ID0gJzgwdmgnO1xuXHRcdHBhcmVudC5zdHlsZS5taW5IZWlnaHQgPSAnMzhweCc7XG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHBhcmVudCk7XG5cblx0XHRjb25zdCBzdGF0ZUNhY2hlS2V5ID0gYGNvZGVCbG9jay8ke2NvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0vJHtjb250ZXh0LmVsZW1lbnQuaWR9LyR7Y29kZUJsb2NrSW5kZXh9LyR7aWRlbnRpZmllci50b0xvd2VyQ2FzZSgpfWA7XG5cdFx0Y29uc3QgcGFydFN0YXRlOiBJT3V0cHV0UGFydFN0YXRlID0gdGhpcy5zdGF0ZUNhY2hlLmdldChzdGF0ZUNhY2hlS2V5KSA/PyB7IGhlaWdodDogMCB9O1xuXHRcdHRoaXMuc3RhdGVDYWNoZS5zZXQoc3RhdGVDYWNoZUtleSwgcGFydFN0YXRlKTtcblx0XHRpZiAocGFydFN0YXRlLmhlaWdodCkge1xuXHRcdFx0cGFyZW50LnN0eWxlLmhlaWdodCA9IGAke3BhcnRTdGF0ZS5oZWlnaHR9cHhgO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2dyZXNzTWVzc2FnZSA9ICQoJ3NwYW4nKTtcblx0XHRwcm9ncmVzc01lc3NhZ2UudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5jb2RlQmxvY2tPdXRwdXRSZW5kZXJpbmcnLCBcIlJlbmRlcmluZyBjb2RlIGJsb2NrLi4uXCIpO1xuXHRcdGNvbnN0IHByb2dyZXNzUGFydCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFByb2dyZXNzU3ViUGFydCwgcHJvZ3Jlc3NNZXNzYWdlLCBUaGVtZUljb24ubW9kaWZ5KENvZGljb24ubG9hZGluZywgJ3NwaW4nKSwgdW5kZWZpbmVkKSk7XG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKHByb2dyZXNzUGFydC5kb21Ob2RlKTtcblx0XHRpZiAoIWlzQ29tcGxldGUpIHtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VIZWlnaHQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNoYXRPdXRwdXRSZW5kZXJlclNlcnZpY2UucmVuZGVyQ29kZUJsb2NrKGlkZW50aWZpZXIsIG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSh0ZXh0KSwgcGFyZW50LCB7XG5cdFx0XHR3ZWJ2aWV3U3RhdGU6IHBhcnRTdGF0ZS53ZWJ2aWV3U3RhdGUsXG5cdFx0XHR0aXRsZSxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSxcblx0XHR9LCB0aGlzLl9kaXNwb3NlQ3RzLnRva2VuKS50aGVuKHJlbmRlcmVkSXRlbSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZGlzcG9zZUN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZW5kZXJlZEl0ZW0uZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3JlbmRlcmVkT3V0cHV0UGFydC52YWx1ZSA9IHJlbmRlcmVkSXRlbTtcblx0XHRcdHByb2dyZXNzUGFydC5kb21Ob2RlLnJlbW92ZSgpO1xuXHRcdFx0cGFyZW50LnN0eWxlLm1pbkhlaWdodCA9ICcnO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUhlaWdodCgpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZW5kZXJlZEl0ZW0ud2Vidmlldy5vbkRpZFVwZGF0ZVN0YXRlKGUgPT4ge1xuXHRcdFx0XHRwYXJ0U3RhdGUud2Vidmlld1N0YXRlID0gZTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVuZGVyZWRJdGVtLm9uRGlkQ2hhbmdlSGVpZ2h0KG5ld0hlaWdodCA9PiB7XG5cdFx0XHRcdHBhcnRTdGF0ZS5oZWlnaHQgPSBuZXdIZWlnaHQ7XG5cdFx0XHRcdHRoaXMub25EaWRDaGFuZ2VIZWlnaHQoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dC5vbkRpZENoYW5nZVZpc2liaWxpdHkodmlzaWJsZSA9PiB7XG5cdFx0XHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRcdFx0cmVuZGVyZWRJdGVtLnJlaW5pdGlhbGl6ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSwgZXJyb3IgPT4ge1xuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc29sZS5lcnJvcignRXJyb3IgcmVuZGVyaW5nIGNoYXQgY29kZSBibG9jazonLCBlcnJvcik7XG5cdFx0XHRwcm9ncmVzc1BhcnQuZG9tTm9kZS5yZXBsYWNlV2l0aCh0aGlzLnJlbmRlckVycm9yKGVycm9yKSk7XG5cdFx0XHRwYXJlbnQuc3R5bGUubWluSGVpZ2h0ID0gJyc7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlSGVpZ2h0KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRoYXNTYW1lQ29udGVudChpZGVudGlmaWVyOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgaXNDb21wbGV0ZTogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpZGVudGlmaWVyLnRvTG93ZXJDYXNlKCkgPT09IHRoaXMuaWRlbnRpZmllci50b0xvd2VyQ2FzZSgpXG5cdFx0XHQmJiB0ZXh0ID09PSB0aGlzLnRleHRcblx0XHRcdCYmIGlzQ29tcGxldGUgPT09IHRoaXMuaXNDb21wbGV0ZTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zZUN0cy5kaXNwb3NlKHRydWUpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGxheW91dCh3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLm1heFdpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHR9XG5cblx0b25EaWRSZW1vdW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlcmVkT3V0cHV0UGFydC52YWx1ZT8ucmVpbml0aWFsaXplKCk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHRjb25zdCB3ZWJ2aWV3ID0gdGhpcy5fcmVuZGVyZWRPdXRwdXRQYXJ0LnZhbHVlPy53ZWJ2aWV3O1xuXHRcdGlmICh3ZWJ2aWV3KSB7XG5cdFx0XHR3ZWJ2aWV3LmZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWxlbWVudC5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRXJyb3IoZXJyb3I6IEVycm9yKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGVycm9yTm9kZSA9ICQoJy5vdXRwdXQtZXJyb3InKTtcblxuXHRcdGNvbnN0IGVycm9ySGVhZGVyTm9kZSA9ICQoJy5vdXRwdXQtZXJyb3ItaGVhZGVyJyk7XG5cdFx0ZG9tLmFwcGVuZChlcnJvck5vZGUsIGVycm9ySGVhZGVyTm9kZSk7XG5cblx0XHRjb25zdCBpY29uRWxlbWVudCA9ICQoJ2RpdicpO1xuXHRcdGljb25FbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5lcnJvcikpO1xuXHRcdGVycm9ySGVhZGVyTm9kZS5hcHBlbmQoaWNvbkVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgZXJyb3JUaXRsZU5vZGUgPSAkKCcub3V0cHV0LWVycm9yLXRpdGxlJyk7XG5cdFx0ZXJyb3JUaXRsZU5vZGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5jb2RlQmxvY2tPdXRwdXRFcnJvcicsIFwiRXJyb3IgcmVuZGVyaW5nIHRoZSBjb2RlIGJsb2NrXCIpO1xuXHRcdGVycm9ySGVhZGVyTm9kZS5hcHBlbmQoZXJyb3JUaXRsZU5vZGUpO1xuXG5cdFx0Y29uc3QgZXJyb3JNZXNzYWdlTm9kZSA9ICQoJy5vdXRwdXQtZXJyb3ItZGV0YWlscycpO1xuXHRcdGVycm9yTWVzc2FnZU5vZGUudGV4dENvbnRlbnQgPSBlcnJvcj8ubWVzc2FnZSB8fCBTdHJpbmcoZXJyb3IpO1xuXHRcdGVycm9yTm9kZS5hcHBlbmQoZXJyb3JNZXNzYWdlTm9kZSk7XG5cblx0XHRyZXR1cm4gZXJyb3JOb2RlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb2xsYXBzZWRDb2RlQmxvY2sgZXh0ZW5kcyBDaGF0RWRpdFBpbGxFbGVtZW50IHtcblxuXHRwcml2YXRlIGN1cnJlbnREaWZmOiBJRWRpdFNlc3Npb25FbnRyeURpZmYgfCB1bmRlZmluZWQ7XG5cdGdldCBkaWZmKCk6IElFZGl0U2Vzc2lvbkVudHJ5RGlmZiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudERpZmY7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURpZmYgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRWRpdFNlc3Npb25FbnRyeURpZmY+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURpZmY6IEV2ZW50PElFZGl0U2Vzc2lvbkVudHJ5RGlmZj4gPSB0aGlzLl9vbkRpZENoYW5nZURpZmYuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1N0b3JlID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlcXVlc3RJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW5VbmRvU3RvcDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobGFiZWxTZXJ2aWNlLCBtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDbGljayhlID0+IHRoaXMuc2hvd0RpZmYoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ29udGV4dE1lbnUoZXZlbnQgPT4ge1xuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHRoaXMuY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMudXJpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5DaGF0RWRpdGluZ0NvZGVCbG9ja0NvbnRleHQsIHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHtcblx0XHRcdFx0XHRcdGFyZzoge1xuXHRcdFx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHRoaXMuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRyZXF1ZXN0SWQ6IHRoaXMucmVxdWVzdElkLFxuXHRcdFx0XHRcdFx0XHR1cmk6IHRoaXMudXJpLFxuXHRcdFx0XHRcdFx0XHRzdG9wSWQ6IHRoaXMuaW5VbmRvU3RvcCxcblx0XHRcdFx0XHRcdH0gc2F0aXNmaWVzIENoYXRFZGl0aW5nQWN0aW9uQ29udGV4dCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRyZXR1cm4gZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyhtZW51KTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd0RpZmYoeyBlZGl0b3JPcHRpb25zOiBvcHRpb25zLCBvcGVuVG9TaWRlIH06IElPcGVuRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGdyb3VwID0gb3BlblRvU2lkZSA/IFNJREVfR1JPVVAgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuY3VycmVudERpZmYpIHtcblx0XHRcdC8vIElmIHRoZSBjaGFuZ2UgaXMgYSBwdXJlIGFkZGl0aW9uIGludG8gYSBmaWxlIHdob3NlIG9yaWdpbmFsIHZlcnNpb24gZGlkIG5vdFxuXHRcdFx0Ly8gZXhpc3Qgb3Igd2FzIGVtcHR5LCB0aGVyZSBpcyBub3RoaW5nIG1lYW5pbmdmdWwgdG8gZGlmZiBhZ2FpbnN0LiBPcGVuIHRoZVxuXHRcdFx0Ly8gZmlsZSBpbiBhIG5vcm1hbCBlZGl0b3IgaW5zdGVhZCBvZiBhIGRpZmYgZWRpdG9yLlxuXHRcdFx0aWYgKHRoaXMuY3VycmVudERpZmYucmVtb3ZlZCA9PT0gMCAmJiBhd2FpdCBpc1Jlc291cmNlQ29udGVudEVtcHR5KHRoaXMudGV4dE1vZGVsU2VydmljZSwgdGhpcy5jdXJyZW50RGlmZi5vcmlnaW5hbFVSSSkgJiYgdGhpcy51cmkpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdGhpcy51cmksIG9wdGlvbnMgfSwgZ3JvdXApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiB0aGlzLmN1cnJlbnREaWZmLm9yaWdpbmFsVVJJIH0sXG5cdFx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiB0aGlzLmN1cnJlbnREaWZmLm1vZGlmaWVkVVJJIH0sXG5cdFx0XHRcdG9wdGlvbnNcblx0XHRcdH0sIGdyb3VwKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMudXJpKSB7XG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB0aGlzLnVyaSwgb3B0aW9ucyB9LCBncm91cCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBwYXJhbSB1cmkgVVJJIG9mIHRoZSBmaWxlIG9uLWRpc2sgYmVpbmcgY2hhbmdlZFxuXHQgKi9cblx0cmVuZGVyKHVyaTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5wcm9ncmVzc1N0b3JlLmNsZWFyKCk7XG5cblx0XHR0aGlzLnNldFVyaSh1cmkpO1xuXHRcdHRoaXMuc2V0U3RhdHVzKHVuZGVmaW5lZCwgJycpO1xuXHRcdHRoaXMuc2V0TGFiZWxEZXRhaWwoJycpO1xuXHRcdHRoaXMuc2V0UHJvZ3Jlc3NGaWxsKHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHRoaXMuc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBlZGl0U2Vzc2lvbiA9IHNlc3Npb24/LmVkaXRpbmdTZXNzaW9uO1xuXHRcdGlmICghZWRpdFNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkaWZmT2JzZXJ2YWJsZSA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gZWRpdFNlc3Npb24ucmVhZEVudHJ5KHVyaSwgcmVhZGVyKTtcblx0XHRcdHJldHVybiBlbnRyeSAmJiBlZGl0U2Vzc2lvbi5nZXRFbnRyeURpZmZCZXR3ZWVuU3RvcHMoZW50cnkubW9kaWZpZWRVUkksIHRoaXMucmVxdWVzdElkLCB0aGlzLmluVW5kb1N0b3ApO1xuXHRcdH0pLm1hcCgoZCwgcikgPT4gZD8ucmVhZChyKSk7XG5cblx0XHRjb25zdCBpc1N0cmVhbWluZyA9IGRlcml2ZWQociA9PiB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IGVkaXRTZXNzaW9uLnJlYWRFbnRyeSh1cmksIHIpO1xuXHRcdFx0Y29uc3QgY3VycmVudGx5TW9kaWZpZWQgPSBlbnRyeT8uaXNDdXJyZW50bHlCZWluZ01vZGlmaWVkQnkucmVhZChyKTtcblx0XHRcdHJldHVybiAhIWN1cnJlbnRseU1vZGlmaWVkICYmIGN1cnJlbnRseU1vZGlmaWVkLnJlc3BvbnNlTW9kZWwucmVxdWVzdElkID09PSB0aGlzLnJlcXVlc3RJZCAmJiBjdXJyZW50bHlNb2RpZmllZC51bmRvU3RvcElkID09PSB0aGlzLmluVW5kb1N0b3A7XG5cdFx0fSk7XG5cblx0XHQvLyBTZXQgdGhlIGljb24vY2xhc3NlcyB3aGlsZSBlZGl0cyBhcmUgc3RyZWFtaW5nXG5cdFx0Y29uc3QgaWNvblRleHQgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHVyaSk7XG5cdFx0dGhpcy5wcm9ncmVzc1N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXHRcdFx0aWYgKGlzU3RyZWFtaW5nLnJlYWQocikpIHtcblx0XHRcdFx0Y29uc3QgY29kaWNvbiA9IFRoZW1lSWNvbi5tb2RpZnkoQ29kaWNvbi5sb2FkaW5nLCAnc3BpbicpO1xuXHRcdFx0XHR0aGlzLnNldFN0YXR1cyhjb2RpY29uLCBsb2NhbGl6ZSgnY2hhdC5jb2RlYmxvY2suYXBwbHlpbmdFZGl0cycsICdBcHBseWluZyBlZGl0cycpKTtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBlZGl0U2Vzc2lvbi5yZWFkRW50cnkodXJpLCByKTtcblx0XHRcdFx0Y29uc3QgcndSYXRpbyA9IE1hdGguZmxvb3IoKGVudHJ5Py5yZXdyaXRlUmF0aW8ucmVhZChyKSB8fCAwKSAqIDEwMCk7XG5cblx0XHRcdFx0Y29uc3Qgc2hvd0FuaW1hdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uU2hvd0NvZGVCbG9ja1Byb2dyZXNzQW5pbWF0aW9uKTtcblx0XHRcdFx0aWYgKHNob3dBbmltYXRpb24pIHtcblx0XHRcdFx0XHR0aGlzLnNldFByb2dyZXNzRmlsbChyd1JhdGlvKTtcblx0XHRcdFx0XHR0aGlzLnNldExhYmVsRGV0YWlsKCcnKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnNldFByb2dyZXNzRmlsbCh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHRoaXMuc2V0TGFiZWxEZXRhaWwocndSYXRpbyA9PT0gMCB8fCAhcndSYXRpbyA/IGxvY2FsaXplKCdjaGF0LmNvZGVibG9jay5nZW5lcmF0aW5nJywgXCJHZW5lcmF0aW5nIGVkaXRzLi4uXCIpIDogbG9jYWxpemUoJ2NoYXQuY29kZWJsb2NrLmFwcGx5aW5nUGVyY2VudGFnZScsIFwiKHswfSUpLi4uXCIsIHJ3UmF0aW8pKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zZXRTdGF0dXMoQ29kaWNvbi5jaGVjaywgbG9jYWxpemUoJ2NoYXQuY29kZWJsb2NrLmVkaXRlZCcsICdFZGl0ZWQnKSk7XG5cdFx0XHRcdHRoaXMuc2V0UHJvZ3Jlc3NGaWxsKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuc2V0TGFiZWxEZXRhaWwoJycpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlbmRlciB0aGUgKy8tIGRpZmZcblx0XHR0aGlzLnByb2dyZXNzU3RvcmUuYWRkKGF1dG9ydW5TZWxmRGlzcG9zYWJsZShyID0+IHtcblx0XHRcdGNvbnN0IGNoYW5nZXMgPSBkaWZmT2JzZXJ2YWJsZS5yZWFkKHIpO1xuXHRcdFx0aWYgKGNoYW5nZXMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2VzICYmICFjaGFuZ2VzPy5pZGVudGljYWwgJiYgIWNoYW5nZXM/LnF1aXRFYXJseSkge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnREaWZmID0gY2hhbmdlcztcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaWZmLmZpcmUoY2hhbmdlcyk7XG5cdFx0XHRcdHRoaXMuc2V0RGlmZih7IGFkZGVkOiBjaGFuZ2VzLmFkZGVkLCByZW1vdmVkOiBjaGFuZ2VzLnJlbW92ZWQgfSk7XG5cdFx0XHRcdGNvbnN0IGluc2VydGlvbnNGcmFnbWVudCA9IGNoYW5nZXMuYWRkZWQgPT09IDEgPyBsb2NhbGl6ZSgnY2hhdC5jb2RlYmxvY2suaW5zZXJ0aW9ucy5vbmUnLCBcIjEgaW5zZXJ0aW9uXCIpIDogbG9jYWxpemUoJ2NoYXQuY29kZWJsb2NrLmluc2VydGlvbnMnLCBcInswfSBpbnNlcnRpb25zXCIsIGNoYW5nZXMuYWRkZWQpO1xuXHRcdFx0XHRjb25zdCBkZWxldGlvbnNGcmFnbWVudCA9IGNoYW5nZXMucmVtb3ZlZCA9PT0gMSA/IGxvY2FsaXplKCdjaGF0LmNvZGVibG9jay5kZWxldGlvbnMub25lJywgXCIxIGRlbGV0aW9uXCIpIDogbG9jYWxpemUoJ2NoYXQuY29kZWJsb2NrLmRlbGV0aW9ucycsIFwiezB9IGRlbGV0aW9uc1wiLCBjaGFuZ2VzLnJlbW92ZWQpO1xuXHRcdFx0XHR0aGlzLnNldEFyaWFMYWJlbChsb2NhbGl6ZSgnc3VtbWFyeScsICdFZGl0ZWQgezB9LCB7MX0sIHsyfScsIGljb25UZXh0LCBpbnNlcnRpb25zRnJhZ21lbnQsIGRlbGV0aW9uc0ZyYWdtZW50KSk7XG5cblx0XHRcdFx0Ly8gTm8gbmVlZCB0byBrZWVwIHVwZGF0aW5nIG9uY2Ugd2UgZ2V0IHRoZSBkaWZmIGluZm9cblx0XHRcdFx0aWYgKGNoYW5nZXMuaXNGaW5hbCkge1xuXHRcdFx0XHRcdHIuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZpeENvZGVUZXh0KHRleHQ6IHN0cmluZywgbGFuZ3VhZ2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0aWYgKGxhbmd1YWdlSWQgPT09ICdwaHAnKSB7XG5cdFx0Ly8gPD9waHAgb3Igc2hvcnQgdGFnIHZlcnNpb24gPD9cblx0XHRpZiAoIXRleHQudHJpbSgpLnN0YXJ0c1dpdGgoJzw/JykpIHtcblx0XHRcdHJldHVybiBgPD9waHBcXG4ke3RleHR9YDtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdGV4dDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMscUNBQWdHO0FBQ3pHLFNBQVMsY0FBYztBQUN2QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsWUFBWSxpQkFBaUIsU0FBc0IseUJBQXlCO0FBQ3JGLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxTQUFTLHVCQUF1QixlQUFlO0FBQ3hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtDO0FBQzNDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsY0FBYyxjQUFjO0FBQ3JDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsZ0JBQWdCLGtCQUFrQjtBQUMzQyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDhCQUE4QixzQ0FBc0M7QUFHN0UsU0FBNEQsb0JBQW1DO0FBQy9GLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsYUFBYSxvQkFBb0I7QUFDMUMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxrQ0FBMkQ7QUFDcEUsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBaUMsdUJBQXVCLHdCQUF3QjtBQUVoRixTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHFCQUE4RDtBQUN2RSxPQUFPO0FBSVAsU0FBUyxxQkFBcUIsOEJBQThCO0FBQzVELFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUNBQW1EO0FBQzVELE9BQU87QUFFUCxNQUFNLElBQUksSUFBSTtBQW1CUCxJQUFNLDBCQUFOLGNBQXNDLFdBQXVDO0FBQUEsRUE4Qm5GLFlBQ1MsVUFDUixTQUNpQixZQUNqQix5QkFBeUIsT0FDekIsc0JBQXNCLEdBQ3RCLFVBQ0EsdUJBQ0EsY0FDaUIsaUJBQ0csbUJBQ0csc0JBQ2lCLHNCQUNFLHdCQUNHLDJCQUNOLHFCQUN0QztBQUNELFVBQU07QUFoQkU7QUFFUztBQU1BO0FBR3VCO0FBQ0U7QUFDRztBQUNOO0FBekN4QyxTQUFTLG1CQUFtQixPQUFPLEVBQUUsd0JBQXdCLE9BQU87QUFJcEU7QUFBQSxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ3hFLFNBQVMsb0JBQWlDLEtBQUssbUJBQW1CO0FBRWxFLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxRQUErQixDQUFDO0FBS3ZGO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBUyxrQkFBZ0QsS0FBSyxpQkFBaUI7QUFFL0UsU0FBaUIsVUFBd0gsQ0FBQztBQUUxSSxTQUFpQixjQUE0QyxDQUFDO0FBSzlELFNBQWlCLHlCQUF5QixvQkFBSSxJQUFnQjtBQXdCN0QsVUFBTSxVQUFVLFFBQVE7QUFDeEIsVUFBTSxhQUFjLFNBQVMsUUFBUSxTQUFTLE9BQUssRUFBRSxTQUFTLFlBQVksUUFBUSxZQUFZLEdBQWlDO0FBSS9ILFFBQUksNEJBQTRCO0FBRWhDLFNBQUssVUFBVSxFQUFFLHdCQUF3QjtBQUV6QyxRQUFJLEtBQUssZ0JBQWdCLHNCQUFzQixlQUFlO0FBQzdELFdBQUssUUFBUSxZQUFZLEtBQUssZ0JBQWdCLHFCQUFxQjtBQUNuRSxVQUFJLHFCQUFxQixTQUFrQixnQ0FBZ0MsMEJBQTBCLEdBQUc7QUFDdkcsZUFBTyxLQUFLLGdCQUFnQixxQkFBcUIsYUFBYTtBQUFBLE1BQy9EO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSxxQkFBcUIsU0FBa0Isa0JBQWtCLFVBQVU7QUFNdEYsVUFBTSw4QkFBOEIscUJBQXFCLFNBQWtCLGtCQUFrQixvQkFBb0I7QUFDakgsUUFBSSwrQkFBK0IsYUFBYSxPQUFPLEtBQUssMEJBQTBCLENBQUMsUUFBUSxZQUFZO0FBQzFHLFdBQUssc0JBQXNCLEtBQUssVUFBVSxxQkFBcUIsZUFBZSx1QkFBdUIsS0FBSyxPQUFPLENBQUM7QUFDbEgsV0FBSyxvQkFBb0Isa0JBQWtCLENBQUMsVUFBVTtBQVFyRCxjQUFNLGdCQUFnQixLQUFLO0FBQzNCLGNBQU0sVUFBVSxJQUFJLGVBQWUsT0FBTyxLQUFLLFNBQVMsT0FBTztBQUMvRCxnQkFBUSxVQUFVLElBQUksT0FBTyxLQUFLLFNBQVMsUUFBUSxPQUFPO0FBQzFELGdCQUFRLE9BQU8sS0FBSyxTQUFTLFFBQVE7QUFDckMsYUFBSyxXQUFXLEVBQUUsR0FBRyxLQUFLLFVBQVUsUUFBUTtBQUM1Qyx5QkFBaUI7QUFDakIsYUFBSyxXQUFXO0FBS2hCLGFBQUssbUJBQW1CLEtBQUs7QUFBQSxNQUM5QixDQUFDO0FBQUEsSUFDRjtBQUVBLFVBQU0sY0FBYyxLQUFLLFVBQVUsSUFBSSxrQkFBbUMsQ0FBQztBQUUzRSxVQUFNLG1CQUFtQixNQUFNO0FBQzlCLFVBQUksS0FBSyxPQUFPLFlBQVk7QUFDM0I7QUFBQSxNQUNEO0FBRUEsWUFBTSxzQkFBc0IsWUFBWSxhQUFhO0FBQ3JELFlBQU0sOEJBQThCLG9CQUFJLElBQTJEO0FBQ25HLGlCQUFXLE9BQU8sS0FBSyxTQUFTO0FBQy9CLFlBQUksSUFBSSxrQkFBa0IseUJBQXlCO0FBQ2xELGdCQUFNLFlBQVk7QUFDbEIsK0JBQXFCLGNBQWMsU0FBUztBQUM1QyxzQ0FBNEIsSUFBSSxVQUFVLE9BQU8sVUFBVSxTQUFTO0FBQUEsUUFDckU7QUFBQSxNQUNEO0FBQ0EsMkJBQXFCLFFBQVE7QUFHN0IsWUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLGtCQUFZLFFBQVE7QUFDcEIsVUFBSSxVQUFVLEtBQUssT0FBTztBQUMxQixXQUFLLFFBQVEsU0FBUztBQUN0QixXQUFLLFlBQVksU0FBUztBQUMxQixXQUFLLHVCQUF1QixNQUFNO0FBQ2xDLGtDQUE0QjtBQUc1QixZQUFNLG1CQUFtQixhQUN0QixTQUFTLENBQUMsbUJBQW1CLGFBQWEsSUFBSSxVQUFVLFFBQVEsU0FBUyxHQUFHO0FBQUEsUUFDN0UsY0FBYztBQUFBLE1BQ2YsQ0FBQyxDQUFDLENBQUMsSUFDRCxDQUFDO0FBSUosWUFBTSxhQUE0QztBQUFBLFFBQ2pELEtBQUs7QUFBQSxRQUNMLFFBQVE7QUFBQSxNQUNUO0FBRUEsWUFBTSwyQkFBMkIsdUJBQXVCO0FBQ3hELFlBQU0sZUFBZSxhQUFhLE9BQU8sSUFDdEMsQ0FBQyxNQUFjLFNBQTJCLEtBQUssb0JBQW9CLHVCQUF1QixRQUFRLGlCQUFpQiwyQkFBMkIsTUFBTSxJQUFJLEtBQUssTUFBTSxJQUFJLElBQ3ZLO0FBQ0gsWUFBTSxTQUFTLE1BQU0sSUFBSSxTQUFTLE9BQU8sS0FBSyxTQUFTLFNBQVM7QUFBQSxRQUMvRCxpQkFBaUIsbUJBQW1CLG9CQUFvQjtBQUFBLFVBQ3ZELGFBQWE7QUFBQSxVQUNiLG1CQUFtQjtBQUFBLFFBQ3BCLENBQUM7QUFBQSxRQUNEO0FBQUEsUUFDQSx1QkFBdUIsQ0FBQyxZQUFZLE1BQU0sUUFBUTtBQUNqRCxnQkFBTSxzQkFBc0IsQ0FBQyxhQUFhLFFBQVEsT0FBTyxLQUFLLFFBQVEsUUFBUSxjQUFjLENBQUMsT0FBTyw2QkFBNkIsR0FBRztBQUNwSSxnQkFBTSx3QkFBd0IsQ0FBQyxDQUFDLGNBQzVCLEtBQUssMEJBQTBCLHFCQUFxQixVQUFVO0FBQ2xFLGVBQUssQ0FBQyxRQUFTLEtBQUssV0FBVyx1QkFBdUIsS0FBSyxDQUFDLEtBQUssU0FBUyxJQUFJLE1BQzFFLENBQUMsdUJBQ0QsQ0FBQyx1QkFBdUI7QUFDM0Isa0JBQU0scUJBQXFCLEVBQUUsS0FBSztBQUNsQywrQkFBbUIsTUFBTSxVQUFVO0FBQ25DLG1CQUFPO0FBQUEsVUFDUjtBQUNBLGNBQUksZUFBZSxVQUFVLE9BQU8sS0FBSyxnQkFBZ0Isa0JBQWtCO0FBQzFFLGtCQUFNLFFBQVEsSUFBSSxNQUFNLGdCQUFnQjtBQUN4QyxnQkFBSSxTQUFTLGFBQWEsUUFBUSxPQUFPLEdBQUc7QUFDM0Msb0JBQU0sbUJBQW1CLE1BQU0sQ0FBQztBQUNoQyxvQkFBTSxlQUFlLDZCQUE2QixJQUFJO0FBQ3RELG9CQUFNLEVBQUUsUUFBUSxNQUFNLElBQUksaUJBQWlCLGNBQWMscUJBQXFCLElBQUk7QUFDbEYsb0JBQU0sV0FBbUM7QUFBQSxnQkFDeEMsU0FBUyxRQUFRO0FBQUEsZ0JBQ2pCLGdCQUFnQjtBQUFBLGdCQUNoQixZQUFZO0FBQUEsZ0JBQ1osZUFBZTtBQUFBLGdCQUNmLGNBQWM7QUFBQSxnQkFDZCxtQkFBbUIsY0FBYztBQUFBLGdCQUNqQyxZQUFZO0FBQUEsZ0JBQ1osbUJBQW1CLEtBQUssZ0JBQWdCO0FBQUEsY0FDekM7QUFDQSxvQkFBTSxXQUFXLEtBQUsscUJBQXFCLGVBQWUsdUJBQXVCLFVBQVUsUUFBUSxnQkFBZ0IsUUFBUSxhQUFhLElBQUksQ0FBQztBQUM3SSxvQkFBTUEsT0FBbUQ7QUFBQSxnQkFDeEQsUUFBUTtBQUFBLGdCQUNSLFNBQVMsTUFBTTtBQUFBLGdCQUNmLFNBQVMsTUFBTSxTQUFTLFFBQVE7QUFBQSxjQUNqQztBQUNBLG1CQUFLLFFBQVEsS0FBS0EsSUFBRztBQUNyQixvQkFBTSxJQUFJQSxJQUFHO0FBQ2IscUJBQU8sU0FBUztBQUFBLFlBQ2pCO0FBQUEsVUFDRDtBQUNBLGNBQUksZUFBZSxxQkFBcUI7QUFDdkMsa0JBQU0saUJBQWlCLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSwyQkFBMkIsRUFBRSxNQUFNLGNBQWMsWUFBWSxLQUFLLE1BQU0sR0FBRyxFQUFFLENBQUMsQ0FBQztBQUNwSixtQkFBTyxlQUFlO0FBQUEsVUFDdkI7QUFDQSxnQkFBTSxjQUFjO0FBQ3BCLGNBQUksZ0JBQWdCO0FBQ3BCLGdCQUFNLGlCQUFpQiwrQkFBK0IsSUFBSTtBQUMxRCwwQkFBZ0IsWUFBWSxlQUFlLFNBQVMsVUFBVTtBQUM5RCxnQkFBTSxRQUFRLGVBQWU7QUFFN0IsY0FBSTtBQUNKLGNBQUk7QUFDSixnQkFBTSxlQUFlLDZCQUE2QixhQUFhO0FBQy9ELGNBQUksY0FBYztBQUNqQiw0QkFBZ0IsYUFBYTtBQUM3QixxQkFBUyxhQUFhO0FBQ3RCLDRCQUFnQixhQUFhO0FBQUEsVUFDOUI7QUFFQSxnQkFBTSxjQUFjLGFBQWEsT0FBTyxLQUFLLFFBQVEsY0FBYztBQUNuRSxnQkFBTSxnQkFBZ0I7QUFBQSxZQUNyQixHQUFHLEtBQUssZ0JBQWdCO0FBQUEsVUFDekI7QUFDQSxjQUFJLGdCQUFnQixRQUFXO0FBQzlCLDBCQUFjLGNBQWM7QUFBQSxVQUM3QjtBQUNBLGdCQUFNLGdCQUFnQyxFQUFFLFlBQVksTUFBTSxlQUFlLGdCQUFnQixhQUFhLFNBQVMseUJBQXlCLG1CQUFtQixPQUFPLGVBQWUsZUFBZSxxQkFBcUIsUUFBUSxnQkFBZ0I7QUFDN08sZ0JBQU0sb0JBQW9CO0FBQUEsWUFDekIscUJBQXFCLEtBQUs7QUFBQSxZQUMxQixnQkFBZ0I7QUFBQSxZQUNoQixXQUFXLFFBQVE7QUFBQSxZQUNuQixxQkFBcUIsUUFBUTtBQUFBLFlBQzdCO0FBQUEsWUFDQSxlQUFlLGNBQWMsU0FBUyxJQUFJO0FBQUEsVUFDM0M7QUFFQSxjQUFJLFFBQVEsMEJBQTBCLENBQUMsaUJBQWlCLENBQUMsUUFBUTtBQUNoRSxnQkFBSSx1QkFBdUI7QUFDMUIsb0JBQU1BLE9BQU0sS0FBSywwQkFBMEIsWUFBWSxlQUFlLGFBQWEsU0FBUyxxQkFBcUIsMkJBQTJCO0FBQzVJLG1CQUFLLFlBQVksS0FBSztBQUFBLGdCQUNyQixHQUFHO0FBQUEsZ0JBQ0gsZUFBZSxjQUFjO0FBQUEsZ0JBQzdCLGlCQUFpQjtBQUFBLGdCQUNqQixJQUFJLE1BQU07QUFDVCx5QkFBTztBQUFBLGdCQUNSO0FBQUEsZ0JBQ0EsUUFBUTtBQUNQLGtCQUFBQSxLQUFJLE9BQU8sTUFBTTtBQUFBLGdCQUNsQjtBQUFBLGNBQ0QsQ0FBQztBQUNELG9CQUFNLElBQUlBLElBQUc7QUFDYixxQkFBT0EsS0FBSSxPQUFPO0FBQUEsWUFDbkI7QUFFQSxrQkFBTUEsT0FBTSxLQUFLLGdCQUFnQixlQUFlLFlBQVk7QUFDNUQsaUJBQUssWUFBWSxLQUFLO0FBQUEsY0FDckIsR0FBRztBQUFBLGNBQ0gsZUFBZSxjQUFjO0FBQUEsY0FDN0IsaUJBQWlCO0FBQUEsY0FDakIsSUFBSSxNQUFNO0FBQ1QsdUJBQU9BLEtBQUksT0FBTztBQUFBLGNBQ25CO0FBQUEsY0FDQSxRQUFRO0FBQ1AsZ0JBQUFBLEtBQUksT0FBTyxNQUFNO0FBQUEsY0FDbEI7QUFBQSxZQUNELENBQUM7QUFDRCxrQkFBTSxJQUFJQSxJQUFHO0FBQ2IsbUJBQU9BLEtBQUksT0FBTztBQUFBLFVBQ25CO0FBRUEsZ0JBQU0sWUFBWSxZQUFZLE9BQU8sSUFBSSxRQUFRLEtBQUssUUFBUTtBQUM5RCxnQkFBTSxNQUFNLEtBQUssb0JBQW9CLFFBQVEsaUJBQWlCLFdBQVcsWUFBWSxhQUFhO0FBQ2xHLGVBQUssWUFBWSxLQUFLO0FBQUEsWUFDckIsR0FBRztBQUFBLFlBQ0g7QUFBQSxZQUNBLGlCQUFpQixDQUFDO0FBQUEsWUFDbEIsSUFBSSxNQUFNO0FBQ1QscUJBQU87QUFBQSxZQUNSO0FBQUEsWUFDQSxRQUFRO0FBQ1AscUJBQU8sSUFBSSxPQUFPLFFBQVEsTUFBTTtBQUFBLFlBQ2pDO0FBQUEsVUFDRCxDQUFDO0FBQ0QsZ0JBQU0sSUFBSSxHQUFHO0FBQ2IsaUJBQU8sSUFBSSxPQUFPO0FBQUEsUUFDbkI7QUFBQSxRQUNBLGVBQWU7QUFBQSxRQUNmO0FBQUEsUUFDQSxHQUFHO0FBQUEsUUFDSDtBQUFBLE1BQ0QsR0FBRyxLQUFLLE9BQU8sQ0FBQztBQUdoQixVQUFJLGFBQWEsT0FBTyxLQUFLLENBQUMsUUFBUSxNQUFNLGtCQUFrQixRQUFRLE1BQU0sWUFBWTtBQUN2RixnQkFBUSxNQUFNLHlCQUF5QixLQUFLLFlBQVksSUFBSSxVQUFRO0FBQ25FLGlCQUFPO0FBQUEsWUFDTixjQUFjLEtBQUssdUJBQXVCLG1CQUFtQjtBQUFBLGNBQzVELGNBQWM7QUFBQSxjQUNkLFNBQVM7QUFBQSxjQUNULGVBQWUsS0FBSztBQUFBLGNBQ3BCLFlBQVksS0FBSztBQUFBLGNBQ2pCLFFBQVEsUUFBUSxNQUFNLFNBQVMsVUFBVTtBQUFBLGNBQ3pDLFNBQVMsUUFBUSxNQUFNLFNBQVM7QUFBQSxjQUNoQyw0QkFBNEI7QUFBQSxjQUM1QixRQUFRO0FBQUEsY0FDUixpQkFBaUI7QUFBQSxZQUNsQixDQUFDO0FBQUEsVUFDRjtBQUFBLFFBQ0QsQ0FBQyxDQUFDO0FBQUEsTUFDSDtBQUVBLFlBQU0sOEJBQThCLHFCQUFxQixlQUFlLCtCQUErQjtBQUN2RyxZQUFNLElBQUksNEJBQTRCLGtDQUFrQyxLQUFLLFVBQVUsT0FBTyxPQUFPLENBQUM7QUFFdEcsWUFBTSxxQkFBcUIsSUFBSSxLQUFLLE1BQU07QUFDekMsY0FBTSxXQUFXLE1BQU0sSUFBSSxJQUFJLElBQUkseUJBQXlCLHNDQUFzQyxNQUFNLEtBQUssdUJBQXVCLFFBQVEsWUFBVSxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBQ2hLLGNBQU0sSUFBSSxTQUFTLFFBQVEsS0FBSyxPQUFPLENBQUM7QUFDeEMsZUFBTyxLQUFLO0FBQUEsTUFDYixDQUFDO0FBSUQsaUJBQVcsY0FBYyxLQUFLLFFBQVEsaUJBQWlCLGdCQUFnQixHQUFHO0FBQ3pFLFlBQUksQ0FBQyxJQUFJLGNBQWMsVUFBVSxHQUFHO0FBQ25DO0FBQUEsUUFDRDtBQUVBLGNBQU0sYUFBYSxJQUFJLHFCQUFxQixXQUFXLFVBQVUsSUFBSSxHQUFrQjtBQUFBLFVBQ3RGLFVBQVUsb0JBQW9CO0FBQUEsVUFDOUIsWUFBWSxvQkFBb0I7QUFBQSxRQUNqQyxDQUFDO0FBQ0QsY0FBTSxJQUFJLFVBQVU7QUFDcEIsbUJBQVcsWUFBWSxXQUFXLFdBQVcsQ0FBQztBQUU5QywyQkFBbUIsTUFBTSxJQUFJLE1BQU07QUFBRSxxQkFBVyxZQUFZO0FBQUEsUUFBRyxDQUFDO0FBQ2hFLG1CQUFXLFlBQVk7QUFBQSxNQUN4QjtBQUVBLFlBQU0sSUFBSSx5QkFBeUIsS0FBSyxTQUFTLGtCQUFrQixDQUFDO0FBQ3BFLGNBQVEsNEJBQTRCLE9BQU8sQ0FBQztBQUFBLElBQzdDO0FBR0EscUJBQWlCO0FBT2pCLFNBQUsscUJBQXFCO0FBQUEsTUFBSyxTQUFTLFFBQVE7QUFBQTtBQUFBLE1BQTRCO0FBQUEsSUFBSTtBQUVoRixRQUFJLGNBQWMsQ0FBQyxtQkFBbUIsYUFBYSxJQUFJLFVBQVUsUUFBUSxTQUFTLENBQUMsR0FBRztBQUVyRix5QkFBbUIsY0FBYyxJQUFJLFVBQVUsUUFBUSxTQUFTLENBQUMsRUFDL0QsS0FBSyxNQUFNO0FBQ1gseUJBQWlCO0FBQUEsTUFDbEIsQ0FBQyxFQUNBLE1BQU0sT0FBSztBQUNYLGdCQUFRLE1BQU0sZ0RBQWdELENBQUM7QUFBQSxNQUNoRSxDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0Q7QUFBQSxFQXZVQSxJQUFXLGFBQW1DO0FBQzdDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQXVVUyxVQUFnQjtBQUN4QixVQUFNLFFBQVE7QUFFZCxZQUFRLEtBQUssT0FBTztBQUNwQixTQUFLLFFBQVEsU0FBUztBQUFBLEVBQ3ZCO0FBQUEsRUFFUSxvQkFBb0IsaUJBQXNCLFdBQW1CLFlBQWdDLGVBQThEO0FBQ2xLLFVBQU0sWUFBWSxLQUFLLHFCQUFxQixlQUFlLG9CQUFvQixpQkFBaUIsV0FBVyxVQUFVO0FBQ3JILFVBQU0sb0JBQW9CLElBQUksZ0JBQWdCO0FBQzlDLFVBQU0sTUFBZ0Q7QUFBQSxNQUNyRCxRQUFRO0FBQUEsTUFDUixTQUFTLE1BQU07QUFBQSxNQUNmLFNBQVMsTUFBTTtBQUNkLGtCQUFVLFFBQVE7QUFDbEIsMEJBQWtCLFFBQVE7QUFBQSxNQUMzQjtBQUFBLElBQ0Q7QUFLQSxTQUFLLFFBQVEsS0FBSyxHQUFHO0FBQ3JCLHNCQUFrQixJQUFJLFVBQVUsZ0JBQWdCLE1BQU0sS0FBSyxtQkFBbUIsQ0FBQyxDQUFDO0FBQ2hGLGNBQVUsT0FBTyxhQUFhO0FBQzlCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSwwQkFDUCxZQUNBLE1BQ0EsZ0JBQ0EsU0FDQSxZQUNBLDZCQUNnRDtBQUNoRCxVQUFNLFdBQVcsd0JBQXdCLFNBQVMsUUFBUSxRQUFRLElBQUksZ0JBQWdCLFVBQVU7QUFDaEcsVUFBTSxjQUFjLDRCQUE0QixJQUFJLFFBQVE7QUFDNUQsUUFBSSxhQUFhLE9BQU8sZUFBZSxZQUFZLE1BQU0sVUFBVSxHQUFHO0FBQ3JFLGtDQUE0QixPQUFPLFFBQVE7QUFDM0MsV0FBSyxRQUFRLEtBQUssV0FBVztBQUM3QixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sWUFBWSxLQUFLLHFCQUFxQjtBQUFBLE1BQzNDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLE1BQU0sS0FBSyxtQkFBbUIsS0FBSztBQUFBLElBQ3BDO0FBQ0EsVUFBTSxNQUFxRDtBQUFBLE1BQzFELFFBQVE7QUFBQSxNQUNSLFNBQVMsTUFBTTtBQUFBLE1BQ2YsU0FBUyxNQUFNLFVBQVUsUUFBUTtBQUFBLElBQ2xDO0FBQ0EsU0FBSyxRQUFRLEtBQUssR0FBRztBQUNyQixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEscUJBQTJCO0FBQ2xDLFFBQUksYUFBYTtBQUNqQixRQUFJLGVBQWU7QUFDbkIsZUFBVyxPQUFPLEtBQUssU0FBUztBQUMvQixVQUFJLElBQUksa0JBQWtCLHNCQUFzQixJQUFJLE9BQU8sTUFBTTtBQUNoRSxzQkFBYyxJQUFJLE9BQU8sS0FBSztBQUM5Qix3QkFBZ0IsSUFBSSxPQUFPLEtBQUs7QUFBQSxNQUNqQztBQUFBLElBQ0Q7QUFDQSxTQUFLLGlCQUFpQixLQUFLLEVBQUUsT0FBTyxZQUFZLFNBQVMsYUFBYSxDQUFDO0FBQUEsRUFDeEU7QUFBQSxFQUVRLGdCQUFnQixNQUFzQixjQUEyRDtBQUN4RyxVQUFNLE1BQU0sY0FBYyxRQUFRLEtBQUssUUFBUSxJQUFJLEtBQUssY0FBYztBQUN0RSxVQUFNLE1BQU0sS0FBSyxXQUFXLElBQUksR0FBRztBQUNuQyxTQUFLLFFBQVEsS0FBSyxHQUFHO0FBQ3JCLFFBQUksT0FBTyxPQUFPLE1BQU0sWUFBWTtBQUtwQyxRQUFJLENBQUMsS0FBSyxPQUFPLGNBQWMsWUFBWSxLQUFLLE9BQU8sR0FBRztBQUN6RCxXQUFLLG1CQUFtQixLQUFLO0FBQUEsSUFDOUI7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsZUFBZSxPQUF3RDtBQUN0RSxRQUFJLE1BQU0sU0FBUyxtQkFBbUI7QUFDckMsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLE1BQU0sUUFBUSxVQUFVLEtBQUssU0FBUyxRQUFRLFNBQVMsdUJBQXVCLE1BQU0sa0JBQWtCLEtBQUssU0FBUyxnQkFBZ0IsR0FBRztBQUMxSSxhQUFPO0FBQUEsSUFDUjtBQUdBLFVBQU0sZ0JBQWdCLEtBQUssWUFBWSxHQUFHLEVBQUU7QUFDNUMsUUFBSSxpQkFBaUIsY0FBYyxrQkFBa0IsVUFBYSxjQUFjLGlCQUFpQjtBQUNoRyxhQUFPLE1BQU0sUUFBUSxNQUFNLFlBQVksS0FBSyxNQUFNLEtBQUssU0FBUyxRQUFRLE1BQU0sWUFBWSxLQUFLO0FBQUEsSUFDaEc7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBaUJBLHFCQUFxQixhQUE0QztBQUNoRSxRQUFJLENBQUMsS0FBSyxxQkFBcUI7QUFDOUIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLENBQUMsdUJBQXVCLFlBQVksa0JBQWtCLEtBQUssU0FBUyxnQkFBZ0IsR0FBRztBQUMxRixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sVUFBVSxLQUFLLG9CQUFvQixTQUFTLFlBQVksUUFBUSxLQUFLO0FBRTNFLFFBQUksU0FBUztBQUlaLFdBQUssV0FBVztBQUFBLElBQ2pCO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLGlCQUFpQixNQUFjLFlBQTJCO0FBQ3pELFNBQUsscUJBQXFCLGlCQUFpQixNQUFNLFVBQVU7QUFBQSxFQUM1RDtBQUFBLEVBRUEsT0FBTyxPQUFxQjtBQUMzQixTQUFLLFFBQVEsUUFBUSxDQUFDLEtBQUssVUFBVTtBQUNwQyxVQUFJLElBQUksa0JBQWtCLGVBQWU7QUFDeEMsWUFBSSxPQUFPLE9BQU8sS0FBSztBQUFBLE1BQ3hCLFdBQVcsSUFBSSxrQkFBa0IseUJBQXlCO0FBQ3pELFlBQUksT0FBTyxPQUFPLEtBQUs7QUFBQSxNQUN4QixXQUFXLElBQUksa0JBQWtCLHVCQUF1QjtBQUN2RCxZQUFJLE9BQU8sT0FBTyxLQUFLO0FBQUEsTUFDeEIsV0FBVyxJQUFJLGtCQUFrQixvQkFBb0I7QUFDcEQsY0FBTSxpQkFBaUIsS0FBSyxZQUFZLEtBQUs7QUFDN0MsWUFBSSxlQUFlLGlCQUFpQixDQUFDLFFBQVEsSUFBSSxPQUFPLEtBQUssZUFBZSxhQUFhLEdBQUc7QUFDM0YsY0FBSSxPQUFPLE9BQU8sZUFBZSxhQUFhO0FBQUEsUUFDL0M7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx1QkFBdUIsUUFBUSxZQUFVLE9BQU8sQ0FBQztBQUFBLEVBQ3ZEO0FBQUEsRUFFQSxlQUFxQjtBQUNwQixlQUFXLE9BQU8sS0FBSyxTQUFTO0FBQy9CLFVBQUksSUFBSSxrQkFBa0IsaUJBQWlCLElBQUksa0JBQWtCLHlCQUF5QjtBQUN6RixZQUFJLE9BQU8sYUFBYTtBQUFBLE1BQ3pCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGNBQWMsWUFBK0I7QUFDNUMsU0FBSyxVQUFVLFVBQVU7QUFBQSxFQUMxQjtBQUNEO0FBbmhCYSx3QkFFRyxVQUFVO0FBRmIsMEJBQU47QUFBQSxFQXdDSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0E3Q1U7QUFxaEJiLFNBQVMsdUJBQXVCLEdBQTRELEdBQXFFO0FBQ2hLLE1BQUksTUFBTSxHQUFHO0FBQ1osV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLENBQUMsS0FBSyxDQUFDLEdBQUc7QUFDYixXQUFPLENBQUMsS0FBSyxDQUFDO0FBQUEsRUFDZjtBQUVBLFFBQU0sUUFBUSxPQUFPLEtBQUssQ0FBQztBQUMzQixRQUFNLFFBQVEsT0FBTyxLQUFLLENBQUM7QUFDM0IsTUFBSSxNQUFNLFdBQVcsTUFBTSxRQUFRO0FBQ2xDLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTyxNQUFNLE1BQU0sU0FBTyxzQkFBc0IsRUFBRSxHQUFHLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUNoRTtBQUVBLFNBQVMsc0JBQXNCLEdBQTRDLEdBQXFEO0FBQy9ILE1BQUksQ0FBQyxLQUFLLENBQUMsR0FBRztBQUNiLFdBQU8sQ0FBQyxLQUFLLENBQUM7QUFBQSxFQUNmO0FBRUEsU0FBTyxFQUFFLGNBQWMsRUFBRSxhQUNyQixFQUFFLFNBQVMsRUFBRSxRQUNiLDJCQUEyQixFQUFFLGlCQUFpQixFQUFFLGVBQWU7QUFDcEU7QUFNQSxNQUFNLDJCQUFnSDtBQUFBLEVBQ3JILE1BQU0sQ0FBQyxHQUFHLE1BQU0sRUFBRSxTQUFTLEVBQUU7QUFBQSxFQUM3QixlQUFlLENBQUMsR0FBRyxNQUFNLEVBQUUsa0JBQWtCLEVBQUU7QUFBQSxFQUMvQyxNQUFNLENBQUMsR0FBRyxNQUFNLEVBQUUsU0FBUyxFQUFFO0FBQUEsRUFDN0IsTUFBTSxDQUFDLEdBQUcsTUFBTSxpQkFBaUIsRUFBRSxNQUFNLEVBQUUsSUFBSTtBQUFBLEVBQy9DLFVBQVUsQ0FBQyxHQUFHLE1BQU0sUUFBUSxFQUFFLFNBQVMsS0FBSyxFQUFFLFNBQVMsR0FBRyxLQUFLLE1BQU0sWUFBWSxFQUFFLFNBQVMsT0FBTyxFQUFFLFNBQVMsS0FBSztBQUNwSDtBQUVBLE1BQU0sOEJBQThCLE9BQU8sS0FBSyx3QkFBd0I7QUFFeEUsU0FBUywyQkFBMkIsR0FBeUIsR0FBa0M7QUFDOUYsTUFBSSxJQUFJLE1BQU0sQ0FBQyxLQUFLLElBQUksTUFBTSxDQUFDLEdBQUc7QUFDakMsV0FBTyxJQUFJLE1BQU0sQ0FBQyxLQUFLLElBQUksTUFBTSxDQUFDLEtBQUssUUFBUSxHQUFHLENBQUM7QUFBQSxFQUNwRDtBQUNBLE1BQUksV0FBVyxDQUFDLEtBQUssV0FBVyxDQUFDLEdBQUc7QUFDbkMsV0FBTyxXQUFXLENBQUMsS0FBSyxXQUFXLENBQUMsS0FBSyxRQUFRLEVBQUUsS0FBSyxFQUFFLEdBQUcsS0FBSyxNQUFNLFlBQVksRUFBRSxPQUFPLEVBQUUsS0FBSztBQUFBLEVBQ3JHO0FBRUEsU0FBTyxzQkFBc0IsR0FBRyxDQUFDO0FBQ2xDO0FBRUEsU0FBUyxzQkFBc0IsR0FBbUMsR0FBNEM7QUFDN0csU0FBTyw0QkFBNEIsTUFBTSxTQUFPLHlCQUF5QixHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDcEY7QUFFQSxTQUFTLGlCQUFpQixHQUFxQyxHQUE4QztBQUM1RyxNQUFJLE1BQU0sR0FBRztBQUNaLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsV0FBVyxFQUFFLFFBQVE7QUFDdEMsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLEVBQUUsTUFBTSxDQUFDLEtBQUssVUFBVSxRQUFRLEVBQUUsS0FBSyxDQUFDO0FBQ2hEO0FBRU8sU0FBUyw2QkFBNkIsS0FBc0I7QUFDbEUsUUFBTSxJQUFJLEtBQUs7QUFDZixTQUFPLENBQUMsQ0FBQyxJQUFJLE1BQU0sU0FBUztBQUM3QjtBQUVBLElBQU0sMEJBQU4sY0FBc0MsV0FBVztBQUFBLEVBWWhELFlBQ2tCLFlBQ0EsTUFDakIsZ0JBQ2lCLFNBQ0EsWUFDQSxtQkFDdUIsc0JBQ0ssMkJBQ0QsWUFDM0M7QUFDRCxVQUFNO0FBVlc7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUN1QjtBQUNLO0FBQ0Q7QUFaN0MsU0FBaUIsY0FBYyxLQUFLLFVBQVUsSUFBSSx3QkFBd0IsQ0FBQztBQUMzRSxTQUFpQixzQkFBc0IsS0FBSyxVQUFVLElBQUksa0JBQXNDLENBQUM7QUFjaEcsU0FBSyxXQUFXLHdCQUF3QixTQUFTLFFBQVEsUUFBUSxJQUFJLGdCQUFnQixVQUFVO0FBRS9GLFVBQU0sUUFBUSxTQUFTLCtCQUErQiwyQkFBMkIsaUJBQWlCLENBQUM7QUFDbkcsU0FBSyxVQUFVLEVBQUUsd0VBQXdFO0FBQ3pGLFNBQUssUUFBUSxXQUFXO0FBQ3hCLFNBQUssUUFBUSxZQUFZO0FBRXpCLFVBQU0sU0FBUyxFQUFFLGlCQUFpQjtBQUNsQyxXQUFPLE1BQU0sWUFBWTtBQUN6QixXQUFPLE1BQU0sWUFBWTtBQUN6QixTQUFLLFFBQVEsWUFBWSxNQUFNO0FBRS9CLFVBQU0sZ0JBQWdCLGFBQWEsUUFBUSxRQUFRLGdCQUFnQixTQUFTLENBQUMsSUFBSSxRQUFRLFFBQVEsRUFBRSxJQUFJLGNBQWMsSUFBSSxXQUFXLFlBQVksQ0FBQztBQUNqSixVQUFNLFlBQThCLEtBQUssV0FBVyxJQUFJLGFBQWEsS0FBSyxFQUFFLFFBQVEsRUFBRTtBQUN0RixTQUFLLFdBQVcsSUFBSSxlQUFlLFNBQVM7QUFDNUMsUUFBSSxVQUFVLFFBQVE7QUFDckIsYUFBTyxNQUFNLFNBQVMsR0FBRyxVQUFVLE1BQU07QUFBQSxJQUMxQztBQUVBLFVBQU0sa0JBQWtCLEVBQUUsTUFBTTtBQUNoQyxvQkFBZ0IsY0FBYyxTQUFTLGlDQUFpQyx5QkFBeUI7QUFDakcsVUFBTSxlQUFlLEtBQUssVUFBVSxLQUFLLHFCQUFxQixlQUFlLHFCQUFxQixpQkFBaUIsVUFBVSxPQUFPLFFBQVEsU0FBUyxNQUFNLEdBQUcsTUFBUyxDQUFDO0FBQ3hLLFdBQU8sWUFBWSxhQUFhLE9BQU87QUFDdkMsUUFBSSxDQUFDLFlBQVk7QUFDaEIsV0FBSyxrQkFBa0I7QUFDdkI7QUFBQSxJQUNEO0FBRUEsU0FBSywwQkFBMEIsZ0JBQWdCLFlBQVksSUFBSSxZQUFZLEVBQUUsT0FBTyxJQUFJLEdBQUcsUUFBUTtBQUFBLE1BQ2xHLGNBQWMsVUFBVTtBQUFBLE1BQ3hCO0FBQUEsTUFDQSxxQkFBcUIsS0FBSyxRQUFRLFFBQVE7QUFBQSxJQUMzQyxHQUFHLEtBQUssWUFBWSxLQUFLLEVBQUUsS0FBSyxrQkFBZ0I7QUFDL0MsVUFBSSxLQUFLLFlBQVksTUFBTSx5QkFBeUI7QUFDbkQscUJBQWEsUUFBUTtBQUNyQjtBQUFBLE1BQ0Q7QUFFQSxXQUFLLG9CQUFvQixRQUFRO0FBQ2pDLG1CQUFhLFFBQVEsT0FBTztBQUM1QixhQUFPLE1BQU0sWUFBWTtBQUN6QixXQUFLLGtCQUFrQjtBQUV2QixXQUFLLFVBQVUsYUFBYSxRQUFRLGlCQUFpQixPQUFLO0FBQ3pELGtCQUFVLGVBQWU7QUFBQSxNQUMxQixDQUFDLENBQUM7QUFFRixXQUFLLFVBQVUsYUFBYSxrQkFBa0IsZUFBYTtBQUMxRCxrQkFBVSxTQUFTO0FBQ25CLGFBQUssa0JBQWtCO0FBQUEsTUFDeEIsQ0FBQyxDQUFDO0FBQ0YsV0FBSyxVQUFVLEtBQUssUUFBUSxzQkFBc0IsYUFBVztBQUM1RCxZQUFJLFNBQVM7QUFDWix1QkFBYSxhQUFhO0FBQUEsUUFDM0I7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0gsR0FBRyxXQUFTO0FBQ1gsVUFBSSxvQkFBb0IsS0FBSyxHQUFHO0FBQy9CO0FBQUEsTUFDRDtBQUVBLGNBQVEsTUFBTSxvQ0FBb0MsS0FBSztBQUN2RCxtQkFBYSxRQUFRLFlBQVksS0FBSyxZQUFZLEtBQUssQ0FBQztBQUN4RCxhQUFPLE1BQU0sWUFBWTtBQUN6QixXQUFLLGtCQUFrQjtBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNGO0FBQUEsRUF4RkEsT0FBTyxTQUFTLFdBQW1CLGdCQUF3QixZQUE0QjtBQUN0RixXQUFPLEdBQUcsU0FBUyxJQUFJLGNBQWMsSUFBSSxXQUFXLFlBQVksQ0FBQztBQUFBLEVBQ2xFO0FBQUEsRUF3RkEsZUFBZSxZQUFvQixNQUFjLFlBQThCO0FBQzlFLFdBQU8sV0FBVyxZQUFZLE1BQU0sS0FBSyxXQUFXLFlBQVksS0FDNUQsU0FBUyxLQUFLLFFBQ2QsZUFBZSxLQUFLO0FBQUEsRUFDekI7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFNBQUssWUFBWSxRQUFRLElBQUk7QUFDN0IsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUFBLEVBRUEsT0FBTyxPQUFxQjtBQUMzQixTQUFLLFFBQVEsTUFBTSxXQUFXLEdBQUcsS0FBSztBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxlQUFxQjtBQUNwQixTQUFLLG9CQUFvQixPQUFPLGFBQWE7QUFBQSxFQUM5QztBQUFBLEVBRUEsUUFBYztBQUNiLFVBQU0sVUFBVSxLQUFLLG9CQUFvQixPQUFPO0FBQ2hELFFBQUksU0FBUztBQUNaLGNBQVEsTUFBTTtBQUFBLElBQ2YsT0FBTztBQUNOLFdBQUssUUFBUSxNQUFNO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxZQUFZLE9BQTJCO0FBQzlDLFVBQU0sWUFBWSxFQUFFLGVBQWU7QUFFbkMsVUFBTSxrQkFBa0IsRUFBRSxzQkFBc0I7QUFDaEQsUUFBSSxPQUFPLFdBQVcsZUFBZTtBQUVyQyxVQUFNLGNBQWMsRUFBRSxLQUFLO0FBQzNCLGdCQUFZLFVBQVUsSUFBSSxHQUFHLFVBQVUsaUJBQWlCLFFBQVEsS0FBSyxDQUFDO0FBQ3RFLG9CQUFnQixPQUFPLFdBQVc7QUFFbEMsVUFBTSxpQkFBaUIsRUFBRSxxQkFBcUI7QUFDOUMsbUJBQWUsY0FBYyxTQUFTLDZCQUE2QixnQ0FBZ0M7QUFDbkcsb0JBQWdCLE9BQU8sY0FBYztBQUVyQyxVQUFNLG1CQUFtQixFQUFFLHVCQUF1QjtBQUNsRCxxQkFBaUIsY0FBYyxPQUFPLFdBQVcsT0FBTyxLQUFLO0FBQzdELGNBQVUsT0FBTyxnQkFBZ0I7QUFFakMsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQTVJTSwwQkFBTjtBQUFBLEVBbUJHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXJCRztBQThJQyxJQUFNLHFCQUFOLGNBQWlDLG9CQUFvQjtBQUFBLEVBWTNELFlBQ2tCLGlCQUNBLFdBQ0EsWUFDRixjQUNrQixlQUNsQixjQUNHLGlCQUNvQixvQkFDRCxtQkFDTixhQUNoQixjQUNnQixhQUNTLHNCQUNKLGtCQUNuQztBQUNELFVBQU0sY0FBYyxjQUFjLGlCQUFpQixZQUFZO0FBZjlDO0FBQ0E7QUFDQTtBQUVnQjtBQUdLO0FBQ0Q7QUFDTjtBQUVBO0FBQ1M7QUFDSjtBQW5CckMsU0FBaUIsbUJBQW1CLEtBQUssVUFBVSxJQUFJLFFBQStCLENBQUM7QUFDdkYsU0FBUyxrQkFBZ0QsS0FBSyxpQkFBaUI7QUFFL0UsU0FBaUIsZ0JBQWdCLEtBQUssT0FBTyxJQUFJLElBQUksZ0JBQWdCLENBQUM7QUFvQnJFLFNBQUssVUFBVSxLQUFLLFdBQVcsT0FBSyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDckQsU0FBSyxVQUFVLEtBQUssaUJBQWlCLFdBQVM7QUFDN0MsV0FBSyxtQkFBbUIsZ0JBQWdCO0FBQUEsUUFDdkMsbUJBQW1CLEtBQUs7QUFBQSxRQUN4QixXQUFXLE1BQU07QUFBQSxRQUNqQixZQUFZLE1BQU07QUFDakIsY0FBSSxDQUFDLEtBQUssS0FBSztBQUNkLG1CQUFPLENBQUM7QUFBQSxVQUNUO0FBQ0EsZ0JBQU0sT0FBTyxLQUFLLFlBQVksZUFBZSxPQUFPLDZCQUE2QixLQUFLLG1CQUFtQjtBQUFBLFlBQ3hHLEtBQUs7QUFBQSxjQUNKLGlCQUFpQixLQUFLO0FBQUEsY0FDdEIsV0FBVyxLQUFLO0FBQUEsY0FDaEIsS0FBSyxLQUFLO0FBQUEsY0FDVixRQUFRLEtBQUs7QUFBQSxZQUNkO0FBQUEsVUFDRCxDQUFDO0FBQ0QsaUJBQU8sMEJBQTBCLElBQUk7QUFBQSxRQUN0QztBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBaERBLElBQUksT0FBMEM7QUFDN0MsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBZ0RBLE1BQWMsU0FBUyxFQUFFLGVBQWUsU0FBUyxXQUFXLEdBQXNDO0FBQ2pHLFVBQU0sUUFBUSxhQUFhLGFBQWE7QUFDeEMsUUFBSSxLQUFLLGFBQWE7QUFJckIsVUFBSSxLQUFLLFlBQVksWUFBWSxLQUFLLE1BQU0sdUJBQXVCLEtBQUssa0JBQWtCLEtBQUssWUFBWSxXQUFXLEtBQUssS0FBSyxLQUFLO0FBQ3BJLGFBQUssY0FBYyxXQUFXLEVBQUUsVUFBVSxLQUFLLEtBQUssUUFBUSxHQUFHLEtBQUs7QUFDcEU7QUFBQSxNQUNEO0FBQ0EsV0FBSyxjQUFjLFdBQVc7QUFBQSxRQUM3QixVQUFVLEVBQUUsVUFBVSxLQUFLLFlBQVksWUFBWTtBQUFBLFFBQ25ELFVBQVUsRUFBRSxVQUFVLEtBQUssWUFBWSxZQUFZO0FBQUEsUUFDbkQ7QUFBQSxNQUNELEdBQUcsS0FBSztBQUFBLElBQ1QsV0FBVyxLQUFLLEtBQUs7QUFDcEIsV0FBSyxjQUFjLFdBQVcsRUFBRSxVQUFVLEtBQUssS0FBSyxRQUFRLEdBQUcsS0FBSztBQUFBLElBQ3JFO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsT0FBTyxLQUFnQjtBQUN0QixTQUFLLGNBQWMsTUFBTTtBQUV6QixTQUFLLE9BQU8sR0FBRztBQUNmLFNBQUssVUFBVSxRQUFXLEVBQUU7QUFDNUIsU0FBSyxlQUFlLEVBQUU7QUFDdEIsU0FBSyxnQkFBZ0IsTUFBUztBQUU5QixVQUFNLFVBQVUsS0FBSyxZQUFZLFdBQVcsS0FBSyxlQUFlO0FBQ2hFLFVBQU0sY0FBYyxTQUFTO0FBQzdCLFFBQUksQ0FBQyxhQUFhO0FBQ2pCO0FBQUEsSUFDRDtBQUVBLFVBQU0saUJBQWlCLFFBQVEsWUFBVTtBQUN4QyxZQUFNLFFBQVEsWUFBWSxVQUFVLEtBQUssTUFBTTtBQUMvQyxhQUFPLFNBQVMsWUFBWSx5QkFBeUIsTUFBTSxhQUFhLEtBQUssV0FBVyxLQUFLLFVBQVU7QUFBQSxJQUN4RyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsTUFBTSxHQUFHLEtBQUssQ0FBQyxDQUFDO0FBRTNCLFVBQU0sY0FBYyxRQUFRLE9BQUs7QUFDaEMsWUFBTSxRQUFRLFlBQVksVUFBVSxLQUFLLENBQUM7QUFDMUMsWUFBTSxvQkFBb0IsT0FBTywyQkFBMkIsS0FBSyxDQUFDO0FBQ2xFLGFBQU8sQ0FBQyxDQUFDLHFCQUFxQixrQkFBa0IsY0FBYyxjQUFjLEtBQUssYUFBYSxrQkFBa0IsZUFBZSxLQUFLO0FBQUEsSUFDckksQ0FBQztBQUdELFVBQU0sV0FBVyxLQUFLLGFBQWEsb0JBQW9CLEdBQUc7QUFDMUQsU0FBSyxjQUFjLElBQUksUUFBUSxPQUFLO0FBQ25DLFVBQUksWUFBWSxLQUFLLENBQUMsR0FBRztBQUN4QixjQUFNLFVBQVUsVUFBVSxPQUFPLFFBQVEsU0FBUyxNQUFNO0FBQ3hELGFBQUssVUFBVSxTQUFTLFNBQVMsZ0NBQWdDLGdCQUFnQixDQUFDO0FBQ2xGLGNBQU0sUUFBUSxZQUFZLFVBQVUsS0FBSyxDQUFDO0FBQzFDLGNBQU0sVUFBVSxLQUFLLE9BQU8sT0FBTyxhQUFhLEtBQUssQ0FBQyxLQUFLLEtBQUssR0FBRztBQUVuRSxjQUFNLGdCQUFnQixLQUFLLHFCQUFxQixTQUFrQixrQkFBa0IsOEJBQThCO0FBQ2xILFlBQUksZUFBZTtBQUNsQixlQUFLLGdCQUFnQixPQUFPO0FBQzVCLGVBQUssZUFBZSxFQUFFO0FBQUEsUUFDdkIsT0FBTztBQUNOLGVBQUssZ0JBQWdCLE1BQVM7QUFDOUIsZUFBSyxlQUFlLFlBQVksS0FBSyxDQUFDLFVBQVUsU0FBUyw2QkFBNkIscUJBQXFCLElBQUksU0FBUyxxQ0FBcUMsYUFBYSxPQUFPLENBQUM7QUFBQSxRQUNuTDtBQUFBLE1BQ0QsT0FBTztBQUNOLGFBQUssVUFBVSxRQUFRLE9BQU8sU0FBUyx5QkFBeUIsUUFBUSxDQUFDO0FBQ3pFLGFBQUssZ0JBQWdCLE1BQVM7QUFDOUIsYUFBSyxlQUFlLEVBQUU7QUFBQSxNQUN2QjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsU0FBSyxjQUFjLElBQUksc0JBQXNCLE9BQUs7QUFDakQsWUFBTSxVQUFVLGVBQWUsS0FBSyxDQUFDO0FBQ3JDLFVBQUksWUFBWSxRQUFXO0FBQzFCO0FBQUEsTUFDRDtBQUVBLFVBQUksV0FBVyxDQUFDLFNBQVMsYUFBYSxDQUFDLFNBQVMsV0FBVztBQUMxRCxhQUFLLGNBQWM7QUFDbkIsYUFBSyxpQkFBaUIsS0FBSyxPQUFPO0FBQ2xDLGFBQUssUUFBUSxFQUFFLE9BQU8sUUFBUSxPQUFPLFNBQVMsUUFBUSxRQUFRLENBQUM7QUFDL0QsY0FBTSxxQkFBcUIsUUFBUSxVQUFVLElBQUksU0FBUyxpQ0FBaUMsYUFBYSxJQUFJLFNBQVMsNkJBQTZCLGtCQUFrQixRQUFRLEtBQUs7QUFDakwsY0FBTSxvQkFBb0IsUUFBUSxZQUFZLElBQUksU0FBUyxnQ0FBZ0MsWUFBWSxJQUFJLFNBQVMsNEJBQTRCLGlCQUFpQixRQUFRLE9BQU87QUFDaEwsYUFBSyxhQUFhLFNBQVMsV0FBVyx3QkFBd0IsVUFBVSxvQkFBb0IsaUJBQWlCLENBQUM7QUFHOUcsWUFBSSxRQUFRLFNBQVM7QUFDcEIsWUFBRSxRQUFRO0FBQUEsUUFDWDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDtBQW5KYSxxQkFBTjtBQUFBLEVBZ0JKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBMUJVO0FBcUpiLFNBQVMsWUFBWSxNQUFjLFlBQXdDO0FBQzFFLE1BQUksZUFBZSxPQUFPO0FBRXpCLFFBQUksQ0FBQyxLQUFLLEtBQUssRUFBRSxXQUFXLElBQUksR0FBRztBQUNsQyxhQUFPO0FBQUEsRUFBVSxJQUFJO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBRUEsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogWyJyZWYiXQp9Cg==
