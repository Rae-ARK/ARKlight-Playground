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
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { chatSubcommandLeader } from "../../../common/requestParser/chatParserTypes.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { localize } from "../../../../../../nls.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { HoverStyle } from "../../../../../../base/browser/ui/hover/hover.js";
let ChatAgentCommandContentPart = class extends Disposable {
  constructor(cmd, onClick, _hoverService) {
    super();
    this._hoverService = _hoverService;
    this.domNode = document.createElement("span");
    this.domNode.classList.add("chat-agent-command");
    this.domNode.setAttribute("aria-label", cmd.name);
    this.domNode.setAttribute("role", "button");
    const groupId = generateUuid();
    const commandSpan = document.createElement("span");
    this.domNode.appendChild(commandSpan);
    commandSpan.innerText = chatSubcommandLeader + cmd.name;
    this._store.add(this._hoverService.setupDelayedHover(commandSpan, {
      content: cmd.description,
      style: HoverStyle.Pointer
    }, { groupId }));
    const rerun = localize("rerun", "Rerun without {0}{1}", chatSubcommandLeader, cmd.name);
    const btn = new Button(this.domNode, { ariaLabel: rerun });
    btn.icon = Codicon.close;
    this._store.add(btn.onDidClick(() => onClick()));
    this._store.add(btn);
    this._store.add(this._hoverService.setupDelayedHover(btn.element, {
      content: rerun,
      style: HoverStyle.Pointer
    }, { groupId }));
  }
  hasSameContent(other, followingContent, element) {
    return false;
  }
};
ChatAgentCommandContentPart = __decorateClass([
  __decorateParam(2, IHoverService)
], ChatAgentCommandContentPart);
export {
  ChatAgentCommandContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0QWdlbnRDb21tYW5kQ29udGVudFBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgY2hhdFN1YmNvbW1hbmRMZWFkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRSZW5kZXJlckNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0VHJlZUl0ZW0gfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSG92ZXJTdHlsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5cblxuZXhwb3J0IGNsYXNzIENoYXRBZ2VudENvbW1hbmRDb250ZW50UGFydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdENvbnRlbnRQYXJ0IHtcblxuXHRyZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjbWQ6IElDaGF0QWdlbnRDb21tYW5kLFxuXHRcdG9uQ2xpY2s6ICgpID0+IHZvaWQsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LWFnZW50LWNvbW1hbmQnKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgY21kLm5hbWUpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cblx0XHRjb25zdCBncm91cElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cblx0XHRjb25zdCBjb21tYW5kU3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQoY29tbWFuZFNwYW4pO1xuXHRcdGNvbW1hbmRTcGFuLmlubmVyVGV4dCA9IGNoYXRTdWJjb21tYW5kTGVhZGVyICsgY21kLm5hbWU7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcihjb21tYW5kU3Bhbiwge1xuXHRcdFx0Y29udGVudDogY21kLmRlc2NyaXB0aW9uLFxuXHRcdFx0c3R5bGU6IEhvdmVyU3R5bGUuUG9pbnRlcixcblx0XHR9LCB7IGdyb3VwSWQgfSkpO1xuXG5cdFx0Y29uc3QgcmVydW4gPSBsb2NhbGl6ZSgncmVydW4nLCBcIlJlcnVuIHdpdGhvdXQgezB9ezF9XCIsIGNoYXRTdWJjb21tYW5kTGVhZGVyLCBjbWQubmFtZSk7XG5cdFx0Y29uc3QgYnRuID0gbmV3IEJ1dHRvbih0aGlzLmRvbU5vZGUsIHsgYXJpYUxhYmVsOiByZXJ1biB9KTtcblx0XHRidG4uaWNvbiA9IENvZGljb24uY2xvc2U7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKGJ0bi5vbkRpZENsaWNrKCgpID0+IG9uQ2xpY2soKSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChidG4pO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoYnRuLmVsZW1lbnQsIHtcblx0XHRcdGNvbnRlbnQ6IHJlcnVuLFxuXHRcdFx0c3R5bGU6IEhvdmVyU3R5bGUuUG9pbnRlcixcblx0XHR9LCB7IGdyb3VwSWQgfSkpO1xuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50LCBmb2xsb3dpbmdDb250ZW50OiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdLCBlbGVtZW50OiBDaGF0VHJlZUl0ZW0pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyw0QkFBNEI7QUFJckMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYztBQUN2QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFrQjtBQUdwQixJQUFNLDhCQUFOLGNBQTBDLFdBQXVDO0FBQUEsRUFJdkYsWUFDQyxLQUNBLFNBQ2dDLGVBQy9CO0FBQ0QsVUFBTTtBQUYwQjtBQUxqQyxTQUFTLFVBQXVCLFNBQVMsY0FBYyxNQUFNO0FBUTVELFNBQUssUUFBUSxVQUFVLElBQUksb0JBQW9CO0FBQy9DLFNBQUssUUFBUSxhQUFhLGNBQWMsSUFBSSxJQUFJO0FBQ2hELFNBQUssUUFBUSxhQUFhLFFBQVEsUUFBUTtBQUUxQyxVQUFNLFVBQVUsYUFBYTtBQUU3QixVQUFNLGNBQWMsU0FBUyxjQUFjLE1BQU07QUFDakQsU0FBSyxRQUFRLFlBQVksV0FBVztBQUNwQyxnQkFBWSxZQUFZLHVCQUF1QixJQUFJO0FBQ25ELFNBQUssT0FBTyxJQUFJLEtBQUssY0FBYyxrQkFBa0IsYUFBYTtBQUFBLE1BQ2pFLFNBQVMsSUFBSTtBQUFBLE1BQ2IsT0FBTyxXQUFXO0FBQUEsSUFDbkIsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0FBRWYsVUFBTSxRQUFRLFNBQVMsU0FBUyx3QkFBd0Isc0JBQXNCLElBQUksSUFBSTtBQUN0RixVQUFNLE1BQU0sSUFBSSxPQUFPLEtBQUssU0FBUyxFQUFFLFdBQVcsTUFBTSxDQUFDO0FBQ3pELFFBQUksT0FBTyxRQUFRO0FBQ25CLFNBQUssT0FBTyxJQUFJLElBQUksV0FBVyxNQUFNLFFBQVEsQ0FBQyxDQUFDO0FBQy9DLFNBQUssT0FBTyxJQUFJLEdBQUc7QUFDbkIsU0FBSyxPQUFPLElBQUksS0FBSyxjQUFjLGtCQUFrQixJQUFJLFNBQVM7QUFBQSxNQUNqRSxTQUFTO0FBQUEsTUFDVCxPQUFPLFdBQVc7QUFBQSxJQUNuQixHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFBQSxFQUNoQjtBQUFBLEVBRUEsZUFBZSxPQUE2QixrQkFBMEMsU0FBZ0M7QUFDckgsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQXRDYSw4QkFBTjtBQUFBLEVBT0o7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
