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
import * as dom from "../../../../../base/browser/dom.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { ITerminalLogService, TerminalSettingId } from "../../../../../platform/terminal/common/terminal.js";
import { XtermTerminalConstants, ITerminalConfigurationService } from "../terminal.js";
import { LogLevel } from "../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { MarkNavigationAddon, ScrollPosition } from "./markNavigationAddon.js";
import { localize } from "../../../../../nls.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { PANEL_BACKGROUND } from "../../../../common/theme.js";
import { TERMINAL_FOREGROUND_COLOR, TERMINAL_BACKGROUND_COLOR, TERMINAL_CURSOR_FOREGROUND_COLOR, TERMINAL_CURSOR_BACKGROUND_COLOR, ansiColorIdentifiers, TERMINAL_SELECTION_BACKGROUND_COLOR, TERMINAL_FIND_MATCH_BACKGROUND_COLOR, TERMINAL_FIND_MATCH_HIGHLIGHT_BACKGROUND_COLOR, TERMINAL_FIND_MATCH_BORDER_COLOR, TERMINAL_OVERVIEW_RULER_FIND_MATCH_FOREGROUND_COLOR, TERMINAL_FIND_MATCH_HIGHLIGHT_BORDER_COLOR, TERMINAL_OVERVIEW_RULER_CURSOR_FOREGROUND_COLOR, TERMINAL_SELECTION_FOREGROUND_COLOR, TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR, TERMINAL_OVERVIEW_RULER_BORDER_COLOR } from "../../common/terminalColorRegistry.js";
import { ShellIntegrationAddon } from "../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { DecorationAddon } from "./decorationAddon.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { Emitter } from "../../../../../base/common/event.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { TerminalContextKeys } from "../../common/terminalContextKey.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { debounce } from "../../../../../base/common/decorators.js";
import { MouseWheelClassifier } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { StandardWheelEvent } from "../../../../../base/browser/mouseEvent.js";
import { ILayoutService } from "../../../../../platform/layout/browser/layoutService.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground } from "../../../../../platform/theme/common/colorRegistry.js";
import { XtermAddonImporter } from "./xtermAddonImporter.js";
import { equals } from "../../../../../base/common/objects.js";
import { isNumber } from "../../../../../base/common/types.js";
import { clamp } from "../../../../../base/common/numbers.js";
import { LayoutSettings } from "../../../../services/layout/browser/layoutService.js";
var RenderConstants = /* @__PURE__ */ ((RenderConstants2) => {
  RenderConstants2[RenderConstants2["SmoothScrollDuration"] = 125] = "SmoothScrollDuration";
  return RenderConstants2;
})(RenderConstants || {});
var TerminalScrollbarWidth = /* @__PURE__ */ ((TerminalScrollbarWidth2) => {
  TerminalScrollbarWidth2[TerminalScrollbarWidth2["Default"] = 14] = "Default";
  TerminalScrollbarWidth2[TerminalScrollbarWidth2["ModernUI"] = 10] = "ModernUI";
  return TerminalScrollbarWidth2;
})(TerminalScrollbarWidth || {});
var TextBlinkConstants = /* @__PURE__ */ ((TextBlinkConstants2) => {
  TextBlinkConstants2[TextBlinkConstants2["IntervalDuration"] = 600] = "IntervalDuration";
  return TextBlinkConstants2;
})(TextBlinkConstants || {});
function getFullBufferLineAsString(lineIndex, buffer) {
  let line = buffer.getLine(lineIndex);
  if (!line) {
    return { lineData: void 0, lineIndex };
  }
  let lineData = line.translateToString(true);
  while (lineIndex > 0 && line.isWrapped) {
    line = buffer.getLine(--lineIndex);
    if (!line) {
      break;
    }
    lineData = line.translateToString(false) + lineData;
  }
  return { lineData, lineIndex };
}
let XtermTerminal = class extends Disposable {
  /**
   * @param xtermCtor The xterm.js constructor, this is passed in so it can be fetched lazily
   * outside of this class such that {@link raw} is not nullable.
   */
  constructor(resource, xtermCtor, options, _onDidExecuteText, _configurationService, _instantiationService, _logService, _notificationService, _themeService, _telemetryService, _terminalConfigurationService, _clipboardService, contextKeyService, _accessibilitySignalService, layoutService) {
    super();
    this._onDidExecuteText = _onDidExecuteText;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    this._notificationService = _notificationService;
    this._themeService = _themeService;
    this._telemetryService = _telemetryService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._clipboardService = _clipboardService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._isPhysicalMouseWheel = MouseWheelClassifier.INSTANCE.isPhysicalMouseWheel();
    this._progressState = { state: 0, value: 0 };
    this._webglAddonCustomGlyphs = false;
    this._ligaturesAddon = this._register(new MutableDisposable());
    this._attachedDisposables = this._register(new DisposableStore());
    this._onDidRequestRunCommand = this._register(new Emitter());
    this.onDidRequestRunCommand = this._onDidRequestRunCommand.event;
    this._onDidRequestCopyAsHtml = this._register(new Emitter());
    this.onDidRequestCopyAsHtml = this._onDidRequestCopyAsHtml.event;
    this._onDidRequestRefreshDimensions = this._register(new Emitter());
    this.onDidRequestRefreshDimensions = this._onDidRequestRefreshDimensions.event;
    this._onDidChangeFindResults = this._register(new Emitter());
    this.onDidChangeFindResults = this._onDidChangeFindResults.event;
    this._onBeforeSearch = this._register(new Emitter());
    this.onBeforeSearch = this._onBeforeSearch.event;
    this._onAfterSearch = this._register(new Emitter());
    this.onAfterSearch = this._onAfterSearch.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._onDidChangeFocus = this._register(new Emitter());
    this.onDidChangeFocus = this._onDidChangeFocus.event;
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._onDidChangeProgress = this._register(new Emitter());
    this.onDidChangeProgress = this._onDidChangeProgress.event;
    this._xtermAddonLoader = options.xtermAddonImporter ?? new XtermAddonImporter();
    this._xtermColorProvider = options.xtermColorProvider;
    this._capabilities = options.capabilities;
    this._disableOverviewRuler = options.disableOverviewRuler ?? false;
    const font = this._terminalConfigurationService.getFont(dom.getActiveWindow(), void 0, true);
    const config = this._terminalConfigurationService.config;
    const editorOptions = this._configurationService.getValue("editor");
    this.raw = this._register(new xtermCtor({
      allowProposedApi: true,
      cols: options.cols,
      rows: options.rows,
      documentOverride: layoutService.mainContainer.ownerDocument,
      altClickMovesCursor: config.altClickMovesCursor && editorOptions.multiCursorModifier === "alt",
      scrollback: config.scrollback,
      theme: this.getXtermTheme(),
      drawBoldTextInBrightColors: config.drawBoldTextInBrightColors,
      fontFamily: font.fontFamily,
      fontWeight: config.fontWeight,
      fontWeightBold: config.fontWeightBold,
      fontSize: font.fontSize,
      letterSpacing: font.letterSpacing,
      lineHeight: font.lineHeight,
      logLevel: vscodeToXtermLogLevel(this._logService.getLevel()),
      logger: this._logService,
      minimumContrastRatio: config.minimumContrastRatio,
      tabStopWidth: config.tabStopWidth,
      cursorBlink: config.cursorBlinking,
      blinkIntervalDuration: config.textBlinking ? 600 /* IntervalDuration */ : 0,
      cursorStyle: vscodeToXtermCursorStyle(config.cursorStyle),
      cursorInactiveStyle: vscodeToXtermCursorStyle(config.cursorStyleInactive),
      cursorWidth: config.cursorWidth,
      macOptionIsMeta: config.macOptionIsMeta,
      macOptionClickForcesSelection: config.macOptionClickForcesSelection,
      rightClickSelectsWord: config.rightClickBehavior === "selectWord",
      fastScrollSensitivity: config.fastScrollSensitivity,
      scrollSensitivity: config.mouseWheelScrollSensitivity,
      scrollOnEraseInDisplay: true,
      wordSeparator: config.wordSeparators,
      scrollbar: this._getScrollbarOptions(),
      ignoreBracketedPasteMode: config.ignoreBracketedPasteMode,
      rescaleOverlappingGlyphs: config.rescaleOverlappingGlyphs,
      vtExtensions: {
        kittyKeyboard: config.enableKittyKeyboardProtocol,
        win32InputMode: config.enableWin32InputMode
      },
      allowTransparency: config.enableImages,
      windowOptions: {
        getWinSizePixels: true,
        getCellSizePixels: true,
        getWinSizeChars: true
      }
    }));
    this._updateSmoothScrolling();
    this._core = this.raw._core;
    if (!options.detached) {
      this._register(this._configurationService.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration(TerminalSettingId.GpuAcceleration)) {
          XtermTerminal._suggestedRendererType = void 0;
        }
        if (e.affectsConfiguration("terminal.integrated") || e.affectsConfiguration("editor.fastScrollSensitivity") || e.affectsConfiguration("editor.mouseWheelScrollSensitivity") || e.affectsConfiguration("editor.multiCursorModifier") || e.affectsConfiguration(LayoutSettings.MODERN_UI)) {
          this.updateConfig();
        }
        if (e.affectsConfiguration(TerminalSettingId.UnicodeVersion)) {
          this._updateUnicodeVersion();
        }
        if (e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationsEnabled)) {
          this._updateTheme();
        }
      }));
      this._register(this._themeService.onDidColorThemeChange((theme) => this._updateTheme(theme)));
      this._register(this._logService.onDidChangeLogLevel((e) => this.raw.options.logLevel = vscodeToXtermLogLevel(e)));
    }
    this._register(this.raw.onSelectionChange(() => {
      this._onDidChangeSelection.fire();
      if (this.isFocused) {
        this._anyFocusedTerminalHasSelection.set(this.raw.hasSelection());
      }
    }));
    this._register(this.raw.onData((e) => this._lastInputEvent = e));
    this._updateUnicodeVersion();
    this._markNavigationAddon = this._instantiationService.createInstance(MarkNavigationAddon, options.capabilities);
    this.raw.loadAddon(this._markNavigationAddon);
    this._decorationAddon = this._instantiationService.createInstance(DecorationAddon, resource, this._capabilities);
    this._register(this._decorationAddon.onDidRequestRunCommand((e) => this._onDidRequestRunCommand.fire(e)));
    this._register(this._decorationAddon.onDidRequestCopyAsHtml((e) => this._onDidRequestCopyAsHtml.fire(e)));
    this.raw.loadAddon(this._decorationAddon);
    this._shellIntegrationAddon = new ShellIntegrationAddon(options.shellIntegrationNonce ?? "", options.disableShellIntegrationReporting, this._onDidExecuteText, this._telemetryService, this._logService);
    this.raw.loadAddon(this._shellIntegrationAddon);
    this._xtermAddonLoader.importAddon("clipboard").then((ClipboardAddon) => {
      if (this._store.isDisposed) {
        return;
      }
      this._clipboardAddon = this._instantiationService.createInstance(ClipboardAddon, void 0, {
        async readText(type) {
          return _clipboardService.readText(type === "p" ? "selection" : "clipboard");
        },
        async writeText(type, text) {
          return _clipboardService.writeText(text, type === "p" ? "selection" : "clipboard");
        }
      });
      this.raw.loadAddon(this._clipboardAddon);
    });
    this._xtermAddonLoader.importAddon("progress").then((ProgressAddon) => {
      if (this._store.isDisposed) {
        return;
      }
      const progressAddon = this._instantiationService.createInstance(ProgressAddon);
      this.raw.loadAddon(progressAddon);
      const updateProgress = () => {
        if (!equals(this._progressState, progressAddon.progress)) {
          this._progressState = progressAddon.progress;
          this._onDidChangeProgress.fire(this._progressState);
        }
      };
      this._register(progressAddon.onChange(() => updateProgress()));
      updateProgress();
      const commandDetection = this._capabilities.get(TerminalCapability.CommandDetection);
      if (commandDetection) {
        this._register(commandDetection.onCommandFinished(() => progressAddon.progress = { state: 0, value: 0 }));
      } else {
        const disposable = this._capabilities.onDidAddCapability((e) => {
          if (e.id === TerminalCapability.CommandDetection) {
            this._register(e.capability.onCommandFinished(() => progressAddon.progress = { state: 0, value: 0 }));
            this._store.delete(disposable);
          }
        });
        this._store.add(disposable);
      }
    });
    this._anyTerminalFocusContextKey = TerminalContextKeys.focusInAny.bindTo(contextKeyService);
    this._anyFocusedTerminalHasSelection = TerminalContextKeys.textSelectedInFocused.bindTo(contextKeyService);
  }
  get lastInputEvent() {
    return this._lastInputEvent;
  }
  get progressState() {
    return this._progressState;
  }
  get buffer() {
    return this.raw.buffer;
  }
  get cols() {
    return this.raw.cols;
  }
  get findResult() {
    return this._lastFindResult;
  }
  get isStdinDisabled() {
    return !!this.raw.options.disableStdin;
  }
  get isGpuAccelerated() {
    return !!this._webglAddon;
  }
  get isImageAddonLoaded() {
    return !!this._imageAddon;
  }
  get markTracker() {
    return this._markNavigationAddon;
  }
  get shellIntegration() {
    return this._shellIntegrationAddon;
  }
  get decorationAddon() {
    return this._decorationAddon;
  }
  get textureAtlas() {
    const canvas = this._webglAddon?.textureAtlas;
    if (!canvas) {
      return void 0;
    }
    return createImageBitmap(canvas);
  }
  get isFocused() {
    if (!this.raw.element) {
      return false;
    }
    return dom.isAncestorOfActiveElement(this.raw.element);
  }
  *getBufferReverseIterator() {
    for (let i = this.raw.buffer.active.length - 1; i >= 0; i--) {
      const { lineData, lineIndex } = getFullBufferLineAsString(i, this.raw.buffer.active);
      if (lineData) {
        i = lineIndex;
        yield lineData;
      }
    }
  }
  getContentsAsText(startMarker, endMarker) {
    const lines = [];
    const buffer = this.raw.buffer.active;
    if (endMarker?.line === -1) {
      throw new Error("Cannot get contents of a disposed endMarker");
    }
    const startLine = startMarker === void 0 || startMarker.line === -1 ? 0 : startMarker.line;
    const endLine = endMarker?.line ?? buffer.length - 1;
    for (let y = startLine; y <= endLine; y++) {
      lines.push(buffer.getLine(y)?.translateToString(true) ?? "");
    }
    return lines.join("\n");
  }
  async getContentsAsHtml() {
    if (!this._serializeAddon) {
      const Addon = await this._xtermAddonLoader.importAddon("serialize");
      this._serializeAddon = new Addon();
      this.raw.loadAddon(this._serializeAddon);
    }
    return this._serializeAddon.serializeAsHTML();
  }
  async getCommandOutputAsHtml(command, maxLines) {
    if (!this._serializeAddon) {
      const Addon = await this._xtermAddonLoader.importAddon("serialize");
      this._serializeAddon = new Addon();
      this.raw.loadAddon(this._serializeAddon);
    }
    let startLine;
    let startCol;
    if (command.executedMarker && command.executedMarker.line >= 0) {
      startLine = command.executedMarker.line;
      startCol = Math.max(command.executedX ?? 0, 0);
    } else {
      startLine = command.marker?.line !== void 0 ? command.marker.line + 1 : 1;
      startCol = Math.max(command.startX ?? 0, 0);
    }
    let endLine = command.endMarker?.line !== void 0 ? command.endMarker.line - 1 : this.raw.buffer.active.length - 1;
    if (endLine < startLine) {
      return { text: "", truncated: false };
    }
    let emptyLinesFromEnd = 0;
    for (let i = endLine; i >= startLine; i--) {
      const line = this.raw.buffer.active.getLine(i);
      if (line && line.translateToString(true).trim() === "") {
        emptyLinesFromEnd++;
      } else {
        break;
      }
    }
    endLine = endLine - emptyLinesFromEnd;
    let emptyLinesFromStart = 0;
    for (let i = startLine; i <= endLine; i++) {
      const line = this.raw.buffer.active.getLine(i);
      if (line && line.translateToString(true, i === startLine ? startCol : void 0).trim() === "") {
        if (i === startLine) {
          startCol = 0;
        }
        emptyLinesFromStart++;
      } else {
        break;
      }
    }
    startLine = startLine + emptyLinesFromStart;
    if (maxLines && endLine - startLine > maxLines) {
      startLine = endLine - maxLines;
      startCol = 0;
    }
    const bufferLine = this.raw.buffer.active.getLine(startLine);
    if (bufferLine) {
      startCol = Math.min(startCol, bufferLine.length);
    }
    const range = { startLine, endLine, startCol };
    const result = this._serializeAddon.serializeAsHTML({ range });
    return { text: result, truncated: endLine - startLine >= maxLines };
  }
  async getSelectionAsHtml(command) {
    if (!this._serializeAddon) {
      const Addon = await this._xtermAddonLoader.importAddon("serialize");
      this._serializeAddon = new Addon();
      this.raw.loadAddon(this._serializeAddon);
    }
    if (command) {
      const length = command.getOutput()?.length;
      const row = command.marker?.line;
      if (!length || !row) {
        throw new Error(`No row ${row} or output length ${length} for command ${command}`);
      }
      this.raw.select(0, row + 1, length - Math.floor(length / this.raw.cols));
    }
    const result = this._serializeAddon.serializeAsHTML({ onlySelection: true });
    if (command) {
      this.raw.clearSelection();
    }
    return result;
  }
  attachToElement(container, partialOptions) {
    const options = { enableGpu: true, ...partialOptions };
    if (!this._attached) {
      this.raw.open(container);
    }
    if (options.enableGpu) {
      if (this._shouldLoadWebgl()) {
        this._enableWebglRenderer();
      }
    }
    if (!this.raw.element || !this.raw.textarea) {
      throw new Error("xterm elements not set after open");
    }
    const ad = this._attachedDisposables;
    ad.clear();
    ad.add(dom.addDisposableListener(this.raw.textarea, "focus", () => this._setFocused(true)));
    ad.add(dom.addDisposableListener(this.raw.textarea, "blur", () => this._setFocused(false)));
    ad.add(dom.addDisposableListener(this.raw.textarea, "focusout", () => this._setFocused(false)));
    ad.add(dom.addDisposableListener(this.raw.element, dom.EventType.MOUSE_WHEEL, (e) => {
      const classifier = MouseWheelClassifier.INSTANCE;
      classifier.acceptStandardWheelEvent(new StandardWheelEvent(e));
      const value = classifier.isPhysicalMouseWheel();
      if (value !== this._isPhysicalMouseWheel) {
        this._isPhysicalMouseWheel = value;
        this._updateSmoothScrolling();
      }
    }, { passive: true }));
    this._refreshLigaturesAddon();
    this._attached = { container, options };
    return this._attached?.container.querySelector(".xterm-screen");
  }
  _setFocused(isFocused) {
    this._onDidChangeFocus.fire(isFocused);
    this._anyTerminalFocusContextKey.set(isFocused);
    this._anyFocusedTerminalHasSelection.set(isFocused && this.raw.hasSelection());
  }
  write(data, callback) {
    this.raw.write(data, callback);
  }
  resize(columns, rows) {
    this._logService.debug("resizing", columns, rows);
    this.raw.resize(columns, rows);
  }
  updateLogLevel() {
    this.raw.options.logLevel = vscodeToXtermLogLevel(this._logService.getLevel());
  }
  /**
   * The width, in pixels, of the vertical scrollbar. Narrower under the Modern
   * UI Update experiment so it matches the modernized workbench scrollbars.
   */
  get scrollbarWidth() {
    return this._configurationService.getValue(LayoutSettings.MODERN_UI) === true ? 10 /* ModernUI */ : 14 /* Default */;
  }
  /**
   * Builds the xterm.js `scrollbar` option using {@link scrollbarWidth}. Returns
   * `undefined` when the overview ruler is disabled (e.g. detached terminals).
   */
  _getScrollbarOptions() {
    if (this._disableOverviewRuler) {
      return void 0;
    }
    return {
      width: this.scrollbarWidth,
      overviewRuler: {
        showTopBorder: true
      }
    };
  }
  updateConfig() {
    const config = this._terminalConfigurationService.config;
    this.raw.options.altClickMovesCursor = config.altClickMovesCursor;
    this._setCursorBlink(config.cursorBlinking);
    this._setTextBlinking(config.textBlinking);
    this._setCursorStyle(config.cursorStyle);
    this._setCursorStyleInactive(config.cursorStyleInactive);
    this._setCursorWidth(config.cursorWidth);
    this.raw.options.scrollback = config.scrollback;
    this.raw.options.drawBoldTextInBrightColors = config.drawBoldTextInBrightColors;
    this.raw.options.minimumContrastRatio = config.minimumContrastRatio;
    this.raw.options.tabStopWidth = config.tabStopWidth;
    this.raw.options.fastScrollSensitivity = config.fastScrollSensitivity;
    this.raw.options.scrollSensitivity = config.mouseWheelScrollSensitivity;
    this.raw.options.macOptionIsMeta = config.macOptionIsMeta;
    const editorOptions = this._configurationService.getValue("editor");
    this.raw.options.altClickMovesCursor = config.altClickMovesCursor && editorOptions.multiCursorModifier === "alt";
    this.raw.options.macOptionClickForcesSelection = config.macOptionClickForcesSelection;
    this.raw.options.rightClickSelectsWord = config.rightClickBehavior === "selectWord";
    this.raw.options.wordSeparator = config.wordSeparators;
    this.raw.options.scrollbar = this._getScrollbarOptions();
    this.raw.options.ignoreBracketedPasteMode = config.ignoreBracketedPasteMode;
    this.raw.options.rescaleOverlappingGlyphs = config.rescaleOverlappingGlyphs;
    this.raw.options.allowTransparency = config.enableImages;
    this.raw.options.vtExtensions = {
      kittyKeyboard: config.enableKittyKeyboardProtocol,
      win32InputMode: config.enableWin32InputMode
    };
    this._updateSmoothScrolling();
    if (this._attached) {
      if (this._attached.options.enableGpu) {
        if (this._shouldLoadWebgl()) {
          this._enableWebglRenderer();
        } else {
          this._disposeOfWebglRenderer();
        }
      }
      this._refreshLigaturesAddon();
    }
  }
  _updateSmoothScrolling() {
    this.raw.options.smoothScrollDuration = this._terminalConfigurationService.config.smoothScrolling && this._isPhysicalMouseWheel ? 125 /* SmoothScrollDuration */ : 0;
  }
  _shouldLoadWebgl() {
    return this._terminalConfigurationService.config.gpuAcceleration === "auto" && XtermTerminal._suggestedRendererType === void 0 || this._terminalConfigurationService.config.gpuAcceleration === "on";
  }
  forceRedraw() {
    this.raw.clearTextureAtlas();
  }
  clearDecorations() {
    this._decorationAddon?.clearDecorations();
  }
  forceRefresh() {
    this._core.viewport?._innerRefresh();
  }
  async findNext(term, searchOptions) {
    this._updateFindColors(searchOptions);
    return (await this._getSearchAddon()).findNext(term, searchOptions);
  }
  async findPrevious(term, searchOptions) {
    this._updateFindColors(searchOptions);
    return (await this._getSearchAddon()).findPrevious(term, searchOptions);
  }
  _updateFindColors(searchOptions) {
    const theme = this._themeService.getColorTheme();
    const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR) || theme.getColor(PANEL_BACKGROUND);
    const findMatchBackground = theme.getColor(TERMINAL_FIND_MATCH_BACKGROUND_COLOR);
    const findMatchBorder = theme.getColor(TERMINAL_FIND_MATCH_BORDER_COLOR);
    const findMatchOverviewRuler = theme.getColor(TERMINAL_OVERVIEW_RULER_CURSOR_FOREGROUND_COLOR);
    const findMatchHighlightBackground = theme.getColor(TERMINAL_FIND_MATCH_HIGHLIGHT_BACKGROUND_COLOR);
    const findMatchHighlightBorder = theme.getColor(TERMINAL_FIND_MATCH_HIGHLIGHT_BORDER_COLOR);
    const findMatchHighlightOverviewRuler = theme.getColor(TERMINAL_OVERVIEW_RULER_FIND_MATCH_FOREGROUND_COLOR);
    searchOptions.decorations = {
      activeMatchBackground: findMatchBackground?.toString(),
      activeMatchBorder: findMatchBorder?.toString() || "transparent",
      activeMatchColorOverviewRuler: findMatchOverviewRuler?.toString() || "transparent",
      // decoration bgs don't support the alpha channel so blend it with the regular bg
      matchBackground: terminalBackground ? findMatchHighlightBackground?.blend(terminalBackground).toString() : void 0,
      matchBorder: findMatchHighlightBorder?.toString() || "transparent",
      matchOverviewRuler: findMatchHighlightOverviewRuler?.toString() || "transparent"
    };
  }
  _getSearchAddon() {
    if (!this._searchAddonPromise) {
      this._searchAddonPromise = this._xtermAddonLoader.importAddon("search").then((AddonCtor) => {
        if (this._store.isDisposed) {
          return Promise.reject("Could not create search addon, terminal is disposed");
        }
        this._searchAddon = new AddonCtor({ highlightLimit: XtermTerminalConstants.SearchHighlightLimit });
        this.raw.loadAddon(this._searchAddon);
        this._store.add(this._searchAddon.onDidChangeResults((results) => {
          this._lastFindResult = results;
          this._onDidChangeFindResults.fire(results);
        }));
        this._store.add(this._searchAddon.onBeforeSearch(() => {
          this._onBeforeSearch.fire();
        }));
        this._store.add(this._searchAddon.onAfterSearch(() => {
          this._onAfterSearch.fire();
        }));
        return this._searchAddon;
      });
    }
    return this._searchAddonPromise;
  }
  clearSearchDecorations() {
    this._searchAddon?.clearDecorations();
  }
  clearActiveSearchDecoration() {
    this._searchAddon?.clearActiveDecoration();
  }
  getFont() {
    return this._terminalConfigurationService.getFont(dom.getWindow(this.raw.element), this._core);
  }
  getLongestViewportWrappedLineLength() {
    let maxLineLength = 0;
    for (let i = this.raw.buffer.active.length - 1; i >= this.raw.buffer.active.viewportY; i--) {
      const lineInfo = this._getWrappedLineCount(i, this.raw.buffer.active);
      maxLineLength = Math.max(maxLineLength, lineInfo.lineCount * this.raw.cols - lineInfo.endSpaces || 0);
      i = lineInfo.currentIndex;
    }
    return maxLineLength;
  }
  _getWrappedLineCount(index, buffer) {
    let line = buffer.getLine(index);
    if (!line) {
      throw new Error("Could not get line");
    }
    let currentIndex = index;
    let endSpaces = 0;
    for (let i = Math.min(line.length, this.raw.cols) - 1; i >= 0; i--) {
      if (!line?.getCell(i)?.getChars()) {
        endSpaces++;
      } else {
        break;
      }
    }
    while (line?.isWrapped && currentIndex > 0) {
      currentIndex--;
      line = buffer.getLine(currentIndex);
    }
    return { lineCount: index - currentIndex + 1, currentIndex, endSpaces };
  }
  scrollDownLine() {
    this.raw.scrollLines(1);
  }
  scrollDownPage() {
    this.raw.scrollPages(1);
  }
  scrollToBottom() {
    this.raw.scrollToBottom();
  }
  scrollUpLine() {
    this.raw.scrollLines(-1);
  }
  scrollUpPage() {
    this.raw.scrollPages(-1);
  }
  scrollToTop() {
    this.raw.scrollToTop();
  }
  scrollToLine(line, position = ScrollPosition.Top) {
    this.markTracker.scrollToLine(line, position);
  }
  clearBuffer() {
    this.raw.clear();
    this._capabilities.get(TerminalCapability.CommandDetection)?.handlePromptStart();
    this._capabilities.get(TerminalCapability.CommandDetection)?.handleCommandStart();
    this._accessibilitySignalService.playSignal(AccessibilitySignal.clear);
  }
  reset() {
    this.raw.reset();
  }
  hasSelection() {
    return this.raw.hasSelection();
  }
  clearSelection() {
    this.raw.clearSelection();
  }
  selectMarkedRange(fromMarkerId, toMarkerId, scrollIntoView = false) {
    const detectionCapability = this.shellIntegration.capabilities.get(TerminalCapability.BufferMarkDetection);
    if (!detectionCapability) {
      return;
    }
    const start = detectionCapability.getMark(fromMarkerId);
    const end = detectionCapability.getMark(toMarkerId);
    if (start === void 0 || end === void 0) {
      return;
    }
    this.raw.selectLines(start.line, end.line);
    if (scrollIntoView) {
      this.raw.scrollToLine(start.line);
    }
  }
  selectAll() {
    this.raw.focus();
    this.raw.selectAll();
  }
  focus() {
    this.raw.focus();
  }
  async copySelection(asHtml, command) {
    if (this.hasSelection() || asHtml && command) {
      if (asHtml) {
        let listener2 = function(e) {
          if (e.clipboardData) {
            if (!e.clipboardData.types.includes("text/plain")) {
              e.clipboardData.setData("text/plain", command?.getOutput() ?? "");
            }
            e.clipboardData.setData("text/html", textAsHtml);
          }
          e.preventDefault();
        };
        var listener = listener2;
        const textAsHtml = await this.getSelectionAsHtml(command);
        const doc = dom.getDocument(this.raw.element);
        doc.addEventListener("copy", listener2);
        doc.execCommand("copy");
        doc.removeEventListener("copy", listener2);
      } else {
        await this._clipboardService.writeText(this.raw.getSelection());
      }
    } else {
      this._notificationService.warn(localize("terminal.integrated.copySelection.noSelection", "The terminal has no selection to copy"));
    }
  }
  _setCursorBlink(blink) {
    if (this.raw.options.cursorBlink !== blink) {
      this.raw.options.cursorBlink = blink;
      this.raw.refresh(0, this.raw.rows - 1);
    }
  }
  _setTextBlinking(enabled) {
    const blinkIntervalDuration = enabled ? 600 /* IntervalDuration */ : 0;
    const options = this.raw.options;
    if (options.blinkIntervalDuration !== blinkIntervalDuration) {
      options.blinkIntervalDuration = blinkIntervalDuration;
    }
  }
  _setCursorStyle(style) {
    const mapped = vscodeToXtermCursorStyle(style);
    if (this.raw.options.cursorStyle !== mapped) {
      this.raw.options.cursorStyle = mapped;
    }
  }
  _setCursorStyleInactive(style) {
    const mapped = vscodeToXtermCursorStyle(style);
    if (this.raw.options.cursorInactiveStyle !== mapped) {
      this.raw.options.cursorInactiveStyle = mapped;
    }
  }
  _setCursorWidth(width) {
    if (this.raw.options.cursorWidth !== width) {
      this.raw.options.cursorWidth = width;
    }
  }
  async _enableWebglRenderer() {
    if (!this.raw.element || this._webglAddon && this._webglAddonCustomGlyphs === this._terminalConfigurationService.config.customGlyphs) {
      return;
    }
    this._disposeOfWebglRenderer();
    this._webglAddonCustomGlyphs = this._terminalConfigurationService.config.customGlyphs;
    const Addon = await this._xtermAddonLoader.importAddon("webgl");
    this._webglAddon = new Addon({
      customGlyphs: this._terminalConfigurationService.config.customGlyphs
    });
    try {
      this.raw.loadAddon(this._webglAddon);
      this._logService.trace("Webgl was loaded");
      this._store.add(this._webglAddon.onContextLoss(() => {
        this._logService.info(`Webgl lost context, disposing of webgl renderer`);
        this._disposeOfWebglRenderer();
      }));
      this._refreshImageAddon();
      this._onDidRequestRefreshDimensions.fire();
    } catch (e) {
      this._logService.warn(`Webgl could not be loaded. Falling back to the DOM renderer`, e);
      XtermTerminal._suggestedRendererType = "dom";
      this._disposeOfWebglRenderer();
    }
  }
  async _refreshLigaturesAddon() {
    if (!this.raw.element) {
      return;
    }
    const ligaturesConfig = this._terminalConfigurationService.config.fontLigatures;
    let shouldRecreateWebglRenderer = false;
    if (ligaturesConfig?.enabled) {
      const ligatureOptions = {
        fontFeatureSettings: ligaturesConfig.featureSettings,
        fallbackLigatures: ligaturesConfig.fallbackLigatures
      };
      if (this._ligaturesAddon.value && !equals(ligatureOptions, this._ligaturesAddonConfig)) {
        this._ligaturesAddon.clear();
        this._ligaturesAddonConfig = void 0;
      }
      if (!this._ligaturesAddon.value) {
        const LigaturesAddon = await this._xtermAddonLoader.importAddon("ligatures");
        if (this._store.isDisposed) {
          return;
        }
        this._ligaturesAddon.value = this._instantiationService.createInstance(LigaturesAddon, ligatureOptions);
        this._ligaturesAddonConfig = ligatureOptions;
        this.raw.loadAddon(this._ligaturesAddon.value);
        shouldRecreateWebglRenderer = true;
      }
    } else {
      if (!this._ligaturesAddon.value) {
        return;
      }
      this._ligaturesAddon.clear();
      this._ligaturesAddonConfig = void 0;
      shouldRecreateWebglRenderer = true;
    }
    if (shouldRecreateWebglRenderer && this._webglAddon) {
      this._disposeOfWebglRenderer();
      await this._enableWebglRenderer();
    }
  }
  async _refreshImageAddon() {
    if (this._terminalConfigurationService.config.enableImages && this._webglAddon) {
      if (!this._imageAddon) {
        const AddonCtor = await this._xtermAddonLoader.importAddon("image");
        this._imageAddon = new AddonCtor();
        this.raw.loadAddon(this._imageAddon);
        this._telemetryService.publicLog2("terminal/imageAddonActivated");
        this._register(this._imageAddon.onImageAdded(() => {
          this._telemetryService.publicLog2("terminal/imageAdded");
        }));
      }
    } else {
      try {
        this._imageAddon?.dispose();
      } catch {
      }
      this._imageAddon = void 0;
    }
  }
  _disposeOfWebglRenderer() {
    if (!this._webglAddon) {
      return;
    }
    try {
      this._webglAddon?.dispose();
    } catch {
    }
    this._webglAddon = void 0;
    this._webglAddonCustomGlyphs = void 0;
    this._refreshImageAddon();
    this._onDidRequestRefreshDimensions.fire();
  }
  async getRangeAsVT(startMarker, endMarker, skipLastLine) {
    if (!this._serializeAddon) {
      const Addon = await this._xtermAddonLoader.importAddon("serialize");
      this._serializeAddon = new Addon();
      this.raw.loadAddon(this._serializeAddon);
    }
    const lastLine = this.raw.buffer.active.length - 1;
    if (lastLine < 0) {
      return "";
    }
    const hasValidEndMarker = isNumber(endMarker?.line);
    const start = clamp(isNumber(startMarker?.line) && startMarker.line > -1 ? startMarker.line : 0, 0, lastLine);
    let end = hasValidEndMarker ? endMarker.line : this.raw.buffer.active.length - 1;
    if (skipLastLine && hasValidEndMarker) {
      end = end - 1;
    }
    end = clamp(Math.max(end, start), start, lastLine);
    return this._serializeAddon.serialize({
      range: {
        start,
        end
      }
    });
  }
  getXtermTheme(theme) {
    if (!theme) {
      theme = this._themeService.getColorTheme();
    }
    const config = this._terminalConfigurationService.config;
    const hideOverviewRuler = ["never", "gutter"].includes(config.shellIntegration?.decorationsEnabled ?? "");
    const foregroundColor = theme.getColor(TERMINAL_FOREGROUND_COLOR);
    const backgroundColor = this._xtermColorProvider.getBackgroundColor(theme);
    const cursorColor = theme.getColor(TERMINAL_CURSOR_FOREGROUND_COLOR) || foregroundColor;
    const cursorAccentColor = theme.getColor(TERMINAL_CURSOR_BACKGROUND_COLOR) || backgroundColor;
    const selectionBackgroundColor = theme.getColor(TERMINAL_SELECTION_BACKGROUND_COLOR);
    const selectionInactiveBackgroundColor = theme.getColor(TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR);
    const selectionForegroundColor = theme.getColor(TERMINAL_SELECTION_FOREGROUND_COLOR) || void 0;
    return {
      background: backgroundColor?.toString(),
      foreground: foregroundColor?.toString(),
      cursor: cursorColor?.toString(),
      cursorAccent: cursorAccentColor?.toString(),
      selectionBackground: selectionBackgroundColor?.toString(),
      selectionInactiveBackground: selectionInactiveBackgroundColor?.toString(),
      selectionForeground: selectionForegroundColor?.toString(),
      overviewRulerBorder: hideOverviewRuler ? "#0000" : theme.getColor(TERMINAL_OVERVIEW_RULER_BORDER_COLOR)?.toString(),
      scrollbarSliderActiveBackground: theme.getColor(scrollbarSliderActiveBackground)?.toString(),
      scrollbarSliderBackground: theme.getColor(scrollbarSliderBackground)?.toString(),
      scrollbarSliderHoverBackground: theme.getColor(scrollbarSliderHoverBackground)?.toString(),
      black: theme.getColor(ansiColorIdentifiers[0])?.toString(),
      red: theme.getColor(ansiColorIdentifiers[1])?.toString(),
      green: theme.getColor(ansiColorIdentifiers[2])?.toString(),
      yellow: theme.getColor(ansiColorIdentifiers[3])?.toString(),
      blue: theme.getColor(ansiColorIdentifiers[4])?.toString(),
      magenta: theme.getColor(ansiColorIdentifiers[5])?.toString(),
      cyan: theme.getColor(ansiColorIdentifiers[6])?.toString(),
      white: theme.getColor(ansiColorIdentifiers[7])?.toString(),
      brightBlack: theme.getColor(ansiColorIdentifiers[8])?.toString(),
      brightRed: theme.getColor(ansiColorIdentifiers[9])?.toString(),
      brightGreen: theme.getColor(ansiColorIdentifiers[10])?.toString(),
      brightYellow: theme.getColor(ansiColorIdentifiers[11])?.toString(),
      brightBlue: theme.getColor(ansiColorIdentifiers[12])?.toString(),
      brightMagenta: theme.getColor(ansiColorIdentifiers[13])?.toString(),
      brightCyan: theme.getColor(ansiColorIdentifiers[14])?.toString(),
      brightWhite: theme.getColor(ansiColorIdentifiers[15])?.toString()
    };
  }
  _updateTheme(theme) {
    this.raw.options.theme = this.getXtermTheme(theme);
  }
  /**
   * Updates the terminal theme. Use this to externally trigger a theme
   * refresh for detached terminals that skip global service listeners.
   */
  updateTheme() {
    this._updateTheme();
  }
  refresh() {
    this._updateTheme();
    this._decorationAddon.refreshLayouts();
  }
  async _updateUnicodeVersion() {
    if (!this._unicode11Addon && this._terminalConfigurationService.config.unicodeVersion === "11") {
      const Addon = await this._xtermAddonLoader.importAddon("unicode11");
      this._unicode11Addon = new Addon();
      this.raw.loadAddon(this._unicode11Addon);
    }
    if (this.raw.unicode.activeVersion !== this._terminalConfigurationService.config.unicodeVersion) {
      this.raw.unicode.activeVersion = this._terminalConfigurationService.config.unicodeVersion;
    }
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  _writeText(data) {
    this.raw.write(data);
  }
  dispose() {
    this._anyTerminalFocusContextKey.reset();
    this._anyFocusedTerminalHasSelection.reset();
    this._disposeOfWebglRenderer();
    this._onDidDispose.fire();
    super.dispose();
  }
};
XtermTerminal._suggestedRendererType = void 0;
__decorateClass([
  debounce(100)
], XtermTerminal.prototype, "_refreshLigaturesAddon", 1);
__decorateClass([
  debounce(100)
], XtermTerminal.prototype, "_refreshImageAddon", 1);
XtermTerminal = __decorateClass([
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ITerminalLogService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, ITerminalConfigurationService),
  __decorateParam(11, IClipboardService),
  __decorateParam(12, IContextKeyService),
  __decorateParam(13, IAccessibilitySignalService),
  __decorateParam(14, ILayoutService)
], XtermTerminal);
function getXtermScaledDimensions(w, font, width, height) {
  if (!font.charWidth || !font.charHeight) {
    return null;
  }
  const scaledWidthAvailable = width * w.devicePixelRatio;
  const scaledCharWidth = font.charWidth * w.devicePixelRatio + font.letterSpacing;
  const cols = Math.max(Math.floor(scaledWidthAvailable / scaledCharWidth), 1);
  const scaledHeightAvailable = height * w.devicePixelRatio;
  const scaledCharHeight = Math.ceil(font.charHeight * w.devicePixelRatio);
  const scaledLineHeight = Math.floor(scaledCharHeight * font.lineHeight);
  const rows = Math.max(Math.floor(scaledHeightAvailable / scaledLineHeight), 1);
  return { rows, cols };
}
function vscodeToXtermLogLevel(logLevel) {
  switch (logLevel) {
    case LogLevel.Trace:
      return "trace";
    case LogLevel.Debug:
      return "debug";
    case LogLevel.Info:
      return "info";
    case LogLevel.Warning:
      return "warn";
    case LogLevel.Error:
      return "error";
    default:
      return "off";
  }
}
function vscodeToXtermCursorStyle(style) {
  if (style === "line") {
    return "bar";
  }
  return style;
}
export {
  XtermTerminal,
  getXtermScaledDimensions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIveHRlcm0veHRlcm1UZXJtaW5hbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgSUJ1ZmZlciwgSVRlcm1pbmFsT3B0aW9ucywgSVRoZW1lLCBUZXJtaW5hbCBhcyBSYXdYdGVybVRlcm1pbmFsLCBMb2dMZXZlbCBhcyBYdGVybUxvZ0xldmVsLCBJTWFya2VyIGFzIElYdGVybU1hcmtlciB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgdHlwZSB7IElTZWFyY2hPcHRpb25zLCBTZWFyY2hBZGRvbiBhcyBTZWFyY2hBZGRvblR5cGUgfSBmcm9tICdAeHRlcm0vYWRkb24tc2VhcmNoJztcbmltcG9ydCB0eXBlIHsgVW5pY29kZTExQWRkb24gYXMgVW5pY29kZTExQWRkb25UeXBlIH0gZnJvbSAnQHh0ZXJtL2FkZG9uLXVuaWNvZGUxMSc7XG5pbXBvcnQgdHlwZSB7IElMaWdhdHVyZU9wdGlvbnMsIExpZ2F0dXJlc0FkZG9uIGFzIExpZ2F0dXJlc0FkZG9uVHlwZSB9IGZyb20gJ0B4dGVybS9hZGRvbi1saWdhdHVyZXMnO1xuaW1wb3J0IHR5cGUgeyBXZWJnbEFkZG9uIGFzIFdlYmdsQWRkb25UeXBlIH0gZnJvbSAnQHh0ZXJtL2FkZG9uLXdlYmdsJztcbmltcG9ydCB0eXBlIHsgU2VyaWFsaXplQWRkb24gYXMgU2VyaWFsaXplQWRkb25UeXBlIH0gZnJvbSAnQHh0ZXJtL2FkZG9uLXNlcmlhbGl6ZSc7XG5pbXBvcnQgdHlwZSB7IEltYWdlQWRkb24gYXMgSW1hZ2VBZGRvblR5cGUgfSBmcm9tICdAeHRlcm0vYWRkb24taW1hZ2UnO1xuaW1wb3J0IHR5cGUgeyBDbGlwYm9hcmRBZGRvbiBhcyBDbGlwYm9hcmRBZGRvblR5cGUgfSBmcm9tICdAeHRlcm0vYWRkb24tY2xpcGJvYXJkJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElYdGVybUNvcmUgfSBmcm9tICcuLi94dGVybS1wcml2YXRlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVNoZWxsSW50ZWdyYXRpb24sIElUZXJtaW5hbExvZ1NlcnZpY2UsIFRlcm1pbmFsU2V0dGluZ0lkLCB0eXBlIElEZWNvcmF0aW9uQWRkb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsRm9udCwgSVRlcm1pbmFsQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJTWFya1RyYWNrZXIsIElJbnRlcm5hbFh0ZXJtVGVybWluYWwsIElYdGVybVRlcm1pbmFsLCBJWHRlcm1Db2xvclByb3ZpZGVyLCBYdGVybVRlcm1pbmFsQ29uc3RhbnRzLCBJWHRlcm1BdHRhY2hUb0VsZW1lbnRPcHRpb25zLCBJRGV0YWNoZWRYdGVybVRlcm1pbmFsLCBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBNYXJrTmF2aWdhdGlvbkFkZG9uLCBTY3JvbGxQb3NpdGlvbiB9IGZyb20gJy4vbWFya05hdmlnYXRpb25BZGRvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSwgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUEFORUxfQkFDS0dST1VORCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBURVJNSU5BTF9GT1JFR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9CQUNLR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9DVVJTT1JfRk9SRUdST1VORF9DT0xPUiwgVEVSTUlOQUxfQ1VSU09SX0JBQ0tHUk9VTkRfQ09MT1IsIGFuc2lDb2xvcklkZW50aWZpZXJzLCBURVJNSU5BTF9TRUxFQ1RJT05fQkFDS0dST1VORF9DT0xPUiwgVEVSTUlOQUxfRklORF9NQVRDSF9CQUNLR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9GSU5EX01BVENIX0hJR0hMSUdIVF9CQUNLR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9GSU5EX01BVENIX0JPUkRFUl9DT0xPUiwgVEVSTUlOQUxfT1ZFUlZJRVdfUlVMRVJfRklORF9NQVRDSF9GT1JFR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9GSU5EX01BVENIX0hJR0hMSUdIVF9CT1JERVJfQ09MT1IsIFRFUk1JTkFMX09WRVJWSUVXX1JVTEVSX0NVUlNPUl9GT1JFR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9TRUxFQ1RJT05fRk9SRUdST1VORF9DT0xPUiwgVEVSTUlOQUxfSU5BQ1RJVkVfU0VMRUNUSU9OX0JBQ0tHUk9VTkRfQ09MT1IsIFRFUk1JTkFMX09WRVJWSUVXX1JVTEVSX0JPUkRFUl9DT0xPUiB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbENvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU2hlbGxJbnRlZ3JhdGlvbkFkZG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3h0ZXJtL3NoZWxsSW50ZWdyYXRpb25BZGRvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IERlY29yYXRpb25BZGRvbiB9IGZyb20gJy4vZGVjb3JhdGlvbkFkZG9uLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSwgSVRlcm1pbmFsQ29tbWFuZCwgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vdGVybWluYWxDb250ZXh0S2V5LmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRlYm91bmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBNb3VzZVdoZWVsQ2xhc3NpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgSU1vdXNlV2hlZWxFdmVudCwgU3RhbmRhcmRXaGVlbEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBzY3JvbGxiYXJTbGlkZXJBY3RpdmVCYWNrZ3JvdW5kLCBzY3JvbGxiYXJTbGlkZXJCYWNrZ3JvdW5kLCBzY3JvbGxiYXJTbGlkZXJIb3ZlckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBYdGVybUFkZG9uSW1wb3J0ZXIgfSBmcm9tICcuL3h0ZXJtQWRkb25JbXBvcnRlci5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB0eXBlIHsgSVByb2dyZXNzU3RhdGUgfSBmcm9tICdAeHRlcm0vYWRkb24tcHJvZ3Jlc3MnO1xuaW1wb3J0IHR5cGUgeyBDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzTnVtYmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IExheW91dFNldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5cbmNvbnN0IGVudW0gUmVuZGVyQ29uc3RhbnRzIHtcblx0U21vb3RoU2Nyb2xsRHVyYXRpb24gPSAxMjVcbn1cblxuY29uc3QgZW51bSBUZXJtaW5hbFNjcm9sbGJhcldpZHRoIHtcblx0LyoqIERlZmF1bHQgeHRlcm0uanMgdmVydGljYWwgc2Nyb2xsYmFyIHdpZHRoLiAqL1xuXHREZWZhdWx0ID0gMTQsXG5cdC8qKiBOYXJyb3dlciBzY3JvbGxiYXIgdXNlZCB3aGVuIHRoZSBNb2Rlcm4gVUkgVXBkYXRlIGV4cGVyaW1lbnQgaXMgZW5hYmxlZC4gKi9cblx0TW9kZXJuVUkgPSAxMFxufVxuXG5jb25zdCBlbnVtIFRleHRCbGlua0NvbnN0YW50cyB7XG5cdEludGVydmFsRHVyYXRpb24gPSA2MDBcbn1cblxuXG5mdW5jdGlvbiBnZXRGdWxsQnVmZmVyTGluZUFzU3RyaW5nKGxpbmVJbmRleDogbnVtYmVyLCBidWZmZXI6IElCdWZmZXIpOiB7IGxpbmVEYXRhOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGxpbmVJbmRleDogbnVtYmVyIH0ge1xuXHRsZXQgbGluZSA9IGJ1ZmZlci5nZXRMaW5lKGxpbmVJbmRleCk7XG5cdGlmICghbGluZSkge1xuXHRcdHJldHVybiB7IGxpbmVEYXRhOiB1bmRlZmluZWQsIGxpbmVJbmRleCB9O1xuXHR9XG5cdGxldCBsaW5lRGF0YSA9IGxpbmUudHJhbnNsYXRlVG9TdHJpbmcodHJ1ZSk7XG5cdHdoaWxlIChsaW5lSW5kZXggPiAwICYmIGxpbmUuaXNXcmFwcGVkKSB7XG5cdFx0bGluZSA9IGJ1ZmZlci5nZXRMaW5lKC0tbGluZUluZGV4KTtcblx0XHRpZiAoIWxpbmUpIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRsaW5lRGF0YSA9IGxpbmUudHJhbnNsYXRlVG9TdHJpbmcoZmFsc2UpICsgbGluZURhdGE7XG5cdH1cblx0cmV0dXJuIHsgbGluZURhdGEsIGxpbmVJbmRleCB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElYdGVybVRlcm1pbmFsT3B0aW9ucyB7XG5cdC8qKiBUaGUgY29sdW1ucyB0byBpbml0aWFsaXplIHRoZSB0ZXJtaW5hbCB3aXRoLiAqL1xuXHRjb2xzOiBudW1iZXI7XG5cdC8qKiBUaGUgcm93cyB0byBpbml0aWFsaXplIHRoZSB0ZXJtaW5hbCB3aXRoLiAqL1xuXHRyb3dzOiBudW1iZXI7XG5cdC8qKiBUaGUgY29sb3IgcHJvdmlkZXIgZm9yIHRoZSB0ZXJtaW5hbC4gKi9cblx0eHRlcm1Db2xvclByb3ZpZGVyOiBJWHRlcm1Db2xvclByb3ZpZGVyO1xuXHQvKiogVGhlIGNhcGFiaWxpdGllcyBvZiB0aGUgdGVybWluYWwuICovXG5cdGNhcGFiaWxpdGllczogSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlO1xuXHQvKiogVGhlIHNoZWxsIGludGVncmF0aW9uIG5vbmNlIHRvIHZlcmlmeSBkYXRhIGNvbWluZyBmcm9tIFNJIGlzIHRydXN0d29ydGh5LiAqL1xuXHRzaGVsbEludGVncmF0aW9uTm9uY2U/OiBzdHJpbmc7XG5cdC8qKiBXaGV0aGVyIHRvIGRpc2FibGUgc2hlbGwgaW50ZWdyYXRpb24gdGVsZW1ldHJ5IHJlcG9ydGluZy4gKi9cblx0ZGlzYWJsZVNoZWxsSW50ZWdyYXRpb25SZXBvcnRpbmc/OiBib29sZWFuO1xuXHQvKiogVGhlIG9iamVjdCB0aGF0IGltcG9ydHMgeHRlcm0gYWRkb25zLCBzZXQgdGhpcyB0byBpbmplY3QgYW4gaW1wb3J0ZXIgaW4gdGVzdHMuICovXG5cdHh0ZXJtQWRkb25JbXBvcnRlcj86IFh0ZXJtQWRkb25JbXBvcnRlcjtcblx0LyoqIFdoZXRoZXIgdG8gZGlzYWJsZSB0aGUgb3ZlcnZpZXcgcnVsZXIuICovXG5cdGRpc2FibGVPdmVydmlld1J1bGVyPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSwgc2tpcHMgcmVnaXN0ZXJpbmcgbGlzdGVuZXJzIG9uIGdsb2JhbCBzaW5nbGV0b24gc2VydmljZXNcblx0ICogKGNvbmZpZ3VyYXRpb24sIHRoZW1lLCBsb2cgbGV2ZWwpIHRvIGF2b2lkIGFjY3VtdWxhdGluZyBsaXN0ZW5lcnMgd2hlblxuXHQgKiBtYW55IGRldGFjaGVkIHRlcm1pbmFscyBhcmUgY3JlYXRlZCBjb25jdXJyZW50bHkuIFRoZSBjYWxsZXIgc2hvdWxkIHVzZVxuXHQgKiB7QGxpbmsgWHRlcm1UZXJtaW5hbC51cGRhdGVDb25maWd9LCB7QGxpbmsgWHRlcm1UZXJtaW5hbC51cGRhdGVUaGVtZX0sXG5cdCAqIGFuZCB7QGxpbmsgWHRlcm1UZXJtaW5hbC51cGRhdGVMb2dMZXZlbH0gdG8gYXBwbHkgdGhvc2UgY2hhbmdlcyBleHRlcm5hbGx5LlxuXHQgKi9cblx0ZGV0YWNoZWQ/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIFdyYXBzIHRoZSB4dGVybSBvYmplY3Qgd2l0aCBhZGRpdGlvbmFsIGZ1bmN0aW9uYWxpdHkuIEludGVyYWN0aW9uIHdpdGggdGhlIGJhY2tpbmcgcHJvY2VzcyBpcyBvdXRcbiAqIG9mIHRoZSBzY29wZSBvZiB0aGlzIGNsYXNzLlxuICovXG5leHBvcnQgY2xhc3MgWHRlcm1UZXJtaW5hbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJWHRlcm1UZXJtaW5hbCwgSURldGFjaGVkWHRlcm1UZXJtaW5hbCwgSUludGVybmFsWHRlcm1UZXJtaW5hbCB7XG5cdC8qKiBUaGUgcmF3IHh0ZXJtLmpzIGluc3RhbmNlICovXG5cdHJlYWRvbmx5IHJhdzogUmF3WHRlcm1UZXJtaW5hbDtcblx0cHJpdmF0ZSBfY29yZTogSVh0ZXJtQ29yZTtcblx0cHJpdmF0ZSByZWFkb25seSBfeHRlcm1BZGRvbkxvYWRlcjogWHRlcm1BZGRvbkltcG9ydGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF94dGVybUNvbG9yUHJvdmlkZXI6IElYdGVybUNvbG9yUHJvdmlkZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhcGFiaWxpdGllczogSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNhYmxlT3ZlcnZpZXdSdWxlcjogYm9vbGVhbjtcblxuXHRwcml2YXRlIHN0YXRpYyBfc3VnZ2VzdGVkUmVuZGVyZXJUeXBlOiAnZG9tJyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYXR0YWNoZWQ/OiB7IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7IG9wdGlvbnM6IElYdGVybUF0dGFjaFRvRWxlbWVudE9wdGlvbnMgfTtcblx0cHJpdmF0ZSBfaXNQaHlzaWNhbE1vdXNlV2hlZWwgPSBNb3VzZVdoZWVsQ2xhc3NpZmllci5JTlNUQU5DRS5pc1BoeXNpY2FsTW91c2VXaGVlbCgpO1xuXHRwcml2YXRlIF9sYXN0SW5wdXRFdmVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQgbGFzdElucHV0RXZlbnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2xhc3RJbnB1dEV2ZW50OyB9XG5cdHByaXZhdGUgX3Byb2dyZXNzU3RhdGU6IElQcm9ncmVzc1N0YXRlID0geyBzdGF0ZTogMCwgdmFsdWU6IDAgfTtcblx0Z2V0IHByb2dyZXNzU3RhdGUoKTogSVByb2dyZXNzU3RhdGUgeyByZXR1cm4gdGhpcy5fcHJvZ3Jlc3NTdGF0ZTsgfVxuXHRnZXQgYnVmZmVyKCkgeyByZXR1cm4gdGhpcy5yYXcuYnVmZmVyOyB9XG5cdGdldCBjb2xzKCkgeyByZXR1cm4gdGhpcy5yYXcuY29sczsgfVxuXG5cdC8vIEFsd2F5cyBvbiBhZGRvbnNcblx0cHJpdmF0ZSBfbWFya05hdmlnYXRpb25BZGRvbjogTWFya05hdmlnYXRpb25BZGRvbjtcblx0cHJpdmF0ZSBfc2hlbGxJbnRlZ3JhdGlvbkFkZG9uOiBTaGVsbEludGVncmF0aW9uQWRkb247XG5cdHByaXZhdGUgX2RlY29yYXRpb25BZGRvbjogRGVjb3JhdGlvbkFkZG9uO1xuXG5cdC8vIEFsd2F5cyBvbiBkeW5hbWljbHkgaW1wb3J0ZWQgYWRkb25zXG5cdHByaXZhdGUgX2NsaXBib2FyZEFkZG9uPzogQ2xpcGJvYXJkQWRkb25UeXBlO1xuXG5cdC8vIE9wdGlvbmFsIGFkZG9uc1xuXHRwcml2YXRlIF9zZWFyY2hBZGRvbj86IFNlYXJjaEFkZG9uVHlwZTtcblx0cHJpdmF0ZSBfdW5pY29kZTExQWRkb24/OiBVbmljb2RlMTFBZGRvblR5cGU7XG5cdHByaXZhdGUgX3dlYmdsQWRkb24/OiBXZWJnbEFkZG9uVHlwZTtcblx0cHJpdmF0ZSBfd2ViZ2xBZGRvbkN1c3RvbUdseXBocz86IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfc2VyaWFsaXplQWRkb24/OiBTZXJpYWxpemVBZGRvblR5cGU7XG5cdHByaXZhdGUgX2ltYWdlQWRkb24/OiBJbWFnZUFkZG9uVHlwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbGlnYXR1cmVzQWRkb246IE11dGFibGVEaXNwb3NhYmxlPExpZ2F0dXJlc0FkZG9uVHlwZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgX2xpZ2F0dXJlc0FkZG9uQ29uZmlnPzogSUxpZ2F0dXJlT3B0aW9ucztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hdHRhY2hlZERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYW55VGVybWluYWxGb2N1c0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hbnlGb2N1c2VkVGVybWluYWxIYXNTZWxlY3Rpb246IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgX2xhc3RGaW5kUmVzdWx0OiB7IHJlc3VsdEluZGV4OiBudW1iZXI7IHJlc3VsdENvdW50OiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0Z2V0IGZpbmRSZXN1bHQoKTogeyByZXN1bHRJbmRleDogbnVtYmVyOyByZXN1bHRDb3VudDogbnVtYmVyIH0gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fbGFzdEZpbmRSZXN1bHQ7IH1cblxuXHRnZXQgaXNTdGRpbkRpc2FibGVkKCk6IGJvb2xlYW4geyByZXR1cm4gISF0aGlzLnJhdy5vcHRpb25zLmRpc2FibGVTdGRpbjsgfVxuXHRnZXQgaXNHcHVBY2NlbGVyYXRlZCgpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy5fd2ViZ2xBZGRvbjsgfVxuXHRnZXQgaXNJbWFnZUFkZG9uTG9hZGVkKCk6IGJvb2xlYW4geyByZXR1cm4gISF0aGlzLl9pbWFnZUFkZG9uOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0UnVuQ29tbWFuZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgY29tbWFuZDogSVRlcm1pbmFsQ29tbWFuZDsgbm9OZXdMaW5lPzogYm9vbGVhbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0UnVuQ29tbWFuZCA9IHRoaXMuX29uRGlkUmVxdWVzdFJ1bkNvbW1hbmQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdENvcHlBc0h0bWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdENvcHlBc0h0bWwgPSB0aGlzLl9vbkRpZFJlcXVlc3RDb3B5QXNIdG1sLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RSZWZyZXNoRGltZW5zaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RSZWZyZXNoRGltZW5zaW9ucyA9IHRoaXMuX29uRGlkUmVxdWVzdFJlZnJlc2hEaW1lbnNpb25zLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUZpbmRSZXN1bHRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZXN1bHRJbmRleDogbnVtYmVyOyByZXN1bHRDb3VudDogbnVtYmVyIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbmRSZXN1bHRzID0gdGhpcy5fb25EaWRDaGFuZ2VGaW5kUmVzdWx0cy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25CZWZvcmVTZWFyY2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25CZWZvcmVTZWFyY2ggPSB0aGlzLl9vbkJlZm9yZVNlYXJjaC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25BZnRlclNlYXJjaCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkFmdGVyU2VhcmNoID0gdGhpcy5fb25BZnRlclNlYXJjaC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZWxlY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZWxlY3Rpb24gPSB0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VGb2N1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZvY3VzID0gdGhpcy5fb25EaWRDaGFuZ2VGb2N1cy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzcG9zZSA9IHRoaXMuX29uRGlkRGlzcG9zZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQcm9ncmVzcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQcm9ncmVzc1N0YXRlPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcm9ncmVzcyA9IHRoaXMuX29uRGlkQ2hhbmdlUHJvZ3Jlc3MuZXZlbnQ7XG5cblx0Z2V0IG1hcmtUcmFja2VyKCk6IElNYXJrVHJhY2tlciB7IHJldHVybiB0aGlzLl9tYXJrTmF2aWdhdGlvbkFkZG9uOyB9XG5cdGdldCBzaGVsbEludGVncmF0aW9uKCk6IElTaGVsbEludGVncmF0aW9uIHsgcmV0dXJuIHRoaXMuX3NoZWxsSW50ZWdyYXRpb25BZGRvbjsgfVxuXHRnZXQgZGVjb3JhdGlvbkFkZG9uKCk6IElEZWNvcmF0aW9uQWRkb24geyByZXR1cm4gdGhpcy5fZGVjb3JhdGlvbkFkZG9uOyB9XG5cblx0Z2V0IHRleHR1cmVBdGxhcygpOiBQcm9taXNlPEltYWdlQml0bWFwPiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2FudmFzID0gdGhpcy5fd2ViZ2xBZGRvbj8udGV4dHVyZUF0bGFzO1xuXHRcdGlmICghY2FudmFzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gY3JlYXRlSW1hZ2VCaXRtYXAoY2FudmFzKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNGb2N1c2VkKCkge1xuXHRcdGlmICghdGhpcy5yYXcuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gZG9tLmlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQodGhpcy5yYXcuZWxlbWVudCk7XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIHh0ZXJtQ3RvciBUaGUgeHRlcm0uanMgY29uc3RydWN0b3IsIHRoaXMgaXMgcGFzc2VkIGluIHNvIGl0IGNhbiBiZSBmZXRjaGVkIGxhemlseVxuXHQgKiBvdXRzaWRlIG9mIHRoaXMgY2xhc3Mgc3VjaCB0aGF0IHtAbGluayByYXd9IGlzIG5vdCBudWxsYWJsZS5cblx0ICovXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0eHRlcm1DdG9yOiB0eXBlb2YgUmF3WHRlcm1UZXJtaW5hbCxcblx0XHRvcHRpb25zOiBJWHRlcm1UZXJtaW5hbE9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFeGVjdXRlVGV4dDogRXZlbnQ8dm9pZD4gfCB1bmRlZmluZWQsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJVGVybWluYWxMb2dTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSxcblx0XHRASUxheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSUxheW91dFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3h0ZXJtQWRkb25Mb2FkZXIgPSBvcHRpb25zLnh0ZXJtQWRkb25JbXBvcnRlciA/PyBuZXcgWHRlcm1BZGRvbkltcG9ydGVyKCk7XG5cdFx0dGhpcy5feHRlcm1Db2xvclByb3ZpZGVyID0gb3B0aW9ucy54dGVybUNvbG9yUHJvdmlkZXI7XG5cdFx0dGhpcy5fY2FwYWJpbGl0aWVzID0gb3B0aW9ucy5jYXBhYmlsaXRpZXM7XG5cdFx0dGhpcy5fZGlzYWJsZU92ZXJ2aWV3UnVsZXIgPSBvcHRpb25zLmRpc2FibGVPdmVydmlld1J1bGVyID8/IGZhbHNlO1xuXG5cdFx0Y29uc3QgZm9udCA9IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Rm9udChkb20uZ2V0QWN0aXZlV2luZG93KCksIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWc7XG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9ucyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElFZGl0b3JPcHRpb25zPignZWRpdG9yJyk7XG5cblx0XHR0aGlzLnJhdyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyB4dGVybUN0b3Ioe1xuXHRcdFx0YWxsb3dQcm9wb3NlZEFwaTogdHJ1ZSxcblx0XHRcdGNvbHM6IG9wdGlvbnMuY29scyxcblx0XHRcdHJvd3M6IG9wdGlvbnMucm93cyxcblx0XHRcdGRvY3VtZW50T3ZlcnJpZGU6IGxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lci5vd25lckRvY3VtZW50LFxuXHRcdFx0YWx0Q2xpY2tNb3Zlc0N1cnNvcjogY29uZmlnLmFsdENsaWNrTW92ZXNDdXJzb3IgJiYgZWRpdG9yT3B0aW9ucy5tdWx0aUN1cnNvck1vZGlmaWVyID09PSAnYWx0Jyxcblx0XHRcdHNjcm9sbGJhY2s6IGNvbmZpZy5zY3JvbGxiYWNrLFxuXHRcdFx0dGhlbWU6IHRoaXMuZ2V0WHRlcm1UaGVtZSgpLFxuXHRcdFx0ZHJhd0JvbGRUZXh0SW5CcmlnaHRDb2xvcnM6IGNvbmZpZy5kcmF3Qm9sZFRleHRJbkJyaWdodENvbG9ycyxcblx0XHRcdGZvbnRGYW1pbHk6IGZvbnQuZm9udEZhbWlseSxcblx0XHRcdGZvbnRXZWlnaHQ6IGNvbmZpZy5mb250V2VpZ2h0LFxuXHRcdFx0Zm9udFdlaWdodEJvbGQ6IGNvbmZpZy5mb250V2VpZ2h0Qm9sZCxcblx0XHRcdGZvbnRTaXplOiBmb250LmZvbnRTaXplLFxuXHRcdFx0bGV0dGVyU3BhY2luZzogZm9udC5sZXR0ZXJTcGFjaW5nLFxuXHRcdFx0bGluZUhlaWdodDogZm9udC5saW5lSGVpZ2h0LFxuXHRcdFx0bG9nTGV2ZWw6IHZzY29kZVRvWHRlcm1Mb2dMZXZlbCh0aGlzLl9sb2dTZXJ2aWNlLmdldExldmVsKCkpLFxuXHRcdFx0bG9nZ2VyOiB0aGlzLl9sb2dTZXJ2aWNlLFxuXHRcdFx0bWluaW11bUNvbnRyYXN0UmF0aW86IGNvbmZpZy5taW5pbXVtQ29udHJhc3RSYXRpbyxcblx0XHRcdHRhYlN0b3BXaWR0aDogY29uZmlnLnRhYlN0b3BXaWR0aCxcblx0XHRcdGN1cnNvckJsaW5rOiBjb25maWcuY3Vyc29yQmxpbmtpbmcsXG5cdFx0XHRibGlua0ludGVydmFsRHVyYXRpb246IGNvbmZpZy50ZXh0QmxpbmtpbmcgPyBUZXh0QmxpbmtDb25zdGFudHMuSW50ZXJ2YWxEdXJhdGlvbiA6IDAsXG5cdFx0XHRjdXJzb3JTdHlsZTogdnNjb2RlVG9YdGVybUN1cnNvclN0eWxlPCdjdXJzb3JTdHlsZSc+KGNvbmZpZy5jdXJzb3JTdHlsZSksXG5cdFx0XHRjdXJzb3JJbmFjdGl2ZVN0eWxlOiB2c2NvZGVUb1h0ZXJtQ3Vyc29yU3R5bGUoY29uZmlnLmN1cnNvclN0eWxlSW5hY3RpdmUpLFxuXHRcdFx0Y3Vyc29yV2lkdGg6IGNvbmZpZy5jdXJzb3JXaWR0aCxcblx0XHRcdG1hY09wdGlvbklzTWV0YTogY29uZmlnLm1hY09wdGlvbklzTWV0YSxcblx0XHRcdG1hY09wdGlvbkNsaWNrRm9yY2VzU2VsZWN0aW9uOiBjb25maWcubWFjT3B0aW9uQ2xpY2tGb3JjZXNTZWxlY3Rpb24sXG5cdFx0XHRyaWdodENsaWNrU2VsZWN0c1dvcmQ6IGNvbmZpZy5yaWdodENsaWNrQmVoYXZpb3IgPT09ICdzZWxlY3RXb3JkJyxcblx0XHRcdGZhc3RTY3JvbGxTZW5zaXRpdml0eTogY29uZmlnLmZhc3RTY3JvbGxTZW5zaXRpdml0eSxcblx0XHRcdHNjcm9sbFNlbnNpdGl2aXR5OiBjb25maWcubW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5LFxuXHRcdFx0c2Nyb2xsT25FcmFzZUluRGlzcGxheTogdHJ1ZSxcblx0XHRcdHdvcmRTZXBhcmF0b3I6IGNvbmZpZy53b3JkU2VwYXJhdG9ycyxcblx0XHRcdHNjcm9sbGJhcjogdGhpcy5fZ2V0U2Nyb2xsYmFyT3B0aW9ucygpLFxuXHRcdFx0aWdub3JlQnJhY2tldGVkUGFzdGVNb2RlOiBjb25maWcuaWdub3JlQnJhY2tldGVkUGFzdGVNb2RlLFxuXHRcdFx0cmVzY2FsZU92ZXJsYXBwaW5nR2x5cGhzOiBjb25maWcucmVzY2FsZU92ZXJsYXBwaW5nR2x5cGhzLFxuXHRcdFx0dnRFeHRlbnNpb25zOiB7XG5cdFx0XHRcdGtpdHR5S2V5Ym9hcmQ6IGNvbmZpZy5lbmFibGVLaXR0eUtleWJvYXJkUHJvdG9jb2wsXG5cdFx0XHRcdHdpbjMySW5wdXRNb2RlOiBjb25maWcuZW5hYmxlV2luMzJJbnB1dE1vZGUsXG5cdFx0XHR9LFxuXHRcdFx0YWxsb3dUcmFuc3BhcmVuY3k6IGNvbmZpZy5lbmFibGVJbWFnZXMsXG5cdFx0XHR3aW5kb3dPcHRpb25zOiB7XG5cdFx0XHRcdGdldFdpblNpemVQaXhlbHM6IHRydWUsXG5cdFx0XHRcdGdldENlbGxTaXplUGl4ZWxzOiB0cnVlLFxuXHRcdFx0XHRnZXRXaW5TaXplQ2hhcnM6IHRydWUsXG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHR0aGlzLl91cGRhdGVTbW9vdGhTY3JvbGxpbmcoKTtcblx0XHRpbnRlcmZhY2UgSVRlcm1pbmFsV2l0aENvcmUgZXh0ZW5kcyBSYXdYdGVybVRlcm1pbmFsIHtcblx0XHRcdF9jb3JlOiBJWHRlcm1Db3JlO1xuXHRcdH1cblx0XHR0aGlzLl9jb3JlID0gKHRoaXMucmF3IGFzIElUZXJtaW5hbFdpdGhDb3JlKS5fY29yZSBhcyBJWHRlcm1Db3JlO1xuXG5cdFx0Ly8gU2tpcCBnbG9iYWwgc2VydmljZSBsaXN0ZW5lcnMgZm9yIGRldGFjaGVkIHRlcm1pbmFscyB0byBhdm9pZFxuXHRcdC8vIGFjY3VtdWxhdGluZyBsaXN0ZW5lcnMgd2hlbiBtYW55IGRldGFjaGVkIGluc3RhbmNlcyBleGlzdCBjb25jdXJyZW50bHkuXG5cdFx0aWYgKCFvcHRpb25zLmRldGFjaGVkKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oYXN5bmMgZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsU2V0dGluZ0lkLkdwdUFjY2VsZXJhdGlvbikpIHtcblx0XHRcdFx0XHRYdGVybVRlcm1pbmFsLl9zdWdnZXN0ZWRSZW5kZXJlclR5cGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3Rlcm1pbmFsLmludGVncmF0ZWQnKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IuZmFzdFNjcm9sbFNlbnNpdGl2aXR5JykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLm1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eScpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5tdWx0aUN1cnNvck1vZGlmaWVyJykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5NT0RFUk5fVUkpKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVDb25maWcoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbFNldHRpbmdJZC5Vbmljb2RlVmVyc2lvbikpIHtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVVbmljb2RlVmVyc2lvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsU2V0dGluZ0lkLlNoZWxsSW50ZWdyYXRpb25EZWNvcmF0aW9uc0VuYWJsZWQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlVGhlbWUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKHRoZW1lID0+IHRoaXMuX3VwZGF0ZVRoZW1lKHRoZW1lKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbG9nU2VydmljZS5vbkRpZENoYW5nZUxvZ0xldmVsKGUgPT4gdGhpcy5yYXcub3B0aW9ucy5sb2dMZXZlbCA9IHZzY29kZVRvWHRlcm1Mb2dMZXZlbChlKSkpO1xuXHRcdH1cblxuXHRcdC8vIFJlZmlyZSBldmVudHNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJhdy5vblNlbGVjdGlvbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKCk7XG5cdFx0XHRpZiAodGhpcy5pc0ZvY3VzZWQpIHtcblx0XHRcdFx0dGhpcy5fYW55Rm9jdXNlZFRlcm1pbmFsSGFzU2VsZWN0aW9uLnNldCh0aGlzLnJhdy5oYXNTZWxlY3Rpb24oKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmF3Lm9uRGF0YShlID0+IHRoaXMuX2xhc3RJbnB1dEV2ZW50ID0gZSkpO1xuXG5cdFx0Ly8gTG9hZCBhZGRvbnNcblx0XHR0aGlzLl91cGRhdGVVbmljb2RlVmVyc2lvbigpO1xuXHRcdHRoaXMuX21hcmtOYXZpZ2F0aW9uQWRkb24gPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYXJrTmF2aWdhdGlvbkFkZG9uLCBvcHRpb25zLmNhcGFiaWxpdGllcyk7XG5cdFx0dGhpcy5yYXcubG9hZEFkZG9uKHRoaXMuX21hcmtOYXZpZ2F0aW9uQWRkb24pO1xuXHRcdHRoaXMuX2RlY29yYXRpb25BZGRvbiA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlY29yYXRpb25BZGRvbiwgcmVzb3VyY2UsIHRoaXMuX2NhcGFiaWxpdGllcyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZGVjb3JhdGlvbkFkZG9uLm9uRGlkUmVxdWVzdFJ1bkNvbW1hbmQoZSA9PiB0aGlzLl9vbkRpZFJlcXVlc3RSdW5Db21tYW5kLmZpcmUoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kZWNvcmF0aW9uQWRkb24ub25EaWRSZXF1ZXN0Q29weUFzSHRtbChlID0+IHRoaXMuX29uRGlkUmVxdWVzdENvcHlBc0h0bWwuZmlyZShlKSkpO1xuXHRcdHRoaXMucmF3LmxvYWRBZGRvbih0aGlzLl9kZWNvcmF0aW9uQWRkb24pO1xuXHRcdHRoaXMuX3NoZWxsSW50ZWdyYXRpb25BZGRvbiA9IG5ldyBTaGVsbEludGVncmF0aW9uQWRkb24ob3B0aW9ucy5zaGVsbEludGVncmF0aW9uTm9uY2UgPz8gJycsIG9wdGlvbnMuZGlzYWJsZVNoZWxsSW50ZWdyYXRpb25SZXBvcnRpbmcsIHRoaXMuX29uRGlkRXhlY3V0ZVRleHQsIHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXHRcdHRoaXMucmF3LmxvYWRBZGRvbih0aGlzLl9zaGVsbEludGVncmF0aW9uQWRkb24pO1xuXHRcdHRoaXMuX3h0ZXJtQWRkb25Mb2FkZXIuaW1wb3J0QWRkb24oJ2NsaXBib2FyZCcpLnRoZW4oQ2xpcGJvYXJkQWRkb24gPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY2xpcGJvYXJkQWRkb24gPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGlwYm9hcmRBZGRvbiwgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdGFzeW5jIHJlYWRUZXh0KHR5cGU6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0XHRcdFx0cmV0dXJuIF9jbGlwYm9hcmRTZXJ2aWNlLnJlYWRUZXh0KHR5cGUgPT09ICdwJyA/ICdzZWxlY3Rpb24nIDogJ2NsaXBib2FyZCcpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRhc3luYyB3cml0ZVRleHQodHlwZTogc3RyaW5nLCB0ZXh0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRyZXR1cm4gX2NsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHRleHQsIHR5cGUgPT09ICdwJyA/ICdzZWxlY3Rpb24nIDogJ2NsaXBib2FyZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMucmF3LmxvYWRBZGRvbih0aGlzLl9jbGlwYm9hcmRBZGRvbik7XG5cdFx0fSk7XG5cdFx0dGhpcy5feHRlcm1BZGRvbkxvYWRlci5pbXBvcnRBZGRvbigncHJvZ3Jlc3MnKS50aGVuKFByb2dyZXNzQWRkb24gPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcHJvZ3Jlc3NBZGRvbiA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb2dyZXNzQWRkb24pO1xuXHRcdFx0dGhpcy5yYXcubG9hZEFkZG9uKHByb2dyZXNzQWRkb24pO1xuXHRcdFx0Y29uc3QgdXBkYXRlUHJvZ3Jlc3MgPSAoKSA9PiB7XG5cdFx0XHRcdGlmICghZXF1YWxzKHRoaXMuX3Byb2dyZXNzU3RhdGUsIHByb2dyZXNzQWRkb24ucHJvZ3Jlc3MpKSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJvZ3Jlc3NTdGF0ZSA9IHByb2dyZXNzQWRkb24ucHJvZ3Jlc3M7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9ncmVzcy5maXJlKHRoaXMuX3Byb2dyZXNzU3RhdGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocHJvZ3Jlc3NBZGRvbi5vbkNoYW5nZSgoKSA9PiB1cGRhdGVQcm9ncmVzcygpKSk7XG5cdFx0XHR1cGRhdGVQcm9ncmVzcygpO1xuXHRcdFx0Y29uc3QgY29tbWFuZERldGVjdGlvbiA9IHRoaXMuX2NhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pO1xuXHRcdFx0aWYgKGNvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoY29tbWFuZERldGVjdGlvbi5vbkNvbW1hbmRGaW5pc2hlZCgoKSA9PiBwcm9ncmVzc0FkZG9uLnByb2dyZXNzID0geyBzdGF0ZTogMCwgdmFsdWU6IDAgfSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuX2NhcGFiaWxpdGllcy5vbkRpZEFkZENhcGFiaWxpdHkoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUuaWQgPT09IFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZWdpc3RlcigoZS5jYXBhYmlsaXR5IGFzIENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5KS5vbkNvbW1hbmRGaW5pc2hlZCgoKSA9PiBwcm9ncmVzc0FkZG9uLnByb2dyZXNzID0geyBzdGF0ZTogMCwgdmFsdWU6IDAgfSkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fc3RvcmUuZGVsZXRlKGRpc3Bvc2FibGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX3N0b3JlLmFkZChkaXNwb3NhYmxlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX2FueVRlcm1pbmFsRm9jdXNDb250ZXh0S2V5ID0gVGVybWluYWxDb250ZXh0S2V5cy5mb2N1c0luQW55LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fYW55Rm9jdXNlZFRlcm1pbmFsSGFzU2VsZWN0aW9uID0gVGVybWluYWxDb250ZXh0S2V5cy50ZXh0U2VsZWN0ZWRJbkZvY3VzZWQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdCpnZXRCdWZmZXJSZXZlcnNlSXRlcmF0b3IoKTogSXRlcmFibGVJdGVyYXRvcjxzdHJpbmc+IHtcblx0XHRmb3IgKGxldCBpID0gdGhpcy5yYXcuYnVmZmVyLmFjdGl2ZS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgeyBsaW5lRGF0YSwgbGluZUluZGV4IH0gPSBnZXRGdWxsQnVmZmVyTGluZUFzU3RyaW5nKGksIHRoaXMucmF3LmJ1ZmZlci5hY3RpdmUpO1xuXHRcdFx0aWYgKGxpbmVEYXRhKSB7XG5cdFx0XHRcdGkgPSBsaW5lSW5kZXg7XG5cdFx0XHRcdHlpZWxkIGxpbmVEYXRhO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldENvbnRlbnRzQXNUZXh0KHN0YXJ0TWFya2VyPzogSVh0ZXJtTWFya2VyLCBlbmRNYXJrZXI/OiBJWHRlcm1NYXJrZXIpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMucmF3LmJ1ZmZlci5hY3RpdmU7XG5cdFx0aWYgKGVuZE1hcmtlcj8ubGluZSA9PT0gLTEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IGdldCBjb250ZW50cyBvZiBhIGRpc3Bvc2VkIGVuZE1hcmtlcicpO1xuXHRcdH1cblx0XHQvLyBXaGVuIHRoZSBzdGFydCBtYXJrZXIgaXMgZGlzcG9zZWQgKHNjcm9sbGVkIG91dCBvZiB0aGUgYnVmZmVyIGR1ZSB0b1xuXHRcdC8vIHNjcm9sbGJhY2sgbGltaXRzKSwgZmFsbCBiYWNrIHRvIGxpbmUgMCB0byByZXR1cm4gd2hhdGV2ZXIgcmVtYWlucyBpblxuXHRcdC8vIHRoZSBidWZmZXIgcmF0aGVyIHRoYW4gbG9zaW5nIGFsbCBvdXRwdXQuXG5cdFx0Y29uc3Qgc3RhcnRMaW5lID0gKHN0YXJ0TWFya2VyID09PSB1bmRlZmluZWQgfHwgc3RhcnRNYXJrZXIubGluZSA9PT0gLTEpID8gMCA6IHN0YXJ0TWFya2VyLmxpbmU7XG5cdFx0Y29uc3QgZW5kTGluZSA9IGVuZE1hcmtlcj8ubGluZSA/PyBidWZmZXIubGVuZ3RoIC0gMTtcblx0XHRmb3IgKGxldCB5ID0gc3RhcnRMaW5lOyB5IDw9IGVuZExpbmU7IHkrKykge1xuXHRcdFx0bGluZXMucHVzaChidWZmZXIuZ2V0TGluZSh5KT8udHJhbnNsYXRlVG9TdHJpbmcodHJ1ZSkgPz8gJycpO1xuXHRcdH1cblx0XHRyZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG5cdH1cblxuXHRhc3luYyBnZXRDb250ZW50c0FzSHRtbCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmICghdGhpcy5fc2VyaWFsaXplQWRkb24pIHtcblx0XHRcdGNvbnN0IEFkZG9uID0gYXdhaXQgdGhpcy5feHRlcm1BZGRvbkxvYWRlci5pbXBvcnRBZGRvbignc2VyaWFsaXplJyk7XG5cdFx0XHR0aGlzLl9zZXJpYWxpemVBZGRvbiA9IG5ldyBBZGRvbigpO1xuXHRcdFx0dGhpcy5yYXcubG9hZEFkZG9uKHRoaXMuX3NlcmlhbGl6ZUFkZG9uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fc2VyaWFsaXplQWRkb24uc2VyaWFsaXplQXNIVE1MKCk7XG5cdH1cblxuXHRhc3luYyBnZXRDb21tYW5kT3V0cHV0QXNIdG1sKGNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQsIG1heExpbmVzOiBudW1iZXIpOiBQcm9taXNlPHsgdGV4dDogc3RyaW5nOyB0cnVuY2F0ZWQ/OiBib29sZWFuIH0+IHtcblx0XHRpZiAoIXRoaXMuX3NlcmlhbGl6ZUFkZG9uKSB7XG5cdFx0XHRjb25zdCBBZGRvbiA9IGF3YWl0IHRoaXMuX3h0ZXJtQWRkb25Mb2FkZXIuaW1wb3J0QWRkb24oJ3NlcmlhbGl6ZScpO1xuXHRcdFx0dGhpcy5fc2VyaWFsaXplQWRkb24gPSBuZXcgQWRkb24oKTtcblx0XHRcdHRoaXMucmF3LmxvYWRBZGRvbih0aGlzLl9zZXJpYWxpemVBZGRvbik7XG5cdFx0fVxuXHRcdGxldCBzdGFydExpbmU6IG51bWJlcjtcblx0XHRsZXQgc3RhcnRDb2w6IG51bWJlcjtcblx0XHRpZiAoY29tbWFuZC5leGVjdXRlZE1hcmtlciAmJiBjb21tYW5kLmV4ZWN1dGVkTWFya2VyLmxpbmUgPj0gMCkge1xuXHRcdFx0c3RhcnRMaW5lID0gY29tbWFuZC5leGVjdXRlZE1hcmtlci5saW5lO1xuXHRcdFx0c3RhcnRDb2wgPSBNYXRoLm1heChjb21tYW5kLmV4ZWN1dGVkWCA/PyAwLCAwKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3RhcnRMaW5lID0gY29tbWFuZC5tYXJrZXI/LmxpbmUgIT09IHVuZGVmaW5lZCA/IGNvbW1hbmQubWFya2VyLmxpbmUgKyAxIDogMTtcblx0XHRcdHN0YXJ0Q29sID0gTWF0aC5tYXgoY29tbWFuZC5zdGFydFggPz8gMCwgMCk7XG5cdFx0fVxuXG5cdFx0bGV0IGVuZExpbmUgPSBjb21tYW5kLmVuZE1hcmtlcj8ubGluZSAhPT0gdW5kZWZpbmVkID8gY29tbWFuZC5lbmRNYXJrZXIubGluZSAtIDEgOiB0aGlzLnJhdy5idWZmZXIuYWN0aXZlLmxlbmd0aCAtIDE7XG5cdFx0aWYgKGVuZExpbmUgPCBzdGFydExpbmUpIHtcblx0XHRcdHJldHVybiB7IHRleHQ6ICcnLCB0cnVuY2F0ZWQ6IGZhbHNlIH07XG5cdFx0fVxuXHRcdC8vIFRyaW0gZW1wdHkgbGluZXMgZnJvbSB0aGUgZW5kXG5cdFx0bGV0IGVtcHR5TGluZXNGcm9tRW5kID0gMDtcblx0XHRmb3IgKGxldCBpID0gZW5kTGluZTsgaSA+PSBzdGFydExpbmU7IGktLSkge1xuXHRcdFx0Y29uc3QgbGluZSA9IHRoaXMucmF3LmJ1ZmZlci5hY3RpdmUuZ2V0TGluZShpKTtcblx0XHRcdGlmIChsaW5lICYmIGxpbmUudHJhbnNsYXRlVG9TdHJpbmcodHJ1ZSkudHJpbSgpID09PSAnJykge1xuXHRcdFx0XHRlbXB0eUxpbmVzRnJvbUVuZCsrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGVuZExpbmUgPSBlbmRMaW5lIC0gZW1wdHlMaW5lc0Zyb21FbmQ7XG5cblx0XHQvLyBUcmltIGVtcHR5IGxpbmVzIGZyb20gdGhlIHN0YXJ0XG5cdFx0bGV0IGVtcHR5TGluZXNGcm9tU3RhcnQgPSAwO1xuXHRcdGZvciAobGV0IGkgPSBzdGFydExpbmU7IGkgPD0gZW5kTGluZTsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gdGhpcy5yYXcuYnVmZmVyLmFjdGl2ZS5nZXRMaW5lKGkpO1xuXHRcdFx0aWYgKGxpbmUgJiYgbGluZS50cmFuc2xhdGVUb1N0cmluZyh0cnVlLCBpID09PSBzdGFydExpbmUgPyBzdGFydENvbCA6IHVuZGVmaW5lZCkudHJpbSgpID09PSAnJykge1xuXHRcdFx0XHRpZiAoaSA9PT0gc3RhcnRMaW5lKSB7XG5cdFx0XHRcdFx0c3RhcnRDb2wgPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVtcHR5TGluZXNGcm9tU3RhcnQrKztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRzdGFydExpbmUgPSBzdGFydExpbmUgKyBlbXB0eUxpbmVzRnJvbVN0YXJ0O1xuXG5cdFx0aWYgKG1heExpbmVzICYmIGVuZExpbmUgLSBzdGFydExpbmUgPiBtYXhMaW5lcykge1xuXHRcdFx0c3RhcnRMaW5lID0gZW5kTGluZSAtIG1heExpbmVzO1xuXHRcdFx0c3RhcnRDb2wgPSAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJ1ZmZlckxpbmUgPSB0aGlzLnJhdy5idWZmZXIuYWN0aXZlLmdldExpbmUoc3RhcnRMaW5lKTtcblx0XHRpZiAoYnVmZmVyTGluZSkge1xuXHRcdFx0c3RhcnRDb2wgPSBNYXRoLm1pbihzdGFydENvbCwgYnVmZmVyTGluZS5sZW5ndGgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhbmdlID0geyBzdGFydExpbmUsIGVuZExpbmUsIHN0YXJ0Q29sIH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fc2VyaWFsaXplQWRkb24uc2VyaWFsaXplQXNIVE1MKHsgcmFuZ2UgfSk7XG5cdFx0cmV0dXJuIHsgdGV4dDogcmVzdWx0LCB0cnVuY2F0ZWQ6IChlbmRMaW5lIC0gc3RhcnRMaW5lKSA+PSBtYXhMaW5lcyB9O1xuXHR9XG5cblx0YXN5bmMgZ2V0U2VsZWN0aW9uQXNIdG1sKGNvbW1hbmQ/OiBJVGVybWluYWxDb21tYW5kKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRpZiAoIXRoaXMuX3NlcmlhbGl6ZUFkZG9uKSB7XG5cdFx0XHRjb25zdCBBZGRvbiA9IGF3YWl0IHRoaXMuX3h0ZXJtQWRkb25Mb2FkZXIuaW1wb3J0QWRkb24oJ3NlcmlhbGl6ZScpO1xuXHRcdFx0dGhpcy5fc2VyaWFsaXplQWRkb24gPSBuZXcgQWRkb24oKTtcblx0XHRcdHRoaXMucmF3LmxvYWRBZGRvbih0aGlzLl9zZXJpYWxpemVBZGRvbik7XG5cdFx0fVxuXHRcdGlmIChjb21tYW5kKSB7XG5cdFx0XHRjb25zdCBsZW5ndGggPSBjb21tYW5kLmdldE91dHB1dCgpPy5sZW5ndGg7XG5cdFx0XHRjb25zdCByb3cgPSBjb21tYW5kLm1hcmtlcj8ubGluZTtcblx0XHRcdGlmICghbGVuZ3RoIHx8ICFyb3cpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyByb3cgJHtyb3d9IG9yIG91dHB1dCBsZW5ndGggJHtsZW5ndGh9IGZvciBjb21tYW5kICR7Y29tbWFuZH1gKTtcblx0XHRcdH1cblx0XHRcdHRoaXMucmF3LnNlbGVjdCgwLCByb3cgKyAxLCBsZW5ndGggLSBNYXRoLmZsb29yKGxlbmd0aCAvIHRoaXMucmF3LmNvbHMpKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fc2VyaWFsaXplQWRkb24uc2VyaWFsaXplQXNIVE1MKHsgb25seVNlbGVjdGlvbjogdHJ1ZSB9KTtcblx0XHRpZiAoY29tbWFuZCkge1xuXHRcdFx0dGhpcy5yYXcuY2xlYXJTZWxlY3Rpb24oKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGF0dGFjaFRvRWxlbWVudChjb250YWluZXI6IEhUTUxFbGVtZW50LCBwYXJ0aWFsT3B0aW9ucz86IFBhcnRpYWw8SVh0ZXJtQXR0YWNoVG9FbGVtZW50T3B0aW9ucz4pOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3Qgb3B0aW9uczogSVh0ZXJtQXR0YWNoVG9FbGVtZW50T3B0aW9ucyA9IHsgZW5hYmxlR3B1OiB0cnVlLCAuLi5wYXJ0aWFsT3B0aW9ucyB9O1xuXHRcdGlmICghdGhpcy5fYXR0YWNoZWQpIHtcblx0XHRcdHRoaXMucmF3Lm9wZW4oY29udGFpbmVyKTtcblx0XHR9XG5cblx0XHQvLyBUT0RPOiBNb3ZlIGJlZm9yZSBvcGVuIHNvIHRoZSBET00gcmVuZGVyZXIgZG9lc24ndCBpbml0aWFsaXplXG5cdFx0aWYgKG9wdGlvbnMuZW5hYmxlR3B1KSB7XG5cdFx0XHRpZiAodGhpcy5fc2hvdWxkTG9hZFdlYmdsKCkpIHtcblx0XHRcdFx0dGhpcy5fZW5hYmxlV2ViZ2xSZW5kZXJlcigpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5yYXcuZWxlbWVudCB8fCAhdGhpcy5yYXcudGV4dGFyZWEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcigneHRlcm0gZWxlbWVudHMgbm90IHNldCBhZnRlciBvcGVuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWQgPSB0aGlzLl9hdHRhY2hlZERpc3Bvc2FibGVzO1xuXHRcdGFkLmNsZWFyKCk7XG5cdFx0YWQuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5yYXcudGV4dGFyZWEsICdmb2N1cycsICgpID0+IHRoaXMuX3NldEZvY3VzZWQodHJ1ZSkpKTtcblx0XHRhZC5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnJhdy50ZXh0YXJlYSwgJ2JsdXInLCAoKSA9PiB0aGlzLl9zZXRGb2N1c2VkKGZhbHNlKSkpO1xuXHRcdGFkLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMucmF3LnRleHRhcmVhLCAnZm9jdXNvdXQnLCAoKSA9PiB0aGlzLl9zZXRGb2N1c2VkKGZhbHNlKSkpO1xuXG5cdFx0Ly8gVHJhY2sgd2hlZWwgZXZlbnRzIGluIG1vdXNlIHdoZWVsIGNsYXNzaWZpZXIgYW5kIHVwZGF0ZSBzbW9vdGhTY3JvbGxpbmcgd2hlbiBpdCBjaGFuZ2VzXG5cdFx0Ly8gYXMgaXQgbXVzdCBiZSBkaXNhYmxlZCB3aGVuIGEgdHJhY2twYWQgaXMgdXNlZFxuXHRcdGFkLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMucmF3LmVsZW1lbnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfV0hFRUwsIChlOiBJTW91c2VXaGVlbEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBjbGFzc2lmaWVyID0gTW91c2VXaGVlbENsYXNzaWZpZXIuSU5TVEFOQ0U7XG5cdFx0XHRjbGFzc2lmaWVyLmFjY2VwdFN0YW5kYXJkV2hlZWxFdmVudChuZXcgU3RhbmRhcmRXaGVlbEV2ZW50KGUpKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gY2xhc3NpZmllci5pc1BoeXNpY2FsTW91c2VXaGVlbCgpO1xuXHRcdFx0aWYgKHZhbHVlICE9PSB0aGlzLl9pc1BoeXNpY2FsTW91c2VXaGVlbCkge1xuXHRcdFx0XHR0aGlzLl9pc1BoeXNpY2FsTW91c2VXaGVlbCA9IHZhbHVlO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVTbW9vdGhTY3JvbGxpbmcoKTtcblx0XHRcdH1cblx0XHR9LCB7IHBhc3NpdmU6IHRydWUgfSkpO1xuXG5cdFx0dGhpcy5fcmVmcmVzaExpZ2F0dXJlc0FkZG9uKCk7XG5cblx0XHR0aGlzLl9hdHRhY2hlZCA9IHsgY29udGFpbmVyLCBvcHRpb25zIH07XG5cdFx0Ly8gU2NyZWVuIG11c3QgYmUgY3JlYXRlZCBhdCB0aGlzIHBvaW50IGFzIHh0ZXJtLm9wZW4gaXMgY2FsbGVkXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0cmV0dXJuIHRoaXMuX2F0dGFjaGVkPy5jb250YWluZXIucXVlcnlTZWxlY3RvcignLnh0ZXJtLXNjcmVlbicpITtcblx0fVxuXG5cdHByaXZhdGUgX3NldEZvY3VzZWQoaXNGb2N1c2VkOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VGb2N1cy5maXJlKGlzRm9jdXNlZCk7XG5cdFx0dGhpcy5fYW55VGVybWluYWxGb2N1c0NvbnRleHRLZXkuc2V0KGlzRm9jdXNlZCk7XG5cdFx0dGhpcy5fYW55Rm9jdXNlZFRlcm1pbmFsSGFzU2VsZWN0aW9uLnNldChpc0ZvY3VzZWQgJiYgdGhpcy5yYXcuaGFzU2VsZWN0aW9uKCkpO1xuXHR9XG5cblx0d3JpdGUoZGF0YTogc3RyaW5nIHwgVWludDhBcnJheSwgY2FsbGJhY2s/OiAoKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGhpcy5yYXcud3JpdGUoZGF0YSwgY2FsbGJhY2spO1xuXHR9XG5cblx0cmVzaXplKGNvbHVtbnM6IG51bWJlciwgcm93czogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygncmVzaXppbmcnLCBjb2x1bW5zLCByb3dzKTtcblx0XHR0aGlzLnJhdy5yZXNpemUoY29sdW1ucywgcm93cyk7XG5cdH1cblxuXHR1cGRhdGVMb2dMZXZlbCgpOiB2b2lkIHtcblx0XHR0aGlzLnJhdy5vcHRpb25zLmxvZ0xldmVsID0gdnNjb2RlVG9YdGVybUxvZ0xldmVsKHRoaXMuX2xvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHdpZHRoLCBpbiBwaXhlbHMsIG9mIHRoZSB2ZXJ0aWNhbCBzY3JvbGxiYXIuIE5hcnJvd2VyIHVuZGVyIHRoZSBNb2Rlcm5cblx0ICogVUkgVXBkYXRlIGV4cGVyaW1lbnQgc28gaXQgbWF0Y2hlcyB0aGUgbW9kZXJuaXplZCB3b3JrYmVuY2ggc2Nyb2xsYmFycy5cblx0ICovXG5cdGdldCBzY3JvbGxiYXJXaWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihMYXlvdXRTZXR0aW5ncy5NT0RFUk5fVUkpID09PSB0cnVlXG5cdFx0XHQ/IFRlcm1pbmFsU2Nyb2xsYmFyV2lkdGguTW9kZXJuVUlcblx0XHRcdDogVGVybWluYWxTY3JvbGxiYXJXaWR0aC5EZWZhdWx0O1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkcyB0aGUgeHRlcm0uanMgYHNjcm9sbGJhcmAgb3B0aW9uIHVzaW5nIHtAbGluayBzY3JvbGxiYXJXaWR0aH0uIFJldHVybnNcblx0ICogYHVuZGVmaW5lZGAgd2hlbiB0aGUgb3ZlcnZpZXcgcnVsZXIgaXMgZGlzYWJsZWQgKGUuZy4gZGV0YWNoZWQgdGVybWluYWxzKS5cblx0ICovXG5cdHByaXZhdGUgX2dldFNjcm9sbGJhck9wdGlvbnMoKTogeyB3aWR0aDogbnVtYmVyOyBvdmVydmlld1J1bGVyOiB7IHNob3dUb3BCb3JkZXI6IGJvb2xlYW4gfSB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fZGlzYWJsZU92ZXJ2aWV3UnVsZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHR3aWR0aDogdGhpcy5zY3JvbGxiYXJXaWR0aCxcblx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0c2hvd1RvcEJvcmRlcjogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHVwZGF0ZUNvbmZpZygpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWcgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZztcblx0XHR0aGlzLnJhdy5vcHRpb25zLmFsdENsaWNrTW92ZXNDdXJzb3IgPSBjb25maWcuYWx0Q2xpY2tNb3Zlc0N1cnNvcjtcblx0XHR0aGlzLl9zZXRDdXJzb3JCbGluayhjb25maWcuY3Vyc29yQmxpbmtpbmcpO1xuXHRcdHRoaXMuX3NldFRleHRCbGlua2luZyhjb25maWcudGV4dEJsaW5raW5nKTtcblx0XHR0aGlzLl9zZXRDdXJzb3JTdHlsZShjb25maWcuY3Vyc29yU3R5bGUpO1xuXHRcdHRoaXMuX3NldEN1cnNvclN0eWxlSW5hY3RpdmUoY29uZmlnLmN1cnNvclN0eWxlSW5hY3RpdmUpO1xuXHRcdHRoaXMuX3NldEN1cnNvcldpZHRoKGNvbmZpZy5jdXJzb3JXaWR0aCk7XG5cdFx0dGhpcy5yYXcub3B0aW9ucy5zY3JvbGxiYWNrID0gY29uZmlnLnNjcm9sbGJhY2s7XG5cdFx0dGhpcy5yYXcub3B0aW9ucy5kcmF3Qm9sZFRleHRJbkJyaWdodENvbG9ycyA9IGNvbmZpZy5kcmF3Qm9sZFRleHRJbkJyaWdodENvbG9ycztcblx0XHR0aGlzLnJhdy5vcHRpb25zLm1pbmltdW1Db250cmFzdFJhdGlvID0gY29uZmlnLm1pbmltdW1Db250cmFzdFJhdGlvO1xuXHRcdHRoaXMucmF3Lm9wdGlvbnMudGFiU3RvcFdpZHRoID0gY29uZmlnLnRhYlN0b3BXaWR0aDtcblx0XHR0aGlzLnJhdy5vcHRpb25zLmZhc3RTY3JvbGxTZW5zaXRpdml0eSA9IGNvbmZpZy5mYXN0U2Nyb2xsU2Vuc2l0aXZpdHk7XG5cdFx0dGhpcy5yYXcub3B0aW9ucy5zY3JvbGxTZW5zaXRpdml0eSA9IGNvbmZpZy5tb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHk7XG5cdFx0dGhpcy5yYXcub3B0aW9ucy5tYWNPcHRpb25Jc01ldGEgPSBjb25maWcubWFjT3B0aW9uSXNNZXRhO1xuXHRcdGNvbnN0IGVkaXRvck9wdGlvbnMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRWRpdG9yT3B0aW9ucz4oJ2VkaXRvcicpO1xuXHRcdHRoaXMucmF3Lm9wdGlvbnMuYWx0Q2xpY2tNb3Zlc0N1cnNvciA9IGNvbmZpZy5hbHRDbGlja01vdmVzQ3Vyc29yICYmIGVkaXRvck9wdGlvbnMubXVsdGlDdXJzb3JNb2RpZmllciA9PT0gJ2FsdCc7XG5cdFx0dGhpcy5yYXcub3B0aW9ucy5tYWNPcHRpb25DbGlja0ZvcmNlc1NlbGVjdGlvbiA9IGNvbmZpZy5tYWNPcHRpb25DbGlja0ZvcmNlc1NlbGVjdGlvbjtcblx0XHR0aGlzLnJhdy5vcHRpb25zLnJpZ2h0Q2xpY2tTZWxlY3RzV29yZCA9IGNvbmZpZy5yaWdodENsaWNrQmVoYXZpb3IgPT09ICdzZWxlY3RXb3JkJztcblx0XHR0aGlzLnJhdy5vcHRpb25zLndvcmRTZXBhcmF0b3IgPSBjb25maWcud29yZFNlcGFyYXRvcnM7XG5cdFx0dGhpcy5yYXcub3B0aW9ucy5zY3JvbGxiYXIgPSB0aGlzLl9nZXRTY3JvbGxiYXJPcHRpb25zKCk7XG5cdFx0dGhpcy5yYXcub3B0aW9ucy5pZ25vcmVCcmFja2V0ZWRQYXN0ZU1vZGUgPSBjb25maWcuaWdub3JlQnJhY2tldGVkUGFzdGVNb2RlO1xuXHRcdHRoaXMucmF3Lm9wdGlvbnMucmVzY2FsZU92ZXJsYXBwaW5nR2x5cGhzID0gY29uZmlnLnJlc2NhbGVPdmVybGFwcGluZ0dseXBocztcblx0XHR0aGlzLnJhdy5vcHRpb25zLmFsbG93VHJhbnNwYXJlbmN5ID0gY29uZmlnLmVuYWJsZUltYWdlcztcblx0XHR0aGlzLnJhdy5vcHRpb25zLnZ0RXh0ZW5zaW9ucyA9IHtcblx0XHRcdGtpdHR5S2V5Ym9hcmQ6IGNvbmZpZy5lbmFibGVLaXR0eUtleWJvYXJkUHJvdG9jb2wsXG5cdFx0XHR3aW4zMklucHV0TW9kZTogY29uZmlnLmVuYWJsZVdpbjMySW5wdXRNb2RlLFxuXHRcdH07XG5cblx0XHR0aGlzLl91cGRhdGVTbW9vdGhTY3JvbGxpbmcoKTtcblx0XHRpZiAodGhpcy5fYXR0YWNoZWQpIHtcblx0XHRcdGlmICh0aGlzLl9hdHRhY2hlZC5vcHRpb25zLmVuYWJsZUdwdSkge1xuXHRcdFx0XHRpZiAodGhpcy5fc2hvdWxkTG9hZFdlYmdsKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9lbmFibGVXZWJnbFJlbmRlcmVyKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fZGlzcG9zZU9mV2ViZ2xSZW5kZXJlcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZWZyZXNoTGlnYXR1cmVzQWRkb24oKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTbW9vdGhTY3JvbGxpbmcoKSB7XG5cdFx0dGhpcy5yYXcub3B0aW9ucy5zbW9vdGhTY3JvbGxEdXJhdGlvbiA9IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnNtb290aFNjcm9sbGluZyAmJiB0aGlzLl9pc1BoeXNpY2FsTW91c2VXaGVlbCA/IFJlbmRlckNvbnN0YW50cy5TbW9vdGhTY3JvbGxEdXJhdGlvbiA6IDA7XG5cdH1cblxuXHRwcml2YXRlIF9zaG91bGRMb2FkV2ViZ2woKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICh0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5ncHVBY2NlbGVyYXRpb24gPT09ICdhdXRvJyAmJiBYdGVybVRlcm1pbmFsLl9zdWdnZXN0ZWRSZW5kZXJlclR5cGUgPT09IHVuZGVmaW5lZCkgfHwgdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuZ3B1QWNjZWxlcmF0aW9uID09PSAnb24nO1xuXHR9XG5cblx0Zm9yY2VSZWRyYXcoKSB7XG5cdFx0dGhpcy5yYXcuY2xlYXJUZXh0dXJlQXRsYXMoKTtcblx0fVxuXG5cdGNsZWFyRGVjb3JhdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbkFkZG9uPy5jbGVhckRlY29yYXRpb25zKCk7XG5cdH1cblxuXHRmb3JjZVJlZnJlc2goKSB7XG5cdFx0dGhpcy5fY29yZS52aWV3cG9ydD8uX2lubmVyUmVmcmVzaCgpO1xuXHR9XG5cblx0YXN5bmMgZmluZE5leHQodGVybTogc3RyaW5nLCBzZWFyY2hPcHRpb25zOiBJU2VhcmNoT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRoaXMuX3VwZGF0ZUZpbmRDb2xvcnMoc2VhcmNoT3B0aW9ucyk7XG5cdFx0cmV0dXJuIChhd2FpdCB0aGlzLl9nZXRTZWFyY2hBZGRvbigpKS5maW5kTmV4dCh0ZXJtLCBzZWFyY2hPcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIGZpbmRQcmV2aW91cyh0ZXJtOiBzdHJpbmcsIHNlYXJjaE9wdGlvbnM6IElTZWFyY2hPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5fdXBkYXRlRmluZENvbG9ycyhzZWFyY2hPcHRpb25zKTtcblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuX2dldFNlYXJjaEFkZG9uKCkpLmZpbmRQcmV2aW91cyh0ZXJtLCBzZWFyY2hPcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUZpbmRDb2xvcnMoc2VhcmNoT3B0aW9uczogSVNlYXJjaE9wdGlvbnMpOiB2b2lkIHtcblx0XHRjb25zdCB0aGVtZSA9IHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cdFx0Ly8gVGhlbWUgY29sb3IgbmFtZXMgYWxpZ24gd2l0aCBtb25hY28vdnNjb2RlIHdoZXJlYXMgeHRlcm0uanMgaGFzIHNvbWUgZGlmZmVyZW50IG5hbWluZy5cblx0XHQvLyBUaGUgbWFwcGluZyBpcyBhcyBmb2xsb3dzOlxuXHRcdC8vIC0gZmluZE1hdGNoIC0+IGFjdGl2ZU1hdGNoXG5cdFx0Ly8gLSBmaW5kTWF0Y2hIaWdobGlnaHQgLT4gbWF0Y2hcblx0XHRjb25zdCB0ZXJtaW5hbEJhY2tncm91bmQgPSB0aGVtZS5nZXRDb2xvcihURVJNSU5BTF9CQUNLR1JPVU5EX0NPTE9SKSB8fCB0aGVtZS5nZXRDb2xvcihQQU5FTF9CQUNLR1JPVU5EKTtcblx0XHRjb25zdCBmaW5kTWF0Y2hCYWNrZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoVEVSTUlOQUxfRklORF9NQVRDSF9CQUNLR1JPVU5EX0NPTE9SKTtcblx0XHRjb25zdCBmaW5kTWF0Y2hCb3JkZXIgPSB0aGVtZS5nZXRDb2xvcihURVJNSU5BTF9GSU5EX01BVENIX0JPUkRFUl9DT0xPUik7XG5cdFx0Y29uc3QgZmluZE1hdGNoT3ZlcnZpZXdSdWxlciA9IHRoZW1lLmdldENvbG9yKFRFUk1JTkFMX09WRVJWSUVXX1JVTEVSX0NVUlNPUl9GT1JFR1JPVU5EX0NPTE9SKTtcblx0XHRjb25zdCBmaW5kTWF0Y2hIaWdobGlnaHRCYWNrZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoVEVSTUlOQUxfRklORF9NQVRDSF9ISUdITElHSFRfQkFDS0dST1VORF9DT0xPUik7XG5cdFx0Y29uc3QgZmluZE1hdGNoSGlnaGxpZ2h0Qm9yZGVyID0gdGhlbWUuZ2V0Q29sb3IoVEVSTUlOQUxfRklORF9NQVRDSF9ISUdITElHSFRfQk9SREVSX0NPTE9SKTtcblx0XHRjb25zdCBmaW5kTWF0Y2hIaWdobGlnaHRPdmVydmlld1J1bGVyID0gdGhlbWUuZ2V0Q29sb3IoVEVSTUlOQUxfT1ZFUlZJRVdfUlVMRVJfRklORF9NQVRDSF9GT1JFR1JPVU5EX0NPTE9SKTtcblx0XHRzZWFyY2hPcHRpb25zLmRlY29yYXRpb25zID0ge1xuXHRcdFx0YWN0aXZlTWF0Y2hCYWNrZ3JvdW5kOiBmaW5kTWF0Y2hCYWNrZ3JvdW5kPy50b1N0cmluZygpLFxuXHRcdFx0YWN0aXZlTWF0Y2hCb3JkZXI6IGZpbmRNYXRjaEJvcmRlcj8udG9TdHJpbmcoKSB8fCAndHJhbnNwYXJlbnQnLFxuXHRcdFx0YWN0aXZlTWF0Y2hDb2xvck92ZXJ2aWV3UnVsZXI6IGZpbmRNYXRjaE92ZXJ2aWV3UnVsZXI/LnRvU3RyaW5nKCkgfHwgJ3RyYW5zcGFyZW50Jyxcblx0XHRcdC8vIGRlY29yYXRpb24gYmdzIGRvbid0IHN1cHBvcnQgdGhlIGFscGhhIGNoYW5uZWwgc28gYmxlbmQgaXQgd2l0aCB0aGUgcmVndWxhciBiZ1xuXHRcdFx0bWF0Y2hCYWNrZ3JvdW5kOiB0ZXJtaW5hbEJhY2tncm91bmQgPyBmaW5kTWF0Y2hIaWdobGlnaHRCYWNrZ3JvdW5kPy5ibGVuZCh0ZXJtaW5hbEJhY2tncm91bmQpLnRvU3RyaW5nKCkgOiB1bmRlZmluZWQsXG5cdFx0XHRtYXRjaEJvcmRlcjogZmluZE1hdGNoSGlnaGxpZ2h0Qm9yZGVyPy50b1N0cmluZygpIHx8ICd0cmFuc3BhcmVudCcsXG5cdFx0XHRtYXRjaE92ZXJ2aWV3UnVsZXI6IGZpbmRNYXRjaEhpZ2hsaWdodE92ZXJ2aWV3UnVsZXI/LnRvU3RyaW5nKCkgfHwgJ3RyYW5zcGFyZW50J1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9zZWFyY2hBZGRvblByb21pc2U6IFByb21pc2U8U2VhcmNoQWRkb25UeXBlPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZ2V0U2VhcmNoQWRkb24oKTogUHJvbWlzZTxTZWFyY2hBZGRvblR5cGU+IHtcblx0XHRpZiAoIXRoaXMuX3NlYXJjaEFkZG9uUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5fc2VhcmNoQWRkb25Qcm9taXNlID0gdGhpcy5feHRlcm1BZGRvbkxvYWRlci5pbXBvcnRBZGRvbignc2VhcmNoJykudGhlbigoQWRkb25DdG9yKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KCdDb3VsZCBub3QgY3JlYXRlIHNlYXJjaCBhZGRvbiwgdGVybWluYWwgaXMgZGlzcG9zZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zZWFyY2hBZGRvbiA9IG5ldyBBZGRvbkN0b3IoeyBoaWdobGlnaHRMaW1pdDogWHRlcm1UZXJtaW5hbENvbnN0YW50cy5TZWFyY2hIaWdobGlnaHRMaW1pdCB9KTtcblx0XHRcdFx0dGhpcy5yYXcubG9hZEFkZG9uKHRoaXMuX3NlYXJjaEFkZG9uKTtcblx0XHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX3NlYXJjaEFkZG9uLm9uRGlkQ2hhbmdlUmVzdWx0cygocmVzdWx0czogeyByZXN1bHRJbmRleDogbnVtYmVyOyByZXN1bHRDb3VudDogbnVtYmVyIH0pID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sYXN0RmluZFJlc3VsdCA9IHJlc3VsdHM7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VGaW5kUmVzdWx0cy5maXJlKHJlc3VsdHMpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9zZWFyY2hBZGRvbi5vbkJlZm9yZVNlYXJjaCgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fb25CZWZvcmVTZWFyY2guZmlyZSgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9zZWFyY2hBZGRvbi5vbkFmdGVyU2VhcmNoKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9vbkFmdGVyU2VhcmNoLmZpcmUoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fc2VhcmNoQWRkb247XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NlYXJjaEFkZG9uUHJvbWlzZTtcblx0fVxuXG5cdGNsZWFyU2VhcmNoRGVjb3JhdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VhcmNoQWRkb24/LmNsZWFyRGVjb3JhdGlvbnMoKTtcblx0fVxuXG5cdGNsZWFyQWN0aXZlU2VhcmNoRGVjb3JhdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9zZWFyY2hBZGRvbj8uY2xlYXJBY3RpdmVEZWNvcmF0aW9uKCk7XG5cdH1cblxuXHRnZXRGb250KCk6IElUZXJtaW5hbEZvbnQge1xuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEZvbnQoZG9tLmdldFdpbmRvdyh0aGlzLnJhdy5lbGVtZW50KSwgdGhpcy5fY29yZSk7XG5cdH1cblxuXHRnZXRMb25nZXN0Vmlld3BvcnRXcmFwcGVkTGluZUxlbmd0aCgpOiBudW1iZXIge1xuXHRcdGxldCBtYXhMaW5lTGVuZ3RoID0gMDtcblx0XHRmb3IgKGxldCBpID0gdGhpcy5yYXcuYnVmZmVyLmFjdGl2ZS5sZW5ndGggLSAxOyBpID49IHRoaXMucmF3LmJ1ZmZlci5hY3RpdmUudmlld3BvcnRZOyBpLS0pIHtcblx0XHRcdGNvbnN0IGxpbmVJbmZvID0gdGhpcy5fZ2V0V3JhcHBlZExpbmVDb3VudChpLCB0aGlzLnJhdy5idWZmZXIuYWN0aXZlKTtcblx0XHRcdG1heExpbmVMZW5ndGggPSBNYXRoLm1heChtYXhMaW5lTGVuZ3RoLCAoKGxpbmVJbmZvLmxpbmVDb3VudCAqIHRoaXMucmF3LmNvbHMpIC0gbGluZUluZm8uZW5kU3BhY2VzKSB8fCAwKTtcblx0XHRcdGkgPSBsaW5lSW5mby5jdXJyZW50SW5kZXg7XG5cdFx0fVxuXHRcdHJldHVybiBtYXhMaW5lTGVuZ3RoO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0V3JhcHBlZExpbmVDb3VudChpbmRleDogbnVtYmVyLCBidWZmZXI6IElCdWZmZXIpOiB7IGxpbmVDb3VudDogbnVtYmVyOyBjdXJyZW50SW5kZXg6IG51bWJlcjsgZW5kU3BhY2VzOiBudW1iZXIgfSB7XG5cdFx0bGV0IGxpbmUgPSBidWZmZXIuZ2V0TGluZShpbmRleCk7XG5cdFx0aWYgKCFsaW5lKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBnZXQgbGluZScpO1xuXHRcdH1cblx0XHRsZXQgY3VycmVudEluZGV4ID0gaW5kZXg7XG5cdFx0bGV0IGVuZFNwYWNlcyA9IDA7XG5cdFx0Ly8gbGluZS5sZW5ndGggbWF5IGV4Y2VlZCBjb2xzIGFzIGl0IGRvZXNuJ3QgbmVjZXNzYXJpbHkgdHJpbSB0aGUgYmFja2luZyBhcnJheSBvbiByZXNpemVcblx0XHRmb3IgKGxldCBpID0gTWF0aC5taW4obGluZS5sZW5ndGgsIHRoaXMucmF3LmNvbHMpIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGlmICghbGluZT8uZ2V0Q2VsbChpKT8uZ2V0Q2hhcnMoKSkge1xuXHRcdFx0XHRlbmRTcGFjZXMrKztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR3aGlsZSAobGluZT8uaXNXcmFwcGVkICYmIGN1cnJlbnRJbmRleCA+IDApIHtcblx0XHRcdGN1cnJlbnRJbmRleC0tO1xuXHRcdFx0bGluZSA9IGJ1ZmZlci5nZXRMaW5lKGN1cnJlbnRJbmRleCk7XG5cdFx0fVxuXHRcdHJldHVybiB7IGxpbmVDb3VudDogaW5kZXggLSBjdXJyZW50SW5kZXggKyAxLCBjdXJyZW50SW5kZXgsIGVuZFNwYWNlcyB9O1xuXHR9XG5cblx0c2Nyb2xsRG93bkxpbmUoKTogdm9pZCB7XG5cdFx0dGhpcy5yYXcuc2Nyb2xsTGluZXMoMSk7XG5cdH1cblxuXHRzY3JvbGxEb3duUGFnZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJhdy5zY3JvbGxQYWdlcygxKTtcblx0fVxuXG5cdHNjcm9sbFRvQm90dG9tKCk6IHZvaWQge1xuXHRcdHRoaXMucmF3LnNjcm9sbFRvQm90dG9tKCk7XG5cdH1cblxuXHRzY3JvbGxVcExpbmUoKTogdm9pZCB7XG5cdFx0dGhpcy5yYXcuc2Nyb2xsTGluZXMoLTEpO1xuXHR9XG5cblx0c2Nyb2xsVXBQYWdlKCk6IHZvaWQge1xuXHRcdHRoaXMucmF3LnNjcm9sbFBhZ2VzKC0xKTtcblx0fVxuXG5cdHNjcm9sbFRvVG9wKCk6IHZvaWQge1xuXHRcdHRoaXMucmF3LnNjcm9sbFRvVG9wKCk7XG5cdH1cblxuXHRzY3JvbGxUb0xpbmUobGluZTogbnVtYmVyLCBwb3NpdGlvbjogU2Nyb2xsUG9zaXRpb24gPSBTY3JvbGxQb3NpdGlvbi5Ub3ApOiB2b2lkIHtcblx0XHR0aGlzLm1hcmtUcmFja2VyLnNjcm9sbFRvTGluZShsaW5lLCBwb3NpdGlvbik7XG5cdH1cblxuXHRjbGVhckJ1ZmZlcigpOiB2b2lkIHtcblx0XHR0aGlzLnJhdy5jbGVhcigpO1xuXHRcdC8vIHh0ZXJtLmpzIGRvZXMgbm90IGNsZWFyIHRoZSBmaXJzdCBwcm9tcHQsIHNvIHRyaWdnZXIgdGhlc2UgdG8gc2ltdWxhdGVcblx0XHQvLyB0aGUgcHJvbXB0IGJlaW5nIHdyaXR0ZW5cblx0XHR0aGlzLl9jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKT8uaGFuZGxlUHJvbXB0U3RhcnQoKTtcblx0XHR0aGlzLl9jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKT8uaGFuZGxlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmNsZWFyKTtcblx0fVxuXG5cdHJlc2V0KCk6IHZvaWQge1xuXHRcdHRoaXMucmF3LnJlc2V0KCk7XG5cdH1cblxuXHRoYXNTZWxlY3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmF3Lmhhc1NlbGVjdGlvbigpO1xuXHR9XG5cblx0Y2xlYXJTZWxlY3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5yYXcuY2xlYXJTZWxlY3Rpb24oKTtcblx0fVxuXG5cdHNlbGVjdE1hcmtlZFJhbmdlKGZyb21NYXJrZXJJZDogc3RyaW5nLCB0b01hcmtlcklkOiBzdHJpbmcsIHNjcm9sbEludG9WaWV3ID0gZmFsc2UpIHtcblx0XHRjb25zdCBkZXRlY3Rpb25DYXBhYmlsaXR5ID0gdGhpcy5zaGVsbEludGVncmF0aW9uLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkJ1ZmZlck1hcmtEZXRlY3Rpb24pO1xuXHRcdGlmICghZGV0ZWN0aW9uQ2FwYWJpbGl0eSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0ID0gZGV0ZWN0aW9uQ2FwYWJpbGl0eS5nZXRNYXJrKGZyb21NYXJrZXJJZCk7XG5cdFx0Y29uc3QgZW5kID0gZGV0ZWN0aW9uQ2FwYWJpbGl0eS5nZXRNYXJrKHRvTWFya2VySWQpO1xuXHRcdGlmIChzdGFydCA9PT0gdW5kZWZpbmVkIHx8IGVuZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yYXcuc2VsZWN0TGluZXMoc3RhcnQubGluZSwgZW5kLmxpbmUpO1xuXHRcdGlmIChzY3JvbGxJbnRvVmlldykge1xuXHRcdFx0dGhpcy5yYXcuc2Nyb2xsVG9MaW5lKHN0YXJ0LmxpbmUpO1xuXHRcdH1cblx0fVxuXG5cdHNlbGVjdEFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLnJhdy5mb2N1cygpO1xuXHRcdHRoaXMucmF3LnNlbGVjdEFsbCgpO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5yYXcuZm9jdXMoKTtcblx0fVxuXG5cdGFzeW5jIGNvcHlTZWxlY3Rpb24oYXNIdG1sPzogYm9vbGVhbiwgY29tbWFuZD86IElUZXJtaW5hbENvbW1hbmQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5oYXNTZWxlY3Rpb24oKSB8fCAoYXNIdG1sICYmIGNvbW1hbmQpKSB7XG5cdFx0XHRpZiAoYXNIdG1sKSB7XG5cdFx0XHRcdGNvbnN0IHRleHRBc0h0bWwgPSBhd2FpdCB0aGlzLmdldFNlbGVjdGlvbkFzSHRtbChjb21tYW5kKTtcblx0XHRcdFx0ZnVuY3Rpb24gbGlzdGVuZXIoZTogQ2xpcGJvYXJkRXZlbnQpIHtcblx0XHRcdFx0XHRpZiAoZS5jbGlwYm9hcmREYXRhKSB7XG5cdFx0XHRcdFx0XHRpZiAoIWUuY2xpcGJvYXJkRGF0YS50eXBlcy5pbmNsdWRlcygndGV4dC9wbGFpbicpKSB7XG5cdFx0XHRcdFx0XHRcdGUuY2xpcGJvYXJkRGF0YS5zZXREYXRhKCd0ZXh0L3BsYWluJywgY29tbWFuZD8uZ2V0T3V0cHV0KCkgPz8gJycpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZS5jbGlwYm9hcmREYXRhLnNldERhdGEoJ3RleHQvaHRtbCcsIHRleHRBc0h0bWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZG9jID0gZG9tLmdldERvY3VtZW50KHRoaXMucmF3LmVsZW1lbnQpO1xuXHRcdFx0XHRkb2MuYWRkRXZlbnRMaXN0ZW5lcignY29weScsIGxpc3RlbmVyKTtcblx0XHRcdFx0ZG9jLmV4ZWNDb21tYW5kKCdjb3B5Jyk7XG5cdFx0XHRcdGRvYy5yZW1vdmVFdmVudExpc3RlbmVyKCdjb3B5JywgbGlzdGVuZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodGhpcy5yYXcuZ2V0U2VsZWN0aW9uKCkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuY29weVNlbGVjdGlvbi5ub1NlbGVjdGlvbicsICdUaGUgdGVybWluYWwgaGFzIG5vIHNlbGVjdGlvbiB0byBjb3B5JykpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldEN1cnNvckJsaW5rKGJsaW5rOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucmF3Lm9wdGlvbnMuY3Vyc29yQmxpbmsgIT09IGJsaW5rKSB7XG5cdFx0XHR0aGlzLnJhdy5vcHRpb25zLmN1cnNvckJsaW5rID0gYmxpbms7XG5cdFx0XHR0aGlzLnJhdy5yZWZyZXNoKDAsIHRoaXMucmF3LnJvd3MgLSAxKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRUZXh0QmxpbmtpbmcoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGJsaW5rSW50ZXJ2YWxEdXJhdGlvbiA9IGVuYWJsZWQgPyBUZXh0QmxpbmtDb25zdGFudHMuSW50ZXJ2YWxEdXJhdGlvbiA6IDA7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMucmF3Lm9wdGlvbnM7XG5cdFx0aWYgKG9wdGlvbnMuYmxpbmtJbnRlcnZhbER1cmF0aW9uICE9PSBibGlua0ludGVydmFsRHVyYXRpb24pIHtcblx0XHRcdG9wdGlvbnMuYmxpbmtJbnRlcnZhbER1cmF0aW9uID0gYmxpbmtJbnRlcnZhbER1cmF0aW9uO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldEN1cnNvclN0eWxlKHN0eWxlOiBJVGVybWluYWxDb25maWd1cmF0aW9uWydjdXJzb3JTdHlsZSddKTogdm9pZCB7XG5cdFx0Y29uc3QgbWFwcGVkID0gdnNjb2RlVG9YdGVybUN1cnNvclN0eWxlPCdjdXJzb3JTdHlsZSc+KHN0eWxlKTtcblx0XHRpZiAodGhpcy5yYXcub3B0aW9ucy5jdXJzb3JTdHlsZSAhPT0gbWFwcGVkKSB7XG5cdFx0XHR0aGlzLnJhdy5vcHRpb25zLmN1cnNvclN0eWxlID0gbWFwcGVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldEN1cnNvclN0eWxlSW5hY3RpdmUoc3R5bGU6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25bJ2N1cnNvclN0eWxlSW5hY3RpdmUnXSk6IHZvaWQge1xuXHRcdGNvbnN0IG1hcHBlZCA9IHZzY29kZVRvWHRlcm1DdXJzb3JTdHlsZShzdHlsZSk7XG5cdFx0aWYgKHRoaXMucmF3Lm9wdGlvbnMuY3Vyc29ySW5hY3RpdmVTdHlsZSAhPT0gbWFwcGVkKSB7XG5cdFx0XHR0aGlzLnJhdy5vcHRpb25zLmN1cnNvckluYWN0aXZlU3R5bGUgPSBtYXBwZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q3Vyc29yV2lkdGgod2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnJhdy5vcHRpb25zLmN1cnNvcldpZHRoICE9PSB3aWR0aCkge1xuXHRcdFx0dGhpcy5yYXcub3B0aW9ucy5jdXJzb3JXaWR0aCA9IHdpZHRoO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2VuYWJsZVdlYmdsUmVuZGVyZXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQ3VycmVudGx5IHdlYmdsIG9wdGlvbnMgY2FuIG9ubHkgYmUgc3BlY2lmaWVkIG9uIGFkZG9uIGNyZWF0aW9uXG5cdFx0aWYgKCF0aGlzLnJhdy5lbGVtZW50IHx8IHRoaXMuX3dlYmdsQWRkb24gJiYgdGhpcy5fd2ViZ2xBZGRvbkN1c3RvbUdseXBocyA9PT0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuY3VzdG9tR2x5cGhzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRGlzcG9zZSBvZiBleGlzdGluZyBhZGRvbiBiZWZvcmUgY3JlYXRpbmcgYSBuZXcgb25lIHRvIGF2b2lkIGxlYWtpbmcgV2ViR0wgY29udGV4dHNcblx0XHR0aGlzLl9kaXNwb3NlT2ZXZWJnbFJlbmRlcmVyKCk7XG5cblx0XHR0aGlzLl93ZWJnbEFkZG9uQ3VzdG9tR2x5cGhzID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuY3VzdG9tR2x5cGhzO1xuXG5cdFx0Y29uc3QgQWRkb24gPSBhd2FpdCB0aGlzLl94dGVybUFkZG9uTG9hZGVyLmltcG9ydEFkZG9uKCd3ZWJnbCcpO1xuXHRcdHRoaXMuX3dlYmdsQWRkb24gPSBuZXcgQWRkb24oe1xuXHRcdFx0Y3VzdG9tR2x5cGhzOiB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5jdXN0b21HbHlwaHNcblx0XHR9KTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5yYXcubG9hZEFkZG9uKHRoaXMuX3dlYmdsQWRkb24pO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnV2ViZ2wgd2FzIGxvYWRlZCcpO1xuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX3dlYmdsQWRkb24ub25Db250ZXh0TG9zcygoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgV2ViZ2wgbG9zdCBjb250ZXh0LCBkaXNwb3Npbmcgb2Ygd2ViZ2wgcmVuZGVyZXJgKTtcblx0XHRcdFx0dGhpcy5fZGlzcG9zZU9mV2ViZ2xSZW5kZXJlcigpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fcmVmcmVzaEltYWdlQWRkb24oKTtcblx0XHRcdC8vIFdlYkdMIHJlbmRlcmVyIGNlbGwgZGltZW5zaW9ucyBkaWZmZXIgZnJvbSB0aGUgRE9NIHJlbmRlcmVyLCBtYWtlIHN1cmUgdGhlIHRlcm1pbmFsXG5cdFx0XHQvLyBnZXRzIHJlc2l6ZWQgYWZ0ZXIgdGhlIHdlYmdsIGFkZG9uIGlzIGxvYWRlZFxuXHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0UmVmcmVzaERpbWVuc2lvbnMuZmlyZSgpO1xuXHRcdFx0Ly8gVW5jb21tZW50IHRvIGFkZCB0aGUgdGV4dHVyZSBhdGxhcyB0byB0aGUgRE9NXG5cdFx0XHQvLyBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdC8vIFx0aWYgKHRoaXMuX3dlYmdsQWRkb24/LnRleHR1cmVBdGxhcykge1xuXHRcdFx0Ly8gXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5fd2ViZ2xBZGRvbj8udGV4dHVyZUF0bGFzKTtcblx0XHRcdC8vIFx0fVxuXHRcdFx0Ly8gfSwgNTAwMCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBXZWJnbCBjb3VsZCBub3QgYmUgbG9hZGVkLiBGYWxsaW5nIGJhY2sgdG8gdGhlIERPTSByZW5kZXJlcmAsIGUpO1xuXHRcdFx0WHRlcm1UZXJtaW5hbC5fc3VnZ2VzdGVkUmVuZGVyZXJUeXBlID0gJ2RvbSc7XG5cdFx0XHR0aGlzLl9kaXNwb3NlT2ZXZWJnbFJlbmRlcmVyKCk7XG5cdFx0fVxuXHR9XG5cblx0QGRlYm91bmNlKDEwMClcblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaExpZ2F0dXJlc0FkZG9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5yYXcuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsaWdhdHVyZXNDb25maWcgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5mb250TGlnYXR1cmVzO1xuXHRcdGxldCBzaG91bGRSZWNyZWF0ZVdlYmdsUmVuZGVyZXIgPSBmYWxzZTtcblx0XHRpZiAobGlnYXR1cmVzQ29uZmlnPy5lbmFibGVkKSB7XG5cdFx0XHRjb25zdCBsaWdhdHVyZU9wdGlvbnM6IElMaWdhdHVyZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGZvbnRGZWF0dXJlU2V0dGluZ3M6IGxpZ2F0dXJlc0NvbmZpZy5mZWF0dXJlU2V0dGluZ3MsXG5cdFx0XHRcdGZhbGxiYWNrTGlnYXR1cmVzOiBsaWdhdHVyZXNDb25maWcuZmFsbGJhY2tMaWdhdHVyZXMsXG5cdFx0XHR9O1xuXHRcdFx0aWYgKHRoaXMuX2xpZ2F0dXJlc0FkZG9uLnZhbHVlICYmICFlcXVhbHMobGlnYXR1cmVPcHRpb25zLCB0aGlzLl9saWdhdHVyZXNBZGRvbkNvbmZpZykpIHtcblx0XHRcdFx0dGhpcy5fbGlnYXR1cmVzQWRkb24uY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fbGlnYXR1cmVzQWRkb25Db25maWcgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX2xpZ2F0dXJlc0FkZG9uLnZhbHVlKSB7XG5cdFx0XHRcdGNvbnN0IExpZ2F0dXJlc0FkZG9uID0gYXdhaXQgdGhpcy5feHRlcm1BZGRvbkxvYWRlci5pbXBvcnRBZGRvbignbGlnYXR1cmVzJyk7XG5cdFx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xpZ2F0dXJlc0FkZG9uLnZhbHVlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGlnYXR1cmVzQWRkb24sIGxpZ2F0dXJlT3B0aW9ucyk7XG5cdFx0XHRcdHRoaXMuX2xpZ2F0dXJlc0FkZG9uQ29uZmlnID0gbGlnYXR1cmVPcHRpb25zO1xuXHRcdFx0XHR0aGlzLnJhdy5sb2FkQWRkb24odGhpcy5fbGlnYXR1cmVzQWRkb24udmFsdWUpO1xuXHRcdFx0XHRzaG91bGRSZWNyZWF0ZVdlYmdsUmVuZGVyZXIgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIXRoaXMuX2xpZ2F0dXJlc0FkZG9uLnZhbHVlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xpZ2F0dXJlc0FkZG9uLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9saWdhdHVyZXNBZGRvbkNvbmZpZyA9IHVuZGVmaW5lZDtcblx0XHRcdHNob3VsZFJlY3JlYXRlV2ViZ2xSZW5kZXJlciA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHNob3VsZFJlY3JlYXRlV2ViZ2xSZW5kZXJlciAmJiB0aGlzLl93ZWJnbEFkZG9uKSB7XG5cdFx0XHQvLyBSZS1jcmVhdGUgdGhlIHdlYmdsIGFkZG9uIHdoZW4gbGlnYXR1cmVzIHN0YXRlIGNoYW5nZXMgdG8gc28gdGhlIHRleHR1cmUgYXRsYXMgcGlja3MgdXBcblx0XHRcdC8vIHN0eWxlcyBmcm9tIHRoZSBET00uXG5cdFx0XHR0aGlzLl9kaXNwb3NlT2ZXZWJnbFJlbmRlcmVyKCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9lbmFibGVXZWJnbFJlbmRlcmVyKCk7XG5cdFx0fVxuXHR9XG5cblx0QGRlYm91bmNlKDEwMClcblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaEltYWdlQWRkb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gT25seSBhbGxvdyB0aGUgaW1hZ2UgYWRkb24gd2hlbiB3ZWJnbCBpcyBiZWluZyB1c2VkIHRvIGF2b2lkIHBvc3NpYmxlIEdQVSBpc3N1ZXNcblx0XHRpZiAodGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuZW5hYmxlSW1hZ2VzICYmIHRoaXMuX3dlYmdsQWRkb24pIHtcblx0XHRcdGlmICghdGhpcy5faW1hZ2VBZGRvbikge1xuXHRcdFx0XHRjb25zdCBBZGRvbkN0b3IgPSBhd2FpdCB0aGlzLl94dGVybUFkZG9uTG9hZGVyLmltcG9ydEFkZG9uKCdpbWFnZScpO1xuXHRcdFx0XHR0aGlzLl9pbWFnZUFkZG9uID0gbmV3IEFkZG9uQ3RvcigpO1xuXHRcdFx0XHR0aGlzLnJhdy5sb2FkQWRkb24odGhpcy5faW1hZ2VBZGRvbik7XG5cdFx0XHRcdHR5cGUgVGVybWluYWxJbWFnZUFkZG9uQWN0aXZhdGVkQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0b3duZXI6ICdhbnRob255a2ltMSc7XG5cdFx0XHRcdFx0Y29tbWVudDogJ1RyYWNrcyB3aGVuIHRoZSB4dGVybS5qcyBpbWFnZSBhZGRvbiBpcyBsb2FkZWQsIGluY2x1ZGluZyBkeW5hbWljIGVuYWJsZW1lbnQnO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8e30sIFRlcm1pbmFsSW1hZ2VBZGRvbkFjdGl2YXRlZENsYXNzaWZpY2F0aW9uPigndGVybWluYWwvaW1hZ2VBZGRvbkFjdGl2YXRlZCcpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbWFnZUFkZG9uLm9uSW1hZ2VBZGRlZCgoKSA9PiB7XG5cdFx0XHRcdFx0dHlwZSBUZXJtaW5hbEltYWdlQWRkZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRcdG93bmVyOiAnYW50aG9ueWtpbTEnO1xuXHRcdFx0XHRcdFx0Y29tbWVudDogJ1RyYWNrcyB3aGVuIGFuIGltYWdlIGlzIGFkZGVkIHRvIHRoZSB0ZXJtaW5hbCB2aWEgdGhlIGltYWdlIGFkZG9uJztcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7fSwgVGVybWluYWxJbWFnZUFkZGVkQ2xhc3NpZmljYXRpb24+KCd0ZXJtaW5hbC9pbWFnZUFkZGVkJyk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5faW1hZ2VBZGRvbj8uZGlzcG9zZSgpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5faW1hZ2VBZGRvbiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwb3NlT2ZXZWJnbFJlbmRlcmVyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fd2ViZ2xBZGRvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fd2ViZ2xBZGRvbj8uZGlzcG9zZSgpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gaWdub3JlXG5cdFx0fVxuXHRcdHRoaXMuX3dlYmdsQWRkb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fd2ViZ2xBZGRvbkN1c3RvbUdseXBocyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZWZyZXNoSW1hZ2VBZGRvbigpO1xuXHRcdC8vIFdlYkdMIHJlbmRlcmVyIGNlbGwgZGltZW5zaW9ucyBkaWZmZXIgZnJvbSB0aGUgRE9NIHJlbmRlcmVyLCBtYWtlIHN1cmUgdGhlIHRlcm1pbmFsXG5cdFx0Ly8gZ2V0cyByZXNpemVkIGFmdGVyIHRoZSB3ZWJnbCBhZGRvbiBpcyBkaXNwb3NlZFxuXHRcdHRoaXMuX29uRGlkUmVxdWVzdFJlZnJlc2hEaW1lbnNpb25zLmZpcmUoKTtcblx0fVxuXG5cdGFzeW5jIGdldFJhbmdlQXNWVChzdGFydE1hcmtlcj86IElYdGVybU1hcmtlciwgZW5kTWFya2VyPzogSVh0ZXJtTWFya2VyLCBza2lwTGFzdExpbmU/OiBib29sZWFuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRpZiAoIXRoaXMuX3NlcmlhbGl6ZUFkZG9uKSB7XG5cdFx0XHRjb25zdCBBZGRvbiA9IGF3YWl0IHRoaXMuX3h0ZXJtQWRkb25Mb2FkZXIuaW1wb3J0QWRkb24oJ3NlcmlhbGl6ZScpO1xuXHRcdFx0dGhpcy5fc2VyaWFsaXplQWRkb24gPSBuZXcgQWRkb24oKTtcblx0XHRcdHRoaXMucmF3LmxvYWRBZGRvbih0aGlzLl9zZXJpYWxpemVBZGRvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdExpbmUgPSB0aGlzLnJhdy5idWZmZXIuYWN0aXZlLmxlbmd0aCAtIDE7XG5cdFx0aWYgKGxhc3RMaW5lIDwgMCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc1ZhbGlkRW5kTWFya2VyID0gaXNOdW1iZXIoZW5kTWFya2VyPy5saW5lKTtcblx0XHRjb25zdCBzdGFydCA9IGNsYW1wKGlzTnVtYmVyKHN0YXJ0TWFya2VyPy5saW5lKSAmJiBzdGFydE1hcmtlci5saW5lID4gLTEgPyBzdGFydE1hcmtlci5saW5lIDogMCwgMCwgbGFzdExpbmUpO1xuXHRcdGxldCBlbmQgPSBoYXNWYWxpZEVuZE1hcmtlciA/IGVuZE1hcmtlci5saW5lIDogdGhpcy5yYXcuYnVmZmVyLmFjdGl2ZS5sZW5ndGggLSAxO1xuXHRcdGlmIChza2lwTGFzdExpbmUgJiYgaGFzVmFsaWRFbmRNYXJrZXIpIHtcblx0XHRcdGVuZCA9IGVuZCAtIDE7XG5cdFx0fVxuXHRcdGVuZCA9IGNsYW1wKE1hdGgubWF4KGVuZCwgc3RhcnQpLCBzdGFydCwgbGFzdExpbmUpO1xuXHRcdHJldHVybiB0aGlzLl9zZXJpYWxpemVBZGRvbi5zZXJpYWxpemUoe1xuXHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0c3RhcnQsXG5cdFx0XHRcdGVuZFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblxuXHRnZXRYdGVybVRoZW1lKHRoZW1lPzogSUNvbG9yVGhlbWUpOiBJVGhlbWUge1xuXHRcdGlmICghdGhlbWUpIHtcblx0XHRcdHRoZW1lID0gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWcgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZztcblx0XHRjb25zdCBoaWRlT3ZlcnZpZXdSdWxlciA9IFsnbmV2ZXInLCAnZ3V0dGVyJ10uaW5jbHVkZXMoY29uZmlnLnNoZWxsSW50ZWdyYXRpb24/LmRlY29yYXRpb25zRW5hYmxlZCA/PyAnJyk7XG5cblx0XHRjb25zdCBmb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihURVJNSU5BTF9GT1JFR1JPVU5EX0NPTE9SKTtcblx0XHRjb25zdCBiYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLl94dGVybUNvbG9yUHJvdmlkZXIuZ2V0QmFja2dyb3VuZENvbG9yKHRoZW1lKTtcblx0XHRjb25zdCBjdXJzb3JDb2xvciA9IHRoZW1lLmdldENvbG9yKFRFUk1JTkFMX0NVUlNPUl9GT1JFR1JPVU5EX0NPTE9SKSB8fCBmb3JlZ3JvdW5kQ29sb3I7XG5cdFx0Y29uc3QgY3Vyc29yQWNjZW50Q29sb3IgPSB0aGVtZS5nZXRDb2xvcihURVJNSU5BTF9DVVJTT1JfQkFDS0dST1VORF9DT0xPUikgfHwgYmFja2dyb3VuZENvbG9yO1xuXHRcdGNvbnN0IHNlbGVjdGlvbkJhY2tncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKFRFUk1JTkFMX1NFTEVDVElPTl9CQUNLR1JPVU5EX0NPTE9SKTtcblx0XHRjb25zdCBzZWxlY3Rpb25JbmFjdGl2ZUJhY2tncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKFRFUk1JTkFMX0lOQUNUSVZFX1NFTEVDVElPTl9CQUNLR1JPVU5EX0NPTE9SKTtcblx0XHRjb25zdCBzZWxlY3Rpb25Gb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihURVJNSU5BTF9TRUxFQ1RJT05fRk9SRUdST1VORF9DT0xPUikgfHwgdW5kZWZpbmVkO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGJhY2tncm91bmQ6IGJhY2tncm91bmRDb2xvcj8udG9TdHJpbmcoKSxcblx0XHRcdGZvcmVncm91bmQ6IGZvcmVncm91bmRDb2xvcj8udG9TdHJpbmcoKSxcblx0XHRcdGN1cnNvcjogY3Vyc29yQ29sb3I/LnRvU3RyaW5nKCksXG5cdFx0XHRjdXJzb3JBY2NlbnQ6IGN1cnNvckFjY2VudENvbG9yPy50b1N0cmluZygpLFxuXHRcdFx0c2VsZWN0aW9uQmFja2dyb3VuZDogc2VsZWN0aW9uQmFja2dyb3VuZENvbG9yPy50b1N0cmluZygpLFxuXHRcdFx0c2VsZWN0aW9uSW5hY3RpdmVCYWNrZ3JvdW5kOiBzZWxlY3Rpb25JbmFjdGl2ZUJhY2tncm91bmRDb2xvcj8udG9TdHJpbmcoKSxcblx0XHRcdHNlbGVjdGlvbkZvcmVncm91bmQ6IHNlbGVjdGlvbkZvcmVncm91bmRDb2xvcj8udG9TdHJpbmcoKSxcblx0XHRcdG92ZXJ2aWV3UnVsZXJCb3JkZXI6IGhpZGVPdmVydmlld1J1bGVyID8gJyMwMDAwJyA6IHRoZW1lLmdldENvbG9yKFRFUk1JTkFMX09WRVJWSUVXX1JVTEVSX0JPUkRFUl9DT0xPUik/LnRvU3RyaW5nKCksXG5cdFx0XHRzY3JvbGxiYXJTbGlkZXJBY3RpdmVCYWNrZ3JvdW5kOiB0aGVtZS5nZXRDb2xvcihzY3JvbGxiYXJTbGlkZXJBY3RpdmVCYWNrZ3JvdW5kKT8udG9TdHJpbmcoKSxcblx0XHRcdHNjcm9sbGJhclNsaWRlckJhY2tncm91bmQ6IHRoZW1lLmdldENvbG9yKHNjcm9sbGJhclNsaWRlckJhY2tncm91bmQpPy50b1N0cmluZygpLFxuXHRcdFx0c2Nyb2xsYmFyU2xpZGVySG92ZXJCYWNrZ3JvdW5kOiB0aGVtZS5nZXRDb2xvcihzY3JvbGxiYXJTbGlkZXJIb3ZlckJhY2tncm91bmQpPy50b1N0cmluZygpLFxuXHRcdFx0YmxhY2s6IHRoZW1lLmdldENvbG9yKGFuc2lDb2xvcklkZW50aWZpZXJzWzBdKT8udG9TdHJpbmcoKSxcblx0XHRcdHJlZDogdGhlbWUuZ2V0Q29sb3IoYW5zaUNvbG9ySWRlbnRpZmllcnNbMV0pPy50b1N0cmluZygpLFxuXHRcdFx0Z3JlZW46IHRoZW1lLmdldENvbG9yKGFuc2lDb2xvcklkZW50aWZpZXJzWzJdKT8udG9TdHJpbmcoKSxcblx0XHRcdHllbGxvdzogdGhlbWUuZ2V0Q29sb3IoYW5zaUNvbG9ySWRlbnRpZmllcnNbM10pPy50b1N0cmluZygpLFxuXHRcdFx0Ymx1ZTogdGhlbWUuZ2V0Q29sb3IoYW5zaUNvbG9ySWRlbnRpZmllcnNbNF0pPy50b1N0cmluZygpLFxuXHRcdFx0bWFnZW50YTogdGhlbWUuZ2V0Q29sb3IoYW5zaUNvbG9ySWRlbnRpZmllcnNbNV0pPy50b1N0cmluZygpLFxuXHRcdFx0Y3lhbjogdGhlbWUuZ2V0Q29sb3IoYW5zaUNvbG9ySWRlbnRpZmllcnNbNl0pPy50b1N0cmluZygpLFxuXHRcdFx0d2hpdGU6IHRoZW1lLmdldENvbG9yKGFuc2lDb2xvcklkZW50aWZpZXJzWzddKT8udG9TdHJpbmcoKSxcblx0XHRcdGJyaWdodEJsYWNrOiB0aGVtZS5nZXRDb2xvcihhbnNpQ29sb3JJZGVudGlmaWVyc1s4XSk/LnRvU3RyaW5nKCksXG5cdFx0XHRicmlnaHRSZWQ6IHRoZW1lLmdldENvbG9yKGFuc2lDb2xvcklkZW50aWZpZXJzWzldKT8udG9TdHJpbmcoKSxcblx0XHRcdGJyaWdodEdyZWVuOiB0aGVtZS5nZXRDb2xvcihhbnNpQ29sb3JJZGVudGlmaWVyc1sxMF0pPy50b1N0cmluZygpLFxuXHRcdFx0YnJpZ2h0WWVsbG93OiB0aGVtZS5nZXRDb2xvcihhbnNpQ29sb3JJZGVudGlmaWVyc1sxMV0pPy50b1N0cmluZygpLFxuXHRcdFx0YnJpZ2h0Qmx1ZTogdGhlbWUuZ2V0Q29sb3IoYW5zaUNvbG9ySWRlbnRpZmllcnNbMTJdKT8udG9TdHJpbmcoKSxcblx0XHRcdGJyaWdodE1hZ2VudGE6IHRoZW1lLmdldENvbG9yKGFuc2lDb2xvcklkZW50aWZpZXJzWzEzXSk/LnRvU3RyaW5nKCksXG5cdFx0XHRicmlnaHRDeWFuOiB0aGVtZS5nZXRDb2xvcihhbnNpQ29sb3JJZGVudGlmaWVyc1sxNF0pPy50b1N0cmluZygpLFxuXHRcdFx0YnJpZ2h0V2hpdGU6IHRoZW1lLmdldENvbG9yKGFuc2lDb2xvcklkZW50aWZpZXJzWzE1XSk/LnRvU3RyaW5nKClcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVGhlbWUodGhlbWU/OiBJQ29sb3JUaGVtZSk6IHZvaWQge1xuXHRcdHRoaXMucmF3Lm9wdGlvbnMudGhlbWUgPSB0aGlzLmdldFh0ZXJtVGhlbWUodGhlbWUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIHRlcm1pbmFsIHRoZW1lLiBVc2UgdGhpcyB0byBleHRlcm5hbGx5IHRyaWdnZXIgYSB0aGVtZVxuXHQgKiByZWZyZXNoIGZvciBkZXRhY2hlZCB0ZXJtaW5hbHMgdGhhdCBza2lwIGdsb2JhbCBzZXJ2aWNlIGxpc3RlbmVycy5cblx0ICovXG5cdHVwZGF0ZVRoZW1lKCk6IHZvaWQge1xuXHRcdHRoaXMuX3VwZGF0ZVRoZW1lKCk7XG5cdH1cblxuXHRyZWZyZXNoKCkge1xuXHRcdHRoaXMuX3VwZGF0ZVRoZW1lKCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbkFkZG9uLnJlZnJlc2hMYXlvdXRzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVVbmljb2RlVmVyc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3VuaWNvZGUxMUFkZG9uICYmIHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnVuaWNvZGVWZXJzaW9uID09PSAnMTEnKSB7XG5cdFx0XHRjb25zdCBBZGRvbiA9IGF3YWl0IHRoaXMuX3h0ZXJtQWRkb25Mb2FkZXIuaW1wb3J0QWRkb24oJ3VuaWNvZGUxMScpO1xuXHRcdFx0dGhpcy5fdW5pY29kZTExQWRkb24gPSBuZXcgQWRkb24oKTtcblx0XHRcdHRoaXMucmF3LmxvYWRBZGRvbih0aGlzLl91bmljb2RlMTFBZGRvbik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnJhdy51bmljb2RlLmFjdGl2ZVZlcnNpb24gIT09IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnVuaWNvZGVWZXJzaW9uKSB7XG5cdFx0XHR0aGlzLnJhdy51bmljb2RlLmFjdGl2ZVZlcnNpb24gPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy51bmljb2RlVmVyc2lvbjtcblx0XHR9XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25hbWluZy1jb252ZW50aW9uXG5cdF93cml0ZVRleHQoZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5yYXcud3JpdGUoZGF0YSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FueVRlcm1pbmFsRm9jdXNDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0dGhpcy5fYW55Rm9jdXNlZFRlcm1pbmFsSGFzU2VsZWN0aW9uLnJlc2V0KCk7XG5cdFx0dGhpcy5fZGlzcG9zZU9mV2ViZ2xSZW5kZXJlcigpO1xuXHRcdHRoaXMuX29uRGlkRGlzcG9zZS5maXJlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRYdGVybVNjYWxlZERpbWVuc2lvbnModzogV2luZG93LCBmb250OiBJVGVybWluYWxGb250LCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHsgcm93czogbnVtYmVyOyBjb2xzOiBudW1iZXIgfSB8IG51bGwge1xuXHRpZiAoIWZvbnQuY2hhcldpZHRoIHx8ICFmb250LmNoYXJIZWlnaHQpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdC8vIEJlY2F1c2UgeHRlcm0uanMgY29udmVydHMgZnJvbSBDU1MgcGl4ZWxzIHRvIGFjdHVhbCBwaXhlbHMgdGhyb3VnaFxuXHQvLyB0aGUgdXNlIG9mIGNhbnZhcywgd2luZG93LmRldmljZVBpeGVsUmF0aW8gbmVlZHMgdG8gYmUgdXNlZCBoZXJlIGluXG5cdC8vIG9yZGVyIHRvIGJlIHByZWNpc2UuIGZvbnQuY2hhcldpZHRoL2NoYXJIZWlnaHQgYWxvbmUgYXMgaW5zdWZmaWNpZW50XG5cdC8vIHdoZW4gd2luZG93LmRldmljZVBpeGVsUmF0aW8gY2hhbmdlcy5cblx0Y29uc3Qgc2NhbGVkV2lkdGhBdmFpbGFibGUgPSB3aWR0aCAqIHcuZGV2aWNlUGl4ZWxSYXRpbztcblxuXHRjb25zdCBzY2FsZWRDaGFyV2lkdGggPSBmb250LmNoYXJXaWR0aCAqIHcuZGV2aWNlUGl4ZWxSYXRpbyArIGZvbnQubGV0dGVyU3BhY2luZztcblx0Y29uc3QgY29scyA9IE1hdGgubWF4KE1hdGguZmxvb3Ioc2NhbGVkV2lkdGhBdmFpbGFibGUgLyBzY2FsZWRDaGFyV2lkdGgpLCAxKTtcblxuXHRjb25zdCBzY2FsZWRIZWlnaHRBdmFpbGFibGUgPSBoZWlnaHQgKiB3LmRldmljZVBpeGVsUmF0aW87XG5cdGNvbnN0IHNjYWxlZENoYXJIZWlnaHQgPSBNYXRoLmNlaWwoZm9udC5jaGFySGVpZ2h0ICogdy5kZXZpY2VQaXhlbFJhdGlvKTtcblx0Y29uc3Qgc2NhbGVkTGluZUhlaWdodCA9IE1hdGguZmxvb3Ioc2NhbGVkQ2hhckhlaWdodCAqIGZvbnQubGluZUhlaWdodCk7XG5cdGNvbnN0IHJvd3MgPSBNYXRoLm1heChNYXRoLmZsb29yKHNjYWxlZEhlaWdodEF2YWlsYWJsZSAvIHNjYWxlZExpbmVIZWlnaHQpLCAxKTtcblxuXHRyZXR1cm4geyByb3dzLCBjb2xzIH07XG59XG5cbmZ1bmN0aW9uIHZzY29kZVRvWHRlcm1Mb2dMZXZlbChsb2dMZXZlbDogTG9nTGV2ZWwpOiBYdGVybUxvZ0xldmVsIHtcblx0c3dpdGNoIChsb2dMZXZlbCkge1xuXHRcdGNhc2UgTG9nTGV2ZWwuVHJhY2U6IHJldHVybiAndHJhY2UnO1xuXHRcdGNhc2UgTG9nTGV2ZWwuRGVidWc6IHJldHVybiAnZGVidWcnO1xuXHRcdGNhc2UgTG9nTGV2ZWwuSW5mbzogcmV0dXJuICdpbmZvJztcblx0XHRjYXNlIExvZ0xldmVsLldhcm5pbmc6IHJldHVybiAnd2Fybic7XG5cdFx0Y2FzZSBMb2dMZXZlbC5FcnJvcjogcmV0dXJuICdlcnJvcic7XG5cdFx0ZGVmYXVsdDogcmV0dXJuICdvZmYnO1xuXHR9XG59XG5cbmludGVyZmFjZSBJQ3Vyc29yU3R5bGVWc2NvZGVUb1h0ZXJtTWFwIHtcblx0J2N1cnNvclN0eWxlJzogTm9uTnVsbGFibGU8SVRlcm1pbmFsT3B0aW9uc1snY3Vyc29yU3R5bGUnXT47XG5cdCdjdXJzb3JTdHlsZUluYWN0aXZlJzogTm9uTnVsbGFibGU8SVRlcm1pbmFsT3B0aW9uc1snY3Vyc29ySW5hY3RpdmVTdHlsZSddPjtcbn1cbmZ1bmN0aW9uIHZzY29kZVRvWHRlcm1DdXJzb3JTdHlsZTxUIGV4dGVuZHMgJ2N1cnNvclN0eWxlJyB8ICdjdXJzb3JTdHlsZUluYWN0aXZlJz4oc3R5bGU6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25bVF0pOiBJQ3Vyc29yU3R5bGVWc2NvZGVUb1h0ZXJtTWFwW1RdIHtcblx0Ly8gJ2xpbmUnIGlzIHVzZWQgaW5zdGVhZCBvZiBiYXIgaW4gVlMgQ29kZSB0byBiZSBjb25zaXN0ZW50IHdpdGggZWRpdG9yLmN1cnNvclN0eWxlXG5cdGlmIChzdHlsZSA9PT0gJ2xpbmUnKSB7XG5cdFx0cmV0dXJuICdiYXInO1xuXHR9XG5cdHJldHVybiBzdHlsZSBhcyBJQ3Vyc29yU3R5bGVWc2NvZGVUb1h0ZXJtTWFwW1RdO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFhQSxZQUFZLFNBQVM7QUFFckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxZQUFZLGlCQUFpQix5QkFBeUI7QUFFL0QsU0FBNEIscUJBQXFCLHlCQUFn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TUFBTSx3QkFBd0IsZ0JBQWdCLEdBQUcsQ0FBQztBQUU3RSxTQUFPLEVBQUUsTUFBTSxLQUFLO0FBQ3JCO0FBRUEsU0FBUyxzQkFBc0IsVUFBbUM7QUFDakUsVUFBUSxVQUFVO0FBQUEsSUFDakIsS0FBSyxTQUFTO0FBQU8sYUFBTztBQUFBLElBQzVCLEtBQUssU0FBUztBQUFPLGFBQU87QUFBQSxJQUM1QixLQUFLLFNBQVM7QUFBTSxhQUFPO0FBQUEsSUFDM0IsS0FBSyxTQUFTO0FBQVMsYUFBTztBQUFBLElBQzlCLEtBQUssU0FBUztBQUFPLGFBQU87QUFBQSxJQUM1QjtBQUFTLGFBQU87QUFBQSxFQUNqQjtBQUNEO0FBTUEsU0FBUyx5QkFBMEUsT0FBbUU7QUFFckosTUFBSSxVQUFVLFFBQVE7QUFDckIsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbIlJlbmRlckNvbnN0YW50cyIsICJUZXJtaW5hbFNjcm9sbGJhcldpZHRoIiwgIlRleHRCbGlua0NvbnN0YW50cyIsICJsaXN0ZW5lciJdCn0K
