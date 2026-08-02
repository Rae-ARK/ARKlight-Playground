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
import { localize } from "../../../../nls.js";
import { URI } from "../../../../base/common/uri.js";
import { TextResourceEditorInput } from "../../../common/editor/textResourceEditorInput.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { ILifecycleService, LifecyclePhase, StartupKindToString } from "../../../services/lifecycle/common/lifecycle.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITimerService } from "../../../services/timer/browser/timerService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { writeTransientState } from "../../codeEditor/browser/toggleWordWrap.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ByteSize, IFileService } from "../../../../platform/files/common/files.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IFilesConfigurationService } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { ITerminalService } from "../../terminal/browser/terminal.js";
import * as perf from "../../../../base/common/performance.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions, getWorkbenchContribution } from "../../../common/contributions.js";
import { ICustomEditorLabelService } from "../../../services/editor/common/customEditorLabelService.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
let PerfviewContrib = class {
  constructor(_instaService, textModelResolverService) {
    this._instaService = _instaService;
    this._inputUri = URI.from({ scheme: "perf", path: "Startup Performance" });
    this._registration = textModelResolverService.registerTextModelContentProvider("perf", _instaService.createInstance(PerfModelContentProvider));
  }
  static get() {
    return getWorkbenchContribution(PerfviewContrib.ID);
  }
  dispose() {
    this._registration.dispose();
  }
  getInputUri() {
    return this._inputUri;
  }
  getEditorInput() {
    return this._instaService.createInstance(PerfviewInput);
  }
};
PerfviewContrib.ID = "workbench.contrib.perfview";
PerfviewContrib = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ITextModelService)
], PerfviewContrib);
let PerfviewInput = class extends TextResourceEditorInput {
  get typeId() {
    return PerfviewInput.Id;
  }
  constructor(textModelResolverService, textFileService, editorService, fileService, labelService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService) {
    super(
      PerfviewContrib.get().getInputUri(),
      localize("name", "Startup Performance"),
      void 0,
      void 0,
      void 0,
      textModelResolverService,
      textFileService,
      editorService,
      fileService,
      labelService,
      filesConfigurationService,
      textResourceConfigurationService,
      customEditorLabelService
    );
  }
};
PerfviewInput.Id = "PerfviewInput";
PerfviewInput = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, ITextFileService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IFileService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, IFilesConfigurationService),
  __decorateParam(6, ITextResourceConfigurationService),
  __decorateParam(7, ICustomEditorLabelService)
], PerfviewInput);
let PerfModelContentProvider = class {
  constructor(_modelService, _languageService, _editorService, _lifecycleService, _timerService, _extensionService, _productService, _remoteAgentService, _terminalService) {
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._editorService = _editorService;
    this._lifecycleService = _lifecycleService;
    this._timerService = _timerService;
    this._extensionService = _extensionService;
    this._productService = _productService;
    this._remoteAgentService = _remoteAgentService;
    this._terminalService = _terminalService;
    this._modelDisposables = [];
  }
  provideTextContent(resource) {
    if (!this._model || this._model.isDisposed()) {
      dispose(this._modelDisposables);
      const langId = this._languageService.createById("markdown");
      this._model = this._modelService.getModel(resource) || this._modelService.createModel("Loading...", langId, resource);
      this._modelDisposables.push(langId.onDidChange((e) => {
        this._model?.setLanguage(e);
      }));
      this._modelDisposables.push(this._extensionService.onDidChangeExtensionsStatus(this._updateModel, this));
      writeTransientState(this._model, { wordWrapOverride: "off" }, this._editorService);
    }
    this._updateModel();
    return Promise.resolve(this._model);
  }
  _updateModel() {
    Promise.all([
      this._timerService.whenReady(),
      this._lifecycleService.when(LifecyclePhase.Eventually),
      this._extensionService.whenInstalledExtensionsRegistered(),
      // The terminal service never connects to the pty host on the web
      isWeb && !this._remoteAgentService.getConnection()?.remoteAuthority ? Promise.resolve() : this._terminalService.whenConnected
    ]).then(() => {
      if (this._model && !this._model.isDisposed()) {
        const md = new MarkdownBuilder();
        this._addSummary(md);
        md.blank();
        this._addSummaryTable(md);
        md.blank();
        this._addExtensionsTable(md);
        md.blank();
        this._addPerfMarksTable("Terminal Stats", md, this._timerService.getPerformanceMarks().find((e) => e[0] === "renderer")?.[1].filter((e) => e.name.startsWith("code/terminal/")));
        md.blank();
        this._addAgentHostPerfMarksTable(md);
        md.blank();
        this._addWorkbenchContributionsPerfMarksTable(md);
        md.blank();
        this._addRawPerfMarks(md);
        md.blank();
        this._addResourceTimingStats(md);
        this._model.setValue(md.value);
      }
    });
  }
  _addSummary(md) {
    const metrics = this._timerService.startupMetrics;
    md.heading(2, "System Info");
    md.li(`${this._productService.nameShort}: ${this._productService.version} (${this._productService.commit || "0000000"})`);
    md.li(`OS: ${metrics.platform}(${metrics.release})`);
    if (metrics.cpus) {
      md.li(`CPUs: ${metrics.cpus.model}(${metrics.cpus.count} x ${metrics.cpus.speed})`);
    }
    if (typeof metrics.totalmem === "number" && typeof metrics.freemem === "number") {
      md.li(`Memory(System): ${(metrics.totalmem / ByteSize.GB).toFixed(2)} GB(${(metrics.freemem / ByteSize.GB).toFixed(2)}GB free)`);
    }
    if (metrics.meminfo) {
      md.li(`Memory(Process): ${(metrics.meminfo.workingSetSize / ByteSize.KB).toFixed(2)} MB working set(${(metrics.meminfo.privateBytes / ByteSize.KB).toFixed(2)}MB private, ${(metrics.meminfo.sharedBytes / ByteSize.KB).toFixed(2)}MB shared)`);
    }
    md.li(`VM(likelihood): ${metrics.isVMLikelyhood}%`);
    md.li(`Initial Startup: ${metrics.initialStartup}`);
    md.li(`Has ${metrics.windowCount - 1} other windows`);
    md.li(`Screen Reader Active: ${metrics.hasAccessibilitySupport}`);
    md.li(`Empty Workspace: ${metrics.emptyWorkbench}`);
  }
  _addSummaryTable(md) {
    const metrics = this._timerService.startupMetrics;
    const contribTimings = Registry.as(WorkbenchExtensions.Workbench).timings;
    const table = [];
    table.push(["import(main.js)", metrics.timers.ellapsedLoadMainBundle, "[main]", `initial startup: ${metrics.initialStartup}`]);
    table.push(["start => app.isReady", metrics.timers.ellapsedAppReady, "[main]", `initial startup: ${metrics.initialStartup}`]);
    table.push(["nls:start => nls:end", metrics.timers.ellapsedNlsGeneration, "[main]", `initial startup: ${metrics.initialStartup}`]);
    table.push(["run main.js", metrics.timers.ellapsedRunMainBundle, "[main]", `initial startup: ${metrics.initialStartup}`]);
    table.push(["start crash reporter", metrics.timers.ellapsedCrashReporter, "[main]", `initial startup: ${metrics.initialStartup}`]);
    table.push(["serve main IPC handle", metrics.timers.ellapsedMainServer, "[main]", `initial startup: ${metrics.initialStartup}`]);
    table.push(["create window", metrics.timers.ellapsedWindowCreate, "[main]", `initial startup: ${metrics.initialStartup}, ${metrics.initialStartup ? `state: ${metrics.timers.ellapsedWindowRestoreState}ms, widget: ${metrics.timers.ellapsedBrowserWindowCreate}ms, show: ${metrics.timers.ellapsedWindowMaximize}ms` : ""}`]);
    table.push(["app.isReady => window.loadUrl()", metrics.timers.ellapsedWindowLoad, "[main]", `initial startup: ${metrics.initialStartup}`]);
    table.push(["window.loadUrl() => begin to import(workbench.desktop.main.js)", metrics.timers.ellapsedWindowLoadToRequire, "[main->renderer]", StartupKindToString(metrics.windowKind)]);
    table.push(["import(workbench.desktop.main.js)", metrics.timers.ellapsedRequire, "[renderer]", `cached data: ${metrics.didUseCachedData ? "YES" : "NO"}`]);
    table.push(["wait for window config", metrics.timers.ellapsedWaitForWindowConfig, "[renderer]", void 0]);
    table.push(["init storage (global & workspace)", metrics.timers.ellapsedStorageInit, "[renderer]", void 0]);
    table.push(["init workspace service", metrics.timers.ellapsedWorkspaceServiceInit, "[renderer]", void 0]);
    if (isWeb) {
      table.push(["init settings and global state from settings sync service", metrics.timers.ellapsedRequiredUserDataInit, "[renderer]", void 0]);
      table.push(["init keybindings, snippets & extensions from settings sync service", metrics.timers.ellapsedOtherUserDataInit, "[renderer]", void 0]);
    }
    table.push(["register extensions & spawn extension host", metrics.timers.ellapsedExtensions, "[renderer]", void 0]);
    table.push(["restore primary viewlet", metrics.timers.ellapsedViewletRestore, "[renderer]", metrics.viewletId]);
    table.push(["restore secondary viewlet", metrics.timers.ellapsedAuxiliaryViewletRestore, "[renderer]", metrics.auxiliaryViewletId]);
    table.push(["restore panel", metrics.timers.ellapsedPanelRestore, "[renderer]", metrics.panelId]);
    table.push(["restore & resolve visible editors", metrics.timers.ellapsedEditorRestore, "[renderer]", `${metrics.editorIds.length}: ${metrics.editorIds.join(", ")}`]);
    table.push(["create workbench contributions", metrics.timers.ellapsedWorkbenchContributions, "[renderer]", `${(contribTimings.get(LifecyclePhase.Starting)?.length ?? 0) + (contribTimings.get(LifecyclePhase.Ready)?.length ?? 0)} blocking startup`]);
    table.push(["overall workbench load", metrics.timers.ellapsedWorkbench, "[renderer]", void 0]);
    table.push(["workbench ready", metrics.ellapsed, "[main->renderer]", void 0]);
    table.push(["renderer ready", metrics.timers.ellapsedRenderer, "[renderer]", void 0]);
    table.push(["shared process connection ready", metrics.timers.ellapsedSharedProcesConnected, "[renderer->sharedprocess]", void 0]);
    table.push(["extensions registered", metrics.timers.ellapsedExtensionsReady, "[renderer]", void 0]);
    md.heading(2, "Performance Marks");
    md.table(["What", "Duration", "Process", "Info"], table);
  }
  _addExtensionsTable(md) {
    const eager = [];
    const normal = [];
    const extensionsStatus = this._extensionService.getExtensionsStatus();
    for (const id in extensionsStatus) {
      const { activationTimes: times } = extensionsStatus[id];
      if (!times) {
        continue;
      }
      if (times.activationReason.startup) {
        eager.push([id, times.activationReason.startup, times.codeLoadingTime, times.activateCallTime, times.activateResolvedTime, times.activationReason.activationEvent, times.activationReason.extensionId.value]);
      } else {
        normal.push([id, times.activationReason.startup, times.codeLoadingTime, times.activateCallTime, times.activateResolvedTime, times.activationReason.activationEvent, times.activationReason.extensionId.value]);
      }
    }
    const table = eager.concat(normal);
    if (table.length > 0) {
      md.heading(2, "Extension Activation Stats");
      md.table(
        ["Extension", "Eager", "Load Code", "Call Activate", "Finish Activate", "Event", "By"],
        table
      );
    }
  }
  _addPerfMarksTable(name, md, marks) {
    if (!marks) {
      return;
    }
    const table = [];
    let lastStartTime = -1;
    let total = 0;
    for (const { name: name2, startTime } of marks) {
      const delta = lastStartTime !== -1 ? startTime - lastStartTime : 0;
      total += delta;
      table.push([name2, Math.round(startTime), Math.round(delta), Math.round(total)]);
      lastStartTime = startTime;
    }
    if (name) {
      md.heading(2, name);
    }
    md.table(["Name", "Timestamp", "Delta", "Total"], table);
  }
  _addAgentHostPerfMarksTable(md) {
    const marks = perf.getMarks();
    if (!marks.some((mark) => mark.name.startsWith("code/agentHost/"))) {
      return;
    }
    this._addPerfMarksTable("Agent Host Startup", md, marks.filter((mark) => mark.name === "code/timeOrigin" || mark.name.startsWith("code/agentHost/")));
  }
  _addWorkbenchContributionsPerfMarksTable(md) {
    md.heading(2, "Workbench Contributions Blocking Restore");
    const timings = Registry.as(WorkbenchExtensions.Workbench).timings;
    md.li(`Total (LifecyclePhase.Starting): ${timings.get(LifecyclePhase.Starting)?.length} (${timings.get(LifecyclePhase.Starting)?.reduce((p, c) => p + c[1], 0)}ms)`);
    md.li(`Total (LifecyclePhase.Ready): ${timings.get(LifecyclePhase.Ready)?.length} (${timings.get(LifecyclePhase.Ready)?.reduce((p, c) => p + c[1], 0)}ms)`);
    md.blank();
    const marks = this._timerService.getPerformanceMarks().find((e) => e[0] === "renderer")?.[1].filter(
      (e) => e.name.startsWith("code/willCreateWorkbenchContribution/1") || e.name.startsWith("code/didCreateWorkbenchContribution/1") || e.name.startsWith("code/willCreateWorkbenchContribution/2") || e.name.startsWith("code/didCreateWorkbenchContribution/2")
    );
    this._addPerfMarksTable(void 0, md, marks);
  }
  _addRawPerfMarks(md) {
    for (const [source, marks] of this._timerService.getPerformanceMarks()) {
      md.heading(2, `Raw Perf Marks: ${source}`);
      md.value += "```\n";
      md.value += `Name	Timestamp	Delta	Total
`;
      let lastStartTime = -1;
      let total = 0;
      for (const { name, startTime } of marks) {
        const delta = lastStartTime !== -1 ? startTime - lastStartTime : 0;
        total += delta;
        md.value += `${name}	${startTime}	${delta}	${total}
`;
        lastStartTime = startTime;
      }
      md.value += "```\n";
    }
  }
  _addResourceTimingStats(md) {
    const stats = performance.getEntriesByType("resource").map((entry) => {
      return [entry.name, entry.duration];
    });
    if (!stats.length) {
      return;
    }
    md.heading(2, "Resource Timing Stats");
    md.table(["Name", "Duration"], stats);
  }
};
PerfModelContentProvider = __decorateClass([
  __decorateParam(0, IModelService),
  __decorateParam(1, ILanguageService),
  __decorateParam(2, ICodeEditorService),
  __decorateParam(3, ILifecycleService),
  __decorateParam(4, ITimerService),
  __decorateParam(5, IExtensionService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IRemoteAgentService),
  __decorateParam(8, ITerminalService)
], PerfModelContentProvider);
class MarkdownBuilder {
  constructor() {
    this.value = "";
  }
  heading(level, value) {
    this.value += `${"#".repeat(level)} ${value}

`;
    return this;
  }
  blank() {
    this.value += "\n";
    return this;
  }
  li(value) {
    this.value += `* ${value}
`;
    return this;
  }
  table(header, rows) {
    this.value += this.toMarkdownTable(header, rows);
  }
  toMarkdownTable(header, rows) {
    let result = "";
    const lengths = [];
    header.forEach((cell, ci) => {
      lengths[ci] = cell.length;
    });
    rows.forEach((row) => {
      row.forEach((cell, ci) => {
        if (typeof cell === "undefined") {
          cell = row[ci] = "-";
        }
        const len = cell.toString().length;
        lengths[ci] = Math.max(len, lengths[ci]);
      });
    });
    header.forEach((cell, ci) => {
      result += `| ${cell + " ".repeat(lengths[ci] - cell.toString().length)} `;
    });
    result += "|\n";
    header.forEach((_cell, ci) => {
      result += `| ${"-".repeat(lengths[ci])} `;
    });
    result += "|\n";
    rows.forEach((row) => {
      row.forEach((cell, ci) => {
        if (typeof cell !== "undefined") {
          result += `| ${cell + " ".repeat(lengths[ci] - cell.toString().length)} `;
        }
      });
      result += "|\n";
    });
    return result;
  }
}
export {
  PerfviewContrib,
  PerfviewInput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3BlcmZvcm1hbmNlL2Jyb3dzZXIvcGVyZnZpZXdFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3RleHRSZXNvdXJjZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlLCBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIExpZmVjeWNsZVBoYXNlLCBTdGFydHVwS2luZFRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRpbWVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RpbWVyL2Jyb3dzZXIvdGltZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyB3cml0ZVRyYW5zaWVudFN0YXRlIH0gZnJvbSAnLi4vLi4vY29kZUVkaXRvci9icm93c2VyL3RvZ2dsZVdvcmRXcmFwLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJ5dGVTaXplLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZmlsZXNDb25maWd1cmF0aW9uL2NvbW1vbi9maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCAqIGFzIHBlcmYgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucywgZ2V0V29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUN1c3RvbUVkaXRvckxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vY3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBQZXJmdmlld0NvbnRyaWIge1xuXG5cdHN0YXRpYyBnZXQoKSB7XG5cdFx0cmV0dXJuIGdldFdvcmtiZW5jaENvbnRyaWJ1dGlvbjxQZXJmdmlld0NvbnRyaWI+KFBlcmZ2aWV3Q29udHJpYi5JRCk7XG5cdH1cblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIucGVyZnZpZXcnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0VXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdwZXJmJywgcGF0aDogJ1N0YXJ0dXAgUGVyZm9ybWFuY2UnIH0pO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RyYXRpb246IElEaXNwb3NhYmxlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHRleHRNb2RlbFJlc29sdmVyU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9uID0gdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKCdwZXJmJywgX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShQZXJmTW9kZWxDb250ZW50UHJvdmlkZXIpKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGdldElucHV0VXJpKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuX2lucHV0VXJpO1xuXHR9XG5cblx0Z2V0RWRpdG9ySW5wdXQoKTogUGVyZnZpZXdJbnB1dCB7XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShQZXJmdmlld0lucHV0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUGVyZnZpZXdJbnB1dCBleHRlbmRzIFRleHRSZXNvdXJjZUVkaXRvcklucHV0IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSWQgPSAnUGVyZnZpZXdJbnB1dCc7XG5cblx0b3ZlcnJpZGUgZ2V0IHR5cGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBQZXJmdmlld0lucHV0LklkO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHRleHRNb2RlbFJlc29sdmVyU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UgY3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlOiBJQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0UGVyZnZpZXdDb250cmliLmdldCgpLmdldElucHV0VXJpKCksXG5cdFx0XHRsb2NhbGl6ZSgnbmFtZScsIFwiU3RhcnR1cCBQZXJmb3JtYW5jZVwiKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHRleHRNb2RlbFJlc29sdmVyU2VydmljZSxcblx0XHRcdHRleHRGaWxlU2VydmljZSxcblx0XHRcdGVkaXRvclNlcnZpY2UsXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdGxhYmVsU2VydmljZSxcblx0XHRcdGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHR0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdGN1c3RvbUVkaXRvckxhYmVsU2VydmljZVxuXHRcdCk7XG5cdH1cbn1cblxuY2xhc3MgUGVyZk1vZGVsQ29udGVudFByb3ZpZGVyIGltcGxlbWVudHMgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciB7XG5cblx0cHJpdmF0ZSBfbW9kZWw6IElUZXh0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21vZGVsRGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9saWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVRpbWVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aW1lclNlcnZpY2U6IElUaW1lclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlXG5cdCkgeyB9XG5cblx0cHJvdmlkZVRleHRDb250ZW50KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElUZXh0TW9kZWw+IHtcblxuXHRcdGlmICghdGhpcy5fbW9kZWwgfHwgdGhpcy5fbW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRkaXNwb3NlKHRoaXMuX21vZGVsRGlzcG9zYWJsZXMpO1xuXHRcdFx0Y29uc3QgbGFuZ0lkID0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQoJ21hcmtkb3duJyk7XG5cdFx0XHR0aGlzLl9tb2RlbCA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSkgfHwgdGhpcy5fbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCdMb2FkaW5nLi4uJywgbGFuZ0lkLCByZXNvdXJjZSk7XG5cblx0XHRcdHRoaXMuX21vZGVsRGlzcG9zYWJsZXMucHVzaChsYW5nSWQub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdHRoaXMuX21vZGVsPy5zZXRMYW5ndWFnZShlKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX21vZGVsRGlzcG9zYWJsZXMucHVzaCh0aGlzLl9leHRlbnNpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uc1N0YXR1cyh0aGlzLl91cGRhdGVNb2RlbCwgdGhpcykpO1xuXG5cdFx0XHR3cml0ZVRyYW5zaWVudFN0YXRlKHRoaXMuX21vZGVsLCB7IHdvcmRXcmFwT3ZlcnJpZGU6ICdvZmYnIH0sIHRoaXMuX2VkaXRvclNlcnZpY2UpO1xuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVNb2RlbCgpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5fbW9kZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTW9kZWwoKTogdm9pZCB7XG5cblx0XHRQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLl90aW1lclNlcnZpY2Uud2hlblJlYWR5KCksXG5cdFx0XHR0aGlzLl9saWZlY3ljbGVTZXJ2aWNlLndoZW4oTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSksXG5cdFx0XHR0aGlzLl9leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpLFxuXHRcdFx0Ly8gVGhlIHRlcm1pbmFsIHNlcnZpY2UgbmV2ZXIgY29ubmVjdHMgdG8gdGhlIHB0eSBob3N0IG9uIHRoZSB3ZWJcblx0XHRcdGlzV2ViICYmICF0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpPy5yZW1vdGVBdXRob3JpdHkgPyBQcm9taXNlLnJlc29sdmUoKSA6IHRoaXMuX3Rlcm1pbmFsU2VydmljZS53aGVuQ29ubmVjdGVkXG5cdFx0XSkudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fbW9kZWwgJiYgIXRoaXMuX21vZGVsLmlzRGlzcG9zZWQoKSkge1xuXG5cdFx0XHRcdGNvbnN0IG1kID0gbmV3IE1hcmtkb3duQnVpbGRlcigpO1xuXHRcdFx0XHR0aGlzLl9hZGRTdW1tYXJ5KG1kKTtcblx0XHRcdFx0bWQuYmxhbmsoKTtcblx0XHRcdFx0dGhpcy5fYWRkU3VtbWFyeVRhYmxlKG1kKTtcblx0XHRcdFx0bWQuYmxhbmsoKTtcblx0XHRcdFx0dGhpcy5fYWRkRXh0ZW5zaW9uc1RhYmxlKG1kKTtcblx0XHRcdFx0bWQuYmxhbmsoKTtcblx0XHRcdFx0dGhpcy5fYWRkUGVyZk1hcmtzVGFibGUoJ1Rlcm1pbmFsIFN0YXRzJywgbWQsIHRoaXMuX3RpbWVyU2VydmljZS5nZXRQZXJmb3JtYW5jZU1hcmtzKCkuZmluZChlID0+IGVbMF0gPT09ICdyZW5kZXJlcicpPy5bMV0uZmlsdGVyKGUgPT4gZS5uYW1lLnN0YXJ0c1dpdGgoJ2NvZGUvdGVybWluYWwvJykpKTtcblx0XHRcdFx0bWQuYmxhbmsoKTtcblx0XHRcdFx0dGhpcy5fYWRkQWdlbnRIb3N0UGVyZk1hcmtzVGFibGUobWQpO1xuXHRcdFx0XHRtZC5ibGFuaygpO1xuXHRcdFx0XHR0aGlzLl9hZGRXb3JrYmVuY2hDb250cmlidXRpb25zUGVyZk1hcmtzVGFibGUobWQpO1xuXHRcdFx0XHRtZC5ibGFuaygpO1xuXHRcdFx0XHR0aGlzLl9hZGRSYXdQZXJmTWFya3MobWQpO1xuXHRcdFx0XHRtZC5ibGFuaygpO1xuXHRcdFx0XHR0aGlzLl9hZGRSZXNvdXJjZVRpbWluZ1N0YXRzKG1kKTtcblxuXHRcdFx0XHR0aGlzLl9tb2RlbC5zZXRWYWx1ZShtZC52YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0fVxuXG5cdHByaXZhdGUgX2FkZFN1bW1hcnkobWQ6IE1hcmtkb3duQnVpbGRlcik6IHZvaWQge1xuXHRcdGNvbnN0IG1ldHJpY3MgPSB0aGlzLl90aW1lclNlcnZpY2Uuc3RhcnR1cE1ldHJpY3M7XG5cdFx0bWQuaGVhZGluZygyLCAnU3lzdGVtIEluZm8nKTtcblx0XHRtZC5saShgJHt0aGlzLl9wcm9kdWN0U2VydmljZS5uYW1lU2hvcnR9OiAke3RoaXMuX3Byb2R1Y3RTZXJ2aWNlLnZlcnNpb259ICgke3RoaXMuX3Byb2R1Y3RTZXJ2aWNlLmNvbW1pdCB8fCAnMDAwMDAwMCd9KWApO1xuXHRcdG1kLmxpKGBPUzogJHttZXRyaWNzLnBsYXRmb3JtfSgke21ldHJpY3MucmVsZWFzZX0pYCk7XG5cdFx0aWYgKG1ldHJpY3MuY3B1cykge1xuXHRcdFx0bWQubGkoYENQVXM6ICR7bWV0cmljcy5jcHVzLm1vZGVsfSgke21ldHJpY3MuY3B1cy5jb3VudH0geCAke21ldHJpY3MuY3B1cy5zcGVlZH0pYCk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgbWV0cmljcy50b3RhbG1lbSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIG1ldHJpY3MuZnJlZW1lbSA9PT0gJ251bWJlcicpIHtcblx0XHRcdG1kLmxpKGBNZW1vcnkoU3lzdGVtKTogJHsobWV0cmljcy50b3RhbG1lbSAvIChCeXRlU2l6ZS5HQikpLnRvRml4ZWQoMil9IEdCKCR7KG1ldHJpY3MuZnJlZW1lbSAvIChCeXRlU2l6ZS5HQikpLnRvRml4ZWQoMil9R0IgZnJlZSlgKTtcblx0XHR9XG5cdFx0aWYgKG1ldHJpY3MubWVtaW5mbykge1xuXHRcdFx0bWQubGkoYE1lbW9yeShQcm9jZXNzKTogJHsobWV0cmljcy5tZW1pbmZvLndvcmtpbmdTZXRTaXplIC8gQnl0ZVNpemUuS0IpLnRvRml4ZWQoMil9IE1CIHdvcmtpbmcgc2V0KCR7KG1ldHJpY3MubWVtaW5mby5wcml2YXRlQnl0ZXMgLyBCeXRlU2l6ZS5LQikudG9GaXhlZCgyKX1NQiBwcml2YXRlLCAkeyhtZXRyaWNzLm1lbWluZm8uc2hhcmVkQnl0ZXMgLyBCeXRlU2l6ZS5LQikudG9GaXhlZCgyKX1NQiBzaGFyZWQpYCk7XG5cdFx0fVxuXHRcdG1kLmxpKGBWTShsaWtlbGlob29kKTogJHttZXRyaWNzLmlzVk1MaWtlbHlob29kfSVgKTtcblx0XHRtZC5saShgSW5pdGlhbCBTdGFydHVwOiAke21ldHJpY3MuaW5pdGlhbFN0YXJ0dXB9YCk7XG5cdFx0bWQubGkoYEhhcyAke21ldHJpY3Mud2luZG93Q291bnQgLSAxfSBvdGhlciB3aW5kb3dzYCk7XG5cdFx0bWQubGkoYFNjcmVlbiBSZWFkZXIgQWN0aXZlOiAke21ldHJpY3MuaGFzQWNjZXNzaWJpbGl0eVN1cHBvcnR9YCk7XG5cdFx0bWQubGkoYEVtcHR5IFdvcmtzcGFjZTogJHttZXRyaWNzLmVtcHR5V29ya2JlbmNofWApO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkU3VtbWFyeVRhYmxlKG1kOiBNYXJrZG93bkJ1aWxkZXIpOiB2b2lkIHtcblxuXHRcdGNvbnN0IG1ldHJpY3MgPSB0aGlzLl90aW1lclNlcnZpY2Uuc3RhcnR1cE1ldHJpY3M7XG5cdFx0Y29uc3QgY29udHJpYlRpbWluZ3MgPSBSZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkudGltaW5ncztcblxuXHRcdGNvbnN0IHRhYmxlOiBBcnJheTxBcnJheTxzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQ+PiA9IFtdO1xuXHRcdHRhYmxlLnB1c2goWydpbXBvcnQobWFpbi5qcyknLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZExvYWRNYWluQnVuZGxlLCAnW21haW5dJywgYGluaXRpYWwgc3RhcnR1cDogJHttZXRyaWNzLmluaXRpYWxTdGFydHVwfWBdKTtcblx0XHR0YWJsZS5wdXNoKFsnc3RhcnQgPT4gYXBwLmlzUmVhZHknLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZEFwcFJlYWR5LCAnW21haW5dJywgYGluaXRpYWwgc3RhcnR1cDogJHttZXRyaWNzLmluaXRpYWxTdGFydHVwfWBdKTtcblx0XHR0YWJsZS5wdXNoKFsnbmxzOnN0YXJ0ID0+IG5sczplbmQnLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZE5sc0dlbmVyYXRpb24sICdbbWFpbl0nLCBgaW5pdGlhbCBzdGFydHVwOiAke21ldHJpY3MuaW5pdGlhbFN0YXJ0dXB9YF0pO1xuXHRcdHRhYmxlLnB1c2goWydydW4gbWFpbi5qcycsIG1ldHJpY3MudGltZXJzLmVsbGFwc2VkUnVuTWFpbkJ1bmRsZSwgJ1ttYWluXScsIGBpbml0aWFsIHN0YXJ0dXA6ICR7bWV0cmljcy5pbml0aWFsU3RhcnR1cH1gXSk7XG5cdFx0dGFibGUucHVzaChbJ3N0YXJ0IGNyYXNoIHJlcG9ydGVyJywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRDcmFzaFJlcG9ydGVyLCAnW21haW5dJywgYGluaXRpYWwgc3RhcnR1cDogJHttZXRyaWNzLmluaXRpYWxTdGFydHVwfWBdKTtcblx0XHR0YWJsZS5wdXNoKFsnc2VydmUgbWFpbiBJUEMgaGFuZGxlJywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRNYWluU2VydmVyLCAnW21haW5dJywgYGluaXRpYWwgc3RhcnR1cDogJHttZXRyaWNzLmluaXRpYWxTdGFydHVwfWBdKTtcblx0XHR0YWJsZS5wdXNoKFsnY3JlYXRlIHdpbmRvdycsIG1ldHJpY3MudGltZXJzLmVsbGFwc2VkV2luZG93Q3JlYXRlLCAnW21haW5dJywgYGluaXRpYWwgc3RhcnR1cDogJHttZXRyaWNzLmluaXRpYWxTdGFydHVwfSwgJHttZXRyaWNzLmluaXRpYWxTdGFydHVwID8gYHN0YXRlOiAke21ldHJpY3MudGltZXJzLmVsbGFwc2VkV2luZG93UmVzdG9yZVN0YXRlfW1zLCB3aWRnZXQ6ICR7bWV0cmljcy50aW1lcnMuZWxsYXBzZWRCcm93c2VyV2luZG93Q3JlYXRlfW1zLCBzaG93OiAke21ldHJpY3MudGltZXJzLmVsbGFwc2VkV2luZG93TWF4aW1pemV9bXNgIDogJyd9YF0pO1xuXHRcdHRhYmxlLnB1c2goWydhcHAuaXNSZWFkeSA9PiB3aW5kb3cubG9hZFVybCgpJywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRXaW5kb3dMb2FkLCAnW21haW5dJywgYGluaXRpYWwgc3RhcnR1cDogJHttZXRyaWNzLmluaXRpYWxTdGFydHVwfWBdKTtcblx0XHR0YWJsZS5wdXNoKFsnd2luZG93LmxvYWRVcmwoKSA9PiBiZWdpbiB0byBpbXBvcnQod29ya2JlbmNoLmRlc2t0b3AubWFpbi5qcyknLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZFdpbmRvd0xvYWRUb1JlcXVpcmUsICdbbWFpbi0+cmVuZGVyZXJdJywgU3RhcnR1cEtpbmRUb1N0cmluZyhtZXRyaWNzLndpbmRvd0tpbmQpXSk7XG5cdFx0dGFibGUucHVzaChbJ2ltcG9ydCh3b3JrYmVuY2guZGVza3RvcC5tYWluLmpzKScsIG1ldHJpY3MudGltZXJzLmVsbGFwc2VkUmVxdWlyZSwgJ1tyZW5kZXJlcl0nLCBgY2FjaGVkIGRhdGE6ICR7KG1ldHJpY3MuZGlkVXNlQ2FjaGVkRGF0YSA/ICdZRVMnIDogJ05PJyl9YF0pO1xuXHRcdHRhYmxlLnB1c2goWyd3YWl0IGZvciB3aW5kb3cgY29uZmlnJywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRXYWl0Rm9yV2luZG93Q29uZmlnLCAnW3JlbmRlcmVyXScsIHVuZGVmaW5lZF0pO1xuXHRcdHRhYmxlLnB1c2goWydpbml0IHN0b3JhZ2UgKGdsb2JhbCAmIHdvcmtzcGFjZSknLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZFN0b3JhZ2VJbml0LCAnW3JlbmRlcmVyXScsIHVuZGVmaW5lZF0pO1xuXHRcdHRhYmxlLnB1c2goWydpbml0IHdvcmtzcGFjZSBzZXJ2aWNlJywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRXb3Jrc3BhY2VTZXJ2aWNlSW5pdCwgJ1tyZW5kZXJlcl0nLCB1bmRlZmluZWRdKTtcblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdHRhYmxlLnB1c2goWydpbml0IHNldHRpbmdzIGFuZCBnbG9iYWwgc3RhdGUgZnJvbSBzZXR0aW5ncyBzeW5jIHNlcnZpY2UnLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZFJlcXVpcmVkVXNlckRhdGFJbml0LCAnW3JlbmRlcmVyXScsIHVuZGVmaW5lZF0pO1xuXHRcdFx0dGFibGUucHVzaChbJ2luaXQga2V5YmluZGluZ3MsIHNuaXBwZXRzICYgZXh0ZW5zaW9ucyBmcm9tIHNldHRpbmdzIHN5bmMgc2VydmljZScsIG1ldHJpY3MudGltZXJzLmVsbGFwc2VkT3RoZXJVc2VyRGF0YUluaXQsICdbcmVuZGVyZXJdJywgdW5kZWZpbmVkXSk7XG5cdFx0fVxuXHRcdHRhYmxlLnB1c2goWydyZWdpc3RlciBleHRlbnNpb25zICYgc3Bhd24gZXh0ZW5zaW9uIGhvc3QnLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZEV4dGVuc2lvbnMsICdbcmVuZGVyZXJdJywgdW5kZWZpbmVkXSk7XG5cdFx0dGFibGUucHVzaChbJ3Jlc3RvcmUgcHJpbWFyeSB2aWV3bGV0JywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRWaWV3bGV0UmVzdG9yZSwgJ1tyZW5kZXJlcl0nLCBtZXRyaWNzLnZpZXdsZXRJZF0pO1xuXHRcdHRhYmxlLnB1c2goWydyZXN0b3JlIHNlY29uZGFyeSB2aWV3bGV0JywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRBdXhpbGlhcnlWaWV3bGV0UmVzdG9yZSwgJ1tyZW5kZXJlcl0nLCBtZXRyaWNzLmF1eGlsaWFyeVZpZXdsZXRJZF0pO1xuXHRcdHRhYmxlLnB1c2goWydyZXN0b3JlIHBhbmVsJywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRQYW5lbFJlc3RvcmUsICdbcmVuZGVyZXJdJywgbWV0cmljcy5wYW5lbElkXSk7XG5cdFx0dGFibGUucHVzaChbJ3Jlc3RvcmUgJiByZXNvbHZlIHZpc2libGUgZWRpdG9ycycsIG1ldHJpY3MudGltZXJzLmVsbGFwc2VkRWRpdG9yUmVzdG9yZSwgJ1tyZW5kZXJlcl0nLCBgJHttZXRyaWNzLmVkaXRvcklkcy5sZW5ndGh9OiAke21ldHJpY3MuZWRpdG9ySWRzLmpvaW4oJywgJyl9YF0pO1xuXHRcdHRhYmxlLnB1c2goWydjcmVhdGUgd29ya2JlbmNoIGNvbnRyaWJ1dGlvbnMnLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZFdvcmtiZW5jaENvbnRyaWJ1dGlvbnMsICdbcmVuZGVyZXJdJywgYCR7KGNvbnRyaWJUaW1pbmdzLmdldChMaWZlY3ljbGVQaGFzZS5TdGFydGluZyk/Lmxlbmd0aCA/PyAwKSArIChjb250cmliVGltaW5ncy5nZXQoTGlmZWN5Y2xlUGhhc2UuUmVhZHkpPy5sZW5ndGggPz8gMCl9IGJsb2NraW5nIHN0YXJ0dXBgXSk7XG5cdFx0dGFibGUucHVzaChbJ292ZXJhbGwgd29ya2JlbmNoIGxvYWQnLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZFdvcmtiZW5jaCwgJ1tyZW5kZXJlcl0nLCB1bmRlZmluZWRdKTtcblx0XHR0YWJsZS5wdXNoKFsnd29ya2JlbmNoIHJlYWR5JywgbWV0cmljcy5lbGxhcHNlZCwgJ1ttYWluLT5yZW5kZXJlcl0nLCB1bmRlZmluZWRdKTtcblx0XHR0YWJsZS5wdXNoKFsncmVuZGVyZXIgcmVhZHknLCBtZXRyaWNzLnRpbWVycy5lbGxhcHNlZFJlbmRlcmVyLCAnW3JlbmRlcmVyXScsIHVuZGVmaW5lZF0pO1xuXHRcdHRhYmxlLnB1c2goWydzaGFyZWQgcHJvY2VzcyBjb25uZWN0aW9uIHJlYWR5JywgbWV0cmljcy50aW1lcnMuZWxsYXBzZWRTaGFyZWRQcm9jZXNDb25uZWN0ZWQsICdbcmVuZGVyZXItPnNoYXJlZHByb2Nlc3NdJywgdW5kZWZpbmVkXSk7XG5cdFx0dGFibGUucHVzaChbJ2V4dGVuc2lvbnMgcmVnaXN0ZXJlZCcsIG1ldHJpY3MudGltZXJzLmVsbGFwc2VkRXh0ZW5zaW9uc1JlYWR5LCAnW3JlbmRlcmVyXScsIHVuZGVmaW5lZF0pO1xuXG5cdFx0bWQuaGVhZGluZygyLCAnUGVyZm9ybWFuY2UgTWFya3MnKTtcblx0XHRtZC50YWJsZShbJ1doYXQnLCAnRHVyYXRpb24nLCAnUHJvY2VzcycsICdJbmZvJ10sIHRhYmxlKTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZEV4dGVuc2lvbnNUYWJsZShtZDogTWFya2Rvd25CdWlsZGVyKTogdm9pZCB7XG5cblx0XHRjb25zdCBlYWdlcjogKHsgdG9TdHJpbmcoKTogc3RyaW5nIH0pW11bXSA9IFtdO1xuXHRcdGNvbnN0IG5vcm1hbDogKHsgdG9TdHJpbmcoKTogc3RyaW5nIH0pW11bXSA9IFtdO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNTdGF0dXMgPSB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbnNTdGF0dXMoKTtcblx0XHRmb3IgKGNvbnN0IGlkIGluIGV4dGVuc2lvbnNTdGF0dXMpIHtcblx0XHRcdGNvbnN0IHsgYWN0aXZhdGlvblRpbWVzOiB0aW1lcyB9ID0gZXh0ZW5zaW9uc1N0YXR1c1tpZF07XG5cdFx0XHRpZiAoIXRpbWVzKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRpbWVzLmFjdGl2YXRpb25SZWFzb24uc3RhcnR1cCkge1xuXHRcdFx0XHRlYWdlci5wdXNoKFtpZCwgdGltZXMuYWN0aXZhdGlvblJlYXNvbi5zdGFydHVwLCB0aW1lcy5jb2RlTG9hZGluZ1RpbWUsIHRpbWVzLmFjdGl2YXRlQ2FsbFRpbWUsIHRpbWVzLmFjdGl2YXRlUmVzb2x2ZWRUaW1lLCB0aW1lcy5hY3RpdmF0aW9uUmVhc29uLmFjdGl2YXRpb25FdmVudCwgdGltZXMuYWN0aXZhdGlvblJlYXNvbi5leHRlbnNpb25JZC52YWx1ZV0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bm9ybWFsLnB1c2goW2lkLCB0aW1lcy5hY3RpdmF0aW9uUmVhc29uLnN0YXJ0dXAsIHRpbWVzLmNvZGVMb2FkaW5nVGltZSwgdGltZXMuYWN0aXZhdGVDYWxsVGltZSwgdGltZXMuYWN0aXZhdGVSZXNvbHZlZFRpbWUsIHRpbWVzLmFjdGl2YXRpb25SZWFzb24uYWN0aXZhdGlvbkV2ZW50LCB0aW1lcy5hY3RpdmF0aW9uUmVhc29uLmV4dGVuc2lvbklkLnZhbHVlXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFibGUgPSBlYWdlci5jb25jYXQobm9ybWFsKTtcblx0XHRpZiAodGFibGUubGVuZ3RoID4gMCkge1xuXHRcdFx0bWQuaGVhZGluZygyLCAnRXh0ZW5zaW9uIEFjdGl2YXRpb24gU3RhdHMnKTtcblx0XHRcdG1kLnRhYmxlKFxuXHRcdFx0XHRbJ0V4dGVuc2lvbicsICdFYWdlcicsICdMb2FkIENvZGUnLCAnQ2FsbCBBY3RpdmF0ZScsICdGaW5pc2ggQWN0aXZhdGUnLCAnRXZlbnQnLCAnQnknXSxcblx0XHRcdFx0dGFibGVcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYWRkUGVyZk1hcmtzVGFibGUobmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBtZDogTWFya2Rvd25CdWlsZGVyLCBtYXJrczogcmVhZG9ubHkgcGVyZi5QZXJmb3JtYW5jZU1hcmtbXSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghbWFya3MpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGFibGU6IEFycmF5PEFycmF5PHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZD4+ID0gW107XG5cdFx0bGV0IGxhc3RTdGFydFRpbWUgPSAtMTtcblx0XHRsZXQgdG90YWwgPSAwO1xuXHRcdGZvciAoY29uc3QgeyBuYW1lLCBzdGFydFRpbWUgfSBvZiBtYXJrcykge1xuXHRcdFx0Y29uc3QgZGVsdGEgPSBsYXN0U3RhcnRUaW1lICE9PSAtMSA/IHN0YXJ0VGltZSAtIGxhc3RTdGFydFRpbWUgOiAwO1xuXHRcdFx0dG90YWwgKz0gZGVsdGE7XG5cdFx0XHR0YWJsZS5wdXNoKFtuYW1lLCBNYXRoLnJvdW5kKHN0YXJ0VGltZSksIE1hdGgucm91bmQoZGVsdGEpLCBNYXRoLnJvdW5kKHRvdGFsKV0pO1xuXHRcdFx0bGFzdFN0YXJ0VGltZSA9IHN0YXJ0VGltZTtcblx0XHR9XG5cdFx0aWYgKG5hbWUpIHtcblx0XHRcdG1kLmhlYWRpbmcoMiwgbmFtZSk7XG5cdFx0fVxuXHRcdG1kLnRhYmxlKFsnTmFtZScsICdUaW1lc3RhbXAnLCAnRGVsdGEnLCAnVG90YWwnXSwgdGFibGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkQWdlbnRIb3N0UGVyZk1hcmtzVGFibGUobWQ6IE1hcmtkb3duQnVpbGRlcik6IHZvaWQge1xuXHRcdGNvbnN0IG1hcmtzID0gcGVyZi5nZXRNYXJrcygpO1xuXHRcdGlmICghbWFya3Muc29tZShtYXJrID0+IG1hcmsubmFtZS5zdGFydHNXaXRoKCdjb2RlL2FnZW50SG9zdC8nKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYWRkUGVyZk1hcmtzVGFibGUoJ0FnZW50IEhvc3QgU3RhcnR1cCcsIG1kLCBtYXJrcy5maWx0ZXIobWFyayA9PiBtYXJrLm5hbWUgPT09ICdjb2RlL3RpbWVPcmlnaW4nIHx8IG1hcmsubmFtZS5zdGFydHNXaXRoKCdjb2RlL2FnZW50SG9zdC8nKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkV29ya2JlbmNoQ29udHJpYnV0aW9uc1BlcmZNYXJrc1RhYmxlKG1kOiBNYXJrZG93bkJ1aWxkZXIpOiB2b2lkIHtcblx0XHRtZC5oZWFkaW5nKDIsICdXb3JrYmVuY2ggQ29udHJpYnV0aW9ucyBCbG9ja2luZyBSZXN0b3JlJyk7XG5cblx0XHRjb25zdCB0aW1pbmdzID0gUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnRpbWluZ3M7XG5cdFx0bWQubGkoYFRvdGFsIChMaWZlY3ljbGVQaGFzZS5TdGFydGluZyk6ICR7dGltaW5ncy5nZXQoTGlmZWN5Y2xlUGhhc2UuU3RhcnRpbmcpPy5sZW5ndGh9ICgke3RpbWluZ3MuZ2V0KExpZmVjeWNsZVBoYXNlLlN0YXJ0aW5nKT8ucmVkdWNlKChwLCBjKSA9PiBwICsgY1sxXSwgMCl9bXMpYCk7XG5cdFx0bWQubGkoYFRvdGFsIChMaWZlY3ljbGVQaGFzZS5SZWFkeSk6ICR7dGltaW5ncy5nZXQoTGlmZWN5Y2xlUGhhc2UuUmVhZHkpPy5sZW5ndGh9ICgke3RpbWluZ3MuZ2V0KExpZmVjeWNsZVBoYXNlLlJlYWR5KT8ucmVkdWNlKChwLCBjKSA9PiBwICsgY1sxXSwgMCl9bXMpYCk7XG5cdFx0bWQuYmxhbmsoKTtcblxuXHRcdGNvbnN0IG1hcmtzID0gdGhpcy5fdGltZXJTZXJ2aWNlLmdldFBlcmZvcm1hbmNlTWFya3MoKS5maW5kKGUgPT4gZVswXSA9PT0gJ3JlbmRlcmVyJyk/LlsxXS5maWx0ZXIoZSA9PlxuXHRcdFx0ZS5uYW1lLnN0YXJ0c1dpdGgoJ2NvZGUvd2lsbENyZWF0ZVdvcmtiZW5jaENvbnRyaWJ1dGlvbi8xJykgfHxcblx0XHRcdGUubmFtZS5zdGFydHNXaXRoKCdjb2RlL2RpZENyZWF0ZVdvcmtiZW5jaENvbnRyaWJ1dGlvbi8xJykgfHxcblx0XHRcdGUubmFtZS5zdGFydHNXaXRoKCdjb2RlL3dpbGxDcmVhdGVXb3JrYmVuY2hDb250cmlidXRpb24vMicpIHx8XG5cdFx0XHRlLm5hbWUuc3RhcnRzV2l0aCgnY29kZS9kaWRDcmVhdGVXb3JrYmVuY2hDb250cmlidXRpb24vMicpXG5cdFx0KTtcblx0XHR0aGlzLl9hZGRQZXJmTWFya3NUYWJsZSh1bmRlZmluZWQsIG1kLCBtYXJrcyk7XG5cdH1cblxuXHRwcml2YXRlIF9hZGRSYXdQZXJmTWFya3MobWQ6IE1hcmtkb3duQnVpbGRlcik6IHZvaWQge1xuXG5cdFx0Zm9yIChjb25zdCBbc291cmNlLCBtYXJrc10gb2YgdGhpcy5fdGltZXJTZXJ2aWNlLmdldFBlcmZvcm1hbmNlTWFya3MoKSkge1xuXHRcdFx0bWQuaGVhZGluZygyLCBgUmF3IFBlcmYgTWFya3M6ICR7c291cmNlfWApO1xuXHRcdFx0bWQudmFsdWUgKz0gJ2BgYFxcbic7XG5cdFx0XHRtZC52YWx1ZSArPSBgTmFtZVxcdFRpbWVzdGFtcFxcdERlbHRhXFx0VG90YWxcXG5gO1xuXHRcdFx0bGV0IGxhc3RTdGFydFRpbWUgPSAtMTtcblx0XHRcdGxldCB0b3RhbCA9IDA7XG5cdFx0XHRmb3IgKGNvbnN0IHsgbmFtZSwgc3RhcnRUaW1lIH0gb2YgbWFya3MpIHtcblx0XHRcdFx0Y29uc3QgZGVsdGEgPSBsYXN0U3RhcnRUaW1lICE9PSAtMSA/IHN0YXJ0VGltZSAtIGxhc3RTdGFydFRpbWUgOiAwO1xuXHRcdFx0XHR0b3RhbCArPSBkZWx0YTtcblx0XHRcdFx0bWQudmFsdWUgKz0gYCR7bmFtZX1cXHQke3N0YXJ0VGltZX1cXHQke2RlbHRhfVxcdCR7dG90YWx9XFxuYDtcblx0XHRcdFx0bGFzdFN0YXJ0VGltZSA9IHN0YXJ0VGltZTtcblx0XHRcdH1cblx0XHRcdG1kLnZhbHVlICs9ICdgYGBcXG4nO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FkZFJlc291cmNlVGltaW5nU3RhdHMobWQ6IE1hcmtkb3duQnVpbGRlcikge1xuXHRcdGNvbnN0IHN0YXRzID0gcGVyZm9ybWFuY2UuZ2V0RW50cmllc0J5VHlwZSgncmVzb3VyY2UnKS5tYXAoZW50cnkgPT4ge1xuXHRcdFx0cmV0dXJuIFtlbnRyeS5uYW1lLCBlbnRyeS5kdXJhdGlvbl07XG5cdFx0fSk7XG5cdFx0aWYgKCFzdGF0cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bWQuaGVhZGluZygyLCAnUmVzb3VyY2UgVGltaW5nIFN0YXRzJyk7XG5cdFx0bWQudGFibGUoWydOYW1lJywgJ0R1cmF0aW9uJ10sIHN0YXRzKTtcblx0fVxufVxuXG5jbGFzcyBNYXJrZG93bkJ1aWxkZXIge1xuXG5cdHZhbHVlOiBzdHJpbmcgPSAnJztcblxuXHRoZWFkaW5nKGxldmVsOiBudW1iZXIsIHZhbHVlOiBzdHJpbmcpOiB0aGlzIHtcblx0XHR0aGlzLnZhbHVlICs9IGAkeycjJy5yZXBlYXQobGV2ZWwpfSAke3ZhbHVlfVxcblxcbmA7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRibGFuaygpIHtcblx0XHR0aGlzLnZhbHVlICs9ICdcXG4nO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0bGkodmFsdWU6IHN0cmluZykge1xuXHRcdHRoaXMudmFsdWUgKz0gYCogJHt2YWx1ZX1cXG5gO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0dGFibGUoaGVhZGVyOiBzdHJpbmdbXSwgcm93czogQXJyYXk8QXJyYXk8eyB0b1N0cmluZygpOiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4+KSB7XG5cdFx0dGhpcy52YWx1ZSArPSB0aGlzLnRvTWFya2Rvd25UYWJsZShoZWFkZXIsIHJvd3MpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b01hcmtkb3duVGFibGUoaGVhZGVyOiBzdHJpbmdbXSwgcm93czogQXJyYXk8QXJyYXk8eyB0b1N0cmluZygpOiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4+KTogc3RyaW5nIHtcblx0XHRsZXQgcmVzdWx0ID0gJyc7XG5cblx0XHRjb25zdCBsZW5ndGhzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGhlYWRlci5mb3JFYWNoKChjZWxsLCBjaSkgPT4ge1xuXHRcdFx0bGVuZ3Roc1tjaV0gPSBjZWxsLmxlbmd0aDtcblx0XHR9KTtcblx0XHRyb3dzLmZvckVhY2gocm93ID0+IHtcblx0XHRcdHJvdy5mb3JFYWNoKChjZWxsLCBjaSkgPT4ge1xuXHRcdFx0XHRpZiAodHlwZW9mIGNlbGwgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0Y2VsbCA9IHJvd1tjaV0gPSAnLSc7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbGVuID0gY2VsbC50b1N0cmluZygpLmxlbmd0aDtcblx0XHRcdFx0bGVuZ3Roc1tjaV0gPSBNYXRoLm1heChsZW4sIGxlbmd0aHNbY2ldKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gaGVhZGVyXG5cdFx0aGVhZGVyLmZvckVhY2goKGNlbGwsIGNpKSA9PiB7IHJlc3VsdCArPSBgfCAke2NlbGwgKyAnICcucmVwZWF0KGxlbmd0aHNbY2ldIC0gY2VsbC50b1N0cmluZygpLmxlbmd0aCl9IGA7IH0pO1xuXHRcdHJlc3VsdCArPSAnfFxcbic7XG5cdFx0aGVhZGVyLmZvckVhY2goKF9jZWxsLCBjaSkgPT4geyByZXN1bHQgKz0gYHwgJHsnLScucmVwZWF0KGxlbmd0aHNbY2ldKX0gYDsgfSk7XG5cdFx0cmVzdWx0ICs9ICd8XFxuJztcblxuXHRcdC8vIGNlbGxzXG5cdFx0cm93cy5mb3JFYWNoKHJvdyA9PiB7XG5cdFx0XHRyb3cuZm9yRWFjaCgoY2VsbCwgY2kpID0+IHtcblx0XHRcdFx0aWYgKHR5cGVvZiBjZWxsICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdHJlc3VsdCArPSBgfCAke2NlbGwgKyAnICcucmVwZWF0KGxlbmd0aHNbY2ldIC0gY2VsbC50b1N0cmluZygpLmxlbmd0aCl9IGA7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0cmVzdWx0ICs9ICd8XFxuJztcblx0XHR9KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMseUJBQW9EO0FBRTdELFNBQVMsbUJBQW1CLGdCQUFnQiwyQkFBMkI7QUFDdkUsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBc0IsZUFBZTtBQUNyQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFVBQVUsb0JBQW9CO0FBQ3ZDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHdCQUF3QjtBQUNqQyxZQUFZLFVBQVU7QUFDdEIsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBMEMsY0FBYyxxQkFBcUIsZ0NBQWdDO0FBQzdHLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsMkJBQTJCO0FBRTdCLElBQU0sa0JBQU4sTUFBc0I7QUFBQSxFQVc1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
