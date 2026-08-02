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
import { PickerQuickAccessProvider, TriggerAction } from "../../../../platform/quickinput/browser/pickerQuickAccess.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { matchesFuzzy } from "../../../../base/common/filters.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IssueSource } from "../common/issue.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
let IssueQuickAccess = class extends PickerQuickAccessProvider {
  constructor(menuService, contextKeyService, commandService, extensionService, productService) {
    super(IssueQuickAccess.PREFIX, { canAcceptInBackground: true });
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.commandService = commandService;
    this.extensionService = extensionService;
    this.productService = productService;
  }
  _getPicks(filter) {
    const issuePicksConst = new Array();
    const issuePicksParts = new Array();
    const extensionIdSet = /* @__PURE__ */ new Set();
    const productLabel = this.productService.nameLong;
    const marketPlaceLabel = localize("reportExtensionMarketplace", "Extension Marketplace");
    const productFilter = matchesFuzzy(filter, productLabel, true);
    const marketPlaceFilter = matchesFuzzy(filter, marketPlaceLabel, true);
    if (productFilter) {
      issuePicksConst.push({
        label: productLabel,
        ariaLabel: productLabel,
        highlights: { label: productFilter },
        accept: () => this.commandService.executeCommand("workbench.action.openIssueReporter", { issueSource: IssueSource.VSCode })
      });
    }
    if (marketPlaceFilter) {
      issuePicksConst.push({
        label: marketPlaceLabel,
        ariaLabel: marketPlaceLabel,
        highlights: { label: marketPlaceFilter },
        accept: () => this.commandService.executeCommand("workbench.action.openIssueReporter", { issueSource: IssueSource.Marketplace })
      });
    }
    issuePicksConst.push({ type: "separator", label: localize("extensions", "Extensions") });
    const actions = this.menuService.getMenuActions(MenuId.IssueReporter, this.contextKeyService, { renderShortTitle: true }).flatMap((entry) => entry[1]);
    actions.forEach((action) => {
      if ("source" in action.item && action.item.source) {
        extensionIdSet.add(action.item.source.id);
      }
      const pick = this._createPick(filter, action);
      if (pick) {
        issuePicksParts.push(pick);
      }
    });
    this.extensionService.extensions.forEach((extension) => {
      if (!extension.isBuiltin) {
        const pick = this._createPick(filter, void 0, extension);
        const id = extension.identifier.value;
        if (pick && !extensionIdSet.has(id)) {
          issuePicksParts.push(pick);
        }
        extensionIdSet.add(id);
      }
    });
    issuePicksParts.sort((a, b) => {
      const aLabel = a.label ?? "";
      const bLabel = b.label ?? "";
      return aLabel.localeCompare(bLabel);
    });
    return [...issuePicksConst, ...issuePicksParts];
  }
  _createPick(filter, action, extension) {
    const buttons = [{
      iconClass: ThemeIcon.asClassName(Codicon.info),
      tooltip: localize("contributedIssuePage", "Open Extension Page")
    }];
    let label;
    let trigger;
    let accept;
    if (action && "source" in action.item && action.item.source) {
      label = action.item.source?.title;
      trigger = () => {
        if ("source" in action.item && action.item.source) {
          this.commandService.executeCommand("extension.open", action.item.source.id);
        }
        return TriggerAction.CLOSE_PICKER;
      };
      accept = () => {
        action.run();
      };
    } else if (extension) {
      label = extension.displayName ?? extension.name;
      trigger = () => {
        this.commandService.executeCommand("extension.open", extension.identifier.value);
        return TriggerAction.CLOSE_PICKER;
      };
      accept = () => {
        this.commandService.executeCommand("workbench.action.openIssueReporter", extension.identifier.value);
      };
    } else {
      return void 0;
    }
    const highlights = matchesFuzzy(filter, label, true);
    if (highlights) {
      return {
        label,
        highlights: { label: highlights },
        buttons,
        trigger,
        accept
      };
    }
    return void 0;
  }
};
IssueQuickAccess.PREFIX = "issue ";
IssueQuickAccess = __decorateClass([
  __decorateParam(0, IMenuService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IProductService)
], IssueQuickAccess);
export {
  IssueQuickAccess
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lzc3VlL2Jyb3dzZXIvaXNzdWVRdWlja0FjY2Vzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXIsIElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0sIEZhc3RBbmRTbG93UGlja3MsIFBpY2tzLCBUcmlnZ2VyQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9icm93c2VyL3BpY2tlclF1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uLCBTdWJtZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgbWF0Y2hlc0Z1enp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tQaWNrU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJc3N1ZVNvdXJjZSB9IGZyb20gJy4uL2NvbW1vbi9pc3N1ZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBJc3N1ZVF1aWNrQWNjZXNzIGV4dGVuZHMgUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlcjxJUGlja2VyUXVpY2tBY2Nlc3NJdGVtPiB7XG5cblx0c3RhdGljIFBSRUZJWCA9ICdpc3N1ZSAnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKElzc3VlUXVpY2tBY2Nlc3MuUFJFRklYLCB7IGNhbkFjY2VwdEluQmFja2dyb3VuZDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZ2V0UGlja3MoZmlsdGVyOiBzdHJpbmcpOiBQaWNrczxJUGlja2VyUXVpY2tBY2Nlc3NJdGVtPiB8IEZhc3RBbmRTbG93UGlja3M8SVBpY2tlclF1aWNrQWNjZXNzSXRlbT4gfCBQcm9taXNlPFBpY2tzPElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0+IHwgRmFzdEFuZFNsb3dQaWNrczxJUGlja2VyUXVpY2tBY2Nlc3NJdGVtPj4gfCBudWxsIHtcblx0XHRjb25zdCBpc3N1ZVBpY2tzQ29uc3QgPSBuZXcgQXJyYXk8SVBpY2tlclF1aWNrQWNjZXNzSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3I+KCk7XG5cdFx0Y29uc3QgaXNzdWVQaWNrc1BhcnRzID0gbmV3IEFycmF5PElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yPigpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbklkU2V0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHQvLyBBZGQgZGVmYXVsdCBpdGVtc1xuXHRcdGNvbnN0IHByb2R1Y3RMYWJlbCA9IHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmc7XG5cdFx0Y29uc3QgbWFya2V0UGxhY2VMYWJlbCA9IGxvY2FsaXplKFwicmVwb3J0RXh0ZW5zaW9uTWFya2V0cGxhY2VcIiwgXCJFeHRlbnNpb24gTWFya2V0cGxhY2VcIik7XG5cdFx0Y29uc3QgcHJvZHVjdEZpbHRlciA9IG1hdGNoZXNGdXp6eShmaWx0ZXIsIHByb2R1Y3RMYWJlbCwgdHJ1ZSk7XG5cdFx0Y29uc3QgbWFya2V0UGxhY2VGaWx0ZXIgPSBtYXRjaGVzRnV6enkoZmlsdGVyLCBtYXJrZXRQbGFjZUxhYmVsLCB0cnVlKTtcblxuXHRcdC8vIEFkZCBwcm9kdWN0IHBpY2sgaWYgcHJvZHVjdCBmaWx0ZXIgbWF0Y2hlc1xuXHRcdGlmIChwcm9kdWN0RmlsdGVyKSB7XG5cdFx0XHRpc3N1ZVBpY2tzQ29uc3QucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBwcm9kdWN0TGFiZWwsXG5cdFx0XHRcdGFyaWFMYWJlbDogcHJvZHVjdExhYmVsLFxuXHRcdFx0XHRoaWdobGlnaHRzOiB7IGxhYmVsOiBwcm9kdWN0RmlsdGVyIH0sXG5cdFx0XHRcdGFjY2VwdDogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuSXNzdWVSZXBvcnRlcicsIHsgaXNzdWVTb3VyY2U6IElzc3VlU291cmNlLlZTQ29kZSB9KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIG1hcmtldHBsYWNlIHBpY2sgaWYgbWFya2V0cGxhY2UgZmlsdGVyIG1hdGNoZXNcblx0XHRpZiAobWFya2V0UGxhY2VGaWx0ZXIpIHtcblx0XHRcdGlzc3VlUGlja3NDb25zdC5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IG1hcmtldFBsYWNlTGFiZWwsXG5cdFx0XHRcdGFyaWFMYWJlbDogbWFya2V0UGxhY2VMYWJlbCxcblx0XHRcdFx0aGlnaGxpZ2h0czogeyBsYWJlbDogbWFya2V0UGxhY2VGaWx0ZXIgfSxcblx0XHRcdFx0YWNjZXB0OiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5Jc3N1ZVJlcG9ydGVyJywgeyBpc3N1ZVNvdXJjZTogSXNzdWVTb3VyY2UuTWFya2V0cGxhY2UgfSlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlzc3VlUGlja3NDb25zdC5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucycsIFwiRXh0ZW5zaW9uc1wiKSB9KTtcblxuXG5cdFx0Ly8gZ2V0cyBtZW51IGFjdGlvbnMgZnJvbSBjb250cmlidXRlZFxuXHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5Jc3N1ZVJlcG9ydGVyLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB7IHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSkuZmxhdE1hcChlbnRyeSA9PiBlbnRyeVsxXSk7XG5cblx0XHQvLyBjcmVhdGUgcGlja3MgZnJvbSBjb250cmlidXRlZCBtZW51XG5cdFx0YWN0aW9ucy5mb3JFYWNoKGFjdGlvbiA9PiB7XG5cdFx0XHRpZiAoJ3NvdXJjZScgaW4gYWN0aW9uLml0ZW0gJiYgYWN0aW9uLml0ZW0uc291cmNlKSB7XG5cdFx0XHRcdGV4dGVuc2lvbklkU2V0LmFkZChhY3Rpb24uaXRlbS5zb3VyY2UuaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwaWNrID0gdGhpcy5fY3JlYXRlUGljayhmaWx0ZXIsIGFjdGlvbik7XG5cdFx0XHRpZiAocGljaykge1xuXHRcdFx0XHRpc3N1ZVBpY2tzUGFydHMucHVzaChwaWNrKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXG5cdFx0Ly8gY3JlYXRlIHBpY2tzIGZyb20gZXh0ZW5zaW9uc1xuXHRcdHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLmZvckVhY2goZXh0ZW5zaW9uID0+IHtcblx0XHRcdGlmICghZXh0ZW5zaW9uLmlzQnVpbHRpbikge1xuXHRcdFx0XHRjb25zdCBwaWNrID0gdGhpcy5fY3JlYXRlUGljayhmaWx0ZXIsIHVuZGVmaW5lZCwgZXh0ZW5zaW9uKTtcblx0XHRcdFx0Y29uc3QgaWQgPSBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZTtcblx0XHRcdFx0aWYgKHBpY2sgJiYgIWV4dGVuc2lvbklkU2V0LmhhcyhpZCkpIHtcblx0XHRcdFx0XHRpc3N1ZVBpY2tzUGFydHMucHVzaChwaWNrKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRleHRlbnNpb25JZFNldC5hZGQoaWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aXNzdWVQaWNrc1BhcnRzLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGNvbnN0IGFMYWJlbCA9IGEubGFiZWwgPz8gJyc7XG5cdFx0XHRjb25zdCBiTGFiZWwgPSBiLmxhYmVsID8/ICcnO1xuXHRcdFx0cmV0dXJuIGFMYWJlbC5sb2NhbGVDb21wYXJlKGJMYWJlbCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gWy4uLmlzc3VlUGlja3NDb25zdCwgLi4uaXNzdWVQaWNrc1BhcnRzXTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVBpY2soZmlsdGVyOiBzdHJpbmcsIGFjdGlvbj86IE1lbnVJdGVtQWN0aW9uIHwgU3VibWVudUl0ZW1BY3Rpb24gfCB1bmRlZmluZWQsIGV4dGVuc2lvbj86IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGJ1dHRvbnMgPSBbe1xuXHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5pbmZvKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjb250cmlidXRlZElzc3VlUGFnZScsIFwiT3BlbiBFeHRlbnNpb24gUGFnZVwiKVxuXHRcdH1dO1xuXG5cdFx0bGV0IGxhYmVsOiBzdHJpbmc7XG5cdFx0bGV0IHRyaWdnZXI6ICgpID0+IFRyaWdnZXJBY3Rpb247XG5cdFx0bGV0IGFjY2VwdDogKCkgPT4gdm9pZDtcblx0XHRpZiAoYWN0aW9uICYmICdzb3VyY2UnIGluIGFjdGlvbi5pdGVtICYmIGFjdGlvbi5pdGVtLnNvdXJjZSkge1xuXHRcdFx0bGFiZWwgPSBhY3Rpb24uaXRlbS5zb3VyY2U/LnRpdGxlO1xuXHRcdFx0dHJpZ2dlciA9ICgpID0+IHtcblx0XHRcdFx0aWYgKCdzb3VyY2UnIGluIGFjdGlvbi5pdGVtICYmIGFjdGlvbi5pdGVtLnNvdXJjZSkge1xuXHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2V4dGVuc2lvbi5vcGVuJywgYWN0aW9uLml0ZW0uc291cmNlLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gVHJpZ2dlckFjdGlvbi5DTE9TRV9QSUNLRVI7XG5cdFx0XHR9O1xuXHRcdFx0YWNjZXB0ID0gKCkgPT4ge1xuXHRcdFx0XHRhY3Rpb24ucnVuKCk7XG5cdFx0XHR9O1xuXG5cdFx0fSBlbHNlIGlmIChleHRlbnNpb24pIHtcblx0XHRcdGxhYmVsID0gZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi5uYW1lO1xuXHRcdFx0dHJpZ2dlciA9ICgpID0+IHtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnZXh0ZW5zaW9uLm9wZW4nLCBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cdFx0XHRcdHJldHVybiBUcmlnZ2VyQWN0aW9uLkNMT1NFX1BJQ0tFUjtcblx0XHRcdH07XG5cdFx0XHRhY2NlcHQgPSAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3Blbklzc3VlUmVwb3J0ZXInLCBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cdFx0XHR9O1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGlnaGxpZ2h0cyA9IG1hdGNoZXNGdXp6eShmaWx0ZXIsIGxhYmVsLCB0cnVlKTtcblx0XHRpZiAoaGlnaGxpZ2h0cykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdGhpZ2hsaWdodHM6IHsgbGFiZWw6IGhpZ2hsaWdodHMgfSxcblx0XHRcdFx0YnV0dG9ucyxcblx0XHRcdFx0dHJpZ2dlcixcblx0XHRcdFx0YWNjZXB0XG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsMkJBQTRFLHFCQUFxQjtBQUMxRyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGNBQWMsY0FBaUQ7QUFDeEUsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBRXpCLElBQU0sbUJBQU4sY0FBK0IsMEJBQWtEO0FBQUEsRUFJdkYsWUFDZ0MsYUFDTSxtQkFDSCxnQkFDRSxrQkFDRixnQkFDakM7QUFDRCxVQUFNLGlCQUFpQixRQUFRLEVBQUUsdUJBQXVCLEtBQUssQ0FBQztBQU4vQjtBQUNNO0FBQ0g7QUFDRTtBQUNGO0FBQUEsRUFHbkM7QUFBQSxFQUVtQixVQUFVLFFBQXFMO0FBQ2pOLFVBQU0sa0JBQWtCLElBQUksTUFBb0Q7QUFDaEYsVUFBTSxrQkFBa0IsSUFBSSxNQUFvRDtBQUNoRixVQUFNLGlCQUFpQixvQkFBSSxJQUFZO0FBR3ZDLFVBQU0sZUFBZSxLQUFLLGVBQWU7QUFDekMsVUFBTSxtQkFBbUIsU0FBUyw4QkFBOEIsdUJBQXVCO0FBQ3ZG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
