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
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { computeDiff } from "../../../../notebook/common/notebookDiff.js";
import { INotebookEditorModelResolverService } from "../../../../notebook/common/notebookEditorModelResolverService.js";
import { INotebookLoggingService } from "../../../../notebook/common/notebookLoggingService.js";
import { INotebookEditorWorkerService } from "../../../../notebook/common/services/notebookWorkerService.js";
let ChatEditingModifiedNotebookDiff = class {
  constructor(original, modified, notebookEditorWorkerService, notebookLoggingService, notebookEditorModelService) {
    this.original = original;
    this.modified = modified;
    this.notebookEditorWorkerService = notebookEditorWorkerService;
    this.notebookLoggingService = notebookLoggingService;
    this.notebookEditorModelService = notebookEditorModelService;
  }
  async computeDiff() {
    let added = 0;
    let removed = 0;
    const disposables = new DisposableStore();
    try {
      const [modifiedRef, originalRef] = await Promise.all([
        this.notebookEditorModelService.resolve(this.modified.snapshotUri),
        this.notebookEditorModelService.resolve(this.original.snapshotUri)
      ]);
      disposables.add(modifiedRef);
      disposables.add(originalRef);
      const notebookDiff = await this.notebookEditorWorkerService.computeDiff(this.original.snapshotUri, this.modified.snapshotUri);
      const result = computeDiff(originalRef.object.notebook, modifiedRef.object.notebook, notebookDiff);
      result.cellDiffInfo.forEach((diff) => {
        switch (diff.type) {
          case "modified":
          case "insert":
            added++;
            break;
          case "delete":
            removed++;
            break;
          default:
            break;
        }
      });
    } catch (e) {
      this.notebookLoggingService.error("Notebook Chat", "Error computing diff:\n" + e);
    } finally {
      disposables.dispose();
    }
    return {
      added,
      removed,
      identical: added === 0 && removed === 0,
      quitEarly: false,
      isFinal: true,
      modifiedURI: this.modified.snapshotUri,
      originalURI: this.original.snapshotUri,
      isBusy: false
    };
  }
};
ChatEditingModifiedNotebookDiff.NewModelCounter = 0;
ChatEditingModifiedNotebookDiff = __decorateClass([
  __decorateParam(2, INotebookEditorWorkerService),
  __decorateParam(3, INotebookLoggingService),
  __decorateParam(4, INotebookEditorModelResolverService)
], ChatEditingModifiedNotebookDiff);
export {
  ChatEditingModifiedNotebookDiff
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9ub3RlYm9vay9jaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tEaWZmLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbXB1dGVEaWZmIH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rRGlmZi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rTG9nZ2luZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9zZXJ2aWNlcy9ub3RlYm9va1dvcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRTZXNzaW9uRW50cnlEaWZmLCBJU25hcHNob3RFbnRyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5cblxuZXhwb3J0IGNsYXNzIENoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0RpZmYge1xuXHRzdGF0aWMgTmV3TW9kZWxDb3VudGVyOiBudW1iZXIgPSAwO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9yaWdpbmFsOiBJU25hcHNob3RFbnRyeSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1vZGlmaWVkOiBJU25hcHNob3RFbnRyeSxcblx0XHRASU5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZTogSU5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSxcblx0XHRASU5vdGVib29rTG9nZ2luZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va0xvZ2dpbmdTZXJ2aWNlOiBJTm90ZWJvb2tMb2dnaW5nU2VydmljZSxcblx0XHRASU5vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va0VkaXRvck1vZGVsU2VydmljZTogSU5vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UsXG5cdCkge1xuXG5cdH1cblxuXHRhc3luYyBjb21wdXRlRGlmZigpOiBQcm9taXNlPElFZGl0U2Vzc2lvbkVudHJ5RGlmZj4ge1xuXG5cdFx0bGV0IGFkZGVkID0gMDtcblx0XHRsZXQgcmVtb3ZlZCA9IDA7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgW21vZGlmaWVkUmVmLCBvcmlnaW5hbFJlZl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHRoaXMubm90ZWJvb2tFZGl0b3JNb2RlbFNlcnZpY2UucmVzb2x2ZSh0aGlzLm1vZGlmaWVkLnNuYXBzaG90VXJpKSxcblx0XHRcdFx0dGhpcy5ub3RlYm9va0VkaXRvck1vZGVsU2VydmljZS5yZXNvbHZlKHRoaXMub3JpZ2luYWwuc25hcHNob3RVcmkpXG5cdFx0XHRdKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtb2RpZmllZFJlZik7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQob3JpZ2luYWxSZWYpO1xuXHRcdFx0Y29uc3Qgbm90ZWJvb2tEaWZmID0gYXdhaXQgdGhpcy5ub3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2UuY29tcHV0ZURpZmYodGhpcy5vcmlnaW5hbC5zbmFwc2hvdFVyaSwgdGhpcy5tb2RpZmllZC5zbmFwc2hvdFVyaSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlRGlmZihvcmlnaW5hbFJlZi5vYmplY3Qubm90ZWJvb2ssIG1vZGlmaWVkUmVmLm9iamVjdC5ub3RlYm9vaywgbm90ZWJvb2tEaWZmKTtcblx0XHRcdHJlc3VsdC5jZWxsRGlmZkluZm8uZm9yRWFjaChkaWZmID0+IHtcblx0XHRcdFx0c3dpdGNoIChkaWZmLnR5cGUpIHtcblx0XHRcdFx0XHRjYXNlICdtb2RpZmllZCc6XG5cdFx0XHRcdFx0Y2FzZSAnaW5zZXJ0Jzpcblx0XHRcdFx0XHRcdGFkZGVkKys7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdkZWxldGUnOlxuXHRcdFx0XHRcdFx0cmVtb3ZlZCsrO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLm5vdGVib29rTG9nZ2luZ1NlcnZpY2UuZXJyb3IoJ05vdGVib29rIENoYXQnLCAnRXJyb3IgY29tcHV0aW5nIGRpZmY6XFxuJyArIGUpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGFkZGVkLFxuXHRcdFx0cmVtb3ZlZCxcblx0XHRcdGlkZW50aWNhbDogYWRkZWQgPT09IDAgJiYgcmVtb3ZlZCA9PT0gMCxcblx0XHRcdHF1aXRFYXJseTogZmFsc2UsXG5cdFx0XHRpc0ZpbmFsOiB0cnVlLFxuXHRcdFx0bW9kaWZpZWRVUkk6IHRoaXMubW9kaWZpZWQuc25hcHNob3RVcmksXG5cdFx0XHRvcmlnaW5hbFVSSTogdGhpcy5vcmlnaW5hbC5zbmFwc2hvdFVyaSxcblx0XHRcdGlzQnVzeTogZmFsc2UsXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDJDQUEyQztBQUNwRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG9DQUFvQztBQUl0QyxJQUFNLGtDQUFOLE1BQXNDO0FBQUEsRUFFNUMsWUFDa0IsVUFDQSxVQUM4Qiw2QkFDTCx3QkFDWSw0QkFDckQ7QUFMZ0I7QUFDQTtBQUM4QjtBQUNMO0FBQ1k7QUFBQSxFQUd2RDtBQUFBLEVBRUEsTUFBTSxjQUE4QztBQUVuRCxRQUFJLFFBQVE7QUFDWixRQUFJLFVBQVU7QUFFZCxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsUUFBSTtBQUNILFlBQU0sQ0FBQyxhQUFhLFdBQVcsSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLFFBQ3BELEtBQUssMkJBQTJCLFFBQVEsS0FBSyxTQUFTLFdBQVc7QUFBQSxRQUNqRSxLQUFLLDJCQUEyQixRQUFRLEtBQUssU0FBUyxXQUFXO0FBQUEsTUFDbEUsQ0FBQztBQUNELGtCQUFZLElBQUksV0FBVztBQUMzQixrQkFBWSxJQUFJLFdBQVc7QUFDM0IsWUFBTSxlQUFlLE1BQU0sS0FBSyw0QkFBNEIsWUFBWSxLQUFLLFNBQVMsYUFBYSxLQUFLLFNBQVMsV0FBVztBQUM1SCxZQUFNLFNBQVMsWUFBWSxZQUFZLE9BQU8sVUFBVSxZQUFZLE9BQU8sVUFBVSxZQUFZO0FBQ2pHLGFBQU8sYUFBYSxRQUFRLFVBQVE7QUFDbkMsZ0JBQVEsS0FBSyxNQUFNO0FBQUEsVUFDbEIsS0FBSztBQUFBLFVBQ0wsS0FBSztBQUNKO0FBQ0E7QUFBQSxVQUNELEtBQUs7QUFDSjtBQUNBO0FBQUEsVUFDRDtBQUNDO0FBQUEsUUFDRjtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsU0FBUyxHQUFHO0FBQ1gsV0FBSyx1QkFBdUIsTUFBTSxpQkFBaUIsNEJBQTRCLENBQUM7QUFBQSxJQUNqRixVQUFFO0FBQ0Qsa0JBQVksUUFBUTtBQUFBLElBQ3JCO0FBRUEsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQSxXQUFXLFVBQVUsS0FBSyxZQUFZO0FBQUEsTUFDdEMsV0FBVztBQUFBLE1BQ1gsU0FBUztBQUFBLE1BQ1QsYUFBYSxLQUFLLFNBQVM7QUFBQSxNQUMzQixhQUFhLEtBQUssU0FBUztBQUFBLE1BQzNCLFFBQVE7QUFBQSxJQUNUO0FBQUEsRUFDRDtBQUNEO0FBekRhLGdDQUNMLGtCQUEwQjtBQURyQixrQ0FBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
