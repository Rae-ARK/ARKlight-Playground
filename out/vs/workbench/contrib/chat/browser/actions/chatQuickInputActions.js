import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { Selection } from "../../../../../editor/common/core/selection.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { CHAT_CATEGORY } from "./chatActions.js";
import { IQuickChatService } from "../chat.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
const ASK_QUICK_QUESTION_ACTION_ID = "workbench.action.quickchat.toggle";
function registerQuickChatActions() {
  registerAction2(QuickChatGlobalAction);
  registerAction2(AskQuickChatAction);
  registerAction2(class OpenInChatViewAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.quickchat.openInChatView",
        title: localize2("chat.openInChatView.label", "Open in Chat View"),
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.chatSparkle,
        menu: {
          id: MenuId.ChatInputSide,
          group: "navigation",
          order: 10
        }
      });
    }
    run(accessor) {
      const quickChatService = accessor.get(IQuickChatService);
      quickChatService.openInChatView();
    }
  });
  registerAction2(class CloseQuickChatAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.quickchat.close",
        title: localize2("chat.closeQuickChat.label", "Close Quick Chat"),
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.close,
        menu: {
          id: MenuId.ChatInputSide,
          group: "navigation",
          order: 20
        }
      });
    }
    run(accessor) {
      const quickChatService = accessor.get(IQuickChatService);
      quickChatService.close();
    }
  });
}
class QuickChatGlobalAction extends Action2 {
  constructor() {
    super({
      id: ASK_QUICK_QUESTION_ACTION_ID,
      title: localize2("quickChat", "Open Quick Chat"),
      precondition: ChatContextKeys.enabled,
      icon: Codicon.chatSparkle,
      f1: false,
      category: CHAT_CATEGORY,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyL
      },
      menu: {
        id: MenuId.ChatTitleBarMenu,
        group: "a_open",
        order: 4
      },
      metadata: {
        description: localize("toggle.desc", "Toggle the quick chat"),
        args: [{
          name: "args",
          schema: {
            anyOf: [
              {
                type: "object",
                required: ["query"],
                properties: {
                  query: {
                    description: localize("toggle.query", "The query to open the quick chat with"),
                    type: "string"
                  },
                  isPartialQuery: {
                    description: localize("toggle.isPartialQuery", "Whether the query is partial; it will wait for more user input"),
                    type: "boolean"
                  }
                }
              },
              {
                type: "string",
                description: localize("toggle.query", "The query to open the quick chat with")
              }
            ]
          }
        }]
      }
    });
  }
  run(accessor, query) {
    const quickChatService = accessor.get(IQuickChatService);
    let options;
    switch (typeof query) {
      case "string":
        options = { query };
        break;
      case "object":
        options = query;
        break;
    }
    if (options?.query) {
      options.selection = new Selection(1, options.query.length + 1, 1, options.query.length + 1);
    }
    quickChatService.toggle(options);
  }
}
class AskQuickChatAction extends Action2 {
  constructor() {
    super({
      id: `workbench.action.openQuickChat`,
      category: CHAT_CATEGORY,
      title: localize2("interactiveSession.open", "Open Quick Chat"),
      precondition: ChatContextKeys.enabled,
      f1: true
    });
  }
  run(accessor, query) {
    const quickChatService = accessor.get(IQuickChatService);
    quickChatService.toggle(query ? {
      query,
      selection: new Selection(1, query.length + 1, 1, query.length + 1)
    } : void 0);
  }
}
export {
  ASK_QUICK_QUESTION_ACTION_ID,
  registerQuickChatActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRRdWlja0lucHV0QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENIQVRfQ0FURUdPUlkgfSBmcm9tICcuL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElRdWlja0NoYXRPcGVuT3B0aW9ucywgSVF1aWNrQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5cbmV4cG9ydCBjb25zdCBBU0tfUVVJQ0tfUVVFU1RJT05fQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24ucXVpY2tjaGF0LnRvZ2dsZSc7XG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJRdWlja0NoYXRBY3Rpb25zKCkge1xuXHRyZWdpc3RlckFjdGlvbjIoUXVpY2tDaGF0R2xvYmFsQWN0aW9uKTtcblx0cmVnaXN0ZXJBY3Rpb24yKEFza1F1aWNrQ2hhdEFjdGlvbik7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE9wZW5JbkNoYXRWaWV3QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5xdWlja2NoYXQub3BlbkluQ2hhdFZpZXcnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0Lm9wZW5JbkNoYXRWaWV3LmxhYmVsJywgXCJPcGVuIGluIENoYXQgVmlld1wiKSxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5jaGF0U3BhcmtsZSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0U2lkZSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAxMFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdGNvbnN0IHF1aWNrQ2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrQ2hhdFNlcnZpY2UpO1xuXHRcdFx0cXVpY2tDaGF0U2VydmljZS5vcGVuSW5DaGF0VmlldygpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENsb3NlUXVpY2tDaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5xdWlja2NoYXQuY2xvc2UnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LmNsb3NlUXVpY2tDaGF0LmxhYmVsJywgXCJDbG9zZSBRdWljayBDaGF0XCIpLFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmNsb3NlLFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0SW5wdXRTaWRlLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDIwXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0Y29uc3QgcXVpY2tDaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tDaGF0U2VydmljZSk7XG5cdFx0XHRxdWlja0NoYXRTZXJ2aWNlLmNsb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxufVxuXG5jbGFzcyBRdWlja0NoYXRHbG9iYWxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFTS19RVUlDS19RVUVTVElPTl9BQ1RJT05fSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdxdWlja0NoYXQnLCAnT3BlbiBRdWljayBDaGF0JyksXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGF0U3BhcmtsZSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlMLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGl0bGVCYXJNZW51LFxuXHRcdFx0XHRncm91cDogJ2Ffb3BlbicsXG5cdFx0XHRcdG9yZGVyOiA0XG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0b2dnbGUuZGVzYycsICdUb2dnbGUgdGhlIHF1aWNrIGNoYXQnKSxcblx0XHRcdFx0YXJnczogW3tcblx0XHRcdFx0XHRuYW1lOiAnYXJncycsXG5cdFx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsncXVlcnknXSxcblx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRxdWVyeToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3RvZ2dsZS5xdWVyeScsIFwiVGhlIHF1ZXJ5IHRvIG9wZW4gdGhlIHF1aWNrIGNoYXQgd2l0aFwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRpc1BhcnRpYWxRdWVyeToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3RvZ2dsZS5pc1BhcnRpYWxRdWVyeScsIFwiV2hldGhlciB0aGUgcXVlcnkgaXMgcGFydGlhbDsgaXQgd2lsbCB3YWl0IGZvciBtb3JlIHVzZXIgaW5wdXRcIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3RvZ2dsZS5xdWVyeScsIFwiVGhlIHF1ZXJ5IHRvIG9wZW4gdGhlIHF1aWNrIGNoYXQgd2l0aFwiKVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XVxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcXVlcnk/OiBzdHJpbmcgfCBPbWl0PElRdWlja0NoYXRPcGVuT3B0aW9ucywgJ3NlbGVjdGlvbic+KTogdm9pZCB7XG5cdFx0Y29uc3QgcXVpY2tDaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tDaGF0U2VydmljZSk7XG5cdFx0bGV0IG9wdGlvbnM6IElRdWlja0NoYXRPcGVuT3B0aW9ucyB8IHVuZGVmaW5lZDtcblx0XHRzd2l0Y2ggKHR5cGVvZiBxdWVyeSkge1xuXHRcdFx0Y2FzZSAnc3RyaW5nJzogb3B0aW9ucyA9IHsgcXVlcnkgfTsgYnJlYWs7XG5cdFx0XHRjYXNlICdvYmplY3QnOiBvcHRpb25zID0gcXVlcnk7IGJyZWFrO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucz8ucXVlcnkpIHtcblx0XHRcdG9wdGlvbnMuc2VsZWN0aW9uID0gbmV3IFNlbGVjdGlvbigxLCBvcHRpb25zLnF1ZXJ5Lmxlbmd0aCArIDEsIDEsIG9wdGlvbnMucXVlcnkubGVuZ3RoICsgMSk7XG5cdFx0fVxuXHRcdHF1aWNrQ2hhdFNlcnZpY2UudG9nZ2xlKG9wdGlvbnMpO1xuXHR9XG59XG5cbmNsYXNzIEFza1F1aWNrQ2hhdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb24ub3BlblF1aWNrQ2hhdGAsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlU2Vzc2lvbi5vcGVuJywgXCJPcGVuIFF1aWNrIENoYXRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcXVlcnk/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBxdWlja0NoYXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0NoYXRTZXJ2aWNlKTtcblx0XHRxdWlja0NoYXRTZXJ2aWNlLnRvZ2dsZShxdWVyeSA/IHtcblx0XHRcdHF1ZXJ5LFxuXHRcdFx0c2VsZWN0aW9uOiBuZXcgU2VsZWN0aW9uKDEsIHF1ZXJ5Lmxlbmd0aCArIDEsIDEsIHF1ZXJ5Lmxlbmd0aCArIDEpXG5cdFx0fSA6IHVuZGVmaW5lZCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUVqRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFnQyx5QkFBeUI7QUFDekQsU0FBUyx1QkFBdUI7QUFFekIsTUFBTSwrQkFBK0I7QUFDckMsU0FBUywyQkFBMkI7QUFDMUMsa0JBQWdCLHFCQUFxQjtBQUNyQyxrQkFBZ0Isa0JBQWtCO0FBRWxDLGtCQUFnQixNQUFNLDZCQUE2QixRQUFRO0FBQUEsSUFDMUQsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSw2QkFBNkIsbUJBQW1CO0FBQUEsUUFDakUsSUFBSTtBQUFBLFFBQ0osVUFBVTtBQUFBLFFBQ1YsTUFBTSxRQUFRO0FBQUEsUUFDZCxNQUFNO0FBQUEsVUFDTCxJQUFJLE9BQU87QUFBQSxVQUNYLE9BQU87QUFBQSxVQUNQLE9BQU87QUFBQSxRQUNSO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLElBRUEsSUFBSSxVQUE0QjtBQUMvQixZQUFNLG1CQUFtQixTQUFTLElBQUksaUJBQWlCO0FBQ3ZELHVCQUFpQixlQUFlO0FBQUEsSUFDakM7QUFBQSxFQUNELENBQUM7QUFFRCxrQkFBZ0IsTUFBTSw2QkFBNkIsUUFBUTtBQUFBLElBQzFELGNBQWM7QUFDYixZQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFDSixPQUFPLFVBQVUsNkJBQTZCLGtCQUFrQjtBQUFBLFFBQ2hFLElBQUk7QUFBQSxRQUNKLFVBQVU7QUFBQSxRQUNWLE1BQU0sUUFBUTtBQUFBLFFBQ2QsTUFBTTtBQUFB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
