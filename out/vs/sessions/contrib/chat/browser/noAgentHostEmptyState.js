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
import "./media/noAgentHostEmptyState.css";
import * as dom from "../../../../base/browser/dom.js";
import { renderFormattedText } from "../../../../base/browser/formattedTextRenderer.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isMobile } from "../../../../base/common/platform.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
const $ = dom.$;
const LEARN_MORE_URL = "https://aka.ms/VSCode/Agents/docs";
let NoAgentHostEmptyState = class extends Disposable {
  constructor(_openerService, _productService) {
    super();
    this._openerService = _openerService;
    this._productService = _productService;
  }
  render(parent) {
    this._root = dom.append(parent, $(".no-agent-host-empty-state"));
    this._root.setAttribute("role", "group");
    this._root.setAttribute("aria-label", localize("noAgentHost.aria", "No agent hosts available"));
    this._root.tabIndex = -1;
    if (!isMobile) {
      const iconWrap = dom.append(this._root, $(".no-agent-host-icon"));
      iconWrap.append(...renderLabelWithIcons(`$(${Codicon.remote.id})`));
    }
    const heading = dom.append(this._root, $("h2.no-agent-host-title"));
    heading.textContent = localize("noAgentHost.title", "Connect a host to get started");
    const cliBinary = this._productService.quality === "stable" ? "code" : "code-insiders";
    const command = `${cliBinary} tunnel`;
    const description = dom.append(this._root, $("p.no-agent-host-description"));
    renderFormattedText(
      localize(
        "noAgentHost.description",
        "Run ``{0}`` from any device, then return here to run agent tasks on it.",
        command
      ),
      { renderCodeSegments: true },
      description
    );
    description.appendChild(document.createTextNode(" "));
    const learnMore = dom.append(description, $("a.no-agent-host-link"));
    learnMore.textContent = localize("noAgentHost.learnMore", "Learn more");
    learnMore.href = LEARN_MORE_URL;
    this._register(dom.addDisposableListener(learnMore, dom.EventType.CLICK, (e) => {
      e.preventDefault();
      this._openerService.open(URI.parse(LEARN_MORE_URL));
    }));
  }
  focus() {
    this._root?.focus();
  }
  dispose() {
    this._root?.remove();
    this._root = void 0;
    super.dispose();
  }
};
NoAgentHostEmptyState = __decorateClass([
  __decorateParam(0, IOpenerService),
  __decorateParam(1, IProductService)
], NoAgentHostEmptyState);
export {
  NoAgentHostEmptyState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL25vQWdlbnRIb3N0RW1wdHlTdGF0ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9ub0FnZW50SG9zdEVtcHR5U3RhdGUuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckZvcm1hdHRlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZm9ybWF0dGVkVGV4dFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTW9iaWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmNvbnN0IExFQVJOX01PUkVfVVJMID0gJ2h0dHBzOi8vYWthLm1zL1ZTQ29kZS9BZ2VudHMvZG9jcyc7XG5cbi8qKlxuICogRW1wdHkgc3RhdGUgc2hvd24gaW4gdGhlIG5ldy1zZXNzaW9uIHZpZXcgd2hlbiB0aGUgYWdlbnRzIHdpbmRvdyBpc1xuICogb3BlbiBvbiB3ZWIgKHZzY29kZS5kZXYgLyBpbnNpZGVycy52c2NvZGUuZGV2KSBhbmQgbm8gYWdlbnQgaG9zdHMgaGF2ZVxuICogYmVlbiBkaXNjb3ZlcmVkLiBSZXBsYWNlcyB0aGUgd29ya3NwYWNlIHBpY2tlciBcdTIwMTQgd2hpY2ggY2FuJ3Qgc3VyZmFjZVxuICogYW55IHVzZWZ1bCBpdGVtcyB3aXRob3V0IGEgaG9zdCBcdTIwMTQgd2l0aCBhIGhlYWRpbmcsIGEgZGVzY3JpcHRpb24gdGhhdFxuICogdGVsbHMgdGhlIHVzZXIgaG93IHRvIGJyaW5nIGEgaG9zdCBvbmxpbmUgd2l0aCB0aGUgVlMgQ29kZSBDTEksIGFuZFxuICogYSBcIkxlYXJuIG1vcmVcIiBsaW5rIHRvIHRoZSBkb2NzLlxuICovXG5leHBvcnQgY2xhc3MgTm9BZ2VudEhvc3RFbXB0eVN0YXRlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfcm9vdDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlbmRlcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fcm9vdCA9IGRvbS5hcHBlbmQocGFyZW50LCAkKCcubm8tYWdlbnQtaG9zdC1lbXB0eS1zdGF0ZScpKTtcblx0XHR0aGlzLl9yb290LnNldEF0dHJpYnV0ZSgncm9sZScsICdncm91cCcpO1xuXHRcdHRoaXMuX3Jvb3Quc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ25vQWdlbnRIb3N0LmFyaWEnLCBcIk5vIGFnZW50IGhvc3RzIGF2YWlsYWJsZVwiKSk7XG5cdFx0Ly8gTWFrZSB0aGUgcm9vdCBwcm9ncmFtbWF0aWNhbGx5IGZvY3VzYWJsZSBzbyBzY3JlZW4gcmVhZGVycyBsYW5kXG5cdFx0Ly8gb24gdGhlIGhlYWRpbmcgd2hlbiB0aGUgY2hhdCBpbnB1dCBcdTIwMTQgd2hpY2ggd291bGQgbm9ybWFsbHkgdGFrZVxuXHRcdC8vIGZvY3VzIG9uIHZpZXcgbW91bnQgXHUyMDE0IGlzIGhpZGRlbiBieSB0aGUgYC5uby1hZ2VudC1ob3N0YCBjbGFzcy5cblx0XHR0aGlzLl9yb290LnRhYkluZGV4ID0gLTE7XG5cblx0XHQvLyAtLS0gSGVybyBpY29uIChza2lwcGVkIG9uIHBob25lLWxheW91dCB2aWV3cG9ydHMgZm9yIHZlcnRpY2FsIHJvb20pXG5cdFx0aWYgKCFpc01vYmlsZSkge1xuXHRcdFx0Y29uc3QgaWNvbldyYXAgPSBkb20uYXBwZW5kKHRoaXMuX3Jvb3QsICQoJy5uby1hZ2VudC1ob3N0LWljb24nKSk7XG5cdFx0XHRpY29uV3JhcC5hcHBlbmQoLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoYCQoJHtDb2RpY29uLnJlbW90ZS5pZH0pYCkpO1xuXHRcdH1cblxuXHRcdC8vIC0tLSBIZWFkaW5nICsgZGVzY3JpcHRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdFx0Y29uc3QgaGVhZGluZyA9IGRvbS5hcHBlbmQodGhpcy5fcm9vdCwgJCgnaDIubm8tYWdlbnQtaG9zdC10aXRsZScpKTtcblx0XHRoZWFkaW5nLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vQWdlbnRIb3N0LnRpdGxlJywgXCJDb25uZWN0IGEgaG9zdCB0byBnZXQgc3RhcnRlZFwiKTtcblxuXHRcdC8vIFBpY2sgdGhlIG1hdGNoaW5nIENMSSBiaW5hcnkgZm9yIHRoZSBjaGFubmVsIHRoZSB1c2VyIGlzIG9uIHNvIHRoZVxuXHRcdC8vIGNvbW1hbmQgdGhleSBjb3B5IGFjdHVhbGx5IGV4aXN0cyBvbiB0aGVpciBtYWNoaW5lOiBgY29kZWAgZm9yXG5cdFx0Ly8gc3RhYmxlLCBgY29kZS1pbnNpZGVyc2AgZm9yIGFueSBub24tc3RhYmxlIGNoYW5uZWwgKGluc2lkZXIgL1xuXHRcdC8vIGV4cGxvcmF0aW9uIC8gZGV2KS4gVGhlIGFnZW50cyB3aW5kb3cgZG9lcyBub3Qgc2hpcCBpdHMgb3duIENMSSBcdTIwMTRcblx0XHQvLyBpdCByZWxpZXMgb24gdGhlIHJlZ3VsYXIgVlMgQ29kZSBDTEkgdG8gZXhwb3NlIHRoZSBhZ2VudCBob3N0LlxuXHRcdGNvbnN0IGNsaUJpbmFyeSA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgPT09ICdzdGFibGUnID8gJ2NvZGUnIDogJ2NvZGUtaW5zaWRlcnMnO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBgJHtjbGlCaW5hcnl9IHR1bm5lbGA7XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGRvbS5hcHBlbmQodGhpcy5fcm9vdCwgJCgncC5uby1hZ2VudC1ob3N0LWRlc2NyaXB0aW9uJykpO1xuXHRcdHJlbmRlckZvcm1hdHRlZFRleHQoXG5cdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0J25vQWdlbnRIb3N0LmRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XCJSdW4gYGB7MH1gYCBmcm9tIGFueSBkZXZpY2UsIHRoZW4gcmV0dXJuIGhlcmUgdG8gcnVuIGFnZW50IHRhc2tzIG9uIGl0LlwiLFxuXHRcdFx0XHRjb21tYW5kXG5cdFx0XHQpLFxuXHRcdFx0eyByZW5kZXJDb2RlU2VnbWVudHM6IHRydWUgfSxcblx0XHRcdGRlc2NyaXB0aW9uXG5cdFx0KTtcblx0XHRkZXNjcmlwdGlvbi5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnICcpKTtcblx0XHRjb25zdCBsZWFybk1vcmUgPSBkb20uYXBwZW5kKGRlc2NyaXB0aW9uLCAkKCdhLm5vLWFnZW50LWhvc3QtbGluaycpKSBhcyBIVE1MQW5jaG9yRWxlbWVudDtcblx0XHRsZWFybk1vcmUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9BZ2VudEhvc3QubGVhcm5Nb3JlJywgXCJMZWFybiBtb3JlXCIpO1xuXHRcdGxlYXJuTW9yZS5ocmVmID0gTEVBUk5fTU9SRV9VUkw7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihsZWFybk1vcmUsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZShMRUFSTl9NT1JFX1VSTCkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3Q/LmZvY3VzKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3Q/LnJlbW92ZSgpO1xuXHRcdHRoaXMuX3Jvb3QgPSB1bmRlZmluZWQ7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUVoQyxNQUFNLElBQUksSUFBSTtBQUVkLE1BQU0saUJBQWlCO0FBVWhCLElBQU0sd0JBQU4sY0FBb0MsV0FBVztBQUFBLEVBSXJELFlBQ2tDLGdCQUNDLGlCQUNqQztBQUNELFVBQU07QUFIMkI7QUFDQztBQUFBLEVBR25DO0FBQUEsRUFFQSxPQUFPLFFBQTJCO0FBQ2pDLFNBQUssUUFBUSxJQUFJLE9BQU8sUUFBUSxFQUFFLDRCQUE0QixDQUFDO0FBQy9ELFNBQUssTUFBTSxhQUFhLFFBQVEsT0FBTztBQUN2QyxTQUFLLE1BQU0sYUFBYSxjQUFjLFNBQVMsb0JBQW9CLDBCQUEwQixDQUFDO0FBSTlGLFNBQUssTUFBTSxXQUFXO0FBR3RCLFFBQUksQ0FBQyxVQUFVO0FBQ2QsWUFBTSxXQUFXLElBQUksT0FBTyxLQUFLLE9BQU8sRUFBRSxxQkFBcUIsQ0FBQztBQUNoRSxlQUFTLE9BQU8sR0FBRyxxQkFBcUIsS0FBSyxRQUFRLE9BQU8sRUFBRSxHQUFHLENBQUM7QUFBQSxJQUNuRTtBQUdBLFVBQU0sVUFBVSxJQUFJLE9BQU8sS0FBSyxPQUFPLEVBQUUsd0JBQXdCLENBQUM7QUFDbEUsWUFBUSxjQUFjLFNBQVMscUJBQXFCLCtCQUErQjtBQU9uRixVQUFNLFlBQVksS0FBSyxnQkFBZ0IsWUFBWSxXQUFXLFNBQVM7QUFDdkUsVUFBTSxVQUFVLEdBQUcsU0FBUztBQUU1QixVQUFNLGNBQWMsSUFBSSxPQUFPLEtBQUssT0FBTyxFQUFFLDZCQUE2QixDQUFDO0FBQzNFO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEVBQUUsb0JBQW9CLEtBQUs7QUFBQSxNQUMzQjtBQUFBLElBQ0Q7QUFDQSxnQkFBWSxZQUFZLFNBQVMsZUFBZSxHQUFHLENBQUM7QUFDcEQsVUFBTSxZQUFZLElBQUksT0FBTyxhQUFhLEVBQUUsc0JBQXNCLENBQUM7QUFDbkUsY0FBVSxjQUFjLFNBQVMseUJBQXlCLFlBQVk7QUFDdEUsY0FBVSxPQUFPO0FBQ2pCLFNBQUssVUFBVSxJQUFJLHNCQUFzQixXQUFXLElBQUksVUFBVSxPQUFPLE9BQUs7QUFDN0UsUUFBRSxlQUFlO0FBQ2pCLFdBQUssZUFBZSxLQUFLLElBQUksTUFBTSxjQUFjLENBQUM7QUFBQSxJQUNuRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxRQUFjO0FBQ2IsU0FBSyxPQUFPLE1BQU07QUFBQSxFQUNuQjtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsU0FBSyxPQUFPLE9BQU87QUFDbkIsU0FBSyxRQUFRO0FBQ2IsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBbkVhLHdCQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxHQU5VOyIsCiAgIm5hbWVzIjogW10KfQo=
