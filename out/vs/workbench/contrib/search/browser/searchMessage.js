import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import { parseLinkedText } from "../../../../base/common/linkedText.js";
import Severity from "../../../../base/common/severity.js";
import { SeverityIcon } from "../../../../base/browser/ui/severityIcon/severityIcon.js";
import { TextSearchCompleteMessageType } from "../../../services/search/common/searchExtTypes.js";
import { Schemas } from "../../../../base/common/network.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { URI } from "../../../../base/common/uri.js";
const renderSearchMessage = (message, instantiationService, notificationService, openerService, commandService, disposableStore, triggerSearch) => {
  const div = dom.$("div.providerMessage");
  const linkedText = parseLinkedText(message.text);
  dom.append(
    div,
    dom.$("." + SeverityIcon.className(
      message.type === TextSearchCompleteMessageType.Information ? Severity.Info : Severity.Warning
    ).split(" ").join("."))
  );
  for (const node of linkedText.nodes) {
    if (typeof node === "string") {
      dom.append(div, document.createTextNode(node));
    } else {
      const link = instantiationService.createInstance(Link, div, node, {
        opener: async (href) => {
          if (!message.trusted) {
            return;
          }
          const parsed = URI.parse(href, true);
          if (parsed.scheme === Schemas.command && message.trusted) {
            const result = await commandService.executeCommand(parsed.path);
            if (result?.triggerSearch) {
              triggerSearch();
            }
          } else if (parsed.scheme === Schemas.https) {
            openerService.open(parsed);
          } else {
            if (parsed.scheme === Schemas.command && !message.trusted) {
              notificationService.error(nls.localize("unable to open trust", "Unable to open command link from untrusted source: {0}", href));
            } else {
              notificationService.error(nls.localize("unable to open", "Unable to open unknown link: {0}", href));
            }
          }
        }
      });
      disposableStore.add(link);
    }
  }
  return div;
};
export {
  renderSearchMessage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaE1lc3NhZ2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBwYXJzZUxpbmtlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRUZXh0LmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgU2V2ZXJpdHlJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NldmVyaXR5SWNvbi9zZXZlcml0eUljb24uanMnO1xuaW1wb3J0IHsgVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZSwgVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZVR5cGUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaEV4dFR5cGVzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IExpbmsgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvYnJvd3Nlci9saW5rLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbmV4cG9ydCBjb25zdCByZW5kZXJTZWFyY2hNZXNzYWdlID0gKFxuXHRtZXNzYWdlOiBUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlLFxuXHRpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0b3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdGRpc3Bvc2FibGVTdG9yZTogRGlzcG9zYWJsZVN0b3JlLFxuXHR0cmlnZ2VyU2VhcmNoOiAoKSA9PiB2b2lkLFxuKTogSFRNTEVsZW1lbnQgPT4ge1xuXHRjb25zdCBkaXYgPSBkb20uJCgnZGl2LnByb3ZpZGVyTWVzc2FnZScpO1xuXHRjb25zdCBsaW5rZWRUZXh0ID0gcGFyc2VMaW5rZWRUZXh0KG1lc3NhZ2UudGV4dCk7XG5cdGRvbS5hcHBlbmQoZGl2LFxuXHRcdGRvbS4kKCcuJyArXG5cdFx0XHRTZXZlcml0eUljb24uY2xhc3NOYW1lKFxuXHRcdFx0XHRtZXNzYWdlLnR5cGUgPT09IFRleHRTZWFyY2hDb21wbGV0ZU1lc3NhZ2VUeXBlLkluZm9ybWF0aW9uXG5cdFx0XHRcdFx0PyBTZXZlcml0eS5JbmZvXG5cdFx0XHRcdFx0OiBTZXZlcml0eS5XYXJuaW5nKVxuXHRcdFx0XHQuc3BsaXQoJyAnKVxuXHRcdFx0XHQuam9pbignLicpKSk7XG5cblx0Zm9yIChjb25zdCBub2RlIG9mIGxpbmtlZFRleHQubm9kZXMpIHtcblx0XHRpZiAodHlwZW9mIG5vZGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRkb20uYXBwZW5kKGRpdiwgZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobm9kZSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBsaW5rID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGluaywgZGl2LCBub2RlLCB7XG5cdFx0XHRcdG9wZW5lcjogYXN5bmMgaHJlZiA9PiB7XG5cdFx0XHRcdFx0aWYgKCFtZXNzYWdlLnRydXN0ZWQpIHsgcmV0dXJuOyB9XG5cdFx0XHRcdFx0Y29uc3QgcGFyc2VkID0gVVJJLnBhcnNlKGhyZWYsIHRydWUpO1xuXHRcdFx0XHRcdGlmIChwYXJzZWQuc2NoZW1lID09PSBTY2hlbWFzLmNvbW1hbmQgJiYgbWVzc2FnZS50cnVzdGVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChwYXJzZWQucGF0aCk7XG5cdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0XHRcdGlmICgocmVzdWx0IGFzIGFueSk/LnRyaWdnZXJTZWFyY2gpIHtcblx0XHRcdFx0XHRcdFx0dHJpZ2dlclNlYXJjaCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAocGFyc2VkLnNjaGVtZSA9PT0gU2NoZW1hcy5odHRwcykge1xuXHRcdFx0XHRcdFx0b3BlbmVyU2VydmljZS5vcGVuKHBhcnNlZCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGlmIChwYXJzZWQuc2NoZW1lID09PSBTY2hlbWFzLmNvbW1hbmQgJiYgIW1lc3NhZ2UudHJ1c3RlZCkge1xuXHRcdFx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgndW5hYmxlIHRvIG9wZW4gdHJ1c3QnLCBcIlVuYWJsZSB0byBvcGVuIGNvbW1hbmQgbGluayBmcm9tIHVudHJ1c3RlZCBzb3VyY2U6IHswfVwiLCBocmVmKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgndW5hYmxlIHRvIG9wZW4nLCBcIlVuYWJsZSB0byBvcGVuIHVua25vd24gbGluazogezB9XCIsIGhyZWYpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChsaW5rKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGRpdjtcbn07XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxTQUFTO0FBRXJCLFNBQVMsdUJBQXVCO0FBQ2hDLE9BQU8sY0FBYztBQUdyQixTQUFTLG9CQUFvQjtBQUM3QixTQUFvQyxxQ0FBcUM7QUFFekUsU0FBUyxlQUFlO0FBRXhCLFNBQVMsWUFBWTtBQUNyQixTQUFTLFdBQVc7QUFFYixNQUFNLHNCQUFzQixDQUNsQyxTQUNBLHNCQUNBLHFCQUNBLGVBQ0EsZ0JBQ0EsaUJBQ0Esa0JBQ2lCO0FBQ2pCLFFBQU0sTUFBTSxJQUFJLEVBQUUscUJBQXFCO0FBQ3ZDLFFBQU0sYUFBYSxnQkFBZ0IsUUFBUSxJQUFJO0FBQy9DLE1BQUk7QUFBQSxJQUFPO0FBQUEsSUFDVixJQUFJLEVBQUUsTUFDTCxhQUFhO0FBQUEsTUFDWixRQUFRLFNBQVMsOEJBQThCLGNBQzVDLFNBQVMsT0FDVCxTQUFTO0FBQUEsSUFBTyxFQUNsQixNQUFNLEdBQUcsRUFDVCxLQUFLLEdBQUcsQ0FBQztBQUFBLEVBQUM7QUFFZCxhQUFXLFFBQVEsV0FBVyxPQUFPO0FBQ3BDLFFBQUksT0FBTyxTQUFTLFVBQVU7QUFDN0IsVUFBSSxPQUFPLEtBQUssU0FBUyxlQUFlLElBQUksQ0FBQztBQUFBLElBQzlDLE9BQU87QUFDTixZQUFNLE9BQU8scUJBQXFCLGVBQWUsTUFBTSxLQUFLLE1BQU07QUFBQSxRQUNqRSxRQUFRLE9BQU0sU0FBUTtBQUNyQixjQUFJLENBQUMsUUFBUSxTQUFTO0FBQUU7QUFBQSxVQUFRO0FBQ2hDLGdCQUFNLFNBQVMsSUFBSSxNQUFNLE1BQU0sSUFBSTtBQUNuQyxjQUFJLE9BQU8sV0FBVyxRQUFRLFdBQVcsUUFBUSxTQUFTO0FBQ3pELGtCQUFNLFNBQVMsTUFBTSxlQUFlLGVBQWUsT0FBTyxJQUFJO0FBRTlELGdCQUFLLFFBQWdCLGVBQWU7QUFDbkMsNEJBQWM7QUFBQSxZQUNmO0FBQUEsVUFDRCxXQUFXLE9BQU8sV0FBVyxRQUFRLE9BQU87QUFDM0MsMEJBQWMsS0FBSyxNQUFNO0FBQUEsVUFDMUIsT0FBTztBQUNOLGdCQUFJLE9BQU8sV0FBVyxRQUFRLFdBQVcsQ0FBQyxRQUFRLFNBQVM7QUFDMUQsa0NBQW9CLE1BQU0sSUFBSSxTQUFTLHdCQUF3QiwwREFBMEQsSUFBSSxDQUFDO0FBQUEsWUFDL0gsT0FBTztBQUNOLGtDQUFvQixNQUFNLElBQUksU0FBUyxrQkFBa0Isb0NBQW9DLElBQUksQ0FBQztBQUFBLFlBQ25HO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxzQkFBZ0IsSUFBSSxJQUFJO0FBQUEsSUFDekI7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogW10KfQo=
