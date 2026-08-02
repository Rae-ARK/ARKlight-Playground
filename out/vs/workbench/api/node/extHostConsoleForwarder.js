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
import { AbstractExtHostConsoleForwarder } from "../common/extHostConsoleForwarder.js";
import { IExtHostInitDataService } from "../common/extHostInitDataService.js";
import { IExtHostRpcService } from "../common/extHostRpcService.js";
import { NativeLogMarkers } from "../../services/extensions/common/extensionHostProtocol.js";
const MAX_STREAM_BUFFER_LENGTH = 1024 * 1024;
let ExtHostConsoleForwarder = class extends AbstractExtHostConsoleForwarder {
  constructor(extHostRpc, initData) {
    super(extHostRpc, initData);
    this._isMakingConsoleCall = false;
    this._wrapStream("stderr", "error");
    this._wrapStream("stdout", "log");
  }
  _nativeConsoleLogMessage(method, original, args) {
    const stream = method === "error" || method === "warn" ? process.stderr : process.stdout;
    this._isMakingConsoleCall = true;
    stream.write(`
${NativeLogMarkers.Start}
`);
    original.apply(console, args);
    stream.write(`
${NativeLogMarkers.End}
`);
    this._isMakingConsoleCall = false;
  }
  /**
   * Wraps process.stderr/stdout.write() so that it is transmitted to the
   * renderer or CLI. It both calls through to the original method as well
   * as to console.log with complete lines so that they're made available
   * to the debugger/CLI.
   */
  _wrapStream(streamName, severity) {
    const stream = process[streamName];
    const original = stream.write;
    let buf = "";
    Object.defineProperty(stream, "write", {
      set: () => {
      },
      get: () => (chunk, encoding, callback) => {
        if (!this._isMakingConsoleCall) {
          buf += chunk.toString(encoding);
          const eol = buf.length > MAX_STREAM_BUFFER_LENGTH ? buf.length : buf.lastIndexOf("\n");
          if (eol !== -1) {
            console[severity](buf.slice(0, eol));
            buf = buf.slice(eol + 1);
          }
        }
        original.call(stream, chunk, encoding, callback);
      }
    });
  }
};
ExtHostConsoleForwarder = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostInitDataService)
], ExtHostConsoleForwarder);
export {
  ExtHostConsoleForwarder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvbm9kZS9leHRIb3N0Q29uc29sZUZvcndhcmRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEFic3RyYWN0RXh0SG9zdENvbnNvbGVGb3J3YXJkZXIgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdENvbnNvbGVGb3J3YXJkZXIuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdEluaXREYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTmF0aXZlTG9nTWFya2VycyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbkhvc3RQcm90b2NvbC5qcyc7XG5cbmNvbnN0IE1BWF9TVFJFQU1fQlVGRkVSX0xFTkdUSCA9IDEwMjQgKiAxMDI0O1xuXG5leHBvcnQgY2xhc3MgRXh0SG9zdENvbnNvbGVGb3J3YXJkZXIgZXh0ZW5kcyBBYnN0cmFjdEV4dEhvc3RDb25zb2xlRm9yd2FyZGVyIHtcblxuXHRwcml2YXRlIF9pc01ha2luZ0NvbnNvbGVDYWxsOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2UsXG5cdFx0QElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlIGluaXREYXRhOiBJRXh0SG9zdEluaXREYXRhU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoZXh0SG9zdFJwYywgaW5pdERhdGEpO1xuXG5cdFx0dGhpcy5fd3JhcFN0cmVhbSgnc3RkZXJyJywgJ2Vycm9yJyk7XG5cdFx0dGhpcy5fd3JhcFN0cmVhbSgnc3Rkb3V0JywgJ2xvZycpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9uYXRpdmVDb25zb2xlTG9nTWVzc2FnZShtZXRob2Q6ICdsb2cnIHwgJ2luZm8nIHwgJ3dhcm4nIHwgJ2Vycm9yJyB8ICdkZWJ1ZycsIG9yaWdpbmFsOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkLCBhcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRjb25zdCBzdHJlYW0gPSBtZXRob2QgPT09ICdlcnJvcicgfHwgbWV0aG9kID09PSAnd2FybicgPyBwcm9jZXNzLnN0ZGVyciA6IHByb2Nlc3Muc3Rkb3V0O1xuXHRcdHRoaXMuX2lzTWFraW5nQ29uc29sZUNhbGwgPSB0cnVlO1xuXHRcdHN0cmVhbS53cml0ZShgXFxuJHtOYXRpdmVMb2dNYXJrZXJzLlN0YXJ0fVxcbmApO1xuXHRcdG9yaWdpbmFsLmFwcGx5KGNvbnNvbGUsIGFyZ3MpO1xuXHRcdHN0cmVhbS53cml0ZShgXFxuJHtOYXRpdmVMb2dNYXJrZXJzLkVuZH1cXG5gKTtcblx0XHR0aGlzLl9pc01ha2luZ0NvbnNvbGVDYWxsID0gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogV3JhcHMgcHJvY2Vzcy5zdGRlcnIvc3Rkb3V0LndyaXRlKCkgc28gdGhhdCBpdCBpcyB0cmFuc21pdHRlZCB0byB0aGVcblx0ICogcmVuZGVyZXIgb3IgQ0xJLiBJdCBib3RoIGNhbGxzIHRocm91Z2ggdG8gdGhlIG9yaWdpbmFsIG1ldGhvZCBhcyB3ZWxsXG5cdCAqIGFzIHRvIGNvbnNvbGUubG9nIHdpdGggY29tcGxldGUgbGluZXMgc28gdGhhdCB0aGV5J3JlIG1hZGUgYXZhaWxhYmxlXG5cdCAqIHRvIHRoZSBkZWJ1Z2dlci9DTEkuXG5cdCAqL1xuXHRwcml2YXRlIF93cmFwU3RyZWFtKHN0cmVhbU5hbWU6ICdzdGRvdXQnIHwgJ3N0ZGVycicsIHNldmVyaXR5OiAnbG9nJyB8ICd3YXJuJyB8ICdlcnJvcicpIHtcblx0XHRjb25zdCBzdHJlYW0gPSBwcm9jZXNzW3N0cmVhbU5hbWVdO1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gc3RyZWFtLndyaXRlO1xuXG5cdFx0bGV0IGJ1ZiA9ICcnO1xuXG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHN0cmVhbSwgJ3dyaXRlJywge1xuXHRcdFx0c2V0OiAoKSA9PiB7IH0sXG5cdFx0XHRnZXQ6ICgpID0+IChjaHVuazogVWludDhBcnJheSB8IHN0cmluZywgZW5jb2Rpbmc/OiBCdWZmZXJFbmNvZGluZywgY2FsbGJhY2s/OiAoZXJyPzogRXJyb3IgfCBudWxsKSA9PiB2b2lkKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5faXNNYWtpbmdDb25zb2xlQ2FsbCkge1xuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdGJ1ZiArPSAoY2h1bmsgYXMgYW55KS50b1N0cmluZyhlbmNvZGluZyk7XG5cdFx0XHRcdFx0Y29uc3QgZW9sID0gYnVmLmxlbmd0aCA+IE1BWF9TVFJFQU1fQlVGRkVSX0xFTkdUSCA/IGJ1Zi5sZW5ndGggOiBidWYubGFzdEluZGV4T2YoJ1xcbicpO1xuXHRcdFx0XHRcdGlmIChlb2wgIT09IC0xKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlW3NldmVyaXR5XShidWYuc2xpY2UoMCwgZW9sKSk7XG5cdFx0XHRcdFx0XHRidWYgPSBidWYuc2xpY2UoZW9sICsgMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0b3JpZ2luYWwuY2FsbChzdHJlYW0sIGNodW5rLCBlbmNvZGluZywgY2FsbGJhY2spO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUVqQyxNQUFNLDJCQUEyQixPQUFPO0FBRWpDLElBQU0sMEJBQU4sY0FBc0MsZ0NBQWdDO0FBQUEsRUFJNUUsWUFDcUIsWUFDSyxVQUN4QjtBQUNELFVBQU0sWUFBWSxRQUFRO0FBTjNCLFNBQVEsdUJBQWdDO0FBUXZDLFNBQUssWUFBWSxVQUFVLE9BQU87QUFDbEMsU0FBSyxZQUFZLFVBQVUsS0FBSztBQUFBLEVBQ2pDO0FBQUEsRUFFbUIseUJBQXlCLFFBQXFELFVBQXdDLE1BQXVCO0FBQy9KLFVBQU0sU0FBUyxXQUFXLFdBQVcsV0FBVyxTQUFTLFFBQVEsU0FBUyxRQUFRO0FBQ2xGLFNBQUssdUJBQXVCO0FBQzVCLFdBQU8sTUFBTTtBQUFBLEVBQUssaUJBQWlCLEtBQUs7QUFBQSxDQUFJO0FBQzVDLGFBQVMsTUFBTSxTQUFTLElBQUk7QUFDNUIsV0FBTyxNQUFNO0FBQUEsRUFBSyxpQkFBaUIsR0FBRztBQUFBLENBQUk7QUFDMUMsU0FBSyx1QkFBdUI7QUFBQSxFQUM3QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUVEsWUFBWSxZQUFpQyxVQUFvQztBQUN4RixVQUFNLFNBQVMsUUFBUSxVQUFVO0FBQ2pDLFVBQU0sV0FBVyxPQUFPO0FBRXhCLFFBQUksTUFBTTtBQUVWLFdBQU8sZUFBZSxRQUFRLFNBQVM7QUFBQSxNQUN0QyxLQUFLLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDYixLQUFLLE1BQU0sQ0FBQyxPQUE0QixVQUEyQixhQUE0QztBQUM5RyxZQUFJLENBQUMsS0FBSyxzQkFBc0I7QUFFL0IsaUJBQVEsTUFBYyxTQUFTLFFBQVE7QUFDdkMsZ0JBQU0sTUFBTSxJQUFJLFNBQVMsMkJBQTJCLElBQUksU0FBUyxJQUFJLFlBQVksSUFBSTtBQUNyRixjQUFJLFFBQVEsSUFBSTtBQUNmLG9CQUFRLFFBQVEsRUFBRSxJQUFJLE1BQU0sR0FBRyxHQUFHLENBQUM7QUFDbkMsa0JBQU0sSUFBSSxNQUFNLE1BQU0sQ0FBQztBQUFBLFVBQ3hCO0FBQUEsUUFDRDtBQUVBLGlCQUFTLEtBQUssUUFBUSxPQUFPLFVBQVUsUUFBUTtBQUFBLE1BQ2hEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBcERhLDBCQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxHQU5VOyIsCiAgIm5hbWVzIjogW10KfQo=
