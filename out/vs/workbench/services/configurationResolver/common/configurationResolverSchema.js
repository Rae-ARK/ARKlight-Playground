import * as nls from "../../../../nls.js";
const idDescription = nls.localize("JsonSchema.input.id", "The input's id is used to associate an input with a variable of the form ${input:id}.");
const typeDescription = nls.localize("JsonSchema.input.type", "The type of user input prompt to use.");
const descriptionDescription = nls.localize("JsonSchema.input.description", "The description is shown when the user is prompted for input.");
const defaultDescription = nls.localize("JsonSchema.input.default", "The default value for the input.");
const inputsSchema = {
  definitions: {
    inputs: {
      type: "array",
      description: nls.localize("JsonSchema.inputs", "User inputs. Used for defining user input prompts, such as free string input or a choice from several options."),
      items: {
        oneOf: [
          {
            type: "object",
            required: ["id", "type", "description"],
            additionalProperties: false,
            properties: {
              id: {
                type: "string",
                description: idDescription
              },
              type: {
                type: "string",
                description: typeDescription,
                enum: ["promptString"],
                enumDescriptions: [
                  nls.localize("JsonSchema.input.type.promptString", "The 'promptString' type opens an input box to ask the user for input.")
                ]
              },
              description: {
                type: "string",
                description: descriptionDescription
              },
              default: {
                type: "string",
                description: defaultDescription
              },
              password: {
                type: "boolean",
                description: nls.localize("JsonSchema.input.password", "Controls if a password input is shown. Password input hides the typed text.")
              }
            }
          },
          {
            type: "object",
            required: ["id", "type", "description", "options"],
            additionalProperties: false,
            properties: {
              id: {
                type: "string",
                description: idDescription
              },
              type: {
                type: "string",
                description: typeDescription,
                enum: ["pickString"],
                enumDescriptions: [
                  nls.localize("JsonSchema.input.type.pickString", "The 'pickString' type shows a selection list.")
                ]
              },
              description: {
                type: "string",
                description: descriptionDescription
              },
              default: {
                type: "string",
                description: defaultDescription
              },
              options: {
                type: "array",
                description: nls.localize("JsonSchema.input.options", "An array of strings that defines the options for a quick pick."),
                items: {
                  oneOf: [
                    {
                      type: "string"
                    },
                    {
                      type: "object",
                      required: ["value"],
                      additionalProperties: false,
                      properties: {
                        label: {
                          type: "string",
                          description: nls.localize("JsonSchema.input.pickString.optionLabel", "Label for the option.")
                        },
                        value: {
                          type: "string",
                          description: nls.localize("JsonSchema.input.pickString.optionValue", "Value for the option.")
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          {
            type: "object",
            required: ["id", "type", "command"],
            additionalProperties: false,
            properties: {
              id: {
                type: "string",
                description: idDescription
              },
              type: {
                type: "string",
                description: typeDescription,
                enum: ["command"],
                enumDescriptions: [
                  nls.localize("JsonSchema.input.type.command", "The 'command' type executes a command.")
                ]
              },
              command: {
                type: "string",
                description: nls.localize("JsonSchema.input.command.command", "The command to execute for this input variable.")
              },
              args: {
                oneOf: [
                  {
                    type: "object",
                    description: nls.localize("JsonSchema.input.command.args", "Optional arguments passed to the command.")
                  },
                  {
                    type: "array",
                    description: nls.localize("JsonSchema.input.command.args", "Optional arguments passed to the command.")
                  },
                  {
                    type: "string",
                    description: nls.localize("JsonSchema.input.command.args", "Optional arguments passed to the command.")
                  }
                ]
              }
            }
          }
        ]
      }
    }
  }
};
export {
  inputsSchema
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlclNjaGVtYS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcblxuY29uc3QgaWREZXNjcmlwdGlvbiA9IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5pbnB1dC5pZCcsIFwiVGhlIGlucHV0J3MgaWQgaXMgdXNlZCB0byBhc3NvY2lhdGUgYW4gaW5wdXQgd2l0aCBhIHZhcmlhYmxlIG9mIHRoZSBmb3JtICR7aW5wdXQ6aWR9LlwiKTtcbmNvbnN0IHR5cGVEZXNjcmlwdGlvbiA9IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5pbnB1dC50eXBlJywgXCJUaGUgdHlwZSBvZiB1c2VyIGlucHV0IHByb21wdCB0byB1c2UuXCIpO1xuY29uc3QgZGVzY3JpcHRpb25EZXNjcmlwdGlvbiA9IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5pbnB1dC5kZXNjcmlwdGlvbicsIFwiVGhlIGRlc2NyaXB0aW9uIGlzIHNob3duIHdoZW4gdGhlIHVzZXIgaXMgcHJvbXB0ZWQgZm9yIGlucHV0LlwiKTtcbmNvbnN0IGRlZmF1bHREZXNjcmlwdGlvbiA9IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5pbnB1dC5kZWZhdWx0JywgXCJUaGUgZGVmYXVsdCB2YWx1ZSBmb3IgdGhlIGlucHV0LlwiKTtcblxuXG5leHBvcnQgY29uc3QgaW5wdXRzU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0ZGVmaW5pdGlvbnM6IHtcblx0XHRpbnB1dHM6IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0cycsICdVc2VyIGlucHV0cy4gVXNlZCBmb3IgZGVmaW5pbmcgdXNlciBpbnB1dCBwcm9tcHRzLCBzdWNoIGFzIGZyZWUgc3RyaW5nIGlucHV0IG9yIGEgY2hvaWNlIGZyb20gc2V2ZXJhbCBvcHRpb25zLicpLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0b25lT2Y6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2lkJywgJ3R5cGUnLCAnZGVzY3JpcHRpb24nXSxcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogaWREZXNjcmlwdGlvblxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR0eXBlOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHR5cGVEZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbJ3Byb21wdFN0cmluZyddLFxuXHRcdFx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5pbnB1dC50eXBlLnByb21wdFN0cmluZycsIFwiVGhlICdwcm9tcHRTdHJpbmcnIHR5cGUgb3BlbnMgYW4gaW5wdXQgYm94IHRvIGFzayB0aGUgdXNlciBmb3IgaW5wdXQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZGVzY3JpcHRpb25EZXNjcmlwdGlvblxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGRlZmF1bHREZXNjcmlwdGlvblxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRwYXNzd29yZDoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0LnBhc3N3b3JkJywgXCJDb250cm9scyBpZiBhIHBhc3N3b3JkIGlucHV0IGlzIHNob3duLiBQYXNzd29yZCBpbnB1dCBoaWRlcyB0aGUgdHlwZWQgdGV4dC5cIiksXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2lkJywgJ3R5cGUnLCAnZGVzY3JpcHRpb24nLCAnb3B0aW9ucyddLFxuXHRcdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBpZERlc2NyaXB0aW9uXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHR5cGU6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogdHlwZURlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0XHRcdGVudW06IFsncGlja1N0cmluZyddLFxuXHRcdFx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5pbnB1dC50eXBlLnBpY2tTdHJpbmcnLCBcIlRoZSAncGlja1N0cmluZycgdHlwZSBzaG93cyBhIHNlbGVjdGlvbiBsaXN0LlwiKSxcblx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uRGVzY3JpcHRpb25cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBkZWZhdWx0RGVzY3JpcHRpb25cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5pbnB1dC5vcHRpb25zJywgXCJBbiBhcnJheSBvZiBzdHJpbmdzIHRoYXQgZGVmaW5lcyB0aGUgb3B0aW9ucyBmb3IgYSBxdWljayBwaWNrLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0b25lT2Y6IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRyZXF1aXJlZDogWyd2YWx1ZSddLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5pbnB1dC5waWNrU3RyaW5nLm9wdGlvbkxhYmVsJywgXCJMYWJlbCBmb3IgdGhlIG9wdGlvbi5cIilcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5pbnB1dC5waWNrU3RyaW5nLm9wdGlvblZhbHVlJywgXCJWYWx1ZSBmb3IgdGhlIG9wdGlvbi5cIilcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnaWQnLCAndHlwZScsICdjb21tYW5kJ10sXG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGlkRGVzY3JpcHRpb25cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0dHlwZToge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0eXBlRGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogWydjb21tYW5kJ10sXG5cdFx0XHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0LnR5cGUuY29tbWFuZCcsIFwiVGhlICdjb21tYW5kJyB0eXBlIGV4ZWN1dGVzIGEgY29tbWFuZC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5pbnB1dC5jb21tYW5kLmNvbW1hbmQnLCBcIlRoZSBjb21tYW5kIHRvIGV4ZWN1dGUgZm9yIHRoaXMgaW5wdXQgdmFyaWFibGUuXCIpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGFyZ3M6IHtcblx0XHRcdFx0XHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5pbnB1dC5jb21tYW5kLmFyZ3MnLCBcIk9wdGlvbmFsIGFyZ3VtZW50cyBwYXNzZWQgdG8gdGhlIGNvbW1hbmQuXCIpXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0LmNvbW1hbmQuYXJncycsIFwiT3B0aW9uYWwgYXJndW1lbnRzIHBhc3NlZCB0byB0aGUgY29tbWFuZC5cIilcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0LmNvbW1hbmQuYXJncycsIFwiT3B0aW9uYWwgYXJndW1lbnRzIHBhc3NlZCB0byB0aGUgY29tbWFuZC5cIilcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn07XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZ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
