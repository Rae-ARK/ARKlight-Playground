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
import { ProxyChannel } from "../../../base/parts/ipc/common/ipc.js";
import { IMainProcessService } from "../../ipc/common/mainProcessService.js";
let NativeHostService = class {
  constructor(windowId, mainProcessService) {
    this.windowId = windowId;
    return ProxyChannel.toService(mainProcessService.getChannel("nativeHost"), {
      context: windowId,
      properties: (() => {
        const properties = /* @__PURE__ */ new Map();
        properties.set("windowId", windowId);
        return properties;
      })()
    });
  }
};
NativeHostService = __decorateClass([
  __decorateParam(1, IMainProcessService)
], NativeHostService);
export {
  NativeHostService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlSG9zdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBQcm94eUNoYW5uZWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IElNYWluUHJvY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9pcGMvY29tbW9uL21haW5Qcm9jZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuL25hdGl2ZS5qcyc7XG5cbi8vIEB0cy1leHBlY3QtZXJyb3I6IGludGVyZmFjZSBpcyBpbXBsZW1lbnRlZCB2aWEgcHJveHlcbmV4cG9ydCBjbGFzcyBOYXRpdmVIb3N0U2VydmljZSBpbXBsZW1lbnRzIElOYXRpdmVIb3N0U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgd2luZG93SWQ6IG51bWJlcixcblx0XHRASU1haW5Qcm9jZXNzU2VydmljZSBtYWluUHJvY2Vzc1NlcnZpY2U6IElNYWluUHJvY2Vzc1NlcnZpY2Vcblx0KSB7XG5cdFx0cmV0dXJuIFByb3h5Q2hhbm5lbC50b1NlcnZpY2U8SU5hdGl2ZUhvc3RTZXJ2aWNlPihtYWluUHJvY2Vzc1NlcnZpY2UuZ2V0Q2hhbm5lbCgnbmF0aXZlSG9zdCcpLCB7XG5cdFx0XHRjb250ZXh0OiB3aW5kb3dJZCxcblx0XHRcdHByb3BlcnRpZXM6ICgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHByb3BlcnRpZXMgPSBuZXcgTWFwPHN0cmluZywgdW5rbm93bj4oKTtcblx0XHRcdFx0cHJvcGVydGllcy5zZXQoJ3dpbmRvd0lkJywgd2luZG93SWQpO1xuXG5cdFx0XHRcdHJldHVybiBwcm9wZXJ0aWVzO1xuXHRcdFx0fSkoKVxuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJCO0FBSTdCLElBQU0sb0JBQU4sTUFBc0Q7QUFBQSxFQUk1RCxZQUNVLFVBQ1ksb0JBQ3BCO0FBRlE7QUFHVCxXQUFPLGFBQWEsVUFBOEIsbUJBQW1CLFdBQVcsWUFBWSxHQUFHO0FBQUEsTUFDOUYsU0FBUztBQUFBLE1BQ1QsYUFBYSxNQUFNO0FBQ2xCLGNBQU0sYUFBYSxvQkFBSSxJQUFxQjtBQUM1QyxtQkFBVyxJQUFJLFlBQVksUUFBUTtBQUVuQyxlQUFPO0FBQUEsTUFDUixHQUFHO0FBQUEsSUFDSixDQUFDO0FBQUEsRUFDRjtBQUNEO0FBbEJhLG9CQUFOO0FBQUEsRUFNSjtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
