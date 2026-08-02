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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { hash } from "../../../../base/common/hash.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { basename, dirname } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { IFileService } from "../../../files/common/files.js";
import { IAgentPluginManager } from "../../common/agentPluginManager.js";
import { customizationId } from "../../common/state/sessionState.js";
import { CustomizationType } from "../../common/state/protocol/state.js";
import { DiscoveredType } from "../copilot/sessionCustomizationDiscovery.js";
const DISPLAY_NAME = "VS Code Synced Data";
const HOST_DISCOVERY_DIR = "host-discovery";
const MANIFEST_CONTENT = JSON.stringify({
  name: DISPLAY_NAME,
  description: "Customization data discovered from this workspace and your home directory"
}, null, "	");
function pluginDirForType(type) {
  switch (type) {
    case DiscoveredType.Agent:
      return "agents";
    case DiscoveredType.Skill:
      return "skills";
    case DiscoveredType.Instruction:
      return "rules";
    case DiscoveredType.Hook:
      return "hooks";
    case DiscoveredType.AgentInstruction:
      return void 0;
  }
}
let SessionPluginBundler = class extends Disposable {
  constructor(workingDirectory, _fileService, pluginManager) {
    super();
    this._fileService = _fileService;
    const authority = `host-${hash(workingDirectory.toString())}`;
    this._rootUri = URI.joinPath(pluginManager.basePath, HOST_DISCOVERY_DIR, authority);
  }
  get rootUri() {
    return this._rootUri;
  }
  get lastNonce() {
    return this._lastNonce;
  }
  /**
   * Bundles the given files into the on-disk plugin directory.
   *
   * Overwrites any previous bundle for this working directory. Returns a
   * {@link ClientPluginCustomization} pointing at the on-disk plugin root
   * with a content-based nonce, or `undefined` when there are no files or
   * cancellation was requested.
   */
  async bundle(directories, token = CancellationToken.None) {
    if (directories.length === 0 || token.isCancellationRequested) {
      return void 0;
    }
    const hashParts = [];
    const files = [];
    for (const discoveredDirectory of directories) {
      const dir = pluginDirForType(discoveredDirectory.type);
      if (!dir) {
        continue;
      }
      for (const file of discoveredDirectory.files) {
        const fileUri = file.uri;
        const fileName = basename(fileUri);
        let destUri;
        let hashKey;
        if (discoveredDirectory.type === DiscoveredType.Skill) {
          const skillDirName = basename(dirname(fileUri));
          destUri = URI.joinPath(this._rootUri, dir, skillDirName, fileName);
          hashKey = `${dir}/${skillDirName}/${fileName}`;
        } else {
          destUri = URI.joinPath(this._rootUri, dir, fileName);
          hashKey = `${dir}/${fileName}`;
        }
        const content = await this._fileService.readFile(fileUri);
        if (token.isCancellationRequested) {
          return void 0;
        }
        files.push({ destUri, content: content.value });
        hashParts.push(`${hashKey}:${content.value.toString()}`);
      }
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    hashParts.sort();
    const nonce = String(hash(hashParts.join("\n")));
    const rootUriString = this._rootUri.toString();
    const result = {
      ref: {
        type: CustomizationType.Plugin,
        id: customizationId(rootUriString),
        uri: rootUriString,
        name: DISPLAY_NAME,
        enabled: true,
        nonce
      }
    };
    if (this._lastNonce === nonce) {
      return result;
    }
    try {
      await this._fileService.del(this._rootUri, { recursive: true });
    } catch {
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    const manifestUri = URI.joinPath(this._rootUri, ".plugin", "plugin.json");
    await this._fileService.createFolder(dirname(manifestUri));
    if (token.isCancellationRequested) {
      return void 0;
    }
    await this._fileService.writeFile(manifestUri, VSBuffer.fromString(MANIFEST_CONTENT));
    if (token.isCancellationRequested) {
      return void 0;
    }
    for (const file of files) {
      await this._fileService.createFolder(dirname(file.destUri));
      if (token.isCancellationRequested) {
        return void 0;
      }
      await this._fileService.writeFile(file.destUri, file.content);
      if (token.isCancellationRequested) {
        return void 0;
      }
    }
    this._lastNonce = nonce;
    return result;
  }
};
SessionPluginBundler = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, IAgentPluginManager)
], SessionPluginBundler);
export {
  SessionPluginBundler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3NoYXJlZC9zZXNzaW9uUGx1Z2luQnVuZGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW5NYW5hZ2VyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50UGx1Z2luTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBjdXN0b21pemF0aW9uSWQsIHR5cGUgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQ3VzdG9taXphdGlvblR5cGUsIHR5cGUgVVJJIGFzIFByb3RvY29sVVJJIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IERpc2NvdmVyZWRUeXBlLCB0eXBlIElEaXNjb3ZlcmVkRGlyZWN0b3J5IH0gZnJvbSAnLi4vY29waWxvdC9zZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeS5qcyc7XG5cbmNvbnN0IERJU1BMQVlfTkFNRSA9ICdWUyBDb2RlIFN5bmNlZCBEYXRhJztcbmNvbnN0IEhPU1RfRElTQ09WRVJZX0RJUiA9ICdob3N0LWRpc2NvdmVyeSc7XG5cbmNvbnN0IE1BTklGRVNUX0NPTlRFTlQgPSBKU09OLnN0cmluZ2lmeSh7XG5cdG5hbWU6IERJU1BMQVlfTkFNRSxcblx0ZGVzY3JpcHRpb246ICdDdXN0b21pemF0aW9uIGRhdGEgZGlzY292ZXJlZCBmcm9tIHRoaXMgd29ya3NwYWNlIGFuZCB5b3VyIGhvbWUgZGlyZWN0b3J5Jyxcbn0sIG51bGwsICdcXHQnKTtcblxuLyoqXG4gKiBNYXBzIGEge0BsaW5rIERpc2NvdmVyZWRUeXBlfSB0byB0aGUgcGx1Z2luIHN1Yi1kaXJlY3RvcnkgdW5kZXIgd2hpY2ggdGhhdFxuICogY29tcG9uZW50IHR5cGUgbGl2ZXMgaW4gdGhlIE9wZW4gUGx1Z2luIGZvcm1hdC5cbiAqL1xuZnVuY3Rpb24gcGx1Z2luRGlyRm9yVHlwZSh0eXBlOiBEaXNjb3ZlcmVkVHlwZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgRGlzY292ZXJlZFR5cGUuQWdlbnQ6IHJldHVybiAnYWdlbnRzJztcblx0XHRjYXNlIERpc2NvdmVyZWRUeXBlLlNraWxsOiByZXR1cm4gJ3NraWxscyc7XG5cdFx0Y2FzZSBEaXNjb3ZlcmVkVHlwZS5JbnN0cnVjdGlvbjogcmV0dXJuICdydWxlcyc7XG5cdFx0Y2FzZSBEaXNjb3ZlcmVkVHlwZS5Ib29rOiByZXR1cm4gJ2hvb2tzJztcblx0XHRjYXNlIERpc2NvdmVyZWRUeXBlLkFnZW50SW5zdHJ1Y3Rpb246IHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElCdW5kbGVSZXN1bHQge1xuXHRyZWFkb25seSByZWY6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb247XG59XG5cbi8qKlxuICogQnVuZGxlcyBob3N0LWRpc2NvdmVyZWQgY3VzdG9taXphdGlvbiBmaWxlcyBpbnRvIGFuIE9wZW4gUGx1Z2luIGxheW91dFxuICogb24gcmVhbCBkaXNrIHVuZGVyIGA8YWdlbnRQbHVnaW5NYW5hZ2VyLmJhc2VQYXRoPi9ob3N0LWRpc2NvdmVyeS88aGFzaD4vYC5cbiAqXG4gKiBXcml0aW5nIHRvIGEgcmVhbCBkaXJlY3RvcnkgKHJhdGhlciB0aGFuIGFuIGluLW1lbW9yeSBwcm92aWRlcikgaXNcbiAqIHJlcXVpcmVkIGJlY2F1c2UgdGhlIENvcGlsb3QgU0RLIHN1YnByb2Nlc3MgcmVjZWl2ZXMgc2tpbGwgZGlyZWN0b3JpZXNcbiAqIGFuZCBob29rIGNvbW1hbmRzIGFzIG9uLWRpc2sgcGF0aHMgdmlhIGBmc1BhdGhgLCBhbmQgYmVjYXVzZSB0aGVcbiAqIHdvcmtiZW5jaCBmZXRjaGVzIGZpbGVzIHRocm91Z2ggdGhlIGFnZW50LWhvc3QgZmlsZXN5c3RlbSBicmlkZ2UgXHUyMDE0XG4gKiBuZWl0aGVyIG9mIHdoaWNoIGNhbiByZWFkIGEgaG9zdC1zaWRlIGluLW1lbW9yeSBGUy5cbiAqXG4gKiBUaGUgZGlyZWN0b3J5IGlzIG5hbWVzcGFjZWQgYnkgYSBoYXNoIG9mIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBzb1xuICogY29uY3VycmVudCBzZXNzaW9ucyBvbiBkaWZmZXJlbnQgZm9sZGVycyBkb24ndCBjb2xsaWRlLiBSZXBlYXRlZFxuICogYGJ1bmRsZSgpYCBjYWxscyB3aXRoIGlkZW50aWNhbCBjb250ZW50IHJldXNlIHRoZSBwcmlvciBidW5kbGUgKG5vbmNlXG4gKiBtYXRjaCkgYW5kIHNraXAgdGhlIHJld3JpdGUuXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXNzaW9uUGx1Z2luQnVuZGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jvb3RVcmk6IFVSSTtcblx0cHJpdmF0ZSBfbGFzdE5vbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0d29ya2luZ0RpcmVjdG9yeTogVVJJLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUFnZW50UGx1Z2luTWFuYWdlciBwbHVnaW5NYW5hZ2VyOiBJQWdlbnRQbHVnaW5NYW5hZ2VyLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IGF1dGhvcml0eSA9IGBob3N0LSR7aGFzaCh3b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCkpfWA7XG5cdFx0dGhpcy5fcm9vdFVyaSA9IFVSSS5qb2luUGF0aChwbHVnaW5NYW5hZ2VyLmJhc2VQYXRoLCBIT1NUX0RJU0NPVkVSWV9ESVIsIGF1dGhvcml0eSk7XG5cdH1cblxuXHRnZXQgcm9vdFVyaSgpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLl9yb290VXJpO1xuXHR9XG5cblx0Z2V0IGxhc3ROb25jZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0Tm9uY2U7XG5cdH1cblxuXHQvKipcblx0ICogQnVuZGxlcyB0aGUgZ2l2ZW4gZmlsZXMgaW50byB0aGUgb24tZGlzayBwbHVnaW4gZGlyZWN0b3J5LlxuXHQgKlxuXHQgKiBPdmVyd3JpdGVzIGFueSBwcmV2aW91cyBidW5kbGUgZm9yIHRoaXMgd29ya2luZyBkaXJlY3RvcnkuIFJldHVybnMgYVxuXHQgKiB7QGxpbmsgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbn0gcG9pbnRpbmcgYXQgdGhlIG9uLWRpc2sgcGx1Z2luIHJvb3Rcblx0ICogd2l0aCBhIGNvbnRlbnQtYmFzZWQgbm9uY2UsIG9yIGB1bmRlZmluZWRgIHdoZW4gdGhlcmUgYXJlIG5vIGZpbGVzIG9yXG5cdCAqIGNhbmNlbGxhdGlvbiB3YXMgcmVxdWVzdGVkLlxuXHQgKi9cblx0YXN5bmMgYnVuZGxlKGRpcmVjdG9yaWVzOiByZWFkb25seSBJRGlzY292ZXJlZERpcmVjdG9yeVtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTxJQnVuZGxlUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKGRpcmVjdG9yaWVzLmxlbmd0aCA9PT0gMCB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNoUGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgZmlsZXM6IHsgcmVhZG9ubHkgZGVzdFVyaTogVVJJOyByZWFkb25seSBjb250ZW50OiBWU0J1ZmZlciB9W10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgZGlzY292ZXJlZERpcmVjdG9yeSBvZiBkaXJlY3Rvcmllcykge1xuXHRcdFx0Y29uc3QgZGlyID0gcGx1Z2luRGlyRm9yVHlwZShkaXNjb3ZlcmVkRGlyZWN0b3J5LnR5cGUpO1xuXHRcdFx0aWYgKCFkaXIpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIGRvIG5vdCBidW5kbGUgYWdlbnQgaW5zdHJ1Y3Rpb25zXG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZGlzY292ZXJlZERpcmVjdG9yeS5maWxlcykge1xuXHRcdFx0XHRjb25zdCBmaWxlVXJpID0gZmlsZS51cmk7XG5cdFx0XHRcdGNvbnN0IGZpbGVOYW1lID0gYmFzZW5hbWUoZmlsZVVyaSk7XG5cblx0XHRcdFx0bGV0IGRlc3RVcmk6IFVSSTtcblx0XHRcdFx0bGV0IGhhc2hLZXk6IHN0cmluZztcblx0XHRcdFx0aWYgKGRpc2NvdmVyZWREaXJlY3RvcnkudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuU2tpbGwpIHtcblx0XHRcdFx0XHQvLyBTa2lsbHMgYXJlIGNvbnZlbnRpb25hbGx5IGA8c2tpbGxOYW1lPi9TS0lMTC5tZGAuIFByZXNlcnZlIHRoZVxuXHRcdFx0XHRcdC8vIGNvbnRhaW5pbmcgZGlyZWN0b3J5IG5hbWUgc28gbXVsdGlwbGUgc2tpbGxzIGRvbid0IGNvbGxpZGUuXG5cdFx0XHRcdFx0Y29uc3Qgc2tpbGxEaXJOYW1lID0gYmFzZW5hbWUoZGlybmFtZShmaWxlVXJpKSk7XG5cdFx0XHRcdFx0ZGVzdFVyaSA9IFVSSS5qb2luUGF0aCh0aGlzLl9yb290VXJpLCBkaXIsIHNraWxsRGlyTmFtZSwgZmlsZU5hbWUpO1xuXHRcdFx0XHRcdGhhc2hLZXkgPSBgJHtkaXJ9LyR7c2tpbGxEaXJOYW1lfS8ke2ZpbGVOYW1lfWA7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGVzdFVyaSA9IFVSSS5qb2luUGF0aCh0aGlzLl9yb290VXJpLCBkaXIsIGZpbGVOYW1lKTtcblx0XHRcdFx0XHRoYXNoS2V5ID0gYCR7ZGlyfS8ke2ZpbGVOYW1lfWA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoZmlsZVVyaSk7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZmlsZXMucHVzaCh7IGRlc3RVcmksIGNvbnRlbnQ6IGNvbnRlbnQudmFsdWUgfSk7XG5cdFx0XHRcdGhhc2hQYXJ0cy5wdXNoKGAke2hhc2hLZXl9OiR7Y29udGVudC52YWx1ZS50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aGFzaFBhcnRzLnNvcnQoKTtcblx0XHRjb25zdCBub25jZSA9IFN0cmluZyhoYXNoKGhhc2hQYXJ0cy5qb2luKCdcXG4nKSkpO1xuXG5cdFx0Y29uc3Qgcm9vdFVyaVN0cmluZyA9IHRoaXMuX3Jvb3RVcmkudG9TdHJpbmcoKSBhcyBQcm90b2NvbFVSSTtcblx0XHRjb25zdCByZXN1bHQgPSB7XG5cdFx0XHRyZWY6IHtcblx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdFx0XHRpZDogY3VzdG9taXphdGlvbklkKHJvb3RVcmlTdHJpbmcpLFxuXHRcdFx0XHR1cmk6IHJvb3RVcmlTdHJpbmcsXG5cdFx0XHRcdG5hbWU6IERJU1BMQVlfTkFNRSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0bm9uY2UsXG5cdFx0XHR9LFxuXHRcdH0gc2F0aXNmaWVzIElCdW5kbGVSZXN1bHQ7XG5cblx0XHRpZiAodGhpcy5fbGFzdE5vbmNlID09PSBub25jZSkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZGVsKHRoaXMuX3Jvb3RVcmksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gRGlyZWN0b3J5IG1heSBub3QgZXhpc3Qgb24gZmlyc3QgYnVuZGxlLlxuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFuaWZlc3RVcmkgPSBVUkkuam9pblBhdGgodGhpcy5fcm9vdFVyaSwgJy5wbHVnaW4nLCAncGx1Z2luLmpzb24nKTtcblx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVGb2xkZXIoZGlybmFtZShtYW5pZmVzdFVyaSkpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1hbmlmZXN0VXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKE1BTklGRVNUX0NPTlRFTlQpKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVGb2xkZXIoZGlybmFtZShmaWxlLmRlc3RVcmkpKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGZpbGUuZGVzdFVyaSwgZmlsZS5jb250ZW50KTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2xhc3ROb25jZSA9IG5vbmNlO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cbiJdLAogICJtYXBw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
