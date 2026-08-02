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
import { ColorTheme, ColorThemeKind } from "./extHostTypes.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { Emitter } from "../../../base/common/event.js";
let ExtHostTheming = class {
  constructor(_extHostRpc) {
    this._actual = new ColorTheme(ColorThemeKind.Dark);
    this._onDidChangeActiveColorTheme = new Emitter();
  }
  get activeColorTheme() {
    return this._actual;
  }
  $onColorThemeChange(type) {
    let kind;
    switch (type) {
      case "light":
        kind = ColorThemeKind.Light;
        break;
      case "hcDark":
        kind = ColorThemeKind.HighContrast;
        break;
      case "hcLight":
        kind = ColorThemeKind.HighContrastLight;
        break;
      default:
        kind = ColorThemeKind.Dark;
    }
    this._actual = new ColorTheme(kind);
    this._onDidChangeActiveColorTheme.fire(this._actual);
  }
  get onDidChangeActiveColorTheme() {
    return this._onDidChangeActiveColorTheme.event;
  }
};
ExtHostTheming = __decorateClass([
  __decorateParam(0, IExtHostRpcService)
], ExtHostTheming);
export {
  ExtHostTheming
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUaGVtaW5nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29sb3JUaGVtZSwgQ29sb3JUaGVtZUtpbmQgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RScGNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RUaGVtaW5nU2hhcGUgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0VGhlbWluZyBpbXBsZW1lbnRzIEV4dEhvc3RUaGVtaW5nU2hhcGUge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9hY3R1YWw6IENvbG9yVGhlbWU7XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlQWN0aXZlQ29sb3JUaGVtZTogRW1pdHRlcjxDb2xvclRoZW1lPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dEhvc3RScGNTZXJ2aWNlIF9leHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fYWN0dWFsID0gbmV3IENvbG9yVGhlbWUoQ29sb3JUaGVtZUtpbmQuRGFyayk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVDb2xvclRoZW1lID0gbmV3IEVtaXR0ZXI8Q29sb3JUaGVtZT4oKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgYWN0aXZlQ29sb3JUaGVtZSgpOiBDb2xvclRoZW1lIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsO1xuXHR9XG5cblx0JG9uQ29sb3JUaGVtZUNoYW5nZSh0eXBlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRsZXQga2luZDtcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgJ2xpZ2h0Jzoga2luZCA9IENvbG9yVGhlbWVLaW5kLkxpZ2h0OyBicmVhaztcblx0XHRcdGNhc2UgJ2hjRGFyayc6IGtpbmQgPSBDb2xvclRoZW1lS2luZC5IaWdoQ29udHJhc3Q7IGJyZWFrO1xuXHRcdFx0Y2FzZSAnaGNMaWdodCc6IGtpbmQgPSBDb2xvclRoZW1lS2luZC5IaWdoQ29udHJhc3RMaWdodDsgYnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRraW5kID0gQ29sb3JUaGVtZUtpbmQuRGFyaztcblx0XHR9XG5cdFx0dGhpcy5fYWN0dWFsID0gbmV3IENvbG9yVGhlbWUoa2luZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVDb2xvclRoZW1lLmZpcmUodGhpcy5fYWN0dWFsKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VBY3RpdmVDb2xvclRoZW1lKCk6IEV2ZW50PENvbG9yVGhlbWU+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVDb2xvclRoZW1lLmV2ZW50O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSxzQkFBc0I7QUFDM0MsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxlQUFzQjtBQUV4QixJQUFNLGlCQUFOLE1BQW9EO0FBQUEsRUFPMUQsWUFDcUIsYUFDbkI7QUFDRCxTQUFLLFVBQVUsSUFBSSxXQUFXLGVBQWUsSUFBSTtBQUNqRCxTQUFLLCtCQUErQixJQUFJLFFBQW9CO0FBQUEsRUFDN0Q7QUFBQSxFQUVBLElBQVcsbUJBQStCO0FBQ3pDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLG9CQUFvQixNQUFvQjtBQUN2QyxRQUFJO0FBQ0osWUFBUSxNQUFNO0FBQUEsTUFDYixLQUFLO0FBQVMsZUFBTyxlQUFlO0FBQU87QUFBQSxNQUMzQyxLQUFLO0FBQVUsZUFBTyxlQUFlO0FBQWM7QUFBQSxNQUNuRCxLQUFLO0FBQVcsZUFBTyxlQUFlO0FBQW1CO0FBQUEsTUFDekQ7QUFDQyxlQUFPLGVBQWU7QUFBQSxJQUN4QjtBQUNBLFNBQUssVUFBVSxJQUFJLFdBQVcsSUFBSTtBQUNsQyxTQUFLLDZCQUE2QixLQUFLLEtBQUssT0FBTztBQUFBLEVBQ3BEO0FBQUEsRUFFQSxJQUFXLDhCQUFpRDtBQUMzRCxXQUFPLEtBQUssNkJBQTZCO0FBQUEsRUFDMUM7QUFDRDtBQWxDYSxpQkFBTjtBQUFBLEVBUUo7QUFBQSxHQVJVOyIsCiAgIm5hbWVzIjogW10KfQo=
