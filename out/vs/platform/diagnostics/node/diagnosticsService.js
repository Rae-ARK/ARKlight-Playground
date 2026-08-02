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
import * as fs from "fs";
import * as osLib from "os";
import { Promises } from "../../../base/common/async.js";
import { getNodeType, parse } from "../../../base/common/json.js";
import { Schemas } from "../../../base/common/network.js";
import { basename, join } from "../../../base/common/path.js";
import { isLinux, isWindows } from "../../../base/common/platform.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { URI } from "../../../base/common/uri.js";
import { virtualMachineHint } from "../../../base/node/id.js";
import { Promises as pfs } from "../../../base/node/pfs.js";
import { listProcesses } from "../../../base/node/ps.js";
import { isRemoteDiagnosticError } from "../common/diagnostics.js";
import { ByteSize } from "../../files/common/files.js";
import { IProductService } from "../../product/common/productService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
const workspaceStatsCache = /* @__PURE__ */ new Map();
const NO_EXT_KEY = "\0no-extension";
async function collectWorkspaceStats(folder, filter, options) {
  const cacheKey = `${folder}::${filter.join(":")}::${options?.unbounded ? "unbounded" : "bounded"}`;
  if (!options?.skipCache) {
    const cached = workspaceStatsCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  } else {
    workspaceStatsCache.delete(cacheKey);
  }
  const configFilePatterns = [
    { tag: "grunt.js", filePattern: /^gruntfile\.js$/i },
    { tag: "gulp.js", filePattern: /^gulpfile\.js$/i },
    { tag: "tsconfig.json", filePattern: /^tsconfig\.json$/i },
    { tag: "package.json", filePattern: /^package\.json$/i },
    { tag: "jsconfig.json", filePattern: /^jsconfig\.json$/i },
    { tag: "tslint.json", filePattern: /^tslint\.json$/i },
    { tag: "eslint.json", filePattern: /^eslint\.json$/i },
    { tag: "tasks.json", filePattern: /^tasks\.json$/i },
    { tag: "launch.json", filePattern: /^launch\.json$/i },
    { tag: "mcp.json", filePattern: /^mcp\.json$/i },
    { tag: "settings.json", filePattern: /^settings\.json$/i },
    { tag: "webpack.config.js", filePattern: /^webpack\.config\.js$/i },
    { tag: "project.json", filePattern: /^project\.json$/i },
    { tag: "makefile", filePattern: /^makefile$/i },
    { tag: "sln", filePattern: /^.+\.sln$/i },
    { tag: "csproj", filePattern: /^.+\.csproj$/i },
    { tag: "cmake", filePattern: /^.+\.cmake$/i },
    { tag: "github-actions", filePattern: /^.+\.ya?ml$/i, relativePathPattern: /^\.github(?:\/|\\)workflows$/i },
    { tag: "devcontainer.json", filePattern: /^devcontainer\.json$/i },
    { tag: "dockerfile", filePattern: /^(dockerfile|docker\-compose\.ya?ml)$/i },
    { tag: "cursorrules", filePattern: /^\.cursorrules$/i },
    { tag: "cursorrules-dir", filePattern: /\.mdc$/i, relativePathPattern: /^\.cursor[\/\\]rules$/i },
    { tag: "github-instructions-dir", filePattern: /\.instructions\.md$/i, relativePathPattern: /^\.github[\/\\]instructions$/i },
    { tag: "github-prompts-dir", filePattern: /\.prompt\.md$/i, relativePathPattern: /^\.github[\/\\]prompts$/i },
    { tag: "clinerules", filePattern: /^\.clinerules$/i },
    { tag: "clinerules-dir", filePattern: /\.md$/i, relativePathPattern: /^\.clinerules$/i },
    { tag: "agent.md", filePattern: /^agent\.md$/i },
    { tag: "agents.md", filePattern: /^agents\.md$/i },
    { tag: "claude.md", filePattern: /^claude\.md$/i },
    { tag: "claude-settings", filePattern: /^settings\.json$/i, relativePathPattern: /^\.claude$/i },
    { tag: "claude-settings-local", filePattern: /^settings\.local\.json$/i, relativePathPattern: /^\.claude$/i },
    { tag: "claude-mcp", filePattern: /^mcp\.json$/i, relativePathPattern: /^\.claude$/i },
    { tag: "claude-commands-dir", filePattern: /\.md$/i, relativePathPattern: /^\.claude[\/\\]commands$/i },
    { tag: "claude-skills-dir", filePattern: /^SKILL\.md$/i, relativePathPattern: /^\.claude[\/\\]skills[\/\\]/i },
    { tag: "claude-rules-dir", filePattern: /\.md$/i, relativePathPattern: /^\.claude[\/\\]rules$/i },
    { tag: "gemini.md", filePattern: /^gemini\.md$/i },
    { tag: "copilot-instructions.md", filePattern: /^copilot\-instructions\.md$/i, relativePathPattern: /^\.github$/i }
  ];
  const fileTypes = /* @__PURE__ */ new Map();
  const configFiles = /* @__PURE__ */ new Map();
  const MAX_FILES = options?.unbounded ? Number.POSITIVE_INFINITY : 2e4;
  function collect(root, dir, filter2, token) {
    const relativePath = dir.substring(root.length + 1);
    return Promises.withAsyncBody(async (resolve) => {
      if (token.count >= MAX_FILES) {
        token.maxReached = true;
        resolve();
        return;
      }
      let files;
      token.readdirCount++;
      try {
        files = await pfs.readdir(dir, { withFileTypes: true });
      } catch (error) {
        resolve();
        return;
      }
      if (token.count >= MAX_FILES) {
        token.maxReached = true;
        resolve();
        return;
      }
      let pending = files.length;
      if (pending === 0) {
        resolve();
        return;
      }
      for (const file of files) {
        if (file.isDirectory()) {
          if (!filter2.includes(file.name)) {
            await collect(root, join(dir, file.name), filter2, token);
          }
          if (--pending === 0) {
            resolve();
            return;
          }
        } else {
          if (token.count >= MAX_FILES) {
            token.maxReached = true;
            resolve();
            return;
          }
          token.count++;
          const index = file.name.lastIndexOf(".");
          let fileType;
          if (index >= 0) {
            fileType = file.name.substring(index + 1) || void 0;
          }
          fileTypes.set(fileType ?? NO_EXT_KEY, (fileTypes.get(fileType ?? NO_EXT_KEY) ?? 0) + 1);
          for (const configFile of configFilePatterns) {
            if (configFile.relativePathPattern?.test(relativePath) !== false && configFile.filePattern.test(file.name)) {
              configFiles.set(configFile.tag, (configFiles.get(configFile.tag) ?? 0) + 1);
            }
          }
          if (--pending === 0) {
            resolve();
            return;
          }
        }
      }
    });
  }
  const statsPromise = Promises.withAsyncBody(async (resolve) => {
    const token = { count: 0, maxReached: false, readdirCount: 0 };
    const sw = new StopWatch(true);
    await collect(folder, folder, filter, token);
    const launchConfigs = await collectLaunchConfigs(folder);
    resolve({
      configFiles: asSortedItems(configFiles),
      fileTypes: asSortedItems(fileTypes),
      fileCount: token.count,
      maxFilesReached: token.maxReached,
      launchConfigFiles: launchConfigs,
      totalScanTime: sw.elapsed(),
      totalReaddirCount: token.readdirCount
    });
  });
  workspaceStatsCache.set(cacheKey, statsPromise);
  return statsPromise;
}
function asSortedItems(items) {
  return Array.from(items.entries(), ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
function getMachineInfo() {
  const machineInfo = {
    os: `${osLib.type()} ${osLib.arch()} ${osLib.release()}`,
    memory: `${(osLib.totalmem() / ByteSize.GB).toFixed(2)}GB (${(osLib.freemem() / ByteSize.GB).toFixed(2)}GB free)`,
    vmHint: `${Math.round(virtualMachineHint.value() * 100)}%`
  };
  const cpus = osLib.cpus();
  if (cpus && cpus.length > 0) {
    machineInfo.cpus = `${cpus[0].model} (${cpus.length} x ${cpus[0].speed})`;
  }
  return machineInfo;
}
async function collectLaunchConfigs(folder) {
  try {
    const launchConfigs = /* @__PURE__ */ new Map();
    const launchConfig = join(folder, ".vscode", "launch.json");
    const contents = await fs.promises.readFile(launchConfig);
    const errors = [];
    const json = parse(contents.toString(), errors);
    if (errors.length) {
      console.log(`Unable to parse ${launchConfig}`);
      return [];
    }
    if (getNodeType(json) === "object" && json["configurations"]) {
      for (const each of json["configurations"]) {
        const type = each["type"];
        if (type) {
          if (launchConfigs.has(type)) {
            launchConfigs.set(type, launchConfigs.get(type) + 1);
          } else {
            launchConfigs.set(type, 1);
          }
        }
      }
    }
    return asSortedItems(launchConfigs);
  } catch (error) {
    return [];
  }
}
let DiagnosticsService = class {
  constructor(telemetryService, productService) {
    this.telemetryService = telemetryService;
    this.productService = productService;
  }
  formatMachineInfo(info) {
    const output = [];
    output.push(`OS Version:       ${info.os}`);
    output.push(`CPUs:             ${info.cpus}`);
    output.push(`Memory (System):  ${info.memory}`);
    output.push(`VM:               ${info.vmHint}`);
    return output.join("\n");
  }
  formatEnvironment(info) {
    const output = [];
    output.push(`Version:          ${this.productService.nameShort} ${this.productService.version} (${this.productService.commit || "Commit unknown"}, ${this.productService.date || "Date unknown"})`);
    output.push(`OS Version:       ${osLib.type()} ${osLib.arch()} ${osLib.release()}`);
    const cpus = osLib.cpus();
    if (cpus && cpus.length > 0) {
      output.push(`CPUs:             ${cpus[0].model} (${cpus.length} x ${cpus[0].speed})`);
    }
    output.push(`Memory (System):  ${(osLib.totalmem() / ByteSize.GB).toFixed(2)}GB (${(osLib.freemem() / ByteSize.GB).toFixed(2)}GB free)`);
    if (!isWindows) {
      output.push(`Load (avg):       ${osLib.loadavg().map((l) => Math.round(l)).join(", ")}`);
    }
    output.push(`VM:               ${Math.round(virtualMachineHint.value() * 100)}%`);
    output.push(`Screen Reader:    ${info.screenReader ? "yes" : "no"}`);
    output.push(`Process Argv:     ${info.mainArguments.join(" ")}`);
    output.push(`GPU Status:       ${this.expandGPUFeatures(info.gpuFeatureStatus)}`);
    if (info.gpuLogMessages && info.gpuLogMessages.length > 0) {
      output.push(`GPU Log Messages:`);
      info.gpuLogMessages.forEach((msg) => {
        output.push(`${msg.header}: ${msg.message}`);
      });
    }
    return output.join("\n");
  }
  async getPerformanceInfo(info, remoteData, options) {
    return Promise.all([listProcesses(info.mainPID), this.formatWorkspaceMetadata(info, options)]).then(async (result) => {
      let [rootProcess, workspaceInfo] = result;
      let processInfo = this.formatProcessList(info, rootProcess);
      remoteData.forEach((diagnostics) => {
        if (isRemoteDiagnosticError(diagnostics)) {
          processInfo += `
${diagnostics.errorMessage}`;
          workspaceInfo += `
${diagnostics.errorMessage}`;
        } else {
          processInfo += `

Remote: ${diagnostics.hostName}`;
          if (diagnostics.processes) {
            processInfo += `
${this.formatProcessList(info, diagnostics.processes)}`;
          }
          if (diagnostics.workspaceMetadata) {
            workspaceInfo += `
|  Remote: ${diagnostics.hostName}`;
            for (const folder of Object.keys(diagnostics.workspaceMetadata)) {
              const metadata = diagnostics.workspaceMetadata[folder];
              let countMessage = `${metadata.fileCount} files`;
              if (metadata.maxFilesReached) {
                countMessage = `more than ${countMessage}`;
              }
              workspaceInfo += `|    Folder (${folder}): ${countMessage}`;
              workspaceInfo += this.formatWorkspaceStats(metadata);
            }
          }
        }
      });
      return {
        processInfo,
        workspaceInfo
      };
    });
  }
  async getSystemInfo(info, remoteData) {
    const { memory, vmHint, os, cpus } = getMachineInfo();
    const systemInfo = {
      os,
      memory,
      cpus,
      vmHint,
      processArgs: `${info.mainArguments.join(" ")}`,
      gpuStatus: info.gpuFeatureStatus,
      screenReader: `${info.screenReader ? "yes" : "no"}`,
      remoteData
    };
    if (!isWindows) {
      systemInfo.load = `${osLib.loadavg().map((l) => Math.round(l)).join(", ")}`;
    }
    if (isLinux) {
      systemInfo.linuxEnv = {
        desktopSession: process.env["DESKTOP_SESSION"],
        xdgSessionDesktop: process.env["XDG_SESSION_DESKTOP"],
        xdgCurrentDesktop: process.env["XDG_CURRENT_DESKTOP"],
        xdgSessionType: process.env["XDG_SESSION_TYPE"]
      };
    }
    return Promise.resolve(systemInfo);
  }
  async getDiagnostics(info, remoteDiagnostics) {
    const output = [];
    return listProcesses(info.mainPID).then(async (rootProcess) => {
      output.push("");
      output.push(this.formatEnvironment(info));
      output.push("");
      output.push(this.formatProcessList(info, rootProcess));
      if (info.windows.some((window) => window.folderURIs && window.folderURIs.length > 0 && !window.remoteAuthority)) {
        output.push("");
        output.push("Workspace Stats: ");
        output.push(await this.formatWorkspaceMetadata(info));
      }
      remoteDiagnostics.forEach((diagnostics) => {
        if (isRemoteDiagnosticError(diagnostics)) {
          output.push(`
${diagnostics.errorMessage}`);
        } else {
          output.push("\n\n");
          output.push(`Remote:           ${diagnostics.hostName}`);
          output.push(this.formatMachineInfo(diagnostics.machineInfo));
          if (diagnostics.processes) {
            output.push(this.formatProcessList(info, diagnostics.processes));
          }
          if (diagnostics.workspaceMetadata) {
            for (const folder of Object.keys(diagnostics.workspaceMetadata)) {
              const metadata = diagnostics.workspaceMetadata[folder];
              let countMessage = `${metadata.fileCount} files`;
              if (metadata.maxFilesReached) {
                countMessage = `more than ${countMessage}`;
              }
              output.push(`Folder (${folder}): ${countMessage}`);
              output.push(this.formatWorkspaceStats(metadata));
            }
          }
        }
      });
      output.push("");
      output.push("");
      return output.join("\n");
    });
  }
  formatWorkspaceStats(workspaceStats) {
    const output = [];
    const lineLength = 60;
    let col = 0;
    const appendAndWrap = (name, count) => {
      const item = ` ${name}(${count})`;
      if (col + item.length > lineLength) {
        output.push(line);
        line = "|                 ";
        col = line.length;
      } else {
        col += item.length;
      }
      line += item;
    };
    let line = "|      File types:";
    const maxShown = 10;
    const namedTypes = workspaceStats.fileTypes.filter((t) => t.name !== NO_EXT_KEY);
    const noExtCount = workspaceStats.fileTypes.filter((t) => t.name === NO_EXT_KEY).reduce((sum, t) => sum + t.count, 0);
    const max = Math.min(namedTypes.length, maxShown);
    for (let i = 0; i < max; i++) {
      const item = namedTypes[i];
      appendAndWrap(item.name, item.count);
    }
    let otherCount = noExtCount;
    for (let i = max; i < namedTypes.length; i++) {
      otherCount += namedTypes[i].count;
    }
    if (otherCount > 0) {
      appendAndWrap("other", otherCount);
    }
    output.push(line);
    if (workspaceStats.configFiles.length >= 0) {
      line = "|      Conf files:";
      col = 0;
      workspaceStats.configFiles.forEach((item) => {
        appendAndWrap(item.name, item.count);
      });
      output.push(line);
    }
    if (workspaceStats.launchConfigFiles.length > 0) {
      let line2 = "|      Launch Configs:";
      workspaceStats.launchConfigFiles.forEach((each) => {
        const item = each.count > 1 ? ` ${each.name}(${each.count})` : ` ${each.name}`;
        line2 += item;
      });
      output.push(line2);
    }
    return output.join("\n");
  }
  expandGPUFeatures(gpuFeatures) {
    const longestFeatureName = Math.max(...Object.keys(gpuFeatures).map((feature) => feature.length));
    return Object.keys(gpuFeatures).map((feature) => `${feature}:  ${" ".repeat(longestFeatureName - feature.length)}  ${gpuFeatures[feature]}`).join("\n                  ");
  }
  formatWorkspaceMetadata(info, options) {
    const output = [];
    const workspaceStatPromises = [];
    info.windows.forEach((window) => {
      if (window.folderURIs.length === 0 || !!window.remoteAuthority) {
        return;
      }
      output.push(`|  Window (${window.title})`);
      window.folderURIs.forEach((uriComponents) => {
        const folderUri = URI.revive(uriComponents);
        if (folderUri.scheme === Schemas.file) {
          const folder = folderUri.fsPath;
          workspaceStatPromises.push(collectWorkspaceStats(folder, ["node_modules", ".git"], options).then((stats) => {
            let countMessage = `${stats.fileCount} files`;
            if (stats.maxFilesReached) {
              countMessage = `more than ${countMessage}`;
            }
            output.push(`|    Folder (${basename(folder)}): ${countMessage}`);
            output.push(this.formatWorkspaceStats(stats));
          }).catch((error) => {
            output.push(`|      Error: Unable to collect workspace stats for folder ${folder} (${error.toString()})`);
          }));
        } else {
          output.push(`|    Folder (${folderUri.toString()}): Workspace stats not available.`);
        }
      });
    });
    return Promise.all(workspaceStatPromises).then((_) => output.join("\n")).catch((e) => `Unable to collect workspace stats: ${e}`);
  }
  formatProcessList(info, rootProcess) {
    const mapProcessToName = /* @__PURE__ */ new Map();
    info.windows.forEach((window) => mapProcessToName.set(window.pid, `window [${window.id}] (${window.title})`));
    info.pidToNames.forEach(({ pid, name }) => mapProcessToName.set(pid, name));
    const output = [];
    output.push("CPU %	Mem MB	   PID	Process");
    if (rootProcess) {
      this.formatProcessItem(info.mainPID, mapProcessToName, output, rootProcess, 0);
    }
    return output.join("\n");
  }
  formatProcessItem(mainPid, mapProcessToName, output, item, indent) {
    const isRoot = indent === 0;
    let name;
    if (isRoot) {
      name = item.pid === mainPid ? this.productService.applicationName : "remote-server";
    } else {
      if (mapProcessToName.has(item.pid)) {
        name = mapProcessToName.get(item.pid);
      } else {
        name = `${"  ".repeat(indent)} ${item.name}`;
      }
    }
    const memory = process.platform === "win32" ? item.mem : osLib.totalmem() * (item.mem / 100);
    output.push(`${item.load.toFixed(0).padStart(5, " ")}	${(memory / ByteSize.MB).toFixed(0).padStart(6, " ")}	${item.pid.toFixed(0).padStart(6, " ")}	${name}`);
    if (Array.isArray(item.children)) {
      item.children.forEach((child) => this.formatProcessItem(mainPid, mapProcessToName, output, child, indent + 1));
    }
  }
  async getWorkspaceFileExtensions(workspace) {
    const items = /* @__PURE__ */ new Set();
    for (const { uri } of workspace.folders) {
      const folderUri = URI.revive(uri);
      if (folderUri.scheme !== Schemas.file) {
        continue;
      }
      const folder = folderUri.fsPath;
      try {
        const stats = await collectWorkspaceStats(folder, ["node_modules", ".git"]);
        stats.fileTypes.forEach((item) => {
          if (item.name !== NO_EXT_KEY) {
            items.add(item.name);
          }
        });
      } catch {
      }
    }
    return { extensions: [...items] };
  }
  async reportWorkspaceStats(workspace) {
    for (const { uri } of workspace.folders) {
      const folderUri = URI.revive(uri);
      if (folderUri.scheme !== Schemas.file) {
        continue;
      }
      const folder = folderUri.fsPath;
      try {
        const stats = await collectWorkspaceStats(folder, ["node_modules", ".git"]);
        this.telemetryService.publicLog2("workspace.stats", {
          "workspace.id": workspace.telemetryId,
          rendererSessionId: workspace.rendererSessionId
        });
        stats.fileTypes.forEach((e) => {
          if (e.name === NO_EXT_KEY) {
            return;
          }
          this.telemetryService.publicLog2("workspace.stats.file", {
            rendererSessionId: workspace.rendererSessionId,
            type: e.name,
            count: e.count
          });
        });
        stats.launchConfigFiles.forEach((e) => {
          this.telemetryService.publicLog2("workspace.stats.launchConfigFile", {
            rendererSessionId: workspace.rendererSessionId,
            type: e.name,
            count: e.count
          });
        });
        stats.configFiles.forEach((e) => {
          this.telemetryService.publicLog2("workspace.stats.configFiles", {
            rendererSessionId: workspace.rendererSessionId,
            type: e.name,
            count: e.count
          });
        });
        this.telemetryService.publicLog2("workspace.stats.metadata", { duration: stats.totalScanTime, reachedLimit: stats.maxFilesReached, fileCount: stats.fileCount, readdirCount: stats.totalReaddirCount });
      } catch {
      }
    }
  }
};
DiagnosticsService = __decorateClass([
  __decorateParam(0, ITelemetryService),
  __decorateParam(1, IProductService)
], DiagnosticsService);
export {
  DiagnosticsService,
  collectLaunchConfigs,
  collectWorkspaceStats,
  getMachineInfo
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2RpYWdub3N0aWNzL25vZGUvZGlhZ25vc3RpY3NTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgb3NMaWIgZnJvbSAnb3MnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBnZXROb2RlVHlwZSwgcGFyc2UsIFBhcnNlRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBqb2luIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4LCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBQcm9jZXNzSXRlbSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3Nlcy5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHZpcnR1YWxNYWNoaW5lSGludCB9IGZyb20gJy4uLy4uLy4uL2Jhc2Uvbm9kZS9pZC5qcyc7XG5pbXBvcnQgeyBJRGlyZW50LCBQcm9taXNlcyBhcyBwZnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IGxpc3RQcm9jZXNzZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcHMuanMnO1xuaW1wb3J0IHsgSURpYWdub3N0aWNzU2VydmljZSwgSU1hY2hpbmVJbmZvLCBJTWFpblByb2Nlc3NEaWFnbm9zdGljcywgSVJlbW90ZURpYWdub3N0aWNFcnJvciwgSVJlbW90ZURpYWdub3N0aWNJbmZvLCBpc1JlbW90ZURpYWdub3N0aWNFcnJvciwgSVdvcmtzcGFjZUluZm9ybWF0aW9uLCBQZXJmb3JtYW5jZUluZm8sIFN5c3RlbUluZm8sIFdvcmtzcGFjZVN0YXRJdGVtLCBXb3Jrc3BhY2VTdGF0cyB9IGZyb20gJy4uL2NvbW1vbi9kaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgeyBCeXRlU2l6ZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5cbmludGVyZmFjZSBDb25maWdGaWxlUGF0dGVybnMge1xuXHR0YWc6IHN0cmluZztcblx0ZmlsZVBhdHRlcm46IFJlZ0V4cDtcblx0cmVsYXRpdmVQYXRoUGF0dGVybj86IFJlZ0V4cDtcbn1cblxuY29uc3Qgd29ya3NwYWNlU3RhdHNDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPFdvcmtzcGFjZVN0YXRzPj4oKTtcblxuLyoqIFNlbnRpbmVsIGtleSBpbiB7QGxpbmsgV29ya3NwYWNlU3RhdHMuZmlsZVR5cGVzfSBmb3IgZmlsZXMgd2l0aCBubyBleHRlbnNpb24uICovXG5jb25zdCBOT19FWFRfS0VZID0gJ1xcMG5vLWV4dGVuc2lvbic7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb2xsZWN0V29ya3NwYWNlU3RhdHMoZm9sZGVyOiBzdHJpbmcsIGZpbHRlcjogc3RyaW5nW10sIG9wdGlvbnM/OiB7IHNraXBDYWNoZT86IGJvb2xlYW47IHVuYm91bmRlZD86IGJvb2xlYW4gfSk6IFByb21pc2U8V29ya3NwYWNlU3RhdHM+IHtcblx0Ly8gSW5jbHVkZSBgdW5ib3VuZGVkYCBpbiB0aGUgY2FjaGUga2V5IHNvIGEgYm91bmRlZCAoMjBrLWNhcCkgcmVzdWx0IGlzIG5ldmVyXG5cdC8vIHJldHVybmVkIGZvciBhbiB1bmJvdW5kZWQgcmVxdWVzdCAod2hpY2ggd291bGQgc2lsZW50bHkgdHJ1bmNhdGUgY291bnRzKS5cblx0Y29uc3QgY2FjaGVLZXkgPSBgJHtmb2xkZXJ9Ojoke2ZpbHRlci5qb2luKCc6Jyl9Ojoke29wdGlvbnM/LnVuYm91bmRlZCA/ICd1bmJvdW5kZWQnIDogJ2JvdW5kZWQnfWA7XG5cdGlmICghb3B0aW9ucz8uc2tpcENhY2hlKSB7XG5cdFx0Y29uc3QgY2FjaGVkID0gd29ya3NwYWNlU3RhdHNDYWNoZS5nZXQoY2FjaGVLZXkpO1xuXHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdHJldHVybiBjYWNoZWQ7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdC8vIERyb3AgYW55IGluLWZsaWdodCBvciBzdGFsZSBlbnRyeSBzbyBjYWxsZXJzIGNhbiBiZSBzdXJlIHRoZXkgZ2V0IGZyZXNoIGRhdGEuXG5cdFx0d29ya3NwYWNlU3RhdHNDYWNoZS5kZWxldGUoY2FjaGVLZXkpO1xuXHR9XG5cblx0Y29uc3QgY29uZmlnRmlsZVBhdHRlcm5zOiBDb25maWdGaWxlUGF0dGVybnNbXSA9IFtcblx0XHR7IHRhZzogJ2dydW50LmpzJywgZmlsZVBhdHRlcm46IC9eZ3J1bnRmaWxlXFwuanMkL2kgfSxcblx0XHR7IHRhZzogJ2d1bHAuanMnLCBmaWxlUGF0dGVybjogL15ndWxwZmlsZVxcLmpzJC9pIH0sXG5cdFx0eyB0YWc6ICd0c2NvbmZpZy5qc29uJywgZmlsZVBhdHRlcm46IC9edHNjb25maWdcXC5qc29uJC9pIH0sXG5cdFx0eyB0YWc6ICdwYWNrYWdlLmpzb24nLCBmaWxlUGF0dGVybjogL15wYWNrYWdlXFwuanNvbiQvaSB9LFxuXHRcdHsgdGFnOiAnanNjb25maWcuanNvbicsIGZpbGVQYXR0ZXJuOiAvXmpzY29uZmlnXFwuanNvbiQvaSB9LFxuXHRcdHsgdGFnOiAndHNsaW50Lmpzb24nLCBmaWxlUGF0dGVybjogL150c2xpbnRcXC5qc29uJC9pIH0sXG5cdFx0eyB0YWc6ICdlc2xpbnQuanNvbicsIGZpbGVQYXR0ZXJuOiAvXmVzbGludFxcLmpzb24kL2kgfSxcblx0XHR7IHRhZzogJ3Rhc2tzLmpzb24nLCBmaWxlUGF0dGVybjogL150YXNrc1xcLmpzb24kL2kgfSxcblx0XHR7IHRhZzogJ2xhdW5jaC5qc29uJywgZmlsZVBhdHRlcm46IC9ebGF1bmNoXFwuanNvbiQvaSB9LFxuXHRcdHsgdGFnOiAnbWNwLmpzb24nLCBmaWxlUGF0dGVybjogL15tY3BcXC5qc29uJC9pIH0sXG5cdFx0eyB0YWc6ICdzZXR0aW5ncy5qc29uJywgZmlsZVBhdHRlcm46IC9ec2V0dGluZ3NcXC5qc29uJC9pIH0sXG5cdFx0eyB0YWc6ICd3ZWJwYWNrLmNvbmZpZy5qcycsIGZpbGVQYXR0ZXJuOiAvXndlYnBhY2tcXC5jb25maWdcXC5qcyQvaSB9LFxuXHRcdHsgdGFnOiAncHJvamVjdC5qc29uJywgZmlsZVBhdHRlcm46IC9ecHJvamVjdFxcLmpzb24kL2kgfSxcblx0XHR7IHRhZzogJ21ha2VmaWxlJywgZmlsZVBhdHRlcm46IC9ebWFrZWZpbGUkL2kgfSxcblx0XHR7IHRhZzogJ3NsbicsIGZpbGVQYXR0ZXJuOiAvXi4rXFwuc2xuJC9pIH0sXG5cdFx0eyB0YWc6ICdjc3Byb2onLCBmaWxlUGF0dGVybjogL14uK1xcLmNzcHJvaiQvaSB9LFxuXHRcdHsgdGFnOiAnY21ha2UnLCBmaWxlUGF0dGVybjogL14uK1xcLmNtYWtlJC9pIH0sXG5cdFx0eyB0YWc6ICdnaXRodWItYWN0aW9ucycsIGZpbGVQYXR0ZXJuOiAvXi4rXFwueWE/bWwkL2ksIHJlbGF0aXZlUGF0aFBhdHRlcm46IC9eXFwuZ2l0aHViKD86XFwvfFxcXFwpd29ya2Zsb3dzJC9pIH0sXG5cdFx0eyB0YWc6ICdkZXZjb250YWluZXIuanNvbicsIGZpbGVQYXR0ZXJuOiAvXmRldmNvbnRhaW5lclxcLmpzb24kL2kgfSxcblx0XHR7IHRhZzogJ2RvY2tlcmZpbGUnLCBmaWxlUGF0dGVybjogL14oZG9ja2VyZmlsZXxkb2NrZXJcXC1jb21wb3NlXFwueWE/bWwpJC9pIH0sXG5cdFx0eyB0YWc6ICdjdXJzb3JydWxlcycsIGZpbGVQYXR0ZXJuOiAvXlxcLmN1cnNvcnJ1bGVzJC9pIH0sXG5cdFx0eyB0YWc6ICdjdXJzb3JydWxlcy1kaXInLCBmaWxlUGF0dGVybjogL1xcLm1kYyQvaSwgcmVsYXRpdmVQYXRoUGF0dGVybjogL15cXC5jdXJzb3JbXFwvXFxcXF1ydWxlcyQvaSB9LFxuXHRcdHsgdGFnOiAnZ2l0aHViLWluc3RydWN0aW9ucy1kaXInLCBmaWxlUGF0dGVybjogL1xcLmluc3RydWN0aW9uc1xcLm1kJC9pLCByZWxhdGl2ZVBhdGhQYXR0ZXJuOiAvXlxcLmdpdGh1YltcXC9cXFxcXWluc3RydWN0aW9ucyQvaSB9LFxuXHRcdHsgdGFnOiAnZ2l0aHViLXByb21wdHMtZGlyJywgZmlsZVBhdHRlcm46IC9cXC5wcm9tcHRcXC5tZCQvaSwgcmVsYXRpdmVQYXRoUGF0dGVybjogL15cXC5naXRodWJbXFwvXFxcXF1wcm9tcHRzJC9pIH0sXG5cdFx0eyB0YWc6ICdjbGluZXJ1bGVzJywgZmlsZVBhdHRlcm46IC9eXFwuY2xpbmVydWxlcyQvaSB9LFxuXHRcdHsgdGFnOiAnY2xpbmVydWxlcy1kaXInLCBmaWxlUGF0dGVybjogL1xcLm1kJC9pLCByZWxhdGl2ZVBhdGhQYXR0ZXJuOiAvXlxcLmNsaW5lcnVsZXMkL2kgfSxcblx0XHR7IHRhZzogJ2FnZW50Lm1kJywgZmlsZVBhdHRlcm46IC9eYWdlbnRcXC5tZCQvaSB9LFxuXHRcdHsgdGFnOiAnYWdlbnRzLm1kJywgZmlsZVBhdHRlcm46IC9eYWdlbnRzXFwubWQkL2kgfSxcblx0XHR7IHRhZzogJ2NsYXVkZS5tZCcsIGZpbGVQYXR0ZXJuOiAvXmNsYXVkZVxcLm1kJC9pIH0sXG5cdFx0eyB0YWc6ICdjbGF1ZGUtc2V0dGluZ3MnLCBmaWxlUGF0dGVybjogL15zZXR0aW5nc1xcLmpzb24kL2ksIHJlbGF0aXZlUGF0aFBhdHRlcm46IC9eXFwuY2xhdWRlJC9pIH0sXG5cdFx0eyB0YWc6ICdjbGF1ZGUtc2V0dGluZ3MtbG9jYWwnLCBmaWxlUGF0dGVybjogL15zZXR0aW5nc1xcLmxvY2FsXFwuanNvbiQvaSwgcmVsYXRpdmVQYXRoUGF0dGVybjogL15cXC5jbGF1ZGUkL2kgfSxcblx0XHR7IHRhZzogJ2NsYXVkZS1tY3AnLCBmaWxlUGF0dGVybjogL15tY3BcXC5qc29uJC9pLCByZWxhdGl2ZVBhdGhQYXR0ZXJuOiAvXlxcLmNsYXVkZSQvaSB9LFxuXHRcdHsgdGFnOiAnY2xhdWRlLWNvbW1hbmRzLWRpcicsIGZpbGVQYXR0ZXJuOiAvXFwubWQkL2ksIHJlbGF0aXZlUGF0aFBhdHRlcm46IC9eXFwuY2xhdWRlW1xcL1xcXFxdY29tbWFuZHMkL2kgfSxcblx0XHR7IHRhZzogJ2NsYXVkZS1za2lsbHMtZGlyJywgZmlsZVBhdHRlcm46IC9eU0tJTExcXC5tZCQvaSwgcmVsYXRpdmVQYXRoUGF0dGVybjogL15cXC5jbGF1ZGVbXFwvXFxcXF1za2lsbHNbXFwvXFxcXF0vaSB9LFxuXHRcdHsgdGFnOiAnY2xhdWRlLXJ1bGVzLWRpcicsIGZpbGVQYXR0ZXJuOiAvXFwubWQkL2ksIHJlbGF0aXZlUGF0aFBhdHRlcm46IC9eXFwuY2xhdWRlW1xcL1xcXFxdcnVsZXMkL2kgfSxcblx0XHR7IHRhZzogJ2dlbWluaS5tZCcsIGZpbGVQYXR0ZXJuOiAvXmdlbWluaVxcLm1kJC9pIH0sXG5cdFx0eyB0YWc6ICdjb3BpbG90LWluc3RydWN0aW9ucy5tZCcsIGZpbGVQYXR0ZXJuOiAvXmNvcGlsb3RcXC1pbnN0cnVjdGlvbnNcXC5tZCQvaSwgcmVsYXRpdmVQYXRoUGF0dGVybjogL15cXC5naXRodWIkL2kgfSxcblx0XTtcblxuXHRjb25zdCBmaWxlVHlwZXMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRjb25zdCBjb25maWdGaWxlcyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cblx0Y29uc3QgTUFYX0ZJTEVTID0gb3B0aW9ucz8udW5ib3VuZGVkID8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZIDogMjAwMDA7XG5cblx0ZnVuY3Rpb24gY29sbGVjdChyb290OiBzdHJpbmcsIGRpcjogc3RyaW5nLCBmaWx0ZXI6IHN0cmluZ1tdLCB0b2tlbjogeyBjb3VudDogbnVtYmVyOyBtYXhSZWFjaGVkOiBib29sZWFuOyByZWFkZGlyQ291bnQ6IG51bWJlciB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVsYXRpdmVQYXRoID0gZGlyLnN1YnN0cmluZyhyb290Lmxlbmd0aCArIDEpO1xuXG5cdFx0cmV0dXJuIFByb21pc2VzLndpdGhBc3luY0JvZHkoYXN5bmMgcmVzb2x2ZSA9PiB7XG5cdFx0XHQvLyBCYWlsIGJlZm9yZSB0b3VjaGluZyB0aGUgZmlsZXN5c3RlbSB3aGVuIHRoZSBjYXAgaGFzIGFscmVhZHkgYmVlbiBoaXQgc29cblx0XHRcdC8vIHNpYmxpbmctZGlyZWN0b3J5IHJlY3Vyc2lvbiBkb2Vzbid0IHBheSByZWFkZGlyIElPIGFmdGVyIHRoZSBzY2FuIGlzXG5cdFx0XHQvLyBlZmZlY3RpdmVseSBkb25lLlxuXHRcdFx0aWYgKHRva2VuLmNvdW50ID49IE1BWF9GSUxFUykge1xuXHRcdFx0XHR0b2tlbi5tYXhSZWFjaGVkID0gdHJ1ZTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCBmaWxlczogSURpcmVudFtdO1xuXG5cdFx0XHR0b2tlbi5yZWFkZGlyQ291bnQrKztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZpbGVzID0gYXdhaXQgcGZzLnJlYWRkaXIoZGlyLCB7IHdpdGhGaWxlVHlwZXM6IHRydWUgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBJZ25vcmUgZm9sZGVycyB0aGF0IGNhbid0IGJlIHJlYWRcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0b2tlbi5jb3VudCA+PSBNQVhfRklMRVMpIHtcblx0XHRcdFx0dG9rZW4ubWF4UmVhY2hlZCA9IHRydWU7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcGVuZGluZyA9IGZpbGVzLmxlbmd0aDtcblx0XHRcdGlmIChwZW5kaW5nID09PSAwKSB7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcblx0XHRcdFx0aWYgKGZpbGUuaXNEaXJlY3RvcnkoKSkge1xuXHRcdFx0XHRcdGlmICghZmlsdGVyLmluY2x1ZGVzKGZpbGUubmFtZSkpIHtcblx0XHRcdFx0XHRcdGF3YWl0IGNvbGxlY3Qocm9vdCwgam9pbihkaXIsIGZpbGUubmFtZSksIGZpbHRlciwgdG9rZW4pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICgtLXBlbmRpbmcgPT09IDApIHtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKHRva2VuLmNvdW50ID49IE1BWF9GSUxFUykge1xuXHRcdFx0XHRcdFx0dG9rZW4ubWF4UmVhY2hlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRva2VuLmNvdW50Kys7XG5cblx0XHRcdFx0XHRjb25zdCBpbmRleCA9IGZpbGUubmFtZS5sYXN0SW5kZXhPZignLicpO1xuXHRcdFx0XHRcdGxldCBmaWxlVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0XHRmaWxlVHlwZSA9IGZpbGUubmFtZS5zdWJzdHJpbmcoaW5kZXggKyAxKSB8fCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIFRyYWNrIGZpbGVzIHdpdGggbm8gdXNhYmxlIGV4dGVuc2lvbiB1bmRlciBhIHNlbnRpbmVsIGtleSBzbyB0aGV5XG5cdFx0XHRcdFx0Ly8gY2FuIGJlIGZvbGRlZCBpbnRvIHRoZSBcIm90aGVyXCIgYnVja2V0IGF0IHJlbmRlciB0aW1lLiBXaXRob3V0IHRoaXMsXG5cdFx0XHRcdFx0Ly8gZXh0ZW5zaW9uLWxlc3MgZmlsZXMgKE1ha2VmaWxlLCBMSUNFTlNFLCBzY3JpcHRzIGluIGJpbi8sIGV0Yy4pIHdvdWxkXG5cdFx0XHRcdFx0Ly8gYmUgc2lsZW50bHkgZHJvcHBlZCBmcm9tIHRoZSBmaWxlLXR5cGUgY291bnRzIGFuZCB0aGUgdG90YWxzIHdvdWxkXG5cdFx0XHRcdFx0Ly8gbm90IHJlY29uY2lsZSB3aXRoIHRoZSBvdmVyYWxsIGZpbGUgY291bnQuXG5cdFx0XHRcdFx0ZmlsZVR5cGVzLnNldChmaWxlVHlwZSA/PyBOT19FWFRfS0VZLCAoZmlsZVR5cGVzLmdldChmaWxlVHlwZSA/PyBOT19FWFRfS0VZKSA/PyAwKSArIDEpO1xuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjb25maWdGaWxlIG9mIGNvbmZpZ0ZpbGVQYXR0ZXJucykge1xuXHRcdFx0XHRcdFx0aWYgKGNvbmZpZ0ZpbGUucmVsYXRpdmVQYXRoUGF0dGVybj8udGVzdChyZWxhdGl2ZVBhdGgpICE9PSBmYWxzZSAmJiBjb25maWdGaWxlLmZpbGVQYXR0ZXJuLnRlc3QoZmlsZS5uYW1lKSkge1xuXHRcdFx0XHRcdFx0XHRjb25maWdGaWxlcy5zZXQoY29uZmlnRmlsZS50YWcsIChjb25maWdGaWxlcy5nZXQoY29uZmlnRmlsZS50YWcpID8/IDApICsgMSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKC0tcGVuZGluZyA9PT0gMCkge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Y29uc3Qgc3RhdHNQcm9taXNlID0gUHJvbWlzZXMud2l0aEFzeW5jQm9keTxXb3Jrc3BhY2VTdGF0cz4oYXN5bmMgKHJlc29sdmUpID0+IHtcblx0XHRjb25zdCB0b2tlbjogeyBjb3VudDogbnVtYmVyOyBtYXhSZWFjaGVkOiBib29sZWFuOyByZWFkZGlyQ291bnQ6IG51bWJlciB9ID0geyBjb3VudDogMCwgbWF4UmVhY2hlZDogZmFsc2UsIHJlYWRkaXJDb3VudDogMCB9O1xuXHRcdGNvbnN0IHN3ID0gbmV3IFN0b3BXYXRjaCh0cnVlKTtcblx0XHRhd2FpdCBjb2xsZWN0KGZvbGRlciwgZm9sZGVyLCBmaWx0ZXIsIHRva2VuKTtcblx0XHRjb25zdCBsYXVuY2hDb25maWdzID0gYXdhaXQgY29sbGVjdExhdW5jaENvbmZpZ3MoZm9sZGVyKTtcblx0XHRyZXNvbHZlKHtcblx0XHRcdGNvbmZpZ0ZpbGVzOiBhc1NvcnRlZEl0ZW1zKGNvbmZpZ0ZpbGVzKSxcblx0XHRcdGZpbGVUeXBlczogYXNTb3J0ZWRJdGVtcyhmaWxlVHlwZXMpLFxuXHRcdFx0ZmlsZUNvdW50OiB0b2tlbi5jb3VudCxcblx0XHRcdG1heEZpbGVzUmVhY2hlZDogdG9rZW4ubWF4UmVhY2hlZCxcblx0XHRcdGxhdW5jaENvbmZpZ0ZpbGVzOiBsYXVuY2hDb25maWdzLFxuXHRcdFx0dG90YWxTY2FuVGltZTogc3cuZWxhcHNlZCgpLFxuXHRcdFx0dG90YWxSZWFkZGlyQ291bnQ6IHRva2VuLnJlYWRkaXJDb3VudFxuXHRcdH0pO1xuXHR9KTtcblxuXHR3b3Jrc3BhY2VTdGF0c0NhY2hlLnNldChjYWNoZUtleSwgc3RhdHNQcm9taXNlKTtcblx0cmV0dXJuIHN0YXRzUHJvbWlzZTtcbn1cblxuZnVuY3Rpb24gYXNTb3J0ZWRJdGVtcyhpdGVtczogTWFwPHN0cmluZywgbnVtYmVyPik6IFdvcmtzcGFjZVN0YXRJdGVtW10ge1xuXHRyZXR1cm4gQXJyYXkuZnJvbShpdGVtcy5lbnRyaWVzKCksIChbbmFtZSwgY291bnRdKSA9PiAoeyBuYW1lOiBuYW1lLCBjb3VudDogY291bnQgfSkpXG5cdFx0LnNvcnQoKGEsIGIpID0+IGIuY291bnQgLSBhLmNvdW50KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE1hY2hpbmVJbmZvKCk6IElNYWNoaW5lSW5mbyB7XG5cblx0Y29uc3QgbWFjaGluZUluZm86IElNYWNoaW5lSW5mbyA9IHtcblx0XHRvczogYCR7b3NMaWIudHlwZSgpfSAke29zTGliLmFyY2goKX0gJHtvc0xpYi5yZWxlYXNlKCl9YCxcblx0XHRtZW1vcnk6IGAkeyhvc0xpYi50b3RhbG1lbSgpIC8gQnl0ZVNpemUuR0IpLnRvRml4ZWQoMil9R0IgKCR7KG9zTGliLmZyZWVtZW0oKSAvIEJ5dGVTaXplLkdCKS50b0ZpeGVkKDIpfUdCIGZyZWUpYCxcblx0XHR2bUhpbnQ6IGAke01hdGgucm91bmQoKHZpcnR1YWxNYWNoaW5lSGludC52YWx1ZSgpICogMTAwKSl9JWAsXG5cdH07XG5cblx0Y29uc3QgY3B1cyA9IG9zTGliLmNwdXMoKTtcblx0aWYgKGNwdXMgJiYgY3B1cy5sZW5ndGggPiAwKSB7XG5cdFx0bWFjaGluZUluZm8uY3B1cyA9IGAke2NwdXNbMF0ubW9kZWx9ICgke2NwdXMubGVuZ3RofSB4ICR7Y3B1c1swXS5zcGVlZH0pYDtcblx0fVxuXG5cdHJldHVybiBtYWNoaW5lSW5mbztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbGxlY3RMYXVuY2hDb25maWdzKGZvbGRlcjogc3RyaW5nKTogUHJvbWlzZTxXb3Jrc3BhY2VTdGF0SXRlbVtdPiB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgbGF1bmNoQ29uZmlncyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0Y29uc3QgbGF1bmNoQ29uZmlnID0gam9pbihmb2xkZXIsICcudnNjb2RlJywgJ2xhdW5jaC5qc29uJyk7XG5cblx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IGZzLnByb21pc2VzLnJlYWRGaWxlKGxhdW5jaENvbmZpZyk7XG5cblx0XHRjb25zdCBlcnJvcnM6IFBhcnNlRXJyb3JbXSA9IFtdO1xuXHRcdGNvbnN0IGpzb24gPSBwYXJzZShjb250ZW50cy50b1N0cmluZygpLCBlcnJvcnMpO1xuXHRcdGlmIChlcnJvcnMubGVuZ3RoKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhgVW5hYmxlIHRvIHBhcnNlICR7bGF1bmNoQ29uZmlnfWApO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGlmIChnZXROb2RlVHlwZShqc29uKSA9PT0gJ29iamVjdCcgJiYganNvblsnY29uZmlndXJhdGlvbnMnXSkge1xuXHRcdFx0Zm9yIChjb25zdCBlYWNoIG9mIGpzb25bJ2NvbmZpZ3VyYXRpb25zJ10pIHtcblx0XHRcdFx0Y29uc3QgdHlwZSA9IGVhY2hbJ3R5cGUnXTtcblx0XHRcdFx0aWYgKHR5cGUpIHtcblx0XHRcdFx0XHRpZiAobGF1bmNoQ29uZmlncy5oYXModHlwZSkpIHtcblx0XHRcdFx0XHRcdGxhdW5jaENvbmZpZ3Muc2V0KHR5cGUsIGxhdW5jaENvbmZpZ3MuZ2V0KHR5cGUpISArIDEpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRsYXVuY2hDb25maWdzLnNldCh0eXBlLCAxKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gYXNTb3J0ZWRJdGVtcyhsYXVuY2hDb25maWdzKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERpYWdub3N0aWNzU2VydmljZSBpbXBsZW1lbnRzIElEaWFnbm9zdGljc1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlXG5cdCkgeyB9XG5cblx0cHJpdmF0ZSBmb3JtYXRNYWNoaW5lSW5mbyhpbmZvOiBJTWFjaGluZUluZm8pOiBzdHJpbmcge1xuXHRcdGNvbnN0IG91dHB1dDogc3RyaW5nW10gPSBbXTtcblx0XHRvdXRwdXQucHVzaChgT1MgVmVyc2lvbjogICAgICAgJHtpbmZvLm9zfWApO1xuXHRcdG91dHB1dC5wdXNoKGBDUFVzOiAgICAgICAgICAgICAke2luZm8uY3B1c31gKTtcblx0XHRvdXRwdXQucHVzaChgTWVtb3J5IChTeXN0ZW0pOiAgJHtpbmZvLm1lbW9yeX1gKTtcblx0XHRvdXRwdXQucHVzaChgVk06ICAgICAgICAgICAgICAgJHtpbmZvLnZtSGludH1gKTtcblxuXHRcdHJldHVybiBvdXRwdXQuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIGZvcm1hdEVudmlyb25tZW50KGluZm86IElNYWluUHJvY2Vzc0RpYWdub3N0aWNzKTogc3RyaW5nIHtcblx0XHRjb25zdCBvdXRwdXQ6IHN0cmluZ1tdID0gW107XG5cdFx0b3V0cHV0LnB1c2goYFZlcnNpb246ICAgICAgICAgICR7dGhpcy5wcm9kdWN0U2VydmljZS5uYW1lU2hvcnR9ICR7dGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9ufSAoJHt0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbW1pdCB8fCAnQ29tbWl0IHVua25vd24nfSwgJHt0aGlzLnByb2R1Y3RTZXJ2aWNlLmRhdGUgfHwgJ0RhdGUgdW5rbm93bid9KWApO1xuXHRcdG91dHB1dC5wdXNoKGBPUyBWZXJzaW9uOiAgICAgICAke29zTGliLnR5cGUoKX0gJHtvc0xpYi5hcmNoKCl9ICR7b3NMaWIucmVsZWFzZSgpfWApO1xuXHRcdGNvbnN0IGNwdXMgPSBvc0xpYi5jcHVzKCk7XG5cdFx0aWYgKGNwdXMgJiYgY3B1cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRvdXRwdXQucHVzaChgQ1BVczogICAgICAgICAgICAgJHtjcHVzWzBdLm1vZGVsfSAoJHtjcHVzLmxlbmd0aH0geCAke2NwdXNbMF0uc3BlZWR9KWApO1xuXHRcdH1cblx0XHRvdXRwdXQucHVzaChgTWVtb3J5IChTeXN0ZW0pOiAgJHsob3NMaWIudG90YWxtZW0oKSAvIEJ5dGVTaXplLkdCKS50b0ZpeGVkKDIpfUdCICgkeyhvc0xpYi5mcmVlbWVtKCkgLyBCeXRlU2l6ZS5HQikudG9GaXhlZCgyKX1HQiBmcmVlKWApO1xuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRvdXRwdXQucHVzaChgTG9hZCAoYXZnKTogICAgICAgJHtvc0xpYi5sb2FkYXZnKCkubWFwKGwgPT4gTWF0aC5yb3VuZChsKSkuam9pbignLCAnKX1gKTsgLy8gb25seSBwcm92aWRlZCBvbiBMaW51eC9tYWNPU1xuXHRcdH1cblx0XHRvdXRwdXQucHVzaChgVk06ICAgICAgICAgICAgICAgJHtNYXRoLnJvdW5kKCh2aXJ0dWFsTWFjaGluZUhpbnQudmFsdWUoKSAqIDEwMCkpfSVgKTtcblx0XHRvdXRwdXQucHVzaChgU2NyZWVuIFJlYWRlcjogICAgJHtpbmZvLnNjcmVlblJlYWRlciA/ICd5ZXMnIDogJ25vJ31gKTtcblx0XHRvdXRwdXQucHVzaChgUHJvY2VzcyBBcmd2OiAgICAgJHtpbmZvLm1haW5Bcmd1bWVudHMuam9pbignICcpfWApO1xuXHRcdG91dHB1dC5wdXNoKGBHUFUgU3RhdHVzOiAgICAgICAke3RoaXMuZXhwYW5kR1BVRmVhdHVyZXMoaW5mby5ncHVGZWF0dXJlU3RhdHVzKX1gKTtcblx0XHRpZiAoaW5mby5ncHVMb2dNZXNzYWdlcyAmJiBpbmZvLmdwdUxvZ01lc3NhZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdG91dHB1dC5wdXNoKGBHUFUgTG9nIE1lc3NhZ2VzOmApO1xuXHRcdFx0aW5mby5ncHVMb2dNZXNzYWdlcy5mb3JFYWNoKG1zZyA9PiB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKGAke21zZy5oZWFkZXJ9OiAke21zZy5tZXNzYWdlfWApO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG91dHB1dC5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRQZXJmb3JtYW5jZUluZm8oaW5mbzogSU1haW5Qcm9jZXNzRGlhZ25vc3RpY3MsIHJlbW90ZURhdGE6IChJUmVtb3RlRGlhZ25vc3RpY0luZm8gfCBJUmVtb3RlRGlhZ25vc3RpY0Vycm9yKVtdLCBvcHRpb25zPzogeyBza2lwQ2FjaGU/OiBib29sZWFuOyB1bmJvdW5kZWQ/OiBib29sZWFuIH0pOiBQcm9taXNlPFBlcmZvcm1hbmNlSW5mbz4ge1xuXHRcdHJldHVybiBQcm9taXNlLmFsbChbbGlzdFByb2Nlc3NlcyhpbmZvLm1haW5QSUQpLCB0aGlzLmZvcm1hdFdvcmtzcGFjZU1ldGFkYXRhKGluZm8sIG9wdGlvbnMpXSkudGhlbihhc3luYyByZXN1bHQgPT4ge1xuXHRcdFx0bGV0IFtyb290UHJvY2Vzcywgd29ya3NwYWNlSW5mb10gPSByZXN1bHQ7XG5cdFx0XHRsZXQgcHJvY2Vzc0luZm8gPSB0aGlzLmZvcm1hdFByb2Nlc3NMaXN0KGluZm8sIHJvb3RQcm9jZXNzKTtcblxuXHRcdFx0cmVtb3RlRGF0YS5mb3JFYWNoKGRpYWdub3N0aWNzID0+IHtcblx0XHRcdFx0aWYgKGlzUmVtb3RlRGlhZ25vc3RpY0Vycm9yKGRpYWdub3N0aWNzKSkge1xuXHRcdFx0XHRcdHByb2Nlc3NJbmZvICs9IGBcXG4ke2RpYWdub3N0aWNzLmVycm9yTWVzc2FnZX1gO1xuXHRcdFx0XHRcdHdvcmtzcGFjZUluZm8gKz0gYFxcbiR7ZGlhZ25vc3RpY3MuZXJyb3JNZXNzYWdlfWA7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cHJvY2Vzc0luZm8gKz0gYFxcblxcblJlbW90ZTogJHtkaWFnbm9zdGljcy5ob3N0TmFtZX1gO1xuXHRcdFx0XHRcdGlmIChkaWFnbm9zdGljcy5wcm9jZXNzZXMpIHtcblx0XHRcdFx0XHRcdHByb2Nlc3NJbmZvICs9IGBcXG4ke3RoaXMuZm9ybWF0UHJvY2Vzc0xpc3QoaW5mbywgZGlhZ25vc3RpY3MucHJvY2Vzc2VzKX1gO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChkaWFnbm9zdGljcy53b3Jrc3BhY2VNZXRhZGF0YSkge1xuXHRcdFx0XHRcdFx0d29ya3NwYWNlSW5mbyArPSBgXFxufCAgUmVtb3RlOiAke2RpYWdub3N0aWNzLmhvc3ROYW1lfWA7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiBPYmplY3Qua2V5cyhkaWFnbm9zdGljcy53b3Jrc3BhY2VNZXRhZGF0YSkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBkaWFnbm9zdGljcy53b3Jrc3BhY2VNZXRhZGF0YVtmb2xkZXJdO1xuXG5cdFx0XHRcdFx0XHRcdGxldCBjb3VudE1lc3NhZ2UgPSBgJHttZXRhZGF0YS5maWxlQ291bnR9IGZpbGVzYDtcblx0XHRcdFx0XHRcdFx0aWYgKG1ldGFkYXRhLm1heEZpbGVzUmVhY2hlZCkge1xuXHRcdFx0XHRcdFx0XHRcdGNvdW50TWVzc2FnZSA9IGBtb3JlIHRoYW4gJHtjb3VudE1lc3NhZ2V9YDtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdHdvcmtzcGFjZUluZm8gKz0gYHwgICAgRm9sZGVyICgke2ZvbGRlcn0pOiAke2NvdW50TWVzc2FnZX1gO1xuXHRcdFx0XHRcdFx0XHR3b3Jrc3BhY2VJbmZvICs9IHRoaXMuZm9ybWF0V29ya3NwYWNlU3RhdHMobWV0YWRhdGEpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHByb2Nlc3NJbmZvLFxuXHRcdFx0XHR3b3Jrc3BhY2VJbmZvXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldFN5c3RlbUluZm8oaW5mbzogSU1haW5Qcm9jZXNzRGlhZ25vc3RpY3MsIHJlbW90ZURhdGE6IChJUmVtb3RlRGlhZ25vc3RpY0luZm8gfCBJUmVtb3RlRGlhZ25vc3RpY0Vycm9yKVtdKTogUHJvbWlzZTxTeXN0ZW1JbmZvPiB7XG5cdFx0Y29uc3QgeyBtZW1vcnksIHZtSGludCwgb3MsIGNwdXMgfSA9IGdldE1hY2hpbmVJbmZvKCk7XG5cdFx0Y29uc3Qgc3lzdGVtSW5mbzogU3lzdGVtSW5mbyA9IHtcblx0XHRcdG9zLFxuXHRcdFx0bWVtb3J5LFxuXHRcdFx0Y3B1cyxcblx0XHRcdHZtSGludCxcblx0XHRcdHByb2Nlc3NBcmdzOiBgJHtpbmZvLm1haW5Bcmd1bWVudHMuam9pbignICcpfWAsXG5cdFx0XHRncHVTdGF0dXM6IGluZm8uZ3B1RmVhdHVyZVN0YXR1cyxcblx0XHRcdHNjcmVlblJlYWRlcjogYCR7aW5mby5zY3JlZW5SZWFkZXIgPyAneWVzJyA6ICdubyd9YCxcblx0XHRcdHJlbW90ZURhdGFcblx0XHR9O1xuXG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdHN5c3RlbUluZm8ubG9hZCA9IGAke29zTGliLmxvYWRhdmcoKS5tYXAobCA9PiBNYXRoLnJvdW5kKGwpKS5qb2luKCcsICcpfWA7XG5cdFx0fVxuXG5cdFx0aWYgKGlzTGludXgpIHtcblx0XHRcdHN5c3RlbUluZm8ubGludXhFbnYgPSB7XG5cdFx0XHRcdGRlc2t0b3BTZXNzaW9uOiBwcm9jZXNzLmVudlsnREVTS1RPUF9TRVNTSU9OJ10sXG5cdFx0XHRcdHhkZ1Nlc3Npb25EZXNrdG9wOiBwcm9jZXNzLmVudlsnWERHX1NFU1NJT05fREVTS1RPUCddLFxuXHRcdFx0XHR4ZGdDdXJyZW50RGVza3RvcDogcHJvY2Vzcy5lbnZbJ1hER19DVVJSRU5UX0RFU0tUT1AnXSxcblx0XHRcdFx0eGRnU2Vzc2lvblR5cGU6IHByb2Nlc3MuZW52WydYREdfU0VTU0lPTl9UWVBFJ11cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShzeXN0ZW1JbmZvKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXREaWFnbm9zdGljcyhpbmZvOiBJTWFpblByb2Nlc3NEaWFnbm9zdGljcywgcmVtb3RlRGlhZ25vc3RpY3M6IChJUmVtb3RlRGlhZ25vc3RpY0luZm8gfCBJUmVtb3RlRGlhZ25vc3RpY0Vycm9yKVtdKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBvdXRwdXQ6IHN0cmluZ1tdID0gW107XG5cdFx0cmV0dXJuIGxpc3RQcm9jZXNzZXMoaW5mby5tYWluUElEKS50aGVuKGFzeW5jIHJvb3RQcm9jZXNzID0+IHtcblxuXHRcdFx0Ly8gRW52aXJvbm1lbnQgSW5mb1xuXHRcdFx0b3V0cHV0LnB1c2goJycpO1xuXHRcdFx0b3V0cHV0LnB1c2godGhpcy5mb3JtYXRFbnZpcm9ubWVudChpbmZvKSk7XG5cblx0XHRcdC8vIFByb2Nlc3MgTGlzdFxuXHRcdFx0b3V0cHV0LnB1c2goJycpO1xuXHRcdFx0b3V0cHV0LnB1c2godGhpcy5mb3JtYXRQcm9jZXNzTGlzdChpbmZvLCByb290UHJvY2VzcykpO1xuXG5cdFx0XHQvLyBXb3Jrc3BhY2UgU3RhdHNcblx0XHRcdGlmIChpbmZvLndpbmRvd3Muc29tZSh3aW5kb3cgPT4gd2luZG93LmZvbGRlclVSSXMgJiYgd2luZG93LmZvbGRlclVSSXMubGVuZ3RoID4gMCAmJiAhd2luZG93LnJlbW90ZUF1dGhvcml0eSkpIHtcblx0XHRcdFx0b3V0cHV0LnB1c2goJycpO1xuXHRcdFx0XHRvdXRwdXQucHVzaCgnV29ya3NwYWNlIFN0YXRzOiAnKTtcblx0XHRcdFx0b3V0cHV0LnB1c2goYXdhaXQgdGhpcy5mb3JtYXRXb3Jrc3BhY2VNZXRhZGF0YShpbmZvKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJlbW90ZURpYWdub3N0aWNzLmZvckVhY2goZGlhZ25vc3RpY3MgPT4ge1xuXHRcdFx0XHRpZiAoaXNSZW1vdGVEaWFnbm9zdGljRXJyb3IoZGlhZ25vc3RpY3MpKSB7XG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goYFxcbiR7ZGlhZ25vc3RpY3MuZXJyb3JNZXNzYWdlfWApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG91dHB1dC5wdXNoKCdcXG5cXG4nKTtcblx0XHRcdFx0XHRvdXRwdXQucHVzaChgUmVtb3RlOiAgICAgICAgICAgJHtkaWFnbm9zdGljcy5ob3N0TmFtZX1gKTtcblx0XHRcdFx0XHRvdXRwdXQucHVzaCh0aGlzLmZvcm1hdE1hY2hpbmVJbmZvKGRpYWdub3N0aWNzLm1hY2hpbmVJbmZvKSk7XG5cblx0XHRcdFx0XHRpZiAoZGlhZ25vc3RpY3MucHJvY2Vzc2VzKSB7XG5cdFx0XHRcdFx0XHRvdXRwdXQucHVzaCh0aGlzLmZvcm1hdFByb2Nlc3NMaXN0KGluZm8sIGRpYWdub3N0aWNzLnByb2Nlc3NlcykpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChkaWFnbm9zdGljcy53b3Jrc3BhY2VNZXRhZGF0YSkge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgT2JqZWN0LmtleXMoZGlhZ25vc3RpY3Mud29ya3NwYWNlTWV0YWRhdGEpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG1ldGFkYXRhID0gZGlhZ25vc3RpY3Mud29ya3NwYWNlTWV0YWRhdGFbZm9sZGVyXTtcblxuXHRcdFx0XHRcdFx0XHRsZXQgY291bnRNZXNzYWdlID0gYCR7bWV0YWRhdGEuZmlsZUNvdW50fSBmaWxlc2A7XG5cdFx0XHRcdFx0XHRcdGlmIChtZXRhZGF0YS5tYXhGaWxlc1JlYWNoZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRjb3VudE1lc3NhZ2UgPSBgbW9yZSB0aGFuICR7Y291bnRNZXNzYWdlfWA7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRvdXRwdXQucHVzaChgRm9sZGVyICgke2ZvbGRlcn0pOiAke2NvdW50TWVzc2FnZX1gKTtcblx0XHRcdFx0XHRcdFx0b3V0cHV0LnB1c2godGhpcy5mb3JtYXRXb3Jrc3BhY2VTdGF0cyhtZXRhZGF0YSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdG91dHB1dC5wdXNoKCcnKTtcblx0XHRcdG91dHB1dC5wdXNoKCcnKTtcblxuXHRcdFx0cmV0dXJuIG91dHB1dC5qb2luKCdcXG4nKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZm9ybWF0V29ya3NwYWNlU3RhdHMod29ya3NwYWNlU3RhdHM6IFdvcmtzcGFjZVN0YXRzKTogc3RyaW5nIHtcblx0XHRjb25zdCBvdXRwdXQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgbGluZUxlbmd0aCA9IDYwO1xuXHRcdGxldCBjb2wgPSAwO1xuXG5cdFx0Y29uc3QgYXBwZW5kQW5kV3JhcCA9IChuYW1lOiBzdHJpbmcsIGNvdW50OiBudW1iZXIpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW0gPSBgICR7bmFtZX0oJHtjb3VudH0pYDtcblxuXHRcdFx0aWYgKGNvbCArIGl0ZW0ubGVuZ3RoID4gbGluZUxlbmd0aCkge1xuXHRcdFx0XHRvdXRwdXQucHVzaChsaW5lKTtcblx0XHRcdFx0bGluZSA9ICd8ICAgICAgICAgICAgICAgICAnO1xuXHRcdFx0XHRjb2wgPSBsaW5lLmxlbmd0aDtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRjb2wgKz0gaXRlbS5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0XHRsaW5lICs9IGl0ZW07XG5cdFx0fTtcblxuXHRcdC8vIEZpbGUgVHlwZXNcblx0XHQvLyBTa2lwIHRoZSBuby1leHRlbnNpb24gc2VudGluZWwgZnJvbSB0aGUgbmFtZWQgbGlzdCBhbmQgZm9sZCBpdHMgY291bnQgaW50b1xuXHRcdC8vIHRoZSBcIm90aGVyXCIgYnVja2V0IHNvIHRvdGFscyByZWNvbmNpbGUgd2l0aCBmaWxlQ291bnQuXG5cdFx0bGV0IGxpbmUgPSAnfCAgICAgIEZpbGUgdHlwZXM6Jztcblx0XHRjb25zdCBtYXhTaG93biA9IDEwO1xuXHRcdGNvbnN0IG5hbWVkVHlwZXMgPSB3b3Jrc3BhY2VTdGF0cy5maWxlVHlwZXMuZmlsdGVyKHQgPT4gdC5uYW1lICE9PSBOT19FWFRfS0VZKTtcblx0XHRjb25zdCBub0V4dENvdW50ID0gd29ya3NwYWNlU3RhdHMuZmlsZVR5cGVzXG5cdFx0XHQuZmlsdGVyKHQgPT4gdC5uYW1lID09PSBOT19FWFRfS0VZKVxuXHRcdFx0LnJlZHVjZSgoc3VtLCB0KSA9PiBzdW0gKyB0LmNvdW50LCAwKTtcblx0XHRjb25zdCBtYXggPSBNYXRoLm1pbihuYW1lZFR5cGVzLmxlbmd0aCwgbWF4U2hvd24pO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbWF4OyBpKyspIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSBuYW1lZFR5cGVzW2ldO1xuXHRcdFx0YXBwZW5kQW5kV3JhcChpdGVtLm5hbWUsIGl0ZW0uY291bnQpO1xuXHRcdH1cblx0XHRsZXQgb3RoZXJDb3VudCA9IG5vRXh0Q291bnQ7XG5cdFx0Zm9yIChsZXQgaSA9IG1heDsgaSA8IG5hbWVkVHlwZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdG90aGVyQ291bnQgKz0gbmFtZWRUeXBlc1tpXS5jb3VudDtcblx0XHR9XG5cdFx0aWYgKG90aGVyQ291bnQgPiAwKSB7XG5cdFx0XHRhcHBlbmRBbmRXcmFwKCdvdGhlcicsIG90aGVyQ291bnQpO1xuXHRcdH1cblx0XHRvdXRwdXQucHVzaChsaW5lKTtcblxuXHRcdC8vIENvbmYgRmlsZXNcblx0XHRpZiAod29ya3NwYWNlU3RhdHMuY29uZmlnRmlsZXMubGVuZ3RoID49IDApIHtcblx0XHRcdGxpbmUgPSAnfCAgICAgIENvbmYgZmlsZXM6Jztcblx0XHRcdGNvbCA9IDA7XG5cdFx0XHR3b3Jrc3BhY2VTdGF0cy5jb25maWdGaWxlcy5mb3JFYWNoKChpdGVtKSA9PiB7XG5cdFx0XHRcdGFwcGVuZEFuZFdyYXAoaXRlbS5uYW1lLCBpdGVtLmNvdW50KTtcblx0XHRcdH0pO1xuXHRcdFx0b3V0cHV0LnB1c2gobGluZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHdvcmtzcGFjZVN0YXRzLmxhdW5jaENvbmZpZ0ZpbGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGxldCBsaW5lID0gJ3wgICAgICBMYXVuY2ggQ29uZmlnczonO1xuXHRcdFx0d29ya3NwYWNlU3RhdHMubGF1bmNoQ29uZmlnRmlsZXMuZm9yRWFjaChlYWNoID0+IHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IGVhY2guY291bnQgPiAxID8gYCAke2VhY2gubmFtZX0oJHtlYWNoLmNvdW50fSlgIDogYCAke2VhY2gubmFtZX1gO1xuXHRcdFx0XHRsaW5lICs9IGl0ZW07XG5cdFx0XHR9KTtcblx0XHRcdG91dHB1dC5wdXNoKGxpbmUpO1xuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0LmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBleHBhbmRHUFVGZWF0dXJlcyhncHVGZWF0dXJlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IHN0cmluZyB7XG5cdFx0Y29uc3QgbG9uZ2VzdEZlYXR1cmVOYW1lID0gTWF0aC5tYXgoLi4uT2JqZWN0LmtleXMoZ3B1RmVhdHVyZXMpLm1hcChmZWF0dXJlID0+IGZlYXR1cmUubGVuZ3RoKSk7XG5cdFx0Ly8gTWFrZSBjb2x1bW5zIGFsaWduZWQgYnkgYWRkaW5nIHNwYWNlcyBhZnRlciBmZWF0dXJlIG5hbWVcblx0XHRyZXR1cm4gT2JqZWN0LmtleXMoZ3B1RmVhdHVyZXMpLm1hcChmZWF0dXJlID0+IGAke2ZlYXR1cmV9OiAgJHsnICcucmVwZWF0KGxvbmdlc3RGZWF0dXJlTmFtZSAtIGZlYXR1cmUubGVuZ3RoKX0gICR7Z3B1RmVhdHVyZXNbZmVhdHVyZV19YCkuam9pbignXFxuICAgICAgICAgICAgICAgICAgJyk7XG5cdH1cblxuXHRwcml2YXRlIGZvcm1hdFdvcmtzcGFjZU1ldGFkYXRhKGluZm86IElNYWluUHJvY2Vzc0RpYWdub3N0aWNzLCBvcHRpb25zPzogeyBza2lwQ2FjaGU/OiBib29sZWFuOyB1bmJvdW5kZWQ/OiBib29sZWFuIH0pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IG91dHB1dDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCB3b3Jrc3BhY2VTdGF0UHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXG5cdFx0aW5mby53aW5kb3dzLmZvckVhY2god2luZG93ID0+IHtcblx0XHRcdGlmICh3aW5kb3cuZm9sZGVyVVJJcy5sZW5ndGggPT09IDAgfHwgISF3aW5kb3cucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0b3V0cHV0LnB1c2goYHwgIFdpbmRvdyAoJHt3aW5kb3cudGl0bGV9KWApO1xuXG5cdFx0XHR3aW5kb3cuZm9sZGVyVVJJcy5mb3JFYWNoKHVyaUNvbXBvbmVudHMgPT4ge1xuXHRcdFx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkucmV2aXZlKHVyaUNvbXBvbmVudHMpO1xuXHRcdFx0XHRpZiAoZm9sZGVyVXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdFx0Y29uc3QgZm9sZGVyID0gZm9sZGVyVXJpLmZzUGF0aDtcblx0XHRcdFx0XHR3b3Jrc3BhY2VTdGF0UHJvbWlzZXMucHVzaChjb2xsZWN0V29ya3NwYWNlU3RhdHMoZm9sZGVyLCBbJ25vZGVfbW9kdWxlcycsICcuZ2l0J10sIG9wdGlvbnMpLnRoZW4oc3RhdHMgPT4ge1xuXHRcdFx0XHRcdFx0bGV0IGNvdW50TWVzc2FnZSA9IGAke3N0YXRzLmZpbGVDb3VudH0gZmlsZXNgO1xuXHRcdFx0XHRcdFx0aWYgKHN0YXRzLm1heEZpbGVzUmVhY2hlZCkge1xuXHRcdFx0XHRcdFx0XHRjb3VudE1lc3NhZ2UgPSBgbW9yZSB0aGFuICR7Y291bnRNZXNzYWdlfWA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRvdXRwdXQucHVzaChgfCAgICBGb2xkZXIgKCR7YmFzZW5hbWUoZm9sZGVyKX0pOiAke2NvdW50TWVzc2FnZX1gKTtcblx0XHRcdFx0XHRcdG91dHB1dC5wdXNoKHRoaXMuZm9ybWF0V29ya3NwYWNlU3RhdHMoc3RhdHMpKTtcblxuXHRcdFx0XHRcdH0pLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdFx0XHRcdG91dHB1dC5wdXNoKGB8ICAgICAgRXJyb3I6IFVuYWJsZSB0byBjb2xsZWN0IHdvcmtzcGFjZSBzdGF0cyBmb3IgZm9sZGVyICR7Zm9sZGVyfSAoJHtlcnJvci50b1N0cmluZygpfSlgKTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goYHwgICAgRm9sZGVyICgke2ZvbGRlclVyaS50b1N0cmluZygpfSk6IFdvcmtzcGFjZSBzdGF0cyBub3QgYXZhaWxhYmxlLmApO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBQcm9taXNlLmFsbCh3b3Jrc3BhY2VTdGF0UHJvbWlzZXMpXG5cdFx0XHQudGhlbihfID0+IG91dHB1dC5qb2luKCdcXG4nKSlcblx0XHRcdC5jYXRjaChlID0+IGBVbmFibGUgdG8gY29sbGVjdCB3b3Jrc3BhY2Ugc3RhdHM6ICR7ZX1gKTtcblx0fVxuXG5cdHByaXZhdGUgZm9ybWF0UHJvY2Vzc0xpc3QoaW5mbzogSU1haW5Qcm9jZXNzRGlhZ25vc3RpY3MsIHJvb3RQcm9jZXNzOiBQcm9jZXNzSXRlbSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbWFwUHJvY2Vzc1RvTmFtZSA9IG5ldyBNYXA8bnVtYmVyLCBzdHJpbmc+KCk7XG5cdFx0aW5mby53aW5kb3dzLmZvckVhY2god2luZG93ID0+IG1hcFByb2Nlc3NUb05hbWUuc2V0KHdpbmRvdy5waWQsIGB3aW5kb3cgWyR7d2luZG93LmlkfV0gKCR7d2luZG93LnRpdGxlfSlgKSk7XG5cdFx0aW5mby5waWRUb05hbWVzLmZvckVhY2goKHsgcGlkLCBuYW1lIH0pID0+IG1hcFByb2Nlc3NUb05hbWUuc2V0KHBpZCwgbmFtZSkpO1xuXG5cdFx0Y29uc3Qgb3V0cHV0OiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0b3V0cHV0LnB1c2goJ0NQVSAlXFx0TWVtIE1CXFx0ICAgUElEXFx0UHJvY2VzcycpO1xuXG5cdFx0aWYgKHJvb3RQcm9jZXNzKSB7XG5cdFx0XHR0aGlzLmZvcm1hdFByb2Nlc3NJdGVtKGluZm8ubWFpblBJRCwgbWFwUHJvY2Vzc1RvTmFtZSwgb3V0cHV0LCByb290UHJvY2VzcywgMCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG91dHB1dC5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHByaXZhdGUgZm9ybWF0UHJvY2Vzc0l0ZW0obWFpblBpZDogbnVtYmVyLCBtYXBQcm9jZXNzVG9OYW1lOiBNYXA8bnVtYmVyLCBzdHJpbmc+LCBvdXRwdXQ6IHN0cmluZ1tdLCBpdGVtOiBQcm9jZXNzSXRlbSwgaW5kZW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBpc1Jvb3QgPSAoaW5kZW50ID09PSAwKTtcblxuXHRcdC8vIEZvcm1hdCBuYW1lIHdpdGggaW5kZW50XG5cdFx0bGV0IG5hbWU6IHN0cmluZztcblx0XHRpZiAoaXNSb290KSB7XG5cdFx0XHRuYW1lID0gaXRlbS5waWQgPT09IG1haW5QaWQgPyB0aGlzLnByb2R1Y3RTZXJ2aWNlLmFwcGxpY2F0aW9uTmFtZSA6ICdyZW1vdGUtc2VydmVyJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKG1hcFByb2Nlc3NUb05hbWUuaGFzKGl0ZW0ucGlkKSkge1xuXHRcdFx0XHRuYW1lID0gbWFwUHJvY2Vzc1RvTmFtZS5nZXQoaXRlbS5waWQpITtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5hbWUgPSBgJHsnICAnLnJlcGVhdChpbmRlbnQpfSAke2l0ZW0ubmFtZX1gO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1lbW9yeSA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicgPyBpdGVtLm1lbSA6IChvc0xpYi50b3RhbG1lbSgpICogKGl0ZW0ubWVtIC8gMTAwKSk7XG5cdFx0b3V0cHV0LnB1c2goYCR7aXRlbS5sb2FkLnRvRml4ZWQoMCkucGFkU3RhcnQoNSwgJyAnKX1cXHQkeyhtZW1vcnkgLyBCeXRlU2l6ZS5NQikudG9GaXhlZCgwKS5wYWRTdGFydCg2LCAnICcpfVxcdCR7aXRlbS5waWQudG9GaXhlZCgwKS5wYWRTdGFydCg2LCAnICcpfVxcdCR7bmFtZX1gKTtcblxuXHRcdC8vIFJlY3Vyc2UgaW50byBjaGlsZHJlbiBpZiBhbnlcblx0XHRpZiAoQXJyYXkuaXNBcnJheShpdGVtLmNoaWxkcmVuKSkge1xuXHRcdFx0aXRlbS5jaGlsZHJlbi5mb3JFYWNoKGNoaWxkID0+IHRoaXMuZm9ybWF0UHJvY2Vzc0l0ZW0obWFpblBpZCwgbWFwUHJvY2Vzc1RvTmFtZSwgb3V0cHV0LCBjaGlsZCwgaW5kZW50ICsgMSkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRXb3Jrc3BhY2VGaWxlRXh0ZW5zaW9ucyh3b3Jrc3BhY2U6IElXb3Jrc3BhY2UpOiBQcm9taXNlPHsgZXh0ZW5zaW9uczogc3RyaW5nW10gfT4ge1xuXHRcdGNvbnN0IGl0ZW1zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCB7IHVyaSB9IG9mIHdvcmtzcGFjZS5mb2xkZXJzKSB7XG5cdFx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkucmV2aXZlKHVyaSk7XG5cdFx0XHRpZiAoZm9sZGVyVXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZm9sZGVyID0gZm9sZGVyVXJpLmZzUGF0aDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHN0YXRzID0gYXdhaXQgY29sbGVjdFdvcmtzcGFjZVN0YXRzKGZvbGRlciwgWydub2RlX21vZHVsZXMnLCAnLmdpdCddKTtcblx0XHRcdFx0c3RhdHMuZmlsZVR5cGVzLmZvckVhY2goaXRlbSA9PiB7XG5cdFx0XHRcdFx0aWYgKGl0ZW0ubmFtZSAhPT0gTk9fRVhUX0tFWSkge1xuXHRcdFx0XHRcdFx0aXRlbXMuYWRkKGl0ZW0ubmFtZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2ggeyB9XG5cdFx0fVxuXHRcdHJldHVybiB7IGV4dGVuc2lvbnM6IFsuLi5pdGVtc10gfTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZXBvcnRXb3Jrc3BhY2VTdGF0cyh3b3Jrc3BhY2U6IElXb3Jrc3BhY2VJbmZvcm1hdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3QgeyB1cmkgfSBvZiB3b3Jrc3BhY2UuZm9sZGVycykge1xuXHRcdFx0Y29uc3QgZm9sZGVyVXJpID0gVVJJLnJldml2ZSh1cmkpO1xuXHRcdFx0aWYgKGZvbGRlclVyaS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZm9sZGVyID0gZm9sZGVyVXJpLmZzUGF0aDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHN0YXRzID0gYXdhaXQgY29sbGVjdFdvcmtzcGFjZVN0YXRzKGZvbGRlciwgWydub2RlX21vZHVsZXMnLCAnLmdpdCddKTtcblx0XHRcdFx0dHlwZSBXb3Jrc3BhY2VTdGF0c0NsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdG93bmVyOiAnbHJhbW9zMTUnO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdNZXRhZGF0YSByZWxhdGVkIHRvIHRoZSB3b3Jrc3BhY2UnO1xuXHRcdFx0XHRcdCd3b3Jrc3BhY2UuaWQnOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnQSBVVUlEIGdpdmVuIHRvIGEgd29ya3NwYWNlIHRvIGlkZW50aWZ5IGl0LicgfTtcblx0XHRcdFx0XHRyZW5kZXJlclNlc3Npb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBJRCBvZiB0aGUgc2Vzc2lvbicgfTtcblx0XHRcdFx0fTtcblx0XHRcdFx0dHlwZSBXb3Jrc3BhY2VTdGF0c0V2ZW50ID0ge1xuXHRcdFx0XHRcdCd3b3Jrc3BhY2UuaWQnOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0cmVuZGVyZXJTZXNzaW9uSWQ6IHN0cmluZztcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya3NwYWNlU3RhdHNFdmVudCwgV29ya3NwYWNlU3RhdHNDbGFzc2lmaWNhdGlvbj4oJ3dvcmtzcGFjZS5zdGF0cycsIHtcblx0XHRcdFx0XHQnd29ya3NwYWNlLmlkJzogd29ya3NwYWNlLnRlbGVtZXRyeUlkLFxuXHRcdFx0XHRcdHJlbmRlcmVyU2Vzc2lvbklkOiB3b3Jrc3BhY2UucmVuZGVyZXJTZXNzaW9uSWRcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHR5cGUgV29ya3NwYWNlU3RhdHNGaWxlQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0b3duZXI6ICdscmFtb3MxNSc7XG5cdFx0XHRcdFx0Y29tbWVudDogJ0hlbHBzIHVzIGdhaW4gaW5zaWdodHMgaW50byB3aGF0IHR5cGUgb2YgZmlsZXMgYXJlIGJlaW5nIHVzZWQgaW4gYSB3b3Jrc3BhY2UnO1xuXHRcdFx0XHRcdHJlbmRlcmVyU2Vzc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIElEIG9mIHRoZSBzZXNzaW9uLicgfTtcblx0XHRcdFx0XHR0eXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHR5cGUgb2YgZmlsZScgfTtcblx0XHRcdFx0XHRjb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0hvdyBtYW55IHR5cGVzIG9mIHRoYXQgZmlsZSBhcmUgcHJlc2VudCcgfTtcblx0XHRcdFx0fTtcblx0XHRcdFx0dHlwZSBXb3Jrc3BhY2VTdGF0c0ZpbGVFdmVudCA9IHtcblx0XHRcdFx0XHRyZW5kZXJlclNlc3Npb25JZDogc3RyaW5nO1xuXHRcdFx0XHRcdHR5cGU6IHN0cmluZztcblx0XHRcdFx0XHRjb3VudDogbnVtYmVyO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRzdGF0cy5maWxlVHlwZXMuZm9yRWFjaChlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5uYW1lID09PSBOT19FWFRfS0VZKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtzcGFjZVN0YXRzRmlsZUV2ZW50LCBXb3Jrc3BhY2VTdGF0c0ZpbGVDbGFzc2lmaWNhdGlvbj4oJ3dvcmtzcGFjZS5zdGF0cy5maWxlJywge1xuXHRcdFx0XHRcdFx0cmVuZGVyZXJTZXNzaW9uSWQ6IHdvcmtzcGFjZS5yZW5kZXJlclNlc3Npb25JZCxcblx0XHRcdFx0XHRcdHR5cGU6IGUubmFtZSxcblx0XHRcdFx0XHRcdGNvdW50OiBlLmNvdW50XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzdGF0cy5sYXVuY2hDb25maWdGaWxlcy5mb3JFYWNoKGUgPT4ge1xuXHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtzcGFjZVN0YXRzRmlsZUV2ZW50LCBXb3Jrc3BhY2VTdGF0c0ZpbGVDbGFzc2lmaWNhdGlvbj4oJ3dvcmtzcGFjZS5zdGF0cy5sYXVuY2hDb25maWdGaWxlJywge1xuXHRcdFx0XHRcdFx0cmVuZGVyZXJTZXNzaW9uSWQ6IHdvcmtzcGFjZS5yZW5kZXJlclNlc3Npb25JZCxcblx0XHRcdFx0XHRcdHR5cGU6IGUubmFtZSxcblx0XHRcdFx0XHRcdGNvdW50OiBlLmNvdW50XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzdGF0cy5jb25maWdGaWxlcy5mb3JFYWNoKGUgPT4ge1xuXHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtzcGFjZVN0YXRzRmlsZUV2ZW50LCBXb3Jrc3BhY2VTdGF0c0ZpbGVDbGFzc2lmaWNhdGlvbj4oJ3dvcmtzcGFjZS5zdGF0cy5jb25maWdGaWxlcycsIHtcblx0XHRcdFx0XHRcdHJlbmRlcmVyU2Vzc2lvbklkOiB3b3Jrc3BhY2UucmVuZGVyZXJTZXNzaW9uSWQsXG5cdFx0XHRcdFx0XHR0eXBlOiBlLm5hbWUsXG5cdFx0XHRcdFx0XHRjb3VudDogZS5jb3VudFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBXb3Jrc3BhY2Ugc3RhdHMgbWV0YWRhdGFcblx0XHRcdFx0dHlwZSBXb3Jrc3BhY2VTdGF0c01ldGFkYXRhQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0b3duZXI6ICdqcmlla2VuJztcblx0XHRcdFx0XHRjb21tZW50OiAnTWV0YWRhdGEgYWJvdXQgd29ya3NwYWNlIG1ldGFkYXRhIGNvbGxlY3Rpb24nO1xuXHRcdFx0XHRcdGR1cmF0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnSG93IGRpZCBpdCB0YWtlIHRvIG1ha2Ugd29ya3NwYWNlIHN0YXRzJyB9O1xuXHRcdFx0XHRcdHJlYWNoZWRMaW1pdDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0RpZCBtYWtpbmcgd29ya3NwYWNlIHN0YXRzIHJlYWNoIGl0cyBsaW1pdHMnIH07XG5cdFx0XHRcdFx0ZmlsZUNvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnSG93IG1hbnkgZmlsZXMgZGlkIHdvcmtzcGFjZSBzdGF0cyBkaXNjb3ZlcicgfTtcblx0XHRcdFx0XHRyZWFkZGlyQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdIb3cgbWFueSByZWFkZGlyIGNhbGwgd2VyZSBuZWVkZWQnIH07XG5cdFx0XHRcdH07XG5cdFx0XHRcdHR5cGUgV29ya3NwYWNlU3RhdHNNZXRhZGF0YSA9IHtcblx0XHRcdFx0XHRkdXJhdGlvbjogbnVtYmVyO1xuXHRcdFx0XHRcdHJlYWNoZWRMaW1pdDogYm9vbGVhbjtcblx0XHRcdFx0XHRmaWxlQ291bnQ6IG51bWJlcjtcblx0XHRcdFx0XHRyZWFkZGlyQ291bnQ6IG51bWJlcjtcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya3NwYWNlU3RhdHNNZXRhZGF0YSwgV29ya3NwYWNlU3RhdHNNZXRhZGF0YUNsYXNzaWZpY2F0aW9uPignd29ya3NwYWNlLnN0YXRzLm1ldGFkYXRhJywgeyBkdXJhdGlvbjogc3RhdHMudG90YWxTY2FuVGltZSwgcmVhY2hlZExpbWl0OiBzdGF0cy5tYXhGaWxlc1JlYWNoZWQsIGZpbGVDb3VudDogc3RhdHMuZmlsZUNvdW50LCByZWFkZGlyQ291bnQ6IHN0YXRzLnRvdGFsUmVhZGRpckNvdW50IH0pO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIFJlcG9ydCBub3RoaW5nIGlmIGNvbGxlY3RpbmcgbWV0YWRhdGEgZmFpbHMuXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksUUFBUTtBQUNwQixZQUFZLFdBQVc7QUFDdkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhLGFBQXlCO0FBQy9DLFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUsWUFBWTtBQUMvQixTQUFTLFNBQVMsaUJBQWlCO0FBRW5DLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFrQixZQUFZLFdBQVc7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBb0gsK0JBQXNIO0FBQzFPLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBU2xDLE1BQU0sc0JBQXNCLG9CQUFJLElBQXFDO0FBR3JFLE1BQU0sYUFBYTtBQUVuQixlQUFzQixzQkFBc0IsUUFBZ0IsUUFBa0IsU0FBaUY7QUFHOUosUUFBTSxXQUFXLEdBQUcsTUFBTSxLQUFLLE9BQU8sS0FBSyxHQUFH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
