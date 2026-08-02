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
import { Sequencer } from "../../../../base/common/async.js";
import { decodeBase64, encodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isEmptyObject } from "../../../../base/common/types.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
const MCP_ENCRYPTION_KEY_NAME = "mcpEncryptionKey";
const MCP_ENCRYPTION_KEY_ALGORITHM = "AES-GCM";
const MCP_ENCRYPTION_KEY_LEN = 256;
const MCP_ENCRYPTION_IV_LENGTH = 12;
const MCP_DATA_STORED_VERSION = 1;
const MCP_DATA_STORED_KEY = "mcpInputs";
let McpRegistryInputStorage = class extends Disposable {
  constructor(_scope, _target, _storageService, _secretStorageService, _logService) {
    super();
    this._scope = _scope;
    this._storageService = _storageService;
    this._secretStorageService = _secretStorageService;
    this._logService = _logService;
    this._secretsSealerSequencer = new Sequencer();
    this._getEncryptionKey = new Lazy(() => {
      return McpRegistryInputStorage.secretSequencer.queue(async () => {
        const existing = await this._secretStorageService.get(MCP_ENCRYPTION_KEY_NAME);
        if (existing) {
          try {
            const parsed = JSON.parse(existing);
            return await crypto.subtle.importKey("jwk", parsed, MCP_ENCRYPTION_KEY_ALGORITHM, false, ["encrypt", "decrypt"]);
          } catch {
          }
        }
        const key = await crypto.subtle.generateKey(
          { name: MCP_ENCRYPTION_KEY_ALGORITHM, length: MCP_ENCRYPTION_KEY_LEN },
          true,
          ["encrypt", "decrypt"]
        );
        const exported = await crypto.subtle.exportKey("jwk", key);
        await this._secretStorageService.set(MCP_ENCRYPTION_KEY_NAME, JSON.stringify(exported));
        return key;
      });
    });
    this._didChange = false;
    this._record = new Lazy(() => {
      const stored = this._storageService.getObject(MCP_DATA_STORED_KEY, this._scope);
      return stored?.version === MCP_DATA_STORED_VERSION ? { ...stored } : { version: MCP_DATA_STORED_VERSION, values: {} };
    });
    this._register(_storageService.onWillSaveState(() => {
      if (this._didChange) {
        this._storageService.store(MCP_DATA_STORED_KEY, {
          version: MCP_DATA_STORED_VERSION,
          values: this._record.value.values,
          secrets: this._record.value.secrets
        }, this._scope, _target);
        this._didChange = false;
      }
    }));
  }
  /** Deletes all collection data from storage. */
  clearAll() {
    this._record.value.values = {};
    this._record.value.secrets = void 0;
    this._record.value.unsealedSecrets = void 0;
    this._didChange = true;
  }
  /** Delete a single collection data from the storage. */
  async clear(inputKey) {
    const secrets = await this._unsealSecrets();
    delete this._record.value.values[inputKey];
    this._didChange = true;
    if (secrets.hasOwnProperty(inputKey)) {
      delete secrets[inputKey];
      await this._sealSecrets();
    }
  }
  /** Gets a mapping of saved input data. */
  async getMap() {
    const secrets = await this._unsealSecrets();
    return { ...this._record.value.values, ...secrets };
  }
  /** Updates the input data mapping. */
  async setPlainText(values) {
    Object.assign(this._record.value.values, values);
    this._didChange = true;
  }
  /** Updates the input secrets mapping. */
  async setSecrets(values) {
    const unsealed = await this._unsealSecrets();
    Object.assign(unsealed, values);
    await this._sealSecrets();
  }
  async _sealSecrets() {
    const key = await this._getEncryptionKey.value;
    return this._secretsSealerSequencer.queue(async () => {
      if (!this._record.value.unsealedSecrets || isEmptyObject(this._record.value.unsealedSecrets)) {
        this._record.value.secrets = void 0;
        return;
      }
      const toSeal = JSON.stringify(this._record.value.unsealedSecrets);
      const iv = crypto.getRandomValues(new Uint8Array(MCP_ENCRYPTION_IV_LENGTH));
      const encrypted = await crypto.subtle.encrypt(
        { name: MCP_ENCRYPTION_KEY_ALGORITHM, iv: iv.buffer },
        key,
        new TextEncoder().encode(toSeal).buffer
      );
      const enc = encodeBase64(VSBuffer.wrap(new Uint8Array(encrypted)));
      this._record.value.secrets = { iv: encodeBase64(VSBuffer.wrap(iv)), value: enc };
      this._didChange = true;
    });
  }
  async _unsealSecrets() {
    if (!this._record.value.secrets) {
      return this._record.value.unsealedSecrets ??= {};
    }
    if (this._record.value.unsealedSecrets) {
      return this._record.value.unsealedSecrets;
    }
    try {
      const key = await this._getEncryptionKey.value;
      const iv = decodeBase64(this._record.value.secrets.iv);
      const encrypted = decodeBase64(this._record.value.secrets.value);
      const decrypted = await crypto.subtle.decrypt(
        { name: MCP_ENCRYPTION_KEY_ALGORITHM, iv: iv.buffer },
        key,
        encrypted.buffer
      );
      const unsealedSecrets = JSON.parse(new TextDecoder().decode(decrypted));
      this._record.value.unsealedSecrets = unsealedSecrets;
      return unsealedSecrets;
    } catch (e) {
      this._logService.warn("Error unsealing MCP secrets", e);
      this._record.value.secrets = void 0;
    }
    return {};
  }
};
McpRegistryInputStorage.secretSequencer = new Sequencer();
McpRegistryInputStorage = __decorateClass([
  __decorateParam(2, IStorageService),
  __decorateParam(3, ISecretStorageService),
  __decorateParam(4, ILogService)
], McpRegistryInputStorage);
export {
  McpRegistryInputStorage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwUmVnaXN0cnlJbnB1dFN0b3JhZ2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTZXF1ZW5jZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBkZWNvZGVCYXNlNjQsIGVuY29kZUJhc2U2NCwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0VtcHR5T2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zZWNyZXRzL2NvbW1vbi9zZWNyZXRzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5qcyc7XG5cbmNvbnN0IE1DUF9FTkNSWVBUSU9OX0tFWV9OQU1FID0gJ21jcEVuY3J5cHRpb25LZXknO1xuY29uc3QgTUNQX0VOQ1JZUFRJT05fS0VZX0FMR09SSVRITSA9ICdBRVMtR0NNJztcbmNvbnN0IE1DUF9FTkNSWVBUSU9OX0tFWV9MRU4gPSAyNTY7XG5jb25zdCBNQ1BfRU5DUllQVElPTl9JVl9MRU5HVEggPSAxMjsgLy8gOTYgYml0c1xuY29uc3QgTUNQX0RBVEFfU1RPUkVEX1ZFUlNJT04gPSAxO1xuY29uc3QgTUNQX0RBVEFfU1RPUkVEX0tFWSA9ICdtY3BJbnB1dHMnO1xuXG5pbnRlcmZhY2UgSVN0b3JlZERhdGEge1xuXHR2ZXJzaW9uOiBudW1iZXI7XG5cdHZhbHVlczogUmVjb3JkPHN0cmluZywgSVJlc29sdmVkVmFsdWU+O1xuXHRzZWNyZXRzPzogeyB2YWx1ZTogc3RyaW5nOyBpdjogc3RyaW5nIH07IC8vIGJhc2U2NCwgZW5jcnlwdGVkXG59XG5cbmludGVyZmFjZSBJSHlkcmF0ZWREYXRhIGV4dGVuZHMgSVN0b3JlZERhdGEge1xuXHR1bnNlYWxlZFNlY3JldHM/OiBSZWNvcmQ8c3RyaW5nLCBJUmVzb2x2ZWRWYWx1ZT47XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BSZWdpc3RyeUlucHV0U3RvcmFnZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHN0YXRpYyBzZWNyZXRTZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlY3JldHNTZWFsZXJTZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZ2V0RW5jcnlwdGlvbktleSA9IG5ldyBMYXp5KCgpID0+IHtcblx0XHRyZXR1cm4gTWNwUmVnaXN0cnlJbnB1dFN0b3JhZ2Uuc2VjcmV0U2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgdGhpcy5fc2VjcmV0U3RvcmFnZVNlcnZpY2UuZ2V0KE1DUF9FTkNSWVBUSU9OX0tFWV9OQU1FKTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnNlZDogSnNvbldlYktleSA9IEpTT04ucGFyc2UoZXhpc3RpbmcpO1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCBjcnlwdG8uc3VidGxlLmltcG9ydEtleSgnandrJywgcGFyc2VkLCBNQ1BfRU5DUllQVElPTl9LRVlfQUxHT1JJVEhNLCBmYWxzZSwgWydlbmNyeXB0JywgJ2RlY3J5cHQnXSk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIGZhbGwgdGhyb3VnaFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGtleSA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZ2VuZXJhdGVLZXkoXG5cdFx0XHRcdHsgbmFtZTogTUNQX0VOQ1JZUFRJT05fS0VZX0FMR09SSVRITSwgbGVuZ3RoOiBNQ1BfRU5DUllQVElPTl9LRVlfTEVOIH0sXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdFsnZW5jcnlwdCcsICdkZWNyeXB0J10sXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBleHBvcnRlZCA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZXhwb3J0S2V5KCdqd2snLCBrZXkpO1xuXHRcdFx0YXdhaXQgdGhpcy5fc2VjcmV0U3RvcmFnZVNlcnZpY2Uuc2V0KE1DUF9FTkNSWVBUSU9OX0tFWV9OQU1FLCBKU09OLnN0cmluZ2lmeShleHBvcnRlZCkpO1xuXHRcdFx0cmV0dXJuIGtleTtcblx0XHR9KTtcblx0fSk7XG5cblx0cHJpdmF0ZSBfZGlkQ2hhbmdlID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfcmVjb3JkID0gbmV3IExhenk8SUh5ZHJhdGVkRGF0YT4oKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlZCA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdDxJU3RvcmVkRGF0YT4oTUNQX0RBVEFfU1RPUkVEX0tFWSwgdGhpcy5fc2NvcGUpO1xuXHRcdHJldHVybiBzdG9yZWQ/LnZlcnNpb24gPT09IE1DUF9EQVRBX1NUT1JFRF9WRVJTSU9OID8geyAuLi5zdG9yZWQgfSA6IHsgdmVyc2lvbjogTUNQX0RBVEFfU1RPUkVEX1ZFUlNJT04sIHZhbHVlczoge30gfTtcblx0fSk7XG5cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zY29wZTogU3RvcmFnZVNjb3BlLFxuXHRcdF90YXJnZXQ6IFN0b3JhZ2VUYXJnZXQsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2VjcmV0U3RvcmFnZVNlcnZpY2U6IElTZWNyZXRTdG9yYWdlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihfc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9kaWRDaGFuZ2UpIHtcblx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoTUNQX0RBVEFfU1RPUkVEX0tFWSwge1xuXHRcdFx0XHRcdHZlcnNpb246IE1DUF9EQVRBX1NUT1JFRF9WRVJTSU9OLFxuXHRcdFx0XHRcdHZhbHVlczogdGhpcy5fcmVjb3JkLnZhbHVlLnZhbHVlcyxcblx0XHRcdFx0XHRzZWNyZXRzOiB0aGlzLl9yZWNvcmQudmFsdWUuc2VjcmV0cyxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVN0b3JlZERhdGEsIHRoaXMuX3Njb3BlLCBfdGFyZ2V0KTtcblx0XHRcdFx0dGhpcy5fZGlkQ2hhbmdlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqIERlbGV0ZXMgYWxsIGNvbGxlY3Rpb24gZGF0YSBmcm9tIHN0b3JhZ2UuICovXG5cdHB1YmxpYyBjbGVhckFsbCgpIHtcblx0XHR0aGlzLl9yZWNvcmQudmFsdWUudmFsdWVzID0ge307XG5cdFx0dGhpcy5fcmVjb3JkLnZhbHVlLnNlY3JldHMgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVjb3JkLnZhbHVlLnVuc2VhbGVkU2VjcmV0cyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9kaWRDaGFuZ2UgPSB0cnVlO1xuXHR9XG5cblx0LyoqIERlbGV0ZSBhIHNpbmdsZSBjb2xsZWN0aW9uIGRhdGEgZnJvbSB0aGUgc3RvcmFnZS4gKi9cblx0cHVibGljIGFzeW5jIGNsZWFyKGlucHV0S2V5OiBzdHJpbmcpIHtcblx0XHRjb25zdCBzZWNyZXRzID0gYXdhaXQgdGhpcy5fdW5zZWFsU2VjcmV0cygpO1xuXHRcdGRlbGV0ZSB0aGlzLl9yZWNvcmQudmFsdWUudmFsdWVzW2lucHV0S2V5XTtcblx0XHR0aGlzLl9kaWRDaGFuZ2UgPSB0cnVlO1xuXG5cdFx0aWYgKHNlY3JldHMuaGFzT3duUHJvcGVydHkoaW5wdXRLZXkpKSB7XG5cdFx0XHRkZWxldGUgc2VjcmV0c1tpbnB1dEtleV07XG5cdFx0XHRhd2FpdCB0aGlzLl9zZWFsU2VjcmV0cygpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBHZXRzIGEgbWFwcGluZyBvZiBzYXZlZCBpbnB1dCBkYXRhLiAqL1xuXHRwdWJsaWMgYXN5bmMgZ2V0TWFwKCkge1xuXHRcdGNvbnN0IHNlY3JldHMgPSBhd2FpdCB0aGlzLl91bnNlYWxTZWNyZXRzKCk7XG5cdFx0cmV0dXJuIHsgLi4udGhpcy5fcmVjb3JkLnZhbHVlLnZhbHVlcywgLi4uc2VjcmV0cyB9O1xuXHR9XG5cblx0LyoqIFVwZGF0ZXMgdGhlIGlucHV0IGRhdGEgbWFwcGluZy4gKi9cblx0cHVibGljIGFzeW5jIHNldFBsYWluVGV4dCh2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIElSZXNvbHZlZFZhbHVlPikge1xuXHRcdE9iamVjdC5hc3NpZ24odGhpcy5fcmVjb3JkLnZhbHVlLnZhbHVlcywgdmFsdWVzKTtcblx0XHR0aGlzLl9kaWRDaGFuZ2UgPSB0cnVlO1xuXHR9XG5cblx0LyoqIFVwZGF0ZXMgdGhlIGlucHV0IHNlY3JldHMgbWFwcGluZy4gKi9cblx0cHVibGljIGFzeW5jIHNldFNlY3JldHModmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCBJUmVzb2x2ZWRWYWx1ZT4pIHtcblx0XHRjb25zdCB1bnNlYWxlZCA9IGF3YWl0IHRoaXMuX3Vuc2VhbFNlY3JldHMoKTtcblx0XHRPYmplY3QuYXNzaWduKHVuc2VhbGVkLCB2YWx1ZXMpO1xuXHRcdGF3YWl0IHRoaXMuX3NlYWxTZWNyZXRzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZWFsU2VjcmV0cygpIHtcblx0XHRjb25zdCBrZXkgPSBhd2FpdCB0aGlzLl9nZXRFbmNyeXB0aW9uS2V5LnZhbHVlO1xuXHRcdHJldHVybiB0aGlzLl9zZWNyZXRzU2VhbGVyU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5fcmVjb3JkLnZhbHVlLnVuc2VhbGVkU2VjcmV0cyB8fCBpc0VtcHR5T2JqZWN0KHRoaXMuX3JlY29yZC52YWx1ZS51bnNlYWxlZFNlY3JldHMpKSB7XG5cdFx0XHRcdHRoaXMuX3JlY29yZC52YWx1ZS5zZWNyZXRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRvU2VhbCA9IEpTT04uc3RyaW5naWZ5KHRoaXMuX3JlY29yZC52YWx1ZS51bnNlYWxlZFNlY3JldHMpO1xuXHRcdFx0Y29uc3QgaXYgPSBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKG5ldyBVaW50OEFycmF5KE1DUF9FTkNSWVBUSU9OX0lWX0xFTkdUSCkpO1xuXHRcdFx0Y29uc3QgZW5jcnlwdGVkID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5lbmNyeXB0KFxuXHRcdFx0XHR7IG5hbWU6IE1DUF9FTkNSWVBUSU9OX0tFWV9BTEdPUklUSE0sIGl2OiBpdi5idWZmZXIgfSxcblx0XHRcdFx0a2V5LFxuXHRcdFx0XHRuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUodG9TZWFsKS5idWZmZXIgYXMgQXJyYXlCdWZmZXIsXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBlbmMgPSBlbmNvZGVCYXNlNjQoVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShlbmNyeXB0ZWQpKSk7XG5cdFx0XHR0aGlzLl9yZWNvcmQudmFsdWUuc2VjcmV0cyA9IHsgaXY6IGVuY29kZUJhc2U2NChWU0J1ZmZlci53cmFwKGl2KSksIHZhbHVlOiBlbmMgfTtcblx0XHRcdHRoaXMuX2RpZENoYW5nZSA9IHRydWU7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91bnNlYWxTZWNyZXRzKCk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgSVJlc29sdmVkVmFsdWU+PiB7XG5cdFx0aWYgKCF0aGlzLl9yZWNvcmQudmFsdWUuc2VjcmV0cykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlY29yZC52YWx1ZS51bnNlYWxlZFNlY3JldHMgPz89IHt9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9yZWNvcmQudmFsdWUudW5zZWFsZWRTZWNyZXRzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVjb3JkLnZhbHVlLnVuc2VhbGVkU2VjcmV0cztcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qga2V5ID0gYXdhaXQgdGhpcy5fZ2V0RW5jcnlwdGlvbktleS52YWx1ZTtcblx0XHRcdGNvbnN0IGl2ID0gZGVjb2RlQmFzZTY0KHRoaXMuX3JlY29yZC52YWx1ZS5zZWNyZXRzLml2KTtcblx0XHRcdGNvbnN0IGVuY3J5cHRlZCA9IGRlY29kZUJhc2U2NCh0aGlzLl9yZWNvcmQudmFsdWUuc2VjcmV0cy52YWx1ZSk7XG5cblx0XHRcdGNvbnN0IGRlY3J5cHRlZCA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGVjcnlwdChcblx0XHRcdFx0eyBuYW1lOiBNQ1BfRU5DUllQVElPTl9LRVlfQUxHT1JJVEhNLCBpdjogaXYuYnVmZmVyIGFzIFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+IH0sXG5cdFx0XHRcdGtleSxcblx0XHRcdFx0ZW5jcnlwdGVkLmJ1ZmZlciBhcyBVaW50OEFycmF5PEFycmF5QnVmZmVyPixcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHVuc2VhbGVkU2VjcmV0cyA9IEpTT04ucGFyc2UobmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGRlY3J5cHRlZCkpO1xuXHRcdFx0dGhpcy5fcmVjb3JkLnZhbHVlLnVuc2VhbGVkU2VjcmV0cyA9IHVuc2VhbGVkU2VjcmV0cztcblx0XHRcdHJldHVybiB1bnNlYWxlZFNlY3JldHM7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdFcnJvciB1bnNlYWxpbmcgTUNQIHNlY3JldHMnLCBlKTtcblx0XHRcdHRoaXMuX3JlY29yZC52YWx1ZS5zZWNyZXRzID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFL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
