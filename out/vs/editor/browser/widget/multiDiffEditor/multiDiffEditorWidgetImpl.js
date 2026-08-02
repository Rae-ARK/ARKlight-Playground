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
import { getWindow, h, scheduleAtNextAnimationFrame } from "../../../../base/browser/dom.js";
import { SmoothScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { compareBy, numberComparator } from "../../../../base/common/arrays.js";
import { findFirstMax } from "../../../../base/common/arraysFind.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, autorunWithStore, derived, disposableObservableValue, globalTransaction, observableFromEvent, observableValue, transaction } from "../../../../base/common/observable.js";
import { Scrollable, ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { localize } from "../../../../nls.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { OffsetRange } from "../../../common/core/ranges/offsetRange.js";
import { Selection } from "../../../common/core/selection.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { ObservableElementSizeObserver } from "../diffEditor/utils.js";
import { DiffEditorItemTemplate, TemplateData } from "./diffEditorItemTemplate.js";
import { ObjectPool } from "./objectPool.js";
import "./style.css";
let MultiDiffEditorWidgetImpl = class extends Disposable {
  constructor(_element, _dimension, _viewModel, _workbenchUIElementFactory, _renderSideBySide, _diffEditorOptions, _parentContextKeyService, _parentInstantiationService) {
    super();
    this._element = _element;
    this._dimension = _dimension;
    this._viewModel = _viewModel;
    this._workbenchUIElementFactory = _workbenchUIElementFactory;
    this._renderSideBySide = _renderSideBySide;
    this._diffEditorOptions = _diffEditorOptions;
    this._parentContextKeyService = _parentContextKeyService;
    this._parentInstantiationService = _parentInstantiationService;
    /**
     * When `true`, the automatic "select the first change" initialization that
     * runs once the view model finishes loading does not move keyboard focus
     * into the editor. Driven by {@link setPreserveFocusOnLoad} so a
     * `preserveFocus` open (e.g. restored in the background or on a session
     * switch) does not steal focus, while a normal user-initiated open does.
     */
    this._preserveFocusOnLoad = false;
    this._scrollableElements = h("div.scrollContent", [
      h("div@content", {
        style: {
          overflow: "hidden"
        }
      }),
      h("div.monaco-editor@overflowWidgetsDomNode", {})
    ]);
    this._scrollable = this._register(new Scrollable({
      forceIntegerValues: false,
      scheduleAtNextAnimationFrame: (cb) => scheduleAtNextAnimationFrame(getWindow(this._element), cb),
      smoothScrollDuration: 100
    }));
    this._scrollableElement = this._register(new SmoothScrollableElement(this._scrollableElements.root, {
      vertical: ScrollbarVisibility.Auto,
      horizontal: ScrollbarVisibility.Auto,
      useShadows: false
    }, this._scrollable));
    this._elements = h("div.monaco-component.multiDiffEditor", {}, [
      h("div", {}, [this._scrollableElement.getDomNode()]),
      h("div.placeholder@placeholder", {}, [h("div")])
    ]);
    this._sizeObserver = this._register(new ObservableElementSizeObserver(this._element, void 0));
    this._optionsOverride = derived(this, (reader) => {
      const renderSideBySide = this._renderSideBySide.read(reader);
      const options = renderSideBySide === void 0 ? {} : { renderSideBySide, useInlineViewWhenSpaceIsLimited: false };
      return { ...this._diffEditorOptions, ...options };
    });
    this._objectPool = this._register(new ObjectPool((data) => {
      const template = this._instantiationService.createInstance(
        DiffEditorItemTemplate,
        this._scrollableElements.content,
        this._scrollableElements.overflowWidgetsDomNode,
        this._workbenchUIElementFactory,
        this._optionsOverride
      );
      template.setData(data);
      return template;
    }));
    this.scrollTop = observableFromEvent(this, this._scrollableElement.onScroll, () => (
      /** @description scrollTop */
      this._scrollableElement.getScrollPosition().scrollTop
    ));
    this.scrollLeft = observableFromEvent(this, this._scrollableElement.onScroll, () => (
      /** @description scrollLeft */
      this._scrollableElement.getScrollPosition().scrollLeft
    ));
    this._viewItemsInfo = derived(
      this,
      (reader) => {
        const vm = this._viewModel.read(reader);
        if (!vm) {
          return { items: [], getItem: (_d) => {
            throw new BugIndicatingError();
          } };
        }
        const viewModels = vm.items.read(reader);
        const map = /* @__PURE__ */ new Map();
        const items = viewModels.map((d) => {
          const item = reader.store.add(new VirtualizedViewItem(d, this._objectPool, this.scrollLeft, (delta) => {
            this._scrollableElement.setScrollPosition({ scrollTop: this._scrollableElement.getScrollPosition().scrollTop + delta });
          }));
          const data = this._lastDocStates?.[item.getKey()];
          if (data) {
            transaction((tx) => {
              item.setViewState(data, tx);
            });
          }
          map.set(d, item);
          return item;
        });
        return { items, getItem: (d) => map.get(d) };
      }
    );
    this._viewItems = this._viewItemsInfo.map(this, (items) => items.items);
    this._spaceBetweenPx = 0;
    this._totalHeight = this._viewItems.map(this, (items, reader) => items.reduce((r, i) => r + i.contentHeight.read(reader) + this._spaceBetweenPx, 0));
    this.activeControl = derived(this, (reader) => {
      const activeDiffItem = this._viewModel.read(reader)?.activeDiffItem.read(reader);
      if (!activeDiffItem) {
        return void 0;
      }
      const viewItem = this._viewItemsInfo.read(reader).getItem(activeDiffItem);
      return viewItem.template.read(reader)?.editor;
    });
    this._contextKeyService = this._register(this._parentContextKeyService.createScoped(this._element));
    this._instantiationService = this._register(this._parentInstantiationService.createChild(
      new ServiceCollection([IContextKeyService, this._contextKeyService])
    ));
    this._contextKeyService.createKey(EditorContextKeys.inMultiDiffEditor.key, true);
    this._lastDocStates = {};
    this._register(autorunWithStore((reader, store) => {
      const viewModel = this._viewModel.read(reader);
      if (viewModel && viewModel.contextKeys) {
        for (const [key, value] of Object.entries(viewModel.contextKeys)) {
          const contextKey = this._contextKeyService.createKey(key, void 0);
          contextKey.set(value);
          store.add(toDisposable(() => contextKey.reset()));
        }
      }
    }));
    const ctxAllCollapsed = this._parentContextKeyService.createKey(EditorContextKeys.multiDiffEditorAllCollapsed.key, false);
    this._register(autorun((reader) => {
      const viewModel = this._viewModel.read(reader);
      if (viewModel) {
        const allCollapsed = viewModel.items.read(reader).every((item) => item.collapsed.read(reader));
        ctxAllCollapsed.set(allCollapsed);
      }
    }));
    const ctxRenderSideBySide = this._parentContextKeyService.createKey(EditorContextKeys.multiDiffEditorRenderSideBySide.key, true);
    this._register(autorun((reader) => {
      const renderSideBySide = this._renderSideBySide.read(reader);
      if (renderSideBySide !== void 0) {
        ctxRenderSideBySide.set(renderSideBySide);
      }
    }));
    this._register(autorun((reader) => {
      const dimension = this._dimension.read(reader);
      this._sizeObserver.observe(dimension);
    }));
    const placeholderMessage = derived((reader) => {
      const items = this._viewItems.read(reader);
      if (items.length > 0) {
        return void 0;
      }
      const vm = this._viewModel.read(reader);
      return !vm || vm.isLoading.read(reader) ? localize("loading", "Loading...") : localize("noChangedFiles", "No Changed Files");
    });
    this._register(autorun((reader) => {
      const message = placeholderMessage.read(reader);
      this._elements.placeholder.innerText = message ?? "";
      this._elements.placeholder.classList.toggle("visible", !!message);
    }));
    this._scrollableElements.content.style.position = "relative";
    this._register(autorun((reader) => {
      const height = this._sizeObserver.height.read(reader);
      this._scrollableElements.root.style.height = `${height}px`;
      const totalHeight = this._totalHeight.read(reader);
      this._scrollableElements.content.style.height = `${totalHeight}px`;
      const width = this._sizeObserver.width.read(reader);
      let scrollWidth = width;
      const viewItems = this._viewItems.read(reader);
      const max = findFirstMax(viewItems, compareBy((i) => i.maxScroll.read(reader).maxScroll, numberComparator));
      if (max) {
        const maxScroll = max.maxScroll.read(reader);
        scrollWidth = width + maxScroll.maxScroll;
      }
      this._scrollableElement.setScrollDimensions({
        width,
        height,
        scrollHeight: totalHeight,
        scrollWidth
      });
      this._applyPendingScrollState();
    }));
    _element.replaceChildren(this._elements.root);
    this._register(toDisposable(() => {
      _element.replaceChildren();
    }));
    this._register(autorun((reader) => {
      const viewModel = this._viewModel.read(reader);
      if (!viewModel) {
        return;
      }
      if (!viewModel.isLoading.read(reader)) {
        const items = viewModel.items.read(reader);
        if (items.length === 0) {
          return;
        }
        const activeDiffItem = viewModel.activeDiffItem.read(reader);
        if (activeDiffItem) {
          return;
        }
        if (this._restorePendingActiveDiffItem(viewModel, items)) {
          return;
        }
        this._navigateToChange("next", !this._preserveFocusOnLoad);
      }
    }));
    this._register(this._register(autorun((reader) => {
      globalTransaction((tx) => {
        this.render(reader);
      });
    })));
  }
  setScrollState(scrollState) {
    this._pendingScrollState = scrollState;
    this._applyPendingScrollState();
  }
  /**
   * Applies a restored scroll offset once the scrollable dimensions can
   * accommodate it; retries on subsequent dimension updates until it sticks (so
   * a fresh/reloaded widget whose content height is not yet known does not clamp
   * the offset to 0). Consumed once it lands.
   */
  _applyPendingScrollState() {
    const pending = this._pendingScrollState;
    if (!pending) {
      return;
    }
    this._scrollableElement.setScrollPosition({ scrollLeft: pending.left, scrollTop: pending.top });
    const applied = this._scrollableElement.getScrollPosition();
    const topLanded = pending.top === void 0 || applied.scrollTop >= pending.top;
    const leftLanded = pending.left === void 0 || applied.scrollLeft >= pending.left;
    if (topLanded && leftLanded) {
      this._pendingScrollState = void 0;
    }
  }
  /**
   * Clears any pending restoration state (documents, active item, scroll). Called
   * when a new model is installed without a view state, so it cannot inherit the
   * previous model's state for overlapping diff keys.
   */
  clearPendingRestorationState() {
    this._lastDocStates = void 0;
    this._lastActiveDiffItemKey = void 0;
    this._pendingScrollState = void 0;
  }
  /**
   * Controls whether the automatic first-change selection that runs once the
   * view model finishes loading preserves focus instead of moving it into the
   * editor. Set to `true` for `preserveFocus` opens so focus is not stolen
   * from elsewhere.
   */
  setPreserveFocusOnLoad(preserveFocus) {
    this._preserveFocusOnLoad = preserveFocus;
  }
  getRootElement() {
    return this._elements.root;
  }
  getContextKeyService() {
    return this._contextKeyService;
  }
  getScopedInstantiationService() {
    return this._instantiationService;
  }
  reveal(resource, options) {
    const viewItems = this._viewItems.get();
    const index = viewItems.findIndex(
      (item) => item.viewModel.originalUri?.toString() === resource.original?.toString() && item.viewModel.modifiedUri?.toString() === resource.modified?.toString()
    );
    if (index === -1) {
      throw new BugIndicatingError("Resource not found in diff editor");
    }
    const viewItem = viewItems[index];
    this._viewModel.get().activeDiffItem.setCache(viewItem.viewModel, void 0);
    let scrollTop = 0;
    for (let i = 0; i < index; i++) {
      scrollTop += viewItems[i].contentHeight.get() + this._spaceBetweenPx;
    }
    this._scrollableElement.setScrollPosition({ scrollTop });
    const diffEditor = viewItem.template.get()?.editor;
    const editor = "original" in resource ? diffEditor?.getOriginalEditor() : diffEditor?.getModifiedEditor();
    if (editor && options?.range) {
      editor.revealRangeInCenter(options.range);
      highlightRange(editor, options.range);
    }
  }
  getViewState() {
    return {
      scrollState: {
        top: this.scrollTop.get(),
        left: this.scrollLeft.get()
      },
      docStates: Object.fromEntries(this._viewItems.get().map((i) => [i.getKey(), i.getViewState()])),
      activeDiffItemKey: this._viewModel.get()?.activeDiffItem.get()?.getKey()
    };
  }
  setViewState(viewState, tx) {
    this.setScrollState(viewState.scrollState);
    this._lastDocStates = viewState.docStates;
    this._lastActiveDiffItemKey = viewState.activeDiffItemKey;
    const applyDocStates = (tx2) => {
      if (viewState.docStates) {
        for (const i of this._viewItems.get()) {
          const state = viewState.docStates[i.getKey()];
          if (state) {
            i.setViewState(state, tx2);
          }
        }
      }
    };
    if (tx) {
      applyDocStates(tx);
    } else {
      transaction(applyDocStates);
    }
    const viewModel = this._viewModel.get();
    if (viewModel) {
      this._restorePendingActiveDiffItem(viewModel, viewModel.items.get());
    }
  }
  /**
   * Restores the persisted active diff item (if any) onto the view model, so the
   * automatic first-change navigation is skipped. On an explicit (non-preserve-focus)
   * open it also moves focus into the restored item's editor, mirroring the
   * first-change navigation it replaces. Returns whether it was applied.
   */
  _restorePendingActiveDiffItem(viewModel, items) {
    const key = this._lastActiveDiffItemKey;
    if (key === void 0 || items.length === 0) {
      return false;
    }
    this._lastActiveDiffItemKey = void 0;
    const target = items.find((i) => i.getKey() === key);
    if (!target) {
      return false;
    }
    viewModel.activeDiffItem.setCache(target, void 0);
    if (!this._preserveFocusOnLoad) {
      this._viewItemsInfo.get().getItem(target).template.get()?.editor.focus();
    }
    return true;
  }
  findDocumentDiffItem(resource) {
    const item = this._viewItems.get().find(
      (v) => v.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString() || v.viewModel.diffEditorViewModel.model.original.uri.toString() === resource.toString()
    );
    return item?.viewModel.documentDiffItem;
  }
  tryGetCodeEditor(resource) {
    const item = this._viewItems.get().find(
      (v) => v.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString() || v.viewModel.diffEditorViewModel.model.original.uri.toString() === resource.toString()
    );
    const editor = item?.template.get()?.editor;
    if (!editor) {
      return void 0;
    }
    if (item.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString()) {
      return { diffEditor: editor, editor: editor.getModifiedEditor() };
    } else {
      return { diffEditor: editor, editor: editor.getOriginalEditor() };
    }
  }
  goToNextChange() {
    this._navigateToChange("next");
  }
  goToPreviousChange() {
    this._navigateToChange("previous");
  }
  _navigateToChange(direction, focusEditor = true) {
    const viewItems = this._viewItems.get();
    if (viewItems.length === 0) {
      return;
    }
    const activeViewModel = this._viewModel.get()?.activeDiffItem.get();
    const currentIndex = activeViewModel ? viewItems.findIndex((v) => v.viewModel === activeViewModel) : -1;
    if (currentIndex === -1) {
      this._goToFile(0, "first", focusEditor);
      return;
    }
    const currentItem = viewItems[currentIndex];
    if (currentItem.viewModel.collapsed.get()) {
      currentItem.viewModel.collapsed.set(false, void 0);
    }
    const editor = currentItem.template.get()?.editor;
    if (editor?.getDiffComputationResult()?.changes2?.length) {
      const pos = editor.getModifiedEditor().getPosition()?.lineNumber || 1;
      const changes = editor.getDiffComputationResult().changes2;
      const hasNext = direction === "next" ? changes.some((c) => c.modified.startLineNumber > pos) : changes.some((c) => c.modified.endLineNumberExclusive <= pos);
      if (hasNext) {
        editor.goToDiff(direction);
        return;
      }
    }
    const nextIndex = (currentIndex + (direction === "next" ? 1 : -1) + viewItems.length) % viewItems.length;
    this._goToFile(nextIndex, direction === "next" ? "first" : "last", focusEditor);
  }
  _goToFile(index, position, focusEditor = true) {
    const item = this._viewItems.get()[index];
    if (item.viewModel.collapsed.get()) {
      item.viewModel.collapsed.set(false, void 0);
    }
    this.reveal({ original: item.viewModel.originalUri, modified: item.viewModel.modifiedUri });
    const editor = item.template.get()?.editor;
    if (editor?.getDiffComputationResult()?.changes2?.length) {
      if (position === "first") {
        editor.revealFirstDiff();
      } else {
        const lastChange = editor.getDiffComputationResult().changes2.at(-1);
        const modifiedEditor = editor.getModifiedEditor();
        modifiedEditor.setPosition({ lineNumber: lastChange.modified.startLineNumber, column: 1 });
        modifiedEditor.revealLineInCenter(lastChange.modified.startLineNumber);
      }
    }
    if (focusEditor) {
      editor?.focus();
    }
  }
  render(reader) {
    const scrollTop = this.scrollTop.read(reader);
    let contentScrollOffsetToScrollOffset = 0;
    let itemHeightSumBefore = 0;
    let itemContentHeightSumBefore = 0;
    const viewPortHeight = this._sizeObserver.height.read(reader);
    const contentViewPort = OffsetRange.ofStartAndLength(scrollTop, viewPortHeight);
    const width = this._sizeObserver.width.read(reader);
    for (const v of this._viewItems.read(reader)) {
      const itemContentHeight = v.contentHeight.read(reader);
      const itemHeight = Math.min(itemContentHeight, viewPortHeight);
      const itemRange = OffsetRange.ofStartAndLength(itemHeightSumBefore, itemHeight);
      const itemContentRange = OffsetRange.ofStartAndLength(itemContentHeightSumBefore, itemContentHeight);
      if (itemContentRange.isBefore(contentViewPort)) {
        contentScrollOffsetToScrollOffset -= itemContentHeight - itemHeight;
        v.hide();
      } else if (itemContentRange.isAfter(contentViewPort)) {
        v.hide();
      } else {
        const scroll = Math.max(0, Math.min(contentViewPort.start - itemContentRange.start, itemContentHeight - itemHeight));
        contentScrollOffsetToScrollOffset -= scroll;
        const viewPort = OffsetRange.ofStartAndLength(scrollTop + contentScrollOffsetToScrollOffset, viewPortHeight);
        v.render(itemRange, scroll, width, viewPort);
      }
      itemHeightSumBefore += itemHeight + this._spaceBetweenPx;
      itemContentHeightSumBefore += itemContentHeight + this._spaceBetweenPx;
    }
    this._scrollableElements.content.style.transform = `translateY(${-(scrollTop + contentScrollOffsetToScrollOffset)}px)`;
  }
};
MultiDiffEditorWidgetImpl = __decorateClass([
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IInstantiationService)
], MultiDiffEditorWidgetImpl);
function highlightRange(targetEditor, range) {
  const modelNow = targetEditor.getModel();
  const decorations = targetEditor.createDecorationsCollection([{ range, options: { description: "symbol-navigate-action-highlight", className: "symbolHighlight" } }]);
  setTimeout(() => {
    if (targetEditor.getModel() === modelNow) {
      decorations.clear();
    }
  }, 350);
}
class VirtualizedViewItem extends Disposable {
  constructor(viewModel, _objectPool, _scrollLeft, _deltaScrollVertical) {
    super();
    this.viewModel = viewModel;
    this._objectPool = _objectPool;
    this._scrollLeft = _scrollLeft;
    this._deltaScrollVertical = _deltaScrollVertical;
    this._templateRef = this._register(disposableObservableValue(this, void 0));
    this.contentHeight = derived(
      this,
      (reader) => this._templateRef.read(reader)?.object.contentHeight?.read(reader) ?? this.viewModel.lastTemplateData.read(reader).contentHeight
    );
    this.maxScroll = derived(this, (reader) => this._templateRef.read(reader)?.object.maxScroll.read(reader) ?? { maxScroll: 0, scrollWidth: 0 });
    this.template = derived(this, (reader) => this._templateRef.read(reader)?.object);
    this._isHidden = observableValue(this, false);
    this._isFocused = derived(this, (reader) => this.template.read(reader)?.isFocused.read(reader) ?? false);
    this.viewModel.setIsFocused(this._isFocused, void 0);
    this._register(autorun((reader) => {
      const scrollLeft = this._scrollLeft.read(reader);
      this._templateRef.read(reader)?.object.setScrollLeft(scrollLeft);
    }));
    this._register(autorun((reader) => {
      const ref = this._templateRef.read(reader);
      if (!ref) {
        return;
      }
      const isHidden = this._isHidden.read(reader);
      if (!isHidden) {
        return;
      }
      const isFocused = ref.object.isFocused.read(reader);
      if (isFocused) {
        return;
      }
      this._clear();
    }));
  }
  dispose() {
    this._clear();
    super.dispose();
  }
  toString() {
    return `VirtualViewItem(${this.viewModel.documentDiffItem.modified?.uri.toString()})`;
  }
  getKey() {
    return this.viewModel.getKey();
  }
  getViewState() {
    transaction((tx) => {
      this._updateTemplateData(tx);
    });
    return {
      collapsed: this.viewModel.collapsed.get(),
      selections: this.viewModel.lastTemplateData.get().selections
    };
  }
  setViewState(viewState, tx) {
    this.viewModel.collapsed.set(viewState.collapsed, tx);
    this._updateTemplateData(tx);
    const data = this.viewModel.lastTemplateData.get();
    const selections = viewState.selections?.map(Selection.liftSelection);
    this.viewModel.lastTemplateData.set({
      ...data,
      selections
    }, tx);
    const ref = this._templateRef.get();
    if (ref) {
      if (selections) {
        ref.object.editor.setSelections(selections);
      }
    }
  }
  _updateTemplateData(tx) {
    const ref = this._templateRef.get();
    if (!ref) {
      return;
    }
    this.viewModel.lastTemplateData.set({
      contentHeight: ref.object.contentHeight.get(),
      selections: ref.object.editor.getSelections() ?? void 0
    }, tx);
  }
  _clear() {
    const ref = this._templateRef.get();
    if (!ref) {
      return;
    }
    transaction((tx) => {
      this._updateTemplateData(tx);
      ref.object.hide();
      this._templateRef.set(void 0, tx);
    });
  }
  hide() {
    this._isHidden.set(true, void 0);
  }
  render(verticalSpace, offset, width, viewPort) {
    this._isHidden.set(false, void 0);
    let ref = this._templateRef.get();
    if (!ref) {
      ref = this._objectPool.getUnusedObj(new TemplateData(this.viewModel, this._deltaScrollVertical));
      this._templateRef.set(ref, void 0);
      const selections = this.viewModel.lastTemplateData.get().selections;
      if (selections) {
        ref.object.editor.setSelections(selections);
      }
    }
    ref.object.render(verticalSpace, width, offset, viewPort);
  }
}
export {
  MultiDiffEditorWidgetImpl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3dpZGdldC9tdWx0aURpZmZFZGl0b3IvbXVsdGlEaWZmRWRpdG9yV2lkZ2V0SW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpbWVuc2lvbiwgZ2V0V2luZG93LCBoLCBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTbW9vdGhTY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgY29tcGFyZUJ5LCBudW1iZXJDb21wYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGZpbmRGaXJzdE1heCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElSZWZlcmVuY2UsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgSVJlYWRlciwgSVRyYW5zYWN0aW9uLCBhdXRvcnVuLCBhdXRvcnVuV2l0aFN0b3JlLCBkZXJpdmVkLCBkaXNwb3NhYmxlT2JzZXJ2YWJsZVZhbHVlLCBnbG9iYWxUcmFuc2FjdGlvbiwgb2JzZXJ2YWJsZUZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYWJsZSwgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlWYWx1ZSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgSURpZmZFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElTZWxlY3Rpb24sIFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlmZkVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IE9ic2VydmFibGVFbGVtZW50U2l6ZU9ic2VydmVyIH0gZnJvbSAnLi4vZGlmZkVkaXRvci91dGlscy5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9ySXRlbVRlbXBsYXRlLCBUZW1wbGF0ZURhdGEgfSBmcm9tICcuL2RpZmZFZGl0b3JJdGVtVGVtcGxhdGUuanMnO1xuaW1wb3J0IHsgSURvY3VtZW50RGlmZkl0ZW0gfSBmcm9tICcuL21vZGVsLmpzJztcbmltcG9ydCB7IERvY3VtZW50RGlmZkl0ZW1WaWV3TW9kZWwsIE11bHRpRGlmZkVkaXRvclZpZXdNb2RlbCB9IGZyb20gJy4vbXVsdGlEaWZmRWRpdG9yVmlld01vZGVsLmpzJztcbmltcG9ydCB7IFJldmVhbE9wdGlvbnMgfSBmcm9tICcuL211bHRpRGlmZkVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBPYmplY3RQb29sIH0gZnJvbSAnLi9vYmplY3RQb29sLmpzJztcbmltcG9ydCAnLi9zdHlsZS5jc3MnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkgfSBmcm9tICcuL3dvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkuanMnO1xuXG5leHBvcnQgY2xhc3MgTXVsdGlEaWZmRWRpdG9yV2lkZ2V0SW1wbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY3JvbGxhYmxlRWxlbWVudHM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Nyb2xsYWJsZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zY3JvbGxhYmxlRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lbGVtZW50cztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zaXplT2JzZXJ2ZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb2JqZWN0UG9vbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zT3ZlcnJpZGU6IElPYnNlcnZhYmxlPElEaWZmRWRpdG9yT3B0aW9ucz47XG5cblx0cHVibGljIHJlYWRvbmx5IHNjcm9sbFRvcDtcblx0cHVibGljIHJlYWRvbmx5IHNjcm9sbExlZnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdmlld0l0ZW1zSW5mbztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3SXRlbXM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3BhY2VCZXR3ZWVuUHg7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdG90YWxIZWlnaHQ7XG5cdHB1YmxpYyByZWFkb25seSBhY3RpdmVDb250cm9sO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHQvKipcblx0ICogV2hlbiBgdHJ1ZWAsIHRoZSBhdXRvbWF0aWMgXCJzZWxlY3QgdGhlIGZpcnN0IGNoYW5nZVwiIGluaXRpYWxpemF0aW9uIHRoYXRcblx0ICogcnVucyBvbmNlIHRoZSB2aWV3IG1vZGVsIGZpbmlzaGVzIGxvYWRpbmcgZG9lcyBub3QgbW92ZSBrZXlib2FyZCBmb2N1c1xuXHQgKiBpbnRvIHRoZSBlZGl0b3IuIERyaXZlbiBieSB7QGxpbmsgc2V0UHJlc2VydmVGb2N1c09uTG9hZH0gc28gYVxuXHQgKiBgcHJlc2VydmVGb2N1c2Agb3BlbiAoZS5nLiByZXN0b3JlZCBpbiB0aGUgYmFja2dyb3VuZCBvciBvbiBhIHNlc3Npb25cblx0ICogc3dpdGNoKSBkb2VzIG5vdCBzdGVhbCBmb2N1cywgd2hpbGUgYSBub3JtYWwgdXNlci1pbml0aWF0ZWQgb3BlbiBkb2VzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcHJlc2VydmVGb2N1c09uTG9hZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RpbWVuc2lvbjogSU9ic2VydmFibGU8RGltZW5zaW9uIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF92aWV3TW9kZWw6IElPYnNlcnZhYmxlPE11bHRpRGlmZkVkaXRvclZpZXdNb2RlbCB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfd29ya2JlbmNoVUlFbGVtZW50RmFjdG9yeTogSVdvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyU2lkZUJ5U2lkZTogSU9ic2VydmFibGU8Ym9vbGVhbiB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGlmZkVkaXRvck9wdGlvbnM6IElEaWZmRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3BhcmVudENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wYXJlbnRJbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3Njcm9sbGFibGVFbGVtZW50cyA9IGgoJ2Rpdi5zY3JvbGxDb250ZW50JywgW1xuXHRcdFx0aCgnZGl2QGNvbnRlbnQnLCB7XG5cdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0b3ZlcmZsb3c6ICdoaWRkZW4nLFxuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHRcdGgoJ2Rpdi5tb25hY28tZWRpdG9yQG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUnLCB7XG5cdFx0XHR9KSxcblx0XHRdKTtcblx0XHR0aGlzLl9zY3JvbGxhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNjcm9sbGFibGUoe1xuXHRcdFx0Zm9yY2VJbnRlZ2VyVmFsdWVzOiBmYWxzZSxcblx0XHRcdHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWU6IChjYikgPT4gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShnZXRXaW5kb3codGhpcy5fZWxlbWVudCksIGNiKSxcblx0XHRcdHNtb290aFNjcm9sbER1cmF0aW9uOiAxMDAsXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3Njcm9sbGFibGVFbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNtb290aFNjcm9sbGFibGVFbGVtZW50KHRoaXMuX3Njcm9sbGFibGVFbGVtZW50cy5yb290LCB7XG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0dXNlU2hhZG93czogZmFsc2UsXG5cdFx0fSwgdGhpcy5fc2Nyb2xsYWJsZSkpO1xuXHRcdHRoaXMuX2VsZW1lbnRzID0gaCgnZGl2Lm1vbmFjby1jb21wb25lbnQubXVsdGlEaWZmRWRpdG9yJywge30sIFtcblx0XHRcdGgoJ2RpdicsIHt9LCBbdGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0RG9tTm9kZSgpXSksXG5cdFx0XHRoKCdkaXYucGxhY2Vob2xkZXJAcGxhY2Vob2xkZXInLCB7fSwgW2goJ2RpdicpXSksXG5cdFx0XSk7XG5cdFx0dGhpcy5fc2l6ZU9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE9ic2VydmFibGVFbGVtZW50U2l6ZU9ic2VydmVyKHRoaXMuX2VsZW1lbnQsIHVuZGVmaW5lZCkpO1xuXHRcdHRoaXMuX29wdGlvbnNPdmVycmlkZSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHJlbmRlclNpZGVCeVNpZGUgPSB0aGlzLl9yZW5kZXJTaWRlQnlTaWRlLnJlYWQocmVhZGVyKTtcblx0XHRcdC8vIEFsc28gcGluIGB1c2VJbmxpbmVWaWV3V2hlblNwYWNlSXNMaW1pdGVkYCBvZmYgc28gdGhlIHRvZ2dsZSBkZXRlcm1pbmlzdGljYWxseVxuXHRcdFx0Ly8gY29udHJvbHMgaW5saW5lIHZzLiBzaWRlLWJ5LXNpZGUgcmVnYXJkbGVzcyBvZiB0aGUgYXZhaWxhYmxlIHdpZHRoLlxuXHRcdFx0Y29uc3Qgb3B0aW9uczogSURpZmZFZGl0b3JPcHRpb25zID0gcmVuZGVyU2lkZUJ5U2lkZSA9PT0gdW5kZWZpbmVkID8ge30gOiB7IHJlbmRlclNpZGVCeVNpZGUsIHVzZUlubGluZVZpZXdXaGVuU3BhY2VJc0xpbWl0ZWQ6IGZhbHNlIH07XG5cdFx0XHRyZXR1cm4geyAuLi50aGlzLl9kaWZmRWRpdG9yT3B0aW9ucywgLi4ub3B0aW9ucyB9O1xuXHRcdH0pO1xuXHRcdHRoaXMuX29iamVjdFBvb2wgPSB0aGlzLl9yZWdpc3RlcihuZXcgT2JqZWN0UG9vbDxUZW1wbGF0ZURhdGEsIERpZmZFZGl0b3JJdGVtVGVtcGxhdGU+KChkYXRhKSA9PiB7XG5cdFx0XHRjb25zdCB0ZW1wbGF0ZSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHREaWZmRWRpdG9ySXRlbVRlbXBsYXRlLFxuXHRcdFx0XHR0aGlzLl9zY3JvbGxhYmxlRWxlbWVudHMuY29udGVudCxcblx0XHRcdFx0dGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnRzLm92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsXG5cdFx0XHRcdHRoaXMuX3dvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnksXG5cdFx0XHRcdHRoaXMuX29wdGlvbnNPdmVycmlkZSxcblx0XHRcdCk7XG5cdFx0XHR0ZW1wbGF0ZS5zZXREYXRhKGRhdGEpO1xuXHRcdFx0cmV0dXJuIHRlbXBsYXRlO1xuXHRcdH0pKTtcblx0XHR0aGlzLnNjcm9sbFRvcCA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgdGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnQub25TY3JvbGwsICgpID0+IC8qKiBAZGVzY3JpcHRpb24gc2Nyb2xsVG9wICovIHRoaXMuX3Njcm9sbGFibGVFbGVtZW50LmdldFNjcm9sbFBvc2l0aW9uKCkuc2Nyb2xsVG9wKTtcblx0XHR0aGlzLnNjcm9sbExlZnQgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHRoaXMuX3Njcm9sbGFibGVFbGVtZW50Lm9uU2Nyb2xsLCAoKSA9PiAvKiogQGRlc2NyaXB0aW9uIHNjcm9sbExlZnQgKi8gdGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0U2Nyb2xsUG9zaXRpb24oKS5zY3JvbGxMZWZ0KTtcblx0XHR0aGlzLl92aWV3SXRlbXNJbmZvID0gZGVyaXZlZDx7IGl0ZW1zOiByZWFkb25seSBWaXJ0dWFsaXplZFZpZXdJdGVtW107IGdldEl0ZW06ICh2aWV3TW9kZWw6IERvY3VtZW50RGlmZkl0ZW1WaWV3TW9kZWwpID0+IFZpcnR1YWxpemVkVmlld0l0ZW0gfT4odGhpcyxcblx0XHRcdChyZWFkZXIpID0+IHtcblx0XHRcdFx0Y29uc3Qgdm0gPSB0aGlzLl92aWV3TW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIXZtKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgaXRlbXM6IFtdLCBnZXRJdGVtOiBfZCA9PiB7IHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoKTsgfSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHZpZXdNb2RlbHMgPSB2bS5pdGVtcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IG1hcCA9IG5ldyBNYXA8RG9jdW1lbnREaWZmSXRlbVZpZXdNb2RlbCwgVmlydHVhbGl6ZWRWaWV3SXRlbT4oKTtcblx0XHRcdFx0Y29uc3QgaXRlbXMgPSB2aWV3TW9kZWxzLm1hcChkID0+IHtcblx0XHRcdFx0XHRjb25zdCBpdGVtID0gcmVhZGVyLnN0b3JlLmFkZChuZXcgVmlydHVhbGl6ZWRWaWV3SXRlbShkLCB0aGlzLl9vYmplY3RQb29sLCB0aGlzLnNjcm9sbExlZnQsIGRlbHRhID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX3Njcm9sbGFibGVFbGVtZW50LnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsVG9wOiB0aGlzLl9zY3JvbGxhYmxlRWxlbWVudC5nZXRTY3JvbGxQb3NpdGlvbigpLnNjcm9sbFRvcCArIGRlbHRhIH0pO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRjb25zdCBkYXRhID0gdGhpcy5fbGFzdERvY1N0YXRlcz8uW2l0ZW0uZ2V0S2V5KCldO1xuXHRcdFx0XHRcdGlmIChkYXRhKSB7XG5cdFx0XHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0XHRcdGl0ZW0uc2V0Vmlld1N0YXRlKGRhdGEsIHR4KTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRtYXAuc2V0KGQsIGl0ZW0pO1xuXHRcdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIHsgaXRlbXMsIGdldEl0ZW06IGQgPT4gbWFwLmdldChkKSEgfTtcblx0XHRcdH1cblx0XHQpO1xuXHRcdHRoaXMuX3ZpZXdJdGVtcyA9IHRoaXMuX3ZpZXdJdGVtc0luZm8ubWFwKHRoaXMsIGl0ZW1zID0+IGl0ZW1zLml0ZW1zKTtcblx0XHR0aGlzLl9zcGFjZUJldHdlZW5QeCA9IDA7XG5cdFx0dGhpcy5fdG90YWxIZWlnaHQgPSB0aGlzLl92aWV3SXRlbXMubWFwKHRoaXMsIChpdGVtcywgcmVhZGVyKSA9PiBpdGVtcy5yZWR1Y2UoKHIsIGkpID0+IHIgKyBpLmNvbnRlbnRIZWlnaHQucmVhZChyZWFkZXIpICsgdGhpcy5fc3BhY2VCZXR3ZWVuUHgsIDApKTtcblx0XHR0aGlzLmFjdGl2ZUNvbnRyb2wgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVEaWZmSXRlbSA9IHRoaXMuX3ZpZXdNb2RlbC5yZWFkKHJlYWRlcik/LmFjdGl2ZURpZmZJdGVtLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghYWN0aXZlRGlmZkl0ZW0pIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0Y29uc3Qgdmlld0l0ZW0gPSB0aGlzLl92aWV3SXRlbXNJbmZvLnJlYWQocmVhZGVyKS5nZXRJdGVtKGFjdGl2ZURpZmZJdGVtKTtcblx0XHRcdHJldHVybiB2aWV3SXRlbS50ZW1wbGF0ZS5yZWFkKHJlYWRlcik/LmVkaXRvcjtcblx0XHR9KTtcblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3BhcmVudENvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLl9lbGVtZW50KSk7XG5cdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9wYXJlbnRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChcblx0XHRcdG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZV0pXG5cdFx0KSk7XG5cblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoRWRpdG9yQ29udGV4dEtleXMuaW5NdWx0aURpZmZFZGl0b3Iua2V5LCB0cnVlKTtcblxuXHRcdHRoaXMuX2xhc3REb2NTdGF0ZXMgPSB7fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW5XaXRoU3RvcmUoKHJlYWRlciwgc3RvcmUpID0+IHtcblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuX3ZpZXdNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodmlld01vZGVsICYmIHZpZXdNb2RlbC5jb250ZXh0S2V5cykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyh2aWV3TW9kZWwuY29udGV4dEtleXMpKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29udGV4dEtleSA9IHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxDb250ZXh0S2V5VmFsdWU+KGtleSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRjb250ZXh0S2V5LnNldCh2YWx1ZSk7XG5cdFx0XHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb250ZXh0S2V5LnJlc2V0KCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGN0eEFsbENvbGxhcHNlZCA9IHRoaXMuX3BhcmVudENvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxib29sZWFuPihFZGl0b3JDb250ZXh0S2V5cy5tdWx0aURpZmZFZGl0b3JBbGxDb2xsYXBzZWQua2V5LCBmYWxzZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bigocmVhZGVyKSA9PiB7XG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLl92aWV3TW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHZpZXdNb2RlbCkge1xuXHRcdFx0XHRjb25zdCBhbGxDb2xsYXBzZWQgPSB2aWV3TW9kZWwuaXRlbXMucmVhZChyZWFkZXIpLmV2ZXJ5KGl0ZW0gPT4gaXRlbS5jb2xsYXBzZWQucmVhZChyZWFkZXIpKTtcblx0XHRcdFx0Y3R4QWxsQ29sbGFwc2VkLnNldChhbGxDb2xsYXBzZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGN0eFJlbmRlclNpZGVCeVNpZGUgPSB0aGlzLl9wYXJlbnRDb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXk8Ym9vbGVhbj4oRWRpdG9yQ29udGV4dEtleXMubXVsdGlEaWZmRWRpdG9yUmVuZGVyU2lkZUJ5U2lkZS5rZXksIHRydWUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4oKHJlYWRlcikgPT4ge1xuXHRcdFx0Y29uc3QgcmVuZGVyU2lkZUJ5U2lkZSA9IHRoaXMuX3JlbmRlclNpZGVCeVNpZGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHJlbmRlclNpZGVCeVNpZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjdHhSZW5kZXJTaWRlQnlTaWRlLnNldChyZW5kZXJTaWRlQnlTaWRlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKChyZWFkZXIpID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gVXBkYXRlIHdpZGdldCBkaW1lbnNpb24gKi9cblx0XHRcdGNvbnN0IGRpbWVuc2lvbiA9IHRoaXMuX2RpbWVuc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9zaXplT2JzZXJ2ZXIub2JzZXJ2ZShkaW1lbnNpb24pO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHBsYWNlaG9sZGVyTWVzc2FnZSA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fdmlld0l0ZW1zLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChpdGVtcy5sZW5ndGggPiAwKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdFx0Y29uc3Qgdm0gPSB0aGlzLl92aWV3TW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuICghdm0gfHwgdm0uaXNMb2FkaW5nLnJlYWQocmVhZGVyKSlcblx0XHRcdFx0PyBsb2NhbGl6ZSgnbG9hZGluZycsICdMb2FkaW5nLi4uJylcblx0XHRcdFx0OiBsb2NhbGl6ZSgnbm9DaGFuZ2VkRmlsZXMnLCAnTm8gQ2hhbmdlZCBGaWxlcycpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bigocmVhZGVyKSA9PiB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gcGxhY2Vob2xkZXJNZXNzYWdlLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX2VsZW1lbnRzLnBsYWNlaG9sZGVyLmlubmVyVGV4dCA9IG1lc3NhZ2UgPz8gJyc7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5wbGFjZWhvbGRlci5jbGFzc0xpc3QudG9nZ2xlKCd2aXNpYmxlJywgISFtZXNzYWdlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zY3JvbGxhYmxlRWxlbWVudHMuY29udGVudC5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKChyZWFkZXIpID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gVXBkYXRlIHNjcm9sbCBkaW1lbnNpb25zICovXG5cdFx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLl9zaXplT2JzZXJ2ZXIuaGVpZ2h0LnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3Njcm9sbGFibGVFbGVtZW50cy5yb290LnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0XHRjb25zdCB0b3RhbEhlaWdodCA9IHRoaXMuX3RvdGFsSGVpZ2h0LnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3Njcm9sbGFibGVFbGVtZW50cy5jb250ZW50LnN0eWxlLmhlaWdodCA9IGAke3RvdGFsSGVpZ2h0fXB4YDtcblxuXHRcdFx0Y29uc3Qgd2lkdGggPSB0aGlzLl9zaXplT2JzZXJ2ZXIud2lkdGgucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRsZXQgc2Nyb2xsV2lkdGggPSB3aWR0aDtcblx0XHRcdGNvbnN0IHZpZXdJdGVtcyA9IHRoaXMuX3ZpZXdJdGVtcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBtYXggPSBmaW5kRmlyc3RNYXgodmlld0l0ZW1zLCBjb21wYXJlQnkoaSA9PiBpLm1heFNjcm9sbC5yZWFkKHJlYWRlcikubWF4U2Nyb2xsLCBudW1iZXJDb21wYXJhdG9yKSk7XG5cdFx0XHRpZiAobWF4KSB7XG5cdFx0XHRcdGNvbnN0IG1heFNjcm9sbCA9IG1heC5tYXhTY3JvbGwucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRzY3JvbGxXaWR0aCA9IHdpZHRoICsgbWF4U2Nyb2xsLm1heFNjcm9sbDtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsRGltZW5zaW9ucyh7XG5cdFx0XHRcdHdpZHRoOiB3aWR0aCxcblx0XHRcdFx0aGVpZ2h0OiBoZWlnaHQsXG5cdFx0XHRcdHNjcm9sbEhlaWdodDogdG90YWxIZWlnaHQsXG5cdFx0XHRcdHNjcm9sbFdpZHRoLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEEgcmVzdG9yZWQgc2Nyb2xsIG9mZnNldCBhcHBsaWVkIGJlZm9yZSB0aGUgbW9kZWwgdXBkYXRlZCB0aGVzZVxuXHRcdFx0Ly8gZGltZW5zaW9ucyB3b3VsZCBiZSBjbGFtcGVkIGFnYWluc3QgYSBzdGFsZSAob2Z0ZW4gMCkgc2Nyb2xsSGVpZ2h0LCBzb1xuXHRcdFx0Ly8gYXBwbHkgaXQgaGVyZSBvbmNlIHRoZSBkaW1lbnNpb25zIGFyZSBrbm93bi5cblx0XHRcdHRoaXMuX2FwcGx5UGVuZGluZ1Njcm9sbFN0YXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0X2VsZW1lbnQucmVwbGFjZUNoaWxkcmVuKHRoaXMuX2VsZW1lbnRzLnJvb3QpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRfZWxlbWVudC5yZXBsYWNlQ2hpbGRyZW4oKTtcblx0XHR9KSk7XG5cblx0XHQvLyBBdXRvbWF0aWNhbGx5IHNlbGVjdCB0aGUgZmlyc3QgY2hhbmdlIGluIHRoZSBmaXJzdCBmaWxlIHdoZW4gaXRlbXMgYXJlIGxvYWRlZFxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gSW5pdGlhbGl6ZSBmaXJzdCBjaGFuZ2UgKi9cblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuX3ZpZXdNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9ubHkgaW5pdGlhbGl6ZSB3aGVuIGxvYWRpbmcgaXMgY29tcGxldGVcblx0XHRcdGlmICghdmlld01vZGVsLmlzTG9hZGluZy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0Y29uc3QgaXRlbXMgPSB2aWV3TW9kZWwuaXRlbXMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gT25seSBpbml0aWFsaXplIGlmIHRoZXJlJ3Mgbm8gYWN0aXZlIGl0ZW0geWV0XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZURpZmZJdGVtID0gdmlld01vZGVsLmFjdGl2ZURpZmZJdGVtLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKGFjdGl2ZURpZmZJdGVtKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVzdG9yZSB0aGUgcGVyc2lzdGVkIGFjdGl2ZSBpdGVtIGluc3RlYWQgb2Ygc2VsZWN0aW5nIHRoZSBmaXJzdFxuXHRcdFx0XHQvLyBjaGFuZ2UsIHNvIHRoZSByZXN0b3JlZCBzY3JvbGwvY29sbGFwc2VkIHN0YXRlIGlzIHByZXNlcnZlZC5cblx0XHRcdFx0aWYgKHRoaXMuX3Jlc3RvcmVQZW5kaW5nQWN0aXZlRGlmZkl0ZW0odmlld01vZGVsLCBpdGVtcykpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBOYXZpZ2F0ZSB0byB0aGUgZmlyc3QgY2hhbmdlIHVzaW5nIHRoZSBleGlzdGluZyBuYXZpZ2F0aW9uXG5cdFx0XHRcdC8vIGxvZ2ljLiBXaGV0aGVyIHRoaXMgYWxzbyBtb3ZlcyBrZXlib2FyZCBmb2N1cyBpbnRvIHRoZSBlZGl0b3Jcblx0XHRcdFx0Ly8gaXMgZHJpdmVuIGJ5IHRoZSBsYXN0IGBzZXRWaWV3TW9kZWxgIGNhbGw6IGFuIGVkaXRvciBvcGVuZWRcblx0XHRcdFx0Ly8gd2l0aCBgcHJlc2VydmVGb2N1c2AgKGUuZy4gcmVzdG9yZWQgaW4gdGhlIGJhY2tncm91bmQgb3Igb24gYVxuXHRcdFx0XHQvLyBzZXNzaW9uIHN3aXRjaCkgbXVzdCBub3Qgc3RlYWwgZm9jdXMgZnJvbSB3aGVyZXZlciB0aGUgdXNlciBpc1xuXHRcdFx0XHQvLyAoc3VjaCBhcyB0aGUgY2hhdCBpbnB1dCksIHdoaWxlIGEgbm9ybWFsIHVzZXItaW5pdGlhdGVkIG9wZW5cblx0XHRcdFx0Ly8gZm9jdXNlcyB0aGUgZmlyc3QgY2hhbmdlIHNvIHRoZSBlZGl0b3IgaXMgcmVhZHkgdG8gdXNlLlxuXHRcdFx0XHR0aGlzLl9uYXZpZ2F0ZVRvQ2hhbmdlKCduZXh0JywgIXRoaXMuX3ByZXNlcnZlRm9jdXNPbkxvYWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gUmVuZGVyIGFsbCAqL1xuXHRcdFx0Z2xvYmFsVHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHR0aGlzLnJlbmRlcihyZWFkZXIpO1xuXHRcdFx0fSk7XG5cdFx0fSkpKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRTY3JvbGxTdGF0ZShzY3JvbGxTdGF0ZTogeyB0b3A/OiBudW1iZXI7IGxlZnQ/OiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdTY3JvbGxTdGF0ZSA9IHNjcm9sbFN0YXRlO1xuXHRcdHRoaXMuX2FwcGx5UGVuZGluZ1Njcm9sbFN0YXRlKCk7XG5cdH1cblxuXHQvKipcblx0ICogQXBwbGllcyBhIHJlc3RvcmVkIHNjcm9sbCBvZmZzZXQgb25jZSB0aGUgc2Nyb2xsYWJsZSBkaW1lbnNpb25zIGNhblxuXHQgKiBhY2NvbW1vZGF0ZSBpdDsgcmV0cmllcyBvbiBzdWJzZXF1ZW50IGRpbWVuc2lvbiB1cGRhdGVzIHVudGlsIGl0IHN0aWNrcyAoc29cblx0ICogYSBmcmVzaC9yZWxvYWRlZCB3aWRnZXQgd2hvc2UgY29udGVudCBoZWlnaHQgaXMgbm90IHlldCBrbm93biBkb2VzIG5vdCBjbGFtcFxuXHQgKiB0aGUgb2Zmc2V0IHRvIDApLiBDb25zdW1lZCBvbmNlIGl0IGxhbmRzLlxuXHQgKi9cblx0cHJpdmF0ZSBfYXBwbHlQZW5kaW5nU2Nyb2xsU3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdTY3JvbGxTdGF0ZTtcblx0XHRpZiAoIXBlbmRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxMZWZ0OiBwZW5kaW5nLmxlZnQsIHNjcm9sbFRvcDogcGVuZGluZy50b3AgfSk7XG5cdFx0Y29uc3QgYXBwbGllZCA9IHRoaXMuX3Njcm9sbGFibGVFbGVtZW50LmdldFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgdG9wTGFuZGVkID0gcGVuZGluZy50b3AgPT09IHVuZGVmaW5lZCB8fCBhcHBsaWVkLnNjcm9sbFRvcCA+PSBwZW5kaW5nLnRvcDtcblx0XHRjb25zdCBsZWZ0TGFuZGVkID0gcGVuZGluZy5sZWZ0ID09PSB1bmRlZmluZWQgfHwgYXBwbGllZC5zY3JvbGxMZWZ0ID49IHBlbmRpbmcubGVmdDtcblx0XHRpZiAodG9wTGFuZGVkICYmIGxlZnRMYW5kZWQpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdTY3JvbGxTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXJzIGFueSBwZW5kaW5nIHJlc3RvcmF0aW9uIHN0YXRlIChkb2N1bWVudHMsIGFjdGl2ZSBpdGVtLCBzY3JvbGwpLiBDYWxsZWRcblx0ICogd2hlbiBhIG5ldyBtb2RlbCBpcyBpbnN0YWxsZWQgd2l0aG91dCBhIHZpZXcgc3RhdGUsIHNvIGl0IGNhbm5vdCBpbmhlcml0IHRoZVxuXHQgKiBwcmV2aW91cyBtb2RlbCdzIHN0YXRlIGZvciBvdmVybGFwcGluZyBkaWZmIGtleXMuXG5cdCAqL1xuXHRwdWJsaWMgY2xlYXJQZW5kaW5nUmVzdG9yYXRpb25TdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9sYXN0RG9jU3RhdGVzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2xhc3RBY3RpdmVEaWZmSXRlbUtleSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9wZW5kaW5nU2Nyb2xsU3RhdGUgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgYXV0b21hdGljIGZpcnN0LWNoYW5nZSBzZWxlY3Rpb24gdGhhdCBydW5zIG9uY2UgdGhlXG5cdCAqIHZpZXcgbW9kZWwgZmluaXNoZXMgbG9hZGluZyBwcmVzZXJ2ZXMgZm9jdXMgaW5zdGVhZCBvZiBtb3ZpbmcgaXQgaW50byB0aGVcblx0ICogZWRpdG9yLiBTZXQgdG8gYHRydWVgIGZvciBgcHJlc2VydmVGb2N1c2Agb3BlbnMgc28gZm9jdXMgaXMgbm90IHN0b2xlblxuXHQgKiBmcm9tIGVsc2V3aGVyZS5cblx0ICovXG5cdHB1YmxpYyBzZXRQcmVzZXJ2ZUZvY3VzT25Mb2FkKHByZXNlcnZlRm9jdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9wcmVzZXJ2ZUZvY3VzT25Mb2FkID0gcHJlc2VydmVGb2N1cztcblx0fVxuXG5cdHB1YmxpYyBnZXRSb290RWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2VsZW1lbnRzLnJvb3Q7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29udGV4dEtleVNlcnZpY2UoKTogSUNvbnRleHRLZXlTZXJ2aWNlIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dEtleVNlcnZpY2U7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UoKTogSUluc3RhbnRpYXRpb25TZXJ2aWNlIHtcblx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdH1cblx0cHVibGljIHJldmVhbChyZXNvdXJjZTogSU11bHRpRGlmZlJlc291cmNlSWQsIG9wdGlvbnM/OiBSZXZlYWxPcHRpb25zKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld0l0ZW1zID0gdGhpcy5fdmlld0l0ZW1zLmdldCgpO1xuXHRcdGNvbnN0IGluZGV4ID0gdmlld0l0ZW1zLmZpbmRJbmRleChcblx0XHRcdChpdGVtKSA9PiBpdGVtLnZpZXdNb2RlbC5vcmlnaW5hbFVyaT8udG9TdHJpbmcoKSA9PT0gcmVzb3VyY2Uub3JpZ2luYWw/LnRvU3RyaW5nKClcblx0XHRcdFx0JiYgaXRlbS52aWV3TW9kZWwubW9kaWZpZWRVcmk/LnRvU3RyaW5nKCkgPT09IHJlc291cmNlLm1vZGlmaWVkPy50b1N0cmluZygpXG5cdFx0KTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdSZXNvdXJjZSBub3QgZm91bmQgaW4gZGlmZiBlZGl0b3InKTtcblx0XHR9XG5cdFx0Y29uc3Qgdmlld0l0ZW0gPSB2aWV3SXRlbXNbaW5kZXhdO1xuXHRcdHRoaXMuX3ZpZXdNb2RlbC5nZXQoKSEuYWN0aXZlRGlmZkl0ZW0uc2V0Q2FjaGUodmlld0l0ZW0udmlld01vZGVsLCB1bmRlZmluZWQpO1xuXG5cdFx0bGV0IHNjcm9sbFRvcCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpbmRleDsgaSsrKSB7XG5cdFx0XHRzY3JvbGxUb3AgKz0gdmlld0l0ZW1zW2ldLmNvbnRlbnRIZWlnaHQuZ2V0KCkgKyB0aGlzLl9zcGFjZUJldHdlZW5QeDtcblx0XHR9XG5cdFx0dGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3AgfSk7XG5cblx0XHRjb25zdCBkaWZmRWRpdG9yID0gdmlld0l0ZW0udGVtcGxhdGUuZ2V0KCk/LmVkaXRvcjtcblx0XHRjb25zdCBlZGl0b3IgPSAnb3JpZ2luYWwnIGluIHJlc291cmNlID8gZGlmZkVkaXRvcj8uZ2V0T3JpZ2luYWxFZGl0b3IoKSA6IGRpZmZFZGl0b3I/LmdldE1vZGlmaWVkRWRpdG9yKCk7XG5cdFx0aWYgKGVkaXRvciAmJiBvcHRpb25zPy5yYW5nZSkge1xuXHRcdFx0ZWRpdG9yLnJldmVhbFJhbmdlSW5DZW50ZXIob3B0aW9ucy5yYW5nZSk7XG5cdFx0XHRoaWdobGlnaHRSYW5nZShlZGl0b3IsIG9wdGlvbnMucmFuZ2UpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3U3RhdGUoKTogSU11bHRpRGlmZkVkaXRvclZpZXdTdGF0ZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNjcm9sbFN0YXRlOiB7XG5cdFx0XHRcdHRvcDogdGhpcy5zY3JvbGxUb3AuZ2V0KCksXG5cdFx0XHRcdGxlZnQ6IHRoaXMuc2Nyb2xsTGVmdC5nZXQoKSxcblx0XHRcdH0sXG5cdFx0XHRkb2NTdGF0ZXM6IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLl92aWV3SXRlbXMuZ2V0KCkubWFwKGkgPT4gW2kuZ2V0S2V5KCksIGkuZ2V0Vmlld1N0YXRlKCldKSksXG5cdFx0XHRhY3RpdmVEaWZmSXRlbUtleTogdGhpcy5fdmlld01vZGVsLmdldCgpPy5hY3RpdmVEaWZmSXRlbS5nZXQoKT8uZ2V0S2V5KCksXG5cdFx0fTtcblx0fVxuXG5cdC8qKiBUaGlzIGFjY291bnRzIGZvciBkb2N1bWVudHMgdGhhdCBhcmUgbm90IGxvYWRlZCB5ZXQuICovXG5cdHByaXZhdGUgX2xhc3REb2NTdGF0ZXM6IElNdWx0aURpZmZFZGl0b3JWaWV3U3RhdGVbJ2RvY1N0YXRlcyddO1xuXG5cdC8qKlxuXHQgKiBUaGUgYWN0aXZlIGRpZmYgaXRlbSB0byByZXN0b3JlIG9uY2UgdGhlIGRvY3VtZW50cyBhcmUgbG9hZGVkLiBSZXN0b3JpbmcgaXRcblx0ICogc3VwcHJlc3NlcyB0aGUgYXV0b21hdGljIGZpcnN0LWNoYW5nZSBuYXZpZ2F0aW9uICh3aGljaCB3b3VsZCBleHBhbmQgdGhlXG5cdCAqIGZpcnN0IGZpbGUgYW5kIHJlc2V0IHNjcm9sbCksIHNvIHRoZSByZXN0b3JlZCBzdGF0ZSB3aW5zLiBDb25zdW1lZCBvbmNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfbGFzdEFjdGl2ZURpZmZJdGVtS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqIEEgcmVzdG9yZWQgc2Nyb2xsIG9mZnNldCB3YWl0aW5nIGZvciB0aGUgc2Nyb2xsYWJsZSBkaW1lbnNpb25zIHRvIGJlIGtub3duLiAqL1xuXHRwcml2YXRlIF9wZW5kaW5nU2Nyb2xsU3RhdGU6IHsgdG9wPzogbnVtYmVyOyBsZWZ0PzogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIHNldFZpZXdTdGF0ZSh2aWV3U3RhdGU6IElNdWx0aURpZmZFZGl0b3JWaWV3U3RhdGUsIHR4PzogSVRyYW5zYWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5zZXRTY3JvbGxTdGF0ZSh2aWV3U3RhdGUuc2Nyb2xsU3RhdGUpO1xuXG5cdFx0dGhpcy5fbGFzdERvY1N0YXRlcyA9IHZpZXdTdGF0ZS5kb2NTdGF0ZXM7XG5cdFx0dGhpcy5fbGFzdEFjdGl2ZURpZmZJdGVtS2V5ID0gdmlld1N0YXRlLmFjdGl2ZURpZmZJdGVtS2V5O1xuXG5cdFx0Y29uc3QgYXBwbHlEb2NTdGF0ZXMgPSAodHg6IElUcmFuc2FjdGlvbikgPT4ge1xuXHRcdFx0aWYgKHZpZXdTdGF0ZS5kb2NTdGF0ZXMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBpIG9mIHRoaXMuX3ZpZXdJdGVtcy5nZXQoKSkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gdmlld1N0YXRlLmRvY1N0YXRlc1tpLmdldEtleSgpXTtcblx0XHRcdFx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdFx0XHRcdGkuc2V0Vmlld1N0YXRlKHN0YXRlLCB0eCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpZiAodHgpIHtcblx0XHRcdGFwcGx5RG9jU3RhdGVzKHR4KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dHJhbnNhY3Rpb24oYXBwbHlEb2NTdGF0ZXMpO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBkb2N1bWVudHMgYXJlIGFscmVhZHkgbG9hZGVkLCByZXN0b3JlIHRoZSBhY3RpdmUgaXRlbSBub3cgKHRoaXNcblx0XHQvLyBvdmVycmlkZXMgdGhlIGZpcnN0LWNoYW5nZSBzZWxlY3Rpb24gdGhlIGluaXQgYXV0b3J1biBtYXkgaGF2ZSBtYWRlKTtcblx0XHQvLyBvdGhlcndpc2UgdGhlIGluaXQgYXV0b3J1biByZXN0b3JlcyBpdCBvbmNlIGxvYWRpbmcgY29tcGxldGVzLlxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuX3ZpZXdNb2RlbC5nZXQoKTtcblx0XHRpZiAodmlld01vZGVsKSB7XG5cdFx0XHR0aGlzLl9yZXN0b3JlUGVuZGluZ0FjdGl2ZURpZmZJdGVtKHZpZXdNb2RlbCwgdmlld01vZGVsLml0ZW1zLmdldCgpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVzdG9yZXMgdGhlIHBlcnNpc3RlZCBhY3RpdmUgZGlmZiBpdGVtIChpZiBhbnkpIG9udG8gdGhlIHZpZXcgbW9kZWwsIHNvIHRoZVxuXHQgKiBhdXRvbWF0aWMgZmlyc3QtY2hhbmdlIG5hdmlnYXRpb24gaXMgc2tpcHBlZC4gT24gYW4gZXhwbGljaXQgKG5vbi1wcmVzZXJ2ZS1mb2N1cylcblx0ICogb3BlbiBpdCBhbHNvIG1vdmVzIGZvY3VzIGludG8gdGhlIHJlc3RvcmVkIGl0ZW0ncyBlZGl0b3IsIG1pcnJvcmluZyB0aGVcblx0ICogZmlyc3QtY2hhbmdlIG5hdmlnYXRpb24gaXQgcmVwbGFjZXMuIFJldHVybnMgd2hldGhlciBpdCB3YXMgYXBwbGllZC5cblx0ICovXG5cdHByaXZhdGUgX3Jlc3RvcmVQZW5kaW5nQWN0aXZlRGlmZkl0ZW0odmlld01vZGVsOiBNdWx0aURpZmZFZGl0b3JWaWV3TW9kZWwsIGl0ZW1zOiByZWFkb25seSBEb2N1bWVudERpZmZJdGVtVmlld01vZGVsW10pOiBib29sZWFuIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9sYXN0QWN0aXZlRGlmZkl0ZW1LZXk7XG5cdFx0aWYgKGtleSA9PT0gdW5kZWZpbmVkIHx8IGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0QWN0aXZlRGlmZkl0ZW1LZXkgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gaXRlbXMuZmluZChpID0+IGkuZ2V0S2V5KCkgPT09IGtleSk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dmlld01vZGVsLmFjdGl2ZURpZmZJdGVtLnNldENhY2hlKHRhcmdldCwgdW5kZWZpbmVkKTtcblxuXHRcdGlmICghdGhpcy5fcHJlc2VydmVGb2N1c09uTG9hZCkge1xuXHRcdFx0dGhpcy5fdmlld0l0ZW1zSW5mby5nZXQoKS5nZXRJdGVtKHRhcmdldCkudGVtcGxhdGUuZ2V0KCk/LmVkaXRvci5mb2N1cygpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBmaW5kRG9jdW1lbnREaWZmSXRlbShyZXNvdXJjZTogVVJJKTogSURvY3VtZW50RGlmZkl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl92aWV3SXRlbXMuZ2V0KCkuZmluZCh2ID0+XG5cdFx0XHR2LnZpZXdNb2RlbC5kaWZmRWRpdG9yVmlld01vZGVsLm1vZGVsLm1vZGlmaWVkLnVyaS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpXG5cdFx0XHR8fCB2LnZpZXdNb2RlbC5kaWZmRWRpdG9yVmlld01vZGVsLm1vZGVsLm9yaWdpbmFsLnVyaS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpXG5cdFx0KTtcblx0XHRyZXR1cm4gaXRlbT8udmlld01vZGVsLmRvY3VtZW50RGlmZkl0ZW07XG5cdH1cblxuXHRwdWJsaWMgdHJ5R2V0Q29kZUVkaXRvcihyZXNvdXJjZTogVVJJKTogeyBkaWZmRWRpdG9yOiBJRGlmZkVkaXRvcjsgZWRpdG9yOiBJQ29kZUVkaXRvciB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5fdmlld0l0ZW1zLmdldCgpLmZpbmQodiA9PlxuXHRcdFx0di52aWV3TW9kZWwuZGlmZkVkaXRvclZpZXdNb2RlbC5tb2RlbC5tb2RpZmllZC51cmkudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKVxuXHRcdFx0fHwgdi52aWV3TW9kZWwuZGlmZkVkaXRvclZpZXdNb2RlbC5tb2RlbC5vcmlnaW5hbC51cmkudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKVxuXHRcdCk7XG5cdFx0Y29uc3QgZWRpdG9yID0gaXRlbT8udGVtcGxhdGUuZ2V0KCk/LmVkaXRvcjtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoaXRlbS52aWV3TW9kZWwuZGlmZkVkaXRvclZpZXdNb2RlbC5tb2RlbC5tb2RpZmllZC51cmkudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuIHsgZGlmZkVkaXRvcjogZWRpdG9yLCBlZGl0b3I6IGVkaXRvci5nZXRNb2RpZmllZEVkaXRvcigpIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7IGRpZmZFZGl0b3I6IGVkaXRvciwgZWRpdG9yOiBlZGl0b3IuZ2V0T3JpZ2luYWxFZGl0b3IoKSB9O1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnb1RvTmV4dENoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9uYXZpZ2F0ZVRvQ2hhbmdlKCduZXh0Jyk7XG5cdH1cblxuXHRwdWJsaWMgZ29Ub1ByZXZpb3VzQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMuX25hdmlnYXRlVG9DaGFuZ2UoJ3ByZXZpb3VzJyk7XG5cdH1cblxuXHRwcml2YXRlIF9uYXZpZ2F0ZVRvQ2hhbmdlKGRpcmVjdGlvbjogJ25leHQnIHwgJ3ByZXZpb3VzJywgZm9jdXNFZGl0b3I6IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld0l0ZW1zID0gdGhpcy5fdmlld0l0ZW1zLmdldCgpO1xuXHRcdGlmICh2aWV3SXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlVmlld01vZGVsID0gdGhpcy5fdmlld01vZGVsLmdldCgpPy5hY3RpdmVEaWZmSXRlbS5nZXQoKTtcblx0XHRjb25zdCBjdXJyZW50SW5kZXggPSBhY3RpdmVWaWV3TW9kZWwgPyB2aWV3SXRlbXMuZmluZEluZGV4KHYgPT4gdi52aWV3TW9kZWwgPT09IGFjdGl2ZVZpZXdNb2RlbCkgOiAtMTtcblxuXHRcdC8vIFN0YXJ0IHdpdGggZmlyc3QgZmlsZSBpZiBubyBhY3RpdmUgaXRlbVxuXHRcdGlmIChjdXJyZW50SW5kZXggPT09IC0xKSB7XG5cdFx0XHR0aGlzLl9nb1RvRmlsZSgwLCAnZmlyc3QnLCBmb2N1c0VkaXRvcik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVHJ5IGN1cnJlbnQgZmlsZSBmaXJzdCAtIGV4cGFuZCBpZiBjb2xsYXBzZWRcblx0XHRjb25zdCBjdXJyZW50SXRlbSA9IHZpZXdJdGVtc1tjdXJyZW50SW5kZXhdO1xuXHRcdGlmIChjdXJyZW50SXRlbS52aWV3TW9kZWwuY29sbGFwc2VkLmdldCgpKSB7XG5cdFx0XHRjdXJyZW50SXRlbS52aWV3TW9kZWwuY29sbGFwc2VkLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3IgPSBjdXJyZW50SXRlbS50ZW1wbGF0ZS5nZXQoKT8uZWRpdG9yO1xuXHRcdGlmIChlZGl0b3I/LmdldERpZmZDb21wdXRhdGlvblJlc3VsdCgpPy5jaGFuZ2VzMj8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBwb3MgPSBlZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKS5nZXRQb3NpdGlvbigpPy5saW5lTnVtYmVyIHx8IDE7XG5cdFx0XHRjb25zdCBjaGFuZ2VzID0gZWRpdG9yLmdldERpZmZDb21wdXRhdGlvblJlc3VsdCgpIS5jaGFuZ2VzMiE7XG5cdFx0XHRjb25zdCBoYXNOZXh0ID0gZGlyZWN0aW9uID09PSAnbmV4dCcgPyBjaGFuZ2VzLnNvbWUoYyA9PiBjLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlciA+IHBvcykgOiBjaGFuZ2VzLnNvbWUoYyA9PiBjLm1vZGlmaWVkLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgPD0gcG9zKTtcblxuXHRcdFx0aWYgKGhhc05leHQpIHtcblx0XHRcdFx0ZWRpdG9yLmdvVG9EaWZmKGRpcmVjdGlvbik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBNb3ZlIHRvIG5leHQvcHJldmlvdXMgZmlsZVxuXHRcdGNvbnN0IG5leHRJbmRleCA9IChjdXJyZW50SW5kZXggKyAoZGlyZWN0aW9uID09PSAnbmV4dCcgPyAxIDogLTEpICsgdmlld0l0ZW1zLmxlbmd0aCkgJSB2aWV3SXRlbXMubGVuZ3RoO1xuXHRcdHRoaXMuX2dvVG9GaWxlKG5leHRJbmRleCwgZGlyZWN0aW9uID09PSAnbmV4dCcgPyAnZmlyc3QnIDogJ2xhc3QnLCBmb2N1c0VkaXRvcik7XG5cdH1cblxuXHRwcml2YXRlIF9nb1RvRmlsZShpbmRleDogbnVtYmVyLCBwb3NpdGlvbjogJ2ZpcnN0JyB8ICdsYXN0JywgZm9jdXNFZGl0b3I6IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuX3ZpZXdJdGVtcy5nZXQoKVtpbmRleF07XG5cdFx0aWYgKGl0ZW0udmlld01vZGVsLmNvbGxhcHNlZC5nZXQoKSkge1xuXHRcdFx0aXRlbS52aWV3TW9kZWwuY29sbGFwc2VkLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHR0aGlzLnJldmVhbCh7IG9yaWdpbmFsOiBpdGVtLnZpZXdNb2RlbC5vcmlnaW5hbFVyaSwgbW9kaWZpZWQ6IGl0ZW0udmlld01vZGVsLm1vZGlmaWVkVXJpIH0pO1xuXG5cdFx0Y29uc3QgZWRpdG9yID0gaXRlbS50ZW1wbGF0ZS5nZXQoKT8uZWRpdG9yO1xuXHRcdGlmIChlZGl0b3I/LmdldERpZmZDb21wdXRhdGlvblJlc3VsdCgpPy5jaGFuZ2VzMj8ubGVuZ3RoKSB7XG5cdFx0XHRpZiAocG9zaXRpb24gPT09ICdmaXJzdCcpIHtcblx0XHRcdFx0ZWRpdG9yLnJldmVhbEZpcnN0RGlmZigpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbGFzdENoYW5nZSA9IGVkaXRvci5nZXREaWZmQ29tcHV0YXRpb25SZXN1bHQoKSEuY2hhbmdlczIhLmF0KC0xKSE7XG5cdFx0XHRcdGNvbnN0IG1vZGlmaWVkRWRpdG9yID0gZWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCk7XG5cdFx0XHRcdG1vZGlmaWVkRWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogbGFzdENoYW5nZS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIsIGNvbHVtbjogMSB9KTtcblx0XHRcdFx0bW9kaWZpZWRFZGl0b3IucmV2ZWFsTGluZUluQ2VudGVyKGxhc3RDaGFuZ2UubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGZvY3VzRWRpdG9yKSB7XG5cdFx0XHRlZGl0b3I/LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIocmVhZGVyOiBJUmVhZGVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy5zY3JvbGxUb3AucmVhZChyZWFkZXIpO1xuXHRcdGxldCBjb250ZW50U2Nyb2xsT2Zmc2V0VG9TY3JvbGxPZmZzZXQgPSAwO1xuXHRcdGxldCBpdGVtSGVpZ2h0U3VtQmVmb3JlID0gMDtcblx0XHRsZXQgaXRlbUNvbnRlbnRIZWlnaHRTdW1CZWZvcmUgPSAwO1xuXHRcdGNvbnN0IHZpZXdQb3J0SGVpZ2h0ID0gdGhpcy5fc2l6ZU9ic2VydmVyLmhlaWdodC5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgY29udGVudFZpZXdQb3J0ID0gT2Zmc2V0UmFuZ2Uub2ZTdGFydEFuZExlbmd0aChzY3JvbGxUb3AsIHZpZXdQb3J0SGVpZ2h0KTtcblxuXHRcdGNvbnN0IHdpZHRoID0gdGhpcy5fc2l6ZU9ic2VydmVyLndpZHRoLnJlYWQocmVhZGVyKTtcblxuXHRcdGZvciAoY29uc3QgdiBvZiB0aGlzLl92aWV3SXRlbXMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRjb25zdCBpdGVtQ29udGVudEhlaWdodCA9IHYuY29udGVudEhlaWdodC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBpdGVtSGVpZ2h0ID0gTWF0aC5taW4oaXRlbUNvbnRlbnRIZWlnaHQsIHZpZXdQb3J0SGVpZ2h0KTtcblx0XHRcdGNvbnN0IGl0ZW1SYW5nZSA9IE9mZnNldFJhbmdlLm9mU3RhcnRBbmRMZW5ndGgoaXRlbUhlaWdodFN1bUJlZm9yZSwgaXRlbUhlaWdodCk7XG5cdFx0XHRjb25zdCBpdGVtQ29udGVudFJhbmdlID0gT2Zmc2V0UmFuZ2Uub2ZTdGFydEFuZExlbmd0aChpdGVtQ29udGVudEhlaWdodFN1bUJlZm9yZSwgaXRlbUNvbnRlbnRIZWlnaHQpO1xuXG5cdFx0XHRpZiAoaXRlbUNvbnRlbnRSYW5nZS5pc0JlZm9yZShjb250ZW50Vmlld1BvcnQpKSB7XG5cdFx0XHRcdGNvbnRlbnRTY3JvbGxPZmZzZXRUb1Njcm9sbE9mZnNldCAtPSBpdGVtQ29udGVudEhlaWdodCAtIGl0ZW1IZWlnaHQ7XG5cdFx0XHRcdHYuaGlkZSgpO1xuXHRcdFx0fSBlbHNlIGlmIChpdGVtQ29udGVudFJhbmdlLmlzQWZ0ZXIoY29udGVudFZpZXdQb3J0KSkge1xuXHRcdFx0XHR2LmhpZGUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHNjcm9sbCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGNvbnRlbnRWaWV3UG9ydC5zdGFydCAtIGl0ZW1Db250ZW50UmFuZ2Uuc3RhcnQsIGl0ZW1Db250ZW50SGVpZ2h0IC0gaXRlbUhlaWdodCkpO1xuXHRcdFx0XHRjb250ZW50U2Nyb2xsT2Zmc2V0VG9TY3JvbGxPZmZzZXQgLT0gc2Nyb2xsO1xuXHRcdFx0XHRjb25zdCB2aWV3UG9ydCA9IE9mZnNldFJhbmdlLm9mU3RhcnRBbmRMZW5ndGgoc2Nyb2xsVG9wICsgY29udGVudFNjcm9sbE9mZnNldFRvU2Nyb2xsT2Zmc2V0LCB2aWV3UG9ydEhlaWdodCk7XG5cdFx0XHRcdHYucmVuZGVyKGl0ZW1SYW5nZSwgc2Nyb2xsLCB3aWR0aCwgdmlld1BvcnQpO1xuXHRcdFx0fVxuXG5cdFx0XHRpdGVtSGVpZ2h0U3VtQmVmb3JlICs9IGl0ZW1IZWlnaHQgKyB0aGlzLl9zcGFjZUJldHdlZW5QeDtcblx0XHRcdGl0ZW1Db250ZW50SGVpZ2h0U3VtQmVmb3JlICs9IGl0ZW1Db250ZW50SGVpZ2h0ICsgdGhpcy5fc3BhY2VCZXR3ZWVuUHg7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnRzLmNvbnRlbnQuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZVkoJHstKHNjcm9sbFRvcCArIGNvbnRlbnRTY3JvbGxPZmZzZXRUb1Njcm9sbE9mZnNldCl9cHgpYDtcblx0fVxufVxuXG5mdW5jdGlvbiBoaWdobGlnaHRSYW5nZSh0YXJnZXRFZGl0b3I6IElDb2RlRWRpdG9yLCByYW5nZTogSVJhbmdlKSB7XG5cdGNvbnN0IG1vZGVsTm93ID0gdGFyZ2V0RWRpdG9yLmdldE1vZGVsKCk7XG5cdGNvbnN0IGRlY29yYXRpb25zID0gdGFyZ2V0RWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbihbeyByYW5nZSwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ3N5bWJvbC1uYXZpZ2F0ZS1hY3Rpb24taGlnaGxpZ2h0JywgY2xhc3NOYW1lOiAnc3ltYm9sSGlnaGxpZ2h0JyB9IH1dKTtcblx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0aWYgKHRhcmdldEVkaXRvci5nZXRNb2RlbCgpID09PSBtb2RlbE5vdykge1xuXHRcdFx0ZGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHR9XG5cdH0sIDM1MCk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU11bHRpRGlmZkVkaXRvclZpZXdTdGF0ZSB7XG5cdHNjcm9sbFN0YXRlOiB7IHRvcDogbnVtYmVyOyBsZWZ0OiBudW1iZXIgfTtcblx0ZG9jU3RhdGVzPzogUmVjb3JkPHN0cmluZywgSU11bHRpRGlmZkRvY1N0YXRlPjtcblx0LyoqIEtleSAoe0BsaW5rIERvY3VtZW50RGlmZkl0ZW1WaWV3TW9kZWwuZ2V0S2V5fSkgb2YgdGhlIGFjdGl2ZSBkaWZmIGl0ZW0sIGlmIGFueS4gKi9cblx0YWN0aXZlRGlmZkl0ZW1LZXk/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJTXVsdGlEaWZmRG9jU3RhdGUge1xuXHRjb2xsYXBzZWQ6IGJvb2xlYW47XG5cdHNlbGVjdGlvbnM/OiBJU2VsZWN0aW9uW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU11bHRpRGlmZkVkaXRvck9wdGlvbnMgZXh0ZW5kcyBJVGV4dEVkaXRvck9wdGlvbnMge1xuXHR2aWV3U3RhdGU/OiBJTXVsdGlEaWZmRWRpdG9yT3B0aW9uc1ZpZXdTdGF0ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTXVsdGlEaWZmRWRpdG9yT3B0aW9uc1ZpZXdTdGF0ZSB7XG5cdHJldmVhbERhdGE/OiB7XG5cdFx0cmVzb3VyY2U6IElNdWx0aURpZmZSZXNvdXJjZUlkO1xuXHRcdHJhbmdlPzogSVJhbmdlO1xuXHR9O1xufVxuXG5leHBvcnQgdHlwZSBJTXVsdGlEaWZmUmVzb3VyY2VJZCA9IHsgb3JpZ2luYWw6IFVSSSB8IHVuZGVmaW5lZDsgbW9kaWZpZWQ6IFVSSSB8IHVuZGVmaW5lZCB9O1xuXG5jbGFzcyBWaXJ0dWFsaXplZFZpZXdJdGVtIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RlbXBsYXRlUmVmID0gdGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZU9ic2VydmFibGVWYWx1ZTxJUmVmZXJlbmNlPERpZmZFZGl0b3JJdGVtVGVtcGxhdGU+IHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgY29udGVudEhlaWdodCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+XG5cdFx0dGhpcy5fdGVtcGxhdGVSZWYucmVhZChyZWFkZXIpPy5vYmplY3QuY29udGVudEhlaWdodD8ucmVhZChyZWFkZXIpID8/IHRoaXMudmlld01vZGVsLmxhc3RUZW1wbGF0ZURhdGEucmVhZChyZWFkZXIpLmNvbnRlbnRIZWlnaHRcblx0KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgbWF4U2Nyb2xsID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fdGVtcGxhdGVSZWYucmVhZChyZWFkZXIpPy5vYmplY3QubWF4U2Nyb2xsLnJlYWQocmVhZGVyKSA/PyB7IG1heFNjcm9sbDogMCwgc2Nyb2xsV2lkdGg6IDAgfSk7XG5cblx0cHVibGljIHJlYWRvbmx5IHRlbXBsYXRlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fdGVtcGxhdGVSZWYucmVhZChyZWFkZXIpPy5vYmplY3QpO1xuXHRwcml2YXRlIF9pc0hpZGRlbiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaXNGb2N1c2VkID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy50ZW1wbGF0ZS5yZWFkKHJlYWRlcik/LmlzRm9jdXNlZC5yZWFkKHJlYWRlcikgPz8gZmFsc2UpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB2aWV3TW9kZWw6IERvY3VtZW50RGlmZkl0ZW1WaWV3TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb2JqZWN0UG9vbDogT2JqZWN0UG9vbDxUZW1wbGF0ZURhdGEsIERpZmZFZGl0b3JJdGVtVGVtcGxhdGU+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Njcm9sbExlZnQ6IElPYnNlcnZhYmxlPG51bWJlcj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGVsdGFTY3JvbGxWZXJ0aWNhbDogKGRlbHRhOiBudW1iZXIpID0+IHZvaWQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnZpZXdNb2RlbC5zZXRJc0ZvY3VzZWQodGhpcy5faXNGb2N1c2VkLCB1bmRlZmluZWQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bigocmVhZGVyKSA9PiB7XG5cdFx0XHRjb25zdCBzY3JvbGxMZWZ0ID0gdGhpcy5fc2Nyb2xsTGVmdC5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl90ZW1wbGF0ZVJlZi5yZWFkKHJlYWRlcik/Lm9iamVjdC5zZXRTY3JvbGxMZWZ0KHNjcm9sbExlZnQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHJlZiA9IHRoaXMuX3RlbXBsYXRlUmVmLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghcmVmKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3QgaXNIaWRkZW4gPSB0aGlzLl9pc0hpZGRlbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWlzSGlkZGVuKSB7IHJldHVybjsgfVxuXG5cdFx0XHRjb25zdCBpc0ZvY3VzZWQgPSByZWYub2JqZWN0LmlzRm9jdXNlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoaXNGb2N1c2VkKSB7IHJldHVybjsgfVxuXG5cdFx0XHR0aGlzLl9jbGVhcigpO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYFZpcnR1YWxWaWV3SXRlbSgke3RoaXMudmlld01vZGVsLmRvY3VtZW50RGlmZkl0ZW0ubW9kaWZpZWQ/LnVyaS50b1N0cmluZygpfSlgO1xuXHR9XG5cblx0cHVibGljIGdldEtleSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbC5nZXRLZXkoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3U3RhdGUoKTogSU11bHRpRGlmZkRvY1N0YXRlIHtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVUZW1wbGF0ZURhdGEodHgpO1xuXHRcdH0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb2xsYXBzZWQ6IHRoaXMudmlld01vZGVsLmNvbGxhcHNlZC5nZXQoKSxcblx0XHRcdHNlbGVjdGlvbnM6IHRoaXMudmlld01vZGVsLmxhc3RUZW1wbGF0ZURhdGEuZ2V0KCkuc2VsZWN0aW9ucyxcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIHNldFZpZXdTdGF0ZSh2aWV3U3RhdGU6IElNdWx0aURpZmZEb2NTdGF0ZSwgdHg6IElUcmFuc2FjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMudmlld01vZGVsLmNvbGxhcHNlZC5zZXQodmlld1N0YXRlLmNvbGxhcHNlZCwgdHgpO1xuXG5cdFx0dGhpcy5fdXBkYXRlVGVtcGxhdGVEYXRhKHR4KTtcblx0XHRjb25zdCBkYXRhID0gdGhpcy52aWV3TW9kZWwubGFzdFRlbXBsYXRlRGF0YS5nZXQoKTtcblx0XHRjb25zdCBzZWxlY3Rpb25zID0gdmlld1N0YXRlLnNlbGVjdGlvbnM/Lm1hcChTZWxlY3Rpb24ubGlmdFNlbGVjdGlvbik7XG5cdFx0dGhpcy52aWV3TW9kZWwubGFzdFRlbXBsYXRlRGF0YS5zZXQoe1xuXHRcdFx0Li4uZGF0YSxcblx0XHRcdHNlbGVjdGlvbnMsXG5cdFx0fSwgdHgpO1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuX3RlbXBsYXRlUmVmLmdldCgpO1xuXHRcdGlmIChyZWYpIHtcblx0XHRcdGlmIChzZWxlY3Rpb25zKSB7XG5cdFx0XHRcdHJlZi5vYmplY3QuZWRpdG9yLnNldFNlbGVjdGlvbnMoc2VsZWN0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVGVtcGxhdGVEYXRhKHR4OiBJVHJhbnNhY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCByZWYgPSB0aGlzLl90ZW1wbGF0ZVJlZi5nZXQoKTtcblx0XHRpZiAoIXJlZikgeyByZXR1cm47IH1cblx0XHR0aGlzLnZpZXdNb2RlbC5sYXN0VGVtcGxhdGVEYXRhLnNldCh7XG5cdFx0XHRjb250ZW50SGVpZ2h0OiByZWYub2JqZWN0LmNvbnRlbnRIZWlnaHQuZ2V0KCksXG5cdFx0XHRzZWxlY3Rpb25zOiByZWYub2JqZWN0LmVkaXRvci5nZXRTZWxlY3Rpb25zKCkgPz8gdW5kZWZpbmVkLFxuXHRcdH0sIHR4KTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuX3RlbXBsYXRlUmVmLmdldCgpO1xuXHRcdGlmICghcmVmKSB7IHJldHVybjsgfVxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVRlbXBsYXRlRGF0YSh0eCk7XG5cdFx0XHRyZWYub2JqZWN0LmhpZGUoKTtcblx0XHRcdHRoaXMuX3RlbXBsYXRlUmVmLnNldCh1bmRlZmluZWQsIHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBoaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzSGlkZGVuLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHVibGljIHJlbmRlcih2ZXJ0aWNhbFNwYWNlOiBPZmZzZXRSYW5nZSwgb2Zmc2V0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIHZpZXdQb3J0OiBPZmZzZXRSYW5nZSk6IHZvaWQge1xuXHRcdHRoaXMuX2lzSGlkZGVuLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblxuXHRcdGxldCByZWYgPSB0aGlzLl90ZW1wbGF0ZVJlZi5nZXQoKTtcblx0XHRpZiAoIXJlZikge1xuXHRcdFx0cmVmID0gdGhpcy5fb2JqZWN0UG9vbC5nZXRVbnVzZWRPYmoobmV3IFRlbXBsYXRlRGF0YSh0aGlzLnZpZXdNb2RlbCwgdGhpcy5fZGVsdGFTY3JvbGxWZXJ0aWNhbCkpO1xuXHRcdFx0dGhpcy5fdGVtcGxhdGVSZWYuc2V0KHJlZiwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHRoaXMudmlld01vZGVsLmxhc3RUZW1wbGF0ZURhdGEuZ2V0KCkuc2VsZWN0aW9ucztcblx0XHRcdGlmIChzZWxlY3Rpb25zKSB7XG5cdFx0XHRcdHJlZi5vYmplY3QuZWRpdG9yLnNldFNlbGVjdGlvbnMoc2VsZWN0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJlZi5vYmplY3QucmVuZGVyKHZlcnRpY2FsU3BhY2UsIHdpZHRoLCBvZmZzZXQsIHZpZXdQb3J0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFvQixXQUFXLEdBQUcsb0NBQW9DO0FBQ3RFLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsV0FBVyx3QkFBd0I7QUFDNUMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxZQUF3QixvQkFBb0I7QUFDckQsU0FBNkMsU0FBUyxrQkFBa0IsU0FBUywyQkFBMkIsbUJBQW1CLHFCQUFxQixp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
