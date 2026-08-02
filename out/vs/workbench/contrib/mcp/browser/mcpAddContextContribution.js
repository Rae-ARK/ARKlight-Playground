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
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IChatContextPickService } from "../../chat/browser/attachments/chatContextPickService.js";
import { IMcpService, McpCapability } from "../common/mcpTypes.js";
import { McpResourcePickHelper } from "./mcpResourceQuickAccess.js";
let McpAddContextContribution = class extends Disposable {
  constructor(_chatContextPickService, _instantiationService, mcpService) {
    super();
    this._chatContextPickService = _chatContextPickService;
    this._instantiationService = _instantiationService;
    this._addContextMenu = this._register(new MutableDisposable());
    const hasServersWithResources = derived((reader) => {
      let enabled = false;
      for (const server of mcpService.servers.read(reader)) {
        const cap = server.capabilities.read(void 0);
        if (cap === void 0) {
          enabled = true;
        } else if (cap & McpCapability.Resources) {
          enabled = true;
          break;
        }
      }
      return enabled;
    });
    this._register(autorun((reader) => {
      const enabled = hasServersWithResources.read(reader);
      if (enabled && !this._addContextMenu.value) {
        this._registerAddContextMenu();
      } else {
        this._addContextMenu.clear();
      }
    }));
  }
  _registerAddContextMenu() {
    this._addContextMenu.value = this._chatContextPickService.registerChatContextItem({
      type: "pickerPick",
      label: localize("mcp.addContext", "MCP Resources..."),
      icon: Codicon.mcp,
      isEnabled(widget) {
        return !!widget.attachmentCapabilities.supportsMCPAttachments;
      },
      asPicker: () => {
        const helper = this._instantiationService.createInstance(McpResourcePickHelper);
        return {
          placeholder: localize("mcp.addContext.placeholder", "Select MCP Resource..."),
          picks: (_query, token) => this._getResourcePicks(token, helper),
          goBack: () => {
            return helper.navigateBack();
          },
          dispose: () => {
            helper.dispose();
          }
        };
      }
    });
  }
  _getResourcePicks(token, helper) {
    const picksObservable = helper.getPicks(token);
    return derived(this, (reader) => {
      const pickItems = picksObservable.read(reader);
      const picks = [];
      for (const [server, resources] of pickItems.picks) {
        if (resources.length === 0) {
          continue;
        }
        picks.push(McpResourcePickHelper.sep(server));
        for (const resource of resources) {
          picks.push({
            ...McpResourcePickHelper.item(resource),
            asAttachment: () => helper.toAttachment(resource, server)
          });
        }
      }
      return { picks, busy: pickItems.isBusy };
    });
  }
};
McpAddContextContribution = __decorateClass([
  __decorateParam(0, IChatContextPickService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IMcpService)
], McpAddContextContribution);
export {
  McpAddContextContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcEFkZENvbnRleHRDb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRQaWNrLCBJQ2hhdENvbnRleHRQaWNrU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0Q29udGV4dFBpY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2aWNlLCBNY3BDYXBhYmlsaXR5IH0gZnJvbSAnLi4vY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IE1jcFJlc291cmNlUGlja0hlbHBlciB9IGZyb20gJy4vbWNwUmVzb3VyY2VRdWlja0FjY2Vzcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNY3BBZGRDb250ZXh0Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hZGRDb250ZXh0TWVudSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRDb250ZXh0UGlja1NlcnZpY2U6IElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1jcFNlcnZpY2UgbWNwU2VydmljZTogSU1jcFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGhhc1NlcnZlcnNXaXRoUmVzb3VyY2VzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0bGV0IGVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIG1jcFNlcnZpY2Uuc2VydmVycy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0Y29uc3QgY2FwID0gc2VydmVyLmNhcGFiaWxpdGllcy5yZWFkKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGlmIChjYXAgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGVuYWJsZWQgPSB0cnVlOyAvLyB1bnRpbCB3ZSBrbm93IG1vcmVcblx0XHRcdFx0fSBlbHNlIGlmIChjYXAgJiBNY3BDYXBhYmlsaXR5LlJlc291cmNlcykge1xuXHRcdFx0XHRcdGVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBlbmFibGVkO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZW5hYmxlZCA9IGhhc1NlcnZlcnNXaXRoUmVzb3VyY2VzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChlbmFibGVkICYmICF0aGlzLl9hZGRDb250ZXh0TWVudS52YWx1ZSkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlckFkZENvbnRleHRNZW51KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9hZGRDb250ZXh0TWVudS5jbGVhcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyQWRkQ29udGV4dE1lbnUoKSB7XG5cdFx0dGhpcy5fYWRkQ29udGV4dE1lbnUudmFsdWUgPSB0aGlzLl9jaGF0Q29udGV4dFBpY2tTZXJ2aWNlLnJlZ2lzdGVyQ2hhdENvbnRleHRJdGVtKHtcblx0XHRcdHR5cGU6ICdwaWNrZXJQaWNrJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFkZENvbnRleHQnLCBcIk1DUCBSZXNvdXJjZXMuLi5cIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLm1jcCxcblx0XHRcdGlzRW5hYmxlZCh3aWRnZXQpIHtcblx0XHRcdFx0cmV0dXJuICEhd2lkZ2V0LmF0dGFjaG1lbnRDYXBhYmlsaXRpZXMuc3VwcG9ydHNNQ1BBdHRhY2htZW50cztcblx0XHRcdH0sXG5cdFx0XHRhc1BpY2tlcjogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBoZWxwZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BSZXNvdXJjZVBpY2tIZWxwZXIpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnbWNwLmFkZENvbnRleHQucGxhY2Vob2xkZXInLCBcIlNlbGVjdCBNQ1AgUmVzb3VyY2UuLi5cIiksXG5cdFx0XHRcdFx0cGlja3M6IChfcXVlcnksIHRva2VuKSA9PiB0aGlzLl9nZXRSZXNvdXJjZVBpY2tzKHRva2VuLCBoZWxwZXIpLFxuXHRcdFx0XHRcdGdvQmFjazogKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGhlbHBlci5uYXZpZ2F0ZUJhY2soKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRcdGhlbHBlci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFJlc291cmNlUGlja3ModG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBoZWxwZXI6IE1jcFJlc291cmNlUGlja0hlbHBlcikge1xuXHRcdGNvbnN0IHBpY2tzT2JzZXJ2YWJsZSA9IGhlbHBlci5nZXRQaWNrcyh0b2tlbik7XG5cblx0XHRyZXR1cm4gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXG5cdFx0XHRjb25zdCBwaWNrSXRlbXMgPSBwaWNrc09ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgcGlja3M6IENoYXRDb250ZXh0UGlja1tdID0gW107XG5cblx0XHRcdGZvciAoY29uc3QgW3NlcnZlciwgcmVzb3VyY2VzXSBvZiBwaWNrSXRlbXMucGlja3MpIHtcblx0XHRcdFx0aWYgKHJlc291cmNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwaWNrcy5wdXNoKE1jcFJlc291cmNlUGlja0hlbHBlci5zZXAoc2VydmVyKSk7XG5cdFx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgcmVzb3VyY2VzKSB7XG5cdFx0XHRcdFx0cGlja3MucHVzaCh7XG5cdFx0XHRcdFx0XHQuLi5NY3BSZXNvdXJjZVBpY2tIZWxwZXIuaXRlbShyZXNvdXJjZSksXG5cdFx0XHRcdFx0XHRhc0F0dGFjaG1lbnQ6ICgpID0+IGhlbHBlci50b0F0dGFjaG1lbnQocmVzb3VyY2UsIHNlcnZlcilcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgcGlja3MsIGJ1c3k6IHBpY2tJdGVtcy5pc0J1c3kgfTtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHlCQUF5QjtBQUM5QyxTQUFTLFNBQVMsZUFBZTtBQUNqQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUV0QyxTQUEwQiwrQkFBK0I7QUFDekQsU0FBUyxhQUFhLHFCQUFxQjtBQUMzQyxTQUFTLDZCQUE2QjtBQUUvQixJQUFNLDRCQUFOLGNBQXdDLFdBQTZDO0FBQUEsRUFFM0YsWUFDMkMseUJBQ0YsdUJBQzNCLFlBQ1o7QUFDRCxVQUFNO0FBSm9DO0FBQ0Y7QUFIekMsU0FBaUIsa0JBQWtCLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBUXhFLFVBQU0sMEJBQTBCLFFBQVEsWUFBVTtBQUNqRCxVQUFJLFVBQVU7QUFDZCxpQkFBVyxVQUFVLFdBQVcsUUFBUSxLQUFLLE1BQU0sR0FBRztBQUNyRCxjQUFNLE1BQU0sT0FBTyxhQUFhLEtBQUssTUFBUztBQUM5QyxZQUFJLFFBQVEsUUFBVztBQUN0QixvQkFBVTtBQUFBLFFBQ1gsV0FBVyxNQUFNLGNBQWMsV0FBVztBQUN6QyxvQkFBVTtBQUNWO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsSUFDUixDQUFDO0FBRUQsU0FBSyxVQUFVLFFBQVEsWUFBVTtBQUNoQyxZQUFNLFVBQVUsd0JBQXdCLEtBQUssTUFBTTtBQUNuRCxVQUFJLFdBQVcsQ0FBQyxLQUFLLGdCQUFnQixPQUFPO0FBQzNDLGFBQUssd0JBQXdCO0FBQUEsTUFDOUIsT0FBTztBQUNOLGFBQUssZ0JBQWdCLE1BQU07QUFBQSxNQUM1QjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsMEJBQTBCO0FBQ2pDLFNBQUssZ0JBQWdCLFFBQVEsS0FBSyx3QkFBd0Isd0JBQXdCO0FBQUEsTUFDakYsTUFBTTtBQUFBLE1BQ04sT0FBTyxTQUFTLGtCQUFrQixrQkFBa0I7QUFBQSxNQUNwRCxNQUFNLFFBQVE7QUFBQSxNQUNkLFVBQVUsUUFBUTtBQUNqQixlQUFPLENBQUMsQ0FBQyxPQUFPLHVCQUF1QjtBQUFBLE1BQ3hDO0FBQUEsTUFDQSxVQUFVLE1BQU07QUFDZixjQUFNLFNBQVMsS0FBSyxzQkFBc0IsZUFBZSxxQkFBcUI7QUFDOUUsZUFBTztBQUFBLFVBQ04sYUFBYSxTQUFTLDhCQUE4Qix3QkFBd0I7QUFBQSxVQUM1RSxPQUFPLENBQUMsUUFBUSxVQUFVLEtBQUssa0JBQWtCLE9BQU8sTUFBTTtBQUFBLFVBQzlELFFBQVEsTUFBTTtBQUNiLG1CQUFPLE9BQU8sYUFBYTtBQUFBLFVBQzVCO0FBQUEsVUFDQSxTQUFTLE1BQU07QUFDZCxtQkFBTyxRQUFRO0FBQUEsVUFDaEI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLGtCQUFrQixPQUEwQixRQUErQjtBQUNsRixVQUFNLGtCQUFrQixPQUFPLFNBQVMsS0FBSztBQUU3QyxXQUFPLFFBQVEsTUFBTSxZQUFVO0FBRTlCLFlBQU0sWUFBWSxnQkFBZ0IsS0FBSyxNQUFNO0FBQzdDLFlBQU0sUUFBMkIsQ0FBQztBQUVsQyxpQkFBVyxDQUFDLFFBQVEsU0FBUyxLQUFLLFVBQVUsT0FBTztBQUNsRCxZQUFJLFVBQVUsV0FBVyxHQUFHO0FBQzNCO0FBQUEsUUFDRDtBQUNBLGNBQU0sS0FBSyxzQkFBc0IsSUFBSSxNQUFNLENBQUM7QUFDNUMsbUJBQVcsWUFBWSxXQUFXO0FBQ2pDLGdCQUFNLEtBQUs7QUFBQSxZQUNWLEdBQUcsc0JBQXNCLEtBQUssUUFBUTtBQUFBLFlBQ3RDLGNBQWMsTUFBTSxPQUFPLGFBQWEsVUFBVSxNQUFNO0FBQUEsVUFDekQsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBQ0EsYUFBTyxFQUFFLE9BQU8sTUFBTSxVQUFVLE9BQU87QUFBQSxJQUN4QyxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBakZhLDRCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FMVTsiLAogICJuYW1lcyI6IFtdCn0K
