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
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { encodeBase64 } from "../../../../base/common/buffer.js";
let NativeScreenshotService = class {
  constructor(nativeHostService) {
    this.nativeHostService = nativeHostService;
  }
  async captureScreenshot(rect) {
    const buffer = await this.nativeHostService.getScreenshot(rect);
    if (!buffer) {
      return void 0;
    }
    return `data:image/jpeg;base64,${encodeBase64(buffer)}`;
  }
};
NativeScreenshotService = __decorateClass([
  __decorateParam(0, INativeHostService)
], NativeScreenshotService);
export {
  NativeScreenshotService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lzc3VlL2VsZWN0cm9uLWJyb3dzZXIvbmF0aXZlU2NyZWVuc2hvdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJUmVjdGFuZ2xlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSVNjcmVlbnNob3RTZXJ2aWNlIH0gZnJvbSAnLi4vYnJvd3Nlci9zY3JlZW5zaG90U2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbmNvZGVCYXNlNjQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuXG5leHBvcnQgY2xhc3MgTmF0aXZlU2NyZWVuc2hvdFNlcnZpY2UgaW1wbGVtZW50cyBJU2NyZWVuc2hvdFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgY2FwdHVyZVNjcmVlbnNob3QocmVjdD86IElSZWN0YW5nbGUpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IHRoaXMubmF0aXZlSG9zdFNlcnZpY2UuZ2V0U2NyZWVuc2hvdChyZWN0KTtcblx0XHRpZiAoIWJ1ZmZlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gYGRhdGE6aW1hZ2UvanBlZztiYXNlNjQsJHtlbmNvZGVCYXNlNjQoYnVmZmVyKX1gO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsMEJBQTBCO0FBR25DLFNBQVMsb0JBQW9CO0FBRXRCLElBQU0sMEJBQU4sTUFBNEQ7QUFBQSxFQUdsRSxZQUNzQyxtQkFDcEM7QUFEb0M7QUFBQSxFQUNsQztBQUFBLEVBRUosTUFBTSxrQkFBa0IsTUFBZ0Q7QUFDdkUsVUFBTSxTQUFTLE1BQU0sS0FBSyxrQkFBa0IsY0FBYyxJQUFJO0FBQzlELFFBQUksQ0FBQyxRQUFRO0FBQ1osYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLDBCQUEwQixhQUFhLE1BQU0sQ0FBQztBQUFBLEVBQ3REO0FBQ0Q7QUFmYSwwQkFBTjtBQUFBLEVBSUo7QUFBQSxHQUpVOyIsCiAgIm5hbWVzIjogW10KfQo=
