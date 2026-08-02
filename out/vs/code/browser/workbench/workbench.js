import { isStandalone } from "../../../base/browser/browser.js";
import { addDisposableListener } from "../../../base/browser/dom.js";
import { mainWindow } from "../../../base/browser/window.js";
import { VSBuffer, decodeBase64, encodeBase64 } from "../../../base/common/buffer.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { parse } from "../../../base/common/marshalling.js";
import { Schemas } from "../../../base/common/network.js";
import { posix } from "../../../base/common/path.js";
import { isEqual } from "../../../base/common/resources.js";
import { ltrim } from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import product from "../../../platform/product/common/product.js";
import { isFolderToOpen, isWorkspaceToOpen } from "../../../platform/window/common/window.js";
import { create } from "../../../workbench/workbench.web.main.internal.js";
class TransparentCrypto {
  async seal(data) {
    return data;
  }
  async unseal(data) {
    return data;
  }
}
var AESConstants = /* @__PURE__ */ ((AESConstants2) => {
  AESConstants2["ALGORITHM"] = "AES-GCM";
  AESConstants2[AESConstants2["KEY_LENGTH"] = 256] = "KEY_LENGTH";
  AESConstants2[AESConstants2["IV_LENGTH"] = 12] = "IV_LENGTH";
  return AESConstants2;
})(AESConstants || {});
class NetworkError extends Error {
  constructor(inner) {
    super(inner.message);
    this.name = inner.name;
    this.stack = inner.stack;
  }
}
class ServerKeyedAESCrypto {
  constructor(authEndpoint) {
    this.authEndpoint = authEndpoint;
  }
  /**
   * Gets whether the algorithm is supported; requires a secure context
   */
  static supported() {
    return !!crypto.subtle;
  }
  async seal(data) {
    const iv = mainWindow.crypto.getRandomValues(new Uint8Array(12 /* IV_LENGTH */));
    const clientKeyObj = await mainWindow.crypto.subtle.generateKey(
      { name: "AES-GCM" /* ALGORITHM */, length: 256 /* KEY_LENGTH */ },
      true,
      ["encrypt", "decrypt"]
    );
    const clientKey = new Uint8Array(await mainWindow.crypto.subtle.exportKey("raw", clientKeyObj));
    const key = await this.getKey(clientKey);
    const dataUint8Array = new TextEncoder().encode(data);
    const cipherText = await mainWindow.crypto.subtle.encrypt(
      { name: "AES-GCM" /* ALGORITHM */, iv },
      key,
      dataUint8Array
    );
    const result = new Uint8Array([...clientKey, ...iv, ...new Uint8Array(cipherText)]);
    return encodeBase64(VSBuffer.wrap(result));
  }
  async unseal(data) {
    const dataUint8Array = decodeBase64(data);
    if (dataUint8Array.byteLength < 60) {
      throw Error("Invalid length for the value for credentials.crypto");
    }
    const keyLength = 256 /* KEY_LENGTH */ / 8;
    const clientKey = dataUint8Array.slice(0, keyLength);
    const iv = dataUint8Array.slice(keyLength, keyLength + 12 /* IV_LENGTH */);
    const cipherText = dataUint8Array.slice(keyLength + 12 /* IV_LENGTH */);
    const key = await this.getKey(clientKey.buffer);
    const decrypted = await mainWindow.crypto.subtle.decrypt(
      { name: "AES-GCM" /* ALGORITHM */, iv: iv.buffer },
      key,
      cipherText.buffer
    );
    return new TextDecoder().decode(new Uint8Array(decrypted));
  }
  /**
   * Given a clientKey, returns the CryptoKey object that is used to encrypt/decrypt the data.
   * The actual key is (clientKey XOR serverKey)
   */
  async getKey(clientKey) {
    if (!clientKey || clientKey.byteLength !== 256 /* KEY_LENGTH */ / 8) {
      throw Error("Invalid length for clientKey");
    }
    const serverKey = await this.getServerKeyPart();
    const keyData = new Uint8Array(256 /* KEY_LENGTH */ / 8);
    for (let i = 0; i < keyData.byteLength; i++) {
      keyData[i] = clientKey[i] ^ serverKey[i];
    }
    return mainWindow.crypto.subtle.importKey(
      "raw",
      keyData,
      {
        name: "AES-GCM" /* ALGORITHM */,
        length: 256 /* KEY_LENGTH */
      },
      true,
      ["encrypt", "decrypt"]
    );
  }
  async getServerKeyPart() {
    if (this.serverKey) {
      return this.serverKey;
    }
    let attempt = 0;
    let lastError;
    while (attempt <= 3) {
      try {
        const res = await fetch(this.authEndpoint, { credentials: "include", method: "POST" });
        if (!res.ok) {
          throw new Error(res.statusText);
        }
        const serverKey = new Uint8Array(await res.arrayBuffer());
        if (serverKey.byteLength !== 256 /* KEY_LENGTH */ / 8) {
          throw Error(`The key retrieved by the server is not ${256 /* KEY_LENGTH */} bit long.`);
        }
        this.serverKey = serverKey;
        return this.serverKey;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, attempt * attempt * 100));
      }
    }
    if (lastError) {
      throw new NetworkError(lastError);
    }
    throw new Error("Unknown error");
  }
}
class LocalStorageSecretStorageProvider {
  constructor(crypto2) {
    this.crypto = crypto2;
    this.storageKey = "secrets.provider";
    this.type = "persisted";
    this.secretsPromise = this.load();
  }
  async load() {
    const record = this.loadAuthSessionFromElement();
    const encrypted = localStorage.getItem(this.storageKey);
    if (encrypted) {
      try {
        const decrypted = JSON.parse(await this.crypto.unseal(encrypted));
        return { ...record, ...decrypted };
      } catch (err) {
        console.error("Failed to decrypt secrets from localStorage", err);
        if (!(err instanceof NetworkError)) {
          localStorage.removeItem(this.storageKey);
        }
      }
    }
    return record;
  }
  loadAuthSessionFromElement() {
    let authSessionInfo;
    const authSessionElement = mainWindow.document.getElementById("vscode-workbench-auth-session");
    const authSessionElementAttribute = authSessionElement ? authSessionElement.getAttribute("data-settings") : void 0;
    if (authSessionElementAttribute) {
      try {
        authSessionInfo = JSON.parse(authSessionElementAttribute);
      } catch (error) {
      }
    }
    if (!authSessionInfo) {
      return {};
    }
    const record = {};
    record[`${product.urlProtocol}.loginAccount`] = JSON.stringify(authSessionInfo);
    if (authSessionInfo.providerId !== "github") {
      console.error(`Unexpected auth provider: ${authSessionInfo.providerId}. Expected 'github'.`);
      return record;
    }
    const authAccount = JSON.stringify({ extensionId: "vscode.github-authentication", key: "github.auth" });
    record[authAccount] = JSON.stringify(authSessionInfo.scopes.map((scopes) => ({
      id: authSessionInfo.id,
      scopes,
      accessToken: authSessionInfo.accessToken
    })));
    return record;
  }
  async get(key) {
    const secrets = await this.secretsPromise;
    return secrets[key];
  }
  async set(key, value) {
    const secrets = await this.secretsPromise;
    secrets[key] = value;
    this.secretsPromise = Promise.resolve(secrets);
    this.save();
  }
  async delete(key) {
    const secrets = await this.secretsPromise;
    delete secrets[key];
    this.secretsPromise = Promise.resolve(secrets);
    this.save();
  }
  async keys() {
    const secrets = await this.secretsPromise;
    return Object.keys(secrets) || [];
  }
  async save() {
    try {
      const encrypted = await this.crypto.seal(JSON.stringify(await this.secretsPromise));
      localStorage.setItem(this.storageKey, encrypted);
    } catch (err) {
      console.error(err);
    }
  }
}
const _LocalStorageURLCallbackProvider = class _LocalStorageURLCallbackProvider extends Disposable {
  constructor(_callbackRoute) {
    super();
    this._callbackRoute = _callbackRoute;
    this._onCallback = this._register(new Emitter());
    this.onCallback = this._onCallback.event;
    this.pendingCallbacks = /* @__PURE__ */ new Set();
    this.lastTimeChecked = Date.now();
    this.checkCallbacksTimeout = void 0;
  }
  create(options = {}) {
    const id = ++_LocalStorageURLCallbackProvider.REQUEST_ID;
    const queryParams = [`vscode-reqid=${id}`];
    for (const key of _LocalStorageURLCallbackProvider.QUERY_KEYS) {
      const value = options[key];
      if (value) {
        queryParams.push(`vscode-${key}=${encodeURIComponent(value)}`);
      }
    }
    if (!(options.authority === "vscode.github-authentication" && options.path === "/dummy")) {
      const key = `vscode-web.url-callbacks[${id}]`;
      localStorage.removeItem(key);
      this.pendingCallbacks.add(id);
      this.startListening();
    }
    return URI.parse(mainWindow.location.href).with({ path: this._callbackRoute, query: queryParams.join("&") });
  }
  startListening() {
    if (this.onDidChangeLocalStorageDisposable) {
      return;
    }
    this.onDidChangeLocalStorageDisposable = addDisposableListener(mainWindow, "storage", () => this.onDidChangeLocalStorage());
  }
  stopListening() {
    this.onDidChangeLocalStorageDisposable?.dispose();
    this.onDidChangeLocalStorageDisposable = void 0;
  }
  // this fires every time local storage changes, but we
  // don't want to check more often than once a second
  async onDidChangeLocalStorage() {
    const ellapsed = Date.now() - this.lastTimeChecked;
    if (ellapsed > 1e3) {
      this.checkCallbacks();
    } else if (this.checkCallbacksTimeout === void 0) {
      this.checkCallbacksTimeout = setTimeout(() => {
        this.checkCallbacksTimeout = void 0;
        this.checkCallbacks();
      }, 1e3 - ellapsed);
    }
  }
  checkCallbacks() {
    let pendingCallbacks;
    for (const id of this.pendingCallbacks) {
      const key = `vscode-web.url-callbacks[${id}]`;
      const result = localStorage.getItem(key);
      if (result !== null) {
        try {
          this._onCallback.fire(URI.revive(JSON.parse(result)));
        } catch (error) {
          console.error(error);
        }
        pendingCallbacks = pendingCallbacks ?? new Set(this.pendingCallbacks);
        pendingCallbacks.delete(id);
        localStorage.removeItem(key);
      }
    }
    if (pendingCallbacks) {
      this.pendingCallbacks = pendingCallbacks;
      if (this.pendingCallbacks.size === 0) {
        this.stopListening();
      }
    }
    this.lastTimeChecked = Date.now();
  }
  dispose() {
    clearTimeout(this.checkCallbacksTimeout);
    this.stopListening();
    super.dispose();
  }
};
_LocalStorageURLCallbackProvider.REQUEST_ID = 0;
_LocalStorageURLCallbackProvider.QUERY_KEYS = [
  "scheme",
  "authority",
  "path",
  "query",
  "fragment"
];
let LocalStorageURLCallbackProvider = _LocalStorageURLCallbackProvider;
const _WorkspaceProvider = class _WorkspaceProvider {
  constructor(workspace, payload, config) {
    this.workspace = workspace;
    this.payload = payload;
    this.config = config;
    this.trusted = true;
  }
  static create(config) {
    let foundWorkspace = false;
    let workspace;
    let payload = /* @__PURE__ */ Object.create(null);
    const query = new URL(document.location.href).searchParams;
    query.forEach((value, key) => {
      switch (key) {
        // Folder
        case _WorkspaceProvider.QUERY_PARAM_FOLDER:
          if (config.remoteAuthority && value.startsWith(posix.sep)) {
            workspace = { folderUri: URI.from({ scheme: Schemas.vscodeRemote, path: value, authority: config.remoteAuthority }) };
          } else {
            workspace = { folderUri: URI.parse(value) };
          }
          foundWorkspace = true;
          break;
        // Workspace
        case _WorkspaceProvider.QUERY_PARAM_WORKSPACE:
          if (config.remoteAuthority && value.startsWith(posix.sep)) {
            workspace = { workspaceUri: URI.from({ scheme: Schemas.vscodeRemote, path: value, authority: config.remoteAuthority }) };
          } else {
            workspace = { workspaceUri: URI.parse(value) };
          }
          foundWorkspace = true;
          break;
        // Empty
        case _WorkspaceProvider.QUERY_PARAM_EMPTY_WINDOW:
          workspace = void 0;
          foundWorkspace = true;
          break;
        // Payload
        case _WorkspaceProvider.QUERY_PARAM_PAYLOAD:
          try {
            payload = parse(value);
          } catch (error) {
            console.error(error);
          }
          break;
      }
    });
    if (!foundWorkspace) {
      if (config.folderUri) {
        workspace = { folderUri: URI.revive(config.folderUri) };
      } else if (config.workspaceUri) {
        workspace = { workspaceUri: URI.revive(config.workspaceUri) };
      }
    }
    return new _WorkspaceProvider(workspace, payload, config);
  }
  async open(workspace, options) {
    if (options?.reuse && !options.payload && this.isSame(this.workspace, workspace)) {
      return true;
    }
    const targetHref = this.createTargetUrl(workspace, options);
    if (targetHref) {
      if (options?.reuse) {
        mainWindow.location.href = targetHref;
        return true;
      } else {
        let result;
        if (isStandalone()) {
          result = mainWindow.open(targetHref, "_blank", "toolbar=no");
        } else {
          result = mainWindow.open(targetHref);
        }
        return !!result;
      }
    }
    return false;
  }
  createTargetUrl(workspace, options) {
    let targetHref = void 0;
    if (!workspace) {
      targetHref = `${document.location.origin}${document.location.pathname}?${_WorkspaceProvider.QUERY_PARAM_EMPTY_WINDOW}=true`;
    } else if (isFolderToOpen(workspace)) {
      const queryParamFolder = this.encodeWorkspacePath(workspace.folderUri);
      targetHref = `${document.location.origin}${document.location.pathname}?${_WorkspaceProvider.QUERY_PARAM_FOLDER}=${queryParamFolder}`;
    } else if (isWorkspaceToOpen(workspace)) {
      const queryParamWorkspace = this.encodeWorkspacePath(workspace.workspaceUri);
      targetHref = `${document.location.origin}${document.location.pathname}?${_WorkspaceProvider.QUERY_PARAM_WORKSPACE}=${queryParamWorkspace}`;
    }
    if (options?.payload) {
      targetHref += `&${_WorkspaceProvider.QUERY_PARAM_PAYLOAD}=${encodeURIComponent(JSON.stringify(options.payload))}`;
    }
    return targetHref;
  }
  encodeWorkspacePath(uri) {
    if (this.config.remoteAuthority && uri.scheme === Schemas.vscodeRemote) {
      return encodeURIComponent(`${posix.sep}${ltrim(uri.path, posix.sep)}`).replaceAll("%2F", "/");
    }
    return encodeURIComponent(uri.toString(true));
  }
  isSame(workspaceA, workspaceB) {
    if (!workspaceA || !workspaceB) {
      return workspaceA === workspaceB;
    }
    if (isFolderToOpen(workspaceA) && isFolderToOpen(workspaceB)) {
      return isEqual(workspaceA.folderUri, workspaceB.folderUri);
    }
    if (isWorkspaceToOpen(workspaceA) && isWorkspaceToOpen(workspaceB)) {
      return isEqual(workspaceA.workspaceUri, workspaceB.workspaceUri);
    }
    return false;
  }
  hasRemote() {
    if (this.workspace) {
      if (isFolderToOpen(this.workspace)) {
        return this.workspace.folderUri.scheme === Schemas.vscodeRemote;
      }
      if (isWorkspaceToOpen(this.workspace)) {
        return this.workspace.workspaceUri.scheme === Schemas.vscodeRemote;
      }
    }
    return true;
  }
};
_WorkspaceProvider.QUERY_PARAM_EMPTY_WINDOW = "ew";
_WorkspaceProvider.QUERY_PARAM_FOLDER = "folder";
_WorkspaceProvider.QUERY_PARAM_WORKSPACE = "workspace";
_WorkspaceProvider.QUERY_PARAM_PAYLOAD = "payload";
let WorkspaceProvider = _WorkspaceProvider;
function readCookie(name) {
  const cookies = document.cookie.split("; ");
  for (const cookie of cookies) {
    if (cookie.startsWith(name + "=")) {
      return cookie.substring(name.length + 1);
    }
  }
  return void 0;
}
(function() {
  const configElement = mainWindow.document.getElementById("vscode-workbench-web-configuration");
  const configElementAttribute = configElement ? configElement.getAttribute("data-settings") : void 0;
  if (!configElement || !configElementAttribute) {
    throw new Error("Missing web configuration element");
  }
  const config = JSON.parse(configElementAttribute);
  const secretStorageKeyPath = readCookie("vscode-secret-key-path");
  const secretStorageCrypto = secretStorageKeyPath && ServerKeyedAESCrypto.supported() ? new ServerKeyedAESCrypto(secretStorageKeyPath) : new TransparentCrypto();
  create(mainWindow.document.body, {
    ...config,
    windowIndicator: config.windowIndicator ?? { label: "$(remote)", tooltip: `${product.nameShort} Web` },
    settingsSyncOptions: config.settingsSyncOptions ? { enabled: config.settingsSyncOptions.enabled } : void 0,
    workspaceProvider: WorkspaceProvider.create(config),
    urlCallbackProvider: new LocalStorageURLCallbackProvider(config.callbackRoute),
    secretStorageProvider: config.remoteAuthority && !secretStorageKeyPath ? void 0 : new LocalStorageSecretStorageProvider(secretStorageCrypto)
  });
})();
export {
  LocalStorageSecretStorageProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2NvZGUvYnJvd3Nlci93b3JrYmVuY2gvd29ya2JlbmNoLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNTdGFuZGFsb25lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciwgZGVjb2RlQmFzZTY0LCBlbmNvZGVCYXNlNjQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgcG9zaXggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgbHRyaW0gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IElTZWNyZXRTdG9yYWdlUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zZWNyZXRzL2NvbW1vbi9zZWNyZXRzLmpzJztcbmltcG9ydCB7IGlzRm9sZGVyVG9PcGVuLCBpc1dvcmtzcGFjZVRvT3BlbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB0eXBlIHsgSVdvcmtiZW5jaENvbnN0cnVjdGlvbk9wdGlvbnMsIElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL3dlYi5hcGkuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25TZXNzaW9uSW5mbyB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElVUkxDYWxsYmFja1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3VybC9icm93c2VyL3VybFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlIH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL3dvcmtiZW5jaC53ZWIubWFpbi5pbnRlcm5hbC5qcyc7XG5cbmludGVyZmFjZSBJU2VjcmV0U3RvcmFnZUNyeXB0byB7XG5cdHNlYWwoZGF0YTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+O1xuXHR1bnNlYWwoZGF0YTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+O1xufVxuXG5jbGFzcyBUcmFuc3BhcmVudENyeXB0byBpbXBsZW1lbnRzIElTZWNyZXRTdG9yYWdlQ3J5cHRvIHtcblxuXHRhc3luYyBzZWFsKGRhdGE6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblxuXHRhc3luYyB1bnNlYWwoZGF0YTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gZGF0YTtcblx0fVxufVxuXG5jb25zdCBlbnVtIEFFU0NvbnN0YW50cyB7XG5cdEFMR09SSVRITSA9ICdBRVMtR0NNJyxcblx0S0VZX0xFTkdUSCA9IDI1Nixcblx0SVZfTEVOR1RIID0gMTIsXG59XG5cbmNsYXNzIE5ldHdvcmtFcnJvciBleHRlbmRzIEVycm9yIHtcblxuXHRjb25zdHJ1Y3Rvcihpbm5lcjogRXJyb3IpIHtcblx0XHRzdXBlcihpbm5lci5tZXNzYWdlKTtcblx0XHR0aGlzLm5hbWUgPSBpbm5lci5uYW1lO1xuXHRcdHRoaXMuc3RhY2sgPSBpbm5lci5zdGFjaztcblx0fVxufVxuXG5jbGFzcyBTZXJ2ZXJLZXllZEFFU0NyeXB0byBpbXBsZW1lbnRzIElTZWNyZXRTdG9yYWdlQ3J5cHRvIHtcblxuXHRwcml2YXRlIHNlcnZlcktleTogVWludDhBcnJheSB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogR2V0cyB3aGV0aGVyIHRoZSBhbGdvcml0aG0gaXMgc3VwcG9ydGVkOyByZXF1aXJlcyBhIHNlY3VyZSBjb250ZXh0XG5cdCAqL1xuXHRzdGF0aWMgc3VwcG9ydGVkKCkge1xuXHRcdHJldHVybiAhIWNyeXB0by5zdWJ0bGU7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGF1dGhFbmRwb2ludDogc3RyaW5nKSB7IH1cblxuXHRhc3luYyBzZWFsKGRhdGE6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Ly8gR2V0IGEgbmV3IGtleSBhbmQgSVYgb24gZXZlcnkgY2hhbmdlLCB0byBhdm9pZCB0aGUgcmlzayBvZiByZXVzaW5nIHRoZSBzYW1lIGtleSBhbmQgSVYgcGFpciB3aXRoIEFFUy1HQ01cblx0XHQvLyAoc2VlIGFsc286IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9BZXNHY21QYXJhbXMjcHJvcGVydGllcylcblx0XHRjb25zdCBpdiA9IG1haW5XaW5kb3cuY3J5cHRvLmdldFJhbmRvbVZhbHVlcyhuZXcgVWludDhBcnJheShBRVNDb25zdGFudHMuSVZfTEVOR1RIKSk7XG5cdFx0Ly8gY3J5cHRvLmdldFJhbmRvbVZhbHVlcyBpc24ndCBhIGdvb2QtZW5vdWdoIFBSTkcgdG8gZ2VuZXJhdGUgY3J5cHRvIGtleXMsIHNvIHdlIG5lZWQgdG8gdXNlIGNyeXB0by5zdWJ0bGUuZ2VuZXJhdGVLZXkgYW5kIGV4cG9ydCB0aGUga2V5IGluc3RlYWRcblx0XHRjb25zdCBjbGllbnRLZXlPYmogPSBhd2FpdCBtYWluV2luZG93LmNyeXB0by5zdWJ0bGUuZ2VuZXJhdGVLZXkoXG5cdFx0XHR7IG5hbWU6IEFFU0NvbnN0YW50cy5BTEdPUklUSE0gYXMgY29uc3QsIGxlbmd0aDogQUVTQ29uc3RhbnRzLktFWV9MRU5HVEggYXMgY29uc3QgfSxcblx0XHRcdHRydWUsXG5cdFx0XHRbJ2VuY3J5cHQnLCAnZGVjcnlwdCddXG5cdFx0KTtcblxuXHRcdGNvbnN0IGNsaWVudEtleSA9IG5ldyBVaW50OEFycmF5KGF3YWl0IG1haW5XaW5kb3cuY3J5cHRvLnN1YnRsZS5leHBvcnRLZXkoJ3JhdycsIGNsaWVudEtleU9iaikpO1xuXHRcdGNvbnN0IGtleSA9IGF3YWl0IHRoaXMuZ2V0S2V5KGNsaWVudEtleSk7XG5cdFx0Y29uc3QgZGF0YVVpbnQ4QXJyYXkgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoZGF0YSk7XG5cdFx0Y29uc3QgY2lwaGVyVGV4dDogQXJyYXlCdWZmZXIgPSBhd2FpdCBtYWluV2luZG93LmNyeXB0by5zdWJ0bGUuZW5jcnlwdChcblx0XHRcdHsgbmFtZTogQUVTQ29uc3RhbnRzLkFMR09SSVRITSBhcyBjb25zdCwgaXYgfSxcblx0XHRcdGtleSxcblx0XHRcdGRhdGFVaW50OEFycmF5XG5cdFx0KTtcblxuXHRcdC8vIEJhc2U2NCBlbmNvZGUgdGhlIHJlc3VsdCBhbmQgc3RvcmUgdGhlIGNpcGhlcnRleHQsIHRoZSBrZXksIGFuZCB0aGUgSVYgaW4gbG9jYWxTdG9yYWdlXG5cdFx0Ly8gTm90ZSB0aGF0IHRoZSBjbGllbnRLZXkgYW5kIElWIGRvbid0IG5lZWQgdG8gYmUgc2VjcmV0XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFVpbnQ4QXJyYXkoWy4uLmNsaWVudEtleSwgLi4uaXYsIC4uLm5ldyBVaW50OEFycmF5KGNpcGhlclRleHQpXSk7XG5cdFx0cmV0dXJuIGVuY29kZUJhc2U2NChWU0J1ZmZlci53cmFwKHJlc3VsdCkpO1xuXHR9XG5cblx0YXN5bmMgdW5zZWFsKGRhdGE6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Ly8gZW5jcnlwdGVkIHNob3VsZCBjb250YWluLCBpbiBvcmRlcjogdGhlIGtleSAoMzItYnl0ZSksIHRoZSBJViBmb3IgQUVTLUdDTSAoMTItYnl0ZSkgYW5kIHRoZSBjaXBoZXJ0ZXh0ICh3aGljaCBoYXMgdGhlIEdDTSBhdXRoIHRhZyBhdCB0aGUgZW5kKVxuXHRcdC8vIE1pbmltdW0gbGVuZ3RoIG11c3QgYmUgNDQgKGtleStJViBsZW5ndGgpICsgMTYgYnl0ZXMgKDEgYmxvY2sgZW5jcnlwdGVkIHdpdGggQUVTIC0gcmVnYXJkbGVzcyBvZiBrZXkgc2l6ZSlcblx0XHRjb25zdCBkYXRhVWludDhBcnJheSA9IGRlY29kZUJhc2U2NChkYXRhKTtcblxuXHRcdGlmIChkYXRhVWludDhBcnJheS5ieXRlTGVuZ3RoIDwgNjApIHtcblx0XHRcdHRocm93IEVycm9yKCdJbnZhbGlkIGxlbmd0aCBmb3IgdGhlIHZhbHVlIGZvciBjcmVkZW50aWFscy5jcnlwdG8nKTtcblx0XHR9XG5cblx0XHRjb25zdCBrZXlMZW5ndGggPSBBRVNDb25zdGFudHMuS0VZX0xFTkdUSCAvIDg7XG5cdFx0Y29uc3QgY2xpZW50S2V5ID0gZGF0YVVpbnQ4QXJyYXkuc2xpY2UoMCwga2V5TGVuZ3RoKTtcblx0XHRjb25zdCBpdiA9IGRhdGFVaW50OEFycmF5LnNsaWNlKGtleUxlbmd0aCwga2V5TGVuZ3RoICsgQUVTQ29uc3RhbnRzLklWX0xFTkdUSCk7XG5cdFx0Y29uc3QgY2lwaGVyVGV4dCA9IGRhdGFVaW50OEFycmF5LnNsaWNlKGtleUxlbmd0aCArIEFFU0NvbnN0YW50cy5JVl9MRU5HVEgpO1xuXG5cdFx0Ly8gRG8gdGhlIGRlY3J5cHRpb24gYW5kIHBhcnNlIHRoZSByZXN1bHQgYXMgSlNPTlxuXHRcdGNvbnN0IGtleSA9IGF3YWl0IHRoaXMuZ2V0S2V5KGNsaWVudEtleS5idWZmZXIpO1xuXHRcdGNvbnN0IGRlY3J5cHRlZCA9IGF3YWl0IG1haW5XaW5kb3cuY3J5cHRvLnN1YnRsZS5kZWNyeXB0KFxuXHRcdFx0eyBuYW1lOiBBRVNDb25zdGFudHMuQUxHT1JJVEhNIGFzIGNvbnN0LCBpdjogaXYuYnVmZmVyIGFzIFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+IH0sXG5cdFx0XHRrZXksXG5cdFx0XHRjaXBoZXJUZXh0LmJ1ZmZlciBhcyBVaW50OEFycmF5PEFycmF5QnVmZmVyPlxuXHRcdCk7XG5cblx0XHRyZXR1cm4gbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKG5ldyBVaW50OEFycmF5KGRlY3J5cHRlZCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVuIGEgY2xpZW50S2V5LCByZXR1cm5zIHRoZSBDcnlwdG9LZXkgb2JqZWN0IHRoYXQgaXMgdXNlZCB0byBlbmNyeXB0L2RlY3J5cHQgdGhlIGRhdGEuXG5cdCAqIFRoZSBhY3R1YWwga2V5IGlzIChjbGllbnRLZXkgWE9SIHNlcnZlcktleSlcblx0ICovXG5cdHByaXZhdGUgYXN5bmMgZ2V0S2V5KGNsaWVudEtleTogVWludDhBcnJheSk6IFByb21pc2U8Q3J5cHRvS2V5PiB7XG5cdFx0aWYgKCFjbGllbnRLZXkgfHwgY2xpZW50S2V5LmJ5dGVMZW5ndGggIT09IEFFU0NvbnN0YW50cy5LRVlfTEVOR1RIIC8gOCkge1xuXHRcdFx0dGhyb3cgRXJyb3IoJ0ludmFsaWQgbGVuZ3RoIGZvciBjbGllbnRLZXknKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXJ2ZXJLZXkgPSBhd2FpdCB0aGlzLmdldFNlcnZlcktleVBhcnQoKTtcblx0XHRjb25zdCBrZXlEYXRhID0gbmV3IFVpbnQ4QXJyYXkoQUVTQ29uc3RhbnRzLktFWV9MRU5HVEggLyA4KTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwga2V5RGF0YS5ieXRlTGVuZ3RoOyBpKyspIHtcblx0XHRcdGtleURhdGFbaV0gPSBjbGllbnRLZXlbaV0gXiBzZXJ2ZXJLZXlbaV07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1haW5XaW5kb3cuY3J5cHRvLnN1YnRsZS5pbXBvcnRLZXkoXG5cdFx0XHQncmF3Jyxcblx0XHRcdGtleURhdGEsXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IEFFU0NvbnN0YW50cy5BTEdPUklUSE0gYXMgY29uc3QsXG5cdFx0XHRcdGxlbmd0aDogQUVTQ29uc3RhbnRzLktFWV9MRU5HVEggYXMgY29uc3QsXG5cdFx0XHR9LFxuXHRcdFx0dHJ1ZSxcblx0XHRcdFsnZW5jcnlwdCcsICdkZWNyeXB0J11cblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTZXJ2ZXJLZXlQYXJ0KCk6IFByb21pc2U8VWludDhBcnJheT4ge1xuXHRcdGlmICh0aGlzLnNlcnZlcktleSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VydmVyS2V5O1xuXHRcdH1cblxuXHRcdGxldCBhdHRlbXB0ID0gMDtcblx0XHRsZXQgbGFzdEVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblxuXHRcdHdoaWxlIChhdHRlbXB0IDw9IDMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKHRoaXMuYXV0aEVuZHBvaW50LCB7IGNyZWRlbnRpYWxzOiAnaW5jbHVkZScsIG1ldGhvZDogJ1BPU1QnIH0pO1xuXHRcdFx0XHRpZiAoIXJlcy5vaykge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihyZXMuc3RhdHVzVGV4dCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzZXJ2ZXJLZXkgPSBuZXcgVWludDhBcnJheShhd2FpdCByZXMuYXJyYXlCdWZmZXIoKSk7XG5cdFx0XHRcdGlmIChzZXJ2ZXJLZXkuYnl0ZUxlbmd0aCAhPT0gQUVTQ29uc3RhbnRzLktFWV9MRU5HVEggLyA4KSB7XG5cdFx0XHRcdFx0dGhyb3cgRXJyb3IoYFRoZSBrZXkgcmV0cmlldmVkIGJ5IHRoZSBzZXJ2ZXIgaXMgbm90ICR7QUVTQ29uc3RhbnRzLktFWV9MRU5HVEh9IGJpdCBsb25nLmApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5zZXJ2ZXJLZXkgPSBzZXJ2ZXJLZXk7XG5cblx0XHRcdFx0cmV0dXJuIHRoaXMuc2VydmVyS2V5O1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRsYXN0RXJyb3IgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlIDogbmV3IEVycm9yKFN0cmluZyhlKSk7XG5cdFx0XHRcdGF0dGVtcHQrKztcblxuXHRcdFx0XHQvLyBleHBvbmVudGlhbCBiYWNrb2ZmXG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBhdHRlbXB0ICogYXR0ZW1wdCAqIDEwMCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChsYXN0RXJyb3IpIHtcblx0XHRcdHRocm93IG5ldyBOZXR3b3JrRXJyb3IobGFzdEVycm9yKTtcblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZXJyb3InKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTG9jYWxTdG9yYWdlU2VjcmV0U3RvcmFnZVByb3ZpZGVyIGltcGxlbWVudHMgSVNlY3JldFN0b3JhZ2VQcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzdG9yYWdlS2V5ID0gJ3NlY3JldHMucHJvdmlkZXInO1xuXG5cdHByaXZhdGUgc2VjcmV0c1Byb21pc2U6IFByb21pc2U8UmVjb3JkPHN0cmluZywgc3RyaW5nPj47XG5cblx0dHlwZTogJ2luLW1lbW9yeScgfCAncGVyc2lzdGVkJyB8ICd1bmtub3duJyA9ICdwZXJzaXN0ZWQnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY3J5cHRvOiBJU2VjcmV0U3RvcmFnZUNyeXB0byxcblx0KSB7XG5cdFx0dGhpcy5zZWNyZXRzUHJvbWlzZSA9IHRoaXMubG9hZCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsb2FkKCk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgc3RyaW5nPj4ge1xuXHRcdGNvbnN0IHJlY29yZCA9IHRoaXMubG9hZEF1dGhTZXNzaW9uRnJvbUVsZW1lbnQoKTtcblxuXHRcdGNvbnN0IGVuY3J5cHRlZCA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKHRoaXMuc3RvcmFnZUtleSk7XG5cdFx0aWYgKGVuY3J5cHRlZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZGVjcnlwdGVkID0gSlNPTi5wYXJzZShhd2FpdCB0aGlzLmNyeXB0by51bnNlYWwoZW5jcnlwdGVkKSk7XG5cblx0XHRcdFx0cmV0dXJuIHsgLi4ucmVjb3JkLCAuLi5kZWNyeXB0ZWQgfTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHQvLyBUT0RPOiBzZW5kIHRlbGVtZXRyeVxuXHRcdFx0XHRjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZGVjcnlwdCBzZWNyZXRzIGZyb20gbG9jYWxTdG9yYWdlJywgZXJyKTtcblx0XHRcdFx0aWYgKCEoZXJyIGluc3RhbmNlb2YgTmV0d29ya0Vycm9yKSkge1xuXHRcdFx0XHRcdGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKHRoaXMuc3RvcmFnZUtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVjb3JkO1xuXHR9XG5cblx0cHJpdmF0ZSBsb2FkQXV0aFNlc3Npb25Gcm9tRWxlbWVudCgpOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcblx0XHRsZXQgYXV0aFNlc3Npb25JbmZvOiAoQXV0aGVudGljYXRpb25TZXNzaW9uSW5mbyAmIHsgc2NvcGVzOiBzdHJpbmdbXVtdIH0pIHwgdW5kZWZpbmVkO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGF1dGhTZXNzaW9uRWxlbWVudCA9IG1haW5XaW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3ZzY29kZS13b3JrYmVuY2gtYXV0aC1zZXNzaW9uJyk7XG5cdFx0Y29uc3QgYXV0aFNlc3Npb25FbGVtZW50QXR0cmlidXRlID0gYXV0aFNlc3Npb25FbGVtZW50ID8gYXV0aFNlc3Npb25FbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1zZXR0aW5ncycpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChhdXRoU2Vzc2lvbkVsZW1lbnRBdHRyaWJ1dGUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF1dGhTZXNzaW9uSW5mbyA9IEpTT04ucGFyc2UoYXV0aFNlc3Npb25FbGVtZW50QXR0cmlidXRlKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7IC8qIEludmFsaWQgc2Vzc2lvbiBpcyBwYXNzZWQuIElnbm9yZS4gKi8gfVxuXHRcdH1cblxuXHRcdGlmICghYXV0aFNlc3Npb25JbmZvKSB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVjb3JkOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG5cblx0XHQvLyBTZXR0aW5ncyBTeW5jIEVudHJ5XG5cdFx0cmVjb3JkW2Ake3Byb2R1Y3QudXJsUHJvdG9jb2x9LmxvZ2luQWNjb3VudGBdID0gSlNPTi5zdHJpbmdpZnkoYXV0aFNlc3Npb25JbmZvKTtcblxuXHRcdC8vIEF1dGggZXh0ZW5zaW9uIEVudHJ5XG5cdFx0aWYgKGF1dGhTZXNzaW9uSW5mby5wcm92aWRlcklkICE9PSAnZ2l0aHViJykge1xuXHRcdFx0Y29uc29sZS5lcnJvcihgVW5leHBlY3RlZCBhdXRoIHByb3ZpZGVyOiAke2F1dGhTZXNzaW9uSW5mby5wcm92aWRlcklkfS4gRXhwZWN0ZWQgJ2dpdGh1YicuYCk7XG5cdFx0XHRyZXR1cm4gcmVjb3JkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF1dGhBY2NvdW50ID0gSlNPTi5zdHJpbmdpZnkoeyBleHRlbnNpb25JZDogJ3ZzY29kZS5naXRodWItYXV0aGVudGljYXRpb24nLCBrZXk6ICdnaXRodWIuYXV0aCcgfSk7XG5cdFx0cmVjb3JkW2F1dGhBY2NvdW50XSA9IEpTT04uc3RyaW5naWZ5KGF1dGhTZXNzaW9uSW5mby5zY29wZXMubWFwKHNjb3BlcyA9PiAoe1xuXHRcdFx0aWQ6IGF1dGhTZXNzaW9uSW5mby5pZCxcblx0XHRcdHNjb3Blcyxcblx0XHRcdGFjY2Vzc1Rva2VuOiBhdXRoU2Vzc2lvbkluZm8uYWNjZXNzVG9rZW5cblx0XHR9KSkpO1xuXG5cdFx0cmV0dXJuIHJlY29yZDtcblx0fVxuXG5cdGFzeW5jIGdldChrZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2VjcmV0cyA9IGF3YWl0IHRoaXMuc2VjcmV0c1Byb21pc2U7XG5cblx0XHRyZXR1cm4gc2VjcmV0c1trZXldO1xuXHR9XG5cblx0YXN5bmMgc2V0KGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VjcmV0cyA9IGF3YWl0IHRoaXMuc2VjcmV0c1Byb21pc2U7XG5cdFx0c2VjcmV0c1trZXldID0gdmFsdWU7XG5cdFx0dGhpcy5zZWNyZXRzUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShzZWNyZXRzKTtcblx0XHR0aGlzLnNhdmUoKTtcblx0fVxuXG5cdGFzeW5jIGRlbGV0ZShrZXk6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlY3JldHMgPSBhd2FpdCB0aGlzLnNlY3JldHNQcm9taXNlO1xuXHRcdGRlbGV0ZSBzZWNyZXRzW2tleV07XG5cdFx0dGhpcy5zZWNyZXRzUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShzZWNyZXRzKTtcblx0XHR0aGlzLnNhdmUoKTtcblx0fVxuXG5cdGFzeW5jIGtleXMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGNvbnN0IHNlY3JldHMgPSBhd2FpdCB0aGlzLnNlY3JldHNQcm9taXNlO1xuXHRcdHJldHVybiBPYmplY3Qua2V5cyhzZWNyZXRzKSB8fCBbXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2F2ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZW5jcnlwdGVkID0gYXdhaXQgdGhpcy5jcnlwdG8uc2VhbChKU09OLnN0cmluZ2lmeShhd2FpdCB0aGlzLnNlY3JldHNQcm9taXNlKSk7XG5cdFx0XHRsb2NhbFN0b3JhZ2Uuc2V0SXRlbSh0aGlzLnN0b3JhZ2VLZXksIGVuY3J5cHRlZCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGVycik7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIExvY2FsU3RvcmFnZVVSTENhbGxiYWNrUHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVVSTENhbGxiYWNrUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgc3RhdGljIFJFUVVFU1RfSUQgPSAwO1xuXG5cdHByaXZhdGUgc3RhdGljIFFVRVJZX0tFWVM6ICgnc2NoZW1lJyB8ICdhdXRob3JpdHknIHwgJ3BhdGgnIHwgJ3F1ZXJ5JyB8ICdmcmFnbWVudCcpW10gPSBbXG5cdFx0J3NjaGVtZScsXG5cdFx0J2F1dGhvcml0eScsXG5cdFx0J3BhdGgnLFxuXHRcdCdxdWVyeScsXG5cdFx0J2ZyYWdtZW50J1xuXHRdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ2FsbGJhY2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVUkk+KCkpO1xuXHRyZWFkb25seSBvbkNhbGxiYWNrID0gdGhpcy5fb25DYWxsYmFjay5ldmVudDtcblxuXHRwcml2YXRlIHBlbmRpbmdDYWxsYmFja3MgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0cHJpdmF0ZSBsYXN0VGltZUNoZWNrZWQgPSBEYXRlLm5vdygpO1xuXHRwcml2YXRlIGNoZWNrQ2FsbGJhY2tzVGltZW91dDogVGltZW91dCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBvbkRpZENoYW5nZUxvY2FsU3RvcmFnZURpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX2NhbGxiYWNrUm91dGU6IHN0cmluZykge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRjcmVhdGUob3B0aW9uczogUGFydGlhbDxVcmlDb21wb25lbnRzPiA9IHt9KTogVVJJIHtcblx0XHRjb25zdCBpZCA9ICsrTG9jYWxTdG9yYWdlVVJMQ2FsbGJhY2tQcm92aWRlci5SRVFVRVNUX0lEO1xuXHRcdGNvbnN0IHF1ZXJ5UGFyYW1zOiBzdHJpbmdbXSA9IFtgdnNjb2RlLXJlcWlkPSR7aWR9YF07XG5cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBMb2NhbFN0b3JhZ2VVUkxDYWxsYmFja1Byb3ZpZGVyLlFVRVJZX0tFWVMpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gb3B0aW9uc1trZXldO1xuXG5cdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0cXVlcnlQYXJhbXMucHVzaChgdnNjb2RlLSR7a2V5fT0ke2VuY29kZVVSSUNvbXBvbmVudCh2YWx1ZSl9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVE9ET0Bqb2FvIHJlbW92ZSBldmVudHVhbGx5XG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUtZGV2L2lzc3Vlcy82MlxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2Jsb2IvMTU5NDc5ZWI1YWU0NTFhNjZiNWRhYzNjMTJkNTY0ZjMyZjQ1NDc5Ni9leHRlbnNpb25zL2dpdGh1Yi1hdXRoZW50aWNhdGlvbi9zcmMvZ2l0aHViU2VydmVyLnRzI0w1MC1MNTBcblx0XHRpZiAoIShvcHRpb25zLmF1dGhvcml0eSA9PT0gJ3ZzY29kZS5naXRodWItYXV0aGVudGljYXRpb24nICYmIG9wdGlvbnMucGF0aCA9PT0gJy9kdW1teScpKSB7XG5cdFx0XHRjb25zdCBrZXkgPSBgdnNjb2RlLXdlYi51cmwtY2FsbGJhY2tzWyR7aWR9XWA7XG5cdFx0XHRsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShrZXkpO1xuXG5cdFx0XHR0aGlzLnBlbmRpbmdDYWxsYmFja3MuYWRkKGlkKTtcblx0XHRcdHRoaXMuc3RhcnRMaXN0ZW5pbmcoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gVVJJLnBhcnNlKG1haW5XaW5kb3cubG9jYXRpb24uaHJlZikud2l0aCh7IHBhdGg6IHRoaXMuX2NhbGxiYWNrUm91dGUsIHF1ZXJ5OiBxdWVyeVBhcmFtcy5qb2luKCcmJykgfSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXJ0TGlzdGVuaW5nKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm9uRGlkQ2hhbmdlTG9jYWxTdG9yYWdlRGlzcG9zYWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMub25EaWRDaGFuZ2VMb2NhbFN0b3JhZ2VEaXNwb3NhYmxlID0gYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1haW5XaW5kb3csICdzdG9yYWdlJywgKCkgPT4gdGhpcy5vbkRpZENoYW5nZUxvY2FsU3RvcmFnZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgc3RvcExpc3RlbmluZygpOiB2b2lkIHtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlTG9jYWxTdG9yYWdlRGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VMb2NhbFN0b3JhZ2VEaXNwb3NhYmxlID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8gdGhpcyBmaXJlcyBldmVyeSB0aW1lIGxvY2FsIHN0b3JhZ2UgY2hhbmdlcywgYnV0IHdlXG5cdC8vIGRvbid0IHdhbnQgdG8gY2hlY2sgbW9yZSBvZnRlbiB0aGFuIG9uY2UgYSBzZWNvbmRcblx0cHJpdmF0ZSBhc3luYyBvbkRpZENoYW5nZUxvY2FsU3RvcmFnZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlbGxhcHNlZCA9IERhdGUubm93KCkgLSB0aGlzLmxhc3RUaW1lQ2hlY2tlZDtcblxuXHRcdGlmIChlbGxhcHNlZCA+IDEwMDApIHtcblx0XHRcdHRoaXMuY2hlY2tDYWxsYmFja3MoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuY2hlY2tDYWxsYmFja3NUaW1lb3V0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuY2hlY2tDYWxsYmFja3NUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY2hlY2tDYWxsYmFja3NUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLmNoZWNrQ2FsbGJhY2tzKCk7XG5cdFx0XHR9LCAxMDAwIC0gZWxsYXBzZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2hlY2tDYWxsYmFja3MoKTogdm9pZCB7XG5cdFx0bGV0IHBlbmRpbmdDYWxsYmFja3M6IFNldDxudW1iZXI+IHwgdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChjb25zdCBpZCBvZiB0aGlzLnBlbmRpbmdDYWxsYmFja3MpIHtcblx0XHRcdGNvbnN0IGtleSA9IGB2c2NvZGUtd2ViLnVybC1jYWxsYmFja3NbJHtpZH1dYDtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKGtleSk7XG5cblx0XHRcdGlmIChyZXN1bHQgIT09IG51bGwpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR0aGlzLl9vbkNhbGxiYWNrLmZpcmUoVVJJLnJldml2ZShKU09OLnBhcnNlKHJlc3VsdCkpKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHBlbmRpbmdDYWxsYmFja3MgPSBwZW5kaW5nQ2FsbGJhY2tzID8/IG5ldyBTZXQodGhpcy5wZW5kaW5nQ2FsbGJhY2tzKTtcblx0XHRcdFx0cGVuZGluZ0NhbGxiYWNrcy5kZWxldGUoaWQpO1xuXHRcdFx0XHRsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChwZW5kaW5nQ2FsbGJhY2tzKSB7XG5cdFx0XHR0aGlzLnBlbmRpbmdDYWxsYmFja3MgPSBwZW5kaW5nQ2FsbGJhY2tzO1xuXG5cdFx0XHRpZiAodGhpcy5wZW5kaW5nQ2FsbGJhY2tzLnNpemUgPT09IDApIHtcblx0XHRcdFx0dGhpcy5zdG9wTGlzdGVuaW5nKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXN0VGltZUNoZWNrZWQgPSBEYXRlLm5vdygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRjbGVhclRpbWVvdXQodGhpcy5jaGVja0NhbGxiYWNrc1RpbWVvdXQpO1xuXHRcdHRoaXMuc3RvcExpc3RlbmluZygpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBXb3Jrc3BhY2VQcm92aWRlciBpbXBsZW1lbnRzIElXb3Jrc3BhY2VQcm92aWRlciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgUVVFUllfUEFSQU1fRU1QVFlfV0lORE9XID0gJ2V3Jztcblx0cHJpdmF0ZSBzdGF0aWMgUVVFUllfUEFSQU1fRk9MREVSID0gJ2ZvbGRlcic7XG5cdHByaXZhdGUgc3RhdGljIFFVRVJZX1BBUkFNX1dPUktTUEFDRSA9ICd3b3Jrc3BhY2UnO1xuXG5cdHByaXZhdGUgc3RhdGljIFFVRVJZX1BBUkFNX1BBWUxPQUQgPSAncGF5bG9hZCc7XG5cblx0c3RhdGljIGNyZWF0ZShjb25maWc6IElXb3JrYmVuY2hDb25zdHJ1Y3Rpb25PcHRpb25zICYgeyBmb2xkZXJVcmk/OiBVcmlDb21wb25lbnRzOyB3b3Jrc3BhY2VVcmk/OiBVcmlDb21wb25lbnRzIH0pIHtcblx0XHRsZXQgZm91bmRXb3Jrc3BhY2UgPSBmYWxzZTtcblx0XHRsZXQgd29ya3NwYWNlOiBJV29ya3NwYWNlO1xuXHRcdGxldCBwYXlsb2FkID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuXHRcdGNvbnN0IHF1ZXJ5ID0gbmV3IFVSTChkb2N1bWVudC5sb2NhdGlvbi5ocmVmKS5zZWFyY2hQYXJhbXM7XG5cdFx0cXVlcnkuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuXHRcdFx0c3dpdGNoIChrZXkpIHtcblxuXHRcdFx0XHQvLyBGb2xkZXJcblx0XHRcdFx0Y2FzZSBXb3Jrc3BhY2VQcm92aWRlci5RVUVSWV9QQVJBTV9GT0xERVI6XG5cdFx0XHRcdFx0aWYgKGNvbmZpZy5yZW1vdGVBdXRob3JpdHkgJiYgdmFsdWUuc3RhcnRzV2l0aChwb3NpeC5zZXApKSB7XG5cdFx0XHRcdFx0XHQvLyB3aGVuIGNvbm5lY3RlZCB0byBhIHJlbW90ZSBhbmQgaGF2aW5nIGEgdmFsdWVcblx0XHRcdFx0XHRcdC8vIHRoYXQgaXMgYSBwYXRoIChiZWdpbnMgd2l0aCBhIGAvYCksIGFzc3VtZSB0aGlzXG5cdFx0XHRcdFx0XHQvLyBpcyBhIHZzY29kZS1yZW1vdGUgcmVzb3VyY2UgYXMgc2ltcGxpZmllZCBVUkwuXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2UgPSB7IGZvbGRlclVyaTogVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlUmVtb3RlLCBwYXRoOiB2YWx1ZSwgYXV0aG9yaXR5OiBjb25maWcucmVtb3RlQXV0aG9yaXR5IH0pIH07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHdvcmtzcGFjZSA9IHsgZm9sZGVyVXJpOiBVUkkucGFyc2UodmFsdWUpIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvdW5kV29ya3NwYWNlID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHQvLyBXb3Jrc3BhY2Vcblx0XHRcdFx0Y2FzZSBXb3Jrc3BhY2VQcm92aWRlci5RVUVSWV9QQVJBTV9XT1JLU1BBQ0U6XG5cdFx0XHRcdFx0aWYgKGNvbmZpZy5yZW1vdGVBdXRob3JpdHkgJiYgdmFsdWUuc3RhcnRzV2l0aChwb3NpeC5zZXApKSB7XG5cdFx0XHRcdFx0XHQvLyB3aGVuIGNvbm5lY3RlZCB0byBhIHJlbW90ZSBhbmQgaGF2aW5nIGEgdmFsdWVcblx0XHRcdFx0XHRcdC8vIHRoYXQgaXMgYSBwYXRoIChiZWdpbnMgd2l0aCBhIGAvYCksIGFzc3VtZSB0aGlzXG5cdFx0XHRcdFx0XHQvLyBpcyBhIHZzY29kZS1yZW1vdGUgcmVzb3VyY2UgYXMgc2ltcGxpZmllZCBVUkwuXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2UgPSB7IHdvcmtzcGFjZVVyaTogVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlUmVtb3RlLCBwYXRoOiB2YWx1ZSwgYXV0aG9yaXR5OiBjb25maWcucmVtb3RlQXV0aG9yaXR5IH0pIH07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHdvcmtzcGFjZSA9IHsgd29ya3NwYWNlVXJpOiBVUkkucGFyc2UodmFsdWUpIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvdW5kV29ya3NwYWNlID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHQvLyBFbXB0eVxuXHRcdFx0XHRjYXNlIFdvcmtzcGFjZVByb3ZpZGVyLlFVRVJZX1BBUkFNX0VNUFRZX1dJTkRPVzpcblx0XHRcdFx0XHR3b3Jrc3BhY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Zm91bmRXb3Jrc3BhY2UgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdC8vIFBheWxvYWRcblx0XHRcdFx0Y2FzZSBXb3Jrc3BhY2VQcm92aWRlci5RVUVSWV9QQVJBTV9QQVlMT0FEOlxuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRwYXlsb2FkID0gcGFyc2UodmFsdWUpOyAvLyB1c2UgbWFyc2hhbGxpbmcjcGFyc2UoKSB0byByZXZpdmUgcG90ZW50aWFsIFVSSXNcblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0Y29uc29sZS5lcnJvcihlcnJvcik7IC8vIHBvc3NpYmxlIGludmFsaWQgSlNPTlxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIElmIG5vIHdvcmtzcGFjZSBpcyBwcm92aWRlZCB0aHJvdWdoIHRoZSBVUkwsIGNoZWNrIGZvciBjb25maWdcblx0XHQvLyBhdHRyaWJ1dGUgZnJvbSBzZXJ2ZXJcblx0XHRpZiAoIWZvdW5kV29ya3NwYWNlKSB7XG5cdFx0XHRpZiAoY29uZmlnLmZvbGRlclVyaSkge1xuXHRcdFx0XHR3b3Jrc3BhY2UgPSB7IGZvbGRlclVyaTogVVJJLnJldml2ZShjb25maWcuZm9sZGVyVXJpKSB9O1xuXHRcdFx0fSBlbHNlIGlmIChjb25maWcud29ya3NwYWNlVXJpKSB7XG5cdFx0XHRcdHdvcmtzcGFjZSA9IHsgd29ya3NwYWNlVXJpOiBVUkkucmV2aXZlKGNvbmZpZy53b3Jrc3BhY2VVcmkpIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBXb3Jrc3BhY2VQcm92aWRlcih3b3Jrc3BhY2UsIHBheWxvYWQsIGNvbmZpZyk7XG5cdH1cblxuXHRyZWFkb25seSB0cnVzdGVkID0gdHJ1ZTtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHdvcmtzcGFjZTogSVdvcmtzcGFjZSxcblx0XHRyZWFkb25seSBwYXlsb2FkOiBvYmplY3QsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb25maWc6IElXb3JrYmVuY2hDb25zdHJ1Y3Rpb25PcHRpb25zXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgb3Blbih3b3Jrc3BhY2U6IElXb3Jrc3BhY2UsIG9wdGlvbnM/OiB7IHJldXNlPzogYm9vbGVhbjsgcGF5bG9hZD86IG9iamVjdCB9KTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKG9wdGlvbnM/LnJldXNlICYmICFvcHRpb25zLnBheWxvYWQgJiYgdGhpcy5pc1NhbWUodGhpcy53b3Jrc3BhY2UsIHdvcmtzcGFjZSkpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyByZXR1cm4gZWFybHkgaWYgd29ya3NwYWNlIGFuZCBlbnZpcm9ubWVudCBpcyBub3QgY2hhbmdpbmcgYW5kIHdlIGFyZSByZXVzaW5nIHdpbmRvd1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldEhyZWYgPSB0aGlzLmNyZWF0ZVRhcmdldFVybCh3b3Jrc3BhY2UsIG9wdGlvbnMpO1xuXHRcdGlmICh0YXJnZXRIcmVmKSB7XG5cdFx0XHRpZiAob3B0aW9ucz8ucmV1c2UpIHtcblx0XHRcdFx0bWFpbldpbmRvdy5sb2NhdGlvbi5ocmVmID0gdGFyZ2V0SHJlZjtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZXQgcmVzdWx0O1xuXHRcdFx0XHRpZiAoaXNTdGFuZGFsb25lKCkpIHtcblx0XHRcdFx0XHRyZXN1bHQgPSBtYWluV2luZG93Lm9wZW4odGFyZ2V0SHJlZiwgJ19ibGFuaycsICd0b29sYmFyPW5vJyk7IC8vIGVuc3VyZXMgdG8gb3BlbiBhbm90aGVyICdzdGFuZGFsb25lJyB3aW5kb3chXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gbWFpbldpbmRvdy5vcGVuKHRhcmdldEhyZWYpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuICEhcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVGFyZ2V0VXJsKHdvcmtzcGFjZTogSVdvcmtzcGFjZSwgb3B0aW9ucz86IHsgcmV1c2U/OiBib29sZWFuOyBwYXlsb2FkPzogb2JqZWN0IH0pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXG5cdFx0Ly8gRW1wdHlcblx0XHRsZXQgdGFyZ2V0SHJlZjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICghd29ya3NwYWNlKSB7XG5cdFx0XHR0YXJnZXRIcmVmID0gYCR7ZG9jdW1lbnQubG9jYXRpb24ub3JpZ2lufSR7ZG9jdW1lbnQubG9jYXRpb24ucGF0aG5hbWV9PyR7V29ya3NwYWNlUHJvdmlkZXIuUVVFUllfUEFSQU1fRU1QVFlfV0lORE9XfT10cnVlYDtcblx0XHR9XG5cblx0XHQvLyBGb2xkZXJcblx0XHRlbHNlIGlmIChpc0ZvbGRlclRvT3Blbih3b3Jrc3BhY2UpKSB7XG5cdFx0XHRjb25zdCBxdWVyeVBhcmFtRm9sZGVyID0gdGhpcy5lbmNvZGVXb3Jrc3BhY2VQYXRoKHdvcmtzcGFjZS5mb2xkZXJVcmkpO1xuXHRcdFx0dGFyZ2V0SHJlZiA9IGAke2RvY3VtZW50LmxvY2F0aW9uLm9yaWdpbn0ke2RvY3VtZW50LmxvY2F0aW9uLnBhdGhuYW1lfT8ke1dvcmtzcGFjZVByb3ZpZGVyLlFVRVJZX1BBUkFNX0ZPTERFUn09JHtxdWVyeVBhcmFtRm9sZGVyfWA7XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3NwYWNlXG5cdFx0ZWxzZSBpZiAoaXNXb3Jrc3BhY2VUb09wZW4od29ya3NwYWNlKSkge1xuXHRcdFx0Y29uc3QgcXVlcnlQYXJhbVdvcmtzcGFjZSA9IHRoaXMuZW5jb2RlV29ya3NwYWNlUGF0aCh3b3Jrc3BhY2Uud29ya3NwYWNlVXJpKTtcblx0XHRcdHRhcmdldEhyZWYgPSBgJHtkb2N1bWVudC5sb2NhdGlvbi5vcmlnaW59JHtkb2N1bWVudC5sb2NhdGlvbi5wYXRobmFtZX0/JHtXb3Jrc3BhY2VQcm92aWRlci5RVUVSWV9QQVJBTV9XT1JLU1BBQ0V9PSR7cXVlcnlQYXJhbVdvcmtzcGFjZX1gO1xuXHRcdH1cblxuXHRcdC8vIEFwcGVuZCBwYXlsb2FkIGlmIGFueVxuXHRcdGlmIChvcHRpb25zPy5wYXlsb2FkKSB7XG5cdFx0XHR0YXJnZXRIcmVmICs9IGAmJHtXb3Jrc3BhY2VQcm92aWRlci5RVUVSWV9QQVJBTV9QQVlMT0FEfT0ke2VuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShvcHRpb25zLnBheWxvYWQpKX1gO1xuXHRcdH1cblxuXHRcdHJldHVybiB0YXJnZXRIcmVmO1xuXHR9XG5cblx0cHJpdmF0ZSBlbmNvZGVXb3Jrc3BhY2VQYXRoKHVyaTogVVJJKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5jb25maWcucmVtb3RlQXV0aG9yaXR5ICYmIHVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlKSB7XG5cblx0XHRcdC8vIHdoZW4gY29ubmVjdGVkIHRvIGEgcmVtb3RlIGFuZCBoYXZpbmcgYSBmb2xkZXJcblx0XHRcdC8vIG9yIHdvcmtzcGFjZSBmb3IgdGhhdCByZW1vdGUsIG9ubHkgdXNlIHRoZSBwYXRoXG5cdFx0XHQvLyBhcyBxdWVyeSB2YWx1ZSB0byBmb3JtIHNob3J0ZXIsIG5pY2VyIFVSTHMuXG5cdFx0XHQvLyBob3dldmVyLCB3ZSBzdGlsbCBuZWVkIHRvIGBlbmNvZGVVUklDb21wb25lbnRgXG5cdFx0XHQvLyB0byBlbnN1cmUgdG8gcHJlc2VydmUgc3BlY2lhbCBjaGFyYWN0ZXJzLCBzdWNoXG5cdFx0XHQvLyBhcyBgK2AgaW4gdGhlIHBhdGguXG5cblx0XHRcdHJldHVybiBlbmNvZGVVUklDb21wb25lbnQoYCR7cG9zaXguc2VwfSR7bHRyaW0odXJpLnBhdGgsIHBvc2l4LnNlcCl9YCkucmVwbGFjZUFsbCgnJTJGJywgJy8nKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KHVyaS50b1N0cmluZyh0cnVlKSk7XG5cdH1cblxuXHRwcml2YXRlIGlzU2FtZSh3b3Jrc3BhY2VBOiBJV29ya3NwYWNlLCB3b3Jrc3BhY2VCOiBJV29ya3NwYWNlKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF3b3Jrc3BhY2VBIHx8ICF3b3Jrc3BhY2VCKSB7XG5cdFx0XHRyZXR1cm4gd29ya3NwYWNlQSA9PT0gd29ya3NwYWNlQjsgLy8gYm90aCBlbXB0eVxuXHRcdH1cblxuXHRcdGlmIChpc0ZvbGRlclRvT3Blbih3b3Jrc3BhY2VBKSAmJiBpc0ZvbGRlclRvT3Blbih3b3Jrc3BhY2VCKSkge1xuXHRcdFx0cmV0dXJuIGlzRXF1YWwod29ya3NwYWNlQS5mb2xkZXJVcmksIHdvcmtzcGFjZUIuZm9sZGVyVXJpKTsgLy8gc2FtZSB3b3Jrc3BhY2Vcblx0XHR9XG5cblx0XHRpZiAoaXNXb3Jrc3BhY2VUb09wZW4od29ya3NwYWNlQSkgJiYgaXNXb3Jrc3BhY2VUb09wZW4od29ya3NwYWNlQikpIHtcblx0XHRcdHJldHVybiBpc0VxdWFsKHdvcmtzcGFjZUEud29ya3NwYWNlVXJpLCB3b3Jrc3BhY2VCLndvcmtzcGFjZVVyaSk7IC8vIHNhbWUgd29ya3NwYWNlXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aGFzUmVtb3RlKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLndvcmtzcGFjZSkge1xuXHRcdFx0aWYgKGlzRm9sZGVyVG9PcGVuKHRoaXMud29ya3NwYWNlKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2UuZm9sZGVyVXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVSZW1vdGU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc1dvcmtzcGFjZVRvT3Blbih0aGlzLndvcmtzcGFjZSkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlLndvcmtzcGFjZVVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlYWRDb29raWUobmFtZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY29va2llcyA9IGRvY3VtZW50LmNvb2tpZS5zcGxpdCgnOyAnKTtcblx0Zm9yIChjb25zdCBjb29raWUgb2YgY29va2llcykge1xuXHRcdGlmIChjb29raWUuc3RhcnRzV2l0aChuYW1lICsgJz0nKSkge1xuXHRcdFx0cmV0dXJuIGNvb2tpZS5zdWJzdHJpbmcobmFtZS5sZW5ndGggKyAxKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4oZnVuY3Rpb24gKCkge1xuXG5cdC8vIEZpbmQgY29uZmlnIGJ5IGNoZWNraW5nIGZvciBET01cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdGNvbnN0IGNvbmZpZ0VsZW1lbnQgPSBtYWluV2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd2c2NvZGUtd29ya2JlbmNoLXdlYi1jb25maWd1cmF0aW9uJyk7XG5cdGNvbnN0IGNvbmZpZ0VsZW1lbnRBdHRyaWJ1dGUgPSBjb25maWdFbGVtZW50ID8gY29uZmlnRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtc2V0dGluZ3MnKSA6IHVuZGVmaW5lZDtcblx0aWYgKCFjb25maWdFbGVtZW50IHx8ICFjb25maWdFbGVtZW50QXR0cmlidXRlKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHdlYiBjb25maWd1cmF0aW9uIGVsZW1lbnQnKTtcblx0fVxuXHRjb25zdCBjb25maWc6IElXb3JrYmVuY2hDb25zdHJ1Y3Rpb25PcHRpb25zICYgeyBmb2xkZXJVcmk/OiBVcmlDb21wb25lbnRzOyB3b3Jrc3BhY2VVcmk/OiBVcmlDb21wb25lbnRzOyBjYWxsYmFja1JvdXRlOiBzdHJpbmcgfSA9IEpTT04ucGFyc2UoY29uZmlnRWxlbWVudEF0dHJpYnV0ZSk7XG5cdGNvbnN0IHNlY3JldFN0b3JhZ2VLZXlQYXRoID0gcmVhZENvb2tpZSgndnNjb2RlLXNlY3JldC1rZXktcGF0aCcpO1xuXHRjb25zdCBzZWNyZXRTdG9yYWdlQ3J5cHRvID0gc2VjcmV0U3RvcmFnZUtleVBhdGggJiYgU2VydmVyS2V5ZWRBRVNDcnlwdG8uc3VwcG9ydGVkKClcblx0XHQ/IG5ldyBTZXJ2ZXJLZXllZEFFU0NyeXB0byhzZWNyZXRTdG9yYWdlS2V5UGF0aCkgOiBuZXcgVHJhbnNwYXJlbnRDcnlwdG8oKTtcblxuXHQvLyBDcmVhdGUgd29ya2JlbmNoXG5cdGNyZWF0ZShtYWluV2luZG93LmRvY3VtZW50LmJvZHksIHtcblx0XHQuLi5jb25maWcsXG5cdFx0d2luZG93SW5kaWNhdG9yOiBjb25maWcud2luZG93SW5kaWNhdG9yID8/IHsgbGFiZWw6ICckKHJlbW90ZSknLCB0b29sdGlwOiBgJHtwcm9kdWN0Lm5hbWVTaG9ydH0gV2ViYCB9LFxuXHRcdHNldHRpbmdzU3luY09wdGlvbnM6IGNvbmZpZy5zZXR0aW5nc1N5bmNPcHRpb25zID8geyBlbmFibGVkOiBjb25maWcuc2V0dGluZ3NTeW5jT3B0aW9ucy5lbmFibGVkLCB9IDogdW5kZWZpbmVkLFxuXHRcdHdvcmtzcGFjZVByb3ZpZGVyOiBXb3Jrc3BhY2VQcm92aWRlci5jcmVhdGUoY29uZmlnKSxcblx0XHR1cmxDYWxsYmFja1Byb3ZpZGVyOiBuZXcgTG9jYWxTdG9yYWdlVVJMQ2FsbGJhY2tQcm92aWRlcihjb25maWcuY2FsbGJhY2tSb3V0ZSksXG5cdFx0c2VjcmV0U3RvcmFnZVByb3ZpZGVyOiBjb25maWcucmVtb3RlQXV0aG9yaXR5ICYmICFzZWNyZXRTdG9yYWdlS2V5UGF0aFxuXHRcdFx0PyB1bmRlZmluZWQgLyogd2l0aCBhIHJlbW90ZSB3aXRob3V0IGVtYmVkZGVyLXByZWZlcnJlZCBzdG9yYWdlLCBzdG9yZSBvbiB0aGUgcmVtb3RlICovXG5cdFx0XHQ6IG5ldyBMb2NhbFN0b3JhZ2VTZWNyZXRTdG9yYWdlUHJvdmlkZXIoc2VjcmV0U3RvcmFnZUNyeXB0byksXG5cdH0pO1xufSkoKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsVUFBVSxjQUFjLG9CQUFvQjtBQUNyRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYTtBQUN0QixTQUFTLFdBQTBCO0FBQ25DLE9BQU8sYUFBYTtBQUVwQixTQUFTLGdCQUFnQix5QkFBeUI7QUFJbEQsU0FBUyxjQUFjO0FBT3ZCLE1BQU0sa0JBQWtEO0FBQUEsRUFFdkQsTUFBTSxLQUFLLE1BQStCO0FBQ3pDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLE9BQU8sTUFBK0I7QUFDM0MsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLElBQVcsZUFBWCxrQkFBV0Esa0JBQVg7QUFDQyxFQUFBQSxjQUFBLGVBQVk7QUFDWixFQUFBQSw0QkFBQSxnQkFBYSxPQUFiO0FBQ0EsRUFBQUEsNEJBQUEsZUFBWSxNQUFaO0FBSFUsU0FBQUE7QUFBQSxHQUFBO0FBTVgsTUFBTSxxQkFBcUIsTUFBTTtBQUFBLEVBRWhDLFlBQVksT0FBYztBQUN6QixVQUFNLE1BQU0sT0FBTztBQUNuQixTQUFLLE9BQU8sTUFBTTtBQUNsQixTQUFLLFFBQVEsTUFBTTtBQUFBLEVB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
