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
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
let NativeGitHubUploadService = class extends Disposable {
  constructor(logService, nativeHostService) {
    super();
    this.logService = logService;
    this.nativeHostService = nativeHostService;
  }
  async resolveRepositoryId(owner, repo, token) {
    const headers = { "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`Repo ID lookup failed for ${owner}/${repo}: ${r.status} ${r.statusText}${body ? ` \u2014 ${body.substring(0, 300)}` : ""}`);
    }
    const json = await r.json();
    return String(json.id);
  }
  async uploadViaMobileApi(token, repoId, files) {
    const results = [];
    for (const file of files) {
      const result = await this.nativeHostService.uploadFileViaMobileApi(
        token,
        repoId,
        file.name,
        VSBuffer.wrap(file.bytes),
        file.contentType
      );
      this.logService.info(`[GitHubUpload] Uploaded ${file.name} (${file.bytes.length} bytes) -> ${result.assetUrl}`);
      results.push(result);
    }
    return results;
  }
};
NativeGitHubUploadService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, INativeHostService)
], NativeGitHubUploadService);
export {
  NativeGitHubUploadService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lzc3VlL2VsZWN0cm9uLWJyb3dzZXIvbmF0aXZlR2l0SHViVXBsb2FkU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJR2l0SHViVXBsb2FkUmVzdWx0LCBJR2l0SHViVXBsb2FkU2VydmljZSB9IGZyb20gJy4uL2Jyb3dzZXIvZ2l0aHViVXBsb2FkU2VydmljZS5qcyc7XG5cbi8qKlxuICogR2l0SHViIHVwbG9hZCBzZXJ2aWNlIHVzaW5nIHRoZSBNb2JpbGUgVXBsb2FkIEFQSS5cbiAqXG4gKiBVcGxvYWRzIGZpbGVzIHZpYSB0aGUgbWFpbiBwcm9jZXNzIChFbGVjdHJvbiBuZXQuZmV0Y2gpIHRvIGJ5cGFzcyBDT1JTLlxuICovXG5leHBvcnQgY2xhc3MgTmF0aXZlR2l0SHViVXBsb2FkU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJR2l0SHViVXBsb2FkU2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBuYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVJlcG9zaXRvcnlJZChvd25lcjogc3RyaW5nLCByZXBvOiBzdHJpbmcsIHRva2VuPzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0geyAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL3ZuZC5naXRodWIranNvbicsICdYLUdpdEh1Yi1BcGktVmVyc2lvbic6ICcyMDIyLTExLTI4JyB9O1xuXHRcdGlmICh0b2tlbikge1xuXHRcdFx0aGVhZGVyc1snQXV0aG9yaXphdGlvbiddID0gYEJlYXJlciAke3Rva2VufWA7XG5cdFx0fVxuXHRcdGNvbnN0IHIgPSBhd2FpdCBmZXRjaChgaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy8ke2VuY29kZVVSSUNvbXBvbmVudChvd25lcil9LyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlcG8pfWAsIHsgaGVhZGVycyB9KTtcblx0XHRpZiAoIXIub2spIHtcblx0XHRcdGNvbnN0IGJvZHkgPSBhd2FpdCByLnRleHQoKS5jYXRjaCgoKSA9PiAnJyk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFJlcG8gSUQgbG9va3VwIGZhaWxlZCBmb3IgJHtvd25lcn0vJHtyZXBvfTogJHtyLnN0YXR1c30gJHtyLnN0YXR1c1RleHR9JHtib2R5ID8gYCBcdTIwMTQgJHtib2R5LnN1YnN0cmluZygwLCAzMDApfWAgOiAnJ31gKTtcblx0XHR9XG5cdFx0Y29uc3QganNvbiA9IGF3YWl0IHIuanNvbigpO1xuXHRcdHJldHVybiBTdHJpbmcoanNvbi5pZCk7XG5cdH1cblxuXHRhc3luYyB1cGxvYWRWaWFNb2JpbGVBcGkodG9rZW46IHN0cmluZywgcmVwb0lkOiBzdHJpbmcsIGZpbGVzOiB7IG5hbWU6IHN0cmluZzsgYnl0ZXM6IFVpbnQ4QXJyYXk7IGNvbnRlbnRUeXBlOiBzdHJpbmcgfVtdKTogUHJvbWlzZTxJR2l0SHViVXBsb2FkUmVzdWx0W10+IHtcblx0XHRjb25zdCByZXN1bHRzOiBJR2l0SHViVXBsb2FkUmVzdWx0W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMubmF0aXZlSG9zdFNlcnZpY2UudXBsb2FkRmlsZVZpYU1vYmlsZUFwaShcblx0XHRcdFx0dG9rZW4sIHJlcG9JZCwgZmlsZS5uYW1lLCBWU0J1ZmZlci53cmFwKGZpbGUuYnl0ZXMpLCBmaWxlLmNvbnRlbnRUeXBlXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFtHaXRIdWJVcGxvYWRdIFVwbG9hZGVkICR7ZmlsZS5uYW1lfSAoJHtmaWxlLmJ5dGVzLmxlbmd0aH0gYnl0ZXMpIC0+ICR7cmVzdWx0LmFzc2V0VXJsfWApO1xuXHRcdFx0cmVzdWx0cy5wdXNoKHJlc3VsdCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHRzO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMEJBQTBCO0FBUTVCLElBQU0sNEJBQU4sY0FBd0MsV0FBMkM7QUFBQSxFQUl6RixZQUMrQixZQUNPLG1CQUNwQztBQUNELFVBQU07QUFId0I7QUFDTztBQUFBLEVBR3RDO0FBQUEsRUFFQSxNQUFNLG9CQUFvQixPQUFlLE1BQWMsT0FBaUM7QUFDdkYsVUFBTSxVQUFrQyxFQUFFLFVBQVUsK0JBQStCLHdCQUF3QixhQUFhO0FBQ3hILFFBQUksT0FBTztBQUNWLGNBQVEsZUFBZSxJQUFJLFVBQVUsS0FBSztBQUFBLElBQzNDO0FBQ0EsVUFBTSxJQUFJLE1BQU0sTUFBTSxnQ0FBZ0MsbUJBQW1CLEtBQUssQ0FBQyxJQUFJLG1CQUFtQixJQUFJLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQztBQUMxSCxRQUFJLENBQUMsRUFBRSxJQUFJO0FBQ1YsWUFBTSxPQUFPLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxNQUFNLEVBQUU7QUFDMUMsWUFBTSxJQUFJLE1BQU0sNkJBQTZCLEtBQUssSUFBSSxJQUFJLEtBQUssRUFBRSxNQUFNLElBQUksRUFBRSxVQUFVLEdBQUcsT0FBTyxXQUFNLEtBQUssVUFBVSxHQUFHLEdBQUcsQ0FBQyxLQUFLLEVBQUUsRUFBRTtBQUFBLElBQ3ZJO0FBQ0EsVUFBTSxPQUFPLE1BQU0sRUFBRSxLQUFLO0FBQzFCLFdBQU8sT0FBTyxLQUFLLEVBQUU7QUFBQSxFQUN0QjtBQUFBLEVBRUEsTUFBTSxtQkFBbUIsT0FBZSxRQUFnQixPQUFtRztBQUMxSixVQUFNLFVBQWlDLENBQUM7QUFDeEMsZUFBVyxRQUFRLE9BQU87QUFDekIsWUFBTSxTQUFTLE1BQU0sS0FBSyxrQkFBa0I7QUFBQSxRQUMzQztBQUFBLFFBQU87QUFBQSxRQUFRLEtBQUs7QUFBQSxRQUFNLFNBQVMsS0FBSyxLQUFLLEtBQUs7QUFBQSxRQUFHLEtBQUs7QUFBQSxNQUMzRDtBQUNBLFdBQUssV0FBVyxLQUFLLDJCQUEyQixLQUFLLElBQUksS0FBSyxLQUFLLE1BQU0sTUFBTSxjQUFjLE9BQU8sUUFBUSxFQUFFO0FBQzlHLGNBQVEsS0FBSyxNQUFNO0FBQUEsSUFDcEI7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBcENhLDRCQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxHQU5VOyIsCiAgIm5hbWVzIjogW10KfQo=
