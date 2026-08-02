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
import { localize } from "../../../../../nls.js";
import { $, addDisposableListener, AnimationFrameScheduler, EventType, isHTMLInputElement } from "../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { IQuickInputService, QuickInputHideReason } from "../../../../../platform/quickinput/common/quickInput.js";
import {
  BrowserWidgetLocation
} from "../browserEditor.js";
let BrowserUrlBarWidget = class extends Disposable {
  constructor(_host, _quickInputService) {
    super();
    this._host = _host;
    this._quickInputService = _quickInputService;
    this._urlRenderers = [];
    this._suggestionProviders = [];
    this._pickerActionProviders = [];
    this._picker = this._register(new MutableDisposable());
    this._suppressFocusOpen = false;
    this._suppressBlurRevert = false;
    this._pickerEdited = false;
    this._isSettingPickerValue = false;
    this.element = $(".browser-url-container");
    this._preUrlWidgetsContainer = $(".browser-pre-url-widgets");
    this._urlDisplay = $("div.browser-url-display");
    this._urlDisplay.contentEditable = "plaintext-only";
    this._urlDisplay.spellcheck = false;
    this._urlDisplay.setAttribute("data-placeholder", this._placeholder);
    this._urlBarWidgetsContainer = $(".browser-url-bar-widgets");
    this.element.appendChild(this._preUrlWidgetsContainer);
    this.element.appendChild(this._urlDisplay);
    this.element.appendChild(this._urlBarWidgetsContainer);
    this._registerDisplayListeners();
  }
  /**
   * Notify the URL bar that the canonical URL (model.url) has changed and
   * the display should be re-rendered — unless the user is currently
   * editing, in which case we leave the typed text alone. Also keeps an
   * open picker in sync with the new URL.
   */
  refreshUrl() {
    const isEditing = !!this._picker.value || this._urlDisplay.ownerDocument.activeElement === this._urlDisplay;
    if (!isEditing) {
      this._renderUrl();
    }
    this._urlDisplay.setAttribute("data-placeholder", this._placeholder);
    const picker = this._picker.value;
    if (picker && !this._pickerEdited) {
      this._isSettingPickerValue = true;
      try {
        picker.value = this._canonicalUrl;
      } finally {
        this._isSettingPickerValue = false;
      }
    }
  }
  /**
   * Optimistically render the given URL in the display while a navigation
   * is in flight. Skipped if the user is currently editing (picker open or
   * display focused) so we don't clobber their in-progress text.
   */
  previewUrl(url) {
    const isEditing = !!this._picker.value || this._urlDisplay.ownerDocument.activeElement === this._urlDisplay;
    if (!isEditing) {
      this._renderUrl(url);
    }
  }
  /**
   * Focus the URL display without opening the picker. Used for implicit/auto
   * focus (e.g. landing on a newly opened tab) where the user hasn't asked
   * to edit the URL yet.
   */
  focusUrlInput() {
    this._suppressFocusOpen = true;
    this._urlDisplay.focus();
    this._selectAll();
  }
  /**
   * Open the URL editing picker. Used when the user explicitly asks to
   * edit the URL (e.g. the "Focus URL Input" command / Ctrl+L).
   */
  openUrlPicker() {
    this._openPicker();
  }
  clear() {
    this._renderUrl();
    this._picker.value?.hide();
  }
  mountContributions(contributions) {
    const preUrl = [];
    const postUrl = [];
    for (const contribution of contributions) {
      for (const widget of contribution.widgets) {
        if (widget.location === BrowserWidgetLocation.PreUrl) {
          preUrl.push(widget);
        } else if (widget.location === BrowserWidgetLocation.PostUrl) {
          postUrl.push(widget);
        }
      }
      for (const renderer of contribution.urlRenderers) {
        this._urlRenderers.push(renderer);
        this._register(renderer.onDidChange(() => this._renderUrl()));
      }
      this._suggestionProviders.push(...contribution.urlSuggestionProviders);
      this._pickerActionProviders.push(...contribution.urlPickerActionProviders);
    }
    for (const widget of preUrl.sort((a, b) => a.order - b.order)) {
      this._preUrlWidgetsContainer.appendChild(widget.element);
    }
    for (const widget of postUrl.sort((a, b) => a.order - b.order)) {
      this._urlBarWidgetsContainer.appendChild(widget.element);
    }
    this._suggestionProviders.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this._pickerActionProviders.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this._renderUrl();
  }
  /** The canonical URL: model.url if attached, else the input's initial URL. */
  get _canonicalUrl() {
    return this._host.input?.url ?? "";
  }
  /** Placeholder text for the display and picker (host-provided or default). */
  get _placeholder() {
    return this._host.getPlaceholder?.() ?? localize("browser.urlPlaceholder", "Enter a URL");
  }
  _registerDisplayListeners() {
    let pendingMouseFocus = false;
    this._register(addDisposableListener(this._urlDisplay, EventType.POINTER_DOWN, () => {
      if (this._urlDisplay.ownerDocument.activeElement !== this._urlDisplay) {
        pendingMouseFocus = true;
      }
    }));
    this._register(addDisposableListener(this._urlDisplay, EventType.FOCUS, (event) => {
      if (this._suppressFocusOpen) {
        this._suppressFocusOpen = false;
        pendingMouseFocus = false;
        return;
      }
      if (!(event.relatedTarget instanceof Element) || event.relatedTarget.closest(".quick-input-widget")) {
        return;
      }
      if (pendingMouseFocus) {
        return;
      }
      this._openPicker();
    }));
    this._register(addDisposableListener(this._urlDisplay, EventType.BLUR, () => {
      pendingMouseFocus = false;
      this._urlDisplay.scrollLeft = 0;
      const sel = this._urlDisplay.ownerDocument.getSelection();
      if (sel && sel.anchorNode && this._urlDisplay.contains(sel.anchorNode)) {
        sel.removeAllRanges();
      }
      if (this._picker.value) {
        return;
      }
      if (this._suppressBlurRevert) {
        this._suppressBlurRevert = false;
        return;
      }
      if ((this._urlDisplay.textContent ?? "") !== this._canonicalUrl) {
        this._renderUrl();
      }
    }));
    this._register(addDisposableListener(this._urlDisplay, EventType.CLICK, () => {
      const isMouseFocusClick = pendingMouseFocus;
      pendingMouseFocus = false;
      if (!isMouseFocusClick) {
        return;
      }
      const selection = this._urlDisplay.ownerDocument.getSelection();
      if (selection && !selection.isCollapsed && selection.anchorNode && this._urlDisplay.contains(selection.anchorNode)) {
        return;
      }
      const value = this._urlDisplay.textContent ?? "";
      this._openPicker({ value, selection: [0, value.length], edited: false });
    }));
    this._register(addDisposableListener(this._urlDisplay, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.keyCode === KeyCode.Enter) {
        e.preventDefault();
        const value = this._urlDisplay.textContent?.trim() ?? "";
        if (value) {
          this._suppressBlurRevert = true;
          this._navigateText(value);
          this._host.ensureBrowserFocus();
        }
        return;
      }
      if (event.keyCode === KeyCode.Escape) {
        e.preventDefault();
        this._renderUrl();
        this._host.ensureBrowserFocus();
        return;
      }
      if (event.keyCode === KeyCode.KeyA && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
        e.preventDefault();
        event.stopPropagation();
        this._selectAll();
        return;
      }
    }));
    this._register(addDisposableListener(this._urlDisplay, "input", () => {
      if (this._picker.value) {
        return;
      }
      const value = this._urlDisplay.textContent ?? "";
      const caret = this._getCaretOffset();
      this._openPicker({ value, selection: [caret, caret], edited: true });
    }));
  }
  _selectAll() {
    const doc = this._urlDisplay.ownerDocument;
    const sel = doc.getSelection();
    if (!sel) {
      return;
    }
    const range = doc.createRange();
    range.selectNodeContents(this._urlDisplay);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  /** Character offset of the selection start within the display's text. */
  _getCaretOffset() {
    const doc = this._urlDisplay.ownerDocument;
    const sel = doc.getSelection();
    const total = this._urlDisplay.textContent?.length ?? 0;
    if (!sel || sel.rangeCount === 0) {
      return total;
    }
    const range = sel.getRangeAt(0);
    if (!this._urlDisplay.contains(range.startContainer)) {
      return total;
    }
    const pre = doc.createRange();
    pre.selectNodeContents(this._urlDisplay);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  }
  /** Place the selection at the given character range within the display. */
  _setSelection(start, end, direction = "forward") {
    const doc = this._urlDisplay.ownerDocument;
    const sel = doc.getSelection();
    if (!sel) {
      return;
    }
    const total = this._urlDisplay.textContent?.length ?? 0;
    const s = Math.max(0, Math.min(start, total));
    const e = Math.max(0, Math.min(end, total));
    const startPos = this._offsetToPosition(s);
    const endPos = this._offsetToPosition(e);
    if (direction === "backward") {
      sel.setBaseAndExtent(endPos.node, endPos.offset, startPos.node, startPos.offset);
    } else {
      sel.setBaseAndExtent(startPos.node, startPos.offset, endPos.node, endPos.offset);
    }
  }
  /** Walks the display's text nodes to map a character offset to a (node, offset) DOM position. */
  _offsetToPosition(offset) {
    const walker = this._urlDisplay.ownerDocument.createTreeWalker(this._urlDisplay, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let lastNode = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      lastNode = node;
      if (remaining <= node.data.length) {
        return { node, offset: remaining };
      }
      remaining -= node.data.length;
    }
    if (lastNode) {
      return { node: lastNode, offset: lastNode.data.length };
    }
    return { node: this._urlDisplay, offset: 0 };
  }
  /**
   * Render the given URL (defaults to the canonical URL from the model)
   * into the display. URL renderers are given a chance to decorate it
   * (e.g. red strikethrough on `https:` for cert errors); the first one to
   * claim the render wins. Passing an override lets callers preview an
   * in-progress edit (e.g. the picker mirroring its typed value).
   */
  _renderUrl(override) {
    const url = override ?? this._canonicalUrl;
    this._urlDisplay.textContent = "";
    for (const renderer of this._urlRenderers) {
      if (renderer.render(url, this._urlDisplay)) {
        return;
      }
    }
    if (url) {
      this._urlDisplay.textContent = url;
    }
  }
  /**
   * Build the synchronous primary picker item(s) for the current value: the
   * host's contextual items (e.g. Search and/or Go to), or a plain
   * "Go to <value>" fallback. Provider-contributed suggestions are loaded
   * asynchronously by {@link _loadProviderSuggestions} and appended below.
   */
  _buildSuggestionItems(value) {
    const items = [];
    const trimmed = value.trim();
    if (trimmed) {
      const primaryItems = this._host.getPrimaryActions?.(trimmed) ?? [];
      if (primaryItems.length > 0) {
        items.push(...primaryItems);
      } else {
        items.push({
          id: trimmed,
          label: localize("browser.goTo", "Go to {0}", trimmed),
          iconClass: ThemeIcon.asClassName(Codicon.arrowRight)
        });
      }
    }
    return items;
  }
  /**
   * Navigate from raw text the user committed directly (e.g. Enter on the
   * display, or accepting with no suggestion selected). Routes through the
   * host's default primary item so search-vs-URL resolution stays in the nav
   * bar; falls back to navigating the text as a URL when the host has no
   * primary items.
   */
  _navigateText(text) {
    const input = this._host.input;
    const trimmed = text.trim();
    if (!trimmed || !input) {
      return;
    }
    const primaryItems = this._host.getPrimaryActions?.(trimmed);
    const defaultItem = primaryItems?.[0];
    if (defaultItem?.apply) {
      void Promise.resolve(defaultItem.apply(input));
    } else {
      input.navigate(trimmed);
    }
  }
  /** Convert a provider suggestion to its picker-item representation. */
  _toPickerItem(s) {
    const item = {
      id: s.id,
      label: s.label,
      description: s.description,
      apply: s.apply
    };
    if (s.iconPath) {
      item.iconPath = s.iconPath;
    } else if (s.icon) {
      item.iconClass = ThemeIcon.asClassName(s.icon);
    }
    if (s.actions && s.actions.length > 0) {
      item.buttons = s.actions;
    }
    return item;
  }
  /**
   * Open the URL editing picker anchored to the URL container. While open,
   * the display is hidden (visibility:hidden, to preserve layout) so only
   * the picker is visible.
   *
   * @param initial Optional display state carried into the picker.
   */
  _openPicker(initial) {
    if (this._picker.value) {
      return;
    }
    this._urlDisplay.style.visibility = "hidden";
    const picker = this._quickInputService.createQuickPick({ useSeparators: true });
    picker.placeholder = this._placeholder;
    picker.ignoreFocusOut = false;
    picker.sortByLabel = false;
    picker.matchOnDescription = true;
    picker.anchor = this.element;
    picker.anchorPosition = "overlay";
    picker.filterValue = (filter) => filter.substring(0, 1e3);
    if (initial !== void 0) {
      picker.value = initial.value;
      picker.valueSelection = initial.selection;
    } else {
      picker.value = this._canonicalUrl;
      picker.valueSelection = [0, this._canonicalUrl.length];
    }
    this._pickerEdited = initial?.edited ?? false;
    const disposables = new DisposableStore();
    const providerStates = /* @__PURE__ */ new Map();
    disposables.add(toDisposable(() => {
      for (const state of providerStates.values()) {
        state.cts.value?.cancel();
      }
    }));
    for (const provider of this._suggestionProviders) {
      providerStates.set(provider, {
        suggestions: [],
        cts: disposables.add(new MutableDisposable())
      });
    }
    let currentValue = picker.value;
    const render = (preserveSelection) => {
      const previousActiveId = preserveSelection ? picker.activeItems[0]?.id : void 0;
      const defaultItems = this._buildSuggestionItems(currentValue);
      const items = [...defaultItems];
      for (const provider of this._suggestionProviders) {
        const state = providerStates.get(provider);
        if (!state || state.suggestions.length === 0) {
          continue;
        }
        if (provider.label) {
          items.push({
            type: "separator",
            label: provider.label,
            description: provider.description,
            buttons: provider.actions
          });
        }
        for (const s of state.suggestions) {
          items.push(this._toPickerItem(s));
        }
      }
      picker.items = items;
      const defaultActive = defaultItems.find((i) => i.type !== "separator");
      const restored = previousActiveId !== void 0 ? items.find((i) => i.type !== "separator" && i.id === previousActiveId) : void 0;
      const active = restored ?? defaultActive;
      if (picker.activeItems[0] !== active || picker.activeItems.length !== (active ? 1 : 0)) {
        picker.activeItems = active ? [active] : [];
      }
    };
    const renderScheduler = disposables.add(new AnimationFrameScheduler(this.element, () => render(true)));
    const refreshProvider = (provider) => {
      const state = providerStates.get(provider);
      const input = this._host.input;
      if (!state || !input) {
        return;
      }
      state.cts.value?.cancel();
      const cts = new CancellationTokenSource();
      state.cts.value = cts;
      void provider.getSuggestions({ text: currentValue, input }, cts.token).then(
        (results) => {
          if (cts.token.isCancellationRequested || this._picker.value !== picker) {
            return;
          }
          state.suggestions = results;
          renderScheduler.schedule();
        },
        () => {
        }
      );
    };
    const refreshAllProviders = () => {
      for (const provider of this._suggestionProviders) {
        refreshProvider(provider);
      }
    };
    render(false);
    refreshAllProviders();
    for (const provider of this._suggestionProviders) {
      if (provider.onDidChange) {
        disposables.add(provider.onDidChange(() => refreshProvider(provider)));
      }
    }
    let selectionAtHide;
    disposables.add(picker.onWillHide(() => {
      const active = this._urlDisplay.ownerDocument.activeElement;
      if (isHTMLInputElement(active) && active.selectionStart !== null && active.selectionEnd !== null) {
        selectionAtHide = {
          start: active.selectionStart,
          end: active.selectionEnd,
          direction: active.selectionDirection === "backward" ? "backward" : "forward"
        };
      }
    }));
    disposables.add(picker.onDidChangeValue((value) => {
      if (!this._isSettingPickerValue) {
        this._pickerEdited = true;
      }
      currentValue = value;
      renderScheduler.cancel();
      render(false);
      refreshAllProviders();
      this._renderUrl(value);
    }));
    const refreshButtons = () => {
      const input = this._host.input;
      if (!input) {
        picker.buttons = [];
        return;
      }
      const buttons = [];
      for (const provider of this._pickerActionProviders) {
        buttons.push(...provider.getActions(input));
      }
      picker.buttons = buttons;
    };
    refreshButtons();
    for (const provider of this._pickerActionProviders) {
      if (provider.onDidChange) {
        disposables.add(provider.onDidChange(refreshButtons));
      }
    }
    let actionTaken = false;
    disposables.add(picker.onDidTriggerButton((button) => {
      actionTaken = true;
      const action = button;
      const input = this._host.input;
      if (typeof action.run === "function" && input) {
        void Promise.resolve(action.run(input));
      }
    }));
    disposables.add(picker.onDidTriggerItemButton(({ button }) => {
      const action = button;
      const input = this._host.input;
      if (typeof action.run === "function" && input) {
        void Promise.resolve(action.run(input));
      }
    }));
    disposables.add(picker.onDidTriggerSeparatorButton(({ button }) => {
      const action = button;
      const input = this._host.input;
      if (typeof action.run === "function" && input) {
        void Promise.resolve(action.run(input));
      }
    }));
    disposables.add(picker.onDidAccept(() => {
      actionTaken = true;
      const active = picker.activeItems[0];
      const fallbackUrl = picker.value;
      const input = this._host.input;
      picker.hide();
      if (active?.apply) {
        if (input) {
          void Promise.resolve(active.apply(input));
        }
        return;
      }
      this._navigateText(active?.id ?? fallbackUrl);
    }));
    disposables.add(picker.onDidHide(({ reason }) => {
      this._urlDisplay.style.visibility = "";
      const replaced = this._quickInputService.currentQuickInput !== void 0 && this._quickInputService.currentQuickInput !== picker;
      const refocusDisplay = !actionTaken && reason !== QuickInputHideReason.Blur && !replaced;
      if (refocusDisplay) {
        this._urlDisplay.focus();
        if (selectionAtHide !== void 0) {
          this._setSelection(selectionAtHide.start, selectionAtHide.end, selectionAtHide.direction);
        }
      } else {
        this._renderUrl();
        if (actionTaken) {
          this._host.ensureBrowserFocus();
        }
      }
      disposables.dispose();
      this._pickerEdited = false;
      this._isSettingPickerValue = false;
      this._picker.clear();
    }));
    disposables.add(picker);
    this._picker.value = picker;
    picker.show();
  }
};
BrowserUrlBarWidget = __decorateClass([
  __decorateParam(1, IQuickInputService)
], BrowserUrlBarWidget);
export {
  BrowserUrlBarWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLWJyb3dzZXIvd2lkZ2V0cy9icm93c2VyVXJsQmFyV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBBbmltYXRpb25GcmFtZVNjaGVkdWxlciwgRXZlbnRUeXBlLCBpc0hUTUxJbnB1dEVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2ssIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrU2VwYXJhdG9yLCBRdWlja0lucHV0SGlkZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQge1xuXHRCcm93c2VyRWRpdG9yQ29udHJpYnV0aW9uLFxuXHRCcm93c2VyV2lkZ2V0TG9jYXRpb24sXG5cdElCcm93c2VyRWRpdG9yV2lkZ2V0LFxuXHRJQnJvd3NlclVybFBpY2tlckFjdGlvbixcblx0SUJyb3dzZXJVcmxQaWNrZXJBY3Rpb25Qcm92aWRlcixcblx0SUJyb3dzZXJVcmxSZW5kZXJlcixcblx0SUJyb3dzZXJVcmxTdWdnZXN0aW9uLFxuXHRJQnJvd3NlclVybFN1Z2dlc3Rpb25BY3Rpb24sXG5cdElCcm93c2VyVXJsU3VnZ2VzdGlvblByb3ZpZGVyLFxufSBmcm9tICcuLi9icm93c2VyRWRpdG9yLmpzJztcblxuLyoqXG4gKiBRdWljay1waWNrIGl0ZW0gdXNlZCBieSB0aGUgVVJMIHBpY2tlci4gVGhlIGJ1aWx0LWluIFwiR28gdG9cIiBmYWxsYmFjayBlbnRyeVxuICogbGVhdmVzIHtAbGluayBhcHBseX0gdW5zZXQgYW5kIGlzIGhhbmRsZWQgaW5saW5lOyBob3N0LSBhbmRcbiAqIHByb3ZpZGVyLWNvbnRyaWJ1dGVkIGl0ZW1zIGNhcnJ5IHRoZWlyIG93biB7QGxpbmsgYXBwbHl9IGNhbGxiYWNrIHRoYXQgcnVuc1xuICogYWdhaW5zdCB0aGUgZWRpdG9yJ3MgaW5wdXQuXG4gKi9cbmV4cG9ydCB0eXBlIElVcmxQaWNrZXJJdGVtID0gSVF1aWNrUGlja0l0ZW0gJiB7XG5cdGFwcGx5PyhpbnB1dDogQnJvd3NlckVkaXRvcklucHV0KTogdm9pZCB8IFByb21pc2U8dm9pZD47XG59O1xuXG4vKipcbiAqIFRoZSBtaW5pbWFsIHN1cmZhY2Uge0BsaW5rIEJyb3dzZXJVcmxCYXJXaWRnZXR9IG5lZWRzIGZyb20gaXRzIG93bmluZ1xuICogZWRpdG9yOiB0aGUgY3VycmVudCBicm93c2VyIGlucHV0IChmb3IgdGhlIGNhbm9uaWNhbCBVUkwsIG5hdmlnYXRpb24sIGFuZFxuICogcHJvdmlkZXIgY29udGV4dCkgYW5kIGEgd2F5IHRvIHJlbGVhc2UgZm9jdXMgYmFjayBpbnRvIHRoZSBwYWdlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElCcm93c2VyVXJsQmFySG9zdCB7XG5cdHJlYWRvbmx5IGlucHV0OiBCcm93c2VyRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cdGVuc3VyZUJyb3dzZXJGb2N1cygpOiB2b2lkO1xuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgYnVpbHQtaW4gcHJpbWFyeSBwaWNrZXIgaXRlbShzKSBmb3IgdGhlIGdpdmVuICh0cmltbWVkLFxuXHQgKiBub24tZW1wdHkpIHRleHQuIFRoZSBmaXJzdCBpdGVtIGlzIHRyZWF0ZWQgYXMgdGhlIGRlZmF1bHQgYWN0aW9uIHdoZW5cblx0ICogdGhlIHVzZXIgY29tbWl0cyB0aGUgdGV4dCBkaXJlY3RseSAoZS5nLiBwcmVzc2VzIEVudGVyIHdpdGhvdXQgcGlja2luZyBhXG5cdCAqIHN1Z2dlc3Rpb24pLiBSZXR1cm5pbmcgbXVsdGlwbGUgaXRlbXMgbGV0cyB0aGUgYmFyIG9mZmVyIGEgY2hvaWNlIChlLmcuXG5cdCAqIFNlYXJjaCB0aGVuIEdvIHRvIGZvciBhbWJpZ3VvdXMgaW5wdXQpLiBXaGVuIG9taXR0ZWQgb3IgZW1wdHksIHRoZVxuXHQgKiB3aWRnZXQgZmFsbHMgYmFjayB0byBhIHBsYWluIFwiR28gdG8ge3RleHR9XCIgZW50cnkuXG5cdCAqL1xuXHRnZXRQcmltYXJ5QWN0aW9ucz8odGV4dDogc3RyaW5nKTogcmVhZG9ubHkgSVVybFBpY2tlckl0ZW1bXTtcblx0LyoqXG5cdCAqIFRoZSBwbGFjZWhvbGRlciBzaG93biBpbiB0aGUgVVJMIGRpc3BsYXkgYW5kIHBpY2tlci4gV2hlbiBvbWl0dGVkIHRoZVxuXHQgKiB3aWRnZXQgdXNlcyBhIHBsYWluIFwiRW50ZXIgYSBVUkxcIiBwbGFjZWhvbGRlci5cblx0ICovXG5cdGdldFBsYWNlaG9sZGVyPygpOiBzdHJpbmc7XG59XG5cbi8qKlxuICogVGhlIFVSTCBiYXIgd2lkZ2V0OiBhIGNvbnRlbnRlZGl0YWJsZSBkaXNwbGF5IHNob3dpbmcgdGhlIGN1cnJlbnQgVVJMLFxuICogd2l0aCBhIHF1aWNrLXBpY2sgb3ZlcmxheSBhcyB0aGUgZWRpdGluZyBzdXJmYWNlLiBIb3N0cyBwcmUvcG9zdC1VUkxcbiAqIHdpZGdldCBzbG90cywgVVJMIHJlbmRlcmVycyAoZS5nLiBjZXJ0LWVycm9yIGRlY29yYXRpb24pLCBzdWdnZXN0aW9uXG4gKiBwcm92aWRlcnMsIGFuZCBwZXItcGlja2VyIGNocm9tZSBhY3Rpb24gcHJvdmlkZXJzLlxuICpcbiAqIEVkaXRpbmcgbW9kZWw6XG4gKiAgLSBTdGVhZHkgc3RhdGU6IHtAbGluayBfdXJsRGlzcGxheX0gaXMgYSBgY29udGVudGVkaXRhYmxlYCBkaXYgdGhhdCBob3N0c1xuICogICAgdGhlIFVSTCByZW5kZXJlcnMnIHJpY2ggcmVuZGVyaW5nIGFuZCBhY2NlcHRzIG5hdGl2ZSBpbnB1dCBiZWhhdmlvcnNcbiAqICAgIChjYXJldCwgdHlwaW5nLCBiYWNrc3BhY2UsIHBhc3RlKS5cbiAqICAtIEV4cGxpY2l0IHVzZXIgYWN0aXZhdGlvbiAoY2xpY2svVGFiIG9uIHRoZSBkaXNwbGF5LCB7QGxpbmsgb3BlblVybFBpY2tlcn0sXG4gKiAgICB0eXBpbmcgaW50byB0aGUgZm9jdXNlZCBkaXNwbGF5KTogdGhlIHF1aWNrLXBpY2sgZWRpdGluZyBzdXJmYWNlIG9wZW5zLFxuICogICAgb3ZlcmxheWluZyB0aGUgVVJMIGNvbnRhaW5lciB3aXRoIHN1Z2dlc3Rpb25zLlxuICovXG5leHBvcnQgY2xhc3MgQnJvd3NlclVybEJhcldpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdXJsRGlzcGxheTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZVVybFdpZGdldHNDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF91cmxCYXJXaWRnZXRzQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdXJsUmVuZGVyZXJzOiBJQnJvd3NlclVybFJlbmRlcmVyW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3VnZ2VzdGlvblByb3ZpZGVyczogSUJyb3dzZXJVcmxTdWdnZXN0aW9uUHJvdmlkZXJbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9waWNrZXJBY3Rpb25Qcm92aWRlcnM6IElCcm93c2VyVXJsUGlja2VyQWN0aW9uUHJvdmlkZXJbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9waWNrZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVF1aWNrUGljazxJVXJsUGlja2VySXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+PigpKTtcblxuXHRwcml2YXRlIF9zdXBwcmVzc0ZvY3VzT3BlbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9zdXBwcmVzc0JsdXJSZXZlcnQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfcGlja2VyRWRpdGVkID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzU2V0dGluZ1BpY2tlclZhbHVlID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaG9zdDogSUJyb3dzZXJVcmxCYXJIb3N0LFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZWxlbWVudCA9ICQoJy5icm93c2VyLXVybC1jb250YWluZXInKTtcblx0XHR0aGlzLl9wcmVVcmxXaWRnZXRzQ29udGFpbmVyID0gJCgnLmJyb3dzZXItcHJlLXVybC13aWRnZXRzJyk7XG5cblx0XHQvLyBUaGUgVVJMIGRpc3BsYXkgaXMgYSBjb250ZW50ZWRpdGFibGUgZGl2IHNvIGl0IGJlaGF2ZXMgbGlrZSBhbiBpbnB1dFxuXHRcdC8vIChjYXJldCwgdHlwaW5nLCBiYWNrc3BhY2UsIHBhc3RlKSB3aGlsZSBzdGlsbCBwZXJtaXR0aW5nIGNoaWxkIHNwYW5zIGZvclxuXHRcdC8vIFVSTCByZW5kZXJlciBzdHlsaW5nIChlLmcuIHJlZCBzdHJpa2V0aHJvdWdoIG9uIGBodHRwczpgIGZvciBjZXJ0IGVycm9ycykuXG5cdFx0dGhpcy5fdXJsRGlzcGxheSA9ICQoJ2Rpdi5icm93c2VyLXVybC1kaXNwbGF5Jyk7XG5cdFx0dGhpcy5fdXJsRGlzcGxheS5jb250ZW50RWRpdGFibGUgPSAncGxhaW50ZXh0LW9ubHknO1xuXHRcdHRoaXMuX3VybERpc3BsYXkuc3BlbGxjaGVjayA9IGZhbHNlO1xuXHRcdHRoaXMuX3VybERpc3BsYXkuc2V0QXR0cmlidXRlKCdkYXRhLXBsYWNlaG9sZGVyJywgdGhpcy5fcGxhY2Vob2xkZXIpO1xuXG5cdFx0dGhpcy5fdXJsQmFyV2lkZ2V0c0NvbnRhaW5lciA9ICQoJy5icm93c2VyLXVybC1iYXItd2lkZ2V0cycpO1xuXG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuX3ByZVVybFdpZGdldHNDb250YWluZXIpO1xuXHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLl91cmxEaXNwbGF5KTtcblx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5fdXJsQmFyV2lkZ2V0c0NvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3RlckRpc3BsYXlMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBOb3RpZnkgdGhlIFVSTCBiYXIgdGhhdCB0aGUgY2Fub25pY2FsIFVSTCAobW9kZWwudXJsKSBoYXMgY2hhbmdlZCBhbmRcblx0ICogdGhlIGRpc3BsYXkgc2hvdWxkIGJlIHJlLXJlbmRlcmVkIFx1MjAxNCB1bmxlc3MgdGhlIHVzZXIgaXMgY3VycmVudGx5XG5cdCAqIGVkaXRpbmcsIGluIHdoaWNoIGNhc2Ugd2UgbGVhdmUgdGhlIHR5cGVkIHRleHQgYWxvbmUuIEFsc28ga2VlcHMgYW5cblx0ICogb3BlbiBwaWNrZXIgaW4gc3luYyB3aXRoIHRoZSBuZXcgVVJMLlxuXHQgKi9cblx0cmVmcmVzaFVybCgpOiB2b2lkIHtcblx0XHRjb25zdCBpc0VkaXRpbmcgPSAhIXRoaXMuX3BpY2tlci52YWx1ZSB8fCB0aGlzLl91cmxEaXNwbGF5Lm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gdGhpcy5fdXJsRGlzcGxheTtcblx0XHRpZiAoIWlzRWRpdGluZykge1xuXHRcdFx0dGhpcy5fcmVuZGVyVXJsKCk7XG5cdFx0fVxuXHRcdC8vIEtlZXAgdGhlIHBsYWNlaG9sZGVyIGluIHN5bmMgd2l0aCBob3N0IHN0YXRlIChlLmcuIHNlYXJjaCBlbmFibGVtZW50KS5cblx0XHR0aGlzLl91cmxEaXNwbGF5LnNldEF0dHJpYnV0ZSgnZGF0YS1wbGFjZWhvbGRlcicsIHRoaXMuX3BsYWNlaG9sZGVyKTtcblx0XHRjb25zdCBwaWNrZXIgPSB0aGlzLl9waWNrZXIudmFsdWU7XG5cdFx0aWYgKHBpY2tlciAmJiAhdGhpcy5fcGlja2VyRWRpdGVkKSB7XG5cdFx0XHR0aGlzLl9pc1NldHRpbmdQaWNrZXJWYWx1ZSA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwaWNrZXIudmFsdWUgPSB0aGlzLl9jYW5vbmljYWxVcmw7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9pc1NldHRpbmdQaWNrZXJWYWx1ZSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBPcHRpbWlzdGljYWxseSByZW5kZXIgdGhlIGdpdmVuIFVSTCBpbiB0aGUgZGlzcGxheSB3aGlsZSBhIG5hdmlnYXRpb25cblx0ICogaXMgaW4gZmxpZ2h0LiBTa2lwcGVkIGlmIHRoZSB1c2VyIGlzIGN1cnJlbnRseSBlZGl0aW5nIChwaWNrZXIgb3BlbiBvclxuXHQgKiBkaXNwbGF5IGZvY3VzZWQpIHNvIHdlIGRvbid0IGNsb2JiZXIgdGhlaXIgaW4tcHJvZ3Jlc3MgdGV4dC5cblx0ICovXG5cdHByZXZpZXdVcmwodXJsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBpc0VkaXRpbmcgPSAhIXRoaXMuX3BpY2tlci52YWx1ZSB8fCB0aGlzLl91cmxEaXNwbGF5Lm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gdGhpcy5fdXJsRGlzcGxheTtcblx0XHRpZiAoIWlzRWRpdGluZykge1xuXHRcdFx0dGhpcy5fcmVuZGVyVXJsKHVybCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZvY3VzIHRoZSBVUkwgZGlzcGxheSB3aXRob3V0IG9wZW5pbmcgdGhlIHBpY2tlci4gVXNlZCBmb3IgaW1wbGljaXQvYXV0b1xuXHQgKiBmb2N1cyAoZS5nLiBsYW5kaW5nIG9uIGEgbmV3bHkgb3BlbmVkIHRhYikgd2hlcmUgdGhlIHVzZXIgaGFzbid0IGFza2VkXG5cdCAqIHRvIGVkaXQgdGhlIFVSTCB5ZXQuXG5cdCAqL1xuXHRmb2N1c1VybElucHV0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3N1cHByZXNzRm9jdXNPcGVuID0gdHJ1ZTtcblx0XHR0aGlzLl91cmxEaXNwbGF5LmZvY3VzKCk7XG5cdFx0dGhpcy5fc2VsZWN0QWxsKCk7XG5cdH1cblxuXHQvKipcblx0ICogT3BlbiB0aGUgVVJMIGVkaXRpbmcgcGlja2VyLiBVc2VkIHdoZW4gdGhlIHVzZXIgZXhwbGljaXRseSBhc2tzIHRvXG5cdCAqIGVkaXQgdGhlIFVSTCAoZS5nLiB0aGUgXCJGb2N1cyBVUkwgSW5wdXRcIiBjb21tYW5kIC8gQ3RybCtMKS5cblx0ICovXG5cdG9wZW5VcmxQaWNrZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fb3BlblBpY2tlcigpO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVuZGVyVXJsKCk7XG5cdFx0dGhpcy5fcGlja2VyLnZhbHVlPy5oaWRlKCk7XG5cdH1cblxuXHRtb3VudENvbnRyaWJ1dGlvbnMoY29udHJpYnV0aW9uczogcmVhZG9ubHkgQnJvd3NlckVkaXRvckNvbnRyaWJ1dGlvbltdKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJlVXJsOiBJQnJvd3NlckVkaXRvcldpZGdldFtdID0gW107XG5cdFx0Y29uc3QgcG9zdFVybDogSUJyb3dzZXJFZGl0b3JXaWRnZXRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIGNvbnRyaWJ1dGlvbnMpIHtcblx0XHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIGNvbnRyaWJ1dGlvbi53aWRnZXRzKSB7XG5cdFx0XHRcdGlmICh3aWRnZXQubG9jYXRpb24gPT09IEJyb3dzZXJXaWRnZXRMb2NhdGlvbi5QcmVVcmwpIHtcblx0XHRcdFx0XHRwcmVVcmwucHVzaCh3aWRnZXQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHdpZGdldC5sb2NhdGlvbiA9PT0gQnJvd3NlcldpZGdldExvY2F0aW9uLlBvc3RVcmwpIHtcblx0XHRcdFx0XHRwb3N0VXJsLnB1c2god2lkZ2V0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCByZW5kZXJlciBvZiBjb250cmlidXRpb24udXJsUmVuZGVyZXJzKSB7XG5cdFx0XHRcdHRoaXMuX3VybFJlbmRlcmVycy5wdXNoKHJlbmRlcmVyKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVuZGVyZXIub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fcmVuZGVyVXJsKCkpKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3N1Z2dlc3Rpb25Qcm92aWRlcnMucHVzaCguLi5jb250cmlidXRpb24udXJsU3VnZ2VzdGlvblByb3ZpZGVycyk7XG5cdFx0XHR0aGlzLl9waWNrZXJBY3Rpb25Qcm92aWRlcnMucHVzaCguLi5jb250cmlidXRpb24udXJsUGlja2VyQWN0aW9uUHJvdmlkZXJzKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgcHJlVXJsLnNvcnQoKGEsIGIpID0+IGEub3JkZXIgLSBiLm9yZGVyKSkge1xuXHRcdFx0dGhpcy5fcHJlVXJsV2lkZ2V0c0NvbnRhaW5lci5hcHBlbmRDaGlsZCh3aWRnZXQuZWxlbWVudCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHBvc3RVcmwuc29ydCgoYSwgYikgPT4gYS5vcmRlciAtIGIub3JkZXIpKSB7XG5cdFx0XHR0aGlzLl91cmxCYXJXaWRnZXRzQ29udGFpbmVyLmFwcGVuZENoaWxkKHdpZGdldC5lbGVtZW50KTtcblx0XHR9XG5cdFx0dGhpcy5fc3VnZ2VzdGlvblByb3ZpZGVycy5zb3J0KChhLCBiKSA9PiAoYS5vcmRlciA/PyAwKSAtIChiLm9yZGVyID8/IDApKTtcblx0XHR0aGlzLl9waWNrZXJBY3Rpb25Qcm92aWRlcnMuc29ydCgoYSwgYikgPT4gKGEub3JkZXIgPz8gMCkgLSAoYi5vcmRlciA/PyAwKSk7XG5cdFx0dGhpcy5fcmVuZGVyVXJsKCk7XG5cdH1cblxuXHQvKiogVGhlIGNhbm9uaWNhbCBVUkw6IG1vZGVsLnVybCBpZiBhdHRhY2hlZCwgZWxzZSB0aGUgaW5wdXQncyBpbml0aWFsIFVSTC4gKi9cblx0cHJpdmF0ZSBnZXQgX2Nhbm9uaWNhbFVybCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9ob3N0LmlucHV0Py51cmwgPz8gJyc7XG5cdH1cblxuXHQvKiogUGxhY2Vob2xkZXIgdGV4dCBmb3IgdGhlIGRpc3BsYXkgYW5kIHBpY2tlciAoaG9zdC1wcm92aWRlZCBvciBkZWZhdWx0KS4gKi9cblx0cHJpdmF0ZSBnZXQgX3BsYWNlaG9sZGVyKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvc3QuZ2V0UGxhY2Vob2xkZXI/LigpID8/IGxvY2FsaXplKCdicm93c2VyLnVybFBsYWNlaG9sZGVyJywgXCJFbnRlciBhIFVSTFwiKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyRGlzcGxheUxpc3RlbmVycygpOiB2b2lkIHtcblx0XHQvLyBEaXNwbGF5IGludGVyYWN0aW9uIHN0YXRlIG1hY2hpbmU6XG5cdFx0Ly8gICAtIEtleWJvYXJkIGZvY3VzIChUYWIpIG9wZW5zIHRoZSBwaWNrZXIgaW1tZWRpYXRlbHkuXG5cdFx0Ly8gICAtIE1vdXNlIGZvY3VzIGRlZmVycyB0aGUgZGVjaXNpb24gdG8gYGNsaWNrYCBzbyBkcmFnLXNlbGVjdCBjYW4gY29tcGxldGUuXG5cdFx0Ly8gICAtIEFscmVhZHktZm9jdXNlZCBjbGlja3Mga2VlcCBlZGl0aW5nIGluIHRoZSBkaXNwbGF5IChubyBwaWNrZXIgYXV0by1vcGVuKS5cblx0XHQvLyAgIC0gVHlwaW5nIGludG8gdGhlIGRpc3BsYXkgcHJvbW90ZXMgdGhlIGVkaXQgaW50byB0aGUgcGlja2VyIHZpYSBgaW5wdXRgLlxuXHRcdGxldCBwZW5kaW5nTW91c2VGb2N1cyA9IGZhbHNlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl91cmxEaXNwbGF5LCBFdmVudFR5cGUuUE9JTlRFUl9ET1dOLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdXJsRGlzcGxheS5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgIT09IHRoaXMuX3VybERpc3BsYXkpIHtcblx0XHRcdFx0cGVuZGluZ01vdXNlRm9jdXMgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdXJsRGlzcGxheSwgRXZlbnRUeXBlLkZPQ1VTLCAoZXZlbnQ6IEZvY3VzRXZlbnQpID0+IHtcblx0XHRcdGlmICh0aGlzLl9zdXBwcmVzc0ZvY3VzT3Blbikge1xuXHRcdFx0XHR0aGlzLl9zdXBwcmVzc0ZvY3VzT3BlbiA9IGZhbHNlO1xuXHRcdFx0XHRwZW5kaW5nTW91c2VGb2N1cyA9IGZhbHNlO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBPbmx5IG9wZW4gdGhlIHBpY2tlciBpZiBmb2N1cyBpcyBhbHJlYWR5IHdpdGhpbiB0aGUgd29ya2JlbmNoLCBhbmQgbm90IGJlaW5nIHRyYW5zZmVycmVkIGZyb20gYSBxdWljayBpbnB1dC5cblx0XHRcdGlmICghKGV2ZW50LnJlbGF0ZWRUYXJnZXQgaW5zdGFuY2VvZiBFbGVtZW50KSB8fCBldmVudC5yZWxhdGVkVGFyZ2V0LmNsb3Nlc3QoJy5xdWljay1pbnB1dC13aWRnZXQnKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAocGVuZGluZ01vdXNlRm9jdXMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb3BlblBpY2tlcigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdXJsRGlzcGxheSwgRXZlbnRUeXBlLkJMVVIsICgpID0+IHtcblx0XHRcdHBlbmRpbmdNb3VzZUZvY3VzID0gZmFsc2U7XG5cdFx0XHQvLyBTbmFwIHRoZSBkaXNwbGF5IGJhY2sgdG8gdGhlIHN0YXJ0IG9mIHRoZSBVUkwgc28gaXQgZG9lc24ndCBzdGF5XG5cdFx0XHQvLyBzY3JvbGxlZCB0byB3aGVyZXZlciB0aGUgY2FyZXQgd2FzIChlLmcuIGFmdGVyIGFycm93LWtleWluZyB0b1xuXHRcdFx0Ly8gdGhlIGVuZCBhbmQgdGhlbiBjbGlja2luZyBhd2F5KS5cblx0XHRcdHRoaXMuX3VybERpc3BsYXkuc2Nyb2xsTGVmdCA9IDA7XG5cdFx0XHQvLyBDbGVhciBhbnkgdGV4dCBzZWxlY3Rpb24gd2l0aGluIHRoZSBkaXNwbGF5IHNvIGl0IGRvZXNuJ3Qgc3RheVxuXHRcdFx0Ly8gaGlnaGxpZ2h0ZWQgYWZ0ZXIgZm9jdXMgbW92ZXMgYXdheSAoZS5nLiBpbnRvIHRoZSBicm93c2VyKS5cblx0XHRcdGNvbnN0IHNlbCA9IHRoaXMuX3VybERpc3BsYXkub3duZXJEb2N1bWVudC5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGlmIChzZWwgJiYgc2VsLmFuY2hvck5vZGUgJiYgdGhpcy5fdXJsRGlzcGxheS5jb250YWlucyhzZWwuYW5jaG9yTm9kZSkpIHtcblx0XHRcdFx0c2VsLnJlbW92ZUFsbFJhbmdlcygpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWYgdGhlIHBpY2tlciBpcyBvcGVuIGl0IG93bnMgdGhlIHZhbHVlOyBsZWF2ZSB0aGUgZGlzcGxheSBhbG9uZS5cblx0XHRcdGlmICh0aGlzLl9waWNrZXIudmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gT25lLXNob3QgYnlwYXNzIGFmdGVyIGFuIEVudGVyLWNvbW1pdCBvbiB0aGUgZGlzcGxheToga2VlcCB0aGVcblx0XHRcdC8vIHR5cGVkIHZhbHVlIHZpc2libGUgdW50aWwgdGhlIG5hdmlnYXRpb24gY29tbWl0cy5cblx0XHRcdGlmICh0aGlzLl9zdXBwcmVzc0JsdXJSZXZlcnQpIHtcblx0XHRcdFx0dGhpcy5fc3VwcHJlc3NCbHVyUmV2ZXJ0ID0gZmFsc2U7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIFVzZXIgbGVmdCB0aGUgVVJMIGJhciB3aXRob3V0IG5hdmlnYXRpbmc7IGRpc2NhcmQgYW55IGluLXByb2dyZXNzXG5cdFx0XHQvLyBlZGl0IGFuZCBzbmFwIGJhY2sgdG8gdGhlIGNhbm9uaWNhbCBVUkwuXG5cdFx0XHRpZiAoKHRoaXMuX3VybERpc3BsYXkudGV4dENvbnRlbnQgPz8gJycpICE9PSB0aGlzLl9jYW5vbmljYWxVcmwpIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyVXJsKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl91cmxEaXNwbGF5LCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdGNvbnN0IGlzTW91c2VGb2N1c0NsaWNrID0gcGVuZGluZ01vdXNlRm9jdXM7XG5cdFx0XHRwZW5kaW5nTW91c2VGb2N1cyA9IGZhbHNlO1xuXHRcdFx0aWYgKCFpc01vdXNlRm9jdXNDbGljaykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBQcmVzZXJ2ZSBkcmFnLXNlbGVjdGlvbiBzbyB1c2VycyBjYW4gY29weSBwYXJ0cyBvZiB0aGUgVVJMLlxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fdXJsRGlzcGxheS5vd25lckRvY3VtZW50LmdldFNlbGVjdGlvbigpO1xuXHRcdFx0aWYgKHNlbGVjdGlvbiAmJiAhc2VsZWN0aW9uLmlzQ29sbGFwc2VkICYmIHNlbGVjdGlvbi5hbmNob3JOb2RlICYmIHRoaXMuX3VybERpc3BsYXkuY29udGFpbnMoc2VsZWN0aW9uLmFuY2hvck5vZGUpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIEZpcnN0IGNsaWNrIGFmdGVyIG1vdXNlLWZvY3VzICh3aXRob3V0IGEgZHJhZykgb3BlbnMgdGhlIHBpY2tlciB3aXRoIHRoZSBVUkwgZnVsbHlcblx0XHRcdC8vIHNlbGVjdGVkIChtYXRjaGVzIGJyb3dzZXIgVVJMLWJhciBjb252ZW50aW9uOiBjbGljayBcdTIxOTIgcmVhZHkgdG9cblx0XHRcdC8vIHJldHlwZSB0aGUgd2hvbGUgdGhpbmcpLlxuXHRcdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl91cmxEaXNwbGF5LnRleHRDb250ZW50ID8/ICcnO1xuXHRcdFx0dGhpcy5fb3BlblBpY2tlcih7IHZhbHVlLCBzZWxlY3Rpb246IFswLCB2YWx1ZS5sZW5ndGhdLCBlZGl0ZWQ6IGZhbHNlIH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl91cmxEaXNwbGF5LCBFdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlcikge1xuXHRcdFx0XHQvLyBQcmV2ZW50IGNvbnRlbnRlZGl0YWJsZSBmcm9tIGluc2VydGluZyBhIG5ld2xpbmUuXG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl91cmxEaXNwbGF5LnRleHRDb250ZW50Py50cmltKCkgPz8gJyc7XG5cdFx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRcdC8vIFN1cHByZXNzIHRoZSBuZXh0IEJMVVItcmV2ZXJ0OiB0aGUgdXNlciBjb21taXR0ZWQgdG9cblx0XHRcdFx0XHQvLyB0aGlzIHZhbHVlLCBzbyB3ZSBkb24ndCB3YW50IGl0IGRpc2NhcmRlZCBqdXN0IGJlY2F1c2Vcblx0XHRcdFx0XHQvLyBgbW9kZWwudXJsYCB3b24ndCBjYXRjaCB1cCB1bnRpbCBuYXZpZ2F0aW9uIGNvbW1pdHMuXG5cdFx0XHRcdFx0dGhpcy5fc3VwcHJlc3NCbHVyUmV2ZXJ0ID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9uYXZpZ2F0ZVRleHQodmFsdWUpO1xuXHRcdFx0XHRcdHRoaXMuX2hvc3QuZW5zdXJlQnJvd3NlckZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRXNjYXBlKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0dGhpcy5fcmVuZGVyVXJsKCk7IC8vIHJldmVydCBhbnkgaW4tcHJvZ3Jlc3MgZWRpdFxuXHRcdFx0XHR0aGlzLl9ob3N0LmVuc3VyZUJyb3dzZXJGb2N1cygpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBUaGUgd29ya2JlbmNoIGNhcHR1cmVzIEN0cmwvQ21kK0EgYXMgYSBnbG9iYWwgY29tbWFuZCBiZWZvcmVcblx0XHRcdC8vIGNvbnRlbnRlZGl0YWJsZSBjYW4gaGFuZGxlIGl0LCBzbyBkbyBzZWxlY3QtYWxsIG91cnNlbHZlcy5cblx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLktleUEgJiYgKGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSkgJiYgIWV2ZW50LnNoaWZ0S2V5ICYmICFldmVudC5hbHRLZXkpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fc2VsZWN0QWxsKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBBbnkgZGlyZWN0IGVkaXQgcHJvbW90ZXMgdG8gdGhlIHBpY2tlciwgY2FycnlpbmcgdGhlIHZhbHVlIGFuZCBjYXJldC5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdXJsRGlzcGxheSwgJ2lucHV0JywgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3BpY2tlci52YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX3VybERpc3BsYXkudGV4dENvbnRlbnQgPz8gJyc7XG5cdFx0XHRjb25zdCBjYXJldCA9IHRoaXMuX2dldENhcmV0T2Zmc2V0KCk7XG5cdFx0XHR0aGlzLl9vcGVuUGlja2VyKHsgdmFsdWUsIHNlbGVjdGlvbjogW2NhcmV0LCBjYXJldF0sIGVkaXRlZDogdHJ1ZSB9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZWxlY3RBbGwoKTogdm9pZCB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fdXJsRGlzcGxheS5vd25lckRvY3VtZW50O1xuXHRcdGNvbnN0IHNlbCA9IGRvYy5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoIXNlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByYW5nZSA9IGRvYy5jcmVhdGVSYW5nZSgpO1xuXHRcdHJhbmdlLnNlbGVjdE5vZGVDb250ZW50cyh0aGlzLl91cmxEaXNwbGF5KTtcblx0XHRzZWwucmVtb3ZlQWxsUmFuZ2VzKCk7XG5cdFx0c2VsLmFkZFJhbmdlKHJhbmdlKTtcblx0fVxuXG5cdC8qKiBDaGFyYWN0ZXIgb2Zmc2V0IG9mIHRoZSBzZWxlY3Rpb24gc3RhcnQgd2l0aGluIHRoZSBkaXNwbGF5J3MgdGV4dC4gKi9cblx0cHJpdmF0ZSBfZ2V0Q2FyZXRPZmZzZXQoKTogbnVtYmVyIHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLl91cmxEaXNwbGF5Lm93bmVyRG9jdW1lbnQ7XG5cdFx0Y29uc3Qgc2VsID0gZG9jLmdldFNlbGVjdGlvbigpO1xuXHRcdGNvbnN0IHRvdGFsID0gdGhpcy5fdXJsRGlzcGxheS50ZXh0Q29udGVudD8ubGVuZ3RoID8/IDA7XG5cdFx0aWYgKCFzZWwgfHwgc2VsLnJhbmdlQ291bnQgPT09IDApIHtcblx0XHRcdHJldHVybiB0b3RhbDtcblx0XHR9XG5cdFx0Y29uc3QgcmFuZ2UgPSBzZWwuZ2V0UmFuZ2VBdCgwKTtcblx0XHRpZiAoIXRoaXMuX3VybERpc3BsYXkuY29udGFpbnMocmFuZ2Uuc3RhcnRDb250YWluZXIpKSB7XG5cdFx0XHRyZXR1cm4gdG90YWw7XG5cdFx0fVxuXHRcdGNvbnN0IHByZSA9IGRvYy5jcmVhdGVSYW5nZSgpO1xuXHRcdHByZS5zZWxlY3ROb2RlQ29udGVudHModGhpcy5fdXJsRGlzcGxheSk7XG5cdFx0cHJlLnNldEVuZChyYW5nZS5zdGFydENvbnRhaW5lciwgcmFuZ2Uuc3RhcnRPZmZzZXQpO1xuXHRcdHJldHVybiBwcmUudG9TdHJpbmcoKS5sZW5ndGg7XG5cdH1cblxuXHQvKiogUGxhY2UgdGhlIHNlbGVjdGlvbiBhdCB0aGUgZ2l2ZW4gY2hhcmFjdGVyIHJhbmdlIHdpdGhpbiB0aGUgZGlzcGxheS4gKi9cblx0cHJpdmF0ZSBfc2V0U2VsZWN0aW9uKHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyLCBkaXJlY3Rpb246ICdmb3J3YXJkJyB8ICdiYWNrd2FyZCcgPSAnZm9yd2FyZCcpOiB2b2lkIHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLl91cmxEaXNwbGF5Lm93bmVyRG9jdW1lbnQ7XG5cdFx0Y29uc3Qgc2VsID0gZG9jLmdldFNlbGVjdGlvbigpO1xuXHRcdGlmICghc2VsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRvdGFsID0gdGhpcy5fdXJsRGlzcGxheS50ZXh0Q29udGVudD8ubGVuZ3RoID8/IDA7XG5cdFx0Y29uc3QgcyA9IE1hdGgubWF4KDAsIE1hdGgubWluKHN0YXJ0LCB0b3RhbCkpO1xuXHRcdGNvbnN0IGUgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihlbmQsIHRvdGFsKSk7XG5cdFx0Y29uc3Qgc3RhcnRQb3MgPSB0aGlzLl9vZmZzZXRUb1Bvc2l0aW9uKHMpO1xuXHRcdGNvbnN0IGVuZFBvcyA9IHRoaXMuX29mZnNldFRvUG9zaXRpb24oZSk7XG5cdFx0aWYgKGRpcmVjdGlvbiA9PT0gJ2JhY2t3YXJkJykge1xuXHRcdFx0c2VsLnNldEJhc2VBbmRFeHRlbnQoZW5kUG9zLm5vZGUsIGVuZFBvcy5vZmZzZXQsIHN0YXJ0UG9zLm5vZGUsIHN0YXJ0UG9zLm9mZnNldCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNlbC5zZXRCYXNlQW5kRXh0ZW50KHN0YXJ0UG9zLm5vZGUsIHN0YXJ0UG9zLm9mZnNldCwgZW5kUG9zLm5vZGUsIGVuZFBvcy5vZmZzZXQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBXYWxrcyB0aGUgZGlzcGxheSdzIHRleHQgbm9kZXMgdG8gbWFwIGEgY2hhcmFjdGVyIG9mZnNldCB0byBhIChub2RlLCBvZmZzZXQpIERPTSBwb3NpdGlvbi4gKi9cblx0cHJpdmF0ZSBfb2Zmc2V0VG9Qb3NpdGlvbihvZmZzZXQ6IG51bWJlcik6IHsgbm9kZTogTm9kZTsgb2Zmc2V0OiBudW1iZXIgfSB7XG5cdFx0Y29uc3Qgd2Fsa2VyID0gdGhpcy5fdXJsRGlzcGxheS5vd25lckRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIodGhpcy5fdXJsRGlzcGxheSwgTm9kZUZpbHRlci5TSE9XX1RFWFQpO1xuXHRcdGxldCByZW1haW5pbmcgPSBvZmZzZXQ7XG5cdFx0bGV0IGxhc3ROb2RlOiBUZXh0IHwgbnVsbCA9IG51bGw7XG5cdFx0Zm9yIChsZXQgbm9kZSA9IHdhbGtlci5uZXh0Tm9kZSgpIGFzIFRleHQgfCBudWxsOyBub2RlOyBub2RlID0gd2Fsa2VyLm5leHROb2RlKCkgYXMgVGV4dCB8IG51bGwpIHtcblx0XHRcdGxhc3ROb2RlID0gbm9kZTtcblx0XHRcdGlmIChyZW1haW5pbmcgPD0gbm9kZS5kYXRhLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4geyBub2RlLCBvZmZzZXQ6IHJlbWFpbmluZyB9O1xuXHRcdFx0fVxuXHRcdFx0cmVtYWluaW5nIC09IG5vZGUuZGF0YS5sZW5ndGg7XG5cdFx0fVxuXHRcdGlmIChsYXN0Tm9kZSkge1xuXHRcdFx0cmV0dXJuIHsgbm9kZTogbGFzdE5vZGUsIG9mZnNldDogbGFzdE5vZGUuZGF0YS5sZW5ndGggfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgbm9kZTogdGhpcy5fdXJsRGlzcGxheSwgb2Zmc2V0OiAwIH07XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIHRoZSBnaXZlbiBVUkwgKGRlZmF1bHRzIHRvIHRoZSBjYW5vbmljYWwgVVJMIGZyb20gdGhlIG1vZGVsKVxuXHQgKiBpbnRvIHRoZSBkaXNwbGF5LiBVUkwgcmVuZGVyZXJzIGFyZSBnaXZlbiBhIGNoYW5jZSB0byBkZWNvcmF0ZSBpdFxuXHQgKiAoZS5nLiByZWQgc3RyaWtldGhyb3VnaCBvbiBgaHR0cHM6YCBmb3IgY2VydCBlcnJvcnMpOyB0aGUgZmlyc3Qgb25lIHRvXG5cdCAqIGNsYWltIHRoZSByZW5kZXIgd2lucy4gUGFzc2luZyBhbiBvdmVycmlkZSBsZXRzIGNhbGxlcnMgcHJldmlldyBhblxuXHQgKiBpbi1wcm9ncmVzcyBlZGl0IChlLmcuIHRoZSBwaWNrZXIgbWlycm9yaW5nIGl0cyB0eXBlZCB2YWx1ZSkuXG5cdCAqL1xuXHRwcml2YXRlIF9yZW5kZXJVcmwob3ZlcnJpZGU/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB1cmwgPSBvdmVycmlkZSA/PyB0aGlzLl9jYW5vbmljYWxVcmw7XG5cblx0XHR0aGlzLl91cmxEaXNwbGF5LnRleHRDb250ZW50ID0gJyc7XG5cblx0XHRmb3IgKGNvbnN0IHJlbmRlcmVyIG9mIHRoaXMuX3VybFJlbmRlcmVycykge1xuXHRcdFx0aWYgKHJlbmRlcmVyLnJlbmRlcih1cmwsIHRoaXMuX3VybERpc3BsYXkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodXJsKSB7XG5cdFx0XHR0aGlzLl91cmxEaXNwbGF5LnRleHRDb250ZW50ID0gdXJsO1xuXHRcdH1cblx0XHQvLyBXaGVuIGVtcHR5LCBsZWF2ZSB0ZXh0Q29udGVudCBibGFuazsgQ1NTIGA6ZW1wdHk6OmJlZm9yZWAgc2hvd3MgdGhlIHBsYWNlaG9sZGVyLlxuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkIHRoZSBzeW5jaHJvbm91cyBwcmltYXJ5IHBpY2tlciBpdGVtKHMpIGZvciB0aGUgY3VycmVudCB2YWx1ZTogdGhlXG5cdCAqIGhvc3QncyBjb250ZXh0dWFsIGl0ZW1zIChlLmcuIFNlYXJjaCBhbmQvb3IgR28gdG8pLCBvciBhIHBsYWluXG5cdCAqIFwiR28gdG8gPHZhbHVlPlwiIGZhbGxiYWNrLiBQcm92aWRlci1jb250cmlidXRlZCBzdWdnZXN0aW9ucyBhcmUgbG9hZGVkXG5cdCAqIGFzeW5jaHJvbm91c2x5IGJ5IHtAbGluayBfbG9hZFByb3ZpZGVyU3VnZ2VzdGlvbnN9IGFuZCBhcHBlbmRlZCBiZWxvdy5cblx0ICovXG5cdHByaXZhdGUgX2J1aWxkU3VnZ2VzdGlvbkl0ZW1zKHZhbHVlOiBzdHJpbmcpOiAoSVVybFBpY2tlckl0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdIHtcblx0XHRjb25zdCBpdGVtczogKElVcmxQaWNrZXJJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtdO1xuXHRcdGNvbnN0IHRyaW1tZWQgPSB2YWx1ZS50cmltKCk7XG5cdFx0aWYgKHRyaW1tZWQpIHtcblx0XHRcdGNvbnN0IHByaW1hcnlJdGVtcyA9IHRoaXMuX2hvc3QuZ2V0UHJpbWFyeUFjdGlvbnM/Lih0cmltbWVkKSA/PyBbXTtcblx0XHRcdGlmIChwcmltYXJ5SXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRpdGVtcy5wdXNoKC4uLnByaW1hcnlJdGVtcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRpZDogdHJpbW1lZCxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Jyb3dzZXIuZ29UbycsIFwiR28gdG8gezB9XCIsIHRyaW1tZWQpLFxuXHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uYXJyb3dSaWdodCksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaXRlbXM7XG5cdH1cblxuXHQvKipcblx0ICogTmF2aWdhdGUgZnJvbSByYXcgdGV4dCB0aGUgdXNlciBjb21taXR0ZWQgZGlyZWN0bHkgKGUuZy4gRW50ZXIgb24gdGhlXG5cdCAqIGRpc3BsYXksIG9yIGFjY2VwdGluZyB3aXRoIG5vIHN1Z2dlc3Rpb24gc2VsZWN0ZWQpLiBSb3V0ZXMgdGhyb3VnaCB0aGVcblx0ICogaG9zdCdzIGRlZmF1bHQgcHJpbWFyeSBpdGVtIHNvIHNlYXJjaC12cy1VUkwgcmVzb2x1dGlvbiBzdGF5cyBpbiB0aGUgbmF2XG5cdCAqIGJhcjsgZmFsbHMgYmFjayB0byBuYXZpZ2F0aW5nIHRoZSB0ZXh0IGFzIGEgVVJMIHdoZW4gdGhlIGhvc3QgaGFzIG5vXG5cdCAqIHByaW1hcnkgaXRlbXMuXG5cdCAqL1xuXHRwcml2YXRlIF9uYXZpZ2F0ZVRleHQodGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5wdXQgPSB0aGlzLl9ob3N0LmlucHV0O1xuXHRcdGNvbnN0IHRyaW1tZWQgPSB0ZXh0LnRyaW0oKTtcblx0XHRpZiAoIXRyaW1tZWQgfHwgIWlucHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHByaW1hcnlJdGVtcyA9IHRoaXMuX2hvc3QuZ2V0UHJpbWFyeUFjdGlvbnM/Lih0cmltbWVkKTtcblx0XHRjb25zdCBkZWZhdWx0SXRlbSA9IHByaW1hcnlJdGVtcz8uWzBdO1xuXHRcdGlmIChkZWZhdWx0SXRlbT8uYXBwbHkpIHtcblx0XHRcdHZvaWQgUHJvbWlzZS5yZXNvbHZlKGRlZmF1bHRJdGVtLmFwcGx5KGlucHV0KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlucHV0Lm5hdmlnYXRlKHRyaW1tZWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBDb252ZXJ0IGEgcHJvdmlkZXIgc3VnZ2VzdGlvbiB0byBpdHMgcGlja2VyLWl0ZW0gcmVwcmVzZW50YXRpb24uICovXG5cdHByaXZhdGUgX3RvUGlja2VySXRlbShzOiBJQnJvd3NlclVybFN1Z2dlc3Rpb24pOiBJVXJsUGlja2VySXRlbSB7XG5cdFx0Y29uc3QgaXRlbTogSVVybFBpY2tlckl0ZW0gPSB7XG5cdFx0XHRpZDogcy5pZCxcblx0XHRcdGxhYmVsOiBzLmxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb246IHMuZGVzY3JpcHRpb24sXG5cdFx0XHRhcHBseTogcy5hcHBseSxcblx0XHR9O1xuXHRcdGlmIChzLmljb25QYXRoKSB7XG5cdFx0XHRpdGVtLmljb25QYXRoID0gcy5pY29uUGF0aDtcblx0XHR9IGVsc2UgaWYgKHMuaWNvbikge1xuXHRcdFx0aXRlbS5pY29uQ2xhc3MgPSBUaGVtZUljb24uYXNDbGFzc05hbWUocy5pY29uKTtcblx0XHR9XG5cdFx0aWYgKHMuYWN0aW9ucyAmJiBzLmFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Ly8gUGVyLWl0ZW0gYnV0dG9ucy4gV2UgcGFzcyB0aGUgYWN0aW9uIG9iamVjdHMgdGhyb3VnaCBkaXJlY3RseVxuXHRcdFx0Ly8gc28gb25EaWRUcmlnZ2VySXRlbUJ1dHRvbiBoYW5kcyB0aGVtIGJhY2sgdG8gdXMgYXMgdGhlIElCcm93c2VyVXJsU3VnZ2VzdGlvbkFjdGlvbi5cblx0XHRcdGl0ZW0uYnV0dG9ucyA9IHMuYWN0aW9ucztcblx0XHR9XG5cdFx0cmV0dXJuIGl0ZW07XG5cdH1cblxuXHQvKipcblx0ICogT3BlbiB0aGUgVVJMIGVkaXRpbmcgcGlja2VyIGFuY2hvcmVkIHRvIHRoZSBVUkwgY29udGFpbmVyLiBXaGlsZSBvcGVuLFxuXHQgKiB0aGUgZGlzcGxheSBpcyBoaWRkZW4gKHZpc2liaWxpdHk6aGlkZGVuLCB0byBwcmVzZXJ2ZSBsYXlvdXQpIHNvIG9ubHlcblx0ICogdGhlIHBpY2tlciBpcyB2aXNpYmxlLlxuXHQgKlxuXHQgKiBAcGFyYW0gaW5pdGlhbCBPcHRpb25hbCBkaXNwbGF5IHN0YXRlIGNhcnJpZWQgaW50byB0aGUgcGlja2VyLlxuXHQgKi9cblx0cHJpdmF0ZSBfb3BlblBpY2tlcihpbml0aWFsPzogeyB2YWx1ZTogc3RyaW5nOyBzZWxlY3Rpb246IFtudW1iZXIsIG51bWJlcl07IGVkaXRlZDogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3BpY2tlci52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEhpZGUgdGhlIGRpc3BsYXkgd2hpbGUgdGhlIHBpY2tlciBpcyB0aGUgZWRpdGluZyBVSSAodmlzaWJpbGl0eTpoaWRkZW5cblx0XHQvLyBrZWVwcyB0aGUgbmF2YmFyIGxheW91dCBzdGFibGUgd2hpbGUgdGhlIHBpY2tlciBvdmVybGF5cykuXG5cdFx0dGhpcy5fdXJsRGlzcGxheS5zdHlsZS52aXNpYmlsaXR5ID0gJ2hpZGRlbic7XG5cblx0XHRjb25zdCBwaWNrZXIgPSB0aGlzLl9xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVVybFBpY2tlckl0ZW0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSB0aGlzLl9wbGFjZWhvbGRlcjtcblx0XHRwaWNrZXIuaWdub3JlRm9jdXNPdXQgPSBmYWxzZTtcblx0XHQvLyBQcmVzZXJ2ZSB0aGUgb3JkZXIgcHJvZHVjZWQgYnkgX2J1aWxkU3VnZ2VzdGlvbkl0ZW1zIChHbyB0byBmaXJzdCwgdGhlblxuXHRcdC8vIHRhYnMgaW4ga25vd24tdmlldyBvcmRlcikgc28gdGhlIFwiR28gdG9cIiBlbnRyeSBpcyBhbHdheXMgdGhlIHBpY2tlcidzXG5cdFx0Ly8gbmF0dXJhbCBhY3RpdmUgaXRlbSBhbmQgdGFiIGVudHJpZXMgYXJlIG5ldmVyIGF1dG8tc2VsZWN0ZWQuXG5cdFx0cGlja2VyLnNvcnRCeUxhYmVsID0gZmFsc2U7XG5cdFx0cGlja2VyLm1hdGNoT25EZXNjcmlwdGlvbiA9IHRydWU7XG5cdFx0cGlja2VyLmFuY2hvciA9IHRoaXMuZWxlbWVudDtcblx0XHRwaWNrZXIuYW5jaG9yUG9zaXRpb24gPSAnb3ZlcmxheSc7XG5cdFx0Ly8gUHV0IGEgY2FwIG9uIHRoZSBzdHJpbmcgbGVuZ3RoIHVzZWQgZm9yIGZpbHRlcmluZyB0byBhdm9pZCBwZXJmb3JtYW5jZSBpc3N1ZXMuXG5cdFx0cGlja2VyLmZpbHRlclZhbHVlID0gKGZpbHRlcikgPT4gZmlsdGVyLnN1YnN0cmluZygwLCAxMDAwKTtcblx0XHRpZiAoaW5pdGlhbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRwaWNrZXIudmFsdWUgPSBpbml0aWFsLnZhbHVlO1xuXHRcdFx0cGlja2VyLnZhbHVlU2VsZWN0aW9uID0gaW5pdGlhbC5zZWxlY3Rpb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBpY2tlci52YWx1ZSA9IHRoaXMuX2Nhbm9uaWNhbFVybDtcblx0XHRcdHBpY2tlci52YWx1ZVNlbGVjdGlvbiA9IFswLCB0aGlzLl9jYW5vbmljYWxVcmwubGVuZ3RoXTtcblx0XHR9XG5cdFx0dGhpcy5fcGlja2VyRWRpdGVkID0gaW5pdGlhbD8uZWRpdGVkID8/IGZhbHNlO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gRWFjaCBwcm92aWRlciBrZWVwcyBpdHMgb3duIGNhY2hlZCBzdWdnZXN0aW9ucyArIGNhbmNlbGxhdGlvbiBzbyBhXG5cdFx0Ly8gc2luZ2xlIHByb3ZpZGVyJ3Mgb25EaWRDaGFuZ2UgKG9yIGEgcGVyLXByb3ZpZGVyIHJlLWZldGNoKSB1cGRhdGVzXG5cdFx0Ly8ganVzdCB0aGF0IGdyb3VwLCB3aXRob3V0IHJlY29tcHV0aW5nIHRoZSByZXN0LiBDYW5jZWxsYXRpb24gdG9rZW5zXG5cdFx0Ly8gKG5vdCBqdXN0IGRpc3Bvc2FsKSBhcmUgbmVlZGVkIHNvIGFuIGluLWZsaWdodCBgLnRoZW5gIGZvciB0aGVcblx0XHQvLyBwcmV2aW91cyByZXF1ZXN0IGRvZXNuJ3Qgb3ZlcndyaXRlIG5ld2VyIGNhY2hlZCByZXN1bHRzLlxuXHRcdHR5cGUgUHJvdmlkZXJTdGF0ZSA9IHtcblx0XHRcdHN1Z2dlc3Rpb25zOiByZWFkb25seSBJQnJvd3NlclVybFN1Z2dlc3Rpb25bXTtcblx0XHRcdGN0czogTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+O1xuXHRcdH07XG5cdFx0Y29uc3QgcHJvdmlkZXJTdGF0ZXMgPSBuZXcgTWFwPElCcm93c2VyVXJsU3VnZ2VzdGlvblByb3ZpZGVyLCBQcm92aWRlclN0YXRlPigpO1xuXHRcdC8vIFJlZ2lzdGVyIHRoZSBjYW5jZWxsYXRpb24gaG9vayBiZWZvcmUgdGhlIHBlci1wcm92aWRlciBNdXRhYmxlRGlzcG9zYWJsZXNcblx0XHQvLyBzbyBpdCBydW5zIGZpcnN0IG9uIHBpY2tlciBjbG9zZS4gYENhbmNlbGxhdGlvblRva2VuU291cmNlLmRpc3Bvc2UoKWBcblx0XHQvLyBvbmx5IHJlbGVhc2VzIGludGVybmFsIHN0YXRlIFx1MjAxNCBpdCBkb2VzIE5PVCBjYW5jZWwgXHUyMDE0IHNvIHdpdGhvdXQgdGhpcyxcblx0XHQvLyBpbi1mbGlnaHQgcHJvdmlkZXIgcmVxdWVzdHMgd291bGQga2VlcCBydW5uaW5nIGFmdGVyIHRoZSBwaWNrZXIgaXMgZ29uZS5cblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3Qgc3RhdGUgb2YgcHJvdmlkZXJTdGF0ZXMudmFsdWVzKCkpIHtcblx0XHRcdFx0c3RhdGUuY3RzLnZhbHVlPy5jYW5jZWwoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLl9zdWdnZXN0aW9uUHJvdmlkZXJzKSB7XG5cdFx0XHRwcm92aWRlclN0YXRlcy5zZXQocHJvdmlkZXIsIHtcblx0XHRcdFx0c3VnZ2VzdGlvbnM6IFtdLFxuXHRcdFx0XHRjdHM6IGRpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0bGV0IGN1cnJlbnRWYWx1ZSA9IHBpY2tlci52YWx1ZTtcblxuXHRcdC8vIFJlYnVpbGQgYHBpY2tlci5pdGVtc2AgZnJvbSB0aGUgc3luY2hyb25vdXMgXCJHbyB0b1wiIGVudHJ5IHBsdXMgZWFjaFxuXHRcdC8vIHByb3ZpZGVyJ3MgY3VycmVudCBjYWNoZWQgc3VnZ2VzdGlvbnMsIGluIHByb3ZpZGVyIHNvcnQgb3JkZXIuXG5cdFx0Ly9cblx0XHQvLyBgcHJlc2VydmVTZWxlY3Rpb25gIGRpc3Rpbmd1aXNoZXMgdGhlIHR3byByZS1yZW5kZXIgdHJpZ2dlcnM6XG5cdFx0Ly8gIC0gVXNlciB0eXBpbmcgKGBmYWxzZWApOiByZXNldCB0aGUgYWN0aXZlIGl0ZW0gdG8gdGhlIGRlZmF1bHRcblx0XHQvLyAgICBcIkdvIHRvXCIgZW50cnkuIFN0YXJ0aW5nL2NvbnRpbnVpbmcgYSBxdWVyeSBzaG91bGQgYWx3YXlzIGRlZmF1bHRcblx0XHQvLyAgICBiYWNrIHRvIFwiR28gdG9cIiByYXRoZXIgdGhhbiBzdGlja2luZyBvbiBhIHN0cmVhbWVkLWluIHN1Z2dlc3Rpb24uXG5cdFx0Ly8gIC0gQmFja2dyb3VuZCBwcm92aWRlciByZWZyZXNoIChgdHJ1ZWApOiBrZWVwIHRoZSB1c2VyJ3MgY3VycmVudFxuXHRcdC8vICAgIHNlbGVjdGlvbiAoZS5nLiBhbiBhcnJvdy1rZXllZCBzdWdnZXN0aW9uKSBzbyB1cGRhdGluZyBvbmVcblx0XHQvLyAgICBwcm92aWRlcidzIHJlc3VsdHMgKGEgdGFiIG9wZW5pbmcvY2xvc2luZykgZG9lc24ndCB5YW5rIGZvY3VzXG5cdFx0Ly8gICAgYmFjayB0byBcIkdvIHRvXCIuXG5cdFx0Ly9cblx0XHQvLyBUaGUgYWN0aXZlIGl0ZW0gaXMgc2V0IGV4cGxpY2l0bHkgcmF0aGVyIHRoYW4gcmVseWluZyBvbiB0aGUgcXVpY2tcblx0XHQvLyBwaWNrJ3MgaW1wbGljaXQgZmlyc3Qtcm93IHNlbGVjdGlvbiwgd2hpY2ggY2FuIG90aGVyd2lzZSBsYW5kIG9uIGFcblx0XHQvLyBzdWdnZXN0aW9uIGFzIGFzeW5jaHJvbm91cyByZXN1bHRzIHN0cmVhbSBpbi5cblx0XHRjb25zdCByZW5kZXIgPSAocHJlc2VydmVTZWxlY3Rpb246IGJvb2xlYW4pID0+IHtcblx0XHRcdGNvbnN0IHByZXZpb3VzQWN0aXZlSWQgPSBwcmVzZXJ2ZVNlbGVjdGlvbiA/IHBpY2tlci5hY3RpdmVJdGVtc1swXT8uaWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBkZWZhdWx0SXRlbXMgPSB0aGlzLl9idWlsZFN1Z2dlc3Rpb25JdGVtcyhjdXJyZW50VmFsdWUpO1xuXHRcdFx0Y29uc3QgaXRlbXM6IChJVXJsUGlja2VySXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gPSBbLi4uZGVmYXVsdEl0ZW1zXTtcblx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fc3VnZ2VzdGlvblByb3ZpZGVycykge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHByb3ZpZGVyU3RhdGVzLmdldChwcm92aWRlcik7XG5cdFx0XHRcdGlmICghc3RhdGUgfHwgc3RhdGUuc3VnZ2VzdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHByb3ZpZGVyLmxhYmVsKSB7XG5cdFx0XHRcdFx0Ly8gYGJ1dHRvbnM6IFtdYCBvcHRzIHRoZSBzZXBhcmF0b3IgaW50byBiZWluZyByZW5kZXJlZCBhc1xuXHRcdFx0XHRcdC8vIGl0cyBvd24gcm93IChhIHNlcGFyYXRvciB3aXRob3V0IGJ1dHRvbnMgaXMgb3RoZXJ3aXNlXG5cdFx0XHRcdFx0Ly8gY29sbGFwc2VkIGludG8gdGhlIGZpcnN0IGl0ZW0gYmVsb3cgaXQgYXMgYSBoZWFkZXIpLlxuXHRcdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3NlcGFyYXRvcicsXG5cdFx0XHRcdFx0XHRsYWJlbDogcHJvdmlkZXIubGFiZWwsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogcHJvdmlkZXIuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRidXR0b25zOiBwcm92aWRlci5hY3Rpb25zLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgcyBvZiBzdGF0ZS5zdWdnZXN0aW9ucykge1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2godGhpcy5fdG9QaWNrZXJJdGVtKHMpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cGlja2VyLml0ZW1zID0gaXRlbXM7XG5cblx0XHRcdC8vIE9ubHkgdGhlIHN5bmNocm9ub3VzIGl0ZW1zIGZyb20gYF9idWlsZFN1Z2dlc3Rpb25JdGVtc2AgKGUuZy4gdGhlXG5cdFx0XHQvLyBcIkdvIHRvXCIgZW50cnkpIGFyZSBlbGlnaWJsZSBmb3IgZGVmYXVsdCBmb2N1czsgcHJvdmlkZXIgc3VnZ2VzdGlvbnNcblx0XHRcdC8vIGFyZSBuZXZlciBhdXRvLWZvY3VzZWQuIFJlc3RvcmUgdGhlIHByaW9yIHNlbGVjdGlvbiBvbiBhIGJhY2tncm91bmRcblx0XHRcdC8vIHJlZnJlc2g7IG90aGVyd2lzZSAodHlwaW5nLCBvciB0aGUgcHJpb3IgaXRlbSBkaXNhcHBlYXJlZCkgZmFsbCBiYWNrXG5cdFx0XHQvLyB0byB0aGUgZmlyc3QgZGVmYXVsdCBpdGVtLCBvciB0byBub3RoaW5nIHdoZW4gdGhlcmUgYXJlIG5vbmUuXG5cdFx0XHRjb25zdCBkZWZhdWx0QWN0aXZlID0gZGVmYXVsdEl0ZW1zLmZpbmQoKGkpOiBpIGlzIElVcmxQaWNrZXJJdGVtID0+IGkudHlwZSAhPT0gJ3NlcGFyYXRvcicpO1xuXHRcdFx0Y29uc3QgcmVzdG9yZWQgPSBwcmV2aW91c0FjdGl2ZUlkICE9PSB1bmRlZmluZWRcblx0XHRcdFx0PyBpdGVtcy5maW5kKChpKTogaSBpcyBJVXJsUGlja2VySXRlbSA9PiBpLnR5cGUgIT09ICdzZXBhcmF0b3InICYmIGkuaWQgPT09IHByZXZpb3VzQWN0aXZlSWQpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgYWN0aXZlID0gcmVzdG9yZWQgPz8gZGVmYXVsdEFjdGl2ZTtcblx0XHRcdGlmIChwaWNrZXIuYWN0aXZlSXRlbXNbMF0gIT09IGFjdGl2ZSB8fCBwaWNrZXIuYWN0aXZlSXRlbXMubGVuZ3RoICE9PSAoYWN0aXZlID8gMSA6IDApKSB7XG5cdFx0XHRcdHBpY2tlci5hY3RpdmVJdGVtcyA9IGFjdGl2ZSA/IFthY3RpdmVdIDogW107XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlbmRlclNjaGVkdWxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQW5pbWF0aW9uRnJhbWVTY2hlZHVsZXIodGhpcy5lbGVtZW50LCAoKSA9PiByZW5kZXIodHJ1ZSkpKTtcblxuXHRcdGNvbnN0IHJlZnJlc2hQcm92aWRlciA9IChwcm92aWRlcjogSUJyb3dzZXJVcmxTdWdnZXN0aW9uUHJvdmlkZXIpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gcHJvdmlkZXJTdGF0ZXMuZ2V0KHByb3ZpZGVyKTtcblx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy5faG9zdC5pbnB1dDtcblx0XHRcdGlmICghc3RhdGUgfHwgIWlucHV0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHN0YXRlLmN0cy52YWx1ZT8uY2FuY2VsKCk7XG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHN0YXRlLmN0cy52YWx1ZSA9IGN0cztcblx0XHRcdHZvaWQgcHJvdmlkZXIuZ2V0U3VnZ2VzdGlvbnMoeyB0ZXh0OiBjdXJyZW50VmFsdWUsIGlucHV0IH0sIGN0cy50b2tlbikudGhlbihcblx0XHRcdFx0cmVzdWx0cyA9PiB7XG5cdFx0XHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCB0aGlzLl9waWNrZXIudmFsdWUgIT09IHBpY2tlcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzdGF0ZS5zdWdnZXN0aW9ucyA9IHJlc3VsdHM7XG5cdFx0XHRcdFx0cmVuZGVyU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCgpID0+IHsgLyoga2VlcCBwcmlvciBjYWNoZWQgc3VnZ2VzdGlvbnMgb24gZXJyb3IgKi8gfVxuXHRcdFx0KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVmcmVzaEFsbFByb3ZpZGVycyA9ICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fc3VnZ2VzdGlvblByb3ZpZGVycykge1xuXHRcdFx0XHRyZWZyZXNoUHJvdmlkZXIocHJvdmlkZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyZW5kZXIoZmFsc2UpO1xuXHRcdHJlZnJlc2hBbGxQcm92aWRlcnMoKTtcblxuXHRcdC8vIFBlci1wcm92aWRlciBzdGF0ZSBjaGFuZ2U6IHJlZnJlc2ggb25seSB0aGF0IHByb3ZpZGVyIHNvIHVucmVsYXRlZFxuXHRcdC8vIGdyb3VwcyBrZWVwIHRoZWlyIGNhY2hlZCBzdWdnZXN0aW9ucyBhbmQgc2VsZWN0aW9uLlxuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fc3VnZ2VzdGlvblByb3ZpZGVycykge1xuXHRcdFx0aWYgKHByb3ZpZGVyLm9uRGlkQ2hhbmdlKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZSgoKSA9PiByZWZyZXNoUHJvdmlkZXIocHJvdmlkZXIpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2FwdHVyZSB0aGUgcGlja2VyJ3Mgc2VsZWN0aW9uIGp1c3QgYmVmb3JlIGl0IGhpZGVzIHNvIHdlIGNhbiByZXN0b3JlIGl0XG5cdFx0Ly8gb24gdGhlIGRpc3BsYXkgd2hlbiBmb2N1cyByZXR1cm5zIHRoZXJlIChlLmcuIEVzY2FwZSkuXG5cdFx0bGV0IHNlbGVjdGlvbkF0SGlkZTogeyBzdGFydDogbnVtYmVyOyBlbmQ6IG51bWJlcjsgZGlyZWN0aW9uOiAnZm9yd2FyZCcgfCAnYmFja3dhcmQnIH0gfCB1bmRlZmluZWQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbldpbGxIaWRlKCgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZSA9IHRoaXMuX3VybERpc3BsYXkub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuXHRcdFx0aWYgKGlzSFRNTElucHV0RWxlbWVudChhY3RpdmUpICYmIGFjdGl2ZS5zZWxlY3Rpb25TdGFydCAhPT0gbnVsbCAmJiBhY3RpdmUuc2VsZWN0aW9uRW5kICE9PSBudWxsKSB7XG5cdFx0XHRcdHNlbGVjdGlvbkF0SGlkZSA9IHtcblx0XHRcdFx0XHRzdGFydDogYWN0aXZlLnNlbGVjdGlvblN0YXJ0LFxuXHRcdFx0XHRcdGVuZDogYWN0aXZlLnNlbGVjdGlvbkVuZCxcblx0XHRcdFx0XHRkaXJlY3Rpb246IGFjdGl2ZS5zZWxlY3Rpb25EaXJlY3Rpb24gPT09ICdiYWNrd2FyZCcgPyAnYmFja3dhcmQnIDogJ2ZvcndhcmQnLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQ2hhbmdlVmFsdWUodmFsdWUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9pc1NldHRpbmdQaWNrZXJWYWx1ZSkge1xuXHRcdFx0XHR0aGlzLl9waWNrZXJFZGl0ZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudFZhbHVlID0gdmFsdWU7XG5cdFx0XHRyZW5kZXJTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0XHRyZW5kZXIoZmFsc2UpO1xuXHRcdFx0cmVmcmVzaEFsbFByb3ZpZGVycygpO1xuXHRcdFx0Ly8gTWlycm9yIHRoZSBwaWNrZXIncyB0eXBlZCB2YWx1ZSBpbnRvIHRoZSBkaXNwbGF5IGNvbnRpbnVvdXNseSxcblx0XHRcdC8vIHJ1bm5pbmcgVVJMIHJlbmRlcmVycyBzbyBkZWNvcmF0aW9ucyBzdGF5IGxpdmUuIFRoZSBwaWNrZXIgaXNcblx0XHRcdC8vIHRoZSBzb3VyY2Ugb2YgdHJ1dGggd2hpbGUgaXQncyBvcGVuLlxuXHRcdFx0dGhpcy5fcmVuZGVyVXJsKHZhbHVlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBNb3VudCBwcm92aWRlci1jb250cmlidXRlZCBwaWNrZXIgYWN0aW9ucy5cblx0XHQvLyBSZS1idWlsZCBidXR0b25zIHdoZW5ldmVyIGFueSBwcm92aWRlciByZXBvcnRzIGEgc3RhdGUgY2hhbmdlIHNvXG5cdFx0Ly8gZHluYW1pYyBhY3Rpb25zICh0b2dnbGVzLCBjb25kaXRpb25hbCBidXR0b25zKSBzdGF5IGluIHN5bmMuXG5cdFx0Y29uc3QgcmVmcmVzaEJ1dHRvbnMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHRoaXMuX2hvc3QuaW5wdXQ7XG5cdFx0XHRpZiAoIWlucHV0KSB7XG5cdFx0XHRcdHBpY2tlci5idXR0b25zID0gW107XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJ1dHRvbnM6IElCcm93c2VyVXJsUGlja2VyQWN0aW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fcGlja2VyQWN0aW9uUHJvdmlkZXJzKSB7XG5cdFx0XHRcdGJ1dHRvbnMucHVzaCguLi5wcm92aWRlci5nZXRBY3Rpb25zKGlucHV0KSk7XG5cdFx0XHR9XG5cdFx0XHRwaWNrZXIuYnV0dG9ucyA9IGJ1dHRvbnM7XG5cdFx0fTtcblx0XHRyZWZyZXNoQnV0dG9ucygpO1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fcGlja2VyQWN0aW9uUHJvdmlkZXJzKSB7XG5cdFx0XHRpZiAocHJvdmlkZXIub25EaWRDaGFuZ2UpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlKHJlZnJlc2hCdXR0b25zKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFRyYWNrIHdoZXRoZXIgYW4gYWN0aW9uIHdhcyB0YWtlbiBpbnNpZGUgdGhlIHBpY2tlciAoYWNjZXB0IC8gYnV0dG9uXG5cdFx0Ly8gY2xpY2spLiBPbiBoaWRlIHdlIHVzZSB0aGlzIHRvIGRlY2lkZSBiZXR3ZWVuIFwicGVyc2lzdCB0aGUgdHlwZWRcblx0XHQvLyB2YWx1ZSB0byB0aGUgZGlzcGxheVwiIChubyBhY3Rpb24gXHUyMDE0IHVzZXIgZGlzbWlzc2VkIG1pZC1lZGl0KSBhbmRcblx0XHQvLyBcImxldCB0aGUgY2Fub25pY2FsIFVSTCBzdGFuZFwiIChhY3Rpb24gcmFuIFx1MjAxNCBlaXRoZXIgYSBuYXZpZ2F0aW9uXG5cdFx0Ly8gcHJlZW1wdGl2ZWx5IHJlbmRlcmVkIHRoZSBkZXN0aW5hdGlvbiwgb3IgYSBidXR0b24gbXV0YXRlZCBzdGF0ZSkuXG5cdFx0bGV0IGFjdGlvblRha2VuID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZFRyaWdnZXJCdXR0b24oYnV0dG9uID0+IHtcblx0XHRcdGFjdGlvblRha2VuID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGJ1dHRvbiBhcyBJQnJvd3NlclVybFBpY2tlckFjdGlvbjtcblx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy5faG9zdC5pbnB1dDtcblx0XHRcdGlmICh0eXBlb2YgYWN0aW9uLnJ1biA9PT0gJ2Z1bmN0aW9uJyAmJiBpbnB1dCkge1xuXHRcdFx0XHR2b2lkIFByb21pc2UucmVzb2x2ZShhY3Rpb24ucnVuKGlucHV0KSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUGVyLWl0ZW0gYnV0dG9uLiBXZSBhdHRhY2hlZCB0aGUgSUJyb3dzZXJVcmxTdWdnZXN0aW9uQWN0aW9uIGRpcmVjdGx5XG5cdFx0Ly8gYXMgdGhlIHBpY2tlciBidXR0b24sIHNvIHRoZSBldmVudCBoYW5kcyBpdCBiYWNrIHRvIHVzIGJ5IHJlZmVyZW5jZS5cblx0XHQvLyBVbmxpa2Ugb25EaWRUcmlnZ2VyQnV0dG9uIHRoaXMgZG9lcyBOT1QgY291bnQgYXMgXCJ0aGUgdXNlciBhY2NlcHRlZCB0aGUgc3VnZ2VzdGlvblwiXG5cdFx0Ly8gXHUyMDE0IHRoZSBwaWNrZXIgc3RheXMgb3BlbiBhbmQgdGhlIGFjdGlvbiBydW5zIGluLXBsYWNlLlxuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRUcmlnZ2VySXRlbUJ1dHRvbigoeyBidXR0b24gfSkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gYnV0dG9uIGFzIElCcm93c2VyVXJsU3VnZ2VzdGlvbkFjdGlvbjtcblx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy5faG9zdC5pbnB1dDtcblx0XHRcdGlmICh0eXBlb2YgYWN0aW9uLnJ1biA9PT0gJ2Z1bmN0aW9uJyAmJiBpbnB1dCkge1xuXHRcdFx0XHR2b2lkIFByb21pc2UucmVzb2x2ZShhY3Rpb24ucnVuKGlucHV0KSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdC8vIFBlci1ncm91cCBzZXBhcmF0b3IgYnV0dG9uLiBSb3V0ZWQgdGhlIHNhbWUgd2F5IGFzIHBlci1pdGVtIGJ1dHRvbnNcblx0XHQvLyAodGhlIElCcm93c2VyVXJsU3VnZ2VzdGlvbkFjdGlvbiB3YXMgYXR0YWNoZWQgZGlyZWN0bHkgdG8gdGhlIHNlcGFyYXRvcikuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZFRyaWdnZXJTZXBhcmF0b3JCdXR0b24oKHsgYnV0dG9uIH0pID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGJ1dHRvbiBhcyBJQnJvd3NlclVybFN1Z2dlc3Rpb25BY3Rpb247XG5cdFx0XHRjb25zdCBpbnB1dCA9IHRoaXMuX2hvc3QuaW5wdXQ7XG5cdFx0XHRpZiAodHlwZW9mIGFjdGlvbi5ydW4gPT09ICdmdW5jdGlvbicgJiYgaW5wdXQpIHtcblx0XHRcdFx0dm9pZCBQcm9taXNlLnJlc29sdmUoYWN0aW9uLnJ1bihpbnB1dCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdGFjdGlvblRha2VuID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGFjdGl2ZSA9IHBpY2tlci5hY3RpdmVJdGVtc1swXTtcblx0XHRcdGNvbnN0IGZhbGxiYWNrVXJsID0gcGlja2VyLnZhbHVlO1xuXHRcdFx0Y29uc3QgaW5wdXQgPSB0aGlzLl9ob3N0LmlucHV0O1xuXHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHRcdGlmIChhY3RpdmU/LmFwcGx5KSB7XG5cdFx0XHRcdGlmIChpbnB1dCkge1xuXHRcdFx0XHRcdHZvaWQgUHJvbWlzZS5yZXNvbHZlKGFjdGl2ZS5hcHBseShpbnB1dCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX25hdmlnYXRlVGV4dChhY3RpdmU/LmlkID8/IGZhbGxiYWNrVXJsKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEhpZGUoKHsgcmVhc29uIH0pID0+IHtcblx0XHRcdHRoaXMuX3VybERpc3BsYXkuc3R5bGUudmlzaWJpbGl0eSA9ICcnO1xuXHRcdFx0Ly8gRGVjaWRlIHdoZXRoZXIgdG8ga2VlcCB0aGUgdXNlciBpbiB0aGUgVVJMIGJhciAocmVmb2N1cyB0aGVcblx0XHRcdC8vIGRpc3BsYXkgc28gdGhleSBjYW4ga2VlcCBlZGl0aW5nKSBvciByZWxlYXNlIGl0LiBXZSBvbmx5IGtlZXBcblx0XHRcdC8vIGl0IGZvciBhIHBsYWluIGRpc21pc3NhbCAoZS5nLiBFc2NhcGUpOiBub3Qgd2hlbiBhbiBhY3Rpb24gcmFuXG5cdFx0XHQvLyAobmF2aWdhdGlvbi9idXR0b24pLCBub3Qgd2hlbiB0aGUgdXNlciBmb2N1c2VkIGVsc2V3aGVyZVxuXHRcdFx0Ly8gKEJsdXIpLCBhbmQgbm90IHdoZW4gYW5vdGhlciBwaWNrZXIgdG9vayBvdmVyIChyZXBsYWNlZCkuXG5cdFx0XHRjb25zdCByZXBsYWNlZCA9IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmN1cnJlbnRRdWlja0lucHV0ICE9PSB1bmRlZmluZWRcblx0XHRcdFx0JiYgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3VycmVudFF1aWNrSW5wdXQgIT09IHBpY2tlcjtcblx0XHRcdGNvbnN0IHJlZm9jdXNEaXNwbGF5ID0gIWFjdGlvblRha2VuICYmIHJlYXNvbiAhPT0gUXVpY2tJbnB1dEhpZGVSZWFzb24uQmx1ciAmJiAhcmVwbGFjZWQ7XG5cblx0XHRcdGlmIChyZWZvY3VzRGlzcGxheSkge1xuXHRcdFx0XHQvLyBQcmVzZXJ2ZSB0aGUgaW4tcHJvZ3Jlc3MgZWRpdCArIGNhcmV0L3NlbGVjdGlvbiBzbyB0aGVcblx0XHRcdFx0Ly8gdXNlciBjYW4gY29udGludWUgdHlwaW5nIGluIHRoZSBkaXNwbGF5LlxuXHRcdFx0XHR0aGlzLl91cmxEaXNwbGF5LmZvY3VzKCk7XG5cdFx0XHRcdGlmIChzZWxlY3Rpb25BdEhpZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX3NldFNlbGVjdGlvbihzZWxlY3Rpb25BdEhpZGUuc3RhcnQsIHNlbGVjdGlvbkF0SGlkZS5lbmQsIHNlbGVjdGlvbkF0SGlkZS5kaXJlY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBUaGUgVVJMIGJhciBpcyBiZWluZyByZWxlYXNlZCBcdTIwMTQgYWx3YXlzIHNob3cgdGhlIGNhbm9uaWNhbFxuXHRcdFx0XHQvLyBVUkwgKHJ1biByZW5kZXJlcnMpIHNvIGFueSBpbi1wcm9ncmVzcyBtaXJyb3IgdGV4dCBkb2Vzbid0XG5cdFx0XHRcdC8vIGxpbmdlciBhZnRlciBmb2N1cyBoYXMgbW92ZWQgYXdheS5cblx0XHRcdFx0dGhpcy5fcmVuZGVyVXJsKCk7XG5cdFx0XHRcdGlmIChhY3Rpb25UYWtlbikge1xuXHRcdFx0XHRcdC8vIE1vdmUgZm9jdXMgdG8gdGhlIGJyb3dzZXIgY29udGVudCBzbyB0aGUgdXNlciBjYW5cblx0XHRcdFx0XHQvLyBpbnRlcmFjdCB3aXRoIHRoZSBwYWdlLlxuXHRcdFx0XHRcdHRoaXMuX2hvc3QuZW5zdXJlQnJvd3NlckZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3BpY2tlckVkaXRlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5faXNTZXR0aW5nUGlja2VyVmFsdWUgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3BpY2tlci5jbGVhcigpO1xuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyKTtcblxuXHRcdHRoaXMuX3BpY2tlci52YWx1ZSA9IHBpY2tlcjtcblx0XHRwaWNrZXIuc2hvdygpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsR0FBRyx1QkFBdUIseUJBQXlCLFdBQVcsMEJBQTBCO0FBQ2pHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUFpQixtQkFBbUIsb0JBQW9CO0FBQzdFLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsb0JBQXFFLDRCQUE0QjtBQUUxRztBQUFBLEVBRUM7QUFBQSxPQVFNO0FBa0RBLElBQU0sc0JBQU4sY0FBa0MsV0FBVztBQUFBLEVBZW5ELFlBQ2tCLE9BQ29CLG9CQUNwQztBQUNELFVBQU07QUFIVztBQUNvQjtBQVp0QyxTQUFpQixnQkFBdUMsQ0FBQztBQUN6RCxTQUFpQix1QkFBd0QsQ0FBQztBQUMxRSxTQUFpQix5QkFBNEQsQ0FBQztBQUM5RSxTQUFpQixVQUFVLEtBQUssVUFBVSxJQUFJLGtCQUF1RSxDQUFDO0FBRXRILFNBQVEscUJBQXFCO0FBQzdCLFNBQVEsc0JBQXNCO0FBQzlCLFNBQVEsZ0JBQWdCO0FBQ3hCLFNBQVEsd0JBQXdCO0FBUS9CLFNBQUssVUFBVSxFQUFFLHdCQUF3QjtBQUN6QyxTQUFLLDBCQUEwQixFQUFFLDBCQUEwQjtBQUszRCxTQUFL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
