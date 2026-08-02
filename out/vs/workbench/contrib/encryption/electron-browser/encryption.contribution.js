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
import { isLinux } from "../../../../base/common/platform.js";
import { parse } from "../../../../base/common/jsonc.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { IJSONEditingService } from "../../../services/configuration/common/jsonEditing.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
let EncryptionContribution = class {
  constructor(jsonEditingService, environmentService, fileService, storageService) {
    this.jsonEditingService = jsonEditingService;
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.storageService = storageService;
    this.migrateToGnomeLibsecret();
  }
  /**
   * Migrate the user from using the gnome or gnome-keyring password-store to gnome-libsecret.
   * TODO@TylerLeonhardt: This migration can be removed in 3 months or so and then storage
   * can be cleaned up.
   */
  async migrateToGnomeLibsecret() {
    if (!isLinux || this.storageService.getBoolean("encryption.migratedToGnomeLibsecret", StorageScope.APPLICATION, false)) {
      return;
    }
    try {
      const content = await this.fileService.readFile(this.environmentService.argvResource);
      const argv = parse(content.value.toString());
      if (argv["password-store"] === "gnome" || argv["password-store"] === "gnome-keyring") {
        this.jsonEditingService.write(this.environmentService.argvResource, [{ path: ["password-store"], value: "gnome-libsecret" }], true);
      }
      this.storageService.store("encryption.migratedToGnomeLibsecret", true, StorageScope.APPLICATION, StorageTarget.USER);
    } catch (error) {
      console.error(error);
    }
  }
};
EncryptionContribution = __decorateClass([
  __decorateParam(0, IJSONEditingService),
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IStorageService)
], EncryptionContribution);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(EncryptionContribution, LifecyclePhase.Eventually);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2VuY3J5cHRpb24vZWxlY3Ryb24tYnJvd3Nlci9lbmNyeXB0aW9uLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzTGludXggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25jLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSlNPTkVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvbi9jb21tb24vanNvbkVkaXRpbmcuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbmNsYXNzIEVuY3J5cHRpb25Db250cmlidXRpb24gaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElKU09ORWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBqc29uRWRpdGluZ1NlcnZpY2U6IElKU09ORWRpdGluZ1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5taWdyYXRlVG9Hbm9tZUxpYnNlY3JldCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1pZ3JhdGUgdGhlIHVzZXIgZnJvbSB1c2luZyB0aGUgZ25vbWUgb3IgZ25vbWUta2V5cmluZyBwYXNzd29yZC1zdG9yZSB0byBnbm9tZS1saWJzZWNyZXQuXG5cdCAqIFRPRE9AVHlsZXJMZW9uaGFyZHQ6IFRoaXMgbWlncmF0aW9uIGNhbiBiZSByZW1vdmVkIGluIDMgbW9udGhzIG9yIHNvIGFuZCB0aGVuIHN0b3JhZ2Vcblx0ICogY2FuIGJlIGNsZWFuZWQgdXAuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIG1pZ3JhdGVUb0dub21lTGlic2VjcmV0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghaXNMaW51eCB8fCB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ2VuY3J5cHRpb24ubWlncmF0ZWRUb0dub21lTGlic2VjcmV0JywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3ZSZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBhcmd2ID0gcGFyc2U8eyAncGFzc3dvcmQtc3RvcmUnPzogc3RyaW5nIH0+KGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoYXJndlsncGFzc3dvcmQtc3RvcmUnXSA9PT0gJ2dub21lJyB8fCBhcmd2WydwYXNzd29yZC1zdG9yZSddID09PSAnZ25vbWUta2V5cmluZycpIHtcblx0XHRcdFx0dGhpcy5qc29uRWRpdGluZ1NlcnZpY2Uud3JpdGUodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYXJndlJlc291cmNlLCBbeyBwYXRoOiBbJ3Bhc3N3b3JkLXN0b3JlJ10sIHZhbHVlOiAnZ25vbWUtbGlic2VjcmV0JyB9XSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdlbmNyeXB0aW9uLm1pZ3JhdGVkVG9Hbm9tZUxpYnNlY3JldCcsIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29uc29sZS5lcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihFbmNyeXB0aW9uQ29udHJpYnV0aW9uLCBMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYTtBQUN0QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFrRSxjQUFjLDJCQUEyQjtBQUMzRyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNCQUFzQjtBQUUvQixJQUFNLHlCQUFOLE1BQStEO0FBQUEsRUFDOUQsWUFDdUMsb0JBQ0Esb0JBQ1AsYUFDRyxnQkFDakM7QUFKcUM7QUFDQTtBQUNQO0FBQ0c7QUFFbEMsU0FBSyx3QkFBd0I7QUFBQSxFQUM5QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLE1BQWMsMEJBQXlDO0FBQ3RELFFBQUksQ0FBQyxXQUFXLEtBQUssZUFBZSxXQUFXLHVDQUF1QyxhQUFhLGFBQWEsS0FBSyxHQUFHO0FBQ3ZIO0FBQUEsSUFDRDtBQUNBLFFBQUk7QUFDSCxZQUFNLFVBQVUsTUFBTSxLQUFLLFlBQVksU0FBUyxLQUFLLG1CQUFtQixZQUFZO0FBQ3BGLFlBQU0sT0FBTyxNQUFxQyxRQUFRLE1BQU0sU0FBUyxDQUFDO0FBQzFFLFVBQUksS0FBSyxnQkFBZ0IsTUFBTSxXQUFXLEtBQUssZ0JBQWdCLE1BQU0saUJBQWlCO0FBQ3JGLGFBQUssbUJBQW1CLE1BQU0sS0FBSyxtQkFBbUIsY0FBYyxDQUFDLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixHQUFHLE9BQU8sa0JBQWtCLENBQUMsR0FBRyxJQUFJO0FBQUEsTUFDbkk7QUFDQSxXQUFLLGVBQWUsTUFBTSx1Q0FBdUMsTUFBTSxhQUFhLGFBQWEsY0FBYyxJQUFJO0FBQUEsSUFDcEgsU0FBUyxPQUFPO0FBQ2YsY0FBUSxNQUFNLEtBQUs7QUFBQSxJQUNwQjtBQUFBLEVBQ0Q7QUFDRDtBQTlCTSx5QkFBTjtBQUFBLEVBRUc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQUxHO0FBZ0NOLFNBQVMsR0FBb0Msb0JBQW9CLFNBQVMsRUFBRSw4QkFBOEIsd0JBQXdCLGVBQWUsVUFBVTsiLAogICJuYW1lcyI6IFtdCn0K
