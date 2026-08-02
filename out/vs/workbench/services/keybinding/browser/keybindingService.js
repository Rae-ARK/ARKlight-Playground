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
import * as browser from "../../../../base/browser/browser.js";
import { BrowserFeatures, KeyboardSupport } from "../../../../base/browser/canIUse.js";
import * as dom from "../../../../base/browser/dom.js";
import { printKeyboardEvent, printStandardKeyboardEvent, StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { DeferredPromise, RunOnceScheduler } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { parse } from "../../../../base/common/json.js";
import { UserSettingsLabelProvider } from "../../../../base/common/keybindingLabels.js";
import { KeybindingParser } from "../../../../base/common/keybindingParser.js";
import { KeyCodeChord, ScanCodeChord } from "../../../../base/common/keybindings.js";
import { IMMUTABLE_CODE_TO_KEY_CODE, KeyCode, KeyCodeUtils, KeyMod, ScanCode, ScanCodeUtils } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import * as objects from "../../../../base/common/objects.js";
import { isMacintosh, OperatingSystem, OS } from "../../../../base/common/platform.js";
import { dirname } from "../../../../base/common/resources.js";
import { isLocalizedString } from "../../../../platform/action/common/action.js";
import { MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { FileOperation, IFileService } from "../../../../platform/files/common/files.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { Extensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { AbstractKeybindingService } from "../../../../platform/keybinding/common/abstractKeybindingService.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingResolver } from "../../../../platform/keybinding/common/keybindingResolver.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ResolvedKeybindingItem } from "../../../../platform/keybinding/common/resolvedKeybindingItem.js";
import { IKeyboardLayoutService } from "../../../../platform/keyboardLayout/common/keyboardLayout.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { remove } from "../../../../base/common/arrays.js";
import { commandsExtensionPoint } from "../../actions/common/menusExtensionPoint.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { IHostService } from "../../host/browser/host.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { KeybindingIO, OutputBuilder } from "../common/keybindingIO.js";
import { getAllUnboundCommands } from "./unboundCommands.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
function isValidContributedKeyBinding(keyBinding, rejects) {
  if (!keyBinding) {
    rejects.push(nls.localize("nonempty", "expected non-empty value."));
    return false;
  }
  if (typeof keyBinding.command !== "string") {
    rejects.push(nls.localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "command"));
    return false;
  }
  if (keyBinding.key && typeof keyBinding.key !== "string") {
    rejects.push(nls.localize("optstring", "property `{0}` can be omitted or must be of type `string`", "key"));
    return false;
  }
  if (keyBinding.when && typeof keyBinding.when !== "string") {
    rejects.push(nls.localize("optstring", "property `{0}` can be omitted or must be of type `string`", "when"));
    return false;
  }
  if (keyBinding.mac && typeof keyBinding.mac !== "string") {
    rejects.push(nls.localize("optstring", "property `{0}` can be omitted or must be of type `string`", "mac"));
    return false;
  }
  if (keyBinding.linux && typeof keyBinding.linux !== "string") {
    rejects.push(nls.localize("optstring", "property `{0}` can be omitted or must be of type `string`", "linux"));
    return false;
  }
  if (keyBinding.win && typeof keyBinding.win !== "string") {
    rejects.push(nls.localize("optstring", "property `{0}` can be omitted or must be of type `string`", "win"));
    return false;
  }
  return true;
}
const keybindingType = {
  type: "object",
  default: { command: "", key: "" },
  required: ["command", "key"],
  properties: {
    command: {
      description: nls.localize("vscode.extension.contributes.keybindings.command", "Identifier of the command to run when keybinding is triggered."),
      type: "string"
    },
    args: {
      description: nls.localize("vscode.extension.contributes.keybindings.args", "Arguments to pass to the command to execute.")
    },
    key: {
      description: nls.localize("vscode.extension.contributes.keybindings.key", "Key or key sequence (separate keys with plus-sign and sequences with space, e.g. Ctrl+O and Ctrl+L L for a chord)."),
      type: "string"
    },
    mac: {
      description: nls.localize("vscode.extension.contributes.keybindings.mac", "Mac specific key or key sequence."),
      type: "string"
    },
    linux: {
      description: nls.localize("vscode.extension.contributes.keybindings.linux", "Linux specific key or key sequence."),
      type: "string"
    },
    win: {
      description: nls.localize("vscode.extension.contributes.keybindings.win", "Windows specific key or key sequence."),
      type: "string"
    },
    when: {
      description: nls.localize("vscode.extension.contributes.keybindings.when", "Condition when the key is active."),
      type: "string"
    }
  }
};
const keybindingsExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "keybindings",
  deps: [commandsExtensionPoint],
  jsonSchema: {
    description: nls.localize("vscode.extension.contributes.keybindings", "Contributes keybindings."),
    oneOf: [
      keybindingType,
      {
        type: "array",
        items: keybindingType
      }
    ]
  }
});
const NUMPAD_PRINTABLE_SCANCODES = [
  ScanCode.NumpadDivide,
  ScanCode.NumpadMultiply,
  ScanCode.NumpadSubtract,
  ScanCode.NumpadAdd,
  ScanCode.Numpad1,
  ScanCode.Numpad2,
  ScanCode.Numpad3,
  ScanCode.Numpad4,
  ScanCode.Numpad5,
  ScanCode.Numpad6,
  ScanCode.Numpad7,
  ScanCode.Numpad8,
  ScanCode.Numpad9,
  ScanCode.Numpad0,
  ScanCode.NumpadDecimal
];
const otherMacNumpadMapping = /* @__PURE__ */ new Map();
otherMacNumpadMapping.set(ScanCode.Numpad1, KeyCode.Digit1);
otherMacNumpadMapping.set(ScanCode.Numpad2, KeyCode.Digit2);
otherMacNumpadMapping.set(ScanCode.Numpad3, KeyCode.Digit3);
otherMacNumpadMapping.set(ScanCode.Numpad4, KeyCode.Digit4);
otherMacNumpadMapping.set(ScanCode.Numpad5, KeyCode.Digit5);
otherMacNumpadMapping.set(ScanCode.Numpad6, KeyCode.Digit6);
otherMacNumpadMapping.set(ScanCode.Numpad7, KeyCode.Digit7);
otherMacNumpadMapping.set(ScanCode.Numpad8, KeyCode.Digit8);
otherMacNumpadMapping.set(ScanCode.Numpad9, KeyCode.Digit9);
otherMacNumpadMapping.set(ScanCode.Numpad0, KeyCode.Digit0);
let WorkbenchKeybindingService = class extends AbstractKeybindingService {
  constructor(contextKeyService, commandService, telemetryService, notificationService, userDataProfileService, hostService, extensionService, fileService, uriIdentityService, logService, keyboardLayoutService) {
    super(contextKeyService, commandService, telemetryService, notificationService, logService);
    this.hostService = hostService;
    this.keyboardLayoutService = keyboardLayoutService;
    this._contributions = [];
    this.isComposingGlobalContextKey = contextKeyService.createKey(EditorContextKeys.isComposing.key, false);
    this.kbsJsonSchema = new KeybindingsJsonSchema();
    this.updateKeybindingsJsonSchema();
    this._keyboardMapper = this.keyboardLayoutService.getKeyboardMapper();
    this._register(this.keyboardLayoutService.onDidChangeKeyboardLayout(() => {
      this._keyboardMapper = this.keyboardLayoutService.getKeyboardMapper();
      this.updateResolver();
    }));
    this._keybindingHoldMode = null;
    this._cachedResolver = null;
    this.userKeybindings = this._register(new UserKeybindings(userDataProfileService, uriIdentityService, fileService, logService));
    this.userKeybindings.initialize().then(() => {
      if (this.userKeybindings.keybindings.length) {
        this.updateResolver();
      }
    });
    this._register(this.userKeybindings.onDidChange(() => {
      logService.debug("User keybindings changed");
      this.updateResolver();
    }));
    keybindingsExtPoint.setHandler((extensions) => {
      const keybindings = [];
      for (const extension of extensions) {
        this._handleKeybindingsExtensionPointUser(extension.description.identifier, extension.description.isBuiltin, extension.value, extension.collector, keybindings);
      }
      KeybindingsRegistry.setExtensionKeybindings(keybindings);
      this.updateResolver();
    });
    this.updateKeybindingsJsonSchema();
    this._register(extensionService.onDidRegisterExtensions(() => this.updateKeybindingsJsonSchema()));
    this._register(Event.runAndSubscribe(dom.onDidRegisterWindow, ({ window, disposables }) => disposables.add(this._registerKeyListeners(window)), { window: mainWindow, disposables: this._store }));
    this._register(browser.onDidChangeFullscreen((windowId) => {
      if (windowId !== mainWindow.vscodeWindowId) {
        return;
      }
      const keyboard = navigator.keyboard;
      if (BrowserFeatures.keyboard === KeyboardSupport.None) {
        return;
      }
      if (browser.isFullscreen(mainWindow)) {
        keyboard?.lock(["Escape"]);
      } else {
        keyboard?.unlock();
      }
      this._cachedResolver = null;
      this._onDidUpdateKeybindings.fire();
    }));
  }
  dispose() {
    this._contributions.forEach((c) => c.listener?.dispose());
    this._contributions.length = 0;
    super.dispose();
  }
  _registerKeyListeners(window) {
    const disposables = new DisposableStore();
    disposables.add(dom.addDisposableListener(window, dom.EventType.KEY_DOWN, (e) => {
      if (this._keybindingHoldMode) {
        return;
      }
      this.isComposingGlobalContextKey.set(e.isComposing);
      const keyEvent = new StandardKeyboardEvent(e);
      this._log(`/ Received  keydown event - ${printKeyboardEvent(e)}`);
      this._log(`| Converted keydown event - ${printStandardKeyboardEvent(keyEvent)}`);
      const shouldPreventDefault = this._dispatch(keyEvent, keyEvent.target);
      if (shouldPreventDefault) {
        keyEvent.preventDefault();
      }
      this.isComposingGlobalContextKey.set(false);
    }));
    disposables.add(dom.addDisposableListener(window, dom.EventType.KEY_UP, (e) => {
      this._resetKeybindingHoldMode();
      this.isComposingGlobalContextKey.set(e.isComposing);
      const keyEvent = new StandardKeyboardEvent(e);
      const shouldPreventDefault = this._singleModifierDispatch(keyEvent, keyEvent.target);
      if (shouldPreventDefault) {
        keyEvent.preventDefault();
      }
      this.isComposingGlobalContextKey.set(false);
    }));
    return disposables;
  }
  registerSchemaContribution(contribution) {
    const listener = contribution.onDidChange?.(() => this.updateKeybindingsJsonSchema());
    const entry = { listener, contribution };
    this._contributions.push(entry);
    this.updateKeybindingsJsonSchema();
    return toDisposable(() => {
      listener?.dispose();
      remove(this._contributions, entry);
      this.updateKeybindingsJsonSchema();
    });
  }
  updateKeybindingsJsonSchema() {
    this.kbsJsonSchema.updateSchema(this._contributions.flatMap((x) => x.contribution.getSchemaAdditions()));
  }
  _printKeybinding(keybinding) {
    return UserSettingsLabelProvider.toLabel(OS, keybinding.chords, (chord) => {
      if (chord instanceof KeyCodeChord) {
        return KeyCodeUtils.toString(chord.keyCode);
      }
      return ScanCodeUtils.toString(chord.scanCode);
    }) || "[null]";
  }
  _printResolvedKeybinding(resolvedKeybinding) {
    return resolvedKeybinding.getDispatchChords().map((x) => x || "[null]").join(" ");
  }
  _printResolvedKeybindings(output, input, resolvedKeybindings) {
    const padLength = 35;
    const firstRow = `${input.padStart(padLength, " ")} => `;
    if (resolvedKeybindings.length === 0) {
      output.push(`${firstRow}${"[NO BINDING]".padStart(padLength, " ")}`);
      return;
    }
    const firstRowIndentation = firstRow.length;
    const isFirst = true;
    for (const resolvedKeybinding of resolvedKeybindings) {
      if (isFirst) {
        output.push(`${firstRow}${this._printResolvedKeybinding(resolvedKeybinding).padStart(padLength, " ")}`);
      } else {
        output.push(`${" ".repeat(firstRowIndentation)}${this._printResolvedKeybinding(resolvedKeybinding).padStart(padLength, " ")}`);
      }
    }
  }
  _dumpResolveKeybindingDebugInfo() {
    const seenBindings = /* @__PURE__ */ new Set();
    const result = [];
    result.push(`Default Resolved Keybindings (unique only):`);
    for (const item of KeybindingsRegistry.getDefaultKeybindings()) {
      if (!item.keybinding) {
        continue;
      }
      const input = this._printKeybinding(item.keybinding);
      if (seenBindings.has(input)) {
        continue;
      }
      seenBindings.add(input);
      const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(item.keybinding);
      this._printResolvedKeybindings(result, input, resolvedKeybindings);
    }
    result.push(`User Resolved Keybindings (unique only):`);
    for (const item of this.userKeybindings.keybindings) {
      if (!item.keybinding) {
        continue;
      }
      const input = item._sourceKey ?? "Impossible: missing source key, but has keybinding";
      if (seenBindings.has(input)) {
        continue;
      }
      seenBindings.add(input);
      const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(item.keybinding);
      this._printResolvedKeybindings(result, input, resolvedKeybindings);
    }
    return result.join("\n");
  }
  _dumpDebugInfo() {
    const layoutInfo = JSON.stringify(this.keyboardLayoutService.getCurrentKeyboardLayout(), null, "	");
    const mapperInfo = this._keyboardMapper.dumpDebugInfo();
    const resolvedKeybindings = this._dumpResolveKeybindingDebugInfo();
    const rawMapping = JSON.stringify(this.keyboardLayoutService.getRawKeyboardMapping(), null, "	");
    return `Layout info:
${layoutInfo}

${resolvedKeybindings}

${mapperInfo}

Raw mapping:
${rawMapping}`;
  }
  _dumpDebugInfoJSON() {
    const info = {
      layout: this.keyboardLayoutService.getCurrentKeyboardLayout(),
      rawMapping: this.keyboardLayoutService.getRawKeyboardMapping()
    };
    return JSON.stringify(info, null, "	");
  }
  enableKeybindingHoldMode(commandId) {
    if (this._currentlyDispatchingCommandId !== commandId) {
      return void 0;
    }
    this._keybindingHoldMode = new DeferredPromise();
    const focusTracker = dom.trackFocus(dom.getWindow(void 0));
    const listener = focusTracker.onDidBlur(() => this._resetKeybindingHoldMode());
    this._keybindingHoldMode.p.finally(() => {
      listener.dispose();
      focusTracker.dispose();
    });
    this._log(`+ Enabled hold-mode for ${commandId}.`);
    return this._keybindingHoldMode.p;
  }
  _resetKeybindingHoldMode() {
    if (this._keybindingHoldMode) {
      this._keybindingHoldMode?.complete();
      this._keybindingHoldMode = null;
    }
  }
  customKeybindingsCount() {
    return this.userKeybindings.keybindings.length;
  }
  updateResolver() {
    this._cachedResolver = null;
    this._onDidUpdateKeybindings.fire();
  }
  _getResolver() {
    if (!this._cachedResolver) {
      const defaults = this._resolveKeybindingItems(KeybindingsRegistry.getDefaultKeybindings(), true);
      const overrides = this._resolveUserKeybindingItems(this.userKeybindings.keybindings, false);
      this._cachedResolver = new KeybindingResolver(defaults, overrides, (str) => this._log(str));
    }
    return this._cachedResolver;
  }
  _documentHasFocus() {
    return this.hostService.hasFocus;
  }
  _resolveKeybindingItems(items, isDefault) {
    const result = [];
    let resultLen = 0;
    for (const item of items) {
      const when = item.when || void 0;
      const keybinding = item.keybinding;
      if (!keybinding) {
        result[resultLen++] = new ResolvedKeybindingItem(void 0, item.command, item.commandArgs, when, isDefault, item.extensionId, item.isBuiltinExtension);
      } else {
        if (this._assertBrowserConflicts(keybinding)) {
          continue;
        }
        const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(keybinding);
        for (let i = resolvedKeybindings.length - 1; i >= 0; i--) {
          const resolvedKeybinding = resolvedKeybindings[i];
          result[resultLen++] = new ResolvedKeybindingItem(resolvedKeybinding, item.command, item.commandArgs, when, isDefault, item.extensionId, item.isBuiltinExtension);
        }
      }
    }
    return result;
  }
  _resolveUserKeybindingItems(items, isDefault) {
    const result = [];
    let resultLen = 0;
    for (const item of items) {
      const when = item.when || void 0;
      if (!item.keybinding) {
        result[resultLen++] = new ResolvedKeybindingItem(void 0, item.command, item.commandArgs, when, isDefault, null, false, item.systemWide);
      } else {
        const resolvedKeybindings = this._keyboardMapper.resolveKeybinding(item.keybinding);
        for (const resolvedKeybinding of resolvedKeybindings) {
          result[resultLen++] = new ResolvedKeybindingItem(resolvedKeybinding, item.command, item.commandArgs, when, isDefault, null, false, item.systemWide);
        }
      }
    }
    return result;
  }
  _assertBrowserConflicts(keybinding) {
    if (BrowserFeatures.keyboard === KeyboardSupport.Always) {
      return false;
    }
    if (BrowserFeatures.keyboard === KeyboardSupport.FullScreen && browser.isFullscreen(mainWindow)) {
      return false;
    }
    for (const chord of keybinding.chords) {
      if (!chord.metaKey && !chord.altKey && !chord.ctrlKey && !chord.shiftKey) {
        continue;
      }
      const modifiersMask = KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift;
      let partModifiersMask = 0;
      if (chord.metaKey) {
        partModifiersMask |= KeyMod.CtrlCmd;
      }
      if (chord.shiftKey) {
        partModifiersMask |= KeyMod.Shift;
      }
      if (chord.altKey) {
        partModifiersMask |= KeyMod.Alt;
      }
      if (chord.ctrlKey && OS === OperatingSystem.Macintosh) {
        partModifiersMask |= KeyMod.WinCtrl;
      }
      if ((partModifiersMask & modifiersMask) === (KeyMod.CtrlCmd | KeyMod.Alt)) {
        if (chord instanceof ScanCodeChord && (chord.scanCode === ScanCode.ArrowLeft || chord.scanCode === ScanCode.ArrowRight)) {
          return true;
        }
        if (chord instanceof KeyCodeChord && (chord.keyCode === KeyCode.LeftArrow || chord.keyCode === KeyCode.RightArrow)) {
          return true;
        }
      }
      if ((partModifiersMask & modifiersMask) === KeyMod.CtrlCmd) {
        if (chord instanceof ScanCodeChord && (chord.scanCode >= ScanCode.Digit1 && chord.scanCode <= ScanCode.Digit0)) {
          return true;
        }
        if (chord instanceof KeyCodeChord && (chord.keyCode >= KeyCode.Digit0 && chord.keyCode <= KeyCode.Digit9)) {
          return true;
        }
      }
    }
    return false;
  }
  resolveKeybinding(kb) {
    return this._keyboardMapper.resolveKeybinding(kb);
  }
  resolveKeyboardEvent(keyboardEvent) {
    this.keyboardLayoutService.validateCurrentKeyboardMapping(keyboardEvent);
    return this._keyboardMapper.resolveKeyboardEvent(keyboardEvent);
  }
  resolveUserBinding(userBinding) {
    const keybinding = KeybindingParser.parseKeybinding(userBinding);
    return keybinding ? this._keyboardMapper.resolveKeybinding(keybinding) : [];
  }
  _handleKeybindingsExtensionPointUser(extensionId, isBuiltin, keybindings, collector, result) {
    if (Array.isArray(keybindings)) {
      for (let i = 0, len = keybindings.length; i < len; i++) {
        this._handleKeybinding(extensionId, isBuiltin, i + 1, keybindings[i], collector, result);
      }
    } else {
      this._handleKeybinding(extensionId, isBuiltin, 1, keybindings, collector, result);
    }
  }
  _handleKeybinding(extensionId, isBuiltin, idx, keybindings, collector, result) {
    const rejects = [];
    if (isValidContributedKeyBinding(keybindings, rejects)) {
      const rule = this._asCommandRule(extensionId, isBuiltin, idx++, keybindings);
      if (rule) {
        result.push(rule);
      }
    }
    if (rejects.length > 0) {
      collector.error(nls.localize(
        "invalid.keybindings",
        "Invalid `contributes.{0}`: {1}",
        keybindingsExtPoint.name,
        rejects.join("\n")
      ));
    }
  }
  static bindToCurrentPlatform(key, mac, linux, win) {
    if (OS === OperatingSystem.Windows && win) {
      if (win) {
        return win;
      }
    } else if (OS === OperatingSystem.Macintosh) {
      if (mac) {
        return mac;
      }
    } else {
      if (linux) {
        return linux;
      }
    }
    return key;
  }
  _asCommandRule(extensionId, isBuiltin, idx, binding) {
    const { command, args, when, key, mac, linux, win } = binding;
    const keybinding = WorkbenchKeybindingService.bindToCurrentPlatform(key, mac, linux, win);
    if (!keybinding) {
      return void 0;
    }
    let weight;
    if (isBuiltin) {
      weight = KeybindingWeight.BuiltinExtension + idx;
    } else {
      weight = KeybindingWeight.ExternalExtension + idx;
    }
    const commandAction = MenuRegistry.getCommand(command);
    const precondition = commandAction && commandAction.precondition;
    let fullWhen;
    if (when && precondition) {
      fullWhen = ContextKeyExpr.and(precondition, ContextKeyExpr.deserialize(when));
    } else if (when) {
      fullWhen = ContextKeyExpr.deserialize(when);
    } else if (precondition) {
      fullWhen = precondition;
    }
    const desc = {
      id: command,
      args,
      when: fullWhen,
      weight,
      keybinding: KeybindingParser.parseKeybinding(keybinding),
      extensionId: extensionId.value,
      isBuiltinExtension: isBuiltin
    };
    return desc;
  }
  getDefaultKeybindingsContent() {
    const resolver = this._getResolver();
    const defaultKeybindings = resolver.getDefaultKeybindings();
    const boundCommands = resolver.getDefaultBoundCommands();
    return WorkbenchKeybindingService._getDefaultKeybindings(defaultKeybindings) + "\n\n" + WorkbenchKeybindingService._getAllCommandsAsComment(boundCommands);
  }
  static _getDefaultKeybindings(defaultKeybindings) {
    const out = new OutputBuilder();
    out.writeLine("[");
    const lastIndex = defaultKeybindings.length - 1;
    defaultKeybindings.forEach((k, index) => {
      KeybindingIO.writeKeybindingItem(out, k);
      if (index !== lastIndex) {
        out.writeLine(",");
      } else {
        out.writeLine();
      }
    });
    out.writeLine("]");
    return out.toString();
  }
  static _getAllCommandsAsComment(boundCommands) {
    const unboundCommands = getAllUnboundCommands(boundCommands);
    const pretty = unboundCommands.sort().join("\n// - ");
    return "// " + nls.localize("unboundCommands", "Here are other available commands: ") + "\n// - " + pretty;
  }
  mightProducePrintableCharacter(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    const code = ScanCodeUtils.toEnum(event.code);
    if (NUMPAD_PRINTABLE_SCANCODES.indexOf(code) !== -1) {
      if (event.keyCode === IMMUTABLE_CODE_TO_KEY_CODE[code]) {
        return true;
      }
      if (isMacintosh && event.keyCode === otherMacNumpadMapping.get(code)) {
        return true;
      }
      return false;
    }
    const keycode = IMMUTABLE_CODE_TO_KEY_CODE[code];
    if (keycode !== -1) {
      return false;
    }
    const mapping = this.keyboardLayoutService.getRawKeyboardMapping();
    if (!mapping) {
      return false;
    }
    const keyInfo = mapping[event.code];
    if (!keyInfo) {
      return false;
    }
    if (!keyInfo.value || /\s/.test(keyInfo.value)) {
      return false;
    }
    return true;
  }
};
WorkbenchKeybindingService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IUserDataProfileService),
  __decorateParam(5, IHostService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, IFileService),
  __decorateParam(8, IUriIdentityService),
  __decorateParam(9, ILogService),
  __decorateParam(10, IKeyboardLayoutService)
], WorkbenchKeybindingService);
class UserKeybindings extends Disposable {
  constructor(userDataProfileService, uriIdentityService, fileService, logService) {
    super();
    this.userDataProfileService = userDataProfileService;
    this.uriIdentityService = uriIdentityService;
    this.fileService = fileService;
    this._rawKeybindings = [];
    this._keybindings = [];
    this.watchDisposables = this._register(new DisposableStore());
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.watch();
    this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then((changed) => {
      if (changed) {
        this._onDidChange.fire();
      }
    }), 50));
    this._register(Event.filter(this.fileService.onDidFilesChange, (e) => e.contains(this.userDataProfileService.currentProfile.keybindingsResource))(() => {
      logService.debug("Keybindings file changed");
      this.reloadConfigurationScheduler.schedule();
    }));
    this._register(this.fileService.onDidRunOperation((e) => {
      if (e.operation === FileOperation.WRITE && e.resource.toString() === this.userDataProfileService.currentProfile.keybindingsResource.toString()) {
        logService.debug("Keybindings file written");
        this.reloadConfigurationScheduler.schedule();
      }
    }));
    this._register(userDataProfileService.onDidChangeCurrentProfile((e) => {
      if (!this.uriIdentityService.extUri.isEqual(e.previous.keybindingsResource, e.profile.keybindingsResource)) {
        e.join(this.whenCurrentProfileChanged());
      }
    }));
  }
  get keybindings() {
    return this._keybindings;
  }
  async whenCurrentProfileChanged() {
    this.watch();
    this.reloadConfigurationScheduler.schedule();
  }
  watch() {
    this.watchDisposables.clear();
    this.watchDisposables.add(this.fileService.watch(dirname(this.userDataProfileService.currentProfile.keybindingsResource)));
    this.watchDisposables.add(this.fileService.watch(this.userDataProfileService.currentProfile.keybindingsResource));
  }
  async initialize() {
    await this.reload();
  }
  async reload() {
    const newKeybindings = await this.readUserKeybindings();
    if (objects.equals(this._rawKeybindings, newKeybindings)) {
      return false;
    }
    this._rawKeybindings = newKeybindings;
    this._keybindings = this._rawKeybindings.map((k) => KeybindingIO.readUserKeybindingItem(k));
    return true;
  }
  async readUserKeybindings() {
    try {
      const content = await this.fileService.readFile(this.userDataProfileService.currentProfile.keybindingsResource);
      const value = parse(content.value.toString());
      return Array.isArray(value) ? value.filter(
        (v) => v && typeof v === "object"
        /* just typeof === object doesn't catch `null` */
      ) : [];
    } catch (e) {
      return [];
    }
  }
}
const _KeybindingsJsonSchema = class _KeybindingsJsonSchema {
  constructor() {
    this.commandsSchemas = [];
    this.commandsEnum = [];
    this.removalCommandsEnum = [];
    this.commandsEnumDescriptions = [];
    this.schema = {
      id: _KeybindingsJsonSchema.schemaId,
      type: "array",
      title: nls.localize("keybindings.json.title", "Keybindings configuration"),
      allowTrailingCommas: true,
      allowComments: true,
      definitions: {
        "editorGroupsSchema": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "groups": {
                "$ref": "#/definitions/editorGroupsSchema",
                "default": [{}, {}]
              },
              "size": {
                "type": "number",
                "default": 0.5
              }
            }
          }
        },
        "commandNames": {
          "type": "string",
          "enum": this.commandsEnum,
          "enumDescriptions": this.commandsEnumDescriptions,
          "description": nls.localize("keybindings.json.command", "Name of the command to execute")
        },
        "commandType": {
          "anyOf": [
            // repetition of this clause here and below is intentional: one is for nice diagnostics & one is for code completion
            {
              $ref: "#/definitions/commandNames"
            },
            {
              "type": "string",
              "enum": this.removalCommandsEnum,
              "enumDescriptions": this.commandsEnumDescriptions,
              "description": nls.localize("keybindings.json.removalCommand", "Name of the command to remove keyboard shortcut for")
            },
            {
              "type": "string"
            }
          ]
        },
        "commandsSchemas": {
          "allOf": this.commandsSchemas
        }
      },
      items: {
        "required": ["key"],
        "type": "object",
        "defaultSnippets": [{ "body": { "key": "$1", "command": "$2", "when": "$3" } }],
        "properties": {
          "key": {
            "type": "string",
            "description": nls.localize("keybindings.json.key", "Key or key sequence (separated by space)")
          },
          "command": {
            "anyOf": [
              {
                "if": {
                  "type": "array"
                },
                "then": {
                  "not": {
                    "type": "array"
                  },
                  "errorMessage": nls.localize("keybindings.commandsIsArray", `Incorrect type. Expected "{0}". The field 'command' does not support running multiple commands. Use command 'runCommands' to pass it multiple commands to run.`, "string")
                },
                "else": {
                  "$ref": "#/definitions/commandType"
                }
              },
              {
                "$ref": "#/definitions/commandType"
              }
            ]
          },
          "when": {
            "type": "string",
            "description": nls.localize("keybindings.json.when", "Condition when the key is active.")
          },
          "args": {
            "description": nls.localize("keybindings.json.args", "Arguments to pass to the command to execute.")
          },
          "systemWide": {
            "type": "boolean",
            "default": false,
            "markdownDescription": nls.localize("keybindings.json.systemWide", "When `true`, registers this keybinding as a system-wide (OS global) shortcut that fires even when the application is not focused. Desktop only. Only single key combinations are supported (no chords), and any `when` clause is ignored for the global trigger.")
          }
        },
        "$ref": "#/definitions/commandsSchemas"
      }
    };
    this.schemaRegistry = Registry.as(Extensions.JSONContribution);
    this.schemaRegistry.registerSchema(_KeybindingsJsonSchema.schemaId, this.schema);
  }
  // TODO@ulugbekna: can updates happen incrementally rather than rebuilding; concerns:
  // - is just appending additional schemas enough for the registry to pick them up?
  // - can `CommandsRegistry.getCommands` and `MenuRegistry.getCommands` return different values at different times? ie would just pushing new schemas from `additionalContributions` not be enough?
  updateSchema(additionalContributions) {
    this.commandsSchemas.length = 0;
    this.commandsEnum.length = 0;
    this.removalCommandsEnum.length = 0;
    this.commandsEnumDescriptions.length = 0;
    const knownCommands = /* @__PURE__ */ new Set();
    const addKnownCommand = (commandId, description) => {
      if (!/^_/.test(commandId)) {
        if (!knownCommands.has(commandId)) {
          knownCommands.add(commandId);
          this.commandsEnum.push(commandId);
          this.commandsEnumDescriptions.push(
            description === void 0 ? "" : isLocalizedString(description) ? description.value : description
          );
          this.removalCommandsEnum.push(`-${commandId}`);
        }
      }
    };
    const allCommands = CommandsRegistry.getCommands();
    for (const [commandId, command] of allCommands) {
      const commandMetadata = command.metadata;
      addKnownCommand(commandId, commandMetadata?.description ?? MenuRegistry.getCommand(commandId)?.title);
      if (!commandMetadata || !commandMetadata.args || commandMetadata.args.length !== 1 || !commandMetadata.args[0].schema) {
        continue;
      }
      const argsSchema = commandMetadata.args[0].schema;
      const argsRequired = typeof commandMetadata.args[0].isOptional !== "undefined" ? !commandMetadata.args[0].isOptional : Array.isArray(argsSchema.required) && argsSchema.required.length > 0;
      const addition = {
        "if": {
          "required": ["command"],
          "properties": {
            "command": { "const": commandId }
          }
        },
        "then": {
          "required": [].concat(argsRequired ? ["args"] : []),
          "properties": {
            "args": argsSchema
          }
        }
      };
      this.commandsSchemas.push(addition);
    }
    const menuCommands = MenuRegistry.getCommands();
    for (const commandId of menuCommands.keys()) {
      addKnownCommand(commandId);
    }
    this.commandsSchemas.push(...additionalContributions);
    this.schemaRegistry.notifySchemaChanged(_KeybindingsJsonSchema.schemaId);
  }
};
_KeybindingsJsonSchema.schemaId = "vscode://schemas/keybindings";
let KeybindingsJsonSchema = _KeybindingsJsonSchema;
registerSingleton(IKeybindingService, WorkbenchKeybindingService, InstantiationType.Eager);
export {
  WorkbenchKeybindingService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9rZXliaW5kaW5nL2Jyb3dzZXIva2V5YmluZGluZ1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuLy8gYmFzZVxuaW1wb3J0ICogYXMgYnJvd3NlciBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvYnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBCcm93c2VyRmVhdHVyZXMsIEtleWJvYXJkU3VwcG9ydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9jYW5JVXNlLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHByaW50S2V5Ym9hcmRFdmVudCwgcHJpbnRTdGFuZGFyZEtleWJvYXJkRXZlbnQsIFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hLCBUeXBlRnJvbUpzb25TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IFVzZXJTZXR0aW5nc0xhYmVsUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5nTGFiZWxzLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5nUGFyc2VyLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmcsIEtleUNvZGVDaG9yZCwgUmVzb2x2ZWRLZXliaW5kaW5nLCBTY2FuQ29kZUNob3JkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ3MuanMnO1xuaW1wb3J0IHsgSU1NVVRBQkxFX0NPREVfVE9fS0VZX0NPREUsIEtleUNvZGUsIEtleUNvZGVVdGlscywgS2V5TW9kLCBTY2FuQ29kZSwgU2NhbkNvZGVVdGlscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2gsIE9wZXJhdGluZ1N5c3RlbSwgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcblxuLy8gcGxhdGZvcm1cbmltcG9ydCB7IElMb2NhbGl6ZWRTdHJpbmcsIGlzTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vanNvbnNjaGVtYXMvY29tbW9uL2pzb25Db250cmlidXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24vYWJzdHJhY3RLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UsIElLZXlib2FyZEV2ZW50LCBLZXliaW5kaW5nc1NjaGVtYUNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1Jlc29sdmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ1Jlc29sdmVyLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25LZXliaW5kaW5nUnVsZSwgSUtleWJpbmRpbmdJdGVtLCBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24vcmVzb2x2ZWRLZXliaW5kaW5nSXRlbS5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5Ym9hcmRMYXlvdXQvY29tbW9uL2tleWJvYXJkTGF5b3V0LmpzJztcbmltcG9ydCB7IElLZXlib2FyZE1hcHBlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJvYXJkTGF5b3V0L2NvbW1vbi9rZXlib2FyZE1hcHBlci5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcblxuLy8gd29ya2JlbmNoXG5pbXBvcnQgeyByZW1vdmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgY29tbWFuZHNFeHRlbnNpb25Qb2ludCB9IGZyb20gJy4uLy4uL2FjdGlvbnMvY29tbW9uL21lbnVzRXh0ZW5zaW9uUG9pbnQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IsIEV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElVc2VyS2V5YmluZGluZ0l0ZW0sIEtleWJpbmRpbmdJTywgT3V0cHV0QnVpbGRlciB9IGZyb20gJy4uL2NvbW1vbi9rZXliaW5kaW5nSU8uanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkLCBJTmF2aWdhdG9yV2l0aEtleWJvYXJkIH0gZnJvbSAnLi9uYXZpZ2F0b3JLZXlib2FyZC5qcyc7XG5pbXBvcnQgeyBnZXRBbGxVbmJvdW5kQ29tbWFuZHMgfSBmcm9tICcuL3VuYm91bmRDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuXG5mdW5jdGlvbiBpc1ZhbGlkQ29udHJpYnV0ZWRLZXlCaW5kaW5nKGtleUJpbmRpbmc6IENvbnRyaWJ1dGVkS2V5QmluZGluZywgcmVqZWN0czogc3RyaW5nW10pOiBib29sZWFuIHtcblx0aWYgKCFrZXlCaW5kaW5nKSB7XG5cdFx0cmVqZWN0cy5wdXNoKG5scy5sb2NhbGl6ZSgnbm9uZW1wdHknLCBcImV4cGVjdGVkIG5vbi1lbXB0eSB2YWx1ZS5cIikpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAodHlwZW9mIGtleUJpbmRpbmcuY29tbWFuZCAhPT0gJ3N0cmluZycpIHtcblx0XHRyZWplY3RzLnB1c2gobmxzLmxvY2FsaXplKCdyZXF1aXJlc3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBpcyBtYW5kYXRvcnkgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnY29tbWFuZCcpKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKGtleUJpbmRpbmcua2V5ICYmIHR5cGVvZiBrZXlCaW5kaW5nLmtleSAhPT0gJ3N0cmluZycpIHtcblx0XHRyZWplY3RzLnB1c2gobmxzLmxvY2FsaXplKCdvcHRzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIG9yIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAna2V5JykpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoa2V5QmluZGluZy53aGVuICYmIHR5cGVvZiBrZXlCaW5kaW5nLndoZW4gIT09ICdzdHJpbmcnKSB7XG5cdFx0cmVqZWN0cy5wdXNoKG5scy5sb2NhbGl6ZSgnb3B0c3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBjYW4gYmUgb21pdHRlZCBvciBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ3doZW4nKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChrZXlCaW5kaW5nLm1hYyAmJiB0eXBlb2Yga2V5QmluZGluZy5tYWMgIT09ICdzdHJpbmcnKSB7XG5cdFx0cmVqZWN0cy5wdXNoKG5scy5sb2NhbGl6ZSgnb3B0c3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBjYW4gYmUgb21pdHRlZCBvciBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ21hYycpKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKGtleUJpbmRpbmcubGludXggJiYgdHlwZW9mIGtleUJpbmRpbmcubGludXggIT09ICdzdHJpbmcnKSB7XG5cdFx0cmVqZWN0cy5wdXNoKG5scy5sb2NhbGl6ZSgnb3B0c3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBjYW4gYmUgb21pdHRlZCBvciBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ2xpbnV4JykpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoa2V5QmluZGluZy53aW4gJiYgdHlwZW9mIGtleUJpbmRpbmcud2luICE9PSAnc3RyaW5nJykge1xuXHRcdHJlamVjdHMucHVzaChubHMubG9jYWxpemUoJ29wdHN0cmluZycsIFwicHJvcGVydHkgYHswfWAgY2FuIGJlIG9taXR0ZWQgb3IgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICd3aW4nKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5jb25zdCBrZXliaW5kaW5nVHlwZSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdGRlZmF1bHQ6IHsgY29tbWFuZDogJycsIGtleTogJycgfSxcblx0cmVxdWlyZWQ6IFsnY29tbWFuZCcsICdrZXknXSxcblx0cHJvcGVydGllczoge1xuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMua2V5YmluZGluZ3MuY29tbWFuZCcsICdJZGVudGlmaWVyIG9mIHRoZSBjb21tYW5kIHRvIHJ1biB3aGVuIGtleWJpbmRpbmcgaXMgdHJpZ2dlcmVkLicpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdGFyZ3M6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMua2V5YmluZGluZ3MuYXJncycsIFwiQXJndW1lbnRzIHRvIHBhc3MgdG8gdGhlIGNvbW1hbmQgdG8gZXhlY3V0ZS5cIilcblx0XHR9LFxuXHRcdGtleToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5rZXliaW5kaW5ncy5rZXknLCAnS2V5IG9yIGtleSBzZXF1ZW5jZSAoc2VwYXJhdGUga2V5cyB3aXRoIHBsdXMtc2lnbiBhbmQgc2VxdWVuY2VzIHdpdGggc3BhY2UsIGUuZy4gQ3RybCtPIGFuZCBDdHJsK0wgTCBmb3IgYSBjaG9yZCkuJyksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdH0sXG5cdFx0bWFjOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmtleWJpbmRpbmdzLm1hYycsICdNYWMgc3BlY2lmaWMga2V5IG9yIGtleSBzZXF1ZW5jZS4nKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0XHRsaW51eDoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5rZXliaW5kaW5ncy5saW51eCcsICdMaW51eCBzcGVjaWZpYyBrZXkgb3Iga2V5IHNlcXVlbmNlLicpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdHdpbjoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5rZXliaW5kaW5ncy53aW4nLCAnV2luZG93cyBzcGVjaWZpYyBrZXkgb3Iga2V5IHNlcXVlbmNlLicpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdHdoZW46IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMua2V5YmluZGluZ3Mud2hlbicsICdDb25kaXRpb24gd2hlbiB0aGUga2V5IGlzIGFjdGl2ZS4nKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0fVxufSBhcyBjb25zdCBzYXRpc2ZpZXMgSUpTT05TY2hlbWE7XG5cbnR5cGUgQ29udHJpYnV0ZWRLZXlCaW5kaW5nID0gVHlwZUZyb21Kc29uU2NoZW1hPHR5cGVvZiBrZXliaW5kaW5nVHlwZT47XG5cbmNvbnN0IGtleWJpbmRpbmdzRXh0UG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxDb250cmlidXRlZEtleUJpbmRpbmcgfCBDb250cmlidXRlZEtleUJpbmRpbmdbXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ2tleWJpbmRpbmdzJyxcblx0ZGVwczogW2NvbW1hbmRzRXh0ZW5zaW9uUG9pbnRdLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5rZXliaW5kaW5ncycsIFwiQ29udHJpYnV0ZXMga2V5YmluZGluZ3MuXCIpLFxuXHRcdG9uZU9mOiBbXG5cdFx0XHRrZXliaW5kaW5nVHlwZSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0aXRlbXM6IGtleWJpbmRpbmdUeXBlXG5cdFx0XHR9XG5cdFx0XVxuXHR9XG59KTtcblxuY29uc3QgTlVNUEFEX1BSSU5UQUJMRV9TQ0FOQ09ERVMgPSBbXG5cdFNjYW5Db2RlLk51bXBhZERpdmlkZSxcblx0U2NhbkNvZGUuTnVtcGFkTXVsdGlwbHksXG5cdFNjYW5Db2RlLk51bXBhZFN1YnRyYWN0LFxuXHRTY2FuQ29kZS5OdW1wYWRBZGQsXG5cdFNjYW5Db2RlLk51bXBhZDEsXG5cdFNjYW5Db2RlLk51bXBhZDIsXG5cdFNjYW5Db2RlLk51bXBhZDMsXG5cdFNjYW5Db2RlLk51bXBhZDQsXG5cdFNjYW5Db2RlLk51bXBhZDUsXG5cdFNjYW5Db2RlLk51bXBhZDYsXG5cdFNjYW5Db2RlLk51bXBhZDcsXG5cdFNjYW5Db2RlLk51bXBhZDgsXG5cdFNjYW5Db2RlLk51bXBhZDksXG5cdFNjYW5Db2RlLk51bXBhZDAsXG5cdFNjYW5Db2RlLk51bXBhZERlY2ltYWxcbl07XG5cbmNvbnN0IG90aGVyTWFjTnVtcGFkTWFwcGluZyA9IG5ldyBNYXA8U2NhbkNvZGUsIEtleUNvZGU+KCk7XG5vdGhlck1hY051bXBhZE1hcHBpbmcuc2V0KFNjYW5Db2RlLk51bXBhZDEsIEtleUNvZGUuRGlnaXQxKTtcbm90aGVyTWFjTnVtcGFkTWFwcGluZy5zZXQoU2NhbkNvZGUuTnVtcGFkMiwgS2V5Q29kZS5EaWdpdDIpO1xub3RoZXJNYWNOdW1wYWRNYXBwaW5nLnNldChTY2FuQ29kZS5OdW1wYWQzLCBLZXlDb2RlLkRpZ2l0Myk7XG5vdGhlck1hY051bXBhZE1hcHBpbmcuc2V0KFNjYW5Db2RlLk51bXBhZDQsIEtleUNvZGUuRGlnaXQ0KTtcbm90aGVyTWFjTnVtcGFkTWFwcGluZy5zZXQoU2NhbkNvZGUuTnVtcGFkNSwgS2V5Q29kZS5EaWdpdDUpO1xub3RoZXJNYWNOdW1wYWRNYXBwaW5nLnNldChTY2FuQ29kZS5OdW1wYWQ2LCBLZXlDb2RlLkRpZ2l0Nik7XG5vdGhlck1hY051bXBhZE1hcHBpbmcuc2V0KFNjYW5Db2RlLk51bXBhZDcsIEtleUNvZGUuRGlnaXQ3KTtcbm90aGVyTWFjTnVtcGFkTWFwcGluZy5zZXQoU2NhbkNvZGUuTnVtcGFkOCwgS2V5Q29kZS5EaWdpdDgpO1xub3RoZXJNYWNOdW1wYWRNYXBwaW5nLnNldChTY2FuQ29kZS5OdW1wYWQ5LCBLZXlDb2RlLkRpZ2l0OSk7XG5vdGhlck1hY051bXBhZE1hcHBpbmcuc2V0KFNjYW5Db2RlLk51bXBhZDAsIEtleUNvZGUuRGlnaXQwKTtcblxuZXhwb3J0IGNsYXNzIFdvcmtiZW5jaEtleWJpbmRpbmdTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RLZXliaW5kaW5nU2VydmljZSB7XG5cblx0cHJpdmF0ZSBfa2V5Ym9hcmRNYXBwZXI6IElLZXlib2FyZE1hcHBlcjtcblx0cHJpdmF0ZSBfY2FjaGVkUmVzb2x2ZXI6IEtleWJpbmRpbmdSZXNvbHZlciB8IG51bGw7XG5cdHByaXZhdGUgdXNlcktleWJpbmRpbmdzOiBVc2VyS2V5YmluZGluZ3M7XG5cdHByaXZhdGUgaXNDb21wb3NpbmdHbG9iYWxDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfa2V5YmluZGluZ0hvbGRNb2RlOiBEZWZlcnJlZFByb21pc2U8dm9pZD4gfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250cmlidXRpb25zOiBBcnJheTx7XG5cdFx0cmVhZG9ubHkgbGlzdGVuZXI/OiBJRGlzcG9zYWJsZTtcblx0XHRyZWFkb25seSBjb250cmlidXRpb246IEtleWJpbmRpbmdzU2NoZW1hQ29udHJpYnV0aW9uO1xuXHR9PiA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGtic0pzb25TY2hlbWE6IEtleWJpbmRpbmdzSnNvblNjaGVtYTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUtleWJvYXJkTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJvYXJkTGF5b3V0U2VydmljZTogSUtleWJvYXJkTGF5b3V0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihjb250ZXh0S2V5U2VydmljZSwgY29tbWFuZFNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5pc0NvbXBvc2luZ0dsb2JhbENvbnRleHRLZXkgPSBjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoRWRpdG9yQ29udGV4dEtleXMuaXNDb21wb3Npbmcua2V5LCBmYWxzZSk7XG5cblx0XHR0aGlzLmtic0pzb25TY2hlbWEgPSBuZXcgS2V5YmluZGluZ3NKc29uU2NoZW1hKCk7XG5cdFx0dGhpcy51cGRhdGVLZXliaW5kaW5nc0pzb25TY2hlbWEoKTtcblxuXHRcdHRoaXMuX2tleWJvYXJkTWFwcGVyID0gdGhpcy5rZXlib2FyZExheW91dFNlcnZpY2UuZ2V0S2V5Ym9hcmRNYXBwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmtleWJvYXJkTGF5b3V0U2VydmljZS5vbkRpZENoYW5nZUtleWJvYXJkTGF5b3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2tleWJvYXJkTWFwcGVyID0gdGhpcy5rZXlib2FyZExheW91dFNlcnZpY2UuZ2V0S2V5Ym9hcmRNYXBwZXIoKTtcblx0XHRcdHRoaXMudXBkYXRlUmVzb2x2ZXIoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9rZXliaW5kaW5nSG9sZE1vZGUgPSBudWxsO1xuXHRcdHRoaXMuX2NhY2hlZFJlc29sdmVyID0gbnVsbDtcblxuXHRcdHRoaXMudXNlcktleWJpbmRpbmdzID0gdGhpcy5fcmVnaXN0ZXIobmV3IFVzZXJLZXliaW5kaW5ncyh1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0dGhpcy51c2VyS2V5YmluZGluZ3MuaW5pdGlhbGl6ZSgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMudXNlcktleWJpbmRpbmdzLmtleWJpbmRpbmdzLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVJlc29sdmVyKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyS2V5YmluZGluZ3Mub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0bG9nU2VydmljZS5kZWJ1ZygnVXNlciBrZXliaW5kaW5ncyBjaGFuZ2VkJyk7XG5cdFx0XHR0aGlzLnVwZGF0ZVJlc29sdmVyKCk7XG5cdFx0fSkpO1xuXG5cdFx0a2V5YmluZGluZ3NFeHRQb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zKSA9PiB7XG5cblx0XHRcdGNvbnN0IGtleWJpbmRpbmdzOiBJRXh0ZW5zaW9uS2V5YmluZGluZ1J1bGVbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVLZXliaW5kaW5nc0V4dGVuc2lvblBvaW50VXNlcihleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllciwgZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlzQnVpbHRpbiwgZXh0ZW5zaW9uLnZhbHVlLCBleHRlbnNpb24uY29sbGVjdG9yLCBrZXliaW5kaW5ncyk7XG5cdFx0XHR9XG5cblx0XHRcdEtleWJpbmRpbmdzUmVnaXN0cnkuc2V0RXh0ZW5zaW9uS2V5YmluZGluZ3Moa2V5YmluZGluZ3MpO1xuXHRcdFx0dGhpcy51cGRhdGVSZXNvbHZlcigpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy51cGRhdGVLZXliaW5kaW5nc0pzb25TY2hlbWEoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25TZXJ2aWNlLm9uRGlkUmVnaXN0ZXJFeHRlbnNpb25zKCgpID0+IHRoaXMudXBkYXRlS2V5YmluZGluZ3NKc29uU2NoZW1hKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShkb20ub25EaWRSZWdpc3RlcldpbmRvdywgKHsgd2luZG93LCBkaXNwb3NhYmxlcyB9KSA9PiBkaXNwb3NhYmxlcy5hZGQodGhpcy5fcmVnaXN0ZXJLZXlMaXN0ZW5lcnMod2luZG93KSksIHsgd2luZG93OiBtYWluV2luZG93LCBkaXNwb3NhYmxlczogdGhpcy5fc3RvcmUgfSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYnJvd3Nlci5vbkRpZENoYW5nZUZ1bGxzY3JlZW4od2luZG93SWQgPT4ge1xuXHRcdFx0aWYgKHdpbmRvd0lkICE9PSBtYWluV2luZG93LnZzY29kZVdpbmRvd0lkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qga2V5Ym9hcmQ6IElLZXlib2FyZCB8IG51bGwgPSAoPElOYXZpZ2F0b3JXaXRoS2V5Ym9hcmQ+bmF2aWdhdG9yKS5rZXlib2FyZDtcblxuXHRcdFx0aWYgKEJyb3dzZXJGZWF0dXJlcy5rZXlib2FyZCA9PT0gS2V5Ym9hcmRTdXBwb3J0Lk5vbmUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYnJvd3Nlci5pc0Z1bGxzY3JlZW4obWFpbldpbmRvdykpIHtcblx0XHRcdFx0a2V5Ym9hcmQ/LmxvY2soWydFc2NhcGUnXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRrZXlib2FyZD8udW5sb2NrKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHVwZGF0ZSByZXNvbHZlciB3aGljaCB3aWxsIGJyaW5nIGJhY2sgYWxsIHVuYm91bmQga2V5Ym9hcmQgc2hvcnRjdXRzXG5cdFx0XHR0aGlzLl9jYWNoZWRSZXNvbHZlciA9IG51bGw7XG5cdFx0XHR0aGlzLl9vbkRpZFVwZGF0ZUtleWJpbmRpbmdzLmZpcmUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250cmlidXRpb25zLmZvckVhY2goYyA9PiBjLmxpc3RlbmVyPy5kaXNwb3NlKCkpO1xuXHRcdHRoaXMuX2NvbnRyaWJ1dGlvbnMubGVuZ3RoID0gMDtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyS2V5TGlzdGVuZXJzKHdpbmRvdzogV2luZG93KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gZm9yIHN0YW5kYXJkIGtleWJpbmRpbmdzXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2tleWJpbmRpbmdIb2xkTW9kZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmlzQ29tcG9zaW5nR2xvYmFsQ29udGV4dEtleS5zZXQoZS5pc0NvbXBvc2luZyk7XG5cdFx0XHRjb25zdCBrZXlFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHR0aGlzLl9sb2coYC8gUmVjZWl2ZWQgIGtleWRvd24gZXZlbnQgLSAke3ByaW50S2V5Ym9hcmRFdmVudChlKX1gKTtcblx0XHRcdHRoaXMuX2xvZyhgfCBDb252ZXJ0ZWQga2V5ZG93biBldmVudCAtICR7cHJpbnRTdGFuZGFyZEtleWJvYXJkRXZlbnQoa2V5RXZlbnQpfWApO1xuXHRcdFx0Y29uc3Qgc2hvdWxkUHJldmVudERlZmF1bHQgPSB0aGlzLl9kaXNwYXRjaChrZXlFdmVudCwga2V5RXZlbnQudGFyZ2V0KTtcblx0XHRcdGlmIChzaG91bGRQcmV2ZW50RGVmYXVsdCkge1xuXHRcdFx0XHRrZXlFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5pc0NvbXBvc2luZ0dsb2JhbENvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBmb3Igc2luZ2xlIG1vZGlmaWVyIGNob3JkIGtleWJpbmRpbmdzIChlLmcuIHNoaWZ0IHNoaWZ0KVxuXHRcdGRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbmRvdywgZG9tLkV2ZW50VHlwZS5LRVlfVVAsIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHR0aGlzLl9yZXNldEtleWJpbmRpbmdIb2xkTW9kZSgpO1xuXHRcdFx0dGhpcy5pc0NvbXBvc2luZ0dsb2JhbENvbnRleHRLZXkuc2V0KGUuaXNDb21wb3NpbmcpO1xuXHRcdFx0Y29uc3Qga2V5RXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0Y29uc3Qgc2hvdWxkUHJldmVudERlZmF1bHQgPSB0aGlzLl9zaW5nbGVNb2RpZmllckRpc3BhdGNoKGtleUV2ZW50LCBrZXlFdmVudC50YXJnZXQpO1xuXHRcdFx0aWYgKHNob3VsZFByZXZlbnREZWZhdWx0KSB7XG5cdFx0XHRcdGtleUV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmlzQ29tcG9zaW5nR2xvYmFsQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlclNjaGVtYUNvbnRyaWJ1dGlvbihjb250cmlidXRpb246IEtleWJpbmRpbmdzU2NoZW1hQ29udHJpYnV0aW9uKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGxpc3RlbmVyID0gY29udHJpYnV0aW9uLm9uRGlkQ2hhbmdlPy4oKCkgPT4gdGhpcy51cGRhdGVLZXliaW5kaW5nc0pzb25TY2hlbWEoKSk7XG5cdFx0Y29uc3QgZW50cnkgPSB7IGxpc3RlbmVyLCBjb250cmlidXRpb24gfTtcblx0XHR0aGlzLl9jb250cmlidXRpb25zLnB1c2goZW50cnkpO1xuXG5cdFx0dGhpcy51cGRhdGVLZXliaW5kaW5nc0pzb25TY2hlbWEoKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0bGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHRcdHJlbW92ZSh0aGlzLl9jb250cmlidXRpb25zLCBlbnRyeSk7XG5cdFx0XHR0aGlzLnVwZGF0ZUtleWJpbmRpbmdzSnNvblNjaGVtYSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVLZXliaW5kaW5nc0pzb25TY2hlbWEoKSB7XG5cdFx0dGhpcy5rYnNKc29uU2NoZW1hLnVwZGF0ZVNjaGVtYSh0aGlzLl9jb250cmlidXRpb25zLmZsYXRNYXAoeCA9PiB4LmNvbnRyaWJ1dGlvbi5nZXRTY2hlbWFBZGRpdGlvbnMoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJpbnRLZXliaW5kaW5nKGtleWJpbmRpbmc6IEtleWJpbmRpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBVc2VyU2V0dGluZ3NMYWJlbFByb3ZpZGVyLnRvTGFiZWwoT1MsIGtleWJpbmRpbmcuY2hvcmRzLCAoY2hvcmQpID0+IHtcblx0XHRcdGlmIChjaG9yZCBpbnN0YW5jZW9mIEtleUNvZGVDaG9yZCkge1xuXHRcdFx0XHRyZXR1cm4gS2V5Q29kZVV0aWxzLnRvU3RyaW5nKGNob3JkLmtleUNvZGUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFNjYW5Db2RlVXRpbHMudG9TdHJpbmcoY2hvcmQuc2NhbkNvZGUpO1xuXHRcdH0pIHx8ICdbbnVsbF0nO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJpbnRSZXNvbHZlZEtleWJpbmRpbmcocmVzb2x2ZWRLZXliaW5kaW5nOiBSZXNvbHZlZEtleWJpbmRpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiByZXNvbHZlZEtleWJpbmRpbmcuZ2V0RGlzcGF0Y2hDaG9yZHMoKS5tYXAoeCA9PiB4IHx8ICdbbnVsbF0nKS5qb2luKCcgJyk7XG5cdH1cblxuXHRwcml2YXRlIF9wcmludFJlc29sdmVkS2V5YmluZGluZ3Mob3V0cHV0OiBzdHJpbmdbXSwgaW5wdXQ6IHN0cmluZywgcmVzb2x2ZWRLZXliaW5kaW5nczogUmVzb2x2ZWRLZXliaW5kaW5nW10pOiB2b2lkIHtcblx0XHRjb25zdCBwYWRMZW5ndGggPSAzNTtcblx0XHRjb25zdCBmaXJzdFJvdyA9IGAke2lucHV0LnBhZFN0YXJ0KHBhZExlbmd0aCwgJyAnKX0gPT4gYDtcblx0XHRpZiAocmVzb2x2ZWRLZXliaW5kaW5ncy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIG5vIGJpbmRpbmcgZm91bmRcblx0XHRcdG91dHB1dC5wdXNoKGAke2ZpcnN0Um93fSR7J1tOTyBCSU5ESU5HXScucGFkU3RhcnQocGFkTGVuZ3RoLCAnICcpfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpcnN0Um93SW5kZW50YXRpb24gPSBmaXJzdFJvdy5sZW5ndGg7XG5cdFx0Y29uc3QgaXNGaXJzdCA9IHRydWU7XG5cdFx0Zm9yIChjb25zdCByZXNvbHZlZEtleWJpbmRpbmcgb2YgcmVzb2x2ZWRLZXliaW5kaW5ncykge1xuXHRcdFx0aWYgKGlzRmlyc3QpIHtcblx0XHRcdFx0b3V0cHV0LnB1c2goYCR7Zmlyc3RSb3d9JHt0aGlzLl9wcmludFJlc29sdmVkS2V5YmluZGluZyhyZXNvbHZlZEtleWJpbmRpbmcpLnBhZFN0YXJ0KHBhZExlbmd0aCwgJyAnKX1gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKGAkeycgJy5yZXBlYXQoZmlyc3RSb3dJbmRlbnRhdGlvbil9JHt0aGlzLl9wcmludFJlc29sdmVkS2V5YmluZGluZyhyZXNvbHZlZEtleWJpbmRpbmcpLnBhZFN0YXJ0KHBhZExlbmd0aCwgJyAnKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kdW1wUmVzb2x2ZUtleWJpbmRpbmdEZWJ1Z0luZm8oKTogc3RyaW5nIHtcblxuXHRcdGNvbnN0IHNlZW5CaW5kaW5ncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblxuXHRcdHJlc3VsdC5wdXNoKGBEZWZhdWx0IFJlc29sdmVkIEtleWJpbmRpbmdzICh1bmlxdWUgb25seSk6YCk7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIEtleWJpbmRpbmdzUmVnaXN0cnkuZ2V0RGVmYXVsdEtleWJpbmRpbmdzKCkpIHtcblx0XHRcdGlmICghaXRlbS5rZXliaW5kaW5nKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5wdXQgPSB0aGlzLl9wcmludEtleWJpbmRpbmcoaXRlbS5rZXliaW5kaW5nKTtcblx0XHRcdGlmIChzZWVuQmluZGluZ3MuaGFzKGlucHV0KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHNlZW5CaW5kaW5ncy5hZGQoaW5wdXQpO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRLZXliaW5kaW5ncyA9IHRoaXMuX2tleWJvYXJkTWFwcGVyLnJlc29sdmVLZXliaW5kaW5nKGl0ZW0ua2V5YmluZGluZyk7XG5cdFx0XHR0aGlzLl9wcmludFJlc29sdmVkS2V5YmluZGluZ3MocmVzdWx0LCBpbnB1dCwgcmVzb2x2ZWRLZXliaW5kaW5ncyk7XG5cdFx0fVxuXG5cdFx0cmVzdWx0LnB1c2goYFVzZXIgUmVzb2x2ZWQgS2V5YmluZGluZ3MgKHVuaXF1ZSBvbmx5KTpgKTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy51c2VyS2V5YmluZGluZ3Mua2V5YmluZGluZ3MpIHtcblx0XHRcdGlmICghaXRlbS5rZXliaW5kaW5nKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5wdXQgPSBpdGVtLl9zb3VyY2VLZXkgPz8gJ0ltcG9zc2libGU6IG1pc3Npbmcgc291cmNlIGtleSwgYnV0IGhhcyBrZXliaW5kaW5nJztcblx0XHRcdGlmIChzZWVuQmluZGluZ3MuaGFzKGlucHV0KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHNlZW5CaW5kaW5ncy5hZGQoaW5wdXQpO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRLZXliaW5kaW5ncyA9IHRoaXMuX2tleWJvYXJkTWFwcGVyLnJlc29sdmVLZXliaW5kaW5nKGl0ZW0ua2V5YmluZGluZyk7XG5cdFx0XHR0aGlzLl9wcmludFJlc29sdmVkS2V5YmluZGluZ3MocmVzdWx0LCBpbnB1dCwgcmVzb2x2ZWRLZXliaW5kaW5ncyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdC5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHB1YmxpYyBfZHVtcERlYnVnSW5mbygpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGxheW91dEluZm8gPSBKU09OLnN0cmluZ2lmeSh0aGlzLmtleWJvYXJkTGF5b3V0U2VydmljZS5nZXRDdXJyZW50S2V5Ym9hcmRMYXlvdXQoKSwgbnVsbCwgJ1xcdCcpO1xuXHRcdGNvbnN0IG1hcHBlckluZm8gPSB0aGlzLl9rZXlib2FyZE1hcHBlci5kdW1wRGVidWdJbmZvKCk7XG5cdFx0Y29uc3QgcmVzb2x2ZWRLZXliaW5kaW5ncyA9IHRoaXMuX2R1bXBSZXNvbHZlS2V5YmluZGluZ0RlYnVnSW5mbygpO1xuXHRcdGNvbnN0IHJhd01hcHBpbmcgPSBKU09OLnN0cmluZ2lmeSh0aGlzLmtleWJvYXJkTGF5b3V0U2VydmljZS5nZXRSYXdLZXlib2FyZE1hcHBpbmcoKSwgbnVsbCwgJ1xcdCcpO1xuXHRcdHJldHVybiBgTGF5b3V0IGluZm86XFxuJHtsYXlvdXRJbmZvfVxcblxcbiR7cmVzb2x2ZWRLZXliaW5kaW5nc31cXG5cXG4ke21hcHBlckluZm99XFxuXFxuUmF3IG1hcHBpbmc6XFxuJHtyYXdNYXBwaW5nfWA7XG5cdH1cblxuXHRwdWJsaWMgX2R1bXBEZWJ1Z0luZm9KU09OKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgaW5mbyA9IHtcblx0XHRcdGxheW91dDogdGhpcy5rZXlib2FyZExheW91dFNlcnZpY2UuZ2V0Q3VycmVudEtleWJvYXJkTGF5b3V0KCksXG5cdFx0XHRyYXdNYXBwaW5nOiB0aGlzLmtleWJvYXJkTGF5b3V0U2VydmljZS5nZXRSYXdLZXlib2FyZE1hcHBpbmcoKVxuXHRcdH07XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGluZm8sIG51bGwsICdcXHQnKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBlbmFibGVLZXliaW5kaW5nSG9sZE1vZGUoY29tbWFuZElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fY3VycmVudGx5RGlzcGF0Y2hpbmdDb21tYW5kSWQgIT09IGNvbW1hbmRJZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fa2V5YmluZGluZ0hvbGRNb2RlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGZvY3VzVHJhY2tlciA9IGRvbS50cmFja0ZvY3VzKGRvbS5nZXRXaW5kb3codW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBmb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHRoaXMuX3Jlc2V0S2V5YmluZGluZ0hvbGRNb2RlKCkpO1xuXHRcdHRoaXMuX2tleWJpbmRpbmdIb2xkTW9kZS5wLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0Zm9jdXNUcmFja2VyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0XHR0aGlzLl9sb2coYCsgRW5hYmxlZCBob2xkLW1vZGUgZm9yICR7Y29tbWFuZElkfS5gKTtcblx0XHRyZXR1cm4gdGhpcy5fa2V5YmluZGluZ0hvbGRNb2RlLnA7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNldEtleWJpbmRpbmdIb2xkTW9kZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fa2V5YmluZGluZ0hvbGRNb2RlKSB7XG5cdFx0XHR0aGlzLl9rZXliaW5kaW5nSG9sZE1vZGU/LmNvbXBsZXRlKCk7XG5cdFx0XHR0aGlzLl9rZXliaW5kaW5nSG9sZE1vZGUgPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBjdXN0b21LZXliaW5kaW5nc0NvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudXNlcktleWJpbmRpbmdzLmtleWJpbmRpbmdzLmxlbmd0aDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUmVzb2x2ZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FjaGVkUmVzb2x2ZXIgPSBudWxsO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlS2V5YmluZGluZ3MuZmlyZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRSZXNvbHZlcigpOiBLZXliaW5kaW5nUmVzb2x2ZXIge1xuXHRcdGlmICghdGhpcy5fY2FjaGVkUmVzb2x2ZXIpIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRzID0gdGhpcy5fcmVzb2x2ZUtleWJpbmRpbmdJdGVtcyhLZXliaW5kaW5nc1JlZ2lzdHJ5LmdldERlZmF1bHRLZXliaW5kaW5ncygpLCB0cnVlKTtcblx0XHRcdGNvbnN0IG92ZXJyaWRlcyA9IHRoaXMuX3Jlc29sdmVVc2VyS2V5YmluZGluZ0l0ZW1zKHRoaXMudXNlcktleWJpbmRpbmdzLmtleWJpbmRpbmdzLCBmYWxzZSk7XG5cdFx0XHR0aGlzLl9jYWNoZWRSZXNvbHZlciA9IG5ldyBLZXliaW5kaW5nUmVzb2x2ZXIoZGVmYXVsdHMsIG92ZXJyaWRlcywgKHN0cikgPT4gdGhpcy5fbG9nKHN0cikpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY2FjaGVkUmVzb2x2ZXI7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2RvY3VtZW50SGFzRm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0Ly8gaXQgaXMgcG9zc2libGUgdGhhdCB0aGUgZG9jdW1lbnQgaGFzIGxvc3QgZm9jdXMsIGJ1dCB0aGVcblx0XHQvLyB3aW5kb3cgaXMgc3RpbGwgZm9jdXNlZCwgZS5nLiB3aGVuIGEgPHdlYnZpZXc+IGVsZW1lbnRcblx0XHQvLyBoYXMgZm9jdXNcblx0XHRyZXR1cm4gdGhpcy5ob3N0U2VydmljZS5oYXNGb2N1cztcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVLZXliaW5kaW5nSXRlbXMoaXRlbXM6IElLZXliaW5kaW5nSXRlbVtdLCBpc0RlZmF1bHQ6IGJvb2xlYW4pOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdID0gW107XG5cdFx0bGV0IHJlc3VsdExlbiA9IDA7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRjb25zdCB3aGVuID0gaXRlbS53aGVuIHx8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSBpdGVtLmtleWJpbmRpbmc7XG5cdFx0XHRpZiAoIWtleWJpbmRpbmcpIHtcblx0XHRcdFx0Ly8gVGhpcyBtaWdodCBiZSBhIHJlbW92YWwga2V5YmluZGluZyBpdGVtIGluIHVzZXIgc2V0dGluZ3MgPT4gYWNjZXB0IGl0XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbSh1bmRlZmluZWQsIGl0ZW0uY29tbWFuZCwgaXRlbS5jb21tYW5kQXJncywgd2hlbiwgaXNEZWZhdWx0LCBpdGVtLmV4dGVuc2lvbklkLCBpdGVtLmlzQnVpbHRpbkV4dGVuc2lvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGhpcy5fYXNzZXJ0QnJvd3NlckNvbmZsaWN0cyhrZXliaW5kaW5nKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRLZXliaW5kaW5ncyA9IHRoaXMuX2tleWJvYXJkTWFwcGVyLnJlc29sdmVLZXliaW5kaW5nKGtleWJpbmRpbmcpO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gcmVzb2x2ZWRLZXliaW5kaW5ncy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkS2V5YmluZGluZyA9IHJlc29sdmVkS2V5YmluZGluZ3NbaV07XG5cdFx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtKHJlc29sdmVkS2V5YmluZGluZywgaXRlbS5jb21tYW5kLCBpdGVtLmNvbW1hbmRBcmdzLCB3aGVuLCBpc0RlZmF1bHQsIGl0ZW0uZXh0ZW5zaW9uSWQsIGl0ZW0uaXNCdWlsdGluRXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlVXNlcktleWJpbmRpbmdJdGVtcyhpdGVtczogSVVzZXJLZXliaW5kaW5nSXRlbVtdLCBpc0RlZmF1bHQ6IGJvb2xlYW4pOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdID0gW107XG5cdFx0bGV0IHJlc3VsdExlbiA9IDA7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRjb25zdCB3aGVuID0gaXRlbS53aGVuIHx8IHVuZGVmaW5lZDtcblx0XHRcdGlmICghaXRlbS5rZXliaW5kaW5nKSB7XG5cdFx0XHRcdC8vIFRoaXMgbWlnaHQgYmUgYSByZW1vdmFsIGtleWJpbmRpbmcgaXRlbSBpbiB1c2VyIHNldHRpbmdzID0+IGFjY2VwdCBpdFxuXHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0odW5kZWZpbmVkLCBpdGVtLmNvbW1hbmQsIGl0ZW0uY29tbWFuZEFyZ3MsIHdoZW4sIGlzRGVmYXVsdCwgbnVsbCwgZmFsc2UsIGl0ZW0uc3lzdGVtV2lkZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZEtleWJpbmRpbmdzID0gdGhpcy5fa2V5Ym9hcmRNYXBwZXIucmVzb2x2ZUtleWJpbmRpbmcoaXRlbS5rZXliaW5kaW5nKTtcblx0XHRcdFx0Zm9yIChjb25zdCByZXNvbHZlZEtleWJpbmRpbmcgb2YgcmVzb2x2ZWRLZXliaW5kaW5ncykge1xuXHRcdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbShyZXNvbHZlZEtleWJpbmRpbmcsIGl0ZW0uY29tbWFuZCwgaXRlbS5jb21tYW5kQXJncywgd2hlbiwgaXNEZWZhdWx0LCBudWxsLCBmYWxzZSwgaXRlbS5zeXN0ZW1XaWRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9hc3NlcnRCcm93c2VyQ29uZmxpY3RzKGtleWJpbmRpbmc6IEtleWJpbmRpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoQnJvd3NlckZlYXR1cmVzLmtleWJvYXJkID09PSBLZXlib2FyZFN1cHBvcnQuQWx3YXlzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKEJyb3dzZXJGZWF0dXJlcy5rZXlib2FyZCA9PT0gS2V5Ym9hcmRTdXBwb3J0LkZ1bGxTY3JlZW4gJiYgYnJvd3Nlci5pc0Z1bGxzY3JlZW4obWFpbldpbmRvdykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGNob3JkIG9mIGtleWJpbmRpbmcuY2hvcmRzKSB7XG5cdFx0XHRpZiAoIWNob3JkLm1ldGFLZXkgJiYgIWNob3JkLmFsdEtleSAmJiAhY2hvcmQuY3RybEtleSAmJiAhY2hvcmQuc2hpZnRLZXkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vZGlmaWVyc01hc2sgPSBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlNb2QuU2hpZnQ7XG5cblx0XHRcdGxldCBwYXJ0TW9kaWZpZXJzTWFzayA9IDA7XG5cdFx0XHRpZiAoY2hvcmQubWV0YUtleSkge1xuXHRcdFx0XHRwYXJ0TW9kaWZpZXJzTWFzayB8PSBLZXlNb2QuQ3RybENtZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNob3JkLnNoaWZ0S2V5KSB7XG5cdFx0XHRcdHBhcnRNb2RpZmllcnNNYXNrIHw9IEtleU1vZC5TaGlmdDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNob3JkLmFsdEtleSkge1xuXHRcdFx0XHRwYXJ0TW9kaWZpZXJzTWFzayB8PSBLZXlNb2QuQWx0O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hvcmQuY3RybEtleSAmJiBPUyA9PT0gT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCkge1xuXHRcdFx0XHRwYXJ0TW9kaWZpZXJzTWFzayB8PSBLZXlNb2QuV2luQ3RybDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKChwYXJ0TW9kaWZpZXJzTWFzayAmIG1vZGlmaWVyc01hc2spID09PSAoS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0KSkge1xuXHRcdFx0XHRpZiAoY2hvcmQgaW5zdGFuY2VvZiBTY2FuQ29kZUNob3JkICYmIChjaG9yZC5zY2FuQ29kZSA9PT0gU2NhbkNvZGUuQXJyb3dMZWZ0IHx8IGNob3JkLnNjYW5Db2RlID09PSBTY2FuQ29kZS5BcnJvd1JpZ2h0KSkge1xuXHRcdFx0XHRcdC8vIGNvbnNvbGUud2FybignQ3RybC9DbWQrQXJyb3cga2V5YmluZGluZ3Mgc2hvdWxkIG5vdCBiZSB1c2VkIGJ5IGRlZmF1bHQgaW4gd2ViLiBPZmZlbmRlcjogJywga2IuZ2V0SGFzaENvZGUoKSwgJyBmb3IgJywgY29tbWFuZElkKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY2hvcmQgaW5zdGFuY2VvZiBLZXlDb2RlQ2hvcmQgJiYgKGNob3JkLmtleUNvZGUgPT09IEtleUNvZGUuTGVmdEFycm93IHx8IGNob3JkLmtleUNvZGUgPT09IEtleUNvZGUuUmlnaHRBcnJvdykpIHtcblx0XHRcdFx0XHQvLyBjb25zb2xlLndhcm4oJ0N0cmwvQ21kK0Fycm93IGtleWJpbmRpbmdzIHNob3VsZCBub3QgYmUgdXNlZCBieSBkZWZhdWx0IGluIHdlYi4gT2ZmZW5kZXI6ICcsIGtiLmdldEhhc2hDb2RlKCksICcgZm9yICcsIGNvbW1hbmRJZCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKChwYXJ0TW9kaWZpZXJzTWFzayAmIG1vZGlmaWVyc01hc2spID09PSBLZXlNb2QuQ3RybENtZCkge1xuXHRcdFx0XHRpZiAoY2hvcmQgaW5zdGFuY2VvZiBTY2FuQ29kZUNob3JkICYmIChjaG9yZC5zY2FuQ29kZSA+PSBTY2FuQ29kZS5EaWdpdDEgJiYgY2hvcmQuc2NhbkNvZGUgPD0gU2NhbkNvZGUuRGlnaXQwKSkge1xuXHRcdFx0XHRcdC8vIGNvbnNvbGUud2FybignQ3RybC9DbWQrTnVtIGtleWJpbmRpbmdzIHNob3VsZCBub3QgYmUgdXNlZCBieSBkZWZhdWx0IGluIHdlYi4gT2ZmZW5kZXI6ICcsIGtiLmdldEhhc2hDb2RlKCksICcgZm9yICcsIGNvbW1hbmRJZCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNob3JkIGluc3RhbmNlb2YgS2V5Q29kZUNob3JkICYmIChjaG9yZC5rZXlDb2RlID49IEtleUNvZGUuRGlnaXQwICYmIGNob3JkLmtleUNvZGUgPD0gS2V5Q29kZS5EaWdpdDkpKSB7XG5cdFx0XHRcdFx0Ly8gY29uc29sZS53YXJuKCdDdHJsL0NtZCtOdW0ga2V5YmluZGluZ3Mgc2hvdWxkIG5vdCBiZSB1c2VkIGJ5IGRlZmF1bHQgaW4gd2ViLiBPZmZlbmRlcjogJywga2IuZ2V0SGFzaENvZGUoKSwgJyBmb3IgJywgY29tbWFuZElkKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyByZXNvbHZlS2V5YmluZGluZyhrYjogS2V5YmluZGluZyk6IFJlc29sdmVkS2V5YmluZGluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fa2V5Ym9hcmRNYXBwZXIucmVzb2x2ZUtleWJpbmRpbmcoa2IpO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVLZXlib2FyZEV2ZW50KGtleWJvYXJkRXZlbnQ6IElLZXlib2FyZEV2ZW50KTogUmVzb2x2ZWRLZXliaW5kaW5nIHtcblx0XHR0aGlzLmtleWJvYXJkTGF5b3V0U2VydmljZS52YWxpZGF0ZUN1cnJlbnRLZXlib2FyZE1hcHBpbmcoa2V5Ym9hcmRFdmVudCk7XG5cdFx0cmV0dXJuIHRoaXMuX2tleWJvYXJkTWFwcGVyLnJlc29sdmVLZXlib2FyZEV2ZW50KGtleWJvYXJkRXZlbnQpO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVVc2VyQmluZGluZyh1c2VyQmluZGluZzogc3RyaW5nKTogUmVzb2x2ZWRLZXliaW5kaW5nW10ge1xuXHRcdGNvbnN0IGtleWJpbmRpbmcgPSBLZXliaW5kaW5nUGFyc2VyLnBhcnNlS2V5YmluZGluZyh1c2VyQmluZGluZyk7XG5cdFx0cmV0dXJuIChrZXliaW5kaW5nID8gdGhpcy5fa2V5Ym9hcmRNYXBwZXIucmVzb2x2ZUtleWJpbmRpbmcoa2V5YmluZGluZykgOiBbXSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVLZXliaW5kaW5nc0V4dGVuc2lvblBvaW50VXNlcihleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgaXNCdWlsdGluOiBib29sZWFuLCBrZXliaW5kaW5nczogQ29udHJpYnV0ZWRLZXlCaW5kaW5nIHwgQ29udHJpYnV0ZWRLZXlCaW5kaW5nW10sIGNvbGxlY3RvcjogRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3RvciwgcmVzdWx0OiBJRXh0ZW5zaW9uS2V5YmluZGluZ1J1bGVbXSk6IHZvaWQge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGtleWJpbmRpbmdzKSkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGtleWJpbmRpbmdzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZUtleWJpbmRpbmcoZXh0ZW5zaW9uSWQsIGlzQnVpbHRpbiwgaSArIDEsIGtleWJpbmRpbmdzW2ldLCBjb2xsZWN0b3IsIHJlc3VsdCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2hhbmRsZUtleWJpbmRpbmcoZXh0ZW5zaW9uSWQsIGlzQnVpbHRpbiwgMSwga2V5YmluZGluZ3MsIGNvbGxlY3RvciwgcmVzdWx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVLZXliaW5kaW5nKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBpc0J1aWx0aW46IGJvb2xlYW4sIGlkeDogbnVtYmVyLCBrZXliaW5kaW5nczogQ29udHJpYnV0ZWRLZXlCaW5kaW5nLCBjb2xsZWN0b3I6IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IsIHJlc3VsdDogSUV4dGVuc2lvbktleWJpbmRpbmdSdWxlW10pOiB2b2lkIHtcblxuXHRcdGNvbnN0IHJlamVjdHM6IHN0cmluZ1tdID0gW107XG5cblx0XHRpZiAoaXNWYWxpZENvbnRyaWJ1dGVkS2V5QmluZGluZyhrZXliaW5kaW5ncywgcmVqZWN0cykpIHtcblx0XHRcdGNvbnN0IHJ1bGUgPSB0aGlzLl9hc0NvbW1hbmRSdWxlKGV4dGVuc2lvbklkLCBpc0J1aWx0aW4sIGlkeCsrLCBrZXliaW5kaW5ncyk7XG5cdFx0XHRpZiAocnVsZSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChydWxlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocmVqZWN0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKFxuXHRcdFx0XHQnaW52YWxpZC5rZXliaW5kaW5ncycsXG5cdFx0XHRcdFwiSW52YWxpZCBgY29udHJpYnV0ZXMuezB9YDogezF9XCIsXG5cdFx0XHRcdGtleWJpbmRpbmdzRXh0UG9pbnQubmFtZSxcblx0XHRcdFx0cmVqZWN0cy5qb2luKCdcXG4nKVxuXHRcdFx0KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgYmluZFRvQ3VycmVudFBsYXRmb3JtKGtleTogc3RyaW5nIHwgdW5kZWZpbmVkLCBtYWM6IHN0cmluZyB8IHVuZGVmaW5lZCwgbGludXg6IHN0cmluZyB8IHVuZGVmaW5lZCwgd2luOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChPUyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgJiYgd2luKSB7XG5cdFx0XHRpZiAod2luKSB7XG5cdFx0XHRcdHJldHVybiB3aW47XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChPUyA9PT0gT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCkge1xuXHRcdFx0aWYgKG1hYykge1xuXHRcdFx0XHRyZXR1cm4gbWFjO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAobGludXgpIHtcblx0XHRcdFx0cmV0dXJuIGxpbnV4O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ga2V5O1xuXHR9XG5cblx0cHJpdmF0ZSBfYXNDb21tYW5kUnVsZShleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgaXNCdWlsdGluOiBib29sZWFuLCBpZHg6IG51bWJlciwgYmluZGluZzogQ29udHJpYnV0ZWRLZXlCaW5kaW5nKTogSUV4dGVuc2lvbktleWJpbmRpbmdSdWxlIHwgdW5kZWZpbmVkIHtcblxuXHRcdGNvbnN0IHsgY29tbWFuZCwgYXJncywgd2hlbiwga2V5LCBtYWMsIGxpbnV4LCB3aW4gfSA9IGJpbmRpbmc7XG5cdFx0Y29uc3Qga2V5YmluZGluZyA9IFdvcmtiZW5jaEtleWJpbmRpbmdTZXJ2aWNlLmJpbmRUb0N1cnJlbnRQbGF0Zm9ybShrZXksIG1hYywgbGludXgsIHdpbik7XG5cdFx0aWYgKCFrZXliaW5kaW5nKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCB3ZWlnaHQ6IG51bWJlcjtcblx0XHRpZiAoaXNCdWlsdGluKSB7XG5cdFx0XHR3ZWlnaHQgPSBLZXliaW5kaW5nV2VpZ2h0LkJ1aWx0aW5FeHRlbnNpb24gKyBpZHg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHdlaWdodCA9IEtleWJpbmRpbmdXZWlnaHQuRXh0ZXJuYWxFeHRlbnNpb24gKyBpZHg7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWFuZEFjdGlvbiA9IE1lbnVSZWdpc3RyeS5nZXRDb21tYW5kKGNvbW1hbmQpO1xuXHRcdGNvbnN0IHByZWNvbmRpdGlvbiA9IGNvbW1hbmRBY3Rpb24gJiYgY29tbWFuZEFjdGlvbi5wcmVjb25kaXRpb247XG5cdFx0bGV0IGZ1bGxXaGVuOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAod2hlbiAmJiBwcmVjb25kaXRpb24pIHtcblx0XHRcdGZ1bGxXaGVuID0gQ29udGV4dEtleUV4cHIuYW5kKHByZWNvbmRpdGlvbiwgQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUod2hlbikpO1xuXHRcdH0gZWxzZSBpZiAod2hlbikge1xuXHRcdFx0ZnVsbFdoZW4gPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZSh3aGVuKTtcblx0XHR9IGVsc2UgaWYgKHByZWNvbmRpdGlvbikge1xuXHRcdFx0ZnVsbFdoZW4gPSBwcmVjb25kaXRpb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVzYzogSUV4dGVuc2lvbktleWJpbmRpbmdSdWxlID0ge1xuXHRcdFx0aWQ6IGNvbW1hbmQsXG5cdFx0XHRhcmdzLFxuXHRcdFx0d2hlbjogZnVsbFdoZW4sXG5cdFx0XHR3ZWlnaHQ6IHdlaWdodCxcblx0XHRcdGtleWJpbmRpbmc6IEtleWJpbmRpbmdQYXJzZXIucGFyc2VLZXliaW5kaW5nKGtleWJpbmRpbmcpLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbklkLnZhbHVlLFxuXHRcdFx0aXNCdWlsdGluRXh0ZW5zaW9uOiBpc0J1aWx0aW5cblx0XHR9O1xuXHRcdHJldHVybiBkZXNjO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldERlZmF1bHRLZXliaW5kaW5nc0NvbnRlbnQoKTogc3RyaW5nIHtcblx0XHRjb25zdCByZXNvbHZlciA9IHRoaXMuX2dldFJlc29sdmVyKCk7XG5cdFx0Y29uc3QgZGVmYXVsdEtleWJpbmRpbmdzID0gcmVzb2x2ZXIuZ2V0RGVmYXVsdEtleWJpbmRpbmdzKCk7XG5cdFx0Y29uc3QgYm91bmRDb21tYW5kcyA9IHJlc29sdmVyLmdldERlZmF1bHRCb3VuZENvbW1hbmRzKCk7XG5cdFx0cmV0dXJuIChcblx0XHRcdFdvcmtiZW5jaEtleWJpbmRpbmdTZXJ2aWNlLl9nZXREZWZhdWx0S2V5YmluZGluZ3MoZGVmYXVsdEtleWJpbmRpbmdzKVxuXHRcdFx0KyAnXFxuXFxuJ1xuXHRcdFx0KyBXb3JrYmVuY2hLZXliaW5kaW5nU2VydmljZS5fZ2V0QWxsQ29tbWFuZHNBc0NvbW1lbnQoYm91bmRDb21tYW5kcylcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2dldERlZmF1bHRLZXliaW5kaW5ncyhkZWZhdWx0S2V5YmluZGluZ3M6IHJlYWRvbmx5IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgb3V0ID0gbmV3IE91dHB1dEJ1aWxkZXIoKTtcblx0XHRvdXQud3JpdGVMaW5lKCdbJyk7XG5cblx0XHRjb25zdCBsYXN0SW5kZXggPSBkZWZhdWx0S2V5YmluZGluZ3MubGVuZ3RoIC0gMTtcblx0XHRkZWZhdWx0S2V5YmluZGluZ3MuZm9yRWFjaCgoaywgaW5kZXgpID0+IHtcblx0XHRcdEtleWJpbmRpbmdJTy53cml0ZUtleWJpbmRpbmdJdGVtKG91dCwgayk7XG5cdFx0XHRpZiAoaW5kZXggIT09IGxhc3RJbmRleCkge1xuXHRcdFx0XHRvdXQud3JpdGVMaW5lKCcsJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvdXQud3JpdGVMaW5lKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0b3V0LndyaXRlTGluZSgnXScpO1xuXHRcdHJldHVybiBvdXQudG9TdHJpbmcoKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9nZXRBbGxDb21tYW5kc0FzQ29tbWVudChib3VuZENvbW1hbmRzOiBNYXA8c3RyaW5nLCBib29sZWFuPik6IHN0cmluZyB7XG5cdFx0Y29uc3QgdW5ib3VuZENvbW1hbmRzID0gZ2V0QWxsVW5ib3VuZENvbW1hbmRzKGJvdW5kQ29tbWFuZHMpO1xuXHRcdGNvbnN0IHByZXR0eSA9IHVuYm91bmRDb21tYW5kcy5zb3J0KCkuam9pbignXFxuLy8gLSAnKTtcblx0XHRyZXR1cm4gJy8vICcgKyBubHMubG9jYWxpemUoJ3VuYm91bmRDb21tYW5kcycsIFwiSGVyZSBhcmUgb3RoZXIgYXZhaWxhYmxlIGNvbW1hbmRzOiBcIikgKyAnXFxuLy8gLSAnICsgcHJldHR5O1xuXHR9XG5cblx0b3ZlcnJpZGUgbWlnaHRQcm9kdWNlUHJpbnRhYmxlQ2hhcmFjdGVyKGV2ZW50OiBJS2V5Ym9hcmRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChldmVudC5jdHJsS2V5IHx8IGV2ZW50Lm1ldGFLZXkgfHwgZXZlbnQuYWx0S2V5KSB7XG5cdFx0XHQvLyBpZ25vcmUgY3RybC9jbWQvYWx0LWNvbWJpbmF0aW9uIGJ1dCBub3Qgc2hpZnQtY29tYmluYXRpb3Ncblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgY29kZSA9IFNjYW5Db2RlVXRpbHMudG9FbnVtKGV2ZW50LmNvZGUpO1xuXG5cdFx0aWYgKE5VTVBBRF9QUklOVEFCTEVfU0NBTkNPREVTLmluZGV4T2YoY29kZSkgIT09IC0xKSB7XG5cdFx0XHQvLyBUaGlzIGlzIGEgbnVtcGFkIGtleSB0aGF0IG1pZ2h0IHByb2R1Y2UgYSBwcmludGFibGUgY2hhcmFjdGVyIGJhc2VkIG9uIE51bUxvY2suXG5cdFx0XHQvLyBMZXQncyBjaGVjayBpZiBOdW1Mb2NrIGlzIG9uIG9yIG9mZiBiYXNlZCBvbiB0aGUgZXZlbnQncyBrZXlDb2RlLlxuXHRcdFx0Ly8gZS5nLlxuXHRcdFx0Ly8gLSB3aGVuIE51bUxvY2sgaXMgb2ZmLCBTY2FuQ29kZS5OdW1wYWQ0IHByb2R1Y2VzIEtleUNvZGUuTGVmdEFycm93XG5cdFx0XHQvLyAtIHdoZW4gTnVtTG9jayBpcyBvbiwgU2NhbkNvZGUuTnVtcGFkNCBwcm9kdWNlcyBLZXlDb2RlLk5VTVBBRF80XG5cdFx0XHQvLyBIb3dldmVyLCBTY2FuQ29kZS5OdW1wYWRBZGQgYWx3YXlzIHByb2R1Y2VzIEtleUNvZGUuTlVNUEFEX0FERFxuXHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IElNTVVUQUJMRV9DT0RFX1RPX0tFWV9DT0RFW2NvZGVdKSB7XG5cdFx0XHRcdC8vIE51bUxvY2sgaXMgb24gb3IgdGhpcyBpcyAvLCAqLCAtLCArIG9uIHRoZSBudW1wYWRcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNNYWNpbnRvc2ggJiYgZXZlbnQua2V5Q29kZSA9PT0gb3RoZXJNYWNOdW1wYWRNYXBwaW5nLmdldChjb2RlKSkge1xuXHRcdFx0XHQvLyBvbiBtYWNPUywgdGhlIG51bXBhZCBrZXlzIGNhbiBhbHNvIG1hcCB0byBrZXlzIDEgLSAwLlxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBrZXljb2RlID0gSU1NVVRBQkxFX0NPREVfVE9fS0VZX0NPREVbY29kZV07XG5cdFx0aWYgKGtleWNvZGUgIT09IC0xKSB7XG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNzQ5MzRcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gY29uc3VsdCB0aGUgS2V5Ym9hcmRNYXBwZXJGYWN0b3J5IHRvIGNoZWNrIHRoZSBnaXZlbiBldmVudCBmb3Jcblx0XHQvLyBhIHByaW50YWJsZSB2YWx1ZS5cblx0XHRjb25zdCBtYXBwaW5nID0gdGhpcy5rZXlib2FyZExheW91dFNlcnZpY2UuZ2V0UmF3S2V5Ym9hcmRNYXBwaW5nKCk7XG5cdFx0aWYgKCFtYXBwaW5nKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGtleUluZm8gPSBtYXBwaW5nW2V2ZW50LmNvZGVdO1xuXHRcdGlmICgha2V5SW5mbykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIWtleUluZm8udmFsdWUgfHwgL1xccy8udGVzdChrZXlJbmZvLnZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5jbGFzcyBVc2VyS2V5YmluZGluZ3MgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9yYXdLZXliaW5kaW5nczogT2JqZWN0W10gPSBbXTtcblx0cHJpdmF0ZSBfa2V5YmluZGluZ3M6IElVc2VyS2V5YmluZGluZ0l0ZW1bXSA9IFtdO1xuXHRnZXQga2V5YmluZGluZ3MoKTogSVVzZXJLZXliaW5kaW5nSXRlbVtdIHsgcmV0dXJuIHRoaXMuX2tleWJpbmRpbmdzOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSByZWxvYWRDb25maWd1cmF0aW9uU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd2F0Y2hEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2U6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLndhdGNoKCk7XG5cblx0XHR0aGlzLnJlbG9hZENvbmZpZ3VyYXRpb25TY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLnJlbG9hZCgpLnRoZW4oY2hhbmdlZCA9PiB7XG5cdFx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSksIDUwKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlLCBlID0+IGUuY29udGFpbnModGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmtleWJpbmRpbmdzUmVzb3VyY2UpKSgoKSA9PiB7XG5cdFx0XHRsb2dTZXJ2aWNlLmRlYnVnKCdLZXliaW5kaW5ncyBmaWxlIGNoYW5nZWQnKTtcblx0XHRcdHRoaXMucmVsb2FkQ29uZmlndXJhdGlvblNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLm9wZXJhdGlvbiA9PT0gRmlsZU9wZXJhdGlvbi5XUklURSAmJiBlLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5rZXliaW5kaW5nc1Jlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0bG9nU2VydmljZS5kZWJ1ZygnS2V5YmluZGluZ3MgZmlsZSB3cml0dGVuJyk7XG5cdFx0XHRcdHRoaXMucmVsb2FkQ29uZmlndXJhdGlvblNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhUHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VDdXJyZW50UHJvZmlsZShlID0+IHtcblx0XHRcdGlmICghdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZS5wcmV2aW91cy5rZXliaW5kaW5nc1Jlc291cmNlLCBlLnByb2ZpbGUua2V5YmluZGluZ3NSZXNvdXJjZSkpIHtcblx0XHRcdFx0ZS5qb2luKHRoaXMud2hlbkN1cnJlbnRQcm9maWxlQ2hhbmdlZCgpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdoZW5DdXJyZW50UHJvZmlsZUNoYW5nZWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy53YXRjaCgpO1xuXHRcdHRoaXMucmVsb2FkQ29uZmlndXJhdGlvblNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB3YXRjaCgpOiB2b2lkIHtcblx0XHR0aGlzLndhdGNoRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLndhdGNoRGlzcG9zYWJsZXMuYWRkKHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2goZGlybmFtZSh0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUua2V5YmluZGluZ3NSZXNvdXJjZSkpKTtcblx0XHQvLyBBbHNvIGxpc3RlbiB0byB0aGUgcmVzb3VyY2UgaW5jYXNlIHRoZSByZXNvdXJjZSBpcyBhIHN5bWxpbmsgLSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4MTM0XG5cdFx0dGhpcy53YXRjaERpc3Bvc2FibGVzLmFkZCh0aGlzLmZpbGVTZXJ2aWNlLndhdGNoKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5rZXliaW5kaW5nc1Jlc291cmNlKSk7XG5cdH1cblxuXHRhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMucmVsb2FkKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbG9hZCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBuZXdLZXliaW5kaW5ncyA9IGF3YWl0IHRoaXMucmVhZFVzZXJLZXliaW5kaW5ncygpO1xuXHRcdGlmIChvYmplY3RzLmVxdWFscyh0aGlzLl9yYXdLZXliaW5kaW5ncywgbmV3S2V5YmluZGluZ3MpKSB7XG5cdFx0XHQvLyBubyBjaGFuZ2Vcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9yYXdLZXliaW5kaW5ncyA9IG5ld0tleWJpbmRpbmdzO1xuXHRcdHRoaXMuX2tleWJpbmRpbmdzID0gdGhpcy5fcmF3S2V5YmluZGluZ3MubWFwKChrKSA9PiBLZXliaW5kaW5nSU8ucmVhZFVzZXJLZXliaW5kaW5nSXRlbShrKSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlYWRVc2VyS2V5YmluZGluZ3MoKTogUHJvbWlzZTxPYmplY3RbXT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUua2V5YmluZGluZ3NSZXNvdXJjZSk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0XHRyZXR1cm4gQXJyYXkuaXNBcnJheSh2YWx1ZSlcblx0XHRcdFx0PyB2YWx1ZS5maWx0ZXIodiA9PiB2ICYmIHR5cGVvZiB2ID09PSAnb2JqZWN0JyAvKiBqdXN0IHR5cGVvZiA9PT0gb2JqZWN0IGRvZXNuJ3QgY2F0Y2ggYG51bGxgICovKVxuXHRcdFx0XHQ6IFtdO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBSZWdpc3RlcnMgdGhlIGBrZXliaW5kaW5ncy5qc29uYCdzIHNjaGVtYSB3aXRoIHRoZSBKU09OIHNjaGVtYSByZWdpc3RyeS4gQWxsb3dzIHVwZGF0aW5nIHRoZSBzY2hlbWEsIGUuZy4sIHdoZW4gbmV3IGNvbW1hbmRzIGFyZSByZWdpc3RlcmVkIChlLmcuLCBieSBleHRlbnNpb25zKS5cbiAqXG4gKiBMaWZlY3ljbGUgb3duZWQgYnkgYFdvcmtiZW5jaEtleWJpbmRpbmdTZXJ2aWNlYC4gTXVzdCBiZSBpbnN0YW50aWF0ZWQgb25seSBvbmNlLlxuICovXG5jbGFzcyBLZXliaW5kaW5nc0pzb25TY2hlbWEge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IHNjaGVtYUlkID0gJ3ZzY29kZTovL3NjaGVtYXMva2V5YmluZGluZ3MnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZHNTY2hlbWFzOiBJSlNPTlNjaGVtYVtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZHNFbnVtOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlbW92YWxDb21tYW5kc0VudW06IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZHNFbnVtRGVzY3JpcHRpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdFx0aWQ6IEtleWJpbmRpbmdzSnNvblNjaGVtYS5zY2hlbWFJZCxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2tleWJpbmRpbmdzLmpzb24udGl0bGUnLCBcIktleWJpbmRpbmdzIGNvbmZpZ3VyYXRpb25cIiksXG5cdFx0YWxsb3dUcmFpbGluZ0NvbW1hczogdHJ1ZSxcblx0XHRhbGxvd0NvbW1lbnRzOiB0cnVlLFxuXHRcdGRlZmluaXRpb25zOiB7XG5cdFx0XHQnZWRpdG9yR3JvdXBzU2NoZW1hJzoge1xuXHRcdFx0XHQndHlwZSc6ICdhcnJheScsXG5cdFx0XHRcdCdpdGVtcyc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHRcdFx0J2dyb3Vwcyc6IHtcblx0XHRcdFx0XHRcdFx0JyRyZWYnOiAnIy9kZWZpbml0aW9ucy9lZGl0b3JHcm91cHNTY2hlbWEnLFxuXHRcdFx0XHRcdFx0XHQnZGVmYXVsdCc6IFt7fSwge31dXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0J3NpemUnOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ251bWJlcicsXG5cdFx0XHRcdFx0XHRcdCdkZWZhdWx0JzogMC41XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J2NvbW1hbmROYW1lcyc6IHtcblx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0J2VudW0nOiB0aGlzLmNvbW1hbmRzRW51bSxcblx0XHRcdFx0J2VudW1EZXNjcmlwdGlvbnMnOiB0aGlzLmNvbW1hbmRzRW51bURlc2NyaXB0aW9ucyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdrZXliaW5kaW5ncy5qc29uLmNvbW1hbmQnLCBcIk5hbWUgb2YgdGhlIGNvbW1hbmQgdG8gZXhlY3V0ZVwiKSxcblx0XHRcdH0sXG5cdFx0XHQnY29tbWFuZFR5cGUnOiB7XG5cdFx0XHRcdCdhbnlPZic6IFsgLy8gcmVwZXRpdGlvbiBvZiB0aGlzIGNsYXVzZSBoZXJlIGFuZCBiZWxvdyBpcyBpbnRlbnRpb25hbDogb25lIGlzIGZvciBuaWNlIGRpYWdub3N0aWNzICYgb25lIGlzIGZvciBjb2RlIGNvbXBsZXRpb25cblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9jb21tYW5kTmFtZXMnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0J2VudW0nOiB0aGlzLnJlbW92YWxDb21tYW5kc0VudW0sXG5cdFx0XHRcdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IHRoaXMuY29tbWFuZHNFbnVtRGVzY3JpcHRpb25zLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdrZXliaW5kaW5ncy5qc29uLnJlbW92YWxDb21tYW5kJywgXCJOYW1lIG9mIHRoZSBjb21tYW5kIHRvIHJlbW92ZSBrZXlib2FyZCBzaG9ydGN1dCBmb3JcIiksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdCdjb21tYW5kc1NjaGVtYXMnOiB7XG5cdFx0XHRcdCdhbGxPZic6IHRoaXMuY29tbWFuZHNTY2hlbWFzXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRpdGVtczoge1xuXHRcdFx0J3JlcXVpcmVkJzogWydrZXknXSxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQnZGVmYXVsdFNuaXBwZXRzJzogW3sgJ2JvZHknOiB7ICdrZXknOiAnJDEnLCAnY29tbWFuZCc6ICckMicsICd3aGVuJzogJyQzJyB9IH1dLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdrZXknOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2tleWJpbmRpbmdzLmpzb24ua2V5JywgXCJLZXkgb3Iga2V5IHNlcXVlbmNlIChzZXBhcmF0ZWQgYnkgc3BhY2UpXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnY29tbWFuZCc6IHtcblx0XHRcdFx0XHQnYW55T2YnOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdCdpZic6IHtcblx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdhcnJheSdcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0J3RoZW4nOiB7XG5cdFx0XHRcdFx0XHRcdFx0J25vdCc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogJ2FycmF5J1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0J2Vycm9yTWVzc2FnZSc6IG5scy5sb2NhbGl6ZSgna2V5YmluZGluZ3MuY29tbWFuZHNJc0FycmF5JywgXCJJbmNvcnJlY3QgdHlwZS4gRXhwZWN0ZWQgXFxcInswfVxcXCIuIFRoZSBmaWVsZCAnY29tbWFuZCcgZG9lcyBub3Qgc3VwcG9ydCBydW5uaW5nIG11bHRpcGxlIGNvbW1hbmRzLiBVc2UgY29tbWFuZCAncnVuQ29tbWFuZHMnIHRvIHBhc3MgaXQgbXVsdGlwbGUgY29tbWFuZHMgdG8gcnVuLlwiLCAnc3RyaW5nJylcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0J2Vsc2UnOiB7XG5cdFx0XHRcdFx0XHRcdFx0JyRyZWYnOiAnIy9kZWZpbml0aW9ucy9jb21tYW5kVHlwZSdcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0JyRyZWYnOiAnIy9kZWZpbml0aW9ucy9jb21tYW5kVHlwZSdcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCd3aGVuJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdrZXliaW5kaW5ncy5qc29uLndoZW4nLCBcIkNvbmRpdGlvbiB3aGVuIHRoZSBrZXkgaXMgYWN0aXZlLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYXJncyc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2tleWJpbmRpbmdzLmpzb24uYXJncycsIFwiQXJndW1lbnRzIHRvIHBhc3MgdG8gdGhlIGNvbW1hbmQgdG8gZXhlY3V0ZS5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J3N5c3RlbVdpZGUnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgna2V5YmluZGluZ3MuanNvbi5zeXN0ZW1XaWRlJywgXCJXaGVuIGB0cnVlYCwgcmVnaXN0ZXJzIHRoaXMga2V5YmluZGluZyBhcyBhIHN5c3RlbS13aWRlIChPUyBnbG9iYWwpIHNob3J0Y3V0IHRoYXQgZmlyZXMgZXZlbiB3aGVuIHRoZSBhcHBsaWNhdGlvbiBpcyBub3QgZm9jdXNlZC4gRGVza3RvcCBvbmx5LiBPbmx5IHNpbmdsZSBrZXkgY29tYmluYXRpb25zIGFyZSBzdXBwb3J0ZWQgKG5vIGNob3JkcyksIGFuZCBhbnkgYHdoZW5gIGNsYXVzZSBpcyBpZ25vcmVkIGZvciB0aGUgZ2xvYmFsIHRyaWdnZXIuXCIpXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnJHJlZic6ICcjL2RlZmluaXRpb25zL2NvbW1hbmRzU2NoZW1hcydcblx0XHR9XG5cdH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBzY2hlbWFSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5zY2hlbWFSZWdpc3RyeS5yZWdpc3RlclNjaGVtYShLZXliaW5kaW5nc0pzb25TY2hlbWEuc2NoZW1hSWQsIHRoaXMuc2NoZW1hKTtcblx0fVxuXG5cdC8vIFRPRE9AdWx1Z2Jla25hOiBjYW4gdXBkYXRlcyBoYXBwZW4gaW5jcmVtZW50YWxseSByYXRoZXIgdGhhbiByZWJ1aWxkaW5nOyBjb25jZXJuczpcblx0Ly8gLSBpcyBqdXN0IGFwcGVuZGluZyBhZGRpdGlvbmFsIHNjaGVtYXMgZW5vdWdoIGZvciB0aGUgcmVnaXN0cnkgdG8gcGljayB0aGVtIHVwP1xuXHQvLyAtIGNhbiBgQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kc2AgYW5kIGBNZW51UmVnaXN0cnkuZ2V0Q29tbWFuZHNgIHJldHVybiBkaWZmZXJlbnQgdmFsdWVzIGF0IGRpZmZlcmVudCB0aW1lcz8gaWUgd291bGQganVzdCBwdXNoaW5nIG5ldyBzY2hlbWFzIGZyb20gYGFkZGl0aW9uYWxDb250cmlidXRpb25zYCBub3QgYmUgZW5vdWdoP1xuXHR1cGRhdGVTY2hlbWEoYWRkaXRpb25hbENvbnRyaWJ1dGlvbnM6IHJlYWRvbmx5IElKU09OU2NoZW1hW10pIHtcblx0XHR0aGlzLmNvbW1hbmRzU2NoZW1hcy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuY29tbWFuZHNFbnVtLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5yZW1vdmFsQ29tbWFuZHNFbnVtLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5jb21tYW5kc0VudW1EZXNjcmlwdGlvbnMubGVuZ3RoID0gMDtcblxuXHRcdGNvbnN0IGtub3duQ29tbWFuZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBhZGRLbm93bkNvbW1hbmQgPSAoY29tbWFuZElkOiBzdHJpbmcsIGRlc2NyaXB0aW9uPzogc3RyaW5nIHwgSUxvY2FsaXplZFN0cmluZyB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0aWYgKCEvXl8vLnRlc3QoY29tbWFuZElkKSkge1xuXHRcdFx0XHRpZiAoIWtub3duQ29tbWFuZHMuaGFzKGNvbW1hbmRJZCkpIHtcblx0XHRcdFx0XHRrbm93bkNvbW1hbmRzLmFkZChjb21tYW5kSWQpO1xuXG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kc0VudW0ucHVzaChjb21tYW5kSWQpO1xuXHRcdFx0XHRcdHRoaXMuY29tbWFuZHNFbnVtRGVzY3JpcHRpb25zLnB1c2goXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbiA9PT0gdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdD8gJycgLy8gYGVudW1EZXNjcmlwdGlvbnNgIGlzIGFuIGFycmF5IG9mIHN0cmluZ3MsIHNvIHdlIGNhbid0IHVzZSB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0OiAoaXNMb2NhbGl6ZWRTdHJpbmcoZGVzY3JpcHRpb24pID8gZGVzY3JpcHRpb24udmFsdWUgOiBkZXNjcmlwdGlvbilcblx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0Ly8gQWxzbyBhZGQgdGhlIG5lZ2F0aXZlIGZvcm0gZm9yIGtleWJpbmRpbmcgcmVtb3ZhbFxuXHRcdFx0XHRcdHRoaXMucmVtb3ZhbENvbW1hbmRzRW51bS5wdXNoKGAtJHtjb21tYW5kSWR9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgYWxsQ29tbWFuZHMgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmRzKCk7XG5cdFx0Zm9yIChjb25zdCBbY29tbWFuZElkLCBjb21tYW5kXSBvZiBhbGxDb21tYW5kcykge1xuXHRcdFx0Y29uc3QgY29tbWFuZE1ldGFkYXRhID0gY29tbWFuZC5tZXRhZGF0YTtcblxuXHRcdFx0YWRkS25vd25Db21tYW5kKGNvbW1hbmRJZCwgY29tbWFuZE1ldGFkYXRhPy5kZXNjcmlwdGlvbiA/PyBNZW51UmVnaXN0cnkuZ2V0Q29tbWFuZChjb21tYW5kSWQpPy50aXRsZSk7XG5cblx0XHRcdGlmICghY29tbWFuZE1ldGFkYXRhIHx8ICFjb21tYW5kTWV0YWRhdGEuYXJncyB8fCBjb21tYW5kTWV0YWRhdGEuYXJncy5sZW5ndGggIT09IDEgfHwgIWNvbW1hbmRNZXRhZGF0YS5hcmdzWzBdLnNjaGVtYSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYXJnc1NjaGVtYSA9IGNvbW1hbmRNZXRhZGF0YS5hcmdzWzBdLnNjaGVtYTtcblx0XHRcdGNvbnN0IGFyZ3NSZXF1aXJlZCA9IChcblx0XHRcdFx0KHR5cGVvZiBjb21tYW5kTWV0YWRhdGEuYXJnc1swXS5pc09wdGlvbmFsICE9PSAndW5kZWZpbmVkJylcblx0XHRcdFx0XHQ/ICghY29tbWFuZE1ldGFkYXRhLmFyZ3NbMF0uaXNPcHRpb25hbClcblx0XHRcdFx0XHQ6IChBcnJheS5pc0FycmF5KGFyZ3NTY2hlbWEucmVxdWlyZWQpICYmIGFyZ3NTY2hlbWEucmVxdWlyZWQubGVuZ3RoID4gMClcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBhZGRpdGlvbiA9IHtcblx0XHRcdFx0J2lmJzoge1xuXHRcdFx0XHRcdCdyZXF1aXJlZCc6IFsnY29tbWFuZCddLFxuXHRcdFx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiB7ICdjb25zdCc6IGNvbW1hbmRJZCB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQndGhlbic6IHtcblx0XHRcdFx0XHQncmVxdWlyZWQnOiAoPHN0cmluZ1tdPltdKS5jb25jYXQoYXJnc1JlcXVpcmVkID8gWydhcmdzJ10gOiBbXSksXG5cdFx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0XHQnYXJncyc6IGFyZ3NTY2hlbWFcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdHRoaXMuY29tbWFuZHNTY2hlbWFzLnB1c2goYWRkaXRpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lbnVDb21tYW5kcyA9IE1lbnVSZWdpc3RyeS5nZXRDb21tYW5kcygpO1xuXHRcdGZvciAoY29uc3QgY29tbWFuZElkIG9mIG1lbnVDb21tYW5kcy5rZXlzKCkpIHtcblx0XHRcdGFkZEtub3duQ29tbWFuZChjb21tYW5kSWQpO1xuXHRcdH1cblxuXHRcdHRoaXMuY29tbWFuZHNTY2hlbWFzLnB1c2goLi4uYWRkaXRpb25hbENvbnRyaWJ1dGlvbnMpO1xuXHRcdHRoaXMuc2NoZW1hUmVnaXN0cnkubm90aWZ5U2NoZW1hQ2hhbmdlZChLZXliaW5kaW5nc0pzb25TY2hlbWEuc2NoZW1hSWQpO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElLZXliaW5kaW5nU2VydmljZSwgV29ya2JlbmNoS2V5Ymlu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
