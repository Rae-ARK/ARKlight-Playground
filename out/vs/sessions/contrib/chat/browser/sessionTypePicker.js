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
import { Gesture, EventType as TouchEventType } from "../../../../base/browser/touch.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { localize } from "../../../../nls.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ActionListItemKind } from "../../../../platform/actionWidget/browser/actionList.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsProvidersService } from "../../../services/sessions/browser/sessionsProvidersService.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
import { Emitter } from "../../../../base/common/event.js";
import { isWeb } from "../../../../base/common/platform.js";
import { isEqual } from "../../../../base/common/resources.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IChatSessionsService } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ILanguageModelsService } from "../../../../workbench/contrib/chat/common/languageModels.js";
import { getSessionTypeAvailability, getSessionTypeUnavailableDescription, getSessionTypeUnavailableHover, SessionTypeAvailability } from "../../../../workbench/contrib/chat/browser/agentSessions/sessionTypeAvailability.js";
import { IChatEntitlementService } from "../../../../workbench/services/chat/common/chatEntitlementService.js";
import { markOnboardingTarget } from "../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js";
import { reportNewChatPickerClosed } from "./newChatPickerTelemetry.js";
import { SessionHarnessPickerVisibleContext } from "../../../common/contextkeys.js";
const STORAGE_KEY_LAST_SESSION_TYPE = "sessions.userSelectedSessionType";
function pickEquals(a, b) {
  return a?.providerId === b?.providerId && a?.sessionTypeId === b?.sessionTypeId;
}
const DEFAULT_TELEMETRY_SOURCE = "NewChatSessionTypePicker";
let SessionTypePicker = class extends Disposable {
  constructor(_session, _options, actionWidgetService, sessionsManagementService, sessionsProvidersService, storageService, telemetryService, chatSessionsService, chatEntitlementService, languageModelsService, contextKeyService) {
    super();
    this._session = _session;
    this._options = _options;
    this.actionWidgetService = actionWidgetService;
    this.sessionsManagementService = sessionsManagementService;
    this.sessionsProvidersService = sessionsProvidersService;
    this.storageService = storageService;
    this.telemetryService = telemetryService;
    this.chatSessionsService = chatSessionsService;
    this.chatEntitlementService = chatEntitlementService;
    this.languageModelsService = languageModelsService;
    this._onDidSelectSessionType = this._register(new Emitter());
    this.onDidSelectSessionType = this._onDidSelectSessionType.event;
    /**
     * Fires whenever the effective {@link selectedPick} changes for any reason:
     * an explicit user pick OR a recompute (e.g. a provider advertising its
     * session types late). Unlike {@link onDidSelectSessionType}, which only
     * covers explicit picks, this lets consumers that cache the pick stay in
     * sync when the displayed default shifts on its own.
     */
    this._onDidChangeSelectedPick = this._register(new Emitter());
    this.onDidChangeSelectedPick = this._onDidChangeSelectedPick.event;
    this._modelTargetChatSessionType = observableValue(this, void 0);
    this.modelTargetChatSessionType = this._modelTargetChatSessionType;
    /** Session types the active session's folder can be served by, across all providers. */
    this._folderSessionTypes = [];
    this._folderSourceWatch = this._register(new MutableDisposable());
    this._quickChatSourceWatch = this._register(new MutableDisposable());
    this._renderDisposables = this._register(new DisposableStore());
    this._visibleKey = SessionHarnessPickerVisibleContext.bindTo(contextKeyService);
    this._register(toDisposable(() => this._visibleKey.reset()));
    this._picked = this._readStoredPick();
    this._register(autorun((reader) => {
      this._session.read(reader);
      this._recompute();
    }));
    this._register(this.sessionsManagementService.onDidChangeSessionTypes(() => this._recompute()));
  }
  /**
   * Recompute the available session types and the displayed pick from the
   * current source (session or folder), then refresh the trigger label.
   * Invoked reactively when the session, folder, or advertised types change.
   */
  _recompute() {
    this._folderSessionTypes = this._resolveFolderSessionTypes();
    const previous = this._picked;
    this._picked = this._computeCurrentPick();
    const pick = this._picked;
    if (this._quickChatSource?.get() && pick && !pick.providerId) {
      const concrete = this._folderSessionTypes.find((type) => type.sessionType.id === pick.sessionTypeId);
      if (concrete) {
        this._picked = { providerId: concrete.providerId, sessionTypeId: concrete.sessionType.id };
      }
    }
    this._updateModelTargetChatSessionType();
    this._updateTriggerLabel();
    if (!pickEquals(previous, this._picked)) {
      this._onDidChangeSelectedPick.fire(this._picked);
    }
  }
  /**
   * The session types to offer, sourced from the folder when a folder source
   * is set (see {@link setFolderSource}), otherwise from the active session.
   */
  _resolveFolderSessionTypes() {
    if (this._folderSource) {
      if (this._quickChatSource?.get()) {
        return this.sessionsManagementService.getQuickChatSessionTypes();
      }
      const folderUri = this._folderSource.get();
      return folderUri ? this.sessionsManagementService.getSessionTypesForFolder(folderUri) : [];
    }
    const session = this._session.get();
    return session ? this._sessionTypesForSession(session) : [];
  }
  /** The pick to display for the current source: the active session's type, otherwise the folder or stored default. */
  _computeCurrentPick() {
    const session = this._session.get();
    if (!this._folderSource && session) {
      const pick = { providerId: session.providerId, sessionTypeId: session.sessionType };
      return session.status.get() === SessionStatus.Untitled ? this._offeredPick(pick) : pick;
    }
    if (!this._folderSource) {
      return this._offeredPick(this._readStoredPick());
    }
    if (this._pendingInitialPick) {
      if (this._pickServedByFolder(this._pendingInitialPick)) {
        const pick = this._pendingInitialPick;
        this._pendingInitialPick = void 0;
        return pick;
      }
      return this._pendingInitialPick;
    }
    const candidate = this._picked ?? this._readStoredPick();
    if (this._pickServedByFolder(candidate)) {
      return candidate;
    }
    const stored = this._readStoredPick();
    if (this._pickServedByFolder(stored)) {
      return stored;
    }
    const preferred = this._folderSessionTypes[0];
    return preferred ? { providerId: preferred.providerId, sessionTypeId: preferred.sessionType.id } : void 0;
  }
  _pickServedByFolder(pick) {
    return !!pick && this._folderSessionTypes.some((t) => t.sessionType.id === pick.sessionTypeId && (pick.providerId === void 0 || t.providerId === pick.providerId));
  }
  /**
   * Constrains a pick to the types the picker actually offers, falling back to
   * the preferred (first) type when it doesn't. A remembered pick outlives the
   * harness that produced it: a session type can stop being advertised (e.g.
   * the extension-host Copilot CLI once `chat.agents.copilotCli.hideExtensionHost`
   * is on), and the stored preference still names it. Displaying it as selected
   * while the dropdown hides it would let the user start a session on a harness
   * they can no longer pick.
   *
   * An empty offer list means the types aren't known yet (no session or folder
   * to source them from, or a provider still connecting), so the pick is left
   * alone until something is actually offered.
   */
  _offeredPick(pick) {
    if (this._folderSessionTypes.length === 0 || this._pickServedByFolder(pick)) {
      return pick;
    }
    const preferred = this._folderSessionTypes[0];
    return { providerId: preferred.providerId, sessionTypeId: preferred.sessionType.id };
  }
  /** Drive the picker from a folder instead of the active session, optionally seeding the initial pick. */
  setFolderSource(source, options) {
    this._folderSource = source;
    this._picked = options?.initialPick ?? this._readStoredPick();
    this._pendingInitialPick = options?.preserveUnavailableInitialPick ? options.initialPick : void 0;
    const initialFolder = source.get();
    this._folderSourceWatch.value = autorun((reader) => {
      const folder = source.read(reader);
      if (!isEqual(folder, initialFolder)) {
        this._pendingInitialPick = void 0;
      }
      this._recompute();
    });
  }
  /** Switch a folder-driven picker to the quick-chat type catalog while the source is true. */
  setQuickChatSource(source) {
    this._quickChatSource = source;
    const initialQuickChat = source.get();
    this._quickChatSourceWatch.value = autorun((reader) => {
      const isQuickChat = source.read(reader);
      if (isQuickChat !== initialQuickChat) {
        this._pendingInitialPick = void 0;
      }
      this._recompute();
    });
  }
  get selectedPick() {
    return this._picked;
  }
  /**
   * The session types to offer for a session: all quick-chat types when the
   * session is a workspace-less quick chat, otherwise the folder's types.
   */
  _sessionTypesForSession(session) {
    if (session.isQuickChat?.get() ?? false) {
      return this.sessionsManagementService.getQuickChatSessionTypes();
    }
    const folderUri = session.workspace.get()?.folders[0]?.root;
    return folderUri ? this.sessionsManagementService.getSessionTypesForFolder(folderUri) : [];
  }
  /**
   * The session type the user explicitly picked, read from the stored
   * preference. Unlike {@link selectedPick}, this is independent of any
   * active session's type. Returns `undefined` when the user has never
   * picked a type (or changed away from the default), in which case
   * consumers should fall back to {@link getPreferredSessionType}.
   */
  getUserPickedSessionType() {
    return this._readStoredPick();
  }
  /**
   * The preferred session type for {@link folderUri}: the first entry in
   * the folder's session-type list. Recomputed against the live list, so
   * it follows provider changes (e.g. a late-registering agent host that
   * prepends a new type). Used as the default when the user has made no
   * explicit pick.
   */
  getPreferredSessionType(folderUri) {
    const first = this.sessionsManagementService.getSessionTypesForFolder(folderUri)[0];
    return first ? { providerId: first.providerId, sessionTypeId: first.sessionType.id } : void 0;
  }
  render(container, options) {
    this._renderDisposables.clear();
    const slot = dom.append(container, dom.$(".sessions-chat-picker-slot"));
    if (options?.className) {
      const classNames = options.className.split(/\s+/).filter((className) => className.length > 0);
      if (classNames.length > 0) {
        slot.classList.add(...classNames);
      }
    }
    this._renderDisposables.add({ dispose: () => slot.remove() });
    const trigger = dom.append(slot, dom.$("a.action-label"));
    trigger.tabIndex = 0;
    trigger.role = "button";
    this._triggerElement = trigger;
    this._renderDisposables.add(markOnboardingTarget(trigger, "sessions.newSession.harnessPicker", {
      open: () => this._showPicker()
    }));
    this._updateTriggerLabel();
    this._renderDisposables.add(Gesture.addTarget(trigger));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
        dom.EventHelper.stop(e, true);
        this._showPicker();
      }));
    }
    this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        dom.EventHelper.stop(e, true);
        this._showPicker();
      }
    }));
  }
  /**
   * Override hook for mobile subclasses. Receives the trigger element so
   * the override can decide where to anchor (or that it doesn't need
   * anchoring at all, e.g. for a bottom sheet).
   */
  _showPicker() {
    if (!this._triggerElement || this.actionWidgetService.isVisible) {
      return;
    }
    const folderTypes = this._resolveFolderSessionTypes();
    this._folderSessionTypes = folderTypes;
    this._updateModelTargetChatSessionType();
    if (folderTypes.length <= 1 && this._pickServedByFolder(this._picked)) {
      return;
    }
    const groups = /* @__PURE__ */ new Map();
    for (const folderType of folderTypes) {
      const provider = this.sessionsProvidersService.getProvider(folderType.providerId);
      const groupTitle = provider?.label ?? folderType.providerId;
      const existing = groups.get(groupTitle);
      if (existing) {
        existing.push(folderType);
      } else {
        groups.set(groupTitle, [folderType]);
      }
    }
    const labelCounts = /* @__PURE__ */ new Map();
    for (const { sessionType } of folderTypes) {
      labelCounts.set(sessionType.label, (labelCounts.get(sessionType.label) ?? 0) + 1);
    }
    const hasDuplicateLabels = Array.from(labelCounts.values()).some((count) => count > 1);
    const showSectionHeaders = groups.size > 1 && hasDuplicateLabels;
    const groupedItems = [];
    for (const [groupTitle, types] of groups) {
      if (showSectionHeaders) {
        if (groupedItems.length > 0) {
          groupedItems.push({ kind: ActionListItemKind.Separator, label: "" });
        }
        groupedItems.push({
          kind: ActionListItemKind.Header,
          group: { title: groupTitle },
          label: groupTitle
        });
      }
      for (const { providerId, sessionType } of types) {
        const isCurrent = this._picked?.providerId === providerId && this._picked?.sessionTypeId === sessionType.id;
        const availability = getSessionTypeAvailability(this.chatSessionsService, this.chatEntitlementService, this.languageModelsService, sessionType.chatSessionType ?? sessionType.id);
        const unavailable = availability !== SessionTypeAvailability.Available;
        const item = {
          providerId,
          sessionTypeId: sessionType.id,
          label: sessionType.label,
          ...isCurrent ? { checked: true } : {},
          ...showSectionHeaders ? { groupLabel: groupTitle } : {}
        };
        groupedItems.push({
          kind: ActionListItemKind.Action,
          label: sessionType.label,
          disabled: unavailable,
          ...unavailable ? {
            description: getSessionTypeUnavailableDescription(availability),
            hover: { content: getSessionTypeUnavailableHover(availability) }
          } : {},
          group: {
            title: "",
            icon: sessionType.icon
          },
          item
        });
      }
    }
    const triggerElement = this._triggerElement;
    const delegate = {
      onSelect: (item) => {
        this.actionWidgetService.hide();
        this._handleSelectedSessionType(item);
      },
      onHide: () => {
        triggerElement.focus();
      }
    };
    this.actionWidgetService.show(
      "sessionTypePicker",
      false,
      groupedItems,
      delegate,
      this._triggerElement,
      void 0,
      [],
      {
        getAriaLabel: (element) => element.item?.groupLabel ? localize("sessionTypePicker.itemAriaLabel", "{0}, {1}", element.label ?? "", element.item.groupLabel) : element.label ?? "",
        getWidgetAriaLabel: () => localize("sessionTypePicker.ariaLabel", "Session Type")
      },
      { minWidth: 200 }
    );
  }
  /**
   * Handles the user picking a session type. Emits `newChatPickerClosed`
   * telemetry (with the previously selected type read from storage, or the
   * in-memory field when nothing is stored). The explicit selection is always
   * persisted — picking the preferred (first) type clears the stored
   * preference, any other pick stores it — while {@link onDidSelectSessionType}
   * fires only when the visible pick actually changed.
   *
   * Shared between desktop (action-widget popup) and mobile (bottom
   * sheet) presentations so both surfaces report identical telemetry.
   */
  _handleSelectedSessionType(pick) {
    this._pendingInitialPick = void 0;
    const stored = this._readStoredPick();
    const beforeId = stored?.sessionTypeId ?? this._picked?.sessionTypeId;
    const beforeLabel = this._folderSessionTypes.find((t) => t.sessionType.id === beforeId)?.sessionType.label;
    const afterLabel = this._folderSessionTypes.find((t) => t.providerId === pick.providerId && t.sessionType.id === pick.sessionTypeId)?.sessionType.label;
    const telemetrySource = this._options?.telemetrySource ?? DEFAULT_TELEMETRY_SOURCE;
    reportNewChatPickerClosed(this.telemetryService, {
      id: telemetrySource,
      name: telemetrySource,
      optionIdBefore: beforeId,
      optionIdAfter: pick.sessionTypeId,
      optionLabelBefore: beforeLabel,
      optionLabelAfter: afterLabel,
      isPII: false
    });
    const preferred = this._folderSessionTypes[0];
    const isDefault = !!preferred && preferred.providerId === pick.providerId && preferred.sessionType.id === pick.sessionTypeId;
    const visiblePickChanged = pick.providerId !== this._picked?.providerId || pick.sessionTypeId !== this._picked?.sessionTypeId;
    this._picked = pick;
    this._updateModelTargetChatSessionType();
    if (this._options?.persistSelection !== false) {
      if (isDefault) {
        this._clearStoredPick();
      } else {
        this._writeStoredPick(pick);
      }
    }
    this._updateTriggerLabel();
    if (visiblePickChanged) {
      this._onDidSelectSessionType.fire(pick);
      this._onDidChangeSelectedPick.fire(this._picked);
    }
  }
  _updateModelTargetChatSessionType() {
    const pick = this._picked;
    const selected = pick ? this._folderSessionTypes.find(
      (type) => type.sessionType.id === pick.sessionTypeId && (pick.providerId === void 0 || type.providerId === pick.providerId)
    ) : void 0;
    this._modelTargetChatSessionType.set(selected ? selected.sessionType.chatSessionType ?? selected.sessionType.id : void 0, void 0);
  }
  _readStoredPick() {
    const raw = this.storageService.get(STORAGE_KEY_LAST_SESSION_TYPE, StorageScope.PROFILE);
    if (!raw) {
      return void 0;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.sessionTypeId === "string") {
        return typeof parsed.providerId === "string" ? { providerId: parsed.providerId, sessionTypeId: parsed.sessionTypeId } : { sessionTypeId: parsed.sessionTypeId };
      }
    } catch {
    }
    return { sessionTypeId: raw };
  }
  _writeStoredPick(pick) {
    const stored = { providerId: pick.providerId, sessionTypeId: pick.sessionTypeId };
    this.storageService.store(STORAGE_KEY_LAST_SESSION_TYPE, JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
  /**
   * Forget any explicit preference (e.g. the user re-selected the default
   * type). The display still reflects the in-memory pick, but consumers
   * reading {@link getUserPickedSessionType} fall back to the preferred type.
   */
  _clearStoredPick() {
    this.storageService.remove(STORAGE_KEY_LAST_SESSION_TYPE, StorageScope.PROFILE);
  }
  _updateTriggerLabel() {
    if (!this._triggerElement) {
      this._visibleKey.set(false);
      return;
    }
    dom.clearNode(this._triggerElement);
    const hideForSingleHarness = isWeb && this._folderSessionTypes.length <= 1 && this._pickServedByFolder(this._picked);
    if (this._folderSessionTypes.length === 0 || hideForSingleHarness) {
      this._triggerElement.classList.add("hidden");
      this._visibleKey.set(false);
      return;
    }
    this._triggerElement.classList.remove("hidden");
    this._visibleKey.set(true);
    const currentType = this._folderSessionTypes.find((t) => t.providerId === this._picked?.providerId && t.sessionType.id === this._picked?.sessionTypeId)?.sessionType ?? this._folderSessionTypes.find((t) => t.sessionType.id === this._picked?.sessionTypeId)?.sessionType;
    const modeIcon = currentType?.icon ?? Codicon.terminal;
    const modeLabel = currentType?.label ?? this._picked?.sessionTypeId ?? "";
    dom.append(this._triggerElement, renderIcon(modeIcon));
    const labelSpan = dom.append(this._triggerElement, dom.$("span.sessions-chat-dropdown-label"));
    labelSpan.textContent = modeLabel;
    if (this._options?.showChevron !== false) {
      const chevron = dom.append(this._triggerElement, renderIcon(Codicon.chevronDownCompact));
      chevron.classList.add("sessions-chat-dropdown-chevron");
    }
    this._triggerElement.ariaLabel = localize("sessionTypePicker.triggerAriaLabel", "Pick Session Type, {0}", modeLabel);
  }
};
SessionTypePicker = __decorateClass([
  __decorateParam(2, IActionWidgetService),
  __decorateParam(3, ISessionsManagementService),
  __decorateParam(4, ISessionsProvidersService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IChatSessionsService),
  __decorateParam(8, IChatEntitlementService),
  __decorateParam(9, ILanguageModelsService),
  __decorateParam(10, IContextKeyService)
], SessionTypePicker);
export {
  SessionTypePicker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3Nlc3Npb25UeXBlUGlja2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgR2VzdHVyZSwgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25MaXN0SXRlbUtpbmQsIElBY3Rpb25MaXN0RGVsZWdhdGUsIElBY3Rpb25MaXN0SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbkxpc3QuanMnO1xuaW1wb3J0IHsgSVByb3ZpZGVyU2Vzc2lvblR5cGUsIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IGdldFNlc3Npb25UeXBlQXZhaWxhYmlsaXR5LCBnZXRTZXNzaW9uVHlwZVVuYXZhaWxhYmxlRGVzY3JpcHRpb24sIGdldFNlc3Npb25UeXBlVW5hdmFpbGFibGVIb3ZlciwgU2Vzc2lvblR5cGVBdmFpbGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9zZXNzaW9uVHlwZUF2YWlsYWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG1hcmtPbmJvYXJkaW5nVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvb25ib2FyZGluZy9icm93c2VyL3Nwb3RsaWdodC9vbmJvYXJkaW5nVGFyZ2V0LmpzJztcbmltcG9ydCB7IHJlcG9ydE5ld0NoYXRQaWNrZXJDbG9zZWQgfSBmcm9tICcuL25ld0NoYXRQaWNrZXJUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkhhcm5lc3NQaWNrZXJWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5cbmNvbnN0IFNUT1JBR0VfS0VZX0xBU1RfU0VTU0lPTl9UWVBFID0gJ3Nlc3Npb25zLnVzZXJTZWxlY3RlZFNlc3Npb25UeXBlJztcblxuLyoqXG4gKiBBIHBpY2tlZCBzZXNzaW9uIHR5cGUsIHBhaXJlZCB3aXRoIHRoZSBwcm92aWRlciB0aGF0IHNlcnZlcyBpdC4gVHdvXG4gKiBwcm92aWRlcnMgY2FuIGFkdmVydGlzZSB0aGUgc2FtZSBzZXNzaW9uIHR5cGUgaWQgKGUuZy4gYm90aCBleHBvc2VcbiAqICdjb3BpbG90LWNsaScpLCBzbyBjYWxsZXJzIG5lZWQgYm90aCB0byByb3V0ZSBzZXNzaW9uIGNyZWF0aW9uIHRvIHRoZVxuICogcmlnaHQgcHJvdmlkZXIuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVBpY2tlZFNlc3Npb25UeXBlIHtcblx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uVHlwZUlkOiBzdHJpbmc7XG59XG5cbi8qKlxuICogQSBzdG9yZWQgb3IgaW4tbWVtb3J5IHByZWZlcmVuY2UuIFdoZW4gdGhlIHByb3ZpZGVySWQgaXMgdW5rbm93biAobGVnYWN5XG4gKiBzdG9yYWdlIHRoYXQgb25seSBwZXJzaXN0ZWQgdGhlIHNlc3Npb24gdHlwZSBpZCwgb3IgYSBwaWNrIG1hZGUgYmVmb3JlXG4gKiBhbnkgZm9sZGVyIHdhcyBrbm93bikgdGhlIHBpY2tlciByZXNvbHZlcyBhIHByb3ZpZGVyIGxhemlseSBvbmNlIHRoZVxuICogYWN0aXZlIGZvbGRlciBpcyBlc3RhYmxpc2hlZC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUHJlZmVycmVkU2Vzc2lvblR5cGUge1xuXHRyZWFkb25seSBwcm92aWRlcklkPzogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uVHlwZUlkOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIHBpY2tFcXVhbHMoYTogSVByZWZlcnJlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkLCBiOiBJUHJlZmVycmVkU2Vzc2lvblR5cGUgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIGE/LnByb3ZpZGVySWQgPT09IGI/LnByb3ZpZGVySWQgJiYgYT8uc2Vzc2lvblR5cGVJZCA9PT0gYj8uc2Vzc2lvblR5cGVJZDtcbn1cblxuaW50ZXJmYWNlIElTdG9yZWRTZXNzaW9uVHlwZVBpY2sge1xuXHRyZWFkb25seSBwcm92aWRlcklkPzogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uVHlwZUlkOiBzdHJpbmc7XG59XG5cbi8qKiBEZWZhdWx0IHRlbGVtZXRyeSBzb3VyY2UgdXNlZCB3aGVuIHRoZSBwaWNrZXIgc2VydmVzIHRoZSBOZXcgU2Vzc2lvbiBjb21wb3Nlci4gKi9cbmNvbnN0IERFRkFVTFRfVEVMRU1FVFJZX1NPVVJDRSA9ICdOZXdDaGF0U2Vzc2lvblR5cGVQaWNrZXInO1xuXG4vKipcbiAqIENvbmZpZ3VyZXMgaG93IHRoZSBwaWNrZXIgYmVoYXZlcyB3aGVuIHJldXNlZCBvdXRzaWRlIHRoZSBOZXcgU2Vzc2lvblxuICogY29tcG9zZXIgKGUuZy4gdGhlIGF1dG9tYXRpb25zIGRpYWxvZyksIHdoZXJlIHByb2ZpbGUtd2lkZSBwZXJzaXN0ZW5jZSBhbmRcbiAqIG5ldy1jaGF0IHRlbGVtZXRyeSB3b3VsZCBiZSBpbmNvcnJlY3Qgc2lkZSBlZmZlY3RzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uVHlwZVBpY2tlck9wdGlvbnMge1xuXHQvKipcblx0ICogV2hlbiBgZmFsc2VgIChlLmcuIHRoZSBhdXRvbWF0aW9ucyBkaWFsb2cpLCBhbiBleHBsaWNpdCBwaWNrIGlzXG5cdCAqIG5ldmVyIHdyaXR0ZW4gdG8gb3IgY2xlYXJlZCBmcm9tIHRoZSBwcm9maWxlLXdpZGVcblx0ICoge0BsaW5rIFNUT1JBR0VfS0VZX0xBU1RfU0VTU0lPTl9UWVBFfSBwcmVmZXJlbmNlLCBzbyBwaWNraW5nIGEgdHlwZSBoZXJlXG5cdCAqIGNhbm5vdCBjaGFuZ2UgdGhlIE5ldyBTZXNzaW9uIGRlZmF1bHQuIFRoZSBzdG9yZWQgcHJlZmVyZW5jZSBpcyBzdGlsbCByZWFkXG5cdCAqIHRvIHNlZWQgYSBzZW5zaWJsZSBpbml0aWFsIGRlZmF1bHQuIERlZmF1bHRzIHRvIGB0cnVlYC5cblx0ICovXG5cdHJlYWRvbmx5IHBlcnNpc3RTZWxlY3Rpb24/OiBib29sZWFuO1xuXHQvKiogVGVsZW1ldHJ5IGlkL25hbWUgcmVwb3J0ZWQgb24gc2VsZWN0aW9uLiBEZWZhdWx0cyB0byB7QGxpbmsgREVGQVVMVF9URUxFTUVUUllfU09VUkNFfS4gKi9cblx0cmVhZG9ubHkgdGVsZW1ldHJ5U291cmNlPzogc3RyaW5nO1xuXHQvKipcblx0ICogV2hlbiBgZmFsc2VgLCB0aGUgZHJvcGRvd24gY2hldnJvbiBpcyBub3QgcmVuZGVyZWQgb24gdGhlIHRyaWdnZXIuXG5cdCAqIFRoZSBwaWNrZXIgaXMgc3RpbGwgaW50ZXJhY3RpdmUuIERlZmF1bHRzIHRvIGB0cnVlYC5cblx0ICovXG5cdHJlYWRvbmx5IHNob3dDaGV2cm9uPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBSb3cgaXRlbSByZW5kZXJlZCBpbnNpZGUgdGhlIHNlc3Npb24gdHlwZSBwaWNrZXIgXHUyMDE0IGNhcnJpZXMgYm90aCB0aGVcbiAqIHByb3ZpZGVyIGlkIGFuZCB0aGUgc2Vzc2lvbiB0eXBlIHNvIHdlIGNhbiBkaXNwYXRjaCBjcmVhdGlvbiB0aHJvdWdoXG4gKiB0aGUgY29ycmVjdCBwcm92aWRlciB3aGVuIHRoZSBzYW1lIHR5cGUgaXMgb2ZmZXJlZCBieSBtdWx0aXBsZSBwcm92aWRlcnMuXG4gKi9cbmludGVyZmFjZSBJU2Vzc2lvblR5cGVQaWNrZXJJdGVtIHtcblx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uVHlwZUlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNoZWNrZWQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogUHJvdmlkZXIgZGlzcGxheSBsYWJlbCwgc2V0IHdoZW4gdGhlIHBpY2tlciBzaG93cyBzZWN0aW9uIGhlYWRlcnMgc28gdGhlXG5cdCAqIGFjY2Vzc2liaWxpdHkgbGFiZWwgY2FuIGRpc2FtYmlndWF0ZSBzYW1lLW5hbWVkIHR5cGVzIChlLmcuIFwiQ2xhdWRlXCIpXG5cdCAqIGFjcm9zcyBwcm92aWRlcnMgXHUyMDE0IGhlYWRlcnMgYXJlIHNraXBwZWQgYnkgbGlzdCBuYXZpZ2F0aW9uIGFuZCBhcmVuJ3Rcblx0ICogYW5ub3VuY2VkIG9uIHRoZWlyIG93bi5cblx0ICovXG5cdHJlYWRvbmx5IGdyb3VwTGFiZWw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBTZXNzaW9uVHlwZVBpY2tlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdC8qKlxuXHQgKiBUaGUgY3VycmVudGx5IGRpc3BsYXllZCBwaWNrLiBNYXkgYmUgbWlzc2luZyBgcHJvdmlkZXJJZGAgd2hlbiByZXN0b3JlZFxuXHQgKiBmcm9tIGxlZ2FjeSBzdG9yYWdlIHRoYXQgb25seSBwZXJzaXN0ZWQgdGhlIHNlc3Npb24gdHlwZSBpZCBcdTIwMTQgaXQgd2lsbFxuXHQgKiBiZSByZXNvbHZlZCB0byBhIGNvbmNyZXRlIHByb3ZpZGVyIGxhemlseSB3aGVuIGNvbnN1bWVycyBjcmVhdGUgYVxuXHQgKiBzZXNzaW9uLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9waWNrZWQ6IElQcmVmZXJyZWRTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZFNlbGVjdFNlc3Npb25UeXBlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVBpY2tlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRTZWxlY3RTZXNzaW9uVHlwZSA9IHRoaXMuX29uRGlkU2VsZWN0U2Vzc2lvblR5cGUuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW5ldmVyIHRoZSBlZmZlY3RpdmUge0BsaW5rIHNlbGVjdGVkUGlja30gY2hhbmdlcyBmb3IgYW55IHJlYXNvbjpcblx0ICogYW4gZXhwbGljaXQgdXNlciBwaWNrIE9SIGEgcmVjb21wdXRlIChlLmcuIGEgcHJvdmlkZXIgYWR2ZXJ0aXNpbmcgaXRzXG5cdCAqIHNlc3Npb24gdHlwZXMgbGF0ZSkuIFVubGlrZSB7QGxpbmsgb25EaWRTZWxlY3RTZXNzaW9uVHlwZX0sIHdoaWNoIG9ubHlcblx0ICogY292ZXJzIGV4cGxpY2l0IHBpY2tzLCB0aGlzIGxldHMgY29uc3VtZXJzIHRoYXQgY2FjaGUgdGhlIHBpY2sgc3RheSBpblxuXHQgKiBzeW5jIHdoZW4gdGhlIGRpc3BsYXllZCBkZWZhdWx0IHNoaWZ0cyBvbiBpdHMgb3duLlxuXHQgKi9cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlbGVjdGVkUGljayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQcmVmZXJyZWRTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VsZWN0ZWRQaWNrID0gdGhpcy5fb25EaWRDaGFuZ2VTZWxlY3RlZFBpY2suZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgbW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGU6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4gPSB0aGlzLl9tb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZTtcblxuXHQvKiogU2Vzc2lvbiB0eXBlcyB0aGUgYWN0aXZlIHNlc3Npb24ncyBmb2xkZXIgY2FuIGJlIHNlcnZlZCBieSwgYWNyb3NzIGFsbCBwcm92aWRlcnMuICovXG5cdHByb3RlY3RlZCBfZm9sZGVyU2Vzc2lvblR5cGVzOiBJUHJvdmlkZXJTZXNzaW9uVHlwZVtdID0gW107XG5cblx0LyoqIEZvbGRlciB0aGF0IGRyaXZlcyB0aGUgYXZhaWxhYmxlIHNlc3Npb24gdHlwZXMgd2hlbiBzZXQgdmlhIHtAbGluayBzZXRGb2xkZXJTb3VyY2V9OyBgdW5kZWZpbmVkYCBrZWVwcyBzZXNzaW9uLWRyaXZlbiBiZWhhdmlvci4gKi9cblx0cHJpdmF0ZSBfZm9sZGVyU291cmNlOiBJT2JzZXJ2YWJsZTxVUkkgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mb2xkZXJTb3VyY2VXYXRjaCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBfcXVpY2tDaGF0U291cmNlOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcXVpY2tDaGF0U291cmNlV2F0Y2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgX3BlbmRpbmdJbml0aWFsUGljazogSVByZWZlcnJlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJvdGVjdGVkIF90cmlnZ2VyRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFRyYWNrcyB3aGV0aGVyIHRoZSBoYXJuZXNzIHBpY2tlciB0cmlnZ2VyIGlzIGN1cnJlbnRseSB2aXNpYmxlLiBNaXJyb3JzXG5cdCAqIHRoZSBgLmhpZGRlbmAgc3RhdGUgY29tcHV0ZWQgaW4ge0BsaW5rIF91cGRhdGVUcmlnZ2VyTGFiZWx9LCBzbyB0aGVcblx0ICogbmV3LXNlc3Npb24tdmlldyBvbmJvYXJkaW5nIHRvdXIgY2FuIHNraXAgdGhlIGhhcm5lc3Mgc3RlcCB3aGVuIG9ubHkgYVxuXHQgKiBzaW5nbGUgaGFybmVzcyBjYW4gc2VydmUgdGhlIHNlbGVjdGVkIHdvcmtzcGFjZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Zpc2libGVLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb246IElPYnNlcnZhYmxlPElTZXNzaW9uIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJU2Vzc2lvblR5cGVQaWNrZXJPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJQWN0aW9uV2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlOiBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fdmlzaWJsZUtleSA9IFNlc3Npb25IYXJuZXNzUGlja2VyVmlzaWJsZUNvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fdmlzaWJsZUtleS5yZXNldCgpKSk7XG5cblx0XHQvLyBSZXN0b3JlIHRoZSBwcmV2aW91c2x5IHNlbGVjdGVkIHNlc3Npb24gdHlwZSBmcm9tIHN0b3JhZ2Vcblx0XHR0aGlzLl9waWNrZWQgPSB0aGlzLl9yZWFkU3RvcmVkUGljaygpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9yZWNvbXB1dGUoKTtcblx0XHR9KSk7XG5cdFx0Ly8gUmUtcmVhZCB3aGVuIGEgcHJvdmlkZXIgYWR2ZXJ0aXNlcy9yZW1vdmVzIHNlc3Npb24gdHlwZXMgYXQgcnVudGltZVxuXHRcdC8vIChlLmcuIGEgcmVtb3RlIGFnZW50IGhvc3QgZGlzY292ZXJzIGEgbmV3IGFnZW50KS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMoKCkgPT4gdGhpcy5fcmVjb21wdXRlKCkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNvbXB1dGUgdGhlIGF2YWlsYWJsZSBzZXNzaW9uIHR5cGVzIGFuZCB0aGUgZGlzcGxheWVkIHBpY2sgZnJvbSB0aGVcblx0ICogY3VycmVudCBzb3VyY2UgKHNlc3Npb24gb3IgZm9sZGVyKSwgdGhlbiByZWZyZXNoIHRoZSB0cmlnZ2VyIGxhYmVsLlxuXHQgKiBJbnZva2VkIHJlYWN0aXZlbHkgd2hlbiB0aGUgc2Vzc2lvbiwgZm9sZGVyLCBvciBhZHZlcnRpc2VkIHR5cGVzIGNoYW5nZS5cblx0ICovXG5cdHByb3RlY3RlZCBfcmVjb21wdXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZvbGRlclNlc3Npb25UeXBlcyA9IHRoaXMuX3Jlc29sdmVGb2xkZXJTZXNzaW9uVHlwZXMoKTtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX3BpY2tlZDtcblx0XHR0aGlzLl9waWNrZWQgPSB0aGlzLl9jb21wdXRlQ3VycmVudFBpY2soKTtcblx0XHRjb25zdCBwaWNrID0gdGhpcy5fcGlja2VkO1xuXHRcdGlmICh0aGlzLl9xdWlja0NoYXRTb3VyY2U/LmdldCgpICYmIHBpY2sgJiYgIXBpY2sucHJvdmlkZXJJZCkge1xuXHRcdFx0Y29uc3QgY29uY3JldGUgPSB0aGlzLl9mb2xkZXJTZXNzaW9uVHlwZXMuZmluZCh0eXBlID0+IHR5cGUuc2Vzc2lvblR5cGUuaWQgPT09IHBpY2suc2Vzc2lvblR5cGVJZCk7XG5cdFx0XHRpZiAoY29uY3JldGUpIHtcblx0XHRcdFx0dGhpcy5fcGlja2VkID0geyBwcm92aWRlcklkOiBjb25jcmV0ZS5wcm92aWRlcklkLCBzZXNzaW9uVHlwZUlkOiBjb25jcmV0ZS5zZXNzaW9uVHlwZS5pZCB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVNb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZSgpO1xuXHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXJMYWJlbCgpO1xuXHRcdGlmICghcGlja0VxdWFscyhwcmV2aW91cywgdGhpcy5fcGlja2VkKSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZWxlY3RlZFBpY2suZmlyZSh0aGlzLl9waWNrZWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc2Vzc2lvbiB0eXBlcyB0byBvZmZlciwgc291cmNlZCBmcm9tIHRoZSBmb2xkZXIgd2hlbiBhIGZvbGRlciBzb3VyY2Vcblx0ICogaXMgc2V0IChzZWUge0BsaW5rIHNldEZvbGRlclNvdXJjZX0pLCBvdGhlcndpc2UgZnJvbSB0aGUgYWN0aXZlIHNlc3Npb24uXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX3Jlc29sdmVGb2xkZXJTZXNzaW9uVHlwZXMoKTogSVByb3ZpZGVyU2Vzc2lvblR5cGVbXSB7XG5cdFx0aWYgKHRoaXMuX2ZvbGRlclNvdXJjZSkge1xuXHRcdFx0aWYgKHRoaXMuX3F1aWNrQ2hhdFNvdXJjZT8uZ2V0KCkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRRdWlja0NoYXRTZXNzaW9uVHlwZXMoKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IHRoaXMuX2ZvbGRlclNvdXJjZS5nZXQoKTtcblx0XHRcdHJldHVybiBmb2xkZXJVcmkgPyB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvblR5cGVzRm9yRm9sZGVyKGZvbGRlclVyaSkgOiBbXTtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb24uZ2V0KCk7XG5cdFx0cmV0dXJuIHNlc3Npb24gPyB0aGlzLl9zZXNzaW9uVHlwZXNGb3JTZXNzaW9uKHNlc3Npb24pIDogW107XG5cdH1cblxuXHQvKiogVGhlIHBpY2sgdG8gZGlzcGxheSBmb3IgdGhlIGN1cnJlbnQgc291cmNlOiB0aGUgYWN0aXZlIHNlc3Npb24ncyB0eXBlLCBvdGhlcndpc2UgdGhlIGZvbGRlciBvciBzdG9yZWQgZGVmYXVsdC4gKi9cblx0cHJvdGVjdGVkIF9jb21wdXRlQ3VycmVudFBpY2soKTogSVByZWZlcnJlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIXRoaXMuX2ZvbGRlclNvdXJjZSAmJiBzZXNzaW9uKSB7XG5cdFx0XHQvLyBSZWZsZWN0IHRoZSBzZXNzaW9uJ3MgdHlwZSB3aXRob3V0IHBlcnNpc3RpbmcgaXQ7IHN0b3JhZ2UgY2hhbmdlcyBvbmx5IG9uIGFuIGV4cGxpY2l0IHVzZXIgcGljay5cblx0XHRcdGNvbnN0IHBpY2sgPSB7IHByb3ZpZGVySWQ6IHNlc3Npb24ucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogc2Vzc2lvbi5zZXNzaW9uVHlwZSB9O1xuXHRcdFx0Ly8gQSBjb21taXR0ZWQgc2Vzc2lvbiBrZWVwcyBzaG93aW5nIHRoZSBoYXJuZXNzIGl0IGFjdHVhbGx5IHJ1bnMgb24sXG5cdFx0XHQvLyBldmVuIGlmIHRoYXQgaGFybmVzcyBpcyBubyBsb25nZXIgb2ZmZXJlZC4gQW4gdW5jb21taXR0ZWQgZHJhZnQgaXNcblx0XHRcdC8vIGEgY2hvaWNlIGFib3V0IGEgc2Vzc2lvbiB0aGF0IGRvZXMgbm90IGV4aXN0IHlldCwgc28gaXQgbXVzdCBuZXZlclxuXHRcdFx0Ly8gZGlzcGxheSBhIGhhcm5lc3MgdGhlIHBpY2tlciBkb2Vzbid0IGxpc3QuXG5cdFx0XHRyZXR1cm4gc2Vzc2lvbi5zdGF0dXMuZ2V0KCkgPT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgPyB0aGlzLl9vZmZlcmVkUGljayhwaWNrKSA6IHBpY2s7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fZm9sZGVyU291cmNlKSB7XG5cdFx0XHQvLyBObyBhY3RpdmUgc2Vzc2lvbjoga2VlcCB0aGUgc3RvcmVkIHBpY2sgdG8gc2VlZCB0aGUgbmV4dCBuZXcgc2Vzc2lvbi5cblx0XHRcdHJldHVybiB0aGlzLl9vZmZlcmVkUGljayh0aGlzLl9yZWFkU3RvcmVkUGljaygpKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdJbml0aWFsUGljaykge1xuXHRcdFx0aWYgKHRoaXMuX3BpY2tTZXJ2ZWRCeUZvbGRlcih0aGlzLl9wZW5kaW5nSW5pdGlhbFBpY2spKSB7XG5cdFx0XHRcdGNvbnN0IHBpY2sgPSB0aGlzLl9wZW5kaW5nSW5pdGlhbFBpY2s7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdJbml0aWFsUGljayA9IHVuZGVmaW5lZDtcblx0XHRcdFx0cmV0dXJuIHBpY2s7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGVuZGluZ0luaXRpYWxQaWNrO1xuXHRcdH1cblx0XHRjb25zdCBjYW5kaWRhdGUgPSB0aGlzLl9waWNrZWQgPz8gdGhpcy5fcmVhZFN0b3JlZFBpY2soKTtcblx0XHRpZiAodGhpcy5fcGlja1NlcnZlZEJ5Rm9sZGVyKGNhbmRpZGF0ZSkpIHtcblx0XHRcdHJldHVybiBjYW5kaWRhdGU7XG5cdFx0fVxuXHRcdGNvbnN0IHN0b3JlZCA9IHRoaXMuX3JlYWRTdG9yZWRQaWNrKCk7XG5cdFx0aWYgKHRoaXMuX3BpY2tTZXJ2ZWRCeUZvbGRlcihzdG9yZWQpKSB7XG5cdFx0XHRyZXR1cm4gc3RvcmVkO1xuXHRcdH1cblx0XHRjb25zdCBwcmVmZXJyZWQgPSB0aGlzLl9mb2xkZXJTZXNzaW9uVHlwZXNbMF07XG5cdFx0cmV0dXJuIHByZWZlcnJlZCA/IHsgcHJvdmlkZXJJZDogcHJlZmVycmVkLnByb3ZpZGVySWQsIHNlc3Npb25UeXBlSWQ6IHByZWZlcnJlZC5zZXNzaW9uVHlwZS5pZCB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9waWNrU2VydmVkQnlGb2xkZXIocGljazogSVByZWZlcnJlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhcGljayAmJiB0aGlzLl9mb2xkZXJTZXNzaW9uVHlwZXMuc29tZSh0ID0+XG5cdFx0XHR0LnNlc3Npb25UeXBlLmlkID09PSBwaWNrLnNlc3Npb25UeXBlSWQgJiZcblx0XHRcdChwaWNrLnByb3ZpZGVySWQgPT09IHVuZGVmaW5lZCB8fCB0LnByb3ZpZGVySWQgPT09IHBpY2sucHJvdmlkZXJJZCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnN0cmFpbnMgYSBwaWNrIHRvIHRoZSB0eXBlcyB0aGUgcGlja2VyIGFjdHVhbGx5IG9mZmVycywgZmFsbGluZyBiYWNrIHRvXG5cdCAqIHRoZSBwcmVmZXJyZWQgKGZpcnN0KSB0eXBlIHdoZW4gaXQgZG9lc24ndC4gQSByZW1lbWJlcmVkIHBpY2sgb3V0bGl2ZXMgdGhlXG5cdCAqIGhhcm5lc3MgdGhhdCBwcm9kdWNlZCBpdDogYSBzZXNzaW9uIHR5cGUgY2FuIHN0b3AgYmVpbmcgYWR2ZXJ0aXNlZCAoZS5nLlxuXHQgKiB0aGUgZXh0ZW5zaW9uLWhvc3QgQ29waWxvdCBDTEkgb25jZSBgY2hhdC5hZ2VudHMuY29waWxvdENsaS5oaWRlRXh0ZW5zaW9uSG9zdGBcblx0ICogaXMgb24pLCBhbmQgdGhlIHN0b3JlZCBwcmVmZXJlbmNlIHN0aWxsIG5hbWVzIGl0LiBEaXNwbGF5aW5nIGl0IGFzIHNlbGVjdGVkXG5cdCAqIHdoaWxlIHRoZSBkcm9wZG93biBoaWRlcyBpdCB3b3VsZCBsZXQgdGhlIHVzZXIgc3RhcnQgYSBzZXNzaW9uIG9uIGEgaGFybmVzc1xuXHQgKiB0aGV5IGNhbiBubyBsb25nZXIgcGljay5cblx0ICpcblx0ICogQW4gZW1wdHkgb2ZmZXIgbGlzdCBtZWFucyB0aGUgdHlwZXMgYXJlbid0IGtub3duIHlldCAobm8gc2Vzc2lvbiBvciBmb2xkZXJcblx0ICogdG8gc291cmNlIHRoZW0gZnJvbSwgb3IgYSBwcm92aWRlciBzdGlsbCBjb25uZWN0aW5nKSwgc28gdGhlIHBpY2sgaXMgbGVmdFxuXHQgKiBhbG9uZSB1bnRpbCBzb21ldGhpbmcgaXMgYWN0dWFsbHkgb2ZmZXJlZC5cblx0ICovXG5cdHByaXZhdGUgX29mZmVyZWRQaWNrKHBpY2s6IElQcmVmZXJyZWRTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZCk6IElQcmVmZXJyZWRTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2ZvbGRlclNlc3Npb25UeXBlcy5sZW5ndGggPT09IDAgfHwgdGhpcy5fcGlja1NlcnZlZEJ5Rm9sZGVyKHBpY2spKSB7XG5cdFx0XHRyZXR1cm4gcGljaztcblx0XHR9XG5cdFx0Y29uc3QgcHJlZmVycmVkID0gdGhpcy5fZm9sZGVyU2Vzc2lvblR5cGVzWzBdO1xuXHRcdHJldHVybiB7IHByb3ZpZGVySWQ6IHByZWZlcnJlZC5wcm92aWRlcklkLCBzZXNzaW9uVHlwZUlkOiBwcmVmZXJyZWQuc2Vzc2lvblR5cGUuaWQgfTtcblx0fVxuXG5cdC8qKiBEcml2ZSB0aGUgcGlja2VyIGZyb20gYSBmb2xkZXIgaW5zdGVhZCBvZiB0aGUgYWN0aXZlIHNlc3Npb24sIG9wdGlvbmFsbHkgc2VlZGluZyB0aGUgaW5pdGlhbCBwaWNrLiAqL1xuXHRzZXRGb2xkZXJTb3VyY2Uoc291cmNlOiBJT2JzZXJ2YWJsZTxVUkkgfCB1bmRlZmluZWQ+LCBvcHRpb25zPzogeyByZWFkb25seSBpbml0aWFsUGljaz86IElQcmVmZXJyZWRTZXNzaW9uVHlwZTsgcmVhZG9ubHkgcHJlc2VydmVVbmF2YWlsYWJsZUluaXRpYWxQaWNrPzogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0dGhpcy5fZm9sZGVyU291cmNlID0gc291cmNlO1xuXHRcdHRoaXMuX3BpY2tlZCA9IG9wdGlvbnM/LmluaXRpYWxQaWNrID8/IHRoaXMuX3JlYWRTdG9yZWRQaWNrKCk7XG5cdFx0dGhpcy5fcGVuZGluZ0luaXRpYWxQaWNrID0gb3B0aW9ucz8ucHJlc2VydmVVbmF2YWlsYWJsZUluaXRpYWxQaWNrID8gb3B0aW9ucy5pbml0aWFsUGljayA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpbml0aWFsRm9sZGVyID0gc291cmNlLmdldCgpO1xuXHRcdHRoaXMuX2ZvbGRlclNvdXJjZVdhdGNoLnZhbHVlID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZm9sZGVyID0gc291cmNlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghaXNFcXVhbChmb2xkZXIsIGluaXRpYWxGb2xkZXIpKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdJbml0aWFsUGljayA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlY29tcHV0ZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqIFN3aXRjaCBhIGZvbGRlci1kcml2ZW4gcGlja2VyIHRvIHRoZSBxdWljay1jaGF0IHR5cGUgY2F0YWxvZyB3aGlsZSB0aGUgc291cmNlIGlzIHRydWUuICovXG5cdHNldFF1aWNrQ2hhdFNvdXJjZShzb3VyY2U6IElPYnNlcnZhYmxlPGJvb2xlYW4+KTogdm9pZCB7XG5cdFx0dGhpcy5fcXVpY2tDaGF0U291cmNlID0gc291cmNlO1xuXHRcdGNvbnN0IGluaXRpYWxRdWlja0NoYXQgPSBzb3VyY2UuZ2V0KCk7XG5cdFx0dGhpcy5fcXVpY2tDaGF0U291cmNlV2F0Y2gudmFsdWUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpc1F1aWNrQ2hhdCA9IHNvdXJjZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoaXNRdWlja0NoYXQgIT09IGluaXRpYWxRdWlja0NoYXQpIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ0luaXRpYWxQaWNrID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVjb21wdXRlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRnZXQgc2VsZWN0ZWRQaWNrKCk6IElQcmVmZXJyZWRTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3BpY2tlZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc2Vzc2lvbiB0eXBlcyB0byBvZmZlciBmb3IgYSBzZXNzaW9uOiBhbGwgcXVpY2stY2hhdCB0eXBlcyB3aGVuIHRoZVxuXHQgKiBzZXNzaW9uIGlzIGEgd29ya3NwYWNlLWxlc3MgcXVpY2sgY2hhdCwgb3RoZXJ3aXNlIHRoZSBmb2xkZXIncyB0eXBlcy5cblx0ICovXG5cdHByaXZhdGUgX3Nlc3Npb25UeXBlc0ZvclNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiBJUHJvdmlkZXJTZXNzaW9uVHlwZVtdIHtcblx0XHRpZiAoc2Vzc2lvbi5pc1F1aWNrQ2hhdD8uZ2V0KCkgPz8gZmFsc2UpIHtcblx0XHRcdHJldHVybiB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0UXVpY2tDaGF0U2Vzc2lvblR5cGVzKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGZvbGRlclVyaSA9IHNlc3Npb24ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy5yb290O1xuXHRcdHJldHVybiBmb2xkZXJVcmkgPyB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvblR5cGVzRm9yRm9sZGVyKGZvbGRlclVyaSkgOiBbXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc2Vzc2lvbiB0eXBlIHRoZSB1c2VyIGV4cGxpY2l0bHkgcGlja2VkLCByZWFkIGZyb20gdGhlIHN0b3JlZFxuXHQgKiBwcmVmZXJlbmNlLiBVbmxpa2Uge0BsaW5rIHNlbGVjdGVkUGlja30sIHRoaXMgaXMgaW5kZXBlbmRlbnQgb2YgYW55XG5cdCAqIGFjdGl2ZSBzZXNzaW9uJ3MgdHlwZS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSB1c2VyIGhhcyBuZXZlclxuXHQgKiBwaWNrZWQgYSB0eXBlIChvciBjaGFuZ2VkIGF3YXkgZnJvbSB0aGUgZGVmYXVsdCksIGluIHdoaWNoIGNhc2Vcblx0ICogY29uc3VtZXJzIHNob3VsZCBmYWxsIGJhY2sgdG8ge0BsaW5rIGdldFByZWZlcnJlZFNlc3Npb25UeXBlfS5cblx0ICovXG5cdGdldFVzZXJQaWNrZWRTZXNzaW9uVHlwZSgpOiBJUHJlZmVycmVkU2Vzc2lvblR5cGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZWFkU3RvcmVkUGljaygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBwcmVmZXJyZWQgc2Vzc2lvbiB0eXBlIGZvciB7QGxpbmsgZm9sZGVyVXJpfTogdGhlIGZpcnN0IGVudHJ5IGluXG5cdCAqIHRoZSBmb2xkZXIncyBzZXNzaW9uLXR5cGUgbGlzdC4gUmVjb21wdXRlZCBhZ2FpbnN0IHRoZSBsaXZlIGxpc3QsIHNvXG5cdCAqIGl0IGZvbGxvd3MgcHJvdmlkZXIgY2hhbmdlcyAoZS5nLiBhIGxhdGUtcmVnaXN0ZXJpbmcgYWdlbnQgaG9zdCB0aGF0XG5cdCAqIHByZXBlbmRzIGEgbmV3IHR5cGUpLiBVc2VkIGFzIHRoZSBkZWZhdWx0IHdoZW4gdGhlIHVzZXIgaGFzIG1hZGUgbm9cblx0ICogZXhwbGljaXQgcGljay5cblx0ICovXG5cdGdldFByZWZlcnJlZFNlc3Npb25UeXBlKGZvbGRlclVyaTogVVJJKTogSVByZWZlcnJlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmaXJzdCA9IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uVHlwZXNGb3JGb2xkZXIoZm9sZGVyVXJpKVswXTtcblx0XHRyZXR1cm4gZmlyc3QgPyB7IHByb3ZpZGVySWQ6IGZpcnN0LnByb3ZpZGVySWQsIHNlc3Npb25UeXBlSWQ6IGZpcnN0LnNlc3Npb25UeXBlLmlkIH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgb3B0aW9ucz86IHsgY2xhc3NOYW1lPzogc3RyaW5nIH0pOiB2b2lkIHtcblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3Qgc2xvdCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnNlc3Npb25zLWNoYXQtcGlja2VyLXNsb3QnKSk7XG5cdFx0aWYgKG9wdGlvbnM/LmNsYXNzTmFtZSkge1xuXHRcdFx0Y29uc3QgY2xhc3NOYW1lcyA9IG9wdGlvbnMuY2xhc3NOYW1lLnNwbGl0KC9cXHMrLykuZmlsdGVyKGNsYXNzTmFtZSA9PiBjbGFzc05hbWUubGVuZ3RoID4gMCk7XG5cdFx0XHRpZiAoY2xhc3NOYW1lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHNsb3QuY2xhc3NMaXN0LmFkZCguLi5jbGFzc05hbWVzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gc2xvdC5yZW1vdmUoKSB9KTtcblxuXHRcdGNvbnN0IHRyaWdnZXIgPSBkb20uYXBwZW5kKHNsb3QsIGRvbS4kKCdhLmFjdGlvbi1sYWJlbCcpKTtcblx0XHR0cmlnZ2VyLnRhYkluZGV4ID0gMDtcblx0XHR0cmlnZ2VyLnJvbGUgPSAnYnV0dG9uJztcblx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudCA9IHRyaWdnZXI7XG5cdFx0Ly8gT25ib2FyZGluZyBzcG90bGlnaHQgdGFyZ2V0IFx1MjAxNCBpZCBpcyByZWZlcmVuY2VkIGJ5IHRoZSBcIm5ldyBzZXNzaW9uIHZpZXdcIlxuXHRcdC8vIHRvdXIgaW4gdnMvc2Vzc2lvbnMvY29udHJpYi9vbmJvYXJkaW5nVG91cnMuXG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKG1hcmtPbmJvYXJkaW5nVGFyZ2V0KHRyaWdnZXIsICdzZXNzaW9ucy5uZXdTZXNzaW9uLmhhcm5lc3NQaWNrZXInLCB7XG5cdFx0XHRvcGVuOiAoKSA9PiB0aGlzLl9zaG93UGlja2VyKCksXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXJMYWJlbCgpO1xuXG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKEdlc3R1cmUuYWRkVGFyZ2V0KHRyaWdnZXIpKTtcblx0XHRmb3IgKGNvbnN0IGV2ZW50VHlwZSBvZiBbZG9tLkV2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXSkge1xuXHRcdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodHJpZ2dlciwgZXZlbnRUeXBlLCAoZSkgPT4ge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fc2hvd1BpY2tlcigpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRyaWdnZXIsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fc2hvd1BpY2tlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPdmVycmlkZSBob29rIGZvciBtb2JpbGUgc3ViY2xhc3Nlcy4gUmVjZWl2ZXMgdGhlIHRyaWdnZXIgZWxlbWVudCBzb1xuXHQgKiB0aGUgb3ZlcnJpZGUgY2FuIGRlY2lkZSB3aGVyZSB0byBhbmNob3IgKG9yIHRoYXQgaXQgZG9lc24ndCBuZWVkXG5cdCAqIGFuY2hvcmluZyBhdCBhbGwsIGUuZy4gZm9yIGEgYm90dG9tIHNoZWV0KS5cblx0ICovXG5cdHByb3RlY3RlZCBfc2hvd1BpY2tlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3RyaWdnZXJFbGVtZW50IHx8IHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZWNvbXB1dGUgdHlwZXMgZnJlc2ggYXQgb3BlbiB0aW1lIHNvIGEgbGF0ZS1yZWdpc3RlcmluZyBwcm92aWRlclxuXHRcdC8vIChlLmcuIExvY2FsIEFnZW50IEhvc3Qgd2hvc2Ugc2Vzc2lvbiB0eXBlcyBhcmUgcG9wdWxhdGVkIG9ubHkgYWZ0ZXJcblx0XHQvLyBhZ2VudCBkaXNjb3ZlcnkpIHNob3dzIHVwIHdpdGhvdXQgd2FpdGluZyBmb3IgdGhlIHJlZnJlc2ggZXZlbnQgdG9cblx0XHQvLyBsYW5kIGJlZm9yZSB0aGUgdXNlciBjbGlja3MuXG5cdFx0Y29uc3QgZm9sZGVyVHlwZXMgPSB0aGlzLl9yZXNvbHZlRm9sZGVyU2Vzc2lvblR5cGVzKCk7XG5cdFx0dGhpcy5fZm9sZGVyU2Vzc2lvblR5cGVzID0gZm9sZGVyVHlwZXM7XG5cdFx0dGhpcy5fdXBkYXRlTW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGUoKTtcblxuXHRcdGlmIChmb2xkZXJUeXBlcy5sZW5ndGggPD0gMSAmJiB0aGlzLl9waWNrU2VydmVkQnlGb2xkZXIodGhpcy5fcGlja2VkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEdyb3VwIHNlc3Npb24gdHlwZXMgYnkgdGhlaXIgcHJvdmlkZXIncyBkaXNwbGF5IGxhYmVsLCBwcmVzZXJ2aW5nXG5cdFx0Ly8gZmlyc3Qtc2VlbiBvcmRlci4gUHJvdmlkZXJzIGNhbiBiZSBpbnRlcmxlYXZlZCBpbiB0aGUgZm9sZGVyIGxpc3QgYW5kXG5cdFx0Ly8gZGlzdGluY3QgcHJvdmlkZXJzIGNhbiBzaGFyZSBhIGxhYmVsLCBzbyBjb2xsZWN0aW5nIGJ5IGxhYmVsIGF2b2lkc1xuXHRcdC8vIHJlbmRlcmluZyB0aGUgc2FtZSBzZWN0aW9uIGhlYWRlciBtb3JlIHRoYW4gb25jZS5cblx0XHRjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgSVByb3ZpZGVyU2Vzc2lvblR5cGVbXT4oKTtcblx0XHRmb3IgKGNvbnN0IGZvbGRlclR5cGUgb2YgZm9sZGVyVHlwZXMpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXIoZm9sZGVyVHlwZS5wcm92aWRlcklkKTtcblx0XHRcdGNvbnN0IGdyb3VwVGl0bGUgPSBwcm92aWRlcj8ubGFiZWwgPz8gZm9sZGVyVHlwZS5wcm92aWRlcklkO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBncm91cHMuZ2V0KGdyb3VwVGl0bGUpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdGV4aXN0aW5nLnB1c2goZm9sZGVyVHlwZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRncm91cHMuc2V0KGdyb3VwVGl0bGUsIFtmb2xkZXJUeXBlXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFNlY3Rpb24gaGVhZGVycyBleGlzdCB0byBkaXNhbWJpZ3VhdGUgc2Vzc2lvbiB0eXBlcyB0aGF0IHNoYXJlIGFcblx0XHQvLyBsYWJlbCBhY3Jvc3MgcHJvdmlkZXJzIChlLmcuIHR3byBwcm92aWRlcnMgYm90aCBvZmZlcmluZyBcIkNsYXVkZVwiKS5cblx0XHQvLyBXaGVuIGV2ZXJ5IHR5cGUncyBsYWJlbCBpcyB1bmlxdWUgdGhlcmUgaXMgbm90aGluZyB0byBkaXNhbWJpZ3VhdGUsXG5cdFx0Ly8gc28gcmVuZGVyIGEgZmxhdCBsaXN0IHdpdGhvdXQgZ3JvdXAgaGVhZGVycyBldmVuIGlmIG11bHRpcGxlXG5cdFx0Ly8gcHJvdmlkZXJzIGNvbnRyaWJ1dGUuXG5cdFx0Y29uc3QgbGFiZWxDb3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdGZvciAoY29uc3QgeyBzZXNzaW9uVHlwZSB9IG9mIGZvbGRlclR5cGVzKSB7XG5cdFx0XHRsYWJlbENvdW50cy5zZXQoc2Vzc2lvblR5cGUubGFiZWwsIChsYWJlbENvdW50cy5nZXQoc2Vzc2lvblR5cGUubGFiZWwpID8/IDApICsgMSk7XG5cdFx0fVxuXHRcdGNvbnN0IGhhc0R1cGxpY2F0ZUxhYmVscyA9IEFycmF5LmZyb20obGFiZWxDb3VudHMudmFsdWVzKCkpLnNvbWUoY291bnQgPT4gY291bnQgPiAxKTtcblx0XHRjb25zdCBzaG93U2VjdGlvbkhlYWRlcnMgPSBncm91cHMuc2l6ZSA+IDEgJiYgaGFzRHVwbGljYXRlTGFiZWxzO1xuXG5cdFx0Y29uc3QgZ3JvdXBlZEl0ZW1zOiBJQWN0aW9uTGlzdEl0ZW08SVNlc3Npb25UeXBlUGlja2VySXRlbT5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2dyb3VwVGl0bGUsIHR5cGVzXSBvZiBncm91cHMpIHtcblx0XHRcdGlmIChzaG93U2VjdGlvbkhlYWRlcnMpIHtcblx0XHRcdFx0aWYgKGdyb3VwZWRJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Z3JvdXBlZEl0ZW1zLnB1c2goeyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yLCBsYWJlbDogJycgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Z3JvdXBlZEl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5IZWFkZXIsXG5cdFx0XHRcdFx0Z3JvdXA6IHsgdGl0bGU6IGdyb3VwVGl0bGUgfSxcblx0XHRcdFx0XHRsYWJlbDogZ3JvdXBUaXRsZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHsgcHJvdmlkZXJJZCwgc2Vzc2lvblR5cGUgfSBvZiB0eXBlcykge1xuXHRcdFx0XHRjb25zdCBpc0N1cnJlbnQgPSB0aGlzLl9waWNrZWQ/LnByb3ZpZGVySWQgPT09IHByb3ZpZGVySWQgJiYgdGhpcy5fcGlja2VkPy5zZXNzaW9uVHlwZUlkID09PSBzZXNzaW9uVHlwZS5pZDtcblx0XHRcdFx0Y29uc3QgYXZhaWxhYmlsaXR5ID0gZ2V0U2Vzc2lvblR5cGVBdmFpbGFiaWxpdHkodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBzZXNzaW9uVHlwZS5jaGF0U2Vzc2lvblR5cGUgPz8gc2Vzc2lvblR5cGUuaWQpO1xuXHRcdFx0XHRjb25zdCB1bmF2YWlsYWJsZSA9IGF2YWlsYWJpbGl0eSAhPT0gU2Vzc2lvblR5cGVBdmFpbGFiaWxpdHkuQXZhaWxhYmxlO1xuXHRcdFx0XHRjb25zdCBpdGVtOiBJU2Vzc2lvblR5cGVQaWNrZXJJdGVtID0ge1xuXHRcdFx0XHRcdHByb3ZpZGVySWQsXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGVJZDogc2Vzc2lvblR5cGUuaWQsXG5cdFx0XHRcdFx0bGFiZWw6IHNlc3Npb25UeXBlLmxhYmVsLFxuXHRcdFx0XHRcdC4uLihpc0N1cnJlbnQgPyB7IGNoZWNrZWQ6IHRydWUgfSA6IHt9KSxcblx0XHRcdFx0XHQuLi4oc2hvd1NlY3Rpb25IZWFkZXJzID8geyBncm91cExhYmVsOiBncm91cFRpdGxlIH0gOiB7fSksXG5cdFx0XHRcdH07XG5cdFx0XHRcdGdyb3VwZWRJdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLFxuXHRcdFx0XHRcdGxhYmVsOiBzZXNzaW9uVHlwZS5sYWJlbCxcblx0XHRcdFx0XHRkaXNhYmxlZDogdW5hdmFpbGFibGUsXG5cdFx0XHRcdFx0Li4uKHVuYXZhaWxhYmxlID8ge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGdldFNlc3Npb25UeXBlVW5hdmFpbGFibGVEZXNjcmlwdGlvbihhdmFpbGFiaWxpdHkpLFxuXHRcdFx0XHRcdFx0aG92ZXI6IHsgY29udGVudDogZ2V0U2Vzc2lvblR5cGVVbmF2YWlsYWJsZUhvdmVyKGF2YWlsYWJpbGl0eSkgfSxcblx0XHRcdFx0XHR9IDoge30pLFxuXHRcdFx0XHRcdGdyb3VwOiB7XG5cdFx0XHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdFx0XHRpY29uOiBzZXNzaW9uVHlwZS5pY29uLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aXRlbSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJpZ2dlckVsZW1lbnQgPSB0aGlzLl90cmlnZ2VyRWxlbWVudDtcblx0XHRjb25zdCBkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxJU2Vzc2lvblR5cGVQaWNrZXJJdGVtPiA9IHtcblx0XHRcdG9uU2VsZWN0OiAoaXRlbSkgPT4ge1xuXHRcdFx0XHR0aGlzLmFjdGlvbldpZGdldFNlcnZpY2UuaGlkZSgpO1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVTZWxlY3RlZFNlc3Npb25UeXBlKGl0ZW0pO1xuXHRcdFx0fSxcblx0XHRcdG9uSGlkZTogKCkgPT4geyB0cmlnZ2VyRWxlbWVudC5mb2N1cygpOyB9LFxuXHRcdH07XG5cblx0XHR0aGlzLmFjdGlvbldpZGdldFNlcnZpY2Uuc2hvdzxJU2Vzc2lvblR5cGVQaWNrZXJJdGVtPihcblx0XHRcdCdzZXNzaW9uVHlwZVBpY2tlcicsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGdyb3VwZWRJdGVtcyxcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRbXSxcblx0XHRcdHtcblx0XHRcdFx0Z2V0QXJpYUxhYmVsOiAoZWxlbWVudCkgPT4gZWxlbWVudC5pdGVtPy5ncm91cExhYmVsID8gbG9jYWxpemUoJ3Nlc3Npb25UeXBlUGlja2VyLml0ZW1BcmlhTGFiZWwnLCBcInswfSwgezF9XCIsIGVsZW1lbnQubGFiZWwgPz8gJycsIGVsZW1lbnQuaXRlbS5ncm91cExhYmVsKSA6IChlbGVtZW50LmxhYmVsID8/ICcnKSxcblx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsOiAoKSA9PiBsb2NhbGl6ZSgnc2Vzc2lvblR5cGVQaWNrZXIuYXJpYUxhYmVsJywgXCJTZXNzaW9uIFR5cGVcIiksXG5cdFx0XHR9LFxuXHRcdFx0eyBtaW5XaWR0aDogMjAwIH0sXG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIHRoZSB1c2VyIHBpY2tpbmcgYSBzZXNzaW9uIHR5cGUuIEVtaXRzIGBuZXdDaGF0UGlja2VyQ2xvc2VkYFxuXHQgKiB0ZWxlbWV0cnkgKHdpdGggdGhlIHByZXZpb3VzbHkgc2VsZWN0ZWQgdHlwZSByZWFkIGZyb20gc3RvcmFnZSwgb3IgdGhlXG5cdCAqIGluLW1lbW9yeSBmaWVsZCB3aGVuIG5vdGhpbmcgaXMgc3RvcmVkKS4gVGhlIGV4cGxpY2l0IHNlbGVjdGlvbiBpcyBhbHdheXNcblx0ICogcGVyc2lzdGVkIFx1MjAxNCBwaWNraW5nIHRoZSBwcmVmZXJyZWQgKGZpcnN0KSB0eXBlIGNsZWFycyB0aGUgc3RvcmVkXG5cdCAqIHByZWZlcmVuY2UsIGFueSBvdGhlciBwaWNrIHN0b3JlcyBpdCBcdTIwMTQgd2hpbGUge0BsaW5rIG9uRGlkU2VsZWN0U2Vzc2lvblR5cGV9XG5cdCAqIGZpcmVzIG9ubHkgd2hlbiB0aGUgdmlzaWJsZSBwaWNrIGFjdHVhbGx5IGNoYW5nZWQuXG5cdCAqXG5cdCAqIFNoYXJlZCBiZXR3ZWVuIGRlc2t0b3AgKGFjdGlvbi13aWRnZXQgcG9wdXApIGFuZCBtb2JpbGUgKGJvdHRvbVxuXHQgKiBzaGVldCkgcHJlc2VudGF0aW9ucyBzbyBib3RoIHN1cmZhY2VzIHJlcG9ydCBpZGVudGljYWwgdGVsZW1ldHJ5LlxuXHQgKi9cblx0cHJvdGVjdGVkIF9oYW5kbGVTZWxlY3RlZFNlc3Npb25UeXBlKHBpY2s6IElQaWNrZWRTZXNzaW9uVHlwZSk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdJbml0aWFsUGljayA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzdG9yZWQgPSB0aGlzLl9yZWFkU3RvcmVkUGljaygpO1xuXHRcdGNvbnN0IGJlZm9yZUlkID0gc3RvcmVkPy5zZXNzaW9uVHlwZUlkID8/IHRoaXMuX3BpY2tlZD8uc2Vzc2lvblR5cGVJZDtcblx0XHRjb25zdCBiZWZvcmVMYWJlbCA9IHRoaXMuX2ZvbGRlclNlc3Npb25UeXBlcy5maW5kKHQgPT4gdC5zZXNzaW9uVHlwZS5pZCA9PT0gYmVmb3JlSWQpPy5zZXNzaW9uVHlwZS5sYWJlbDtcblx0XHRjb25zdCBhZnRlckxhYmVsID0gdGhpcy5fZm9sZGVyU2Vzc2lvblR5cGVzLmZpbmQodCA9PiB0LnByb3ZpZGVySWQgPT09IHBpY2sucHJvdmlkZXJJZCAmJiB0LnNlc3Npb25UeXBlLmlkID09PSBwaWNrLnNlc3Npb25UeXBlSWQpPy5zZXNzaW9uVHlwZS5sYWJlbDtcblxuXHRcdGNvbnN0IHRlbGVtZXRyeVNvdXJjZSA9IHRoaXMuX29wdGlvbnM/LnRlbGVtZXRyeVNvdXJjZSA/PyBERUZBVUxUX1RFTEVNRVRSWV9TT1VSQ0U7XG5cdFx0cmVwb3J0TmV3Q2hhdFBpY2tlckNsb3NlZCh0aGlzLnRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdGlkOiB0ZWxlbWV0cnlTb3VyY2UsXG5cdFx0XHRuYW1lOiB0ZWxlbWV0cnlTb3VyY2UsXG5cdFx0XHRvcHRpb25JZEJlZm9yZTogYmVmb3JlSWQsXG5cdFx0XHRvcHRpb25JZEFmdGVyOiBwaWNrLnNlc3Npb25UeXBlSWQsXG5cdFx0XHRvcHRpb25MYWJlbEJlZm9yZTogYmVmb3JlTGFiZWwsXG5cdFx0XHRvcHRpb25MYWJlbEFmdGVyOiBhZnRlckxhYmVsLFxuXHRcdFx0aXNQSUk6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0Ly8gUGVyc2lzdCB0aGUgZXhwbGljaXQgc2VsZWN0aW9uIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciB0aGUgdmlzaWJsZVxuXHRcdC8vIHBpY2sgY2hhbmdlZCAodGhlIHZpc2libGUgcGljayBtYXkgcmVmbGVjdCB0aGUgYWN0aXZlIHNlc3Npb24gcmF0aGVyXG5cdFx0Ly8gdGhhbiB0aGUgc3RvcmVkIHByZWZlcmVuY2UpOiBwaWNraW5nIHRoZSBwcmVmZXJyZWQgKGZpcnN0KSB0eXBlIG1lYW5zXG5cdFx0Ly8gXCJubyBleHBsaWNpdCBwcmVmZXJlbmNlXCIgYW5kIGNsZWFycyB0aGUgc3RvcmVkIHBpY2sgc28gdGhlIHNlc3Npb25cblx0XHQvLyBrZWVwcyB0cmFja2luZyB0aGUgcHJlZmVycmVkIHR5cGUgYXMgdGhlIGZvbGRlcidzIGxpc3QgY2hhbmdlczsgYW55XG5cdFx0Ly8gb3RoZXIgZXhwbGljaXQgcGljayBpcyBzdG9yZWQuXG5cdFx0Y29uc3QgcHJlZmVycmVkID0gdGhpcy5fZm9sZGVyU2Vzc2lvblR5cGVzWzBdO1xuXHRcdGNvbnN0IGlzRGVmYXVsdCA9ICEhcHJlZmVycmVkICYmIHByZWZlcnJlZC5wcm92aWRlcklkID09PSBwaWNrLnByb3ZpZGVySWQgJiYgcHJlZmVycmVkLnNlc3Npb25UeXBlLmlkID09PSBwaWNrLnNlc3Npb25UeXBlSWQ7XG5cdFx0Y29uc3QgdmlzaWJsZVBpY2tDaGFuZ2VkID0gcGljay5wcm92aWRlcklkICE9PSB0aGlzLl9waWNrZWQ/LnByb3ZpZGVySWQgfHwgcGljay5zZXNzaW9uVHlwZUlkICE9PSB0aGlzLl9waWNrZWQ/LnNlc3Npb25UeXBlSWQ7XG5cdFx0Ly8gcHJvZmlsZS13aWRlIHByZWZlcmVuY2UgaXMgZ2F0ZWQgc28gbm9uLXBlcnNpc3RpbmcgY2FsbGVycyAoZS5nLiB0aGVcblx0XHQvLyBhdXRvbWF0aW9ucyBkaWFsb2cpIGNhbiBwaWNrIGEgdHlwZSB3aXRob3V0IGNoYW5naW5nIHRoZSBOZXcgU2Vzc2lvbiBkZWZhdWx0XG5cdFx0dGhpcy5fcGlja2VkID0gcGljaztcblx0XHR0aGlzLl91cGRhdGVNb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZSgpO1xuXHRcdGlmICh0aGlzLl9vcHRpb25zPy5wZXJzaXN0U2VsZWN0aW9uICE9PSBmYWxzZSkge1xuXHRcdFx0aWYgKGlzRGVmYXVsdCkge1xuXHRcdFx0XHR0aGlzLl9jbGVhclN0b3JlZFBpY2soKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3dyaXRlU3RvcmVkUGljayhwaWNrKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gRm9sZGVyLWRyaXZlbiBjYWxsZXJzIGhhdmUgbm8gc2Vzc2lvbiBjaGFuZ2UgdG8gcmUtcnVuIHRoZSByZWZyZXNoIGF1dG9ydW4sIHNvIHJlZnJlc2ggdGhlIGxhYmVsIGhlcmUuXG5cdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckxhYmVsKCk7XG5cdFx0Ly8gT25seSBub3RpZnkgKGFuZCB0cmlnZ2VyIGRyYWZ0IHJlY3JlYXRpb24pIHdoZW4gdGhlIHZpc2libGUgcGlja1xuXHRcdC8vIGFjdHVhbGx5IGNoYW5nZWQsIHRvIGF2b2lkIHVubmVjZXNzYXJ5IHdvcmsuXG5cdFx0aWYgKHZpc2libGVQaWNrQ2hhbmdlZCkge1xuXHRcdFx0dGhpcy5fb25EaWRTZWxlY3RTZXNzaW9uVHlwZS5maXJlKHBpY2spO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZWxlY3RlZFBpY2suZmlyZSh0aGlzLl9waWNrZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU1vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHBpY2sgPSB0aGlzLl9waWNrZWQ7XG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSBwaWNrID8gdGhpcy5fZm9sZGVyU2Vzc2lvblR5cGVzLmZpbmQodHlwZSA9PlxuXHRcdFx0dHlwZS5zZXNzaW9uVHlwZS5pZCA9PT0gcGljay5zZXNzaW9uVHlwZUlkXG5cdFx0XHQmJiAocGljay5wcm92aWRlcklkID09PSB1bmRlZmluZWQgfHwgdHlwZS5wcm92aWRlcklkID09PSBwaWNrLnByb3ZpZGVySWQpXG5cdFx0KSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9tb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZS5zZXQoc2VsZWN0ZWQgPyBzZWxlY3RlZC5zZXNzaW9uVHlwZS5jaGF0U2Vzc2lvblR5cGUgPz8gc2VsZWN0ZWQuc2Vzc2lvblR5cGUuaWQgOiB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkU3RvcmVkUGljaygpOiBJUHJlZmVycmVkU2Vzc2lvblR5cGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFNUT1JBR0VfS0VZX0xBU1RfU0VTU0lPTl9UWVBFLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIFRyeSBwYXJzaW5nIGFzIHRoZSBuZXcgSlNPTiBzaGFwZSBmaXJzdDsgZmFsbCBiYWNrIHRvIHRoZSBsZWdhY3lcblx0XHQvLyBzaGFwZSB3aGVyZSBvbmx5IHRoZSBzZXNzaW9uVHlwZUlkIHN0cmluZyB3YXMgc3RvcmVkLlxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdykgYXMgSVN0b3JlZFNlc3Npb25UeXBlUGljaztcblx0XHRcdGlmIChwYXJzZWQgJiYgdHlwZW9mIHBhcnNlZC5zZXNzaW9uVHlwZUlkID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRyZXR1cm4gdHlwZW9mIHBhcnNlZC5wcm92aWRlcklkID09PSAnc3RyaW5nJ1xuXHRcdFx0XHRcdD8geyBwcm92aWRlcklkOiBwYXJzZWQucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogcGFyc2VkLnNlc3Npb25UeXBlSWQgfVxuXHRcdFx0XHRcdDogeyBzZXNzaW9uVHlwZUlkOiBwYXJzZWQuc2Vzc2lvblR5cGVJZCB9O1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gTm90IEpTT04gXHUyMDE0IGZhbGwgdGhyb3VnaCB0byBsZWdhY3kgcmF3LXN0cmluZyBoYW5kbGluZy5cblx0XHR9XG5cdFx0Ly8gTGVnYWN5IHJhdyBzdHJpbmcgd2FzIGp1c3QgdGhlIHNlc3Npb24gdHlwZSBpZC4gUmVzb2x1dGlvbiB0byBhXG5cdFx0Ly8gcHJvdmlkZXIgaGFwcGVucyBsYXppbHkgb25jZSB0aGUgYWN0aXZlIGZvbGRlciBpcyBrbm93bi5cblx0XHRyZXR1cm4geyBzZXNzaW9uVHlwZUlkOiByYXcgfTtcblx0fVxuXG5cdHByaXZhdGUgX3dyaXRlU3RvcmVkUGljayhwaWNrOiBJUGlja2VkU2Vzc2lvblR5cGUpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZWQ6IElTdG9yZWRTZXNzaW9uVHlwZVBpY2sgPSB7IHByb3ZpZGVySWQ6IHBpY2sucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogcGljay5zZXNzaW9uVHlwZUlkIH07XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9MQVNUX1NFU1NJT05fVFlQRSwgSlNPTi5zdHJpbmdpZnkoc3RvcmVkKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHQvKipcblx0ICogRm9yZ2V0IGFueSBleHBsaWNpdCBwcmVmZXJlbmNlIChlLmcuIHRoZSB1c2VyIHJlLXNlbGVjdGVkIHRoZSBkZWZhdWx0XG5cdCAqIHR5cGUpLiBUaGUgZGlzcGxheSBzdGlsbCByZWZsZWN0cyB0aGUgaW4tbWVtb3J5IHBpY2ssIGJ1dCBjb25zdW1lcnNcblx0ICogcmVhZGluZyB7QGxpbmsgZ2V0VXNlclBpY2tlZFNlc3Npb25UeXBlfSBmYWxsIGJhY2sgdG8gdGhlIHByZWZlcnJlZCB0eXBlLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2xlYXJTdG9yZWRQaWNrKCk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFNUT1JBR0VfS0VZX0xBU1RfU0VTU0lPTl9UWVBFLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUcmlnZ2VyTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90cmlnZ2VyRWxlbWVudCkge1xuXHRcdFx0dGhpcy5fdmlzaWJsZUtleS5zZXQoZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fdHJpZ2dlckVsZW1lbnQpO1xuXG5cdFx0Ly8gSW4gd2ViICh2c2NvZGUuZGV2L2FnZW50cykgdGhlIGhvc3QgZmlsdGVyIGFscmVhZHkgc2NvcGVzIHRoZVxuXHRcdC8vIHdvcmtiZW5jaCB0byBhIHNpbmdsZSBhZ2VudCBob3N0LCBzbyB3aGVuIHRoYXQgaG9zdCBhZHZlcnRpc2VzIG9ubHlcblx0XHQvLyBvbmUgaGFybmVzcyB0aGVyZSBpcyBub3RoaW5nIHRvIHBpY2sgXHUyMDE0IGhpZGUgdGhlIHRyaWdnZXIgZW50aXJlbHkuXG5cdFx0Ly8gTm90ZTogdGhlIGV4aXN0aW5nIENTUyBydWxlIG9uIGAuc2Vzc2lvbi13b3Jrc3BhY2UtcGlja2VyLXdpdGgtbGFiZWxgXG5cdFx0Ly8gdXNlcyBgOmhhcygrIC5zZXNzaW9ucy1jaGF0LXNlc3Npb24tdHlwZS1waWNrZXIgLmFjdGlvbi1sYWJlbC5oaWRkZW4pYFxuXHRcdC8vIHRvIGFsc28gaGlkZSB0aGUgXCJ3aXRoXCIgY29ubmVjdG9yIHdoZW4gdGhlIHRyaWdnZXIgaXMgaGlkZGVuLlxuXHRcdGNvbnN0IGhpZGVGb3JTaW5nbGVIYXJuZXNzID0gaXNXZWIgJiYgdGhpcy5fZm9sZGVyU2Vzc2lvblR5cGVzLmxlbmd0aCA8PSAxICYmIHRoaXMuX3BpY2tTZXJ2ZWRCeUZvbGRlcih0aGlzLl9waWNrZWQpO1xuXHRcdGlmICh0aGlzLl9mb2xkZXJTZXNzaW9uVHlwZXMubGVuZ3RoID09PSAwIHx8IGhpZGVGb3JTaW5nbGVIYXJuZXNzKSB7XG5cdFx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHRcdHRoaXMuX3Zpc2libGVLZXkuc2V0KGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcblx0XHR0aGlzLl92aXNpYmxlS2V5LnNldCh0cnVlKTtcblx0XHRjb25zdCBjdXJyZW50VHlwZSA9IHRoaXMuX2ZvbGRlclNlc3Npb25UeXBlcy5maW5kKHQgPT5cblx0XHRcdHQucHJvdmlkZXJJZCA9PT0gdGhpcy5fcGlja2VkPy5wcm92aWRlcklkICYmIHQuc2Vzc2lvblR5cGUuaWQgPT09IHRoaXMuX3BpY2tlZD8uc2Vzc2lvblR5cGVJZCk/LnNlc3Npb25UeXBlXG5cdFx0XHQ/PyB0aGlzLl9mb2xkZXJTZXNzaW9uVHlwZXMuZmluZCh0ID0+IHQuc2Vzc2lvblR5cGUuaWQgPT09IHRoaXMuX3BpY2tlZD8uc2Vzc2lvblR5cGVJZCk/LnNlc3Npb25UeXBlO1xuXHRcdGNvbnN0IG1vZGVJY29uID0gY3VycmVudFR5cGU/Lmljb24gPz8gQ29kaWNvbi50ZXJtaW5hbDtcblx0XHRjb25zdCBtb2RlTGFiZWwgPSBjdXJyZW50VHlwZT8ubGFiZWwgPz8gdGhpcy5fcGlja2VkPy5zZXNzaW9uVHlwZUlkID8/ICcnO1xuXG5cdFx0ZG9tLmFwcGVuZCh0aGlzLl90cmlnZ2VyRWxlbWVudCwgcmVuZGVySWNvbihtb2RlSWNvbikpO1xuXHRcdGNvbnN0IGxhYmVsU3BhbiA9IGRvbS5hcHBlbmQodGhpcy5fdHJpZ2dlckVsZW1lbnQsIGRvbS4kKCdzcGFuLnNlc3Npb25zLWNoYXQtZHJvcGRvd24tbGFiZWwnKSk7XG5cdFx0bGFiZWxTcGFuLnRleHRDb250ZW50ID0gbW9kZUxhYmVsO1xuXG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/LnNob3dDaGV2cm9uICE9PSBmYWxzZSkge1xuXHRcdFx0Y29uc3QgY2hldnJvbiA9IGRvbS5hcHBlbmQodGhpcy5fdHJpZ2dlckVsZW1lbnQsIHJlbmRlckljb24oQ29kaWNvbi5jaGV2cm9uRG93bkNvbXBhY3QpKTtcblx0XHRcdGNoZXZyb24uY2xhc3NMaXN0LmFkZCgnc2Vzc2lvbnMtY2hhdC1kcm9wZG93bi1jaGV2cm9uJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQuYXJpYUxhYmVsID0gbG9jYWxpemUoJ3Nlc3Npb25UeXBlUGlja2VyLnRyaWdnZXJBcmlhTGFiZWwnLCBcIlBpY2sgU2Vzc2lvbiBUeXBlLCB7MH1cIiwgbW9kZUxhYmVsKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFD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
