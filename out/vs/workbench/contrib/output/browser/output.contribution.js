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
import * as nls from "../../../../nls.js";
import { KeyMod, KeyChord, KeyCode } from "../../../../base/common/keyCodes.js";
import { ModesRegistry } from "../../../../editor/common/languages/modesRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { MenuId, registerAction2, Action2, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { OutputService } from "./outputServices.js";
import { OUTPUT_MODE_ID, OUTPUT_MIME, OUTPUT_VIEW_ID, IOutputService, CONTEXT_IN_OUTPUT, LOG_MODE_ID, LOG_MIME, CONTEXT_OUTPUT_SCROLL_LOCK, ACTIVE_OUTPUT_CHANNEL_CONTEXT, CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE, Extensions, CONTEXT_ACTIVE_OUTPUT_LEVEL, CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT, SHOW_INFO_FILTER_CONTEXT, SHOW_TRACE_FILTER_CONTEXT, SHOW_DEBUG_FILTER_CONTEXT, SHOW_ERROR_FILTER_CONTEXT, SHOW_WARNING_FILTER_CONTEXT, OUTPUT_FILTER_FOCUS_CONTEXT, CONTEXT_ACTIVE_LOG_FILE_OUTPUT, isSingleSourceOutputChannelDescriptor } from "../../../services/output/common/output.js";
import { OutputViewPane } from "./outputView.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { ViewContainerLocation, Extensions as ViewContainerExtensions, WindowEnablement } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { AUX_WINDOW_GROUP, IEditorService } from "../../../services/editor/common/editorService.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Disposable, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { ILoggerService, LogLevel, LogLevelToLocalizedString, LogLevelToString } from "../../../../platform/log/common/log.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
import { IsWindowsContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { FocusedViewContext } from "../../../common/contextkeys.js";
import { localize, localize2 } from "../../../../nls.js";
import { viewFilterSubmenu } from "../../../browser/parts/views/viewFilter.js";
import { ViewAction } from "../../../browser/parts/views/viewPane.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { basename } from "../../../../base/common/resources.js";
import { hasKey } from "../../../../base/common/types.js";
import { IDefaultLogLevelsService } from "../../../services/log/common/defaultLogLevels.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { OutputAccessibilityHelp } from "./outputAccessibilityHelp.js";
const IMPORTED_LOG_ID_PREFIX = "importedLog.";
registerSingleton(IOutputService, OutputService, InstantiationType.Delayed);
AccessibleViewRegistry.register(new OutputAccessibilityHelp());
ModesRegistry.registerLanguage({
  id: OUTPUT_MODE_ID,
  extensions: [],
  mimetypes: [OUTPUT_MIME]
});
ModesRegistry.registerLanguage({
  id: LOG_MODE_ID,
  extensions: [],
  mimetypes: [LOG_MIME]
});
const outputViewIcon = registerIcon("output-view-icon", Codicon.output, nls.localize("outputViewIcon", "View icon of the output view."));
const VIEW_CONTAINER = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
  id: OUTPUT_VIEW_ID,
  title: nls.localize2("output", "Output"),
  icon: outputViewIcon,
  order: 1,
  ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [OUTPUT_VIEW_ID, { mergeViewWithContainerWhenSingleView: true }]),
  storageId: OUTPUT_VIEW_ID,
  hideIfEmpty: true,
  windowEnablement: WindowEnablement.Both
}, ViewContainerLocation.Panel, { doNotRegisterOpenCommand: true });
Registry.as(ViewContainerExtensions.ViewsRegistry).registerViews([{
  id: OUTPUT_VIEW_ID,
  name: nls.localize2("output", "Output"),
  containerIcon: outputViewIcon,
  canMoveView: true,
  canToggleVisibility: true,
  ctorDescriptor: new SyncDescriptor(OutputViewPane),
  openCommandActionDescriptor: {
    id: "workbench.action.output.toggleOutput",
    mnemonicTitle: nls.localize({ key: "miToggleOutput", comment: ["&& denotes a mnemonic"] }, "&&Output"),
    keybindings: {
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyU,
      linux: {
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyH)
        // On Ubuntu Ctrl+Shift+U is taken by some global OS command
      }
    },
    order: 1
  },
  windowEnablement: WindowEnablement.Both
}], VIEW_CONTAINER);
let OutputContribution = class extends Disposable {
  constructor(outputService, editorService) {
    super();
    this.outputService = outputService;
    this.editorService = editorService;
    this.registerActions();
  }
  registerActions() {
    this.registerSwitchOutputAction();
    this.registerAddCompoundLogAction();
    this.registerRemoveLogAction();
    this.registerShowOutputChannelsAction();
    this.registerClearOutputAction();
    this.registerToggleAutoScrollAction();
    this.registerOpenActiveOutputFileAction();
    this.registerOpenActiveOutputFileInAuxWindowAction();
    this.registerSaveActiveOutputAsAction();
    this.registerShowLogsAction();
    this.registerOpenLogFileAction();
    this.registerConfigureActiveOutputLogLevelAction();
    this.registerLogLevelFilterActions();
    this.registerClearFilterActions();
    this.registerExportLogsAction();
    this.registerImportLogAction();
  }
  registerSwitchOutputAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.output.action.switchBetweenOutputs`,
          title: nls.localize("switchBetweenOutputs.label", "Switch Output")
        });
      }
      async run(accessor, channelId) {
        if (channelId) {
          accessor.get(IOutputService).showChannel(channelId, true);
        }
      }
    }));
    const switchOutputMenu = new MenuId("workbench.output.menu.switchOutput");
    this._register(MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
      submenu: switchOutputMenu,
      title: nls.localize("switchToOutput.label", "Switch Output"),
      group: "navigation",
      when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
      order: 1,
      isSelection: true
    }));
    const registeredChannels = /* @__PURE__ */ new Map();
    this._register(toDisposable(() => dispose(registeredChannels.values())));
    const registerOutputChannels = (channels) => {
      for (const channel of channels) {
        const title = channel.label;
        const group = channel.user ? "2_user_outputchannels" : channel.extensionId ? "0_ext_outputchannels" : "1_core_outputchannels";
        registeredChannels.set(channel.id, registerAction2(class extends Action2 {
          constructor() {
            super({
              id: `workbench.action.output.show.${channel.id}`,
              title,
              toggled: ACTIVE_OUTPUT_CHANNEL_CONTEXT.isEqualTo(channel.id),
              menu: {
                id: switchOutputMenu,
                group
              }
            });
          }
          async run(accessor) {
            return accessor.get(IOutputService).showChannel(channel.id, true);
          }
        }));
      }
    };
    registerOutputChannels(this.outputService.getChannelDescriptors());
    const outputChannelRegistry = Registry.as(Extensions.OutputChannels);
    this._register(outputChannelRegistry.onDidRegisterChannel((e) => {
      const channel = this.outputService.getChannelDescriptor(e);
      if (channel) {
        registerOutputChannels([channel]);
      }
    }));
    this._register(outputChannelRegistry.onDidRemoveChannel((e) => {
      registeredChannels.get(e.id)?.dispose();
      registeredChannels.delete(e.id);
    }));
  }
  registerAddCompoundLogAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.output.addCompoundLog",
          title: nls.localize2("addCompoundLog", "Add Compound Log..."),
          category: nls.localize2("output", "Output"),
          f1: true,
          menu: [{
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
            group: "2_add"
          }]
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const quickInputService = accessor.get(IQuickInputService);
        const extensionLogs = [], logs = [];
        for (const channel of outputService.getChannelDescriptors()) {
          if (channel.log && !channel.user) {
            if (channel.extensionId) {
              extensionLogs.push(channel);
            } else {
              logs.push(channel);
            }
          }
        }
        const entries = [];
        for (const log of logs.sort((a, b) => a.label.localeCompare(b.label))) {
          entries.push(log);
        }
        if (extensionLogs.length && logs.length) {
          entries.push({ type: "separator", label: nls.localize("extensionLogs", "Extension Logs") });
        }
        for (const log of extensionLogs.sort((a, b) => a.label.localeCompare(b.label))) {
          entries.push(log);
        }
        const result = await quickInputService.pick(entries, { placeHolder: nls.localize("selectlog", "Select Log"), canPickMany: true });
        if (result?.length) {
          outputService.showChannel(outputService.registerCompoundLogChannel(result));
        }
      }
    }));
  }
  registerRemoveLogAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.output.remove",
          title: nls.localize2("removeLog", "Remove Output..."),
          category: nls.localize2("output", "Output"),
          f1: true
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const quickInputService = accessor.get(IQuickInputService);
        const notificationService = accessor.get(INotificationService);
        const entries = outputService.getChannelDescriptors().filter((channel) => channel.user);
        if (entries.length === 0) {
          notificationService.info(nls.localize("nocustumoutput", "No custom outputs to remove."));
          return;
        }
        const result = await quickInputService.pick(entries, { placeHolder: nls.localize("selectlog", "Select Log"), canPickMany: true });
        if (!result?.length) {
          return;
        }
        const outputChannelRegistry = Registry.as(Extensions.OutputChannels);
        for (const channel of result) {
          outputChannelRegistry.removeChannel(channel.id);
        }
      }
    }));
  }
  registerShowOutputChannelsAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.showOutputChannels",
          title: nls.localize2("showOutputChannels", "Show Output Channels..."),
          category: nls.localize2("output", "Output"),
          f1: true
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const quickInputService = accessor.get(IQuickInputService);
        const extensionChannels = [], coreChannels = [];
        for (const channel of outputService.getChannelDescriptors()) {
          if (channel.extensionId) {
            extensionChannels.push(channel);
          } else {
            coreChannels.push(channel);
          }
        }
        const entries = [];
        for (const { id, label } of extensionChannels) {
          entries.push({ id, label });
        }
        if (extensionChannels.length && coreChannels.length) {
          entries.push({ type: "separator" });
        }
        for (const { id, label } of coreChannels) {
          entries.push({ id, label });
        }
        const entry = await quickInputService.pick(entries, { placeHolder: nls.localize("selectOutput", "Select Output Channel") });
        if (entry) {
          return outputService.showChannel(entry.id);
        }
      }
    }));
  }
  registerClearOutputAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.output.action.clearOutput`,
          title: nls.localize2("clearOutput.label", "Clear Output"),
          category: Categories.View,
          menu: [{
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
            group: "navigation",
            order: 2
          }, {
            id: MenuId.CommandPalette
          }, {
            id: MenuId.EditorContext,
            when: CONTEXT_IN_OUTPUT
          }],
          icon: Codicon.clearAll
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
        const activeChannel = outputService.getActiveChannel();
        if (activeChannel) {
          activeChannel.clear();
          accessibilitySignalService.playSignal(AccessibilitySignal.clear);
        }
      }
    }));
  }
  registerToggleAutoScrollAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.output.action.toggleAutoScroll`,
          title: nls.localize2("toggleAutoScroll", "Toggle Auto Scrolling"),
          tooltip: nls.localize("outputScrollOff", "Turn Auto Scrolling Off"),
          menu: {
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", OUTPUT_VIEW_ID)),
            group: "navigation",
            order: 3
          },
          icon: Codicon.lock,
          toggled: {
            condition: CONTEXT_OUTPUT_SCROLL_LOCK,
            icon: Codicon.unlock,
            tooltip: nls.localize("outputScrollOn", "Turn Auto Scrolling On")
          }
        });
      }
      async run(accessor) {
        const outputView = accessor.get(IViewsService).getActiveViewWithId(OUTPUT_VIEW_ID);
        outputView.scrollLock = !outputView.scrollLock;
      }
    }));
  }
  registerOpenActiveOutputFileAction() {
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.openActiveLogOutputFile`,
          title: nls.localize2("openActiveOutputFile", "Open Output in Editor"),
          menu: [{
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
            group: "navigation",
            order: 4,
            isHiddenByDefault: true
          }],
          icon: Codicon.goToFile
        });
      }
      async run() {
        that.openActiveOutput();
      }
    }));
  }
  registerOpenActiveOutputFileInAuxWindowAction() {
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.openActiveLogOutputFileInNewWindow`,
          title: nls.localize2("openActiveOutputFileInNewWindow", "Open Output in New Window"),
          menu: [{
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
            group: "navigation",
            order: 5,
            isHiddenByDefault: true
          }],
          icon: Codicon.emptyWindow
        });
      }
      async run() {
        that.openActiveOutput(AUX_WINDOW_GROUP);
      }
    }));
  }
  registerSaveActiveOutputAsAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.saveActiveLogOutputAs`,
          title: nls.localize2("saveActiveOutputAs", "Save Output As..."),
          menu: [{
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
            group: "1_export",
            order: 1
          }]
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const channel = outputService.getActiveChannel();
        if (channel) {
          const descriptor = outputService.getChannelDescriptors().find((c) => c.id === channel.id);
          if (descriptor) {
            await outputService.saveOutputAs(void 0, descriptor);
          }
        }
      }
    }));
  }
  async openActiveOutput(group) {
    const channel = this.outputService.getActiveChannel();
    if (channel) {
      await this.editorService.openEditor({
        resource: channel.uri,
        options: {
          pinned: true
        }
      }, group);
    }
  }
  registerConfigureActiveOutputLogLevelAction() {
    const logLevelMenu = new MenuId("workbench.output.menu.logLevel");
    this._register(MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
      submenu: logLevelMenu,
      title: nls.localize("logLevel.label", "Set Log Level..."),
      group: "navigation",
      when: ContextKeyExpr.and(ContextKeyExpr.equals("view", OUTPUT_VIEW_ID), CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE),
      icon: Codicon.gear,
      order: 6
    }));
    let order = 0;
    const registerLogLevel = (logLevel) => {
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: `workbench.action.output.activeOutputLogLevel.${logLevel}`,
            title: LogLevelToLocalizedString(logLevel).value,
            toggled: CONTEXT_ACTIVE_OUTPUT_LEVEL.isEqualTo(LogLevelToString(logLevel)),
            menu: {
              id: logLevelMenu,
              order: order++,
              group: "0_level"
            }
          });
        }
        async run(accessor) {
          const outputService = accessor.get(IOutputService);
          const channel = outputService.getActiveChannel();
          if (channel) {
            const channelDescriptor = outputService.getChannelDescriptor(channel.id);
            if (channelDescriptor) {
              outputService.setLogLevel(channelDescriptor, logLevel);
            }
          }
        }
      }));
    };
    registerLogLevel(LogLevel.Trace);
    registerLogLevel(LogLevel.Debug);
    registerLogLevel(LogLevel.Info);
    registerLogLevel(LogLevel.Warning);
    registerLogLevel(LogLevel.Error);
    registerLogLevel(LogLevel.Off);
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.output.activeOutputLogLevelDefault`,
          title: nls.localize("logLevelDefault.label", "Set As Default"),
          menu: {
            id: logLevelMenu,
            order,
            group: "1_default"
          },
          precondition: CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT.negate()
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const loggerService = accessor.get(ILoggerService);
        const defaultLogLevelsService = accessor.get(IDefaultLogLevelsService);
        const channel = outputService.getActiveChannel();
        if (channel) {
          const channelDescriptor = outputService.getChannelDescriptor(channel.id);
          if (channelDescriptor && isSingleSourceOutputChannelDescriptor(channelDescriptor)) {
            const logLevel = loggerService.getLogLevel(channelDescriptor.source.resource);
            return await defaultLogLevelsService.setDefaultLogLevel(logLevel, channelDescriptor.extensionId);
          }
        }
      }
    }));
  }
  registerShowLogsAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.showLogs",
          title: nls.localize2("showLogs", "Show Logs..."),
          category: Categories.Developer,
          menu: {
            id: MenuId.CommandPalette
          }
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const quickInputService = accessor.get(IQuickInputService);
        const extensionLogs = [], logs = [];
        for (const channel of outputService.getChannelDescriptors()) {
          if (channel.log) {
            if (channel.extensionId) {
              extensionLogs.push(channel);
            } else {
              logs.push(channel);
            }
          }
        }
        const entries = [];
        for (const { id, label } of logs) {
          entries.push({ id, label });
        }
        if (extensionLogs.length && logs.length) {
          entries.push({ type: "separator", label: nls.localize("extensionLogs", "Extension Logs") });
        }
        for (const { id, label } of extensionLogs) {
          entries.push({ id, label });
        }
        const entry = await quickInputService.pick(entries, { placeHolder: nls.localize("selectlog", "Select Log") });
        if (entry) {
          return outputService.showChannel(entry.id);
        }
      }
    }));
  }
  registerOpenLogFileAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.openLogFile",
          title: nls.localize2("openLogFile", "Open Log..."),
          category: Categories.Developer,
          menu: {
            id: MenuId.CommandPalette
          },
          metadata: {
            description: "workbench.action.openLogFile",
            args: [{
              name: "logFile",
              schema: {
                markdownDescription: nls.localize("logFile", 'The id of the log file to open, for example `"window"`. Currently the best way to get this is to get the ID by checking the `workbench.action.output.show.<id>` commands'),
                type: "string"
              }
            }]
          }
        });
      }
      async run(accessor, args) {
        const outputService = accessor.get(IOutputService);
        const quickInputService = accessor.get(IQuickInputService);
        const editorService = accessor.get(IEditorService);
        let entry;
        const argName = args && typeof args === "string" ? args : void 0;
        const extensionChannels = [];
        const coreChannels = [];
        for (const c of outputService.getChannelDescriptors()) {
          if (c.log) {
            const e = { id: c.id, label: c.label };
            if (c.extensionId) {
              extensionChannels.push(e);
            } else {
              coreChannels.push(e);
            }
            if (e.id === argName) {
              entry = e;
            }
          }
        }
        if (!entry) {
          const entries = [...extensionChannels.sort((a, b) => a.label.localeCompare(b.label))];
          if (entries.length && coreChannels.length) {
            entries.push({ type: "separator" });
            entries.push(...coreChannels.sort((a, b) => a.label.localeCompare(b.label)));
          }
          entry = await quickInputService.pick(entries, { placeHolder: nls.localize("selectlogFile", "Select Log File") });
        }
        if (entry?.id) {
          const channel = outputService.getChannel(entry.id);
          if (channel) {
            await editorService.openEditor({
              resource: channel.uri,
              options: {
                pinned: true
              }
            });
          }
        }
      }
    }));
  }
  registerLogLevelFilterActions() {
    let order = 0;
    const registerLogLevel = (logLevel, toggled) => {
      this._register(registerAction2(class extends ViewAction {
        constructor() {
          super({
            id: `workbench.actions.${OUTPUT_VIEW_ID}.toggle.${LogLevelToString(logLevel)}`,
            title: LogLevelToLocalizedString(logLevel).value,
            metadata: {
              description: localize2("toggleTraceDescription", "Show or hide {0} messages in the output", LogLevelToString(logLevel))
            },
            toggled,
            menu: {
              id: viewFilterSubmenu,
              group: "2_log_filter",
              when: ContextKeyExpr.and(ContextKeyExpr.equals("view", OUTPUT_VIEW_ID), CONTEXT_ACTIVE_LOG_FILE_OUTPUT),
              order: order++
            },
            viewId: OUTPUT_VIEW_ID
          });
        }
        async runInView(serviceAccessor, view) {
          this.toggleLogLevelFilter(serviceAccessor.get(IOutputService), logLevel);
        }
        toggleLogLevelFilter(outputService, logLevel2) {
          switch (logLevel2) {
            case LogLevel.Trace:
              outputService.filters.trace = !outputService.filters.trace;
              break;
            case LogLevel.Debug:
              outputService.filters.debug = !outputService.filters.debug;
              break;
            case LogLevel.Info:
              outputService.filters.info = !outputService.filters.info;
              break;
            case LogLevel.Warning:
              outputService.filters.warning = !outputService.filters.warning;
              break;
            case LogLevel.Error:
              outputService.filters.error = !outputService.filters.error;
              break;
          }
        }
      }));
    };
    registerLogLevel(LogLevel.Trace, SHOW_TRACE_FILTER_CONTEXT);
    registerLogLevel(LogLevel.Debug, SHOW_DEBUG_FILTER_CONTEXT);
    registerLogLevel(LogLevel.Info, SHOW_INFO_FILTER_CONTEXT);
    registerLogLevel(LogLevel.Warning, SHOW_WARNING_FILTER_CONTEXT);
    registerLogLevel(LogLevel.Error, SHOW_ERROR_FILTER_CONTEXT);
  }
  registerClearFilterActions() {
    this._register(registerAction2(class extends ViewAction {
      constructor() {
        super({
          id: `workbench.actions.${OUTPUT_VIEW_ID}.clearFilterText`,
          title: localize("clearFiltersText", "Clear filters text"),
          keybinding: {
            when: OUTPUT_FILTER_FOCUS_CONTEXT,
            weight: KeybindingWeight.WorkbenchContrib,
            primary: KeyCode.Escape
          },
          viewId: OUTPUT_VIEW_ID
        });
      }
      async runInView(serviceAccessor, outputView) {
        outputView.clearFilterText();
      }
    }));
  }
  registerExportLogsAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.exportLogs`,
          title: nls.localize2("exportLogs", "Export Logs..."),
          f1: true,
          category: Categories.Developer,
          menu: [{
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
            group: "1_export",
            order: 2
          }]
        });
      }
      async run(accessor, arg) {
        const outputService = accessor.get(IOutputService);
        const quickInputService = accessor.get(IQuickInputService);
        const extensionLogs = [], logs = [], userLogs = [];
        for (const channel of outputService.getChannelDescriptors()) {
          if (channel.log) {
            if (channel.extensionId) {
              extensionLogs.push(channel);
            } else if (channel.user) {
              userLogs.push(channel);
            } else {
              logs.push(channel);
            }
          }
        }
        const entries = [];
        for (const log of logs.sort((a, b) => a.label.localeCompare(b.label))) {
          entries.push(log);
        }
        if (extensionLogs.length && logs.length) {
          entries.push({ type: "separator", label: nls.localize("extensionLogs", "Extension Logs") });
        }
        for (const log of extensionLogs.sort((a, b) => a.label.localeCompare(b.label))) {
          entries.push(log);
        }
        if (userLogs.length && (extensionLogs.length || logs.length)) {
          entries.push({ type: "separator", label: nls.localize("userLogs", "User Logs") });
        }
        for (const log of userLogs.sort((a, b) => a.label.localeCompare(b.label))) {
          entries.push(log);
        }
        let selectedOutputChannels;
        if (arg?.outputChannelIds) {
          const requestedIdsNormalized = arg.outputChannelIds.map((id) => id.trim().toLowerCase());
          const candidates = entries.filter((e) => {
            const isSeparator = hasKey(e, { type: true }) && e.type === "separator";
            return !isSeparator;
          });
          if (requestedIdsNormalized.includes("*")) {
            selectedOutputChannels = candidates;
          } else {
            selectedOutputChannels = candidates.filter((candidate) => requestedIdsNormalized.includes(candidate.id.toLowerCase()));
          }
        } else {
          selectedOutputChannels = await quickInputService.pick(entries, { placeHolder: nls.localize("selectlog", "Select Log"), canPickMany: true });
        }
        if (selectedOutputChannels?.length) {
          await outputService.saveOutputAs(arg?.outputPath, ...selectedOutputChannels);
        }
      }
    }));
  }
  registerImportLogAction() {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.importLog`,
          title: nls.localize2("importLog", "Import Log..."),
          f1: true,
          category: Categories.Developer,
          menu: [{
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", OUTPUT_VIEW_ID),
            group: "2_add",
            order: 2
          }]
        });
      }
      async run(accessor) {
        const outputService = accessor.get(IOutputService);
        const fileDialogService = accessor.get(IFileDialogService);
        const result = await fileDialogService.showOpenDialog({
          title: nls.localize("importLogFile", "Import Log File"),
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: true,
          filters: [{
            name: nls.localize("logFiles", "Log Files"),
            extensions: ["log"]
          }]
        });
        if (result?.length) {
          const channelName = basename(result[0]);
          const channelId = `${IMPORTED_LOG_ID_PREFIX}${Date.now()}`;
          Registry.as(Extensions.OutputChannels).registerChannel({
            id: channelId,
            label: channelName,
            log: true,
            user: true,
            source: result.length === 1 ? { resource: result[0] } : result.map((resource) => ({ resource, name: basename(resource).split(".")[0] }))
          });
          outputService.showChannel(channelId);
        }
      }
    }));
  }
};
OutputContribution = __decorateClass([
  __decorateParam(0, IOutputService),
  __decorateParam(1, IEditorService)
], OutputContribution);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(OutputContribution, LifecyclePhase.Restored);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "output",
  order: 30,
  title: nls.localize("output", "Output"),
  type: "object",
  properties: {
    "output.smartScroll.enabled": {
      type: "boolean",
      description: nls.localize("output.smartScroll.enabled", "Enable/disable the ability of smart scrolling in the output view. Smart scrolling allows you to lock scrolling automatically when you click in the output view and unlocks when you click in the last line."),
      default: true,
      scope: ConfigurationScope.WINDOW,
      tags: ["output"]
    }
  }
});
KeybindingsRegistry.registerKeybindingRule({
  id: "cursorWordAccessibilityLeft",
  when: ContextKeyExpr.and(EditorContextKeys.textInputFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext, ContextKeyExpr.equals(FocusedViewContext.key, OUTPUT_VIEW_ID)),
  primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
  weight: KeybindingWeight.WorkbenchContrib
});
KeybindingsRegistry.registerKeybindingRule({
  id: "cursorWordAccessibilityLeftSelect",
  when: ContextKeyExpr.and(EditorContextKeys.textInputFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext, ContextKeyExpr.equals(FocusedViewContext.key, OUTPUT_VIEW_ID)),
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow,
  weight: KeybindingWeight.WorkbenchContrib
});
KeybindingsRegistry.registerKeybindingRule({
  id: "cursorWordAccessibilityRight",
  when: ContextKeyExpr.and(EditorContextKeys.textInputFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext, ContextKeyExpr.equals(FocusedViewContext.key, OUTPUT_VIEW_ID)),
  primary: KeyMod.CtrlCmd | KeyCode.RightArrow,
  weight: KeybindingWeight.WorkbenchContrib
});
KeybindingsRegistry.registerKeybindingRule({
  id: "cursorWordAccessibilityRightSelect",
  when: ContextKeyExpr.and(EditorContextKeys.textInputFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext, ContextKeyExpr.equals(FocusedViewContext.key, OUTPUT_VIEW_ID)),
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow,
  weight: KeybindingWeight.WorkbenchContrib
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL291dHB1dC9icm93c2VyL291dHB1dC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEtleU1vZCwgS2V5Q2hvcmQsIEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBNb2Rlc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiwgQWN0aW9uMiwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE91dHB1dFNlcnZpY2UgfSBmcm9tICcuL291dHB1dFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IE9VVFBVVF9NT0RFX0lELCBPVVRQVVRfTUlNRSwgT1VUUFVUX1ZJRVdfSUQsIElPdXRwdXRTZXJ2aWNlLCBDT05URVhUX0lOX09VVFBVVCwgTE9HX01PREVfSUQsIExPR19NSU1FLCBDT05URVhUX09VVFBVVF9TQ1JPTExfTE9DSywgSU91dHB1dENoYW5uZWxEZXNjcmlwdG9yLCBBQ1RJVkVfT1VUUFVUX0NIQU5ORUxfQ09OVEVYVCwgQ09OVEVYVF9BQ1RJVkVfT1VUUFVUX0xFVkVMX1NFVFRBQkxFLCBJT3V0cHV0Q2hhbm5lbFJlZ2lzdHJ5LCBFeHRlbnNpb25zLCBDT05URVhUX0FDVElWRV9PVVRQVVRfTEVWRUwsIENPTlRFWFRfQUNUSVZFX09VVFBVVF9MRVZFTF9JU19ERUZBVUxULCBTSE9XX0lORk9fRklMVEVSX0NPTlRFWFQsIFNIT1dfVFJBQ0VfRklMVEVSX0NPTlRFWFQsIFNIT1dfREVCVUdfRklMVEVSX0NPTlRFWFQsIFNIT1dfRVJST1JfRklMVEVSX0NPTlRFWFQsIFNIT1dfV0FSTklOR19GSUxURVJfQ09OVEVYVCwgT1VUUFVUX0ZJTFRFUl9GT0NVU19DT05URVhULCBDT05URVhUX0FDVElWRV9MT0dfRklMRV9PVVRQVVQsIGlzU2luZ2xlU291cmNlT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5pbXBvcnQgeyBPdXRwdXRWaWV3UGFuZSB9IGZyb20gJy4vb3V0cHV0Vmlldy5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgVmlld0NvbnRhaW5lciwgSVZpZXdDb250YWluZXJzUmVnaXN0cnksIFZpZXdDb250YWluZXJMb2NhdGlvbiwgRXh0ZW5zaW9ucyBhcyBWaWV3Q29udGFpbmVyRXh0ZW5zaW9ucywgSVZpZXdzUmVnaXN0cnksIFdpbmRvd0VuYWJsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld1BhbmVDb250YWluZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lQ29udGFpbmVyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIENvbmZpZ3VyYXRpb25TY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrU2VwYXJhdG9yLCBRdWlja1BpY2tJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgQVVYX1dJTkRPV19HUk9VUCwgQVVYX1dJTkRPV19HUk9VUF9UWVBFLCBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ2dlclNlcnZpY2UsIExvZ0xldmVsLCBMb2dMZXZlbFRvTG9jYWxpemVkU3RyaW5nLCBMb2dMZXZlbFRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElzV2luZG93c0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBGb2N1c2VkVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyB2aWV3RmlsdGVyU3VibWVudSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld0ZpbHRlci5qcyc7XG5pbXBvcnQgeyBWaWV3QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElEZWZhdWx0TG9nTGV2ZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xvZy9jb21tb24vZGVmYXVsdExvZ0xldmVscy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgT3V0cHV0QWNjZXNzaWJpbGl0eUhlbHAgfSBmcm9tICcuL291dHB1dEFjY2Vzc2liaWxpdHlIZWxwLmpzJztcblxuY29uc3QgSU1QT1JURURfTE9HX0lEX1BSRUZJWCA9ICdpbXBvcnRlZExvZy4nO1xuXG4vLyBSZWdpc3RlciBTZXJ2aWNlXG5yZWdpc3RlclNpbmdsZXRvbihJT3V0cHV0U2VydmljZSwgT3V0cHV0U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5cbi8vIFJlZ2lzdGVyIEFjY2Vzc2liaWxpdHkgSGVscFxuQWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5yZWdpc3RlcihuZXcgT3V0cHV0QWNjZXNzaWJpbGl0eUhlbHAoKSk7XG5cbi8vIFJlZ2lzdGVyIE91dHB1dCBNb2RlXG5Nb2Rlc1JlZ2lzdHJ5LnJlZ2lzdGVyTGFuZ3VhZ2Uoe1xuXHRpZDogT1VUUFVUX01PREVfSUQsXG5cdGV4dGVuc2lvbnM6IFtdLFxuXHRtaW1ldHlwZXM6IFtPVVRQVVRfTUlNRV1cbn0pO1xuXG4vLyBSZWdpc3RlciBMb2cgT3V0cHV0IE1vZGVcbk1vZGVzUmVnaXN0cnkucmVnaXN0ZXJMYW5ndWFnZSh7XG5cdGlkOiBMT0dfTU9ERV9JRCxcblx0ZXh0ZW5zaW9uczogW10sXG5cdG1pbWV0eXBlczogW0xPR19NSU1FXVxufSk7XG5cbi8vIHJlZ2lzdGVyIG91dHB1dCBjb250YWluZXJcbmNvbnN0IG91dHB1dFZpZXdJY29uID0gcmVnaXN0ZXJJY29uKCdvdXRwdXQtdmlldy1pY29uJywgQ29kaWNvbi5vdXRwdXQsIG5scy5sb2NhbGl6ZSgnb3V0cHV0Vmlld0ljb24nLCAnVmlldyBpY29uIG9mIHRoZSBvdXRwdXQgdmlldy4nKSk7XG5jb25zdCBWSUVXX0NPTlRBSU5FUjogVmlld0NvbnRhaW5lciA9IFJlZ2lzdHJ5LmFzPElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5PihWaWV3Q29udGFpbmVyRXh0ZW5zaW9ucy5WaWV3Q29udGFpbmVyc1JlZ2lzdHJ5KS5yZWdpc3RlclZpZXdDb250YWluZXIoe1xuXHRpZDogT1VUUFVUX1ZJRVdfSUQsXG5cdHRpdGxlOiBubHMubG9jYWxpemUyKCdvdXRwdXQnLCBcIk91dHB1dFwiKSxcblx0aWNvbjogb3V0cHV0Vmlld0ljb24sXG5cdG9yZGVyOiAxLFxuXHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFZpZXdQYW5lQ29udGFpbmVyLCBbT1VUUFVUX1ZJRVdfSUQsIHsgbWVyZ2VWaWV3V2l0aENvbnRhaW5lcldoZW5TaW5nbGVWaWV3OiB0cnVlIH1dKSxcblx0c3RvcmFnZUlkOiBPVVRQVVRfVklFV19JRCxcblx0aGlkZUlmRW1wdHk6IHRydWUsXG5cdHdpbmRvd0VuYWJsZW1lbnQ6IFdpbmRvd0VuYWJsZW1lbnQuQm90aFxufSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsLCB7IGRvTm90UmVnaXN0ZXJPcGVuQ29tbWFuZDogdHJ1ZSB9KTtcblxuUmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KFZpZXdDb250YWluZXJFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpLnJlZ2lzdGVyVmlld3MoW3tcblx0aWQ6IE9VVFBVVF9WSUVXX0lELFxuXHRuYW1lOiBubHMubG9jYWxpemUyKCdvdXRwdXQnLCBcIk91dHB1dFwiKSxcblx0Y29udGFpbmVySWNvbjogb3V0cHV0Vmlld0ljb24sXG5cdGNhbk1vdmVWaWV3OiB0cnVlLFxuXHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlLFxuXHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKE91dHB1dFZpZXdQYW5lKSxcblx0b3BlbkNvbW1hbmRBY3Rpb25EZXNjcmlwdG9yOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm91dHB1dC50b2dnbGVPdXRwdXQnLFxuXHRcdG1uZW1vbmljVGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pVG9nZ2xlT3V0cHV0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmT3V0cHV0XCIpLFxuXHRcdGtleWJpbmRpbmdzOiB7XG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5VSxcblx0XHRcdGxpbnV4OiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SCkgIC8vIE9uIFVidW50dSBDdHJsK1NoaWZ0K1UgaXMgdGFrZW4gYnkgc29tZSBnbG9iYWwgT1MgY29tbWFuZFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0b3JkZXI6IDEsXG5cdH0sXG5cdHdpbmRvd0VuYWJsZW1lbnQ6IFdpbmRvd0VuYWJsZW1lbnQuQm90aFxufV0sIFZJRVdfQ09OVEFJTkVSKTtcblxuY2xhc3MgT3V0cHV0Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU91dHB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvdXRwdXRTZXJ2aWNlOiBJT3V0cHV0U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlZ2lzdGVyQWN0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFjdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5yZWdpc3RlclN3aXRjaE91dHB1dEFjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJBZGRDb21wb3VuZExvZ0FjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJSZW1vdmVMb2dBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyU2hvd091dHB1dENoYW5uZWxzQWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3RlckNsZWFyT3V0cHV0QWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3RlclRvZ2dsZUF1dG9TY3JvbGxBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyT3BlbkFjdGl2ZU91dHB1dEZpbGVBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyT3BlbkFjdGl2ZU91dHB1dEZpbGVJbkF1eFdpbmRvd0FjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJTYXZlQWN0aXZlT3V0cHV0QXNBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyU2hvd0xvZ3NBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyT3BlbkxvZ0ZpbGVBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyQ29uZmlndXJlQWN0aXZlT3V0cHV0TG9nTGV2ZWxBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyTG9nTGV2ZWxGaWx0ZXJBY3Rpb25zKCk7XG5cdFx0dGhpcy5yZWdpc3RlckNsZWFyRmlsdGVyQWN0aW9ucygpO1xuXHRcdHRoaXMucmVnaXN0ZXJFeHBvcnRMb2dzQWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3RlckltcG9ydExvZ0FjdGlvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclN3aXRjaE91dHB1dEFjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2gub3V0cHV0LmFjdGlvbi5zd2l0Y2hCZXR3ZWVuT3V0cHV0c2AsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnc3dpdGNoQmV0d2Vlbk91dHB1dHMubGFiZWwnLCBcIlN3aXRjaCBPdXRwdXRcIiksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjaGFubmVsSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRpZiAoY2hhbm5lbElkKSB7XG5cdFx0XHRcdFx0YWNjZXNzb3IuZ2V0KElPdXRwdXRTZXJ2aWNlKS5zaG93Q2hhbm5lbChjaGFubmVsSWQsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IHN3aXRjaE91dHB1dE1lbnUgPSBuZXcgTWVudUlkKCd3b3JrYmVuY2gub3V0cHV0Lm1lbnUuc3dpdGNoT3V0cHV0Jyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5WaWV3VGl0bGUsIHtcblx0XHRcdHN1Ym1lbnU6IHN3aXRjaE91dHB1dE1lbnUsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdzd2l0Y2hUb091dHB1dC5sYWJlbCcsIFwiU3dpdGNoIE91dHB1dFwiKSxcblx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBPVVRQVVRfVklFV19JRCksXG5cdFx0XHRvcmRlcjogMSxcblx0XHRcdGlzU2VsZWN0aW9uOiB0cnVlXG5cdFx0fSkpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRDaGFubmVscyA9IG5ldyBNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4oKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gZGlzcG9zZShyZWdpc3RlcmVkQ2hhbm5lbHMudmFsdWVzKCkpKSk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJPdXRwdXRDaGFubmVscyA9IChjaGFubmVsczogSU91dHB1dENoYW5uZWxEZXNjcmlwdG9yW10pID0+IHtcblx0XHRcdGZvciAoY29uc3QgY2hhbm5lbCBvZiBjaGFubmVscykge1xuXHRcdFx0XHRjb25zdCB0aXRsZSA9IGNoYW5uZWwubGFiZWw7XG5cdFx0XHRcdGNvbnN0IGdyb3VwID0gY2hhbm5lbC51c2VyID8gJzJfdXNlcl9vdXRwdXRjaGFubmVscycgOiBjaGFubmVsLmV4dGVuc2lvbklkID8gJzBfZXh0X291dHB1dGNoYW5uZWxzJyA6ICcxX2NvcmVfb3V0cHV0Y2hhbm5lbHMnO1xuXHRcdFx0XHRyZWdpc3RlcmVkQ2hhbm5lbHMuc2V0KGNoYW5uZWwuaWQsIHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb24ub3V0cHV0LnNob3cuJHtjaGFubmVsLmlkfWAsXG5cdFx0XHRcdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRcdFx0XHR0b2dnbGVkOiBBQ1RJVkVfT1VUUFVUX0NIQU5ORUxfQ09OVEVYVC5pc0VxdWFsVG8oY2hhbm5lbC5pZCksXG5cdFx0XHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogc3dpdGNoT3V0cHV0TWVudSxcblx0XHRcdFx0XHRcdFx0XHRncm91cCxcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJT3V0cHV0U2VydmljZSkuc2hvd0NoYW5uZWwoY2hhbm5lbC5pZCwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRyZWdpc3Rlck91dHB1dENoYW5uZWxzKHRoaXMub3V0cHV0U2VydmljZS5nZXRDaGFubmVsRGVzY3JpcHRvcnMoKSk7XG5cdFx0Y29uc3Qgb3V0cHV0Q2hhbm5lbFJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SU91dHB1dENoYW5uZWxSZWdpc3RyeT4oRXh0ZW5zaW9ucy5PdXRwdXRDaGFubmVscyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob3V0cHV0Q2hhbm5lbFJlZ2lzdHJ5Lm9uRGlkUmVnaXN0ZXJDaGFubmVsKGUgPT4ge1xuXHRcdFx0Y29uc3QgY2hhbm5lbCA9IHRoaXMub3V0cHV0U2VydmljZS5nZXRDaGFubmVsRGVzY3JpcHRvcihlKTtcblx0XHRcdGlmIChjaGFubmVsKSB7XG5cdFx0XHRcdHJlZ2lzdGVyT3V0cHV0Q2hhbm5lbHMoW2NoYW5uZWxdKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob3V0cHV0Q2hhbm5lbFJlZ2lzdHJ5Lm9uRGlkUmVtb3ZlQ2hhbm5lbChlID0+IHtcblx0XHRcdHJlZ2lzdGVyZWRDaGFubmVscy5nZXQoZS5pZCk/LmRpc3Bvc2UoKTtcblx0XHRcdHJlZ2lzdGVyZWRDaGFubmVscy5kZWxldGUoZS5pZCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFkZENvbXBvdW5kTG9nQWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3V0cHV0LmFkZENvbXBvdW5kTG9nJyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignYWRkQ29tcG91bmRMb2cnLCBcIkFkZCBDb21wb3VuZCBMb2cuLi5cIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IG5scy5sb2NhbGl6ZTIoJ291dHB1dCcsIFwiT3V0cHV0XCIpLFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIE9VVFBVVF9WSUVXX0lEKSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnMl9hZGQnLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBvdXRwdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPdXRwdXRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblxuXHRcdFx0XHRjb25zdCBleHRlbnNpb25Mb2dzOiBJT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3JbXSA9IFtdLCBsb2dzOiBJT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3JbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoYW5uZWwgb2Ygb3V0cHV0U2VydmljZS5nZXRDaGFubmVsRGVzY3JpcHRvcnMoKSkge1xuXHRcdFx0XHRcdGlmIChjaGFubmVsLmxvZyAmJiAhY2hhbm5lbC51c2VyKSB7XG5cdFx0XHRcdFx0XHRpZiAoY2hhbm5lbC5leHRlbnNpb25JZCkge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25Mb2dzLnB1c2goY2hhbm5lbCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRsb2dzLnB1c2goY2hhbm5lbCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGVudHJpZXM6IEFycmF5PElPdXRwdXRDaGFubmVsRGVzY3JpcHRvciB8IElRdWlja1BpY2tTZXBhcmF0b3I+ID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgbG9nIG9mIGxvZ3Muc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKSkge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaChsb2cpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleHRlbnNpb25Mb2dzLmxlbmd0aCAmJiBsb2dzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbmxzLmxvY2FsaXplKCdleHRlbnNpb25Mb2dzJywgXCJFeHRlbnNpb24gTG9nc1wiKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGxvZyBvZiBleHRlbnNpb25Mb2dzLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSkpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2gobG9nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKGVudHJpZXMsIHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnc2VsZWN0bG9nJywgXCJTZWxlY3QgTG9nXCIpLCBjYW5QaWNrTWFueTogdHJ1ZSB9KTtcblx0XHRcdFx0aWYgKHJlc3VsdD8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0b3V0cHV0U2VydmljZS5zaG93Q2hhbm5lbChvdXRwdXRTZXJ2aWNlLnJlZ2lzdGVyQ29tcG91bmRMb2dDaGFubmVsKHJlc3VsdCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclJlbW92ZUxvZ0FjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm91dHB1dC5yZW1vdmUnLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdyZW1vdmVMb2cnLCBcIlJlbW92ZSBPdXRwdXQuLi5cIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IG5scy5sb2NhbGl6ZTIoJ291dHB1dCcsIFwiT3V0cHV0XCIpLFxuXHRcdFx0XHRcdGYxOiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IG91dHB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZW50cmllczogQXJyYXk8SU91dHB1dENoYW5uZWxEZXNjcmlwdG9yPiA9IG91dHB1dFNlcnZpY2UuZ2V0Q2hhbm5lbERlc2NyaXB0b3JzKCkuZmlsdGVyKGNoYW5uZWwgPT4gY2hhbm5lbC51c2VyKTtcblx0XHRcdFx0aWYgKGVudHJpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5pbmZvKG5scy5sb2NhbGl6ZSgnbm9jdXN0dW1vdXRwdXQnLCBcIk5vIGN1c3RvbSBvdXRwdXRzIHRvIHJlbW92ZS5cIikpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKGVudHJpZXMsIHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnc2VsZWN0bG9nJywgXCJTZWxlY3QgTG9nXCIpLCBjYW5QaWNrTWFueTogdHJ1ZSB9KTtcblx0XHRcdFx0aWYgKCFyZXN1bHQ/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBvdXRwdXRDaGFubmVsUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJT3V0cHV0Q2hhbm5lbFJlZ2lzdHJ5PihFeHRlbnNpb25zLk91dHB1dENoYW5uZWxzKTtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGFubmVsIG9mIHJlc3VsdCkge1xuXHRcdFx0XHRcdG91dHB1dENoYW5uZWxSZWdpc3RyeS5yZW1vdmVDaGFubmVsKGNoYW5uZWwuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNob3dPdXRwdXRDaGFubmVsc0FjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnNob3dPdXRwdXRDaGFubmVscycsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Nob3dPdXRwdXRDaGFubmVscycsIFwiU2hvdyBPdXRwdXQgQ2hhbm5lbHMuLi5cIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IG5scy5sb2NhbGl6ZTIoJ291dHB1dCcsIFwiT3V0cHV0XCIpLFxuXHRcdFx0XHRcdGYxOiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IG91dHB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25DaGFubmVscyA9IFtdLCBjb3JlQ2hhbm5lbHMgPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGFubmVsIG9mIG91dHB1dFNlcnZpY2UuZ2V0Q2hhbm5lbERlc2NyaXB0b3JzKCkpIHtcblx0XHRcdFx0XHRpZiAoY2hhbm5lbC5leHRlbnNpb25JZCkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uQ2hhbm5lbHMucHVzaChjaGFubmVsKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29yZUNoYW5uZWxzLnB1c2goY2hhbm5lbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGVudHJpZXM6ICh7IGlkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmcgfSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCB7IGlkLCBsYWJlbCB9IG9mIGV4dGVuc2lvbkNoYW5uZWxzKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsgaWQsIGxhYmVsIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleHRlbnNpb25DaGFubmVscy5sZW5ndGggJiYgY29yZUNoYW5uZWxzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgeyBpZCwgbGFiZWwgfSBvZiBjb3JlQ2hhbm5lbHMpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyBpZCwgbGFiZWwgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZW50cnkgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKGVudHJpZXMsIHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnc2VsZWN0T3V0cHV0JywgXCJTZWxlY3QgT3V0cHV0IENoYW5uZWxcIikgfSk7XG5cdFx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRcdHJldHVybiBvdXRwdXRTZXJ2aWNlLnNob3dDaGFubmVsKGVudHJ5LmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJDbGVhck91dHB1dEFjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2gub3V0cHV0LmFjdGlvbi5jbGVhck91dHB1dGAsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2NsZWFyT3V0cHV0LmxhYmVsJywgXCJDbGVhciBPdXRwdXRcIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBPVVRQVVRfVklFV19JRCksXG5cdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0LFxuXHRcdFx0XHRcdFx0d2hlbjogQ09OVEVYVF9JTl9PVVRQVVRcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmNsZWFyQWxsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IG91dHB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSA9IGFjY2Vzc29yLmdldChJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBhY3RpdmVDaGFubmVsID0gb3V0cHV0U2VydmljZS5nZXRBY3RpdmVDaGFubmVsKCk7XG5cdFx0XHRcdGlmIChhY3RpdmVDaGFubmVsKSB7XG5cdFx0XHRcdFx0YWN0aXZlQ2hhbm5lbC5jbGVhcigpO1xuXHRcdFx0XHRcdGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5jbGVhcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVG9nZ2xlQXV0b1Njcm9sbEFjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2gub3V0cHV0LmFjdGlvbi50b2dnbGVBdXRvU2Nyb2xsYCxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMigndG9nZ2xlQXV0b1Njcm9sbCcsIFwiVG9nZ2xlIEF1dG8gU2Nyb2xsaW5nXCIpLFxuXHRcdFx0XHRcdHRvb2x0aXA6IG5scy5sb2NhbGl6ZSgnb3V0cHV0U2Nyb2xsT2ZmJywgXCJUdXJuIEF1dG8gU2Nyb2xsaW5nIE9mZlwiKSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBPVVRQVVRfVklFV19JRCkpLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5sb2NrLFxuXHRcdFx0XHRcdHRvZ2dsZWQ6IHtcblx0XHRcdFx0XHRcdGNvbmRpdGlvbjogQ09OVEVYVF9PVVRQVVRfU0NST0xMX0xPQ0ssXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnVubG9jayxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IG5scy5sb2NhbGl6ZSgnb3V0cHV0U2Nyb2xsT24nLCBcIlR1cm4gQXV0byBTY3JvbGxpbmcgT25cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IG91dHB1dFZpZXcgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkuZ2V0QWN0aXZlVmlld1dpdGhJZDxPdXRwdXRWaWV3UGFuZT4oT1VUUFVUX1ZJRVdfSUQpITtcblx0XHRcdFx0b3V0cHV0Vmlldy5zY3JvbGxMb2NrID0gIW91dHB1dFZpZXcuc2Nyb2xsTG9jaztcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyT3BlbkFjdGl2ZU91dHB1dEZpbGVBY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbi5vcGVuQWN0aXZlTG9nT3V0cHV0RmlsZWAsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ29wZW5BY3RpdmVPdXRwdXRGaWxlJywgXCJPcGVuIE91dHB1dCBpbiBFZGl0b3JcIiksXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgT1VUUFVUX1ZJRVdfSUQpLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHRcdFx0aXNIaWRkZW5CeURlZmF1bHQ6IHRydWVcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmdvVG9GaWxlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0dGhhdC5vcGVuQWN0aXZlT3V0cHV0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck9wZW5BY3RpdmVPdXRwdXRGaWxlSW5BdXhXaW5kb3dBY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbi5vcGVuQWN0aXZlTG9nT3V0cHV0RmlsZUluTmV3V2luZG93YCxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignb3BlbkFjdGl2ZU91dHB1dEZpbGVJbk5ld1dpbmRvdycsIFwiT3BlbiBPdXRwdXQgaW4gTmV3IFdpbmRvd1wiKSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBPVVRQVVRfVklFV19JRCksXG5cdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDUsXG5cdFx0XHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdGljb246IENvZGljb24uZW1wdHlXaW5kb3csXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHR0aGF0Lm9wZW5BY3RpdmVPdXRwdXQoQVVYX1dJTkRPV19HUk9VUCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNhdmVBY3RpdmVPdXRwdXRBc0FjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLnNhdmVBY3RpdmVMb2dPdXRwdXRBc2AsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3NhdmVBY3RpdmVPdXRwdXRBcycsIFwiU2F2ZSBPdXRwdXQgQXMuLi5cIiksXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgT1VUUFVUX1ZJRVdfSUQpLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICcxX2V4cG9ydCcsXG5cdFx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBvdXRwdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPdXRwdXRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgY2hhbm5lbCA9IG91dHB1dFNlcnZpY2UuZ2V0QWN0aXZlQ2hhbm5lbCgpO1xuXHRcdFx0XHRpZiAoY2hhbm5lbCkge1xuXHRcdFx0XHRcdGNvbnN0IGRlc2NyaXB0b3IgPSBvdXRwdXRTZXJ2aWNlLmdldENoYW5uZWxEZXNjcmlwdG9ycygpLmZpbmQoYyA9PiBjLmlkID09PSBjaGFubmVsLmlkKTtcblx0XHRcdFx0XHRpZiAoZGVzY3JpcHRvcikge1xuXHRcdFx0XHRcdFx0YXdhaXQgb3V0cHV0U2VydmljZS5zYXZlT3V0cHV0QXModW5kZWZpbmVkLCBkZXNjcmlwdG9yKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5BY3RpdmVPdXRwdXQoZ3JvdXA/OiBBVVhfV0lORE9XX0dST1VQX1RZUEUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGFubmVsID0gdGhpcy5vdXRwdXRTZXJ2aWNlLmdldEFjdGl2ZUNoYW5uZWwoKTtcblx0XHRpZiAoY2hhbm5lbCkge1xuXHRcdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZTogY2hhbm5lbC51cmksXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRwaW5uZWQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LCBncm91cCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNvbmZpZ3VyZUFjdGl2ZU91dHB1dExvZ0xldmVsQWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGxvZ0xldmVsTWVudSA9IG5ldyBNZW51SWQoJ3dvcmtiZW5jaC5vdXRwdXQubWVudS5sb2dMZXZlbCcpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVmlld1RpdGxlLCB7XG5cdFx0XHRzdWJtZW51OiBsb2dMZXZlbE1lbnUsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdsb2dMZXZlbC5sYWJlbCcsIFwiU2V0IExvZyBMZXZlbC4uLlwiKSxcblx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgT1VUUFVUX1ZJRVdfSUQpLCBDT05URVhUX0FDVElWRV9PVVRQVVRfTEVWRUxfU0VUVEFCTEUpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5nZWFyLFxuXHRcdFx0b3JkZXI6IDZcblx0XHR9KSk7XG5cblx0XHRsZXQgb3JkZXIgPSAwO1xuXHRcdGNvbnN0IHJlZ2lzdGVyTG9nTGV2ZWwgPSAobG9nTGV2ZWw6IExvZ0xldmVsKSA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLm91dHB1dC5hY3RpdmVPdXRwdXRMb2dMZXZlbC4ke2xvZ0xldmVsfWAsXG5cdFx0XHRcdFx0XHR0aXRsZTogTG9nTGV2ZWxUb0xvY2FsaXplZFN0cmluZyhsb2dMZXZlbCkudmFsdWUsXG5cdFx0XHRcdFx0XHR0b2dnbGVkOiBDT05URVhUX0FDVElWRV9PVVRQVVRfTEVWRUwuaXNFcXVhbFRvKExvZ0xldmVsVG9TdHJpbmcobG9nTGV2ZWwpKSxcblx0XHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdFx0aWQ6IGxvZ0xldmVsTWVudSxcblx0XHRcdFx0XHRcdFx0b3JkZXI6IG9yZGVyKyssXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnMF9sZXZlbCdcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRjb25zdCBvdXRwdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPdXRwdXRTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCBjaGFubmVsID0gb3V0cHV0U2VydmljZS5nZXRBY3RpdmVDaGFubmVsKCk7XG5cdFx0XHRcdFx0aWYgKGNoYW5uZWwpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNoYW5uZWxEZXNjcmlwdG9yID0gb3V0cHV0U2VydmljZS5nZXRDaGFubmVsRGVzY3JpcHRvcihjaGFubmVsLmlkKTtcblx0XHRcdFx0XHRcdGlmIChjaGFubmVsRGVzY3JpcHRvcikge1xuXHRcdFx0XHRcdFx0XHRvdXRwdXRTZXJ2aWNlLnNldExvZ0xldmVsKGNoYW5uZWxEZXNjcmlwdG9yLCBsb2dMZXZlbCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fTtcblxuXHRcdHJlZ2lzdGVyTG9nTGV2ZWwoTG9nTGV2ZWwuVHJhY2UpO1xuXHRcdHJlZ2lzdGVyTG9nTGV2ZWwoTG9nTGV2ZWwuRGVidWcpO1xuXHRcdHJlZ2lzdGVyTG9nTGV2ZWwoTG9nTGV2ZWwuSW5mbyk7XG5cdFx0cmVnaXN0ZXJMb2dMZXZlbChMb2dMZXZlbC5XYXJuaW5nKTtcblx0XHRyZWdpc3RlckxvZ0xldmVsKExvZ0xldmVsLkVycm9yKTtcblx0XHRyZWdpc3RlckxvZ0xldmVsKExvZ0xldmVsLk9mZik7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLm91dHB1dC5hY3RpdmVPdXRwdXRMb2dMZXZlbERlZmF1bHRgLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2xvZ0xldmVsRGVmYXVsdC5sYWJlbCcsIFwiU2V0IEFzIERlZmF1bHRcIiksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IGxvZ0xldmVsTWVudSxcblx0XHRcdFx0XHRcdG9yZGVyLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICcxX2RlZmF1bHQnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfQUNUSVZFX09VVFBVVF9MRVZFTF9JU19ERUZBVUxULm5lZ2F0ZSgpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IG91dHB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBsb2dnZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dnZXJTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdExvZ0xldmVsc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlZmF1bHRMb2dMZXZlbHNTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgY2hhbm5lbCA9IG91dHB1dFNlcnZpY2UuZ2V0QWN0aXZlQ2hhbm5lbCgpO1xuXHRcdFx0XHRpZiAoY2hhbm5lbCkge1xuXHRcdFx0XHRcdGNvbnN0IGNoYW5uZWxEZXNjcmlwdG9yID0gb3V0cHV0U2VydmljZS5nZXRDaGFubmVsRGVzY3JpcHRvcihjaGFubmVsLmlkKTtcblx0XHRcdFx0XHRpZiAoY2hhbm5lbERlc2NyaXB0b3IgJiYgaXNTaW5nbGVTb3VyY2VPdXRwdXRDaGFubmVsRGVzY3JpcHRvcihjaGFubmVsRGVzY3JpcHRvcikpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxvZ0xldmVsID0gbG9nZ2VyU2VydmljZS5nZXRMb2dMZXZlbChjaGFubmVsRGVzY3JpcHRvci5zb3VyY2UucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGF3YWl0IGRlZmF1bHRMb2dMZXZlbHNTZXJ2aWNlLnNldERlZmF1bHRMb2dMZXZlbChsb2dMZXZlbCwgY2hhbm5lbERlc2NyaXB0b3IuZXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJTaG93TG9nc0FjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnNob3dMb2dzJyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignc2hvd0xvZ3MnLCBcIlNob3cgTG9ncy4uLlwiKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBvdXRwdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPdXRwdXRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uTG9ncyA9IFtdLCBsb2dzID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgY2hhbm5lbCBvZiBvdXRwdXRTZXJ2aWNlLmdldENoYW5uZWxEZXNjcmlwdG9ycygpKSB7XG5cdFx0XHRcdFx0aWYgKGNoYW5uZWwubG9nKSB7XG5cdFx0XHRcdFx0XHRpZiAoY2hhbm5lbC5leHRlbnNpb25JZCkge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25Mb2dzLnB1c2goY2hhbm5lbCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRsb2dzLnB1c2goY2hhbm5lbCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGVudHJpZXM6ICh7IGlkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmcgfSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCB7IGlkLCBsYWJlbCB9IG9mIGxvZ3MpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyBpZCwgbGFiZWwgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvbkxvZ3MubGVuZ3RoICYmIGxvZ3MubGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBubHMubG9jYWxpemUoJ2V4dGVuc2lvbkxvZ3MnLCBcIkV4dGVuc2lvbiBMb2dzXCIpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgeyBpZCwgbGFiZWwgfSBvZiBleHRlbnNpb25Mb2dzKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsgaWQsIGxhYmVsIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhlbnRyaWVzLCB7IHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ3NlbGVjdGxvZycsIFwiU2VsZWN0IExvZ1wiKSB9KTtcblx0XHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIG91dHB1dFNlcnZpY2Uuc2hvd0NoYW5uZWwoZW50cnkuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck9wZW5Mb2dGaWxlQWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkxvZ0ZpbGUnLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdvcGVuTG9nRmlsZScsIFwiT3BlbiBMb2cuLi5cIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5Mb2dGaWxlJyxcblx0XHRcdFx0XHRcdGFyZ3M6IFt7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICdsb2dGaWxlJyxcblx0XHRcdFx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdsb2dGaWxlJywgXCJUaGUgaWQgb2YgdGhlIGxvZyBmaWxlIHRvIG9wZW4sIGZvciBleGFtcGxlIGBcXFwid2luZG93XFxcImAuIEN1cnJlbnRseSB0aGUgYmVzdCB3YXkgdG8gZ2V0IHRoaXMgaXMgdG8gZ2V0IHRoZSBJRCBieSBjaGVja2luZyB0aGUgYHdvcmtiZW5jaC5hY3Rpb24ub3V0cHV0LnNob3cuPGlkPmAgY29tbWFuZHNcIiksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJncz86IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3Qgb3V0cHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJT3V0cHV0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdFx0XHRsZXQgZW50cnk6IElRdWlja1BpY2tJdGVtIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBhcmdOYW1lID0gYXJncyAmJiB0eXBlb2YgYXJncyA9PT0gJ3N0cmluZycgPyBhcmdzIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25DaGFubmVsczogSVF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBjb3JlQ2hhbm5lbHM6IElRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBjIG9mIG91dHB1dFNlcnZpY2UuZ2V0Q2hhbm5lbERlc2NyaXB0b3JzKCkpIHtcblx0XHRcdFx0XHRpZiAoYy5sb2cpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGUgPSB7IGlkOiBjLmlkLCBsYWJlbDogYy5sYWJlbCB9O1xuXHRcdFx0XHRcdFx0aWYgKGMuZXh0ZW5zaW9uSWQpIHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uQ2hhbm5lbHMucHVzaChlKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNvcmVDaGFubmVscy5wdXNoKGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGUuaWQgPT09IGFyZ05hbWUpIHtcblx0XHRcdFx0XHRcdFx0ZW50cnkgPSBlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdFx0Y29uc3QgZW50cmllczogUXVpY2tQaWNrSW5wdXRbXSA9IFsuLi5leHRlbnNpb25DaGFubmVscy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpXTtcblx0XHRcdFx0XHRpZiAoZW50cmllcy5sZW5ndGggJiYgY29yZUNoYW5uZWxzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicgfSk7XG5cdFx0XHRcdFx0XHRlbnRyaWVzLnB1c2goLi4uY29yZUNoYW5uZWxzLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbnRyeSA9IDxJUXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZD5hd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKGVudHJpZXMsIHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnc2VsZWN0bG9nRmlsZScsIFwiU2VsZWN0IExvZyBGaWxlXCIpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlbnRyeT8uaWQpIHtcblx0XHRcdFx0XHRjb25zdCBjaGFubmVsID0gb3V0cHV0U2VydmljZS5nZXRDaGFubmVsKGVudHJ5LmlkKTtcblx0XHRcdFx0XHRpZiAoY2hhbm5lbCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRcdFx0cmVzb3VyY2U6IGNoYW5uZWwudXJpLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0cGlubmVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTG9nTGV2ZWxGaWx0ZXJBY3Rpb25zKCk6IHZvaWQge1xuXHRcdGxldCBvcmRlciA9IDA7XG5cdFx0Y29uc3QgcmVnaXN0ZXJMb2dMZXZlbCA9IChsb2dMZXZlbDogTG9nTGV2ZWwsIHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByZXNzaW9uKSA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPE91dHB1dFZpZXdQYW5lPiB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbnMuJHtPVVRQVVRfVklFV19JRH0udG9nZ2xlLiR7TG9nTGV2ZWxUb1N0cmluZyhsb2dMZXZlbCl9YCxcblx0XHRcdFx0XHRcdHRpdGxlOiBMb2dMZXZlbFRvTG9jYWxpemVkU3RyaW5nKGxvZ0xldmVsKS52YWx1ZSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZTIoJ3RvZ2dsZVRyYWNlRGVzY3JpcHRpb24nLCBcIlNob3cgb3IgaGlkZSB7MH0gbWVzc2FnZXMgaW4gdGhlIG91dHB1dFwiLCBMb2dMZXZlbFRvU3RyaW5nKGxvZ0xldmVsKSlcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR0b2dnbGVkLFxuXHRcdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0XHRpZDogdmlld0ZpbHRlclN1Ym1lbnUsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnMl9sb2dfZmlsdGVyJyxcblx0XHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIE9VVFBVVF9WSUVXX0lEKSwgQ09OVEVYVF9BQ1RJVkVfTE9HX0ZJTEVfT1VUUFVUKSxcblx0XHRcdFx0XHRcdFx0b3JkZXI6IG9yZGVyKytcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR2aWV3SWQ6IE9VVFBVVF9WSUVXX0lEXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXN5bmMgcnVuSW5WaWV3KHNlcnZpY2VBY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogT3V0cHV0Vmlld1BhbmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHR0aGlzLnRvZ2dsZUxvZ0xldmVsRmlsdGVyKHNlcnZpY2VBY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpLCBsb2dMZXZlbCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cHJpdmF0ZSB0b2dnbGVMb2dMZXZlbEZpbHRlcihvdXRwdXRTZXJ2aWNlOiBJT3V0cHV0U2VydmljZSwgbG9nTGV2ZWw6IExvZ0xldmVsKTogdm9pZCB7XG5cdFx0XHRcdFx0c3dpdGNoIChsb2dMZXZlbCkge1xuXHRcdFx0XHRcdFx0Y2FzZSBMb2dMZXZlbC5UcmFjZTpcblx0XHRcdFx0XHRcdFx0b3V0cHV0U2VydmljZS5maWx0ZXJzLnRyYWNlID0gIW91dHB1dFNlcnZpY2UuZmlsdGVycy50cmFjZTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIExvZ0xldmVsLkRlYnVnOlxuXHRcdFx0XHRcdFx0XHRvdXRwdXRTZXJ2aWNlLmZpbHRlcnMuZGVidWcgPSAhb3V0cHV0U2VydmljZS5maWx0ZXJzLmRlYnVnO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgTG9nTGV2ZWwuSW5mbzpcblx0XHRcdFx0XHRcdFx0b3V0cHV0U2VydmljZS5maWx0ZXJzLmluZm8gPSAhb3V0cHV0U2VydmljZS5maWx0ZXJzLmluZm87XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSBMb2dMZXZlbC5XYXJuaW5nOlxuXHRcdFx0XHRcdFx0XHRvdXRwdXRTZXJ2aWNlLmZpbHRlcnMud2FybmluZyA9ICFvdXRwdXRTZXJ2aWNlLmZpbHRlcnMud2FybmluZztcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIExvZ0xldmVsLkVycm9yOlxuXHRcdFx0XHRcdFx0XHRvdXRwdXRTZXJ2aWNlLmZpbHRlcnMuZXJyb3IgPSAhb3V0cHV0U2VydmljZS5maWx0ZXJzLmVycm9yO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9O1xuXG5cdFx0cmVnaXN0ZXJMb2dMZXZlbChMb2dMZXZlbC5UcmFjZSwgU0hPV19UUkFDRV9GSUxURVJfQ09OVEVYVCk7XG5cdFx0cmVnaXN0ZXJMb2dMZXZlbChMb2dMZXZlbC5EZWJ1ZywgU0hPV19ERUJVR19GSUxURVJfQ09OVEVYVCk7XG5cdFx0cmVnaXN0ZXJMb2dMZXZlbChMb2dMZXZlbC5JbmZvLCBTSE9XX0lORk9fRklMVEVSX0NPTlRFWFQpO1xuXHRcdHJlZ2lzdGVyTG9nTGV2ZWwoTG9nTGV2ZWwuV2FybmluZywgU0hPV19XQVJOSU5HX0ZJTFRFUl9DT05URVhUKTtcblx0XHRyZWdpc3RlckxvZ0xldmVsKExvZ0xldmVsLkVycm9yLCBTSE9XX0VSUk9SX0ZJTFRFUl9DT05URVhUKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJDbGVhckZpbHRlckFjdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxPdXRwdXRWaWV3UGFuZT4ge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb25zLiR7T1VUUFVUX1ZJRVdfSUR9LmNsZWFyRmlsdGVyVGV4dGAsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjbGVhckZpbHRlcnNUZXh0JywgXCJDbGVhciBmaWx0ZXJzIHRleHRcIiksXG5cdFx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdFx0d2hlbjogT1VUUFVUX0ZJTFRFUl9GT0NVU19DT05URVhULFxuXHRcdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dmlld0lkOiBPVVRQVVRfVklFV19JRFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bkluVmlldyhzZXJ2aWNlQWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG91dHB1dFZpZXc6IE91dHB1dFZpZXdQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdG91dHB1dFZpZXcuY2xlYXJGaWx0ZXJUZXh0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckV4cG9ydExvZ3NBY3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbi5leHBvcnRMb2dzYCxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignZXhwb3J0TG9ncycsIFwiRXhwb3J0IExvZ3MuLi5cIiksXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIE9VVFBVVF9WSUVXX0lEKSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnMV9leHBvcnQnLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmc/OiB7IG91dHB1dFBhdGg/OiBVUkk7IG91dHB1dENoYW5uZWxJZHM/OiBzdHJpbmdbXSB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IG91dHB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25Mb2dzOiBJT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3JbXSA9IFtdLCBsb2dzOiBJT3V0cHV0Q2hhbm5lbERlc2NyaXB0b3JbXSA9IFtdLCB1c2VyTG9nczogSU91dHB1dENoYW5uZWxEZXNjcmlwdG9yW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGFubmVsIG9mIG91dHB1dFNlcnZpY2UuZ2V0Q2hhbm5lbERlc2NyaXB0b3JzKCkpIHtcblx0XHRcdFx0XHRpZiAoY2hhbm5lbC5sb2cpIHtcblx0XHRcdFx0XHRcdGlmIChjaGFubmVsLmV4dGVuc2lvbklkKSB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbkxvZ3MucHVzaChjaGFubmVsKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoY2hhbm5lbC51c2VyKSB7XG5cdFx0XHRcdFx0XHRcdHVzZXJMb2dzLnB1c2goY2hhbm5lbCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRsb2dzLnB1c2goY2hhbm5lbCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGVudHJpZXM6IEFycmF5PElPdXRwdXRDaGFubmVsRGVzY3JpcHRvciB8IElRdWlja1BpY2tTZXBhcmF0b3I+ID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgbG9nIG9mIGxvZ3Muc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKSkge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaChsb2cpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleHRlbnNpb25Mb2dzLmxlbmd0aCAmJiBsb2dzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbmxzLmxvY2FsaXplKCdleHRlbnNpb25Mb2dzJywgXCJFeHRlbnNpb24gTG9nc1wiKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGxvZyBvZiBleHRlbnNpb25Mb2dzLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSkpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2gobG9nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodXNlckxvZ3MubGVuZ3RoICYmIChleHRlbnNpb25Mb2dzLmxlbmd0aCB8fCBsb2dzLmxlbmd0aCkpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IG5scy5sb2NhbGl6ZSgndXNlckxvZ3MnLCBcIlVzZXIgTG9nc1wiKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGxvZyBvZiB1c2VyTG9ncy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKGxvZyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgc2VsZWN0ZWRPdXRwdXRDaGFubmVsczogSU91dHB1dENoYW5uZWxEZXNjcmlwdG9yW10gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChhcmc/Lm91dHB1dENoYW5uZWxJZHMpIHtcblx0XHRcdFx0XHRjb25zdCByZXF1ZXN0ZWRJZHNOb3JtYWxpemVkID0gYXJnLm91dHB1dENoYW5uZWxJZHMubWFwKGlkID0+IGlkLnRyaW0oKS50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdFx0XHRjb25zdCBjYW5kaWRhdGVzID0gZW50cmllcy5maWx0ZXIoKGUpOiBlIGlzIElPdXRwdXRDaGFubmVsRGVzY3JpcHRvciA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpc1NlcGFyYXRvciA9IGhhc0tleShlLCB7IHR5cGU6IHRydWUgfSkgJiYgZS50eXBlID09PSAnc2VwYXJhdG9yJztcblx0XHRcdFx0XHRcdHJldHVybiAhaXNTZXBhcmF0b3I7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0aWYgKHJlcXVlc3RlZElkc05vcm1hbGl6ZWQuaW5jbHVkZXMoJyonKSkge1xuXHRcdFx0XHRcdFx0c2VsZWN0ZWRPdXRwdXRDaGFubmVscyA9IGNhbmRpZGF0ZXM7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHNlbGVjdGVkT3V0cHV0Q2hhbm5lbHMgPSBjYW5kaWRhdGVzLmZpbHRlcihjYW5kaWRhdGUgPT4gcmVxdWVzdGVkSWRzTm9ybWFsaXplZC5pbmNsdWRlcyhjYW5kaWRhdGUuaWQudG9Mb3dlckNhc2UoKSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZWxlY3RlZE91dHB1dENoYW5uZWxzID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhlbnRyaWVzLCB7IHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ3NlbGVjdGxvZycsIFwiU2VsZWN0IExvZ1wiKSwgY2FuUGlja01hbnk6IHRydWUgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoc2VsZWN0ZWRPdXRwdXRDaGFubmVscz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0YXdhaXQgb3V0cHV0U2VydmljZS5zYXZlT3V0cHV0QXMoYXJnPy5vdXRwdXRQYXRoLCAuLi5zZWxlY3RlZE91dHB1dENoYW5uZWxzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJJbXBvcnRMb2dBY3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbi5pbXBvcnRMb2dgLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdpbXBvcnRMb2cnLCBcIkltcG9ydCBMb2cuLi5cIiksXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIE9VVFBVVF9WSUVXX0lEKSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnMl9hZGQnLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IG91dHB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBmaWxlRGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZURpYWxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmaWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnaW1wb3J0TG9nRmlsZScsIFwiSW1wb3J0IExvZyBGaWxlXCIpLFxuXHRcdFx0XHRcdGNhblNlbGVjdEZpbGVzOiB0cnVlLFxuXHRcdFx0XHRcdGNhblNlbGVjdEZvbGRlcnM6IGZhbHNlLFxuXHRcdFx0XHRcdGNhblNlbGVjdE1hbnk6IHRydWUsXG5cdFx0XHRcdFx0ZmlsdGVyczogW3tcblx0XHRcdFx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZSgnbG9nRmlsZXMnLCBcIkxvZyBGaWxlc1wiKSxcblx0XHRcdFx0XHRcdGV4dGVuc2lvbnM6IFsnbG9nJ11cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAocmVzdWx0Py5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb25zdCBjaGFubmVsTmFtZSA9IGJhc2VuYW1lKHJlc3VsdFswXSk7XG5cdFx0XHRcdFx0Y29uc3QgY2hhbm5lbElkID0gYCR7SU1QT1JURURfTE9HX0lEX1BSRUZJWH0ke0RhdGUubm93KCl9YDtcblx0XHRcdFx0XHQvLyBSZWdpc3RlciBhbmQgc2hvdyB0aGUgY2hhbm5lbFxuXHRcdFx0XHRcdFJlZ2lzdHJ5LmFzPElPdXRwdXRDaGFubmVsUmVnaXN0cnk+KEV4dGVuc2lvbnMuT3V0cHV0Q2hhbm5lbHMpLnJlZ2lzdGVyQ2hhbm5lbCh7XG5cdFx0XHRcdFx0XHRpZDogY2hhbm5lbElkLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGNoYW5uZWxOYW1lLFxuXHRcdFx0XHRcdFx0bG9nOiB0cnVlLFxuXHRcdFx0XHRcdFx0dXNlcjogdHJ1ZSxcblx0XHRcdFx0XHRcdHNvdXJjZTogcmVzdWx0Lmxlbmd0aCA9PT0gMVxuXHRcdFx0XHRcdFx0XHQ/IHsgcmVzb3VyY2U6IHJlc3VsdFswXSB9XG5cdFx0XHRcdFx0XHRcdDogcmVzdWx0Lm1hcChyZXNvdXJjZSA9PiAoeyByZXNvdXJjZSwgbmFtZTogYmFzZW5hbWUocmVzb3VyY2UpLnNwbGl0KCcuJylbMF0gfSkpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0b3V0cHV0U2VydmljZS5zaG93Q2hhbm5lbChjaGFubmVsSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihPdXRwdXRDb250cmlidXRpb24sIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0aWQ6ICdvdXRwdXQnLFxuXHRvcmRlcjogMzAsXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ291dHB1dCcsIFwiT3V0cHV0XCIpLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdCdvdXRwdXQuc21hcnRTY3JvbGwuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ291dHB1dC5zbWFydFNjcm9sbC5lbmFibGVkJywgXCJFbmFibGUvZGlzYWJsZSB0aGUgYWJpbGl0eSBvZiBzbWFydCBzY3JvbGxpbmcgaW4gdGhlIG91dHB1dCB2aWV3LiBTbWFydCBzY3JvbGxpbmcgYWxsb3dzIHlvdSB0byBsb2NrIHNjcm9sbGluZyBhdXRvbWF0aWNhbGx5IHdoZW4geW91IGNsaWNrIGluIHRoZSBvdXRwdXQgdmlldyBhbmQgdW5sb2NrcyB3aGVuIHlvdSBjbGljayBpbiB0aGUgbGFzdCBsaW5lLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLldJTkRPVyxcblx0XHRcdHRhZ3M6IFsnb3V0cHV0J11cblx0XHR9XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2N1cnNvcldvcmRBY2Nlc3NpYmlsaXR5TGVmdCcsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cywgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCwgSXNXaW5kb3dzQ29udGV4dCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKEZvY3VzZWRWaWV3Q29udGV4dC5rZXksIE9VVFBVVF9WSUVXX0lEKSksXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5MZWZ0QXJyb3csXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG59KTtcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnY3Vyc29yV29yZEFjY2Vzc2liaWxpdHlMZWZ0U2VsZWN0Jyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLCBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELCBJc1dpbmRvd3NDb250ZXh0LCBDb250ZXh0S2V5RXhwci5lcXVhbHMoRm9jdXNlZFZpZXdDb250ZXh0LmtleSwgT1VUUFVUX1ZJRVdfSUQpKSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkxlZnRBcnJvdyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcbn0pO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlcktleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdjdXJzb3JXb3JkQWNjZXNzaWJpbGl0eVJpZ2h0Jyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLCBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELCBJc1dpbmRvd3NDb250ZXh0LCBDb250ZXh0S2V5RXhwci5lcXVhbHMoRm9jdXNlZFZpZXdDb250ZXh0LmtleSwgT1VUUFVUX1ZJRVdfSUQpKSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlJpZ2h0QXJyb3csXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG59KTtcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnY3Vyc29yV29yZEFjY2Vzc2liaWxpdHlSaWdodFNlbGVjdCcsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cywgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCwgSXNXaW5kb3dzQ29udGV4dCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKEZvY3VzZWRWaWV3Q29udGV4dC5rZXksIE9VVFBVVF9WSUVXX0lEKSksXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5SaWdodEFycm93LFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLFFBQVEsVUFBVSxlQUFlO0FBQzFDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsUUFBUSxpQkFBaUIsU0FBUyxvQkFBb0I7QUFDL0QsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCLGFBQWEsZ0JBQWdCLGdCQUFnQixtQkFBbUIsYUFBYSxVQUFVLDRCQUFzRCwrQkFBK0Isc0NBQThELFlBQVksNkJBQTZCLHdDQUF3QywwQkFBMEIsMkJBQTJCLDJCQUEyQiwyQkFBMkIsNkJBQTZCLDZCQUE2QixnQ0FBZ0MsNkNBQTZDO0FBQ3RrQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUEwQyxjQUFjLDJCQUFtRDtBQUMzRyxTQUFTLHNCQUFzQjtBQUUvQixTQUFpRCx1QkFBdUIsY0FBYyx5QkFBeUMsd0JBQXdCO0FBQ3ZKLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQWlDLGNBQWMseUJBQXlCLDBCQUEwQjtBQUNsRyxTQUF5QiwwQkFBK0Q7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
