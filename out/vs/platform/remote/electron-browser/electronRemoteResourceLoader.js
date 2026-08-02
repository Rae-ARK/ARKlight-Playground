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
import { VSBuffer, encodeBase64 } from "../../../base/common/buffer.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { getMediaOrTextMime } from "../../../base/common/mime.js";
import { Schemas } from "../../../base/common/network.js";
import { URI } from "../../../base/common/uri.js";
import { FileOperationError, FileOperationResult, IFileService } from "../../files/common/files.js";
import { IMainProcessService } from "../../ipc/common/mainProcessService.js";
import { NODE_REMOTE_RESOURCE_CHANNEL_NAME, NODE_REMOTE_RESOURCE_IPC_METHOD_NAME } from "../common/electronRemoteResources.js";
let ElectronRemoteResourceLoader = class extends Disposable {
  constructor(windowId, mainProcessService, fileService) {
    super();
    this.windowId = windowId;
    this.fileService = fileService;
    const channel = {
      listen(_, event) {
        throw new Error(`Event not found: ${event}`);
      },
      call: (_, command, arg) => {
        switch (command) {
          case NODE_REMOTE_RESOURCE_IPC_METHOD_NAME:
            return this.doRequest(URI.revive(arg[0]));
        }
        throw new Error(`Call not found: ${command}`);
      }
    };
    mainProcessService.registerChannel(NODE_REMOTE_RESOURCE_CHANNEL_NAME, channel);
  }
  async doRequest(uri) {
    let content;
    try {
      const params = new URLSearchParams(uri.query);
      const actual = uri.with({
        scheme: params.get("scheme"),
        authority: params.get("authority"),
        query: ""
      });
      content = await this.fileService.readFile(actual);
    } catch (e) {
      const str = encodeBase64(VSBuffer.fromString(e.message));
      if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
        return { statusCode: 404, body: str };
      } else {
        return { statusCode: 500, body: str };
      }
    }
    const mimeType = uri.path && getMediaOrTextMime(uri.path);
    return { statusCode: 200, body: encodeBase64(content.value), mimeType };
  }
  getResourceUriProvider() {
    return (uri) => uri.with({
      scheme: Schemas.vscodeManagedRemoteResource,
      authority: `window:${this.windowId}`,
      query: new URLSearchParams({ authority: uri.authority, scheme: uri.scheme }).toString()
    });
  }
};
ElectronRemoteResourceLoader = __decorateClass([
  __decorateParam(1, IMainProcessService),
  __decorateParam(2, IFileService)
], ElectronRemoteResourceLoader);
export {
  ElectronRemoteResourceLoader
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3JlbW90ZS9lbGVjdHJvbi1icm93c2VyL2VsZWN0cm9uUmVtb3RlUmVzb3VyY2VMb2FkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBWU0J1ZmZlciwgZW5jb2RlQmFzZTY0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBnZXRNZWRpYU9yVGV4dE1pbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJU2VydmVyQ2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZUNvbnRlbnQsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTWFpblByb2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaXBjL2NvbW1vbi9tYWluUHJvY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTk9ERV9SRU1PVEVfUkVTT1VSQ0VfQ0hBTk5FTF9OQU1FLCBOT0RFX1JFTU9URV9SRVNPVVJDRV9JUENfTUVUSE9EX05BTUUsIE5vZGVSZW1vdGVSZXNvdXJjZVJlc3BvbnNlIH0gZnJvbSAnLi4vY29tbW9uL2VsZWN0cm9uUmVtb3RlUmVzb3VyY2VzLmpzJztcblxuZXhwb3J0IGNsYXNzIEVsZWN0cm9uUmVtb3RlUmVzb3VyY2VMb2FkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3aW5kb3dJZDogbnVtYmVyLFxuXHRcdEBJTWFpblByb2Nlc3NTZXJ2aWNlIG1haW5Qcm9jZXNzU2VydmljZTogSU1haW5Qcm9jZXNzU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGNoYW5uZWw6IElTZXJ2ZXJDaGFubmVsID0ge1xuXHRcdFx0bGlzdGVuPFQ+KF86IHVua25vd24sIGV2ZW50OiBzdHJpbmcpOiBFdmVudDxUPiB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRXZlbnQgbm90IGZvdW5kOiAke2V2ZW50fWApO1xuXHRcdFx0fSxcblxuXHRcdFx0Y2FsbDogKF86IHVua25vd24sIGNvbW1hbmQ6IHN0cmluZywgYXJnPzogYW55KTogUHJvbWlzZTxhbnk+ID0+IHtcblx0XHRcdFx0c3dpdGNoIChjb21tYW5kKSB7XG5cdFx0XHRcdFx0Y2FzZSBOT0RFX1JFTU9URV9SRVNPVVJDRV9JUENfTUVUSE9EX05BTUU6IHJldHVybiB0aGlzLmRvUmVxdWVzdChVUkkucmV2aXZlKGFyZ1swXSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYWxsIG5vdCBmb3VuZDogJHtjb21tYW5kfWApO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRtYWluUHJvY2Vzc1NlcnZpY2UucmVnaXN0ZXJDaGFubmVsKE5PREVfUkVNT1RFX1JFU09VUkNFX0NIQU5ORUxfTkFNRSwgY2hhbm5lbCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVxdWVzdCh1cmk6IFVSSSk6IFByb21pc2U8Tm9kZVJlbW90ZVJlc291cmNlUmVzcG9uc2U+IHtcblx0XHRsZXQgY29udGVudDogSUZpbGVDb250ZW50O1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHVyaS5xdWVyeSk7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSB1cmkud2l0aCh7XG5cdFx0XHRcdHNjaGVtZTogcGFyYW1zLmdldCgnc2NoZW1lJykhLFxuXHRcdFx0XHRhdXRob3JpdHk6IHBhcmFtcy5nZXQoJ2F1dGhvcml0eScpISxcblx0XHRcdFx0cXVlcnk6ICcnLFxuXHRcdFx0fSk7XG5cdFx0XHRjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShhY3R1YWwpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnN0IHN0ciA9IGVuY29kZUJhc2U2NChWU0J1ZmZlci5mcm9tU3RyaW5nKGUubWVzc2FnZSkpO1xuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBGaWxlT3BlcmF0aW9uRXJyb3IgJiYgZS5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdHJldHVybiB7IHN0YXR1c0NvZGU6IDQwNCwgYm9keTogc3RyIH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4geyBzdGF0dXNDb2RlOiA1MDAsIGJvZHk6IHN0ciB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1pbWVUeXBlID0gdXJpLnBhdGggJiYgZ2V0TWVkaWFPclRleHRNaW1lKHVyaS5wYXRoKTtcblx0XHRyZXR1cm4geyBzdGF0dXNDb2RlOiAyMDAsIGJvZHk6IGVuY29kZUJhc2U2NChjb250ZW50LnZhbHVlKSwgbWltZVR5cGUgfTtcblx0fVxuXG5cdHB1YmxpYyBnZXRSZXNvdXJjZVVyaVByb3ZpZGVyKCkge1xuXHRcdHJldHVybiAodXJpOiBVUkkpID0+IHVyaS53aXRoKHtcblx0XHRcdHNjaGVtZTogU2NoZW1hcy52c2NvZGVNYW5hZ2VkUmVtb3RlUmVzb3VyY2UsXG5cdFx0XHRhdXRob3JpdHk6IGB3aW5kb3c6JHt0aGlzLndpbmRvd0lkfWAsXG5cdFx0XHRxdWVyeTogbmV3IFVSTFNlYXJjaFBhcmFtcyh7IGF1dGhvcml0eTogdXJpLmF1dGhvcml0eSwgc2NoZW1lOiB1cmkuc2NoZW1lIH0pLnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxVQUFVLG9CQUFvQjtBQUV2QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBRXBCLFNBQVMsb0JBQW9CLHFCQUFtQyxvQkFBb0I7QUFDcEYsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQ0FBbUMsNENBQXdFO0FBRTdHLElBQU0sK0JBQU4sY0FBMkMsV0FBVztBQUFBLEVBQzVELFlBQ2tCLFVBQ0ksb0JBQ1UsYUFDOUI7QUFDRCxVQUFNO0FBSlc7QUFFYztBQUkvQixVQUFNLFVBQTBCO0FBQUEsTUFDL0IsT0FBVSxHQUFZLE9BQXlCO0FBQzlDLGNBQU0sSUFBSSxNQUFNLG9CQUFvQixLQUFLLEVBQUU7QUFBQSxNQUM1QztBQUFBLE1BRUEsTUFBTSxDQUFDLEdBQVksU0FBaUIsUUFBNEI7QUFDL0QsZ0JBQVEsU0FBUztBQUFBLFVBQ2hCLEtBQUs7QUFBc0MsbUJBQU8sS0FBSyxVQUFVLElBQUksT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQUEsUUFDcEY7QUFFQSxjQUFNLElBQUksTUFBTSxtQkFBbUIsT0FBTyxFQUFFO0FBQUEsTUFDN0M7QUFBQSxJQUNEO0FBRUEsdUJBQW1CLGdCQUFnQixtQ0FBbUMsT0FBTztBQUFBLEVBQzlFO0FBQUEsRUFFQSxNQUFjLFVBQVUsS0FBK0M7QUFDdEUsUUFBSTtBQUNKLFFBQUk7QUFDSCxZQUFNLFNBQVMsSUFBSSxnQkFBZ0IsSUFBSSxLQUFLO0FBQzVDLFlBQU0sU0FBUyxJQUFJLEtBQUs7QUFBQSxRQUN2QixRQUFRLE9BQU8sSUFBSSxRQUFRO0FBQUEsUUFDM0IsV0FBVyxPQUFPLElBQUksV0FBVztBQUFBLFFBQ2pDLE9BQU87QUFBQSxNQUNSLENBQUM7QUFDRCxnQkFBVSxNQUFNLEtBQUssWUFBWSxTQUFTLE1BQU07QUFBQSxJQUNqRCxTQUFTLEdBQUc7QUFDWCxZQUFNLE1BQU0sYUFBYSxTQUFTLFdBQVcsRUFBRSxPQUFPLENBQUM7QUFDdkQsVUFBSSxhQUFhLHNCQUFzQixFQUFFLHdCQUF3QixvQkFBb0IsZ0JBQWdCO0FBQ3BHLGVBQU8sRUFBRSxZQUFZLEtBQUssTUFBTSxJQUFJO0FBQUEsTUFDckMsT0FBTztBQUNOLGVBQU8sRUFBRSxZQUFZLEtBQUssTUFBTSxJQUFJO0FBQUEsTUFDckM7QUFBQSxJQUNEO0FBRUEsVUFBTSxXQUFXLElBQUksUUFBUSxtQkFBbUIsSUFBSSxJQUFJO0FBQ3hELFdBQU8sRUFBRSxZQUFZLEtBQUssTUFBTSxhQUFhLFFBQVEsS0FBSyxHQUFHLFNBQVM7QUFBQSxFQUN2RTtBQUFBLEVBRU8seUJBQXlCO0FBQy9CLFdBQU8sQ0FBQyxRQUFhLElBQUksS0FBSztBQUFBLE1BQzdCLFFBQVEsUUFBUTtBQUFBLE1BQ2hCLFdBQVcsVUFBVSxLQUFLLFFBQVE7QUFBQSxNQUNsQyxPQUFPLElBQUksZ0JBQWdCLEVBQUUsV0FBVyxJQUFJLFdBQVcsUUFBUSxJQUFJLE9BQU8sQ0FBQyxFQUFFLFNBQVM7QUFBQSxJQUN2RixDQUFDO0FBQUEsRUFDRjtBQUNEO0FBdkRhLCtCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxHQUpVOyIsCiAgIm5hbWVzIjogW10KfQo=
