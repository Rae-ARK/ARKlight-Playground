import * as nls from "../../../../nls.js";
import * as Types from "../../../../base/common/types.js";
import * as Objects from "../../../../base/common/objects.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Emitter } from "../../../../base/common/event.js";
const taskDefinitionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      description: nls.localize("TaskDefinition.description", "The actual task type. Please note that types starting with a '$' are reserved for internal usage.")
    },
    required: {
      type: "array",
      markdownDescription: nls.localize("TaskDefinition.required", "The names of the properties from the `properties` object that must be provided for a task of this type to be considered a match. Used by VS Code to associate a `tasks.json` entry with a registered task provider."),
      items: {
        type: "string"
      }
    },
    properties: {
      type: "object",
      description: nls.localize("TaskDefinition.properties", "Additional properties of the task type"),
      additionalProperties: {
        $ref: "http://json-schema.org/draft-07/schema#"
      }
    },
    when: {
      type: "string",
      markdownDescription: nls.localize("TaskDefinition.when", "Condition which must be true to enable this type of task. Consider using `shellExecutionSupported`, `processExecutionSupported`, and `customExecutionSupported` as appropriate for this task definition. See the [API documentation](https://code.visualstudio.com/api/extension-guides/task-provider#when-clause) for more information."),
      default: ""
    }
  }
};
var Configuration;
((Configuration2) => {
  function from(value, extensionId, messageCollector) {
    if (!value) {
      return void 0;
    }
    const taskType = Types.isString(value.type) ? value.type : void 0;
    if (!taskType || taskType.length === 0) {
      messageCollector.error(nls.localize("TaskTypeConfiguration.noType", "The task type configuration is missing the required 'taskType' property"));
      return void 0;
    }
    const required = [];
    if (Array.isArray(value.required)) {
      for (const element of value.required) {
        if (Types.isString(element)) {
          required.push(element);
        }
      }
    }
    return {
      extensionId: extensionId.value,
      taskType,
      required,
      properties: value.properties ? Objects.deepClone(value.properties) : {},
      when: value.when ? ContextKeyExpr.deserialize(value.when) : void 0
    };
  }
  Configuration2.from = from;
})(Configuration || (Configuration = {}));
const taskDefinitionsExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "taskDefinitions",
  activationEventsGenerator: function* (contributions) {
    for (const task of contributions) {
      if (task.type) {
        yield `onTaskType:${task.type}`;
      }
    }
  },
  jsonSchema: {
    description: nls.localize("TaskDefinitionExtPoint", "Contributes task kinds"),
    type: "array",
    items: taskDefinitionSchema
  }
});
class TaskDefinitionRegistryImpl {
  constructor() {
    this._onDefinitionsChanged = new Emitter();
    this.onDefinitionsChanged = this._onDefinitionsChanged.event;
    this.taskTypes = /* @__PURE__ */ Object.create(null);
    this.readyPromise = new Promise((resolve, reject) => {
      taskDefinitionsExtPoint.setHandler((extensions, delta) => {
        this._schema = void 0;
        try {
          for (const extension of delta.removed) {
            const taskTypes = extension.value;
            for (const taskType of taskTypes) {
              if (this.taskTypes && taskType.type && this.taskTypes[taskType.type]) {
                delete this.taskTypes[taskType.type];
              }
            }
          }
          for (const extension of delta.added) {
            const taskTypes = extension.value;
            for (const taskType of taskTypes) {
              const type = Configuration.from(taskType, extension.description.identifier, extension.collector);
              if (type) {
                this.taskTypes[type.taskType] = type;
              }
            }
          }
          if (delta.removed.length > 0 || delta.added.length > 0) {
            this._onDefinitionsChanged.fire();
          }
        } catch (error) {
        }
        resolve(void 0);
      });
    });
  }
  onReady() {
    return this.readyPromise;
  }
  get(key) {
    return this.taskTypes[key];
  }
  all() {
    return Object.keys(this.taskTypes).map((key) => this.taskTypes[key]);
  }
  getJsonSchema() {
    if (this._schema === void 0) {
      const schemas = [];
      for (const definition of this.all()) {
        const schema = {
          type: "object",
          additionalProperties: false
        };
        if (definition.required.length > 0) {
          schema.required = definition.required.slice(0);
        }
        if (definition.properties !== void 0) {
          schema.properties = Objects.deepClone(definition.properties);
        } else {
          schema.properties = /* @__PURE__ */ Object.create(null);
        }
        schema.properties.type = {
          type: "string",
          enum: [definition.taskType]
        };
        schemas.push(schema);
      }
      this._schema = { oneOf: schemas };
    }
    return this._schema;
  }
}
const TaskDefinitionRegistry = new TaskDefinitionRegistryImpl();
export {
  TaskDefinitionRegistry
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2NvbW1vbi90YXNrRGVmaW5pdGlvblJlZ2lzdHJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSwgSUpTT05TY2hlbWFNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0ICogYXMgVHlwZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICogYXMgT2JqZWN0cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcblxuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5LCBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcblxuaW1wb3J0ICogYXMgVGFza3MgZnJvbSAnLi90YXNrcy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5cblxuY29uc3QgdGFza0RlZmluaXRpb25TY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0dHlwZToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdUYXNrRGVmaW5pdGlvbi5kZXNjcmlwdGlvbicsICdUaGUgYWN0dWFsIHRhc2sgdHlwZS4gUGxlYXNlIG5vdGUgdGhhdCB0eXBlcyBzdGFydGluZyB3aXRoIGEgXFwnJFxcJyBhcmUgcmVzZXJ2ZWQgZm9yIGludGVybmFsIHVzYWdlLicpXG5cdFx0fSxcblx0XHRyZXF1aXJlZDoge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnVGFza0RlZmluaXRpb24ucmVxdWlyZWQnLCAnVGhlIG5hbWVzIG9mIHRoZSBwcm9wZXJ0aWVzIGZyb20gdGhlIGBwcm9wZXJ0aWVzYCBvYmplY3QgdGhhdCBtdXN0IGJlIHByb3ZpZGVkIGZvciBhIHRhc2sgb2YgdGhpcyB0eXBlIHRvIGJlIGNvbnNpZGVyZWQgYSBtYXRjaC4gVXNlZCBieSBWUyBDb2RlIHRvIGFzc29jaWF0ZSBhIGB0YXNrcy5qc29uYCBlbnRyeSB3aXRoIGEgcmVnaXN0ZXJlZCB0YXNrIHByb3ZpZGVyLicpLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH1cblx0XHR9LFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnVGFza0RlZmluaXRpb24ucHJvcGVydGllcycsICdBZGRpdGlvbmFsIHByb3BlcnRpZXMgb2YgdGhlIHRhc2sgdHlwZScpLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0JHJlZjogJ2h0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDcvc2NoZW1hIydcblx0XHRcdH1cblx0XHR9LFxuXHRcdHdoZW46IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdUYXNrRGVmaW5pdGlvbi53aGVuJywgJ0NvbmRpdGlvbiB3aGljaCBtdXN0IGJlIHRydWUgdG8gZW5hYmxlIHRoaXMgdHlwZSBvZiB0YXNrLiBDb25zaWRlciB1c2luZyBgc2hlbGxFeGVjdXRpb25TdXBwb3J0ZWRgLCBgcHJvY2Vzc0V4ZWN1dGlvblN1cHBvcnRlZGAsIGFuZCBgY3VzdG9tRXhlY3V0aW9uU3VwcG9ydGVkYCBhcyBhcHByb3ByaWF0ZSBmb3IgdGhpcyB0YXNrIGRlZmluaXRpb24uIFNlZSB0aGUgW0FQSSBkb2N1bWVudGF0aW9uXShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9hcGkvZXh0ZW5zaW9uLWd1aWRlcy90YXNrLXByb3ZpZGVyI3doZW4tY2xhdXNlKSBmb3IgbW9yZSBpbmZvcm1hdGlvbi4nKSxcblx0XHRcdGRlZmF1bHQ6ICcnXG5cdFx0fVxuXHR9XG59O1xuXG5uYW1lc3BhY2UgQ29uZmlndXJhdGlvbiB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgSVRhc2tEZWZpbml0aW9uIHtcblx0XHR0eXBlPzogc3RyaW5nO1xuXHRcdHJlcXVpcmVkPzogc3RyaW5nW107XG5cdFx0cHJvcGVydGllcz86IElKU09OU2NoZW1hTWFwO1xuXHRcdHdoZW4/OiBzdHJpbmc7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogSVRhc2tEZWZpbml0aW9uLCBleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgbWVzc2FnZUNvbGxlY3RvcjogRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3Rvcik6IFRhc2tzLklUYXNrRGVmaW5pdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdGFza1R5cGUgPSBUeXBlcy5pc1N0cmluZyh2YWx1ZS50eXBlKSA/IHZhbHVlLnR5cGUgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCF0YXNrVHlwZSB8fCB0YXNrVHlwZS5sZW5ndGggPT09IDApIHtcblx0XHRcdG1lc3NhZ2VDb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdUYXNrVHlwZUNvbmZpZ3VyYXRpb24ubm9UeXBlJywgJ1RoZSB0YXNrIHR5cGUgY29uZmlndXJhdGlvbiBpcyBtaXNzaW5nIHRoZSByZXF1aXJlZCBcXCd0YXNrVHlwZVxcJyBwcm9wZXJ0eScpKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlcXVpcmVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlLnJlcXVpcmVkKSkge1xuXHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIHZhbHVlLnJlcXVpcmVkKSB7XG5cdFx0XHRcdGlmIChUeXBlcy5pc1N0cmluZyhlbGVtZW50KSkge1xuXHRcdFx0XHRcdHJlcXVpcmVkLnB1c2goZWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGV4dGVuc2lvbklkOiBleHRlbnNpb25JZC52YWx1ZSxcblx0XHRcdHRhc2tUeXBlLCByZXF1aXJlZDogcmVxdWlyZWQsXG5cdFx0XHRwcm9wZXJ0aWVzOiB2YWx1ZS5wcm9wZXJ0aWVzID8gT2JqZWN0cy5kZWVwQ2xvbmUodmFsdWUucHJvcGVydGllcykgOiB7fSxcblx0XHRcdHdoZW46IHZhbHVlLndoZW4gPyBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZSh2YWx1ZS53aGVuKSA6IHVuZGVmaW5lZFxuXHRcdH07XG5cdH1cbn1cblxuXG5jb25zdCB0YXNrRGVmaW5pdGlvbnNFeHRQb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PENvbmZpZ3VyYXRpb24uSVRhc2tEZWZpbml0aW9uW10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICd0YXNrRGVmaW5pdGlvbnMnLFxuXHRhY3RpdmF0aW9uRXZlbnRzR2VuZXJhdG9yOiBmdW5jdGlvbiogKGNvbnRyaWJ1dGlvbnM6IHJlYWRvbmx5IENvbmZpZ3VyYXRpb24uSVRhc2tEZWZpbml0aW9uW10pIHtcblx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgY29udHJpYnV0aW9ucykge1xuXHRcdFx0aWYgKHRhc2sudHlwZSkge1xuXHRcdFx0XHR5aWVsZCBgb25UYXNrVHlwZToke3Rhc2sudHlwZX1gO1xuXHRcdFx0fVxuXHRcdH1cblx0fSxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ1Rhc2tEZWZpbml0aW9uRXh0UG9pbnQnLCAnQ29udHJpYnV0ZXMgdGFzayBraW5kcycpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHRhc2tEZWZpbml0aW9uU2NoZW1hXG5cdH1cbn0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5IHtcblx0b25SZWFkeSgpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdGdldChrZXk6IHN0cmluZyk6IFRhc2tzLklUYXNrRGVmaW5pdGlvbjtcblx0YWxsKCk6IFRhc2tzLklUYXNrRGVmaW5pdGlvbltdO1xuXHRnZXRKc29uU2NoZW1hKCk6IElKU09OU2NoZW1hO1xuXHRyZWFkb25seSBvbkRlZmluaXRpb25zQ2hhbmdlZDogRXZlbnQ8dm9pZD47XG59XG5cbmNsYXNzIFRhc2tEZWZpbml0aW9uUmVnaXN0cnlJbXBsIGltcGxlbWVudHMgSVRhc2tEZWZpbml0aW9uUmVnaXN0cnkge1xuXG5cdHByaXZhdGUgdGFza1R5cGVzOiBJU3RyaW5nRGljdGlvbmFyeTxUYXNrcy5JVGFza0RlZmluaXRpb24+O1xuXHRwcml2YXRlIHJlYWR5UHJvbWlzZTogUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSBfc2NoZW1hOiBJSlNPTlNjaGVtYSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfb25EZWZpbml0aW9uc0NoYW5nZWQ6IEVtaXR0ZXI8dm9pZD4gPSBuZXcgRW1pdHRlcigpO1xuXHRwdWJsaWMgb25EZWZpbml0aW9uc0NoYW5nZWQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EZWZpbml0aW9uc0NoYW5nZWQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy50YXNrVHlwZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMucmVhZHlQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0dGFza0RlZmluaXRpb25zRXh0UG9pbnQuc2V0SGFuZGxlcigoZXh0ZW5zaW9ucywgZGVsdGEpID0+IHtcblx0XHRcdFx0dGhpcy5fc2NoZW1hID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGRlbHRhLnJlbW92ZWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRhc2tUeXBlcyA9IGV4dGVuc2lvbi52YWx1ZTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgdGFza1R5cGUgb2YgdGFza1R5cGVzKSB7XG5cdFx0XHRcdFx0XHRcdGlmICh0aGlzLnRhc2tUeXBlcyAmJiB0YXNrVHlwZS50eXBlICYmIHRoaXMudGFza1R5cGVzW3Rhc2tUeXBlLnR5cGVdKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVsZXRlIHRoaXMudGFza1R5cGVzW3Rhc2tUeXBlLnR5cGVdO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGRlbHRhLmFkZGVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0YXNrVHlwZXMgPSBleHRlbnNpb24udmFsdWU7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHRhc2tUeXBlIG9mIHRhc2tUeXBlcykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB0eXBlID0gQ29uZmlndXJhdGlvbi5mcm9tKHRhc2tUeXBlLCBleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllciwgZXh0ZW5zaW9uLmNvbGxlY3Rvcik7XG5cdFx0XHRcdFx0XHRcdGlmICh0eXBlKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy50YXNrVHlwZXNbdHlwZS50YXNrVHlwZV0gPSB0eXBlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICgoZGVsdGEucmVtb3ZlZC5sZW5ndGggPiAwKSB8fCAoZGVsdGEuYWRkZWQubGVuZ3RoID4gMCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGVmaW5pdGlvbnNDaGFuZ2VkLmZpcmUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb25SZWFkeSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5yZWFkeVByb21pc2U7XG5cdH1cblxuXHRwdWJsaWMgZ2V0KGtleTogc3RyaW5nKTogVGFza3MuSVRhc2tEZWZpbml0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy50YXNrVHlwZXNba2V5XTtcblx0fVxuXG5cdHB1YmxpYyBhbGwoKTogVGFza3MuSVRhc2tEZWZpbml0aW9uW10ge1xuXHRcdHJldHVybiBPYmplY3Qua2V5cyh0aGlzLnRhc2tUeXBlcykubWFwKGtleSA9PiB0aGlzLnRhc2tUeXBlc1trZXldKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRKc29uU2NoZW1hKCk6IElKU09OU2NoZW1hIHtcblx0XHRpZiAodGhpcy5fc2NoZW1hID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHNjaGVtYXM6IElKU09OU2NoZW1hW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZGVmaW5pdGlvbiBvZiB0aGlzLmFsbCgpKSB7XG5cdFx0XHRcdGNvbnN0IHNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlXG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmIChkZWZpbml0aW9uLnJlcXVpcmVkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRzY2hlbWEucmVxdWlyZWQgPSBkZWZpbml0aW9uLnJlcXVpcmVkLnNsaWNlKDApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChkZWZpbml0aW9uLnByb3BlcnRpZXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHNjaGVtYS5wcm9wZXJ0aWVzID0gT2JqZWN0cy5kZWVwQ2xvbmUoZGVmaW5pdGlvbi5wcm9wZXJ0aWVzKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzY2hlbWEucHJvcGVydGllcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2NoZW1hLnByb3BlcnRpZXMhLnR5cGUgPSB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogW2RlZmluaXRpb24udGFza1R5cGVdXG5cdFx0XHRcdH07XG5cdFx0XHRcdHNjaGVtYXMucHVzaChzY2hlbWEpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2NoZW1hID0geyBvbmVPZjogc2NoZW1hcyB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2NoZW1hO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5OiBJVGFza0RlZmluaXRpb25SZWdpc3RyeSA9IG5ldyBUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5SW1wbCgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBR3JCLFlBQVksV0FBVztBQUN2QixZQUFZLGFBQWE7QUFFekIsU0FBUywwQkFBcUQ7QUFJOUQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxlQUFzQjtBQUcvQixNQUFNLHVCQUFvQztBQUFBLEVBQ3pDLE1BQU07QUFBQSxFQUNOLHNCQUFzQjtBQUFBLEVBQ3RCLFlBQVk7QUFBQSxJQUNYLE1BQU07QUFBQSxNQUNMLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLDhCQUE4QixtR0FBcUc7QUFBQSxJQUM5SjtBQUFBLElBQ0EsVUFBVTtBQUFBLE1BQ1QsTUFBTTtBQUFBLE1BQ04scUJBQXFCLElBQUksU0FBUywyQkFBMkIscU5BQXFOO0FBQUEsTUFDbFIsT0FBTztBQUFBLFFBQ04sTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBQUEsSUFDQSxZQUFZO0FBQUEsTUFDWCxNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyw2QkFBNkIsd0NBQXdDO0FBQUEsTUFDL0Ysc0JBQXNCO0FBQUEsUUFDckIsTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBQUEsSUFDQSxNQUFNO0FBQUEsTUFDTCxNQUFNO0FBQUEsTUFDTixxQkFBcUIsSUFBSSxTQUFTLHVCQUF1QiwwVUFBMFU7QUFB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
