import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { agentHostAuthority, toAgentHostUri } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { AgentHostAhpJsonlLoggingSettingId } from "../../../../../platform/agentHost/common/agentService.js";
import { AGENT_HOST_LOG_OUTPUT_CHANNEL_ID, remoteAgentHostLogOutputChannelId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { buildLocalCopilotLogsUri, buildRemoteCopilotLogsUri, COPILOT_CLI_LOCAL_AH_SCHEME, getCopilotCliSessionRawId, parseRemoteAuthorityFromScheme, resolveEventsUri } from "../copilotCliEventsUri.js";
const WINDOW_LOG_CHANNEL_ID = "rendererLog";
const SHARED_PROCESS_LOG_CHANNEL_ID = "shared";
const MAX_COPILOT_LOG_SCAN_FILES = 20;
const MAX_COPILOT_LOG_FILE_SIZE = 10 * 1024 * 1024;
const DEFAULT_RAW_LOG_VIEW_CAP_BYTES = 2 * 1024 * 1024;
var AgentHostLogSourceKind = /* @__PURE__ */ ((AgentHostLogSourceKind2) => {
  AgentHostLogSourceKind2["Events"] = "events";
  AgentHostLogSourceKind2["WireLog"] = "wire";
  AgentHostLogSourceKind2["CliLog"] = "cliLog";
  AgentHostLogSourceKind2["ProcessChannel"] = "processChannel";
  AgentHostLogSourceKind2["RemoteProcessLog"] = "remoteProcessLog";
  return AgentHostLogSourceKind2;
})(AgentHostLogSourceKind || {});
function isAgentHostSession(resource) {
  if (!resource) {
    return false;
  }
  return resource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME || !!parseRemoteAuthorityFromScheme(resource.scheme);
}
function getRemoteConnectionForSession(sessionResource, connections) {
  const authority = parseRemoteAuthorityFromScheme(sessionResource.scheme);
  return authority ? connections.find((connection) => agentHostAuthority(connection.address) === authority) : void 0;
}
function sanitizeFilePart(value) {
  return value.replace(/[\\/:\*\?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "connection";
}
async function enumerateAgentHostLogSources(services, sessionResource) {
  if (!isAgentHostSession(sessionResource) || !sessionResource) {
    return [];
  }
  const { pathService, agentHostService, remoteAgentHostService, outputService, fileService, configurationService, environmentService } = services;
  const userHome = pathService.userHome({ preferLocal: true });
  const isLocal = sessionResource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME;
  const remoteConnection = isLocal ? void 0 : getRemoteConnectionForSession(sessionResource, remoteAgentHostService.connections);
  const sources = [];
  const eventsResult = resolveEventsUri(
    sessionResource,
    userHome,
    (authority) => remoteAgentHostService.connections.find((c) => agentHostAuthority(c.address) === authority)
  );
  if (eventsResult.kind === "ok") {
    sources.push({
      id: "events",
      label: localize("agentHostLogs.events", "Session Events (events.jsonl)"),
      kind: "events" /* Events */,
      isRemote: !isLocal,
      resource: eventsResult.resource
    });
  }
  if (configurationService.getValue(AgentHostAhpJsonlLoggingSettingId)) {
    const nameToken = isLocal ? sanitizeFilePart(agentHostService.clientId) : remoteConnection ? sanitizeFilePart(remoteConnection.address) : void 0;
    const wireFiles = await listWireLogFiles(fileService, environmentService, nameToken);
    wireFiles.forEach((file, index) => {
      sources.push({
        id: `wire:${file.resource.toString()}`,
        label: index === 0 ? localize("agentHostLogs.wire", "AHP Log") : localize("agentHostLogs.wireN", "AHP Log \u2014 {0}", file.name),
        kind: "wire" /* WireLog */,
        isRemote: !isLocal,
        resource: file.resource
      });
    });
  }
  const channelIds = [];
  if (isLocal) {
    channelIds.push(AGENT_HOST_LOG_OUTPUT_CHANNEL_ID);
  } else if (remoteConnection) {
    channelIds.push(remoteAgentHostLogOutputChannelId(remoteConnection.address));
  }
  channelIds.push(WINDOW_LOG_CHANNEL_ID, SHARED_PROCESS_LOG_CHANNEL_ID);
  for (const channelId of channelIds) {
    const descriptor = outputService.getChannelDescriptor(channelId);
    if (!descriptor) {
      continue;
    }
    sources.push({
      id: `channel:${channelId}`,
      label: localize("agentHostLogs.channel", "{0} (Log)", descriptor.label),
      kind: "processChannel" /* ProcessChannel */,
      isRemote: !isLocal,
      channelId
    });
  }
  if (remoteConnection?.defaultDirectory) {
    sources.push({
      id: "remoteProcessLog",
      label: localize("agentHostLogs.remoteProcess", "Remote Agent Host Log (agenthost.log)"),
      kind: "remoteProcessLog" /* RemoteProcessLog */,
      isRemote: true,
      remoteConnection
    });
  }
  const rawSessionId = getCopilotCliSessionRawId(sessionResource);
  if (rawSessionId) {
    const copilotLogsDir = isLocal ? buildLocalCopilotLogsUri(userHome) : remoteConnection ? buildRemoteCopilotLogsUri(remoteConnection) : void 0;
    if (copilotLogsDir) {
      sources.push({
        id: "cliLog",
        label: localize("agentHostLogs.cliLog", "Copilot CLI Logs"),
        kind: "cliLog" /* CliLog */,
        isRemote: !isLocal,
        cliLogs: { dir: copilotLogsDir, rawSessionId }
      });
    }
  }
  return sources;
}
async function readAgentHostLogSourceContent(source, services, capBytes = DEFAULT_RAW_LOG_VIEW_CAP_BYTES) {
  const { fileService, outputService, textModelService, productService, logService } = services;
  switch (source.kind) {
    case "events" /* Events */:
    case "wire" /* WireLog */: {
      if (!source.resource) {
        return void 0;
      }
      return readFileTail(fileService, source.resource, capBytes);
    }
    case "processChannel" /* ProcessChannel */: {
      if (!source.channelId) {
        return void 0;
      }
      const channel = outputService.getChannel(source.channelId);
      if (!channel) {
        return void 0;
      }
      const modelRef = await textModelService.createModelReference(channel.uri);
      try {
        const value = modelRef.object.textEditorModel.getValue();
        return tailString(value, capBytes);
      } finally {
        modelRef.dispose();
      }
    }
    case "remoteProcessLog" /* RemoteProcessLog */: {
      if (!source.remoteConnection) {
        return void 0;
      }
      const value = await readRemoteAgentHostLog(source.remoteConnection, productService.serverDataFolderName, fileService);
      return value === void 0 ? void 0 : tailString(value, capBytes);
    }
    case "cliLog" /* CliLog */: {
      if (!source.cliLogs) {
        return void 0;
      }
      const files = await readCopilotLogsForSession(source.cliLogs.dir, source.cliLogs.rawSessionId, fileService, logService);
      if (files.length === 0) {
        return { text: "", totalBytes: 0, truncated: false };
      }
      const combined = files.map((f) => `===== ${f.path} =====
${f.contents}`).join("\n\n");
      return tailString(combined, capBytes);
    }
  }
}
async function listWireLogFiles(fileService, environmentService, nameToken) {
  const ahpDir = joinPath(environmentService.logsHome, "ahp");
  let children;
  try {
    children = (await fileService.resolve(ahpDir, { resolveMetadata: true })).children;
  } catch {
    return [];
  }
  const files = (children ?? []).filter((child) => !child.isDirectory && child.name.endsWith(".jsonl")).map((child) => ({ resource: child.resource, name: child.name, mtime: child.mtime ?? 0 }));
  const matching = nameToken ? files.filter((file) => file.name.includes(nameToken)) : [];
  const selected = matching.length > 0 ? matching : files;
  return selected.sort((a, b) => b.mtime - a.mtime);
}
async function readFileTail(fileService, resource, capBytes) {
  let size;
  try {
    size = (await fileService.resolve(resource, { resolveMetadata: true })).size;
  } catch {
    size = void 0;
  }
  if (size !== void 0 && size > capBytes) {
    const content2 = await fileService.readFile(resource, { position: size - capBytes, length: capBytes });
    let text = content2.value.toString();
    const firstNewline = text.indexOf("\n");
    if (firstNewline >= 0) {
      text = text.slice(firstNewline + 1);
    }
    return { text, totalBytes: size, truncated: true, fileResource: resource };
  }
  const content = await fileService.readFile(resource, { limits: { size: capBytes } });
  return { text: content.value.toString(), totalBytes: size, truncated: false, fileResource: resource };
}
function tailString(value, capBytes) {
  if (value.length <= capBytes) {
    return { text: value, totalBytes: value.length, truncated: false };
  }
  let text = value.slice(value.length - capBytes);
  const firstNewline = text.indexOf("\n");
  if (firstNewline >= 0) {
    text = text.slice(firstNewline + 1);
  }
  return { text, totalBytes: value.length, truncated: true };
}
async function readCopilotLogsForSession(logsDir, rawSessionId, fileService, logService) {
  const matchingLogs = await findCopilotLogsForSession(logsDir, rawSessionId, fileService, logService);
  const files = [];
  for (const log of matchingLogs) {
    try {
      const content = await fileService.readFile(log.resource, { limits: { size: MAX_COPILOT_LOG_FILE_SIZE } });
      files.push({ path: log.path, contents: content.value.toString() });
    } catch (error) {
      logService.warn(`[AgentHostLogSources] Failed to read Copilot log '${log.resource.path}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return files;
}
async function findCopilotLogsForSession(logsDir, rawSessionId, fileService, logService) {
  let children;
  try {
    children = (await fileService.resolve(logsDir, { resolveMetadata: true })).children;
  } catch {
    return [];
  }
  const files = [];
  const candidateLogs = (children ?? []).filter((child) => !child.isDirectory && child.name.endsWith(".log") && child.size <= MAX_COPILOT_LOG_FILE_SIZE).sort((a, b) => b.mtime - a.mtime).slice(0, MAX_COPILOT_LOG_SCAN_FILES);
  for (const child of candidateLogs) {
    try {
      if (await logStreamContains(child.resource, rawSessionId, fileService)) {
        files.push({ path: `copilot-logs/${child.name}`, resource: child.resource, size: child.size });
      }
    } catch (error) {
      logService.warn(`[AgentHostLogSources] Failed to scan Copilot log '${child.name}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return files;
}
async function logStreamContains(resource, rawSessionId, fileService) {
  const tokenSource = new CancellationTokenSource();
  let stream;
  try {
    stream = (await fileService.readFileStream(resource, {
      length: MAX_COPILOT_LOG_FILE_SIZE,
      limits: { size: MAX_COPILOT_LOG_FILE_SIZE }
    }, tokenSource.token)).value;
  } catch (error) {
    tokenSource.dispose(true);
    throw error;
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let previous = "";
    const cleanup = (removeErrorListener) => {
      stream.removeListener("data", onData);
      stream.removeListener("end", onEnd);
      if (removeErrorListener) {
        stream.removeListener("error", onError);
      }
    };
    const settle = (contains) => {
      if (settled) {
        return;
      }
      settled = true;
      tokenSource.dispose(contains);
      cleanup(!contains);
      resolve(contains);
    };
    const onData = (chunk) => {
      const text = previous + chunk.toString();
      if (text.includes(rawSessionId)) {
        settle(true);
        return;
      }
      previous = text.slice(Math.max(0, text.length - rawSessionId.length + 1));
    };
    const onError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      tokenSource.dispose();
      cleanup(true);
      reject(error);
    };
    const onEnd = () => {
      settle(false);
    };
    stream.on("error", onError);
    stream.on("end", onEnd);
    stream.on("data", onData);
  });
}
async function readRemoteAgentHostLog(connection, serverDataFolderName, fileService) {
  const homePath = connection.defaultDirectory;
  if (!homePath) {
    return void 0;
  }
  const authority = agentHostAuthority(connection.address);
  const homeUri = toAgentHostUri(URI.from({ scheme: "file", path: homePath }), authority);
  const candidates = /* @__PURE__ */ new Set();
  if (serverDataFolderName) {
    candidates.add(serverDataFolderName);
    if (serverDataFolderName.endsWith("-dev")) {
      candidates.add(serverDataFolderName.slice(0, -"-dev".length));
    }
  }
  candidates.add(".vscode-server");
  candidates.add(".vscode-server-insiders");
  candidates.add(".vscode-server-oss");
  candidates.add(".vscode-server-exploration");
  let best;
  for (const folderName of candidates) {
    const logsDirUri = joinPath(homeUri, folderName, "data", "logs");
    let entries;
    try {
      const stat = await fileService.resolve(logsDirUri, { resolveMetadata: true });
      entries = stat.children;
    } catch {
      continue;
    }
    if (!entries) {
      continue;
    }
    for (const dir of entries) {
      if (!dir.isDirectory) {
        continue;
      }
      const logUri = joinPath(dir.resource, "agenthost.log");
      let logStat;
      try {
        logStat = await fileService.resolve(logUri, { resolveMetadata: true });
      } catch {
        continue;
      }
      const mtime = logStat.mtime ?? 0;
      if (!best || mtime > best.mtime) {
        best = { uri: logUri, mtime };
      }
    }
  }
  if (!best) {
    return void 0;
  }
  const content = await fileService.readFile(best.uri);
  return content.value.toString();
}
export {
  AgentHostLogSourceKind,
  DEFAULT_RAW_LOG_VIEW_CAP_BYTES,
  MAX_COPILOT_LOG_FILE_SIZE,
  MAX_COPILOT_LOG_SCAN_FILES,
  enumerateAgentHostLogSources,
  findCopilotLogsForSession,
  getRemoteConnectionForSession,
  isAgentHostSession,
  readAgentHostLogSourceContent,
  readCopilotLogsForSession,
  readRemoteAgentHostLog,
  sanitizeFilePart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RGVidWcvYWdlbnRIb3N0TG9nU291cmNlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyLCB0eXBlIFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGFnZW50SG9zdEF1dGhvcml0eSwgdG9BZ2VudEhvc3RVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RBaHBKc29ubExvZ2dpbmdTZXR0aW5nSWQsIElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9MT0dfT1VUUFVUX0NIQU5ORUxfSUQsIElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uSW5mbywgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIHJlbW90ZUFnZW50SG9zdExvZ091dHB1dENoYW5uZWxJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCB0eXBlIElGaWxlU3RhdFdpdGhNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU91dHB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZExvY2FsQ29waWxvdExvZ3NVcmksIGJ1aWxkUmVtb3RlQ29waWxvdExvZ3NVcmksIENPUElMT1RfQ0xJX0xPQ0FMX0FIX1NDSEVNRSwgZ2V0Q29waWxvdENsaVNlc3Npb25SYXdJZCwgcGFyc2VSZW1vdGVBdXRob3JpdHlGcm9tU2NoZW1lLCByZXNvbHZlRXZlbnRzVXJpIH0gZnJvbSAnLi4vY29waWxvdENsaUV2ZW50c1VyaS5qcyc7XG5cbi8qKiBPdXRwdXQgY2hhbm5lbCBJRCBmb3IgdGhlIGN1cnJlbnQgd2luZG93J3MgcmVuZGVyZXIgbG9nLiAqL1xuY29uc3QgV0lORE9XX0xPR19DSEFOTkVMX0lEID0gJ3JlbmRlcmVyTG9nJztcbi8qKiBPdXRwdXQgY2hhbm5lbCBJRCBmb3IgdGhlIHNoYXJlZCBwcm9jZXNzIGNvbXBvdW5kIGxvZy4gKi9cbmNvbnN0IFNIQVJFRF9QUk9DRVNTX0xPR19DSEFOTkVMX0lEID0gJ3NoYXJlZCc7XG4vKiogQm91bmQgdGhlIGJlc3QtZWZmb3J0IHNjYW4gb2YgQ29waWxvdCBTREsgcHJvY2VzcyBsb2dzLiAqL1xuZXhwb3J0IGNvbnN0IE1BWF9DT1BJTE9UX0xPR19TQ0FOX0ZJTEVTID0gMjA7XG5leHBvcnQgY29uc3QgTUFYX0NPUElMT1RfTE9HX0ZJTEVfU0laRSA9IDEwICogMTAyNCAqIDEwMjQ7XG4vKiogRGVmYXVsdCBjYXAgZm9yIHRoZSBhbW91bnQgb2YgdGV4dCBsb2FkZWQgaW50byB0aGUgaW5saW5lIHJhdy1sb2cgdmlld2VyLiAqL1xuZXhwb3J0IGNvbnN0IERFRkFVTFRfUkFXX0xPR19WSUVXX0NBUF9CWVRFUyA9IDIgKiAxMDI0ICogMTAyNDtcblxuLyoqXG4gKiBBIG1hdGNoaW5nIENvcGlsb3QgcHJvY2VzcyBsb2cgdGhhdCBjYW4gYmUgcmVhZCBsYXppbHkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvcGlsb3RMb2dGaWxlIHtcblx0cmVhZG9ubHkgcGF0aDogc3RyaW5nO1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBzaXplOiBudW1iZXI7XG59XG5cbi8qKlxuICogRGlzY3JpbWluYXRlcyB0aGUga2luZCBvZiBhZ2VudC1ob3N0IGxvZyBhIHtAbGluayBJQWdlbnRIb3N0TG9nU291cmNlfVxuICogcG9pbnRzIGF0LCBzbyB0aGUgdmlld2VyIGNhbiBwaWNrIHRoZSBhcHByb3ByaWF0ZSByZWFkZXIgYW5kIHN5bnRheC5cbiAqL1xuZXhwb3J0IGNvbnN0IGVudW0gQWdlbnRIb3N0TG9nU291cmNlS2luZCB7XG5cdC8qKiBUaGUgQ29waWxvdCBDTEkgYGV2ZW50cy5qc29ubGAgbW9kZWwvY29udmVyc2F0aW9uIHN0cmVhbS4gKi9cblx0RXZlbnRzID0gJ2V2ZW50cycsXG5cdC8qKiBUaGUgY2xpZW50LXNpZGUgQUhQIEpTT04tUlBDIHdpcmUgbG9nIChgPGxvZ3NIb21lPi9haHAvKi5qc29ubGApLiAqL1xuXHRXaXJlTG9nID0gJ3dpcmUnLFxuXHQvKiogVGhlIENvcGlsb3QgU0RLIHByb2Nlc3MgbG9ncyB1bmRlciBgPENPUElMT1RfSE9NRT4vbG9nc2AuICovXG5cdENsaUxvZyA9ICdjbGlMb2cnLFxuXHQvKiogQSBWUyBDb2RlIG91dHB1dCBjaGFubmVsIChhZ2VudCBob3N0IHByb2Nlc3MsIHJlbmRlcmVyLCBzaGFyZWQpLiAqL1xuXHRQcm9jZXNzQ2hhbm5lbCA9ICdwcm9jZXNzQ2hhbm5lbCcsXG5cdC8qKiBUaGUgcmVtb3RlIG1hY2hpbmUncyBgYWdlbnRob3N0LmxvZ2AsIGRvd25sb2FkZWQgb24gZGVtYW5kLiAqL1xuXHRSZW1vdGVQcm9jZXNzTG9nID0gJ3JlbW90ZVByb2Nlc3NMb2cnLFxufVxuXG4vKipcbiAqIERlc2NyaWJlcyBvbmUgcmF3IGxvZyBzb3VyY2UgYXZhaWxhYmxlIGZvciBhbiBhZ2VudC1ob3N0IHNlc3Npb24uIERlc2NyaXB0b3JzXG4gKiBhcmUgY2hlYXAgdG8gZW51bWVyYXRlOyB0aGUgYWN0dWFsIChib3VuZGVkKSBjb250ZW50IGlzIHJlYWQgbGF6aWx5IHZpYVxuICoge0BsaW5rIHJlYWRBZ2VudEhvc3RMb2dTb3VyY2VDb250ZW50fSB3aGVuIHRoZSB1c2VyIHNlbGVjdHMgdGhlIHNvdXJjZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0TG9nU291cmNlIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkga2luZDogQWdlbnRIb3N0TG9nU291cmNlS2luZDtcblx0cmVhZG9ubHkgaXNSZW1vdGU6IGJvb2xlYW47XG5cdC8qKiBGaWxlIHJlc291cmNlIGZvciBmaWxlLWJhY2tlZCBzb3VyY2VzIChldmVudHMsIHdpcmUgbG9nKS4gKi9cblx0cmVhZG9ubHkgcmVzb3VyY2U/OiBVUkk7XG5cdC8qKiBPdXRwdXQgY2hhbm5lbCBpZCBmb3IgY2hhbm5lbC1iYWNrZWQgc291cmNlcy4gKi9cblx0cmVhZG9ubHkgY2hhbm5lbElkPzogc3RyaW5nO1xuXHQvKiogQ29waWxvdCBsb2dzIGRpcmVjdG9yeSArIHNlc3Npb24gaWQsIGZvciB0aGUgbGF6eSBjb250ZW50LWZpbHRlcmVkIENMSSBsb2cgcmVhZC4gKi9cblx0cmVhZG9ubHkgY2xpTG9ncz86IHsgcmVhZG9ubHkgZGlyOiBVUkk7IHJlYWRvbmx5IHJhd1Nlc3Npb25JZDogc3RyaW5nIH07XG5cdC8qKiBSZW1vdGUgY29ubmVjdGlvbiBmb3IgbGF6aWx5IGRvd25sb2FkaW5nIGBhZ2VudGhvc3QubG9nYC4gKi9cblx0cmVhZG9ubHkgcmVtb3RlQ29ubmVjdGlvbj86IElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uSW5mbztcbn1cblxuLyoqIEJhZyBvZiBzZXJ2aWNlcyByZXF1aXJlZCB0byBlbnVtZXJhdGUgYW5kIHJlYWQgYWdlbnQtaG9zdCBsb2cgc291cmNlcy4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdExvZ1NvdXJjZVNlcnZpY2VzIHtcblx0cmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZTtcblx0cmVhZG9ubHkgYWdlbnRIb3N0U2VydmljZTogSUFnZW50SG9zdFNlcnZpY2U7XG5cdHJlYWRvbmx5IHJlbW90ZUFnZW50SG9zdFNlcnZpY2U6IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlO1xuXHRyZWFkb25seSBvdXRwdXRTZXJ2aWNlOiBJT3V0cHV0U2VydmljZTtcblx0cmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZTtcblx0cmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2U7XG5cdHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZTtcblx0cmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZTtcblx0cmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2U7XG59XG5cbi8qKiBSZXN1bHQgb2YgYSBib3VuZGVkIHJhdy1sb2cgcmVhZC4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdExvZ0NvbnRlbnQge1xuXHRyZWFkb25seSB0ZXh0OiBzdHJpbmc7XG5cdC8qKiBUb3RhbCBzaXplIG9mIHRoZSB1bmRlcmx5aW5nIHNvdXJjZSBpbiBieXRlcywgd2hlbiBrbm93bi4gKi9cblx0cmVhZG9ubHkgdG90YWxCeXRlczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHQvKiogVHJ1ZSB3aGVuIG9ubHkgdGhlIHRhaWwgb2YgdGhlIHNvdXJjZSB3YXMgbG9hZGVkLiAqL1xuXHRyZWFkb25seSB0cnVuY2F0ZWQ6IGJvb2xlYW47XG5cdC8qKiBGdWxsLWZpZGVsaXR5IHJlc291cmNlIHRvIG9wZW4gaW4gYW4gZWRpdG9yLCB3aGVuIHRoZSBzb3VyY2UgaXMgZmlsZS1iYWNrZWQuICovXG5cdHJlYWRvbmx5IGZpbGVSZXNvdXJjZT86IFVSSTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgd2hlbiB0aGUgY2hhdCBzZXNzaW9uIGJlbG9uZ3MgdG8gYW4gYWdlbnQgaG9zdCAobG9jYWwgb3JcbiAqIHJlbW90ZSBDb3BpbG90IENMSSkuIE9ubHkgdGhlc2Ugc2Vzc2lvbnMgaGF2ZSBBSFAgbG9ncyBhbmQgYWdlbnQtaG9zdFxuICogcHJvY2VzcyBsb2dzLCBzbyB0aGUgQUhQIExvZyB2aWV3IGlzIGdhdGVkIG9uIHRoaXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0FnZW50SG9zdFNlc3Npb24ocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRpZiAoIXJlc291cmNlKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiByZXNvdXJjZS5zY2hlbWUgPT09IENPUElMT1RfQ0xJX0xPQ0FMX0FIX1NDSEVNRSB8fCAhIXBhcnNlUmVtb3RlQXV0aG9yaXR5RnJvbVNjaGVtZShyZXNvdXJjZS5zY2hlbWUpO1xufVxuXG4vKipcbiAqIFJlc29sdmVzIHRoZSByZW1vdGUgYWdlbnQtaG9zdCBjb25uZWN0aW9uIHRoYXQgYmFja3MgYSBnaXZlbiByZW1vdGUgc2Vzc2lvblxuICogVVJJLCBvciBgdW5kZWZpbmVkYCBmb3IgbG9jYWwvdW5rbm93biBzZXNzaW9ucy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFJlbW90ZUNvbm5lY3Rpb25Gb3JTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJLCBjb25uZWN0aW9uczogcmVhZG9ubHkgSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvW10pOiBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8gfCB1bmRlZmluZWQge1xuXHRjb25zdCBhdXRob3JpdHkgPSBwYXJzZVJlbW90ZUF1dGhvcml0eUZyb21TY2hlbWUoc2Vzc2lvblJlc291cmNlLnNjaGVtZSk7XG5cdHJldHVybiBhdXRob3JpdHkgPyBjb25uZWN0aW9ucy5maW5kKGNvbm5lY3Rpb24gPT4gYWdlbnRIb3N0QXV0aG9yaXR5KGNvbm5lY3Rpb24uYWRkcmVzcykgPT09IGF1dGhvcml0eSkgOiB1bmRlZmluZWQ7XG59XG5cbi8qKiBTYW5pdGl6ZXMgYSB2YWx1ZSBmb3IgdXNlIGFzIChwYXJ0IG9mKSBhIGZpbGUgbmFtZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzYW5pdGl6ZUZpbGVQYXJ0KHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gdmFsdWUucmVwbGFjZSgvW1xcXFwvOlxcKlxcP1wiPD58XFxzXSsvZywgJy0nKS5yZXBsYWNlKC9eLSt8LSskL2csICcnKSB8fCAnY29ubmVjdGlvbic7XG59XG5cbi8qKlxuICogRW51bWVyYXRlcyB0aGUgcmF3IGxvZyBzb3VyY2VzIGF2YWlsYWJsZSBmb3IgYSBnaXZlbiBhZ2VudC1ob3N0IHNlc3Npb24uXG4gKiBDaGVhcDogcGVyZm9ybXMgYXQgbW9zdCBhIGNvdXBsZSBvZiBkaXJlY3Rvcnkgc3RhdHMgYW5kIG5ldmVyIHJlYWRzIGZpbGVcbiAqIGNvbnRlbnRzLiBSZXR1cm5zIGFuIGVtcHR5IGFycmF5IGZvciBub24tYWdlbnQtaG9zdCBzZXNzaW9ucy5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGVudW1lcmF0ZUFnZW50SG9zdExvZ1NvdXJjZXMoXG5cdHNlcnZpY2VzOiBJQWdlbnRIb3N0TG9nU291cmNlU2VydmljZXMsXG5cdHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLFxuKTogUHJvbWlzZTxJQWdlbnRIb3N0TG9nU291cmNlW10+IHtcblx0aWYgKCFpc0FnZW50SG9zdFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSB8fCAhc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Y29uc3QgeyBwYXRoU2VydmljZSwgYWdlbnRIb3N0U2VydmljZSwgcmVtb3RlQWdlbnRIb3N0U2VydmljZSwgb3V0cHV0U2VydmljZSwgZmlsZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UgfSA9IHNlcnZpY2VzO1xuXHRjb25zdCB1c2VySG9tZSA9IHBhdGhTZXJ2aWNlLnVzZXJIb21lKHsgcHJlZmVyTG9jYWw6IHRydWUgfSk7XG5cdGNvbnN0IGlzTG9jYWwgPSBzZXNzaW9uUmVzb3VyY2Uuc2NoZW1lID09PSBDT1BJTE9UX0NMSV9MT0NBTF9BSF9TQ0hFTUU7XG5cdGNvbnN0IHJlbW90ZUNvbm5lY3Rpb24gPSBpc0xvY2FsID8gdW5kZWZpbmVkIDogZ2V0UmVtb3RlQ29ubmVjdGlvbkZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlLCByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zKTtcblxuXHRjb25zdCBzb3VyY2VzOiBJQWdlbnRIb3N0TG9nU291cmNlW10gPSBbXTtcblxuXHQvLyAxLiBldmVudHMuanNvbmwgKG1vZGVsL2NvbnZlcnNhdGlvbiBzdHJlYW0pXG5cdGNvbnN0IGV2ZW50c1Jlc3VsdCA9IHJlc29sdmVFdmVudHNVcmkoXG5cdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdHVzZXJIb21lLFxuXHRcdGF1dGhvcml0eSA9PiByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoYyA9PiBhZ2VudEhvc3RBdXRob3JpdHkoYy5hZGRyZXNzKSA9PT0gYXV0aG9yaXR5KSxcblx0KTtcblx0aWYgKGV2ZW50c1Jlc3VsdC5raW5kID09PSAnb2snKSB7XG5cdFx0c291cmNlcy5wdXNoKHtcblx0XHRcdGlkOiAnZXZlbnRzJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRIb3N0TG9ncy5ldmVudHMnLCBcIlNlc3Npb24gRXZlbnRzIChldmVudHMuanNvbmwpXCIpLFxuXHRcdFx0a2luZDogQWdlbnRIb3N0TG9nU291cmNlS2luZC5FdmVudHMsXG5cdFx0XHRpc1JlbW90ZTogIWlzTG9jYWwsXG5cdFx0XHRyZXNvdXJjZTogZXZlbnRzUmVzdWx0LnJlc291cmNlLFxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gMi4gQUhQIHdpcmUgbG9nKHMpIFx1MjAxNCBvbmx5IHdoZW4gd2lyZSBsb2dnaW5nIGlzIGVuYWJsZWQuXG5cdGlmIChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBZ2VudEhvc3RBaHBKc29ubExvZ2dpbmdTZXR0aW5nSWQpKSB7XG5cdFx0Y29uc3QgbmFtZVRva2VuID0gaXNMb2NhbFxuXHRcdFx0PyBzYW5pdGl6ZUZpbGVQYXJ0KGFnZW50SG9zdFNlcnZpY2UuY2xpZW50SWQpXG5cdFx0XHQ6IHJlbW90ZUNvbm5lY3Rpb24gPyBzYW5pdGl6ZUZpbGVQYXJ0KHJlbW90ZUNvbm5lY3Rpb24uYWRkcmVzcykgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgd2lyZUZpbGVzID0gYXdhaXQgbGlzdFdpcmVMb2dGaWxlcyhmaWxlU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBuYW1lVG9rZW4pO1xuXHRcdHdpcmVGaWxlcy5mb3JFYWNoKChmaWxlLCBpbmRleCkgPT4ge1xuXHRcdFx0c291cmNlcy5wdXNoKHtcblx0XHRcdFx0aWQ6IGB3aXJlOiR7ZmlsZS5yZXNvdXJjZS50b1N0cmluZygpfWAsXG5cdFx0XHRcdGxhYmVsOiBpbmRleCA9PT0gMFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdExvZ3Mud2lyZScsIFwiQUhQIExvZ1wiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FnZW50SG9zdExvZ3Mud2lyZU4nLCBcIkFIUCBMb2cgXHUyMDE0IHswfVwiLCBmaWxlLm5hbWUpLFxuXHRcdFx0XHRraW5kOiBBZ2VudEhvc3RMb2dTb3VyY2VLaW5kLldpcmVMb2csXG5cdFx0XHRcdGlzUmVtb3RlOiAhaXNMb2NhbCxcblx0XHRcdFx0cmVzb3VyY2U6IGZpbGUucmVzb3VyY2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdC8vIDMuIEFnZW50IGhvc3QgcHJvY2VzcyBsb2cgKG91dHB1dCBjaGFubmVsKSArIHdpbmRvdy9zaGFyZWQgbG9ncy5cblx0Y29uc3QgY2hhbm5lbElkczogc3RyaW5nW10gPSBbXTtcblx0aWYgKGlzTG9jYWwpIHtcblx0XHRjaGFubmVsSWRzLnB1c2goQUdFTlRfSE9TVF9MT0dfT1VUUFVUX0NIQU5ORUxfSUQpO1xuXHR9IGVsc2UgaWYgKHJlbW90ZUNvbm5lY3Rpb24pIHtcblx0XHRjaGFubmVsSWRzLnB1c2gocmVtb3RlQWdlbnRIb3N0TG9nT3V0cHV0Q2hhbm5lbElkKHJlbW90ZUNvbm5lY3Rpb24uYWRkcmVzcykpO1xuXHR9XG5cdGNoYW5uZWxJZHMucHVzaChXSU5ET1dfTE9HX0NIQU5ORUxfSUQsIFNIQVJFRF9QUk9DRVNTX0xPR19DSEFOTkVMX0lEKTtcblx0Zm9yIChjb25zdCBjaGFubmVsSWQgb2YgY2hhbm5lbElkcykge1xuXHRcdGNvbnN0IGRlc2NyaXB0b3IgPSBvdXRwdXRTZXJ2aWNlLmdldENoYW5uZWxEZXNjcmlwdG9yKGNoYW5uZWxJZCk7XG5cdFx0aWYgKCFkZXNjcmlwdG9yKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0c291cmNlcy5wdXNoKHtcblx0XHRcdGlkOiBgY2hhbm5lbDoke2NoYW5uZWxJZH1gLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudEhvc3RMb2dzLmNoYW5uZWwnLCBcInswfSAoTG9nKVwiLCBkZXNjcmlwdG9yLmxhYmVsKSxcblx0XHRcdGtpbmQ6IEFnZW50SG9zdExvZ1NvdXJjZUtpbmQuUHJvY2Vzc0NoYW5uZWwsXG5cdFx0XHRpc1JlbW90ZTogIWlzTG9jYWwsXG5cdFx0XHRjaGFubmVsSWQsXG5cdFx0fSk7XG5cdH1cblxuXHQvLyA0LiBSZW1vdGUgYWdlbnRob3N0LmxvZyAoZG93bmxvYWRlZCBvbiBkZW1hbmQpLlxuXHRpZiAocmVtb3RlQ29ubmVjdGlvbj8uZGVmYXVsdERpcmVjdG9yeSkge1xuXHRcdHNvdXJjZXMucHVzaCh7XG5cdFx0XHRpZDogJ3JlbW90ZVByb2Nlc3NMb2cnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudEhvc3RMb2dzLnJlbW90ZVByb2Nlc3MnLCBcIlJlbW90ZSBBZ2VudCBIb3N0IExvZyAoYWdlbnRob3N0LmxvZylcIiksXG5cdFx0XHRraW5kOiBBZ2VudEhvc3RMb2dTb3VyY2VLaW5kLlJlbW90ZVByb2Nlc3NMb2csXG5cdFx0XHRpc1JlbW90ZTogdHJ1ZSxcblx0XHRcdHJlbW90ZUNvbm5lY3Rpb24sXG5cdFx0fSk7XG5cdH1cblxuXHQvLyA1LiBDb3BpbG90IFNESyBwcm9jZXNzIGxvZ3MgKDxDT1BJTE9UX0hPTUU+L2xvZ3MpLCBjb250ZW50LWZpbHRlcmVkIGxhemlseSBieSBzZXNzaW9uIGlkLlxuXHRjb25zdCByYXdTZXNzaW9uSWQgPSBnZXRDb3BpbG90Q2xpU2Vzc2lvblJhd0lkKHNlc3Npb25SZXNvdXJjZSk7XG5cdGlmIChyYXdTZXNzaW9uSWQpIHtcblx0XHRjb25zdCBjb3BpbG90TG9nc0RpciA9IGlzTG9jYWxcblx0XHRcdD8gYnVpbGRMb2NhbENvcGlsb3RMb2dzVXJpKHVzZXJIb21lKVxuXHRcdFx0OiByZW1vdGVDb25uZWN0aW9uID8gYnVpbGRSZW1vdGVDb3BpbG90TG9nc1VyaShyZW1vdGVDb25uZWN0aW9uKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoY29waWxvdExvZ3NEaXIpIHtcblx0XHRcdHNvdXJjZXMucHVzaCh7XG5cdFx0XHRcdGlkOiAnY2xpTG9nJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudEhvc3RMb2dzLmNsaUxvZycsIFwiQ29waWxvdCBDTEkgTG9nc1wiKSxcblx0XHRcdFx0a2luZDogQWdlbnRIb3N0TG9nU291cmNlS2luZC5DbGlMb2csXG5cdFx0XHRcdGlzUmVtb3RlOiAhaXNMb2NhbCxcblx0XHRcdFx0Y2xpTG9nczogeyBkaXI6IGNvcGlsb3RMb2dzRGlyLCByYXdTZXNzaW9uSWQgfSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBzb3VyY2VzO1xufVxuXG4vKipcbiAqIFJlYWRzIHRoZSAoYm91bmRlZCkgY29udGVudCBvZiBhIGxvZyBzb3VyY2UuIEZpbGUtYmFja2VkIHNvdXJjZXMgYXJlIHRhaWxlZFxuICogdG8gYXQgbW9zdCBgY2FwQnl0ZXNgOyB0aGUgcmV0dXJuZWQge0BsaW5rIElBZ2VudEhvc3RMb2dDb250ZW50LmZpbGVSZXNvdXJjZX1cbiAqIGxldHMgY2FsbGVycyBvZmZlciBhbiBcIm9wZW4gZnVsbCBmaWxlXCIgYWZmb3JkYW5jZS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlYWRBZ2VudEhvc3RMb2dTb3VyY2VDb250ZW50KFxuXHRzb3VyY2U6IElBZ2VudEhvc3RMb2dTb3VyY2UsXG5cdHNlcnZpY2VzOiBJQWdlbnRIb3N0TG9nU291cmNlU2VydmljZXMsXG5cdGNhcEJ5dGVzOiBudW1iZXIgPSBERUZBVUxUX1JBV19MT0dfVklFV19DQVBfQllURVMsXG4pOiBQcm9taXNlPElBZ2VudEhvc3RMb2dDb250ZW50IHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IHsgZmlsZVNlcnZpY2UsIG91dHB1dFNlcnZpY2UsIHRleHRNb2RlbFNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBsb2dTZXJ2aWNlIH0gPSBzZXJ2aWNlcztcblxuXHRzd2l0Y2ggKHNvdXJjZS5raW5kKSB7XG5cdFx0Y2FzZSBBZ2VudEhvc3RMb2dTb3VyY2VLaW5kLkV2ZW50czpcblx0XHRjYXNlIEFnZW50SG9zdExvZ1NvdXJjZUtpbmQuV2lyZUxvZzoge1xuXHRcdFx0aWYgKCFzb3VyY2UucmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZWFkRmlsZVRhaWwoZmlsZVNlcnZpY2UsIHNvdXJjZS5yZXNvdXJjZSwgY2FwQnl0ZXMpO1xuXHRcdH1cblx0XHRjYXNlIEFnZW50SG9zdExvZ1NvdXJjZUtpbmQuUHJvY2Vzc0NoYW5uZWw6IHtcblx0XHRcdGlmICghc291cmNlLmNoYW5uZWxJZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2hhbm5lbCA9IG91dHB1dFNlcnZpY2UuZ2V0Q2hhbm5lbChzb3VyY2UuY2hhbm5lbElkKTtcblx0XHRcdGlmICghY2hhbm5lbCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbW9kZWxSZWYgPSBhd2FpdCB0ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGNoYW5uZWwudXJpKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gbW9kZWxSZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5nZXRWYWx1ZSgpO1xuXHRcdFx0XHRyZXR1cm4gdGFpbFN0cmluZyh2YWx1ZSwgY2FwQnl0ZXMpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0bW9kZWxSZWYuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjYXNlIEFnZW50SG9zdExvZ1NvdXJjZUtpbmQuUmVtb3RlUHJvY2Vzc0xvZzoge1xuXHRcdFx0aWYgKCFzb3VyY2UucmVtb3RlQ29ubmVjdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCByZWFkUmVtb3RlQWdlbnRIb3N0TG9nKHNvdXJjZS5yZW1vdGVDb25uZWN0aW9uLCBwcm9kdWN0U2VydmljZS5zZXJ2ZXJEYXRhRm9sZGVyTmFtZSwgZmlsZVNlcnZpY2UpO1xuXHRcdFx0cmV0dXJuIHZhbHVlID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiB0YWlsU3RyaW5nKHZhbHVlLCBjYXBCeXRlcyk7XG5cdFx0fVxuXHRcdGNhc2UgQWdlbnRIb3N0TG9nU291cmNlS2luZC5DbGlMb2c6IHtcblx0XHRcdGlmICghc291cmNlLmNsaUxvZ3MpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZpbGVzID0gYXdhaXQgcmVhZENvcGlsb3RMb2dzRm9yU2Vzc2lvbihzb3VyY2UuY2xpTG9ncy5kaXIsIHNvdXJjZS5jbGlMb2dzLnJhd1Nlc3Npb25JZCwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0aWYgKGZpbGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4geyB0ZXh0OiAnJywgdG90YWxCeXRlczogMCwgdHJ1bmNhdGVkOiBmYWxzZSB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29tYmluZWQgPSBmaWxlcy5tYXAoZiA9PiBgPT09PT0gJHtmLnBhdGh9ID09PT09XFxuJHtmLmNvbnRlbnRzfWApLmpvaW4oJ1xcblxcbicpO1xuXHRcdFx0cmV0dXJuIHRhaWxTdHJpbmcoY29tYmluZWQsIGNhcEJ5dGVzKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBMaXN0cyBBSFAgd2lyZSBsb2cgZmlsZXMgZm9yIGEgc2Vzc2lvbidzIGNvbm5lY3Rpb24uXG4gKlxuICogV2hlbiBgbmFtZVRva2VuYCBpZGVudGlmaWVzIHRoZSBzZXNzaW9uJ3MgY29ubmVjdGlvbiAoaXRzIGZpbGVuYW1lcyBlbWJlZFxuICogYGFocC08dGltZXN0YW1wPi08Y29ubmVjdGlvbklkPi5qc29ubGApLCBvbmx5IG1hdGNoaW5nIGZpbGVzIGFyZSByZXR1cm5lZCBcdTIwMTRcbiAqIHNvIHVucmVsYXRlZCBjb25uZWN0aW9ucycgbG9ncyBhcmUgbm90IHN1cmZhY2VkIGFzIHNwdXJpb3VzIFwicm90YXRlZFwiXG4gKiBzb3VyY2VzLiBGYWxscyBiYWNrIHRvIGFsbCBBSFAgbG9ncyAobmV3ZXN0IGZpcnN0KSB3aGVuIHRoZSB0b2tlbiBpcyBhYnNlbnRcbiAqIG9yIG1hdGNoZXMgbm90aGluZy5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gbGlzdFdpcmVMb2dGaWxlcyhcblx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0ZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRuYW1lVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZCxcbik6IFByb21pc2U8eyByZXNvdXJjZTogVVJJOyBuYW1lOiBzdHJpbmc7IG10aW1lOiBudW1iZXIgfVtdPiB7XG5cdGNvbnN0IGFocERpciA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS5sb2dzSG9tZSwgJ2FocCcpO1xuXHRsZXQgY2hpbGRyZW46IElGaWxlU3RhdFdpdGhNZXRhZGF0YVtdIHwgdW5kZWZpbmVkO1xuXHR0cnkge1xuXHRcdGNoaWxkcmVuID0gKGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoYWhwRGlyLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KSkuY2hpbGRyZW47XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRjb25zdCBmaWxlcyA9IChjaGlsZHJlbiA/PyBbXSlcblx0XHQuZmlsdGVyKGNoaWxkID0+ICFjaGlsZC5pc0RpcmVjdG9yeSAmJiBjaGlsZC5uYW1lLmVuZHNXaXRoKCcuanNvbmwnKSlcblx0XHQubWFwKGNoaWxkID0+ICh7IHJlc291cmNlOiBjaGlsZC5yZXNvdXJjZSwgbmFtZTogY2hpbGQubmFtZSwgbXRpbWU6IGNoaWxkLm10aW1lID8/IDAgfSkpO1xuXG5cdC8vIFJlc3RyaWN0IHRvIHRoZSBzZXNzaW9uJ3MgY29ubmVjdGlvbiB3aGVuIGl0IGNhbiBiZSBpZGVudGlmaWVkOyBvdGhlcndpc2Vcblx0Ly8gZmFsbCBiYWNrIHRvIGFsbCBmaWxlcyBzbyBhIHNlc3Npb24gaXMgbmV2ZXIgbGVmdCB3aXRob3V0IGFueSBsb2cuXG5cdGNvbnN0IG1hdGNoaW5nID0gbmFtZVRva2VuID8gZmlsZXMuZmlsdGVyKGZpbGUgPT4gZmlsZS5uYW1lLmluY2x1ZGVzKG5hbWVUb2tlbikpIDogW107XG5cdGNvbnN0IHNlbGVjdGVkID0gbWF0Y2hpbmcubGVuZ3RoID4gMCA/IG1hdGNoaW5nIDogZmlsZXM7XG5cblx0Ly8gTmV3ZXN0IGZpcnN0LlxuXHRyZXR1cm4gc2VsZWN0ZWQuc29ydCgoYSwgYikgPT4gYi5tdGltZSAtIGEubXRpbWUpO1xufVxuXG4vKiogUmVhZHMgYXQgbW9zdCBgY2FwQnl0ZXNgIGZyb20gdGhlIHRhaWwgb2YgYSBmaWxlLiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVhZEZpbGVUYWlsKGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsIHJlc291cmNlOiBVUkksIGNhcEJ5dGVzOiBudW1iZXIpOiBQcm9taXNlPElBZ2VudEhvc3RMb2dDb250ZW50PiB7XG5cdGxldCBzaXplOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHRyeSB7XG5cdFx0c2l6ZSA9IChhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKHJlc291cmNlLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KSkuc2l6ZTtcblx0fSBjYXRjaCB7XG5cdFx0c2l6ZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGlmIChzaXplICE9PSB1bmRlZmluZWQgJiYgc2l6ZSA+IGNhcEJ5dGVzKSB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlLCB7IHBvc2l0aW9uOiBzaXplIC0gY2FwQnl0ZXMsIGxlbmd0aDogY2FwQnl0ZXMgfSk7XG5cdFx0bGV0IHRleHQgPSBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0Ly8gRHJvcCB0aGUgbGVhZGluZyBwYXJ0aWFsIGxpbmUgc28gdGhlIHZpZXcgc3RhcnRzIG9uIGEgcmVjb3JkIGJvdW5kYXJ5LlxuXHRcdGNvbnN0IGZpcnN0TmV3bGluZSA9IHRleHQuaW5kZXhPZignXFxuJyk7XG5cdFx0aWYgKGZpcnN0TmV3bGluZSA+PSAwKSB7XG5cdFx0XHR0ZXh0ID0gdGV4dC5zbGljZShmaXJzdE5ld2xpbmUgKyAxKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgdGV4dCwgdG90YWxCeXRlczogc2l6ZSwgdHJ1bmNhdGVkOiB0cnVlLCBmaWxlUmVzb3VyY2U6IHJlc291cmNlIH07XG5cdH1cblxuXHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UsIHsgbGltaXRzOiB7IHNpemU6IGNhcEJ5dGVzIH0gfSk7XG5cdHJldHVybiB7IHRleHQ6IGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgdG90YWxCeXRlczogc2l6ZSwgdHJ1bmNhdGVkOiBmYWxzZSwgZmlsZVJlc291cmNlOiByZXNvdXJjZSB9O1xufVxuXG4vKiogUmV0dXJucyBhdCBtb3N0IGBjYXBCeXRlc2Agd29ydGggb2YgdGV4dCBmcm9tIHRoZSB0YWlsIG9mIGEgc3RyaW5nLiAqL1xuZnVuY3Rpb24gdGFpbFN0cmluZyh2YWx1ZTogc3RyaW5nLCBjYXBCeXRlczogbnVtYmVyKTogSUFnZW50SG9zdExvZ0NvbnRlbnQge1xuXHRpZiAodmFsdWUubGVuZ3RoIDw9IGNhcEJ5dGVzKSB7XG5cdFx0cmV0dXJuIHsgdGV4dDogdmFsdWUsIHRvdGFsQnl0ZXM6IHZhbHVlLmxlbmd0aCwgdHJ1bmNhdGVkOiBmYWxzZSB9O1xuXHR9XG5cdGxldCB0ZXh0ID0gdmFsdWUuc2xpY2UodmFsdWUubGVuZ3RoIC0gY2FwQnl0ZXMpO1xuXHRjb25zdCBmaXJzdE5ld2xpbmUgPSB0ZXh0LmluZGV4T2YoJ1xcbicpO1xuXHRpZiAoZmlyc3ROZXdsaW5lID49IDApIHtcblx0XHR0ZXh0ID0gdGV4dC5zbGljZShmaXJzdE5ld2xpbmUgKyAxKTtcblx0fVxuXHRyZXR1cm4geyB0ZXh0LCB0b3RhbEJ5dGVzOiB2YWx1ZS5sZW5ndGgsIHRydW5jYXRlZDogdHJ1ZSB9O1xufVxuXG4vKipcbiAqIFNjYW5zIGEgQ29waWxvdCBsb2dzIGRpcmVjdG9yeSBmb3IgYC5sb2dgIGZpbGVzIHdob3NlIGNvbnRlbnQgbWVudGlvbnMgdGhlXG4gKiBnaXZlbiBzZXNzaW9uIGlkLCByZXR1cm5pbmcgdGhlaXIgY29udGVudHMuIEJvdW5kZWQgYnlcbiAqIHtAbGluayBNQVhfQ09QSUxPVF9MT0dfU0NBTl9GSUxFU30gYW5kIHtAbGluayBNQVhfQ09QSUxPVF9MT0dfRklMRV9TSVpFfS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlYWRDb3BpbG90TG9nc0ZvclNlc3Npb24oXG5cdGxvZ3NEaXI6IFVSSSxcblx0cmF3U2Vzc2lvbklkOiBzdHJpbmcsXG5cdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuKTogUHJvbWlzZTx7IHBhdGg6IHN0cmluZzsgY29udGVudHM6IHN0cmluZyB9W10+IHtcblx0Y29uc3QgbWF0Y2hpbmdMb2dzID0gYXdhaXQgZmluZENvcGlsb3RMb2dzRm9yU2Vzc2lvbihsb2dzRGlyLCByYXdTZXNzaW9uSWQsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0Y29uc3QgZmlsZXM6IHsgcGF0aDogc3RyaW5nOyBjb250ZW50czogc3RyaW5nIH1bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGxvZyBvZiBtYXRjaGluZ0xvZ3MpIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGxvZy5yZXNvdXJjZSwgeyBsaW1pdHM6IHsgc2l6ZTogTUFYX0NPUElMT1RfTE9HX0ZJTEVfU0laRSB9IH0pO1xuXHRcdFx0ZmlsZXMucHVzaCh7IHBhdGg6IGxvZy5wYXRoLCBjb250ZW50czogY29udGVudC52YWx1ZS50b1N0cmluZygpIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRsb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RMb2dTb3VyY2VzXSBGYWlsZWQgdG8gcmVhZCBDb3BpbG90IGxvZyAnJHtsb2cucmVzb3VyY2UucGF0aH0nOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGZpbGVzO1xufVxuXG4vKipcbiAqIEZpbmRzIGJvdW5kZWQgQ29waWxvdCBwcm9jZXNzIGxvZ3Mgd2hvc2UgY29udGVudHMgbWVudGlvbiB0aGUgc2Vzc2lvbiBpZC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZpbmRDb3BpbG90TG9nc0ZvclNlc3Npb24oXG5cdGxvZ3NEaXI6IFVSSSxcblx0cmF3U2Vzc2lvbklkOiBzdHJpbmcsXG5cdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuKTogUHJvbWlzZTxJQ29waWxvdExvZ0ZpbGVbXT4ge1xuXHRsZXQgY2hpbGRyZW46IElGaWxlU3RhdFdpdGhNZXRhZGF0YVtdIHwgdW5kZWZpbmVkO1xuXHR0cnkge1xuXHRcdGNoaWxkcmVuID0gKGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUobG9nc0RpciwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSkpLmNoaWxkcmVuO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBmaWxlczogSUNvcGlsb3RMb2dGaWxlW10gPSBbXTtcblx0Y29uc3QgY2FuZGlkYXRlTG9ncyA9IChjaGlsZHJlbiA/PyBbXSlcblx0XHQuZmlsdGVyKGNoaWxkID0+ICFjaGlsZC5pc0RpcmVjdG9yeSAmJiBjaGlsZC5uYW1lLmVuZHNXaXRoKCcubG9nJykgJiYgY2hpbGQuc2l6ZSA8PSBNQVhfQ09QSUxPVF9MT0dfRklMRV9TSVpFKVxuXHRcdC5zb3J0KChhLCBiKSA9PiBiLm10aW1lIC0gYS5tdGltZSlcblx0XHQuc2xpY2UoMCwgTUFYX0NPUElMT1RfTE9HX1NDQU5fRklMRVMpO1xuXHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNhbmRpZGF0ZUxvZ3MpIHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKGF3YWl0IGxvZ1N0cmVhbUNvbnRhaW5zKGNoaWxkLnJlc291cmNlLCByYXdTZXNzaW9uSWQsIGZpbGVTZXJ2aWNlKSkge1xuXHRcdFx0XHRmaWxlcy5wdXNoKHsgcGF0aDogYGNvcGlsb3QtbG9ncy8ke2NoaWxkLm5hbWV9YCwgcmVzb3VyY2U6IGNoaWxkLnJlc291cmNlLCBzaXplOiBjaGlsZC5zaXplIH0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRsb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RMb2dTb3VyY2VzXSBGYWlsZWQgdG8gc2NhbiBDb3BpbG90IGxvZyAnJHtjaGlsZC5uYW1lfSc6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmlsZXM7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvZ1N0cmVhbUNvbnRhaW5zKFxuXHRyZXNvdXJjZTogVVJJLFxuXHRyYXdTZXNzaW9uSWQ6IHN0cmluZyxcblx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRsZXQgc3RyZWFtOiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtO1xuXHR0cnkge1xuXHRcdHN0cmVhbSA9IChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZVN0cmVhbShyZXNvdXJjZSwge1xuXHRcdFx0bGVuZ3RoOiBNQVhfQ09QSUxPVF9MT0dfRklMRV9TSVpFLFxuXHRcdFx0bGltaXRzOiB7IHNpemU6IE1BWF9DT1BJTE9UX0xPR19GSUxFX1NJWkUgfSxcblx0XHR9LCB0b2tlblNvdXJjZS50b2tlbikpLnZhbHVlO1xuXHR9IGNhdGNoIChlcnJvcikge1xuXHRcdHRva2VuU291cmNlLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0dGhyb3cgZXJyb3I7XG5cdH1cblx0cmV0dXJuIG5ldyBQcm9taXNlPGJvb2xlYW4+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRsZXQgc2V0dGxlZCA9IGZhbHNlO1xuXHRcdGxldCBwcmV2aW91cyA9ICcnO1xuXG5cdFx0Y29uc3QgY2xlYW51cCA9IChyZW1vdmVFcnJvckxpc3RlbmVyOiBib29sZWFuKSA9PiB7XG5cdFx0XHRzdHJlYW0ucmVtb3ZlTGlzdGVuZXIoJ2RhdGEnLCBvbkRhdGEpO1xuXHRcdFx0c3RyZWFtLnJlbW92ZUxpc3RlbmVyKCdlbmQnLCBvbkVuZCk7XG5cdFx0XHRpZiAocmVtb3ZlRXJyb3JMaXN0ZW5lcikge1xuXHRcdFx0XHRzdHJlYW0ucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgb25FcnJvcik7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBzZXR0bGUgPSAoY29udGFpbnM6IGJvb2xlYW4pID0+IHtcblx0XHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHNldHRsZWQgPSB0cnVlO1xuXHRcdFx0dG9rZW5Tb3VyY2UuZGlzcG9zZShjb250YWlucyk7XG5cdFx0XHRjbGVhbnVwKCFjb250YWlucyk7XG5cdFx0XHRyZXNvbHZlKGNvbnRhaW5zKTtcblx0XHR9O1xuXHRcdGNvbnN0IG9uRGF0YSA9IChjaHVuazogVlNCdWZmZXIpID0+IHtcblx0XHRcdGNvbnN0IHRleHQgPSBwcmV2aW91cyArIGNodW5rLnRvU3RyaW5nKCk7XG5cdFx0XHRpZiAodGV4dC5pbmNsdWRlcyhyYXdTZXNzaW9uSWQpKSB7XG5cdFx0XHRcdHNldHRsZSh0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cHJldmlvdXMgPSB0ZXh0LnNsaWNlKE1hdGgubWF4KDAsIHRleHQubGVuZ3RoIC0gcmF3U2Vzc2lvbklkLmxlbmd0aCArIDEpKTtcblx0XHR9O1xuXHRcdGNvbnN0IG9uRXJyb3IgPSAoZXJyb3I6IEVycm9yKSA9PiB7XG5cdFx0XHRpZiAoc2V0dGxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRzZXR0bGVkID0gdHJ1ZTtcblx0XHRcdHRva2VuU291cmNlLmRpc3Bvc2UoKTtcblx0XHRcdGNsZWFudXAodHJ1ZSk7XG5cdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdH07XG5cdFx0Y29uc3Qgb25FbmQgPSAoKSA9PiB7XG5cdFx0XHRzZXR0bGUoZmFsc2UpO1xuXHRcdH07XG5cblx0XHRzdHJlYW0ub24oJ2Vycm9yJywgb25FcnJvcik7XG5cdFx0c3RyZWFtLm9uKCdlbmQnLCBvbkVuZCk7XG5cdFx0c3RyZWFtLm9uKCdkYXRhJywgb25EYXRhKTtcblx0fSk7XG59XG5cbi8qKlxuICogUmVhZHMgdGhlIHJlbW90ZSBhZ2VudCBob3N0J3MgYGFnZW50aG9zdC5sb2dgIGZyb20gdGhlIHJlbW90ZSBtYWNoaW5lIHZpYSB0aGVcbiAqIGB2c2NvZGUtYWdlbnQtaG9zdDovL2AgZmlsZXN5c3RlbSBwcm94eS4gVGhlIENMSSBsYXVuY2hlcyB0aGUgc2VydmVyIHdpdGggaXRzXG4gKiBkZWZhdWx0IGRhdGEgZGlyIGF0IGA8aG9tZT4vPHNlcnZlckRhdGFGb2xkZXJOYW1lPi9kYXRhL2xvZ3MvPGRhdGVzdGFtcD4vYCxcbiAqIHNvIHdlIGxpc3QgdGhlIGxvZ3MgZGlyZWN0b3J5IGFuZCBwaWNrIHRoZSBtb3N0IHJlY2VudCBkYXRlLXN0YW1wZWQgZm9sZGVyLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhZFJlbW90ZUFnZW50SG9zdExvZyhcblx0Y29ubmVjdGlvbjogSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvLFxuXHRzZXJ2ZXJEYXRhRm9sZGVyTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgaG9tZVBhdGggPSBjb25uZWN0aW9uLmRlZmF1bHREaXJlY3Rvcnk7XG5cdGlmICghaG9tZVBhdGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGF1dGhvcml0eSA9IGFnZW50SG9zdEF1dGhvcml0eShjb25uZWN0aW9uLmFkZHJlc3MpO1xuXHRjb25zdCBob21lVXJpID0gdG9BZ2VudEhvc3RVcmkoVVJJLmZyb20oeyBzY2hlbWU6ICdmaWxlJywgcGF0aDogaG9tZVBhdGggfSksIGF1dGhvcml0eSk7XG5cblx0Ly8gUG9zc2libGUgc2VydmVyIGRhdGEgZm9sZGVyIGNhbmRpZGF0ZXMuIFRoZSByZW5kZXJlcidzIG93blxuXHQvLyBgc2VydmVyRGF0YUZvbGRlck5hbWVgICh3aGljaCB0aGUgdXNlciBpcyBydW5uaW5nKSBpcyB0aGUgbW9zdCBsaWtlbHlcblx0Ly8gbWF0Y2gsIGJ1dCB0aGUgcmVtb3RlIGFnZW50IGhvc3QgbWF5IGhhdmUgYmVlbiBsYXVuY2hlZCBieSBhIGRpZmZlcmVudFxuXHQvLyBxdWFsaXR5IG9mIENMSS4gRGV2IGJ1aWxkcyBhbHNvIGFwcGVuZCBgLWRldmAsIHdoaWNoIHdvbid0IGV4aXN0IG9uXG5cdC8vIGFueSByZWFsIGJ1aWx0IHJlbW90ZSwgc28gd2Ugc3RyaXAgdGhhdCBzdWZmaXggYXMgd2VsbC5cblx0Y29uc3QgY2FuZGlkYXRlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRpZiAoc2VydmVyRGF0YUZvbGRlck5hbWUpIHtcblx0XHRjYW5kaWRhdGVzLmFkZChzZXJ2ZXJEYXRhRm9sZGVyTmFtZSk7XG5cdFx0aWYgKHNlcnZlckRhdGFGb2xkZXJOYW1lLmVuZHNXaXRoKCctZGV2JykpIHtcblx0XHRcdGNhbmRpZGF0ZXMuYWRkKHNlcnZlckRhdGFGb2xkZXJOYW1lLnNsaWNlKDAsIC0nLWRldicubGVuZ3RoKSk7XG5cdFx0fVxuXHR9XG5cdGNhbmRpZGF0ZXMuYWRkKCcudnNjb2RlLXNlcnZlcicpO1xuXHRjYW5kaWRhdGVzLmFkZCgnLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMnKTtcblx0Y2FuZGlkYXRlcy5hZGQoJy52c2NvZGUtc2VydmVyLW9zcycpO1xuXHRjYW5kaWRhdGVzLmFkZCgnLnZzY29kZS1zZXJ2ZXItZXhwbG9yYXRpb24nKTtcblxuXHQvLyBFbnVtZXJhdGUgZXZlcnkgYDxob21lPi88Y2FuZGlkYXRlPi9kYXRhL2xvZ3MvPGRhdGVzdGFtcD4vYWdlbnRob3N0LmxvZ2Bcblx0Ly8gYWNyb3NzIGFsbCBjYW5kaWRhdGVzIGFuZCBwaWNrIHRoZSBvbmUgd2l0aCB0aGUgbmV3ZXN0IG10aW1lLiBUaGlzIGF2b2lkc1xuXHQvLyBwaWNraW5nIHVwIGEgc3RhbGUgc3RhYmxlLXF1YWxpdHkgZm9sZGVyIHdoZW4gYW4gaW5zaWRlcnMgZm9sZGVyIGhhcyBhXG5cdC8vIG1vcmUgcmVjZW50IGxvZyAob3IgdmljZSB2ZXJzYSkuXG5cdGxldCBiZXN0OiB7IHVyaTogVVJJOyBtdGltZTogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdGZvciAoY29uc3QgZm9sZGVyTmFtZSBvZiBjYW5kaWRhdGVzKSB7XG5cdFx0Y29uc3QgbG9nc0RpclVyaSA9IGpvaW5QYXRoKGhvbWVVcmksIGZvbGRlck5hbWUsICdkYXRhJywgJ2xvZ3MnKTtcblx0XHRsZXQgZW50cmllcztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUobG9nc0RpclVyaSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0XHRlbnRyaWVzID0gc3RhdC5jaGlsZHJlbjtcblx0XHR9IGNhdGNoIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoIWVudHJpZXMpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGRpciBvZiBlbnRyaWVzKSB7XG5cdFx0XHRpZiAoIWRpci5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxvZ1VyaSA9IGpvaW5QYXRoKGRpci5yZXNvdXJjZSwgJ2FnZW50aG9zdC5sb2cnKTtcblx0XHRcdGxldCBsb2dTdGF0O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bG9nU3RhdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUobG9nVXJpLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG10aW1lID0gbG9nU3RhdC5tdGltZSA/PyAwO1xuXHRcdFx0aWYgKCFiZXN0IHx8IG10aW1lID4gYmVzdC5tdGltZSkge1xuXHRcdFx0XHRiZXN0ID0geyB1cmk6IGxvZ1VyaSwgbXRpbWUgfTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAoIWJlc3QpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShiZXN0LnVyaSk7XG5cdHJldHVybiBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0Isc0JBQXNCO0FBQ25ELFNBQVMseUNBQTREO0FBQ3JFLFNBQVMsa0NBQTJGLHlDQUF5QztBQVM3SSxTQUFTLDBCQUEwQiwyQkFBMkIsNkJBQTZCLDJCQUEyQixnQ0FBZ0Msd0JBQXdCO0FBRzlLLE1BQU0sd0JBQXdCO0FBRTlCLE1BQU0sZ0NBQWdDO0FBRS9CLE1BQU0sNkJBQTZCO0FBQ25DLE1BQU0sNEJBQTRCLEtBQUssT0FBTztBQUU5QyxNQUFNLGlDQUFpQyxJQUFJLE9BQU87QUFlbEQsSUFBVyx5QkFBWCxrQkFBV0EsNEJBQVg7QUFFTixFQUFBQSx3QkFBQSxZQUFTO0FBRVQsRUFBQUEsd0JBQUEsYUFBVTtBQUVWLEVBQUFBLHdCQUFB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
