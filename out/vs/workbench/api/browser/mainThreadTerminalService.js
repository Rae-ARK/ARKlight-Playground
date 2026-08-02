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
import { DisposableStore, Disposable, MutableDisposable, combinedDisposable, DisposableMap } from "../../../base/common/lifecycle.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { URI } from "../../../base/common/uri.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ProcessPropertyType, TerminalExitReason, TerminalLocation } from "../../../platform/terminal/common/terminal.js";
import { TerminalDataBufferer } from "../../../platform/terminal/common/terminalDataBuffering.js";
import { ITerminalEditorService, ITerminalGroupService, ITerminalService } from "../../contrib/terminal/browser/terminal.js";
import { TerminalProcessExtHostProxy } from "../../contrib/terminal/browser/terminalProcessExtHostProxy.js";
import { IEnvironmentVariableService } from "../../contrib/terminal/common/environmentVariable.js";
import { deserializeEnvironmentDescriptionMap, deserializeEnvironmentVariableCollection, serializeEnvironmentVariableCollection } from "../../../platform/terminal/common/environmentVariableShared.js";
import { ITerminalProfileResolverService, ITerminalProfileService } from "../../contrib/terminal/common/terminal.js";
import { IRemoteAgentService } from "../../services/remote/common/remoteAgentService.js";
import { OS } from "../../../base/common/platform.js";
import { Promises } from "../../../base/common/async.js";
import { ITerminalLinkProviderService } from "../../contrib/terminalContrib/links/browser/links.js";
import { ITerminalQuickFixService, TerminalQuickFixType } from "../../contrib/terminalContrib/quickFix/browser/quickFix.js";
import { TerminalCapability } from "../../../platform/terminal/common/capabilities/capabilities.js";
import { ITerminalCompletionService } from "../../contrib/terminalContrib/suggest/browser/terminalCompletionService.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { hasKey } from "../../../base/common/types.js";
let MainThreadTerminalService = class extends Disposable {
  constructor(_extHostContext, _terminalService, _terminalLinkProviderService, _terminalQuickFixService, _instantiationService, _environmentVariableService, _logService, _terminalProfileResolverService, remoteAgentService, _terminalGroupService, _terminalEditorService, _terminalProfileService, _terminalCompletionService, _environmentService) {
    super();
    this._terminalService = _terminalService;
    this._terminalLinkProviderService = _terminalLinkProviderService;
    this._terminalQuickFixService = _terminalQuickFixService;
    this._instantiationService = _instantiationService;
    this._environmentVariableService = _environmentVariableService;
    this._logService = _logService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._terminalGroupService = _terminalGroupService;
    this._terminalEditorService = _terminalEditorService;
    this._terminalProfileService = _terminalProfileService;
    this._terminalCompletionService = _terminalCompletionService;
    this._environmentService = _environmentService;
    /**
     * Stores a map from a temporary terminal id (a UUID generated on the extension host side)
     * to a numeric terminal id (an id generated on the renderer side)
     * This comes in play only when dealing with terminals created on the extension host side
     */
    this._extHostTerminals = /* @__PURE__ */ new Map();
    this._terminalProcessProxies = this._register(new DisposableMap());
    this._profileProviders = this._register(new DisposableMap());
    this._completionProviders = this._register(new DisposableMap());
    this._quickFixProviders = this._register(new DisposableMap());
    this._dataEventTracker = this._register(new MutableDisposable());
    this._sendCommandEventListener = this._register(new MutableDisposable());
    /**
     * A single shared terminal link provider for the exthost. When an ext registers a link
     * provider, this is registered with the terminal on the renderer side and all links are
     * provided through this, even from multiple ext link providers. Xterm should remove lower
     * priority intersecting links itself.
     */
    this._linkProvider = this._register(new MutableDisposable());
    this._os = OS;
    this._proxy = _extHostContext.getProxy(ExtHostContext.ExtHostTerminalService);
    this._register(_terminalService.onDidCreateInstance((instance) => {
      this._onTerminalOpened(instance);
      this._onInstanceDimensionsChanged(instance);
    }));
    this._register(_terminalService.onDidDisposeInstance((instance) => this._onTerminalDisposed(instance)));
    this._register(_terminalService.onAnyInstanceProcessIdReady((instance) => this._onTerminalProcessIdReady(instance)));
    this._register(_terminalService.onDidChangeInstanceDimensions((instance) => this._onInstanceDimensionsChanged(instance)));
    this._register(_terminalService.onAnyInstanceMaximumDimensionsChange((instance) => this._onInstanceMaximumDimensionsChanged(instance)));
    this._register(_terminalService.onDidRequestStartExtensionTerminal((e) => this._onRequestStartExtensionTerminal(e)));
    this._register(_terminalService.onDidChangeActiveInstance((instance) => this._onActiveTerminalChanged(instance ? instance.instanceId : null)));
    this._register(_terminalService.onAnyInstanceTitleChange((instance) => instance && this._onTitleChanged(instance.instanceId, instance.title)));
    this._register(_terminalService.onAnyInstanceDataInput((instance) => this._proxy.$acceptTerminalInteraction(instance.instanceId)));
    this._register(_terminalService.onAnyInstanceSelectionChange((instance) => this._proxy.$acceptTerminalSelection(instance.instanceId, instance.selection)));
    this._register(_terminalService.onAnyInstanceShellTypeChanged((instance) => this._onShellTypeChanged(instance.instanceId)));
    for (const instance of this._terminalService.instances) {
      this._onTerminalOpened(instance);
      instance.processReady.then(() => this._onTerminalProcessIdReady(instance));
      if (instance.shellType) {
        this._proxy.$acceptTerminalShellType(instance.instanceId, instance.shellType);
      }
    }
    const activeInstance = this._terminalService.activeInstance;
    if (activeInstance) {
      this._proxy.$acceptActiveTerminalChanged(activeInstance.instanceId);
    }
    if (this._environmentVariableService.collections.size > 0) {
      const collectionAsArray = [...this._environmentVariableService.collections.entries()];
      const serializedCollections = collectionAsArray.map((e) => {
        return [e[0], serializeEnvironmentVariableCollection(e[1].map)];
      });
      this._proxy.$initEnvironmentVariableCollections(serializedCollections);
    }
    remoteAgentService.getEnvironment().then(async (env) => {
      this._os = env?.os || OS;
      this._updateDefaultProfile();
    });
    this._register(this._terminalProfileService.onDidChangeAvailableProfiles(() => this._updateDefaultProfile()));
  }
  async _updateDefaultProfile() {
    const remoteAuthority = this._environmentService.remoteAuthority;
    const defaultProfile = this._terminalProfileResolverService.getDefaultProfile({ remoteAuthority, os: this._os });
    const defaultAutomationProfile = this._terminalProfileResolverService.getDefaultProfile({ remoteAuthority, os: this._os, allowAutomationShell: true });
    this._proxy.$acceptDefaultProfile(...await Promise.all([defaultProfile, defaultAutomationProfile]));
  }
  async _getTerminalInstance(id) {
    if (typeof id === "string") {
      return this._extHostTerminals.get(id);
    }
    return this._terminalService.getInstanceFromId(id);
  }
  async $createTerminal(extHostTerminalId, launchConfig) {
    const shellLaunchConfig = {
      name: launchConfig.name,
      executable: launchConfig.shellPath,
      args: launchConfig.shellArgs,
      cwd: typeof launchConfig.cwd === "string" ? launchConfig.cwd : URI.revive(launchConfig.cwd),
      icon: launchConfig.icon,
      color: launchConfig.color,
      initialText: launchConfig.initialText,
      waitOnExit: launchConfig.waitOnExit,
      ignoreConfigurationCwd: true,
      env: launchConfig.env,
      strictEnv: launchConfig.strictEnv,
      hideFromUser: launchConfig.hideFromUser,
      customPtyImplementation: launchConfig.isExtensionCustomPtyTerminal ? (id, cols, rows) => new TerminalProcessExtHostProxy(id, cols, rows, this._terminalService) : void 0,
      extHostTerminalId,
      forceShellIntegration: launchConfig.forceShellIntegration,
      isFeatureTerminal: launchConfig.isFeatureTerminal,
      isExtensionOwnedTerminal: launchConfig.isExtensionOwnedTerminal,
      useShellEnvironment: launchConfig.useShellEnvironment,
      isTransient: launchConfig.isTransient,
      shellIntegrationNonce: launchConfig.shellIntegrationNonce,
      titleTemplate: launchConfig.titleTemplate
    };
    const terminal = Promises.withAsyncBody(async (r) => {
      const terminal2 = await this._terminalService.createTerminal({
        config: shellLaunchConfig,
        location: await this._deserializeParentTerminal(launchConfig.location)
      });
      r(terminal2);
    });
    this._extHostTerminals.set(extHostTerminalId, terminal);
    const terminalInstance = await terminal;
    this._register(terminalInstance.onDisposed(() => {
      this._extHostTerminals.delete(extHostTerminalId);
    }));
  }
  async _deserializeParentTerminal(location) {
    if (typeof location === "object" && hasKey(location, { parentTerminal: true })) {
      const parentTerminal = await this._extHostTerminals.get(location.parentTerminal.toString());
      return parentTerminal ? { parentTerminal } : void 0;
    }
    return location;
  }
  async $show(id, preserveFocus) {
    const terminalInstance = await this._getTerminalInstance(id);
    if (terminalInstance) {
      this._terminalService.setActiveInstance(terminalInstance);
      if (terminalInstance.target === TerminalLocation.Editor) {
        await this._terminalEditorService.revealActiveEditor(preserveFocus);
      } else {
        await this._terminalGroupService.showPanel(!preserveFocus);
      }
    }
  }
  async $hide(id) {
    const instanceToHide = await this._getTerminalInstance(id);
    const activeInstance = this._terminalService.activeInstance;
    if (activeInstance && activeInstance.instanceId === instanceToHide?.instanceId && activeInstance.target !== TerminalLocation.Editor) {
      this._terminalGroupService.hidePanel();
    }
  }
  async $dispose(id) {
    (await this._getTerminalInstance(id))?.dispose(TerminalExitReason.Extension);
  }
  async $sendText(id, text, shouldExecute) {
    const instance = await this._getTerminalInstance(id);
    await instance?.sendText(text, shouldExecute);
  }
  $sendProcessExit(terminalId, exitCode) {
    this._terminalProcessProxies.get(terminalId)?.proxy.emitExit(exitCode);
  }
  $startSendingDataEvents() {
    if (!this._dataEventTracker.value) {
      this._dataEventTracker.value = this._instantiationService.createInstance(TerminalDataEventTracker, (id, data) => {
        this._onTerminalData(id, data);
      });
      for (const instance of this._terminalService.instances) {
        for (const data of instance.initialDataEvents || []) {
          this._onTerminalData(instance.instanceId, data);
        }
      }
    }
  }
  $stopSendingDataEvents() {
    this._dataEventTracker.clear();
  }
  $startSendingCommandEvents() {
    if (this._sendCommandEventListener.value) {
      return;
    }
    const multiplexer = this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, (capability) => capability.onCommandFinished);
    const sub = multiplexer.event((e) => {
      this._onDidExecuteCommand(e.instance.instanceId, {
        commandLine: e.data.command,
        // TODO: Convert to URI if possible
        cwd: e.data.cwd,
        exitCode: e.data.exitCode,
        output: e.data.getOutput()
      });
    });
    this._sendCommandEventListener.value = combinedDisposable(multiplexer, sub);
  }
  $stopSendingCommandEvents() {
    this._sendCommandEventListener.clear();
  }
  $startLinkProvider() {
    this._linkProvider.value = this._terminalLinkProviderService.registerLinkProvider(new ExtensionTerminalLinkProvider(this._proxy));
  }
  $stopLinkProvider() {
    this._linkProvider.clear();
  }
  $registerProcessSupport(isSupported) {
    this._terminalService.registerProcessSupport(isSupported);
  }
  $registerCompletionProvider(id, extensionIdentifier, ...triggerCharacters) {
    this._completionProviders.set(id, this._terminalCompletionService.registerTerminalCompletionProvider(extensionIdentifier, id, {
      id,
      provideCompletions: async (commandLine, cursorIndex, token) => {
        const completions = await this._proxy.$provideTerminalCompletions(id, { commandLine, cursorIndex }, token);
        if (!completions) {
          return void 0;
        }
        if (completions.resourceOptions) {
          const { cwd, globPattern, ...rest } = completions.resourceOptions;
          return {
            items: completions.items?.map((c) => ({
              provider: `ext:${id}`,
              ...c
            })),
            resourceOptions: {
              ...rest,
              cwd,
              globPattern
            }
          };
        }
        return completions.items?.map((c) => ({
          provider: `ext:${id}`,
          ...c
        }));
      }
    }, ...triggerCharacters));
  }
  $unregisterCompletionProvider(id) {
    this._completionProviders.deleteAndDispose(id);
  }
  $registerProfileProvider(id, extensionIdentifier) {
    this._profileProviders.set(id, this._terminalProfileService.registerTerminalProfileProvider(extensionIdentifier, id, {
      createContributedTerminalProfile: async (options) => {
        return this._proxy.$createContributedProfileTerminal(id, options);
      }
    }));
  }
  $unregisterProfileProvider(id) {
    this._profileProviders.deleteAndDispose(id);
  }
  async $registerQuickFixProvider(id, extensionId) {
    this._quickFixProviders.set(id, this._terminalQuickFixService.registerQuickFixProvider(id, {
      provideTerminalQuickFixes: async (terminalCommand, lines, options, token) => {
        if (token.isCancellationRequested) {
          return;
        }
        if (options.outputMatcher?.length && options.outputMatcher.length > 40) {
          options.outputMatcher.length = 40;
          this._logService.warn("Cannot exceed output matcher length of 40");
        }
        const commandLineMatch = terminalCommand.command.match(options.commandLineMatcher);
        if (!commandLineMatch || !lines) {
          return;
        }
        const outputMatcher = options.outputMatcher;
        let outputMatch;
        if (outputMatcher) {
          outputMatch = getOutputMatchForLines(lines, outputMatcher);
        }
        if (!outputMatch) {
          return;
        }
        const matchResult = { commandLineMatch, outputMatch, commandLine: terminalCommand.command };
        if (matchResult) {
          const result = await this._proxy.$provideTerminalQuickFixes(id, matchResult, token);
          if (result && Array.isArray(result)) {
            return result.map((r) => parseQuickFix(id, extensionId, r));
          } else if (result) {
            return parseQuickFix(id, extensionId, result);
          }
        }
        return;
      }
    }));
  }
  $unregisterQuickFixProvider(id) {
    this._quickFixProviders.deleteAndDispose(id);
  }
  _onActiveTerminalChanged(terminalId) {
    this._proxy.$acceptActiveTerminalChanged(terminalId);
  }
  _onTerminalData(terminalId, data) {
    this._proxy.$acceptTerminalProcessData(terminalId, data);
  }
  _onDidExecuteCommand(terminalId, command) {
    this._proxy.$acceptDidExecuteCommand(terminalId, command);
  }
  _onTitleChanged(terminalId, name) {
    this._proxy.$acceptTerminalTitleChange(terminalId, name);
  }
  _onShellTypeChanged(terminalId) {
    const terminalInstance = this._terminalService.getInstanceFromId(terminalId);
    if (terminalInstance) {
      this._proxy.$acceptTerminalShellType(terminalId, terminalInstance.shellType);
    }
  }
  _onTerminalDisposed(terminalInstance) {
    this._proxy.$acceptTerminalClosed(terminalInstance.instanceId, terminalInstance.exitCode, terminalInstance.exitReason ?? TerminalExitReason.Unknown);
    this._terminalProcessProxies.deleteAndDispose(terminalInstance.instanceId);
  }
  _onTerminalOpened(terminalInstance) {
    const extHostTerminalId = terminalInstance.shellLaunchConfig.extHostTerminalId;
    const shellLaunchConfigDto = {
      name: terminalInstance.shellLaunchConfig.name,
      executable: terminalInstance.shellLaunchConfig.executable,
      args: terminalInstance.shellLaunchConfig.args,
      cwd: terminalInstance.shellLaunchConfig.cwd,
      env: terminalInstance.shellLaunchConfig.env,
      hideFromUser: terminalInstance.shellLaunchConfig.hideFromUser,
      tabActions: terminalInstance.shellLaunchConfig.tabActions,
      titleTemplate: terminalInstance.shellLaunchConfig.titleTemplate
    };
    this._proxy.$acceptTerminalOpened(terminalInstance.instanceId, extHostTerminalId, terminalInstance.title, shellLaunchConfigDto);
  }
  _onTerminalProcessIdReady(terminalInstance) {
    if (terminalInstance.processId === void 0) {
      return;
    }
    this._proxy.$acceptTerminalProcessId(terminalInstance.instanceId, terminalInstance.processId);
  }
  _onInstanceDimensionsChanged(instance) {
    this._proxy.$acceptTerminalDimensions(instance.instanceId, instance.cols, instance.rows);
  }
  _onInstanceMaximumDimensionsChanged(instance) {
    this._proxy.$acceptTerminalMaximumDimensions(instance.instanceId, instance.maxCols, instance.maxRows);
  }
  _onRequestStartExtensionTerminal(request) {
    const proxy = request.proxy;
    const store = new DisposableStore();
    store.add(proxy);
    this._terminalProcessProxies.set(proxy.instanceId, { proxy, dispose: () => store.dispose() });
    const initialDimensions = request.cols && request.rows ? {
      columns: request.cols,
      rows: request.rows
    } : void 0;
    this._proxy.$startExtensionTerminal(
      proxy.instanceId,
      initialDimensions
    ).then(request.callback);
    store.add(proxy.onInput((data) => this._proxy.$acceptProcessInput(proxy.instanceId, data)));
    store.add(proxy.onShutdown((immediate) => this._proxy.$acceptProcessShutdown(proxy.instanceId, immediate)));
    store.add(proxy.onRequestCwd(() => this._proxy.$acceptProcessRequestCwd(proxy.instanceId)));
    store.add(proxy.onRequestInitialCwd(() => this._proxy.$acceptProcessRequestInitialCwd(proxy.instanceId)));
  }
  $sendProcessData(terminalId, data) {
    this._terminalProcessProxies.get(terminalId)?.proxy.emitData(data);
  }
  $sendProcessReady(terminalId, pid, cwd, windowsPty) {
    this._terminalProcessProxies.get(terminalId)?.proxy.emitReady(pid, cwd, windowsPty);
  }
  $sendProcessProperty(terminalId, property) {
    if (property.type === ProcessPropertyType.Title) {
      const instance = this._terminalService.getInstanceFromId(terminalId);
      instance?.rename(property.value);
    }
    this._terminalProcessProxies.get(terminalId)?.proxy.emitProcessProperty(property);
  }
  $setEnvironmentVariableCollection(extensionIdentifier, persistent, collection, descriptionMap) {
    if (collection) {
      const translatedCollection = {
        persistent,
        map: deserializeEnvironmentVariableCollection(collection),
        descriptionMap: deserializeEnvironmentDescriptionMap(descriptionMap)
      };
      this._environmentVariableService.set(extensionIdentifier, translatedCollection);
    } else {
      this._environmentVariableService.delete(extensionIdentifier);
    }
  }
};
MainThreadTerminalService = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadTerminalService),
  __decorateParam(1, ITerminalService),
  __decorateParam(2, ITerminalLinkProviderService),
  __decorateParam(3, ITerminalQuickFixService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IEnvironmentVariableService),
  __decorateParam(6, ILogService),
  __decorateParam(7, ITerminalProfileResolverService),
  __decorateParam(8, IRemoteAgentService),
  __decorateParam(9, ITerminalGroupService),
  __decorateParam(10, ITerminalEditorService),
  __decorateParam(11, ITerminalProfileService),
  __decorateParam(12, ITerminalCompletionService),
  __decorateParam(13, IWorkbenchEnvironmentService)
], MainThreadTerminalService);
let TerminalDataEventTracker = class extends Disposable {
  constructor(_callback, _terminalService) {
    super();
    this._callback = _callback;
    this._terminalService = _terminalService;
    this._instanceListeners = this._register(new DisposableMap());
    this._register(this._bufferer = new TerminalDataBufferer(this._callback));
    for (const instance of this._terminalService.instances) {
      this._registerInstance(instance);
    }
    this._register(this._terminalService.onDidCreateInstance((instance) => this._registerInstance(instance)));
    this._register(this._terminalService.onDidDisposeInstance((instance) => {
      this._bufferer.stopBuffering(instance.instanceId);
      this._instanceListeners.deleteAndDispose(instance.instanceId);
    }));
  }
  _registerInstance(instance) {
    this._instanceListeners.set(instance.instanceId, this._bufferer.startBuffering(instance.instanceId, instance.onData));
  }
};
TerminalDataEventTracker = __decorateClass([
  __decorateParam(1, ITerminalService)
], TerminalDataEventTracker);
class ExtensionTerminalLinkProvider {
  constructor(_proxy) {
    this._proxy = _proxy;
  }
  async provideLinks(instance, line) {
    const proxy = this._proxy;
    const extHostLinks = await proxy.$provideLinks(instance.instanceId, line);
    return extHostLinks.map((dto) => ({
      id: dto.id,
      startIndex: dto.startIndex,
      length: dto.length,
      label: dto.label,
      activate: () => proxy.$activateLink(instance.instanceId, dto.id)
    }));
  }
}
function getOutputMatchForLines(lines, outputMatcher) {
  const match = lines.join("\n").match(outputMatcher.lineMatcher);
  return match ? { regexMatch: match, outputLines: lines } : void 0;
}
function parseQuickFix(id, source, fix) {
  let type = TerminalQuickFixType.TerminalCommand;
  if (hasKey(fix, { uri: true })) {
    fix.uri = URI.revive(fix.uri);
    type = TerminalQuickFixType.Opener;
  } else if (hasKey(fix, { id: true })) {
    type = TerminalQuickFixType.VscodeCommand;
  }
  return { id, type, source, ...fix };
}
export {
  MainThreadTerminalService,
  getOutputMatchForLines
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkVGVybWluYWxTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29udGV4dCwgRXh0SG9zdFRlcm1pbmFsU2VydmljZVNoYXBlLCBNYWluVGhyZWFkVGVybWluYWxTZXJ2aWNlU2hhcGUsIE1haW5Db250ZXh0LCBUZXJtaW5hbExhdW5jaENvbmZpZywgSVRlcm1pbmFsRGltZW5zaW9uc0R0bywgRXh0SG9zdFRlcm1pbmFsSWRlbnRpZmllciwgVGVybWluYWxRdWlja0ZpeCwgSVRlcm1pbmFsQ29tbWFuZER0byB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IGV4dEhvc3ROYW1lZEN1c3RvbWVyLCBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NQcm9wZXJ0eSwgSVByb2Nlc3NSZWFkeVdpbmRvd3NQdHksIElTaGVsbExhdW5jaENvbmZpZywgSVNoZWxsTGF1bmNoQ29uZmlnRHRvLCBJVGVybWluYWxPdXRwdXRNYXRjaCwgSVRlcm1pbmFsT3V0cHV0TWF0Y2hlciwgUHJvY2Vzc1Byb3BlcnR5VHlwZSwgVGVybWluYWxFeGl0UmVhc29uLCBUZXJtaW5hbExvY2F0aW9uLCB0eXBlIElQcm9jZXNzUHJvcGVydHlNYXAgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxEYXRhQnVmZmVyZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWxEYXRhQnVmZmVyaW5nLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEVkaXRvclNlcnZpY2UsIElUZXJtaW5hbEV4dGVybmFsTGlua1Byb3ZpZGVyLCBJVGVybWluYWxHcm91cFNlcnZpY2UsIElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxMaW5rLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsUHJvY2Vzc0V4dEhvc3RQcm94eSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbFByb2Nlc3NFeHRIb3N0UHJveHkuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi90ZXJtaW5hbC9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZS5qcyc7XG5pbXBvcnQgeyBkZXNlcmlhbGl6ZUVudmlyb25tZW50RGVzY3JpcHRpb25NYXAsIGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24sIHNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGVTaGFyZWQuanMnO1xuaW1wb3J0IHsgSVN0YXJ0RXh0ZW5zaW9uVGVybWluYWxSZXF1ZXN0LCBJVGVybWluYWxQcm9jZXNzRXh0SG9zdFByb3h5LCBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLCBJVGVybWluYWxQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0sIE9TIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVGVybWluYWxFZGl0b3JMb2NhdGlvbk9wdGlvbnMgfSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJU2VyaWFsaXphYmxlRW52aXJvbm1lbnREZXNjcmlwdGlvbk1hcCwgSVNlcmlhbGl6YWJsZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGUuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsTGlua1Byb3ZpZGVyU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVybWluYWxDb250cmliL2xpbmtzL2Jyb3dzZXIvbGlua3MuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsUXVpY2tGaXhTZXJ2aWNlLCBJVGVybWluYWxRdWlja0ZpeCwgVGVybWluYWxRdWlja0ZpeFR5cGUgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9xdWlja0ZpeC9icm93c2VyL3F1aWNrRml4LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi90ZXJtaW5hbENvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3Rlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5pbnRlcmZhY2UgVGVybWluYWxQcm9jZXNzUHJveHlFbnRyeSBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgcHJveHk6IElUZXJtaW5hbFByb2Nlc3NFeHRIb3N0UHJveHk7XG59XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkVGVybWluYWxTZXJ2aWNlKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRUZXJtaW5hbFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgTWFpblRocmVhZFRlcm1pbmFsU2VydmljZVNoYXBlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdFRlcm1pbmFsU2VydmljZVNoYXBlO1xuXG5cdC8qKlxuXHQgKiBTdG9yZXMgYSBtYXAgZnJvbSBhIHRlbXBvcmFyeSB0ZXJtaW5hbCBpZCAoYSBVVUlEIGdlbmVyYXRlZCBvbiB0aGUgZXh0ZW5zaW9uIGhvc3Qgc2lkZSlcblx0ICogdG8gYSBudW1lcmljIHRlcm1pbmFsIGlkIChhbiBpZCBnZW5lcmF0ZWQgb24gdGhlIHJlbmRlcmVyIHNpZGUpXG5cdCAqIFRoaXMgY29tZXMgaW4gcGxheSBvbmx5IHdoZW4gZGVhbGluZyB3aXRoIHRlcm1pbmFscyBjcmVhdGVkIG9uIHRoZSBleHRlbnNpb24gaG9zdCBzaWRlXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0VGVybWluYWxzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2U+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFByb2Nlc3NQcm94aWVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyLCBUZXJtaW5hbFByb2Nlc3NQcm94eUVudHJ5PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvZmlsZVByb3ZpZGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21wbGV0aW9uUHJvdmlkZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrRml4UHJvdmlkZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RhdGFFdmVudFRyYWNrZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8VGVybWluYWxEYXRhRXZlbnRUcmFja2VyPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2VuZENvbW1hbmRFdmVudExpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdC8qKlxuXHQgKiBBIHNpbmdsZSBzaGFyZWQgdGVybWluYWwgbGluayBwcm92aWRlciBmb3IgdGhlIGV4dGhvc3QuIFdoZW4gYW4gZXh0IHJlZ2lzdGVycyBhIGxpbmtcblx0ICogcHJvdmlkZXIsIHRoaXMgaXMgcmVnaXN0ZXJlZCB3aXRoIHRoZSB0ZXJtaW5hbCBvbiB0aGUgcmVuZGVyZXIgc2lkZSBhbmQgYWxsIGxpbmtzIGFyZVxuXHQgKiBwcm92aWRlZCB0aHJvdWdoIHRoaXMsIGV2ZW4gZnJvbSBtdWx0aXBsZSBleHQgbGluayBwcm92aWRlcnMuIFh0ZXJtIHNob3VsZCByZW1vdmUgbG93ZXJcblx0ICogcHJpb3JpdHkgaW50ZXJzZWN0aW5nIGxpbmtzIGl0c2VsZi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmtQcm92aWRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIF9vczogT3BlcmF0aW5nU3lzdGVtID0gT1M7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0X2V4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxMaW5rUHJvdmlkZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsTGlua1Byb3ZpZGVyU2VydmljZTogSVRlcm1pbmFsTGlua1Byb3ZpZGVyU2VydmljZSxcblx0XHRASVRlcm1pbmFsUXVpY2tGaXhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsUXVpY2tGaXhTZXJ2aWNlOiBJVGVybWluYWxRdWlja0ZpeFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2U6IElFbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVRlcm1pbmFsR3JvdXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlOiBJVGVybWluYWxHcm91cFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxFZGl0b3JTZXJ2aWNlOiBJVGVybWluYWxFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlU2VydmljZSxcblx0XHRASVRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDb21wbGV0aW9uU2VydmljZTogSVRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3Byb3h5ID0gX2V4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RUZXJtaW5hbFNlcnZpY2UpO1xuXG5cdFx0Ly8gSVRlcm1pbmFsU2VydmljZSBsaXN0ZW5lcnNcblx0XHR0aGlzLl9yZWdpc3RlcihfdGVybWluYWxTZXJ2aWNlLm9uRGlkQ3JlYXRlSW5zdGFuY2UoKGluc3RhbmNlKSA9PiB7XG5cdFx0XHR0aGlzLl9vblRlcm1pbmFsT3BlbmVkKGluc3RhbmNlKTtcblx0XHRcdHRoaXMuX29uSW5zdGFuY2VEaW1lbnNpb25zQ2hhbmdlZChpbnN0YW5jZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoX3Rlcm1pbmFsU2VydmljZS5vbkRpZERpc3Bvc2VJbnN0YW5jZShpbnN0YW5jZSA9PiB0aGlzLl9vblRlcm1pbmFsRGlzcG9zZWQoaW5zdGFuY2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX3Rlcm1pbmFsU2VydmljZS5vbkFueUluc3RhbmNlUHJvY2Vzc0lkUmVhZHkoaW5zdGFuY2UgPT4gdGhpcy5fb25UZXJtaW5hbFByb2Nlc3NJZFJlYWR5KGluc3RhbmNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF90ZXJtaW5hbFNlcnZpY2Uub25EaWRDaGFuZ2VJbnN0YW5jZURpbWVuc2lvbnMoaW5zdGFuY2UgPT4gdGhpcy5fb25JbnN0YW5jZURpbWVuc2lvbnNDaGFuZ2VkKGluc3RhbmNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF90ZXJtaW5hbFNlcnZpY2Uub25BbnlJbnN0YW5jZU1heGltdW1EaW1lbnNpb25zQ2hhbmdlKGluc3RhbmNlID0+IHRoaXMuX29uSW5zdGFuY2VNYXhpbXVtRGltZW5zaW9uc0NoYW5nZWQoaW5zdGFuY2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX3Rlcm1pbmFsU2VydmljZS5vbkRpZFJlcXVlc3RTdGFydEV4dGVuc2lvblRlcm1pbmFsKGUgPT4gdGhpcy5fb25SZXF1ZXN0U3RhcnRFeHRlbnNpb25UZXJtaW5hbChlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF90ZXJtaW5hbFNlcnZpY2Uub25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSA9PiB0aGlzLl9vbkFjdGl2ZVRlcm1pbmFsQ2hhbmdlZChpbnN0YW5jZSA/IGluc3RhbmNlLmluc3RhbmNlSWQgOiBudWxsKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF90ZXJtaW5hbFNlcnZpY2Uub25BbnlJbnN0YW5jZVRpdGxlQ2hhbmdlKGluc3RhbmNlID0+IGluc3RhbmNlICYmIHRoaXMuX29uVGl0bGVDaGFuZ2VkKGluc3RhbmNlLmluc3RhbmNlSWQsIGluc3RhbmNlLnRpdGxlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF90ZXJtaW5hbFNlcnZpY2Uub25BbnlJbnN0YW5jZURhdGFJbnB1dChpbnN0YW5jZSA9PiB0aGlzLl9wcm94eS4kYWNjZXB0VGVybWluYWxJbnRlcmFjdGlvbihpbnN0YW5jZS5pbnN0YW5jZUlkKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF90ZXJtaW5hbFNlcnZpY2Uub25BbnlJbnN0YW5jZVNlbGVjdGlvbkNoYW5nZShpbnN0YW5jZSA9PiB0aGlzLl9wcm94eS4kYWNjZXB0VGVybWluYWxTZWxlY3Rpb24oaW5zdGFuY2UuaW5zdGFuY2VJZCwgaW5zdGFuY2Uuc2VsZWN0aW9uKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF90ZXJtaW5hbFNlcnZpY2Uub25BbnlJbnN0YW5jZVNoZWxsVHlwZUNoYW5nZWQoaW5zdGFuY2UgPT4gdGhpcy5fb25TaGVsbFR5cGVDaGFuZ2VkKGluc3RhbmNlLmluc3RhbmNlSWQpKSk7XG5cblx0XHQvLyBTZXQgaW5pdGlhbCBleHQgaG9zdCBzdGF0ZVxuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcykge1xuXHRcdFx0dGhpcy5fb25UZXJtaW5hbE9wZW5lZChpbnN0YW5jZSk7XG5cdFx0XHRpbnN0YW5jZS5wcm9jZXNzUmVhZHkudGhlbigoKSA9PiB0aGlzLl9vblRlcm1pbmFsUHJvY2Vzc0lkUmVhZHkoaW5zdGFuY2UpKTtcblx0XHRcdGlmIChpbnN0YW5jZS5zaGVsbFR5cGUpIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdFRlcm1pbmFsU2hlbGxUeXBlKGluc3RhbmNlLmluc3RhbmNlSWQsIGluc3RhbmNlLnNoZWxsVHlwZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2ZUluc3RhbmNlID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xuXHRcdGlmIChhY3RpdmVJbnN0YW5jZSkge1xuXHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdEFjdGl2ZVRlcm1pbmFsQ2hhbmdlZChhY3RpdmVJbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2Vudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlLmNvbGxlY3Rpb25zLnNpemUgPiAwKSB7XG5cdFx0XHRjb25zdCBjb2xsZWN0aW9uQXNBcnJheSA9IFsuLi50aGlzLl9lbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZS5jb2xsZWN0aW9ucy5lbnRyaWVzKCldO1xuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZENvbGxlY3Rpb25zOiBbc3RyaW5nLCBJU2VyaWFsaXphYmxlRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25dW10gPSBjb2xsZWN0aW9uQXNBcnJheS5tYXAoZSA9PiB7XG5cdFx0XHRcdHJldHVybiBbZVswXSwgc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oZVsxXS5tYXApXTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcHJveHkuJGluaXRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnMoc2VyaWFsaXplZENvbGxlY3Rpb25zKTtcblx0XHR9XG5cdFx0cmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCkudGhlbihhc3luYyBlbnYgPT4ge1xuXHRcdFx0dGhpcy5fb3MgPSBlbnY/Lm9zIHx8IE9TO1xuXHRcdFx0dGhpcy5fdXBkYXRlRGVmYXVsdFByb2ZpbGUoKTtcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQXZhaWxhYmxlUHJvZmlsZXMoKCkgPT4gdGhpcy5fdXBkYXRlRGVmYXVsdFByb2ZpbGUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlRGVmYXVsdFByb2ZpbGUoKSB7XG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0XHRjb25zdCBkZWZhdWx0UHJvZmlsZSA9IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZS5nZXREZWZhdWx0UHJvZmlsZSh7IHJlbW90ZUF1dGhvcml0eSwgb3M6IHRoaXMuX29zIH0pO1xuXHRcdGNvbnN0IGRlZmF1bHRBdXRvbWF0aW9uUHJvZmlsZSA9IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZS5nZXREZWZhdWx0UHJvZmlsZSh7IHJlbW90ZUF1dGhvcml0eSwgb3M6IHRoaXMuX29zLCBhbGxvd0F1dG9tYXRpb25TaGVsbDogdHJ1ZSB9KTtcblx0XHR0aGlzLl9wcm94eS4kYWNjZXB0RGVmYXVsdFByb2ZpbGUoLi4uYXdhaXQgUHJvbWlzZS5hbGwoW2RlZmF1bHRQcm9maWxlLCBkZWZhdWx0QXV0b21hdGlvblByb2ZpbGVdKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRUZXJtaW5hbEluc3RhbmNlKGlkOiBFeHRIb3N0VGVybWluYWxJZGVudGlmaWVyKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0eXBlb2YgaWQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZXh0SG9zdFRlcm1pbmFscy5nZXQoaWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmdldEluc3RhbmNlRnJvbUlkKGlkKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkY3JlYXRlVGVybWluYWwoZXh0SG9zdFRlcm1pbmFsSWQ6IHN0cmluZywgbGF1bmNoQ29uZmlnOiBUZXJtaW5hbExhdW5jaENvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcgPSB7XG5cdFx0XHRuYW1lOiBsYXVuY2hDb25maWcubmFtZSxcblx0XHRcdGV4ZWN1dGFibGU6IGxhdW5jaENvbmZpZy5zaGVsbFBhdGgsXG5cdFx0XHRhcmdzOiBsYXVuY2hDb25maWcuc2hlbGxBcmdzLFxuXHRcdFx0Y3dkOiB0eXBlb2YgbGF1bmNoQ29uZmlnLmN3ZCA9PT0gJ3N0cmluZycgPyBsYXVuY2hDb25maWcuY3dkIDogVVJJLnJldml2ZShsYXVuY2hDb25maWcuY3dkKSxcblx0XHRcdGljb246IGxhdW5jaENvbmZpZy5pY29uLFxuXHRcdFx0Y29sb3I6IGxhdW5jaENvbmZpZy5jb2xvcixcblx0XHRcdGluaXRpYWxUZXh0OiBsYXVuY2hDb25maWcuaW5pdGlhbFRleHQsXG5cdFx0XHR3YWl0T25FeGl0OiBsYXVuY2hDb25maWcud2FpdE9uRXhpdCxcblx0XHRcdGlnbm9yZUNvbmZpZ3VyYXRpb25Dd2Q6IHRydWUsXG5cdFx0XHRlbnY6IGxhdW5jaENvbmZpZy5lbnYsXG5cdFx0XHRzdHJpY3RFbnY6IGxhdW5jaENvbmZpZy5zdHJpY3RFbnYsXG5cdFx0XHRoaWRlRnJvbVVzZXI6IGxhdW5jaENvbmZpZy5oaWRlRnJvbVVzZXIsXG5cdFx0XHRjdXN0b21QdHlJbXBsZW1lbnRhdGlvbjogbGF1bmNoQ29uZmlnLmlzRXh0ZW5zaW9uQ3VzdG9tUHR5VGVybWluYWxcblx0XHRcdFx0PyAoaWQsIGNvbHMsIHJvd3MpID0+IG5ldyBUZXJtaW5hbFByb2Nlc3NFeHRIb3N0UHJveHkoaWQsIGNvbHMsIHJvd3MsIHRoaXMuX3Rlcm1pbmFsU2VydmljZSlcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRleHRIb3N0VGVybWluYWxJZCxcblx0XHRcdGZvcmNlU2hlbGxJbnRlZ3JhdGlvbjogbGF1bmNoQ29uZmlnLmZvcmNlU2hlbGxJbnRlZ3JhdGlvbixcblx0XHRcdGlzRmVhdHVyZVRlcm1pbmFsOiBsYXVuY2hDb25maWcuaXNGZWF0dXJlVGVybWluYWwsXG5cdFx0XHRpc0V4dGVuc2lvbk93bmVkVGVybWluYWw6IGxhdW5jaENvbmZpZy5pc0V4dGVuc2lvbk93bmVkVGVybWluYWwsXG5cdFx0XHR1c2VTaGVsbEVudmlyb25tZW50OiBsYXVuY2hDb25maWcudXNlU2hlbGxFbnZpcm9ubWVudCxcblx0XHRcdGlzVHJhbnNpZW50OiBsYXVuY2hDb25maWcuaXNUcmFuc2llbnQsXG5cdFx0XHRzaGVsbEludGVncmF0aW9uTm9uY2U6IGxhdW5jaENvbmZpZy5zaGVsbEludGVncmF0aW9uTm9uY2UsXG5cdFx0XHR0aXRsZVRlbXBsYXRlOiBsYXVuY2hDb25maWcudGl0bGVUZW1wbGF0ZSxcblx0XHR9O1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gUHJvbWlzZXMud2l0aEFzeW5jQm9keTxJVGVybWluYWxJbnN0YW5jZT4oYXN5bmMgciA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbCA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRcdGNvbmZpZzogc2hlbGxMYXVuY2hDb25maWcsXG5cdFx0XHRcdGxvY2F0aW9uOiBhd2FpdCB0aGlzLl9kZXNlcmlhbGl6ZVBhcmVudFRlcm1pbmFsKGxhdW5jaENvbmZpZy5sb2NhdGlvbilcblx0XHRcdH0pO1xuXHRcdFx0cih0ZXJtaW5hbCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fZXh0SG9zdFRlcm1pbmFscy5zZXQoZXh0SG9zdFRlcm1pbmFsSWQsIHRlcm1pbmFsKTtcblx0XHRjb25zdCB0ZXJtaW5hbEluc3RhbmNlID0gYXdhaXQgdGVybWluYWw7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGVybWluYWxJbnN0YW5jZS5vbkRpc3Bvc2VkKCgpID0+IHtcblx0XHRcdHRoaXMuX2V4dEhvc3RUZXJtaW5hbHMuZGVsZXRlKGV4dEhvc3RUZXJtaW5hbElkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kZXNlcmlhbGl6ZVBhcmVudFRlcm1pbmFsKGxvY2F0aW9uPzogVGVybWluYWxMb2NhdGlvbiB8IFRlcm1pbmFsRWRpdG9yTG9jYXRpb25PcHRpb25zIHwgeyBwYXJlbnRUZXJtaW5hbDogRXh0SG9zdFRlcm1pbmFsSWRlbnRpZmllciB9IHwgeyBzcGxpdEFjdGl2ZVRlcm1pbmFsOiBib29sZWFuOyBsb2NhdGlvbj86IFRlcm1pbmFsTG9jYXRpb24gfSk6IFByb21pc2U8VGVybWluYWxMb2NhdGlvbiB8IFRlcm1pbmFsRWRpdG9yTG9jYXRpb25PcHRpb25zIHwgeyBwYXJlbnRUZXJtaW5hbDogSVRlcm1pbmFsSW5zdGFuY2UgfSB8IHsgc3BsaXRBY3RpdmVUZXJtaW5hbDogYm9vbGVhbiB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHR5cGVvZiBsb2NhdGlvbiA9PT0gJ29iamVjdCcgJiYgaGFzS2V5KGxvY2F0aW9uLCB7IHBhcmVudFRlcm1pbmFsOiB0cnVlIH0pKSB7XG5cdFx0XHRjb25zdCBwYXJlbnRUZXJtaW5hbCA9IGF3YWl0IHRoaXMuX2V4dEhvc3RUZXJtaW5hbHMuZ2V0KGxvY2F0aW9uLnBhcmVudFRlcm1pbmFsLnRvU3RyaW5nKCkpO1xuXHRcdFx0cmV0dXJuIHBhcmVudFRlcm1pbmFsID8geyBwYXJlbnRUZXJtaW5hbCB9IDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gbG9jYXRpb247XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJHNob3coaWQ6IEV4dEhvc3RUZXJtaW5hbElkZW50aWZpZXIsIHByZXNlcnZlRm9jdXM6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0ZXJtaW5hbEluc3RhbmNlID0gYXdhaXQgdGhpcy5fZ2V0VGVybWluYWxJbnN0YW5jZShpZCk7XG5cdFx0aWYgKHRlcm1pbmFsSW5zdGFuY2UpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZSh0ZXJtaW5hbEluc3RhbmNlKTtcblx0XHRcdGlmICh0ZXJtaW5hbEluc3RhbmNlLnRhcmdldCA9PT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fdGVybWluYWxFZGl0b3JTZXJ2aWNlLnJldmVhbEFjdGl2ZUVkaXRvcihwcmVzZXJ2ZUZvY3VzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLnNob3dQYW5lbCghcHJlc2VydmVGb2N1cyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jICRoaWRlKGlkOiBFeHRIb3N0VGVybWluYWxJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5zdGFuY2VUb0hpZGUgPSBhd2FpdCB0aGlzLl9nZXRUZXJtaW5hbEluc3RhbmNlKGlkKTtcblx0XHRjb25zdCBhY3RpdmVJbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRpZiAoYWN0aXZlSW5zdGFuY2UgJiYgYWN0aXZlSW5zdGFuY2UuaW5zdGFuY2VJZCA9PT0gaW5zdGFuY2VUb0hpZGU/Lmluc3RhbmNlSWQgJiYgYWN0aXZlSW5zdGFuY2UudGFyZ2V0ICE9PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcikge1xuXHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaGlkZVBhbmVsKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jICRkaXNwb3NlKGlkOiBFeHRIb3N0VGVybWluYWxJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0KGF3YWl0IHRoaXMuX2dldFRlcm1pbmFsSW5zdGFuY2UoaWQpKT8uZGlzcG9zZShUZXJtaW5hbEV4aXRSZWFzb24uRXh0ZW5zaW9uKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkc2VuZFRleHQoaWQ6IEV4dEhvc3RUZXJtaW5hbElkZW50aWZpZXIsIHRleHQ6IHN0cmluZywgc2hvdWxkRXhlY3V0ZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgdGhpcy5fZ2V0VGVybWluYWxJbnN0YW5jZShpZCk7XG5cdFx0YXdhaXQgaW5zdGFuY2U/LnNlbmRUZXh0KHRleHQsIHNob3VsZEV4ZWN1dGUpO1xuXHR9XG5cblx0cHVibGljICRzZW5kUHJvY2Vzc0V4aXQodGVybWluYWxJZDogbnVtYmVyLCBleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fdGVybWluYWxQcm9jZXNzUHJveGllcy5nZXQodGVybWluYWxJZCk/LnByb3h5LmVtaXRFeGl0KGV4aXRDb2RlKTtcblx0fVxuXG5cdHB1YmxpYyAkc3RhcnRTZW5kaW5nRGF0YUV2ZW50cygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2RhdGFFdmVudFRyYWNrZXIudmFsdWUpIHtcblx0XHRcdHRoaXMuX2RhdGFFdmVudFRyYWNrZXIudmFsdWUgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbERhdGFFdmVudFRyYWNrZXIsIChpZCwgZGF0YSkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vblRlcm1pbmFsRGF0YShpZCwgZGF0YSk7XG5cdFx0XHR9KTtcblx0XHRcdC8vIFNlbmQgaW5pdGlhbCBldmVudHMgaWYgdGhleSBleGlzdFxuXHRcdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuaW5zdGFuY2VzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZGF0YSBvZiBpbnN0YW5jZS5pbml0aWFsRGF0YUV2ZW50cyB8fCBbXSkge1xuXHRcdFx0XHRcdHRoaXMuX29uVGVybWluYWxEYXRhKGluc3RhbmNlLmluc3RhbmNlSWQsIGRhdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljICRzdG9wU2VuZGluZ0RhdGFFdmVudHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGF0YUV2ZW50VHJhY2tlci5jbGVhcigpO1xuXHR9XG5cblx0cHVibGljICRzdGFydFNlbmRpbmdDb21tYW5kRXZlbnRzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zZW5kQ29tbWFuZEV2ZW50TGlzdGVuZXIudmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtdWx0aXBsZXhlciA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVPbkluc3RhbmNlQ2FwYWJpbGl0eUV2ZW50KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uLCBjYXBhYmlsaXR5ID0+IGNhcGFiaWxpdHkub25Db21tYW5kRmluaXNoZWQpO1xuXHRcdGNvbnN0IHN1YiA9IG11bHRpcGxleGVyLmV2ZW50KGUgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRFeGVjdXRlQ29tbWFuZChlLmluc3RhbmNlLmluc3RhbmNlSWQsIHtcblx0XHRcdFx0Y29tbWFuZExpbmU6IGUuZGF0YS5jb21tYW5kLFxuXHRcdFx0XHQvLyBUT0RPOiBDb252ZXJ0IHRvIFVSSSBpZiBwb3NzaWJsZVxuXHRcdFx0XHRjd2Q6IGUuZGF0YS5jd2QsXG5cdFx0XHRcdGV4aXRDb2RlOiBlLmRhdGEuZXhpdENvZGUsXG5cdFx0XHRcdG91dHB1dDogZS5kYXRhLmdldE91dHB1dCgpXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHR0aGlzLl9zZW5kQ29tbWFuZEV2ZW50TGlzdGVuZXIudmFsdWUgPSBjb21iaW5lZERpc3Bvc2FibGUobXVsdGlwbGV4ZXIsIHN1Yik7XG5cdH1cblxuXHRwdWJsaWMgJHN0b3BTZW5kaW5nQ29tbWFuZEV2ZW50cygpOiB2b2lkIHtcblx0XHR0aGlzLl9zZW5kQ29tbWFuZEV2ZW50TGlzdGVuZXIuY2xlYXIoKTtcblx0fVxuXG5cdHB1YmxpYyAkc3RhcnRMaW5rUHJvdmlkZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fbGlua1Byb3ZpZGVyLnZhbHVlID0gdGhpcy5fdGVybWluYWxMaW5rUHJvdmlkZXJTZXJ2aWNlLnJlZ2lzdGVyTGlua1Byb3ZpZGVyKG5ldyBFeHRlbnNpb25UZXJtaW5hbExpbmtQcm92aWRlcih0aGlzLl9wcm94eSkpO1xuXHR9XG5cblx0cHVibGljICRzdG9wTGlua1Byb3ZpZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xpbmtQcm92aWRlci5jbGVhcigpO1xuXHR9XG5cblx0cHVibGljICRyZWdpc3RlclByb2Nlc3NTdXBwb3J0KGlzU3VwcG9ydGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvY2Vzc1N1cHBvcnQoaXNTdXBwb3J0ZWQpO1xuXHR9XG5cblx0cHVibGljICRyZWdpc3RlckNvbXBsZXRpb25Qcm92aWRlcihpZDogc3RyaW5nLCBleHRlbnNpb25JZGVudGlmaWVyOiBzdHJpbmcsIC4uLnRyaWdnZXJDaGFyYWN0ZXJzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbXBsZXRpb25Qcm92aWRlcnMuc2V0KGlkLCB0aGlzLl90ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlZ2lzdGVyVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uSWRlbnRpZmllciwgaWQsIHtcblx0XHRcdGlkLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25zOiBhc3luYyAoY29tbWFuZExpbmUsIGN1cnNvckluZGV4LCB0b2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlVGVybWluYWxDb21wbGV0aW9ucyhpZCwgeyBjb21tYW5kTGluZSwgY3Vyc29ySW5kZXggfSwgdG9rZW4pO1xuXHRcdFx0XHRpZiAoIWNvbXBsZXRpb25zKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY29tcGxldGlvbnMucmVzb3VyY2VPcHRpb25zKSB7XG5cdFx0XHRcdFx0Y29uc3QgeyBjd2QsIGdsb2JQYXR0ZXJuLCAuLi5yZXN0IH0gPSBjb21wbGV0aW9ucy5yZXNvdXJjZU9wdGlvbnM7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGl0ZW1zOiBjb21wbGV0aW9ucy5pdGVtcz8ubWFwKGMgPT4gKHtcblx0XHRcdFx0XHRcdFx0cHJvdmlkZXI6IGBleHQ6JHtpZH1gLFxuXHRcdFx0XHRcdFx0XHQuLi5jLFxuXHRcdFx0XHRcdFx0fSkpLFxuXHRcdFx0XHRcdFx0cmVzb3VyY2VPcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdC4uLnJlc3QsXG5cdFx0XHRcdFx0XHRcdGN3ZCxcblx0XHRcdFx0XHRcdFx0Z2xvYlBhdHRlcm5cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBjb21wbGV0aW9ucy5pdGVtcz8ubWFwKGMgPT4gKHtcblx0XHRcdFx0XHRwcm92aWRlcjogYGV4dDoke2lkfWAsXG5cdFx0XHRcdFx0Li4uYyxcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0sIC4uLnRyaWdnZXJDaGFyYWN0ZXJzKSk7XG5cdH1cblxuXHRwdWJsaWMgJHVucmVnaXN0ZXJDb21wbGV0aW9uUHJvdmlkZXIoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbXBsZXRpb25Qcm92aWRlcnMuZGVsZXRlQW5kRGlzcG9zZShpZCk7XG5cdH1cblxuXHRwdWJsaWMgJHJlZ2lzdGVyUHJvZmlsZVByb3ZpZGVyKGlkOiBzdHJpbmcsIGV4dGVuc2lvbklkZW50aWZpZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdC8vIFByb3h5IHByb2ZpbGUgcHJvdmlkZXIgcmVxdWVzdHMgdGhyb3VnaCB0aGUgZXh0ZW5zaW9uIGhvc3Rcblx0XHR0aGlzLl9wcm9maWxlUHJvdmlkZXJzLnNldChpZCwgdGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5yZWdpc3RlclRlcm1pbmFsUHJvZmlsZVByb3ZpZGVyKGV4dGVuc2lvbklkZW50aWZpZXIsIGlkLCB7XG5cdFx0XHRjcmVhdGVDb250cmlidXRlZFRlcm1pbmFsUHJvZmlsZTogYXN5bmMgKG9wdGlvbnMpID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRjcmVhdGVDb250cmlidXRlZFByb2ZpbGVUZXJtaW5hbChpZCwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljICR1bnJlZ2lzdGVyUHJvZmlsZVByb3ZpZGVyKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm9maWxlUHJvdmlkZXJzLmRlbGV0ZUFuZERpc3Bvc2UoaWQpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRyZWdpc3RlclF1aWNrRml4UHJvdmlkZXIoaWQ6IHN0cmluZywgZXh0ZW5zaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3F1aWNrRml4UHJvdmlkZXJzLnNldChpZCwgdGhpcy5fdGVybWluYWxRdWlja0ZpeFNlcnZpY2UucmVnaXN0ZXJRdWlja0ZpeFByb3ZpZGVyKGlkLCB7XG5cdFx0XHRwcm92aWRlVGVybWluYWxRdWlja0ZpeGVzOiBhc3luYyAodGVybWluYWxDb21tYW5kLCBsaW5lcywgb3B0aW9ucywgdG9rZW4pID0+IHtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChvcHRpb25zLm91dHB1dE1hdGNoZXI/Lmxlbmd0aCAmJiBvcHRpb25zLm91dHB1dE1hdGNoZXIubGVuZ3RoID4gNDApIHtcblx0XHRcdFx0XHRvcHRpb25zLm91dHB1dE1hdGNoZXIubGVuZ3RoID0gNDA7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdDYW5ub3QgZXhjZWVkIG91dHB1dCBtYXRjaGVyIGxlbmd0aCBvZiA0MCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRMaW5lTWF0Y2ggPSB0ZXJtaW5hbENvbW1hbmQuY29tbWFuZC5tYXRjaChvcHRpb25zLmNvbW1hbmRMaW5lTWF0Y2hlcik7XG5cdFx0XHRcdGlmICghY29tbWFuZExpbmVNYXRjaCB8fCAhbGluZXMpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgb3V0cHV0TWF0Y2hlciA9IG9wdGlvbnMub3V0cHV0TWF0Y2hlcjtcblx0XHRcdFx0bGV0IG91dHB1dE1hdGNoO1xuXHRcdFx0XHRpZiAob3V0cHV0TWF0Y2hlcikge1xuXHRcdFx0XHRcdG91dHB1dE1hdGNoID0gZ2V0T3V0cHV0TWF0Y2hGb3JMaW5lcyhsaW5lcywgb3V0cHV0TWF0Y2hlcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFvdXRwdXRNYXRjaCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtYXRjaFJlc3VsdCA9IHsgY29tbWFuZExpbmVNYXRjaCwgb3V0cHV0TWF0Y2gsIGNvbW1hbmRMaW5lOiB0ZXJtaW5hbENvbW1hbmQuY29tbWFuZCB9O1xuXG5cdFx0XHRcdGlmIChtYXRjaFJlc3VsdCkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlVGVybWluYWxRdWlja0ZpeGVzKGlkLCBtYXRjaFJlc3VsdCwgdG9rZW4pO1xuXHRcdFx0XHRcdGlmIChyZXN1bHQgJiYgQXJyYXkuaXNBcnJheShyZXN1bHQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0Lm1hcChyID0+IHBhcnNlUXVpY2tGaXgoaWQsIGV4dGVuc2lvbklkLCByKSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBwYXJzZVF1aWNrRml4KGlkLCBleHRlbnNpb25JZCwgcmVzdWx0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyAkdW5yZWdpc3RlclF1aWNrRml4UHJvdmlkZXIoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3F1aWNrRml4UHJvdmlkZXJzLmRlbGV0ZUFuZERpc3Bvc2UoaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25BY3RpdmVUZXJtaW5hbENoYW5nZWQodGVybWluYWxJZDogbnVtYmVyIHwgbnVsbCk6IHZvaWQge1xuXHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRBY3RpdmVUZXJtaW5hbENoYW5nZWQodGVybWluYWxJZCk7XG5cdH1cblxuXHRwcml2YXRlIF9vblRlcm1pbmFsRGF0YSh0ZXJtaW5hbElkOiBudW1iZXIsIGRhdGE6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRUZXJtaW5hbFByb2Nlc3NEYXRhKHRlcm1pbmFsSWQsIGRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRFeGVjdXRlQ29tbWFuZCh0ZXJtaW5hbElkOiBudW1iZXIsIGNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmREdG8pOiB2b2lkIHtcblx0XHR0aGlzLl9wcm94eS4kYWNjZXB0RGlkRXhlY3V0ZUNvbW1hbmQodGVybWluYWxJZCwgY29tbWFuZCk7XG5cdH1cblxuXHRwcml2YXRlIF9vblRpdGxlQ2hhbmdlZCh0ZXJtaW5hbElkOiBudW1iZXIsIG5hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRUZXJtaW5hbFRpdGxlQ2hhbmdlKHRlcm1pbmFsSWQsIG5hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25TaGVsbFR5cGVDaGFuZ2VkKHRlcm1pbmFsSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHRlcm1pbmFsSW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZ2V0SW5zdGFuY2VGcm9tSWQodGVybWluYWxJZCk7XG5cdFx0aWYgKHRlcm1pbmFsSW5zdGFuY2UpIHtcblx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRUZXJtaW5hbFNoZWxsVHlwZSh0ZXJtaW5hbElkLCB0ZXJtaW5hbEluc3RhbmNlLnNoZWxsVHlwZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25UZXJtaW5hbERpc3Bvc2VkKHRlcm1pbmFsSW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJveHkuJGFjY2VwdFRlcm1pbmFsQ2xvc2VkKHRlcm1pbmFsSW5zdGFuY2UuaW5zdGFuY2VJZCwgdGVybWluYWxJbnN0YW5jZS5leGl0Q29kZSwgdGVybWluYWxJbnN0YW5jZS5leGl0UmVhc29uID8/IFRlcm1pbmFsRXhpdFJlYXNvbi5Vbmtub3duKTtcblx0XHR0aGlzLl90ZXJtaW5hbFByb2Nlc3NQcm94aWVzLmRlbGV0ZUFuZERpc3Bvc2UodGVybWluYWxJbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0fVxuXG5cdHByaXZhdGUgX29uVGVybWluYWxPcGVuZWQodGVybWluYWxJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHRjb25zdCBleHRIb3N0VGVybWluYWxJZCA9IHRlcm1pbmFsSW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuZXh0SG9zdFRlcm1pbmFsSWQ7XG5cdFx0Y29uc3Qgc2hlbGxMYXVuY2hDb25maWdEdG86IElTaGVsbExhdW5jaENvbmZpZ0R0byA9IHtcblx0XHRcdG5hbWU6IHRlcm1pbmFsSW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcubmFtZSxcblx0XHRcdGV4ZWN1dGFibGU6IHRlcm1pbmFsSW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZSxcblx0XHRcdGFyZ3M6IHRlcm1pbmFsSW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuYXJncyxcblx0XHRcdGN3ZDogdGVybWluYWxJbnN0YW5jZS5zaGVsbExhdW5jaENvbmZpZy5jd2QsXG5cdFx0XHRlbnY6IHRlcm1pbmFsSW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuZW52LFxuXHRcdFx0aGlkZUZyb21Vc2VyOiB0ZXJtaW5hbEluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLmhpZGVGcm9tVXNlcixcblx0XHRcdHRhYkFjdGlvbnM6IHRlcm1pbmFsSW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcudGFiQWN0aW9ucyxcblx0XHRcdHRpdGxlVGVtcGxhdGU6IHRlcm1pbmFsSW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcudGl0bGVUZW1wbGF0ZVxuXHRcdH07XG5cdFx0dGhpcy5fcHJveHkuJGFjY2VwdFRlcm1pbmFsT3BlbmVkKHRlcm1pbmFsSW5zdGFuY2UuaW5zdGFuY2VJZCwgZXh0SG9zdFRlcm1pbmFsSWQsIHRlcm1pbmFsSW5zdGFuY2UudGl0bGUsIHNoZWxsTGF1bmNoQ29uZmlnRHRvKTtcblx0fVxuXG5cdHByaXZhdGUgX29uVGVybWluYWxQcm9jZXNzSWRSZWFkeSh0ZXJtaW5hbEluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQge1xuXHRcdGlmICh0ZXJtaW5hbEluc3RhbmNlLnByb2Nlc3NJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRUZXJtaW5hbFByb2Nlc3NJZCh0ZXJtaW5hbEluc3RhbmNlLmluc3RhbmNlSWQsIHRlcm1pbmFsSW5zdGFuY2UucHJvY2Vzc0lkKTtcblx0fVxuXG5cdHByaXZhdGUgX29uSW5zdGFuY2VEaW1lbnNpb25zQ2hhbmdlZChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm94eS4kYWNjZXB0VGVybWluYWxEaW1lbnNpb25zKGluc3RhbmNlLmluc3RhbmNlSWQsIGluc3RhbmNlLmNvbHMsIGluc3RhbmNlLnJvd3MpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25JbnN0YW5jZU1heGltdW1EaW1lbnNpb25zQ2hhbmdlZChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm94eS4kYWNjZXB0VGVybWluYWxNYXhpbXVtRGltZW5zaW9ucyhpbnN0YW5jZS5pbnN0YW5jZUlkLCBpbnN0YW5jZS5tYXhDb2xzLCBpbnN0YW5jZS5tYXhSb3dzKTtcblx0fVxuXG5cdHByaXZhdGUgX29uUmVxdWVzdFN0YXJ0RXh0ZW5zaW9uVGVybWluYWwocmVxdWVzdDogSVN0YXJ0RXh0ZW5zaW9uVGVybWluYWxSZXF1ZXN0KTogdm9pZCB7XG5cdFx0Y29uc3QgcHJveHkgPSByZXF1ZXN0LnByb3h5O1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChwcm94eSk7XG5cdFx0dGhpcy5fdGVybWluYWxQcm9jZXNzUHJveGllcy5zZXQocHJveHkuaW5zdGFuY2VJZCwgeyBwcm94eSwgZGlzcG9zZTogKCkgPT4gc3RvcmUuZGlzcG9zZSgpIH0pO1xuXG5cdFx0Ly8gTm90ZSB0aGF0IG9uUmVzaXplIGlzIG5vdCBiZWluZyBsaXN0ZW5lZCB0byBoZXJlIGFzIGl0IG5lZWRzIHRvIGZpcmUgd2hlbiBtYXggZGltZW5zaW9uc1xuXHRcdC8vIGNoYW5nZSwgZXhjbHVkaW5nIHRoZSBkaW1lbnNpb24gb3ZlcnJpZGVcblx0XHRjb25zdCBpbml0aWFsRGltZW5zaW9uczogSVRlcm1pbmFsRGltZW5zaW9uc0R0byB8IHVuZGVmaW5lZCA9IHJlcXVlc3QuY29scyAmJiByZXF1ZXN0LnJvd3MgPyB7XG5cdFx0XHRjb2x1bW5zOiByZXF1ZXN0LmNvbHMsXG5cdFx0XHRyb3dzOiByZXF1ZXN0LnJvd3Ncblx0XHR9IDogdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fcHJveHkuJHN0YXJ0RXh0ZW5zaW9uVGVybWluYWwoXG5cdFx0XHRwcm94eS5pbnN0YW5jZUlkLFxuXHRcdFx0aW5pdGlhbERpbWVuc2lvbnNcblx0XHQpLnRoZW4ocmVxdWVzdC5jYWxsYmFjayk7XG5cblx0XHRzdG9yZS5hZGQocHJveHkub25JbnB1dChkYXRhID0+IHRoaXMuX3Byb3h5LiRhY2NlcHRQcm9jZXNzSW5wdXQocHJveHkuaW5zdGFuY2VJZCwgZGF0YSkpKTtcblx0XHRzdG9yZS5hZGQocHJveHkub25TaHV0ZG93bihpbW1lZGlhdGUgPT4gdGhpcy5fcHJveHkuJGFjY2VwdFByb2Nlc3NTaHV0ZG93bihwcm94eS5pbnN0YW5jZUlkLCBpbW1lZGlhdGUpKSk7XG5cdFx0c3RvcmUuYWRkKHByb3h5Lm9uUmVxdWVzdEN3ZCgoKSA9PiB0aGlzLl9wcm94eS4kYWNjZXB0UHJvY2Vzc1JlcXVlc3RDd2QocHJveHkuaW5zdGFuY2VJZCkpKTtcblx0XHRzdG9yZS5hZGQocHJveHkub25SZXF1ZXN0SW5pdGlhbEN3ZCgoKSA9PiB0aGlzLl9wcm94eS4kYWNjZXB0UHJvY2Vzc1JlcXVlc3RJbml0aWFsQ3dkKHByb3h5Lmluc3RhbmNlSWQpKSk7XG5cdH1cblxuXHRwdWJsaWMgJHNlbmRQcm9jZXNzRGF0YSh0ZXJtaW5hbElkOiBudW1iZXIsIGRhdGE6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc1Byb3hpZXMuZ2V0KHRlcm1pbmFsSWQpPy5wcm94eS5lbWl0RGF0YShkYXRhKTtcblx0fVxuXG5cdHB1YmxpYyAkc2VuZFByb2Nlc3NSZWFkeSh0ZXJtaW5hbElkOiBudW1iZXIsIHBpZDogbnVtYmVyLCBjd2Q6IHN0cmluZywgd2luZG93c1B0eTogSVByb2Nlc3NSZWFkeVdpbmRvd3NQdHkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl90ZXJtaW5hbFByb2Nlc3NQcm94aWVzLmdldCh0ZXJtaW5hbElkKT8ucHJveHkuZW1pdFJlYWR5KHBpZCwgY3dkLCB3aW5kb3dzUHR5KTtcblx0fVxuXG5cdHB1YmxpYyAkc2VuZFByb2Nlc3NQcm9wZXJ0eSh0ZXJtaW5hbElkOiBudW1iZXIsIHByb3BlcnR5OiBJUHJvY2Vzc1Byb3BlcnR5KTogdm9pZCB7XG5cdFx0aWYgKHByb3BlcnR5LnR5cGUgPT09IFByb2Nlc3NQcm9wZXJ0eVR5cGUuVGl0bGUpIHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmdldEluc3RhbmNlRnJvbUlkKHRlcm1pbmFsSWQpO1xuXHRcdFx0aW5zdGFuY2U/LnJlbmFtZShwcm9wZXJ0eS52YWx1ZSBhcyBJUHJvY2Vzc1Byb3BlcnR5TWFwW1Byb2Nlc3NQcm9wZXJ0eVR5cGUuVGl0bGVdKTtcblx0XHR9XG5cdFx0dGhpcy5fdGVybWluYWxQcm9jZXNzUHJveGllcy5nZXQodGVybWluYWxJZCk/LnByb3h5LmVtaXRQcm9jZXNzUHJvcGVydHkocHJvcGVydHkpO1xuXHR9XG5cblx0JHNldEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKGV4dGVuc2lvbklkZW50aWZpZXI6IHN0cmluZywgcGVyc2lzdGVudDogYm9vbGVhbiwgY29sbGVjdGlvbjogSVNlcmlhbGl6YWJsZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIHwgdW5kZWZpbmVkLCBkZXNjcmlwdGlvbk1hcDogSVNlcmlhbGl6YWJsZUVudmlyb25tZW50RGVzY3JpcHRpb25NYXApOiB2b2lkIHtcblx0XHRpZiAoY29sbGVjdGlvbikge1xuXHRcdFx0Y29uc3QgdHJhbnNsYXRlZENvbGxlY3Rpb24gPSB7XG5cdFx0XHRcdHBlcnNpc3RlbnQsXG5cdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihjb2xsZWN0aW9uKSxcblx0XHRcdFx0ZGVzY3JpcHRpb25NYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnREZXNjcmlwdGlvbk1hcChkZXNjcmlwdGlvbk1hcClcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9lbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZS5zZXQoZXh0ZW5zaW9uSWRlbnRpZmllciwgdHJhbnNsYXRlZENvbGxlY3Rpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9lbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZS5kZWxldGUoZXh0ZW5zaW9uSWRlbnRpZmllcik7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogRW5jYXBzdWxhdGVzIHRlbXBvcmFyeSB0cmFja2luZyBvZiBkYXRhIGV2ZW50cyBmcm9tIHRlcm1pbmFsIGluc3RhbmNlcywgb25jZSBkaXNwb3NlZCBhbGxcbiAqIGxpc3RlbmVycyBhcmUgcmVtb3ZlZC5cbiAqL1xuY2xhc3MgVGVybWluYWxEYXRhRXZlbnRUcmFja2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2J1ZmZlcmVyOiBUZXJtaW5hbERhdGFCdWZmZXJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5zdGFuY2VMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxudW1iZXI+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NhbGxiYWNrOiAoaWQ6IG51bWJlciwgZGF0YTogc3RyaW5nKSA9PiB2b2lkLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYnVmZmVyZXIgPSBuZXcgVGVybWluYWxEYXRhQnVmZmVyZXIodGhpcy5fY2FsbGJhY2spKTtcblxuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcykge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXJJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkRpZENyZWF0ZUluc3RhbmNlKGluc3RhbmNlID0+IHRoaXMuX3JlZ2lzdGVySW5zdGFuY2UoaW5zdGFuY2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxTZXJ2aWNlLm9uRGlkRGlzcG9zZUluc3RhbmNlKGluc3RhbmNlID0+IHtcblx0XHRcdHRoaXMuX2J1ZmZlcmVyLnN0b3BCdWZmZXJpbmcoaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0XHR0aGlzLl9pbnN0YW5jZUxpc3RlbmVycy5kZWxldGVBbmREaXNwb3NlKGluc3RhbmNlLmluc3RhbmNlSWQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVySW5zdGFuY2UoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7XG5cdFx0Ly8gQnVmZmVyIGRhdGEgZXZlbnRzIHRvIHJlZHVjZSB0aGUgYW1vdW50IG9mIG1lc3NhZ2VzIGdvaW5nIHRvIHRoZSBleHRlbnNpb24gaG9zdFxuXHRcdHRoaXMuX2luc3RhbmNlTGlzdGVuZXJzLnNldChpbnN0YW5jZS5pbnN0YW5jZUlkLCB0aGlzLl9idWZmZXJlci5zdGFydEJ1ZmZlcmluZyhpbnN0YW5jZS5pbnN0YW5jZUlkLCBpbnN0YW5jZS5vbkRhdGEpKTtcblx0fVxufVxuXG5jbGFzcyBFeHRlbnNpb25UZXJtaW5hbExpbmtQcm92aWRlciBpbXBsZW1lbnRzIElUZXJtaW5hbEV4dGVybmFsTGlua1Byb3ZpZGVyIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RUZXJtaW5hbFNlcnZpY2VTaGFwZVxuXHQpIHtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVMaW5rcyhpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGxpbmU6IHN0cmluZyk6IFByb21pc2U8SVRlcm1pbmFsTGlua1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcHJveHkgPSB0aGlzLl9wcm94eTtcblx0XHRjb25zdCBleHRIb3N0TGlua3MgPSBhd2FpdCBwcm94eS4kcHJvdmlkZUxpbmtzKGluc3RhbmNlLmluc3RhbmNlSWQsIGxpbmUpO1xuXHRcdHJldHVybiBleHRIb3N0TGlua3MubWFwKGR0byA9PiAoe1xuXHRcdFx0aWQ6IGR0by5pZCxcblx0XHRcdHN0YXJ0SW5kZXg6IGR0by5zdGFydEluZGV4LFxuXHRcdFx0bGVuZ3RoOiBkdG8ubGVuZ3RoLFxuXHRcdFx0bGFiZWw6IGR0by5sYWJlbCxcblx0XHRcdGFjdGl2YXRlOiAoKSA9PiBwcm94eS4kYWN0aXZhdGVMaW5rKGluc3RhbmNlLmluc3RhbmNlSWQsIGR0by5pZClcblx0XHR9KSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE91dHB1dE1hdGNoRm9yTGluZXMobGluZXM6IHN0cmluZ1tdLCBvdXRwdXRNYXRjaGVyOiBJVGVybWluYWxPdXRwdXRNYXRjaGVyKTogSVRlcm1pbmFsT3V0cHV0TWF0Y2ggfCB1bmRlZmluZWQge1xuXHRjb25zdCBtYXRjaDogUmVnRXhwTWF0Y2hBcnJheSB8IG51bGwgfCB1bmRlZmluZWQgPSBsaW5lcy5qb2luKCdcXG4nKS5tYXRjaChvdXRwdXRNYXRjaGVyLmxpbmVNYXRjaGVyKTtcblx0cmV0dXJuIG1hdGNoID8geyByZWdleE1hdGNoOiBtYXRjaCwgb3V0cHV0TGluZXM6IGxpbmVzIH0gOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHBhcnNlUXVpY2tGaXgoaWQ6IHN0cmluZywgc291cmNlOiBzdHJpbmcsIGZpeDogVGVybWluYWxRdWlja0ZpeCk6IElUZXJtaW5hbFF1aWNrRml4IHtcblx0bGV0IHR5cGUgPSBUZXJtaW5hbFF1aWNrRml4VHlwZS5UZXJtaW5hbENvbW1hbmQ7XG5cdGlmIChoYXNLZXkoZml4LCB7IHVyaTogdHJ1ZSB9KSkge1xuXHRcdGZpeC51cmkgPSBVUkkucmV2aXZlKGZpeC51cmkpO1xuXHRcdHR5cGUgPSBUZXJtaW5hbFF1aWNrRml4VHlwZS5PcGVuZXI7XG5cdH0gZWxzZSBpZiAoaGFzS2V5KGZpeCwgeyBpZDogdHJ1ZSB9KSkge1xuXHRcdHR5cGUgPSBUZXJtaW5hbFF1aWNrRml4VHlwZS5Wc2NvZGVDb21tYW5kO1xuXHR9XG5cdHJldHVybiB7IGlkLCB0eXBlLCBzb3VyY2UsIC4uLmZpeCB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUFpQixZQUF5QixtQkFBbUIsb0JBQW9CLHFCQUFxQjtBQUMvRyxTQUFTLGdCQUE2RSxtQkFBbUk7QUFDek4sU0FBUyw0QkFBNkM7QUFDdEQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQTZJLHFCQUFxQixvQkFBb0Isd0JBQWtEO0FBQ3hPLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0JBQXVELHVCQUF5RCx3QkFBd0I7QUFDakosU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxzQ0FBc0MsMENBQTBDLDhDQUE4QztBQUN2SSxTQUF1RSxpQ0FBaUMsK0JBQStCO0FBQ3ZJLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQTBCLFVBQVU7QUFFcEMsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUywwQkFBNkMsNEJBQTRCO0FBQ2xGLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsY0FBYztBQU9oQixJQUFNLDRCQUFOLGNBQXdDLFdBQXFEO0FBQUEsRUEyQm5HLFlBQ0MsaUJBQ21DLGtC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
