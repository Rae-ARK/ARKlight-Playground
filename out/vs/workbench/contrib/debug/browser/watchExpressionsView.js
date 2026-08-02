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
import { ListDragOverEffectPosition, ListDragOverEffectType } from "../../../../base/browser/ui/list/list.js";
import { ElementsDragAndDropData, ListViewTargetSector } from "../../../../base/browser/ui/list/listView.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { localize } from "../../../../nls.js";
import { getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ViewAction, ViewPane } from "../../../browser/parts/views/viewPane.js";
import { FocusedViewContext } from "../../../common/contextkeys.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { CONTEXT_CAN_VIEW_MEMORY, CONTEXT_EXPRESSION_SELECTED, CONTEXT_VARIABLE_IS_READONLY, CONTEXT_VARIABLE_TYPE, CONTEXT_WATCH_EXPRESSIONS_EXIST, CONTEXT_WATCH_EXPRESSIONS_FOCUSED, CONTEXT_WATCH_ITEM_TYPE, IDebugService, CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED, CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT, WATCH_VIEW_ID, CONTEXT_DEBUG_TYPE } from "../common/debug.js";
import { Expression, Variable, VisualizedExpression } from "../common/debugModel.js";
import { AbstractExpressionDataSource, AbstractExpressionsRenderer, expressionAndScopeLabelProvider, renderViewTree } from "./baseDebugView.js";
import { COPY_WATCH_EXPRESSION_COMMAND_ID, setDataBreakpointInfoResponse } from "./debugCommands.js";
import { DebugExpressionRenderer } from "./debugExpressionRenderer.js";
import { watchExpressionsAdd, watchExpressionsRemoveAll } from "./debugIcons.js";
import { VariablesRenderer, VisualizedVariableRenderer } from "./variablesView.js";
const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;
let ignoreViewUpdates = false;
let useCachedEvaluation = false;
let WatchExpressionsView = class extends ViewPane {
  constructor(options, contextMenuService, debugService, keybindingService, instantiationService, viewDescriptorService, configurationService, contextKeyService, openerService, themeService, hoverService, menuService, logService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.debugService = debugService;
    this.menuService = menuService;
    this.logService = logService;
    this.needsRefresh = false;
    this.watchExpressionsUpdatedScheduler = this._register(new RunOnceScheduler(() => {
      this.needsRefresh = false;
      this.tree.updateChildren();
    }, 50));
    this.watchExpressionsExist = CONTEXT_WATCH_EXPRESSIONS_EXIST.bindTo(contextKeyService);
    this.watchExpressionsExist.set(this.debugService.getModel().getWatchExpressions().length > 0);
    this.expressionRenderer = instantiationService.createInstance(DebugExpressionRenderer);
  }
  get treeSelection() {
    return this.tree.getSelection();
  }
  renderBody(container) {
    super.renderBody(container);
    this.element.classList.add("debug-pane");
    container.classList.add("debug-watch");
    const treeContainer = renderViewTree(container);
    const expressionsRenderer = this.instantiationService.createInstance(WatchExpressionsRenderer, this.expressionRenderer);
    this.tree = this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "WatchExpressions",
      treeContainer,
      new WatchExpressionsDelegate(),
      [
        expressionsRenderer,
        this.instantiationService.createInstance(VariablesRenderer, this.expressionRenderer),
        this.instantiationService.createInstance(VisualizedVariableRenderer, this.expressionRenderer)
      ],
      this.instantiationService.createInstance(WatchExpressionsDataSource),
      {
        accessibilityProvider: new WatchExpressionsAccessibilityProvider(),
        identityProvider: { getId: (element) => element.getId() },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (e) => {
            if (e === this.debugService.getViewModel().getSelectedExpression()?.expression) {
              return void 0;
            }
            return expressionAndScopeLabelProvider.getKeyboardNavigationLabel(e);
          }
        },
        dnd: new WatchExpressionsDragAndDrop(this.debugService),
        overrideStyles: this.getLocationBasedColors().listOverrideStyles
      }
    );
    this._register(this.tree);
    this.tree.setInput(this.debugService);
    CONTEXT_WATCH_EXPRESSIONS_FOCUSED.bindTo(this.tree.contextKeyService);
    this._register(VisualizedVariableRenderer.rendererOnVisualizationRange(this.debugService.getViewModel(), this.tree));
    this._register(this.tree.onContextMenu((e) => this.onContextMenu(e)));
    this._register(this.tree.onMouseDblClick((e) => this.onMouseDblClick(e)));
    this._register(this.debugService.getModel().onDidChangeWatchExpressions(async (we) => {
      this.watchExpressionsExist.set(this.debugService.getModel().getWatchExpressions().length > 0);
      if (!this.isBodyVisible()) {
        this.needsRefresh = true;
      } else {
        if (we && !we.name) {
          useCachedEvaluation = true;
        }
        await this.tree.updateChildren();
        useCachedEvaluation = false;
        if (we instanceof Expression) {
          this.tree.reveal(we);
        }
      }
    }));
    this._register(this.debugService.getViewModel().onDidFocusStackFrame(() => {
      if (!this.isBodyVisible()) {
        this.needsRefresh = true;
        return;
      }
      if (!this.watchExpressionsUpdatedScheduler.isScheduled()) {
        this.watchExpressionsUpdatedScheduler.schedule();
      }
    }));
    this._register(this.debugService.getViewModel().onWillUpdateViews(() => {
      if (!ignoreViewUpdates) {
        this.tree.updateChildren();
      }
    }));
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible && this.needsRefresh) {
        this.watchExpressionsUpdatedScheduler.schedule();
      }
    }));
    let horizontalScrolling;
    this._register(this.debugService.getViewModel().onDidSelectExpression((e) => {
      const expression = e?.expression;
      if (expression && this.tree.hasNode(expression)) {
        horizontalScrolling = this.tree.options.horizontalScrolling;
        if (horizontalScrolling) {
          this.tree.updateOptions({ horizontalScrolling: false });
        }
        if (expression.name) {
          this.tree.rerender(expression);
        }
      } else if (!expression && horizontalScrolling !== void 0) {
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
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.tree.layout(height, width);
  }
  focus() {
    super.focus();
    this.tree.domFocus();
  }
  collapseAll() {
    this.tree.collapseAll();
  }
  onMouseDblClick(e) {
    if (e.browserEvent.target.className.indexOf("twistie") >= 0) {
      return;
    }
    const element = e.element;
    const selectedExpression = this.debugService.getViewModel().getSelectedExpression();
    if (element instanceof Expression && element !== selectedExpression?.expression || element instanceof VisualizedExpression && element.treeItem.canEdit) {
      this.debugService.getViewModel().setSelectedExpression(element, false);
    } else if (!element) {
      this.debugService.addWatchExpression();
    }
  }
  async onContextMenu(e) {
    const element = e.element;
    if (!element) {
      return;
    }
    const selection = this.tree.getSelection();
    const contextKeyService = element && await getContextForWatchExpressionMenuWithDataAccess(this.contextKeyService, element, this.debugService, this.logService);
    const menu = this.menuService.getMenuActions(MenuId.DebugWatchContext, contextKeyService, { arg: element, shouldForwardArgs: false });
    const { secondary } = getContextMenuActions(menu, "inline");
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => secondary,
      getActionsContext: () => element && selection.includes(element) ? selection : element ? [element] : []
    });
  }
};
WatchExpressionsView = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IDebugService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IThemeService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, IMenuService),
  __decorateParam(12, ILogService)
], WatchExpressionsView);
class WatchExpressionsDelegate {
  getHeight(_element) {
    return 22;
  }
  getTemplateId(element) {
    if (element instanceof Expression) {
      return WatchExpressionsRenderer.ID;
    }
    if (element instanceof VisualizedExpression) {
      return VisualizedVariableRenderer.ID;
    }
    return VariablesRenderer.ID;
  }
}
function isDebugService(element) {
  return typeof element.getConfigurationManager === "function";
}
class WatchExpressionsDataSource extends AbstractExpressionDataSource {
  hasChildren(element) {
    return isDebugService(element) || element.hasChildren;
  }
  doGetChildren(element) {
    if (isDebugService(element)) {
      const debugService = element;
      const watchExpressions = debugService.getModel().getWatchExpressions();
      const viewModel = debugService.getViewModel();
      return Promise.all(watchExpressions.map((we) => !!we.name && !useCachedEvaluation ? we.evaluate(viewModel.focusedSession, viewModel.focusedStackFrame, "watch").then(() => we) : Promise.resolve(we)));
    }
    return element.getChildren();
  }
}
let WatchExpressionsRenderer = class extends AbstractExpressionsRenderer {
  constructor(expressionRenderer, menuService, contextKeyService, debugService, contextViewService, hoverService, configurationService) {
    super(debugService, contextViewService, hoverService);
    this.expressionRenderer = expressionRenderer;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
  }
  get templateId() {
    return WatchExpressionsRenderer.ID;
  }
  renderElement(node, index, data) {
    data.elementDisposable.clear();
    data.elementDisposable.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("debug.showVariableTypes")) {
        super.renderExpressionElement(node.element, node, data);
      }
    }));
    super.renderExpressionElement(node.element, node, data);
  }
  renderExpression(expression, data, highlights) {
    let text;
    data.type.textContent = "";
    const showType = this.configurationService.getValue("debug").showVariableTypes;
    if (showType && expression.type) {
      text = typeof expression.value === "string" ? `${expression.name}: ` : expression.name;
      data.type.textContent = expression.type + " =";
    } else {
      text = typeof expression.value === "string" ? `${expression.name} =` : expression.name;
    }
    let title;
    if (expression.type) {
      if (showType) {
        title = `${expression.name}`;
      } else {
        title = expression.type === expression.value ? expression.type : `${expression.type}`;
      }
    } else {
      title = expression.value;
    }
    data.label.set(text, highlights, title);
    data.elementDisposable.add(this.expressionRenderer.renderValue(data.value, expression, {
      showChanged: true,
      maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET,
      colorize: true,
      session: expression.getSession()
    }));
  }
  getInputBoxOptions(expression, settingValue) {
    if (settingValue) {
      return {
        initialValue: expression.value,
        ariaLabel: localize("typeNewValue", "Type new value"),
        onFinish: async (value, success) => {
          if (success && value) {
            const focusedFrame = this.debugService.getViewModel().focusedStackFrame;
            if (focusedFrame && (expression instanceof Variable || expression instanceof Expression)) {
              await expression.setExpression(value, focusedFrame);
              this.debugService.getViewModel().updateViews();
            }
          }
        }
      };
    }
    return {
      initialValue: expression.name ? expression.name : "",
      ariaLabel: localize("watchExpressionInputAriaLabel", "Type watch expression"),
      placeholder: localize("watchExpressionPlaceholder", "Expression to watch"),
      onFinish: (value, success) => {
        if (success && value) {
          this.debugService.renameWatchExpression(expression.getId(), value);
          ignoreViewUpdates = true;
          this.debugService.getViewModel().updateViews();
          ignoreViewUpdates = false;
        } else if (!expression.name) {
          this.debugService.removeWatchExpressions(expression.getId());
        }
      }
    };
  }
  renderActionBar(actionBar, expression) {
    const contextKeyService = getContextForWatchExpressionMenu(this.contextKeyService, expression);
    const context = expression;
    const menu = this.menuService.getMenuActions(MenuId.DebugWatchContext, contextKeyService, { arg: context, shouldForwardArgs: false });
    const { primary } = getContextMenuActions(menu, "inline");
    actionBar.clear();
    actionBar.context = context;
    actionBar.push(primary, { icon: true, label: false });
  }
};
WatchExpressionsRenderer.ID = "watchexpression";
WatchExpressionsRenderer = __decorateClass([
  __decorateParam(1, IMenuService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IDebugService),
  __decorateParam(4, IContextViewService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IConfigurationService)
], WatchExpressionsRenderer);
function getContextForWatchExpressionMenu(parentContext, expression, additionalContext = []) {
  const session = expression.getSession();
  return parentContext.createOverlay([
    [CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT.key, "evaluateName" in expression],
    [CONTEXT_WATCH_ITEM_TYPE.key, expression instanceof Expression ? "expression" : expression instanceof Variable ? "variable" : void 0],
    [CONTEXT_CAN_VIEW_MEMORY.key, !!session?.capabilities.supportsReadMemoryRequest && expression.memoryReference !== void 0],
    [CONTEXT_VARIABLE_IS_READONLY.key, !!expression.presentationHint?.attributes?.includes("readOnly") || expression.presentationHint?.lazy],
    [CONTEXT_VARIABLE_TYPE.key, expression.type],
    [CONTEXT_DEBUG_TYPE.key, session?.configuration.type],
    ...additionalContext
  ]);
}
async function getContextForWatchExpressionMenuWithDataAccess(parentContext, expression, debugService, logService) {
  const session = expression.getSession();
  if (!session || !session.capabilities.supportsDataBreakpoints) {
    return getContextForWatchExpressionMenu(parentContext, expression);
  }
  const contextKeys = [];
  const stackFrame = debugService.getViewModel().focusedStackFrame;
  let dataBreakpointInfoResponse;
  try {
    if ("evaluateName" in expression && expression.evaluateName) {
      dataBreakpointInfoResponse = await session.dataBreakpointInfo(
        expression.evaluateName,
        void 0,
        stackFrame?.frameId
      );
    } else if (expression instanceof Variable) {
      dataBreakpointInfoResponse = await session.dataBreakpointInfo(
        expression.name,
        expression.parent.reference,
        stackFrame?.frameId
      );
    } else {
      dataBreakpointInfoResponse = await session.dataBreakpointInfo(
        expression.name,
        void 0,
        stackFrame?.frameId
      );
    }
  } catch (error) {
    logService.error("Failed to get data breakpoint info for watch expression:", error);
  }
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
  return getContextForWatchExpressionMenu(parentContext, expression, contextKeys);
}
class WatchExpressionsAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize({ comment: ["Debug is a noun in this context, not a verb."], key: "watchAriaTreeLabel" }, "Debug Watch Expressions");
  }
  getAriaLabel(element) {
    if (element instanceof Expression) {
      return localize("watchExpressionAriaLabel", "{0}, value {1}", element.name, element.value);
    }
    return localize("watchVariableAriaLabel", "{0}, value {1}", element.name, element.value);
  }
}
class WatchExpressionsDragAndDrop {
  constructor(debugService) {
    this.debugService = debugService;
  }
  onDragStart(data, originalEvent) {
    if (data instanceof ElementsDragAndDropData) {
      originalEvent.dataTransfer.setData("text/plain", data.elements[0].name);
    }
  }
  onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
    if (!(data instanceof ElementsDragAndDropData)) {
      return false;
    }
    const expressions = data.elements;
    if (!(expressions.length > 0 && expressions[0] instanceof Expression)) {
      return false;
    }
    let dropEffectPosition = void 0;
    if (targetIndex === void 0) {
      dropEffectPosition = ListDragOverEffectPosition.After;
      targetIndex = -1;
    } else {
      switch (targetSector) {
        case ListViewTargetSector.TOP:
        case ListViewTargetSector.CENTER_TOP:
          dropEffectPosition = ListDragOverEffectPosition.Before;
          break;
        case ListViewTargetSector.CENTER_BOTTOM:
        case ListViewTargetSector.BOTTOM:
          dropEffectPosition = ListDragOverEffectPosition.After;
          break;
      }
    }
    return { accept: true, effect: { type: ListDragOverEffectType.Move, position: dropEffectPosition }, feedback: [targetIndex] };
  }
  getDragURI(element) {
    if (!(element instanceof Expression) || element === this.debugService.getViewModel().getSelectedExpression()?.expression) {
      return null;
    }
    return element.getId();
  }
  getDragLabel(elements) {
    if (elements.length === 1) {
      return elements[0].name;
    }
    return void 0;
  }
  drop(data, targetElement, targetIndex, targetSector, originalEvent) {
    if (!(data instanceof ElementsDragAndDropData)) {
      return;
    }
    const draggedElement = data.elements[0];
    if (!(draggedElement instanceof Expression)) {
      throw new Error("Invalid dragged element");
    }
    const watches = this.debugService.getModel().getWatchExpressions();
    const sourcePosition = watches.indexOf(draggedElement);
    let targetPosition;
    if (targetElement instanceof Expression) {
      targetPosition = watches.indexOf(targetElement);
      switch (targetSector) {
        case ListViewTargetSector.BOTTOM:
        case ListViewTargetSector.CENTER_BOTTOM:
          targetPosition++;
          break;
      }
      if (sourcePosition < targetPosition) {
        targetPosition--;
      }
    } else {
      targetPosition = watches.length - 1;
    }
    this.debugService.moveWatchExpression(draggedElement.getId(), targetPosition);
  }
  dispose() {
  }
}
registerAction2(class Collapse extends ViewAction {
  constructor() {
    super({
      id: "watch.collapse",
      viewId: WATCH_VIEW_ID,
      title: localize("collapse", "Collapse All"),
      f1: false,
      icon: Codicon.collapseAll,
      precondition: CONTEXT_WATCH_EXPRESSIONS_EXIST,
      menu: {
        id: MenuId.ViewTitle,
        order: 30,
        group: "navigation",
        when: ContextKeyExpr.equals("view", WATCH_VIEW_ID)
      }
    });
  }
  runInView(_accessor, view) {
    view.collapseAll();
  }
});
const ADD_WATCH_ID = "workbench.debug.viewlet.action.addWatchExpression";
const ADD_WATCH_LABEL = localize("addWatchExpression", "Add Expression");
registerAction2(class AddWatchExpressionAction extends Action2 {
  constructor() {
    super({
      id: ADD_WATCH_ID,
      title: ADD_WATCH_LABEL,
      f1: false,
      icon: watchExpressionsAdd,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", WATCH_VIEW_ID)
      }
    });
  }
  run(accessor) {
    const debugService = accessor.get(IDebugService);
    debugService.addWatchExpression();
  }
});
const REMOVE_WATCH_EXPRESSIONS_COMMAND_ID = "workbench.debug.viewlet.action.removeAllWatchExpressions";
const REMOVE_WATCH_EXPRESSIONS_LABEL = localize("removeAllWatchExpressions", "Remove All Expressions");
registerAction2(class RemoveAllWatchExpressionsAction extends Action2 {
  constructor() {
    super({
      id: REMOVE_WATCH_EXPRESSIONS_COMMAND_ID,
      // Use old and long id for backwards compatibility
      title: REMOVE_WATCH_EXPRESSIONS_LABEL,
      f1: false,
      icon: watchExpressionsRemoveAll,
      precondition: CONTEXT_WATCH_EXPRESSIONS_EXIST,
      menu: {
        id: MenuId.ViewTitle,
        order: 20,
        group: "navigation",
        when: ContextKeyExpr.equals("view", WATCH_VIEW_ID)
      }
    });
  }
  run(accessor) {
    const debugService = accessor.get(IDebugService);
    debugService.removeWatchExpressions();
  }
});
registerAction2(class CopyExpression extends ViewAction {
  constructor() {
    super({
      id: COPY_WATCH_EXPRESSION_COMMAND_ID,
      title: localize("copyWatchExpression", "Copy Expression"),
      f1: false,
      viewId: WATCH_VIEW_ID,
      precondition: CONTEXT_WATCH_EXPRESSIONS_EXIST,
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC,
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(
          FocusedViewContext.isEqualTo(WATCH_VIEW_ID),
          CONTEXT_EXPRESSION_SELECTED.negate()
        )
      },
      menu: {
        id: MenuId.DebugWatchContext,
        order: 20,
        group: "3_modification",
        when: CONTEXT_WATCH_ITEM_TYPE.isEqualTo("expression")
      }
    });
  }
  runInView(accessor, view, value) {
    const clipboardService = accessor.get(IClipboardService);
    if (!value) {
      value = view.treeSelection.at(-1);
    }
    if (value) {
      clipboardService.writeText(value.name);
    }
  }
});
const COPY_ALL_WATCH_EXPRESSIONS_COMMAND_ID = "workbench.debug.viewlet.action.copyAllWatchExpressions";
registerAction2(class CopyAllWatchExpressions extends ViewAction {
  constructor() {
    super({
      id: COPY_ALL_WATCH_EXPRESSIONS_COMMAND_ID,
      title: localize("copyAllWatchExpressions", "Copy All"),
      f1: false,
      viewId: WATCH_VIEW_ID,
      precondition: CONTEXT_WATCH_EXPRESSIONS_EXIST,
      menu: {
        id: MenuId.DebugWatchContext,
        order: 45,
        group: "3_modification"
      }
    });
  }
  runInView(accessor) {
    const clipboardService = accessor.get(IClipboardService);
    const debugService = accessor.get(IDebugService);
    const watches = debugService.getModel().getWatchExpressions();
    const lines = watches.map((w) => `${w.name}: ${w.value}`);
    clipboardService.writeText(lines.join("\n"));
  }
});
export {
  ADD_WATCH_ID,
  ADD_WATCH_LABEL,
  COPY_ALL_WATCH_EXPRESSIONS_COMMAND_ID,
  REMOVE_WATCH_EXPRESSIONS_COMMAND_ID,
  REMOVE_WATCH_EXPRESSIONS_LABEL,
  WatchExpressionsRenderer,
  WatchExpressionsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvd2F0Y2hFeHByZXNzaW9uc1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJRHJhZ0FuZERyb3BEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJSGlnaGxpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hpZ2hsaWdodGVkbGFiZWwvaGlnaGxpZ2h0ZWRMYWJlbC5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24sIExpc3REcmFnT3ZlckVmZmVjdFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhLCBMaXN0Vmlld1RhcmdldFNlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RWaWV3LmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJVHJlZUNvbnRleHRNZW51RXZlbnQsIElUcmVlRHJhZ0FuZERyb3AsIElUcmVlRHJhZ092ZXJSZWFjdGlvbiwgSVRyZWVNb3VzZUV2ZW50LCBJVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRnV6enlTY29yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZ2V0Q29udGV4dE1lbnVBY3Rpb25zLCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJTWVudVNlcnZpY2UsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlLCBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hBc3luY0RhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld0FjdGlvbiwgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3bGV0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdzVmlld2xldC5qcyc7XG5pbXBvcnQgeyBGb2N1c2VkVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0NBTl9WSUVXX01FTU9SWSwgQ09OVEVYVF9FWFBSRVNTSU9OX1NFTEVDVEVELCBDT05URVhUX1ZBUklBQkxFX0lTX1JFQURPTkxZLCBDT05URVhUX1ZBUklBQkxFX1RZUEUsIENPTlRFWFRfV0FUQ0hfRVhQUkVTU0lPTlNfRVhJU1QsIENPTlRFWFRfV0FUQ0hfRVhQUkVTU0lPTlNfRk9DVVNFRCwgQ09OVEVYVF9XQVRDSF9JVEVNX1RZUEUsIElEZWJ1Z0NvbmZpZ3VyYXRpb24sIElEZWJ1Z1NlcnZpY2UsIElEZWJ1Z1ZpZXdXaXRoVmFyaWFibGVzLCBJRXhwcmVzc2lvbiwgQ09OVEVYVF9CUkVBS19XSEVOX1ZBTFVFX0NIQU5HRVNfU1VQUE9SVEVELCBDT05URVhUX0JSRUFLX1dIRU5fVkFMVUVfSVNfQUNDRVNTRURfU1VQUE9SVEVELCBDT05URVhUX0JSRUFLX1dIRU5fVkFMVUVfSVNfUkVBRF9TVVBQT1JURUQsIENPTlRFWFRfVkFSSUFCTEVfRVZBTFVBVEVfTkFNRV9QUkVTRU5ULCBXQVRDSF9WSUVXX0lELCBDT05URVhUX0RFQlVHX1RZUEUgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgRXhwcmVzc2lvbiwgVmFyaWFibGUsIFZpc3VhbGl6ZWRFeHByZXNzaW9uIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnTW9kZWwuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RFeHByZXNzaW9uRGF0YVNvdXJjZSwgQWJzdHJhY3RFeHByZXNzaW9uc1JlbmRlcmVyLCBleHByZXNzaW9uQW5kU2NvcGVMYWJlbFByb3ZpZGVyLCBJRXhwcmVzc2lvblRlbXBsYXRlRGF0YSwgSUlucHV0Qm94T3B0aW9ucywgcmVuZGVyVmlld1RyZWUgfSBmcm9tICcuL2Jhc2VEZWJ1Z1ZpZXcuanMnO1xuaW1wb3J0IHsgQ09QWV9XQVRDSF9FWFBSRVNTSU9OX0NPTU1BTkRfSUQsIHNldERhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlIH0gZnJvbSAnLi9kZWJ1Z0NvbW1hbmRzLmpzJztcbmltcG9ydCB7IERlYnVnRXhwcmVzc2lvblJlbmRlcmVyIH0gZnJvbSAnLi9kZWJ1Z0V4cHJlc3Npb25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyB3YXRjaEV4cHJlc3Npb25zQWRkLCB3YXRjaEV4cHJlc3Npb25zUmVtb3ZlQWxsIH0gZnJvbSAnLi9kZWJ1Z0ljb25zLmpzJztcbmltcG9ydCB7IFZhcmlhYmxlc1JlbmRlcmVyLCBWaXN1YWxpemVkVmFyaWFibGVSZW5kZXJlciB9IGZyb20gJy4vdmFyaWFibGVzVmlldy5qcyc7XG5cbmNvbnN0IE1BWF9WQUxVRV9SRU5ERVJfTEVOR1RIX0lOX1ZJRVdMRVQgPSAxMDI0O1xubGV0IGlnbm9yZVZpZXdVcGRhdGVzID0gZmFsc2U7XG5sZXQgdXNlQ2FjaGVkRXZhbHVhdGlvbiA9IGZhbHNlO1xuXG5leHBvcnQgY2xhc3MgV2F0Y2hFeHByZXNzaW9uc1ZpZXcgZXh0ZW5kcyBWaWV3UGFuZSBpbXBsZW1lbnRzIElEZWJ1Z1ZpZXdXaXRoVmFyaWFibGVzIHtcblxuXHRwcml2YXRlIHdhdGNoRXhwcmVzc2lvbnNVcGRhdGVkU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIG5lZWRzUmVmcmVzaCA9IGZhbHNlO1xuXHRwcml2YXRlIHRyZWUhOiBXb3JrYmVuY2hBc3luY0RhdGFUcmVlPElEZWJ1Z1NlcnZpY2UgfCBJRXhwcmVzc2lvbiwgSUV4cHJlc3Npb24sIEZ1enp5U2NvcmU+O1xuXHRwcml2YXRlIHdhdGNoRXhwcmVzc2lvbnNFeGlzdDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgZXhwcmVzc2lvblJlbmRlcmVyOiBEZWJ1Z0V4cHJlc3Npb25SZW5kZXJlcjtcblxuXHRwdWJsaWMgZ2V0IHRyZWVTZWxlY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5nZXRTZWxlY3Rpb24oKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3bGV0Vmlld09wdGlvbnMsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucywga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cblx0XHR0aGlzLndhdGNoRXhwcmVzc2lvbnNVcGRhdGVkU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5uZWVkc1JlZnJlc2ggPSBmYWxzZTtcblx0XHRcdHRoaXMudHJlZS51cGRhdGVDaGlsZHJlbigpO1xuXHRcdH0sIDUwKSk7XG5cdFx0dGhpcy53YXRjaEV4cHJlc3Npb25zRXhpc3QgPSBDT05URVhUX1dBVENIX0VYUFJFU1NJT05TX0VYSVNULmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy53YXRjaEV4cHJlc3Npb25zRXhpc3Quc2V0KHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0V2F0Y2hFeHByZXNzaW9ucygpLmxlbmd0aCA+IDApO1xuXHRcdHRoaXMuZXhwcmVzc2lvblJlbmRlcmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVidWdFeHByZXNzaW9uUmVuZGVyZXIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdkZWJ1Zy1wYW5lJyk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2RlYnVnLXdhdGNoJyk7XG5cdFx0Y29uc3QgdHJlZUNvbnRhaW5lciA9IHJlbmRlclZpZXdUcmVlKGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBleHByZXNzaW9uc1JlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXYXRjaEV4cHJlc3Npb25zUmVuZGVyZXIsIHRoaXMuZXhwcmVzc2lvblJlbmRlcmVyKTtcblx0XHR0aGlzLnRyZWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8SURlYnVnU2VydmljZSB8IElFeHByZXNzaW9uLCBJRXhwcmVzc2lvbiwgRnV6enlTY29yZT4sICdXYXRjaEV4cHJlc3Npb25zJywgdHJlZUNvbnRhaW5lciwgbmV3IFdhdGNoRXhwcmVzc2lvbnNEZWxlZ2F0ZSgpLFxuXHRcdFx0W1xuXHRcdFx0XHRleHByZXNzaW9uc1JlbmRlcmVyLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFZhcmlhYmxlc1JlbmRlcmVyLCB0aGlzLmV4cHJlc3Npb25SZW5kZXJlciksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVmlzdWFsaXplZFZhcmlhYmxlUmVuZGVyZXIsIHRoaXMuZXhwcmVzc2lvblJlbmRlcmVyKSxcblx0XHRcdF0sXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdhdGNoRXhwcmVzc2lvbnNEYXRhU291cmNlKSwge1xuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgV2F0Y2hFeHByZXNzaW9uc0FjY2Vzc2liaWxpdHlQcm92aWRlcigpLFxuXHRcdFx0aWRlbnRpdHlQcm92aWRlcjogeyBnZXRJZDogKGVsZW1lbnQ6IElFeHByZXNzaW9uKSA9PiBlbGVtZW50LmdldElkKCkgfSxcblx0XHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IHtcblx0XHRcdFx0Z2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWw6IChlOiBJRXhwcmVzc2lvbikgPT4ge1xuXHRcdFx0XHRcdGlmIChlID09PSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5nZXRTZWxlY3RlZEV4cHJlc3Npb24oKT8uZXhwcmVzc2lvbikge1xuXHRcdFx0XHRcdFx0Ly8gRG9uJ3QgZmlsdGVyIGlucHV0IGJveFxuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gZXhwcmVzc2lvbkFuZFNjb3BlTGFiZWxQcm92aWRlci5nZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbChlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGRuZDogbmV3IFdhdGNoRXhwcmVzc2lvbnNEcmFnQW5kRHJvcCh0aGlzLmRlYnVnU2VydmljZSksXG5cdFx0XHRvdmVycmlkZVN0eWxlczogdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCkubGlzdE92ZXJyaWRlU3R5bGVzXG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlKTtcblx0XHR0aGlzLnRyZWUuc2V0SW5wdXQodGhpcy5kZWJ1Z1NlcnZpY2UpO1xuXHRcdENPTlRFWFRfV0FUQ0hfRVhQUkVTU0lPTlNfRk9DVVNFRC5iaW5kVG8odGhpcy50cmVlLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFZpc3VhbGl6ZWRWYXJpYWJsZVJlbmRlcmVyLnJlbmRlcmVyT25WaXN1YWxpemF0aW9uUmFuZ2UodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCksIHRoaXMudHJlZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkNvbnRleHRNZW51KGUgPT4gdGhpcy5vbkNvbnRleHRNZW51KGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uTW91c2VEYmxDbGljayhlID0+IHRoaXMub25Nb3VzZURibENsaWNrKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5vbkRpZENoYW5nZVdhdGNoRXhwcmVzc2lvbnMoYXN5bmMgd2UgPT4ge1xuXHRcdFx0dGhpcy53YXRjaEV4cHJlc3Npb25zRXhpc3Quc2V0KHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0V2F0Y2hFeHByZXNzaW9ucygpLmxlbmd0aCA+IDApO1xuXHRcdFx0aWYgKCF0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0XHR0aGlzLm5lZWRzUmVmcmVzaCA9IHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAod2UgJiYgIXdlLm5hbWUpIHtcblx0XHRcdFx0XHQvLyBXZSBhcmUgYWRkaW5nIGEgbmV3IGlucHV0IGJveCwgbm8gbmVlZCB0byByZS1ldmFsdWF0ZSB3YXRjaCBleHByZXNzaW9uc1xuXHRcdFx0XHRcdHVzZUNhY2hlZEV2YWx1YXRpb24gPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IHRoaXMudHJlZS51cGRhdGVDaGlsZHJlbigpO1xuXHRcdFx0XHR1c2VDYWNoZWRFdmFsdWF0aW9uID0gZmFsc2U7XG5cdFx0XHRcdGlmICh3ZSBpbnN0YW5jZW9mIEV4cHJlc3Npb24pIHtcblx0XHRcdFx0XHR0aGlzLnRyZWUucmV2ZWFsKHdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5vbkRpZEZvY3VzU3RhY2tGcmFtZSgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaXNCb2R5VmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMubmVlZHNSZWZyZXNoID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMud2F0Y2hFeHByZXNzaW9uc1VwZGF0ZWRTY2hlZHVsZXIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHR0aGlzLndhdGNoRXhwcmVzc2lvbnNVcGRhdGVkU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLm9uV2lsbFVwZGF0ZVZpZXdzKCgpID0+IHtcblx0XHRcdGlmICghaWdub3JlVmlld1VwZGF0ZXMpIHtcblx0XHRcdFx0dGhpcy50cmVlLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5KHZpc2libGUgPT4ge1xuXHRcdFx0aWYgKHZpc2libGUgJiYgdGhpcy5uZWVkc1JlZnJlc2gpIHtcblx0XHRcdFx0dGhpcy53YXRjaEV4cHJlc3Npb25zVXBkYXRlZFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRsZXQgaG9yaXpvbnRhbFNjcm9sbGluZzogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5vbkRpZFNlbGVjdEV4cHJlc3Npb24oZSA9PiB7XG5cdFx0XHRjb25zdCBleHByZXNzaW9uID0gZT8uZXhwcmVzc2lvbjtcblx0XHRcdGlmIChleHByZXNzaW9uICYmIHRoaXMudHJlZS5oYXNOb2RlKGV4cHJlc3Npb24pKSB7XG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmcgPSB0aGlzLnRyZWUub3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsaW5nO1xuXHRcdFx0XHRpZiAoaG9yaXpvbnRhbFNjcm9sbGluZykge1xuXHRcdFx0XHRcdHRoaXMudHJlZS51cGRhdGVPcHRpb25zKHsgaG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZXhwcmVzc2lvbi5uYW1lKSB7XG5cdFx0XHRcdFx0Ly8gT25seSByZXJlbmRlciBpZiB0aGUgaW5wdXQgaXMgYWxyZWFkeSBkb25lIHNpbmNlIG90aGVyd2lzZSB0aGUgdHJlZSBpcyBub3QgeWV0IGF3YXJlIG9mIHRoZSBuZXcgZWxlbWVudFxuXHRcdFx0XHRcdHRoaXMudHJlZS5yZXJlbmRlcihleHByZXNzaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICghZXhwcmVzc2lvbiAmJiBob3Jpem9udGFsU2Nyb2xsaW5nICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy50cmVlLnVwZGF0ZU9wdGlvbnMoeyBob3Jpem9udGFsU2Nyb2xsaW5nOiBob3Jpem9udGFsU2Nyb2xsaW5nIH0pO1xuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLm9uRGlkRXZhbHVhdGVMYXp5RXhwcmVzc2lvbihhc3luYyBlID0+IHtcblx0XHRcdGlmIChlIGluc3RhbmNlb2YgVmFyaWFibGUgJiYgdGhpcy50cmVlLmhhc05vZGUoZSkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLnVwZGF0ZUNoaWxkcmVuKGUsIGZhbHNlLCB0cnVlKTtcblx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLmV4cGFuZChlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy50cmVlLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdH1cblxuXHRjb2xsYXBzZUFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuY29sbGFwc2VBbGwoKTtcblx0fVxuXG5cdHByaXZhdGUgb25Nb3VzZURibENsaWNrKGU6IElUcmVlTW91c2VFdmVudDxJRXhwcmVzc2lvbj4pOiB2b2lkIHtcblx0XHRpZiAoKGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xhc3NOYW1lLmluZGV4T2YoJ3R3aXN0aWUnKSA+PSAwKSB7XG5cdFx0XHQvLyBJZ25vcmUgZG91YmxlIGNsaWNrIGV2ZW50cyBvbiB0d2lzdGllXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxlbWVudCA9IGUuZWxlbWVudDtcblx0XHQvLyBkb3VibGUgY2xpY2sgb24gcHJpbWl0aXZlIHZhbHVlOiBvcGVuIGlucHV0IGJveCB0byBiZSBhYmxlIHRvIHNlbGVjdCBhbmQgY29weSB2YWx1ZS5cblx0XHRjb25zdCBzZWxlY3RlZEV4cHJlc3Npb24gPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5nZXRTZWxlY3RlZEV4cHJlc3Npb24oKTtcblx0XHRpZiAoKGVsZW1lbnQgaW5zdGFuY2VvZiBFeHByZXNzaW9uICYmIGVsZW1lbnQgIT09IHNlbGVjdGVkRXhwcmVzc2lvbj8uZXhwcmVzc2lvbikgfHwgKGVsZW1lbnQgaW5zdGFuY2VvZiBWaXN1YWxpemVkRXhwcmVzc2lvbiAmJiBlbGVtZW50LnRyZWVJdGVtLmNhbkVkaXQpKSB7XG5cdFx0XHR0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5zZXRTZWxlY3RlZEV4cHJlc3Npb24oZWxlbWVudCwgZmFsc2UpO1xuXHRcdH0gZWxzZSBpZiAoIWVsZW1lbnQpIHtcblx0XHRcdC8vIERvdWJsZSBjbGljayBpbiB3YXRjaCBwYW5lbCB0cmlnZ2VycyB0byBhZGQgYSBuZXcgd2F0Y2ggZXhwcmVzc2lvblxuXHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuYWRkV2F0Y2hFeHByZXNzaW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkNvbnRleHRNZW51KGU6IElUcmVlQ29udGV4dE1lbnVFdmVudDxJRXhwcmVzc2lvbj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50O1xuXHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMudHJlZS5nZXRTZWxlY3Rpb24oKTtcblxuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gZWxlbWVudCAmJiBhd2FpdCBnZXRDb250ZXh0Rm9yV2F0Y2hFeHByZXNzaW9uTWVudVdpdGhEYXRhQWNjZXNzKHRoaXMuY29udGV4dEtleVNlcnZpY2UsIGVsZW1lbnQsIHRoaXMuZGVidWdTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5EZWJ1Z1dhdGNoQ29udGV4dCwgY29udGV4dEtleVNlcnZpY2UsIHsgYXJnOiBlbGVtZW50LCBzaG91bGRGb3J3YXJkQXJnczogZmFsc2UgfSk7XG5cdFx0Y29uc3QgeyBzZWNvbmRhcnkgfSA9IGdldENvbnRleHRNZW51QWN0aW9ucyhtZW51LCAnaW5saW5lJyk7XG5cblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHNlY29uZGFyeSxcblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBlbGVtZW50ICYmIHNlbGVjdGlvbi5pbmNsdWRlcyhlbGVtZW50KSA/IHNlbGVjdGlvbiA6IGVsZW1lbnQgPyBbZWxlbWVudF0gOiBbXVxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIFdhdGNoRXhwcmVzc2lvbnNEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPElFeHByZXNzaW9uPiB7XG5cblx0Z2V0SGVpZ2h0KF9lbGVtZW50OiBJRXhwcmVzc2lvbik6IG51bWJlciB7XG5cdFx0cmV0dXJuIDIyO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBJRXhwcmVzc2lvbik6IHN0cmluZyB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBFeHByZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gV2F0Y2hFeHByZXNzaW9uc1JlbmRlcmVyLklEO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgVmlzdWFsaXplZEV4cHJlc3Npb24pIHtcblx0XHRcdHJldHVybiBWaXN1YWxpemVkVmFyaWFibGVSZW5kZXJlci5JRDtcblx0XHR9XG5cblx0XHQvLyBWYXJpYWJsZVxuXHRcdHJldHVybiBWYXJpYWJsZXNSZW5kZXJlci5JRDtcblx0fVxufVxuXG5mdW5jdGlvbiBpc0RlYnVnU2VydmljZShlbGVtZW50OiBhbnkpOiBlbGVtZW50IGlzIElEZWJ1Z1NlcnZpY2Uge1xuXHRyZXR1cm4gdHlwZW9mIGVsZW1lbnQuZ2V0Q29uZmlndXJhdGlvbk1hbmFnZXIgPT09ICdmdW5jdGlvbic7XG59XG5cbmNsYXNzIFdhdGNoRXhwcmVzc2lvbnNEYXRhU291cmNlIGV4dGVuZHMgQWJzdHJhY3RFeHByZXNzaW9uRGF0YVNvdXJjZTxJRGVidWdTZXJ2aWNlLCBJRXhwcmVzc2lvbj4ge1xuXG5cdHB1YmxpYyBvdmVycmlkZSBoYXNDaGlsZHJlbihlbGVtZW50OiBJRXhwcmVzc2lvbiB8IElEZWJ1Z1NlcnZpY2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNEZWJ1Z1NlcnZpY2UoZWxlbWVudCkgfHwgZWxlbWVudC5oYXNDaGlsZHJlbjtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBkb0dldENoaWxkcmVuKGVsZW1lbnQ6IElEZWJ1Z1NlcnZpY2UgfCBJRXhwcmVzc2lvbik6IFByb21pc2U8QXJyYXk8SUV4cHJlc3Npb24+PiB7XG5cdFx0aWYgKGlzRGVidWdTZXJ2aWNlKGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBlbGVtZW50O1xuXHRcdFx0Y29uc3Qgd2F0Y2hFeHByZXNzaW9ucyA9IGRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFdhdGNoRXhwcmVzc2lvbnMoKTtcblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKTtcblx0XHRcdHJldHVybiBQcm9taXNlLmFsbCh3YXRjaEV4cHJlc3Npb25zLm1hcCh3ZSA9PiAhIXdlLm5hbWUgJiYgIXVzZUNhY2hlZEV2YWx1YXRpb25cblx0XHRcdFx0PyB3ZS5ldmFsdWF0ZSh2aWV3TW9kZWwuZm9jdXNlZFNlc3Npb24hLCB2aWV3TW9kZWwuZm9jdXNlZFN0YWNrRnJhbWUhLCAnd2F0Y2gnKS50aGVuKCgpID0+IHdlKVxuXHRcdFx0XHQ6IFByb21pc2UucmVzb2x2ZSh3ZSkpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWxlbWVudC5nZXRDaGlsZHJlbigpO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIFdhdGNoRXhwcmVzc2lvbnNSZW5kZXJlciBleHRlbmRzIEFic3RyYWN0RXhwcmVzc2lvbnNSZW5kZXJlciB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dhdGNoZXhwcmVzc2lvbic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHByZXNzaW9uUmVuZGVyZXI6IERlYnVnRXhwcmVzc2lvblJlbmRlcmVyLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJRGVidWdTZXJ2aWNlIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihkZWJ1Z1NlcnZpY2UsIGNvbnRleHRWaWV3U2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblx0fVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCkge1xuXHRcdHJldHVybiBXYXRjaEV4cHJlc3Npb25zUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUV4cHJlc3Npb24sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCBkYXRhOiBJRXhwcmVzc2lvblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlLmFkZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdkZWJ1Zy5zaG93VmFyaWFibGVUeXBlcycpKSB7XG5cdFx0XHRcdHN1cGVyLnJlbmRlckV4cHJlc3Npb25FbGVtZW50KG5vZGUuZWxlbWVudCwgbm9kZSwgZGF0YSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHN1cGVyLnJlbmRlckV4cHJlc3Npb25FbGVtZW50KG5vZGUuZWxlbWVudCwgbm9kZSwgZGF0YSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVyRXhwcmVzc2lvbihleHByZXNzaW9uOiBJRXhwcmVzc2lvbiwgZGF0YTogSUV4cHJlc3Npb25UZW1wbGF0ZURhdGEsIGhpZ2hsaWdodHM6IElIaWdobGlnaHRbXSk6IHZvaWQge1xuXHRcdGxldCB0ZXh0OiBzdHJpbmc7XG5cdFx0ZGF0YS50eXBlLnRleHRDb250ZW50ID0gJyc7XG5cdFx0Y29uc3Qgc2hvd1R5cGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLnNob3dWYXJpYWJsZVR5cGVzO1xuXHRcdGlmIChzaG93VHlwZSAmJiBleHByZXNzaW9uLnR5cGUpIHtcblx0XHRcdHRleHQgPSB0eXBlb2YgZXhwcmVzc2lvbi52YWx1ZSA9PT0gJ3N0cmluZycgPyBgJHtleHByZXNzaW9uLm5hbWV9OiBgIDogZXhwcmVzc2lvbi5uYW1lO1xuXHRcdFx0Ly9yZW5kZXIgdHlwZVxuXHRcdFx0ZGF0YS50eXBlLnRleHRDb250ZW50ID0gZXhwcmVzc2lvbi50eXBlICsgJyA9Jztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGV4dCA9IHR5cGVvZiBleHByZXNzaW9uLnZhbHVlID09PSAnc3RyaW5nJyA/IGAke2V4cHJlc3Npb24ubmFtZX0gPWAgOiBleHByZXNzaW9uLm5hbWU7XG5cdFx0fVxuXG5cdFx0bGV0IHRpdGxlOiBzdHJpbmc7XG5cdFx0aWYgKGV4cHJlc3Npb24udHlwZSkge1xuXHRcdFx0aWYgKHNob3dUeXBlKSB7XG5cdFx0XHRcdHRpdGxlID0gYCR7ZXhwcmVzc2lvbi5uYW1lfWA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aXRsZSA9IGV4cHJlc3Npb24udHlwZSA9PT0gZXhwcmVzc2lvbi52YWx1ZSA/XG5cdFx0XHRcdFx0ZXhwcmVzc2lvbi50eXBlIDpcblx0XHRcdFx0XHRgJHtleHByZXNzaW9uLnR5cGV9YDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGl0bGUgPSBleHByZXNzaW9uLnZhbHVlO1xuXHRcdH1cblxuXHRcdGRhdGEubGFiZWwuc2V0KHRleHQsIGhpZ2hsaWdodHMsIHRpdGxlKTtcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlLmFkZCh0aGlzLmV4cHJlc3Npb25SZW5kZXJlci5yZW5kZXJWYWx1ZShkYXRhLnZhbHVlLCBleHByZXNzaW9uLCB7XG5cdFx0XHRzaG93Q2hhbmdlZDogdHJ1ZSxcblx0XHRcdG1heFZhbHVlTGVuZ3RoOiBNQVhfVkFMVUVfUkVOREVSX0xFTkdUSF9JTl9WSUVXTEVULFxuXHRcdFx0Y29sb3JpemU6IHRydWUsXG5cdFx0XHRzZXNzaW9uOiBleHByZXNzaW9uLmdldFNlc3Npb24oKSxcblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0SW5wdXRCb3hPcHRpb25zKGV4cHJlc3Npb246IElFeHByZXNzaW9uLCBzZXR0aW5nVmFsdWU6IGJvb2xlYW4pOiBJSW5wdXRCb3hPcHRpb25zIHtcblx0XHRpZiAoc2V0dGluZ1ZhbHVlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpbml0aWFsVmFsdWU6IGV4cHJlc3Npb24udmFsdWUsXG5cdFx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ3R5cGVOZXdWYWx1ZScsIFwiVHlwZSBuZXcgdmFsdWVcIiksXG5cdFx0XHRcdG9uRmluaXNoOiBhc3luYyAodmFsdWU6IHN0cmluZywgc3VjY2VzczogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRcdGlmIChzdWNjZXNzICYmIHZhbHVlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBmb2N1c2VkRnJhbWUgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRcdFx0XHRcdGlmIChmb2N1c2VkRnJhbWUgJiYgKGV4cHJlc3Npb24gaW5zdGFuY2VvZiBWYXJpYWJsZSB8fCBleHByZXNzaW9uIGluc3RhbmNlb2YgRXhwcmVzc2lvbikpIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgZXhwcmVzc2lvbi5zZXRFeHByZXNzaW9uKHZhbHVlLCBmb2N1c2VkRnJhbWUpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS51cGRhdGVWaWV3cygpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5pdGlhbFZhbHVlOiBleHByZXNzaW9uLm5hbWUgPyBleHByZXNzaW9uLm5hbWUgOiAnJyxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ3dhdGNoRXhwcmVzc2lvbklucHV0QXJpYUxhYmVsJywgXCJUeXBlIHdhdGNoIGV4cHJlc3Npb25cIiksXG5cdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ3dhdGNoRXhwcmVzc2lvblBsYWNlaG9sZGVyJywgXCJFeHByZXNzaW9uIHRvIHdhdGNoXCIpLFxuXHRcdFx0b25GaW5pc2g6ICh2YWx1ZTogc3RyaW5nLCBzdWNjZXNzOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdGlmIChzdWNjZXNzICYmIHZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UucmVuYW1lV2F0Y2hFeHByZXNzaW9uKGV4cHJlc3Npb24uZ2V0SWQoKSwgdmFsdWUpO1xuXHRcdFx0XHRcdGlnbm9yZVZpZXdVcGRhdGVzID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS51cGRhdGVWaWV3cygpO1xuXHRcdFx0XHRcdGlnbm9yZVZpZXdVcGRhdGVzID0gZmFsc2U7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIWV4cHJlc3Npb24ubmFtZSkge1xuXHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLnJlbW92ZVdhdGNoRXhwcmVzc2lvbnMoZXhwcmVzc2lvbi5nZXRJZCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQWN0aW9uQmFyKGFjdGlvbkJhcjogQWN0aW9uQmFyLCBleHByZXNzaW9uOiBJRXhwcmVzc2lvbikge1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gZ2V0Q29udGV4dEZvcldhdGNoRXhwcmVzc2lvbk1lbnUodGhpcy5jb250ZXh0S2V5U2VydmljZSwgZXhwcmVzc2lvbik7XG5cdFx0Y29uc3QgY29udGV4dCA9IGV4cHJlc3Npb247XG5cdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLkRlYnVnV2F0Y2hDb250ZXh0LCBjb250ZXh0S2V5U2VydmljZSwgeyBhcmc6IGNvbnRleHQsIHNob3VsZEZvcndhcmRBcmdzOiBmYWxzZSB9KTtcblxuXHRcdGNvbnN0IHsgcHJpbWFyeSB9ID0gZ2V0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnUsICdpbmxpbmUnKTtcblxuXHRcdGFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGFjdGlvbkJhci5jb250ZXh0ID0gY29udGV4dDtcblx0XHRhY3Rpb25CYXIucHVzaChwcmltYXJ5LCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0fVxufVxuXG4vKipcbiAqIEdldHMgYSBjb250ZXh0IGtleSBvdmVybGF5IHRoYXQgaGFzIGNvbnRleHQgZm9yIHRoZSBnaXZlbiBleHByZXNzaW9uLlxuICovXG5mdW5jdGlvbiBnZXRDb250ZXh0Rm9yV2F0Y2hFeHByZXNzaW9uTWVudShwYXJlbnRDb250ZXh0OiBJQ29udGV4dEtleVNlcnZpY2UsIGV4cHJlc3Npb246IElFeHByZXNzaW9uLCBhZGRpdGlvbmFsQ29udGV4dDogW3N0cmluZywgdW5rbm93bl1bXSA9IFtdKSB7XG5cdGNvbnN0IHNlc3Npb24gPSBleHByZXNzaW9uLmdldFNlc3Npb24oKTtcblx0cmV0dXJuIHBhcmVudENvbnRleHQuY3JlYXRlT3ZlcmxheShbXG5cdFx0W0NPTlRFWFRfVkFSSUFCTEVfRVZBTFVBVEVfTkFNRV9QUkVTRU5ULmtleSwgJ2V2YWx1YXRlTmFtZScgaW4gZXhwcmVzc2lvbl0sXG5cdFx0W0NPTlRFWFRfV0FUQ0hfSVRFTV9UWVBFLmtleSwgZXhwcmVzc2lvbiBpbnN0YW5jZW9mIEV4cHJlc3Npb24gPyAnZXhwcmVzc2lvbicgOiBleHByZXNzaW9uIGluc3RhbmNlb2YgVmFyaWFibGUgPyAndmFyaWFibGUnIDogdW5kZWZpbmVkXSxcblx0XHRbQ09OVEVYVF9DQU5fVklFV19NRU1PUlkua2V5LCAhIXNlc3Npb24/LmNhcGFiaWxpdGllcy5zdXBwb3J0c1JlYWRNZW1vcnlSZXF1ZXN0ICYmIGV4cHJlc3Npb24ubWVtb3J5UmVmZXJlbmNlICE9PSB1bmRlZmluZWRdLFxuXHRcdFtDT05URVhUX1ZBUklBQkxFX0lTX1JFQURPTkxZLmtleSwgISFleHByZXNzaW9uLnByZXNlbnRhdGlvbkhpbnQ/LmF0dHJpYnV0ZXM/LmluY2x1ZGVzKCdyZWFkT25seScpIHx8IGV4cHJlc3Npb24ucHJlc2VudGF0aW9uSGludD8ubGF6eV0sXG5cdFx0W0NPTlRFWFRfVkFSSUFCTEVfVFlQRS5rZXksIGV4cHJlc3Npb24udHlwZV0sXG5cdFx0W0NPTlRFWFRfREVCVUdfVFlQRS5rZXksIHNlc3Npb24/LmNvbmZpZ3VyYXRpb24udHlwZV0sXG5cdFx0Li4uYWRkaXRpb25hbENvbnRleHRcblx0XSk7XG59XG5cbi8qKlxuICogR2V0cyBhIGNvbnRleHQga2V5IG92ZXJsYXkgdGhhdCBoYXMgY29udGV4dCBmb3IgdGhlIGdpdmVuIGV4cHJlc3Npb24sIGluY2x1ZGluZyBkYXRhIGFjY2VzcyBpbmZvLlxuICovXG5hc3luYyBmdW5jdGlvbiBnZXRDb250ZXh0Rm9yV2F0Y2hFeHByZXNzaW9uTWVudVdpdGhEYXRhQWNjZXNzKHBhcmVudENvbnRleHQ6IElDb250ZXh0S2V5U2VydmljZSwgZXhwcmVzc2lvbjogSUV4cHJlc3Npb24sIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpIHtcblx0Y29uc3Qgc2Vzc2lvbiA9IGV4cHJlc3Npb24uZ2V0U2Vzc2lvbigpO1xuXHRpZiAoIXNlc3Npb24gfHwgIXNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzRGF0YUJyZWFrcG9pbnRzKSB7XG5cdFx0cmV0dXJuIGdldENvbnRleHRGb3JXYXRjaEV4cHJlc3Npb25NZW51KHBhcmVudENvbnRleHQsIGV4cHJlc3Npb24pO1xuXHR9XG5cblx0Y29uc3QgY29udGV4dEtleXM6IFtzdHJpbmcsIHVua25vd25dW10gPSBbXTtcblx0Y29uc3Qgc3RhY2tGcmFtZSA9IGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0bGV0IGRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlO1xuXG5cdHRyeSB7XG5cdFx0Ly8gUGVyIERBUCBzcGVjOlxuXHRcdC8vIC0gSWYgZXZhbHVhdGVOYW1lIGlzIGF2YWlsYWJsZTogdXNlIGl0IGFzIGFuIGV4cHJlc3Npb24gKHRvcC1sZXZlbCBldmFsdWF0aW9uKVxuXHRcdC8vIC0gT3RoZXJ3aXNlLCBjaGVjayBpZiBpdCdzIGEgVmFyaWFibGU6IHVzZSBuYW1lICsgcGFyZW50IHJlZmVyZW5jZSAoY29udGFpbmVyLXJlbGF0aXZlKVxuXHRcdC8vIC0gT3RoZXJ3aXNlOiB1c2UgbmFtZSBhcyBhbiBleHByZXNzaW9uXG5cdFx0aWYgKCdldmFsdWF0ZU5hbWUnIGluIGV4cHJlc3Npb24gJiYgZXhwcmVzc2lvbi5ldmFsdWF0ZU5hbWUpIHtcblx0XHRcdC8vIFVzZSBldmFsdWF0ZU5hbWUgaWYgYXZhaWxhYmxlIChtb3JlIHByZWNpc2UgZm9yIGV2YWx1YXRpb24gY29udGV4dClcblx0XHRcdGRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlID0gYXdhaXQgc2Vzc2lvbi5kYXRhQnJlYWtwb2ludEluZm8oXG5cdFx0XHRcdGV4cHJlc3Npb24uZXZhbHVhdGVOYW1lIGFzIHN0cmluZyxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRzdGFja0ZyYW1lPy5mcmFtZUlkXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSBpZiAoZXhwcmVzc2lvbiBpbnN0YW5jZW9mIFZhcmlhYmxlKSB7XG5cdFx0XHQvLyBWYXJpYWJsZSB3aXRob3V0IGV2YWx1YXRlTmFtZTogdXNlIG5hbWUgcmVsYXRpdmUgdG8gcGFyZW50IGNvbnRhaW5lclxuXHRcdFx0ZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UgPSBhd2FpdCBzZXNzaW9uLmRhdGFCcmVha3BvaW50SW5mbyhcblx0XHRcdFx0ZXhwcmVzc2lvbi5uYW1lLFxuXHRcdFx0XHRleHByZXNzaW9uLnBhcmVudC5yZWZlcmVuY2UsXG5cdFx0XHRcdHN0YWNrRnJhbWU/LmZyYW1lSWRcblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEV4cHJlc3Npb24gd2l0aG91dCBldmFsdWF0ZU5hbWU6IHVzZSBuYW1lIGFzIHRoZSBleHByZXNzaW9uIHRvIGV2YWx1YXRlXG5cdFx0XHRkYXRhQnJlYWtwb2ludEluZm9SZXNwb25zZSA9IGF3YWl0IHNlc3Npb24uZGF0YUJyZWFrcG9pbnRJbmZvKFxuXHRcdFx0XHRleHByZXNzaW9uLm5hbWUsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0c3RhY2tGcmFtZT8uZnJhbWVJZFxuXHRcdFx0KTtcblx0XHR9XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0Ly8gc2lsZW50bHkgY29udGludWUgd2l0aG91dCBkYXRhIGJyZWFrcG9pbnQgc3VwcG9ydCBmb3IgdGhpcyBpdGVtXG5cdFx0bG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIGdldCBkYXRhIGJyZWFrcG9pbnQgaW5mbyBmb3Igd2F0Y2ggZXhwcmVzc2lvbjonLCBlcnJvcik7XG5cdH1cblxuXHRjb25zdCBkYXRhQnJlYWtwb2ludElkID0gZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2U/LmRhdGFJZDtcblx0Y29uc3QgZGF0YUJyZWFrcG9pbnRBY2Nlc3NUeXBlcyA9IGRhdGFCcmVha3BvaW50SW5mb1Jlc3BvbnNlPy5hY2Nlc3NUeXBlcztcblx0c2V0RGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UoZGF0YUJyZWFrcG9pbnRJbmZvUmVzcG9uc2UpO1xuXG5cdGlmICghZGF0YUJyZWFrcG9pbnRBY2Nlc3NUeXBlcykge1xuXHRcdGNvbnRleHRLZXlzLnB1c2goW0NPTlRFWFRfQlJFQUtfV0hFTl9WQUxVRV9DSEFOR0VTX1NVUFBPUlRFRC5rZXksICEhZGF0YUJyZWFrcG9pbnRJZF0pO1xuXHR9IGVsc2Uge1xuXHRcdGZvciAoY29uc3QgYWNjZXNzVHlwZSBvZiBkYXRhQnJlYWtwb2ludEFjY2Vzc1R5cGVzKSB7XG5cdFx0XHRzd2l0Y2ggKGFjY2Vzc1R5cGUpIHtcblx0XHRcdFx0Y2FzZSAncmVhZCc6XG5cdFx0XHRcdFx0Y29udGV4dEtleXMucHVzaChbQ09OVEVYVF9CUkVBS19XSEVOX1ZBTFVFX0lTX1JFQURfU1VQUE9SVEVELmtleSwgISFkYXRhQnJlYWtwb2ludElkXSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3dyaXRlJzpcblx0XHRcdFx0XHRjb250ZXh0S2V5cy5wdXNoKFtDT05URVhUX0JSRUFLX1dIRU5fVkFMVUVfQ0hBTkdFU19TVVBQT1JURUQua2V5LCAhIWRhdGFCcmVha3BvaW50SWRdKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAncmVhZFdyaXRlJzpcblx0XHRcdFx0XHRjb250ZXh0S2V5cy5wdXNoKFtDT05URVhUX0JSRUFLX1dIRU5fVkFMVUVfSVNfQUNDRVNTRURfU1VQUE9SVEVELmtleSwgISFkYXRhQnJlYWtwb2ludElkXSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGdldENvbnRleHRGb3JXYXRjaEV4cHJlc3Npb25NZW51KHBhcmVudENvbnRleHQsIGV4cHJlc3Npb24sIGNvbnRleHRLZXlzKTtcbn1cblxuXG5jbGFzcyBXYXRjaEV4cHJlc3Npb25zQWNjZXNzaWJpbGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8SUV4cHJlc3Npb24+IHtcblxuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoeyBjb21tZW50OiBbJ0RlYnVnIGlzIGEgbm91biBpbiB0aGlzIGNvbnRleHQsIG5vdCBhIHZlcmIuJ10sIGtleTogJ3dhdGNoQXJpYVRyZWVMYWJlbCcgfSwgXCJEZWJ1ZyBXYXRjaCBFeHByZXNzaW9uc1wiKTtcblx0fVxuXG5cdGdldEFyaWFMYWJlbChlbGVtZW50OiBJRXhwcmVzc2lvbik6IHN0cmluZyB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBFeHByZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3dhdGNoRXhwcmVzc2lvbkFyaWFMYWJlbCcsIFwiezB9LCB2YWx1ZSB7MX1cIiwgZWxlbWVudC5uYW1lLCBlbGVtZW50LnZhbHVlKTtcblx0XHR9XG5cblx0XHQvLyBWYXJpYWJsZVxuXHRcdHJldHVybiBsb2NhbGl6ZSgnd2F0Y2hWYXJpYWJsZUFyaWFMYWJlbCcsIFwiezB9LCB2YWx1ZSB7MX1cIiwgZWxlbWVudC5uYW1lLCBlbGVtZW50LnZhbHVlKTtcblx0fVxufVxuXG5jbGFzcyBXYXRjaEV4cHJlc3Npb25zRHJhZ0FuZERyb3AgaW1wbGVtZW50cyBJVHJlZURyYWdBbmREcm9wPElFeHByZXNzaW9uPiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UpIHsgfVxuXHRvbkRyYWdTdGFydD8oZGF0YTogSURyYWdBbmREcm9wRGF0YSwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGRhdGEgaW5zdGFuY2VvZiBFbGVtZW50c0RyYWdBbmREcm9wRGF0YSkge1xuXHRcdFx0b3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIhLnNldERhdGEoJ3RleHQvcGxhaW4nLCBkYXRhLmVsZW1lbnRzWzBdLm5hbWUpO1xuXHRcdH1cblx0fVxuXG5cdG9uRHJhZ092ZXIoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0RWxlbWVudDogSUV4cHJlc3Npb24gfCB1bmRlZmluZWQsIHRhcmdldEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQsIHRhcmdldFNlY3RvcjogTGlzdFZpZXdUYXJnZXRTZWN0b3IgfCB1bmRlZmluZWQsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IGJvb2xlYW4gfCBJVHJlZURyYWdPdmVyUmVhY3Rpb24ge1xuXHRcdGlmICghKGRhdGEgaW5zdGFuY2VvZiBFbGVtZW50c0RyYWdBbmREcm9wRGF0YSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBleHByZXNzaW9ucyA9IChkYXRhIGFzIEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhPElFeHByZXNzaW9uPikuZWxlbWVudHM7XG5cdFx0aWYgKCEoZXhwcmVzc2lvbnMubGVuZ3RoID4gMCAmJiBleHByZXNzaW9uc1swXSBpbnN0YW5jZW9mIEV4cHJlc3Npb24pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bGV0IGRyb3BFZmZlY3RQb3NpdGlvbjogTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRhcmdldEluZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIEhvdmVyaW5nIG92ZXIgdGhlIGxpc3Rcblx0XHRcdGRyb3BFZmZlY3RQb3NpdGlvbiA9IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLkFmdGVyO1xuXHRcdFx0dGFyZ2V0SW5kZXggPSAtMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gSG92ZXJpbmcgb3ZlciBhbiBlbGVtZW50XG5cdFx0XHRzd2l0Y2ggKHRhcmdldFNlY3Rvcikge1xuXHRcdFx0XHRjYXNlIExpc3RWaWV3VGFyZ2V0U2VjdG9yLlRPUDpcblx0XHRcdFx0Y2FzZSBMaXN0Vmlld1RhcmdldFNlY3Rvci5DRU5URVJfVE9QOlxuXHRcdFx0XHRcdGRyb3BFZmZlY3RQb3NpdGlvbiA9IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLkJlZm9yZTsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgTGlzdFZpZXdUYXJnZXRTZWN0b3IuQ0VOVEVSX0JPVFRPTTpcblx0XHRcdFx0Y2FzZSBMaXN0Vmlld1RhcmdldFNlY3Rvci5CT1RUT006XG5cdFx0XHRcdFx0ZHJvcEVmZmVjdFBvc2l0aW9uID0gTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24uQWZ0ZXI7IGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IGFjY2VwdDogdHJ1ZSwgZWZmZWN0OiB7IHR5cGU6IExpc3REcmFnT3ZlckVmZmVjdFR5cGUuTW92ZSwgcG9zaXRpb246IGRyb3BFZmZlY3RQb3NpdGlvbiB9LCBmZWVkYmFjazogW3RhcmdldEluZGV4XSB9IHNhdGlzZmllcyBJVHJlZURyYWdPdmVyUmVhY3Rpb247XG5cdH1cblxuXHRnZXREcmFnVVJJKGVsZW1lbnQ6IElFeHByZXNzaW9uKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKCEoZWxlbWVudCBpbnN0YW5jZW9mIEV4cHJlc3Npb24pIHx8IGVsZW1lbnQgPT09IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmdldFNlbGVjdGVkRXhwcmVzc2lvbigpPy5leHByZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWxlbWVudC5nZXRJZCgpO1xuXHR9XG5cblx0Z2V0RHJhZ0xhYmVsKGVsZW1lbnRzOiBJRXhwcmVzc2lvbltdKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZWxlbWVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudHNbMF0ubmFtZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZHJvcChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRFbGVtZW50OiBJRXhwcmVzc2lvbiwgdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCEoZGF0YSBpbnN0YW5jZW9mIEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRyYWdnZWRFbGVtZW50ID0gKGRhdGEgYXMgRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8SUV4cHJlc3Npb24+KS5lbGVtZW50c1swXTtcblx0XHRpZiAoIShkcmFnZ2VkRWxlbWVudCBpbnN0YW5jZW9mIEV4cHJlc3Npb24pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZHJhZ2dlZCBlbGVtZW50Jyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2F0Y2hlcyA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0V2F0Y2hFeHByZXNzaW9ucygpO1xuXHRcdGNvbnN0IHNvdXJjZVBvc2l0aW9uID0gd2F0Y2hlcy5pbmRleE9mKGRyYWdnZWRFbGVtZW50KTtcblxuXHRcdGxldCB0YXJnZXRQb3NpdGlvbjtcblx0XHRpZiAodGFyZ2V0RWxlbWVudCBpbnN0YW5jZW9mIEV4cHJlc3Npb24pIHtcblx0XHRcdHRhcmdldFBvc2l0aW9uID0gd2F0Y2hlcy5pbmRleE9mKHRhcmdldEVsZW1lbnQpO1xuXG5cdFx0XHRzd2l0Y2ggKHRhcmdldFNlY3Rvcikge1xuXHRcdFx0XHRjYXNlIExpc3RWaWV3VGFyZ2V0U2VjdG9yLkJPVFRPTTpcblx0XHRcdFx0Y2FzZSBMaXN0Vmlld1RhcmdldFNlY3Rvci5DRU5URVJfQk9UVE9NOlxuXHRcdFx0XHRcdHRhcmdldFBvc2l0aW9uKys7IGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc291cmNlUG9zaXRpb24gPCB0YXJnZXRQb3NpdGlvbikge1xuXHRcdFx0XHR0YXJnZXRQb3NpdGlvbi0tO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0YXJnZXRQb3NpdGlvbiA9IHdhdGNoZXMubGVuZ3RoIC0gMTtcblx0XHR9XG5cblx0XHR0aGlzLmRlYnVnU2VydmljZS5tb3ZlV2F0Y2hFeHByZXNzaW9uKGRyYWdnZWRFbGVtZW50LmdldElkKCksIHRhcmdldFBvc2l0aW9uKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7IH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENvbGxhcHNlIGV4dGVuZHMgVmlld0FjdGlvbjxXYXRjaEV4cHJlc3Npb25zVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dhdGNoLmNvbGxhcHNlJyxcblx0XHRcdHZpZXdJZDogV0FUQ0hfVklFV19JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29sbGFwc2UnLCBcIkNvbGxhcHNlIEFsbFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGljb246IENvZGljb24uY29sbGFwc2VBbGwsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfV0FUQ0hfRVhQUkVTU0lPTlNfRVhJU1QsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRvcmRlcjogMzAsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFdBVENIX1ZJRVdfSUQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW5JblZpZXcoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBXYXRjaEV4cHJlc3Npb25zVmlldykge1xuXHRcdHZpZXcuY29sbGFwc2VBbGwoKTtcblx0fVxufSk7XG5cbmV4cG9ydCBjb25zdCBBRERfV0FUQ0hfSUQgPSAnd29ya2JlbmNoLmRlYnVnLnZpZXdsZXQuYWN0aW9uLmFkZFdhdGNoRXhwcmVzc2lvbic7IC8vIFVzZSBvbGQgYW5kIGxvbmcgaWQgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG5leHBvcnQgY29uc3QgQUREX1dBVENIX0xBQkVMID0gbG9jYWxpemUoJ2FkZFdhdGNoRXhwcmVzc2lvbicsIFwiQWRkIEV4cHJlc3Npb25cIik7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBBZGRXYXRjaEV4cHJlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFERF9XQVRDSF9JRCxcblx0XHRcdHRpdGxlOiBBRERfV0FUQ0hfTEFCRUwsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRpY29uOiB3YXRjaEV4cHJlc3Npb25zQWRkLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgV0FUQ0hfVklFV19JRClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGRlYnVnU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVidWdTZXJ2aWNlKTtcblx0XHRkZWJ1Z1NlcnZpY2UuYWRkV2F0Y2hFeHByZXNzaW9uKCk7XG5cdH1cbn0pO1xuXG5leHBvcnQgY29uc3QgUkVNT1ZFX1dBVENIX0VYUFJFU1NJT05TX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmRlYnVnLnZpZXdsZXQuYWN0aW9uLnJlbW92ZUFsbFdhdGNoRXhwcmVzc2lvbnMnO1xuZXhwb3J0IGNvbnN0IFJFTU9WRV9XQVRDSF9FWFBSRVNTSU9OU19MQUJFTCA9IGxvY2FsaXplKCdyZW1vdmVBbGxXYXRjaEV4cHJlc3Npb25zJywgXCJSZW1vdmUgQWxsIEV4cHJlc3Npb25zXCIpO1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlbW92ZUFsbFdhdGNoRXhwcmVzc2lvbnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFJFTU9WRV9XQVRDSF9FWFBSRVNTSU9OU19DT01NQU5EX0lELCAvLyBVc2Ugb2xkIGFuZCBsb25nIGlkIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuXHRcdFx0dGl0bGU6IFJFTU9WRV9XQVRDSF9FWFBSRVNTSU9OU19MQUJFTCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGljb246IHdhdGNoRXhwcmVzc2lvbnNSZW1vdmVBbGwsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfV0FUQ0hfRVhQUkVTU0lPTlNfRVhJU1QsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRvcmRlcjogMjAsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFdBVENIX1ZJRVdfSUQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0ZGVidWdTZXJ2aWNlLnJlbW92ZVdhdGNoRXhwcmVzc2lvbnMoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDb3B5RXhwcmVzc2lvbiBleHRlbmRzIFZpZXdBY3Rpb248V2F0Y2hFeHByZXNzaW9uc1ZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENPUFlfV0FUQ0hfRVhQUkVTU0lPTl9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjb3B5V2F0Y2hFeHByZXNzaW9uJywgXCJDb3B5IEV4cHJlc3Npb25cIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHR2aWV3SWQ6IFdBVENIX1ZJRVdfSUQsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfV0FUQ0hfRVhQUkVTU0lPTlNfRVhJU1QsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5Qyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRGb2N1c2VkVmlld0NvbnRleHQuaXNFcXVhbFRvKFdBVENIX1ZJRVdfSUQpLFxuXHRcdFx0XHRcdENPTlRFWFRfRVhQUkVTU0lPTl9TRUxFQ1RFRC5uZWdhdGUoKSxcblx0XHRcdFx0KSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdXYXRjaENvbnRleHQsXG5cdFx0XHRcdG9yZGVyOiAyMCxcblx0XHRcdFx0Z3JvdXA6ICczX21vZGlmaWNhdGlvbicsXG5cdFx0XHRcdHdoZW46IENPTlRFWFRfV0FUQ0hfSVRFTV9UWVBFLmlzRXF1YWxUbygnZXhwcmVzc2lvbicpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW5JblZpZXcoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFdhdGNoRXhwcmVzc2lvbnNWaWV3LCB2YWx1ZT86IElFeHByZXNzaW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0dmFsdWUgPSB2aWV3LnRyZWVTZWxlY3Rpb24uYXQoLTEpO1xuXHRcdH1cblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHZhbHVlLm5hbWUpO1xuXHRcdH1cblx0fVxufSk7XG5cbmV4cG9ydCBjb25zdCBDT1BZX0FMTF9XQVRDSF9FWFBSRVNTSU9OU19DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5kZWJ1Zy52aWV3bGV0LmFjdGlvbi5jb3B5QWxsV2F0Y2hFeHByZXNzaW9ucyc7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDb3B5QWxsV2F0Y2hFeHByZXNzaW9ucyBleHRlbmRzIFZpZXdBY3Rpb248V2F0Y2hFeHByZXNzaW9uc1ZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENPUFlfQUxMX1dBVENIX0VYUFJFU1NJT05TX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NvcHlBbGxXYXRjaEV4cHJlc3Npb25zJywgXCJDb3B5IEFsbFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHZpZXdJZDogV0FUQ0hfVklFV19JRCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9XQVRDSF9FWFBSRVNTSU9OU19FWElTVCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z1dhdGNoQ29udGV4dCxcblx0XHRcdFx0b3JkZXI6IDQ1LFxuXHRcdFx0XHRncm91cDogJzNfbW9kaWZpY2F0aW9uJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuSW5WaWV3KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IHdhdGNoZXMgPSBkZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRXYXRjaEV4cHJlc3Npb25zKCk7XG5cdFx0Y29uc3QgbGluZXMgPSB3YXRjaGVzLm1hcCh3ID0+IGAke3cubmFtZX06ICR7dy52YWx1ZX1gKTtcblx0XHRjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChsaW5lcy5qb2luKCdcXG4nKSk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFRQSxTQUErQiw0QkFBNEIsOEJBQThCO0FBQ3pGLFNBQVMseUJBQXlCLDRCQUE0QjtBQUc5RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWU7QUFFeEIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBOEI7QUFDdkMsU0FBUyxTQUFTLGNBQWMsUUFBUSx1QkFBdUI7QUFDL0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBNkIsMEJBQTBCO0FBQ2hFLFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUErQztBQUN4RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLFlBQVksZ0JBQWdCO0FBRXJDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMseUJBQXlCLDZCQUE2Qiw4QkFBOEIsdUJBQXVCLGlDQUFpQyxtQ0FBbUMseUJBQThDLGVBQXFELDRDQUE0QyxnREFBZ0QsNENBQTRDLHdDQUF3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
