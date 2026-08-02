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
import "./media/editorHoverWrapper.css";
import * as dom from "../../../../../../../base/browser/dom.js";
import { HoverAction } from "../../../../../../../base/browser/ui/hover/hoverWidget.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
const $ = dom.$;
const h = dom.h;
let ChatEditorHoverWrapper = class {
  constructor(hoverContentElement, actions, keybindingService) {
    this.keybindingService = keybindingService;
    const hoverElement = h(
      ".chat-editor-hover-wrapper@root",
      [h(".chat-editor-hover-wrapper-content@content")]
    );
    this.domNode = hoverElement.root;
    hoverElement.content.appendChild(hoverContentElement);
    if (actions && actions.length > 0) {
      const statusBarElement = $(".hover-row.status-bar");
      const actionsElement = $(".actions");
      actions.forEach((action) => {
        const keybinding = this.keybindingService.lookupKeybinding(action.commandId);
        const keybindingLabel = keybinding ? keybinding.getLabel() : null;
        HoverAction.render(actionsElement, {
          label: action.label,
          commandId: action.commandId,
          run: (e) => {
            action.run(e);
          },
          iconClass: action.iconClass
        }, keybindingLabel);
      });
      statusBarElement.appendChild(actionsElement);
      this.domNode.appendChild(statusBarElement);
    }
  }
};
ChatEditorHoverWrapper = __decorateClass([
  __decorateParam(2, IKeybindingService)
], ChatEditorHoverWrapper);
export {
  ChatEditorHoverWrapper
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvZWRpdG9yL2VkaXRvckhvdmVyV3JhcHBlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9lZGl0b3JIb3ZlcldyYXBwZXIuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElIb3ZlckFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBIb3ZlckFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuY29uc3QgaCA9IGRvbS5oO1xuXG4vKipcbiAqIFRoaXMgYm9ycm93cyBzb21lIG9mIEhvdmVyV2lkZ2V0IHNvIHRoYXQgYSBjaGF0IGVkaXRvciBob3ZlciBjYW4gYmUgcmVuZGVyZWQgaW4gdGhlIHNhbWUgd2F5IGFzIGEgd29ya2JlbmNoIGhvdmVyLlxuICogTWF5YmUgaXQgY2FuIGJlIHJldXNhYmxlIGluIGEgZ2VuZXJpYyB3YXkuXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0RWRpdG9ySG92ZXJXcmFwcGVyIHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGhvdmVyQ29udGVudEVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdGFjdGlvbnM6IElIb3ZlckFjdGlvbltdIHwgdW5kZWZpbmVkLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBob3ZlckVsZW1lbnQgPSBoKFxuXHRcdFx0Jy5jaGF0LWVkaXRvci1ob3Zlci13cmFwcGVyQHJvb3QnLFxuXHRcdFx0W2goJy5jaGF0LWVkaXRvci1ob3Zlci13cmFwcGVyLWNvbnRlbnRAY29udGVudCcpXSk7XG5cdFx0dGhpcy5kb21Ob2RlID0gaG92ZXJFbGVtZW50LnJvb3Q7XG5cdFx0aG92ZXJFbGVtZW50LmNvbnRlbnQuYXBwZW5kQ2hpbGQoaG92ZXJDb250ZW50RWxlbWVudCk7XG5cblx0XHRpZiAoYWN0aW9ucyAmJiBhY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHN0YXR1c0JhckVsZW1lbnQgPSAkKCcuaG92ZXItcm93LnN0YXR1cy1iYXInKTtcblx0XHRcdGNvbnN0IGFjdGlvbnNFbGVtZW50ID0gJCgnLmFjdGlvbnMnKTtcblx0XHRcdGFjdGlvbnMuZm9yRWFjaChhY3Rpb24gPT4ge1xuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5jb21tYW5kSWQpO1xuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5nTGFiZWwgPSBrZXliaW5kaW5nID8ga2V5YmluZGluZy5nZXRMYWJlbCgpIDogbnVsbDtcblx0XHRcdFx0SG92ZXJBY3Rpb24ucmVuZGVyKGFjdGlvbnNFbGVtZW50LCB7XG5cdFx0XHRcdFx0bGFiZWw6IGFjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRjb21tYW5kSWQ6IGFjdGlvbi5jb21tYW5kSWQsXG5cdFx0XHRcdFx0cnVuOiBlID0+IHtcblx0XHRcdFx0XHRcdGFjdGlvbi5ydW4oZSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRpY29uQ2xhc3M6IGFjdGlvbi5pY29uQ2xhc3Ncblx0XHRcdFx0fSwga2V5YmluZGluZ0xhYmVsKTtcblx0XHRcdH0pO1xuXHRcdFx0c3RhdHVzQmFyRWxlbWVudC5hcHBlbmRDaGlsZChhY3Rpb25zRWxlbWVudCk7XG5cdFx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQoc3RhdHVzQmFyRWxlbWVudCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFFckIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywwQkFBMEI7QUFFbkMsTUFBTSxJQUFJLElBQUk7QUFDZCxNQUFNLElBQUksSUFBSTtBQU1QLElBQU0seUJBQU4sTUFBNkI7QUFBQSxFQUduQyxZQUNDLHFCQUNBLFNBQ3FDLG1CQUNwQztBQURvQztBQUVyQyxVQUFNLGVBQWU7QUFBQSxNQUNwQjtBQUFBLE1BQ0EsQ0FBQyxFQUFFLDRDQUE0QyxDQUFDO0FBQUEsSUFBQztBQUNsRCxTQUFLLFVBQVUsYUFBYTtBQUM1QixpQkFBYSxRQUFRLFlBQVksbUJBQW1CO0FBRXBELFFBQUksV0FBVyxRQUFRLFNBQVMsR0FBRztBQUNsQyxZQUFNLG1CQUFtQixFQUFFLHVCQUF1QjtBQUNsRCxZQUFNLGlCQUFpQixFQUFFLFVBQVU7QUFDbkMsY0FBUSxRQUFRLFlBQVU7QUFDekIsY0FBTSxhQUFhLEtBQUssa0JBQWtCLGlCQUFpQixPQUFPLFNBQVM7QUFDM0UsY0FBTSxrQkFBa0IsYUFBYSxXQUFXLFNBQVMsSUFBSTtBQUM3RCxvQkFBWSxPQUFPLGdCQUFnQjtBQUFBLFVBQ2xDLE9BQU8sT0FBTztBQUFBLFVBQ2QsV0FBVyxPQUFPO0FBQUEsVUFDbEIsS0FBSyxPQUFLO0FBQ1QsbUJBQU8sSUFBSSxDQUFDO0FBQUEsVUFDYjtBQUFBLFVBQ0EsV0FBVyxPQUFPO0FBQUEsUUFDbkIsR0FBRyxlQUFlO0FBQUEsTUFDbkIsQ0FBQztBQUNELHVCQUFpQixZQUFZLGNBQWM7QUFDM0MsV0FBSyxRQUFRLFlBQVksZ0JBQWdCO0FBQUEsSUFDMUM7QUFBQSxFQUNEO0FBQ0Q7QUFqQ2EseUJBQU47QUFBQSxFQU1KO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFtdCn0K
