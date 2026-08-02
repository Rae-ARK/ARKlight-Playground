import { localize } from "../../../../nls.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
const titleTranslated = localize("title", "Title");
const walkthroughsExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "walkthroughs",
  jsonSchema: {
    description: localize("walkthroughs", "Contribute walkthroughs to help users getting started with your extension."),
    type: "array",
    items: {
      type: "object",
      required: ["id", "title", "description", "steps"],
      defaultSnippets: [{ body: { "id": "$1", "title": "$2", "description": "$3", "steps": [] } }],
      properties: {
        id: {
          type: "string",
          description: localize("walkthroughs.id", "Unique identifier for this walkthrough.")
        },
        title: {
          type: "string",
          description: localize("walkthroughs.title", "Title of walkthrough.")
        },
        icon: {
          type: "string",
          description: localize("walkthroughs.icon", "Relative path to the icon of the walkthrough. The path is relative to the extension location. If not specified, the icon defaults to the extension icon if available.")
        },
        description: {
          type: "string",
          description: localize("walkthroughs.description", "Description of walkthrough.")
        },
        featuredFor: {
          type: "array",
          description: localize("walkthroughs.featuredFor", "Walkthroughs that match one of these glob patterns appear as 'featured' in workspaces with the specified files. For example, a walkthrough for TypeScript projects might specify `tsconfig.json` here."),
          items: {
            type: "string"
          }
        },
        when: {
          type: "string",
          description: localize("walkthroughs.when", "Context key expression to control the visibility of this walkthrough.")
        },
        steps: {
          type: "array",
          description: localize("walkthroughs.steps", "Steps to complete as part of this walkthrough."),
          items: {
            type: "object",
            required: ["id", "title", "media"],
            defaultSnippets: [{
              body: {
                "id": "$1",
                "title": "$2",
                "description": "$3",
                "completionEvents": ["$5"],
                "media": {}
              }
            }],
            properties: {
              id: {
                type: "string",
                description: localize("walkthroughs.steps.id", "Unique identifier for this step. This is used to keep track of which steps have been completed.")
              },
              title: {
                type: "string",
                description: localize("walkthroughs.steps.title", "Title of step.")
              },
              description: {
                type: "string",
                description: localize("walkthroughs.steps.description.interpolated", "Description of step. Supports ``preformatted``, __italic__, and **bold** text. Use markdown-style links for commands or external links: {0}, {1}, or {2}. Links on their own line will be rendered as buttons.", `[${titleTranslated}](command:myext.command)`, `[${titleTranslated}](command:toSide:myext.command)`, `[${titleTranslated}](https://aka.ms)`)
              },
              button: {
                deprecationMessage: localize("walkthroughs.steps.button.deprecated.interpolated", "Deprecated. Use markdown links in the description instead, i.e. {0}, {1}, or {2}", `[${titleTranslated}](command:myext.command)`, `[${titleTranslated}](command:toSide:myext.command)`, `[${titleTranslated}](https://aka.ms)`)
              },
              media: {
                type: "object",
                description: localize("walkthroughs.steps.media", "Media to show alongside this step, either an image or markdown content."),
                oneOf: [
                  {
                    required: ["image", "altText"],
                    additionalProperties: false,
                    properties: {
                      path: {
                        deprecationMessage: localize("pathDeprecated", "Deprecated. Please use `image` or `markdown` instead")
                      },
                      image: {
                        description: localize("walkthroughs.steps.media.image.path.string", "Path to an image - or object consisting of paths to light, dark, and hc images - relative to extension directory. Depending on context, the image will be displayed from 400px to 800px wide, with similar bounds on height. To support HIDPI displays, the image will be rendered at 1.5x scaling, for example a 900 physical pixels wide image will be displayed as 600 logical pixels wide."),
                        oneOf: [
                          {
                            type: "string"
                          },
                          {
                            type: "object",
                            required: ["dark", "light", "hc", "hcLight"],
                            properties: {
                              dark: {
                                description: localize("walkthroughs.steps.media.image.path.dark.string", "Path to the image for dark themes, relative to extension directory."),
                                type: "string"
                              },
                              light: {
                                description: localize("walkthroughs.steps.media.image.path.light.string", "Path to the image for light themes, relative to extension directory."),
                                type: "string"
                              },
                              hc: {
                                description: localize("walkthroughs.steps.media.image.path.hc.string", "Path to the image for hc themes, relative to extension directory."),
                                type: "string"
                              },
                              hcLight: {
                                description: localize("walkthroughs.steps.media.image.path.hcLight.string", "Path to the image for hc light themes, relative to extension directory."),
                                type: "string"
                              }
                            }
                          }
                        ]
                      },
                      altText: {
                        type: "string",
                        description: localize("walkthroughs.steps.media.altText", "Alternate text to display when the image cannot be loaded or in screen readers.")
                      }
                    }
                  },
                  {
                    required: ["svg", "altText"],
                    additionalProperties: false,
                    properties: {
                      svg: {
                        description: localize("walkthroughs.steps.media.image.path.svg", "Path to an svg, color tokens are supported in variables to support theming to match the workbench."),
                        type: "string"
                      },
                      altText: {
                        type: "string",
                        description: localize("walkthroughs.steps.media.altText", "Alternate text to display when the image cannot be loaded or in screen readers.")
                      }
                    }
                  },
                  {
                    required: ["markdown"],
                    additionalProperties: false,
                    properties: {
                      path: {
                        deprecationMessage: localize("pathDeprecated", "Deprecated. Please use `image` or `markdown` instead")
                      },
                      markdown: {
                        description: localize("walkthroughs.steps.media.markdown.path", "Path to the markdown document, relative to extension directory."),
                        type: "string"
                      }
                    }
                  }
                ]
              },
              completionEvents: {
                description: localize("walkthroughs.steps.completionEvents", "Events that should trigger this step to become checked off. If empty or not defined, the step will check off when any of the step's buttons or links are clicked; if the step has no buttons or links it will check on when it is selected."),
                type: "array",
                items: {
                  type: "string",
                  defaultSnippets: [
                    {
                      label: "onCommand",
                      description: localize("walkthroughs.steps.completionEvents.onCommand", "Check off step when a given command is executed anywhere in VS Code."),
                      body: "onCommand:${1:commandId}"
                    },
                    {
                      label: "onLink",
                      description: localize("walkthroughs.steps.completionEvents.onLink", "Check off step when a given link is opened via a walkthrough step."),
                      body: "onLink:${2:linkId}"
                    },
                    {
                      label: "onView",
                      description: localize("walkthroughs.steps.completionEvents.onView", "Check off step when a given view is opened"),
                      body: "onView:${2:viewId}"
                    },
                    {
                      label: "onSettingChanged",
                      description: localize("walkthroughs.steps.completionEvents.onSettingChanged", "Check off step when a given setting is changed"),
                      body: "onSettingChanged:${2:settingName}"
                    },
                    {
                      label: "onContext",
                      description: localize("walkthroughs.steps.completionEvents.onContext", "Check off step when a context key expression is true."),
                      body: "onContext:${2:key}"
                    },
                    {
                      label: "onExtensionInstalled",
                      description: localize("walkthroughs.steps.completionEvents.extensionInstalled", "Check off step when an extension with the given id is installed. If the extension is already installed, the step will start off checked."),
                      body: "onExtensionInstalled:${3:extensionId}"
                    },
                    {
                      label: "onStepSelected",
                      description: localize("walkthroughs.steps.completionEvents.stepSelected", "Check off step as soon as it is selected."),
                      body: "onStepSelected"
                    }
                  ]
                }
              },
              doneOn: {
                description: localize("walkthroughs.steps.doneOn", "Signal to mark step as complete."),
                deprecationMessage: localize("walkthroughs.steps.doneOn.deprecation", "doneOn is deprecated. By default steps will be checked off when their buttons are clicked, to configure further use completionEvents"),
                type: "object",
                required: ["command"],
                defaultSnippets: [{ "body": { command: "$1" } }],
                properties: {
                  "command": {
                    description: localize("walkthroughs.steps.oneOn.command", "Mark step done when the specified command is executed."),
                    type: "string"
                  }
                }
              },
              when: {
                type: "string",
                description: localize("walkthroughs.steps.when", "Context key expression to control the visibility of this step.")
              }
            }
          }
        }
      }
    }
  },
  activationEventsGenerator: function* (walkthroughContributions) {
    for (const walkthroughContribution of walkthroughContributions) {
      if (walkthroughContribution.id) {
        yield `onWalkthrough:${walkthroughContribution.id}`;
      }
    }
  }
});
export {
  walkthroughsExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9icm93c2VyL2dldHRpbmdTdGFydGVkRXh0ZW5zaW9uUG9pbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJV2Fsa3Rocm91Z2ggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5cbmNvbnN0IHRpdGxlVHJhbnNsYXRlZCA9IGxvY2FsaXplKCd0aXRsZScsIFwiVGl0bGVcIik7XG5cbmV4cG9ydCBjb25zdCB3YWxrdGhyb3VnaHNFeHRlbnNpb25Qb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElXYWxrdGhyb3VnaFtdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnd2Fsa3Rocm91Z2hzJyxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzJywgXCJDb250cmlidXRlIHdhbGt0aHJvdWdocyB0byBoZWxwIHVzZXJzIGdldHRpbmcgc3RhcnRlZCB3aXRoIHlvdXIgZXh0ZW5zaW9uLlwiKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHJlcXVpcmVkOiBbJ2lkJywgJ3RpdGxlJywgJ2Rlc2NyaXB0aW9uJywgJ3N0ZXBzJ10sXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgJ2lkJzogJyQxJywgJ3RpdGxlJzogJyQyJywgJ2Rlc2NyaXB0aW9uJzogJyQzJywgJ3N0ZXBzJzogW10gfSB9XSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5pZCcsIFwiVW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoaXMgd2Fsa3Rocm91Z2guXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0aXRsZToge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnRpdGxlJywgXCJUaXRsZSBvZiB3YWxrdGhyb3VnaC5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0aWNvbjoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLmljb24nLCBcIlJlbGF0aXZlIHBhdGggdG8gdGhlIGljb24gb2YgdGhlIHdhbGt0aHJvdWdoLiBUaGUgcGF0aCBpcyByZWxhdGl2ZSB0byB0aGUgZXh0ZW5zaW9uIGxvY2F0aW9uLiBJZiBub3Qgc3BlY2lmaWVkLCB0aGUgaWNvbiBkZWZhdWx0cyB0byB0aGUgZXh0ZW5zaW9uIGljb24gaWYgYXZhaWxhYmxlLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5kZXNjcmlwdGlvbicsIFwiRGVzY3JpcHRpb24gb2Ygd2Fsa3Rocm91Z2guXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZlYXR1cmVkRm9yOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5mZWF0dXJlZEZvcicsIFwiV2Fsa3Rocm91Z2hzIHRoYXQgbWF0Y2ggb25lIG9mIHRoZXNlIGdsb2IgcGF0dGVybnMgYXBwZWFyIGFzICdmZWF0dXJlZCcgaW4gd29ya3NwYWNlcyB3aXRoIHRoZSBzcGVjaWZpZWQgZmlsZXMuIEZvciBleGFtcGxlLCBhIHdhbGt0aHJvdWdoIGZvciBUeXBlU2NyaXB0IHByb2plY3RzIG1pZ2h0IHNwZWNpZnkgYHRzY29uZmlnLmpzb25gIGhlcmUuXCIpLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdoZW46IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy53aGVuJywgXCJDb250ZXh0IGtleSBleHByZXNzaW9uIHRvIGNvbnRyb2wgdGhlIHZpc2liaWxpdHkgb2YgdGhpcyB3YWxrdGhyb3VnaC5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0c3RlcHM6IHtcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzJywgXCJTdGVwcyB0byBjb21wbGV0ZSBhcyBwYXJ0IG9mIHRoaXMgd2Fsa3Rocm91Z2guXCIpLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2lkJywgJ3RpdGxlJywgJ21lZGlhJ10sXG5cdFx0XHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7XG5cdFx0XHRcdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRcdFx0XHQnaWQnOiAnJDEnLCAndGl0bGUnOiAnJDInLCAnZGVzY3JpcHRpb24nOiAnJDMnLFxuXHRcdFx0XHRcdFx0XHRcdCdjb21wbGV0aW9uRXZlbnRzJzogWyckNSddLFxuXHRcdFx0XHRcdFx0XHRcdCdtZWRpYSc6IHt9LFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5pZCcsIFwiVW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoaXMgc3RlcC4gVGhpcyBpcyB1c2VkIHRvIGtlZXAgdHJhY2sgb2Ygd2hpY2ggc3RlcHMgaGF2ZSBiZWVuIGNvbXBsZXRlZC5cIiksXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMudGl0bGUnLCBcIlRpdGxlIG9mIHN0ZXAuXCIpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJEZXNjcmlwdGlvbiBvZiBzdGVwLiBTdXBwb3J0cyBgYHByZWZvcm1hdHRlZGBgLCBfX2l0YWxpY19fLCBhbmQgKipib2xkKiogdGV4dC4gVXNlIG1hcmtkb3duLXN0eWxlIGxpbmtzIGZvciBjb21tYW5kcyBvciBleHRlcm5hbCBsaW5rczogezB9LCB7MX0sIG9yIHsyfS4gTGlua3Mgb24gdGhlaXIgb3duIGxpbmUgd2lsbCBiZSByZW5kZXJlZCBhcyBidXR0b25zLlwiLCBgWyR7dGl0bGVUcmFuc2xhdGVkfV0oY29tbWFuZDpteWV4dC5jb21tYW5kKWAsIGBbJHt0aXRsZVRyYW5zbGF0ZWR9XShjb21tYW5kOnRvU2lkZTpteWV4dC5jb21tYW5kKWAsIGBbJHt0aXRsZVRyYW5zbGF0ZWR9XShodHRwczovL2FrYS5tcylgKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRidXR0b246IHtcblx0XHRcdFx0XHRcdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMuYnV0dG9uLmRlcHJlY2F0ZWQuaW50ZXJwb2xhdGVkJywgXCJEZXByZWNhdGVkLiBVc2UgbWFya2Rvd24gbGlua3MgaW4gdGhlIGRlc2NyaXB0aW9uIGluc3RlYWQsIGkuZS4gezB9LCB7MX0sIG9yIHsyfVwiLCBgWyR7dGl0bGVUcmFuc2xhdGVkfV0oY29tbWFuZDpteWV4dC5jb21tYW5kKWAsIGBbJHt0aXRsZVRyYW5zbGF0ZWR9XShjb21tYW5kOnRvU2lkZTpteWV4dC5jb21tYW5kKWAsIGBbJHt0aXRsZVRyYW5zbGF0ZWR9XShodHRwczovL2FrYS5tcylgKSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5tZWRpYScsIFwiTWVkaWEgdG8gc2hvdyBhbG9uZ3NpZGUgdGhpcyBzdGVwLCBlaXRoZXIgYW4gaW1hZ2Ugb3IgbWFya2Rvd24gY29udGVudC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0b25lT2Y6IFtcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnaW1hZ2UnLCAnYWx0VGV4dCddLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdwYXRoRGVwcmVjYXRlZCcsIFwiRGVwcmVjYXRlZC4gUGxlYXNlIHVzZSBgaW1hZ2VgIG9yIGBtYXJrZG93bmAgaW5zdGVhZFwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0aW1hZ2U6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLm1lZGlhLmltYWdlLnBhdGguc3RyaW5nJywgXCJQYXRoIHRvIGFuIGltYWdlIC0gb3Igb2JqZWN0IGNvbnNpc3Rpbmcgb2YgcGF0aHMgdG8gbGlnaHQsIGRhcmssIGFuZCBoYyBpbWFnZXMgLSByZWxhdGl2ZSB0byBleHRlbnNpb24gZGlyZWN0b3J5LiBEZXBlbmRpbmcgb24gY29udGV4dCwgdGhlIGltYWdlIHdpbGwgYmUgZGlzcGxheWVkIGZyb20gNDAwcHggdG8gODAwcHggd2lkZSwgd2l0aCBzaW1pbGFyIGJvdW5kcyBvbiBoZWlnaHQuIFRvIHN1cHBvcnQgSElEUEkgZGlzcGxheXMsIHRoZSBpbWFnZSB3aWxsIGJlIHJlbmRlcmVkIGF0IDEuNXggc2NhbGluZywgZm9yIGV4YW1wbGUgYSA5MDAgcGh5c2ljYWwgcGl4ZWxzIHdpZGUgaW1hZ2Ugd2lsbCBiZSBkaXNwbGF5ZWQgYXMgNjAwIGxvZ2ljYWwgcGl4ZWxzIHdpZGUuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0b25lT2Y6IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnZGFyaycsICdsaWdodCcsICdoYycsICdoY0xpZ2h0J10sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGFyazoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5tZWRpYS5pbWFnZS5wYXRoLmRhcmsuc3RyaW5nJywgXCJQYXRoIHRvIHRoZSBpbWFnZSBmb3IgZGFyayB0aGVtZXMsIHJlbGF0aXZlIHRvIGV4dGVuc2lvbiBkaXJlY3RvcnkuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRsaWdodDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5tZWRpYS5pbWFnZS5wYXRoLmxpZ2h0LnN0cmluZycsIFwiUGF0aCB0byB0aGUgaW1hZ2UgZm9yIGxpZ2h0IHRoZW1lcywgcmVsYXRpdmUgdG8gZXh0ZW5zaW9uIGRpcmVjdG9yeS5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGhjOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLm1lZGlhLmltYWdlLnBhdGguaGMuc3RyaW5nJywgXCJQYXRoIHRvIHRoZSBpbWFnZSBmb3IgaGMgdGhlbWVzLCByZWxhdGl2ZSB0byBleHRlbnNpb24gZGlyZWN0b3J5LlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0aGNMaWdodDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5tZWRpYS5pbWFnZS5wYXRoLmhjTGlnaHQuc3RyaW5nJywgXCJQYXRoIHRvIHRoZSBpbWFnZSBmb3IgaGMgbGlnaHQgdGhlbWVzLCByZWxhdGl2ZSB0byBleHRlbnNpb24gZGlyZWN0b3J5LlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhbHRUZXh0OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLm1lZGlhLmFsdFRleHQnLCBcIkFsdGVybmF0ZSB0ZXh0IHRvIGRpc3BsYXkgd2hlbiB0aGUgaW1hZ2UgY2Fubm90IGJlIGxvYWRlZCBvciBpbiBzY3JlZW4gcmVhZGVycy5cIilcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ3N2ZycsICdhbHRUZXh0J10sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHN2Zzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMubWVkaWEuaW1hZ2UucGF0aC5zdmcnLCBcIlBhdGggdG8gYW4gc3ZnLCBjb2xvciB0b2tlbnMgYXJlIHN1cHBvcnRlZCBpbiB2YXJpYWJsZXMgdG8gc3VwcG9ydCB0aGVtaW5nIHRvIG1hdGNoIHRoZSB3b3JrYmVuY2guXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhbHRUZXh0OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLm1lZGlhLmFsdFRleHQnLCBcIkFsdGVybmF0ZSB0ZXh0IHRvIGRpc3BsYXkgd2hlbiB0aGUgaW1hZ2UgY2Fubm90IGJlIGxvYWRlZCBvciBpbiBzY3JlZW4gcmVhZGVycy5cIilcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyZXF1aXJlZDogWydtYXJrZG93biddLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdwYXRoRGVwcmVjYXRlZCcsIFwiRGVwcmVjYXRlZC4gUGxlYXNlIHVzZSBgaW1hZ2VgIG9yIGBtYXJrZG93bmAgaW5zdGVhZFwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0bWFya2Rvd246IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLm1lZGlhLm1hcmtkb3duLnBhdGgnLCBcIlBhdGggdG8gdGhlIG1hcmtkb3duIGRvY3VtZW50LCByZWxhdGl2ZSB0byBleHRlbnNpb24gZGlyZWN0b3J5LlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0Y29tcGxldGlvbkV2ZW50czoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLmNvbXBsZXRpb25FdmVudHMnLCBcIkV2ZW50cyB0aGF0IHNob3VsZCB0cmlnZ2VyIHRoaXMgc3RlcCB0byBiZWNvbWUgY2hlY2tlZCBvZmYuIElmIGVtcHR5IG9yIG5vdCBkZWZpbmVkLCB0aGUgc3RlcCB3aWxsIGNoZWNrIG9mZiB3aGVuIGFueSBvZiB0aGUgc3RlcCdzIGJ1dHRvbnMgb3IgbGlua3MgYXJlIGNsaWNrZWQ7IGlmIHRoZSBzdGVwIGhhcyBubyBidXR0b25zIG9yIGxpbmtzIGl0IHdpbGwgY2hlY2sgb24gd2hlbiBpdCBpcyBzZWxlY3RlZC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsOiAnb25Db21tYW5kJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5jb21wbGV0aW9uRXZlbnRzLm9uQ29tbWFuZCcsICdDaGVjayBvZmYgc3RlcCB3aGVuIGEgZ2l2ZW4gY29tbWFuZCBpcyBleGVjdXRlZCBhbnl3aGVyZSBpbiBWUyBDb2RlLicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGJvZHk6ICdvbkNvbW1hbmQ6JHsxOmNvbW1hbmRJZH0nXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogJ29uTGluaycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMuY29tcGxldGlvbkV2ZW50cy5vbkxpbmsnLCAnQ2hlY2sgb2ZmIHN0ZXAgd2hlbiBhIGdpdmVuIGxpbmsgaXMgb3BlbmVkIHZpYSBhIHdhbGt0aHJvdWdoIHN0ZXAuJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ym9keTogJ29uTGluazokezI6bGlua0lkfSdcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsOiAnb25WaWV3Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5jb21wbGV0aW9uRXZlbnRzLm9uVmlldycsICdDaGVjayBvZmYgc3RlcCB3aGVuIGEgZ2l2ZW4gdmlldyBpcyBvcGVuZWQnKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRib2R5OiAnb25WaWV3OiR7Mjp2aWV3SWR9J1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0bGFiZWw6ICdvblNldHRpbmdDaGFuZ2VkJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5jb21wbGV0aW9uRXZlbnRzLm9uU2V0dGluZ0NoYW5nZWQnLCAnQ2hlY2sgb2ZmIHN0ZXAgd2hlbiBhIGdpdmVuIHNldHRpbmcgaXMgY2hhbmdlZCcpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGJvZHk6ICdvblNldHRpbmdDaGFuZ2VkOiR7MjpzZXR0aW5nTmFtZX0nXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogJ29uQ29udGV4dCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMuY29tcGxldGlvbkV2ZW50cy5vbkNvbnRleHQnLCAnQ2hlY2sgb2ZmIHN0ZXAgd2hlbiBhIGNvbnRleHQga2V5IGV4cHJlc3Npb24gaXMgdHJ1ZS4nKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRib2R5OiAnb25Db250ZXh0OiR7MjprZXl9J1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0bGFiZWw6ICdvbkV4dGVuc2lvbkluc3RhbGxlZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMuY29tcGxldGlvbkV2ZW50cy5leHRlbnNpb25JbnN0YWxsZWQnLCAnQ2hlY2sgb2ZmIHN0ZXAgd2hlbiBhbiBleHRlbnNpb24gd2l0aCB0aGUgZ2l2ZW4gaWQgaXMgaW5zdGFsbGVkLiBJZiB0aGUgZXh0ZW5zaW9uIGlzIGFscmVhZHkgaW5zdGFsbGVkLCB0aGUgc3RlcCB3aWxsIHN0YXJ0IG9mZiBjaGVja2VkLicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGJvZHk6ICdvbkV4dGVuc2lvbkluc3RhbGxlZDokezM6ZXh0ZW5zaW9uSWR9J1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0bGFiZWw6ICdvblN0ZXBTZWxlY3RlZCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3YWxrdGhyb3VnaHMuc3RlcHMuY29tcGxldGlvbkV2ZW50cy5zdGVwU2VsZWN0ZWQnLCAnQ2hlY2sgb2ZmIHN0ZXAgYXMgc29vbiBhcyBpdCBpcyBzZWxlY3RlZC4nKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRib2R5OiAnb25TdGVwU2VsZWN0ZWQnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRkb25lT246IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5kb25lT24nLCBcIlNpZ25hbCB0byBtYXJrIHN0ZXAgYXMgY29tcGxldGUuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5kb25lT24uZGVwcmVjYXRpb24nLCBcImRvbmVPbiBpcyBkZXByZWNhdGVkLiBCeSBkZWZhdWx0IHN0ZXBzIHdpbGwgYmUgY2hlY2tlZCBvZmYgd2hlbiB0aGVpciBidXR0b25zIGFyZSBjbGlja2VkLCB0byBjb25maWd1cmUgZnVydGhlciB1c2UgY29tcGxldGlvbkV2ZW50c1wiKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRyZXF1aXJlZDogWydjb21tYW5kJ10sXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyAnYm9keSc6IHsgY29tbWFuZDogJyQxJyB9IH1dLFxuXHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdCdjb21tYW5kJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dhbGt0aHJvdWdocy5zdGVwcy5vbmVPbi5jb21tYW5kJywgXCJNYXJrIHN0ZXAgZG9uZSB3aGVuIHRoZSBzcGVjaWZpZWQgY29tbWFuZCBpcyBleGVjdXRlZC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0d2hlbjoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2Fsa3Rocm91Z2hzLnN0ZXBzLndoZW4nLCBcIkNvbnRleHQga2V5IGV4cHJlc3Npb24gdG8gY29udHJvbCB0aGUgdmlzaWJpbGl0eSBvZiB0aGlzIHN0ZXAuXCIpXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0sXG5cdGFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3I6IGZ1bmN0aW9uKiAod2Fsa3Rocm91Z2hDb250cmlidXRpb25zKSB7XG5cdFx0Zm9yIChjb25zdCB3YWxrdGhyb3VnaENvbnRyaWJ1dGlvbiBvZiB3YWxrdGhyb3VnaENvbnRyaWJ1dGlvbnMpIHtcblx0XHRcdGlmICh3YWxrdGhyb3VnaENvbnRyaWJ1dGlvbi5pZCkge1xuXHRcdFx0XHR5aWVsZCBgb25XYWxrdGhyb3VnaDoke3dhbGt0aHJvdWdoQ29udHJpYnV0aW9uLmlkfWA7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsMEJBQTBCO0FBRW5DLE1BQU0sa0JBQWtCLFNBQVMsU0FBUyxPQUFPO0FBRTFDLE1BQU0sNkJBQTZCLG1CQUFtQix1QkFBdUM7QUFBQSxFQUNuRyxnQkFBZ0I7QUFBQSxFQUNoQixZQUFZO0FBQUEsSUFDWCxhQUFhLFNBQVMsZ0JBQWdCLDRFQUE0RTtBQUFBLElBQ2xILE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLFVBQVUsQ0FBQyxNQUFNLFNBQVMsZUFBZSxPQUFPO0FBQUEsTUFDaEQsaUJBQWlCLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxNQUFNLFNBQVMsTUFBTSxlQUFlLE1BQU0sU0FBUyxDQUFDLEVBQUUsRUFBRSxDQUFDO0FBQUEsTUFDM0YsWUFBWTtBQUFBLFFBQ1gsSUFBSTtBQUFBLFVBQ0gsTUFBTTtBQUFBLFVBQ04sYUFBYSxTQUFTLG1CQUFt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
