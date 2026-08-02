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
import { getWindow } from "../../../../base/browser/dom.js";
import { Sequencer } from "../../../../base/common/async.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { ITerminalService } from "./terminal.js";
import { DetachedProcessInfo } from "./detachedTerminal.js";
import { TERMINAL_BACKGROUND_COLOR } from "../common/terminalColorRegistry.js";
import { PANEL_BACKGROUND } from "../../../common/theme.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { Color } from "../../../../base/common/color.js";
function getChatTerminalBackgroundColor(theme, contextKeyService, storedBackground) {
  if (storedBackground) {
    const color = Color.fromHex(storedBackground);
    if (color) {
      return color;
    }
  }
  const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR);
  if (terminalBackground) {
    return terminalBackground;
  }
  const isInEditor = ChatContextKeys.inChatEditor.getValue(contextKeyService);
  return theme.getColor(isInEditor ? editorBackground : PANEL_BACKGROUND);
}
function computeMaxBufferColumnWidth(buffer, cols) {
  let maxWidth = 0;
  for (let y = 0; y < buffer.length; y++) {
    const line = buffer.getLine(y);
    if (!line) {
      continue;
    }
    const lineLength = Math.min(line.length, cols);
    for (let x = lineLength - 1; x >= 0; x--) {
      if (line.getCell(x)?.getChars()) {
        maxWidth = Math.max(maxWidth, x + 1);
        break;
      }
    }
  }
  return maxWidth;
}
function vtBoundaryMatches(newVT, oldVT, slicePoint, windowSize = 50) {
  const start = Math.max(0, slicePoint - windowSize);
  const end = slicePoint;
  for (let i = start; i < end; i++) {
    if (newVT.charCodeAt(i) !== oldVT.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}
var ChatTerminalMirrorMetrics = /* @__PURE__ */ ((ChatTerminalMirrorMetrics2) => {
  ChatTerminalMirrorMetrics2[ChatTerminalMirrorMetrics2["MirrorRowCount"] = 10] = "MirrorRowCount";
  ChatTerminalMirrorMetrics2[ChatTerminalMirrorMetrics2["MirrorColCountFallback"] = 80] = "MirrorColCountFallback";
  ChatTerminalMirrorMetrics2[ChatTerminalMirrorMetrics2["MirrorHorizontalPaddingPx"] = 20] = "MirrorHorizontalPaddingPx";
  ChatTerminalMirrorMetrics2[ChatTerminalMirrorMetrics2["MaxLinesForColumnWidthComputation"] = 100] = "MaxLinesForColumnWidthComputation";
  return ChatTerminalMirrorMetrics2;
})(ChatTerminalMirrorMetrics || {});
function computeChatTerminalMirrorCols(availableWidthPx, font, devicePixelRatio, horizontalChromePx = 20 /* MirrorHorizontalPaddingPx */) {
  if (!isFinite(availableWidthPx) || availableWidthPx <= 0 || !font.charWidth) {
    return 80 /* MirrorColCountFallback */;
  }
  const dpr = isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const scaledWidthAvailable = (availableWidthPx - horizontalChromePx) * dpr;
  const scaledCharWidth = font.charWidth * dpr + font.letterSpacing;
  return Math.max(Math.floor(scaledWidthAvailable / scaledCharWidth), 1);
}
function getMirrorRaw(detached) {
  return detached.xterm.raw;
}
function enableCursorLineReflow(detached) {
  getMirrorRaw(detached).options.reflowCursorLine = true;
}
function getMirrorDevicePixelRatio(detached) {
  return getWindow(getMirrorRaw(detached).element).devicePixelRatio;
}
function measureMirrorHorizontalChrome(detached) {
  const element = getMirrorRaw(detached).element;
  if (!element) {
    return void 0;
  }
  const style = getWindow(element).getComputedStyle(element);
  const chrome = parseInt(style.paddingLeft) + parseInt(style.paddingRight);
  return isNaN(chrome) ? void 0 : Math.max(chrome, 0);
}
function getMirrorRowHeightPx(detached) {
  const font = detached?.xterm.getFont();
  if (!font?.charHeight || font.charHeight <= 0) {
    return void 0;
  }
  const lineHeight = font.lineHeight > 0 ? font.lineHeight : 1;
  return font.charHeight * lineHeight;
}
function computeOutputLineCount(startLine, endLine) {
  return Math.max(endLine - startLine, 0);
}
function computeSnapshotLineCount(buffer, lineCount) {
  if (lineCount !== void 0) {
    return lineCount;
  }
  const cursorLineIndex = buffer.baseY + buffer.cursorY;
  const hasCursorLineContent = !!buffer.getLine(cursorLineIndex)?.translateToString(true);
  const endLine = cursorLineIndex + (hasCursorLineContent ? 1 : 0);
  return computeOutputLineCount(0, endLine);
}
async function getCommandOutputSnapshot(xtermTerminal, command, log) {
  const executedMarker = command.executedMarker;
  const endMarker = command.endMarker;
  if (!endMarker || endMarker.isDisposed) {
    return void 0;
  }
  if (!executedMarker || executedMarker.isDisposed) {
    const raw = xtermTerminal.raw;
    const buffer = raw.buffer.active;
    const offsets = [
      -(buffer.baseY + buffer.cursorY),
      -buffer.baseY,
      0
    ];
    let startMarker;
    for (const offset of offsets) {
      startMarker = raw.registerMarker(offset);
      if (startMarker) {
        break;
      }
    }
    if (!startMarker || startMarker.isDisposed) {
      return { text: "", lineCount: 0 };
    }
    const startLine2 = startMarker.line;
    let text2;
    try {
      text2 = await xtermTerminal.getRangeAsVT(startMarker, endMarker, true);
    } catch (error) {
      log?.("fallback", error);
      return void 0;
    } finally {
      startMarker.dispose();
    }
    if (!text2) {
      return { text: "", lineCount: 0 };
    }
    const endLine2 = endMarker.line;
    const lineCount2 = computeOutputLineCount(startLine2, endLine2);
    return { text: text2, lineCount: lineCount2 };
  }
  const startLine = executedMarker.line;
  const endLine = endMarker.line;
  const lineCount = computeOutputLineCount(startLine, endLine);
  let text;
  try {
    text = await xtermTerminal.getRangeAsVT(executedMarker, endMarker, true);
  } catch (error) {
    log?.("primary", error);
    return void 0;
  }
  if (!text) {
    return { text: "", lineCount: 0 };
  }
  return { text, lineCount };
}
let DetachedTerminalCommandMirror = class extends Disposable {
  constructor(_xtermTerminal, _command, _terminalService, _contextKeyService) {
    super();
    this._xtermTerminal = _xtermTerminal;
    this._command = _command;
    this._terminalService = _terminalService;
    this._contextKeyService = _contextKeyService;
    this._streamingDisposables = this._register(new DisposableStore());
    this._onDidUpdateEmitter = this._register(new Emitter());
    this.onDidUpdate = this._onDidUpdateEmitter.event;
    this._onDidInputEmitter = this._register(new Emitter());
    this.onDidInput = this._onDidInputEmitter.event;
    this._onDidChangeRowHeightEmitter = this._register(new Emitter());
    this.onDidChangeRowHeight = this._onDidChangeRowHeightEmitter.event;
    this._renderListenerInstalled = false;
    this._lastVT = "";
    this._lineCount = 0;
    this._maxColumnWidth = 0;
    this._dirtyScheduled = false;
    this._isStreaming = false;
    this._register(toDisposable(() => {
      this._stopStreaming();
    }));
  }
  async attach(container) {
    if (this._store.isDisposed) {
      return;
    }
    let terminal;
    try {
      terminal = await this._getOrCreateTerminal();
    } catch (error) {
      if (error instanceof CancellationError) {
        return;
      }
      throw error;
    }
    if (this._store.isDisposed) {
      return;
    }
    if (this._attachedContainer !== container) {
      container.classList.add("chat-terminal-output-terminal");
      terminal.attachToElement(container, { enableGpu: false });
      this._attachedContainer = container;
    }
    this._installFirstRenderListener(terminal);
  }
  /**
   * The height in CSS pixels of one rendered row of this mirror, or undefined until the
   * detached terminal exists. Reflects the renderer's actual cell metrics once it has
   * rendered, so box-height math matches what xterm paints.
   */
  getRowHeightPx() {
    if (this._store.isDisposed) {
      return void 0;
    }
    return getMirrorRowHeightPx(this._detachedTerminal);
  }
  _installFirstRenderListener(detached) {
    if (this._renderListenerInstalled) {
      return;
    }
    this._renderListenerInstalled = true;
    this._register(getMirrorRaw(detached).onRender(() => this._notifyRowHeightIfChanged()));
  }
  _notifyRowHeightIfChanged() {
    const rowHeight = this.getRowHeightPx();
    if (rowHeight !== void 0 && rowHeight !== this._lastObservedRowHeight) {
      this._lastObservedRowHeight = rowHeight;
      this._onDidChangeRowHeightEmitter.fire();
    }
  }
  async renderCommand() {
    if (this._store.isDisposed) {
      return void 0;
    }
    let detached;
    try {
      detached = await this._getOrCreateTerminal();
    } catch (error) {
      if (error instanceof CancellationError) {
        return void 0;
      }
      throw error;
    }
    if (this._store.isDisposed) {
      return void 0;
    }
    let vt;
    try {
      vt = await this._getCommandOutputAsVT(this._xtermTerminal);
    } catch {
    }
    if (!vt) {
      return void 0;
    }
    if (this._store.isDisposed) {
      return void 0;
    }
    await new Promise((resolve) => {
      const canAppend = !!this._lastVT && vt.text.length >= this._lastVT.length && this._vtBoundaryMatches(vt.text, this._lastVT.length);
      if (!canAppend) {
        const payload = this._lastVT ? `\x1Bc${vt.text}` : vt.text;
        if (payload) {
          detached.xterm.write(payload, resolve);
        } else {
          resolve();
        }
      } else {
        const appended = vt.text.slice(this._lastVT.length);
        if (appended) {
          detached.xterm.write(appended, resolve);
        } else {
          resolve();
        }
      }
    });
    this._lastVT = vt.text;
    const sourceRaw = this._xtermTerminal.raw;
    if (sourceRaw) {
      this._sourceRaw = sourceRaw;
      this._lastUpToDateCursorY = this._getAbsoluteCursorY(sourceRaw);
      if (!this._isStreaming && (!this._command.endMarker || this._command.endMarker.isDisposed)) {
        this._startStreaming(sourceRaw);
      }
    }
    this._lineCount = this._getRenderedLineCount();
    const commandFinished = this._command.endMarker && !this._command.endMarker.isDisposed;
    if (commandFinished && this._lineCount <= 100 /* MaxLinesForColumnWidthComputation */) {
      this._maxColumnWidth = this._computeMaxColumnWidth();
    }
    return { lineCount: this._lineCount, maxColumnWidth: this._maxColumnWidth };
  }
  /**
   * Resizes the mirror to fill the given width, relying on xterm's native resize reflow to
   * re-wrap soft-wrapped lines. No-op when the resulting cols are unchanged. The column
   * count derives from the mirror's own xterm font metrics, which reflect the actual
   * renderer cell size rather than a configuration-based estimate.
   */
  async layout(widthPx) {
    if (this._store.isDisposed || widthPx <= 0) {
      return void 0;
    }
    let detached;
    try {
      detached = await this._getOrCreateTerminal();
    } catch (error) {
      if (error instanceof CancellationError) {
        return void 0;
      }
      throw error;
    }
    if (this._store.isDisposed) {
      return void 0;
    }
    const cols = computeChatTerminalMirrorCols(widthPx, detached.xterm.getFont(), getMirrorDevicePixelRatio(detached), measureMirrorHorizontalChrome(detached));
    if (detached.xterm.cols === cols) {
      return void 0;
    }
    await this._flushPromise;
    if (this._store.isDisposed || detached.xterm.cols === cols) {
      return void 0;
    }
    detached.xterm.resize(cols, 10 /* MirrorRowCount */);
    if (!this._lastVT) {
      return void 0;
    }
    this._lineCount = this._getRenderedLineCount();
    const commandFinished = this._command.endMarker && !this._command.endMarker.isDisposed;
    if (commandFinished && this._lineCount <= 100 /* MaxLinesForColumnWidthComputation */) {
      this._maxColumnWidth = this._computeMaxColumnWidth();
    }
    return { lineCount: this._lineCount, maxColumnWidth: this._maxColumnWidth };
  }
  async _getCommandOutputAsVT(source) {
    if (this._store.isDisposed) {
      return void 0;
    }
    const executedMarker = this._command.executedMarker ?? this._command.commandExecutedMarker;
    if (!executedMarker) {
      return void 0;
    }
    const endMarker = this._command.endMarker;
    const text = await source.getRangeAsVT(executedMarker, endMarker, endMarker?.line !== executedMarker.line);
    if (this._store.isDisposed) {
      return void 0;
    }
    if (!text) {
      return { text: "" };
    }
    return { text };
  }
  _getRenderedLineCount() {
    const detachedBuffer = this._detachedTerminal?.xterm.buffer.active;
    if (detachedBuffer) {
      return computeSnapshotLineCount(detachedBuffer);
    }
    const endMarker = this._command.endMarker;
    if (this._command.executedMarker && endMarker && !endMarker.isDisposed) {
      const startLine = this._command.executedMarker.line;
      const endLine = endMarker.line;
      return computeOutputLineCount(startLine, endLine);
    }
    const executedMarker = this._command.executedMarker ?? this._command.commandExecutedMarker;
    if (executedMarker && this._sourceRaw) {
      const buffer = this._sourceRaw.buffer.active;
      const currentLine = buffer.baseY + buffer.cursorY;
      return computeOutputLineCount(executedMarker.line, currentLine);
    }
    return this._lineCount;
  }
  _computeMaxColumnWidth() {
    const detached = this._detachedTerminal;
    if (!detached) {
      return 0;
    }
    return computeMaxBufferColumnWidth(detached.xterm.buffer.active, detached.xterm.cols);
  }
  async _getOrCreateTerminal() {
    if (this._detachedTerminal) {
      return this._detachedTerminal;
    }
    if (this._detachedTerminalPromise) {
      return this._detachedTerminalPromise;
    }
    if (this._store.isDisposed) {
      throw new CancellationError();
    }
    const createPromise = (async () => {
      const colorProvider = {
        getBackgroundColor: (theme) => getChatTerminalBackgroundColor(theme, this._contextKeyService)
      };
      const processInfo = new DetachedProcessInfo({ initialCwd: "" });
      const detached = await this._terminalService.createDetachedTerminal({
        cols: this._xtermTerminal.raw.cols ?? 80 /* MirrorColCountFallback */,
        rows: 10 /* MirrorRowCount */,
        readonly: false,
        processInfo,
        disableOverviewRuler: true,
        colorProvider
      });
      if (this._store.isDisposed) {
        processInfo.dispose();
        detached.dispose();
        throw new CancellationError();
      }
      enableCursorLineReflow(detached);
      this._detachedTerminal = detached;
      this._register(processInfo);
      this._register(detached);
      this._register(detached.onData((data) => this._onDidInputEmitter.fire(data)));
      return detached;
    })();
    this._detachedTerminalPromise = createPromise;
    return createPromise;
  }
  _startStreaming(raw) {
    if (this._store.isDisposed || this._isStreaming) {
      return;
    }
    this._isStreaming = true;
    this._streamingDisposables.add(Event.any(raw.onCursorMove, raw.onLineFeed, raw.onWriteParsed)(() => this._handleCursorEvent()));
    this._streamingDisposables.add(raw.onData(() => this._handleCursorEvent()));
  }
  _stopStreaming() {
    if (!this._isStreaming) {
      return;
    }
    this._streamingDisposables.clear();
    this._isStreaming = false;
    this._lowestDirtyCursorY = void 0;
    this._sourceRaw = void 0;
  }
  _handleCursorEvent() {
    if (this._store.isDisposed || !this._sourceRaw) {
      return;
    }
    const cursorY = this._getAbsoluteCursorY(this._sourceRaw);
    this._lowestDirtyCursorY = this._lowestDirtyCursorY === void 0 ? cursorY : Math.min(this._lowestDirtyCursorY, cursorY);
    this._scheduleFlush();
  }
  _scheduleFlush() {
    if (this._dirtyScheduled || this._store.isDisposed) {
      return;
    }
    this._dirtyScheduled = true;
    queueMicrotask(() => {
      this._dirtyScheduled = false;
      if (this._store.isDisposed) {
        return;
      }
      this._flushDirtyRange();
    });
  }
  _flushDirtyRange() {
    if (this._store.isDisposed || this._flushPromise) {
      return;
    }
    this._flushPromise = this._doFlushDirtyRange().finally(() => {
      this._flushPromise = void 0;
    });
  }
  async _doFlushDirtyRange() {
    if (this._store.isDisposed) {
      return;
    }
    const sourceRaw = this._xtermTerminal.raw;
    let detached = this._detachedTerminal;
    if (!detached) {
      try {
        detached = await this._getOrCreateTerminal();
      } catch (error) {
        if (error instanceof CancellationError) {
          return;
        }
        throw error;
      }
    }
    if (this._store.isDisposed) {
      return;
    }
    const detachedRaw = detached?.xterm;
    if (!sourceRaw || !detachedRaw) {
      return;
    }
    this._sourceRaw = sourceRaw;
    const currentCursor = this._getAbsoluteCursorY(sourceRaw);
    const previousCursor = this._lastUpToDateCursorY ?? currentCursor;
    const startCandidate = this._lowestDirtyCursorY ?? currentCursor;
    this._lowestDirtyCursorY = void 0;
    const startLine = Math.min(previousCursor, startCandidate);
    const vt = await this._getCommandOutputAsVT(this._xtermTerminal);
    if (!vt) {
      return;
    }
    if (this._store.isDisposed) {
      return;
    }
    if (vt.text === this._lastVT) {
      this._lastUpToDateCursorY = currentCursor;
      if (this._command.endMarker && !this._command.endMarker.isDisposed) {
        this._stopStreaming();
      }
      return;
    }
    const canAppend = !!this._lastVT && startLine >= previousCursor && vt.text.length >= this._lastVT.length && this._vtBoundaryMatches(vt.text, this._lastVT.length);
    await new Promise((resolve) => {
      if (!canAppend) {
        const payload = this._lastVT ? `\x1Bc${vt.text}` : vt.text;
        if (payload) {
          detachedRaw.write(payload, resolve);
        } else {
          resolve();
        }
      } else {
        const appended = vt.text.slice(this._lastVT.length);
        if (appended) {
          detachedRaw.write(appended, resolve);
        } else {
          resolve();
        }
      }
    });
    this._lastVT = vt.text;
    this._lineCount = this._getRenderedLineCount();
    this._lastUpToDateCursorY = currentCursor;
    const commandFinished = this._command.endMarker && !this._command.endMarker.isDisposed;
    if (commandFinished) {
      if (this._lineCount <= 100 /* MaxLinesForColumnWidthComputation */) {
        this._maxColumnWidth = this._computeMaxColumnWidth();
      }
      this._stopStreaming();
    }
    this._onDidUpdateEmitter.fire({ lineCount: this._lineCount, maxColumnWidth: this._maxColumnWidth });
  }
  _getAbsoluteCursorY(raw) {
    return raw.buffer.active.baseY + raw.buffer.active.cursorY;
  }
  /**
   * Checks if the new VT text matches the old VT around the boundary where we would slice.
   */
  _vtBoundaryMatches(newVT, slicePoint) {
    return vtBoundaryMatches(newVT, this._lastVT, slicePoint);
  }
};
DetachedTerminalCommandMirror = __decorateClass([
  __decorateParam(2, ITerminalService),
  __decorateParam(3, IContextKeyService)
], DetachedTerminalCommandMirror);
let DetachedTerminalSnapshotMirror = class extends Disposable {
  constructor(output, _getTheme, _terminalService, _contextKeyService) {
    super();
    this._getTheme = _getTheme;
    this._terminalService = _terminalService;
    this._contextKeyService = _contextKeyService;
    this._renderSequencer = new Sequencer();
    this._outputVersion = 0;
    this._renderedVersion = -1;
    this._lastRenderedText = "";
    this._onDidChangeRowHeightEmitter = this._register(new Emitter());
    this.onDidChangeRowHeight = this._onDidChangeRowHeightEmitter.event;
    this._renderListenerInstalled = false;
    this._output = output;
    const processInfo = this._register(new DetachedProcessInfo({ initialCwd: "" }));
    this._detachedTerminal = this._terminalService.createDetachedTerminal({
      cols: 80 /* MirrorColCountFallback */,
      rows: 10 /* MirrorRowCount */,
      readonly: true,
      processInfo,
      disableOverviewRuler: true,
      colorProvider: {
        getBackgroundColor: (theme) => {
          const storedBackground = this._getTheme()?.background;
          return getChatTerminalBackgroundColor(theme, this._contextKeyService, storedBackground);
        }
      }
    }).then((terminal) => {
      if (this._store.isDisposed) {
        terminal.dispose();
        return terminal;
      }
      enableCursorLineReflow(terminal);
      this._resolvedTerminal = terminal;
      return this._register(terminal);
    });
  }
  /**
   * The height in CSS pixels of one rendered row of this mirror, or undefined until the
   * detached terminal exists. Reflects the renderer's actual cell metrics once it has
   * rendered, so box-height math matches what xterm paints.
   */
  getRowHeightPx() {
    if (this._store.isDisposed) {
      return void 0;
    }
    return getMirrorRowHeightPx(this._resolvedTerminal);
  }
  async _getTerminal() {
    if (!this._detachedTerminal) {
      throw new Error("Detached terminal not initialized");
    }
    return this._detachedTerminal;
  }
  setOutput(output) {
    this._output = output;
    this._outputVersion++;
  }
  async attach(container) {
    const terminal = await this._getTerminal();
    if (this._store.isDisposed) {
      return;
    }
    container.classList.add("chat-terminal-output-terminal");
    const needsAttach = this._attachedContainer !== container || container.firstChild === null;
    if (needsAttach) {
      terminal.attachToElement(container, { enableGpu: false });
      this._attachedContainer = container;
    }
    if (!this._renderListenerInstalled) {
      this._renderListenerInstalled = true;
      this._register(getMirrorRaw(terminal).onRender(() => {
        const rowHeight = this.getRowHeightPx();
        if (rowHeight !== void 0 && rowHeight !== this._lastObservedRowHeight) {
          this._lastObservedRowHeight = rowHeight;
          this._onDidChangeRowHeightEmitter.fire();
        }
      }));
    }
    this._container = container;
    this._applyTheme(container);
  }
  async render() {
    return this._renderSequencer.queue(() => this._render());
  }
  /**
   * Resizes the mirror to fill the given width, relying on xterm's native resize reflow to
   * re-wrap soft-wrapped lines. No-op when the resulting cols are unchanged. The column
   * count derives from the mirror's own xterm font metrics, which reflect the actual
   * renderer cell size rather than a configuration-based estimate.
   */
  async layout(widthPx) {
    if (widthPx <= 0) {
      return void 0;
    }
    return this._renderSequencer.queue(async () => {
      const terminal = await this._getTerminal();
      if (this._store.isDisposed) {
        return void 0;
      }
      const cols = computeChatTerminalMirrorCols(widthPx, terminal.xterm.getFont(), getMirrorDevicePixelRatio(terminal), measureMirrorHorizontalChrome(terminal));
      if (terminal.xterm.cols === cols) {
        return void 0;
      }
      terminal.xterm.resize(cols, 10 /* MirrorRowCount */);
      if (!this._lastRenderedText) {
        return void 0;
      }
      const lineCount = computeSnapshotLineCount(terminal.xterm.buffer.active, this._output?.truncated ? this._output.lineCount : void 0);
      this._lastRenderedLineCount = lineCount;
      if (this._shouldComputeMaxColumnWidth(lineCount)) {
        this._lastRenderedMaxColumnWidth = this._computeMaxColumnWidth(terminal);
      }
      return { lineCount, maxColumnWidth: this._lastRenderedMaxColumnWidth };
    });
  }
  async _render() {
    const output = this._output;
    const outputVersion = this._outputVersion;
    if (!output) {
      return void 0;
    }
    if (outputVersion === this._renderedVersion) {
      return { lineCount: this._lastRenderedLineCount ?? output.lineCount, maxColumnWidth: this._lastRenderedMaxColumnWidth };
    }
    const terminal = await this._getTerminal();
    if (this._store.isDisposed) {
      return void 0;
    }
    if (this._container) {
      this._applyTheme(this._container);
    }
    const text = output.text ?? "";
    if (!text) {
      if (this._lastRenderedText) {
        await new Promise((resolve) => terminal.xterm.write("\x1B[2J\x1B[3J\x1B[H", resolve));
      }
      const lineCount2 = output.lineCount ?? 0;
      this._renderedVersion = outputVersion;
      this._lastRenderedText = "";
      this._lastRenderedLineCount = lineCount2;
      this._lastRenderedMaxColumnWidth = 0;
      return { lineCount: lineCount2, maxColumnWidth: 0 };
    }
    const write = text.startsWith(this._lastRenderedText) ? text.slice(this._lastRenderedText.length) : `\x1B[2J\x1B[3J\x1B[H${text}`;
    if (write) {
      await new Promise((resolve) => terminal.xterm.write(write, resolve));
    }
    if (this._store.isDisposed) {
      return void 0;
    }
    const lineCount = computeSnapshotLineCount(terminal.xterm.buffer.active, output.truncated ? output.lineCount : void 0);
    this._renderedVersion = outputVersion;
    this._lastRenderedText = text;
    this._lastRenderedLineCount = lineCount;
    if (this._shouldComputeMaxColumnWidth(lineCount)) {
      this._lastRenderedMaxColumnWidth = this._computeMaxColumnWidth(terminal);
    }
    return { lineCount, maxColumnWidth: this._lastRenderedMaxColumnWidth };
  }
  _computeMaxColumnWidth(terminal) {
    return computeMaxBufferColumnWidth(terminal.xterm.buffer.active, terminal.xterm.cols);
  }
  _shouldComputeMaxColumnWidth(lineCount) {
    return lineCount <= 100 /* MaxLinesForColumnWidthComputation */;
  }
  _applyTheme(container) {
    const theme = this._getTheme();
    if (!theme) {
      container.style.removeProperty("background-color");
      container.style.removeProperty("color");
      return;
    }
    if (theme.background) {
      container.style.backgroundColor = theme.background;
    }
    if (theme.foreground) {
      container.style.color = theme.foreground;
    }
  }
};
DetachedTerminalSnapshotMirror = __decorateClass([
  __decorateParam(2, ITerminalService),
  __decorateParam(3, IContextKeyService)
], DetachedTerminalSnapshotMirror);
export {
  DetachedTerminalCommandMirror,
  DetachedTerminalSnapshotMirror,
  computeChatTerminalMirrorCols,
  computeMaxBufferColumnWidth,
  computeSnapshotLineCount,
  getCommandOutputSnapshot,
  vtBoundaryMatches
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvY2hhdFRlcm1pbmFsQ29tbWFuZE1pcnJvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU2VxdWVuY2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElNYXJrZXIgYXMgSVh0ZXJtTWFya2VyLCBUZXJtaW5hbCBhcyBSYXdYdGVybVRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB0eXBlIHsgSVRlcm1pbmFsQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNlcnZpY2UsIHR5cGUgSURldGFjaGVkVGVybWluYWxJbnN0YW5jZSwgdHlwZSBJRGV0YWNoZWRYdGVybVRlcm1pbmFsIH0gZnJvbSAnLi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBEZXRhY2hlZFByb2Nlc3NJbmZvIH0gZnJvbSAnLi9kZXRhY2hlZFRlcm1pbmFsLmpzJztcbmltcG9ydCB7IFh0ZXJtVGVybWluYWwgfSBmcm9tICcuL3h0ZXJtL3h0ZXJtVGVybWluYWwuanMnO1xuaW1wb3J0IHsgVEVSTUlOQUxfQkFDS0dST1VORF9DT0xPUiB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbENvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUEFORUxfQkFDS0dST1VORCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGVkaXRvckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB0eXBlIHsgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSUNvbG9yVGhlbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDdXJyZW50UGFydGlhbENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NvbW1hbmREZXRlY3Rpb24vdGVybWluYWxDb21tYW5kLmpzJztcbmltcG9ydCB0eXBlIHsgSVRlcm1pbmFsRm9udCB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5cbmZ1bmN0aW9uIGdldENoYXRUZXJtaW5hbEJhY2tncm91bmRDb2xvcih0aGVtZTogSUNvbG9yVGhlbWUsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsIHN0b3JlZEJhY2tncm91bmQ/OiBzdHJpbmcpOiBDb2xvciB8IHVuZGVmaW5lZCB7XG5cdGlmIChzdG9yZWRCYWNrZ3JvdW5kKSB7XG5cdFx0Y29uc3QgY29sb3IgPSBDb2xvci5mcm9tSGV4KHN0b3JlZEJhY2tncm91bmQpO1xuXHRcdGlmIChjb2xvcikge1xuXHRcdFx0cmV0dXJuIGNvbG9yO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHRlcm1pbmFsQmFja2dyb3VuZCA9IHRoZW1lLmdldENvbG9yKFRFUk1JTkFMX0JBQ0tHUk9VTkRfQ09MT1IpO1xuXHRpZiAodGVybWluYWxCYWNrZ3JvdW5kKSB7XG5cdFx0cmV0dXJuIHRlcm1pbmFsQmFja2dyb3VuZDtcblx0fVxuXG5cdGNvbnN0IGlzSW5FZGl0b3IgPSBDaGF0Q29udGV4dEtleXMuaW5DaGF0RWRpdG9yLmdldFZhbHVlKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0cmV0dXJuIHRoZW1lLmdldENvbG9yKGlzSW5FZGl0b3IgPyBlZGl0b3JCYWNrZ3JvdW5kIDogUEFORUxfQkFDS0dST1VORCk7XG59XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG1heGltdW0gY29sdW1uIHdpZHRoIG9mIGNvbnRlbnQgaW4gYSB0ZXJtaW5hbCBidWZmZXIuXG4gKiBJdGVyYXRlcyB0aHJvdWdoIGVhY2ggbGluZSBhbmQgZmluZHMgdGhlIHJpZ2h0bW9zdCBub24tZW1wdHkgY2VsbC5cbiAqXG4gKiBAcGFyYW0gYnVmZmVyIFRoZSBidWZmZXIgdG8gbWVhc3VyZVxuICogQHBhcmFtIGNvbHMgVGhlIHRlcm1pbmFsIGNvbHVtbiBjb3VudCAodXNlZCB0byBjbGFtcCBsaW5lIGxlbmd0aClcbiAqIEByZXR1cm5zIFRoZSBtYXhpbXVtIGNvbHVtbiB3aWR0aCAobnVtYmVyIG9mIGNvbHVtbnMgdXNlZCksIG9yIDAgaWYgYWxsIGxpbmVzIGFyZSBlbXB0eVxuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZU1heEJ1ZmZlckNvbHVtbldpZHRoKGJ1ZmZlcjogeyByZWFkb25seSBsZW5ndGg6IG51bWJlcjsgZ2V0TGluZSh5OiBudW1iZXIpOiB7IHJlYWRvbmx5IGxlbmd0aDogbnVtYmVyOyBnZXRDZWxsKHg6IG51bWJlcik6IHsgZ2V0Q2hhcnMoKTogc3RyaW5nIH0gfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZCB9LCBjb2xzOiBudW1iZXIpOiBudW1iZXIge1xuXHRsZXQgbWF4V2lkdGggPSAwO1xuXG5cdGZvciAobGV0IHkgPSAwOyB5IDwgYnVmZmVyLmxlbmd0aDsgeSsrKSB7XG5cdFx0Y29uc3QgbGluZSA9IGJ1ZmZlci5nZXRMaW5lKHkpO1xuXHRcdGlmICghbGluZSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gRmluZCB0aGUgbGFzdCBub24tZW1wdHkgY2VsbCBieSBpdGVyYXRpbmcgYmFja3dhcmRzXG5cdFx0Y29uc3QgbGluZUxlbmd0aCA9IE1hdGgubWluKGxpbmUubGVuZ3RoLCBjb2xzKTtcblx0XHRmb3IgKGxldCB4ID0gbGluZUxlbmd0aCAtIDE7IHggPj0gMDsgeC0tKSB7XG5cdFx0XHRpZiAobGluZS5nZXRDZWxsKHgpPy5nZXRDaGFycygpKSB7XG5cdFx0XHRcdG1heFdpZHRoID0gTWF0aC5tYXgobWF4V2lkdGgsIHggKyAxKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG1heFdpZHRoO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiB0d28gVlQgc3RyaW5ncyBtYXRjaCBhcm91bmQgYSBib3VuZGFyeSB3aGVyZSB3ZSB3b3VsZCBzbGljZS5cbiAqIFRoaXMgaXMgYW4gZWZmaWNpZW50IE8oMSkgY2hlY2sgdGhhdCB2ZXJpZmllcyBhIHNtYWxsIHdpbmRvdyBvZiBjaGFyYWN0ZXJzXG4gKiBiZWZvcmUgdGhlIHNsaWNlIHBvaW50IHRvIGRldGVjdCBpZiB0aGUgVlQgc2VxdWVuY2VzIGhhdmUgZGl2ZXJnZWQgKGNvbW1vbiBvbiBXaW5kb3dzKS5cbiAqXG4gKiBAcGFyYW0gbmV3VlQgVGhlIG5ldyBWVCB0ZXh0IHRvIGNvbXBhcmUuXG4gKiBAcGFyYW0gb2xkVlQgVGhlIG9sZCBWVCB0ZXh0IHRvIGNvbXBhcmUgYWdhaW5zdC5cbiAqIEBwYXJhbSBzbGljZVBvaW50IFRoZSBwb2ludCB3aGVyZSB3ZSB3b3VsZCBzbGljZS4gTXVzdCBiZSA8PSBib3RoIHN0cmluZyBsZW5ndGhzLlxuICogQHBhcmFtIHdpbmRvd1NpemUgVGhlIG51bWJlciBvZiBjaGFyYWN0ZXJzIGJlZm9yZSBzbGljZVBvaW50IHRvIGNoZWNrIChkZWZhdWx0IDUwKS5cbiAqIEByZXR1cm5zIFRydWUgaWYgdGhlIGJvdW5kYXJ5IG1hdGNoZXMsIGZhbHNlIGlmIFZUIHNlcXVlbmNlcyBoYXZlIGRpdmVyZ2VkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdnRCb3VuZGFyeU1hdGNoZXMobmV3VlQ6IHN0cmluZywgb2xkVlQ6IHN0cmluZywgc2xpY2VQb2ludDogbnVtYmVyLCB3aW5kb3dTaXplOiBudW1iZXIgPSA1MCk6IGJvb2xlYW4ge1xuXHRjb25zdCBzdGFydCA9IE1hdGgubWF4KDAsIHNsaWNlUG9pbnQgLSB3aW5kb3dTaXplKTtcblx0Y29uc3QgZW5kID0gc2xpY2VQb2ludDtcblx0Zm9yIChsZXQgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcblx0XHRpZiAobmV3VlQuY2hhckNvZGVBdChpKSAhPT0gb2xkVlQuY2hhckNvZGVBdChpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGV0YWNoZWRUZXJtaW5hbENvbW1hbmRNaXJyb3JSZW5kZXJSZXN1bHQge1xuXHRsaW5lQ291bnQ/OiBudW1iZXI7XG5cdG1heENvbHVtbldpZHRoPzogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSURldGFjaGVkVGVybWluYWxDb21tYW5kTWlycm9yIHtcblx0YXR0YWNoKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+O1xuXHRyZW5kZXJDb21tYW5kKCk6IFByb21pc2U8SURldGFjaGVkVGVybWluYWxDb21tYW5kTWlycm9yUmVuZGVyUmVzdWx0IHwgdW5kZWZpbmVkPjtcblx0bGF5b3V0KHdpZHRoUHg6IG51bWJlcik6IFByb21pc2U8SURldGFjaGVkVGVybWluYWxDb21tYW5kTWlycm9yUmVuZGVyUmVzdWx0IHwgdW5kZWZpbmVkPjtcblx0Z2V0Um93SGVpZ2h0UHgoKTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRvbkRpZFVwZGF0ZTogRXZlbnQ8SURldGFjaGVkVGVybWluYWxDb21tYW5kTWlycm9yUmVuZGVyUmVzdWx0Pjtcblx0b25EaWRJbnB1dDogRXZlbnQ8c3RyaW5nPjtcblx0b25EaWRDaGFuZ2VSb3dIZWlnaHQ6IEV2ZW50PHZvaWQ+O1xufVxuXG5jb25zdCBlbnVtIENoYXRUZXJtaW5hbE1pcnJvck1ldHJpY3Mge1xuXHRNaXJyb3JSb3dDb3VudCA9IDEwLFxuXHRNaXJyb3JDb2xDb3VudEZhbGxiYWNrID0gODAsXG5cdC8qKlxuXHQgKiBQcmUtYXR0YWNoIGVzdGltYXRlIG9mIHRoZSBob3Jpem9udGFsIHNwYWNlIHRoZSBtaXJyb3IgY29udGVudCBjYW5ub3QgdXNlOiB0aGUgZ3V0dGVyXG5cdCAqIGV2ZXJ5IHdvcmtiZW5jaCB4dGVybSBnZXRzIHZpYSBgLm1vbmFjby13b3JrYmVuY2ggLnh0ZXJtIHsgcGFkZGluZy1sZWZ0OiAyMHB4IH1gXG5cdCAqICh0ZXJtaW5hbC5jc3MpLiBPbmNlIGF0dGFjaGVkLCB0aGUgcmVhbCB2YWx1ZSBpcyBtZWFzdXJlZCBmcm9tIGNvbXB1dGVkIHN0eWxlcy5cblx0ICovXG5cdE1pcnJvckhvcml6b250YWxQYWRkaW5nUHggPSAyMCxcblx0LyoqXG5cdCAqIE1heGltdW0gbnVtYmVyIG9mIGxpbmVzIGZvciB3aGljaCB3ZSBjb21wdXRlIHRoZSBtYXggY29sdW1uIHdpZHRoLlxuXHQgKiBDb21wdXRpbmcgbWF4IGNvbHVtbiB3aWR0aCBpdGVyYXRlcyB0aGUgZW50aXJlIGJ1ZmZlciwgc28gd2Ugc2tpcCBpdFxuXHQgKiBmb3IgbGFyZ2Ugb3V0cHV0cyB0byBhdm9pZCBwZXJmb3JtYW5jZSBpc3N1ZXMuXG5cdCAqL1xuXHRNYXhMaW5lc0ZvckNvbHVtbldpZHRoQ29tcHV0YXRpb24gPSAxMDBcbn1cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbnVtYmVyIG9mIGNvbHVtbnMgYSBjaGF0IHRlcm1pbmFsIG1pcnJvciBzaG91bGQgdXNlIHRvIGZpbGwgdGhlIGF2YWlsYWJsZSB3aWR0aFxuICogb2YgaXRzIGNvbnRhaW5lciwgdXNpbmcgdGhlIHNhbWUgY2VsbCBtYXRoIGFzIHtAbGluayBnZXRYdGVybVNjYWxlZERpbWVuc2lvbnN9LlxuICpcbiAqIEBwYXJhbSBhdmFpbGFibGVXaWR0aFB4IFRoZSBjb250YWluZXIgd2lkdGggaW4gQ1NTIHBpeGVscy5cbiAqIEBwYXJhbSBmb250IFRoZSB0ZXJtaW5hbCBmb250IHdpdGggbWVhc3VyZWQgY2hhciBtZXRyaWNzLlxuICogQHBhcmFtIGRldmljZVBpeGVsUmF0aW8gVGhlIHdpbmRvdydzIGRldmljZSBwaXhlbCByYXRpby5cbiAqIEBwYXJhbSBob3Jpem9udGFsQ2hyb21lUHggSG9yaXpvbnRhbCBzcGFjZSB0aGUgRE9NIGNocm9tZSB0YWtlcyBmcm9tIHRoZSBjb250YWluZXIgd2lkdGgsXG4gKiBtZWFzdXJlZCBmcm9tIGNvbXB1dGVkIHN0eWxlcyB3aGVuIGF2YWlsYWJsZTsgZGVmYXVsdHMgdG8gdGhlIHN0YXRpYyBlc3RpbWF0ZS5cbiAqIEByZXR1cm5zIFRoZSBjb2x1bW4gY291bnQsIG9yIHRoZSBkZWZhdWx0IGZhbGxiYWNrIHdoZW4gdGhlIHdpZHRoIG9yIGZvbnQgaXMgdW5tZWFzdXJhYmxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZUNoYXRUZXJtaW5hbE1pcnJvckNvbHMoYXZhaWxhYmxlV2lkdGhQeDogbnVtYmVyLCBmb250OiBJVGVybWluYWxGb250LCBkZXZpY2VQaXhlbFJhdGlvOiBudW1iZXIsIGhvcml6b250YWxDaHJvbWVQeDogbnVtYmVyID0gQ2hhdFRlcm1pbmFsTWlycm9yTWV0cmljcy5NaXJyb3JIb3Jpem9udGFsUGFkZGluZ1B4KTogbnVtYmVyIHtcblx0aWYgKCFpc0Zpbml0ZShhdmFpbGFibGVXaWR0aFB4KSB8fCBhdmFpbGFibGVXaWR0aFB4IDw9IDAgfHwgIWZvbnQuY2hhcldpZHRoKSB7XG5cdFx0cmV0dXJuIENoYXRUZXJtaW5hbE1pcnJvck1ldHJpY3MuTWlycm9yQ29sQ291bnRGYWxsYmFjaztcblx0fVxuXHRjb25zdCBkcHIgPSBpc0Zpbml0ZShkZXZpY2VQaXhlbFJhdGlvKSAmJiBkZXZpY2VQaXhlbFJhdGlvID4gMCA/IGRldmljZVBpeGVsUmF0aW8gOiAxO1xuXHRjb25zdCBzY2FsZWRXaWR0aEF2YWlsYWJsZSA9IChhdmFpbGFibGVXaWR0aFB4IC0gaG9yaXpvbnRhbENocm9tZVB4KSAqIGRwcjtcblx0Y29uc3Qgc2NhbGVkQ2hhcldpZHRoID0gZm9udC5jaGFyV2lkdGggKiBkcHIgKyBmb250LmxldHRlclNwYWNpbmc7XG5cdHJldHVybiBNYXRoLm1heChNYXRoLmZsb29yKHNjYWxlZFdpZHRoQXZhaWxhYmxlIC8gc2NhbGVkQ2hhcldpZHRoKSwgMSk7XG59XG5cbmZ1bmN0aW9uIGdldE1pcnJvclJhdyhkZXRhY2hlZDogSURldGFjaGVkVGVybWluYWxJbnN0YW5jZSk6IFJhd1h0ZXJtVGVybWluYWwge1xuXHRyZXR1cm4gKGRldGFjaGVkLnh0ZXJtIGFzIElEZXRhY2hlZFh0ZXJtVGVybWluYWwgJiB7IHJhdzogUmF3WHRlcm1UZXJtaW5hbCB9KS5yYXc7XG59XG5cbi8qKlxuICogRW5hYmxlcyBjdXJzb3IgbGluZSByZWZsb3cgb24gYSBtaXJyb3IncyB0ZXJtaW5hbC4gVGhlIG1pcnJvciBpcyBhIHJlYWRvbmx5IG91dHB1dCBwcmV2aWV3XG4gKiB3aXRoIG5vIHByb21wdCBsaW5lIHRvIHByb3RlY3QsIHNvIHJlc2l6ZSByZWZsb3cgc2hvdWxkIHJlLXdyYXAgdGhlIGN1cnNvciBsaW5lIGxpa2UgYW55XG4gKiBvdGhlciBsaW5lICh4dGVybSBza2lwcyBpdCBieSBkZWZhdWx0KS5cbiAqL1xuZnVuY3Rpb24gZW5hYmxlQ3Vyc29yTGluZVJlZmxvdyhkZXRhY2hlZDogSURldGFjaGVkVGVybWluYWxJbnN0YW5jZSk6IHZvaWQge1xuXHRnZXRNaXJyb3JSYXcoZGV0YWNoZWQpLm9wdGlvbnMucmVmbG93Q3Vyc29yTGluZSA9IHRydWU7XG59XG5cbi8qKlxuICogR2V0cyB0aGUgZGV2aWNlIHBpeGVsIHJhdGlvIG9mIHRoZSB3aW5kb3cgdGhlIG1pcnJvcidzIHRlcm1pbmFsIGlzIHJlbmRlcmVkIGluLCBzbyBjZWxsXG4gKiBtYXRoIHN0YXlzIGNvcnJlY3QgaW4gYXV4aWxpYXJ5IHdpbmRvd3Mgb24gbW9uaXRvcnMgd2l0aCBkaWZmZXJlbnQgc2NhbGluZy5cbiAqL1xuZnVuY3Rpb24gZ2V0TWlycm9yRGV2aWNlUGl4ZWxSYXRpbyhkZXRhY2hlZDogSURldGFjaGVkVGVybWluYWxJbnN0YW5jZSk6IG51bWJlciB7XG5cdHJldHVybiBnZXRXaW5kb3coZ2V0TWlycm9yUmF3KGRldGFjaGVkKS5lbGVtZW50KS5kZXZpY2VQaXhlbFJhdGlvO1xufVxuXG4vKipcbiAqIE1lYXN1cmVzIHRoZSBob3Jpem9udGFsIHNwYWNlIHRoZSBtaXJyb3IncyBET00gY2hyb21lIHRha2VzIGZyb20gdGhlIGNvbnRhaW5lciB3aWR0aCBieVxuICogcmVhZGluZyB0aGUgeHRlcm0gZWxlbWVudCdzIGNvbXB1dGVkIHBhZGRpbmcsIHRoZSBzYW1lIHdheSB0aGUgcGFuZWwgdGVybWluYWwgZG9lcy4geHRlcm0nc1xuICogb3duIHNjcm9sbGJhciBpcyBoaWRkZW4gaW4gdGhlIGNoYXQgcHJldmlldywgc28gdW5saWtlIHRoZSBwYW5lbCB0ZXJtaW5hbCBpdCB0YWtlcyBub1xuICogc3BhY2UuIFJldHVybnMgdW5kZWZpbmVkIGJlZm9yZSB0aGUgdGVybWluYWwgaXMgYXR0YWNoZWQuXG4gKi9cbmZ1bmN0aW9uIG1lYXN1cmVNaXJyb3JIb3Jpem9udGFsQ2hyb21lKGRldGFjaGVkOiBJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZWxlbWVudCA9IGdldE1pcnJvclJhdyhkZXRhY2hlZCkuZWxlbWVudDtcblx0aWYgKCFlbGVtZW50KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBzdHlsZSA9IGdldFdpbmRvdyhlbGVtZW50KS5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuXHRjb25zdCBjaHJvbWUgPSBwYXJzZUludChzdHlsZS5wYWRkaW5nTGVmdCkgKyBwYXJzZUludChzdHlsZS5wYWRkaW5nUmlnaHQpO1xuXHRyZXR1cm4gaXNOYU4oY2hyb21lKSA/IHVuZGVmaW5lZCA6IE1hdGgubWF4KGNocm9tZSwgMCk7XG59XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGhlaWdodCBpbiBDU1MgcGl4ZWxzIG9mIG9uZSByZW5kZXJlZCByb3cgZnJvbSB0aGUgbWlycm9yJ3MgZm9udC4gT25jZSB0aGVcbiAqIHJlbmRlcmVyIGhhcyBpbml0aWFsaXplZCwge0BsaW5rIFh0ZXJtVGVybWluYWwuZ2V0Rm9udH0gcmVwb3J0cyBpdHMgYWN0dWFsIGNlbGwgbWV0cmljcyxcbiAqIHNvIHRoZSB2YWx1ZSBtYXRjaGVzIHdoYXQgeHRlcm0gcGFpbnRzOyBiZWZvcmUgdGhhdCBpdCBpcyB0aGUgY29uZmlndXJhdGlvbi1iYXNlZFxuICogZXN0aW1hdGUuIFJldHVybnMgdW5kZWZpbmVkIHdoaWxlIHRoZSB0ZXJtaW5hbCBvciBpdHMgbWV0cmljcyBhcmUgdW5hdmFpbGFibGUuXG4gKi9cbmZ1bmN0aW9uIGdldE1pcnJvclJvd0hlaWdodFB4KGRldGFjaGVkOiBJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZm9udCA9IGRldGFjaGVkPy54dGVybS5nZXRGb250KCk7XG5cdGlmICghZm9udD8uY2hhckhlaWdodCB8fCBmb250LmNoYXJIZWlnaHQgPD0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgbGluZUhlaWdodCA9IGZvbnQubGluZUhlaWdodCA+IDAgPyBmb250LmxpbmVIZWlnaHQgOiAxO1xuXHRyZXR1cm4gZm9udC5jaGFySGVpZ2h0ICogbGluZUhlaWdodDtcbn1cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbGluZSBjb3VudCBmb3IgdGVybWluYWwgb3V0cHV0IGJldHdlZW4gc3RhcnQgYW5kIGVuZCBsaW5lcy5cbiAqIFRoZSBlbmQgbGluZSBpcyBleGNsdXNpdmUgKHBvaW50cyB0byB0aGUgbGluZSBhZnRlciBvdXRwdXQgZW5kcykuXG4gKi9cbmZ1bmN0aW9uIGNvbXB1dGVPdXRwdXRMaW5lQ291bnQoc3RhcnRMaW5lOiBudW1iZXIsIGVuZExpbmU6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiBNYXRoLm1heChlbmRMaW5lIC0gc3RhcnRMaW5lLCAwKTtcbn1cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbnVtYmVyIG9mIHJlbmRlcmVkIHJvd3Mgb2NjdXBpZWQgYnkgYSB0ZXJtaW5hbCBzbmFwc2hvdC5cbiAqIFRoZSBjdXJzb3IgbGluZSBpcyBpbmNsdWRlZCB3aGVuIGl0IGNvbnRhaW5zIGNvbnRlbnQgYW5kIGV4Y2x1ZGVkIHdoZW4gaXRcbiAqIGlzIHRoZSBlbXB0eSBsaW5lIGFmdGVyIGEgdHJhaWxpbmcgbmV3bGluZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVTbmFwc2hvdExpbmVDb3VudChidWZmZXI6IHtcblx0cmVhZG9ubHkgYmFzZVk6IG51bWJlcjtcblx0cmVhZG9ubHkgY3Vyc29yWTogbnVtYmVyO1xuXHRnZXRMaW5lKHk6IG51bWJlcik6IHsgdHJhbnNsYXRlVG9TdHJpbmcodHJpbVJpZ2h0PzogYm9vbGVhbik6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xufSwgbGluZUNvdW50PzogbnVtYmVyKTogbnVtYmVyIHtcblx0aWYgKGxpbmVDb3VudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGxpbmVDb3VudDtcblx0fVxuXG5cdGNvbnN0IGN1cnNvckxpbmVJbmRleCA9IGJ1ZmZlci5iYXNlWSArIGJ1ZmZlci5jdXJzb3JZO1xuXHRjb25zdCBoYXNDdXJzb3JMaW5lQ29udGVudCA9ICEhYnVmZmVyLmdldExpbmUoY3Vyc29yTGluZUluZGV4KT8udHJhbnNsYXRlVG9TdHJpbmcodHJ1ZSk7XG5cdGNvbnN0IGVuZExpbmUgPSBjdXJzb3JMaW5lSW5kZXggKyAoaGFzQ3Vyc29yTGluZUNvbnRlbnQgPyAxIDogMCk7XG5cdHJldHVybiBjb21wdXRlT3V0cHV0TGluZUNvdW50KDAsIGVuZExpbmUpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Q29tbWFuZE91dHB1dFNuYXBzaG90KFxuXHR4dGVybVRlcm1pbmFsOiBYdGVybVRlcm1pbmFsLFxuXHRjb21tYW5kOiBJVGVybWluYWxDb21tYW5kLFxuXHRsb2c/OiAocmVhc29uOiAnZmFsbGJhY2snIHwgJ3ByaW1hcnknLCBlcnJvcjogdW5rbm93bikgPT4gdm9pZFxuKTogUHJvbWlzZTx7IHRleHQ6IHN0cmluZzsgbGluZUNvdW50OiBudW1iZXIgfSB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCBleGVjdXRlZE1hcmtlciA9IGNvbW1hbmQuZXhlY3V0ZWRNYXJrZXI7XG5cdGNvbnN0IGVuZE1hcmtlciA9IGNvbW1hbmQuZW5kTWFya2VyO1xuXG5cdGlmICghZW5kTWFya2VyIHx8IGVuZE1hcmtlci5pc0Rpc3Bvc2VkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlmICghZXhlY3V0ZWRNYXJrZXIgfHwgZXhlY3V0ZWRNYXJrZXIuaXNEaXNwb3NlZCkge1xuXHRcdGNvbnN0IHJhdyA9IHh0ZXJtVGVybWluYWwucmF3O1xuXHRcdGNvbnN0IGJ1ZmZlciA9IHJhdy5idWZmZXIuYWN0aXZlO1xuXHRcdGNvbnN0IG9mZnNldHMgPSBbXG5cdFx0XHQtKGJ1ZmZlci5iYXNlWSArIGJ1ZmZlci5jdXJzb3JZKSxcblx0XHRcdC1idWZmZXIuYmFzZVksXG5cdFx0XHQwXG5cdFx0XTtcblx0XHRsZXQgc3RhcnRNYXJrZXI6IElYdGVybU1hcmtlciB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IG9mZnNldCBvZiBvZmZzZXRzKSB7XG5cdFx0XHRzdGFydE1hcmtlciA9IHJhdy5yZWdpc3Rlck1hcmtlcihvZmZzZXQpO1xuXHRcdFx0aWYgKHN0YXJ0TWFya2VyKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIXN0YXJ0TWFya2VyIHx8IHN0YXJ0TWFya2VyLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiB7IHRleHQ6ICcnLCBsaW5lQ291bnQ6IDAgfTtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhcnRMaW5lID0gc3RhcnRNYXJrZXIubGluZTtcblx0XHRsZXQgdGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHR0ZXh0ID0gYXdhaXQgeHRlcm1UZXJtaW5hbC5nZXRSYW5nZUFzVlQoc3RhcnRNYXJrZXIsIGVuZE1hcmtlciwgdHJ1ZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGxvZz8uKCdmYWxsYmFjaycsIGVycm9yKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHN0YXJ0TWFya2VyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHRyZXR1cm4geyB0ZXh0OiAnJywgbGluZUNvdW50OiAwIH07XG5cdFx0fVxuXHRcdGNvbnN0IGVuZExpbmUgPSBlbmRNYXJrZXIubGluZTtcblx0XHRjb25zdCBsaW5lQ291bnQgPSBjb21wdXRlT3V0cHV0TGluZUNvdW50KHN0YXJ0TGluZSwgZW5kTGluZSk7XG5cdFx0cmV0dXJuIHsgdGV4dCwgbGluZUNvdW50IH07XG5cdH1cblxuXHRjb25zdCBzdGFydExpbmUgPSBleGVjdXRlZE1hcmtlci5saW5lO1xuXHRjb25zdCBlbmRMaW5lID0gZW5kTWFya2VyLmxpbmU7XG5cdGNvbnN0IGxpbmVDb3VudCA9IGNvbXB1dGVPdXRwdXRMaW5lQ291bnQoc3RhcnRMaW5lLCBlbmRMaW5lKTtcblxuXHRsZXQgdGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR0cnkge1xuXHRcdHRleHQgPSBhd2FpdCB4dGVybVRlcm1pbmFsLmdldFJhbmdlQXNWVChleGVjdXRlZE1hcmtlciwgZW5kTWFya2VyLCB0cnVlKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRsb2c/LigncHJpbWFyeScsIGVycm9yKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmICghdGV4dCkge1xuXHRcdHJldHVybiB7IHRleHQ6ICcnLCBsaW5lQ291bnQ6IDAgfTtcblx0fVxuXG5cdHJldHVybiB7IHRleHQsIGxpbmVDb3VudCB9O1xufVxuXG4vKipcbiAqIE1pcnJvcnMgYSB0ZXJtaW5hbCBjb21tYW5kJ3Mgb3V0cHV0IGludG8gYSBkZXRhY2hlZCB0ZXJtaW5hbCBpbnN0YW5jZS5cbiAqIFVzZWQgaW4gdGhlIGNoYXQgdGVybWluYWwgdG9vbCBwcm9ncmVzcyBwYXJ0IHRvIHNob3cgY29tbWFuZCBvdXRwdXQuXG4gKi9cbmV4cG9ydCBjbGFzcyBEZXRhY2hlZFRlcm1pbmFsQ29tbWFuZE1pcnJvciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRGV0YWNoZWRUZXJtaW5hbENvbW1hbmRNaXJyb3Ige1xuXHQvLyBTdHJlYW1pbmcgYXBwcm9hY2hcblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vIFRoZSBtaXJyb3IgbWFpbnRhaW5zIGEgVlQgc25hcHNob3Qgb2YgdGhlIGNvbW1hbmQncyBvdXRwdXQgYW5kIGluY3JlbWVudGFsbHkgdXBkYXRlcyBhXG5cdC8vIGRldGFjaGVkIHh0ZXJtIGluc3RhbmNlIGluc3RlYWQgb2YgcmUtcmVuZGVyaW5nIHRoZSB3aG9sZSByYW5nZSBvbiBldmVyeSBjaGFuZ2UuXG5cdC8vXG5cdC8vIC0gQSAqZGlydHkgcmFuZ2UqIGlzIHRoZSBzZXQgb2YgYnVmZmVyIHJvd3MgdGhhdCBtYXkgaGF2ZSBkaXZlcmdlZCBiZXR3ZWVuIHRoZSBzb3VyY2Vcblx0Ly8gICB0ZXJtaW5hbCBhbmQgdGhlIGRldGFjaGVkIG1pcnJvci4gSXQgaXMgdHJhY2tlZCBieTpcblx0Ly8gICAgIC0gYF9sYXN0VXBUb0RhdGVDdXJzb3JZYDogdGhlIGxhc3QgY3Vyc29yIHJvdyBpbiB0aGUgc291cmNlIGJ1ZmZlciBmb3Igd2hpY2ggdGhlXG5cdC8vICAgICAgIG1pcnJvciBpcyBrbm93biB0byBiZSBmdWxseSB1cCB0byBkYXRlLlxuXHQvLyAgICAgLSBgX2xvd2VzdERpcnR5Q3Vyc29yWWA6IHRoZSBzbWFsbGVzdCAodG9wLW1vc3QpIGN1cnNvciByb3cgdGhhdCBoYXMgYmVlbiBhZmZlY3RlZFxuXHQvLyAgICAgICBieSBuZXcgZGF0YSBvciBjdXJzb3IgbW92ZW1lbnQgc2luY2UgdGhlIGxhc3QgZmx1c2guXG5cdC8vXG5cdC8vIC0gV2hlbiBuZXcgZGF0YSBhcnJpdmVzIG9yIHRoZSBjdXJzb3IgbW92ZXMsIHh0ZXJtIGV2ZW50cyBhbmQgYG9uRGF0YWAgY2FsbGJhY2tzIGFyZVxuXHQvLyAgIHVzZWQgdG8gdXBkYXRlIGBfbG93ZXN0RGlydHlDdXJzb3JZYC4gVGhpcyBlZmZlY3RpdmVseSBtYXJrcyBldmVyeXRoaW5nIGZyb20gdGhhdCByb3dcblx0Ly8gICBkb3dud2FyZHMgYXMgcG90ZW50aWFsbHkgc3RhbGUuXG5cdC8vXG5cdC8vIC0gSWYgdGhlIGRpcnR5IHJhbmdlIHN0YXJ0cyBleGFjdGx5IGF0IHRoZSBwcmV2aW91cyBlbmQgb2YgdGhlIG1pcnJvcmVkIG91dHB1dCAodGhhdCBpcyxcblx0Ly8gICBgX2xvd2VzdERpcnR5Q3Vyc29yWWAgaXMgYXQgb3IgYWZ0ZXIgYF9sYXN0VXBUb0RhdGVDdXJzb3JZYCBhbmQgbm8gZWFybGllciByb3dzIGhhdmVcblx0Ly8gICBjaGFuZ2VkKSwgdGhlIG1pcnJvciBjYW4gKmFwcGVuZCogVlQgdGhhdCBjb3JyZXNwb25kcyBvbmx5IHRvIHRoZSBuZXcgcm93cy5cblx0Ly9cblx0Ly8gLSBJZiB0aGUgY3Vyc29yIG1vdmVzIG9yIGRhdGEgaXMgd3JpdHRlbiBhYm92ZSB0aGUgcHJldmlvdXNseSBtaXJyb3JlZCBlbmQgKGZvciBleGFtcGxlLFxuXHQvLyAgIHdoZW4gdGhlIGNvbW1hbmQgcmV3cml0ZXMgbGluZXMsIHVzZXMgY2FycmlhZ2UgcmV0dXJucywgb3IgbW9kaWZpZXMgZWFybGllciByb3dzKSxcblx0Ly8gICBgX2xvd2VzdERpcnR5Q3Vyc29yWWAgd2lsbCBiZSBiZWZvcmUgYF9sYXN0VXBUb0RhdGVDdXJzb3JZYC4gSW4gdGhhdCBjYXNlIHRoZSBtaXJyb3Jcblx0Ly8gICBjYW5ub3Qgc2FmZWx5IGFwcGVuZCBhbmQgaW5zdGVhZCBmYWxscyBiYWNrIHRvIHRha2luZyBhIGZyZXNoIFZUIHNuYXBzaG90IG9mIHRoZVxuXHQvLyAgIGVudGlyZSBjb21tYW5kIHJhbmdlIGFuZCAqcmV3cml0ZXMqIHRoZSBkZXRhY2hlZCB0ZXJtaW5hbCBjb250ZW50LlxuXG5cdHByaXZhdGUgX2RldGFjaGVkVGVybWluYWw6IElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RldGFjaGVkVGVybWluYWxQcm9taXNlOiBQcm9taXNlPElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2U+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hdHRhY2hlZENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0cmVhbWluZ0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRVcGRhdGVFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SURldGFjaGVkVGVybWluYWxDb21tYW5kTWlycm9yUmVuZGVyUmVzdWx0PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkVXBkYXRlOiBFdmVudDxJRGV0YWNoZWRUZXJtaW5hbENvbW1hbmRNaXJyb3JSZW5kZXJSZXN1bHQ+ID0gdGhpcy5fb25EaWRVcGRhdGVFbWl0dGVyLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZElucHV0RW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZElucHV0OiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRJbnB1dEVtaXR0ZXIuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUm93SGVpZ2h0RW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VSb3dIZWlnaHQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VSb3dIZWlnaHRFbWl0dGVyLmV2ZW50O1xuXHRwcml2YXRlIF9yZW5kZXJMaXN0ZW5lckluc3RhbGxlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9sYXN0T2JzZXJ2ZWRSb3dIZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9sYXN0VlQgPSAnJztcblx0cHJpdmF0ZSBfbGluZUNvdW50ID0gMDtcblx0cHJpdmF0ZSBfbWF4Q29sdW1uV2lkdGggPSAwO1xuXHRwcml2YXRlIF9sYXN0VXBUb0RhdGVDdXJzb3JZOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xvd2VzdERpcnR5Q3Vyc29yWTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9mbHVzaFByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RpcnR5U2NoZWR1bGVkID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzU3RyZWFtaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX3NvdXJjZVJhdzogUmF3WHRlcm1UZXJtaW5hbCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF94dGVybVRlcm1pbmFsOiBYdGVybVRlcm1pbmFsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9zdG9wU3RyZWFtaW5nKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgYXR0YWNoKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgdGVybWluYWw6IElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0dHJ5IHtcblx0XHRcdHRlcm1pbmFsID0gYXdhaXQgdGhpcy5fZ2V0T3JDcmVhdGVUZXJtaW5hbCgpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2F0dGFjaGVkQ29udGFpbmVyICE9PSBjb250YWluZXIpIHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LXRlcm1pbmFsLW91dHB1dC10ZXJtaW5hbCcpO1xuXHRcdFx0dGVybWluYWwuYXR0YWNoVG9FbGVtZW50KGNvbnRhaW5lciwgeyBlbmFibGVHcHU6IGZhbHNlIH0pO1xuXHRcdFx0dGhpcy5fYXR0YWNoZWRDb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0fVxuXHRcdHRoaXMuX2luc3RhbGxGaXJzdFJlbmRlckxpc3RlbmVyKHRlcm1pbmFsKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgaGVpZ2h0IGluIENTUyBwaXhlbHMgb2Ygb25lIHJlbmRlcmVkIHJvdyBvZiB0aGlzIG1pcnJvciwgb3IgdW5kZWZpbmVkIHVudGlsIHRoZVxuXHQgKiBkZXRhY2hlZCB0ZXJtaW5hbCBleGlzdHMuIFJlZmxlY3RzIHRoZSByZW5kZXJlcidzIGFjdHVhbCBjZWxsIG1ldHJpY3Mgb25jZSBpdCBoYXNcblx0ICogcmVuZGVyZWQsIHNvIGJveC1oZWlnaHQgbWF0aCBtYXRjaGVzIHdoYXQgeHRlcm0gcGFpbnRzLlxuXHQgKi9cblx0Z2V0Um93SGVpZ2h0UHgoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGdldE1pcnJvclJvd0hlaWdodFB4KHRoaXMuX2RldGFjaGVkVGVybWluYWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5zdGFsbEZpcnN0UmVuZGVyTGlzdGVuZXIoZGV0YWNoZWQ6IElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcmVuZGVyTGlzdGVuZXJJbnN0YWxsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcmVuZGVyTGlzdGVuZXJJbnN0YWxsZWQgPSB0cnVlO1xuXHRcdC8vIFJlbmRlcnMgY2FuIGNoYW5nZSB0aGUgY2VsbCBtZXRyaWNzOiB0aGUgZmlyc3QgcmVuZGVyIHJlcGxhY2VzIHRoZSBtZWFzdXJlZCBmb250XG5cdFx0Ly8gZXN0aW1hdGUgd2l0aCB0aGUgcmVuZGVyZXIncyBhY3R1YWwgZGltZW5zaW9ucywgYW5kIGxhdGVyIG9uZXMgY2FuIHJlZmxlY3QgRFBSXG5cdFx0Ly8gY2hhbmdlcyAoZS5nLiB0aGUgd2luZG93IG1vdmluZyB0byBhIGRpZmZlcmVudGx5IHNjYWxlZCBtb25pdG9yKS4gT25seSB0aGVcblx0XHQvLyBjaGFuZ2VzIGFyZSBhbm5vdW5jZWQsIHNvIHRoZSBwZXItZnJhbWUgY29zdCBpcyBvbmUgbnVtYmVyIGNvbXBhcmlzb24uXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZ2V0TWlycm9yUmF3KGRldGFjaGVkKS5vblJlbmRlcigoKSA9PiB0aGlzLl9ub3RpZnlSb3dIZWlnaHRJZkNoYW5nZWQoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbm90aWZ5Um93SGVpZ2h0SWZDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJvd0hlaWdodCA9IHRoaXMuZ2V0Um93SGVpZ2h0UHgoKTtcblx0XHRpZiAocm93SGVpZ2h0ICE9PSB1bmRlZmluZWQgJiYgcm93SGVpZ2h0ICE9PSB0aGlzLl9sYXN0T2JzZXJ2ZWRSb3dIZWlnaHQpIHtcblx0XHRcdHRoaXMuX2xhc3RPYnNlcnZlZFJvd0hlaWdodCA9IHJvd0hlaWdodDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUm93SGVpZ2h0RW1pdHRlci5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVuZGVyQ29tbWFuZCgpOiBQcm9taXNlPElEZXRhY2hlZFRlcm1pbmFsQ29tbWFuZE1pcnJvclJlbmRlclJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgZGV0YWNoZWQ6IElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0dHJ5IHtcblx0XHRcdGRldGFjaGVkID0gYXdhaXQgdGhpcy5fZ2V0T3JDcmVhdGVUZXJtaW5hbCgpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgdnQ7XG5cdFx0dHJ5IHtcblx0XHRcdHZ0ID0gYXdhaXQgdGhpcy5fZ2V0Q29tbWFuZE91dHB1dEFzVlQodGhpcy5feHRlcm1UZXJtaW5hbCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBpZ25vcmUgYW5kIHRyZWF0IGFzIG5vIG91dHB1dFxuXHRcdH1cblx0XHRpZiAoIXZ0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdC8vIE9ubHkgYXBwZW5kIGlmIHRoZSBib3VuZGFyeSBhcm91bmQgdGhlIHNsaWNlIHBvaW50IG1hdGNoZXM7IG90aGVyd2lzZSByZXdyaXRlLlxuXHRcdFx0Ly8gVGhpcyBpcyBhbiBlZmZpY2llbnQgY29uc3RhbnQtdGltZSBjaGVjayAoY2hlY2tpbmcgdXAgdG8gNTAgY2hhcmFjdGVycykgaW5zdGVhZCBvZiBjb21wYXJpbmcgdGhlIGVudGlyZSBwcmVmaXguXG5cdFx0XHQvLyBPbiBXaW5kb3dzLCBWVCBzZXF1ZW5jZXMgY2FuIGRpZmZlciBldmVuIGZvciBlcXVpdmFsZW50IGNvbnRlbnQsIGNhdXNpbmcgY29ycnVwdGlvblxuXHRcdFx0Ly8gaWYgd2UgYmxpbmRseSBhcHBlbmQuXG5cdFx0XHRjb25zdCBjYW5BcHBlbmQgPSAhIXRoaXMuX2xhc3RWVCAmJiB2dC50ZXh0Lmxlbmd0aCA+PSB0aGlzLl9sYXN0VlQubGVuZ3RoICYmIHRoaXMuX3Z0Qm91bmRhcnlNYXRjaGVzKHZ0LnRleHQsIHRoaXMuX2xhc3RWVC5sZW5ndGgpO1xuXHRcdFx0aWYgKCFjYW5BcHBlbmQpIHtcblx0XHRcdFx0Ly8gVXNlIFxceDFiYyAoUklTKSArIG5ldyBjb250ZW50IGluIG9uZSB3cml0ZSB0byBhdm9pZCBhIGJsYW5rIGZyYW1lXG5cdFx0XHRcdGNvbnN0IHBheWxvYWQgPSB0aGlzLl9sYXN0VlQgPyBgXFx4MWJjJHt2dC50ZXh0fWAgOiB2dC50ZXh0O1xuXHRcdFx0XHRpZiAocGF5bG9hZCkge1xuXHRcdFx0XHRcdGRldGFjaGVkLnh0ZXJtLndyaXRlKHBheWxvYWQsIHJlc29sdmUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgYXBwZW5kZWQgPSB2dC50ZXh0LnNsaWNlKHRoaXMuX2xhc3RWVC5sZW5ndGgpO1xuXHRcdFx0XHRpZiAoYXBwZW5kZWQpIHtcblx0XHRcdFx0XHRkZXRhY2hlZC54dGVybS53cml0ZShhcHBlbmRlZCwgcmVzb2x2ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9sYXN0VlQgPSB2dC50ZXh0O1xuXG5cdFx0Y29uc3Qgc291cmNlUmF3ID0gdGhpcy5feHRlcm1UZXJtaW5hbC5yYXc7XG5cdFx0aWYgKHNvdXJjZVJhdykge1xuXHRcdFx0dGhpcy5fc291cmNlUmF3ID0gc291cmNlUmF3O1xuXHRcdFx0dGhpcy5fbGFzdFVwVG9EYXRlQ3Vyc29yWSA9IHRoaXMuX2dldEFic29sdXRlQ3Vyc29yWShzb3VyY2VSYXcpO1xuXHRcdFx0aWYgKCF0aGlzLl9pc1N0cmVhbWluZyAmJiAoIXRoaXMuX2NvbW1hbmQuZW5kTWFya2VyIHx8IHRoaXMuX2NvbW1hbmQuZW5kTWFya2VyLmlzRGlzcG9zZWQpKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXJ0U3RyZWFtaW5nKHNvdXJjZVJhdyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fbGluZUNvdW50ID0gdGhpcy5fZ2V0UmVuZGVyZWRMaW5lQ291bnQoKTtcblx0XHQvLyBPbmx5IGNvbXB1dGUgbWF4IGNvbHVtbiB3aWR0aCBhZnRlciB0aGUgY29tbWFuZCBmaW5pc2hlcyBhbmQgZm9yIHNtYWxsIG91dHB1dHNcblx0XHRjb25zdCBjb21tYW5kRmluaXNoZWQgPSB0aGlzLl9jb21tYW5kLmVuZE1hcmtlciAmJiAhdGhpcy5fY29tbWFuZC5lbmRNYXJrZXIuaXNEaXNwb3NlZDtcblx0XHRpZiAoY29tbWFuZEZpbmlzaGVkICYmIHRoaXMuX2xpbmVDb3VudCA8PSBDaGF0VGVybWluYWxNaXJyb3JNZXRyaWNzLk1heExpbmVzRm9yQ29sdW1uV2lkdGhDb21wdXRhdGlvbikge1xuXHRcdFx0dGhpcy5fbWF4Q29sdW1uV2lkdGggPSB0aGlzLl9jb21wdXRlTWF4Q29sdW1uV2lkdGgoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBsaW5lQ291bnQ6IHRoaXMuX2xpbmVDb3VudCwgbWF4Q29sdW1uV2lkdGg6IHRoaXMuX21heENvbHVtbldpZHRoIH07XG5cdH1cblxuXHQvKipcblx0ICogUmVzaXplcyB0aGUgbWlycm9yIHRvIGZpbGwgdGhlIGdpdmVuIHdpZHRoLCByZWx5aW5nIG9uIHh0ZXJtJ3MgbmF0aXZlIHJlc2l6ZSByZWZsb3cgdG9cblx0ICogcmUtd3JhcCBzb2Z0LXdyYXBwZWQgbGluZXMuIE5vLW9wIHdoZW4gdGhlIHJlc3VsdGluZyBjb2xzIGFyZSB1bmNoYW5nZWQuIFRoZSBjb2x1bW5cblx0ICogY291bnQgZGVyaXZlcyBmcm9tIHRoZSBtaXJyb3IncyBvd24geHRlcm0gZm9udCBtZXRyaWNzLCB3aGljaCByZWZsZWN0IHRoZSBhY3R1YWxcblx0ICogcmVuZGVyZXIgY2VsbCBzaXplIHJhdGhlciB0aGFuIGEgY29uZmlndXJhdGlvbi1iYXNlZCBlc3RpbWF0ZS5cblx0ICovXG5cdGFzeW5jIGxheW91dCh3aWR0aFB4OiBudW1iZXIpOiBQcm9taXNlPElEZXRhY2hlZFRlcm1pbmFsQ29tbWFuZE1pcnJvclJlbmRlclJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkIHx8IHdpZHRoUHggPD0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IGRldGFjaGVkOiBJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlO1xuXHRcdHRyeSB7XG5cdFx0XHRkZXRhY2hlZCA9IGF3YWl0IHRoaXMuX2dldE9yQ3JlYXRlVGVybWluYWwoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY29scyA9IGNvbXB1dGVDaGF0VGVybWluYWxNaXJyb3JDb2xzKHdpZHRoUHgsIGRldGFjaGVkLnh0ZXJtLmdldEZvbnQoKSwgZ2V0TWlycm9yRGV2aWNlUGl4ZWxSYXRpbyhkZXRhY2hlZCksIG1lYXN1cmVNaXJyb3JIb3Jpem9udGFsQ2hyb21lKGRldGFjaGVkKSk7XG5cdFx0aWYgKGRldGFjaGVkLnh0ZXJtLmNvbHMgPT09IGNvbHMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIFdhaXQgZm9yIGFueSBpbi1mbGlnaHQgc3RyZWFtaW5nIGZsdXNoIHNvIHRoZSByZXNpemUgZG9lcyBub3QgaW50ZXJsZWF2ZSB3aXRoIGl0XG5cdFx0YXdhaXQgdGhpcy5fZmx1c2hQcm9taXNlO1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkIHx8IGRldGFjaGVkLnh0ZXJtLmNvbHMgPT09IGNvbHMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIE5hdGl2ZSByZXNpemUgcmVmbG93IHJlLXdyYXBzIHRoZSBidWZmZXIgaW4gcGxhY2U7IHJld3JpdGluZyB0aGUgY2FjaGVkIFZUIGhlcmVcblx0XHQvLyBpbnN0ZWFkIHdvdWxkIGZsYXNoIGEgY2xlYXJlZCBmcmFtZSBvbiBldmVyeSByZXNpemVcblx0XHRkZXRhY2hlZC54dGVybS5yZXNpemUoY29scywgQ2hhdFRlcm1pbmFsTWlycm9yTWV0cmljcy5NaXJyb3JSb3dDb3VudCk7XG5cdFx0aWYgKCF0aGlzLl9sYXN0VlQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX2xpbmVDb3VudCA9IHRoaXMuX2dldFJlbmRlcmVkTGluZUNvdW50KCk7XG5cdFx0Y29uc3QgY29tbWFuZEZpbmlzaGVkID0gdGhpcy5fY29tbWFuZC5lbmRNYXJrZXIgJiYgIXRoaXMuX2NvbW1hbmQuZW5kTWFya2VyLmlzRGlzcG9zZWQ7XG5cdFx0aWYgKGNvbW1hbmRGaW5pc2hlZCAmJiB0aGlzLl9saW5lQ291bnQgPD0gQ2hhdFRlcm1pbmFsTWlycm9yTWV0cmljcy5NYXhMaW5lc0ZvckNvbHVtbldpZHRoQ29tcHV0YXRpb24pIHtcblx0XHRcdHRoaXMuX21heENvbHVtbldpZHRoID0gdGhpcy5fY29tcHV0ZU1heENvbHVtbldpZHRoKCk7XG5cdFx0fVxuXHRcdHJldHVybiB7IGxpbmVDb3VudDogdGhpcy5fbGluZUNvdW50LCBtYXhDb2x1bW5XaWR0aDogdGhpcy5fbWF4Q29sdW1uV2lkdGggfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldENvbW1hbmRPdXRwdXRBc1ZUKHNvdXJjZTogWHRlcm1UZXJtaW5hbCk6IFByb21pc2U8eyB0ZXh0OiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBleGVjdXRlZE1hcmtlciA9IHRoaXMuX2NvbW1hbmQuZXhlY3V0ZWRNYXJrZXIgPz8gKHRoaXMuX2NvbW1hbmQgYXMgdW5rbm93biBhcyBJQ3VycmVudFBhcnRpYWxDb21tYW5kKS5jb21tYW5kRXhlY3V0ZWRNYXJrZXI7XG5cdFx0aWYgKCFleGVjdXRlZE1hcmtlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBlbmRNYXJrZXIgPSB0aGlzLl9jb21tYW5kLmVuZE1hcmtlcjtcblx0XHRjb25zdCB0ZXh0ID0gYXdhaXQgc291cmNlLmdldFJhbmdlQXNWVChleGVjdXRlZE1hcmtlciwgZW5kTWFya2VyLCBlbmRNYXJrZXI/LmxpbmUgIT09IGV4ZWN1dGVkTWFya2VyLmxpbmUpO1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIXRleHQpIHtcblx0XHRcdHJldHVybiB7IHRleHQ6ICcnIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgdGV4dCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmVuZGVyZWRMaW5lQ291bnQoKTogbnVtYmVyIHtcblx0XHQvLyBQcmVmZXIgY291bnRpbmcgdGhlIG1pcnJvcidzIG93biByZW5kZXJlZCByb3dzOiB0aGV5IHJlZmxlY3QgdGhlIG1pcnJvcidzIGNvbHVtblxuXHRcdC8vIGNvdW50LCB3aGljaCBjYW4gZGlmZmVyIGZyb20gdGhlIHNvdXJjZSB0ZXJtaW5hbCdzIGFmdGVyIGEgd2lkdGggbGF5b3V0XG5cdFx0Y29uc3QgZGV0YWNoZWRCdWZmZXIgPSB0aGlzLl9kZXRhY2hlZFRlcm1pbmFsPy54dGVybS5idWZmZXIuYWN0aXZlO1xuXHRcdGlmIChkZXRhY2hlZEJ1ZmZlcikge1xuXHRcdFx0cmV0dXJuIGNvbXB1dGVTbmFwc2hvdExpbmVDb3VudChkZXRhY2hlZEJ1ZmZlcik7XG5cdFx0fVxuXG5cdFx0Ly8gQ2FsY3VsYXRlIGxpbmUgY291bnQgZnJvbSB0aGUgY29tbWFuZCdzIG1hcmtlcnMgd2hlbiBhdmFpbGFibGVcblx0XHRjb25zdCBlbmRNYXJrZXIgPSB0aGlzLl9jb21tYW5kLmVuZE1hcmtlcjtcblx0XHRpZiAodGhpcy5fY29tbWFuZC5leGVjdXRlZE1hcmtlciAmJiBlbmRNYXJrZXIgJiYgIWVuZE1hcmtlci5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRjb25zdCBzdGFydExpbmUgPSB0aGlzLl9jb21tYW5kLmV4ZWN1dGVkTWFya2VyLmxpbmU7XG5cdFx0XHRjb25zdCBlbmRMaW5lID0gZW5kTWFya2VyLmxpbmU7XG5cdFx0XHRyZXR1cm4gY29tcHV0ZU91dHB1dExpbmVDb3VudChzdGFydExpbmUsIGVuZExpbmUpO1xuXHRcdH1cblxuXHRcdC8vIER1cmluZyBzdHJlYW1pbmcgKG5vIGVuZCBtYXJrZXIpLCBjYWxjdWxhdGUgZnJvbSB0aGUgc291cmNlIHRlcm1pbmFsIGJ1ZmZlclxuXHRcdGNvbnN0IGV4ZWN1dGVkTWFya2VyID0gdGhpcy5fY29tbWFuZC5leGVjdXRlZE1hcmtlciA/PyAodGhpcy5fY29tbWFuZCBhcyB1bmtub3duIGFzIElDdXJyZW50UGFydGlhbENvbW1hbmQpLmNvbW1hbmRFeGVjdXRlZE1hcmtlcjtcblx0XHRpZiAoZXhlY3V0ZWRNYXJrZXIgJiYgdGhpcy5fc291cmNlUmF3KSB7XG5cdFx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9zb3VyY2VSYXcuYnVmZmVyLmFjdGl2ZTtcblx0XHRcdGNvbnN0IGN1cnJlbnRMaW5lID0gYnVmZmVyLmJhc2VZICsgYnVmZmVyLmN1cnNvclk7XG5cdFx0XHRyZXR1cm4gY29tcHV0ZU91dHB1dExpbmVDb3VudChleGVjdXRlZE1hcmtlci5saW5lLCBjdXJyZW50TGluZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVDb3VudDtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVNYXhDb2x1bW5XaWR0aCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IGRldGFjaGVkID0gdGhpcy5fZGV0YWNoZWRUZXJtaW5hbDtcblx0XHRpZiAoIWRldGFjaGVkKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbXB1dGVNYXhCdWZmZXJDb2x1bW5XaWR0aChkZXRhY2hlZC54dGVybS5idWZmZXIuYWN0aXZlLCBkZXRhY2hlZC54dGVybS5jb2xzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldE9yQ3JlYXRlVGVybWluYWwoKTogUHJvbWlzZTxJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlPiB7XG5cdFx0aWYgKHRoaXMuX2RldGFjaGVkVGVybWluYWwpIHtcblx0XHRcdHJldHVybiB0aGlzLl9kZXRhY2hlZFRlcm1pbmFsO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZGV0YWNoZWRUZXJtaW5hbFByb21pc2UpIHtcblx0XHRcdHJldHVybiB0aGlzLl9kZXRhY2hlZFRlcm1pbmFsUHJvbWlzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblx0XHRjb25zdCBjcmVhdGVQcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbG9yUHJvdmlkZXIgPSB7XG5cdFx0XHRcdGdldEJhY2tncm91bmRDb2xvcjogKHRoZW1lOiBJQ29sb3JUaGVtZSkgPT4gZ2V0Q2hhdFRlcm1pbmFsQmFja2dyb3VuZENvbG9yKHRoZW1lLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSlcblx0XHRcdH07XG5cdFx0XHRjb25zdCBwcm9jZXNzSW5mbyA9IG5ldyBEZXRhY2hlZFByb2Nlc3NJbmZvKHsgaW5pdGlhbEN3ZDogJycgfSk7XG5cdFx0XHRjb25zdCBkZXRhY2hlZCA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVEZXRhY2hlZFRlcm1pbmFsKHtcblx0XHRcdFx0Y29sczogdGhpcy5feHRlcm1UZXJtaW5hbC5yYXcuY29scyA/PyBDaGF0VGVybWluYWxNaXJyb3JNZXRyaWNzLk1pcnJvckNvbENvdW50RmFsbGJhY2ssXG5cdFx0XHRcdHJvd3M6IENoYXRUZXJtaW5hbE1pcnJvck1ldHJpY3MuTWlycm9yUm93Q291bnQsXG5cdFx0XHRcdHJlYWRvbmx5OiBmYWxzZSxcblx0XHRcdFx0cHJvY2Vzc0luZm8sXG5cdFx0XHRcdGRpc2FibGVPdmVydmlld1J1bGVyOiB0cnVlLFxuXHRcdFx0XHRjb2xvclByb3ZpZGVyXG5cdFx0XHR9KTtcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHByb2Nlc3NJbmZvLmRpc3Bvc2UoKTtcblx0XHRcdFx0ZGV0YWNoZWQuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblx0XHRcdGVuYWJsZUN1cnNvckxpbmVSZWZsb3coZGV0YWNoZWQpO1xuXHRcdFx0dGhpcy5fZGV0YWNoZWRUZXJtaW5hbCA9IGRldGFjaGVkO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocHJvY2Vzc0luZm8pO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZGV0YWNoZWQpO1xuXG5cdFx0XHQvLyBGb3J3YXJkIGlucHV0IGZyb20gdGhlIG1pcnJvciB0ZXJtaW5hbCB0byB0aGUgc291cmNlIHRlcm1pbmFsXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihkZXRhY2hlZC5vbkRhdGEoZGF0YSA9PiB0aGlzLl9vbkRpZElucHV0RW1pdHRlci5maXJlKGRhdGEpKSk7XG5cdFx0XHRyZXR1cm4gZGV0YWNoZWQ7XG5cdFx0fSkoKTtcblx0XHR0aGlzLl9kZXRhY2hlZFRlcm1pbmFsUHJvbWlzZSA9IGNyZWF0ZVByb21pc2U7XG5cdFx0cmV0dXJuIGNyZWF0ZVByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIF9zdGFydFN0cmVhbWluZyhyYXc6IFJhd1h0ZXJtVGVybWluYWwpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCB8fCB0aGlzLl9pc1N0cmVhbWluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc1N0cmVhbWluZyA9IHRydWU7XG5cdFx0dGhpcy5fc3RyZWFtaW5nRGlzcG9zYWJsZXMuYWRkKEV2ZW50LmFueShyYXcub25DdXJzb3JNb3ZlLCByYXcub25MaW5lRmVlZCwgcmF3Lm9uV3JpdGVQYXJzZWQpKCgpID0+IHRoaXMuX2hhbmRsZUN1cnNvckV2ZW50KCkpKTtcblx0XHR0aGlzLl9zdHJlYW1pbmdEaXNwb3NhYmxlcy5hZGQocmF3Lm9uRGF0YSgoKSA9PiB0aGlzLl9oYW5kbGVDdXJzb3JFdmVudCgpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9zdG9wU3RyZWFtaW5nKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNTdHJlYW1pbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RyZWFtaW5nRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9pc1N0cmVhbWluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX2xvd2VzdERpcnR5Q3Vyc29yWSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zb3VyY2VSYXcgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVDdXJzb3JFdmVudCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCB8fCAhdGhpcy5fc291cmNlUmF3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnNvclkgPSB0aGlzLl9nZXRBYnNvbHV0ZUN1cnNvclkodGhpcy5fc291cmNlUmF3KTtcblx0XHR0aGlzLl9sb3dlc3REaXJ0eUN1cnNvclkgPSB0aGlzLl9sb3dlc3REaXJ0eUN1cnNvclkgPT09IHVuZGVmaW5lZCA/IGN1cnNvclkgOiBNYXRoLm1pbih0aGlzLl9sb3dlc3REaXJ0eUN1cnNvclksIGN1cnNvclkpO1xuXHRcdHRoaXMuX3NjaGVkdWxlRmx1c2goKTtcblx0fVxuXG5cdHByaXZhdGUgX3NjaGVkdWxlRmx1c2goKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2RpcnR5U2NoZWR1bGVkIHx8IHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGlydHlTY2hlZHVsZWQgPSB0cnVlO1xuXHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdHRoaXMuX2RpcnR5U2NoZWR1bGVkID0gZmFsc2U7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9mbHVzaERpcnR5UmFuZ2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2ZsdXNoRGlydHlSYW5nZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCB8fCB0aGlzLl9mbHVzaFByb21pc2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZmx1c2hQcm9taXNlID0gdGhpcy5fZG9GbHVzaERpcnR5UmFuZ2UoKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHRoaXMuX2ZsdXNoUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RvRmx1c2hEaXJ0eVJhbmdlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNvdXJjZVJhdyA9IHRoaXMuX3h0ZXJtVGVybWluYWwucmF3O1xuXHRcdGxldCBkZXRhY2hlZCA9IHRoaXMuX2RldGFjaGVkVGVybWluYWw7XG5cdFx0aWYgKCFkZXRhY2hlZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZGV0YWNoZWQgPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZVRlcm1pbmFsKCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZGV0YWNoZWRSYXcgPSBkZXRhY2hlZD8ueHRlcm07XG5cdFx0aWYgKCFzb3VyY2VSYXcgfHwgIWRldGFjaGVkUmF3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fc291cmNlUmF3ID0gc291cmNlUmF3O1xuXHRcdGNvbnN0IGN1cnJlbnRDdXJzb3IgPSB0aGlzLl9nZXRBYnNvbHV0ZUN1cnNvclkoc291cmNlUmF3KTtcblx0XHRjb25zdCBwcmV2aW91c0N1cnNvciA9IHRoaXMuX2xhc3RVcFRvRGF0ZUN1cnNvclkgPz8gY3VycmVudEN1cnNvcjtcblx0XHRjb25zdCBzdGFydENhbmRpZGF0ZSA9IHRoaXMuX2xvd2VzdERpcnR5Q3Vyc29yWSA/PyBjdXJyZW50Q3Vyc29yO1xuXHRcdHRoaXMuX2xvd2VzdERpcnR5Q3Vyc29yWSA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHN0YXJ0TGluZSA9IE1hdGgubWluKHByZXZpb3VzQ3Vyc29yLCBzdGFydENhbmRpZGF0ZSk7XG5cdFx0Ly8gRW5zdXJlIHdlIHJlc29sdmUgYW55IHBlbmRpbmcgZmx1c2ggZXZlbiB3aGVuIG5vIGFjdHVhbCBuZXcgb3V0cHV0IGlzIGF2YWlsYWJsZS5cblx0XHRjb25zdCB2dCA9IGF3YWl0IHRoaXMuX2dldENvbW1hbmRPdXRwdXRBc1ZUKHRoaXMuX3h0ZXJtVGVybWluYWwpO1xuXHRcdGlmICghdnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodnQudGV4dCA9PT0gdGhpcy5fbGFzdFZUKSB7XG5cdFx0XHR0aGlzLl9sYXN0VXBUb0RhdGVDdXJzb3JZID0gY3VycmVudEN1cnNvcjtcblx0XHRcdGlmICh0aGlzLl9jb21tYW5kLmVuZE1hcmtlciAmJiAhdGhpcy5fY29tbWFuZC5lbmRNYXJrZXIuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHR0aGlzLl9zdG9wU3RyZWFtaW5nKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT25seSBhcHBlbmQgaWY6ICgxKSBjdXJzb3IgaGFzbid0IG1vdmVkIGJhY2t3YXJkcywgYW5kICgyKSBib3VuZGFyeSBhcm91bmQgc2xpY2UgcG9pbnQgbWF0Y2hlcy5cblx0XHQvLyBUaGlzIGlzIGFuIGVmZmljaWVudCBPKDEpIGNoZWNrIGluc3RlYWQgb2YgY29tcGFyaW5nIHRoZSBlbnRpcmUgcHJlZml4LlxuXHRcdC8vIE9uIFdpbmRvd3MsIFZUIHNlcXVlbmNlcyBjYW4gZGlmZmVyIGV2ZW4gZm9yIGVxdWl2YWxlbnQgY29udGVudCwgc28gd2UgbXVzdCB2ZXJpZnkuXG5cdFx0Y29uc3QgY2FuQXBwZW5kID0gISF0aGlzLl9sYXN0VlQgJiYgc3RhcnRMaW5lID49IHByZXZpb3VzQ3Vyc29yICYmIHZ0LnRleHQubGVuZ3RoID49IHRoaXMuX2xhc3RWVC5sZW5ndGggJiYgdGhpcy5fdnRCb3VuZGFyeU1hdGNoZXModnQudGV4dCwgdGhpcy5fbGFzdFZULmxlbmd0aCk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRpZiAoIWNhbkFwcGVuZCkge1xuXHRcdFx0XHQvLyBVc2UgXFx4MWJjIChSSVMpICsgbmV3IGNvbnRlbnQgaW4gb25lIHdyaXRlIHRvIGF2b2lkIGEgYmxhbmsgZnJhbWVcblx0XHRcdFx0Y29uc3QgcGF5bG9hZCA9IHRoaXMuX2xhc3RWVCA/IGBcXHgxYmMke3Z0LnRleHR9YCA6IHZ0LnRleHQ7XG5cdFx0XHRcdGlmIChwYXlsb2FkKSB7XG5cdFx0XHRcdFx0ZGV0YWNoZWRSYXcud3JpdGUocGF5bG9hZCwgcmVzb2x2ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBhcHBlbmRlZCA9IHZ0LnRleHQuc2xpY2UodGhpcy5fbGFzdFZULmxlbmd0aCk7XG5cdFx0XHRcdGlmIChhcHBlbmRlZCkge1xuXHRcdFx0XHRcdGRldGFjaGVkUmF3LndyaXRlKGFwcGVuZGVkLCByZXNvbHZlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX2xhc3RWVCA9IHZ0LnRleHQ7XG5cdFx0dGhpcy5fbGluZUNvdW50ID0gdGhpcy5fZ2V0UmVuZGVyZWRMaW5lQ291bnQoKTtcblx0XHR0aGlzLl9sYXN0VXBUb0RhdGVDdXJzb3JZID0gY3VycmVudEN1cnNvcjtcblxuXHRcdGNvbnN0IGNvbW1hbmRGaW5pc2hlZCA9IHRoaXMuX2NvbW1hbmQuZW5kTWFya2VyICYmICF0aGlzLl9jb21tYW5kLmVuZE1hcmtlci5pc0Rpc3Bvc2VkO1xuXHRcdGlmIChjb21tYW5kRmluaXNoZWQpIHtcblx0XHRcdC8vIE9ubHkgY29tcHV0ZSBtYXggY29sdW1uIHdpZHRoIGFmdGVyIHRoZSBjb21tYW5kIGZpbmlzaGVzIGFuZCBmb3Igc21hbGwgb3V0cHV0c1xuXHRcdFx0aWYgKHRoaXMuX2xpbmVDb3VudCA8PSBDaGF0VGVybWluYWxNaXJyb3JNZXRyaWNzLk1heExpbmVzRm9yQ29sdW1uV2lkdGhDb21wdXRhdGlvbikge1xuXHRcdFx0XHR0aGlzLl9tYXhDb2x1bW5XaWR0aCA9IHRoaXMuX2NvbXB1dGVNYXhDb2x1bW5XaWR0aCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3RvcFN0cmVhbWluZygpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkVXBkYXRlRW1pdHRlci5maXJlKHsgbGluZUNvdW50OiB0aGlzLl9saW5lQ291bnQsIG1heENvbHVtbldpZHRoOiB0aGlzLl9tYXhDb2x1bW5XaWR0aCB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFic29sdXRlQ3Vyc29yWShyYXc6IFJhd1h0ZXJtVGVybWluYWwpOiBudW1iZXIge1xuXHRcdHJldHVybiByYXcuYnVmZmVyLmFjdGl2ZS5iYXNlWSArIHJhdy5idWZmZXIuYWN0aXZlLmN1cnNvclk7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlY2tzIGlmIHRoZSBuZXcgVlQgdGV4dCBtYXRjaGVzIHRoZSBvbGQgVlQgYXJvdW5kIHRoZSBib3VuZGFyeSB3aGVyZSB3ZSB3b3VsZCBzbGljZS5cblx0ICovXG5cdHByaXZhdGUgX3Z0Qm91bmRhcnlNYXRjaGVzKG5ld1ZUOiBzdHJpbmcsIHNsaWNlUG9pbnQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB2dEJvdW5kYXJ5TWF0Y2hlcyhuZXdWVCwgdGhpcy5fbGFzdFZULCBzbGljZVBvaW50KTtcblx0fVxufVxuXG4vKipcbiAqIE1pcnJvcnMgYSB0ZXJtaW5hbCBvdXRwdXQgc25hcHNob3QgaW50byBhIGRldGFjaGVkIHRlcm1pbmFsIGluc3RhbmNlLlxuICogVXNlZCB3aGVuIHRoZSB0ZXJtaW5hbCBoYXMgYmVlbiBkaXNwb3NlZCBvZiBidXQgd2Ugc3RpbGwgd2FudCB0byBzaG93IHRoZSBvdXRwdXQuXG4gKi9cbmV4cG9ydCBjbGFzcyBEZXRhY2hlZFRlcm1pbmFsU25hcHNob3RNaXJyb3IgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfZGV0YWNoZWRUZXJtaW5hbDogUHJvbWlzZTxJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVzb2x2ZWRUZXJtaW5hbDogSURldGFjaGVkVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYXR0YWNoZWRDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX291dHB1dDogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YVsndGVybWluYWxDb21tYW5kT3V0cHV0J10gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlclNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblx0cHJpdmF0ZSBfb3V0cHV0VmVyc2lvbiA9IDA7XG5cdHByaXZhdGUgX3JlbmRlcmVkVmVyc2lvbiA9IC0xO1xuXHRwcml2YXRlIF9sYXN0UmVuZGVyZWRMaW5lQ291bnQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdFJlbmRlcmVkTWF4Q29sdW1uV2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdFJlbmRlcmVkVGV4dCA9ICcnO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVJvd0hlaWdodEVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUm93SGVpZ2h0OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlUm93SGVpZ2h0RW1pdHRlci5ldmVudDtcblx0cHJpdmF0ZSBfcmVuZGVyTGlzdGVuZXJJbnN0YWxsZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfbGFzdE9ic2VydmVkUm93SGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3V0cHV0OiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhWyd0ZXJtaW5hbENvbW1hbmRPdXRwdXQnXSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRUaGVtZTogKCkgPT4gSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YVsndGVybWluYWxUaGVtZSddIHwgdW5kZWZpbmVkLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fb3V0cHV0ID0gb3V0cHV0O1xuXHRcdGNvbnN0IHByb2Nlc3NJbmZvID0gdGhpcy5fcmVnaXN0ZXIobmV3IERldGFjaGVkUHJvY2Vzc0luZm8oeyBpbml0aWFsQ3dkOiAnJyB9KSk7XG5cdFx0dGhpcy5fZGV0YWNoZWRUZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVEZXRhY2hlZFRlcm1pbmFsKHtcblx0XHRcdGNvbHM6IENoYXRUZXJtaW5hbE1pcnJvck1ldHJpY3MuTWlycm9yQ29sQ291bnRGYWxsYmFjayxcblx0XHRcdHJvd3M6IENoYXRUZXJtaW5hbE1pcnJvck1ldHJpY3MuTWlycm9yUm93Q291bnQsXG5cdFx0XHRyZWFkb25seTogdHJ1ZSxcblx0XHRcdHByb2Nlc3NJbmZvLFxuXHRcdFx0ZGlzYWJsZU92ZXJ2aWV3UnVsZXI6IHRydWUsXG5cdFx0XHRjb2xvclByb3ZpZGVyOiB7XG5cdFx0XHRcdGdldEJhY2tncm91bmRDb2xvcjogdGhlbWUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHN0b3JlZEJhY2tncm91bmQgPSB0aGlzLl9nZXRUaGVtZSgpPy5iYWNrZ3JvdW5kO1xuXHRcdFx0XHRcdHJldHVybiBnZXRDaGF0VGVybWluYWxCYWNrZ3JvdW5kQ29sb3IodGhlbWUsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCBzdG9yZWRCYWNrZ3JvdW5kKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pLnRoZW4odGVybWluYWwgPT4ge1xuXHRcdFx0Ly8gSWYgdGhlIHN0b3JlIGlzIGFscmVhZHkgZGlzcG9zZWQsIGRpc3Bvc2UgdGhlIHRlcm1pbmFsIGltbWVkaWF0ZWx5XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHR0ZXJtaW5hbC5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybiB0ZXJtaW5hbDtcblx0XHRcdH1cblx0XHRcdGVuYWJsZUN1cnNvckxpbmVSZWZsb3codGVybWluYWwpO1xuXHRcdFx0dGhpcy5fcmVzb2x2ZWRUZXJtaW5hbCA9IHRlcm1pbmFsO1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdGVyKHRlcm1pbmFsKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgaGVpZ2h0IGluIENTUyBwaXhlbHMgb2Ygb25lIHJlbmRlcmVkIHJvdyBvZiB0aGlzIG1pcnJvciwgb3IgdW5kZWZpbmVkIHVudGlsIHRoZVxuXHQgKiBkZXRhY2hlZCB0ZXJtaW5hbCBleGlzdHMuIFJlZmxlY3RzIHRoZSByZW5kZXJlcidzIGFjdHVhbCBjZWxsIG1ldHJpY3Mgb25jZSBpdCBoYXNcblx0ICogcmVuZGVyZWQsIHNvIGJveC1oZWlnaHQgbWF0aCBtYXRjaGVzIHdoYXQgeHRlcm0gcGFpbnRzLlxuXHQgKi9cblx0cHVibGljIGdldFJvd0hlaWdodFB4KCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBnZXRNaXJyb3JSb3dIZWlnaHRQeCh0aGlzLl9yZXNvbHZlZFRlcm1pbmFsKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFRlcm1pbmFsKCk6IFByb21pc2U8SURldGFjaGVkVGVybWluYWxJbnN0YW5jZT4ge1xuXHRcdGlmICghdGhpcy5fZGV0YWNoZWRUZXJtaW5hbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdEZXRhY2hlZCB0ZXJtaW5hbCBub3QgaW5pdGlhbGl6ZWQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2RldGFjaGVkVGVybWluYWw7XG5cdH1cblxuXHRwdWJsaWMgc2V0T3V0cHV0KG91dHB1dDogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YVsndGVybWluYWxDb21tYW5kT3V0cHV0J10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9vdXRwdXQgPSBvdXRwdXQ7XG5cdFx0dGhpcy5fb3V0cHV0VmVyc2lvbisrO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGF0dGFjaChjb250YWluZXI6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSBhd2FpdCB0aGlzLl9nZXRUZXJtaW5hbCgpO1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LXRlcm1pbmFsLW91dHB1dC10ZXJtaW5hbCcpO1xuXHRcdGNvbnN0IG5lZWRzQXR0YWNoID0gdGhpcy5fYXR0YWNoZWRDb250YWluZXIgIT09IGNvbnRhaW5lciB8fCBjb250YWluZXIuZmlyc3RDaGlsZCA9PT0gbnVsbDtcblx0XHRpZiAobmVlZHNBdHRhY2gpIHtcblx0XHRcdHRlcm1pbmFsLmF0dGFjaFRvRWxlbWVudChjb250YWluZXIsIHsgZW5hYmxlR3B1OiBmYWxzZSB9KTtcblx0XHRcdHRoaXMuX2F0dGFjaGVkQ29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3JlbmRlckxpc3RlbmVySW5zdGFsbGVkKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJMaXN0ZW5lckluc3RhbGxlZCA9IHRydWU7XG5cdFx0XHQvLyBSZW5kZXJzIGNhbiBjaGFuZ2UgdGhlIGNlbGwgbWV0cmljczogdGhlIGZpcnN0IHJlbmRlciByZXBsYWNlcyB0aGUgbWVhc3VyZWQgZm9udFxuXHRcdFx0Ly8gZXN0aW1hdGUgd2l0aCB0aGUgcmVuZGVyZXIncyBhY3R1YWwgZGltZW5zaW9ucywgYW5kIGxhdGVyIG9uZXMgY2FuIHJlZmxlY3QgRFBSXG5cdFx0XHQvLyBjaGFuZ2VzIChlLmcuIHRoZSB3aW5kb3cgbW92aW5nIHRvIGEgZGlmZmVyZW50bHkgc2NhbGVkIG1vbml0b3IpLiBPbmx5IHRoZVxuXHRcdFx0Ly8gY2hhbmdlcyBhcmUgYW5ub3VuY2VkLCBzbyB0aGUgcGVyLWZyYW1lIGNvc3QgaXMgb25lIG51bWJlciBjb21wYXJpc29uLlxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZ2V0TWlycm9yUmF3KHRlcm1pbmFsKS5vblJlbmRlcigoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJvd0hlaWdodCA9IHRoaXMuZ2V0Um93SGVpZ2h0UHgoKTtcblx0XHRcdFx0aWYgKHJvd0hlaWdodCAhPT0gdW5kZWZpbmVkICYmIHJvd0hlaWdodCAhPT0gdGhpcy5fbGFzdE9ic2VydmVkUm93SGVpZ2h0KSB7XG5cdFx0XHRcdFx0dGhpcy5fbGFzdE9ic2VydmVkUm93SGVpZ2h0ID0gcm93SGVpZ2h0O1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUm93SGVpZ2h0RW1pdHRlci5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0dGhpcy5fYXBwbHlUaGVtZShjb250YWluZXIpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlbmRlcigpOiBQcm9taXNlPHsgbGluZUNvdW50PzogbnVtYmVyOyBtYXhDb2x1bW5XaWR0aD86IG51bWJlciB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlclNlcXVlbmNlci5xdWV1ZSgoKSA9PiB0aGlzLl9yZW5kZXIoKSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzaXplcyB0aGUgbWlycm9yIHRvIGZpbGwgdGhlIGdpdmVuIHdpZHRoLCByZWx5aW5nIG9uIHh0ZXJtJ3MgbmF0aXZlIHJlc2l6ZSByZWZsb3cgdG9cblx0ICogcmUtd3JhcCBzb2Z0LXdyYXBwZWQgbGluZXMuIE5vLW9wIHdoZW4gdGhlIHJlc3VsdGluZyBjb2xzIGFyZSB1bmNoYW5nZWQuIFRoZSBjb2x1bW5cblx0ICogY291bnQgZGVyaXZlcyBmcm9tIHRoZSBtaXJyb3IncyBvd24geHRlcm0gZm9udCBtZXRyaWNzLCB3aGljaCByZWZsZWN0IHRoZSBhY3R1YWxcblx0ICogcmVuZGVyZXIgY2VsbCBzaXplIHJhdGhlciB0aGFuIGEgY29uZmlndXJhdGlvbi1iYXNlZCBlc3RpbWF0ZS5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBsYXlvdXQod2lkdGhQeDogbnVtYmVyKTogUHJvbWlzZTx7IGxpbmVDb3VudD86IG51bWJlcjsgbWF4Q29sdW1uV2lkdGg/OiBudW1iZXIgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh3aWR0aFB4IDw9IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJTZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWwgPSBhd2FpdCB0aGlzLl9nZXRUZXJtaW5hbCgpO1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbHMgPSBjb21wdXRlQ2hhdFRlcm1pbmFsTWlycm9yQ29scyh3aWR0aFB4LCB0ZXJtaW5hbC54dGVybS5nZXRGb250KCksIGdldE1pcnJvckRldmljZVBpeGVsUmF0aW8odGVybWluYWwpLCBtZWFzdXJlTWlycm9ySG9yaXpvbnRhbENocm9tZSh0ZXJtaW5hbCkpO1xuXHRcdFx0aWYgKHRlcm1pbmFsLnh0ZXJtLmNvbHMgPT09IGNvbHMpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdC8vIE5hdGl2ZSByZXNpemUgcmVmbG93IHJlLXdyYXBzIHRoZSByZW5kZXJlZCBjb250ZW50IGluIHBsYWNlOyByZXdyaXRpbmcgdGhlXG5cdFx0XHQvLyBzbmFwc2hvdCBoZXJlIGluc3RlYWQgd291bGQgZmxhc2ggYSBjbGVhcmVkIGZyYW1lIG9uIGV2ZXJ5IHJlc2l6ZVxuXHRcdFx0dGVybWluYWwueHRlcm0ucmVzaXplKGNvbHMsIENoYXRUZXJtaW5hbE1pcnJvck1ldHJpY3MuTWlycm9yUm93Q291bnQpO1xuXHRcdFx0aWYgKCF0aGlzLl9sYXN0UmVuZGVyZWRUZXh0KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBTYW1lIHJ1bGUgYXMgX3JlbmRlcjogYSB0cnVuY2F0ZWQgc25hcHNob3QncyBidWZmZXIgdW5kZXItcmVwcmVzZW50cyB0aGUgcmVhbFxuXHRcdFx0Ly8gb3V0cHV0LCBzbyBpdHMgZXhwbGljaXQgbGluZUNvdW50IG11c3Qgc3Vydml2ZSB0aGUgcmVzaXplXG5cdFx0XHRjb25zdCBsaW5lQ291bnQgPSBjb21wdXRlU25hcHNob3RMaW5lQ291bnQodGVybWluYWwueHRlcm0uYnVmZmVyLmFjdGl2ZSwgdGhpcy5fb3V0cHV0Py50cnVuY2F0ZWQgPyB0aGlzLl9vdXRwdXQubGluZUNvdW50IDogdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX2xhc3RSZW5kZXJlZExpbmVDb3VudCA9IGxpbmVDb3VudDtcblx0XHRcdGlmICh0aGlzLl9zaG91bGRDb21wdXRlTWF4Q29sdW1uV2lkdGgobGluZUNvdW50KSkge1xuXHRcdFx0XHR0aGlzLl9sYXN0UmVuZGVyZWRNYXhDb2x1bW5XaWR0aCA9IHRoaXMuX2NvbXB1dGVNYXhDb2x1bW5XaWR0aCh0ZXJtaW5hbCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBsaW5lQ291bnQsIG1heENvbHVtbldpZHRoOiB0aGlzLl9sYXN0UmVuZGVyZWRNYXhDb2x1bW5XaWR0aCB9O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVuZGVyKCk6IFByb21pc2U8eyBsaW5lQ291bnQ/OiBudW1iZXI7IG1heENvbHVtbldpZHRoPzogbnVtYmVyIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBvdXRwdXQgPSB0aGlzLl9vdXRwdXQ7XG5cdFx0Y29uc3Qgb3V0cHV0VmVyc2lvbiA9IHRoaXMuX291dHB1dFZlcnNpb247XG5cdFx0aWYgKCFvdXRwdXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChvdXRwdXRWZXJzaW9uID09PSB0aGlzLl9yZW5kZXJlZFZlcnNpb24pIHtcblx0XHRcdHJldHVybiB7IGxpbmVDb3VudDogdGhpcy5fbGFzdFJlbmRlcmVkTGluZUNvdW50ID8/IG91dHB1dC5saW5lQ291bnQsIG1heENvbHVtbldpZHRoOiB0aGlzLl9sYXN0UmVuZGVyZWRNYXhDb2x1bW5XaWR0aCB9O1xuXHRcdH1cblx0XHRjb25zdCB0ZXJtaW5hbCA9IGF3YWl0IHRoaXMuX2dldFRlcm1pbmFsKCk7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb250YWluZXIpIHtcblx0XHRcdHRoaXMuX2FwcGx5VGhlbWUodGhpcy5fY29udGFpbmVyKTtcblx0XHR9XG5cdFx0Y29uc3QgdGV4dCA9IG91dHB1dC50ZXh0ID8/ICcnO1xuXHRcdGlmICghdGV4dCkge1xuXHRcdFx0aWYgKHRoaXMuX2xhc3RSZW5kZXJlZFRleHQpIHtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB0ZXJtaW5hbC54dGVybS53cml0ZSgnXFx4MWJbMkpcXHgxYlszSlxceDFiW0gnLCByZXNvbHZlKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsaW5lQ291bnQgPSBvdXRwdXQubGluZUNvdW50ID8/IDA7XG5cdFx0XHR0aGlzLl9yZW5kZXJlZFZlcnNpb24gPSBvdXRwdXRWZXJzaW9uO1xuXHRcdFx0dGhpcy5fbGFzdFJlbmRlcmVkVGV4dCA9ICcnO1xuXHRcdFx0dGhpcy5fbGFzdFJlbmRlcmVkTGluZUNvdW50ID0gbGluZUNvdW50O1xuXHRcdFx0dGhpcy5fbGFzdFJlbmRlcmVkTWF4Q29sdW1uV2lkdGggPSAwO1xuXHRcdFx0cmV0dXJuIHsgbGluZUNvdW50LCBtYXhDb2x1bW5XaWR0aDogMCB9O1xuXHRcdH1cblx0XHRjb25zdCB3cml0ZSA9IHRleHQuc3RhcnRzV2l0aCh0aGlzLl9sYXN0UmVuZGVyZWRUZXh0KVxuXHRcdFx0PyB0ZXh0LnNsaWNlKHRoaXMuX2xhc3RSZW5kZXJlZFRleHQubGVuZ3RoKVxuXHRcdFx0OiBgXFx4MWJbMkpcXHgxYlszSlxceDFiW0gke3RleHR9YDtcblx0XHRpZiAod3JpdGUpIHtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gdGVybWluYWwueHRlcm0ud3JpdGUod3JpdGUsIHJlc29sdmUpKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIEEgcGVyc2lzdGVkIGxpbmVDb3VudCByZWZsZWN0cyB0aGUgd3JhcCB3aWR0aCBvZiB0aGUgc291cmNlIHRlcm1pbmFsLCB3aGljaCBjYW4gZGlmZmVyXG5cdFx0Ly8gZnJvbSB0aGlzIG1pcnJvcidzIGNvbHMgYWZ0ZXIgYSB3aWR0aCBsYXlvdXQuIE9ubHkgdHJ1c3QgaXQgZm9yIHRydW5jYXRlZCBvdXRwdXQsXG5cdFx0Ly8gd2hlcmUgdGhlIHRleHQgdW5kZXItcmVwcmVzZW50cyB0aGUgcmVhbCByb3cgY291bnQuXG5cdFx0Y29uc3QgbGluZUNvdW50ID0gY29tcHV0ZVNuYXBzaG90TGluZUNvdW50KHRlcm1pbmFsLnh0ZXJtLmJ1ZmZlci5hY3RpdmUsIG91dHB1dC50cnVuY2F0ZWQgPyBvdXRwdXQubGluZUNvdW50IDogdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9yZW5kZXJlZFZlcnNpb24gPSBvdXRwdXRWZXJzaW9uO1xuXHRcdHRoaXMuX2xhc3RSZW5kZXJlZFRleHQgPSB0ZXh0O1xuXHRcdHRoaXMuX2xhc3RSZW5kZXJlZExpbmVDb3VudCA9IGxpbmVDb3VudDtcblx0XHQvLyBPbmx5IGNvbXB1dGUgbWF4IGNvbHVtbiB3aWR0aCBmb3Igc21hbGwgb3V0cHV0cyB0byBhdm9pZCBwZXJmb3JtYW5jZSBpc3N1ZXNcblx0XHRpZiAodGhpcy5fc2hvdWxkQ29tcHV0ZU1heENvbHVtbldpZHRoKGxpbmVDb3VudCkpIHtcblx0XHRcdHRoaXMuX2xhc3RSZW5kZXJlZE1heENvbHVtbldpZHRoID0gdGhpcy5fY29tcHV0ZU1heENvbHVtbldpZHRoKHRlcm1pbmFsKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgbGluZUNvdW50LCBtYXhDb2x1bW5XaWR0aDogdGhpcy5fbGFzdFJlbmRlcmVkTWF4Q29sdW1uV2lkdGggfTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVNYXhDb2x1bW5XaWR0aCh0ZXJtaW5hbDogSURldGFjaGVkVGVybWluYWxJbnN0YW5jZSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIGNvbXB1dGVNYXhCdWZmZXJDb2x1bW5XaWR0aCh0ZXJtaW5hbC54dGVybS5idWZmZXIuYWN0aXZlLCB0ZXJtaW5hbC54dGVybS5jb2xzKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZENvbXB1dGVNYXhDb2x1bW5XaWR0aChsaW5lQ291bnQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBsaW5lQ291bnQgPD0gQ2hhdFRlcm1pbmFsTWlycm9yTWV0cmljcy5NYXhMaW5lc0ZvckNvbHVtbldpZHRoQ29tcHV0YXRpb247XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVRoZW1lKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCB0aGVtZSA9IHRoaXMuX2dldFRoZW1lKCk7XG5cdFx0aWYgKCF0aGVtZSkge1xuXHRcdFx0Y29udGFpbmVyLnN0eWxlLnJlbW92ZVByb3BlcnR5KCdiYWNrZ3JvdW5kLWNvbG9yJyk7XG5cdFx0XHRjb250YWluZXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJ2NvbG9yJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGVtZS5iYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gdGhlbWUuYmFja2dyb3VuZDtcblx0XHR9XG5cdFx0aWYgKHRoZW1lLmZvcmVncm91bmQpIHtcblx0XHRcdGNvbnRhaW5lci5zdHlsZS5jb2xvciA9IHRoZW1lLmZvcmVncm91bmQ7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7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O0FBQzVCLFFBQUksQ0FBQyxNQUFNO0FBQ1YsVUFBSSxLQUFLLG1CQUFtQjtBQUMzQixjQUFNLElBQUksUUFBYyxhQUFXLFNBQVMsTUFBTSxNQUFNLHdCQUF3QixPQUFPLENBQUM7QUFBQSxNQUN6RjtBQUNBLFlBQU1BLGFBQVksT0FBTyxhQUFhO0FBQ3RDLFdBQUssbUJBQW1CO0FBQ3hCLFdBQUssb0JBQW9CO0FBQ3pCLFdBQUsseUJBQXlCQTtBQUM5QixXQUFLLDhCQUE4QjtBQUNuQyxhQUFPLEVBQUUsV0FBQUEsWUFBVyxnQkFBZ0IsRUFBRTtBQUFBLElBQ3ZDO0FBQ0EsVUFBTSxRQUFRLEtBQUssV0FBVyxLQUFLLGlCQUFpQixJQUNqRCxLQUFLLE1BQU0sS0FBSyxrQkFBa0IsTUFBTSxJQUN4Qyx1QkFBdUIsSUFBSTtBQUM5QixRQUFJLE9BQU87QUFDVixZQUFNLElBQUksUUFBYyxhQUFXLFNBQVMsTUFBTSxNQUFNLE9BQU8sT0FBTyxDQUFDO0FBQUEsSUFDeEU7QUFDQSxRQUFJLEtBQUssT0FBTyxZQUFZO0FBQzNCLGFBQU87QUFBQSxJQUNSO0FBSUEsVUFBTSxZQUFZLHlCQUF5QixTQUFTLE1BQU0sT0FBTyxRQUFRLE9BQU8sWUFBWSxPQUFPLFlBQVksTUFBUztBQUN4SCxTQUFLLG1CQUFtQjtBQUN4QixTQUFLLG9CQUFvQjtBQUN6QixTQUFLLHlCQUF5QjtBQUU5QixRQUFJLEtBQUssNkJBQTZCLFNBQVMsR0FBRztBQUNqRCxXQUFLLDhCQUE4QixLQUFLLHVCQUF1QixRQUFRO0FBQUEsSUFDeEU7QUFDQSxXQUFPLEVBQUUsV0FBVyxnQkFBZ0IsS0FBSyw0QkFBNEI7QUFBQSxFQUN0RTtBQUFBLEVBRVEsdUJBQXVCLFVBQTZDO0FBQzNFLFdBQU8sNEJBQTRCLFNBQVMsTUFBTSxPQUFPLFFBQVEsU0FBUyxNQUFNLElBQUk7QUFBQSxFQUNyRjtBQUFBLEVBRVEsNkJBQTZCLFdBQTRCO0FBQ2hFLFdBQU8sYUFBYTtBQUFBLEVBQ3JCO0FBQUEsRUFFUSxZQUFZLFdBQThCO0FBQ2pELFVBQU0sUUFBUSxLQUFLLFVBQVU7QUFDN0IsUUFBSSxDQUFDLE9BQU87QUFDWCxnQkFBVSxNQUFNLGVBQWUsa0JBQWtCO0FBQ2pELGdCQUFVLE1BQU0sZUFBZSxPQUFPO0FBQ3RDO0FBQUEsSUFDRDtBQUNBLFFBQUksTUFBTSxZQUFZO0FBQ3JCLGdCQUFVLE1BQU0sa0JBQWtCLE1BQU07QUFBQSxJQUN6QztBQUNBLFFBQUksTUFBTSxZQUFZO0FBQ3JCLGdCQUFVLE1BQU0sUUFBUSxNQUFNO0FBQUEsSUFDL0I7QUFBQSxFQUNEO0FBQ0Q7QUExTmEsaUNBQU47QUFBQSxFQXFCSjtBQUFBLEVBQ0E7QUFBQSxHQXRCVTsiLAogICJuYW1lcyI6IFsiQ2hhdFRlcm1pbmFsTWlycm9yTWV0cmljcyIsICJzdGFydExpbmUiLCAidGV4dCIsICJlbmRMaW5lIiwgImxpbmVDb3VudCJdCn0K
