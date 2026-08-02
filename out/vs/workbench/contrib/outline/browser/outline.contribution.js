import { localize, localize2 } from "../../../../nls.js";
import { Extensions as ViewExtensions } from "../../../common/views.js";
import { OutlinePane } from "./outlinePane.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { VIEW_CONTAINER } from "../../files/browser/explorerViewlet.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { OutlineConfigKeys } from "../../../services/outline/browser/outline.js";
import { IOutlinePane } from "./outline.js";
import "./outlineActions.js";
const outlineViewIcon = registerIcon("outline-view-icon", Codicon.symbolClass, localize("outlineViewIcon", "View icon of the outline view."));
Registry.as(ViewExtensions.ViewsRegistry).registerViews([{
  id: IOutlinePane.Id,
  name: localize2("name", "Outline"),
  containerIcon: outlineViewIcon,
  ctorDescriptor: new SyncDescriptor(OutlinePane),
  canToggleVisibility: true,
  canMoveView: true,
  hideByDefault: false,
  collapsed: true,
  order: 2,
  weight: 30,
  focusCommand: { id: "outline.focus" }
}], VIEW_CONTAINER);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  "id": "outline",
  "order": 117,
  "title": localize("outlineConfigurationTitle", "Outline"),
  "type": "object",
  "properties": {
    [OutlineConfigKeys.icons]: {
      "description": localize("outline.showIcons", "Render Outline elements with icons."),
      "type": "boolean",
      "default": true
    },
    [OutlineConfigKeys.collapseItems]: {
      "description": localize("outline.initialState", "Controls whether Outline items are collapsed or expanded."),
      "type": "string",
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      "enum": [
        "alwaysCollapse",
        "alwaysExpand"
      ],
      "enumDescriptions": [
        localize("outline.initialState.collapsed", "Collapse all items."),
        localize("outline.initialState.expanded", "Expand all items.")
      ],
      "default": "alwaysExpand"
    },
    [OutlineConfigKeys.problemsEnabled]: {
      "markdownDescription": localize("outline.showProblem", "Show errors and warnings on Outline elements. Overwritten by {0} when it is off.", "`#problems.visibility#`"),
      "type": "boolean",
      "default": true
    },
    [OutlineConfigKeys.problemsColors]: {
      "markdownDescription": localize("outline.problem.colors", "Use colors for errors and warnings on Outline elements. Overwritten by {0} when it is off.", "`#problems.visibility#`"),
      "type": "boolean",
      "default": true
    },
    [OutlineConfigKeys.problemsBadges]: {
      "markdownDescription": localize("outline.problems.badges", "Use badges for errors and warnings on Outline elements. Overwritten by {0} when it is off.", "`#problems.visibility#`"),
      "type": "boolean",
      "default": true
    },
    "outline.showFiles": {
      type: "boolean",
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      default: true,
      markdownDescription: localize("filteredTypes.file", "When enabled, Outline shows `file`-symbols.")
    },
    "outline.showModules": {
      type: "boolean",
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      default: true,
      markdownDescription: localize("filteredTypes.module", "When enabled, Outline shows `module`-symbols.")
    },
    "outline.showNamespaces": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.namespace", "When enabled, Outline shows `namespace`-symbols.")
    },
    "outline.showPackages": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.package", "When enabled, Outline shows `package`-symbols.")
    },
    "outline.showClasses": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.class", "When enabled, Outline shows `class`-symbols.")
    },
    "outline.showMethods": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.method", "When enabled, Outline shows `method`-symbols.")
    },
    "outline.showProperties": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.property", "When enabled, Outline shows `property`-symbols.")
    },
    "outline.showFields": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.field", "When enabled, Outline shows `field`-symbols.")
    },
    "outline.showConstructors": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.constructor", "When enabled, Outline shows `constructor`-symbols.")
    },
    "outline.showEnums": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.enum", "When enabled, Outline shows `enum`-symbols.")
    },
    "outline.showInterfaces": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.interface", "When enabled, Outline shows `interface`-symbols.")
    },
    "outline.showFunctions": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.function", "When enabled, Outline shows `function`-symbols.")
    },
    "outline.showVariables": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.variable", "When enabled, Outline shows `variable`-symbols.")
    },
    "outline.showConstants": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.constant", "When enabled, Outline shows `constant`-symbols.")
    },
    "outline.showStrings": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.string", "When enabled, Outline shows `string`-symbols.")
    },
    "outline.showNumbers": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.number", "When enabled, Outline shows `number`-symbols.")
    },
    "outline.showBooleans": {
      type: "boolean",
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      default: true,
      markdownDescription: localize("filteredTypes.boolean", "When enabled, Outline shows `boolean`-symbols.")
    },
    "outline.showArrays": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.array", "When enabled, Outline shows `array`-symbols.")
    },
    "outline.showObjects": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.object", "When enabled, Outline shows `object`-symbols.")
    },
    "outline.showKeys": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.key", "When enabled, Outline shows `key`-symbols.")
    },
    "outline.showNull": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.null", "When enabled, Outline shows `null`-symbols.")
    },
    "outline.showEnumMembers": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.enumMember", "When enabled, Outline shows `enumMember`-symbols.")
    },
    "outline.showStructs": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.struct", "When enabled, Outline shows `struct`-symbols.")
    },
    "outline.showEvents": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.event", "When enabled, Outline shows `event`-symbols.")
    },
    "outline.showOperators": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.operator", "When enabled, Outline shows `operator`-symbols.")
    },
    "outline.showTypeParameters": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.typeParameter", "When enabled, Outline shows `typeParameter`-symbols.")
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL291dGxpbmUvYnJvd3Nlci9vdXRsaW5lLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVZpZXdzUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgVmlld0V4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgT3V0bGluZVBhbmUgfSBmcm9tICcuL291dGxpbmVQYW5lLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIENvbmZpZ3VyYXRpb25TY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBWSUVXX0NPTlRBSU5FUiB9IGZyb20gJy4uLy4uL2ZpbGVzL2Jyb3dzZXIvZXhwbG9yZXJWaWV3bGV0LmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgT3V0bGluZUNvbmZpZ0tleXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9vdXRsaW5lL2Jyb3dzZXIvb3V0bGluZS5qcyc7XG5pbXBvcnQgeyBJT3V0bGluZVBhbmUgfSBmcm9tICcuL291dGxpbmUuanMnO1xuXG4vLyAtLS0gYWN0aW9uc1xuXG5pbXBvcnQgJy4vb3V0bGluZUFjdGlvbnMuanMnO1xuXG4vLyAtLS0gdmlld1xuXG5jb25zdCBvdXRsaW5lVmlld0ljb24gPSByZWdpc3Rlckljb24oJ291dGxpbmUtdmlldy1pY29uJywgQ29kaWNvbi5zeW1ib2xDbGFzcywgbG9jYWxpemUoJ291dGxpbmVWaWV3SWNvbicsICdWaWV3IGljb24gb2YgdGhlIG91dGxpbmUgdmlldy4nKSk7XG5cblJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihWaWV3RXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KS5yZWdpc3RlclZpZXdzKFt7XG5cdGlkOiBJT3V0bGluZVBhbmUuSWQsXG5cdG5hbWU6IGxvY2FsaXplMignbmFtZScsIFwiT3V0bGluZVwiKSxcblx0Y29udGFpbmVySWNvbjogb3V0bGluZVZpZXdJY29uLFxuXHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKE91dGxpbmVQYW5lKSxcblx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZSxcblx0Y2FuTW92ZVZpZXc6IHRydWUsXG5cdGhpZGVCeURlZmF1bHQ6IGZhbHNlLFxuXHRjb2xsYXBzZWQ6IHRydWUsXG5cdG9yZGVyOiAyLFxuXHR3ZWlnaHQ6IDMwLFxuXHRmb2N1c0NvbW1hbmQ6IHsgaWQ6ICdvdXRsaW5lLmZvY3VzJyB9XG59XSwgVklFV19DT05UQUlORVIpO1xuXG4vLyAtLS0gY29uZmlndXJhdGlvbnNcblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0J2lkJzogJ291dGxpbmUnLFxuXHQnb3JkZXInOiAxMTcsXG5cdCd0aXRsZSc6IGxvY2FsaXplKCdvdXRsaW5lQ29uZmlndXJhdGlvblRpdGxlJywgXCJPdXRsaW5lXCIpLFxuXHQndHlwZSc6ICdvYmplY3QnLFxuXHQncHJvcGVydGllcyc6IHtcblx0XHRbT3V0bGluZUNvbmZpZ0tleXMuaWNvbnNdOiB7XG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnb3V0bGluZS5zaG93SWNvbnMnLCBcIlJlbmRlciBPdXRsaW5lIGVsZW1lbnRzIHdpdGggaWNvbnMuXCIpLFxuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVmYXVsdCc6IHRydWVcblx0XHR9LFxuXHRcdFtPdXRsaW5lQ29uZmlnS2V5cy5jb2xsYXBzZUl0ZW1zXToge1xuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ291dGxpbmUuaW5pdGlhbFN0YXRlJywgXCJDb250cm9scyB3aGV0aGVyIE91dGxpbmUgaXRlbXMgYXJlIGNvbGxhcHNlZCBvciBleHBhbmRlZC5cIiksXG5cdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdCdlbnVtJzogW1xuXHRcdFx0XHQnYWx3YXlzQ29sbGFwc2UnLFxuXHRcdFx0XHQnYWx3YXlzRXhwYW5kJ1xuXHRcdFx0XSxcblx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnb3V0bGluZS5pbml0aWFsU3RhdGUuY29sbGFwc2VkJywgXCJDb2xsYXBzZSBhbGwgaXRlbXMuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnb3V0bGluZS5pbml0aWFsU3RhdGUuZXhwYW5kZWQnLCBcIkV4cGFuZCBhbGwgaXRlbXMuXCIpXG5cdFx0XHRdLFxuXHRcdFx0J2RlZmF1bHQnOiAnYWx3YXlzRXhwYW5kJ1xuXHRcdH0sXG5cdFx0W091dGxpbmVDb25maWdLZXlzLnByb2JsZW1zRW5hYmxlZF06IHtcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbG9jYWxpemUoJ291dGxpbmUuc2hvd1Byb2JsZW0nLCBcIlNob3cgZXJyb3JzIGFuZCB3YXJuaW5ncyBvbiBPdXRsaW5lIGVsZW1lbnRzLiBPdmVyd3JpdHRlbiBieSB7MH0gd2hlbiBpdCBpcyBvZmYuXCIsICdgI3Byb2JsZW1zLnZpc2liaWxpdHkjYCcpLFxuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVmYXVsdCc6IHRydWVcblx0XHR9LFxuXHRcdFtPdXRsaW5lQ29uZmlnS2V5cy5wcm9ibGVtc0NvbG9yc106IHtcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbG9jYWxpemUoJ291dGxpbmUucHJvYmxlbS5jb2xvcnMnLCBcIlVzZSBjb2xvcnMgZm9yIGVycm9ycyBhbmQgd2FybmluZ3Mgb24gT3V0bGluZSBlbGVtZW50cy4gT3ZlcndyaXR0ZW4gYnkgezB9IHdoZW4gaXQgaXMgb2ZmLlwiLCAnYCNwcm9ibGVtcy52aXNpYmlsaXR5I2AnKSxcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlXG5cdFx0fSxcblx0XHRbT3V0bGluZUNvbmZpZ0tleXMucHJvYmxlbXNCYWRnZXNdOiB7XG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IGxvY2FsaXplKCdvdXRsaW5lLnByb2JsZW1zLmJhZGdlcycsIFwiVXNlIGJhZGdlcyBmb3IgZXJyb3JzIGFuZCB3YXJuaW5ncyBvbiBPdXRsaW5lIGVsZW1lbnRzLiBPdmVyd3JpdHRlbiBieSB7MH0gd2hlbiBpdCBpcyBvZmYuXCIsICdgI3Byb2JsZW1zLnZpc2liaWxpdHkjYCcpLFxuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVmYXVsdCc6IHRydWVcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dGaWxlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuZmlsZScsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGBmaWxlYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd01vZHVsZXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLm1vZHVsZScsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGBtb2R1bGVgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93TmFtZXNwYWNlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMubmFtZXNwYWNlJywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYG5hbWVzcGFjZWAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dQYWNrYWdlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMucGFja2FnZScsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGBwYWNrYWdlYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd0NsYXNzZXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLmNsYXNzJywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYGNsYXNzYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd01ldGhvZHMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLm1ldGhvZCcsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGBtZXRob2RgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93UHJvcGVydGllcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMucHJvcGVydHknLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBgcHJvcGVydHlgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93RmllbGRzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5maWVsZCcsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGBmaWVsZGAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dDb25zdHJ1Y3RvcnMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLmNvbnN0cnVjdG9yJywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYGNvbnN0cnVjdG9yYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd0VudW1zJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5lbnVtJywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYGVudW1gLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93SW50ZXJmYWNlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuaW50ZXJmYWNlJywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYGludGVyZmFjZWAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dGdW5jdGlvbnMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLmZ1bmN0aW9uJywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYGZ1bmN0aW9uYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd1ZhcmlhYmxlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMudmFyaWFibGUnLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBgdmFyaWFibGVgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93Q29uc3RhbnRzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5jb25zdGFudCcsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGBjb25zdGFudGAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dTdHJpbmdzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5zdHJpbmcnLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBgc3RyaW5nYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd051bWJlcnMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLm51bWJlcicsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGBudW1iZXJgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93Qm9vbGVhbnMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLmJvb2xlYW4nLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBgYm9vbGVhbmAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dBcnJheXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLmFycmF5JywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYGFycmF5YC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd09iamVjdHMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLm9iamVjdCcsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGBvYmplY3RgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93S2V5cyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMua2V5JywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYGtleWAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dOdWxsJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5udWxsJywgXCJXaGVuIGVuYWJsZWQsIE91dGxpbmUgc2hvd3MgYG51bGxgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93RW51bU1lbWJlcnMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLmVudW1NZW1iZXInLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBgZW51bU1lbWJlcmAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dTdHJ1Y3RzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5zdHJ1Y3QnLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBgc3RydWN0YC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J291dGxpbmUuc2hvd0V2ZW50cyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuZXZlbnQnLCBcIldoZW4gZW5hYmxlZCwgT3V0bGluZSBzaG93cyBgZXZlbnRgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnb3V0bGluZS5zaG93T3BlcmF0b3JzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5vcGVyYXRvcicsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGBvcGVyYXRvcmAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdvdXRsaW5lLnNob3dUeXBlUGFyYW1ldGVycyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMudHlwZVBhcmFtZXRlcicsIFwiV2hlbiBlbmFibGVkLCBPdXRsaW5lIHNob3dzIGB0eXBlUGFyYW1ldGVyYC1zeW1ib2xzLlwiKVxuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQXlCLGNBQWMsc0JBQXNCO0FBQzdELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQWlDLGNBQWMseUJBQXlCLDBCQUEwQjtBQUNsRyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0I7QUFJN0IsT0FBTztBQUlQLE1BQU0s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
