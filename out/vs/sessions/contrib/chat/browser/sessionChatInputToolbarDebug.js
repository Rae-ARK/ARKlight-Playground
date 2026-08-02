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
import * as DOM from "../../../../base/browser/dom.js";
import { Dialog } from "../../../../base/browser/ui/dialog/dialog.js";
import { InputBox, MessageType } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { Checkbox } from "../../../../base/browser/ui/toggle/toggle.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { createWorkbenchDialogOptions } from "../../../../workbench/browser/parts/dialogs/dialog.js";
import { IHostService } from "../../../../workbench/services/host/browser/host.js";
import "./media/sessionChatInputToolbarDebug.css";
const $ = DOM.$;
const ISessionChatPillsDebugService = createDecorator("sessionChatPillsDebugService");
const SessionChatPillsDebugAvailableContext = new RawContextKey("sessionsChatPillsDebugAvailable", false, localize("sessionsChatPillsDebugAvailable", "Whether a session chat view is active and can show fake status pills"));
const SHOW_SESSION_CHAT_PILLS_DEBUG_COMMAND_ID = "sessions.debug.showFakeChatPills";
function weightedRandomDebugIncrement(first = Math.random(), second = Math.random()) {
  return Math.min(Math.floor(first * 16), Math.floor(second * 16));
}
function isNonNegativeIntegerInput(raw) {
  if (raw.trim().length === 0) {
    return false;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0;
}
let SessionChatPillsDebugService = class extends Disposable {
  constructor(contextKeyService, _contextViewService, _keybindingService, _layoutService, productService, _hostService) {
    super();
    this._contextViewService = _contextViewService;
    this._keybindingService = _keybindingService;
    this._layoutService = _layoutService;
    this._hostService = _hostService;
    this._changesTimer = this._register(new MutableDisposable());
    this._availableContext = SessionChatPillsDebugAvailableContext.bindTo(contextKeyService);
    if (productService.quality !== "stable") {
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: SHOW_SESSION_CHAT_PILLS_DEBUG_COMMAND_ID,
            title: localize2("sessions.debug.showFakeChatPills", "Configure Fake Session Chat UI"),
            category: Categories.Developer,
            precondition: SessionChatPillsDebugAvailableContext,
            menu: [{ id: MenuId.CommandPalette, when: SessionChatPillsDebugAvailableContext }]
          });
        }
        run(accessor) {
          return accessor.get(ISessionChatPillsDebugService).showDialog();
        }
      }));
    }
  }
  register(toolbar, banners, isActive) {
    const disposables = new DisposableStore();
    disposables.add(autorun((reader) => {
      if (isActive.read(reader)) {
        this._setActiveTarget(toolbar, banners);
      } else if (this._activeToolbar === toolbar) {
        this._setActiveTarget(void 0, void 0);
      }
    }));
    disposables.add(toDisposable(() => {
      if (this._activeToolbar === toolbar) {
        this._setActiveTarget(void 0, void 0);
      }
    }));
    return disposables;
  }
  clear(toolbar) {
    if (this._activeToolbar === toolbar) {
      this._setDebugData(void 0);
    }
  }
  async showDialog() {
    const toolbar = this._activeToolbar;
    if (!toolbar) {
      return;
    }
    const initial = toolbar.getDebugData();
    const state = {
      files: String(initial?.stats.files ?? 0),
      insertions: String(initial?.stats.insertions ?? 0),
      deletions: String(initial?.stats.deletions ?? 0),
      markdownFiles: initial?.markdownFiles.join("\n") ?? "",
      subagents: initial?.subagents.join("\n") ?? "",
      browsers: initial?.browsers.join("\n") ?? "",
      ciFailed: String(initial?.ciFailed ?? 0),
      ciPending: String(initial?.ciPending ?? 0),
      prFeedback: String(initial?.prFeedback ?? 0),
      agentFeedback: String(initial?.agentFeedback ?? 0),
      autoIncrementChanges: initial?.autoIncrementChanges ?? false
    };
    const disposables = new DisposableStore();
    let applyButton;
    let numericInputs = [];
    let revalidate = () => {
    };
    const dialog = disposables.add(new Dialog(
      this._layoutService.activeContainer,
      localize("sessions.debug.chatPills.title", "Fake Session Chat UI"),
      [
        localize("sessions.debug.chatPills.apply", "Apply"),
        localize("sessions.debug.chatPills.clear", "Clear"),
        localize("sessions.debug.chatPills.cancel", "Cancel")
      ],
      createWorkbenchDialogOptions({
        type: "none",
        extraClasses: ["session-chat-pills-debug-dialog"],
        cancelId: 2,
        dialogStyles: defaultDialogStyles,
        buttonOptions: [{
          styleButton: (button) => {
            applyButton = button;
            revalidate();
          }
        }],
        renderBody: (container) => {
          const form = DOM.append(container, $(".session-chat-pills-debug-form"));
          DOM.append(form, $("p.session-chat-pills-debug-description", void 0, localize("sessions.debug.chatPills.description", "Configure the values shown by status pills and input banners. Separate multiple names with commas or new lines.")));
          const stats = DOM.append(form, $(".session-chat-pills-debug-stats"));
          const files = this._createInput(stats, disposables, localize("sessions.debug.chatPills.files", "Files"), state.files, (value) => state.files = value, true, () => revalidate());
          const insertions = this._createInput(stats, disposables, localize("sessions.debug.chatPills.insertions", "Insertions"), state.insertions, (value) => state.insertions = value, true, () => revalidate());
          const deletions = this._createInput(stats, disposables, localize("sessions.debug.chatPills.deletions", "Deletions"), state.deletions, (value) => state.deletions = value, true, () => revalidate());
          numericInputs = [files, insertions, deletions];
          const autoIncrementLabel = localize("sessions.debug.chatPills.autoIncrementChanges", "Automatically increase insertions and deletions every 2 seconds");
          const autoIncrementRow = DOM.append(form, $(".session-chat-pills-debug-checkbox-row"));
          const autoIncrementCheckbox = disposables.add(new Checkbox(autoIncrementLabel, state.autoIncrementChanges, defaultCheckboxStyles));
          DOM.append(autoIncrementRow, autoIncrementCheckbox.domNode);
          const autoIncrementLabelElement = DOM.append(autoIncrementRow, $("span.session-chat-pills-debug-checkbox-label", void 0, autoIncrementLabel));
          const setAutoIncrement = (value) => {
            autoIncrementCheckbox.checked = value;
            state.autoIncrementChanges = value;
          };
          disposables.add(autoIncrementCheckbox.onChange(() => state.autoIncrementChanges = autoIncrementCheckbox.checked));
          disposables.add(DOM.addDisposableListener(autoIncrementLabelElement, DOM.EventType.CLICK, () => setAutoIncrement(!autoIncrementCheckbox.checked)));
          this._createInput(form, disposables, localize("sessions.debug.chatPills.markdownFiles", "Markdown File Names"), state.markdownFiles, (value) => state.markdownFiles = value);
          this._createInput(form, disposables, localize("sessions.debug.chatPills.subagents", "Subagent Names"), state.subagents, (value) => state.subagents = value);
          this._createInput(form, disposables, localize("sessions.debug.chatPills.browsers", "Browser Labels"), state.browsers, (value) => state.browsers = value);
          DOM.append(form, $("h3.session-chat-pills-debug-heading", void 0, localize("sessions.debug.chatPills.inputBanners", "Input Banners")));
          const bannerStats = DOM.append(form, $(".session-chat-pills-debug-banner-stats"));
          const ciFailed = this._createInput(bannerStats, disposables, localize("sessions.debug.chatPills.ciFailed", "Failed CI Checks"), state.ciFailed, (value) => state.ciFailed = value, true, () => revalidate());
          const ciPending = this._createInput(bannerStats, disposables, localize("sessions.debug.chatPills.ciPending", "Pending CI Checks"), state.ciPending, (value) => state.ciPending = value, true, () => revalidate());
          const prFeedback = this._createInput(bannerStats, disposables, localize("sessions.debug.chatPills.prFeedback", "PR Feedback to Address"), state.prFeedback, (value) => state.prFeedback = value, true, () => revalidate());
          const agentFeedback = this._createInput(bannerStats, disposables, localize("sessions.debug.chatPills.agentFeedback", "Agent Feedback to Address"), state.agentFeedback, (value) => state.agentFeedback = value, true, () => revalidate());
          numericInputs = [...numericInputs, ciFailed, ciPending, prFeedback, agentFeedback];
          revalidate = () => {
            const valid = numericInputs.every((input) => input.validate() !== MessageType.ERROR);
            if (applyButton) {
              applyButton.enabled = valid;
            }
          };
          revalidate();
        }
      }, this._keybindingService, this._layoutService, this._hostService)
    ));
    try {
      const result = await dialog.show();
      if (this._activeToolbar !== toolbar) {
        return;
      }
      if (result.button === 1) {
        this._setDebugData(void 0);
        return;
      }
      if (result.button !== 0 || numericInputs.some((input) => input.validate() === MessageType.ERROR)) {
        return;
      }
      this._setDebugData({
        stats: {
          files: Number(state.files),
          insertions: Number(state.insertions),
          deletions: Number(state.deletions)
        },
        markdownFiles: this._parseList(state.markdownFiles),
        subagents: this._parseList(state.subagents),
        browsers: this._parseList(state.browsers),
        ciFailed: Number(state.ciFailed),
        ciPending: Number(state.ciPending),
        prFeedback: Number(state.prFeedback),
        agentFeedback: Number(state.agentFeedback),
        autoIncrementChanges: state.autoIncrementChanges
      });
    } finally {
      disposables.dispose();
    }
  }
  _createInput(container, disposables, label, value, onChange, numeric = false, onDidChange) {
    const row = DOM.append(container, $(".session-chat-pills-debug-row"));
    DOM.append(row, $("span.session-chat-pills-debug-label", void 0, label));
    const input = disposables.add(new InputBox(DOM.append(row, $(".session-chat-pills-debug-input")), this._contextViewService, {
      inputBoxStyles: defaultInputBoxStyles,
      ariaLabel: label,
      type: numeric ? "number" : "text",
      flexibleHeight: !numeric,
      flexibleMaxHeight: 100,
      validationOptions: numeric ? {
        validation: (raw) => {
          return isNonNegativeIntegerInput(raw) ? null : { content: localize("sessions.debug.chatPills.nonNegativeInteger", "Enter a whole number greater than or equal to 0."), type: MessageType.ERROR };
        }
      } : void 0
    }));
    input.value = value;
    if (numeric) {
      input.inputElement.min = "0";
      input.inputElement.step = "1";
    }
    disposables.add(input.onDidChange((changed) => {
      onChange(changed);
      onDidChange?.();
    }));
    return input;
  }
  _parseList(value) {
    return value.split(/[\n,]/).map((item) => item.trim()).filter((item) => item.length > 0);
  }
  _setDebugData(data) {
    this._changesTimer.clear();
    this._debugData = data;
    this._applyDebugData(data);
    if (data?.autoIncrementChanges && this._activeToolbar) {
      const timer = new DOM.WindowIntervalTimer(this._activeToolbar.element);
      this._changesTimer.value = timer;
      timer.cancelAndSet(() => this._incrementChanges(), 2e3);
    }
  }
  _applyDebugData(data) {
    this._activeToolbar?.setDebugData(data);
    this._activeBanners?.setDebugData(data);
  }
  _incrementChanges() {
    const data = this._debugData;
    if (!data?.autoIncrementChanges || !this._activeToolbar) {
      this._changesTimer.clear();
      return;
    }
    this._debugData = {
      ...data,
      stats: {
        ...data.stats,
        insertions: data.stats.insertions + weightedRandomDebugIncrement(),
        deletions: data.stats.deletions + weightedRandomDebugIncrement()
      }
    };
    this._applyDebugData(this._debugData);
  }
  _setActiveTarget(toolbar, banners) {
    if (this._activeToolbar === toolbar && this._activeBanners === banners) {
      return;
    }
    this._setDebugData(void 0);
    this._activeToolbar = toolbar;
    this._activeBanners = banners;
    this._availableContext.set(!!toolbar);
  }
};
SessionChatPillsDebugService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IContextViewService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, ILayoutService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IHostService)
], SessionChatPillsDebugService);
registerSingleton(ISessionChatPillsDebugService, SessionChatPillsDebugService, InstantiationType.Delayed);
export {
  ISessionChatPillsDebugService,
  isNonNegativeIntegerInput,
  weightedRandomDebugIncrement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3Nlc3Npb25DaGF0SW5wdXRUb29sYmFyRGVidWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgRGlhbG9nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2RpYWxvZy9kaWFsb2cuanMnO1xuaW1wb3J0IHsgSW5wdXRCb3gsIE1lc3NhZ2VUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IENoZWNrYm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q2hlY2tib3hTdHlsZXMsIGRlZmF1bHREaWFsb2dTdHlsZXMsIGRlZmF1bHRJbnB1dEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVXb3JrYmVuY2hEaWFsb2dPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZGlhbG9ncy9kaWFsb2cuanMnO1xuaW1wb3J0IHsgSURpZmZTdGF0cyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdFR1cm5QaWxscy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbklucHV0QmFubmVycyB9IGZyb20gJy4uLy4uL3Nlc3Npb25JbnB1dEJhbm5lcnMvYnJvd3Nlci9zZXNzaW9uSW5wdXRCYW5uZXJzLmpzJztcbmltcG9ydCB7IFNlc3Npb25DaGF0SW5wdXRUb29sYmFyIH0gZnJvbSAnLi9zZXNzaW9uQ2hhdElucHV0VG9vbGJhci5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvc2Vzc2lvbkNoYXRJbnB1dFRvb2xiYXJEZWJ1Zy5jc3MnO1xuXG5jb25zdCAkID0gRE9NLiQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25DaGF0UGlsbHNEZWJ1Z0RhdGEge1xuXHRyZWFkb25seSBzdGF0czogSURpZmZTdGF0cztcblx0cmVhZG9ubHkgbWFya2Rvd25GaWxlczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IHN1YmFnZW50czogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IGJyb3dzZXJzOiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgY2lGYWlsZWQ6IG51bWJlcjtcblx0cmVhZG9ubHkgY2lQZW5kaW5nOiBudW1iZXI7XG5cdHJlYWRvbmx5IHByRmVlZGJhY2s6IG51bWJlcjtcblx0cmVhZG9ubHkgYWdlbnRGZWVkYmFjazogbnVtYmVyO1xuXHRyZWFkb25seSBhdXRvSW5jcmVtZW50Q2hhbmdlczogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNvbnN0IElTZXNzaW9uQ2hhdFBpbGxzRGVidWdTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElTZXNzaW9uQ2hhdFBpbGxzRGVidWdTZXJ2aWNlPignc2Vzc2lvbkNoYXRQaWxsc0RlYnVnU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uQ2hhdFBpbGxzRGVidWdTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWdpc3Rlcih0b29sYmFyOiBTZXNzaW9uQ2hhdElucHV0VG9vbGJhciwgYmFubmVyczogU2Vzc2lvbklucHV0QmFubmVycywgaXNBY3RpdmU6IElPYnNlcnZhYmxlPGJvb2xlYW4+KTogSURpc3Bvc2FibGU7XG5cdGNsZWFyKHRvb2xiYXI6IFNlc3Npb25DaGF0SW5wdXRUb29sYmFyKTogdm9pZDtcblx0c2hvd0RpYWxvZygpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5jb25zdCBTZXNzaW9uQ2hhdFBpbGxzRGVidWdBdmFpbGFibGVDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3Nlc3Npb25zQ2hhdFBpbGxzRGVidWdBdmFpbGFibGUnLCBmYWxzZSwgbG9jYWxpemUoJ3Nlc3Npb25zQ2hhdFBpbGxzRGVidWdBdmFpbGFibGUnLCBcIldoZXRoZXIgYSBzZXNzaW9uIGNoYXQgdmlldyBpcyBhY3RpdmUgYW5kIGNhbiBzaG93IGZha2Ugc3RhdHVzIHBpbGxzXCIpKTtcbmNvbnN0IFNIT1dfU0VTU0lPTl9DSEFUX1BJTExTX0RFQlVHX0NPTU1BTkRfSUQgPSAnc2Vzc2lvbnMuZGVidWcuc2hvd0Zha2VDaGF0UGlsbHMnO1xuXG5pbnRlcmZhY2UgSURlYnVnRm9ybVN0YXRlIHtcblx0ZmlsZXM6IHN0cmluZztcblx0aW5zZXJ0aW9uczogc3RyaW5nO1xuXHRkZWxldGlvbnM6IHN0cmluZztcblx0bWFya2Rvd25GaWxlczogc3RyaW5nO1xuXHRzdWJhZ2VudHM6IHN0cmluZztcblx0YnJvd3NlcnM6IHN0cmluZztcblx0Y2lGYWlsZWQ6IHN0cmluZztcblx0Y2lQZW5kaW5nOiBzdHJpbmc7XG5cdHByRmVlZGJhY2s6IHN0cmluZztcblx0YWdlbnRGZWVkYmFjazogc3RyaW5nO1xuXHRhdXRvSW5jcmVtZW50Q2hhbmdlczogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdlaWdodGVkUmFuZG9tRGVidWdJbmNyZW1lbnQoZmlyc3QgPSBNYXRoLnJhbmRvbSgpLCBzZWNvbmQgPSBNYXRoLnJhbmRvbSgpKTogbnVtYmVyIHtcblx0cmV0dXJuIE1hdGgubWluKE1hdGguZmxvb3IoZmlyc3QgKiAxNiksIE1hdGguZmxvb3Ioc2Vjb25kICogMTYpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTm9uTmVnYXRpdmVJbnRlZ2VySW5wdXQocmF3OiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKHJhdy50cmltKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IHBhcnNlZCA9IE51bWJlcihyYXcpO1xuXHRyZXR1cm4gTnVtYmVyLmlzSW50ZWdlcihwYXJzZWQpICYmIHBhcnNlZCA+PSAwO1xufVxuXG5jbGFzcyBTZXNzaW9uQ2hhdFBpbGxzRGVidWdTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTZXNzaW9uQ2hhdFBpbGxzRGVidWdTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hdmFpbGFibGVDb250ZXh0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGFuZ2VzVGltZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RE9NLldpbmRvd0ludGVydmFsVGltZXI+KCkpO1xuXHRwcml2YXRlIF9hY3RpdmVUb29sYmFyOiBTZXNzaW9uQ2hhdElucHV0VG9vbGJhciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWN0aXZlQmFubmVyczogU2Vzc2lvbklucHV0QmFubmVycyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGVidWdEYXRhOiBJU2Vzc2lvbkNoYXRQaWxsc0RlYnVnRGF0YSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUxheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGF5b3V0U2VydmljZTogSUxheW91dFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9hdmFpbGFibGVDb250ZXh0ID0gU2Vzc2lvbkNoYXRQaWxsc0RlYnVnQXZhaWxhYmxlQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0aWYgKHByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgIT09ICdzdGFibGUnKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IFNIT1dfU0VTU0lPTl9DSEFUX1BJTExTX0RFQlVHX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzZXNzaW9ucy5kZWJ1Zy5zaG93RmFrZUNoYXRQaWxscycsIFwiQ29uZmlndXJlIEZha2UgU2Vzc2lvbiBDaGF0IFVJXCIpLFxuXHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBTZXNzaW9uQ2hhdFBpbGxzRGVidWdBdmFpbGFibGVDb250ZXh0LFxuXHRcdFx0XHRcdFx0bWVudTogW3sgaWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgd2hlbjogU2Vzc2lvbkNoYXRQaWxsc0RlYnVnQXZhaWxhYmxlQ29udGV4dCB9XSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVNlc3Npb25DaGF0UGlsbHNEZWJ1Z1NlcnZpY2UpLnNob3dEaWFsb2coKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHJlZ2lzdGVyKHRvb2xiYXI6IFNlc3Npb25DaGF0SW5wdXRUb29sYmFyLCBiYW5uZXJzOiBTZXNzaW9uSW5wdXRCYW5uZXJzLCBpc0FjdGl2ZTogSU9ic2VydmFibGU8Ym9vbGVhbj4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGlmIChpc0FjdGl2ZS5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0dGhpcy5fc2V0QWN0aXZlVGFyZ2V0KHRvb2xiYXIsIGJhbm5lcnMpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl9hY3RpdmVUb29sYmFyID09PSB0b29sYmFyKSB7XG5cdFx0XHRcdHRoaXMuX3NldEFjdGl2ZVRhcmdldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2FjdGl2ZVRvb2xiYXIgPT09IHRvb2xiYXIpIHtcblx0XHRcdFx0dGhpcy5fc2V0QWN0aXZlVGFyZ2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0Y2xlYXIodG9vbGJhcjogU2Vzc2lvbkNoYXRJbnB1dFRvb2xiYXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYWN0aXZlVG9vbGJhciA9PT0gdG9vbGJhcikge1xuXHRcdFx0dGhpcy5fc2V0RGVidWdEYXRhKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc2hvd0RpYWxvZygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0b29sYmFyID0gdGhpcy5fYWN0aXZlVG9vbGJhcjtcblx0XHRpZiAoIXRvb2xiYXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbml0aWFsID0gdG9vbGJhci5nZXREZWJ1Z0RhdGEoKTtcblx0XHRjb25zdCBzdGF0ZTogSURlYnVnRm9ybVN0YXRlID0ge1xuXHRcdFx0ZmlsZXM6IFN0cmluZyhpbml0aWFsPy5zdGF0cy5maWxlcyA/PyAwKSxcblx0XHRcdGluc2VydGlvbnM6IFN0cmluZyhpbml0aWFsPy5zdGF0cy5pbnNlcnRpb25zID8/IDApLFxuXHRcdFx0ZGVsZXRpb25zOiBTdHJpbmcoaW5pdGlhbD8uc3RhdHMuZGVsZXRpb25zID8/IDApLFxuXHRcdFx0bWFya2Rvd25GaWxlczogaW5pdGlhbD8ubWFya2Rvd25GaWxlcy5qb2luKCdcXG4nKSA/PyAnJyxcblx0XHRcdHN1YmFnZW50czogaW5pdGlhbD8uc3ViYWdlbnRzLmpvaW4oJ1xcbicpID8/ICcnLFxuXHRcdFx0YnJvd3NlcnM6IGluaXRpYWw/LmJyb3dzZXJzLmpvaW4oJ1xcbicpID8/ICcnLFxuXHRcdFx0Y2lGYWlsZWQ6IFN0cmluZyhpbml0aWFsPy5jaUZhaWxlZCA/PyAwKSxcblx0XHRcdGNpUGVuZGluZzogU3RyaW5nKGluaXRpYWw/LmNpUGVuZGluZyA/PyAwKSxcblx0XHRcdHByRmVlZGJhY2s6IFN0cmluZyhpbml0aWFsPy5wckZlZWRiYWNrID8/IDApLFxuXHRcdFx0YWdlbnRGZWVkYmFjazogU3RyaW5nKGluaXRpYWw/LmFnZW50RmVlZGJhY2sgPz8gMCksXG5cdFx0XHRhdXRvSW5jcmVtZW50Q2hhbmdlczogaW5pdGlhbD8uYXV0b0luY3JlbWVudENoYW5nZXMgPz8gZmFsc2UsXG5cdFx0fTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCBhcHBseUJ1dHRvbjogSUJ1dHRvbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbnVtZXJpY0lucHV0czogcmVhZG9ubHkgSW5wdXRCb3hbXSA9IFtdO1xuXHRcdGxldCByZXZhbGlkYXRlID0gKCkgPT4geyB9O1xuXHRcdGNvbnN0IGRpYWxvZyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlhbG9nKFxuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXIsXG5cdFx0XHRsb2NhbGl6ZSgnc2Vzc2lvbnMuZGVidWcuY2hhdFBpbGxzLnRpdGxlJywgXCJGYWtlIFNlc3Npb24gQ2hhdCBVSVwiKSxcblx0XHRcdFtcblx0XHRcdFx0bG9jYWxpemUoJ3Nlc3Npb25zLmRlYnVnLmNoYXRQaWxscy5hcHBseScsIFwiQXBwbHlcIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzZXNzaW9ucy5kZWJ1Zy5jaGF0UGlsbHMuY2xlYXInLCBcIkNsZWFyXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2Vzc2lvbnMuZGVidWcuY2hhdFBpbGxzLmNhbmNlbCcsIFwiQ2FuY2VsXCIpLFxuXHRcdFx0XSxcblx0XHRcdGNyZWF0ZVdvcmtiZW5jaERpYWxvZ09wdGlvbnMoe1xuXHRcdFx0XHR0eXBlOiAnbm9uZScsXG5cdFx0XHRcdGV4dHJhQ2xhc3NlczogWydzZXNzaW9uLWNoYXQtcGlsbHMtZGVidWctZGlhbG9nJ10sXG5cdFx0XHRcdGNhbmNlbElkOiAyLFxuXHRcdFx0XHRkaWFsb2dTdHlsZXM6IGRlZmF1bHREaWFsb2dTdHlsZXMsXG5cdFx0XHRcdGJ1dHRvbk9wdGlvbnM6IFt7XG5cdFx0XHRcdFx0c3R5bGVCdXR0b246IGJ1dHRvbiA9PiB7XG5cdFx0XHRcdFx0XHRhcHBseUJ1dHRvbiA9IGJ1dHRvbjtcblx0XHRcdFx0XHRcdHJldmFsaWRhdGUoKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0cmVuZGVyQm9keTogY29udGFpbmVyID0+IHtcblx0XHRcdFx0XHRjb25zdCBmb3JtID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZXNzaW9uLWNoYXQtcGlsbHMtZGVidWctZm9ybScpKTtcblx0XHRcdFx0XHRET00uYXBwZW5kKGZvcm0sICQoJ3Auc2Vzc2lvbi1jaGF0LXBpbGxzLWRlYnVnLWRlc2NyaXB0aW9uJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnc2Vzc2lvbnMuZGVidWcuY2hhdFBpbGxzLmRlc2NyaXB0aW9uJywgXCJDb25maWd1cmUgdGhlIHZhbHVlcyBzaG93biBieSBzdGF0dXMgcGlsbHMgYW5kIGlucHV0IGJhbm5lcnMuIFNlcGFyYXRlIG11bHRpcGxlIG5hbWVzIHdpdGggY29tbWFzIG9yIG5ldyBsaW5lcy5cIikpKTtcblxuXHRcdFx0XHRcdGNvbnN0IHN0YXRzID0gRE9NLmFwcGVuZChmb3JtLCAkKCcuc2Vzc2lvbi1jaGF0LXBpbGxzLWRlYnVnLXN0YXRzJykpO1xuXHRcdFx0XHRcdGNvbnN0IGZpbGVzID0gdGhpcy5fY3JlYXRlSW5wdXQoc3RhdHMsIGRpc3Bvc2FibGVzLCBsb2NhbGl6ZSgnc2Vzc2lvbnMuZGVidWcuY2hhdFBpbGxzLmZpbGVzJywgXCJGaWxlc1wiKSwgc3RhdGUuZmlsZXMsIHZhbHVlID0+IHN0YXRlLmZpbGVzID0gdmFsdWUsIHRydWUsICgpID0+IHJldmFsaWRhdGUoKSk7XG5cdFx0XHRcdFx0Y29uc3QgaW5zZXJ0aW9ucyA9IHRoaXMuX2NyZWF0ZUlucHV0KHN0YXRzLCBkaXNwb3NhYmxlcywgbG9jYWxpemUoJ3Nlc3Npb25zLmRlYnVnLmNoYXRQaWxscy5pbnNlcnRpb25zJywgXCJJbnNlcnRpb25zXCIpLCBzdGF0ZS5pbnNlcnRpb25zLCB2YWx1ZSA9PiBzdGF0ZS5pbnNlcnRpb25zID0gdmFsdWUsIHRydWUsICgpID0+IHJldmFsaWRhdGUoKSk7XG5cdFx0XHRcdFx0Y29uc3QgZGVsZXRpb25zID0gdGhpcy5fY3JlYXRlSW5wdXQoc3RhdHMsIGRpc3Bvc2FibGVzLCBsb2NhbGl6ZSgnc2Vzc2lvbnMuZGVidWcuY2hhdFBpbGxzLmRlbGV0aW9ucycsIFwiRGVsZXRpb25zXCIpLCBzdGF0ZS5kZWxldGlvbnMsIHZhbHVlID0+IHN0YXRlLmRlbGV0aW9ucyA9IHZhbHVlLCB0cnVlLCAoKSA9PiByZXZhbGlkYXRlKCkpO1xuXHRcdFx0XHRcdG51bWVyaWNJbnB1dHMgPSBbZmlsZXMsIGluc2VydGlvbnMsIGRlbGV0aW9uc107XG5cblx0XHRcdFx0XHRjb25zdCBhdXRvSW5jcmVtZW50TGFiZWwgPSBsb2NhbGl6ZSgnc2Vzc2lvbnMuZGVidWcuY2hhdFBpbGxzLmF1dG9JbmNyZW1lbnRDaGFuZ2VzJywgXCJBdXRvbWF0aWNhbGx5IGluY3JlYXNlIGluc2VydGlvbnMgYW5kIGRlbGV0aW9ucyBldmVyeSAyIHNlY29uZHNcIik7XG5cdFx0XHRcdFx0Y29uc3QgYXV0b0luY3JlbWVudFJvdyA9IERPTS5hcHBlbmQoZm9ybSwgJCgnLnNlc3Npb24tY2hhdC1waWxscy1kZWJ1Zy1jaGVja2JveC1yb3cnKSk7XG5cdFx0XHRcdFx0Y29uc3QgYXV0b0luY3JlbWVudENoZWNrYm94ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGVja2JveChhdXRvSW5jcmVtZW50TGFiZWwsIHN0YXRlLmF1dG9JbmNyZW1lbnRDaGFuZ2VzLCBkZWZhdWx0Q2hlY2tib3hTdHlsZXMpKTtcblx0XHRcdFx0XHRET00uYXBwZW5kKGF1dG9JbmNyZW1lbnRSb3csIGF1dG9JbmNyZW1lbnRDaGVja2JveC5kb21Ob2RlKTtcblx0XHRcdFx0XHRjb25zdCBhdXRvSW5jcmVtZW50TGFiZWxFbGVtZW50ID0gRE9NLmFwcGVuZChhdXRvSW5jcmVtZW50Um93LCAkKCdzcGFuLnNlc3Npb24tY2hhdC1waWxscy1kZWJ1Zy1jaGVja2JveC1sYWJlbCcsIHVuZGVmaW5lZCwgYXV0b0luY3JlbWVudExhYmVsKSk7XG5cdFx0XHRcdFx0Y29uc3Qgc2V0QXV0b0luY3JlbWVudCA9ICh2YWx1ZTogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRcdFx0YXV0b0luY3JlbWVudENoZWNrYm94LmNoZWNrZWQgPSB2YWx1ZTtcblx0XHRcdFx0XHRcdHN0YXRlLmF1dG9JbmNyZW1lbnRDaGFuZ2VzID0gdmFsdWU7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoYXV0b0luY3JlbWVudENoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IHN0YXRlLmF1dG9JbmNyZW1lbnRDaGFuZ2VzID0gYXV0b0luY3JlbWVudENoZWNrYm94LmNoZWNrZWQpKTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihhdXRvSW5jcmVtZW50TGFiZWxFbGVtZW50LCBET00uRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiBzZXRBdXRvSW5jcmVtZW50KCFhdXRvSW5jcmVtZW50Q2hlY2tib3guY2hlY2tlZCkpKTtcblxuXHRcdFx0XHRcdHRoaXMuX2NyZWF0ZUlucHV0KGZvcm0sIGRpc3Bvc2FibGVzLCBsb2NhbGl6ZSgnc2Vzc2lvbnMuZGVidWcuY2hhdFBpbGxzLm1hcmtkb3duRmlsZXMnLCBcIk1hcmtkb3duIEZpbGUgTmFtZXNcIiksIHN0YXRlLm1hcmtkb3duRmlsZXMsIHZhbHVlID0+IHN0YXRlLm1hcmtkb3duRmlsZXMgPSB2YWx1ZSk7XG5cdFx0XHRcdFx0dGhpcy5fY3JlYXRlSW5wdXQoZm9ybSwgZGlzcG9zYWJsZXMsIGxvY2FsaXplKCdzZXNzaW9ucy5kZWJ1Zy5jaGF0UGlsbHMuc3ViYWdlbnRzJywgXCJTdWJhZ2VudCBOYW1lc1wiKSwgc3RhdGUuc3ViYWdlbnRzLCB2YWx1ZSA9PiBzdGF0ZS5zdWJhZ2VudHMgPSB2YWx1ZSk7XG5cdFx0XHRcdFx0dGhpcy5fY3JlYXRlSW5wdXQoZm9ybSwgZGlzcG9zYWJsZXMsIGxvY2FsaXplKCdzZXNzaW9ucy5kZWJ1Zy5jaGF0UGlsbHMuYnJvd3NlcnMnLCBcIkJyb3dzZXIgTGFiZWxzXCIpLCBzdGF0ZS5icm93c2VycywgdmFsdWUgPT4gc3RhdGUuYnJvd3NlcnMgPSB2YWx1ZSk7XG5cblx0XHRcdFx0XHRET00uYXBwZW5kKGZvcm0sICQoJ2gzLnNlc3Npb24tY2hhdC1waWxscy1kZWJ1Zy1oZWFkaW5nJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnc2Vzc2lvbnMuZGVidWcuY2hhdFBpbGxzLmlucHV0QmFubmVycycsIFwiSW5wdXQgQmFubmVyc1wiKSkpO1xuXHRcdFx0XHRcdGNvbnN0IGJhbm5lclN0YXRzID0gRE9NLmFwcGVuZChmb3JtLCAkKCcuc2Vzc2lvbi1jaGF0LXBpbGxzLWRlYnVnLWJhbm5lci1zdGF0cycpKTtcblx0XHRcdFx0XHRjb25zdCBjaUZhaWxlZCA9IHRoaXMuX2NyZWF0ZUlucHV0KGJhbm5lclN0YXRzLCBkaXNwb3NhYmxlcywgbG9jYWxpemUoJ3Nlc3Npb25zLmRlYnVnLmNoYXRQaWxscy5jaUZhaWxlZCcsIFwiRmFpbGVkIENJIENoZWNrc1wiKSwgc3RhdGUuY2lGYWlsZWQsIHZhbHVlID0+IHN0YXRlLmNpRmFpbGVkID0gdmFsdWUsIHRydWUsICgpID0+IHJldmFsaWRhdGUoKSk7XG5cdFx0XHRcdFx0Y29uc3QgY2lQZW5kaW5nID0gdGhpcy5fY3JlYXRlSW5wdXQoYmFubmVyU3RhdHMsIGRpc3Bvc2FibGVzLCBsb2NhbGl6ZSgnc2Vzc2lvbnMuZGVidWcuY2hhdFBpbGxzLmNpUGVuZGluZycsIFwiUGVuZGluZyBDSSBDaGVja3NcIiksIHN0YXRlLmNpUGVuZGluZywgdmFsdWUgPT4gc3RhdGUuY2lQZW5kaW5nID0gdmFsdWUsIHRydWUsICgpID0+IHJldmFsaWRhdGUoKSk7XG5cdFx0XHRcdFx0Y29uc3QgcHJGZWVkYmFjayA9IHRoaXMuX2NyZWF0ZUlucHV0KGJhbm5lclN0YXRzLCBkaXNwb3NhYmxlcywgbG9jYWxpemUoJ3Nlc3Npb25zLmRlYnVnLmNoYXRQaWxscy5wckZlZWRiYWNrJywgXCJQUiBGZWVkYmFjayB0byBBZGRyZXNzXCIpLCBzdGF0ZS5wckZlZWRiYWNrLCB2YWx1ZSA9PiBzdGF0ZS5wckZlZWRiYWNrID0gdmFsdWUsIHRydWUsICgpID0+IHJldmFsaWRhdGUoKSk7XG5cdFx0XHRcdFx0Y29uc3QgYWdlbnRGZWVkYmFjayA9IHRoaXMuX2NyZWF0ZUlucHV0KGJhbm5lclN0YXRzLCBkaXNwb3NhYmxlcywgbG9jYWxpemUoJ3Nlc3Npb25zLmRlYnVnLmNoYXRQaWxscy5hZ2VudEZlZWRiYWNrJywgXCJBZ2VudCBGZWVkYmFjayB0byBBZGRyZXNzXCIpLCBzdGF0ZS5hZ2VudEZlZWRiYWNrLCB2YWx1ZSA9PiBzdGF0ZS5hZ2VudEZlZWRiYWNrID0gdmFsdWUsIHRydWUsICgpID0+IHJldmFsaWRhdGUoKSk7XG5cdFx0XHRcdFx0bnVtZXJpY0lucHV0cyA9IFsuLi5udW1lcmljSW5wdXRzLCBjaUZhaWxlZCwgY2lQZW5kaW5nLCBwckZlZWRiYWNrLCBhZ2VudEZlZWRiYWNrXTtcblxuXHRcdFx0XHRcdHJldmFsaWRhdGUgPSAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWxpZCA9IG51bWVyaWNJbnB1dHMuZXZlcnkoaW5wdXQgPT4gaW5wdXQudmFsaWRhdGUoKSAhPT0gTWVzc2FnZVR5cGUuRVJST1IpO1xuXHRcdFx0XHRcdFx0aWYgKGFwcGx5QnV0dG9uKSB7XG5cdFx0XHRcdFx0XHRcdGFwcGx5QnV0dG9uLmVuYWJsZWQgPSB2YWxpZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHJldmFsaWRhdGUoKTtcblx0XHRcdFx0fSxcblx0XHRcdH0sIHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLl9sYXlvdXRTZXJ2aWNlLCB0aGlzLl9ob3N0U2VydmljZSksXG5cdFx0KSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZGlhbG9nLnNob3coKTtcblx0XHRcdGlmICh0aGlzLl9hY3RpdmVUb29sYmFyICE9PSB0b29sYmFyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChyZXN1bHQuYnV0dG9uID09PSAxKSB7XG5cdFx0XHRcdHRoaXMuX3NldERlYnVnRGF0YSh1bmRlZmluZWQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0LmJ1dHRvbiAhPT0gMCB8fCBudW1lcmljSW5wdXRzLnNvbWUoaW5wdXQgPT4gaW5wdXQudmFsaWRhdGUoKSA9PT0gTWVzc2FnZVR5cGUuRVJST1IpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fc2V0RGVidWdEYXRhKHtcblx0XHRcdFx0c3RhdHM6IHtcblx0XHRcdFx0XHRmaWxlczogTnVtYmVyKHN0YXRlLmZpbGVzKSxcblx0XHRcdFx0XHRpbnNlcnRpb25zOiBOdW1iZXIoc3RhdGUuaW5zZXJ0aW9ucyksXG5cdFx0XHRcdFx0ZGVsZXRpb25zOiBOdW1iZXIoc3RhdGUuZGVsZXRpb25zKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bWFya2Rvd25GaWxlczogdGhpcy5fcGFyc2VMaXN0KHN0YXRlLm1hcmtkb3duRmlsZXMpLFxuXHRcdFx0XHRzdWJhZ2VudHM6IHRoaXMuX3BhcnNlTGlzdChzdGF0ZS5zdWJhZ2VudHMpLFxuXHRcdFx0XHRicm93c2VyczogdGhpcy5fcGFyc2VMaXN0KHN0YXRlLmJyb3dzZXJzKSxcblx0XHRcdFx0Y2lGYWlsZWQ6IE51bWJlcihzdGF0ZS5jaUZhaWxlZCksXG5cdFx0XHRcdGNpUGVuZGluZzogTnVtYmVyKHN0YXRlLmNpUGVuZGluZyksXG5cdFx0XHRcdHByRmVlZGJhY2s6IE51bWJlcihzdGF0ZS5wckZlZWRiYWNrKSxcblx0XHRcdFx0YWdlbnRGZWVkYmFjazogTnVtYmVyKHN0YXRlLmFnZW50RmVlZGJhY2spLFxuXHRcdFx0XHRhdXRvSW5jcmVtZW50Q2hhbmdlczogc3RhdGUuYXV0b0luY3JlbWVudENoYW5nZXMsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUlucHV0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIGxhYmVsOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIG9uQ2hhbmdlOiAodmFsdWU6IHN0cmluZykgPT4gdm9pZCwgbnVtZXJpYyA9IGZhbHNlLCBvbkRpZENoYW5nZT86ICgpID0+IHZvaWQpOiBJbnB1dEJveCB7XG5cdFx0Y29uc3Qgcm93ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZXNzaW9uLWNoYXQtcGlsbHMtZGVidWctcm93JykpO1xuXHRcdERPTS5hcHBlbmQocm93LCAkKCdzcGFuLnNlc3Npb24tY2hhdC1waWxscy1kZWJ1Zy1sYWJlbCcsIHVuZGVmaW5lZCwgbGFiZWwpKTtcblx0XHRjb25zdCBpbnB1dCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5wdXRCb3goRE9NLmFwcGVuZChyb3csICQoJy5zZXNzaW9uLWNoYXQtcGlsbHMtZGVidWctaW5wdXQnKSksIHRoaXMuX2NvbnRleHRWaWV3U2VydmljZSwge1xuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyxcblx0XHRcdGFyaWFMYWJlbDogbGFiZWwsXG5cdFx0XHR0eXBlOiBudW1lcmljID8gJ251bWJlcicgOiAndGV4dCcsXG5cdFx0XHRmbGV4aWJsZUhlaWdodDogIW51bWVyaWMsXG5cdFx0XHRmbGV4aWJsZU1heEhlaWdodDogMTAwLFxuXHRcdFx0dmFsaWRhdGlvbk9wdGlvbnM6IG51bWVyaWMgPyB7XG5cdFx0XHRcdHZhbGlkYXRpb246IHJhdyA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIGlzTm9uTmVnYXRpdmVJbnRlZ2VySW5wdXQocmF3KVxuXHRcdFx0XHRcdFx0PyBudWxsXG5cdFx0XHRcdFx0XHQ6IHsgY29udGVudDogbG9jYWxpemUoJ3Nlc3Npb25zLmRlYnVnLmNoYXRQaWxscy5ub25OZWdhdGl2ZUludGVnZXInLCBcIkVudGVyIGEgd2hvbGUgbnVtYmVyIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byAwLlwiKSwgdHlwZTogTWVzc2FnZVR5cGUuRVJST1IgfTtcblx0XHRcdFx0fSxcblx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0fSkpO1xuXHRcdGlucHV0LnZhbHVlID0gdmFsdWU7XG5cdFx0aWYgKG51bWVyaWMpIHtcblx0XHRcdGlucHV0LmlucHV0RWxlbWVudC5taW4gPSAnMCc7XG5cdFx0XHRpbnB1dC5pbnB1dEVsZW1lbnQuc3RlcCA9ICcxJztcblx0XHR9XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0Lm9uRGlkQ2hhbmdlKGNoYW5nZWQgPT4ge1xuXHRcdFx0b25DaGFuZ2UoY2hhbmdlZCk7XG5cdFx0XHRvbkRpZENoYW5nZT8uKCk7XG5cdFx0fSkpO1xuXHRcdHJldHVybiBpbnB1dDtcblx0fVxuXG5cdHByaXZhdGUgX3BhcnNlTGlzdCh2YWx1ZTogc3RyaW5nKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdHJldHVybiB2YWx1ZS5zcGxpdCgvW1xcbixdLykubWFwKGl0ZW0gPT4gaXRlbS50cmltKCkpLmZpbHRlcihpdGVtID0+IGl0ZW0ubGVuZ3RoID4gMCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXREZWJ1Z0RhdGEoZGF0YTogSVNlc3Npb25DaGF0UGlsbHNEZWJ1Z0RhdGEgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGFuZ2VzVGltZXIuY2xlYXIoKTtcblx0XHR0aGlzLl9kZWJ1Z0RhdGEgPSBkYXRhO1xuXHRcdHRoaXMuX2FwcGx5RGVidWdEYXRhKGRhdGEpO1xuXHRcdGlmIChkYXRhPy5hdXRvSW5jcmVtZW50Q2hhbmdlcyAmJiB0aGlzLl9hY3RpdmVUb29sYmFyKSB7XG5cdFx0XHRjb25zdCB0aW1lciA9IG5ldyBET00uV2luZG93SW50ZXJ2YWxUaW1lcih0aGlzLl9hY3RpdmVUb29sYmFyLmVsZW1lbnQpO1xuXHRcdFx0dGhpcy5fY2hhbmdlc1RpbWVyLnZhbHVlID0gdGltZXI7XG5cdFx0XHR0aW1lci5jYW5jZWxBbmRTZXQoKCkgPT4gdGhpcy5faW5jcmVtZW50Q2hhbmdlcygpLCAyMDAwKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseURlYnVnRGF0YShkYXRhOiBJU2Vzc2lvbkNoYXRQaWxsc0RlYnVnRGF0YSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2ZVRvb2xiYXI/LnNldERlYnVnRGF0YShkYXRhKTtcblx0XHR0aGlzLl9hY3RpdmVCYW5uZXJzPy5zZXREZWJ1Z0RhdGEoZGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIF9pbmNyZW1lbnRDaGFuZ2VzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9kZWJ1Z0RhdGE7XG5cdFx0aWYgKCFkYXRhPy5hdXRvSW5jcmVtZW50Q2hhbmdlcyB8fCAhdGhpcy5fYWN0aXZlVG9vbGJhcikge1xuXHRcdFx0dGhpcy5fY2hhbmdlc1RpbWVyLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2RlYnVnRGF0YSA9IHtcblx0XHRcdC4uLmRhdGEsXG5cdFx0XHRzdGF0czoge1xuXHRcdFx0XHQuLi5kYXRhLnN0YXRzLFxuXHRcdFx0XHRpbnNlcnRpb25zOiBkYXRhLnN0YXRzLmluc2VydGlvbnMgKyB3ZWlnaHRlZFJhbmRvbURlYnVnSW5jcmVtZW50KCksXG5cdFx0XHRcdGRlbGV0aW9uczogZGF0YS5zdGF0cy5kZWxldGlvbnMgKyB3ZWlnaHRlZFJhbmRvbURlYnVnSW5jcmVtZW50KCksXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0dGhpcy5fYXBwbHlEZWJ1Z0RhdGEodGhpcy5fZGVidWdEYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEFjdGl2ZVRhcmdldCh0b29sYmFyOiBTZXNzaW9uQ2hhdElucHV0VG9vbGJhciB8IHVuZGVmaW5lZCwgYmFubmVyczogU2Vzc2lvbklucHV0QmFubmVycyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9hY3RpdmVUb29sYmFyID09PSB0b29sYmFyICYmIHRoaXMuX2FjdGl2ZUJhbm5lcnMgPT09IGJhbm5lcnMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2V0RGVidWdEYXRhKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fYWN0aXZlVG9vbGJhciA9IHRvb2xiYXI7XG5cdFx0dGhpcy5fYWN0aXZlQmFubmVycyA9IGJhbm5lcnM7XG5cdFx0dGhpcy5fYXZhaWxhYmxlQ29udGV4dC5zZXQoISF0b29sYmFyKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJU2Vzc2lvbkNoYXRQaWxsc0RlYnVnU2VydmljZSwgU2Vzc2lvbkNoYXRQaWxsc0RlYnVnU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUVyQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxVQUFVLG1CQUFtQjtBQUN0QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQVksaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDMUYsU0FBUyxlQUE0QjtBQUNyQyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLG9CQUFvQixxQkFBcUI7QUFDbEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsdUJBQXlDO0FBQ2xELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCLHFCQUFxQiw2QkFBNkI7QUFDbEYsU0FBUyxvQ0FBb0M7QUFFN0MsU0FBUyxvQkFBb0I7QUFHN0IsT0FBTztBQUVQLE1BQU0sSUFBSSxJQUFJO0FBY1AsTUFBTSxnQ0FBZ0MsZ0JBQStDLDhCQUE4QjtBQVMxSCxNQUFNLHdDQUF3QyxJQUFJLGNBQXVCLG1DQUFtQyxPQUFPLFNBQVMsbUNBQW1DLHNFQUFzRSxDQUFDO0FBQ3RPLE1BQU0sMkNBQTJDO0FBZ0IxQyxTQUFTLDZCQUE2QixRQUFRLEtBQUssT0FBTyxHQUFHLFNBQVMsS0FBSyxPQUFPLEdBQVc7QUFDbkcsU0FBTyxLQUFLLElBQUksS0FBSyxNQUFNLFFBQVEsRUFBRSxHQUFHLEtBQUssTUFBTSxTQUFTLEVBQUUsQ0FBQztBQUNoRTtBQUVPLFNBQVMs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
