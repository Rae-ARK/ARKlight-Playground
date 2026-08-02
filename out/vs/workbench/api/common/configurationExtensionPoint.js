import * as nls from "../../../nls.js";
import * as objects from "../../../base/common/objects.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { ExtensionsRegistry } from "../../services/extensions/common/extensionsRegistry.js";
import { Extensions, validateProperty, ConfigurationScope, OVERRIDE_PROPERTY_REGEX, configurationDefaultsSchemaId, getDefaultValue, getAllConfigurationProperties, parseScope, EXTENSION_UNIFICATION_EXTENSION_IDS, overrideIdentifiersFromKey } from "../../../platform/configuration/common/configurationRegistry.js";
import { Extensions as JSONExtensions } from "../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { workspaceSettingsSchemaId, launchSchemaId, tasksSchemaId, mcpSchemaId } from "../../services/configuration/common/configuration.js";
import { hasKey, isObject, isUndefined } from "../../../base/common/types.js";
import { ExtensionIdentifierMap } from "../../../platform/extensions/common/extensions.js";
import { Extensions as ExtensionFeaturesExtensions } from "../../services/extensionManagement/common/extensionFeatures.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { SyncDescriptor } from "../../../platform/instantiation/common/descriptors.js";
import { MarkdownString } from "../../../base/common/htmlContent.js";
import product from "../../../platform/product/common/product.js";
import { isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
const configurationRegistry = Registry.as(Extensions.Configuration);
const configurationEntrySchema = {
  type: "object",
  defaultSnippets: [{ body: { title: "", properties: {} } }],
  properties: {
    title: {
      description: nls.localize("vscode.extension.contributes.configuration.title", "A title for the current category of settings. This label will be rendered in the Settings editor as a subheading. If the title is the same as the extension display name, then the category will be grouped under the main extension heading."),
      type: "string"
    },
    order: {
      description: nls.localize("vscode.extension.contributes.configuration.order", "When specified, gives the order of this category of settings relative to other categories."),
      type: "integer"
    },
    properties: {
      description: nls.localize("vscode.extension.contributes.configuration.properties", "Description of the configuration properties."),
      type: "object",
      propertyNames: {
        pattern: "\\S+",
        patternErrorMessage: nls.localize("vscode.extension.contributes.configuration.property.empty", "Property should not be empty.")
      },
      additionalProperties: {
        anyOf: [
          {
            title: nls.localize("vscode.extension.contributes.configuration.properties.schema", "Schema of the configuration property."),
            $ref: "http://json-schema.org/draft-07/schema#"
          },
          {
            type: "object",
            properties: {
              scope: {
                type: "string",
                enum: ["application", "machine", "window", "resource", "language-overridable", "machine-overridable"],
                default: "window",
                enumDescriptions: [
                  nls.localize("scope.application.description", "Configuration that can be configured only in the user settings."),
                  nls.localize("scope.machine.description", "Configuration that can be configured only in the user settings or only in the remote settings."),
                  nls.localize("scope.window.description", "Configuration that can be configured in the user, remote or workspace settings."),
                  nls.localize("scope.resource.description", "Configuration that can be configured in the user, remote, workspace or folder settings."),
                  nls.localize("scope.language-overridable.description", "Resource configuration that can be configured in language specific settings."),
                  nls.localize("scope.machine-overridable.description", "Machine configuration that can be configured also in workspace or folder settings.")
                ],
                markdownDescription: nls.localize("scope.description", "Scope in which the configuration is applicable. Available scopes are `application`, `machine`, `window`, `resource`, and `machine-overridable`.")
              },
              enumDescriptions: {
                type: "array",
                items: {
                  type: "string"
                },
                description: nls.localize("scope.enumDescriptions", "Descriptions for enum values")
              },
              markdownEnumDescriptions: {
                type: "array",
                items: {
                  type: "string"
                },
                description: nls.localize("scope.markdownEnumDescriptions", "Descriptions for enum values in the markdown format.")
              },
              enumItemLabels: {
                type: "array",
                items: {
                  type: "string"
                },
                markdownDescription: nls.localize("scope.enumItemLabels", "Labels for enum values to be displayed in the Settings editor. When specified, the {0} values still show after the labels, but less prominently.", "`enum`")
              },
              markdownDescription: {
                type: "string",
                description: nls.localize("scope.markdownDescription", "The description in the markdown format.")
              },
              deprecationMessage: {
                type: "string",
                description: nls.localize("scope.deprecationMessage", "If set, the property is marked as deprecated and the given message is shown as an explanation.")
              },
              markdownDeprecationMessage: {
                type: "string",
                description: nls.localize("scope.markdownDeprecationMessage", "If set, the property is marked as deprecated and the given message is shown as an explanation in the markdown format.")
              },
              editPresentation: {
                type: "string",
                enum: ["singlelineText", "multilineText"],
                enumDescriptions: [
                  nls.localize("scope.singlelineText.description", "The value will be shown in an inputbox."),
                  nls.localize("scope.multilineText.description", "The value will be shown in a textarea.")
                ],
                default: "singlelineText",
                description: nls.localize("scope.editPresentation", "When specified, controls the presentation format of the string setting.")
              },
              order: {
                type: "integer",
                description: nls.localize("scope.order", "When specified, gives the order of this setting relative to other settings within the same category. Settings with an order property will be placed before settings without this property set.")
              },
              ignoreSync: {
                type: "boolean",
                description: nls.localize("scope.ignoreSync", "When enabled, Settings Sync will not sync the user value of this configuration by default.")
              },
              keywords: {
                type: "array",
                items: {
                  type: "string"
                },
                description: nls.localize("scope.keywords", "A list of keywords that help users find this setting in the Settings editor. These are not shown to the user.")
              },
              tags: {
                type: "array",
                items: {
                  type: "string",
                  enum: [
                    "accessibility",
                    "advanced",
                    "experimental",
                    "telemetry",
                    "usesOnlineServices"
                  ],
                  enumDescriptions: [
                    nls.localize("accessibility", "Accessibility settings"),
                    nls.localize("advanced", "Advanced settings are hidden by default in the Settings editor unless the user chooses to show advanced settings."),
                    nls.localize("experimental", "Experimental settings are subject to change and may be removed in future releases."),
                    nls.localize("preview", "Preview settings can be used to try out new features before they are finalized."),
                    nls.localize("telemetry", "Telemetry settings"),
                    nls.localize("usesOnlineServices", "Settings that use online services")
                  ]
                },
                additionalItems: true,
                markdownDescription: nls.localize("scope.tags", "A list of tags under which to place the setting. The tag can then be searched up in the Settings editor. For example, specifying the `experimental` tag allows one to find the setting by searching `@tag:experimental`.")
              },
              agentsWindow: {
                type: "object",
                markdownDescription: nls.localize("scope.agentsWindow", "Configuration overrides for the Agents window. Allows specifying a different default value and read-only behavior for this setting when running in the Agents window.\n\n**Note**: This is a proposed API. To use it, extensions must include `agentsWindowConfiguration` in their `enabledApiProposals`."),
                properties: {
                  "default": {
                    description: nls.localize("scope.agentsWindow.default", "The default value for this setting in the Agents window.")
                  },
                  readOnly: {
                    type: "boolean",
                    description: nls.localize("scope.agentsWindow.readOnly", "When true, this setting cannot be changed by the user in the Agents window."),
                    default: false
                  }
                },
                additionalProperties: false
              }
            }
          }
        ]
      }
    }
  }
};
let _configDelta;
const defaultConfigurationExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "configurationDefaults",
  jsonSchema: {
    $ref: configurationDefaultsSchemaId
  },
  canHandleResolver: true
});
defaultConfigurationExtPoint.setHandler((extensions, { added, removed }) => {
  if (_configDelta) {
    configurationRegistry.deltaConfiguration(_configDelta);
  }
  const configNow = _configDelta = {};
  queueMicrotask(() => {
    if (_configDelta === configNow) {
      configurationRegistry.deltaConfiguration(_configDelta);
      _configDelta = void 0;
    }
  });
  if (removed.length) {
    const removedDefaultConfigurations = removed.map((extension) => ({ overrides: objects.deepClone(extension.value), source: { id: extension.description.identifier.value, displayName: extension.description.displayName } }));
    _configDelta.removedDefaults = removedDefaultConfigurations;
  }
  if (added.length) {
    const registeredProperties = configurationRegistry.getConfigurationProperties();
    const allowedScopes = [ConfigurationScope.MACHINE_OVERRIDABLE, ConfigurationScope.WINDOW, ConfigurationScope.RESOURCE, ConfigurationScope.LANGUAGE_OVERRIDABLE];
    const addedDefaultConfigurations = added.map((extension) => {
      const overrides = objects.deepClone(extension.value);
      for (const key of Object.keys(overrides)) {
        const registeredPropertyScheme = registeredProperties[key];
        if (registeredPropertyScheme?.disallowConfigurationDefault) {
          extension.collector.warn(nls.localize("config.property.preventDefaultConfiguration.warning", "Cannot register configuration defaults for '{0}'. This setting does not allow contributing configuration defaults.", key));
          delete overrides[key];
          continue;
        }
        if (!OVERRIDE_PROPERTY_REGEX.test(key)) {
          if (registeredPropertyScheme?.scope && !allowedScopes.includes(registeredPropertyScheme.scope)) {
            extension.collector.warn(nls.localize("config.property.defaultConfiguration.warning", "Cannot register configuration defaults for '{0}'. Only defaults for machine-overridable, window, resource and language overridable scoped settings are supported.", key));
            delete overrides[key];
            continue;
          }
        }
      }
      return { overrides, source: { id: extension.description.identifier.value, displayName: extension.description.displayName } };
    });
    _configDelta.addedDefaults = addedDefaultConfigurations;
  }
});
const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "configuration",
  deps: [defaultConfigurationExtPoint],
  jsonSchema: {
    description: nls.localize("vscode.extension.contributes.configuration", "Contributes configuration settings."),
    oneOf: [
      configurationEntrySchema,
      {
        type: "array",
        items: configurationEntrySchema
      }
    ]
  },
  canHandleResolver: true
});
const extensionConfigurations = new ExtensionIdentifierMap();
configurationExtPoint.setHandler((extensions, { added, removed }) => {
  _configDelta ??= {};
  if (removed.length) {
    const removedConfigurations = [];
    for (const extension of removed) {
      removedConfigurations.push(...extensionConfigurations.get(extension.description.identifier) || []);
      extensionConfigurations.delete(extension.description.identifier);
    }
    _configDelta.removedConfigurations = removedConfigurations;
  }
  const seenProperties = /* @__PURE__ */ new Set();
  function handleConfiguration(node, extension) {
    const configuration = objects.deepClone(node);
    if (configuration.title && typeof configuration.title !== "string") {
      extension.collector.error(nls.localize("invalid.title", "'configuration.title' must be a string"));
    }
    validateProperties(configuration, extension);
    configuration.id = node.id || extension.description.identifier.value;
    configuration.extensionInfo = { id: extension.description.identifier.value, displayName: extension.description.displayName };
    configuration.restrictedProperties = extension.description.capabilities?.untrustedWorkspaces?.supported === "limited" ? extension.description.capabilities?.untrustedWorkspaces.restrictedConfigurations : void 0;
    configuration.title = configuration.title || extension.description.displayName || extension.description.identifier.value;
    return configuration;
  }
  function validateProperties(configuration, extension) {
    const properties = configuration.properties;
    const extensionConfigurationPolicy = product.extensionConfigurationPolicy;
    if (properties) {
      if (typeof properties !== "object") {
        extension.collector.error(nls.localize("invalid.properties", "'configuration.properties' must be an object"));
        configuration.properties = {};
      }
      for (const key in properties) {
        const propertyConfiguration = properties[key];
        const message = validateProperty(key, propertyConfiguration, extension.description.identifier.value);
        if (message) {
          delete properties[key];
          extension.collector.warn(message);
          continue;
        }
        if (seenProperties.has(key) && !EXTENSION_UNIFICATION_EXTENSION_IDS.has(extension.description.identifier.value.toLowerCase())) {
          delete properties[key];
          extension.collector.warn(nls.localize("config.property.duplicate", "Cannot register '{0}'. This property is already registered.", key));
          continue;
        }
        if (!isObject(propertyConfiguration)) {
          delete properties[key];
          extension.collector.error(nls.localize("invalid.property", "configuration.properties property '{0}' must be an object", key));
          continue;
        }
        const policyEntry = extensionConfigurationPolicy?.[key];
        if (policyEntry) {
          if (hasKey(policyEntry, { policyReference: true })) {
            propertyConfiguration.policyReference = policyEntry.policyReference;
          } else {
            propertyConfiguration.policy = policyEntry;
          }
        }
        if (propertyConfiguration.tags?.some((tag) => tag.toLowerCase() === "onexp")) {
          propertyConfiguration.experiment = {
            mode: "startup"
          };
        }
        if (propertyConfiguration.agentsWindow && !isProposedApiEnabled(extension.description, "agentsWindowConfiguration")) {
          extension.collector.error(nls.localize("config.property.agentsWindow.proposed", "Extension '{0}' CANNOT use 'agentsWindow' property on configuration '{1}' without enabling the 'agentsWindowConfiguration' API proposal.", extension.description.identifier.value, key));
          delete propertyConfiguration.agentsWindow;
        }
        seenProperties.add(key);
        propertyConfiguration.scope = propertyConfiguration.scope ? parseScope(propertyConfiguration.scope.toString()) : ConfigurationScope.WINDOW;
      }
    }
    const subNodes = configuration.allOf;
    if (subNodes) {
      extension.collector.error(nls.localize("invalid.allOf", "'configuration.allOf' is deprecated and should no longer be used. Instead, pass multiple configuration sections as an array to the 'configuration' contribution point."));
      for (const node of subNodes) {
        validateProperties(node, extension);
      }
    }
  }
  if (added.length) {
    const addedConfigurations = [];
    for (const extension of added) {
      const configurations = [];
      const value = extension.value;
      if (Array.isArray(value)) {
        value.forEach((v) => configurations.push(handleConfiguration(v, extension)));
      } else {
        configurations.push(handleConfiguration(value, extension));
      }
      extensionConfigurations.set(extension.description.identifier, configurations);
      addedConfigurations.push(...configurations);
    }
    _configDelta.addedConfigurations = addedConfigurations;
  }
  configurationRegistry.deltaConfiguration(_configDelta);
  _configDelta = void 0;
});
jsonRegistry.registerSchema("vscode://schemas/workspaceConfig", {
  allowComments: true,
  allowTrailingCommas: true,
  default: {
    folders: [
      {
        path: ""
      }
    ],
    settings: {}
  },
  required: ["folders"],
  properties: {
    "folders": {
      minItems: 0,
      uniqueItems: true,
      description: nls.localize("workspaceConfig.folders.description", "List of folders to be loaded in the workspace."),
      items: {
        type: "object",
        defaultSnippets: [{ body: { path: "$1" } }],
        oneOf: [{
          properties: {
            path: {
              type: "string",
              description: nls.localize("workspaceConfig.path.description", "A file path. e.g. `/root/folderA` or `./folderA` for a relative path that will be resolved against the location of the workspace file.")
            },
            name: {
              type: "string",
              description: nls.localize("workspaceConfig.name.description", "An optional name for the folder. ")
            }
          },
          required: ["path"]
        }, {
          properties: {
            uri: {
              type: "string",
              description: nls.localize("workspaceConfig.uri.description", "URI of the folder")
            },
            name: {
              type: "string",
              description: nls.localize("workspaceConfig.name.description", "An optional name for the folder. ")
            }
          },
          required: ["uri"]
        }]
      }
    },
    "settings": {
      type: "object",
      default: {},
      description: nls.localize("workspaceConfig.settings.description", "Workspace settings"),
      $ref: workspaceSettingsSchemaId
    },
    "launch": {
      type: "object",
      default: { configurations: [], compounds: [] },
      description: nls.localize("workspaceConfig.launch.description", "Workspace launch configurations"),
      $ref: launchSchemaId
    },
    "tasks": {
      type: "object",
      default: { version: "2.0.0", tasks: [] },
      description: nls.localize("workspaceConfig.tasks.description", "Workspace task configurations"),
      $ref: tasksSchemaId
    },
    "mcp": {
      type: "object",
      default: {
        inputs: [],
        servers: {
          "mcp-server-time": {
            command: "uvx",
            args: ["mcp_server_time", "--local-timezone=America/Los_Angeles"]
          }
        }
      },
      description: nls.localize("workspaceConfig.mcp.description", "Model Context Protocol server configurations"),
      $ref: mcpSchemaId
    },
    "extensions": {
      type: "object",
      default: {},
      description: nls.localize("workspaceConfig.extensions.description", "Workspace extensions"),
      $ref: "vscode://schemas/extensions"
    },
    "remoteAuthority": {
      type: "string",
      doNotSuggest: true,
      description: nls.localize("workspaceConfig.remoteAuthority", "The remote server where the workspace is located.")
    },
    "transient": {
      type: "boolean",
      doNotSuggest: true,
      description: nls.localize("workspaceConfig.transient", "A transient workspace will disappear when restarting or reloading.")
    }
  },
  errorMessage: nls.localize("unknownWorkspaceProperty", "Unknown workspace configuration property")
});
class SettingsTableRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.configuration;
  }
  render(manifest) {
    const configuration = manifest.contributes?.configuration ? Array.isArray(manifest.contributes.configuration) ? manifest.contributes.configuration : [manifest.contributes.configuration] : [];
    const properties = getAllConfigurationProperties(configuration);
    const contrib = properties ? Object.keys(properties) : [];
    const headers = [nls.localize("setting name", "ID"), nls.localize("description", "Description"), nls.localize("default", "Default")];
    const rows = contrib.sort((a, b) => a.localeCompare(b)).map((key) => {
      return [
        new MarkdownString().appendMarkdown(`\`${key}\``),
        properties[key].markdownDescription ? new MarkdownString(properties[key].markdownDescription, false) : properties[key].description ?? "",
        new MarkdownString().appendCodeblock("json", JSON.stringify(isUndefined(properties[key].default) ? getDefaultValue(properties[key].type) : properties[key].default, null, 2))
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
Registry.as(ExtensionFeaturesExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "configuration",
  label: nls.localize("settings", "Settings"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(SettingsTableRenderer)
});
class ConfigurationDefaultsTableRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.configurationDefaults;
  }
  render(manifest) {
    const configurationDefaults = manifest.contributes?.configurationDefaults ?? {};
    const headers = [nls.localize("language", "Languages"), nls.localize("setting", "Setting"), nls.localize("default override value", "Override Value")];
    const rows = [];
    for (const key of Object.keys(configurationDefaults).sort((a, b) => a.localeCompare(b))) {
      const value = configurationDefaults[key];
      if (OVERRIDE_PROPERTY_REGEX.test(key)) {
        const languages = overrideIdentifiersFromKey(key);
        const languageMarkdown = new MarkdownString().appendMarkdown(`${languages.join(", ")}`);
        for (const key2 of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
          const row = [];
          row.push(languageMarkdown);
          row.push(new MarkdownString().appendMarkdown(`\`${key2}\``));
          row.push(new MarkdownString().appendCodeblock("json", JSON.stringify(value[key2], null, 2)));
          rows.push(row);
        }
      } else {
        const row = [];
        row.push("");
        row.push(new MarkdownString().appendMarkdown(`\`${key}\``));
        row.push(new MarkdownString().appendCodeblock("json", JSON.stringify(value, null, 2)));
        rows.push(row);
      }
    }
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
Registry.as(ExtensionFeaturesExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "configurationDefaults",
  label: nls.localize("settings default overrides", "Settings Default Overrides"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ConfigurationDefaultsTableRenderer)
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2NvbmZpZ3VyYXRpb25FeHRlbnNpb25Qb2ludC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgb2JqZWN0cyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zUmVnaXN0cnksIElFeHRlbnNpb25Qb2ludFVzZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25Ob2RlLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zLCB2YWxpZGF0ZVByb3BlcnR5LCBDb25maWd1cmF0aW9uU2NvcGUsIE9WRVJSSURFX1BST1BFUlRZX1JFR0VYLCBJQ29uZmlndXJhdGlvbkRlZmF1bHRzLCBjb25maWd1cmF0aW9uRGVmYXVsdHNTY2hlbWFJZCwgSUNvbmZpZ3VyYXRpb25EZWx0YSwgZ2V0RGVmYXVsdFZhbHVlLCBnZXRBbGxDb25maWd1cmF0aW9uUHJvcGVydGllcywgcGFyc2VTY29wZSwgRVhURU5TSU9OX1VOSUZJQ0FUSU9OX0VYVEVOU0lPTl9JRFMsIG92ZXJyaWRlSWRlbnRpZmllcnNGcm9tS2V5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgSlNPTkV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9qc29uc2NoZW1hcy9jb21tb24vanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHdvcmtzcGFjZVNldHRpbmdzU2NoZW1hSWQsIGxhdW5jaFNjaGVtYUlkLCB0YXNrc1NjaGVtYUlkLCBtY3BTY2hlbWFJZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgaGFzS2V5LCBpc09iamVjdCwgaXNVbmRlZmluZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyTWFwLCBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBFeHRlbnNpb25GZWF0dXJlc0V4dGVuc2lvbnMsIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciwgSUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnksIElSZW5kZXJlZERhdGEsIElSb3dEYXRhLCBJVGFibGVEYXRhIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuXG5jb25zdCBqc29uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09ORXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcbmNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cbmNvbnN0IGNvbmZpZ3VyYXRpb25FbnRyeVNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgdGl0bGU6ICcnLCBwcm9wZXJ0aWVzOiB7fSB9IH1dLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0dGl0bGU6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuY29uZmlndXJhdGlvbi50aXRsZScsICdBIHRpdGxlIGZvciB0aGUgY3VycmVudCBjYXRlZ29yeSBvZiBzZXR0aW5ncy4gVGhpcyBsYWJlbCB3aWxsIGJlIHJlbmRlcmVkIGluIHRoZSBTZXR0aW5ncyBlZGl0b3IgYXMgYSBzdWJoZWFkaW5nLiBJZiB0aGUgdGl0bGUgaXMgdGhlIHNhbWUgYXMgdGhlIGV4dGVuc2lvbiBkaXNwbGF5IG5hbWUsIHRoZW4gdGhlIGNhdGVnb3J5IHdpbGwgYmUgZ3JvdXBlZCB1bmRlciB0aGUgbWFpbiBleHRlbnNpb24gaGVhZGluZy4nKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0XHRvcmRlcjoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5jb25maWd1cmF0aW9uLm9yZGVyJywgJ1doZW4gc3BlY2lmaWVkLCBnaXZlcyB0aGUgb3JkZXIgb2YgdGhpcyBjYXRlZ29yeSBvZiBzZXR0aW5ncyByZWxhdGl2ZSB0byBvdGhlciBjYXRlZ29yaWVzLicpLFxuXHRcdFx0dHlwZTogJ2ludGVnZXInXG5cdFx0fSxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmNvbmZpZ3VyYXRpb24ucHJvcGVydGllcycsICdEZXNjcmlwdGlvbiBvZiB0aGUgY29uZmlndXJhdGlvbiBwcm9wZXJ0aWVzLicpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0eU5hbWVzOiB7XG5cdFx0XHRcdHBhdHRlcm46ICdcXFxcUysnLFxuXHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuY29uZmlndXJhdGlvbi5wcm9wZXJ0eS5lbXB0eScsICdQcm9wZXJ0eSBzaG91bGQgbm90IGJlIGVtcHR5LicpLFxuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5jb25maWd1cmF0aW9uLnByb3BlcnRpZXMuc2NoZW1hJywgJ1NjaGVtYSBvZiB0aGUgY29uZmlndXJhdGlvbiBwcm9wZXJ0eS4nKSxcblx0XHRcdFx0XHRcdCRyZWY6ICdodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA3L3NjaGVtYSMnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0c2NvcGU6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbJ2FwcGxpY2F0aW9uJywgJ21hY2hpbmUnLCAnd2luZG93JywgJ3Jlc291cmNlJywgJ2xhbmd1YWdlLW92ZXJyaWRhYmxlJywgJ21hY2hpbmUtb3ZlcnJpZGFibGUnXSxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnd2luZG93Jyxcblx0XHRcdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3Njb3BlLmFwcGxpY2F0aW9uLmRlc2NyaXB0aW9uJywgXCJDb25maWd1cmF0aW9uIHRoYXQgY2FuIGJlIGNvbmZpZ3VyZWQgb25seSBpbiB0aGUgdXNlciBzZXR0aW5ncy5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3Njb3BlLm1hY2hpbmUuZGVzY3JpcHRpb24nLCBcIkNvbmZpZ3VyYXRpb24gdGhhdCBjYW4gYmUgY29uZmlndXJlZCBvbmx5IGluIHRoZSB1c2VyIHNldHRpbmdzIG9yIG9ubHkgaW4gdGhlIHJlbW90ZSBzZXR0aW5ncy5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3Njb3BlLndpbmRvdy5kZXNjcmlwdGlvbicsIFwiQ29uZmlndXJhdGlvbiB0aGF0IGNhbiBiZSBjb25maWd1cmVkIGluIHRoZSB1c2VyLCByZW1vdGUgb3Igd29ya3NwYWNlIHNldHRpbmdzLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2NvcGUucmVzb3VyY2UuZGVzY3JpcHRpb24nLCBcIkNvbmZpZ3VyYXRpb24gdGhhdCBjYW4gYmUgY29uZmlndXJlZCBpbiB0aGUgdXNlciwgcmVtb3RlLCB3b3Jrc3BhY2Ugb3IgZm9sZGVyIHNldHRpbmdzLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2NvcGUubGFuZ3VhZ2Utb3ZlcnJpZGFibGUuZGVzY3JpcHRpb24nLCBcIlJlc291cmNlIGNvbmZpZ3VyYXRpb24gdGhhdCBjYW4gYmUgY29uZmlndXJlZCBpbiBsYW5ndWFnZSBzcGVjaWZpYyBzZXR0aW5ncy5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3Njb3BlLm1hY2hpbmUtb3ZlcnJpZGFibGUuZGVzY3JpcHRpb24nLCBcIk1hY2hpbmUgY29uZmlndXJhdGlvbiB0aGF0IGNhbiBiZSBjb25maWd1cmVkIGFsc28gaW4gd29ya3NwYWNlIG9yIGZvbGRlciBzZXR0aW5ncy5cIilcblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NvcGUuZGVzY3JpcHRpb24nLCBcIlNjb3BlIGluIHdoaWNoIHRoZSBjb25maWd1cmF0aW9uIGlzIGFwcGxpY2FibGUuIEF2YWlsYWJsZSBzY29wZXMgYXJlIGBhcHBsaWNhdGlvbmAsIGBtYWNoaW5lYCwgYHdpbmRvd2AsIGByZXNvdXJjZWAsIGFuZCBgbWFjaGluZS1vdmVycmlkYWJsZWAuXCIpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njb3BlLmVudW1EZXNjcmlwdGlvbnMnLCAnRGVzY3JpcHRpb25zIGZvciBlbnVtIHZhbHVlcycpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NvcGUubWFya2Rvd25FbnVtRGVzY3JpcHRpb25zJywgJ0Rlc2NyaXB0aW9ucyBmb3IgZW51bSB2YWx1ZXMgaW4gdGhlIG1hcmtkb3duIGZvcm1hdC4nKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRlbnVtSXRlbUxhYmVsczoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njb3BlLmVudW1JdGVtTGFiZWxzJywgJ0xhYmVscyBmb3IgZW51bSB2YWx1ZXMgdG8gYmUgZGlzcGxheWVkIGluIHRoZSBTZXR0aW5ncyBlZGl0b3IuIFdoZW4gc3BlY2lmaWVkLCB0aGUgezB9IHZhbHVlcyBzdGlsbCBzaG93IGFmdGVyIHRoZSBsYWJlbHMsIGJ1dCBsZXNzIHByb21pbmVudGx5LicsICdgZW51bWAnKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NvcGUubWFya2Rvd25EZXNjcmlwdGlvbicsICdUaGUgZGVzY3JpcHRpb24gaW4gdGhlIG1hcmtkb3duIGZvcm1hdC4nKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY29wZS5kZXByZWNhdGlvbk1lc3NhZ2UnLCAnSWYgc2V0LCB0aGUgcHJvcGVydHkgaXMgbWFya2VkIGFzIGRlcHJlY2F0ZWQgYW5kIHRoZSBnaXZlbiBtZXNzYWdlIGlzIHNob3duIGFzIGFuIGV4cGxhbmF0aW9uLicpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdG1hcmtkb3duRGVwcmVjYXRpb25NZXNzYWdlOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NvcGUubWFya2Rvd25EZXByZWNhdGlvbk1lc3NhZ2UnLCAnSWYgc2V0LCB0aGUgcHJvcGVydHkgaXMgbWFya2VkIGFzIGRlcHJlY2F0ZWQgYW5kIHRoZSBnaXZlbiBtZXNzYWdlIGlzIHNob3duIGFzIGFuIGV4cGxhbmF0aW9uIGluIHRoZSBtYXJrZG93biBmb3JtYXQuJylcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZWRpdFByZXNlbnRhdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGVudW06IFsnc2luZ2xlbGluZVRleHQnLCAnbXVsdGlsaW5lVGV4dCddLFxuXHRcdFx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2NvcGUuc2luZ2xlbGluZVRleHQuZGVzY3JpcHRpb24nLCAnVGhlIHZhbHVlIHdpbGwgYmUgc2hvd24gaW4gYW4gaW5wdXRib3guJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3Njb3BlLm11bHRpbGluZVRleHQuZGVzY3JpcHRpb24nLCAnVGhlIHZhbHVlIHdpbGwgYmUgc2hvd24gaW4gYSB0ZXh0YXJlYS4nKVxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJ3NpbmdsZWxpbmVUZXh0Jyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY29wZS5lZGl0UHJlc2VudGF0aW9uJywgJ1doZW4gc3BlY2lmaWVkLCBjb250cm9scyB0aGUgcHJlc2VudGF0aW9uIGZvcm1hdCBvZiB0aGUgc3RyaW5nIHNldHRpbmcuJylcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0b3JkZXI6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NvcGUub3JkZXInLCAnV2hlbiBzcGVjaWZpZWQsIGdpdmVzIHRoZSBvcmRlciBvZiB0aGlzIHNldHRpbmcgcmVsYXRpdmUgdG8gb3RoZXIgc2V0dGluZ3Mgd2l0aGluIHRoZSBzYW1lIGNhdGVnb3J5LiBTZXR0aW5ncyB3aXRoIGFuIG9yZGVyIHByb3BlcnR5IHdpbGwgYmUgcGxhY2VkIGJlZm9yZSBzZXR0aW5ncyB3aXRob3V0IHRoaXMgcHJvcGVydHkgc2V0LicpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGlnbm9yZVN5bmM6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NvcGUuaWdub3JlU3luYycsICdXaGVuIGVuYWJsZWQsIFNldHRpbmdzIFN5bmMgd2lsbCBub3Qgc3luYyB0aGUgdXNlciB2YWx1ZSBvZiB0aGlzIGNvbmZpZ3VyYXRpb24gYnkgZGVmYXVsdC4nKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRrZXl3b3Jkczoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY29wZS5rZXl3b3JkcycsICdBIGxpc3Qgb2Yga2V5d29yZHMgdGhhdCBoZWxwIHVzZXJzIGZpbmQgdGhpcyBzZXR0aW5nIGluIHRoZSBTZXR0aW5ncyBlZGl0b3IuIFRoZXNlIGFyZSBub3Qgc2hvd24gdG8gdGhlIHVzZXIuJylcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0dGFnczoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZW51bTogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQnYWNjZXNzaWJpbGl0eScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdCdhZHZhbmNlZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdCdleHBlcmltZW50YWwnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHQndGVsZW1ldHJ5Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0J3VzZXNPbmxpbmVTZXJ2aWNlcycsXG5cdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2FjY2Vzc2liaWxpdHknLCAnQWNjZXNzaWJpbGl0eSBzZXR0aW5ncycpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2FkdmFuY2VkJywgJ0FkdmFuY2VkIHNldHRpbmdzIGFyZSBoaWRkZW4gYnkgZGVmYXVsdCBpbiB0aGUgU2V0dGluZ3MgZWRpdG9yIHVubGVzcyB0aGUgdXNlciBjaG9vc2VzIHRvIHNob3cgYWR2YW5jZWQgc2V0dGluZ3MuJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZXhwZXJpbWVudGFsJywgJ0V4cGVyaW1lbnRhbCBzZXR0aW5ncyBhcmUgc3ViamVjdCB0byBjaGFuZ2UgYW5kIG1heSBiZSByZW1vdmVkIGluIGZ1dHVyZSByZWxlYXNlcy4nKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdwcmV2aWV3JywgJ1ByZXZpZXcgc2V0dGluZ3MgY2FuIGJlIHVzZWQgdG8gdHJ5IG91dCBuZXcgZmVhdHVyZXMgYmVmb3JlIHRoZXkgYXJlIGZpbmFsaXplZC4nKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCd0ZWxlbWV0cnknLCAnVGVsZW1ldHJ5IHNldHRpbmdzJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgndXNlc09ubGluZVNlcnZpY2VzJywgJ1NldHRpbmdzIHRoYXQgdXNlIG9ubGluZSBzZXJ2aWNlcycpXG5cdFx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0YWRkaXRpb25hbEl0ZW1zOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NvcGUudGFncycsICdBIGxpc3Qgb2YgdGFncyB1bmRlciB3aGljaCB0byBwbGFjZSB0aGUgc2V0dGluZy4gVGhlIHRhZyBjYW4gdGhlbiBiZSBzZWFyY2hlZCB1cCBpbiB0aGUgU2V0dGluZ3MgZWRpdG9yLiBGb3IgZXhhbXBsZSwgc3BlY2lmeWluZyB0aGUgYGV4cGVyaW1lbnRhbGAgdGFnIGFsbG93cyBvbmUgdG8gZmluZCB0aGUgc2V0dGluZyBieSBzZWFyY2hpbmcgYEB0YWc6ZXhwZXJpbWVudGFsYC4nKSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0YWdlbnRzV2luZG93OiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY29wZS5hZ2VudHNXaW5kb3cnLCBcIkNvbmZpZ3VyYXRpb24gb3ZlcnJpZGVzIGZvciB0aGUgQWdlbnRzIHdpbmRvdy4gQWxsb3dzIHNwZWNpZnlpbmcgYSBkaWZmZXJlbnQgZGVmYXVsdCB2YWx1ZSBhbmQgcmVhZC1vbmx5IGJlaGF2aW9yIGZvciB0aGlzIHNldHRpbmcgd2hlbiBydW5uaW5nIGluIHRoZSBBZ2VudHMgd2luZG93LlxcblxcbioqTm90ZSoqOiBUaGlzIGlzIGEgcHJvcG9zZWQgQVBJLiBUbyB1c2UgaXQsIGV4dGVuc2lvbnMgbXVzdCBpbmNsdWRlIGBhZ2VudHNXaW5kb3dDb25maWd1cmF0aW9uYCBpbiB0aGVpciBgZW5hYmxlZEFwaVByb3Bvc2Fsc2AuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdCdkZWZhdWx0Jzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY29wZS5hZ2VudHNXaW5kb3cuZGVmYXVsdCcsICdUaGUgZGVmYXVsdCB2YWx1ZSBmb3IgdGhpcyBzZXR0aW5nIGluIHRoZSBBZ2VudHMgd2luZG93LicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdHJlYWRPbmx5OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NvcGUuYWdlbnRzV2luZG93LnJlYWRPbmx5JywgJ1doZW4gdHJ1ZSwgdGhpcyBzZXR0aW5nIGNhbm5vdCBiZSBjaGFuZ2VkIGJ5IHRoZSB1c2VyIGluIHRoZSBBZ2VudHMgd2luZG93LicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59O1xuXG4vLyBidWlsZCB1cCBhIGRlbHRhIGFjcm9zcyB0d28gZXh0IHBvaW50cyBhbmQgb25seSBhcHBseSBpdCBvbmNlXG5sZXQgX2NvbmZpZ0RlbHRhOiBJQ29uZmlndXJhdGlvbkRlbHRhIHwgdW5kZWZpbmVkO1xuXG5cbi8vIEJFR0lOIFZTQ29kZSBleHRlbnNpb24gcG9pbnQgYGNvbmZpZ3VyYXRpb25EZWZhdWx0c2BcbmNvbnN0IGRlZmF1bHRDb25maWd1cmF0aW9uRXh0UG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJU3RyaW5nRGljdGlvbmFyeTxJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPj4+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdjb25maWd1cmF0aW9uRGVmYXVsdHMnLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0JHJlZjogY29uZmlndXJhdGlvbkRlZmF1bHRzU2NoZW1hSWQsXG5cdH0sXG5cdGNhbkhhbmRsZVJlc29sdmVyOiB0cnVlXG59KTtcbmRlZmF1bHRDb25maWd1cmF0aW9uRXh0UG9pbnQuc2V0SGFuZGxlcigoZXh0ZW5zaW9ucywgeyBhZGRlZCwgcmVtb3ZlZCB9KSA9PiB7XG5cblx0aWYgKF9jb25maWdEZWx0YSkge1xuXHRcdC8vIEhJR0hMWSB1bmxpa2VseSwgYnV0IGp1c3QgaW4gY2FzZVxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZWx0YUNvbmZpZ3VyYXRpb24oX2NvbmZpZ0RlbHRhKTtcblx0fVxuXG5cdGNvbnN0IGNvbmZpZ05vdyA9IF9jb25maWdEZWx0YSA9IHt9O1xuXHQvLyBzY2hlZHVsZSBhIEhJR0hMWSB1bmxpa2VseSB0YXNrIGluIGNhc2Ugb25seSB0aGUgZGVmYXVsdCBjb25maWd1cmF0aW9ucyBFWFQgcG9pbnQgY2hhbmdlc1xuXHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0aWYgKF9jb25maWdEZWx0YSA9PT0gY29uZmlnTm93KSB7XG5cdFx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVsdGFDb25maWd1cmF0aW9uKF9jb25maWdEZWx0YSk7XG5cdFx0XHRfY29uZmlnRGVsdGEgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9KTtcblxuXHRpZiAocmVtb3ZlZC5sZW5ndGgpIHtcblx0XHRjb25zdCByZW1vdmVkRGVmYXVsdENvbmZpZ3VyYXRpb25zID0gcmVtb3ZlZC5tYXA8SUNvbmZpZ3VyYXRpb25EZWZhdWx0cz4oZXh0ZW5zaW9uID0+ICh7IG92ZXJyaWRlczogb2JqZWN0cy5kZWVwQ2xvbmUoZXh0ZW5zaW9uLnZhbHVlKSwgc291cmNlOiB7IGlkOiBleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSwgZGlzcGxheU5hbWU6IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5kaXNwbGF5TmFtZSB9IH0pKTtcblx0XHRfY29uZmlnRGVsdGEucmVtb3ZlZERlZmF1bHRzID0gcmVtb3ZlZERlZmF1bHRDb25maWd1cmF0aW9ucztcblx0fVxuXHRpZiAoYWRkZWQubGVuZ3RoKSB7XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZFByb3BlcnRpZXMgPSBjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRjb25zdCBhbGxvd2VkU2NvcGVzID0gW0NvbmZpZ3VyYXRpb25TY29wZS5NQUNISU5FX09WRVJSSURBQkxFLCBDb25maWd1cmF0aW9uU2NvcGUuV0lORE9XLCBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0UsIENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRV07XG5cdFx0Y29uc3QgYWRkZWREZWZhdWx0Q29uZmlndXJhdGlvbnMgPSBhZGRlZC5tYXA8SUNvbmZpZ3VyYXRpb25EZWZhdWx0cz4oZXh0ZW5zaW9uID0+IHtcblx0XHRcdGNvbnN0IG92ZXJyaWRlcyA9IG9iamVjdHMuZGVlcENsb25lKGV4dGVuc2lvbi52YWx1ZSk7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhvdmVycmlkZXMpKSB7XG5cdFx0XHRcdGNvbnN0IHJlZ2lzdGVyZWRQcm9wZXJ0eVNjaGVtZSA9IHJlZ2lzdGVyZWRQcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdGlmIChyZWdpc3RlcmVkUHJvcGVydHlTY2hlbWU/LmRpc2FsbG93Q29uZmlndXJhdGlvbkRlZmF1bHQpIHtcblx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLndhcm4obmxzLmxvY2FsaXplKCdjb25maWcucHJvcGVydHkucHJldmVudERlZmF1bHRDb25maWd1cmF0aW9uLndhcm5pbmcnLCBcIkNhbm5vdCByZWdpc3RlciBjb25maWd1cmF0aW9uIGRlZmF1bHRzIGZvciAnezB9Jy4gVGhpcyBzZXR0aW5nIGRvZXMgbm90IGFsbG93IGNvbnRyaWJ1dGluZyBjb25maWd1cmF0aW9uIGRlZmF1bHRzLlwiLCBrZXkpKTtcblx0XHRcdFx0XHRkZWxldGUgb3ZlcnJpZGVzW2tleV07XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFPVkVSUklERV9QUk9QRVJUWV9SRUdFWC50ZXN0KGtleSkpIHtcblx0XHRcdFx0XHRpZiAocmVnaXN0ZXJlZFByb3BlcnR5U2NoZW1lPy5zY29wZSAmJiAhYWxsb3dlZFNjb3Blcy5pbmNsdWRlcyhyZWdpc3RlcmVkUHJvcGVydHlTY2hlbWUuc2NvcGUpKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLndhcm4obmxzLmxvY2FsaXplKCdjb25maWcucHJvcGVydHkuZGVmYXVsdENvbmZpZ3VyYXRpb24ud2FybmluZycsIFwiQ2Fubm90IHJlZ2lzdGVyIGNvbmZpZ3VyYXRpb24gZGVmYXVsdHMgZm9yICd7MH0nLiBPbmx5IGRlZmF1bHRzIGZvciBtYWNoaW5lLW92ZXJyaWRhYmxlLCB3aW5kb3csIHJlc291cmNlIGFuZCBsYW5ndWFnZSBvdmVycmlkYWJsZSBzY29wZWQgc2V0dGluZ3MgYXJlIHN1cHBvcnRlZC5cIiwga2V5KSk7XG5cdFx0XHRcdFx0XHRkZWxldGUgb3ZlcnJpZGVzW2tleV07XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7IG92ZXJyaWRlcywgc291cmNlOiB7IGlkOiBleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSwgZGlzcGxheU5hbWU6IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5kaXNwbGF5TmFtZSB9IH07XG5cdFx0fSk7XG5cdFx0X2NvbmZpZ0RlbHRhLmFkZGVkRGVmYXVsdHMgPSBhZGRlZERlZmF1bHRDb25maWd1cmF0aW9ucztcblx0fVxufSk7XG4vLyBFTkQgVlNDb2RlIGV4dGVuc2lvbiBwb2ludCBgY29uZmlndXJhdGlvbkRlZmF1bHRzYFxuXG5cbi8vIEJFR0lOIFZTQ29kZSBleHRlbnNpb24gcG9pbnQgYGNvbmZpZ3VyYXRpb25gXG5jb25zdCBjb25maWd1cmF0aW9uRXh0UG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJQ29uZmlndXJhdGlvbk5vZGU+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdjb25maWd1cmF0aW9uJyxcblx0ZGVwczogW2RlZmF1bHRDb25maWd1cmF0aW9uRXh0UG9pbnRdLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5jb25maWd1cmF0aW9uJywgJ0NvbnRyaWJ1dGVzIGNvbmZpZ3VyYXRpb24gc2V0dGluZ3MuJyksXG5cdFx0b25lT2Y6IFtcblx0XHRcdGNvbmZpZ3VyYXRpb25FbnRyeVNjaGVtYSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0aXRlbXM6IGNvbmZpZ3VyYXRpb25FbnRyeVNjaGVtYVxuXHRcdFx0fVxuXHRcdF1cblx0fSxcblx0Y2FuSGFuZGxlUmVzb2x2ZXI6IHRydWVcbn0pO1xuXG5jb25zdCBleHRlbnNpb25Db25maWd1cmF0aW9uczogRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxJQ29uZmlndXJhdGlvbk5vZGVbXT4gPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxJQ29uZmlndXJhdGlvbk5vZGVbXT4oKTtcblxuY29uZmlndXJhdGlvbkV4dFBvaW50LnNldEhhbmRsZXIoKGV4dGVuc2lvbnMsIHsgYWRkZWQsIHJlbW92ZWQgfSkgPT4ge1xuXG5cdC8vIEhJR0hMWSB1bmxpa2VseSAob25seSBjb25maWd1cmF0aW9uIGJ1dCBub3QgZGVmYXVsdENvbmZpZ3VyYXRpb24gRVhUIHBvaW50IGNoYW5nZXMpXG5cdF9jb25maWdEZWx0YSA/Pz0ge307XG5cblx0aWYgKHJlbW92ZWQubGVuZ3RoKSB7XG5cdFx0Y29uc3QgcmVtb3ZlZENvbmZpZ3VyYXRpb25zOiBJQ29uZmlndXJhdGlvbk5vZGVbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIHJlbW92ZWQpIHtcblx0XHRcdHJlbW92ZWRDb25maWd1cmF0aW9ucy5wdXNoKC4uLihleHRlbnNpb25Db25maWd1cmF0aW9ucy5nZXQoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIpIHx8IFtdKSk7XG5cdFx0XHRleHRlbnNpb25Db25maWd1cmF0aW9ucy5kZWxldGUoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIpO1xuXHRcdH1cblx0XHRfY29uZmlnRGVsdGEucmVtb3ZlZENvbmZpZ3VyYXRpb25zID0gcmVtb3ZlZENvbmZpZ3VyYXRpb25zO1xuXHR9XG5cblx0Y29uc3Qgc2VlblByb3BlcnRpZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRmdW5jdGlvbiBoYW5kbGVDb25maWd1cmF0aW9uKG5vZGU6IElDb25maWd1cmF0aW9uTm9kZSwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uUG9pbnRVc2VyPHVua25vd24+KTogSUNvbmZpZ3VyYXRpb25Ob2RlIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gb2JqZWN0cy5kZWVwQ2xvbmUobm9kZSk7XG5cblx0XHRpZiAoY29uZmlndXJhdGlvbi50aXRsZSAmJiAodHlwZW9mIGNvbmZpZ3VyYXRpb24udGl0bGUgIT09ICdzdHJpbmcnKSkge1xuXHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQudGl0bGUnLCBcIidjb25maWd1cmF0aW9uLnRpdGxlJyBtdXN0IGJlIGEgc3RyaW5nXCIpKTtcblx0XHR9XG5cblx0XHR2YWxpZGF0ZVByb3BlcnRpZXMoY29uZmlndXJhdGlvbiwgZXh0ZW5zaW9uKTtcblxuXHRcdGNvbmZpZ3VyYXRpb24uaWQgPSBub2RlLmlkIHx8IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlO1xuXHRcdGNvbmZpZ3VyYXRpb24uZXh0ZW5zaW9uSW5mbyA9IHsgaWQ6IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlLCBkaXNwbGF5TmFtZTogZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmRpc3BsYXlOYW1lIH07XG5cdFx0Y29uZmlndXJhdGlvbi5yZXN0cmljdGVkUHJvcGVydGllcyA9IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5jYXBhYmlsaXRpZXM/LnVudHJ1c3RlZFdvcmtzcGFjZXM/LnN1cHBvcnRlZCA9PT0gJ2xpbWl0ZWQnID8gZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmNhcGFiaWxpdGllcz8udW50cnVzdGVkV29ya3NwYWNlcy5yZXN0cmljdGVkQ29uZmlndXJhdGlvbnMgOiB1bmRlZmluZWQ7XG5cdFx0Y29uZmlndXJhdGlvbi50aXRsZSA9IGNvbmZpZ3VyYXRpb24udGl0bGUgfHwgZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlO1xuXHRcdHJldHVybiBjb25maWd1cmF0aW9uO1xuXHR9XG5cblx0ZnVuY3Rpb24gdmFsaWRhdGVQcm9wZXJ0aWVzKGNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uTm9kZSwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uUG9pbnRVc2VyPHVua25vd24+KTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvcGVydGllcyA9IGNvbmZpZ3VyYXRpb24ucHJvcGVydGllcztcblx0XHRjb25zdCBleHRlbnNpb25Db25maWd1cmF0aW9uUG9saWN5ID0gcHJvZHVjdC5leHRlbnNpb25Db25maWd1cmF0aW9uUG9saWN5O1xuXHRcdGlmIChwcm9wZXJ0aWVzKSB7XG5cdFx0XHRpZiAodHlwZW9mIHByb3BlcnRpZXMgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLnByb3BlcnRpZXMnLCBcIidjb25maWd1cmF0aW9uLnByb3BlcnRpZXMnIG11c3QgYmUgYW4gb2JqZWN0XCIpKTtcblx0XHRcdFx0Y29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzID0ge307XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBwcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdGNvbnN0IHByb3BlcnR5Q29uZmlndXJhdGlvbiA9IHByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IHZhbGlkYXRlUHJvcGVydHkoa2V5LCBwcm9wZXJ0eUNvbmZpZ3VyYXRpb24sIGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlKTtcblx0XHRcdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdFx0XHRkZWxldGUgcHJvcGVydGllc1trZXldO1xuXHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3Iud2FybihtZXNzYWdlKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc2VlblByb3BlcnRpZXMuaGFzKGtleSkgJiYgIUVYVEVOU0lPTl9VTklGSUNBVElPTl9FWFRFTlNJT05fSURTLmhhcyhleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZS50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRcdGRlbGV0ZSBwcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci53YXJuKG5scy5sb2NhbGl6ZSgnY29uZmlnLnByb3BlcnR5LmR1cGxpY2F0ZScsIFwiQ2Fubm90IHJlZ2lzdGVyICd7MH0nLiBUaGlzIHByb3BlcnR5IGlzIGFscmVhZHkgcmVnaXN0ZXJlZC5cIiwga2V5KSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFpc09iamVjdChwcm9wZXJ0eUNvbmZpZ3VyYXRpb24pKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIHByb3BlcnRpZXNba2V5XTtcblx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5wcm9wZXJ0eScsIFwiY29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzIHByb3BlcnR5ICd7MH0nIG11c3QgYmUgYW4gb2JqZWN0XCIsIGtleSkpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHBvbGljeUVudHJ5ID0gZXh0ZW5zaW9uQ29uZmlndXJhdGlvblBvbGljeT8uW2tleV07XG5cdFx0XHRcdGlmIChwb2xpY3lFbnRyeSkge1xuXHRcdFx0XHRcdC8vIEEgcmVmZXJlbmNlIGVudHJ5IGNhcnJpZXMgYSBgcG9saWN5UmVmZXJlbmNlYCBwb2ludGVyOyBhIGZ1bGwgKG93bmVyL1wicGFyZW50XCIpXG5cdFx0XHRcdFx0Ly8gZW50cnkgZGVjbGFyZXMgdGhlIHBvbGljeSBpbmxpbmUuIFJlZmVyZW5jZXMgYXR0YWNoIHRoaXMgc2V0dGluZyB0byBhIHBvbGljeVxuXHRcdFx0XHRcdC8vICpvd25lZCogYnkgYW4gaW4tY29kZSBzZXR0aW5nICh3aG9zZSBgdmFsdWVgIGNhbGxiYWNrIEpTT04gY2Fubm90IGNhcnJ5KS5cblx0XHRcdFx0XHRpZiAoaGFzS2V5KHBvbGljeUVudHJ5LCB7IHBvbGljeVJlZmVyZW5jZTogdHJ1ZSB9KSkge1xuXHRcdFx0XHRcdFx0cHJvcGVydHlDb25maWd1cmF0aW9uLnBvbGljeVJlZmVyZW5jZSA9IHBvbGljeUVudHJ5LnBvbGljeVJlZmVyZW5jZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cHJvcGVydHlDb25maWd1cmF0aW9uLnBvbGljeSA9IHBvbGljeUVudHJ5O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocHJvcGVydHlDb25maWd1cmF0aW9uLnRhZ3M/LnNvbWUodGFnID0+IHRhZy50b0xvd2VyQ2FzZSgpID09PSAnb25leHAnKSkge1xuXHRcdFx0XHRcdHByb3BlcnR5Q29uZmlndXJhdGlvbi5leHBlcmltZW50ID0ge1xuXHRcdFx0XHRcdFx0bW9kZTogJ3N0YXJ0dXAnXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocHJvcGVydHlDb25maWd1cmF0aW9uLmFnZW50c1dpbmRvdyAmJiAhaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLCAnYWdlbnRzV2luZG93Q29uZmlndXJhdGlvbicpKSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2NvbmZpZy5wcm9wZXJ0eS5hZ2VudHNXaW5kb3cucHJvcG9zZWQnLCBcIkV4dGVuc2lvbiAnezB9JyBDQU5OT1QgdXNlICdhZ2VudHNXaW5kb3cnIHByb3BlcnR5IG9uIGNvbmZpZ3VyYXRpb24gJ3sxfScgd2l0aG91dCBlbmFibGluZyB0aGUgJ2FnZW50c1dpbmRvd0NvbmZpZ3VyYXRpb24nIEFQSSBwcm9wb3NhbC5cIiwgZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUsIGtleSkpO1xuXHRcdFx0XHRcdGRlbGV0ZSBwcm9wZXJ0eUNvbmZpZ3VyYXRpb24uYWdlbnRzV2luZG93O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlZW5Qcm9wZXJ0aWVzLmFkZChrZXkpO1xuXHRcdFx0XHRwcm9wZXJ0eUNvbmZpZ3VyYXRpb24uc2NvcGUgPSBwcm9wZXJ0eUNvbmZpZ3VyYXRpb24uc2NvcGUgPyBwYXJzZVNjb3BlKHByb3BlcnR5Q29uZmlndXJhdGlvbi5zY29wZS50b1N0cmluZygpKSA6IENvbmZpZ3VyYXRpb25TY29wZS5XSU5ET1c7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHN1Yk5vZGVzID0gY29uZmlndXJhdGlvbi5hbGxPZjtcblx0XHRpZiAoc3ViTm9kZXMpIHtcblx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmFsbE9mJywgXCInY29uZmlndXJhdGlvbi5hbGxPZicgaXMgZGVwcmVjYXRlZCBhbmQgc2hvdWxkIG5vIGxvbmdlciBiZSB1c2VkLiBJbnN0ZWFkLCBwYXNzIG11bHRpcGxlIGNvbmZpZ3VyYXRpb24gc2VjdGlvbnMgYXMgYW4gYXJyYXkgdG8gdGhlICdjb25maWd1cmF0aW9uJyBjb250cmlidXRpb24gcG9pbnQuXCIpKTtcblx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBzdWJOb2Rlcykge1xuXHRcdFx0XHR2YWxpZGF0ZVByb3BlcnRpZXMobm9kZSwgZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAoYWRkZWQubGVuZ3RoKSB7XG5cdFx0Y29uc3QgYWRkZWRDb25maWd1cmF0aW9uczogSUNvbmZpZ3VyYXRpb25Ob2RlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBhZGRlZCkge1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbnM6IElDb25maWd1cmF0aW9uTm9kZVtdID0gW107XG5cdFx0XHRjb25zdCB2YWx1ZSA9IDxJQ29uZmlndXJhdGlvbk5vZGUgfCBJQ29uZmlndXJhdGlvbk5vZGVbXT5leHRlbnNpb24udmFsdWU7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdFx0dmFsdWUuZm9yRWFjaCh2ID0+IGNvbmZpZ3VyYXRpb25zLnB1c2goaGFuZGxlQ29uZmlndXJhdGlvbih2LCBleHRlbnNpb24pKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25maWd1cmF0aW9ucy5wdXNoKGhhbmRsZUNvbmZpZ3VyYXRpb24odmFsdWUsIGV4dGVuc2lvbikpO1xuXHRcdFx0fVxuXHRcdFx0ZXh0ZW5zaW9uQ29uZmlndXJhdGlvbnMuc2V0KGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLCBjb25maWd1cmF0aW9ucyk7XG5cdFx0XHRhZGRlZENvbmZpZ3VyYXRpb25zLnB1c2goLi4uY29uZmlndXJhdGlvbnMpO1xuXHRcdH1cblxuXHRcdF9jb25maWdEZWx0YS5hZGRlZENvbmZpZ3VyYXRpb25zID0gYWRkZWRDb25maWd1cmF0aW9ucztcblx0fVxuXG5cdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZWx0YUNvbmZpZ3VyYXRpb24oX2NvbmZpZ0RlbHRhKTtcblx0X2NvbmZpZ0RlbHRhID0gdW5kZWZpbmVkO1xufSk7XG4vLyBFTkQgVlNDb2RlIGV4dGVuc2lvbiBwb2ludCBgY29uZmlndXJhdGlvbmBcblxuanNvblJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKCd2c2NvZGU6Ly9zY2hlbWFzL3dvcmtzcGFjZUNvbmZpZycsIHtcblx0YWxsb3dDb21tZW50czogdHJ1ZSxcblx0YWxsb3dUcmFpbGluZ0NvbW1hczogdHJ1ZSxcblx0ZGVmYXVsdDoge1xuXHRcdGZvbGRlcnM6IFtcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogJydcblx0XHRcdH1cblx0XHRdLFxuXHRcdHNldHRpbmdzOiB7XG5cdFx0fVxuXHR9LFxuXHRyZXF1aXJlZDogWydmb2xkZXJzJ10sXG5cdHByb3BlcnRpZXM6IHtcblx0XHQnZm9sZGVycyc6IHtcblx0XHRcdG1pbkl0ZW1zOiAwLFxuXHRcdFx0dW5pcXVlSXRlbXM6IHRydWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd3b3Jrc3BhY2VDb25maWcuZm9sZGVycy5kZXNjcmlwdGlvbicsIFwiTGlzdCBvZiBmb2xkZXJzIHRvIGJlIGxvYWRlZCBpbiB0aGUgd29ya3NwYWNlLlwiKSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgcGF0aDogJyQxJyB9IH1dLFxuXHRcdFx0XHRvbmVPZjogW3tcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd3b3Jrc3BhY2VDb25maWcucGF0aC5kZXNjcmlwdGlvbicsIFwiQSBmaWxlIHBhdGguIGUuZy4gYC9yb290L2ZvbGRlckFgIG9yIGAuL2ZvbGRlckFgIGZvciBhIHJlbGF0aXZlIHBhdGggdGhhdCB3aWxsIGJlIHJlc29sdmVkIGFnYWluc3QgdGhlIGxvY2F0aW9uIG9mIHRoZSB3b3Jrc3BhY2UgZmlsZS5cIilcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRuYW1lOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd3b3Jrc3BhY2VDb25maWcubmFtZS5kZXNjcmlwdGlvbicsIFwiQW4gb3B0aW9uYWwgbmFtZSBmb3IgdGhlIGZvbGRlci4gXCIpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZXF1aXJlZDogWydwYXRoJ11cblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHVyaToge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnd29ya3NwYWNlQ29uZmlnLnVyaS5kZXNjcmlwdGlvbicsIFwiVVJJIG9mIHRoZSBmb2xkZXJcIilcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRuYW1lOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd3b3Jrc3BhY2VDb25maWcubmFtZS5kZXNjcmlwdGlvbicsIFwiQW4gb3B0aW9uYWwgbmFtZSBmb3IgdGhlIGZvbGRlci4gXCIpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZXF1aXJlZDogWyd1cmknXVxuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J3NldHRpbmdzJzoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0OiB7fSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3dvcmtzcGFjZUNvbmZpZy5zZXR0aW5ncy5kZXNjcmlwdGlvbicsIFwiV29ya3NwYWNlIHNldHRpbmdzXCIpLFxuXHRcdFx0JHJlZjogd29ya3NwYWNlU2V0dGluZ3NTY2hlbWFJZFxuXHRcdH0sXG5cdFx0J2xhdW5jaCc6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVmYXVsdDogeyBjb25maWd1cmF0aW9uczogW10sIGNvbXBvdW5kczogW10gfSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3dvcmtzcGFjZUNvbmZpZy5sYXVuY2guZGVzY3JpcHRpb24nLCBcIldvcmtzcGFjZSBsYXVuY2ggY29uZmlndXJhdGlvbnNcIiksXG5cdFx0XHQkcmVmOiBsYXVuY2hTY2hlbWFJZFxuXHRcdH0sXG5cdFx0J3Rhc2tzJzoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0OiB7IHZlcnNpb246ICcyLjAuMCcsIHRhc2tzOiBbXSB9LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnd29ya3NwYWNlQ29uZmlnLnRhc2tzLmRlc2NyaXB0aW9uJywgXCJXb3Jrc3BhY2UgdGFzayBjb25maWd1cmF0aW9uc1wiKSxcblx0XHRcdCRyZWY6IHRhc2tzU2NoZW1hSWRcblx0XHR9LFxuXHRcdCdtY3AnOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0aW5wdXRzOiBbXSxcblx0XHRcdFx0c2VydmVyczoge1xuXHRcdFx0XHRcdCdtY3Atc2VydmVyLXRpbWUnOiB7XG5cdFx0XHRcdFx0XHRjb21tYW5kOiAndXZ4Jyxcblx0XHRcdFx0XHRcdGFyZ3M6IFsnbWNwX3NlcnZlcl90aW1lJywgJy0tbG9jYWwtdGltZXpvbmU9QW1lcmljYS9Mb3NfQW5nZWxlcyddXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnd29ya3NwYWNlQ29uZmlnLm1jcC5kZXNjcmlwdGlvbicsIFwiTW9kZWwgQ29udGV4dCBQcm90b2NvbCBzZXJ2ZXIgY29uZmlndXJhdGlvbnNcIiksXG5cdFx0XHQkcmVmOiBtY3BTY2hlbWFJZFxuXHRcdH0sXG5cdFx0J2V4dGVuc2lvbnMnOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlZmF1bHQ6IHt9LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnd29ya3NwYWNlQ29uZmlnLmV4dGVuc2lvbnMuZGVzY3JpcHRpb24nLCBcIldvcmtzcGFjZSBleHRlbnNpb25zXCIpLFxuXHRcdFx0JHJlZjogJ3ZzY29kZTovL3NjaGVtYXMvZXh0ZW5zaW9ucydcblx0XHR9LFxuXHRcdCdyZW1vdGVBdXRob3JpdHknOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRvTm90U3VnZ2VzdDogdHJ1ZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3dvcmtzcGFjZUNvbmZpZy5yZW1vdGVBdXRob3JpdHknLCBcIlRoZSByZW1vdGUgc2VydmVyIHdoZXJlIHRoZSB3b3Jrc3BhY2UgaXMgbG9jYXRlZC5cIiksXG5cdFx0fSxcblx0XHQndHJhbnNpZW50Jzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZG9Ob3RTdWdnZXN0OiB0cnVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnd29ya3NwYWNlQ29uZmlnLnRyYW5zaWVudCcsIFwiQSB0cmFuc2llbnQgd29ya3NwYWNlIHdpbGwgZGlzYXBwZWFyIHdoZW4gcmVzdGFydGluZyBvciByZWxvYWRpbmcuXCIpLFxuXHRcdH1cblx0fSxcblx0ZXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ3Vua25vd25Xb3Jrc3BhY2VQcm9wZXJ0eScsIFwiVW5rbm93biB3b3Jrc3BhY2UgY29uZmlndXJhdGlvbiBwcm9wZXJ0eVwiKVxufSk7XG5cblxuY2xhc3MgU2V0dGluZ3NUYWJsZVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd0YWJsZSc7XG5cblx0c2hvdWxkUmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFtYW5pZmVzdC5jb250cmlidXRlcz8uY29uZmlndXJhdGlvbjtcblx0fVxuXG5cdHJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSVJlbmRlcmVkRGF0YTxJVGFibGVEYXRhPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Ob2RlW10gPSBtYW5pZmVzdC5jb250cmlidXRlcz8uY29uZmlndXJhdGlvblxuXHRcdFx0PyBBcnJheS5pc0FycmF5KG1hbmlmZXN0LmNvbnRyaWJ1dGVzLmNvbmZpZ3VyYXRpb24pID8gbWFuaWZlc3QuY29udHJpYnV0ZXMuY29uZmlndXJhdGlvbiA6IFttYW5pZmVzdC5jb250cmlidXRlcy5jb25maWd1cmF0aW9uXVxuXHRcdFx0OiBbXTtcblxuXHRcdGNvbnN0IHByb3BlcnRpZXMgPSBnZXRBbGxDb25maWd1cmF0aW9uUHJvcGVydGllcyhjb25maWd1cmF0aW9uKTtcblxuXHRcdGNvbnN0IGNvbnRyaWIgPSBwcm9wZXJ0aWVzID8gT2JqZWN0LmtleXMocHJvcGVydGllcykgOiBbXTtcblx0XHRjb25zdCBoZWFkZXJzID0gW25scy5sb2NhbGl6ZSgnc2V0dGluZyBuYW1lJywgXCJJRFwiKSwgbmxzLmxvY2FsaXplKCdkZXNjcmlwdGlvbicsIFwiRGVzY3JpcHRpb25cIiksIG5scy5sb2NhbGl6ZSgnZGVmYXVsdCcsIFwiRGVmYXVsdFwiKV07XG5cdFx0Y29uc3Qgcm93czogSVJvd0RhdGFbXVtdID0gY29udHJpYi5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpXG5cdFx0XHQubWFwKGtleSA9PiB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kTWFya2Rvd24oYFxcYCR7a2V5fVxcYGApLFxuXHRcdFx0XHRcdHByb3BlcnRpZXNba2V5XS5tYXJrZG93bkRlc2NyaXB0aW9uID8gbmV3IE1hcmtkb3duU3RyaW5nKHByb3BlcnRpZXNba2V5XS5tYXJrZG93bkRlc2NyaXB0aW9uLCBmYWxzZSkgOiBwcm9wZXJ0aWVzW2tleV0uZGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kQ29kZWJsb2NrKCdqc29uJywgSlNPTi5zdHJpbmdpZnkoaXNVbmRlZmluZWQocHJvcGVydGllc1trZXldLmRlZmF1bHQpID8gZ2V0RGVmYXVsdFZhbHVlKHByb3BlcnRpZXNba2V5XS50eXBlKSA6IHByb3BlcnRpZXNba2V5XS5kZWZhdWx0LCBudWxsLCAyKSksXG5cdFx0XHRcdF07XG5cdFx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdHJvd3Ncblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHR9O1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5PihFeHRlbnNpb25GZWF0dXJlc0V4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6ICdjb25maWd1cmF0aW9uJyxcblx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnc2V0dGluZ3MnLCBcIlNldHRpbmdzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoU2V0dGluZ3NUYWJsZVJlbmRlcmVyKSxcbn0pO1xuXG5jbGFzcyBDb25maWd1cmF0aW9uRGVmYXVsdHNUYWJsZVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd0YWJsZSc7XG5cblx0c2hvdWxkUmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFtYW5pZmVzdC5jb250cmlidXRlcz8uY29uZmlndXJhdGlvbkRlZmF1bHRzO1xuXHR9XG5cblx0cmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBJUmVuZGVyZWREYXRhPElUYWJsZURhdGE+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uRGVmYXVsdHMgPSBtYW5pZmVzdC5jb250cmlidXRlcz8uY29uZmlndXJhdGlvbkRlZmF1bHRzID8/IHt9O1xuXG5cdFx0Y29uc3QgaGVhZGVycyA9IFtubHMubG9jYWxpemUoJ2xhbmd1YWdlJywgXCJMYW5ndWFnZXNcIiksIG5scy5sb2NhbGl6ZSgnc2V0dGluZycsIFwiU2V0dGluZ1wiKSwgbmxzLmxvY2FsaXplKCdkZWZhdWx0IG92ZXJyaWRlIHZhbHVlJywgXCJPdmVycmlkZSBWYWx1ZVwiKV07XG5cdFx0Y29uc3Qgcm93czogSVJvd0RhdGFbXVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhjb25maWd1cmF0aW9uRGVmYXVsdHMpLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSkpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gY29uZmlndXJhdGlvbkRlZmF1bHRzW2tleV07XG5cdFx0XHRpZiAoT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChrZXkpKSB7XG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlcyA9IG92ZXJyaWRlSWRlbnRpZmllcnNGcm9tS2V5KGtleSk7XG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlTWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihgJHtsYW5ndWFnZXMuam9pbignLCAnKX1gKTtcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModmFsdWUpLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSkpIHtcblx0XHRcdFx0XHRjb25zdCByb3c6IElSb3dEYXRhW10gPSBbXTtcblx0XHRcdFx0XHRyb3cucHVzaChsYW5ndWFnZU1hcmtkb3duKTtcblx0XHRcdFx0XHRyb3cucHVzaChuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihgXFxgJHtrZXl9XFxgYCkpO1xuXHRcdFx0XHRcdHJvdy5wdXNoKG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZENvZGVibG9jaygnanNvbicsIEpTT04uc3RyaW5naWZ5KHZhbHVlW2tleV0sIG51bGwsIDIpKSk7XG5cdFx0XHRcdFx0cm93cy5wdXNoKHJvdyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHJvdzogSVJvd0RhdGFbXSA9IFtdO1xuXHRcdFx0XHRyb3cucHVzaCgnJyk7XG5cdFx0XHRcdHJvdy5wdXNoKG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKGBcXGAke2tleX1cXGBgKSk7XG5cdFx0XHRcdHJvdy5wdXNoKG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZENvZGVibG9jaygnanNvbicsIEpTT04uc3RyaW5naWZ5KHZhbHVlLCBudWxsLCAyKSkpO1xuXHRcdFx0XHRyb3dzLnB1c2gocm93KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRyb3dzXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9uRmVhdHVyZXNFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpLnJlZ2lzdGVyRXh0ZW5zaW9uRmVhdHVyZSh7XG5cdGlkOiAnY29uZmlndXJhdGlvbkRlZmF1bHRzJyxcblx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnc2V0dGluZ3MgZGVmYXVsdCBvdmVycmlkZXMnLCBcIlNldHRpbmdzIERlZmF1bHQgT3ZlcnJpZGVzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoQ29uZmlndXJhdGlvbkRlZmF1bHRzVGFibGVSZW5kZXJlciksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLGFBQWE7QUFDekIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUywwQkFBK0M7QUFDeEQsU0FBcUQsWUFBWSxrQkFBa0Isb0JBQW9CLHlCQUFpRCwrQkFBb0QsaUJBQWlCLCtCQUErQixZQUFZLHFDQUFxQyxrQ0FBa0M7QUFDL1UsU0FBb0MsY0FBYyxzQkFBc0I7QUFDeEUsU0FBUywyQkFBMkIsZ0JBQWdCLGVBQWUsbUJBQW1CO0FBQ3RGLFNBQVMsUUFBUSxVQUFVLG1CQUFtQjtBQUM5QyxTQUFTLDhCQUFrRDtBQUUzRCxTQUFTLGNBQWMsbUNBQW9JO0FBQzNKLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLE9BQU8sYUFBYTtBQUNwQixTQUFTLDRCQUE0QjtBQUVyQyxNQUFNLGVBQWUsU0FBUyxHQUE4QixlQUFlLGdCQUFnQjtBQUMzRixNQUFNLHdCQUF3QixTQUFTLEdBQTJCLFdBQVcsYUFBYTtBQUUxRixNQUFNLDJCQUF3QztBQUFBLEVBQzdDLE1BQU07QUFBQSxFQUNOLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sSUFBSSxZQUFZLENBQUMsRUFBRSxFQUFFLENBQUM7QUFBQSxFQUN6RCxZQUFZO0FBQUEsSUFDWCxPQUFPO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyxvREFBb0QsK09BQStPO0FBQUEsTUFDN1QsTUFBTTtBQUFBLElBQ1A7QUFBQSxJQUNBLE9BQU87QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLG9EQUFvRCw0RkFBNEY7QUFBQSxNQUMxSyxNQUFNO0FBQUEsSUFDUDtBQUFBLElBQ0EsWUFBWTtBQUFBLE1BQ1gsYUFBYSxJQUFJLFNBQVMseURBQXlELDhDQUE4QztBQUFBLE1BQ2pJLE1BQU07QUFBQSxNQUNOLGVBQWU7QUFBQSxRQUNkLFNBQVM7QUFBQSxRQUNULHFCQUFxQixJQUFJLFNBQVMsNkRBQTZELCtCQUErQjtBQUFBLE1BQy9IO0FBQUEsTUFDQSxzQkFBc0I7QUFBQSxRQUNyQixPQUFPO0FBQUEsVUFDTjtBQUFBLFlBQ0MsT0FBTyxJQUFJLFNBQVMsZ0VBQWdFLHVDQUF1QztBQUFBLFlBQzNILE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsTUFBTTtBQUFBLFlBQ04sWUFBWTtBQUFBLGNBQ1gsT0FBTztBQUFBLGdCQUNOLE1BQU07QUFBQSxnQkFDTixNQUFNLENBQUMsZUFBZSxXQUFXLFVBQVUsWUFBWSx3QkFBd0IscUJBQXFCO0FBQUEsZ0JBQ3BHLFNBQVM7QUFBQSxnQkFDVCxrQkFBa0I7QUFBQSxrQkFDakIsSUFBSSxTQUFTLGlDQUFpQyxpRUFBaUU7QUFBQSxrQkFDL0csSUFBSSxTQUFTLDZCQUE2QixnR0FBZ0c7QUFBQSxrQkFDMUksSUFBSSxTQUFTLDRCQUE0QixpRkFBaUY7QUFBQSxrQkFDMUgsSUFBSSxTQUFTLDhCQUE4Qix5RkFBeUY7QUFBQSxrQkFDcEksSUFBSSxTQUFTLDBDQUEwQyw4RUFBOEU7QUFBQSxrQkFDckksSUFBSSxTQUFTLHlDQUF5QyxvRkFBb0Y7QUFBQSxnQkFDM0k7QUFBQSxnQkFDQSxxQkFBcUIsSUFBSSxTQUFTLHFCQUFxQixpSkFBaUo7QUFBQSxjQUN6TTtBQUFBLGNBQ0Esa0JBQWtCO0FBQUEsZ0JBQ2pCLE1BQU07QUFBQSxnQkFDTixPQUFPO0FBQUEsa0JBQ04sTUFBTTtBQUFBLGdCQUNQO0FBQUEsZ0JBQ0EsYUFBYSxJQUFJLFNBQVMsMEJBQTBCLDhCQUE4QjtBQUFBLGNBQ25GO0FBQUEsY0FDQSwwQkFBMEI7QUFBQSxnQkFDekIsTUFBTTtBQUFBLGdCQUNOLE9BQU87QUFBQSxrQkFDTixNQUFNO0FBQUEsZ0JBQ1A7QUFBQSxnQkFDQSxhQUFhLElBQUksU0FBUyxrQ0FBa0Msc0RBQXNEO0FBQUEsY0FDbkg7QUFBQSxjQUNBLGdCQUFnQjtBQUFBLGdCQUNmLE1BQU07QUFBQSxnQkFDTixPQUFPO0FBQUEsa0JBQ04sTUFBTTtBQUFBLGdCQUNQO0FBQUEsZ0JBQ0EscUJBQXFCLElBQUksU0FBUyx3QkFBd0Isb0pBQW9KLFFBQVE7QUFBQSxjQUN2TjtBQUFBLGNBQ0EscUJBQXFCO0FBQUEsZ0JBQ3BCLE1BQU07QUFBQSxnQkFDTixhQUFhLElBQUksU0FBUyw2QkFBNkIseUNBQXlDO0FBQUEsY0FDakc7QUFBQSxjQUNBLG9CQUFvQjtBQUFBLGdCQUNuQixNQUFNO0FBQUEsZ0JBQ04sYUFBYSxJQUFJLFNBQVMsNEJBQTRCLGdHQUFnRztBQUFBLGNBQ3ZKO0FBQUEsY0FDQSw0QkFBNEI7QUFBQSxnQkFDM0IsTUFBTTtBQUFBLGdCQUNOLGFBQWEsSUFBSSxTQUFTLG9DQUFvQyx1SEFBdUg7QUFBQSxjQUN0TDtBQUFBLGNBQ0Esa0JBQWtCO0FBQUEsZ0JBQ2pCLE1BQU07QUFBQSxnQkFDTixNQUFNLENBQUMsa0JBQWtCLGVBQWU7QUFBQSxnQkFDeEMsa0JBQWtCO0FBQUEsa0JBQ2pCLElBQUksU0FBUyxvQ0FBb0MseUNBQXlDO0FBQUEsa0JBQzFGLElBQUksU0FBUyxtQ0FBbUMsd0NBQXdDO0FBQUEsZ0JBQ3pGO0FBQUEsZ0JBQ0EsU0FBUztBQUFBLGdCQUNULGFBQWEsSUFBSSxTQUFTLDBCQUEwQix5RUFBeUU7QUFBQSxjQUM5SDtBQUFBLGNBQ0EsT0FBTztBQUFBLGdCQUNOLE1BQU07QUFBQSxnQkFDTixhQUFhLElBQUksU0FBUyxlQUFlLGdNQUFnTTtBQUFBLGNBQzFPO0FBQUEsY0FDQSxZQUFZO0FBQUEsZ0JBQ1gsTUFBTTtBQUFBLGdCQUNOLGFBQWEsSUFBSSxTQUFTLG9CQUFvQiw0RkFBNEY7QUFBQSxjQUMzSTtBQUFBLGNBQ0EsVUFBVTtBQUFBLGdCQUNULE1BQU07QUFBQSxnQkFDTixPQUFPO0FBQUEsa0JBQ04sTUFBTTtBQUFBLGdCQUNQO0FBQUEsZ0JBQ0EsYUFBYSxJQUFJLFNBQVMsa0JBQWtCLCtHQUErRztBQUFBLGNBQzVKO0FBQUEsY0FDQSxNQUFNO0FBQUEsZ0JBQ0wsTUFBTTtBQUFBLGdCQUNOLE9BQU87QUFBQSxrQkFDTixNQUFNO0FBQUEsa0JBQ04sTUFBTTtBQUFBLG9CQUNMO0FBQUEsb0JBQ0E7QUFBQSxvQkFDQTtBQUFBLG9CQUNBO0FBQUEsb0JBQ0E7QUFBQSxrQkFDRDtBQUFBLGtCQUNBLGtCQUFrQjtBQUFBLG9CQUNqQixJQUFJLFNBQVMsaUJBQWlCLHdCQUF3QjtBQUFBLG9CQUN0RCxJQUFJLFNBQVMsWUFBWSxtSEFBbUg7QUFBQSxvQkFDNUksSUFBSSxTQUFTLGdCQUFnQixvRkFBb0Y7QUFBQSxvQkFDakgsSUFBSSxTQUFTLFdBQVcsaUZBQWlGO0FBQUEsb0JBQ3pHLElBQUksU0FBUyxhQUFhLG9CQUFvQjtBQUFBLG9CQUM5QyxJQUFJLFNBQVMsc0JBQXNCLG1DQUFtQztBQUFBLGtCQUN2RTtBQUFBLGdCQUNEO0FBQUEsZ0JBQ0EsaUJBQWlCO0FBQUEsZ0JBQ2pCLHFCQUFxQixJQUFJLFNBQVMsY0FBYywwTkFBME47QUFBQSxjQUMzUTtBQUFBLGNBQ0EsY0FBYztBQUFBLGdCQUNiLE1BQU07QUFBQSxnQkFDTixxQkFBcUIsSUFBSSxTQUFTLHNCQUFzQiwyU0FBMlM7QUFBQSxnQkFDblcsWUFBWTtBQUFBLGtCQUNYLFdBQVc7QUFBQSxvQkFDVixhQUFhLElBQUksU0FBUyw4QkFBOEIsMERBQTBEO0FBQUEsa0JBQ25IO0FBQUEsa0JBQ0EsVUFBVTtBQUFBLG9CQUNULE1BQU07QUFBQSxvQkFDTixhQUFhLElBQUksU0FBUywrQkFBK0IsNkVBQTZFO0FBQUEsb0JBQ3RJLFNBQVM7QUFBQSxrQkFDVjtBQUFBLGdCQUNEO0FBQUEsZ0JBQ0Esc0JBQXNCO0FBQUEsY0FDdkI7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQUdBLElBQUk7QUFJSixNQUFNLCtCQUErQixtQkFBbUIsdUJBQXNFO0FBQUEsRUFDN0gsZ0JBQWdCO0FBQUEsRUFDaEIsWUFBWTtBQUFBLElBQ1gsTUFBTTtBQUFBLEVBQ1A7QUFBQSxFQUNBLG1CQUFtQjtBQUNwQixDQUFDO0FBQ0QsNkJBQTZCLFdBQVcsQ0FBQyxZQUFZLEVBQUUsT0FBTyxRQUFRLE1BQU07QUFFM0UsTUFBSSxjQUFjO0FBRWpCLDBCQUFzQixtQkFBbUIsWUFBWTtBQUFBLEVBQ3REO0FBRUEsUUFBTSxZQUFZLGVBQWUsQ0FBQztBQUVsQyxpQkFBZSxNQUFNO0FBQ3BCLFFBQUksaUJBQWlCLFdBQVc7QUFDL0IsNEJBQXNCLG1CQUFtQixZQUFZO0FBQ3JELHFCQUFlO0FBQUEsSUFDaEI7QUFBQSxFQUNELENBQUM7QUFFRCxNQUFJLFFBQVEsUUFBUTtBQUNuQixVQUFNLCtCQUErQixRQUFRLElBQTRCLGdCQUFjLEVBQUUsV0FBVyxRQUFRLFVBQVUsVUFBVSxLQUFLLEdBQUcsUUFBUSxFQUFFLElBQUksVUFBVSxZQUFZLFdBQVcsT0FBTyxhQUFhLFVBQVUsWUFBWSxZQUFZLEVBQUUsRUFBRTtBQUNqUCxpQkFBYSxrQkFBa0I7QUFBQSxFQUNoQztBQUNBLE1BQUksTUFBTSxRQUFRO0FBQ2pCLFVBQU0sdUJBQXVCLHNCQUFzQiwyQkFBMkI7QUFDOUUsVUFBTSxnQkFBZ0IsQ0FBQyxtQkFBbUIscUJBQXFCLG1CQUFtQixRQUFRLG1CQUFtQixVQUFVLG1CQUFtQixvQkFBb0I7QUFDOUosVUFBTSw2QkFBNkIsTUFBTSxJQUE0QixlQUFhO0FBQ2pGLFlBQU0sWUFBWSxRQUFRLFVBQVUsVUFBVSxLQUFLO0FBQ25ELGlCQUFXLE9BQU8sT0FBTyxLQUFLLFNBQVMsR0FBRztBQUN6QyxjQUFNLDJCQUEyQixxQkFBcUIsR0FBRztBQUN6RCxZQUFJLDBCQUEwQiw4QkFBOEI7QUFDM0Qsb0JBQVUsVUFBVSxLQUFLLElBQUksU0FBUyx1REFBdUQsc0hBQXNILEdBQUcsQ0FBQztBQUN2TixpQkFBTyxVQUFVLEdBQUc7QUFDcEI7QUFBQSxRQUNEO0FBQ0EsWUFBSSxDQUFDLHdCQUF3QixLQUFLLEdBQUcsR0FBRztBQUN2QyxjQUFJLDBCQUEwQixTQUFTLENBQUMsY0FBYyxTQUFTLHlCQUF5QixLQUFLLEdBQUc7QUFDL0Ysc0JBQVUsVUFBVSxLQUFLLElBQUksU0FBUyxnREFBZ0QscUtBQXFLLEdBQUcsQ0FBQztBQUMvUCxtQkFBTyxVQUFVLEdBQUc7QUFDcEI7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxhQUFPLEVBQUUsV0FBVyxRQUFRLEVBQUUsSUFBSSxVQUFVLFlBQVksV0FBVyxPQUFPLGFBQWEsVUFBVSxZQUFZLFlBQVksRUFBRTtBQUFBLElBQzVILENBQUM7QUFDRCxpQkFBYSxnQkFBZ0I7QUFBQSxFQUM5QjtBQUNELENBQUM7QUFLRCxNQUFNLHdCQUF3QixtQkFBbUIsdUJBQTJDO0FBQUEsRUFDM0YsZ0JBQWdCO0FBQUEsRUFDaEIsTUFBTSxDQUFDLDRCQUE0QjtBQUFBLEVBQ25DLFlBQVk7QUFBQSxJQUNYLGFBQWEsSUFBSSxTQUFTLDhDQUE4QyxxQ0FBcUM7QUFBQSxJQUM3RyxPQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUNBLG1CQUFtQjtBQUNwQixDQUFDO0FBRUQsTUFBTSwwQkFBd0UsSUFBSSx1QkFBNkM7QUFFL0gsc0JBQXNCLFdBQVcsQ0FBQyxZQUFZLEVBQUUsT0FBTyxRQUFRLE1BQU07QUFHcEUsbUJBQWlCLENBQUM7QUFFbEIsTUFBSSxRQUFRLFFBQVE7QUFDbkIsVUFBTSx3QkFBOEMsQ0FBQztBQUNyRCxlQUFXLGFBQWEsU0FBUztBQUNoQyw0QkFBc0IsS0FBSyxHQUFJLHdCQUF3QixJQUFJLFVBQVUsWUFBWSxVQUFVLEtBQUssQ0FBQyxDQUFFO0FBQ25HLDhCQUF3QixPQUFPLFVBQVUsWUFBWSxVQUFVO0FBQUEsSUFDaEU7QUFDQSxpQkFBYSx3QkFBd0I7QUFBQSxFQUN0QztBQUVBLFFBQU0saUJBQWlCLG9CQUFJLElBQVk7QUFFdkMsV0FBUyxvQkFBb0IsTUFBMEIsV0FBNkQ7QUFDbkgsVUFBTSxnQkFBZ0IsUUFBUSxVQUFVLElBQUk7QUFFNUMsUUFBSSxjQUFjLFNBQVUsT0FBTyxjQUFjLFVBQVUsVUFBVztBQUNyRSxnQkFBVSxVQUFVLE1BQU0sSUFBSSxTQUFTLGlCQUFpQix3Q0FBd0MsQ0FBQztBQUFBLElBQ2xHO0FBRUEsdUJBQW1CLGVBQWUsU0FBUztBQUUzQyxrQkFBYyxLQUFLLEtBQUssTUFBTSxVQUFVLFlBQVksV0FBVztBQUMvRCxrQkFBYyxnQkFBZ0IsRUFBRSxJQUFJLFVBQVUsWUFBWSxXQUFXLE9BQU8sYUFBYSxVQUFVLFlBQVksWUFBWTtBQUMzSCxrQkFBYyx1QkFBdUIsVUFBVSxZQUFZLGNBQWMscUJBQXFCLGNBQWMsWUFBWSxVQUFVLFlBQVksY0FBYyxvQkFBb0IsMkJBQTJCO0FBQzNNLGtCQUFjLFFBQVEsY0FBYyxTQUFTLFVBQVUsWUFBWSxlQUFlLFVBQVUsWUFBWSxXQUFXO0FBQ25ILFdBQU87QUFBQSxFQUNSO0FBRUEsV0FBUyxtQkFBbUIsZUFBbUMsV0FBK0M7QUFDN0csVUFBTSxhQUFhLGNBQWM7QUFDakMsVUFBTSwrQkFBK0IsUUFBUTtBQUM3QyxRQUFJLFlBQVk7QUFDZixVQUFJLE9BQU8sZUFBZSxVQUFVO0FBQ25DLGtCQUFVLFVBQVUsTUFBTSxJQUFJLFNBQVMsc0JBQXNCLDhDQUE4QyxDQUFDO0FBQzVHLHNCQUFjLGFBQWEsQ0FBQztBQUFBLE1BQzdCO0FBQ0EsaUJBQVcsT0FBTyxZQUFZO0FBQzdCLGNBQU0sd0JBQXdCLFdBQVcsR0FBRztBQUM1QyxjQUFNLFVBQVUsaUJBQWlCLEtBQUssdUJBQXVCLFVBQVUsWUFBWSxXQUFXLEtBQUs7QUFDbkcsWUFBSSxTQUFTO0FBQ1osaUJBQU8sV0FBVyxHQUFHO0FBQ3JCLG9CQUFVLFVBQVUsS0FBSyxPQUFPO0FBQ2hDO0FBQUEsUUFDRDtBQUNBLFlBQUksZUFBZSxJQUFJLEdBQUcsS0FBSyxDQUFDLG9DQUFvQyxJQUFJLFVBQVUsWUFBWSxXQUFXLE1BQU0sWUFBWSxDQUFDLEdBQUc7QUFDOUgsaUJBQU8sV0FBVyxHQUFHO0FBQ3JCLG9CQUFVLFVBQVUsS0FBSyxJQUFJLFNBQVMsNkJBQTZCLCtEQUErRCxHQUFHLENBQUM7QUFDdEk7QUFBQSxRQUNEO0FBQ0EsWUFBSSxDQUFDLFNBQVMscUJBQXFCLEdBQUc7QUFDckMsaUJBQU8sV0FBVyxHQUFHO0FBQ3JCLG9CQUFVLFVBQVUsTUFBTSxJQUFJLFNBQVMsb0JBQW9CLDZEQUE2RCxHQUFHLENBQUM7QUFDNUg7QUFBQSxRQUNEO0FBQ0EsY0FBTSxjQUFjLCtCQUErQixHQUFHO0FBQ3RELFlBQUksYUFBYTtBQUloQixjQUFJLE9BQU8sYUFBYSxFQUFFLGlCQUFpQixLQUFLLENBQUMsR0FBRztBQUNuRCxrQ0FBc0Isa0JBQWtCLFlBQVk7QUFBQSxVQUNyRCxPQUFPO0FBQ04sa0NBQXNCLFNBQVM7QUFBQSxVQUNoQztBQUFBLFFBQ0Q7QUFDQSxZQUFJLHNCQUFzQixNQUFNLEtBQUssU0FBTyxJQUFJLFlBQVksTUFBTSxPQUFPLEdBQUc7QUFDM0UsZ0NBQXNCLGFBQWE7QUFBQSxZQUNsQyxNQUFNO0FBQUEsVUFDUDtBQUFBLFFBQ0Q7QUFDQSxZQUFJLHNCQUFzQixnQkFBZ0IsQ0FBQyxxQkFBcUIsVUFBVSxhQUFhLDJCQUEyQixHQUFHO0FBQ3BILG9CQUFVLFVBQVUsTUFBTSxJQUFJLFNBQVMseUNBQXlDLDRJQUE0SSxVQUFVLFlBQVksV0FBVyxPQUFPLEdBQUcsQ0FBQztBQUN4USxpQkFBTyxzQkFBc0I7QUFBQSxRQUM5QjtBQUNBLHVCQUFlLElBQUksR0FBRztBQUN0Qiw4QkFBc0IsUUFBUSxzQkFBc0IsUUFBUSxXQUFXLHNCQUFzQixNQUFNLFNBQVMsQ0FBQyxJQUFJLG1CQUFtQjtBQUFBLE1BQ3JJO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVyxjQUFjO0FBQy9CLFFBQUksVUFBVTtBQUNiLGdCQUFVLFVBQVUsTUFBTSxJQUFJLFNBQVMsaUJBQWlCLHdLQUF3SyxDQUFDO0FBQ2pPLGlCQUFXLFFBQVEsVUFBVTtBQUM1QiwyQkFBbUIsTUFBTSxTQUFTO0FBQUEsTUFDbkM7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLE1BQUksTUFBTSxRQUFRO0FBQ2pCLFVBQU0sc0JBQTRDLENBQUM7QUFDbkQsZUFBVyxhQUFhLE9BQU87QUFDOUIsWUFBTSxpQkFBdUMsQ0FBQztBQUM5QyxZQUFNLFFBQW1ELFVBQVU7QUFDbkUsVUFBSSxNQUFNLFFBQVEsS0FBSyxHQUFHO0FBQ3pCLGNBQU0sUUFBUSxPQUFLLGVBQWUsS0FBSyxvQkFBb0IsR0FBRyxTQUFTLENBQUMsQ0FBQztBQUFBLE1BQzFFLE9BQU87QUFDTix1QkFBZSxLQUFLLG9CQUFvQixPQUFPLFNBQVMsQ0FBQztBQUFBLE1BQzFEO0FBQ0EsOEJBQXdCLElBQUksVUFBVSxZQUFZLFlBQVksY0FBYztBQUM1RSwwQkFBb0IsS0FBSyxHQUFHLGNBQWM7QUFBQSxJQUMzQztBQUVBLGlCQUFhLHNCQUFzQjtBQUFBLEVBQ3BDO0FBRUEsd0JBQXNCLG1CQUFtQixZQUFZO0FBQ3JELGlCQUFlO0FBQ2hCLENBQUM7QUFHRCxhQUFhLGVBQWUsb0NBQW9DO0FBQUEsRUFDL0QsZUFBZTtBQUFBLEVBQ2YscUJBQXFCO0FBQUEsRUFDckIsU0FBUztBQUFBLElBQ1IsU0FBUztBQUFBLE1BQ1I7QUFBQSxRQUNDLE1BQU07QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUFBLElBQ0EsVUFBVSxDQUNWO0FBQUEsRUFDRDtBQUFBLEVBQ0EsVUFBVSxDQUFDLFNBQVM7QUFBQSxFQUNwQixZQUFZO0FBQUEsSUFDWCxXQUFXO0FBQUEsTUFDVixVQUFVO0FBQUEsTUFDVixhQUFhO0FBQUEsTUFDYixhQUFhLElBQUksU0FBUyx1Q0FBdUMsZ0RBQWdEO0FBQUEsTUFDakgsT0FBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04saUJBQWlCLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxLQUFLLEVBQUUsQ0FBQztBQUFBLFFBQzFDLE9BQU8sQ0FBQztBQUFBLFVBQ1AsWUFBWTtBQUFBLFlBQ1gsTUFBTTtBQUFBLGNBQ0wsTUFBTTtBQUFBLGNBQ04sYUFBYSxJQUFJLFNBQVMsb0NBQW9DLHdJQUF3STtBQUFBLFlBQ3ZNO0FBQUEsWUFDQSxNQUFNO0FBQUEsY0FDTCxNQUFNO0FBQUEsY0FDTixhQUFhLElBQUksU0FBUyxvQ0FBb0MsbUNBQW1DO0FBQUEsWUFDbEc7QUFBQSxVQUNEO0FBQUEsVUFDQSxVQUFVLENBQUMsTUFBTTtBQUFBLFFBQ2xCLEdBQUc7QUFBQSxVQUNGLFlBQVk7QUFBQSxZQUNYLEtBQUs7QUFBQSxjQUNKLE1BQU07QUFBQSxjQUNOLGFBQWEsSUFBSSxTQUFTLG1DQUFtQyxtQkFBbUI7QUFBQSxZQUNqRjtBQUFBLFlBQ0EsTUFBTTtBQUFBLGNBQ0wsTUFBTTtBQUFBLGNBQ04sYUFBYSxJQUFJLFNBQVMsb0NBQW9DLG1DQUFtQztBQUFBLFlBQ2xHO0FBQUEsVUFDRDtBQUFBLFVBQ0EsVUFBVSxDQUFDLEtBQUs7QUFBQSxRQUNqQixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxJQUNBLFlBQVk7QUFBQSxNQUNYLE1BQU07QUFBQSxNQUNOLFNBQVMsQ0FBQztBQUFBLE1BQ1YsYUFBYSxJQUFJLFNBQVMsd0NBQXdDLG9CQUFvQjtBQUFBLE1BQ3RGLE1BQU07QUFBQSxJQUNQO0FBQUEsSUFDQSxVQUFVO0FBQUEsTUFDVCxNQUFNO0FBQUEsTUFDTixTQUFTLEVBQUUsZ0JBQWdCLENBQUMsR0FBRyxXQUFXLENBQUMsRUFBRTtBQUFBLE1BQzdDLGFBQWEsSUFBSSxTQUFTLHNDQUFzQyxpQ0FBaUM7QUFBQSxNQUNqRyxNQUFNO0FBQUEsSUFDUDtBQUFBLElBQ0EsU0FBUztBQUFBLE1BQ1IsTUFBTTtBQUFBLE1BQ04sU0FBUyxFQUFFLFNBQVMsU0FBUyxPQUFPLENBQUMsRUFBRTtBQUFBLE1BQ3ZDLGFBQWEsSUFBSSxTQUFTLHFDQUFxQywrQkFBK0I7QUFBQSxNQUM5RixNQUFNO0FBQUEsSUFDUDtBQUFBLElBQ0EsT0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLFFBQ1IsUUFBUSxDQUFDO0FBQUEsUUFDVCxTQUFTO0FBQUEsVUFDUixtQkFBbUI7QUFBQSxZQUNsQixTQUFTO0FBQUEsWUFDVCxNQUFNLENBQUMsbUJBQW1CLHNDQUFzQztBQUFBLFVBQ2pFO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGFBQWEsSUFBSSxTQUFTLG1DQUFtQyw4Q0FBOEM7QUFBQSxNQUMzRyxNQUFNO0FBQUEsSUFDUDtBQUFBLElBQ0EsY0FBYztBQUFBLE1BQ2IsTUFBTTtBQUFBLE1BQ04sU0FBUyxDQUFDO0FBQUEsTUFDVixhQUFhLElBQUksU0FBUywwQ0FBMEMsc0JBQXNCO0FBQUEsTUFDMUYsTUFBTTtBQUFBLElBQ1A7QUFBQSxJQUNBLG1CQUFtQjtBQUFBLE1BQ2xCLE1BQU07QUFBQSxNQUNOLGNBQWM7QUFBQSxNQUNkLGFBQWEsSUFBSSxTQUFTLG1DQUFtQyxtREFBbUQ7QUFBQSxJQUNqSDtBQUFBLElBQ0EsYUFBYTtBQUFBLE1BQ1osTUFBTTtBQUFBLE1BQ04sY0FBYztBQUFBLE1BQ2QsYUFBYSxJQUFJLFNBQVMsNkJBQTZCLG9FQUFvRTtBQUFBLElBQzVIO0FBQUEsRUFDRDtBQUFBLEVBQ0EsY0FBYyxJQUFJLFNBQVMsNEJBQTRCLDBDQUEwQztBQUNsRyxDQUFDO0FBR0QsTUFBTSw4QkFBOEIsV0FBcUQ7QUFBQSxFQUF6RjtBQUFBO0FBRUMsU0FBUyxPQUFPO0FBQUE7QUFBQSxFQUVoQixhQUFhLFVBQXVDO0FBQ25ELFdBQU8sQ0FBQyxDQUFDLFNBQVMsYUFBYTtBQUFBLEVBQ2hDO0FBQUEsRUFFQSxPQUFPLFVBQXlEO0FBQy9ELFVBQU0sZ0JBQXNDLFNBQVMsYUFBYSxnQkFDL0QsTUFBTSxRQUFRLFNBQVMsWUFBWSxhQUFhLElBQUksU0FBUyxZQUFZLGdCQUFnQixDQUFDLFNBQVMsWUFBWSxhQUFhLElBQzVILENBQUM7QUFFSixVQUFNLGFBQWEsOEJBQThCLGFBQWE7QUFFOUQsVUFBTSxVQUFVLGFBQWEsT0FBTyxLQUFLLFVBQVUsSUFBSSxDQUFDO0FBQ3hELFVBQU0sVUFBVSxDQUFDLElBQUksU0FBUyxnQkFBZ0IsSUFBSSxHQUFHLElBQUksU0FBUyxlQUFlLGFBQWEsR0FBRyxJQUFJLFNBQVMsV0FBVyxTQUFTLENBQUM7QUFDbkksVUFBTSxPQUFxQixRQUFRLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQyxFQUNsRSxJQUFJLFNBQU87QUFDWCxhQUFPO0FBQUEsUUFDTixJQUFJLGVBQWUsRUFBRSxlQUFlLEtBQUssR0FBRyxJQUFJO0FBQUEsUUFDaEQsV0FBVyxHQUFHLEVBQUUsc0JBQXNCLElBQUksZUFBZSxXQUFXLEdBQUcsRUFBRSxxQkFBcUIsS0FBSyxJQUFJLFdBQVcsR0FBRyxFQUFFLGVBQWU7QUFBQSxRQUN0SSxJQUFJLGVBQWUsRUFBRSxnQkFBZ0IsUUFBUSxLQUFLLFVBQVUsWUFBWSxXQUFXLEdBQUcsRUFBRSxPQUFPLElBQUksZ0JBQWdCLFdBQVcsR0FBRyxFQUFFLElBQUksSUFBSSxXQUFXLEdBQUcsRUFBRSxTQUFTLE1BQU0sQ0FBQyxDQUFDO0FBQUEsTUFDN0s7QUFBQSxJQUNELENBQUM7QUFFRixXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsUUFDTDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxTQUFTLE1BQU07QUFBQSxNQUFFO0FBQUEsSUFDbEI7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxTQUFTLEdBQStCLDRCQUE0Qix5QkFBeUIsRUFBRSx5QkFBeUI7QUFBQSxFQUN2SCxJQUFJO0FBQUEsRUFDSixPQUFPLElBQUksU0FBUyxZQUFZLFVBQVU7QUFBQSxFQUMxQyxRQUFRO0FBQUEsSUFDUCxXQUFXO0FBQUEsRUFDWjtBQUFBLEVBQ0EsVUFBVSxJQUFJLGVBQWUscUJBQXFCO0FBQ25ELENBQUM7QUFFRCxNQUFNLDJDQUEyQyxXQUFxRDtBQUFBLEVBQXRHO0FBQUE7QUFFQyxTQUFTLE9BQU87QUFBQTtBQUFBLEVBRWhCLGFBQWEsVUFBdUM7QUFDbkQsV0FBTyxDQUFDLENBQUMsU0FBUyxhQUFhO0FBQUEsRUFDaEM7QUFBQSxFQUVBLE9BQU8sVUFBeUQ7QUFDL0QsVUFBTSx3QkFBd0IsU0FBUyxhQUFhLHlCQUF5QixDQUFDO0FBRTlFLFVBQU0sVUFBVSxDQUFDLElBQUksU0FBUyxZQUFZLFdBQVcsR0FBRyxJQUFJLFNBQVMsV0FBVyxTQUFTLEdBQUcsSUFBSSxTQUFTLDBCQUEwQixnQkFBZ0IsQ0FBQztBQUNwSixVQUFNLE9BQXFCLENBQUM7QUFFNUIsZUFBVyxPQUFPLE9BQU8sS0FBSyxxQkFBcUIsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUMsR0FBRztBQUN4RixZQUFNLFFBQVEsc0JBQXNCLEdBQUc7QUFDdkMsVUFBSSx3QkFBd0IsS0FBSyxHQUFHLEdBQUc7QUFDdEMsY0FBTSxZQUFZLDJCQUEyQixHQUFHO0FBQ2hELGNBQU0sbUJBQW1CLElBQUksZUFBZSxFQUFFLGVBQWUsR0FBRyxVQUFVLEtBQUssSUFBSSxDQUFDLEVBQUU7QUFDdEYsbUJBQVdBLFFBQU8sT0FBTyxLQUFLLEtBQUssRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUMsR0FBRztBQUN4RSxnQkFBTSxNQUFrQixDQUFDO0FBQ3pCLGNBQUksS0FBSyxnQkFBZ0I7QUFDekIsY0FBSSxLQUFLLElBQUksZUFBZSxFQUFFLGVBQWUsS0FBS0EsSUFBRyxJQUFJLENBQUM7QUFDMUQsY0FBSSxLQUFLLElBQUksZUFBZSxFQUFFLGdCQUFnQixRQUFRLEtBQUssVUFBVSxNQUFNQSxJQUFHLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUMxRixlQUFLLEtBQUssR0FBRztBQUFBLFFBQ2Q7QUFBQSxNQUNELE9BQU87QUFDTixjQUFNLE1BQWtCLENBQUM7QUFDekIsWUFBSSxLQUFLLEVBQUU7QUFDWCxZQUFJLEtBQUssSUFBSSxlQUFlLEVBQUUsZUFBZSxLQUFLLEdBQUcsSUFBSSxDQUFDO0FBQzFELFlBQUksS0FBSyxJQUFJLGVBQWUsRUFBRSxnQkFBZ0IsUUFBUSxLQUFLLFVBQVUsT0FBTyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQ3JGLGFBQUssS0FBSyxHQUFHO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsUUFDTDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxTQUFTLE1BQU07QUFBQSxNQUFFO0FBQUEsSUFDbEI7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxTQUFTLEdBQStCLDRCQUE0Qix5QkFBeUIsRUFBRSx5QkFBeUI7QUFBQSxFQUN2SCxJQUFJO0FBQUEsRUFDSixPQUFPLElBQUksU0FBUyw4QkFBOEIsNEJBQTRCO0FBQUEsRUFDOUUsUUFBUTtBQUFBLElBQ1AsV0FBVztBQUFBLEVBQ1o7QUFBQSxFQUNBLFVBQVUsSUFBSSxlQUFlLGtDQUFrQztBQUNoRSxDQUFDOyIsCiAgIm5hbWVzIjogWyJrZXkiXQp9Cg==
