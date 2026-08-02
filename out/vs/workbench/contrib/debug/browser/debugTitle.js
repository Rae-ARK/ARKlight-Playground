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
import { IDebugService, State } from "../common/debug.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { ITitleService } from "../../../services/title/browser/titleService.js";
let DebugTitleContribution = class {
  constructor(debugService, hostService, titleService) {
    this.toDispose = [];
    const updateTitle = () => {
      if (debugService.state === State.Stopped && !hostService.hasFocus) {
        titleService.updateProperties({ prefix: "\u{1F534}" });
      } else {
        titleService.updateProperties({ prefix: "" });
      }
    };
    this.toDispose.push(debugService.onDidChangeState(updateTitle));
    this.toDispose.push(hostService.onDidChangeFocus(updateTitle));
  }
  dispose() {
    dispose(this.toDispose);
  }
};
DebugTitleContribution = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, IHostService),
  __decorateParam(2, ITitleService)
], DebugTitleContribution);
export {
  DebugTitleContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdUaXRsZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRGVidWdTZXJ2aWNlLCBTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBkaXNwb3NlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJVGl0bGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGl0bGUvYnJvd3Nlci90aXRsZVNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgRGVidWdUaXRsZUNvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgdG9EaXNwb3NlOiBJRGlzcG9zYWJsZVtdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElEZWJ1Z1NlcnZpY2UgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVRpdGxlU2VydmljZSB0aXRsZVNlcnZpY2U6IElUaXRsZVNlcnZpY2Vcblx0KSB7XG5cdFx0Y29uc3QgdXBkYXRlVGl0bGUgPSAoKSA9PiB7XG5cdFx0XHRpZiAoZGVidWdTZXJ2aWNlLnN0YXRlID09PSBTdGF0ZS5TdG9wcGVkICYmICFob3N0U2VydmljZS5oYXNGb2N1cykge1xuXHRcdFx0XHR0aXRsZVNlcnZpY2UudXBkYXRlUHJvcGVydGllcyh7IHByZWZpeDogJ1x1RDgzRFx1REQzNCcgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aXRsZVNlcnZpY2UudXBkYXRlUHJvcGVydGllcyh7IHByZWZpeDogJycgfSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKGRlYnVnU2VydmljZS5vbkRpZENoYW5nZVN0YXRlKHVwZGF0ZVRpdGxlKSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaChob3N0U2VydmljZS5vbkRpZENoYW5nZUZvY3VzKHVwZGF0ZVRpdGxlKSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGhpcy50b0Rpc3Bvc2UpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZUFBZSxhQUFhO0FBQ3JDLFNBQVMsZUFBNEI7QUFDckMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBcUI7QUFFdkIsSUFBTSx5QkFBTixNQUErRDtBQUFBLEVBSXJFLFlBQ2dCLGNBQ0QsYUFDQyxjQUNkO0FBTkYsU0FBUSxZQUEyQixDQUFDO0FBT25DLFVBQU0sY0FBYyxNQUFNO0FBQ3pCLFVBQUksYUFBYSxVQUFVLE1BQU0sV0FBVyxDQUFDLFlBQVksVUFBVTtBQUNsRSxxQkFBYSxpQkFBaUIsRUFBRSxRQUFRLFlBQUssQ0FBQztBQUFBLE1BQy9DLE9BQU87QUFDTixxQkFBYSxpQkFBaUIsRUFBRSxRQUFRLEdBQUcsQ0FBQztBQUFBLE1BQzdDO0FBQUEsSUFDRDtBQUNBLFNBQUssVUFBVSxLQUFLLGFBQWEsaUJBQWlCLFdBQVcsQ0FBQztBQUM5RCxTQUFLLFVBQVUsS0FBSyxZQUFZLGlCQUFpQixXQUFXLENBQUM7QUFBQSxFQUM5RDtBQUFBLEVBRUEsVUFBZ0I7QUFDZixZQUFRLEtBQUssU0FBUztBQUFBLEVBQ3ZCO0FBQ0Q7QUF2QmEseUJBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
