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
import { Dimension, getActiveDocument } from "../../../../base/browser/dom.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { codiconsLibrary } from "../../../../base/common/codiconsLibrary.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { defaultInputBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { getIconRegistry } from "../../../../platform/theme/common/iconRegistry.js";
import { WorkbenchIconSelectBox } from "../../../services/userDataProfile/browser/iconSelectBox.js";
const icons = new Lazy(() => {
  const iconDefinitions = getIconRegistry().getIcons();
  const includedChars = /* @__PURE__ */ new Set();
  const dedupedIcons = iconDefinitions.filter((e) => {
    if (e.id === codiconsLibrary.blank.id) {
      return false;
    }
    if (ThemeIcon.isThemeIcon(e.defaults)) {
      return false;
    }
    if (includedChars.has(e.defaults.fontCharacter)) {
      return false;
    }
    includedChars.add(e.defaults.fontCharacter);
    return true;
  });
  return dedupedIcons;
});
let TerminalIconPicker = class extends Disposable {
  constructor(instantiationService, _hoverService, _layoutService) {
    super();
    this._hoverService = _hoverService;
    this._layoutService = _layoutService;
    this._iconSelectBox = instantiationService.createInstance(WorkbenchIconSelectBox, {
      icons: icons.value,
      inputBoxStyles: defaultInputBoxStyles
    });
  }
  async pickIcons() {
    const dimension = new Dimension(486, 260);
    return new Promise((resolve) => {
      this._register(this._iconSelectBox.onDidSelect((e) => {
        resolve(e);
        this._iconSelectBox.dispose();
      }));
      this._iconSelectBox.clearInput();
      const body = getActiveDocument().body;
      const bodyRect = body.getBoundingClientRect();
      const hoverWidget = this._hoverService.showInstantHover({
        content: this._iconSelectBox.domNode,
        target: {
          targetElements: [body],
          x: bodyRect.left + (bodyRect.width - dimension.width) / 2,
          y: bodyRect.top + this._layoutService.activeContainerOffset.top
        },
        position: {
          hoverPosition: HoverPosition.BELOW
        },
        persistence: {
          sticky: true
        }
      }, true);
      if (hoverWidget) {
        this._register(hoverWidget);
      }
      this._iconSelectBox.layout(dimension);
      this._iconSelectBox.focus();
    });
  }
};
TerminalIconPicker = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IHoverService),
  __decorateParam(2, ILayoutService)
], TerminalIconPicker);
export {
  TerminalIconPicker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxJY29uUGlja2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGltZW5zaW9uLCBnZXRBY3RpdmVEb2N1bWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBjb2RpY29uc0xpYnJhcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29uc0xpYnJhcnkuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdElucHV0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGdldEljb25SZWdpc3RyeSwgSWNvbkNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoSWNvblNlbGVjdEJveCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9icm93c2VyL2ljb25TZWxlY3RCb3guanMnO1xuXG5jb25zdCBpY29ucyA9IG5ldyBMYXp5PEljb25Db250cmlidXRpb25bXT4oKCkgPT4ge1xuXHRjb25zdCBpY29uRGVmaW5pdGlvbnMgPSBnZXRJY29uUmVnaXN0cnkoKS5nZXRJY29ucygpO1xuXHRjb25zdCBpbmNsdWRlZENoYXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IGRlZHVwZWRJY29ucyA9IGljb25EZWZpbml0aW9ucy5maWx0ZXIoZSA9PiB7XG5cdFx0aWYgKGUuaWQgPT09IGNvZGljb25zTGlicmFyeS5ibGFuay5pZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGUuZGVmYXVsdHMpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChpbmNsdWRlZENoYXJzLmhhcyhlLmRlZmF1bHRzLmZvbnRDaGFyYWN0ZXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGluY2x1ZGVkQ2hhcnMuYWRkKGUuZGVmYXVsdHMuZm9udENoYXJhY3Rlcik7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH0pO1xuXHRyZXR1cm4gZGVkdXBlZEljb25zO1xufSk7XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbEljb25QaWNrZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfaWNvblNlbGVjdEJveDogV29ya2JlbmNoSWNvblNlbGVjdEJveDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXRTZXJ2aWNlOiBJTGF5b3V0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2ljb25TZWxlY3RCb3ggPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hJY29uU2VsZWN0Qm94LCB7XG5cdFx0XHRpY29uczogaWNvbnMudmFsdWUsXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBwaWNrSWNvbnMoKTogUHJvbWlzZTxUaGVtZUljb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkaW1lbnNpb24gPSBuZXcgRGltZW5zaW9uKDQ4NiwgMjYwKTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8VGhlbWVJY29uIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ljb25TZWxlY3RCb3gub25EaWRTZWxlY3QoZSA9PiB7XG5cdFx0XHRcdHJlc29sdmUoZSk7XG5cdFx0XHRcdHRoaXMuX2ljb25TZWxlY3RCb3guZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5faWNvblNlbGVjdEJveC5jbGVhcklucHV0KCk7XG5cdFx0XHRjb25zdCBib2R5ID0gZ2V0QWN0aXZlRG9jdW1lbnQoKS5ib2R5O1xuXHRcdFx0Y29uc3QgYm9keVJlY3QgPSBib2R5LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0Y29uc3QgaG92ZXJXaWRnZXQgPSB0aGlzLl9ob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdGNvbnRlbnQ6IHRoaXMuX2ljb25TZWxlY3RCb3guZG9tTm9kZSxcblx0XHRcdFx0dGFyZ2V0OiB7XG5cdFx0XHRcdFx0dGFyZ2V0RWxlbWVudHM6IFtib2R5XSxcblx0XHRcdFx0XHR4OiBib2R5UmVjdC5sZWZ0ICsgKGJvZHlSZWN0LndpZHRoIC0gZGltZW5zaW9uLndpZHRoKSAvIDIsXG5cdFx0XHRcdFx0eTogYm9keVJlY3QudG9wICsgdGhpcy5fbGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXJPZmZzZXQudG9wXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdFx0aG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5CRUxPVyxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVyc2lzdGVuY2U6IHtcblx0XHRcdFx0XHRzdGlja3k6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LCB0cnVlKTtcblx0XHRcdGlmIChob3ZlcldpZGdldCkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcihob3ZlcldpZGdldCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9pY29uU2VsZWN0Qm94LmxheW91dChkaW1lbnNpb24pO1xuXHRcdFx0dGhpcy5faWNvblNlbGVjdEJveC5mb2N1cygpO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsV0FBVyx5QkFBeUI7QUFDN0MsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXlDO0FBQ2xELFNBQVMsOEJBQThCO0FBRXZDLE1BQU0sUUFBUSxJQUFJLEtBQXlCLE1BQU07QUFDaEQsUUFBTSxrQkFBa0IsZ0JBQWdCLEVBQUUsU0FBUztBQUNuRCxRQUFNLGdCQUFnQixvQkFBSSxJQUFZO0FBQ3RDLFFBQU0sZUFBZSxnQkFBZ0IsT0FBTyxPQUFLO0FBQ2hELFFBQUksRUFBRSxPQUFPLGdCQUFnQixNQUFNLElBQUk7QUFDdEMsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLFVBQVUsWUFBWSxFQUFFLFFBQVEsR0FBRztBQUN0QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksY0FBYyxJQUFJLEVBQUUsU0FBUyxhQUFhLEdBQUc7QUFDaEQsYUFBTztBQUFBLElBQ1I7QUFDQSxrQkFBYyxJQUFJLEVBQUUsU0FBUyxhQUFhO0FBQzFDLFdBQU87QUFBQSxFQUNSLENBQUM7QUFDRCxTQUFPO0FBQ1IsQ0FBQztBQUVNLElBQU0scUJBQU4sY0FBaUMsV0FBVztBQUFBLEVBR2xELFlBQ3dCLHNCQUNTLGVBQ0MsZ0JBQ2hDO0FBQ0QsVUFBTTtBQUgwQjtBQUNDO0FBSWpDLFNBQUssaUJBQWlCLHFCQUFxQixlQUFlLHdCQUF3QjtBQUFBLE1BQ2pGLE9BQU8sTUFBTTtBQUFBLE1BQ2IsZ0JBQWdCO0FBQUEsSUFDakIsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sWUFBNEM7QUFDakQsVUFBTSxZQUFZLElBQUksVUFBVSxLQUFLLEdBQUc7QUFDeEMsV0FBTyxJQUFJLFFBQStCLGFBQVc7QUFDcEQsV0FBSyxVQUFVLEtBQUssZUFBZSxZQUFZLE9BQUs7QUFDbkQsZ0JBQVEsQ0FBQztBQUNULGFBQUssZUFBZSxRQUFRO0FBQUEsTUFDN0IsQ0FBQyxDQUFDO0FBQ0YsV0FBSyxlQUFlLFdBQVc7QUFDL0IsWUFBTSxPQUFPLGtCQUFrQixFQUFFO0FBQ2pDLFlBQU0sV0FBVyxLQUFLLHNCQUFzQjtBQUM1QyxZQUFNLGNBQWMsS0FBSyxjQUFjLGlCQUFpQjtBQUFBLFFBQ3ZELFNBQVMsS0FBSyxlQUFlO0FBQUEsUUFDN0IsUUFBUTtBQUFBLFVBQ1AsZ0JBQWdCLENBQUMsSUFBSTtBQUFBLFVBQ3JCLEdBQUcsU0FBUyxRQUFRLFNBQVMsUUFBUSxVQUFVLFNBQVM7QUFBQSxVQUN4RCxHQUFHLFNBQVMsTUFBTSxLQUFLLGVBQWUsc0JBQXNCO0FBQUEsUUFDN0Q7QUFBQSxRQUNBLFVBQVU7QUFBQSxVQUNULGVBQWUsY0FBYztBQUFBLFFBQzlCO0FBQUEsUUFDQSxhQUFhO0FBQUEsVUFDWixRQUFRO0FBQUEsUUFDVDtBQUFBLE1BQ0QsR0FBRyxJQUFJO0FBQ1AsVUFBSSxhQUFhO0FBQ2hCLGFBQUssVUFBVSxXQUFXO0FBQUEsTUFDM0I7QUFDQSxXQUFLLGVBQWUsT0FBTyxTQUFTO0FBQ3BDLFdBQUssZUFBZSxNQUFNO0FBQUEsSUFDM0IsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQS9DYSxxQkFBTjtBQUFBLEVBSUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
