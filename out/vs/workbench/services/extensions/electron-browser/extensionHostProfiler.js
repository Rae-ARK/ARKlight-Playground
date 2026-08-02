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
import { TernarySearchTree } from "../../../../base/common/ternarySearchTree.js";
import { IExtensionService } from "../common/extensions.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { IV8InspectProfilingService } from "../../../../platform/profiling/common/profiling.js";
import { createSingleCallFunction } from "../../../../base/common/functional.js";
let ExtensionHostProfiler = class {
  constructor(_host, _port, _extensionService, _profilingService) {
    this._host = _host;
    this._port = _port;
    this._extensionService = _extensionService;
    this._profilingService = _profilingService;
  }
  async start() {
    const id = await this._profilingService.startProfiling({ host: this._host, port: this._port });
    return {
      stop: createSingleCallFunction(async () => {
        const profile = await this._profilingService.stopProfiling(id);
        await this._extensionService.whenInstalledExtensionsRegistered();
        const extensions = this._extensionService.extensions;
        return this._distill(profile, extensions);
      })
    };
  }
  _distill(profile, extensions) {
    const searchTree = TernarySearchTree.forUris();
    for (const extension of extensions) {
      if (extension.extensionLocation.scheme === Schemas.file) {
        searchTree.set(URI.file(extension.extensionLocation.fsPath), extension);
      }
    }
    const nodes = profile.nodes;
    const idsToNodes = /* @__PURE__ */ new Map();
    const idsToSegmentId = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      idsToNodes.set(node.id, node);
    }
    function visit(node, segmentId) {
      if (!segmentId) {
        switch (node.callFrame.functionName) {
          case "(root)":
            break;
          case "(program)":
            segmentId = "program";
            break;
          case "(garbage collector)":
            segmentId = "gc";
            break;
          default:
            segmentId = "self";
            break;
        }
      } else if (segmentId === "self" && node.callFrame.url) {
        let extension;
        try {
          extension = searchTree.findSubstr(URI.parse(node.callFrame.url));
        } catch {
        }
        if (extension) {
          segmentId = extension.identifier.value;
        }
      }
      idsToSegmentId.set(node.id, segmentId);
      if (node.children) {
        for (const child of node.children) {
          const childNode = idsToNodes.get(child);
          if (childNode) {
            visit(childNode, segmentId);
          }
        }
      }
    }
    visit(nodes[0], null);
    const samples = profile.samples || [];
    const timeDeltas = profile.timeDeltas || [];
    const distilledDeltas = [];
    const distilledIds = [];
    let currSegmentTime = 0;
    let currSegmentId;
    for (let i = 0; i < samples.length; i++) {
      const id = samples[i];
      const segmentId = idsToSegmentId.get(id);
      if (segmentId !== currSegmentId) {
        if (currSegmentId) {
          distilledIds.push(currSegmentId);
          distilledDeltas.push(currSegmentTime);
        }
        currSegmentId = segmentId ?? void 0;
        currSegmentTime = 0;
      }
      currSegmentTime += timeDeltas[i];
    }
    if (currSegmentId) {
      distilledIds.push(currSegmentId);
      distilledDeltas.push(currSegmentTime);
    }
    return {
      startTime: profile.startTime,
      endTime: profile.endTime,
      deltas: distilledDeltas,
      ids: distilledIds,
      data: profile,
      getAggregatedTimes: () => {
        const segmentsToTime = /* @__PURE__ */ new Map();
        for (let i = 0; i < distilledIds.length; i++) {
          const id = distilledIds[i];
          segmentsToTime.set(id, (segmentsToTime.get(id) || 0) + distilledDeltas[i]);
        }
        return segmentsToTime;
      }
    };
  }
};
ExtensionHostProfiler = __decorateClass([
  __decorateParam(2, IExtensionService),
  __decorateParam(3, IV8InspectProfilingService)
], ExtensionHostProfiler);
export {
  ExtensionHostProfiler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2VsZWN0cm9uLWJyb3dzZXIvZXh0ZW5zaW9uSG9zdFByb2ZpbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVGVybmFyeVNlYXJjaFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90ZXJuYXJ5U2VhcmNoVHJlZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uSG9zdFByb2ZpbGUsIElFeHRlbnNpb25TZXJ2aWNlLCBQcm9maWxlU2VnbWVudElkLCBQcm9maWxlU2Vzc2lvbiB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElWOEluc3BlY3RQcm9maWxpbmdTZXJ2aWNlLCBJVjhQcm9maWxlLCBJVjhQcm9maWxlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2ZpbGluZy9jb21tb24vcHJvZmlsaW5nLmpzJztcbmltcG9ydCB7IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Z1bmN0aW9uYWwuanMnO1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uSG9zdFByb2ZpbGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ob3N0OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcG9ydDogbnVtYmVyLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVY4SW5zcGVjdFByb2ZpbGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZmlsaW5nU2VydmljZTogSVY4SW5zcGVjdFByb2ZpbGluZ1NlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8UHJvZmlsZVNlc3Npb24+IHtcblxuXHRcdGNvbnN0IGlkID0gYXdhaXQgdGhpcy5fcHJvZmlsaW5nU2VydmljZS5zdGFydFByb2ZpbGluZyh7IGhvc3Q6IHRoaXMuX2hvc3QsIHBvcnQ6IHRoaXMuX3BvcnQgfSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RvcDogY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcHJvZmlsZSA9IGF3YWl0IHRoaXMuX3Byb2ZpbGluZ1NlcnZpY2Uuc3RvcFByb2ZpbGluZyhpZCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnM7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9kaXN0aWxsKHByb2ZpbGUsIGV4dGVuc2lvbnMpO1xuXHRcdFx0fSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzdGlsbChwcm9maWxlOiBJVjhQcm9maWxlLCBleHRlbnNpb25zOiByZWFkb25seSBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSk6IElFeHRlbnNpb25Ib3N0UHJvZmlsZSB7XG5cdFx0Y29uc3Qgc2VhcmNoVHJlZSA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclVyaXM8SUV4dGVuc2lvbkRlc2NyaXB0aW9uPigpO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGlmIChleHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24uc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0c2VhcmNoVHJlZS5zZXQoVVJJLmZpbGUoZXh0ZW5zaW9uLmV4dGVuc2lvbkxvY2F0aW9uLmZzUGF0aCksIGV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9kZXMgPSBwcm9maWxlLm5vZGVzO1xuXHRcdGNvbnN0IGlkc1RvTm9kZXMgPSBuZXcgTWFwPG51bWJlciwgSVY4UHJvZmlsZU5vZGU+KCk7XG5cdFx0Y29uc3QgaWRzVG9TZWdtZW50SWQgPSBuZXcgTWFwPG51bWJlciwgUHJvZmlsZVNlZ21lbnRJZCB8IG51bGw+KCk7XG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG5cdFx0XHRpZHNUb05vZGVzLnNldChub2RlLmlkLCBub2RlKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB2aXNpdChub2RlOiBJVjhQcm9maWxlTm9kZSwgc2VnbWVudElkOiBQcm9maWxlU2VnbWVudElkIHwgbnVsbCkge1xuXHRcdFx0aWYgKCFzZWdtZW50SWQpIHtcblx0XHRcdFx0c3dpdGNoIChub2RlLmNhbGxGcmFtZS5mdW5jdGlvbk5hbWUpIHtcblx0XHRcdFx0XHRjYXNlICcocm9vdCknOlxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnKHByb2dyYW0pJzpcblx0XHRcdFx0XHRcdHNlZ21lbnRJZCA9ICdwcm9ncmFtJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJyhnYXJiYWdlIGNvbGxlY3RvciknOlxuXHRcdFx0XHRcdFx0c2VnbWVudElkID0gJ2djJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRzZWdtZW50SWQgPSAnc2VsZic7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChzZWdtZW50SWQgPT09ICdzZWxmJyAmJiBub2RlLmNhbGxGcmFtZS51cmwpIHtcblx0XHRcdFx0bGV0IGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbiA9IHNlYXJjaFRyZWUuZmluZFN1YnN0cihVUkkucGFyc2Uobm9kZS5jYWxsRnJhbWUudXJsKSk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdFx0XHRzZWdtZW50SWQgPSBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWRzVG9TZWdtZW50SWQuc2V0KG5vZGUuaWQsIHNlZ21lbnRJZCk7XG5cblx0XHRcdGlmIChub2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGNvbnN0IGNoaWxkTm9kZSA9IGlkc1RvTm9kZXMuZ2V0KGNoaWxkKTtcblx0XHRcdFx0XHRpZiAoY2hpbGROb2RlKSB7XG5cdFx0XHRcdFx0XHR2aXNpdChjaGlsZE5vZGUsIHNlZ21lbnRJZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHZpc2l0KG5vZGVzWzBdLCBudWxsKTtcblxuXHRcdGNvbnN0IHNhbXBsZXMgPSBwcm9maWxlLnNhbXBsZXMgfHwgW107XG5cdFx0Y29uc3QgdGltZURlbHRhcyA9IHByb2ZpbGUudGltZURlbHRhcyB8fCBbXTtcblx0XHRjb25zdCBkaXN0aWxsZWREZWx0YXM6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgZGlzdGlsbGVkSWRzOiBQcm9maWxlU2VnbWVudElkW10gPSBbXTtcblxuXHRcdGxldCBjdXJyU2VnbWVudFRpbWUgPSAwO1xuXHRcdGxldCBjdXJyU2VnbWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzYW1wbGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBpZCA9IHNhbXBsZXNbaV07XG5cdFx0XHRjb25zdCBzZWdtZW50SWQgPSBpZHNUb1NlZ21lbnRJZC5nZXQoaWQpO1xuXHRcdFx0aWYgKHNlZ21lbnRJZCAhPT0gY3VyclNlZ21lbnRJZCkge1xuXHRcdFx0XHRpZiAoY3VyclNlZ21lbnRJZCkge1xuXHRcdFx0XHRcdGRpc3RpbGxlZElkcy5wdXNoKGN1cnJTZWdtZW50SWQpO1xuXHRcdFx0XHRcdGRpc3RpbGxlZERlbHRhcy5wdXNoKGN1cnJTZWdtZW50VGltZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3VyclNlZ21lbnRJZCA9IHNlZ21lbnRJZCA/PyB1bmRlZmluZWQ7XG5cdFx0XHRcdGN1cnJTZWdtZW50VGltZSA9IDA7XG5cdFx0XHR9XG5cdFx0XHRjdXJyU2VnbWVudFRpbWUgKz0gdGltZURlbHRhc1tpXTtcblx0XHR9XG5cdFx0aWYgKGN1cnJTZWdtZW50SWQpIHtcblx0XHRcdGRpc3RpbGxlZElkcy5wdXNoKGN1cnJTZWdtZW50SWQpO1xuXHRcdFx0ZGlzdGlsbGVkRGVsdGFzLnB1c2goY3VyclNlZ21lbnRUaW1lKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhcnRUaW1lOiBwcm9maWxlLnN0YXJ0VGltZSxcblx0XHRcdGVuZFRpbWU6IHByb2ZpbGUuZW5kVGltZSxcblx0XHRcdGRlbHRhczogZGlzdGlsbGVkRGVsdGFzLFxuXHRcdFx0aWRzOiBkaXN0aWxsZWRJZHMsXG5cdFx0XHRkYXRhOiBwcm9maWxlLFxuXHRcdFx0Z2V0QWdncmVnYXRlZFRpbWVzOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlZ21lbnRzVG9UaW1lID0gbmV3IE1hcDxQcm9maWxlU2VnbWVudElkLCBudW1iZXI+KCk7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZGlzdGlsbGVkSWRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgaWQgPSBkaXN0aWxsZWRJZHNbaV07XG5cdFx0XHRcdFx0c2VnbWVudHNUb1RpbWUuc2V0KGlkLCAoc2VnbWVudHNUb1RpbWUuZ2V0KGlkKSB8fCAwKSArIGRpc3RpbGxlZERlbHRhc1tpXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHNlZ21lbnRzVG9UaW1lO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBZ0MseUJBQTJEO0FBRTNGLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxrQ0FBOEQ7QUFDdkUsU0FBUyxnQ0FBZ0M7QUFFbEMsSUFBTSx3QkFBTixNQUE0QjtBQUFBLEVBRWxDLFlBQ2tCLE9BQ0EsT0FDbUIsbUJBQ1MsbUJBQzVDO0FBSmdCO0FBQ0E7QUFDbUI7QUFDUztBQUFBLEVBRTlDO0FBQUEsRUFFQSxN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
