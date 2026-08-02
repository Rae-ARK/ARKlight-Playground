import { Emitter } from "../../../../base/common/event.js";
import { localize } from "../../../../nls.js";
import { Extensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
const IBreadcrumbsService = createDecorator("IEditorBreadcrumbsService");
class BreadcrumbsService {
  constructor() {
    this._map = /* @__PURE__ */ new Map();
  }
  register(group, widget) {
    if (this._map.has(group)) {
      throw new Error(`group (${group}) has already a widget`);
    }
    this._map.set(group, widget);
    return {
      dispose: () => this._map.delete(group)
    };
  }
  getWidget(group) {
    return this._map.get(group);
  }
}
registerSingleton(IBreadcrumbsService, BreadcrumbsService, InstantiationType.Delayed);
const _BreadcrumbsConfig = class _BreadcrumbsConfig {
  constructor() {
  }
  static _stub(name) {
    return {
      bindTo(service) {
        const onDidChange = new Emitter();
        const listener = service.onDidChangeConfiguration((e) => {
          if (e.affectsConfiguration(name)) {
            onDidChange.fire(void 0);
          }
        });
        return new class {
          constructor() {
            this.name = name;
            this.onDidChange = onDidChange.event;
          }
          getValue(overrides) {
            if (overrides) {
              return service.getValue(name, overrides);
            } else {
              return service.getValue(name);
            }
          }
          updateValue(newValue, overrides) {
            if (overrides) {
              return service.updateValue(name, newValue, overrides);
            } else {
              return service.updateValue(name, newValue);
            }
          }
          dispose() {
            listener.dispose();
            onDidChange.dispose();
          }
        }();
      }
    };
  }
};
_BreadcrumbsConfig.IsEnabled = _BreadcrumbsConfig._stub("breadcrumbs.enabled");
_BreadcrumbsConfig.UseQuickPick = _BreadcrumbsConfig._stub("breadcrumbs.useQuickPick");
_BreadcrumbsConfig.FilePath = _BreadcrumbsConfig._stub("breadcrumbs.filePath");
_BreadcrumbsConfig.SymbolPath = _BreadcrumbsConfig._stub("breadcrumbs.symbolPath");
_BreadcrumbsConfig.SymbolSortOrder = _BreadcrumbsConfig._stub("breadcrumbs.symbolSortOrder");
_BreadcrumbsConfig.SymbolPathSeparator = _BreadcrumbsConfig._stub("breadcrumbs.symbolPathSeparator");
_BreadcrumbsConfig.Icons = _BreadcrumbsConfig._stub("breadcrumbs.icons");
_BreadcrumbsConfig.ShowEditorType = _BreadcrumbsConfig._stub("breadcrumbs.showEditorType");
_BreadcrumbsConfig.TitleScrollbarSizing = _BreadcrumbsConfig._stub("workbench.editor.titleScrollbarSizing");
_BreadcrumbsConfig.TitleScrollbarVisibility = _BreadcrumbsConfig._stub("workbench.editor.titleScrollbarVisibility");
_BreadcrumbsConfig.FileExcludes = _BreadcrumbsConfig._stub("files.exclude");
let BreadcrumbsConfig = _BreadcrumbsConfig;
Registry.as(Extensions.Configuration).registerConfiguration({
  id: "breadcrumbs",
  title: localize("title", "Breadcrumb Navigation"),
  order: 101,
  type: "object",
  properties: {
    "breadcrumbs.enabled": {
      description: localize("enabled", "Enable/disable navigation breadcrumbs."),
      type: "boolean",
      default: true,
      agentsWindow: { default: true }
    },
    "breadcrumbs.filePath": {
      description: localize("filepath", "Controls whether and how file paths are shown in the breadcrumbs view."),
      type: "string",
      default: "on",
      enum: ["on", "off", "last"],
      enumDescriptions: [
        localize("filepath.on", "Show the file path in the breadcrumbs view."),
        localize("filepath.off", "Do not show the file path in the breadcrumbs view."),
        localize("filepath.last", "Only show the last element of the file path in the breadcrumbs view.")
      ]
    },
    "breadcrumbs.symbolPath": {
      description: localize("symbolpath", "Controls whether and how symbols are shown in the breadcrumbs view."),
      type: "string",
      default: "on",
      enum: ["on", "off", "last"],
      enumDescriptions: [
        localize("symbolpath.on", "Show all symbols in the breadcrumbs view."),
        localize("symbolpath.off", "Do not show symbols in the breadcrumbs view."),
        localize("symbolpath.last", "Only show the current symbol in the breadcrumbs view.")
      ]
    },
    "breadcrumbs.symbolSortOrder": {
      description: localize("symbolSortOrder", "Controls how symbols are sorted in the breadcrumbs outline view."),
      type: "string",
      default: "position",
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      enum: ["position", "name", "type"],
      enumDescriptions: [
        localize("symbolSortOrder.position", "Show symbol outline in file position order."),
        localize("symbolSortOrder.name", "Show symbol outline in alphabetical order."),
        localize("symbolSortOrder.type", "Show symbol outline in symbol type order.")
      ]
    },
    "breadcrumbs.icons": {
      description: localize("icons", "Render breadcrumb items with icons."),
      type: "boolean",
      default: true
    },
    "breadcrumbs.showEditorType": {
      markdownDescription: localize("showEditorType", "Controls whether the breadcrumbs bar shows a dropdown to switch between the editors that can open the current file (for example the text editor and a custom editor). The dropdown only appears when a more specialized editor is available."),
      type: "boolean",
      default: false,
      agentsWindow: { default: true },
      tags: ["experimental"]
    },
    "breadcrumbs.symbolPathSeparator": {
      description: localize("symbolPathSeparator", "The separator used when copying the breadcrumb symbol path."),
      type: "string",
      default: ".",
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "breadcrumbs.showFiles": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.file", "When enabled breadcrumbs show `file`-symbols.")
    },
    "breadcrumbs.showModules": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.module", "When enabled breadcrumbs show `module`-symbols.")
    },
    "breadcrumbs.showNamespaces": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.namespace", "When enabled breadcrumbs show `namespace`-symbols.")
    },
    "breadcrumbs.showPackages": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.package", "When enabled breadcrumbs show `package`-symbols.")
    },
    "breadcrumbs.showClasses": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.class", "When enabled breadcrumbs show `class`-symbols.")
    },
    "breadcrumbs.showMethods": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.method", "When enabled breadcrumbs show `method`-symbols.")
    },
    "breadcrumbs.showProperties": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.property", "When enabled breadcrumbs show `property`-symbols.")
    },
    "breadcrumbs.showFields": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.field", "When enabled breadcrumbs show `field`-symbols.")
    },
    "breadcrumbs.showConstructors": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.constructor", "When enabled breadcrumbs show `constructor`-symbols.")
    },
    "breadcrumbs.showEnums": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.enum", "When enabled breadcrumbs show `enum`-symbols.")
    },
    "breadcrumbs.showInterfaces": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.interface", "When enabled breadcrumbs show `interface`-symbols.")
    },
    "breadcrumbs.showFunctions": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.function", "When enabled breadcrumbs show `function`-symbols.")
    },
    "breadcrumbs.showVariables": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.variable", "When enabled breadcrumbs show `variable`-symbols.")
    },
    "breadcrumbs.showConstants": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.constant", "When enabled breadcrumbs show `constant`-symbols.")
    },
    "breadcrumbs.showStrings": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.string", "When enabled breadcrumbs show `string`-symbols.")
    },
    "breadcrumbs.showNumbers": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.number", "When enabled breadcrumbs show `number`-symbols.")
    },
    "breadcrumbs.showBooleans": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.boolean", "When enabled breadcrumbs show `boolean`-symbols.")
    },
    "breadcrumbs.showArrays": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.array", "When enabled breadcrumbs show `array`-symbols.")
    },
    "breadcrumbs.showObjects": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.object", "When enabled breadcrumbs show `object`-symbols.")
    },
    "breadcrumbs.showKeys": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.key", "When enabled breadcrumbs show `key`-symbols.")
    },
    "breadcrumbs.showNull": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.null", "When enabled breadcrumbs show `null`-symbols.")
    },
    "breadcrumbs.showEnumMembers": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.enumMember", "When enabled breadcrumbs show `enumMember`-symbols.")
    },
    "breadcrumbs.showStructs": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.struct", "When enabled breadcrumbs show `struct`-symbols.")
    },
    "breadcrumbs.showEvents": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.event", "When enabled breadcrumbs show `event`-symbols.")
    },
    "breadcrumbs.showOperators": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.operator", "When enabled breadcrumbs show `operator`-symbols.")
    },
    "breadcrumbs.showTypeParameters": {
      type: "boolean",
      default: true,
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      markdownDescription: localize("filteredTypes.typeParameter", "When enabled breadcrumbs show `typeParameter`-symbols.")
    }
  }
});
export {
  BreadcrumbsConfig,
  BreadcrumbsService,
  IBreadcrumbsService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9icmVhZGNydW1icy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEJyZWFkY3J1bWJzV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2JyZWFkY3J1bWJzL2JyZWFkY3J1bWJzV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0ICogYXMgZ2xvYiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzLCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnksIENvbmZpZ3VyYXRpb25TY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgR3JvdXBJZGVudGlmaWVyLCBJRWRpdG9yUGFydE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcblxuZXhwb3J0IGNvbnN0IElCcmVhZGNydW1ic1NlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUJyZWFkY3J1bWJzU2VydmljZT4oJ0lFZGl0b3JCcmVhZGNydW1ic1NlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJQnJlYWRjcnVtYnNTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVnaXN0ZXIoZ3JvdXA6IEdyb3VwSWRlbnRpZmllciwgd2lkZ2V0OiBCcmVhZGNydW1ic1dpZGdldCk6IElEaXNwb3NhYmxlO1xuXG5cdGdldFdpZGdldChncm91cDogR3JvdXBJZGVudGlmaWVyKTogQnJlYWRjcnVtYnNXaWRnZXQgfCB1bmRlZmluZWQ7XG59XG5cblxuZXhwb3J0IGNsYXNzIEJyZWFkY3J1bWJzU2VydmljZSBpbXBsZW1lbnRzIElCcmVhZGNydW1ic1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21hcCA9IG5ldyBNYXA8bnVtYmVyLCBCcmVhZGNydW1ic1dpZGdldD4oKTtcblxuXHRyZWdpc3Rlcihncm91cDogbnVtYmVyLCB3aWRnZXQ6IEJyZWFkY3J1bWJzV2lkZ2V0KTogSURpc3Bvc2FibGUge1xuXHRcdGlmICh0aGlzLl9tYXAuaGFzKGdyb3VwKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBncm91cCAoJHtncm91cH0pIGhhcyBhbHJlYWR5IGEgd2lkZ2V0YCk7XG5cdFx0fVxuXHRcdHRoaXMuX21hcC5zZXQoZ3JvdXAsIHdpZGdldCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHRoaXMuX21hcC5kZWxldGUoZ3JvdXApXG5cdFx0fTtcblx0fVxuXG5cdGdldFdpZGdldChncm91cDogbnVtYmVyKTogQnJlYWRjcnVtYnNXaWRnZXQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tYXAuZ2V0KGdyb3VwKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJQnJlYWRjcnVtYnNTZXJ2aWNlLCBCcmVhZGNydW1ic1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuXG5cbi8vI3JlZ2lvbiBjb25maWdcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJyZWFkY3J1bWJzQ29uZmlnPFQ+IHtcblxuXHRhYnN0cmFjdCBnZXQgbmFtZSgpOiBzdHJpbmc7XG5cdGFic3RyYWN0IGdldCBvbkRpZENoYW5nZSgpOiBFdmVudDx2b2lkPjtcblxuXHRhYnN0cmFjdCBnZXRWYWx1ZShvdmVycmlkZXM/OiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyk6IFQ7XG5cdGFic3RyYWN0IHVwZGF0ZVZhbHVlKHZhbHVlOiBULCBvdmVycmlkZXM/OiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyk6IFByb21pc2U8dm9pZD47XG5cdGFic3RyYWN0IGRpc3Bvc2UoKTogdm9pZDtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKCkge1xuXHRcdC8vIGludGVybmFsXG5cdH1cblxuXHRzdGF0aWMgcmVhZG9ubHkgSXNFbmFibGVkID0gQnJlYWRjcnVtYnNDb25maWcuX3N0dWI8Ym9vbGVhbj4oJ2JyZWFkY3J1bWJzLmVuYWJsZWQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFVzZVF1aWNrUGljayA9IEJyZWFkY3J1bWJzQ29uZmlnLl9zdHViPGJvb2xlYW4+KCdicmVhZGNydW1icy51c2VRdWlja1BpY2snKTtcblx0c3RhdGljIHJlYWRvbmx5IEZpbGVQYXRoID0gQnJlYWRjcnVtYnNDb25maWcuX3N0dWI8J29uJyB8ICdvZmYnIHwgJ2xhc3QnPignYnJlYWRjcnVtYnMuZmlsZVBhdGgnKTtcblx0c3RhdGljIHJlYWRvbmx5IFN5bWJvbFBhdGggPSBCcmVhZGNydW1ic0NvbmZpZy5fc3R1Yjwnb24nIHwgJ29mZicgfCAnbGFzdCc+KCdicmVhZGNydW1icy5zeW1ib2xQYXRoJyk7XG5cdHN0YXRpYyByZWFkb25seSBTeW1ib2xTb3J0T3JkZXIgPSBCcmVhZGNydW1ic0NvbmZpZy5fc3R1YjwncG9zaXRpb24nIHwgJ25hbWUnIHwgJ3R5cGUnPignYnJlYWRjcnVtYnMuc3ltYm9sU29ydE9yZGVyJyk7XG5cdHN0YXRpYyByZWFkb25seSBTeW1ib2xQYXRoU2VwYXJhdG9yID0gQnJlYWRjcnVtYnNDb25maWcuX3N0dWI8c3RyaW5nPignYnJlYWRjcnVtYnMuc3ltYm9sUGF0aFNlcGFyYXRvcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgSWNvbnMgPSBCcmVhZGNydW1ic0NvbmZpZy5fc3R1Yjxib29sZWFuPignYnJlYWRjcnVtYnMuaWNvbnMnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNob3dFZGl0b3JUeXBlID0gQnJlYWRjcnVtYnNDb25maWcuX3N0dWI8Ym9vbGVhbj4oJ2JyZWFkY3J1bWJzLnNob3dFZGl0b3JUeXBlJyk7XG5cdHN0YXRpYyByZWFkb25seSBUaXRsZVNjcm9sbGJhclNpemluZyA9IEJyZWFkY3J1bWJzQ29uZmlnLl9zdHViPElFZGl0b3JQYXJ0T3B0aW9uc1sndGl0bGVTY3JvbGxiYXJTaXppbmcnXT4oJ3dvcmtiZW5jaC5lZGl0b3IudGl0bGVTY3JvbGxiYXJTaXppbmcnKTtcblx0c3RhdGljIHJlYWRvbmx5IFRpdGxlU2Nyb2xsYmFyVmlzaWJpbGl0eSA9IEJyZWFkY3J1bWJzQ29uZmlnLl9zdHViPElFZGl0b3JQYXJ0T3B0aW9uc1sndGl0bGVTY3JvbGxiYXJWaXNpYmlsaXR5J10+KCd3b3JrYmVuY2guZWRpdG9yLnRpdGxlU2Nyb2xsYmFyVmlzaWJpbGl0eScpO1xuXG5cdHN0YXRpYyByZWFkb25seSBGaWxlRXhjbHVkZXMgPSBCcmVhZGNydW1ic0NvbmZpZy5fc3R1YjxnbG9iLklFeHByZXNzaW9uPignZmlsZXMuZXhjbHVkZScpO1xuXG5cdHByaXZhdGUgc3RhdGljIF9zdHViPFQ+KG5hbWU6IHN0cmluZyk6IHsgYmluZFRvKHNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IEJyZWFkY3J1bWJzQ29uZmlnPFQ+IH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRiaW5kVG8oc2VydmljZSkge1xuXHRcdFx0XHRjb25zdCBvbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cblx0XHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBzZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihuYW1lKSkge1xuXHRcdFx0XHRcdFx0b25EaWRDaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuIG5ldyBjbGFzcyBpbXBsZW1lbnRzIEJyZWFkY3J1bWJzQ29uZmlnPFQ+IHtcblx0XHRcdFx0XHRyZWFkb25seSBuYW1lID0gbmFtZTtcblx0XHRcdFx0XHRyZWFkb25seSBvbkRpZENoYW5nZSA9IG9uRGlkQ2hhbmdlLmV2ZW50O1xuXHRcdFx0XHRcdGdldFZhbHVlKG92ZXJyaWRlcz86IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzKTogVCB7XG5cdFx0XHRcdFx0XHRpZiAob3ZlcnJpZGVzKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBzZXJ2aWNlLmdldFZhbHVlKG5hbWUsIG92ZXJyaWRlcyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gc2VydmljZS5nZXRWYWx1ZShuYW1lKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dXBkYXRlVmFsdWUobmV3VmFsdWU6IFQsIG92ZXJyaWRlcz86IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdFx0XHRpZiAob3ZlcnJpZGVzKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBzZXJ2aWNlLnVwZGF0ZVZhbHVlKG5hbWUsIG5ld1ZhbHVlLCBvdmVycmlkZXMpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHNlcnZpY2UudXBkYXRlVmFsdWUobmFtZSwgbmV3VmFsdWUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0b25EaWRDaGFuZ2UuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0aWQ6ICdicmVhZGNydW1icycsXG5cdHRpdGxlOiBsb2NhbGl6ZSgndGl0bGUnLCBcIkJyZWFkY3J1bWIgTmF2aWdhdGlvblwiKSxcblx0b3JkZXI6IDEwMSxcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHQnYnJlYWRjcnVtYnMuZW5hYmxlZCc6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZW5hYmxlZCcsIFwiRW5hYmxlL2Rpc2FibGUgbmF2aWdhdGlvbiBicmVhZGNydW1icy5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IHRydWUgfSxcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5maWxlUGF0aCc6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsZXBhdGgnLCBcIkNvbnRyb2xzIHdoZXRoZXIgYW5kIGhvdyBmaWxlIHBhdGhzIGFyZSBzaG93biBpbiB0aGUgYnJlYWRjcnVtYnMgdmlldy5cIiksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlZmF1bHQ6ICdvbicsXG5cdFx0XHRlbnVtOiBbJ29uJywgJ29mZicsICdsYXN0J10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdmaWxlcGF0aC5vbicsIFwiU2hvdyB0aGUgZmlsZSBwYXRoIGluIHRoZSBicmVhZGNydW1icyB2aWV3LlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2ZpbGVwYXRoLm9mZicsIFwiRG8gbm90IHNob3cgdGhlIGZpbGUgcGF0aCBpbiB0aGUgYnJlYWRjcnVtYnMgdmlldy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdmaWxlcGF0aC5sYXN0JywgXCJPbmx5IHNob3cgdGhlIGxhc3QgZWxlbWVudCBvZiB0aGUgZmlsZSBwYXRoIGluIHRoZSBicmVhZGNydW1icyB2aWV3LlwiKSxcblx0XHRcdF1cblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zeW1ib2xQYXRoJzoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzeW1ib2xwYXRoJywgXCJDb250cm9scyB3aGV0aGVyIGFuZCBob3cgc3ltYm9scyBhcmUgc2hvd24gaW4gdGhlIGJyZWFkY3J1bWJzIHZpZXcuXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZWZhdWx0OiAnb24nLFxuXHRcdFx0ZW51bTogWydvbicsICdvZmYnLCAnbGFzdCddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnc3ltYm9scGF0aC5vbicsIFwiU2hvdyBhbGwgc3ltYm9scyBpbiB0aGUgYnJlYWRjcnVtYnMgdmlldy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzeW1ib2xwYXRoLm9mZicsIFwiRG8gbm90IHNob3cgc3ltYm9scyBpbiB0aGUgYnJlYWRjcnVtYnMgdmlldy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzeW1ib2xwYXRoLmxhc3QnLCBcIk9ubHkgc2hvdyB0aGUgY3VycmVudCBzeW1ib2wgaW4gdGhlIGJyZWFkY3J1bWJzIHZpZXcuXCIpLFxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnN5bWJvbFNvcnRPcmRlcic6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc3ltYm9sU29ydE9yZGVyJywgXCJDb250cm9scyBob3cgc3ltYm9scyBhcmUgc29ydGVkIGluIHRoZSBicmVhZGNydW1icyBvdXRsaW5lIHZpZXcuXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZWZhdWx0OiAncG9zaXRpb24nLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdGVudW06IFsncG9zaXRpb24nLCAnbmFtZScsICd0eXBlJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdzeW1ib2xTb3J0T3JkZXIucG9zaXRpb24nLCBcIlNob3cgc3ltYm9sIG91dGxpbmUgaW4gZmlsZSBwb3NpdGlvbiBvcmRlci5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzeW1ib2xTb3J0T3JkZXIubmFtZScsIFwiU2hvdyBzeW1ib2wgb3V0bGluZSBpbiBhbHBoYWJldGljYWwgb3JkZXIuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc3ltYm9sU29ydE9yZGVyLnR5cGUnLCBcIlNob3cgc3ltYm9sIG91dGxpbmUgaW4gc3ltYm9sIHR5cGUgb3JkZXIuXCIpLFxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLmljb25zJzoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdpY29ucycsIFwiUmVuZGVyIGJyZWFkY3J1bWIgaXRlbXMgd2l0aCBpY29ucy5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd0VkaXRvclR5cGUnOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2hvd0VkaXRvclR5cGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGJyZWFkY3J1bWJzIGJhciBzaG93cyBhIGRyb3Bkb3duIHRvIHN3aXRjaCBiZXR3ZWVuIHRoZSBlZGl0b3JzIHRoYXQgY2FuIG9wZW4gdGhlIGN1cnJlbnQgZmlsZSAoZm9yIGV4YW1wbGUgdGhlIHRleHQgZWRpdG9yIGFuZCBhIGN1c3RvbSBlZGl0b3IpLiBUaGUgZHJvcGRvd24gb25seSBhcHBlYXJzIHdoZW4gYSBtb3JlIHNwZWNpYWxpemVkIGVkaXRvciBpcyBhdmFpbGFibGUuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogdHJ1ZSB9LFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnN5bWJvbFBhdGhTZXBhcmF0b3InOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3N5bWJvbFBhdGhTZXBhcmF0b3InLCBcIlRoZSBzZXBhcmF0b3IgdXNlZCB3aGVuIGNvcHlpbmcgdGhlIGJyZWFkY3J1bWIgc3ltYm9sIHBhdGguXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZWZhdWx0OiAnLicsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd0ZpbGVzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5maWxlJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgZmlsZWAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93TW9kdWxlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMubW9kdWxlJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgbW9kdWxlYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dOYW1lc3BhY2VzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5uYW1lc3BhY2UnLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBuYW1lc3BhY2VgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd1BhY2thZ2VzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5wYWNrYWdlJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgcGFja2FnZWAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93Q2xhc3Nlcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuY2xhc3MnLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBjbGFzc2Atc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93TWV0aG9kcyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMubWV0aG9kJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgbWV0aG9kYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dQcm9wZXJ0aWVzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5wcm9wZXJ0eScsIFwiV2hlbiBlbmFibGVkIGJyZWFkY3J1bWJzIHNob3cgYHByb3BlcnR5YC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dGaWVsZHMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLmZpZWxkJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgZmllbGRgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd0NvbnN0cnVjdG9ycyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuY29uc3RydWN0b3InLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBjb25zdHJ1Y3RvcmAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93RW51bXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLmVudW0nLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBlbnVtYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dJbnRlcmZhY2VzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5pbnRlcmZhY2UnLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBpbnRlcmZhY2VgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd0Z1bmN0aW9ucyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuZnVuY3Rpb24nLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBmdW5jdGlvbmAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93VmFyaWFibGVzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy52YXJpYWJsZScsIFwiV2hlbiBlbmFibGVkIGJyZWFkY3J1bWJzIHNob3cgYHZhcmlhYmxlYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dDb25zdGFudHMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLmNvbnN0YW50JywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgY29uc3RhbnRgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd1N0cmluZ3MnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLnN0cmluZycsIFwiV2hlbiBlbmFibGVkIGJyZWFkY3J1bWJzIHNob3cgYHN0cmluZ2Atc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93TnVtYmVycyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMubnVtYmVyJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgbnVtYmVyYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dCb29sZWFucyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuYm9vbGVhbicsIFwiV2hlbiBlbmFibGVkIGJyZWFkY3J1bWJzIHNob3cgYGJvb2xlYW5gLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd0FycmF5cyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuYXJyYXknLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBhcnJheWAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93T2JqZWN0cyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMub2JqZWN0JywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgb2JqZWN0YC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dLZXlzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5rZXknLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBrZXlgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd051bGwnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLm51bGwnLCBcIldoZW4gZW5hYmxlZCBicmVhZGNydW1icyBzaG93IGBudWxsYC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dFbnVtTWVtYmVycyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ZpbHRlcmVkVHlwZXMuZW51bU1lbWJlcicsIFwiV2hlbiBlbmFibGVkIGJyZWFkY3J1bWJzIHNob3cgYGVudW1NZW1iZXJgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd1N0cnVjdHMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLnN0cnVjdCcsIFwiV2hlbiBlbmFibGVkIGJyZWFkY3J1bWJzIHNob3cgYHN0cnVjdGAtc3ltYm9scy5cIilcblx0XHR9LFxuXHRcdCdicmVhZGNydW1icy5zaG93RXZlbnRzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy5ldmVudCcsIFwiV2hlbiBlbmFibGVkIGJyZWFkY3J1bWJzIHNob3cgYGV2ZW50YC1zeW1ib2xzLlwiKVxuXHRcdH0sXG5cdFx0J2JyZWFkY3J1bWJzLnNob3dPcGVyYXRvcnMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWx0ZXJlZFR5cGVzLm9wZXJhdG9yJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgb3BlcmF0b3JgLXN5bWJvbHMuXCIpXG5cdFx0fSxcblx0XHQnYnJlYWRjcnVtYnMuc2hvd1R5cGVQYXJhbWV0ZXJzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZmlsdGVyZWRUeXBlcy50eXBlUGFyYW1ldGVyJywgXCJXaGVuIGVuYWJsZWQgYnJlYWRjcnVtYnMgc2hvdyBgdHlwZVBhcmFtZXRlcmAtc3ltYm9scy5cIilcblx0XHR9XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsZUFBc0I7QUFHL0IsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxZQUFvQywwQkFBMEI7QUFDdkUsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMs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
