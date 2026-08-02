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
import * as dom from "../../../../base/browser/dom.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { ScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { Color } from "../../../../base/common/color.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { basename } from "../../../../base/common/resources.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { splitLines } from "../../../../base/common/strings.js";
import "./media/gotoErrorWidget.css";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { peekViewTitleForeground, peekViewTitleInfoForeground, PeekViewWidget } from "../../peekView/browser/peekView.js";
import * as nls from "../../../../nls.js";
import { getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { SeverityIcon } from "../../../../base/browser/ui/severityIcon/severityIcon.js";
import { contrastBorder, editorBackground, editorErrorBorder, editorErrorForeground, editorInfoBorder, editorInfoForeground, editorWarningBorder, editorWarningForeground, oneOf, registerColor, transparent } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
class MessageWidget {
  constructor(parent, editor, onRelatedInformation, _openerService, _labelService) {
    this._openerService = _openerService;
    this._labelService = _labelService;
    this._lines = 0;
    this._longestLineLength = 0;
    this._relatedDiagnostics = /* @__PURE__ */ new WeakMap();
    this._disposables = new DisposableStore();
    this._editor = editor;
    const domNode = document.createElement("div");
    domNode.className = "descriptioncontainer";
    this._messageBlock = document.createElement("div");
    this._messageBlock.classList.add("message");
    this._messageBlock.setAttribute("aria-live", "assertive");
    this._messageBlock.setAttribute("role", "alert");
    domNode.appendChild(this._messageBlock);
    this._relatedBlock = document.createElement("div");
    domNode.appendChild(this._relatedBlock);
    this._disposables.add(dom.addStandardDisposableListener(this._relatedBlock, "click", (event) => {
      event.preventDefault();
      const related = this._relatedDiagnostics.get(event.target);
      if (related) {
        onRelatedInformation(related);
      }
    }));
    this._scrollable = new ScrollableElement(domNode, {
      horizontal: ScrollbarVisibility.Auto,
      vertical: ScrollbarVisibility.Auto,
      useShadows: false,
      horizontalScrollbarSize: 6,
      verticalScrollbarSize: 6
    });
    parent.appendChild(this._scrollable.getDomNode());
    this._disposables.add(this._scrollable.onScroll((e) => {
      domNode.style.left = `-${e.scrollLeft}px`;
      domNode.style.top = `-${e.scrollTop}px`;
    }));
    this._disposables.add(this._scrollable);
  }
  dispose() {
    dispose(this._disposables);
  }
  update(marker) {
    const { source, message, relatedInformation, code } = marker;
    let sourceAndCodeLength = (source?.length || 0) + "()".length;
    if (code) {
      if (typeof code === "string") {
        sourceAndCodeLength += code.length;
      } else {
        sourceAndCodeLength += code.value.length;
      }
    }
    const lines = splitLines(message);
    this._lines = lines.length;
    this._longestLineLength = 0;
    for (const line of lines) {
      this._longestLineLength = Math.max(line.length + sourceAndCodeLength, this._longestLineLength);
    }
    dom.clearNode(this._messageBlock);
    this._messageBlock.setAttribute("aria-label", this.getAriaLabel(marker));
    aria.status(this.getAriaLabel(marker));
    this._editor.applyFontInfo(this._messageBlock);
    let lastLineElement = this._messageBlock;
    for (const line of lines) {
      lastLineElement = document.createElement("div");
      lastLineElement.innerText = line;
      if (line === "") {
        lastLineElement.style.height = this._messageBlock.style.lineHeight;
      }
      this._messageBlock.appendChild(lastLineElement);
    }
    if (source || code) {
      const detailsElement = document.createElement("span");
      detailsElement.classList.add("details");
      lastLineElement.appendChild(detailsElement);
      if (source) {
        const sourceElement = document.createElement("span");
        sourceElement.innerText = source;
        sourceElement.classList.add("source");
        detailsElement.appendChild(sourceElement);
      }
      if (code) {
        if (typeof code === "string") {
          const codeElement = document.createElement("span");
          codeElement.innerText = `(${code})`;
          codeElement.classList.add("code");
          detailsElement.appendChild(codeElement);
        } else {
          this._codeLink = dom.$("a.code-link");
          this._codeLink.setAttribute("href", `${code.target.toString()}`);
          this._codeLink.onclick = (e) => {
            this._openerService.open(code.target, { allowCommands: true });
            e.preventDefault();
            e.stopPropagation();
          };
          const codeElement = dom.append(this._codeLink, dom.$("span"));
          codeElement.innerText = code.value;
          detailsElement.appendChild(this._codeLink);
        }
      }
    }
    dom.clearNode(this._relatedBlock);
    this._editor.applyFontInfo(this._relatedBlock);
    if (isNonEmptyArray(relatedInformation)) {
      const relatedInformationNode = this._relatedBlock.appendChild(document.createElement("div"));
      relatedInformationNode.style.paddingTop = `${Math.floor(this._editor.getOption(EditorOption.lineHeight) * 0.66)}px`;
      this._lines += 1;
      for (const related of relatedInformation) {
        const container = document.createElement("div");
        const relatedResource = document.createElement("a");
        relatedResource.classList.add("filename");
        relatedResource.innerText = `${this._labelService.getUriBasenameLabel(related.resource)}(${related.startLineNumber}, ${related.startColumn}): `;
        relatedResource.title = this._labelService.getUriLabel(related.resource);
        this._relatedDiagnostics.set(relatedResource, related);
        const relatedMessage = document.createElement("span");
        relatedMessage.innerText = related.message;
        container.appendChild(relatedResource);
        container.appendChild(relatedMessage);
        this._lines += 1;
        relatedInformationNode.appendChild(container);
      }
    }
    const fontInfo = this._editor.getOption(EditorOption.fontInfo);
    const scrollWidth = Math.ceil(fontInfo.typicalFullwidthCharacterWidth * this._longestLineLength * 0.75);
    const scrollHeight = fontInfo.lineHeight * this._lines;
    this._scrollable.setScrollDimensions({ scrollWidth, scrollHeight });
  }
  layout(height, width) {
    this._scrollable.getDomNode().style.height = `${height}px`;
    this._scrollable.getDomNode().style.width = `${width}px`;
    this._scrollable.setScrollDimensions({ width, height });
  }
  getHeightInLines() {
    return Math.min(17, this._lines);
  }
  getAriaLabel(marker) {
    let severityLabel = "";
    switch (marker.severity) {
      case MarkerSeverity.Error:
        severityLabel = nls.localize("Error", "Error");
        break;
      case MarkerSeverity.Warning:
        severityLabel = nls.localize("Warning", "Warning");
        break;
      case MarkerSeverity.Info:
        severityLabel = nls.localize("Info", "Info");
        break;
      case MarkerSeverity.Hint:
        severityLabel = nls.localize("Hint", "Hint");
        break;
    }
    let ariaLabel = nls.localize("marker aria", "{0}: {1} at {2}. ", severityLabel, marker.message, marker.startLineNumber + ":" + marker.startColumn);
    const model = this._editor.getModel();
    if (model && marker.startLineNumber <= model.getLineCount() && marker.startLineNumber >= 1) {
      const lineContent = model.getLineContent(marker.startLineNumber);
      ariaLabel = `${lineContent}, ${ariaLabel}`;
    }
    return ariaLabel;
  }
}
let MarkerNavigationWidget = class extends PeekViewWidget {
  constructor(editor, _themeService, _openerService, _menuService, instantiationService, _contextKeyService, _labelService) {
    super(editor, { showArrow: true, showFrame: true, isAccessible: true, frameWidth: 1 }, instantiationService);
    this._themeService = _themeService;
    this._openerService = _openerService;
    this._menuService = _menuService;
    this._contextKeyService = _contextKeyService;
    this._labelService = _labelService;
    this._callOnDispose = new DisposableStore();
    this._onDidSelectRelatedInformation = new Emitter();
    this.onDidSelectRelatedInformation = this._onDidSelectRelatedInformation.event;
    this._severity = MarkerSeverity.Warning;
    this._backgroundColor = Color.white;
    this._applyTheme(_themeService.getColorTheme());
    this._callOnDispose.add(_themeService.onDidColorThemeChange(this._applyTheme.bind(this)));
    this.create();
  }
  _applyTheme(theme) {
    this._backgroundColor = theme.getColor(editorMarkerNavigationBackground);
    let colorId = editorMarkerNavigationError;
    let headerBackground = editorMarkerNavigationErrorHeader;
    if (this._severity === MarkerSeverity.Warning) {
      colorId = editorMarkerNavigationWarning;
      headerBackground = editorMarkerNavigationWarningHeader;
    } else if (this._severity === MarkerSeverity.Info) {
      colorId = editorMarkerNavigationInfo;
      headerBackground = editorMarkerNavigationInfoHeader;
    }
    const frameColor = theme.getColor(colorId);
    const headerBg = theme.getColor(headerBackground);
    this.style({
      arrowColor: frameColor,
      frameColor,
      headerBackgroundColor: headerBg,
      primaryHeadingColor: theme.getColor(peekViewTitleForeground),
      secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
    });
  }
  _applyStyles() {
    if (this._parentContainer) {
      this._parentContainer.style.backgroundColor = this._backgroundColor ? this._backgroundColor.toString() : "";
    }
    super._applyStyles();
  }
  dispose() {
    this._callOnDispose.dispose();
    this._onDidSelectRelatedInformation.dispose();
    super.dispose();
  }
  focus() {
    this._parentContainer.focus();
  }
  _fillHead(container) {
    super._fillHead(container);
    this._disposables.add(this._actionbarWidget.actionRunner.onWillRun((e) => this.editor.focus()));
    const menu = this._menuService.getMenuActions(MarkerNavigationWidget.TitleMenu, this._contextKeyService);
    const actions = getFlatActionBarActions(menu);
    this._actionbarWidget.push(actions, { label: false, icon: true, index: 0 });
  }
  _fillTitleIcon(container) {
    this._icon = dom.append(container, dom.$(""));
  }
  _fillBody(container) {
    this._parentContainer = container;
    container.classList.add("marker-widget");
    this._parentContainer.tabIndex = 0;
    this._parentContainer.setAttribute("role", "tooltip");
    this._container = document.createElement("div");
    container.appendChild(this._container);
    this._message = new MessageWidget(this._container, this.editor, (related) => this._onDidSelectRelatedInformation.fire(related), this._openerService, this._labelService);
    this._disposables.add(this._message);
  }
  show() {
    throw new Error("call showAtMarker");
  }
  showAtMarker(marker, markerIdx, markerCount) {
    this._container.classList.remove("stale");
    this._message.update(marker);
    this._severity = marker.severity;
    this._applyTheme(this._themeService.getColorTheme());
    const range = Range.lift(marker);
    const editorPosition = this.editor.getPosition();
    const position = editorPosition && range.containsPosition(editorPosition) ? editorPosition : range.getStartPosition();
    super.show(position, this.computeRequiredHeight());
    const model = this.editor.getModel();
    if (model) {
      const detail = markerCount > 1 ? nls.localize("problems", "{0} of {1} problems", markerIdx, markerCount) : nls.localize("change", "{0} of {1} problem", markerIdx, markerCount);
      this.setTitle(basename(model.uri), detail);
    }
    this._icon.className = `codicon ${SeverityIcon.className(MarkerSeverity.toSeverity(this._severity))}`;
    this.editor.revealPositionInCenterIfOutsideViewport(position, ScrollType.Smooth);
    this.editor.focus();
  }
  updateMarker(marker) {
    this._container.classList.remove("stale");
    this._message.update(marker);
  }
  showStale() {
    this._container.classList.add("stale");
    this._relayout();
  }
  _doLayoutBody(heightInPixel, widthInPixel) {
    super._doLayoutBody(heightInPixel, widthInPixel);
    this._heightInPixel = heightInPixel;
    this._message.layout(heightInPixel, widthInPixel);
    this._container.style.height = `${heightInPixel}px`;
  }
  _onWidth(widthInPixel) {
    this._message.layout(this._heightInPixel, widthInPixel);
  }
  _relayout() {
    super._relayout(this.computeRequiredHeight());
  }
  computeRequiredHeight() {
    return 3 + this._message.getHeightInLines();
  }
};
MarkerNavigationWidget.TitleMenu = new MenuId("gotoErrorTitleMenu");
MarkerNavigationWidget = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, IOpenerService),
  __decorateParam(3, IMenuService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, ILabelService)
], MarkerNavigationWidget);
const errorDefault = oneOf(editorErrorForeground, editorErrorBorder);
const warningDefault = oneOf(editorWarningForeground, editorWarningBorder);
const infoDefault = oneOf(editorInfoForeground, editorInfoBorder);
const editorMarkerNavigationError = registerColor("editorMarkerNavigationError.background", { dark: errorDefault, light: errorDefault, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize("editorMarkerNavigationError", "Editor marker navigation widget error color."));
const editorMarkerNavigationErrorHeader = registerColor("editorMarkerNavigationError.headerBackground", { dark: transparent(editorMarkerNavigationError, 0.1), light: transparent(editorMarkerNavigationError, 0.1), hcDark: null, hcLight: null }, nls.localize("editorMarkerNavigationErrorHeaderBackground", "Editor marker navigation widget error heading background."));
const editorMarkerNavigationWarning = registerColor("editorMarkerNavigationWarning.background", { dark: warningDefault, light: warningDefault, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize("editorMarkerNavigationWarning", "Editor marker navigation widget warning color."));
const editorMarkerNavigationWarningHeader = registerColor("editorMarkerNavigationWarning.headerBackground", { dark: transparent(editorMarkerNavigationWarning, 0.1), light: transparent(editorMarkerNavigationWarning, 0.1), hcDark: "#0C141F", hcLight: transparent(editorMarkerNavigationWarning, 0.2) }, nls.localize("editorMarkerNavigationWarningBackground", "Editor marker navigation widget warning heading background."));
const editorMarkerNavigationInfo = registerColor("editorMarkerNavigationInfo.background", { dark: infoDefault, light: infoDefault, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize("editorMarkerNavigationInfo", "Editor marker navigation widget info color."));
const editorMarkerNavigationInfoHeader = registerColor("editorMarkerNavigationInfo.headerBackground", { dark: transparent(editorMarkerNavigationInfo, 0.1), light: transparent(editorMarkerNavigationInfo, 0.1), hcDark: null, hcLight: null }, nls.localize("editorMarkerNavigationInfoHeaderBackground", "Editor marker navigation widget info heading background."));
const editorMarkerNavigationBackground = registerColor("editorMarkerNavigation.background", editorBackground, nls.localize("editorMarkerNavigationBackground", "Editor marker navigation widget background."));
export {
  MarkerNavigationWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2dvdG9FcnJvci9icm93c2VyL2dvdG9FcnJvcldpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGFyaWEgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgaXNOb25FbXB0eUFycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgc3BsaXRMaW5lcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0ICcuL21lZGlhL2dvdG9FcnJvcldpZGdldC5jc3MnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgcGVla1ZpZXdUaXRsZUZvcmVncm91bmQsIHBlZWtWaWV3VGl0bGVJbmZvRm9yZWdyb3VuZCwgUGVla1ZpZXdXaWRnZXQgfSBmcm9tICcuLi8uLi9wZWVrVmlldy9icm93c2VyL3BlZWtWaWV3LmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZ2V0RmxhdEFjdGlvbkJhckFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElNYXJrZXIsIElSZWxhdGVkSW5mb3JtYXRpb24sIE1hcmtlclNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFNldmVyaXR5SWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZXZlcml0eUljb24vc2V2ZXJpdHlJY29uLmpzJztcbmltcG9ydCB7IGNvbnRyYXN0Qm9yZGVyLCBlZGl0b3JCYWNrZ3JvdW5kLCBlZGl0b3JFcnJvckJvcmRlciwgZWRpdG9yRXJyb3JGb3JlZ3JvdW5kLCBlZGl0b3JJbmZvQm9yZGVyLCBlZGl0b3JJbmZvRm9yZWdyb3VuZCwgZWRpdG9yV2FybmluZ0JvcmRlciwgZWRpdG9yV2FybmluZ0ZvcmVncm91bmQsIG9uZU9mLCByZWdpc3RlckNvbG9yLCB0cmFuc3BhcmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lLCBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5cbmNsYXNzIE1lc3NhZ2VXaWRnZXQge1xuXG5cdHByaXZhdGUgX2xpbmVzOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9sb25nZXN0TGluZUxlbmd0aDogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlQmxvY2s6IEhUTUxEaXZFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWxhdGVkQmxvY2s6IEhUTUxEaXZFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY3JvbGxhYmxlOiBTY3JvbGxhYmxlRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVsYXRlZERpYWdub3N0aWNzID0gbmV3IFdlYWtNYXA8SFRNTEVsZW1lbnQsIElSZWxhdGVkSW5mb3JtYXRpb24+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSBfY29kZUxpbms/OiBIVE1MRWxlbWVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0b25SZWxhdGVkSW5mb3JtYXRpb246IChyZWxhdGVkOiBJUmVsYXRlZEluZm9ybWF0aW9uKSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9lZGl0b3IgPSBlZGl0b3I7XG5cblx0XHRjb25zdCBkb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZG9tTm9kZS5jbGFzc05hbWUgPSAnZGVzY3JpcHRpb25jb250YWluZXInO1xuXG5cdFx0dGhpcy5fbWVzc2FnZUJsb2NrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fbWVzc2FnZUJsb2NrLmNsYXNzTGlzdC5hZGQoJ21lc3NhZ2UnKTtcblx0XHR0aGlzLl9tZXNzYWdlQmxvY2suc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCAnYXNzZXJ0aXZlJyk7XG5cdFx0dGhpcy5fbWVzc2FnZUJsb2NrLnNldEF0dHJpYnV0ZSgncm9sZScsICdhbGVydCcpO1xuXHRcdGRvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fbWVzc2FnZUJsb2NrKTtcblxuXHRcdHRoaXMuX3JlbGF0ZWRCbG9jayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGRvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fcmVsYXRlZEJsb2NrKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3JlbGF0ZWRCbG9jaywgJ2NsaWNrJywgZXZlbnQgPT4ge1xuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGNvbnN0IHJlbGF0ZWQgPSB0aGlzLl9yZWxhdGVkRGlhZ25vc3RpY3MuZ2V0KGV2ZW50LnRhcmdldCk7XG5cdFx0XHRpZiAocmVsYXRlZCkge1xuXHRcdFx0XHRvblJlbGF0ZWRJbmZvcm1hdGlvbihyZWxhdGVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zY3JvbGxhYmxlID0gbmV3IFNjcm9sbGFibGVFbGVtZW50KGRvbU5vZGUsIHtcblx0XHRcdGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0byxcblx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHR1c2VTaGFkb3dzOiBmYWxzZSxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJTaXplOiA2LFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJTaXplOiA2XG5cdFx0fSk7XG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKHRoaXMuX3Njcm9sbGFibGUuZ2V0RG9tTm9kZSgpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fc2Nyb2xsYWJsZS5vblNjcm9sbChlID0+IHtcblx0XHRcdGRvbU5vZGUuc3R5bGUubGVmdCA9IGAtJHtlLnNjcm9sbExlZnR9cHhgO1xuXHRcdFx0ZG9tTm9kZS5zdHlsZS50b3AgPSBgLSR7ZS5zY3JvbGxUb3B9cHhgO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fc2Nyb2xsYWJsZSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGhpcy5fZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0dXBkYXRlKG1hcmtlcjogSU1hcmtlcik6IHZvaWQge1xuXHRcdGNvbnN0IHsgc291cmNlLCBtZXNzYWdlLCByZWxhdGVkSW5mb3JtYXRpb24sIGNvZGUgfSA9IG1hcmtlcjtcblx0XHRsZXQgc291cmNlQW5kQ29kZUxlbmd0aCA9IChzb3VyY2U/Lmxlbmd0aCB8fCAwKSArICcoKScubGVuZ3RoO1xuXHRcdGlmIChjb2RlKSB7XG5cdFx0XHRpZiAodHlwZW9mIGNvZGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHNvdXJjZUFuZENvZGVMZW5ndGggKz0gY29kZS5sZW5ndGg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzb3VyY2VBbmRDb2RlTGVuZ3RoICs9IGNvZGUudmFsdWUubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVzID0gc3BsaXRMaW5lcyhtZXNzYWdlKTtcblx0XHR0aGlzLl9saW5lcyA9IGxpbmVzLmxlbmd0aDtcblx0XHR0aGlzLl9sb25nZXN0TGluZUxlbmd0aCA9IDA7XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHR0aGlzLl9sb25nZXN0TGluZUxlbmd0aCA9IE1hdGgubWF4KGxpbmUubGVuZ3RoICsgc291cmNlQW5kQ29kZUxlbmd0aCwgdGhpcy5fbG9uZ2VzdExpbmVMZW5ndGgpO1xuXHRcdH1cblxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fbWVzc2FnZUJsb2NrKTtcblx0XHR0aGlzLl9tZXNzYWdlQmxvY2suc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhpcy5nZXRBcmlhTGFiZWwobWFya2VyKSk7XG5cdFx0YXJpYS5zdGF0dXModGhpcy5nZXRBcmlhTGFiZWwobWFya2VyKSk7XG5cdFx0dGhpcy5fZWRpdG9yLmFwcGx5Rm9udEluZm8odGhpcy5fbWVzc2FnZUJsb2NrKTtcblx0XHRsZXQgbGFzdExpbmVFbGVtZW50ID0gdGhpcy5fbWVzc2FnZUJsb2NrO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdFx0bGFzdExpbmVFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRsYXN0TGluZUVsZW1lbnQuaW5uZXJUZXh0ID0gbGluZTtcblx0XHRcdGlmIChsaW5lID09PSAnJykge1xuXHRcdFx0XHRsYXN0TGluZUVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gdGhpcy5fbWVzc2FnZUJsb2NrLnN0eWxlLmxpbmVIZWlnaHQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9tZXNzYWdlQmxvY2suYXBwZW5kQ2hpbGQobGFzdExpbmVFbGVtZW50KTtcblx0XHR9XG5cdFx0aWYgKHNvdXJjZSB8fCBjb2RlKSB7XG5cdFx0XHRjb25zdCBkZXRhaWxzRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRcdGRldGFpbHNFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2RldGFpbHMnKTtcblx0XHRcdGxhc3RMaW5lRWxlbWVudC5hcHBlbmRDaGlsZChkZXRhaWxzRWxlbWVudCk7XG5cdFx0XHRpZiAoc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZUVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0XHRcdHNvdXJjZUVsZW1lbnQuaW5uZXJUZXh0ID0gc291cmNlO1xuXHRcdFx0XHRzb3VyY2VFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3NvdXJjZScpO1xuXHRcdFx0XHRkZXRhaWxzRWxlbWVudC5hcHBlbmRDaGlsZChzb3VyY2VFbGVtZW50KTtcblx0XHRcdH1cblx0XHRcdGlmIChjb2RlKSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgY29kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRjb25zdCBjb2RlRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRcdFx0XHRjb2RlRWxlbWVudC5pbm5lclRleHQgPSBgKCR7Y29kZX0pYDtcblx0XHRcdFx0XHRjb2RlRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjb2RlJyk7XG5cdFx0XHRcdFx0ZGV0YWlsc0VsZW1lbnQuYXBwZW5kQ2hpbGQoY29kZUVsZW1lbnQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2NvZGVMaW5rID0gZG9tLiQoJ2EuY29kZS1saW5rJyk7XG5cdFx0XHRcdFx0dGhpcy5fY29kZUxpbmsuc2V0QXR0cmlidXRlKCdocmVmJywgYCR7Y29kZS50YXJnZXQudG9TdHJpbmcoKX1gKTtcblxuXHRcdFx0XHRcdHRoaXMuX2NvZGVMaW5rLm9uY2xpY2sgPSAoZSkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKGNvZGUudGFyZ2V0LCB7IGFsbG93Q29tbWFuZHM6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRjb25zdCBjb2RlRWxlbWVudCA9IGRvbS5hcHBlbmQodGhpcy5fY29kZUxpbmssIGRvbS4kKCdzcGFuJykpO1xuXHRcdFx0XHRcdGNvZGVFbGVtZW50LmlubmVyVGV4dCA9IGNvZGUudmFsdWU7XG5cdFx0XHRcdFx0ZGV0YWlsc0VsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5fY29kZUxpbmspO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLl9yZWxhdGVkQmxvY2spO1xuXHRcdHRoaXMuX2VkaXRvci5hcHBseUZvbnRJbmZvKHRoaXMuX3JlbGF0ZWRCbG9jayk7XG5cdFx0aWYgKGlzTm9uRW1wdHlBcnJheShyZWxhdGVkSW5mb3JtYXRpb24pKSB7XG5cdFx0XHRjb25zdCByZWxhdGVkSW5mb3JtYXRpb25Ob2RlID0gdGhpcy5fcmVsYXRlZEJsb2NrLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcblx0XHRcdHJlbGF0ZWRJbmZvcm1hdGlvbk5vZGUuc3R5bGUucGFkZGluZ1RvcCA9IGAke01hdGguZmxvb3IodGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCkgKiAwLjY2KX1weGA7XG5cdFx0XHR0aGlzLl9saW5lcyArPSAxO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHJlbGF0ZWQgb2YgcmVsYXRlZEluZm9ybWF0aW9uKSB7XG5cblx0XHRcdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0XHRcdFx0Y29uc3QgcmVsYXRlZFJlc291cmNlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuXHRcdFx0XHRyZWxhdGVkUmVzb3VyY2UuY2xhc3NMaXN0LmFkZCgnZmlsZW5hbWUnKTtcblx0XHRcdFx0cmVsYXRlZFJlc291cmNlLmlubmVyVGV4dCA9IGAke3RoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHJlbGF0ZWQucmVzb3VyY2UpfSgke3JlbGF0ZWQuc3RhcnRMaW5lTnVtYmVyfSwgJHtyZWxhdGVkLnN0YXJ0Q29sdW1ufSk6IGA7XG5cdFx0XHRcdHJlbGF0ZWRSZXNvdXJjZS50aXRsZSA9IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyZWxhdGVkLnJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5fcmVsYXRlZERpYWdub3N0aWNzLnNldChyZWxhdGVkUmVzb3VyY2UsIHJlbGF0ZWQpO1xuXG5cdFx0XHRcdGNvbnN0IHJlbGF0ZWRNZXNzYWdlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdFx0XHRyZWxhdGVkTWVzc2FnZS5pbm5lclRleHQgPSByZWxhdGVkLm1lc3NhZ2U7XG5cblx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHJlbGF0ZWRSZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChyZWxhdGVkTWVzc2FnZSk7XG5cblx0XHRcdFx0dGhpcy5fbGluZXMgKz0gMTtcblx0XHRcdFx0cmVsYXRlZEluZm9ybWF0aW9uTm9kZS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGZvbnRJbmZvID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdGNvbnN0IHNjcm9sbFdpZHRoID0gTWF0aC5jZWlsKGZvbnRJbmZvLnR5cGljYWxGdWxsd2lkdGhDaGFyYWN0ZXJXaWR0aCAqIHRoaXMuX2xvbmdlc3RMaW5lTGVuZ3RoICogMC43NSk7XG5cdFx0Y29uc3Qgc2Nyb2xsSGVpZ2h0ID0gZm9udEluZm8ubGluZUhlaWdodCAqIHRoaXMuX2xpbmVzO1xuXHRcdHRoaXMuX3Njcm9sbGFibGUuc2V0U2Nyb2xsRGltZW5zaW9ucyh7IHNjcm9sbFdpZHRoLCBzY3JvbGxIZWlnaHQgfSk7XG5cdH1cblxuXHRsYXlvdXQoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9zY3JvbGxhYmxlLmdldERvbU5vZGUoKS5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHRcdHRoaXMuX3Njcm9sbGFibGUuZ2V0RG9tTm9kZSgpLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRcdHRoaXMuX3Njcm9sbGFibGUuc2V0U2Nyb2xsRGltZW5zaW9ucyh7IHdpZHRoLCBoZWlnaHQgfSk7XG5cdH1cblxuXHRnZXRIZWlnaHRJbkxpbmVzKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1hdGgubWluKDE3LCB0aGlzLl9saW5lcyk7XG5cdH1cblxuXHRwcml2YXRlIGdldEFyaWFMYWJlbChtYXJrZXI6IElNYXJrZXIpOiBzdHJpbmcge1xuXHRcdGxldCBzZXZlcml0eUxhYmVsID0gJyc7XG5cdFx0c3dpdGNoIChtYXJrZXIuc2V2ZXJpdHkpIHtcblx0XHRcdGNhc2UgTWFya2VyU2V2ZXJpdHkuRXJyb3I6XG5cdFx0XHRcdHNldmVyaXR5TGFiZWwgPSBubHMubG9jYWxpemUoJ0Vycm9yJywgXCJFcnJvclwiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE1hcmtlclNldmVyaXR5Lldhcm5pbmc6XG5cdFx0XHRcdHNldmVyaXR5TGFiZWwgPSBubHMubG9jYWxpemUoJ1dhcm5pbmcnLCBcIldhcm5pbmdcIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBNYXJrZXJTZXZlcml0eS5JbmZvOlxuXHRcdFx0XHRzZXZlcml0eUxhYmVsID0gbmxzLmxvY2FsaXplKCdJbmZvJywgXCJJbmZvXCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgTWFya2VyU2V2ZXJpdHkuSGludDpcblx0XHRcdFx0c2V2ZXJpdHlMYWJlbCA9IG5scy5sb2NhbGl6ZSgnSGludCcsIFwiSGludFwiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0bGV0IGFyaWFMYWJlbCA9IG5scy5sb2NhbGl6ZSgnbWFya2VyIGFyaWEnLCBcInswfTogezF9IGF0IHsyfS4gXCIsIHNldmVyaXR5TGFiZWwsIG1hcmtlci5tZXNzYWdlLCBtYXJrZXIuc3RhcnRMaW5lTnVtYmVyICsgJzonICsgbWFya2VyLnN0YXJ0Q29sdW1uKTtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChtb2RlbCAmJiAobWFya2VyLnN0YXJ0TGluZU51bWJlciA8PSBtb2RlbC5nZXRMaW5lQ291bnQoKSkgJiYgKG1hcmtlci5zdGFydExpbmVOdW1iZXIgPj0gMSkpIHtcblx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobWFya2VyLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRhcmlhTGFiZWwgPSBgJHtsaW5lQ29udGVudH0sICR7YXJpYUxhYmVsfWA7XG5cdFx0fVxuXHRcdHJldHVybiBhcmlhTGFiZWw7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hcmtlck5hdmlnYXRpb25XaWRnZXQgZXh0ZW5kcyBQZWVrVmlld1dpZGdldCB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRpdGxlTWVudSA9IG5ldyBNZW51SWQoJ2dvdG9FcnJvclRpdGxlTWVudScpO1xuXG5cdHByaXZhdGUgX3BhcmVudENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9jb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfaWNvbiE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9tZXNzYWdlITogTWVzc2FnZVdpZGdldDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FsbE9uRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBfc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5O1xuXHRwcml2YXRlIF9iYWNrZ3JvdW5kQ29sb3I/OiBDb2xvcjtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZWxlY3RSZWxhdGVkSW5mb3JtYXRpb24gPSBuZXcgRW1pdHRlcjxJUmVsYXRlZEluZm9ybWF0aW9uPigpO1xuXHRwcml2YXRlIF9oZWlnaHRJblBpeGVsITogbnVtYmVyO1xuXG5cdHJlYWRvbmx5IG9uRGlkU2VsZWN0UmVsYXRlZEluZm9ybWF0aW9uOiBFdmVudDxJUmVsYXRlZEluZm9ybWF0aW9uPiA9IHRoaXMuX29uRGlkU2VsZWN0UmVsYXRlZEluZm9ybWF0aW9uLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yLCB7IHNob3dBcnJvdzogdHJ1ZSwgc2hvd0ZyYW1lOiB0cnVlLCBpc0FjY2Vzc2libGU6IHRydWUsIGZyYW1lV2lkdGg6IDEgfSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuX3NldmVyaXR5ID0gTWFya2VyU2V2ZXJpdHkuV2FybmluZztcblx0XHR0aGlzLl9iYWNrZ3JvdW5kQ29sb3IgPSBDb2xvci53aGl0ZTtcblxuXHRcdHRoaXMuX2FwcGx5VGhlbWUoX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkpO1xuXHRcdHRoaXMuX2NhbGxPbkRpc3Bvc2UuYWRkKF90aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKHRoaXMuX2FwcGx5VGhlbWUuYmluZCh0aGlzKSkpO1xuXG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5VGhlbWUodGhlbWU6IElDb2xvclRoZW1lKSB7XG5cdFx0dGhpcy5fYmFja2dyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yTWFya2VyTmF2aWdhdGlvbkJhY2tncm91bmQpO1xuXHRcdGxldCBjb2xvcklkID0gZWRpdG9yTWFya2VyTmF2aWdhdGlvbkVycm9yO1xuXHRcdGxldCBoZWFkZXJCYWNrZ3JvdW5kID0gZWRpdG9yTWFya2VyTmF2aWdhdGlvbkVycm9ySGVhZGVyO1xuXG5cdFx0aWYgKHRoaXMuX3NldmVyaXR5ID09PSBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKSB7XG5cdFx0XHRjb2xvcklkID0gZWRpdG9yTWFya2VyTmF2aWdhdGlvbldhcm5pbmc7XG5cdFx0XHRoZWFkZXJCYWNrZ3JvdW5kID0gZWRpdG9yTWFya2VyTmF2aWdhdGlvbldhcm5pbmdIZWFkZXI7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9zZXZlcml0eSA9PT0gTWFya2VyU2V2ZXJpdHkuSW5mbykge1xuXHRcdFx0Y29sb3JJZCA9IGVkaXRvck1hcmtlck5hdmlnYXRpb25JbmZvO1xuXHRcdFx0aGVhZGVyQmFja2dyb3VuZCA9IGVkaXRvck1hcmtlck5hdmlnYXRpb25JbmZvSGVhZGVyO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZyYW1lQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihjb2xvcklkKTtcblx0XHRjb25zdCBoZWFkZXJCZyA9IHRoZW1lLmdldENvbG9yKGhlYWRlckJhY2tncm91bmQpO1xuXG5cdFx0dGhpcy5zdHlsZSh7XG5cdFx0XHRhcnJvd0NvbG9yOiBmcmFtZUNvbG9yLFxuXHRcdFx0ZnJhbWVDb2xvcjogZnJhbWVDb2xvcixcblx0XHRcdGhlYWRlckJhY2tncm91bmRDb2xvcjogaGVhZGVyQmcsXG5cdFx0XHRwcmltYXJ5SGVhZGluZ0NvbG9yOiB0aGVtZS5nZXRDb2xvcihwZWVrVmlld1RpdGxlRm9yZWdyb3VuZCksXG5cdFx0XHRzZWNvbmRhcnlIZWFkaW5nQ29sb3I6IHRoZW1lLmdldENvbG9yKHBlZWtWaWV3VGl0bGVJbmZvRm9yZWdyb3VuZClcblx0XHR9KTsgLy8gc3R5bGUoKSB3aWxsIHRyaWdnZXIgX2FwcGx5U3R5bGVzXG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2FwcGx5U3R5bGVzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wYXJlbnRDb250YWluZXIpIHtcblx0XHRcdHRoaXMuX3BhcmVudENvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLl9iYWNrZ3JvdW5kQ29sb3IgPyB0aGlzLl9iYWNrZ3JvdW5kQ29sb3IudG9TdHJpbmcoKSA6ICcnO1xuXHRcdH1cblx0XHRzdXBlci5fYXBwbHlTdHlsZXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FsbE9uRGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRTZWxlY3RSZWxhdGVkSW5mb3JtYXRpb24uZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BhcmVudENvbnRhaW5lci5mb2N1cygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9maWxsSGVhZChjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIuX2ZpbGxIZWFkKGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fYWN0aW9uYmFyV2lkZ2V0IS5hY3Rpb25SdW5uZXIub25XaWxsUnVuKGUgPT4gdGhpcy5lZGl0b3IuZm9jdXMoKSkpO1xuXG5cdFx0Y29uc3QgbWVudSA9IHRoaXMuX21lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1hcmtlck5hdmlnYXRpb25XaWRnZXQuVGl0bGVNZW51LCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zKG1lbnUpO1xuXHRcdHRoaXMuX2FjdGlvbmJhcldpZGdldCEucHVzaChhY3Rpb25zLCB7IGxhYmVsOiBmYWxzZSwgaWNvbjogdHJ1ZSwgaW5kZXg6IDAgfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2ZpbGxUaXRsZUljb24oY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2ljb24gPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJycpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZmlsbEJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3BhcmVudENvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbWFya2VyLXdpZGdldCcpO1xuXHRcdHRoaXMuX3BhcmVudENvbnRhaW5lci50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5fcGFyZW50Q29udGFpbmVyLnNldEF0dHJpYnV0ZSgncm9sZScsICd0b29sdGlwJyk7XG5cblx0XHR0aGlzLl9jb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fY29udGFpbmVyKTtcblxuXHRcdHRoaXMuX21lc3NhZ2UgPSBuZXcgTWVzc2FnZVdpZGdldCh0aGlzLl9jb250YWluZXIsIHRoaXMuZWRpdG9yLCByZWxhdGVkID0+IHRoaXMuX29uRGlkU2VsZWN0UmVsYXRlZEluZm9ybWF0aW9uLmZpcmUocmVsYXRlZCksIHRoaXMuX29wZW5lclNlcnZpY2UsIHRoaXMuX2xhYmVsU2VydmljZSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX21lc3NhZ2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2hvdygpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ2NhbGwgc2hvd0F0TWFya2VyJyk7XG5cdH1cblxuXHRzaG93QXRNYXJrZXIobWFya2VyOiBJTWFya2VyLCBtYXJrZXJJZHg6IG51bWJlciwgbWFya2VyQ291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIHVwZGF0ZTpcblx0XHQvLyAqIHRpdGxlXG5cdFx0Ly8gKiBtZXNzYWdlXG5cdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3N0YWxlJyk7XG5cdFx0dGhpcy5fbWVzc2FnZS51cGRhdGUobWFya2VyKTtcblxuXHRcdC8vIHVwZGF0ZSBmcmFtZSBjb2xvciAob25seSBhcHBsaWVkIG9uICdzaG93Jylcblx0XHR0aGlzLl9zZXZlcml0eSA9IG1hcmtlci5zZXZlcml0eTtcblx0XHR0aGlzLl9hcHBseVRoZW1lKHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkpO1xuXG5cdFx0Ly8gc2hvd1xuXHRcdGNvbnN0IHJhbmdlID0gUmFuZ2UubGlmdChtYXJrZXIpO1xuXHRcdGNvbnN0IGVkaXRvclBvc2l0aW9uID0gdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRjb25zdCBwb3NpdGlvbiA9IGVkaXRvclBvc2l0aW9uICYmIHJhbmdlLmNvbnRhaW5zUG9zaXRpb24oZWRpdG9yUG9zaXRpb24pID8gZWRpdG9yUG9zaXRpb24gOiByYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0c3VwZXIuc2hvdyhwb3NpdGlvbiwgdGhpcy5jb21wdXRlUmVxdWlyZWRIZWlnaHQoKSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRjb25zdCBkZXRhaWwgPSBtYXJrZXJDb3VudCA+IDFcblx0XHRcdFx0PyBubHMubG9jYWxpemUoJ3Byb2JsZW1zJywgXCJ7MH0gb2YgezF9IHByb2JsZW1zXCIsIG1hcmtlcklkeCwgbWFya2VyQ291bnQpXG5cdFx0XHRcdDogbmxzLmxvY2FsaXplKCdjaGFuZ2UnLCBcInswfSBvZiB7MX0gcHJvYmxlbVwiLCBtYXJrZXJJZHgsIG1hcmtlckNvdW50KTtcblx0XHRcdHRoaXMuc2V0VGl0bGUoYmFzZW5hbWUobW9kZWwudXJpKSwgZGV0YWlsKTtcblx0XHR9XG5cdFx0dGhpcy5faWNvbi5jbGFzc05hbWUgPSBgY29kaWNvbiAke1NldmVyaXR5SWNvbi5jbGFzc05hbWUoTWFya2VyU2V2ZXJpdHkudG9TZXZlcml0eSh0aGlzLl9zZXZlcml0eSkpfWA7XG5cblx0XHR0aGlzLmVkaXRvci5yZXZlYWxQb3NpdGlvbkluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQocG9zaXRpb24sIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHR9XG5cblx0dXBkYXRlTWFya2VyKG1hcmtlcjogSU1hcmtlcik6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdzdGFsZScpO1xuXHRcdHRoaXMuX21lc3NhZ2UudXBkYXRlKG1hcmtlcik7XG5cdH1cblxuXHRzaG93U3RhbGUoKSB7XG5cdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3N0YWxlJyk7XG5cdFx0dGhpcy5fcmVsYXlvdXQoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZG9MYXlvdXRCb2R5KGhlaWdodEluUGl4ZWw6IG51bWJlciwgd2lkdGhJblBpeGVsOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5fZG9MYXlvdXRCb2R5KGhlaWdodEluUGl4ZWwsIHdpZHRoSW5QaXhlbCk7XG5cdFx0dGhpcy5faGVpZ2h0SW5QaXhlbCA9IGhlaWdodEluUGl4ZWw7XG5cdFx0dGhpcy5fbWVzc2FnZS5sYXlvdXQoaGVpZ2h0SW5QaXhlbCwgd2lkdGhJblBpeGVsKTtcblx0XHR0aGlzLl9jb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0SW5QaXhlbH1weGA7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX29uV2lkdGgod2lkdGhJblBpeGVsOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9tZXNzYWdlLmxheW91dCh0aGlzLl9oZWlnaHRJblBpeGVsLCB3aWR0aEluUGl4ZWwpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9yZWxheW91dCgpOiB2b2lkIHtcblx0XHRzdXBlci5fcmVsYXlvdXQodGhpcy5jb21wdXRlUmVxdWlyZWRIZWlnaHQoKSk7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVSZXF1aXJlZEhlaWdodCgpIHtcblx0XHRyZXR1cm4gMyArIHRoaXMuX21lc3NhZ2UuZ2V0SGVpZ2h0SW5MaW5lcygpO1xuXHR9XG59XG5cbi8vIHRoZW1pbmdcblxuY29uc3QgZXJyb3JEZWZhdWx0ID0gb25lT2YoZWRpdG9yRXJyb3JGb3JlZ3JvdW5kLCBlZGl0b3JFcnJvckJvcmRlcik7XG5jb25zdCB3YXJuaW5nRGVmYXVsdCA9IG9uZU9mKGVkaXRvcldhcm5pbmdGb3JlZ3JvdW5kLCBlZGl0b3JXYXJuaW5nQm9yZGVyKTtcbmNvbnN0IGluZm9EZWZhdWx0ID0gb25lT2YoZWRpdG9ySW5mb0ZvcmVncm91bmQsIGVkaXRvckluZm9Cb3JkZXIpO1xuXG5jb25zdCBlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uRXJyb3IgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uRXJyb3IuYmFja2dyb3VuZCcsIHsgZGFyazogZXJyb3JEZWZhdWx0LCBsaWdodDogZXJyb3JEZWZhdWx0LCBoY0Rhcms6IGNvbnRyYXN0Qm9yZGVyLCBoY0xpZ2h0OiBjb250cmFzdEJvcmRlciB9LCBubHMubG9jYWxpemUoJ2VkaXRvck1hcmtlck5hdmlnYXRpb25FcnJvcicsICdFZGl0b3IgbWFya2VyIG5hdmlnYXRpb24gd2lkZ2V0IGVycm9yIGNvbG9yLicpKTtcbmNvbnN0IGVkaXRvck1hcmtlck5hdmlnYXRpb25FcnJvckhlYWRlciA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvck1hcmtlck5hdmlnYXRpb25FcnJvci5oZWFkZXJCYWNrZ3JvdW5kJywgeyBkYXJrOiB0cmFuc3BhcmVudChlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uRXJyb3IsIC4xKSwgbGlnaHQ6IHRyYW5zcGFyZW50KGVkaXRvck1hcmtlck5hdmlnYXRpb25FcnJvciwgLjEpLCBoY0Rhcms6IG51bGwsIGhjTGlnaHQ6IG51bGwgfSwgbmxzLmxvY2FsaXplKCdlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uRXJyb3JIZWFkZXJCYWNrZ3JvdW5kJywgJ0VkaXRvciBtYXJrZXIgbmF2aWdhdGlvbiB3aWRnZXQgZXJyb3IgaGVhZGluZyBiYWNrZ3JvdW5kLicpKTtcblxuY29uc3QgZWRpdG9yTWFya2VyTmF2aWdhdGlvbldhcm5pbmcgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uV2FybmluZy5iYWNrZ3JvdW5kJywgeyBkYXJrOiB3YXJuaW5nRGVmYXVsdCwgbGlnaHQ6IHdhcm5pbmdEZWZhdWx0LCBoY0Rhcms6IGNvbnRyYXN0Qm9yZGVyLCBoY0xpZ2h0OiBjb250cmFzdEJvcmRlciB9LCBubHMubG9jYWxpemUoJ2VkaXRvck1hcmtlck5hdmlnYXRpb25XYXJuaW5nJywgJ0VkaXRvciBtYXJrZXIgbmF2aWdhdGlvbiB3aWRnZXQgd2FybmluZyBjb2xvci4nKSk7XG5jb25zdCBlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uV2FybmluZ0hlYWRlciA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvck1hcmtlck5hdmlnYXRpb25XYXJuaW5nLmhlYWRlckJhY2tncm91bmQnLCB7IGRhcms6IHRyYW5zcGFyZW50KGVkaXRvck1hcmtlck5hdmlnYXRpb25XYXJuaW5nLCAuMSksIGxpZ2h0OiB0cmFuc3BhcmVudChlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uV2FybmluZywgLjEpLCBoY0Rhcms6ICcjMEMxNDFGJywgaGNMaWdodDogdHJhbnNwYXJlbnQoZWRpdG9yTWFya2VyTmF2aWdhdGlvbldhcm5pbmcsIC4yKSB9LCBubHMubG9jYWxpemUoJ2VkaXRvck1hcmtlck5hdmlnYXRpb25XYXJuaW5nQmFja2dyb3VuZCcsICdFZGl0b3IgbWFya2VyIG5hdmlnYXRpb24gd2lkZ2V0IHdhcm5pbmcgaGVhZGluZyBiYWNrZ3JvdW5kLicpKTtcblxuY29uc3QgZWRpdG9yTWFya2VyTmF2aWdhdGlvbkluZm8gPSByZWdpc3RlckNvbG9yKCdlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uSW5mby5iYWNrZ3JvdW5kJywgeyBkYXJrOiBpbmZvRGVmYXVsdCwgbGlnaHQ6IGluZm9EZWZhdWx0LCBoY0Rhcms6IGNvbnRyYXN0Qm9yZGVyLCBoY0xpZ2h0OiBjb250cmFzdEJvcmRlciB9LCBubHMubG9jYWxpemUoJ2VkaXRvck1hcmtlck5hdmlnYXRpb25JbmZvJywgJ0VkaXRvciBtYXJrZXIgbmF2aWdhdGlvbiB3aWRnZXQgaW5mbyBjb2xvci4nKSk7XG5jb25zdCBlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uSW5mb0hlYWRlciA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvck1hcmtlck5hdmlnYXRpb25JbmZvLmhlYWRlckJhY2tncm91bmQnLCB7IGRhcms6IHRyYW5zcGFyZW50KGVkaXRvck1hcmtlck5hdmlnYXRpb25JbmZvLCAuMSksIGxpZ2h0OiB0cmFuc3BhcmVudChlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uSW5mbywgLjEpLCBoY0Rhcms6IG51bGwsIGhjTGlnaHQ6IG51bGwgfSwgbmxzLmxvY2FsaXplKCdlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uSW5mb0hlYWRlckJhY2tncm91bmQnLCAnRWRpdG9yIG1hcmtlciBuYXZpZ2F0aW9uIHdpZGdldCBpbmZvIGhlYWRpbmcgYmFja2dyb3VuZC4nKSk7XG5cbmNvbnN0IGVkaXRvck1hcmtlck5hdmlnYXRpb25CYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yTWFya2VyTmF2aWdhdGlvbi5iYWNrZ3JvdW5kJywgZWRpdG9yQmFja2dyb3VuZCwgbmxzLmxvY2FsaXplKCdlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uQmFja2dyb3VuZCcsICdFZGl0b3IgbWFya2VyIG5hdmlnYXRpb24gd2lkZ2V0IGJhY2tncm91bmQuJykpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxVQUFVO0FBQ3RCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsT0FBTztBQUVQLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHlCQUF5Qiw2QkFBNkIsc0JBQXNCO0FBQ3JGLFlBQVksU0FBUztBQUNyQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGNBQWMsY0FBYztBQUNyQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUF1QyxzQkFBc0I7QUFDN0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0Isa0JBQWtCLG1CQUFtQix1QkFBdUIsa0JBQWtCLHNCQUFzQixxQkFBcUIseUJBQXlCLE9BQU8sZUFBZSxtQkFBbUI7QUFDcE4sU0FBc0IscUJBQXFCO0FBRTNDLE1BQU0sY0FBYztBQUFBLEVBY25CLFlBQ0MsUUFDQSxRQUNBLHNCQUNpQixnQkFDQSxlQUNoQjtBQUZnQjtBQUNBO0FBakJsQixTQUFRLFNBQWlCO0FBQ3pCLFNBQVEscUJBQTZCO0FBTXJDLFNBQWlCLHNCQUFzQixvQkFBSSxRQUEwQztBQUNyRixTQUFpQixlQUFnQyxJQUFJLGdCQUFnQjtBQVdwRSxTQUFLLFVBQVU7QUFFZixVQUFNLFVBQVUsU0FBUyxjQUFjLEtBQUs7QUFDNUMs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
