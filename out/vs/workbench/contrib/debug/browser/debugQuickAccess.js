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
import { localize } from "../../../../nls.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IDebugService } from "../common/debug.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { matchesFuzzy } from "../../../../base/common/filters.js";
import { ADD_CONFIGURATION_ID, DEBUG_QUICK_ACCESS_PREFIX } from "./debugCommands.js";
import { debugConfigure, debugRemoveConfig } from "./debugIcons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
let StartDebugQuickAccessProvider = class extends PickerQuickAccessProvider {
  constructor(debugService, contextService, commandService, notificationService) {
    super(DEBUG_QUICK_ACCESS_PREFIX, {
      noResultsPick: {
        label: localize("noDebugResults", "No matching launch configurations")
      }
    });
    this.debugService = debugService;
    this.contextService = contextService;
    this.commandService = commandService;
    this.notificationService = notificationService;
  }
  async _getPicks(filter) {
    const picks = [];
    if (!this.debugService.getAdapterManager().hasEnabledDebuggers()) {
      return [];
    }
    picks.push({ type: "separator", label: "launch.json" });
    const configManager = this.debugService.getConfigurationManager();
    const selectedConfiguration = configManager.selectedConfiguration;
    let lastGroup;
    for (const config of configManager.getAllConfigurations()) {
      const highlights = matchesFuzzy(filter, config.name, true);
      if (highlights) {
        const pick = {
          label: config.name,
          description: this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? config.launch.name : "",
          highlights: { label: highlights },
          buttons: [{
            iconClass: ThemeIcon.asClassName(debugConfigure),
            tooltip: localize("customizeLaunchConfig", "Configure Launch Configuration")
          }],
          trigger: () => {
            config.launch.openConfigFile({ preserveFocus: false });
            return TriggerAction.CLOSE_PICKER;
          },
          accept: async () => {
            await configManager.selectConfiguration(config.launch, config.name);
            try {
              await this.debugService.startDebugging(config.launch, void 0, { startedByUser: true });
            } catch (error) {
              this.notificationService.error(error);
            }
          }
        };
        if (selectedConfiguration.name === config.name && selectedConfiguration.launch === config.launch) {
          const separator = { type: "separator", label: localize("mostRecent", "Most Recent") };
          picks.unshift(separator, pick);
          continue;
        }
        if (lastGroup !== config.presentation?.group) {
          picks.push({ type: "separator" });
          lastGroup = config.presentation?.group;
        }
        picks.push(pick);
      }
    }
    const dynamicProviders = await configManager.getDynamicProviders();
    if (dynamicProviders.length > 0) {
      picks.push({
        type: "separator",
        label: localize({
          key: "contributed",
          comment: ["contributed is lower case because it looks better like that in UI. Nothing preceeds it. It is a name of the grouping of debug configurations."]
        }, "contributed")
      });
    }
    configManager.getRecentDynamicConfigurations().forEach(({ name, type }) => {
      const highlights = matchesFuzzy(filter, name, true);
      if (highlights) {
        picks.push({
          label: name,
          highlights: { label: highlights },
          buttons: [{
            iconClass: ThemeIcon.asClassName(debugRemoveConfig),
            tooltip: localize("removeLaunchConfig", "Remove Launch Configuration")
          }],
          trigger: () => {
            configManager.removeRecentDynamicConfigurations(name, type);
            return TriggerAction.CLOSE_PICKER;
          },
          accept: async () => {
            await configManager.selectConfiguration(void 0, name, void 0, { type });
            try {
              const { launch, getConfig } = configManager.selectedConfiguration;
              const config = await getConfig();
              await this.debugService.startDebugging(launch, config, { startedByUser: true });
            } catch (error) {
              this.notificationService.error(error);
            }
          }
        });
      }
    });
    dynamicProviders.forEach((provider) => {
      picks.push({
        label: `$(folder) ${provider.label}...`,
        ariaLabel: localize({ key: "providerAriaLabel", comment: ['Placeholder stands for the provider label. For example "NodeJS".'] }, "{0} contributed configurations", provider.label),
        accept: async () => {
          const pick = await provider.pick();
          if (pick) {
            await configManager.selectConfiguration(pick.launch, pick.config.name, pick.config, { type: provider.type });
            this.debugService.startDebugging(pick.launch, pick.config, { startedByUser: true });
          }
        }
      });
    });
    const visibleLaunches = configManager.getLaunches().filter((launch) => !launch.hidden);
    if (visibleLaunches.length > 0) {
      picks.push({ type: "separator", label: localize("configure", "configure") });
    }
    for (const launch of visibleLaunches) {
      const label = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? localize("addConfigTo", "Add Config ({0})...", launch.name) : localize("addConfiguration", "Add Configuration...");
      picks.push({
        label,
        description: this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? launch.name : "",
        highlights: { label: matchesFuzzy(filter, label, true) ?? void 0 },
        accept: () => this.commandService.executeCommand(ADD_CONFIGURATION_ID, launch.uri.toString())
      });
    }
    return picks;
  }
};
StartDebugQuickAccessProvider = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, INotificationService)
], StartDebugQuickAccessProvider);
export {
  StartDebugQuickAccessProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdRdWlja0FjY2Vzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXIsIElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0sIFRyaWdnZXJBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvcGlja2VyUXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGVidWdTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgbWF0Y2hlc0Z1enp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBBRERfQ09ORklHVVJBVElPTl9JRCwgREVCVUdfUVVJQ0tfQUNDRVNTX1BSRUZJWCB9IGZyb20gJy4vZGVidWdDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBkZWJ1Z0NvbmZpZ3VyZSwgZGVidWdSZW1vdmVDb25maWcgfSBmcm9tICcuL2RlYnVnSWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcblxuZXhwb3J0IGNsYXNzIFN0YXJ0RGVidWdRdWlja0FjY2Vzc1Byb3ZpZGVyIGV4dGVuZHMgUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlcjxJUGlja2VyUXVpY2tBY2Nlc3NJdGVtPiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKERFQlVHX1FVSUNLX0FDQ0VTU19QUkVGSVgsIHtcblx0XHRcdG5vUmVzdWx0c1BpY2s6IHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdub0RlYnVnUmVzdWx0cycsIFwiTm8gbWF0Y2hpbmcgbGF1bmNoIGNvbmZpZ3VyYXRpb25zXCIpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX2dldFBpY2tzKGZpbHRlcjogc3RyaW5nKTogUHJvbWlzZTwoSVF1aWNrUGlja1NlcGFyYXRvciB8IElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0pW10+IHtcblx0XHRjb25zdCBwaWNrczogQXJyYXk8SVBpY2tlclF1aWNrQWNjZXNzSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3I+ID0gW107XG5cdFx0aWYgKCF0aGlzLmRlYnVnU2VydmljZS5nZXRBZGFwdGVyTWFuYWdlcigpLmhhc0VuYWJsZWREZWJ1Z2dlcnMoKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6ICdsYXVuY2guanNvbicgfSk7XG5cblx0XHRjb25zdCBjb25maWdNYW5hZ2VyID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Q29uZmlndXJhdGlvbk1hbmFnZXIoKTtcblx0XHRjb25zdCBzZWxlY3RlZENvbmZpZ3VyYXRpb24gPSBjb25maWdNYW5hZ2VyLnNlbGVjdGVkQ29uZmlndXJhdGlvbjtcblxuXHRcdC8vIEVudHJpZXM6IGNvbmZpZ3Ncblx0XHRsZXQgbGFzdEdyb3VwOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBjb25maWcgb2YgY29uZmlnTWFuYWdlci5nZXRBbGxDb25maWd1cmF0aW9ucygpKSB7XG5cdFx0XHRjb25zdCBoaWdobGlnaHRzID0gbWF0Y2hlc0Z1enp5KGZpbHRlciwgY29uZmlnLm5hbWUsIHRydWUpO1xuXHRcdFx0aWYgKGhpZ2hsaWdodHMpIHtcblxuXHRcdFx0XHRjb25zdCBwaWNrID0ge1xuXHRcdFx0XHRcdGxhYmVsOiBjb25maWcubmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UgPyBjb25maWcubGF1bmNoLm5hbWUgOiAnJyxcblx0XHRcdFx0XHRoaWdobGlnaHRzOiB7IGxhYmVsOiBoaWdobGlnaHRzIH0sXG5cdFx0XHRcdFx0YnV0dG9uczogW3tcblx0XHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGRlYnVnQ29uZmlndXJlKSxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjdXN0b21pemVMYXVuY2hDb25maWcnLCBcIkNvbmZpZ3VyZSBMYXVuY2ggQ29uZmlndXJhdGlvblwiKVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdHRyaWdnZXI6ICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbmZpZy5sYXVuY2gub3BlbkNvbmZpZ0ZpbGUoeyBwcmVzZXJ2ZUZvY3VzOiBmYWxzZSB9KTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIFRyaWdnZXJBY3Rpb24uQ0xPU0VfUElDS0VSO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YWNjZXB0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRhd2FpdCBjb25maWdNYW5hZ2VyLnNlbGVjdENvbmZpZ3VyYXRpb24oY29uZmlnLmxhdW5jaCwgY29uZmlnLm5hbWUpO1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhcnREZWJ1Z2dpbmcoY29uZmlnLmxhdW5jaCwgdW5kZWZpbmVkLCB7IHN0YXJ0ZWRCeVVzZXI6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHQvLyBNb3N0IHJlY2VudGx5IHVzZWQgY29uZmlndXJhdGlvblxuXHRcdFx0XHRpZiAoc2VsZWN0ZWRDb25maWd1cmF0aW9uLm5hbWUgPT09IGNvbmZpZy5uYW1lICYmIHNlbGVjdGVkQ29uZmlndXJhdGlvbi5sYXVuY2ggPT09IGNvbmZpZy5sYXVuY2gpIHtcblx0XHRcdFx0XHRjb25zdCBzZXBhcmF0b3I6IElRdWlja1BpY2tTZXBhcmF0b3IgPSB7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ21vc3RSZWNlbnQnLCAnTW9zdCBSZWNlbnQnKSB9O1xuXHRcdFx0XHRcdHBpY2tzLnVuc2hpZnQoc2VwYXJhdG9yLCBwaWNrKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNlcGFyYXRvclxuXHRcdFx0XHRpZiAobGFzdEdyb3VwICE9PSBjb25maWcucHJlc2VudGF0aW9uPy5ncm91cCkge1xuXHRcdFx0XHRcdHBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJyB9KTtcblx0XHRcdFx0XHRsYXN0R3JvdXAgPSBjb25maWcucHJlc2VudGF0aW9uPy5ncm91cDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIExhdW5jaCBlbnRyeVxuXG5cdFx0XHRcdHBpY2tzLnB1c2gocGljayk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRW50cmllcyBkZXRlY3RlZCBjb25maWd1cmF0aW9uc1xuXHRcdGNvbnN0IGR5bmFtaWNQcm92aWRlcnMgPSBhd2FpdCBjb25maWdNYW5hZ2VyLmdldER5bmFtaWNQcm92aWRlcnMoKTtcblx0XHRpZiAoZHluYW1pY1Byb3ZpZGVycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdFx0dHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSh7XG5cdFx0XHRcdFx0a2V5OiAnY29udHJpYnV0ZWQnLFxuXHRcdFx0XHRcdGNvbW1lbnQ6IFsnY29udHJpYnV0ZWQgaXMgbG93ZXIgY2FzZSBiZWNhdXNlIGl0IGxvb2tzIGJldHRlciBsaWtlIHRoYXQgaW4gVUkuIE5vdGhpbmcgcHJlY2VlZHMgaXQuIEl0IGlzIGEgbmFtZSBvZiB0aGUgZ3JvdXBpbmcgb2YgZGVidWcgY29uZmlndXJhdGlvbnMuJ11cblx0XHRcdFx0fSwgXCJjb250cmlidXRlZFwiKVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uZmlnTWFuYWdlci5nZXRSZWNlbnREeW5hbWljQ29uZmlndXJhdGlvbnMoKS5mb3JFYWNoKCh7IG5hbWUsIHR5cGUgfSkgPT4ge1xuXHRcdFx0Y29uc3QgaGlnaGxpZ2h0cyA9IG1hdGNoZXNGdXp6eShmaWx0ZXIsIG5hbWUsIHRydWUpO1xuXHRcdFx0aWYgKGhpZ2hsaWdodHMpIHtcblx0XHRcdFx0cGlja3MucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IG5hbWUsXG5cdFx0XHRcdFx0aGlnaGxpZ2h0czogeyBsYWJlbDogaGlnaGxpZ2h0cyB9LFxuXHRcdFx0XHRcdGJ1dHRvbnM6IFt7XG5cdFx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShkZWJ1Z1JlbW92ZUNvbmZpZyksXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgncmVtb3ZlTGF1bmNoQ29uZmlnJywgXCJSZW1vdmUgTGF1bmNoIENvbmZpZ3VyYXRpb25cIilcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHR0cmlnZ2VyOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25maWdNYW5hZ2VyLnJlbW92ZVJlY2VudER5bmFtaWNDb25maWd1cmF0aW9ucyhuYW1lLCB0eXBlKTtcblx0XHRcdFx0XHRcdHJldHVybiBUcmlnZ2VyQWN0aW9uLkNMT1NFX1BJQ0tFUjtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFjY2VwdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXdhaXQgY29uZmlnTWFuYWdlci5zZWxlY3RDb25maWd1cmF0aW9uKHVuZGVmaW5lZCwgbmFtZSwgdW5kZWZpbmVkLCB7IHR5cGUgfSk7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB7IGxhdW5jaCwgZ2V0Q29uZmlnIH0gPSBjb25maWdNYW5hZ2VyLnNlbGVjdGVkQ29uZmlndXJhdGlvbjtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgZ2V0Q29uZmlnKCk7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZGVidWdTZXJ2aWNlLnN0YXJ0RGVidWdnaW5nKGxhdW5jaCwgY29uZmlnLCB7IHN0YXJ0ZWRCeVVzZXI6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRkeW5hbWljUHJvdmlkZXJzLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuXHRcdFx0cGlja3MucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBgJChmb2xkZXIpICR7cHJvdmlkZXIubGFiZWx9Li4uYCxcblx0XHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ3Byb3ZpZGVyQXJpYUxhYmVsJywgY29tbWVudDogWydQbGFjZWhvbGRlciBzdGFuZHMgZm9yIHRoZSBwcm92aWRlciBsYWJlbC4gRm9yIGV4YW1wbGUgXCJOb2RlSlNcIi4nXSB9LCBcInswfSBjb250cmlidXRlZCBjb25maWd1cmF0aW9uc1wiLCBwcm92aWRlci5sYWJlbCksXG5cdFx0XHRcdGFjY2VwdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHBpY2sgPSBhd2FpdCBwcm92aWRlci5waWNrKCk7XG5cdFx0XHRcdFx0aWYgKHBpY2spIHtcblx0XHRcdFx0XHRcdC8vIFVzZSB0aGUgdHlwZSBvZiB0aGUgcHJvdmlkZXIsIG5vdCBvZiB0aGUgY29uZmlnIHNpbmNlIGNvbmZpZyBzb21ldGltZXMgaGF2ZSBzdWJ0eXBlcyAoZm9yIGV4YW1wbGUgXCJub2RlLXRlcm1pbmFsXCIpXG5cdFx0XHRcdFx0XHRhd2FpdCBjb25maWdNYW5hZ2VyLnNlbGVjdENvbmZpZ3VyYXRpb24ocGljay5sYXVuY2gsIHBpY2suY29uZmlnLm5hbWUsIHBpY2suY29uZmlnLCB7IHR5cGU6IHByb3ZpZGVyLnR5cGUgfSk7XG5cdFx0XHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5zdGFydERlYnVnZ2luZyhwaWNrLmxhdW5jaCwgcGljay5jb25maWcsIHsgc3RhcnRlZEJ5VXNlcjogdHJ1ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cblx0XHQvLyBFbnRyaWVzOiBsYXVuY2hlc1xuXHRcdGNvbnN0IHZpc2libGVMYXVuY2hlcyA9IGNvbmZpZ01hbmFnZXIuZ2V0TGF1bmNoZXMoKS5maWx0ZXIobGF1bmNoID0+ICFsYXVuY2guaGlkZGVuKTtcblxuXHRcdC8vIFNlcGFyYXRvclxuXHRcdGlmICh2aXNpYmxlTGF1bmNoZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ2NvbmZpZ3VyZScsIFwiY29uZmlndXJlXCIpIH0pO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgbGF1bmNoIG9mIHZpc2libGVMYXVuY2hlcykge1xuXHRcdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSA/XG5cdFx0XHRcdGxvY2FsaXplKFwiYWRkQ29uZmlnVG9cIiwgXCJBZGQgQ29uZmlnICh7MH0pLi4uXCIsIGxhdW5jaC5uYW1lKSA6XG5cdFx0XHRcdGxvY2FsaXplKCdhZGRDb25maWd1cmF0aW9uJywgXCJBZGQgQ29uZmlndXJhdGlvbi4uLlwiKTtcblxuXHRcdFx0Ly8gQWRkIENvbmZpZyBlbnRyeVxuXHRcdFx0cGlja3MucHVzaCh7XG5cdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UgPyBsYXVuY2gubmFtZSA6ICcnLFxuXHRcdFx0XHRoaWdobGlnaHRzOiB7IGxhYmVsOiBtYXRjaGVzRnV6enkoZmlsdGVyLCBsYWJlbCwgdHJ1ZSkgPz8gdW5kZWZpbmVkIH0sXG5cdFx0XHRcdGFjY2VwdDogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBRERfQ09ORklHVVJBVElPTl9JRCwgbGF1bmNoLnVyaS50b1N0cmluZygpKVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBpY2tzO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsMkJBQW1ELHFCQUFxQjtBQUNqRixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDBCQUEwQixzQkFBc0I7QUFDekQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBc0IsaUNBQWlDO0FBQ2hFLFNBQVMsZ0JBQWdCLHlCQUF5QjtBQUNsRCxTQUFTLGlCQUFpQjtBQUVuQixJQUFNLGdDQUFOLGNBQTRDLDBCQUFrRDtBQUFBLEVBRXBHLFlBQ2lDLGNBQ1csZ0JBQ1QsZ0JBQ0sscUJBQ3RDO0FBQ0QsVUFBTSwyQkFBMkI7QUFBQSxNQUNoQyxlQUFlO0FBQUEsUUFDZCxPQUFPLFNBQVMsa0JBQWtC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
