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
import "./media/tunnelHost.css";
import * as dom from "../../../../base/browser/dom.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { disposableTimeout } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { localize } from "../../../../nls.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { ITunnelHostService } from "../common/tunnelHost.js";
import { SHOW_TUNNEL_HOST_OUTPUT_ID } from "./tunnelHostService.js";
let ToggleRemoteConnectionsActionViewItem = class extends BaseActionViewItem {
  constructor(action, _tunnelHostService, _hoverService) {
    super(void 0, action);
    this._tunnelHostService = _tunnelHostService;
    this._hoverService = _hoverService;
    this._wasSharing = false;
    this._wasSharing = this._tunnelHostService.isSharing;
    this._register(this._tunnelHostService.onDidChangeStatus(() => {
      this._updateState();
    }));
  }
  render(container) {
    super.render(container);
    if (!this.element) {
      return;
    }
    this.element.classList.add("tunnel-host-toggle");
    this.element.tabIndex = 0;
    this.element.role = "button";
    this._iconElement = dom.append(this.element, dom.$("span.tunnel-host-icon"));
    this._iconElement.append(...renderLabelWithIcons(`$(${Codicon.radioTower.id})`));
    this._toastElement = dom.append(this.element, dom.$("span.tunnel-host-toast"));
    const hoverDelegate = getDefaultHoverDelegate("element");
    this._hover = this._register(this._hoverService.setupManagedHover(
      hoverDelegate,
      this.element,
      this._getHoverContent()
    ));
    this._updateState();
  }
  _updateState() {
    if (!this.element) {
      return;
    }
    const isSharing = this._tunnelHostService.isSharing;
    const isConnecting = this._tunnelHostService.isConnecting;
    this.element.classList.toggle("sharing", isSharing);
    this.element.classList.toggle("connecting", isConnecting);
    this._hover?.update(this._getHoverContent());
    this.element.setAttribute("aria-label", this._getAriaLabel());
    this.element.setAttribute("aria-pressed", String(isSharing));
    if (isSharing && !this._wasSharing && !isConnecting) {
      this._showToast();
    } else if (!isSharing && this._wasSharing) {
      this._hideToast();
    }
    this._wasSharing = isSharing;
  }
  _showToast() {
    if (!this._toastElement) {
      return;
    }
    this._toastElement.textContent = localize("tunnelHost.toast", "Remote session access is now enabled");
    this._toastElement.classList.add("visible");
    disposableTimeout(() => {
      this._hideToast();
    }, 3e3, this._store);
  }
  _hideToast() {
    this._toastElement?.classList.remove("visible");
  }
  _getHoverContent() {
    const lines = [];
    if (this._tunnelHostService.isConnecting) {
      lines.push(localize("tunnelHost.hover.connecting", "Establishing tunnel connection..."));
    } else if (this._tunnelHostService.isSharing) {
      const info = this._tunnelHostService.sharingInfo;
      if (info) {
        lines.push(localize("tunnelHost.hover.sharing", "Remote session access enabled via tunnel '{0}'", info.tunnelName));
      } else {
        lines.push(localize("tunnelHost.hover.enabled", "Remote session access is enabled"));
      }
    } else {
      lines.push(localize("tunnelHost.hover.idle", "Allow remote session access"));
    }
    lines.push(`[${localize("tunnelHost.hover.showOutput", "Show Output")}](command:${SHOW_TUNNEL_HOST_OUTPUT_ID})`);
    const md = new MarkdownString(lines.join("\n\n"), { isTrusted: { enabledCommands: [SHOW_TUNNEL_HOST_OUTPUT_ID] } });
    return { markdown: md, markdownNotSupportedFallback: lines[0] };
  }
  _getAriaLabel() {
    if (this._tunnelHostService.isConnecting) {
      return localize("tunnelHost.hover.connecting", "Establishing tunnel connection...");
    }
    if (this._tunnelHostService.isSharing) {
      const info = this._tunnelHostService.sharingInfo;
      if (info) {
        return localize("tunnelHost.hover.sharing", "Remote session access enabled via tunnel '{0}'", info.tunnelName);
      }
      return localize("tunnelHost.hover.enabled", "Remote session access is enabled");
    }
    return localize("tunnelHost.hover.idle", "Allow remote session access");
  }
};
ToggleRemoteConnectionsActionViewItem = __decorateClass([
  __decorateParam(1, ITunnelHostService),
  __decorateParam(2, IHoverService)
], ToggleRemoteConnectionsActionViewItem);
export {
  ToggleRemoteConnectionsActionViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvZWxlY3Ryb24tYnJvd3Nlci90b2dnbGVSZW1vdGVDb25uZWN0aW9uc0FjdGlvblZpZXdJdGVtLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3R1bm5lbEhvc3QuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElNYW5hZ2VkSG92ZXIsIElNYW5hZ2VkSG92ZXJDb250ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSVR1bm5lbEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3R1bm5lbEhvc3QuanMnO1xuaW1wb3J0IHsgU0hPV19UVU5ORUxfSE9TVF9PVVRQVVRfSUQgfSBmcm9tICcuL3R1bm5lbEhvc3RTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIFRvZ2dsZVJlbW90ZUNvbm5lY3Rpb25zQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgX2ljb25FbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdG9hc3RFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaG92ZXI6IElNYW5hZ2VkSG92ZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3dhc1NoYXJpbmcgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0QElUdW5uZWxIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90dW5uZWxIb3N0U2VydmljZTogSVR1bm5lbEhvc3RTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24pO1xuXG5cdFx0dGhpcy5fd2FzU2hhcmluZyA9IHRoaXMuX3R1bm5lbEhvc3RTZXJ2aWNlLmlzU2hhcmluZztcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3R1bm5lbEhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdHVzKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVN0YXRlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblxuXHRcdGlmICghdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3R1bm5lbC1ob3N0LXRvZ2dsZScpO1xuXHRcdHRoaXMuZWxlbWVudC50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5lbGVtZW50LnJvbGUgPSAnYnV0dG9uJztcblxuXHRcdHRoaXMuX2ljb25FbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsIGRvbS4kKCdzcGFuLnR1bm5lbC1ob3N0LWljb24nKSk7XG5cdFx0dGhpcy5faWNvbkVsZW1lbnQuYXBwZW5kKC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGAkKCR7Q29kaWNvbi5yYWRpb1Rvd2VyLmlkfSlgKSk7XG5cblx0XHR0aGlzLl90b2FzdEVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgZG9tLiQoJ3NwYW4udHVubmVsLWhvc3QtdG9hc3QnKSk7XG5cblx0XHRjb25zdCBob3ZlckRlbGVnYXRlID0gZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKTtcblx0XHR0aGlzLl9ob3ZlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihcblx0XHRcdGhvdmVyRGVsZWdhdGUsIHRoaXMuZWxlbWVudCwgdGhpcy5fZ2V0SG92ZXJDb250ZW50KClcblx0XHQpKTtcblxuXHRcdHRoaXMuX3VwZGF0ZVN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzU2hhcmluZyA9IHRoaXMuX3R1bm5lbEhvc3RTZXJ2aWNlLmlzU2hhcmluZztcblx0XHRjb25zdCBpc0Nvbm5lY3RpbmcgPSB0aGlzLl90dW5uZWxIb3N0U2VydmljZS5pc0Nvbm5lY3Rpbmc7XG5cblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnc2hhcmluZycsIGlzU2hhcmluZyk7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2Nvbm5lY3RpbmcnLCBpc0Nvbm5lY3RpbmcpO1xuXHRcdHRoaXMuX2hvdmVyPy51cGRhdGUodGhpcy5fZ2V0SG92ZXJDb250ZW50KCkpO1xuXHRcdHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLl9nZXRBcmlhTGFiZWwoKSk7XG5cdFx0dGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1wcmVzc2VkJywgU3RyaW5nKGlzU2hhcmluZykpO1xuXG5cdFx0aWYgKGlzU2hhcmluZyAmJiAhdGhpcy5fd2FzU2hhcmluZyAmJiAhaXNDb25uZWN0aW5nKSB7XG5cdFx0XHR0aGlzLl9zaG93VG9hc3QoKTtcblx0XHR9IGVsc2UgaWYgKCFpc1NoYXJpbmcgJiYgdGhpcy5fd2FzU2hhcmluZykge1xuXHRcdFx0dGhpcy5faGlkZVRvYXN0KCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fd2FzU2hhcmluZyA9IGlzU2hhcmluZztcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dUb2FzdCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3RvYXN0RWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3RvYXN0RWxlbWVudC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd0dW5uZWxIb3N0LnRvYXN0JywgXCJSZW1vdGUgc2Vzc2lvbiBhY2Nlc3MgaXMgbm93IGVuYWJsZWRcIik7XG5cdFx0dGhpcy5fdG9hc3RFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblxuXHRcdGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2hpZGVUb2FzdCgpO1xuXHRcdH0sIDMwMDAsIHRoaXMuX3N0b3JlKTtcblx0fVxuXG5cdHByaXZhdGUgX2hpZGVUb2FzdCgpOiB2b2lkIHtcblx0XHR0aGlzLl90b2FzdEVsZW1lbnQ/LmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUnKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEhvdmVyQ29udGVudCgpOiBJTWFuYWdlZEhvdmVyQ29udGVudCB7XG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRpZiAodGhpcy5fdHVubmVsSG9zdFNlcnZpY2UuaXNDb25uZWN0aW5nKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCd0dW5uZWxIb3N0LmhvdmVyLmNvbm5lY3RpbmcnLCBcIkVzdGFibGlzaGluZyB0dW5uZWwgY29ubmVjdGlvbi4uLlwiKSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl90dW5uZWxIb3N0U2VydmljZS5pc1NoYXJpbmcpIHtcblx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl90dW5uZWxIb3N0U2VydmljZS5zaGFyaW5nSW5mbztcblx0XHRcdGlmIChpbmZvKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ3R1bm5lbEhvc3QuaG92ZXIuc2hhcmluZycsIFwiUmVtb3RlIHNlc3Npb24gYWNjZXNzIGVuYWJsZWQgdmlhIHR1bm5lbCAnezB9J1wiLCBpbmZvLnR1bm5lbE5hbWUpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ3R1bm5lbEhvc3QuaG92ZXIuZW5hYmxlZCcsIFwiUmVtb3RlIHNlc3Npb24gYWNjZXNzIGlzIGVuYWJsZWRcIikpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCd0dW5uZWxIb3N0LmhvdmVyLmlkbGUnLCBcIkFsbG93IHJlbW90ZSBzZXNzaW9uIGFjY2Vzc1wiKSk7XG5cdFx0fVxuXG5cdFx0bGluZXMucHVzaChgWyR7bG9jYWxpemUoJ3R1bm5lbEhvc3QuaG92ZXIuc2hvd091dHB1dCcsIFwiU2hvdyBPdXRwdXRcIil9XShjb21tYW5kOiR7U0hPV19UVU5ORUxfSE9TVF9PVVRQVVRfSUR9KWApO1xuXG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcobGluZXMuam9pbignXFxuXFxuJyksIHsgaXNUcnVzdGVkOiB7IGVuYWJsZWRDb21tYW5kczogW1NIT1dfVFVOTkVMX0hPU1RfT1VUUFVUX0lEXSB9IH0pO1xuXHRcdHJldHVybiB7IG1hcmtkb3duOiBtZCwgbWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjazogbGluZXNbMF0gfTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLl90dW5uZWxIb3N0U2VydmljZS5pc0Nvbm5lY3RpbmcpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgndHVubmVsSG9zdC5ob3Zlci5jb25uZWN0aW5nJywgXCJFc3RhYmxpc2hpbmcgdHVubmVsIGNvbm5lY3Rpb24uLi5cIik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl90dW5uZWxIb3N0U2VydmljZS5pc1NoYXJpbmcpIHtcblx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl90dW5uZWxIb3N0U2VydmljZS5zaGFyaW5nSW5mbztcblx0XHRcdGlmIChpbmZvKSB7XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndHVubmVsSG9zdC5ob3Zlci5zaGFyaW5nJywgXCJSZW1vdGUgc2Vzc2lvbiBhY2Nlc3MgZW5hYmxlZCB2aWEgdHVubmVsICd7MH0nXCIsIGluZm8udHVubmVsTmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3R1bm5lbEhvc3QuaG92ZXIuZW5hYmxlZCcsIFwiUmVtb3RlIHNlc3Npb24gYWNjZXNzIGlzIGVuYWJsZWRcIik7XG5cdFx0fVxuXHRcdHJldHVybiBsb2NhbGl6ZSgndHVubmVsSG9zdC5ob3Zlci5pZGxlJywgXCJBbGxvdyByZW1vdGUgc2Vzc2lvbiBhY2Nlc3NcIik7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUVyQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxrQ0FBa0M7QUFFcEMsSUFBTSx3Q0FBTixjQUFvRCxtQkFBbUI7QUFBQSxFQU83RSxZQUNDLFFBQ3FDLG9CQUNMLGVBQy9CO0FBQ0QsVUFBTSxRQUFXLE1BQU07QUFIYztBQUNMO0FBTGpDLFNBQVEsY0FBYztBQVNyQixTQUFLLGNBQWMsS0FBSyxtQkFBbUI7QUFFM0MsU0FBSyxVQUFVLEtBQUssbUJBQW1CLGtCQUFrQixNQUFNO0FBQzlELFdBQUssYUFBYTtBQUFBLElB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
