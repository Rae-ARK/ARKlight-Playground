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
import { equals as arraysEqual } from "../../../../base/common/arrays.js";
import { assertNever } from "../../../../base/common/assert.js";
import { Throttler } from "../../../../base/common/async.js";
import * as glob from "../../../../base/common/glob.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { equals as objectsEqual } from "../../../../base/common/objects.js";
import { autorun, autorunDelta, derivedOpts } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { FileSystemProviderCapabilities, IFileService } from "../../../../platform/files/common/files.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IDebugService } from "../../debug/common/debug.js";
import { IMcpRegistry } from "./mcpRegistryTypes.js";
import { McpServerTransportType } from "./mcpTypes.js";
let McpDevModeServerAttache = class extends Disposable {
  constructor(server, fwdRef, registry, fileService, workspaceContextService) {
    super();
    const workspaceFolder = server.readDefinitions().map(({ collection }) => collection?.presentation?.origin && workspaceContextService.getWorkspaceFolder(collection.presentation?.origin)?.uri);
    const restart = async () => {
      const lastDebugged = fwdRef.lastModeDebugged;
      await server.stop();
      await server.start({ debug: lastDebugged });
    };
    let didAutoStart = false;
    this._register(autorun((reader) => {
      const defs = server.readDefinitions().read(reader);
      if (!defs.collection || !defs.server || !defs.server.devMode) {
        didAutoStart = false;
        return;
      }
      if (didAutoStart) {
        return;
      }
      const delegates = registry.delegates.read(reader);
      if (!delegates.some((d) => d.canStart(defs.collection, defs.server))) {
        return;
      }
      server.start();
      didAutoStart = true;
    }));
    const debugMode = server.readDefinitions().map((d) => !!d.server?.devMode?.debug);
    this._register(autorunDelta(debugMode, ({ lastValue, newValue }) => {
      if (!!newValue && !objectsEqual(lastValue, newValue)) {
        restart();
      }
    }));
    const watchObs = derivedOpts({ equalsFn: arraysEqual }, (reader) => {
      const def = server.readDefinitions().read(reader);
      const watch = def.server?.devMode?.watch;
      return typeof watch === "string" ? [watch] : watch;
    });
    const restartScheduler = this._register(new Throttler());
    this._register(autorun((reader) => {
      const pattern = watchObs.read(reader);
      const wf = workspaceFolder.read(reader);
      if (!pattern || !wf) {
        return;
      }
      const includes = pattern.filter((p) => !p.startsWith("!"));
      const excludes = pattern.filter((p) => p.startsWith("!")).map((p) => p.slice(1));
      reader.store.add(fileService.watch(wf, { includes, excludes, recursive: true }));
      const ignoreCase = !fileService.hasCapability(wf, FileSystemProviderCapabilities.PathCaseSensitive);
      const includeParse = includes.map((p) => glob.parse({ base: wf.fsPath, pattern: p }, { ignoreCase }));
      const excludeParse = excludes.map((p) => glob.parse({ base: wf.fsPath, pattern: p }, { ignoreCase }));
      reader.store.add(fileService.onDidFilesChange((e) => {
        for (const change of [e.rawAdded, e.rawDeleted, e.rawUpdated]) {
          for (const uri of change) {
            if (includeParse.some((i) => i(uri.fsPath)) && !excludeParse.some((e2) => e2(uri.fsPath))) {
              restartScheduler.queue(restart);
              break;
            }
          }
        }
      }));
    }));
  }
};
McpDevModeServerAttache = __decorateClass([
  __decorateParam(2, IMcpRegistry),
  __decorateParam(3, IFileService),
  __decorateParam(4, IWorkspaceContextService)
], McpDevModeServerAttache);
const IMcpDevModeDebugging = createDecorator("mcpDevModeDebugging");
const DEBUG_HOST = "127.0.0.1";
let McpDevModeDebugging = class {
  constructor(_debugService, _commandService) {
    this._debugService = _debugService;
    this._commandService = _commandService;
  }
  async transform(definition, launch) {
    if (!definition.devMode?.debug || launch.type !== McpServerTransportType.Stdio) {
      return launch;
    }
    const port = await this.getDebugPort();
    const name = `MCP: ${definition.label}`;
    const options = { startedByUser: false, suppressDebugView: true };
    const commonConfig = {
      internalConsoleOptions: "neverOpen",
      suppressMultipleSessionWarning: true
    };
    switch (definition.devMode.debug.type) {
      case "node": {
        if (!/node[0-9]*$/.test(launch.command)) {
          throw new Error(localize("mcp.debug.nodeBinReq", 'MCP server must be launched with the "node" executable to enable debugging, but was launched with "{0}"', launch.command));
        }
        this._debugService.startDebugging(void 0, {
          type: "pwa-node",
          request: "attach",
          name,
          port,
          host: DEBUG_HOST,
          timeout: 3e4,
          continueOnAttach: true,
          ...commonConfig
        }, options);
        return { ...launch, args: [`--inspect-brk=${DEBUG_HOST}:${port}`, ...launch.args] };
      }
      case "debugpy": {
        if (!/python[0-9.]*$/.test(launch.command)) {
          throw new Error(localize("mcp.debug.pythonBinReq", 'MCP server must be launched with the "python" executable to enable debugging, but was launched with "{0}"', launch.command));
        }
        let command;
        let args = ["--wait-for-client", "--connect", `${DEBUG_HOST}:${port}`, ...launch.args];
        if (definition.devMode.debug.debugpyPath) {
          command = definition.devMode.debug.debugpyPath;
        } else {
          try {
            const debugPyPath = await this._commandService.executeCommand("python.getDebugpyPackagePath");
            if (debugPyPath) {
              command = launch.command;
              args = [debugPyPath, ...args];
            }
          } catch {
          }
        }
        if (!command) {
          command = "debugpy";
        }
        await Promise.race([
          // eslint-disable-next-line local/code-no-dangerous-type-assertions
          this._debugService.startDebugging(void 0, {
            type: "debugpy",
            name,
            request: "attach",
            listen: {
              host: DEBUG_HOST,
              port
            },
            ...commonConfig
          }, options),
          this.ensureListeningOnPort(port)
        ]);
        return { ...launch, command, args };
      }
      default:
        assertNever(definition.devMode.debug, `Unknown debug type ${JSON.stringify(definition.devMode.debug)}`);
    }
  }
  ensureListeningOnPort(port) {
    return Promise.resolve();
  }
  getDebugPort() {
    return Promise.resolve(9230);
  }
};
McpDevModeDebugging = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, ICommandService)
], McpDevModeDebugging);
export {
  IMcpDevModeDebugging,
  McpDevModeDebugging,
  McpDevModeServerAttache
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwRGV2TW9kZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGVxdWFscyBhcyBhcnJheXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBhc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBUaHJvdHRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgKiBhcyBnbG9iIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgYXMgb2JqZWN0c0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBhdXRvcnVuRGVsdGEsIGRlcml2ZWRPcHRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlnLCBJRGVidWdTZXJ2aWNlLCBJRGVidWdTZXNzaW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uL2RlYnVnL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBJTWNwUmVnaXN0cnkgfSBmcm9tICcuL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZlciwgTWNwU2VydmVyRGVmaW5pdGlvbiwgTWNwU2VydmVyTGF1bmNoLCBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlIH0gZnJvbSAnLi9tY3BUeXBlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNY3BEZXZNb2RlU2VydmVyQXR0YWNoZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRzZXJ2ZXI6IElNY3BTZXJ2ZXIsXG5cdFx0ZndkUmVmOiB7IGxhc3RNb2RlRGVidWdnZWQ6IGJvb2xlYW4gfSxcblx0XHRASU1jcFJlZ2lzdHJ5IHJlZ2lzdHJ5OiBJTWNwUmVnaXN0cnksXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Ugd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHNlcnZlci5yZWFkRGVmaW5pdGlvbnMoKS5tYXAoKHsgY29sbGVjdGlvbiB9KSA9PiBjb2xsZWN0aW9uPy5wcmVzZW50YXRpb24/Lm9yaWdpbiAmJlxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKGNvbGxlY3Rpb24ucHJlc2VudGF0aW9uPy5vcmlnaW4pPy51cmkpO1xuXG5cdFx0Y29uc3QgcmVzdGFydCA9IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxhc3REZWJ1Z2dlZCA9IGZ3ZFJlZi5sYXN0TW9kZURlYnVnZ2VkO1xuXHRcdFx0YXdhaXQgc2VydmVyLnN0b3AoKTtcblx0XHRcdGF3YWl0IHNlcnZlci5zdGFydCh7IGRlYnVnOiBsYXN0RGVidWdnZWQgfSk7XG5cdFx0fTtcblxuXHRcdC8vIDEuIEF1dG8tc3RhcnQgdGhlIHNlcnZlciwgcmVzdGFydCBpZiBlbnRlcmluZyBkZWJ1ZyBtb2RlXG5cdFx0bGV0IGRpZEF1dG9TdGFydCA9IGZhbHNlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGRlZnMgPSBzZXJ2ZXIucmVhZERlZmluaXRpb25zKCkucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFkZWZzLmNvbGxlY3Rpb24gfHwgIWRlZnMuc2VydmVyIHx8ICFkZWZzLnNlcnZlci5kZXZNb2RlKSB7XG5cdFx0XHRcdGRpZEF1dG9TdGFydCA9IGZhbHNlO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIGRvbid0IGtlZXAgdHJ5aW5nIHRvIHN0YXJ0IHRoZSBzZXJ2ZXIgdW5sZXNzIGl0J3MgYSBuZXcgc2VydmVyIG9yIGRldm1vZGUgaXMgbmV3bHkgdHVybmVkIG9uXG5cdFx0XHRpZiAoZGlkQXV0b1N0YXJ0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGVsZWdhdGVzID0gcmVnaXN0cnkuZGVsZWdhdGVzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghZGVsZWdhdGVzLnNvbWUoZCA9PiBkLmNhblN0YXJ0KGRlZnMuY29sbGVjdGlvbiEsIGRlZnMuc2VydmVyISkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0c2VydmVyLnN0YXJ0KCk7XG5cdFx0XHRkaWRBdXRvU3RhcnQgPSB0cnVlO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRlYnVnTW9kZSA9IHNlcnZlci5yZWFkRGVmaW5pdGlvbnMoKS5tYXAoZCA9PiAhIWQuc2VydmVyPy5kZXZNb2RlPy5kZWJ1Zyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bkRlbHRhKGRlYnVnTW9kZSwgKHsgbGFzdFZhbHVlLCBuZXdWYWx1ZSB9KSA9PiB7XG5cdFx0XHRpZiAoISFuZXdWYWx1ZSAmJiAhb2JqZWN0c0VxdWFsKGxhc3RWYWx1ZSwgbmV3VmFsdWUpKSB7XG5cdFx0XHRcdHJlc3RhcnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyAyLiBXYXRjaCBmb3IgZmlsZSBjaGFuZ2VzXG5cdFx0Y29uc3Qgd2F0Y2hPYnMgPSBkZXJpdmVkT3B0czxzdHJpbmdbXSB8IHVuZGVmaW5lZD4oeyBlcXVhbHNGbjogYXJyYXlzRXF1YWwgfSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGRlZiA9IHNlcnZlci5yZWFkRGVmaW5pdGlvbnMoKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB3YXRjaCA9IGRlZi5zZXJ2ZXI/LmRldk1vZGU/LndhdGNoO1xuXHRcdFx0cmV0dXJuIHR5cGVvZiB3YXRjaCA9PT0gJ3N0cmluZycgPyBbd2F0Y2hdIDogd2F0Y2g7XG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN0YXJ0U2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlcigpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHBhdHRlcm4gPSB3YXRjaE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB3ZiA9IHdvcmtzcGFjZUZvbGRlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXBhdHRlcm4gfHwgIXdmKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaW5jbHVkZXMgPSBwYXR0ZXJuLmZpbHRlcihwID0+ICFwLnN0YXJ0c1dpdGgoJyEnKSk7XG5cdFx0XHRjb25zdCBleGNsdWRlcyA9IHBhdHRlcm4uZmlsdGVyKHAgPT4gcC5zdGFydHNXaXRoKCchJykpLm1hcChwID0+IHAuc2xpY2UoMSkpO1xuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZChmaWxlU2VydmljZS53YXRjaCh3ZiwgeyBpbmNsdWRlcywgZXhjbHVkZXMsIHJlY3Vyc2l2ZTogdHJ1ZSB9KSk7XG5cblx0XHRcdGNvbnN0IGlnbm9yZUNhc2UgPSAhZmlsZVNlcnZpY2UuaGFzQ2FwYWJpbGl0eSh3ZiwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlBhdGhDYXNlU2Vuc2l0aXZlKTtcblx0XHRcdGNvbnN0IGluY2x1ZGVQYXJzZSA9IGluY2x1ZGVzLm1hcChwID0+IGdsb2IucGFyc2UoeyBiYXNlOiB3Zi5mc1BhdGgsIHBhdHRlcm46IHAgfSwgeyBpZ25vcmVDYXNlIH0pKTtcblx0XHRcdGNvbnN0IGV4Y2x1ZGVQYXJzZSA9IGV4Y2x1ZGVzLm1hcChwID0+IGdsb2IucGFyc2UoeyBiYXNlOiB3Zi5mc1BhdGgsIHBhdHRlcm46IHAgfSwgeyBpZ25vcmVDYXNlIH0pKTtcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQoZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgW2UucmF3QWRkZWQsIGUucmF3RGVsZXRlZCwgZS5yYXdVcGRhdGVkXSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdXJpIG9mIGNoYW5nZSkge1xuXHRcdFx0XHRcdFx0aWYgKGluY2x1ZGVQYXJzZS5zb21lKGkgPT4gaSh1cmkuZnNQYXRoKSkgJiYgIWV4Y2x1ZGVQYXJzZS5zb21lKGUgPT4gZSh1cmkuZnNQYXRoKSkpIHtcblx0XHRcdFx0XHRcdFx0cmVzdGFydFNjaGVkdWxlci5xdWV1ZShyZXN0YXJ0KTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1jcERldk1vZGVEZWJ1Z2dpbmcge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0dHJhbnNmb3JtKGRlZmluaXRpb246IE1jcFNlcnZlckRlZmluaXRpb24sIGxhdW5jaDogTWNwU2VydmVyTGF1bmNoKTogUHJvbWlzZTxNY3BTZXJ2ZXJMYXVuY2g+O1xufVxuXG5leHBvcnQgY29uc3QgSU1jcERldk1vZGVEZWJ1Z2dpbmcgPSBjcmVhdGVEZWNvcmF0b3I8SU1jcERldk1vZGVEZWJ1Z2dpbmc+KCdtY3BEZXZNb2RlRGVidWdnaW5nJyk7XG5cbmNvbnN0IERFQlVHX0hPU1QgPSAnMTI3LjAuMC4xJztcblxuZXhwb3J0IGNsYXNzIE1jcERldk1vZGVEZWJ1Z2dpbmcgaW1wbGVtZW50cyBJTWNwRGV2TW9kZURlYnVnZ2luZyB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cHVibGljIGFzeW5jIHRyYW5zZm9ybShkZWZpbml0aW9uOiBNY3BTZXJ2ZXJEZWZpbml0aW9uLCBsYXVuY2g6IE1jcFNlcnZlckxhdW5jaCk6IFByb21pc2U8TWNwU2VydmVyTGF1bmNoPiB7XG5cdFx0aWYgKCFkZWZpbml0aW9uLmRldk1vZGU/LmRlYnVnIHx8IGxhdW5jaC50eXBlICE9PSBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLlN0ZGlvKSB7XG5cdFx0XHRyZXR1cm4gbGF1bmNoO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvcnQgPSBhd2FpdCB0aGlzLmdldERlYnVnUG9ydCgpO1xuXHRcdGNvbnN0IG5hbWUgPSBgTUNQOiAke2RlZmluaXRpb24ubGFiZWx9YDsgLy8gZm9yIGRlYnVnZ2luZ1xuXHRcdGNvbnN0IG9wdGlvbnM6IElEZWJ1Z1Nlc3Npb25PcHRpb25zID0geyBzdGFydGVkQnlVc2VyOiBmYWxzZSwgc3VwcHJlc3NEZWJ1Z1ZpZXc6IHRydWUgfTtcblx0XHRjb25zdCBjb21tb25Db25maWc6IFBhcnRpYWw8SUNvbmZpZz4gPSB7XG5cdFx0XHRpbnRlcm5hbENvbnNvbGVPcHRpb25zOiAnbmV2ZXJPcGVuJyxcblx0XHRcdHN1cHByZXNzTXVsdGlwbGVTZXNzaW9uV2FybmluZzogdHJ1ZSxcblx0XHR9O1xuXG5cdFx0c3dpdGNoIChkZWZpbml0aW9uLmRldk1vZGUuZGVidWcudHlwZSkge1xuXHRcdFx0Y2FzZSAnbm9kZSc6IHtcblx0XHRcdFx0aWYgKCEvbm9kZVswLTldKiQvLnRlc3QobGF1bmNoLmNvbW1hbmQpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdtY3AuZGVidWcubm9kZUJpblJlcScsICdNQ1Agc2VydmVyIG11c3QgYmUgbGF1bmNoZWQgd2l0aCB0aGUgXCJub2RlXCIgZXhlY3V0YWJsZSB0byBlbmFibGUgZGVidWdnaW5nLCBidXQgd2FzIGxhdW5jaGVkIHdpdGggXCJ7MH1cIicsIGxhdW5jaC5jb21tYW5kKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBXZSBpbnRlbnRpb25hbGx5IGFzc2VydCB0eXBlcyBhcyB0aGUgREEgaGFzIGFkZGl0aW9uYWwgcHJvcGVydGllcyBiZXlvbmcgSUNvbmZpZ1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0XHRcdHRoaXMuX2RlYnVnU2VydmljZS5zdGFydERlYnVnZ2luZyh1bmRlZmluZWQsIHtcblx0XHRcdFx0XHR0eXBlOiAncHdhLW5vZGUnLFxuXHRcdFx0XHRcdHJlcXVlc3Q6ICdhdHRhY2gnLFxuXHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0cG9ydCxcblx0XHRcdFx0XHRob3N0OiBERUJVR19IT1NULFxuXHRcdFx0XHRcdHRpbWVvdXQ6IDMwXzAwMCxcblx0XHRcdFx0XHRjb250aW51ZU9uQXR0YWNoOiB0cnVlLFxuXHRcdFx0XHRcdC4uLmNvbW1vbkNvbmZpZyxcblx0XHRcdFx0fSBhcyBJQ29uZmlnLCBvcHRpb25zKTtcblx0XHRcdFx0cmV0dXJuIHsgLi4ubGF1bmNoLCBhcmdzOiBbYC0taW5zcGVjdC1icms9JHtERUJVR19IT1NUfToke3BvcnR9YCwgLi4ubGF1bmNoLmFyZ3NdIH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdkZWJ1Z3B5Jzoge1xuXHRcdFx0XHRpZiAoIS9weXRob25bMC05Ll0qJC8udGVzdChsYXVuY2guY29tbWFuZCkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ21jcC5kZWJ1Zy5weXRob25CaW5SZXEnLCAnTUNQIHNlcnZlciBtdXN0IGJlIGxhdW5jaGVkIHdpdGggdGhlIFwicHl0aG9uXCIgZXhlY3V0YWJsZSB0byBlbmFibGUgZGVidWdnaW5nLCBidXQgd2FzIGxhdW5jaGVkIHdpdGggXCJ7MH1cIicsIGxhdW5jaC5jb21tYW5kKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgY29tbWFuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRsZXQgYXJncyA9IFsnLS13YWl0LWZvci1jbGllbnQnLCAnLS1jb25uZWN0JywgYCR7REVCVUdfSE9TVH06JHtwb3J0fWAsIC4uLmxhdW5jaC5hcmdzXTtcblx0XHRcdFx0aWYgKGRlZmluaXRpb24uZGV2TW9kZS5kZWJ1Zy5kZWJ1Z3B5UGF0aCkge1xuXHRcdFx0XHRcdGNvbW1hbmQgPSBkZWZpbml0aW9uLmRldk1vZGUuZGVidWcuZGVidWdweVBhdGg7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdC8vIFRoZSBQeXRob24gZGVidWdnZXIgZXhwb3NlcyBhIGNvbW1hbmQgdG8gZ2V0IGl0cyBidW5kbGUgZGVidWdweSBtb2R1bGUgcGF0aC4gIFVzZSB0aGF0IGlmIGl0J3MgYXZhaWxhYmxlLlxuXHRcdFx0XHRcdFx0Y29uc3QgZGVidWdQeVBhdGggPSBhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxzdHJpbmcgfCB1bmRlZmluZWQ+KCdweXRob24uZ2V0RGVidWdweVBhY2thZ2VQYXRoJyk7XG5cdFx0XHRcdFx0XHRpZiAoZGVidWdQeVBhdGgpIHtcblx0XHRcdFx0XHRcdFx0Y29tbWFuZCA9IGxhdW5jaC5jb21tYW5kO1xuXHRcdFx0XHRcdFx0XHRhcmdzID0gW2RlYnVnUHlQYXRoLCAuLi5hcmdzXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdC8vIGlnbm9yZWQsIG5vIFB5dGhvbiBkZWJ1Z2dlciBleHRlbnNpb24gaW5zdGFsbGVkIG9yIGFuIGVycm9yIHRoZXJlaW5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHRcdFx0Y29tbWFuZCA9ICdkZWJ1Z3B5Jztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdFx0XHRcdHRoaXMuX2RlYnVnU2VydmljZS5zdGFydERlYnVnZ2luZyh1bmRlZmluZWQsIHtcblx0XHRcdFx0XHRcdHR5cGU6ICdkZWJ1Z3B5Jyxcblx0XHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0XHRyZXF1ZXN0OiAnYXR0YWNoJyxcblx0XHRcdFx0XHRcdGxpc3Rlbjoge1xuXHRcdFx0XHRcdFx0XHRob3N0OiBERUJVR19IT1NULFxuXHRcdFx0XHRcdFx0XHRwb3J0XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0Li4uY29tbW9uQ29uZmlnLFxuXHRcdFx0XHRcdH0gYXMgSUNvbmZpZywgb3B0aW9ucyksXG5cdFx0XHRcdFx0dGhpcy5lbnN1cmVMaXN0ZW5pbmdPblBvcnQocG9ydClcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0cmV0dXJuIHsgLi4ubGF1bmNoLCBjb21tYW5kLCBhcmdzIH07XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRhc3NlcnROZXZlcihkZWZpbml0aW9uLmRldk1vZGUuZGVidWcsIGBVbmtub3duIGRlYnVnIHR5cGUgJHtKU09OLnN0cmluZ2lmeShkZWZpbml0aW9uLmRldk1vZGUuZGVidWcpfWApO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBlbnN1cmVMaXN0ZW5pbmdPblBvcnQocG9ydDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldERlYnVn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
