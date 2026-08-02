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
import { createHash } from "crypto";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { raceTimeout } from "../../../base/common/async.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { ILogService } from "../../log/common/log.js";
import {
  TUNNEL_ADDRESS_PREFIX,
  TUNNEL_AGENT_HOST_PORT,
  TUNNEL_LAUNCHER_LABEL,
  TUNNEL_MIN_PROTOCOL_VERSION,
  TunnelTags
} from "../common/tunnelAgentHost.js";
const LOG_PREFIX = "[TunnelAgentHost]";
const TUNNEL_STEP_TIMEOUT_MS = 3e4;
async function withTimeout(op, timeoutMs, stepName) {
  let timedOut = false;
  const result = await raceTimeout(op(), timeoutMs, () => {
    timedOut = true;
  });
  if (timedOut) {
    throw new Error(`${LOG_PREFIX} ${stepName} timed out after ${timeoutMs}ms`);
  }
  return result;
}
function deriveConnectionToken(tunnelId) {
  const hash = createHash("sha256");
  hash.update(tunnelId);
  let result = hash.digest("base64url");
  if (result.startsWith("-")) {
    result = `a${result}`;
  }
  return result;
}
class TunnelConnection extends Disposable {
  constructor(connectionId, address, name, connectionToken, _relay, _relayClient) {
    super();
    this.connectionId = connectionId;
    this.address = address;
    this.name = name;
    this.connectionToken = connectionToken;
    this._relay = _relay;
    this._relayClient = _relayClient;
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this._closed = false;
  }
  dispose() {
    if (!this._closed) {
      this._closed = true;
      this._relay.close();
      this._relayClient.dispose();
      this._onDidClose.fire();
    }
    super.dispose();
  }
  relaySend(data) {
    this._relay.send(data);
  }
}
let TunnelAgentHostMainService = class extends Disposable {
  constructor(_logService) {
    super();
    this._logService = _logService;
    this._onDidRelayMessage = this._register(new Emitter());
    this.onDidRelayMessage = this._onDidRelayMessage.event;
    this._onDidRelayClose = this._register(new Emitter());
    this.onDidRelayClose = this._onDidRelayClose.event;
    this._connections = /* @__PURE__ */ new Map();
  }
  async listTunnels(token, authProvider, additionalTunnelNames) {
    const client = await this._createManagementClient(token, authProvider);
    const results = [];
    const seen = /* @__PURE__ */ new Set();
    try {
      const tunnels = await client.listTunnels(void 0, void 0, {
        labels: [TUNNEL_LAUNCHER_LABEL],
        requireAllLabels: true,
        includePorts: true,
        tokenScopes: ["connect"]
      });
      for (const tunnel of tunnels) {
        const info = this._parseTunnelInfo(tunnel);
        if (info && info.protocolVersion >= TUNNEL_MIN_PROTOCOL_VERSION) {
          results.push(info);
          seen.add(info.tunnelId);
        }
      }
    } catch (err) {
      this._logService.error(`${LOG_PREFIX} Failed to enumerate tunnels`, err);
    }
    if (additionalTunnelNames) {
      for (const tunnelName of additionalTunnelNames) {
        try {
          const [tunnel] = await client.listTunnels(void 0, void 0, {
            labels: [tunnelName, TUNNEL_LAUNCHER_LABEL],
            requireAllLabels: true,
            includePorts: true,
            tokenScopes: ["connect"],
            limit: 1
          });
          if (tunnel) {
            const info = this._parseTunnelInfo(tunnel);
            if (info && info.protocolVersion >= TUNNEL_MIN_PROTOCOL_VERSION && !seen.has(info.tunnelId)) {
              results.push(info);
              seen.add(info.tunnelId);
            }
          }
        } catch (err) {
          this._logService.warn(`${LOG_PREFIX} Failed to look up tunnel '${tunnelName}'`, err);
        }
      }
    }
    this._logService.info(`${LOG_PREFIX} Found ${results.length} tunnel(s) with agent host support`);
    return results;
  }
  async connect(token, authProvider, tunnelId, clusterId) {
    for (const [id, conn2] of this._connections) {
      if (conn2.address === `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`) {
        this._logService.info(`${LOG_PREFIX} Closing existing relay for tunnel ${tunnelId} before reconnecting`);
        this._connections.delete(id);
        conn2.dispose();
        break;
      }
    }
    const client = await this._createManagementClient(token, authProvider);
    const connectionId = generateUuid();
    const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
    this._logService.info(`${LOG_PREFIX} Connecting to tunnel ${tunnelId} in cluster ${clusterId}...`);
    const tunnel = { tunnelId, clusterId };
    const resolved = await client.getTunnel(tunnel, {
      includePorts: true,
      tokenScopes: ["connect"]
    });
    if (!resolved) {
      throw new Error(`${LOG_PREFIX} Tunnel ${tunnelId} not found`);
    }
    const { TunnelRelayTunnelClient } = await import("@microsoft/dev-tunnels-connections");
    const relayClient = new TunnelRelayTunnelClient(client);
    relayClient.acceptLocalConnectionsForForwardedPorts = false;
    if (resolved.endpoints) {
      relayClient.endpoints = resolved.endpoints;
    }
    let portStream;
    try {
      await withTimeout(() => relayClient.connect(resolved), TUNNEL_STEP_TIMEOUT_MS, "tunnel relay connect");
      this._logService.info(`${LOG_PREFIX} Tunnel relay connected, waiting for port ${TUNNEL_AGENT_HOST_PORT}...`);
      await withTimeout(() => relayClient.waitForForwardedPort(TUNNEL_AGENT_HOST_PORT), TUNNEL_STEP_TIMEOUT_MS, `wait for forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
      portStream = await withTimeout(() => relayClient.connectToForwardedPort(TUNNEL_AGENT_HOST_PORT), TUNNEL_STEP_TIMEOUT_MS, `connect to forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
      this._logService.info(`${LOG_PREFIX} Connected to forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
    } catch (err) {
      try {
        relayClient.dispose();
      } catch {
      }
      throw err;
    }
    const connectionToken = deriveConnectionToken(tunnelId);
    const tags = new TunnelTags(resolved.labels);
    const name = tags.name || resolved.name || tunnelId;
    let relay;
    try {
      relay = await withTimeout(
        () => this._createWebSocketRelay(portStream, connectionToken, connectionId),
        TUNNEL_STEP_TIMEOUT_MS,
        "WebSocket relay open"
      );
    } catch (err) {
      try {
        relayClient.dispose();
      } catch {
      }
      throw err;
    }
    const conn = new TunnelConnection(
      connectionId,
      address,
      name,
      connectionToken,
      relay,
      relayClient
    );
    conn.onDidClose(() => {
      this._connections.delete(connectionId);
      this._onDidRelayClose.fire(connectionId);
    });
    this._connections.set(connectionId, conn);
    return { connectionId, address, name, connectionToken };
  }
  async relaySend(connectionId, message) {
    const conn = this._connections.get(connectionId);
    if (conn) {
      conn.relaySend(message);
    }
  }
  async disconnect(connectionId) {
    const conn = this._connections.get(connectionId);
    if (conn) {
      conn.dispose();
    }
  }
  async _createManagementClient(token, authProvider) {
    const mgmt = await import("@microsoft/dev-tunnels-management");
    const authHeader = authProvider === "github" ? `github ${token}` : `Bearer ${token}`;
    return new mgmt.TunnelManagementHttpClient(
      "vscode-sessions",
      mgmt.ManagementApiVersions.Version20230927preview,
      async () => authHeader
    );
  }
  _parseTunnelInfo(tunnel) {
    const labels = tunnel.labels ?? [];
    const tags = new TunnelTags(labels);
    if (tags.protocolVersion < TUNNEL_MIN_PROTOCOL_VERSION) {
      return void 0;
    }
    const tunnelId = tunnel.tunnelId;
    const clusterId = tunnel.clusterId;
    if (!tunnelId || !clusterId) {
      return void 0;
    }
    const name = tags.name || tunnel.name || tunnelId;
    const rawCount = tunnel.status?.hostConnectionCount;
    const hostConnectionCount = typeof rawCount === "number" ? rawCount : rawCount?.current ?? 0;
    return {
      tunnelId,
      clusterId,
      name,
      tags: labels,
      protocolVersion: tags.protocolVersion,
      hostConnectionCount
    };
  }
  async _createWebSocketRelay(portStream, connectionToken, connectionId) {
    const WS = await import("ws");
    return new Promise((resolve, reject) => {
      let url = `ws://localhost:${TUNNEL_AGENT_HOST_PORT}`;
      if (connectionToken) {
        url += `?tkn=${encodeURIComponent(connectionToken)}`;
      }
      const ws = new WS.WebSocket(url, {
        createConnection: (() => portStream)
      });
      ws.on("open", () => {
        this._logService.info(`${LOG_PREFIX} WebSocket relay connected to agent host via tunnel`);
        resolve({
          send: (data) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(data);
            }
          },
          close: () => ws.close()
        });
      });
      ws.on("message", (data) => {
        let text;
        if (Array.isArray(data)) {
          text = Buffer.concat(data).toString();
        } else if (data instanceof ArrayBuffer) {
          text = Buffer.from(new Uint8Array(data)).toString();
        } else {
          text = data.toString();
        }
        this._onDidRelayMessage.fire({ connectionId, data: text });
      });
      ws.on("close", (code, reason) => {
        this._logService.info(`${LOG_PREFIX} WebSocket relay closed for connection ${connectionId}; code=${code}, reason=${reason?.toString() || "(empty)"}`);
        const conn = this._connections.get(connectionId);
        if (conn) {
          conn.dispose();
        }
      });
      ws.on("error", (wsErr) => {
        this._logService.warn(`${LOG_PREFIX} WebSocket relay error: ${wsErr instanceof Error ? wsErr.message : String(wsErr)}`);
        reject(wsErr);
      });
    });
  }
};
TunnelAgentHostMainService = __decorateClass([
  __decorateParam(0, ILogService)
], TunnelAgentHostMainService);
export {
  TUNNEL_STEP_TIMEOUT_MS,
  TunnelAgentHostMainService,
  withTimeout
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3R1bm5lbEFnZW50SG9zdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IFR1bm5lbCB9IGZyb20gJ0BtaWNyb3NvZnQvZGV2LXR1bm5lbHMtY29udHJhY3RzJztcbmltcG9ydCB0eXBlIHsgVHVubmVsTWFuYWdlbWVudEh0dHBDbGllbnQgfSBmcm9tICdAbWljcm9zb2Z0L2Rldi10dW5uZWxzLW1hbmFnZW1lbnQnO1xuaW1wb3J0IHsgY3JlYXRlSGFzaCB9IGZyb20gJ2NyeXB0byc7XG5pbXBvcnQgdHlwZSBXZWJTb2NrZXQgZnJvbSAnd3MnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHJhY2VUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7XG5cdElUdW5uZWxBZ2VudEhvc3RNYWluU2VydmljZSxcblx0VFVOTkVMX0FERFJFU1NfUFJFRklYLFxuXHRUVU5ORUxfQUdFTlRfSE9TVF9QT1JULFxuXHRUVU5ORUxfTEFVTkNIRVJfTEFCRUwsXG5cdFRVTk5FTF9NSU5fUFJPVE9DT0xfVkVSU0lPTixcblx0VHVubmVsVGFncyxcblx0dHlwZSBJVHVubmVsQ29ubmVjdFJlc3VsdCxcblx0dHlwZSBJVHVubmVsSW5mbyxcblx0dHlwZSBJVHVubmVsUmVsYXlNZXNzYWdlLFxufSBmcm9tICcuLi9jb21tb24vdHVubmVsQWdlbnRIb3N0LmpzJztcblxuY29uc3QgTE9HX1BSRUZJWCA9ICdbVHVubmVsQWdlbnRIb3N0XSc7XG5cbi8qKlxuICogUGVyLXN0ZXAgdGltZW91dCBmb3IgdGhlIGRldi10dW5uZWxzIFNESyBjYWxscyBpbnNpZGUge0BsaW5rIFR1bm5lbEFnZW50SG9zdE1haW5TZXJ2aWNlLmNvbm5lY3R9LlxuICpcbiAqIFdpdGhvdXQgdGhpcywgYSBzaWxlbnRseSBkcm9wcGVkIG5ldHdvcmsgKFRDUCBoYWxmLW9wZW4sIGhvc3QgZ29uZSBidXQgcmVsYXkgc3RpbGxcbiAqIGFjY2VwdGluZyBvdXIgbWVzc2FnZXMpIGNhbiBsZWF2ZSBgcmVsYXlDbGllbnQuY29ubmVjdCgpYCxcbiAqIGB3YWl0Rm9yRm9yd2FyZGVkUG9ydCgpYCwgYGNvbm5lY3RUb0ZvcndhcmRlZFBvcnQoKWAsIG9yIHRoZSBXZWJTb2NrZXQgYCdvcGVuJ2BcbiAqIGV2ZW50IHBlbmRpbmcgZm9yZXZlciBcdTIwMTQgd2hpY2ggaW4gdHVybiBoYW5ncyB0aGUgcmVuZGVyZXInc1xuICogYF90dW5uZWxTZXJ2aWNlLmNvbm5lY3QoLi4uKWAgYXdhaXQsIGxlYXZpbmcgdGhlIHBlci1ob3N0IGBfcGVuZGluZ0Nvbm5lY3RzYFxuICogZmxhZyBzZXQgYW5kIGVmZmVjdGl2ZWx5IGRpc2FibGluZyBhdXRvLXJlY29ubmVjdCBmb3IgdGhlIGxpZmV0aW1lIG9mIHRoZVxuICogc2hhcmVkIHByb2Nlc3MuXG4gKi9cbmV4cG9ydCBjb25zdCBUVU5ORUxfU1RFUF9USU1FT1VUX01TID0gMzBfMDAwO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2l0aFRpbWVvdXQ8VD4oXG5cdG9wOiAoKSA9PiBQcm9taXNlPFQ+LFxuXHR0aW1lb3V0TXM6IG51bWJlcixcblx0c3RlcE5hbWU6IHN0cmluZyxcbik6IFByb21pc2U8VD4ge1xuXHQvLyBVc2UgcmFjZVRpbWVvdXQgc28gdGhlIHRpbWVyIGlzIGNsZWFyZWQgaW4gYGZpbmFsbHlgIG9uY2UgYG9wYCBzZXR0bGVzXG5cdC8vIChhdm9pZHMgc3RyYXkgdGltZXJzIGFjcm9zcyBmcmVxdWVudCByZWNvbm5lY3QgYXR0ZW1wdHMpLiBUaGUgdm9pZC1yZXR1cm5cblx0Ly8gZGlzYW1iaWd1YXRpb24gaXMgaGFuZGxlZCBieSB0aGUgb25UaW1lb3V0IGNhbGxiYWNrIGZsYWcgYmVsb3cuXG5cdGxldCB0aW1lZE91dCA9IGZhbHNlO1xuXHRjb25zdCByZXN1bHQgPSBhd2FpdCByYWNlVGltZW91dChvcCgpLCB0aW1lb3V0TXMsICgpID0+IHsgdGltZWRPdXQgPSB0cnVlOyB9KTtcblx0aWYgKHRpbWVkT3V0KSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGAke0xPR19QUkVGSVh9ICR7c3RlcE5hbWV9IHRpbWVkIG91dCBhZnRlciAke3RpbWVvdXRNc31tc2ApO1xuXHR9XG5cdHJldHVybiByZXN1bHQgYXMgVDtcbn1cblxuLyoqXG4gKiBEZXJpdmUgYSBjb25uZWN0aW9uIHRva2VuIGZyb20gYSB0dW5uZWwgSUQgdXNpbmcgdGhlIHNhbWUgY29udmVudGlvblxuICogYXMgdGhlIFZTIENvZGUgQ0xJIChzZWUgYGdldF9jb25uZWN0aW9uX3Rva2VuYCBpbiBjbGkvc3JjL2NvbW1hbmRzL3R1bm5lbHMucnMpLlxuICovXG5mdW5jdGlvbiBkZXJpdmVDb25uZWN0aW9uVG9rZW4odHVubmVsSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IGhhc2ggPSBjcmVhdGVIYXNoKCdzaGEyNTYnKTtcblx0aGFzaC51cGRhdGUodHVubmVsSWQpO1xuXHRsZXQgcmVzdWx0ID0gaGFzaC5kaWdlc3QoJ2Jhc2U2NHVybCcpO1xuXHRpZiAocmVzdWx0LnN0YXJ0c1dpdGgoJy0nKSkge1xuXHRcdHJlc3VsdCA9IGBhJHtyZXN1bHR9YDtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKiogU3RhdGUgZm9yIGEgc2luZ2xlIGFjdGl2ZSB0dW5uZWwgcmVsYXkgY29ubmVjdGlvbi4gKi9cbmNsYXNzIFR1bm5lbENvbm5lY3Rpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlID0gdGhpcy5fb25EaWRDbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIF9jbG9zZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjb25uZWN0aW9uSWQ6IHN0cmluZyxcblx0XHRyZWFkb25seSBhZGRyZXNzOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlbGF5OiB7IHNlbmQ6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQ7IGNsb3NlOiAoKSA9PiB2b2lkIH0sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVsYXlDbGllbnQ6IHsgZGlzcG9zZSgpOiB2b2lkIH0sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY2xvc2VkKSB7XG5cdFx0XHR0aGlzLl9jbG9zZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fcmVsYXkuY2xvc2UoKTtcblx0XHRcdHRoaXMuX3JlbGF5Q2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2xvc2UuZmlyZSgpO1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRyZWxheVNlbmQoZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVsYXkuc2VuZChkYXRhKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVHVubmVsQWdlbnRIb3N0TWFpblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVR1bm5lbEFnZW50SG9zdE1haW5TZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWxheU1lc3NhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVHVubmVsUmVsYXlNZXNzYWdlPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZWxheU1lc3NhZ2U6IEV2ZW50PElUdW5uZWxSZWxheU1lc3NhZ2U+ID0gdGhpcy5fb25EaWRSZWxheU1lc3NhZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWxheUNsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZWxheUNsb3NlOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRSZWxheUNsb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25zID0gbmV3IE1hcDxzdHJpbmcsIFR1bm5lbENvbm5lY3Rpb24+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgbGlzdFR1bm5lbHModG9rZW46IHN0cmluZywgYXV0aFByb3ZpZGVyOiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnLCBhZGRpdGlvbmFsVHVubmVsTmFtZXM/OiBzdHJpbmdbXSk6IFByb21pc2U8SVR1bm5lbEluZm9bXT4ge1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IHRoaXMuX2NyZWF0ZU1hbmFnZW1lbnRDbGllbnQodG9rZW4sIGF1dGhQcm92aWRlcik7XG5cdFx0Y29uc3QgcmVzdWx0czogSVR1bm5lbEluZm9bXSA9IFtdO1xuXHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBFbnVtZXJhdGUgYWxsIHR1bm5lbHMgd2l0aCB0aGUgdnNjb2RlLXNlcnZlci1sYXVuY2hlciBsYWJlbFxuXHRcdFx0Y29uc3QgdHVubmVscyA9IGF3YWl0IGNsaWVudC5saXN0VHVubmVscyh1bmRlZmluZWQsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRsYWJlbHM6IFtUVU5ORUxfTEFVTkNIRVJfTEFCRUxdLFxuXHRcdFx0XHRyZXF1aXJlQWxsTGFiZWxzOiB0cnVlLFxuXHRcdFx0XHRpbmNsdWRlUG9ydHM6IHRydWUsXG5cdFx0XHRcdHRva2VuU2NvcGVzOiBbJ2Nvbm5lY3QnXSxcblx0XHRcdH0pO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHR1bm5lbCBvZiB0dW5uZWxzKSB7XG5cdFx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl9wYXJzZVR1bm5lbEluZm8odHVubmVsKTtcblx0XHRcdFx0aWYgKGluZm8gJiYgaW5mby5wcm90b2NvbFZlcnNpb24gPj0gVFVOTkVMX01JTl9QUk9UT0NPTF9WRVJTSU9OKSB7XG5cdFx0XHRcdFx0cmVzdWx0cy5wdXNoKGluZm8pO1xuXHRcdFx0XHRcdHNlZW4uYWRkKGluZm8udHVubmVsSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGAke0xPR19QUkVGSVh9IEZhaWxlZCB0byBlbnVtZXJhdGUgdHVubmVsc2AsIGVycik7XG5cdFx0fVxuXG5cdFx0Ly8gTG9vayB1cCBhZGRpdGlvbmFsIHR1bm5lbHMgYnkgbmFtZVxuXHRcdGlmIChhZGRpdGlvbmFsVHVubmVsTmFtZXMpIHtcblx0XHRcdGZvciAoY29uc3QgdHVubmVsTmFtZSBvZiBhZGRpdGlvbmFsVHVubmVsTmFtZXMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBbdHVubmVsXSA9IGF3YWl0IGNsaWVudC5saXN0VHVubmVscyh1bmRlZmluZWQsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRcdFx0bGFiZWxzOiBbdHVubmVsTmFtZSwgVFVOTkVMX0xBVU5DSEVSX0xBQkVMXSxcblx0XHRcdFx0XHRcdHJlcXVpcmVBbGxMYWJlbHM6IHRydWUsXG5cdFx0XHRcdFx0XHRpbmNsdWRlUG9ydHM6IHRydWUsXG5cdFx0XHRcdFx0XHR0b2tlblNjb3BlczogWydjb25uZWN0J10sXG5cdFx0XHRcdFx0XHRsaW1pdDogMSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpZiAodHVubmVsKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbmZvID0gdGhpcy5fcGFyc2VUdW5uZWxJbmZvKHR1bm5lbCk7XG5cdFx0XHRcdFx0XHRpZiAoaW5mbyAmJiBpbmZvLnByb3RvY29sVmVyc2lvbiA+PSBUVU5ORUxfTUlOX1BST1RPQ09MX1ZFUlNJT04gJiYgIXNlZW4uaGFzKGluZm8udHVubmVsSWQpKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdHMucHVzaChpbmZvKTtcblx0XHRcdFx0XHRcdFx0c2Vlbi5hZGQoaW5mby50dW5uZWxJZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gRmFpbGVkIHRvIGxvb2sgdXAgdHVubmVsICcke3R1bm5lbE5hbWV9J2AsIGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gRm91bmQgJHtyZXN1bHRzLmxlbmd0aH0gdHVubmVsKHMpIHdpdGggYWdlbnQgaG9zdCBzdXBwb3J0YCk7XG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH1cblxuXHRhc3luYyBjb25uZWN0KHRva2VuOiBzdHJpbmcsIGF1dGhQcm92aWRlcjogJ2dpdGh1YicgfCAnbWljcm9zb2Z0JywgdHVubmVsSWQ6IHN0cmluZywgY2x1c3RlcklkOiBzdHJpbmcpOiBQcm9taXNlPElUdW5uZWxDb25uZWN0UmVzdWx0PiB7XG5cdFx0Ly8gVGVhciBkb3duIGFueSBleGlzdGluZyBjb25uZWN0aW9uIHRvIHRoaXMgdHVubmVsIGZpcnN0LlxuXHRcdC8vIEVhY2ggY29ubmVjdCgpIGNhbGwgY3JlYXRlcyBhIGZyZXNoIHJlbGF5IHdpdGggaXRzIG93biBwcm90b2NvbFxuXHRcdC8vIHNlc3Npb24sIHNvIHRoZSBvbGQgb25lIG11c3QgYmUgY2xvc2VkIHRvIGF2b2lkIGNvbmZsaWN0cy5cblx0XHRmb3IgKGNvbnN0IFtpZCwgY29ubl0gb2YgdGhpcy5fY29ubmVjdGlvbnMpIHtcblx0XHRcdGlmIChjb25uLmFkZHJlc3MgPT09IGAke1RVTk5FTF9BRERSRVNTX1BSRUZJWH0ke3R1bm5lbElkfWApIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IENsb3NpbmcgZXhpc3RpbmcgcmVsYXkgZm9yIHR1bm5lbCAke3R1bm5lbElkfSBiZWZvcmUgcmVjb25uZWN0aW5nYCk7XG5cdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25zLmRlbGV0ZShpZCk7XG5cdFx0XHRcdGNvbm4uZGlzcG9zZSgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCB0aGlzLl9jcmVhdGVNYW5hZ2VtZW50Q2xpZW50KHRva2VuLCBhdXRoUHJvdmlkZXIpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb25JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IGFkZHJlc3MgPSBgJHtUVU5ORUxfQUREUkVTU19QUkVGSVh9JHt0dW5uZWxJZH1gO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IENvbm5lY3RpbmcgdG8gdHVubmVsICR7dHVubmVsSWR9IGluIGNsdXN0ZXIgJHtjbHVzdGVySWR9Li4uYCk7XG5cblx0XHQvLyBHZXQgdGhlIGZ1bGwgdHVubmVsIHdpdGggZW5kcG9pbnRzIGFuZCBhY2Nlc3MgdG9rZW5zXG5cdFx0Y29uc3QgdHVubmVsOiBUdW5uZWwgPSB7IHR1bm5lbElkLCBjbHVzdGVySWQgfTtcblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IGNsaWVudC5nZXRUdW5uZWwodHVubmVsLCB7XG5cdFx0XHRpbmNsdWRlUG9ydHM6IHRydWUsXG5cdFx0XHR0b2tlblNjb3BlczogWydjb25uZWN0J10sXG5cdFx0fSk7XG5cblx0XHRpZiAoIXJlc29sdmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYCR7TE9HX1BSRUZJWH0gVHVubmVsICR7dHVubmVsSWR9IG5vdCBmb3VuZGApO1xuXHRcdH1cblxuXHRcdC8vIENvbm5lY3QgdG8gdGhlIHR1bm5lbCByZWxheVxuXHRcdGNvbnN0IHsgVHVubmVsUmVsYXlUdW5uZWxDbGllbnQgfSA9IGF3YWl0IGltcG9ydCgnQG1pY3Jvc29mdC9kZXYtdHVubmVscy1jb25uZWN0aW9ucycpO1xuXHRcdGNvbnN0IHJlbGF5Q2xpZW50ID0gbmV3IFR1bm5lbFJlbGF5VHVubmVsQ2xpZW50KGNsaWVudCk7XG5cdFx0cmVsYXlDbGllbnQuYWNjZXB0TG9jYWxDb25uZWN0aW9uc0ZvckZvcndhcmRlZFBvcnRzID0gZmFsc2U7XG5cdFx0aWYgKHJlc29sdmVkLmVuZHBvaW50cykge1xuXHRcdFx0cmVsYXlDbGllbnQuZW5kcG9pbnRzID0gcmVzb2x2ZWQuZW5kcG9pbnRzO1xuXHRcdH1cblxuXHRcdC8vIEJvdW5kIGVhY2ggU0RLIHN0ZXAuIEEgc2lsZW50bHkgZGVhZCBuZXR3b3JrIGNhbiBsZWF2ZSBhbnkgb2YgdGhlc2Vcblx0XHQvLyBwZW5kaW5nIGZvcmV2ZXIsIHdoaWNoIHdvdWxkIGhhbmcgdGhlIHJlbmRlcmVyJ3Ncblx0XHQvLyBgX3R1bm5lbFNlcnZpY2UuY29ubmVjdCguLi4pYCBhd2FpdCBhbmQgcHJldmVudCBhdXRvLXJlY29ubmVjdCBmcm9tXG5cdFx0Ly8gcmUtYXJtaW5nIHVudGlsIHRoZSBhcHAgaXMgcmVzdGFydGVkLlxuXHRcdGxldCBwb3J0U3RyZWFtOiBOb2RlSlMuUmVhZFdyaXRlU3RyZWFtO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB3aXRoVGltZW91dCgoKSA9PiByZWxheUNsaWVudC5jb25uZWN0KHJlc29sdmVkKSwgVFVOTkVMX1NURVBfVElNRU9VVF9NUywgJ3R1bm5lbCByZWxheSBjb25uZWN0Jyk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gVHVubmVsIHJlbGF5IGNvbm5lY3RlZCwgd2FpdGluZyBmb3IgcG9ydCAke1RVTk5FTF9BR0VOVF9IT1NUX1BPUlR9Li4uYCk7XG5cblx0XHRcdC8vIFdhaXQgZm9yIHRoZSBhZ2VudCBob3N0IHBvcnQgdG8gYmVjb21lIGF2YWlsYWJsZVxuXHRcdFx0YXdhaXQgd2l0aFRpbWVvdXQoKCkgPT4gcmVsYXlDbGllbnQud2FpdEZvckZvcndhcmRlZFBvcnQoVFVOTkVMX0FHRU5UX0hPU1RfUE9SVCksIFRVTk5FTF9TVEVQX1RJTUVPVVRfTVMsIGB3YWl0IGZvciBmb3J3YXJkZWQgcG9ydCAke1RVTk5FTF9BR0VOVF9IT1NUX1BPUlR9YCk7XG5cblx0XHRcdC8vIENvbm5lY3QgdG8gdGhlIGZvcndhcmRlZCBwb3J0IFx1MjAxNCByZXR1cm5zIGEgRHVwbGV4IHN0cmVhbVxuXHRcdFx0cG9ydFN0cmVhbSA9IGF3YWl0IHdpdGhUaW1lb3V0KCgpID0+IHJlbGF5Q2xpZW50LmNvbm5lY3RUb0ZvcndhcmRlZFBvcnQoVFVOTkVMX0FHRU5UX0hPU1RfUE9SVCksIFRVTk5FTF9TVEVQX1RJTUVPVVRfTVMsIGBjb25uZWN0IHRvIGZvcndhcmRlZCBwb3J0ICR7VFVOTkVMX0FHRU5UX0hPU1RfUE9SVH1gKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBDb25uZWN0ZWQgdG8gZm9yd2FyZGVkIHBvcnQgJHtUVU5ORUxfQUdFTlRfSE9TVF9QT1JUfWApO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gQ2xlYW4gdXAgdGhlIGRldi10dW5uZWxzIHJlbGF5IGNsaWVudCBzbyB3ZSBkb24ndCBsZWFrIGFuXG5cdFx0XHQvLyBvcnBoYW4gY2xpZW50IHdoZW4gdGhlIFNESyBjYWxsIGhhbmdzIG9yIGZhaWxzLlxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVsYXlDbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBcdTIwMTQgYmVzdC1lZmZvcnQgY2xlYW51cFxuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblxuXHRcdC8vIERlcml2ZSBjb25uZWN0aW9uIHRva2VuIGZyb20gdHVubmVsIElEIChtYXRjaGVzIENMSSBjb252ZW50aW9uKVxuXHRcdGNvbnN0IGNvbm5lY3Rpb25Ub2tlbiA9IGRlcml2ZUNvbm5lY3Rpb25Ub2tlbih0dW5uZWxJZCk7XG5cblx0XHQvLyBQYXJzZSBkaXNwbGF5IG5hbWUgZnJvbSB0YWdzXG5cdFx0Y29uc3QgdGFncyA9IG5ldyBUdW5uZWxUYWdzKHJlc29sdmVkLmxhYmVscyk7XG5cdFx0Y29uc3QgbmFtZSA9IHRhZ3MubmFtZSB8fCByZXNvbHZlZC5uYW1lIHx8IHR1bm5lbElkO1xuXG5cdFx0Ly8gQ3JlYXRlIFdlYlNvY2tldCBvdmVyIHRoZSBwb3J0IHN0cmVhbVxuXHRcdGxldCByZWxheTogeyBzZW5kOiAoZGF0YTogc3RyaW5nKSA9PiB2b2lkOyBjbG9zZTogKCkgPT4gdm9pZCB9O1xuXHRcdHRyeSB7XG5cdFx0XHRyZWxheSA9IGF3YWl0IHdpdGhUaW1lb3V0KFxuXHRcdFx0XHQoKSA9PiB0aGlzLl9jcmVhdGVXZWJTb2NrZXRSZWxheShwb3J0U3RyZWFtLCBjb25uZWN0aW9uVG9rZW4sIGNvbm5lY3Rpb25JZCksXG5cdFx0XHRcdFRVTk5FTF9TVEVQX1RJTUVPVVRfTVMsXG5cdFx0XHRcdCdXZWJTb2NrZXQgcmVsYXkgb3BlbicsXG5cdFx0XHQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVsYXlDbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbm4gPSBuZXcgVHVubmVsQ29ubmVjdGlvbihcblx0XHRcdGNvbm5lY3Rpb25JZCxcblx0XHRcdGFkZHJlc3MsXG5cdFx0XHRuYW1lLFxuXHRcdFx0Y29ubmVjdGlvblRva2VuLFxuXHRcdFx0cmVsYXksXG5cdFx0XHRyZWxheUNsaWVudCxcblx0XHQpO1xuXG5cdFx0Y29ubi5vbkRpZENsb3NlKCgpID0+IHtcblx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25zLmRlbGV0ZShjb25uZWN0aW9uSWQpO1xuXHRcdFx0dGhpcy5fb25EaWRSZWxheUNsb3NlLmZpcmUoY29ubmVjdGlvbklkKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2Nvbm5lY3Rpb25zLnNldChjb25uZWN0aW9uSWQsIGNvbm4pO1xuXHRcdHJldHVybiB7IGNvbm5lY3Rpb25JZCwgYWRkcmVzcywgbmFtZSwgY29ubmVjdGlvblRva2VuIH07XG5cdH1cblxuXHRhc3luYyByZWxheVNlbmQoY29ubmVjdGlvbklkOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbm4gPSB0aGlzLl9jb25uZWN0aW9ucy5nZXQoY29ubmVjdGlvbklkKTtcblx0XHRpZiAoY29ubikge1xuXHRcdFx0Y29ubi5yZWxheVNlbmQobWVzc2FnZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZGlzY29ubmVjdChjb25uZWN0aW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbm4gPSB0aGlzLl9jb25uZWN0aW9ucy5nZXQoY29ubmVjdGlvbklkKTtcblx0XHRpZiAoY29ubikge1xuXHRcdFx0Y29ubi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlTWFuYWdlbWVudENsaWVudCh0b2tlbjogc3RyaW5nLCBhdXRoUHJvdmlkZXI6ICdnaXRodWInIHwgJ21pY3Jvc29mdCcpOiBQcm9taXNlPFR1bm5lbE1hbmFnZW1lbnRIdHRwQ2xpZW50PiB7XG5cdFx0Y29uc3QgbWdtdCA9IGF3YWl0IGltcG9ydCgnQG1pY3Jvc29mdC9kZXYtdHVubmVscy1tYW5hZ2VtZW50Jyk7XG5cdFx0Y29uc3QgYXV0aEhlYWRlciA9IGF1dGhQcm92aWRlciA9PT0gJ2dpdGh1YicgPyBgZ2l0aHViICR7dG9rZW59YCA6IGBCZWFyZXIgJHt0b2tlbn1gO1xuXG5cdFx0cmV0dXJuIG5ldyBtZ210LlR1bm5lbE1hbmFnZW1lbnRIdHRwQ2xpZW50KFxuXHRcdFx0J3ZzY29kZS1zZXNzaW9ucycsXG5cdFx0XHRtZ210Lk1hbmFnZW1lbnRBcGlWZXJzaW9ucy5WZXJzaW9uMjAyMzA5MjdwcmV2aWV3LFxuXHRcdFx0YXN5bmMgKCkgPT4gYXV0aEhlYWRlcixcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VUdW5uZWxJbmZvKHR1bm5lbDogVHVubmVsKTogSVR1bm5lbEluZm8gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxhYmVscyA9IHR1bm5lbC5sYWJlbHMgPz8gW107XG5cdFx0Y29uc3QgdGFncyA9IG5ldyBUdW5uZWxUYWdzKGxhYmVscyk7XG5cblx0XHRpZiAodGFncy5wcm90b2NvbFZlcnNpb24gPCBUVU5ORUxfTUlOX1BST1RPQ09MX1ZFUlNJT04pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHVubmVsSWQgPSB0dW5uZWwudHVubmVsSWQ7XG5cdFx0Y29uc3QgY2x1c3RlcklkID0gdHVubmVsLmNsdXN0ZXJJZDtcblx0XHRpZiAoIXR1bm5lbElkIHx8ICFjbHVzdGVySWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmFtZSA9IHRhZ3MubmFtZSB8fCB0dW5uZWwubmFtZSB8fCB0dW5uZWxJZDtcblx0XHRjb25zdCByYXdDb3VudCA9IHR1bm5lbC5zdGF0dXM/Lmhvc3RDb25uZWN0aW9uQ291bnQ7XG5cdFx0Y29uc3QgaG9zdENvbm5lY3Rpb25Db3VudCA9IHR5cGVvZiByYXdDb3VudCA9PT0gJ251bWJlcicgPyByYXdDb3VudCA6IChyYXdDb3VudD8uY3VycmVudCA/PyAwKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHVubmVsSWQsXG5cdFx0XHRjbHVzdGVySWQsXG5cdFx0XHRuYW1lLFxuXHRcdFx0dGFnczogbGFiZWxzLFxuXHRcdFx0cHJvdG9jb2xWZXJzaW9uOiB0YWdzLnByb3RvY29sVmVyc2lvbixcblx0XHRcdGhvc3RDb25uZWN0aW9uQ291bnQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVdlYlNvY2tldFJlbGF5KFxuXHRcdHBvcnRTdHJlYW06IE5vZGVKUy5SZWFkV3JpdGVTdHJlYW0sXG5cdFx0Y29ubmVjdGlvblRva2VuOiBzdHJpbmcsXG5cdFx0Y29ubmVjdGlvbklkOiBzdHJpbmcsXG5cdCk6IFByb21pc2U8eyBzZW5kOiAoZGF0YTogc3RyaW5nKSA9PiB2b2lkOyBjbG9zZTogKCkgPT4gdm9pZCB9PiB7XG5cdFx0Y29uc3QgV1MgPSBhd2FpdCBpbXBvcnQoJ3dzJyk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Ly8gQ29uc3RydWN0IFdlYlNvY2tldCBVUkwgXHUyMDE0IHRoZSBzdHJlYW0gaXMgYWxyZWFkeSBjb25uZWN0ZWQgdG8gdGhlIHJpZ2h0IHBvcnRcblx0XHRcdGxldCB1cmwgPSBgd3M6Ly9sb2NhbGhvc3Q6JHtUVU5ORUxfQUdFTlRfSE9TVF9QT1JUfWA7XG5cdFx0XHRpZiAoY29ubmVjdGlvblRva2VuKSB7XG5cdFx0XHRcdHVybCArPSBgP3Rrbj0ke2VuY29kZVVSSUNvbXBvbmVudChjb25uZWN0aW9uVG9rZW4pfWA7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENyZWF0ZSBXZWJTb2NrZXQgb3ZlciB0aGUgZXhpc3Rpbmcgc3RyZWFtIGZyb20gdGhlIHR1bm5lbCByZWxheVxuXHRcdFx0Y29uc3Qgd3MgPSBuZXcgV1MuV2ViU29ja2V0KHVybCwge1xuXHRcdFx0XHRjcmVhdGVDb25uZWN0aW9uOiAoKCkgPT4gcG9ydFN0cmVhbSkgYXMgdW5rbm93biBhcyBXZWJTb2NrZXQuQ2xpZW50T3B0aW9uc1snY3JlYXRlQ29ubmVjdGlvbiddLFxuXHRcdFx0fSk7XG5cblx0XHRcdHdzLm9uKCdvcGVuJywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gV2ViU29ja2V0IHJlbGF5IGNvbm5lY3RlZCB0byBhZ2VudCBob3N0IHZpYSB0dW5uZWxgKTtcblx0XHRcdFx0cmVzb2x2ZSh7XG5cdFx0XHRcdFx0c2VuZDogKGRhdGE6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHdzLnJlYWR5U3RhdGUgPT09IHdzLk9QRU4pIHtcblx0XHRcdFx0XHRcdFx0d3Muc2VuZChkYXRhKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNsb3NlOiAoKSA9PiB3cy5jbG9zZSgpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR3cy5vbignbWVzc2FnZScsIChkYXRhOiBXZWJTb2NrZXQuUmF3RGF0YSkgPT4ge1xuXHRcdFx0XHRsZXQgdGV4dDogc3RyaW5nO1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuXHRcdFx0XHRcdHRleHQgPSBCdWZmZXIuY29uY2F0KGRhdGEpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZGF0YSBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG5cdFx0XHRcdFx0dGV4dCA9IEJ1ZmZlci5mcm9tKG5ldyBVaW50OEFycmF5KGRhdGEpKS50b1N0cmluZygpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRleHQgPSBkYXRhLnRvU3RyaW5nKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fb25EaWRSZWxheU1lc3NhZ2UuZmlyZSh7IGNvbm5lY3Rpb25JZCwgZGF0YTogdGV4dCB9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR3cy5vbignY2xvc2UnLCAoY29kZTogbnVtYmVyLCByZWFzb246IEJ1ZmZlcikgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gV2ViU29ja2V0IHJlbGF5IGNsb3NlZCBmb3IgY29ubmVjdGlvbiAke2Nvbm5lY3Rpb25JZH07IGNvZGU9JHtjb2RlfSwgcmVhc29uPSR7cmVhc29uPy50b1N0cmluZygpIHx8ICcoZW1wdHkpJ31gKTtcblx0XHRcdFx0Y29uc3QgY29ubiA9IHRoaXMuX2Nvbm5lY3Rpb25zLmdldChjb25uZWN0aW9uSWQpO1xuXHRcdFx0XHRpZiAoY29ubikge1xuXHRcdFx0XHRcdGNvbm4uZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0d3Mub24oJ2Vycm9yJywgKHdzRXJyOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBXZWJTb2NrZXQgcmVsYXkgZXJyb3I6ICR7d3NFcnIgaW5zdGFuY2VvZiBFcnJvciA/IHdzRXJyLm1lc3NhZ2UgOiBTdHJpbmcod3NFcnIpfWApO1xuXHRcdFx0XHRyZWplY3Qod3NFcnIpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBT0EsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUM1QjtBQUFBLEVBRUM7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FJTTtBQUVQLE1BQU0sYUFBYTtBQWFaLE1BQU0seUJBQXlCO0FBRXRDLGVBQXNCLFlBQ3JCLElBQ0EsV0FDQSxVQUNhO0FBSWIsTUFBSSxXQUFXO0FBQ2YsUUFBTSxTQUFTLE1BQU0sWUFBWSxHQUFHLEdBQUcsV0FBVyxNQUFNO0FBQUUsZUFBVztBQUFBLEVBQU0sQ0FBQztBQUM1RSxNQUFJLFVBQVU7QUFDYixVQUFNLElBQUksTUFBTSxHQUFHLFVBQVUsSUFBSSxRQUFRLG9CQUFvQixTQUFTLElBQUk7QUFBQSxFQUMzRTtBQUNBLFNBQU87QUFDUjtBQU1BLFNBQVMsc0JBQXNCLFVBQTBCO0FBQ3hELFFBQU0sT0FBTyxXQUFXLFFBQVE7QUFDaEMsT0FBSyxPQUFPLFFBQVE7QUFDcEIsTUFBSSxTQUFTLEtBQUssT0FBTyxXQUFXO0FBQ3BDLE1BQUksT0FBTyxXQUFXLEdBQUcsR0FBRztBQUMzQixhQUFTLElBQUksTUFBTTtBQUFBLEVBQ3BCO0FBQ0EsU0FBTztBQUNSO0FBR0EsTUFBTSx5QkFBeUIsV0FBVztBQUFBLEVBTXpDLFlBQ1UsY0FDQSxTQUNBLE1BQ0EsaUJBQ1EsUUFDQSxjQUNoQjtBQUNELFVBQU07QUFQRztBQUNBO0FBQ0E7QUFDQTtB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LENBQUM7QUFBQSxNQUNuRDtBQUdBLFlBQU0sS0FBSyxJQUFJLEdBQUcsVUFBVSxLQUFLO0FBQUEsUUFDaEMsbUJBQW1CLE1BQU07QUFBQSxNQUMxQixDQUFDO0FBRUQsU0FBRyxHQUFHLFFBQVEsTUFBTTtBQUNuQixhQUFLLFlBQVksS0FBSyxHQUFHLFVBQVUscURBQXFEO0FBQ3hGLGdCQUFRO0FBQUEsVUFDUCxNQUFNLENBQUMsU0FBaUI7QUFDdkIsZ0JBQUksR0FBRyxlQUFlLEdBQUcsTUFBTTtBQUM5QixpQkFBRyxLQUFLLElBQUk7QUFBQSxZQUNiO0FBQUEsVUFDRDtBQUFBLFVBQ0EsT0FBTyxNQUFNLEdBQUcsTUFBTTtBQUFBLFFBQ3ZCLENBQUM7QUFBQSxNQUNGLENBQUM7QUFFRCxTQUFHLEdBQUcsV0FBVyxDQUFDLFNBQTRCO0FBQzdDLFlBQUk7QUFDSixZQUFJLE1BQU0sUUFBUSxJQUFJLEdBQUc7QUFDeEIsaUJBQU8sT0FBTyxPQUFPLElBQUksRUFBRSxTQUFTO0FBQUEsUUFDckMsV0FBVyxnQkFBZ0IsYUFBYTtBQUN2QyxpQkFBTyxPQUFPLEtBQUssSUFBSSxXQUFXLElBQUksQ0FBQyxFQUFFLFNBQVM7QUFBQSxRQUNuRCxPQUFPO0FBQ04saUJBQU8sS0FBSyxTQUFTO0FBQUEsUUFDdEI7QUFDQSxhQUFLLG1CQUFtQixLQUFLLEVBQUUsY0FBYyxNQUFNLEtBQUssQ0FBQztBQUFBLE1BQzFELENBQUM7QUFFRCxTQUFHLEdBQUcsU0FBUyxDQUFDLE1BQWMsV0FBbUI7QUFDaEQsYUFBSyxZQUFZLEtBQUssR0FBRyxVQUFVLDBDQUEwQyxZQUFZLFVBQVUsSUFBSSxZQUFZLFFBQVEsU0FBUyxLQUFLLFNBQVMsRUFBRTtBQUNwSixjQUFNLE9BQU8sS0FBSyxhQUFhLElBQUksWUFBWTtBQUMvQyxZQUFJLE1BQU07QUFDVCxlQUFLLFFBQVE7QUFBQSxRQUNkO0FBQUEsTUFDRCxDQUFDO0FBRUQsU0FBRyxHQUFHLFNBQVMsQ0FBQyxVQUFtQjtBQUNsQyxhQUFLLFlBQVksS0FBSyxHQUFHLFVBQVUsMkJBQTJCLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtBQUssQ0FBQyxFQUFFO0FBQ3RILGVBQU8sS0FBSztBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQTdSYSw2QkFBTjtBQUFBLEVBWUo7QUFBQSxHQVpVOyIsCiAgIm5hbWVzIjogWyJjb25uIl0KfQo=
