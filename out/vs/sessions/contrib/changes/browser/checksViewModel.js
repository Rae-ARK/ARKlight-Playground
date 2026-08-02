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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { derived } from "../../../../base/common/observable.js";
import { IGitHubService } from "../../github/browser/githubService.js";
let ChecksViewModel = class extends Disposable {
  constructor(gitHubService) {
    super();
    this.checksObs = derived(this, (reader) => {
      return gitHubService.activeSessionPullRequestCIObs.read(reader);
    });
  }
};
ChecksViewModel = __decorateClass([
  __decorateParam(0, IGitHubService)
], ChecksViewModel);
export {
  ChecksViewModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhbmdlcy9icm93c2VyL2NoZWNrc1ZpZXdNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGVyaXZlZCwgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElHaXRIdWJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZ2l0aHViL2Jyb3dzZXIvZ2l0aHViU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHaXRIdWJQdWxsUmVxdWVzdENJTW9kZWwgfSBmcm9tICcuLi8uLi9naXRodWIvYnJvd3Nlci9tb2RlbHMvZ2l0aHViUHVsbFJlcXVlc3RDSU1vZGVsLmpzJztcblxuZXhwb3J0IGNsYXNzIENoZWNrc1ZpZXdNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyZWFkb25seSBjaGVja3NPYnM6IElPYnNlcnZhYmxlPEdpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbCB8IHVuZGVmaW5lZD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElHaXRIdWJTZXJ2aWNlIGdpdEh1YlNlcnZpY2U6IElHaXRIdWJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5jaGVja3NPYnMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gZ2l0SHViU2VydmljZS5hY3RpdmVTZXNzaW9uUHVsbFJlcXVlc3RDSU9icy5yZWFkKHJlYWRlcik7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUE0QjtBQUNyQyxTQUFTLHNCQUFzQjtBQUd4QixJQUFNLGtCQUFOLGNBQThCLFdBQVc7QUFBQSxFQUcvQyxZQUNpQixlQUNmO0FBQ0QsVUFBTTtBQUVOLFNBQUssWUFBWSxRQUFRLE1BQU0sWUFBVTtBQUN4QyxhQUFPLGNBQWMsOEJBQThCLEtBQUssTUFBTTtBQUFBLElBQy9ELENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFaYSxrQkFBTjtBQUFBLEVBSUo7QUFBQSxHQUpVOyIsCiAgIm5hbWVzIjogW10KfQo=
