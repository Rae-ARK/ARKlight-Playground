import { createFastDomNode } from "../../../../base/browser/fastDomNode.js";
import { Color } from "../../../../base/common/color.js";
import { ViewPart } from "../../view/viewPart.js";
import { Position } from "../../../common/core/position.js";
import { TokenizationRegistry } from "../../../common/languages.js";
import { editorCursorForeground, editorOverviewRulerBorder, editorOverviewRulerBackground, editorMultiCursorSecondaryForeground, editorMultiCursorPrimaryForeground } from "../../../common/core/editorColorRegistry.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { OverviewRulerDecorationsGroup } from "../../../common/viewModel.js";
import { equals } from "../../../../base/common/arrays.js";
class Settings {
  constructor(config, theme) {
    const options = config.options;
    this.lineHeight = options.get(EditorOption.lineHeight);
    this.pixelRatio = options.get(EditorOption.pixelRatio);
    this.overviewRulerLanes = options.get(EditorOption.overviewRulerLanes);
    this.renderBorder = options.get(EditorOption.overviewRulerBorder);
    const borderColor = theme.getColor(editorOverviewRulerBorder);
    this.borderColor = borderColor ? borderColor.toString() : null;
    this.hideCursor = options.get(EditorOption.hideCursorInOverviewRuler);
    const cursorColorSingle = theme.getColor(editorCursorForeground);
    this.cursorColorSingle = cursorColorSingle ? cursorColorSingle.transparent(0.7).toString() : null;
    const cursorColorPrimary = theme.getColor(editorMultiCursorPrimaryForeground);
    this.cursorColorPrimary = cursorColorPrimary ? cursorColorPrimary.transparent(0.7).toString() : null;
    const cursorColorSecondary = theme.getColor(editorMultiCursorSecondaryForeground);
    this.cursorColorSecondary = cursorColorSecondary ? cursorColorSecondary.transparent(0.7).toString() : null;
    this.themeType = theme.type;
    const minimapOpts = options.get(EditorOption.minimap);
    const minimapEnabled = minimapOpts.enabled;
    const minimapSide = minimapOpts.side;
    const themeColor = theme.getColor(editorOverviewRulerBackground);
    const defaultBackground = TokenizationRegistry.getDefaultBackground();
    if (themeColor) {
      this.backgroundColor = themeColor;
    } else if (minimapEnabled && minimapSide === "right") {
      this.backgroundColor = defaultBackground;
    } else {
      this.backgroundColor = null;
    }
    const layoutInfo = options.get(EditorOption.layoutInfo);
    const position = layoutInfo.overviewRuler;
    this.top = position.top;
    this.right = position.right;
    this.domWidth = position.width;
    this.domHeight = position.height;
    if (this.overviewRulerLanes === 0) {
      this.canvasWidth = 0;
      this.canvasHeight = 0;
    } else {
      this.canvasWidth = this.domWidth * this.pixelRatio | 0;
      this.canvasHeight = this.domHeight * this.pixelRatio | 0;
    }
    const [x, w] = this._initLanes(1, this.canvasWidth, this.overviewRulerLanes);
    this.x = x;
    this.w = w;
  }
  _initLanes(canvasLeftOffset, canvasWidth, laneCount) {
    const remainingWidth = canvasWidth - canvasLeftOffset;
    if (laneCount >= 3) {
      const leftWidth = Math.floor(remainingWidth / 3);
      const rightWidth = Math.floor(remainingWidth / 3);
      const centerWidth = remainingWidth - leftWidth - rightWidth;
      const leftOffset = canvasLeftOffset;
      const centerOffset = leftOffset + leftWidth;
      const rightOffset = leftOffset + leftWidth + centerWidth;
      return [
        [
          0,
          leftOffset,
          // Left
          centerOffset,
          // Center
          leftOffset,
          // Left | Center
          rightOffset,
          // Right
          leftOffset,
          // Left | Right
          centerOffset,
          // Center | Right
          leftOffset
          // Left | Center | Right
        ],
        [
          0,
          leftWidth,
          // Left
          centerWidth,
          // Center
          leftWidth + centerWidth,
          // Left | Center
          rightWidth,
          // Right
          leftWidth + centerWidth + rightWidth,
          // Left | Right
          centerWidth + rightWidth,
          // Center | Right
          leftWidth + centerWidth + rightWidth
          // Left | Center | Right
        ]
      ];
    } else if (laneCount === 2) {
      const leftWidth = Math.floor(remainingWidth / 2);
      const rightWidth = remainingWidth - leftWidth;
      const leftOffset = canvasLeftOffset;
      const rightOffset = leftOffset + leftWidth;
      return [
        [
          0,
          leftOffset,
          // Left
          leftOffset,
          // Center
          leftOffset,
          // Left | Center
          rightOffset,
          // Right
          leftOffset,
          // Left | Right
          leftOffset,
          // Center | Right
          leftOffset
          // Left | Center | Right
        ],
        [
          0,
          leftWidth,
          // Left
          leftWidth,
          // Center
          leftWidth,
          // Left | Center
          rightWidth,
          // Right
          leftWidth + rightWidth,
          // Left | Right
          leftWidth + rightWidth,
          // Center | Right
          leftWidth + rightWidth
          // Left | Center | Right
        ]
      ];
    } else {
      const offset = canvasLeftOffset;
      const width = remainingWidth;
      return [
        [
          0,
          offset,
          // Left
          offset,
          // Center
          offset,
          // Left | Center
          offset,
          // Right
          offset,
          // Left | Right
          offset,
          // Center | Right
          offset
          // Left | Center | Right
        ],
        [
          0,
          width,
          // Left
          width,
          // Center
          width,
          // Left | Center
          width,
          // Right
          width,
          // Left | Right
          width,
          // Center | Right
          width
          // Left | Center | Right
        ]
      ];
    }
  }
  equals(other) {
    return this.lineHeight === other.lineHeight && this.pixelRatio === other.pixelRatio && this.overviewRulerLanes === other.overviewRulerLanes && this.renderBorder === other.renderBorder && this.borderColor === other.borderColor && this.hideCursor === other.hideCursor && this.cursorColorSingle === other.cursorColorSingle && this.cursorColorPrimary === other.cursorColorPrimary && this.cursorColorSecondary === other.cursorColorSecondary && this.themeType === other.themeType && Color.equals(this.backgroundColor, other.backgroundColor) && this.top === other.top && this.right === other.right && this.domWidth === other.domWidth && this.domHeight === other.domHeight && this.canvasWidth === other.canvasWidth && this.canvasHeight === other.canvasHeight;
  }
}
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["MIN_DECORATION_HEIGHT"] = 6] = "MIN_DECORATION_HEIGHT";
  return Constants2;
})(Constants || {});
var OverviewRulerLane = /* @__PURE__ */ ((OverviewRulerLane2) => {
  OverviewRulerLane2[OverviewRulerLane2["Left"] = 1] = "Left";
  OverviewRulerLane2[OverviewRulerLane2["Center"] = 2] = "Center";
  OverviewRulerLane2[OverviewRulerLane2["Right"] = 4] = "Right";
  OverviewRulerLane2[OverviewRulerLane2["Full"] = 7] = "Full";
  return OverviewRulerLane2;
})(OverviewRulerLane || {});
var ShouldRenderValue = /* @__PURE__ */ ((ShouldRenderValue2) => {
  ShouldRenderValue2[ShouldRenderValue2["NotNeeded"] = 0] = "NotNeeded";
  ShouldRenderValue2[ShouldRenderValue2["Maybe"] = 1] = "Maybe";
  ShouldRenderValue2[ShouldRenderValue2["Needed"] = 2] = "Needed";
  return ShouldRenderValue2;
})(ShouldRenderValue || {});
class DecorationsOverviewRuler extends ViewPart {
  constructor(context) {
    super(context);
    this._actualShouldRender = 0 /* NotNeeded */;
    this._renderedDecorations = [];
    this._renderedCursorPositions = [];
    this._domNode = createFastDomNode(document.createElement("canvas"));
    this._domNode.setClassName("decorationsOverviewRuler");
    this._domNode.setPosition("absolute");
    this._domNode.setLayerHinting(true);
    this._domNode.setContain("strict");
    this._domNode.setAttribute("aria-hidden", "true");
    this._updateSettings(false);
    this._tokensColorTrackerListener = TokenizationRegistry.onDidChange((e) => {
      if (e.changedColorMap) {
        this._updateSettings(true);
      }
    });
    this._cursorPositions = [{ position: new Position(1, 1), color: this._settings.cursorColorSingle }];
  }
  dispose() {
    super.dispose();
    this._tokensColorTrackerListener.dispose();
  }
  _updateSettings(renderNow) {
    const newSettings = new Settings(this._context.configuration, this._context.theme);
    if (this._settings && this._settings.equals(newSettings)) {
      return false;
    }
    this._settings = newSettings;
    this._domNode.setTop(this._settings.top);
    this._domNode.setRight(this._settings.right);
    this._domNode.setWidth(this._settings.domWidth);
    this._domNode.setHeight(this._settings.domHeight);
    this._domNode.domNode.width = this._settings.canvasWidth;
    this._domNode.domNode.height = this._settings.canvasHeight;
    if (renderNow) {
      this._render();
    }
    return true;
  }
  // ---- begin view event handlers
  _markRenderingIsNeeded() {
    this._actualShouldRender = 2 /* Needed */;
    return true;
  }
  _markRenderingIsMaybeNeeded() {
    this._actualShouldRender = 1 /* Maybe */;
    return true;
  }
  onConfigurationChanged(e) {
    return this._updateSettings(false) ? this._markRenderingIsNeeded() : false;
  }
  onCursorStateChanged(e) {
    this._cursorPositions = [];
    for (let i = 0, len = e.selections.length; i < len; i++) {
      let color = this._settings.cursorColorSingle;
      if (len > 1) {
        color = i === 0 ? this._settings.cursorColorPrimary : this._settings.cursorColorSecondary;
      }
      this._cursorPositions.push({ position: e.selections[i].getPosition(), color });
    }
    this._cursorPositions.sort((a, b) => Position.compare(a.position, b.position));
    return this._markRenderingIsMaybeNeeded();
  }
  onDecorationsChanged(e) {
    if (e.affectsOverviewRuler) {
      return this._markRenderingIsMaybeNeeded();
    }
    return false;
  }
  onFlushed(e) {
    return this._markRenderingIsNeeded();
  }
  onScrollChanged(e) {
    return e.scrollHeightChanged ? this._markRenderingIsNeeded() : false;
  }
  onZonesChanged(e) {
    return this._markRenderingIsNeeded();
  }
  onThemeChanged(e) {
    return this._updateSettings(false) ? this._markRenderingIsNeeded() : false;
  }
  // ---- end view event handlers
  getDomNode() {
    return this._domNode.domNode;
  }
  prepareRender(ctx) {
  }
  render(editorCtx) {
    this._render();
    this._actualShouldRender = 0 /* NotNeeded */;
  }
  _render() {
    const backgroundColor = this._settings.backgroundColor;
    if (this._settings.overviewRulerLanes === 0) {
      this._domNode.setBackgroundColor(backgroundColor ? Color.Format.CSS.formatHexA(backgroundColor) : "");
      this._domNode.setDisplay("none");
      return;
    }
    const decorations = this._context.viewModel.getAllOverviewRulerDecorations(this._context.theme);
    decorations.sort(OverviewRulerDecorationsGroup.compareByRenderingProps);
    if (this._actualShouldRender === 1 /* Maybe */ && !OverviewRulerDecorationsGroup.equalsArr(this._renderedDecorations, decorations)) {
      this._actualShouldRender = 2 /* Needed */;
    }
    if (this._actualShouldRender === 1 /* Maybe */ && !equals(this._renderedCursorPositions, this._cursorPositions, (a, b) => a.position.lineNumber === b.position.lineNumber && a.color === b.color)) {
      this._actualShouldRender = 2 /* Needed */;
    }
    if (this._actualShouldRender === 1 /* Maybe */) {
      return;
    }
    this._renderedDecorations = decorations;
    this._renderedCursorPositions = this._cursorPositions;
    this._domNode.setDisplay("block");
    const canvasWidth = this._settings.canvasWidth;
    const canvasHeight = this._settings.canvasHeight;
    const lineHeight = this._settings.lineHeight;
    const viewLayout = this._context.viewLayout;
    const outerHeight = this._context.viewLayout.getScrollHeight();
    const heightRatio = canvasHeight / outerHeight;
    const minDecorationHeight = 6 /* MIN_DECORATION_HEIGHT */ * this._settings.pixelRatio | 0;
    const halfMinDecorationHeight = minDecorationHeight / 2 | 0;
    const canvasCtx = this._domNode.domNode.getContext("2d");
    if (backgroundColor) {
      if (backgroundColor.isOpaque()) {
        canvasCtx.fillStyle = Color.Format.CSS.formatHexA(backgroundColor);
        canvasCtx.fillRect(0, 0, canvasWidth, canvasHeight);
      } else {
        canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        canvasCtx.fillStyle = Color.Format.CSS.formatHexA(backgroundColor);
        canvasCtx.fillRect(0, 0, canvasWidth, canvasHeight);
      }
    } else {
      canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    }
    const x = this._settings.x;
    const w = this._settings.w;
    for (const decorationGroup of decorations) {
      const color = decorationGroup.color;
      const decorationGroupData = decorationGroup.data;
      canvasCtx.fillStyle = color;
      let prevLane = 0;
      let prevY1 = 0;
      let prevY2 = 0;
      for (let i = 0, len = decorationGroupData.length / 3; i < len; i++) {
        const lane = decorationGroupData[3 * i];
        const startLineNumber = decorationGroupData[3 * i + 1];
        const endLineNumber = decorationGroupData[3 * i + 2];
        let y1 = viewLayout.getVerticalOffsetForLineNumber(startLineNumber) * heightRatio | 0;
        let y2 = (viewLayout.getVerticalOffsetForLineNumber(endLineNumber) + lineHeight) * heightRatio | 0;
        const height = y2 - y1;
        if (height < minDecorationHeight) {
          let yCenter = (y1 + y2) / 2 | 0;
          if (yCenter < halfMinDecorationHeight) {
            yCenter = halfMinDecorationHeight;
          } else if (yCenter + halfMinDecorationHeight > canvasHeight) {
            yCenter = canvasHeight - halfMinDecorationHeight;
          }
          y1 = yCenter - halfMinDecorationHeight;
          y2 = yCenter + halfMinDecorationHeight;
        }
        if (y1 > prevY2 + 1 || lane !== prevLane) {
          if (i !== 0) {
            canvasCtx.fillRect(x[prevLane], prevY1, w[prevLane], prevY2 - prevY1);
          }
          prevLane = lane;
          prevY1 = y1;
          prevY2 = y2;
        } else {
          if (y2 > prevY2) {
            prevY2 = y2;
          }
        }
      }
      canvasCtx.fillRect(x[prevLane], prevY1, w[prevLane], prevY2 - prevY1);
    }
    if (!this._settings.hideCursor) {
      const cursorHeight = 2 * this._settings.pixelRatio | 0;
      const halfCursorHeight = cursorHeight / 2 | 0;
      const cursorX = this._settings.x[7 /* Full */];
      const cursorW = this._settings.w[7 /* Full */];
      let prevY1 = -100;
      let prevY2 = -100;
      let prevColor = null;
      for (let i = 0, len = this._cursorPositions.length; i < len; i++) {
        const color = this._cursorPositions[i].color;
        if (!color) {
          continue;
        }
        const cursor = this._cursorPositions[i].position;
        let yCenter = viewLayout.getVerticalOffsetForLineNumber(cursor.lineNumber) * heightRatio | 0;
        if (yCenter < halfCursorHeight) {
          yCenter = halfCursorHeight;
        } else if (yCenter + halfCursorHeight > canvasHeight) {
          yCenter = canvasHeight - halfCursorHeight;
        }
        const y1 = yCenter - halfCursorHeight;
        const y2 = y1 + cursorHeight;
        if (y1 > prevY2 + 1 || color !== prevColor) {
          if (i !== 0 && prevColor) {
            canvasCtx.fillRect(cursorX, prevY1, cursorW, prevY2 - prevY1);
          }
          prevY1 = y1;
          prevY2 = y2;
        } else {
          if (y2 > prevY2) {
            prevY2 = y2;
          }
        }
        prevColor = color;
        canvasCtx.fillStyle = color;
      }
      if (prevColor) {
        canvasCtx.fillRect(cursorX, prevY1, cursorW, prevY2 - prevY1);
      }
    }
    if (this._settings.renderBorder && this._settings.borderColor && this._settings.overviewRulerLanes > 0) {
      canvasCtx.beginPath();
      canvasCtx.lineWidth = 1;
      canvasCtx.strokeStyle = this._settings.borderColor;
      canvasCtx.moveTo(0, 0);
      canvasCtx.lineTo(0, canvasHeight);
      canvasCtx.moveTo(1, 0);
      canvasCtx.lineTo(canvasWidth, 0);
      canvasCtx.stroke();
    }
  }
}
export {
  DecorationsOverviewRuler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3ZpZXdQYXJ0cy9vdmVydmlld1J1bGVyL2RlY29yYXRpb25zT3ZlcnZpZXdSdWxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEZhc3REb21Ob2RlLCBjcmVhdGVGYXN0RG9tTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mYXN0RG9tTm9kZS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFZpZXdQYXJ0IH0gZnJvbSAnLi4vLi4vdmlldy92aWV3UGFydC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBlZGl0b3JDdXJzb3JGb3JlZ3JvdW5kLCBlZGl0b3JPdmVydmlld1J1bGVyQm9yZGVyLCBlZGl0b3JPdmVydmlld1J1bGVyQmFja2dyb3VuZCwgZWRpdG9yTXVsdGlDdXJzb3JTZWNvbmRhcnlGb3JlZ3JvdW5kLCBlZGl0b3JNdWx0aUN1cnNvclByaW1hcnlGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdG9yQ29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZW5kZXJpbmdDb250ZXh0LCBSZXN0cmljdGVkUmVuZGVyaW5nQ29udGV4dCB9IGZyb20gJy4uLy4uL3ZpZXcvcmVuZGVyaW5nQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvdmlld0NvbnRleHQuanMnO1xuaW1wb3J0IHsgRWRpdG9yVGhlbWUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yVGhlbWUuanMnO1xuaW1wb3J0ICogYXMgdmlld0V2ZW50cyBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0V2ZW50cy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgT3ZlcnZpZXdSdWxlckRlY29yYXRpb25zR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5cbmNsYXNzIFNldHRpbmdzIHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgbGluZUhlaWdodDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgcGl4ZWxSYXRpbzogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgb3ZlcnZpZXdSdWxlckxhbmVzOiBudW1iZXI7XG5cblx0cHVibGljIHJlYWRvbmx5IHJlbmRlckJvcmRlcjogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IGJvcmRlckNvbG9yOiBzdHJpbmcgfCBudWxsO1xuXG5cdHB1YmxpYyByZWFkb25seSBoaWRlQ3Vyc29yOiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgY3Vyc29yQ29sb3JTaW5nbGU6IHN0cmluZyB8IG51bGw7XG5cdHB1YmxpYyByZWFkb25seSBjdXJzb3JDb2xvclByaW1hcnk6IHN0cmluZyB8IG51bGw7XG5cdHB1YmxpYyByZWFkb25seSBjdXJzb3JDb2xvclNlY29uZGFyeTogc3RyaW5nIHwgbnVsbDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdGhlbWVUeXBlOiAnbGlnaHQnIHwgJ2RhcmsnIHwgJ2hjTGlnaHQnIHwgJ2hjRGFyayc7XG5cdHB1YmxpYyByZWFkb25seSBiYWNrZ3JvdW5kQ29sb3I6IENvbG9yIHwgbnVsbDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdG9wOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSByaWdodDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tV2lkdGg6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IGRvbUhlaWdodDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgY2FudmFzV2lkdGg6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IGNhbnZhc0hlaWdodDogbnVtYmVyO1xuXG5cdHB1YmxpYyByZWFkb25seSB4OiBudW1iZXJbXTtcblx0cHVibGljIHJlYWRvbmx5IHc6IG51bWJlcltdO1xuXG5cdGNvbnN0cnVjdG9yKGNvbmZpZzogSUVkaXRvckNvbmZpZ3VyYXRpb24sIHRoZW1lOiBFZGl0b3JUaGVtZSkge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBjb25maWcub3B0aW9ucztcblx0XHR0aGlzLmxpbmVIZWlnaHQgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0dGhpcy5waXhlbFJhdGlvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnBpeGVsUmF0aW8pO1xuXHRcdHRoaXMub3ZlcnZpZXdSdWxlckxhbmVzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLm92ZXJ2aWV3UnVsZXJMYW5lcyk7XG5cblx0XHR0aGlzLnJlbmRlckJvcmRlciA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5vdmVydmlld1J1bGVyQm9yZGVyKTtcblx0XHRjb25zdCBib3JkZXJDb2xvciA9IHRoZW1lLmdldENvbG9yKGVkaXRvck92ZXJ2aWV3UnVsZXJCb3JkZXIpO1xuXHRcdHRoaXMuYm9yZGVyQ29sb3IgPSBib3JkZXJDb2xvciA/IGJvcmRlckNvbG9yLnRvU3RyaW5nKCkgOiBudWxsO1xuXG5cdFx0dGhpcy5oaWRlQ3Vyc29yID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmhpZGVDdXJzb3JJbk92ZXJ2aWV3UnVsZXIpO1xuXHRcdGNvbnN0IGN1cnNvckNvbG9yU2luZ2xlID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yQ3Vyc29yRm9yZWdyb3VuZCk7XG5cdFx0dGhpcy5jdXJzb3JDb2xvclNpbmdsZSA9IGN1cnNvckNvbG9yU2luZ2xlID8gY3Vyc29yQ29sb3JTaW5nbGUudHJhbnNwYXJlbnQoMC43KS50b1N0cmluZygpIDogbnVsbDtcblx0XHRjb25zdCBjdXJzb3JDb2xvclByaW1hcnkgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JNdWx0aUN1cnNvclByaW1hcnlGb3JlZ3JvdW5kKTtcblx0XHR0aGlzLmN1cnNvckNvbG9yUHJpbWFyeSA9IGN1cnNvckNvbG9yUHJpbWFyeSA/IGN1cnNvckNvbG9yUHJpbWFyeS50cmFuc3BhcmVudCgwLjcpLnRvU3RyaW5nKCkgOiBudWxsO1xuXHRcdGNvbnN0IGN1cnNvckNvbG9yU2Vjb25kYXJ5ID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yTXVsdGlDdXJzb3JTZWNvbmRhcnlGb3JlZ3JvdW5kKTtcblx0XHR0aGlzLmN1cnNvckNvbG9yU2Vjb25kYXJ5ID0gY3Vyc29yQ29sb3JTZWNvbmRhcnkgPyBjdXJzb3JDb2xvclNlY29uZGFyeS50cmFuc3BhcmVudCgwLjcpLnRvU3RyaW5nKCkgOiBudWxsO1xuXG5cdFx0dGhpcy50aGVtZVR5cGUgPSB0aGVtZS50eXBlO1xuXG5cdFx0Y29uc3QgbWluaW1hcE9wdHMgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubWluaW1hcCk7XG5cdFx0Y29uc3QgbWluaW1hcEVuYWJsZWQgPSBtaW5pbWFwT3B0cy5lbmFibGVkO1xuXHRcdGNvbnN0IG1pbmltYXBTaWRlID0gbWluaW1hcE9wdHMuc2lkZTtcblx0XHRjb25zdCB0aGVtZUNvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yT3ZlcnZpZXdSdWxlckJhY2tncm91bmQpO1xuXHRcdGNvbnN0IGRlZmF1bHRCYWNrZ3JvdW5kID0gVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0RGVmYXVsdEJhY2tncm91bmQoKTtcblxuXHRcdGlmICh0aGVtZUNvbG9yKSB7XG5cdFx0XHR0aGlzLmJhY2tncm91bmRDb2xvciA9IHRoZW1lQ29sb3I7XG5cdFx0fSBlbHNlIGlmIChtaW5pbWFwRW5hYmxlZCAmJiBtaW5pbWFwU2lkZSA9PT0gJ3JpZ2h0Jykge1xuXHRcdFx0dGhpcy5iYWNrZ3JvdW5kQ29sb3IgPSBkZWZhdWx0QmFja2dyb3VuZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5iYWNrZ3JvdW5kQ29sb3IgPSBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxheW91dEluZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbyk7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBsYXlvdXRJbmZvLm92ZXJ2aWV3UnVsZXI7XG5cdFx0dGhpcy50b3AgPSBwb3NpdGlvbi50b3A7XG5cdFx0dGhpcy5yaWdodCA9IHBvc2l0aW9uLnJpZ2h0O1xuXHRcdHRoaXMuZG9tV2lkdGggPSBwb3NpdGlvbi53aWR0aDtcblx0XHR0aGlzLmRvbUhlaWdodCA9IHBvc2l0aW9uLmhlaWdodDtcblx0XHRpZiAodGhpcy5vdmVydmlld1J1bGVyTGFuZXMgPT09IDApIHtcblx0XHRcdC8vIG92ZXJ2aWV3IHJ1bGVyIGlzIG9mZlxuXHRcdFx0dGhpcy5jYW52YXNXaWR0aCA9IDA7XG5cdFx0XHR0aGlzLmNhbnZhc0hlaWdodCA9IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY2FudmFzV2lkdGggPSAodGhpcy5kb21XaWR0aCAqIHRoaXMucGl4ZWxSYXRpbykgfCAwO1xuXHRcdFx0dGhpcy5jYW52YXNIZWlnaHQgPSAodGhpcy5kb21IZWlnaHQgKiB0aGlzLnBpeGVsUmF0aW8pIHwgMDtcblx0XHR9XG5cblx0XHRjb25zdCBbeCwgd10gPSB0aGlzLl9pbml0TGFuZXMoMSwgdGhpcy5jYW52YXNXaWR0aCwgdGhpcy5vdmVydmlld1J1bGVyTGFuZXMpO1xuXHRcdHRoaXMueCA9IHg7XG5cdFx0dGhpcy53ID0gdztcblx0fVxuXG5cdHByaXZhdGUgX2luaXRMYW5lcyhjYW52YXNMZWZ0T2Zmc2V0OiBudW1iZXIsIGNhbnZhc1dpZHRoOiBudW1iZXIsIGxhbmVDb3VudDogbnVtYmVyKTogW251bWJlcltdLCBudW1iZXJbXV0ge1xuXHRcdGNvbnN0IHJlbWFpbmluZ1dpZHRoID0gY2FudmFzV2lkdGggLSBjYW52YXNMZWZ0T2Zmc2V0O1xuXG5cdFx0aWYgKGxhbmVDb3VudCA+PSAzKSB7XG5cdFx0XHRjb25zdCBsZWZ0V2lkdGggPSBNYXRoLmZsb29yKHJlbWFpbmluZ1dpZHRoIC8gMyk7XG5cdFx0XHRjb25zdCByaWdodFdpZHRoID0gTWF0aC5mbG9vcihyZW1haW5pbmdXaWR0aCAvIDMpO1xuXHRcdFx0Y29uc3QgY2VudGVyV2lkdGggPSByZW1haW5pbmdXaWR0aCAtIGxlZnRXaWR0aCAtIHJpZ2h0V2lkdGg7XG5cdFx0XHRjb25zdCBsZWZ0T2Zmc2V0ID0gY2FudmFzTGVmdE9mZnNldDtcblx0XHRcdGNvbnN0IGNlbnRlck9mZnNldCA9IGxlZnRPZmZzZXQgKyBsZWZ0V2lkdGg7XG5cdFx0XHRjb25zdCByaWdodE9mZnNldCA9IGxlZnRPZmZzZXQgKyBsZWZ0V2lkdGggKyBjZW50ZXJXaWR0aDtcblxuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0W1xuXHRcdFx0XHRcdDAsXG5cdFx0XHRcdFx0bGVmdE9mZnNldCwgLy8gTGVmdFxuXHRcdFx0XHRcdGNlbnRlck9mZnNldCwgLy8gQ2VudGVyXG5cdFx0XHRcdFx0bGVmdE9mZnNldCwgLy8gTGVmdCB8IENlbnRlclxuXHRcdFx0XHRcdHJpZ2h0T2Zmc2V0LCAvLyBSaWdodFxuXHRcdFx0XHRcdGxlZnRPZmZzZXQsIC8vIExlZnQgfCBSaWdodFxuXHRcdFx0XHRcdGNlbnRlck9mZnNldCwgLy8gQ2VudGVyIHwgUmlnaHRcblx0XHRcdFx0XHRsZWZ0T2Zmc2V0LCAvLyBMZWZ0IHwgQ2VudGVyIHwgUmlnaHRcblx0XHRcdFx0XSwgW1xuXHRcdFx0XHRcdDAsXG5cdFx0XHRcdFx0bGVmdFdpZHRoLCAvLyBMZWZ0XG5cdFx0XHRcdFx0Y2VudGVyV2lkdGgsIC8vIENlbnRlclxuXHRcdFx0XHRcdGxlZnRXaWR0aCArIGNlbnRlcldpZHRoLCAvLyBMZWZ0IHwgQ2VudGVyXG5cdFx0XHRcdFx0cmlnaHRXaWR0aCwgLy8gUmlnaHRcblx0XHRcdFx0XHRsZWZ0V2lkdGggKyBjZW50ZXJXaWR0aCArIHJpZ2h0V2lkdGgsIC8vIExlZnQgfCBSaWdodFxuXHRcdFx0XHRcdGNlbnRlcldpZHRoICsgcmlnaHRXaWR0aCwgLy8gQ2VudGVyIHwgUmlnaHRcblx0XHRcdFx0XHRsZWZ0V2lkdGggKyBjZW50ZXJXaWR0aCArIHJpZ2h0V2lkdGgsIC8vIExlZnQgfCBDZW50ZXIgfCBSaWdodFxuXHRcdFx0XHRdXG5cdFx0XHRdO1xuXHRcdH0gZWxzZSBpZiAobGFuZUNvdW50ID09PSAyKSB7XG5cdFx0XHRjb25zdCBsZWZ0V2lkdGggPSBNYXRoLmZsb29yKHJlbWFpbmluZ1dpZHRoIC8gMik7XG5cdFx0XHRjb25zdCByaWdodFdpZHRoID0gcmVtYWluaW5nV2lkdGggLSBsZWZ0V2lkdGg7XG5cdFx0XHRjb25zdCBsZWZ0T2Zmc2V0ID0gY2FudmFzTGVmdE9mZnNldDtcblx0XHRcdGNvbnN0IHJpZ2h0T2Zmc2V0ID0gbGVmdE9mZnNldCArIGxlZnRXaWR0aDtcblxuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0W1xuXHRcdFx0XHRcdDAsXG5cdFx0XHRcdFx0bGVmdE9mZnNldCwgLy8gTGVmdFxuXHRcdFx0XHRcdGxlZnRPZmZzZXQsIC8vIENlbnRlclxuXHRcdFx0XHRcdGxlZnRPZmZzZXQsIC8vIExlZnQgfCBDZW50ZXJcblx0XHRcdFx0XHRyaWdodE9mZnNldCwgLy8gUmlnaHRcblx0XHRcdFx0XHRsZWZ0T2Zmc2V0LCAvLyBMZWZ0IHwgUmlnaHRcblx0XHRcdFx0XHRsZWZ0T2Zmc2V0LCAvLyBDZW50ZXIgfCBSaWdodFxuXHRcdFx0XHRcdGxlZnRPZmZzZXQsIC8vIExlZnQgfCBDZW50ZXIgfCBSaWdodFxuXHRcdFx0XHRdLCBbXG5cdFx0XHRcdFx0MCxcblx0XHRcdFx0XHRsZWZ0V2lkdGgsIC8vIExlZnRcblx0XHRcdFx0XHRsZWZ0V2lkdGgsIC8vIENlbnRlclxuXHRcdFx0XHRcdGxlZnRXaWR0aCwgLy8gTGVmdCB8IENlbnRlclxuXHRcdFx0XHRcdHJpZ2h0V2lkdGgsIC8vIFJpZ2h0XG5cdFx0XHRcdFx0bGVmdFdpZHRoICsgcmlnaHRXaWR0aCwgLy8gTGVmdCB8IFJpZ2h0XG5cdFx0XHRcdFx0bGVmdFdpZHRoICsgcmlnaHRXaWR0aCwgLy8gQ2VudGVyIHwgUmlnaHRcblx0XHRcdFx0XHRsZWZ0V2lkdGggKyByaWdodFdpZHRoLCAvLyBMZWZ0IHwgQ2VudGVyIHwgUmlnaHRcblx0XHRcdFx0XVxuXHRcdFx0XTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgb2Zmc2V0ID0gY2FudmFzTGVmdE9mZnNldDtcblx0XHRcdGNvbnN0IHdpZHRoID0gcmVtYWluaW5nV2lkdGg7XG5cblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQwLFxuXHRcdFx0XHRcdG9mZnNldCwgLy8gTGVmdFxuXHRcdFx0XHRcdG9mZnNldCwgLy8gQ2VudGVyXG5cdFx0XHRcdFx0b2Zmc2V0LCAvLyBMZWZ0IHwgQ2VudGVyXG5cdFx0XHRcdFx0b2Zmc2V0LCAvLyBSaWdodFxuXHRcdFx0XHRcdG9mZnNldCwgLy8gTGVmdCB8IFJpZ2h0XG5cdFx0XHRcdFx0b2Zmc2V0LCAvLyBDZW50ZXIgfCBSaWdodFxuXHRcdFx0XHRcdG9mZnNldCwgLy8gTGVmdCB8IENlbnRlciB8IFJpZ2h0XG5cdFx0XHRcdF0sIFtcblx0XHRcdFx0XHQwLFxuXHRcdFx0XHRcdHdpZHRoLCAvLyBMZWZ0XG5cdFx0XHRcdFx0d2lkdGgsIC8vIENlbnRlclxuXHRcdFx0XHRcdHdpZHRoLCAvLyBMZWZ0IHwgQ2VudGVyXG5cdFx0XHRcdFx0d2lkdGgsIC8vIFJpZ2h0XG5cdFx0XHRcdFx0d2lkdGgsIC8vIExlZnQgfCBSaWdodFxuXHRcdFx0XHRcdHdpZHRoLCAvLyBDZW50ZXIgfCBSaWdodFxuXHRcdFx0XHRcdHdpZHRoLCAvLyBMZWZ0IHwgQ2VudGVyIHwgUmlnaHRcblx0XHRcdFx0XVxuXHRcdFx0XTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBTZXR0aW5ncyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHR0aGlzLmxpbmVIZWlnaHQgPT09IG90aGVyLmxpbmVIZWlnaHRcblx0XHRcdCYmIHRoaXMucGl4ZWxSYXRpbyA9PT0gb3RoZXIucGl4ZWxSYXRpb1xuXHRcdFx0JiYgdGhpcy5vdmVydmlld1J1bGVyTGFuZXMgPT09IG90aGVyLm92ZXJ2aWV3UnVsZXJMYW5lc1xuXHRcdFx0JiYgdGhpcy5yZW5kZXJCb3JkZXIgPT09IG90aGVyLnJlbmRlckJvcmRlclxuXHRcdFx0JiYgdGhpcy5ib3JkZXJDb2xvciA9PT0gb3RoZXIuYm9yZGVyQ29sb3Jcblx0XHRcdCYmIHRoaXMuaGlkZUN1cnNvciA9PT0gb3RoZXIuaGlkZUN1cnNvclxuXHRcdFx0JiYgdGhpcy5jdXJzb3JDb2xvclNpbmdsZSA9PT0gb3RoZXIuY3Vyc29yQ29sb3JTaW5nbGVcblx0XHRcdCYmIHRoaXMuY3Vyc29yQ29sb3JQcmltYXJ5ID09PSBvdGhlci5jdXJzb3JDb2xvclByaW1hcnlcblx0XHRcdCYmIHRoaXMuY3Vyc29yQ29sb3JTZWNvbmRhcnkgPT09IG90aGVyLmN1cnNvckNvbG9yU2Vjb25kYXJ5XG5cdFx0XHQmJiB0aGlzLnRoZW1lVHlwZSA9PT0gb3RoZXIudGhlbWVUeXBlXG5cdFx0XHQmJiBDb2xvci5lcXVhbHModGhpcy5iYWNrZ3JvdW5kQ29sb3IsIG90aGVyLmJhY2tncm91bmRDb2xvcilcblx0XHRcdCYmIHRoaXMudG9wID09PSBvdGhlci50b3Bcblx0XHRcdCYmIHRoaXMucmlnaHQgPT09IG90aGVyLnJpZ2h0XG5cdFx0XHQmJiB0aGlzLmRvbVdpZHRoID09PSBvdGhlci5kb21XaWR0aFxuXHRcdFx0JiYgdGhpcy5kb21IZWlnaHQgPT09IG90aGVyLmRvbUhlaWdodFxuXHRcdFx0JiYgdGhpcy5jYW52YXNXaWR0aCA9PT0gb3RoZXIuY2FudmFzV2lkdGhcblx0XHRcdCYmIHRoaXMuY2FudmFzSGVpZ2h0ID09PSBvdGhlci5jYW52YXNIZWlnaHRcblx0XHQpO1xuXHR9XG59XG5cbmNvbnN0IGVudW0gQ29uc3RhbnRzIHtcblx0TUlOX0RFQ09SQVRJT05fSEVJR0hUID0gNlxufVxuXG5jb25zdCBlbnVtIE92ZXJ2aWV3UnVsZXJMYW5lIHtcblx0TGVmdCA9IDEsXG5cdENlbnRlciA9IDIsXG5cdFJpZ2h0ID0gNCxcblx0RnVsbCA9IDdcbn1cblxudHlwZSBDdXJzb3IgPSB7XG5cdHBvc2l0aW9uOiBQb3NpdGlvbjtcblx0Y29sb3I6IHN0cmluZyB8IG51bGw7XG59O1xuXG5jb25zdCBlbnVtIFNob3VsZFJlbmRlclZhbHVlIHtcblx0Tm90TmVlZGVkID0gMCxcblx0TWF5YmUgPSAxLFxuXHROZWVkZWQgPSAyXG59XG5cbmV4cG9ydCBjbGFzcyBEZWNvcmF0aW9uc092ZXJ2aWV3UnVsZXIgZXh0ZW5kcyBWaWV3UGFydCB7XG5cblx0cHJpdmF0ZSBfYWN0dWFsU2hvdWxkUmVuZGVyOiBTaG91bGRSZW5kZXJWYWx1ZSA9IFNob3VsZFJlbmRlclZhbHVlLk5vdE5lZWRlZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90b2tlbnNDb2xvclRyYWNrZXJMaXN0ZW5lcjogSURpc3Bvc2FibGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxDYW52YXNFbGVtZW50Pjtcblx0cHJpdmF0ZSBfc2V0dGluZ3MhOiBTZXR0aW5ncztcblx0cHJpdmF0ZSBfY3Vyc29yUG9zaXRpb25zOiBDdXJzb3JbXTtcblxuXHRwcml2YXRlIF9yZW5kZXJlZERlY29yYXRpb25zOiBPdmVydmlld1J1bGVyRGVjb3JhdGlvbnNHcm91cFtdID0gW107XG5cdHByaXZhdGUgX3JlbmRlcmVkQ3Vyc29yUG9zaXRpb25zOiBDdXJzb3JbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRleHQ6IFZpZXdDb250ZXh0KSB7XG5cdFx0c3VwZXIoY29udGV4dCk7XG5cblx0XHR0aGlzLl9kb21Ob2RlID0gY3JlYXRlRmFzdERvbU5vZGUoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJykpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0Q2xhc3NOYW1lKCdkZWNvcmF0aW9uc092ZXJ2aWV3UnVsZXInKTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldFBvc2l0aW9uKCdhYnNvbHV0ZScpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0TGF5ZXJIaW50aW5nKHRydWUpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0Q29udGFpbignc3RyaWN0Jyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdHRoaXMuX3VwZGF0ZVNldHRpbmdzKGZhbHNlKTtcblxuXHRcdHRoaXMuX3Rva2Vuc0NvbG9yVHJhY2tlckxpc3RlbmVyID0gVG9rZW5pemF0aW9uUmVnaXN0cnkub25EaWRDaGFuZ2UoKGUpID0+IHtcblx0XHRcdGlmIChlLmNoYW5nZWRDb2xvck1hcCkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVTZXR0aW5ncyh0cnVlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX2N1cnNvclBvc2l0aW9ucyA9IFt7IHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgMSksIGNvbG9yOiB0aGlzLl9zZXR0aW5ncy5jdXJzb3JDb2xvclNpbmdsZSB9XTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl90b2tlbnNDb2xvclRyYWNrZXJMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTZXR0aW5ncyhyZW5kZXJOb3c6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRjb25zdCBuZXdTZXR0aW5ncyA9IG5ldyBTZXR0aW5ncyh0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24sIHRoaXMuX2NvbnRleHQudGhlbWUpO1xuXHRcdGlmICh0aGlzLl9zZXR0aW5ncyAmJiB0aGlzLl9zZXR0aW5ncy5lcXVhbHMobmV3U2V0dGluZ3MpKSB7XG5cdFx0XHQvLyBub3RoaW5nIHRvIGRvXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2V0dGluZ3MgPSBuZXdTZXR0aW5ncztcblxuXHRcdHRoaXMuX2RvbU5vZGUuc2V0VG9wKHRoaXMuX3NldHRpbmdzLnRvcCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRSaWdodCh0aGlzLl9zZXR0aW5ncy5yaWdodCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRXaWR0aCh0aGlzLl9zZXR0aW5ncy5kb21XaWR0aCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRIZWlnaHQodGhpcy5fc2V0dGluZ3MuZG9tSGVpZ2h0KTtcblx0XHR0aGlzLl9kb21Ob2RlLmRvbU5vZGUud2lkdGggPSB0aGlzLl9zZXR0aW5ncy5jYW52YXNXaWR0aDtcblx0XHR0aGlzLl9kb21Ob2RlLmRvbU5vZGUuaGVpZ2h0ID0gdGhpcy5fc2V0dGluZ3MuY2FudmFzSGVpZ2h0O1xuXG5cdFx0aWYgKHJlbmRlck5vdykge1xuXHRcdFx0dGhpcy5fcmVuZGVyKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyAtLS0tIGJlZ2luIHZpZXcgZXZlbnQgaGFuZGxlcnNcblxuXHRwcml2YXRlIF9tYXJrUmVuZGVyaW5nSXNOZWVkZWQoKTogdHJ1ZSB7XG5cdFx0dGhpcy5fYWN0dWFsU2hvdWxkUmVuZGVyID0gU2hvdWxkUmVuZGVyVmFsdWUuTmVlZGVkO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWFya1JlbmRlcmluZ0lzTWF5YmVOZWVkZWQoKTogdHJ1ZSB7XG5cdFx0dGhpcy5fYWN0dWFsU2hvdWxkUmVuZGVyID0gU2hvdWxkUmVuZGVyVmFsdWUuTWF5YmU7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25Db25maWd1cmF0aW9uQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3VwZGF0ZVNldHRpbmdzKGZhbHNlKSA/IHRoaXMuX21hcmtSZW5kZXJpbmdJc05lZWRlZCgpIDogZmFsc2U7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uQ3Vyc29yU3RhdGVDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0N1cnNvclN0YXRlQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fY3Vyc29yUG9zaXRpb25zID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGUuc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0bGV0IGNvbG9yID0gdGhpcy5fc2V0dGluZ3MuY3Vyc29yQ29sb3JTaW5nbGU7XG5cdFx0XHRpZiAobGVuID4gMSkge1xuXHRcdFx0XHRjb2xvciA9IGkgPT09IDAgPyB0aGlzLl9zZXR0aW5ncy5jdXJzb3JDb2xvclByaW1hcnkgOiB0aGlzLl9zZXR0aW5ncy5jdXJzb3JDb2xvclNlY29uZGFyeTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2N1cnNvclBvc2l0aW9ucy5wdXNoKHsgcG9zaXRpb246IGUuc2VsZWN0aW9uc1tpXS5nZXRQb3NpdGlvbigpLCBjb2xvciB9KTtcblx0XHR9XG5cdFx0dGhpcy5fY3Vyc29yUG9zaXRpb25zLnNvcnQoKGEsIGIpID0+IFBvc2l0aW9uLmNvbXBhcmUoYS5wb3NpdGlvbiwgYi5wb3NpdGlvbikpO1xuXHRcdHJldHVybiB0aGlzLl9tYXJrUmVuZGVyaW5nSXNNYXliZU5lZWRlZCgpO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkRlY29yYXRpb25zQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChlLmFmZmVjdHNPdmVydmlld1J1bGVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbWFya1JlbmRlcmluZ0lzTWF5YmVOZWVkZWQoKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkZsdXNoZWQoZTogdmlld0V2ZW50cy5WaWV3Rmx1c2hlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX21hcmtSZW5kZXJpbmdJc05lZWRlZCgpO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvblNjcm9sbENoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3U2Nyb2xsQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGUuc2Nyb2xsSGVpZ2h0Q2hhbmdlZCA/IHRoaXMuX21hcmtSZW5kZXJpbmdJc05lZWRlZCgpIDogZmFsc2U7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uWm9uZXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1pvbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX21hcmtSZW5kZXJpbmdJc05lZWRlZCgpO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvblRoZW1lQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdUaGVtZUNoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl91cGRhdGVTZXR0aW5ncyhmYWxzZSkgPyB0aGlzLl9tYXJrUmVuZGVyaW5nSXNOZWVkZWQoKSA6IGZhbHNlO1xuXHR9XG5cblx0Ly8gLS0tLSBlbmQgdmlldyBldmVudCBoYW5kbGVyc1xuXG5cdHB1YmxpYyBnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZS5kb21Ob2RlO1xuXHR9XG5cblx0cHVibGljIHByZXBhcmVSZW5kZXIoY3R4OiBSZW5kZXJpbmdDb250ZXh0KTogdm9pZCB7XG5cdFx0Ly8gTm90aGluZyB0byByZWFkXG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyKGVkaXRvckN0eDogUmVzdHJpY3RlZFJlbmRlcmluZ0NvbnRleHQpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR0aGlzLl9hY3R1YWxTaG91bGRSZW5kZXIgPSBTaG91bGRSZW5kZXJWYWx1ZS5Ob3ROZWVkZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgYmFja2dyb3VuZENvbG9yID0gdGhpcy5fc2V0dGluZ3MuYmFja2dyb3VuZENvbG9yO1xuXHRcdGlmICh0aGlzLl9zZXR0aW5ncy5vdmVydmlld1J1bGVyTGFuZXMgPT09IDApIHtcblx0XHRcdC8vIG92ZXJ2aWV3IHJ1bGVyIGlzIG9mZlxuXHRcdFx0dGhpcy5fZG9tTm9kZS5zZXRCYWNrZ3JvdW5kQ29sb3IoYmFja2dyb3VuZENvbG9yID8gQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXhBKGJhY2tncm91bmRDb2xvcikgOiAnJyk7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLnNldERpc3BsYXkoJ25vbmUnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldEFsbE92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9ucyh0aGlzLl9jb250ZXh0LnRoZW1lKTtcblx0XHRkZWNvcmF0aW9ucy5zb3J0KE92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9uc0dyb3VwLmNvbXBhcmVCeVJlbmRlcmluZ1Byb3BzKTtcblxuXHRcdGlmICh0aGlzLl9hY3R1YWxTaG91bGRSZW5kZXIgPT09IFNob3VsZFJlbmRlclZhbHVlLk1heWJlICYmICFPdmVydmlld1J1bGVyRGVjb3JhdGlvbnNHcm91cC5lcXVhbHNBcnIodGhpcy5fcmVuZGVyZWREZWNvcmF0aW9ucywgZGVjb3JhdGlvbnMpKSB7XG5cdFx0XHR0aGlzLl9hY3R1YWxTaG91bGRSZW5kZXIgPSBTaG91bGRSZW5kZXJWYWx1ZS5OZWVkZWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9hY3R1YWxTaG91bGRSZW5kZXIgPT09IFNob3VsZFJlbmRlclZhbHVlLk1heWJlICYmICFlcXVhbHModGhpcy5fcmVuZGVyZWRDdXJzb3JQb3NpdGlvbnMsIHRoaXMuX2N1cnNvclBvc2l0aW9ucywgKGEsIGIpID0+IGEucG9zaXRpb24ubGluZU51bWJlciA9PT0gYi5wb3NpdGlvbi5saW5lTnVtYmVyICYmIGEuY29sb3IgPT09IGIuY29sb3IpKSB7XG5cdFx0XHR0aGlzLl9hY3R1YWxTaG91bGRSZW5kZXIgPSBTaG91bGRSZW5kZXJWYWx1ZS5OZWVkZWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9hY3R1YWxTaG91bGRSZW5kZXIgPT09IFNob3VsZFJlbmRlclZhbHVlLk1heWJlKSB7XG5cdFx0XHQvLyBib3RoIGRlY29yYXRpb25zIGFuZCBjdXJzb3IgcG9zaXRpb25zIGFyZSB1bmNoYW5nZWQsIG5vdGhpbmcgdG8gZG9cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcmVuZGVyZWREZWNvcmF0aW9ucyA9IGRlY29yYXRpb25zO1xuXHRcdHRoaXMuX3JlbmRlcmVkQ3Vyc29yUG9zaXRpb25zID0gdGhpcy5fY3Vyc29yUG9zaXRpb25zO1xuXG5cdFx0dGhpcy5fZG9tTm9kZS5zZXREaXNwbGF5KCdibG9jaycpO1xuXHRcdGNvbnN0IGNhbnZhc1dpZHRoID0gdGhpcy5fc2V0dGluZ3MuY2FudmFzV2lkdGg7XG5cdFx0Y29uc3QgY2FudmFzSGVpZ2h0ID0gdGhpcy5fc2V0dGluZ3MuY2FudmFzSGVpZ2h0O1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9zZXR0aW5ncy5saW5lSGVpZ2h0O1xuXHRcdGNvbnN0IHZpZXdMYXlvdXQgPSB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQ7XG5cdFx0Y29uc3Qgb3V0ZXJIZWlnaHQgPSB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0U2Nyb2xsSGVpZ2h0KCk7XG5cdFx0Y29uc3QgaGVpZ2h0UmF0aW8gPSBjYW52YXNIZWlnaHQgLyBvdXRlckhlaWdodDtcblxuXHRcdGNvbnN0IG1pbkRlY29yYXRpb25IZWlnaHQgPSAoQ29uc3RhbnRzLk1JTl9ERUNPUkFUSU9OX0hFSUdIVCAqIHRoaXMuX3NldHRpbmdzLnBpeGVsUmF0aW8pIHwgMDtcblx0XHRjb25zdCBoYWxmTWluRGVjb3JhdGlvbkhlaWdodCA9IChtaW5EZWNvcmF0aW9uSGVpZ2h0IC8gMikgfCAwO1xuXG5cdFx0Y29uc3QgY2FudmFzQ3R4ID0gdGhpcy5fZG9tTm9kZS5kb21Ob2RlLmdldENvbnRleHQoJzJkJykhO1xuXHRcdGlmIChiYWNrZ3JvdW5kQ29sb3IpIHtcblx0XHRcdGlmIChiYWNrZ3JvdW5kQ29sb3IuaXNPcGFxdWUoKSkge1xuXHRcdFx0XHQvLyBXZSBoYXZlIGEgYmFja2dyb3VuZCBjb2xvciB3aGljaCBpcyBvcGFxdWUsIHdlIGNhbiBqdXN0IHBhaW50IHRoZSBlbnRpcmUgc3VyZmFjZSB3aXRoIGl0XG5cdFx0XHRcdGNhbnZhc0N0eC5maWxsU3R5bGUgPSBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleEEoYmFja2dyb3VuZENvbG9yKTtcblx0XHRcdFx0Y2FudmFzQ3R4LmZpbGxSZWN0KDAsIDAsIGNhbnZhc1dpZHRoLCBjYW52YXNIZWlnaHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gV2UgaGF2ZSBhIGJhY2tncm91bmQgY29sb3Igd2hpY2ggaXMgdHJhbnNwYXJlbnQsIHdlIG5lZWQgdG8gZmlyc3QgY2xlYXIgdGhlIHN1cmZhY2UgYW5kXG5cdFx0XHRcdC8vIHRoZW4gZmlsbCBpdFxuXHRcdFx0XHRjYW52YXNDdHguY2xlYXJSZWN0KDAsIDAsIGNhbnZhc1dpZHRoLCBjYW52YXNIZWlnaHQpO1xuXHRcdFx0XHRjYW52YXNDdHguZmlsbFN0eWxlID0gQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXhBKGJhY2tncm91bmRDb2xvcik7XG5cdFx0XHRcdGNhbnZhc0N0eC5maWxsUmVjdCgwLCAwLCBjYW52YXNXaWR0aCwgY2FudmFzSGVpZ2h0KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gV2UgZG9uJ3QgaGF2ZSBhIGJhY2tncm91bmQgY29sb3Jcblx0XHRcdGNhbnZhc0N0eC5jbGVhclJlY3QoMCwgMCwgY2FudmFzV2lkdGgsIGNhbnZhc0hlaWdodCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeCA9IHRoaXMuX3NldHRpbmdzLng7XG5cdFx0Y29uc3QgdyA9IHRoaXMuX3NldHRpbmdzLnc7XG5cblxuXG5cdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uR3JvdXAgb2YgZGVjb3JhdGlvbnMpIHtcblx0XHRcdGNvbnN0IGNvbG9yID0gZGVjb3JhdGlvbkdyb3VwLmNvbG9yO1xuXHRcdFx0Y29uc3QgZGVjb3JhdGlvbkdyb3VwRGF0YSA9IGRlY29yYXRpb25Hcm91cC5kYXRhO1xuXG5cdFx0XHRjYW52YXNDdHguZmlsbFN0eWxlID0gY29sb3I7XG5cblx0XHRcdGxldCBwcmV2TGFuZSA9IDA7XG5cdFx0XHRsZXQgcHJldlkxID0gMDtcblx0XHRcdGxldCBwcmV2WTIgPSAwO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGRlY29yYXRpb25Hcm91cERhdGEubGVuZ3RoIC8gMzsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGxhbmUgPSBkZWNvcmF0aW9uR3JvdXBEYXRhWzMgKiBpXTtcblx0XHRcdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gZGVjb3JhdGlvbkdyb3VwRGF0YVszICogaSArIDFdO1xuXHRcdFx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gZGVjb3JhdGlvbkdyb3VwRGF0YVszICogaSArIDJdO1xuXG5cdFx0XHRcdGxldCB5MSA9ICh2aWV3TGF5b3V0LmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcihzdGFydExpbmVOdW1iZXIpICogaGVpZ2h0UmF0aW8pIHwgMDtcblx0XHRcdFx0bGV0IHkyID0gKCh2aWV3TGF5b3V0LmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcihlbmRMaW5lTnVtYmVyKSArIGxpbmVIZWlnaHQpICogaGVpZ2h0UmF0aW8pIHwgMDtcblx0XHRcdFx0Y29uc3QgaGVpZ2h0ID0geTIgLSB5MTtcblx0XHRcdFx0aWYgKGhlaWdodCA8IG1pbkRlY29yYXRpb25IZWlnaHQpIHtcblx0XHRcdFx0XHRsZXQgeUNlbnRlciA9ICgoeTEgKyB5MikgLyAyKSB8IDA7XG5cdFx0XHRcdFx0aWYgKHlDZW50ZXIgPCBoYWxmTWluRGVjb3JhdGlvbkhlaWdodCkge1xuXHRcdFx0XHRcdFx0eUNlbnRlciA9IGhhbGZNaW5EZWNvcmF0aW9uSGVpZ2h0O1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoeUNlbnRlciArIGhhbGZNaW5EZWNvcmF0aW9uSGVpZ2h0ID4gY2FudmFzSGVpZ2h0KSB7XG5cdFx0XHRcdFx0XHR5Q2VudGVyID0gY2FudmFzSGVpZ2h0IC0gaGFsZk1pbkRlY29yYXRpb25IZWlnaHQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHkxID0geUNlbnRlciAtIGhhbGZNaW5EZWNvcmF0aW9uSGVpZ2h0O1xuXHRcdFx0XHRcdHkyID0geUNlbnRlciArIGhhbGZNaW5EZWNvcmF0aW9uSGVpZ2h0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHkxID4gcHJldlkyICsgMSB8fCBsYW5lICE9PSBwcmV2TGFuZSkge1xuXHRcdFx0XHRcdC8vIGZsdXNoIHByZXZcblx0XHRcdFx0XHRpZiAoaSAhPT0gMCkge1xuXHRcdFx0XHRcdFx0Y2FudmFzQ3R4LmZpbGxSZWN0KHhbcHJldkxhbmVdLCBwcmV2WTEsIHdbcHJldkxhbmVdLCBwcmV2WTIgLSBwcmV2WTEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwcmV2TGFuZSA9IGxhbmU7XG5cdFx0XHRcdFx0cHJldlkxID0geTE7XG5cdFx0XHRcdFx0cHJldlkyID0geTI7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gbWVyZ2UgaW50byBwcmV2XG5cdFx0XHRcdFx0aWYgKHkyID4gcHJldlkyKSB7XG5cdFx0XHRcdFx0XHRwcmV2WTIgPSB5Mjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNhbnZhc0N0eC5maWxsUmVjdCh4W3ByZXZMYW5lXSwgcHJldlkxLCB3W3ByZXZMYW5lXSwgcHJldlkyIC0gcHJldlkxKTtcblx0XHR9XG5cblx0XHQvLyBEcmF3IGN1cnNvcnNcblx0XHRpZiAoIXRoaXMuX3NldHRpbmdzLmhpZGVDdXJzb3IpIHtcblx0XHRcdGNvbnN0IGN1cnNvckhlaWdodCA9ICgyICogdGhpcy5fc2V0dGluZ3MucGl4ZWxSYXRpbykgfCAwO1xuXHRcdFx0Y29uc3QgaGFsZkN1cnNvckhlaWdodCA9IChjdXJzb3JIZWlnaHQgLyAyKSB8IDA7XG5cdFx0XHRjb25zdCBjdXJzb3JYID0gdGhpcy5fc2V0dGluZ3MueFtPdmVydmlld1J1bGVyTGFuZS5GdWxsXTtcblx0XHRcdGNvbnN0IGN1cnNvclcgPSB0aGlzLl9zZXR0aW5ncy53W092ZXJ2aWV3UnVsZXJMYW5lLkZ1bGxdO1xuXG5cdFx0XHRsZXQgcHJldlkxID0gLTEwMDtcblx0XHRcdGxldCBwcmV2WTIgPSAtMTAwO1xuXHRcdFx0bGV0IHByZXZDb2xvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5fY3Vyc29yUG9zaXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNvbG9yID0gdGhpcy5fY3Vyc29yUG9zaXRpb25zW2ldLmNvbG9yO1xuXHRcdFx0XHRpZiAoIWNvbG9yKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY3Vyc29yID0gdGhpcy5fY3Vyc29yUG9zaXRpb25zW2ldLnBvc2l0aW9uO1xuXG5cdFx0XHRcdGxldCB5Q2VudGVyID0gKHZpZXdMYXlvdXQuZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKGN1cnNvci5saW5lTnVtYmVyKSAqIGhlaWdodFJhdGlvKSB8IDA7XG5cdFx0XHRcdGlmICh5Q2VudGVyIDwgaGFsZkN1cnNvckhlaWdodCkge1xuXHRcdFx0XHRcdHlDZW50ZXIgPSBoYWxmQ3Vyc29ySGVpZ2h0O1xuXHRcdFx0XHR9IGVsc2UgaWYgKHlDZW50ZXIgKyBoYWxmQ3Vyc29ySGVpZ2h0ID4gY2FudmFzSGVpZ2h0KSB7XG5cdFx0XHRcdFx0eUNlbnRlciA9IGNhbnZhc0hlaWdodCAtIGhhbGZDdXJzb3JIZWlnaHQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgeTEgPSB5Q2VudGVyIC0gaGFsZkN1cnNvckhlaWdodDtcblx0XHRcdFx0Y29uc3QgeTIgPSB5MSArIGN1cnNvckhlaWdodDtcblxuXHRcdFx0XHRpZiAoeTEgPiBwcmV2WTIgKyAxIHx8IGNvbG9yICE9PSBwcmV2Q29sb3IpIHtcblx0XHRcdFx0XHQvLyBmbHVzaCBwcmV2XG5cdFx0XHRcdFx0aWYgKGkgIT09IDAgJiYgcHJldkNvbG9yKSB7XG5cdFx0XHRcdFx0XHRjYW52YXNDdHguZmlsbFJlY3QoY3Vyc29yWCwgcHJldlkxLCBjdXJzb3JXLCBwcmV2WTIgLSBwcmV2WTEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwcmV2WTEgPSB5MTtcblx0XHRcdFx0XHRwcmV2WTIgPSB5Mjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBtZXJnZSBpbnRvIHByZXZcblx0XHRcdFx0XHRpZiAoeTIgPiBwcmV2WTIpIHtcblx0XHRcdFx0XHRcdHByZXZZMiA9IHkyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRwcmV2Q29sb3IgPSBjb2xvcjtcblx0XHRcdFx0Y2FudmFzQ3R4LmZpbGxTdHlsZSA9IGNvbG9yO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByZXZDb2xvcikge1xuXHRcdFx0XHRjYW52YXNDdHguZmlsbFJlY3QoY3Vyc29yWCwgcHJldlkxLCBjdXJzb3JXLCBwcmV2WTIgLSBwcmV2WTEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zZXR0aW5ncy5yZW5kZXJCb3JkZXIgJiYgdGhpcy5fc2V0dGluZ3MuYm9yZGVyQ29sb3IgJiYgdGhpcy5fc2V0dGluZ3Mub3ZlcnZpZXdSdWxlckxhbmVzID4gMCkge1xuXHRcdFx0Y2FudmFzQ3R4LmJlZ2luUGF0aCgpO1xuXHRcdFx0Y2FudmFzQ3R4LmxpbmVXaWR0aCA9IDE7XG5cdFx0XHRjYW52YXNDdHguc3Ryb2tlU3R5bGUgPSB0aGlzLl9zZXR0aW5ncy5ib3JkZXJDb2xvcjtcblx0XHRcdGNhbnZhc0N0eC5tb3ZlVG8oMCwgMCk7XG5cdFx0XHRjYW52YXNDdHgubGluZVRvKDAsIGNhbnZhc0hlaWdodCk7XG5cdFx0XHRjYW52YXNDdHgubW92ZVRvKDEsIDApO1xuXHRcdFx0Y2FudmFzQ3R4LmxpbmVUbyhjYW52YXNXaWR0aCwgMCk7XG5cdFx0XHRjYW52YXNDdHguc3Ryb2tlKCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFzQix5QkFBeUI7QUFDL0MsU0FBUyxhQUFhO0FBRXRCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0JBQXdCLDJCQUEyQiwrQkFBK0Isc0NBQXNDLDBDQUEwQztBQUszSyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGNBQWM7QUFFdkIsTUFBTSxTQUFTO0FBQUEsRUEyQmQsWUFBWSxRQUE4QixPQUFvQjtBQUM3RCxVQUFNLFVBQVUsT0FBTztBQUN2QixTQUFLLGFBQWEsUUFBUSxJQUFJLGFBQWEsVUFBVTtBQUNyRCxTQUFLLGFBQWEsUUFBUSxJQUFJLGFBQWEsVUFBVTtBQUNyRCxTQUFLLHFCQUFxQixRQUFRLElBQUksYUFBYSxrQkFBa0I7QUFFckUsU0FBSyxlQUFlLFFBQVEsSUFBSSxhQUFhLG1CQUFtQjtBQUNoRSxVQUFNLGNBQWMsTUFBTSxTQUFTLHlCQUF5QjtBQUM1RCxTQUFLLGNBQWMsY0FBYyxZQUFZLFNBQVMsSUFBSTtBQUUxRCxTQUFLLGFBQWEsUUFBUSxJQUFJLGFBQWEseUJBQXlCO0FBQ3BFLFVBQU0sb0JBQW9CLE1BQU0sU0FBUyxzQkFBc0I7QUFDL0QsU0FBSyxvQkFBb0Isb0JBQW9CLGtCQUFrQixZQUFZLEdBQUcsRUFBRSxTQUFTLElBQUk7QUFDN0YsVUFBTSxxQkFBcUIsTUFBTSxTQUFTLGtDQUFrQztBQUM1RSxTQUFLLHFCQUFxQixxQkFBcUIsbUJBQW1CLFlBQVksR0FBRyxFQUFFLFNBQVMsSUFBSTtBQUNoRyxVQUFNLHVCQUF1QixNQUFNLFNBQVMsb0NBQW9DO0FBQ2hGLFNBQUssdUJBQXVCLHVCQUF1QixxQkFBcUIsWUFBWSxHQUFHLEVBQUUsU0FBUyxJQUFJO0FBRXRHLFNBQUssWUFBWSxNQUFNO0FBRXZCLFVB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QSxRQUFJLENBQUMsS0FBSyxVQUFVLFlBQVk7QUFDL0IsWUFBTSxlQUFnQixJQUFJLEtBQUssVUFBVSxhQUFjO0FBQ3ZELFlBQU0sbUJBQW9CLGVBQWUsSUFBSztBQUM5QyxZQUFNLFVBQVUsS0FBSyxVQUFVLEVBQUUsWUFBc0I7QUFDdkQsWUFBTSxVQUFVLEtBQUssVUFBVSxFQUFFLFlBQXNCO0FBRXZELFVBQUksU0FBUztBQUNiLFVBQUksU0FBUztBQUNiLFVBQUksWUFBMkI7QUFDL0IsZUFBUyxJQUFJLEdBQUcsTUFBTSxLQUFLLGlCQUFpQixRQUFRLElBQUksS0FBSyxLQUFLO0FBQ2pFLGNBQU0sUUFBUSxLQUFLLGlCQUFpQixDQUFDLEVBQUU7QUFDdkMsWUFBSSxDQUFDLE9BQU87QUFDWDtBQUFBLFFBQ0Q7QUFDQSxjQUFNLFNBQVMsS0FBSyxpQkFBaUIsQ0FBQyxFQUFFO0FBRXhDLFlBQUksVUFBVyxXQUFXLCtCQUErQixPQUFPLFVBQVUsSUFBSSxjQUFlO0FBQzdGLFlBQUksVUFBVSxrQkFBa0I7QUFDL0Isb0JBQVU7QUFBQSxRQUNYLFdBQVcsVUFBVSxtQkFBbUIsY0FBYztBQUNyRCxvQkFBVSxlQUFlO0FBQUEsUUFDMUI7QUFDQSxjQUFNLEtBQUssVUFBVTtBQUNyQixjQUFNLEtBQUssS0FBSztBQUVoQixZQUFJLEtBQUssU0FBUyxLQUFLLFVBQVUsV0FBVztBQUUzQyxjQUFJLE1BQU0sS0FBSyxXQUFXO0FBQ3pCLHNCQUFVLFNBQVMsU0FBUyxRQUFRLFNBQVMsU0FBUyxNQUFNO0FBQUEsVUFDN0Q7QUFDQSxtQkFBUztBQUNULG1CQUFTO0FBQUEsUUFDVixPQUFPO0FBRU4sY0FBSSxLQUFLLFFBQVE7QUFDaEIscUJBQVM7QUFBQSxVQUNWO0FBQUEsUUFDRDtBQUNBLG9CQUFZO0FBQ1osa0JBQVUsWUFBWTtBQUFBLE1BQ3ZCO0FBQ0EsVUFBSSxXQUFXO0FBQ2Qsa0JBQVUsU0FBUyxTQUFTLFFBQVEsU0FBUyxTQUFTLE1BQU07QUFBQSxNQUM3RDtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssVUFBVSxnQkFBZ0IsS0FBSyxVQUFVLGVBQWUsS0FBSyxVQUFVLHFCQUFxQixHQUFHO0FBQ3ZHLGdCQUFVLFVBQVU7QUFDcEIsZ0JBQVUsWUFBWTtBQUN0QixnQkFBVSxjQUFjLEtBQUssVUFBVTtBQUN2QyxnQkFBVSxPQUFPLEdBQUcsQ0FBQztBQUNyQixnQkFBVSxPQUFPLEdBQUcsWUFBWTtBQUNoQyxnQkFBVSxPQUFPLEdBQUcsQ0FBQztBQUNyQixnQkFBVSxPQUFPLGFBQWEsQ0FBQztBQUMvQixnQkFBVSxPQUFPO0FBQUEsSUFDbEI7QUFBQSxFQUNEO0FBQ0Q7IiwKICAibmFtZXMiOiBbIkNvbnN0YW50cyIsICJPdmVydmlld1J1bGVyTGFuZSIsICJTaG91bGRSZW5kZXJWYWx1ZSJdCn0K
