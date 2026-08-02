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
import { $, append, EventHelper, clearNode } from "../../../base/browser/dom.js";
import { DomEmitter } from "../../../base/browser/event.js";
import { StandardKeyboardEvent } from "../../../base/browser/keyboardEvent.js";
import { EventType as TouchEventType, Gesture } from "../../../base/browser/touch.js";
import { Event } from "../../../base/common/event.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { IOpenerService } from "../common/opener.js";
import "./link.css";
import { getDefaultHoverDelegate } from "../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../hover/browser/hover.js";
let Link = class extends Disposable {
  constructor(container, _link, options = {}, _hoverService, openerService) {
    super();
    this._link = _link;
    this._hoverService = _hoverService;
    this._enabled = true;
    this.el = append(container, $("a.monaco-link", {
      tabIndex: _link.tabIndex ?? 0,
      href: _link.href
    }, _link.label));
    this.hoverDelegate = options.hoverDelegate ?? getDefaultHoverDelegate("mouse");
    this.setTooltip(_link.title);
    this.el.setAttribute("role", "button");
    const onClickEmitter = this._register(new DomEmitter(this.el, "click"));
    const onKeyDown = this._register(new DomEmitter(this.el, "keydown"));
    const onKeyActivate = Event.chain(
      onKeyDown.event,
      ($2) => $2.map((e) => new StandardKeyboardEvent(e)).filter((e) => e.keyCode === KeyCode.Enter || e.keyCode === KeyCode.Space)
    );
    const onTap = this._register(new DomEmitter(this.el, TouchEventType.Tap)).event;
    this._register(Gesture.addTarget(this.el));
    const onOpen = Event.any(onClickEmitter.event, onKeyActivate, onTap);
    this._register(onOpen((e) => {
      if (!this.enabled) {
        return;
      }
      EventHelper.stop(e, true);
      if (options?.opener) {
        options.opener(this._link.href);
      } else {
        openerService.open(this._link.href, { allowCommands: true });
      }
    }));
    this.enabled = true;
  }
  get enabled() {
    return this._enabled;
  }
  set enabled(enabled) {
    if (enabled) {
      this.el.setAttribute("aria-disabled", "false");
      this.el.tabIndex = 0;
      this.el.style.pointerEvents = "auto";
      this.el.style.opacity = "1";
      this.el.style.cursor = "pointer";
      this._enabled = false;
    } else {
      this.el.setAttribute("aria-disabled", "true");
      this.el.tabIndex = -1;
      this.el.style.pointerEvents = "none";
      this.el.style.opacity = "0.4";
      this.el.style.cursor = "default";
      this._enabled = true;
    }
    this._enabled = enabled;
  }
  set link(link) {
    if (typeof link.label === "string") {
      this.el.textContent = link.label;
    } else {
      clearNode(this.el);
      this.el.appendChild(link.label);
    }
    this.el.href = link.href;
    if (typeof link.tabIndex !== "undefined") {
      this.el.tabIndex = link.tabIndex;
    }
    this.setTooltip(link.title);
    this._link = link;
  }
  setTooltip(title) {
    if (!this.hover && title) {
      this.hover = this._register(this._hoverService.setupManagedHover(this.hoverDelegate, this.el, title));
    } else if (this.hover) {
      this.hover.update(title);
    }
  }
};
Link = __decorateClass([
  __decorateParam(3, IHoverService),
  __decorateParam(4, IOpenerService)
], Link);
export {
  Link
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL29wZW5lci9icm93c2VyL2xpbmsudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBhcHBlbmQsIEV2ZW50SGVscGVyLCBFdmVudExpa2UsIGNsZWFyTm9kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRG9tRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9ldmVudC5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUsIEdlc3R1cmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0ICcuL2xpbmsuY3NzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFuYWdlZEhvdmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJTGlua0Rlc2NyaXB0b3Ige1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nIHwgSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGhyZWY6IHN0cmluZztcblx0cmVhZG9ubHkgdGl0bGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRhYkluZGV4PzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMaW5rT3B0aW9ucyB7XG5cdHJlYWRvbmx5IG9wZW5lcj86IChocmVmOiBzdHJpbmcpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IGhvdmVyRGVsZWdhdGU/OiBJSG92ZXJEZWxlZ2F0ZTtcblx0cmVhZG9ubHkgdGV4dExpbmtGb3JlZ3JvdW5kPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgTGluayBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgZWw6IEhUTUxBbmNob3JFbGVtZW50O1xuXHRwcml2YXRlIGhvdmVyPzogSU1hbmFnZWRIb3Zlcjtcblx0cHJpdmF0ZSBob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZTtcblxuXHRwcml2YXRlIF9lbmFibGVkOiBib29sZWFuID0gdHJ1ZTtcblxuXHRnZXQgZW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5hYmxlZDtcblx0fVxuXG5cdHNldCBlbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pIHtcblx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0dGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnLCAnZmFsc2UnKTtcblx0XHRcdHRoaXMuZWwudGFiSW5kZXggPSAwO1xuXHRcdFx0dGhpcy5lbC5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ2F1dG8nO1xuXHRcdFx0dGhpcy5lbC5zdHlsZS5vcGFjaXR5ID0gJzEnO1xuXHRcdFx0dGhpcy5lbC5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG5cdFx0XHR0aGlzLl9lbmFibGVkID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWwuc2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJywgJ3RydWUnKTtcblx0XHRcdHRoaXMuZWwudGFiSW5kZXggPSAtMTtcblx0XHRcdHRoaXMuZWwuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJztcblx0XHRcdHRoaXMuZWwuc3R5bGUub3BhY2l0eSA9ICcwLjQnO1xuXHRcdFx0dGhpcy5lbC5zdHlsZS5jdXJzb3IgPSAnZGVmYXVsdCc7XG5cdFx0XHR0aGlzLl9lbmFibGVkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHR0aGlzLl9lbmFibGVkID0gZW5hYmxlZDtcblx0fVxuXG5cdHNldCBsaW5rKGxpbms6IElMaW5rRGVzY3JpcHRvcikge1xuXHRcdGlmICh0eXBlb2YgbGluay5sYWJlbCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuZWwudGV4dENvbnRlbnQgPSBsaW5rLmxhYmVsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjbGVhck5vZGUodGhpcy5lbCk7XG5cdFx0XHR0aGlzLmVsLmFwcGVuZENoaWxkKGxpbmsubGFiZWwpO1xuXHRcdH1cblxuXHRcdHRoaXMuZWwuaHJlZiA9IGxpbmsuaHJlZjtcblxuXHRcdGlmICh0eXBlb2YgbGluay50YWJJbmRleCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoaXMuZWwudGFiSW5kZXggPSBsaW5rLnRhYkluZGV4O1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0VG9vbHRpcChsaW5rLnRpdGxlKTtcblxuXHRcdHRoaXMuX2xpbmsgPSBsaW5rO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIF9saW5rOiBJTGlua0Rlc2NyaXB0b3IsXG5cdFx0b3B0aW9uczogSUxpbmtPcHRpb25zID0ge30sXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lbCA9IGFwcGVuZChjb250YWluZXIsICQoJ2EubW9uYWNvLWxpbmsnLCB7XG5cdFx0XHR0YWJJbmRleDogX2xpbmsudGFiSW5kZXggPz8gMCxcblx0XHRcdGhyZWY6IF9saW5rLmhyZWYsXG5cdFx0fSwgX2xpbmsubGFiZWwpKTtcblxuXHRcdHRoaXMuaG92ZXJEZWxlZ2F0ZSA9IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSA/PyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKTtcblx0XHR0aGlzLnNldFRvb2x0aXAoX2xpbmsudGl0bGUpO1xuXG5cdFx0dGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cblx0XHRjb25zdCBvbkNsaWNrRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21FbWl0dGVyKHRoaXMuZWwsICdjbGljaycpKTtcblx0XHRjb25zdCBvbktleURvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tRW1pdHRlcih0aGlzLmVsLCAna2V5ZG93bicpKTtcblx0XHRjb25zdCBvbktleUFjdGl2YXRlID0gRXZlbnQuY2hhaW4ob25LZXlEb3duLmV2ZW50LCAkID0+XG5cdFx0XHQkLm1hcChlID0+IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSkpXG5cdFx0XHRcdC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIgfHwgZS5rZXlDb2RlID09PSBLZXlDb2RlLlNwYWNlKVxuXHRcdCk7XG5cdFx0Y29uc3Qgb25UYXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tRW1pdHRlcih0aGlzLmVsLCBUb3VjaEV2ZW50VHlwZS5UYXApKS5ldmVudDtcblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldCh0aGlzLmVsKSk7XG5cdFx0Y29uc3Qgb25PcGVuID0gRXZlbnQuYW55PEV2ZW50TGlrZT4ob25DbGlja0VtaXR0ZXIuZXZlbnQsIG9uS2V5QWN0aXZhdGUsIG9uVGFwKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uT3BlbihlID0+IHtcblx0XHRcdGlmICghdGhpcy5lbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdFx0aWYgKG9wdGlvbnM/Lm9wZW5lcikge1xuXHRcdFx0XHRvcHRpb25zLm9wZW5lcih0aGlzLl9saW5rLmhyZWYpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3BlbmVyU2VydmljZS5vcGVuKHRoaXMuX2xpbmsuaHJlZiwgeyBhbGxvd0NvbW1hbmRzOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHNldFRvb2x0aXAodGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5ob3ZlciAmJiB0aXRsZSkge1xuXHRcdFx0dGhpcy5ob3ZlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcih0aGlzLmhvdmVyRGVsZWdhdGUsIHRoaXMuZWwsIHRpdGxlKSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmhvdmVyKSB7XG5cdFx0XHR0aGlzLmhvdmVyLnVwZGF0ZSh0aXRsZSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsR0FBRyxRQUFRLGFBQXdCLGlCQUFpQjtBQUM3RCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGFBQWEsZ0JBQWdCLGVBQWU7QUFDckQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHNCQUFzQjtBQUMvQixPQUFPO0FBQ1AsU0FBUywrQkFBK0I7QUFHeEMsU0FBUyxxQkFBcUI7QUFldkIsSUFBTSxPQUFOLGNBQW1CLFdBQVc7QUFBQSxFQW1EcEMsWUFDQyxXQUNRLE9BQ1IsVUFBd0IsQ0FBQyxHQUNPLGVBQ2hCLGVBQ2Y7QUFDRCxVQUFNO0FBTEU7QUFFd0I7QUFqRGpDLFNBQVEsV0FBb0I7QUFzRDNCLFNBQUssS0FBSyxPQUFPLFdBQVcsRUFBRSxpQkFBaUI7QUFBQSxNQUM5QyxVQUFVLE1BQU0sWUFBWTtBQUFBLE1BQzVCLE1BQU0sTUFBTTtBQUFBLElBQ2IsR0FBRyxNQUFNLEtBQUssQ0FBQztBQUVmLFNBQUssZ0JBQWdCLFFBQVEsaUJBQWlCLHdCQUF3QixPQUFPO0FBQzdFLFNBQUssV0FBVyxNQUFNLEtBQUs7QUFFM0IsU0FBSyxHQUFHLGFBQWEsUUFBUSxRQUFRO0FBRXJDLFVBQU0saUJBQWlCLEtBQUssVUFBVSxJQUFJLFdBQVcsS0FBSyxJQUFJLE9BQU8sQ0FBQztBQUN0RSxVQUFNLFlBQVksS0FBSyxVQUFVLElBQUksV0FBVyxLQUFLLElBQUksU0FBUyxDQUFDO0FBQ25FLFVBQU0sZ0JBQWdCLE1BQU07QUFBQSxNQUFNLFVBQVU7QUFBQSxNQUFPLENBQUFBLE9BQ2xEQSxHQUFFLElBQUksT0FBSyxJQUFJLHNCQUFzQixDQUFDLENBQUMsRUFDckMsT0FBTyxPQUFLLEVBQUUsWUFBWSxRQUFRLFNBQVMsRUFBRSxZQUFZLFFBQVEsS0FBSztBQUFBLElBQ3pFO0FBQ0EsVUFBTSxRQUFRLEtBQUssVUFBVSxJQUFJLFdBQVcsS0FBSyxJQUFJLGVBQWUsR0FBRyxDQUFDLEVBQUU7QUFDMUUsU0FBSyxVQUFVLFFBQVEsVUFBVSxLQUFLLEVBQUUsQ0FBQztBQUN6QyxVQUFNLFNBQVMsTUFBTSxJQUFlLGVBQWUsT0FBTyxlQUFlLEtBQUs7QUFFOUUsU0FBSyxVQUFVLE9BQU8sT0FBSztBQUMxQixVQUFJLENBQUMsS0FBSyxTQUFTO0FBQ2xCO0FBQUEsTUFDRDtBQUVBLGtCQUFZLEtBQUssR0FBRyxJQUFJO0FBRXhCLFVBQUksU0FBUyxRQUFRO0FBQ3BCLGdCQUFRLE9BQU8sS0FBSyxNQUFNLElBQUk7QUFBQSxNQUMvQixPQUFPO0FBQ04sc0JBQWMsS0FBSyxLQUFLLE1BQU0sTUFBTSxFQUFFLGVBQWUsS0FBSyxDQUFDO0FBQUEsTUFDNUQ7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVTtBQUFBLEVBQ2hCO0FBQUEsRUF2RkEsSUFBSSxVQUFtQjtBQUN0QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLFFBQVEsU0FBa0I7QUFDN0IsUUFBSSxTQUFTO0FBQ1osV0FBSyxHQUFHLGFBQWEsaUJBQWlCLE9BQU87QUFDN0MsV0FBSyxHQUFHLFdBQVc7QUFDbkIsV0FBSyxHQUFHLE1BQU0sZ0JBQWdCO0FBQzlCLFdBQUssR0FBRyxNQUFNLFVBQVU7QUFDeEIsV0FBSyxHQUFHLE1BQU0sU0FBUztBQUN2QixXQUFLLFdBQVc7QUFBQSxJQUNqQixPQUFPO0FBQ04sV0FBSyxHQUFHLGFBQWEsaUJBQWlCLE1BQU07QUFDNUMsV0FBSyxHQUFHLFdBQVc7QUFDbkIsV0FBSyxHQUFHLE1BQU0sZ0JBQWdCO0FBQzlCLFdBQUssR0FBRyxNQUFNLFVBQVU7QUFDeEIsV0FBSyxHQUFHLE1BQU0sU0FBUztBQUN2QixXQUFLLFdBQVc7QUFBQSxJQUNqQjtBQUVBLFNBQUssV0FBVztBQUFBLEVBQ2pCO0FBQUEsRUFFQSxJQUFJLEtBQUssTUFBdUI7QUFDL0IsUUFBSSxPQUFPLEtBQUssVUFBVSxVQUFVO0FBQ25DLFdBQUssR0FBRyxjQUFjLEtBQUs7QUFBQSxJQUM1QixPQUFPO0FBQ04sZ0JBQVUsS0FBSyxFQUFFO0FBQ2pCLFdBQUssR0FBRyxZQUFZLEtBQUssS0FBSztBQUFBLElBQy9CO0FBRUEsU0FBSyxHQUFHLE9BQU8sS0FBSztBQUVwQixRQUFJLE9BQU8sS0FBSyxhQUFhLGFBQWE7QUFDekMsV0FBSyxHQUFHLFdBQVcsS0FBSztBQUFBLElBQ3pCO0FBRUEsU0FBSyxXQUFXLEtBQUssS0FBSztBQUUxQixTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQUEsRUFnRFEsV0FBVyxPQUFpQztBQUNuRCxRQUFJLENBQUMsS0FBSyxTQUFTLE9BQU87QUFDekIsV0FBSyxRQUFRLEtBQUssVUFBVSxLQUFLLGNBQWMsa0JBQWtCLEtBQUssZUFBZSxLQUFLLElBQUksS0FBSyxDQUFDO0FBQUEsSUFDckcsV0FBVyxLQUFLLE9BQU87QUFDdEIsV0FBSyxNQUFNLE9BQU8sS0FBSztBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUNEO0FBeEdhLE9BQU47QUFBQSxFQXVESjtBQUFBLEVBQ0E7QUFBQSxHQXhEVTsiLAogICJuYW1lcyI6IFsiJCJdCn0K
