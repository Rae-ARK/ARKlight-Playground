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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { isProposedApiEnabled } from "../../../services/extensions/common/extensions.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IRemoteCodingAgentsService } from "../common/remoteCodingAgentsService.js";
const extensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "remoteCodingAgents",
  jsonSchema: {
    description: localize("remoteCodingAgentsExtPoint", "Contributes remote coding agent integrations to the chat widget."),
    type: "array",
    items: {
      type: "object",
      properties: {
        id: {
          description: localize("remoteCodingAgentsExtPoint.id", "A unique identifier for this item."),
          type: "string"
        },
        command: {
          description: localize("remoteCodingAgentsExtPoint.command", 'Identifier of the command to execute. The command must be declared in the "commands" section.'),
          type: "string"
        },
        displayName: {
          description: localize("remoteCodingAgentsExtPoint.displayName", "A user-friendly name for this item which is used for display in menus."),
          type: "string"
        },
        description: {
          description: localize("remoteCodingAgentsExtPoint.description", "Description of the remote agent for use in menus and tooltips."),
          type: "string"
        },
        followUpRegex: {
          description: localize("remoteCodingAgentsExtPoint.followUpRegex", "The last occurrence of pattern in an existing chat conversation is sent to the contributing extension to facilitate follow-up responses."),
          type: "string"
        },
        when: {
          description: localize("remoteCodingAgentsExtPoint.when", "Condition which must be true to show this item."),
          type: "string"
        }
      },
      required: ["command", "displayName"]
    }
  }
});
let RemoteCodingAgentsContribution = class extends Disposable {
  constructor(remoteCodingAgentsService) {
    super();
    this.remoteCodingAgentsService = remoteCodingAgentsService;
    extensionPoint.setHandler((extensions) => {
      for (const ext of extensions) {
        if (!isProposedApiEnabled(ext.description, "remoteCodingAgents")) {
          continue;
        }
        if (!Array.isArray(ext.value)) {
          continue;
        }
        for (const contribution of ext.value) {
          const command = MenuRegistry.getCommand(contribution.command);
          if (!command) {
            continue;
          }
          const agent = {
            id: contribution.id,
            command: contribution.command,
            displayName: contribution.displayName,
            description: contribution.description,
            followUpRegex: contribution.followUpRegex,
            when: contribution.when
          };
          this.remoteCodingAgentsService.registerAgent(agent);
        }
      }
    });
  }
};
RemoteCodingAgentsContribution = __decorateClass([
  __decorateParam(0, IRemoteCodingAgentsService)
], RemoteCodingAgentsContribution);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RemoteCodingAgentsContribution, LifecyclePhase.Restored);
export {
  RemoteCodingAgentsContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZUNvZGluZ0FnZW50cy9icm93c2VyL3JlbW90ZUNvZGluZ0FnZW50cy5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuXG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMsIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUNvZGluZ0FnZW50LCBJUmVtb3RlQ29kaW5nQWdlbnRzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9yZW1vdGVDb2RpbmdBZ2VudHNTZXJ2aWNlLmpzJztcblxuaW50ZXJmYWNlIElSZW1vdGVDb2RpbmdBZ2VudEV4dGVuc2lvblBvaW50IHtcblx0aWQ6IHN0cmluZztcblx0Y29tbWFuZDogc3RyaW5nO1xuXHRkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRkZXNjcmlwdGlvbj86IHN0cmluZztcblx0Zm9sbG93VXBSZWdleD86IHN0cmluZztcblx0d2hlbj86IHN0cmluZztcbn1cblxuY29uc3QgZXh0ZW5zaW9uUG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJUmVtb3RlQ29kaW5nQWdlbnRFeHRlbnNpb25Qb2ludFtdPih7XG5cdGV4dGVuc2lvblBvaW50OiAncmVtb3RlQ29kaW5nQWdlbnRzJyxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlQ29kaW5nQWdlbnRzRXh0UG9pbnQnLCAnQ29udHJpYnV0ZXMgcmVtb3RlIGNvZGluZyBhZ2VudCBpbnRlZ3JhdGlvbnMgdG8gdGhlIGNoYXQgd2lkZ2V0LicpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlQ29kaW5nQWdlbnRzRXh0UG9pbnQuaWQnLCAnQSB1bmlxdWUgaWRlbnRpZmllciBmb3IgdGhpcyBpdGVtLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGVDb2RpbmdBZ2VudHNFeHRQb2ludC5jb21tYW5kJywgJ0lkZW50aWZpZXIgb2YgdGhlIGNvbW1hbmQgdG8gZXhlY3V0ZS4gVGhlIGNvbW1hbmQgbXVzdCBiZSBkZWNsYXJlZCBpbiB0aGUgXCJjb21tYW5kc1wiIHNlY3Rpb24uJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzcGxheU5hbWU6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZUNvZGluZ0FnZW50c0V4dFBvaW50LmRpc3BsYXlOYW1lJywgJ0EgdXNlci1mcmllbmRseSBuYW1lIGZvciB0aGlzIGl0ZW0gd2hpY2ggaXMgdXNlZCBmb3IgZGlzcGxheSBpbiBtZW51cy4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlQ29kaW5nQWdlbnRzRXh0UG9pbnQuZGVzY3JpcHRpb24nLCAnRGVzY3JpcHRpb24gb2YgdGhlIHJlbW90ZSBhZ2VudCBmb3IgdXNlIGluIG1lbnVzIGFuZCB0b29sdGlwcy4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRmb2xsb3dVcFJlZ2V4OiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGVDb2RpbmdBZ2VudHNFeHRQb2ludC5mb2xsb3dVcFJlZ2V4JywgJ1RoZSBsYXN0IG9jY3VycmVuY2Ugb2YgcGF0dGVybiBpbiBhbiBleGlzdGluZyBjaGF0IGNvbnZlcnNhdGlvbiBpcyBzZW50IHRvIHRoZSBjb250cmlidXRpbmcgZXh0ZW5zaW9uIHRvIGZhY2lsaXRhdGUgZm9sbG93LXVwIHJlc3BvbnNlcy4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0d2hlbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlQ29kaW5nQWdlbnRzRXh0UG9pbnQud2hlbicsICdDb25kaXRpb24gd2hpY2ggbXVzdCBiZSB0cnVlIHRvIHNob3cgdGhpcyBpdGVtLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0cmVxdWlyZWQ6IFsnY29tbWFuZCcsICdkaXNwbGF5TmFtZSddLFxuXHRcdH1cblx0fVxufSk7XG5cbmV4cG9ydCBjbGFzcyBSZW1vdGVDb2RpbmdBZ2VudHNDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUmVtb3RlQ29kaW5nQWdlbnRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUNvZGluZ0FnZW50c1NlcnZpY2U6IElSZW1vdGVDb2RpbmdBZ2VudHNTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0ZXh0ZW5zaW9uUG9pbnQuc2V0SGFuZGxlcihleHRlbnNpb25zID0+IHtcblx0XHRcdGZvciAoY29uc3QgZXh0IG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdFx0aWYgKCFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHQuZGVzY3JpcHRpb24sICdyZW1vdGVDb2RpbmdBZ2VudHMnKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheShleHQudmFsdWUpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBjb250cmlidXRpb24gb2YgZXh0LnZhbHVlKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IE1lbnVSZWdpc3RyeS5nZXRDb21tYW5kKGNvbnRyaWJ1dGlvbi5jb21tYW5kKTtcblx0XHRcdFx0XHRpZiAoIWNvbW1hbmQpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGFnZW50OiBJUmVtb3RlQ29kaW5nQWdlbnQgPSB7XG5cdFx0XHRcdFx0XHRpZDogY29udHJpYnV0aW9uLmlkLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogY29udHJpYnV0aW9uLmNvbW1hbmQsXG5cdFx0XHRcdFx0XHRkaXNwbGF5TmFtZTogY29udHJpYnV0aW9uLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGNvbnRyaWJ1dGlvbi5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdGZvbGxvd1VwUmVnZXg6IGNvbnRyaWJ1dGlvbi5mb2xsb3dVcFJlZ2V4LFxuXHRcdFx0XHRcdFx0d2hlbjogY29udHJpYnV0aW9uLndoZW5cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHRoaXMucmVtb3RlQ29kaW5nQWdlbnRzU2VydmljZS5yZWdpc3RlckFnZW50KGFnZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmNvbnN0IHdvcmtiZW5jaFJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpO1xud29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oUmVtb3RlQ29kaW5nQWdlbnRzQ29udHJpYnV0aW9uLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQWlDLGNBQWMsMkJBQTREO0FBQzNHLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQTZCLGtDQUFrQztBQVcvRCxNQUFNLGlCQUFpQixtQkFBbUIsdUJBQTJEO0FBQUEsRUFDcEcsZ0JBQWdCO0FBQUEsRUFDaEIsWUFBWTtBQUFBLElBQ1gsYUFBYSxTQUFTLDhCQUE4QixrRUFBa0U7QUFBQSxJQUN0SCxNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixZQUFZO0FBQUEsUUFDWCxJQUFJO0FBQUEsVUFDSCxhQUFhLFNBQVMsaUNBQWlDLG9DQUFvQztBQUFBLFVBQzNGLE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQSxTQUFTO0FBQUEsVUFDUixhQUFhLFNBQVMsc0NBQXNDLCtGQUErRjtBQUFBLFVBQzNKLE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQSxhQUFhO0FBQUEsVUFDWixhQUFhLFNBQVMsMENBQTBDLHdFQUF3RTtBQUFBLFVBQ3hJLE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQSxhQUFhO0FBQUEsVUFDWixhQUFhLFNBQVMsMENBQTBDLGdFQUFnRTtBQUFBLFVBQ2hJLE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQSxlQUFlO0FBQUEsVUFDZCxhQUFhLFNBQVMsNENBQTRDLDBJQUEwSTtBQUFBLFVBQzVNLE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQSxNQUFNO0FBQUEsVUFDTCxhQUFhLFNBQVMsbUNBQW1DLGlEQUFpRDtBQUFBLFVBQzFHLE1BQU07QUFBQSxRQUNQO0FBQUEsTUFDRDtBQUFBLE1BQ0EsVUFBVSxDQUFDLFdBQVcsYUFBYTtBQUFBLElBQ3BDO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFTSxJQUFNLGlDQUFOLGNBQTZDLFdBQTZDO0FBQUEsRUFDaEcsWUFDOEMsMkJBQzVDO0FBQ0QsVUFBTTtBQUZ1QztBQUc3QyxtQkFBZSxXQUFXLGdCQUFjO0FBQ3ZDLGlCQUFXLE9BQU8sWUFBWTtBQUM3QixZQUFJLENBQUMscUJBQXFCLElBQUksYUFBYSxvQkFBb0IsR0FBRztBQUNqRTtBQUFBLFFBQ0Q7QUFDQSxZQUFJLENBQUMsTUFBTSxRQUFRLElBQUksS0FBSyxHQUFHO0FBQzlCO0FBQUEsUUFDRDtBQUNBLG1CQUFXLGdCQUFnQixJQUFJLE9BQU87QUFDckMsZ0JBQU0sVUFBVSxhQUFhLFdBQVcsYUFBYSxPQUFPO0FBQzVELGNBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxVQUNEO0FBRUEsZ0JBQU0sUUFBNEI7QUFBQSxZQUNqQyxJQUFJLGFBQWE7QUFBQSxZQUNqQixTQUFTLGFBQWE7QUFBQSxZQUN0QixhQUFhLGFBQWE7QUFBQSxZQUMxQixhQUFhLGFBQWE7QUFBQSxZQUMxQixlQUFlLGFBQWE7QUFBQSxZQUM1QixNQUFNLGFBQWE7QUFBQSxVQUNwQjtBQUNBLGVBQUssMEJBQTBCLGNBQWMsS0FBSztBQUFBLFFBQ25EO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQWhDYSxpQ0FBTjtBQUFBLEVBRUo7QUFBQSxHQUZVO0FBa0NiLE1BQU0sb0JBQW9CLFNBQVMsR0FBb0Msb0JBQW9CLFNBQVM7QUFDcEcsa0JBQWtCLDhCQUE4QixnQ0FBZ0MsZUFBZSxRQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
