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
import { PickerQuickAccessProvider, TriggerAction } from "../../../../../platform/quickinput/browser/pickerQuickAccess.js";
import { localize } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { matchesFuzzy } from "../../../../../base/common/filters.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { IAgentSessionsService } from "./agentSessionsService.js";
import { AgentSessionsSorter, groupAgentSessionsByDate } from "./agentSessionsViewer.js";
import { openSession } from "./agentSessionsOpener.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { AGENT_SESSION_DELETE_ACTION_ID, AGENT_SESSION_RENAME_ACTION_ID } from "./agentSessions.js";
import { createAgentSessionArchiveButtons, deleteButton, getSessionButtons, getSessionDescription, renameButton, shouldShowSessionInPicker } from "./agentSessionsPicker.js";
import { AgentSessionsFilter } from "./agentSessionsFilter.js";
const AGENT_SESSIONS_QUICK_ACCESS_PREFIX = "agent ";
let AgentSessionsQuickAccessProvider = class extends PickerQuickAccessProvider {
  constructor(agentSessionsService, instantiationService, commandService, configurationService) {
    super(AGENT_SESSIONS_QUICK_ACCESS_PREFIX, {
      canAcceptInBackground: true,
      noResultsPick: {
        label: localize("noAgentSessionResults", "No matching agent sessions")
      }
    });
    this.agentSessionsService = agentSessionsService;
    this.instantiationService = instantiationService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.sorter = new AgentSessionsSorter();
    this.filter = this._register(this.instantiationService.createInstance(AgentSessionsFilter, {}));
  }
  async _getPicks(filter) {
    const picks = [];
    const sessions = this.agentSessionsService.model.sessions.filter((session) => shouldShowSessionInPicker(session, this.filter)).sort(this.sorter.compare.bind(this.sorter));
    const groupedSessions = groupAgentSessionsByDate(sessions);
    for (const group of groupedSessions.values()) {
      if (group.sessions.length > 0) {
        picks.push({ type: "separator", label: group.label });
        for (const session of group.sessions) {
          const highlights = matchesFuzzy(filter, session.label, true);
          if (highlights) {
            picks.push(this.toPickItem(session, highlights));
          }
        }
      }
    }
    return picks;
  }
  toPickItem(session, highlights) {
    const description = getSessionDescription(session);
    const archiveButtons = createAgentSessionArchiveButtons(this.configurationService);
    const buttons = getSessionButtons(session, archiveButtons);
    return {
      label: session.label,
      description,
      highlights: { label: highlights },
      iconClass: ThemeIcon.asClassName(session.icon),
      buttons,
      trigger: async (buttonIndex) => {
        const button = buttons[buttonIndex];
        switch (button) {
          case renameButton:
            await this.commandService.executeCommand(AGENT_SESSION_RENAME_ACTION_ID, session);
            return TriggerAction.REFRESH_PICKER;
          case deleteButton:
            await this.commandService.executeCommand(AGENT_SESSION_DELETE_ACTION_ID, session);
            return TriggerAction.REFRESH_PICKER;
          case archiveButtons.archive:
          case archiveButtons.unarchive: {
            const newArchivedState = !session.isArchived();
            session.setArchived(newArchivedState);
            return TriggerAction.REFRESH_PICKER;
          }
          default:
            return TriggerAction.NO_ACTION;
        }
      },
      accept: (keyMods, event) => {
        this.instantiationService.invokeFunction(openSession, session, {
          sideBySide: event.inBackground,
          editorOptions: {
            preserveFocus: event.inBackground,
            pinned: event.inBackground
          }
        });
      }
    };
  }
};
AgentSessionsQuickAccessProvider = __decorateClass([
  __decorateParam(0, IAgentSessionsService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IConfigurationService)
], AgentSessionsQuickAccessProvider);
export {
  AGENT_SESSIONS_QUICK_ACCESS_PREFIX,
  AgentSessionsQuickAccessProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNRdWlja0FjY2Vzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElLZXlNb2RzLCBJUXVpY2tQaWNrRGlkQWNjZXB0RXZlbnQsIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXIsIElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0sIFRyaWdnZXJBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvcGlja2VyUXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWF0Y2gsIG1hdGNoZXNGdXp6eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4vYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uc1NvcnRlciwgZ3JvdXBBZ2VudFNlc3Npb25zQnlEYXRlIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25zVmlld2VyLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb24gfSBmcm9tICcuL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBvcGVuU2Vzc2lvbiB9IGZyb20gJy4vYWdlbnRTZXNzaW9uc09wZW5lci5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBR0VOVF9TRVNTSU9OX0RFTEVURV9BQ1RJT05fSUQsIEFHRU5UX1NFU1NJT05fUkVOQU1FX0FDVElPTl9JRCB9IGZyb20gJy4vYWdlbnRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBZ2VudFNlc3Npb25BcmNoaXZlQnV0dG9ucywgZGVsZXRlQnV0dG9uLCBnZXRTZXNzaW9uQnV0dG9ucywgZ2V0U2Vzc2lvbkRlc2NyaXB0aW9uLCByZW5hbWVCdXR0b24sIHNob3VsZFNob3dTZXNzaW9uSW5QaWNrZXIgfSBmcm9tICcuL2FnZW50U2Vzc2lvbnNQaWNrZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uc0ZpbHRlciB9IGZyb20gJy4vYWdlbnRTZXNzaW9uc0ZpbHRlci5qcyc7XG5cbmV4cG9ydCBjb25zdCBBR0VOVF9TRVNTSU9OU19RVUlDS19BQ0NFU1NfUFJFRklYID0gJ2FnZW50ICc7XG5cbmV4cG9ydCBjbGFzcyBBZ2VudFNlc3Npb25zUXVpY2tBY2Nlc3NQcm92aWRlciBleHRlbmRzIFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXI8SVBpY2tlclF1aWNrQWNjZXNzSXRlbT4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc29ydGVyID0gbmV3IEFnZW50U2Vzc2lvbnNTb3J0ZXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSBmaWx0ZXI6IEFnZW50U2Vzc2lvbnNGaWx0ZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBZ2VudFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50U2Vzc2lvbnNTZXJ2aWNlOiBJQWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKEFHRU5UX1NFU1NJT05TX1FVSUNLX0FDQ0VTU19QUkVGSVgsIHtcblx0XHRcdGNhbkFjY2VwdEluQmFja2dyb3VuZDogdHJ1ZSxcblx0XHRcdG5vUmVzdWx0c1BpY2s6IHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdub0FnZW50U2Vzc2lvblJlc3VsdHMnLCBcIk5vIG1hdGNoaW5nIGFnZW50IHNlc3Npb25zXCIpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5maWx0ZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNGaWx0ZXIsIHt9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX2dldFBpY2tzKGZpbHRlcjogc3RyaW5nKTogUHJvbWlzZTwoSVF1aWNrUGlja1NlcGFyYXRvciB8IElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0pW10+IHtcblx0XHRjb25zdCBwaWNrczogQXJyYXk8SVBpY2tlclF1aWNrQWNjZXNzSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3I+ID0gW107XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwuc2Vzc2lvbnNcblx0XHRcdC5maWx0ZXIoc2Vzc2lvbiA9PiBzaG91bGRTaG93U2Vzc2lvbkluUGlja2VyKHNlc3Npb24sIHRoaXMuZmlsdGVyKSlcblx0XHRcdC5zb3J0KHRoaXMuc29ydGVyLmNvbXBhcmUuYmluZCh0aGlzLnNvcnRlcikpO1xuXHRcdGNvbnN0IGdyb3VwZWRTZXNzaW9ucyA9IGdyb3VwQWdlbnRTZXNzaW9uc0J5RGF0ZShzZXNzaW9ucyk7XG5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3VwZWRTZXNzaW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKGdyb3VwLnNlc3Npb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogZ3JvdXAubGFiZWwgfSk7XG5cblx0XHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGdyb3VwLnNlc3Npb25zKSB7XG5cdFx0XHRcdFx0Y29uc3QgaGlnaGxpZ2h0cyA9IG1hdGNoZXNGdXp6eShmaWx0ZXIsIHNlc3Npb24ubGFiZWwsIHRydWUpO1xuXHRcdFx0XHRcdGlmIChoaWdobGlnaHRzKSB7XG5cdFx0XHRcdFx0XHRwaWNrcy5wdXNoKHRoaXMudG9QaWNrSXRlbShzZXNzaW9uLCBoaWdobGlnaHRzKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBpY2tzO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1BpY2tJdGVtKHNlc3Npb246IElBZ2VudFNlc3Npb24sIGhpZ2hsaWdodHM6IElNYXRjaFtdKTogSVBpY2tlclF1aWNrQWNjZXNzSXRlbSB7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBnZXRTZXNzaW9uRGVzY3JpcHRpb24oc2Vzc2lvbik7XG5cdFx0Y29uc3QgYXJjaGl2ZUJ1dHRvbnMgPSBjcmVhdGVBZ2VudFNlc3Npb25BcmNoaXZlQnV0dG9ucyh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBidXR0b25zID0gZ2V0U2Vzc2lvbkJ1dHRvbnMoc2Vzc2lvbiwgYXJjaGl2ZUJ1dHRvbnMpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiBzZXNzaW9uLmxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRoaWdobGlnaHRzOiB7IGxhYmVsOiBoaWdobGlnaHRzIH0sXG5cdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShzZXNzaW9uLmljb24pLFxuXHRcdFx0YnV0dG9ucyxcblx0XHRcdHRyaWdnZXI6IGFzeW5jIChidXR0b25JbmRleCkgPT4ge1xuXHRcdFx0XHRjb25zdCBidXR0b24gPSBidXR0b25zW2J1dHRvbkluZGV4XTtcblx0XHRcdFx0c3dpdGNoIChidXR0b24pIHtcblx0XHRcdFx0XHRjYXNlIHJlbmFtZUJ1dHRvbjpcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQUdFTlRfU0VTU0lPTl9SRU5BTUVfQUNUSU9OX0lELCBzZXNzaW9uKTtcblx0XHRcdFx0XHRcdHJldHVybiBUcmlnZ2VyQWN0aW9uLlJFRlJFU0hfUElDS0VSO1xuXHRcdFx0XHRcdGNhc2UgZGVsZXRlQnV0dG9uOlxuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBR0VOVF9TRVNTSU9OX0RFTEVURV9BQ1RJT05fSUQsIHNlc3Npb24pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIFRyaWdnZXJBY3Rpb24uUkVGUkVTSF9QSUNLRVI7XG5cdFx0XHRcdFx0Y2FzZSBhcmNoaXZlQnV0dG9ucy5hcmNoaXZlOlxuXHRcdFx0XHRcdGNhc2UgYXJjaGl2ZUJ1dHRvbnMudW5hcmNoaXZlOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBuZXdBcmNoaXZlZFN0YXRlID0gIXNlc3Npb24uaXNBcmNoaXZlZCgpO1xuXHRcdFx0XHRcdFx0c2Vzc2lvbi5zZXRBcmNoaXZlZChuZXdBcmNoaXZlZFN0YXRlKTtcblx0XHRcdFx0XHRcdHJldHVybiBUcmlnZ2VyQWN0aW9uLlJFRlJFU0hfUElDS0VSO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0cmV0dXJuIFRyaWdnZXJBY3Rpb24uTk9fQUNUSU9OO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YWNjZXB0OiAoa2V5TW9kczogSUtleU1vZHMsIGV2ZW50OiBJUXVpY2tQaWNrRGlkQWNjZXB0RXZlbnQpID0+IHtcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihvcGVuU2Vzc2lvbiwgc2Vzc2lvbiwge1xuXHRcdFx0XHRcdHNpZGVCeVNpZGU6IGV2ZW50LmluQmFja2dyb3VuZCxcblx0XHRcdFx0XHRlZGl0b3JPcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiBldmVudC5pbkJhY2tncm91bmQsXG5cdFx0XHRcdFx0XHRwaW5uZWQ6IGV2ZW50LmluQmFja2dyb3VuZFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLDJCQUFtRCxxQkFBcUI7QUFDakYsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBaUIsb0JBQW9CO0FBQ3JDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCLGdDQUFnQztBQUU5RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQyxzQ0FBc0M7QUFDL0UsU0FBUyxrQ0FBa0MsY0FBYyxtQkFBbUIsdUJBQXVCLGNBQWMsaUNBQWlDO0FBQ2xKLFNBQVMsMkJBQTJCO0FBRTdCLE1BQU0scUNBQXFDO0FBRTNDLElBQU0sbUNBQU4sY0FBK0MsMEJBQWtEO0FBQUEsRUFLdkcsWUFDeUMsc0JBQ0Esc0JBQ04sZ0JBQ00sc0JBQ3ZDO0FBQ0QsVUFBTSxvQ0FBb0M7QUFBQSxNQUN6Qyx1QkFBdUI7QUFBQSxNQUN2QixlQUFlO0FBQUEsUUFDZCxPQUFPLFNBQVMseUJBQXlCLDRCQUE0QjtBQUFBLE1BQ3RFO0FBQUEsSUFDRCxDQUFDO0FBVnVDO0FBQ0E7QUFDTjtBQUNNO0FBUHpDLFNBQWlCLFNBQVMsSUFBSSxvQkFBb0I7QUFlakQsU0FBSyxTQUFTLEtBQUssVUFBVSxLQUFLLHFCQUFxQixlQUFlLHFCQUFxQixDQUFDLENBQUMsQ0FBQztBQUFBLEVBQy9GO0FBQUEsRUFFQSxNQUFnQixVQUFVLFFBQTJFO0FBQ3BHLFVBQU0sUUFBNkQsQ0FBQztBQUVwRSxVQUFNLFdBQVcsS0FBSyxxQkFBcUIsTUFBTSxTQUMvQyxPQUFPLGFBQVcsMEJBQTBCLFNBQVMsS0FBSyxNQUFNLENBQUMsRUFDakUsS0FBSyxLQUFLLE9BQU8sUUFBUSxLQUFLLEtBQUssTUFBTSxDQUFDO0FBQzVDLFVBQU0sa0JBQWtCLHlCQUF5QixRQUFRO0FBRXpELGVBQVcsU0FBUyxnQkFBZ0IsT0FBTyxHQUFHO0FBQzdDLFVBQUksTUFBTSxTQUFTLFNBQVMsR0FBRztBQUM5QixjQUFNLEtBQUssRUFBRSxNQUFNLGFBQWEsT0FBTyxNQUFNLE1BQU0sQ0FBQztBQUVwRCxtQkFBVyxXQUFXLE1BQU0sVUFBVTtBQUNyQyxnQkFBTSxhQUFhLGFBQWEsUUFBUSxRQUFRLE9BQU8sSUFBSTtBQUMzRCxjQUFJLFlBQVk7QUFDZixrQkFBTSxLQUFLLEtBQUssV0FBVyxTQUFTLFVBQVUsQ0FBQztBQUFBLFVBQ2hEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLFdBQVcsU0FBd0IsWUFBOEM7QUFDeEYsVUFBTSxjQUFjLHNCQUFzQixPQUFPO0FBQ2pELFVBQU0saUJBQWlCLGlDQUFpQyxLQUFLLG9CQUFvQjtBQUNqRixVQUFNLFVBQVUsa0JBQWtCLFNBQVMsY0FBYztBQUV6RCxXQUFPO0FBQUEsTUFDTixPQUFPLFFBQVE7QUFBQSxNQUNmO0FBQUEsTUFDQSxZQUFZLEVBQUUsT0FBTyxXQUFXO0FBQUEsTUFDaEMsV0FBVyxVQUFVLFlBQVksUUFBUSxJQUFJO0FBQUEsTUFDN0M7QUFBQSxNQUNBLFNBQVMsT0FBTyxnQkFBZ0I7QUFDL0IsY0FBTSxTQUFTLFFBQVEsV0FBVztBQUNsQyxnQkFBUSxRQUFRO0FBQUEsVUFDZixLQUFLO0FBQ0osa0JBQU0sS0FBSyxlQUFlLGVBQWUsZ0NBQWdDLE9BQU87QUFDaEYsbUJBQU8sY0FBYztBQUFBLFVBQ3RCLEtBQUs7QUFDSixrQkFBTSxLQUFLLGVBQWUsZUFBZSxnQ0FBZ0MsT0FBTztBQUNoRixtQkFBTyxjQUFjO0FBQUEsVUFDdEIsS0FBSyxlQUFlO0FBQUEsVUFDcEIsS0FBSyxlQUFlLFdBQVc7QUFDOUIsa0JBQU0sbUJBQW1CLENBQUMsUUFBUSxXQUFXO0FBQzdDLG9CQUFRLFlBQVksZ0JBQWdCO0FBQ3BDLG1CQUFPLGNBQWM7QUFBQSxVQUN0QjtBQUFBLFVBQ0E7QUFDQyxtQkFBTyxjQUFjO0FBQUEsUUFDdkI7QUFBQSxNQUNEO0FBQUEsTUFDQSxRQUFRLENBQUMsU0FBbUIsVUFBb0M7QUFDL0QsYUFBSyxxQkFBcUIsZUFBZSxhQUFhLFNBQVM7QUFBQSxVQUM5RCxZQUFZLE1BQU07QUFBQSxVQUNsQixlQUFlO0FBQUEsWUFDZCxlQUFlLE1BQU07QUFBQSxZQUNyQixRQUFRLE1BQU07QUFBQSxVQUNmO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFyRmEsbUNBQU47QUFBQSxFQU1KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FUVTsiLAogICJuYW1lcyI6IFtdCn0K
