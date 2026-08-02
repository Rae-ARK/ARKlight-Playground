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
import { Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isWeb } from "../../../../base/common/platform.js";
import { isEqual } from "../../../../base/common/resources.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IUserDataAutoSyncService } from "../../../../platform/userDataSync/common/userDataSync.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { VIEWLET_ID } from "../../extensions/common/extensions.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { KeybindingsEditorInput } from "../../../services/preferences/browser/keybindingsEditorInput.js";
import { SettingsEditor2Input } from "../../../services/preferences/common/preferencesEditorInput.js";
let UserDataSyncTrigger = class extends Disposable {
  constructor(editorService, userDataProfilesService, viewsService, userDataAutoSyncService, hostService) {
    super();
    this.userDataProfilesService = userDataProfilesService;
    const event = Event.filter(
      Event.any(
        Event.map(editorService.onDidActiveEditorChange, () => this.getUserDataEditorInputSource(editorService.activeEditor)),
        Event.map(Event.filter(viewsService.onDidChangeViewContainerVisibility, (e) => e.id === VIEWLET_ID && e.visible), (e) => e.id)
      ),
      (source) => source !== void 0
    );
    if (isWeb) {
      this._register(Event.debounce(
        Event.any(
          Event.map(hostService.onDidChangeFocus, () => "windowFocus"),
          Event.map(event, (source) => source)
        ),
        (last, source) => last ? [...last, source] : [source],
        1e3
      )((sources) => userDataAutoSyncService.triggerSync(sources, { skipIfSyncedRecently: true })));
    } else {
      this._register(event((source) => userDataAutoSyncService.triggerSync([source], { skipIfSyncedRecently: true })));
    }
  }
  getUserDataEditorInputSource(editorInput) {
    if (!editorInput) {
      return void 0;
    }
    if (editorInput instanceof SettingsEditor2Input) {
      return "settingsEditor";
    }
    if (editorInput instanceof KeybindingsEditorInput) {
      return "keybindingsEditor";
    }
    const resource = editorInput.resource;
    if (isEqual(resource, this.userDataProfilesService.defaultProfile.settingsResource)) {
      return "settingsEditor";
    }
    if (isEqual(resource, this.userDataProfilesService.defaultProfile.keybindingsResource)) {
      return "keybindingsEditor";
    }
    return void 0;
  }
};
UserDataSyncTrigger = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IViewsService),
  __decorateParam(3, IUserDataAutoSyncService),
  __decorateParam(4, IHostService)
], UserDataSyncTrigger);
export {
  UserDataSyncTrigger
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3VzZXJEYXRhU3luYy9icm93c2VyL3VzZXJEYXRhU3luY1RyaWdnZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVklFV0xFVF9JRCB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2Jyb3dzZXIva2V5YmluZGluZ3NFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTZXR0aW5nc0VkaXRvcjJJbnB1dCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlc0VkaXRvcklucHV0LmpzJztcblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhU3luY1RyaWdnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlIHVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlOiBJVXNlckRhdGFBdXRvU3luY1NlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IGV2ZW50ID0gRXZlbnQuZmlsdGVyKFxuXHRcdFx0RXZlbnQuYW55PHN0cmluZyB8IHVuZGVmaW5lZD4oXG5cdFx0XHRcdEV2ZW50Lm1hcChlZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLCAoKSA9PiB0aGlzLmdldFVzZXJEYXRhRWRpdG9ySW5wdXRTb3VyY2UoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IpKSxcblx0XHRcdFx0RXZlbnQubWFwKEV2ZW50LmZpbHRlcih2aWV3c1NlcnZpY2Uub25EaWRDaGFuZ2VWaWV3Q29udGFpbmVyVmlzaWJpbGl0eSwgZSA9PiBlLmlkID09PSBWSUVXTEVUX0lEICYmIGUudmlzaWJsZSksIGUgPT4gZS5pZClcblx0XHRcdCksIHNvdXJjZSA9PiBzb3VyY2UgIT09IHVuZGVmaW5lZCk7XG5cdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5kZWJvdW5jZTxzdHJpbmcsIHN0cmluZ1tdPihcblx0XHRcdFx0RXZlbnQuYW55PHN0cmluZz4oXG5cdFx0XHRcdFx0RXZlbnQubWFwKGhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXMsICgpID0+ICd3aW5kb3dGb2N1cycpLFxuXHRcdFx0XHRcdEV2ZW50Lm1hcChldmVudCwgc291cmNlID0+IHNvdXJjZSEpLFxuXHRcdFx0XHQpLCAobGFzdCwgc291cmNlKSA9PiBsYXN0ID8gWy4uLmxhc3QsIHNvdXJjZV0gOiBbc291cmNlXSwgMTAwMClcblx0XHRcdFx0KHNvdXJjZXMgPT4gdXNlckRhdGFBdXRvU3luY1NlcnZpY2UudHJpZ2dlclN5bmMoc291cmNlcywgeyBza2lwSWZTeW5jZWRSZWNlbnRseTogdHJ1ZSB9KSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihldmVudChzb3VyY2UgPT4gdXNlckRhdGFBdXRvU3luY1NlcnZpY2UudHJpZ2dlclN5bmMoW3NvdXJjZSFdLCB7IHNraXBJZlN5bmNlZFJlY2VudGx5OiB0cnVlIH0pKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRVc2VyRGF0YUVkaXRvcklucHV0U291cmNlKGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFlZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGVkaXRvcklucHV0IGluc3RhbmNlb2YgU2V0dGluZ3NFZGl0b3IySW5wdXQpIHtcblx0XHRcdHJldHVybiAnc2V0dGluZ3NFZGl0b3InO1xuXHRcdH1cblx0XHRpZiAoZWRpdG9ySW5wdXQgaW5zdGFuY2VvZiBLZXliaW5kaW5nc0VkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4gJ2tleWJpbmRpbmdzRWRpdG9yJztcblx0XHR9XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBlZGl0b3JJbnB1dC5yZXNvdXJjZTtcblx0XHRpZiAoaXNFcXVhbChyZXNvdXJjZSwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuICdzZXR0aW5nc0VkaXRvcic7XG5cdFx0fVxuXHRcdGlmIChpc0VxdWFsKHJlc291cmNlLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmtleWJpbmRpbmdzUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gJ2tleWJpbmRpbmdzRWRpdG9yJztcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUd6QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDRCQUE0QjtBQUU5QixJQUFNLHNCQUFOLGNBQWtDLFdBQTZDO0FBQUEsRUFFckYsWUFDaUIsZUFDMkIseUJBQzVCLGNBQ1cseUJBQ1osYUFDYjtBQUNELFVBQU07QUFMcUM7QUFNM0MsVUFBTSxRQUFRLE1BQU07QUFBQSxNQUNuQixNQUFNO0FBQUEsUUFDTCxNQUFNLElBQUksY0FBYyx5QkFBeUIsTUFBTSxLQUFLLDZCQUE2QixjQUFjLFlBQVksQ0FBQztBQUFBLFFBQ3BILE1BQU0sSUFBSSxNQUFNLE9BQU8sYUFBYSxvQ0FBb0MsT0FBSyxFQUFFLE9BQU8sY0FBYyxFQUFFLE9BQU8sR0FBRyxPQUFLLEVBQUUsRUFBRTtBQUFBLE1BQzFIO0FBQUEsTUFBRyxZQUFVLFdBQVc7QUFBQSxJQUFTO0FBQ2xDLFFBQUksT0FBTztBQUNWLFdBQUssVUFBVSxNQUFNO0FBQUEsUUFDcEIsTUFBTTtBQUFBLFVBQ0wsTUFBTSxJQUFJLFlBQVksa0JBQWtCLE1BQU0sYUFBYTtBQUFBLFVBQzNELE1BQU0sSUFBSSxPQUFPLFlBQVUsTUFBTztBQUFBLFFBQ25DO0FBQUEsUUFBRyxDQUFDLE1BQU0sV0FBVyxPQUFPLENBQUMsR0FBRyxNQUFNLE1BQU0sSUFBSSxDQUFDLE1BQU07QUFBQSxRQUFHO0FBQUEsTUFBSSxFQUM3RCxhQUFXLHdCQUF3QixZQUFZLFNBQVMsRUFBRSxzQkFBc0IsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUFBLElBQzNGLE9BQU87QUFDTixXQUFLLFVBQVUsTUFBTSxZQUFVLHdCQUF3QixZQUFZLENBQUMsTUFBTyxHQUFHLEVBQUUsc0JBQXNCLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUMvRztBQUFBLEVBQ0Q7QUFBQSxFQUVRLDZCQUE2QixhQUEwRDtBQUM5RixRQUFJLENBQUMsYUFBYTtBQUNqQixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksdUJBQXVCLHNCQUFzQjtBQUNoRCxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksdUJBQXVCLHdCQUF3QjtBQUNsRCxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sV0FBVyxZQUFZO0FBQzdCLFFBQUksUUFBUSxVQUFVLEtBQUssd0JBQXdCLGVBQWUsZ0JBQWdCLEdBQUc7QUFDcEYsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLFFBQVEsVUFBVSxLQUFLLHdCQUF3QixlQUFlLG1CQUFtQixHQUFHO0FBQ3ZGLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQTlDYSxzQkFBTjtBQUFBLEVBR0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FQVTsiLAogICJuYW1lcyI6IFtdCn0K
