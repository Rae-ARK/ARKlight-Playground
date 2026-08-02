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
import * as dom from "../../../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../../../base/browser/keyboardEvent.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../../base/common/themables.js";
import { localize } from "../../../../../../../nls.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { getDefaultHoverDelegate } from "../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { ToolRiskLevel } from "../../../tools/chatToolRiskAssessmentService.js";
import "./media/toolRiskBadge.css";
const RISK_BADGE_CLASS = "tool-risk-badge";
let ToolRiskBadgeWidget = class extends Disposable {
  constructor(_hoverService) {
    super();
    this._hoverService = _hoverService;
    this._hoverStore = this._register(new DisposableStore());
    this._detailsHoverStore = this._register(new DisposableStore());
    this._onDidHide = this._register(new Emitter());
    this.onDidHide = this._onDidHide.event;
    this.domNode = dom.$(`span.${RISK_BADGE_CLASS}`);
    this._iconEl = dom.$("span.tool-risk-icon");
    this._iconEl.setAttribute("aria-hidden", "true");
    this._textEl = dom.$("span.tool-risk-text");
    this._detailsIconEl = dom.$("span.tool-risk-details-icon");
    this._detailsIconEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
    this._detailsIconEl.tabIndex = 0;
    this._detailsIconEl.setAttribute("role", "button");
    this._detailsIconEl.setAttribute("aria-label", localize("toolRisk.detailsIconLabel", "Risk assessment details"));
    this.domNode.append(this._iconEl, this._textEl, this._detailsIconEl);
    this._refreshDetailsHover();
    this.setLoading();
    this._register(dom.addDisposableListener(this._detailsIconEl, dom.EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._hoverService.showManagedHover(this._detailsIconEl);
    }));
    this._register(dom.addDisposableListener(this._detailsIconEl, dom.EventType.KEY_DOWN, (e) => {
      const ev = new StandardKeyboardEvent(e);
      if (ev.keyCode === KeyCode.Enter || ev.keyCode === KeyCode.Space) {
        ev.preventDefault();
        ev.stopPropagation();
        this._hoverService.showManagedHover(this._detailsIconEl);
      }
    }));
  }
  get isDisposed() {
    return this._store.isDisposed;
  }
  setLoading() {
    this._setVariant("loading");
    this._setIcon(ThemeIcon.modify(Codicon.loadingCompact, "spin"));
    const text = localize("toolRisk.assessing", "Assessing risk\u2026");
    this._textEl.textContent = text;
    this._setHover(localize("toolRisk.assessingHover", "Generating a risk assessment for this tool call."));
  }
  setHidden() {
    this.domNode.style.display = "none";
    this._onDidHide.fire();
  }
  setAssessment(assessment) {
    switch (assessment.risk) {
      case ToolRiskLevel.Green:
        this._setVariant("green");
        this._setIcon(Codicon.passCompact);
        break;
      case ToolRiskLevel.Orange:
        this._setVariant("orange");
        this._setIcon(Codicon.warningCompact);
        break;
      case ToolRiskLevel.Red:
        this._setVariant("red");
        this._setIcon(Codicon.errorCompact);
        break;
    }
    this.domNode.style.display = "";
    this._textEl.textContent = assessment.explanation;
    this._setHover(assessment.explanation);
  }
  /**
   * Provide additional context to surface in the trailing info icon's hover.
   * The hover always notes that the assessment is AI-generated; any details
   * passed here are appended below that note.
   */
  setDetails(details) {
    this._details = details;
    this._refreshDetailsHover();
  }
  /**
   * The markdown content currently shown in the trailing info icon's hover.
   * Exposed so component fixtures can render a preview of the hover content.
   */
  getDetailsMarkdown() {
    return this._buildDetailsMarkdown();
  }
  _setVariant(variant) {
    this.domNode.classList.remove("green", "orange", "red", "loading");
    this.domNode.classList.add(variant);
  }
  _setIcon(icon) {
    this._iconEl.textContent = "";
    this._iconEl.className = "tool-risk-icon " + ThemeIcon.asClassName(icon);
  }
  _setHover(content) {
    this._hoverStore.clear();
    this._hoverStore.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.domNode, content));
  }
  _refreshDetailsHover() {
    this._detailsHoverStore.clear();
    const md = this._buildDetailsMarkdown();
    const fallback = md.value.replace(/\$\([^)]+\)\s?/g, "");
    this._detailsHoverStore.add(this._hoverService.setupManagedHover(
      getDefaultHoverDelegate("element"),
      this._detailsIconEl,
      { markdown: md, markdownNotSupportedFallback: fallback }
    ));
  }
  _buildDetailsMarkdown() {
    const aiNote = localize("toolRisk.aiGenerated", "Risk assessments are AI-generated and may be inaccurate.");
    const details = this._details;
    const md = new MarkdownString(void 0, {
      supportThemeIcons: true,
      isTrusted: typeof details === "object" && details ? details.isTrusted : void 0
    });
    md.appendText(aiNote);
    if (details) {
      md.appendMarkdown("\n\n");
      if (typeof details === "string") {
        md.appendText(details);
      } else {
        md.appendMarkdown(details.value);
      }
    }
    return md;
  }
};
ToolRiskBadgeWidget = __decorateClass([
  __decorateParam(0, IHoverService)
], ToolRiskBadgeWidget);
export {
  ToolRiskBadgeWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL3Rvb2xSaXNrQmFkZ2VXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSVRvb2xSaXNrQXNzZXNzbWVudCwgVG9vbFJpc2tMZXZlbCB9IGZyb20gJy4uLy4uLy4uL3Rvb2xzL2NoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmpzJztcblxuaW1wb3J0ICcuL21lZGlhL3Rvb2xSaXNrQmFkZ2UuY3NzJztcblxuY29uc3QgUklTS19CQURHRV9DTEFTUyA9ICd0b29sLXJpc2stYmFkZ2UnO1xuXG5leHBvcnQgY2xhc3MgVG9vbFJpc2tCYWRnZVdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwdWJsaWMgZ2V0IGlzRGlzcG9zZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaWNvbkVsOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGV4dEVsOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGV0YWlsc0ljb25FbDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZXRhaWxzSG92ZXJTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX2RldGFpbHM6IElNYXJrZG93blN0cmluZyB8IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEhpZGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkSGlkZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZEhpZGUuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gZG9tLiQoYHNwYW4uJHtSSVNLX0JBREdFX0NMQVNTfWApO1xuXHRcdHRoaXMuX2ljb25FbCA9IGRvbS4kKCdzcGFuLnRvb2wtcmlzay1pY29uJyk7XG5cdFx0dGhpcy5faWNvbkVsLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdHRoaXMuX3RleHRFbCA9IGRvbS4kKCdzcGFuLnRvb2wtcmlzay10ZXh0Jyk7XG5cdFx0dGhpcy5fZGV0YWlsc0ljb25FbCA9IGRvbS4kKCdzcGFuLnRvb2wtcmlzay1kZXRhaWxzLWljb24nKTtcblx0XHR0aGlzLl9kZXRhaWxzSWNvbkVsLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5pbmZvKSk7XG5cdFx0dGhpcy5fZGV0YWlsc0ljb25FbC50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5fZGV0YWlsc0ljb25FbC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0dGhpcy5fZGV0YWlsc0ljb25FbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgndG9vbFJpc2suZGV0YWlsc0ljb25MYWJlbCcsIFwiUmlzayBhc3Nlc3NtZW50IGRldGFpbHNcIikpO1xuXHRcdHRoaXMuZG9tTm9kZS5hcHBlbmQodGhpcy5faWNvbkVsLCB0aGlzLl90ZXh0RWwsIHRoaXMuX2RldGFpbHNJY29uRWwpO1xuXHRcdHRoaXMuX3JlZnJlc2hEZXRhaWxzSG92ZXIoKTtcblx0XHR0aGlzLnNldExvYWRpbmcoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZGV0YWlsc0ljb25FbCwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5faG92ZXJTZXJ2aWNlLnNob3dNYW5hZ2VkSG92ZXIodGhpcy5fZGV0YWlsc0ljb25FbCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZGV0YWlsc0ljb25FbCwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRjb25zdCBldiA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXYua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciB8fCBldi5rZXlDb2RlID09PSBLZXlDb2RlLlNwYWNlKSB7XG5cdFx0XHRcdGV2LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGV2LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9ob3ZlclNlcnZpY2Uuc2hvd01hbmFnZWRIb3Zlcih0aGlzLl9kZXRhaWxzSWNvbkVsKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRzZXRMb2FkaW5nKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NldFZhcmlhbnQoJ2xvYWRpbmcnKTtcblx0XHR0aGlzLl9zZXRJY29uKFRoZW1lSWNvbi5tb2RpZnkoQ29kaWNvbi5sb2FkaW5nQ29tcGFjdCwgJ3NwaW4nKSk7XG5cdFx0Y29uc3QgdGV4dCA9IGxvY2FsaXplKCd0b29sUmlzay5hc3Nlc3NpbmcnLCBcIkFzc2Vzc2luZyByaXNrXFx1MjAyNlwiKTtcblx0XHR0aGlzLl90ZXh0RWwudGV4dENvbnRlbnQgPSB0ZXh0O1xuXHRcdHRoaXMuX3NldEhvdmVyKGxvY2FsaXplKCd0b29sUmlzay5hc3Nlc3NpbmdIb3ZlcicsIFwiR2VuZXJhdGluZyBhIHJpc2sgYXNzZXNzbWVudCBmb3IgdGhpcyB0b29sIGNhbGwuXCIpKTtcblx0fVxuXG5cdHNldEhpZGRlbigpOiB2b2lkIHtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLl9vbkRpZEhpZGUuZmlyZSgpO1xuXHR9XG5cblx0c2V0QXNzZXNzbWVudChhc3Nlc3NtZW50OiBJVG9vbFJpc2tBc3Nlc3NtZW50KTogdm9pZCB7XG5cdFx0c3dpdGNoIChhc3Nlc3NtZW50LnJpc2spIHtcblx0XHRcdGNhc2UgVG9vbFJpc2tMZXZlbC5HcmVlbjpcblx0XHRcdFx0dGhpcy5fc2V0VmFyaWFudCgnZ3JlZW4nKTtcblx0XHRcdFx0dGhpcy5fc2V0SWNvbihDb2RpY29uLnBhc3NDb21wYWN0KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFRvb2xSaXNrTGV2ZWwuT3JhbmdlOlxuXHRcdFx0XHR0aGlzLl9zZXRWYXJpYW50KCdvcmFuZ2UnKTtcblx0XHRcdFx0dGhpcy5fc2V0SWNvbihDb2RpY29uLndhcm5pbmdDb21wYWN0KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFRvb2xSaXNrTGV2ZWwuUmVkOlxuXHRcdFx0XHR0aGlzLl9zZXRWYXJpYW50KCdyZWQnKTtcblx0XHRcdFx0dGhpcy5fc2V0SWNvbihDb2RpY29uLmVycm9yQ29tcGFjdCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdHRoaXMuX3RleHRFbC50ZXh0Q29udGVudCA9IGFzc2Vzc21lbnQuZXhwbGFuYXRpb247XG5cdFx0dGhpcy5fc2V0SG92ZXIoYXNzZXNzbWVudC5leHBsYW5hdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogUHJvdmlkZSBhZGRpdGlvbmFsIGNvbnRleHQgdG8gc3VyZmFjZSBpbiB0aGUgdHJhaWxpbmcgaW5mbyBpY29uJ3MgaG92ZXIuXG5cdCAqIFRoZSBob3ZlciBhbHdheXMgbm90ZXMgdGhhdCB0aGUgYXNzZXNzbWVudCBpcyBBSS1nZW5lcmF0ZWQ7IGFueSBkZXRhaWxzXG5cdCAqIHBhc3NlZCBoZXJlIGFyZSBhcHBlbmRlZCBiZWxvdyB0aGF0IG5vdGUuXG5cdCAqL1xuXHRzZXREZXRhaWxzKGRldGFpbHM6IElNYXJrZG93blN0cmluZyB8IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2RldGFpbHMgPSBkZXRhaWxzO1xuXHRcdHRoaXMuX3JlZnJlc2hEZXRhaWxzSG92ZXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbWFya2Rvd24gY29udGVudCBjdXJyZW50bHkgc2hvd24gaW4gdGhlIHRyYWlsaW5nIGluZm8gaWNvbidzIGhvdmVyLlxuXHQgKiBFeHBvc2VkIHNvIGNvbXBvbmVudCBmaXh0dXJlcyBjYW4gcmVuZGVyIGEgcHJldmlldyBvZiB0aGUgaG92ZXIgY29udGVudC5cblx0ICovXG5cdGdldERldGFpbHNNYXJrZG93bigpOiBJTWFya2Rvd25TdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9idWlsZERldGFpbHNNYXJrZG93bigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0VmFyaWFudCh2YXJpYW50OiAnbG9hZGluZycgfCAnZ3JlZW4nIHwgJ29yYW5nZScgfCAncmVkJyk6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdncmVlbicsICdvcmFuZ2UnLCAncmVkJywgJ2xvYWRpbmcnKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCh2YXJpYW50KTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEljb24oaWNvbjogVGhlbWVJY29uKTogdm9pZCB7XG5cdFx0dGhpcy5faWNvbkVsLnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGhpcy5faWNvbkVsLmNsYXNzTmFtZSA9ICd0b29sLXJpc2staWNvbiAnICsgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0SG92ZXIoY29udGVudDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5faG92ZXJTdG9yZS5jbGVhcigpO1xuXHRcdHRoaXMuX2hvdmVyU3RvcmUuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGhpcy5kb21Ob2RlLCBjb250ZW50KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoRGV0YWlsc0hvdmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2RldGFpbHNIb3ZlclN0b3JlLmNsZWFyKCk7XG5cdFx0Y29uc3QgbWQgPSB0aGlzLl9idWlsZERldGFpbHNNYXJrZG93bigpO1xuXHRcdGNvbnN0IGZhbGxiYWNrID0gbWQudmFsdWUucmVwbGFjZSgvXFwkXFwoW14pXStcXClcXHM/L2csICcnKTtcblx0XHR0aGlzLl9kZXRhaWxzSG92ZXJTdG9yZS5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKFxuXHRcdFx0Z2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSxcblx0XHRcdHRoaXMuX2RldGFpbHNJY29uRWwsXG5cdFx0XHR7IG1hcmtkb3duOiBtZCwgbWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjazogZmFsbGJhY2sgfSxcblx0XHQpKTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkRGV0YWlsc01hcmtkb3duKCk6IElNYXJrZG93blN0cmluZyB7XG5cdFx0Y29uc3QgYWlOb3RlID0gbG9jYWxpemUoJ3Rvb2xSaXNrLmFpR2VuZXJhdGVkJywgXCJSaXNrIGFzc2Vzc21lbnRzIGFyZSBBSS1nZW5lcmF0ZWQgYW5kIG1heSBiZSBpbmFjY3VyYXRlLlwiKTtcblx0XHRjb25zdCBkZXRhaWxzID0gdGhpcy5fZGV0YWlscztcblx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHtcblx0XHRcdHN1cHBvcnRUaGVtZUljb25zOiB0cnVlLFxuXHRcdFx0aXNUcnVzdGVkOiB0eXBlb2YgZGV0YWlscyA9PT0gJ29iamVjdCcgJiYgZGV0YWlscyA/IGRldGFpbHMuaXNUcnVzdGVkIDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdG1kLmFwcGVuZFRleHQoYWlOb3RlKTtcblx0XHRpZiAoZGV0YWlscykge1xuXHRcdFx0bWQuYXBwZW5kTWFya2Rvd24oJ1xcblxcbicpO1xuXHRcdFx0aWYgKHR5cGVvZiBkZXRhaWxzID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRtZC5hcHBlbmRUZXh0KGRldGFpbHMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWQuYXBwZW5kTWFya2Rvd24oZGV0YWlscy52YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBtZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFD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
