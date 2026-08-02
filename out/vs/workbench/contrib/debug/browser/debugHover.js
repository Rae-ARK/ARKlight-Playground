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
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import * as lifecycle from "../../../../base/common/lifecycle.js";
import { clamp } from "../../../../base/common/numbers.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { ContentWidgetPositionPreference } from "../../../../editor/browser/editorBrowser.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ModelDecorationOptions } from "../../../../editor/common/model/textModel.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import * as nls from "../../../../nls.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { asCssVariable, editorHoverBackground, editorHoverBorder, editorHoverForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IDebugService } from "../common/debug.js";
import { Expression, Variable, VisualizedExpression } from "../common/debugModel.js";
import { getEvaluatableExpressionAtPosition } from "../common/debugUtils.js";
import { AbstractExpressionDataSource } from "./baseDebugView.js";
import { DebugExpressionRenderer } from "./debugExpressionRenderer.js";
import { VariablesRenderer, VisualizedVariableRenderer, openContextMenuForVariableTreeElement } from "./variablesView.js";
const $ = dom.$;
var ShowDebugHoverResult = /* @__PURE__ */ ((ShowDebugHoverResult2) => {
  ShowDebugHoverResult2[ShowDebugHoverResult2["NOT_CHANGED"] = 0] = "NOT_CHANGED";
  ShowDebugHoverResult2[ShowDebugHoverResult2["NOT_AVAILABLE"] = 1] = "NOT_AVAILABLE";
  ShowDebugHoverResult2[ShowDebugHoverResult2["CANCELLED"] = 2] = "CANCELLED";
  return ShowDebugHoverResult2;
})(ShowDebugHoverResult || {});
async function doFindExpression(container, namesToFind) {
  if (!container) {
    return null;
  }
  const children = await container.getChildren();
  const filtered = children.filter((v) => namesToFind[0] === v.name);
  if (filtered.length !== 1) {
    return null;
  }
  if (namesToFind.length === 1) {
    return filtered[0];
  } else {
    return doFindExpression(filtered[0], namesToFind.slice(1));
  }
}
async function findExpressionInStackFrame(stackFrame, namesToFind) {
  const scopes = await stackFrame.getScopes();
  const nonExpensive = scopes.filter((s) => !s.expensive);
  const expressions = coalesce(await Promise.all(nonExpensive.map((scope) => doFindExpression(scope, namesToFind))));
  return expressions.length > 0 && expressions.every((e) => e.value === expressions[0].value) ? expressions[0] : void 0;
}
let DebugHoverWidget = class {
  constructor(editor, debugService, instantiationService, menuService, contextKeyService, contextMenuService) {
    this.editor = editor;
    this.debugService = debugService;
    this.instantiationService = instantiationService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.contextMenuService = contextMenuService;
    // editor.IContentWidget.allowEditorOverflow
    this.allowEditorOverflow = true;
    this.isUpdatingTree = false;
    this.highlightDecorations = this.editor.createDecorationsCollection();
    this.toDispose = [];
    this.showAtPosition = null;
    this.positionPreference = [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW];
    this.debugHoverComputer = this.instantiationService.createInstance(DebugHoverComputer, this.editor);
    this.expressionRenderer = this.instantiationService.createInstance(DebugExpressionRenderer);
  }
  get isShowingComplexValue() {
    return this.complexValueContainer?.hidden === false;
  }
  create() {
    this.domNode = $(".debug-hover-widget");
    this.complexValueContainer = dom.append(this.domNode, $(".complex-value"));
    this.complexValueTitle = dom.append(this.complexValueContainer, $(".title"));
    this.treeContainer = dom.append(this.complexValueContainer, $(".debug-hover-tree"));
    this.treeContainer.setAttribute("role", "tree");
    const tip = dom.append(this.complexValueContainer, $(".tip"));
    tip.textContent = nls.localize({ key: "quickTip", comment: ['"switch to editor language hover" means to show the programming language hover widget instead of the debug hover'] }, "Hold {0} key to switch to editor language hover", isMacintosh ? "Option" : "Alt");
    const dataSource = this.instantiationService.createInstance(DebugHoverDataSource);
    this.tree = this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "DebugHover",
      this.treeContainer,
      new DebugHoverDelegate(),
      [
        this.instantiationService.createInstance(VariablesRenderer, this.expressionRenderer),
        this.instantiationService.createInstance(VisualizedVariableRenderer, this.expressionRenderer)
      ],
      dataSource,
      {
        accessibilityProvider: new DebugHoverAccessibilityProvider(),
        mouseSupport: false,
        horizontalScrolling: true,
        useShadows: false,
        keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e) => e.name },
        overrideStyles: {
          listBackground: editorHoverBackground
        }
      }
    );
    this.toDispose.push(VisualizedVariableRenderer.rendererOnVisualizationRange(this.debugService.getViewModel(), this.tree));
    this.toDispose.push(this.tree);
    this.valueContainer = $(".value");
    this.valueContainer.tabIndex = 0;
    this.valueContainer.setAttribute("role", "tooltip");
    this.scrollbar = new DomScrollableElement(this.valueContainer, { horizontal: ScrollbarVisibility.Hidden });
    this.domNode.appendChild(this.scrollbar.getDomNode());
    this.toDispose.push(this.scrollbar);
    this.editor.applyFontInfo(this.domNode);
    this.domNode.style.backgroundColor = asCssVariable(editorHoverBackground);
    this.domNode.style.border = `1px solid ${asCssVariable(editorHoverBorder)}`;
    this.domNode.style.color = asCssVariable(editorHoverForeground);
    this.toDispose.push(this.tree.onContextMenu(async (e) => await this.onContextMenu(e)));
    this.toDispose.push(this.tree.onDidChangeContentHeight(() => {
      if (!this.isUpdatingTree) {
        this.layoutTreeAndContainer();
      }
    }));
    this.toDispose.push(this.tree.onDidChangeContentWidth(() => {
      if (!this.isUpdatingTree) {
        this.layoutTreeAndContainer();
      }
    }));
    this.registerListeners();
    this.editor.addContentWidget(this);
  }
  async onContextMenu(e) {
    const variable = e.element;
    if (!(variable instanceof Variable) || !variable.value) {
      return;
    }
    return openContextMenuForVariableTreeElement(this.contextKeyService, this.menuService, this.contextMenuService, MenuId.DebugHoverContext, e);
  }
  registerListeners() {
    this.toDispose.push(dom.addStandardDisposableListener(this.domNode, "keydown", (e) => {
      if (e.equals(KeyCode.Escape)) {
        this.hide();
      }
    }));
    this.toDispose.push(this.editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.fontInfo)) {
        this.editor.applyFontInfo(this.domNode);
      }
    }));
    this.toDispose.push(this.debugService.getViewModel().onDidEvaluateLazyExpression(async (e) => {
      if (e instanceof Variable && this.tree.hasNode(e)) {
        await this.tree.updateChildren(e, false, true);
        await this.tree.expand(e);
      }
    }));
  }
  isHovered() {
    return !!this.domNode?.matches(":hover");
  }
  isVisible() {
    return !!this._isVisible;
  }
  willBeVisible() {
    return !!this.showCancellationSource;
  }
  getId() {
    return DebugHoverWidget.ID;
  }
  getDomNode() {
    return this.domNode;
  }
  /**
   * Gets whether the given coordinates are in the safe triangle formed from
   * the position at which the hover was initiated.
   */
  isInSafeTriangle(x, y) {
    return this._isVisible && !!this.safeTriangle?.contains(x, y);
  }
  async showAt(position, focus, mouseEvent) {
    this.showCancellationSource?.dispose(true);
    const cancellationSource = this.showCancellationSource = new CancellationTokenSource();
    const session = this.debugService.getViewModel().focusedSession;
    if (!session || !this.editor.hasModel()) {
      this.hide();
      return 1 /* NOT_AVAILABLE */;
    }
    const result = await this.debugHoverComputer.compute(position, cancellationSource.token);
    if (cancellationSource.token.isCancellationRequested) {
      this.hide();
      return 2 /* CANCELLED */;
    }
    if (!result.range) {
      this.hide();
      return 1 /* NOT_AVAILABLE */;
    }
    if (this.isVisible() && !result.rangeChanged) {
      return 0 /* NOT_CHANGED */;
    }
    const expression = await this.debugHoverComputer.evaluate(session);
    if (cancellationSource.token.isCancellationRequested) {
      this.hide();
      return 2 /* CANCELLED */;
    }
    if (!expression || expression instanceof Expression && !expression.available) {
      this.hide();
      return 1 /* NOT_AVAILABLE */;
    }
    this.highlightDecorations.set([{
      range: result.range,
      options: DebugHoverWidget._HOVER_HIGHLIGHT_DECORATION_OPTIONS
    }]);
    return this.doShow(session, result.range.getStartPosition(), expression, focus, mouseEvent);
  }
  async doShow(session, position, expression, focus, mouseEvent) {
    if (!this.domNode) {
      this.create();
    }
    this.showAtPosition = position;
    const store = new lifecycle.DisposableStore();
    this._isVisible = { store };
    if (!expression.hasChildren) {
      this.complexValueContainer.hidden = true;
      this.valueContainer.hidden = false;
      store.add(this.expressionRenderer.renderValue(this.valueContainer, expression, {
        showChanged: false,
        colorize: true,
        hover: false,
        session
      }));
      this.valueContainer.title = "";
      this.editor.layoutContentWidget(this);
      this.safeTriangle = mouseEvent && new dom.SafeTriangle(mouseEvent.posx, mouseEvent.posy, this.domNode);
      this.scrollbar.scanDomNode();
      if (focus) {
        this.editor.render();
        this.valueContainer.focus();
      }
      return void 0;
    }
    this.valueContainer.hidden = true;
    this.expressionToRender = expression;
    store.add(this.expressionRenderer.renderValue(this.complexValueTitle, expression, { hover: false, session }));
    this.editor.layoutContentWidget(this);
    this.safeTriangle = mouseEvent && new dom.SafeTriangle(mouseEvent.posx, mouseEvent.posy, this.domNode);
    this.tree.scrollTop = 0;
    this.tree.scrollLeft = 0;
    this.complexValueContainer.hidden = false;
    if (focus) {
      this.editor.render();
      this.tree.domFocus();
    }
  }
  layoutTreeAndContainer() {
    this.layoutTree();
    this.editor.layoutContentWidget(this);
  }
  layoutTree() {
    const scrollBarHeight = 10;
    let maxHeightToAvoidCursorOverlay = Infinity;
    if (this.showAtPosition) {
      const editorTop = this.editor.getDomNode()?.offsetTop || 0;
      const containerTop = this.treeContainer.offsetTop + editorTop;
      const hoveredCharTop = this.editor.getTopForLineNumber(this.showAtPosition.lineNumber, true) - this.editor.getScrollTop();
      if (containerTop < hoveredCharTop) {
        maxHeightToAvoidCursorOverlay = hoveredCharTop + editorTop - 22;
      }
    }
    const treeHeight = Math.min(Math.max(266, this.editor.getLayoutInfo().height * 0.55), this.tree.contentHeight + scrollBarHeight, maxHeightToAvoidCursorOverlay);
    const realTreeWidth = this.tree.contentWidth;
    const treeWidth = clamp(realTreeWidth, 400, 550);
    this.tree.layout(treeHeight, treeWidth);
    this.treeContainer.style.height = `${treeHeight}px`;
    this.scrollbar.scanDomNode();
  }
  beforeRender() {
    if (this.expressionToRender) {
      const expression = this.expressionToRender;
      this.expressionToRender = void 0;
      this.isUpdatingTree = true;
      this.tree.setInput(expression).finally(() => {
        this.isUpdatingTree = false;
      });
    }
    return null;
  }
  afterRender(positionPreference) {
    if (positionPreference) {
      this.positionPreference = [positionPreference];
    }
  }
  hide() {
    if (this.showCancellationSource) {
      this.showCancellationSource.dispose(true);
      this.showCancellationSource = void 0;
    }
    if (!this._isVisible) {
      return;
    }
    if (dom.isAncestorOfActiveElement(this.domNode)) {
      this.editor.focus();
    }
    this._isVisible.store.dispose();
    this._isVisible = void 0;
    this.highlightDecorations.clear();
    this.editor.layoutContentWidget(this);
    this.positionPreference = [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW];
  }
  getPosition() {
    return this._isVisible ? {
      position: this.showAtPosition,
      preference: this.positionPreference
    } : null;
  }
  dispose() {
    this.toDispose = lifecycle.dispose(this.toDispose);
  }
};
DebugHoverWidget.ID = "debug.hoverWidget";
DebugHoverWidget._HOVER_HIGHLIGHT_DECORATION_OPTIONS = ModelDecorationOptions.register({
  description: "bdebug-hover-highlight",
  className: "hoverHighlight"
});
DebugHoverWidget = __decorateClass([
  __decorateParam(1, IDebugService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMenuService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IContextMenuService)
], DebugHoverWidget);
class DebugHoverAccessibilityProvider {
  getWidgetAriaLabel() {
    return nls.localize("treeAriaLabel", "Debug Hover");
  }
  getAriaLabel(element) {
    return nls.localize({ key: "variableAriaLabel", comment: ["Do not translate placeholders. Placeholders are name and value of a variable."] }, "{0}, value {1}, variables, debug", element.name, element.value);
  }
}
class DebugHoverDataSource extends AbstractExpressionDataSource {
  hasChildren(element) {
    return element.hasChildren;
  }
  doGetChildren(element) {
    return element.getChildren();
  }
}
class DebugHoverDelegate {
  getHeight(element) {
    return 18;
  }
  getTemplateId(element) {
    if (element instanceof VisualizedExpression) {
      return VisualizedVariableRenderer.ID;
    }
    return VariablesRenderer.ID;
  }
}
let DebugHoverComputer = class {
  constructor(editor, debugService, languageFeaturesService, logService) {
    this.editor = editor;
    this.debugService = debugService;
    this.languageFeaturesService = languageFeaturesService;
    this.logService = logService;
  }
  async compute(position, token) {
    const session = this.debugService.getViewModel().focusedSession;
    if (!session || !this.editor.hasModel()) {
      return { rangeChanged: false };
    }
    const model = this.editor.getModel();
    const result = await getEvaluatableExpressionAtPosition(this.languageFeaturesService, model, position, token);
    if (!result) {
      return { rangeChanged: false };
    }
    const { range, matchingExpression } = result;
    const rangeChanged = !this._current?.range.equalsRange(range);
    this._current = { expression: matchingExpression, range: Range.lift(range) };
    return { rangeChanged, range: this._current.range };
  }
  async evaluate(session) {
    if (!this._current) {
      this.logService.error("No expression to evaluate");
      return;
    }
    const textModel = this.editor.getModel();
    const debugSource = textModel && session.getSourceForUri(textModel?.uri);
    if (session.capabilities.supportsEvaluateForHovers) {
      const expression = new Expression(this._current.expression);
      await expression.evaluate(session, this.debugService.getViewModel().focusedStackFrame, "hover", void 0, debugSource ? {
        line: this._current.range.startLineNumber,
        column: this._current.range.startColumn,
        source: debugSource.raw
      } : void 0);
      return expression;
    } else {
      const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
      if (focusedStackFrame) {
        return await findExpressionInStackFrame(
          focusedStackFrame,
          coalesce(this._current.expression.split(".").map((word) => word.trim()))
        );
      }
    }
    return void 0;
  }
};
DebugHoverComputer = __decorateClass([
  __decorateParam(1, IDebugService),
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, ILogService)
], DebugHoverComputer);
export {
  DebugHoverWidget,
  ShowDebugHoverResult,
  findExpressionInStackFrame
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdIb3Zlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgSU1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBBc3luY0RhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYXN5bmNEYXRhVHJlZS5qcyc7XG5pbXBvcnQgeyBJVHJlZUNvbnRleHRNZW51RXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0ICogYXMgbGlmZWN5Y2xlIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjbGFtcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLCBJQ29kZUVkaXRvciwgSUNvbnRlbnRXaWRnZXQsIElDb250ZW50V2lkZ2V0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQsIEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSURpbWVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS8yZC9kaW1lbnNpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCBlZGl0b3JIb3ZlckJhY2tncm91bmQsIGVkaXRvckhvdmVyQm9yZGVyLCBlZGl0b3JIb3ZlckZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRGVidWdTZXJ2aWNlLCBJRGVidWdTZXNzaW9uLCBJRXhwcmVzc2lvbiwgSUV4cHJlc3Npb25Db250YWluZXIsIElTdGFja0ZyYW1lIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IEV4cHJlc3Npb24sIFZhcmlhYmxlLCBWaXN1YWxpemVkRXhwcmVzc2lvbiB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z01vZGVsLmpzJztcbmltcG9ydCB7IGdldEV2YWx1YXRhYmxlRXhwcmVzc2lvbkF0UG9zaXRpb24gfSBmcm9tICcuLi9jb21tb24vZGVidWdVdGlscy5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEV4cHJlc3Npb25EYXRhU291cmNlIH0gZnJvbSAnLi9iYXNlRGVidWdWaWV3LmpzJztcbmltcG9ydCB7IERlYnVnRXhwcmVzc2lvblJlbmRlcmVyIH0gZnJvbSAnLi9kZWJ1Z0V4cHJlc3Npb25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBWYXJpYWJsZXNSZW5kZXJlciwgVmlzdWFsaXplZFZhcmlhYmxlUmVuZGVyZXIsIG9wZW5Db250ZXh0TWVudUZvclZhcmlhYmxlVHJlZUVsZW1lbnQgfSBmcm9tICcuL3ZhcmlhYmxlc1ZpZXcuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFNob3dEZWJ1Z0hvdmVyUmVzdWx0IHtcblx0Tk9UX0NIQU5HRUQsXG5cdE5PVF9BVkFJTEFCTEUsXG5cdENBTkNFTExFRCxcbn1cblxuYXN5bmMgZnVuY3Rpb24gZG9GaW5kRXhwcmVzc2lvbihjb250YWluZXI6IElFeHByZXNzaW9uQ29udGFpbmVyLCBuYW1lc1RvRmluZDogc3RyaW5nW10pOiBQcm9taXNlPElFeHByZXNzaW9uIHwgbnVsbD4ge1xuXHRpZiAoIWNvbnRhaW5lcikge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Y29uc3QgY2hpbGRyZW4gPSBhd2FpdCBjb250YWluZXIuZ2V0Q2hpbGRyZW4oKTtcblx0Ly8gbG9vayBmb3Igb3VyIHZhcmlhYmxlIGluIHRoZSBsaXN0LiBGaXJzdCBmaW5kIHRoZSBwYXJlbnRzIG9mIHRoZSBob3ZlcmVkIHZhcmlhYmxlIGlmIHRoZXJlIGFyZSBhbnkuXG5cdGNvbnN0IGZpbHRlcmVkID0gY2hpbGRyZW4uZmlsdGVyKHYgPT4gbmFtZXNUb0ZpbmRbMF0gPT09IHYubmFtZSk7XG5cdGlmIChmaWx0ZXJlZC5sZW5ndGggIT09IDEpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGlmIChuYW1lc1RvRmluZC5sZW5ndGggPT09IDEpIHtcblx0XHRyZXR1cm4gZmlsdGVyZWRbMF07XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIGRvRmluZEV4cHJlc3Npb24oZmlsdGVyZWRbMF0sIG5hbWVzVG9GaW5kLnNsaWNlKDEpKTtcblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmluZEV4cHJlc3Npb25JblN0YWNrRnJhbWUoc3RhY2tGcmFtZTogSVN0YWNrRnJhbWUsIG5hbWVzVG9GaW5kOiBzdHJpbmdbXSk6IFByb21pc2U8SUV4cHJlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0Y29uc3Qgc2NvcGVzID0gYXdhaXQgc3RhY2tGcmFtZS5nZXRTY29wZXMoKTtcblx0Y29uc3Qgbm9uRXhwZW5zaXZlID0gc2NvcGVzLmZpbHRlcihzID0+ICFzLmV4cGVuc2l2ZSk7XG5cdGNvbnN0IGV4cHJlc3Npb25zID0gY29hbGVzY2UoYXdhaXQgUHJvbWlzZS5hbGwobm9uRXhwZW5zaXZlLm1hcChzY29wZSA9PiBkb0ZpbmRFeHByZXNzaW9uKHNjb3BlLCBuYW1lc1RvRmluZCkpKSk7XG5cblx0Ly8gb25seSBzaG93IGlmIGFsbCBleHByZXNzaW9ucyBmb3VuZCBoYXZlIHRoZSBzYW1lIHZhbHVlXG5cdHJldHVybiBleHByZXNzaW9ucy5sZW5ndGggPiAwICYmIGV4cHJlc3Npb25zLmV2ZXJ5KGUgPT4gZS52YWx1ZSA9PT0gZXhwcmVzc2lvbnNbMF0udmFsdWUpID8gZXhwcmVzc2lvbnNbMF0gOiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z0hvdmVyV2lkZ2V0IGltcGxlbWVudHMgSUNvbnRlbnRXaWRnZXQge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdkZWJ1Zy5ob3ZlcldpZGdldCc7XG5cdC8vIGVkaXRvci5JQ29udGVudFdpZGdldC5hbGxvd0VkaXRvck92ZXJmbG93XG5cdHJlYWRvbmx5IGFsbG93RWRpdG9yT3ZlcmZsb3cgPSB0cnVlO1xuXG5cdC8vIHRvZG9AY29ubm9yNDMxMjogbW92ZSBtb3JlIHByb3BlcnRpZXMgdGhhdCBhcmUgb25seSB2YWxpZCB3aGlsZSBhIGhvdmVyXG5cdC8vIGlzIGhhcHBlbmluZyBpbnRvIGBfaXNWaXNpYmxlYFxuXHRwcml2YXRlIF9pc1Zpc2libGU/OiB7XG5cdFx0c3RvcmU6IGxpZmVjeWNsZS5EaXNwb3NhYmxlU3RvcmU7XG5cdH07XG5cdHByaXZhdGUgc2FmZVRyaWFuZ2xlPzogZG9tLlNhZmVUcmlhbmdsZTtcblx0cHJpdmF0ZSBzaG93Q2FuY2VsbGF0aW9uU291cmNlPzogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U7XG5cdHByaXZhdGUgZG9tTm9kZSE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRyZWUhOiBBc3luY0RhdGFUcmVlPElFeHByZXNzaW9uLCBJRXhwcmVzc2lvbiwgYW55Pjtcblx0cHJpdmF0ZSBzaG93QXRQb3NpdGlvbjogUG9zaXRpb24gfCBudWxsO1xuXHRwcml2YXRlIHBvc2l0aW9uUHJlZmVyZW5jZTogQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZVtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGhpZ2hsaWdodERlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXHRwcml2YXRlIGNvbXBsZXhWYWx1ZUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNvbXBsZXhWYWx1ZVRpdGxlITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdmFsdWVDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB0cmVlQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdG9EaXNwb3NlOiBsaWZlY3ljbGUuSURpc3Bvc2FibGVbXTtcblx0cHJpdmF0ZSBzY3JvbGxiYXIhOiBEb21TY3JvbGxhYmxlRWxlbWVudDtcblx0cHJpdmF0ZSBkZWJ1Z0hvdmVyQ29tcHV0ZXI6IERlYnVnSG92ZXJDb21wdXRlcjtcblx0cHJpdmF0ZSBleHByZXNzaW9uUmVuZGVyZXI6IERlYnVnRXhwcmVzc2lvblJlbmRlcmVyO1xuXG5cdHByaXZhdGUgZXhwcmVzc2lvblRvUmVuZGVyOiBJRXhwcmVzc2lvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBpc1VwZGF0aW5nVHJlZSA9IGZhbHNlO1xuXG5cdHB1YmxpYyBnZXQgaXNTaG93aW5nQ29tcGxleFZhbHVlKCkge1xuXHRcdHJldHVybiB0aGlzLmNvbXBsZXhWYWx1ZUNvbnRhaW5lcj8uaGlkZGVuID09PSBmYWxzZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5oaWdobGlnaHREZWNvcmF0aW9ucyA9IHRoaXMuZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMudG9EaXNwb3NlID0gW107XG5cblx0XHR0aGlzLnNob3dBdFBvc2l0aW9uID0gbnVsbDtcblx0XHR0aGlzLnBvc2l0aW9uUHJlZmVyZW5jZSA9IFtDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkFCT1ZFLCBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkJFTE9XXTtcblx0XHR0aGlzLmRlYnVnSG92ZXJDb21wdXRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVidWdIb3ZlckNvbXB1dGVyLCB0aGlzLmVkaXRvcik7XG5cdFx0dGhpcy5leHByZXNzaW9uUmVuZGVyZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlYnVnRXhwcmVzc2lvblJlbmRlcmVyKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZSA9ICQoJy5kZWJ1Zy1ob3Zlci13aWRnZXQnKTtcblx0XHR0aGlzLmNvbXBsZXhWYWx1ZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCAkKCcuY29tcGxleC12YWx1ZScpKTtcblx0XHR0aGlzLmNvbXBsZXhWYWx1ZVRpdGxlID0gZG9tLmFwcGVuZCh0aGlzLmNvbXBsZXhWYWx1ZUNvbnRhaW5lciwgJCgnLnRpdGxlJykpO1xuXHRcdHRoaXMudHJlZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5jb21wbGV4VmFsdWVDb250YWluZXIsICQoJy5kZWJ1Zy1ob3Zlci10cmVlJykpO1xuXHRcdHRoaXMudHJlZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAndHJlZScpO1xuXHRcdGNvbnN0IHRpcCA9IGRvbS5hcHBlbmQodGhpcy5jb21wbGV4VmFsdWVDb250YWluZXIsICQoJy50aXAnKSk7XG5cdFx0dGlwLnRleHRDb250ZW50ID0gbmxzLmxvY2FsaXplKHsga2V5OiAncXVpY2tUaXAnLCBjb21tZW50OiBbJ1wic3dpdGNoIHRvIGVkaXRvciBsYW5ndWFnZSBob3ZlclwiIG1lYW5zIHRvIHNob3cgdGhlIHByb2dyYW1taW5nIGxhbmd1YWdlIGhvdmVyIHdpZGdldCBpbnN0ZWFkIG9mIHRoZSBkZWJ1ZyBob3ZlciddIH0sICdIb2xkIHswfSBrZXkgdG8gc3dpdGNoIHRvIGVkaXRvciBsYW5ndWFnZSBob3ZlcicsIGlzTWFjaW50b3NoID8gJ09wdGlvbicgOiAnQWx0Jyk7XG5cdFx0Y29uc3QgZGF0YVNvdXJjZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVidWdIb3ZlckRhdGFTb3VyY2UpO1xuXHRcdHRoaXMudHJlZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxJRXhwcmVzc2lvbiwgSUV4cHJlc3Npb24sIGFueT4sICdEZWJ1Z0hvdmVyJywgdGhpcy50cmVlQ29udGFpbmVyLCBuZXcgRGVidWdIb3ZlckRlbGVnYXRlKCksIFtcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVmFyaWFibGVzUmVuZGVyZXIsIHRoaXMuZXhwcmVzc2lvblJlbmRlcmVyKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVmlzdWFsaXplZFZhcmlhYmxlUmVuZGVyZXIsIHRoaXMuZXhwcmVzc2lvblJlbmRlcmVyKSxcblx0XHRdLFxuXHRcdFx0ZGF0YVNvdXJjZSwge1xuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgRGVidWdIb3ZlckFjY2Vzc2liaWxpdHlQcm92aWRlcigpLFxuXHRcdFx0bW91c2VTdXBwb3J0OiBmYWxzZSxcblx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IHRydWUsXG5cdFx0XHR1c2VTaGFkb3dzOiBmYWxzZSxcblx0XHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IHsgZ2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWw6IChlOiBJRXhwcmVzc2lvbikgPT4gZS5uYW1lIH0sXG5cdFx0XHRvdmVycmlkZVN0eWxlczoge1xuXHRcdFx0XHRsaXN0QmFja2dyb3VuZDogZWRpdG9ySG92ZXJCYWNrZ3JvdW5kXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKFZpc3VhbGl6ZWRWYXJpYWJsZVJlbmRlcmVyLnJlbmRlcmVyT25WaXN1YWxpemF0aW9uUmFuZ2UodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCksIHRoaXMudHJlZSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy50cmVlKTtcblxuXHRcdHRoaXMudmFsdWVDb250YWluZXIgPSAkKCcudmFsdWUnKTtcblx0XHR0aGlzLnZhbHVlQ29udGFpbmVyLnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLnZhbHVlQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgncm9sZScsICd0b29sdGlwJyk7XG5cdFx0dGhpcy5zY3JvbGxiYXIgPSBuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy52YWx1ZUNvbnRhaW5lciwgeyBob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbiB9KTtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5zY3JvbGxiYXIuZ2V0RG9tTm9kZSgpKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuc2Nyb2xsYmFyKTtcblxuXHRcdHRoaXMuZWRpdG9yLmFwcGx5Rm9udEluZm8odGhpcy5kb21Ob2RlKTtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYXNDc3NWYXJpYWJsZShlZGl0b3JIb3ZlckJhY2tncm91bmQpO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5ib3JkZXIgPSBgMXB4IHNvbGlkICR7YXNDc3NWYXJpYWJsZShlZGl0b3JIb3ZlckJvcmRlcil9YDtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuY29sb3IgPSBhc0Nzc1ZhcmlhYmxlKGVkaXRvckhvdmVyRm9yZWdyb3VuZCk7XG5cblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMudHJlZS5vbkNvbnRleHRNZW51KGFzeW5jIGUgPT4gYXdhaXQgdGhpcy5vbkNvbnRleHRNZW51KGUpKSk7XG5cblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMudHJlZS5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmlzVXBkYXRpbmdUcmVlKSB7XG5cdFx0XHRcdC8vIERvbid0IGRvIGEgbGF5b3V0IGluIHRoZSBtaWRkbGUgb2YgdGhlIGFzeW5jIHNldElucHV0XG5cdFx0XHRcdHRoaXMubGF5b3V0VHJlZUFuZENvbnRhaW5lcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMudHJlZS5vbkRpZENoYW5nZUNvbnRlbnRXaWR0aCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaXNVcGRhdGluZ1RyZWUpIHtcblx0XHRcdFx0Ly8gRG9uJ3QgZG8gYSBsYXlvdXQgaW4gdGhlIG1pZGRsZSBvZiB0aGUgYXN5bmMgc2V0SW5wdXRcblx0XHRcdFx0dGhpcy5sYXlvdXRUcmVlQW5kQ29udGFpbmVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHRcdHRoaXMuZWRpdG9yLmFkZENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uQ29udGV4dE1lbnUoZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PElFeHByZXNzaW9uPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZhcmlhYmxlID0gZS5lbGVtZW50O1xuXHRcdGlmICghKHZhcmlhYmxlIGluc3RhbmNlb2YgVmFyaWFibGUpIHx8ICF2YXJpYWJsZS52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiBvcGVuQ29udGV4dE1lbnVGb3JWYXJpYWJsZVRyZWVFbGVtZW50KHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHRoaXMubWVudVNlcnZpY2UsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCBNZW51SWQuRGVidWdIb3ZlckNvbnRleHQsIGUpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsICdrZXlkb3duJywgKGU6IElLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZTogQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9udEluZm8pKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLmFwcGx5Rm9udEluZm8odGhpcy5kb21Ob2RlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLm9uRGlkRXZhbHVhdGVMYXp5RXhwcmVzc2lvbihhc3luYyBlID0+IHtcblx0XHRcdGlmIChlIGluc3RhbmNlb2YgVmFyaWFibGUgJiYgdGhpcy50cmVlLmhhc05vZGUoZSkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLnVwZGF0ZUNoaWxkcmVuKGUsIGZhbHNlLCB0cnVlKTtcblx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLmV4cGFuZChlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRpc0hvdmVyZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5kb21Ob2RlPy5tYXRjaGVzKCc6aG92ZXInKTtcblx0fVxuXG5cdGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl9pc1Zpc2libGU7XG5cdH1cblxuXHR3aWxsQmVWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuc2hvd0NhbmNlbGxhdGlvblNvdXJjZTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIERlYnVnSG92ZXJXaWRnZXQuSUQ7XG5cdH1cblxuXHRnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5kb21Ob2RlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgd2hldGhlciB0aGUgZ2l2ZW4gY29vcmRpbmF0ZXMgYXJlIGluIHRoZSBzYWZlIHRyaWFuZ2xlIGZvcm1lZCBmcm9tXG5cdCAqIHRoZSBwb3NpdGlvbiBhdCB3aGljaCB0aGUgaG92ZXIgd2FzIGluaXRpYXRlZC5cblx0ICovXG5cdGlzSW5TYWZlVHJpYW5nbGUoeDogbnVtYmVyLCB5OiBudW1iZXIpIHtcblx0XHRyZXR1cm4gdGhpcy5faXNWaXNpYmxlICYmICEhdGhpcy5zYWZlVHJpYW5nbGU/LmNvbnRhaW5zKHgsIHkpO1xuXHR9XG5cblx0YXN5bmMgc2hvd0F0KHBvc2l0aW9uOiBQb3NpdGlvbiwgZm9jdXM6IGJvb2xlYW4sIG1vdXNlRXZlbnQ/OiBJTW91c2VFdmVudCk6IFByb21pc2U8dm9pZCB8IFNob3dEZWJ1Z0hvdmVyUmVzdWx0PiB7XG5cdFx0dGhpcy5zaG93Q2FuY2VsbGF0aW9uU291cmNlPy5kaXNwb3NlKHRydWUpO1xuXHRcdGNvbnN0IGNhbmNlbGxhdGlvblNvdXJjZSA9IHRoaXMuc2hvd0NhbmNlbGxhdGlvblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblxuXHRcdGlmICghc2Vzc2lvbiB8fCAhdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0dGhpcy5oaWRlKCk7XG5cdFx0XHRyZXR1cm4gU2hvd0RlYnVnSG92ZXJSZXN1bHQuTk9UX0FWQUlMQUJMRTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRlYnVnSG92ZXJDb21wdXRlci5jb21wdXRlKHBvc2l0aW9uLCBjYW5jZWxsYXRpb25Tb3VyY2UudG9rZW4pO1xuXHRcdGlmIChjYW5jZWxsYXRpb25Tb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0cmV0dXJuIFNob3dEZWJ1Z0hvdmVyUmVzdWx0LkNBTkNFTExFRDtcblx0XHR9XG5cblx0XHRpZiAoIXJlc3VsdC5yYW5nZSkge1xuXHRcdFx0dGhpcy5oaWRlKCk7XG5cdFx0XHRyZXR1cm4gU2hvd0RlYnVnSG92ZXJSZXN1bHQuTk9UX0FWQUlMQUJMRTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc1Zpc2libGUoKSAmJiAhcmVzdWx0LnJhbmdlQ2hhbmdlZCkge1xuXHRcdFx0cmV0dXJuIFNob3dEZWJ1Z0hvdmVyUmVzdWx0Lk5PVF9DSEFOR0VEO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4cHJlc3Npb24gPSBhd2FpdCB0aGlzLmRlYnVnSG92ZXJDb21wdXRlci5ldmFsdWF0ZShzZXNzaW9uKTtcblx0XHRpZiAoY2FuY2VsbGF0aW9uU291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdHJldHVybiBTaG93RGVidWdIb3ZlclJlc3VsdC5DQU5DRUxMRUQ7XG5cdFx0fVxuXG5cdFx0aWYgKCFleHByZXNzaW9uIHx8IChleHByZXNzaW9uIGluc3RhbmNlb2YgRXhwcmVzc2lvbiAmJiAhZXhwcmVzc2lvbi5hdmFpbGFibGUpKSB7XG5cdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdHJldHVybiBTaG93RGVidWdIb3ZlclJlc3VsdC5OT1RfQVZBSUxBQkxFO1xuXHRcdH1cblxuXHRcdHRoaXMuaGlnaGxpZ2h0RGVjb3JhdGlvbnMuc2V0KFt7XG5cdFx0XHRyYW5nZTogcmVzdWx0LnJhbmdlLFxuXHRcdFx0b3B0aW9uczogRGVidWdIb3ZlcldpZGdldC5fSE9WRVJfSElHSExJR0hUX0RFQ09SQVRJT05fT1BUSU9OU1xuXHRcdH1dKTtcblxuXHRcdHJldHVybiB0aGlzLmRvU2hvdyhzZXNzaW9uLCByZXN1bHQucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpLCBleHByZXNzaW9uLCBmb2N1cywgbW91c2VFdmVudCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfSE9WRVJfSElHSExJR0hUX0RFQ09SQVRJT05fT1BUSU9OUyA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdGRlc2NyaXB0aW9uOiAnYmRlYnVnLWhvdmVyLWhpZ2hsaWdodCcsXG5cdFx0Y2xhc3NOYW1lOiAnaG92ZXJIaWdobGlnaHQnXG5cdH0pO1xuXG5cdHByaXZhdGUgYXN5bmMgZG9TaG93KHNlc3Npb246IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQsIHBvc2l0aW9uOiBQb3NpdGlvbiwgZXhwcmVzc2lvbjogSUV4cHJlc3Npb24sIGZvY3VzOiBib29sZWFuLCBtb3VzZUV2ZW50OiBJTW91c2VFdmVudCB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5kb21Ob2RlKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuc2hvd0F0UG9zaXRpb24gPSBwb3NpdGlvbjtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBsaWZlY3ljbGUuRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5faXNWaXNpYmxlID0geyBzdG9yZSB9O1xuXG5cdFx0aWYgKCFleHByZXNzaW9uLmhhc0NoaWxkcmVuKSB7XG5cdFx0XHR0aGlzLmNvbXBsZXhWYWx1ZUNvbnRhaW5lci5oaWRkZW4gPSB0cnVlO1xuXHRcdFx0dGhpcy52YWx1ZUNvbnRhaW5lci5oaWRkZW4gPSBmYWxzZTtcblx0XHRcdHN0b3JlLmFkZCh0aGlzLmV4cHJlc3Npb25SZW5kZXJlci5yZW5kZXJWYWx1ZSh0aGlzLnZhbHVlQ29udGFpbmVyLCBleHByZXNzaW9uLCB7XG5cdFx0XHRcdHNob3dDaGFuZ2VkOiBmYWxzZSxcblx0XHRcdFx0Y29sb3JpemU6IHRydWUsXG5cdFx0XHRcdGhvdmVyOiBmYWxzZSxcblx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMudmFsdWVDb250YWluZXIudGl0bGUgPSAnJztcblx0XHRcdHRoaXMuZWRpdG9yLmxheW91dENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdFx0XHR0aGlzLnNhZmVUcmlhbmdsZSA9IG1vdXNlRXZlbnQgJiYgbmV3IGRvbS5TYWZlVHJpYW5nbGUobW91c2VFdmVudC5wb3N4LCBtb3VzZUV2ZW50LnBvc3ksIHRoaXMuZG9tTm9kZSk7XG5cdFx0XHR0aGlzLnNjcm9sbGJhci5zY2FuRG9tTm9kZSgpO1xuXHRcdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLnJlbmRlcigpO1xuXHRcdFx0XHR0aGlzLnZhbHVlQ29udGFpbmVyLmZvY3VzKCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy52YWx1ZUNvbnRhaW5lci5oaWRkZW4gPSB0cnVlO1xuXG5cdFx0dGhpcy5leHByZXNzaW9uVG9SZW5kZXIgPSBleHByZXNzaW9uO1xuXHRcdHN0b3JlLmFkZCh0aGlzLmV4cHJlc3Npb25SZW5kZXJlci5yZW5kZXJWYWx1ZSh0aGlzLmNvbXBsZXhWYWx1ZVRpdGxlLCBleHByZXNzaW9uLCB7IGhvdmVyOiBmYWxzZSwgc2Vzc2lvbiB9KSk7XG5cdFx0dGhpcy5lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblx0XHR0aGlzLnNhZmVUcmlhbmdsZSA9IG1vdXNlRXZlbnQgJiYgbmV3IGRvbS5TYWZlVHJpYW5nbGUobW91c2VFdmVudC5wb3N4LCBtb3VzZUV2ZW50LnBvc3ksIHRoaXMuZG9tTm9kZSk7XG5cdFx0dGhpcy50cmVlLnNjcm9sbFRvcCA9IDA7XG5cdFx0dGhpcy50cmVlLnNjcm9sbExlZnQgPSAwO1xuXHRcdHRoaXMuY29tcGxleFZhbHVlQ29udGFpbmVyLmhpZGRlbiA9IGZhbHNlO1xuXG5cdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHR0aGlzLmVkaXRvci5yZW5kZXIoKTtcblx0XHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbGF5b3V0VHJlZUFuZENvbnRhaW5lcigpOiB2b2lkIHtcblx0XHR0aGlzLmxheW91dFRyZWUoKTtcblx0XHR0aGlzLmVkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRUcmVlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNjcm9sbEJhckhlaWdodCA9IDEwO1xuXHRcdGxldCBtYXhIZWlnaHRUb0F2b2lkQ3Vyc29yT3ZlcmxheSA9IEluZmluaXR5O1xuXHRcdGlmICh0aGlzLnNob3dBdFBvc2l0aW9uKSB7XG5cdFx0XHRjb25zdCBlZGl0b3JUb3AgPSB0aGlzLmVkaXRvci5nZXREb21Ob2RlKCk/Lm9mZnNldFRvcCB8fCAwO1xuXHRcdFx0Y29uc3QgY29udGFpbmVyVG9wID0gdGhpcy50cmVlQ29udGFpbmVyLm9mZnNldFRvcCArIGVkaXRvclRvcDtcblx0XHRcdGNvbnN0IGhvdmVyZWRDaGFyVG9wID0gdGhpcy5lZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcih0aGlzLnNob3dBdFBvc2l0aW9uLmxpbmVOdW1iZXIsIHRydWUpIC0gdGhpcy5lZGl0b3IuZ2V0U2Nyb2xsVG9wKCk7XG5cdFx0XHRpZiAoY29udGFpbmVyVG9wIDwgaG92ZXJlZENoYXJUb3ApIHtcblx0XHRcdFx0bWF4SGVpZ2h0VG9Bdm9pZEN1cnNvck92ZXJsYXkgPSBob3ZlcmVkQ2hhclRvcCArIGVkaXRvclRvcCAtIDIyOyAvLyAyMiBpcyBtb25hY28gdG9wIHBhZGRpbmcgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvYmxvYi9hMWRmMmQ3MzE5MzgyZDQyZjY2YWQ3ZjQxMWFmMDFlNGNjNDljODBhL3NyYy92cy9lZGl0b3IvYnJvd3Nlci92aWV3UGFydHMvY29udGVudFdpZGdldHMvY29udGVudFdpZGdldHMudHMjTDM2NFxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCB0cmVlSGVpZ2h0ID0gTWF0aC5taW4oTWF0aC5tYXgoMjY2LCB0aGlzLmVkaXRvci5nZXRMYXlvdXRJbmZvKCkuaGVpZ2h0ICogMC41NSksIHRoaXMudHJlZS5jb250ZW50SGVpZ2h0ICsgc2Nyb2xsQmFySGVpZ2h0LCBtYXhIZWlnaHRUb0F2b2lkQ3Vyc29yT3ZlcmxheSk7XG5cblx0XHRjb25zdCByZWFsVHJlZVdpZHRoID0gdGhpcy50cmVlLmNvbnRlbnRXaWR0aDtcblx0XHRjb25zdCB0cmVlV2lkdGggPSBjbGFtcChyZWFsVHJlZVdpZHRoLCA0MDAsIDU1MCk7XG5cdFx0dGhpcy50cmVlLmxheW91dCh0cmVlSGVpZ2h0LCB0cmVlV2lkdGgpO1xuXHRcdHRoaXMudHJlZUNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHt0cmVlSGVpZ2h0fXB4YDtcblx0XHR0aGlzLnNjcm9sbGJhci5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0YmVmb3JlUmVuZGVyKCk6IElEaW1lbnNpb24gfCBudWxsIHtcblx0XHQvLyBiZWZvcmVSZW5kZXIgd2lsbCBiZSBjYWxsZWQgZWFjaCB0aW1lIHRoZSBob3ZlciBzaXplIGNoYW5nZXMsIGFuZCB0aGUgY29udGVudCB3aWRnZXQgaXMgbGF5ZWQgb3V0IGFnYWluLlxuXHRcdGlmICh0aGlzLmV4cHJlc3Npb25Ub1JlbmRlcikge1xuXHRcdFx0Y29uc3QgZXhwcmVzc2lvbiA9IHRoaXMuZXhwcmVzc2lvblRvUmVuZGVyO1xuXHRcdFx0dGhpcy5leHByZXNzaW9uVG9SZW5kZXIgPSB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIERvIHRoaXMgaW4gYmVmb3JlUmVuZGVyIG9uY2UgdGhlIGNvbnRlbnQgd2lkZ2V0IGlzIG5vIGxvbmdlciBkaXNwbGF5PW5vbmUgc28gdGhhdCBpdHMgZWxlbWVudHMnIHNpemVzIHdpbGwgYmUgbWVhc3VyZWQgY29ycmVjdGx5LlxuXHRcdFx0dGhpcy5pc1VwZGF0aW5nVHJlZSA9IHRydWU7XG5cdFx0XHR0aGlzLnRyZWUuc2V0SW5wdXQoZXhwcmVzc2lvbikuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuaXNVcGRhdGluZ1RyZWUgPSBmYWxzZTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0YWZ0ZXJSZW5kZXIocG9zaXRpb25QcmVmZXJlbmNlOiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlIHwgbnVsbCkge1xuXHRcdGlmIChwb3NpdGlvblByZWZlcmVuY2UpIHtcblx0XHRcdC8vIFJlbWVtYmVyIHdoZXJlIHRoZSBlZGl0b3IgcGxhY2VkIHlvdSB0byBrZWVwIHBvc2l0aW9uIHN0YWJsZSAjMTA5MjI2XG5cdFx0XHR0aGlzLnBvc2l0aW9uUHJlZmVyZW5jZSA9IFtwb3NpdGlvblByZWZlcmVuY2VdO1xuXHRcdH1cblx0fVxuXG5cblx0aGlkZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zaG93Q2FuY2VsbGF0aW9uU291cmNlKSB7XG5cdFx0XHR0aGlzLnNob3dDYW5jZWxsYXRpb25Tb3VyY2UuZGlzcG9zZSh0cnVlKTtcblx0XHRcdHRoaXMuc2hvd0NhbmNlbGxhdGlvblNvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChkb20uaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCh0aGlzLmRvbU5vZGUpKSB7XG5cdFx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdH1cblx0XHR0aGlzLl9pc1Zpc2libGUuc3RvcmUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2lzVmlzaWJsZSA9IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuaGlnaGxpZ2h0RGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHR0aGlzLmVkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdHRoaXMucG9zaXRpb25QcmVmZXJlbmNlID0gW0NvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQUJPVkUsIENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQkVMT1ddO1xuXHR9XG5cblx0Z2V0UG9zaXRpb24oKTogSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9pc1Zpc2libGUgPyB7XG5cdFx0XHRwb3NpdGlvbjogdGhpcy5zaG93QXRQb3NpdGlvbixcblx0XHRcdHByZWZlcmVuY2U6IHRoaXMucG9zaXRpb25QcmVmZXJlbmNlXG5cdFx0fSA6IG51bGw7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMudG9EaXNwb3NlID0gbGlmZWN5Y2xlLmRpc3Bvc2UodGhpcy50b0Rpc3Bvc2UpO1xuXHR9XG59XG5cbmNsYXNzIERlYnVnSG92ZXJBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxJRXhwcmVzc2lvbj4ge1xuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ3RyZWVBcmlhTGFiZWwnLCBcIkRlYnVnIEhvdmVyXCIpO1xuXHR9XG5cblx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IElFeHByZXNzaW9uKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKHsga2V5OiAndmFyaWFibGVBcmlhTGFiZWwnLCBjb21tZW50OiBbJ0RvIG5vdCB0cmFuc2xhdGUgcGxhY2Vob2xkZXJzLiBQbGFjZWhvbGRlcnMgYXJlIG5hbWUgYW5kIHZhbHVlIG9mIGEgdmFyaWFibGUuJ10gfSwgXCJ7MH0sIHZhbHVlIHsxfSwgdmFyaWFibGVzLCBkZWJ1Z1wiLCBlbGVtZW50Lm5hbWUsIGVsZW1lbnQudmFsdWUpO1xuXHR9XG59XG5cbmNsYXNzIERlYnVnSG92ZXJEYXRhU291cmNlIGV4dGVuZHMgQWJzdHJhY3RFeHByZXNzaW9uRGF0YVNvdXJjZTxJRXhwcmVzc2lvbiwgSUV4cHJlc3Npb24+IHtcblxuXHRwdWJsaWMgb3ZlcnJpZGUgaGFzQ2hpbGRyZW4oZWxlbWVudDogSUV4cHJlc3Npb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZWxlbWVudC5oYXNDaGlsZHJlbjtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBkb0dldENoaWxkcmVuKGVsZW1lbnQ6IElFeHByZXNzaW9uKTogUHJvbWlzZTxJRXhwcmVzc2lvbltdPiB7XG5cdFx0cmV0dXJuIGVsZW1lbnQuZ2V0Q2hpbGRyZW4oKTtcblx0fVxufVxuXG5jbGFzcyBEZWJ1Z0hvdmVyRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJRXhwcmVzc2lvbj4ge1xuXHRnZXRIZWlnaHQoZWxlbWVudDogSUV4cHJlc3Npb24pOiBudW1iZXIge1xuXHRcdHJldHVybiAxODtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogSUV4cHJlc3Npb24pOiBzdHJpbmcge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgVmlzdWFsaXplZEV4cHJlc3Npb24pIHtcblx0XHRcdHJldHVybiBWaXN1YWxpemVkVmFyaWFibGVSZW5kZXJlci5JRDtcblx0XHR9XG5cdFx0cmV0dXJuIFZhcmlhYmxlc1JlbmRlcmVyLklEO1xuXHR9XG59XG5cbmludGVyZmFjZSBJRGVidWdIb3ZlckNvbXB1dGVSZXN1bHQge1xuXHRyYW5nZUNoYW5nZWQ6IGJvb2xlYW47XG5cdHJhbmdlPzogUmFuZ2U7XG59XG5cbmNsYXNzIERlYnVnSG92ZXJDb21wdXRlciB7XG5cdHByaXZhdGUgX2N1cnJlbnQ/OiB7XG5cdFx0cmFuZ2U6IFJhbmdlO1xuXHRcdGV4cHJlc3Npb246IHN0cmluZztcblx0fTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0cHVibGljIGFzeW5jIGNvbXB1dGUocG9zaXRpb246IFBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElEZWJ1Z0hvdmVyQ29tcHV0ZVJlc3VsdD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0XHRpZiAoIXNlc3Npb24gfHwgIXRoaXMuZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybiB7IHJhbmdlQ2hhbmdlZDogZmFsc2UgfTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZ2V0RXZhbHVhdGFibGVFeHByZXNzaW9uQXRQb3NpdGlvbih0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBtb2RlbCwgcG9zaXRpb24sIHRva2VuKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHsgcmFuZ2VDaGFuZ2VkOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgcmFuZ2UsIG1hdGNoaW5nRXhwcmVzc2lvbiB9ID0gcmVzdWx0O1xuXHRcdGNvbnN0IHJhbmdlQ2hhbmdlZCA9ICF0aGlzLl9jdXJyZW50Py5yYW5nZS5lcXVhbHNSYW5nZShyYW5nZSk7XG5cdFx0dGhpcy5fY3VycmVudCA9IHsgZXhwcmVzc2lvbjogbWF0Y2hpbmdFeHByZXNzaW9uLCByYW5nZTogUmFuZ2UubGlmdChyYW5nZSkgfTtcblx0XHRyZXR1cm4geyByYW5nZUNoYW5nZWQsIHJhbmdlOiB0aGlzLl9jdXJyZW50LnJhbmdlIH07XG5cdH1cblxuXHRhc3luYyBldmFsdWF0ZShzZXNzaW9uOiBJRGVidWdTZXNzaW9uKTogUHJvbWlzZTxJRXhwcmVzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5fY3VycmVudCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdObyBleHByZXNzaW9uIHRvIGV2YWx1YXRlJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBkZWJ1Z1NvdXJjZSA9IHRleHRNb2RlbCAmJiBzZXNzaW9uLmdldFNvdXJjZUZvclVyaSh0ZXh0TW9kZWw/LnVyaSk7XG5cblx0XHRpZiAoc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNFdmFsdWF0ZUZvckhvdmVycykge1xuXHRcdFx0Y29uc3QgZXhwcmVzc2lvbiA9IG5ldyBFeHByZXNzaW9uKHRoaXMuX2N1cnJlbnQuZXhwcmVzc2lvbik7XG5cdFx0XHRhd2FpdCBleHByZXNzaW9uLmV2YWx1YXRlKHNlc3Npb24sIHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lLCAnaG92ZXInLCB1bmRlZmluZWQsIGRlYnVnU291cmNlID8ge1xuXHRcdFx0XHRsaW5lOiB0aGlzLl9jdXJyZW50LnJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0Y29sdW1uOiB0aGlzLl9jdXJyZW50LnJhbmdlLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRzb3VyY2U6IGRlYnVnU291cmNlLnJhdyxcblx0XHRcdH0gOiB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuIGV4cHJlc3Npb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGZvY3VzZWRTdGFja0ZyYW1lID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWU7XG5cdFx0XHRpZiAoZm9jdXNlZFN0YWNrRnJhbWUpIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IGZpbmRFeHByZXNzaW9uSW5TdGFja0ZyYW1lKFxuXHRcdFx0XHRcdGZvY3VzZWRTdGFja0ZyYW1lLFxuXHRcdFx0XHRcdGNvYWxlc2NlKHRoaXMuX2N1cnJlbnQuZXhwcmVzc2lvbi5zcGxpdCgnLicpLm1hcCh3b3JkID0+IHdvcmQudHJpbSgpKSlcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUtyQixTQUFTLDRCQUE0QjtBQUdyQyxTQUFTLGdCQUFnQjtBQUN6QixTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxlQUFlO0FBQ3hCLFlBQVksZUFBZTtBQUMzQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1Q0FBNEY7QUFDckcsU0FBb0Msb0JBQW9CO0FBR3hELFNBQVMsYUFBYTtBQUV0QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGdDQUFnQztBQUN6QyxZQUFZLFNBQVM7QUFDckIsU0FBUyxjQUFjLGNBQWM7QUFDckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFlLHVCQUF1QixtQkFBbUIsNkJBQTZCO0FBQy9GLFNBQVMscUJBQW9GO0FBQzdGLFNBQVMsWUFBWSxVQUFVLDRCQUE0QjtBQUMzRCxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG1CQUFtQiw0QkFBNEIsNkNBQTZDO0FBRXJHLE1BQU0sSUFBSSxJQUFJO0FBRVAsSUFBVyx1QkFBWCxrQkFBV0EsMEJBQVg7QUFDTixFQUFBQSw0Q0FBQTtBQUNBLEVBQUFBLDRDQUFBO0FBQ0EsRUFBQUEsNENBQUE7QUFIaUIsU0FBQUE7QUFBQSxHQUFBO0FBTWxCLGVBQWUsaUJBQWlCLFdBQWlDLGFBQW9EO0FBQ3BILE1BQUksQ0FBQyxXQUFXO0FBQ2YsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLFdBQVcsTUFBTSxV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
