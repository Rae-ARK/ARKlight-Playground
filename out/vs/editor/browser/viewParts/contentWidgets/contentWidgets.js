import * as dom from "../../../../base/browser/dom.js";
import { createFastDomNode } from "../../../../base/browser/fastDomNode.js";
import { ContentWidgetPositionPreference } from "../../editorBrowser.js";
import { PartFingerprint, PartFingerprints, ViewPart } from "../../view/viewPart.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { PositionAffinity } from "../../../common/model.js";
class ViewContentWidgets extends ViewPart {
  constructor(context, viewDomNode) {
    super(context);
    this._viewDomNode = viewDomNode;
    this._widgets = {};
    this.domNode = createFastDomNode(document.createElement("div"));
    PartFingerprints.write(this.domNode, PartFingerprint.ContentWidgets);
    this.domNode.setClassName("contentWidgets");
    this.domNode.setPosition("absolute");
    this.domNode.setTop(0);
    this.overflowingContentWidgetsDomNode = createFastDomNode(document.createElement("div"));
    PartFingerprints.write(this.overflowingContentWidgetsDomNode, PartFingerprint.OverflowingContentWidgets);
    this.overflowingContentWidgetsDomNode.setClassName("overflowingContentWidgets");
  }
  dispose() {
    super.dispose();
    this._widgets = {};
  }
  // --- begin event handlers
  onConfigurationChanged(e) {
    const keys = Object.keys(this._widgets);
    for (const widgetId of keys) {
      this._widgets[widgetId].onConfigurationChanged(e);
    }
    return true;
  }
  onDecorationsChanged(e) {
    return true;
  }
  onFlushed(e) {
    return true;
  }
  onLineMappingChanged(e) {
    this._updateAnchorsViewPositions();
    return true;
  }
  onLinesChanged(e) {
    this._updateAnchorsViewPositions();
    return true;
  }
  onLinesDeleted(e) {
    this._updateAnchorsViewPositions();
    return true;
  }
  onLinesInserted(e) {
    this._updateAnchorsViewPositions();
    return true;
  }
  onScrollChanged(e) {
    return true;
  }
  onZonesChanged(e) {
    return true;
  }
  // ---- end view event handlers
  _updateAnchorsViewPositions() {
    const keys = Object.keys(this._widgets);
    for (const widgetId of keys) {
      this._widgets[widgetId].updateAnchorViewPosition();
    }
  }
  addWidget(_widget) {
    const myWidget = new Widget(this._context, this._viewDomNode, _widget);
    this._widgets[myWidget.id] = myWidget;
    if (myWidget.allowEditorOverflow) {
      this.overflowingContentWidgetsDomNode.appendChild(myWidget.domNode);
    } else {
      this.domNode.appendChild(myWidget.domNode);
    }
    this.setShouldRender();
  }
  setWidgetPosition(widget, primaryAnchor, secondaryAnchor, preference, affinity) {
    const myWidget = this._widgets[widget.getId()];
    myWidget.setPosition(primaryAnchor, secondaryAnchor, preference, affinity);
    if (!myWidget.useDisplayNone) {
      this.setShouldRender();
    }
  }
  removeWidget(widget) {
    const widgetId = widget.getId();
    if (this._widgets.hasOwnProperty(widgetId)) {
      const myWidget = this._widgets[widgetId];
      delete this._widgets[widgetId];
      const domNode = myWidget.domNode.domNode;
      domNode.remove();
      domNode.removeAttribute("monaco-visible-content-widget");
      this.setShouldRender();
    }
  }
  shouldSuppressMouseDownOnWidget(widgetId) {
    if (this._widgets.hasOwnProperty(widgetId)) {
      return this._widgets[widgetId].suppressMouseDown;
    }
    return false;
  }
  onBeforeRender(viewportData) {
    const keys = Object.keys(this._widgets);
    for (const widgetId of keys) {
      this._widgets[widgetId].onBeforeRender(viewportData);
    }
  }
  prepareRender(ctx) {
    const keys = Object.keys(this._widgets);
    for (const widgetId of keys) {
      this._widgets[widgetId].prepareRender(ctx);
    }
  }
  render(ctx) {
    const keys = Object.keys(this._widgets);
    for (const widgetId of keys) {
      this._widgets[widgetId].render(ctx);
    }
  }
}
class Widget {
  constructor(context, viewDomNode, actual) {
    this._primaryAnchor = new PositionPair(null, null);
    this._secondaryAnchor = new PositionPair(null, null);
    this._context = context;
    this._viewDomNode = viewDomNode;
    this._actual = actual;
    const options = this._context.configuration.options;
    const layoutInfo = options.get(EditorOption.layoutInfo);
    const allowOverflow = options.get(EditorOption.allowOverflow);
    this.domNode = createFastDomNode(this._actual.getDomNode());
    this.id = this._actual.getId();
    this.allowEditorOverflow = (this._actual.allowEditorOverflow || false) && allowOverflow;
    this.suppressMouseDown = this._actual.suppressMouseDown || false;
    this.useDisplayNone = this._actual.useDisplayNone || false;
    this._fixedOverflowWidgets = options.get(EditorOption.fixedOverflowWidgets);
    this._contentWidth = layoutInfo.contentWidth;
    this._contentLeft = layoutInfo.contentLeft;
    this._affinity = null;
    this._preference = [];
    this._cachedDomNodeOffsetWidth = -1;
    this._cachedDomNodeOffsetHeight = -1;
    this._maxWidth = this._getMaxWidth();
    this._isVisible = false;
    this._renderData = null;
    this.domNode.setPosition(this._fixedOverflowWidgets && this.allowEditorOverflow ? "fixed" : "absolute");
    this.domNode.setDisplay("none");
    this.domNode.setVisibility("hidden");
    this.domNode.setAttribute("widgetId", this.id);
    this.domNode.setMaxWidth(this._maxWidth);
  }
  onConfigurationChanged(e) {
    const options = this._context.configuration.options;
    if (e.hasChanged(EditorOption.layoutInfo)) {
      const layoutInfo = options.get(EditorOption.layoutInfo);
      this._contentLeft = layoutInfo.contentLeft;
      this._contentWidth = layoutInfo.contentWidth;
      this._maxWidth = this._getMaxWidth();
    }
  }
  updateAnchorViewPosition() {
    this._setPosition(this._affinity, this._primaryAnchor.modelPosition, this._secondaryAnchor.modelPosition);
  }
  _setPosition(affinity, primaryAnchor, secondaryAnchor) {
    this._affinity = affinity;
    this._primaryAnchor = getValidPositionPair(primaryAnchor, this._context.viewModel, this._affinity);
    this._secondaryAnchor = getValidPositionPair(secondaryAnchor, this._context.viewModel, this._affinity);
    function getValidPositionPair(position, viewModel, affinity2) {
      if (!position) {
        return new PositionPair(null, null);
      }
      const validModelPosition = viewModel.model.validatePosition(position);
      if (viewModel.coordinatesConverter.modelPositionIsVisible(validModelPosition)) {
        const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(validModelPosition, affinity2 ?? void 0);
        return new PositionPair(position, viewPosition);
      }
      return new PositionPair(position, null);
    }
  }
  _getMaxWidth() {
    const elDocument = this.domNode.domNode.ownerDocument;
    const elWindow = elDocument.defaultView;
    return this.allowEditorOverflow ? elWindow?.innerWidth || elDocument.documentElement.offsetWidth || elDocument.body.offsetWidth : this._contentWidth;
  }
  setPosition(primaryAnchor, secondaryAnchor, preference, affinity) {
    this._setPosition(affinity, primaryAnchor, secondaryAnchor);
    this._preference = preference;
    if (!this.useDisplayNone && this._primaryAnchor.viewPosition && this._preference && this._preference.length > 0) {
      this.domNode.setDisplay("block");
    } else {
      this.domNode.setDisplay("none");
    }
    this._cachedDomNodeOffsetWidth = -1;
    this._cachedDomNodeOffsetHeight = -1;
  }
  _layoutBoxInViewport(anchor, width, height, ctx) {
    const aboveLineTop = anchor.top;
    const heightAvailableAboveLine = aboveLineTop;
    const underLineTop = anchor.top + anchor.height;
    const heightAvailableUnderLine = ctx.viewportHeight - underLineTop;
    const aboveTop = aboveLineTop - height;
    const fitsAbove = heightAvailableAboveLine >= height;
    const belowTop = underLineTop;
    const fitsBelow = heightAvailableUnderLine >= height;
    let left = anchor.left;
    if (left + width > ctx.scrollLeft + ctx.viewportWidth) {
      left = ctx.scrollLeft + ctx.viewportWidth - width;
    }
    if (left < ctx.scrollLeft) {
      left = ctx.scrollLeft;
    }
    return { fitsAbove, aboveTop, fitsBelow, belowTop, left };
  }
  _layoutHorizontalSegmentInPage(windowSize, domNodePosition, left, width) {
    const LEFT_PADDING = 15;
    const RIGHT_PADDING = 15;
    const MIN_LIMIT = Math.max(LEFT_PADDING, domNodePosition.left - width);
    const MAX_LIMIT = Math.min(domNodePosition.left + domNodePosition.width + width, windowSize.width - RIGHT_PADDING);
    const elDocument = this._viewDomNode.domNode.ownerDocument;
    const elWindow = elDocument.defaultView;
    let absoluteLeft = domNodePosition.left + left - (elWindow?.scrollX ?? 0);
    if (absoluteLeft + width > MAX_LIMIT) {
      const delta = absoluteLeft - (MAX_LIMIT - width);
      absoluteLeft -= delta;
      left -= delta;
    }
    if (absoluteLeft < MIN_LIMIT) {
      const delta = absoluteLeft - MIN_LIMIT;
      absoluteLeft -= delta;
      left -= delta;
    }
    return [left, absoluteLeft];
  }
  _layoutBoxInPage(anchor, width, height, ctx) {
    const aboveTop = anchor.top - height;
    const belowTop = anchor.top + anchor.height;
    const domNodePosition = dom.getDomNodePagePosition(this._viewDomNode.domNode);
    const elDocument = this._viewDomNode.domNode.ownerDocument;
    const elWindow = elDocument.defaultView;
    const absoluteAboveTop = domNodePosition.top + aboveTop - (elWindow?.scrollY ?? 0);
    const absoluteBelowTop = domNodePosition.top + belowTop - (elWindow?.scrollY ?? 0);
    const windowSize = dom.getClientArea(elDocument.body);
    const [left, absoluteAboveLeft] = this._layoutHorizontalSegmentInPage(windowSize, domNodePosition, anchor.left - ctx.scrollLeft + this._contentLeft, width);
    const TOP_PADDING = 22;
    const BOTTOM_PADDING = 22;
    const fitsAbove = absoluteAboveTop >= TOP_PADDING;
    const fitsBelow = absoluteBelowTop + height <= windowSize.height - BOTTOM_PADDING;
    if (this._fixedOverflowWidgets) {
      return {
        fitsAbove,
        aboveTop: Math.max(absoluteAboveTop, TOP_PADDING),
        fitsBelow,
        belowTop: absoluteBelowTop,
        left: absoluteAboveLeft
      };
    }
    return { fitsAbove, aboveTop, fitsBelow, belowTop, left };
  }
  _prepareRenderWidgetAtExactPositionOverflowing(topLeft) {
    return new Coordinate(topLeft.top, topLeft.left + this._contentLeft);
  }
  /**
   * Compute the coordinates above and below the primary and secondary anchors.
   * The content widget *must* touch the primary anchor.
   * The content widget should touch if possible the secondary anchor.
   */
  _getAnchorsCoordinates(ctx) {
    const primary = getCoordinates(this._primaryAnchor.viewPosition, this._affinity);
    const secondaryViewPosition = this._secondaryAnchor.viewPosition?.lineNumber === this._primaryAnchor.viewPosition?.lineNumber ? this._secondaryAnchor.viewPosition : null;
    const secondary = getCoordinates(secondaryViewPosition, this._affinity);
    return { primary, secondary };
    function getCoordinates(position, affinity) {
      if (!position) {
        return null;
      }
      const horizontalPosition = ctx.visibleRangeForPosition(position);
      if (!horizontalPosition) {
        return null;
      }
      const left = position.column === 1 && affinity === PositionAffinity.LeftOfInjectedText ? 0 : horizontalPosition.left;
      const top = ctx.getVerticalOffsetForLineNumber(position.lineNumber) - ctx.scrollTop;
      const lineHeight = ctx.getLineHeightForLineNumber(position.lineNumber);
      return new AnchorCoordinate(top, left, lineHeight);
    }
  }
  _reduceAnchorCoordinates(primary, secondary, width) {
    if (!secondary) {
      return primary;
    }
    const fontInfo = this._context.configuration.options.get(EditorOption.fontInfo);
    let left = secondary.left;
    if (left < primary.left) {
      left = Math.max(left, primary.left - width + fontInfo.typicalFullwidthCharacterWidth);
    } else {
      left = Math.min(left, primary.left + width - fontInfo.typicalFullwidthCharacterWidth);
    }
    return new AnchorCoordinate(primary.top, left, primary.height);
  }
  _prepareRenderWidget(ctx) {
    if (!this._preference || this._preference.length === 0) {
      return null;
    }
    const { primary, secondary } = this._getAnchorsCoordinates(ctx);
    if (!primary) {
      return {
        kind: "offViewport",
        preserveFocus: this.domNode.domNode.contains(this.domNode.domNode.ownerDocument.activeElement)
      };
    }
    if (this._cachedDomNodeOffsetWidth === -1 || this._cachedDomNodeOffsetHeight === -1) {
      let preferredDimensions = null;
      if (typeof this._actual.beforeRender === "function") {
        preferredDimensions = safeInvoke(this._actual.beforeRender, this._actual);
      }
      if (preferredDimensions) {
        this._cachedDomNodeOffsetWidth = preferredDimensions.width;
        this._cachedDomNodeOffsetHeight = preferredDimensions.height;
      } else {
        const domNode = this.domNode.domNode;
        const clientRect = domNode.getBoundingClientRect();
        this._cachedDomNodeOffsetWidth = Math.round(clientRect.width);
        this._cachedDomNodeOffsetHeight = Math.round(clientRect.height);
      }
    }
    const anchor = this._reduceAnchorCoordinates(primary, secondary, this._cachedDomNodeOffsetWidth);
    let placement;
    if (this.allowEditorOverflow) {
      placement = this._layoutBoxInPage(anchor, this._cachedDomNodeOffsetWidth, this._cachedDomNodeOffsetHeight, ctx);
    } else {
      placement = this._layoutBoxInViewport(anchor, this._cachedDomNodeOffsetWidth, this._cachedDomNodeOffsetHeight, ctx);
    }
    for (let pass = 1; pass <= 2; pass++) {
      for (const pref of this._preference) {
        if (pref === ContentWidgetPositionPreference.ABOVE) {
          if (!placement) {
            return null;
          }
          if (pass === 2 || placement.fitsAbove) {
            return {
              kind: "inViewport",
              coordinate: new Coordinate(placement.aboveTop, placement.left),
              position: ContentWidgetPositionPreference.ABOVE
            };
          }
        } else if (pref === ContentWidgetPositionPreference.BELOW) {
          if (!placement) {
            return null;
          }
          if (pass === 2 || placement.fitsBelow) {
            return {
              kind: "inViewport",
              coordinate: new Coordinate(placement.belowTop, placement.left),
              position: ContentWidgetPositionPreference.BELOW
            };
          }
        } else {
          if (this.allowEditorOverflow) {
            return {
              kind: "inViewport",
              coordinate: this._prepareRenderWidgetAtExactPositionOverflowing(new Coordinate(anchor.top, anchor.left)),
              position: ContentWidgetPositionPreference.EXACT
            };
          } else {
            return {
              kind: "inViewport",
              coordinate: new Coordinate(anchor.top, anchor.left),
              position: ContentWidgetPositionPreference.EXACT
            };
          }
        }
      }
    }
    return null;
  }
  /**
   * On this first pass, we ensure that the content widget (if it is in the viewport) has the max width set correctly.
   */
  onBeforeRender(viewportData) {
    if (!this._primaryAnchor.viewPosition || !this._preference) {
      return;
    }
    if (this._primaryAnchor.viewPosition.lineNumber < viewportData.startLineNumber || this._primaryAnchor.viewPosition.lineNumber > viewportData.endLineNumber) {
      return;
    }
    this.domNode.setMaxWidth(this._maxWidth);
  }
  prepareRender(ctx) {
    this._renderData = this._prepareRenderWidget(ctx);
  }
  render(ctx) {
    if (!this._renderData || this._renderData.kind === "offViewport") {
      if (this._isVisible) {
        this.domNode.removeAttribute("monaco-visible-content-widget");
        this._isVisible = false;
        if (this._renderData?.kind === "offViewport" && this._renderData.preserveFocus) {
          this.domNode.setTop(-1e3);
        } else {
          this.domNode.setVisibility("hidden");
        }
      }
      if (typeof this._actual.afterRender === "function") {
        safeInvoke(this._actual.afterRender, this._actual, null, null);
      }
      return;
    }
    if (this.allowEditorOverflow) {
      this.domNode.setTop(this._renderData.coordinate.top);
      this.domNode.setLeft(this._renderData.coordinate.left);
    } else {
      this.domNode.setTop(this._renderData.coordinate.top + ctx.scrollTop - ctx.bigNumbersDelta);
      this.domNode.setLeft(this._renderData.coordinate.left);
    }
    if (!this._isVisible) {
      this.domNode.setVisibility("inherit");
      this.domNode.setAttribute("monaco-visible-content-widget", "true");
      this._isVisible = true;
    }
    if (typeof this._actual.afterRender === "function") {
      safeInvoke(this._actual.afterRender, this._actual, this._renderData.position, this._renderData.coordinate);
    }
  }
}
class PositionPair {
  constructor(modelPosition, viewPosition) {
    this.modelPosition = modelPosition;
    this.viewPosition = viewPosition;
  }
}
class Coordinate {
  constructor(top, left) {
    this.top = top;
    this.left = left;
    this._coordinateBrand = void 0;
  }
}
class AnchorCoordinate {
  constructor(top, left, height) {
    this.top = top;
    this.left = left;
    this.height = height;
    this._anchorCoordinateBrand = void 0;
  }
}
function safeInvoke(fn, thisArg, ...args) {
  try {
    return fn.call(thisArg, ...args);
  } catch {
    return null;
  }
}
export {
  ViewContentWidgets
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3ZpZXdQYXJ0cy9jb250ZW50V2lkZ2V0cy9jb250ZW50V2lkZ2V0cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEZhc3REb21Ob2RlLCBjcmVhdGVGYXN0RG9tTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mYXN0RG9tTm9kZS5qcyc7XG5pbXBvcnQgeyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLCBJQ29udGVudFdpZGdldCwgSUNvbnRlbnRXaWRnZXRSZW5kZXJlZENvb3JkaW5hdGUgfSBmcm9tICcuLi8uLi9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IFBhcnRGaW5nZXJwcmludCwgUGFydEZpbmdlcnByaW50cywgVmlld1BhcnQgfSBmcm9tICcuLi8uLi92aWV3L3ZpZXdQYXJ0LmpzJztcbmltcG9ydCB7IFJlbmRlcmluZ0NvbnRleHQsIFJlc3RyaWN0ZWRSZW5kZXJpbmdDb250ZXh0IH0gZnJvbSAnLi4vLi4vdmlldy9yZW5kZXJpbmdDb250ZXh0LmpzJztcbmltcG9ydCB7IFZpZXdDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3Q29udGV4dC5qcyc7XG5pbXBvcnQgKiBhcyB2aWV3RXZlbnRzIGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IFZpZXdwb3J0RGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TGF5b3V0L3ZpZXdMaW5lc1ZpZXdwb3J0RGF0YS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSURpbWVuc2lvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlLzJkL2RpbWVuc2lvbi5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbkFmZmluaXR5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC5qcyc7XG5cbi8qKlxuICogVGhpcyB2aWV3IHBhcnQgaXMgcmVzcG9uc2libGUgZm9yIHJlbmRlcmluZyB0aGUgY29udGVudCB3aWRnZXRzLCB3aGljaCBhcmVcbiAqIHVzZWQgZm9yIHJlbmRlcmluZyBlbGVtZW50cyB0aGF0IGFyZSBhc3NvY2lhdGVkIHRvIGFuIGVkaXRvciBwb3NpdGlvbixcbiAqIHN1Y2ggYXMgc3VnZ2VzdGlvbnMgb3IgdGhlIHBhcmFtZXRlciBoaW50cy5cbiAqL1xuZXhwb3J0IGNsYXNzIFZpZXdDb250ZW50V2lkZ2V0cyBleHRlbmRzIFZpZXdQYXJ0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3RG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+O1xuXHRwcml2YXRlIF93aWRnZXRzOiB7IFtrZXk6IHN0cmluZ106IFdpZGdldCB9O1xuXG5cdHB1YmxpYyBkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD47XG5cdHB1YmxpYyBvdmVyZmxvd2luZ0NvbnRlbnRXaWRnZXRzRG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+O1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRleHQ6IFZpZXdDb250ZXh0LCB2aWV3RG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+KSB7XG5cdFx0c3VwZXIoY29udGV4dCk7XG5cdFx0dGhpcy5fdmlld0RvbU5vZGUgPSB2aWV3RG9tTm9kZTtcblx0XHR0aGlzLl93aWRnZXRzID0ge307XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBjcmVhdGVGYXN0RG9tTm9kZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdFx0UGFydEZpbmdlcnByaW50cy53cml0ZSh0aGlzLmRvbU5vZGUsIFBhcnRGaW5nZXJwcmludC5Db250ZW50V2lkZ2V0cyk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldENsYXNzTmFtZSgnY29udGVudFdpZGdldHMnKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0UG9zaXRpb24oJ2Fic29sdXRlJyk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldFRvcCgwKTtcblxuXHRcdHRoaXMub3ZlcmZsb3dpbmdDb250ZW50V2lkZ2V0c0RvbU5vZGUgPSBjcmVhdGVGYXN0RG9tTm9kZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdFx0UGFydEZpbmdlcnByaW50cy53cml0ZSh0aGlzLm92ZXJmbG93aW5nQ29udGVudFdpZGdldHNEb21Ob2RlLCBQYXJ0RmluZ2VycHJpbnQuT3ZlcmZsb3dpbmdDb250ZW50V2lkZ2V0cyk7XG5cdFx0dGhpcy5vdmVyZmxvd2luZ0NvbnRlbnRXaWRnZXRzRG9tTm9kZS5zZXRDbGFzc05hbWUoJ292ZXJmbG93aW5nQ29udGVudFdpZGdldHMnKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl93aWRnZXRzID0ge307XG5cdH1cblxuXHQvLyAtLS0gYmVnaW4gZXZlbnQgaGFuZGxlcnNcblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25Db25maWd1cmF0aW9uQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHRoaXMuX3dpZGdldHMpO1xuXHRcdGZvciAoY29uc3Qgd2lkZ2V0SWQgb2Yga2V5cykge1xuXHRcdFx0dGhpcy5fd2lkZ2V0c1t3aWRnZXRJZF0ub25Db25maWd1cmF0aW9uQ2hhbmdlZChlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uRGVjb3JhdGlvbnNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0RlY29yYXRpb25zQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Ly8gdHJ1ZSBmb3IgaW5saW5lIGRlY29yYXRpb25zIHRoYXQgY2FuIGVuZCB1cCByZWxheW91dGluZyB0ZXh0XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uRmx1c2hlZChlOiB2aWV3RXZlbnRzLlZpZXdGbHVzaGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lTWFwcGluZ0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZU1hcHBpbmdDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl91cGRhdGVBbmNob3JzVmlld1Bvc2l0aW9ucygpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX3VwZGF0ZUFuY2hvcnNWaWV3UG9zaXRpb25zKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNEZWxldGVkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzRGVsZXRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fdXBkYXRlQW5jaG9yc1ZpZXdQb3NpdGlvbnMoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lc0luc2VydGVkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzSW5zZXJ0ZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX3VwZGF0ZUFuY2hvcnNWaWV3UG9zaXRpb25zKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uU2Nyb2xsQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdTY3JvbGxDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25ab25lc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Wm9uZXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vIC0tLS0gZW5kIHZpZXcgZXZlbnQgaGFuZGxlcnNcblxuXHRwcml2YXRlIF91cGRhdGVBbmNob3JzVmlld1Bvc2l0aW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBrZXlzID0gT2JqZWN0LmtleXModGhpcy5fd2lkZ2V0cyk7XG5cdFx0Zm9yIChjb25zdCB3aWRnZXRJZCBvZiBrZXlzKSB7XG5cdFx0XHR0aGlzLl93aWRnZXRzW3dpZGdldElkXS51cGRhdGVBbmNob3JWaWV3UG9zaXRpb24oKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYWRkV2lkZ2V0KF93aWRnZXQ6IElDb250ZW50V2lkZ2V0KTogdm9pZCB7XG5cdFx0Y29uc3QgbXlXaWRnZXQgPSBuZXcgV2lkZ2V0KHRoaXMuX2NvbnRleHQsIHRoaXMuX3ZpZXdEb21Ob2RlLCBfd2lkZ2V0KTtcblx0XHR0aGlzLl93aWRnZXRzW215V2lkZ2V0LmlkXSA9IG15V2lkZ2V0O1xuXG5cdFx0aWYgKG15V2lkZ2V0LmFsbG93RWRpdG9yT3ZlcmZsb3cpIHtcblx0XHRcdHRoaXMub3ZlcmZsb3dpbmdDb250ZW50V2lkZ2V0c0RvbU5vZGUuYXBwZW5kQ2hpbGQobXlXaWRnZXQuZG9tTm9kZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5hcHBlbmRDaGlsZChteVdpZGdldC5kb21Ob2RlKTtcblx0XHR9XG5cblx0XHR0aGlzLnNldFNob3VsZFJlbmRlcigpO1xuXHR9XG5cblx0cHVibGljIHNldFdpZGdldFBvc2l0aW9uKHdpZGdldDogSUNvbnRlbnRXaWRnZXQsIHByaW1hcnlBbmNob3I6IElQb3NpdGlvbiB8IG51bGwsIHNlY29uZGFyeUFuY2hvcjogSVBvc2l0aW9uIHwgbnVsbCwgcHJlZmVyZW5jZTogQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZVtdIHwgbnVsbCwgYWZmaW5pdHk6IFBvc2l0aW9uQWZmaW5pdHkgfCBudWxsKTogdm9pZCB7XG5cdFx0Y29uc3QgbXlXaWRnZXQgPSB0aGlzLl93aWRnZXRzW3dpZGdldC5nZXRJZCgpXTtcblx0XHRteVdpZGdldC5zZXRQb3NpdGlvbihwcmltYXJ5QW5jaG9yLCBzZWNvbmRhcnlBbmNob3IsIHByZWZlcmVuY2UsIGFmZmluaXR5KTtcblxuXHRcdGlmICghbXlXaWRnZXQudXNlRGlzcGxheU5vbmUpIHtcblx0XHRcdHRoaXMuc2V0U2hvdWxkUmVuZGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlbW92ZVdpZGdldCh3aWRnZXQ6IElDb250ZW50V2lkZ2V0KTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0SWQgPSB3aWRnZXQuZ2V0SWQoKTtcblx0XHRpZiAodGhpcy5fd2lkZ2V0cy5oYXNPd25Qcm9wZXJ0eSh3aWRnZXRJZCkpIHtcblx0XHRcdGNvbnN0IG15V2lkZ2V0ID0gdGhpcy5fd2lkZ2V0c1t3aWRnZXRJZF07XG5cdFx0XHRkZWxldGUgdGhpcy5fd2lkZ2V0c1t3aWRnZXRJZF07XG5cblx0XHRcdGNvbnN0IGRvbU5vZGUgPSBteVdpZGdldC5kb21Ob2RlLmRvbU5vZGU7XG5cdFx0XHRkb21Ob2RlLnJlbW92ZSgpO1xuXHRcdFx0ZG9tTm9kZS5yZW1vdmVBdHRyaWJ1dGUoJ21vbmFjby12aXNpYmxlLWNvbnRlbnQtd2lkZ2V0Jyk7XG5cblx0XHRcdHRoaXMuc2V0U2hvdWxkUmVuZGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNob3VsZFN1cHByZXNzTW91c2VEb3duT25XaWRnZXQod2lkZ2V0SWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl93aWRnZXRzLmhhc093blByb3BlcnR5KHdpZGdldElkKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3dpZGdldHNbd2lkZ2V0SWRdLnN1cHByZXNzTW91c2VEb3duO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25CZWZvcmVSZW5kZXIodmlld3BvcnREYXRhOiBWaWV3cG9ydERhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBrZXlzID0gT2JqZWN0LmtleXModGhpcy5fd2lkZ2V0cyk7XG5cdFx0Zm9yIChjb25zdCB3aWRnZXRJZCBvZiBrZXlzKSB7XG5cdFx0XHR0aGlzLl93aWRnZXRzW3dpZGdldElkXS5vbkJlZm9yZVJlbmRlcih2aWV3cG9ydERhdGEpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBwcmVwYXJlUmVuZGVyKGN0eDogUmVuZGVyaW5nQ29udGV4dCk6IHZvaWQge1xuXHRcdGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLl93aWRnZXRzKTtcblx0XHRmb3IgKGNvbnN0IHdpZGdldElkIG9mIGtleXMpIHtcblx0XHRcdHRoaXMuX3dpZGdldHNbd2lkZ2V0SWRdLnByZXBhcmVSZW5kZXIoY3R4KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyKGN0eDogUmVzdHJpY3RlZFJlbmRlcmluZ0NvbnRleHQpOiB2b2lkIHtcblx0XHRjb25zdCBrZXlzID0gT2JqZWN0LmtleXModGhpcy5fd2lkZ2V0cyk7XG5cdFx0Zm9yIChjb25zdCB3aWRnZXRJZCBvZiBrZXlzKSB7XG5cdFx0XHR0aGlzLl93aWRnZXRzW3dpZGdldElkXS5yZW5kZXIoY3R4KTtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIElCb3hMYXlvdXRSZXN1bHQge1xuXHRmaXRzQWJvdmU6IGJvb2xlYW47XG5cdGFib3ZlVG9wOiBudW1iZXI7XG5cblx0Zml0c0JlbG93OiBib29sZWFuO1xuXHRiZWxvd1RvcDogbnVtYmVyO1xuXG5cdGxlZnQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElPZmZWaWV3cG9ydFJlbmRlckRhdGEge1xuXHRraW5kOiAnb2ZmVmlld3BvcnQnO1xuXHRwcmVzZXJ2ZUZvY3VzOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSUluVmlld3BvcnRSZW5kZXJEYXRhIHtcblx0a2luZDogJ2luVmlld3BvcnQnO1xuXHRjb29yZGluYXRlOiBDb29yZGluYXRlO1xuXHRwb3NpdGlvbjogQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZTtcbn1cblxudHlwZSBJUmVuZGVyRGF0YSA9IElJblZpZXdwb3J0UmVuZGVyRGF0YSB8IElPZmZWaWV3cG9ydFJlbmRlckRhdGE7XG5cbmNsYXNzIFdpZGdldCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHQ6IFZpZXdDb250ZXh0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3RG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3R1YWw6IElDb250ZW50V2lkZ2V0O1xuXG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD47XG5cdHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgYWxsb3dFZGl0b3JPdmVyZmxvdzogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IHN1cHByZXNzTW91c2VEb3duOiBib29sZWFuO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpeGVkT3ZlcmZsb3dXaWRnZXRzOiBib29sZWFuO1xuXHRwcml2YXRlIF9jb250ZW50V2lkdGg6IG51bWJlcjtcblx0cHJpdmF0ZSBfY29udGVudExlZnQ6IG51bWJlcjtcblxuXHRwcml2YXRlIF9wcmltYXJ5QW5jaG9yOiBQb3NpdGlvblBhaXIgPSBuZXcgUG9zaXRpb25QYWlyKG51bGwsIG51bGwpO1xuXHRwcml2YXRlIF9zZWNvbmRhcnlBbmNob3I6IFBvc2l0aW9uUGFpciA9IG5ldyBQb3NpdGlvblBhaXIobnVsbCwgbnVsbCk7XG5cdHByaXZhdGUgX2FmZmluaXR5OiBQb3NpdGlvbkFmZmluaXR5IHwgbnVsbDtcblx0cHJpdmF0ZSBfcHJlZmVyZW5jZTogQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZVtdIHwgbnVsbDtcblx0cHJpdmF0ZSBfY2FjaGVkRG9tTm9kZU9mZnNldFdpZHRoOiBudW1iZXI7XG5cdHByaXZhdGUgX2NhY2hlZERvbU5vZGVPZmZzZXRIZWlnaHQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfbWF4V2lkdGg6IG51bWJlcjtcblx0cHJpdmF0ZSBfaXNWaXNpYmxlOiBib29sZWFuO1xuXG5cdHByaXZhdGUgX3JlbmRlckRhdGE6IElSZW5kZXJEYXRhIHwgbnVsbDtcblx0cHVibGljIHJlYWRvbmx5IHVzZURpc3BsYXlOb25lOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRleHQ6IFZpZXdDb250ZXh0LCB2aWV3RG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+LCBhY3R1YWw6IElDb250ZW50V2lkZ2V0KSB7XG5cdFx0dGhpcy5fY29udGV4dCA9IGNvbnRleHQ7XG5cdFx0dGhpcy5fdmlld0RvbU5vZGUgPSB2aWV3RG9tTm9kZTtcblx0XHR0aGlzLl9hY3R1YWwgPSBhY3R1YWw7XG5cblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblx0XHRjb25zdCBhbGxvd092ZXJmbG93ID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmFsbG93T3ZlcmZsb3cpO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gY3JlYXRlRmFzdERvbU5vZGUodGhpcy5fYWN0dWFsLmdldERvbU5vZGUoKSk7XG5cdFx0dGhpcy5pZCA9IHRoaXMuX2FjdHVhbC5nZXRJZCgpO1xuXHRcdHRoaXMuYWxsb3dFZGl0b3JPdmVyZmxvdyA9ICh0aGlzLl9hY3R1YWwuYWxsb3dFZGl0b3JPdmVyZmxvdyB8fCBmYWxzZSkgJiYgYWxsb3dPdmVyZmxvdztcblx0XHR0aGlzLnN1cHByZXNzTW91c2VEb3duID0gdGhpcy5fYWN0dWFsLnN1cHByZXNzTW91c2VEb3duIHx8IGZhbHNlO1xuXHRcdHRoaXMudXNlRGlzcGxheU5vbmUgPSB0aGlzLl9hY3R1YWwudXNlRGlzcGxheU5vbmUgfHwgZmFsc2U7XG5cblx0XHR0aGlzLl9maXhlZE92ZXJmbG93V2lkZ2V0cyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5maXhlZE92ZXJmbG93V2lkZ2V0cyk7XG5cdFx0dGhpcy5fY29udGVudFdpZHRoID0gbGF5b3V0SW5mby5jb250ZW50V2lkdGg7XG5cdFx0dGhpcy5fY29udGVudExlZnQgPSBsYXlvdXRJbmZvLmNvbnRlbnRMZWZ0O1xuXG5cdFx0dGhpcy5fYWZmaW5pdHkgPSBudWxsO1xuXHRcdHRoaXMuX3ByZWZlcmVuY2UgPSBbXTtcblx0XHR0aGlzLl9jYWNoZWREb21Ob2RlT2Zmc2V0V2lkdGggPSAtMTtcblx0XHR0aGlzLl9jYWNoZWREb21Ob2RlT2Zmc2V0SGVpZ2h0ID0gLTE7XG5cdFx0dGhpcy5fbWF4V2lkdGggPSB0aGlzLl9nZXRNYXhXaWR0aCgpO1xuXHRcdHRoaXMuX2lzVmlzaWJsZSA9IGZhbHNlO1xuXHRcdHRoaXMuX3JlbmRlckRhdGEgPSBudWxsO1xuXG5cdFx0dGhpcy5kb21Ob2RlLnNldFBvc2l0aW9uKCh0aGlzLl9maXhlZE92ZXJmbG93V2lkZ2V0cyAmJiB0aGlzLmFsbG93RWRpdG9yT3ZlcmZsb3cpID8gJ2ZpeGVkJyA6ICdhYnNvbHV0ZScpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXREaXNwbGF5KCdub25lJyk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldFZpc2liaWxpdHkoJ2hpZGRlbicpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3dpZGdldElkJywgdGhpcy5pZCk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldE1heFdpZHRoKHRoaXMuX21heFdpZHRoKTtcblx0fVxuXG5cdHB1YmxpYyBvbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0NvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbykpIHtcblx0XHRcdGNvbnN0IGxheW91dEluZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbyk7XG5cdFx0XHR0aGlzLl9jb250ZW50TGVmdCA9IGxheW91dEluZm8uY29udGVudExlZnQ7XG5cdFx0XHR0aGlzLl9jb250ZW50V2lkdGggPSBsYXlvdXRJbmZvLmNvbnRlbnRXaWR0aDtcblx0XHRcdHRoaXMuX21heFdpZHRoID0gdGhpcy5fZ2V0TWF4V2lkdGgoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlQW5jaG9yVmlld1Bvc2l0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NldFBvc2l0aW9uKHRoaXMuX2FmZmluaXR5LCB0aGlzLl9wcmltYXJ5QW5jaG9yLm1vZGVsUG9zaXRpb24sIHRoaXMuX3NlY29uZGFyeUFuY2hvci5tb2RlbFBvc2l0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFBvc2l0aW9uKGFmZmluaXR5OiBQb3NpdGlvbkFmZmluaXR5IHwgbnVsbCwgcHJpbWFyeUFuY2hvcjogSVBvc2l0aW9uIHwgbnVsbCwgc2Vjb25kYXJ5QW5jaG9yOiBJUG9zaXRpb24gfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5fYWZmaW5pdHkgPSBhZmZpbml0eTtcblx0XHR0aGlzLl9wcmltYXJ5QW5jaG9yID0gZ2V0VmFsaWRQb3NpdGlvblBhaXIocHJpbWFyeUFuY2hvciwgdGhpcy5fY29udGV4dC52aWV3TW9kZWwsIHRoaXMuX2FmZmluaXR5KTtcblx0XHR0aGlzLl9zZWNvbmRhcnlBbmNob3IgPSBnZXRWYWxpZFBvc2l0aW9uUGFpcihzZWNvbmRhcnlBbmNob3IsIHRoaXMuX2NvbnRleHQudmlld01vZGVsLCB0aGlzLl9hZmZpbml0eSk7XG5cblx0XHRmdW5jdGlvbiBnZXRWYWxpZFBvc2l0aW9uUGFpcihwb3NpdGlvbjogSVBvc2l0aW9uIHwgbnVsbCwgdmlld01vZGVsOiBJVmlld01vZGVsLCBhZmZpbml0eTogUG9zaXRpb25BZmZpbml0eSB8IG51bGwpOiBQb3NpdGlvblBhaXIge1xuXHRcdFx0aWYgKCFwb3NpdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uUGFpcihudWxsLCBudWxsKTtcblx0XHRcdH1cblx0XHRcdC8vIERvIG5vdCB0cnVzdCB0aGF0IHdpZGdldHMgZ2l2ZSBhIHZhbGlkIHBvc2l0aW9uXG5cdFx0XHRjb25zdCB2YWxpZE1vZGVsUG9zaXRpb24gPSB2aWV3TW9kZWwubW9kZWwudmFsaWRhdGVQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRpZiAodmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUodmFsaWRNb2RlbFBvc2l0aW9uKSkge1xuXHRcdFx0XHRjb25zdCB2aWV3UG9zaXRpb24gPSB2aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbih2YWxpZE1vZGVsUG9zaXRpb24sIGFmZmluaXR5ID8/IHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJldHVybiBuZXcgUG9zaXRpb25QYWlyKHBvc2l0aW9uLCB2aWV3UG9zaXRpb24pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvblBhaXIocG9zaXRpb24sIG51bGwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldE1heFdpZHRoKCk6IG51bWJlciB7XG5cdFx0Y29uc3QgZWxEb2N1bWVudCA9IHRoaXMuZG9tTm9kZS5kb21Ob2RlLm93bmVyRG9jdW1lbnQ7XG5cdFx0Y29uc3QgZWxXaW5kb3cgPSBlbERvY3VtZW50LmRlZmF1bHRWaWV3O1xuXHRcdHJldHVybiAoXG5cdFx0XHR0aGlzLmFsbG93RWRpdG9yT3ZlcmZsb3dcblx0XHRcdFx0PyBlbFdpbmRvdz8uaW5uZXJXaWR0aCB8fCBlbERvY3VtZW50LmRvY3VtZW50RWxlbWVudC5vZmZzZXRXaWR0aCB8fCBlbERvY3VtZW50LmJvZHkub2Zmc2V0V2lkdGhcblx0XHRcdFx0OiB0aGlzLl9jb250ZW50V2lkdGhcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHNldFBvc2l0aW9uKHByaW1hcnlBbmNob3I6IElQb3NpdGlvbiB8IG51bGwsIHNlY29uZGFyeUFuY2hvcjogSVBvc2l0aW9uIHwgbnVsbCwgcHJlZmVyZW5jZTogQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZVtdIHwgbnVsbCwgYWZmaW5pdHk6IFBvc2l0aW9uQWZmaW5pdHkgfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0UG9zaXRpb24oYWZmaW5pdHksIHByaW1hcnlBbmNob3IsIHNlY29uZGFyeUFuY2hvcik7XG5cdFx0dGhpcy5fcHJlZmVyZW5jZSA9IHByZWZlcmVuY2U7XG5cdFx0aWYgKCF0aGlzLnVzZURpc3BsYXlOb25lICYmIHRoaXMuX3ByaW1hcnlBbmNob3Iudmlld1Bvc2l0aW9uICYmIHRoaXMuX3ByZWZlcmVuY2UgJiYgdGhpcy5fcHJlZmVyZW5jZS5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyB0aGlzIGNvbnRlbnQgd2lkZ2V0IHdvdWxkIGxpa2UgdG8gYmUgdmlzaWJsZSBpZiBwb3NzaWJsZVxuXHRcdFx0Ly8gd2UgY2hhbmdlIGl0IGZyb20gYGRpc3BsYXk6bm9uZWAgdG8gYGRpc3BsYXk6YmxvY2tgIGV2ZW4gaWYgaXRcblx0XHRcdC8vIG1pZ2h0IGJlIG91dHNpZGUgdGhlIHZpZXdwb3J0IHN1Y2ggdGhhdCB3ZSBjYW4gbWVhc3VyZSBpdHMgc2l6ZVxuXHRcdFx0Ly8gaW4gYHByZXBhcmVSZW5kZXJgXG5cdFx0XHR0aGlzLmRvbU5vZGUuc2V0RGlzcGxheSgnYmxvY2snKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kb21Ob2RlLnNldERpc3BsYXkoJ25vbmUnKTtcblx0XHR9XG5cdFx0dGhpcy5fY2FjaGVkRG9tTm9kZU9mZnNldFdpZHRoID0gLTE7XG5cdFx0dGhpcy5fY2FjaGVkRG9tTm9kZU9mZnNldEhlaWdodCA9IC0xO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0Qm94SW5WaWV3cG9ydChhbmNob3I6IEFuY2hvckNvb3JkaW5hdGUsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBjdHg6IFJlbmRlcmluZ0NvbnRleHQpOiBJQm94TGF5b3V0UmVzdWx0IHtcblx0XHQvLyBPdXIgdmlzaWJsZSBib3ggaXMgc3BsaXQgaG9yaXpvbnRhbGx5IGJ5IHRoZSBjdXJyZW50IGxpbmUgPT4gMiBib3hlc1xuXG5cdFx0Ly8gYSkgdGhlIGJveCBhYm92ZSB0aGUgbGluZVxuXHRcdGNvbnN0IGFib3ZlTGluZVRvcCA9IGFuY2hvci50b3A7XG5cdFx0Y29uc3QgaGVpZ2h0QXZhaWxhYmxlQWJvdmVMaW5lID0gYWJvdmVMaW5lVG9wO1xuXG5cdFx0Ly8gYikgdGhlIGJveCB1bmRlciB0aGUgbGluZVxuXHRcdGNvbnN0IHVuZGVyTGluZVRvcCA9IGFuY2hvci50b3AgKyBhbmNob3IuaGVpZ2h0O1xuXHRcdGNvbnN0IGhlaWdodEF2YWlsYWJsZVVuZGVyTGluZSA9IGN0eC52aWV3cG9ydEhlaWdodCAtIHVuZGVyTGluZVRvcDtcblxuXHRcdGNvbnN0IGFib3ZlVG9wID0gYWJvdmVMaW5lVG9wIC0gaGVpZ2h0O1xuXHRcdGNvbnN0IGZpdHNBYm92ZSA9IChoZWlnaHRBdmFpbGFibGVBYm92ZUxpbmUgPj0gaGVpZ2h0KTtcblx0XHRjb25zdCBiZWxvd1RvcCA9IHVuZGVyTGluZVRvcDtcblx0XHRjb25zdCBmaXRzQmVsb3cgPSAoaGVpZ2h0QXZhaWxhYmxlVW5kZXJMaW5lID49IGhlaWdodCk7XG5cblx0XHQvLyBBbmQgaXRzIGxlZnRcblx0XHRsZXQgbGVmdCA9IGFuY2hvci5sZWZ0O1xuXHRcdGlmIChsZWZ0ICsgd2lkdGggPiBjdHguc2Nyb2xsTGVmdCArIGN0eC52aWV3cG9ydFdpZHRoKSB7XG5cdFx0XHRsZWZ0ID0gY3R4LnNjcm9sbExlZnQgKyBjdHgudmlld3BvcnRXaWR0aCAtIHdpZHRoO1xuXHRcdH1cblx0XHRpZiAobGVmdCA8IGN0eC5zY3JvbGxMZWZ0KSB7XG5cdFx0XHRsZWZ0ID0gY3R4LnNjcm9sbExlZnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgZml0c0Fib3ZlLCBhYm92ZVRvcCwgZml0c0JlbG93LCBiZWxvd1RvcCwgbGVmdCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0SG9yaXpvbnRhbFNlZ21lbnRJblBhZ2Uod2luZG93U2l6ZTogZG9tLkRpbWVuc2lvbiwgZG9tTm9kZVBvc2l0aW9uOiBkb20uSURvbU5vZGVQYWdlUG9zaXRpb24sIGxlZnQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IFtudW1iZXIsIG51bWJlcl0ge1xuXHRcdC8vIExlYXZlIHNvbWUgY2xlYXJhbmNlIHRvIHRoZSBsZWZ0L3JpZ2h0XG5cdFx0Y29uc3QgTEVGVF9QQURESU5HID0gMTU7XG5cdFx0Y29uc3QgUklHSFRfUEFERElORyA9IDE1O1xuXG5cdFx0Ly8gSW5pdGlhbGx5LCB0aGUgbGltaXRzIGFyZSBkZWZpbmVkIGFzIHRoZSBkb20gbm9kZSBsaW1pdHNcblx0XHRjb25zdCBNSU5fTElNSVQgPSBNYXRoLm1heChMRUZUX1BBRERJTkcsIGRvbU5vZGVQb3NpdGlvbi5sZWZ0IC0gd2lkdGgpO1xuXHRcdGNvbnN0IE1BWF9MSU1JVCA9IE1hdGgubWluKGRvbU5vZGVQb3NpdGlvbi5sZWZ0ICsgZG9tTm9kZVBvc2l0aW9uLndpZHRoICsgd2lkdGgsIHdpbmRvd1NpemUud2lkdGggLSBSSUdIVF9QQURESU5HKTtcblxuXHRcdGNvbnN0IGVsRG9jdW1lbnQgPSB0aGlzLl92aWV3RG9tTm9kZS5kb21Ob2RlLm93bmVyRG9jdW1lbnQ7XG5cdFx0Y29uc3QgZWxXaW5kb3cgPSBlbERvY3VtZW50LmRlZmF1bHRWaWV3O1xuXHRcdGxldCBhYnNvbHV0ZUxlZnQgPSBkb21Ob2RlUG9zaXRpb24ubGVmdCArIGxlZnQgLSAoZWxXaW5kb3c/LnNjcm9sbFggPz8gMCk7XG5cblx0XHRpZiAoYWJzb2x1dGVMZWZ0ICsgd2lkdGggPiBNQVhfTElNSVQpIHtcblx0XHRcdGNvbnN0IGRlbHRhID0gYWJzb2x1dGVMZWZ0IC0gKE1BWF9MSU1JVCAtIHdpZHRoKTtcblx0XHRcdGFic29sdXRlTGVmdCAtPSBkZWx0YTtcblx0XHRcdGxlZnQgLT0gZGVsdGE7XG5cdFx0fVxuXG5cdFx0aWYgKGFic29sdXRlTGVmdCA8IE1JTl9MSU1JVCkge1xuXHRcdFx0Y29uc3QgZGVsdGEgPSBhYnNvbHV0ZUxlZnQgLSBNSU5fTElNSVQ7XG5cdFx0XHRhYnNvbHV0ZUxlZnQgLT0gZGVsdGE7XG5cdFx0XHRsZWZ0IC09IGRlbHRhO1xuXHRcdH1cblxuXHRcdHJldHVybiBbbGVmdCwgYWJzb2x1dGVMZWZ0XTtcblx0fVxuXG5cdHByaXZhdGUgX2xheW91dEJveEluUGFnZShhbmNob3I6IEFuY2hvckNvb3JkaW5hdGUsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBjdHg6IFJlbmRlcmluZ0NvbnRleHQpOiBJQm94TGF5b3V0UmVzdWx0IHwgbnVsbCB7XG5cdFx0Y29uc3QgYWJvdmVUb3AgPSBhbmNob3IudG9wIC0gaGVpZ2h0O1xuXHRcdGNvbnN0IGJlbG93VG9wID0gYW5jaG9yLnRvcCArIGFuY2hvci5oZWlnaHQ7XG5cblx0XHRjb25zdCBkb21Ob2RlUG9zaXRpb24gPSBkb20uZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbih0aGlzLl92aWV3RG9tTm9kZS5kb21Ob2RlKTtcblx0XHRjb25zdCBlbERvY3VtZW50ID0gdGhpcy5fdmlld0RvbU5vZGUuZG9tTm9kZS5vd25lckRvY3VtZW50O1xuXHRcdGNvbnN0IGVsV2luZG93ID0gZWxEb2N1bWVudC5kZWZhdWx0Vmlldztcblx0XHRjb25zdCBhYnNvbHV0ZUFib3ZlVG9wID0gZG9tTm9kZVBvc2l0aW9uLnRvcCArIGFib3ZlVG9wIC0gKGVsV2luZG93Py5zY3JvbGxZID8/IDApO1xuXHRcdGNvbnN0IGFic29sdXRlQmVsb3dUb3AgPSBkb21Ob2RlUG9zaXRpb24udG9wICsgYmVsb3dUb3AgLSAoZWxXaW5kb3c/LnNjcm9sbFkgPz8gMCk7XG5cblx0XHRjb25zdCB3aW5kb3dTaXplID0gZG9tLmdldENsaWVudEFyZWEoZWxEb2N1bWVudC5ib2R5KTtcblx0XHRjb25zdCBbbGVmdCwgYWJzb2x1dGVBYm92ZUxlZnRdID0gdGhpcy5fbGF5b3V0SG9yaXpvbnRhbFNlZ21lbnRJblBhZ2Uod2luZG93U2l6ZSwgZG9tTm9kZVBvc2l0aW9uLCBhbmNob3IubGVmdCAtIGN0eC5zY3JvbGxMZWZ0ICsgdGhpcy5fY29udGVudExlZnQsIHdpZHRoKTtcblxuXHRcdC8vIExlYXZlIHNvbWUgY2xlYXJhbmNlIHRvIHRoZSB0b3AvYm90dG9tXG5cdFx0Y29uc3QgVE9QX1BBRERJTkcgPSAyMjtcblx0XHRjb25zdCBCT1RUT01fUEFERElORyA9IDIyO1xuXG5cdFx0Y29uc3QgZml0c0Fib3ZlID0gKGFic29sdXRlQWJvdmVUb3AgPj0gVE9QX1BBRERJTkcpO1xuXHRcdGNvbnN0IGZpdHNCZWxvdyA9IChhYnNvbHV0ZUJlbG93VG9wICsgaGVpZ2h0IDw9IHdpbmRvd1NpemUuaGVpZ2h0IC0gQk9UVE9NX1BBRERJTkcpO1xuXG5cdFx0aWYgKHRoaXMuX2ZpeGVkT3ZlcmZsb3dXaWRnZXRzKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRmaXRzQWJvdmUsXG5cdFx0XHRcdGFib3ZlVG9wOiBNYXRoLm1heChhYnNvbHV0ZUFib3ZlVG9wLCBUT1BfUEFERElORyksXG5cdFx0XHRcdGZpdHNCZWxvdyxcblx0XHRcdFx0YmVsb3dUb3A6IGFic29sdXRlQmVsb3dUb3AsXG5cdFx0XHRcdGxlZnQ6IGFic29sdXRlQWJvdmVMZWZ0XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGZpdHNBYm92ZSwgYWJvdmVUb3AsIGZpdHNCZWxvdywgYmVsb3dUb3AsIGxlZnQgfTtcblx0fVxuXG5cdHByaXZhdGUgX3ByZXBhcmVSZW5kZXJXaWRnZXRBdEV4YWN0UG9zaXRpb25PdmVyZmxvd2luZyh0b3BMZWZ0OiBDb29yZGluYXRlKTogQ29vcmRpbmF0ZSB7XG5cdFx0cmV0dXJuIG5ldyBDb29yZGluYXRlKHRvcExlZnQudG9wLCB0b3BMZWZ0LmxlZnQgKyB0aGlzLl9jb250ZW50TGVmdCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZSB0aGUgY29vcmRpbmF0ZXMgYWJvdmUgYW5kIGJlbG93IHRoZSBwcmltYXJ5IGFuZCBzZWNvbmRhcnkgYW5jaG9ycy5cblx0ICogVGhlIGNvbnRlbnQgd2lkZ2V0ICptdXN0KiB0b3VjaCB0aGUgcHJpbWFyeSBhbmNob3IuXG5cdCAqIFRoZSBjb250ZW50IHdpZGdldCBzaG91bGQgdG91Y2ggaWYgcG9zc2libGUgdGhlIHNlY29uZGFyeSBhbmNob3IuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRBbmNob3JzQ29vcmRpbmF0ZXMoY3R4OiBSZW5kZXJpbmdDb250ZXh0KTogeyBwcmltYXJ5OiBBbmNob3JDb29yZGluYXRlIHwgbnVsbDsgc2Vjb25kYXJ5OiBBbmNob3JDb29yZGluYXRlIHwgbnVsbCB9IHtcblx0XHRjb25zdCBwcmltYXJ5ID0gZ2V0Q29vcmRpbmF0ZXModGhpcy5fcHJpbWFyeUFuY2hvci52aWV3UG9zaXRpb24sIHRoaXMuX2FmZmluaXR5KTtcblx0XHRjb25zdCBzZWNvbmRhcnlWaWV3UG9zaXRpb24gPSAodGhpcy5fc2Vjb25kYXJ5QW5jaG9yLnZpZXdQb3NpdGlvbj8ubGluZU51bWJlciA9PT0gdGhpcy5fcHJpbWFyeUFuY2hvci52aWV3UG9zaXRpb24/LmxpbmVOdW1iZXIgPyB0aGlzLl9zZWNvbmRhcnlBbmNob3Iudmlld1Bvc2l0aW9uIDogbnVsbCk7XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5ID0gZ2V0Q29vcmRpbmF0ZXMoc2Vjb25kYXJ5Vmlld1Bvc2l0aW9uLCB0aGlzLl9hZmZpbml0eSk7XG5cdFx0cmV0dXJuIHsgcHJpbWFyeSwgc2Vjb25kYXJ5IH07XG5cblx0XHRmdW5jdGlvbiBnZXRDb29yZGluYXRlcyhwb3NpdGlvbjogUG9zaXRpb24gfCBudWxsLCBhZmZpbml0eTogUG9zaXRpb25BZmZpbml0eSB8IG51bGwpOiBBbmNob3JDb29yZGluYXRlIHwgbnVsbCB7XG5cdFx0XHRpZiAoIXBvc2l0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBob3Jpem9udGFsUG9zaXRpb24gPSBjdHgudmlzaWJsZVJhbmdlRm9yUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0aWYgKCFob3Jpem9udGFsUG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdC8vIExlZnQtYWxpZ24gd2lkZ2V0cyB0aGF0IHNob3VsZCBhcHBlYXIgOmJlZm9yZSBjb250ZW50XG5cdFx0XHRjb25zdCBsZWZ0ID0gKHBvc2l0aW9uLmNvbHVtbiA9PT0gMSAmJiBhZmZpbml0eSA9PT0gUG9zaXRpb25BZmZpbml0eS5MZWZ0T2ZJbmplY3RlZFRleHQgPyAwIDogaG9yaXpvbnRhbFBvc2l0aW9uLmxlZnQpO1xuXHRcdFx0Y29uc3QgdG9wID0gY3R4LmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcihwb3NpdGlvbi5saW5lTnVtYmVyKSAtIGN0eC5zY3JvbGxUb3A7XG5cdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gY3R4LmdldExpbmVIZWlnaHRGb3JMaW5lTnVtYmVyKHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdFx0cmV0dXJuIG5ldyBBbmNob3JDb29yZGluYXRlKHRvcCwgbGVmdCwgbGluZUhlaWdodCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVkdWNlQW5jaG9yQ29vcmRpbmF0ZXMocHJpbWFyeTogQW5jaG9yQ29vcmRpbmF0ZSwgc2Vjb25kYXJ5OiBBbmNob3JDb29yZGluYXRlIHwgbnVsbCwgd2lkdGg6IG51bWJlcik6IEFuY2hvckNvb3JkaW5hdGUge1xuXHRcdGlmICghc2Vjb25kYXJ5KSB7XG5cdFx0XHRyZXR1cm4gcHJpbWFyeTtcblx0XHR9XG5cblx0XHRjb25zdCBmb250SW5mbyA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXG5cdFx0bGV0IGxlZnQgPSBzZWNvbmRhcnkubGVmdDtcblx0XHRpZiAobGVmdCA8IHByaW1hcnkubGVmdCkge1xuXHRcdFx0bGVmdCA9IE1hdGgubWF4KGxlZnQsIHByaW1hcnkubGVmdCAtIHdpZHRoICsgZm9udEluZm8udHlwaWNhbEZ1bGx3aWR0aENoYXJhY3RlcldpZHRoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGVmdCA9IE1hdGgubWluKGxlZnQsIHByaW1hcnkubGVmdCArIHdpZHRoIC0gZm9udEluZm8udHlwaWNhbEZ1bGx3aWR0aENoYXJhY3RlcldpZHRoKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBBbmNob3JDb29yZGluYXRlKHByaW1hcnkudG9wLCBsZWZ0LCBwcmltYXJ5LmhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIF9wcmVwYXJlUmVuZGVyV2lkZ2V0KGN0eDogUmVuZGVyaW5nQ29udGV4dCk6IElSZW5kZXJEYXRhIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9wcmVmZXJlbmNlIHx8IHRoaXMuX3ByZWZlcmVuY2UubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCB7IHByaW1hcnksIHNlY29uZGFyeSB9ID0gdGhpcy5fZ2V0QW5jaG9yc0Nvb3JkaW5hdGVzKGN0eCk7XG5cdFx0aWYgKCFwcmltYXJ5KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnb2ZmVmlld3BvcnQnLFxuXHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiB0aGlzLmRvbU5vZGUuZG9tTm9kZS5jb250YWlucyh0aGlzLmRvbU5vZGUuZG9tTm9kZS5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpXG5cdFx0XHR9O1xuXHRcdFx0Ly8gcmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2NhY2hlZERvbU5vZGVPZmZzZXRXaWR0aCA9PT0gLTEgfHwgdGhpcy5fY2FjaGVkRG9tTm9kZU9mZnNldEhlaWdodCA9PT0gLTEpIHtcblxuXHRcdFx0bGV0IHByZWZlcnJlZERpbWVuc2lvbnM6IElEaW1lbnNpb24gfCBudWxsID0gbnVsbDtcblx0XHRcdGlmICh0eXBlb2YgdGhpcy5fYWN0dWFsLmJlZm9yZVJlbmRlciA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRwcmVmZXJyZWREaW1lbnNpb25zID0gc2FmZUludm9rZSh0aGlzLl9hY3R1YWwuYmVmb3JlUmVuZGVyLCB0aGlzLl9hY3R1YWwpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByZWZlcnJlZERpbWVuc2lvbnMpIHtcblx0XHRcdFx0dGhpcy5fY2FjaGVkRG9tTm9kZU9mZnNldFdpZHRoID0gcHJlZmVycmVkRGltZW5zaW9ucy53aWR0aDtcblx0XHRcdFx0dGhpcy5fY2FjaGVkRG9tTm9kZU9mZnNldEhlaWdodCA9IHByZWZlcnJlZERpbWVuc2lvbnMuaGVpZ2h0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZG9tTm9kZSA9IHRoaXMuZG9tTm9kZS5kb21Ob2RlO1xuXHRcdFx0XHRjb25zdCBjbGllbnRSZWN0ID0gZG9tTm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0dGhpcy5fY2FjaGVkRG9tTm9kZU9mZnNldFdpZHRoID0gTWF0aC5yb3VuZChjbGllbnRSZWN0LndpZHRoKTtcblx0XHRcdFx0dGhpcy5fY2FjaGVkRG9tTm9kZU9mZnNldEhlaWdodCA9IE1hdGgucm91bmQoY2xpZW50UmVjdC5oZWlnaHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGFuY2hvciA9IHRoaXMuX3JlZHVjZUFuY2hvckNvb3JkaW5hdGVzKHByaW1hcnksIHNlY29uZGFyeSwgdGhpcy5fY2FjaGVkRG9tTm9kZU9mZnNldFdpZHRoKTtcblxuXHRcdGxldCBwbGFjZW1lbnQ6IElCb3hMYXlvdXRSZXN1bHQgfCBudWxsO1xuXHRcdGlmICh0aGlzLmFsbG93RWRpdG9yT3ZlcmZsb3cpIHtcblx0XHRcdHBsYWNlbWVudCA9IHRoaXMuX2xheW91dEJveEluUGFnZShhbmNob3IsIHRoaXMuX2NhY2hlZERvbU5vZGVPZmZzZXRXaWR0aCwgdGhpcy5fY2FjaGVkRG9tTm9kZU9mZnNldEhlaWdodCwgY3R4KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cGxhY2VtZW50ID0gdGhpcy5fbGF5b3V0Qm94SW5WaWV3cG9ydChhbmNob3IsIHRoaXMuX2NhY2hlZERvbU5vZGVPZmZzZXRXaWR0aCwgdGhpcy5fY2FjaGVkRG9tTm9kZU9mZnNldEhlaWdodCwgY3R4KTtcblx0XHR9XG5cblx0XHQvLyBEbyB0d28gcGFzc2VzLCBmaXJzdCBmb3IgcGVyZmVjdCBmaXQsIHNlY29uZCBwaWNrcyBmaXJzdCBvcHRpb25cblx0XHRmb3IgKGxldCBwYXNzID0gMTsgcGFzcyA8PSAyOyBwYXNzKyspIHtcblx0XHRcdGZvciAoY29uc3QgcHJlZiBvZiB0aGlzLl9wcmVmZXJlbmNlKSB7XG5cdFx0XHRcdC8vIHBsYWNlbWVudFxuXHRcdFx0XHRpZiAocHJlZiA9PT0gQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5BQk9WRSkge1xuXHRcdFx0XHRcdGlmICghcGxhY2VtZW50KSB7XG5cdFx0XHRcdFx0XHQvLyBXaWRnZXQgb3V0c2lkZSBvZiB2aWV3cG9ydFxuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChwYXNzID09PSAyIHx8IHBsYWNlbWVudC5maXRzQWJvdmUpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICdpblZpZXdwb3J0Jyxcblx0XHRcdFx0XHRcdFx0Y29vcmRpbmF0ZTogbmV3IENvb3JkaW5hdGUocGxhY2VtZW50LmFib3ZlVG9wLCBwbGFjZW1lbnQubGVmdCksXG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkFCT1ZFXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChwcmVmID09PSBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkJFTE9XKSB7XG5cdFx0XHRcdFx0aWYgKCFwbGFjZW1lbnQpIHtcblx0XHRcdFx0XHRcdC8vIFdpZGdldCBvdXRzaWRlIG9mIHZpZXdwb3J0XG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHBhc3MgPT09IDIgfHwgcGxhY2VtZW50LmZpdHNCZWxvdykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ2luVmlld3BvcnQnLFxuXHRcdFx0XHRcdFx0XHRjb29yZGluYXRlOiBuZXcgQ29vcmRpbmF0ZShwbGFjZW1lbnQuYmVsb3dUb3AsIHBsYWNlbWVudC5sZWZ0KSxcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQkVMT1dcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmICh0aGlzLmFsbG93RWRpdG9yT3ZlcmZsb3cpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICdpblZpZXdwb3J0Jyxcblx0XHRcdFx0XHRcdFx0Y29vcmRpbmF0ZTogdGhpcy5fcHJlcGFyZVJlbmRlcldpZGdldEF0RXhhY3RQb3NpdGlvbk92ZXJmbG93aW5nKG5ldyBDb29yZGluYXRlKGFuY2hvci50b3AsIGFuY2hvci5sZWZ0KSksXG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkVYQUNUXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRraW5kOiAnaW5WaWV3cG9ydCcsXG5cdFx0XHRcdFx0XHRcdGNvb3JkaW5hdGU6IG5ldyBDb29yZGluYXRlKGFuY2hvci50b3AsIGFuY2hvci5sZWZ0KSxcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuRVhBQ1Rcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHQvKipcblx0ICogT24gdGhpcyBmaXJzdCBwYXNzLCB3ZSBlbnN1cmUgdGhhdCB0aGUgY29udGVudCB3aWRnZXQgKGlmIGl0IGlzIGluIHRoZSB2aWV3cG9ydCkgaGFzIHRoZSBtYXggd2lkdGggc2V0IGNvcnJlY3RseS5cblx0ICovXG5cdHB1YmxpYyBvbkJlZm9yZVJlbmRlcih2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fcHJpbWFyeUFuY2hvci52aWV3UG9zaXRpb24gfHwgIXRoaXMuX3ByZWZlcmVuY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcHJpbWFyeUFuY2hvci52aWV3UG9zaXRpb24ubGluZU51bWJlciA8IHZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXIgfHwgdGhpcy5fcHJpbWFyeUFuY2hvci52aWV3UG9zaXRpb24ubGluZU51bWJlciA+IHZpZXdwb3J0RGF0YS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHQvLyBPdXRzaWRlIG9mIHZpZXdwb3J0XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5kb21Ob2RlLnNldE1heFdpZHRoKHRoaXMuX21heFdpZHRoKTtcblx0fVxuXG5cdHB1YmxpYyBwcmVwYXJlUmVuZGVyKGN0eDogUmVuZGVyaW5nQ29udGV4dCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlckRhdGEgPSB0aGlzLl9wcmVwYXJlUmVuZGVyV2lkZ2V0KGN0eCk7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyKGN0eDogUmVzdHJpY3RlZFJlbmRlcmluZ0NvbnRleHQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3JlbmRlckRhdGEgfHwgdGhpcy5fcmVuZGVyRGF0YS5raW5kID09PSAnb2ZmVmlld3BvcnQnKSB7XG5cdFx0XHQvLyBUaGlzIHdpZGdldCBzaG91bGQgYmUgaW52aXNpYmxlXG5cdFx0XHRpZiAodGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuZG9tTm9kZS5yZW1vdmVBdHRyaWJ1dGUoJ21vbmFjby12aXNpYmxlLWNvbnRlbnQtd2lkZ2V0Jyk7XG5cdFx0XHRcdHRoaXMuX2lzVmlzaWJsZSA9IGZhbHNlO1xuXG5cdFx0XHRcdGlmICh0aGlzLl9yZW5kZXJEYXRhPy5raW5kID09PSAnb2ZmVmlld3BvcnQnICYmIHRoaXMuX3JlbmRlckRhdGEucHJlc2VydmVGb2N1cykge1xuXHRcdFx0XHRcdC8vIHdpZGdldCB3YW50cyB0byBiZSBzaG93biwgYnV0IGl0IGlzIG91dHNpZGUgb2YgdGhlIHZpZXdwb3J0IGFuZCBpdFxuXHRcdFx0XHRcdC8vIGhhcyBmb2N1cyB3aGljaCB3ZSBuZWVkIHRvIHByZXNlcnZlXG5cdFx0XHRcdFx0dGhpcy5kb21Ob2RlLnNldFRvcCgtMTAwMCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5kb21Ob2RlLnNldFZpc2liaWxpdHkoJ2hpZGRlbicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0eXBlb2YgdGhpcy5fYWN0dWFsLmFmdGVyUmVuZGVyID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdHNhZmVJbnZva2UodGhpcy5fYWN0dWFsLmFmdGVyUmVuZGVyLCB0aGlzLl9hY3R1YWwsIG51bGwsIG51bGwpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoaXMgd2lkZ2V0IHNob3VsZCBiZSB2aXNpYmxlXG5cdFx0aWYgKHRoaXMuYWxsb3dFZGl0b3JPdmVyZmxvdykge1xuXHRcdFx0dGhpcy5kb21Ob2RlLnNldFRvcCh0aGlzLl9yZW5kZXJEYXRhLmNvb3JkaW5hdGUudG9wKTtcblx0XHRcdHRoaXMuZG9tTm9kZS5zZXRMZWZ0KHRoaXMuX3JlbmRlckRhdGEuY29vcmRpbmF0ZS5sZWZ0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kb21Ob2RlLnNldFRvcCh0aGlzLl9yZW5kZXJEYXRhLmNvb3JkaW5hdGUudG9wICsgY3R4LnNjcm9sbFRvcCAtIGN0eC5iaWdOdW1iZXJzRGVsdGEpO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnNldExlZnQodGhpcy5fcmVuZGVyRGF0YS5jb29yZGluYXRlLmxlZnQpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc2V0VmlzaWJpbGl0eSgnaW5oZXJpdCcpO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnbW9uYWNvLXZpc2libGUtY29udGVudC13aWRnZXQnLCAndHJ1ZScpO1xuXHRcdFx0dGhpcy5faXNWaXNpYmxlID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHRoaXMuX2FjdHVhbC5hZnRlclJlbmRlciA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0c2FmZUludm9rZSh0aGlzLl9hY3R1YWwuYWZ0ZXJSZW5kZXIsIHRoaXMuX2FjdHVhbCwgdGhpcy5fcmVuZGVyRGF0YS5wb3NpdGlvbiwgdGhpcy5fcmVuZGVyRGF0YS5jb29yZGluYXRlKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgUG9zaXRpb25QYWlyIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IG1vZGVsUG9zaXRpb246IElQb3NpdGlvbiB8IG51bGwsXG5cdFx0cHVibGljIHJlYWRvbmx5IHZpZXdQb3NpdGlvbjogUG9zaXRpb24gfCBudWxsXG5cdCkgeyB9XG59XG5cbmNsYXNzIENvb3JkaW5hdGUgaW1wbGVtZW50cyBJQ29udGVudFdpZGdldFJlbmRlcmVkQ29vcmRpbmF0ZSB7XG5cdF9jb29yZGluYXRlQnJhbmQ6IHZvaWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHRvcDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBsZWZ0OiBudW1iZXJcblx0KSB7IH1cbn1cblxuY2xhc3MgQW5jaG9yQ29vcmRpbmF0ZSB7XG5cdF9hbmNob3JDb29yZGluYXRlQnJhbmQ6IHZvaWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHRvcDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBsZWZ0OiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGhlaWdodDogbnVtYmVyXG5cdCkgeyB9XG59XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5mdW5jdGlvbiBzYWZlSW52b2tlPFQgZXh0ZW5kcyAoLi4uYXJnczogYW55W10pID0+IGFueT4oZm46IFQsIHRoaXNBcmc6IFRoaXNQYXJhbWV0ZXJUeXBlPFQ+LCAuLi5hcmdzOiBQYXJhbWV0ZXJzPFQ+KTogUmV0dXJuVHlwZTxUPiB8IG51bGwge1xuXHR0cnkge1xuXHRcdHJldHVybiBmbi5jYWxsKHRoaXNBcmcsIC4uLmFyZ3MpO1xuXHR9IGNhdGNoIHtcblx0XHQvLyBpZ25vcmVcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQXNCLHlCQUF5QjtBQUMvQyxTQUFTLHVDQUF5RjtBQUNsRyxTQUFTLGlCQUFpQixrQkFBa0IsZ0JBQWdCO0FBSzVELFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsd0JBQXdCO0FBUzFCLE1BQU0sMkJBQTJCLFNBQVM7QUFBQSxFQVFoRCxZQUFZLFNBQXNCLGFBQXVDO0FBQ3hFLFVBQU0sT0FBTztBQUNiLFNBQUssZUFBZTtBQUNwQixTQUFLLFdBQVcsQ0FBQztBQUVqQixTQUFLLFVBQVUsa0JBQWtCLFNBQVMsY0FBYyxLQUFLLENBQUM7QUFDOUQscUJBQWlCLE1BQU0sS0FBSyxTQUFTLGdCQUFnQixjQUFjO0FBQ25FLFNBQUssUUFBUSxhQUFhLGdCQUFnQjtBQUMxQyxTQUFLLFFBQVEsWUFBWSxVQUFVO0FBQ25DLFNBQUssUUFBUSxPQUFPLENBQUM7QUFFckIsU0FBSyxtQ0FBbUMsa0JBQWtCLFNBQVMsY0FBYyxLQUFLLENBQUM7QUFDdkYscUJBQWlCLE1BQU0sS0FBSyxrQ0FBa0MsZ0JBQWdCLHlCQUF5QjtBQUN2RyxTQUFLLGlDQUFp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
