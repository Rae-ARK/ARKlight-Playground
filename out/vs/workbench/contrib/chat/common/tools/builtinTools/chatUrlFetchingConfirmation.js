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
import { Codicon } from "../../../../../../base/common/codicons.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize } from "../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IQuickInputService } from "../../../../../../platform/quickinput/common/quickInput.js";
import { IPreferencesService } from "../../../../../services/preferences/common/preferences.js";
import { ToolConfirmKind } from "../../chatService/chatService.js";
import { ChatConfiguration } from "../../constants.js";
import { extractUrlPatterns, getPatternLabel, isUrlApproved } from "./chatUrlFetchingPatterns.js";
const trashButton = {
  iconClass: ThemeIcon.asClassName(Codicon.trash),
  tooltip: localize("delete", "Delete")
};
let ChatUrlFetchingConfirmationContribution = class {
  constructor(_getURLS, _configurationService, _quickInputService, _preferencesService) {
    this._getURLS = _getURLS;
    this._configurationService = _configurationService;
    this._quickInputService = _quickInputService;
    this._preferencesService = _preferencesService;
    this.canUseDefaultApprovals = false;
  }
  getPreConfirmAction(ref) {
    return this._checkApproval(ref, true);
  }
  getPostConfirmAction(ref) {
    return this._checkApproval(ref, false);
  }
  _checkApproval(ref, checkRequest) {
    const urls = this._getURLS(ref.parameters);
    if (!urls || urls.length === 0) {
      return void 0;
    }
    const approvedUrls = this._getApprovedUrls();
    const allApproved = urls.every((url) => {
      try {
        const uri = URI.parse(url);
        return isUrlApproved(uri, approvedUrls, checkRequest);
      } catch {
        return false;
      }
    });
    if (allApproved) {
      return {
        type: ToolConfirmKind.Setting,
        id: ChatConfiguration.AutoApprovedUrls
      };
    }
    return void 0;
  }
  getPreConfirmActions(ref) {
    return this._getConfirmActions(ref, true);
  }
  getPostConfirmActions(ref) {
    return this._getConfirmActions(ref, false);
  }
  _getConfirmActions(ref, forRequest) {
    const urls = this._getURLS(ref.parameters);
    if (!urls || urls.length === 0) {
      return [];
    }
    const urlsWithoutQuery = urls.map((u) => u.split("?")[0]);
    const actions = [];
    const uniqueUrls = Array.from(new Set(urlsWithoutQuery)).map((u) => URI.parse(u));
    const urlPatterns = new ResourceMap(uniqueUrls.map((u) => [u, extractUrlPatterns(u)]));
    if (urlPatterns.size === 1) {
      const uri = uniqueUrls[0];
      const patterns = urlPatterns.get(uri);
      const topPatterns = patterns.slice(0, 2);
      for (const pattern of topPatterns) {
        const patternLabel = getPatternLabel(uri, pattern);
        actions.push({
          label: forRequest ? localize("approveRequestTo", "Allow requests to {0}", patternLabel) : localize("approveResponseFrom", "Allow responses from {0}", patternLabel),
          select: async () => {
            await this._approvePattern(pattern, forRequest, !forRequest);
            return true;
          }
        });
      }
      actions.push({
        label: localize("moreOptions", "Allow requests to..."),
        select: async () => {
          const result = await this._showMoreOptions(ref, [{ uri, patterns }], forRequest);
          return result;
        }
      });
    } else {
      actions.push({
        label: localize("moreOptionsMultiple", "Configure URL Approvals..."),
        select: async () => {
          await this._showMoreOptions(ref, [...urlPatterns].map(([uri, patterns]) => ({ uri, patterns })), forRequest);
          return true;
        }
      });
    }
    return actions;
  }
  async _showMoreOptions(ref, urls, forRequest) {
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      const quickTree = disposables.add(this._quickInputService.createQuickTree());
      quickTree.ignoreFocusOut = true;
      quickTree.sortByLabel = false;
      quickTree.placeholder = localize("selectApproval", "Select URL pattern to approve");
      const treeItems = [];
      const approvedUrls = this._getApprovedUrls();
      const dedupedPatterns = /* @__PURE__ */ new Set();
      for (const { uri, patterns } of urls) {
        for (const pattern of patterns.slice().sort((a, b) => b.length - a.length)) {
          if (dedupedPatterns.has(pattern)) {
            continue;
          }
          dedupedPatterns.add(pattern);
          const settings = approvedUrls[pattern];
          const requestChecked = typeof settings === "boolean" ? settings : settings?.approveRequest ?? false;
          const responseChecked = typeof settings === "boolean" ? settings : settings?.approveResponse ?? false;
          treeItems.push({
            label: getPatternLabel(uri, pattern),
            pattern,
            checked: requestChecked && responseChecked ? true : !requestChecked && !responseChecked ? false : "mixed",
            collapsed: true,
            children: [
              {
                label: localize("allowRequestsCheckbox", "Make requests without confirmation"),
                pattern,
                approvalType: "request",
                checked: requestChecked
              },
              {
                label: localize("allowResponsesCheckbox", "Allow responses without confirmation"),
                pattern,
                approvalType: "response",
                checked: responseChecked
              }
            ]
          });
        }
      }
      quickTree.setItemTree(treeItems);
      const updateApprovals = () => {
        const current = { ...this._getApprovedUrls() };
        for (const item of quickTree.itemTree) {
          const allowPre = item.children?.find((c) => c.approvalType === "request")?.checked;
          const allowPost = item.children?.find((c) => c.approvalType === "response")?.checked;
          if (allowPost && allowPre) {
            current[item.pattern] = true;
          } else if (!allowPost && !allowPre) {
            delete current[item.pattern];
          } else {
            current[item.pattern] = {
              approveRequest: !!allowPre || void 0,
              approveResponse: !!allowPost || void 0
            };
          }
        }
        return this._configurationService.updateValue(ChatConfiguration.AutoApprovedUrls, current);
      };
      disposables.add(quickTree.onDidAccept(async () => {
        quickTree.busy = true;
        await updateApprovals();
        resolve(!!this._checkApproval(ref, forRequest));
        quickTree.hide();
      }));
      disposables.add(quickTree.onDidHide(() => {
        updateApprovals();
        disposables.dispose();
        resolve(false);
      }));
      quickTree.show();
    });
  }
  async _approvePattern(pattern, approveRequest, approveResponse) {
    const approvedUrls = { ...this._getApprovedUrls() };
    const existingSettings = approvedUrls[pattern];
    let existingRequest = false;
    let existingResponse = false;
    if (typeof existingSettings === "boolean") {
      existingRequest = existingSettings;
      existingResponse = existingSettings;
    } else if (existingSettings) {
      existingRequest = existingSettings.approveRequest ?? false;
      existingResponse = existingSettings.approveResponse ?? false;
    }
    const mergedRequest = approveRequest || existingRequest;
    const mergedResponse = approveResponse || existingResponse;
    let value;
    if (mergedRequest === mergedResponse) {
      value = mergedRequest;
    } else {
      value = { approveRequest: mergedRequest, approveResponse: mergedResponse };
    }
    approvedUrls[pattern] = value;
    await this._configurationService.updateValue(
      ChatConfiguration.AutoApprovedUrls,
      approvedUrls
    );
  }
  getManageActions() {
    const approvedUrls = { ...this._getApprovedUrls() };
    const items = [];
    for (const [pattern, settings] of Object.entries(approvedUrls)) {
      const label = pattern;
      let description;
      if (typeof settings === "boolean") {
        description = settings ? localize("approveAll", "Approve all") : localize("denyAll", "Deny all");
      } else {
        const parts = [];
        if (settings.approveRequest) {
          parts.push(localize("requests", "requests"));
        }
        if (settings.approveResponse) {
          parts.push(localize("responses", "responses"));
        }
        description = parts.length > 0 ? localize("approves", "Approves {0}", parts.join(", ")) : localize("noApprovals", "No approvals");
      }
      const item = {
        label,
        description,
        buttons: [trashButton],
        checked: true,
        onDidChangeChecked: (checked) => {
          if (checked) {
            approvedUrls[pattern] = settings;
          } else {
            delete approvedUrls[pattern];
          }
          this._configurationService.updateValue(ChatConfiguration.AutoApprovedUrls, approvedUrls);
        }
      };
      items.push(item);
    }
    items.push({
      pickable: false,
      label: localize("moreOptionsManage", "More Options..."),
      description: localize("openSettings", "Open settings"),
      onDidOpen: () => {
        this._preferencesService.openUserSettings({ query: ChatConfiguration.AutoApprovedUrls });
      }
    });
    return items;
  }
  async reset() {
    await this._configurationService.updateValue(
      ChatConfiguration.AutoApprovedUrls,
      {}
    );
  }
  _getApprovedUrls() {
    return this._configurationService.getValue(
      ChatConfiguration.AutoApprovedUrls
    ) || {};
  }
};
ChatUrlFetchingConfirmationContribution = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IPreferencesService)
], ChatUrlFetchingConfirmationContribution);
export {
  ChatUrlFetchingConfirmationContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9jaGF0VXJsRmV0Y2hpbmdDb25maXJtYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dEJ1dHRvbiwgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tUcmVlSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBDb25maXJtZWRSZWFzb24sIFRvb2xDb25maXJtS2luZCB9IGZyb20gJy4uLy4uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7XG5cdElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkFjdGlvbnMsXG5cdElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbixcblx0SUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uUXVpY2tUcmVlSXRlbSxcblx0SUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmXG59IGZyb20gJy4uL2xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZXh0cmFjdFVybFBhdHRlcm5zLCBnZXRQYXR0ZXJuTGFiZWwsIGlzVXJsQXBwcm92ZWQsIElVcmxBcHByb3ZhbFNldHRpbmdzIH0gZnJvbSAnLi9jaGF0VXJsRmV0Y2hpbmdQYXR0ZXJucy5qcyc7XG5cbmNvbnN0IHRyYXNoQnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi50cmFzaCksXG5cdHRvb2x0aXA6IGxvY2FsaXplKCdkZWxldGUnLCBcIkRlbGV0ZVwiKVxufTtcblxuZXhwb3J0IGNsYXNzIENoYXRVcmxGZXRjaGluZ0NvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbiB7XG5cdHJlYWRvbmx5IGNhblVzZURlZmF1bHRBcHByb3ZhbHMgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRVUkxTOiAocGFyYW1ldGVyczogdW5rbm93bikgPT4gc3RyaW5nW10gfCB1bmRlZmluZWQsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2Vcblx0KSB7IH1cblxuXHRnZXRQcmVDb25maXJtQWN0aW9uKHJlZjogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmKTogQ29uZmlybWVkUmVhc29uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hlY2tBcHByb3ZhbChyZWYsIHRydWUpO1xuXHR9XG5cblx0Z2V0UG9zdENvbmZpcm1BY3Rpb24ocmVmOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25SZWYpOiBDb25maXJtZWRSZWFzb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jaGVja0FwcHJvdmFsKHJlZiwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2hlY2tBcHByb3ZhbChyZWY6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZiwgY2hlY2tSZXF1ZXN0OiBib29sZWFuKTogQ29uZmlybWVkUmVhc29uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB1cmxzID0gdGhpcy5fZ2V0VVJMUyhyZWYucGFyYW1ldGVycyk7XG5cdFx0aWYgKCF1cmxzIHx8IHVybHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFwcHJvdmVkVXJscyA9IHRoaXMuX2dldEFwcHJvdmVkVXJscygpO1xuXG5cdFx0Ly8gQ2hlY2sgaWYgYWxsIFVSTHMgYXJlIGFwcHJvdmVkXG5cdFx0Y29uc3QgYWxsQXBwcm92ZWQgPSB1cmxzLmV2ZXJ5KHVybCA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UodXJsKTtcblx0XHRcdFx0cmV0dXJuIGlzVXJsQXBwcm92ZWQodXJpLCBhcHByb3ZlZFVybHMsIGNoZWNrUmVxdWVzdCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKGFsbEFwcHJvdmVkKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBUb29sQ29uZmlybUtpbmQuU2V0dGluZyxcblx0XHRcdFx0aWQ6IENoYXRDb25maWd1cmF0aW9uLkF1dG9BcHByb3ZlZFVybHNcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldFByZUNvbmZpcm1BY3Rpb25zKHJlZjogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmKTogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQWN0aW9uc1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Q29uZmlybUFjdGlvbnMocmVmLCB0cnVlKTtcblx0fVxuXG5cdGdldFBvc3RDb25maXJtQWN0aW9ucyhyZWY6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZik6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkFjdGlvbnNbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldENvbmZpcm1BY3Rpb25zKHJlZiwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29uZmlybUFjdGlvbnMocmVmOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25SZWYsIGZvclJlcXVlc3Q6IGJvb2xlYW4pOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25BY3Rpb25zW10ge1xuXHRcdGNvbnN0IHVybHMgPSB0aGlzLl9nZXRVUkxTKHJlZi5wYXJhbWV0ZXJzKTtcblx0XHRpZiAoIXVybHMgfHwgdXJscy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvL3JlbW92ZSBxdWVyeSBzdHJpbmdzXG5cdFx0Y29uc3QgdXJsc1dpdGhvdXRRdWVyeSA9IHVybHMubWFwKHUgPT4gdS5zcGxpdCgnPycpWzBdKTtcblxuXHRcdGNvbnN0IGFjdGlvbnM6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkFjdGlvbnNbXSA9IFtdO1xuXG5cdFx0Ly8gR2V0IHVuaXF1ZSBVUkxzIChtYXkgaGF2ZSBkdXBsaWNhdGVzKVxuXHRcdGNvbnN0IHVuaXF1ZVVybHMgPSBBcnJheS5mcm9tKG5ldyBTZXQodXJsc1dpdGhvdXRRdWVyeSkpLm1hcCh1ID0+IFVSSS5wYXJzZSh1KSk7XG5cblx0XHQvLyBGb3IgZWFjaCBVUkwsIGdldCBpdHMgcGF0dGVybnNcblx0XHRjb25zdCB1cmxQYXR0ZXJucyA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmdbXT4odW5pcXVlVXJscy5tYXAodSA9PiBbdSwgZXh0cmFjdFVybFBhdHRlcm5zKHUpXSBhcyBjb25zdCkpO1xuXG5cdFx0Ly8gSWYgb25seSBvbmUgVVJMLCBzaG93IHF1aWNrIGFjdGlvbnMgZm9yIHNwZWNpZmljIHBhdHRlcm5zXG5cdFx0aWYgKHVybFBhdHRlcm5zLnNpemUgPT09IDEpIHtcblx0XHRcdGNvbnN0IHVyaSA9IHVuaXF1ZVVybHNbMF07XG5cdFx0XHRjb25zdCBwYXR0ZXJucyA9IHVybFBhdHRlcm5zLmdldCh1cmkpITtcblxuXHRcdFx0Ly8gU2hvdyB0b3AgMiBtb3N0IHJlbGV2YW50IHBhdHRlcm5zIGFzIHF1aWNrIGFjdGlvbnNcblx0XHRcdGNvbnN0IHRvcFBhdHRlcm5zID0gcGF0dGVybnMuc2xpY2UoMCwgMik7XG5cdFx0XHRmb3IgKGNvbnN0IHBhdHRlcm4gb2YgdG9wUGF0dGVybnMpIHtcblx0XHRcdFx0Y29uc3QgcGF0dGVybkxhYmVsID0gZ2V0UGF0dGVybkxhYmVsKHVyaSwgcGF0dGVybik7XG5cdFx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGZvclJlcXVlc3Rcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FwcHJvdmVSZXF1ZXN0VG8nLCBcIkFsbG93IHJlcXVlc3RzIHRvIHswfVwiLCBwYXR0ZXJuTGFiZWwpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhcHByb3ZlUmVzcG9uc2VGcm9tJywgXCJBbGxvdyByZXNwb25zZXMgZnJvbSB7MH1cIiwgcGF0dGVybkxhYmVsKSxcblx0XHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2FwcHJvdmVQYXR0ZXJuKHBhdHRlcm4sIGZvclJlcXVlc3QsICFmb3JSZXF1ZXN0KTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFwiTW9yZSBvcHRpb25zXCIgYWN0aW9uXG5cdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21vcmVPcHRpb25zJywgXCJBbGxvdyByZXF1ZXN0cyB0by4uLlwiKSxcblx0XHRcdFx0c2VsZWN0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fc2hvd01vcmVPcHRpb25zKHJlZiwgW3sgdXJpLCBwYXR0ZXJucyB9XSwgZm9yUmVxdWVzdCk7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE11bHRpcGxlIFVSTHMgLSBzaG93IFwiTW9yZSBvcHRpb25zXCIgb25seVxuXHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtb3JlT3B0aW9uc011bHRpcGxlJywgXCJDb25maWd1cmUgVVJMIEFwcHJvdmFscy4uLlwiKSxcblx0XHRcdFx0c2VsZWN0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fc2hvd01vcmVPcHRpb25zKHJlZiwgWy4uLnVybFBhdHRlcm5zXS5tYXAoKFt1cmksIHBhdHRlcm5zXSkgPT4gKHsgdXJpLCBwYXR0ZXJucyB9KSksIGZvclJlcXVlc3QpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYWN0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Nob3dNb3JlT3B0aW9ucyhyZWY6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZiwgdXJsczogeyB1cmk6IFVSSTsgcGF0dGVybnM6IHN0cmluZ1tdIH1bXSwgZm9yUmVxdWVzdDogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGludGVyZmFjZSBJUGF0dGVyblRyZWVJdGVtIGV4dGVuZHMgSVF1aWNrVHJlZUl0ZW0ge1xuXHRcdFx0cGF0dGVybjogc3RyaW5nO1xuXHRcdFx0YXBwcm92YWxUeXBlPzogJ3JlcXVlc3QnIHwgJ3Jlc3BvbnNlJztcblx0XHRcdGNoaWxkcmVuPzogSVBhdHRlcm5UcmVlSXRlbVtdO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxib29sZWFuPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBxdWlja1RyZWUgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tUcmVlPElQYXR0ZXJuVHJlZUl0ZW0+KCkpO1xuXHRcdFx0cXVpY2tUcmVlLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRcdHF1aWNrVHJlZS5zb3J0QnlMYWJlbCA9IGZhbHNlO1xuXHRcdFx0cXVpY2tUcmVlLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3NlbGVjdEFwcHJvdmFsJywgXCJTZWxlY3QgVVJMIHBhdHRlcm4gdG8gYXBwcm92ZVwiKTtcblxuXHRcdFx0Y29uc3QgdHJlZUl0ZW1zOiBJUGF0dGVyblRyZWVJdGVtW10gPSBbXTtcblx0XHRcdGNvbnN0IGFwcHJvdmVkVXJscyA9IHRoaXMuX2dldEFwcHJvdmVkVXJscygpO1xuXHRcdFx0Y29uc3QgZGVkdXBlZFBhdHRlcm5zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHRcdGZvciAoY29uc3QgeyB1cmksIHBhdHRlcm5zIH0gb2YgdXJscykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHBhdHRlcm4gb2YgcGF0dGVybnMuc2xpY2UoKS5zb3J0KChhLCBiKSA9PiBiLmxlbmd0aCAtIGEubGVuZ3RoKSkge1xuXHRcdFx0XHRcdGlmIChkZWR1cGVkUGF0dGVybnMuaGFzKHBhdHRlcm4pKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZGVkdXBlZFBhdHRlcm5zLmFkZChwYXR0ZXJuKTtcblx0XHRcdFx0XHRjb25zdCBzZXR0aW5ncyA9IGFwcHJvdmVkVXJsc1twYXR0ZXJuXTtcblx0XHRcdFx0XHRjb25zdCByZXF1ZXN0Q2hlY2tlZCA9IHR5cGVvZiBzZXR0aW5ncyA9PT0gJ2Jvb2xlYW4nID8gc2V0dGluZ3MgOiAoc2V0dGluZ3M/LmFwcHJvdmVSZXF1ZXN0ID8/IGZhbHNlKTtcblx0XHRcdFx0XHRjb25zdCByZXNwb25zZUNoZWNrZWQgPSB0eXBlb2Ygc2V0dGluZ3MgPT09ICdib29sZWFuJyA/IHNldHRpbmdzIDogKHNldHRpbmdzPy5hcHByb3ZlUmVzcG9uc2UgPz8gZmFsc2UpO1xuXG5cdFx0XHRcdFx0dHJlZUl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0bGFiZWw6IGdldFBhdHRlcm5MYWJlbCh1cmksIHBhdHRlcm4pLFxuXHRcdFx0XHRcdFx0cGF0dGVybixcblx0XHRcdFx0XHRcdGNoZWNrZWQ6IHJlcXVlc3RDaGVja2VkICYmIHJlc3BvbnNlQ2hlY2tlZCA/IHRydWUgOiAoIXJlcXVlc3RDaGVja2VkICYmICFyZXNwb25zZUNoZWNrZWQgPyBmYWxzZSA6ICdtaXhlZCcpLFxuXHRcdFx0XHRcdFx0Y29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsb3dSZXF1ZXN0c0NoZWNrYm94JywgXCJNYWtlIHJlcXVlc3RzIHdpdGhvdXQgY29uZmlybWF0aW9uXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHBhdHRlcm4sXG5cdFx0XHRcdFx0XHRcdFx0YXBwcm92YWxUeXBlOiAncmVxdWVzdCcsXG5cdFx0XHRcdFx0XHRcdFx0Y2hlY2tlZDogcmVxdWVzdENoZWNrZWRcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsb3dSZXNwb25zZXNDaGVja2JveCcsIFwiQWxsb3cgcmVzcG9uc2VzIHdpdGhvdXQgY29uZmlybWF0aW9uXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHBhdHRlcm4sXG5cdFx0XHRcdFx0XHRcdFx0YXBwcm92YWxUeXBlOiAncmVzcG9uc2UnLFxuXHRcdFx0XHRcdFx0XHRcdGNoZWNrZWQ6IHJlc3BvbnNlQ2hlY2tlZFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHF1aWNrVHJlZS5zZXRJdGVtVHJlZSh0cmVlSXRlbXMpO1xuXG5cdFx0XHRjb25zdCB1cGRhdGVBcHByb3ZhbHMgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnQgPSB7IC4uLnRoaXMuX2dldEFwcHJvdmVkVXJscygpIH07XG5cdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBxdWlja1RyZWUuaXRlbVRyZWUpIHtcblx0XHRcdFx0XHQvLyByb290LWxldmVsIGl0ZW1zXG5cblx0XHRcdFx0XHRjb25zdCBhbGxvd1ByZSA9IGl0ZW0uY2hpbGRyZW4/LmZpbmQoYyA9PiBjLmFwcHJvdmFsVHlwZSA9PT0gJ3JlcXVlc3QnKT8uY2hlY2tlZDtcblx0XHRcdFx0XHRjb25zdCBhbGxvd1Bvc3QgPSBpdGVtLmNoaWxkcmVuPy5maW5kKGMgPT4gYy5hcHByb3ZhbFR5cGUgPT09ICdyZXNwb25zZScpPy5jaGVja2VkO1xuXG5cdFx0XHRcdFx0aWYgKGFsbG93UG9zdCAmJiBhbGxvd1ByZSkge1xuXHRcdFx0XHRcdFx0Y3VycmVudFtpdGVtLnBhdHRlcm5dID0gdHJ1ZTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKCFhbGxvd1Bvc3QgJiYgIWFsbG93UHJlKSB7XG5cdFx0XHRcdFx0XHRkZWxldGUgY3VycmVudFtpdGVtLnBhdHRlcm5dO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjdXJyZW50W2l0ZW0ucGF0dGVybl0gPSB7XG5cdFx0XHRcdFx0XHRcdGFwcHJvdmVSZXF1ZXN0OiAhIWFsbG93UHJlIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0YXBwcm92ZVJlc3BvbnNlOiAhIWFsbG93UG9zdCB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShDaGF0Q29uZmlndXJhdGlvbi5BdXRvQXBwcm92ZWRVcmxzLCBjdXJyZW50KTtcblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1RyZWUub25EaWRBY2NlcHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRxdWlja1RyZWUuYnVzeSA9IHRydWU7XG5cdFx0XHRcdGF3YWl0IHVwZGF0ZUFwcHJvdmFscygpO1xuXHRcdFx0XHRyZXNvbHZlKCEhdGhpcy5fY2hlY2tBcHByb3ZhbChyZWYsIGZvclJlcXVlc3QpKTtcblx0XHRcdFx0cXVpY2tUcmVlLmhpZGUoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrVHJlZS5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHR1cGRhdGVBcHByb3ZhbHMoKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXNvbHZlKGZhbHNlKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0cXVpY2tUcmVlLnNob3coKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FwcHJvdmVQYXR0ZXJuKHBhdHRlcm46IHN0cmluZywgYXBwcm92ZVJlcXVlc3Q6IGJvb2xlYW4sIGFwcHJvdmVSZXNwb25zZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFwcHJvdmVkVXJscyA9IHsgLi4udGhpcy5fZ2V0QXBwcm92ZWRVcmxzKCkgfTtcblxuXHRcdC8vIE1lcmdlIHdpdGggZXhpc3Rpbmcgc2V0dGluZ3MgZm9yIHRoaXMgcGF0dGVyblxuXHRcdGNvbnN0IGV4aXN0aW5nU2V0dGluZ3MgPSBhcHByb3ZlZFVybHNbcGF0dGVybl07XG5cdFx0bGV0IGV4aXN0aW5nUmVxdWVzdCA9IGZhbHNlO1xuXHRcdGxldCBleGlzdGluZ1Jlc3BvbnNlID0gZmFsc2U7XG5cdFx0aWYgKHR5cGVvZiBleGlzdGluZ1NldHRpbmdzID09PSAnYm9vbGVhbicpIHtcblx0XHRcdGV4aXN0aW5nUmVxdWVzdCA9IGV4aXN0aW5nU2V0dGluZ3M7XG5cdFx0XHRleGlzdGluZ1Jlc3BvbnNlID0gZXhpc3RpbmdTZXR0aW5ncztcblx0XHR9IGVsc2UgaWYgKGV4aXN0aW5nU2V0dGluZ3MpIHtcblx0XHRcdGV4aXN0aW5nUmVxdWVzdCA9IGV4aXN0aW5nU2V0dGluZ3MuYXBwcm92ZVJlcXVlc3QgPz8gZmFsc2U7XG5cdFx0XHRleGlzdGluZ1Jlc3BvbnNlID0gZXhpc3RpbmdTZXR0aW5ncy5hcHByb3ZlUmVzcG9uc2UgPz8gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWVyZ2VkUmVxdWVzdCA9IGFwcHJvdmVSZXF1ZXN0IHx8IGV4aXN0aW5nUmVxdWVzdDtcblx0XHRjb25zdCBtZXJnZWRSZXNwb25zZSA9IGFwcHJvdmVSZXNwb25zZSB8fCBleGlzdGluZ1Jlc3BvbnNlO1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBhcHByb3ZhbCBzZXR0aW5nc1xuXHRcdGxldCB2YWx1ZTogYm9vbGVhbiB8IElVcmxBcHByb3ZhbFNldHRpbmdzO1xuXHRcdGlmIChtZXJnZWRSZXF1ZXN0ID09PSBtZXJnZWRSZXNwb25zZSkge1xuXHRcdFx0dmFsdWUgPSBtZXJnZWRSZXF1ZXN0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YWx1ZSA9IHsgYXBwcm92ZVJlcXVlc3Q6IG1lcmdlZFJlcXVlc3QsIGFwcHJvdmVSZXNwb25zZTogbWVyZ2VkUmVzcG9uc2UgfTtcblx0XHR9XG5cblx0XHRhcHByb3ZlZFVybHNbcGF0dGVybl0gPSB2YWx1ZTtcblxuXHRcdGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFxuXHRcdFx0Q2hhdENvbmZpZ3VyYXRpb24uQXV0b0FwcHJvdmVkVXJscyxcblx0XHRcdGFwcHJvdmVkVXJsc1xuXHRcdCk7XG5cdH1cblxuXHRnZXRNYW5hZ2VBY3Rpb25zKCk6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvblF1aWNrVHJlZUl0ZW1bXSB7XG5cdFx0Y29uc3QgYXBwcm92ZWRVcmxzID0geyAuLi50aGlzLl9nZXRBcHByb3ZlZFVybHMoKSB9O1xuXHRcdGNvbnN0IGl0ZW1zOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25Db250cmlidXRpb25RdWlja1RyZWVJdGVtW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgW3BhdHRlcm4sIHNldHRpbmdzXSBvZiBPYmplY3QuZW50cmllcyhhcHByb3ZlZFVybHMpKSB7XG5cdFx0XHRjb25zdCBsYWJlbCA9IHBhdHRlcm47XG5cdFx0XHRsZXQgZGVzY3JpcHRpb246IHN0cmluZztcblxuXHRcdFx0aWYgKHR5cGVvZiBzZXR0aW5ncyA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uID0gc2V0dGluZ3Ncblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhcHByb3ZlQWxsJywgXCJBcHByb3ZlIGFsbFwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2RlbnlBbGwnLCBcIkRlbnkgYWxsXCIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdGlmIChzZXR0aW5ncy5hcHByb3ZlUmVxdWVzdCkge1xuXHRcdFx0XHRcdHBhcnRzLnB1c2gobG9jYWxpemUoJ3JlcXVlc3RzJywgXCJyZXF1ZXN0c1wiKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNldHRpbmdzLmFwcHJvdmVSZXNwb25zZSkge1xuXHRcdFx0XHRcdHBhcnRzLnB1c2gobG9jYWxpemUoJ3Jlc3BvbnNlcycsIFwicmVzcG9uc2VzXCIpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkZXNjcmlwdGlvbiA9IHBhcnRzLmxlbmd0aCA+IDBcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhcHByb3ZlcycsIFwiQXBwcm92ZXMgezB9XCIsIHBhcnRzLmpvaW4oJywgJykpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnbm9BcHByb3ZhbHMnLCBcIk5vIGFwcHJvdmFsc1wiKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXRlbTogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uUXVpY2tUcmVlSXRlbSA9IHtcblx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRidXR0b25zOiBbdHJhc2hCdXR0b25dLFxuXHRcdFx0XHRjaGVja2VkOiB0cnVlLFxuXHRcdFx0XHRvbkRpZENoYW5nZUNoZWNrZWQ6IChjaGVja2VkKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGNoZWNrZWQpIHtcblx0XHRcdFx0XHRcdGFwcHJvdmVkVXJsc1twYXR0ZXJuXSA9IHNldHRpbmdzO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRkZWxldGUgYXBwcm92ZWRVcmxzW3BhdHRlcm5dO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKENoYXRDb25maWd1cmF0aW9uLkF1dG9BcHByb3ZlZFVybHMsIGFwcHJvdmVkVXJscyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGl0ZW1zLnB1c2goaXRlbSk7XG5cdFx0fVxuXG5cdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRwaWNrYWJsZTogZmFsc2UsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ21vcmVPcHRpb25zTWFuYWdlJywgXCJNb3JlIE9wdGlvbnMuLi5cIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ29wZW5TZXR0aW5ncycsIFwiT3BlbiBzZXR0aW5nc1wiKSxcblx0XHRcdG9uRGlkT3BlbjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9wcmVmZXJlbmNlc1NlcnZpY2Uub3BlblVzZXJTZXR0aW5ncyh7IHF1ZXJ5OiBDaGF0Q29uZmlndXJhdGlvbi5BdXRvQXBwcm92ZWRVcmxzIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGl0ZW1zO1xuXHR9XG5cblx0YXN5bmMgcmVzZXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoXG5cdFx0XHRDaGF0Q29uZmlndXJhdGlvbi5BdXRvQXBwcm92ZWRVcmxzLFxuXHRcdFx0e31cblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QXBwcm92ZWRVcmxzKCk6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIGJvb2xlYW4gfCBJVXJsQXBwcm92YWxTZXR0aW5ncz4+IHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8UmVjb3JkPHN0cmluZywgYm9vbGVhbiB8IElVcmxBcHByb3ZhbFNldHRpbmdzPj4oXG5cdFx0XHRDaGF0Q29uZmlndXJhdGlvbi5BdXRvQXBwcm92ZWRVcmxzXG5cdFx0KSB8fCB7fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQTRCLDBCQUEwQztBQUN0RSxTQUFTLDJCQUEyQjtBQUNwQyxTQUEwQix1QkFBdUI7QUFDakQsU0FBUyx5QkFBeUI7QUFPbEMsU0FBUyxvQkFBb0IsaUJBQWlCLHFCQUEyQztBQUV6RixNQUFNLGNBQWlDO0FBQUEsRUFDdEMsV0FBVyxVQUFVLFlBQVksUUFBUSxLQUFLO0FBQUEsRUFDOUMsU0FBUyxTQUFTLFVBQVUsUUFBUTtBQUNyQztBQUVPLElBQU0sMENBQU4sTUFBb0c7QUFBQSxFQUcxRyxZQUNrQixVQUN1Qix1QkFD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QVc7QUFDbEMsc0JBQWMsV0FDWCxTQUFTLGNBQWMsYUFBYSxJQUNwQyxTQUFTLFdBQVcsVUFBVTtBQUFBLE1BQ2xDLE9BQU87QUFDTixjQUFNLFFBQWtCLENBQUM7QUFDekIsWUFBSSxTQUFTLGdCQUFnQjtBQUM1QixnQkFBTSxLQUFLLFNBQVMsWUFBWSxVQUFVLENBQUM7QUFBQSxRQUM1QztBQUNBLFlBQUksU0FBUyxpQkFBaUI7QUFDN0IsZ0JBQU0sS0FBSyxTQUFTLGFBQWEsV0FBVyxDQUFDO0FBQUEsUUFDOUM7QUFDQSxzQkFBYyxNQUFNLFNBQVMsSUFDMUIsU0FBUyxZQUFZLGdCQUFnQixNQUFNLEtBQUssSUFBSSxDQUFDLElBQ3JELFNBQVMsZUFBZSxjQUFjO0FBQUEsTUFDMUM7QUFFQSxZQUFNLE9BQWdFO0FBQUEsUUFDckU7QUFBQSxRQUNBO0FBQUEsUUFDQSxTQUFTLENBQUMsV0FBVztBQUFBLFFBQ3JCLFNBQVM7QUFBQSxRQUNULG9CQUFvQixDQUFDLFlBQVk7QUFDaEMsY0FBSSxTQUFTO0FBQ1oseUJBQWEsT0FBTyxJQUFJO0FBQUEsVUFDekIsT0FBTztBQUNOLG1CQUFPLGFBQWEsT0FBTztBQUFBLFVBQzVCO0FBRUEsZUFBSyxzQkFBc0IsWUFBWSxrQkFBa0Isa0JBQWtCLFlBQVk7QUFBQSxRQUN4RjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLEtBQUssSUFBSTtBQUFBLElBQ2hCO0FBRUEsVUFBTSxLQUFLO0FBQUEsTUFDVixVQUFVO0FBQUEsTUFDVixPQUFPLFNBQVMscUJBQXFCLGlCQUFpQjtBQUFBLE1BQ3RELGFBQWEsU0FBUyxnQkFBZ0IsZUFBZTtBQUFBLE1BQ3JELFdBQVcsTUFBTTtBQUNoQixhQUFLLG9CQUFvQixpQkFBaUIsRUFBRSxPQUFPLGtCQUFrQixpQkFBaUIsQ0FBQztBQUFBLE1BQ3hGO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sUUFBdUI7QUFDNUIsVUFBTSxLQUFLLHNCQUFzQjtBQUFBLE1BQ2hDLGtCQUFrQjtBQUFBLE1BQ2xCLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRVEsbUJBQTZFO0FBQ3BGLFdBQU8sS0FBSyxzQkFBc0I7QUFBQSxNQUNqQyxrQkFBa0I7QUFBQSxJQUNuQixLQUFLLENBQUM7QUFBQSxFQUNQO0FBQ0Q7QUFwVGEsMENBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
