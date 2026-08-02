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
import { localize } from "../../../../nls.js";
import { observableMemento } from "../../../../platform/observable/common/observableMemento.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["SamplingRetentionDays"] = 7] = "SamplingRetentionDays";
  Constants2[Constants2["MsPerDay"] = 864e5] = "MsPerDay";
  Constants2[Constants2["SamplingRetentionMs"] = 6048e5] = "SamplingRetentionMs";
  Constants2[Constants2["SamplingLastNMessage"] = 30] = "SamplingLastNMessage";
  return Constants2;
})(Constants || {});
const samplingMemento = observableMemento({
  defaultValue: /* @__PURE__ */ new Map(),
  key: "mcp.sampling.logs",
  toStorage: (v) => JSON.stringify(Array.from(v.entries())),
  fromStorage: (v) => new Map(JSON.parse(v))
});
let McpSamplingLog = class extends Disposable {
  constructor(_storageService) {
    super();
    this._storageService = _storageService;
    this._logs = {};
  }
  has(server) {
    const storage = this._getLogStorageForServer(server);
    return storage.get().has(server.definition.id);
  }
  get(server) {
    const storage = this._getLogStorageForServer(server);
    return storage.get().get(server.definition.id);
  }
  getAsText(server) {
    const storage = this._getLogStorageForServer(server);
    const record = storage.get().get(server.definition.id);
    if (!record) {
      return "";
    }
    const parts = [];
    const total = record.bins.reduce((sum, value) => sum + value, 0);
    parts.push(localize("mcp.sampling.rpd", "{0} total requests in the last 7 days.", total));
    parts.push(this._formatRecentRequests(record));
    return parts.join("\n");
  }
  _formatRecentRequests(data) {
    if (!data.lastReqs.length) {
      return "\nNo recent requests.";
    }
    const result = [];
    for (let i = 0; i < data.lastReqs.length; i++) {
      const { request, response, at, model } = data.lastReqs[i];
      result.push(`
[${i + 1}] ${new Date(at).toISOString()} ${model}`);
      result.push("  Request:");
      for (const msg of request) {
        const role = msg.role.padEnd(9);
        let content = "";
        if ("text" in msg.content && msg.content.type === "text") {
          content = msg.content.text;
        } else if ("data" in msg.content) {
          content = `[${msg.content.type} data: ${msg.content.mimeType}]`;
        }
        result.push(`    ${role}: ${content}`);
      }
      result.push("  Response:");
      result.push(`    ${response}`);
    }
    return result.join("\n");
  }
  async add(server, request, response, model) {
    const now = Date.now();
    const utcOrdinal = Math.floor(now / 864e5 /* MsPerDay */);
    const storage = this._getLogStorageForServer(server);
    const next = new Map(storage.get());
    let record = next.get(server.definition.id);
    if (!record) {
      record = {
        head: utcOrdinal,
        bins: Array.from({ length: 7 /* SamplingRetentionDays */ }, () => 0),
        lastReqs: []
      };
    } else {
      for (let i = 0; i < utcOrdinal - record.head && i < 7 /* SamplingRetentionDays */; i++) {
        record.bins.pop();
        record.bins.unshift(0);
      }
      record.head = utcOrdinal;
    }
    record.bins[0]++;
    record.lastReqs.unshift({ request, response, at: now, model });
    while (record.lastReqs.length > 30 /* SamplingLastNMessage */) {
      record.lastReqs.pop();
    }
    next.set(server.definition.id, record);
    storage.set(next, void 0);
  }
  _getLogStorageForServer(server) {
    const scope = server.readDefinitions().get().collection?.scope ?? StorageScope.WORKSPACE;
    return this._logs[scope] ??= this._register(samplingMemento(scope, StorageTarget.MACHINE, this._storageService));
  }
};
McpSamplingLog = __decorateClass([
  __decorateParam(0, IStorageService)
], McpSamplingLog);
export {
  McpSamplingLog
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwU2FtcGxpbmdMb2cudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE9ic2VydmFibGVNZW1lbnRvLCBvYnNlcnZhYmxlTWVtZW50byB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL29ic2VydmFibGVNZW1lbnRvLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmVyIH0gZnJvbSAnLi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBNQ1AgfSBmcm9tICcuL21vZGVsQ29udGV4dFByb3RvY29sLmpzJztcblxuY29uc3QgZW51bSBDb25zdGFudHMge1xuXHRTYW1wbGluZ1JldGVudGlvbkRheXMgPSA3LFxuXHRNc1BlckRheSA9IDI0ICogNjAgKiA2MCAqIDEwMDAsXG5cdFNhbXBsaW5nUmV0ZW50aW9uTXMgPSBTYW1wbGluZ1JldGVudGlvbkRheXMgKiBNc1BlckRheSxcblx0U2FtcGxpbmdMYXN0Tk1lc3NhZ2UgPSAzMCxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2FtcGxpbmdTdG9yZWREYXRhIHtcblx0Ly8gVVRDIGRheSBvcmRpbmFsIG9mIHRoZSBmaXJzdCBiaW4gaW4gdGhlIGJpbnNcblx0aGVhZDogbnVtYmVyO1xuXHQvLyBSZXF1ZXN0cyBwZXIgZGF5LCBtYXggbGVuZ3RoIG9mIGBDb25zdGFudHMuU2FtcGxpbmdSZXRlbnRpb25EYXlzYFxuXHRiaW5zOiBudW1iZXJbXTtcblx0Ly8gTGFzdCBzYW1wbGluZyByZXF1ZXN0cy9yZXNwb25zZXNcblx0bGFzdFJlcXM6IHsgcmVxdWVzdDogTUNQLlNhbXBsaW5nTWVzc2FnZVtdOyByZXNwb25zZTogc3RyaW5nOyBhdDogbnVtYmVyOyBtb2RlbDogc3RyaW5nIH1bXTtcbn1cblxuY29uc3Qgc2FtcGxpbmdNZW1lbnRvID0gb2JzZXJ2YWJsZU1lbWVudG88UmVhZG9ubHlNYXA8c3RyaW5nLCBJU2FtcGxpbmdTdG9yZWREYXRhPj4oe1xuXHRkZWZhdWx0VmFsdWU6IG5ldyBNYXAoKSxcblx0a2V5OiAnbWNwLnNhbXBsaW5nLmxvZ3MnLFxuXHR0b1N0b3JhZ2U6IHYgPT4gSlNPTi5zdHJpbmdpZnkoQXJyYXkuZnJvbSh2LmVudHJpZXMoKSkpLFxuXHRmcm9tU3RvcmFnZTogdiA9PiBuZXcgTWFwKEpTT04ucGFyc2UodikpLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBNY3BTYW1wbGluZ0xvZyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dzOiB7IFtLIGluIFN0b3JhZ2VTY29wZV0/OiBPYnNlcnZhYmxlTWVtZW50bzxSZWFkb25seU1hcDxzdHJpbmcsIElTYW1wbGluZ1N0b3JlZERhdGE+PiB9ID0ge307XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHVibGljIGhhcyhzZXJ2ZXI6IElNY3BTZXJ2ZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGhpcy5fZ2V0TG9nU3RvcmFnZUZvclNlcnZlcihzZXJ2ZXIpO1xuXHRcdHJldHVybiBzdG9yYWdlLmdldCgpLmhhcyhzZXJ2ZXIuZGVmaW5pdGlvbi5pZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0KHNlcnZlcjogSU1jcFNlcnZlcik6IFJlYWRvbmx5PElTYW1wbGluZ1N0b3JlZERhdGEgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGhpcy5fZ2V0TG9nU3RvcmFnZUZvclNlcnZlcihzZXJ2ZXIpO1xuXHRcdHJldHVybiBzdG9yYWdlLmdldCgpLmdldChzZXJ2ZXIuZGVmaW5pdGlvbi5pZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QXNUZXh0KHNlcnZlcjogSU1jcFNlcnZlcik6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRoaXMuX2dldExvZ1N0b3JhZ2VGb3JTZXJ2ZXIoc2VydmVyKTtcblx0XHRjb25zdCByZWNvcmQgPSBzdG9yYWdlLmdldCgpLmdldChzZXJ2ZXIuZGVmaW5pdGlvbi5pZCk7XG5cdFx0aWYgKCFyZWNvcmQpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCB0b3RhbCA9IHJlY29yZC5iaW5zLnJlZHVjZSgoc3VtLCB2YWx1ZSkgPT4gc3VtICsgdmFsdWUsIDApO1xuXHRcdHBhcnRzLnB1c2gobG9jYWxpemUoJ21jcC5zYW1wbGluZy5ycGQnLCAnezB9IHRvdGFsIHJlcXVlc3RzIGluIHRoZSBsYXN0IDcgZGF5cy4nLCB0b3RhbCkpO1xuXG5cdFx0cGFydHMucHVzaCh0aGlzLl9mb3JtYXRSZWNlbnRSZXF1ZXN0cyhyZWNvcmQpKTtcblx0XHRyZXR1cm4gcGFydHMuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIF9mb3JtYXRSZWNlbnRSZXF1ZXN0cyhkYXRhOiBJU2FtcGxpbmdTdG9yZWREYXRhKTogc3RyaW5nIHtcblx0XHRpZiAoIWRhdGEubGFzdFJlcXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gJ1xcbk5vIHJlY2VudCByZXF1ZXN0cy4nO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGRhdGEubGFzdFJlcXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHsgcmVxdWVzdCwgcmVzcG9uc2UsIGF0LCBtb2RlbCB9ID0gZGF0YS5sYXN0UmVxc1tpXTtcblx0XHRcdHJlc3VsdC5wdXNoKGBcXG5bJHtpICsgMX1dICR7bmV3IERhdGUoYXQpLnRvSVNPU3RyaW5nKCl9ICR7bW9kZWx9YCk7XG5cblx0XHRcdHJlc3VsdC5wdXNoKCcgIFJlcXVlc3Q6Jyk7XG5cdFx0XHRmb3IgKGNvbnN0IG1zZyBvZiByZXF1ZXN0KSB7XG5cdFx0XHRcdGNvbnN0IHJvbGUgPSBtc2cucm9sZS5wYWRFbmQoOSk7XG5cdFx0XHRcdGxldCBjb250ZW50ID0gJyc7XG5cdFx0XHRcdGlmICgndGV4dCcgaW4gbXNnLmNvbnRlbnQgJiYgbXNnLmNvbnRlbnQudHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdFx0Y29udGVudCA9IG1zZy5jb250ZW50LnRleHQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAoJ2RhdGEnIGluIG1zZy5jb250ZW50KSB7XG5cdFx0XHRcdFx0Y29udGVudCA9IGBbJHttc2cuY29udGVudC50eXBlfSBkYXRhOiAke21zZy5jb250ZW50Lm1pbWVUeXBlfV1gO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGAgICAgJHtyb2xlfTogJHtjb250ZW50fWApO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goJyAgUmVzcG9uc2U6Jyk7XG5cdFx0XHRyZXN1bHQucHVzaChgICAgICR7cmVzcG9uc2V9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdC5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBhZGQoc2VydmVyOiBJTWNwU2VydmVyLCByZXF1ZXN0OiBNQ1AuU2FtcGxpbmdNZXNzYWdlW10sIHJlc3BvbnNlOiBzdHJpbmcsIG1vZGVsOiBzdHJpbmcpIHtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IHV0Y09yZGluYWwgPSBNYXRoLmZsb29yKG5vdyAvIENvbnN0YW50cy5Nc1BlckRheSk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRoaXMuX2dldExvZ1N0b3JhZ2VGb3JTZXJ2ZXIoc2VydmVyKTtcblxuXHRcdGNvbnN0IG5leHQgPSBuZXcgTWFwKHN0b3JhZ2UuZ2V0KCkpO1xuXHRcdGxldCByZWNvcmQgPSBuZXh0LmdldChzZXJ2ZXIuZGVmaW5pdGlvbi5pZCk7XG5cdFx0aWYgKCFyZWNvcmQpIHtcblx0XHRcdHJlY29yZCA9IHtcblx0XHRcdFx0aGVhZDogdXRjT3JkaW5hbCxcblx0XHRcdFx0YmluczogQXJyYXkuZnJvbSh7IGxlbmd0aDogQ29uc3RhbnRzLlNhbXBsaW5nUmV0ZW50aW9uRGF5cyB9LCAoKSA9PiAwKSxcblx0XHRcdFx0bGFzdFJlcXM6IFtdLFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gU2hpZnQgYmlucyBiYWNrIGJ5IGRheXNTaW5jZUhlYWQsIGRyb3BwaW5nIG9sZCBkYXlzXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8ICh1dGNPcmRpbmFsIC0gcmVjb3JkLmhlYWQpICYmIGkgPCBDb25zdGFudHMuU2FtcGxpbmdSZXRlbnRpb25EYXlzOyBpKyspIHtcblx0XHRcdFx0cmVjb3JkLmJpbnMucG9wKCk7XG5cdFx0XHRcdHJlY29yZC5iaW5zLnVuc2hpZnQoMCk7XG5cdFx0XHR9XG5cdFx0XHRyZWNvcmQuaGVhZCA9IHV0Y09yZGluYWw7XG5cdFx0fVxuXG5cdFx0Ly8gSW5jcmVtZW50IHRoZSBjdXJyZW50IGRheSdzIGJpbiAoaGVhZClcblx0XHRyZWNvcmQuYmluc1swXSsrO1xuXHRcdHJlY29yZC5sYXN0UmVxcy51bnNoaWZ0KHsgcmVxdWVzdCwgcmVzcG9uc2UsIGF0OiBub3csIG1vZGVsIH0pO1xuXHRcdHdoaWxlIChyZWNvcmQubGFzdFJlcXMubGVuZ3RoID4gQ29uc3RhbnRzLlNhbXBsaW5nTGFzdE5NZXNzYWdlKSB7XG5cdFx0XHRyZWNvcmQubGFzdFJlcXMucG9wKCk7XG5cdFx0fVxuXG5cdFx0bmV4dC5zZXQoc2VydmVyLmRlZmluaXRpb24uaWQsIHJlY29yZCk7XG5cdFx0c3RvcmFnZS5zZXQobmV4dCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldExvZ1N0b3JhZ2VGb3JTZXJ2ZXIoc2VydmVyOiBJTWNwU2VydmVyKSB7XG5cdFx0Y29uc3Qgc2NvcGUgPSBzZXJ2ZXIucmVhZERlZmluaXRpb25zKCkuZ2V0KCkuY29sbGVjdGlvbj8uc2NvcGUgPz8gU3RvcmFnZVNjb3BlLldPUktTUEFDRTtcblx0XHRyZXR1cm4gdGhpcy5fbG9nc1tzY29wZV0gPz89IHRoaXMuX3JlZ2lzdGVyKHNhbXBsaW5nTWVtZW50byhzY29wZSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCB0aGlzLl9zdG9yYWdlU2VydmljZSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTRCLHlCQUF5QjtBQUNy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
