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
import "./media/chatCompositeBar.css";
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { Emitter } from "../../../base/common/event.js";
import { $, addDisposableGenericMouseDownListener, addDisposableListener, addStandardDisposableListener, DisposableResizeObserver, EventType, getWindow, isMouseEvent } from "../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { autorun, observableSignalFromEvent } from "../../../base/common/observable.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { localize } from "../../../nls.js";
import { ISessionsManagementService } from "../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../services/sessions/browser/sessionsService.js";
import { getUntitledSessionTitle } from "../../services/sessions/common/session.js";
import { ActionRunner } from "../../../base/common/actions.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../platform/actions/browser/toolbar.js";
import { MenuItemAction } from "../../../platform/actions/common/actions.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { Menus } from "../menus.js";
import { LocalSelectionTransfer } from "../../../platform/dnd/browser/dnd.js";
import { DraggedSessionIdentifier, SessionsDataTransfers } from "../dnd.js";
import { applyDragImage } from "../../../base/browser/ui/dnd/dnd.js";
import { applySessionBarThemeColors } from "./sessionBarStyles.js";
import { IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { onUnexpectedError } from "../../../base/common/errors.js";
import { SessionStatusIcon } from "../sessionStatusIcon.js";
import { SessionHeaderMetaActionViewItem } from "./sessionHeaderMetaActionViewItem.js";
class SessionActivatingActionRunner extends ActionRunner {
  constructor(_getSession, _sessionsService) {
    super();
    this._getSession = _getSession;
    this._sessionsService = _sessionsService;
  }
  async runAction(action, context) {
    const session = this._getSession();
    if (session) {
      this._sessionsService.setActive(session);
    }
    await super.runAction(action, context);
  }
}
let SessionHeader = class extends Disposable {
  constructor(_themeService, instantiationService, _contextMenuService, _contextKeyService, _sessionsManagementService, _sessionsService) {
    super();
    this._themeService = _themeService;
    this._contextMenuService = _contextMenuService;
    this._contextKeyService = _contextKeyService;
    this._sessionsManagementService = _sessionsManagementService;
    this._sessionsService = _sessionsService;
    this._sessionDisposables = this._register(new MutableDisposable());
    this._editingDisposables = this._register(new MutableDisposable());
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._visible = false;
    this._sessionTransfer = LocalSelectionTransfer.getInstance();
    this._container = $(".chat-composite-bar.session-header-bar");
    const header = $(".chat-composite-bar-header");
    this._container.appendChild(header);
    this._iconEl = $(".chat-composite-bar-session-icon");
    header.appendChild(this._iconEl);
    this._statusIcon = this._register(instantiationService.createInstance(SessionStatusIcon, this._iconEl));
    const main = $(".chat-composite-bar-header-main");
    header.appendChild(main);
    const titleRow = $(".chat-composite-bar-title-row");
    main.appendChild(titleRow);
    this._titleEl = $(".chat-composite-bar-session-title");
    titleRow.appendChild(this._titleEl);
    this._titleTextEl = $("span.chat-composite-bar-session-title-text");
    this._titleEl.appendChild(this._titleTextEl);
    this._register(addDisposableListener(this._titleEl, EventType.CLICK, () => {
      this.startTitleEditing();
    }));
    const titleActions = $(".chat-composite-bar-title-actions");
    titleRow.appendChild(titleActions);
    this._titleActionsEl = titleActions;
    const toolbarContainer = $(".chat-composite-bar-toolbar");
    titleActions.appendChild(toolbarContainer);
    this._toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, Menus.SessionBarToolbar, {
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      menuOptions: { shouldForwardArgs: true },
      highlightToggledItems: true,
      // Render every group in the primary slot with a separator between groups
      // so the actions stay visually grouped.
      toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true }
    }));
    this._metaRow = $(".chat-composite-bar-meta-row");
    main.appendChild(this._metaRow);
    const metaToolbarContainer = $(".chat-composite-bar-meta-toolbar");
    this._metaRow.appendChild(metaToolbarContainer);
    const metaActionRunner = this._register(new SessionActivatingActionRunner(() => this._session, this._sessionsService));
    this._metaToolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, metaToolbarContainer, Menus.SessionHeaderMeta, {
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      menuOptions: { shouldForwardArgs: true },
      actionRunner: metaActionRunner,
      // Render every meta action as a consistent `icon title` pill unless it
      // registers its own action view item via IActionViewItemService.
      actionViewItemProvider: (action, options) => {
        if (action instanceof MenuItemAction) {
          return instantiationService.createInstance(SessionHeaderMetaActionViewItem, void 0, action, options);
        }
        return void 0;
      }
    }));
    this._metaActionsSignal = observableSignalFromEvent(this, this._metaToolbar.onDidChangeMenuItems);
    const heightObserver = this._register(new DisposableResizeObserver("SessionHeader.height", () => {
      this._onDidChangeHeight.fire();
    }));
    this._register(heightObserver.observe(this._container));
    this._setVisible(false);
    this._updateStyles();
    this._register(this._themeService.onDidColorThemeChange(() => this._updateStyles()));
    this._registerDragSource();
    this._registerContextMenu();
  }
  get element() {
    return this._container;
  }
  get visible() {
    return this._visible;
  }
  get height() {
    return this._visible ? this._container.offsetHeight : 0;
  }
  _registerContextMenu() {
    this._register(addDisposableListener(this._container, EventType.CONTEXT_MENU, (e) => {
      const session = this._session;
      if (!session) {
        return;
      }
      let anchor = this._container;
      if (isMouseEvent(e)) {
        anchor = new StandardMouseEvent(getWindow(this._container), e);
      }
      e.preventDefault();
      e.stopPropagation();
      this._contextMenuService.showContextMenu({
        menuId: Menus.SessionHeaderContext,
        menuActionOptions: { shouldForwardArgs: true, arg: session },
        getAnchor: () => anchor,
        contextKeyService: this._contextKeyService
      });
    }));
  }
  _registerDragSource() {
    this._container.draggable = true;
    this._register(addDisposableListener(this._container, EventType.DRAG_START, (e) => {
      const session = this._session;
      if (!session || !e.dataTransfer) {
        e.preventDefault();
        return;
      }
      const target = e.target;
      if (target && this._titleActionsEl.contains(target)) {
        e.preventDefault();
        return;
      }
      if (this._renameInput) {
        e.preventDefault();
        return;
      }
      this._sessionTransfer.setData(
        [new DraggedSessionIdentifier(session.sessionId, session.resource)],
        DraggedSessionIdentifier.prototype
      );
      const payload = JSON.stringify({ sessionId: session.sessionId, resource: session.resource.toString() });
      e.dataTransfer.setData(SessionsDataTransfers.SESSION, payload);
      e.dataTransfer.effectAllowed = "move";
      applyDragImage(e, this._container, session.title.get());
    }));
    this._register(addDisposableListener(this._container, EventType.DRAG_END, () => {
      this._sessionTransfer.clearData(DraggedSessionIdentifier.prototype);
    }));
  }
  /**
   * Tells the header which session is currently relevant. Pass `undefined` to clear.
   */
  setSession(session) {
    if (this._session === session) {
      return;
    }
    this._cancelTitleEditing();
    this._session = session;
    this._toolbar.context = session;
    this._metaToolbar.context = session;
    this._statusIcon.reset();
    const store = new DisposableStore();
    this._sessionDisposables.value = store;
    if (!session) {
      this._setVisible(false);
      return;
    }
    store.add(autorun((reader) => {
      this._updateHeader(session, reader);
    }));
    store.add(autorun((reader) => {
      this._setVisible(session.isCreated.read(reader));
    }));
  }
  _updateHeader(session, reader) {
    const status = session.status.read(reader);
    const isRead = session.isRead.read(reader);
    const isArchived = session.isArchived.read(reader);
    this._statusIcon.setStatus(status, isRead, isArchived);
    const isQuickChat = session.isQuickChat?.read(reader) ?? false;
    this._titleTextEl.textContent = session.title.read(reader) || getUntitledSessionTitle(isQuickChat);
    this._titleEl.classList.toggle("editable", this._isTitleEditable());
    this._metaActionsSignal.read(reader);
    const hasMetaActions = !this._metaToolbar.isEmpty();
    this._metaRow.style.display = hasMetaActions ? "" : "none";
    this._onDidChangeHeight.fire();
  }
  _setVisible(visible) {
    const wasVisible = this._visible;
    this._visible = visible;
    this._container.style.display = this._visible ? "" : "none";
    if (wasVisible !== this._visible) {
      this._onDidChangeVisibility.fire(this._visible);
    }
  }
  _updateStyles() {
    applySessionBarThemeColors(this._container, this._themeService.getColorTheme());
  }
  /**
   * The title is editable when the backing provider declares it supports
   * renaming the session (`capabilities.supportsRename`). This is the same
   * signal that gates the `Rename...` context menu action in the sessions list.
   */
  _isTitleEditable() {
    return !!this._session && (this._session.capabilities.get().supportsRename ?? false);
  }
  startTitleEditing() {
    if (!this._isTitleEditable() || this._renameInput) {
      return;
    }
    this._startTitleEditing();
  }
  /**
   * Replace the rendered title text with an `<input>` containing the current
   * title (pre-selected). Enter commits via {@link ISessionsManagementService.renameChat},
   * Escape or blur cancels.
   */
  _startTitleEditing() {
    const session = this._session;
    if (!session || this._renameInput) {
      return;
    }
    const initialTitle = session.title.get();
    const fallbackTitle = getUntitledSessionTitle(session.isQuickChat?.get() ?? false);
    const input = document.createElement("input");
    input.type = "text";
    input.className = "chat-composite-bar-session-title-input";
    input.value = initialTitle;
    input.placeholder = fallbackTitle;
    input.setAttribute("aria-label", localize("renameSession.aria", "Rename session"));
    input.spellcheck = false;
    this._titleTextEl.style.display = "none";
    this._titleEl.appendChild(input);
    this._titleEl.classList.add("editing");
    this._renameInput = input;
    input.focus();
    input.select();
    const store = new DisposableStore();
    this._editingDisposables.value = store;
    let finished = false;
    const finish = (commit) => {
      if (finished) {
        return;
      }
      finished = true;
      const newTitle = input.value.trim();
      this._endTitleEditing();
      if (commit && newTitle && newTitle !== initialTitle) {
        this._sessionsManagementService.renameSession(session, newTitle).catch(onUnexpectedError);
      }
    };
    store.add(addStandardDisposableListener(input, EventType.KEY_DOWN, (e) => {
      if (e.equals(KeyCode.Enter)) {
        e.preventDefault();
        e.stopPropagation();
        finish(true);
      } else if (e.equals(KeyCode.Escape)) {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      } else {
        e.stopPropagation();
      }
    }));
    store.add(addDisposableListener(input, EventType.BLUR, () => {
      finish(false);
    }));
    store.add(addDisposableGenericMouseDownListener(input, (e) => e.stopPropagation()));
    store.add(addDisposableListener(input, EventType.CLICK, (e) => e.stopPropagation()));
  }
  _cancelTitleEditing() {
    if (!this._renameInput) {
      return;
    }
    this._endTitleEditing();
  }
  _endTitleEditing() {
    if (this._renameInput) {
      this._renameInput.remove();
      this._renameInput = void 0;
    }
    this._titleTextEl.style.display = "";
    this._titleEl.classList.remove("editing");
    this._editingDisposables.clear();
  }
};
SessionHeader = __decorateClass([
  __decorateParam(0, IThemeService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, ISessionsManagementService),
  __decorateParam(5, ISessionsService)
], SessionHeader);
let SessionViewFloatingToolbar = class extends Disposable {
  constructor(instantiationService) {
    super();
    this._sessionDisposables = this._register(new MutableDisposable());
    this._container = $(".chat-composite-bar.chat-composite-bar-toolbar-floating");
    const toolbar = $(".chat-composite-bar-toolbar");
    this._container.appendChild(toolbar);
    this._toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, toolbar, Menus.SessionBarToolbar, {
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      menuOptions: { shouldForwardArgs: true },
      highlightToggledItems: true,
      toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true }
    }));
    this._setVisible(false);
  }
  get element() {
    return this._container;
  }
  setSession(session) {
    if (this._session === session) {
      return;
    }
    this._session = session;
    this._toolbar.context = session;
    const store = new DisposableStore();
    this._sessionDisposables.value = store;
    if (!session) {
      this._setVisible(false);
      return;
    }
    store.add(autorun((reader) => {
      this._setVisible(!session.isCreated.read(reader));
    }));
  }
  _setVisible(visible) {
    this._container.style.display = visible ? "" : "none";
  }
};
SessionViewFloatingToolbar = __decorateClass([
  __decorateParam(0, IInstantiationService)
], SessionViewFloatingToolbar);
export {
  SessionHeader,
  SessionViewFloatingToolbar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2Jyb3dzZXIvcGFydHMvc2Vzc2lvbkhlYWRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0Q29tcG9zaXRlQmFyLmNzcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lciwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lciwgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyLCBFdmVudFR5cGUsIGdldFdpbmRvdywgaXNNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSwgSVJlYWRlciwgb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24sIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0VW50aXRsZWRTZXNzaW9uVGl0bGUgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBBY3Rpb25SdW5uZXIsIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSGlkZGVuSXRlbVN0cmF0ZWd5LCBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uL21lbnVzLmpzJztcbmltcG9ydCB7IExvY2FsU2VsZWN0aW9uVHJhbnNmZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kbmQvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgRHJhZ2dlZFNlc3Npb25JZGVudGlmaWVyLCBTZXNzaW9uc0RhdGFUcmFuc2ZlcnMgfSBmcm9tICcuLi9kbmQuanMnO1xuaW1wb3J0IHsgYXBwbHlEcmFnSW1hZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZG5kL2RuZC5qcyc7XG5pbXBvcnQgeyBhcHBseVNlc3Npb25CYXJUaGVtZUNvbG9ycyB9IGZyb20gJy4vc2Vzc2lvbkJhclN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFNlc3Npb25TdGF0dXNJY29uIH0gZnJvbSAnLi4vc2Vzc2lvblN0YXR1c0ljb24uanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkhlYWRlck1ldGFBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4vc2Vzc2lvbkhlYWRlck1ldGFBY3Rpb25WaWV3SXRlbS5qcyc7XG5cbi8qKlxuICogQW4gYWN0aW9uIHJ1bm5lciBmb3IgdGhlIHNlc3Npb24gaGVhZGVyIHRvb2xiYXJzIHRoYXQgcHJvbW90ZXMgdGhlIGhlYWRlcidzXG4gKiBzZXNzaW9uIHRvIGJlIHRoZSBhY3RpdmUgc2Vzc2lvbiBiZWZvcmUgcnVubmluZyBhbnkgY29udHJpYnV0ZWQgY29tbWFuZC4gVGhpc1xuICogZW5zdXJlcyBjb21tYW5kcyAoZS5nLiBWaWV3IEFsbCBDaGFuZ2VzKSBvcGVyYXRlIG9uIHRoZSBjbGlja2VkIHNlc3Npb24gZXZlbiB3aGVuXG4gKiBhIGRpZmZlcmVudCBzZXNzaW9uIGlzIGN1cnJlbnRseSBhY3RpdmUuXG4gKi9cbmNsYXNzIFNlc3Npb25BY3RpdmF0aW5nQWN0aW9uUnVubmVyIGV4dGVuZHMgQWN0aW9uUnVubmVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRTZXNzaW9uOiAoKSA9PiBJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgcnVuQWN0aW9uKGFjdGlvbjogSUFjdGlvbiwgY29udGV4dD86IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fZ2V0U2Vzc2lvbigpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uc1NlcnZpY2Uuc2V0QWN0aXZlKHNlc3Npb24pO1xuXHRcdH1cblx0XHRhd2FpdCBzdXBlci5ydW5BY3Rpb24oYWN0aW9uLCBjb250ZXh0KTtcblx0fVxufVxuXG4vKipcbiAqIFRoZSBzZXNzaW9uIGhlYWRlciBzaG93biBhdCB0aGUgdG9wIG9mIGEgc2Vzc2lvbiB2aWV3LiBJdCBzdXJmYWNlcyB0aGUgc2Vzc2lvblxuICogaWRlbnRpdHkgKHN0YXR1cyBpY29uICsgdGl0bGUpLCBhIG1ldGEgcm93IChjb250cmlidXRlZCB3b3Jrc3BhY2UgZm9sZGVyIC9cbiAqIGNoYW5nZXMgLyBwdWxsIHJlcXVlc3QgcGlsbHMpLCBhbmQgdGhlIHNlc3Npb24gdG9vbGJhcnMgKGUuZy4gUnVuLCBPcGVuIGluXG4gKiBWUyBDb2RlLCBOZXcgQ2hhdCkuXG4gKlxuICogSXQgaXMgaW50ZW50aW9uYWxseSBkZWNvdXBsZWQgZnJvbSB0aGUge0BsaW5rIENoYXRDb21wb3NpdGVCYXJ9ICh0aGUgY2hhdCB0YWJcbiAqIHN0cmlwKSBzbyB0aGUgdHdvIHN1cmZhY2VzIGV2b2x2ZSBpbmRlcGVuZGVudGx5LiBUaGUgaG9zdGluZyB2aWV3IHRlbGxzIHRoZVxuICogaGVhZGVyIHdoaWNoIHNlc3Npb24gaXMgcmVsZXZhbnQgdmlhIHtAbGluayBzZXRTZXNzaW9ufS5cbiAqL1xuZXhwb3J0IGNsYXNzIFNlc3Npb25IZWFkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pY29uRWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZUVsOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVUZXh0RWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXRhUm93OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9vbGJhcjogTWVudVdvcmtiZW5jaFRvb2xCYXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21ldGFUb29sYmFyOiBNZW51V29ya2JlbmNoVG9vbEJhcjtcblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVBY3Rpb25zRWw6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0aW5nRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSBfcmVuYW1lSW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Nlc3Npb246IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2liaWxpdHk6IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGVpZ2h0OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmV2ZW50O1xuXG5cdHByaXZhdGUgX3Zpc2libGUgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uVHJhbnNmZXIgPSBMb2NhbFNlbGVjdGlvblRyYW5zZmVyLmdldEluc3RhbmNlPERyYWdnZWRTZXNzaW9uSWRlbnRpZmllcj4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXRhQWN0aW9uc1NpZ25hbDogSU9ic2VydmFibGU8dm9pZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdHVzSWNvbjogU2Vzc2lvblN0YXR1c0ljb247XG5cblx0Z2V0IGVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9jb250YWluZXI7XG5cdH1cblxuXHRnZXQgdmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlzaWJsZTtcblx0fVxuXG5cdGdldCBoZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlzaWJsZSA/IHRoaXMuX2NvbnRhaW5lci5vZmZzZXRIZWlnaHQgOiAwO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9jb250YWluZXIgPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLnNlc3Npb24taGVhZGVyLWJhcicpO1xuXG5cdFx0Ly8gSGVhZGVyOiBhIHN0YXR1cyBpY29uIGNvbHVtbiBhbG9uZ3NpZGUgYSBtYWluIGNvbHVtbiB0aGF0IHN0YWNrcyB0aGUgdGl0bGVcblx0XHQvLyByb3cgKHRpdGxlICsgYWN0aW9ucykgYW5kIHRoZSBtZXRhIHJvdyAod29ya3NwYWNlIFx1MDBCNyBkaWZmKS4gVGhpcyBtaXJyb3JzIHRoZVxuXHRcdC8vIHNlc3Npb25zIGxpc3Qgc28gdGhlIG1ldGEgcm93IGFsaWducyB1bmRlciB0aGUgdGl0bGUgcmF0aGVyIHRoYW4gdW5kZXIgdGhlXG5cdFx0Ly8gc3RhdHVzIGljb24uXG5cdFx0Y29uc3QgaGVhZGVyID0gJCgnLmNoYXQtY29tcG9zaXRlLWJhci1oZWFkZXInKTtcblx0XHR0aGlzLl9jb250YWluZXIuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcblxuXHRcdHRoaXMuX2ljb25FbCA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXItc2Vzc2lvbi1pY29uJyk7XG5cdFx0aGVhZGVyLmFwcGVuZENoaWxkKHRoaXMuX2ljb25FbCk7XG5cdFx0dGhpcy5fc3RhdHVzSWNvbiA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25TdGF0dXNJY29uLCB0aGlzLl9pY29uRWwpKTtcblxuXHRcdGNvbnN0IG1haW4gPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLWhlYWRlci1tYWluJyk7XG5cdFx0aGVhZGVyLmFwcGVuZENoaWxkKG1haW4pO1xuXG5cdFx0Y29uc3QgdGl0bGVSb3cgPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLXRpdGxlLXJvdycpO1xuXHRcdG1haW4uYXBwZW5kQ2hpbGQodGl0bGVSb3cpO1xuXG5cdFx0dGhpcy5fdGl0bGVFbCA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXItc2Vzc2lvbi10aXRsZScpO1xuXHRcdHRpdGxlUm93LmFwcGVuZENoaWxkKHRoaXMuX3RpdGxlRWwpO1xuXG5cdFx0Ly8gV3JhcCB0aGUgdGl0bGUgdGV4dCBpbiBhIHNwYW4gc28gd2UgY2FuIHN3YXAgaXQgZm9yIGFuIGlucHV0IHdoZW5cblx0XHQvLyB0aGUgdXNlciBjbGlja3MgdG8gcmVuYW1lIHdpdGhvdXQgcmVidWlsZGluZyB0aGUgdGl0bGUgc2xvdCBpdHNlbGYuXG5cdFx0dGhpcy5fdGl0bGVUZXh0RWwgPSAkKCdzcGFuLmNoYXQtY29tcG9zaXRlLWJhci1zZXNzaW9uLXRpdGxlLXRleHQnKTtcblx0XHR0aGlzLl90aXRsZUVsLmFwcGVuZENoaWxkKHRoaXMuX3RpdGxlVGV4dEVsKTtcblxuXHRcdC8vIENsaWNrIHRoZSB0aXRsZSB0byBzdGFydCBhbiBpbmxpbmUgcmVuYW1lLiBDbGljayBpcyBwcmVmZXJyZWQgb3ZlclxuXHRcdC8vIG1vdXNlZG93biBzbyB0aGF0IGluaXRpYXRpbmcgYSBkcmFnIGZyb20gdGhlIHRpdGxlIGRvZXNuJ3QgYWxzb1xuXHRcdC8vIGZsaXAgaW50byBlZGl0IG1vZGUuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3RpdGxlRWwsIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0dGhpcy5zdGFydFRpdGxlRWRpdGluZygpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHRpdGxlQWN0aW9ucyA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXItdGl0bGUtYWN0aW9ucycpO1xuXHRcdHRpdGxlUm93LmFwcGVuZENoaWxkKHRpdGxlQWN0aW9ucyk7XG5cdFx0dGhpcy5fdGl0bGVBY3Rpb25zRWwgPSB0aXRsZUFjdGlvbnM7XG5cblx0XHRjb25zdCB0b29sYmFyQ29udGFpbmVyID0gJCgnLmNoYXQtY29tcG9zaXRlLWJhci10b29sYmFyJyk7XG5cdFx0dGl0bGVBY3Rpb25zLmFwcGVuZENoaWxkKHRvb2xiYXJDb250YWluZXIpO1xuXHRcdHRoaXMuX3Rvb2xiYXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdG9vbGJhckNvbnRhaW5lciwgTWVudXMuU2Vzc2lvbkJhclRvb2xiYXIsIHtcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lklnbm9yZSxcblx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRoaWdobGlnaHRUb2dnbGVkSXRlbXM6IHRydWUsXG5cdFx0XHQvLyBSZW5kZXIgZXZlcnkgZ3JvdXAgaW4gdGhlIHByaW1hcnkgc2xvdCB3aXRoIGEgc2VwYXJhdG9yIGJldHdlZW4gZ3JvdXBzXG5cdFx0XHQvLyBzbyB0aGUgYWN0aW9ucyBzdGF5IHZpc3VhbGx5IGdyb3VwZWQuXG5cdFx0XHR0b29sYmFyT3B0aW9uczogeyBwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUsIHVzZVNlcGFyYXRvcnNJblByaW1hcnlBY3Rpb25zOiB0cnVlIH0sXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fbWV0YVJvdyA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXItbWV0YS1yb3cnKTtcblx0XHRtYWluLmFwcGVuZENoaWxkKHRoaXMuX21ldGFSb3cpO1xuXG5cdFx0Ly8gU2Vzc2lvbiBoZWFkZXIgbWV0YSB0b29sYmFyLiBBY3Rpb25zIGFyZSBjb250cmlidXRlZCBpbnRvIHRoZSBnZW5lcmljXG5cdFx0Ly8gTWVudXMuU2Vzc2lvbkhlYWRlck1ldGEgbWVudTogdGhlIGZpbGVzIHZpZXcgY29udHJpYnV0ZXMgdGhlIHdvcmtzcGFjZVxuXHRcdC8vIGZvbGRlciBwaWxsIChvcGVucyB0aGUgRmlsZXMgdmlldyksIHRoZSBjaGFuZ2VzIHZpZXcgY29udHJpYnV0ZXMgdGhlXG5cdFx0Ly8gZGlmZi1zdGF0cyBhY3Rpb24gKG9wZW5zIHRoZSBtdWx0aS1maWxlIGRpZmYgZWRpdG9yKSBhbmQgdGhlIEdpdEh1YlxuXHRcdC8vIGNvbnRyaWJ1dGlvbiBjb250cmlidXRlcyB0aGUgcHVsbCByZXF1ZXN0IHBpbGwgKG9wZW5zIHRoZSBQUiBvbiBHaXRIdWIpLFxuXHRcdC8vIGVhY2ggcmVuZGVyZWQgYXMgYSBjb21wYWN0IHNlY29uZGFyeSBidXR0b24gcGlsbCB2aWFcblx0XHQvLyBTZXNzaW9uSGVhZGVyTWV0YUFjdGlvblZpZXdJdGVtLlxuXHRcdGNvbnN0IG1ldGFUb29sYmFyQ29udGFpbmVyID0gJCgnLmNoYXQtY29tcG9zaXRlLWJhci1tZXRhLXRvb2xiYXInKTtcblx0XHR0aGlzLl9tZXRhUm93LmFwcGVuZENoaWxkKG1ldGFUb29sYmFyQ29udGFpbmVyKTtcblx0XHQvLyBDb21tYW5kcyBjb250cmlidXRlZCBpbnRvIHRoZSBoZWFkZXIgbWV0YSB0b29sYmFyIChlLmcuIFZpZXcgQWxsIENoYW5nZXMpXG5cdFx0Ly8gb3BlcmF0ZSBvbiB0aGlzIHZpZXcncyBzZXNzaW9uLiBQcm9tb3RlIGl0IHRvIHRoZSBhY3RpdmUgc2Vzc2lvbiBiZWZvcmVcblx0XHQvLyBydW5uaW5nIGFueSBvZiB0aGVtIHZpYSBhIGN1c3RvbSBhY3Rpb24gcnVubmVyLCBzbyB0aGUgY29tbWFuZCBhbHdheXNcblx0XHQvLyB0YXJnZXRzIHRoZSBjbGlja2VkIHNlc3Npb24gZXZlbiB3aGVuIGFub3RoZXIgc2Vzc2lvbiBpcyBhY3RpdmUuXG5cdFx0Y29uc3QgbWV0YUFjdGlvblJ1bm5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTZXNzaW9uQWN0aXZhdGluZ0FjdGlvblJ1bm5lcigoKSA9PiB0aGlzLl9zZXNzaW9uLCB0aGlzLl9zZXNzaW9uc1NlcnZpY2UpKTtcblx0XHR0aGlzLl9tZXRhVG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBtZXRhVG9vbGJhckNvbnRhaW5lciwgTWVudXMuU2Vzc2lvbkhlYWRlck1ldGEsIHtcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lklnbm9yZSxcblx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRhY3Rpb25SdW5uZXI6IG1ldGFBY3Rpb25SdW5uZXIsXG5cdFx0XHQvLyBSZW5kZXIgZXZlcnkgbWV0YSBhY3Rpb24gYXMgYSBjb25zaXN0ZW50IGBpY29uIHRpdGxlYCBwaWxsIHVubGVzcyBpdFxuXHRcdFx0Ly8gcmVnaXN0ZXJzIGl0cyBvd24gYWN0aW9uIHZpZXcgaXRlbSB2aWEgSUFjdGlvblZpZXdJdGVtU2VydmljZS5cblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25IZWFkZXJNZXRhQWN0aW9uVmlld0l0ZW0sIHVuZGVmaW5lZCwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0Ly8gVGhlIG1ldGEgcm93IHNlcGFyYXRvci92aXNpYmlsaXR5IHRyYWNrcyB3aGV0aGVyIHRoZSBtZXRhIHRvb2xiYXIgaGFzIGFueVxuXHRcdC8vIGNvbnRyaWJ1dGVkIGFjdGlvbnMsIHNvIHJlY29tcHV0ZSB0aGUgaGVhZGVyIHdoZW5ldmVyIHRoZXkgY2hhbmdlLlxuXHRcdHRoaXMuX21ldGFBY3Rpb25zU2lnbmFsID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCh0aGlzLCB0aGlzLl9tZXRhVG9vbGJhci5vbkRpZENoYW5nZU1lbnVJdGVtcyk7XG5cblx0XHQvLyBSZXBvcnQgaGVpZ2h0IGNoYW5nZXMgKGUuZy4gbWV0YSByb3cgY29udGVudCB3cmFwcGluZykgc28gdGhlIGhvc3QgY2FuIHJlLWxheW91dFxuXHRcdGNvbnN0IGhlaWdodE9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVSZXNpemVPYnNlcnZlcignU2Vzc2lvbkhlYWRlci5oZWlnaHQnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGhlaWdodE9ic2VydmVyLm9ic2VydmUodGhpcy5fY29udGFpbmVyKSk7XG5cblx0XHR0aGlzLl9zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHR0aGlzLl91cGRhdGVTdHlsZXMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IHRoaXMuX3VwZGF0ZVN0eWxlcygpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlckRyYWdTb3VyY2UoKTtcblx0XHR0aGlzLl9yZWdpc3RlckNvbnRleHRNZW51KCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckNvbnRleHRNZW51KCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9jb250YWluZXIsIEV2ZW50VHlwZS5DT05URVhUX01FTlUsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbjtcblx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCBhbmNob3I6IEhUTUxFbGVtZW50IHwgU3RhbmRhcmRNb3VzZUV2ZW50ID0gdGhpcy5fY29udGFpbmVyO1xuXHRcdFx0aWYgKGlzTW91c2VFdmVudChlKSkge1xuXHRcdFx0XHRhbmNob3IgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyh0aGlzLl9jb250YWluZXIpLCBlKTtcblx0XHRcdH1cblxuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuX2NvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVzLlNlc3Npb25IZWFkZXJDb250ZXh0LFxuXHRcdFx0XHRtZW51QWN0aW9uT3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSwgYXJnOiBzZXNzaW9uIH0sXG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yLFxuXHRcdFx0XHRjb250ZXh0S2V5U2VydmljZTogdGhpcy5fY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckRyYWdTb3VyY2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGFpbmVyLmRyYWdnYWJsZSA9IHRydWU7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fY29udGFpbmVyLCBFdmVudFR5cGUuRFJBR19TVEFSVCwgKGU6IERyYWdFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb247XG5cdFx0XHRpZiAoIXNlc3Npb24gfHwgIWUuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEb24ndCBpbml0aWF0ZSBhIGRyYWcgd2hlbiB0aGUgZ2VzdHVyZSBzdGFydHMgaW5zaWRlIHRoZSBoZWFkZXJcblx0XHRcdC8vIHRvb2xiYXIgKFJ1biwgT3BlbiBpbiBWUyBDb2RlLCBOZXcgQ2hhdCwgcGluLCBjbG9zZSkuIEEgc21hbGwgcG9pbnRlclxuXHRcdFx0Ly8gbW92ZSBkdXJpbmcgYSBidXR0b24gY2xpY2sgd291bGQgb3RoZXJ3aXNlIHN0YXJ0IGEgc2Vzc2lvbiBkcmFnXG5cdFx0XHQvLyBhbmQgc3dhbGxvdyB0aGUgY2xpY2suXG5cdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBOb2RlIHwgbnVsbDtcblx0XHRcdGlmICh0YXJnZXQgJiYgdGhpcy5fdGl0bGVBY3Rpb25zRWwuY29udGFpbnModGFyZ2V0KSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRG9uJ3QgaW5pdGlhdGUgYSBkcmFnIHdoaWxlIHRoZSB0aXRsZSBpcyBiZWluZyByZW5hbWVkLCBvdGhlcndpc2Vcblx0XHRcdC8vIHRoZSBpbi1wcm9ncmVzcyB0ZXh0IHNlbGVjdGlvbiAvIGNsaWNrIHdvdWxkIGFsc28gc3RhcnQgYSBkcmFnLlxuXHRcdFx0aWYgKHRoaXMuX3JlbmFtZUlucHV0KSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9zZXNzaW9uVHJhbnNmZXIuc2V0RGF0YShcblx0XHRcdFx0W25ldyBEcmFnZ2VkU2Vzc2lvbklkZW50aWZpZXIoc2Vzc2lvbi5zZXNzaW9uSWQsIHNlc3Npb24ucmVzb3VyY2UpXSxcblx0XHRcdFx0RHJhZ2dlZFNlc3Npb25JZGVudGlmaWVyLnByb3RvdHlwZSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHBheWxvYWQgPSBKU09OLnN0cmluZ2lmeSh7IHNlc3Npb25JZDogc2Vzc2lvbi5zZXNzaW9uSWQsIHJlc291cmNlOiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCkgfSk7XG5cdFx0XHRlLmRhdGFUcmFuc2Zlci5zZXREYXRhKFNlc3Npb25zRGF0YVRyYW5zZmVycy5TRVNTSU9OLCBwYXlsb2FkKTtcblx0XHRcdGUuZGF0YVRyYW5zZmVyLmVmZmVjdEFsbG93ZWQgPSAnbW92ZSc7XG5cblx0XHRcdGFwcGx5RHJhZ0ltYWdlKGUsIHRoaXMuX2NvbnRhaW5lciwgc2Vzc2lvbi50aXRsZS5nZXQoKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2NvbnRhaW5lciwgRXZlbnRUeXBlLkRSQUdfRU5ELCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uVHJhbnNmZXIuY2xlYXJEYXRhKERyYWdnZWRTZXNzaW9uSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZWxscyB0aGUgaGVhZGVyIHdoaWNoIHNlc3Npb24gaXMgY3VycmVudGx5IHJlbGV2YW50LiBQYXNzIGB1bmRlZmluZWRgIHRvIGNsZWFyLlxuXHQgKi9cblx0c2V0U2Vzc2lvbihzZXNzaW9uOiBJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zZXNzaW9uID09PSBzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIENhbmNlbCBhbnkgaW4tZmxpZ2h0IHJlbmFtZSB3aGVuIHN3aXRjaGluZyBzZXNzaW9ucy5cblx0XHR0aGlzLl9jYW5jZWxUaXRsZUVkaXRpbmcoKTtcblx0XHR0aGlzLl9zZXNzaW9uID0gc2Vzc2lvbjtcblx0XHR0aGlzLl90b29sYmFyLmNvbnRleHQgPSBzZXNzaW9uO1xuXHRcdHRoaXMuX21ldGFUb29sYmFyLmNvbnRleHQgPSBzZXNzaW9uO1xuXHRcdHRoaXMuX3N0YXR1c0ljb24ucmVzZXQoKTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy52YWx1ZSA9IHN0b3JlO1xuXG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlSGVhZGVyKHNlc3Npb24sIHJlYWRlcik7XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX3NldFZpc2libGUoc2Vzc2lvbi5pc0NyZWF0ZWQucmVhZChyZWFkZXIpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVIZWFkZXIoc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24sIHJlYWRlcjogSVJlYWRlcik6IHZvaWQge1xuXHRcdC8vIFNlc3Npb24gaWNvbiBcdTIwMTQgdGhlIFNlc3Npb25TdGF0dXNJY29uIHdpZGdldCBvd25zIHRoZSByZW5kZXJpbmcgKHNwaW5uZXIgdnMuXG5cdFx0Ly8gY29kaWNvbiwgY3Jvc3MtZmFkZSwgcmVkdWNlZC1tb3Rpb24pOyBoZXJlIHdlIGp1c3QgZmVlZCBpdCB0aGUgbGF0ZXN0IHN0YXRlLlxuXHRcdC8vIFRoZSBwdWxsIHJlcXVlc3QgaXMgc3VyZmFjZWQgaW4gdGhlIG1ldGEgcm93LCBzbyBpbiB0ZXJtaW5hbC9kZWZhdWx0IHN0YXRlcyB0aGVcblx0XHQvLyB0aXRsZSBzaG93cyB0aGUgcmVhZC91bnJlYWQgZG90IGluZGljYXRvciAobm8gc2Vzc2lvbiB0eXBlIG9yIFBSIGljb24pLlxuXHRcdGNvbnN0IHN0YXR1cyA9IHNlc3Npb24uc3RhdHVzLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBpc1JlYWQgPSBzZXNzaW9uLmlzUmVhZC5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgaXNBcmNoaXZlZCA9IHNlc3Npb24uaXNBcmNoaXZlZC5yZWFkKHJlYWRlcik7XG5cdFx0dGhpcy5fc3RhdHVzSWNvbi5zZXRTdGF0dXMoc3RhdHVzLCBpc1JlYWQsIGlzQXJjaGl2ZWQpO1xuXG5cdFx0Ly8gU2Vzc2lvbiB0aXRsZSBcdTIwMTQgcXVpY2sgY2hhdHMgdXNlIFwiTmV3IENoYXRcIiBhcyB0aGUgdW50aXRsZWQgZmFsbGJhY2suXG5cdFx0Y29uc3QgaXNRdWlja0NoYXQgPSBzZXNzaW9uLmlzUXVpY2tDaGF0Py5yZWFkKHJlYWRlcikgPz8gZmFsc2U7XG5cdFx0dGhpcy5fdGl0bGVUZXh0RWwudGV4dENvbnRlbnQgPSBzZXNzaW9uLnRpdGxlLnJlYWQocmVhZGVyKSB8fCBnZXRVbnRpdGxlZFNlc3Npb25UaXRsZShpc1F1aWNrQ2hhdCk7XG5cdFx0dGhpcy5fdGl0bGVFbC5jbGFzc0xpc3QudG9nZ2xlKCdlZGl0YWJsZScsIHRoaXMuX2lzVGl0bGVFZGl0YWJsZSgpKTtcblxuXHRcdC8vIE1ldGEgcm93OiBjb250cmlidXRlZCBhY3Rpb24gcGlsbHMgKHdvcmtzcGFjZSBmb2xkZXIgXHUwMEI3IGRpZmYgc3RhdHMgXHUwMEI3IHB1bGwgcmVxdWVzdCkuXG5cdFx0Ly8gUmVhZGluZyB0aGUgc2lnbmFsIHJlLXJ1bnMgdGhpcyBvbiBtZW51IGNoYW5nZXMuXG5cdFx0dGhpcy5fbWV0YUFjdGlvbnNTaWduYWwucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGhhc01ldGFBY3Rpb25zID0gIXRoaXMuX21ldGFUb29sYmFyLmlzRW1wdHkoKTtcblxuXHRcdHRoaXMuX21ldGFSb3cuc3R5bGUuZGlzcGxheSA9IGhhc01ldGFBY3Rpb25zID8gJycgOiAnbm9uZSc7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2FzVmlzaWJsZSA9IHRoaXMuX3Zpc2libGU7XG5cdFx0dGhpcy5fdmlzaWJsZSA9IHZpc2libGU7XG5cdFx0dGhpcy5fY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSB0aGlzLl92aXNpYmxlID8gJycgOiAnbm9uZSc7XG5cdFx0aWYgKHdhc1Zpc2libGUgIT09IHRoaXMuX3Zpc2libGUpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKHRoaXMuX3Zpc2libGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRhcHBseVNlc3Npb25CYXJUaGVtZUNvbG9ycyh0aGlzLl9jb250YWluZXIsIHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSB0aXRsZSBpcyBlZGl0YWJsZSB3aGVuIHRoZSBiYWNraW5nIHByb3ZpZGVyIGRlY2xhcmVzIGl0IHN1cHBvcnRzXG5cdCAqIHJlbmFtaW5nIHRoZSBzZXNzaW9uIChgY2FwYWJpbGl0aWVzLnN1cHBvcnRzUmVuYW1lYCkuIFRoaXMgaXMgdGhlIHNhbWVcblx0ICogc2lnbmFsIHRoYXQgZ2F0ZXMgdGhlIGBSZW5hbWUuLi5gIGNvbnRleHQgbWVudSBhY3Rpb24gaW4gdGhlIHNlc3Npb25zIGxpc3QuXG5cdCAqL1xuXHRwcml2YXRlIF9pc1RpdGxlRWRpdGFibGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fc2Vzc2lvbiAmJiAodGhpcy5fc2Vzc2lvbi5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNSZW5hbWUgPz8gZmFsc2UpO1xuXHR9XG5cblx0c3RhcnRUaXRsZUVkaXRpbmcoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc1RpdGxlRWRpdGFibGUoKSB8fCB0aGlzLl9yZW5hbWVJbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdGFydFRpdGxlRWRpdGluZygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlcGxhY2UgdGhlIHJlbmRlcmVkIHRpdGxlIHRleHQgd2l0aCBhbiBgPGlucHV0PmAgY29udGFpbmluZyB0aGUgY3VycmVudFxuXHQgKiB0aXRsZSAocHJlLXNlbGVjdGVkKS4gRW50ZXIgY29tbWl0cyB2aWEge0BsaW5rIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnJlbmFtZUNoYXR9LFxuXHQgKiBFc2NhcGUgb3IgYmx1ciBjYW5jZWxzLlxuXHQgKi9cblx0cHJpdmF0ZSBfc3RhcnRUaXRsZUVkaXRpbmcoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb247XG5cdFx0aWYgKCFzZXNzaW9uIHx8IHRoaXMuX3JlbmFtZUlucHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5pdGlhbFRpdGxlID0gc2Vzc2lvbi50aXRsZS5nZXQoKTtcblx0XHQvLyBXaGVuIHRoZSBzdG9yZWQgdGl0bGUgaXMgZW1wdHkgdGhlIGhlYWRlciBzaG93cyBhIGxvY2FsaXplZCBmYWxsYmFjay5cblx0XHQvLyBSZWZsZWN0IHRoYXQgYXMgYSBwbGFjZWhvbGRlciByYXRoZXIgdGhhbiBzZWVkaW5nIHRoZSBpbnB1dCB3aXRoIGl0LCBzb1xuXHRcdC8vIHRoZSB1c2VyIG5laXRoZXIgc2VlcyBhIGJsYW5rIGZpZWxkIG5vciBhY2NpZGVudGFsbHkgY29tbWl0cyB0aGUgZmFsbGJhY2suXG5cdFx0Y29uc3QgZmFsbGJhY2tUaXRsZSA9IGdldFVudGl0bGVkU2Vzc2lvblRpdGxlKHNlc3Npb24uaXNRdWlja0NoYXQ/LmdldCgpID8/IGZhbHNlKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcblx0XHRpbnB1dC50eXBlID0gJ3RleHQnO1xuXHRcdGlucHV0LmNsYXNzTmFtZSA9ICdjaGF0LWNvbXBvc2l0ZS1iYXItc2Vzc2lvbi10aXRsZS1pbnB1dCc7XG5cdFx0aW5wdXQudmFsdWUgPSBpbml0aWFsVGl0bGU7XG5cdFx0aW5wdXQucGxhY2Vob2xkZXIgPSBmYWxsYmFja1RpdGxlO1xuXHRcdGlucHV0LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdyZW5hbWVTZXNzaW9uLmFyaWEnLCBcIlJlbmFtZSBzZXNzaW9uXCIpKTtcblx0XHRpbnB1dC5zcGVsbGNoZWNrID0gZmFsc2U7XG5cblx0XHR0aGlzLl90aXRsZVRleHRFbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuX3RpdGxlRWwuYXBwZW5kQ2hpbGQoaW5wdXQpO1xuXHRcdHRoaXMuX3RpdGxlRWwuY2xhc3NMaXN0LmFkZCgnZWRpdGluZycpO1xuXHRcdHRoaXMuX3JlbmFtZUlucHV0ID0gaW5wdXQ7XG5cblx0XHRpbnB1dC5mb2N1cygpO1xuXHRcdGlucHV0LnNlbGVjdCgpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fZWRpdGluZ0Rpc3Bvc2FibGVzLnZhbHVlID0gc3RvcmU7XG5cblx0XHRsZXQgZmluaXNoZWQgPSBmYWxzZTtcblx0XHRjb25zdCBmaW5pc2ggPSAoY29tbWl0OiBib29sZWFuKSA9PiB7XG5cdFx0XHRpZiAoZmluaXNoZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZmluaXNoZWQgPSB0cnVlO1xuXHRcdFx0Y29uc3QgbmV3VGl0bGUgPSBpbnB1dC52YWx1ZS50cmltKCk7XG5cdFx0XHR0aGlzLl9lbmRUaXRsZUVkaXRpbmcoKTtcblx0XHRcdGlmIChjb21taXQgJiYgbmV3VGl0bGUgJiYgbmV3VGl0bGUgIT09IGluaXRpYWxUaXRsZSkge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlXG5cdFx0XHRcdFx0LnJlbmFtZVNlc3Npb24oc2Vzc2lvbiwgbmV3VGl0bGUpXG5cdFx0XHRcdFx0LmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0LCBFdmVudFR5cGUuS0VZX0RPV04sIChlOiBJS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0ZmluaXNoKHRydWUpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRmaW5pc2goZmFsc2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gRG9uJ3QgbGV0IHR5cGluZyBsZWFrIG91dCB0byB3b3JrYmVuY2ggc2hvcnRjdXRzIChlLmcuIFNwYWNlKS5cblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0LCBFdmVudFR5cGUuQkxVUiwgKCkgPT4ge1xuXHRcdFx0ZmluaXNoKGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBTd2FsbG93IGNsaWNrL3BvaW50ZXJkb3duIG9uIHRoZSBpbnB1dCBzbyB0aGUgdGl0bGUncyBjbGljayBoYW5kbGVyXG5cdFx0Ly8gZG9lc24ndCB0cnkgdG8gcmUtZW50ZXIgZWRpdGluZyBtb2RlLiBVc2UgdGhlIGdlbmVyaWMgbW91c2Vkb3duXG5cdFx0Ly8gaGVscGVyIHdoaWNoIHJvdXRlcyB0aHJvdWdoIGBwb2ludGVyZG93bmAgb24gaU9TIHdoZXJlIG1vdXNlIGV2ZW50c1xuXHRcdC8vIGRvbid0IGZpcmUuXG5cdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIoaW5wdXQsIGUgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSkpO1xuXHRcdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXQsIEV2ZW50VHlwZS5DTElDSywgZSA9PiBlLnN0b3BQcm9wYWdhdGlvbigpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxUaXRsZUVkaXRpbmcoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9yZW5hbWVJbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9lbmRUaXRsZUVkaXRpbmcoKTtcblx0fVxuXG5cdHByaXZhdGUgX2VuZFRpdGxlRWRpdGluZygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcmVuYW1lSW5wdXQpIHtcblx0XHRcdHRoaXMuX3JlbmFtZUlucHV0LnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5fcmVuYW1lSW5wdXQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX3RpdGxlVGV4dEVsLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR0aGlzLl90aXRsZUVsLmNsYXNzTGlzdC5yZW1vdmUoJ2VkaXRpbmcnKTtcblx0XHR0aGlzLl9lZGl0aW5nRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxufVxuXG4vKipcbiAqIEEgbGlnaHR3ZWlnaHQgdG9vbGJhciB0aGF0IHJlbmRlcnMgb25seSB0aGUge0BsaW5rIE1lbnVzLlNlc3Npb25CYXJUb29sYmFyfSBtZW51XG4gKiB1c2luZyB0aGUgc2FtZSBgLmNoYXQtY29tcG9zaXRlLWJhci10b29sYmFyYCBzdHlsaW5nLiBVbmxpa2UgdGhlIGZ1bGxcbiAqIHtAbGluayBTZXNzaW9uSGVhZGVyfSwgdGhpcyB0b29sYmFyIGlzIGFic29sdXRlbHkgcG9zaXRpb25lZCBhdCB0aGUgdG9wLXJpZ2h0IG9mXG4gKiB0aGUgc2Vzc2lvbiB2aWV3IGFuZCBkb2VzIG5vdCBhbGxvY2F0ZSBhbnkgdmVydGljYWwgc3BhY2UuXG4gKlxuICogSXQgaXMgc2hvd24gb25seSB3aGVuIHRoZSBob3N0ZWQgc2Vzc2lvbiBleGlzdHMgYnV0IGhhcyBub3QgeWV0IGJlZW4gY3JlYXRlZC5cbiAqL1xuZXhwb3J0IGNsYXNzIFNlc3Npb25WaWV3RmxvYXRpbmdUb29sYmFyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9vbGJhcjogTWVudVdvcmtiZW5jaFRvb2xCYXI7XG5cdHByaXZhdGUgX3Nlc3Npb246IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHRnZXQgZWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRhaW5lcjtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2NvbnRhaW5lciA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXIuY2hhdC1jb21wb3NpdGUtYmFyLXRvb2xiYXItZmxvYXRpbmcnKTtcblx0XHRjb25zdCB0b29sYmFyID0gJCgnLmNoYXQtY29tcG9zaXRlLWJhci10b29sYmFyJyk7XG5cdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHRvb2xiYXIpO1xuXG5cdFx0dGhpcy5fdG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0b29sYmFyLCBNZW51cy5TZXNzaW9uQmFyVG9vbGJhciwge1xuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuSWdub3JlLFxuXHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogdHJ1ZSxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSwgdXNlU2VwYXJhdG9yc0luUHJpbWFyeUFjdGlvbnM6IHRydWUgfSxcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zZXRWaXNpYmxlKGZhbHNlKTtcblx0fVxuXG5cdHNldFNlc3Npb24oc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2Vzc2lvbiA9PT0gc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9uID0gc2Vzc2lvbjtcblx0XHR0aGlzLl90b29sYmFyLmNvbnRleHQgPSBzZXNzaW9uO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLnZhbHVlID0gc3RvcmU7XG5cblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHRoaXMuX3NldFZpc2libGUoZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9zZXRWaXNpYmxlKCFzZXNzaW9uLmlzQ3JlYXRlZC5yZWFkKHJlYWRlcikpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gdmlzaWJsZSA/ICcnIDogJ25vbmUnO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUMvRCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsR0FBRyx1Q0FBdUMsdUJBQXVCLCtCQUErQiwwQkFBMEIsV0FBVyxXQUFXLG9CQUFvQjtBQUM3SyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUErQixpQ0FBaUM7QUFDekUsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBeUIsa0NBQWtDO0FBQzNELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsb0JBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW9CLDRCQUE0QjtBQUN6RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywwQkFBMEIsNkJBQTZCO0FBQ2hFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xD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
