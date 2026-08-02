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
import { HighlightedLabel } from "../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { toAction } from "../../../../base/common/actions.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { createMatches } from "../../../../base/common/filters.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ViewAction, ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED, CONTEXT_VARIABLES_FOCUSED, DebugVisualizationType, IDebugService, VARIABLES_VIEW_ID, WATCH_VIEW_ID } from "../common/debug.js";
import { getContextForVariable } from "../common/debugContext.js";
import { ErrorScope, Expression, Scope, StackFrame, Variable, VisualizedExpression, getUriForDebugMemory } from "../common/debugModel.js";
import { IDebugVisualizerService } from "../common/debugVisualizers.js";
import { AbstractExpressionDataSource, AbstractExpressionsRenderer, expressionAndScopeLabelProvider, renderViewTree } from "./baseDebugView.js";
import { ADD_TO_WATCH_ID, ADD_TO_WATCH_LABEL, COPY_EVALUATE_PATH_ID, COPY_EVALUATE_PATH_LABEL, COPY_VALUE_ID, COPY_VALUE_LABEL, setDataBreakpointInfoResponse } from "./debugCommands.js";
import { DebugExpressionRenderer } from "./debugExpressionRenderer.js";
const $ = dom.$;
let forgetScopes = true;
let variableInternalContext;
let VariablesView = class extends ViewPane {
  constructor(options, contextMenuService, debugService, keybindingService, configurationService, instantiationService, viewDescriptorService, contextKeyService, openerService, themeService, hoverService, menuService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.debugService = debugService;
    this.menuService = menuService;
    this.needsRefresh = false;
    this.savedViewState = /* @__PURE__ */ new Map();
    this.autoExpandedScopes = /* @__PURE__ */ new Set();
    this.updateTreeScheduler = this._register(new RunOnceScheduler(async () => {
      const stackFrame = this.debugService.getViewModel().focusedStackFrame;
      this.needsRefresh = false;
      const input = this.tree.getInput();
      if (input) {
        this.savedViewState.set(input.getId(), this.tree.getViewState());
      }
      if (!stackFrame) {
        await this.tree.setInput(null);
        return;
      }
      const viewState = this.savedViewState.get(stackFrame.getId());
      await this.tree.setInput(stackFrame, viewState);
      const scopes = await stackFrame.getScopes();
      const toExpand = scopes.find((s) => !s.expensive);
      if (toExpand && this.tree.hasNode(toExpand)) {
        this.autoExpandedScopes.add(toExpand.getId());
        await this.tree.expand(toExpand);
      }
    }, 400));
  }
  get treeSelection() {
    return this.tree.getSelection();
  }
  renderBody(container) {
    super.renderBody(container);
    this.element.classList.add("debug-pane");
    container.classList.add("debug-variables");
    const treeContainer = renderViewTree(container);
    const expressionRenderer = this.instantiationService.createInstance(DebugExpressionRenderer);
    this.tree = this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "VariablesView",
      treeContainer,
      new VariablesDelegate(),
      [
        this.instantiationService.createInstance(VariablesRenderer, expressionRenderer),
        this.instantiationService.createInstance(VisualizedVariableRenderer, expressionRenderer),
        new ScopesRenderer(),
        new ScopeErrorRenderer()
      ],
      this.instantiationService.createInstance(VariablesDataSource),
      {
        accessibilityProvider: new VariablesAccessibilityProvider(),
        identityProvider: { getId: (element) => element.getId() },
        keyboardNavigationLabelProvider: expressionAndScopeLabelProvider,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles
      }
    );
    this._register(VisualizedVariableRenderer.rendererOnVisualizationRange(this.debugService.getViewModel(), this.tree));
    this.tree.setInput(this.debugService.getViewModel().focusedStackFrame ?? null);
    CONTEXT_VARIABLES_FOCUSED.bindTo(this.tree.contextKeyService);
    this._register(this.debugService.getViewModel().onDidFocusStackFrame((sf) => {
      if (!this.isBodyVisible()) {
        this.needsRefresh = true;
        return;
      }
      const timeout = sf.explicit ? 0 : void 0;
      this.updateTreeScheduler.schedule(timeout);
    }));
    this._register(this.debugService.getViewModel().onWillUpdateViews(() => {
      const stackFrame = this.debugService.getViewModel().focusedStackFrame;
      if (stackFrame && forgetScopes) {
        stackFrame.forgetScopes();
      }
      forgetScopes = true;
      this.tree.updateChildren();
    }));
    this._register(this.tree);
    this._register(this.tree.onMouseDblClick((e) => this.onMouseDblClick(e)));
    this._register(this.tree.onContextMenu(async (e) => await this.onContextMenu(e)));
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible && this.needsRefresh) {
        this.updateTreeScheduler.schedule();
      }
    }));
    let horizontalScrolling;
    this._register(this.debugService.getViewModel().onDidSelectExpression((e) => {
      const variable = e?.expression;
      if (variable && this.tree.hasNode(variable)) {
        horizontalScrolling = this.tree.options.horizontalScrolling;
        if (horizontalScrolling) {
          this.tree.updateOptions({ horizontalScrolling: false });
        }
        this.tree.rerender(variable);
      } else if (!e && horizontalScrolling !== void 0) {
        this.tree.updateOptions({ horizontalScrolling });
        horizontalScrolling = void 0;
      }
    }));
    this._register(this.debugService.getViewModel().onDidEvaluateLazyExpression(async (e) => {
      if (e instanceof Variable && this.tree.hasNode(e)) {
        await this.tree.updateChildren(e, false, true);
        await this.tree.expand(e);
      }
    }));
    this._register(this.debugService.onDidEndSession(() => {
      this.savedViewState.clear();
      this.autoExpandedScopes.clear();
    }));
  }
  layoutBody(width, height) {
    super.layoutBody(height, width);
    this.tree.layout(width, height);
  }
  focus() {
    super.focus();
    this.tree.domFocus();
  }
  collapseAll() {
    this.tree.collapseAll();
  }
  onMouseDblClick(e) {
    if (this.canSetExpressionValue(e.element)) {
      this.debugService.getViewModel().setSelectedExpression(e.element, false);
    }
  }
  canSetExpressionValue(e) {
    const session = this.debugService.getViewModel().focusedSession;
    if (!session) {
      return false;
    }
    if (e instanceof VisualizedExpression) {
      return !!e.treeItem.canEdit;
    }
    if (!session.capabilities?.supportsSetVariable && !session.capabilities?.supportsSetExpression) {
      return false;
    }
    return e instanceof Variable && !e.presentationHint?.attributes?.includes("readOnly") && !e.presentationHint?.lazy;
  }
  async onContextMenu(e) {
    const element = e.element;
    if (element instanceof Scope) {
      return this.openContextMenuForScope(e, element);
    }
    if (!(element instanceof Variable) || !element.value) {
      return;
    }
    return openContextMenuForVariableTreeElement(this.contextKeyService, this.menuService, this.contextMenuService, MenuId.DebugVariablesContext, e);
  }
  openContextMenuForScope(e, scope) {
    const context = { scope: { name: scope.name } };
    const menu = this.menuService.getMenuActions(MenuId.DebugScopesContext, this.contextKeyService, { arg: context, shouldForwardArgs: false });
    const { secondary } = getContextMenuActions(menu, "inline");
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => secondary
    });
  }
};
VariablesView = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IDebugService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IViewDescriptorService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IThemeService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, IMenuService)
], VariablesView);
async function openContextMenuForVariableTreeElement(parentContextKeyService, menuService, contextMenuService, menuId, e) {
  const variable = e.element;
  if (!(variable instanceof Variable) || !variable.value) {
    return;
  }
  const contextKeyService = await getContextForVariableMenuWithDataAccess(parentContextKeyService, variable);
  const context = getVariablesContext(variable);
  const menu = menuService.getMenuActions(menuId, contextKeyService, { arg: context, shouldForwardArgs: false });
  const { secondary } = getContextMenuActions(menu, "inline");
  contextMenuService.showContextMenu({
    getAnchor: () => e.anchor,
    getActions: () => secondary
  });
}
const getVariablesContext = (variable) => ({
  sessionId: variable.getSession()?.getId(),
  container: variable.parent instanceof Expression ? { expression: variable.parent.name } : variable.parent.toDebugProtocolObject(),
  variable: variable.toDebugProtocolObject()
});
async function getContextForVariableMenuWithDataAccess(parentContext, variable) {
  const session = variable.getSession();
  if (!session || !session.capabilities.supportsDataBreakpoints) {
    return getContextForVariableMenuBase(parentContext, variable);
  }
  const contextKeys = [];
  const dataBreakpointInfoResponse = await session.dataBreakpointInfo(variable.name, variable.parent.reference);
  const dataBreakpointId = dataBreakpointInfoResponse?.dataId;
  const dataBreakpointAccessTypes = dataBreakpointInfoResponse?.accessTypes;
  setDataBreakpointInfoResponse(dataBreakpointInfoResponse);
  if (!dataBreakpointAccessTypes) {
    contextKeys.push([CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED.key, !!dataBreakpointId]);
  } else {
    for (const accessType of dataBreakpointAccessTypes) {
      switch (accessType) {
        case "read":
          contextKeys.push([CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED.key, !!dataBreakpointId]);
          break;
        case "write":
          contextKeys.push([CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED.key, !!dataBreakpointId]);
          break;
        case "readWrite":
          contextKeys.push([CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED.key, !!dataBreakpointId]);
          break;
      }
    }
  }
  return getContextForVariableMenuBase(parentContext, variable, contextKeys);
}
function getContextForVariableMenuBase(parentContext, variable, additionalContext = []) {
  variableInternalContext = variable;
  return getContextForVariable(parentContext, variable, additionalContext);
}
function isStackFrame(obj) {
  return obj instanceof StackFrame;
}
class VariablesDataSource extends AbstractExpressionDataSource {
  hasChildren(element) {
    if (!element) {
      return false;
    }
    if (isStackFrame(element)) {
      return true;
    }
    return element.hasChildren;
  }
  doGetChildren(element) {
    if (isStackFrame(element)) {
      return element.getScopes();
    }
    return element.getChildren();
  }
}
class VariablesDelegate {
  getHeight(element) {
    return 22;
  }
  getTemplateId(element) {
    if (element instanceof ErrorScope) {
      return ScopeErrorRenderer.ID;
    }
    if (element instanceof Scope) {
      return ScopesRenderer.ID;
    }
    if (element instanceof VisualizedExpression) {
      return VisualizedVariableRenderer.ID;
    }
    return VariablesRenderer.ID;
  }
}
const _ScopesRenderer = class _ScopesRenderer {
  get templateId() {
    return _ScopesRenderer.ID;
  }
  renderTemplate(container) {
    const name = dom.append(container, $(".scope"));
    const label = new HighlightedLabel(name);
    return { name, label };
  }
  renderElement(element, index, templateData) {
    templateData.label.set(element.element.name, createMatches(element.filterData));
  }
  disposeTemplate(templateData) {
    templateData.label.dispose();
  }
};
_ScopesRenderer.ID = "scope";
let ScopesRenderer = _ScopesRenderer;
const _ScopeErrorRenderer = class _ScopeErrorRenderer {
  get templateId() {
    return _ScopeErrorRenderer.ID;
  }
  renderTemplate(container) {
    const wrapper = dom.append(container, $(".scope"));
    const error = dom.append(wrapper, $(".error"));
    return { error };
  }
  renderElement(element, index, templateData) {
    templateData.error.innerText = element.element.name;
  }
  disposeTemplate() {
  }
};
_ScopeErrorRenderer.ID = "scopeError";
let ScopeErrorRenderer = _ScopeErrorRenderer;
let VisualizedVariableRenderer = class extends AbstractExpressionsRenderer {
  constructor(expressionRenderer, debugService, contextViewService, hoverService, menuService, contextKeyService) {
    super(debugService, contextViewService, hoverService);
    this.expressionRenderer = expressionRenderer;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
  }
  /**
   * Registers a helper that rerenders the tree when visualization is requested
   * or cancelled./
   */
  static rendererOnVisualizationRange(model, tree) {
    return model.onDidChangeVisualization(({ original }) => {
      if (!tree.hasNode(original)) {
        return;
      }
      const parent = tree.getParentElement(original);
      tree.updateChildren(parent, false, false);
    });
  }
  get templateId() {
    return VisualizedVariableRenderer.ID;
  }
  renderElement(node, index, data) {
    data.elementDisposable.clear();
    super.renderExpressionElement(node.element, node, data);
  }
  renderExpression(expression, data, highlights) {
    const viz = expression;
    let text = viz.name;
    if (viz.value && typeof viz.name === "string") {
      text += ":";
    }
    data.label.set(text, highlights, viz.name);
    data.elementDisposable.add(this.expressionRenderer.renderValue(data.value, viz, {
      showChanged: false,
      maxValueLength: 1024,
      colorize: true,
      session: expression.getSession()
    }));
  }
  getInputBoxOptions(expression) {
    const viz = expression;
    return {
      initialValue: expression.value,
      ariaLabel: localize("variableValueAriaLabel", "Type new variable value"),
      validationOptions: {
        validation: () => viz.errorMessage ? { content: viz.errorMessage } : null
      },
      onFinish: (value, success) => {
        viz.errorMessage = void 0;
        if (success) {
          viz.edit(value).then(() => {
            forgetScopes = false;
            this.debugService.getViewModel().updateViews();
          });
        }
      }
    };
  }
  renderActionBar(actionBar, expression, _data) {
    const viz = expression;
    const contextKeyService = viz.original ? getContextForVariableMenuBase(this.contextKeyService, viz.original) : this.contextKeyService;
    const context = viz.original ? getVariablesContext(viz.original) : void 0;
    const menu = this.menuService.getMenuActions(MenuId.DebugVariablesContext, contextKeyService, { arg: context, shouldForwardArgs: false });
    const { primary } = getContextMenuActions(menu, "inline");
    if (viz.original) {
      const action = toAction({
        id: "debugViz",
        label: localize("removeVisualizer", "Remove Visualizer"),
        class: ThemeIcon.asClassName(Codicon.eye),
        run: () => this.debugService.getViewModel().setVisualizedExpression(viz.original, void 0)
      });
      action.checked = true;
      primary.push(action);
      actionBar.domNode.style.display = "initial";
    }
    actionBar.clear();
    actionBar.context = context;
    actionBar.push(primary, { icon: true, label: false });
  }
};
VisualizedVariableRenderer.ID = "viz";
VisualizedVariableRenderer = __decorateClass([
  __decorateParam(1, IDebugService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService)
], VisualizedVariableRenderer);
let VariablesRenderer = class extends AbstractExpressionsRenderer {
  constructor(expressionRenderer, menuService, contextKeyService, visualization, contextMenuService, debugService, contextViewService, hoverService) {
    super(debugService, contextViewService, hoverService);
    this.expressionRenderer = expressionRenderer;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.visualization = visualization;
    this.contextMenuService = contextMenuService;
  }
  get templateId() {
    return VariablesRenderer.ID;
  }
  renderExpression(expression, data, highlights) {
    data.elementDisposable.add(this.expressionRenderer.renderVariable(data, expression, {
      highlights,
      showChanged: true
    }));
  }
  renderElement(node, index, data) {
    data.elementDisposable.clear();
    super.renderExpressionElement(node.element, node, data);
  }
  getInputBoxOptions(expression) {
    const variable = expression;
    return {
      initialValue: expression.value,
      ariaLabel: localize("variableValueAriaLabel", "Type new variable value"),
      validationOptions: {
        validation: () => variable.errorMessage ? { content: variable.errorMessage } : null
      },
      onFinish: (value, success) => {
        variable.errorMessage = void 0;
        const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
        if (success && variable.value !== value && focusedStackFrame) {
          variable.setVariable(value, focusedStackFrame).then(() => {
            forgetScopes = false;
            this.debugService.getViewModel().updateViews();
          });
        }
      }
    };
  }
  renderActionBar(actionBar, expression, data) {
    const variable = expression;
    const contextKeyService = getContextForVariableMenuBase(this.contextKeyService, variable);
    const context = getVariablesContext(variable);
    const menu = this.menuService.getMenuActions(MenuId.DebugVariablesContext, contextKeyService, { arg: context, shouldForwardArgs: false });
    const { primary } = getContextMenuActions(menu, "inline");
    actionBar.clear();
    actionBar.context = context;
    actionBar.push(primary, { icon: true, label: false });
    const cts = new CancellationTokenSource();
    data.elementDisposable.add(toDisposable(() => cts.dispose(true)));
    this.visualization.getApplicableFor(expression, cts.token).then((result) => {
      data.elementDisposable.add(result);
      const originalExpression = expression instanceof VisualizedExpression && expression.original || expression;
      const actions = result.object.map((v) => toAction({ id: "debugViz", label: v.name, class: v.iconClass || "debug-viz-icon", run: this.useVisualizer(v, originalExpression, cts.token) }));
      if (actions.length === 0) {
      } else if (actions.length === 1) {
        actionBar.push(actions[0], { icon: true, label: false });
      } else {
        actionBar.push(toAction({ id: "debugViz", label: localize("useVisualizer", "Visualize Variable..."), class: ThemeIcon.asClassName(Codicon.eye), run: () => this.pickVisualizer(actions, originalExpression, data) }), { icon: true, label: false });
      }
    });
  }
  pickVisualizer(actions, expression, data) {
    this.contextMenuService.showContextMenu({
      getAnchor: () => data.actionBar.getContainer(),
      getActions: () => actions
    });
  }
  useVisualizer(viz, expression, token) {
    return async () => {
      const resolved = await viz.resolve(token);
      if (token.isCancellationRequested) {
        return;
      }
      if (resolved.type === DebugVisualizationType.Command) {
        viz.execute();
      } else {
        const replacement = await this.visualization.getVisualizedNodeFor(resolved.id, expression);
        if (replacement) {
          this.debugService.getViewModel().setVisualizedExpression(expression, replacement);
        }
      }
    };
  }
};
VariablesRenderer.ID = "variable";
VariablesRenderer = __decorateClass([
  __decorateParam(1, IMenuService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IDebugVisualizerService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IDebugService),
  __decorateParam(6, IContextViewService),
  __decorateParam(7, IHoverService)
], VariablesRenderer);
class VariablesAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("variablesAriaTreeLabel", "Debug Variables");
  }
  getAriaLabel(element) {
    if (element instanceof Scope) {
      return localize("variableScopeAriaLabel", "Scope {0}", element.name);
    }
    if (element instanceof Variable) {
      return localize({ key: "variableAriaLabel", comment: ["Placeholders are variable name and variable value respectivly. They should not be translated."] }, "{0}, value {1}", element.name, element.value);
    }
    return null;
  }
}
const SET_VARIABLE_ID = "debug.setVariable";
CommandsRegistry.registerCommand({
  id: SET_VARIABLE_ID,
  handler: (accessor) => {
    const debugService = accessor.get(IDebugService);
    debugService.getViewModel().setSelectedExpression(variableInternalContext, false);
  }
});
CommandsRegistry.registerCommand({
  metadata: {
    description: COPY_VALUE_LABEL
  },
  id: COPY_VALUE_ID,
  handler: async (accessor, arg, ctx) => {
    const debugService = accessor.get(IDebugService);
    const clipboardService = accessor.get(IClipboardService);
    let elementContext = "";
    let elements;
    if (!arg) {
      const viewService = accessor.get(IViewsService);
      const focusedView = viewService.getFocusedView();
      let view;
      if (focusedView?.id === WATCH_VIEW_ID) {
        view = viewService.getActiveViewWithId(WATCH_VIEW_ID);
        elementContext = "watch";
      } else if (focusedView?.id === VARIABLES_VIEW_ID) {
        view = viewService.getActiveViewWithId(VARIABLES_VIEW_ID);
        elementContext = "variables";
      }
      if (!view) {
        return;
      }
      elements = view.treeSelection.filter((e) => e instanceof Expression || e instanceof Variable);
    } else if (arg instanceof Variable || arg instanceof Expression) {
      elementContext = "watch";
      elements = [arg];
    } else {
      elementContext = "variables";
      elements = variableInternalContext ? [variableInternalContext] : [];
    }
    const stackFrame = debugService.getViewModel().focusedStackFrame;
    const session = debugService.getViewModel().focusedSession;
    if (!stackFrame || !session || elements.length === 0) {
      return;
    }
    const evalContext = session.capabilities.supportsClipboardContext ? "clipboard" : elementContext;
    const toEvaluate = elements.map((element) => element instanceof Variable ? element.evaluateName || element.value : element.name);
    try {
      const evaluations = await Promise.all(toEvaluate.map((expr) => session.evaluate(expr, stackFrame.frameId, evalContext)));
      const result = coalesce(evaluations).map((evaluation) => evaluation.body.result);
      if (result.length) {
        clipboardService.writeText(result.join("\n"));
      }
    } catch (e) {
      const result = elements.map((element) => element.value);
      clipboardService.writeText(result.join("\n"));
    }
  }
});
const VIEW_MEMORY_ID = "workbench.debug.viewlet.action.viewMemory";
const HEX_EDITOR_EXTENSION_ID = "ms-vscode.hexeditor";
const HEX_EDITOR_EDITOR_ID = "hexEditor.hexedit";
CommandsRegistry.registerCommand({
  id: VIEW_MEMORY_ID,
  handler: async (accessor, arg, ctx) => {
    const debugService = accessor.get(IDebugService);
    let sessionId;
    let memoryReference;
    if ("sessionId" in arg) {
      if (!arg.sessionId || !arg.variable.memoryReference) {
        return;
      }
      sessionId = arg.sessionId;
      memoryReference = arg.variable.memoryReference;
    } else {
      if (!arg.memoryReference) {
        return;
      }
      const focused = debugService.getViewModel().focusedSession;
      if (!focused) {
        return;
      }
      sessionId = focused.getId();
      memoryReference = arg.memoryReference;
    }
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    const editorService = accessor.get(IEditorService);
    const notificationService = accessor.get(INotificationService);
    const extensionService = accessor.get(IExtensionService);
    const telemetryService = accessor.get(ITelemetryService);
    const ext = await extensionService.getExtension(HEX_EDITOR_EXTENSION_ID);
    if (ext || await tryInstallHexEditor(extensionsWorkbenchService, notificationService)) {
      telemetryService.publicLog("debug/didViewMemory", {
        debugType: debugService.getModel().getSession(sessionId)?.configuration.type
      });
      await editorService.openEditor({
        resource: getUriForDebugMemory(sessionId, memoryReference),
        options: {
          revealIfOpened: true,
          override: HEX_EDITOR_EDITOR_ID
        }
      }, SIDE_GROUP);
    }
  }
});
async function tryInstallHexEditor(extensionsWorkbenchService, notificationService) {
  try {
    await extensionsWorkbenchService.install(HEX_EDITOR_EXTENSION_ID, {
      justification: localize("viewMemory.prompt", "Inspecting binary data requires this extension."),
      enable: true
    }, ProgressLocation.Notification);
    return true;
  } catch (error) {
    notificationService.error(error);
    return false;
  }
}
CommandsRegistry.registerCommand({
  metadata: {
    description: COPY_EVALUATE_PATH_LABEL
  },
  id: COPY_EVALUATE_PATH_ID,
  handler: async (accessor, context) => {
    const clipboardService = accessor.get(IClipboardService);
    if (context instanceof Variable) {
      await clipboardService.writeText(context.evaluateName);
    } else {
      await clipboardService.writeText(context.variable.evaluateName);
    }
  }
});
CommandsRegistry.registerCommand({
  metadata: {
    description: ADD_TO_WATCH_LABEL
  },
  id: ADD_TO_WATCH_ID,
  handler: async (accessor, context) => {
    const debugService = accessor.get(IDebugService);
    debugService.addWatchExpression(context.variable.evaluateName);
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "variables.collapse",
      viewId: VARIABLES_VIEW_ID,
      title: localize("collapse", "Collapse All"),
      f1: false,
      icon: Codicon.collapseAll,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", VARIABLES_VIEW_ID)
      }
    });
  }
  runInView(_accessor, view) {
    view.collapseAll();
  }
});
export {
  SET_VARIABLE_ID,
  VIEW_MEMORY_ID,
  VariablesRenderer,
  VariablesView,
  VisualizedVariableRenderer,
  openContextMenuForVariableTreeElement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvdmFyaWFibGVzVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEhpZ2hsaWdodGVkTGFiZWwsIElIaWdobGlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaGlnaGxpZ2h0ZWRsYWJlbC9oaWdobGlnaHRlZExhYmVsLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgQXN5bmNEYXRhVHJlZSwgSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hc3luY0RhdGFUcmVlLmpzJztcbmltcG9ydCB7IElUcmVlQ29udGV4dE1lbnVFdmVudCwgSVRyZWVNb3VzZUV2ZW50LCBJVHJlZU5vZGUsIElUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlLCBjcmVhdGVNYXRjaGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZXRDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hBc3luY0RhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld0FjdGlvbiwgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3bGV0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdzVmlld2xldC5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENPTlRFWFRfQlJFQUtfV0hFTl9WQUxVRV9DSEFOR0VTX1NVUFBPUlRFRCwgQ09OVEVYVF9CUkVBS19XSEVOX1ZBTFVFX0lTX0FDQ0VTU0VEX1NVUFBPUlRFRCwgQ09OVEVYVF9CUkVBS19XSEVOX1ZBTFVFX0lTX1JFQURfU1VQUE9SVEVELCBDT05URVhUX1ZBUklBQkxFU19GT0NVU0VELCBEZWJ1Z1Zpc3VhbGl6YXRpb25UeXBlLCBJRGVidWdTZXJ2aWNlLCBJRGVidWdWaWV3V2l0aFZhcmlhYmxlcywgSUV4cHJlc3Npb24sIElTY29wZSwgSVN0YWNrRnJhbWUsIElWaWV3TW9kZWwsIFZBUklBQkxFU19WSUVXX0lELCBXQVRDSF9WSUVXX0lEIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IGdldENvbnRleHRGb3JWYXJpYWJsZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z0NvbnRleHQuanMnO1xuaW1wb3J0IHsgRXJyb3JTY29wZSwgRXhwcmVzc2lvbiwgU2NvcGUsIFN0YWNrRnJhbWUsIFZhcmlhYmxlLCBWaXN1YWxpemVkRXhwcmVzc2lvbiwgZ2V0VXJpRm9yRGVidWdNZW1vcnkgfSBmcm9tICcuLi9jb21tb24vZGVidWdNb2RlbC5qcyc7XG5pbXBvcnQgeyBEZWJ1Z1Zpc3VhbGl6ZXIsIElEZWJ1Z1Zpc3VhbGl6ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnVmlzdWFsaXplcnMuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RFeHByZXNzaW9uRGF0YVNvdXJjZSwgQWJzdHJhY3RFeHByZXNzaW9uc1JlbmRlcmVyLCBleHByZXNzaW9uQW5kU2NvcGVMYWJlbFByb3ZpZGVyLCBJRXhwcmVzc2lvblRlbXBsYXRlRGF0YSwgSUlucHV0Qm94T3B0aW9ucywgcmVuZGVyVmlld1RyZWUgfSBmcm9tICcuL2Jhc2VEZWJ1Z1ZpZXcuanMnO1xuaW1wb3J0IHsgQUREX1RPX1dBVENIX0lELCBBRERfVE9fV0FUQ0hfTEFCRUwsIENPUFlfRVZBTFVBVEVfUEFUSF9JRCwgQ09QWV9FVkFMVUFURV9QQVRIX0xBQkVMLCBDT1BZX1ZBTFVFX0lELCBDT1BZX1ZBTFVFX0xBQkVMLCBzZXREYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZSB9IGZyb20gJy4vZGVidWdDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0V4cHJlc3Npb25SZW5kZXJlciB9IGZyb20gJy4vZGVidWdFeHByZXNzaW9uUmVuZGVyZXIuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5sZXQgZm9yZ2V0U2NvcGVzID0gdHJ1ZTtcblxubGV0IHZhcmlhYmxlSW50ZXJuYWxDb250ZXh0OiBWYXJpYWJsZSB8IHVuZGVmaW5lZDtcblxuaW50ZXJmYWNlIElWYXJpYWJsZXNDb250ZXh0IHtcblx0c2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGNvbnRhaW5lcjogRGVidWdQcm90b2NvbC5WYXJpYWJsZSB8IERlYnVnUHJvdG9jb2wuU2NvcGUgfCBEZWJ1Z1Byb3RvY29sLkV2YWx1YXRlQXJndW1lbnRzO1xuXHR2YXJpYWJsZTogRGVidWdQcm90b2NvbC5WYXJpYWJsZTtcbn1cblxuZXhwb3J0IGNsYXNzIFZhcmlhYmxlc1ZpZXcgZXh0ZW5kcyBWaWV3UGFuZSBpbXBsZW1lbnRzIElEZWJ1Z1ZpZXdXaXRoVmFyaWFibGVzIHtcblxuXHRwcml2YXRlIHVwZGF0ZVRyZWVTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgbmVlZHNSZWZyZXNoID0gZmFsc2U7XG5cdHByaXZhdGUgdHJlZSE6IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8SVN0YWNrRnJhbWUgfCBudWxsLCBJRXhwcmVzc2lvbiB8IElTY29wZSwgRnV6enlTY29yZT47XG5cdHByaXZhdGUgc2F2ZWRWaWV3U3RhdGUgPSBuZXcgTWFwPHN0cmluZywgSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGU+KCk7XG5cdHByaXZhdGUgYXV0b0V4cGFuZGVkU2NvcGVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0cHVibGljIGdldCB0cmVlU2VsZWN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld2xldFZpZXdPcHRpb25zLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXG5cdFx0Ly8gVXNlIHNjaGVkdWxlciB0byBwcmV2ZW50IHVubmVjZXNzYXJ5IGZsYXNoaW5nXG5cdFx0dGhpcy51cGRhdGVUcmVlU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhY2tGcmFtZSA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXG5cdFx0XHR0aGlzLm5lZWRzUmVmcmVzaCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgaW5wdXQgPSB0aGlzLnRyZWUuZ2V0SW5wdXQoKTtcblx0XHRcdGlmIChpbnB1dCkge1xuXHRcdFx0XHR0aGlzLnNhdmVkVmlld1N0YXRlLnNldChpbnB1dC5nZXRJZCgpLCB0aGlzLnRyZWUuZ2V0Vmlld1N0YXRlKCkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzdGFja0ZyYW1lKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudHJlZS5zZXRJbnB1dChudWxsKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB2aWV3U3RhdGUgPSB0aGlzLnNhdmVkVmlld1N0YXRlLmdldChzdGFja0ZyYW1lLmdldElkKCkpO1xuXHRcdFx0YXdhaXQgdGhpcy50cmVlLnNldElucHV0KHN0YWNrRnJhbWUsIHZpZXdTdGF0ZSk7XG5cblx0XHRcdC8vIEF1dG9tYXRpY2FsbHkgZXhwYW5kIHRoZSBmaXJzdCBub24tZXhwZW5zaXZlIHNjb3BlXG5cdFx0XHRjb25zdCBzY29wZXMgPSBhd2FpdCBzdGFja0ZyYW1lLmdldFNjb3BlcygpO1xuXHRcdFx0Y29uc3QgdG9FeHBhbmQgPSBzY29wZXMuZmluZChzID0+ICFzLmV4cGVuc2l2ZSk7XG5cblx0XHRcdC8vIEEgcmFjZSBjb25kaXRpb24gY291bGQgYmUgcHJlc2VudCBjYXVzaW5nIHRoZSBzY29wZXMgaGVyZSB0byBiZSBkaWZmZXJlbnQgZnJvbSB0aGUgc2NvcGVzIHRoYXQgdGhlIHRyZWUganVzdCByZXRyaWV2ZWQuXG5cdFx0XHQvLyBJZiB0aGF0IGhhcHBlbmVkLCBkb24ndCB0cnkgdG8gcmV2ZWFsIGFueXRoaW5nLCBpdCB3aWxsIGJlIHN0cmFpZ2h0ZW5lZCBvdXQgb24gdGhlIG5leHQgdXBkYXRlXG5cdFx0XHRpZiAodG9FeHBhbmQgJiYgdGhpcy50cmVlLmhhc05vZGUodG9FeHBhbmQpKSB7XG5cdFx0XHRcdHRoaXMuYXV0b0V4cGFuZGVkU2NvcGVzLmFkZCh0b0V4cGFuZC5nZXRJZCgpKTtcblx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLmV4cGFuZCh0b0V4cGFuZCk7XG5cdFx0XHR9XG5cdFx0fSwgNDAwKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2RlYnVnLXBhbmUnKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZGVidWctdmFyaWFibGVzJyk7XG5cdFx0Y29uc3QgdHJlZUNvbnRhaW5lciA9IHJlbmRlclZpZXdUcmVlKGNvbnRhaW5lcik7XG5cdFx0Y29uc3QgZXhwcmVzc2lvblJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWJ1Z0V4cHJlc3Npb25SZW5kZXJlcik7XG5cdFx0dGhpcy50cmVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hBc3luY0RhdGFUcmVlPElTdGFja0ZyYW1lIHwgbnVsbCwgSUV4cHJlc3Npb24gfCBJU2NvcGUsIEZ1enp5U2NvcmU+LCAnVmFyaWFibGVzVmlldycsIHRyZWVDb250YWluZXIsIG5ldyBWYXJpYWJsZXNEZWxlZ2F0ZSgpLFxuXHRcdFx0W1xuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFZhcmlhYmxlc1JlbmRlcmVyLCBleHByZXNzaW9uUmVuZGVyZXIpLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFZpc3VhbGl6ZWRWYXJpYWJsZVJlbmRlcmVyLCBleHByZXNzaW9uUmVuZGVyZXIpLFxuXHRcdFx0XHRuZXcgU2NvcGVzUmVuZGVyZXIoKSxcblx0XHRcdFx0bmV3IFNjb3BlRXJyb3JSZW5kZXJlcigpLFxuXHRcdFx0XSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVmFyaWFibGVzRGF0YVNvdXJjZSksIHtcblx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IFZhcmlhYmxlc0FjY2Vzc2liaWxpdHlQcm92aWRlcigpLFxuXHRcdFx0aWRlbnRpdHlQcm92aWRlcjogeyBnZXRJZDogKGVsZW1lbnQ6IElFeHByZXNzaW9uIHwgSVNjb3BlKSA9PiBlbGVtZW50LmdldElkKCkgfSxcblx0XHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IGV4cHJlc3Npb25BbmRTY29wZUxhYmVsUHJvdmlkZXIsXG5cdFx0XHRvdmVycmlkZVN0eWxlczogdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCkubGlzdE92ZXJyaWRlU3R5bGVzXG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihWaXN1YWxpemVkVmFyaWFibGVSZW5kZXJlci5yZW5kZXJlck9uVmlzdWFsaXphdGlvblJhbmdlKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLCB0aGlzLnRyZWUpKTtcblx0XHR0aGlzLnRyZWUuc2V0SW5wdXQodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWUgPz8gbnVsbCk7XG5cblx0XHRDT05URVhUX1ZBUklBQkxFU19GT0NVU0VELmJpbmRUbyh0aGlzLnRyZWUuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkub25EaWRGb2N1c1N0YWNrRnJhbWUoc2YgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0XHR0aGlzLm5lZWRzUmVmcmVzaCA9IHRydWU7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVmcmVzaCB0aGUgdHJlZSBpbW1lZGlhdGVseSBpZiB0aGUgdXNlciBleHBsaWN0bHkgY2hhbmdlZCBzdGFjayBmcmFtZXMuXG5cdFx0XHQvLyBPdGhlcndpc2UgcG9zdHBvbmUgdGhlIHJlZnJlc2ggdW50aWwgdXNlciBzdG9wcyBzdGVwcGluZy5cblx0XHRcdGNvbnN0IHRpbWVvdXQgPSBzZi5leHBsaWNpdCA/IDAgOiB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnVwZGF0ZVRyZWVTY2hlZHVsZXIuc2NoZWR1bGUodGltZW91dCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLm9uV2lsbFVwZGF0ZVZpZXdzKCgpID0+IHtcblx0XHRcdGNvbnN0IHN0YWNrRnJhbWUgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRcdGlmIChzdGFja0ZyYW1lICYmIGZvcmdldFNjb3Blcykge1xuXHRcdFx0XHRzdGFja0ZyYW1lLmZvcmdldFNjb3BlcygpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yZ2V0U2NvcGVzID0gdHJ1ZTtcblx0XHRcdHRoaXMudHJlZS51cGRhdGVDaGlsZHJlbigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbk1vdXNlRGJsQ2xpY2soZSA9PiB0aGlzLm9uTW91c2VEYmxDbGljayhlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkNvbnRleHRNZW51KGFzeW5jIGUgPT4gYXdhaXQgdGhpcy5vbkNvbnRleHRNZW51KGUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkodmlzaWJsZSA9PiB7XG5cdFx0XHRpZiAodmlzaWJsZSAmJiB0aGlzLm5lZWRzUmVmcmVzaCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVRyZWVTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0bGV0IGhvcml6b250YWxTY3JvbGxpbmc6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkub25EaWRTZWxlY3RFeHByZXNzaW9uKGUgPT4ge1xuXHRcdFx0Y29uc3QgdmFyaWFibGUgPSBlPy5leHByZXNzaW9uO1xuXHRcdFx0aWYgKHZhcmlhYmxlICYmIHRoaXMudHJlZS5oYXNOb2RlKHZhcmlhYmxlKSkge1xuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nID0gdGhpcy50cmVlLm9wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGluZztcblx0XHRcdFx0aWYgKGhvcml6b250YWxTY3JvbGxpbmcpIHtcblx0XHRcdFx0XHR0aGlzLnRyZWUudXBkYXRlT3B0aW9ucyh7IGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy50cmVlLnJlcmVuZGVyKHZhcmlhYmxlKTtcblx0XHRcdH0gZWxzZSBpZiAoIWUgJiYgaG9yaXpvbnRhbFNjcm9sbGluZyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMudHJlZS51cGRhdGVPcHRpb25zKHsgaG9yaXpvbnRhbFNjcm9sbGluZzogaG9yaXpvbnRhbFNjcm9sbGluZyB9KTtcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZyA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkub25EaWRFdmFsdWF0ZUxhenlFeHByZXNzaW9uKGFzeW5jIGUgPT4ge1xuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBWYXJpYWJsZSAmJiB0aGlzLnRyZWUuaGFzTm9kZShlKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUudXBkYXRlQ2hpbGRyZW4oZSwgZmFsc2UsIHRydWUpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUuZXhwYW5kKGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5vbkRpZEVuZFNlc3Npb24oKCkgPT4ge1xuXHRcdFx0dGhpcy5zYXZlZFZpZXdTdGF0ZS5jbGVhcigpO1xuXHRcdFx0dGhpcy5hdXRvRXhwYW5kZWRTY29wZXMuY2xlYXIoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keSh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy50cmVlLmxheW91dCh3aWR0aCwgaGVpZ2h0KTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdH1cblxuXHRjb2xsYXBzZUFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuY29sbGFwc2VBbGwoKTtcblx0fVxuXG5cdHByaXZhdGUgb25Nb3VzZURibENsaWNrKGU6IElUcmVlTW91c2VFdmVudDxJRXhwcmVzc2lvbiB8IElTY29wZT4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5TZXRFeHByZXNzaW9uVmFsdWUoZS5lbGVtZW50KSkge1xuXHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuc2V0U2VsZWN0ZWRFeHByZXNzaW9uKGUuZWxlbWVudCwgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2FuU2V0RXhwcmVzc2lvblZhbHVlKGU6IElFeHByZXNzaW9uIHwgSVNjb3BlIHwgbnVsbCk6IGUgaXMgSUV4cHJlc3Npb24ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoZSBpbnN0YW5jZW9mIFZpc3VhbGl6ZWRFeHByZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gISFlLnRyZWVJdGVtLmNhbkVkaXQ7XG5cdFx0fVxuXG5cdFx0aWYgKCFzZXNzaW9uLmNhcGFiaWxpdGllcz8uc3VwcG9ydHNTZXRWYXJpYWJsZSAmJiAhc2Vzc2lvbi5jYXBhYmlsaXRpZXM/LnN1cHBvcnRzU2V0RXhwcmVzc2lvbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBlIGluc3RhbmNlb2YgVmFyaWFibGUgJiYgIWUucHJlc2VudGF0aW9uSGludD8uYXR0cmlidXRlcz8uaW5jbHVkZXMoJ3JlYWRPbmx5JykgJiYgIWUucHJlc2VudGF0aW9uSGludD8ubGF6eTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25Db250ZXh0TWVudShlOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8SUV4cHJlc3Npb24gfCBJU2NvcGU+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGUuZWxlbWVudDtcblxuXHRcdC8vIEhhbmRsZSBzY29wZSBjb250ZXh0IG1lbnVcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFNjb3BlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5vcGVuQ29udGV4dE1lbnVGb3JTY29wZShlLCBlbGVtZW50KTtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgdmFyaWFibGUgY29udGV4dCBtZW51XG5cdFx0aWYgKCEoZWxlbWVudCBpbnN0YW5jZW9mIFZhcmlhYmxlKSB8fCAhZWxlbWVudC52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiBvcGVuQ29udGV4dE1lbnVGb3JWYXJpYWJsZVRyZWVFbGVtZW50KHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHRoaXMubWVudVNlcnZpY2UsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCBNZW51SWQuRGVidWdWYXJpYWJsZXNDb250ZXh0LCBlKTtcblx0fVxuXG5cdHByaXZhdGUgb3BlbkNvbnRleHRNZW51Rm9yU2NvcGUoZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PElFeHByZXNzaW9uIHwgSVNjb3BlPiwgc2NvcGU6IFNjb3BlKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGV4dCA9IHsgc2NvcGU6IHsgbmFtZTogc2NvcGUubmFtZSB9IH07XG5cdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLkRlYnVnU2NvcGVzQ29udGV4dCwgdGhpcy5jb250ZXh0S2V5U2VydmljZSwgeyBhcmc6IGNvbnRleHQsIHNob3VsZEZvcndhcmRBcmdzOiBmYWxzZSB9KTtcblx0XHRjb25zdCB7IHNlY29uZGFyeSB9ID0gZ2V0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnUsICdpbmxpbmUnKTtcblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gc2Vjb25kYXJ5XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG9wZW5Db250ZXh0TWVudUZvclZhcmlhYmxlVHJlZUVsZW1lbnQocGFyZW50Q29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSwgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLCBtZW51SWQ6IE1lbnVJZCwgZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PElFeHByZXNzaW9uIHwgSVNjb3BlPikge1xuXHRjb25zdCB2YXJpYWJsZSA9IGUuZWxlbWVudDtcblx0aWYgKCEodmFyaWFibGUgaW5zdGFuY2VvZiBWYXJpYWJsZSkgfHwgIXZhcmlhYmxlLnZhbHVlKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhd2FpdCBnZXRDb250ZXh0Rm9yVmFyaWFibGVNZW51V2l0aERhdGFBY2Nlc3MocGFyZW50Q29udGV4dEtleVNlcnZpY2UsIHZhcmlhYmxlKTtcblx0Y29uc3QgY29udGV4dDogSVZhcmlhYmxlc0NvbnRleHQgPSBnZXRWYXJpYWJsZXNDb250ZXh0KHZhcmlhYmxlKTtcblx0Y29uc3QgbWVudSA9IG1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKG1lbnVJZCwgY29udGV4dEtleVNlcnZpY2UsIHsgYXJnOiBjb250ZXh0LCBzaG91bGRGb3J3YXJkQXJnczogZmFsc2UgfSk7XG5cblx0Y29uc3QgeyBzZWNvbmRhcnkgfSA9IGdldENvbnRleHRNZW51QWN0aW9ucyhtZW51LCAnaW5saW5lJyk7XG5cdGNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0Z2V0QWN0aW9uczogKCkgPT4gc2Vjb25kYXJ5XG5cdH0pO1xufVxuXG5jb25zdCBnZXRWYXJpYWJsZXNDb250ZXh0ID0gKHZhcmlhYmxlOiBWYXJpYWJsZSk6IElWYXJpYWJsZXNDb250ZXh0ID0+ICh7XG5cdHNlc3Npb25JZDogdmFyaWFibGUuZ2V0U2Vzc2lvbigpPy5nZXRJZCgpLFxuXHRjb250YWluZXI6IHZhcmlhYmxlLnBhcmVudCBpbnN0YW5jZW9mIEV4cHJlc3Npb25cblx0XHQ/IHsgZXhwcmVzc2lvbjogdmFyaWFibGUucGFyZW50Lm5hbWUgfVxuXHRcdDogKHZhcmlhYmxlLnBhcmVudCBhcyAoVmFyaWFibGUgfCBTY29wZSkpLnRvRGVidWdQcm90b2NvbE9iamVjdCgpLFxuXHR2YXJpYWJsZTogdmFyaWFibGUudG9EZWJ1Z1Byb3RvY29sT2JqZWN0KClcbn0pO1xuXG4vKipcbiAqIEdldHMgYSBjb250ZXh0IGtleSBvdmVybGF5IHRoYXQgaGFzIGNvbnRleHQgZm9yIHRoZSBnaXZlbiB2YXJpYWJsZSwgaW5jbHVkaW5nIGRhdGEgYWNjZXNzIGluZm8uXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGdldENvbnRleHRGb3JWYXJpYWJsZU1lbnVXaXRoRGF0YUFjY2VzcyhwYXJlbnRDb250ZXh0OiBJQ29udGV4dEtleVNlcnZpY2UsIHZhcmlhYmxlOiBWYXJpYWJsZSkge1xuXHRjb25zdCBzZXNzaW9uID0gdmFyaWFibGUuZ2V0U2Vzc2lvbigpO1xuXHRpZiAoIXNlc3Npb24gfHwgIXNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzRGF0YUJyZWFrcG9pbnRzKSB7XG5cdFx0cmV0dXJuIGdldENvbnRleHRGb3JWYXJpYWJsZU1lbnVCYXNlKHBhcmVudENvbnRleHQsIHZhcmlhYmxlKTtcblx0fVxuXG5cdGNvbnN0IGNvbnRleHRLZXlzOiBbc3RyaW5nLCB1bmtub3duXVtdID0gW107XG5cdGNvbnN0IGRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlID0gYXdhaXQgc2Vzc2lvbi5kYXRhQnJlYWtwb2ludEluZm8odmFyaWFibGUubmFtZSwgdmFyaWFibGUucGFyZW50LnJlZmVyZW5jZSk7XG5cdGNvbnN0IGRhdGFCcmVha3BvaW50SWQgPSBkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZT8uZGF0YUlkO1xuXHRjb25zdCBkYXRhQnJlYWtwb2ludEFjY2Vzc1R5cGVzID0gZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2U/LmFjY2Vzc1R5cGVzO1xuXHRzZXREYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZShkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZSk7XG5cblx0aWYgKCFkYXRhQnJlYWtwb2ludEFjY2Vzc1R5cGVzKSB7XG5cdFx0Y29udGV4dEtleXMucHVzaChbQ09OVEVYVF9CUkVBS19XSEVOX1ZBTFVFX0NIQU5HRVNfU1VQUE9SVEVELmtleSwgISFkYXRhQnJlYWtwb2ludElkXSk7XG5cdH0gZWxzZSB7XG5cdFx0Zm9yIChjb25zdCBhY2Nlc3NUeXBlIG9mIGRhdGFCcmVha3BvaW50QWNjZXNzVHlwZXMpIHtcblx0XHRcdHN3aXRjaCAoYWNjZXNzVHlwZSkge1xuXHRcdFx0XHRjYXNlICdyZWFkJzpcblx0XHRcdFx0XHRjb250ZXh0S2V5cy5wdXNoKFtDT05URVhUX0JSRUFLX1dIRU5fVkFMVUVfSVNfUkVBRF9TVVBQT1JURUQua2V5LCAhIWRhdGFCcmVha3BvaW50SWRdKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnd3JpdGUnOlxuXHRcdFx0XHRcdGNvbnRleHRLZXlzLnB1c2goW0NPTlRFWFRfQlJFQUtfV0hFTl9WQUxVRV9DSEFOR0VTX1NVUFBPUlRFRC5rZXksICEhZGF0YUJyZWFrcG9pbnRJZF0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdyZWFkV3JpdGUnOlxuXHRcdFx0XHRcdGNvbnRleHRLZXlzLnB1c2goW0NPTlRFWFRfQlJFQUtfV0hFTl9WQUxVRV9JU19BQ0NFU1NFRF9TVVBQT1JURUQua2V5LCAhIWRhdGFCcmVha3BvaW50SWRdKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZ2V0Q29udGV4dEZvclZhcmlhYmxlTWVudUJhc2UocGFyZW50Q29udGV4dCwgdmFyaWFibGUsIGNvbnRleHRLZXlzKTtcbn1cblxuLyoqXG4gKiBHZXRzIGEgY29udGV4dCBrZXkgb3ZlcmxheSB0aGF0IGhhcyBjb250ZXh0IGZvciB0aGUgZ2l2ZW4gdmFyaWFibGUuXG4gKi9cbmZ1bmN0aW9uIGdldENvbnRleHRGb3JWYXJpYWJsZU1lbnVCYXNlKHBhcmVudENvbnRleHQ6IElDb250ZXh0S2V5U2VydmljZSwgdmFyaWFibGU6IFZhcmlhYmxlLCBhZGRpdGlvbmFsQ29udGV4dDogW3N0cmluZywgdW5rbm93bl1bXSA9IFtdKSB7XG5cdHZhcmlhYmxlSW50ZXJuYWxDb250ZXh0ID0gdmFyaWFibGU7XG5cdHJldHVybiBnZXRDb250ZXh0Rm9yVmFyaWFibGUocGFyZW50Q29udGV4dCwgdmFyaWFibGUsIGFkZGl0aW9uYWxDb250ZXh0KTtcbn1cblxuZnVuY3Rpb24gaXNTdGFja0ZyYW1lKG9iajogYW55KTogb2JqIGlzIElTdGFja0ZyYW1lIHtcblx0cmV0dXJuIG9iaiBpbnN0YW5jZW9mIFN0YWNrRnJhbWU7XG59XG5cbmNsYXNzIFZhcmlhYmxlc0RhdGFTb3VyY2UgZXh0ZW5kcyBBYnN0cmFjdEV4cHJlc3Npb25EYXRhU291cmNlPElTdGFja0ZyYW1lIHwgbnVsbCwgSUV4cHJlc3Npb24gfCBJU2NvcGU+IHtcblxuXHRwdWJsaWMgb3ZlcnJpZGUgaGFzQ2hpbGRyZW4oZWxlbWVudDogSVN0YWNrRnJhbWUgfCBudWxsIHwgSUV4cHJlc3Npb24gfCBJU2NvcGUpOiBib29sZWFuIHtcblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGlzU3RhY2tGcmFtZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVsZW1lbnQuaGFzQ2hpbGRyZW47XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZG9HZXRDaGlsZHJlbihlbGVtZW50OiBJU3RhY2tGcmFtZSB8IElFeHByZXNzaW9uIHwgSVNjb3BlKTogUHJvbWlzZTwoSUV4cHJlc3Npb24gfCBJU2NvcGUpW10+IHtcblx0XHRpZiAoaXNTdGFja0ZyYW1lKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5nZXRTY29wZXMoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWxlbWVudC5nZXRDaGlsZHJlbigpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJU2NvcGVUZW1wbGF0ZURhdGEge1xuXHRuYW1lOiBIVE1MRWxlbWVudDtcblx0bGFiZWw6IEhpZ2hsaWdodGVkTGFiZWw7XG59XG5cbmNsYXNzIFZhcmlhYmxlc0RlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SUV4cHJlc3Npb24gfCBJU2NvcGU+IHtcblxuXHRnZXRIZWlnaHQoZWxlbWVudDogSUV4cHJlc3Npb24gfCBJU2NvcGUpOiBudW1iZXIge1xuXHRcdHJldHVybiAyMjtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogSUV4cHJlc3Npb24gfCBJU2NvcGUpOiBzdHJpbmcge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgRXJyb3JTY29wZSkge1xuXHRcdFx0cmV0dXJuIFNjb3BlRXJyb3JSZW5kZXJlci5JRDtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFNjb3BlKSB7XG5cdFx0XHRyZXR1cm4gU2NvcGVzUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBWaXN1YWxpemVkRXhwcmVzc2lvbikge1xuXHRcdFx0cmV0dXJuIFZpc3VhbGl6ZWRWYXJpYWJsZVJlbmRlcmVyLklEO1xuXHRcdH1cblxuXHRcdHJldHVybiBWYXJpYWJsZXNSZW5kZXJlci5JRDtcblx0fVxufVxuXG5jbGFzcyBTY29wZXNSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8SVNjb3BlLCBGdXp6eVNjb3JlLCBJU2NvcGVUZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnc2NvcGUnO1xuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFNjb3Blc1JlbmRlcmVyLklEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTY29wZVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgbmFtZSA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2NvcGUnKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBuZXcgSGlnaGxpZ2h0ZWRMYWJlbChuYW1lKTtcblxuXHRcdHJldHVybiB7IG5hbWUsIGxhYmVsIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxJU2NvcGUsIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTY29wZVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXQoZWxlbWVudC5lbGVtZW50Lm5hbWUsIGNyZWF0ZU1hdGNoZXMoZWxlbWVudC5maWx0ZXJEYXRhKSk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJU2NvcGVUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJU2NvcGVFcnJvclRlbXBsYXRlRGF0YSB7XG5cdGVycm9yOiBIVE1MRWxlbWVudDtcbn1cblxuY2xhc3MgU2NvcGVFcnJvclJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxJU2NvcGUsIEZ1enp5U2NvcmUsIElTY29wZUVycm9yVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3Njb3BlRXJyb3InO1xuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFNjb3BlRXJyb3JSZW5kZXJlci5JRDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2NvcGVFcnJvclRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3Qgd3JhcHBlciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2NvcGUnKSk7XG5cdFx0Y29uc3QgZXJyb3IgPSBkb20uYXBwZW5kKHdyYXBwZXIsICQoJy5lcnJvcicpKTtcblx0XHRyZXR1cm4geyBlcnJvciB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8SVNjb3BlLCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJU2NvcGVFcnJvclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lcnJvci5pbm5lclRleHQgPSBlbGVtZW50LmVsZW1lbnQubmFtZTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSgpOiB2b2lkIHtcblx0XHQvLyBub29wXG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFZpc3VhbGl6ZWRWYXJpYWJsZVJlbmRlcmVyIGV4dGVuZHMgQWJzdHJhY3RFeHByZXNzaW9uc1JlbmRlcmVyIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICd2aXonO1xuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYSBoZWxwZXIgdGhhdCByZXJlbmRlcnMgdGhlIHRyZWUgd2hlbiB2aXN1YWxpemF0aW9uIGlzIHJlcXVlc3RlZFxuXHQgKiBvciBjYW5jZWxsZWQuL1xuXHQgKi9cblx0cHVibGljIHN0YXRpYyByZW5kZXJlck9uVmlzdWFsaXphdGlvblJhbmdlKG1vZGVsOiBJVmlld01vZGVsLCB0cmVlOiBBc3luY0RhdGFUcmVlPGFueSwgYW55LCBhbnk+KTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiBtb2RlbC5vbkRpZENoYW5nZVZpc3VhbGl6YXRpb24oKHsgb3JpZ2luYWwgfSkgPT4ge1xuXHRcdFx0aWYgKCF0cmVlLmhhc05vZGUob3JpZ2luYWwpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcGFyZW50OiBJRXhwcmVzc2lvbiA9IHRyZWUuZ2V0UGFyZW50RWxlbWVudChvcmlnaW5hbCk7XG5cdFx0XHR0cmVlLnVwZGF0ZUNoaWxkcmVuKHBhcmVudCwgZmFsc2UsIGZhbHNlKTtcblx0XHR9KTtcblxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHByZXNzaW9uUmVuZGVyZXI6IERlYnVnRXhwcmVzc2lvblJlbmRlcmVyLFxuXHRcdEBJRGVidWdTZXJ2aWNlIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihkZWJ1Z1NlcnZpY2UsIGNvbnRleHRWaWV3U2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBWaXN1YWxpemVkVmFyaWFibGVSZW5kZXJlci5JRDtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSByZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJRXhwcmVzc2lvbiwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIGRhdGE6IElFeHByZXNzaW9uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdHN1cGVyLnJlbmRlckV4cHJlc3Npb25FbGVtZW50KG5vZGUuZWxlbWVudCwgbm9kZSwgZGF0YSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyRXhwcmVzc2lvbihleHByZXNzaW9uOiBJRXhwcmVzc2lvbiwgZGF0YTogSUV4cHJlc3Npb25UZW1wbGF0ZURhdGEsIGhpZ2hsaWdodHM6IElIaWdobGlnaHRbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHZpeiA9IGV4cHJlc3Npb24gYXMgVmlzdWFsaXplZEV4cHJlc3Npb247XG5cblx0XHRsZXQgdGV4dCA9IHZpei5uYW1lO1xuXHRcdGlmICh2aXoudmFsdWUgJiYgdHlwZW9mIHZpei5uYW1lID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGV4dCArPSAnOic7XG5cdFx0fVxuXHRcdGRhdGEubGFiZWwuc2V0KHRleHQsIGhpZ2hsaWdodHMsIHZpei5uYW1lKTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlLmFkZCh0aGlzLmV4cHJlc3Npb25SZW5kZXJlci5yZW5kZXJWYWx1ZShkYXRhLnZhbHVlLCB2aXosIHtcblx0XHRcdHNob3dDaGFuZ2VkOiBmYWxzZSxcblx0XHRcdG1heFZhbHVlTGVuZ3RoOiAxMDI0LFxuXHRcdFx0Y29sb3JpemU6IHRydWUsXG5cdFx0XHRzZXNzaW9uOiBleHByZXNzaW9uLmdldFNlc3Npb24oKSxcblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0SW5wdXRCb3hPcHRpb25zKGV4cHJlc3Npb246IElFeHByZXNzaW9uKTogSUlucHV0Qm94T3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgdml6ID0gPFZpc3VhbGl6ZWRFeHByZXNzaW9uPmV4cHJlc3Npb247XG5cdFx0cmV0dXJuIHtcblx0XHRcdGluaXRpYWxWYWx1ZTogZXhwcmVzc2lvbi52YWx1ZSxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ3ZhcmlhYmxlVmFsdWVBcmlhTGFiZWwnLCBcIlR5cGUgbmV3IHZhcmlhYmxlIHZhbHVlXCIpLFxuXHRcdFx0dmFsaWRhdGlvbk9wdGlvbnM6IHtcblx0XHRcdFx0dmFsaWRhdGlvbjogKCkgPT4gdml6LmVycm9yTWVzc2FnZSA/ICh7IGNvbnRlbnQ6IHZpei5lcnJvck1lc3NhZ2UgfSkgOiBudWxsXG5cdFx0XHR9LFxuXHRcdFx0b25GaW5pc2g6ICh2YWx1ZTogc3RyaW5nLCBzdWNjZXNzOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdHZpei5lcnJvck1lc3NhZ2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChzdWNjZXNzKSB7XG5cdFx0XHRcdFx0dml6LmVkaXQodmFsdWUpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gRG8gbm90IHJlZnJlc2ggc2NvcGVzIGR1ZSB0byBhIG5vZGUgbGltaXRhdGlvbiAjMTU1MjBcblx0XHRcdFx0XHRcdGZvcmdldFNjb3BlcyA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkudXBkYXRlVmlld3MoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQWN0aW9uQmFyKGFjdGlvbkJhcjogQWN0aW9uQmFyLCBleHByZXNzaW9uOiBJRXhwcmVzc2lvbiwgX2RhdGE6IElFeHByZXNzaW9uVGVtcGxhdGVEYXRhKSB7XG5cdFx0Y29uc3Qgdml6ID0gZXhwcmVzc2lvbiBhcyBWaXN1YWxpemVkRXhwcmVzc2lvbjtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHZpei5vcmlnaW5hbCA/IGdldENvbnRleHRGb3JWYXJpYWJsZU1lbnVCYXNlKHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHZpei5vcmlnaW5hbCkgOiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlO1xuXHRcdGNvbnN0IGNvbnRleHQgPSB2aXoub3JpZ2luYWwgPyBnZXRWYXJpYWJsZXNDb250ZXh0KHZpei5vcmlnaW5hbCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLkRlYnVnVmFyaWFibGVzQ29udGV4dCwgY29udGV4dEtleVNlcnZpY2UsIHsgYXJnOiBjb250ZXh0LCBzaG91bGRGb3J3YXJkQXJnczogZmFsc2UgfSk7XG5cblx0XHRjb25zdCB7IHByaW1hcnkgfSA9IGdldENvbnRleHRNZW51QWN0aW9ucyhtZW51LCAnaW5saW5lJyk7XG5cblx0XHRpZiAodml6Lm9yaWdpbmFsKSB7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSB0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAnZGVidWdWaXonLCBsYWJlbDogbG9jYWxpemUoJ3JlbW92ZVZpc3VhbGl6ZXInLCAnUmVtb3ZlIFZpc3VhbGl6ZXInKSwgY2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmV5ZSksIHJ1bjogKCkgPT4gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuc2V0VmlzdWFsaXplZEV4cHJlc3Npb24odml6Lm9yaWdpbmFsISwgdW5kZWZpbmVkKVxuXHRcdFx0fSk7XG5cdFx0XHRhY3Rpb24uY2hlY2tlZCA9IHRydWU7XG5cdFx0XHRwcmltYXJ5LnB1c2goYWN0aW9uKTtcblx0XHRcdGFjdGlvbkJhci5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnaW5pdGlhbCc7XG5cdFx0fVxuXHRcdGFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGFjdGlvbkJhci5jb250ZXh0ID0gY29udGV4dDtcblx0XHRhY3Rpb25CYXIucHVzaChwcmltYXJ5LCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVmFyaWFibGVzUmVuZGVyZXIgZXh0ZW5kcyBBYnN0cmFjdEV4cHJlc3Npb25zUmVuZGVyZXIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd2YXJpYWJsZSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHByZXNzaW9uUmVuZGVyZXI6IERlYnVnRXhwcmVzc2lvblJlbmRlcmVyLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJRGVidWdWaXN1YWxpemVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpc3VhbGl6YXRpb246IElEZWJ1Z1Zpc3VhbGl6ZXJTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJRGVidWdTZXJ2aWNlIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihkZWJ1Z1NlcnZpY2UsIGNvbnRleHRWaWV3U2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblx0fVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFZhcmlhYmxlc1JlbmRlcmVyLklEO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlckV4cHJlc3Npb24oZXhwcmVzc2lvbjogSUV4cHJlc3Npb24sIGRhdGE6IElFeHByZXNzaW9uVGVtcGxhdGVEYXRhLCBoaWdobGlnaHRzOiBJSGlnaGxpZ2h0W10pOiB2b2lkIHtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlLmFkZCh0aGlzLmV4cHJlc3Npb25SZW5kZXJlci5yZW5kZXJWYXJpYWJsZShkYXRhLCBleHByZXNzaW9uIGFzIFZhcmlhYmxlLCB7XG5cdFx0XHRoaWdobGlnaHRzLFxuXHRcdFx0c2hvd0NoYW5nZWQ6IHRydWUsXG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElFeHByZXNzaW9uLCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgZGF0YTogSUV4cHJlc3Npb25UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0c3VwZXIucmVuZGVyRXhwcmVzc2lvbkVsZW1lbnQobm9kZS5lbGVtZW50LCBub2RlLCBkYXRhKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRJbnB1dEJveE9wdGlvbnMoZXhwcmVzc2lvbjogSUV4cHJlc3Npb24pOiBJSW5wdXRCb3hPcHRpb25zIHtcblx0XHRjb25zdCB2YXJpYWJsZSA9IDxWYXJpYWJsZT5leHByZXNzaW9uO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpbml0aWFsVmFsdWU6IGV4cHJlc3Npb24udmFsdWUsXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCd2YXJpYWJsZVZhbHVlQXJpYUxhYmVsJywgXCJUeXBlIG5ldyB2YXJpYWJsZSB2YWx1ZVwiKSxcblx0XHRcdHZhbGlkYXRpb25PcHRpb25zOiB7XG5cdFx0XHRcdHZhbGlkYXRpb246ICgpID0+IHZhcmlhYmxlLmVycm9yTWVzc2FnZSA/ICh7IGNvbnRlbnQ6IHZhcmlhYmxlLmVycm9yTWVzc2FnZSB9KSA6IG51bGxcblx0XHRcdH0sXG5cdFx0XHRvbkZpbmlzaDogKHZhbHVlOiBzdHJpbmcsIHN1Y2Nlc3M6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0dmFyaWFibGUuZXJyb3JNZXNzYWdlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkU3RhY2tGcmFtZSA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRcdFx0XHRpZiAoc3VjY2VzcyAmJiB2YXJpYWJsZS52YWx1ZSAhPT0gdmFsdWUgJiYgZm9jdXNlZFN0YWNrRnJhbWUpIHtcblx0XHRcdFx0XHR2YXJpYWJsZS5zZXRWYXJpYWJsZSh2YWx1ZSwgZm9jdXNlZFN0YWNrRnJhbWUpXG5cdFx0XHRcdFx0XHQvLyBOZWVkIHRvIGZvcmNlIHdhdGNoIGV4cHJlc3Npb25zIGFuZCB2YXJpYWJsZXMgdG8gdXBkYXRlIHNpbmNlIGEgdmFyaWFibGUgY2hhbmdlIGNhbiBoYXZlIGFuIGVmZmVjdCBvbiBib3RoXG5cdFx0XHRcdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdC8vIERvIG5vdCByZWZyZXNoIHNjb3BlcyBkdWUgdG8gYSBub2RlIGxpbWl0YXRpb24gIzE1NTIwXG5cdFx0XHRcdFx0XHRcdGZvcmdldFNjb3BlcyA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS51cGRhdGVWaWV3cygpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckFjdGlvbkJhcihhY3Rpb25CYXI6IEFjdGlvbkJhciwgZXhwcmVzc2lvbjogSUV4cHJlc3Npb24sIGRhdGE6IElFeHByZXNzaW9uVGVtcGxhdGVEYXRhKSB7XG5cdFx0Y29uc3QgdmFyaWFibGUgPSBleHByZXNzaW9uIGFzIFZhcmlhYmxlO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gZ2V0Q29udGV4dEZvclZhcmlhYmxlTWVudUJhc2UodGhpcy5jb250ZXh0S2V5U2VydmljZSwgdmFyaWFibGUpO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGdldFZhcmlhYmxlc0NvbnRleHQodmFyaWFibGUpO1xuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5EZWJ1Z1ZhcmlhYmxlc0NvbnRleHQsIGNvbnRleHRLZXlTZXJ2aWNlLCB7IGFyZzogY29udGV4dCwgc2hvdWxkRm9yd2FyZEFyZ3M6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IHsgcHJpbWFyeSB9ID0gZ2V0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnUsICdpbmxpbmUnKTtcblxuXHRcdGFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGFjdGlvbkJhci5jb250ZXh0ID0gY29udGV4dDtcblx0XHRhY3Rpb25CYXIucHVzaChwcmltYXJ5LCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdHRoaXMudmlzdWFsaXphdGlvbi5nZXRBcHBsaWNhYmxlRm9yKGV4cHJlc3Npb24sIGN0cy50b2tlbikudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZS5hZGQocmVzdWx0KTtcblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxFeHByZXNzaW9uID0gKGV4cHJlc3Npb24gaW5zdGFuY2VvZiBWaXN1YWxpemVkRXhwcmVzc2lvbiAmJiBleHByZXNzaW9uLm9yaWdpbmFsKSB8fCBleHByZXNzaW9uO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IHJlc3VsdC5vYmplY3QubWFwKHYgPT4gdG9BY3Rpb24oeyBpZDogJ2RlYnVnVml6JywgbGFiZWw6IHYubmFtZSwgY2xhc3M6IHYuaWNvbkNsYXNzIHx8ICdkZWJ1Zy12aXotaWNvbicsIHJ1bjogdGhpcy51c2VWaXN1YWxpemVyKHYsIG9yaWdpbmFsRXhwcmVzc2lvbiwgY3RzLnRva2VuKSB9KSk7XG5cdFx0XHRpZiAoYWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Ly8gbm8tb3Bcblx0XHRcdH0gZWxzZSBpZiAoYWN0aW9ucy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0YWN0aW9uQmFyLnB1c2goYWN0aW9uc1swXSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhY3Rpb25CYXIucHVzaCh0b0FjdGlvbih7IGlkOiAnZGVidWdWaXonLCBsYWJlbDogbG9jYWxpemUoJ3VzZVZpc3VhbGl6ZXInLCAnVmlzdWFsaXplIFZhcmlhYmxlLi4uJyksIGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5leWUpLCBydW46ICgpID0+IHRoaXMucGlja1Zpc3VhbGl6ZXIoYWN0aW9ucywgb3JpZ2luYWxFeHByZXNzaW9uLCBkYXRhKSB9KSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHBpY2tWaXN1YWxpemVyKGFjdGlvbnM6IElBY3Rpb25bXSwgZXhwcmVzc2lvbjogSUV4cHJlc3Npb24sIGRhdGE6IElFeHByZXNzaW9uVGVtcGxhdGVEYXRhKSB7XG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZGF0YS5hY3Rpb25CYXIhLmdldENvbnRhaW5lcigpLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdXNlVmlzdWFsaXplcih2aXo6IERlYnVnVmlzdWFsaXplciwgZXhwcmVzc2lvbjogSUV4cHJlc3Npb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdHJldHVybiBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHZpei5yZXNvbHZlKHRva2VuKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXNvbHZlZC50eXBlID09PSBEZWJ1Z1Zpc3VhbGl6YXRpb25UeXBlLkNvbW1hbmQpIHtcblx0XHRcdFx0dml6LmV4ZWN1dGUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gYXdhaXQgdGhpcy52aXN1YWxpemF0aW9uLmdldFZpc3VhbGl6ZWROb2RlRm9yKHJlc29sdmVkLmlkLCBleHByZXNzaW9uKTtcblx0XHRcdFx0aWYgKHJlcGxhY2VtZW50KSB7XG5cdFx0XHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuc2V0VmlzdWFsaXplZEV4cHJlc3Npb24oZXhwcmVzc2lvbiwgcmVwbGFjZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBWYXJpYWJsZXNBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxJRXhwcmVzc2lvbiB8IElTY29wZT4ge1xuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgndmFyaWFibGVzQXJpYVRyZWVMYWJlbCcsIFwiRGVidWcgVmFyaWFibGVzXCIpO1xuXHR9XG5cblx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IElFeHByZXNzaW9uIHwgSVNjb3BlKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBTY29wZSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd2YXJpYWJsZVNjb3BlQXJpYUxhYmVsJywgXCJTY29wZSB7MH1cIiwgZWxlbWVudC5uYW1lKTtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBWYXJpYWJsZSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKHsga2V5OiAndmFyaWFibGVBcmlhTGFiZWwnLCBjb21tZW50OiBbJ1BsYWNlaG9sZGVycyBhcmUgdmFyaWFibGUgbmFtZSBhbmQgdmFyaWFibGUgdmFsdWUgcmVzcGVjdGl2bHkuIFRoZXkgc2hvdWxkIG5vdCBiZSB0cmFuc2xhdGVkLiddIH0sIFwiezB9LCB2YWx1ZSB7MX1cIiwgZWxlbWVudC5uYW1lLCBlbGVtZW50LnZhbHVlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgU0VUX1ZBUklBQkxFX0lEID0gJ2RlYnVnLnNldFZhcmlhYmxlJztcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0aWQ6IFNFVF9WQVJJQUJMRV9JRCxcblx0aGFuZGxlcjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5zZXRTZWxlY3RlZEV4cHJlc3Npb24odmFyaWFibGVJbnRlcm5hbENvbnRleHQsIGZhbHNlKTtcblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0bWV0YWRhdGE6IHtcblx0XHRkZXNjcmlwdGlvbjogQ09QWV9WQUxVRV9MQUJFTCxcblx0fSxcblx0aWQ6IENPUFlfVkFMVUVfSUQsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnOiBWYXJpYWJsZSB8IEV4cHJlc3Npb24gfCBJVmFyaWFibGVzQ29udGV4dCB8IHVuZGVmaW5lZCwgY3R4PzogKFZhcmlhYmxlIHwgRXhwcmVzc2lvbilbXSkgPT4ge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRsZXQgZWxlbWVudENvbnRleHQgPSAnJztcblx0XHRsZXQgZWxlbWVudHM6IChWYXJpYWJsZSB8IEV4cHJlc3Npb24pW107XG5cdFx0aWYgKCFhcmcpIHtcblx0XHRcdGNvbnN0IHZpZXdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZm9jdXNlZFZpZXcgPSB2aWV3U2VydmljZS5nZXRGb2N1c2VkVmlldygpO1xuXHRcdFx0bGV0IHZpZXc6IElEZWJ1Z1ZpZXdXaXRoVmFyaWFibGVzIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChmb2N1c2VkVmlldz8uaWQgPT09IFdBVENIX1ZJRVdfSUQpIHtcblx0XHRcdFx0dmlldyA9IHZpZXdTZXJ2aWNlLmdldEFjdGl2ZVZpZXdXaXRoSWQ8SURlYnVnVmlld1dpdGhWYXJpYWJsZXM+KFdBVENIX1ZJRVdfSUQpO1xuXHRcdFx0XHRlbGVtZW50Q29udGV4dCA9ICd3YXRjaCc7XG5cdFx0XHR9IGVsc2UgaWYgKGZvY3VzZWRWaWV3Py5pZCA9PT0gVkFSSUFCTEVTX1ZJRVdfSUQpIHtcblx0XHRcdFx0dmlldyA9IHZpZXdTZXJ2aWNlLmdldEFjdGl2ZVZpZXdXaXRoSWQ8SURlYnVnVmlld1dpdGhWYXJpYWJsZXM+KFZBUklBQkxFU19WSUVXX0lEKTtcblx0XHRcdFx0ZWxlbWVudENvbnRleHQgPSAndmFyaWFibGVzJztcblx0XHRcdH1cblx0XHRcdGlmICghdmlldykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRlbGVtZW50cyA9IHZpZXcudHJlZVNlbGVjdGlvbi5maWx0ZXIoZSA9PiBlIGluc3RhbmNlb2YgRXhwcmVzc2lvbiB8fCBlIGluc3RhbmNlb2YgVmFyaWFibGUpO1xuXHRcdH0gZWxzZSBpZiAoYXJnIGluc3RhbmNlb2YgVmFyaWFibGUgfHwgYXJnIGluc3RhbmNlb2YgRXhwcmVzc2lvbikge1xuXHRcdFx0ZWxlbWVudENvbnRleHQgPSAnd2F0Y2gnO1xuXHRcdFx0ZWxlbWVudHMgPSBbYXJnXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZWxlbWVudENvbnRleHQgPSAndmFyaWFibGVzJztcblx0XHRcdGVsZW1lbnRzID0gdmFyaWFibGVJbnRlcm5hbENvbnRleHQgPyBbdmFyaWFibGVJbnRlcm5hbENvbnRleHRdIDogW107XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhY2tGcmFtZSA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRjb25zdCBzZXNzaW9uID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdGlmICghc3RhY2tGcmFtZSB8fCAhc2Vzc2lvbiB8fCBlbGVtZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBldmFsQ29udGV4dCA9IHNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzQ2xpcGJvYXJkQ29udGV4dCA/ICdjbGlwYm9hcmQnIDogZWxlbWVudENvbnRleHQ7XG5cdFx0Y29uc3QgdG9FdmFsdWF0ZSA9IGVsZW1lbnRzLm1hcChlbGVtZW50ID0+IGVsZW1lbnQgaW5zdGFuY2VvZiBWYXJpYWJsZSA/IChlbGVtZW50LmV2YWx1YXRlTmFtZSB8fCBlbGVtZW50LnZhbHVlKSA6IGVsZW1lbnQubmFtZSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXZhbHVhdGlvbnMgPSBhd2FpdCBQcm9taXNlLmFsbCh0b0V2YWx1YXRlLm1hcChleHByID0+IHNlc3Npb24uZXZhbHVhdGUoZXhwciwgc3RhY2tGcmFtZS5mcmFtZUlkLCBldmFsQ29udGV4dCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvYWxlc2NlKGV2YWx1YXRpb25zKS5tYXAoZXZhbHVhdGlvbiA9PiBldmFsdWF0aW9uLmJvZHkucmVzdWx0KTtcblx0XHRcdGlmIChyZXN1bHQubGVuZ3RoKSB7XG5cdFx0XHRcdGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHJlc3VsdC5qb2luKCdcXG4nKSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZWxlbWVudHMubWFwKGVsZW1lbnQgPT4gZWxlbWVudC52YWx1ZSk7XG5cdFx0XHRjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChyZXN1bHQuam9pbignXFxuJykpO1xuXHRcdH1cblx0fVxufSk7XG5cbmV4cG9ydCBjb25zdCBWSUVXX01FTU9SWV9JRCA9ICd3b3JrYmVuY2guZGVidWcudmlld2xldC5hY3Rpb24udmlld01lbW9yeSc7XG5cbmNvbnN0IEhFWF9FRElUT1JfRVhURU5TSU9OX0lEID0gJ21zLXZzY29kZS5oZXhlZGl0b3InO1xuY29uc3QgSEVYX0VESVRPUl9FRElUT1JfSUQgPSAnaGV4RWRpdG9yLmhleGVkaXQnO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiBWSUVXX01FTU9SWV9JRCxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmc6IElWYXJpYWJsZXNDb250ZXh0IHwgSUV4cHJlc3Npb24sIGN0eD86IChWYXJpYWJsZSB8IEV4cHJlc3Npb24pW10pID0+IHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0bGV0IHNlc3Npb25JZDogc3RyaW5nO1xuXHRcdGxldCBtZW1vcnlSZWZlcmVuY2U6IHN0cmluZztcblx0XHRpZiAoJ3Nlc3Npb25JZCcgaW4gYXJnKSB7IC8vIElWYXJpYWJsZXNDb250ZXh0XG5cdFx0XHRpZiAoIWFyZy5zZXNzaW9uSWQgfHwgIWFyZy52YXJpYWJsZS5tZW1vcnlSZWZlcmVuY2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0c2Vzc2lvbklkID0gYXJnLnNlc3Npb25JZDtcblx0XHRcdG1lbW9yeVJlZmVyZW5jZSA9IGFyZy52YXJpYWJsZS5tZW1vcnlSZWZlcmVuY2U7XG5cdFx0fSBlbHNlIHsgLy8gSUV4cHJlc3Npb25cblx0XHRcdGlmICghYXJnLm1lbW9yeVJlZmVyZW5jZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBmb2N1c2VkID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdFx0aWYgKCFmb2N1c2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0c2Vzc2lvbklkID0gZm9jdXNlZC5nZXRJZCgpO1xuXHRcdFx0bWVtb3J5UmVmZXJlbmNlID0gYXJnLm1lbW9yeVJlZmVyZW5jZTtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4dGVuc2lvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZXh0ID0gYXdhaXQgZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb24oSEVYX0VESVRPUl9FWFRFTlNJT05fSUQpO1xuXHRcdGlmIChleHQgfHwgYXdhaXQgdHJ5SW5zdGFsbEhleEVkaXRvcihleHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSkpIHtcblx0XHRcdC8qIF9fR0RQUl9fXG5cdFx0XHRcdFwiZGVidWcvZGlkVmlld01lbW9yeVwiIDoge1xuXHRcdFx0XHRcdFwib3duZXJcIjogXCJjb25ub3I0MzEyXCIsXG5cdFx0XHRcdFx0XCJkZWJ1Z1R5cGVcIiA6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIgfVxuXHRcdFx0XHR9XG5cdFx0XHQqL1xuXHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2coJ2RlYnVnL2RpZFZpZXdNZW1vcnknLCB7XG5cdFx0XHRcdGRlYnVnVHlwZTogZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbihzZXNzaW9uSWQpPy5jb25maWd1cmF0aW9uLnR5cGUsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2U6IGdldFVyaUZvckRlYnVnTWVtb3J5KHNlc3Npb25JZCwgbWVtb3J5UmVmZXJlbmNlKSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHJldmVhbElmT3BlbmVkOiB0cnVlLFxuXHRcdFx0XHRcdG92ZXJyaWRlOiBIRVhfRURJVE9SX0VESVRPUl9JRCxcblx0XHRcdFx0fSxcblx0XHRcdH0sIFNJREVfR1JPVVApO1xuXHRcdH1cblx0fVxufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIHRyeUluc3RhbGxIZXhFZGl0b3IoZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0dHJ5IHtcblx0XHRhd2FpdCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsKEhFWF9FRElUT1JfRVhURU5TSU9OX0lELCB7XG5cdFx0XHRqdXN0aWZpY2F0aW9uOiBsb2NhbGl6ZShcInZpZXdNZW1vcnkucHJvbXB0XCIsIFwiSW5zcGVjdGluZyBiaW5hcnkgZGF0YSByZXF1aXJlcyB0aGlzIGV4dGVuc2lvbi5cIiksXG5cdFx0XHRlbmFibGU6IHRydWVcblx0XHR9LCBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbik7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0bWV0YWRhdGE6IHtcblx0XHRkZXNjcmlwdGlvbjogQ09QWV9FVkFMVUFURV9QQVRIX0xBQkVMLFxuXHR9LFxuXHRpZDogQ09QWV9FVkFMVUFURV9QQVRIX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElWYXJpYWJsZXNDb250ZXh0IHwgVmFyaWFibGUpID0+IHtcblx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRpZiAoY29udGV4dCBpbnN0YW5jZW9mIFZhcmlhYmxlKSB7XG5cdFx0XHRhd2FpdCBjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChjb250ZXh0LmV2YWx1YXRlTmFtZSEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChjb250ZXh0LnZhcmlhYmxlLmV2YWx1YXRlTmFtZSEpO1xuXHRcdH1cblx0fVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0bWV0YWRhdGE6IHtcblx0XHRkZXNjcmlwdGlvbjogQUREX1RPX1dBVENIX0xBQkVMLFxuXHR9LFxuXHRpZDogQUREX1RPX1dBVENIX0lELFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElWYXJpYWJsZXNDb250ZXh0KSA9PiB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGRlYnVnU2VydmljZS5hZGRXYXRjaEV4cHJlc3Npb24oY29udGV4dC52YXJpYWJsZS5ldmFsdWF0ZU5hbWUpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxWYXJpYWJsZXNWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAndmFyaWFibGVzLmNvbGxhcHNlJyxcblx0XHRcdHZpZXdJZDogVkFSSUFCTEVTX1ZJRVdfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NvbGxhcHNlJywgXCJDb2xsYXBzZSBBbGxcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRpY29uOiBDb2RpY29uLmNvbGxhcHNlQWxsLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVkFSSUFCTEVTX1ZJRVdfSUQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW5JblZpZXcoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBWYXJpYWJsZXNWaWV3KSB7XG5cdFx0dmlldy5jb2xsYXBzZUFsbCgpO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQVMsd0JBQW9DO0FBSzdDLFNBQWtCLGdCQUFnQjtBQUNsQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHdCQUF3QjtBQUNq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
