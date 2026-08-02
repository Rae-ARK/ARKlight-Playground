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
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import Severity from "../../../../base/common/severity.js";
import * as strings from "../../../../base/common/strings.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import * as nls from "../../../../nls.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Breakpoints } from "../common/breakpoints.js";
import { CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_EXTENSION_AVAILABLE, INTERNAL_CONSOLE_OPTIONS_SCHEMA } from "../common/debug.js";
import { Debugger } from "../common/debugger.js";
import { breakpointsExtPoint, debuggersExtPoint, launchSchema, presentationSchema } from "../common/debugSchemas.js";
import { TaskDefinitionRegistry } from "../../tasks/common/taskDefinitionRegistry.js";
import { ITaskService } from "../../tasks/common/taskService.js";
import { launchSchemaId } from "../../../services/configuration/common/configuration.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ILifecycleService, LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
let AdapterManager = class extends Disposable {
  constructor(delegate, editorService, configurationService, quickInputService, instantiationService, commandService, extensionService, contextKeyService, languageService, dialogService, lifecycleService, tasksService, menuService) {
    super();
    this.delegate = delegate;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.quickInputService = quickInputService;
    this.instantiationService = instantiationService;
    this.commandService = commandService;
    this.extensionService = extensionService;
    this.contextKeyService = contextKeyService;
    this.languageService = languageService;
    this.dialogService = dialogService;
    this.lifecycleService = lifecycleService;
    this.tasksService = tasksService;
    this.menuService = menuService;
    this.debugAdapterFactories = /* @__PURE__ */ new Map();
    this._onDidRegisterDebugger = this._register(new Emitter());
    this._onDidDebuggersExtPointRead = this._register(new Emitter());
    this.breakpointContributions = [];
    this.debuggerWhenKeys = /* @__PURE__ */ new Set();
    this.taskLabels = [];
    this.usedDebugTypes = /* @__PURE__ */ new Set();
    this.adapterDescriptorFactories = [];
    this.debuggers = [];
    this.registerListeners();
    this.contextKeyService.bufferChangeEvents(() => {
      this.debuggersAvailable = CONTEXT_DEBUGGERS_AVAILABLE.bindTo(contextKeyService);
      this.debugExtensionsAvailable = CONTEXT_DEBUG_EXTENSION_AVAILABLE.bindTo(contextKeyService);
    });
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(this.debuggerWhenKeys)) {
        this.debuggersAvailable.set(this.hasEnabledDebuggers());
        this.updateDebugAdapterSchema();
      }
    }));
    this._register(this.onDidDebuggersExtPointRead(() => {
      this.debugExtensionsAvailable.set(this.debuggers.length > 0);
    }));
    const updateTaskScheduler = this._register(new RunOnceScheduler(() => this.updateTaskLabels(), 5e3));
    this._register(Event.any(tasksService.onDidChangeTaskConfig, tasksService.onDidChangeTaskProviders)(() => {
      updateTaskScheduler.cancel();
      updateTaskScheduler.schedule();
    }));
    this.lifecycleService.when(LifecyclePhase.Eventually).then(() => this.debugExtensionsAvailable.set(this.debuggers.length > 0));
    this._register(delegate.onDidNewSession((s) => {
      this.usedDebugTypes.add(s.configuration.type);
    }));
    updateTaskScheduler.schedule();
  }
  registerListeners() {
    debuggersExtPoint.setHandler((extensions, delta) => {
      delta.added.forEach((added) => {
        added.value.forEach((rawAdapter) => {
          if (!rawAdapter.type || typeof rawAdapter.type !== "string") {
            added.collector.error(nls.localize("debugNoType", "Debugger 'type' can not be omitted and must be of type 'string'."));
          }
          if (rawAdapter.type !== "*") {
            const existing = this.getDebugger(rawAdapter.type);
            if (existing) {
              existing.merge(rawAdapter, added.description);
            } else {
              const dbg = this.instantiationService.createInstance(Debugger, this, rawAdapter, added.description);
              dbg.when?.keys().forEach((key) => this.debuggerWhenKeys.add(key));
              this.debuggers.push(dbg);
            }
          }
        });
      });
      extensions.forEach((extension) => {
        extension.value.forEach((rawAdapter) => {
          if (rawAdapter.type === "*") {
            this.debuggers.forEach((dbg) => dbg.merge(rawAdapter, extension.description));
          }
        });
      });
      delta.removed.forEach((removed) => {
        const removedTypes = removed.value.map((rawAdapter) => rawAdapter.type);
        this.debuggers = this.debuggers.filter((d) => removedTypes.indexOf(d.type) === -1);
      });
      this.updateDebugAdapterSchema();
      this._onDidDebuggersExtPointRead.fire();
    });
    breakpointsExtPoint.setHandler((extensions) => {
      this.breakpointContributions = extensions.flatMap((ext) => ext.value.map((breakpoint) => this.instantiationService.createInstance(Breakpoints, breakpoint)));
    });
  }
  updateTaskLabels() {
    this.tasksService.getKnownTasks().then((tasks) => {
      this.taskLabels = tasks.map((task) => task._label);
      this.updateDebugAdapterSchema();
    });
  }
  updateDebugAdapterSchema() {
    const items = launchSchema.properties["configurations"].items;
    const taskSchema = TaskDefinitionRegistry.getJsonSchema();
    const definitions = {
      "common": {
        properties: {
          "name": {
            type: "string",
            description: nls.localize("debugName", "Name of configuration; appears in the launch configuration dropdown menu."),
            default: "Launch"
          },
          "debugServer": {
            type: "number",
            description: nls.localize("debugServer", "For debug extension development only: if a port is specified VS Code tries to connect to a debug adapter running in server mode"),
            default: 4711
          },
          "preLaunchTask": {
            anyOf: [taskSchema, {
              type: ["string"]
            }],
            default: "",
            defaultSnippets: [{ body: { task: "", type: "" } }],
            description: nls.localize("debugPrelaunchTask", "Task to run before debug session starts."),
            examples: this.taskLabels
          },
          "postDebugTask": {
            anyOf: [taskSchema, {
              type: ["string"]
            }],
            default: "",
            defaultSnippets: [{ body: { task: "", type: "" } }],
            description: nls.localize("debugPostDebugTask", "Task to run after debug session ends."),
            examples: this.taskLabels
          },
          "presentation": presentationSchema,
          "internalConsoleOptions": INTERNAL_CONSOLE_OPTIONS_SCHEMA,
          "suppressMultipleSessionWarning": {
            type: "boolean",
            description: nls.localize("suppressMultipleSessionWarning", "Disable the warning when trying to start the same debug configuration more than once."),
            default: true
          }
        }
      }
    };
    launchSchema.definitions = definitions;
    items.oneOf = [];
    items.defaultSnippets = [];
    this.debuggers.forEach((adapter) => {
      const schemaAttributes = adapter.getSchemaAttributes(definitions);
      if (schemaAttributes && items.oneOf) {
        items.oneOf.push(...schemaAttributes);
      }
      const configurationSnippets = adapter.configurationSnippets;
      if (configurationSnippets && items.defaultSnippets) {
        items.defaultSnippets.push(...configurationSnippets);
      }
    });
    jsonRegistry.registerSchema(launchSchemaId, launchSchema);
  }
  registerDebugAdapterFactory(debugTypes, debugAdapterLauncher) {
    debugTypes.forEach((debugType) => this.debugAdapterFactories.set(debugType, debugAdapterLauncher));
    this.debuggersAvailable.set(this.hasEnabledDebuggers());
    this._onDidRegisterDebugger.fire();
    return {
      dispose: () => {
        debugTypes.forEach((debugType) => this.debugAdapterFactories.delete(debugType));
      }
    };
  }
  hasEnabledDebuggers() {
    for (const [type] of this.debugAdapterFactories) {
      const dbg = this.getDebugger(type);
      if (dbg && dbg.enabled) {
        return true;
      }
    }
    return false;
  }
  createDebugAdapter(session) {
    const factory = this.debugAdapterFactories.get(session.configuration.type);
    if (factory) {
      return factory.createDebugAdapter(session);
    }
    return void 0;
  }
  substituteVariables(debugType, folder, config) {
    const factory = this.debugAdapterFactories.get(debugType);
    if (factory) {
      return factory.substituteVariables(folder, config);
    }
    return Promise.resolve(config);
  }
  runInTerminal(debugType, args, sessionId) {
    const factory = this.debugAdapterFactories.get(debugType);
    if (factory) {
      return factory.runInTerminal(args, sessionId);
    }
    return Promise.resolve(void 0);
  }
  registerDebugAdapterDescriptorFactory(debugAdapterProvider) {
    this.adapterDescriptorFactories.push(debugAdapterProvider);
    return {
      dispose: () => {
        this.unregisterDebugAdapterDescriptorFactory(debugAdapterProvider);
      }
    };
  }
  unregisterDebugAdapterDescriptorFactory(debugAdapterProvider) {
    const ix = this.adapterDescriptorFactories.indexOf(debugAdapterProvider);
    if (ix >= 0) {
      this.adapterDescriptorFactories.splice(ix, 1);
    }
  }
  getDebugAdapterDescriptor(session) {
    const config = session.configuration;
    const providers = this.adapterDescriptorFactories.filter((p) => p.type === config.type && p.createDebugAdapterDescriptor);
    if (providers.length === 1) {
      return providers[0].createDebugAdapterDescriptor(session);
    } else {
    }
    return Promise.resolve(void 0);
  }
  getDebuggerLabel(type) {
    const dbgr = this.getDebugger(type);
    if (dbgr) {
      return dbgr.label;
    }
    return void 0;
  }
  get onDidRegisterDebugger() {
    return this._onDidRegisterDebugger.event;
  }
  get onDidDebuggersExtPointRead() {
    return this._onDidDebuggersExtPointRead.event;
  }
  canSetBreakpointsIn(model) {
    const languageId = model.getLanguageId();
    if (!languageId || languageId === "jsonc" || languageId === "log") {
      return false;
    }
    if (this.configurationService.getValue("debug").allowBreakpointsEverywhere) {
      return true;
    }
    return this.breakpointContributions.some((breakpoints) => breakpoints.language === languageId && breakpoints.enabled);
  }
  getDebugger(type) {
    return this.debuggers.find((dbg) => strings.equalsIgnoreCase(dbg.type, type));
  }
  getEnabledDebugger(type) {
    const adapter = this.getDebugger(type);
    return adapter && adapter.enabled ? adapter : void 0;
  }
  someDebuggerInterestedInLanguage(languageId) {
    return !!this.debuggers.filter((d) => d.enabled).find((a) => a.interestedInLanguage(languageId));
  }
  async guessDebugger(gettingConfigurations) {
    const activeTextEditorControl = this.editorService.activeTextEditorControl;
    let candidates = [];
    let languageLabel = null;
    let model = null;
    if (isCodeEditor(activeTextEditorControl)) {
      model = activeTextEditorControl.getModel();
      const language = model ? model.getLanguageId() : void 0;
      if (language) {
        languageLabel = this.languageService.getLanguageName(language);
      }
      const adapters = this.debuggers.filter((a) => a.enabled).filter((a) => language && a.interestedInLanguage(language));
      if (adapters.length === 1) {
        return { debugger: adapters[0] };
      }
      if (adapters.length > 1) {
        candidates = adapters;
      }
    }
    if ((!languageLabel || gettingConfigurations || model && this.canSetBreakpointsIn(model)) && candidates.length === 0) {
      await this.activateDebuggers("onDebugInitialConfigurations");
      candidates = this.debuggers.filter((a) => a.enabled).filter((dbg) => dbg.hasInitialConfiguration() || dbg.hasDynamicConfigurationProviders() || dbg.hasConfigurationProvider());
    }
    if (candidates.length === 0 && languageLabel) {
      if (languageLabel.indexOf(" ") >= 0) {
        languageLabel = `'${languageLabel}'`;
      }
      const { confirmed } = await this.dialogService.confirm({
        type: Severity.Warning,
        message: nls.localize("CouldNotFindLanguage", "You don't have an extension for debugging {0}. Should we find a {0} extension in the Marketplace?", languageLabel),
        primaryButton: nls.localize({ key: "findExtension", comment: ["&& denotes a mnemonic"] }, "&&Find {0} extension", languageLabel)
      });
      if (confirmed) {
        await this.commandService.executeCommand("debug.installAdditionalDebuggers", languageLabel);
      }
      return void 0;
    }
    this.initExtensionActivationsIfNeeded();
    candidates.sort((first, second) => first.label.localeCompare(second.label));
    candidates = candidates.filter((a) => !a.isHiddenFromDropdown);
    const suggestedCandidates = [];
    const otherCandidates = [];
    candidates.forEach((d) => {
      const descriptor = d.getMainExtensionDescriptor();
      if (descriptor.id && !!this.earlyActivatedExtensions?.has(descriptor.id)) {
        suggestedCandidates.push(d);
      } else if (this.usedDebugTypes.has(d.type)) {
        suggestedCandidates.push(d);
      } else {
        otherCandidates.push(d);
      }
    });
    const picks = [];
    const dynamic = await this.delegate.configurationManager().getDynamicProviders();
    if (suggestedCandidates.length > 0) {
      picks.push(
        { type: "separator", label: nls.localize("suggestedDebuggers", "Suggested") },
        ...suggestedCandidates.map((c) => ({ label: c.label, pick: () => ({ debugger: c }) }))
      );
    }
    if (otherCandidates.length > 0) {
      if (picks.length > 0) {
        picks.push({ type: "separator", label: "" });
      }
      picks.push(...otherCandidates.map((c) => ({ label: c.label, pick: () => ({ debugger: c }) })));
    }
    if (dynamic.length) {
      if (picks.length) {
        picks.push({ type: "separator", label: "" });
      }
      for (const d of dynamic) {
        picks.push({
          label: nls.localize("moreOptionsForDebugType", "More {0} options...", d.label),
          pick: async () => {
            const cfg = await d.pick();
            if (!cfg) {
              return void 0;
            }
            return cfg && { debugger: this.getDebugger(d.type), withConfig: cfg };
          }
        });
      }
    }
    picks.push(
      { type: "separator", label: "" },
      { label: languageLabel ? nls.localize("installLanguage", "Install an extension for {0}...", languageLabel) : nls.localize("installExt", "Install extension...") }
    );
    const contributed = this.menuService.getMenuActions(MenuId.DebugCreateConfiguration, this.contextKeyService);
    for (const [, action] of contributed) {
      for (const item of action) {
        picks.push(item);
      }
    }
    const placeHolder = nls.localize("selectDebug", "Select debugger");
    return this.quickInputService.pick(picks, { activeItem: picks[0], placeHolder }).then(async (picked) => {
      if (picked && "pick" in picked && typeof picked.pick === "function") {
        return await picked.pick();
      }
      if (picked instanceof MenuItemAction) {
        picked.run();
        return;
      }
      if (picked) {
        this.commandService.executeCommand("debug.installAdditionalDebuggers", languageLabel);
      }
      return void 0;
    });
  }
  initExtensionActivationsIfNeeded() {
    if (!this.earlyActivatedExtensions) {
      this.earlyActivatedExtensions = /* @__PURE__ */ new Set();
      const status = this.extensionService.getExtensionsStatus();
      for (const id in status) {
        if (!!status[id].activationTimes) {
          this.earlyActivatedExtensions.add(id);
        }
      }
    }
  }
  async activateDebuggers(activationEvent, debugType) {
    this.initExtensionActivationsIfNeeded();
    const promises = [
      this.extensionService.activateByEvent(activationEvent),
      this.extensionService.activateByEvent("onDebug")
    ];
    if (debugType) {
      promises.push(this.extensionService.activateByEvent(`${activationEvent}:${debugType}`));
    }
    await Promise.all(promises);
  }
};
AdapterManager = __decorateClass([
  __decorateParam(1, IEditorService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, ILanguageService),
  __decorateParam(9, IDialogService),
  __decorateParam(10, ILifecycleService),
  __decorateParam(11, ITaskService),
  __decorateParam(12, IMenuService)
], AdapterManager);
export {
  AdapterManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdBZGFwdGVyTWFuYWdlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hLCBJSlNPTlNjaGVtYU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBpc0NvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBKU09ORXh0ZW5zaW9ucywgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IEJyZWFrcG9pbnRzIH0gZnJvbSAnLi4vY29tbW9uL2JyZWFrcG9pbnRzLmpzJztcbmltcG9ydCB7IENPTlRFWFRfREVCVUdHRVJTX0FWQUlMQUJMRSwgQ09OVEVYVF9ERUJVR19FWFRFTlNJT05fQVZBSUxBQkxFLCBJQWRhcHRlckRlc2NyaXB0b3IsIElBZGFwdGVyTWFuYWdlciwgSUNvbmZpZywgSUNvbmZpZ3VyYXRpb25NYW5hZ2VyLCBJRGVidWdBZGFwdGVyLCBJRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnksIElEZWJ1Z0FkYXB0ZXJGYWN0b3J5LCBJRGVidWdDb25maWd1cmF0aW9uLCBJRGVidWdTZXNzaW9uLCBJR3Vlc3NlZERlYnVnZ2VyLCBJTlRFUk5BTF9DT05TT0xFX09QVElPTlNfU0NIRU1BIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IERlYnVnZ2VyIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnZ2VyLmpzJztcbmltcG9ydCB7IGJyZWFrcG9pbnRzRXh0UG9pbnQsIGRlYnVnZ2Vyc0V4dFBvaW50LCBsYXVuY2hTY2hlbWEsIHByZXNlbnRhdGlvblNjaGVtYSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z1NjaGVtYXMuanMnO1xuaW1wb3J0IHsgVGFza0RlZmluaXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL3Rhc2tzL2NvbW1vbi90YXNrRGVmaW5pdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElUYXNrU2VydmljZSB9IGZyb20gJy4uLy4uL3Rhc2tzL2NvbW1vbi90YXNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsYXVuY2hTY2hlbWFJZCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuY29uc3QganNvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUpTT05Db250cmlidXRpb25SZWdpc3RyeT4oSlNPTkV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFkYXB0ZXJNYW5hZ2VyRGVsZWdhdGUge1xuXHRyZWFkb25seSBvbkRpZE5ld1Nlc3Npb246IEV2ZW50PElEZWJ1Z1Nlc3Npb24+O1xuXHRjb25maWd1cmF0aW9uTWFuYWdlcigpOiBJQ29uZmlndXJhdGlvbk1hbmFnZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBBZGFwdGVyTWFuYWdlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWRhcHRlck1hbmFnZXIge1xuXG5cdHByaXZhdGUgZGVidWdnZXJzOiBEZWJ1Z2dlcltdO1xuXHRwcml2YXRlIGFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yaWVzOiBJRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnlbXTtcblx0cHJpdmF0ZSBkZWJ1Z0FkYXB0ZXJGYWN0b3JpZXMgPSBuZXcgTWFwPHN0cmluZywgSURlYnVnQWRhcHRlckZhY3Rvcnk+KCk7XG5cdHByaXZhdGUgZGVidWdnZXJzQXZhaWxhYmxlITogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgZGVidWdFeHRlbnNpb25zQXZhaWxhYmxlITogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVnaXN0ZXJEZWJ1Z2dlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERlYnVnZ2Vyc0V4dFBvaW50UmVhZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIGJyZWFrcG9pbnRDb250cmlidXRpb25zOiBCcmVha3BvaW50c1tdID0gW107XG5cdHByaXZhdGUgZGVidWdnZXJXaGVuS2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHRhc2tMYWJlbHM6IHN0cmluZ1tdID0gW107XG5cblx0LyoqIEV4dGVuc2lvbnMgdGhhdCB3ZXJlIGFscmVhZHkgYWN0aXZlIGJlZm9yZSBhbnkgZGVidWdnZXIgYWN0aXZhdGlvbiBldmVudHMgKi9cblx0cHJpdmF0ZSBlYXJseUFjdGl2YXRlZEV4dGVuc2lvbnM6IFNldDxzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgdXNlZERlYnVnVHlwZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRlbGVnYXRlOiBJQWRhcHRlck1hbmFnZXJEZWxlZ2F0ZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVRhc2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGFza3NTZXJ2aWNlOiBJVGFza1NlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5hZGFwdGVyRGVzY3JpcHRvckZhY3RvcmllcyA9IFtdO1xuXHRcdHRoaXMuZGVidWdnZXJzID0gW107XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKCgpID0+IHtcblx0XHRcdHRoaXMuZGVidWdnZXJzQXZhaWxhYmxlID0gQ09OVEVYVF9ERUJVR0dFUlNfQVZBSUxBQkxFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR0aGlzLmRlYnVnRXh0ZW5zaW9uc0F2YWlsYWJsZSA9IENPTlRFWFRfREVCVUdfRVhURU5TSU9OX0FWQUlMQUJMRS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c1NvbWUodGhpcy5kZWJ1Z2dlcldoZW5LZXlzKSkge1xuXHRcdFx0XHR0aGlzLmRlYnVnZ2Vyc0F2YWlsYWJsZS5zZXQodGhpcy5oYXNFbmFibGVkRGVidWdnZXJzKCkpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZURlYnVnQWRhcHRlclNjaGVtYSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkRGVidWdnZXJzRXh0UG9pbnRSZWFkKCgpID0+IHtcblx0XHRcdHRoaXMuZGVidWdFeHRlbnNpb25zQXZhaWxhYmxlLnNldCh0aGlzLmRlYnVnZ2Vycy5sZW5ndGggPiAwKTtcblx0XHR9KSk7XG5cblx0XHQvLyBnZW5lcm91cyBkZWJvdW5jZSBzaW5jZSB0aGlzIHdpbGwgZW5kIHVwIGNhbGxpbmcgYHJlc29sdmVUYXNrYCBpbnRlcm5hbGx5XG5cdFx0Y29uc3QgdXBkYXRlVGFza1NjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMudXBkYXRlVGFza0xhYmVscygpLCA1MDAwKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkodGFza3NTZXJ2aWNlLm9uRGlkQ2hhbmdlVGFza0NvbmZpZywgdGFza3NTZXJ2aWNlLm9uRGlkQ2hhbmdlVGFza1Byb3ZpZGVycykoKCkgPT4ge1xuXHRcdFx0dXBkYXRlVGFza1NjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdHVwZGF0ZVRhc2tTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5saWZlY3ljbGVTZXJ2aWNlLndoZW4oTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSlcblx0XHRcdC50aGVuKCgpID0+IHRoaXMuZGVidWdFeHRlbnNpb25zQXZhaWxhYmxlLnNldCh0aGlzLmRlYnVnZ2Vycy5sZW5ndGggPiAwKSk7IC8vIElmIG5vIGV4dGVuc2lvbnMgd2l0aCBhIGRlYnVnZ2VyIGNvbnRyaWJ1dGlvbiBhcmUgbG9hZGVkXG5cblx0XHR0aGlzLl9yZWdpc3RlcihkZWxlZ2F0ZS5vbkRpZE5ld1Nlc3Npb24ocyA9PiB7XG5cdFx0XHR0aGlzLnVzZWREZWJ1Z1R5cGVzLmFkZChzLmNvbmZpZ3VyYXRpb24udHlwZSk7XG5cdFx0fSkpO1xuXG5cdFx0dXBkYXRlVGFza1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHRkZWJ1Z2dlcnNFeHRQb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zLCBkZWx0YSkgPT4ge1xuXHRcdFx0ZGVsdGEuYWRkZWQuZm9yRWFjaChhZGRlZCA9PiB7XG5cdFx0XHRcdGFkZGVkLnZhbHVlLmZvckVhY2gocmF3QWRhcHRlciA9PiB7XG5cdFx0XHRcdFx0aWYgKCFyYXdBZGFwdGVyLnR5cGUgfHwgKHR5cGVvZiByYXdBZGFwdGVyLnR5cGUgIT09ICdzdHJpbmcnKSkge1xuXHRcdFx0XHRcdFx0YWRkZWQuY29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnZGVidWdOb1R5cGUnLCBcIkRlYnVnZ2VyICd0eXBlJyBjYW4gbm90IGJlIG9taXR0ZWQgYW5kIG11c3QgYmUgb2YgdHlwZSAnc3RyaW5nJy5cIikpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChyYXdBZGFwdGVyLnR5cGUgIT09ICcqJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLmdldERlYnVnZ2VyKHJhd0FkYXB0ZXIudHlwZSk7XG5cdFx0XHRcdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0XHRcdFx0ZXhpc3RpbmcubWVyZ2UocmF3QWRhcHRlciwgYWRkZWQuZGVzY3JpcHRpb24pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZGJnID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWJ1Z2dlciwgdGhpcywgcmF3QWRhcHRlciwgYWRkZWQuZGVzY3JpcHRpb24pO1xuXHRcdFx0XHRcdFx0XHRkYmcud2hlbj8ua2V5cygpLmZvckVhY2goa2V5ID0+IHRoaXMuZGVidWdnZXJXaGVuS2V5cy5hZGQoa2V5KSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZGVidWdnZXJzLnB1c2goZGJnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIHRha2UgY2FyZSBvZiBhbGwgd2lsZGNhcmQgY29udHJpYnV0aW9uc1xuXHRcdFx0ZXh0ZW5zaW9ucy5mb3JFYWNoKGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRcdGV4dGVuc2lvbi52YWx1ZS5mb3JFYWNoKHJhd0FkYXB0ZXIgPT4ge1xuXHRcdFx0XHRcdGlmIChyYXdBZGFwdGVyLnR5cGUgPT09ICcqJykge1xuXHRcdFx0XHRcdFx0dGhpcy5kZWJ1Z2dlcnMuZm9yRWFjaChkYmcgPT4gZGJnLm1lcmdlKHJhd0FkYXB0ZXIsIGV4dGVuc2lvbi5kZXNjcmlwdGlvbikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0ZGVsdGEucmVtb3ZlZC5mb3JFYWNoKHJlbW92ZWQgPT4ge1xuXHRcdFx0XHRjb25zdCByZW1vdmVkVHlwZXMgPSByZW1vdmVkLnZhbHVlLm1hcChyYXdBZGFwdGVyID0+IHJhd0FkYXB0ZXIudHlwZSk7XG5cdFx0XHRcdHRoaXMuZGVidWdnZXJzID0gdGhpcy5kZWJ1Z2dlcnMuZmlsdGVyKGQgPT4gcmVtb3ZlZFR5cGVzLmluZGV4T2YoZC50eXBlKSA9PT0gLTEpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMudXBkYXRlRGVidWdBZGFwdGVyU2NoZW1hKCk7XG5cdFx0XHR0aGlzLl9vbkRpZERlYnVnZ2Vyc0V4dFBvaW50UmVhZC5maXJlKCk7XG5cdFx0fSk7XG5cblx0XHRicmVha3BvaW50c0V4dFBvaW50LnNldEhhbmRsZXIoZXh0ZW5zaW9ucyA9PiB7XG5cdFx0XHR0aGlzLmJyZWFrcG9pbnRDb250cmlidXRpb25zID0gZXh0ZW5zaW9ucy5mbGF0TWFwKGV4dCA9PiBleHQudmFsdWUubWFwKGJyZWFrcG9pbnQgPT4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCcmVha3BvaW50cywgYnJlYWtwb2ludCkpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGFza0xhYmVscygpIHtcblx0XHR0aGlzLnRhc2tzU2VydmljZS5nZXRLbm93blRhc2tzKCkudGhlbih0YXNrcyA9PiB7XG5cdFx0XHR0aGlzLnRhc2tMYWJlbHMgPSB0YXNrcy5tYXAodGFzayA9PiB0YXNrLl9sYWJlbCk7XG5cdFx0XHR0aGlzLnVwZGF0ZURlYnVnQWRhcHRlclNjaGVtYSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVEZWJ1Z0FkYXB0ZXJTY2hlbWEoKSB7XG5cdFx0Ly8gdXBkYXRlIHRoZSBzY2hlbWEgdG8gaW5jbHVkZSBhbGwgYXR0cmlidXRlcywgc25pcHBldHMgYW5kIHR5cGVzIGZyb20gZXh0ZW5zaW9ucy5cblx0XHRjb25zdCBpdGVtcyA9ICg8SUpTT05TY2hlbWE+bGF1bmNoU2NoZW1hLnByb3BlcnRpZXMhWydjb25maWd1cmF0aW9ucyddLml0ZW1zKTtcblx0XHRjb25zdCB0YXNrU2NoZW1hID0gVGFza0RlZmluaXRpb25SZWdpc3RyeS5nZXRKc29uU2NoZW1hKCk7XG5cdFx0Y29uc3QgZGVmaW5pdGlvbnM6IElKU09OU2NoZW1hTWFwID0ge1xuXHRcdFx0J2NvbW1vbic6IHtcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdCduYW1lJzoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdkZWJ1Z05hbWUnLCBcIk5hbWUgb2YgY29uZmlndXJhdGlvbjsgYXBwZWFycyBpbiB0aGUgbGF1bmNoIGNvbmZpZ3VyYXRpb24gZHJvcGRvd24gbWVudS5cIiksXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAnTGF1bmNoJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J2RlYnVnU2VydmVyJzoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdkZWJ1Z1NlcnZlcicsIFwiRm9yIGRlYnVnIGV4dGVuc2lvbiBkZXZlbG9wbWVudCBvbmx5OiBpZiBhIHBvcnQgaXMgc3BlY2lmaWVkIFZTIENvZGUgdHJpZXMgdG8gY29ubmVjdCB0byBhIGRlYnVnIGFkYXB0ZXIgcnVubmluZyBpbiBzZXJ2ZXIgbW9kZVwiKSxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IDQ3MTFcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdwcmVMYXVuY2hUYXNrJzoge1xuXHRcdFx0XHRcdFx0YW55T2Y6IFt0YXNrU2NoZW1hLCB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IFsnc3RyaW5nJ11cblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgdGFzazogJycsIHR5cGU6ICcnIH0gfV0sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdkZWJ1Z1ByZWxhdW5jaFRhc2snLCBcIlRhc2sgdG8gcnVuIGJlZm9yZSBkZWJ1ZyBzZXNzaW9uIHN0YXJ0cy5cIiksXG5cdFx0XHRcdFx0XHRleGFtcGxlczogdGhpcy50YXNrTGFiZWxzLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J3Bvc3REZWJ1Z1Rhc2snOiB7XG5cdFx0XHRcdFx0XHRhbnlPZjogW3Rhc2tTY2hlbWEsIHtcblx0XHRcdFx0XHRcdFx0dHlwZTogWydzdHJpbmcnXSxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgdGFzazogJycsIHR5cGU6ICcnIH0gfV0sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdkZWJ1Z1Bvc3REZWJ1Z1Rhc2snLCBcIlRhc2sgdG8gcnVuIGFmdGVyIGRlYnVnIHNlc3Npb24gZW5kcy5cIiksXG5cdFx0XHRcdFx0XHRleGFtcGxlczogdGhpcy50YXNrTGFiZWxzLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J3ByZXNlbnRhdGlvbic6IHByZXNlbnRhdGlvblNjaGVtYSxcblx0XHRcdFx0XHQnaW50ZXJuYWxDb25zb2xlT3B0aW9ucyc6IElOVEVSTkFMX0NPTlNPTEVfT1BUSU9OU19TQ0hFTUEsXG5cdFx0XHRcdFx0J3N1cHByZXNzTXVsdGlwbGVTZXNzaW9uV2FybmluZyc6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3N1cHByZXNzTXVsdGlwbGVTZXNzaW9uV2FybmluZycsIFwiRGlzYWJsZSB0aGUgd2FybmluZyB3aGVuIHRyeWluZyB0byBzdGFydCB0aGUgc2FtZSBkZWJ1ZyBjb25maWd1cmF0aW9uIG1vcmUgdGhhbiBvbmNlLlwiKSxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdGxhdW5jaFNjaGVtYS5kZWZpbml0aW9ucyA9IGRlZmluaXRpb25zO1xuXHRcdGl0ZW1zLm9uZU9mID0gW107XG5cdFx0aXRlbXMuZGVmYXVsdFNuaXBwZXRzID0gW107XG5cdFx0dGhpcy5kZWJ1Z2dlcnMuZm9yRWFjaChhZGFwdGVyID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYUF0dHJpYnV0ZXMgPSBhZGFwdGVyLmdldFNjaGVtYUF0dHJpYnV0ZXMoZGVmaW5pdGlvbnMpO1xuXHRcdFx0aWYgKHNjaGVtYUF0dHJpYnV0ZXMgJiYgaXRlbXMub25lT2YpIHtcblx0XHRcdFx0aXRlbXMub25lT2YucHVzaCguLi5zY2hlbWFBdHRyaWJ1dGVzKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TbmlwcGV0cyA9IGFkYXB0ZXIuY29uZmlndXJhdGlvblNuaXBwZXRzO1xuXHRcdFx0aWYgKGNvbmZpZ3VyYXRpb25TbmlwcGV0cyAmJiBpdGVtcy5kZWZhdWx0U25pcHBldHMpIHtcblx0XHRcdFx0aXRlbXMuZGVmYXVsdFNuaXBwZXRzLnB1c2goLi4uY29uZmlndXJhdGlvblNuaXBwZXRzKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRqc29uUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEobGF1bmNoU2NoZW1hSWQsIGxhdW5jaFNjaGVtYSk7XG5cdH1cblxuXHRyZWdpc3RlckRlYnVnQWRhcHRlckZhY3RvcnkoZGVidWdUeXBlczogc3RyaW5nW10sIGRlYnVnQWRhcHRlckxhdW5jaGVyOiBJRGVidWdBZGFwdGVyRmFjdG9yeSk6IElEaXNwb3NhYmxlIHtcblx0XHRkZWJ1Z1R5cGVzLmZvckVhY2goZGVidWdUeXBlID0+IHRoaXMuZGVidWdBZGFwdGVyRmFjdG9yaWVzLnNldChkZWJ1Z1R5cGUsIGRlYnVnQWRhcHRlckxhdW5jaGVyKSk7XG5cdFx0dGhpcy5kZWJ1Z2dlcnNBdmFpbGFibGUuc2V0KHRoaXMuaGFzRW5hYmxlZERlYnVnZ2VycygpKTtcblx0XHR0aGlzLl9vbkRpZFJlZ2lzdGVyRGVidWdnZXIuZmlyZSgpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0ZGVidWdUeXBlcy5mb3JFYWNoKGRlYnVnVHlwZSA9PiB0aGlzLmRlYnVnQWRhcHRlckZhY3Rvcmllcy5kZWxldGUoZGVidWdUeXBlKSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGhhc0VuYWJsZWREZWJ1Z2dlcnMoKTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCBbdHlwZV0gb2YgdGhpcy5kZWJ1Z0FkYXB0ZXJGYWN0b3JpZXMpIHtcblx0XHRcdGNvbnN0IGRiZyA9IHRoaXMuZ2V0RGVidWdnZXIodHlwZSk7XG5cdFx0XHRpZiAoZGJnICYmIGRiZy5lbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNyZWF0ZURlYnVnQWRhcHRlcihzZXNzaW9uOiBJRGVidWdTZXNzaW9uKTogSURlYnVnQWRhcHRlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZmFjdG9yeSA9IHRoaXMuZGVidWdBZGFwdGVyRmFjdG9yaWVzLmdldChzZXNzaW9uLmNvbmZpZ3VyYXRpb24udHlwZSk7XG5cdFx0aWYgKGZhY3RvcnkpIHtcblx0XHRcdHJldHVybiBmYWN0b3J5LmNyZWF0ZURlYnVnQWRhcHRlcihzZXNzaW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHN1YnN0aXR1dGVWYXJpYWJsZXMoZGVidWdUeXBlOiBzdHJpbmcsIGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCwgY29uZmlnOiBJQ29uZmlnKTogUHJvbWlzZTxJQ29uZmlnPiB7XG5cdFx0Y29uc3QgZmFjdG9yeSA9IHRoaXMuZGVidWdBZGFwdGVyRmFjdG9yaWVzLmdldChkZWJ1Z1R5cGUpO1xuXHRcdGlmIChmYWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4gZmFjdG9yeS5zdWJzdGl0dXRlVmFyaWFibGVzKGZvbGRlciwgY29uZmlnKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShjb25maWcpO1xuXHR9XG5cblx0cnVuSW5UZXJtaW5hbChkZWJ1Z1R5cGU6IHN0cmluZywgYXJnczogRGVidWdQcm90b2NvbC5SdW5JblRlcm1pbmFsUmVxdWVzdEFyZ3VtZW50cywgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGZhY3RvcnkgPSB0aGlzLmRlYnVnQWRhcHRlckZhY3Rvcmllcy5nZXQoZGVidWdUeXBlKTtcblx0XHRpZiAoZmFjdG9yeSkge1xuXHRcdFx0cmV0dXJuIGZhY3RvcnkucnVuSW5UZXJtaW5hbChhcmdzLCBzZXNzaW9uSWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHZvaWQgMCk7XG5cdH1cblxuXHRyZWdpc3RlckRlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5KGRlYnVnQWRhcHRlclByb3ZpZGVyOiBJRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5hZGFwdGVyRGVzY3JpcHRvckZhY3Rvcmllcy5wdXNoKGRlYnVnQWRhcHRlclByb3ZpZGVyKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnVucmVnaXN0ZXJEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeShkZWJ1Z0FkYXB0ZXJQcm92aWRlcik7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHVucmVnaXN0ZXJEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeShkZWJ1Z0FkYXB0ZXJQcm92aWRlcjogSURlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5KTogdm9pZCB7XG5cdFx0Y29uc3QgaXggPSB0aGlzLmFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yaWVzLmluZGV4T2YoZGVidWdBZGFwdGVyUHJvdmlkZXIpO1xuXHRcdGlmIChpeCA+PSAwKSB7XG5cdFx0XHR0aGlzLmFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yaWVzLnNwbGljZShpeCwgMSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0RGVidWdBZGFwdGVyRGVzY3JpcHRvcihzZXNzaW9uOiBJRGVidWdTZXNzaW9uKTogUHJvbWlzZTxJQWRhcHRlckRlc2NyaXB0b3IgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb25maWcgPSBzZXNzaW9uLmNvbmZpZ3VyYXRpb247XG5cdFx0Y29uc3QgcHJvdmlkZXJzID0gdGhpcy5hZGFwdGVyRGVzY3JpcHRvckZhY3Rvcmllcy5maWx0ZXIocCA9PiBwLnR5cGUgPT09IGNvbmZpZy50eXBlICYmIHAuY3JlYXRlRGVidWdBZGFwdGVyRGVzY3JpcHRvcik7XG5cdFx0aWYgKHByb3ZpZGVycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiBwcm92aWRlcnNbMF0uY3JlYXRlRGVidWdBZGFwdGVyRGVzY3JpcHRvcihzZXNzaW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVE9ET0BBVyBoYW5kbGUgbiA+IDEgY2FzZVxuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRnZXREZWJ1Z2dlckxhYmVsKHR5cGU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZGJnciA9IHRoaXMuZ2V0RGVidWdnZXIodHlwZSk7XG5cdFx0aWYgKGRiZ3IpIHtcblx0XHRcdHJldHVybiBkYmdyLmxhYmVsO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgb25EaWRSZWdpc3RlckRlYnVnZ2VyKCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRSZWdpc3RlckRlYnVnZ2VyLmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRGlkRGVidWdnZXJzRXh0UG9pbnRSZWFkKCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWREZWJ1Z2dlcnNFeHRQb2ludFJlYWQuZXZlbnQ7XG5cdH1cblxuXHRjYW5TZXRCcmVha3BvaW50c0luKG1vZGVsOiBJVGV4dE1vZGVsKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IG1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRpZiAoIWxhbmd1YWdlSWQgfHwgbGFuZ3VhZ2VJZCA9PT0gJ2pzb25jJyB8fCBsYW5ndWFnZUlkID09PSAnbG9nJykge1xuXHRcdFx0Ly8gZG8gbm90IGFsbG93IGJyZWFrcG9pbnRzIGluIG91ciBzZXR0aW5ncyBmaWxlcyBhbmQgb3V0cHV0XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLmFsbG93QnJlYWtwb2ludHNFdmVyeXdoZXJlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5icmVha3BvaW50Q29udHJpYnV0aW9ucy5zb21lKGJyZWFrcG9pbnRzID0+IGJyZWFrcG9pbnRzLmxhbmd1YWdlID09PSBsYW5ndWFnZUlkICYmIGJyZWFrcG9pbnRzLmVuYWJsZWQpO1xuXHR9XG5cblx0Z2V0RGVidWdnZXIodHlwZTogc3RyaW5nKTogRGVidWdnZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmRlYnVnZ2Vycy5maW5kKGRiZyA9PiBzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UoZGJnLnR5cGUsIHR5cGUpKTtcblx0fVxuXG5cdGdldEVuYWJsZWREZWJ1Z2dlcih0eXBlOiBzdHJpbmcpOiBEZWJ1Z2dlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWRhcHRlciA9IHRoaXMuZ2V0RGVidWdnZXIodHlwZSk7XG5cdFx0cmV0dXJuIGFkYXB0ZXIgJiYgYWRhcHRlci5lbmFibGVkID8gYWRhcHRlciA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHNvbWVEZWJ1Z2dlckludGVyZXN0ZWRJbkxhbmd1YWdlKGxhbmd1YWdlSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuZGVidWdnZXJzXG5cdFx0XHQuZmlsdGVyKGQgPT4gZC5lbmFibGVkKVxuXHRcdFx0LmZpbmQoYSA9PiBhLmludGVyZXN0ZWRJbkxhbmd1YWdlKGxhbmd1YWdlSWQpKTtcblx0fVxuXG5cdGFzeW5jIGd1ZXNzRGVidWdnZXIoZ2V0dGluZ0NvbmZpZ3VyYXRpb25zOiBib29sZWFuKTogUHJvbWlzZTxJR3Vlc3NlZERlYnVnZ2VyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdFx0bGV0IGNhbmRpZGF0ZXM6IERlYnVnZ2VyW10gPSBbXTtcblx0XHRsZXQgbGFuZ3VhZ2VMYWJlbDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IG1vZGVsOiBJRWRpdG9yTW9kZWwgfCBudWxsID0gbnVsbDtcblx0XHRpZiAoaXNDb2RlRWRpdG9yKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSkge1xuXHRcdFx0bW9kZWwgPSBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5nZXRNb2RlbCgpO1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2UgPSBtb2RlbCA/IG1vZGVsLmdldExhbmd1YWdlSWQoKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChsYW5ndWFnZSkge1xuXHRcdFx0XHRsYW5ndWFnZUxhYmVsID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VOYW1lKGxhbmd1YWdlKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFkYXB0ZXJzID0gdGhpcy5kZWJ1Z2dlcnNcblx0XHRcdFx0LmZpbHRlcihhID0+IGEuZW5hYmxlZClcblx0XHRcdFx0LmZpbHRlcihhID0+IGxhbmd1YWdlICYmIGEuaW50ZXJlc3RlZEluTGFuZ3VhZ2UobGFuZ3VhZ2UpKTtcblx0XHRcdGlmIChhZGFwdGVycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIHsgZGVidWdnZXI6IGFkYXB0ZXJzWzBdIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoYWRhcHRlcnMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRjYW5kaWRhdGVzID0gYWRhcHRlcnM7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV2Ugd2FudCB0byBnZXQgdGhlIGRlYnVnZ2VycyB0aGF0IGhhdmUgY29uZmlndXJhdGlvbiBwcm92aWRlcnMgaW4gdGhlIGNhc2Ugd2UgYXJlIGZldGNoaW5nIGNvbmZpZ3VyYXRpb25zXG5cdFx0Ly8gT3IgaWYgYSBicmVha3BvaW50IGNhbiBiZSBzZXQgaW4gdGhlIGN1cnJlbnQgZmlsZSAoZ29vZCBoaW50IHRoYXQgYW4gZXh0ZW5zaW9uIGNhbiBoYW5kbGUgaXQpXG5cdFx0aWYgKCghbGFuZ3VhZ2VMYWJlbCB8fCBnZXR0aW5nQ29uZmlndXJhdGlvbnMgfHwgKG1vZGVsICYmIHRoaXMuY2FuU2V0QnJlYWtwb2ludHNJbihtb2RlbCkpKSAmJiBjYW5kaWRhdGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0YXdhaXQgdGhpcy5hY3RpdmF0ZURlYnVnZ2Vycygnb25EZWJ1Z0luaXRpYWxDb25maWd1cmF0aW9ucycpO1xuXG5cdFx0XHRjYW5kaWRhdGVzID0gdGhpcy5kZWJ1Z2dlcnNcblx0XHRcdFx0LmZpbHRlcihhID0+IGEuZW5hYmxlZClcblx0XHRcdFx0LmZpbHRlcihkYmcgPT4gZGJnLmhhc0luaXRpYWxDb25maWd1cmF0aW9uKCkgfHwgZGJnLmhhc0R5bmFtaWNDb25maWd1cmF0aW9uUHJvdmlkZXJzKCkgfHwgZGJnLmhhc0NvbmZpZ3VyYXRpb25Qcm92aWRlcigpKTtcblx0XHR9XG5cblx0XHRpZiAoY2FuZGlkYXRlcy5sZW5ndGggPT09IDAgJiYgbGFuZ3VhZ2VMYWJlbCkge1xuXHRcdFx0aWYgKGxhbmd1YWdlTGFiZWwuaW5kZXhPZignICcpID49IDApIHtcblx0XHRcdFx0bGFuZ3VhZ2VMYWJlbCA9IGAnJHtsYW5ndWFnZUxhYmVsfSdgO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdDb3VsZE5vdEZpbmRMYW5ndWFnZScsIFwiWW91IGRvbid0IGhhdmUgYW4gZXh0ZW5zaW9uIGZvciBkZWJ1Z2dpbmcgezB9LiBTaG91bGQgd2UgZmluZCBhIHswfSBleHRlbnNpb24gaW4gdGhlIE1hcmtldHBsYWNlP1wiLCBsYW5ndWFnZUxhYmVsKSxcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbmxzLmxvY2FsaXplKHsga2V5OiAnZmluZEV4dGVuc2lvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkZpbmQgezB9IGV4dGVuc2lvblwiLCBsYW5ndWFnZUxhYmVsKVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoY29uZmlybWVkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2RlYnVnLmluc3RhbGxBZGRpdGlvbmFsRGVidWdnZXJzJywgbGFuZ3VhZ2VMYWJlbCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5pdEV4dGVuc2lvbkFjdGl2YXRpb25zSWZOZWVkZWQoKTtcblxuXHRcdGNhbmRpZGF0ZXMuc29ydCgoZmlyc3QsIHNlY29uZCkgPT4gZmlyc3QubGFiZWwubG9jYWxlQ29tcGFyZShzZWNvbmQubGFiZWwpKTtcblx0XHRjYW5kaWRhdGVzID0gY2FuZGlkYXRlcy5maWx0ZXIoYSA9PiAhYS5pc0hpZGRlbkZyb21Ecm9wZG93bik7XG5cblx0XHRjb25zdCBzdWdnZXN0ZWRDYW5kaWRhdGVzOiBEZWJ1Z2dlcltdID0gW107XG5cdFx0Y29uc3Qgb3RoZXJDYW5kaWRhdGVzOiBEZWJ1Z2dlcltdID0gW107XG5cdFx0Y2FuZGlkYXRlcy5mb3JFYWNoKGQgPT4ge1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRvciA9IGQuZ2V0TWFpbkV4dGVuc2lvbkRlc2NyaXB0b3IoKTtcblx0XHRcdGlmIChkZXNjcmlwdG9yLmlkICYmICEhdGhpcy5lYXJseUFjdGl2YXRlZEV4dGVuc2lvbnM/LmhhcyhkZXNjcmlwdG9yLmlkKSkge1xuXHRcdFx0XHQvLyBXYXMgYWN0aXZhdGVkIGVhcmx5XG5cdFx0XHRcdHN1Z2dlc3RlZENhbmRpZGF0ZXMucHVzaChkKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy51c2VkRGVidWdUeXBlcy5oYXMoZC50eXBlKSkge1xuXHRcdFx0XHQvLyBXYXMgdXNlZCBhbHJlYWR5XG5cdFx0XHRcdHN1Z2dlc3RlZENhbmRpZGF0ZXMucHVzaChkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG90aGVyQ2FuZGlkYXRlcy5wdXNoKGQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcGlja3M6ICh7IGxhYmVsOiBzdHJpbmc7IHBpY2s/OiAoKSA9PiBJR3Vlc3NlZERlYnVnZ2VyIHwgUHJvbWlzZTxJR3Vlc3NlZERlYnVnZ2VyIHwgdW5kZWZpbmVkPjsgdHlwZT86IHN0cmluZyB9IHwgTWVudUl0ZW1BY3Rpb24pW10gPSBbXTtcblx0XHRjb25zdCBkeW5hbWljID0gYXdhaXQgdGhpcy5kZWxlZ2F0ZS5jb25maWd1cmF0aW9uTWFuYWdlcigpLmdldER5bmFtaWNQcm92aWRlcnMoKTtcblx0XHRpZiAoc3VnZ2VzdGVkQ2FuZGlkYXRlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRwaWNrcy5wdXNoKFxuXHRcdFx0XHR7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbmxzLmxvY2FsaXplKCdzdWdnZXN0ZWREZWJ1Z2dlcnMnLCBcIlN1Z2dlc3RlZFwiKSB9LFxuXHRcdFx0XHQuLi5zdWdnZXN0ZWRDYW5kaWRhdGVzLm1hcChjID0+ICh7IGxhYmVsOiBjLmxhYmVsLCBwaWNrOiAoKSA9PiAoeyBkZWJ1Z2dlcjogYyB9KSB9KSkpO1xuXHRcdH1cblxuXHRcdGlmIChvdGhlckNhbmRpZGF0ZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKHBpY2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogJycgfSk7XG5cdFx0XHR9XG5cblx0XHRcdHBpY2tzLnB1c2goLi4ub3RoZXJDYW5kaWRhdGVzLm1hcChjID0+ICh7IGxhYmVsOiBjLmxhYmVsLCBwaWNrOiAoKSA9PiAoeyBkZWJ1Z2dlcjogYyB9KSB9KSkpO1xuXHRcdH1cblxuXHRcdGlmIChkeW5hbWljLmxlbmd0aCkge1xuXHRcdFx0aWYgKHBpY2tzLmxlbmd0aCkge1xuXHRcdFx0XHRwaWNrcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiAnJyB9KTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBkIG9mIGR5bmFtaWMpIHtcblx0XHRcdFx0cGlja3MucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnbW9yZU9wdGlvbnNGb3JEZWJ1Z1R5cGUnLCBcIk1vcmUgezB9IG9wdGlvbnMuLi5cIiwgZC5sYWJlbCksXG5cdFx0XHRcdFx0cGljazogYXN5bmMgKCk6IFByb21pc2U8SUd1ZXNzZWREZWJ1Z2dlciB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2ZnID0gYXdhaXQgZC5waWNrKCk7XG5cdFx0XHRcdFx0XHRpZiAoIWNmZykgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdFx0XHRyZXR1cm4gY2ZnICYmIHsgZGVidWdnZXI6IHRoaXMuZ2V0RGVidWdnZXIoZC50eXBlKSEsIHdpdGhDb25maWc6IGNmZyB9O1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHBpY2tzLnB1c2goXG5cdFx0XHR7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogJycgfSxcblx0XHRcdHsgbGFiZWw6IGxhbmd1YWdlTGFiZWwgPyBubHMubG9jYWxpemUoJ2luc3RhbGxMYW5ndWFnZScsIFwiSW5zdGFsbCBhbiBleHRlbnNpb24gZm9yIHswfS4uLlwiLCBsYW5ndWFnZUxhYmVsKSA6IG5scy5sb2NhbGl6ZSgnaW5zdGFsbEV4dCcsIFwiSW5zdGFsbCBleHRlbnNpb24uLi5cIikgfVxuXHRcdCk7XG5cblx0XHRjb25zdCBjb250cmlidXRlZCA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLkRlYnVnQ3JlYXRlQ29uZmlndXJhdGlvbiwgdGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBbLCBhY3Rpb25dIG9mIGNvbnRyaWJ1dGVkKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgYWN0aW9uKSB7XG5cdFx0XHRcdHBpY2tzLnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGxhY2VIb2xkZXIgPSBubHMubG9jYWxpemUoJ3NlbGVjdERlYnVnJywgXCJTZWxlY3QgZGVidWdnZXJcIik7XG5cdFx0cmV0dXJuIHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljazx7IGxhYmVsOiBzdHJpbmc7IGRlYnVnZ2VyPzogRGVidWdnZXIgfSB8IElRdWlja1BpY2tJdGVtPihwaWNrcywgeyBhY3RpdmVJdGVtOiBwaWNrc1swXSwgcGxhY2VIb2xkZXIgfSkudGhlbihhc3luYyBwaWNrZWQgPT4ge1xuXHRcdFx0aWYgKHBpY2tlZCAmJiAncGljaycgaW4gcGlja2VkICYmIHR5cGVvZiBwaWNrZWQucGljayA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgcGlja2VkLnBpY2soKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHBpY2tlZCBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdHBpY2tlZC5ydW4oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocGlja2VkKSB7XG5cdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2RlYnVnLmluc3RhbGxBZGRpdGlvbmFsRGVidWdnZXJzJywgbGFuZ3VhZ2VMYWJlbCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGluaXRFeHRlbnNpb25BY3RpdmF0aW9uc0lmTmVlZGVkKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lYXJseUFjdGl2YXRlZEV4dGVuc2lvbnMpIHtcblx0XHRcdHRoaXMuZWFybHlBY3RpdmF0ZWRFeHRlbnNpb25zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHRcdGNvbnN0IHN0YXR1cyA9IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb25zU3RhdHVzKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIGluIHN0YXR1cykge1xuXHRcdFx0XHRpZiAoISFzdGF0dXNbaWRdLmFjdGl2YXRpb25UaW1lcykge1xuXHRcdFx0XHRcdHRoaXMuZWFybHlBY3RpdmF0ZWRFeHRlbnNpb25zLmFkZChpZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBhY3RpdmF0ZURlYnVnZ2VycyhhY3RpdmF0aW9uRXZlbnQ6IHN0cmluZywgZGVidWdUeXBlPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5pbml0RXh0ZW5zaW9uQWN0aXZhdGlvbnNJZk5lZWRlZCgpO1xuXG5cdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8YW55PltdID0gW1xuXHRcdFx0dGhpcy5leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChhY3RpdmF0aW9uRXZlbnQpLFxuXHRcdFx0dGhpcy5leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudCgnb25EZWJ1ZycpXG5cdFx0XTtcblx0XHRpZiAoZGVidWdUeXBlKSB7XG5cdFx0XHRwcm9taXNlcy5wdXNoKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYCR7YWN0aXZhdGlvbkV2ZW50fToke2RlYnVnVHlwZX1gKSk7XG5cdFx0fVxuXHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFNBQVMsYUFBYTtBQUUvQixTQUFTLGtCQUErQjtBQUN4QyxPQUFPLGNBQWM7QUFDckIsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsd0JBQXdCO0FBRWpDLFlBQVksU0FBUztBQUNyQixTQUFTLGNBQWMsUUFBUSxzQkFBc0I7QUFDckQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsY0FBYyxzQkFBaUQ7QUFDeEUsU0FBUywwQkFBMEM7QUFDbkQsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw2QkFBNkIsbUNBQW1PLHVDQUF1QztBQUNoVCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQixtQkFBbUIsY0FBYywwQkFBMEI7QUFDekYsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxvQkFBb0I7QUFDN0Is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
