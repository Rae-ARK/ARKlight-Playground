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
import { EventProfiling } from "../../../../base/common/event.js";
import { GCBasedDisposableTracker, setDisposableTracker } from "../../../../base/common/lifecycle.js";
import { env } from "../../../../base/common/process.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { Extensions as ConfigExt } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { InstantiationService, Trace } from "../../../../platform/instantiation/common/instantiationService.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions, registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { EditorExtensions } from "../../../common/editor.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { InputLatencyContrib } from "./inputLatencyContrib.js";
import { PerfviewContrib, PerfviewInput } from "./perfviewEditor.js";
registerWorkbenchContribution2(
  PerfviewContrib.ID,
  PerfviewContrib,
  { lazy: true }
);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(
  PerfviewInput.Id,
  class {
    canSerialize() {
      return true;
    }
    serialize() {
      return "";
    }
    deserialize(instantiationService) {
      return instantiationService.createInstance(PerfviewInput);
    }
  }
);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "perfview.show",
      title: localize2("show.label", "Startup Performance"),
      category: Categories.Developer,
      f1: true
    });
  }
  run(accessor) {
    const editorService = accessor.get(IEditorService);
    const contrib = PerfviewContrib.get();
    return editorService.openEditor(contrib.getEditorInput(), { pinned: true });
  }
});
registerAction2(class PrintServiceCycles extends Action2 {
  constructor() {
    super({
      id: "perf.insta.printAsyncCycles",
      title: localize2("cycles", "Print Service Cycles"),
      category: Categories.Developer,
      f1: true
    });
  }
  run(accessor) {
    const instaService = accessor.get(IInstantiationService);
    if (instaService instanceof InstantiationService) {
      const cycle = instaService._globalGraph?.findCycleSlow();
      if (cycle) {
        console.warn(`CYCLE`, cycle);
      } else {
        console.warn(`YEAH, no more cycles`);
      }
    }
  }
});
registerAction2(class PrintServiceTraces extends Action2 {
  constructor() {
    super({
      id: "perf.insta.printTraces",
      title: localize2("insta.trace", "Print Service Traces"),
      category: Categories.Developer,
      f1: true
    });
  }
  run() {
    if (Trace.all.size === 0) {
      console.log("Enable via `instantiationService.ts#_enableAllTracing`");
      return;
    }
    for (const item of Trace.all) {
      console.log(item);
    }
  }
});
registerAction2(class PrintEventProfiling extends Action2 {
  constructor() {
    super({
      id: "perf.event.profiling",
      title: localize2("emitter", "Print Emitter Profiles"),
      category: Categories.Developer,
      f1: true
    });
  }
  run() {
    if (EventProfiling.all.size === 0) {
      console.log("USE `EmitterOptions._profName` to enable profiling");
      return;
    }
    for (const item of EventProfiling.all) {
      console.log(`${item.name}: ${item.invocationCount} invocations COST ${item.elapsedOverall}ms, ${item.listenerCount} listeners, avg cost is ${item.durations.reduce((a, b) => a + b, 0) / item.durations.length}ms`);
    }
  }
});
Registry.as(Extensions.Workbench).registerWorkbenchContribution(
  InputLatencyContrib,
  LifecyclePhase.Eventually
);
Registry.as(ConfigExt.Configuration).registerConfiguration({
  id: "performance",
  order: 101,
  title: localize("performanceConfigurationTitle", "Performance"),
  type: "object",
  properties: {
    "telemetry.performance.inputLatencySamplingProbability": {
      type: "number",
      default: 0,
      minimum: 0,
      maximum: 1,
      tags: ["experimental"],
      markdownDescription: localize("telemetry.performance.inputLatencySamplingProbability", "Probability (0 to 1) that input latency telemetry is reported for this session. Set to 0 to disable, 1 to always report."),
      experiment: {
        mode: "auto"
      }
    }
  }
});
let DisposableTracking = class {
  constructor(envService) {
    if (!envService.isBuilt && !envService.extensionTestsLocationURI && !env["VSCODE_DEV_DISABLE_DISPOSABLE_TRACKING"]) {
      setDisposableTracker(new GCBasedDisposableTracker());
    }
  }
};
DisposableTracking.Id = "perf.disposableTracking";
DisposableTracking = __decorateClass([
  __decorateParam(0, IEnvironmentService)
], DisposableTracking);
registerWorkbenchContribution2(DisposableTracking.Id, DisposableTracking, WorkbenchPhase.Eventually);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3BlcmZvcm1hbmNlL2Jyb3dzZXIvcGVyZm9ybWFuY2UuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnRQcm9maWxpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBHQ0Jhc2VkRGlzcG9zYWJsZVRyYWNrZXIsIHNldERpc3Bvc2FibGVUcmFja2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVudiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWdFeHQsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25TZXJ2aWNlLCBUcmFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zLCBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5LCBJRWRpdG9yU2VyaWFsaXplciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJbnB1dExhdGVuY3lDb250cmliIH0gZnJvbSAnLi9pbnB1dExhdGVuY3lDb250cmliLmpzJztcbmltcG9ydCB7IFBlcmZ2aWV3Q29udHJpYiwgUGVyZnZpZXdJbnB1dCB9IGZyb20gJy4vcGVyZnZpZXdFZGl0b3IuanMnO1xuXG4vLyAtLSBzdGFydHVwIHBlcmZvcm1hbmNlIHZpZXdcblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFxuXHRQZXJmdmlld0NvbnRyaWIuSUQsXG5cdFBlcmZ2aWV3Q29udHJpYixcblx0eyBsYXp5OiB0cnVlIH1cbik7XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKFxuXHRQZXJmdmlld0lucHV0LklkLFxuXHRjbGFzcyBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblx0XHRjYW5TZXJpYWxpemUoKTogYm9vbGVhbiB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0c2VyaWFsaXplKCk6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBQZXJmdmlld0lucHV0IHtcblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQZXJmdmlld0lucHV0KTtcblx0XHR9XG5cdH1cbik7XG5cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdwZXJmdmlldy5zaG93Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3cubGFiZWwnLCAnU3RhcnR1cCBQZXJmb3JtYW5jZScpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRyaWIgPSBQZXJmdmlld0NvbnRyaWIuZ2V0KCk7XG5cdFx0cmV0dXJuIGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihjb250cmliLmdldEVkaXRvcklucHV0KCksIHsgcGlubmVkOiB0cnVlIH0pO1xuXHR9XG59KTtcblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUHJpbnRTZXJ2aWNlQ3ljbGVzIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdwZXJmLmluc3RhLnByaW50QXN5bmNDeWNsZXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY3ljbGVzJywgJ1ByaW50IFNlcnZpY2UgQ3ljbGVzJyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0aWYgKGluc3RhU2VydmljZSBpbnN0YW5jZW9mIEluc3RhbnRpYXRpb25TZXJ2aWNlKSB7XG5cdFx0XHRjb25zdCBjeWNsZSA9IGluc3RhU2VydmljZS5fZ2xvYmFsR3JhcGg/LmZpbmRDeWNsZVNsb3coKTtcblx0XHRcdGlmIChjeWNsZSkge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oYENZQ0xFYCwgY3ljbGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKGBZRUFILCBubyBtb3JlIGN5Y2xlc2ApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBQcmludFNlcnZpY2VUcmFjZXMgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3BlcmYuaW5zdGEucHJpbnRUcmFjZXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW5zdGEudHJhY2UnLCAnUHJpbnQgU2VydmljZSBUcmFjZXMnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oKSB7XG5cdFx0aWYgKFRyYWNlLmFsbC5zaXplID09PSAwKSB7XG5cdFx0XHRjb25zb2xlLmxvZygnRW5hYmxlIHZpYSBgaW5zdGFudGlhdGlvblNlcnZpY2UudHMjX2VuYWJsZUFsbFRyYWNpbmdgJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIFRyYWNlLmFsbCkge1xuXHRcdFx0Y29uc29sZS5sb2coaXRlbSk7XG5cdFx0fVxuXHR9XG59KTtcblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUHJpbnRFdmVudFByb2ZpbGluZyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAncGVyZi5ldmVudC5wcm9maWxpbmcnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZW1pdHRlcicsICdQcmludCBFbWl0dGVyIFByb2ZpbGVzJyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKCk6IHZvaWQge1xuXHRcdGlmIChFdmVudFByb2ZpbGluZy5hbGwuc2l6ZSA9PT0gMCkge1xuXHRcdFx0Y29uc29sZS5sb2coJ1VTRSBgRW1pdHRlck9wdGlvbnMuX3Byb2ZOYW1lYCB0byBlbmFibGUgcHJvZmlsaW5nJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBFdmVudFByb2ZpbGluZy5hbGwpIHtcblx0XHRcdGNvbnNvbGUubG9nKGAke2l0ZW0ubmFtZX06ICR7aXRlbS5pbnZvY2F0aW9uQ291bnR9IGludm9jYXRpb25zIENPU1QgJHtpdGVtLmVsYXBzZWRPdmVyYWxsfW1zLCAke2l0ZW0ubGlzdGVuZXJDb3VudH0gbGlzdGVuZXJzLCBhdmcgY29zdCBpcyAke2l0ZW0uZHVyYXRpb25zLnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApIC8gaXRlbS5kdXJhdGlvbnMubGVuZ3RofW1zYCk7XG5cdFx0fVxuXHR9XG59KTtcblxuLy8gLS0gaW5wdXQgbGF0ZW5jeVxuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oXG5cdElucHV0TGF0ZW5jeUNvbnRyaWIsXG5cdExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHlcbik7XG5cblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlnRXh0LkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdGlkOiAncGVyZm9ybWFuY2UnLFxuXHRvcmRlcjogMTAxLFxuXHR0aXRsZTogbG9jYWxpemUoJ3BlcmZvcm1hbmNlQ29uZmlndXJhdGlvblRpdGxlJywgXCJQZXJmb3JtYW5jZVwiKSxcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHQndGVsZW1ldHJ5LnBlcmZvcm1hbmNlLmlucHV0TGF0ZW5jeVNhbXBsaW5nUHJvYmFiaWxpdHknOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlZmF1bHQ6IDAsXG5cdFx0XHRtaW5pbXVtOiAwLFxuXHRcdFx0bWF4aW11bTogMSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVsZW1ldHJ5LnBlcmZvcm1hbmNlLmlucHV0TGF0ZW5jeVNhbXBsaW5nUHJvYmFiaWxpdHknLCBcIlByb2JhYmlsaXR5ICgwIHRvIDEpIHRoYXQgaW5wdXQgbGF0ZW5jeSB0ZWxlbWV0cnkgaXMgcmVwb3J0ZWQgZm9yIHRoaXMgc2Vzc2lvbi4gU2V0IHRvIDAgdG8gZGlzYWJsZSwgMSB0byBhbHdheXMgcmVwb3J0LlwiKSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuLy8gLS0gdHJhY2sgbGVha2luZyBkaXNwb3NhYmxlcywgdGhvc2UgdGhhdCBnZXQgR0MnZWQgYmVmb3JlIGhhdmluZyBiZWVuIGRpc3Bvc2VkXG5cblxuY2xhc3MgRGlzcG9zYWJsZVRyYWNraW5nIHtcblx0c3RhdGljIHJlYWRvbmx5IElkID0gJ3BlcmYuZGlzcG9zYWJsZVRyYWNraW5nJztcblx0Y29uc3RydWN0b3IoQElFbnZpcm9ubWVudFNlcnZpY2UgZW52U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSkge1xuXHRcdGlmICghZW52U2VydmljZS5pc0J1aWx0ICYmICFlbnZTZXJ2aWNlLmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkgJiYgIWVudlsnVlNDT0RFX0RFVl9ESVNBQkxFX0RJU1BPU0FCTEVfVFJBQ0tJTkcnXSkge1xuXHRcdFx0c2V0RGlzcG9zYWJsZVRyYWNrZXIobmV3IEdDQmFzZWREaXNwb3NhYmxlVHJhY2tlcigpKTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKERpc3Bvc2FibGVUcmFja2luZy5JZCwgRGlzcG9zYWJsZVRyYWNraW5nLCBXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEIsNEJBQTRCO0FBQy9ELFNBQVMsV0FBVztBQUNwQixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyxjQUFjLGlCQUF5QztBQUNoRSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUErQztBQUN4RCxTQUFTLHNCQUFzQixhQUFhO0FBQzVDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsWUFBNkMsZ0NBQWdDLHNCQUFzQjtBQUM1RyxTQUFTLHdCQUFtRTtBQUM1RSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGlCQUFpQixxQkFBcUI7QUFJL0M7QUFBQSxFQUNDLGdCQUFnQjtBQUFBLEVBQ2hCO0FBQUEsRUFDQSxFQUFFLE1BQU0sS0FBSztBQUNkO0FBRUEsU0FBUyxHQUEyQixpQkFBaUIsYUFBYSxFQUFFO0FBQUEsRUFDbkUsY0FBYztBQUFBLEVBQ2QsTUFBbUM7QUFBQSxJQUNsQyxlQUF3QjtBQUN2QixhQUFPO0FBQUEsSUFDUjtBQUFBLElBQ0EsWUFBb0I7QUFDbkIsYUFBTztBQUFBLElBQ1I7QUFBQSxJQUNBLFlBQVksc0JBQTREO0FBQ3ZFLGFBQU8scUJBQXFCLGVBQWUsYUFBYTtBQUFBLElBQ3pEO0FBQUEsRUFDRDtBQUNEO0FBR0EsZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLEVBRXJDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsY0FBYyxxQkFBcUI7QUFBQSxNQUNw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
