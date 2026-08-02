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
import "./media/chatViewTitleControl.css";
import { addDisposableListener, EventType, h } from "../../../../../../base/browser/dom.js";
import { renderAsPlaintext } from "../../../../../../base/browser/markdownRenderer.js";
import { Gesture, EventType as TouchEventType } from "../../../../../../base/browser/touch.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../../../base/common/marshallingIds.js";
import { localize } from "../../../../../../nls.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { Action2, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ActionViewItem } from "../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { AgentSessionsPicker } from "../../agentSessions/agentSessionsPicker.js";
let ChatViewTitleControl = class extends Disposable {
  constructor(container, delegate, instantiationService) {
    super();
    this.container = container;
    this.delegate = delegate;
    this.instantiationService = instantiationService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this.title = void 0;
    this.titleLabel = this._register(new MutableDisposable());
    this.modelDisposables = this._register(new MutableDisposable());
    this.lastKnownHeight = 0;
    this.render(this.container);
    this.registerActions();
  }
  registerActions() {
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: ChatViewTitleControl.PICK_AGENT_SESSION_ACTION_ID,
          title: localize("chat.pickAgentSession", "Pick Agent Session"),
          f1: false,
          menu: [{
            id: MenuId.ChatViewSessionTitleNavigationToolbar,
            group: "navigation",
            order: 2
          }]
        });
      }
      async run(accessor) {
        const instantiationService = accessor.get(IInstantiationService);
        const agentSessionsPicker = instantiationService.createInstance(AgentSessionsPicker, that.titleLabel.value?.element, void 0);
        await agentSessionsPicker.pickAgentSession();
      }
    }));
  }
  render(parent) {
    const elements = h("div.chat-view-title-container", [
      h("div.chat-view-title-inner", [
        h("div.chat-view-title-navigation-toolbar@navigationToolbar"),
        h("div.chat-view-title-actions-toolbar@actionsToolbar")
      ])
    ]);
    this.navigationToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, elements.navigationToolbar, MenuId.ChatViewSessionTitleNavigationToolbar, {
      actionViewItemProvider: (action) => {
        if (action.id === ChatViewTitleControl.PICK_AGENT_SESSION_ACTION_ID) {
          this.titleLabel.value = new ChatViewTitleLabel(action);
          this.titleLabel.value.updateTitle(this.title ?? ChatViewTitleControl.DEFAULT_TITLE);
          return this.titleLabel.value;
        }
        return void 0;
      },
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      menuOptions: { shouldForwardArgs: true }
    }));
    this.actionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, elements.actionsToolbar, MenuId.ChatViewSessionTitleToolbar, {
      menuOptions: { shouldForwardArgs: true },
      hiddenItemStrategy: HiddenItemStrategy.NoHide
    }));
    this.titleContainer = elements.root;
    this._register(Gesture.addTarget(this.titleContainer));
    for (const eventType of [TouchEventType.Tap, EventType.CLICK]) {
      this._register(addDisposableListener(this.titleContainer, eventType, () => {
        this.delegate.focusChat();
      }));
    }
    parent.appendChild(this.titleContainer);
  }
  update(model) {
    this.model = model;
    this.modelDisposables.value = model?.onDidChange((e) => {
      if (e.kind === "setCustomTitle" || e.kind === "addRequest") {
        this.doUpdate();
      }
    });
    this.doUpdate();
  }
  doUpdate() {
    const markdownTitle = new MarkdownString(this.model?.title ?? "");
    this.title = renderAsPlaintext(markdownTitle);
    this.updateTitle(this.title ?? ChatViewTitleControl.DEFAULT_TITLE);
    const context = this.model && {
      $mid: MarshalledId.ChatViewContext,
      sessionResource: this.model.sessionResource
    };
    if (this.navigationToolbar) {
      this.navigationToolbar.context = context;
    }
    if (this.actionsToolbar) {
      this.actionsToolbar.context = context;
    }
  }
  updateTitle(title) {
    if (!this.titleContainer) {
      return;
    }
    this.titleContainer.classList.toggle("visible", this.shouldRender());
    this.titleLabel.value?.updateTitle(title);
    const currentHeight = this.getHeight();
    if (currentHeight !== this.lastKnownHeight) {
      this.lastKnownHeight = currentHeight;
      this._onDidChangeHeight.fire();
    }
  }
  shouldRender() {
    return !!this.model?.title;
  }
  getHeight() {
    if (!this.titleContainer || this.titleContainer.style.display === "none") {
      return 0;
    }
    return this.titleContainer.offsetHeight;
  }
};
ChatViewTitleControl.DEFAULT_TITLE = localize("chat", "Chat");
ChatViewTitleControl.PICK_AGENT_SESSION_ACTION_ID = "workbench.action.chat.pickAgentSession";
ChatViewTitleControl = __decorateClass([
  __decorateParam(2, IInstantiationService)
], ChatViewTitleControl);
class ChatViewTitleLabel extends ActionViewItem {
  constructor(action, options) {
    super(null, action, { ...options, icon: false, label: true });
    this.titleLabel = void 0;
  }
  render(container) {
    super.render(container);
    container.classList.add("chat-view-title-action-item");
    this.label?.classList.add("chat-view-title-label-container");
    this.titleLabel = this.label?.appendChild(h("span.chat-view-title-label").root);
    this.updateLabel();
  }
  updateTitle(title) {
    this.title = title;
    this.updateLabel();
  }
  updateLabel() {
    if (!this.titleLabel) {
      return;
    }
    if (this.title) {
      this.titleLabel.textContent = this.title;
    } else {
      this.titleLabel.textContent = "";
    }
  }
}
export {
  ChatViewTitleControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXRIb3N0cy92aWV3UGFuZS9jaGF0Vmlld1RpdGxlQ29udHJvbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0Vmlld1RpdGxlQ29udHJvbC5jc3MnO1xuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckFzUGxhaW50ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgR2VzdHVyZSwgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEhpZGRlbkl0ZW1TdHJhdGVneSwgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdFZpZXdUaXRsZUFjdGlvbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSwgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbnNQaWNrZXIgfSBmcm9tICcuLi8uLi9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNQaWNrZXIuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0Vmlld1RpdGxlRGVsZWdhdGUge1xuXHRmb2N1c0NoYXQoKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRWaWV3VGl0bGVDb250cm9sIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgREVGQVVMVF9USVRMRSA9IGxvY2FsaXplKCdjaGF0JywgXCJDaGF0XCIpO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBQSUNLX0FHRU5UX1NFU1NJT05fQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5waWNrQWdlbnRTZXNzaW9uJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUhlaWdodCA9IHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmV2ZW50O1xuXG5cdHByaXZhdGUgdGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHRpdGxlQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0aXRsZUxhYmVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENoYXRWaWV3VGl0bGVMYWJlbD4oKSk7XG5cblx0cHJpdmF0ZSBtb2RlbDogSUNoYXRNb2RlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtb2RlbERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgbmF2aWdhdGlvblRvb2xiYXI/OiBNZW51V29ya2JlbmNoVG9vbEJhcjtcblx0cHJpdmF0ZSBhY3Rpb25zVG9vbGJhcj86IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXG5cdHByaXZhdGUgbGFzdEtub3duSGVpZ2h0ID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWxlZ2F0ZTogSUNoYXRWaWV3VGl0bGVEZWxlZ2F0ZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVuZGVyKHRoaXMuY29udGFpbmVyKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJBY3Rpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQWN0aW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogQ2hhdFZpZXdUaXRsZUNvbnRyb2wuUElDS19BR0VOVF9TRVNTSU9OX0FDVElPTl9JRCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXQucGlja0FnZW50U2Vzc2lvbicsIFwiUGljayBBZ2VudCBTZXNzaW9uXCIpLFxuXHRcdFx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0Vmlld1Nlc3Npb25UaXRsZU5hdmlnYXRpb25Ub29sYmFyLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHRcdGNvbnN0IGFnZW50U2Vzc2lvbnNQaWNrZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zUGlja2VyLCB0aGF0LnRpdGxlTGFiZWwudmFsdWU/LmVsZW1lbnQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGF3YWl0IGFnZW50U2Vzc2lvbnNQaWNrZXIucGlja0FnZW50U2Vzc2lvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBlbGVtZW50cyA9IGgoJ2Rpdi5jaGF0LXZpZXctdGl0bGUtY29udGFpbmVyJywgW1xuXHRcdFx0aCgnZGl2LmNoYXQtdmlldy10aXRsZS1pbm5lcicsIFtcblx0XHRcdFx0aCgnZGl2LmNoYXQtdmlldy10aXRsZS1uYXZpZ2F0aW9uLXRvb2xiYXJAbmF2aWdhdGlvblRvb2xiYXInKSxcblx0XHRcdFx0aCgnZGl2LmNoYXQtdmlldy10aXRsZS1hY3Rpb25zLXRvb2xiYXJAYWN0aW9uc1Rvb2xiYXInKSxcblx0XHRcdF0pLFxuXHRcdF0pO1xuXG5cdFx0Ly8gVG9vbGJhciBvbiB0aGUgbGVmdFxuXHRcdHRoaXMubmF2aWdhdGlvblRvb2xiYXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBlbGVtZW50cy5uYXZpZ2F0aW9uVG9vbGJhciwgTWVudUlkLkNoYXRWaWV3U2Vzc2lvblRpdGxlTmF2aWdhdGlvblRvb2xiYXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb246IElBY3Rpb24pID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gQ2hhdFZpZXdUaXRsZUNvbnRyb2wuUElDS19BR0VOVF9TRVNTSU9OX0FDVElPTl9JRCkge1xuXHRcdFx0XHRcdHRoaXMudGl0bGVMYWJlbC52YWx1ZSA9IG5ldyBDaGF0Vmlld1RpdGxlTGFiZWwoYWN0aW9uKTtcblx0XHRcdFx0XHR0aGlzLnRpdGxlTGFiZWwudmFsdWUudXBkYXRlVGl0bGUodGhpcy50aXRsZSA/PyBDaGF0Vmlld1RpdGxlQ29udHJvbC5ERUZBVUxUX1RJVExFKTtcblxuXHRcdFx0XHRcdHJldHVybiB0aGlzLnRpdGxlTGFiZWwudmFsdWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH1cblx0XHR9KSk7XG5cblx0XHQvLyBBY3Rpb25zIHRvb2xiYXIgb24gdGhlIHJpZ2h0XG5cdFx0dGhpcy5hY3Rpb25zVG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGVsZW1lbnRzLmFjdGlvbnNUb29sYmFyLCBNZW51SWQuQ2hhdFZpZXdTZXNzaW9uVGl0bGVUb29sYmFyLCB7XG5cdFx0XHRtZW51T3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9LFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlXG5cdFx0fSkpO1xuXG5cdFx0Ly8gVGl0bGUgY29udHJvbHNcblx0XHR0aGlzLnRpdGxlQ29udGFpbmVyID0gZWxlbWVudHMucm9vdDtcblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldCh0aGlzLnRpdGxlQ29udGFpbmVyKSk7XG5cdFx0Zm9yIChjb25zdCBldmVudFR5cGUgb2YgW1RvdWNoRXZlbnRUeXBlLlRhcCwgRXZlbnRUeXBlLkNMSUNLXSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMudGl0bGVDb250YWluZXIsIGV2ZW50VHlwZSwgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmRlbGVnYXRlLmZvY3VzQ2hhdCgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHBhcmVudC5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlQ29udGFpbmVyKTtcblx0fVxuXG5cdHVwZGF0ZShtb2RlbDogSUNoYXRNb2RlbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMubW9kZWwgPSBtb2RlbDtcblxuXHRcdHRoaXMubW9kZWxEaXNwb3NhYmxlcy52YWx1ZSA9IG1vZGVsPy5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09ICdzZXRDdXN0b21UaXRsZScgfHwgZS5raW5kID09PSAnYWRkUmVxdWVzdCcpIHtcblx0XHRcdFx0dGhpcy5kb1VwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5kb1VwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1VwZGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBtYXJrZG93blRpdGxlID0gbmV3IE1hcmtkb3duU3RyaW5nKHRoaXMubW9kZWw/LnRpdGxlID8/ICcnKTtcblx0XHR0aGlzLnRpdGxlID0gcmVuZGVyQXNQbGFpbnRleHQobWFya2Rvd25UaXRsZSk7XG5cblx0XHR0aGlzLnVwZGF0ZVRpdGxlKHRoaXMudGl0bGUgPz8gQ2hhdFZpZXdUaXRsZUNvbnRyb2wuREVGQVVMVF9USVRMRSk7XG5cblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5tb2RlbCAmJiB7XG5cdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuQ2hhdFZpZXdDb250ZXh0LFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiB0aGlzLm1vZGVsLnNlc3Npb25SZXNvdXJjZVxuXHRcdH0gc2F0aXNmaWVzIElDaGF0Vmlld1RpdGxlQWN0aW9uQ29udGV4dDtcblxuXHRcdGlmICh0aGlzLm5hdmlnYXRpb25Ub29sYmFyKSB7XG5cdFx0XHR0aGlzLm5hdmlnYXRpb25Ub29sYmFyLmNvbnRleHQgPSBjb250ZXh0O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmFjdGlvbnNUb29sYmFyKSB7XG5cdFx0XHR0aGlzLmFjdGlvbnNUb29sYmFyLmNvbnRleHQgPSBjb250ZXh0O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGl0bGUodGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy50aXRsZUNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudGl0bGVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgndmlzaWJsZScsIHRoaXMuc2hvdWxkUmVuZGVyKCkpO1xuXHRcdHRoaXMudGl0bGVMYWJlbC52YWx1ZT8udXBkYXRlVGl0bGUodGl0bGUpO1xuXG5cdFx0Y29uc3QgY3VycmVudEhlaWdodCA9IHRoaXMuZ2V0SGVpZ2h0KCk7XG5cdFx0aWYgKGN1cnJlbnRIZWlnaHQgIT09IHRoaXMubGFzdEtub3duSGVpZ2h0KSB7XG5cdFx0XHR0aGlzLmxhc3RLbm93bkhlaWdodCA9IGN1cnJlbnRIZWlnaHQ7XG5cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFJlbmRlcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLm1vZGVsPy50aXRsZTsgLy8gd2UgbmVlZCBhIGNoYXQgc2hvd2luZyBhbmQgbm90IGJlaW5nIGVtcHR5XG5cdH1cblxuXHRnZXRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMudGl0bGVDb250YWluZXIgfHwgdGhpcy50aXRsZUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZScpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnRpdGxlQ29udGFpbmVyLm9mZnNldEhlaWdodDtcblx0fVxufVxuXG5jbGFzcyBDaGF0Vmlld1RpdGxlTGFiZWwgZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJpdmF0ZSB0aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgdGl0bGVMYWJlbDogSFRNTFNwYW5FbGVtZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9ucz86IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpIHtcblx0XHRzdXBlcihudWxsLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywgaWNvbjogZmFsc2UsIGxhYmVsOiB0cnVlIH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LXZpZXctdGl0bGUtYWN0aW9uLWl0ZW0nKTtcblx0XHR0aGlzLmxhYmVsPy5jbGFzc0xpc3QuYWRkKCdjaGF0LXZpZXctdGl0bGUtbGFiZWwtY29udGFpbmVyJyk7XG5cblx0XHR0aGlzLnRpdGxlTGFiZWwgPSB0aGlzLmxhYmVsPy5hcHBlbmRDaGlsZChoKCdzcGFuLmNoYXQtdmlldy10aXRsZS1sYWJlbCcpLnJvb3QpO1xuXG5cdFx0dGhpcy51cGRhdGVMYWJlbCgpO1xuXHR9XG5cblx0dXBkYXRlVGl0bGUodGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMudGl0bGUgPSB0aXRsZTtcblxuXHRcdHRoaXMudXBkYXRlTGFiZWwoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVMYWJlbCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudGl0bGVMYWJlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRpdGxlKSB7XG5cdFx0XHR0aGlzLnRpdGxlTGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLnRpdGxlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRpdGxlTGFiZWwudGV4dENvbnRlbnQgPSAnJztcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsdUJBQXVCLFdBQVcsU0FBUztBQUNwRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYSxzQkFBc0I7QUFDckQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBWSx5QkFBeUI7QUFDOUMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0IsNEJBQTRCO0FBQ3pELFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLDZCQUErQztBQUd4RCxTQUFTLHNCQUE4QztBQUV2RCxTQUFTLDJCQUEyQjtBQU03QixJQUFNLHVCQUFOLGNBQW1DLFdBQVc7QUFBQSxFQXFCcEQsWUFDa0IsV0FDQSxVQUN1QixzQkFDdkM7QUFDRCxVQUFNO0FBSlc7QUFDQTtBQUN1QjtBQW5CekMsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUN4RSxTQUFTLG9CQUFvQixLQUFLLG1CQUFtQjtBQUVyRCxTQUFRLFFBQTRCO0FBR3BDLFNBQVEsYUFBYSxLQUFLLFVBQVUsSUFBSSxrQkFBc0MsQ0FBQztBQUcvRSxTQUFRLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxrQkFB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
