import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import * as cssJs from "../../../../base/browser/cssValue.js";
import { Action } from "../../../../base/common/actions.js";
import { URI } from "../../../../base/common/uri.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
const _ToggleReactionsAction = class _ToggleReactionsAction extends Action {
  constructor(toggleDropdownMenu, title) {
    super(_ToggleReactionsAction.ID, title || nls.localize("pickReactions", "Pick Reactions..."), "toggle-reactions", true);
    this._menuActions = [];
    this.toggleDropdownMenu = toggleDropdownMenu;
  }
  run() {
    this.toggleDropdownMenu();
    return Promise.resolve(true);
  }
  get menuActions() {
    return this._menuActions;
  }
  set menuActions(actions) {
    this._menuActions = actions;
  }
};
_ToggleReactionsAction.ID = "toolbar.toggle.pickReactions";
let ToggleReactionsAction = _ToggleReactionsAction;
class ReactionActionViewItem extends ActionViewItem {
  constructor(action) {
    super(null, action, {});
  }
  updateLabel() {
    if (!this.label) {
      return;
    }
    const action = this.action;
    if (action.class) {
      this.label.classList.add(action.class);
    }
    if (!action.icon) {
      const reactionLabel = dom.append(this.label, dom.$("span.reaction-label"));
      reactionLabel.innerText = action.label;
    } else {
      const reactionIcon = dom.append(this.label, dom.$(".reaction-icon"));
      const uri = URI.revive(action.icon);
      reactionIcon.style.backgroundImage = cssJs.asCSSUrl(uri);
    }
    if (action.count) {
      const reactionCount = dom.append(this.label, dom.$("span.reaction-count"));
      reactionCount.innerText = `${action.count}`;
    }
  }
  getTooltip() {
    const action = this.action;
    const toggleMessage = action.enabled ? nls.localize("comment.toggleableReaction", "Toggle reaction, ") : "";
    if (action.count === void 0) {
      return nls.localize({
        key: "comment.reactionLabelNone",
        comment: [
          "This is a tooltip for an emoji button so that the current user can toggle their reaction to a comment.",
          `The first arg is localized message "Toggle reaction" or empty if the user doesn't have permission to toggle the reaction, the second is the name of the reaction.`
        ]
      }, "{0}{1} reaction", toggleMessage, action.label);
    } else if (action.reactors === void 0 || action.reactors.length === 0) {
      if (action.count === 1) {
        return nls.localize({
          key: "comment.reactionLabelOne",
          comment: [
            'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is 1.',
            "The emoji is also a button so that the current user can also toggle their own emoji reaction.",
            `The first arg is localized message "Toggle reaction" or empty if the user doesn't have permission to toggle the reaction, the second is the name of the reaction.`
          ]
        }, "{0}1 reaction with {1}", toggleMessage, action.label);
      } else if (action.count > 1) {
        return nls.localize({
          key: "comment.reactionLabelMany",
          comment: [
            'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is greater than 1.',
            "The emoji is also a button so that the current user can also toggle their own emoji reaction.",
            `The first arg is localized message "Toggle reaction" or empty if the user doesn't have permission to toggle the reaction, the second is number of users who have reacted with that reaction, and the third is the name of the reaction.`
          ]
        }, "{0}{1} reactions with {2}", toggleMessage, action.count, action.label);
      }
    } else {
      if (action.reactors.length <= 10 && action.reactors.length === action.count) {
        return nls.localize({
          key: "comment.reactionLessThanTen",
          comment: [
            'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is less than or equal to 10.',
            "The emoji is also a button so that the current user can also toggle their own emoji reaction.",
            `The first arg is localized message "Toggle reaction" or empty if the user doesn't have permission to toggle the reaction, the second iis a list of the reactors, and the third is the name of the reaction.`
          ]
        }, "{0}{1} reacted with {2}", toggleMessage, action.reactors.join(", "), action.label);
      } else if (action.count > 1) {
        const displayedReactors = action.reactors.slice(0, 10);
        return nls.localize({
          key: "comment.reactionMoreThanTen",
          comment: [
            'This is a tooltip for an emoji that is a "reaction" to a comment where the count of the reactions is less than or equal to 10.',
            "The emoji is also a button so that the current user can also toggle their own emoji reaction.",
            `The first arg is localized message "Toggle reaction" or empty if the user doesn't have permission to toggle the reaction, the second iis a list of the reactors, and the third is the name of the reaction.`
          ]
        }, "{0}{1} and {2} more reacted with {3}", toggleMessage, displayedReactors.join(", "), action.count - displayedReactors.length, action.label);
      }
    }
    return void 0;
  }
}
const _ReactionAction = class _ReactionAction extends Action {
  constructor(id, label = "", cssClass = "", enabled = true, actionCallback, reactors, icon, count) {
    super(_ReactionAction.ID, label, cssClass, enabled, actionCallback);
    this.reactors = reactors;
    this.icon = icon;
    this.count = count;
  }
};
_ReactionAction.ID = "toolbar.toggle.reaction";
let ReactionAction = _ReactionAction;
export {
  ReactionAction,
  ReactionActionViewItem,
  ToggleReactionsAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvcmVhY3Rpb25zQWN0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBjc3NKcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvY3NzVmFsdWUuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVSZWFjdGlvbnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAndG9vbGJhci50b2dnbGUucGlja1JlYWN0aW9ucyc7XG5cdHByaXZhdGUgX21lbnVBY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0cHJpdmF0ZSB0b2dnbGVEcm9wZG93bk1lbnU6ICgpID0+IHZvaWQ7XG5cdGNvbnN0cnVjdG9yKHRvZ2dsZURyb3Bkb3duTWVudTogKCkgPT4gdm9pZCwgdGl0bGU/OiBzdHJpbmcpIHtcblx0XHRzdXBlcihUb2dnbGVSZWFjdGlvbnNBY3Rpb24uSUQsIHRpdGxlIHx8IG5scy5sb2NhbGl6ZSgncGlja1JlYWN0aW9ucycsIFwiUGljayBSZWFjdGlvbnMuLi5cIiksICd0b2dnbGUtcmVhY3Rpb25zJywgdHJ1ZSk7XG5cdFx0dGhpcy50b2dnbGVEcm9wZG93bk1lbnUgPSB0b2dnbGVEcm9wZG93bk1lbnU7XG5cdH1cblx0b3ZlcnJpZGUgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0dGhpcy50b2dnbGVEcm9wZG93bk1lbnUoKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHR9XG5cdGdldCBtZW51QWN0aW9ucygpIHtcblx0XHRyZXR1cm4gdGhpcy5fbWVudUFjdGlvbnM7XG5cdH1cblx0c2V0IG1lbnVBY3Rpb25zKGFjdGlvbnM6IElBY3Rpb25bXSkge1xuXHRcdHRoaXMuX21lbnVBY3Rpb25zID0gYWN0aW9ucztcblx0fVxufVxuZXhwb3J0IGNsYXNzIFJlYWN0aW9uQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cdGNvbnN0cnVjdG9yKGFjdGlvbjogUmVhY3Rpb25BY3Rpb24pIHtcblx0XHRzdXBlcihudWxsLCBhY3Rpb24sIHt9KTtcblx0fVxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmxhYmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aW9uID0gdGhpcy5hY3Rpb24gYXMgUmVhY3Rpb25BY3Rpb247XG5cdFx0aWYgKGFjdGlvbi5jbGFzcykge1xuXHRcdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QuYWRkKGFjdGlvbi5jbGFzcyk7XG5cdFx0fVxuXHRcdGlmICghYWN0aW9uLmljb24pIHtcblx0XHRcdGNvbnN0IHJlYWN0aW9uTGFiZWwgPSBkb20uYXBwZW5kKHRoaXMubGFiZWwsIGRvbS4kKCdzcGFuLnJlYWN0aW9uLWxhYmVsJykpO1xuXHRcdFx0cmVhY3Rpb25MYWJlbC5pbm5lclRleHQgPSBhY3Rpb24ubGFiZWw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJlYWN0aW9uSWNvbiA9IGRvbS5hcHBlbmQodGhpcy5sYWJlbCwgZG9tLiQoJy5yZWFjdGlvbi1pY29uJykpO1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShhY3Rpb24uaWNvbik7XG5cdFx0XHRyZWFjdGlvbkljb24uc3R5bGUuYmFja2dyb3VuZEltYWdlID0gY3NzSnMuYXNDU1NVcmwodXJpKTtcblx0XHR9XG5cdFx0aWYgKGFjdGlvbi5jb3VudCkge1xuXHRcdFx0Y29uc3QgcmVhY3Rpb25Db3VudCA9IGRvbS5hcHBlbmQodGhpcy5sYWJlbCwgZG9tLiQoJ3NwYW4ucmVhY3Rpb24tY291bnQnKSk7XG5cdFx0XHRyZWFjdGlvbkNvdW50LmlubmVyVGV4dCA9IGAke2FjdGlvbi5jb3VudH1gO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRUb29sdGlwKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWN0aW9uID0gdGhpcy5hY3Rpb24gYXMgUmVhY3Rpb25BY3Rpb247XG5cdFx0Y29uc3QgdG9nZ2xlTWVzc2FnZSA9IGFjdGlvbi5lbmFibGVkID8gbmxzLmxvY2FsaXplKCdjb21tZW50LnRvZ2dsZWFibGVSZWFjdGlvbicsIFwiVG9nZ2xlIHJlYWN0aW9uLCBcIikgOiAnJztcblxuXHRcdGlmIChhY3Rpb24uY291bnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdGtleTogJ2NvbW1lbnQucmVhY3Rpb25MYWJlbE5vbmUnLCBjb21tZW50OiBbXG5cdFx0XHRcdFx0J1RoaXMgaXMgYSB0b29sdGlwIGZvciBhbiBlbW9qaSBidXR0b24gc28gdGhhdCB0aGUgY3VycmVudCB1c2VyIGNhbiB0b2dnbGUgdGhlaXIgcmVhY3Rpb24gdG8gYSBjb21tZW50LicsXG5cdFx0XHRcdFx0J1RoZSBmaXJzdCBhcmcgaXMgbG9jYWxpemVkIG1lc3NhZ2UgXCJUb2dnbGUgcmVhY3Rpb25cIiBvciBlbXB0eSBpZiB0aGUgdXNlciBkb2VzblxcJ3QgaGF2ZSBwZXJtaXNzaW9uIHRvIHRvZ2dsZSB0aGUgcmVhY3Rpb24sIHRoZSBzZWNvbmQgaXMgdGhlIG5hbWUgb2YgdGhlIHJlYWN0aW9uLiddXG5cdFx0XHR9LCBcInswfXsxfSByZWFjdGlvblwiLCB0b2dnbGVNZXNzYWdlLCBhY3Rpb24ubGFiZWwpO1xuXHRcdH0gZWxzZSBpZiAoYWN0aW9uLnJlYWN0b3JzID09PSB1bmRlZmluZWQgfHwgYWN0aW9uLnJlYWN0b3JzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0aWYgKGFjdGlvbi5jb3VudCA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRrZXk6ICdjb21tZW50LnJlYWN0aW9uTGFiZWxPbmUnLCBjb21tZW50OiBbXG5cdFx0XHRcdFx0XHQnVGhpcyBpcyBhIHRvb2x0aXAgZm9yIGFuIGVtb2ppIHRoYXQgaXMgYSBcInJlYWN0aW9uXCIgdG8gYSBjb21tZW50IHdoZXJlIHRoZSBjb3VudCBvZiB0aGUgcmVhY3Rpb25zIGlzIDEuJyxcblx0XHRcdFx0XHRcdCdUaGUgZW1vamkgaXMgYWxzbyBhIGJ1dHRvbiBzbyB0aGF0IHRoZSBjdXJyZW50IHVzZXIgY2FuIGFsc28gdG9nZ2xlIHRoZWlyIG93biBlbW9qaSByZWFjdGlvbi4nLFxuXHRcdFx0XHRcdFx0J1RoZSBmaXJzdCBhcmcgaXMgbG9jYWxpemVkIG1lc3NhZ2UgXCJUb2dnbGUgcmVhY3Rpb25cIiBvciBlbXB0eSBpZiB0aGUgdXNlciBkb2VzblxcJ3QgaGF2ZSBwZXJtaXNzaW9uIHRvIHRvZ2dsZSB0aGUgcmVhY3Rpb24sIHRoZSBzZWNvbmQgaXMgdGhlIG5hbWUgb2YgdGhlIHJlYWN0aW9uLiddXG5cdFx0XHRcdH0sIFwiezB9MSByZWFjdGlvbiB3aXRoIHsxfVwiLCB0b2dnbGVNZXNzYWdlLCBhY3Rpb24ubGFiZWwpO1xuXHRcdFx0fSBlbHNlIGlmIChhY3Rpb24uY291bnQgPiAxKSB7XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoe1xuXHRcdFx0XHRcdGtleTogJ2NvbW1lbnQucmVhY3Rpb25MYWJlbE1hbnknLCBjb21tZW50OiBbXG5cdFx0XHRcdFx0XHQnVGhpcyBpcyBhIHRvb2x0aXAgZm9yIGFuIGVtb2ppIHRoYXQgaXMgYSBcInJlYWN0aW9uXCIgdG8gYSBjb21tZW50IHdoZXJlIHRoZSBjb3VudCBvZiB0aGUgcmVhY3Rpb25zIGlzIGdyZWF0ZXIgdGhhbiAxLicsXG5cdFx0XHRcdFx0XHQnVGhlIGVtb2ppIGlzIGFsc28gYSBidXR0b24gc28gdGhhdCB0aGUgY3VycmVudCB1c2VyIGNhbiBhbHNvIHRvZ2dsZSB0aGVpciBvd24gZW1vamkgcmVhY3Rpb24uJyxcblx0XHRcdFx0XHRcdCdUaGUgZmlyc3QgYXJnIGlzIGxvY2FsaXplZCBtZXNzYWdlIFwiVG9nZ2xlIHJlYWN0aW9uXCIgb3IgZW1wdHkgaWYgdGhlIHVzZXIgZG9lc25cXCd0IGhhdmUgcGVybWlzc2lvbiB0byB0b2dnbGUgdGhlIHJlYWN0aW9uLCB0aGUgc2Vjb25kIGlzIG51bWJlciBvZiB1c2VycyB3aG8gaGF2ZSByZWFjdGVkIHdpdGggdGhhdCByZWFjdGlvbiwgYW5kIHRoZSB0aGlyZCBpcyB0aGUgbmFtZSBvZiB0aGUgcmVhY3Rpb24uJ11cblx0XHRcdFx0fSwgXCJ7MH17MX0gcmVhY3Rpb25zIHdpdGggezJ9XCIsIHRvZ2dsZU1lc3NhZ2UsIGFjdGlvbi5jb3VudCwgYWN0aW9uLmxhYmVsKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGFjdGlvbi5yZWFjdG9ycy5sZW5ndGggPD0gMTAgJiYgYWN0aW9uLnJlYWN0b3JzLmxlbmd0aCA9PT0gYWN0aW9uLmNvdW50KSB7XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoe1xuXHRcdFx0XHRcdGtleTogJ2NvbW1lbnQucmVhY3Rpb25MZXNzVGhhblRlbicsIGNvbW1lbnQ6IFtcblx0XHRcdFx0XHRcdCdUaGlzIGlzIGEgdG9vbHRpcCBmb3IgYW4gZW1vamkgdGhhdCBpcyBhIFwicmVhY3Rpb25cIiB0byBhIGNvbW1lbnQgd2hlcmUgdGhlIGNvdW50IG9mIHRoZSByZWFjdGlvbnMgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIDEwLicsXG5cdFx0XHRcdFx0XHQnVGhlIGVtb2ppIGlzIGFsc28gYSBidXR0b24gc28gdGhhdCB0aGUgY3VycmVudCB1c2VyIGNhbiBhbHNvIHRvZ2dsZSB0aGVpciBvd24gZW1vamkgcmVhY3Rpb24uJyxcblx0XHRcdFx0XHRcdCdUaGUgZmlyc3QgYXJnIGlzIGxvY2FsaXplZCBtZXNzYWdlIFwiVG9nZ2xlIHJlYWN0aW9uXCIgb3IgZW1wdHkgaWYgdGhlIHVzZXIgZG9lc25cXCd0IGhhdmUgcGVybWlzc2lvbiB0byB0b2dnbGUgdGhlIHJlYWN0aW9uLCB0aGUgc2Vjb25kIGlpcyBhIGxpc3Qgb2YgdGhlIHJlYWN0b3JzLCBhbmQgdGhlIHRoaXJkIGlzIHRoZSBuYW1lIG9mIHRoZSByZWFjdGlvbi4nXVxuXHRcdFx0XHR9LCBcInswfXsxfSByZWFjdGVkIHdpdGggezJ9XCIsIHRvZ2dsZU1lc3NhZ2UsIGFjdGlvbi5yZWFjdG9ycy5qb2luKCcsICcpLCBhY3Rpb24ubGFiZWwpO1xuXHRcdFx0fSBlbHNlIGlmIChhY3Rpb24uY291bnQgPiAxKSB7XG5cdFx0XHRcdGNvbnN0IGRpc3BsYXllZFJlYWN0b3JzID0gYWN0aW9uLnJlYWN0b3JzLnNsaWNlKDAsIDEwKTtcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdFx0a2V5OiAnY29tbWVudC5yZWFjdGlvbk1vcmVUaGFuVGVuJywgY29tbWVudDogW1xuXHRcdFx0XHRcdFx0J1RoaXMgaXMgYSB0b29sdGlwIGZvciBhbiBlbW9qaSB0aGF0IGlzIGEgXCJyZWFjdGlvblwiIHRvIGEgY29tbWVudCB3aGVyZSB0aGUgY291bnQgb2YgdGhlIHJlYWN0aW9ucyBpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gMTAuJyxcblx0XHRcdFx0XHRcdCdUaGUgZW1vamkgaXMgYWxzbyBhIGJ1dHRvbiBzbyB0aGF0IHRoZSBjdXJyZW50IHVzZXIgY2FuIGFsc28gdG9nZ2xlIHRoZWlyIG93biBlbW9qaSByZWFjdGlvbi4nLFxuXHRcdFx0XHRcdFx0J1RoZSBmaXJzdCBhcmcgaXMgbG9jYWxpemVkIG1lc3NhZ2UgXCJUb2dnbGUgcmVhY3Rpb25cIiBvciBlbXB0eSBpZiB0aGUgdXNlciBkb2VzblxcJ3QgaGF2ZSBwZXJtaXNzaW9uIHRvIHRvZ2dsZSB0aGUgcmVhY3Rpb24sIHRoZSBzZWNvbmQgaWlzIGEgbGlzdCBvZiB0aGUgcmVhY3RvcnMsIGFuZCB0aGUgdGhpcmQgaXMgdGhlIG5hbWUgb2YgdGhlIHJlYWN0aW9uLiddXG5cdFx0XHRcdH0sIFwiezB9ezF9IGFuZCB7Mn0gbW9yZSByZWFjdGVkIHdpdGggezN9XCIsIHRvZ2dsZU1lc3NhZ2UsIGRpc3BsYXllZFJlYWN0b3JzLmpvaW4oJywgJyksIGFjdGlvbi5jb3VudCAtIGRpc3BsYXllZFJlYWN0b3JzLmxlbmd0aCwgYWN0aW9uLmxhYmVsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuZXhwb3J0IGNsYXNzIFJlYWN0aW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3Rvb2xiYXIudG9nZ2xlLnJlYWN0aW9uJztcblx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZyA9ICcnLCBjc3NDbGFzczogc3RyaW5nID0gJycsIGVuYWJsZWQ6IGJvb2xlYW4gPSB0cnVlLCBhY3Rpb25DYWxsYmFjaz86IChldmVudD86IGFueSkgPT4gUHJvbWlzZTxhbnk+LCBwdWJsaWMgcmVhZG9ubHkgcmVhY3RvcnM/OiByZWFkb25seSBzdHJpbmdbXSwgcHVibGljIGljb24/OiBVcmlDb21wb25lbnRzLCBwdWJsaWMgY291bnQ/OiBudW1iZXIpIHtcblx0XHRzdXBlcihSZWFjdGlvbkFjdGlvbi5JRCwgbGFiZWwsIGNzc0NsYXNzLCBlbmFibGVkLCBhY3Rpb25DYWxsYmFjayk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFNBQVM7QUFDckIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsY0FBdUI7QUFDaEMsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUV4QixNQUFNLHlCQUFOLE1BQU0sK0JBQThCLE9BQU87QUFBQSxFQUlqRCxZQUFZLG9CQUFnQyxPQUFnQjtBQUMzRCxVQUFNLHVCQUFzQixJQUFJLFNBQVMsSUFBSSxTQUFTLGlCQUFpQixtQkFBbUIsR0FBRyxvQkFBb0IsSUFBSTtBQUh0SCxTQUFRLGVBQTBCLENBQUM7QUFJbEMsU0FBSyxxQkFBcUI7QUFBQSxFQUMzQjtBQUFBLEVBQ1MsTUFBb0I7QUFDNUIsU0FBSyxtQkFBbUI7QUFDeEIsV0FBTyxRQUFRLFFBQVEsSUFBSTtBQUFBLEVBQzVCO0FBQUEsRUFDQSxJQUFJLGNBQWM7QUFDakIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBQ0EsSUFBSSxZQUFZLFNBQW9CO0FBQ25DLFNBQUssZUFBZTtBQUFBLEVBQ3JCO0FBQ0Q7QUFsQmEsdUJBQ0ksS0FBSztBQURmLElBQU0sd0JBQU47QUFtQkEsTUFBTSwrQkFBK0IsZUFBZTtBQUFBLEVBQzFELFlBQVksUUFBd0I7QUFDbkMsVUFBTSxNQUFNLFFBQVEsQ0FBQyxDQUFDO0FBQUEsRUFDdkI7QUFBQSxFQUNtQixjQUFvQjtBQUN0QyxRQUFJLENBQUMsS0FBSyxPQUFPO0FBQ2hCO0FBQUEsSUFDRDtBQUVBLFVBQU0sU0FBUyxLQUFLO0FBQ3BCLFFBQUksT0FBTyxPQUFPO0FBQ2pCLFdBQUssTUFBTSxVQUFVLElBQUksT0FBTyxLQUFLO0FBQUEsSUFDdEM7QUFDQSxRQUFJLENBQUMsT0FBTyxNQUFNO0FBQ2pCLFlBQU0sZ0JBQWdCLElBQUksT0FBTyxLQUFLLE9BQU8sSUFBSSxFQUFFLHFCQUFxQixDQUFDO0FBQ3pFLG9CQUFjLFlBQVksT0FBTztBQUFBLElBQ2xDLE9BQU87QUFDTixZQUFNLGVBQWUsSUFBSSxPQUFPLEtBQUssT0FBTyxJQUFJLEVBQUUsZ0JBQWdCLENBQUM7QUFDbkUsWUFBTSxNQUFNLElBQUksT0FBTyxPQUFPLElBQUk7QUFDbEMsbUJBQWEsTUFBTSxrQkFBa0IsTUFBTSxTQUFTLEdBQUc7QUFBQSxJQUN4RDtBQUNBLFFBQUksT0FBTyxPQUFPO0FBQ2pCLFlBQU0sZ0JBQWdCLElBQUksT0FBTyxLQUFLLE9BQU8sSUFBSSxFQUFFLHFCQUFxQixDQUFDO0FBQ3pFLG9CQUFjLFlBQVksR0FBRyxPQUFPLEtBQUs7QUFBQSxJQUMxQztBQUFBLEVBQ0Q7QUFBQSxFQUVtQixhQUFpQztBQUNuRCxVQUFNLFNBQVMsS0FBSztBQUNwQixVQUFNLGdCQUFnQixPQUFPLFVBQVUsSUFBSSxTQUFTLDhCQUE4QixtQkFBbUIsSUFBSTtBQUV6RyxRQUFJLE9BQU8sVUFBVSxRQUFXO0FBQy9CLGFBQU8sSUFBSSxTQUFTO0FBQUEsUUFDbkIsS0FBSztBQUFBLFFBQTZCLFNBQVM7QUFBQSxVQUMxQztBQUFBLFVBQ0E7QUFBQSxRQUFvSztBQUFBLE1BQ3RLLEdBQUcsbUJBQW1CLGVBQWUsT0FBTyxLQUFLO0FBQUEsSUFDbEQsV0FBVyxPQUFPLGFBQWEsVUFBYSxPQUFPLFNBQVMsV0FBVyxHQUFHO0FBQ3pFLFVBQUksT0FBTyxVQUFVLEdBQUc7QUFDdkIsZUFBTyxJQUFJLFNBQVM7QUFBQSxVQUNuQixLQUFLO0FBQUEsVUFBNEIsU0FBUztBQUFBLFlBQ3pDO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUFvSztBQUFBLFFBQ3RLLEdBQUcsMEJBQTBCLGVBQWUsT0FBTyxLQUFLO0FBQUEsTUFDekQsV0FBVyxPQUFPLFFBQVEsR0FBRztBQUM1QixlQUFPLElBQUksU0FBUztBQUFBLFVBQ25CLEtBQUs7QUFBQSxVQUE2QixTQUFTO0FBQUEsWUFDMUM7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQTBPO0FBQUEsUUFDNU8sR0FBRyw2QkFBNkIsZUFBZSxPQUFPLE9BQU8sT0FBTyxLQUFLO0FBQUEsTUFDMUU7QUFBQSxJQUNELE9BQU87QUFDTixVQUFJLE9BQU8sU0FBUyxVQUFVLE1BQU0sT0FBTyxTQUFTLFdBQVcsT0FBTyxPQUFPO0FBQzVFLGVBQU8sSUFBSSxTQUFTO0FBQUEsVUFDbkIsS0FBSztBQUFBLFVBQStCLFNBQVM7QUFBQSxZQUM1QztBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFBOE07QUFBQSxRQUNoTixHQUFHLDJCQUEyQixlQUFlLE9BQU8sU0FBUyxLQUFLLElBQUksR0FBRyxPQUFPLEtBQUs7QUFBQSxNQUN0RixXQUFXLE9BQU8sUUFBUSxHQUFHO0FBQzVCLGNBQU0sb0JBQW9CLE9BQU8sU0FBUyxNQUFNLEdBQUcsRUFBRTtBQUNyRCxlQUFPLElBQUksU0FBUztBQUFBLFVBQ25CLEtBQUs7QUFBQSxVQUErQixTQUFTO0FBQUEsWUFDNUM7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQThNO0FBQUEsUUFDaE4sR0FBRyx3Q0FBd0MsZUFBZSxrQkFBa0IsS0FBSyxJQUFJLEdBQUcsT0FBTyxRQUFRLGtCQUFrQixRQUFRLE9BQU8sS0FBSztBQUFBLE1BQzlJO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFDTyxNQUFNLGtCQUFOLE1BQU0sd0JBQXVCLE9BQU87QUFBQSxFQUUxQyxZQUFZLElBQVksUUFBZ0IsSUFBSSxXQUFtQixJQUFJLFVBQW1CLE1BQU0sZ0JBQWdFLFVBQXFDLE1BQTZCLE9BQWdCO0FBQzdPLFVBQU0sZ0JBQWUsSUFBSSxPQUFPLFVBQVUsU0FBUyxjQUFjO0FBRDBGO0FBQXFDO0FBQTZCO0FBQUEsRUFFOU47QUFDRDtBQUxhLGdCQUNJLEtBQUs7QUFEZixJQUFNLGlCQUFOOyIsCiAgIm5hbWVzIjogW10KfQo=
