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
import { Event, Emitter } from "../../../../base/common/event.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { Disposable, DisposableMap } from "../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { OUTPUT_VIEW_ID, LOG_MIME, OUTPUT_MIME, Extensions, ACTIVE_OUTPUT_CHANNEL_CONTEXT, CONTEXT_ACTIVE_FILE_OUTPUT, CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE, CONTEXT_ACTIVE_OUTPUT_LEVEL, CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT, SHOW_DEBUG_FILTER_CONTEXT, SHOW_ERROR_FILTER_CONTEXT, SHOW_INFO_FILTER_CONTEXT, SHOW_TRACE_FILTER_CONTEXT, SHOW_WARNING_FILTER_CONTEXT, CONTEXT_ACTIVE_LOG_FILE_OUTPUT, isSingleSourceOutputChannelDescriptor, HIDE_CATEGORY_FILTER_CONTEXT, isMultiSourceOutputChannelDescriptor } from "../../../services/output/common/output.js";
import { OutputLinkProvider } from "./outputLinkProvider.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { ILogService, ILoggerService, LogLevel, LogLevelToString } from "../../../../platform/log/common/log.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { DelegatedOutputChannelModel, FileOutputChannelModel, MultiFileOutputChannelModel } from "../common/outputChannelModel.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { localize } from "../../../../nls.js";
import { joinPath } from "../../../../base/common/resources.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { telemetryLogId } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { toLocalISOString } from "../../../../base/common/date.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IDefaultLogLevelsService } from "../../../services/log/common/defaultLogLevels.js";
const OUTPUT_ACTIVE_CHANNEL_KEY = "output.activechannel";
let OutputChannel = class extends Disposable {
  constructor(outputChannelDescriptor, outputLocation, outputDirPromise, languageService, instantiationService) {
    super();
    this.outputChannelDescriptor = outputChannelDescriptor;
    this.outputLocation = outputLocation;
    this.outputDirPromise = outputDirPromise;
    this.languageService = languageService;
    this.instantiationService = instantiationService;
    this.scrollLock = false;
    this.id = outputChannelDescriptor.id;
    this.label = outputChannelDescriptor.label;
    this.uri = URI.from({ scheme: Schemas.outputChannel, path: this.id });
    this.model = this._register(this.createOutputChannelModel(this.uri, outputChannelDescriptor));
  }
  createOutputChannelModel(uri, outputChannelDescriptor) {
    const language = outputChannelDescriptor.languageId ? this.languageService.createById(outputChannelDescriptor.languageId) : this.languageService.createByMimeType(outputChannelDescriptor.log ? LOG_MIME : OUTPUT_MIME);
    if (isMultiSourceOutputChannelDescriptor(outputChannelDescriptor)) {
      return this.instantiationService.createInstance(MultiFileOutputChannelModel, uri, language, [...outputChannelDescriptor.source]);
    }
    if (isSingleSourceOutputChannelDescriptor(outputChannelDescriptor)) {
      return this.instantiationService.createInstance(FileOutputChannelModel, uri, language, outputChannelDescriptor.source);
    }
    return this.instantiationService.createInstance(DelegatedOutputChannelModel, this.id, uri, language, this.outputLocation, this.outputDirPromise);
  }
  getLogEntries() {
    return this.model.getLogEntries();
  }
  append(output) {
    this.model.append(output);
  }
  update(mode, till) {
    this.model.update(mode, till, true);
  }
  clear() {
    this.model.clear();
  }
  replace(value) {
    this.model.replace(value);
  }
};
OutputChannel = __decorateClass([
  __decorateParam(3, ILanguageService),
  __decorateParam(4, IInstantiationService)
], OutputChannel);
class OutputViewFilters extends Disposable {
  constructor(options, contextKeyService) {
    super();
    this.contextKeyService = contextKeyService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._filterText = "";
    this._includePatterns = [];
    this._excludePatterns = [];
    this._trace = SHOW_TRACE_FILTER_CONTEXT.bindTo(this.contextKeyService);
    this._trace.set(options.trace);
    this._debug = SHOW_DEBUG_FILTER_CONTEXT.bindTo(this.contextKeyService);
    this._debug.set(options.debug);
    this._info = SHOW_INFO_FILTER_CONTEXT.bindTo(this.contextKeyService);
    this._info.set(options.info);
    this._warning = SHOW_WARNING_FILTER_CONTEXT.bindTo(this.contextKeyService);
    this._warning.set(options.warning);
    this._error = SHOW_ERROR_FILTER_CONTEXT.bindTo(this.contextKeyService);
    this._error.set(options.error);
    this._categories = HIDE_CATEGORY_FILTER_CONTEXT.bindTo(this.contextKeyService);
    this._categories.set(options.sources);
    this.filterHistory = options.filterHistory;
  }
  get text() {
    return this._filterText;
  }
  set text(filterText) {
    if (this._filterText !== filterText) {
      this._filterText = filterText;
      const { includePatterns, excludePatterns } = this.parseText(filterText);
      this._includePatterns = includePatterns;
      this._excludePatterns = excludePatterns;
      this._onDidChange.fire();
    }
  }
  parseText(filterText) {
    const includePatterns = [];
    const excludePatterns = [];
    const patterns = this.splitByCommaRespectingQuotes(filterText);
    for (const pattern of patterns) {
      const trimmed = pattern.trim();
      if (trimmed.length === 0) {
        continue;
      }
      if (trimmed.startsWith("!")) {
        const negativePattern = trimmed.substring(1).trim();
        if (negativePattern.length > 0) {
          excludePatterns.push(negativePattern);
        }
      } else {
        includePatterns.push(trimmed);
      }
    }
    return { includePatterns, excludePatterns };
  }
  get includePatterns() {
    return this._includePatterns;
  }
  get excludePatterns() {
    return this._excludePatterns;
  }
  splitByCommaRespectingQuotes(text) {
    const patterns = [];
    let current = "";
    let inQuotes = false;
    let quoteChar = "";
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (!inQuotes && char === '"') {
        inQuotes = true;
        quoteChar = char;
        current += char;
      } else if (inQuotes && char === quoteChar) {
        inQuotes = false;
        current += char;
      } else if (!inQuotes && char === ",") {
        if (current.length > 0) {
          patterns.push(current);
        }
        current = "";
      } else {
        current += char;
      }
    }
    if (current.length > 0) {
      patterns.push(current);
    }
    return patterns;
  }
  get trace() {
    return !!this._trace.get();
  }
  set trace(trace) {
    if (this._trace.get() !== trace) {
      this._trace.set(trace);
      this._onDidChange.fire();
    }
  }
  get debug() {
    return !!this._debug.get();
  }
  set debug(debug) {
    if (this._debug.get() !== debug) {
      this._debug.set(debug);
      this._onDidChange.fire();
    }
  }
  get info() {
    return !!this._info.get();
  }
  set info(info) {
    if (this._info.get() !== info) {
      this._info.set(info);
      this._onDidChange.fire();
    }
  }
  get warning() {
    return !!this._warning.get();
  }
  set warning(warning) {
    if (this._warning.get() !== warning) {
      this._warning.set(warning);
      this._onDidChange.fire();
    }
  }
  get error() {
    return !!this._error.get();
  }
  set error(error) {
    if (this._error.get() !== error) {
      this._error.set(error);
      this._onDidChange.fire();
    }
  }
  get categories() {
    return this._categories.get() || ",";
  }
  set categories(categories) {
    this._categories.set(categories);
    this._onDidChange.fire();
  }
  toggleCategory(category) {
    const categories = this.categories;
    if (this.hasCategory(category)) {
      this.categories = categories.replace(`,${category},`, ",");
    } else {
      this.categories = `${categories}${category},`;
    }
  }
  hasCategory(category) {
    if (category === ",") {
      return false;
    }
    return this.categories.includes(`,${category},`);
  }
}
let OutputService = class extends Disposable {
  constructor(storageService, instantiationService, textModelService, logService, loggerService, lifecycleService, viewsService, contextKeyService, defaultLogLevelsService, fileDialogService, fileService, environmentService) {
    super();
    this.storageService = storageService;
    this.instantiationService = instantiationService;
    this.textModelService = textModelService;
    this.logService = logService;
    this.loggerService = loggerService;
    this.lifecycleService = lifecycleService;
    this.viewsService = viewsService;
    this.defaultLogLevelsService = defaultLogLevelsService;
    this.fileDialogService = fileDialogService;
    this.fileService = fileService;
    this.channels = this._register(new DisposableMap());
    this._onActiveOutputChannel = this._register(new Emitter());
    this.onActiveOutputChannel = this._onActiveOutputChannel.event;
    this.outputFolderCreationPromise = null;
    this.activeChannelIdInStorage = this.storageService.get(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE, "");
    this.activeOutputChannelContext = ACTIVE_OUTPUT_CHANNEL_CONTEXT.bindTo(contextKeyService);
    this.activeOutputChannelContext.set(this.activeChannelIdInStorage);
    this._register(this.onActiveOutputChannel((channel) => this.activeOutputChannelContext.set(channel)));
    this.activeFileOutputChannelContext = CONTEXT_ACTIVE_FILE_OUTPUT.bindTo(contextKeyService);
    this.activeLogOutputChannelContext = CONTEXT_ACTIVE_LOG_FILE_OUTPUT.bindTo(contextKeyService);
    this.activeOutputChannelLevelSettableContext = CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE.bindTo(contextKeyService);
    this.activeOutputChannelLevelContext = CONTEXT_ACTIVE_OUTPUT_LEVEL.bindTo(contextKeyService);
    this.activeOutputChannelLevelIsDefaultContext = CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT.bindTo(contextKeyService);
    this.outputLocation = joinPath(environmentService.windowLogsPath, `output_${toLocalISOString(/* @__PURE__ */ new Date()).replace(/-|:|\.\d+Z$/g, "")}`);
    this._register(textModelService.registerTextModelContentProvider(Schemas.outputChannel, this));
    this._register(instantiationService.createInstance(OutputLinkProvider));
    const registry = Registry.as(Extensions.OutputChannels);
    for (const channelIdentifier of registry.getChannels()) {
      this.onDidRegisterChannel(channelIdentifier.id);
    }
    this._register(registry.onDidRegisterChannel((id) => this.onDidRegisterChannel(id)));
    this._register(registry.onDidUpdateChannelSources((channel) => this.onDidUpdateChannelSources(channel)));
    this._register(registry.onDidRemoveChannel((channel) => this.onDidRemoveChannel(channel)));
    if (!this.activeChannel) {
      const channels = this.getChannelDescriptors();
      this.setActiveChannel(channels && channels.length > 0 ? this.getChannel(channels[0].id) : void 0);
    }
    this._register(Event.filter(this.viewsService.onDidChangeViewVisibility, (e) => e.id === OUTPUT_VIEW_ID && e.visible)(() => {
      if (this.activeChannel) {
        this.viewsService.getActiveViewWithId(OUTPUT_VIEW_ID)?.showChannel(this.activeChannel, true);
      }
    }));
    this._register(this.loggerService.onDidChangeLogLevel(() => {
      this.setLevelContext();
      this.setLevelIsDefaultContext();
    }));
    this._register(this.defaultLogLevelsService.onDidChangeDefaultLogLevels(() => {
      this.setLevelIsDefaultContext();
    }));
    this._register(this.lifecycleService.onDidShutdown(() => this.dispose()));
    this.filters = this._register(new OutputViewFilters({
      filterHistory: [],
      trace: true,
      debug: true,
      info: true,
      warning: true,
      error: true,
      sources: ""
    }, contextKeyService));
  }
  provideTextContent(resource) {
    const channel = this.getChannel(resource.path);
    if (channel) {
      return channel.model.loadModel();
    }
    return null;
  }
  async showChannel(id, preserveFocus) {
    const channel = this.getChannel(id);
    if (this.activeChannel?.id !== channel?.id) {
      this.setActiveChannel(channel);
      this._onActiveOutputChannel.fire(id);
    }
    const outputView = await this.viewsService.openView(OUTPUT_VIEW_ID, !preserveFocus);
    if (outputView && channel) {
      outputView.showChannel(channel, !!preserveFocus);
    }
  }
  getChannel(id) {
    return this.channels.get(id);
  }
  getChannelDescriptor(id) {
    return Registry.as(Extensions.OutputChannels).getChannel(id);
  }
  getChannelDescriptors() {
    return Registry.as(Extensions.OutputChannels).getChannels();
  }
  getActiveChannel() {
    return this.activeChannel;
  }
  canSetLogLevel(channel) {
    return channel.log && channel.id !== telemetryLogId;
  }
  getLogLevel(channel) {
    if (!channel.log) {
      return void 0;
    }
    const sources = isSingleSourceOutputChannelDescriptor(channel) ? [channel.source] : isMultiSourceOutputChannelDescriptor(channel) ? channel.source : [];
    if (sources.length === 0) {
      return void 0;
    }
    const logLevel = this.loggerService.getLogLevel();
    return sources.reduce((prev, curr) => Math.min(prev, this.loggerService.getLogLevel(curr.resource) ?? logLevel), LogLevel.Error);
  }
  setLogLevel(channel, logLevel) {
    if (!channel.log) {
      return;
    }
    const sources = isSingleSourceOutputChannelDescriptor(channel) ? [channel.source] : isMultiSourceOutputChannelDescriptor(channel) ? channel.source : [];
    if (sources.length === 0) {
      return;
    }
    for (const source of sources) {
      this.loggerService.setLogLevel(source.resource, logLevel);
    }
  }
  registerCompoundLogChannel(descriptors) {
    const outputChannelRegistry = Registry.as(Extensions.OutputChannels);
    descriptors.sort((a, b) => a.label.localeCompare(b.label));
    const id = descriptors.map((r) => r.id.toLowerCase()).join("-");
    if (!outputChannelRegistry.getChannel(id)) {
      outputChannelRegistry.registerChannel({
        id,
        label: descriptors.map((r) => r.label).join(", "),
        log: descriptors.some((r) => r.log),
        user: true,
        source: descriptors.map((descriptor) => {
          if (isSingleSourceOutputChannelDescriptor(descriptor)) {
            return [{ resource: descriptor.source.resource, name: descriptor.source.name ?? descriptor.label }];
          }
          if (isMultiSourceOutputChannelDescriptor(descriptor)) {
            return descriptor.source;
          }
          const channel = this.getChannel(descriptor.id);
          if (channel) {
            return channel.model.source;
          }
          return [];
        }).flat()
      });
    }
    return id;
  }
  async saveOutputAs(outputPath, ...channels) {
    let channel;
    if (channels.length > 1) {
      const compoundChannelId = this.registerCompoundLogChannel(channels);
      channel = this.getChannel(compoundChannelId);
    } else {
      channel = this.getChannel(channels[0].id);
    }
    if (!channel) {
      return;
    }
    try {
      let uri = outputPath;
      if (!uri) {
        const name = channels.length > 1 ? "output" : channels[0].label;
        uri = await this.fileDialogService.showSaveDialog({
          title: localize("saveLog.dialogTitle", "Save Output As"),
          availableFileSystems: [Schemas.file],
          defaultUri: joinPath(await this.fileDialogService.defaultFilePath(), `${name}.log`),
          filters: [{
            name,
            extensions: ["log"]
          }]
        });
      }
      if (!uri) {
        return;
      }
      const modelRef = await this.textModelService.createModelReference(channel.uri);
      try {
        await this.fileService.writeFile(uri, VSBuffer.fromString(modelRef.object.textEditorModel.getValue()));
      } finally {
        modelRef.dispose();
      }
      return;
    } finally {
      if (channels.length > 1) {
        Registry.as(Extensions.OutputChannels).removeChannel(channel.id);
      }
    }
  }
  async onDidRegisterChannel(channelId) {
    const channel = this.createChannel(channelId);
    this.channels.set(channelId, channel);
    if (!this.activeChannel || this.activeChannelIdInStorage === channelId) {
      this.setActiveChannel(channel);
      this._onActiveOutputChannel.fire(channelId);
      const outputView = this.viewsService.getActiveViewWithId(OUTPUT_VIEW_ID);
      outputView?.showChannel(channel, true);
    }
  }
  onDidUpdateChannelSources(channel) {
    const outputChannel = this.channels.get(channel.id);
    if (outputChannel) {
      outputChannel.model.updateChannelSources(channel.source);
    }
  }
  onDidRemoveChannel(channel) {
    if (this.activeChannel?.id === channel.id) {
      const channels = this.getChannelDescriptors();
      if (channels[0]) {
        this.showChannel(channels[0].id);
      }
    }
    this.channels.deleteAndDispose(channel.id);
  }
  createChannel(id) {
    const channel = this.instantiateChannel(id);
    this._register(Event.once(channel.model.onDispose)(() => {
      if (this.activeChannel === channel) {
        const channels = this.getChannelDescriptors();
        const channel2 = channels.length ? this.getChannel(channels[0].id) : void 0;
        if (channel2 && this.viewsService.isViewVisible(OUTPUT_VIEW_ID)) {
          this.showChannel(channel2.id);
        } else {
          this.setActiveChannel(void 0);
        }
      }
      Registry.as(Extensions.OutputChannels).removeChannel(id);
    }));
    return channel;
  }
  instantiateChannel(id) {
    const channelData = Registry.as(Extensions.OutputChannels).getChannel(id);
    if (!channelData) {
      this.logService.error(`Channel '${id}' is not registered yet`);
      throw new Error(`Channel '${id}' is not registered yet`);
    }
    if (!this.outputFolderCreationPromise) {
      this.outputFolderCreationPromise = this.fileService.createFolder(this.outputLocation).then(() => void 0);
    }
    return this.instantiationService.createInstance(OutputChannel, channelData, this.outputLocation, this.outputFolderCreationPromise);
  }
  setLevelContext() {
    const descriptor = this.activeChannel?.outputChannelDescriptor;
    const channelLogLevel = descriptor ? this.getLogLevel(descriptor) : void 0;
    this.activeOutputChannelLevelContext.set(channelLogLevel !== void 0 ? LogLevelToString(channelLogLevel) : "");
  }
  async setLevelIsDefaultContext() {
    const descriptor = this.activeChannel?.outputChannelDescriptor;
    const channelLogLevel = descriptor ? this.getLogLevel(descriptor) : void 0;
    if (channelLogLevel !== void 0) {
      const channelDefaultLogLevel = this.defaultLogLevelsService.getDefaultLogLevel(descriptor?.extensionId);
      this.activeOutputChannelLevelIsDefaultContext.set(channelDefaultLogLevel === channelLogLevel);
    } else {
      this.activeOutputChannelLevelIsDefaultContext.set(false);
    }
  }
  setActiveChannel(channel) {
    this.activeChannel = channel;
    const descriptor = channel?.outputChannelDescriptor;
    this.activeFileOutputChannelContext.set(!!descriptor && isSingleSourceOutputChannelDescriptor(descriptor));
    this.activeLogOutputChannelContext.set(!!descriptor?.log);
    this.activeOutputChannelLevelSettableContext.set(descriptor !== void 0 && this.canSetLogLevel(descriptor));
    this.setLevelIsDefaultContext();
    this.setLevelContext();
    if (this.activeChannel) {
      this.storageService.store(OUTPUT_ACTIVE_CHANNEL_KEY, this.activeChannel.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(OUTPUT_ACTIVE_CHANNEL_KEY, StorageScope.WORKSPACE);
    }
  }
};
OutputService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, ILogService),
  __decorateParam(4, ILoggerService),
  __decorateParam(5, ILifecycleService),
  __decorateParam(6, IViewsService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IDefaultLogLevelsService),
  __decorateParam(9, IFileDialogService),
  __decorateParam(10, IFileService),
  __decorateParam(11, IWorkbenchEnvironmentService)
], OutputService);
export {
  OutputService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL291dHB1dC9icm93c2VyL291dHB1dFNlcnZpY2VzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJT3V0cHV0Q2hhbm5lbCwgSU91dHB1dFNlcnZpY2UsIE9VVFBVVF9WSUVXX0lELCBMT0dfTUlNRSwgT1VUUFVUX01JTUUsIE91dHB1dENoYW5uZWxVcGRhdGVNb2RlLCBJT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IsIEV4dGVuc2lvbnMsIElPdXRwdXRDaGFubmVsUmVnaXN0cnksIEFDVElWRV9PVVRQVVRfQ0hBTk5FTF9DT05URVhULCBDT05URVhUX0FDVElWRV9GSUxFX09VVFBVVCwgQ09OVEVYVF9BQ1RJVkVfT1VUUFVUX0xFVkVMX1NFVFRBQkxFLCBDT05URVhUX0FDVElWRV9PVVRQVVRfTEVWRUwsIENPTlRFWFRfQUNUSVZFX09VVFBVVF9MRVZFTF9JU19ERUZBVUxULCBJT3V0cHV0Vmlld0ZpbHRlcnMsIFNIT1dfREVCVUdfRklMVEVSX0NPTlRFWFQsIFNIT1dfRVJST1JfRklMVEVSX0NPTlRFWFQsIFNIT1dfSU5GT19GSUxURVJfQ09OVEVYVCwgU0hPV19UUkFDRV9GSUxURVJfQ09OVEVYVCwgU0hPV19XQVJOSU5HX0ZJTFRFUl9DT05URVhULCBDT05URVhUX0FDVElWRV9MT0dfRklMRV9PVVRQVVQsIElNdWx0aVNvdXJjZU91dHB1dENoYW5uZWxEZXNjcmlwdG9yLCBpc1NpbmdsZVNvdXJjZU91dHB1dENoYW5uZWxEZXNjcmlwdG9yLCBISURFX0NBVEVHT1JZX0ZJTFRFUl9DT05URVhULCBpc011bHRpU291cmNlT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IsIElMb2dFbnRyeSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL291dHB1dC9jb21tb24vb3V0cHV0LmpzJztcbmltcG9ydCB7IE91dHB1dExpbmtQcm92aWRlciB9IGZyb20gJy4vb3V0cHV0TGlua1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlLCBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIElMb2dnZXJTZXJ2aWNlLCBMb2dMZXZlbCwgTG9nTGV2ZWxUb1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRGVsZWdhdGVkT3V0cHV0Q2hhbm5lbE1vZGVsLCBGaWxlT3V0cHV0Q2hhbm5lbE1vZGVsLCBJT3V0cHV0Q2hhbm5lbE1vZGVsLCBNdWx0aUZpbGVPdXRwdXRDaGFubmVsTW9kZWwgfSBmcm9tICcuLi9jb21tb24vb3V0cHV0Q2hhbm5lbE1vZGVsLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE91dHB1dFZpZXdQYW5lIH0gZnJvbSAnLi9vdXRwdXRWaWV3LmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyB0ZWxlbWV0cnlMb2dJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgdG9Mb2NhbElTT1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRMb2dMZXZlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbG9nL2NvbW1vbi9kZWZhdWx0TG9nTGV2ZWxzLmpzJztcblxuY29uc3QgT1VUUFVUX0FDVElWRV9DSEFOTkVMX0tFWSA9ICdvdXRwdXQuYWN0aXZlY2hhbm5lbCc7XG5cbmNsYXNzIE91dHB1dENoYW5uZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU91dHB1dENoYW5uZWwge1xuXG5cdHNjcm9sbExvY2s6IGJvb2xlYW4gPSBmYWxzZTtcblx0cmVhZG9ubHkgbW9kZWw6IElPdXRwdXRDaGFubmVsTW9kZWw7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHVyaTogVVJJO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG91dHB1dENoYW5uZWxEZXNjcmlwdG9yOiBJT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvdXRwdXRMb2NhdGlvbjogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3V0cHV0RGlyUHJvbWlzZTogUHJvbWlzZTx2b2lkPixcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmlkID0gb3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IuaWQ7XG5cdFx0dGhpcy5sYWJlbCA9IG91dHB1dENoYW5uZWxEZXNjcmlwdG9yLmxhYmVsO1xuXHRcdHRoaXMudXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMub3V0cHV0Q2hhbm5lbCwgcGF0aDogdGhpcy5pZCB9KTtcblx0XHR0aGlzLm1vZGVsID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jcmVhdGVPdXRwdXRDaGFubmVsTW9kZWwodGhpcy51cmksIG91dHB1dENoYW5uZWxEZXNjcmlwdG9yKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU91dHB1dENoYW5uZWxNb2RlbCh1cmk6IFVSSSwgb3V0cHV0Q2hhbm5lbERlc2NyaXB0b3I6IElPdXRwdXRDaGFubmVsRGVzY3JpcHRvcik6IElPdXRwdXRDaGFubmVsTW9kZWwge1xuXHRcdGNvbnN0IGxhbmd1YWdlID0gb3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IubGFuZ3VhZ2VJZCA/IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQob3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IubGFuZ3VhZ2VJZCkgOiB0aGlzLmxhbmd1YWdlU2VydmljZS5jcmVhdGVCeU1pbWVUeXBlKG91dHB1dENoYW5uZWxEZXNjcmlwdG9yLmxvZyA/IExPR19NSU1FIDogT1VUUFVUX01JTUUpO1xuXHRcdGlmIChpc011bHRpU291cmNlT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3Iob3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNdWx0aUZpbGVPdXRwdXRDaGFubmVsTW9kZWwsIHVyaSwgbGFuZ3VhZ2UsIFsuLi5vdXRwdXRDaGFubmVsRGVzY3JpcHRvci5zb3VyY2VdKTtcblx0XHR9XG5cdFx0aWYgKGlzU2luZ2xlU291cmNlT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3Iob3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWxlT3V0cHV0Q2hhbm5lbE1vZGVsLCB1cmksIGxhbmd1YWdlLCBvdXRwdXRDaGFubmVsRGVzY3JpcHRvci5zb3VyY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWxlZ2F0ZWRPdXRwdXRDaGFubmVsTW9kZWwsIHRoaXMuaWQsIHVyaSwgbGFuZ3VhZ2UsIHRoaXMub3V0cHV0TG9jYXRpb24sIHRoaXMub3V0cHV0RGlyUHJvbWlzZSk7XG5cdH1cblxuXHRnZXRMb2dFbnRyaWVzKCk6IFJlYWRvbmx5QXJyYXk8SUxvZ0VudHJ5PiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0TG9nRW50cmllcygpO1xuXHR9XG5cblx0YXBwZW5kKG91dHB1dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbC5hcHBlbmQob3V0cHV0KTtcblx0fVxuXG5cdHVwZGF0ZShtb2RlOiBPdXRwdXRDaGFubmVsVXBkYXRlTW9kZSwgdGlsbD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMubW9kZWwudXBkYXRlKG1vZGUsIHRpbGwsIHRydWUpO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbC5jbGVhcigpO1xuXHR9XG5cblx0cmVwbGFjZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbC5yZXBsYWNlKHZhbHVlKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSU91dHB1dEZpbHRlck9wdGlvbnMge1xuXHRmaWx0ZXJIaXN0b3J5OiBzdHJpbmdbXTtcblx0dHJhY2U6IGJvb2xlYW47XG5cdGRlYnVnOiBib29sZWFuO1xuXHRpbmZvOiBib29sZWFuO1xuXHR3YXJuaW5nOiBib29sZWFuO1xuXHRlcnJvcjogYm9vbGVhbjtcblx0c291cmNlczogc3RyaW5nO1xufVxuXG5jbGFzcyBPdXRwdXRWaWV3RmlsdGVycyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJT3V0cHV0Vmlld0ZpbHRlcnMge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSU91dHB1dEZpbHRlck9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl90cmFjZSA9IFNIT1dfVFJBQ0VfRklMVEVSX0NPTlRFWFQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3RyYWNlLnNldChvcHRpb25zLnRyYWNlKTtcblxuXHRcdHRoaXMuX2RlYnVnID0gU0hPV19ERUJVR19GSUxURVJfQ09OVEVYVC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fZGVidWcuc2V0KG9wdGlvbnMuZGVidWcpO1xuXG5cdFx0dGhpcy5faW5mbyA9IFNIT1dfSU5GT19GSUxURVJfQ09OVEVYVC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faW5mby5zZXQob3B0aW9ucy5pbmZvKTtcblxuXHRcdHRoaXMuX3dhcm5pbmcgPSBTSE9XX1dBUk5JTkdfRklMVEVSX0NPTlRFWFQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3dhcm5pbmcuc2V0KG9wdGlvbnMud2FybmluZyk7XG5cblx0XHR0aGlzLl9lcnJvciA9IFNIT1dfRVJST1JfRklMVEVSX0NPTlRFWFQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2Vycm9yLnNldChvcHRpb25zLmVycm9yKTtcblxuXHRcdHRoaXMuX2NhdGVnb3JpZXMgPSBISURFX0NBVEVHT1JZX0ZJTFRFUl9DT05URVhULmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jYXRlZ29yaWVzLnNldChvcHRpb25zLnNvdXJjZXMpO1xuXG5cdFx0dGhpcy5maWx0ZXJIaXN0b3J5ID0gb3B0aW9ucy5maWx0ZXJIaXN0b3J5O1xuXHR9XG5cblx0ZmlsdGVySGlzdG9yeTogc3RyaW5nW107XG5cblx0cHJpdmF0ZSBfZmlsdGVyVGV4dCA9ICcnO1xuXHRwcml2YXRlIF9pbmNsdWRlUGF0dGVybnM6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgX2V4Y2x1ZGVQYXR0ZXJuczogc3RyaW5nW10gPSBbXTtcblx0Z2V0IHRleHQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fZmlsdGVyVGV4dDtcblx0fVxuXHRzZXQgdGV4dChmaWx0ZXJUZXh0OiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5fZmlsdGVyVGV4dCAhPT0gZmlsdGVyVGV4dCkge1xuXHRcdFx0dGhpcy5fZmlsdGVyVGV4dCA9IGZpbHRlclRleHQ7XG5cdFx0XHRjb25zdCB7IGluY2x1ZGVQYXR0ZXJucywgZXhjbHVkZVBhdHRlcm5zIH0gPSB0aGlzLnBhcnNlVGV4dChmaWx0ZXJUZXh0KTtcblx0XHRcdHRoaXMuX2luY2x1ZGVQYXR0ZXJucyA9IGluY2x1ZGVQYXR0ZXJucztcblx0XHRcdHRoaXMuX2V4Y2x1ZGVQYXR0ZXJucyA9IGV4Y2x1ZGVQYXR0ZXJucztcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHR9XG5cdH1cblx0cHJpdmF0ZSBwYXJzZVRleHQoZmlsdGVyVGV4dDogc3RyaW5nKTogeyBpbmNsdWRlUGF0dGVybnM6IHN0cmluZ1tdOyBleGNsdWRlUGF0dGVybnM6IHN0cmluZ1tdIH0ge1xuXHRcdGNvbnN0IGluY2x1ZGVQYXR0ZXJuczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBleGNsdWRlUGF0dGVybnM6IHN0cmluZ1tdID0gW107XG5cblx0XHQvLyBQYXJzZSBwYXR0ZXJucyByZXNwZWN0aW5nIHF1b3RlZCBzdHJpbmdzXG5cdFx0Y29uc3QgcGF0dGVybnMgPSB0aGlzLnNwbGl0QnlDb21tYVJlc3BlY3RpbmdRdW90ZXMoZmlsdGVyVGV4dCk7XG5cblx0XHRmb3IgKGNvbnN0IHBhdHRlcm4gb2YgcGF0dGVybnMpIHtcblx0XHRcdGNvbnN0IHRyaW1tZWQgPSBwYXR0ZXJuLnRyaW0oKTtcblx0XHRcdGlmICh0cmltbWVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRyaW1tZWQuc3RhcnRzV2l0aCgnIScpKSB7XG5cdFx0XHRcdC8vIE5lZ2F0aXZlIGZpbHRlciAtIHJlbW92ZSB0aGUgISBwcmVmaXhcblx0XHRcdFx0Y29uc3QgbmVnYXRpdmVQYXR0ZXJuID0gdHJpbW1lZC5zdWJzdHJpbmcoMSkudHJpbSgpO1xuXHRcdFx0XHRpZiAobmVnYXRpdmVQYXR0ZXJuLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRleGNsdWRlUGF0dGVybnMucHVzaChuZWdhdGl2ZVBhdHRlcm4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpbmNsdWRlUGF0dGVybnMucHVzaCh0cmltbWVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBpbmNsdWRlUGF0dGVybnMsIGV4Y2x1ZGVQYXR0ZXJucyB9O1xuXHR9XG5cblx0Z2V0IGluY2x1ZGVQYXR0ZXJucygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2luY2x1ZGVQYXR0ZXJucztcblx0fVxuXG5cdGdldCBleGNsdWRlUGF0dGVybnMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9leGNsdWRlUGF0dGVybnM7XG5cdH1cblxuXHRwcml2YXRlIHNwbGl0QnlDb21tYVJlc3BlY3RpbmdRdW90ZXModGV4dDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHBhdHRlcm5zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBjdXJyZW50ID0gJyc7XG5cdFx0bGV0IGluUXVvdGVzID0gZmFsc2U7XG5cdFx0bGV0IHF1b3RlQ2hhciA9ICcnO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0ZXh0Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBjaGFyID0gdGV4dFtpXTtcblxuXHRcdFx0aWYgKCFpblF1b3RlcyAmJiAoY2hhciA9PT0gJ1wiJykpIHtcblx0XHRcdFx0Ly8gU3RhcnQgb2YgcXVvdGVkIHN0cmluZ1xuXHRcdFx0XHRpblF1b3RlcyA9IHRydWU7XG5cdFx0XHRcdHF1b3RlQ2hhciA9IGNoYXI7XG5cdFx0XHRcdGN1cnJlbnQgKz0gY2hhcjtcblx0XHRcdH0gZWxzZSBpZiAoaW5RdW90ZXMgJiYgY2hhciA9PT0gcXVvdGVDaGFyKSB7XG5cdFx0XHRcdC8vIEVuZCBvZiBxdW90ZWQgc3RyaW5nXG5cdFx0XHRcdGluUXVvdGVzID0gZmFsc2U7XG5cdFx0XHRcdGN1cnJlbnQgKz0gY2hhcjtcblx0XHRcdH0gZWxzZSBpZiAoIWluUXVvdGVzICYmIGNoYXIgPT09ICcsJykge1xuXHRcdFx0XHQvLyBDb21tYSBvdXRzaWRlIHF1b3RlcyAtIHNwbGl0IGhlcmVcblx0XHRcdFx0aWYgKGN1cnJlbnQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHBhdHRlcm5zLnB1c2goY3VycmVudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3VycmVudCA9ICcnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y3VycmVudCArPSBjaGFyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkZCB0aGUgbGFzdCBwYXR0ZXJuXG5cdFx0aWYgKGN1cnJlbnQubGVuZ3RoID4gMCkge1xuXHRcdFx0cGF0dGVybnMucHVzaChjdXJyZW50KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGF0dGVybnM7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFjZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdGdldCB0cmFjZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl90cmFjZS5nZXQoKTtcblx0fVxuXHRzZXQgdHJhY2UodHJhY2U6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5fdHJhY2UuZ2V0KCkgIT09IHRyYWNlKSB7XG5cdFx0XHR0aGlzLl90cmFjZS5zZXQodHJhY2UpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0Z2V0IGRlYnVnKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2RlYnVnLmdldCgpO1xuXHR9XG5cdHNldCBkZWJ1ZyhkZWJ1ZzogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9kZWJ1Zy5nZXQoKSAhPT0gZGVidWcpIHtcblx0XHRcdHRoaXMuX2RlYnVnLnNldChkZWJ1Zyk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5mbzogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdGdldCBpbmZvKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2luZm8uZ2V0KCk7XG5cdH1cblx0c2V0IGluZm8oaW5mbzogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9pbmZvLmdldCgpICE9PSBpbmZvKSB7XG5cdFx0XHR0aGlzLl9pbmZvLnNldChpbmZvKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF93YXJuaW5nOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0Z2V0IHdhcm5pbmcoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fd2FybmluZy5nZXQoKTtcblx0fVxuXHRzZXQgd2FybmluZyh3YXJuaW5nOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX3dhcm5pbmcuZ2V0KCkgIT09IHdhcm5pbmcpIHtcblx0XHRcdHRoaXMuX3dhcm5pbmcuc2V0KHdhcm5pbmcpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Vycm9yOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0Z2V0IGVycm9yKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2Vycm9yLmdldCgpO1xuXHR9XG5cdHNldCBlcnJvcihlcnJvcjogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9lcnJvci5nZXQoKSAhPT0gZXJyb3IpIHtcblx0XHRcdHRoaXMuX2Vycm9yLnNldChlcnJvcik7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2F0ZWdvcmllczogSUNvbnRleHRLZXk8c3RyaW5nPjtcblx0Z2V0IGNhdGVnb3JpZXMoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fY2F0ZWdvcmllcy5nZXQoKSB8fCAnLCc7XG5cdH1cblx0c2V0IGNhdGVnb3JpZXMoY2F0ZWdvcmllczogc3RyaW5nKSB7XG5cdFx0dGhpcy5fY2F0ZWdvcmllcy5zZXQoY2F0ZWdvcmllcyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0dG9nZ2xlQ2F0ZWdvcnkoY2F0ZWdvcnk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNhdGVnb3JpZXMgPSB0aGlzLmNhdGVnb3JpZXM7XG5cdFx0aWYgKHRoaXMuaGFzQ2F0ZWdvcnkoY2F0ZWdvcnkpKSB7XG5cdFx0XHR0aGlzLmNhdGVnb3JpZXMgPSBjYXRlZ29yaWVzLnJlcGxhY2UoYCwke2NhdGVnb3J5fSxgLCAnLCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNhdGVnb3JpZXMgPSBgJHtjYXRlZ29yaWVzfSR7Y2F0ZWdvcnl9LGA7XG5cdFx0fVxuXHR9XG5cblx0aGFzQ2F0ZWdvcnkoY2F0ZWdvcnk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmIChjYXRlZ29yeSA9PT0gJywnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNhdGVnb3JpZXMuaW5jbHVkZXMoYCwke2NhdGVnb3J5fSxgKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3V0cHV0U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJT3V0cHV0U2VydmljZSwgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjaGFubmVscyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgT3V0cHV0Q2hhbm5lbD4oKSk7XG5cdHByaXZhdGUgYWN0aXZlQ2hhbm5lbElkSW5TdG9yYWdlOiBzdHJpbmc7XG5cdHByaXZhdGUgYWN0aXZlQ2hhbm5lbD86IE91dHB1dENoYW5uZWw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25BY3RpdmVPdXRwdXRDaGFubmVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25BY3RpdmVPdXRwdXRDaGFubmVsOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25BY3RpdmVPdXRwdXRDaGFubmVsLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlT3V0cHV0Q2hhbm5lbENvbnRleHQ6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlRmlsZU91dHB1dENoYW5uZWxDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVMb2dPdXRwdXRDaGFubmVsQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlT3V0cHV0Q2hhbm5lbExldmVsU2V0dGFibGVDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVPdXRwdXRDaGFubmVsTGV2ZWxDb250ZXh0OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2ZU91dHB1dENoYW5uZWxMZXZlbElzRGVmYXVsdENvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgb3V0cHV0TG9jYXRpb246IFVSSTtcblxuXHRyZWFkb25seSBmaWx0ZXJzOiBPdXRwdXRWaWV3RmlsdGVycztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUxvZ2dlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElEZWZhdWx0TG9nTGV2ZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRMb2dMZXZlbHNTZXJ2aWNlOiBJRGVmYXVsdExvZ0xldmVsc1NlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5hY3RpdmVDaGFubmVsSWRJblN0b3JhZ2UgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChPVVRQVVRfQUNUSVZFX0NIQU5ORUxfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAnJyk7XG5cdFx0dGhpcy5hY3RpdmVPdXRwdXRDaGFubmVsQ29udGV4dCA9IEFDVElWRV9PVVRQVVRfQ0hBTk5FTF9DT05URVhULmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5hY3RpdmVPdXRwdXRDaGFubmVsQ29udGV4dC5zZXQodGhpcy5hY3RpdmVDaGFubmVsSWRJblN0b3JhZ2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25BY3RpdmVPdXRwdXRDaGFubmVsKGNoYW5uZWwgPT4gdGhpcy5hY3RpdmVPdXRwdXRDaGFubmVsQ29udGV4dC5zZXQoY2hhbm5lbCkpKTtcblxuXHRcdHRoaXMuYWN0aXZlRmlsZU91dHB1dENoYW5uZWxDb250ZXh0ID0gQ09OVEVYVF9BQ1RJVkVfRklMRV9PVVRQVVQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmFjdGl2ZUxvZ091dHB1dENoYW5uZWxDb250ZXh0ID0gQ09OVEVYVF9BQ1RJVkVfTE9HX0ZJTEVfT1VUUFVULmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5hY3RpdmVPdXRwdXRDaGFubmVsTGV2ZWxTZXR0YWJsZUNvbnRleHQgPSBDT05URVhUX0FDVElWRV9PVVRQVVRfTEVWRUxfU0VUVEFCTEUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmFjdGl2ZU91dHB1dENoYW5uZWxMZXZlbENvbnRleHQgPSBDT05URVhUX0FDVElWRV9PVVRQVVRfTEVWRUwuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmFjdGl2ZU91dHB1dENoYW5uZWxMZXZlbElzRGVmYXVsdENvbnRleHQgPSBDT05URVhUX0FDVElWRV9PVVRQVVRfTEVWRUxfSVNfREVGQVVMVC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5vdXRwdXRMb2NhdGlvbiA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS53aW5kb3dMb2dzUGF0aCwgYG91dHB1dF8ke3RvTG9jYWxJU09TdHJpbmcobmV3IERhdGUoKSkucmVwbGFjZSgvLXw6fFxcLlxcZCtaJC9nLCAnJyl9YCk7XG5cblx0XHQvLyBSZWdpc3RlciBhcyB0ZXh0IG1vZGVsIGNvbnRlbnQgcHJvdmlkZXIgZm9yIG91dHB1dFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRleHRNb2RlbFNlcnZpY2UucmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoU2NoZW1hcy5vdXRwdXRDaGFubmVsLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoT3V0cHV0TGlua1Byb3ZpZGVyKSk7XG5cblx0XHQvLyBDcmVhdGUgb3V0cHV0IGNoYW5uZWxzIGZvciBhbHJlYWR5IHJlZ2lzdGVyZWQgY2hhbm5lbHNcblx0XHRjb25zdCByZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElPdXRwdXRDaGFubmVsUmVnaXN0cnk+KEV4dGVuc2lvbnMuT3V0cHV0Q2hhbm5lbHMpO1xuXHRcdGZvciAoY29uc3QgY2hhbm5lbElkZW50aWZpZXIgb2YgcmVnaXN0cnkuZ2V0Q2hhbm5lbHMoKSkge1xuXHRcdFx0dGhpcy5vbkRpZFJlZ2lzdGVyQ2hhbm5lbChjaGFubmVsSWRlbnRpZmllci5pZCk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdHJ5Lm9uRGlkUmVnaXN0ZXJDaGFubmVsKGlkID0+IHRoaXMub25EaWRSZWdpc3RlckNoYW5uZWwoaWQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0cnkub25EaWRVcGRhdGVDaGFubmVsU291cmNlcyhjaGFubmVsID0+IHRoaXMub25EaWRVcGRhdGVDaGFubmVsU291cmNlcyhjaGFubmVsKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdHJ5Lm9uRGlkUmVtb3ZlQ2hhbm5lbChjaGFubmVsID0+IHRoaXMub25EaWRSZW1vdmVDaGFubmVsKGNoYW5uZWwpKSk7XG5cblx0XHQvLyBTZXQgYWN0aXZlIGNoYW5uZWwgdG8gZmlyc3QgY2hhbm5lbCBpZiBub3Qgc2V0XG5cdFx0aWYgKCF0aGlzLmFjdGl2ZUNoYW5uZWwpIHtcblx0XHRcdGNvbnN0IGNoYW5uZWxzID0gdGhpcy5nZXRDaGFubmVsRGVzY3JpcHRvcnMoKTtcblx0XHRcdHRoaXMuc2V0QWN0aXZlQ2hhbm5lbChjaGFubmVscyAmJiBjaGFubmVscy5sZW5ndGggPiAwID8gdGhpcy5nZXRDaGFubmVsKGNoYW5uZWxzWzBdLmlkKSA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZmlsdGVyKHRoaXMudmlld3NTZXJ2aWNlLm9uRGlkQ2hhbmdlVmlld1Zpc2liaWxpdHksIGUgPT4gZS5pZCA9PT0gT1VUUFVUX1ZJRVdfSUQgJiYgZS52aXNpYmxlKSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5hY3RpdmVDaGFubmVsKSB7XG5cdFx0XHRcdHRoaXMudmlld3NTZXJ2aWNlLmdldEFjdGl2ZVZpZXdXaXRoSWQ8T3V0cHV0Vmlld1BhbmU+KE9VVFBVVF9WSUVXX0lEKT8uc2hvd0NoYW5uZWwodGhpcy5hY3RpdmVDaGFubmVsLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxvZ2dlclNlcnZpY2Uub25EaWRDaGFuZ2VMb2dMZXZlbCgoKSA9PiB7XG5cdFx0XHR0aGlzLnNldExldmVsQ29udGV4dCgpO1xuXHRcdFx0dGhpcy5zZXRMZXZlbElzRGVmYXVsdENvbnRleHQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWZhdWx0TG9nTGV2ZWxzU2VydmljZS5vbkRpZENoYW5nZURlZmF1bHRMb2dMZXZlbHMoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZXRMZXZlbElzRGVmYXVsdENvbnRleHQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpZmVjeWNsZVNlcnZpY2Uub25EaWRTaHV0ZG93bigoKSA9PiB0aGlzLmRpc3Bvc2UoKSkpO1xuXG5cdFx0dGhpcy5maWx0ZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE91dHB1dFZpZXdGaWx0ZXJzKHtcblx0XHRcdGZpbHRlckhpc3Rvcnk6IFtdLFxuXHRcdFx0dHJhY2U6IHRydWUsXG5cdFx0XHRkZWJ1ZzogdHJ1ZSxcblx0XHRcdGluZm86IHRydWUsXG5cdFx0XHR3YXJuaW5nOiB0cnVlLFxuXHRcdFx0ZXJyb3I6IHRydWUsXG5cdFx0XHRzb3VyY2VzOiAnJyxcblx0XHR9LCBjb250ZXh0S2V5U2VydmljZSkpO1xuXHR9XG5cblx0cHJvdmlkZVRleHRDb250ZW50KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElUZXh0TW9kZWw+IHwgbnVsbCB7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IDxPdXRwdXRDaGFubmVsPnRoaXMuZ2V0Q2hhbm5lbChyZXNvdXJjZS5wYXRoKTtcblx0XHRpZiAoY2hhbm5lbCkge1xuXHRcdFx0cmV0dXJuIGNoYW5uZWwubW9kZWwubG9hZE1vZGVsKCk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0YXN5bmMgc2hvd0NoYW5uZWwoaWQ6IHN0cmluZywgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGFubmVsID0gdGhpcy5nZXRDaGFubmVsKGlkKTtcblx0XHRpZiAodGhpcy5hY3RpdmVDaGFubmVsPy5pZCAhPT0gY2hhbm5lbD8uaWQpIHtcblx0XHRcdHRoaXMuc2V0QWN0aXZlQ2hhbm5lbChjaGFubmVsKTtcblx0XHRcdHRoaXMuX29uQWN0aXZlT3V0cHV0Q2hhbm5lbC5maXJlKGlkKTtcblx0XHR9XG5cdFx0Y29uc3Qgb3V0cHV0VmlldyA9IGF3YWl0IHRoaXMudmlld3NTZXJ2aWNlLm9wZW5WaWV3PE91dHB1dFZpZXdQYW5lPihPVVRQVVRfVklFV19JRCwgIXByZXNlcnZlRm9jdXMpO1xuXHRcdGlmIChvdXRwdXRWaWV3ICYmIGNoYW5uZWwpIHtcblx0XHRcdG91dHB1dFZpZXcuc2hvd0NoYW5uZWwoY2hhbm5lbCwgISFwcmVzZXJ2ZUZvY3VzKTtcblx0XHR9XG5cdH1cblxuXHRnZXRDaGFubmVsKGlkOiBzdHJpbmcpOiBPdXRwdXRDaGFubmVsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jaGFubmVscy5nZXQoaWQpO1xuXHR9XG5cblx0Z2V0Q2hhbm5lbERlc2NyaXB0b3IoaWQ6IHN0cmluZyk6IElPdXRwdXRDaGFubmVsRGVzY3JpcHRvciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIFJlZ2lzdHJ5LmFzPElPdXRwdXRDaGFubmVsUmVnaXN0cnk+KEV4dGVuc2lvbnMuT3V0cHV0Q2hhbm5lbHMpLmdldENoYW5uZWwoaWQpO1xuXHR9XG5cblx0Z2V0Q2hhbm5lbERlc2NyaXB0b3JzKCk6IElPdXRwdXRDaGFubmVsRGVzY3JpcHRvcltdIHtcblx0XHRyZXR1cm4gUmVnaXN0cnkuYXM8SU91dHB1dENoYW5uZWxSZWdpc3RyeT4oRXh0ZW5zaW9ucy5PdXRwdXRDaGFubmVscykuZ2V0Q2hhbm5lbHMoKTtcblx0fVxuXG5cdGdldEFjdGl2ZUNoYW5uZWwoKTogSU91dHB1dENoYW5uZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmFjdGl2ZUNoYW5uZWw7XG5cdH1cblxuXHRjYW5TZXRMb2dMZXZlbChjaGFubmVsOiBJT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gY2hhbm5lbC5sb2cgJiYgY2hhbm5lbC5pZCAhPT0gdGVsZW1ldHJ5TG9nSWQ7XG5cdH1cblxuXHRnZXRMb2dMZXZlbChjaGFubmVsOiBJT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IpOiBMb2dMZXZlbCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFjaGFubmVsLmxvZykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc291cmNlcyA9IGlzU2luZ2xlU291cmNlT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IoY2hhbm5lbCkgPyBbY2hhbm5lbC5zb3VyY2VdIDogaXNNdWx0aVNvdXJjZU91dHB1dENoYW5uZWxEZXNjcmlwdG9yKGNoYW5uZWwpID8gY2hhbm5lbC5zb3VyY2UgOiBbXTtcblx0XHRpZiAoc291cmNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9nTGV2ZWwgPSB0aGlzLmxvZ2dlclNlcnZpY2UuZ2V0TG9nTGV2ZWwoKTtcblx0XHRyZXR1cm4gc291cmNlcy5yZWR1Y2UoKHByZXYsIGN1cnIpID0+IE1hdGgubWluKHByZXYsIHRoaXMubG9nZ2VyU2VydmljZS5nZXRMb2dMZXZlbChjdXJyLnJlc291cmNlKSA/PyBsb2dMZXZlbCksIExvZ0xldmVsLkVycm9yKTtcblx0fVxuXG5cdHNldExvZ0xldmVsKGNoYW5uZWw6IElPdXRwdXRDaGFubmVsRGVzY3JpcHRvciwgbG9nTGV2ZWw6IExvZ0xldmVsKTogdm9pZCB7XG5cdFx0aWYgKCFjaGFubmVsLmxvZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2VzID0gaXNTaW5nbGVTb3VyY2VPdXRwdXRDaGFubmVsRGVzY3JpcHRvcihjaGFubmVsKSA/IFtjaGFubmVsLnNvdXJjZV0gOiBpc011bHRpU291cmNlT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IoY2hhbm5lbCkgPyBjaGFubmVsLnNvdXJjZSA6IFtdO1xuXHRcdGlmIChzb3VyY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHNvdXJjZSBvZiBzb3VyY2VzKSB7XG5cdFx0XHR0aGlzLmxvZ2dlclNlcnZpY2Uuc2V0TG9nTGV2ZWwoc291cmNlLnJlc291cmNlLCBsb2dMZXZlbCk7XG5cdFx0fVxuXHR9XG5cblx0cmVnaXN0ZXJDb21wb3VuZExvZ0NoYW5uZWwoZGVzY3JpcHRvcnM6IElPdXRwdXRDaGFubmVsRGVzY3JpcHRvcltdKTogc3RyaW5nIHtcblx0XHRjb25zdCBvdXRwdXRDaGFubmVsUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJT3V0cHV0Q2hhbm5lbFJlZ2lzdHJ5PihFeHRlbnNpb25zLk91dHB1dENoYW5uZWxzKTtcblx0XHRkZXNjcmlwdG9ycy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXHRcdGNvbnN0IGlkID0gZGVzY3JpcHRvcnMubWFwKHIgPT4gci5pZC50b0xvd2VyQ2FzZSgpKS5qb2luKCctJyk7XG5cdFx0aWYgKCFvdXRwdXRDaGFubmVsUmVnaXN0cnkuZ2V0Q2hhbm5lbChpZCkpIHtcblx0XHRcdG91dHB1dENoYW5uZWxSZWdpc3RyeS5yZWdpc3RlckNoYW5uZWwoe1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0bGFiZWw6IGRlc2NyaXB0b3JzLm1hcChyID0+IHIubGFiZWwpLmpvaW4oJywgJyksXG5cdFx0XHRcdGxvZzogZGVzY3JpcHRvcnMuc29tZShyID0+IHIubG9nKSxcblx0XHRcdFx0dXNlcjogdHJ1ZSxcblx0XHRcdFx0c291cmNlOiBkZXNjcmlwdG9ycy5tYXAoZGVzY3JpcHRvciA9PiB7XG5cdFx0XHRcdFx0aWYgKGlzU2luZ2xlU291cmNlT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IoZGVzY3JpcHRvcikpIHtcblx0XHRcdFx0XHRcdHJldHVybiBbeyByZXNvdXJjZTogZGVzY3JpcHRvci5zb3VyY2UucmVzb3VyY2UsIG5hbWU6IGRlc2NyaXB0b3Iuc291cmNlLm5hbWUgPz8gZGVzY3JpcHRvci5sYWJlbCB9XTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGlzTXVsdGlTb3VyY2VPdXRwdXRDaGFubmVsRGVzY3JpcHRvcihkZXNjcmlwdG9yKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGRlc2NyaXB0b3Iuc291cmNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBjaGFubmVsID0gdGhpcy5nZXRDaGFubmVsKGRlc2NyaXB0b3IuaWQpO1xuXHRcdFx0XHRcdGlmIChjaGFubmVsKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gY2hhbm5lbC5tb2RlbC5zb3VyY2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fSkuZmxhdCgpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiBpZDtcblx0fVxuXG5cdGFzeW5jIHNhdmVPdXRwdXRBcyhvdXRwdXRQYXRoPzogVVJJLCAuLi5jaGFubmVsczogSU91dHB1dENoYW5uZWxEZXNjcmlwdG9yW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgY2hhbm5lbDogSU91dHB1dENoYW5uZWwgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGNoYW5uZWxzLmxlbmd0aCA+IDEpIHtcblx0XHRcdGNvbnN0IGNvbXBvdW5kQ2hhbm5lbElkID0gdGhpcy5yZWdpc3RlckNvbXBvdW5kTG9nQ2hhbm5lbChjaGFubmVscyk7XG5cdFx0XHRjaGFubmVsID0gdGhpcy5nZXRDaGFubmVsKGNvbXBvdW5kQ2hhbm5lbElkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y2hhbm5lbCA9IHRoaXMuZ2V0Q2hhbm5lbChjaGFubmVsc1swXS5pZCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFjaGFubmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGxldCB1cmk6IFVSSSB8IHVuZGVmaW5lZCA9IG91dHB1dFBhdGg7XG5cdFx0XHRpZiAoIXVyaSkge1xuXHRcdFx0XHRjb25zdCBuYW1lID0gY2hhbm5lbHMubGVuZ3RoID4gMSA/ICdvdXRwdXQnIDogY2hhbm5lbHNbMF0ubGFiZWw7XG5cdFx0XHRcdHVyaSA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd1NhdmVEaWFsb2coe1xuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2F2ZUxvZy5kaWFsb2dUaXRsZScsIFwiU2F2ZSBPdXRwdXQgQXNcIiksXG5cdFx0XHRcdFx0YXZhaWxhYmxlRmlsZVN5c3RlbXM6IFtTY2hlbWFzLmZpbGVdLFxuXHRcdFx0XHRcdGRlZmF1bHRVcmk6IGpvaW5QYXRoKGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UuZGVmYXVsdEZpbGVQYXRoKCksIGAke25hbWV9LmxvZ2ApLFxuXHRcdFx0XHRcdGZpbHRlcnM6IFt7XG5cdFx0XHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uczogWydsb2cnXVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXVyaSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vZGVsUmVmID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGNoYW5uZWwudXJpKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhtb2RlbFJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLmdldFZhbHVlKCkpKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdG1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZmluYWxseSB7XG5cdFx0XHRpZiAoY2hhbm5lbHMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRSZWdpc3RyeS5hczxJT3V0cHV0Q2hhbm5lbFJlZ2lzdHJ5PihFeHRlbnNpb25zLk91dHB1dENoYW5uZWxzKS5yZW1vdmVDaGFubmVsKGNoYW5uZWwuaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRSZWdpc3RlckNoYW5uZWwoY2hhbm5lbElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGFubmVsID0gdGhpcy5jcmVhdGVDaGFubmVsKGNoYW5uZWxJZCk7XG5cdFx0dGhpcy5jaGFubmVscy5zZXQoY2hhbm5lbElkLCBjaGFubmVsKTtcblx0XHRpZiAoIXRoaXMuYWN0aXZlQ2hhbm5lbCB8fCB0aGlzLmFjdGl2ZUNoYW5uZWxJZEluU3RvcmFnZSA9PT0gY2hhbm5lbElkKSB7XG5cdFx0XHR0aGlzLnNldEFjdGl2ZUNoYW5uZWwoY2hhbm5lbCk7XG5cdFx0XHR0aGlzLl9vbkFjdGl2ZU91dHB1dENoYW5uZWwuZmlyZShjaGFubmVsSWQpO1xuXHRcdFx0Y29uc3Qgb3V0cHV0VmlldyA9IHRoaXMudmlld3NTZXJ2aWNlLmdldEFjdGl2ZVZpZXdXaXRoSWQ8T3V0cHV0Vmlld1BhbmU+KE9VVFBVVF9WSUVXX0lEKTtcblx0XHRcdG91dHB1dFZpZXc/LnNob3dDaGFubmVsKGNoYW5uZWwsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRVcGRhdGVDaGFubmVsU291cmNlcyhjaGFubmVsOiBJTXVsdGlTb3VyY2VPdXRwdXRDaGFubmVsRGVzY3JpcHRvcik6IHZvaWQge1xuXHRcdGNvbnN0IG91dHB1dENoYW5uZWwgPSB0aGlzLmNoYW5uZWxzLmdldChjaGFubmVsLmlkKTtcblx0XHRpZiAob3V0cHV0Q2hhbm5lbCkge1xuXHRcdFx0b3V0cHV0Q2hhbm5lbC5tb2RlbC51cGRhdGVDaGFubmVsU291cmNlcyhjaGFubmVsLnNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFJlbW92ZUNoYW5uZWwoY2hhbm5lbDogSU91dHB1dENoYW5uZWxEZXNjcmlwdG9yKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuYWN0aXZlQ2hhbm5lbD8uaWQgPT09IGNoYW5uZWwuaWQpIHtcblx0XHRcdGNvbnN0IGNoYW5uZWxzID0gdGhpcy5nZXRDaGFubmVsRGVzY3JpcHRvcnMoKTtcblx0XHRcdGlmIChjaGFubmVsc1swXSkge1xuXHRcdFx0XHR0aGlzLnNob3dDaGFubmVsKGNoYW5uZWxzWzBdLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5jaGFubmVscy5kZWxldGVBbmREaXNwb3NlKGNoYW5uZWwuaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDaGFubmVsKGlkOiBzdHJpbmcpOiBPdXRwdXRDaGFubmVsIHtcblx0XHRjb25zdCBjaGFubmVsID0gdGhpcy5pbnN0YW50aWF0ZUNoYW5uZWwoaWQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50Lm9uY2UoY2hhbm5lbC5tb2RlbC5vbkRpc3Bvc2UpKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmFjdGl2ZUNoYW5uZWwgPT09IGNoYW5uZWwpIHtcblx0XHRcdFx0Y29uc3QgY2hhbm5lbHMgPSB0aGlzLmdldENoYW5uZWxEZXNjcmlwdG9ycygpO1xuXHRcdFx0XHRjb25zdCBjaGFubmVsID0gY2hhbm5lbHMubGVuZ3RoID8gdGhpcy5nZXRDaGFubmVsKGNoYW5uZWxzWzBdLmlkKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGNoYW5uZWwgJiYgdGhpcy52aWV3c1NlcnZpY2UuaXNWaWV3VmlzaWJsZShPVVRQVVRfVklFV19JRCkpIHtcblx0XHRcdFx0XHR0aGlzLnNob3dDaGFubmVsKGNoYW5uZWwuaWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuc2V0QWN0aXZlQ2hhbm5lbCh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRSZWdpc3RyeS5hczxJT3V0cHV0Q2hhbm5lbFJlZ2lzdHJ5PihFeHRlbnNpb25zLk91dHB1dENoYW5uZWxzKS5yZW1vdmVDaGFubmVsKGlkKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gY2hhbm5lbDtcblx0fVxuXG5cdHByaXZhdGUgb3V0cHV0Rm9sZGVyQ3JlYXRpb25Qcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgaW5zdGFudGlhdGVDaGFubmVsKGlkOiBzdHJpbmcpOiBPdXRwdXRDaGFubmVsIHtcblx0XHRjb25zdCBjaGFubmVsRGF0YSA9IFJlZ2lzdHJ5LmFzPElPdXRwdXRDaGFubmVsUmVnaXN0cnk+KEV4dGVuc2lvbnMuT3V0cHV0Q2hhbm5lbHMpLmdldENoYW5uZWwoaWQpO1xuXHRcdGlmICghY2hhbm5lbERhdGEpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgQ2hhbm5lbCAnJHtpZH0nIGlzIG5vdCByZWdpc3RlcmVkIHlldGApO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDaGFubmVsICcke2lkfScgaXMgbm90IHJlZ2lzdGVyZWQgeWV0YCk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5vdXRwdXRGb2xkZXJDcmVhdGlvblByb21pc2UpIHtcblx0XHRcdHRoaXMub3V0cHV0Rm9sZGVyQ3JlYXRpb25Qcm9taXNlID0gdGhpcy5maWxlU2VydmljZS5jcmVhdGVGb2xkZXIodGhpcy5vdXRwdXRMb2NhdGlvbikudGhlbigoKSA9PiB1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShPdXRwdXRDaGFubmVsLCBjaGFubmVsRGF0YSwgdGhpcy5vdXRwdXRMb2NhdGlvbiwgdGhpcy5vdXRwdXRGb2xkZXJDcmVhdGlvblByb21pc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRMZXZlbENvbnRleHQoKTogdm9pZCB7XG5cdFx0Y29uc3QgZGVzY3JpcHRvciA9IHRoaXMuYWN0aXZlQ2hhbm5lbD8ub3V0cHV0Q2hhbm5lbERlc2NyaXB0b3I7XG5cdFx0Y29uc3QgY2hhbm5lbExvZ0xldmVsID0gZGVzY3JpcHRvciA/IHRoaXMuZ2V0TG9nTGV2ZWwoZGVzY3JpcHRvcikgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5hY3RpdmVPdXRwdXRDaGFubmVsTGV2ZWxDb250ZXh0LnNldChjaGFubmVsTG9nTGV2ZWwgIT09IHVuZGVmaW5lZCA/IExvZ0xldmVsVG9TdHJpbmcoY2hhbm5lbExvZ0xldmVsKSA6ICcnKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2V0TGV2ZWxJc0RlZmF1bHRDb250ZXh0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlc2NyaXB0b3IgPSB0aGlzLmFjdGl2ZUNoYW5uZWw/Lm91dHB1dENoYW5uZWxEZXNjcmlwdG9yO1xuXHRcdGNvbnN0IGNoYW5uZWxMb2dMZXZlbCA9IGRlc2NyaXB0b3IgPyB0aGlzLmdldExvZ0xldmVsKGRlc2NyaXB0b3IpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChjaGFubmVsTG9nTGV2ZWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgY2hhbm5lbERlZmF1bHRMb2dMZXZlbCA9IHRoaXMuZGVmYXVsdExvZ0xldmVsc1NlcnZpY2UuZ2V0RGVmYXVsdExvZ0xldmVsKGRlc2NyaXB0b3I/LmV4dGVuc2lvbklkKTtcblx0XHRcdHRoaXMuYWN0aXZlT3V0cHV0Q2hhbm5lbExldmVsSXNEZWZhdWx0Q29udGV4dC5zZXQoY2hhbm5lbERlZmF1bHRMb2dMZXZlbCA9PT0gY2hhbm5lbExvZ0xldmVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hY3RpdmVPdXRwdXRDaGFubmVsTGV2ZWxJc0RlZmF1bHRDb250ZXh0LnNldChmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRBY3RpdmVDaGFubmVsKGNoYW5uZWw6IE91dHB1dENoYW5uZWwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmFjdGl2ZUNoYW5uZWwgPSBjaGFubmVsO1xuXHRcdGNvbnN0IGRlc2NyaXB0b3IgPSBjaGFubmVsPy5vdXRwdXRDaGFubmVsRGVzY3JpcHRvcjtcblx0XHR0aGlzLmFjdGl2ZUZpbGVPdXRwdXRDaGFubmVsQ29udGV4dC5zZXQoISFkZXNjcmlwdG9yICYmIGlzU2luZ2xlU291cmNlT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IoZGVzY3JpcHRvcikpO1xuXHRcdHRoaXMuYWN0aXZlTG9nT3V0cHV0Q2hhbm5lbENvbnRleHQuc2V0KCEhZGVzY3JpcHRvcj8ubG9nKTtcblx0XHR0aGlzLmFjdGl2ZU91dHB1dENoYW5uZWxMZXZlbFNldHRhYmxlQ29udGV4dC5zZXQoZGVzY3JpcHRvciAhPT0gdW5kZWZpbmVkICYmIHRoaXMuY2FuU2V0TG9nTGV2ZWwoZGVzY3JpcHRvcikpO1xuXHRcdHRoaXMuc2V0TGV2ZWxJc0RlZmF1bHRDb250ZXh0KCk7XG5cdFx0dGhpcy5zZXRMZXZlbENvbnRleHQoKTtcblxuXHRcdGlmICh0aGlzLmFjdGl2ZUNoYW5uZWwpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoT1VUUFVUX0FDVElWRV9DSEFOTkVMX0tFWSwgdGhpcy5hY3RpdmVDaGFubmVsLmlkLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShPVVRQVVRfQUNUSVZFX0NIQU5ORUxfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVkscUJBQXFCO0FBQzFDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQXlDLGdCQUFnQixVQUFVLGFBQWdFLFlBQW9DLCtCQUErQiw0QkFBNEIsc0NBQXNDLDZCQUE2Qix3Q0FBNEQsMkJBQTJCLDJCQUEyQiwwQkFBMEIsMkJBQTJCLDZCQUE2QixnQ0FBcUUsdUNBQXVDLDhCQUE4Qiw0Q0FBdUQ7QUFDMXFCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQW9EO0FBRTdELFNBQVMsYUFBYSxnQkFBZ0IsVUFBVSx3QkFBd0I7QUFDeEUsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkIsd0JBQTZDLG1DQUFtQztBQUN0SCxTQUFTLHFCQUFxQjtB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QjtBQUM3RCxZQUFNLElBQUksTUFBTSxZQUFZLEVBQUUseUJBQXlCO0FBQUEsSUFDeEQ7QUFDQSxRQUFJLENBQUMsS0FBSyw2QkFBNkI7QUFDdEMsV0FBSyw4QkFBOEIsS0FBSyxZQUFZLGFBQWEsS0FBSyxjQUFjLEVBQUUsS0FBSyxNQUFNLE1BQVM7QUFBQSxJQUMzRztBQUNBLFdBQU8sS0FBSyxxQkFBcUIsZUFBZSxlQUFlLGFBQWEsS0FBSyxnQkFBZ0IsS0FBSywyQkFBMkI7QUFBQSxFQUNsSTtBQUFBLEVBRVEsa0JBQXdCO0FBQy9CLFVBQU0sYUFBYSxLQUFLLGVBQWU7QUFDdkMsVUFBTSxrQkFBa0IsYUFBYSxLQUFLLFlBQVksVUFBVSxJQUFJO0FBQ3BFLFNBQUssZ0NBQWdDLElBQUksb0JBQW9CLFNBQVksaUJBQWlCLGVBQWUsSUFBSSxFQUFFO0FBQUEsRUFDaEg7QUFBQSxFQUVBLE1BQWMsMkJBQTBDO0FBQ3ZELFVBQU0sYUFBYSxLQUFLLGVBQWU7QUFDdkMsVUFBTSxrQkFBa0IsYUFBYSxLQUFLLFlBQVksVUFBVSxJQUFJO0FBQ3BFLFFBQUksb0JBQW9CLFFBQVc7QUFDbEMsWUFBTSx5QkFBeUIsS0FBSyx3QkFBd0IsbUJBQW1CLFlBQVksV0FBVztBQUN0RyxXQUFLLHlDQUF5QyxJQUFJLDJCQUEyQixlQUFlO0FBQUEsSUFDN0YsT0FBTztBQUNOLFdBQUsseUNBQXlDLElBQUksS0FBSztBQUFBLElBQ3hEO0FBQUEsRUFDRDtBQUFBLEVBRVEsaUJBQWlCLFNBQTBDO0FBQ2xFLFNBQUssZ0JBQWdCO0FBQ3JCLFVBQU0sYUFBYSxTQUFTO0FBQzVCLFNBQUssK0JBQStCLElBQUksQ0FBQyxDQUFDLGNBQWMsc0NBQXNDLFVBQVUsQ0FBQztBQUN6RyxTQUFLLDhCQUE4QixJQUFJLENBQUMsQ0FBQyxZQUFZLEdBQUc7QUFDeEQsU0FBSyx3Q0FBd0MsSUFBSSxlQUFlLFVBQWEsS0FBSyxlQUFlLFVBQVUsQ0FBQztBQUM1RyxTQUFLLHlCQUF5QjtBQUM5QixTQUFLLGdCQUFnQjtBQUVyQixRQUFJLEtBQUssZUFBZTtBQUN2QixXQUFLLGVBQWUsTUFBTSwyQkFBMkIsS0FBSyxjQUFjLElBQUksYUFBYSxXQUFXLGNBQWMsT0FBTztBQUFBLElBQzFILE9BQU87QUFDTixXQUFLLGVBQWUsT0FBTywyQkFBMkIsYUFBYSxTQUFTO0FBQUEsSUFDN0U7QUFBQSxFQUNEO0FBQ0Q7QUF4VWEsZ0JBQU47QUFBQSxFQXVCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FsQ1U7IiwKICAibmFtZXMiOiBbImNoYW5uZWwiXQp9Cg==
