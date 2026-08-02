import { isWeb, isWindows } from "../../../base/common/platform.js";
import { PolicyCategory } from "../../../base/common/policy.js";
import { localize } from "../../../nls.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../configuration/common/configurationRegistry.js";
import { Registry } from "../../registry/common/platform.js";
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  id: "update",
  order: 15,
  title: localize("updateConfigurationTitle", "Update"),
  type: "object",
  properties: {
    "update.mode": {
      type: "string",
      enum: ["none", "manual", "start", "default"],
      default: "default",
      scope: ConfigurationScope.APPLICATION,
      description: localize("updateMode", "Configure whether you receive automatic updates. The updates are fetched from a Microsoft online service."),
      tags: ["usesOnlineServices"],
      enumDescriptions: [
        localize("none", "Disable updates."),
        localize("manual", "Disable automatic background update checks. Updates will be available if you manually check for updates."),
        localize("start", "Check for updates only on startup. Disable automatic background update checks."),
        localize("default", "Enable automatic update checks. Code will check for updates automatically and periodically.")
      ],
      policy: {
        name: "UpdateMode",
        category: PolicyCategory.Update,
        minimumVersion: "1.67",
        localization: {
          description: { key: "updateMode", value: localize("updateMode", "Configure whether you receive automatic updates. The updates are fetched from a Microsoft online service.") },
          enumDescriptions: [
            {
              key: "none",
              value: localize("none", "Disable updates.")
            },
            {
              key: "manual",
              value: localize("manual", "Disable automatic background update checks. Updates will be available if you manually check for updates.")
            },
            {
              key: "start",
              value: localize("start", "Check for updates only on startup. Disable automatic background update checks.")
            },
            {
              key: "default",
              value: localize("default", "Enable automatic update checks. Code will check for updates automatically and periodically.")
            }
          ]
        }
      }
    },
    "update.channel": {
      type: "string",
      default: "default",
      scope: ConfigurationScope.APPLICATION,
      description: localize("updateMode", "Configure whether you receive automatic updates. The updates are fetched from a Microsoft online service."),
      deprecationMessage: localize("deprecated", "This setting is deprecated, please use '{0}' instead.", "update.mode")
    },
    "update.enableWindowsBackgroundUpdates": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.APPLICATION,
      title: localize("enableWindowsBackgroundUpdatesTitle", "Enable Background Updates"),
      description: localize("enableWindowsBackgroundUpdates", "Enable to download and install new VS Code versions in the background."),
      included: isWindows && !isWeb
    },
    "update.showReleaseNotes": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.APPLICATION,
      description: localize("showReleaseNotes", "Show Release Notes after an update. The Release Notes are fetched from a Microsoft online service."),
      tags: ["usesOnlineServices"],
      agentsWindow: { default: false, readOnly: true }
    },
    "update.showPostInstallInfo": {
      type: "boolean",
      default: false,
      experiment: { mode: "auto" },
      scope: ConfigurationScope.APPLICATION,
      description: localize("showPostInstallInfo", "Show a post-install update tooltip in the title bar instead of opening the release notes editor."),
      tags: ["usesOnlineServices"]
    },
    "update.titleBar": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.APPLICATION,
      description: localize("updateTitleBar", "Show the update indicator in the title bar."),
      included: !isWeb
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VwZGF0ZS9jb21tb24vdXBkYXRlLmNvbmZpZy5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc1dlYiwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgUG9saWN5Q2F0ZWdvcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcblxuY29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0aWQ6ICd1cGRhdGUnLFxuXHRvcmRlcjogMTUsXG5cdHRpdGxlOiBsb2NhbGl6ZSgndXBkYXRlQ29uZmlndXJhdGlvblRpdGxlJywgXCJVcGRhdGVcIiksXG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0J3VwZGF0ZS5tb2RlJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ25vbmUnLCAnbWFudWFsJywgJ3N0YXJ0JywgJ2RlZmF1bHQnXSxcblx0XHRcdGRlZmF1bHQ6ICdkZWZhdWx0Jyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3VwZGF0ZU1vZGUnLCBcIkNvbmZpZ3VyZSB3aGV0aGVyIHlvdSByZWNlaXZlIGF1dG9tYXRpYyB1cGRhdGVzLiBUaGUgdXBkYXRlcyBhcmUgZmV0Y2hlZCBmcm9tIGEgTWljcm9zb2Z0IG9ubGluZSBzZXJ2aWNlLlwiKSxcblx0XHRcdHRhZ3M6IFsndXNlc09ubGluZVNlcnZpY2VzJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdub25lJywgXCJEaXNhYmxlIHVwZGF0ZXMuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnbWFudWFsJywgXCJEaXNhYmxlIGF1dG9tYXRpYyBiYWNrZ3JvdW5kIHVwZGF0ZSBjaGVja3MuIFVwZGF0ZXMgd2lsbCBiZSBhdmFpbGFibGUgaWYgeW91IG1hbnVhbGx5IGNoZWNrIGZvciB1cGRhdGVzLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3N0YXJ0JywgXCJDaGVjayBmb3IgdXBkYXRlcyBvbmx5IG9uIHN0YXJ0dXAuIERpc2FibGUgYXV0b21hdGljIGJhY2tncm91bmQgdXBkYXRlIGNoZWNrcy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdkZWZhdWx0JywgXCJFbmFibGUgYXV0b21hdGljIHVwZGF0ZSBjaGVja3MuIENvZGUgd2lsbCBjaGVjayBmb3IgdXBkYXRlcyBhdXRvbWF0aWNhbGx5IGFuZCBwZXJpb2RpY2FsbHkuXCIpXG5cdFx0XHRdLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdVcGRhdGVNb2RlJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LlVwZGF0ZSxcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjY3Jyxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHsga2V5OiAndXBkYXRlTW9kZScsIHZhbHVlOiBsb2NhbGl6ZSgndXBkYXRlTW9kZScsIFwiQ29uZmlndXJlIHdoZXRoZXIgeW91IHJlY2VpdmUgYXV0b21hdGljIHVwZGF0ZXMuIFRoZSB1cGRhdGVzIGFyZSBmZXRjaGVkIGZyb20gYSBNaWNyb3NvZnQgb25saW5lIHNlcnZpY2UuXCIpLCB9LFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0a2V5OiAnbm9uZScsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgnbm9uZScsIFwiRGlzYWJsZSB1cGRhdGVzLlwiKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGtleTogJ21hbnVhbCcsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgnbWFudWFsJywgXCJEaXNhYmxlIGF1dG9tYXRpYyBiYWNrZ3JvdW5kIHVwZGF0ZSBjaGVja3MuIFVwZGF0ZXMgd2lsbCBiZSBhdmFpbGFibGUgaWYgeW91IG1hbnVhbGx5IGNoZWNrIGZvciB1cGRhdGVzLlwiKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGtleTogJ3N0YXJ0Jyxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCdzdGFydCcsIFwiQ2hlY2sgZm9yIHVwZGF0ZXMgb25seSBvbiBzdGFydHVwLiBEaXNhYmxlIGF1dG9tYXRpYyBiYWNrZ3JvdW5kIHVwZGF0ZSBjaGVja3MuXCIpLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0a2V5OiAnZGVmYXVsdCcsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgnZGVmYXVsdCcsIFwiRW5hYmxlIGF1dG9tYXRpYyB1cGRhdGUgY2hlY2tzLiBDb2RlIHdpbGwgY2hlY2sgZm9yIHVwZGF0ZXMgYXV0b21hdGljYWxseSBhbmQgcGVyaW9kaWNhbGx5LlwiKSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQndXBkYXRlLmNoYW5uZWwnOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlZmF1bHQ6ICdkZWZhdWx0Jyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3VwZGF0ZU1vZGUnLCBcIkNvbmZpZ3VyZSB3aGV0aGVyIHlvdSByZWNlaXZlIGF1dG9tYXRpYyB1cGRhdGVzLiBUaGUgdXBkYXRlcyBhcmUgZmV0Y2hlZCBmcm9tIGEgTWljcm9zb2Z0IG9ubGluZSBzZXJ2aWNlLlwiKSxcblx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ2RlcHJlY2F0ZWQnLCBcIlRoaXMgc2V0dGluZyBpcyBkZXByZWNhdGVkLCBwbGVhc2UgdXNlICd7MH0nIGluc3RlYWQuXCIsICd1cGRhdGUubW9kZScpXG5cdFx0fSxcblx0XHQndXBkYXRlLmVuYWJsZVdpbmRvd3NCYWNrZ3JvdW5kVXBkYXRlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdlbmFibGVXaW5kb3dzQmFja2dyb3VuZFVwZGF0ZXNUaXRsZScsIFwiRW5hYmxlIEJhY2tncm91bmQgVXBkYXRlc1wiKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZW5hYmxlV2luZG93c0JhY2tncm91bmRVcGRhdGVzJywgXCJFbmFibGUgdG8gZG93bmxvYWQgYW5kIGluc3RhbGwgbmV3IFZTIENvZGUgdmVyc2lvbnMgaW4gdGhlIGJhY2tncm91bmQuXCIpLFxuXHRcdFx0aW5jbHVkZWQ6IGlzV2luZG93cyAmJiAhaXNXZWJcblx0XHR9LFxuXHRcdCd1cGRhdGUuc2hvd1JlbGVhc2VOb3Rlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzaG93UmVsZWFzZU5vdGVzJywgXCJTaG93IFJlbGVhc2UgTm90ZXMgYWZ0ZXIgYW4gdXBkYXRlLiBUaGUgUmVsZWFzZSBOb3RlcyBhcmUgZmV0Y2hlZCBmcm9tIGEgTWljcm9zb2Z0IG9ubGluZSBzZXJ2aWNlLlwiKSxcblx0XHRcdHRhZ3M6IFsndXNlc09ubGluZVNlcnZpY2VzJ10sXG5cdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogZmFsc2UsIHJlYWRPbmx5OiB0cnVlIH0sXG5cdFx0fSxcblx0XHQndXBkYXRlLnNob3dQb3N0SW5zdGFsbEluZm8nOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGV4cGVyaW1lbnQ6IHsgbW9kZTogJ2F1dG8nIH0sXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzaG93UG9zdEluc3RhbGxJbmZvJywgXCJTaG93IGEgcG9zdC1pbnN0YWxsIHVwZGF0ZSB0b29sdGlwIGluIHRoZSB0aXRsZSBiYXIgaW5zdGVhZCBvZiBvcGVuaW5nIHRoZSByZWxlYXNlIG5vdGVzIGVkaXRvci5cIiksXG5cdFx0XHR0YWdzOiBbJ3VzZXNPbmxpbmVTZXJ2aWNlcyddXG5cdFx0fSxcblx0XHQndXBkYXRlLnRpdGxlQmFyJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3VwZGF0ZVRpdGxlQmFyJywgXCJTaG93IHRoZSB1cGRhdGUgaW5kaWNhdG9yIGluIHRoZSB0aXRsZSBiYXIuXCIpLFxuXHRcdFx0aW5jbHVkZWQ6ICFpc1dlYlxuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLE9BQU8saUJBQWlCO0FBQ2pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CLGNBQWMsK0JBQXVEO0FBQ2xHLFNBQVMsZ0JBQWdCO0FBRXpCLE1BQU0sd0JBQXdCLFNBQVMsR0FBMkIsd0JBQXdCLGFBQWE7QUFDdkcsc0JBQXNCLHNCQUFzQjtBQUFBLEVBQzNDLElBQUk7QUFBQSxFQUNKLE9BQU87QUFBQSxFQUNQLE9BQU8sU0FBUyw0QkFBNEIsUUFBUTtBQUFBLEVBQ3BELE1BQU07QUFBQSxFQUNOLFlBQVk7QUFBQSxJQUNYLGVBQWU7QUFBQSxNQUNkLE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxRQUFRLFVBQVUsU0FBUyxTQUFTO0FBQUEsTUFDM0MsU0FBUztBQUFBLE1B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
