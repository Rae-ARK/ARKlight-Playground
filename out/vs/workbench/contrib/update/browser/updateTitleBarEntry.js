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
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { isWeb } from "../../../../base/common/platform.js";
import { localize } from "../../../../nls.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { DisablementReason, IUpdateService, StateType } from "../../../../platform/update/common/update.js";
import { InEditorZenModeContext } from "../../../common/contextkeys.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IChatService } from "../../chat/common/chatService/chatService.js";
import { computeProgressPercent } from "../common/updateUtils.js";
import "./media/updateTitleBarEntry.css";
import { UpdateTooltip } from "./updateTooltip.js";
const UPDATE_TITLE_BAR_ACTION_ID = "workbench.actions.updateIndicator";
const UPDATE_TITLE_BAR_CONTEXT = new RawContextKey("updateTitleBar", false);
const UPDATE_TITLE_BAR_CHAT_IN_PROGRESS_CONTEXT = new RawContextKey("updateTitleBarChatRequestInProgress", false);
const DISABLED_REMINDER_LAST_SHOWN_KEY = "update/disabledReminderLastShown";
const DISABLED_REMINDER_PERIOD = 30 * 24 * 60 * 60 * 1e3;
const UPDATE_TITLE_BAR_SETTING = "update.titleBar";
const ACTIONABLE_STATES = [StateType.AvailableForDownload, StateType.Downloaded, StateType.Ready];
const DETAILED_STATES = [...ACTIONABLE_STATES, StateType.CheckingForUpdates, StateType.Downloading, StateType.Updating, StateType.Overwriting, StateType.Cancelling];
let additionalMenuPlacement;
function registerUpdateTitleBarMenuPlacement(menuId, item = {}) {
  if (additionalMenuPlacement) {
    throw new Error("An additional update title bar menu placement is already registered");
  }
  additionalMenuPlacement = { menuId, item };
}
registerAction2(class UpdateIndicatorTitleBarAction extends Action2 {
  constructor() {
    super({
      id: UPDATE_TITLE_BAR_ACTION_ID,
      title: localize("updateIndicatorTitleBarAction", "Update"),
      f1: false,
      menu: [{
        id: MenuId.TitleBarAdjacentCenter,
        order: 0,
        when: ContextKeyExpr.and(UPDATE_TITLE_BAR_CONTEXT, InEditorZenModeContext.negate(), ContextKeyExpr.not("inDebugMode"), UPDATE_TITLE_BAR_CHAT_IN_PROGRESS_CONTEXT.negate())
      }]
    });
  }
  async run() {
  }
});
let UpdateTitleBarContribution = class extends Disposable {
  constructor(actionViewItemService, chatService, configurationService, contextKeyService, hostService, instantiationService, storageService, updateService) {
    super();
    this.configurationService = configurationService;
    this.hostService = hostService;
    this.storageService = storageService;
    this.tooltipVisible = false;
    if (isWeb) {
      return;
    }
    this.context = UPDATE_TITLE_BAR_CONTEXT.bindTo(contextKeyService);
    this.tooltip = this._register(instantiationService.createInstance(UpdateTooltip));
    const chatInProgressContext = UPDATE_TITLE_BAR_CHAT_IN_PROGRESS_CONTEXT.bindTo(contextKeyService);
    this._register(autorun((reader) => {
      chatInProgressContext.set(chatService.requestInProgressObs.read(reader));
    }));
    this.state = updateService.state;
    this._register(updateService.onStateChange((state) => {
      this.state = state;
      this.onStateChange();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(UPDATE_TITLE_BAR_SETTING)) {
        this.onStateChange();
      }
    }));
    this._register(actionViewItemService.register(
      MenuId.TitleBarAdjacentCenter,
      UPDATE_TITLE_BAR_ACTION_ID,
      (action, options) => this.createEntry(instantiationService, action, options)
    ));
    if (additionalMenuPlacement) {
      const { menuId, item } = additionalMenuPlacement;
      MenuRegistry.appendMenuItem(menuId, {
        ...item,
        command: {
          id: UPDATE_TITLE_BAR_ACTION_ID,
          title: localize("updateIndicatorTitleBarAction", "Update")
        },
        when: ContextKeyExpr.and(UPDATE_TITLE_BAR_CONTEXT, UPDATE_TITLE_BAR_CHAT_IN_PROGRESS_CONTEXT.negate(), item.when)
      });
      this._register(actionViewItemService.register(
        menuId,
        UPDATE_TITLE_BAR_ACTION_ID,
        (action, options) => this.createEntry(instantiationService, action, options)
      ));
    }
    void this.onStateChange(true);
  }
  createEntry(instantiationService, action, options) {
    this.entry = instantiationService.createInstance(UpdateTitleBarEntry, action, options, this.tooltip, () => {
      this.tooltipVisible = false;
      if (!ACTIONABLE_STATES.includes(this.state.type) && !DETAILED_STATES.includes(this.state.type)) {
        this.context.set(false);
      }
    });
    if (this.tooltipVisible) {
      this.entry.showTooltip();
    }
    return this.entry;
  }
  async onStateChange(startup = false) {
    if (this.configurationService.getValue(UPDATE_TITLE_BAR_SETTING) === false) {
      this.context.set(false);
      return;
    }
    if (this.tooltipVisible || !await this.hostService.hadLastFocus()) {
      this.context.set(ACTIONABLE_STATES.includes(this.state.type));
      this.tooltip.renderState(this.state);
      return;
    }
    this.tooltip.renderState(this.state);
    let context = ACTIONABLE_STATES.includes(this.state.type);
    let showTooltip = false;
    switch (this.state.type) {
      case StateType.Disabled:
        if (startup) {
          const reason = this.state.reason;
          if (reason === DisablementReason.InvalidConfiguration || reason === DisablementReason.RunningAsAdmin) {
            const lastShown = this.storageService.getNumber(DISABLED_REMINDER_LAST_SHOWN_KEY, StorageScope.APPLICATION);
            showTooltip = lastShown === void 0 || Date.now() - lastShown >= DISABLED_REMINDER_PERIOD;
          }
        }
        break;
      case StateType.Idle:
        showTooltip = !!this.state.error;
        break;
      case StateType.Downloading:
      case StateType.Updating:
      case StateType.Overwriting:
        context = this.state.explicit;
        break;
      case StateType.Cancelling:
        context = true;
        break;
      case StateType.Restarting:
        context = true;
        break;
    }
    if (showTooltip) {
      this.tooltipVisible = true;
      context = true;
    }
    this.context.set(context);
    if (showTooltip) {
      this.entry?.showTooltip();
      if (this.state.type === StateType.Disabled) {
        this.storageService.store(DISABLED_REMINDER_LAST_SHOWN_KEY, Date.now(), StorageScope.APPLICATION, StorageTarget.MACHINE);
      }
    }
  }
};
UpdateTitleBarContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IChatService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IHostService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IUpdateService)
], UpdateTitleBarContribution);
let UpdateTitleBarEntry = class extends BaseActionViewItem {
  constructor(action, options, tooltip, onUserDismissedTooltip, commandService, hoverService, telemetryService, updateService) {
    super(void 0, action, options);
    this.tooltip = tooltip;
    this.onUserDismissedTooltip = onUserDismissedTooltip;
    this.commandService = commandService;
    this.hoverService = hoverService;
    this.telemetryService = telemetryService;
    this.updateService = updateService;
    this.showTooltipOnRender = false;
    this.action.run = () => this.runAction();
    this._register(this.updateService.onStateChange((state) => this.onStateChange(state)));
  }
  render(container) {
    super.render(container);
    this.content = dom.append(container, dom.$(".update-indicator"));
    this.updateTooltip();
    this.onStateChange(this.updateService.state);
    if (this.showTooltipOnRender) {
      this.showTooltipOnRender = false;
      dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => this.showTooltip());
    }
  }
  showTooltip(focus = false) {
    if (!this.element?.isConnected) {
      this.showTooltipOnRender = true;
      return;
    }
    this.hoverService.showInstantHover({
      content: this.tooltip.domNode,
      target: {
        targetElements: [this.element],
        dispose: () => {
          if (!!this.element?.isConnected) {
            this.onUserDismissedTooltip();
          }
        }
      },
      persistence: { sticky: true },
      appearance: { showPointer: true, compact: true }
    }, focus);
  }
  getHoverContents() {
    return this.tooltip.domNode;
  }
  async runAction() {
    let commandId;
    switch (this.updateService.state.type) {
      case StateType.AvailableForDownload:
        commandId = "update.downloadNow";
        break;
      case StateType.Downloaded:
        commandId = "update.install";
        break;
      case StateType.Ready:
        commandId = "update.restart";
        break;
      default:
        this.showTooltip(true);
        return;
    }
    this.telemetryService.publicLog2("workbenchActionExecuted", { id: commandId, from: "titlebar" });
    await this.commandService.executeCommand(commandId);
  }
  onStateChange(state) {
    if (!this.content) {
      return;
    }
    dom.clearNode(this.content);
    this.content.classList.remove("prominent", "progress-indefinite", "progress-percent", "update-disabled");
    this.content.style.removeProperty("--update-progress");
    const label = dom.append(this.content, dom.$(".indicator-label"));
    switch (state.type) {
      case StateType.Disabled:
        label.textContent = localize("updateIndicator.update", "Update");
        this.content.classList.add("update-disabled");
        break;
      case StateType.CheckingForUpdates:
        label.textContent = localize("updateIndicator.checking", "Checking...");
        this.renderProgressState(this.content);
        break;
      case StateType.Overwriting:
        label.textContent = localize("updateIndicator.overwriting", "Updating...");
        this.renderProgressState(this.content);
        break;
      case StateType.AvailableForDownload:
      case StateType.Downloaded:
      case StateType.Ready:
        label.textContent = localize("updateIndicator.update", "Update");
        this.content.classList.add("prominent");
        break;
      case StateType.Downloading:
        label.textContent = localize("updateIndicator.downloading", "Downloading...");
        this.renderProgressState(this.content, computeProgressPercent(state.downloadedBytes, state.totalBytes));
        break;
      case StateType.Updating:
        label.textContent = localize("updateIndicator.installing", "Installing...");
        this.renderProgressState(this.content, computeProgressPercent(state.currentProgress, state.maxProgress));
        break;
      case StateType.Restarting:
        label.textContent = localize("updateIndicator.restarting", "Restarting...");
        this.renderProgressState(this.content);
        break;
      case StateType.Cancelling:
        label.textContent = localize("updateIndicator.cancelling", "Cancelling...");
        this.renderProgressState(this.content);
        break;
      default:
        label.textContent = localize("updateIndicator.update", "Update");
        break;
    }
  }
  renderProgressState(content, percentage) {
    if (percentage !== void 0) {
      content.classList.add("progress-percent");
      content.style.setProperty("--update-progress", `${percentage}%`);
    } else {
      content.classList.add("progress-indefinite");
    }
  }
};
UpdateTitleBarEntry = __decorateClass([
  __decorateParam(4, ICommandService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IUpdateService)
], UpdateTitleBarEntry);
export {
  UpdateTitleBarContribution,
  UpdateTitleBarEntry,
  registerUpdateTitleBarMenuPlacement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3VwZGF0ZS9icm93c2VyL3VwZGF0ZVRpdGxlQmFyRW50cnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCYXNlQWN0aW9uVmlld0l0ZW0sIElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgSU1hbmFnZWRIb3ZlckNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbiwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElNZW51SXRlbSwgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgRGlzYWJsZW1lbnRSZWFzb24sIElVcGRhdGVTZXJ2aWNlLCBTdGF0ZSwgU3RhdGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgSW5FZGl0b3JaZW5Nb2RlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY29tcHV0ZVByb2dyZXNzUGVyY2VudCB9IGZyb20gJy4uL2NvbW1vbi91cGRhdGVVdGlscy5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvdXBkYXRlVGl0bGVCYXJFbnRyeS5jc3MnO1xuaW1wb3J0IHsgVXBkYXRlVG9vbHRpcCB9IGZyb20gJy4vdXBkYXRlVG9vbHRpcC5qcyc7XG5cbmNvbnN0IFVQREFURV9USVRMRV9CQVJfQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb25zLnVwZGF0ZUluZGljYXRvcic7XG5jb25zdCBVUERBVEVfVElUTEVfQkFSX0NPTlRFWFQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigndXBkYXRlVGl0bGVCYXInLCBmYWxzZSk7XG5jb25zdCBVUERBVEVfVElUTEVfQkFSX0NIQVRfSU5fUFJPR1JFU1NfQ09OVEVYVCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCd1cGRhdGVUaXRsZUJhckNoYXRSZXF1ZXN0SW5Qcm9ncmVzcycsIGZhbHNlKTtcblxuY29uc3QgRElTQUJMRURfUkVNSU5ERVJfTEFTVF9TSE9XTl9LRVkgPSAndXBkYXRlL2Rpc2FibGVkUmVtaW5kZXJMYXN0U2hvd24nO1xuY29uc3QgRElTQUJMRURfUkVNSU5ERVJfUEVSSU9EID0gMzAgKiAyNCAqIDYwICogNjAgKiAxMDAwOyAvLyAzMCBkYXlzXG5cbmNvbnN0IFVQREFURV9USVRMRV9CQVJfU0VUVElORyA9ICd1cGRhdGUudGl0bGVCYXInO1xuXG5jb25zdCBBQ1RJT05BQkxFX1NUQVRFUzogcmVhZG9ubHkgU3RhdGVUeXBlW10gPSBbU3RhdGVUeXBlLkF2YWlsYWJsZUZvckRvd25sb2FkLCBTdGF0ZVR5cGUuRG93bmxvYWRlZCwgU3RhdGVUeXBlLlJlYWR5XTtcbmNvbnN0IERFVEFJTEVEX1NUQVRFUzogcmVhZG9ubHkgU3RhdGVUeXBlW10gPSBbLi4uQUNUSU9OQUJMRV9TVEFURVMsIFN0YXRlVHlwZS5DaGVja2luZ0ZvclVwZGF0ZXMsIFN0YXRlVHlwZS5Eb3dubG9hZGluZywgU3RhdGVUeXBlLlVwZGF0aW5nLCBTdGF0ZVR5cGUuT3ZlcndyaXRpbmcsIFN0YXRlVHlwZS5DYW5jZWxsaW5nXTtcblxuLyoqXG4gKiBPcHRpb25hbCBzZWNvbmRhcnkgcGxhY2VtZW50IGZvciB0aGUgdXBkYXRlIGluZGljYXRvciAoZS5nLiB1c2VkIGJ5IHRoZSBBZ2VudHNcbiAqIGFwcCkuIExpbWl0ZWQgdG8gb25lIGJlY2F1c2UgdGhlIGNvbnRyaWJ1dGlvbiB0cmFja3MgYSBzaW5nbGUgcmVuZGVyZWQgZW50cnkuXG4gKi9cbmxldCBhZGRpdGlvbmFsTWVudVBsYWNlbWVudDogeyByZWFkb25seSBtZW51SWQ6IE1lbnVJZDsgcmVhZG9ubHkgaXRlbTogT21pdDxJTWVudUl0ZW0sICdjb21tYW5kJz4gfSB8IHVuZGVmaW5lZDtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyVXBkYXRlVGl0bGVCYXJNZW51UGxhY2VtZW50KG1lbnVJZDogTWVudUlkLCBpdGVtOiBPbWl0PElNZW51SXRlbSwgJ2NvbW1hbmQnPiA9IHt9KTogdm9pZCB7XG5cdGlmIChhZGRpdGlvbmFsTWVudVBsYWNlbWVudCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignQW4gYWRkaXRpb25hbCB1cGRhdGUgdGl0bGUgYmFyIG1lbnUgcGxhY2VtZW50IGlzIGFscmVhZHkgcmVnaXN0ZXJlZCcpO1xuXHR9XG5cdGFkZGl0aW9uYWxNZW51UGxhY2VtZW50ID0geyBtZW51SWQsIGl0ZW0gfTtcbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFVwZGF0ZUluZGljYXRvclRpdGxlQmFyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBVUERBVEVfVElUTEVfQkFSX0FDVElPTl9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndXBkYXRlSW5kaWNhdG9yVGl0bGVCYXJBY3Rpb24nLCAnVXBkYXRlJyksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlRpdGxlQmFyQWRqYWNlbnRDZW50ZXIsXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVVBEQVRFX1RJVExFX0JBUl9DT05URVhULCBJbkVkaXRvclplbk1vZGVDb250ZXh0Lm5lZ2F0ZSgpLCBDb250ZXh0S2V5RXhwci5ub3QoJ2luRGVidWdNb2RlJyksIFVQREFURV9USVRMRV9CQVJfQ0hBVF9JTl9QUk9HUkVTU19DT05URVhULm5lZ2F0ZSgpKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKSB7IH1cbn0pO1xuXG4vKipcbiAqIERpc3BsYXlzIHVwZGF0ZSBzdGF0dXMgYW5kIGFjdGlvbnMgaW4gdGhlIHRpdGxlIGJhci5cbiAqL1xuZXhwb3J0IGNsYXNzIFVwZGF0ZVRpdGxlQmFyQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHQhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSB0b29sdGlwITogVXBkYXRlVG9vbHRpcDtcblx0cHJpdmF0ZSBzdGF0ZSE6IFN0YXRlO1xuXHRwcml2YXRlIGVudHJ5OiBVcGRhdGVUaXRsZUJhckVudHJ5IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRvb2x0aXBWaXNpYmxlID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVXBkYXRlU2VydmljZSB1cGRhdGVTZXJ2aWNlOiBJVXBkYXRlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmIChpc1dlYikge1xuXHRcdFx0cmV0dXJuOyAvLyBFbGVjdHJvbiBvbmx5XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250ZXh0ID0gVVBEQVRFX1RJVExFX0JBUl9DT05URVhULmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy50b29sdGlwID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXBkYXRlVG9vbHRpcCkpO1xuXG5cdFx0Y29uc3QgY2hhdEluUHJvZ3Jlc3NDb250ZXh0ID0gVVBEQVRFX1RJVExFX0JBUl9DSEFUX0lOX1BST0dSRVNTX0NPTlRFWFQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjaGF0SW5Qcm9ncmVzc0NvbnRleHQuc2V0KGNoYXRTZXJ2aWNlLnJlcXVlc3RJblByb2dyZXNzT2JzLnJlYWQocmVhZGVyKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zdGF0ZSA9IHVwZGF0ZVNlcnZpY2Uuc3RhdGU7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodXBkYXRlU2VydmljZS5vblN0YXRlQ2hhbmdlKChzdGF0ZSkgPT4ge1xuXHRcdFx0dGhpcy5zdGF0ZSA9IHN0YXRlO1xuXHRcdFx0dGhpcy5vblN0YXRlQ2hhbmdlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihVUERBVEVfVElUTEVfQkFSX1NFVFRJTkcpKSB7XG5cdFx0XHRcdHRoaXMub25TdGF0ZUNoYW5nZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3Rlcihcblx0XHRcdE1lbnVJZC5UaXRsZUJhckFkamFjZW50Q2VudGVyLFxuXHRcdFx0VVBEQVRFX1RJVExFX0JBUl9BQ1RJT05fSUQsXG5cdFx0XHQoYWN0aW9uLCBvcHRpb25zKSA9PiB0aGlzLmNyZWF0ZUVudHJ5KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpb24sIG9wdGlvbnMpXG5cdFx0KSk7XG5cblx0XHRpZiAoYWRkaXRpb25hbE1lbnVQbGFjZW1lbnQpIHtcblx0XHRcdGNvbnN0IHsgbWVudUlkLCBpdGVtIH0gPSBhZGRpdGlvbmFsTWVudVBsYWNlbWVudDtcblx0XHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51SWQsIHtcblx0XHRcdFx0Li4uaXRlbSxcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdGlkOiBVUERBVEVfVElUTEVfQkFSX0FDVElPTl9JRCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3VwZGF0ZUluZGljYXRvclRpdGxlQmFyQWN0aW9uJywgJ1VwZGF0ZScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVVBEQVRFX1RJVExFX0JBUl9DT05URVhULCBVUERBVEVfVElUTEVfQkFSX0NIQVRfSU5fUFJPR1JFU1NfQ09OVEVYVC5uZWdhdGUoKSwgaXRlbS53aGVuKSxcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKFxuXHRcdFx0XHRtZW51SWQsXG5cdFx0XHRcdFVQREFURV9USVRMRV9CQVJfQUNUSU9OX0lELFxuXHRcdFx0XHQoYWN0aW9uLCBvcHRpb25zKSA9PiB0aGlzLmNyZWF0ZUVudHJ5KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpb24sIG9wdGlvbnMpXG5cdFx0XHQpKTtcblx0XHR9XG5cblx0XHR2b2lkIHRoaXMub25TdGF0ZUNoYW5nZSh0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRW50cnkoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyk6IFVwZGF0ZVRpdGxlQmFyRW50cnkge1xuXHRcdHRoaXMuZW50cnkgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVcGRhdGVUaXRsZUJhckVudHJ5LCBhY3Rpb24sIG9wdGlvbnMsIHRoaXMudG9vbHRpcCwgKCkgPT4ge1xuXHRcdFx0dGhpcy50b29sdGlwVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0aWYgKCFBQ1RJT05BQkxFX1NUQVRFUy5pbmNsdWRlcyh0aGlzLnN0YXRlLnR5cGUpICYmICFERVRBSUxFRF9TVEFURVMuaW5jbHVkZXModGhpcy5zdGF0ZS50eXBlKSkge1xuXHRcdFx0XHR0aGlzLmNvbnRleHQuc2V0KGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpZiAodGhpcy50b29sdGlwVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5lbnRyeS5zaG93VG9vbHRpcCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5lbnRyeTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25TdGF0ZUNoYW5nZShzdGFydHVwID0gZmFsc2UpIHtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihVUERBVEVfVElUTEVfQkFSX1NFVFRJTkcpID09PSBmYWxzZSkge1xuXHRcdFx0dGhpcy5jb250ZXh0LnNldChmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVG9vbHRpcCBhbHJlYWR5IHNob3duIG9yIHdpbmRvdyBub3QgbGFzdCBmb2N1c2VkOiBvbmx5IHN5bmMgY29udGVudCBhbmQgaW5kaWNhdG9yIHZpc2liaWxpdHkuXG5cdFx0aWYgKHRoaXMudG9vbHRpcFZpc2libGUgfHwgIWF3YWl0IHRoaXMuaG9zdFNlcnZpY2UuaGFkTGFzdEZvY3VzKCkpIHtcblx0XHRcdHRoaXMuY29udGV4dC5zZXQoQUNUSU9OQUJMRV9TVEFURVMuaW5jbHVkZXModGhpcy5zdGF0ZS50eXBlKSk7XG5cdFx0XHR0aGlzLnRvb2x0aXAucmVuZGVyU3RhdGUodGhpcy5zdGF0ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy50b29sdGlwLnJlbmRlclN0YXRlKHRoaXMuc3RhdGUpO1xuXG5cdFx0Ly8gU2V0IHRoZSBjb250ZXh0IGtleSBvbmx5IG9uY2UuIFRvZ2dsaW5nIGl0IChlLmcuIG9mZiB0aGVuIG9uKSByZWNyZWF0ZXMgdGhlIGVudHJ5IG9uIGV2ZXJ5XG5cdFx0Ly8gc3RhdGUgdXBkYXRlLCB3aGljaCBmb3IgZnJlcXVlbnQgdXBkYXRlcyBsaWtlIGRvd25sb2FkIHByb2dyZXNzIGZsYXNoZXMgdGhlIHRvb2x0aXAgKCMzMTE5MzgpLlxuXHRcdGxldCBjb250ZXh0ID0gQUNUSU9OQUJMRV9TVEFURVMuaW5jbHVkZXModGhpcy5zdGF0ZS50eXBlKTtcblx0XHRsZXQgc2hvd1Rvb2x0aXAgPSBmYWxzZTtcblx0XHRzd2l0Y2ggKHRoaXMuc3RhdGUudHlwZSkge1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuRGlzYWJsZWQ6XG5cdFx0XHRcdGlmIChzdGFydHVwKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVhc29uID0gdGhpcy5zdGF0ZS5yZWFzb247XG5cdFx0XHRcdFx0aWYgKHJlYXNvbiA9PT0gRGlzYWJsZW1lbnRSZWFzb24uSW52YWxpZENvbmZpZ3VyYXRpb24gfHwgcmVhc29uID09PSBEaXNhYmxlbWVudFJlYXNvbi5SdW5uaW5nQXNBZG1pbikge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFzdFNob3duID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXROdW1iZXIoRElTQUJMRURfUkVNSU5ERVJfTEFTVF9TSE9XTl9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRcdFx0XHRzaG93VG9vbHRpcCA9IGxhc3RTaG93biA9PT0gdW5kZWZpbmVkIHx8IChEYXRlLm5vdygpIC0gbGFzdFNob3duKSA+PSBESVNBQkxFRF9SRU1JTkRFUl9QRVJJT0Q7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuSWRsZTpcblx0XHRcdFx0c2hvd1Rvb2x0aXAgPSAhIXRoaXMuc3RhdGUuZXJyb3I7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuRG93bmxvYWRpbmc6XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5VcGRhdGluZzpcblx0XHRcdGNhc2UgU3RhdGVUeXBlLk92ZXJ3cml0aW5nOlxuXHRcdFx0XHRjb250ZXh0ID0gdGhpcy5zdGF0ZS5leHBsaWNpdDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5DYW5jZWxsaW5nOlxuXHRcdFx0XHRjb250ZXh0ID0gdHJ1ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5SZXN0YXJ0aW5nOlxuXHRcdFx0XHRjb250ZXh0ID0gdHJ1ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKHNob3dUb29sdGlwKSB7XG5cdFx0XHR0aGlzLnRvb2x0aXBWaXNpYmxlID0gdHJ1ZTtcblx0XHRcdGNvbnRleHQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGV4dC5zZXQoY29udGV4dCk7XG5cblx0XHRpZiAoc2hvd1Rvb2x0aXApIHtcblx0XHRcdHRoaXMuZW50cnk/LnNob3dUb29sdGlwKCk7XG5cdFx0XHRpZiAodGhpcy5zdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuRGlzYWJsZWQpIHtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShESVNBQkxFRF9SRU1JTkRFUl9MQVNUX1NIT1dOX0tFWSwgRGF0ZS5ub3coKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG59XG5cbi8qKlxuICogQ3VzdG9tIGFjdGlvbiB2aWV3IGl0ZW0gZm9yIHRoZSB1cGRhdGUgaW5kaWNhdG9yIGluIHRoZSB0aXRsZSBiYXIuXG4gKi9cbmV4cG9ydCBjbGFzcyBVcGRhdGVUaXRsZUJhckVudHJ5IGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblx0cHJpdmF0ZSBjb250ZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzaG93VG9vbHRpcE9uUmVuZGVyID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdG9vbHRpcDogVXBkYXRlVG9vbHRpcCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9uVXNlckRpc21pc3NlZFRvb2x0aXA6ICgpID0+IHZvaWQsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElVcGRhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlU2VydmljZTogSVVwZGF0ZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uLCBvcHRpb25zKTtcblxuXHRcdHRoaXMuYWN0aW9uLnJ1biA9ICgpID0+IHRoaXMucnVuQWN0aW9uKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51cGRhdGVTZXJ2aWNlLm9uU3RhdGVDaGFuZ2Uoc3RhdGUgPT4gdGhpcy5vblN0YXRlQ2hhbmdlKHN0YXRlKSkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLmNvbnRlbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy51cGRhdGUtaW5kaWNhdG9yJykpO1xuXHRcdHRoaXMudXBkYXRlVG9vbHRpcCgpO1xuXHRcdHRoaXMub25TdGF0ZUNoYW5nZSh0aGlzLnVwZGF0ZVNlcnZpY2Uuc3RhdGUpO1xuXG5cdFx0aWYgKHRoaXMuc2hvd1Rvb2x0aXBPblJlbmRlcikge1xuXHRcdFx0dGhpcy5zaG93VG9vbHRpcE9uUmVuZGVyID0gZmFsc2U7XG5cdFx0XHRkb20uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KGNvbnRhaW5lciksICgpID0+IHRoaXMuc2hvd1Rvb2x0aXAoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNob3dUb29sdGlwKGZvY3VzID0gZmFsc2UpIHtcblx0XHRpZiAoIXRoaXMuZWxlbWVudD8uaXNDb25uZWN0ZWQpIHtcblx0XHRcdHRoaXMuc2hvd1Rvb2x0aXBPblJlbmRlciA9IHRydWU7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5ob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRjb250ZW50OiB0aGlzLnRvb2x0aXAuZG9tTm9kZSxcblx0XHRcdHRhcmdldDoge1xuXHRcdFx0XHR0YXJnZXRFbGVtZW50czogW3RoaXMuZWxlbWVudF0sXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRpZiAoISF0aGlzLmVsZW1lbnQ/LmlzQ29ubmVjdGVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm9uVXNlckRpc21pc3NlZFRvb2x0aXAoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRwZXJzaXN0ZW5jZTogeyBzdGlja3k6IHRydWUgfSxcblx0XHRcdGFwcGVhcmFuY2U6IHsgc2hvd1BvaW50ZXI6IHRydWUsIGNvbXBhY3Q6IHRydWUgfSxcblx0XHR9LCBmb2N1cyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0SG92ZXJDb250ZW50cygpOiBJTWFuYWdlZEhvdmVyQ29udGVudCB7XG5cdFx0cmV0dXJuIHRoaXMudG9vbHRpcC5kb21Ob2RlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBydW5BY3Rpb24oKSB7XG5cdFx0bGV0IGNvbW1hbmRJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHN3aXRjaCAodGhpcy51cGRhdGVTZXJ2aWNlLnN0YXRlLnR5cGUpIHtcblx0XHRcdGNhc2UgU3RhdGVUeXBlLkF2YWlsYWJsZUZvckRvd25sb2FkOlxuXHRcdFx0XHRjb21tYW5kSWQgPSAndXBkYXRlLmRvd25sb2FkTm93Jztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5Eb3dubG9hZGVkOlxuXHRcdFx0XHRjb21tYW5kSWQgPSAndXBkYXRlLmluc3RhbGwnO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3RhdGVUeXBlLlJlYWR5OlxuXHRcdFx0XHRjb21tYW5kSWQgPSAndXBkYXRlLnJlc3RhcnQnO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRoaXMuc2hvd1Rvb2x0aXAodHJ1ZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiBjb21tYW5kSWQsIGZyb206ICd0aXRsZWJhcicgfSk7XG5cdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblN0YXRlQ2hhbmdlKHN0YXRlOiBTdGF0ZSkge1xuXHRcdGlmICghdGhpcy5jb250ZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmNvbnRlbnQpO1xuXHRcdHRoaXMuY29udGVudC5jbGFzc0xpc3QucmVtb3ZlKCdwcm9taW5lbnQnLCAncHJvZ3Jlc3MtaW5kZWZpbml0ZScsICdwcm9ncmVzcy1wZXJjZW50JywgJ3VwZGF0ZS1kaXNhYmxlZCcpO1xuXHRcdHRoaXMuY29udGVudC5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgnLS11cGRhdGUtcHJvZ3Jlc3MnKTtcblxuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZCh0aGlzLmNvbnRlbnQsIGRvbS4kKCcuaW5kaWNhdG9yLWxhYmVsJykpO1xuXHRcdHN3aXRjaCAoc3RhdGUudHlwZSkge1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuRGlzYWJsZWQ6XG5cdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VwZGF0ZUluZGljYXRvci51cGRhdGUnLCBcIlVwZGF0ZVwiKTtcblx0XHRcdFx0dGhpcy5jb250ZW50LmNsYXNzTGlzdC5hZGQoJ3VwZGF0ZS1kaXNhYmxlZCcpO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuQ2hlY2tpbmdGb3JVcGRhdGVzOlxuXHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd1cGRhdGVJbmRpY2F0b3IuY2hlY2tpbmcnLCBcIkNoZWNraW5nLi4uXCIpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclByb2dyZXNzU3RhdGUodGhpcy5jb250ZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLk92ZXJ3cml0aW5nOlxuXHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd1cGRhdGVJbmRpY2F0b3Iub3ZlcndyaXRpbmcnLCBcIlVwZGF0aW5nLi4uXCIpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclByb2dyZXNzU3RhdGUodGhpcy5jb250ZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLkF2YWlsYWJsZUZvckRvd25sb2FkOlxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuRG93bmxvYWRlZDpcblx0XHRcdGNhc2UgU3RhdGVUeXBlLlJlYWR5OlxuXHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd1cGRhdGVJbmRpY2F0b3IudXBkYXRlJywgXCJVcGRhdGVcIik7XG5cdFx0XHRcdHRoaXMuY29udGVudC5jbGFzc0xpc3QuYWRkKCdwcm9taW5lbnQnKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLkRvd25sb2FkaW5nOlxuXHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd1cGRhdGVJbmRpY2F0b3IuZG93bmxvYWRpbmcnLCBcIkRvd25sb2FkaW5nLi4uXCIpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclByb2dyZXNzU3RhdGUodGhpcy5jb250ZW50LCBjb21wdXRlUHJvZ3Jlc3NQZXJjZW50KHN0YXRlLmRvd25sb2FkZWRCeXRlcywgc3RhdGUudG90YWxCeXRlcykpO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuVXBkYXRpbmc6XG5cdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VwZGF0ZUluZGljYXRvci5pbnN0YWxsaW5nJywgXCJJbnN0YWxsaW5nLi4uXCIpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclByb2dyZXNzU3RhdGUodGhpcy5jb250ZW50LCBjb21wdXRlUHJvZ3Jlc3NQZXJjZW50KHN0YXRlLmN1cnJlbnRQcm9ncmVzcywgc3RhdGUubWF4UHJvZ3Jlc3MpKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLlJlc3RhcnRpbmc6XG5cdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VwZGF0ZUluZGljYXRvci5yZXN0YXJ0aW5nJywgXCJSZXN0YXJ0aW5nLi4uXCIpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclByb2dyZXNzU3RhdGUodGhpcy5jb250ZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgU3RhdGVUeXBlLkNhbmNlbGxpbmc6XG5cdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VwZGF0ZUluZGljYXRvci5jYW5jZWxsaW5nJywgXCJDYW5jZWxsaW5nLi4uXCIpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclByb2dyZXNzU3RhdGUodGhpcy5jb250ZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VwZGF0ZUluZGljYXRvci51cGRhdGUnLCBcIlVwZGF0ZVwiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJQcm9ncmVzc1N0YXRlKGNvbnRlbnQ6IEhUTUxFbGVtZW50LCBwZXJjZW50YWdlPzogbnVtYmVyKSB7XG5cdFx0aWYgKHBlcmNlbnRhZ2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29udGVudC5jbGFzc0xpc3QuYWRkKCdwcm9ncmVzcy1wZXJjZW50Jyk7XG5cdFx0XHRjb250ZW50LnN0eWxlLnNldFByb3BlcnR5KCctLXVwZGF0ZS1wcm9ncmVzcycsIGAke3BlcmNlbnRhZ2V9JWApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb250ZW50LmNsYXNzTGlzdC5hZGQoJ3Byb2dyZXNzLWluZGVmaW5pdGUnKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMEJBQXNEO0FBRy9ELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxTQUFvQixRQUFRLGNBQWMsdUJBQXVCO0FBQzFFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQTZCLG9CQUFvQixxQkFBcUI7QUFDL0UsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUIsZ0JBQXVCLGlCQUFpQjtBQUNwRSxTQUFTLDhCQUE4QjtBQUV2QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDhCQUE4QjtBQUN2QyxPQUFPO0FBQ1AsU0FBUyxxQkFBcUI7QUFFOUIsTUFBTSw2QkFBNkI7QUFDbkMsTUFBTSwyQkFBMkIsSUFBSSxjQUF1QixrQkFBa0IsS0FBSztBQUNuRixNQUFNLDRDQUE0QyxJQUFJLGNBQXVCLHVDQUF1QyxLQUFLO0FBRXpILE1BQU0sbUNBQW1DO0FBQ3pDLE1BQU0sMkJBQTJCLEtBQUssS0FBSyxLQUFLLEtBQUs7QUFFckQsTUFBTSwyQkFBMkI7QUFFakMsTUFBTSxvQkFBMEMsQ0FBQyxVQUFVLHNCQUFzQixVQUFVLFlBQVksVUFBVSxLQUFLO0FBQ3RILE1BQU0sa0JBQXdDLENBQUMsR0FBRyxtQkFBbUIsVUFBVSxvQkFBb0IsVUFBVSxhQUFhLFVBQVUsVUFBVSxVQUFVLGFBQWEsVUFBVSxVQUFVO0FBTXpMLElBQUk7QUFFRyxTQUFTLG9DQUFvQyxRQUFnQixPQUFtQyxDQUFDLEdBQVM7QUFDaEgsTUFBSSx5QkFBeUI7QUFDNUIsVUFBTSxJQUFJLE1BQU0scUVBQXFFO0FBQUEsRUFDdEY7QUFDQSw0QkFBMEIsRUFBRSxRQUFRLEtBQUs7QUFDMUM7QUFFQSxnQkFBZ0IsTUFBTSxzQ0FBc0MsUUFBUTtBQUFBLEVBQ25FLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsaUNBQWlDLFFBQVE7QUFBQSxNQUN6RCxJQUFJO0FBQUEsTUFDSixNQUFNLENBQUM7QUFBQSxRQUNOLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsTUFBTSxlQUFlLElBQUksMEJBQTBCLHVCQUF1QixPQUFPLEdBQUcsZUFBZSxJQUFJLGFBQWEsR0FBRywwQ0FBMEMsT0FBTyxDQUFDO0FBQUEsTUFDMUssQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWUsTUFBTTtBQUFBLEVBQUU7QUFDeEIsQ0FBQztBQUtNLElBQU0sNkJBQU4sY0FBeUMsV0FBNkM7QUFBQSxFQU81RixZQUN5Qix1QkFDVixhQUMwQixzQkFDcEIsbUJBQ1csYUFDUixzQkFDVyxnQkFDbEIsZUFDZjtBQUNELFVBQU07QUFQa0M7QUFFVDtBQUVHO0FBVG5DLFNBQVEsaUJBQWlCO0FBY3hCLFFBQUksT0FBTztBQUNWO0FBQUEsSUFDRDtBQUVBLFNBQUssVUFBVSx5QkFBeUIsT0FBTyxpQkFBaUI7QUFDaEUsU0FBSyxVQUFVLEtBQUssVUFBVSxxQkFBcUIsZUFBZSxhQUFhLENBQUM7QUFFaEYsVUFBTSx3QkFBd0IsMENBQTBDLE9BQU8saUJBQWlCO0FBQ2hHLFNBQUssVUFBVSxRQUFRLFlBQVU7QUFDaEMsNEJBQXNCLElBQUksWUFBWSxxQkFBcUIsS0FBSyxNQUFNLENBQUM7QUFBQSxJQUN4RSxDQUFDLENBQUM7QUFFRixTQUFLLFFBQVEsY0FBYztBQUMzQixTQUFLLFVBQVUsY0FBYyxjQUFjLENBQUMsVUFBVTtBQUNyRCxXQUFLLFFBQVE7QUFDYixXQUFLLGNBQWM7QUFBQSxJQUNwQixDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyxxQkFBcUIseUJBQXlCLE9BQUs7QUFDdEUsVUFBSSxFQUFFLHFCQUFxQix3QkFBd0IsR0FBRztBQUNyRCxhQUFLLGNBQWM7QUFBQSxNQUNwQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLHNCQUFzQjtBQUFBLE1BQ3BDLE9BQU87QUFBQSxNQUNQO0FBQUEsTUFDQSxDQUFDLFFBQVEsWUFBWSxLQUFLLFlBQVksc0JBQXNCLFFBQVEsT0FBTztBQUFBLElBQzVFLENBQUM7QUFFRCxRQUFJLHlCQUF5QjtBQUM1QixZQUFNLEVBQUUsUUFBUSxLQUFLLElBQUk7QUFDekIsbUJBQWEsZUFBZSxRQUFRO0FBQUEsUUFDbkMsR0FBRztBQUFBLFFBQ0gsU0FBUztBQUFBLFVBQ1IsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLGlDQUFpQyxRQUFRO0FBQUEsUUFDMUQ7QUFBQSxRQUNBLE1BQU0sZUFBZSxJQUFJLDBCQUEwQiwwQ0FBMEMsT0FBTyxHQUFHLEtBQUssSUFBSTtBQUFBLE1BQ2pILENBQUM7QUFDRCxXQUFLLFVBQVUsc0JBQXNCO0FBQUEsUUFDcEM7QUFBQSxRQUNBO0FBQUEsUUFDQSxDQUFDLFFBQVEsWUFBWSxLQUFLLFlBQVksc0JBQXNCLFFBQVEsT0FBTztBQUFBLE1BQzVFLENBQUM7QUFBQSxJQUNGO0FBRUEsU0FBSyxLQUFLLGNBQWMsSUFBSTtBQUFBLEVBQzdCO0FBQUEsRUFFUSxZQUFZLHNCQUE2QyxRQUFpQixTQUEwRDtBQUMzSSxTQUFLLFFBQVEscUJBQXFCLGVBQWUscUJBQXFCLFFBQVEsU0FBUyxLQUFLLFNBQVMsTUFBTTtBQUMxRyxXQUFLLGlCQUFpQjtBQUN0QixVQUFJLENBQUMsa0JBQWtCLFNBQVMsS0FBSyxNQUFNLElBQUksS0FBSyxDQUFDLGdCQUFnQixTQUFTLEtBQUssTUFBTSxJQUFJLEdBQUc7QUFDL0YsYUFBSyxRQUFRLElBQUksS0FBSztBQUFBLE1BQ3ZCO0FBQUEsSUFDRCxDQUFDO0FBQ0QsUUFBSSxLQUFLLGdCQUFnQjtBQUN4QixXQUFLLE1BQU0sWUFBWTtBQUFBLElBQ3hCO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsTUFBYyxjQUFjLFVBQVUsT0FBTztBQUM1QyxRQUFJLEtBQUsscUJBQXFCLFNBQWtCLHdCQUF3QixNQUFNLE9BQU87QUFDcEYsV0FBSyxRQUFRLElBQUksS0FBSztBQUN0QjtBQUFBLElBQ0Q7QUFHQSxRQUFJLEtBQUssa0JBQWtCLENBQUMsTUFBTSxLQUFLLFlBQVksYUFBYSxHQUFHO0FBQ2xFLFdBQUssUUFBUSxJQUFJLGtCQUFrQixTQUFTLEtBQUssTUFBTSxJQUFJLENBQUM7QUFDNUQsV0FBSyxRQUFRLFlBQVksS0FBSyxLQUFLO0FBQ25DO0FBQUEsSUFDRDtBQUVBLFNBQUssUUFBUSxZQUFZLEtBQUssS0FBSztBQUluQyxRQUFJLFVBQVUsa0JBQWtCLFNBQVMsS0FBSyxNQUFNLElBQUk7QUFDeEQsUUFBSSxjQUFjO0FBQ2xCLFlBQVEsS0FBSyxNQUFNLE1BQU07QUFBQSxNQUN4QixLQUFLLFVBQVU7QUFDZCxZQUFJLFNBQVM7QUFDWixnQkFBTSxTQUFTLEtBQUssTUFBTTtBQUMxQixjQUFJLFdBQVcsa0JBQWtCLHdCQUF3QixXQUFXLGtCQUFrQixnQkFBZ0I7QUFDckcsa0JBQU0sWUFBWSxLQUFLLGVBQWUsVUFBVSxrQ0FBa0MsYUFBYSxXQUFXO0FBQzFHLDBCQUFjLGNBQWMsVUFBYyxLQUFLLElBQUksSUFBSSxhQUFjO0FBQUEsVUFDdEU7QUFBQSxRQUNEO0FBQ0E7QUFBQSxNQUNELEtBQUssVUFBVTtBQUNkLHNCQUFjLENBQUMsQ0FBQyxLQUFLLE1BQU07QUFDM0I7QUFBQSxNQUNELEtBQUssVUFBVTtBQUFBLE1BQ2YsS0FBSyxVQUFVO0FBQUEsTUFDZixLQUFLLFVBQVU7QUFDZCxrQkFBVSxLQUFLLE1BQU07QUFDckI7QUFBQSxNQUNELEtBQUssVUFBVTtBQUNkLGtCQUFVO0FBQ1Y7QUFBQSxNQUNELEtBQUssVUFBVTtBQUNkLGtCQUFVO0FBQ1Y7QUFBQSxJQUNGO0FBRUEsUUFBSSxhQUFhO0FBQ2hCLFdBQUssaUJBQWlCO0FBQ3RCLGdCQUFVO0FBQUEsSUFDWDtBQUVBLFNBQUssUUFBUSxJQUFJLE9BQU87QUFFeEIsUUFBSSxhQUFhO0FBQ2hCLFdBQUssT0FBTyxZQUFZO0FBQ3hCLFVBQUksS0FBSyxNQUFNLFNBQVMsVUFBVSxVQUFVO0FBQzNDLGFBQUssZUFBZSxNQUFNLGtDQUFrQyxLQUFLLElBQUksR0FBRyxhQUFhLGFBQWEsY0FBYyxPQUFPO0FBQUEsTUFDeEg7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVEO0FBOUlhLDZCQUFOO0FBQUEsRUFRSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWZVO0FBbUpOLElBQU0sc0JBQU4sY0FBa0MsbUJBQW1CO0FBQUEsRUFJM0QsWUFDQyxRQUNBLFNBQ2lCLFNBQ0Esd0JBQ2lCLGdCQUNGLGNBQ0ksa0JBQ0gsZUFDaEM7QUFDRCxVQUFNLFFBQVcsUUFBUSxPQUFPO0FBUGY7QUFDQTtBQUNpQjtBQUNGO0FBQ0k7QUFDSDtBQVZsQyxTQUFRLHNCQUFzQjtBQWM3QixTQUFLLE9BQU8sTUFBTSxNQUFNLEtBQUssVUFBVTtBQUN2QyxTQUFLLFVBQVUsS0FBSyxjQUFjLGNBQWMsV0FBUyxLQUFLLGNBQWMsS0FBSyxDQUFDLENBQUM7QUFBQSxFQUNwRjtBQUFBLEVBRWdCLE9BQU8sV0FBd0I7QUFDOUMsVUFBTSxPQUFPLFNBQVM7QUFFdEIsU0FBSyxVQUFVLElBQUksT0FBTyxXQUFXLElBQUksRUFBRSxtQkFBbUIsQ0FBQztBQUMvRCxTQUFLLGNBQWM7QUFDbkIsU0FBSyxjQUFjLEtBQUssY0FBYyxLQUFLO0FBRTNDLFFBQUksS0FBSyxxQkFBcUI7QUFDN0IsV0FBSyxzQkFBc0I7QUFDM0IsVUFBSSw2QkFBNkIsSUFBSSxVQUFVLFNBQVMsR0FBRyxNQUFNLEtBQUssWUFBWSxDQUFDO0FBQUEsSUFDcEY7QUFBQSxFQUNEO0FBQUEsRUFFTyxZQUFZLFFBQVEsT0FBTztBQUNqQyxRQUFJLENBQUMsS0FBSyxTQUFTLGFBQWE7QUFDL0IsV0FBSyxzQkFBc0I7QUFDM0I7QUFBQSxJQUNEO0FBRUEsU0FBSyxhQUFhLGlCQUFpQjtBQUFBLE1BQ2xDLFNBQVMsS0FBSyxRQUFRO0FBQUEsTUFDdEIsUUFBUTtBQUFBLFFBQ1AsZ0JBQWdCLENBQUMsS0FBSyxPQUFPO0FBQUEsUUFDN0IsU0FBUyxNQUFNO0FBQ2QsY0FBSSxDQUFDLENBQUMsS0FBSyxTQUFTLGFBQWE7QUFDaEMsaUJBQUssdUJBQXVCO0FBQUEsVUFDN0I7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsYUFBYSxFQUFFLFFBQVEsS0FBSztBQUFBLE1BQzVCLFlBQVksRUFBRSxhQUFhLE1BQU0sU0FBUyxLQUFLO0FBQUEsSUFDaEQsR0FBRyxLQUFLO0FBQUEsRUFDVDtBQUFBLEVBRW1CLG1CQUF5QztBQUMzRCxXQUFPLEtBQUssUUFBUTtBQUFBLEVBQ3JCO0FBQUEsRUFFQSxNQUFjLFlBQVk7QUFDekIsUUFBSTtBQUNKLFlBQVEsS0FBSyxjQUFjLE1BQU0sTUFBTTtBQUFBLE1BQ3RDLEtBQUssVUFBVTtBQUNkLG9CQUFZO0FBQ1o7QUFBQSxNQUNELEtBQUssVUFBVTtBQUNkLG9CQUFZO0FBQ1o7QUFBQSxNQUNELEtBQUssVUFBVTtBQUNkLG9CQUFZO0FBQ1o7QUFBQSxNQUNEO0FBQ0MsYUFBSyxZQUFZLElBQUk7QUFDckI7QUFBQSxJQUNGO0FBRUEsU0FBSyxpQkFBaUIsV0FBZ0YsMkJBQTJCLEVBQUUsSUFBSSxXQUFXLE1BQU0sV0FBVyxDQUFDO0FBQ3BLLFVBQU0sS0FBSyxlQUFlLGVBQWUsU0FBUztBQUFBLEVBQ25EO0FBQUEsRUFFUSxjQUFjLE9BQWM7QUFDbkMsUUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLFVBQVUsS0FBSyxPQUFPO0FBQzFCLFNBQUssUUFBUSxVQUFVLE9BQU8sYUFBYSx1QkFBdUIsb0JBQW9CLGlCQUFpQjtBQUN2RyxTQUFLLFFBQVEsTUFBTSxlQUFlLG1CQUFtQjtBQUVyRCxVQUFNLFFBQVEsSUFBSSxPQUFPLEtBQUssU0FBUyxJQUFJLEVBQUUsa0JBQWtCLENBQUM7QUFDaEUsWUFBUSxNQUFNLE1BQU07QUFBQSxNQUNuQixLQUFLLFVBQVU7QUFDZCxjQUFNLGNBQWMsU0FBUywwQkFBMEIsUUFBUTtBQUMvRCxhQUFLLFFBQVEsVUFBVSxJQUFJLGlCQUFpQjtBQUM1QztBQUFBLE1BRUQsS0FBSyxVQUFVO0FBQ2QsY0FBTSxjQUFjLFNBQVMsNEJBQTRCLGFBQWE7QUFDdEUsYUFBSyxvQkFBb0IsS0FBSyxPQUFPO0FBQ3JDO0FBQUEsTUFFRCxLQUFLLFVBQVU7QUFDZCxjQUFNLGNBQWMsU0FBUywrQkFBK0IsYUFBYTtBQUN6RSxhQUFLLG9CQUFvQixLQUFLLE9BQU87QUFDckM7QUFBQSxNQUVELEtBQUssVUFBVTtBQUFBLE1BQ2YsS0FBSyxVQUFVO0FBQUEsTUFDZixLQUFLLFVBQVU7QUFDZCxjQUFNLGNBQWMsU0FBUywwQkFBMEIsUUFBUTtBQUMvRCxhQUFLLFFBQVEsVUFBVSxJQUFJLFdBQVc7QUFDdEM7QUFBQSxNQUVELEtBQUssVUFBVTtBQUNkLGNBQU0sY0FBYyxTQUFTLCtCQUErQixnQkFBZ0I7QUFDNUUsYUFBSyxvQkFBb0IsS0FBSyxTQUFTLHVCQUF1QixNQUFNLGlCQUFpQixNQUFNLFVBQVUsQ0FBQztBQUN0RztBQUFBLE1BRUQsS0FBSyxVQUFVO0FBQ2QsY0FBTSxjQUFjLFNBQVMsOEJBQThCLGVBQWU7QUFDMUUsYUFBSyxvQkFBb0IsS0FBSyxTQUFTLHVCQUF1QixNQUFNLGlCQUFpQixNQUFNLFdBQVcsQ0FBQztBQUN2RztBQUFBLE1BRUQsS0FBSyxVQUFVO0FBQ2QsY0FBTSxjQUFjLFNBQVMsOEJBQThCLGVBQWU7QUFDMUUsYUFBSyxvQkFBb0IsS0FBSyxPQUFPO0FBQ3JDO0FBQUEsTUFFRCxLQUFLLFVBQVU7QUFDZCxjQUFNLGNBQWMsU0FBUyw4QkFBOEIsZUFBZTtBQUMxRSxhQUFLLG9CQUFvQixLQUFLLE9BQU87QUFDckM7QUFBQSxNQUVEO0FBQ0MsY0FBTSxjQUFjLFNBQVMsMEJBQTBCLFFBQVE7QUFDL0Q7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRVEsb0JBQW9CLFNBQXNCLFlBQXFCO0FBQ3RFLFFBQUksZUFBZSxRQUFXO0FBQzdCLGNBQVEsVUFBVSxJQUFJLGtCQUFrQjtBQUN4QyxjQUFRLE1BQU0sWUFBWSxxQkFBcUIsR0FBRyxVQUFVLEdBQUc7QUFBQSxJQUNoRSxPQUFPO0FBQ04sY0FBUSxVQUFVLElBQUkscUJBQXFCO0FBQUEsSUFDNUM7QUFBQSxFQUNEO0FBQ0Q7QUFsSmEsc0JBQU47QUFBQSxFQVNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FaVTsiLAogICJuYW1lcyI6IFtdCn0K
