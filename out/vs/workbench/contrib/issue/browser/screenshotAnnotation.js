import { $, addDisposableListener, append, EventType, getWindow } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
var AnnotationTool = /* @__PURE__ */ ((AnnotationTool2) => {
  AnnotationTool2["Select"] = "select";
  AnnotationTool2["Freehand"] = "freehand";
  AnnotationTool2["Rectangle"] = "rectangle";
  AnnotationTool2["Ellipse"] = "ellipse";
  AnnotationTool2["Arrow"] = "arrow";
  AnnotationTool2["Text"] = "text";
  AnnotationTool2["Eraser"] = "eraser";
  AnnotationTool2["Pan"] = "pan";
  AnnotationTool2["Crop"] = "crop";
  AnnotationTool2["Move"] = "move";
  return AnnotationTool2;
})(AnnotationTool || {});
const COLORS = [
  "#ff3b30",
  // red
  "#007aff",
  // blue
  "#34c759",
  // green
  "#ffcc00",
  // yellow
  "#000000",
  // black
  "#ffffff"
  // white
];
const LIGHT_SWATCH_COLORS = /* @__PURE__ */ new Set(["#34c759", "#ffcc00", "#ffffff", "transparent"]);
const FONT_FAMILIES = [
  { label: "Sans-serif", value: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { label: "Monospace", value: '"Cascadia Code", "Fira Code", Consolas, monospace' },
  { label: "Serif", value: 'Georgia, "Times New Roman", serif' }
];
const DEFAULT_TEXT_BOX_WIDTH = 240;
const MIN_TEXT_BOX_WIDTH = 48;
const TEXT_DRAG_THRESHOLD = 4;
const CANVAS_BREATHING_ROOM = 64;
const FILL_COLORS = ["transparent", ...COLORS];
const STROKE_WIDTHS = [2, 4, 8, 12];
const TEXT_SIZES = [14, 18, 24, 32, 48];
function cloneDrawAction(action, identityMap = /* @__PURE__ */ new Map()) {
  const existing = identityMap.get(action);
  if (existing) {
    return existing;
  }
  const clone = {
    type: action.type,
    strokeColor: action.strokeColor,
    fillColor: action.fillColor,
    opacity: action.opacity,
    lineWidth: action.lineWidth,
    fontSize: action.fontSize,
    fontFamily: action.fontFamily,
    points: action.points ? action.points.map((p) => ({ x: p.x, y: p.y })) : void 0,
    rect: action.rect ? { ...action.rect } : void 0,
    ellipseRect: action.ellipseRect ? { ...action.ellipseRect } : void 0,
    arrowStart: action.arrowStart ? { ...action.arrowStart } : void 0,
    arrowEnd: action.arrowEnd ? { ...action.arrowEnd } : void 0,
    text: action.text,
    textPos: action.textPos ? { ...action.textPos } : void 0,
    textWidth: action.textWidth,
    cropFrom: action.cropFrom === void 0 ? void 0 : action.cropFrom === null ? null : { ...action.cropFrom },
    cropTo: action.cropTo === void 0 ? void 0 : action.cropTo === null ? null : { ...action.cropTo },
    moveBefore: action.moveBefore ? cloneMoveSnapshot(action.moveBefore) : void 0,
    moveAfter: action.moveAfter ? cloneMoveSnapshot(action.moveAfter) : void 0
  };
  identityMap.set(action, clone);
  clone.erasedActions = action.erasedActions ? action.erasedActions.map((a) => cloneDrawAction(a, identityMap)) : void 0;
  clone.erasedIndices = action.erasedIndices ? action.erasedIndices.slice() : void 0;
  clone.moveTarget = action.moveTarget ? cloneDrawAction(action.moveTarget, identityMap) : void 0;
  return clone;
}
function cloneMoveSnapshot(s) {
  return {
    points: s.points ? s.points.map((p) => ({ x: p.x, y: p.y })) : void 0,
    rect: s.rect ? { ...s.rect } : void 0,
    ellipseRect: s.ellipseRect ? { ...s.ellipseRect } : void 0,
    arrowStart: s.arrowStart ? { ...s.arrowStart } : void 0,
    arrowEnd: s.arrowEnd ? { ...s.arrowEnd } : void 0,
    textPos: s.textPos ? { ...s.textPos } : void 0,
    textWidth: s.textWidth
  };
}
function captureMoveSnapshot(action) {
  return cloneMoveSnapshot({
    points: action.points,
    rect: action.rect,
    ellipseRect: action.ellipseRect,
    arrowStart: action.arrowStart,
    arrowEnd: action.arrowEnd,
    textPos: action.textPos,
    textWidth: action.textWidth
  });
}
function applyMoveSnapshot(action, snapshot) {
  const fresh = cloneMoveSnapshot(snapshot);
  action.points = fresh.points;
  action.rect = fresh.rect;
  action.ellipseRect = fresh.ellipseRect;
  action.arrowStart = fresh.arrowStart;
  action.arrowEnd = fresh.arrowEnd;
  action.textPos = fresh.textPos;
  action.textWidth = fresh.textWidth;
}
function moveSnapshotsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
class ScreenshotAnnotationEditor {
  constructor(screenshot, parentElement, initialState) {
    this.screenshot = screenshot;
    this.parentElement = parentElement;
    this.initialState = initialState;
    this.disposables = new DisposableStore();
    this.toolOptionsDisposables = new DisposableStore();
    this._onDidSave = new Emitter();
    this.onDidSave = this._onDidSave.event;
    this._onDidCancel = new Emitter();
    this.onDidCancel = this._onDidCancel.event;
    this.activeTool = "freehand" /* Freehand */;
    this.activeStrokeColor = COLORS[0];
    this.activeFillColor = "transparent";
    this.activeLineWidth = 4;
    this.activeOpacity = 1;
    this.actions = [];
    this.undoneActions = [];
    this.currentAction = null;
    this.isDrawing = false;
    this.isErasing = false;
    /** Actions erased during the current pointer drag; committed to undo stack on pointer-up. */
    this.pendingEraseActions = [];
    /** Original index (in `actions[]`) of each entry in `pendingEraseActions`, captured at the moment it was removed. */
    this.pendingEraseIndices = [];
    this.imageElement = null;
    this.imageWidth = 0;
    this.imageHeight = 0;
    this.scale = 1;
    // Pan & zoom
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.lastPanPoint = { x: 0, y: 0 };
    // Crop with handles
    this.cropMode = false;
    this.cropRegion = null;
    this.cropDragHandle = null;
    this.cropDragStart = { x: 0, y: 0 };
    this.cropRegionStart = null;
    this.hasUserZoomed = false;
    /** Pending wheel-zoom delta accumulated across rapid wheel events; flushed on rAF. */
    this.pendingZoom = null;
    this.pendingZoomRaf = 0;
    // Original image preserved so crops can be expanded back
    this.originalImage = null;
    // Current crop region in original-image coords (null = no crop applied)
    this.currentCrop = null;
    // Pre-crop state restored on Cancel
    this.preCropState = null;
    this.mainToolbar = null;
    this.cropToolbar = null;
    // Selection (Select tool)
    this.selectedActionIndex = -1;
    this.isDraggingSelected = false;
    this.isResizingSelectedText = false;
    this.dragStart = { x: 0, y: 0 };
    this.selectedTextResizeStartWidth = DEFAULT_TEXT_BOX_WIDTH;
    /** Captured at the start of a Select-tool drag/resize so a Move sentinel can be committed on pointer-up. */
    this.pendingMove = null;
    // Text configuration
    this.activeFontSize = 18;
    this.activeFontFamily = FONT_FAMILIES[0].value;
    this.textPlacementState = null;
    this.textEditState = null;
    this.textEditor = null;
    this.textCaretVisible = true;
    this.textCaretInterval = null;
    // Tool buttons (for active state management)
    this.toolButtons = [];
    this.undoBtn = null;
    this.redoBtn = null;
    this.toolOptionsPopover = null;
    this.createUI();
    this.loadImage();
  }
  /** Annotations are stored in original-image coords. While in crop mode the canvas already shows the original image, so the offset is 0. */
  get cropOffsetX() {
    return this.cropMode ? 0 : this.currentCrop?.x ?? 0;
  }
  get cropOffsetY() {
    return this.cropMode ? 0 : this.currentCrop?.y ?? 0;
  }
  createUI() {
    this.container = append(this.parentElement, $("div.issue-reporter-annotation-overlay"));
    this.container.tabIndex = -1;
    const toolbar = append(this.container, $("div.annotation-toolbar"));
    this.mainToolbar = toolbar;
    const drawingTools = [
      { tool: "select" /* Select */, label: localize("select", "Select / Move"), icon: renderIcon(Codicon.inspect) },
      { tool: "pan" /* Pan */, label: localize("pan", "Pan"), icon: renderIcon(Codicon.move) }
    ];
    for (const { tool, label, icon } of drawingTools) {
      this.addToolButton(toolbar, tool, label, icon);
    }
    const cropBtn = append(toolbar, $("button.tool-btn.crop-btn"));
    cropBtn.appendChild(renderIcon(Codicon.screenCut));
    cropBtn.title = localize("crop", "Crop");
    cropBtn.setAttribute("aria-label", localize("crop", "Crop"));
    this.toolButtons.push({ element: cropBtn, tool: "crop" /* Crop */ });
    this.disposables.add(addDisposableListener(cropBtn, EventType.CLICK, () => {
      this.setActiveTool("crop" /* Crop */);
    }));
    const moreDrawingTools = [
      { tool: "freehand" /* Freehand */, label: localize("freehand", "Draw"), icon: renderIcon(Codicon.edit) },
      { tool: "rectangle" /* Rectangle */, label: localize("rectangle", "Rectangle"), icon: renderIcon(Codicon.primitiveSquare) },
      { tool: "ellipse" /* Ellipse */, label: localize("ellipse", "Ellipse"), icon: renderIcon(Codicon.circle) },
      { tool: "arrow" /* Arrow */, label: localize("arrow", "Arrow"), icon: renderIcon(Codicon.arrowRight) },
      { tool: "eraser" /* Eraser */, label: localize("eraser", "Eraser"), icon: renderIcon(Codicon.eraser) }
    ];
    for (const { tool, label, icon } of moreDrawingTools) {
      this.addToolButton(toolbar, tool, label, icon);
    }
    this.addToolButton(toolbar, "text" /* Text */, localize("text", "Text"), renderIcon(Codicon.symbolString));
    this.toolOptionsPopover = append(this.container, $("div.annotation-tool-options-popover"));
    this.toolOptionsPopover.style.display = "none";
    this.disposables.add(addDisposableListener(this.container, EventType.CLICK, (e) => {
      if (!this.toolOptionsPopover || this.toolOptionsPopover.style.display === "none") {
        return;
      }
      const target = e.target;
      if (!this.toolOptionsPopover.contains(target) && !this.toolButtons.some((button) => button.element.contains(target))) {
        this.hideToolOptions();
      }
    }));
    this.renderToolOptions();
    append(toolbar, $("div.toolbar-separator"));
    const undoBtn = append(toolbar, $("button.tool-btn"));
    undoBtn.appendChild(renderIcon(Codicon.discard));
    undoBtn.title = localize("undo", "Undo");
    undoBtn.setAttribute("aria-label", localize("undo", "Undo"));
    this.disposables.add(addDisposableListener(undoBtn, EventType.CLICK, () => this.undo()));
    this.undoBtn = undoBtn;
    const redoBtn = append(toolbar, $("button.tool-btn"));
    redoBtn.appendChild(renderIcon(Codicon.redo));
    redoBtn.title = localize("redo", "Redo");
    redoBtn.setAttribute("aria-label", localize("redo", "Redo"));
    this.disposables.add(addDisposableListener(redoBtn, EventType.CLICK, () => this.redo()));
    this.redoBtn = redoBtn;
    this.updateUndoRedoState();
    append(toolbar, $("div.toolbar-separator"));
    const discardBtn = this.disposables.add(new Button(toolbar, { ...defaultButtonStyles, secondary: true }));
    discardBtn.label = localize("discard", "Discard");
    this.disposables.add(discardBtn.onDidClick(() => {
      this.cancelTextEdit();
      this._onDidCancel.fire();
      this.dispose();
    }));
    const saveBtn = this.disposables.add(new Button(toolbar, defaultButtonStyles));
    saveBtn.label = localize("save", "Save");
    this.disposables.add(saveBtn.onDidClick(() => {
      this.commitTextEdit();
      const dataUrl = this.compositeToDataUrl();
      this._onDidSave.fire({ dataUrl, state: this.captureState() });
      this.dispose();
    }));
    const cropToolbar = append(this.container, $("div.annotation-toolbar.annotation-crop-toolbar"));
    cropToolbar.style.display = "none";
    this.cropToolbar = cropToolbar;
    const cropCancelBtn = this.disposables.add(new Button(cropToolbar, { ...defaultButtonStyles, secondary: true }));
    cropCancelBtn.label = localize("cancel", "Cancel");
    this.disposables.add(cropCancelBtn.onDidClick(() => {
      this.cancelCrop();
    }));
    const cropApplyBtn = this.disposables.add(new Button(cropToolbar, defaultButtonStyles));
    cropApplyBtn.label = localize("apply", "Apply");
    this.disposables.add(cropApplyBtn.onDidClick(() => {
      this.commitCrop();
    }));
    const hint = append(this.container, $("div.annotation-hint"));
    hint.textContent = localize("annotationHint", "Edit screenshot to highlight the problem");
    const canvasContainer = append(this.container, $("div.annotation-canvas-container"));
    this.canvas = append(canvasContainer, $("canvas"));
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D canvas context");
    }
    this.ctx = ctx;
    this.disposables.add(addDisposableListener(this.canvas, EventType.POINTER_DOWN, (e) => this.onPointerDown(e)));
    this.disposables.add(addDisposableListener(this.canvas, EventType.POINTER_MOVE, (e) => this.onPointerMove(e)));
    this.disposables.add(addDisposableListener(this.canvas, EventType.POINTER_UP, (e) => this.onPointerUp(e)));
    this.disposables.add(addDisposableListener(this.canvas, EventType.DBLCLICK, () => {
      this.commitCrop();
    }));
    this.disposables.add(addDisposableListener(canvasContainer, EventType.WHEEL, (e) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        const factor = delta < 0 ? 1.1 : 0.9;
        const containerRect = canvasContainer.getBoundingClientRect();
        const cx = e.clientX - (containerRect.left + containerRect.width / 2);
        const cy = e.clientY - (containerRect.top + containerRect.height / 2);
        if (this.pendingZoom) {
          this.pendingZoom.factor *= factor;
          this.pendingZoom.cx = cx;
          this.pendingZoom.cy = cy;
        } else {
          this.pendingZoom = { factor, cx, cy };
        }
        if (!this.pendingZoomRaf) {
          const targetWindow = getWindow(this.canvas);
          this.pendingZoomRaf = targetWindow.requestAnimationFrame(() => {
            this.pendingZoomRaf = 0;
            this.flushPendingZoom();
          });
        }
      } else {
        this.panX -= e.deltaX;
        this.panY -= e.deltaY;
        this.clampPan();
        this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
      }
    }, { passive: false }));
    this.disposables.add(addDisposableListener(this.container, EventType.KEY_DOWN, (e) => {
      if (this.textEditState) {
        return;
      }
      if (this.textPlacementState && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.cancelTextPlacement();
        return;
      }
      if (e.key === "Escape") {
        if (this.cropMode) {
          e.preventDefault();
          e.stopPropagation();
          this.cancelCrop();
          return;
        }
        if (this.selectedActionIndex >= 0) {
          this.selectedActionIndex = -1;
          this.redraw();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        this._onDidCancel.fire();
        this.dispose();
      } else if (e.key === "Enter" && this.cropMode) {
        e.preventDefault();
        this.commitCrop();
      } else if ((e.key === "Delete" || e.key === "Backspace") && this.selectedActionIndex >= 0) {
        e.preventDefault();
        const removedIndex = this.selectedActionIndex;
        const [removed] = this.actions.splice(removedIndex, 1);
        this.selectedActionIndex = -1;
        this.actions.push({
          type: "eraser" /* Eraser */,
          strokeColor: "",
          opacity: 1,
          lineWidth: 0,
          erasedActions: [removed],
          erasedIndices: [removedIndex]
        });
        this.undoneActions.length = 0;
        this.updateUndoRedoState();
        this.redraw();
      }
    }));
    const resizeObserver = new ResizeObserver(() => {
      if (this.imageElement) {
        if (this.hasUserZoomed) {
          const minScale = this.getFitScale();
          if (this.scale < minScale) {
            this.scale = minScale;
          }
        }
        this.sizeCanvas();
        this.clampPan();
        this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
        this.redraw();
      }
    });
    resizeObserver.observe(canvasContainer);
    this.disposables.add({ dispose: () => resizeObserver.disconnect() });
  }
  addToolButton(toolbar, tool, label, icon) {
    const btn = append(toolbar, $("button.tool-btn"));
    btn.appendChild(icon);
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-pressed", String(tool === this.activeTool));
    if (tool === this.activeTool) {
      btn.classList.add("active");
    }
    this.toolButtons.push({ element: btn, tool });
    this.disposables.add(addDisposableListener(btn, EventType.CLICK, (e) => {
      e.stopPropagation();
      this.setActiveTool(tool);
    }));
  }
  renderToolOptions() {
    if (!this.toolOptionsPopover) {
      return;
    }
    this.toolOptionsDisposables.clear();
    this.toolOptionsPopover.textContent = "";
    this.toolOptionsPopover.setAttribute("role", "group");
    this.toolOptionsPopover.setAttribute("aria-label", localize("toolOptions", "Tool Options"));
    this.appendColorOptions(
      this.toolOptionsPopover,
      this.activeTool === "text" /* Text */ ? localize("textColor", "Text Color") : localize("strokeColor", "Stroke Color"),
      COLORS,
      this.activeStrokeColor,
      localize("setStrokeColor", "Set Stroke Color"),
      (color) => {
        this.activeStrokeColor = color;
        this.applyToolOptionsToTextEdit();
      }
    );
    if (this.activeTool !== "freehand" /* Freehand */ && this.activeTool !== "arrow" /* Arrow */) {
      this.appendColorOptions(
        this.toolOptionsPopover,
        this.activeTool === "text" /* Text */ ? localize("textBackgroundColor", "Background Color") : localize("fillColor", "Fill Color"),
        FILL_COLORS,
        this.activeFillColor,
        localize("setFillColor", "Set Fill Color"),
        (color) => {
          this.activeFillColor = color;
          this.applyToolOptionsToTextEdit();
        }
      );
    }
    this.appendSizeOptions(this.toolOptionsPopover);
    this.appendOpacityOptions(this.toolOptionsPopover);
  }
  appendColorOptions(container, label, colors, selectedColor, ariaLabelPrefix, onSelect) {
    const group = append(container, $("div.annotation-tool-options-group"));
    append(group, $("span.annotation-tool-options-label")).textContent = label;
    const swatches = append(group, $("div.annotation-color-swatches"));
    for (const color of colors) {
      const swatch = append(swatches, $("button.annotation-color-swatch"));
      const isTransparent = color === "transparent";
      swatch.classList.toggle("transparent", isTransparent);
      swatch.classList.toggle("light-swatch", LIGHT_SWATCH_COLORS.has(color));
      swatch.style.backgroundColor = isTransparent ? "transparent" : color;
      swatch.setAttribute("aria-label", isTransparent ? localize("transparentColor", "{0}: Transparent", ariaLabelPrefix) : localize("colorValue", "{0}: {1}", ariaLabelPrefix, color));
      swatch.setAttribute("aria-pressed", String(color === selectedColor));
      swatch.classList.toggle("active", color === selectedColor);
      this.toolOptionsDisposables.add(addDisposableListener(swatch, EventType.CLICK, (e) => {
        e.stopPropagation();
        onSelect(color);
        this.renderToolOptions();
        this.redraw();
      }));
    }
  }
  appendSizeOptions(container) {
    const isText = this.activeTool === "text" /* Text */;
    const values = isText ? TEXT_SIZES : STROKE_WIDTHS;
    const selectedValue = isText ? this.activeFontSize : this.activeLineWidth;
    const group = append(container, $("div.annotation-tool-options-group"));
    append(group, $("span.annotation-tool-options-label")).textContent = isText ? localize("textSize", "Text Size") : localize("strokeWidth", "Stroke Width");
    const buttons = append(group, $("div.annotation-size-buttons"));
    for (const value of values) {
      const button = append(buttons, $("button.annotation-size-button"));
      button.textContent = `${value}`;
      button.setAttribute("aria-label", isText ? localize("setTextSize", "Set Text Size to {0}px", value) : localize("setStrokeWidth", "Set Stroke Width to {0}px", value));
      button.setAttribute("aria-pressed", String(value === selectedValue));
      button.classList.toggle("active", value === selectedValue);
      this.toolOptionsDisposables.add(addDisposableListener(button, EventType.CLICK, (e) => {
        e.stopPropagation();
        if (isText) {
          this.activeFontSize = value;
        } else {
          this.activeLineWidth = value;
        }
        this.applyToolOptionsToTextEdit();
        this.renderToolOptions();
        this.redraw();
      }));
    }
  }
  appendOpacityOptions(container) {
    const group = append(container, $("div.annotation-tool-options-group.annotation-opacity-options"));
    const label = append(group, $("label.annotation-tool-options-label"));
    label.textContent = localize("opacity", "Opacity");
    const input = append(group, $("input.annotation-opacity-slider"));
    input.type = "range";
    input.min = "20";
    input.max = "100";
    input.step = "10";
    input.value = `${Math.round(this.activeOpacity * 100)}`;
    input.setAttribute("aria-label", localize("setOpacity", "Set Opacity"));
    const value = append(group, $("span.annotation-opacity-value"));
    value.textContent = `${input.value}%`;
    this.toolOptionsDisposables.add(addDisposableListener(input, EventType.INPUT, (e) => {
      e.stopPropagation();
      this.activeOpacity = Number(input.value) / 100;
      value.textContent = `${input.value}%`;
      this.applyToolOptionsToTextEdit();
      this.redraw();
    }));
  }
  applyToolOptionsToTextEdit() {
    if (!this.textEditState) {
      return;
    }
    this.textEditState.strokeColor = this.activeStrokeColor;
    this.textEditState.fillColor = this.activeFillColor;
    this.textEditState.opacity = this.activeOpacity;
    this.textEditState.fontSize = this.activeFontSize;
  }
  showToolOptions(anchor) {
    if (!this.toolOptionsPopover || !this.hasToolOptions(this.activeTool)) {
      this.hideToolOptions();
      return;
    }
    this.renderToolOptions();
    const containerRect = this.container.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    this.toolOptionsPopover.style.top = `${anchorRect.bottom - containerRect.top + 6}px`;
    this.toolOptionsPopover.style.display = "flex";
    const halfWidth = this.toolOptionsPopover.offsetWidth / 2;
    const desiredLeft = anchorRect.left + anchorRect.width / 2 - containerRect.left;
    const minLeft = halfWidth + 8;
    const maxLeft = Math.max(minLeft, containerRect.width - halfWidth - 8);
    this.toolOptionsPopover.style.left = `${Math.min(Math.max(desiredLeft, minLeft), maxLeft)}px`;
  }
  hideToolOptions() {
    if (this.toolOptionsPopover) {
      this.toolOptionsPopover.style.display = "none";
    }
  }
  hasToolOptions(tool) {
    return tool === "freehand" /* Freehand */ || tool === "rectangle" /* Rectangle */ || tool === "ellipse" /* Ellipse */ || tool === "arrow" /* Arrow */ || tool === "text" /* Text */;
  }
  setActiveTool(tool) {
    if (this.textEditState && tool !== "text" /* Text */) {
      this.commitTextEdit();
    }
    if (this.textPlacementState && tool !== "text" /* Text */) {
      this.cancelTextPlacement();
    }
    if (tool === "crop" /* Crop */) {
      this.hideToolOptions();
      this.enterCropMode();
      return;
    }
    this.activeTool = tool;
    this.selectedActionIndex = -1;
    for (const tb of this.toolButtons) {
      tb.element.classList.toggle("active", tb.tool === tool);
      tb.element.setAttribute("aria-pressed", String(tb.tool === tool));
    }
    const activeToolButton = this.toolButtons.find((tb) => tb.tool === tool)?.element;
    if (activeToolButton && this.hasToolOptions(tool)) {
      this.showToolOptions(activeToolButton);
    } else {
      this.hideToolOptions();
    }
    this.canvas.style.cursor = tool === "select" /* Select */ ? "default" : tool === "pan" /* Pan */ ? "grab" : tool === "eraser" /* Eraser */ ? `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewport='0 0 24 24'><circle cx='12' cy='12' r='9' fill='none' stroke='%23fff' stroke-width='2'/><circle cx='12' cy='12' r='9' fill='none' stroke='%23000' stroke-width='1' stroke-dasharray='2 2'/></svg>") 12 12, cell` : "crosshair";
    this.redraw();
  }
  enterCropMode() {
    if (this.cropMode || !this.originalImage) {
      return;
    }
    this.preCropState = {
      element: this.imageElement,
      width: this.imageWidth,
      height: this.imageHeight,
      currentCrop: this.currentCrop
    };
    this.imageElement = this.originalImage.element;
    this.imageWidth = this.originalImage.width;
    this.imageHeight = this.originalImage.height;
    this.cropRegion = this.currentCrop ? { ...this.currentCrop } : { x: 0, y: 0, width: this.originalImage.width, height: this.originalImage.height };
    this.cropMode = true;
    for (const tb of this.toolButtons) {
      tb.element.classList.toggle("active", tb.tool === "crop" /* Crop */);
    }
    if (this.mainToolbar) {
      this.mainToolbar.style.display = "none";
    }
    if (this.cropToolbar) {
      this.cropToolbar.style.display = "";
    }
    this.hasUserZoomed = false;
    this.panX = 0;
    this.panY = 0;
    this.canvas.style.transform = "";
    this.canvas.style.cursor = "default";
    this.sizeCanvas();
    this.redraw();
  }
  exitCropMode() {
    this.cropMode = false;
    this.cropRegion = null;
    this.cropDragHandle = null;
    this.cropRegionStart = null;
    this.preCropState = null;
    if (this.mainToolbar) {
      this.mainToolbar.style.display = "";
    }
    if (this.cropToolbar) {
      this.cropToolbar.style.display = "none";
    }
    this.setActiveTool(this.activeTool);
  }
  commitCrop() {
    if (!this.cropMode || !this.cropRegion || !this.originalImage) {
      return;
    }
    const cr = this.normalizeCropRect(this.cropRegion);
    if (cr.width < 10 || cr.height < 10) {
      return;
    }
    const cropFrom = this.preCropState?.currentCrop ?? null;
    const cropAction = {
      type: "crop" /* Crop */,
      strokeColor: "",
      opacity: 1,
      lineWidth: 0,
      cropFrom,
      cropTo: cr
    };
    this.actions.push(cropAction);
    this.undoneActions.length = 0;
    this.updateUndoRedoState();
    this.hasUserZoomed = false;
    this.panX = 0;
    this.panY = 0;
    this.canvas.style.transform = "";
    this.exitCropMode();
    this.applyDisplayedCrop(cr);
  }
  cancelCrop() {
    if (!this.cropMode || !this.preCropState) {
      this.exitCropMode();
      return;
    }
    this.imageElement = this.preCropState.element;
    this.imageWidth = this.preCropState.width;
    this.imageHeight = this.preCropState.height;
    this.currentCrop = this.preCropState.currentCrop;
    this.hasUserZoomed = false;
    this.panX = 0;
    this.panY = 0;
    this.canvas.style.transform = "";
    this.exitCropMode();
    this.sizeCanvas();
    this.redraw();
  }
  loadImage() {
    const img = mainWindow.document.createElement("img");
    img.onload = () => {
      this.imageElement = img;
      this.imageWidth = img.naturalWidth;
      this.imageHeight = img.naturalHeight;
      this.originalImage = { element: img, width: img.naturalWidth, height: img.naturalHeight };
      this.currentCrop = null;
      if (this.initialState && (this.initialState.actions.length || this.initialState.undoneActions.length)) {
        const identityMap = /* @__PURE__ */ new Map();
        this.actions.push(...this.initialState.actions.map((a) => cloneDrawAction(a, identityMap)));
        this.undoneActions.push(...this.initialState.undoneActions.map((a) => cloneDrawAction(a, identityMap)));
        this.updateUndoRedoState();
      }
      this.applyDisplayedCrop(this.initialState?.crop ?? null);
    };
    img.src = this.screenshot.dataUrl;
  }
  /**
   * Update the displayed image to reflect the given crop (or the full original
   * when null). Cropped images are re-rasterized from the preserved original so
   * undo/redo of crop actions is fully reversible without keeping intermediate
   * image elements around.
   */
  applyDisplayedCrop(crop) {
    if (!this.originalImage) {
      return;
    }
    if (!crop) {
      this.imageElement = this.originalImage.element;
      this.imageWidth = this.originalImage.width;
      this.imageHeight = this.originalImage.height;
      this.currentCrop = null;
      this.sizeCanvas();
      this.redraw();
      return;
    }
    const cr = {
      x: Math.max(0, Math.min(this.originalImage.width, crop.x)),
      y: Math.max(0, Math.min(this.originalImage.height, crop.y)),
      width: Math.max(1, Math.min(this.originalImage.width - Math.max(0, crop.x), crop.width)),
      height: Math.max(1, Math.min(this.originalImage.height - Math.max(0, crop.y), crop.height))
    };
    const cropCanvas = mainWindow.document.createElement("canvas");
    cropCanvas.width = cr.width;
    cropCanvas.height = cr.height;
    const cropCtx = cropCanvas.getContext("2d");
    cropCtx.drawImage(this.originalImage.element, cr.x, cr.y, cr.width, cr.height, 0, 0, cr.width, cr.height);
    const croppedImg = mainWindow.document.createElement("img");
    croppedImg.onload = () => {
      this.imageElement = croppedImg;
      this.imageWidth = croppedImg.naturalWidth;
      this.imageHeight = croppedImg.naturalHeight;
      this.currentCrop = cr;
      this.sizeCanvas();
      this.redraw();
    };
    croppedImg.src = cropCanvas.toDataURL("image/png");
  }
  captureState() {
    const identityMap = /* @__PURE__ */ new Map();
    return {
      actions: this.actions.map((a) => cloneDrawAction(a, identityMap)),
      undoneActions: this.undoneActions.map((a) => cloneDrawAction(a, identityMap)),
      crop: this.currentCrop ? { ...this.currentCrop } : null
    };
  }
  sizeCanvas() {
    const container = this.canvas.parentElement;
    if (!container) {
      return;
    }
    const targetWindow = getWindow(this.canvas);
    const dpr = targetWindow.devicePixelRatio || 1;
    const maxWidth = container.clientWidth - CANVAS_BREATHING_ROOM * 2;
    const maxHeight = container.clientHeight - CANVAS_BREATHING_ROOM * 2;
    if (!this.hasUserZoomed) {
      const scaleX = maxWidth / this.imageWidth;
      const scaleY = maxHeight / this.imageHeight;
      this.scale = Math.min(scaleX, scaleY, 1);
    }
    const displayWidth = Math.floor(this.imageWidth * this.scale);
    const displayHeight = Math.floor(this.imageHeight * this.scale);
    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;
    const MAX_BACKING_DIM = 4096;
    const naturalW = displayWidth * dpr;
    const naturalH = displayHeight * dpr;
    const overage = Math.max(1, naturalW / MAX_BACKING_DIM, naturalH / MAX_BACKING_DIM);
    const effectiveDpr = dpr / overage;
    this.canvas.width = Math.max(1, Math.floor(displayWidth * effectiveDpr));
    this.canvas.height = Math.max(1, Math.floor(displayHeight * effectiveDpr));
    this.ctx.setTransform(effectiveDpr, 0, 0, effectiveDpr, 0, 0);
  }
  canvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / this.scale + this.cropOffsetX,
      y: (e.clientY - rect.top) / this.scale + this.cropOffsetY
    };
  }
  onPointerDown(e) {
    const pos = this.canvasCoords(e);
    if (this.cropMode && this.cropRegion) {
      const handle = this.cropHandleHitTest(pos);
      if (handle) {
        this.cropDragHandle = handle;
        this.cropDragStart = pos;
        this.cropRegionStart = { ...this.cropRegion };
        this.canvas.setPointerCapture(e.pointerId);
      }
      return;
    }
    if (this.activeTool === "select" /* Select */) {
      const hitIndex = this.hitTest(pos);
      this.selectedActionIndex = hitIndex;
      if (hitIndex >= 0) {
        const hitAction = this.actions[hitIndex];
        this.pendingMove = { target: hitAction, before: captureMoveSnapshot(hitAction) };
        if (hitAction.type === "text" /* Text */ && this.isNearTextResizeHandle(pos, hitAction)) {
          this.isResizingSelectedText = true;
          this.dragStart = { x: pos.x, y: pos.y };
          this.selectedTextResizeStartWidth = hitAction.textWidth ?? DEFAULT_TEXT_BOX_WIDTH;
          this.canvas.setPointerCapture(e.pointerId);
          this.canvas.style.cursor = "ew-resize";
        } else {
          this.isDraggingSelected = true;
          this.dragStart = { x: pos.x, y: pos.y };
          this.canvas.setPointerCapture(e.pointerId);
          this.canvas.style.cursor = "move";
        }
      }
      this.redraw();
      return;
    }
    this.selectedActionIndex = -1;
    if (this.activeTool === "text" /* Text */) {
      this.commitTextEdit();
      this.textPlacementState = {
        start: pos,
        current: pos,
        pointerId: e.pointerId
      };
      this.canvas.setPointerCapture(e.pointerId);
      this.redraw();
      return;
    }
    if (this.activeTool === "eraser" /* Eraser */) {
      this.isErasing = true;
      this.canvas.setPointerCapture(e.pointerId);
      this.eraseAt(pos);
      return;
    }
    if (this.activeTool === "pan" /* Pan */) {
      this.isPanning = true;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.style.cursor = "grabbing";
      return;
    }
    this.isDrawing = true;
    this.canvas.setPointerCapture(e.pointerId);
    switch (this.activeTool) {
      case "freehand" /* Freehand */:
        this.currentAction = {
          type: "freehand" /* Freehand */,
          strokeColor: this.activeStrokeColor,
          opacity: this.activeOpacity,
          lineWidth: this.activeLineWidth,
          points: [pos]
        };
        break;
      case "rectangle" /* Rectangle */:
        this.currentAction = {
          type: "rectangle" /* Rectangle */,
          strokeColor: this.activeStrokeColor,
          fillColor: this.activeFillColor,
          opacity: this.activeOpacity,
          lineWidth: this.activeLineWidth,
          rect: { x: pos.x, y: pos.y, width: 0, height: 0 }
        };
        break;
      case "ellipse" /* Ellipse */:
        this.currentAction = {
          type: "ellipse" /* Ellipse */,
          strokeColor: this.activeStrokeColor,
          fillColor: this.activeFillColor,
          opacity: this.activeOpacity,
          lineWidth: this.activeLineWidth,
          ellipseRect: { x: pos.x, y: pos.y, width: 0, height: 0 }
        };
        break;
      case "arrow" /* Arrow */:
        this.currentAction = {
          type: "arrow" /* Arrow */,
          strokeColor: this.activeStrokeColor,
          opacity: this.activeOpacity,
          lineWidth: this.activeLineWidth,
          arrowStart: pos,
          arrowEnd: pos
        };
        break;
    }
  }
  onPointerMove(e) {
    if (this.cropMode) {
      const pos2 = this.canvasCoords(e);
      if (this.cropDragHandle && this.cropRegionStart) {
        this.updateCropRegion(pos2);
        this.redraw();
        return;
      }
      const handle = this.cropHandleHitTest(pos2);
      this.canvas.style.cursor = this.cropCursorFor(handle);
      return;
    }
    if (this.isResizingSelectedText && this.selectedActionIndex >= 0) {
      const pos2 = this.canvasCoords(e);
      const action = this.actions[this.selectedActionIndex];
      if (action.type === "text" /* Text */) {
        action.textWidth = Math.max(MIN_TEXT_BOX_WIDTH, this.selectedTextResizeStartWidth + (pos2.x - this.dragStart.x));
        this.redraw();
      }
      return;
    }
    if (this.isDraggingSelected && this.selectedActionIndex >= 0) {
      const pos2 = this.canvasCoords(e);
      const dx = pos2.x - this.dragStart.x;
      const dy = pos2.y - this.dragStart.y;
      this.moveAction(this.actions[this.selectedActionIndex], dx, dy);
      this.dragStart = { x: pos2.x, y: pos2.y };
      this.redraw();
      return;
    }
    if (this.isPanning) {
      const dx = e.clientX - this.lastPanPoint.x;
      const dy = e.clientY - this.lastPanPoint.y;
      this.panX += dx;
      this.panY += dy;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.clampPan();
      this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
      return;
    }
    if (this.textPlacementState) {
      const pos2 = this.canvasCoords(e);
      this.textPlacementState.current = pos2;
      this.redraw();
      return;
    }
    if (this.isErasing) {
      const pos2 = this.canvasCoords(e);
      this.eraseAt(pos2);
      return;
    }
    if (this.activeTool === "select" /* Select */ && this.selectedActionIndex >= 0) {
      const pos2 = this.canvasCoords(e);
      const action = this.actions[this.selectedActionIndex];
      if (action.type === "text" /* Text */ && this.isNearTextResizeHandle(pos2, action)) {
        this.canvas.style.cursor = "ew-resize";
      } else if (this.selectedActionIndex >= 0) {
        this.canvas.style.cursor = "default";
      }
    }
    if (!this.isDrawing) {
      return;
    }
    const pos = this.canvasCoords(e);
    if (!this.currentAction) {
      return;
    }
    switch (this.currentAction.type) {
      case "freehand" /* Freehand */:
        this.currentAction.points.push(pos);
        break;
      case "rectangle" /* Rectangle */: {
        const rect = this.currentAction.rect;
        this.currentAction.rect = {
          ...rect,
          width: pos.x - rect.x,
          height: pos.y - rect.y
        };
        break;
      }
      case "ellipse" /* Ellipse */: {
        const er = this.currentAction.ellipseRect;
        let w = pos.x - er.x;
        let h = pos.y - er.y;
        if (e.shiftKey) {
          const size = Math.max(Math.abs(w), Math.abs(h));
          w = Math.sign(w) * size;
          h = Math.sign(h) * size;
        }
        this.currentAction.ellipseRect = { ...er, width: w, height: h };
        break;
      }
      case "arrow" /* Arrow */:
        this.currentAction.arrowEnd = pos;
        break;
    }
    this.redraw();
  }
  onPointerUp(e) {
    if (this.cropMode && this.cropDragHandle) {
      this.cropDragHandle = null;
      this.cropRegionStart = null;
      this.canvas.releasePointerCapture(e.pointerId);
      return;
    }
    if (this.isResizingSelectedText) {
      this.isResizingSelectedText = false;
      this.canvas.releasePointerCapture(e.pointerId);
      this.canvas.style.cursor = "default";
      this.commitPendingMove();
      return;
    }
    if (this.isDraggingSelected) {
      this.isDraggingSelected = false;
      this.canvas.releasePointerCapture(e.pointerId);
      this.canvas.style.cursor = "default";
      this.commitPendingMove();
      return;
    }
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.releasePointerCapture(e.pointerId);
      this.canvas.style.cursor = this.activeTool === "pan" /* Pan */ ? "grab" : "crosshair";
      return;
    }
    if (this.isErasing) {
      this.isErasing = false;
      this.canvas.releasePointerCapture(e.pointerId);
      if (this.pendingEraseActions.length > 0) {
        this.actions.push({
          type: "eraser" /* Eraser */,
          strokeColor: "",
          opacity: 1,
          lineWidth: 0,
          erasedActions: this.pendingEraseActions.slice(),
          erasedIndices: this.pendingEraseIndices.slice()
        });
        this.pendingEraseActions = [];
        this.pendingEraseIndices = [];
        this.undoneActions.length = 0;
        this.updateUndoRedoState();
      }
      return;
    }
    if (this.textPlacementState) {
      const { start, current, pointerId } = this.textPlacementState;
      if (pointerId === e.pointerId) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
      const dx = current.x - start.x;
      const didDrag = Math.abs(dx) >= TEXT_DRAG_THRESHOLD;
      const x = didDrag ? Math.min(start.x, current.x) : start.x;
      const rawWidth = didDrag ? Math.abs(dx) : this.getMaxTextWidthFrom(start.x);
      const width = didDrag ? Math.max(1, Math.min(rawWidth, this.getTextImageRight() - x)) : rawWidth;
      const y = start.y;
      this.textPlacementState = null;
      this.startTextEdit({ x, y }, width, didDrag);
      return;
    }
    if (!this.isDrawing) {
      return;
    }
    this.canvas.releasePointerCapture(e.pointerId);
    this.isDrawing = false;
    if (this.currentAction) {
      this.actions.push(this.currentAction);
      this.undoneActions.length = 0;
      this.updateUndoRedoState();
      this.currentAction = null;
    }
    this.redraw();
  }
  eraseAt(pos) {
    const hitIndex = this.hitTest(pos);
    if (hitIndex < 0) {
      return;
    }
    const [erased] = this.actions.splice(hitIndex, 1);
    this.pendingEraseActions.push(erased);
    this.pendingEraseIndices.push(hitIndex);
    this.selectedActionIndex = -1;
    this.redraw();
  }
  commitPendingMove() {
    const pending = this.pendingMove;
    this.pendingMove = null;
    if (!pending) {
      return;
    }
    const after = captureMoveSnapshot(pending.target);
    if (moveSnapshotsEqual(pending.before, after)) {
      return;
    }
    this.actions.push({
      type: "move" /* Move */,
      strokeColor: "",
      opacity: 1,
      lineWidth: 0,
      moveTarget: pending.target,
      moveBefore: pending.before,
      moveAfter: after
    });
    this.undoneActions.length = 0;
    this.updateUndoRedoState();
  }
  updateUndoRedoState() {
    if (this.undoBtn) {
      this.undoBtn.disabled = this.actions.length === 0;
    }
    if (this.redoBtn) {
      this.redoBtn.disabled = this.undoneActions.length === 0;
    }
  }
  undo() {
    if (this.textPlacementState) {
      this.cancelTextPlacement();
      return;
    }
    if (this.textEditState) {
      this.cancelTextEdit();
      return;
    }
    const action = this.actions.pop();
    if (!action) {
      return;
    }
    if (action.type === "eraser" /* Eraser */ && action.erasedActions) {
      const erased = action.erasedActions;
      const indices = action.erasedIndices ?? erased.map(() => this.actions.length);
      for (let i = erased.length - 1; i >= 0; i--) {
        const idx = Math.min(indices[i], this.actions.length);
        this.actions.splice(idx, 0, erased[i]);
      }
    }
    this.undoneActions.push(action);
    this.updateUndoRedoState();
    this.selectedActionIndex = -1;
    if (action.type === "crop" /* Crop */) {
      this.applyDisplayedCrop(action.cropFrom ?? null);
    } else if (action.type === "move" /* Move */ && action.moveTarget && action.moveBefore) {
      applyMoveSnapshot(action.moveTarget, action.moveBefore);
      this.redraw();
    } else {
      this.redraw();
    }
  }
  redo() {
    if (this.textPlacementState) {
      return;
    }
    if (this.textEditState) {
      return;
    }
    const action = this.undoneActions.pop();
    if (!action) {
      return;
    }
    if (action.type === "eraser" /* Eraser */ && action.erasedActions) {
      for (const erased of action.erasedActions) {
        const idx = this.actions.indexOf(erased);
        if (idx >= 0) {
          this.actions.splice(idx, 1);
        }
      }
    }
    this.actions.push(action);
    this.selectedActionIndex = -1;
    this.updateUndoRedoState();
    if (action.type === "crop" /* Crop */) {
      this.applyDisplayedCrop(action.cropTo ?? null);
    } else if (action.type === "move" /* Move */ && action.moveTarget && action.moveAfter) {
      applyMoveSnapshot(action.moveTarget, action.moveAfter);
      this.redraw();
    } else {
      this.redraw();
    }
  }
  cropHandleHitTest(pos) {
    if (!this.cropRegion) {
      return null;
    }
    const r = this.normalizeCropRect(this.cropRegion);
    const handlePx = 12;
    const tol = handlePx / this.scale;
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const handles = [
      { name: "nw", x: r.x, y: r.y },
      { name: "n", x: cx, y: r.y },
      { name: "ne", x: r.x + r.width, y: r.y },
      { name: "e", x: r.x + r.width, y: cy },
      { name: "se", x: r.x + r.width, y: r.y + r.height },
      { name: "s", x: cx, y: r.y + r.height },
      { name: "sw", x: r.x, y: r.y + r.height },
      { name: "w", x: r.x, y: cy }
    ];
    for (const h of handles) {
      if (Math.abs(pos.x - h.x) <= tol && Math.abs(pos.y - h.y) <= tol) {
        return h.name;
      }
    }
    if (pos.x >= r.x && pos.x <= r.x + r.width && pos.y >= r.y && pos.y <= r.y + r.height) {
      return "move";
    }
    return null;
  }
  cropCursorFor(handle) {
    switch (handle) {
      case "nw":
      case "se":
        return "nwse-resize";
      case "ne":
      case "sw":
        return "nesw-resize";
      case "n":
      case "s":
        return "ns-resize";
      case "e":
      case "w":
        return "ew-resize";
      case "move":
        return "move";
      default:
        return "default";
    }
  }
  updateCropRegion(pos) {
    if (!this.cropRegionStart || !this.cropDragHandle) {
      return;
    }
    const dx = pos.x - this.cropDragStart.x;
    const dy = pos.y - this.cropDragStart.y;
    const start = this.cropRegionStart;
    if (this.cropDragHandle === "move") {
      const x2 = Math.max(0, Math.min(this.imageWidth - start.width, start.x + dx));
      const y2 = Math.max(0, Math.min(this.imageHeight - start.height, start.y + dy));
      this.cropRegion = { x: x2, y: y2, width: start.width, height: start.height };
      return;
    }
    let { x, y, width, height } = start;
    switch (this.cropDragHandle) {
      case "nw":
        x += dx;
        y += dy;
        width -= dx;
        height -= dy;
        break;
      case "n":
        y += dy;
        height -= dy;
        break;
      case "ne":
        y += dy;
        width += dx;
        height -= dy;
        break;
      case "e":
        width += dx;
        break;
      case "se":
        width += dx;
        height += dy;
        break;
      case "s":
        height += dy;
        break;
      case "sw":
        x += dx;
        width -= dx;
        height += dy;
        break;
      case "w":
        x += dx;
        width -= dx;
        break;
    }
    x = Math.max(0, Math.min(this.imageWidth, x));
    y = Math.max(0, Math.min(this.imageHeight, y));
    width = Math.max(10, Math.min(this.imageWidth - x, width));
    height = Math.max(10, Math.min(this.imageHeight - y, height));
    this.cropRegion = { x, y, width, height };
  }
  normalizeCropRect(r) {
    return {
      x: r.width < 0 ? r.x + r.width : r.x,
      y: r.height < 0 ? r.y + r.height : r.y,
      width: Math.abs(r.width),
      height: Math.abs(r.height)
    };
  }
  startTextEdit(pos, width, showBoxOutline) {
    this.commitTextEdit();
    const editor = mainWindow.document.createElement("textarea");
    editor.setAttribute("aria-label", localize("typeText", "Type text"));
    editor.setAttribute("wrap", "off");
    editor.style.position = "fixed";
    editor.style.left = "-10000px";
    editor.style.top = "0";
    editor.style.width = "1px";
    editor.style.height = "1px";
    editor.style.opacity = "0";
    editor.style.pointerEvents = "none";
    editor.style.padding = "0";
    editor.style.border = "0";
    editor.style.margin = "0";
    editor.style.resize = "none";
    editor.style.overflow = "hidden";
    this.container.appendChild(editor);
    this.textEditState = {
      pos,
      text: "",
      caretIndex: 0,
      strokeColor: this.activeStrokeColor,
      fillColor: this.activeFillColor,
      opacity: this.activeOpacity,
      fontSize: this.activeFontSize,
      fontFamily: this.activeFontFamily,
      width,
      showBoxOutline
    };
    this.textEditor = editor;
    this.startTextCaretBlink();
    const sync = () => {
      if (!this.textEditState || this.textEditor !== editor) {
        return;
      }
      this.textEditState.text = editor.value;
      this.textEditState.caretIndex = editor.selectionStart ?? editor.value.length;
      this.textCaretVisible = true;
      this.redraw();
    };
    editor.addEventListener("input", sync);
    editor.addEventListener("keyup", sync);
    editor.addEventListener("click", sync);
    editor.addEventListener("select", sync);
    editor.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.commitTextEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cancelTextEdit();
      }
    });
    editor.addEventListener("blur", () => {
      if (this.textEditor === editor) {
        this.commitTextEdit();
      }
    });
    setTimeout(() => {
      if (this.textEditor === editor) {
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
      }
    }, 0);
    this.redraw();
  }
  startTextCaretBlink() {
    if (this.textCaretInterval !== null) {
      getWindow(this.container).clearInterval(this.textCaretInterval);
    }
    this.textCaretVisible = true;
    this.textCaretInterval = getWindow(this.container).setInterval(() => {
      if (!this.textEditState) {
        return;
      }
      this.textCaretVisible = !this.textCaretVisible;
      this.redraw();
    }, 500);
  }
  stopTextCaretBlink() {
    if (this.textCaretInterval !== null) {
      getWindow(this.container).clearInterval(this.textCaretInterval);
      this.textCaretInterval = null;
    }
    this.textCaretVisible = true;
  }
  commitTextEdit() {
    if (!this.textEditState) {
      return;
    }
    const { text, pos, strokeColor, fillColor, opacity, fontFamily, fontSize, width } = this.textEditState;
    this.cleanupTextEditor();
    if (text.trim()) {
      this.actions.push({
        type: "text" /* Text */,
        strokeColor,
        fillColor,
        opacity,
        lineWidth: 1,
        fontSize,
        fontFamily,
        text,
        textPos: pos,
        textWidth: width
      });
      this.undoneActions.length = 0;
      this.updateUndoRedoState();
    }
    this.redraw();
  }
  cancelTextEdit() {
    if (!this.textEditState) {
      return;
    }
    this.cleanupTextEditor();
    this.redraw();
  }
  cancelTextPlacement() {
    if (!this.textPlacementState) {
      return;
    }
    if (this.canvas.hasPointerCapture(this.textPlacementState.pointerId)) {
      this.canvas.releasePointerCapture(this.textPlacementState.pointerId);
    }
    this.textPlacementState = null;
    this.redraw();
  }
  getTextImageRight() {
    return this.cropOffsetX + this.imageWidth;
  }
  getMaxTextWidthFrom(startX) {
    return Math.max(1, this.getTextImageRight() - startX);
  }
  cleanupTextEditor() {
    this.stopTextCaretBlink();
    this.textEditor?.remove();
    this.textEditor = null;
    this.textEditState = null;
    this.container.focus();
  }
  redraw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.imageElement) {
      this.ctx.drawImage(this.imageElement, 0, 0, this.imageWidth * this.scale, this.imageHeight * this.scale);
    }
    this.ctx.save();
    this.ctx.translate(-this.cropOffsetX * this.scale, -this.cropOffsetY * this.scale);
    for (const action of this.actions) {
      this.drawAction(action);
    }
    if (this.selectedActionIndex >= 0 && this.selectedActionIndex < this.actions.length) {
      this.drawSelectionHighlight(this.actions[this.selectedActionIndex]);
    }
    if (this.currentAction) {
      this.drawAction(this.currentAction);
    }
    if (this.textEditState) {
      this.drawTextEditState();
    }
    if (this.textPlacementState) {
      this.drawTextPlacementState();
    }
    this.ctx.restore();
    if (this.cropMode && this.cropRegion) {
      const r = this.normalizeCropRect(this.cropRegion);
      const dpr = getWindow(this.canvas).devicePixelRatio || 1;
      const cw = this.canvas.width / dpr;
      const ch = this.canvas.height / dpr;
      const rx = r.x * this.scale;
      const ry = r.y * this.scale;
      const rw = r.width * this.scale;
      const rh = r.height * this.scale;
      this.ctx.save();
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      this.ctx.fillRect(0, 0, cw, ry);
      this.ctx.fillRect(0, ry + rh, cw, ch - (ry + rh));
      this.ctx.fillRect(0, ry, rx, rh);
      this.ctx.fillRect(rx + rw, ry, cw - (rx + rw), rh);
      this.ctx.strokeStyle = "#ffffff";
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(rx, ry, rw, rh);
      const handleSize = 10;
      const half = handleSize / 2;
      const handles = [
        { x: rx, y: ry },
        // nw
        { x: rx + rw / 2, y: ry },
        // n
        { x: rx + rw, y: ry },
        // ne
        { x: rx + rw, y: ry + rh / 2 },
        // e
        { x: rx + rw, y: ry + rh },
        // se
        { x: rx + rw / 2, y: ry + rh },
        // s
        { x: rx, y: ry + rh },
        // sw
        { x: rx, y: ry + rh / 2 }
        // w
      ];
      this.ctx.fillStyle = "#ffffff";
      this.ctx.strokeStyle = "#000000";
      this.ctx.lineWidth = 1;
      for (const h of handles) {
        this.ctx.fillRect(h.x - half, h.y - half, handleSize, handleSize);
        this.ctx.strokeRect(h.x - half, h.y - half, handleSize, handleSize);
      }
      this.ctx.restore();
    }
  }
  drawAction(action) {
    if (action.type === "eraser" /* Eraser */ || action.type === "crop" /* Crop */ || action.type === "move" /* Move */) {
      return;
    }
    this.ctx.save();
    const fillColor = action.fillColor ?? "transparent";
    this.ctx.globalAlpha = action.opacity;
    this.ctx.strokeStyle = action.strokeColor;
    this.ctx.fillStyle = this.isTransparent(fillColor) ? action.strokeColor : fillColor;
    this.ctx.lineWidth = action.lineWidth * this.scale;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    switch (action.type) {
      case "freehand" /* Freehand */:
        if (action.points && action.points.length > 0) {
          this.ctx.beginPath();
          this.ctx.moveTo(action.points[0].x * this.scale, action.points[0].y * this.scale);
          for (let i = 1; i < action.points.length; i++) {
            this.ctx.lineTo(action.points[i].x * this.scale, action.points[i].y * this.scale);
          }
          this.ctx.stroke();
        }
        break;
      case "rectangle" /* Rectangle */:
        if (action.rect) {
          if (!this.isTransparent(fillColor)) {
            this.ctx.fillRect(
              action.rect.x * this.scale,
              action.rect.y * this.scale,
              action.rect.width * this.scale,
              action.rect.height * this.scale
            );
          }
          this.ctx.strokeRect(
            action.rect.x * this.scale,
            action.rect.y * this.scale,
            action.rect.width * this.scale,
            action.rect.height * this.scale
          );
        }
        break;
      case "ellipse" /* Ellipse */:
        if (action.ellipseRect) {
          const r = action.ellipseRect;
          const cx = (r.x + r.width / 2) * this.scale;
          const cy = (r.y + r.height / 2) * this.scale;
          const rx = Math.abs(r.width / 2) * this.scale;
          const ry = Math.abs(r.height / 2) * this.scale;
          this.ctx.beginPath();
          this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          if (!this.isTransparent(fillColor)) {
            this.ctx.fill();
          }
          this.ctx.stroke();
        }
        break;
      case "arrow" /* Arrow */:
        if (action.arrowStart && action.arrowEnd) {
          this.drawArrow(
            action.arrowStart.x * this.scale,
            action.arrowStart.y * this.scale,
            action.arrowEnd.x * this.scale,
            action.arrowEnd.y * this.scale
          );
        }
        break;
      case "text" /* Text */:
        if (action.text && action.textPos) {
          const fontSize = (action.fontSize || 16) * this.scale;
          const fontFamily = action.fontFamily || "sans-serif";
          const width = (action.textWidth ?? DEFAULT_TEXT_BOX_WIDTH) * this.scale;
          this.ctx.font = `${fontSize}px ${fontFamily}`;
          this.ctx.textBaseline = "alphabetic";
          if (!this.isTransparent(fillColor)) {
            const layout = this.measureWrappedText(action.text, width, fontSize, fontFamily);
            this.ctx.fillRect(
              action.textPos.x * this.scale,
              action.textPos.y * this.scale - fontSize,
              width,
              Math.max(layout.height, fontSize * 1.2)
            );
          }
          this.ctx.fillStyle = action.strokeColor;
          this.drawWrappedText(action.text, action.textPos.x * this.scale, action.textPos.y * this.scale, width, fontSize, fontFamily);
        }
        break;
    }
    this.ctx.restore();
  }
  drawTextEditState() {
    if (!this.textEditState) {
      return;
    }
    const { pos, text, strokeColor, fillColor, opacity, fontFamily, fontSize, caretIndex, width, showBoxOutline } = this.textEditState;
    const scaledFontSize = fontSize * this.scale;
    const scaledWidth = width * this.scale;
    this.ctx.save();
    this.ctx.globalAlpha = opacity;
    this.ctx.fillStyle = strokeColor;
    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = Math.max(1, this.scale);
    this.ctx.font = `${scaledFontSize}px ${fontFamily}`;
    this.ctx.textBaseline = "alphabetic";
    if (!this.isTransparent(fillColor)) {
      const layout2 = this.measureWrappedText(text, scaledWidth, scaledFontSize, fontFamily);
      this.ctx.fillStyle = fillColor;
      this.ctx.fillRect(
        pos.x * this.scale,
        pos.y * this.scale - scaledFontSize,
        scaledWidth,
        Math.max(layout2.height, scaledFontSize * 1.2)
      );
      this.ctx.fillStyle = strokeColor;
    }
    const layout = this.drawWrappedText(text, pos.x * this.scale, pos.y * this.scale, scaledWidth, scaledFontSize, fontFamily);
    if (showBoxOutline) {
      this.ctx.setLineDash([4, 4]);
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      this.ctx.strokeRect(
        pos.x * this.scale,
        pos.y * this.scale - scaledFontSize,
        scaledWidth,
        Math.max(layout.height, scaledFontSize * 1.2)
      );
      this.ctx.setLineDash([]);
    }
    if (this.textCaretVisible) {
      const caret = this.getTextCaretMetrics(text, caretIndex, scaledWidth, scaledFontSize, fontFamily);
      const caretX = pos.x * this.scale + caret.x;
      const baselineY = pos.y * this.scale + caret.baselineOffsetY;
      this.ctx.beginPath();
      this.ctx.moveTo(caretX, baselineY - scaledFontSize);
      this.ctx.lineTo(caretX, baselineY + Math.max(2, this.scale));
      this.ctx.stroke();
    }
    this.ctx.restore();
  }
  isTransparent(color) {
    return color === "transparent";
  }
  drawTextPlacementState() {
    if (!this.textPlacementState) {
      return;
    }
    const { start, current } = this.textPlacementState;
    const dx = current.x - start.x;
    const didDrag = Math.abs(dx) >= TEXT_DRAG_THRESHOLD;
    if (!didDrag) {
      return;
    }
    const x = Math.min(start.x, current.x);
    const width = Math.max(1, Math.min(Math.abs(dx), this.getTextImageRight() - x));
    const y = (start.y - this.activeFontSize) * this.scale;
    const height = this.activeFontSize * this.scale * 1.2;
    this.ctx.save();
    this.ctx.setLineDash([4, 4]);
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    this.ctx.lineWidth = Math.max(1, this.scale);
    this.ctx.strokeRect(x * this.scale, y, width * this.scale, height);
    this.ctx.setLineDash([]);
    this.ctx.restore();
  }
  drawWrappedText(text, x, baselineY, maxWidth, fontSize, fontFamily) {
    const layout = this.measureWrappedText(text, maxWidth, fontSize, fontFamily);
    const lineHeight = layout.lineHeight;
    for (let i = 0; i < layout.lines.length; i++) {
      const line = layout.lines[i];
      this.ctx.fillText(line.text, x, baselineY + i * lineHeight);
    }
    return {
      width: layout.width,
      height: layout.height,
      lineHeight
    };
  }
  getTextCaretMetrics(text, caretIndex, maxWidth, fontSize, fontFamily) {
    const layout = this.measureWrappedText(text, maxWidth, fontSize, fontFamily);
    const line = [...layout.lines].reverse().find((candidate) => candidate.startIndex <= caretIndex) ?? layout.lines[0];
    const safeCaretIndex = Math.min(Math.max(caretIndex, line.startIndex), line.endIndex);
    const beforeCaret = line.text.slice(0, safeCaretIndex - line.startIndex);
    this.ctx.save();
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    const x = this.ctx.measureText(beforeCaret).width;
    this.ctx.restore();
    return {
      x,
      baselineOffsetY: line.lineIndex * layout.lineHeight
    };
  }
  measureWrappedText(text, maxWidth, fontSize, fontFamily) {
    this.ctx.save();
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    const lineHeight = fontSize * 1.2;
    const lines = [];
    const paragraphs = text.split("\n");
    let globalIndex = 0;
    let lineIndex = 0;
    let maxLineWidth = 0;
    for (let p = 0; p < paragraphs.length; p++) {
      const paragraph = paragraphs[p];
      const paragraphStart = globalIndex;
      const paragraphEnd = paragraphStart + paragraph.length;
      if (paragraph.length === 0) {
        lines.push({ text: "", startIndex: paragraphStart, endIndex: paragraphStart, lineIndex });
        lineIndex++;
      } else {
        let lineStart = paragraphStart;
        while (lineStart < paragraphEnd) {
          let bestEnd = lineStart + 1;
          let lastWhitespaceBreak = -1;
          for (let i = lineStart + 1; i <= paragraphEnd; i++) {
            const candidate = text.slice(lineStart, i);
            if (this.ctx.measureText(candidate).width <= maxWidth) {
              bestEnd = i;
              if (/\s/.test(text[i - 1])) {
                lastWhitespaceBreak = i;
              }
            } else {
              break;
            }
          }
          let lineEnd = bestEnd;
          if (bestEnd < paragraphEnd && lastWhitespaceBreak > lineStart) {
            lineEnd = lastWhitespaceBreak;
          }
          if (lineEnd <= lineStart) {
            lineEnd = lineStart + 1;
          }
          const rawLineText = text.slice(lineStart, lineEnd);
          const lineText = rawLineText.replace(/\s+$/u, "");
          lines.push({ text: lineText, startIndex: lineStart, endIndex: lineEnd, lineIndex });
          maxLineWidth = Math.max(maxLineWidth, this.ctx.measureText(lineText).width);
          lineIndex++;
          lineStart = lineEnd;
          while (lineStart < paragraphEnd && /\s/u.test(text[lineStart])) {
            lineStart++;
          }
        }
      }
      globalIndex = paragraphEnd + 1;
    }
    if (lines.length === 0) {
      lines.push({ text: "", startIndex: 0, endIndex: 0, lineIndex: 0 });
    }
    if (maxLineWidth === 0) {
      for (const line of lines) {
        maxLineWidth = Math.max(maxLineWidth, this.ctx.measureText(line.text).width);
      }
    }
    this.ctx.restore();
    return {
      lines,
      width: Math.max(maxLineWidth, maxWidth),
      height: lines.length * lineHeight,
      lineHeight
    };
  }
  hitTest(pos) {
    for (let i = this.actions.length - 1; i >= 0; i--) {
      if (this.isPointOnAction(pos, this.actions[i])) {
        return i;
      }
    }
    return -1;
  }
  isPointOnAction(pos, action) {
    const threshold = 8;
    switch (action.type) {
      case "freehand" /* Freehand */:
        if (action.points) {
          for (let i = 1; i < action.points.length; i++) {
            if (this.pointToSegmentDist(pos, action.points[i - 1], action.points[i]) < threshold) {
              return true;
            }
          }
        }
        return false;
      case "rectangle" /* Rectangle */:
        if (action.rect) {
          const r = action.rect;
          const nx = Math.min(r.x, r.x + r.width);
          const ny = Math.min(r.y, r.y + r.height);
          const nw = Math.abs(r.width);
          const nh = Math.abs(r.height);
          return pos.x >= nx - threshold && pos.x <= nx + nw + threshold && pos.y >= ny - threshold && pos.y <= ny + nh + threshold;
        }
        return false;
      case "ellipse" /* Ellipse */:
        if (action.ellipseRect) {
          const er = action.ellipseRect;
          const cx = er.x + er.width / 2;
          const cy = er.y + er.height / 2;
          const rx = Math.abs(er.width / 2);
          const ry = Math.abs(er.height / 2);
          if (rx < 1 || ry < 1) {
            return false;
          }
          const dx = (pos.x - cx) / rx;
          const dy = (pos.y - cy) / ry;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (!this.isTransparent(action.fillColor ?? "transparent")) {
            return dist <= 1 + threshold / Math.min(rx, ry);
          }
          const normalizedThreshold = threshold / Math.min(rx, ry);
          return Math.abs(dist - 1) < normalizedThreshold;
        }
        return false;
      case "arrow" /* Arrow */:
        if (action.arrowStart && action.arrowEnd) {
          return this.pointToSegmentDist(pos, action.arrowStart, action.arrowEnd) < threshold;
        }
        return false;
      case "text" /* Text */:
        if (action.text && action.textPos) {
          const bounds = this.getActionBounds(action);
          if (!bounds) {
            return false;
          }
          return pos.x >= action.textPos.x - threshold && pos.x <= bounds.x + bounds.width + threshold && pos.y >= bounds.y - threshold && pos.y <= bounds.y + bounds.height + threshold;
        }
        return false;
    }
    return false;
  }
  pointToSegmentDist(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) {
      return Math.hypot(p.x - a.x, p.y - a.y);
    }
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return Math.hypot(p.x - projX, p.y - projY);
  }
  moveAction(action, dx, dy) {
    switch (action.type) {
      case "freehand" /* Freehand */:
        if (action.points) {
          for (const pt of action.points) {
            pt.x += dx;
            pt.y += dy;
          }
        }
        break;
      case "rectangle" /* Rectangle */:
        if (action.rect) {
          action.rect.x += dx;
          action.rect.y += dy;
        }
        break;
      case "ellipse" /* Ellipse */:
        if (action.ellipseRect) {
          action.ellipseRect.x += dx;
          action.ellipseRect.y += dy;
        }
        break;
      case "arrow" /* Arrow */:
        if (action.arrowStart) {
          action.arrowStart.x += dx;
          action.arrowStart.y += dy;
        }
        if (action.arrowEnd) {
          action.arrowEnd.x += dx;
          action.arrowEnd.y += dy;
        }
        break;
      case "text" /* Text */:
        if (action.textPos) {
          action.textPos.x += dx;
          action.textPos.y += dy;
        }
        break;
    }
  }
  drawSelectionHighlight(action) {
    this.ctx.save();
    this.ctx.strokeStyle = "#007acc";
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);
    const pad = 6;
    const bounds = this.getActionBounds(action);
    if (bounds) {
      this.ctx.strokeRect(
        (bounds.x - pad) * this.scale,
        (bounds.y - pad) * this.scale,
        (bounds.width + pad * 2) * this.scale,
        (bounds.height + pad * 2) * this.scale
      );
      if (action.type === "text" /* Text */) {
        const handleSize = 8;
        const handleX = (bounds.x + bounds.width + pad) * this.scale;
        const handleY = (bounds.y + bounds.height / 2) * this.scale;
        this.ctx.fillStyle = "#007acc";
        this.ctx.fillRect(handleX - handleSize / 2, handleY - handleSize / 2, handleSize, handleSize);
      }
    }
    this.ctx.setLineDash([]);
    this.ctx.restore();
  }
  isNearTextResizeHandle(pos, action) {
    if (action.type !== "text" /* Text */) {
      return false;
    }
    const bounds = this.getActionBounds(action);
    if (!bounds) {
      return false;
    }
    const threshold = 8;
    const handleX = bounds.x + bounds.width;
    const handleY = bounds.y + bounds.height / 2;
    return Math.abs(pos.x - handleX) <= threshold && Math.abs(pos.y - handleY) <= threshold * 2;
  }
  getActionBounds(action) {
    switch (action.type) {
      case "freehand" /* Freehand */:
        if (action.points && action.points.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const pt of action.points) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
          }
          return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
        return null;
      case "rectangle" /* Rectangle */:
        if (action.rect) {
          const r = action.rect;
          return {
            x: Math.min(r.x, r.x + r.width),
            y: Math.min(r.y, r.y + r.height),
            width: Math.abs(r.width),
            height: Math.abs(r.height)
          };
        }
        return null;
      case "ellipse" /* Ellipse */:
        if (action.ellipseRect) {
          const er = action.ellipseRect;
          return {
            x: Math.min(er.x, er.x + er.width),
            y: Math.min(er.y, er.y + er.height),
            width: Math.abs(er.width),
            height: Math.abs(er.height)
          };
        }
        return null;
      case "arrow" /* Arrow */:
        if (action.arrowStart && action.arrowEnd) {
          const minX = Math.min(action.arrowStart.x, action.arrowEnd.x);
          const minY = Math.min(action.arrowStart.y, action.arrowEnd.y);
          const maxX = Math.max(action.arrowStart.x, action.arrowEnd.x);
          const maxY = Math.max(action.arrowStart.y, action.arrowEnd.y);
          return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
        return null;
      case "text" /* Text */:
        if (action.text && action.textPos) {
          const fontSize = action.fontSize || 16;
          const fontFamily = action.fontFamily || "sans-serif";
          const textWidth = action.textWidth ?? DEFAULT_TEXT_BOX_WIDTH;
          const layout = this.measureWrappedText(action.text, textWidth, fontSize, fontFamily);
          return {
            x: action.textPos.x,
            y: action.textPos.y - fontSize,
            width: textWidth,
            height: layout.height
          };
        }
        return null;
    }
    return null;
  }
  drawArrow(fromX, fromY, toX, toY) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      return;
    }
    const unitX = dx / length;
    const unitY = dy / length;
    const normalX = -unitY;
    const normalY = unitX;
    const lineWidth = this.ctx.lineWidth;
    const headLength = Math.min(Math.max(12 * this.scale, lineWidth * 3), length);
    const headWidth = Math.max(10 * this.scale, lineWidth * 2.5);
    const baseX = toX - unitX * headLength;
    const baseY = toY - unitY * headLength;
    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(baseX, baseY);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(toX, toY);
    this.ctx.lineTo(baseX + normalX * headWidth / 2, baseY + normalY * headWidth / 2);
    this.ctx.lineTo(baseX - normalX * headWidth / 2, baseY - normalY * headWidth / 2);
    this.ctx.closePath();
    this.ctx.fillStyle = this.ctx.strokeStyle;
    this.ctx.fill();
  }
  flushPendingZoom() {
    const pending = this.pendingZoom;
    this.pendingZoom = null;
    if (!pending) {
      return;
    }
    const minScale = this.getFitScale();
    const maxScale = 8;
    const desiredScale = this.scale * pending.factor;
    const newScale = Math.max(minScale, Math.min(maxScale, desiredScale));
    if (newScale === this.scale) {
      return;
    }
    const halfImgW = this.imageWidth * this.scale / 2;
    const halfImgH = this.imageHeight * this.scale / 2;
    const anchorCx = this.panX + Math.max(-halfImgW, Math.min(halfImgW, pending.cx - this.panX));
    const anchorCy = this.panY + Math.max(-halfImgH, Math.min(halfImgH, pending.cy - this.panY));
    const r = newScale / this.scale;
    this.panX = anchorCx * (1 - r) + this.panX * r;
    this.panY = anchorCy * (1 - r) + this.panY * r;
    this.scale = newScale;
    this.hasUserZoomed = true;
    if (newScale === minScale) {
      this.panX = 0;
      this.panY = 0;
    }
    this.sizeCanvas();
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
    this.redraw();
  }
  getFitScale() {
    const container = this.canvas.parentElement;
    if (!container || !this.imageWidth || !this.imageHeight) {
      return 1;
    }
    const maxWidth = Math.max(1, container.clientWidth - CANVAS_BREATHING_ROOM * 2);
    const maxHeight = Math.max(1, container.clientHeight - CANVAS_BREATHING_ROOM * 2);
    return Math.min(maxWidth / this.imageWidth, maxHeight / this.imageHeight, 1);
  }
  clampPan() {
    const container = this.canvas.parentElement;
    if (!container) {
      return;
    }
    const imgW = this.imageWidth * this.scale;
    const imgH = this.imageHeight * this.scale;
    const cW = container.clientWidth;
    const cH = container.clientHeight;
    const maxPanX = Math.abs(cW - imgW) / 2;
    const maxPanY = Math.abs(cH - imgH) / 2;
    this.panX = Math.max(-maxPanX, Math.min(maxPanX, this.panX));
    this.panY = Math.max(-maxPanY, Math.min(maxPanY, this.panY));
  }
  compositeToDataUrl() {
    const finalCanvas = mainWindow.document.createElement("canvas");
    finalCanvas.width = this.imageWidth;
    finalCanvas.height = this.imageHeight;
    const ctx = finalCanvas.getContext("2d");
    if (this.imageElement) {
      ctx.drawImage(this.imageElement, 0, 0, this.imageWidth, this.imageHeight);
    }
    const savedScale = this.scale;
    this.scale = 1;
    const savedCtx = this.ctx;
    this.ctx = ctx;
    const offX = this.currentCrop?.x ?? 0;
    const offY = this.currentCrop?.y ?? 0;
    ctx.save();
    ctx.translate(-offX, -offY);
    for (const action of this.actions) {
      this.drawAction(action);
    }
    ctx.restore();
    this.ctx = savedCtx;
    this.scale = savedScale;
    return finalCanvas.toDataURL("image/png");
  }
  dispose() {
    if (this.pendingZoomRaf) {
      getWindow(this.canvas).cancelAnimationFrame(this.pendingZoomRaf);
      this.pendingZoomRaf = 0;
      this.pendingZoom = null;
    }
    this.cancelTextPlacement();
    this.cleanupTextEditor();
    this.container.remove();
    this.toolOptionsDisposables.dispose();
    this.disposables.dispose();
    this._onDidSave.dispose();
    this._onDidCancel.dispose();
  }
}
export {
  ScreenshotAnnotationEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lzc3VlL2Jyb3dzZXIvc2NyZWVuc2hvdEFubm90YXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFwcGVuZCwgRXZlbnRUeXBlLCBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSVNjcmVlbnNob3QgfSBmcm9tICcuL2lzc3VlUmVwb3J0ZXJPdmVybGF5LmpzJztcblxuY29uc3QgZW51bSBBbm5vdGF0aW9uVG9vbCB7XG5cdFNlbGVjdCA9ICdzZWxlY3QnLFxuXHRGcmVlaGFuZCA9ICdmcmVlaGFuZCcsXG5cdFJlY3RhbmdsZSA9ICdyZWN0YW5nbGUnLFxuXHRFbGxpcHNlID0gJ2VsbGlwc2UnLFxuXHRBcnJvdyA9ICdhcnJvdycsXG5cdFRleHQgPSAndGV4dCcsXG5cdEVyYXNlciA9ICdlcmFzZXInLFxuXHRQYW4gPSAncGFuJyxcblx0Q3JvcCA9ICdjcm9wJyxcblx0TW92ZSA9ICdtb3ZlJyxcbn1cblxuY29uc3QgQ09MT1JTID0gW1xuXHQnI2ZmM2IzMCcsIC8vIHJlZFxuXHQnIzAwN2FmZicsIC8vIGJsdWVcblx0JyMzNGM3NTknLCAvLyBncmVlblxuXHQnI2ZmY2MwMCcsIC8vIHllbGxvd1xuXHQnIzAwMDAwMCcsIC8vIGJsYWNrXG5cdCcjZmZmZmZmJywgLy8gd2hpdGVcbl07XG5cbmNvbnN0IExJR0hUX1NXQVRDSF9DT0xPUlMgPSBuZXcgU2V0KFsnIzM0Yzc1OScsICcjZmZjYzAwJywgJyNmZmZmZmYnLCAndHJhbnNwYXJlbnQnXSk7XG5cbmNvbnN0IEZPTlRfRkFNSUxJRVMgPSBbXG5cdHsgbGFiZWw6ICdTYW5zLXNlcmlmJywgdmFsdWU6ICctYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsIFwiU2Vnb2UgVUlcIiwgc2Fucy1zZXJpZicgfSxcblx0eyBsYWJlbDogJ01vbm9zcGFjZScsIHZhbHVlOiAnXCJDYXNjYWRpYSBDb2RlXCIsIFwiRmlyYSBDb2RlXCIsIENvbnNvbGFzLCBtb25vc3BhY2UnIH0sXG5cdHsgbGFiZWw6ICdTZXJpZicsIHZhbHVlOiAnR2VvcmdpYSwgXCJUaW1lcyBOZXcgUm9tYW5cIiwgc2VyaWYnIH0sXG5dO1xuXG5jb25zdCBERUZBVUxUX1RFWFRfQk9YX1dJRFRIID0gMjQwO1xuY29uc3QgTUlOX1RFWFRfQk9YX1dJRFRIID0gNDg7XG5jb25zdCBURVhUX0RSQUdfVEhSRVNIT0xEID0gNDtcbi8qKiBQYWRkaW5nIG9uIGVhY2ggc2lkZSBvZiB0aGUgZGlzcGxheWVkIGltYWdlIGluc2lkZSB0aGUgY2FudmFzIGNvbnRhaW5lciBhdCBmaXQtdG8td2luZG93IHNjYWxlLiAqL1xuY29uc3QgQ0FOVkFTX0JSRUFUSElOR19ST09NID0gNjQ7XG5jb25zdCBGSUxMX0NPTE9SUyA9IFsndHJhbnNwYXJlbnQnLCAuLi5DT0xPUlNdO1xuY29uc3QgU1RST0tFX1dJRFRIUyA9IFsyLCA0LCA4LCAxMl07XG5jb25zdCBURVhUX1NJWkVTID0gWzE0LCAxOCwgMjQsIDMyLCA0OF07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFubm90YXRpb25EcmF3QWN0aW9uIHtcblx0cmVhZG9ubHkgdHlwZTogQW5ub3RhdGlvblRvb2w7XG5cdHN0cm9rZUNvbG9yOiBzdHJpbmc7XG5cdGZpbGxDb2xvcj86IHN0cmluZztcblx0b3BhY2l0eTogbnVtYmVyO1xuXHRsaW5lV2lkdGg6IG51bWJlcjtcblx0Zm9udFNpemU/OiBudW1iZXI7XG5cdGZvbnRGYW1pbHk/OiBzdHJpbmc7XG5cdHBvaW50cz86IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVtdO1xuXHRyZWN0PzogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfTtcblx0ZWxsaXBzZVJlY3Q/OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9O1xuXHRhcnJvd1N0YXJ0PzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuXHRhcnJvd0VuZD86IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcblx0dGV4dD86IHN0cmluZztcblx0dGV4dFBvcz86IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcblx0dGV4dFdpZHRoPzogbnVtYmVyO1xuXHQvKiogT25seSBzZXQgZm9yIHR5cGUgPT09IEFubm90YXRpb25Ub29sLkVyYXNlcjogdGhlIGJhdGNoIG9mIGFjdGlvbnMgcmVtb3ZlZCBpbiBvbmUgc3Ryb2tlLiAqL1xuXHRlcmFzZWRBY3Rpb25zPzogSUFubm90YXRpb25EcmF3QWN0aW9uW107XG5cdC8qKiBPbmx5IHNldCBmb3IgdHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuRXJhc2VyOiB0aGUgb3JpZ2luYWwgaW5kZXggKGluIGBhY3Rpb25zW11gKSBvZiBlYWNoIGVyYXNlZCBhY3Rpb24gYXQgdGhlIG1vbWVudCBpdCB3YXMgcmVtb3ZlZC4gKi9cblx0ZXJhc2VkSW5kaWNlcz86IG51bWJlcltdO1xuXHQvKiogT25seSBzZXQgZm9yIHR5cGUgPT09IEFubm90YXRpb25Ub29sLkNyb3A6IHRoZSBjcm9wIGFjdGl2ZSBiZWZvcmUgdGhpcyBhY3Rpb24uIG51bGwgbWVhbnMgbm8gY3JvcCAoZnVsbCBvcmlnaW5hbCBpbWFnZSkuICovXG5cdGNyb3BGcm9tPzogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IG51bGw7XG5cdC8qKiBPbmx5IHNldCBmb3IgdHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuQ3JvcDogdGhlIGNyb3AgYWN0aXZlIGFmdGVyIHRoaXMgYWN0aW9uLiBudWxsIG1lYW5zIG5vIGNyb3AgKGZ1bGwgb3JpZ2luYWwgaW1hZ2UpLiAqL1xuXHRjcm9wVG8/OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgbnVsbDtcblx0LyoqIE9ubHkgc2V0IGZvciB0eXBlID09PSBBbm5vdGF0aW9uVG9vbC5Nb3ZlOiB0aGUgYWN0aW9uIHRoYXQgd2FzIG1vdmVkIG9yIHJlc2l6ZWQuICovXG5cdG1vdmVUYXJnZXQ/OiBJQW5ub3RhdGlvbkRyYXdBY3Rpb247XG5cdC8qKiBPbmx5IHNldCBmb3IgdHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuTW92ZTogc25hcHNob3Qgb2YgZ2VvbWV0cmljIGZpZWxkcyBiZWZvcmUgdGhlIGNoYW5nZS4gKi9cblx0bW92ZUJlZm9yZT86IElBbm5vdGF0aW9uTW92ZVNuYXBzaG90O1xuXHQvKiogT25seSBzZXQgZm9yIHR5cGUgPT09IEFubm90YXRpb25Ub29sLk1vdmU6IHNuYXBzaG90IG9mIGdlb21ldHJpYyBmaWVsZHMgYWZ0ZXIgdGhlIGNoYW5nZS4gKi9cblx0bW92ZUFmdGVyPzogSUFubm90YXRpb25Nb3ZlU25hcHNob3Q7XG59XG5cbmludGVyZmFjZSBJQW5ub3RhdGlvbk1vdmVTbmFwc2hvdCB7XG5cdHBvaW50cz86IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVtdO1xuXHRyZWN0PzogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfTtcblx0ZWxsaXBzZVJlY3Q/OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9O1xuXHRhcnJvd1N0YXJ0PzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuXHRhcnJvd0VuZD86IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcblx0dGV4dFBvcz86IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcblx0dGV4dFdpZHRoPzogbnVtYmVyO1xufVxuXG50eXBlIERyYXdBY3Rpb24gPSBJQW5ub3RhdGlvbkRyYXdBY3Rpb247XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFubm90YXRpb25FZGl0b3JTdGF0ZSB7XG5cdHJlYWRvbmx5IGFjdGlvbnM6IHJlYWRvbmx5IElBbm5vdGF0aW9uRHJhd0FjdGlvbltdO1xuXHRyZWFkb25seSB1bmRvbmVBY3Rpb25zOiByZWFkb25seSBJQW5ub3RhdGlvbkRyYXdBY3Rpb25bXTtcblx0cmVhZG9ubHkgY3JvcDogeyByZWFkb25seSB4OiBudW1iZXI7IHJlYWRvbmx5IHk6IG51bWJlcjsgcmVhZG9ubHkgd2lkdGg6IG51bWJlcjsgcmVhZG9ubHkgaGVpZ2h0OiBudW1iZXIgfSB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFubm90YXRpb25TYXZlUmVzdWx0IHtcblx0cmVhZG9ubHkgZGF0YVVybDogc3RyaW5nO1xuXHRyZWFkb25seSBzdGF0ZTogSUFubm90YXRpb25FZGl0b3JTdGF0ZTtcbn1cblxuZnVuY3Rpb24gY2xvbmVEcmF3QWN0aW9uKGFjdGlvbjogSUFubm90YXRpb25EcmF3QWN0aW9uLCBpZGVudGl0eU1hcDogTWFwPElBbm5vdGF0aW9uRHJhd0FjdGlvbiwgSUFubm90YXRpb25EcmF3QWN0aW9uPiA9IG5ldyBNYXAoKSk6IElBbm5vdGF0aW9uRHJhd0FjdGlvbiB7XG5cdGNvbnN0IGV4aXN0aW5nID0gaWRlbnRpdHlNYXAuZ2V0KGFjdGlvbik7XG5cdGlmIChleGlzdGluZykge1xuXHRcdHJldHVybiBleGlzdGluZztcblx0fVxuXHRjb25zdCBjbG9uZTogSUFubm90YXRpb25EcmF3QWN0aW9uID0ge1xuXHRcdHR5cGU6IGFjdGlvbi50eXBlLFxuXHRcdHN0cm9rZUNvbG9yOiBhY3Rpb24uc3Ryb2tlQ29sb3IsXG5cdFx0ZmlsbENvbG9yOiBhY3Rpb24uZmlsbENvbG9yLFxuXHRcdG9wYWNpdHk6IGFjdGlvbi5vcGFjaXR5LFxuXHRcdGxpbmVXaWR0aDogYWN0aW9uLmxpbmVXaWR0aCxcblx0XHRmb250U2l6ZTogYWN0aW9uLmZvbnRTaXplLFxuXHRcdGZvbnRGYW1pbHk6IGFjdGlvbi5mb250RmFtaWx5LFxuXHRcdHBvaW50czogYWN0aW9uLnBvaW50cyA/IGFjdGlvbi5wb2ludHMubWFwKHAgPT4gKHsgeDogcC54LCB5OiBwLnkgfSkpIDogdW5kZWZpbmVkLFxuXHRcdHJlY3Q6IGFjdGlvbi5yZWN0ID8geyAuLi5hY3Rpb24ucmVjdCB9IDogdW5kZWZpbmVkLFxuXHRcdGVsbGlwc2VSZWN0OiBhY3Rpb24uZWxsaXBzZVJlY3QgPyB7IC4uLmFjdGlvbi5lbGxpcHNlUmVjdCB9IDogdW5kZWZpbmVkLFxuXHRcdGFycm93U3RhcnQ6IGFjdGlvbi5hcnJvd1N0YXJ0ID8geyAuLi5hY3Rpb24uYXJyb3dTdGFydCB9IDogdW5kZWZpbmVkLFxuXHRcdGFycm93RW5kOiBhY3Rpb24uYXJyb3dFbmQgPyB7IC4uLmFjdGlvbi5hcnJvd0VuZCB9IDogdW5kZWZpbmVkLFxuXHRcdHRleHQ6IGFjdGlvbi50ZXh0LFxuXHRcdHRleHRQb3M6IGFjdGlvbi50ZXh0UG9zID8geyAuLi5hY3Rpb24udGV4dFBvcyB9IDogdW5kZWZpbmVkLFxuXHRcdHRleHRXaWR0aDogYWN0aW9uLnRleHRXaWR0aCxcblx0XHRjcm9wRnJvbTogYWN0aW9uLmNyb3BGcm9tID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBhY3Rpb24uY3JvcEZyb20gPT09IG51bGwgPyBudWxsIDogeyAuLi5hY3Rpb24uY3JvcEZyb20gfSxcblx0XHRjcm9wVG86IGFjdGlvbi5jcm9wVG8gPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IGFjdGlvbi5jcm9wVG8gPT09IG51bGwgPyBudWxsIDogeyAuLi5hY3Rpb24uY3JvcFRvIH0sXG5cdFx0bW92ZUJlZm9yZTogYWN0aW9uLm1vdmVCZWZvcmUgPyBjbG9uZU1vdmVTbmFwc2hvdChhY3Rpb24ubW92ZUJlZm9yZSkgOiB1bmRlZmluZWQsXG5cdFx0bW92ZUFmdGVyOiBhY3Rpb24ubW92ZUFmdGVyID8gY2xvbmVNb3ZlU25hcHNob3QoYWN0aW9uLm1vdmVBZnRlcikgOiB1bmRlZmluZWQsXG5cdH07XG5cdGlkZW50aXR5TWFwLnNldChhY3Rpb24sIGNsb25lKTtcblx0Ly8gUmVzb2x2ZSByZWZlcmVuY2VzIGFmdGVyIHJlZ2lzdGVyaW5nIHNlbGYgc28gY3ljbGljIHN0cnVjdHVyZXMgZG9uJ3QgcmVjdXJzZSBmb3JldmVyLlxuXHRjbG9uZS5lcmFzZWRBY3Rpb25zID0gYWN0aW9uLmVyYXNlZEFjdGlvbnMgPyBhY3Rpb24uZXJhc2VkQWN0aW9ucy5tYXAoYSA9PiBjbG9uZURyYXdBY3Rpb24oYSwgaWRlbnRpdHlNYXApKSA6IHVuZGVmaW5lZDtcblx0Y2xvbmUuZXJhc2VkSW5kaWNlcyA9IGFjdGlvbi5lcmFzZWRJbmRpY2VzID8gYWN0aW9uLmVyYXNlZEluZGljZXMuc2xpY2UoKSA6IHVuZGVmaW5lZDtcblx0Y2xvbmUubW92ZVRhcmdldCA9IGFjdGlvbi5tb3ZlVGFyZ2V0ID8gY2xvbmVEcmF3QWN0aW9uKGFjdGlvbi5tb3ZlVGFyZ2V0LCBpZGVudGl0eU1hcCkgOiB1bmRlZmluZWQ7XG5cdHJldHVybiBjbG9uZTtcbn1cblxuZnVuY3Rpb24gY2xvbmVNb3ZlU25hcHNob3QoczogSUFubm90YXRpb25Nb3ZlU25hcHNob3QpOiBJQW5ub3RhdGlvbk1vdmVTbmFwc2hvdCB7XG5cdHJldHVybiB7XG5cdFx0cG9pbnRzOiBzLnBvaW50cyA/IHMucG9pbnRzLm1hcChwID0+ICh7IHg6IHAueCwgeTogcC55IH0pKSA6IHVuZGVmaW5lZCxcblx0XHRyZWN0OiBzLnJlY3QgPyB7IC4uLnMucmVjdCB9IDogdW5kZWZpbmVkLFxuXHRcdGVsbGlwc2VSZWN0OiBzLmVsbGlwc2VSZWN0ID8geyAuLi5zLmVsbGlwc2VSZWN0IH0gOiB1bmRlZmluZWQsXG5cdFx0YXJyb3dTdGFydDogcy5hcnJvd1N0YXJ0ID8geyAuLi5zLmFycm93U3RhcnQgfSA6IHVuZGVmaW5lZCxcblx0XHRhcnJvd0VuZDogcy5hcnJvd0VuZCA/IHsgLi4ucy5hcnJvd0VuZCB9IDogdW5kZWZpbmVkLFxuXHRcdHRleHRQb3M6IHMudGV4dFBvcyA/IHsgLi4ucy50ZXh0UG9zIH0gOiB1bmRlZmluZWQsXG5cdFx0dGV4dFdpZHRoOiBzLnRleHRXaWR0aCxcblx0fTtcbn1cblxuZnVuY3Rpb24gY2FwdHVyZU1vdmVTbmFwc2hvdChhY3Rpb246IElBbm5vdGF0aW9uRHJhd0FjdGlvbik6IElBbm5vdGF0aW9uTW92ZVNuYXBzaG90IHtcblx0cmV0dXJuIGNsb25lTW92ZVNuYXBzaG90KHtcblx0XHRwb2ludHM6IGFjdGlvbi5wb2ludHMsXG5cdFx0cmVjdDogYWN0aW9uLnJlY3QsXG5cdFx0ZWxsaXBzZVJlY3Q6IGFjdGlvbi5lbGxpcHNlUmVjdCxcblx0XHRhcnJvd1N0YXJ0OiBhY3Rpb24uYXJyb3dTdGFydCxcblx0XHRhcnJvd0VuZDogYWN0aW9uLmFycm93RW5kLFxuXHRcdHRleHRQb3M6IGFjdGlvbi50ZXh0UG9zLFxuXHRcdHRleHRXaWR0aDogYWN0aW9uLnRleHRXaWR0aCxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGFwcGx5TW92ZVNuYXBzaG90KGFjdGlvbjogSUFubm90YXRpb25EcmF3QWN0aW9uLCBzbmFwc2hvdDogSUFubm90YXRpb25Nb3ZlU25hcHNob3QpOiB2b2lkIHtcblx0Y29uc3QgZnJlc2ggPSBjbG9uZU1vdmVTbmFwc2hvdChzbmFwc2hvdCk7XG5cdGFjdGlvbi5wb2ludHMgPSBmcmVzaC5wb2ludHM7XG5cdGFjdGlvbi5yZWN0ID0gZnJlc2gucmVjdDtcblx0YWN0aW9uLmVsbGlwc2VSZWN0ID0gZnJlc2guZWxsaXBzZVJlY3Q7XG5cdGFjdGlvbi5hcnJvd1N0YXJ0ID0gZnJlc2guYXJyb3dTdGFydDtcblx0YWN0aW9uLmFycm93RW5kID0gZnJlc2guYXJyb3dFbmQ7XG5cdGFjdGlvbi50ZXh0UG9zID0gZnJlc2gudGV4dFBvcztcblx0YWN0aW9uLnRleHRXaWR0aCA9IGZyZXNoLnRleHRXaWR0aDtcbn1cblxuZnVuY3Rpb24gbW92ZVNuYXBzaG90c0VxdWFsKGE6IElBbm5vdGF0aW9uTW92ZVNuYXBzaG90LCBiOiBJQW5ub3RhdGlvbk1vdmVTbmFwc2hvdCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoYSkgPT09IEpTT04uc3RyaW5naWZ5KGIpO1xufVxuXG5leHBvcnQgY2xhc3MgU2NyZWVuc2hvdEFubm90YXRpb25FZGl0b3Ige1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9vbE9wdGlvbnNEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTYXZlID0gbmV3IEVtaXR0ZXI8SUFubm90YXRpb25TYXZlUmVzdWx0PigpO1xuXHRyZWFkb25seSBvbkRpZFNhdmU6IEV2ZW50PElBbm5vdGF0aW9uU2F2ZVJlc3VsdD4gPSB0aGlzLl9vbkRpZFNhdmUuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2FuY2VsID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDYW5jZWw6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDYW5jZWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSBjb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBjYW52YXMhOiBIVE1MQ2FudmFzRWxlbWVudDtcblx0cHJpdmF0ZSBjdHghOiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XG5cblx0cHJpdmF0ZSBhY3RpdmVUb29sOiBBbm5vdGF0aW9uVG9vbCA9IEFubm90YXRpb25Ub29sLkZyZWVoYW5kO1xuXHRwcml2YXRlIGFjdGl2ZVN0cm9rZUNvbG9yID0gQ09MT1JTWzBdO1xuXHRwcml2YXRlIGFjdGl2ZUZpbGxDb2xvciA9ICd0cmFuc3BhcmVudCc7XG5cdHByaXZhdGUgYWN0aXZlTGluZVdpZHRoID0gNDtcblx0cHJpdmF0ZSBhY3RpdmVPcGFjaXR5ID0gMTtcblx0cHJpdmF0ZSByZWFkb25seSBhY3Rpb25zOiBEcmF3QWN0aW9uW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSB1bmRvbmVBY3Rpb25zOiBEcmF3QWN0aW9uW10gPSBbXTtcblx0cHJpdmF0ZSBjdXJyZW50QWN0aW9uOiBEcmF3QWN0aW9uIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgaXNEcmF3aW5nID0gZmFsc2U7XG5cdHByaXZhdGUgaXNFcmFzaW5nID0gZmFsc2U7XG5cdC8qKiBBY3Rpb25zIGVyYXNlZCBkdXJpbmcgdGhlIGN1cnJlbnQgcG9pbnRlciBkcmFnOyBjb21taXR0ZWQgdG8gdW5kbyBzdGFjayBvbiBwb2ludGVyLXVwLiAqL1xuXHRwcml2YXRlIHBlbmRpbmdFcmFzZUFjdGlvbnM6IERyYXdBY3Rpb25bXSA9IFtdO1xuXHQvKiogT3JpZ2luYWwgaW5kZXggKGluIGBhY3Rpb25zW11gKSBvZiBlYWNoIGVudHJ5IGluIGBwZW5kaW5nRXJhc2VBY3Rpb25zYCwgY2FwdHVyZWQgYXQgdGhlIG1vbWVudCBpdCB3YXMgcmVtb3ZlZC4gKi9cblx0cHJpdmF0ZSBwZW5kaW5nRXJhc2VJbmRpY2VzOiBudW1iZXJbXSA9IFtdO1xuXG5cdHByaXZhdGUgaW1hZ2VFbGVtZW50OiBIVE1MSW1hZ2VFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgaW1hZ2VXaWR0aCA9IDA7XG5cdHByaXZhdGUgaW1hZ2VIZWlnaHQgPSAwO1xuXHRwcml2YXRlIHNjYWxlID0gMTtcblxuXHQvLyBQYW4gJiB6b29tXG5cdHByaXZhdGUgcGFuWCA9IDA7XG5cdHByaXZhdGUgcGFuWSA9IDA7XG5cdHByaXZhdGUgaXNQYW5uaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgbGFzdFBhblBvaW50ID0geyB4OiAwLCB5OiAwIH07XG5cblx0Ly8gQ3JvcCB3aXRoIGhhbmRsZXNcblx0cHJpdmF0ZSBjcm9wTW9kZSA9IGZhbHNlO1xuXHRwcml2YXRlIGNyb3BSZWdpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBjcm9wRHJhZ0hhbmRsZTogJ253JyB8ICduJyB8ICduZScgfCAnZScgfCAnc2UnIHwgJ3MnIHwgJ3N3JyB8ICd3JyB8ICdtb3ZlJyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGNyb3BEcmFnU3RhcnQgPSB7IHg6IDAsIHk6IDAgfTtcblx0cHJpdmF0ZSBjcm9wUmVnaW9uU3RhcnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBoYXNVc2VyWm9vbWVkID0gZmFsc2U7XG5cdC8qKiBQZW5kaW5nIHdoZWVsLXpvb20gZGVsdGEgYWNjdW11bGF0ZWQgYWNyb3NzIHJhcGlkIHdoZWVsIGV2ZW50czsgZmx1c2hlZCBvbiByQUYuICovXG5cdHByaXZhdGUgcGVuZGluZ1pvb206IHsgZmFjdG9yOiBudW1iZXI7IGN4OiBudW1iZXI7IGN5OiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHBlbmRpbmdab29tUmFmID0gMDtcblxuXHQvLyBPcmlnaW5hbCBpbWFnZSBwcmVzZXJ2ZWQgc28gY3JvcHMgY2FuIGJlIGV4cGFuZGVkIGJhY2tcblx0cHJpdmF0ZSBvcmlnaW5hbEltYWdlOiB7IGVsZW1lbnQ6IEhUTUxJbWFnZUVsZW1lbnQ7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcblx0Ly8gQ3VycmVudCBjcm9wIHJlZ2lvbiBpbiBvcmlnaW5hbC1pbWFnZSBjb29yZHMgKG51bGwgPSBubyBjcm9wIGFwcGxpZWQpXG5cdHByaXZhdGUgY3VycmVudENyb3A6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcblx0Ly8gUHJlLWNyb3Agc3RhdGUgcmVzdG9yZWQgb24gQ2FuY2VsXG5cdHByaXZhdGUgcHJlQ3JvcFN0YXRlOiB7IGVsZW1lbnQ6IEhUTUxJbWFnZUVsZW1lbnQ7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyBjdXJyZW50Q3JvcDogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IG51bGwgfSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIG1haW5Ub29sYmFyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGNyb3BUb29sYmFyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5cdC8qKiBBbm5vdGF0aW9ucyBhcmUgc3RvcmVkIGluIG9yaWdpbmFsLWltYWdlIGNvb3Jkcy4gV2hpbGUgaW4gY3JvcCBtb2RlIHRoZSBjYW52YXMgYWxyZWFkeSBzaG93cyB0aGUgb3JpZ2luYWwgaW1hZ2UsIHNvIHRoZSBvZmZzZXQgaXMgMC4gKi9cblx0cHJpdmF0ZSBnZXQgY3JvcE9mZnNldFgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuY3JvcE1vZGUgPyAwIDogKHRoaXMuY3VycmVudENyb3A/LnggPz8gMCk7IH1cblx0cHJpdmF0ZSBnZXQgY3JvcE9mZnNldFkoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuY3JvcE1vZGUgPyAwIDogKHRoaXMuY3VycmVudENyb3A/LnkgPz8gMCk7IH1cblxuXHQvLyBTZWxlY3Rpb24gKFNlbGVjdCB0b29sKVxuXHRwcml2YXRlIHNlbGVjdGVkQWN0aW9uSW5kZXggPSAtMTtcblx0cHJpdmF0ZSBpc0RyYWdnaW5nU2VsZWN0ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBpc1Jlc2l6aW5nU2VsZWN0ZWRUZXh0ID0gZmFsc2U7XG5cdHByaXZhdGUgZHJhZ1N0YXJ0ID0geyB4OiAwLCB5OiAwIH07XG5cdHByaXZhdGUgc2VsZWN0ZWRUZXh0UmVzaXplU3RhcnRXaWR0aCA9IERFRkFVTFRfVEVYVF9CT1hfV0lEVEg7XG5cdC8qKiBDYXB0dXJlZCBhdCB0aGUgc3RhcnQgb2YgYSBTZWxlY3QtdG9vbCBkcmFnL3Jlc2l6ZSBzbyBhIE1vdmUgc2VudGluZWwgY2FuIGJlIGNvbW1pdHRlZCBvbiBwb2ludGVyLXVwLiAqL1xuXHRwcml2YXRlIHBlbmRpbmdNb3ZlOiB7IHRhcmdldDogRHJhd0FjdGlvbjsgYmVmb3JlOiBJQW5ub3RhdGlvbk1vdmVTbmFwc2hvdCB9IHwgbnVsbCA9IG51bGw7XG5cblx0Ly8gVGV4dCBjb25maWd1cmF0aW9uXG5cdHByaXZhdGUgYWN0aXZlRm9udFNpemUgPSAxODtcblx0cHJpdmF0ZSBhY3RpdmVGb250RmFtaWx5ID0gRk9OVF9GQU1JTElFU1swXS52YWx1ZTtcblx0cHJpdmF0ZSB0ZXh0UGxhY2VtZW50U3RhdGU6IHtcblx0XHRzdGFydDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuXHRcdGN1cnJlbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcblx0XHRwb2ludGVySWQ6IG51bWJlcjtcblx0fSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHRleHRFZGl0U3RhdGU6IHtcblx0XHRwb3M6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcblx0XHR0ZXh0OiBzdHJpbmc7XG5cdFx0Y2FyZXRJbmRleDogbnVtYmVyO1xuXHRcdHN0cm9rZUNvbG9yOiBzdHJpbmc7XG5cdFx0ZmlsbENvbG9yOiBzdHJpbmc7XG5cdFx0b3BhY2l0eTogbnVtYmVyO1xuXHRcdGZvbnRTaXplOiBudW1iZXI7XG5cdFx0Zm9udEZhbWlseTogc3RyaW5nO1xuXHRcdHdpZHRoOiBudW1iZXI7XG5cdFx0c2hvd0JveE91dGxpbmU6IGJvb2xlYW47XG5cdH0gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSB0ZXh0RWRpdG9yOiBIVE1MVGV4dEFyZWFFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgdGV4dENhcmV0VmlzaWJsZSA9IHRydWU7XG5cdHByaXZhdGUgdGV4dENhcmV0SW50ZXJ2YWw6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG5cdC8vIFRvb2wgYnV0dG9ucyAoZm9yIGFjdGl2ZSBzdGF0ZSBtYW5hZ2VtZW50KVxuXHRwcml2YXRlIHJlYWRvbmx5IHRvb2xCdXR0b25zOiB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyB0b29sOiBBbm5vdGF0aW9uVG9vbCB9W10gPSBbXTtcblx0cHJpdmF0ZSB1bmRvQnRuOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHJlZG9CdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgdG9vbE9wdGlvbnNQb3BvdmVyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzY3JlZW5zaG90OiBJU2NyZWVuc2hvdCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHBhcmVudEVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW5pdGlhbFN0YXRlPzogSUFubm90YXRpb25FZGl0b3JTdGF0ZSxcblx0KSB7XG5cdFx0dGhpcy5jcmVhdGVVSSgpO1xuXHRcdHRoaXMubG9hZEltYWdlKCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVVJKCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyID0gYXBwZW5kKHRoaXMucGFyZW50RWxlbWVudCwgJCgnZGl2Lmlzc3VlLXJlcG9ydGVyLWFubm90YXRpb24tb3ZlcmxheScpKTtcblx0XHR0aGlzLmNvbnRhaW5lci50YWJJbmRleCA9IC0xO1xuXG5cdFx0Ly8gTWFpbiB0b29sYmFyIChoaWRkZW4gZHVyaW5nIGNyb3AgbW9kZSlcblx0XHRjb25zdCB0b29sYmFyID0gYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCdkaXYuYW5ub3RhdGlvbi10b29sYmFyJykpO1xuXHRcdHRoaXMubWFpblRvb2xiYXIgPSB0b29sYmFyO1xuXG5cdFx0Ly8gMS4gRHJhd2luZyB0b29sczogU2VsZWN0LCBQYW4sIENyb3AsIERyYXcsIFJlY3RhbmdsZSwgRWxsaXBzZSwgQXJyb3dcblx0XHRjb25zdCBkcmF3aW5nVG9vbHM6IHsgdG9vbDogQW5ub3RhdGlvblRvb2w7IGxhYmVsOiBzdHJpbmc7IGljb246IEhUTUxTcGFuRWxlbWVudCB9W10gPSBbXG5cdFx0XHR7IHRvb2w6IEFubm90YXRpb25Ub29sLlNlbGVjdCwgbGFiZWw6IGxvY2FsaXplKCdzZWxlY3QnLCBcIlNlbGVjdCAvIE1vdmVcIiksIGljb246IHJlbmRlckljb24oQ29kaWNvbi5pbnNwZWN0KSB9LFxuXHRcdFx0eyB0b29sOiBBbm5vdGF0aW9uVG9vbC5QYW4sIGxhYmVsOiBsb2NhbGl6ZSgncGFuJywgXCJQYW5cIiksIGljb246IHJlbmRlckljb24oQ29kaWNvbi5tb3ZlKSB9LFxuXHRcdF07XG5cdFx0Zm9yIChjb25zdCB7IHRvb2wsIGxhYmVsLCBpY29uIH0gb2YgZHJhd2luZ1Rvb2xzKSB7XG5cdFx0XHR0aGlzLmFkZFRvb2xCdXR0b24odG9vbGJhciwgdG9vbCwgbGFiZWwsIGljb24pO1xuXHRcdH1cblxuXHRcdC8vIDIuIENyb3AgdG9vbFxuXHRcdGNvbnN0IGNyb3BCdG4gPSBhcHBlbmQodG9vbGJhciwgJCgnYnV0dG9uLnRvb2wtYnRuLmNyb3AtYnRuJykpO1xuXHRcdGNyb3BCdG4uYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLnNjcmVlbkN1dCkpO1xuXHRcdGNyb3BCdG4udGl0bGUgPSBsb2NhbGl6ZSgnY3JvcCcsIFwiQ3JvcFwiKTtcblx0XHRjcm9wQnRuLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjcm9wJywgXCJDcm9wXCIpKTtcblx0XHR0aGlzLnRvb2xCdXR0b25zLnB1c2goeyBlbGVtZW50OiBjcm9wQnRuLCB0b29sOiBBbm5vdGF0aW9uVG9vbC5Dcm9wIH0pO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjcm9wQnRuLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdHRoaXMuc2V0QWN0aXZlVG9vbChBbm5vdGF0aW9uVG9vbC5Dcm9wKTtcblx0XHR9KSk7XG5cblx0XHQvLyAzLiBNb3JlIGRyYXdpbmcgdG9vbHNcblx0XHRjb25zdCBtb3JlRHJhd2luZ1Rvb2xzOiB7IHRvb2w6IEFubm90YXRpb25Ub29sOyBsYWJlbDogc3RyaW5nOyBpY29uOiBIVE1MU3BhbkVsZW1lbnQgfVtdID0gW1xuXHRcdFx0eyB0b29sOiBBbm5vdGF0aW9uVG9vbC5GcmVlaGFuZCwgbGFiZWw6IGxvY2FsaXplKCdmcmVlaGFuZCcsIFwiRHJhd1wiKSwgaWNvbjogcmVuZGVySWNvbihDb2RpY29uLmVkaXQpIH0sXG5cdFx0XHR7IHRvb2w6IEFubm90YXRpb25Ub29sLlJlY3RhbmdsZSwgbGFiZWw6IGxvY2FsaXplKCdyZWN0YW5nbGUnLCBcIlJlY3RhbmdsZVwiKSwgaWNvbjogcmVuZGVySWNvbihDb2RpY29uLnByaW1pdGl2ZVNxdWFyZSkgfSxcblx0XHRcdHsgdG9vbDogQW5ub3RhdGlvblRvb2wuRWxsaXBzZSwgbGFiZWw6IGxvY2FsaXplKCdlbGxpcHNlJywgXCJFbGxpcHNlXCIpLCBpY29uOiByZW5kZXJJY29uKENvZGljb24uY2lyY2xlKSB9LFxuXHRcdFx0eyB0b29sOiBBbm5vdGF0aW9uVG9vbC5BcnJvdywgbGFiZWw6IGxvY2FsaXplKCdhcnJvdycsIFwiQXJyb3dcIiksIGljb246IHJlbmRlckljb24oQ29kaWNvbi5hcnJvd1JpZ2h0KSB9LFxuXHRcdFx0eyB0b29sOiBBbm5vdGF0aW9uVG9vbC5FcmFzZXIsIGxhYmVsOiBsb2NhbGl6ZSgnZXJhc2VyJywgXCJFcmFzZXJcIiksIGljb246IHJlbmRlckljb24oQ29kaWNvbi5lcmFzZXIpIH0sXG5cdFx0XTtcblx0XHRmb3IgKGNvbnN0IHsgdG9vbCwgbGFiZWwsIGljb24gfSBvZiBtb3JlRHJhd2luZ1Rvb2xzKSB7XG5cdFx0XHR0aGlzLmFkZFRvb2xCdXR0b24odG9vbGJhciwgdG9vbCwgbGFiZWwsIGljb24pO1xuXHRcdH1cblxuXHRcdC8vIDQuIFRleHQgdG9vbFxuXHRcdHRoaXMuYWRkVG9vbEJ1dHRvbih0b29sYmFyLCBBbm5vdGF0aW9uVG9vbC5UZXh0LCBsb2NhbGl6ZSgndGV4dCcsIFwiVGV4dFwiKSwgcmVuZGVySWNvbihDb2RpY29uLnN5bWJvbFN0cmluZykpO1xuXG5cdFx0dGhpcy50b29sT3B0aW9uc1BvcG92ZXIgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJ2Rpdi5hbm5vdGF0aW9uLXRvb2wtb3B0aW9ucy1wb3BvdmVyJykpO1xuXHRcdHRoaXMudG9vbE9wdGlvbnNQb3BvdmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCBFdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnRvb2xPcHRpb25zUG9wb3ZlciB8fCB0aGlzLnRvb2xPcHRpb25zUG9wb3Zlci5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZScpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgTm9kZTtcblx0XHRcdGlmICghdGhpcy50b29sT3B0aW9uc1BvcG92ZXIuY29udGFpbnModGFyZ2V0KSAmJiAhdGhpcy50b29sQnV0dG9ucy5zb21lKGJ1dHRvbiA9PiBidXR0b24uZWxlbWVudC5jb250YWlucyh0YXJnZXQpKSkge1xuXHRcdFx0XHR0aGlzLmhpZGVUb29sT3B0aW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnJlbmRlclRvb2xPcHRpb25zKCk7XG5cblx0XHQvLyA1LiBTZXBhcmF0b3Jcblx0XHRhcHBlbmQodG9vbGJhciwgJCgnZGl2LnRvb2xiYXItc2VwYXJhdG9yJykpO1xuXG5cdFx0Ly8gNi4gVW5kbyBidXR0b25cblx0XHRjb25zdCB1bmRvQnRuID0gYXBwZW5kKHRvb2xiYXIsICQoJ2J1dHRvbi50b29sLWJ0bicpKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHR1bmRvQnRuLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5kaXNjYXJkKSk7XG5cdFx0dW5kb0J0bi50aXRsZSA9IGxvY2FsaXplKCd1bmRvJywgXCJVbmRvXCIpO1xuXHRcdHVuZG9CdG4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3VuZG8nLCBcIlVuZG9cIikpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih1bmRvQnRuLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMudW5kbygpKSk7XG5cdFx0dGhpcy51bmRvQnRuID0gdW5kb0J0bjtcblxuXHRcdC8vIDcuIFJlZG8gYnV0dG9uXG5cdFx0Y29uc3QgcmVkb0J0biA9IGFwcGVuZCh0b29sYmFyLCAkKCdidXR0b24udG9vbC1idG4nKSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0cmVkb0J0bi5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24ucmVkbykpO1xuXHRcdHJlZG9CdG4udGl0bGUgPSBsb2NhbGl6ZSgncmVkbycsIFwiUmVkb1wiKTtcblx0XHRyZWRvQnRuLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdyZWRvJywgXCJSZWRvXCIpKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIocmVkb0J0biwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB0aGlzLnJlZG8oKSkpO1xuXHRcdHRoaXMucmVkb0J0biA9IHJlZG9CdG47XG5cdFx0dGhpcy51cGRhdGVVbmRvUmVkb1N0YXRlKCk7XG5cblx0XHQvLyA4LiBTZXBhcmF0b3Jcblx0XHRhcHBlbmQodG9vbGJhciwgJCgnZGl2LnRvb2xiYXItc2VwYXJhdG9yJykpO1xuXG5cdFx0Ly8gOS4gRGlzY2FyZCBidXR0b25cblx0XHRjb25zdCBkaXNjYXJkQnRuID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbih0b29sYmFyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSB9KSk7XG5cdFx0ZGlzY2FyZEJ0bi5sYWJlbCA9IGxvY2FsaXplKCdkaXNjYXJkJywgXCJEaXNjYXJkXCIpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGRpc2NhcmRCdG4ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR0aGlzLmNhbmNlbFRleHRFZGl0KCk7XG5cdFx0XHR0aGlzLl9vbkRpZENhbmNlbC5maXJlKCk7XG5cdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cblx0XHQvLyAxMC4gU2F2ZSBidXR0b25cblx0XHRjb25zdCBzYXZlQnRuID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbih0b29sYmFyLCBkZWZhdWx0QnV0dG9uU3R5bGVzKSk7XG5cdFx0c2F2ZUJ0bi5sYWJlbCA9IGxvY2FsaXplKCdzYXZlJywgXCJTYXZlXCIpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHNhdmVCdG4ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR0aGlzLmNvbW1pdFRleHRFZGl0KCk7XG5cdFx0XHRjb25zdCBkYXRhVXJsID0gdGhpcy5jb21wb3NpdGVUb0RhdGFVcmwoKTtcblx0XHRcdHRoaXMuX29uRGlkU2F2ZS5maXJlKHsgZGF0YVVybCwgc3RhdGU6IHRoaXMuY2FwdHVyZVN0YXRlKCkgfSk7XG5cdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBDcm9wIHRvb2xiYXIgKHNob3duIG9ubHkgZHVyaW5nIGNyb3AgbW9kZSwgaGlkZGVuIGJ5IGRlZmF1bHQpXG5cdFx0Y29uc3QgY3JvcFRvb2xiYXIgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJ2Rpdi5hbm5vdGF0aW9uLXRvb2xiYXIuYW5ub3RhdGlvbi1jcm9wLXRvb2xiYXInKSk7XG5cdFx0Y3JvcFRvb2xiYXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLmNyb3BUb29sYmFyID0gY3JvcFRvb2xiYXI7XG5cblx0XHRjb25zdCBjcm9wQ2FuY2VsQnRuID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihjcm9wVG9vbGJhciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUgfSkpO1xuXHRcdGNyb3BDYW5jZWxCdG4ubGFiZWwgPSBsb2NhbGl6ZSgnY2FuY2VsJywgXCJDYW5jZWxcIik7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoY3JvcENhbmNlbEJ0bi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMuY2FuY2VsQ3JvcCgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNyb3BBcHBseUJ0biA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oY3JvcFRvb2xiYXIsIGRlZmF1bHRCdXR0b25TdHlsZXMpKTtcblx0XHRjcm9wQXBwbHlCdG4ubGFiZWwgPSBsb2NhbGl6ZSgnYXBwbHknLCBcIkFwcGx5XCIpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGNyb3BBcHBseUJ0bi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMuY29tbWl0Q3JvcCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEhpbnQgbGFiZWxcblx0XHRjb25zdCBoaW50ID0gYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCdkaXYuYW5ub3RhdGlvbi1oaW50JykpO1xuXHRcdGhpbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYW5ub3RhdGlvbkhpbnQnLCBcIkVkaXQgc2NyZWVuc2hvdCB0byBoaWdobGlnaHQgdGhlIHByb2JsZW1cIik7XG5cblx0XHQvLyBDYW52YXMgY29udGFpbmVyXG5cdFx0Y29uc3QgY2FudmFzQ29udGFpbmVyID0gYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCdkaXYuYW5ub3RhdGlvbi1jYW52YXMtY29udGFpbmVyJykpO1xuXHRcdHRoaXMuY2FudmFzID0gYXBwZW5kKGNhbnZhc0NvbnRhaW5lciwgJCgnY2FudmFzJykpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xuXHRcdGNvbnN0IGN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG5cdFx0aWYgKCFjdHgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdldCAyRCBjYW52YXMgY29udGV4dCcpO1xuXHRcdH1cblx0XHR0aGlzLmN0eCA9IGN0eDtcblxuXHRcdC8vIENhbnZhcyBwb2ludGVyIGV2ZW50c1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNhbnZhcywgRXZlbnRUeXBlLlBPSU5URVJfRE9XTiwgZSA9PiB0aGlzLm9uUG9pbnRlckRvd24oZSkpKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jYW52YXMsIEV2ZW50VHlwZS5QT0lOVEVSX01PVkUsIGUgPT4gdGhpcy5vblBvaW50ZXJNb3ZlKGUpKSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY2FudmFzLCBFdmVudFR5cGUuUE9JTlRFUl9VUCwgZSA9PiB0aGlzLm9uUG9pbnRlclVwKGUpKSk7XG5cblx0XHQvLyBEb3VibGUtY2xpY2sgdG8gYXBwbHkgY3JvcFxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNhbnZhcywgRXZlbnRUeXBlLkRCTENMSUNLLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmNvbW1pdENyb3AoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBXaGVlbDogdG91Y2hwYWQgdHdvLWZpbmdlciBzY3JvbGwgXHUyMTkyIHBhbjsgQ3RybCt3aGVlbCBvciBwaW5jaCBcdTIxOTIgem9vbSBhcm91bmQgY3Vyc29yXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNhbnZhc0NvbnRhaW5lciwgRXZlbnRUeXBlLldIRUVMLCAoZTogV2hlZWxFdmVudCkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0aWYgKGUuY3RybEtleSkge1xuXHRcdFx0XHQvLyBQaW5jaC10by16b29tIG9uIHRvdWNocGFkIChicm93c2VyIHN5bnRoZXNpc2VzIGN0cmxLZXkpIG9yIEN0cmwrc2Nyb2xsLlxuXHRcdFx0XHQvLyBXaGVlbCBldmVudHMgY2FuIGZpcmUgZmFzdGVyIHRoYW4gd2UgY2FuIHJlZHJhdyBhdCBoaWdoIHpvb20gbGV2ZWxzLFxuXHRcdFx0XHQvLyBzbyB3ZSBjb2FsZXNjZSB0aGUgZGVsdGFzIGFuZCBmbHVzaCBvbmNlIHBlciBhbmltYXRpb24gZnJhbWUuIFRoaXMga2VlcHNcblx0XHRcdFx0Ly8gdGhlIGNhbnZhcyByZWFsbG9jYXRpb24vcmVkcmF3IGNvc3QgYm91bmRlZCBhbmQgbGV0cyBvdGhlciBpbnB1dCAobGlrZVxuXHRcdFx0XHQvLyBkcmF3aW5nKSBpbnRlcmxlYXZlIHJlc3BvbnNpdmVseS5cblx0XHRcdFx0Y29uc3QgZGVsdGEgPSBlLmRlbHRhWSAhPT0gMCA/IGUuZGVsdGFZIDogZS5kZWx0YVg7XG5cdFx0XHRcdGNvbnN0IGZhY3RvciA9IGRlbHRhIDwgMCA/IDEuMSA6IDAuOTtcblx0XHRcdFx0Y29uc3QgY29udGFpbmVyUmVjdCA9IGNhbnZhc0NvbnRhaW5lci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0Y29uc3QgY3ggPSBlLmNsaWVudFggLSAoY29udGFpbmVyUmVjdC5sZWZ0ICsgY29udGFpbmVyUmVjdC53aWR0aCAvIDIpO1xuXHRcdFx0XHRjb25zdCBjeSA9IGUuY2xpZW50WSAtIChjb250YWluZXJSZWN0LnRvcCArIGNvbnRhaW5lclJlY3QuaGVpZ2h0IC8gMik7XG5cdFx0XHRcdGlmICh0aGlzLnBlbmRpbmdab29tKSB7XG5cdFx0XHRcdFx0dGhpcy5wZW5kaW5nWm9vbS5mYWN0b3IgKj0gZmFjdG9yO1xuXHRcdFx0XHRcdHRoaXMucGVuZGluZ1pvb20uY3ggPSBjeDtcblx0XHRcdFx0XHR0aGlzLnBlbmRpbmdab29tLmN5ID0gY3k7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5wZW5kaW5nWm9vbSA9IHsgZmFjdG9yLCBjeCwgY3kgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXRoaXMucGVuZGluZ1pvb21SYWYpIHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBnZXRXaW5kb3codGhpcy5jYW52YXMpO1xuXHRcdFx0XHRcdHRoaXMucGVuZGluZ1pvb21SYWYgPSB0YXJnZXRXaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGVuZGluZ1pvb21SYWYgPSAwO1xuXHRcdFx0XHRcdFx0dGhpcy5mbHVzaFBlbmRpbmdab29tKCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFR3by1maW5nZXIgc2Nyb2xsIG9uIHRvdWNocGFkIChvciBwbGFpbiBzY3JvbGwgd2hlZWwpIFx1MjE5MiBwYW5cblx0XHRcdFx0dGhpcy5wYW5YIC09IGUuZGVsdGFYO1xuXHRcdFx0XHR0aGlzLnBhblkgLT0gZS5kZWx0YVk7XG5cdFx0XHRcdHRoaXMuY2xhbXBQYW4oKTtcblx0XHRcdFx0dGhpcy5jYW52YXMuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke3RoaXMucGFuWH1weCwgJHt0aGlzLnBhbll9cHgpYDtcblx0XHRcdH1cblx0XHR9LCB7IHBhc3NpdmU6IGZhbHNlIH0pKTtcblxuXHRcdC8vIEtleWJvYXJkIHNob3J0Y3V0c1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMudGV4dEVkaXRTdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy50ZXh0UGxhY2VtZW50U3RhdGUgJiYgZS5rZXkgPT09ICdFc2NhcGUnKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5jYW5jZWxUZXh0UGxhY2VtZW50KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIHtcblx0XHRcdFx0aWYgKHRoaXMuY3JvcE1vZGUpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHR0aGlzLmNhbmNlbENyb3AoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3RlZEFjdGlvbkluZGV4ID0gLTE7XG5cdFx0XHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENhbmNlbC5maXJlKCk7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmtleSA9PT0gJ0VudGVyJyAmJiB0aGlzLmNyb3BNb2RlKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0dGhpcy5jb21taXRDcm9wKCk7XG5cdFx0XHR9IGVsc2UgaWYgKChlLmtleSA9PT0gJ0RlbGV0ZScgfHwgZS5rZXkgPT09ICdCYWNrc3BhY2UnKSAmJiB0aGlzLnNlbGVjdGVkQWN0aW9uSW5kZXggPj0gMCkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGNvbnN0IHJlbW92ZWRJbmRleCA9IHRoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleDtcblx0XHRcdFx0Y29uc3QgW3JlbW92ZWRdID0gdGhpcy5hY3Rpb25zLnNwbGljZShyZW1vdmVkSW5kZXgsIDEpO1xuXHRcdFx0XHR0aGlzLnNlbGVjdGVkQWN0aW9uSW5kZXggPSAtMTtcblx0XHRcdFx0Ly8gUmVjb3JkIHRoZSBkZWxldGlvbiBhcyBhbiBFcmFzZXIgc2VudGluZWwgc28gdW5kby9yZWRvIHdvcmtzIGp1c3Rcblx0XHRcdFx0Ly8gbGlrZSB0aGUgZXJhc2VyIHRvb2wuXG5cdFx0XHRcdHRoaXMuYWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiBBbm5vdGF0aW9uVG9vbC5FcmFzZXIsXG5cdFx0XHRcdFx0c3Ryb2tlQ29sb3I6ICcnLFxuXHRcdFx0XHRcdG9wYWNpdHk6IDEsXG5cdFx0XHRcdFx0bGluZVdpZHRoOiAwLFxuXHRcdFx0XHRcdGVyYXNlZEFjdGlvbnM6IFtyZW1vdmVkXSxcblx0XHRcdFx0XHRlcmFzZWRJbmRpY2VzOiBbcmVtb3ZlZEluZGV4XSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMudW5kb25lQWN0aW9ucy5sZW5ndGggPSAwO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVVuZG9SZWRvU3RhdGUoKTtcblx0XHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZS1maXQgY2FudmFzIHdoZW4gY29udGFpbmVyIHJlc2l6ZXNcblx0XHRjb25zdCByZXNpemVPYnNlcnZlciA9IG5ldyBSZXNpemVPYnNlcnZlcigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pbWFnZUVsZW1lbnQpIHtcblx0XHRcdFx0Ly8gT24gcmVzaXplLCBlbnN1cmUgdGhlIHVzZXIncyBjdXJyZW50IHpvb20gaXMgc3RpbGwgYXQgbGVhc3QgdGhlIG5ldyBmaXQtdG8td2luZG93XG5cdFx0XHRcdC8vIHNjYWxlLiBXaXRob3V0IHRoaXMsIGdyb3dpbmcgdGhlIHdpbmRvdyBhZnRlciB6b29taW5nIG91dCBjb3VsZCBsZWF2ZSB0aGUgaW1hZ2Vcblx0XHRcdFx0Ly8gb3JwaGFuZWQgaW4gdGhlIGNlbnRyZSB3aXRoIGVtcHR5IHNwYWNlIGFyb3VuZCBpdCB0aGF0IGNhbid0IGJlIGZpbGxlZC5cblx0XHRcdFx0aWYgKHRoaXMuaGFzVXNlclpvb21lZCkge1xuXHRcdFx0XHRcdGNvbnN0IG1pblNjYWxlID0gdGhpcy5nZXRGaXRTY2FsZSgpO1xuXHRcdFx0XHRcdGlmICh0aGlzLnNjYWxlIDwgbWluU2NhbGUpIHtcblx0XHRcdFx0XHRcdHRoaXMuc2NhbGUgPSBtaW5TY2FsZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5zaXplQ2FudmFzKCk7XG5cdFx0XHRcdHRoaXMuY2xhbXBQYW4oKTtcblx0XHRcdFx0dGhpcy5jYW52YXMuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke3RoaXMucGFuWH1weCwgJHt0aGlzLnBhbll9cHgpYDtcblx0XHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXNpemVPYnNlcnZlci5vYnNlcnZlKGNhbnZhc0NvbnRhaW5lcik7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiByZXNpemVPYnNlcnZlci5kaXNjb25uZWN0KCkgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFkZFRvb2xCdXR0b24odG9vbGJhcjogSFRNTEVsZW1lbnQsIHRvb2w6IEFubm90YXRpb25Ub29sLCBsYWJlbDogc3RyaW5nLCBpY29uOiBIVE1MU3BhbkVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBidG4gPSBhcHBlbmQodG9vbGJhciwgJCgnYnV0dG9uLnRvb2wtYnRuJykpO1xuXHRcdGJ0bi5hcHBlbmRDaGlsZChpY29uKTtcblx0XHRidG4udGl0bGUgPSBsYWJlbDtcblx0XHRidG4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbGFiZWwpO1xuXHRcdGJ0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsIFN0cmluZyh0b29sID09PSB0aGlzLmFjdGl2ZVRvb2wpKTtcblx0XHRpZiAodG9vbCA9PT0gdGhpcy5hY3RpdmVUb29sKSB7XG5cdFx0XHRidG4uY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG5cdFx0fVxuXHRcdHRoaXMudG9vbEJ1dHRvbnMucHVzaCh7IGVsZW1lbnQ6IGJ0biwgdG9vbCB9KTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYnRuLCBFdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuc2V0QWN0aXZlVG9vbCh0b29sKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclRvb2xPcHRpb25zKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy50b29sT3B0aW9uc1BvcG92ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy50b29sT3B0aW9uc0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy50b29sT3B0aW9uc1BvcG92ZXIudGV4dENvbnRlbnQgPSAnJztcblx0XHR0aGlzLnRvb2xPcHRpb25zUG9wb3Zlci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZ3JvdXAnKTtcblx0XHR0aGlzLnRvb2xPcHRpb25zUG9wb3Zlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgndG9vbE9wdGlvbnMnLCBcIlRvb2wgT3B0aW9uc1wiKSk7XG5cblx0XHR0aGlzLmFwcGVuZENvbG9yT3B0aW9ucyhcblx0XHRcdHRoaXMudG9vbE9wdGlvbnNQb3BvdmVyLFxuXHRcdFx0dGhpcy5hY3RpdmVUb29sID09PSBBbm5vdGF0aW9uVG9vbC5UZXh0ID8gbG9jYWxpemUoJ3RleHRDb2xvcicsIFwiVGV4dCBDb2xvclwiKSA6IGxvY2FsaXplKCdzdHJva2VDb2xvcicsIFwiU3Ryb2tlIENvbG9yXCIpLFxuXHRcdFx0Q09MT1JTLFxuXHRcdFx0dGhpcy5hY3RpdmVTdHJva2VDb2xvcixcblx0XHRcdGxvY2FsaXplKCdzZXRTdHJva2VDb2xvcicsIFwiU2V0IFN0cm9rZSBDb2xvclwiKSxcblx0XHRcdGNvbG9yID0+IHtcblx0XHRcdFx0dGhpcy5hY3RpdmVTdHJva2VDb2xvciA9IGNvbG9yO1xuXHRcdFx0XHR0aGlzLmFwcGx5VG9vbE9wdGlvbnNUb1RleHRFZGl0KCk7XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGlmICh0aGlzLmFjdGl2ZVRvb2wgIT09IEFubm90YXRpb25Ub29sLkZyZWVoYW5kICYmIHRoaXMuYWN0aXZlVG9vbCAhPT0gQW5ub3RhdGlvblRvb2wuQXJyb3cpIHtcblx0XHRcdHRoaXMuYXBwZW5kQ29sb3JPcHRpb25zKFxuXHRcdFx0XHR0aGlzLnRvb2xPcHRpb25zUG9wb3Zlcixcblx0XHRcdFx0dGhpcy5hY3RpdmVUb29sID09PSBBbm5vdGF0aW9uVG9vbC5UZXh0ID8gbG9jYWxpemUoJ3RleHRCYWNrZ3JvdW5kQ29sb3InLCBcIkJhY2tncm91bmQgQ29sb3JcIikgOiBsb2NhbGl6ZSgnZmlsbENvbG9yJywgXCJGaWxsIENvbG9yXCIpLFxuXHRcdFx0XHRGSUxMX0NPTE9SUyxcblx0XHRcdFx0dGhpcy5hY3RpdmVGaWxsQ29sb3IsXG5cdFx0XHRcdGxvY2FsaXplKCdzZXRGaWxsQ29sb3InLCBcIlNldCBGaWxsIENvbG9yXCIpLFxuXHRcdFx0XHRjb2xvciA9PiB7XG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVGaWxsQ29sb3IgPSBjb2xvcjtcblx0XHRcdFx0XHR0aGlzLmFwcGx5VG9vbE9wdGlvbnNUb1RleHRFZGl0KCk7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5hcHBlbmRTaXplT3B0aW9ucyh0aGlzLnRvb2xPcHRpb25zUG9wb3Zlcik7XG5cdFx0dGhpcy5hcHBlbmRPcGFjaXR5T3B0aW9ucyh0aGlzLnRvb2xPcHRpb25zUG9wb3Zlcik7XG5cdH1cblxuXHRwcml2YXRlIGFwcGVuZENvbG9yT3B0aW9ucyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nLCBjb2xvcnM6IHN0cmluZ1tdLCBzZWxlY3RlZENvbG9yOiBzdHJpbmcsIGFyaWFMYWJlbFByZWZpeDogc3RyaW5nLCBvblNlbGVjdDogKGNvbG9yOiBzdHJpbmcpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCBncm91cCA9IGFwcGVuZChjb250YWluZXIsICQoJ2Rpdi5hbm5vdGF0aW9uLXRvb2wtb3B0aW9ucy1ncm91cCcpKTtcblx0XHRhcHBlbmQoZ3JvdXAsICQoJ3NwYW4uYW5ub3RhdGlvbi10b29sLW9wdGlvbnMtbGFiZWwnKSkudGV4dENvbnRlbnQgPSBsYWJlbDtcblx0XHRjb25zdCBzd2F0Y2hlcyA9IGFwcGVuZChncm91cCwgJCgnZGl2LmFubm90YXRpb24tY29sb3Itc3dhdGNoZXMnKSk7XG5cdFx0Zm9yIChjb25zdCBjb2xvciBvZiBjb2xvcnMpIHtcblx0XHRcdGNvbnN0IHN3YXRjaCA9IGFwcGVuZChzd2F0Y2hlcywgJCgnYnV0dG9uLmFubm90YXRpb24tY29sb3Itc3dhdGNoJykpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdFx0Y29uc3QgaXNUcmFuc3BhcmVudCA9IGNvbG9yID09PSAndHJhbnNwYXJlbnQnO1xuXHRcdFx0c3dhdGNoLmNsYXNzTGlzdC50b2dnbGUoJ3RyYW5zcGFyZW50JywgaXNUcmFuc3BhcmVudCk7XG5cdFx0XHRzd2F0Y2guY2xhc3NMaXN0LnRvZ2dsZSgnbGlnaHQtc3dhdGNoJywgTElHSFRfU1dBVENIX0NPTE9SUy5oYXMoY29sb3IpKTtcblx0XHRcdHN3YXRjaC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBpc1RyYW5zcGFyZW50ID8gJ3RyYW5zcGFyZW50JyA6IGNvbG9yO1xuXHRcdFx0c3dhdGNoLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGlzVHJhbnNwYXJlbnQgPyBsb2NhbGl6ZSgndHJhbnNwYXJlbnRDb2xvcicsIFwiezB9OiBUcmFuc3BhcmVudFwiLCBhcmlhTGFiZWxQcmVmaXgpIDogbG9jYWxpemUoJ2NvbG9yVmFsdWUnLCBcInswfTogezF9XCIsIGFyaWFMYWJlbFByZWZpeCwgY29sb3IpKTtcblx0XHRcdHN3YXRjaC5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsIFN0cmluZyhjb2xvciA9PT0gc2VsZWN0ZWRDb2xvcikpO1xuXHRcdFx0c3dhdGNoLmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsIGNvbG9yID09PSBzZWxlY3RlZENvbG9yKTtcblx0XHRcdHRoaXMudG9vbE9wdGlvbnNEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHN3YXRjaCwgRXZlbnRUeXBlLkNMSUNLLCBlID0+IHtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0b25TZWxlY3QoY29sb3IpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclRvb2xPcHRpb25zKCk7XG5cdFx0XHRcdHRoaXMucmVkcmF3KCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhcHBlbmRTaXplT3B0aW9ucyhjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgaXNUZXh0ID0gdGhpcy5hY3RpdmVUb29sID09PSBBbm5vdGF0aW9uVG9vbC5UZXh0O1xuXHRcdGNvbnN0IHZhbHVlcyA9IGlzVGV4dCA/IFRFWFRfU0laRVMgOiBTVFJPS0VfV0lEVEhTO1xuXHRcdGNvbnN0IHNlbGVjdGVkVmFsdWUgPSBpc1RleHQgPyB0aGlzLmFjdGl2ZUZvbnRTaXplIDogdGhpcy5hY3RpdmVMaW5lV2lkdGg7XG5cdFx0Y29uc3QgZ3JvdXAgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdkaXYuYW5ub3RhdGlvbi10b29sLW9wdGlvbnMtZ3JvdXAnKSk7XG5cdFx0YXBwZW5kKGdyb3VwLCAkKCdzcGFuLmFubm90YXRpb24tdG9vbC1vcHRpb25zLWxhYmVsJykpLnRleHRDb250ZW50ID0gaXNUZXh0ID8gbG9jYWxpemUoJ3RleHRTaXplJywgXCJUZXh0IFNpemVcIikgOiBsb2NhbGl6ZSgnc3Ryb2tlV2lkdGgnLCBcIlN0cm9rZSBXaWR0aFwiKTtcblx0XHRjb25zdCBidXR0b25zID0gYXBwZW5kKGdyb3VwLCAkKCdkaXYuYW5ub3RhdGlvbi1zaXplLWJ1dHRvbnMnKSk7XG5cdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGFwcGVuZChidXR0b25zLCAkKCdidXR0b24uYW5ub3RhdGlvbi1zaXplLWJ1dHRvbicpKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRcdGJ1dHRvbi50ZXh0Q29udGVudCA9IGAke3ZhbHVlfWA7XG5cdFx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgaXNUZXh0ID8gbG9jYWxpemUoJ3NldFRleHRTaXplJywgXCJTZXQgVGV4dCBTaXplIHRvIHswfXB4XCIsIHZhbHVlKSA6IGxvY2FsaXplKCdzZXRTdHJva2VXaWR0aCcsIFwiU2V0IFN0cm9rZSBXaWR0aCB0byB7MH1weFwiLCB2YWx1ZSkpO1xuXHRcdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1wcmVzc2VkJywgU3RyaW5nKHZhbHVlID09PSBzZWxlY3RlZFZhbHVlKSk7XG5cdFx0XHRidXR0b24uY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgdmFsdWUgPT09IHNlbGVjdGVkVmFsdWUpO1xuXHRcdFx0dGhpcy50b29sT3B0aW9uc0Rpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLCBFdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRpZiAoaXNUZXh0KSB7XG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVGb250U2l6ZSA9IHZhbHVlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuYWN0aXZlTGluZVdpZHRoID0gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5hcHBseVRvb2xPcHRpb25zVG9UZXh0RWRpdCgpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclRvb2xPcHRpb25zKCk7XG5cdFx0XHRcdHRoaXMucmVkcmF3KCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhcHBlbmRPcGFjaXR5T3B0aW9ucyhjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdkaXYuYW5ub3RhdGlvbi10b29sLW9wdGlvbnMtZ3JvdXAuYW5ub3RhdGlvbi1vcGFjaXR5LW9wdGlvbnMnKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBhcHBlbmQoZ3JvdXAsICQoJ2xhYmVsLmFubm90YXRpb24tdG9vbC1vcHRpb25zLWxhYmVsJykpO1xuXHRcdGxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ29wYWNpdHknLCBcIk9wYWNpdHlcIik7XG5cdFx0Y29uc3QgaW5wdXQgPSBhcHBlbmQoZ3JvdXAsICQoJ2lucHV0LmFubm90YXRpb24tb3BhY2l0eS1zbGlkZXInKSkgYXMgSFRNTElucHV0RWxlbWVudDtcblx0XHRpbnB1dC50eXBlID0gJ3JhbmdlJztcblx0XHRpbnB1dC5taW4gPSAnMjAnO1xuXHRcdGlucHV0Lm1heCA9ICcxMDAnO1xuXHRcdGlucHV0LnN0ZXAgPSAnMTAnO1xuXHRcdGlucHV0LnZhbHVlID0gYCR7TWF0aC5yb3VuZCh0aGlzLmFjdGl2ZU9wYWNpdHkgKiAxMDApfWA7XG5cdFx0aW5wdXQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3NldE9wYWNpdHknLCBcIlNldCBPcGFjaXR5XCIpKTtcblx0XHRjb25zdCB2YWx1ZSA9IGFwcGVuZChncm91cCwgJCgnc3Bhbi5hbm5vdGF0aW9uLW9wYWNpdHktdmFsdWUnKSk7XG5cdFx0dmFsdWUudGV4dENvbnRlbnQgPSBgJHtpbnB1dC52YWx1ZX0lYDtcblx0XHR0aGlzLnRvb2xPcHRpb25zRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dCwgRXZlbnRUeXBlLklOUFVULCBlID0+IHtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLmFjdGl2ZU9wYWNpdHkgPSBOdW1iZXIoaW5wdXQudmFsdWUpIC8gMTAwO1xuXHRcdFx0dmFsdWUudGV4dENvbnRlbnQgPSBgJHtpbnB1dC52YWx1ZX0lYDtcblx0XHRcdHRoaXMuYXBwbHlUb29sT3B0aW9uc1RvVGV4dEVkaXQoKTtcblx0XHRcdHRoaXMucmVkcmF3KCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseVRvb2xPcHRpb25zVG9UZXh0RWRpdCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudGV4dEVkaXRTdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnRleHRFZGl0U3RhdGUuc3Ryb2tlQ29sb3IgPSB0aGlzLmFjdGl2ZVN0cm9rZUNvbG9yO1xuXHRcdHRoaXMudGV4dEVkaXRTdGF0ZS5maWxsQ29sb3IgPSB0aGlzLmFjdGl2ZUZpbGxDb2xvcjtcblx0XHR0aGlzLnRleHRFZGl0U3RhdGUub3BhY2l0eSA9IHRoaXMuYWN0aXZlT3BhY2l0eTtcblx0XHR0aGlzLnRleHRFZGl0U3RhdGUuZm9udFNpemUgPSB0aGlzLmFjdGl2ZUZvbnRTaXplO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93VG9vbE9wdGlvbnMoYW5jaG9yOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy50b29sT3B0aW9uc1BvcG92ZXIgfHwgIXRoaXMuaGFzVG9vbE9wdGlvbnModGhpcy5hY3RpdmVUb29sKSkge1xuXHRcdFx0dGhpcy5oaWRlVG9vbE9wdGlvbnMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5yZW5kZXJUb29sT3B0aW9ucygpO1xuXHRcdGNvbnN0IGNvbnRhaW5lclJlY3QgPSB0aGlzLmNvbnRhaW5lci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBhbmNob3JSZWN0ID0gYW5jaG9yLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdHRoaXMudG9vbE9wdGlvbnNQb3BvdmVyLnN0eWxlLnRvcCA9IGAke2FuY2hvclJlY3QuYm90dG9tIC0gY29udGFpbmVyUmVjdC50b3AgKyA2fXB4YDtcblx0XHR0aGlzLnRvb2xPcHRpb25zUG9wb3Zlci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdGNvbnN0IGhhbGZXaWR0aCA9IHRoaXMudG9vbE9wdGlvbnNQb3BvdmVyLm9mZnNldFdpZHRoIC8gMjtcblx0XHRjb25zdCBkZXNpcmVkTGVmdCA9IGFuY2hvclJlY3QubGVmdCArIGFuY2hvclJlY3Qud2lkdGggLyAyIC0gY29udGFpbmVyUmVjdC5sZWZ0O1xuXHRcdGNvbnN0IG1pbkxlZnQgPSBoYWxmV2lkdGggKyA4O1xuXHRcdGNvbnN0IG1heExlZnQgPSBNYXRoLm1heChtaW5MZWZ0LCBjb250YWluZXJSZWN0LndpZHRoIC0gaGFsZldpZHRoIC0gOCk7XG5cdFx0dGhpcy50b29sT3B0aW9uc1BvcG92ZXIuc3R5bGUubGVmdCA9IGAke01hdGgubWluKE1hdGgubWF4KGRlc2lyZWRMZWZ0LCBtaW5MZWZ0KSwgbWF4TGVmdCl9cHhgO1xuXHR9XG5cblx0cHJpdmF0ZSBoaWRlVG9vbE9wdGlvbnMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudG9vbE9wdGlvbnNQb3BvdmVyKSB7XG5cdFx0XHR0aGlzLnRvb2xPcHRpb25zUG9wb3Zlci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFzVG9vbE9wdGlvbnModG9vbDogQW5ub3RhdGlvblRvb2wpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdG9vbCA9PT0gQW5ub3RhdGlvblRvb2wuRnJlZWhhbmRcblx0XHRcdHx8IHRvb2wgPT09IEFubm90YXRpb25Ub29sLlJlY3RhbmdsZVxuXHRcdFx0fHwgdG9vbCA9PT0gQW5ub3RhdGlvblRvb2wuRWxsaXBzZVxuXHRcdFx0fHwgdG9vbCA9PT0gQW5ub3RhdGlvblRvb2wuQXJyb3dcblx0XHRcdHx8IHRvb2wgPT09IEFubm90YXRpb25Ub29sLlRleHQ7XG5cdH1cblxuXHRwcml2YXRlIHNldEFjdGl2ZVRvb2wodG9vbDogQW5ub3RhdGlvblRvb2wpOiB2b2lkIHtcblx0XHRpZiAodGhpcy50ZXh0RWRpdFN0YXRlICYmIHRvb2wgIT09IEFubm90YXRpb25Ub29sLlRleHQpIHtcblx0XHRcdHRoaXMuY29tbWl0VGV4dEVkaXQoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudGV4dFBsYWNlbWVudFN0YXRlICYmIHRvb2wgIT09IEFubm90YXRpb25Ub29sLlRleHQpIHtcblx0XHRcdHRoaXMuY2FuY2VsVGV4dFBsYWNlbWVudCgpO1xuXHRcdH1cblxuXHRcdC8vIFNwZWNpYWwgaGFuZGxpbmcgZm9yIENyb3A6IGVudGVyIGNyb3AgbW9kZSAoZG9uJ3QgY2hhbmdlIGFjdGl2ZVRvb2wgdG8gQ3JvcCBwZXJzaXN0ZW50bHkpXG5cdFx0aWYgKHRvb2wgPT09IEFubm90YXRpb25Ub29sLkNyb3ApIHtcblx0XHRcdHRoaXMuaGlkZVRvb2xPcHRpb25zKCk7XG5cdFx0XHR0aGlzLmVudGVyQ3JvcE1vZGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmFjdGl2ZVRvb2wgPSB0b29sO1xuXHRcdHRoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleCA9IC0xO1xuXHRcdGZvciAoY29uc3QgdGIgb2YgdGhpcy50b29sQnV0dG9ucykge1xuXHRcdFx0dGIuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCB0Yi50b29sID09PSB0b29sKTtcblx0XHRcdHRiLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCBTdHJpbmcodGIudG9vbCA9PT0gdG9vbCkpO1xuXHRcdH1cblx0XHRjb25zdCBhY3RpdmVUb29sQnV0dG9uID0gdGhpcy50b29sQnV0dG9ucy5maW5kKHRiID0+IHRiLnRvb2wgPT09IHRvb2wpPy5lbGVtZW50O1xuXHRcdGlmIChhY3RpdmVUb29sQnV0dG9uICYmIHRoaXMuaGFzVG9vbE9wdGlvbnModG9vbCkpIHtcblx0XHRcdHRoaXMuc2hvd1Rvb2xPcHRpb25zKGFjdGl2ZVRvb2xCdXR0b24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmhpZGVUb29sT3B0aW9ucygpO1xuXHRcdH1cblx0XHR0aGlzLmNhbnZhcy5zdHlsZS5jdXJzb3IgPSB0b29sID09PSBBbm5vdGF0aW9uVG9vbC5TZWxlY3QgPyAnZGVmYXVsdCcgOlxuXHRcdFx0dG9vbCA9PT0gQW5ub3RhdGlvblRvb2wuUGFuID8gJ2dyYWInIDpcblx0XHRcdFx0dG9vbCA9PT0gQW5ub3RhdGlvblRvb2wuRXJhc2VyID8gJ3VybChcImRhdGE6aW1hZ2Uvc3ZnK3htbCw8c3ZnIHhtbG5zPVxcJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXFwnIHdpZHRoPVxcJzI0XFwnIGhlaWdodD1cXCcyNFxcJyB2aWV3cG9ydD1cXCcwIDAgMjQgMjRcXCc+PGNpcmNsZSBjeD1cXCcxMlxcJyBjeT1cXCcxMlxcJyByPVxcJzlcXCcgZmlsbD1cXCdub25lXFwnIHN0cm9rZT1cXCclMjNmZmZcXCcgc3Ryb2tlLXdpZHRoPVxcJzJcXCcvPjxjaXJjbGUgY3g9XFwnMTJcXCcgY3k9XFwnMTJcXCcgcj1cXCc5XFwnIGZpbGw9XFwnbm9uZVxcJyBzdHJva2U9XFwnJTIzMDAwXFwnIHN0cm9rZS13aWR0aD1cXCcxXFwnIHN0cm9rZS1kYXNoYXJyYXk9XFwnMiAyXFwnLz48L3N2Zz5cIikgMTIgMTIsIGNlbGwnIDogJ2Nyb3NzaGFpcic7XG5cdFx0dGhpcy5yZWRyYXcoKTtcblx0fVxuXG5cdHByaXZhdGUgZW50ZXJDcm9wTW9kZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jcm9wTW9kZSB8fCAhdGhpcy5vcmlnaW5hbEltYWdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFNhdmUgY3VycmVudCBzdGF0ZSBmb3IgY2FuY2VsXG5cdFx0dGhpcy5wcmVDcm9wU3RhdGUgPSB7XG5cdFx0XHRlbGVtZW50OiB0aGlzLmltYWdlRWxlbWVudCEsXG5cdFx0XHR3aWR0aDogdGhpcy5pbWFnZVdpZHRoLFxuXHRcdFx0aGVpZ2h0OiB0aGlzLmltYWdlSGVpZ2h0LFxuXHRcdFx0Y3VycmVudENyb3A6IHRoaXMuY3VycmVudENyb3AsXG5cdFx0fTtcblx0XHQvLyBTd2l0Y2ggdG8gb3JpZ2luYWwgaW1hZ2Ugc28gdXNlciBjYW4gZXhwYW5kIGNyb3AgcmVnaW9uXG5cdFx0dGhpcy5pbWFnZUVsZW1lbnQgPSB0aGlzLm9yaWdpbmFsSW1hZ2UuZWxlbWVudDtcblx0XHR0aGlzLmltYWdlV2lkdGggPSB0aGlzLm9yaWdpbmFsSW1hZ2Uud2lkdGg7XG5cdFx0dGhpcy5pbWFnZUhlaWdodCA9IHRoaXMub3JpZ2luYWxJbWFnZS5oZWlnaHQ7XG5cdFx0Ly8gSW5pdGlhbCBjcm9wIHJlZ2lvbiA9IGN1cnJlbnQgY3JvcCAob3IgZnVsbCBvcmlnaW5hbClcblx0XHR0aGlzLmNyb3BSZWdpb24gPSB0aGlzLmN1cnJlbnRDcm9wXG5cdFx0XHQ/IHsgLi4udGhpcy5jdXJyZW50Q3JvcCB9XG5cdFx0XHQ6IHsgeDogMCwgeTogMCwgd2lkdGg6IHRoaXMub3JpZ2luYWxJbWFnZS53aWR0aCwgaGVpZ2h0OiB0aGlzLm9yaWdpbmFsSW1hZ2UuaGVpZ2h0IH07XG5cdFx0dGhpcy5jcm9wTW9kZSA9IHRydWU7XG5cdFx0Ly8gTWFyayBjcm9wIHRvb2wgYnV0dG9uIGFjdGl2ZVxuXHRcdGZvciAoY29uc3QgdGIgb2YgdGhpcy50b29sQnV0dG9ucykge1xuXHRcdFx0dGIuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCB0Yi50b29sID09PSBBbm5vdGF0aW9uVG9vbC5Dcm9wKTtcblx0XHR9XG5cdFx0Ly8gVG9nZ2xlIHRvb2xiYXJzXG5cdFx0aWYgKHRoaXMubWFpblRvb2xiYXIpIHsgdGhpcy5tYWluVG9vbGJhci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnOyB9XG5cdFx0aWYgKHRoaXMuY3JvcFRvb2xiYXIpIHsgdGhpcy5jcm9wVG9vbGJhci5zdHlsZS5kaXNwbGF5ID0gJyc7IH1cblx0XHQvLyBSZXNldCB6b29tL3BhbiB0byBmaXQgb3JpZ2luYWxcblx0XHR0aGlzLmhhc1VzZXJab29tZWQgPSBmYWxzZTtcblx0XHR0aGlzLnBhblggPSAwO1xuXHRcdHRoaXMucGFuWSA9IDA7XG5cdFx0dGhpcy5jYW52YXMuc3R5bGUudHJhbnNmb3JtID0gJyc7XG5cdFx0dGhpcy5jYW52YXMuc3R5bGUuY3Vyc29yID0gJ2RlZmF1bHQnO1xuXHRcdHRoaXMuc2l6ZUNhbnZhcygpO1xuXHRcdHRoaXMucmVkcmF3KCk7XG5cdH1cblxuXHRwcml2YXRlIGV4aXRDcm9wTW9kZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNyb3BNb2RlID0gZmFsc2U7XG5cdFx0dGhpcy5jcm9wUmVnaW9uID0gbnVsbDtcblx0XHR0aGlzLmNyb3BEcmFnSGFuZGxlID0gbnVsbDtcblx0XHR0aGlzLmNyb3BSZWdpb25TdGFydCA9IG51bGw7XG5cdFx0dGhpcy5wcmVDcm9wU3RhdGUgPSBudWxsO1xuXHRcdC8vIFJlc3RvcmUgbWFpbiB0b29sYmFyXG5cdFx0aWYgKHRoaXMubWFpblRvb2xiYXIpIHsgdGhpcy5tYWluVG9vbGJhci5zdHlsZS5kaXNwbGF5ID0gJyc7IH1cblx0XHRpZiAodGhpcy5jcm9wVG9vbGJhcikgeyB0aGlzLmNyb3BUb29sYmFyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IH1cblx0XHQvLyBSZWFjdGl2YXRlIHByZXZpb3VzIHRvb2xcblx0XHR0aGlzLnNldEFjdGl2ZVRvb2wodGhpcy5hY3RpdmVUb29sKTtcblx0fVxuXG5cdHByaXZhdGUgY29tbWl0Q3JvcCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY3JvcE1vZGUgfHwgIXRoaXMuY3JvcFJlZ2lvbiB8fCAhdGhpcy5vcmlnaW5hbEltYWdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNyID0gdGhpcy5ub3JtYWxpemVDcm9wUmVjdCh0aGlzLmNyb3BSZWdpb24pO1xuXHRcdGlmIChjci53aWR0aCA8IDEwIHx8IGNyLmhlaWdodCA8IDEwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNyb3BGcm9tID0gdGhpcy5wcmVDcm9wU3RhdGU/LmN1cnJlbnRDcm9wID8/IG51bGw7XG5cdFx0Ly8gUHVzaCBhIENyb3Agc2VudGluZWwgaW50byB0aGUgbGluZWFyIHVuZG8gc3RhY2sgc28gdW5kby9yZWRvIHRyZWF0cyBpdFxuXHRcdC8vIGxpa2UgYW55IG90aGVyIGFjdGlvbi5cblx0XHRjb25zdCBjcm9wQWN0aW9uOiBEcmF3QWN0aW9uID0ge1xuXHRcdFx0dHlwZTogQW5ub3RhdGlvblRvb2wuQ3JvcCxcblx0XHRcdHN0cm9rZUNvbG9yOiAnJyxcblx0XHRcdG9wYWNpdHk6IDEsXG5cdFx0XHRsaW5lV2lkdGg6IDAsXG5cdFx0XHRjcm9wRnJvbSxcblx0XHRcdGNyb3BUbzogY3IsXG5cdFx0fTtcblx0XHR0aGlzLmFjdGlvbnMucHVzaChjcm9wQWN0aW9uKTtcblx0XHR0aGlzLnVuZG9uZUFjdGlvbnMubGVuZ3RoID0gMDtcblx0XHR0aGlzLnVwZGF0ZVVuZG9SZWRvU3RhdGUoKTtcblx0XHR0aGlzLmhhc1VzZXJab29tZWQgPSBmYWxzZTtcblx0XHR0aGlzLnBhblggPSAwO1xuXHRcdHRoaXMucGFuWSA9IDA7XG5cdFx0dGhpcy5jYW52YXMuc3R5bGUudHJhbnNmb3JtID0gJyc7XG5cdFx0dGhpcy5leGl0Q3JvcE1vZGUoKTtcblx0XHR0aGlzLmFwcGx5RGlzcGxheWVkQ3JvcChjcik7XG5cdH1cblxuXHRwcml2YXRlIGNhbmNlbENyb3AoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNyb3BNb2RlIHx8ICF0aGlzLnByZUNyb3BTdGF0ZSkge1xuXHRcdFx0dGhpcy5leGl0Q3JvcE1vZGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gUmVzdG9yZSB0aGUgcHJlLWNyb3AgZGlzcGxheWVkIHN0YXRlLiBBbm5vdGF0aW9ucyBsaXZlIGluIG9yaWdpbmFsIGNvb3Jkc1xuXHRcdC8vIGFuZCBkb24ndCBuZWVkIHRvIGJlIHRvdWNoZWQuXG5cdFx0dGhpcy5pbWFnZUVsZW1lbnQgPSB0aGlzLnByZUNyb3BTdGF0ZS5lbGVtZW50O1xuXHRcdHRoaXMuaW1hZ2VXaWR0aCA9IHRoaXMucHJlQ3JvcFN0YXRlLndpZHRoO1xuXHRcdHRoaXMuaW1hZ2VIZWlnaHQgPSB0aGlzLnByZUNyb3BTdGF0ZS5oZWlnaHQ7XG5cdFx0dGhpcy5jdXJyZW50Q3JvcCA9IHRoaXMucHJlQ3JvcFN0YXRlLmN1cnJlbnRDcm9wO1xuXHRcdHRoaXMuaGFzVXNlclpvb21lZCA9IGZhbHNlO1xuXHRcdHRoaXMucGFuWCA9IDA7XG5cdFx0dGhpcy5wYW5ZID0gMDtcblx0XHR0aGlzLmNhbnZhcy5zdHlsZS50cmFuc2Zvcm0gPSAnJztcblx0XHR0aGlzLmV4aXRDcm9wTW9kZSgpO1xuXHRcdHRoaXMuc2l6ZUNhbnZhcygpO1xuXHRcdHRoaXMucmVkcmF3KCk7XG5cdH1cblxuXHRwcml2YXRlIGxvYWRJbWFnZSgpOiB2b2lkIHtcblx0XHRjb25zdCBpbWcgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2ltZycpO1xuXHRcdGltZy5vbmxvYWQgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLmltYWdlRWxlbWVudCA9IGltZztcblx0XHRcdHRoaXMuaW1hZ2VXaWR0aCA9IGltZy5uYXR1cmFsV2lkdGg7XG5cdFx0XHR0aGlzLmltYWdlSGVpZ2h0ID0gaW1nLm5hdHVyYWxIZWlnaHQ7XG5cdFx0XHQvLyBQcmVzZXJ2ZSB0aGUgb3JpZ2luYWwgaW1hZ2Ugc28gY3JvcHMgY2FuIGJlIHJlLWV4cGFuZGVkXG5cdFx0XHR0aGlzLm9yaWdpbmFsSW1hZ2UgPSB7IGVsZW1lbnQ6IGltZywgd2lkdGg6IGltZy5uYXR1cmFsV2lkdGgsIGhlaWdodDogaW1nLm5hdHVyYWxIZWlnaHQgfTtcblx0XHRcdHRoaXMuY3VycmVudENyb3AgPSBudWxsO1xuXG5cdFx0XHQvLyBSZXN0b3JlIHByaW9yIGFjdGlvbnMgKGNsb25lIHNvIHVuZG8vcmVkbyBzdGF0ZSBzdXJ2aXZlcyByZW9wZW5zKS5cblx0XHRcdC8vIFVzZSBhIHNoYXJlZCBpZGVudGl0eSBtYXAgc28gTW92ZS9FcmFzZXIgc2VudGluZWxzIGtlZXAgcG9pbnRpbmcgYXRcblx0XHRcdC8vIHRoZSBjb3JyZWN0IGNsb25lZCBhY3Rpb24gcmVmZXJlbmNlcywgYm90aCBpbiBhY3Rpb25zW10gYW5kXG5cdFx0XHQvLyB1bmRvbmVBY3Rpb25zW10uXG5cdFx0XHRpZiAodGhpcy5pbml0aWFsU3RhdGUgJiYgKHRoaXMuaW5pdGlhbFN0YXRlLmFjdGlvbnMubGVuZ3RoIHx8IHRoaXMuaW5pdGlhbFN0YXRlLnVuZG9uZUFjdGlvbnMubGVuZ3RoKSkge1xuXHRcdFx0XHRjb25zdCBpZGVudGl0eU1hcCA9IG5ldyBNYXA8SUFubm90YXRpb25EcmF3QWN0aW9uLCBJQW5ub3RhdGlvbkRyYXdBY3Rpb24+KCk7XG5cdFx0XHRcdHRoaXMuYWN0aW9ucy5wdXNoKC4uLnRoaXMuaW5pdGlhbFN0YXRlLmFjdGlvbnMubWFwKGEgPT4gY2xvbmVEcmF3QWN0aW9uKGEsIGlkZW50aXR5TWFwKSkpO1xuXHRcdFx0XHR0aGlzLnVuZG9uZUFjdGlvbnMucHVzaCguLi50aGlzLmluaXRpYWxTdGF0ZS51bmRvbmVBY3Rpb25zLm1hcChhID0+IGNsb25lRHJhd0FjdGlvbihhLCBpZGVudGl0eU1hcCkpKTtcblx0XHRcdFx0dGhpcy51cGRhdGVVbmRvUmVkb1N0YXRlKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlc3RvcmUgcHJpb3IgY3JvcCwgaWYgYW55LlxuXHRcdFx0dGhpcy5hcHBseURpc3BsYXllZENyb3AodGhpcy5pbml0aWFsU3RhdGU/LmNyb3AgPz8gbnVsbCk7XG5cdFx0fTtcblx0XHQvLyBVc2Ugb3JpZ2luYWwgc2NyZWVuc2hvdCAobm90IGFubm90YXRlZCkgc28gd2UgY2FuIHJlLWNyb3AgZnJvbSBmdWxsIG9yaWdpbmFsXG5cdFx0aW1nLnNyYyA9IHRoaXMuc2NyZWVuc2hvdC5kYXRhVXJsO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSB0aGUgZGlzcGxheWVkIGltYWdlIHRvIHJlZmxlY3QgdGhlIGdpdmVuIGNyb3AgKG9yIHRoZSBmdWxsIG9yaWdpbmFsXG5cdCAqIHdoZW4gbnVsbCkuIENyb3BwZWQgaW1hZ2VzIGFyZSByZS1yYXN0ZXJpemVkIGZyb20gdGhlIHByZXNlcnZlZCBvcmlnaW5hbCBzb1xuXHQgKiB1bmRvL3JlZG8gb2YgY3JvcCBhY3Rpb25zIGlzIGZ1bGx5IHJldmVyc2libGUgd2l0aG91dCBrZWVwaW5nIGludGVybWVkaWF0ZVxuXHQgKiBpbWFnZSBlbGVtZW50cyBhcm91bmQuXG5cdCAqL1xuXHRwcml2YXRlIGFwcGx5RGlzcGxheWVkQ3JvcChjcm9wOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5vcmlnaW5hbEltYWdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghY3JvcCkge1xuXHRcdFx0dGhpcy5pbWFnZUVsZW1lbnQgPSB0aGlzLm9yaWdpbmFsSW1hZ2UuZWxlbWVudDtcblx0XHRcdHRoaXMuaW1hZ2VXaWR0aCA9IHRoaXMub3JpZ2luYWxJbWFnZS53aWR0aDtcblx0XHRcdHRoaXMuaW1hZ2VIZWlnaHQgPSB0aGlzLm9yaWdpbmFsSW1hZ2UuaGVpZ2h0O1xuXHRcdFx0dGhpcy5jdXJyZW50Q3JvcCA9IG51bGw7XG5cdFx0XHR0aGlzLnNpemVDYW52YXMoKTtcblx0XHRcdHRoaXMucmVkcmF3KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNyID0ge1xuXHRcdFx0eDogTWF0aC5tYXgoMCwgTWF0aC5taW4odGhpcy5vcmlnaW5hbEltYWdlLndpZHRoLCBjcm9wLngpKSxcblx0XHRcdHk6IE1hdGgubWF4KDAsIE1hdGgubWluKHRoaXMub3JpZ2luYWxJbWFnZS5oZWlnaHQsIGNyb3AueSkpLFxuXHRcdFx0d2lkdGg6IE1hdGgubWF4KDEsIE1hdGgubWluKHRoaXMub3JpZ2luYWxJbWFnZS53aWR0aCAtIE1hdGgubWF4KDAsIGNyb3AueCksIGNyb3Aud2lkdGgpKSxcblx0XHRcdGhlaWdodDogTWF0aC5tYXgoMSwgTWF0aC5taW4odGhpcy5vcmlnaW5hbEltYWdlLmhlaWdodCAtIE1hdGgubWF4KDAsIGNyb3AueSksIGNyb3AuaGVpZ2h0KSksXG5cdFx0fTtcblx0XHRjb25zdCBjcm9wQ2FudmFzID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcblx0XHRjcm9wQ2FudmFzLndpZHRoID0gY3Iud2lkdGg7XG5cdFx0Y3JvcENhbnZhcy5oZWlnaHQgPSBjci5oZWlnaHQ7XG5cdFx0Y29uc3QgY3JvcEN0eCA9IGNyb3BDYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XG5cdFx0Y3JvcEN0eC5kcmF3SW1hZ2UodGhpcy5vcmlnaW5hbEltYWdlLmVsZW1lbnQsIGNyLngsIGNyLnksIGNyLndpZHRoLCBjci5oZWlnaHQsIDAsIDAsIGNyLndpZHRoLCBjci5oZWlnaHQpO1xuXG5cdFx0Y29uc3QgY3JvcHBlZEltZyA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW1nJyk7XG5cdFx0Y3JvcHBlZEltZy5vbmxvYWQgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLmltYWdlRWxlbWVudCA9IGNyb3BwZWRJbWc7XG5cdFx0XHR0aGlzLmltYWdlV2lkdGggPSBjcm9wcGVkSW1nLm5hdHVyYWxXaWR0aDtcblx0XHRcdHRoaXMuaW1hZ2VIZWlnaHQgPSBjcm9wcGVkSW1nLm5hdHVyYWxIZWlnaHQ7XG5cdFx0XHR0aGlzLmN1cnJlbnRDcm9wID0gY3I7XG5cdFx0XHR0aGlzLnNpemVDYW52YXMoKTtcblx0XHRcdHRoaXMucmVkcmF3KCk7XG5cdFx0fTtcblx0XHRjcm9wcGVkSW1nLnNyYyA9IGNyb3BDYW52YXMudG9EYXRhVVJMKCdpbWFnZS9wbmcnKTtcblx0fVxuXG5cdHByaXZhdGUgY2FwdHVyZVN0YXRlKCk6IElBbm5vdGF0aW9uRWRpdG9yU3RhdGUge1xuXHRcdGNvbnN0IGlkZW50aXR5TWFwID0gbmV3IE1hcDxJQW5ub3RhdGlvbkRyYXdBY3Rpb24sIElBbm5vdGF0aW9uRHJhd0FjdGlvbj4oKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YWN0aW9uczogdGhpcy5hY3Rpb25zLm1hcChhID0+IGNsb25lRHJhd0FjdGlvbihhLCBpZGVudGl0eU1hcCkpLFxuXHRcdFx0dW5kb25lQWN0aW9uczogdGhpcy51bmRvbmVBY3Rpb25zLm1hcChhID0+IGNsb25lRHJhd0FjdGlvbihhLCBpZGVudGl0eU1hcCkpLFxuXHRcdFx0Y3JvcDogdGhpcy5jdXJyZW50Q3JvcCA/IHsgLi4udGhpcy5jdXJyZW50Q3JvcCB9IDogbnVsbCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBzaXplQ2FudmFzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuY2FudmFzLnBhcmVudEVsZW1lbnQ7XG5cdFx0aWYgKCFjb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBnZXRXaW5kb3codGhpcy5jYW52YXMpO1xuXHRcdGNvbnN0IGRwciA9IHRhcmdldFdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvIHx8IDE7XG5cdFx0Y29uc3QgbWF4V2lkdGggPSBjb250YWluZXIuY2xpZW50V2lkdGggLSBDQU5WQVNfQlJFQVRISU5HX1JPT00gKiAyO1xuXHRcdGNvbnN0IG1heEhlaWdodCA9IGNvbnRhaW5lci5jbGllbnRIZWlnaHQgLSBDQU5WQVNfQlJFQVRISU5HX1JPT00gKiAyO1xuXG5cdFx0Ly8gT25seSBhdXRvLWZpdCBvbiBpbml0aWFsIGxvYWQ7IHJlc3BlY3QgdXNlciB6b29tIGFmdGVyIHRoYXRcblx0XHRpZiAoIXRoaXMuaGFzVXNlclpvb21lZCkge1xuXHRcdFx0Y29uc3Qgc2NhbGVYID0gbWF4V2lkdGggLyB0aGlzLmltYWdlV2lkdGg7XG5cdFx0XHRjb25zdCBzY2FsZVkgPSBtYXhIZWlnaHQgLyB0aGlzLmltYWdlSGVpZ2h0O1xuXHRcdFx0dGhpcy5zY2FsZSA9IE1hdGgubWluKHNjYWxlWCwgc2NhbGVZLCAxKTtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwbGF5V2lkdGggPSBNYXRoLmZsb29yKHRoaXMuaW1hZ2VXaWR0aCAqIHRoaXMuc2NhbGUpO1xuXHRcdGNvbnN0IGRpc3BsYXlIZWlnaHQgPSBNYXRoLmZsb29yKHRoaXMuaW1hZ2VIZWlnaHQgKiB0aGlzLnNjYWxlKTtcblxuXHRcdHRoaXMuY2FudmFzLnN0eWxlLndpZHRoID0gYCR7ZGlzcGxheVdpZHRofXB4YDtcblx0XHR0aGlzLmNhbnZhcy5zdHlsZS5oZWlnaHQgPSBgJHtkaXNwbGF5SGVpZ2h0fXB4YDtcblxuXHRcdC8vIENhcCB0aGUgYmFja2luZyBidWZmZXIgc28gYSAxOTIwXHUwMEQ3MTA4MCBpbWFnZSBhdCA4XHUwMEQ3IHpvb20gKyBkcHIgMiBkb2Vzbid0IHRyeSB0b1xuXHRcdC8vIGFsbG9jYXRlIGEgMzBrXHUwMEQ3MTdrIGNhbnZhcyAofjJHQiBHUFUgbWVtb3J5KSBwZXIgd2hlZWwgdGljay4gV2hlbiB0aGUgbmF0dXJhbFxuXHRcdC8vIGJhY2tpbmcgc2l6ZSBleGNlZWRzIHRoZSBjYXAsIHRoZSBicm93c2VyIENTUy1zdHJldGNoZXMgdGhlIGNhbnZhcyAoc2xpZ2h0XG5cdFx0Ly8gcGl4ZWxhdGlvbiBhdCBleHRyZW1lIHpvb20pIGJ1dCBhbGxvY2F0aW9uIGFuZCBkcmF3aW5nIHN0YXkgY2hlYXAuXG5cdFx0Y29uc3QgTUFYX0JBQ0tJTkdfRElNID0gNDA5Njtcblx0XHRjb25zdCBuYXR1cmFsVyA9IGRpc3BsYXlXaWR0aCAqIGRwcjtcblx0XHRjb25zdCBuYXR1cmFsSCA9IGRpc3BsYXlIZWlnaHQgKiBkcHI7XG5cdFx0Y29uc3Qgb3ZlcmFnZSA9IE1hdGgubWF4KDEsIG5hdHVyYWxXIC8gTUFYX0JBQ0tJTkdfRElNLCBuYXR1cmFsSCAvIE1BWF9CQUNLSU5HX0RJTSk7XG5cdFx0Y29uc3QgZWZmZWN0aXZlRHByID0gZHByIC8gb3ZlcmFnZTtcblx0XHR0aGlzLmNhbnZhcy53aWR0aCA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3IoZGlzcGxheVdpZHRoICogZWZmZWN0aXZlRHByKSk7XG5cdFx0dGhpcy5jYW52YXMuaGVpZ2h0ID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihkaXNwbGF5SGVpZ2h0ICogZWZmZWN0aXZlRHByKSk7XG5cblx0XHR0aGlzLmN0eC5zZXRUcmFuc2Zvcm0oZWZmZWN0aXZlRHByLCAwLCAwLCBlZmZlY3RpdmVEcHIsIDAsIDApO1xuXHR9XG5cblx0cHJpdmF0ZSBjYW52YXNDb29yZHMoZTogUG9pbnRlckV2ZW50KTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcblx0XHRjb25zdCByZWN0ID0gdGhpcy5jYW52YXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHg6IChlLmNsaWVudFggLSByZWN0LmxlZnQpIC8gdGhpcy5zY2FsZSArIHRoaXMuY3JvcE9mZnNldFgsXG5cdFx0XHR5OiAoZS5jbGllbnRZIC0gcmVjdC50b3ApIC8gdGhpcy5zY2FsZSArIHRoaXMuY3JvcE9mZnNldFksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgb25Qb2ludGVyRG93bihlOiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBwb3MgPSB0aGlzLmNhbnZhc0Nvb3JkcyhlKTtcblxuXHRcdC8vIENyb3AgbW9kZTogaGl0IHRlc3QgaGFuZGxlcyBvciBpbnRlcmlvclxuXHRcdGlmICh0aGlzLmNyb3BNb2RlICYmIHRoaXMuY3JvcFJlZ2lvbikge1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5jcm9wSGFuZGxlSGl0VGVzdChwb3MpO1xuXHRcdFx0aWYgKGhhbmRsZSkge1xuXHRcdFx0XHR0aGlzLmNyb3BEcmFnSGFuZGxlID0gaGFuZGxlO1xuXHRcdFx0XHR0aGlzLmNyb3BEcmFnU3RhcnQgPSBwb3M7XG5cdFx0XHRcdHRoaXMuY3JvcFJlZ2lvblN0YXJ0ID0geyAuLi50aGlzLmNyb3BSZWdpb24gfTtcblx0XHRcdFx0dGhpcy5jYW52YXMuc2V0UG9pbnRlckNhcHR1cmUoZS5wb2ludGVySWQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNlbGVjdCB0b29sOiBoaXQgdGVzdCBhbmQgc3RhcnQgZHJhZ1xuXHRcdGlmICh0aGlzLmFjdGl2ZVRvb2wgPT09IEFubm90YXRpb25Ub29sLlNlbGVjdCkge1xuXHRcdFx0Y29uc3QgaGl0SW5kZXggPSB0aGlzLmhpdFRlc3QocG9zKTtcblx0XHRcdHRoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleCA9IGhpdEluZGV4O1xuXHRcdFx0aWYgKGhpdEluZGV4ID49IDApIHtcblx0XHRcdFx0Y29uc3QgaGl0QWN0aW9uID0gdGhpcy5hY3Rpb25zW2hpdEluZGV4XTtcblx0XHRcdFx0dGhpcy5wZW5kaW5nTW92ZSA9IHsgdGFyZ2V0OiBoaXRBY3Rpb24sIGJlZm9yZTogY2FwdHVyZU1vdmVTbmFwc2hvdChoaXRBY3Rpb24pIH07XG5cdFx0XHRcdGlmIChoaXRBY3Rpb24udHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuVGV4dCAmJiB0aGlzLmlzTmVhclRleHRSZXNpemVIYW5kbGUocG9zLCBoaXRBY3Rpb24pKSB7XG5cdFx0XHRcdFx0dGhpcy5pc1Jlc2l6aW5nU2VsZWN0ZWRUZXh0ID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLmRyYWdTdGFydCA9IHsgeDogcG9zLngsIHk6IHBvcy55IH07XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3RlZFRleHRSZXNpemVTdGFydFdpZHRoID0gaGl0QWN0aW9uLnRleHRXaWR0aCA/PyBERUZBVUxUX1RFWFRfQk9YX1dJRFRIO1xuXHRcdFx0XHRcdHRoaXMuY2FudmFzLnNldFBvaW50ZXJDYXB0dXJlKGUucG9pbnRlcklkKTtcblx0XHRcdFx0XHR0aGlzLmNhbnZhcy5zdHlsZS5jdXJzb3IgPSAnZXctcmVzaXplJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmlzRHJhZ2dpbmdTZWxlY3RlZCA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5kcmFnU3RhcnQgPSB7IHg6IHBvcy54LCB5OiBwb3MueSB9O1xuXHRcdFx0XHRcdHRoaXMuY2FudmFzLnNldFBvaW50ZXJDYXB0dXJlKGUucG9pbnRlcklkKTtcblx0XHRcdFx0XHR0aGlzLmNhbnZhcy5zdHlsZS5jdXJzb3IgPSAnbW92ZSc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMucmVkcmF3KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRGVzZWxlY3Qgd2hlbiB1c2luZyBvdGhlciB0b29sc1xuXHRcdHRoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleCA9IC0xO1xuXG5cdFx0Ly8gVGV4dCB0b29sOiBkcmFnIHRvIGRlZmluZSB3aWR0aCwgdGhlbiBlbnRlciB0ZXh0IGVkaXRpbmcuXG5cdFx0aWYgKHRoaXMuYWN0aXZlVG9vbCA9PT0gQW5ub3RhdGlvblRvb2wuVGV4dCkge1xuXHRcdFx0dGhpcy5jb21taXRUZXh0RWRpdCgpO1xuXHRcdFx0dGhpcy50ZXh0UGxhY2VtZW50U3RhdGUgPSB7XG5cdFx0XHRcdHN0YXJ0OiBwb3MsXG5cdFx0XHRcdGN1cnJlbnQ6IHBvcyxcblx0XHRcdFx0cG9pbnRlcklkOiBlLnBvaW50ZXJJZCxcblx0XHRcdH07XG5cdFx0XHR0aGlzLmNhbnZhcy5zZXRQb2ludGVyQ2FwdHVyZShlLnBvaW50ZXJJZCk7XG5cdFx0XHR0aGlzLnJlZHJhdygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEVyYXNlciByZW1vdmVzIGFubm90YXRpb25zIHRoYXQgaW50ZXJzZWN0IHRoZSBwb2ludGVyIHBhdGguXG5cdFx0aWYgKHRoaXMuYWN0aXZlVG9vbCA9PT0gQW5ub3RhdGlvblRvb2wuRXJhc2VyKSB7XG5cdFx0XHR0aGlzLmlzRXJhc2luZyA9IHRydWU7XG5cdFx0XHR0aGlzLmNhbnZhcy5zZXRQb2ludGVyQ2FwdHVyZShlLnBvaW50ZXJJZCk7XG5cdFx0XHR0aGlzLmVyYXNlQXQocG9zKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBQYW4gdG9vbFxuXHRcdGlmICh0aGlzLmFjdGl2ZVRvb2wgPT09IEFubm90YXRpb25Ub29sLlBhbikge1xuXHRcdFx0dGhpcy5pc1Bhbm5pbmcgPSB0cnVlO1xuXHRcdFx0dGhpcy5sYXN0UGFuUG9pbnQgPSB7IHg6IGUuY2xpZW50WCwgeTogZS5jbGllbnRZIH07XG5cdFx0XHR0aGlzLmNhbnZhcy5zZXRQb2ludGVyQ2FwdHVyZShlLnBvaW50ZXJJZCk7XG5cdFx0XHR0aGlzLmNhbnZhcy5zdHlsZS5jdXJzb3IgPSAnZ3JhYmJpbmcnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaXNEcmF3aW5nID0gdHJ1ZTtcblx0XHR0aGlzLmNhbnZhcy5zZXRQb2ludGVyQ2FwdHVyZShlLnBvaW50ZXJJZCk7XG5cblx0XHRzd2l0Y2ggKHRoaXMuYWN0aXZlVG9vbCkge1xuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5GcmVlaGFuZDpcblx0XHRcdFx0dGhpcy5jdXJyZW50QWN0aW9uID0ge1xuXHRcdFx0XHRcdHR5cGU6IEFubm90YXRpb25Ub29sLkZyZWVoYW5kLFxuXHRcdFx0XHRcdHN0cm9rZUNvbG9yOiB0aGlzLmFjdGl2ZVN0cm9rZUNvbG9yLFxuXHRcdFx0XHRcdG9wYWNpdHk6IHRoaXMuYWN0aXZlT3BhY2l0eSxcblx0XHRcdFx0XHRsaW5lV2lkdGg6IHRoaXMuYWN0aXZlTGluZVdpZHRoLFxuXHRcdFx0XHRcdHBvaW50czogW3Bvc10sXG5cdFx0XHRcdH07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5SZWN0YW5nbGU6XG5cdFx0XHRcdHRoaXMuY3VycmVudEFjdGlvbiA9IHtcblx0XHRcdFx0XHR0eXBlOiBBbm5vdGF0aW9uVG9vbC5SZWN0YW5nbGUsXG5cdFx0XHRcdFx0c3Ryb2tlQ29sb3I6IHRoaXMuYWN0aXZlU3Ryb2tlQ29sb3IsXG5cdFx0XHRcdFx0ZmlsbENvbG9yOiB0aGlzLmFjdGl2ZUZpbGxDb2xvcixcblx0XHRcdFx0XHRvcGFjaXR5OiB0aGlzLmFjdGl2ZU9wYWNpdHksXG5cdFx0XHRcdFx0bGluZVdpZHRoOiB0aGlzLmFjdGl2ZUxpbmVXaWR0aCxcblx0XHRcdFx0XHRyZWN0OiB7IHg6IHBvcy54LCB5OiBwb3MueSwgd2lkdGg6IDAsIGhlaWdodDogMCB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuRWxsaXBzZTpcblx0XHRcdFx0dGhpcy5jdXJyZW50QWN0aW9uID0ge1xuXHRcdFx0XHRcdHR5cGU6IEFubm90YXRpb25Ub29sLkVsbGlwc2UsXG5cdFx0XHRcdFx0c3Ryb2tlQ29sb3I6IHRoaXMuYWN0aXZlU3Ryb2tlQ29sb3IsXG5cdFx0XHRcdFx0ZmlsbENvbG9yOiB0aGlzLmFjdGl2ZUZpbGxDb2xvcixcblx0XHRcdFx0XHRvcGFjaXR5OiB0aGlzLmFjdGl2ZU9wYWNpdHksXG5cdFx0XHRcdFx0bGluZVdpZHRoOiB0aGlzLmFjdGl2ZUxpbmVXaWR0aCxcblx0XHRcdFx0XHRlbGxpcHNlUmVjdDogeyB4OiBwb3MueCwgeTogcG9zLnksIHdpZHRoOiAwLCBoZWlnaHQ6IDAgfSxcblx0XHRcdFx0fTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLkFycm93OlxuXHRcdFx0XHR0aGlzLmN1cnJlbnRBY3Rpb24gPSB7XG5cdFx0XHRcdFx0dHlwZTogQW5ub3RhdGlvblRvb2wuQXJyb3csXG5cdFx0XHRcdFx0c3Ryb2tlQ29sb3I6IHRoaXMuYWN0aXZlU3Ryb2tlQ29sb3IsXG5cdFx0XHRcdFx0b3BhY2l0eTogdGhpcy5hY3RpdmVPcGFjaXR5LFxuXHRcdFx0XHRcdGxpbmVXaWR0aDogdGhpcy5hY3RpdmVMaW5lV2lkdGgsXG5cdFx0XHRcdFx0YXJyb3dTdGFydDogcG9zLFxuXHRcdFx0XHRcdGFycm93RW5kOiBwb3MsXG5cdFx0XHRcdH07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Qb2ludGVyTW92ZShlOiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcblx0XHQvLyBDcm9wIG1vZGU6IGRyYWcgaGFuZGxlIG9yIG1vdmUgcmVnaW9uOyBhbHNvIHVwZGF0ZSBjdXJzb3Jcblx0XHRpZiAodGhpcy5jcm9wTW9kZSkge1xuXHRcdFx0Y29uc3QgcG9zID0gdGhpcy5jYW52YXNDb29yZHMoZSk7XG5cdFx0XHRpZiAodGhpcy5jcm9wRHJhZ0hhbmRsZSAmJiB0aGlzLmNyb3BSZWdpb25TdGFydCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNyb3BSZWdpb24ocG9zKTtcblx0XHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVXBkYXRlIGN1cnNvciBiYXNlZCBvbiBob3ZlclxuXHRcdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5jcm9wSGFuZGxlSGl0VGVzdChwb3MpO1xuXHRcdFx0dGhpcy5jYW52YXMuc3R5bGUuY3Vyc29yID0gdGhpcy5jcm9wQ3Vyc29yRm9yKGhhbmRsZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2VsZWN0IHRvb2w6IHJlc2l6ZSBzZWxlY3RlZCB0ZXh0XG5cdFx0aWYgKHRoaXMuaXNSZXNpemluZ1NlbGVjdGVkVGV4dCAmJiB0aGlzLnNlbGVjdGVkQWN0aW9uSW5kZXggPj0gMCkge1xuXHRcdFx0Y29uc3QgcG9zID0gdGhpcy5jYW52YXNDb29yZHMoZSk7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmFjdGlvbnNbdGhpcy5zZWxlY3RlZEFjdGlvbkluZGV4XTtcblx0XHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuVGV4dCkge1xuXHRcdFx0XHRhY3Rpb24udGV4dFdpZHRoID0gTWF0aC5tYXgoTUlOX1RFWFRfQk9YX1dJRFRILCB0aGlzLnNlbGVjdGVkVGV4dFJlc2l6ZVN0YXJ0V2lkdGggKyAocG9zLnggLSB0aGlzLmRyYWdTdGFydC54KSk7XG5cdFx0XHRcdHRoaXMucmVkcmF3KCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2VsZWN0IHRvb2w6IG1vdmUgc2VsZWN0ZWQgZWxlbWVudFxuXHRcdGlmICh0aGlzLmlzRHJhZ2dpbmdTZWxlY3RlZCAmJiB0aGlzLnNlbGVjdGVkQWN0aW9uSW5kZXggPj0gMCkge1xuXHRcdFx0Y29uc3QgcG9zID0gdGhpcy5jYW52YXNDb29yZHMoZSk7XG5cdFx0XHRjb25zdCBkeCA9IHBvcy54IC0gdGhpcy5kcmFnU3RhcnQueDtcblx0XHRcdGNvbnN0IGR5ID0gcG9zLnkgLSB0aGlzLmRyYWdTdGFydC55O1xuXHRcdFx0dGhpcy5tb3ZlQWN0aW9uKHRoaXMuYWN0aW9uc1t0aGlzLnNlbGVjdGVkQWN0aW9uSW5kZXhdLCBkeCwgZHkpO1xuXHRcdFx0dGhpcy5kcmFnU3RhcnQgPSB7IHg6IHBvcy54LCB5OiBwb3MueSB9O1xuXHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBQYW5cblx0XHRpZiAodGhpcy5pc1Bhbm5pbmcpIHtcblx0XHRcdGNvbnN0IGR4ID0gZS5jbGllbnRYIC0gdGhpcy5sYXN0UGFuUG9pbnQueDtcblx0XHRcdGNvbnN0IGR5ID0gZS5jbGllbnRZIC0gdGhpcy5sYXN0UGFuUG9pbnQueTtcblx0XHRcdHRoaXMucGFuWCArPSBkeDtcblx0XHRcdHRoaXMucGFuWSArPSBkeTtcblx0XHRcdHRoaXMubGFzdFBhblBvaW50ID0geyB4OiBlLmNsaWVudFgsIHk6IGUuY2xpZW50WSB9O1xuXHRcdFx0dGhpcy5jbGFtcFBhbigpO1xuXHRcdFx0dGhpcy5jYW52YXMuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke3RoaXMucGFuWH1weCwgJHt0aGlzLnBhbll9cHgpYDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy50ZXh0UGxhY2VtZW50U3RhdGUpIHtcblx0XHRcdGNvbnN0IHBvcyA9IHRoaXMuY2FudmFzQ29vcmRzKGUpO1xuXHRcdFx0dGhpcy50ZXh0UGxhY2VtZW50U3RhdGUuY3VycmVudCA9IHBvcztcblx0XHRcdHRoaXMucmVkcmF3KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNFcmFzaW5nKSB7XG5cdFx0XHRjb25zdCBwb3MgPSB0aGlzLmNhbnZhc0Nvb3JkcyhlKTtcblx0XHRcdHRoaXMuZXJhc2VBdChwb3MpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmFjdGl2ZVRvb2wgPT09IEFubm90YXRpb25Ub29sLlNlbGVjdCAmJiB0aGlzLnNlbGVjdGVkQWN0aW9uSW5kZXggPj0gMCkge1xuXHRcdFx0Y29uc3QgcG9zID0gdGhpcy5jYW52YXNDb29yZHMoZSk7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmFjdGlvbnNbdGhpcy5zZWxlY3RlZEFjdGlvbkluZGV4XTtcblx0XHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuVGV4dCAmJiB0aGlzLmlzTmVhclRleHRSZXNpemVIYW5kbGUocG9zLCBhY3Rpb24pKSB7XG5cdFx0XHRcdHRoaXMuY2FudmFzLnN0eWxlLmN1cnNvciA9ICdldy1yZXNpemUnO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnNlbGVjdGVkQWN0aW9uSW5kZXggPj0gMCkge1xuXHRcdFx0XHR0aGlzLmNhbnZhcy5zdHlsZS5jdXJzb3IgPSAnZGVmYXVsdCc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmlzRHJhd2luZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvcyA9IHRoaXMuY2FudmFzQ29vcmRzKGUpO1xuXG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRBY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKHRoaXMuY3VycmVudEFjdGlvbi50eXBlKSB7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLkZyZWVoYW5kOlxuXHRcdFx0XHR0aGlzLmN1cnJlbnRBY3Rpb24ucG9pbnRzIS5wdXNoKHBvcyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5SZWN0YW5nbGU6IHtcblx0XHRcdFx0Y29uc3QgcmVjdCA9IHRoaXMuY3VycmVudEFjdGlvbi5yZWN0ITtcblx0XHRcdFx0Ly8gTXV0YXRlIHRoZSByZWN0IG9uIHRoZSBjdXJyZW50IGFjdGlvbiAodGhpcyBpcyB0aGUgaW4tcHJvZ3Jlc3MgZHJhd2luZylcblx0XHRcdFx0KHRoaXMuY3VycmVudEFjdGlvbiBhcyB7IHJlY3Q6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0gfSkucmVjdCA9IHtcblx0XHRcdFx0XHQuLi5yZWN0LFxuXHRcdFx0XHRcdHdpZHRoOiBwb3MueCAtIHJlY3QueCxcblx0XHRcdFx0XHRoZWlnaHQ6IHBvcy55IC0gcmVjdC55LFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuRWxsaXBzZToge1xuXHRcdFx0XHRjb25zdCBlciA9IHRoaXMuY3VycmVudEFjdGlvbi5lbGxpcHNlUmVjdCE7XG5cdFx0XHRcdGxldCB3ID0gcG9zLnggLSBlci54O1xuXHRcdFx0XHRsZXQgaCA9IHBvcy55IC0gZXIueTtcblx0XHRcdFx0aWYgKGUuc2hpZnRLZXkpIHtcblx0XHRcdFx0XHRjb25zdCBzaXplID0gTWF0aC5tYXgoTWF0aC5hYnModyksIE1hdGguYWJzKGgpKTtcblx0XHRcdFx0XHR3ID0gTWF0aC5zaWduKHcpICogc2l6ZTtcblx0XHRcdFx0XHRoID0gTWF0aC5zaWduKGgpICogc2l6ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQodGhpcy5jdXJyZW50QWN0aW9uIGFzIHsgZWxsaXBzZVJlY3Q6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0gfSkuZWxsaXBzZVJlY3QgPSB7IC4uLmVyLCB3aWR0aDogdywgaGVpZ2h0OiBoIH07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5BcnJvdzpcblx0XHRcdFx0KHRoaXMuY3VycmVudEFjdGlvbiBhcyB7IGFycm93RW5kOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfSkuYXJyb3dFbmQgPSBwb3M7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHRoaXMucmVkcmF3KCk7XG5cdH1cblxuXHRwcml2YXRlIG9uUG9pbnRlclVwKGU6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuXHRcdC8vIENyb3AgbW9kZTogZW5kIGhhbmRsZSBkcmFnXG5cdFx0aWYgKHRoaXMuY3JvcE1vZGUgJiYgdGhpcy5jcm9wRHJhZ0hhbmRsZSkge1xuXHRcdFx0dGhpcy5jcm9wRHJhZ0hhbmRsZSA9IG51bGw7XG5cdFx0XHR0aGlzLmNyb3BSZWdpb25TdGFydCA9IG51bGw7XG5cdFx0XHR0aGlzLmNhbnZhcy5yZWxlYXNlUG9pbnRlckNhcHR1cmUoZS5wb2ludGVySWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNlbGVjdCB0b29sOiBlbmQgZHJhZ1xuXHRcdGlmICh0aGlzLmlzUmVzaXppbmdTZWxlY3RlZFRleHQpIHtcblx0XHRcdHRoaXMuaXNSZXNpemluZ1NlbGVjdGVkVGV4dCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5jYW52YXMucmVsZWFzZVBvaW50ZXJDYXB0dXJlKGUucG9pbnRlcklkKTtcblx0XHRcdHRoaXMuY2FudmFzLnN0eWxlLmN1cnNvciA9ICdkZWZhdWx0Jztcblx0XHRcdHRoaXMuY29tbWl0UGVuZGluZ01vdmUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTZWxlY3QgdG9vbDogZW5kIGRyYWdcblx0XHRpZiAodGhpcy5pc0RyYWdnaW5nU2VsZWN0ZWQpIHtcblx0XHRcdHRoaXMuaXNEcmFnZ2luZ1NlbGVjdGVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLmNhbnZhcy5yZWxlYXNlUG9pbnRlckNhcHR1cmUoZS5wb2ludGVySWQpO1xuXHRcdFx0dGhpcy5jYW52YXMuc3R5bGUuY3Vyc29yID0gJ2RlZmF1bHQnO1xuXHRcdFx0dGhpcy5jb21taXRQZW5kaW5nTW92ZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFBhblxuXHRcdGlmICh0aGlzLmlzUGFubmluZykge1xuXHRcdFx0dGhpcy5pc1Bhbm5pbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuY2FudmFzLnJlbGVhc2VQb2ludGVyQ2FwdHVyZShlLnBvaW50ZXJJZCk7XG5cdFx0XHR0aGlzLmNhbnZhcy5zdHlsZS5jdXJzb3IgPSB0aGlzLmFjdGl2ZVRvb2wgPT09IEFubm90YXRpb25Ub29sLlBhbiA/ICdncmFiJyA6ICdjcm9zc2hhaXInO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzRXJhc2luZykge1xuXHRcdFx0dGhpcy5pc0VyYXNpbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuY2FudmFzLnJlbGVhc2VQb2ludGVyQ2FwdHVyZShlLnBvaW50ZXJJZCk7XG5cdFx0XHRpZiAodGhpcy5wZW5kaW5nRXJhc2VBY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5hY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6IEFubm90YXRpb25Ub29sLkVyYXNlcixcblx0XHRcdFx0XHRzdHJva2VDb2xvcjogJycsXG5cdFx0XHRcdFx0b3BhY2l0eTogMSxcblx0XHRcdFx0XHRsaW5lV2lkdGg6IDAsXG5cdFx0XHRcdFx0ZXJhc2VkQWN0aW9uczogdGhpcy5wZW5kaW5nRXJhc2VBY3Rpb25zLnNsaWNlKCksXG5cdFx0XHRcdFx0ZXJhc2VkSW5kaWNlczogdGhpcy5wZW5kaW5nRXJhc2VJbmRpY2VzLnNsaWNlKCksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLnBlbmRpbmdFcmFzZUFjdGlvbnMgPSBbXTtcblx0XHRcdFx0dGhpcy5wZW5kaW5nRXJhc2VJbmRpY2VzID0gW107XG5cdFx0XHRcdHRoaXMudW5kb25lQWN0aW9ucy5sZW5ndGggPSAwO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVVuZG9SZWRvU3RhdGUoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy50ZXh0UGxhY2VtZW50U3RhdGUpIHtcblx0XHRcdGNvbnN0IHsgc3RhcnQsIGN1cnJlbnQsIHBvaW50ZXJJZCB9ID0gdGhpcy50ZXh0UGxhY2VtZW50U3RhdGU7XG5cdFx0XHRpZiAocG9pbnRlcklkID09PSBlLnBvaW50ZXJJZCkge1xuXHRcdFx0XHR0aGlzLmNhbnZhcy5yZWxlYXNlUG9pbnRlckNhcHR1cmUoZS5wb2ludGVySWQpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZHggPSBjdXJyZW50LnggLSBzdGFydC54O1xuXHRcdFx0Y29uc3QgZGlkRHJhZyA9IE1hdGguYWJzKGR4KSA+PSBURVhUX0RSQUdfVEhSRVNIT0xEO1xuXHRcdFx0Y29uc3QgeCA9IGRpZERyYWcgPyBNYXRoLm1pbihzdGFydC54LCBjdXJyZW50LngpIDogc3RhcnQueDtcblx0XHRcdGNvbnN0IHJhd1dpZHRoID0gZGlkRHJhZyA/IE1hdGguYWJzKGR4KSA6IHRoaXMuZ2V0TWF4VGV4dFdpZHRoRnJvbShzdGFydC54KTtcblx0XHRcdGNvbnN0IHdpZHRoID0gZGlkRHJhZ1xuXHRcdFx0XHQ/IE1hdGgubWF4KDEsIE1hdGgubWluKHJhd1dpZHRoLCB0aGlzLmdldFRleHRJbWFnZVJpZ2h0KCkgLSB4KSlcblx0XHRcdFx0OiByYXdXaWR0aDtcblx0XHRcdGNvbnN0IHkgPSBzdGFydC55O1xuXHRcdFx0dGhpcy50ZXh0UGxhY2VtZW50U3RhdGUgPSBudWxsO1xuXHRcdFx0dGhpcy5zdGFydFRleHRFZGl0KHsgeCwgeSB9LCB3aWR0aCwgZGlkRHJhZyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmlzRHJhd2luZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNhbnZhcy5yZWxlYXNlUG9pbnRlckNhcHR1cmUoZS5wb2ludGVySWQpO1xuXHRcdHRoaXMuaXNEcmF3aW5nID0gZmFsc2U7XG5cblx0XHRpZiAodGhpcy5jdXJyZW50QWN0aW9uKSB7XG5cdFx0XHR0aGlzLmFjdGlvbnMucHVzaCh0aGlzLmN1cnJlbnRBY3Rpb24pO1xuXHRcdFx0dGhpcy51bmRvbmVBY3Rpb25zLmxlbmd0aCA9IDA7XG5cdFx0XHR0aGlzLnVwZGF0ZVVuZG9SZWRvU3RhdGUoKTtcblx0XHRcdHRoaXMuY3VycmVudEFjdGlvbiA9IG51bGw7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZWRyYXcoKTtcblx0fVxuXG5cdHByaXZhdGUgZXJhc2VBdChwb3M6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdGNvbnN0IGhpdEluZGV4ID0gdGhpcy5oaXRUZXN0KHBvcyk7XG5cdFx0aWYgKGhpdEluZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBbZXJhc2VkXSA9IHRoaXMuYWN0aW9ucy5zcGxpY2UoaGl0SW5kZXgsIDEpO1xuXHRcdHRoaXMucGVuZGluZ0VyYXNlQWN0aW9ucy5wdXNoKGVyYXNlZCk7XG5cdFx0dGhpcy5wZW5kaW5nRXJhc2VJbmRpY2VzLnB1c2goaGl0SW5kZXgpO1xuXHRcdHRoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleCA9IC0xO1xuXHRcdHRoaXMucmVkcmF3KCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbW1pdFBlbmRpbmdNb3ZlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLnBlbmRpbmdNb3ZlO1xuXHRcdHRoaXMucGVuZGluZ01vdmUgPSBudWxsO1xuXHRcdGlmICghcGVuZGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhZnRlciA9IGNhcHR1cmVNb3ZlU25hcHNob3QocGVuZGluZy50YXJnZXQpO1xuXHRcdGlmIChtb3ZlU25hcHNob3RzRXF1YWwocGVuZGluZy5iZWZvcmUsIGFmdGVyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmFjdGlvbnMucHVzaCh7XG5cdFx0XHR0eXBlOiBBbm5vdGF0aW9uVG9vbC5Nb3ZlLFxuXHRcdFx0c3Ryb2tlQ29sb3I6ICcnLFxuXHRcdFx0b3BhY2l0eTogMSxcblx0XHRcdGxpbmVXaWR0aDogMCxcblx0XHRcdG1vdmVUYXJnZXQ6IHBlbmRpbmcudGFyZ2V0LFxuXHRcdFx0bW92ZUJlZm9yZTogcGVuZGluZy5iZWZvcmUsXG5cdFx0XHRtb3ZlQWZ0ZXI6IGFmdGVyLFxuXHRcdH0pO1xuXHRcdHRoaXMudW5kb25lQWN0aW9ucy5sZW5ndGggPSAwO1xuXHRcdHRoaXMudXBkYXRlVW5kb1JlZG9TdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVVbmRvUmVkb1N0YXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnVuZG9CdG4pIHtcblx0XHRcdHRoaXMudW5kb0J0bi5kaXNhYmxlZCA9IHRoaXMuYWN0aW9ucy5sZW5ndGggPT09IDA7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnJlZG9CdG4pIHtcblx0XHRcdHRoaXMucmVkb0J0bi5kaXNhYmxlZCA9IHRoaXMudW5kb25lQWN0aW9ucy5sZW5ndGggPT09IDA7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1bmRvKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnRleHRQbGFjZW1lbnRTdGF0ZSkge1xuXHRcdFx0dGhpcy5jYW5jZWxUZXh0UGxhY2VtZW50KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLnRleHRFZGl0U3RhdGUpIHtcblx0XHRcdHRoaXMuY2FuY2VsVGV4dEVkaXQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aW9uID0gdGhpcy5hY3Rpb25zLnBvcCgpO1xuXHRcdGlmICghYWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuRXJhc2VyICYmIGFjdGlvbi5lcmFzZWRBY3Rpb25zKSB7XG5cdFx0XHQvLyBSZS1pbnNlcnQgZWFjaCBlcmFzZWQgYWN0aW9uIGF0IHRoZSBpbmRleCBpdCBvY2N1cGllZCBhdCB0aGUgbW9tZW50IGl0IHdhcyByZW1vdmVkLlxuXHRcdFx0Ly8gSXRlcmF0ZSBpbiByZXZlcnNlIGJlY2F1c2UgZWFjaCBlcmFzZSBzcGxpY2Ugd2FzIHJlbGF0aXZlIHRvIHRoZSBhcnJheSBzdGF0ZSBhZnRlclxuXHRcdFx0Ly8gdGhlIHByZXZpb3VzIG9uZSwgc28gdW53aW5kaW5nIG11c3QgaGFwcGVuIGluIHJldmVyc2Ugb3JkZXIgdG8gcmVzdG9yZSBwb3NpdGlvbnMuXG5cdFx0XHRjb25zdCBlcmFzZWQgPSBhY3Rpb24uZXJhc2VkQWN0aW9ucztcblx0XHRcdGNvbnN0IGluZGljZXMgPSBhY3Rpb24uZXJhc2VkSW5kaWNlcyA/PyBlcmFzZWQubWFwKCgpID0+IHRoaXMuYWN0aW9ucy5sZW5ndGgpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IGVyYXNlZC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRjb25zdCBpZHggPSBNYXRoLm1pbihpbmRpY2VzW2ldLCB0aGlzLmFjdGlvbnMubGVuZ3RoKTtcblx0XHRcdFx0dGhpcy5hY3Rpb25zLnNwbGljZShpZHgsIDAsIGVyYXNlZFtpXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMudW5kb25lQWN0aW9ucy5wdXNoKGFjdGlvbik7XG5cdFx0dGhpcy51cGRhdGVVbmRvUmVkb1N0YXRlKCk7XG5cdFx0dGhpcy5zZWxlY3RlZEFjdGlvbkluZGV4ID0gLTE7XG5cdFx0aWYgKGFjdGlvbi50eXBlID09PSBBbm5vdGF0aW9uVG9vbC5Dcm9wKSB7XG5cdFx0XHR0aGlzLmFwcGx5RGlzcGxheWVkQ3JvcChhY3Rpb24uY3JvcEZyb20gPz8gbnVsbCk7XG5cdFx0fSBlbHNlIGlmIChhY3Rpb24udHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuTW92ZSAmJiBhY3Rpb24ubW92ZVRhcmdldCAmJiBhY3Rpb24ubW92ZUJlZm9yZSkge1xuXHRcdFx0YXBwbHlNb3ZlU25hcHNob3QoYWN0aW9uLm1vdmVUYXJnZXQsIGFjdGlvbi5tb3ZlQmVmb3JlKTtcblx0XHRcdHRoaXMucmVkcmF3KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVkcmF3KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWRvKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnRleHRQbGFjZW1lbnRTdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy50ZXh0RWRpdFN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMudW5kb25lQWN0aW9ucy5wb3AoKTtcblx0XHRpZiAoIWFjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFubm90YXRpb25Ub29sLkVyYXNlciAmJiBhY3Rpb24uZXJhc2VkQWN0aW9ucykge1xuXHRcdFx0Ly8gUmUtYXBwbHkgdGhlIGVyYXNlOiByZW1vdmUgdGhlIHJlLWluc2VydGVkIGFjdGlvbnMgYnkgcmVmZXJlbmNlLlxuXHRcdFx0Zm9yIChjb25zdCBlcmFzZWQgb2YgYWN0aW9uLmVyYXNlZEFjdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgaWR4ID0gdGhpcy5hY3Rpb25zLmluZGV4T2YoZXJhc2VkKTtcblx0XHRcdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5hY3Rpb25zLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuYWN0aW9ucy5wdXNoKGFjdGlvbik7XG5cdFx0dGhpcy5zZWxlY3RlZEFjdGlvbkluZGV4ID0gLTE7XG5cdFx0dGhpcy51cGRhdGVVbmRvUmVkb1N0YXRlKCk7XG5cdFx0aWYgKGFjdGlvbi50eXBlID09PSBBbm5vdGF0aW9uVG9vbC5Dcm9wKSB7XG5cdFx0XHR0aGlzLmFwcGx5RGlzcGxheWVkQ3JvcChhY3Rpb24uY3JvcFRvID8/IG51bGwpO1xuXHRcdH0gZWxzZSBpZiAoYWN0aW9uLnR5cGUgPT09IEFubm90YXRpb25Ub29sLk1vdmUgJiYgYWN0aW9uLm1vdmVUYXJnZXQgJiYgYWN0aW9uLm1vdmVBZnRlcikge1xuXHRcdFx0YXBwbHlNb3ZlU25hcHNob3QoYWN0aW9uLm1vdmVUYXJnZXQsIGFjdGlvbi5tb3ZlQWZ0ZXIpO1xuXHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyb3BIYW5kbGVIaXRUZXN0KHBvczogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogJ253JyB8ICduJyB8ICduZScgfCAnZScgfCAnc2UnIHwgJ3MnIHwgJ3N3JyB8ICd3JyB8ICdtb3ZlJyB8IG51bGwge1xuXHRcdGlmICghdGhpcy5jcm9wUmVnaW9uKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgciA9IHRoaXMubm9ybWFsaXplQ3JvcFJlY3QodGhpcy5jcm9wUmVnaW9uKTtcblx0XHQvLyBDb252ZXJ0IGhhbmRsZSBwaXhlbCBzaXplIHRvIGltYWdlIGNvb3Jkc1xuXHRcdGNvbnN0IGhhbmRsZVB4ID0gMTI7XG5cdFx0Y29uc3QgdG9sID0gaGFuZGxlUHggLyB0aGlzLnNjYWxlO1xuXHRcdGNvbnN0IGN4ID0gci54ICsgci53aWR0aCAvIDI7XG5cdFx0Y29uc3QgY3kgPSByLnkgKyByLmhlaWdodCAvIDI7XG5cdFx0Y29uc3QgaGFuZGxlczogeyBuYW1lOiAnbncnIHwgJ24nIHwgJ25lJyB8ICdlJyB8ICdzZScgfCAncycgfCAnc3cnIHwgJ3cnOyB4OiBudW1iZXI7IHk6IG51bWJlciB9W10gPSBbXG5cdFx0XHR7IG5hbWU6ICdudycsIHg6IHIueCwgeTogci55IH0sXG5cdFx0XHR7IG5hbWU6ICduJywgeDogY3gsIHk6IHIueSB9LFxuXHRcdFx0eyBuYW1lOiAnbmUnLCB4OiByLnggKyByLndpZHRoLCB5OiByLnkgfSxcblx0XHRcdHsgbmFtZTogJ2UnLCB4OiByLnggKyByLndpZHRoLCB5OiBjeSB9LFxuXHRcdFx0eyBuYW1lOiAnc2UnLCB4OiByLnggKyByLndpZHRoLCB5OiByLnkgKyByLmhlaWdodCB9LFxuXHRcdFx0eyBuYW1lOiAncycsIHg6IGN4LCB5OiByLnkgKyByLmhlaWdodCB9LFxuXHRcdFx0eyBuYW1lOiAnc3cnLCB4OiByLngsIHk6IHIueSArIHIuaGVpZ2h0IH0sXG5cdFx0XHR7IG5hbWU6ICd3JywgeDogci54LCB5OiBjeSB9LFxuXHRcdF07XG5cdFx0Zm9yIChjb25zdCBoIG9mIGhhbmRsZXMpIHtcblx0XHRcdGlmIChNYXRoLmFicyhwb3MueCAtIGgueCkgPD0gdG9sICYmIE1hdGguYWJzKHBvcy55IC0gaC55KSA8PSB0b2wpIHtcblx0XHRcdFx0cmV0dXJuIGgubmFtZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gSW5zaWRlIHJlZ2lvbiBcdTIxOTIgbW92ZVxuXHRcdGlmIChwb3MueCA+PSByLnggJiYgcG9zLnggPD0gci54ICsgci53aWR0aCAmJiBwb3MueSA+PSByLnkgJiYgcG9zLnkgPD0gci55ICsgci5oZWlnaHQpIHtcblx0XHRcdHJldHVybiAnbW92ZSc7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBjcm9wQ3Vyc29yRm9yKGhhbmRsZTogJ253JyB8ICduJyB8ICduZScgfCAnZScgfCAnc2UnIHwgJ3MnIHwgJ3N3JyB8ICd3JyB8ICdtb3ZlJyB8IG51bGwpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAoaGFuZGxlKSB7XG5cdFx0XHRjYXNlICdudyc6XG5cdFx0XHRjYXNlICdzZSc6IHJldHVybiAnbndzZS1yZXNpemUnO1xuXHRcdFx0Y2FzZSAnbmUnOlxuXHRcdFx0Y2FzZSAnc3cnOiByZXR1cm4gJ25lc3ctcmVzaXplJztcblx0XHRcdGNhc2UgJ24nOlxuXHRcdFx0Y2FzZSAncyc6IHJldHVybiAnbnMtcmVzaXplJztcblx0XHRcdGNhc2UgJ2UnOlxuXHRcdFx0Y2FzZSAndyc6IHJldHVybiAnZXctcmVzaXplJztcblx0XHRcdGNhc2UgJ21vdmUnOiByZXR1cm4gJ21vdmUnO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuICdkZWZhdWx0Jztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNyb3BSZWdpb24ocG9zOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY3JvcFJlZ2lvblN0YXJ0IHx8ICF0aGlzLmNyb3BEcmFnSGFuZGxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGR4ID0gcG9zLnggLSB0aGlzLmNyb3BEcmFnU3RhcnQueDtcblx0XHRjb25zdCBkeSA9IHBvcy55IC0gdGhpcy5jcm9wRHJhZ1N0YXJ0Lnk7XG5cdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLmNyb3BSZWdpb25TdGFydDtcblxuXHRcdC8vIFRyYW5zbGF0aW5nIHRoZSBlbnRpcmUgYm94OiBrZWVwIGRpbWVuc2lvbnMgZml4ZWQgYW5kIGNsYW1wIG9ubHkgdGhlIHBvc2l0aW9uLlxuXHRcdGlmICh0aGlzLmNyb3BEcmFnSGFuZGxlID09PSAnbW92ZScpIHtcblx0XHRcdGNvbnN0IHggPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLmltYWdlV2lkdGggLSBzdGFydC53aWR0aCwgc3RhcnQueCArIGR4KSk7XG5cdFx0XHRjb25zdCB5ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odGhpcy5pbWFnZUhlaWdodCAtIHN0YXJ0LmhlaWdodCwgc3RhcnQueSArIGR5KSk7XG5cdFx0XHR0aGlzLmNyb3BSZWdpb24gPSB7IHgsIHksIHdpZHRoOiBzdGFydC53aWR0aCwgaGVpZ2h0OiBzdGFydC5oZWlnaHQgfTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgeyB4LCB5LCB3aWR0aCwgaGVpZ2h0IH0gPSBzdGFydDtcblx0XHRzd2l0Y2ggKHRoaXMuY3JvcERyYWdIYW5kbGUpIHtcblx0XHRcdGNhc2UgJ253Jzpcblx0XHRcdFx0eCArPSBkeDsgeSArPSBkeTsgd2lkdGggLT0gZHg7IGhlaWdodCAtPSBkeTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICduJzpcblx0XHRcdFx0eSArPSBkeTsgaGVpZ2h0IC09IGR5O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ25lJzpcblx0XHRcdFx0eSArPSBkeTsgd2lkdGggKz0gZHg7IGhlaWdodCAtPSBkeTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdlJzpcblx0XHRcdFx0d2lkdGggKz0gZHg7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnc2UnOlxuXHRcdFx0XHR3aWR0aCArPSBkeDsgaGVpZ2h0ICs9IGR5O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3MnOlxuXHRcdFx0XHRoZWlnaHQgKz0gZHk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnc3cnOlxuXHRcdFx0XHR4ICs9IGR4OyB3aWR0aCAtPSBkeDsgaGVpZ2h0ICs9IGR5O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3cnOlxuXHRcdFx0XHR4ICs9IGR4OyB3aWR0aCAtPSBkeDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdC8vIENsYW1wIHRvIGltYWdlIGJvdW5kc1xuXHRcdHggPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLmltYWdlV2lkdGgsIHgpKTtcblx0XHR5ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odGhpcy5pbWFnZUhlaWdodCwgeSkpO1xuXHRcdHdpZHRoID0gTWF0aC5tYXgoMTAsIE1hdGgubWluKHRoaXMuaW1hZ2VXaWR0aCAtIHgsIHdpZHRoKSk7XG5cdFx0aGVpZ2h0ID0gTWF0aC5tYXgoMTAsIE1hdGgubWluKHRoaXMuaW1hZ2VIZWlnaHQgLSB5LCBoZWlnaHQpKTtcblx0XHR0aGlzLmNyb3BSZWdpb24gPSB7IHgsIHksIHdpZHRoLCBoZWlnaHQgfTtcblx0fVxuXG5cdHByaXZhdGUgbm9ybWFsaXplQ3JvcFJlY3QocjogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHR4OiByLndpZHRoIDwgMCA/IHIueCArIHIud2lkdGggOiByLngsXG5cdFx0XHR5OiByLmhlaWdodCA8IDAgPyByLnkgKyByLmhlaWdodCA6IHIueSxcblx0XHRcdHdpZHRoOiBNYXRoLmFicyhyLndpZHRoKSxcblx0XHRcdGhlaWdodDogTWF0aC5hYnMoci5oZWlnaHQpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXJ0VGV4dEVkaXQocG9zOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIHdpZHRoOiBudW1iZXIsIHNob3dCb3hPdXRsaW5lOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5jb21taXRUZXh0RWRpdCgpO1xuXG5cdFx0Y29uc3QgZWRpdG9yID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZXh0YXJlYScpO1xuXHRcdGVkaXRvci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgndHlwZVRleHQnLCBcIlR5cGUgdGV4dFwiKSk7XG5cdFx0ZWRpdG9yLnNldEF0dHJpYnV0ZSgnd3JhcCcsICdvZmYnKTtcblx0XHRlZGl0b3Iuc3R5bGUucG9zaXRpb24gPSAnZml4ZWQnO1xuXHRcdGVkaXRvci5zdHlsZS5sZWZ0ID0gJy0xMDAwMHB4Jztcblx0XHRlZGl0b3Iuc3R5bGUudG9wID0gJzAnO1xuXHRcdGVkaXRvci5zdHlsZS53aWR0aCA9ICcxcHgnO1xuXHRcdGVkaXRvci5zdHlsZS5oZWlnaHQgPSAnMXB4Jztcblx0XHRlZGl0b3Iuc3R5bGUub3BhY2l0eSA9ICcwJztcblx0XHRlZGl0b3Iuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJztcblx0XHRlZGl0b3Iuc3R5bGUucGFkZGluZyA9ICcwJztcblx0XHRlZGl0b3Iuc3R5bGUuYm9yZGVyID0gJzAnO1xuXHRcdGVkaXRvci5zdHlsZS5tYXJnaW4gPSAnMCc7XG5cdFx0ZWRpdG9yLnN0eWxlLnJlc2l6ZSA9ICdub25lJztcblx0XHRlZGl0b3Iuc3R5bGUub3ZlcmZsb3cgPSAnaGlkZGVuJztcblx0XHR0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZChlZGl0b3IpO1xuXG5cdFx0dGhpcy50ZXh0RWRpdFN0YXRlID0ge1xuXHRcdFx0cG9zLFxuXHRcdFx0dGV4dDogJycsXG5cdFx0XHRjYXJldEluZGV4OiAwLFxuXHRcdFx0c3Ryb2tlQ29sb3I6IHRoaXMuYWN0aXZlU3Ryb2tlQ29sb3IsXG5cdFx0XHRmaWxsQ29sb3I6IHRoaXMuYWN0aXZlRmlsbENvbG9yLFxuXHRcdFx0b3BhY2l0eTogdGhpcy5hY3RpdmVPcGFjaXR5LFxuXHRcdFx0Zm9udFNpemU6IHRoaXMuYWN0aXZlRm9udFNpemUsXG5cdFx0XHRmb250RmFtaWx5OiB0aGlzLmFjdGl2ZUZvbnRGYW1pbHksXG5cdFx0XHR3aWR0aCxcblx0XHRcdHNob3dCb3hPdXRsaW5lLFxuXHRcdH07XG5cdFx0dGhpcy50ZXh0RWRpdG9yID0gZWRpdG9yO1xuXHRcdHRoaXMuc3RhcnRUZXh0Q2FyZXRCbGluaygpO1xuXG5cdFx0Y29uc3Qgc3luYyA9ICgpID0+IHtcblx0XHRcdGlmICghdGhpcy50ZXh0RWRpdFN0YXRlIHx8IHRoaXMudGV4dEVkaXRvciAhPT0gZWRpdG9yKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMudGV4dEVkaXRTdGF0ZS50ZXh0ID0gZWRpdG9yLnZhbHVlO1xuXHRcdFx0dGhpcy50ZXh0RWRpdFN0YXRlLmNhcmV0SW5kZXggPSBlZGl0b3Iuc2VsZWN0aW9uU3RhcnQgPz8gZWRpdG9yLnZhbHVlLmxlbmd0aDtcblx0XHRcdHRoaXMudGV4dENhcmV0VmlzaWJsZSA9IHRydWU7XG5cdFx0XHR0aGlzLnJlZHJhdygpO1xuXHRcdH07XG5cblx0XHRlZGl0b3IuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBzeW5jKTtcblx0XHRlZGl0b3IuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCBzeW5jKTtcblx0XHRlZGl0b3IuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBzeW5jKTtcblx0XHRlZGl0b3IuYWRkRXZlbnRMaXN0ZW5lcignc2VsZWN0Jywgc3luYyk7XG5cdFx0ZWRpdG9yLmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgJiYgKGUuY3RybEtleSB8fCBlLm1ldGFLZXkpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0dGhpcy5jb21taXRUZXh0RWRpdCgpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR0aGlzLmNhbmNlbFRleHRFZGl0KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0ZWRpdG9yLmFkZEV2ZW50TGlzdGVuZXIoJ2JsdXInLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy50ZXh0RWRpdG9yID09PSBlZGl0b3IpIHtcblx0XHRcdFx0dGhpcy5jb21taXRUZXh0RWRpdCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy50ZXh0RWRpdG9yID09PSBlZGl0b3IpIHtcblx0XHRcdFx0ZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25SYW5nZShlZGl0b3IudmFsdWUubGVuZ3RoLCBlZGl0b3IudmFsdWUubGVuZ3RoKTtcblx0XHRcdH1cblx0XHR9LCAwKTtcblxuXHRcdHRoaXMucmVkcmF3KCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXJ0VGV4dENhcmV0QmxpbmsoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudGV4dENhcmV0SW50ZXJ2YWwgIT09IG51bGwpIHtcblx0XHRcdGdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcikuY2xlYXJJbnRlcnZhbCh0aGlzLnRleHRDYXJldEludGVydmFsKTtcblx0XHR9XG5cdFx0dGhpcy50ZXh0Q2FyZXRWaXNpYmxlID0gdHJ1ZTtcblx0XHR0aGlzLnRleHRDYXJldEludGVydmFsID0gZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKS5zZXRJbnRlcnZhbCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMudGV4dEVkaXRTdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRleHRDYXJldFZpc2libGUgPSAhdGhpcy50ZXh0Q2FyZXRWaXNpYmxlO1xuXHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHR9LCA1MDApO1xuXHR9XG5cblx0cHJpdmF0ZSBzdG9wVGV4dENhcmV0QmxpbmsoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudGV4dENhcmV0SW50ZXJ2YWwgIT09IG51bGwpIHtcblx0XHRcdGdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcikuY2xlYXJJbnRlcnZhbCh0aGlzLnRleHRDYXJldEludGVydmFsKTtcblx0XHRcdHRoaXMudGV4dENhcmV0SW50ZXJ2YWwgPSBudWxsO1xuXHRcdH1cblx0XHR0aGlzLnRleHRDYXJldFZpc2libGUgPSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21taXRUZXh0RWRpdCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudGV4dEVkaXRTdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgdGV4dCwgcG9zLCBzdHJva2VDb2xvciwgZmlsbENvbG9yLCBvcGFjaXR5LCBmb250RmFtaWx5LCBmb250U2l6ZSwgd2lkdGggfSA9IHRoaXMudGV4dEVkaXRTdGF0ZTtcblx0XHR0aGlzLmNsZWFudXBUZXh0RWRpdG9yKCk7XG5cdFx0aWYgKHRleHQudHJpbSgpKSB7XG5cdFx0XHR0aGlzLmFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdHR5cGU6IEFubm90YXRpb25Ub29sLlRleHQsXG5cdFx0XHRcdHN0cm9rZUNvbG9yLFxuXHRcdFx0XHRmaWxsQ29sb3IsXG5cdFx0XHRcdG9wYWNpdHksXG5cdFx0XHRcdGxpbmVXaWR0aDogMSxcblx0XHRcdFx0Zm9udFNpemUsXG5cdFx0XHRcdGZvbnRGYW1pbHksXG5cdFx0XHRcdHRleHQsXG5cdFx0XHRcdHRleHRQb3M6IHBvcyxcblx0XHRcdFx0dGV4dFdpZHRoOiB3aWR0aCxcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy51bmRvbmVBY3Rpb25zLmxlbmd0aCA9IDA7XG5cdFx0XHR0aGlzLnVwZGF0ZVVuZG9SZWRvU3RhdGUoKTtcblx0XHR9XG5cdFx0dGhpcy5yZWRyYXcoKTtcblx0fVxuXG5cdHByaXZhdGUgY2FuY2VsVGV4dEVkaXQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnRleHRFZGl0U3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jbGVhbnVwVGV4dEVkaXRvcigpO1xuXHRcdHRoaXMucmVkcmF3KCk7XG5cdH1cblxuXHRwcml2YXRlIGNhbmNlbFRleHRQbGFjZW1lbnQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnRleHRQbGFjZW1lbnRTdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5jYW52YXMuaGFzUG9pbnRlckNhcHR1cmUodGhpcy50ZXh0UGxhY2VtZW50U3RhdGUucG9pbnRlcklkKSkge1xuXHRcdFx0dGhpcy5jYW52YXMucmVsZWFzZVBvaW50ZXJDYXB0dXJlKHRoaXMudGV4dFBsYWNlbWVudFN0YXRlLnBvaW50ZXJJZCk7XG5cdFx0fVxuXHRcdHRoaXMudGV4dFBsYWNlbWVudFN0YXRlID0gbnVsbDtcblx0XHR0aGlzLnJlZHJhdygpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUZXh0SW1hZ2VSaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmNyb3BPZmZzZXRYICsgdGhpcy5pbWFnZVdpZHRoO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYXhUZXh0V2lkdGhGcm9tKHN0YXJ0WDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gTWF0aC5tYXgoMSwgdGhpcy5nZXRUZXh0SW1hZ2VSaWdodCgpIC0gc3RhcnRYKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYW51cFRleHRFZGl0b3IoKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9wVGV4dENhcmV0QmxpbmsoKTtcblx0XHR0aGlzLnRleHRFZGl0b3I/LnJlbW92ZSgpO1xuXHRcdHRoaXMudGV4dEVkaXRvciA9IG51bGw7XG5cdFx0dGhpcy50ZXh0RWRpdFN0YXRlID0gbnVsbDtcblx0XHR0aGlzLmNvbnRhaW5lci5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWRyYXcoKTogdm9pZCB7XG5cdFx0dGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xuXG5cdFx0Ly8gRHJhdyBiYWNrZ3JvdW5kIGltYWdlXG5cdFx0aWYgKHRoaXMuaW1hZ2VFbGVtZW50KSB7XG5cdFx0XHR0aGlzLmN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZUVsZW1lbnQsIDAsIDAsIHRoaXMuaW1hZ2VXaWR0aCAqIHRoaXMuc2NhbGUsIHRoaXMuaW1hZ2VIZWlnaHQgKiB0aGlzLnNjYWxlKTtcblx0XHR9XG5cblx0XHQvLyBBbm5vdGF0aW9ucyBhcmUgc3RvcmVkIGluIG9yaWdpbmFsLWltYWdlIGNvb3JkczsgdHJhbnNsYXRlIHNvIHRoZXkgYXBwZWFyIGNvcnJlY3RseVxuXHRcdC8vIG92ZXIgdGhlIChwb3NzaWJseSBjcm9wcGVkKSBkaXNwbGF5ZWQgaW1hZ2UuXG5cdFx0dGhpcy5jdHguc2F2ZSgpO1xuXHRcdHRoaXMuY3R4LnRyYW5zbGF0ZSgtdGhpcy5jcm9wT2Zmc2V0WCAqIHRoaXMuc2NhbGUsIC10aGlzLmNyb3BPZmZzZXRZICogdGhpcy5zY2FsZSk7XG5cblx0XHQvLyBEcmF3IGFsbCBjb21wbGV0ZWQgYW5ub3RhdGlvbnNcblx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiB0aGlzLmFjdGlvbnMpIHtcblx0XHRcdHRoaXMuZHJhd0FjdGlvbihhY3Rpb24pO1xuXHRcdH1cblxuXHRcdC8vIERyYXcgc2VsZWN0aW9uIGhpZ2hsaWdodFxuXHRcdGlmICh0aGlzLnNlbGVjdGVkQWN0aW9uSW5kZXggPj0gMCAmJiB0aGlzLnNlbGVjdGVkQWN0aW9uSW5kZXggPCB0aGlzLmFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmRyYXdTZWxlY3Rpb25IaWdobGlnaHQodGhpcy5hY3Rpb25zW3RoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleF0pO1xuXHRcdH1cblxuXHRcdC8vIERyYXcgY3VycmVudCBpbi1wcm9ncmVzcyBhbm5vdGF0aW9uXG5cdFx0aWYgKHRoaXMuY3VycmVudEFjdGlvbikge1xuXHRcdFx0dGhpcy5kcmF3QWN0aW9uKHRoaXMuY3VycmVudEFjdGlvbik7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudGV4dEVkaXRTdGF0ZSkge1xuXHRcdFx0dGhpcy5kcmF3VGV4dEVkaXRTdGF0ZSgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRleHRQbGFjZW1lbnRTdGF0ZSkge1xuXHRcdFx0dGhpcy5kcmF3VGV4dFBsYWNlbWVudFN0YXRlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jdHgucmVzdG9yZSgpO1xuXG5cdFx0Ly8gRHJhdyBjcm9wIG92ZXJsYXkgd2l0aCBoYW5kbGVzXG5cdFx0aWYgKHRoaXMuY3JvcE1vZGUgJiYgdGhpcy5jcm9wUmVnaW9uKSB7XG5cdFx0XHRjb25zdCByID0gdGhpcy5ub3JtYWxpemVDcm9wUmVjdCh0aGlzLmNyb3BSZWdpb24pO1xuXHRcdFx0Y29uc3QgZHByID0gZ2V0V2luZG93KHRoaXMuY2FudmFzKS5kZXZpY2VQaXhlbFJhdGlvIHx8IDE7XG5cdFx0XHRjb25zdCBjdyA9IHRoaXMuY2FudmFzLndpZHRoIC8gZHByO1xuXHRcdFx0Y29uc3QgY2ggPSB0aGlzLmNhbnZhcy5oZWlnaHQgLyBkcHI7XG5cdFx0XHRjb25zdCByeCA9IHIueCAqIHRoaXMuc2NhbGU7XG5cdFx0XHRjb25zdCByeSA9IHIueSAqIHRoaXMuc2NhbGU7XG5cdFx0XHRjb25zdCBydyA9IHIud2lkdGggKiB0aGlzLnNjYWxlO1xuXHRcdFx0Y29uc3QgcmggPSByLmhlaWdodCAqIHRoaXMuc2NhbGU7XG5cblx0XHRcdHRoaXMuY3R4LnNhdmUoKTtcblx0XHRcdC8vIERpbSBhcmVhIG91dHNpZGUgY3JvcFxuXHRcdFx0dGhpcy5jdHguZmlsbFN0eWxlID0gJ3JnYmEoMCwgMCwgMCwgMC41KSc7XG5cdFx0XHR0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCBjdywgcnkpOyAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0b3Bcblx0XHRcdHRoaXMuY3R4LmZpbGxSZWN0KDAsIHJ5ICsgcmgsIGN3LCBjaCAtIChyeSArIHJoKSk7ICAgICAgICAgIC8vIGJvdHRvbVxuXHRcdFx0dGhpcy5jdHguZmlsbFJlY3QoMCwgcnksIHJ4LCByaCk7ICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbGVmdFxuXHRcdFx0dGhpcy5jdHguZmlsbFJlY3QocnggKyBydywgcnksIGN3IC0gKHJ4ICsgcncpLCByaCk7ICAgICAgICAgLy8gcmlnaHRcblxuXHRcdFx0Ly8gRHJhdyBjcm9wIGJvcmRlclxuXHRcdFx0dGhpcy5jdHguc3Ryb2tlU3R5bGUgPSAnI2ZmZmZmZic7XG5cdFx0XHR0aGlzLmN0eC5saW5lV2lkdGggPSAxO1xuXHRcdFx0dGhpcy5jdHguc3Ryb2tlUmVjdChyeCwgcnksIHJ3LCByaCk7XG5cblx0XHRcdC8vIERyYXcgOCBoYW5kbGVzIChjb3JuZXIgc3F1YXJlcylcblx0XHRcdGNvbnN0IGhhbmRsZVNpemUgPSAxMDtcblx0XHRcdGNvbnN0IGhhbGYgPSBoYW5kbGVTaXplIC8gMjtcblx0XHRcdGNvbnN0IGhhbmRsZXM6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVtdID0gW1xuXHRcdFx0XHR7IHg6IHJ4LCB5OiByeSB9LCAgICAgICAgICAgICAgICAgLy8gbndcblx0XHRcdFx0eyB4OiByeCArIHJ3IC8gMiwgeTogcnkgfSwgICAgICAgIC8vIG5cblx0XHRcdFx0eyB4OiByeCArIHJ3LCB5OiByeSB9LCAgICAgICAgICAgIC8vIG5lXG5cdFx0XHRcdHsgeDogcnggKyBydywgeTogcnkgKyByaCAvIDIgfSwgICAvLyBlXG5cdFx0XHRcdHsgeDogcnggKyBydywgeTogcnkgKyByaCB9LCAgICAgICAvLyBzZVxuXHRcdFx0XHR7IHg6IHJ4ICsgcncgLyAyLCB5OiByeSArIHJoIH0sICAgLy8gc1xuXHRcdFx0XHR7IHg6IHJ4LCB5OiByeSArIHJoIH0sICAgICAgICAgICAgLy8gc3dcblx0XHRcdFx0eyB4OiByeCwgeTogcnkgKyByaCAvIDIgfSwgICAgICAgIC8vIHdcblx0XHRcdF07XG5cdFx0XHR0aGlzLmN0eC5maWxsU3R5bGUgPSAnI2ZmZmZmZic7XG5cdFx0XHR0aGlzLmN0eC5zdHJva2VTdHlsZSA9ICcjMDAwMDAwJztcblx0XHRcdHRoaXMuY3R4LmxpbmVXaWR0aCA9IDE7XG5cdFx0XHRmb3IgKGNvbnN0IGggb2YgaGFuZGxlcykge1xuXHRcdFx0XHR0aGlzLmN0eC5maWxsUmVjdChoLnggLSBoYWxmLCBoLnkgLSBoYWxmLCBoYW5kbGVTaXplLCBoYW5kbGVTaXplKTtcblx0XHRcdFx0dGhpcy5jdHguc3Ryb2tlUmVjdChoLnggLSBoYWxmLCBoLnkgLSBoYWxmLCBoYW5kbGVTaXplLCBoYW5kbGVTaXplKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuY3R4LnJlc3RvcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRyYXdBY3Rpb24oYWN0aW9uOiBEcmF3QWN0aW9uKTogdm9pZCB7XG5cdFx0Ly8gRXJhc2UsIGNyb3AgYW5kIG1vdmUgcmVjb3JkcyBhcmUgdW5kbyBzZW50aW5lbHM7IG5vdGhpbmcgdG8gZHJhdy5cblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFubm90YXRpb25Ub29sLkVyYXNlciB8fCBhY3Rpb24udHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuQ3JvcCB8fCBhY3Rpb24udHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuTW92ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmN0eC5zYXZlKCk7XG5cdFx0Y29uc3QgZmlsbENvbG9yID0gYWN0aW9uLmZpbGxDb2xvciA/PyAndHJhbnNwYXJlbnQnO1xuXHRcdHRoaXMuY3R4Lmdsb2JhbEFscGhhID0gYWN0aW9uLm9wYWNpdHk7XG5cdFx0dGhpcy5jdHguc3Ryb2tlU3R5bGUgPSBhY3Rpb24uc3Ryb2tlQ29sb3I7XG5cdFx0dGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5pc1RyYW5zcGFyZW50KGZpbGxDb2xvcikgPyBhY3Rpb24uc3Ryb2tlQ29sb3IgOiBmaWxsQ29sb3I7XG5cdFx0dGhpcy5jdHgubGluZVdpZHRoID0gYWN0aW9uLmxpbmVXaWR0aCAqIHRoaXMuc2NhbGU7XG5cdFx0dGhpcy5jdHgubGluZUNhcCA9ICdyb3VuZCc7XG5cdFx0dGhpcy5jdHgubGluZUpvaW4gPSAncm91bmQnO1xuXG5cdFx0c3dpdGNoIChhY3Rpb24udHlwZSkge1xuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5GcmVlaGFuZDpcblx0XHRcdFx0aWYgKGFjdGlvbi5wb2ludHMgJiYgYWN0aW9uLnBvaW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5jdHguYmVnaW5QYXRoKCk7XG5cdFx0XHRcdFx0dGhpcy5jdHgubW92ZVRvKGFjdGlvbi5wb2ludHNbMF0ueCAqIHRoaXMuc2NhbGUsIGFjdGlvbi5wb2ludHNbMF0ueSAqIHRoaXMuc2NhbGUpO1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAxOyBpIDwgYWN0aW9uLnBvaW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0dGhpcy5jdHgubGluZVRvKGFjdGlvbi5wb2ludHNbaV0ueCAqIHRoaXMuc2NhbGUsIGFjdGlvbi5wb2ludHNbaV0ueSAqIHRoaXMuc2NhbGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmN0eC5zdHJva2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5SZWN0YW5nbGU6XG5cdFx0XHRcdGlmIChhY3Rpb24ucmVjdCkge1xuXHRcdFx0XHRcdGlmICghdGhpcy5pc1RyYW5zcGFyZW50KGZpbGxDb2xvcikpIHtcblx0XHRcdFx0XHRcdHRoaXMuY3R4LmZpbGxSZWN0KFxuXHRcdFx0XHRcdFx0XHRhY3Rpb24ucmVjdC54ICogdGhpcy5zY2FsZSxcblx0XHRcdFx0XHRcdFx0YWN0aW9uLnJlY3QueSAqIHRoaXMuc2NhbGUsXG5cdFx0XHRcdFx0XHRcdGFjdGlvbi5yZWN0LndpZHRoICogdGhpcy5zY2FsZSxcblx0XHRcdFx0XHRcdFx0YWN0aW9uLnJlY3QuaGVpZ2h0ICogdGhpcy5zY2FsZSxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuY3R4LnN0cm9rZVJlY3QoXG5cdFx0XHRcdFx0XHRhY3Rpb24ucmVjdC54ICogdGhpcy5zY2FsZSxcblx0XHRcdFx0XHRcdGFjdGlvbi5yZWN0LnkgKiB0aGlzLnNjYWxlLFxuXHRcdFx0XHRcdFx0YWN0aW9uLnJlY3Qud2lkdGggKiB0aGlzLnNjYWxlLFxuXHRcdFx0XHRcdFx0YWN0aW9uLnJlY3QuaGVpZ2h0ICogdGhpcy5zY2FsZSxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLkVsbGlwc2U6XG5cdFx0XHRcdGlmIChhY3Rpb24uZWxsaXBzZVJlY3QpIHtcblx0XHRcdFx0XHRjb25zdCByID0gYWN0aW9uLmVsbGlwc2VSZWN0O1xuXHRcdFx0XHRcdGNvbnN0IGN4ID0gKHIueCArIHIud2lkdGggLyAyKSAqIHRoaXMuc2NhbGU7XG5cdFx0XHRcdFx0Y29uc3QgY3kgPSAoci55ICsgci5oZWlnaHQgLyAyKSAqIHRoaXMuc2NhbGU7XG5cdFx0XHRcdFx0Y29uc3QgcnggPSBNYXRoLmFicyhyLndpZHRoIC8gMikgKiB0aGlzLnNjYWxlO1xuXHRcdFx0XHRcdGNvbnN0IHJ5ID0gTWF0aC5hYnMoci5oZWlnaHQgLyAyKSAqIHRoaXMuc2NhbGU7XG5cdFx0XHRcdFx0dGhpcy5jdHguYmVnaW5QYXRoKCk7XG5cdFx0XHRcdFx0dGhpcy5jdHguZWxsaXBzZShjeCwgY3ksIHJ4LCByeSwgMCwgMCwgTWF0aC5QSSAqIDIpO1xuXHRcdFx0XHRcdGlmICghdGhpcy5pc1RyYW5zcGFyZW50KGZpbGxDb2xvcikpIHtcblx0XHRcdFx0XHRcdHRoaXMuY3R4LmZpbGwoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5jdHguc3Ryb2tlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuQXJyb3c6XG5cdFx0XHRcdGlmIChhY3Rpb24uYXJyb3dTdGFydCAmJiBhY3Rpb24uYXJyb3dFbmQpIHtcblx0XHRcdFx0XHR0aGlzLmRyYXdBcnJvdyhcblx0XHRcdFx0XHRcdGFjdGlvbi5hcnJvd1N0YXJ0LnggKiB0aGlzLnNjYWxlLFxuXHRcdFx0XHRcdFx0YWN0aW9uLmFycm93U3RhcnQueSAqIHRoaXMuc2NhbGUsXG5cdFx0XHRcdFx0XHRhY3Rpb24uYXJyb3dFbmQueCAqIHRoaXMuc2NhbGUsXG5cdFx0XHRcdFx0XHRhY3Rpb24uYXJyb3dFbmQueSAqIHRoaXMuc2NhbGUsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5UZXh0OlxuXHRcdFx0XHRpZiAoYWN0aW9uLnRleHQgJiYgYWN0aW9uLnRleHRQb3MpIHtcblx0XHRcdFx0XHRjb25zdCBmb250U2l6ZSA9IChhY3Rpb24uZm9udFNpemUgfHwgMTYpICogdGhpcy5zY2FsZTtcblx0XHRcdFx0XHRjb25zdCBmb250RmFtaWx5ID0gYWN0aW9uLmZvbnRGYW1pbHkgfHwgJ3NhbnMtc2VyaWYnO1xuXHRcdFx0XHRcdGNvbnN0IHdpZHRoID0gKGFjdGlvbi50ZXh0V2lkdGggPz8gREVGQVVMVF9URVhUX0JPWF9XSURUSCkgKiB0aGlzLnNjYWxlO1xuXHRcdFx0XHRcdHRoaXMuY3R4LmZvbnQgPSBgJHtmb250U2l6ZX1weCAke2ZvbnRGYW1pbHl9YDtcblx0XHRcdFx0XHR0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnYWxwaGFiZXRpYyc7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLmlzVHJhbnNwYXJlbnQoZmlsbENvbG9yKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5tZWFzdXJlV3JhcHBlZFRleHQoYWN0aW9uLnRleHQsIHdpZHRoLCBmb250U2l6ZSwgZm9udEZhbWlseSk7XG5cdFx0XHRcdFx0XHR0aGlzLmN0eC5maWxsUmVjdChcblx0XHRcdFx0XHRcdFx0YWN0aW9uLnRleHRQb3MueCAqIHRoaXMuc2NhbGUsXG5cdFx0XHRcdFx0XHRcdGFjdGlvbi50ZXh0UG9zLnkgKiB0aGlzLnNjYWxlIC0gZm9udFNpemUsXG5cdFx0XHRcdFx0XHRcdHdpZHRoLFxuXHRcdFx0XHRcdFx0XHRNYXRoLm1heChsYXlvdXQuaGVpZ2h0LCBmb250U2l6ZSAqIDEuMiksXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmN0eC5maWxsU3R5bGUgPSBhY3Rpb24uc3Ryb2tlQ29sb3I7XG5cdFx0XHRcdFx0dGhpcy5kcmF3V3JhcHBlZFRleHQoYWN0aW9uLnRleHQsIGFjdGlvbi50ZXh0UG9zLnggKiB0aGlzLnNjYWxlLCBhY3Rpb24udGV4dFBvcy55ICogdGhpcy5zY2FsZSwgd2lkdGgsIGZvbnRTaXplLCBmb250RmFtaWx5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHR0aGlzLmN0eC5yZXN0b3JlKCk7XG5cdH1cblxuXHRwcml2YXRlIGRyYXdUZXh0RWRpdFN0YXRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy50ZXh0RWRpdFN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBwb3MsIHRleHQsIHN0cm9rZUNvbG9yLCBmaWxsQ29sb3IsIG9wYWNpdHksIGZvbnRGYW1pbHksIGZvbnRTaXplLCBjYXJldEluZGV4LCB3aWR0aCwgc2hvd0JveE91dGxpbmUgfSA9IHRoaXMudGV4dEVkaXRTdGF0ZTtcblx0XHRjb25zdCBzY2FsZWRGb250U2l6ZSA9IGZvbnRTaXplICogdGhpcy5zY2FsZTtcblx0XHRjb25zdCBzY2FsZWRXaWR0aCA9IHdpZHRoICogdGhpcy5zY2FsZTtcblx0XHR0aGlzLmN0eC5zYXZlKCk7XG5cdFx0dGhpcy5jdHguZ2xvYmFsQWxwaGEgPSBvcGFjaXR5O1xuXHRcdHRoaXMuY3R4LmZpbGxTdHlsZSA9IHN0cm9rZUNvbG9yO1xuXHRcdHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gc3Ryb2tlQ29sb3I7XG5cdFx0dGhpcy5jdHgubGluZVdpZHRoID0gTWF0aC5tYXgoMSwgdGhpcy5zY2FsZSk7XG5cdFx0dGhpcy5jdHguZm9udCA9IGAke3NjYWxlZEZvbnRTaXplfXB4ICR7Zm9udEZhbWlseX1gO1xuXHRcdHRoaXMuY3R4LnRleHRCYXNlbGluZSA9ICdhbHBoYWJldGljJztcblx0XHRpZiAoIXRoaXMuaXNUcmFuc3BhcmVudChmaWxsQ29sb3IpKSB7XG5cdFx0XHRjb25zdCBsYXlvdXQgPSB0aGlzLm1lYXN1cmVXcmFwcGVkVGV4dCh0ZXh0LCBzY2FsZWRXaWR0aCwgc2NhbGVkRm9udFNpemUsIGZvbnRGYW1pbHkpO1xuXHRcdFx0dGhpcy5jdHguZmlsbFN0eWxlID0gZmlsbENvbG9yO1xuXHRcdFx0dGhpcy5jdHguZmlsbFJlY3QoXG5cdFx0XHRcdHBvcy54ICogdGhpcy5zY2FsZSxcblx0XHRcdFx0cG9zLnkgKiB0aGlzLnNjYWxlIC0gc2NhbGVkRm9udFNpemUsXG5cdFx0XHRcdHNjYWxlZFdpZHRoLFxuXHRcdFx0XHRNYXRoLm1heChsYXlvdXQuaGVpZ2h0LCBzY2FsZWRGb250U2l6ZSAqIDEuMiksXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5jdHguZmlsbFN0eWxlID0gc3Ryb2tlQ29sb3I7XG5cdFx0fVxuXHRcdGNvbnN0IGxheW91dCA9IHRoaXMuZHJhd1dyYXBwZWRUZXh0KHRleHQsIHBvcy54ICogdGhpcy5zY2FsZSwgcG9zLnkgKiB0aGlzLnNjYWxlLCBzY2FsZWRXaWR0aCwgc2NhbGVkRm9udFNpemUsIGZvbnRGYW1pbHkpO1xuXG5cdFx0aWYgKHNob3dCb3hPdXRsaW5lKSB7XG5cdFx0XHR0aGlzLmN0eC5zZXRMaW5lRGFzaChbNCwgNF0pO1xuXHRcdFx0dGhpcy5jdHguc3Ryb2tlU3R5bGUgPSAncmdiYSgyNTUsIDI1NSwgMjU1LCAwLjcpJztcblx0XHRcdHRoaXMuY3R4LnN0cm9rZVJlY3QoXG5cdFx0XHRcdHBvcy54ICogdGhpcy5zY2FsZSxcblx0XHRcdFx0cG9zLnkgKiB0aGlzLnNjYWxlIC0gc2NhbGVkRm9udFNpemUsXG5cdFx0XHRcdHNjYWxlZFdpZHRoLFxuXHRcdFx0XHRNYXRoLm1heChsYXlvdXQuaGVpZ2h0LCBzY2FsZWRGb250U2l6ZSAqIDEuMiksXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5jdHguc2V0TGluZURhc2goW10pO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRleHRDYXJldFZpc2libGUpIHtcblx0XHRcdGNvbnN0IGNhcmV0ID0gdGhpcy5nZXRUZXh0Q2FyZXRNZXRyaWNzKHRleHQsIGNhcmV0SW5kZXgsIHNjYWxlZFdpZHRoLCBzY2FsZWRGb250U2l6ZSwgZm9udEZhbWlseSk7XG5cdFx0XHRjb25zdCBjYXJldFggPSBwb3MueCAqIHRoaXMuc2NhbGUgKyBjYXJldC54O1xuXHRcdFx0Y29uc3QgYmFzZWxpbmVZID0gcG9zLnkgKiB0aGlzLnNjYWxlICsgY2FyZXQuYmFzZWxpbmVPZmZzZXRZO1xuXHRcdFx0dGhpcy5jdHguYmVnaW5QYXRoKCk7XG5cdFx0XHR0aGlzLmN0eC5tb3ZlVG8oY2FyZXRYLCBiYXNlbGluZVkgLSBzY2FsZWRGb250U2l6ZSk7XG5cdFx0XHR0aGlzLmN0eC5saW5lVG8oY2FyZXRYLCBiYXNlbGluZVkgKyBNYXRoLm1heCgyLCB0aGlzLnNjYWxlKSk7XG5cdFx0XHR0aGlzLmN0eC5zdHJva2UoKTtcblx0XHR9XG5cdFx0dGhpcy5jdHgucmVzdG9yZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1RyYW5zcGFyZW50KGNvbG9yOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gY29sb3IgPT09ICd0cmFuc3BhcmVudCc7XG5cdH1cblxuXHRwcml2YXRlIGRyYXdUZXh0UGxhY2VtZW50U3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnRleHRQbGFjZW1lbnRTdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB7IHN0YXJ0LCBjdXJyZW50IH0gPSB0aGlzLnRleHRQbGFjZW1lbnRTdGF0ZTtcblx0XHRjb25zdCBkeCA9IGN1cnJlbnQueCAtIHN0YXJ0Lng7XG5cdFx0Y29uc3QgZGlkRHJhZyA9IE1hdGguYWJzKGR4KSA+PSBURVhUX0RSQUdfVEhSRVNIT0xEO1xuXHRcdGlmICghZGlkRHJhZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB4ID0gTWF0aC5taW4oc3RhcnQueCwgY3VycmVudC54KTtcblx0XHRjb25zdCB3aWR0aCA9IE1hdGgubWF4KDEsIE1hdGgubWluKE1hdGguYWJzKGR4KSwgdGhpcy5nZXRUZXh0SW1hZ2VSaWdodCgpIC0geCkpO1xuXHRcdGNvbnN0IHkgPSAoc3RhcnQueSAtIHRoaXMuYWN0aXZlRm9udFNpemUpICogdGhpcy5zY2FsZTtcblx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLmFjdGl2ZUZvbnRTaXplICogdGhpcy5zY2FsZSAqIDEuMjtcblx0XHR0aGlzLmN0eC5zYXZlKCk7XG5cdFx0dGhpcy5jdHguc2V0TGluZURhc2goWzQsIDRdKTtcblx0XHR0aGlzLmN0eC5zdHJva2VTdHlsZSA9ICdyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuNyknO1xuXHRcdHRoaXMuY3R4LmxpbmVXaWR0aCA9IE1hdGgubWF4KDEsIHRoaXMuc2NhbGUpO1xuXHRcdHRoaXMuY3R4LnN0cm9rZVJlY3QoeCAqIHRoaXMuc2NhbGUsIHksIHdpZHRoICogdGhpcy5zY2FsZSwgaGVpZ2h0KTtcblx0XHR0aGlzLmN0eC5zZXRMaW5lRGFzaChbXSk7XG5cdFx0dGhpcy5jdHgucmVzdG9yZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBkcmF3V3JhcHBlZFRleHQodGV4dDogc3RyaW5nLCB4OiBudW1iZXIsIGJhc2VsaW5lWTogbnVtYmVyLCBtYXhXaWR0aDogbnVtYmVyLCBmb250U2l6ZTogbnVtYmVyLCBmb250RmFtaWx5OiBzdHJpbmcpOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyBsaW5lSGVpZ2h0OiBudW1iZXIgfSB7XG5cdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5tZWFzdXJlV3JhcHBlZFRleHQodGV4dCwgbWF4V2lkdGgsIGZvbnRTaXplLCBmb250RmFtaWx5KTtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gbGF5b3V0LmxpbmVIZWlnaHQ7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsYXlvdXQubGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSBsYXlvdXQubGluZXNbaV07XG5cdFx0XHR0aGlzLmN0eC5maWxsVGV4dChsaW5lLnRleHQsIHgsIGJhc2VsaW5lWSArIGkgKiBsaW5lSGVpZ2h0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHdpZHRoOiBsYXlvdXQud2lkdGgsXG5cdFx0XHRoZWlnaHQ6IGxheW91dC5oZWlnaHQsXG5cdFx0XHRsaW5lSGVpZ2h0LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldFRleHRDYXJldE1ldHJpY3ModGV4dDogc3RyaW5nLCBjYXJldEluZGV4OiBudW1iZXIsIG1heFdpZHRoOiBudW1iZXIsIGZvbnRTaXplOiBudW1iZXIsIGZvbnRGYW1pbHk6IHN0cmluZyk6IHsgeDogbnVtYmVyOyBiYXNlbGluZU9mZnNldFk6IG51bWJlciB9IHtcblx0XHRjb25zdCBsYXlvdXQgPSB0aGlzLm1lYXN1cmVXcmFwcGVkVGV4dCh0ZXh0LCBtYXhXaWR0aCwgZm9udFNpemUsIGZvbnRGYW1pbHkpO1xuXHRcdGNvbnN0IGxpbmUgPSBbLi4ubGF5b3V0LmxpbmVzXS5yZXZlcnNlKCkuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnN0YXJ0SW5kZXggPD0gY2FyZXRJbmRleCkgPz8gbGF5b3V0LmxpbmVzWzBdO1xuXHRcdGNvbnN0IHNhZmVDYXJldEluZGV4ID0gTWF0aC5taW4oTWF0aC5tYXgoY2FyZXRJbmRleCwgbGluZS5zdGFydEluZGV4KSwgbGluZS5lbmRJbmRleCk7XG5cdFx0Y29uc3QgYmVmb3JlQ2FyZXQgPSBsaW5lLnRleHQuc2xpY2UoMCwgc2FmZUNhcmV0SW5kZXggLSBsaW5lLnN0YXJ0SW5kZXgpO1xuXHRcdHRoaXMuY3R4LnNhdmUoKTtcblx0XHR0aGlzLmN0eC5mb250ID0gYCR7Zm9udFNpemV9cHggJHtmb250RmFtaWx5fWA7XG5cdFx0Y29uc3QgeCA9IHRoaXMuY3R4Lm1lYXN1cmVUZXh0KGJlZm9yZUNhcmV0KS53aWR0aDtcblx0XHR0aGlzLmN0eC5yZXN0b3JlKCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHgsXG5cdFx0XHRiYXNlbGluZU9mZnNldFk6IGxpbmUubGluZUluZGV4ICogbGF5b3V0LmxpbmVIZWlnaHQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgbWVhc3VyZVdyYXBwZWRUZXh0KHRleHQ6IHN0cmluZywgbWF4V2lkdGg6IG51bWJlciwgZm9udFNpemU6IG51bWJlciwgZm9udEZhbWlseTogc3RyaW5nKTogeyBsaW5lczogeyB0ZXh0OiBzdHJpbmc7IHN0YXJ0SW5kZXg6IG51bWJlcjsgZW5kSW5kZXg6IG51bWJlcjsgbGluZUluZGV4OiBudW1iZXIgfVtdOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgbGluZUhlaWdodDogbnVtYmVyIH0ge1xuXHRcdHRoaXMuY3R4LnNhdmUoKTtcblx0XHR0aGlzLmN0eC5mb250ID0gYCR7Zm9udFNpemV9cHggJHtmb250RmFtaWx5fWA7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IGZvbnRTaXplICogMS4yO1xuXHRcdGNvbnN0IGxpbmVzOiB7IHRleHQ6IHN0cmluZzsgc3RhcnRJbmRleDogbnVtYmVyOyBlbmRJbmRleDogbnVtYmVyOyBsaW5lSW5kZXg6IG51bWJlciB9W10gPSBbXTtcblx0XHRjb25zdCBwYXJhZ3JhcGhzID0gdGV4dC5zcGxpdCgnXFxuJyk7XG5cdFx0bGV0IGdsb2JhbEluZGV4ID0gMDtcblx0XHRsZXQgbGluZUluZGV4ID0gMDtcblx0XHRsZXQgbWF4TGluZVdpZHRoID0gMDtcblxuXHRcdGZvciAobGV0IHAgPSAwOyBwIDwgcGFyYWdyYXBocy5sZW5ndGg7IHArKykge1xuXHRcdFx0Y29uc3QgcGFyYWdyYXBoID0gcGFyYWdyYXBoc1twXTtcblx0XHRcdGNvbnN0IHBhcmFncmFwaFN0YXJ0ID0gZ2xvYmFsSW5kZXg7XG5cdFx0XHRjb25zdCBwYXJhZ3JhcGhFbmQgPSBwYXJhZ3JhcGhTdGFydCArIHBhcmFncmFwaC5sZW5ndGg7XG5cblx0XHRcdGlmIChwYXJhZ3JhcGgubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2goeyB0ZXh0OiAnJywgc3RhcnRJbmRleDogcGFyYWdyYXBoU3RhcnQsIGVuZEluZGV4OiBwYXJhZ3JhcGhTdGFydCwgbGluZUluZGV4IH0pO1xuXHRcdFx0XHRsaW5lSW5kZXgrKztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBsaW5lU3RhcnQgPSBwYXJhZ3JhcGhTdGFydDtcblx0XHRcdFx0d2hpbGUgKGxpbmVTdGFydCA8IHBhcmFncmFwaEVuZCkge1xuXHRcdFx0XHRcdGxldCBiZXN0RW5kID0gbGluZVN0YXJ0ICsgMTtcblx0XHRcdFx0XHRsZXQgbGFzdFdoaXRlc3BhY2VCcmVhayA9IC0xO1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSBsaW5lU3RhcnQgKyAxOyBpIDw9IHBhcmFncmFwaEVuZDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjYW5kaWRhdGUgPSB0ZXh0LnNsaWNlKGxpbmVTdGFydCwgaSk7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5jdHgubWVhc3VyZVRleHQoY2FuZGlkYXRlKS53aWR0aCA8PSBtYXhXaWR0aCkge1xuXHRcdFx0XHRcdFx0XHRiZXN0RW5kID0gaTtcblx0XHRcdFx0XHRcdFx0aWYgKC9cXHMvLnRlc3QodGV4dFtpIC0gMV0pKSB7XG5cdFx0XHRcdFx0XHRcdFx0bGFzdFdoaXRlc3BhY2VCcmVhayA9IGk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGxldCBsaW5lRW5kID0gYmVzdEVuZDtcblx0XHRcdFx0XHRpZiAoYmVzdEVuZCA8IHBhcmFncmFwaEVuZCAmJiBsYXN0V2hpdGVzcGFjZUJyZWFrID4gbGluZVN0YXJ0KSB7XG5cdFx0XHRcdFx0XHRsaW5lRW5kID0gbGFzdFdoaXRlc3BhY2VCcmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGxpbmVFbmQgPD0gbGluZVN0YXJ0KSB7XG5cdFx0XHRcdFx0XHRsaW5lRW5kID0gbGluZVN0YXJ0ICsgMTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCByYXdMaW5lVGV4dCA9IHRleHQuc2xpY2UobGluZVN0YXJ0LCBsaW5lRW5kKTtcblx0XHRcdFx0XHRjb25zdCBsaW5lVGV4dCA9IHJhd0xpbmVUZXh0LnJlcGxhY2UoL1xccyskL3UsICcnKTtcblx0XHRcdFx0XHRsaW5lcy5wdXNoKHsgdGV4dDogbGluZVRleHQsIHN0YXJ0SW5kZXg6IGxpbmVTdGFydCwgZW5kSW5kZXg6IGxpbmVFbmQsIGxpbmVJbmRleCB9KTtcblx0XHRcdFx0XHRtYXhMaW5lV2lkdGggPSBNYXRoLm1heChtYXhMaW5lV2lkdGgsIHRoaXMuY3R4Lm1lYXN1cmVUZXh0KGxpbmVUZXh0KS53aWR0aCk7XG5cdFx0XHRcdFx0bGluZUluZGV4Kys7XG5cblx0XHRcdFx0XHRsaW5lU3RhcnQgPSBsaW5lRW5kO1xuXHRcdFx0XHRcdHdoaWxlIChsaW5lU3RhcnQgPCBwYXJhZ3JhcGhFbmQgJiYgL1xccy91LnRlc3QodGV4dFtsaW5lU3RhcnRdKSkge1xuXHRcdFx0XHRcdFx0bGluZVN0YXJ0Kys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGdsb2JhbEluZGV4ID0gcGFyYWdyYXBoRW5kICsgMTtcblx0XHR9XG5cblx0XHRpZiAobGluZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRsaW5lcy5wdXNoKHsgdGV4dDogJycsIHN0YXJ0SW5kZXg6IDAsIGVuZEluZGV4OiAwLCBsaW5lSW5kZXg6IDAgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKG1heExpbmVXaWR0aCA9PT0gMCkge1xuXHRcdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHRcdG1heExpbmVXaWR0aCA9IE1hdGgubWF4KG1heExpbmVXaWR0aCwgdGhpcy5jdHgubWVhc3VyZVRleHQobGluZS50ZXh0KS53aWR0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuY3R4LnJlc3RvcmUoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGluZXMsXG5cdFx0XHR3aWR0aDogTWF0aC5tYXgobWF4TGluZVdpZHRoLCBtYXhXaWR0aCksXG5cdFx0XHRoZWlnaHQ6IGxpbmVzLmxlbmd0aCAqIGxpbmVIZWlnaHQsXG5cdFx0XHRsaW5lSGVpZ2h0LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGhpdFRlc3QocG9zOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiBudW1iZXIge1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLmFjdGlvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGlmICh0aGlzLmlzUG9pbnRPbkFjdGlvbihwb3MsIHRoaXMuYWN0aW9uc1tpXSkpIHtcblx0XHRcdFx0cmV0dXJuIGk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cdHByaXZhdGUgaXNQb2ludE9uQWN0aW9uKHBvczogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCBhY3Rpb246IERyYXdBY3Rpb24pOiBib29sZWFuIHtcblx0XHRjb25zdCB0aHJlc2hvbGQgPSA4O1xuXHRcdHN3aXRjaCAoYWN0aW9uLnR5cGUpIHtcblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuRnJlZWhhbmQ6XG5cdFx0XHRcdGlmIChhY3Rpb24ucG9pbnRzKSB7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBhY3Rpb24ucG9pbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5wb2ludFRvU2VnbWVudERpc3QocG9zLCBhY3Rpb24ucG9pbnRzW2kgLSAxXSwgYWN0aW9uLnBvaW50c1tpXSkgPCB0aHJlc2hvbGQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuUmVjdGFuZ2xlOlxuXHRcdFx0XHRpZiAoYWN0aW9uLnJlY3QpIHtcblx0XHRcdFx0XHRjb25zdCByID0gYWN0aW9uLnJlY3Q7XG5cdFx0XHRcdFx0Y29uc3QgbnggPSBNYXRoLm1pbihyLngsIHIueCArIHIud2lkdGgpO1xuXHRcdFx0XHRcdGNvbnN0IG55ID0gTWF0aC5taW4oci55LCByLnkgKyByLmhlaWdodCk7XG5cdFx0XHRcdFx0Y29uc3QgbncgPSBNYXRoLmFicyhyLndpZHRoKTtcblx0XHRcdFx0XHRjb25zdCBuaCA9IE1hdGguYWJzKHIuaGVpZ2h0KTtcblx0XHRcdFx0XHRyZXR1cm4gcG9zLnggPj0gbnggLSB0aHJlc2hvbGQgJiYgcG9zLnggPD0gbnggKyBudyArIHRocmVzaG9sZCAmJlxuXHRcdFx0XHRcdFx0cG9zLnkgPj0gbnkgLSB0aHJlc2hvbGQgJiYgcG9zLnkgPD0gbnkgKyBuaCArIHRocmVzaG9sZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLkVsbGlwc2U6XG5cdFx0XHRcdGlmIChhY3Rpb24uZWxsaXBzZVJlY3QpIHtcblx0XHRcdFx0XHRjb25zdCBlciA9IGFjdGlvbi5lbGxpcHNlUmVjdDtcblx0XHRcdFx0XHRjb25zdCBjeCA9IGVyLnggKyBlci53aWR0aCAvIDI7XG5cdFx0XHRcdFx0Y29uc3QgY3kgPSBlci55ICsgZXIuaGVpZ2h0IC8gMjtcblx0XHRcdFx0XHRjb25zdCByeCA9IE1hdGguYWJzKGVyLndpZHRoIC8gMik7XG5cdFx0XHRcdFx0Y29uc3QgcnkgPSBNYXRoLmFicyhlci5oZWlnaHQgLyAyKTtcblx0XHRcdFx0XHRpZiAocnggPCAxIHx8IHJ5IDwgMSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBOb3JtYWxpemVkIGRpc3RhbmNlIGZyb20gY2VudGVyXG5cdFx0XHRcdFx0Y29uc3QgZHggPSAocG9zLnggLSBjeCkgLyByeDtcblx0XHRcdFx0XHRjb25zdCBkeSA9IChwb3MueSAtIGN5KSAvIHJ5O1xuXHRcdFx0XHRcdGNvbnN0IGRpc3QgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuXHRcdFx0XHRcdGlmICghdGhpcy5pc1RyYW5zcGFyZW50KGFjdGlvbi5maWxsQ29sb3IgPz8gJ3RyYW5zcGFyZW50JykpIHtcblx0XHRcdFx0XHRcdHJldHVybiBkaXN0IDw9IDEgKyB0aHJlc2hvbGQgLyBNYXRoLm1pbihyeCwgcnkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBDaGVjayBpZiBwb2ludCBpcyBuZWFyIHRoZSBlbGxpcHNlIGJvcmRlciAoZGlzdCBhcm91bmQgMSlcblx0XHRcdFx0XHRjb25zdCBub3JtYWxpemVkVGhyZXNob2xkID0gdGhyZXNob2xkIC8gTWF0aC5taW4ocngsIHJ5KTtcblx0XHRcdFx0XHRyZXR1cm4gTWF0aC5hYnMoZGlzdCAtIDEpIDwgbm9ybWFsaXplZFRocmVzaG9sZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLkFycm93OlxuXHRcdFx0XHRpZiAoYWN0aW9uLmFycm93U3RhcnQgJiYgYWN0aW9uLmFycm93RW5kKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMucG9pbnRUb1NlZ21lbnREaXN0KHBvcywgYWN0aW9uLmFycm93U3RhcnQsIGFjdGlvbi5hcnJvd0VuZCkgPCB0aHJlc2hvbGQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5UZXh0OlxuXHRcdFx0XHRpZiAoYWN0aW9uLnRleHQgJiYgYWN0aW9uLnRleHRQb3MpIHtcblx0XHRcdFx0XHRjb25zdCBib3VuZHMgPSB0aGlzLmdldEFjdGlvbkJvdW5kcyhhY3Rpb24pO1xuXHRcdFx0XHRcdGlmICghYm91bmRzKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBwb3MueCA+PSBhY3Rpb24udGV4dFBvcy54IC0gdGhyZXNob2xkICYmXG5cdFx0XHRcdFx0XHRwb3MueCA8PSBib3VuZHMueCArIGJvdW5kcy53aWR0aCArIHRocmVzaG9sZCAmJlxuXHRcdFx0XHRcdFx0cG9zLnkgPj0gYm91bmRzLnkgLSB0aHJlc2hvbGQgJiZcblx0XHRcdFx0XHRcdHBvcy55IDw9IGJvdW5kcy55ICsgYm91bmRzLmhlaWdodCArIHRocmVzaG9sZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgcG9pbnRUb1NlZ21lbnREaXN0KHA6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSwgYTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCBiOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiBudW1iZXIge1xuXHRcdGNvbnN0IGR4ID0gYi54IC0gYS54O1xuXHRcdGNvbnN0IGR5ID0gYi55IC0gYS55O1xuXHRcdGNvbnN0IGxlbmd0aFNxID0gZHggKiBkeCArIGR5ICogZHk7XG5cdFx0aWYgKGxlbmd0aFNxID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gTWF0aC5oeXBvdChwLnggLSBhLngsIHAueSAtIGEueSk7XG5cdFx0fVxuXHRcdGxldCB0ID0gKChwLnggLSBhLngpICogZHggKyAocC55IC0gYS55KSAqIGR5KSAvIGxlbmd0aFNxO1xuXHRcdHQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCB0KSk7XG5cdFx0Y29uc3QgcHJvalggPSBhLnggKyB0ICogZHg7XG5cdFx0Y29uc3QgcHJvalkgPSBhLnkgKyB0ICogZHk7XG5cdFx0cmV0dXJuIE1hdGguaHlwb3QocC54IC0gcHJvalgsIHAueSAtIHByb2pZKTtcblx0fVxuXG5cdHByaXZhdGUgbW92ZUFjdGlvbihhY3Rpb246IERyYXdBY3Rpb24sIGR4OiBudW1iZXIsIGR5OiBudW1iZXIpOiB2b2lkIHtcblx0XHRzd2l0Y2ggKGFjdGlvbi50eXBlKSB7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLkZyZWVoYW5kOlxuXHRcdFx0XHRpZiAoYWN0aW9uLnBvaW50cykge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcHQgb2YgYWN0aW9uLnBvaW50cykge1xuXHRcdFx0XHRcdFx0cHQueCArPSBkeDtcblx0XHRcdFx0XHRcdHB0LnkgKz0gZHk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5SZWN0YW5nbGU6XG5cdFx0XHRcdGlmIChhY3Rpb24ucmVjdCkge1xuXHRcdFx0XHRcdGFjdGlvbi5yZWN0LnggKz0gZHg7XG5cdFx0XHRcdFx0YWN0aW9uLnJlY3QueSArPSBkeTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuRWxsaXBzZTpcblx0XHRcdFx0aWYgKGFjdGlvbi5lbGxpcHNlUmVjdCkge1xuXHRcdFx0XHRcdGFjdGlvbi5lbGxpcHNlUmVjdC54ICs9IGR4O1xuXHRcdFx0XHRcdGFjdGlvbi5lbGxpcHNlUmVjdC55ICs9IGR5O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5BcnJvdzpcblx0XHRcdFx0aWYgKGFjdGlvbi5hcnJvd1N0YXJ0KSB7XG5cdFx0XHRcdFx0YWN0aW9uLmFycm93U3RhcnQueCArPSBkeDtcblx0XHRcdFx0XHRhY3Rpb24uYXJyb3dTdGFydC55ICs9IGR5O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhY3Rpb24uYXJyb3dFbmQpIHtcblx0XHRcdFx0XHRhY3Rpb24uYXJyb3dFbmQueCArPSBkeDtcblx0XHRcdFx0XHRhY3Rpb24uYXJyb3dFbmQueSArPSBkeTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuVGV4dDpcblx0XHRcdFx0aWYgKGFjdGlvbi50ZXh0UG9zKSB7XG5cdFx0XHRcdFx0YWN0aW9uLnRleHRQb3MueCArPSBkeDtcblx0XHRcdFx0XHRhY3Rpb24udGV4dFBvcy55ICs9IGR5O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZHJhd1NlbGVjdGlvbkhpZ2hsaWdodChhY3Rpb246IERyYXdBY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLmN0eC5zYXZlKCk7XG5cdFx0dGhpcy5jdHguc3Ryb2tlU3R5bGUgPSAnIzAwN2FjYyc7XG5cdFx0dGhpcy5jdHgubGluZVdpZHRoID0gMTtcblx0XHR0aGlzLmN0eC5zZXRMaW5lRGFzaChbNCwgNF0pO1xuXHRcdGNvbnN0IHBhZCA9IDY7XG5cdFx0Y29uc3QgYm91bmRzID0gdGhpcy5nZXRBY3Rpb25Cb3VuZHMoYWN0aW9uKTtcblx0XHRpZiAoYm91bmRzKSB7XG5cdFx0XHR0aGlzLmN0eC5zdHJva2VSZWN0KFxuXHRcdFx0XHQoYm91bmRzLnggLSBwYWQpICogdGhpcy5zY2FsZSxcblx0XHRcdFx0KGJvdW5kcy55IC0gcGFkKSAqIHRoaXMuc2NhbGUsXG5cdFx0XHRcdChib3VuZHMud2lkdGggKyBwYWQgKiAyKSAqIHRoaXMuc2NhbGUsXG5cdFx0XHRcdChib3VuZHMuaGVpZ2h0ICsgcGFkICogMikgKiB0aGlzLnNjYWxlLFxuXHRcdFx0KTtcblx0XHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuVGV4dCkge1xuXHRcdFx0XHRjb25zdCBoYW5kbGVTaXplID0gODtcblx0XHRcdFx0Y29uc3QgaGFuZGxlWCA9IChib3VuZHMueCArIGJvdW5kcy53aWR0aCArIHBhZCkgKiB0aGlzLnNjYWxlO1xuXHRcdFx0XHRjb25zdCBoYW5kbGVZID0gKGJvdW5kcy55ICsgYm91bmRzLmhlaWdodCAvIDIpICogdGhpcy5zY2FsZTtcblx0XHRcdFx0dGhpcy5jdHguZmlsbFN0eWxlID0gJyMwMDdhY2MnO1xuXHRcdFx0XHR0aGlzLmN0eC5maWxsUmVjdChoYW5kbGVYIC0gaGFuZGxlU2l6ZSAvIDIsIGhhbmRsZVkgLSBoYW5kbGVTaXplIC8gMiwgaGFuZGxlU2l6ZSwgaGFuZGxlU2l6ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuY3R4LnNldExpbmVEYXNoKFtdKTtcblx0XHR0aGlzLmN0eC5yZXN0b3JlKCk7XG5cdH1cblxuXHRwcml2YXRlIGlzTmVhclRleHRSZXNpemVIYW5kbGUocG9zOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIGFjdGlvbjogRHJhd0FjdGlvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChhY3Rpb24udHlwZSAhPT0gQW5ub3RhdGlvblRvb2wuVGV4dCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBib3VuZHMgPSB0aGlzLmdldEFjdGlvbkJvdW5kcyhhY3Rpb24pO1xuXHRcdGlmICghYm91bmRzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHRocmVzaG9sZCA9IDg7XG5cdFx0Y29uc3QgaGFuZGxlWCA9IGJvdW5kcy54ICsgYm91bmRzLndpZHRoO1xuXHRcdGNvbnN0IGhhbmRsZVkgPSBib3VuZHMueSArIGJvdW5kcy5oZWlnaHQgLyAyO1xuXHRcdHJldHVybiBNYXRoLmFicyhwb3MueCAtIGhhbmRsZVgpIDw9IHRocmVzaG9sZCAmJiBNYXRoLmFicyhwb3MueSAtIGhhbmRsZVkpIDw9IHRocmVzaG9sZCAqIDI7XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGlvbkJvdW5kcyhhY3Rpb246IERyYXdBY3Rpb24pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgbnVsbCB7XG5cdFx0c3dpdGNoIChhY3Rpb24udHlwZSkge1xuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5GcmVlaGFuZDpcblx0XHRcdFx0aWYgKGFjdGlvbi5wb2ludHMgJiYgYWN0aW9uLnBvaW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0bGV0IG1pblggPSBJbmZpbml0eSwgbWluWSA9IEluZmluaXR5LCBtYXhYID0gLUluZmluaXR5LCBtYXhZID0gLUluZmluaXR5O1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcHQgb2YgYWN0aW9uLnBvaW50cykge1xuXHRcdFx0XHRcdFx0bWluWCA9IE1hdGgubWluKG1pblgsIHB0LngpO1xuXHRcdFx0XHRcdFx0bWluWSA9IE1hdGgubWluKG1pblksIHB0LnkpO1xuXHRcdFx0XHRcdFx0bWF4WCA9IE1hdGgubWF4KG1heFgsIHB0LngpO1xuXHRcdFx0XHRcdFx0bWF4WSA9IE1hdGgubWF4KG1heFksIHB0LnkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4geyB4OiBtaW5YLCB5OiBtaW5ZLCB3aWR0aDogbWF4WCAtIG1pblgsIGhlaWdodDogbWF4WSAtIG1pblkgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuUmVjdGFuZ2xlOlxuXHRcdFx0XHRpZiAoYWN0aW9uLnJlY3QpIHtcblx0XHRcdFx0XHRjb25zdCByID0gYWN0aW9uLnJlY3Q7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHg6IE1hdGgubWluKHIueCwgci54ICsgci53aWR0aCksXG5cdFx0XHRcdFx0XHR5OiBNYXRoLm1pbihyLnksIHIueSArIHIuaGVpZ2h0KSxcblx0XHRcdFx0XHRcdHdpZHRoOiBNYXRoLmFicyhyLndpZHRoKSxcblx0XHRcdFx0XHRcdGhlaWdodDogTWF0aC5hYnMoci5oZWlnaHQpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLkVsbGlwc2U6XG5cdFx0XHRcdGlmIChhY3Rpb24uZWxsaXBzZVJlY3QpIHtcblx0XHRcdFx0XHRjb25zdCBlciA9IGFjdGlvbi5lbGxpcHNlUmVjdDtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0eDogTWF0aC5taW4oZXIueCwgZXIueCArIGVyLndpZHRoKSxcblx0XHRcdFx0XHRcdHk6IE1hdGgubWluKGVyLnksIGVyLnkgKyBlci5oZWlnaHQpLFxuXHRcdFx0XHRcdFx0d2lkdGg6IE1hdGguYWJzKGVyLndpZHRoKSxcblx0XHRcdFx0XHRcdGhlaWdodDogTWF0aC5hYnMoZXIuaGVpZ2h0KSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5BcnJvdzpcblx0XHRcdFx0aWYgKGFjdGlvbi5hcnJvd1N0YXJ0ICYmIGFjdGlvbi5hcnJvd0VuZCkge1xuXHRcdFx0XHRcdGNvbnN0IG1pblggPSBNYXRoLm1pbihhY3Rpb24uYXJyb3dTdGFydC54LCBhY3Rpb24uYXJyb3dFbmQueCk7XG5cdFx0XHRcdFx0Y29uc3QgbWluWSA9IE1hdGgubWluKGFjdGlvbi5hcnJvd1N0YXJ0LnksIGFjdGlvbi5hcnJvd0VuZC55KTtcblx0XHRcdFx0XHRjb25zdCBtYXhYID0gTWF0aC5tYXgoYWN0aW9uLmFycm93U3RhcnQueCwgYWN0aW9uLmFycm93RW5kLngpO1xuXHRcdFx0XHRcdGNvbnN0IG1heFkgPSBNYXRoLm1heChhY3Rpb24uYXJyb3dTdGFydC55LCBhY3Rpb24uYXJyb3dFbmQueSk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgeDogbWluWCwgeTogbWluWSwgd2lkdGg6IG1heFggLSBtaW5YLCBoZWlnaHQ6IG1heFkgLSBtaW5ZIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLlRleHQ6XG5cdFx0XHRcdGlmIChhY3Rpb24udGV4dCAmJiBhY3Rpb24udGV4dFBvcykge1xuXHRcdFx0XHRcdGNvbnN0IGZvbnRTaXplID0gYWN0aW9uLmZvbnRTaXplIHx8IDE2O1xuXHRcdFx0XHRcdGNvbnN0IGZvbnRGYW1pbHkgPSBhY3Rpb24uZm9udEZhbWlseSB8fCAnc2Fucy1zZXJpZic7XG5cdFx0XHRcdFx0Y29uc3QgdGV4dFdpZHRoID0gYWN0aW9uLnRleHRXaWR0aCA/PyBERUZBVUxUX1RFWFRfQk9YX1dJRFRIO1xuXHRcdFx0XHRcdGNvbnN0IGxheW91dCA9IHRoaXMubWVhc3VyZVdyYXBwZWRUZXh0KGFjdGlvbi50ZXh0LCB0ZXh0V2lkdGgsIGZvbnRTaXplLCBmb250RmFtaWx5KTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0eDogYWN0aW9uLnRleHRQb3MueCxcblx0XHRcdFx0XHRcdHk6IGFjdGlvbi50ZXh0UG9zLnkgLSBmb250U2l6ZSxcblx0XHRcdFx0XHRcdHdpZHRoOiB0ZXh0V2lkdGgsXG5cdFx0XHRcdFx0XHRoZWlnaHQ6IGxheW91dC5oZWlnaHQsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGRyYXdBcnJvdyhmcm9tWDogbnVtYmVyLCBmcm9tWTogbnVtYmVyLCB0b1g6IG51bWJlciwgdG9ZOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBkeCA9IHRvWCAtIGZyb21YO1xuXHRcdGNvbnN0IGR5ID0gdG9ZIC0gZnJvbVk7XG5cdFx0Y29uc3QgbGVuZ3RoID0gTWF0aC5oeXBvdChkeCwgZHkpO1xuXHRcdGlmIChsZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB1bml0WCA9IGR4IC8gbGVuZ3RoO1xuXHRcdGNvbnN0IHVuaXRZID0gZHkgLyBsZW5ndGg7XG5cdFx0Y29uc3Qgbm9ybWFsWCA9IC11bml0WTtcblx0XHRjb25zdCBub3JtYWxZID0gdW5pdFg7XG5cdFx0Y29uc3QgbGluZVdpZHRoID0gdGhpcy5jdHgubGluZVdpZHRoO1xuXHRcdGNvbnN0IGhlYWRMZW5ndGggPSBNYXRoLm1pbihNYXRoLm1heCgxMiAqIHRoaXMuc2NhbGUsIGxpbmVXaWR0aCAqIDMpLCBsZW5ndGgpO1xuXHRcdGNvbnN0IGhlYWRXaWR0aCA9IE1hdGgubWF4KDEwICogdGhpcy5zY2FsZSwgbGluZVdpZHRoICogMi41KTtcblx0XHRjb25zdCBiYXNlWCA9IHRvWCAtIHVuaXRYICogaGVhZExlbmd0aDtcblx0XHRjb25zdCBiYXNlWSA9IHRvWSAtIHVuaXRZICogaGVhZExlbmd0aDtcblxuXHRcdHRoaXMuY3R4LmJlZ2luUGF0aCgpO1xuXHRcdHRoaXMuY3R4Lm1vdmVUbyhmcm9tWCwgZnJvbVkpO1xuXHRcdHRoaXMuY3R4LmxpbmVUbyhiYXNlWCwgYmFzZVkpO1xuXHRcdHRoaXMuY3R4LnN0cm9rZSgpO1xuXG5cdFx0dGhpcy5jdHguYmVnaW5QYXRoKCk7XG5cdFx0dGhpcy5jdHgubW92ZVRvKHRvWCwgdG9ZKTtcblx0XHR0aGlzLmN0eC5saW5lVG8oYmFzZVggKyBub3JtYWxYICogaGVhZFdpZHRoIC8gMiwgYmFzZVkgKyBub3JtYWxZICogaGVhZFdpZHRoIC8gMik7XG5cdFx0dGhpcy5jdHgubGluZVRvKGJhc2VYIC0gbm9ybWFsWCAqIGhlYWRXaWR0aCAvIDIsIGJhc2VZIC0gbm9ybWFsWSAqIGhlYWRXaWR0aCAvIDIpO1xuXHRcdHRoaXMuY3R4LmNsb3NlUGF0aCgpO1xuXHRcdHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY3R4LnN0cm9rZVN0eWxlO1xuXHRcdHRoaXMuY3R4LmZpbGwoKTtcblx0fVxuXG5cdHByaXZhdGUgZmx1c2hQZW5kaW5nWm9vbSgpOiB2b2lkIHtcblx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5wZW5kaW5nWm9vbTtcblx0XHR0aGlzLnBlbmRpbmdab29tID0gbnVsbDtcblx0XHRpZiAoIXBlbmRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbWluU2NhbGUgPSB0aGlzLmdldEZpdFNjYWxlKCk7XG5cdFx0Y29uc3QgbWF4U2NhbGUgPSA4O1xuXHRcdGNvbnN0IGRlc2lyZWRTY2FsZSA9IHRoaXMuc2NhbGUgKiBwZW5kaW5nLmZhY3Rvcjtcblx0XHRjb25zdCBuZXdTY2FsZSA9IE1hdGgubWF4KG1pblNjYWxlLCBNYXRoLm1pbihtYXhTY2FsZSwgZGVzaXJlZFNjYWxlKSk7XG5cdFx0aWYgKG5ld1NjYWxlID09PSB0aGlzLnNjYWxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEN1cnNvci1hbmNob3JlZCB6b29tOiBrZWVwIHRoZSBpbWFnZSBwaXhlbCB1bmRlciB0aGUgY3Vyc29yIHVuZGVyIHRoZVxuXHRcdC8vIGN1cnNvciBhZnRlciB6b29tLiBDbGFtcCB0aGUgY3Vyc29yJ3MgaW1hZ2Utc3BhY2UgY29vcmQgdG8gdGhlIGFjdHVhbFxuXHRcdC8vIGltYWdlIGV4dGVudCBzbyBhbiBvZmYtaW1hZ2UgY3Vyc29yIChpbiBicmVhdGhpbmctcm9vbSBwYWRkaW5nKSBzdGlsbFxuXHRcdC8vIHBpdm90cyBvbiB0aGUgbmVhcmVzdCByZWFsIGltYWdlIHBpeGVsLlxuXHRcdGNvbnN0IGhhbGZJbWdXID0gKHRoaXMuaW1hZ2VXaWR0aCAqIHRoaXMuc2NhbGUpIC8gMjtcblx0XHRjb25zdCBoYWxmSW1nSCA9ICh0aGlzLmltYWdlSGVpZ2h0ICogdGhpcy5zY2FsZSkgLyAyO1xuXHRcdGNvbnN0IGFuY2hvckN4ID0gdGhpcy5wYW5YICsgTWF0aC5tYXgoLWhhbGZJbWdXLCBNYXRoLm1pbihoYWxmSW1nVywgcGVuZGluZy5jeCAtIHRoaXMucGFuWCkpO1xuXHRcdGNvbnN0IGFuY2hvckN5ID0gdGhpcy5wYW5ZICsgTWF0aC5tYXgoLWhhbGZJbWdILCBNYXRoLm1pbihoYWxmSW1nSCwgcGVuZGluZy5jeSAtIHRoaXMucGFuWSkpO1xuXHRcdGNvbnN0IHIgPSBuZXdTY2FsZSAvIHRoaXMuc2NhbGU7XG5cdFx0dGhpcy5wYW5YID0gYW5jaG9yQ3ggKiAoMSAtIHIpICsgdGhpcy5wYW5YICogcjtcblx0XHR0aGlzLnBhblkgPSBhbmNob3JDeSAqICgxIC0gcikgKyB0aGlzLnBhblkgKiByO1xuXHRcdHRoaXMuc2NhbGUgPSBuZXdTY2FsZTtcblx0XHR0aGlzLmhhc1VzZXJab29tZWQgPSB0cnVlO1xuXHRcdC8vIERlbGliZXJhdGVseSBkbyBOT1QgY2FsbCBjbGFtcFBhbigpIGhlcmUuIFdpdGggckFGLWNvYWxlc2NlZCB3aGVlbCBldmVudHNcblx0XHQvLyBhIHNpbmdsZSBmbHVzaCBjYW4gcHJvZHVjZSBhIGxhcmdlIHpvb20gZmFjdG9yIChlLmcuIHRyYWNrcGFkIHBpbmNoIGZpcmluZ1xuXHRcdC8vIDEwKyBldmVudHMgaW4gb25lIGZyYW1lIC0+IHIgfj0gMi0zKTsgdGhlIGN1cnNvci1hbmNob3JlZCBwYW4gdGhhdCBuZWVkcyB0b1xuXHRcdC8vIGJlIGFwcGxpZWQgYXQgbGFyZ2UgciBjYW4gZXhjZWVkIHRoZSBzdHJpY3QgY2xhbXAsIGFuZCBjbGFtcGluZyB0aGVuXG5cdFx0Ly8gZHJpZnRzIHRoZSBjdXJzb3IgYXdheSBmcm9tIHRoZSBhbmNob3IgcGl4ZWwuIFRoZSBjdXJzb3IgYW5jaG9yIGl0c2VsZlxuXHRcdC8vIGVuc3VyZXMgYXQgbGVhc3Qgb25lIGltYWdlIHBpeGVsIHN0YXlzIHZpc2libGUgKHRoZSBvbmUgdW5kZXIgdGhlIGN1cnNvciksXG5cdFx0Ly8gc28gdW5ib3VuZGVkIHpvb20gcGFuIGlzIHNhZmUuXG5cdFx0Ly8gV2hlbiB6b29taW5nIGJhY2sgb3V0IHRvIGZpdCwgc25hcCBwYW4gdG8gY2VudGVyZWQgc28gdGhlIGJyZWF0aGluZy1yb29tXG5cdFx0Ly8gbGF5b3V0IGxvb2tzIHN5bW1ldHJpYyBpbnN0ZWFkIG9mIGNhcnJ5aW5nIG92ZXIgYW55IGFjY3VtdWxhdGVkIG9mZnNldC5cblx0XHRpZiAobmV3U2NhbGUgPT09IG1pblNjYWxlKSB7XG5cdFx0XHR0aGlzLnBhblggPSAwO1xuXHRcdFx0dGhpcy5wYW5ZID0gMDtcblx0XHR9XG5cdFx0dGhpcy5zaXplQ2FudmFzKCk7XG5cdFx0dGhpcy5jYW52YXMuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke3RoaXMucGFuWH1weCwgJHt0aGlzLnBhbll9cHgpYDtcblx0XHR0aGlzLnJlZHJhdygpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRGaXRTY2FsZSgpOiBudW1iZXIge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuY2FudmFzLnBhcmVudEVsZW1lbnQ7XG5cdFx0aWYgKCFjb250YWluZXIgfHwgIXRoaXMuaW1hZ2VXaWR0aCB8fCAhdGhpcy5pbWFnZUhlaWdodCkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHRcdGNvbnN0IG1heFdpZHRoID0gTWF0aC5tYXgoMSwgY29udGFpbmVyLmNsaWVudFdpZHRoIC0gQ0FOVkFTX0JSRUFUSElOR19ST09NICogMik7XG5cdFx0Y29uc3QgbWF4SGVpZ2h0ID0gTWF0aC5tYXgoMSwgY29udGFpbmVyLmNsaWVudEhlaWdodCAtIENBTlZBU19CUkVBVEhJTkdfUk9PTSAqIDIpO1xuXHRcdHJldHVybiBNYXRoLm1pbihtYXhXaWR0aCAvIHRoaXMuaW1hZ2VXaWR0aCwgbWF4SGVpZ2h0IC8gdGhpcy5pbWFnZUhlaWdodCwgMSk7XG5cdH1cblxuXHRwcml2YXRlIGNsYW1wUGFuKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuY2FudmFzLnBhcmVudEVsZW1lbnQ7XG5cdFx0aWYgKCFjb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW1nVyA9IHRoaXMuaW1hZ2VXaWR0aCAqIHRoaXMuc2NhbGU7XG5cdFx0Y29uc3QgaW1nSCA9IHRoaXMuaW1hZ2VIZWlnaHQgKiB0aGlzLnNjYWxlO1xuXHRcdGNvbnN0IGNXID0gY29udGFpbmVyLmNsaWVudFdpZHRoO1xuXHRcdGNvbnN0IGNIID0gY29udGFpbmVyLmNsaWVudEhlaWdodDtcblx0XHQvLyBNYW51YWwtcGFuIGNsYW1wOiBpbWFnZSBlZGdlIGNhbid0IHRyYXZlbCBwYXN0IGNvbnRhaW5lciBlZGdlIGluIGVpdGhlclxuXHRcdC8vIGRpcmVjdGlvbi4gV2hlbiBpbWFnZSBpcyBzbWFsbGVyIHRoYW4gY29udGFpbmVyIChmaXQgLyB6b29tZWQtb3V0KSwgdGhlXG5cdFx0Ly8gYm91bmQgc2hyaW5rcyBzeW1tZXRyaWNhbGx5IHRvd2FyZCAwIHNvIHBhbiBjYW4gc2hpZnQgdGhlIGltYWdlIGFyb3VuZFxuXHRcdC8vIGluc2lkZSB0aGUgY29udGFpbmVyIHdpdGhvdXQgc2xpZGluZyBvZmYgZWl0aGVyIGVkZ2UuIFdoZW4gem9vbWVkIGluLFxuXHRcdC8vIGFsbG93cyBmdWxsIHBhbiB3aXRoaW4gdGhlIHpvb21lZCBjb250ZW50LlxuXHRcdGNvbnN0IG1heFBhblggPSBNYXRoLmFicyhjVyAtIGltZ1cpIC8gMjtcblx0XHRjb25zdCBtYXhQYW5ZID0gTWF0aC5hYnMoY0ggLSBpbWdIKSAvIDI7XG5cdFx0dGhpcy5wYW5YID0gTWF0aC5tYXgoLW1heFBhblgsIE1hdGgubWluKG1heFBhblgsIHRoaXMucGFuWCkpO1xuXHRcdHRoaXMucGFuWSA9IE1hdGgubWF4KC1tYXhQYW5ZLCBNYXRoLm1pbihtYXhQYW5ZLCB0aGlzLnBhblkpKTtcblx0fVxuXG5cdHByaXZhdGUgY29tcG9zaXRlVG9EYXRhVXJsKCk6IHN0cmluZyB7XG5cdFx0Ly8gQ3JlYXRlIGEgZmluYWwgY2FudmFzIGF0IGZ1bGwgcmVzb2x1dGlvblxuXHRcdGNvbnN0IGZpbmFsQ2FudmFzID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcblx0XHRmaW5hbENhbnZhcy53aWR0aCA9IHRoaXMuaW1hZ2VXaWR0aDtcblx0XHRmaW5hbENhbnZhcy5oZWlnaHQgPSB0aGlzLmltYWdlSGVpZ2h0O1xuXHRcdGNvbnN0IGN0eCA9IGZpbmFsQ2FudmFzLmdldENvbnRleHQoJzJkJykhO1xuXG5cdFx0Ly8gRHJhdyBiYWNrZ3JvdW5kIGltYWdlXG5cdFx0aWYgKHRoaXMuaW1hZ2VFbGVtZW50KSB7XG5cdFx0XHRjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2VFbGVtZW50LCAwLCAwLCB0aGlzLmltYWdlV2lkdGgsIHRoaXMuaW1hZ2VIZWlnaHQpO1xuXHRcdH1cblxuXHRcdC8vIFJlcGxheSBhbm5vdGF0aW9ucyBhdCBmdWxsIHJlc29sdXRpb24uIEFjdGlvbnMgYXJlIGluIG9yaWdpbmFsLWltYWdlIGNvb3Jkcztcblx0XHQvLyB0cmFuc2xhdGUgYnkgLWN1cnJlbnRDcm9wIG9mZnNldCBzbyB0aGV5IGxhbmQgY29ycmVjdGx5IG9uIHRoZSBjcm9wcGVkIG91dHB1dC5cblx0XHRjb25zdCBzYXZlZFNjYWxlID0gdGhpcy5zY2FsZTtcblx0XHR0aGlzLnNjYWxlID0gMTtcblx0XHRjb25zdCBzYXZlZEN0eCA9IHRoaXMuY3R4O1xuXHRcdHRoaXMuY3R4ID0gY3R4O1xuXG5cdFx0Y29uc3Qgb2ZmWCA9IHRoaXMuY3VycmVudENyb3A/LnggPz8gMDtcblx0XHRjb25zdCBvZmZZID0gdGhpcy5jdXJyZW50Q3JvcD8ueSA/PyAwO1xuXHRcdGN0eC5zYXZlKCk7XG5cdFx0Y3R4LnRyYW5zbGF0ZSgtb2ZmWCwgLW9mZlkpO1xuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIHRoaXMuYWN0aW9ucykge1xuXHRcdFx0dGhpcy5kcmF3QWN0aW9uKGFjdGlvbik7XG5cdFx0fVxuXHRcdGN0eC5yZXN0b3JlKCk7XG5cblx0XHR0aGlzLmN0eCA9IHNhdmVkQ3R4O1xuXHRcdHRoaXMuc2NhbGUgPSBzYXZlZFNjYWxlO1xuXG5cdFx0cmV0dXJuIGZpbmFsQ2FudmFzLnRvRGF0YVVSTCgnaW1hZ2UvcG5nJyk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnBlbmRpbmdab29tUmFmKSB7XG5cdFx0XHRnZXRXaW5kb3codGhpcy5jYW52YXMpLmNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMucGVuZGluZ1pvb21SYWYpO1xuXHRcdFx0dGhpcy5wZW5kaW5nWm9vbVJhZiA9IDA7XG5cdFx0XHR0aGlzLnBlbmRpbmdab29tID0gbnVsbDtcblx0XHR9XG5cdFx0dGhpcy5jYW5jZWxUZXh0UGxhY2VtZW50KCk7XG5cdFx0dGhpcy5jbGVhbnVwVGV4dEVkaXRvcigpO1xuXHRcdHRoaXMuY29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdHRoaXMudG9vbE9wdGlvbnNEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRTYXZlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENhbmNlbC5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsR0FBRyx1QkFBdUIsUUFBUSxXQUFXLGlCQUFpQjtBQUN2RSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFHcEMsSUFBVyxpQkFBWCxrQkFBV0Esb0JBQVg7QUFDQyxFQUFBQSxnQkFBQSxZQUFTO0FBQ1QsRUFBQUEsZ0JBQUEsY0FBVztBQUNYLEVBQUFBLGdCQUFBLGVBQVk7QUFDWixFQUFBQSxnQkFBQSxhQUFVO0FBQ1YsRUFBQUEsZ0JBQUEsV0FBUTtBQUNSLEVBQUFBLGdCQUFBLFVBQU87QUFDUCxFQUFBQSxnQkFBQSxZQUFTO0FBQ1QsRUFBQUEsZ0JBQUEsU0FBTTtBQUNOLEVBQUFBLGdCQUFBLFVBQU87QUFDUCxFQUFBQSxnQkFBQSxVQUFPO0FBVkcsU0FBQUE7QUFBQSxHQUFBO0FBYVgsTUFBTSxTQUFTO0FBQUEsRUFDZDtBQUFBO0FBQUEsRUFDQTtBQUFBO0FBQUEsRUFDQTtBQUFBO0FBQUEsRUFDQTtBQUFBO0FBQUEsRUFDQTtBQUFBO0FBQUEsRUFDQTtBQUFBO0FBQ0Q7QUFFQSxNQUFNLHNCQUFzQixvQkFBSSxJQUFJLENBQUMsV0FBVyxXQUFXLFdBQVcsYUFBYSxDQUFDO0FBRXBGLE1BQU0sZ0JBQWdCO0FBQUEsRUFDckIsRUFBRSxPQUFPLGNBQWMsT0FBTyw0REFBNEQ7QUFBQSxFQUMxRixFQUFFLE9BQU8sYUFBYSxPQUFPLG9EQUFvRDtBQUFBLEVBQ2pGLEVBQUUsT0FBTyxTQUFTLE9BQU8sb0NBQW9DO0FBQzlEO0FBRUEsTUFBTSx5QkFBeUI7QUFDL0IsTUFBTSxxQkFBcUI7QUFDM0IsTUFBTSxzQkFB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
